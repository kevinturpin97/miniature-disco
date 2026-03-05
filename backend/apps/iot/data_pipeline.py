"""Data pipeline operations for Sprint 23.

Handles daily aggregation, retention policy enforcement, cold storage
archival, and partition management for the SensorReading table.
"""

from __future__ import annotations

import csv
import io
import logging
from datetime import timedelta
from typing import Any

from django.db import connection
from django.db.models import Avg, Count, Max, Min, StdDev
from django.db.models.functions import TruncDate
from django.utils import timezone

from .models import (
    DataArchiveLog,
    RetentionPolicy,
    Sensor,
    SensorReading,
    SensorReadingDaily,
    SensorReadingHourly,
)

logger = logging.getLogger(__name__)


def aggregate_daily_readings() -> dict[str, int]:
    """Aggregate raw sensor readings into daily buckets.

    Processes readings from the last 2 days. Uses INSERT ... ON CONFLICT
    (upsert) logic via update_or_create.

    Returns:
        Dict with ``sensors_processed`` and ``buckets_created`` counts.
    """
    now = timezone.now()
    since = now - timedelta(days=2)

    sensors = Sensor.objects.filter(is_active=True)
    sensors_processed = 0
    buckets_created = 0

    for sensor in sensors:
        daily_data = (
            SensorReading.objects.filter(
                sensor=sensor,
                received_at__gte=since,
            )
            .annotate(date_bucket=TruncDate("received_at"))
            .values("date_bucket")
            .annotate(
                avg_val=Avg("value"),
                min_val=Min("value"),
                max_val=Max("value"),
                stddev_val=StdDev("value"),
                cnt=Count("id"),
            )
            .order_by("date_bucket")
        )

        for bucket in daily_data:
            _, created = SensorReadingDaily.objects.update_or_create(
                sensor=sensor,
                date=bucket["date_bucket"],
                defaults={
                    "avg_value": bucket["avg_val"] or 0,
                    "min_value": bucket["min_val"] or 0,
                    "max_value": bucket["max_val"] or 0,
                    "stddev_value": bucket["stddev_val"] or 0,
                    "count": bucket["cnt"],
                },
            )
            if created:
                buckets_created += 1

        sensors_processed += 1

    return {"sensors_processed": sensors_processed, "buckets_created": buckets_created}


def enforce_retention_policies() -> dict[str, Any]:
    """Enforce data retention policies for all organizations.

    For each organization with a RetentionPolicy:
    - Delete raw readings older than raw_retention_days
    - Delete hourly aggregations older than hourly_retention_days
    - Delete daily aggregations older than daily_retention_days (if set)

    Returns:
        Dict with per-org deletion statistics.
    """
    now = timezone.now()
    results: dict[str, Any] = {"organizations_processed": 0, "details": []}

    policies = RetentionPolicy.objects.select_related("organization").all()

    for policy in policies:
        org = policy.organization
        org_result = {
            "organization": org.name,
            "raw_deleted": 0,
            "hourly_deleted": 0,
            "daily_deleted": 0,
        }

        # Get zone IDs for this org
        zone_ids = list(
            org.greenhouses.values_list("zones__id", flat=True).distinct()
        )
        if not zone_ids:
            continue

        sensor_ids = list(
            Sensor.objects.filter(zone_id__in=zone_ids).values_list("id", flat=True)
        )
        if not sensor_ids:
            continue

        # Enforce raw reading retention
        if policy.raw_retention_days > 0:
            cutoff = now - timedelta(days=policy.raw_retention_days)
            deleted_count, _ = (
                SensorReading.objects.filter(
                    sensor_id__in=sensor_ids,
                    received_at__lt=cutoff,
                )
                .delete()
            )
            org_result["raw_deleted"] = deleted_count

        # Enforce hourly aggregation retention
        if policy.hourly_retention_days > 0:
            cutoff = now - timedelta(days=policy.hourly_retention_days)
            deleted_count, _ = (
                SensorReadingHourly.objects.filter(
                    sensor_id__in=sensor_ids,
                    hour__lt=cutoff,
                )
                .delete()
            )
            org_result["hourly_deleted"] = deleted_count

        # Enforce daily aggregation retention
        if policy.daily_retention_days > 0:
            cutoff_date = (now - timedelta(days=policy.daily_retention_days)).date()
            deleted_count, _ = (
                SensorReadingDaily.objects.filter(
                    sensor_id__in=sensor_ids,
                    date__lt=cutoff_date,
                )
                .delete()
            )
            org_result["daily_deleted"] = deleted_count

        # Update last cleanup timestamp
        policy.last_cleanup_at = now
        policy.save(update_fields=["last_cleanup_at"])

        results["details"].append(org_result)
        results["organizations_processed"] += 1

        logger.info(
            "Retention enforced for org=%s: raw=%d hourly=%d daily=%d",
            org.slug,
            org_result["raw_deleted"],
            org_result["hourly_deleted"],
            org_result["daily_deleted"],
        )

    return results


def archive_to_cold_storage(policy: RetentionPolicy) -> dict[str, Any]:
    """Archive expired data to S3/MinIO before deletion.

    Exports raw sensor readings that are about to be deleted into
    CSV files and uploads them to the configured S3/MinIO bucket.

    Args:
        policy: The RetentionPolicy with cold storage configuration.

    Returns:
        Dict with archival statistics.
    """
    if not policy.archive_to_cold_storage or not policy.cold_storage_bucket:
        return {"archived": False, "reason": "Cold storage not configured"}

    try:
        import boto3
    except ImportError:
        logger.error("boto3 is required for cold storage archival")
        return {"archived": False, "reason": "boto3 not installed"}

    org = policy.organization
    now = timezone.now()

    # Determine date range to archive
    if policy.raw_retention_days == 0:
        return {"archived": False, "reason": "No retention limit set"}

    cutoff = now - timedelta(days=policy.raw_retention_days)
    # Archive data older than cutoff (that's about to be deleted)
    # Look back an additional 30 days for archival
    archive_start = cutoff - timedelta(days=30)

    zone_ids = list(
        org.greenhouses.values_list("zones__id", flat=True).distinct()
    )
    sensor_ids = list(
        Sensor.objects.filter(zone_id__in=zone_ids).values_list("id", flat=True)
    )

    if not sensor_ids:
        return {"archived": False, "reason": "No sensors found"}

    readings = (
        SensorReading.objects.filter(
            sensor_id__in=sensor_ids,
            received_at__gte=archive_start,
            received_at__lt=cutoff,
        )
        .select_related("sensor", "sensor__zone")
        .order_by("received_at")
    )

    total_count = readings.count()
    if total_count == 0:
        return {"archived": False, "reason": "No data to archive"}

    # Create archive log entry
    archive_log = DataArchiveLog.objects.create(
        organization=org,
        archive_type=DataArchiveLog.ArchiveType.RAW_READINGS,
        date_range_start=archive_start,
        date_range_end=cutoff,
    )

    try:
        # Generate CSV in memory
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            "id", "sensor_id", "sensor_type", "zone_name",
            "value", "relay_timestamp", "received_at",
        ])

        batch_size = 10000
        records_written = 0

        for reading in readings.iterator(chunk_size=batch_size):
            writer.writerow([
                reading.id,
                reading.sensor_id,
                reading.sensor.sensor_type,
                reading.sensor.zone.name,
                reading.value,
                reading.relay_timestamp.isoformat() if reading.relay_timestamp else "",
                reading.received_at.isoformat(),
            ])
            records_written += 1

        # Upload to S3/MinIO
        s3_client = boto3.client("s3")
        timestamp_str = now.strftime("%Y%m%d_%H%M%S")
        s3_key = (
            f"{policy.cold_storage_prefix}"
            f"{org.slug}/"
            f"raw_readings_{archive_start.strftime('%Y%m%d')}_"
            f"{cutoff.strftime('%Y%m%d')}_{timestamp_str}.csv"
        )

        csv_bytes = buffer.getvalue().encode("utf-8")
        s3_client.put_object(
            Bucket=policy.cold_storage_bucket,
            Key=s3_key,
            Body=csv_bytes,
            ContentType="text/csv",
        )

        # Update archive log
        archive_log.status = DataArchiveLog.Status.COMPLETED
        archive_log.records_archived = records_written
        archive_log.storage_path = f"s3://{policy.cold_storage_bucket}/{s3_key}"
        archive_log.completed_at = timezone.now()
        archive_log.save()

        # Update policy timestamp
        policy.last_archive_at = now
        policy.save(update_fields=["last_archive_at"])

        logger.info(
            "Archived %d readings for org=%s to %s",
            records_written,
            org.slug,
            archive_log.storage_path,
        )

        return {
            "archived": True,
            "records": records_written,
            "storage_path": archive_log.storage_path,
        }

    except Exception as exc:
        archive_log.status = DataArchiveLog.Status.FAILED
        archive_log.error_message = str(exc)
        archive_log.completed_at = timezone.now()
        archive_log.save()
        logger.error("Cold storage archival failed for org=%s: %s", org.slug, exc)
        return {"archived": False, "reason": str(exc)}


def ensure_partitions() -> dict[str, int]:
    """Ensure monthly partitions exist for the current and next 2 months.

    Calls the PostgreSQL function ``create_sensor_reading_partition()``
    installed by the migration.

    Returns:
        Dict with partition management status.
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT create_sensor_reading_partition();")
        logger.info("Partition maintenance completed successfully")
        return {"status": "ok"}
    except Exception as exc:
        logger.error("Partition maintenance failed: %s", exc)
        return {"status": "error", "error": str(exc)}


def drop_old_partitions(months_to_keep: int = 6) -> dict[str, Any]:
    """Drop partitions older than N months (for data already archived/deleted).

    Only drops partitions that are completely outside the retention window.
    Data should be archived before calling this function.

    Args:
        months_to_keep: Number of months of partitions to keep.

    Returns:
        Dict with dropped partition info.
    """
    cutoff_date = (timezone.now() - timedelta(days=months_to_keep * 30)).strftime("%Y_%m")
    dropped = []

    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT tablename FROM pg_tables
                WHERE schemaname = 'public'
                AND tablename LIKE 'iot_sensorreading_____\\___'
                ORDER BY tablename
            """)
            partitions = [row[0] for row in cursor.fetchall()]

            for partition in partitions:
                # Extract YYYY_MM from partition name
                parts = partition.replace("iot_sensorreading_", "")
                if parts < cutoff_date:
                    # Check if partition is empty or all data is old enough
                    cursor.execute(f"SELECT COUNT(*) FROM {partition}")
                    count = cursor.fetchone()[0]

                    if count == 0:
                        cursor.execute(f"DROP TABLE IF EXISTS {partition}")
                        dropped.append({"partition": partition, "records": 0})
                        logger.info("Dropped empty partition: %s", partition)
                    else:
                        logger.info(
                            "Skipping non-empty partition %s (%d records)",
                            partition,
                            count,
                        )

    except Exception as exc:
        logger.error("Failed to drop old partitions: %s", exc)
        return {"status": "error", "error": str(exc)}

    return {"status": "ok", "dropped": dropped}


def get_partition_info() -> list[dict[str, Any]]:
    """Get information about existing SensorReading partitions.

    Returns:
        List of dicts with partition name, row count, and size.
    """
    partitions = []

    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT
                    c.relname AS partition_name,
                    pg_total_relation_size(c.oid) AS total_size,
                    (SELECT COUNT(*) FROM pg_stats WHERE tablename = c.relname) AS stat_columns
                FROM pg_inherits i
                JOIN pg_class c ON c.oid = i.inhrelid
                JOIN pg_class p ON p.oid = i.inhparent
                WHERE p.relname = 'iot_sensorreading'
                ORDER BY c.relname
            """)

            for row in cursor.fetchall():
                partition_name = row[0]
                total_size = row[1]

                # Get actual row count
                cursor.execute(f"SELECT COUNT(*) FROM {partition_name}")
                row_count = cursor.fetchone()[0]

                partitions.append({
                    "name": partition_name,
                    "row_count": row_count,
                    "size_bytes": total_size,
                    "size_human": _format_bytes(total_size),
                })

    except Exception as exc:
        logger.error("Failed to get partition info: %s", exc)

    return partitions


def _format_bytes(size: int) -> str:
    """Format byte size to human-readable string."""
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} PB"


def lttb_downsample(data: list[dict], target_points: int) -> list[dict]:
    """Largest Triangle Three Buckets (LTTB) downsampling algorithm.

    Reduces a large time-series dataset to a target number of points
    while preserving the visual shape of the data.

    Server-side implementation for API consumers. The frontend also
    has its own TypeScript implementation for client-side downsampling.

    Args:
        data: List of dicts with 'timestamp' (numeric) and 'value' (float) keys.
        target_points: Desired number of output points.

    Returns:
        Downsampled list of dicts.
    """
    n = len(data)
    if n <= target_points or target_points < 3:
        return data

    # Always include first and last points
    sampled = [data[0]]

    # Bucket size
    bucket_size = (n - 2) / (target_points - 2)

    a_index = 0  # Index of previously selected point

    for i in range(1, target_points - 1):
        # Calculate bucket range
        bucket_start = int((i - 1) * bucket_size) + 1
        bucket_end = int(i * bucket_size) + 1
        bucket_end = min(bucket_end, n - 1)

        # Calculate next bucket average
        next_bucket_start = int(i * bucket_size) + 1
        next_bucket_end = int((i + 1) * bucket_size) + 1
        next_bucket_end = min(next_bucket_end, n)

        avg_x = 0.0
        avg_y = 0.0
        next_count = next_bucket_end - next_bucket_start
        if next_count > 0:
            for j in range(next_bucket_start, next_bucket_end):
                avg_x += data[j]["timestamp"]
                avg_y += data[j]["value"]
            avg_x /= next_count
            avg_y /= next_count

        # Find the point in current bucket with largest triangle area
        max_area = -1.0
        max_index = bucket_start

        point_a_x = data[a_index]["timestamp"]
        point_a_y = data[a_index]["value"]

        for j in range(bucket_start, bucket_end):
            area = abs(
                (point_a_x - avg_x) * (data[j]["value"] - point_a_y)
                - (point_a_x - data[j]["timestamp"]) * (avg_y - point_a_y)
            ) * 0.5

            if area > max_area:
                max_area = area
                max_index = j

        sampled.append(data[max_index])
        a_index = max_index

    sampled.append(data[-1])
    return sampled
