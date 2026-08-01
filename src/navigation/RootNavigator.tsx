import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainNavigator from './MainNavigator';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import VehicleSetupScreen from '../screens/setup/VehicleSetupScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import { useAppStore } from '../store/useAppStore';
import { hasRegisteredPin } from '../services/auth';
import { getAppLockEntryMode, shouldLockOnAppStateChange } from '../utils/appLock';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppLockGate() {
    const [registeredPin, setRegisteredPin] = useState<boolean | null>(null);
    const [checkFailed, setCheckFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    const retry = useCallback(() => {
        setRegisteredPin(null);
        setCheckFailed(false);
        setAttempt((value) => value + 1);
    }, []);

    useEffect(() => {
        let cancelled = false;

        hasRegisteredPin()
            .then((hasPin) => {
                if (!cancelled) setRegisteredPin(hasPin);
            })
            .catch((error) => {
                console.error('Failed to check app-lock PIN:', error);
                if (!cancelled) setCheckFailed(true);
            });

        return () => {
            cancelled = true;
        };
    }, [attempt]);

    if (checkFailed) {
        return (
            <View className="flex-1 bg-background items-center justify-center px-8">
                <Text className="font-headline text-xl font-bold text-on-surface text-center">App lock unavailable</Text>
                <Text className="font-body text-sm text-on-surface-variant text-center mt-3 mb-6">
                    3azza could not safely check the PIN stored on this device.
                </Text>
                <TouchableOpacity className="bg-primary rounded-xl px-8 py-4" onPress={retry}>
                    <Text className="font-label font-bold uppercase tracking-wider text-[#081421]">Try Again</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (registeredPin === null) {
        return (
            <View className="flex-1 bg-background items-center justify-center px-8">
                <ActivityIndicator size="large" color="#a9c7ff" />
                <Text className="font-body text-sm text-on-surface-variant mt-4">Checking app lock...</Text>
            </View>
        );
    }

    return getAppLockEntryMode(registeredPin) === 'unlock' ? <LoginScreen /> : <RegisterScreen />;
}

export default function RootNavigator() {
    const hasCompletedOnboarding = useAppStore((s) => s.hasCompletedOnboarding);
    const isAuthenticated = useAppStore((s) => s.isAuthenticated);
    const appLockEnabled = useAppStore((s) => s.appLockEnabled);
    const hasCompletedVehicleSetup = useAppStore((s) => s.hasCompletedVehicleSetup);
    const logout = useAppStore((s) => s.logout);
    const appState = useRef(AppState.currentState);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextState) => {
            if (shouldLockOnAppStateChange(appState.current, nextState, useAppStore.getState().isAuthenticated)) {
                logout();
            }
            appState.current = nextState;
        });
        return () => subscription.remove();
    }, [logout]);

    return (
        <View style={styles.root}>
            <View
                style={styles.root}
                accessibilityElementsHidden={hasCompletedOnboarding && appLockEnabled && !isAuthenticated}
                importantForAccessibility={hasCompletedOnboarding && appLockEnabled && !isAuthenticated ? 'no-hide-descendants' : 'auto'}
            >
                <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#081421' }, animation: 'fade' }}>
                    {!hasCompletedOnboarding ? (
                        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
                    ) : !hasCompletedVehicleSetup ? (
                        <Stack.Screen name="VehicleSetup" component={VehicleSetupScreen} />
                    ) : (
                        <Stack.Screen name="Main" component={MainNavigator} />
                    )}
                </Stack.Navigator>
            </View>
            {hasCompletedOnboarding && appLockEnabled && !isAuthenticated ? (
                <Modal
                    visible
                    animationType="none"
                    presentationStyle="fullScreen"
                    hardwareAccelerated
                    onRequestClose={() => undefined}
                >
                    <View accessibilityViewIsModal style={styles.lockOverlay}>
                        <AppLockGate />
                    </View>
                </Modal>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    lockOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#081421',
        elevation: 100,
        zIndex: 100,
    },
});
