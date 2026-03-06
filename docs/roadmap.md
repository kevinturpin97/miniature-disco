# Greenhouse SaaS — Product Roadmap (Sprints 1–29)

Complete development history from initial scaffolding to production-ready SaaS platform.

---

## Sprint 1 — Setup & Infrastructure
**Status: Complete**

Project scaffolding, Docker Compose environment (PostgreSQL, Redis, Mosquitto, Nginx), Django settings split (base/dev/prod), Celery + Redis broker, React + Vite + TypeScript + TailwindCSS frontend, full data models (Greenhouse, Zone, Sensor, SensorReading, Actuator, Command, AutomationRule, Alert), Django migrations and admin configuration.

---

## Sprint 2 — Authentication & CRUD API
**Status: Complete**

JWT authentication (register/login/refresh/logout/me), permission system (IsOwnerOrReadOnly, IsGreenhouseOwner), DRF serializers and ViewSets for all models, filtering/search/pagination, 88 passing tests.

---

## Sprint 3 — Firmware v1 (LoRa Relay Node)
**Status: Complete**

PlatformIO project, DHT22 (temperature + air humidity), DS18B20 (soil temperature), binary LoRa frame encoding with CRC8, configurable periodic transmission, sleep mode, command reception. Modular C++ architecture (sensors.h, lora_protocol.h, config.h).

---

## Sprint 4 — LoRa Bridge Service
**Status: Complete**

Python service: serial port reading (pyserial), binary protocol decoding, CRC8 validation, MQTT publishing (paho-mqtt), command subscription, serial/MQTT reconnection handling, structured logging (structlog). 29 passing tests.

---

## Sprint 5 — Data Ingestion & Storage
**Status: Complete**

MQTT worker (Django management command + Celery), MQTT message parsing → SensorReading creation, Zone.last_seen updates, temporal filter API, hourly/daily aggregation endpoint, relay offline detection (Celery periodic task).

---

## Sprint 6 — WebSocket Real-Time
**Status: Complete**

Django Channels with Redis channel layer, WebSocket consumers for /ws/sensors/{zone_id}/ and /ws/alerts/, real-time push on MQTT ingestion and alert creation, pytest-asyncio WebSocket tests.

---

## Sprint 7 — Frontend: Dashboard & Auth
**Status: Complete**

Login/Register pages with Zod validation, Zustand auth store with JWT + auto-refresh, Axios JWT interceptor, protected routes, sidebar/header layout, dashboard with greenhouse cards and zone summaries, online/offline indicators, mobile-first responsive design.

---

## Sprint 8 — Frontend: Zone Detail & History
**Status: Complete**

Zone detail page with real-time Recharts graphs, useWebSocket hook, period selector (1h/24h/7d/custom), historical charts per sensor, readings table, CSV export, actuator state display.

---

## Sprint 9 — Frontend: Alerts
**Status: Complete**

Sensor threshold configuration forms, Celery threshold evaluation task, automatic alert creation, alerts list page with filters, notification badge in header, alert acknowledgement, real-time WebSocket alerts.

---

## Sprint Intermediate — i18n & Functional Pages
**Status: Complete**

react-i18next infrastructure (EN/FR), LanguageSwitcher component, all pages migrated to i18n, backend ChangePasswordView, sensor/actuator CRUD API wiring, reusable UI components (Modal, ConfirmDialog, FormField, SelectField), Dashboard full CRUD via modals, Settings with Profile + Resources tabs, History cross-zone comparison charts, Commands interface, 83 frontend + 134 backend passing tests.

---

## Sprint 10 — Commands & Actuators
**Status: Complete**

Commands page (zone-based interface), ON/OFF buttons per actuator, full pipeline UI → API → MQTT → LoRa Bridge → LoRa → relay, status feedback (PENDING → SENT → ACK/FAILED), command history, Celery command timeout task.

---

## Sprint 11 — Automations
**Status: Complete**

Automation rule CRUD page (IF sensor condition THEN actuator action), automation engine (Celery, evaluated at each reading), configurable cooldown, trigger history, rule activation/deactivation.

---

## Sprint 12 — Integration & Production
**Status: Complete**

docker-compose.prod.yml (ARM64, healthchecks), Nginx HTTPS (self-signed + Let's Encrypt path), simulated data script, Django query optimization (select_related/prefetch_related), complete documentation, healthcheck endpoints, seed data, security review (CORS, CSRF, rate limiting).

---

## Sprint 13 — Multi-Tenancy & Organizations
**Status: Complete**

Organization model (slug, plan FREE/PRO/ENTERPRISE, quotas), Membership model (OWNER/ADMIN/OPERATOR/VIEWER), Greenhouse → Organization migration, IsOrganizationMember + HasRole permissions, email invitation (signed token, 48h expiry), /api/orgs/ endpoints, Team Management page, organization switcher in header, quota enforcement.

---

## Sprint 14 — Notifications & Advanced Alerting
**Status: Complete**

NotificationChannel model (EMAIL, WEBHOOK, TELEGRAM, PUSH), NotificationRule linking alerts to channels, Django email + HTML templates, generic webhook (n8n/Zapier compatible), Telegram bot integration, dispatch_notifications Celery task (post-save signal), daily digest (8am Celery beat), Notifications config page, notification rate limiting (max 1/5min per rule).

---

## Sprint 15 — Analytics & Reports
**Status: Complete**

/api/zones/{id}/analytics/ (7d/30d stats: min/max/mean/stddev/trend), z-score anomaly detection (>3σ → SENSOR_ERROR alert), PDF export (WeasyPrint), SensorReadingHourly materialized aggregation table, Analytics page with calendar heatmap, sensor correlation matrix, PDF report with period selector, /api/orgs/{slug}/analytics/summary/.

---

## Sprint 16 — Schedules & Scenarios
**Status: Complete**

Schedule model (cron-style or time ranges), Scenario model (named action sequences), ScenarioStep model (actuator + action + delay + duration), dynamic Celery beat from DB (django-celery-beat), full CRUD API, Scenario Builder page (drag-and-drop timeline), weekly calendar view, "Run now" manual execution, actuator conflict detection.

---

## Sprint 17 — Mobile App & PWA
**Status: Complete**

PWA manifest + service worker (Vite PWA plugin), offline fallback page, Web Push notifications (VAPID keys), mobile bottom navigation bar, swipe gestures, Quick Actions page, lazy-loaded routes, skeleton screens, full dark mode (CSS variables, Zustand/localStorage persist), Zone Status widget.

---

## Sprint 17 Bis — UI/UX Redesign & Visual Identity
**Status: Complete**

DaisyUI + TailwindCSS design system, color/typography/spacing/icon tokens, global layout (header/sidebar/footer/breakpoints), Dashboard/ZoneDetail/Analytics/Commands/Alerts/Settings/Team redesign, branding (logo, favicon, palette, dark/light mode), Framer Motion micro-interactions, mobile + PWA responsive audit, Lighthouse > 90 all metrics, Vitest + RTL component tests, cross-browser QA.

---

## Sprint 18 — Observability & Production Hardening
**Status: Complete**

Unified structured logging (structlog backend + pino frontend, JSON format), Sentry integration (backend + frontend, source maps), enriched healthcheck endpoints (/api/health/, /api/health/ready/, /api/health/detailed/), Prometheus metrics (django-prometheus + custom readings/min, commands/min), pre-configured Grafana dashboard, API rate limiting (django-ratelimit per-user + per-IP), automated PostgreSQL backup (script + Docker cron → S3/local), zero-downtime migrations (django-zero-downtime-migrations), AuditEvent model (who/what/when), Locust load test scenario (100 zones, 1000 readings/min), security hardening (CORS strict, CSP, HSTS, secrets rotation docs).

---

## Sprint 19 — Template Marketplace
**Status: Complete**

Template model (exportable zone snapshot: sensors + actuators + rules + scenarios), TemplateCategory model (12 categories: maraichage, floriculture, hydroponics…), publish/clone/rate (1–5 stars)/search API, Marketplace page (cards, filters, detailed preview), template import on existing zone (merge or replace), official Greenhouse templates (tomato, lettuce, strawberry, basil, tulip…), template versioning + changelog.

---

## Sprint 20 — AI & Predictions
**Status: Complete**

Linear regression drift prediction (24h data → critical trend alert), Isolation Forest anomaly detection (scikit-learn, per sensor), /api/zones/{id}/predictions/ (6h forecast), smart threshold adjustment suggestions, weekly AI report (Jinja2 template + stats summary in natural language), incremental model training Celery task (every 24h per zone), Predictions widget in ZoneDetail (confidence interval chart), anomaly badge with explanation.

---

## Sprint 21 — Public API & Developer Platform
**Status: Complete**

APIKey model (long-lived per org, scopes: read/write/admin), X-API-Key header authentication alongside JWT, configurable rate limiting per key (by plan), API versioning (/api/v1/ prefix + API-Version header), OpenAPI auto-generated docs (drf-spectacular + Swagger/ReDoc UI), auto-generated Python SDK (openapi-generator), configurable webhooks (new_reading/alert_created/command_ack events), test sandbox org with simulated data, Developer page (API key management + live call logs).

---

## Sprint 22 — Billing & SaaS Plans
**Status: Complete**

Stripe integration (stripe-python: FREE/PRO/ENTERPRISE products), Subscription model (plan/status/period_end/stripe_subscription_id), Stripe webhooks (payment_succeeded/failed/subscription_cancelled), plan quota enforcement (Django middleware), Billing page (plan + usage + upgrade CTA), Upgrade page (plan comparison table + Stripe Checkout), transactional emails (payment confirmation/failure/renewal reminder), 14-day auto-trial on registration.

---

## Sprint 23 — Data Pipeline & Long-Term Storage
**Status: Complete**

PostgreSQL partitioning for SensorReading by month (pg_partman), configurable retention policy (raw 30d, hourly 1yr, daily forever), automated cold storage archiving (S3/MinIO for expired partitions), materialized view sensor_reading_daily (refreshed hourly), TimescaleDB optional migration path documented, Server-Sent Events streaming endpoint (/api/zones/{id}/readings/stream/), LTTB downsampling for big-data charts, benchmarks (10M readings < 200ms aggregation).

---

## Sprint 24 — Multi-Site & Mapping
**Status: Complete**

Site model (GPS coordinates, timezone, local weather), Open-Meteo API integration (external temperature/precipitation/UV), weather ↔ sensor correlation in analytics, Leaflet.js interactive map (site markers + status), multi-site dashboard view, geo-contextual alerts ("Heatwave tomorrow, adjust thresholds?"), cartographic PNG export.

---

## Sprint 25 — Compliance & Agricultural Traceability
**Status: Complete**

CropCycle model (species/variety/sowing/harvest per zone), automatic cultivation journal (all commands + alerts + manual notes), traceability PDF report (cultivation conditions for a period), GDPR compliance (DSAR data export, right to erasure), Note model (manual zone annotations with timestamp), SHA256 + timestamp electronic signing of reports, GlobalG.A.P. JSON export, Culture Journal page (chronological timeline with filters).

---

## Sprint 26 — UX/Navigation Refactor & Product Coherence
**Status: Complete**

5-item grouped navigation menu (Overview/Supervision/Control/Data/Administration), collapsible sidebar (compact icon-only mode), mobile 5-item bottom bar (icons + notification badges only), contextual breadcrumbs on all deep pages, branded 404 + global error pages, intelligent post-login redirect (role-based), EDGE_MODE + VITE_EDGE_MODE env variables, useAppMode() hook (isEdgeMode/isCloudMode/features), FeatureGate component, dynamic menu (LoRa Bridge/MQTT in Edge, CRM/Sync in Cloud), header context badge (Edge vs Cloud), Settings restructured (Profile/Organisation/Notifications/Security tabs), dedicated /billing + /team + /developer pages in Administration, Administration hub with usage summary, Sites page (Leaflet full-width + flyTo + pulse animation + bidirectional card↔marker link), all advanced pages completed (Marketplace, Predictions, Developer, Culture Journal, Onboarding wizard, empty states, destructive action confirmations, unified toast feedback, inline Zod validation, 3-state command animation), full mobile audit (375px/768px/1280px), ARIA labels on Recharts, skeleton loaders, Lighthouse CI > 90.

---

## Sprint 27 — Edge Sync Agent
**Status: Complete**

EdgeDevice model (device_id UUID, HMAC secret_key, last_sync_at, firmware_version), cloud_synced + cloud_synced_at fields on SensorReading/Command/Alert/AuditEvent, sync_to_cloud Celery task (batch collection, gzip compression, HMAC-SHA256 authentication), store-and-forward with exponential retry (1m → 5m → 15m → 1h), Celery beat (every 5min + nightly bulk at 2am), conflict resolution (edge wins readings, cloud wins configs), force_sync management command, /api/sync/status/ endpoint, Sync Status widget in header, /sync page in Administration (history + batch sizes + errors), unsynced data visual indicator.

---

## Sprint 28 — Cloud CRM Platform
**Status: Complete**

Cloud-specific settings (config/settings/cloud.py: EDGE_MODE=False, CLOUD_MODE=True), docker-compose.cloud.yml (Django cloud + PostgreSQL + Redis + Celery + Nginx), HTTPS via Certbot, CloudTenant model (org OneToOne, edge_devices M2M, cloud_storage_mb, last_activity, support_notes), SyncBatch model (edge_device, records_count, payload_size_kb, status, error_message), reading deduplication (relay_timestamp + sensor_id + value), /api/edge/register/ (Raspberry Pi enrollment, UUID + HMAC secret), /api/edge/sync/ (HMAC-validated batch ingestion via Celery), /api/edge/config/ (push config to edge), CRM endpoints (/api/crm/tenants/, health, stats, impersonate 30min token), /crm + /crm/{id} pages (FeatureGate "crm"), global Leaflet map of all client sites, plan management from CRM, impersonation tool, operator alerts (24h no-sync, device offline, disk critical), client CSV export, "My Devices" page, onboard_client.sh script, cloud pg_dump backup, differentiated retention (raw 90d cloud vs 30d edge), docs/deployment-cloud.md.

---

## Sprint 29 — Final Polish & Production Release
**Status: In Progress**

GitHub Actions CI/CD (lint + test + build on PR, auto-deploy to cloud VPS on main), Playwright E2E tests (login → dashboard → zone + sensor pipeline + security headers), enriched seed data (3 clients, 5 greenhouses, 20 zones, 6 months simulated), make demo command + read-only demo account, frontend lazy loading (Leaflet/Recharts/heavy pages code splitting), security headers audit (CSP/HSTS/X-Frame-Options), OWASP Top 10 checklist, secrets rotation documentation, GDPR final audit, Lighthouse CI verification, complete docs suite (roadmap/onboarding/architecture update), README with CI badges.

---

## Planned Future Features

- **Mobile Native App** (React Native / Expo) — offline-capable, BLE sensor pairing
- **AI Copilot** — Claude API integration for natural-language greenhouse management
- **Multi-language Firmware** — MicroPython port for ESP32 relay nodes
- **Federation** — cross-organization data sharing for cooperative farms
- **Marketplace 2.0** — public template store with community ratings and versioning
- **Edge ML** — run Isolation Forest directly on Raspberry Pi for local anomaly detection
