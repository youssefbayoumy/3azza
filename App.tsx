import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useFonts, SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import './global.css';
import RootNavigator from './src/navigation/RootNavigator';
import { View, LogBox } from 'react-native';
import { initDatabase } from './src/services/database';
import { useAppStore } from './src/store/useAppStore';

// Ignore noisy Reanimated strict mode warnings from third-party libraries (e.g., bottom-tabs)
LogBox.ignoreLogs([
  '[Reanimated] Reading from `value`',
  '[Reanimated] Writing to `value`',
]);

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk: SpaceGrotesk_400Regular,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    Manrope: Manrope_400Regular,
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
    PlusJakartaSans: PlusJakartaSans_400Regular,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const [dbReady, setDbReady] = useState(false);
  const [storeReady, setStoreReady] = useState(false);

  // Wait for Zustand to rehydrate from SecureStore
  useEffect(() => {
    const unsub = useAppStore.persist.onFinishHydration(() => setStoreReady(true));
    setStoreReady(useAppStore.persist.hasHydrated());
    return unsub;
  }, []);

  // Initialise the SQLite database (creates tables on first launch)
  useEffect(() => {
    initDatabase()
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error('Failed to init database:', err);
        setDbReady(true); // proceed anyway so the app doesn't hang
      });
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && dbReady && storeReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, dbReady, storeReady]);

  if ((!fontsLoaded && !fontError) || !dbReady || !storeReady) {
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#081421' }}>
      <StatusBar style="light" />
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </View>
  );
}
