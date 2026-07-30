export type ExistingMaintenanceInterval = {
  id: number;
  name: string;
  interval_km: number | null;
  canonical_task_id?: string | null;
  user_interval_km?: number | null;
  user_override_active?: number;
  last_service_odometer_km: number;
  has_known_odometer_baseline: number;
};

export type MaintenancePlanTemplate = {
  canonicalId: string;
  name: string;
  intervalKm: number | null;
  origin: 'manual' | '3azza_policy';
};

export type MaintenanceReconciliation = {
  matched: {
    existingId: number;
    template: MaintenancePlanTemplate;
    effectiveIntervalKm: number | null;
    userIntervalKm: number | null;
    hasUserOverride: boolean;
    origin: 'manual' | '3azza_policy' | 'user_override';
  }[];
  added: MaintenancePlanTemplate[];
  inactiveIds: number[];
};

const normalizedName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

function legacyCanonicalTaskId(name: string): string | null {
  const normalized = normalizedName(name);
  const aliases: Record<string, string> = {
    oilchange: 'engine-oil',
    engineoil: 'engine-oil',
    gearboxoilchange: 'transmission-oil',
    transmissionoil: 'transmission-oil',
    airfilter: 'air-filter',
    brakepads: 'brake-pads',
    cvtpullrollers: 'drive-belt',
    drivebelt: 'drive-belt',
  };
  return aliases[normalized] ?? null;
}

export function reconcileMaintenancePlan(
  existing: ExistingMaintenanceInterval[],
  templates: MaintenancePlanTemplate[]
): MaintenanceReconciliation {
  const matchedIds = new Set<number>();
  const matched: MaintenanceReconciliation['matched'] = [];
  const added: MaintenancePlanTemplate[] = [];

  for (const template of templates) {
    const current = existing.find((candidate) =>
      candidate.canonical_task_id === template.canonicalId
      || (!candidate.canonical_task_id && (
        normalizedName(candidate.name) === normalizedName(template.name)
        || legacyCanonicalTaskId(candidate.name) === template.canonicalId
      ))
    );
    if (!current) {
      added.push(template);
      continue;
    }

    matchedIds.add(current.id);
    // Legacy interval provenance was not stored. Conservatively preserve its
    // effective value as a user choice instead of silently overwriting it.
    const isLegacy = !current.canonical_task_id;
    const hasUserOverride = current.user_override_active === 1 || isLegacy;
    const legacyUserInterval = isLegacy ? current.interval_km : null;
    const userIntervalKm = hasUserOverride ? (current.user_interval_km ?? legacyUserInterval) : null;
    matched.push({
      existingId: current.id,
      template,
      effectiveIntervalKm: hasUserOverride ? userIntervalKm : template.intervalKm,
      userIntervalKm,
      hasUserOverride,
      origin: hasUserOverride ? 'user_override' : template.origin,
    });
  }

  return {
    matched,
    added,
    inactiveIds: existing.filter((item) => !matchedIds.has(item.id)).map((item) => item.id),
  };
}
