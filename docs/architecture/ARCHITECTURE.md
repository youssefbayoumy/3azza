# Architecture map

## Repository boundary

`C:\Users\youss\Desktop\Vibe coding\3azza2\app` is the canonical 3azza application repository. Its parent workspace holds owner manuals and extraction outputs consumed by generation scripts; do not move or rename those inputs as part of application work.

## Repository map

- `App.tsx` and `src/navigation/` own startup, app-lock gates, and route composition.
- `src/screens/` owns product screens. It intentionally remains route-oriented rather than using a second application-wide feature tree.
- `src/components/ui/` contains shared UI primitives. `src/components/maintenance/` and `src/components/vehicle/` contain feature-owned flows; `ActiveVehicleChip` and `ProtectedModal` remain shared.
- `src/services/database.ts` is the public SQLite persistence facade. Keep callers on this seam. `src/services/maintenance/` contains its maintenance-specific transactions, queries, plans, migrations, and colocated tests.
- `src/catalog/` resolves catalog selection; `src/modelData/` serves normalized manual knowledge; `src/maintenance/lifecycle.ts` is the single vehicle-plan entry point over maintenance rules, exact records, preferences, lifecycle, and first service. `scheduler.ts` performs the pure per-rule projection.
- `maintenance-data/` contains authored maintenance policy. `src/generated/` contains generated runtime data and must not be hand-edited.
- `src/i18n/` composes English and Egyptian Arabic resources and exposes locale-aware formatting/translation. `src/store/useAppStore.ts` holds session and persisted preferences.
- `docs/` holds architecture, maintenance material, QA reports/evidence, and historical handoffs. Disposable local output belongs in ignored `tmp/`, `artifacts/`, or `qa-artifacts/`.

## Data and generation

Vehicle catalog generation reads the parent workspace's `* Manuals` directories and writes `src/generated/scooterCatalog.json`. Model-knowledge generation reads the parent workspace's extraction database plus the generated catalog and writes `modelKnowledgeBase.json` and `variantIdentification.json`. Run `npm run generate` or the corresponding `*:check` scripts from this repository; preserve the external input layout unless the generator contract is intentionally changed.

## Important seams and safe-change rules

- Do not split, bypass, or rename the public `src/services/database.ts` API without a dedicated persistence change.
- Change database schema or persisted fields only through an explicit, idempotent, tested migration. Never infer uncertain owner facts during migration.
- Keep generic helpers in `src/utils/`; backup archive validation lives in `src/services/backupFormat.ts` because it is persistence/export behavior.
- Keep navigation as the only route-composition owner. Screens may consume the existing public services and domains directly.
- Keep component moves limited to unambiguous ownership; do not create a parallel global `features/` hierarchy.

## Known debt

`database.ts` is intentionally a large facade and coordinates persistence with catalog and maintenance defaults. The catalog/model/maintenance relationship is cross-domain by design. Any attempt to split those seams is a separate behavior-risking project, not routine cleanup.

The `service_intervals` table remains in schema v21 only for legacy backup/restore compatibility. No runtime screen, insight, or notification calculation reads or mutates it. New calculations use exact `service_logs` events, `maintenance_history_states`, and `maintenance_preferences` through `projectVehicleMaintenance`.

Vehicle lifecycle persistence is deliberately small: `purchase_condition` is `new`, `used`, or `unknown`, and `maintenance_started_at` supplies a time baseline only for explicitly new scooters. Migration defaults both existing ownership and old backups to unknown/null without rewriting maintenance records or custom intervals.

## Verification

Run from the application root:

```bash
npm run catalog:check
npm run model-data:check
npm run maintenance:validate
npm run typecheck
npm run lint
npm test
```
