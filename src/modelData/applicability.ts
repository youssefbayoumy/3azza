import type { KnowledgeRecord, ModelVariant } from './types';

export function normalizeApplicabilityLabel(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[()]/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

export function scopeMatchesVariant(scope: string, variantName: string): boolean {
  const normalizedScope = normalizeApplicabilityLabel(scope);
  const normalizedVariant = normalizeApplicabilityLabel(variantName);
  if (!normalizedScope || !normalizedVariant) return false;
  if (normalizedScope === normalizedVariant) return true;
  return normalizedScope.includes(normalizedVariant) || normalizedVariant.includes(normalizedScope);
}

export function keyMatchesVariant(key: string, variant: ModelVariant): boolean {
  return scopeMatchesVariant(key, variant.name);
}

export function recordAppliesToVariant(record: KnowledgeRecord, variant: ModelVariant | null): boolean {
  if (record.modelScope.length === 0) return true;
  if (!variant) return false;
  return record.modelScope.some((scope) => scopeMatchesVariant(scope, variant.name));
}

export function recordIsVariantSpecific(record: KnowledgeRecord): boolean {
  return record.modelScope.length > 0;
}
