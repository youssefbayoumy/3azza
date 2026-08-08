import { formatNumber, t } from '../i18n/core';

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
    return t('validation.whole', { label });
  }
  if (value < min) {
    return t('validation.min', { label, min: formatNumber(min) });
  }
  if (max !== undefined && value > max) {
    return t('validation.max', { label, max: formatNumber(max) });
  }
  return null;
}

export function parseWholeNumberInput(
  input: string,
  options: WholeNumberOptions
): NumberValidationResult {
  const normalized = input.trim();
  if (!/^\d+$/.test(normalized)) {
    return { ok: false, message: t('validation.whole', { label: options.label }) };
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
    return { ok: false, message: t('validation.number', { label }) };
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return { ok: false, message: t('validation.number', { label }) };
  }
  if (value < min) {
    return { ok: false, message: t('validation.min', { label, min: formatNumber(min) }) };
  }
  if (max !== undefined && value > max) {
    return { ok: false, message: t('validation.max', { label, max: formatNumber(max) }) };
  }
  return { ok: true, value };
}

export function validateOdometerReading(value: number, minimum: number): string | null {
  return validateWholeNumber(value, {
    label: t('validation.odometerReading'),
    min: minimum,
  });
}

export function validateRecordedOdometer(value: number, confirmedOdometer: number): string | null {
  const domainMessage = validateWholeNumber(value, {
    label: t('validation.recordOdometer'),
    min: 0,
  });
  if (domainMessage) return domainMessage;
  if (value > confirmedOdometer) {
    return t('validation.recordOdometerMax', { max: formatNumber(confirmedOdometer) });
  }
  return null;
}

export function validateInventoryQuantity(value: number): string | null {
  return validateWholeNumber(value, {
    label: t('validation.quantity'),
    min: 0,
  });
}

export function getInventoryStatus(quantity: number): 'In Stock' | 'Low' | 'Out' {
  if (quantity === 0) return 'Out';
  if (quantity === 1) return 'Low';
  return 'In Stock';
}

export function validateVehicleVital(field: VehicleVitalField, value: number): string | null {
  return validateWholeNumber(value, { ...VEHICLE_VITAL_RULES[field], label: vitalLabel(field) });
}

export function parseVehicleVitalInput(
  field: VehicleVitalField,
  input: string
): NumberValidationResult {
  return parseWholeNumberInput(input, { ...VEHICLE_VITAL_RULES[field], label: vitalLabel(field) });
}

function vitalLabel(field: VehicleVitalField): string {
  const labels = {
    oil_life_pct: t('vitals.oilLife'), tire_pressure_psi: t('vitals.tirePressure'), battery_health_pct: t('vitals.batteryHealth'), coolant_temp_c: t('vitals.coolantTemp'), brake_pad_pct: t('validation.brakePadLife'),
  } as const;
  return labels[field];
}
