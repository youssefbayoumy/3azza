import React from 'react';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import DashboardScreen from '../screens/DashboardScreen';

import InventoryScreen from '../screens/InventoryScreen';
import MaintenanceScheduleScreen from '../screens/MaintenanceScheduleScreen';
import DocumentsVaultScreen from '../screens/DocumentsVaultScreen';
import PreRideCheckScreen from '../screens/PreRideCheckScreen';
import ServiceLogsScreen from '../screens/ServiceLogsScreen';

const Tab = createBottomTabNavigator();

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    // Filter out hidden tabs
    const visibleRoutes = state.routes.filter(route => route.name !== 'PreRideCheck' && route.name !== 'ServiceLogs');

    return (
        <View style={styles.tabBarContainer}>
            <BlurView intensity={80} tint="dark" style={styles.blurView}>
                <View className="flex-row justify-around items-center px-2 pt-4 pb-8 border-t border-white/10 bg-[#081421]/80">
                    {visibleRoutes.map((route, index) => {
                        const { options } = descriptors[route.key];
                        // Get true index for focused state by finding this route in original state
                        const isFocused = state.index === state.routes.findIndex(r => r.key === route.key);

                        const iconName = route.name === 'Dashboard' ? 'speed' :
                            route.name === 'Inventory' ? 'inventory-2' :
                                route.name === 'Vitals' ? 'monitor-heart' :
                                    route.name === 'Vault' ? 'folder-special' : 'settings';

                        const onPress = () => {
                            const event = navigation.emit({
                                type: 'tabPress',
                                target: route.key,
                                canPreventDefault: true,
                            });

                            if (!isFocused && !event.defaultPrevented) {
                                navigation.navigate(route.name);
                            }
                        };

                        return (
                        <TouchableOpacity
                            key={route.key}
                            accessibilityRole="button"
                            accessibilityState={isFocused ? { selected: true } : {}}
                            onPress={onPress}
                            activeOpacity={0.7}
                            // Remove className from here
                            style={{ flex: 1 }} 
                        >
                            {/* Move the styling to this View */}
                            <View 
                            className={`flex-col items-center justify-center p-2 mx-1 rounded-full ${
                                isFocused ? 'bg-primary/10' : ''
                            }`}
                            >
                            <MaterialIcons
                                name={iconName as any}
                                size={24}
                                color={isFocused ? '#a9c7ff' : '#64748b'}
                            />
                            <Text
                                className={`font-label text-[9px] uppercase font-bold mt-1 tracking-wider ${
                                isFocused ? 'text-primary' : 'text-slate-500'
                                }`}
                            >
                                {route.name}
                            </Text>
                            </View>
                        </TouchableOpacity>
                        );
                    })}
                </View>
            </BlurView>
        </View>
    );
}

export default function TabNavigator() {
    return (
        <Tab.Navigator
            tabBar={(props) => <CustomTabBar {...props} />}
            screenOptions={{ headerShown: false }}
        >
            <Tab.Screen name="Dashboard" component={DashboardScreen} />
            <Tab.Screen name="Vitals" component={MaintenanceScheduleScreen} />
            <Tab.Screen name="Vault" component={DocumentsVaultScreen} />
            <Tab.Screen name="Inventory" component={InventoryScreen} />
            <Tab.Screen name="PreRideCheck" component={PreRideCheckScreen} options={{ tabBarButton: () => null }} />
            <Tab.Screen name="ServiceLogs" component={ServiceLogsScreen} options={{ tabBarButton: () => null }} />
        </Tab.Navigator>
    );
}

const styles = StyleSheet.create({
    tabBarContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
    blurView: {
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        overflow: 'hidden',
    }
});
