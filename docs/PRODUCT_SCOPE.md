# Product scope

3azza is an offline-first scooter maintenance companion. Its core loop is:

1. Set up a scooter, its odometer, and whether it was bought new or used.
2. Tell the owner what maintenance is due or upcoming.
3. Let the owner record completed maintenance.
4. Maintain trustworthy service history.
5. Provide useful maintenance reminders.

It is a local record-keeping tool, not a connected-vehicle system, workshop authority, or cloud service.

## Priorities

### P0 — Trust and correctness

- Vehicle identity and odometer integrity.
- Maintenance schedule calculations and history.
- Maintenance recording, edit/delete, and recalculation correctness.
- Durable, vehicle-scoped persistence.
- Maintenance provenance: never invent manufacturer intervals or present an unsupported value as one.

### P1 — Core experience

- Home maintenance status and the Maintenance screen.
- Service recording and history.
- Vehicle setup and basic reminders.
- Useful English and Egyptian Arabic workflows.
- Core accessibility.

### P2 — Secondary functionality

Documents, Parts/Inventory, Fuel, Insights, manual readings, Pre-ride Check,
reference/manual tooling, advanced reminder customization, and advanced backup
UX may remain available, but they do not drive current development.

Feature expansion is frozen unless it directly strengthens the core maintenance
loop.

## Product principles

- Maintenance truth matters more than feature count.
- Never invent manufacturer intervals.
- Be capability-aware: show only behavior that the selected vehicle/profile can support.
- Unknown remains unknown; it must not silently mean that every motorcycle system applies.
- A recurring distance deadline requires an exact action record: `next due = last completed odometer + effective interval`. Without that anchor, show unknown history and no countdown.
- A scooter bought new may enter an isolated break-in/first-service lifecycle. A scooter bought used enters the normal lifecycle immediately; high odometer values do not imply missed lifetime maintenance.
- Existing or restored ownership data that cannot be classified safely remains `unknown` and behaves like used ownership for maintenance baselines.
- Use progressive disclosure: present the next useful owner action before advanced detail.
- Optimize for a solo-maintained product: clear seams and small changes beat broad frameworks.
- Prefer removing complexity to adding abstractions.

This document defines direction, not a backlog. See `NEXT_TASK.md` for the
deliberately small implementation queue.
