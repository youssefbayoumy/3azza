# New Symphony ST 200 Maintenance Analysis

Date: 2026-08-01  
Reference profile: `sym-new-symphony-st-xl20w1-eu-it`  
Machine-readable source: `maintenance-data/new-symphony-st-200.profile.json`

## Exact scope

- Manual: `SYM_New_Symphony_ST_2021-Present_EN_Owners_Manual.pdf`.
- PDF length: 30 pages.
- Exact model codes: `XL20W1-EU` and `XL20W1-IT`, listed on PDF pages 1 and 29.
- Market scope: EU and Italy.
- Manual-file year scope: 2021-present. The visible PDF pages do not print a publication/revision year, so the year range comes from repository filename metadata.
- App display name: New Symphony ST 200.
- Engine: XL20W1 family, single-cylinder four-stroke. The manual groups some instructions under “125CC 200CC” and uses the XL20 code, but does not print exact cubic-centimetre displacement; the profile therefore does not invent a displacement number.
- Cooling: treated as air-cooled with `interpreted` confidence. PDF pages 24-25 explicitly scope the radiator/coolant system only to `XL12WW-EU/XL12WW-IT`, not XL20W1. Cooling-system and coolant rules are retained as `applicable: false` evidence and cannot generate tasks.
- Air cleaner: paper type for XL20W1 (PDF page 29), so the 6,000 km/6-month paper-element replacement applies and the 12,000 km/1-year sponge rule does not.

The manual contains a real recurring engine-oil conflict, but the project owner has supplied a final product decision for this exact profile: recurring engine-oil replacement defaults to 1,000 km. The profile records that rule as an `owner_confirmed` project-owner override, retains both conflicting manual passages internally, and does not describe the override as an unambiguous manual rule. The override is scoped only to XL20W1-EU/XL20W1-IT and is never inherited by another model.

All 300 km rows remain one-time rules. For production scheduling they are actionable through 1,000 km inclusive and become `historical_unverified` at 1,001 km and above unless an exact record exists. This retirement is a documented product behavior, not a fabricated completion.

## Table interpretation

PDF page 26 defines `I` as inspection, cleaning, and adjustment; `R` as replacement; `C` as cleaning with replacement if necessary; and `L` as lubrication. Each scheduled action is represented separately:

- `I` becomes an `inspect` reminder with cleaning/adjustment retained in instructions. Because the symbol combines actions, these rules use `interpreted` confidence.
- `R` becomes `replace`.
- `C` becomes a scheduled `clean` rule plus a separate condition-based `replace` rule.
- `I/L` becomes separate `inspect` and `lubricate` rules.
- The 300 km/NEW column becomes one-time rules only.
- Recurring columns pair distance and time: 1,000 km/1 month, 3,000 km/3 months, 6,000 km/6 months, and 12,000 km/1 year, whichever comes first.
- Text-specific rules such as 10,000 km fuel-pump-filter replacement and 5,000 km/5-month transmission-oil replacement retain exactly the printed values.

## Extracted rules

All page references are one-based PDF pages in the named manual. The three disabled rules (sponge air filter, cooling-system inspection, and coolant replacement) are explicitly non-applicable and cannot generate tasks.

| Component | Action | Initial service | Recurring interval | Replacement trigger | Source | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| Air cleaner element | Inspect | 300 km once | - | - | PDF p. 26, row 1, 300 km `I`; paper type p. 29 | interpreted |
| Air cleaner element | Clean | - | 1,000 km / 1 month | Replace if necessary | PDF p. 26, row 1, `C` | explicit |
| Air cleaner element | Replace | - | Condition-based | Cleaning finds replacement necessary | PDF p. 26, row 1 `C` legend | explicit |
| Air cleaner element (paper) | Replace | - | 6,000 km / 6 months | Fixed | PDF p. 26, row 1 `R(paper)`; paper type p. 29 | explicit |
| Air cleaner element (sponge; not applicable) | Replace | - | 12,000 km / 12 months | Fixed | PDF p. 26, row 1 `R(sponge)`; paper type p. 29 | explicit |
| Air cleaner system | Inspect | 300 km once | - | - | PDF p. 26, row 2 | interpreted |
| Oil filter screen | Clean | 300 km once | - | Replace if necessary | PDF p. 26, row 3 `C` | explicit |
| Oil filter screen | Clean | - | 6,000 km / 6 months | Replace if necessary | PDF p. 26, row 3 `C` | explicit |
| Oil filter screen | Replace | - | Condition-based | Cleaning finds replacement necessary | PDF p. 26, row 3 `C` legend | explicit |
| Engine oil | Replace | 300 km once | - | Fixed initial | PDF p. 15 oil-change section; PDF p. 26, row 4 | explicit |
| Engine oil level | Condition check | - | 500 km | Add oil if inadequate | PDF p. 15 oil-change section | explicit |
| Engine oil | Inspect | - | 1,000 km / 1 month | - | PDF p. 26, row 4 | interpreted |
| Engine oil | Replace | - | 1,000 km | Exact-profile project-owner override resolving page 15/page 26 conflict; both passages retained internally | Owner decision plus PDF pp. 15 and 26 | owner_confirmed |
| Fuel pump filter | Replace | - | 10,000 km | Fixed | PDF p. 26, row 5 | explicit |
| Tires and pressure | Inspect | 300 km once | - | - | PDF p. 26, row 6 | interpreted |
| Tires and pressure | Inspect | - | 1,000 km / 1 month | Inspect condition | PDF p. 26, row 6; procedure p. 19 | interpreted |
| Tires | Replace | - | Condition-based | Wear bar showing or unsafe damage | PDF p. 19 tire inspection | explicit |
| Battery | Inspect | 300 km once | - | - | PDF p. 26, row 7 | interpreted |
| Battery | Inspect | - | 1,000 km / 1 month | - | PDF p. 26, row 7; maintenance-free guidance p. 18 | interpreted |
| Battery terminals | Clean | - | Condition-based | Dirt or corrosion | PDF p. 18 battery-terminal section | explicit |
| Battery | Replace | - | Condition-based | Battery needs replacement | PDF p. 18 battery section | explicit |
| Spark plug | Inspect | 300 km once | - | - | PDF p. 26, row 8 | interpreted |
| Spark plug | Inspect | - | 3,000 km / 3 months | Clean/adjust gap as necessary | PDF p. 26, row 8; procedure p. 21 | interpreted |
| Spark plug | Replace | - | 12,000 km / 12 months | Fixed | PDF p. 26, row 8 | explicit |
| Carburetor idle speed | Inspect | 300 km once | - | - | PDF p. 26, row 9 | interpreted |
| Carburetor idle speed | Inspect | - | 6,000 km / 6 months | Adjust as necessary | PDF p. 26, row 9 | interpreted |
| Steering bearing and handles | Inspect | 300 km once | - | - | PDF p. 26, row 10 | interpreted |
| Steering bearing and handles | Inspect | - | 3,000 km / 3 months | Adjust as necessary | PDF p. 26, row 10 | interpreted |
| Transmission leakage | Inspect | 300 km once | - | - | PDF p. 26, row 11 | interpreted |
| Transmission leakage | Inspect | - | 1,000 km / 1 month | - | PDF p. 26, row 11 | interpreted |
| Crankcase leakage | Inspect | 300 km once | - | - | PDF p. 26, row 12 | interpreted |
| Crankcase leakage | Inspect | - | 1,000 km / 1 month | - | PDF p. 26, row 12 | interpreted |
| Transmission oil | Replace | 300 km once | - | Fixed initial | PDF p. 26, row 13 | explicit |
| Transmission oil | Replace | - | 5,000 km / 5 months | Fixed | PDF p. 26, row 13 | explicit |
| Drive belt and rollers | Inspect | - | 6,000 km / 6 months | - | PDF p. 26, row 14 | interpreted |
| Drive belt and rollers | Replace | - | 12,000 km / 12 months | Fixed | PDF p. 26, row 14 | explicit |
| Fuel tank switch and lines | Inspect | 300 km once | - | - | PDF p. 26, row 15 | interpreted |
| Fuel tank switch and lines | Inspect | - | 3,000 km / 3 months | - | PDF p. 26, row 15 | interpreted |
| Throttle operation and cable | Inspect | 300 km once | - | - | PDF p. 26, row 16 | interpreted |
| Throttle operation and cable | Inspect | - | 1,000 km / 1 month | Adjust if needed | PDF p. 26, row 16; procedure p. 17 | interpreted |
| Engine bolts and nuts | Inspect | 300 km once | - | Tighten/adjust if needed | PDF p. 26, row 17 | interpreted |
| Engine bolts and nuts | Inspect | - | 3,000 km / 3 months | Tighten/adjust if needed | PDF p. 26, row 17 | interpreted |
| Cylinder head, cylinder, piston | Inspect | - | 6,000 km / 6 months | - | PDF p. 26, row 19 | interpreted |
| Exhaust system/carbon | Inspect | - | 6,000 km / 6 months | Clean/adjust if needed | PDF p. 26, row 20 | interpreted |
| Cam chain/ignition timing | Inspect | 300 km once | - | Adjust if needed | PDF p. 26, row 21 | interpreted |
| Cam chain/ignition timing | Inspect | - | 3,000 km / 3 months | Adjust if needed | PDF p. 26, row 21 | interpreted |
| Valve clearance | Inspect | 300 km once | - | Adjust if needed | PDF p. 26, row 22 | interpreted |
| Valve clearance | Inspect | - | 6,000 km / 6 months | Adjust if needed | PDF p. 26, row 22 | interpreted |
| Shock absorbers | Inspect | 300 km once | - | - | PDF p. 26, row 23 | interpreted |
| Shock absorbers | Inspect | - | 6,000 km / 6 months | - | PDF p. 26, row 23 | interpreted |
| Front/rear suspension | Inspect | 300 km once | - | - | PDF p. 26, row 24 | interpreted |
| Front/rear suspension | Inspect | - | 6,000 km / 6 months | - | PDF p. 26, row 24 | interpreted |
| Main/side stands | Inspect | 300 km once | - | - | PDF p. 26, row 25 | interpreted |
| Main/side stands | Inspect | - | 6,000 km / 6 months | - | PDF p. 26, row 25 `I/L` | interpreted |
| Main/side stands | Lubricate | - | 6,000 km / 6 months | Fixed | PDF p. 26, row 25 `I/L` | explicit |
| PCV system | Inspect | 300 km once | - | - | PDF p. 26, row 26 | interpreted |
| PCV system | Inspect | - | 3,000 km / 3 months | - | PDF p. 26, row 26 | interpreted |
| Clutch disk | Inspect | - | 6,000 km / 6 months | - | PDF p. 26, row 27 | interpreted |
| Brake lining/pads | Inspect | 300 km once | - | Condition finding | PDF p. 26, row 28 | interpreted |
| Brake lining/pads | Inspect | - | 1,000 km / 1 month | Condition finding | PDF p. 26, row 28; wear rule p. 16 | interpreted |
| Brake lining/pads | Replace | - | Condition-based | Wear limit reaches brake disc | PDF p. 16 disc-brake inspection | explicit |
| Brake fluid | Inspect | - | No fixed interval | Below `LOWER` mark | PDF p. 16 brake-fluid reservoir check | explicit |
| Component bolts/nuts | Inspect | 300 km once | - | Tighten/adjust if needed | PDF p. 26, row 29 | interpreted |
| Component bolts/nuts | Inspect | - | 1,000 km / 1 month | Tighten/adjust if needed | PDF p. 26, row 29 | interpreted |
| Cooling system (not applicable) | Inspect | - | No fixed interval | Leakage | PDF p. 24, scoped only to XL12WW-EU/IT | explicit |
| Coolant (not applicable) | Replace | - | 12 months | Fixed | PDF p. 25; XL12WW-only scope begins p. 24 | explicit |

## Important ambiguities and limits

### Recurring engine-oil replacement

The underlying source conflict is real:

- PDF page 15: first change at 300 km, then every 1,000 km; the anti-emulsification note says 3 months or 1,000 km.
- PDF page 26: first replacement at 300 km, inspection every 1,000 km/1 month, replacement every 3,000 km/3 months.

The product owner resolves the application behavior to a 1,000 km recurring-distance replacement for this exact supported profile. Internally the rule uses a `project_owner_override` source and `owner_confirmed` confidence, with both manual passages retained as supporting evidence. It is not a generic SYM rule, does not create a 3,000 km active path, and does not change the separate 500 km level check or 1,000 km inspection histories.

### `I` combines actions

The table does not specify whether cleaning or adjustment is required at every `I` mark or only as a result of inspection. Reminders therefore use “inspect”; cleaning and adjustment are retained as procedure guidance. These rules are `interpreted`, not `explicit`.

### Exact displacement and publication years

The manual identifies XL20W1-EU/IT but not exact cubic-centimetre displacement. “200” is the application/manual-family label, not an invented cc value. The 2021-present range comes from the manual filename, not printed pages.

### Carburetor row

The periodic table includes “Carburetor (idle speed)” without a model-specific remark, while the specification page does not identify the fuel-delivery system. The rule is retained because the table does not scope it away, but the exact fuel-system identity remains missing from the manual.

### Severe use

The manual says to service the air cleaner more often in dust/heavy pollution and to perform maintenance more often for frequent high-speed use or high accumulated mileage. It gives no numeric severe-use interval, so none is invented.

## Safety conclusions

- No active rule recurs every 300 km.
- Every 300 km rule is `one_time_initial`.
- Inspection and replacement have different rule IDs and histories.
- Brake-pad and tire replacement are condition-based, not kilometre-based.
- Coolant/cooling tasks are explicitly disabled for XL20W1-EU/IT.
- The paper air-cleaner rule is enabled and the sponge rule disabled.
- Recurring engine-oil replacement defaults to exactly 1,000 km through an exact-profile owner-confirmed override; no active rule uses 3,000 km.
- The scheduler/history/UX implementation and automated gates are complete for
  this revision; `production_ready` promotion remains withheld until the owner
  resumes and the build passes the connected-device scenario gate.
