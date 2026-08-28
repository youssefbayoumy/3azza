import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import { mergeWithLockedSession } from '../utils/appLock';
import type { AppLocale } from '../i18n/core';
import { setActiveLocale } from '../i18n/localeState';
import { normalizePersistedLocale } from '../i18n/persistence';

// ── Secure Storage Adapter for Zustand ──
const secureStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await SecureStore.getItemAsync(name)) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await SecureStore.deleteItemAsync(name);
  },
};

// ── App-wide state persisted securely ──

interface AppState {
  // Auth
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  appLockEnabled: boolean;
  setAppLockEnabled: (enabled: boolean) => void;

  // Vehicle Setup
  hasCompletedVehicleSetup: boolean;
  completeVehicleSetup: () => void;
  setVehicleSetupComplete: (complete: boolean) => void;

  // Preferences
  garageMode: boolean;
  maintenanceReminders: boolean;
  backupReminder: boolean;
  locale: AppLocale;
  setGarageMode: (enabled: boolean) => void;
  setMaintenanceReminders: (enabled: boolean) => void;
  setBackupReminder: (enabled: boolean) => void;
  setLocale: (locale: AppLocale) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      login: () => set({ isAuthenticated: true }),
      logout: () => set({ isAuthenticated: false }),
      // App lock stays available in Settings, but it must not add a mandatory
      // PIN-registration step before a new owner can finish vehicle setup.
      appLockEnabled: false,
      setAppLockEnabled: (enabled) => set({ appLockEnabled: enabled }),

      hasCompletedVehicleSetup: false,
      completeVehicleSetup: () => set({ hasCompletedVehicleSetup: true }),
      setVehicleSetupComplete: (complete) => set({ hasCompletedVehicleSetup: complete }),

      garageMode: true,
      maintenanceReminders: false,
      backupReminder: false,
      locale: 'en',
      setGarageMode: (enabled) => set({ garageMode: enabled }),
      setMaintenanceReminders: (enabled) => set({ maintenanceReminders: enabled }),
      setBackupReminder: (enabled) => set({ backupReminder: enabled }),
      setLocale: (locale) => {
        setActiveLocale(locale);
        set({ locale });
      },
    }),
    {
      name: '3azza-secure-store',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        ...state,
        isAuthenticated: false,
      }),
      merge: (persistedState, currentState) => {
        const merged = mergeWithLockedSession(persistedState, currentState);
        const locale = normalizePersistedLocale(merged.locale);
        setActiveLocale(locale);
        return { ...merged, locale };
      },
    }
  )
);
