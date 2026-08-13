export const VEHICLE_CAPABILITIES_SCHEMA_VERSION = 1;

export const POWERTRAIN_VALUES = ['unknown', 'four_stroke', 'two_stroke', 'electric'] as const;
export const TRANSMISSION_VALUES = ['unknown', 'cvt', 'manual', 'automatic_other'] as const;
export const FINAL_DRIVE_VALUES = ['unknown', 'chain', 'belt', 'shaft', 'integrated'] as const;
export const COOLING_VALUES = ['unknown', 'air', 'liquid'] as const;
export const BRAKE_SYSTEM_VALUES = ['unknown', 'disc', 'drum', 'mixed'] as const;
export const ABS_VALUES = ['unknown', 'yes', 'no'] as const;
export const WHEEL_TYPE_VALUES = ['unknown', 'cast', 'spoke', 'mixed'] as const;

export type PowertrainCapability = typeof POWERTRAIN_VALUES[number];
export type TransmissionCapability = typeof TRANSMISSION_VALUES[number];
export type FinalDriveCapability = typeof FINAL_DRIVE_VALUES[number];
export type CoolingCapability = typeof COOLING_VALUES[number];
export type BrakeSystemCapability = typeof BRAKE_SYSTEM_VALUES[number];
export type AbsCapability = typeof ABS_VALUES[number];
export type WheelTypeCapability = typeof WHEEL_TYPE_VALUES[number];

export type VehicleCapabilities = {
  schemaVersion: typeof VEHICLE_CAPABILITIES_SCHEMA_VERSION;
  powertrain: PowertrainCapability;
  transmission: TransmissionCapability;
  finalDrive: FinalDriveCapability;
  cooling: CoolingCapability;
  brakeSystem: BrakeSystemCapability;
  abs: AbsCapability;
  wheelType: WheelTypeCapability;
};

export type VehicleCapabilityKey = Exclude<keyof VehicleCapabilities, 'schemaVersion'>;

export const UNKNOWN_VEHICLE_CAPABILITIES: VehicleCapabilities = Object.freeze({
  schemaVersion: VEHICLE_CAPABILITIES_SCHEMA_VERSION,
  powertrain: 'unknown',
  transmission: 'unknown',
  finalDrive: 'unknown',
  cooling: 'unknown',
  brakeSystem: 'unknown',
  abs: 'unknown',
  wheelType: 'unknown',
});

export const UNKNOWN_VEHICLE_CAPABILITIES_JSON = JSON.stringify(UNKNOWN_VEHICLE_CAPABILITIES);

const VALUE_SETS = {
  powertrain: new Set<string>(POWERTRAIN_VALUES),
  transmission: new Set<string>(TRANSMISSION_VALUES),
  finalDrive: new Set<string>(FINAL_DRIVE_VALUES),
  cooling: new Set<string>(COOLING_VALUES),
  brakeSystem: new Set<string>(BRAKE_SYSTEM_VALUES),
  abs: new Set<string>(ABS_VALUES),
  wheelType: new Set<string>(WHEEL_TYPE_VALUES),
} satisfies Record<VehicleCapabilityKey, Set<string>>;

export function normalizeVehicleCapabilities(
  value: Partial<VehicleCapabilities> | null | undefined
): VehicleCapabilities {
  const accepted = <K extends VehicleCapabilityKey>(key: K): VehicleCapabilities[K] => {
    const candidate = value?.[key];
    return typeof candidate === 'string' && VALUE_SETS[key].has(candidate)
      ? candidate as VehicleCapabilities[K]
      : UNKNOWN_VEHICLE_CAPABILITIES[key];
  };
  return {
    schemaVersion: VEHICLE_CAPABILITIES_SCHEMA_VERSION,
    powertrain: accepted('powertrain'),
    transmission: accepted('transmission'),
    finalDrive: accepted('finalDrive'),
    cooling: accepted('cooling'),
    brakeSystem: accepted('brakeSystem'),
    abs: accepted('abs'),
    wheelType: accepted('wheelType'),
  };
}

export function parseVehicleCapabilities(value: string | null | undefined): VehicleCapabilities {
  if (!value) return { ...UNKNOWN_VEHICLE_CAPABILITIES };
  try {
    const parsed = JSON.parse(value) as unknown;
    return vehicleCapabilitiesFromUnknown(parsed) ?? { ...UNKNOWN_VEHICLE_CAPABILITIES };
  } catch {
    return { ...UNKNOWN_VEHICLE_CAPABILITIES };
  }
}

export function vehicleCapabilitiesFromUnknown(value: unknown): VehicleCapabilities | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<VehicleCapabilities>;
  if (candidate.schemaVersion !== VEHICLE_CAPABILITIES_SCHEMA_VERSION) return null;
  for (const key of Object.keys(VALUE_SETS) as VehicleCapabilityKey[]) {
    if (typeof candidate[key] !== 'string' || !VALUE_SETS[key].has(candidate[key] as string)) {
      return null;
    }
  }
  return normalizeVehicleCapabilities(candidate);
}

export function serializeVehicleCapabilities(
  value: Partial<VehicleCapabilities> | null | undefined
): string {
  return JSON.stringify(normalizeVehicleCapabilities(value));
}

export function vehicleCapabilitiesAreUnknown(value: VehicleCapabilities): boolean {
  return (Object.keys(VALUE_SETS) as VehicleCapabilityKey[]).every((key) => value[key] === 'unknown');
}
