import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type TabParamList = {
  Dashboard: undefined;
  Vitals: undefined;
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
};

export type RootStackParamList = {
  Onboarding: undefined;
  VehicleSetup: undefined;
  Main: NavigatorScreenParams<MainStackParamList> | undefined;
};

export type DashboardNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Dashboard'>,
  NativeStackNavigationProp<MainStackParamList>
>;

export type VitalsNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Vitals'>,
  NativeStackNavigationProp<MainStackParamList>
>;

export type PreRideNavigationProp = NativeStackNavigationProp<MainStackParamList, 'PreRideCheck'>;

export type ServiceLogsNavigationProp = NativeStackNavigationProp<MainStackParamList, 'ServiceLogs'>;

export type MainStackNavigationProp = NativeStackNavigationProp<MainStackParamList>;
