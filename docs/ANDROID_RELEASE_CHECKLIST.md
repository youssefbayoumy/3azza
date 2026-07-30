# Android release checklist

This milestone qualifies Android only. It makes no iOS or App Store readiness claim.

## Physical-device responsive APK (2026-07-28)

- Device: Samsung Galaxy A56 (`SM-A566B`, serial `RKCY901J8WB`).
- Package/version: `com.youssefbayoumy.x3azza` 1.0.0 (`versionCode` 4).
- Artifact: `dist/android/3azza-1.0.0-4-responsive-release.apk` and `/sdcard/Download/3azza-1.0.0-4-responsive-release.apk` on the Samsung.
- APK SHA-256: `B188F67ACFA5E038E1564CB47574363416BA98BC2206EF10F8868B0E07D85D7B`; the on-device hash matches.
- Upgrade result: in-place install succeeded and retained the original `firstInstallTime` (`2026-07-25 03:22:48`) and application records.
- UI result: full single-line tab labels, normal-flow tab bar, fully visible/calibrated Home gauge, 97.7% oil progress at 23 km remaining, responsive Documents empty state/action/disclosure, and responsive Pre-Ride gauge passed physical inspection.
- Runtime result: cold-start lock, unlock, Home, Maintenance, Documents, and Pre-Ride passed; app-PID logs contained no fatal exception, ANR, React Native error, or app SQLite exception.
- Automated result: TypeScript, Expo lint, 70 tests, Expo Doctor 19/19, zero-Critical dependency policy, and native release assembly pass.
- Signing boundary: this is an optimized local release-variant APK signed by the existing diagnostic certificate for direct device installation. It is not the Play upload artifact. Candidate-2 AAB predates these UI changes; create and verify a remotely signed version-code-4-or-later AAB before store submission.

## Verified Milestone 5 candidate 2 (2026-07-25)

- EAS project: `@youssefbayoumy/3azza`
- EAS build ID: `343a21b4-f85d-4583-800a-35f5d241343e`
- Package/version: `com.youssefbayoumy.x3azza` 1.0.0 (`versionCode` 2)
- AAB SHA-256: `B6471215DA78D4CCDF441CB53DEAD7469ED40C07377803077812866DE5872CBB`
- Upload certificate SHA-256: `22:10:C0:76:EC:D1:85:5A:E7:AE:58:EA:53:46:D2:41:B5:07:35:62:4A:77:3A:0E:1D:50:2F:14:82:8E:0A:57`
- Local downloaded artifact: `dist/android/3azza-1.0.0-2-production.aab` (ignored by Git)
- Result: signed AAB signature and bundle structure verified; exact bundle passed fresh-install, phone, adaptive launcher/splash, and final-log smoke checks as a device-specific Play-style split set on Android API 35. The same version passed an in-place preserved-data diagnostic upgrade before exact-bundle installation was isolated to a disposable emulator.
- Rollback evidence: candidate 1, build `00f66e2d-f435-4340-8c35-3e0157274ce7`, AAB SHA-256 `1FBFE88FBEBD12841842EEE4C6FC3396091DE532180B97BC6DFC219EE04A0689`.

Build page: <https://expo.dev/accounts/youssefbayoumy/projects/3azza/builds/343a21b4-f85d-4583-800a-35f5d241343e>

## Automated candidate gate

Use Node 22 and install only from the committed lockfile:

```bash
npm ci
npm run release:check
```

The gate runs TypeScript, Expo lint, all tests, Expo Doctor, and the Android critical-advisory policy. A critical advisory blocks the candidate. High or lower advisories require an explicit review below because Expo and React Native include build tooling in npm's production graph.

## Dependency risk disposition

- Expo SDK 55 packages are aligned and must keep `expo-doctor` at 19/19.
- The `shell-quote` critical advisory is patched through an SDK-compatible override.
- Remaining high advisories are transitive Expo/React Native or lint/build-tool paths. npm's proposed full remediation upgrades React Native from 0.83 to 0.86 outside Expo SDK 55 compatibility, so it must not be forced into a release candidate.
- The `xcode` to `uuid` advisory path is iOS-only and excluded from this Android milestone.
- Re-run both `npm audit --omit=dev` and the full device matrix after the next supported Expo SDK upgrade. Remove an override only after the upstream dependency resolves to an equal or newer patched version.
- The verified candidate has no Critical advisory. Its Android production graph still reports 21 high, 10 moderate, and 1 low transitive finding; this is accepted only under the documented SDK-compatibility disposition and must be reviewed again before the next upload.

## Build and signing

- Increment `expo.android.versionCode` for every uploaded candidate.
- Build the `production` EAS profile with `npx --yes eas-cli@21.2.0 build --platform android --profile production`. It emits an Android App Bundle, not a debug APK. The `eas.json` CLI constraint rejects stale clients before upload.
- Confirm the final AAB is signed with the Play upload certificate. Never upload an artifact signed by the Android debug key.
- Record the EAS build ID, git revision, version name, version code, certificate fingerprint, and SHA-256 of the downloaded AAB.
- Keep the previous accepted AAB and its release notes available for rollback. Google Play rollback is a new build with a higher version code; an uploaded version code cannot be reused.

## Phone and tablet smoke matrix

- Fresh install: onboarding, PIN creation, vehicle setup, dashboard.
- Upgrade install: current records open and schema migration preserves all data.
- App lock: cold launch, background relock, wrong PIN throttle, biometric fallback.
- Data integrity: odometer rollback, negative inventory, invalid percentages, and records above odometer are rejected.
- Records: add/edit/delete fuel, service, document, inventory, and manual readings.
- Backup: create archive, close share sheet, restore valid archive, reject malformed archive without changing live data.
- Notifications: denial state, enable state, scheduled reminder, warm tap, cold tap after unlock.
- Layout: compact phone, standard phone, and tablet width; system font at 1.3x; keyboard and Android Back behavior.
- Final logs: no fatal exception, ANR, unhandled React Native error, SQLite exception, or new warning attributable to the app.

## Play Console readiness

- Complete store listing, phone/tablet screenshots, feature graphic, content rating, target audience, support contact, and privacy-policy URL.
- Complete Data safety accurately: local records and document photos remain on device unless the user explicitly exports them; exports are unencrypted.
- Review notification and biometric permission disclosures against current Play policy.
- Run Play pre-launch reports on the closed-testing AAB before production rollout.
- Start with a staged rollout and monitor Android vitals. Halt rollout on data loss, startup failure, lock bypass, restore corruption, or notification-navigation regression.

## Rollback record

- Keep the downloaded candidate and its SHA-256 with the release notes; do not rely only on the hosted build URL.
- A Play rollback requires rebuilding the last known-good source with a `versionCode` greater than the rejected/current production version.
- If a release gate fails, stop distribution. Do not replace the signed AAB with a locally generated APK: local diagnostic APKs are debug-signed even when assembled with the `release` Gradle variant.
