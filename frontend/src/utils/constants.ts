/**
 * Utility constants for the Greenhouse SaaS frontend.
 */

export const SENSOR_TYPE_LABELS: Record<string, string> = {
  TEMP: "Temperature",
  HUM_AIR: "Air Humidity",
  HUM_SOIL: "Soil Humidity",
  PH: "pH Level",
  LIGHT: "Light",
  CO2: "CO2",
};

export const SENSOR_TYPE_UNITS: Record<string, string> = {
  TEMP: "\u00b0C",
  HUM_AIR: "%",
  HUM_SOIL: "%",
  PH: "",
  LIGHT: "lux",
  CO2: "ppm",
};

export const ACTUATOR_TYPE_LABELS: Record<string, string> = {
  VALVE: "Water Valve",
  FAN: "Ventilation Fan",
  HEATER: "Heater",
  LIGHT: "Grow Light",
  PUMP: "Water Pump",
  SHADE: "Shade Screen",
};

export const COMMAND_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  SENT: "Sent",
  ACK: "Acknowledged",
  FAILED: "Failed",
  TIMEOUT: "Timeout",
};

export const SEVERITY_COLORS: Record<string, string> = {
  INFO: "blue",
  WARNING: "yellow",
  CRITICAL: "red",
};
