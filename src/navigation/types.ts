import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type TabParamList = {
  Dashboard: undefined;
  Maintenance: { openRuleId?: string } | undefined;
  Vault: undefined;
  Inventory: undefined;
};

export type MainStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  GasLog: undefined;
  Insights: undefined;
  TechSpecs: undefined;
  OilChangeDetails: undefined;
  VehicleVitals: undefined;
  VehicleSettings: undefined;
  PreRideCheck: undefined;
  ServiceLogs: undefined;
  MaintenanceHistorySetup: undefined;
  MaintenanceReminderCustomization: { ruleId: string };
};

export type RootStackParamList = {
  VehicleSetup: undefined;
  Main: NavigatorScreenParams<MainStackParamList> | undefined;
};

export type DashboardNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Dashboard'>,
  NativeStackNavigationProp<MainStackParamList>
>;

export type MaintenanceNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Maintenance'>,
  NativeStackNavigationProp<MainStackParamList>
>;

/** @deprecated Use MaintenanceNavigationProp. */
export type VitalsNavigationProp = MaintenanceNavigationProp;

export type PreRideNavigationProp = NativeStackNavigationProp<MainStackParamList, 'PreRideCheck'>;

export type ServiceLogsNavigationProp = NativeStackNavigationProp<MainStackParamList, 'ServiceLogs'>;

export type MainStackNavigationProp = NativeStackNavigationProp<MainStackParamList>;
