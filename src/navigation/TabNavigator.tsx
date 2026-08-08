import React from 'react';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DashboardScreen from '../screens/DashboardScreen';

import InventoryScreen from '../screens/InventoryScreen';
import MaintenanceScheduleScreen from '../screens/MaintenanceScheduleScreen';
import DocumentsVaultScreen from '../screens/DocumentsVaultScreen';
import type { TabParamList } from './types';
import { useTranslation } from '../i18n';

const Tab = createBottomTabNavigator<TabParamList>();

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
    const { t, isRTL } = useTranslation();
    const visibleRoutes = state.routes;
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const tabWidth = width / Math.max(visibleRoutes.length, 1);
    const labelFontSize = tabWidth < 84 ? 10 : 11;
    const labelLetterSpacing = tabWidth < 96 ? 0.2 : 0.4;

    return (
        <View style={styles.tabBarContainer}>
            <BlurView intensity={80} tint="dark" style={styles.blurView}>
                <View
                    className="flex-row items-center border-t border-white/10 bg-[#081421]/80"
                    style={{ paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10) }}
                >
                    {visibleRoutes.map((route, index) => {
                        // Get true index for focused state by finding this route in original state
                        const isFocused = state.index === state.routes.findIndex(r => r.key === route.key);

                        const iconName = route.name === 'Dashboard' ? 'speed' :
                            route.name === 'Inventory' ? 'inventory-2' :
                                route.name === 'Maintenance' ? 'build-circle' :
                                    route.name === 'Vault' ? 'folder-special' : 'settings';
                        const label = route.name === 'Dashboard' ? t('tabs.home') :
                            route.name === 'Inventory' ? t('tabs.parts') :
                                route.name === 'Maintenance' ? t('tabs.maintenance') :
                                    route.name === 'Vault' ? t('tabs.documents') : route.name;

                        const onPress = () => {
                            const event = navigation.emit({
                                type: 'tabPress',
                                target: route.key,
                                canPreventDefault: true,
                            });

                            if (!isFocused && !event.defaultPrevented) {
                                navigation.navigate(route.name as keyof TabParamList);
                            }
                        };

                        return (
                        <TouchableOpacity
                            key={route.key}
                            accessibilityRole="button"
                            accessibilityLabel={t('tabs.tab', { label })}
                            accessibilityState={isFocused ? { selected: true } : {}}
                            onPress={onPress}
                            activeOpacity={0.7}
                            style={styles.tabButton}
                        >
                            <View 
                            className={`flex-col items-center justify-center rounded-2xl ${
                                isFocused ? 'bg-primary/10' : ''
                            }`}
                            style={styles.tabButtonContent}
                            >
                            <MaterialIcons
                                name={iconName as any}
                                size={24}
                                color={isFocused ? '#a9c7ff' : '#64748b'}
                            />
                            <Text
                                className={`font-label uppercase font-bold mt-1 ${
                                isFocused ? 'text-primary' : 'text-slate-500'
                                }`}
                                maxFontSizeMultiplier={1.35}
                                numberOfLines={1}
                                style={{
                                    fontSize: labelFontSize,
                                    letterSpacing: isRTL ? 0 : labelLetterSpacing,
                                    lineHeight: labelFontSize + 4,
                                    fontFamily: isRTL ? 'Cairo_700Bold' : 'PlusJakartaSans_700Bold',
                                    textAlign: 'center',
                                    width: '100%',
                                }}
                            >
                                {label}
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
            <Tab.Screen name="Maintenance" component={MaintenanceScheduleScreen} />
            <Tab.Screen name="Vault" component={DocumentsVaultScreen} />
            <Tab.Screen name="Inventory" component={InventoryScreen} />
        </Tab.Navigator>
    );
}

const styles = StyleSheet.create({
    tabBarContainer: {
        flexShrink: 0,
    },
    blurView: {
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        overflow: 'hidden',
    },
    tabButton: {
        flex: 1,
        minWidth: 0,
    },
    tabButtonContent: {
        marginHorizontal: 2,
        minWidth: 0,
        paddingHorizontal: 2,
        paddingVertical: 8,
    },
});
