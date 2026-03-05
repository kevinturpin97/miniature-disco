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
  is_on_trial: boolean;
  trial_expired: boolean;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

// --- Billing (Sprint 22) ---

export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "INCOMPLETE";

export interface SubscriptionData {
  id: number;
  organization: number;
  stripe_subscription_id: string;
  stripe_price_id: string;
  plan: OrgPlan;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BillingUsage {
  greenhouses: number;
  max_greenhouses: number;
  zones: number;
  max_zones: number;
  members: number;
  max_members: number;
}

export interface BillingOverview {
  plan: OrgPlan;
  is_on_trial: boolean;
  trial_ends_at: string | null;
  trial_expired: boolean;
  subscription: SubscriptionData | null;
  usage: BillingUsage;
  stripe_publishable_key: string;
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

export type ChannelType = "EMAIL" | "WEBHOOK" | "TELEGRAM" | "PUSH";

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

// --- Marketplace Templates ---

export interface TemplateCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  order: number;
  template_count: number;
}

export interface TemplateSensorConfig {
  sensor_type: SensorType;
  label: string;
  unit: string;
  min_threshold: number | null;
  max_threshold: number | null;
}

export interface TemplateActuatorConfig {
  actuator_type: ActuatorType;
  name: string;
  gpio_pin: number | null;
}

export interface TemplateAutomationRuleConfig {
  name: string;
  description: string;
  sensor_type: SensorType;
  condition: "GT" | "LT" | "EQ" | "GTE" | "LTE";
  threshold_value: number;
  action_actuator_name: string;
  action_actuator_type: ActuatorType;
  action_command_type: CommandType;
  action_value: number | null;
  cooldown_seconds: number;
}

export interface TemplateScenarioStepConfig {
  order: number;
  action: "ON" | "OFF" | "SET";
  action_value: number | null;
  delay_seconds: number;
  duration_seconds: number | null;
  actuator_name: string;
  actuator_type: ActuatorType;
}

export interface TemplateScenarioConfig {
  name: string;
  description: string;
  steps: TemplateScenarioStepConfig[];
}

export interface TemplateConfig {
  sensors: TemplateSensorConfig[];
  actuators: TemplateActuatorConfig[];
  automation_rules: TemplateAutomationRuleConfig[];
  scenarios: TemplateScenarioConfig[];
}

export interface Template {
  id: number;
  organization: number | null;
  organization_name: string;
  category: number | null;
  category_name: string;
  name: string;
  description: string;
  is_official: boolean;
  is_published: boolean;
  version: string;
  changelog: string;
  config: TemplateConfig;
  avg_rating: number;
  rating_count: number;
  clone_count: number;
  created_by: number | null;
  created_by_username: string;
  created_at: string;
  updated_at: string;
  user_rating: number | null;
}

export interface TemplateRating {
  id: number;
  template: number;
  user: number;
  username: string;
  score: number;
  comment: string;
  created_at: string;
  updated_at: string;
}

export interface TemplatePayload {
  name: string;
  description?: string;
  category?: number | null;
  is_published?: boolean;
  version?: string;
  changelog?: string;
  config?: TemplateConfig;
}

export interface TemplatePublishPayload {
  name: string;
  description?: string;
  category?: number | null;
  version?: string;
  changelog?: string;
  is_published?: boolean;
}

export interface TemplateClonePayload {
  zone_id: number;
  mode: "merge" | "replace";
}

export interface TemplateCloneResponse {
  detail: string;
  summary: {
    sensors: number;
    actuators: number;
    automation_rules: number;
    scenarios: number;
  };
}

// --- AI & Predictions (Sprint 20) ---

export interface PredictionPoint {
  id: number;
  sensor: number;
  predicted_at: string;
  predicted_value: number;
  confidence_lower: number;
  confidence_upper: number;
  generated_at: string;
}

export interface SensorPredictionData {
  sensor_id: number;
  sensor_type: SensorType;
  label: string;
  unit: string;
  predictions: PredictionPoint[];
}

export interface DriftInfo {
  sensor_id: number;
  slope_per_hour: number;
  current_value: number;
  predicted_6h: number;
  trend: "rising" | "falling" | "stable";
  drift_alert: boolean;
}

export interface ZonePredictions {
  zone_id: number;
  zone_name: string;
  timestamp: string;
  sensors: SensorPredictionData[];
  drift: Record<number, DriftInfo>;
}

export type DetectionMethod = "ZSCORE" | "IF";

export interface AnomalyRecordData {
  id: number;
  sensor: number;
  sensor_type: SensorType;
  zone_name: string;
  reading: number;
  detection_method: DetectionMethod;
  anomaly_score: number;
  value: number;
  explanation: string;
  detected_at: string;
}

export interface ZoneAnomalies {
  zone_id: number;
  zone_name: string;
  period_days: number;
  anomalies: AnomalyRecordData[];
}

export type SuggestionType = "THRESH" | "TREND";

export interface SmartSuggestionData {
  id: number;
  sensor: number;
  sensor_type: SensorType;
  suggestion_type: SuggestionType;
  message: string;
  suggested_min: number | null;
  suggested_max: number | null;
  confidence: number;
  is_applied: boolean;
  created_at: string;
}

export interface ZoneSuggestions {
  zone_id: number;
  zone_name: string;
  suggestions: SmartSuggestionData[];
}

export interface ZoneAIReport {
  zone_id: number;
  zone_name: string;
  report: string;
  generated_at: string;
}

// --- Developer Platform (Sprint 21) ---

export type APIKeyScope = "READ" | "WRITE" | "ADMIN";

export interface APIKeyData {
  id: number;
  organization: number;
  name: string;
  prefix: string;
  scope: APIKeyScope;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  created_by: number | null;
  created_at: string;
}

export interface APIKeyCreatePayload {
  name: string;
  scope: APIKeyScope;
  expires_at?: string | null;
}

export interface APIKeyCreateResponse {
  key: APIKeyData;
  raw_key: string;
}

export interface APIKeyLogData {
  id: number;
  api_key: number;
  method: string;
  path: string;
  status_code: number;
  ip_address: string | null;
  user_agent: string;
  created_at: string;
}

export type WebhookEventType = "new_reading" | "alert_created" | "command_ack";

export interface WebhookData {
  id: number;
  organization: number;
  name: string;
  url: string;
  events: WebhookEventType[];
  is_active: boolean;
  has_secret: boolean;
  last_triggered_at: string | null;
  failure_count: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookPayload {
  name: string;
  url: string;
  secret?: string;
  events: WebhookEventType[];
  is_active?: boolean;
}

export interface WebhookDeliveryData {
  id: number;
  webhook: number;
  event_type: string;
  payload: Record<string, unknown>;
  response_status: number | null;
  response_body: string;
  status: "SUCCESS" | "FAILED";
  error_message: string;
  duration_ms: number | null;
  created_at: string;
}

export interface SandboxInfo {
  name: string;
  slug: string;
  plan: OrgPlan;
  greenhouse_count: number;
  zone_count: number;
  api_keys_count: number;
}

// --- Sprint 24: Multi-Site & Cartography ---

export interface Site {
  id: number;
  organization: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  timezone: string;
  is_active: boolean;
  greenhouse_count: number;
  created_at: string;
  updated_at: string;
}

export interface WeatherData {
  id: number;
  site: number;
  timestamp: string;
  temperature: number | null;
  humidity: number | null;
  precipitation: number | null;
  wind_speed: number | null;
  uv_index: number | null;
  cloud_cover: number | null;
  weather_code: number | null;
  weather_description: string;
  is_forecast: boolean;
  fetched_at: string;
}

export type WeatherAlertLevel = "INFO" | "WARNING" | "CRITICAL";

export interface WeatherAlert {
  id: number;
  site: number;
  site_name: string;
  alert_level: WeatherAlertLevel;
  title: string;
  message: string;
  forecast_date: string;
  is_acknowledged: boolean;
  acknowledged_by: number | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface SiteDashboard {
  site_id: number;
  site_name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  greenhouse_count: number;
  zone_count: number;
  zones_online: number;
  active_alerts: number;
  weather_alerts: number;
  current_weather: WeatherData | null;
}

export interface WeatherCorrelationEntry {
  timestamp: string;
  external_temperature: number | null;
  external_humidity: number | null;
  precipitation: number | null;
  uv_index: number | null;
  sensor_readings: Record<string, number | null>;
}

export interface SiteWeatherResponse {
  site_id: number;
  site_name: string;
  current: WeatherData | null;
  forecast: WeatherData[];
}
