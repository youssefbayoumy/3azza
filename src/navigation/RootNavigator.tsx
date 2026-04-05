import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import AuthNavigator from './AuthNavigator';
import VehicleSetupScreen from '../screens/setup/VehicleSetupScreen';
import { useAppStore } from '../store/useAppStore';

export type RootStackParamList = {
    Onboarding: undefined;
    Auth: undefined;
    VehicleSetup: undefined;
    MainTabs: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
    const hasCompletedOnboarding = useAppStore((s) => s.hasCompletedOnboarding);
    const isAuthenticated = useAppStore((s) => s.isAuthenticated);
    const hasCompletedVehicleSetup = useAppStore((s) => s.hasCompletedVehicleSetup);

    return (
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#081421' }, animation: 'fade' }}>
            {!hasCompletedOnboarding ? (
                <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            ) : !isAuthenticated ? (
                <Stack.Screen name="Auth" component={AuthNavigator} />
            ) : !hasCompletedVehicleSetup ? (
                <Stack.Screen name="VehicleSetup" component={VehicleSetupScreen} />
            ) : (
                <Stack.Screen name="MainTabs" component={TabNavigator} />
            )}
        </Stack.Navigator>
    );
}
