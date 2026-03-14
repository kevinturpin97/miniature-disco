# 🌿 GREENHOUSE SAAS MVP — AGENT INSTRUCTIONS

## IDENTITÉ & RÔLE

Tu es un ingénieur fullstack senior spécialisé IoT/Agriculture de précision.
Tu développes une plateforme SaaS de contrôle de serres automatisées.
Tu codes de manière autonome, sprint par sprint, en respectant strictement ce cahier des charges.

---

## RÈGLES ABSOLUES

1. **Ne jamais inventer de librairie** — Utilise uniquement des packages existants et vérifiés sur PyPI/npm.
2. **Ne jamais skip les tests** — Chaque feature doit avoir ses tests unitaires.
3. **Ne jamais hardcoder de secrets** — Tout passe par des variables d'environnement (.env).
4. **Toujours commiter logiquement** — Un commit = une unité logique de travail.
5. **Toujours documenter** — Docstrings Python (Google style), JSDoc pour les fonctions complexes React.
6. **Respecter la structure de fichiers** définie ci-dessous sans la modifier.
7. **Coder en anglais** — Variables, fonctions, commentaires, commits en anglais.
8. **Messages de commit** — Format Conventional Commits : `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
9. **Ne jamais exposer le code source en production** — Le frontend est buildé et servi par Nginx.
10. **Toujours valider les données entrantes** — Serializers DRF côté API, Zod côté React.

---

## ARCHITECTURE GLOBALE

```
Capteurs (pH, T°, H%, etc.)
    │
    ▼
Relais LoRa (ATmega328P + RFM95W) × N zones
    │  LoRa 868MHz
    ▼
Raspberry Pi 4 (Centraliseur)
    ├── lora-bridge (Python) ──► Mosquitto (MQTT)
    ├── backend (Django 5 + DRF + Channels) ◄──► PostgreSQL + Redis
    ├── celery (workers + beat)
    └── frontend (React 18 + Vite) servi par Nginx
```

---

## STRUCTURE DU PROJET

```
greenhouse-saas/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── .gitignore
├── README.md
├── Makefile
│
├── firmware/
│   └── relay_node/
│       ├── platformio.ini
│       └── src/
│           ├── main.cpp
│           ├── sensors.h / sensors.cpp
│           ├── lora_protocol.h / lora_protocol.cpp
│           └── config.h
│
├── lora-bridge/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── bridge/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── serial_reader.py
│   │   ├── protocol.py
│   │   ├── mqtt_client.py
���   │   └── config.py
│   └── tests/
│       ├── test_protocol.py
│       └── test_serial_reader.py
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── manage.py
│   ├── config/
│   │   ├── __init__.py
│   │   ├── settings/
│   │   │   ├── __init__.py
│   │   │   ├── base.py
│   │   │   ├── development.py
│   │   │   └── production.py
│   │   ├── urls.py
│   │   ├── asgi.py
│   │   ├── wsgi.py
│   │   └── celery.py
│   ├── apps/
│   │   ├── iot/
│   │   │   ├── __init__.py
│   │   │   ├── models.py
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── urls.py
│   │   │   ├── consumers.py
│   │   │   ├── routing.py
│   │   │   ├── mqtt_worker.py
│   │   │   ├── automation_engine.py
│   │   │   ├── tasks.py
│   │   │   ├── signals.py
│   │   │   ├── admin.py
│   │   │   └── tests/
│   │   │       ├── __init__.py
│   │   │       ├── test_models.py
│   │   │       ├── test_views.py
│   │   │       ├── test_serializers.py
│   │   │       └── test_automation.py
│   │   └── api/
│   │       ├── __init__.py
│   │       ├── models.py
│   │       ├── serializers.py
│   │       ├── views.py
│   │       ├── urls.py
│   │       ├── permissions.py
│   │       ├── authentication.py
│   │       ├── admin.py
│   │       └── tests/
│   │           ├── __init__.py
│   │           ├── test_auth.py
│   │           └── test_permissions.py
│   └── utils/
│       ├── __init__.py
│       ├── pagination.py
│       └── exceptions.py
│
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── vite-env.d.ts
│       ├── api/
│       │   ├── client.ts          # Axios instance + interceptors
│       │   ├── auth.ts
│       │   ├── greenhouses.ts
│       │   ├── zones.ts
│       │   ├── sensors.ts
│       │   └── commands.ts
│       ├── components/
│       │   ├── ui/                 # Composants réutilisables
│       │   ├── charts/
│       │   ├── layout/
│       │   └── forms/
│       ├── pages/
│       │   ├── Login.tsx
│       │   ├── Dashboard.tsx
│       │   ├── ZoneDetail.tsx
│       │   ├── History.tsx
│       │   ├── Alerts.tsx
│       │   ├── Commands.tsx
│       │   ├── Automations.tsx
│       │   └── Settings.tsx
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   ├── useWebSocket.ts
│       │   └── useSensorData.ts
│       ├── stores/
│       │   ├── authStore.ts        # Zustand
│       │   └── sensorStore.ts
│       ├── types/
│       │   └── index.ts
│       └── utils/
│           ├── formatters.ts
│           └── constants.ts
│
├── mosquitto/
│   └── config/
│       └── mosquitto.conf
│
├── nginx/
│   └── nginx.conf
│
└── docs/
    ├── architecture.md
    ├── protocol.md
    ├── deployment.md
    └── api.md
```

---

## STACK TECHNIQUE — VERSIONS EXACTES

### Backend (Python 3.12)
```
Django==5.1
djangorestframework==3.15
djangorestframework-simplejwt==5.4
channels==4.1
django-cors-headers==4.4
django-filter==24.3
channels-redis==4.2
celery==5.4
redis==5.1
psycopg2-binary==2.9.10
paho-mqtt==2.1
daphne==4.1
gunicorn==23.0
python-decouple==3.8
factory-boy==3.3        # tests
pytest-django==4.9      # tests
pytest-asyncio==0.24    # tests
pytest==8.3             # tests
```

### Frontend (Node 20 LTS)
```json
{
  "dependencies": {
    "react": "^18.3",
    "react-dom": "^18.3",
    "react-router-dom": "^6.26",
    "axios": "^1.7",
    "zustand": "^4.5",
    "recharts": "^2.12",
    "zod": "^3.23",
    "date-fns": "^3.6",
    "clsx": "^2.1",
    "tailwind-merge": "^2.5"
  },
  "devDependencies": {
    "typescript": "^5.5",
    "vite": "^5.4",
    "@types/react": "^18.3",
    "tailwindcss": "^3.4",
    "postcss": "^8.4",
    "autoprefixer": "^10.4",
    "vitest": "^2.0",
    "@testing-library/react": "^16.0",
    "eslint": "^9.9",
    "prettier": "^3.3"
  }
}
```

### LoRa Bridge (Python 3.12)
```
pyserial==3.5
paho-mqtt==2.1
python-decouple==3.8
structlog==24.4
```

### Firmware (PlatformIO)
```ini
[env:relay_node]
platform = atmelavr
board = nanoatmega328
framework = arduino
lib_deps =
    sandeepmistry/LoRa@^0.8.0
    paulstoffregen/OneWire@^2.3
    milesburton/DallasTemperature@^3.11
    adafruit/DHT sensor library@^1.4
monitor_speed = 115200
```

---

## MODÈLES DE DONNÉES DÉTAILLÉS

### App `iot` — models.py

```python
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator


class Greenhouse(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='greenhouses')
    name = models.CharField(max_length=100)
    location = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class Zone(models.Model):
    greenhouse = models.ForeignKey(Greenhouse, on_delete=models.CASCADE, related_name='zones')
    name = models.CharField(max_length=100)
    relay_id = models.PositiveIntegerField(validators=[MinValueValidator(1), MaxValueValidator(255)], help_text="LoRa relay node ID (1–255). Unique per greenhouse (local LoRa network).")
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    transmission_interval = models.PositiveIntegerField(default=300, help_text="Interval in seconds")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        unique_together = [['greenhouse', 'relay_id']]

    def __str__(self):
        return f"{self.greenhouse.name} - {self.name}"


class Sensor(models.Model):
    class SensorType(models.TextChoices):
        TEMPERATURE = 'TEMP', 'Temperature (°C)'
        HUMIDITY_AIR = 'HUM_AIR', 'Air Humidity (%)'
        HUMIDITY_SOIL = 'HUM_SOIL', 'Soil Humidity (%)'
        PH = 'PH', 'pH Level'
        LIGHT = 'LIGHT', 'Light (lux)'
        CO2 = 'CO2', 'CO2 (ppm)'

    zone = models.ForeignKey(Zone, on_delete=models.CASCADE, related_name='sensors')
    sensor_type = models.CharField(max_length=10, choices=SensorType.choices)
    label = models.CharField(max_length=100, blank=True)
    unit = models.CharField(max_length=20)
    min_threshold = models.FloatField(null=True, blank=True)
    max_threshold = models.FloatField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['zone', 'sensor_type']
        ordering = ['sensor_type']

    def __str__(self):
        return f"{self.zone.name} - {self.get_sensor_type_display()}"


class SensorReading(models.Model):
    sensor = models.ForeignKey(Sensor, on_delete=models.CASCADE, related_name='readings')
    value = models.FloatField()
    relay_timestamp = models.DateTimeField(null=True, blank=True, help_text="Timestamp from relay if available")
    received_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-received_at']
        indexes = [
            models.Index(fields=['sensor', '-received_at']),
            models.Index(fields=['-received_at']),
        ]

    def __str__(self):
        return f"{self.sensor}: {self.value} @ {self.received_at}"


class Actuator(models.Model):
    class ActuatorType(models.TextChoices):
        VALVE = 'VALVE', 'Water Valve'
        FAN = 'FAN', 'Ventilation Fan'
        HEATER = 'HEATER', 'Heater'
        LIGHT = 'LIGHT', 'Grow Light'
        PUMP = 'PUMP', 'Water Pump'
        SHADE = 'SHADE', 'Shade Screen'

    zone = models.ForeignKey(Zone, on_delete=models.CASCADE, related_name='actuators')
    actuator_type = models.CharField(max_length=10, choices=ActuatorType.choices)
    name = models.CharField(max_length=100)
    gpio_pin = models.PositiveIntegerField(null=True, blank=True)
    state = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({'ON' if self.state else 'OFF'})"


class Command(models.Model):
    class CommandType(models.TextChoices):
        ON = 'ON', 'Turn On'
        OFF = 'OFF', 'Turn Off'
        SET_VALUE = 'SET', 'Set Value'

    class CommandStatus(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        SENT = 'SENT', 'Sent'
        ACKNOWLEDGED = 'ACK', 'Acknowledged'
        FAILED = 'FAILED', 'Failed'
        TIMEOUT = 'TIMEOUT', 'Timeout'

    actuator = models.ForeignKey(Actuator, on_delete=models.CASCADE, related_name='commands')
    command_type = models.CharField(max_length=5, choices=CommandType.choices)
    value = models.FloatField(null=True, blank=True, help_text="Value for SET_VALUE commands")
    status = models.CharField(max_length=10, choices=CommandStatus.choices, default=CommandStatus.PENDING)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.command_type} → {self.actuator.name} [{self.status}]"


class AutomationRule(models.Model):
    class Condition(models.TextChoices):
        GREATER_THAN = 'GT', 'Greater than'
        LESS_THAN = 'LT', 'Less than'
        EQUAL = 'EQ', 'Equal to'
        GREATER_EQUAL = 'GTE', 'Greater or equal'
        LESS_EQUAL = 'LTE', 'Less or equal'

    zone = models.ForeignKey(Zone, on_delete=models.CASCADE, related_name='automation_rules')
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    sensor_type = models.CharField(max_length=10, choices=Sensor.SensorType.choices)
    condition = models.CharField(max_length=5, choices=Condition.choices)
    threshold_value = models.FloatField()
    action_actuator = models.ForeignKey(Actuator, on_delete=models.CASCADE, related_name='automation_rules')
    action_command_type = models.CharField(max_length=5, choices=Command.CommandType.choices)
    action_value = models.FloatField(null=True, blank=True)
    cooldown_seconds = models.PositiveIntegerField(default=300, help_text="Min seconds between triggers")
    is_active = models.BooleanField(default=True)
    last_triggered = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name}: IF {self.sensor_type} {self.condition} {self.threshold_value} THEN {self.action_command_type} {self.action_actuator.name}"


class Alert(models.Model):
    class AlertType(models.TextChoices):
        THRESHOLD_HIGH = 'HIGH', 'Threshold High'
        THRESHOLD_LOW = 'LOW', 'Threshold Low'
        RELAY_OFFLINE = 'OFFLINE', 'Relay Offline'
        SENSOR_ERROR = 'ERROR', 'Sensor Error'
        COMMAND_FAILED = 'CMD_FAIL', 'Command Failed'

    class Severity(models.TextChoices):
        INFO = 'INFO', 'Info'
        WARNING = 'WARNING', 'Warning'
        CRITICAL = 'CRITICAL', 'Critical'

    sensor = models.ForeignKey(Sensor, on_delete=models.CASCADE, related_name='alerts', null=True, blank=True)
    zone = models.ForeignKey(Zone, on_delete=models.CASCADE, related_name='alerts')
    alert_type = models.CharField(max_length=10, choices=AlertType.choices)
    severity = models.CharField(max_length=10, choices=Severity.choices, default=Severity.WARNING)
    value = models.FloatField(null=True, blank=True)
    message = models.TextField()
    is_acknowledged = models.BooleanField(default=False)
    acknowledged_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.severity}] {self.message}"
```

---

## PROTOCOLE LORA BINAIRE

```
Trame Relais → Centraliseur (MSG_TYPE 0x01):
┌──────────┬──────────┬────────────┬────────────────────────────┬──────┐
│ RELAY_ID │ MSG_TYPE │ SENSOR_CNT │ [TYPE(1B) VALUE(2B)] × N   │ CRC8 │
│ uint8    │ 0x01     │ uint8      │ N × 3 bytes                │ uint8│
└──────────┴──────────┴────────────┴────────────────────────────┴──────┘

Trame Centraliseur → Relais (MSG_TYPE 0x80):
┌──────────┬──────────┬──────────────┬─────────┬──────┐
│ RELAY_ID │ MSG_TYPE │ ACTUATOR_PIN │ ACTION  │ CRC8 │
│ uint8    │ 0x80     │ uint8        │ uint8   │ uint8│
└──────────┴──────────┴──────────────┴─────────┴──────┘

VALUES: int16 (signed), multiply real value × 100
  Temperature 23.45°C → 2345
  pH 6.82 → 682
  Humidity 67.5% → 6750

SENSOR_TYPES: 0x01=TEMP, 0x02=HUM_AIR, 0x03=HUM_SOIL, 0x04=PH, 0x05=LIGHT, 0x06=CO2
ACTIONS: 0x00=OFF, 0x01=ON, 0x02=SET_VALUE(+2B value)

CRC8: CRC-8/MAXIM sur tous les bytes précédents
```

---

## API ENDPOINTS

```
# Authentication (api app)
POST   /api/auth/register/
POST   /api/auth/login/                  → JWT access + refresh
POST   /api/auth/refresh/
POST   /api/auth/logout/
GET    /api/auth/me/
PATCH  /api/auth/me/

# Greenhouses (iot app)
GET    /api/greenhouses/                 → list (filtered by owner)
POST   /api/greenhouses/
GET    /api/greenhouses/{id}/
PATCH  /api/greenhouses/{id}/
DELETE /api/greenhouses/{id}/

# Zones
GET    /api/greenhouses/{id}/zones/
POST   /api/greenhouses/{id}/zones/
GET    /api/zones/{id}/
PATCH  /api/zones/{id}/
DELETE /api/zones/{id}/

# Sensors
GET    /api/zones/{id}/sensors/
POST   /api/zones/{id}/sensors/
PATCH  /api/sensors/{id}/
GET    /api/sensors/{id}/readings/?from=&to=&interval=

# Actuators
GET    /api/zones/{id}/actuators/
POST   /api/zones/{id}/actuators/
PATCH  /api/actuators/{id}/

# Commands
POST   /api/actuators/{id}/commands/
GET    /api/zones/{id}/commands/

# Automation Rules
GET    /api/zones/{id}/automations/
POST   /api/zones/{id}/automations/
PATCH  /api/automations/{id}/
DELETE /api/automations/{id}/

# Alerts
GET    /api/alerts/?zone=&severity=&acknowledged=
PATCH  /api/alerts/{id}/acknowledge/

# Dashboard
GET    /api/dashboard/                   → aggregated data for all greenhouses
GET    /api/zones/{id}/dashboard/        → zone summary with latest readings

# Export
GET    /api/zones/{id}/export/csv/?from=&to=

# WebSocket
WS     /ws/sensors/{zone_id}/           → real-time sensor readings
WS     /ws/alerts/                       → real-time alerts
```

---

## SPRINTS DE DÉVELOPPEMENT

Exécute les sprints dans l'ordre. Chaque sprint doit être **complet et fonctionnel** avant de passer au suivant. Demande-moi validation à la fin de chaque sprint.

### SPRINT 1 — Setup Projet & Infrastructure
- [x] Initialiser le repo git avec .gitignore (Python, Node, Docker)
- [x] Créer docker-compose.yml avec tous les services
- [x] Configurer PostgreSQL, Redis, Mosquitto
- [x] Scaffolder le projet Django avec settings split (base/dev/prod)
- [x] Configurer Celery avec Redis broker
- [x] Initialiser le projet React avec Vite + TypeScript + TailwindCSS
- [x] Configurer Nginx pour servir le front + proxy API
- [x] Créer le Makefile avec commandes utiles (up, down, logs, migrate, shell, test)
- [x] Écrire le .env.example
- [x] Écrire tous les modèles de données (iot app)
- [x] Créer les migrations et vérifier qu'elles passent
- [x] Configurer l'admin Django pour tous les modèles
- [x] README.md avec instructions de setup

### SPRINT 2 — Authentification & API CRUD
- [x] App api : JWT auth (register, login, refresh, logout, me)
- [x] Permissions : IsOwnerOrReadOnly, IsGreenhouseOwner, IsAuthenticated
- [x] Serializers pour tous les modèles
- [x] ViewSets CRUD pour Greenhouse, Zone, Sensor, Actuator, Command, AutomationRule, Alert
- [x] Filtrage, recherche, pagination
- [x] Tests unitaires pour chaque endpoint (pytest) — 88 tests, 0 failures
- [x] Documentation API (au minimum docstrings DRF)

### SPRINT 3 — Firmware Relais v1
- [x] Projet PlatformIO configuré
- [x] Lecture DHT22 (température + humidité air)
- [x] Lecture DS18B20 (température sol/eau)
- [x] Encodage trame binaire avec CRC8
- [x] Envoi LoRa périodique (configurable)
- [x] Mode sleep entre transmissions
- [x] Réception de commandes LoRa
- [x] Code modulaire (sensors.h, lora_protocol.h, config.h)

### SPRINT 4 — LoRa Bridge Service
- [x] Lecture port série (pyserial)
- [x] Décodage du protocole binaire
- [x] Validation CRC8
- [x] Publication MQTT (paho-mqtt)
- [x] Souscription aux commandes
- [x] Envoi de commandes via LoRa
- [x] Logging structuré (structlog)
- [x] Gestion reconnexion série/MQTT
- [x] Tests unitaires protocol + décodage — 29 tests, 0 failures

### SPRINT 5 — Ingestion Données & Stockage
- [x] MQTT worker Django (management command ou Celery)
- [x] Parse des messages MQTT → création SensorReading
- [x] Update last_seen sur Zone à chaque réception
- [x] API lecture données avec filtres temporels
- [x] Agrégation (moyenne horaire/journalière) via endpoint
- [x] Détection relais offline (Celery periodic task)
- [x] Tests d'ingestion

### SPRINT 6 — WebSocket Temps Réel
- [x] Django Channels configuré avec Redis
- [x] Consumer WebSocket pour /ws/sensors/{zone_id}/
- [x] Consumer WebSocket pour /ws/alerts/
- [x] Push des nouvelles lectures en temps réel lors de l'ingestion MQTT
- [x] Push des alertes en temps réel
- [x] Tests WebSocket (pytest-asyncio)

### SPRINT 7 — Frontend : Dashboard & Auth (TailwindCSS)
- [x] Pages Login/Register avec Zod validation
- [x] Auth store (Zustand) avec JWT + auto-refresh
- [x] Axios interceptor pour JWT
- [x] Protected routes (React Router)
- [x] Layout principal (sidebar, header, content)
- [x] Dashboard : liste des serres, cartes zones
- [x] Dashboard : dernières valeurs par capteur
- [x] Dashboard : indicateur online/offline par zone
- [x] Responsive design (mobile-first)

### SPRINT 8 — Frontend : Zone Détail & Historique
- [x] Page Zone Detail avec graphiques temps réel (Recharts)
- [x] Hook useWebSocket pour données live
- [x] Sélecteur de période (dernière heure, 24h, 7j, custom)
- [x] Graphiques historiques par capteur
- [x] Tableau des dernières lectures
- [x] Export CSV (appel API + download)
- [x] États des actionneurs de la zone

### SPRINT 9 — Frontend : Alertes
- [x] Configuration des seuils par capteur (formulaire)
- [x] Backend : Celery task évaluation seuils à chaque reading
- [x] Création d'alertes automatiques
- [x] Page liste des alertes avec filtres
- [x] Badge notification dans le header
- [x] Acknowledge d'une alerte
- [x] WebSocket pour alertes temps réel

### SPRINT INTERMÉDIAIRE — i18n + Pages Fonctionnelles
- [x] i18n infrastructure (react-i18next, i18next-browser-languagedetector, EN/FR)
- [x] Translation files: common.json + pages.json (EN + FR)
- [x] LanguageSwitcher component in Header
- [x] All existing pages migrated to i18n (Login, Register, Dashboard, ZoneDetail, Alerts, Automations)
- [x] Sidebar + Header i18n
- [x] Backend: ChangePasswordView (POST /api/auth/change-password/)
- [x] Backend: DELETE wiring for sensors + actuators
- [x] Frontend API: createSensor, deleteSensor, createActuator, deleteActuator, changePassword
- [x] Reusable UI: Modal, ConfirmDialog, FormField, SelectField
- [x] Dashboard: full CRUD greenhouses + zones via modals with Zod validation
- [x] Settings: Profile tab (user info + password change) + Resources tab (accordion CRUD tree)
- [x] History: cross-zone comparison charts (multi-zone overlay LineChart, period selector)
- [x] Commands: zone selector, actuator ON/OFF controls, command history with 5s auto-refresh
- [x] Tests: Modal, ConfirmDialog, Settings, History, Commands (frontend) + change-password (backend)
- [x] All tests pass: 83 frontend (vitest), 134 backend (pytest)
- [x] Docker build: all 6 containers built successfully

### SPRINT 10 — Commandes & Actionneurs
- [x] Page commandes : interface par zone
- [x] Boutons ON/OFF par actionneur
- [x] Pipeline complet : UI → API → MQTT → LoRa Bridge → LoRa → Relais
- [x] Feedback de status (PENDING → SENT → ACK/FAILED)
- [x] Historique des commandes par zone
- [x] Timeout des commandes (Celery task)

### SPRINT 11 — Automatisations
- [x] Page création/édition de règles
- [x] Formulaire : SI [capteur] [condition] [valeur] ALORS [actionneur] [action]
- [x] Automation engine (Celery) : évalue les règles à chaque reading
- [x] Cooldown entre déclenchements
- [x] Historique des déclenchements
- [x] Activation/désactivation des règles

### SPRINT 12 — Intégration & Production
- [x] docker-compose.prod.yml optimisé (images ARM64, healthchecks)
- [x] Nginx HTTPS (auto-signé ou Let's Encrypt)
- [x] Tests E2E du pipeline complet (capteur simulé → dashboard)
- [x] Script de simulation de données (pour démo sans matériel)
- [x] Optimisation des requêtes Django (select_related, prefetch)
- [x] Documentation complète (docs/)
- [x] Monitoring basique (healthcheck endpoints)
- [x] Seed data pour démo
- [x] Review sécurité (CORS, CSRF, rate limiting)

### SPRINT 13 — Multi-Tenancy & Organisation
**Objectif : passer d'un modèle "utilisateur solo" à un vrai SaaS collaboratif**

- [x] Modèle `Organization` avec `slug`, `plan` (FREE/PRO/ENTERPRISE), `max_greenhouses`, `max_zones`
- [x] Modèle `Membership` (user ↔ org) avec rôles : OWNER, ADMIN, OPERATOR, VIEWER
- [x] Migration des `Greenhouse` : owner → organization (rétrocompat)
- [x] Permission system revu : `IsOrganizationMember`, `HasRole(role)`
- [x] Invitation par email (token signé, expiry 48h)
- [x] API endpoints : `/api/orgs/`, `/api/orgs/{slug}/members/`, `/api/orgs/{slug}/invite/`
- [x] Frontend : page "Team Management" (invitations, rôles, revoke)
- [x] Frontend : switcher d'organisation dans le header
- [x] Tests : permissions croisées entre orgs, invitations expirées
- [x] Quotas enforced côté API (ex : 403 si FREE + > 3 serres)

---

### SPRINT 14 — Notifications & Alerting Avancé
**Objectif : sortir des alertes de l'interface et toucher les utilisateurs là où ils sont**

- [x] Modèle `NotificationChannel` : EMAIL, WEBHOOK, TELEGRAM, PUSH
- [x] Modèle `NotificationRule` : lier une alerte (severity + type) à un channel
- [x] Backend email : Django email + template HTML (threshold dépassé, relais offline)
- [x] Webhook générique : POST JSON configurable (compatible n8n, Zapier, Make)
- [x] Telegram bot : envoi via Bot API (token configurable par org)
- [x] Celery task : `dispatch_notifications` déclenché par signal post-save Alert
- [x] Digest quotidien (Celery beat, 8h du matin) : résumé des alertes non acquittées
- [x] Frontend : page "Notifications" avec config des channels par org
- [x] Tests : mock des envois email/webhook/telegram
- [x] Rate-limiting des notifications (max 1 notif / 5min par règle)

---

### SPRINT 15 — Analytics & Rapports
**Objectif : transformer les données brutes en insights actionnables**

- [x] Endpoint `/api/zones/{id}/analytics/` : stats 7j/30j (min, max, moyenne, écart-type, tendance)
- [x] Détection d'anomalies basique : z-score > 3σ → alerte `SENSOR_ERROR`
- [x] Endpoint export PDF (reportlab ou WeasyPrint) : rapport hebdomadaire par zone
- [x] Agrégation time-series : table `SensorReadingHourly` (materialized via Celery beat)
- [x] Frontend : page "Analytics" avec heatmap calendrier (jours × valeur moyenne)
- [x] Frontend : carte de corrélation entre capteurs (ex : T° vs HUM_AIR)
- [x] Frontend : rapport PDF téléchargeable avec sélecteur de période
- [x] API `/api/orgs/{slug}/analytics/summary/` : vue globale multi-serres
- [x] Tests : calculs stat, génération PDF, perf requêtes agrégation

---

### SPRINT 16 — Scénarios & Programmes Horaires
**Objectif : automatisation temporelle avancée, au-delà du simple seuil**

- [x] Modèle `Schedule` : actions planifiées (cron-style ou time ranges)
- [x] Modèle `Scenario` : séquence d'actions nommée (ex : "Arrosage matin")
- [x] Modèle `ScenarioStep` : actionneur + action + délai + durée
- [x] Celery beat dynamique : charger les schedules depuis DB (django-celery-beat)
- [x] API CRUD complet pour `Schedule`, `Scenario`, `ScenarioStep`
- [x] Frontend : "Scenario Builder" drag-and-drop (timeline visuelle des étapes)
- [x] Frontend : calendrier hebdomadaire des programmes (style Google Calendar)
- [x] Exécution de scénario manuel depuis l'UI ("Lancer maintenant")
- [x] Gestion des conflits (un actionneur ne peut pas être dans 2 scénarios actifs)
- [x] Tests : ordonnancement des steps, conflits, exécution Celery

---

### SPRINT 17 — Mobile App & PWA
**Objectif : expérience mobile native sans app store**

- [x] PWA : `manifest.json`, service worker (Vite PWA plugin), offline fallback page
- [x] Push notifications web (Web Push API + VAPID keys)
- [x] Refonte UX mobile : bottom navigation bar, swipe gestures sur les cartes
- [x] Page "Quick Actions" : contrôle rapide des actionneurs depuis l'accueil mobile
- [x] Optimisation performance : lazy loading routes, code splitting, skeleton screens
- [x] Dark mode complet (CSS variables, toggle persisté dans Zustand + localStorage)
- [x] Widget "Zone Status" : composant compact pour l'écran d'accueil PWA
- [x] Tests Lighthouse : score > 90 PWA, Performance, Accessibility
- [x] Tests : service worker, offline behavior, push subscription

---

### SPRINT 17 BIS — Refonte UI/UX & Identité Visuelle
**Objectif : donner à la plateforme un design unique, professionnel, responsive et identitaire, prêt pour le SaaS, avec des animations simples, fluides, immersives**

- [x] Mise en place du Design System : DaisyUI + TailwindCSS (LLM: https://daisyui.com/llms.txt)
- [x] Définition des tokens : couleurs, typographies, spacing, icônes
- [x] Création du layout global : header, sidebar, footer, responsive breakpoints
- [x] Refonte Dashboard : cartes, tableaux, graphiques avec style uniforme
- [x] Refonte Zone Detail & Analytics : graphiques, heatmaps, corrélations
- [x] Refonte Pages Commands & Alerts : feedback visuel, boutons, modals
- [x] Refonte Settings / Profile / Team Management : formulaires, tables, rôles
- [x] Intégration branding : logo, favicon, palette couleurs, dark/light mode
- [x] Micro-interactions & animations pour l'immersion (style Duolingo) : hover, focus, transitions (framer-motion / TailwindCSS)
- [x] Responsive mobile & PWA : bottom nav bar, swipe gestures, skeleton screens
- [x] Tests Lighthouse : Performance > 90, Accessibility, PWA compliance
- [x] Tests composants : Storybook, tests unitaires frontend (Vitest + RTL)
- [x] QA cross-browser : Chrome, Firefox, Safari, Edge + mobile / tablette
- [x] Documentation du Design System et des composants pour usage futur
- [x] Version finale “brandée” prête pour production et intégration multi-tenant

---

### SPRINT 18 — Observabilité & Production Hardening
**Objectif : un système qu'on peut opérer sereinement en production réelle**

- [x] Structured logging unifié : structlog backend + pino frontend → format JSON
- [x] Sentry integration (backend + frontend) avec source maps
- [x] Healthcheck endpoints enrichis : `/api/health/` (DB, Redis, MQTT, Celery)
- [x] Métriques Prometheus : `django-prometheus` + custom metrics (readings/min, commands/min)
- [x] Grafana dashboard pré-configuré (docker-compose.prod.yml)
- [x] Rate limiting API : `django-ratelimit` par user et par IP
- [x] Backup automatique PostgreSQL : script + cron Docker (dump → S3/local)
- [x] Migration zéro-downtime : `django-zero-downtime-migrations`
- [x] Audit log : modèle `AuditEvent` (qui a fait quoi, quand, sur quoi)
- [x] Tests de charge basiques : locust scenario (100 zones, 1000 readings/min)
- [x] Hardening sécurité : CORS strict, Content-Security-Policy, HSTS, secrets rotation doc

---

### SPRINT 19 — Marketplace de Templates
**Objectif : permettre aux utilisateurs de partager et réutiliser des configurations**

- [x] Modèle `Template` : snapshot exportable d'une zone (capteurs + actionneurs + règles + scénarios)
- [x] Modèle `TemplateCategory` : maraîchage, floriculture, hydroponie, champignons, etc.
- [x] API : publish, clone, rate (1-5 étoiles), search/filter templates
- [x] Frontend : page "Marketplace" avec cards, filtres, preview détaillée
- [x] Import d'un template sur une zone existante (merge ou replace)
- [x] Templates officiels Greenhouse (seed data) : tomate, laitue, fraise, basilic, tulipe, etc.
- [x] Versioning des templates (`version` + changelog)
- [x] Tests : clone, import, conflits de merge

---

### SPRINT 20 — Intelligence Artificielle & Prédictions
**Objectif : valeur ajoutée IA sur les données collectées**

- [x] Prédiction de dérive : régression linéaire sur les 24 dernières heures → alerte si tendance critique
- [x] Détection d'anomalies ML : Isolation Forest (scikit-learn) sur les readings par capteur
- [x] Endpoint `/api/zones/{id}/predictions/` : valeurs prédites sur les 6 prochaines heures
- [x] "Smart Suggestions" : recommandation d'ajustement de seuils basée sur l'historique
- [x] Rapport hebdomadaire IA : résumé en langage naturel (template Jinja2 + stats)
- [x] Celery task : entraînement incrémental des modèles par zone (toutes les 24h)
- [x] Frontend : widget "Prédictions" dans ZoneDetail (graphe + intervalle de confiance)
- [x] Frontend : badge "Anomalie détectée" avec explication
- [x] Tests : fixtures de séries temporelles connues, assertions sur prédictions

---

### SPRINT 21 — API Publique & Developer Platform
**Objectif : permettre à des tiers de s'intégrer à la plateforme**

- [x] Modèle `APIKey` : clé longue durée par organisation (scope : read / write / admin)
- [x] Authentification par API Key (header `X-API-Key`) en parallèle du JWT
- [x] Rate limiting par clé (configurable par plan)
- [x] Versioning API : préfixe `/api/v1/` + header `API-Version`
- [x] Documentation OpenAPI auto-générée (drf-spectacular) + UI Swagger/Redoc
- [x] SDK Python client auto-généré (openapi-generator) + publié sur PyPI
- [x] Webhooks configurables (événements : new_reading, alert_created, command_ack)
- [x] Sandbox de test : org dédiée avec données simulées
- [x] Frontend : page "Developer" avec gestion des API Keys + logs d'appels
- [x] Tests : auth par clé, scopes, rate limiting, webhook delivery

---

### SPRINT 22 — Billing & Plans SaaS
**Objectif : monétiser la plateforme de façon robuste**

- [x] Intégration Stripe (stripe-python) : produits FREE / PRO / ENTERPRISE
- [x] Modèle `Subscription` : plan, status, period_end, stripe_subscription_id
- [x] Webhooks Stripe : payment_succeeded, payment_failed, subscription_cancelled
- [x] Enforcement des quotas par plan (middleware Django)
- [x] Page "Billing" : plan actuel, usage (zones/serres/membres), upgrade CTA
- [x] Page "Upgrade" : tableau comparatif des plans + Stripe Checkout
- [x] Emails transactionnels : confirmation paiement, échec, rappel renouvellement
- [x] Trial 14 jours automatique à l'inscription
- [x] Tests : webhooks Stripe mockés, enforcement quotas, trial expiry

---

### SPRINT 23 — Data Pipeline & Historique Long Terme
**Objectif : gérer des volumes de données industriels sans dégrader les perfs**

- [x] Partitionnement PostgreSQL de `SensorReading` par mois (pg_partman)
- [x] Politique de rétention configurable : raw data 30j, hourly 1an, daily forever
- [x] Archivage cold storage : export automatique S3/MinIO des partitions expirées
- [x] Vue matérialisée `sensor_reading_daily` rafraîchie toutes les heures
- [x] Timescale DB optionnel : migration path documentée
- [x] API streaming : `/api/zones/{id}/readings/stream/` (Server-Sent Events)
- [x] Frontend : mode "Big Data" pour les graphiques (downsampling LTTB algorithm)
- [x] Benchmarks : 10M readings → temps de réponse < 200ms sur les agrégats
- [x] Tests : partitionnement, archivage, downsampling visuel

---

### SPRINT 24 — Multi-Site & Cartographie
**Objectif : gérer des exploitations avec plusieurs sites géographiques**

- [x] Modèle `Site` : localisation GPS, timezone, météo locale
- [x] Intégration API météo (Open-Meteo, gratuit) : température ext., précipitations, UV
- [x] Corrélation météo ↔ données capteurs dans les analytics
- [x] Frontend : carte interactive (Leaflet.js) avec marqueurs par site
- [x] Vue "multi-site" : tableau de bord global avec statut par site
- [x] Alertes géo-contextuelles : "Canicule prévue demain, ajuster les seuils ?"
- [x] Export cartographique : snapshot PNG de la carte avec état des zones
- [x] Tests : geocoding, intégration météo mockée, rendu carte

---

### SPRINT 25 — Conformité & Traçabilité Agricole
**Objectif : répondre aux exigences réglementaires (filière bio, certifications)**

- [x] Modèle `CropCycle` : culture en cours par zone (espèce, variété, date semis/récolte)
- [x] Journal de culture automatique : log de toutes les interventions (commandes + alertes + notes manuelles)
- [x] Rapport de traçabilité PDF : conditions de culture sur une période donnée
- [x] Conformité RGPD : export de toutes les données utilisateur (DSAR), droit à l'oubli
- [x] Modèle `Note` : annotation manuelle sur une zone à un instant t (observations terrain)
- [x] Signature électronique des rapports (hash SHA256 + timestamp)
- [x] API export conforme GlobalG.A.P. (JSON schema normalisé)
- [x] Frontend : page "Journal de Culture" avec timeline chronologique
- [x] Tests : génération rapports, conformité RGPD, intégrité hash

---

### SPRINT 26 — Refonte UX/Navigation & Cohérence Produit
- [x] Réduction du menu à 5 items groupés : Vue d'ensemble, Supervision, Contrôle, Données, Administration
- [x] Sidebar repliable avec icônes seules en mode compact (gain d'espace sur tablette)
- [x] Mobile Navigation : réduire aux 5 items et ne pas afficher les sous-items (ex : Sites, Analytics, Commands dans Supervision), juste les icones et badges si notifications / alertes
- [x] Breadcrumb contextuel sur toutes les pages profondes (Serre > Zone > Capteur)
- [x] Pages 404 et erreur globale brandées
- [x] Redirection intelligente post-login selon le rôle (OPERATOR → Contrôle, VIEWER → Dashboard)
- [x] Variable d'env `EDGE_MODE` (backend) + `VITE_EDGE_MODE` (frontend)
- [x] Hook `useAppMode()` : expose `isEdgeMode`, `isCloudMode`, `features`
- [x] Composant `<FeatureGate feature="...">` pour conditionner l'affichage selon le mode
- [x] Menu dynamique : items LoRa Bridge et MQTT visibles uniquement en Edge mode
- [x] Menu dynamique : items CRM et Sync visibles uniquement en Cloud mode
- [x] Badge contextuel dans le header : "Edge — Site principal" vs "Cloud — Accès distant"
- [x] Settings restructuré en 4 onglets : Profil / Organisation / Notifications / Sécurité
- [x] Suppression création de serre dans Settings → déplacée dans le Dashboard uniquement
- [x] Page `/billing` dédiée dans Administration (sortie des Settings)
- [x] Page `/team` dédiée dans Administration (sortie des Settings)
- [x] Page `/developer` dédiée dans Administration (sortie des Settings)
- [x] Index `/administration` : hub avec cards vers chaque section + résumé usage du plan
- [x] Page `Sites` : carte Leaflet full-width + liste des sites en sidebar + statut + météo locale
- [x] Page `Sites` : clic sur une card → zoom animé `flyTo` vers le marqueur (zoom 15, durée 0.8s, popup auto)
- [x] Page `Sites` : marqueur sélectionné mis en surbrillance avec pulse animation
- [x] Page `Sites` : lien bidirectionnel — clic sur marqueur map → scroll vers la card correspondante
- [x] Page `Sites` : bouton "Vue globale" pour dezoom sur tous les sites
- [x] Page `Journal de Culture` : timeline chronologique avec filtres
- [x] Page `Marketplace` : grid de cards avec filtres latéraux, preview modale, notation étoiles
- [x] Page `Predictions` : graphe confidence interval + explication IA en langage naturel
- [x] Page `Developer` : code snippets, logs d'appels en temps réel
- [x] Onboarding first-login : wizard 3 étapes (créer org → créer serre → créer zone)
- [x] Empty states sur toutes les pages (illustration + CTA quand pas de données)
- [x] Confirmation systématique sur les actions destructives (supprimer serre, révoquer membre)
- [x] Feedback toast unifié sur toutes les mutations API (succès, erreur, loading)
- [x] Validation inline temps réel (Zod) sur tous les formulaires, pas seulement au submit
- [x] Commandes actionneurs : animation feedback 3 états (PENDING → SENT → ACK/FAILED)
- [x] Audit complet mobile : toutes les pages testées sur 375px, 768px, 1280px
- [x] Navigation mobile : bottom bar avec les 5 groupes, swipe entre onglets
- [x] Tableaux responsives : version card sur petits écrans
- [x] Labels ARIA sur tous les graphiques Recharts
- [x] Skeleton loaders cohérents sur toutes les pages
- [x] Tests Vitest sur `useAppMode()` et `<FeatureGate>`
- [x] Tests navigation : routes protégées par rôle
- [x] Tests empty states
- [x] Lighthouse CI : Performance > 90, Accessibility > 90, PWA ✅

---

### SPRINT 27 — Edge Sync Agent
- [x] Modèle `EdgeDevice` : `device_id` (UUID), `organization`, `name`, `secret_key` (HMAC), `last_sync_at`, `firmware_version`, `is_active`
- [x] Champ `cloud_synced` (BooleanField, db_index) sur `SensorReading`, `Command`, `Alert`, `AuditEvent`
- [x] Champ `cloud_synced_at` (DateTimeField, null) sur les mêmes modèles
- [x] Migration et vérification sans régression sur les tests existants
- [x] Celery task `sync_to_cloud` : collecte les enregistrements `cloud_synced=False`, envoie en batch HTTPS vers l'API cloud
- [x] Compression gzip des payloads de sync
- [x] Authentification edge → cloud : HMAC-SHA256 sur chaque requête (clé longue durée, pas de JWT)
- [x] Store-and-forward : si cloud injoignable, retry exponentiel (1min → 5min → 15min → 1h)
- [x] Celery beat : sync automatique toutes les 5 minutes + bulk sync nocturne à 2h
- [x] Gestion des conflits : "edge wins" sur les readings, "cloud wins" sur les configs
- [x] Management command `force_sync` : déclenche une sync immédiate manuelle
- [x] Endpoint `/api/sync/status/` : dernière sync, backlog en attente, nb enregistrements
- [x] Widget "Sync Status" dans le header : ✅ synced / ⏳ X en attente / ❌ offline
- [x] Page `/sync` dans Administration : historique des syncs, taille des batches, erreurs
- [x] Indicateur visuel sur les données non encore synchronisées (badge discret)
- [x] Test sync réussie : mock API cloud, vérifier `cloud_synced=True` après task
- [x] Test retry sur timeout : mock API cloud down, vérifier backlog replay
- [x] Test auth HMAC : requête sans signature → 403
- [x] Test compression : payload gzip décodé correctement côté cloud
- [x] Test management command `force_sync`

---

### SPRINT 28 — Cloud CRM Platform
- [x] Settings `config/settings/cloud.py` séparé de `production.py` : `EDGE_MODE=False`, `CLOUD_MODE=True`
- [x] `docker-compose.cloud.yml` : Django cloud + PostgreSQL + Redis + Celery + Nginx
- [x] HTTPS Let's Encrypt via Certbot sur domaine `cloud.ton-domaine.com`
- [x] Modèle `CloudTenant` : `organization` (OneToOne), `edge_devices` (M2M), `cloud_storage_mb`, `last_activity`, `support_notes`
- [x] Modèle `SyncBatch` : `edge_device`, `received_at`, `records_count`, `payload_size_kb`, `status`, `error_message`
- [x] Déduplication des readings : via `relay_timestamp` + `sensor_id` + `value`
- [x] Endpoint `/api/edge/register/` : enregistrement Raspberry Pi, génère UUID + secret HMAC
- [x] Endpoint `/api/edge/sync/` : reçoit les batches, valide HMAC, insère via Celery worker dédié
- [x] Endpoint `/api/edge/config/` : push de config vers l'edge (seuils, schedules, automation rules)
- [x] Endpoint `/api/crm/tenants/` : liste clients avec stats (serres, zones, dernière activité, plan)
- [x] Endpoint `/api/crm/tenants/{id}/health/` : état de santé site client (sync, devices online, alertes)
- [x] Endpoint `/api/crm/stats/` : métriques globales (nb clients, readings/jour, uptime moyen)
- [x] Endpoint `/api/crm/tenants/{id}/impersonate/` : token temporaire 30min pour voir les données d'un client
- [x] Page `/crm` (Cloud only, `<FeatureGate feature="crm">`) : liste tous les clients, statut sync, plan, dernière activité
- [x] Page `/crm/{id}` : serres, zones, devices, historique syncs, notes support
- [x] Carte mondiale Leaflet : tous les sites clients avec statut (réutilise Sprint 24 ✅)
- [x] Métriques globales : graphique readings/jour par client, taux alertes, uptime
- [x] Gestion plans : upgrade/downgrade manuel d'un client depuis le CRM
- [x] Outil support : bouton "Voir comme ce client" (impersonate, expiry 30min)
- [x] Alertes opérateur : client sans sync 24h, device offline, espace disque critique
- [x] Export CSV liste clients
- [x] Bandeau client accès distant : "Données synchronisées — dernière mise à jour il y a Xmin"
- [x] Page "Mes Devices" : liste Raspberry Pi enregistrés, statut sync, version firmware
- [x] Script `onboard_client.sh` : génère credentials edge, injecte dans le `.env` du Raspberry
- [x] Backup cloud : pg_dump quotidien vers S3, rétention 30 jours
- [x] Rétention différenciée : raw 90j cloud vs 30j edge, agrégats permanents
- [x] Documentation `docs/deployment-cloud.md`
- [x] Test ingestion batch : mock edge device, vérifier données insérées en base cloud
- [x] Test déduplication : même batch envoyé deux fois → pas de doublon
- [x] Test auth HMAC : requête sans signature → 403
- [x] Test impersonate : token expiré après 30min
- [x] Test dashboard CRM : accès réservé aux opérateurs

---

### SPRINT 29 — Polish Final & Mise en Production
- [x] Audit complet des TODO restants dans la codebase (zéro TODO sans ticket associé)
- [x] Optimisation requêtes Django : select_related/prefetch_related audités, N+1 éliminés (sprint 12+)
- [x] Bundle frontend : lazy loading React.lazy sur toutes les pages + manual chunks Vite (Leaflet, Recharts, i18n, framer-motion)
- [x] Suppression des `console.log` et `print()` de debug restants (logger.ts structuré, structlog backend)
- [x] `docs/roadmap.md` : roadmap complète sprints 1-29 à jour
- [x] `docs/architecture.md` : schéma Edge + Cloud mis à jour avec feature flags, sync protocol, multi-tenancy
- [x] `docs/deployment.md` : guide déploiement edge sur Raspberry Pi (< 1h chrono) + secrets rotation procedure
- [x] `docs/deployment-cloud.md` : guide déploiement cloud sur VPS (< 30min chrono)
- [x] `docs/onboarding.md` : guide premier client pas à pas (de l'achat matériel à la première donnée)
- [x] `docs/security.md` : OWASP Top 10 checklist + headers + GDPR + rate limits
- [x] `README.md` : badges CI, lien démo live, make demo, documentation table
- [x] Seed data enrichi : 3 clients fictifs, 5 serres, 20 zones, 6 mois de données simulées (`seed_demo` command)
- [x] Script de démo `make demo` : lance tout + seed avec donnée sur 6 mois + ouvre le browser automatiquement
- [x] Compte démo public : `demo@greenhouse-saas.com` / `demo1234` en read-only
- [x] Checklist OWASP Top 10 manuelle → `docs/security.md`
- [x] Headers sécurité vérifiés et ajoutés : CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy (nginx.conf + frontend/nginx.conf)
- [x] Rate limiting Nginx ajouté sur login (10r/m), register (10r/m), edge/sync (60r/m)
- [x] Procédure rotation secrets documentée : JWT_SECRET, HMAC_KEY, Stripe keys, PostgreSQL, Redis
- [x] Audit RGPD final : données personnelles cartographiées dans docs/security.md, rétention vérifiée
- [x] Rate limiting vérifié sur tous les endpoints publics (register, login, edge/sync)
- [x] GitHub Actions : lint + test + build sur chaque PR (`.github/workflows/ci.yml`)
- [x] GitHub Actions : deploy automatique sur VPS cloud sur merge main (`.github/workflows/deploy.yml`)
- [x] Suite E2E Playwright : scénario login → dashboard + sensor pipeline + security headers (`frontend/e2e/`)
- [x] Tests cross-browser configurés : Chrome, Firefox, Safari, mobile Chrome, mobile Safari (playwright.config.ts)
- [ ] Healthcheck monitoring : UptimeRobot sur `/api/health/` (configuration externe — à faire post-déploiement)
- [ ] Test de charge Locust : 50 clients simultanés, 10 000 readings/min (locustfile.py existant — à exécuter en prod)
- [ ] Tous les tests passent : pytest + vitest + Playwright, 0 failures (à valider sur environment cible)

---

## SPRINT 30 — Design System & UI/UX Foundation
- [x] Définir la palette dark mode : `bg-dark: #0b0f12`, `primary: #00ff9c`, `secondary: #00d9ff`, `warning: #ffb300`, `danger: #ff4d4f`
- [x] Définir la palette light mode : `bg: #f6f8f9`, `primary: #1e7f5c`, `accent: #2dbf7f`
- [x] Intégrer les tokens de couleur dans Tailwind config (`extend.colors`) et variables CSS DaisyUI
- [x] Configurer le thème DaisyUI custom "greenhouse-dark" et "greenhouse-light"
- [x] Installer et configurer Framer Motion pour les animations (déjà installé, utilisé activement)
- [x] Installer Lucide React + Heroicons, définir les icônes standards par contexte (capteur, actionneur, alerte, zone)
- [x] Implémenter les effets glassmorphism : `backdrop-blur`, `bg-opacity`, `border-white/10`
- [x] Implémenter les glow borders : `box-shadow` néon vert/cyan sur les cards actives
- [x] Implémenter les gradient blur de fond sur les pages principales
- [x] Composant `<GlowCard />` : card avec glow border animé au hover, glassmorphism background
- [x] Composant `<MetricTile />` : tuile de métrique avec valeur, unité, tendance et sparkline
- [x] Composant `<LiveIndicator />` : point pulsant vert/rouge selon l'état de connexion
- [x] Composant `<ZoneStatusBadge />` : badge zone avec couleur selon état (online, offline, alerte)
- [x] Composant `<AutomationChip />` : chip compact affichant une règle active avec icône
- [x] Composant `<CommandButton />` : bouton ON/OFF avec feedback 3 états et animation
- [x] Composant `<SensorChart />` : graphique Recharts standardisé avec thème dark/light intégré
- [x] Micro-animation "capteur connecté" : pulse vert sur `<LiveIndicator />` à la réception d'un reading
- [x] Micro-animation "automation déclenchée" : ripple animation sur `<AutomationChip />` au trigger
- [x] Micro-animation "alerte acquittée" : confetti léger (Framer Motion) sur acknowledge
- [x] Micro-animation "commande envoyée" : progress pulse sur `<CommandButton />` pendant PENDING
- [x] Dashboard signature : layout 4 blocs (Global Overview, Map/Zones, Live Feed, Alerts)
- [x] Dashboard : widgets Global Overview avec live gauges (greenhouses, zones, zones online, alertes actives)
- [x] Dashboard : zone cards avec GlowCard + ZoneStatusBadge et statut en temps réel
- [x] Dashboard : live feed des dernières lectures en scroll infini
- [x] Optimisation performance Edge : `prefers-reduced-motion` respecté sur toutes les animations
- [x] Optimisation performance Edge : animations CSS uniquement (GPU transforms), zéro JS runtime pour les effets visuels
- [x] Optimisation performance Edge : lazy loading des composants `<SensorChart />` (hors viewport non rendu via IntersectionObserver)
- [x] Documenter le design system dans `docs/design-system.md` : tokens, composants, usages, exemples
- [x] Tests Vitest sur chaque composant UI (`<GlowCard />`, `<MetricTile />`, `<LiveIndicator />`, `<ZoneStatusBadge />`, `<AutomationChip />`, `<CommandButton />`, `<SensorChart />`) — 295 tests, 0 failures
- [ ] Tests Lighthouse après intégration : Performance > 90 maintenu malgré les animations (à valider en environnement cible)
- [ ] QA cross-device : vérifier les effets glassmorphism et glow sur mobile (iOS Safari, Android Chrome) (à valider en device réel)

---

### SPRINT 31 — Crop Intelligence & Plant Health Engine
- [x] Modèle `CropStatus` : `zone` (OneToOne), `growth_status`, `hydration_status`, `heat_stress`, `yield_prediction`, `plant_health_score`, `calculated_at`
- [x] Modèle `CropIndicatorPreference` : `user`, `indicator`, `enabled` — chaque utilisateur choisit ses indicateurs affichés
- [x] Celery task `calculate_crop_status` : calcul toutes les 15 minutes par zone active
- [x] Indicateur Croissance : calcul Growing Degree Days (GDD) basé sur température moyenne + lumière + stade de culture → `lente / normale / rapide`
- [x] Indicateur Hydratation : calcul evapotranspiration basé sur humidité sol + humidité air + température → `sèche / correcte / optimale / excès`
- [x] Indicateur Stress thermique : calcul Heat Index basé sur température + humidité → `nul / léger / élevé / critique`
- [x] Indicateur Rendement estimé : `yield_prediction = growth_score × hydration_score × light_score` → résultat en % positif ou négatif
- [x] Indicateur Vigueur de la plante : `plant_health_score = temp_score + water_score + light_score + co2_score` → résultat en %
- [x] Indicateur Risque maladie : basé sur humidité + température + condensation (modèle Downy Mildew) → `faible / modéré / élevé`
- [x] Indicateur Stress climatique : basé sur vent + température + humidité → `faible / modéré / fort`
- [x] Indicateur Lumière disponible : basé sur capteur lux/PAR → `insuffisante / correcte / optimale`
- [x] Indicateur Temps avant récolte : basé sur progression GDD → `Harvest ETA : X jours`
- [x] Indicateur Besoin irrigation : basé sur evapotranspiration → `Irrigation recommandée : X L/plante`
- [x] Endpoint `GET /api/zones/{id}/crop-status/` : retourne `growth`, `hydration`, `heat_stress`, `yield_prediction`, `plant_health`, `disease_risk`, `harvest_eta_days`, `irrigation_needed`
- [x] Endpoint `PATCH /api/zones/{id}/crop-indicator-preferences/` : sauvegarde les préférences d'indicateurs par utilisateur
- [x] Widget `<CropIntelligenceCard />` : affiche les indicateurs activés avec emoji, label et valeur
- [x] Widget : glow vert si tous les indicateurs OK, orange si alerte légère, rouge si indicateur critique
- [x] Widget : animations Framer Motion selon sévérité (pulse vert, orange, rouge)
- [x] Page préférences indicateurs : checkboxes par indicateur (Croissance, Hydratation, Stress thermique, Rendement, Santé, Risque maladie, Irrigation, etc.)
- [x] Intégration widget `<CropIntelligenceCard />` dans ZoneDetail et Dashboard
- [x] Calcul Celery uniquement côté worker, pas dans l'UI — stockage 1 résultat / 15min, compatible Raspberry Pi
- [x] Test `test_growth_calculation` : fixtures GDD connues, assertion sur `growth_status`
- [x] Test `test_heat_stress` : fixtures température + humidité, assertion sur niveau de stress
- [x] Test `test_irrigation_need` : fixtures evapotranspiration, assertion sur `irrigation_needed`
- [x] Test `test_yield_prediction` : fixtures multi-scores, assertion sur `yield_prediction` en %
- [x] Test `test_disease_risk` : fixtures humidité + température élevées, assertion sur `disease_risk = élevé`
- [x] Test endpoint `GET /api/zones/{id}/crop-status/` : vérifier structure JSON retournée

---

### SPRINT 32 — Multi-Tenant relay_id & MQTT Gateway Scoping
**Objectif : corriger la contrainte d'unicité du relay_id pour permettre à chaque client d'utiliser les mêmes identifiants LoRa locaux (1–255) sans collision entre tenants**

- [x] Supprimer `unique=True` global sur `Zone.relay_id` — remplacé par `unique_together = [["greenhouse", "relay_id"]]`
- [x] Ajouter `help_text` sur `Zone.relay_id` : "LoRa relay node ID (1–255). Unique per greenhouse (local LoRa network)."
- [x] Migration `0019_zone_relay_id_unique_per_greenhouse` : `AlterField` + `AlterUniqueTogether`
- [x] Ajouter `GATEWAY_ID` dans `lora-bridge/bridge/config.py` (UUID = `EdgeDevice.device_id` enregistré dans Django)
- [x] Mettre à jour les topics MQTT dans `config.py` : `greenhouse/{gateway_id}/relay/{relay_id}/sensors`, `greenhouse/{gateway_id}/relay/{relay_id}/ack`, `greenhouse/{gateway_id}/commands/+`
- [x] `mqtt_client.py` : formater `gateway_id=config.GATEWAY_ID` dans `publish_sensor_data`, `publish_command_ack`, `_on_connect`
- [x] `mqtt_worker.py` : `TOPIC_SENSORS = "greenhouse/+/relay/+/sensors"`, `TOPIC_COMMAND_ACK = "greenhouse/+/relay/+/ack"`
- [x] `mqtt_worker.py` : extraire `gateway_id = parts[1]` depuis le topic ; relay_id ACK à `parts[3]`
- [x] `mqtt_worker.py` : signature `_process_readings(self, gateway_id: str, relay_id: int, readings: list[dict])`
- [x] `mqtt_worker.py` : validation UUID avant requête DB (`uuid.UUID(str(gateway_id))`) — rejette les gateway_id malformés sans erreur Django
- [x] `mqtt_worker.py` : lookup Zone scopé par tenant : `Zone.objects.get(relay_id=relay_id, greenhouse__organization__edge_devices__device_id=gateway_id)`
- [x] `mqtt_worker.py` : gestion `Zone.MultipleObjectsReturned` (log + skip)
- [x] `conftest.py` : ajout `EdgeDeviceFactory` (organization, name, secret_key 64 chars, firmware_version, is_active)
- [x] `test_mqtt_worker.py` : fixture `zone_with_sensors` retourne `(zone, sensors, gateway_id)` + crée un `EdgeDevice`
- [x] `test_mqtt_worker.py` : mise à jour de tous les appels `_process_readings` avec `gateway_id`
- [x] `test_mqtt_worker.py` : topics `_on_message` au format `greenhouse/{gateway_id}/relay/42/sensors`
- [x] `test_mqtt_worker.py` : ajout `test_wrong_gateway_id_skipped` — gateway inconnu ne crée aucun reading
- [x] `test_models.py` : `test_relay_id_unique_within_greenhouse` + `test_relay_id_shared_across_greenhouses` (deux serres, même relay_id=1 — pas d'erreur)
- [x] `.env.example` : ajout `GATEWAY_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- [x] 771 tests backend passent, 35 tests lora-bridge passent, Docker build OK

---

# MÉTHODOLOGIE : Écrire des Sprints UI/UX que les LLMs peuvent exécuter correctement

## Le Problème

Les LLMs génèrent du code backend structuré et fiable parce que le backend est **déterministe** : un endpoint retourne du JSON, un test passe ou échoue. En revanche, le frontend est **perceptuel** — "une belle card" est ambiguë, et le LLM remplit le vide avec du générique.

## Les 7 Règles d'Or

### Règle 1 — NE JAMAIS décrire un composant sans son ANATOMY (layout ASCII)

❌ **Mauvais** : "Créer une card affichant le statut de la zone"

✅ **Bon** :
```
┌─────────────────────────────────────────────┐
│ ● Online    Zone Nord                  ⚙️   │  ← header: h-12, flex justify-between
│─────────────────────────────────────────────│
│                                             │
│  🌡️ 24.3°C        💧 78%        ☀️ 840 lux  │  ← metrics row: grid grid-cols-3, gap-4
│  ▾ -0.2°C/h       ▴ +2%/h       — stable   │  ← trends: text-xs, color-coded
│                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │ ████░░░ │ │ ██████░ │ │ █████░░ │      │  ← sparklines: h-8, last 1h
│  └─────────┘ └─────────┘ └─────────┘      │
│                                             │
│  💡 Grow Light ●ON    🚿 Irrigation ○OFF   │  ← actuators row: flex wrap, gap-2
│─────────────────────────────────────────────│
│  Dernière lecture : il y a 12s         →    │  ← footer: h-10, text-xs, muted
└─────────────────────────────────────────────┘
```

### Règle 2 — PRESCRIRE les classes Tailwind, pas les décrire

❌ **Mauvais** : "La card doit avoir un fond sombre semi-transparent avec un léger blur"

✅ **Bon** :
```
Container : bg-base-200/60 backdrop-blur-md border border-white/5 rounded-2xl
            shadow-lg shadow-black/20
Hover     : hover:border-primary/30 hover:shadow-primary/10 hover:shadow-xl
            transition-all duration-300 ease-out
Active    : ring-2 ring-primary/50 border-primary/40
```

### Règle 3 — SPÉCIFIER chaque état visuellement (State Matrix)

Chaque composant interactif doit avoir une matrice :

| État | Background | Border | Texte | Icône | Animation |
|------|-----------|--------|-------|-------|-----------|
| Default | `bg-base-200/60` | `border-white/5` | `text-base-content` | `text-base-content/60` | — |
| Hover | `bg-base-200/80` | `border-primary/30` | `text-base-content` | `text-primary` | `scale-[1.02]` 300ms ease-out |
| Active/Selected | `bg-primary/10` | `border-primary/50` | `text-primary` | `text-primary` | `ring-2 ring-primary/30` |
| Loading | `bg-base-200/40` | `border-white/5` | — | — | `animate-pulse` sur skeleton |
| Error | `bg-error/5` | `border-error/30` | `text-error` | `text-error` | `shake` 300ms |
| Disabled | `bg-base-200/30` | `border-white/3` | `text-base-content/30` | `text-base-content/20` | `cursor-not-allowed opacity-50` |
| Empty | `bg-base-200/40` | `border-dashed border-white/10` | `text-base-content/40` | `text-base-content/20` | — |

### Règle 4 — DESSINER les layouts responsives, pas juste dire "responsive"

❌ **Mauvais** : "Responsive mobile-first"

✅ **Bon** :
```
DESKTOP (≥1280px) :
┌──────────┬───────────────────────────────────────┐
│ Sidebar  │  ┌─────────┐ ┌─────────┐ ┌─────────┐│
│ w-64     │  │ Card 1  │ │ Card 2  │ │ Card 3  ││
│          │  └─────────┘ └─────────┘ └─────────┘│
│          │  grid grid-cols-3 gap-6              │
│          │                                       │
│          │  ┌───────────────────────────────────┐│
│          │  │ Chart — full width, h-80          ││
│          │  └───────────────────────────────────┘│
└──────────┴───────────────────────────────────────┘

TABLET (768px–1279px) :
┌──────────┬────────────────────────┐
│ Sidebar  │  ┌────────┐ ┌────────┐│
│ w-16     │  │ Card 1 │ │ Card 2 ││
│ (icons)  │  └────────┘ └────────┘│
│          │  ┌────────┐            │
│          │  │ Card 3 │            │
│          │  └────────┘            │
│          │  grid grid-cols-2 gap-4│
└──────────┴────────────────────────┘

MOBILE (<768px) :
┌─────────────────────┐
│ ┌─────────────────┐ │
│ │ Card 1 (full)   │ │
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ Card 2 (full)   │ │
│ └─────────────────┘ │
│ grid grid-cols-1    │
│ gap-3 px-4          │
│                     │
│ ┌─────────────────┐ │
│ │ Chart h-60      │ │
│ └─────────────────┘ │
├─────────────────────┤
│ 🏠  📊  ⚡  🔔  ⚙️   │ ← bottom nav h-16
└─────────────────────┘
```

### Règle 5 — ANIMER avec des courbes et durées exactes, pas "smooth"

❌ **Mauvais** : "Animation fluide au hover"

✅ **Bon** :
```
ENTRÉE CARD (mount) :
  - opacity: 0 → 1, y: 20px → 0
  - duration: 500ms, ease: [0.25, 0.46, 0.45, 0.94] (easeOutQuad)
  - stagger: 80ms entre chaque card (index × 80ms delay)

HOVER CARD :
  - transform: scale(1) → scale(1.02)
  - border-color: transparent → primary/30
  - box-shadow: 0 4px 6px rgba(0,0,0,0.1) → 0 20px 40px rgba(0,255,156,0.08)
  - duration: 300ms, ease: ease-out
  - RETOUR (mouse leave) : duration 200ms (plus rapide que l'entrée)

CLICK FEEDBACK :
  - transform: scale(1.02) → scale(0.98) → scale(1)
  - duration: 150ms, ease: ease-in-out

PAGE TRANSITION :
  - exit: opacity 1→0, x: 0→-20px, duration 200ms
  - enter: opacity 0→1, x: 20px→0, duration 300ms, delay 100ms
```

### Règle 6 — FOURNIR le dark ET light mode explicitement

Ne jamais dire "supporte le dark mode". Spécifier les deux :

```
DARK MODE (default) :
  Page bg      : #0b0f12 (bg-dark)
  Card bg      : rgba(255,255,255,0.04) backdrop-blur-md
  Card border  : rgba(255,255,255,0.05)
  Text primary : #e2e8f0
  Text muted   : rgba(226,232,240,0.5)
  Accent glow  : 0 0 20px rgba(0,255,156,0.15)
  Chart grid   : rgba(255,255,255,0.06)
  Chart line   : #00ff9c (primary)

LIGHT MODE :
  Page bg      : #f6f8f9
  Card bg      : rgba(255,255,255,0.8) backdrop-blur-sm
  Card border  : rgba(0,0,0,0.06)
  Text primary : #1a202c
  Text muted   : rgba(26,32,44,0.5)
  Accent glow  : 0 0 20px rgba(30,127,92,0.1)
  Chart grid   : rgba(0,0,0,0.06)
  Chart line   : #1e7f5c (primary-light)
```

### Règle 7 — ANTI-PATTERNS explicites (dire ce qu'il ne faut PAS faire)

Ajouter en bas de chaque tâche composant :

```
⛔ ANTI-PATTERNS — NE PAS :
  - Utiliser des bordures > 1px (sauf état actif ring-2)
  - Mettre du padding > p-6 sur les cards (p-4 ou p-5 max)
  - Utiliser des couleurs à pleine opacité pour les backgrounds (toujours /60 à /80)
  - Centrer verticalement du texte dans un conteneur > 200px de haut
  - Utiliser des ombres portées visibles en dark mode (shadow-black/20 max)
  - Mettre des icônes > 24px dans les métriques inline
  - Utiliser font-bold sur plus de 2 éléments par card
  - Empiler plus de 3 niveaux de nesting dans une card
  - Mettre un border-radius > rounded-2xl
  - Utiliser des couleurs de texte non mappées aux tokens du design system
```

---

## Application Concrète : SPRINT 33

---

# SPRINT 33 — OTA Firmware & Fleet Management (UI/UX-First)

**Objectif : gérer le cycle de vie des devices (Raspberry Pi + relais LoRa) depuis l'interface cloud, avec une UX de niveau professionnel.**

**Design System Reference : Sprint 30 tokens. DaisyUI themes `greenhouse-dark` / `greenhouse-light`.**

---

## 33.1 — Backend : Modèles & API

- [ ] Modèle `FirmwareRelease` :
  - `version` (SemVer string, unique), `channel` (STABLE/BETA/NIGHTLY), `release_notes` (TextField)
  - `binary_url` (URLField), `checksum_sha256` (CharField 64), `file_size_bytes` (IntegerField)
  - `min_hardware_version` (CharField, nullable), `created_at`, `is_active` (BooleanField)

- [ ] Modèle `DeviceOTAJob` :
  - `edge_device` (FK EdgeDevice), `firmware_release` (FK FirmwareRelease)
  - `status` : PENDING → DOWNLOADING → INSTALLING → SUCCESS / FAILED / ROLLED_BACK
  - `progress_percent` (IntegerField 0–100), `started_at`, `completed_at`
  - `error_message` (TextField, nullable), `previous_version` (CharField)

- [ ] Modèle `DeviceMetrics` :
  - `edge_device` (FK), `cpu_percent`, `memory_percent`, `disk_percent`, `cpu_temperature`
  - `uptime_seconds`, `network_latency_ms`, `recorded_at`

- [ ] Endpoint `GET /api/fleet/devices/` : liste paginée avec dernier metrics + OTA status
- [ ] Endpoint `GET /api/fleet/devices/{id}/` : détail device + historique OTA + métriques 24h
- [ ] Endpoint `POST /api/fleet/devices/{id}/update/` : déclencher un OTA job
- [ ] Endpoint `POST /api/fleet/devices/{id}/rollback/` : rollback au firmware précédent
- [ ] Endpoint `GET /api/fleet/firmware/` : liste releases par channel
- [ ] Endpoint `POST /api/fleet/firmware/` : publier une nouvelle release
- [ ] Endpoint `GET /api/fleet/overview/` : stats globales (devices online, outdated, jobs en cours)
- [ ] Celery task `check_ota_timeout` : jobs DOWNLOADING/INSTALLING > 30min → FAILED
- [ ] Celery task `collect_device_metrics` : toutes les 5min via MQTT topic `device/{id}/metrics`
- [ ] Tests : OTA lifecycle complet, rollback, timeout, permissions par rôle

---

## 33.2 — Page Fleet Overview (`/fleet`)

**Accessible depuis : Administration > Fleet Management (Cloud mode only, `<FeatureGate feature="fleet">`)**

### Layout Desktop (≥1280px)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Fleet Management                                     [+ New Release]   │
│  12 devices across 4 organizations                    btn-primary       │
│                                                       btn-sm h-9        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│  │ 🟢 12    │ │ 🟡  3    │ │ 🔴  1    │ │ 📦  2    │                  │
│  │ Online   │ │ Outdated │ │ Offline  │ │ Updating │                  │
│  │ devices  │ │ firmware │ │ > 1h     │ │ OTA jobs │                  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                  │
│  ▲ MetricTile, grid grid-cols-4 gap-4, max-w-3xl                      │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Filter: [All ▾] [Online ▾] [Channel ▾]    🔍 Search device...  │   │
│  │ flex items-center gap-3 h-12 bg-base-200/40 rounded-xl px-4    │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                 │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │ ● Raspberry-Pi-001     GreenFarm Bio    v3.2.1   🟢 Online│ │   │
│  │  │   CPU 23%  MEM 41%  DISK 67%  Temp 48°C    il y a 2min   │ │   │
│  │  │   ████████░░ ██████████████░░ ██████████████████░░        │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │  gap-3 entre chaque device row                                 │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │ ● Raspberry-Pi-002     AquaPonics Ltd   v3.1.0   🟡 Outd.│ │   │
│  │  │   CPU 45%  MEM 62%  DISK 34%  Temp 52°C    il y a 5min   │ │   │
│  │  │   [Update to v3.2.1]  btn-primary btn-xs                  │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Layout Mobile (<768px)

```
┌─────────────────────────┐
│ Fleet Management        │
│ 12 devices • 4 orgs     │
│                         │
│ ┌─────────┐ ┌─────────┐│
│ │ 🟢 12   │ │ 🟡  3   ││
│ │ Online  │ │ Outdated││
│ └─────────┘ └─────────┘│
│ ┌─────────┐ ┌─────────┐│
│ │ 🔴  1   │ │ 📦  2   ││
│ │ Offline │ │ Updating││
│ └─────────┘ └─────────┘│
│ grid-cols-2 gap-3       │
│                         │
│ 🔍 Search...            │
│                         │
│ ┌─────────────────────┐ │
│ │ ● RPi-001    🟢     │ │
│ │ GreenFarm Bio       │ │
│ │ v3.2.1  •  2min ago │ │
│ │ CPU 23% MEM 41%     │ │
│ │ ███░░░ ██████░░     │ │
│ └─────────────────────┘ │
│ Cards empilées, px-4    │
│                         │
├─────────────────────────┤
│ 🏠  📊  ⚡  🔔  ⚙️      │
└─────────────────────────┘
```

### Composant `<DeviceRow />`

**Anatomy :**
```
┌─ container : bg-base-200/60 backdrop-blur-md rounded-xl border border-white/5 p-4 ──┐
│                                                                                       │
│  ┌─ left : flex items-center gap-3 ──────────────────────────────────────────────┐   │
│  │ ● status dot (w-2.5 h-2.5 rounded-full)                                      │   │
│  │   online: bg-success + animate-pulse (1.5s)                                   │   │
│  │   offline: bg-error, pas d'animation                                          │   │
│  │   updating: bg-warning + animate-pulse (1s)                                   │   │
│  │                                                                                │   │
│  │ Device name : text-sm font-semibold text-base-content                         │   │
│  │ Org name    : text-xs text-base-content/50 ml-2                               │   │
│  └────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                       │
│  ┌─ center : flex items-center gap-6 ────────────────────────────────────────────┐   │
│  │ Version badge : bg-base-300/50 text-xs px-2 py-0.5 rounded-md font-mono      │   │
│  │   outdated: border border-warning/30 text-warning                             │   │
│  │   current:  border border-success/20 text-success/80                          │   │
│  │                                                                                │   │
│  │ Metrics (inline, text-xs text-base-content/50) :                              │   │
│  │   CPU {val}%  •  MEM {val}%  •  DISK {val}%  •  {temp}°C                     │   │
│  │   Chaque métrique change de couleur si critique :                              │   │
│  │     < 70% : text-base-content/50 (normal)                                     │   │
│  │     70-89% : text-warning                                                     │   │
│  │     ≥ 90% : text-error                                                        │   │
│  └────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                       │
│  ┌─ right : flex items-center gap-2 ─────────────────────────────────────────────┐   │
│  │ "il y a Xmin" : text-xs text-base-content/40                                  │   │
│  │                                                                                │   │
│  │ Si outdated : [Update] btn-primary btn-xs rounded-lg h-7                      │   │
│  │ Si updating : progress bar w-20 h-1.5 rounded-full bg-base-300               │   │
│  │               inner: bg-primary h-full rounded-full + animate width            │   │
│  │ Actions : ⋮ (dropdown: View details, Force update, Rollback, Reboot)          │   │
│  │           btn-ghost btn-xs                                                     │   │
│  └────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

**State Matrix :**

| État | Status dot | Border card | Background | Badge version | Action |
|------|-----------|-------------|------------|---------------|--------|
| Online + à jour | `bg-success animate-pulse` | `border-white/5` | `bg-base-200/60` | `text-success/80 border-success/20` | `⋮` menu |
| Online + outdated | `bg-success animate-pulse` | `border-warning/20` | `bg-base-200/60` | `text-warning border-warning/30` | `[Update]` + `⋮` |
| Updating | `bg-warning animate-pulse (1s)` | `border-primary/30` | `bg-primary/5` | `text-primary` | progress bar |
| Offline < 1h | `bg-error` (static) | `border-white/5` | `bg-base-200/40` | `text-base-content/40` | `⋮` menu |
| Offline > 24h | `bg-error` (static) | `border-error/20` | `bg-error/5` | `text-error/60` | `⋮` menu |

**Animations :**
```
MOUNT :
  opacity: 0 → 1, y: 12px → 0
  duration: 400ms, ease: [0.25, 0.46, 0.45, 0.94]
  stagger: 60ms par row (index × 60ms)

HOVER :
  background: base-200/60 → base-200/80
  border-color: white/5 → white/10
  duration: 200ms ease-out
  RETOUR: 150ms

UPDATE PROGRESS :
  width: 0% → {progress}%
  transition: width 500ms ease-in-out
  pulse subtil: opacity 0.8 → 1 → 0.8, cycle 2s, sur la barre

STATUS CHANGE (ex: offline → online) :
  scale: 1 → 1.05 → 1, duration 300ms
  flash: border-success/50 pendant 1s puis retour normal
```

**Anti-patterns :**
```
⛔ NE PAS :
  - Utiliser des icônes colorées pour les métriques (texte coloré uniquement)
  - Mettre les métriques CPU/MEM/DISK dans des badges séparés (inline text)
  - Utiliser un tableau HTML <table> (c'est une liste de cards, pas un tableau)
  - Ajouter des tooltips sur chaque métrique (surcharge cognitive)
  - Utiliser des barres de progression colorées multicolores pour CPU/MEM (text-xs suffit)
  - Mettre un chevron ">" à droite (on est pas sur iOS Réglages)
  - Afficher la date complète pour "last seen" (relatif : "il y a 5min", pas "2026-03-14 10:30")
```

---

## 33.3 — Page Device Detail (`/fleet/{deviceId}`)

### Layout Desktop

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ← Fleet    Raspberry-Pi-001                          ● Online          │
│  breadcrumb  text-xl font-semibold                    LiveIndicator     │
│  btn-ghost   GreenFarm Bio • Registered 2025-11-03                     │
│  text-sm     text-sm text-base-content/50                              │
│                                                                         │
│  ┌─ Tabs : flex gap-1 bg-base-200/40 p-1 rounded-xl w-fit ──────────┐ │
│  │  [Overview]  [Metrics]  [OTA History]  [Logs]                      │ │
│  │  active: bg-base-100 text-base-content rounded-lg shadow-sm       │ │
│  │  inactive: text-base-content/50 hover:text-base-content/80        │ │
│  │  tab height: h-9, text-sm, px-4                                   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ═══ TAB: Overview ══════════════════════════════════════════════════   │
│                                                                         │
│  ┌────────────────────────────┐  ┌────────────────────────────────┐    │
│  │ SYSTEM HEALTH              │  │ FIRMWARE                       │    │
│  │                            │  │                                │    │
│  │  CPU ████████░░░░  67%     │  │  Current: v3.2.1 (stable)     │    │
│  │  MEM ██████░░░░░░  48%     │  │  Latest:  v3.2.1 ✓ Up to date│    │
│  │  DSK █████████░░░  76%     │  │                                │    │
│  │  TMP ██████░░░░░░  52°C    │  │  Channel: [Stable ▾]          │    │
│  │                            │  │                                │    │
│  │  Uptime: 14j 6h 23min     │  │  [Force Update]  [Rollback]   │    │
│  │  Latency: 34ms            │  │  btn-outline btn-sm            │    │
│  └────────────────────────────┘  └────────────────────────────────┘    │
│  grid grid-cols-2 gap-6                                                │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ RESOURCE USAGE — Last 24h                          [1h][24h][7d]│  │
│  │                                                                  │  │
│  │  100% ┤                                                          │  │
│  │   80% ┤·····╭─╮·····································warning line │  │
│  │   60% ┤   ╭─╯ ╰──╮      ╭───╮                                  │  │
│  │   40% ┤──╯       ╰──────╯   ╰──────────────────── CPU          │  │
│  │   20% ┤                                                          │  │
│  │    0% ┼──────────────────────────────────────────────────────    │  │
│  │       00:00    04:00    08:00    12:00    16:00    20:00         │  │
│  │                                                                  │  │
│  │  Lines: CPU=#00ff9c, MEM=#00d9ff, DISK=#ffb300                  │  │
│  │  Warning threshold: dashed line rgba(255,179,0,0.3) at 80%      │  │
│  │  Grid: stroke rgba(255,255,255,0.06)                            │  │
│  │  Tooltip: bg-base-300 border border-white/10 rounded-lg p-3    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ═══ TAB: OTA History ══════════════════════════════════════════════   │
│                                                                         │
│  Timeline verticale (même pattern que Journal de Culture Sprint 25) :  │
│                                                                         │
│  ○── 2026-03-14 08:30 ─── v3.1.0 → v3.2.1 ── ✅ SUCCESS ───────     │
│  │   Duration: 4min 23s • Checksum verified                          │
│  │                                                                    │
│  ○── 2026-03-01 14:15 ─── v3.0.2 → v3.1.0 ── ✅ SUCCESS ───────     │
│  │   Duration: 3min 58s • Auto-update (stable channel)               │
│  │                                                                    │
│  ○── 2026-02-15 09:00 ─── v3.1.0-beta → v3.0.2 ── 🔄 ROLLED BACK   │
│  │   Reason: Boot loop detected after 3 failed health checks         │
│                                                                         │
│  Timeline dot: w-3 h-3 rounded-full                                    │
│    SUCCESS: bg-success                                                  │
│    FAILED: bg-error                                                     │
│    ROLLED_BACK: bg-warning                                             │
│    PENDING/IN PROGRESS: bg-primary animate-pulse                       │
│  Timeline line: w-0.5 bg-base-content/10                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Layout Mobile (<768px)

```
┌─────────────────────────┐
│ ← Fleet                 │
│ Raspberry-Pi-001   🟢   │
│ GreenFarm Bio           │
│                         │
│ [Overview][Metrics][OTA]│
│ scroll-x, snap-x        │
│                         │
│ SYSTEM HEALTH           │
│ ┌─────────────────────┐ │
│ │ CPU ████████░░  67% │ │
│ │ MEM ██████░░░░  48% │ │
│ │ DSK █████████░  76% │ │
│ │ TMP ██████░░░░  52°C│ │
│ │ Up: 14j 6h • 34ms   │ │
│ └─────────────────────┘ │
│                         │
│ FIRMWARE                │
│ ┌─────────────────────┐ │
│ │ v3.2.1 (stable) ✓   │ │
│ │ [Force Update]       │ │
│ │ [Rollback]           │ │
│ └─────────────────────┘ │
│ grid-cols-1, gap-4      │
│                         │
│ RESOURCES 24h           │
│ ┌─────────────────────┐ │
│ │ Chart h-48           │ │
│ │ (touch-scroll X)     │ │
│ └─────────────────────┘ │
│                         │
├─────────────────────────┤
│ 🏠  📊  ⚡  🔔  ⚙️      │
└─────────────────────────┘
```

### Composant `<ResourceGauge />`

**Pour CPU, MEM, DISK, TEMP dans la card System Health :**

```
Anatomy :
  ┌─ flex items-center gap-3 h-8 ──────────────┐
  │ LABEL: w-10 text-xs font-medium             │
  │        text-base-content/60 uppercase        │
  │        tracking-wider                        │
  │                                              │
  │ BAR:   flex-1 h-2 bg-base-300/50 rounded-full│
  │   FILL: h-full rounded-full                  │
  │     < 60% : bg-success/70                    │
  │     60-79%: bg-warning/70                    │
  │     ≥ 80% : bg-error/70                      │
  │     transition: width 800ms ease-out         │
  │                                              │
  │ VALUE: w-12 text-right text-xs font-mono     │
  │        même couleur que la barre             │
  └──────────────────────────────────────────────┘

Animation au mount :
  width: 0% → {value}%
  duration: 800ms
  ease: [0.34, 1.56, 0.64, 1] (spring-like overshoot léger)
  stagger: 120ms par barre

Animation update (quand la valeur change en live) :
  width: {old}% → {new}%
  duration: 500ms ease-out
  Si le seuil de couleur change (ex: 79→80%) :
    flash couleur : opacity 0.5 → 1, duration 300ms
```

---

## 33.4 — Modal "New Firmware Release"

```
┌─ overlay : bg-black/60 backdrop-blur-sm ─────────────────────┐
│                                                               │
│   ┌─ modal : bg-base-100 rounded-2xl w-[480px] ───────────┐ │
│   │          border border-white/5                          │ │
│   │          shadow-2xl shadow-black/40                     │ │
│   │          max-h-[90vh] overflow-y-auto                   │ │
│   │                                                         │ │
│   │  ┌─ header : p-6 pb-0 ──────────────────────────────┐ │ │
│   │  │  New Firmware Release              ✕              │ │ │
│   │  │  text-lg font-semibold     btn-ghost btn-sm       │ │ │
│   │  │                            btn-circle             │ │ │
│   │  └───────────────────────────────────────────────────┘ │ │
│   │                                                         │ │
│   │  ┌─ body : p-6 flex flex-col gap-4 ──────────────────┐ │ │
│   │  │                                                    │ │ │
│   │  │  Version *          Channel *                      │ │ │
│   │  │  ┌────────────┐    ┌────────────────┐             │ │ │
│   │  │  │ 3.2.2      │    │ Stable      ▾  │             │ │ │
│   │  │  └────────────┘    └────────────────┘             │ │ │
│   │  │  input: h-10 bg-base-200/50 border-white/5       │ │ │
│   │  │         rounded-lg px-3 text-sm                    │ │ │
│   │  │  focus: border-primary/50 ring-2 ring-primary/20  │ │ │
│   │  │  error: border-error/50 + text-error text-xs mt-1 │ │ │
│   │  │  grid grid-cols-2 gap-4                            │ │ │
│   │  │                                                    │ │ │
│   │  │  Binary URL *                                      │ │ │
│   │  │  ┌────────────────────────────────────────────┐   │ │ │
│   │  │  │ https://releases.example.com/v3.2.2.bin    │   │ │ │
│   │  │  └────────────────────────────────────────────┘   │ │ │
│   │  │                                                    │ │ │
│   │  │  SHA256 Checksum *                                 │ │ │
│   │  │  ┌────────────────────────────────────────────┐   │ │ │
│   │  │  │ a7f3b2c...                         font-mono│   │ │ │
│   │  │  └────────────────────────────────────────────┘   │ │ │
│   │  │                                                    │ │ │
│   │  │  Release Notes                                     │ │ │
│   │  │  ┌────────────────────────────────────────────┐   │ │ │
│   │  │  │                                     h-24   │   │ │ │
│   │  │  │ textarea, resize-y                         │   │ │ │
│   │  │  └────────────────────────────────────────────┘   │ │ │
│   │  │                                                    │ │ │
│   │  └────────────────────────────────────────────────────┘ │ │
│   │                                                         │ │
│   │  ┌─ footer : p-6 pt-0 flex justify-end gap-3 ────────┐ │ │
│   │  │                [Cancel]         [Publish Release]  │ │ │
│   │  │                btn-ghost        btn-primary        │ │ │
│   │  │                btn-sm           btn-sm             │ │ │
│   │  └────────────────────────────────────────────────────┘ │ │
│   │                                                         │ │
│   └─────────────────────────────────────────────────────────┘ │
│                                                               │
└───────────────────────────────────────────────────────────────┘

ANIMATIONS :
  Overlay enter: opacity 0→1, duration 200ms
  Modal enter: opacity 0→1, scale 0.95→1, y 10px→0
               duration 300ms, ease [0.25, 0.46, 0.45, 0.94]
  Modal exit: opacity 1→0, scale 1→0.97, duration 150ms ease-in
  Focus first input: delay 350ms (après animation d'entrée)

VALIDATION (Zod, inline, temps réel) :
  Version: regex /^\d+\.\d+\.\d+$/ → "Version must be SemVer (e.g., 3.2.2)"
  Channel: required, enum ["STABLE", "BETA", "NIGHTLY"]
  Binary URL: url() → "Must be a valid URL"
  Checksum: regex /^[a-f0-9]{64}$/ → "Must be a valid SHA256 hash"
  Submit disabled tant qu'il y a une erreur (btn-disabled opacity-50)
```

---

## 33.5 — Composant `<OTAProgressCard />`

**Affiché quand un device a un OTA job actif (remplace temporairement la section firmware dans DeviceDetail) :**

```
┌─ bg-primary/5 border border-primary/20 rounded-xl p-4 ───────────────┐
│                                                                        │
│  ⬆️  Updating to v3.2.2                            43%                │
│  text-sm font-semibold text-base-content      text-sm font-mono       │
│                                                text-primary            │
│                                                                        │
│  ┌─ progress track : w-full h-2 bg-base-300/50 rounded-full mt-3 ──┐ │
│  │ ┌─ progress fill : h-full bg-primary rounded-full ─────────┐    │ │
│  │ │  width: {progress}%                                       │    │ │
│  │ │  transition: width 1s ease-out                            │    │ │
│  │ │                                                           │    │ │
│  │ │  SHIMMER EFFECT:                                          │    │ │
│  │ │  background: linear-gradient(                             │    │ │
│  │ │    90deg, transparent, rgba(255,255,255,0.15), transparent│    │ │
│  │ │  )                                                        │    │ │
│  │ │  background-size: 200% 100%                               │    │ │
│  │ │  animation: shimmer 1.5s infinite                         │    │ │
│  │ └───────────────────────────────────────────────────────────┘    │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  Status: Downloading firmware...               [Cancel]               │
│  text-xs text-base-content/50                  btn-ghost btn-xs       │
│                                                text-error/70          │
│                                                                        │
│  Steps indicator (text-xs text-base-content/40) :                     │
│  ✅ Checksum verified  →  📥 Downloading (43%)  →  ○ Installing      │
│  text-success/60          text-primary             text-base-content/30│
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

ÉTATS DE LA PROGRESS BAR :
  PENDING    : w-0, bar pulsante (opacity 0.3→0.7, 1.5s cycle), texte "Preparing..."
  DOWNLOADING: w-{progress}%, shimmer actif, texte "Downloading firmware..."
  INSTALLING : w-100% bg-warning, pulse opacity, texte "Installing — do not power off"
  SUCCESS    : w-100% bg-success, confetti animation (3 particles, 500ms), puis fadeout card 2s
  FAILED     : w-{progress}% bg-error, shake animation (300ms), texte erreur en rouge
  ROLLED_BACK: w-100% bg-warning → texte "Rolled back to v{prev}", icône ↩️

ANIMATION SUCCESS :
  1. Bar bg-primary → bg-success, 300ms
  2. Scale card 1→1.02→1, 300ms
  3. Checkmark apparaît (opacity 0→1, scale 0→1, spring), 400ms
  4. Confetti: 5 particules, colors [primary, success, secondary], 
     trajectoire: random x ±30px, y -40px, rotation random, opacity 1→0
     duration 800ms, ease: [0.25, 0.46, 0.45, 0.94]
  5. Après 2s: card fadeout → remplacée par firmware info normal

ANIMATION FAILED :
  1. Bar bg-primary → bg-error, 200ms
  2. Card: translateX 0→-4px→4px→-2px→2px→0, duration 300ms (shake)
  3. Error message fade in, 200ms
  4. Bouton [Retry] apparaît, scale 0→1, delay 500ms
```

---

## 33.6 — Intégration & Tests

- [ ] Menu Cloud : ajouter "Fleet" dans Administration (`<FeatureGate feature="fleet">`)
- [ ] WebSocket `/ws/fleet/` : push des changements de statut OTA et métriques live
- [ ] Hook `useDeviceMetrics(deviceId)` : WebSocket + polling fallback 30s
- [ ] Hook `useOTAProgress(jobId)` : WebSocket pour la progression en temps réel
- [ ] Empty state Fleet (0 devices) :
  ```
  ┌───────────────────────────────────────────┐
  │                                           │
  │          📡                               │
  │          (opacity-30, w-16 h-16)          │
  │                                           │
  │    No devices registered yet              │
  │    text-base-content/50 text-sm           │
  │                                           │
  │    Register your first Raspberry Pi       │
  │    to start managing your fleet.          │
  │    text-base-content/30 text-xs           │
  │                                           │
  │    [Register Device]                      │
  │    btn-primary btn-sm                     │
  │                                           │
  └───────────────────────────────────────────┘
  ```
- [ ] Skeleton loader pour DeviceRow : 4 lignes h-[72px] avec shimmer
- [ ] Tests Vitest : `<DeviceRow />` (tous les états), `<OTAProgressCard />` (tous les états), `<ResourceGauge />` (seuils couleur), `<FleetOverview />` (empty, loading, loaded)
- [ ] Tests backend : OTA lifecycle, rollback, metrics collection, permissions
- [ ] i18n : toutes les chaînes dans `fleet.json` (EN + FR)

---

## Récapitulatif : Pourquoi ce format marche mieux

| Problème LLM classique | Solution dans ce sprint |
|------------------------|------------------------|
| Card générique sans personnalité | ASCII anatomy avec chaque zone dimensionnée |
| "responsive" = juste `sm:` au pif | Layouts dessinés pour 3 breakpoints |
| Animations = `transition-all` partout | Courbes, durées, stagger, retour spécifiés |
| Dark mode oublié ou approximatif | Dual-mode avec hex/opacity exacts |
| États = juste default + hover | Matrice 5-7 états avec classes Tailwind exactes |
| Couleurs inventées | Tokens du design system référencés partout |
| Pas de feedback sur les actions | Animations SUCCESS/FAILED/LOADING décrites frame par frame |
| Layout empilé sans hiérarchie | Grid explicite avec gap et max-width |
| Empty states oubliés | Dessinés dans le sprint |
| Anti-patterns répétés | Liste ⛔ explicite par composant |

## CONVENTIONS DE CODE

### Python (Backend + Bridge)
- Python 3.12, type hints obligatoires
- Black formatter (line-length=120)
- isort pour les imports
- Docstrings Google style
- pytest > unittest
- Factory Boy pour les fixtures de test

### TypeScript (Frontend)
- Strict mode activé
- Interfaces pour tous les types API
- Composants fonctionnels uniquement
- Custom hooks pour la logique réutilisable
- Prettier + ESLint configurés
- Vitest pour les tests

### Git
- Conventional commits : feat/fix/docs/test/chore/refactor
- Une branche par sprint si demandé

---

## QUAND TU CODES

1. **Commence toujours par les tests** (TDD quand possible)
2. **Vérifie que le Docker build passe** après chaque changement majeur
3. **Ne laisse jamais de TODO sans explication** dans le code
4. **Gère les erreurs proprement** — pas de try/except vide, pas de console.log en prod
5. **Optimise les requêtes DB** — utilise select_related/prefetch_related
6. **Valide les données** à chaque couche (serializer, model, frontend)

---

## COMMANDE DE DÉMARRAGE

Quand je dis "Commence le Sprint X", tu :
1. Listes les tâches du sprint
2. Exécutes chaque tâche dans l'ordre
3. Écris les tests correspondants
4. Vérifies la cohérence avec les sprints précédents
5. Rebuildes tous les containers Docker (`docker compose build`) et met à jour CLAUDE.md sur le sprint en cours
6. Me donnes un résumé de ce qui a été fait
7. Me demandes validation avant le sprint suivant