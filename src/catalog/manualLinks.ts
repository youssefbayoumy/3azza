import type { ResolvedScooterSelection } from './scooterCatalog';

export type OnlineManualReference = {
  manualId: string;
  manualName: string;
  years: string;
  onlineManualUrl: string | null;
};

export type ManualOpenOutcome =
  | 'opened'
  | 'offline'
  | 'unavailable'
  | 'cannot-open'
  | 'selection-changed';

export type ManualLinkDependencies = {
  getNetworkState: () => Promise<{
    isConnected?: boolean | null;
    isInternetReachable?: boolean | null;
  }>;
  canOpenURL: (url: string) => Promise<boolean>;
  openURL: (url: string) => Promise<unknown>;
  isStillActive?: () => boolean;
};

export function formatManualYears(value: string): string {
  return value.replace(/(\d{4})-(Present|\d{4})/gi, '$1–$2');
}

export function getOnlineManualReference(
  selection: ResolvedScooterSelection | null
): OnlineManualReference | null {
  if (!selection || !selection.version.manualId) return null;
  return {
    manualId: selection.version.manualId,
    manualName: `${selection.brand.name} ${selection.model.name} owner manual`,
    years: formatManualYears(selection.version.name),
    onlineManualUrl: selection.version.onlineManualUrl,
  };
}

export function isValidOnlineManualUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && parsed.hostname.length > 0
      && parsed.username.length === 0
      && parsed.password.length === 0;
  } catch {
    return false;
  }
}

export async function openOnlineManual(
  onlineManualUrl: string | null,
  dependencies: ManualLinkDependencies
): Promise<ManualOpenOutcome> {
  if (!isValidOnlineManualUrl(onlineManualUrl)) return 'unavailable';
  const isStillActive = dependencies.isStillActive ?? (() => true);
  if (!isStillActive()) return 'selection-changed';

  try {
    const networkState = await dependencies.getNetworkState();
    if (!isStillActive()) return 'selection-changed';
    if (networkState.isConnected === false || networkState.isInternetReachable === false) {
      return 'offline';
    }
  } catch {
    // An unavailable network-state API is not proof that the device is offline.
    // Linking remains guarded and its failure is reported without navigating.
  }

  try {
    if (!isStillActive()) return 'selection-changed';
    const canOpen = await dependencies.canOpenURL(onlineManualUrl);
    if (!isStillActive()) return 'selection-changed';
    if (!canOpen) return 'cannot-open';
    await dependencies.openURL(onlineManualUrl);
    return 'opened';
  } catch {
    return 'cannot-open';
  }
}
