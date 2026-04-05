import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

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
  // Onboarding
  hasCompletedOnboarding: boolean;
  completeOnboarding: () => void;
  resetOnboarding: () => void; // Dev only
  
  // Auth
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;

  // Vehicle Setup
  hasCompletedVehicleSetup: boolean;
  completeVehicleSetup: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      resetOnboarding: () => set({ hasCompletedOnboarding: false }),

      isAuthenticated: false,
      login: () => set({ isAuthenticated: true }),
      logout: () => set({ isAuthenticated: false }),

      hasCompletedVehicleSetup: false,
      completeVehicleSetup: () => set({ hasCompletedVehicleSetup: true }),
    }),
    {
      name: '3azza-secure-store',
      storage: createJSONStorage(() => secureStorage),
    }
  )
);
