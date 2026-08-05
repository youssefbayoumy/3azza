# Android build and connected-device QA report

Date: 2026-08-03 (Africa/Cairo)

## Result

The maintenance information-architecture update is implemented and both Android
packages were upgraded in place on the connected Samsung device. Automated
validation passed with 219 tests. The final APKs are version 2.3.3 / version code
12 and run as standalone bundled applications without Metro or ADB reverse.

The functional maintenance checks passed. Samsung retained the regular package's
old cached adaptive-icon bitmap after multiple valid package updates and a full
device restart. At the owner's direction, further icon-cache investigation and
recent-apps icon verification were stopped and are excluded from the completion
claim. No app data or unrelated system data was cleared.

## Scope implemented

- The top-level sections are exactly `Scheduled maintenance`, `Wear and
  condition`, and `General checks`.
- Each component has one deterministic top-level home. Child actions no longer
  classify themselves into separate sections or create duplicate component cards.
- Engine oil, gear oil, air filter, spark plug, and CVT / drive belt live under
  Scheduled maintenance.
- Brakes, tires, and battery live under Wear and condition.
- Steering, suspension, nuts and bolts, main and side stands, and general
  workshop inspection live under General checks.
- Inspection, cleaning, replacement, condition, and leakage actions remain
  independently scheduled, recorded, customized, enabled/disabled, and linked to
  their exact action history inside their owning component.
- Child actions render as compact rows. Their menus expose recording, reminder
  customization, history, enable/disable, and restoration where applicable.
- Historical one-time milestones are hidden/archived when no longer actionable
  and cannot be converted into recurring custom reminders.
- Groups with different active child schedules show `Multiple schedules` or a
  nearest-action summary rather than a false shared interval.
- Exact record labels are action-specific, including engine/general fastener,
  steering, suspension, shock absorber, oil-level, air-filter, brake, and
  brake-pad actions.
- Air filter defaults to inspection every 1,000 km with cleaning/replacement by
  condition. It has no active fixed replacement countdown unless the owner creates
  one.
- `cleaning_needed` is supported throughout condition recording, persistence,
  migration, scheduling, and presentation.
- Default time intervals were audited in `MAINTENANCE_TIME_INTERVAL_AUDIT.md`.
  No active time interval is inferred by converting mileage to months.

## Automated verification

Final command: `npm run check`

- Scooter-catalog generated-data check: passed.
- Model-data generated-data check: passed (10 manuals).
- Maintenance profile `sym-new-symphony-st-xl20w1-eu-it`, version
  `2026.08.03-ia1`: valid (68 rules).
- TypeScript: passed.
- ESLint: passed.
- Tests: 219 passed, 0 failed (42 suites).

The test coverage includes deterministic one-section ownership, required component
homes, child containment, exact labels, no false group interval, air-filter
condition behavior, historical-action restrictions, action-isolated history,
custom reminder modes, non-inferred time intervals, and Android package/icon
configuration.

## Device and package state

- Serial: `RKCY901J8WB`
- Device: Samsung `SM-A566B`
- Android: 16 / API 36
- Device ABI: `arm64-v8a`
- ADB state: connected as `device`
- ADB reverse mappings: none

State observed before this work on 2026-08-03:

| Variant | Package | Version | First install | Last update |
| --- | --- | --- | --- | --- |
| QA | `com.youssefbayoumy.x3azza.qa` | 2.3.0-qa (9) | 2026-08-01 12:42:44 | 2026-08-02 12:41:48 |
| Regular | `com.youssefbayoumy.x3azza` | 2.3.0 (9) | 2026-07-25 03:22:48 | 2026-08-01 15:38:45 |

Final installed state:

| Variant | Package | Version | First install preserved | Final update |
| --- | --- | --- | --- | --- |
| QA | `com.youssefbayoumy.x3azza.qa` | 2.3.3-qa (12) | 2026-08-01 12:42:44 | 2026-08-03 13:36:45 |
| Regular | `com.youssefbayoumy.x3azza` | 2.3.3 (12) | 2026-07-25 03:22:48 | 2026-08-03 13:36:58 |

All upgrades used `adb -s RKCY901J8WB install -r`. Both returned `Success`.
The unchanged first-install timestamps and preserved user-visible state confirm
that neither package was uninstalled or data-cleared.

## Final APKs

### QA

- Built APK: `android/app/build/outputs/apk/qa/app-qa.apk`
- Deliverable: `dist/android/3azza-2.3.3-12-maintenance-qa.apk`
- Package/version: `com.youssefbayoumy.x3azza.qa`, 2.3.3-qa (12)
- Display name: `3azza QA`
- Size: 97,743,297 bytes
- SHA-256: `93AE5F03CF81F78E40FCEEE0728D1727083322D7FE5B359FF1CB30303F0AE55F`

### Regular

- Built APK: `android/app/build/outputs/apk/release/app-release.apk`
- Deliverable: `dist/android/3azza-2.3.3-12-maintenance-regular.apk`
- Package/version: `com.youssefbayoumy.x3azza`, 2.3.3 (12)
- Display name: `3azza`
- Size: 97,743,277 bytes
- SHA-256: `CD0438466B3B31E62B0907907EACDD5761F8DED16ED81C8D934C9F9A12CFBEA6`

Both APKs:

- Minimum/target SDK: 24 / 36
- Native ABIs: `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`
- APK Signature Scheme v2: verified
- Signer certificate SHA-256:
  `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`
- Contain bundled JavaScript and do not require Metro.

The current Gradle configuration signs these diagnostic QA/release artifacts with
the Android debug certificate. They are suitable for the tested in-place upgrade
path, but they are not Play/store production-signed artifacts.

## Connected-device functional QA

Package identity was explicitly resolved before each launch. The QA launchable
component is
`com.youssefbayoumy.x3azza.qa/com.youssefbayoumy.x3azza.MainActivity`; the regular
component is `com.youssefbayoumy.x3azza/.MainActivity`.

Passed scenarios:

- Both packages cold-launched successfully, remained alive, and focused their
  expected activities.
- Both packages retained their existing selected SYM New Symphony ST vehicle and
  odometer/history state after update.
- Regular displayed the new one-home component hierarchy rather than the older
  duplicated-section UI.
- Scheduled maintenance showed engine oil, gear oil, air filter, spark plug, CVT
  / drive belt, and fuel-pump filter without duplicate top-level cards.
- Wear and condition showed brakes, tires, and battery.
- General checks showed steering, suspension, nuts and bolts, main and side stands,
  and general workshop inspection.
- Air filter showed `Inspection every 1,000 km · replace when needed` rather than
  a fixed replacement countdown.
- Expanding air filter exposed compact inspection, cleaning, and replacement rows.
- The air-filter inspection action menu exposed `Record previous air-filter
  inspection`, `Customize reminder`, `View history`, and `Disable reminder`.
- Gear oil contained separate replacement and gearbox-leakage actions; the leakage
  check did not become another component card.
- Mixed child schedules displayed `Multiple schedules` rather than one incorrect
  shared interval.
- No large per-row Customize button, duplicate historical explanation, clipped
  bottom navigation, or card-covering in-app alert was observed.
- QA preserved its existing engine-oil custom reminder (1,000 km / 2 months) and
  gear-oil custom reminder (3,000 km / 5 months) across an app force-stop/cold
  restart.
- Regular retained its existing vehicle data through the final code-12 update and
  cold restart.

No records, preferences, reminders, or vehicle values were created, edited, or
deleted during this pass.

## Branding and icon verification

Source/build configuration:

- Expo icon: `assets/icon-v2.png`
- Adaptive foreground: `assets/android-icon-foreground.png`
- Adaptive monochrome: `assets/android-icon-monochrome.png`
- Adaptive background: `#081421`
- QA label: `3azza QA`; regular label: `3azza`
- Final manifest uses dedicated versioned drawable icon resources, resolving to
  new compiled resource IDs `0x7f0800af` and `0x7f0800b0` in both APKs.
- No React Native or Expo default icon path is referenced by the final app or
  manifest configuration.

Device observations:

- QA rendered the intended dark 3azza icon in launcher search and App info.
- Regular continued to render a previously cached light construction-grid icon in
  launcher search and App info even after a valid version/resource update.
- A package disable/enable notification refresh was tried only for the regular
  package, then its enabled state was restored to Android's `default`; app data and
  first-install time remained intact.
- A full device restart was completed and confirmed from reset device uptime. The
  regular package's stale launcher bitmap remained; QA continued to show the
  intended icon.
- No launcher, Settings, app, or system data was cleared.
- At the owner's direction, the remaining icon issue was explicitly ignored. No
  One UI Home cache clear or further recent-apps/App-info icon work was performed.

## Runtime logs

PID-filtered logcat scans were captured after cold launches. The scans found none
of the targeted fatal signatures:

- `AndroidRuntime`
- `FATAL EXCEPTION`
- React Native JavaScript error/exception
- `Unable to load script`
- `Invariant Violation`
- `SQLiteException`
- `ActivityNotFoundException`

The absence of these signatures is not a proof that every runtime path is error
free; it is the result for the focused launch/navigation scenarios above.

## Evidence

Evidence is stored under `tmp/device-qa-20260803/`, including:

- `qa-final-launch.png` / `.xml`
- `qa-final-maintenance-top.png` / `.xml`
- `qa-final-after-restart-maintenance.png` / `.xml`
- `regular-code12-home.png` / `.xml`
- `regular-maintenance-top.png` / `.xml`
- `regular-maintenance-wear.png` / `.xml`
- `regular-maintenance-sections.png` / `.xml`
- `regular-air-expanded2.xml`
- `regular-air-action-menu.png` / `.xml`
- `launcher-search-3azza-code12.png` / `.xml`
- `launcher-search-3azza-after-reboot.png` / `.xml`
- `regular-final-app-info.png` / `.xml`
- `qa-final-app-info.png` / `.xml`
- `qa-final-launch-logcat.txt`
- `regular-code12-launch-logcat.txt`

## Safety boundaries and remaining coverage

Deliberately not performed:

- No uninstall, data clear, storage clear, downgrade, permission reset, or device
  reset.
- No PIN/biometric entry, guessing, disabling, or bypass. The owner handled phone
  authentication.
- No database editing, synthetic production data, destructive record action, or
  reminder mutation.
- No external-link opening.
- No Metro server and no ADB reverse mapping.
- No claim of store-production signing/readiness.
- No claim that the regular package's Samsung-cached launcher/App-info/recents
  bitmap is corrected; further icon work was waived by the owner.

The focused scenarios validate the requested hierarchy, update path, persistence,
and ordinary interactions. They do not replace a full clean-state matrix covering
all possible histories, permissions, notification delivery states, and Android
versions.
