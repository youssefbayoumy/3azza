/**
 * Single source of truth for how each canonical maintenance task is labelled
 * across the app.
 *
 * The `name` stored on a service interval is the raw, per-manual subject line
 * ("Drive Belt/Roller" on one manual, "Drive Belt, Roller, Drive Pulley" on
 * another) or a legacy seed name ("CVT & Pull Rollers", "Oil Change"). Rendering
 * that raw value directly made the same task read differently between the Home
 * priorities and the Maintenance planner. Screens must resolve the label through
 * `getCanonicalTaskLabel` so one task shows one label everywhere.
 *
 * Storage keys (interval `name`, service-log `title`) are intentionally left
 * untouched — this is a display concern only.
 */

const CANONICAL_TASK_LABELS: Record<string, string> = {
  'engine-oil': 'Engine oil',
  'engine-oil-level': 'Engine oil level',
  'transmission-oil': 'Transmission oil',
  'air-filter': 'Air filter',
  'brake-pads': 'Brake pads',
  'brake-fluid': 'Brake fluid',
  'drive-belt': 'Drive belt & rollers',
  'spark-plug': 'Spark plug',
  coolant: 'Coolant',
  'tire-pressure': 'Tire pressure',
  battery: 'Battery',
  'fuel-pump-filter': 'Fuel-pump filter',
};

/**
 * Resolve the canonical display label for a maintenance task. Falls back to the
 * raw stored name when the task has no canonical id (e.g. an unreconciled legacy
 * row) or is not one of the curated canonical tasks.
 */
export function getCanonicalTaskLabel(
  canonicalId?: string | null,
  fallbackName?: string | null,
): string {
  if (canonicalId && CANONICAL_TASK_LABELS[canonicalId]) {
    return CANONICAL_TASK_LABELS[canonicalId];
  }
  return (fallbackName ?? '').trim() || 'Maintenance task';
}
