"""Configuration module for LoRa bridge.

Loads settings from environment variables with sensible defaults.
Uses python-decouple for .env file support.
"""

from decouple import config

# Serial port
SERIAL_PORT: str = config("SERIAL_PORT", default="/dev/ttyUSB0")
SERIAL_BAUD: int = config("SERIAL_BAUD", default=115200, cast=int)
SERIAL_TIMEOUT: float = config("SERIAL_TIMEOUT", default=2.0, cast=float)
SERIAL_RECONNECT_DELAY: float = config("SERIAL_RECONNECT_DELAY", default=5.0, cast=float)

# MQTT broker
MQTT_HOST: str = config("MQTT_HOST", default="localhost")
MQTT_PORT: int = config("MQTT_PORT", default=1883, cast=int)
MQTT_KEEPALIVE: int = config("MQTT_KEEPALIVE", default=60, cast=int)
MQTT_CLIENT_ID: str = config("MQTT_CLIENT_ID", default="lora-bridge")
MQTT_RECONNECT_DELAY: float = config("MQTT_RECONNECT_DELAY", default=5.0, cast=float)

# MQTT topics
MQTT_TOPIC_SENSORS: str = config("MQTT_TOPIC_SENSORS", default="greenhouse/relay/{relay_id}/sensors")
MQTT_TOPIC_COMMANDS: str = config("MQTT_TOPIC_COMMANDS", default="greenhouse/commands/+")

# Logging
LOG_LEVEL: str = config("LOG_LEVEL", default="INFO")
