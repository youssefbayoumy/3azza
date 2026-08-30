export type MaintenanceRecordPresentationInitialValue = {
  title?: string;
  cost?: number | null;
  notes?: string;
  serviceProvider?: string;
  oilBrand?: string;
  oilType?: string | null;
  oilViscosity?: string;
  mechanicRecommendation?: string;
};

type ActionOption = { label: string };

export function generatedRecordTitle(actions: readonly ActionOption[]): string {
  if (actions.length === 1) return actions[0].label;
  return actions.map((action) => action.label).join(' · ');
}

export function hasSavedAdditionalDetails(
  initialValue: MaintenanceRecordPresentationInitialValue | undefined,
  actions: readonly ActionOption[]
): boolean {
  if (!initialValue) return false;
  const generatedTitle = generatedRecordTitle(actions);
  return Boolean(
    (initialValue.title?.trim() && initialValue.title.trim() !== generatedTitle)
    || initialValue.cost !== null && initialValue.cost !== undefined
    || initialValue.notes?.trim()
    || initialValue.serviceProvider?.trim()
    || initialValue.oilBrand?.trim()
    || initialValue.oilType
    || initialValue.oilViscosity?.trim()
    || initialValue.mechanicRecommendation?.trim()
  );
}

export function shouldShowActionSelector(
  actionsLocked: boolean,
  actions: readonly ActionOption[]
): boolean {
  return !actionsLocked && actions.length > 0;
}
