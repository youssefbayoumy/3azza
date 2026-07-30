export type NumberValidationResult =
  | { ok: true; value: number }
  | { ok: false; message: string };

type WholeNumberOptions = {
  label: string;
  min?: number;
  max?: number;
};

type DecimalNumberOptions = {
  label: string;
  min?: number;
  max?: number;
};

export const VEHICLE_VITAL_RULES = {
  oil_life_pct: { label: 'Oil life', min: 0, max: 100 },
  tire_pressure_psi: { label: 'Tire pressure', min: 0 },
  battery_health_pct: { label: 'Battery health', min: 0, max: 100 },
  coolant_temp_c: { label: 'Coolant temperature', min: 0 },
  brake_pad_pct: { label: 'Brake pad life', min: 0, max: 100 },
} as const;

export type VehicleVitalField = keyof typeof VEHICLE_VITAL_RULES;

export function validateWholeNumber(
  value: number,
  { label, min = 0, max }: WholeNumberOptions
): string | null {
  if (!Number.isSafeInteger(value)) {
    return `${label} must be a whole number.`;
  }
  if (value < min) {
    return `${label} cannot be less than ${min.toLocaleString()}.`;
  }
  if (max !== undefined && value > max) {
    return `${label} cannot be more than ${max.toLocaleString()}.`;
  }
  return null;
}

export function parseWholeNumberInput(
  input: string,
  options: WholeNumberOptions
): NumberValidationResult {
  const normalized = input.trim();
  if (!/^\d+$/.test(normalized)) {
    return { ok: false, message: `${options.label} must be a whole number.` };
  }

  const value = Number(normalized);
  const message = validateWholeNumber(value, options);
  return message ? { ok: false, message } : { ok: true, value };
}

/** Parses a complete decimal literal without accepting blank input, exponents, or unit suffixes. */
export function parseDecimalNumberInput(
  input: string,
  { label, min = 0, max }: DecimalNumberOptions
): NumberValidationResult {
  const normalized = input.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    return { ok: false, message: `${label} must be a number.` };
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return { ok: false, message: `${label} must be a number.` };
  }
  if (value < min) {
    return { ok: false, message: `${label} cannot be less than ${min.toLocaleString()}.` };
  }
  if (max !== undefined && value > max) {
    return { ok: false, message: `${label} cannot be more than ${max.toLocaleString()}.` };
  }
  return { ok: true, value };
}

export function validateOdometerReading(value: number, minimum: number): string | null {
  return validateWholeNumber(value, {
    label: 'Odometer reading',
    min: minimum,
  });
}

export function validateRecordedOdometer(value: number, confirmedOdometer: number): string | null {
  const domainMessage = validateWholeNumber(value, {
    label: 'Record odometer',
    min: 0,
  });
  if (domainMessage) return domainMessage;
  if (value > confirmedOdometer) {
    return `Record odometer cannot exceed the confirmed vehicle odometer of ${confirmedOdometer.toLocaleString()} km. Update the vehicle odometer first.`;
  }
  return null;
}

export function validateInventoryQuantity(value: number): string | null {
  return validateWholeNumber(value, {
    label: 'Quantity',
    min: 0,
  });
}

export function getInventoryStatus(quantity: number): 'In Stock' | 'Low' | 'Out' {
  if (quantity === 0) return 'Out';
  if (quantity === 1) return 'Low';
  return 'In Stock';
}

export function validateVehicleVital(field: VehicleVitalField, value: number): string | null {
  return validateWholeNumber(value, VEHICLE_VITAL_RULES[field]);
}

export function parseVehicleVitalInput(
  field: VehicleVitalField,
  input: string
): NumberValidationResult {
  return parseWholeNumberInput(input, VEHICLE_VITAL_RULES[field]);
}
