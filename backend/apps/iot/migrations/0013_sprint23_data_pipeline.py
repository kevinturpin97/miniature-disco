"""Sprint 23 — Data Pipeline & Long-Term History.

Adds SensorReadingDaily, RetentionPolicy, DataArchiveLog models,
and configures PostgreSQL partitioning for SensorReading by month.
"""

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0001_create_organization_models"),
        ("iot", "0012_sprint20_ai_predictions"),
    ]

    operations = [
        # --- SensorReadingDaily ---
        migrations.CreateModel(
            name="SensorReadingDaily",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField(help_text="The calendar date for this bucket")),
                ("avg_value", models.FloatField()),
                ("min_value", models.FloatField()),
                ("max_value", models.FloatField()),
                ("stddev_value", models.FloatField(default=0.0)),
                ("count", models.PositiveIntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("sensor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="daily_readings", to="iot.sensor")),
            ],
            options={
                "ordering": ["-date"],
                "unique_together": {("sensor", "date")},
                "indexes": [
                    models.Index(fields=["sensor", "-date"], name="iot_sensorrea_sensor__daily_idx"),
                ],
            },
        ),
        # --- RetentionPolicy ---
        migrations.CreateModel(
            name="RetentionPolicy",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("raw_retention_days", models.PositiveIntegerField(default=30, help_text="Days to keep raw SensorReading data (0 = forever)")),
                ("hourly_retention_days", models.PositiveIntegerField(default=365, help_text="Days to keep hourly aggregated data (0 = forever)")),
                ("daily_retention_days", models.PositiveIntegerField(default=0, help_text="Days to keep daily aggregated data (0 = forever)")),
                ("archive_to_cold_storage", models.BooleanField(default=False, help_text="Whether to archive data to S3/MinIO before deletion")),
                ("cold_storage_bucket", models.CharField(blank=True, help_text="S3/MinIO bucket name for cold storage archival", max_length=255)),
                ("cold_storage_prefix", models.CharField(blank=True, default="greenhouse-archive/", help_text="Key prefix within the bucket", max_length=255)),
                ("last_cleanup_at", models.DateTimeField(blank=True, null=True)),
                ("last_archive_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="retention_policy", to="api.organization")),
            ],
            options={
                "verbose_name_plural": "retention policies",
            },
        ),
        # --- DataArchiveLog ---
        migrations.CreateModel(
            name="DataArchiveLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("archive_type", models.CharField(choices=[("RAW", "Raw Readings"), ("HOURLY", "Hourly Readings")], max_length=10)),
                ("status", models.CharField(choices=[("STARTED", "Started"), ("COMPLETED", "Completed"), ("FAILED", "Failed")], default="STARTED", max_length=10)),
                ("records_archived", models.PositiveIntegerField(default=0)),
                ("records_deleted", models.PositiveIntegerField(default=0)),
                ("date_range_start", models.DateTimeField(help_text="Start of archived date range")),
                ("date_range_end", models.DateTimeField(help_text="End of archived date range")),
                ("storage_path", models.CharField(blank=True, help_text="S3/MinIO path where data was archived", max_length=500)),
                ("error_message", models.TextField(blank=True)),
                ("started_at", models.DateTimeField(auto_now_add=True)),
                ("completed_at", models.DateTimeField(null=True, blank=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="archive_logs", to="api.organization")),
            ],
            options={
                "ordering": ["-started_at"],
            },
        ),
        # --- PostgreSQL Partitioning for SensorReading ---
        # Create a function for partition management (creation / cleanup).
        # NOTE: Inheritance-based insert triggers are intentionally omitted
        # because BEFORE INSERT triggers that RETURN NULL break Django ORM's
        # RETURNING clause.  Instead, inserts land on the parent table and a
        # periodic Celery task can move old data into monthly partitions.
        migrations.RunSQL(
            sql="""
            -- Create function to auto-create monthly partitions for SensorReading
            CREATE OR REPLACE FUNCTION create_sensor_reading_partition()
            RETURNS void AS $$
            DECLARE
                partition_date DATE;
                partition_name TEXT;
                start_date DATE;
                end_date DATE;
            BEGIN
                -- Create partitions for the current month and next 2 months
                FOR i IN 0..2 LOOP
                    partition_date := date_trunc('month', CURRENT_DATE + (i || ' months')::interval)::date;
                    partition_name := 'iot_sensorreading_' || to_char(partition_date, 'YYYY_MM');
                    start_date := partition_date;
                    end_date := (partition_date + interval '1 month')::date;

                    -- Check if partition already exists
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_tables
                        WHERE tablename = partition_name
                        AND schemaname = 'public'
                    ) THEN
                        EXECUTE format(
                            'CREATE TABLE IF NOT EXISTS %I (
                                LIKE iot_sensorreading INCLUDING ALL
                            ) INHERITS (iot_sensorreading)',
                            partition_name
                        );
                        EXECUTE format(
                            'ALTER TABLE %I ADD CONSTRAINT %I CHECK (received_at >= %L AND received_at < %L)',
                            partition_name,
                            partition_name || '_check',
                            start_date,
                            end_date
                        );
                        -- Add indexes on the partition
                        EXECUTE format(
                            'CREATE INDEX IF NOT EXISTS %I ON %I (sensor_id, received_at DESC)',
                            partition_name || '_sensor_received_idx',
                            partition_name
                        );
                        EXECUTE format(
                            'CREATE INDEX IF NOT EXISTS %I ON %I (received_at DESC)',
                            partition_name || '_received_idx',
                            partition_name
                        );
                        RAISE NOTICE 'Created partition: %', partition_name;
                    END IF;
                END LOOP;
            END;
            $$ LANGUAGE plpgsql;

            -- Enable constraint exclusion for faster partition queries
            SET constraint_exclusion = partition;

            -- Create initial partitions
            SELECT create_sensor_reading_partition();
            """,
            reverse_sql="""
            DROP FUNCTION IF EXISTS create_sensor_reading_partition();
            """,
        ),
    ]
