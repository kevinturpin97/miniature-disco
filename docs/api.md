# API Reference

Base URL: `/api/`

All endpoints require JWT authentication unless noted otherwise. Include the token in the `Authorization` header:
```
Authorization: Bearer <access_token>
```

## Authentication

### Register
```
POST /api/auth/register/
Body: { "username", "email", "password", "password2" }
Response: 201 { "id", "username", "email" }
```

### Login
```
POST /api/auth/login/
Body: { "username", "password" }
Response: 200 { "access", "refresh" }
```

### Refresh Token
```
POST /api/auth/refresh/
Body: { "refresh" }
Response: 200 { "access", "refresh" }
```

### Logout
```
POST /api/auth/logout/
Body: { "refresh" }
Response: 205
```

### Get Profile
```
GET /api/auth/me/
Response: 200 { "id", "username", "email", "first_name", "last_name" }
```

### Update Profile
```
PATCH /api/auth/me/
Body: { "first_name", "last_name", "email" }
Response: 200 { updated user }
```

### Change Password
```
POST /api/auth/change-password/
Body: { "old_password", "new_password", "new_password2" }
Response: 200
```

## Greenhouses

### List Greenhouses
```
GET /api/greenhouses/
Response: 200 { "count", "next", "previous", "results": [Greenhouse] }
```

### Create Greenhouse
```
POST /api/greenhouses/
Body: { "name", "location"?, "description"? }
Response: 201 Greenhouse
```

### Get/Update/Delete Greenhouse
```
GET    /api/greenhouses/{id}/
PATCH  /api/greenhouses/{id}/
DELETE /api/greenhouses/{id}/
```

## Zones

### List Zones (nested)
```
GET /api/greenhouses/{greenhouse_id}/zones/
Response: 200 paginated [Zone]
```

### Create Zone (nested)
```
POST /api/greenhouses/{greenhouse_id}/zones/
Body: { "name", "relay_id", "description"?, "transmission_interval"? }
Response: 201 Zone
```

### Get/Update/Delete Zone
```
GET    /api/zones/{id}/
PATCH  /api/zones/{id}/
DELETE /api/zones/{id}/
```

### Export Zone Data as CSV
```
GET /api/zones/{id}/export/csv/?from=<ISO8601>&to=<ISO8601>
Response: 200 text/csv
```

## Sensors

### List Sensors
```
GET /api/zones/{zone_id}/sensors/
Response: 200 paginated [Sensor]
```

### Create Sensor
```
POST /api/zones/{zone_id}/sensors/
Body: { "sensor_type", "label"?, "unit", "min_threshold"?, "max_threshold"? }
Response: 201 Sensor
```

### Update/Delete Sensor
```
PATCH  /api/sensors/{id}/
DELETE /api/sensors/{id}/
```

### Get Sensor Readings
```
GET /api/sensors/{id}/readings/?from=<ISO8601>&to=<ISO8601>&interval=<hour|day>
Response: 200 paginated [SensorReading] or [{ "period", "avg_value" }]
```

## Actuators

### List Actuators
```
GET /api/zones/{zone_id}/actuators/
Response: 200 paginated [Actuator]
```

### Create Actuator
```
POST /api/zones/{zone_id}/actuators/
Body: { "actuator_type", "name", "gpio_pin"? }
Response: 201 Actuator
```

### Update/Delete Actuator
```
PATCH  /api/actuators/{id}/
DELETE /api/actuators/{id}/
```

## Commands

### Send Command
```
POST /api/actuators/{actuator_id}/commands/
Body: { "command_type": "ON"|"OFF"|"SET", "value"? }
Response: 201 Command
```

### List Zone Commands
```
GET /api/zones/{zone_id}/commands/?status=<PENDING|SENT|ACK|FAILED|TIMEOUT>&command_type=<ON|OFF|SET>
Response: 200 paginated [Command]
```

## Automation Rules

### List Rules
```
GET /api/zones/{zone_id}/automations/
Response: 200 paginated [AutomationRule]
```

### Create Rule
```
POST /api/zones/{zone_id}/automations/
Body: {
  "name", "description"?, "sensor_type",
  "condition": "GT"|"LT"|"EQ"|"GTE"|"LTE",
  "threshold_value", "action_actuator", "action_command_type",
  "action_value"?, "cooldown_seconds"?, "is_active"?
}
Response: 201 AutomationRule
```

### Update/Delete Rule
```
PATCH  /api/automations/{id}/
DELETE /api/automations/{id}/
```

## Alerts

### List Alerts
```
GET /api/alerts/?zone=<id>&severity=<INFO|WARNING|CRITICAL>&is_acknowledged=<true|false>
Response: 200 paginated [Alert]
```

### Acknowledge Alert
```
PATCH /api/alerts/{id}/acknowledge/
Response: 200 Alert
```

## Health Checks

**No authentication required.**

### Liveness
```
GET /api/health/
Response: 200 { "status": "ok" }
```

### Readiness
```
GET /api/health/ready/
Response: 200 { "status": "ok", "checks": { "database": true, "redis": true } }
Response: 503 { "status": "degraded", "checks": { "database": true, "redis": false } }
```

## WebSocket

### Real-time Sensor Data
```
WS /ws/sensors/{zone_id}/
Auth: Pass JWT as query param: ?token=<access_token>
Messages: { "sensor_type", "value", "sensor_id", "zone_id", "received_at" }
```

### Real-time Alerts
```
WS /ws/alerts/
Auth: Pass JWT as query param: ?token=<access_token>
Messages: { "alert_id", "alert_type", "severity", "zone_id", "zone_name", "message", "created_at" }
```

## Rate Limiting

| Scope | Development | Production |
|-------|-----------|-----------|
| Anonymous | 30/min | 20/min |
| Authenticated | 120/min | 60/min |
| Auth endpoints (Nginx) | — | 10/min |

Exceeded limits return `429 Too Many Requests`.

## Pagination

All list endpoints return paginated responses:
```json
{
  "count": 42,
  "next": "http://host/api/resource/?page=2",
  "previous": null,
  "results": [...]
}
```

Default page size: 50.
