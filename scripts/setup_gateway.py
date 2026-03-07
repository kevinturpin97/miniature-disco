#!/usr/bin/env python3
"""Gateway setup utility.

Detects connected ESP/Arduino serial devices, generates a GATEWAY_ID UUID,
and updates lora-bridge/.env with the correct configuration.

Usage:
    python scripts/setup_gateway.py
    python scripts/setup_gateway.py --dry-run
    python scripts/setup_gateway.py --port /dev/ttyUSB0 --baud 115200
"""

from __future__ import annotations

import argparse
import re
import sys
import uuid
from pathlib import Path

try:
    import serial.tools.list_ports
except ImportError:
    print("ERROR: pyserial not installed. Run: pip install pyserial")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
LORA_BRIDGE_ENV = ROOT / "lora-bridge" / ".env"
LORA_BRIDGE_ENV_EXAMPLE = ROOT / "lora-bridge" / ".env.example"

# USB-serial chip signatures that identify ESP/Arduino devices
ESP_SIGNATURES = [
    "CP210",     # Silicon Labs CP2102/CP2104 (NodeMCU, ESP32, ESP8266)
    "CH340",     # Common clone chip (Arduino Nano clones, Wemos D1)
    "CH341",
    "FTDI",      # FTDI FT232 (older Arduinos, USB-Serial adapters)
    "FT232",
    "Arduino",
    "USB Serial",
    "usbmodem",  # macOS: Arduino Leonardo / Pro Micro (CDC ACM)
    "usbserial", # macOS: CP210x / FTDI
    "ttyUSB",    # Linux: generic USB-serial
    "ttyACM",    # Linux: CDC ACM
]

# Ports to silently exclude (macOS Bluetooth, etc.)
EXCLUDE_PORTS = {"/dev/tty.Bluetooth-Incoming-Port", "/dev/tty.debug-console"}

COMMON_BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 250000, 500000, 1000000]
DEFAULT_BAUD = 115200


# ── Port detection ────────────────────────────────────────────────


def detect_ports() -> tuple[list, list]:
    """Return (esp_ports, other_ports) sorted by likelihood of being an ESP."""
    all_ports = list(serial.tools.list_ports.comports())
    esp_ports, other_ports = [], []

    for port in all_ports:
        if port.device in EXCLUDE_PORTS:
            continue
        desc = " ".join(filter(None, [
            port.device,
            port.description or "",
            port.manufacturer or "",
            port.hwid or "",
        ]))
        if any(sig.lower() in desc.lower() for sig in ESP_SIGNATURES):
            esp_ports.append(port)
        else:
            other_ports.append(port)

    return esp_ports, other_ports


def choose_port(esp_ports: list, other_ports: list) -> str:
    """Interactively select a serial port."""
    all_ports = esp_ports + other_ports

    if not all_ports:
        print("No serial ports found. Is the device plugged in?")
        sys.exit(1)

    if len(all_ports) == 1:
        port = all_ports[0]
        tag = " (ESP/Arduino detected)" if port in esp_ports else ""
        print(f"Found: {port.device} — {port.description}{tag}")
        ans = input("Use this port? [Y/n] ").strip().lower()
        if ans in ("", "y", "yes"):
            return port.device
        sys.exit(0)

    print("\nDetected serial ports:\n")
    for i, port in enumerate(all_ports, 1):
        tag = "  ← ESP/Arduino" if port in esp_ports else ""
        print(f"  [{i}] {port.device:<30} {port.description or ''}{tag}")

    while True:
        choice = input(f"\nSelect port [1-{len(all_ports)}]: ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(all_ports):
            return all_ports[int(choice) - 1].device
        print("  Invalid choice, try again.")


# ── Baud rate selection ───────────────────────────────────────────


def choose_baud(current: str | None = None) -> int:
    """Interactively confirm or change the baud rate."""
    default = int(current) if current and current.isdigit() else DEFAULT_BAUD
    print(f"\nCommon baud rates: {', '.join(str(b) for b in COMMON_BAUDS)}")
    choice = input(f"Baud rate [{default}]: ").strip()
    if not choice:
        return default
    try:
        val = int(choice)
        return val
    except ValueError:
        print(f"  Invalid value, using {default}")
        return default


# ── .env file helpers ─────────────────────────────────────────────


def load_env(path: Path) -> dict[str, str]:
    """Parse a .env file into a {key: value} dict."""
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            env[key.strip()] = val.strip()
    return env


def update_env_file(path: Path, updates: dict[str, str]) -> None:
    """Update specific keys in a .env file, preserving all other content and comments."""
    if path.exists():
        content = path.read_text()
    else:
        content = ""

    for key, value in updates.items():
        pattern = rf"^{re.escape(key)}\s*=.*$"
        replacement = f"{key}={value}"
        if re.search(pattern, content, flags=re.MULTILINE):
            content = re.sub(pattern, replacement, content, flags=re.MULTILINE)
        else:
            # Append if key not present
            content = content.rstrip("\n") + f"\n{key}={value}\n"

    path.write_text(content)


# ── Main ──────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Greenhouse gateway setup — configures lora-bridge/.env",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--port", help="Serial port (skip auto-detection)")
    parser.add_argument("--baud", type=int, help="Baud rate (skip interactive prompt)")
    parser.add_argument("--gateway-id", help="Reuse an existing GATEWAY_ID UUID")
    parser.add_argument("--dry-run", action="store_true", help="Show changes without writing")
    args = parser.parse_args()

    print("=== Greenhouse Gateway Setup ===\n")

    existing = load_env(LORA_BRIDGE_ENV)

    # ── Serial port
    if args.port:
        serial_port = args.port
        print(f"Port : {serial_port} (from argument)")
    else:
        esp_ports, other_ports = detect_ports()
        serial_port = choose_port(esp_ports, other_ports)

    # ── Baud rate
    if args.baud:
        baud = args.baud
        print(f"Baud : {baud} (from argument)")
    else:
        baud = choose_baud(existing.get("SERIAL_BAUD"))

    # ── GATEWAY_ID
    if args.gateway_id:
        gateway_id = args.gateway_id
        print(f"\nGATEWAY_ID : {gateway_id} (from argument)")
    else:
        current_gw = existing.get("GATEWAY_ID", "")
        if current_gw and current_gw not in ("default-gateway", ""):
            print(f"\nExisting GATEWAY_ID: {current_gw}")
            keep = input("Keep it? [Y/n] ").strip().lower()
            gateway_id = current_gw if keep in ("", "y", "yes") else str(uuid.uuid4())
            if gateway_id != current_gw:
                print(f"New GATEWAY_ID : {gateway_id}")
        else:
            gateway_id = str(uuid.uuid4())
            print(f"\nGenerated GATEWAY_ID : {gateway_id}")

    # ── Summary
    updates = {
        "SERIAL_PORT": serial_port,
        "SERIAL_BAUD": str(baud),
        "GATEWAY_ID": gateway_id,
    }

    print("\n--- lora-bridge/.env changes ---")
    for key, new_val in updates.items():
        old_val = existing.get(key, "<not set>")
        status = "(unchanged)" if old_val == new_val else f"{old_val!r} → {new_val!r}"
        print(f"  {key:<20} {status}")

    if args.dry_run:
        print("\n[dry-run] No files written.")
        return

    confirm = input("\nApply? [Y/n] ").strip().lower()
    if confirm not in ("", "y", "yes"):
        print("Aborted.")
        return

    # Create lora-bridge/.env from example if missing
    if not LORA_BRIDGE_ENV.exists():
        if LORA_BRIDGE_ENV_EXAMPLE.exists():
            import shutil
            shutil.copy(LORA_BRIDGE_ENV_EXAMPLE, LORA_BRIDGE_ENV)
            print(f"Created lora-bridge/.env from .env.example")
        else:
            LORA_BRIDGE_ENV.touch()
            print(f"Created empty lora-bridge/.env")

    update_env_file(LORA_BRIDGE_ENV, updates)
    print(f"\nWritten : {LORA_BRIDGE_ENV}")

    # ── Next steps
    print("\n=== Next steps ===")
    print(f"\n1. Register this gateway in Django admin:")
    print(f"   http://localhost/admin/iot/edgedevice/add/")
    print(f"   device_id = {gateway_id}")
    print(f"\n2. Create a Zone in that greenhouse with relay_id matching your firmware")
    print(f"\n3. Start the lora-bridge:")
    print(f"   cd lora-bridge && python -m bridge.main")
    print(f"\n4. Or test without hardware:")
    print(f"   python scripts/inject_reading.py --gateway-id {gateway_id} --relay-id 1")


if __name__ == "__main__":
    main()
