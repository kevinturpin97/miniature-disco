# Security Guide — OWASP Top 10 & Hardening Checklist

## OWASP Top 10 — 2021 Compliance Status

### A01 — Broken Access Control
**Status: Mitigated**

- All API endpoints require authentication via JWT (`IsAuthenticated`)
- Resource access is scoped to the user's organizations (`_user_org_ids()` filter on every ViewSet)
- Permission classes enforce role hierarchy: OWNER > ADMIN > OPERATOR > VIEWER
- Greenhouse → Zone → Sensor chain enforced at every level
- API Keys are scoped (read / write / admin) and validated per request
- Impersonation tokens (CRM) expire after 30 minutes
- IDOR protection: UUIDs + ownership checks prevent sequential ID enumeration

**Verify:**
```bash
# Attempt to access another org's greenhouse — must return 404
curl -H "Authorization: Bearer <other_org_token>" http://localhost:8000/api/greenhouses/1/
```

---

### A02 — Cryptographic Failures
**Status: Mitigated**

- Passwords hashed with Django's PBKDF2-SHA256 (minimum 260,000 iterations as of Django 5)
- JWT secrets stored in `SECRET_KEY` env var — never in code
- HMAC-SHA256 for edge-to-cloud authentication (`EDGE_HMAC_KEY`)
- HTTPS enforced in production (Nginx + Let's Encrypt or self-signed for dev)
- HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- Stripe API keys are environment variables, never logged
- Database passwords and Redis URLs are env vars only

**Verify:**
```bash
grep -r "SECRET_KEY\|PASSWORD\|API_KEY" backend/ --include="*.py" | grep -v "os.environ\|env(\|decouple\|settings\."
# Should return no hardcoded secrets
```

---

### A03 — Injection
**Status: Mitigated**

- Django ORM prevents SQL injection (parameterized queries only)
- No raw SQL queries (`cursor.execute`) without parameterization
- DRF serializers validate and sanitize all API input
- Zod validation on all frontend form inputs before API calls
- No shell execution of user-provided input in the codebase

**Verify:**
```bash
grep -r "cursor\.execute\|raw(" backend/ --include="*.py"
# Review any matches for parameterization
```

---

### A04 — Insecure Design
**Status: Mitigated**

- Multi-tenancy enforced at the data layer (org-scoped querysets), not just UI
- Invitation tokens are signed (HMAC with expiry), not guessable
- Automation rules enforce cooldowns to prevent actuator thrashing
- Command pipeline has explicit state machine (PENDING → SENT → ACK/FAILED/TIMEOUT)
- Trial periods auto-expire via Celery task (no user action required)

---

### A05 — Security Misconfiguration
**Status: Mitigated**

- `DEBUG=False` in production settings
- `ALLOWED_HOSTS` restricted to configured domains
- Django admin only accessible via `/admin/` — not exposed externally in cloud mode
- Default Mosquitto config updated to require authentication
- Nginx hides server version (`server_tokens off`)
- CORS restricted to `CORS_ALLOWED_ORIGINS` (no wildcard in production)
- CSRF middleware enabled for session-based views
- Content Security Policy header set on all responses

**Verify:**
```bash
curl -I https://your-domain.com/ | grep -E "Server:|X-Frame|CSP|X-Content"
```

---

### A06 — Vulnerable and Outdated Components
**Status: Monitored**

- Backend: `pip-audit` run on CI for CVE scanning
- Frontend: `npm audit` run on CI
- Docker base images pinned to specific minor versions (e.g., `python:3.12-slim`)
- Dependabot or manual review recommended monthly

**Verify:**
```bash
# Backend
pip-audit -r backend/requirements.txt

# Frontend
cd frontend && npm audit --audit-level=high
```

---

### A07 — Identification and Authentication Failures
**Status: Mitigated**

- JWT access token lifetime: 15 minutes (configurable via `ACCESS_TOKEN_LIFETIME`)
- JWT refresh token lifetime: 7 days
- Token blacklisting on logout (`djangorestframework-simplejwt` blacklist app)
- Nginx rate limiting on `/api/auth/login/` (10 req/min per IP, burst 5)
- Nginx rate limiting on `/api/auth/register/` (10 req/min per IP, burst 3)
- Django `django-ratelimit` throttle on auth endpoints as second layer
- HMAC-SHA256 edge device authentication with timestamp validation (5-min window)

**Verify:**
```bash
# Brute-force test — should be rate-limited after ~10 attempts
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost/api/auth/login/ \
    -H "Content-Type: application/json" -d '{"username":"x","password":"x"}'
done
# Should return 429 for requests 11+
```

---

### A08 — Software and Data Integrity Failures
**Status: Mitigated**

- Traceability reports signed with SHA256 hash + timestamp (`docs.compliance`)
- Edge sync batches authenticated with HMAC-SHA256 — unsigned requests rejected (403)
- Stripe webhooks validated with Stripe signature header
- No CDN-hosted scripts without SRI (no external scripts in CSP)
- Docker images built from controlled base images (not `:latest`)

---

### A09 — Security Logging and Monitoring Failures
**Status: Mitigated**

- `AuditEvent` model logs all sensitive operations (login, command send, config change, impersonation)
- Sentry captures all 5xx errors with stack traces and user context
- Prometheus metrics track abnormal patterns (spike in commands/min, auth failures)
- Grafana alerts configurable on metric thresholds
- Structured JSON logs via `structlog` (backend) and `pino` (frontend)
- All auth events (login success/failure, token refresh, logout) are logged

---

### A10 — Server-Side Request Forgery (SSRF)
**Status: Mitigated**

- Webhook URLs validated against allowlist (no private IP ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Open-Meteo API calls use fixed base URL from config — no user-controlled URLs
- Telegram Bot API calls use token from config — no user-controlled endpoints

---

## Security Headers Checklist

| Header | Value | Status |
|--------|-------|--------|
| `X-Content-Type-Options` | `nosniff` | ✅ Nginx |
| `X-Frame-Options` | `DENY` | ✅ Nginx |
| `X-XSS-Protection` | `1; mode=block` | ✅ Nginx |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ✅ Nginx |
| `Content-Security-Policy` | `default-src 'self'; ...` | ✅ Nginx |
| `Permissions-Policy` | `geolocation=(), camera=()` | ✅ Nginx |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | ✅ Production Nginx |
| `Server` | Hidden (`server_tokens off`) | ✅ Nginx |

---

## Secrets Rotation Procedure

See [deployment.md — Secrets Rotation](deployment.md#secrets-rotation).

---

## Rate Limits Summary

| Endpoint | Limit | Burst |
|----------|-------|-------|
| `POST /api/auth/login/` | 10 req/min/IP | 5 |
| `POST /api/auth/register/` | 10 req/min/IP | 3 |
| `POST /api/edge/sync/` | 60 req/min/IP | 20 |
| All other API endpoints | 60 req/min/user | — |

---

## GDPR Compliance

- Personal data collected: email, first name, last name, IP addresses (in logs)
- Data export: `POST /api/auth/gdpr/export/` returns all user data as JSON
- Right to erasure: `DELETE /api/auth/gdpr/delete/` anonymizes all user records
- Data retention: raw readings 30d (edge) / 90d (cloud), aggregates permanent
- Log retention: structured logs 30 days maximum
- Sentry PII: `send_default_pii = False` in Sentry config

---

## Security Contact

Report vulnerabilities to: `security@greenhouse-saas.com`

Please use responsible disclosure — allow 90 days for remediation before public disclosure.
