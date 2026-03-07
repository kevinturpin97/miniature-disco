#!/usr/bin/env python3
"""Inject a simulated sensor reading directly into the MQTT broker.

Simulates what the lora-bridge would publish after receiving a LoRa frame,
allowing end-to-end testing of the data pipeline without any hardware.

Usage:
    python scripts/inject_reading.py
    python scripts/inject_reading.py --gateway-id <UUID> --relay-id 1
    python scripts/inject_reading.py --relay-id 1 --temp 25.5 --hum 70.0 --loop 10
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("ERROR: paho-mqtt not installed. Run: pip install paho-mqtt")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
LORA_BRIDGE_ENV = ROOT / "lora-bridge" / ".env"


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            env[key.strip()] = val.strip()
    return env


def publish_once(
    client: mqtt.Client,
    gateway_id: str,
    relay_id: int,
    readings: list[dict],
    broker: str,
    port: int,
) -> None:
    topic = f"greenhouse/{gateway_id}/relay/{relay_id}/sensors"
    payload = json.dumps({"relay_id": relay_id, "readings": readings})
    result = client.publish(topic, payload, qos=1)
    if result.rc == mqtt.MQTT_ERR_SUCCESS:
        print(f"OK  → {topic}")
        for r in readings:
            print(f"     {r['sensor_type']:<12} = {r['value']}")
    else:
        print(f"FAIL (rc={result.rc}) → {topic}")


def main() -> None:
    env = load_env(LORA_BRIDGE_ENV)

    parser = argparse.ArgumentParser(
        description="Inject simulated sensor readings into MQTT (no hardware needed)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--gateway-id",
        default=env.get("GATEWAY_ID", ""),
        help="GATEWAY_ID UUID (reads from lora-bridge/.env by default)",
    )
    parser.add_argument("--relay-id", type=int, default=1, help="Zone relay_id (default: 1)")
    parser.add_argument("--broker", default=env.get("MQTT_HOST", "localhost"), help="MQTT broker host")
    parser.add_argument("--port", type=int, default=int(env.get("MQTT_PORT", "1883")), help="MQTT broker port")
    parser.add_argument("--temp", type=float, default=23.5, help="Temperature value °C (default: 23.5)")
    parser.add_argument("--hum", type=float, default=65.0, help="Air humidity %% (default: 65.0)")
    parser.add_argument("--loop", type=int, default=1, help="Number of messages to send (default: 1)")
    parser.add_argument("--interval", type=float, default=5.0, help="Seconds between messages when --loop > 1")
    args = parser.parse_args()

    if not args.gateway_id or args.gateway_id in ("default-gateway", ""):
        print("ERROR: GATEWAY_ID not set.")
        print("  Run: python scripts/setup_gateway.py")
        print("  Or:  python scripts/inject_reading.py --gateway-id <UUID>")
        sys.exit(1)

    readings = [
        {"sensor_type": "TEMP", "value": args.temp},
        {"sensor_type": "HUM_AIR", "value": args.hum},
    ]

    print(f"Broker     : {args.broker}:{args.port}")
    print(f"GATEWAY_ID : {args.gateway_id}")
    print(f"relay_id   : {args.relay_id}")
    print(f"Messages   : {args.loop}" + (f" × {args.interval}s" if args.loop > 1 else ""))
    print()

    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2, client_id="inject-tool")
    try:
        client.connect(args.broker, args.port, keepalive=10)
        client.loop_start()

        for i in range(args.loop):
            if args.loop > 1:
                print(f"[{i+1}/{args.loop}] ", end="")
            publish_once(client, args.gateway_id, args.relay_id, readings, args.broker, args.port)
            if i < args.loop - 1:
                time.sleep(args.interval)

    except OSError as exc:
        print(f"Connection failed: {exc}")
        print(f"Is the Docker stack running? (make up)")
        sys.exit(1)
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
