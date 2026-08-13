# Supported maintenance profiles

Generated status date: 2026-08-01.

Only profiles with an exact catalogue/variant match and status `validated` or
`production_ready` are selectable. A manual being present in the repository is
not sufficient. The selection UI and database write path enforce the same gate.

| Scooter/manual | Exact profile | Status | App behavior |
|---|---|---|---|
| SYM New Symphony ST 2021–Present, `XL20W1-EU/XL20W1-IT` | `sym-new-symphony-st-xl20w1-eu-it` v`2026.08.03-ia1` | `validated` | Selectable; action-specific maintenance enabled, including the exact-profile 1,000 km engine-oil replacement and air-filter inspection schedules |
| SYM CRUISYM ALPHA 2021–2025 | None | unsupported | Hidden from vehicle selection; no maintenance reminders |
| SYM Fiddle 4 2021–Present | None | unsupported | Hidden from vehicle selection; no maintenance reminders |
| SYM Fiddle III 2014–2023 | None | unsupported | Hidden from vehicle selection; no maintenance reminders |
| SYM JET 14 AI ABS 2017–2024 | None | unsupported | Hidden from vehicle selection; no maintenance reminders |
| SYM JET 14 DD 2017–2024 | None | unsupported | Hidden from vehicle selection; no maintenance reminders |
| SYM Joymax Z+ 2021–Present | None | unsupported | Hidden from vehicle selection; no maintenance reminders |
| SYM MAXSYM 500TL 2020–2021 | None | unsupported | Hidden from vehicle selection; no maintenance reminders |
| SYM Symphony Classic ST 2015–2020 | None | unsupported | Hidden from vehicle selection; no maintenance reminders |
| SYM Symphony NEW SR 150 2010–Present | None | unsupported | Hidden from vehicle selection; no maintenance reminders |

## Why the reference profile is not `production_ready`

The manual's recurring engine-oil statements conflict, but the project owner has
authoritatively resolved application behavior for this exact profile to a
1,000 km recurring replacement. The active owner-confirmed override retains both
manual passages internally, creates the 1,000 km countdown, and creates no active
3,000 km oil-replacement path. The oil decision is no longer a release blocker.

The profile remains `validated` because the current APK revision has not yet had
its required connected-device scenario pass; installation and interactive QA are
paused by owner instruction. Promotion requires that fresh device pass followed
by an immutable status/version update. Store release of the app as a whole also
requires protected production signing and resolution or explicit acceptance of
the remaining compatible transitive dependency advisories.
