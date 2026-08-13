# 3azza Agent Guide

This is the canonical 3azza application repository. Before substantial product,
architecture, debugging, or implementation work, read these files completely:

1. `docs/PRODUCT_SCOPE.md`
2. `docs/CURRENT_STATE.md`
3. `docs/architecture/ARCHITECTURE.md`
4. `docs/NEXT_TASK.md`

Treat them as the canonical project-control documents. Historical audits, QA
reports, validation plans, and handoffs are supporting evidence only. When they
conflict with these documents or the current implementation, investigate the
repository rather than assuming historical documentation is still correct.

## Working style

Act as a critical-thinking engineering partner, not a yes-man. Examine proposed
implementations, theories, features, and plans against the product goal and
existing code. Distinguish facts, evidence-backed inferences, assumptions, and
unknowns. Challenge weak reasoning, scope creep, needless rewrites, risky
complexity, and symptom patches; offer a better alternative and its tradeoffs
when one exists. If requirements conflict, identify the conflict rather than
silently choosing.

Do not manufacture disagreement. Once tradeoffs are clear and the user's intent
is explicit, execute autonomously unless it conflicts with repository constraints
or safety requirements. Challenge where useful, then act.

## Repository boundary

The canonical application repository is:

`C:\Users\youss\Desktop\Vibe coding\3azza2\app`

The parent `3azza2` directory is workspace/source material, including manuals,
extraction outputs, and design explorations. Do not treat it as the application
repository or modify its Git structure, gitlink/submodule state, manuals,
extraction outputs, or unrelated files. Read-only parent access is allowed only
when the established generation or validation workflow requires it.

## Product mode and guardrails

3azza is in stabilization and simplification mode. Prioritize correctness,
maintenance trust, reliability, simpler workflows, focused fixes, test coverage,
and release readiness. Avoid feature expansion, broad redesigns, speculative
abstractions, architecture rewrites for elegance, unrelated cleanup, and parallel
systems. Do not continue refactoring merely because more cleanup is possible.

Follow `docs/PRODUCT_SCOPE.md`. The core loop is scooter/odometer setup, due and
upcoming maintenance, recording completed work, trustworthy service history, and
useful reminders. Maintenance correctness and trust outrank feature count.

- Never invent manufacturer intervals; manufacturer-specific claims require
  supported source data.
- Keep unknown information unknown; do not convert it into confident maintenance
  knowledge or assume every motorcycle system applies to an unknown capability.
- Respect vehicle capabilities and use progressive disclosure rather than forcing
  technical configuration before the app is useful.

## Before editing

Before meaningful source changes:

1. Read the relevant canonical control documents and inspect the implementation.
2. Inspect `git status`, identify dirty/untracked work, and preserve unrelated user changes.
3. Identify the real source-of-truth module/data and existing tests.
4. Use the smallest change that correctly solves the task.

Do not reset, discard, overwrite, clean, or delete unrelated user work. Do not
blindly implement a proposed solution without checking that it fits the codebase.

## Architecture, maintenance, and persistence

Follow `docs/architecture/ARCHITECTURE.md`. Do not create parallel implementations
when a source of truth already exists. In particular:

- Preserve `src/services/database.ts` as the public persistence facade unless an
  explicit architecture task changes it.
- Do not duplicate maintenance calculation logic; preserve provenance, stable IDs,
  persisted contracts, and feature/domain ownership.
- Do not casually change database semantics, persisted fields, or IDs. Schema
  changes require an appropriate migration and compatibility plan.
- Keep shared UI primitives in the established shared layer. Avoid a generic
  abstraction with only one speculative consumer.

Maintenance behavior is product-critical. When changing it, identify whether data
is manufacturer-derived, user-configured, or generic; consider history,
edit/delete/recalculation, vehicle/profile scope, and odometer/date interactions;
and add or update focused tests. Never silently reinterpret historical records or
change an interval merely because another value seems reasonable.

Before changing persistence behavior, inspect the schema, persisted contracts,
database facade, relevant transaction modules and migrations, backup/export
implications, and tests. Do not bypass the facade merely for convenience.

## Generated data and localization

Do not manually edit generated output when an established source and generator
exist. Change the actual authored input, run the established generator, and run
the relevant generated-data checks. Do not move parent manuals or extraction data
unless a task explicitly changes their configured paths.

Use the existing localization architecture for user-visible text. Preserve English
and Egyptian Arabic key parity, RTL behavior, locale formatting, and maintenance
localization. Do not introduce hard-coded visible English where resources belong,
or silently translate manufacturer/manual source wording where provenance rules
require the original wording. For Arabic changes, consider RTL, bidi, plural/unit
formatting, and accessibility labels.

## UI, debugging, and task discipline

Do not turn a bug fix into a redesign. Reuse established components and patterns.
For forms and interactive flows, consider busy/duplicate submission state,
validation, keyboard behavior, cancellation, draft loss, accessibility, small
screens, large fonts, and Arabic/RTL.

When debugging: establish evidence where practical, trace data/control flow,
identify the root cause, inspect tests, make the smallest reasonable fix, and add
regression coverage. Do not patch symptoms when a root cause is identifiable.

`docs/NEXT_TASK.md` defines the current priority. Complete its active task first;
do not begin queued work unless a minimal dependency requires it. Keep bounded
work bounded. Report unrelated improvements as deferred recommendations.

## Verification and documentation

Run targeted checks during implementation. Before declaring normal meaningful
implementation work complete, run `npm run check`. Use `npm run release:check`
only for release-readiness work or when explicitly requested. Do not modify
dependencies merely to make an unrelated release check pass. If verification
fails, determine whether the failure is new or pre-existing and fix regressions
caused by the current work.

Update `docs/CURRENT_STATE.md` after actual behavior, capability, risk,
verification, or release-state changes. Update `docs/architecture/ARCHITECTURE.md`
only for architecture/ownership changes; `docs/NEXT_TASK.md` when a task or
priority changes; and `docs/PRODUCT_SCOPE.md` only for intentional product
direction changes. Do not rewrite historical audits, QA evidence, or handoffs to
make them appear current; add a pointer to current control docs instead.

## Git and scope safety

Preserve unrelated user work. Do not use destructive resets, rewrite Git history,
discard unrelated modifications, delete untracked work because it looks temporary,
remove retained QA evidence casually, modify parent Git state, or bundle unrelated
cleanup into a focused task.

If a task appears to require a large architecture/database/navigation rewrite,
broad dependency upgrade, substantial removal of functionality, maintenance
redesign, or fundamental product-behavior change, stop treating it as a small
detail. Explain why, identify smaller alternatives and tradeoffs, then proceed
once the direction is explicit.

## Completion standard

A task is complete only when the requested behavior is correct, product scope and
architecture are respected, relevant tests and verification pass, regressions from
the work are fixed, unrelated work is preserved, and canonical documentation is
updated when needed. Do not claim completion based only on edits.
