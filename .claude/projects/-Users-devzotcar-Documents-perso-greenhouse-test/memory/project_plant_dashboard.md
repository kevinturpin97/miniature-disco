---
name: plant-dashboard monorepo
description: New React plant management app at plant-dashboard/ with cross-platform monorepo architecture (Turborepo)
type: project
---

A standalone plant management dashboard was created at `/Users/devzotcar/Documents/perso/greenhouse/test/plant-dashboard/`.

**Structure:**
- `packages/tokens` — design tokens (colors, typo, spacing, animations) as pure JS objects
- `packages/core` — abstractions (IStorage, IRouter, IHttpClient, INotificationService, IImagePicker, Platform), DI container, Zustand stores (useAuthStore, usePlantsStore, useSettingsStore, useNotificationsStore), services (AuthService, PlantService, WateringService, SettingsService), hooks (useAuth, usePlants, useWatering, useRooms), types, Zod schemas
- `packages/ui` — headless hooks (useButton, useInput, useModal, useToast, useSearch, useTabs, useStepper, useDatePicker, useDataTable, usePasswordToggle, useCountUp), animation presets, component types
- `apps/web` — React 18 + Vite + TailwindCSS + DaisyUI (plant-dark/plant-light themes), web implementations (WebStorage, WebRouter, AxiosHttpClient), all pages, 117 tests passing

**Design tokens:** Dark bg `#1A1A2E`, neon cyan `#00F0FF`, pink `#FF2E97`, green `#39FF14`, purple `#7B2FBE`

**Why:** Sprint SPRINT.MD requested a cross-platform (React Web → future React Native) monorepo architecture for a plant management UI.
**How to apply:** When working on the plant-dashboard, know that ALL business logic must stay in packages/*, NO platform-specific imports (react-router, axios, framer-motion, localStorage) in packages/core or packages/ui.
