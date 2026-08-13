# Odometer correction model

`vehicle_profile.current_mileage` remains the canonical lifetime/effective distance used by maintenance scheduling. Ordinary odometer entry and `saveVehicleProfile(...)` remain forward-only; neither can silently lower the reading.

## Odometer contract introduced in v16 (current schema v17)

Schema v16 keeps vehicle-scoped `odometer_events` with these event types:

- `confirmed_reading`
- `correction`
- `instrument_cluster_replacement`

Each event stores previous/new effective mileage, optional previous/new displayed cluster mileage, a required reason, and a timestamp. For the current correction flow, displayed and effective values are identical. The separate fields are retained so a future cluster replacement can reset the physical display without resetting the scooter's lifetime distance.

Downward correction uses a short-lived row in `odometer_correction_authorizations`. Inside one write transaction:

1. The current active-vehicle reading and durable correction floor are read.
2. A narrowly scoped authorization is inserted for the exact vehicle, old value, and new value.
3. A compare-and-set update changes `current_mileage` and `last_odometer_update_timestamp`.
4. The database trigger inserts one `correction` audit event and consumes the authorization.

The rollback trigger still rejects negative mileage, any value below durable evidence, and every ordinary downward update without an exact authorization. A failed transaction restores the mileage and removes both the audit and authorization changes.

The durable correction floor excludes `vehicle_profile.current_mileage` and is the maximum of:

- Service-log mileage explicitly marked as an odometer baseline
- Fuel-log odometer readings
- Preserved service-interval mileage explicitly marked as a known baseline

Historical service, fuel, and interval records are never rewritten or deleted by a correction.

## Public database API

```ts
getOdometerCorrectionFloor(): Promise<number>

correctOdometerReading({
  correctedMileageKm,
  reason,
}: {
  correctedMileageKm: number;
  reason: string;
}): Promise<OdometerEvent>

getOdometerEvents(): Promise<OdometerEvent[]>
```

`correctOdometerReading` accepts only a non-negative whole number strictly below the current reading, requires a non-empty reason, and rejects a value below the durable floor. Increasing or confirming an odometer continues through the normal save path.

## Current Dashboard flow

The Dashboard exposes correction separately from ordinary odometer entry. It loads the durable floor before enabling a safe correction, validates the whole-number value and reason, displays the lowest value allowed by saved records, requires a final confirmation, then reloads the vehicle and reconciles maintenance notifications after success. If the floor cannot be loaded, the dialog fails closed.

## Deferred instrument-cluster work

The event schema is prepared for `instrument_cluster_replacement`, but no cluster-replacement mutation or UI is implemented. That future flow must keep lifetime/effective mileage monotonic while recording the old and new physical display values; it must not reuse downward correction semantics.
