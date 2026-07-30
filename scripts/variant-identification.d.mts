export type GeneratorCandidate<T> = { value: T | null; sourceRecordIds: string[]; pages: number[] };
export function resolveIdentificationValue<T>(candidates: GeneratorCandidate<T>[]): {
  value: T | null;
  status: 'confirmed' | 'conflict' | 'missing';
  sourceRecordIds: string[];
  pages: number[];
};
export function buildVariantIdentification(profiles: unknown[]): unknown;
export function validateVariantIdentificationArtifact(artifact: unknown, profiles: unknown[]): unknown;
