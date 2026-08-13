# 3azza handover: guided exact-model identification

Snapshot date: 2026-07-30  
Application repository: `C:\Users\youss\Desktop\Vibe coding\3azza2\app`  
Android package: `com.youssefbayoumy.x3azza`

This is the authoritative handover for the next update to choosing and changing a scooter model. It supersedes the older [`CODEX_HANDOFF.md`](./handoffs/CODEX_HANDOFF.md) for current branch, build, catalog, and test state. The older file remains useful only as historical product context.

## 1. User objective

Improve scooter selection so a rider can identify the exact model/variant using distinct, understandable features instead of relying primarily on an engine code. Useful distinguishing features include:

- engine displacement, such as 50 cc, 125 cc, 150 cc, 200 cc, 250 cc, 300 cc, or 500 cc;
- cooling system, such as air-cooled or liquid-cooled;
- fuel system, such as carburetor or electronic fuel injection;
- exact engine/model code where available;
- manual years/version;
- additional manual-backed traits only when needed to distinguish remaining candidates, such as ABS/brake configuration or another clearly sourced specification.

The update applies to both first-time vehicle setup and changing the scooter reference for an existing vehicle. The result must always resolve to one exact catalog version and, when required, one exact variant. It must never silently guess or borrow specifications, maintenance, or a manual from another model.

## 2. Current safe state and rollback points

Current source version: **2.0.1**  
Current Android version code: **6**  
Current branch: `codex/model-specific-sym-v2.0.1`  
Current functional commit: `d3529c0` (`fix: preserve scooter variant when changing model`)

Rollback points:

- `d3529c0` / `codex/model-specific-sym-v2.0.1`: working 2.0.1 with the scooter-change fix.
- `07cd08b` / `codex/model-specific-sym-v2`: model-specific SYM feature at 2.0.0.
- `a43fbc6` / `codex/current-before-sym-model-data`: snapshot before the model-specific SYM work.

The working tree also contains user-owned changes that are not part of this documentation handover:

- `src/navigation/RootNavigator.tsx`
- `src/screens/VehicleSettingsScreen.tsx`
- `src/screens/auth/RegisterScreen.tsx`
- `src/store/useAppStore.ts`
- `src/utils/appLock.test.ts`
- untracked `.qa-ux03/`

Do not stage, discard, reset, or overwrite these changes. `VehicleSettingsScreen.tsx` overlaps the next selector task, so inspect its current diff and integrate with it deliberately. The other source changes appear related to app-lock/navigation work and are outside the model-identification scope.

Before implementing the next feature, create a new branch from 2.0.1, for example:

```text
codex/guided-model-identification-v2.1.0
```

Do not move or rewrite the existing fallback branches. When the feature is complete and verified, make it app version **2.1.0** with Android version code **7**, unless a newer version is already present when work begins.

## 3. Verified runtime state

- Standalone Android 2.0.1 build 6 is installed on the user's Samsung SM-A566B.
- ADB serial at handover time: `RKCY901J8WB`.
- The release APK launches with Metro/USB forwarding disabled.
- The most recent standalone launch had no red “Unable to load script” screen and no AndroidRuntime or ReactNativeJS fatal error.
- The APK is locally signed with the repository's current direct-testing setup. It is suitable for device testing, not a claim of Play Store production signing readiness.
- Install updates with `adb install -r`; do not uninstall or clear application data unless the user explicitly authorizes losing local test data.
- Do not ask for, observe, or enter the user's app-lock PIN.
- The user explicitly asked not to test the online manual feature for now. Do not tap manual links or open external PDFs during this update.

## 4. Current quality state

At commit `d3529c0`, `npm run check` passes:

- catalog generation check;
- model knowledge generation check;
- strict TypeScript;
- Expo lint;
- 99 tests in 16 suites.

The catalog contains 10 manual profiles, 1,605 normalized records, 1,222 specification facts, and 56 preserved conflicts. Expo Doctor previously reported one dependency alignment warning: React Native 0.83.6 while the installed Expo patch expected 0.83.10. Do not mix that unrelated upgrade into this selector feature without explicit user direction.

## 5. Existing catalog and variant coverage

The catalog is generated from validated repository/manual data. Every catalog version maps to one `manual_id`. Current manual profiles and exact variants are:

| Model/manual years | Current exact variants |
| --- | --- |
| CRUISYM ALPHA, 2021-2025 | CRUiSYM alpha 125 (LV12W2-EU); CRUiSYM alpha 300 (LV30W2-EU) |
| Fiddle 4, 2021-Present | XG12W1-EU; XG12WW-EU; XG05W-EU/IT; XG05W1-NL; XG05W2-IT |
| Fiddle III, 2014-2023 | XA05W (50 cc); XA12W (125 cc); XA15W (150 cc); XA20W (200i) |
| JET 14 AI ABS, 2017-2024 | XC12W1-EU; XC12WW-EU; XC20W1-ZA; XC20W-ZAC; XC05W1-EU |
| JET 14 DD, 2017-2024 | XC12W1-EU; XC12WW-EU; combined 200-series codes; combined 50-series codes |
| Joymax Z+, 2021-Present | Joymax Z+125; Joymax Z 250; Joymax Z 300 |
| MAXSYM 500TL, 2020-2021 | No extra variant required by the current manual profile |
| New Symphony ST, 2021-Present | combined 50-series codes; combined 125-series codes; combined 200-series codes; combined 125 water-cooled codes |
| Symphony Classic ST, 2015-2020 | XB05W (50); XB12W1-EU (125); XB20W1-EU (200i) |
| Symphony NEW SR 150, 2010-Present | SR 125 code group; SR 150 AZ15W1-T; SR 150 AZ15W2-6 |

Important: some manuals identify a group of codes rather than one independently sourced code. Do not split a combined group unless the authoritative input contains enough facts and citations to prove separate variants.

The master data already contains useful facts such as displacement, engine type/cooling, and fuel system, but subject names and value shapes vary by manual. Examples include `Displacement`, `displacement`, `engine_type`, `engine`, `Fuel system`, `fuel_system`, and nested `starting_fuel_ignition`. These records retain `modelScope`, pages, values, attributes, conflicts, and missing-data states. The current `ModelVariant` projection exposes only `id` and `name`; it does not yet expose normalized identification features.

## 6. Current selection architecture

### Generated and source data

- `src/generated/scooterCatalog.json`: brand, model, catalog version, `manualId`, local manual path, and online-manual URL.
- `src/generated/modelKnowledgeBase.json`: manual profiles, variants, normalized records, maintenance tasks, conflicts, citations, and model scopes.
- `scripts/generate-scooter-catalog.mjs`: catalog generator/check.
- `scripts/generate-model-knowledge-base.mjs`: knowledge-base generator/check. It projects variant labels from the authoritative master database and scoped specification records.
- `src/modelData/types.ts`: `ModelVariant` currently contains only `{ id, name }`.
- `src/modelData/applicability.ts`: exact-variant applicability matching.
- `src/modelData/modelKnowledge.ts`: manual/profile lookup and applicable facts/maintenance.

The model generator currently reads the authoritative master database from a sibling output path embedded in the script. Inspect that dependency before changing generation, and keep generation deterministic. Do not hand-edit generated JSON as the source of truth.

### Selection and UI

- `src/catalog/scooterCatalog.ts`
  - `ScooterSelection`: `brandId`, `modelId`, `versionId`, optional `variantId`.
  - `resolveScooterSelection`: validates the entire ID chain and returns catalog/manual/variant objects.
  - `isScooterSelectionComplete`: requires a valid exact variant for profiles marked `requiresVariant`.
  - `selectionFromProfile`: reconstructs a selection from persisted stable IDs.
- `src/components/ScooterSelectionFields.tsx`
  - current cascade: Brand -> Model -> Version / Variant -> Exact variant / engine code;
  - selecting an ancestor clears all descendants by replacing the partial selection;
  - exact variants are shown only when the selected manual profile requires one.
- `src/screens/setup/VehicleSetupScreen.tsx`: first setup consumer.
- `src/screens/VehicleSettingsScreen.tsx`: create vehicle and change active vehicle's scooter reference.

### Persistence and change behavior

- `vehicle_profile` stores `scooter_brand_id`, `scooter_model_id`, `scooter_version_id`, and `scooter_variant_id` separately.
- `src/services/database.ts` validates selections again at the persistence boundary.
- `saveInitialVehicleSetup`, `createVehicleProfile`, and `saveVehicleScooterSelection` use stable catalog IDs.
- Changing the scooter reference is transactional and reapplies the applicable maintenance template while preserving service history. Existing tests cover preservation of baselines and user overrides while applicability changes.

The 2.0.1 fix is important: `resolveScooterSelection` must return `variantId: variant?.id ?? null`. Before this fix, the UI validated an exact variant but the resolved object dropped its identity, so the database rejected it with “Select a valid brand, model, version, and required exact variant.” Preserve the fix and its regression tests in `src/catalog/scooterCatalog.test.ts`.

## 7. Recommended data design

Generate one normalized, read-only identification profile attached to each approved variant and exact manual. A suitable conceptual shape is:

```ts
type IdentificationValue<T> = {
  value: T | null;
  status: 'confirmed' | 'conflict' | 'missing';
  sourceRecordIds: string[];
  pages: number[];
};

type VariantIdentificationProfile = {
  manualId: string;
  catalogVersionId: string;
  variantId: string | null;
  modelCode: IdentificationValue<string>;
  displacementCc: IdentificationValue<number>;
  coolingSystem: IdentificationValue<'air' | 'liquid'>;
  fuelSystem: IdentificationValue<'carburetor' | 'fuel_injection'>;
  additionalDistinguishers: Array<{
    key: string;
    label: string;
    value: string;
    sourceRecordIds: string[];
    pages: number[];
  }>;
};
```

Exact naming may change after inspecting the data, but preserve these principles:

1. `manualId`, `catalogVersionId`, and `variantId` are the identity. Display labels are not keys.
2. Every normalized value retains source record IDs and 1-based PDF pages.
3. Unknown stays `null`/`missing`; conflict stays explicit. Do not infer a value from a model name alone.
4. A shared fact may be projected to multiple variants only when its manual scope genuinely applies to all of them.
5. Do not turn local manual paths or online URLs into identification inputs.
6. Prefer a maintainable generated artifact, such as `src/generated/variantIdentification.json`, over duplicated hardcoded maps in components.
7. The generation check must fail on duplicate variant identities, unknown manual/variant references, invalid enums or displacement values, impossible page citations, and accidental cross-manual references.
8. Preserve the authoritative input and existing conflict/missing-data records; normalization is a view, not a rewrite of source evidence.

No database migration should be necessary if the final persisted identity remains the current four stable selection IDs. Do not persist transient answers unless a concrete product need is established.

## 8. Recommended interaction

Use one shared guided selector in first setup, Add Vehicle, and Change Scooter Reference.

Suggested flow:

1. Select brand.
2. Select model family.
3. Select manual years/version when more than one exists.
4. Show only distinguishing questions supported by that manual's candidate variants. Good order:
   - displacement;
   - cooling system;
   - carburetor vs fuel injection;
   - exact engine/model code;
   - one additional sourced discriminator only if ambiguity remains.
5. Filter candidates after every answer and show a visible candidate count/list.
6. When one exact variant remains, show a confirmation card with brand, model, manual years, exact variant/code, and the answered distinguishing features.
7. Persist only after an explicit Apply/Save confirmation.

Interaction rules:

- Keep a draft selection separate from the saved active vehicle.
- Changing any earlier answer must clear incompatible later answers and recompute from the full candidate set.
- Never auto-select a sole candidate in a way the user cannot see; it may be suggested, but confirmation must display its identity.
- Offer “I’m not sure” honestly. Explain where an engine/model code is commonly found, but do not invent a location that is not supported for that manual.
- If answers match zero variants, show that no exact match was found, preserve the user's saved scooter, and allow answers to be changed.
- If multiple variants remain, do not choose one. Ask the next useful discriminator or require the exact code.
- A conflicted or missing feature cannot be used as a silent decisive filter.
- On cancellation, no vehicle or maintenance data changes.
- On switching, update only the intended vehicle. Never use another active or previously selected vehicle's draft.
- The final confirmation should explain that the model reference and maintenance guidance will change while existing service history remains.

Accessibility requirements:

- Use radio/selection semantics and meaningful labels, values, selected/disabled states, and headings.
- Keep touch targets at least 48 dp.
- Announce candidate-count and no-match changes without relying on color alone.
- Distinguish “Air-cooled” and “Liquid-cooled” in text; do not use icons as the only signal.
- Support screen width and text scaling without truncating engine codes or cc labels.

## 9. Required tests

Keep pure identification/filtering logic outside React components so Node tests can cover it deterministically.

At minimum, add tests for:

### Generated-data integrity

- Every identification record belongs to exactly one `manual_id` and either one valid `variant_id` or an explicitly manual-wide profile.
- Every required catalog variant has an identification record, even if some features are honestly missing.
- Invalid displacement, cooling, fuel-system, page, manual, and variant values fail generation.
- A source record from one manual cannot populate another manual or variant.
- Conflicts and missing values are preserved, not converted into confirmed filters.

### Filtering and selection state

- Choosing 125 cc excludes 200/250/300 cc candidates within the same manual.
- Choosing air-cooled excludes liquid-cooled candidates and vice versa when confirmed data supports that distinction.
- Choosing carburetor excludes injection candidates and vice versa when confirmed data supports it.
- Combined answers resolve only to the exact matching variant.
- Changing brand/model/version resets every incompatible answer and variant ID.
- Changing an earlier distinguishing answer clears stale later choices.
- Missing/unknown answers do not falsely eliminate candidates.
- Contradictory answers produce a recoverable no-match state, not a crash or fallback.
- Ambiguous answers never auto-resolve to the wrong variant.

### Persistence and isolation

- The resolved object preserves `variantId` through both UI and database validation.
- First-time setup saves the exact selection.
- Changing an existing vehicle changes only that vehicle.
- Switching active vehicles shows each vehicle's own draft/saved selection and cannot leak another model's variant.
- Applying a change preserves service history and documented user overrides while changing only applicable model guidance.
- Cancelling or failing a change leaves the saved vehicle and maintenance state untouched.
- Existing manual-link identity tests remain passing, but do not physically open a manual on the phone.

Run `npm run check` and a focused Android physical-device smoke test. The smoke should cover selection, cancellation, a successful exact change on disposable/test data, switching vehicles, relaunch, and no fatal logs. Do not destructively alter the user's real active vehicle data merely to prove the path; create disposable test data only with explicit permission, or stop at non-mutating UI checks and rely on deterministic integration tests.

## 10. Files to inspect first

Read these before editing:

1. This handover completely.
2. `package.json`, `app.json`, and `git status`/recent log.
3. `scripts/generate-scooter-catalog.mjs` and `scripts/generate-model-knowledge-base.mjs`.
4. `src/generated/scooterCatalog.json` and targeted portions of `src/generated/modelKnowledgeBase.json`; do not dump the entire large file unnecessarily.
5. `src/modelData/types.ts`, `modelKnowledge.ts`, and `applicability.ts`.
6. `src/catalog/scooterCatalog.ts` and `scooterCatalog.test.ts`.
7. `src/components/ScooterSelectionFields.tsx`.
8. `src/screens/setup/VehicleSetupScreen.tsx` and the selection/create/change portions of `src/screens/VehicleSettingsScreen.tsx`.
9. Selection migrations and `createVehicleProfile`, `saveInitialVehicleSetup`, `saveVehicleScooterSelection`, and maintenance-template application in `src/services/database.ts`.
10. `README.md`, [`PRODUCT_UX_AUDIT.md`](./qa/PRODUCT_UX_AUDIT.md), and `docs/ANDROID_RELEASE_CHECKLIST.md` for product and release boundaries.

## 11. Scope boundaries

- Preserve offline-first local storage and multi-vehicle support.
- Preserve stable ID-based selection, `manual_id` isolation, source provenance, explicit conflicts, and honest missing data.
- Do not use display-name substring matching as identity.
- Do not construct any URL from model names or identification answers.
- Do not add a backend, cloud account, VIN decoder, scanner, or internet lookup without a separate request.
- Do not claim a guessed variant, workshop certification, telemetry, or automatic scooter detection.
- Do not change the approved 1,000 km recurring engine-oil application policy in this task.
- Do not test or redesign the online “View manual” action in this task.
- Preserve the current industrial dark visual system and improve the shared selector incrementally rather than rewriting unrelated screens.
- Do not upgrade Expo/React Native dependencies as part of this feature unless needed and explicitly approved.

## 12. Definition of done

The work is complete only when:

- a rider can distinguish supported exact variants through sourced, understandable features;
- every answer resolves through stable `manual_id`/`variant_id` relationships;
- ambiguity, conflicts, missing data, and no-match states are honest and recoverable;
- setup, add-vehicle, and change-vehicle flows share the same tested selector;
- the active vehicle alone receives the chosen exact variant and matching guidance;
- existing history/data are preserved during an in-place app update;
- generated data checks, TypeScript, lint, and the full test suite pass;
- Android build 7 launches standalone on the connected Samsung without Metro or fatal logs;
- the work is committed on a new version branch, with 2.0.1 and earlier rollback points left intact;
- manual links were not physically tested.
