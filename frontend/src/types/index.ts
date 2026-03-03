/**
 * Core type definitions for the Greenhouse SaaS frontend.
 */

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
}

export interface Greenhouse {
  id: number;
  name: string;
  location: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  zone_count: number;
}

export interface Zone {
  id: number;
  greenhouse: number;
  name: string;
  relay_id: number;
  description: string;
  is_active: boolean;
  is_online: boolean;
  last_seen: string | null;
  transmission_interval: number;
  created_at: string;
  updated_at: string;
}

export type SensorType =
  | "TEMP"
  | "HUM_AIR"
  | "HUM_SOIL"
  | "PH"
  | "LIGHT"
  | "CO2";

export interface Sensor {
  id: number;
  zone: number;
  sensor_type: SensorType;
  label: string;
  unit: string;
  min_threshold: number | null;
  max_threshold: number | null;
  is_active: boolean;
  created_at: string;
}

export interface SensorReading {
  id: number;
  sensor: number;
  value: number;
  relay_timestamp: string | null;
  received_at: string;
}

export type ActuatorType =
  | "VALVE"
  | "FAN"
  | "HEATER"
  | "LIGHT"
  | "PUMP"
  | "SHADE";

export interface Actuator {
  id: number;
  zone: number;
  actuator_type: ActuatorType;
  name: string;
  gpio_pin: number | null;
  state: boolean;
  is_active: boolean;
  created_at: string;
}

export type CommandType = "ON" | "OFF" | "SET";

export type CommandStatus = "PENDING" | "SENT" | "ACK" | "FAILED" | "TIMEOUT";

export interface Command {
  id: number;
  actuator: number;
  command_type: CommandType;
  value: number | null;
  status: CommandStatus;
  created_by: number | null;
  created_at: string;
  sent_at: string | null;
  acknowledged_at: string | null;
  error_message: string;
}

export type AlertType = "HIGH" | "LOW" | "OFFLINE" | "ERROR" | "CMD_FAIL";

export type Severity = "INFO" | "WARNING" | "CRITICAL";

export interface Alert {
  id: number;
  sensor: number | null;
  zone: number;
  alert_type: AlertType;
  severity: Severity;
  value: number | null;
  message: string;
  is_acknowledged: boolean;
  acknowledged_by: number | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface AutomationRule {
  id: number;
  zone: number;
  name: string;
  description: string;
  sensor_type: SensorType;
  condition: "GT" | "LT" | "EQ" | "GTE" | "LTE";
  threshold_value: number;
  action_actuator: number;
  action_command_type: CommandType;
  action_value: number | null;
  cooldown_seconds: number;
  is_active: boolean;
  last_triggered: string | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface AuthTokens {
  access: string;
  refresh: string;
}
