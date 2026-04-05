import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { getPreRideState, savePreRideState } from '../services/database';
import type { PreRideState } from '../types/database.types';

export default function PreRideCheckScreen() {
    const navigation = useNavigation();
    const [state, setState] = useState<PreRideState | null>(null);
    const [loading, setLoading] = useState(true);

    const loadState = useCallback(async () => {
        setLoading(true);
        const data = await getPreRideState();
        if (data) {
            setState(data);
        } else {
            // Default payload if initial insert hasn't happened yet
            setState({ id: 1, brakes_checked: 0, tires_checked: 0, lights_checked: 0, oil_checked: 0, last_run_at: null });
        }
        setLoading(false);
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadState();
        }, [loadState])
    );

    const toggleCheck = async (key: keyof PreRideState, currentValue: number) => {
        const newValue = currentValue === 1 ? 0 : 1;
        // Optimistic update
        setState(prev => prev ? { ...prev, [key]: newValue } : null);
        try {
            await savePreRideState({ [key]: newValue });
        } catch (error) {
            console.error('Failed to toggle:', error);
            // Revert on failure
            await loadState();
        }
    };

    const handleInitializeEngine = async () => {
        if (systemReadiness < 100) {
            Alert.alert(
                'Suboptimal Readiness',
                'System readiness is below 100%. Are you sure you want to initialize without completing all checks?',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Initialize Anyway', style: 'destructive', onPress: performInitialization }
                ]
            );
        } else {
            performInitialization();
        }
    };

    const performInitialization = async () => {
        const now = new Date().toISOString();
        setState(prev => prev ? { ...prev, last_run_at: now } : null);
        await savePreRideState({ last_run_at: now });
        Alert.alert('System Online', 'Engine initialized and pre-ride checks logged.', [
            { text: 'OK', onPress: () => navigation.goBack() }
        ]);
    };

    if (loading || !state) {
        return (
            <View className="flex-1 bg-background items-center justify-center">
                <ActivityIndicator size="large" color="#a9c7ff" />
            </View>
        );
    }

    const { brakes_checked, tires_checked, lights_checked, oil_checked } = state;
    const checksArray = [brakes_checked, tires_checked, lights_checked, oil_checked];
    const completedChecks = checksArray.filter(v => v === 1).length;
    const systemReadiness = Math.round((completedChecks / 4) * 100);

    // SVG Circular Gauge calculation
    const radius = 45;
    const circumference = 2 * Math.PI * radius; // approx 282.74
    // Make it a semi-circle style gauge layout, full is 100% of the circle though for simplicity, wait design has a 3/4 circle.
    // Length: 282, we'll map 0-100 to 0-282
    const strokeDashoffset = circumference - (systemReadiness / 100) * circumference;

    const CheckItem = ({ 
        title, 
        subtitle, 
        icon, 
        checkedKey, 
        value, 
        colorTheme 
    }: { 
        title: string; 
        subtitle: string; 
        icon: string; 
        checkedKey: keyof PreRideState; 
        value: number; 
        colorTheme: string 
    }) => {
        const isChecked = value === 1;
        // Active colors based on theme, generic fallback
        const activeBorder = isChecked ? `border-${colorTheme}-500/50` : 'border-outline-variant/10';
        const activeBg = isChecked ? 'bg-surface-container-high' : 'bg-surface-container-low';
        
        return (
            <TouchableOpacity 
                className={`${activeBg} rounded-xl p-5 flex-row items-center justify-between group border-l-4 ${isChecked ? `border-${colorTheme}-500` : 'border-transparent'} mb-4`}
                activeOpacity={0.8}
                onPress={() => toggleCheck(checkedKey, value)}
            >
                <View className="flex-row items-center gap-4">
                    <View className="w-12 h-12 rounded-lg bg-surface-container-highest items-center justify-center">
                        <MaterialIcons name={icon as any} size={24} color="#c6c6c6" />
                    </View>
                    <View>
                        <Text className="font-headline text-secondary font-bold text-sm tracking-wide">{title}</Text>
                        <Text className="font-label text-[10px] uppercase text-secondary/40">{subtitle}</Text>
                    </View>
                </View>
                
                {/* Industrial Toggle */}
                <View className={`relative w-16 h-8 rounded-full p-1 flex-row items-center ${isChecked ? `bg-${colorTheme}-500/10` : 'bg-surface-container-lowest'} border border-outline-variant/10 transition-all duration-300`}>
                    <View className={`h-6 w-6 rounded-full border border-white/20 shadow-lg absolute ${isChecked ? `bg-${colorTheme}-500 right-1` : 'bg-outline-variant left-1'}`} />
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View className="flex-1 bg-background pt-12">
            {/* TopAppBar */}
            <View className="flex-row items-center justify-between px-6 h-16 w-full border-b border-[#C0C0C0]/10 bg-[#081421] z-50">
                <View className="flex-row items-center gap-4">
                    <TouchableOpacity className="p-2" onPress={() => navigation.goBack()}>
                        <MaterialIcons name="arrow-back" size={24} color="#a9c7ff" />
                    </TouchableOpacity>
                    <Text className="font-headline uppercase tracking-widest text-sm font-bold text-[#a9c7ff]">PRE-RIDE CHECK</Text>
                </View>
                <View className="w-8 h-8 rounded-full border border-outline-variant overflow-hidden bg-surface-container-highest">
                    <MaterialIcons name="person" size={20} color="#a9c7ff" style={{ alignSelf: 'center', marginTop: 4 }} />
                </View>
            </View>

            <ScrollView className="flex-1 px-6 pt-10" contentContainerStyle={{ paddingBottom: 120 }}>
                {/* Hero Gauge Visual */}
                <View className="relative w-full aspect-square max-w-[240px] mx-auto mb-10 items-center justify-center">
                    <Svg width="240" height="240" viewBox="0 0 100 100" className="absolute -rotate-90">
                        <Defs>
                            <LinearGradient id="gaugeGradient" x1="0%" x2="100%" y1="0%" y2="0%">
                                <Stop offset="0%" stopColor="#a9c7ff" />
                                <Stop offset="100%" stopColor="#418df5" />
                            </LinearGradient>
                        </Defs>
                        <Circle 
                            cx="50" cy="50" r="45" 
                            fill="none" 
                            stroke="#2a3644" 
                            strokeWidth="6" 
                        />
                        <Circle 
                            cx="50" cy="50" r="45" 
                            fill="none" 
                            stroke="url(#gaugeGradient)" 
                            strokeWidth="6" 
                            strokeLinecap="round"
                            strokeDasharray={`${circumference} ${circumference}`}
                            strokeDashoffset={strokeDashoffset}
                        />
                    </Svg>
                    <View className="items-center z-10">
                        <Text className="font-label text-[10px] uppercase tracking-widest text-secondary/60 mb-1">System Readiness</Text>
                        <View className="flex-row items-start">
                            <Text className="font-headline text-5xl font-bold tracking-tighter text-secondary">{systemReadiness}</Text>
                            <Text className="text-xl font-light opacity-50 text-secondary mt-1">%</Text>
                        </View>
                        <View className="mt-2 flex-row items-center justify-center gap-2">
                            <View className={`w-2 h-2 rounded-full ${systemReadiness === 100 ? 'bg-emerald-500' : 'bg-primary'}`} />
                            <Text className={`font-label text-[9px] uppercase font-bold ${systemReadiness === 100 ? 'text-emerald-500' : 'text-primary'}`}>Live Diagnostics</Text>
                        </View>
                    </View>
                </View>

                {/* Check List Bento Grid */}
                <View className="flex-col pb-6">
                    <CheckItem title="Brakes" subtitle="Response & Fluid" icon="emergency" checkedKey="brakes_checked" value={brakes_checked} colorTheme="emerald" />
                    <CheckItem title="Tires (Air/Wear)" subtitle="Visual Inspection" icon="tire-repair" checkedKey="tires_checked" value={tires_checked} colorTheme="amber" />
                    <CheckItem title="Lights" subtitle="All Beacons Active" icon="lightbulb" checkedKey="lights_checked" value={lights_checked} colorTheme="emerald" />
                    <CheckItem title="Oil Level" subtitle="Dipstick Checked" icon="oil-barrel" checkedKey="oil_checked" value={oil_checked} colorTheme="emerald" />
                </View>

                {/* Master Confirmation Button */}
                <View className="mt-4 px-2">
                    <TouchableOpacity 
                        className={`w-full h-16 rounded-xl shadow-lg flex-row items-center justify-center gap-3 active:scale-95 border-t border-white/20 ${systemReadiness === 100 ? 'bg-emerald-600' : 'bg-secondary'}`}
                        onPress={handleInitializeEngine}
                    >
                        <MaterialIcons name="rocket-launch" size={24} color="#030f1c" />
                        <Text className="text-[#030f1c] font-headline font-bold uppercase tracking-[0.2em]">Initialize Engine</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}
