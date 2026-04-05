# 🛵 3azza — Scooter Maintenance Tracker

> **"3azza" (عزّة)** is a mobile-first maintenance companion app built specifically for scooter and delivery-bike riders. It replaces paper logbooks and guesswork with a unified, intelligent dashboard that tracks service intervals, fuel logs, parts inventory, vehicle documents, and daily pre-ride safety checks — all stored locally on the device with zero server dependency.

---

## Table of Contents

1. [Project Purpose](#1-project-purpose)
2. [Tech Stack](#2-tech-stack)
3. [Design System](#3-design-system)
4. [Project Structure](#4-project-structure)
5. [Screens & Pages](#5-screens--pages)
6. [Navigation Architecture](#6-navigation-architecture)
7. [Data Layer](#7-data-layer)
8. [State Management](#8-state-management)
9. [Getting Started](#9-getting-started)
10. [Environment & Configuration](#10-environment--configuration)
11. [Known Issues & Limitations](#11-known-issues--limitations)
12. [Suggested Improvements](#12-suggested-improvements)
13. [Contributing](#13-contributing)

---

## 1. Project Purpose

3azza solves a real problem faced by delivery riders and scooter owners: **no affordable, offline-first tool exists that handles the full lifecycle of a small-engine vehicle**. Existing apps are either car-centric, require cloud sign-in, or are glorified spreadsheets.

### Core Value Propositions

| Problem | 3azza Solution |
|---|---|
| Forgetting oil change intervals | Smart-Link service intervals tied to odometer |
| No record of what was spent on repairs | Service logs with cost tracking |
| Documents expiring unnoticed | Documents Vault with expiry date tracking |
| Running out of spare parts mid-repair | Inventory screen with stock-level alerts |
| No safety ritual before riding | Daily Pre-Ride checklist |
| Fuel cost blindness | Gas log with per-fill cost & station tracking |

### Target User
Delivery riders, motorcycle enthusiasts, and small-fleet operators in markets where scooters are primary transport (e.g., Egypt, Southeast Asia, Southern Europe).

---

## 2. Tech Stack

### Core Runtime

| Technology | Version | Role |
|---|---|---|
| **React Native** | `0.83.2` | Cross-platform mobile UI framework |
| **Expo** | `~55.0.8` | Managed workflow, native module access |
| **TypeScript** | `~5.9.2` | Type safety across the entire codebase |
| **React** | `19.2.0` | Component rendering layer |

### Navigation

| Package | Version | Role |
|---|---|---|
| `@react-navigation/native` | `^7.1.34` | Navigation container & core |
| `@react-navigation/native-stack` | `^7.14.6` | Stack-based screen transitions |
| `@react-navigation/bottom-tabs` | `^7.15.6` | Custom bottom tab navigator |

### Styling

| Package | Version | Role |
|---|---|---|
| **NativeWind** | `^4.2.3` | Tailwind CSS utility classes in React Native |
| **Tailwind CSS** | `^3.4.19` | Design token source of truth |
| **expo-blur** | `~55.0.10` | Glassmorphism blur effects on tab bar |
| `@expo/vector-icons` | `^15.0.2` | Material Icons & Community Icons |

### Google Fonts (3 typefaces)

| Package | Role |
|---|---|
| `@expo-google-fonts/space-grotesk` | Headline / display numbers |
| `@expo-google-fonts/manrope` | Body text & data labels |
| `@expo-google-fonts/plus-jakarta-sans` | Micro-labels & UI chrome |

### Data & Storage

| Package | Version | Role |
|---|---|---|
| **expo-sqlite** | `~55.0.11` | Local SQLite database (primary data store) |
| **expo-secure-store** | `~55.0.9` | Encrypted key-value store for auth/session flags |
| **Zustand** | `^5.0.12` | Global app state (onboarding, auth, setup flags) |
| `@react-native-async-storage/async-storage` | `2.2.0` | Legacy async storage (Zustand fallback) |

### Animations & UX

| Package | Version | Role |
|---|---|---|
| **react-native-reanimated** | `4.2.1` | Smooth, performant animations |
| **react-native-worklets** | `0.7.2` | Worklet support for Reanimated |
| **react-native-svg** | `15.15.3` | SVG gauges and custom icons |
| **react-native-pager-view** | `8.0.0` | Swipeable onboarding pages |
| **react-hook-form** | `^7.72.0` | Form state management & validation |

### Native Capabilities

| Package | Role |
|---|---|
| `expo-image-picker` | Camera / gallery access for document photos |
| `expo-file-system` | Local file read/write for image URIs |
| `expo-splash-screen` | Controlled splash screen lifecycle |
| `react-native-safe-area-context` | Safe area insets for notch/cutout devices |
| `react-native-screens` | Native screen optimization |

---

## 3. Design System

The app follows an internal design system called **"Precision Industrialism"** with the creative north star: **"The Kinetic Cockpit"**.

### Philosophy
The UI is treated as a physical, machined instrument cluster — not a standard mobile app. The aesthetic is **Industrial Luxury**: think a high-end watch or a fighter jet HUD, adapted for a phone screen.

### Color Palette (`tailwind.config.js`)

| Token | Hex | Usage |
|---|---|---|
| `background` / `surface` | `#081421` | Root background — Matte Deep Navy |
| `primary` | `#a9c7ff` | Active states, progress bars, primary CTAs |
| `secondary` | `#c6c6c6` | Machined edges, secondary text |
| `surface-container` | `#14202e` | Card backgrounds (recessed modules) |
| `surface-container-high` | `#1f2b39` | Elevated card surfaces |
| `surface-container-highest` | `#2a3644` | Highest elevation elements |
| `surface-dim` | `#081421` | Deepest background layer |
| `surface-bright` | `#2e3a49` | Physically "closer" UI elements |
| `on-surface` | `#d7e3f7` | Primary readable text |
| `outline-variant` | `#44474c` | Ghost borders, tick marks |
| `error` | `#ffb4ab` | Error / critical warning states |

### Typography

| Font Family | Tailwind Class | Usage |
|---|---|---|
| Space Grotesk | `font-headline` | Screen titles, large gauge numbers |
| Manrope | `font-body` | Body text, data values |
| Plus Jakarta Sans | `font-label` | Tab labels, chip text, micro UI labels |

### Key Design Rules
- ❌ **No 1px solid borders** — use surface tonal shifts to separate areas
- ❌ **No pure black** (`#000000`) — kills the matte depth
- ✅ **Glassmorphism** for floating overlays: `surface-container-high` at 60% opacity + 20px backdrop blur
- ✅ **Tonal layering** over drop shadows for elevation
- ✅ **Extreme typographic scale**: huge numbers paired with tiny all-caps labels

---

## 4. Project Structure

```
app/                               # Expo project root
├── App.tsx                        # App entry: font loading, DB init, SplashScreen gate
├── index.ts                       # Expo registerRootComponent entry
├── app.json                       # Expo config (bundle ID, icons, plugins)
├── package.json                   # Dependencies & scripts
├── tailwind.config.js             # Design tokens (colors + fonts)
├── metro.config.js                # Metro bundler config (NativeWind support)
├── babel.config.js                # Babel preset-expo config
├── tsconfig.json                  # TypeScript compiler options
├── global.css                     # NativeWind base CSS import
├── nativewind-env.d.ts            # NativeWind className type declarations
├── env.d.ts                       # Ambient environment type declarations
│
├── assets/                        # Static assets
│   ├── icon.png                   # App icon
│   ├── splash-icon.png            # Splash screen asset
│   ├── android-icon-foreground.png
│   ├── android-icon-background.png
│   └── android-icon-monochrome.png
│
├── android/                       # Native Android project (auto-generated by Expo)
│
└── src/
    ├── components/
    │   └── ServiceHistoryWizard.tsx  # Reusable multi-step onboarding wizard (Pure UI)
    │
    ├── navigation/
    │   ├── RootNavigator.tsx         # Top-level conditional navigator (onboarding → auth → setup → tabs)
    │   ├── AuthNavigator.tsx         # Login / Register stack
    │   └── TabNavigator.tsx          # Bottom tab navigator with custom glassmorphic tab bar
    │
    ├── screens/
    │   ├── DashboardScreen.tsx       # Main home screen with kinetic gauge & bento cards
    │   ├── MaintenanceScheduleScreen.tsx  # Service interval cards ("Vitals" tab)
    │   ├── DocumentsVaultScreen.tsx  # Document photo storage with expiry alerts
    │   ├── InventoryScreen.tsx       # Spare parts inventory tracker
    │   ├── PreRideCheckScreen.tsx    # Daily safety checklist (hidden from tab bar)
    │   ├── ServiceLogsScreen.tsx     # Full maintenance history log (hidden from tab bar)
    │   ├── GasLogScreen.tsx          # Fuel fill-up tracker
    │   ├── InsightsScreen.tsx        # Analytics & spending summaries
    │   ├── TechSpecsScreen.tsx       # Vehicle technical specifications reference
    │   ├── OilChangeDetailsScreen.tsx  # Detailed oil change guide/tracker
    │   ├── VehicleVitalsScreen.tsx   # Manual vehicle health data entry
    │   ├── VehicleSettingsScreen.tsx # Vehicle profile settings & odometer updates
    │   ├── ServiceHistorySetupScreen.tsx  # Legacy data catch-up wizard screen
    │   ├── WelcomeScreen.tsx         # Simple welcome/splash redirect
    │   │
    │   ├── auth/
    │   │   ├── LoginScreen.tsx       # Email + password login form
    │   │   └── RegisterScreen.tsx    # New account registration form
    │   │
    │   ├── onboarding/
    │   │   └── OnboardingScreen.tsx  # Swipeable feature introduction pages
    │   │
    │   └── setup/
    │       └── VehicleSetupScreen.tsx # First-run vehicle profile configuration
    │
    ├── services/
    │   └── database.ts               # All SQLite CRUD operations (single service layer)
    │
    ├── store/
    │   └── useAppStore.ts            # Zustand store: session flags persisted to SecureStore
    │
    └── types/
        └── database.types.ts         # TypeScript interfaces for all DB table rows
```

---

## 5. Screens & Pages

### 🏠 DashboardScreen
**Route:** `MainTabs > Dashboard`  
**Purpose:** The primary home screen. Displays a kinetic semicircular gauge showing current mileage/range, bento-style cards for quick vitals at a glance, and quick-action buttons linking to Pre-Ride Check and Service Logs.  
**Key Features:**
- Animated SVG gauge with gradient progress arc
- Vehicle health summary cards (oil, tires, battery, brakes)
- Daily km average and estimated range display
- Shortcut to Service Logs and Pre-Ride Check

---

### ⚙️ MaintenanceScheduleScreen (`Vitals` tab)
**Route:** `MainTabs > Vitals`  
**Purpose:** Tracks the 7 predefined service intervals tied to odometer readings. Each interval card shows a health percentage, km until next service, and last service date — derived from the **Smart-Link** system connecting service logs to intervals.  
**Tracked Intervals:**
1. Oil Change — every 1,000 km
2. Gearbox Oil Change — every 3,000 km
3. Air Filter — every 1,000 km (check)
4. Brake Pads — every 2,000 km (check)
5. Cleaning — on-demand (no km interval)
6. CVT & Pull Rollers — every 5,000 km
7. Carburetor — every 5,000 km (clean)

---

### 📁 DocumentsVaultScreen (`Vault` tab)
**Route:** `MainTabs > Vault`  
**Purpose:** Stores photos of important vehicle documents (license, insurance, registration) with expiry dates. Highlights documents expiring within 30 days.  
**Key Features:**
- Camera/gallery image picker via `expo-image-picker`
- Expiry date sorting (soonest first from DB)
- Visual warning badges for near-expiry documents
- Delete swipe action

---

### 📦 InventoryScreen (`Inventory` tab)
**Route:** `MainTabs > Inventory`  
**Purpose:** Manages spare parts and consumables stock levels. Helps riders never be caught without a critical spare.  
**Key Features:**
- Add/edit/delete parts with name, category, quantity, and status
- Status levels: `In Stock`, `Low`, `Out`
- Last-replaced date tracking
- Category filtering

---

### ✅ PreRideCheckScreen (hidden tab)
**Route:** `MainTabs > PreRideCheck` (not shown in tab bar)  
**Purpose:** A daily safety ritual screen presenting 4 critical checks before riding: Brakes, Tires, Lights, and Oil. Saves state to SQLite so the app knows the last time a check was completed.  
**Key Features:**
- Toggle-style checklist with animated feedback
- Persists last completed check timestamp
- Accessible from Dashboard quick-action

---

### 📋 ServiceLogsScreen (hidden tab)
**Route:** `MainTabs > ServiceLogs` (not shown in tab bar)  
**Purpose:** Full chronological log of all maintenance events. Supports adding manual logs that optionally link to a Service Interval via the **Smart-Link** system (which auto-resets the linked interval's counter).  
**Key Features:**
- Add logs with title, date, mileage, category, cost, and notes
- `service_type` dropdown links log to a tracked interval
- Smart-Link auto-resets interval odometer on save
- Delete logs

---

### ⛽ GasLogScreen
**Route:** Accessible from Dashboard  
**Purpose:** Logs every fuel fill-up with liters, cost, odometer reading, and optionally the gas station name. Enables fuel efficiency tracking over time.

---

### 📊 InsightsScreen
**Route:** Accessible from Dashboard  
**Purpose:** Aggregates service log and gas log data into spending summaries and usage insights. Designed for riders who want to understand their total cost of ownership.

---

### 🔧 TechSpecsScreen
**Route:** Accessible from Dashboard or Settings  
**Purpose:** A curated reference sheet of common technical specifications for the rider's scooter model (torque specs, fluid types, belt sizes, etc.). Acts as a built-in workshop manual reference.

---

### 🛢️ OilChangeDetailsScreen
**Route:** Accessible from Maintenance Schedule or Dashboard  
**Purpose:** Step-by-step oil change guide with a dedicated tracker for the current oil fill. Includes oil type recommendation and drain interval reminder.

---

### 💓 VehicleVitalsScreen
**Route:** Accessible from Dashboard  
**Purpose:** A manual data entry form for updating real-time vehicle health metrics: oil life %, tire pressure (PSI), battery health %, coolant temperature, and brake pad %.

---

### ⚙️ VehicleSettingsScreen
**Route:** Accessible from Dashboard / Profile  
**Purpose:** Edit the vehicle profile — update current odometer reading, total km range, and daily average km. Changes to odometer automatically update the last-update timestamp for range estimation.

---

### 🧙 ServiceHistorySetupScreen (History Catch-up Wizard)
**Route:** Triggered automatically when Maintenance screen is first opened without existing logs  
**Purpose:** An onboarding wizard that collects the last-performed date and odometer reading for each of the 7 service intervals. This data is used to generate "Legacy Logs" that seed the app with historical context so interval health percentages are accurate from day one.

---

### 👤 Auth Screens
**Routes:** `Auth > Login`, `Auth > Register`  
**Purpose:** Simple email/password authentication forms. Currently simulated (no backend) — `login()` action sets `isAuthenticated: true` in the Zustand store.

---

### 🎉 OnboardingScreen
**Route:** First screen shown to new users  
**Purpose:** Swipeable 3-page feature introduction using `react-native-pager-view`. Calls `completeOnboarding()` on the final page to unlock the Auth flow.

---

### 🚗 VehicleSetupScreen
**Route:** Shown after first login before main tabs  
**Purpose:** Collects initial vehicle data (current mileage, range) and writes it to SQLite via `saveVehicleProfile()`. Calls `completeVehicleSetup()` to unlock the main tabs.

---

## 6. Navigation Architecture

The app uses a **3-tier conditional navigation system**:

```
App.tsx
└── NavigationContainer
    └── RootNavigator (createNativeStackNavigator)
        ├── [if !hasCompletedOnboarding] → OnboardingScreen
        ├── [if !isAuthenticated] → AuthNavigator
        │       ├── LoginScreen
        │       └── RegisterScreen
        ├── [if !hasCompletedVehicleSetup] → VehicleSetupScreen
        └── [else] → TabNavigator (createBottomTabNavigator)
                ├── Dashboard (visible)
                ├── Vitals (visible)
                ├── Vault (visible)
                ├── Inventory (visible)
                ├── PreRideCheck (hidden — no tab button)
                └── ServiceLogs (hidden — no tab button)
```

**Gate Logic** (from `useAppStore`):
- `hasCompletedOnboarding` — persisted in SecureStore; set by `completeOnboarding()`
- `isAuthenticated` — persisted in SecureStore; set by `login()`
- `hasCompletedVehicleSetup` — persisted in SecureStore; set by `completeVehicleSetup()`

All three flags must be `true` before the user sees the main tab interface.

**Custom Tab Bar:** The `TabNavigator` renders a fully custom `CustomTabBar` component backed by `expo-blur` (`BlurView`) with a rounded top edge, hiding itself when `PreRideCheck` or `ServiceLogs` are active.

---

## 7. Data Layer

All data is stored locally using **expo-sqlite** (SQLite). There is no cloud backend.

### Database File
`3azza.db` — opened as a singleton via `getDb()` in `database.ts`.

### SQLite Schema

#### `vehicle_profile` (singleton row, id = 1)
| Column | Type | Description |
|---|---|---|
| `current_mileage` | INTEGER | Current odometer reading |
| `total_km_range` | INTEGER | Full tank range in km |
| `has_completed_setup` | INTEGER | 0/1 flag |
| `daily_average_km` | INTEGER | Average daily distance |
| `last_odometer_update_timestamp` | TEXT | ISO datetime of last odometer update |

#### `vehicle_vitals` (singleton row, id = 1)
| Column | Type | Description |
|---|---|---|
| `oil_life_pct` | INTEGER | Oil life percentage (0–100) |
| `tire_pressure_psi` | INTEGER | Tire pressure in PSI |
| `battery_health_pct` | INTEGER | Battery health percentage |
| `coolant_temp_c` | INTEGER | Coolant temperature in °C |
| `brake_pad_pct` | INTEGER | Brake pad thickness percentage |

#### `gas_logs`
| Column | Type | Description |
|---|---|---|
| `liters` | REAL | Fuel amount filled |
| `cost` | REAL | Total cost of fill-up |
| `odometer_km` | INTEGER | Odometer at time of fill |
| `station` | TEXT | Gas station name (optional) |
| `logged_at` | TEXT | Auto-timestamp |

#### `inventory_items`
| Column | Type | Description |
|---|---|---|
| `name` | TEXT | Part name |
| `category` | TEXT | Category (e.g., "Filters", "Fluids") |
| `status` | TEXT | `In Stock` / `Low` / `Out` |
| `quantity` | INTEGER | Units in stock |
| `last_replaced_at` | TEXT | Last replacement date (optional) |

#### `documents_vault`
| Column | Type | Description |
|---|---|---|
| `title` | TEXT | Document name (e.g., "Insurance") |
| `image_uri` | TEXT | Local file URI from `expo-image-picker` |
| `expiry_date` | TEXT | ISO date string |
| `added_at` | TEXT | Auto-timestamp |

#### `pre_ride_checks` (singleton row, id = 1)
| Column | Type | Description |
|---|---|---|
| `brakes_checked` | INTEGER | 0/1 |
| `tires_checked` | INTEGER | 0/1 |
| `lights_checked` | INTEGER | 0/1 |
| `oil_checked` | INTEGER | 0/1 |
| `last_run_at` | TEXT | Timestamp of last completed check |

#### `service_logs`
| Column | Type | Description |
|---|---|---|
| `title` | TEXT | Log entry title |
| `date` | TEXT | Date of service |
| `mileage` | INTEGER | Odometer at time of service |
| `category` | TEXT | Category (e.g., "Oil", "Brakes") |
| `notes` | TEXT | Technician/rider notes |
| `cost` | REAL | Cost in local currency (optional) |
| `service_type` | TEXT | Links to `service_intervals.name` (Smart-Link) |

#### `service_intervals`
| Column | Type | Description |
|---|---|---|
| `name` | TEXT | Interval name (UNIQUE, e.g., "Oil Change") |
| `interval_km` | INTEGER | km between services (NULL = on-demand) |
| `last_service_odometer_km` | INTEGER | Odometer when last serviced |
| `type` | TEXT | `replace` / `check` / `clean` |

### Smart-Link System
When a service log is added with a `service_type` matching a `service_intervals.name`:
1. `resetIntervalByName()` is called with the log's mileage
2. The interval's `last_service_odometer_km` is set to the log mileage
3. This resets the health % to 100% on the Vitals screen

### Database Service API (`src/services/database.ts`)

| Function | Description |
|---|---|
| `initDatabase()` | Creates all tables and seeds default intervals |
| `getVehicleProfile()` / `saveVehicleProfile()` | CRUD for vehicle profile singleton |
| `getVehicleVitals()` / `saveVehicleVitals()` | CRUD for vehicle vitals singleton |
| `getGasLogs()` / `insertGasLog()` / `deleteGasLog()` | Gas log operations |
| `getInventoryItems()` / `upsertInventoryItem()` / `updateInventoryItem()` / `deleteInventoryItem()` | Inventory CRUD |
| `getDocuments()` / `addDocument()` / `deleteDocument()` | Document vault CRUD |
| `getPreRideState()` / `savePreRideState()` | Pre-ride check singleton |
| `getServiceLogs()` / `addServiceLog()` / `deleteServiceLog()` | Service log CRUD |
| `getServiceLogCount()` | Returns total log count (used to gate the onboarding wizard) |
| `getLatestLogForServiceType()` | Fetches newest log for a given service type (Unified Model) |
| `resetIntervalByName()` | Updates interval odometer via Smart-Link |
| `getServiceIntervals()` / `updateServiceInterval()` | Service interval management |

---

## 8. State Management

### Zustand Store (`src/store/useAppStore.ts`)

Global app state is managed with **Zustand** (v5) and persisted to **expo-secure-store** using a custom storage adapter.

```ts
interface AppState {
  // Onboarding
  hasCompletedOnboarding: boolean;
  completeOnboarding: () => void;
  resetOnboarding: () => void; // Dev only

  // Auth
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;

  // Vehicle Setup
  hasCompletedVehicleSetup: boolean;
  completeVehicleSetup: () => void;
}
```

**Storage key:** `3azza-secure-store` (encrypted by the OS keychain/keystore)

**Hydration:** `App.tsx` waits for `useAppStore.persist.onFinishHydration()` before hiding the splash screen, preventing UI flashes from stale initial state.

> ⚠️ **Note:** All domain data (gas logs, inventory, etc.) lives in **SQLite**, not Zustand. Zustand only holds lightweight boolean session flags.

---

## 9. Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **Expo CLI** (`npm install -g expo-cli` or use `npx expo`)
- **Android Studio** (for Android development) or **Xcode** (for iOS development)
- **Expo Go** app on a physical device (for quick testing)

### Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd 3azza2/app

# 2. Install dependencies
npm install

# 3. Start the development server
npm start
# or
npx expo start
```

### Running on a Device

```bash
# Android (physical device or emulator)
npm run android
# or: npx expo run:android

# iOS (macOS only)
npm run ios
# or: npx expo run:ios

# Web (limited functionality — native APIs won't work)
npm run web
```

### First Launch Flow
On a clean install, the app will sequentially present:
1. **OnboardingScreen** — Swipe through 3 feature intro pages
2. **LoginScreen / RegisterScreen** — Enter credentials (simulated, no backend)
3. **VehicleSetupScreen** — Enter current mileage and tank range
4. **DashboardScreen** — Full app unlocked

---

## 10. Environment & Configuration

### `app.json` (Expo Config)

| Key | Value | Notes |
|---|---|---|
| `name` | `3azza` | Display name on device home screen |
| `slug` | `3azza` | Expo project slug |
| `version` | `1.0.0` | App store version |
| `android.package` | `com.youssefbayoumy.x3azza` | Android bundle identifier |
| `userInterfaceStyle` | `light` | Forces light status bar (overridden in app) |
| `plugins` | `expo-font`, `expo-sqlite`, `expo-secure-store` | Required native plugin declarations |

### `tailwind.config.js`
Contains the full Material Design 3 dark-theme color token set and the 3 font family aliases (`headline`, `body`, `label`). Modify this file to update the entire visual theme.

### `metro.config.js`
Configured for NativeWind v4 compatibility. Do not edit unless upgrading NativeWind.

### `babel.config.js`
Uses `babel-preset-expo`. NativeWind's babel plugin is applied here for className transformation.

---

## 11. Known Issues & Limitations

| Issue | Status | Notes |
|---|---|---|
| **Authentication is simulated** | Planned | `login()` sets `isAuthenticated: true` locally; no real credential validation |
| **No cloud sync** | By design | All data is device-local; data loss on uninstall/factory reset |
| **Image URIs are ephemeral** | Known bug | `expo-image-picker` URIs in Documents Vault may become invalid after OS restarts on some Android versions; should be copied to app's document directory |
| **Reanimated strict-mode warnings** | Suppressed | `LogBox.ignoreLogs` in App.tsx silences upstream third-party warnings |
| **No data export** | Planned | No CSV/PDF export option exists yet |
| **No push notifications** | Planned | Interval due-date reminders require background notification support |
| **Migration is manual** | Technical debt | Schema migrations use `try/catch ALTER TABLE` — should be replaced with a proper versioned migration system |
| **Single vehicle** | Design constraint | The app only supports one vehicle profile (singleton DB rows) |

---

## 12. Suggested Improvements

### 🔐 Authentication
- Integrate a real authentication backend (Supabase, Firebase Auth, or a custom REST API)
- Add biometric authentication (Face ID / fingerprint) for quick login using `expo-local-authentication`
- Add "Forgot Password" flow

### ☁️ Cloud Sync & Backup
- Implement optional cloud backup to give users peace of mind about data loss
- Supabase is a natural fit given the relational SQLite schema — migration would be straightforward
- Allow multi-device sync for fleet use-cases

### 📱 Multi-Vehicle Support
- Refactor singleton DB rows (`vehicle_profile`, `vehicle_vitals`, `pre_ride_checks`) to support multiple vehicle IDs
- Add vehicle switcher UI in the tab bar or a dedicated Garage screen

### 🔔 Push Notifications
- Use `expo-notifications` to schedule local (on-device) push alerts when a service interval is within 100km of due
- Daily reminder for Pre-Ride Check if it hasn't been completed
- Document expiry alerts 30 days and 7 days before the expiry date

### 📊 Advanced Insights
- Calculate cost-per-km from gas and service log data
- Monthly spending charts (fuel vs. maintenance breakdown)
- Predict next service dates based on daily average km

### 🗃️ Data Export & Sharing
- Export service history as a PDF or CSV for mechanics or resale documentation
- Share a document directly from the Documents Vault via the system share sheet

### 🧪 Testing Infrastructure
- Zero tests currently exist — introduce Jest + React Native Testing Library
- Add integration tests for the database service layer
- Snapshot tests for critical UI components

### 🗄️ Database Migrations
- Replace the current `try/catch ALTER TABLE` migration pattern with a proper versioned migration system (e.g., a migration table tracking schema version)

### 🌍 Localization (i18n)
- Add Arabic language support — the target market includes Arabic-speaking regions
- Currency localization (EGP, SAR, etc.)

### ♿ Accessibility
- Add `accessibilityLabel` and `accessibilityHint` props to all interactive elements
- Ensure minimum contrast ratios on all text/surface combinations
- Support dynamic text sizing (`allowFontScaling`)

### 🎨 UI Polish
- Implement skeleton loading states while SQLite queries resolve
- Add haptic feedback (`expo-haptics`) on key interactions (checklist toggles, form submissions)
- Animate the kinetic gauge on Dashboard with a sweep-in effect on mount

### 🔧 Technical Debt
- Extract magic strings (service interval names, status values) into shared constants/enums
- Standardize date handling — currently a mix of `datetime('now')` SQLite defaults and JavaScript `new Date()` calls
- Add error boundaries around screens to prevent full app crashes from isolated screen failures

---

## 13. Contributing

This project currently has a single developer. If contributing:

1. **Branch naming:** `feature/`, `fix/`, `chore/` prefixes
2. **Commit style:** Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`)
3. **No linter configured yet** — follow the existing code style (2-space indent, TypeScript strict mode, functional components only)
4. **Database changes:** Any schema change must also update `database.types.ts` and the `initDatabase()` function, and should handle existing users via a safe `ALTER TABLE` or migration

---

## License

Private project — © 2026 Youssef Bayoumy. All rights reserved.
