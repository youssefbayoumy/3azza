export type AppLockEntryMode = 'create-pin' | 'unlock';
export type BiometricUnlockOutcome =
  | 'success'
  | 'cancelled'
  | 'failed'
  | 'locked'
  | 'unavailable'
  | 'error';

export type AppVisibilityState = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

export function getAppLockEntryMode(hasRegisteredPin: boolean): AppLockEntryMode {
  return hasRegisteredPin ? 'unlock' : 'create-pin';
}

export function normalizePinInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 4);
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function canAccessProtectedContent(
  appLockEnabled: boolean,
  isAuthenticated: boolean
): boolean {
  return !appLockEnabled || isAuthenticated;
}

export function classifyBiometricResult(
  success: boolean,
  error?: string
): BiometricUnlockOutcome {
  if (success) return 'success';
  if (['user_cancel', 'app_cancel', 'system_cancel', 'user_fallback'].includes(error ?? '')) {
    return 'cancelled';
  }
  if (error === 'authentication_failed') return 'failed';
  if (error === 'lockout') return 'locked';
  if (['not_enrolled', 'not_available', 'passcode_not_set'].includes(error ?? '')) {
    return 'unavailable';
  }
  return 'error';
}

export function shouldLockOnAppStateChange(
  previousState: AppVisibilityState,
  nextState: AppVisibilityState,
  isAuthenticated: boolean
): boolean {
  return isAuthenticated && previousState !== 'background' && nextState === 'background';
}

export function mergeWithLockedSession<T extends { isAuthenticated: boolean }>(
  persistedState: unknown,
  currentState: T
): T {
  const persisted =
    persistedState !== null && typeof persistedState === 'object'
      ? (persistedState as Partial<T>)
      : {};

  return {
    ...currentState,
    ...persisted,
    isAuthenticated: false,
  };
}
