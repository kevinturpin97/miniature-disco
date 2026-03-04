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
    relay_id = models.PositiveIntegerField(unique=True, validators=[MinValueValidator(1), MaxValueValidator(255)])
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    transmission_interval = models.PositiveIntegerField(default=300, help_text="Interval in seconds")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

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
- [ ] Page commandes : interface par zone
- [ ] Boutons ON/OFF par actionneur
- [ ] Pipeline complet : UI → API → MQTT → LoRa Bridge → LoRa → Relais
- [ ] Feedback de status (PENDING → SENT → ACK/FAILED)
- [ ] Historique des commandes par zone
- [ ] Timeout des commandes (Celery task)

### SPRINT 11 — Automatisations
- [ ] Page création/édition de règles
- [ ] Formulaire : SI [capteur] [condition] [valeur] ALORS [actionneur] [action]
- [ ] Automation engine (Celery) : évalue les règles à chaque reading
- [ ] Cooldown entre déclenchements
- [ ] Historique des déclenchements
- [ ] Activation/désactivation des règles

### SPRINT 12 — Intégration & Production
- [ ] docker-compose.prod.yml optimisé (images ARM64, healthchecks)
- [ ] Nginx HTTPS (auto-signé ou Let's Encrypt)
- [ ] Tests E2E du pipeline complet (capteur simulé → dashboard)
- [ ] Script de simulation de données (pour démo sans matériel)
- [ ] Optimisation des requêtes Django (select_related, prefetch)
- [ ] Documentation complète (docs/)
- [ ] Monitoring basique (healthcheck endpoints)
- [ ] Seed data pour démo
- [ ] Review sécurité (CORS, CSRF, rate limiting)

---

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
5. Rebuildes tous les containers Docker (`docker compose build`)
6. Me donnes un résumé de ce qui a été fait
7. Me demandes validation avant le sprint suivant