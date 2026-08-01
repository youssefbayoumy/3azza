import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import {
  classifyBiometricResult,
  isValidPin,
  type BiometricUnlockOutcome,
} from '../utils/appLock';

const PIN_RECORD_KEY = 'user_pin_hash';
const LEGACY_PIN_KEY = 'user_pin';
const LOCKOUT_KEY = 'pin_lockout';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

type PinRecord = {
  version: 1;
  salt: string;
  hash: string;
};

type LockoutRecord = {
  failedAttempts: number;
  lockedUntil: number | null;
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

async function getPinRecord(): Promise<PinRecord | null> {
  const raw = await SecureStore.getItemAsync(PIN_RECORD_KEY);
  if (!raw) return null;

  try {
    const record = JSON.parse(raw) as PinRecord;
    return record.version === 1 && record.salt && record.hash ? record : null;
  } catch {
    return null;
  }
}

async function replacePinRecord(pin: string): Promise<void> {
  const salt = bytesToHex(await Crypto.getRandomBytesAsync(16));
  const hash = await hashPin(pin, salt);
  const record: PinRecord = { version: 1, salt, hash };
  await SecureStore.setItemAsync(PIN_RECORD_KEY, JSON.stringify(record));
}

async function getLockoutRecord(): Promise<LockoutRecord> {
  const raw = await SecureStore.getItemAsync(LOCKOUT_KEY);
  if (!raw) return { failedAttempts: 0, lockedUntil: null };

  try {
    const record = JSON.parse(raw) as LockoutRecord;
    return {
      failedAttempts: record.failedAttempts ?? 0,
      lockedUntil: record.lockedUntil ?? null,
    };
  } catch {
    return { failedAttempts: 0, lockedUntil: null };
  }
}

async function saveLockoutRecord(record: LockoutRecord): Promise<void> {
  await SecureStore.setItemAsync(LOCKOUT_KEY, JSON.stringify(record));
}

async function finishPinWrite(pin: string): Promise<void> {
  await replacePinRecord(pin);
  await SecureStore.deleteItemAsync(LEGACY_PIN_KEY);
  await resetPinFailures();
}

export async function hasRegisteredPin(): Promise<boolean> {
  const [pinRecord, legacyPin] = await Promise.all([
    SecureStore.getItemAsync(PIN_RECORD_KEY),
    SecureStore.getItemAsync(LEGACY_PIN_KEY),
  ]);

  // A malformed record still means a lock exists. Failing closed prevents an
  // unauthenticated caller from replacing a PIN when storage is damaged.
  return Boolean(pinRecord || legacyPin);
}

export async function createPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) {
    throw new Error('PIN must contain exactly four digits.');
  }
  if (await hasRegisteredPin()) {
    throw new Error('An app-lock PIN is already registered.');
  }

  await finishPinWrite(pin);
}

export async function changePin(currentPin: string, newPin: string): Promise<boolean> {
  if (!isValidPin(newPin) || !(await verifyPin(currentPin))) {
    return false;
  }

  await finishPinWrite(newPin);
  return true;
}

export async function disablePin(currentPin: string): Promise<boolean> {
  if (!isValidPin(currentPin) || !(await verifyPin(currentPin))) {
    return false;
  }

  await Promise.all([
    SecureStore.deleteItemAsync(PIN_RECORD_KEY),
    SecureStore.deleteItemAsync(LEGACY_PIN_KEY),
    resetPinFailures(),
  ]);
  return true;
}

export async function getPinLockout(): Promise<{
  isLocked: boolean;
  failedAttempts: number;
  lockedUntil: number | null;
  secondsRemaining: number;
}> {
  const record = await getLockoutRecord();
  const now = Date.now();

  if (record.lockedUntil && record.lockedUntil > now) {
    return {
      isLocked: true,
      failedAttempts: record.failedAttempts,
      lockedUntil: record.lockedUntil,
      secondsRemaining: Math.ceil((record.lockedUntil - now) / 1000),
    };
  }

  if (record.lockedUntil && record.lockedUntil <= now) {
    await resetPinFailures();
    return { isLocked: false, failedAttempts: 0, lockedUntil: null, secondsRemaining: 0 };
  }

  return { isLocked: false, failedAttempts: record.failedAttempts, lockedUntil: null, secondsRemaining: 0 };
}

export async function verifyPin(pin: string): Promise<boolean> {
  const record = await getPinRecord();

  if (record) {
    return (await hashPin(pin, record.salt)) === record.hash;
  }

  const legacyPin = await SecureStore.getItemAsync(LEGACY_PIN_KEY);
  if (legacyPin && legacyPin === pin) {
    await finishPinWrite(pin);
    return true;
  }

  return false;
}

export async function recordFailedPinAttempt(): Promise<{
  failedAttempts: number;
  lockedUntil: number | null;
}> {
  const record = await getLockoutRecord();
  const failedAttempts = record.failedAttempts + 1;
  const lockedUntil = failedAttempts >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : null;
  const next = { failedAttempts, lockedUntil };

  await saveLockoutRecord(next);
  return next;
}

export async function resetPinFailures(): Promise<void> {
  await SecureStore.deleteItemAsync(LOCKOUT_KEY);
}

export async function canUseBiometricUnlock(): Promise<boolean> {
  if (!(await hasRegisteredPin())) return false;

  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);

  return hasHardware && isEnrolled;
}

export async function authenticateWithBiometrics(): Promise<BiometricUnlockOutcome> {
  if (!(await canUseBiometricUnlock())) return 'unavailable';

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock 3azza',
    fallbackLabel: 'Use app PIN',
    disableDeviceFallback: true,
    biometricsSecurityLevel: 'strong',
  });

  return result.success
    ? classifyBiometricResult(true)
    : classifyBiometricResult(false, result.error);
}
