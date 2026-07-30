# Paste this into a new Codex chat

```text
Continue the 3azza Expo/React Native app in:
C:\Users\youss\Desktop\Vibe coding\3azza2\app

Your task is to design, implement, test, version, and install a guided exact-scooter identification experience for both first-time setup and changing an existing vehicle's scooter reference.

First read this handover completely and treat it as the current source of truth:
C:\Users\youss\Desktop\Vibe coding\3azza2\app\docs\MODEL_SELECTION_HANDOFF_2026-07-30.md

The root CODEX_HANDOFF.md is historical and stale for current branch/build state. Then inspect git status/log and all files listed in section 10 of the new handover. Do not ask me to repeat the context that is already documented.

Current safe app state:
- Version 2.0.1, Android build 6.
- Current functional commit d3529c0 on codex/model-specific-sym-v2.0.1.
- 2.0.0 fallback: 07cd08b / codex/model-specific-sym-v2.
- Pre-model-data fallback: a43fbc6 / codex/current-before-sym-model-data.
- The working tree contains user-owned changes in RootNavigator.tsx, VehicleSettingsScreen.tsx, RegisterScreen.tsx, useAppStore.ts, appLock.test.ts, plus untracked .qa-ux03/. Do not discard, reset, or blindly overwrite them. VehicleSettingsScreen.tsx overlaps this task, so inspect its diff and integrate carefully; do not stage unrelated app-lock/navigation changes in your feature commit.
- Samsung SM-A566B is connected as RKCY901J8WB, subject to checking current device state.

Before editing, create a new branch from the current 2.0.1 state named codex/guided-model-identification-v2.1.0 (or a collision-free equivalent). Do not move or rewrite any fallback branch. When verified, bump the app to 2.1.0 and Android versionCode 7 unless the repository already has a newer version.

Product objective:
Replace the engine-code-heavy choice with a guided, model-aware selector that can distinguish the exact supported variant using manual-backed features such as:
- displacement/cc;
- air cooling vs liquid cooling;
- carburetor vs electronic fuel injection;
- exact engine/model code;
- manual years/version;
- one other sourced discriminator only when needed, such as ABS/brake configuration.

Use the best question order for the remaining candidates rather than showing irrelevant questions. Show a candidate list/count and a final confirmation containing brand, model, years, exact variant/code, and selected distinguishing features. Provide an honest “I'm not sure” path. If answers are incomplete, contradictory, ambiguous, conflicted, or missing, never guess: show a recoverable state and keep the saved vehicle unchanged.

Data and security rules:
- Identity must remain stable brandId + modelId + catalog versionId/manualId + variantId. Never identify by display-name matching.
- Generate a normalized identification profile per approved manual/variant from the authoritative master database and existing scoped knowledge records. Do not hand-edit generated JSON as source data.
- Keep manualId and variantId attached to every normalized feature record, with sourceRecordIds and 1-based PDF pages.
- Normalize displacement, cooling system, and fuel system into strict values, while preserving null/missing and conflict states honestly.
- A shared fact may apply to multiple variants only if its source scope proves that.
- Fail generation checks for duplicate or unknown IDs, cross-manual records, invalid enums/cc/pages, or malformed mappings.
- Do not split combined engine-code groups unless the authoritative data proves distinct variants.
- Do not build URLs from vehicle data and do not mix online manual URLs/local paths into identification.

Implementation rules:
- Keep pure candidate filtering and draft-state transitions outside React so they are deterministic and well tested.
- Reuse one shared guided selector in VehicleSetupScreen, Add Vehicle, and Change Scooter Reference.
- Keep the selector as a draft. Changing an ancestor or earlier answer must clear incompatible descendants and stale variant IDs.
- Persist only after explicit confirmation through the existing catalog resolver and database validation.
- Preserve the 2.0.1 fix where resolveScooterSelection returns variantId.
- Changing a scooter must affect only the intended vehicle, preserve service history and valid user overrides, and transactionally reapply only the new model's maintenance applicability.
- Cancellation, no match, validation failure, or database failure must leave saved vehicle data untouched.
- Preserve offline-first multi-vehicle architecture, the existing industrial dark design, accessibility, and honest manual-tracker language.
- Do not add a backend, scanner, VIN decoder, automatic detection, cloud account, or internet lookup.
- Do not change the approved recurring 1,000 km engine-oil policy.
- Do not upgrade Expo/React Native as part of this task unless I explicitly approve it.
- Do not test or open the online manual feature; I asked to leave it untested for now.

Testing requirements:
- Generator integrity for one manual/variant identity, strict normalized values, citations, unknown/conflict preservation, and no cross-model leakage.
- Candidate filtering for 125 vs 200/250/300 cc, air vs liquid cooling, carburetor vs injection, ambiguous and no-match states.
- State reset when brand/model/version or an earlier distinguishing answer changes.
- Exact variantId survives UI resolution and database validation.
- Setup/add/change flows select the correct vehicle only; vehicle switching cannot leak a prior draft or variant.
- Change preserves history/overrides; cancel/failure is non-mutating.
- Existing generated-catalog, model-knowledge, persistence, and manual identity tests stay passing.

Run npm run check. Build a standalone arm64 release APK and update the connected Samsung with adb install -r so data is preserved. Do not uninstall or clear app data. Do not request or enter my PIN. Physically smoke-test only safe non-destructive selector behavior unless I explicitly authorize disposable test data. Verify the installed version, Metro forwarding is absent, no red screen appears, and AndroidRuntime/ReactNativeJS has no fatal error. Do not open a manual link.

Commit the completed feature on the new branch. Report the normalized identification coverage, any source fields that remain missing/conflicted, test results, installed version, APK path, commit, and exact fallback branches. Do not claim completion until the generated checks, full tests, build, and safe device checks pass.
```
