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

export type OrgPlan = "FREE" | "PRO" | "ENTERPRISE";

export type MemberRole = "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";

export interface Organization {
  id: number;
  name: string;
  slug: string;
  plan: OrgPlan;
  max_greenhouses: number;
  max_zones: number;
  member_count: number;
  greenhouse_count: number;
  my_role: MemberRole | null;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: number;
  user: number;
  username: string;
  email: string;
  organization: number;
  role: MemberRole;
  joined_at: string;
}

export interface Invitation {
  id: number;
  organization: number;
  organization_name: string;
  email: string;
  role: MemberRole;
  token: string;
  invited_by: number;
  invited_by_username: string;
  accepted: boolean;
  is_expired: boolean;
  is_valid: boolean;
  expires_at: string;
  created_at: string;
}

export interface Greenhouse {
  id: number;
  organization: number | null;
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
  automation_rule: number | null;
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

export type ChannelType = "EMAIL" | "WEBHOOK" | "TELEGRAM";

export interface NotificationChannel {
  id: number;
  organization: number;
  channel_type: ChannelType;
  name: string;
  is_active: boolean;
  email_recipients: string;
  webhook_url: string;
  has_webhook_secret: boolean;
  telegram_chat_id: string;
  has_telegram_bot_token: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationChannelPayload {
  channel_type: ChannelType;
  name: string;
  is_active?: boolean;
  email_recipients?: string;
  webhook_url?: string;
  webhook_secret?: string;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
}

export interface NotificationRule {
  id: number;
  organization: number;
  name: string;
  channel: number;
  channel_name: string;
  alert_types: AlertType[];
  severities: Severity[];
  cooldown_seconds: number;
  is_active: boolean;
  last_notified: string | null;
  created_at: string;
}

export interface NotificationRulePayload {
  name: string;
  channel: number;
  alert_types: AlertType[];
  severities: Severity[];
  cooldown_seconds: number;
  is_active?: boolean;
}

export interface NotificationLog {
  id: number;
  rule: number;
  rule_name: string;
  channel: number;
  channel_name: string;
  alert: number;
  status: "SENT" | "FAILED";
  error_message: string;
  created_at: string;
}

export interface SensorStat {
  sensor_id: number;
  sensor_type: SensorType;
  label: string;
  unit: string;
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  stddev: number | null;
  trend: "rising" | "falling" | "stable" | null;
  daily_averages: { date: string; avg: number | null }[];
}

export interface ZoneAnalytics {
  zone_id: number;
  zone_name: string;
  period_days: number;
  since: string;
  sensors: SensorStat[];
}

export interface GreenhouseSummary {
  greenhouse_id: number;
  greenhouse_name: string;
  zone_count: number;
  readings_7d: number;
  active_alerts: number;
}

export interface OrgAnalyticsSummary {
  greenhouse_count: number;
  zone_count: number;
  zones_online: number;
  total_readings_7d: number;
  active_alerts: number;
  greenhouses: GreenhouseSummary[];
}

export type ScenarioStatus = "IDLE" | "RUNNING" | "COMPLETED" | "FAILED";
export type ScheduleType = "CRON" | "TIME_RANGE";

export interface ScenarioStep {
  id?: number;
  actuator: number;
  actuator_name?: string;
  order: number;
  action: "ON" | "OFF" | "SET";
  action_value?: number | null;
  delay_seconds: number;
  duration_seconds?: number | null;
}

export interface Scenario {
  id: number;
  zone: number;
  name: string;
  description: string;
  status: ScenarioStatus;
  is_active: boolean;
  last_run_at: string | null;
  steps: ScenarioStep[];
  created_at: string;
  updated_at: string;
}

export interface ScenarioPayload {
  name: string;
  description?: string;
  is_active?: boolean;
  steps?: Omit<ScenarioStep, "id" | "actuator_name">[];
}

export interface ScheduleData {
  id: number;
  scenario: number;
  scenario_name: string;
  name: string;
  schedule_type: ScheduleType;
  cron_minute: string;
  cron_hour: string;
  cron_day_of_week: string;
  start_time: string | null;
  end_time: string | null;
  days_of_week: number[];
  is_active: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchedulePayload {
  scenario: number;
  name: string;
  schedule_type: ScheduleType;
  cron_minute?: string;
  cron_hour?: string;
  cron_day_of_week?: string;
  start_time?: string;
  end_time?: string;
  days_of_week?: number[];
  is_active?: boolean;
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
