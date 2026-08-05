import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import GasLogScreen from '../screens/GasLogScreen';
import InsightsScreen from '../screens/InsightsScreen';
import TechSpecsScreen from '../screens/TechSpecsScreen';
import OilChangeDetailsScreen from '../screens/OilChangeDetailsScreen';
import VehicleVitalsScreen from '../screens/VehicleVitalsScreen';
import VehicleSettingsScreen from '../screens/VehicleSettingsScreen';
import PreRideCheckScreen from '../screens/PreRideCheckScreen';
import ServiceLogsScreen from '../screens/ServiceLogsScreen';
import MaintenanceHistorySetupScreen from '../screens/MaintenanceHistorySetupScreen';
import MaintenanceReminderCustomizationScreen from '../screens/MaintenanceReminderCustomizationScreen';
import type { MainStackParamList } from './types';

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#081421' } }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="GasLog" component={GasLogScreen} />
      <Stack.Screen name="Insights" component={InsightsScreen} />
      <Stack.Screen name="TechSpecs" component={TechSpecsScreen} />
      <Stack.Screen name="OilChangeDetails" component={OilChangeDetailsScreen} />
      <Stack.Screen name="VehicleVitals" component={VehicleVitalsScreen} />
      <Stack.Screen name="VehicleSettings" component={VehicleSettingsScreen} />
      <Stack.Screen name="PreRideCheck" component={PreRideCheckScreen} />
      <Stack.Screen name="ServiceLogs" component={ServiceLogsScreen} />
      <Stack.Screen name="MaintenanceHistorySetup" component={MaintenanceHistorySetupScreen} />
      <Stack.Screen name="MaintenanceReminderCustomization" component={MaintenanceReminderCustomizationScreen} />
    </Stack.Navigator>
  );
}
