import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { getDailyPreRideState, savePreRideState } from '../services/database';
import type { PreRideState } from '../types/database.types';
import type { PreRideNavigationProp } from '../navigation/types';
import ActiveVehicleChip from '../components/ActiveVehicleChip';
import AppIconButton from '../components/ui/AppIconButton';
import AppTopBar from '../components/ui/AppTopBar';
import AppScreen from '../components/ui/AppScreen';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';

export default function PreRideCheckScreen() {
    const navigation = useNavigation<PreRideNavigationProp>();
    const { width: viewportWidth } = useWindowDimensions();
    const [state, setState] = useState<PreRideState | null>(null);
    const [saving, setSaving] = useState(false);

    const loadState = useCallback(async (isCurrent: () => boolean) => {
        const nextState = await getDailyPreRideState();
        if (isCurrent()) setState(nextState);
    }, []);

    const { error: loadError, loading, reload } = useFocusedLoader(
        loadState,
        'Today’s pre-ride checklist could not be loaded. No check was recorded.',
        'Failed to load pre-ride check:'
    );

    const toggleCheck = (key: keyof PreRideState, currentValue: number) => {
        const newValue = currentValue === 1 ? 0 : 1;
        setState(prev => prev ? { ...prev, [key]: newValue } : null);
    };

    const handleSaveCheck = () => {
        if (systemReadiness < 100) {
            Alert.alert(
                'Incomplete Check',
                `Only ${completedChecks} of 4 items are marked complete. Save this check with incomplete items?`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Save Anyway', onPress: performSave }
                ]
            );
        } else {
            performSave();
        }
    };

    const performSave = async () => {
        if (!state) return;
        const now = new Date().toISOString();
        setSaving(true);
        try {
            await savePreRideState({
                brakes_checked: state.brakes_checked,
                tires_checked: state.tires_checked,
                lights_checked: state.lights_checked,
                oil_checked: state.oil_checked,
                last_run_at: now,
            });
            setState({ ...state, last_run_at: now });
            Alert.alert('Pre-ride check saved', `${completedChecks} of 4 items recorded for today.`, [
                { text: 'OK', onPress: () => navigation.goBack() }
            ]);
        } catch (error) {
            console.error('Failed to save pre-ride check:', error);
            Alert.alert('Save failed', 'The pre-ride check could not be saved. Try again.');
        } finally {
            setSaving(false);
        }
    };

    if (loading || loadError || !state) {
        return <ScreenLoadState error={loadError ?? (!loading ? 'Today’s checklist is unavailable.' : null)} loading={loading} onBack={() => navigation.goBack()} onRetry={reload} title="PRE-RIDE CHECK" />;
    }

    const { brakes_checked, tires_checked, lights_checked, oil_checked } = state;
    const checksArray = [brakes_checked, tires_checked, lights_checked, oil_checked];
    const completedChecks = checksArray.filter(v => v === 1).length;
    const systemReadiness = Math.round((completedChecks / 4) * 100);
    const gaugeSize = Math.min(Math.max(viewportWidth - 48, 180), 320);

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
        colorTheme: 'amber' | 'emerald'
    }) => {
        const isChecked = value === 1;
        const activeBg = isChecked ? 'bg-surface-container-high' : 'bg-surface-container-low';
        const activeColor = colorTheme === 'amber' ? '#f59e0b' : '#10b981';
        
        return (
            <TouchableOpacity 
                className={`${activeBg} rounded-xl p-5 flex-row items-center justify-between gap-3 border-l-4 mb-4`}
                style={{ borderLeftColor: isChecked ? activeColor : 'transparent' }}
                activeOpacity={0.8}
                onPress={() => toggleCheck(checkedKey, value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isChecked }}
                accessibilityLabel={`${title}: ${isChecked ? 'checked' : 'not checked'}`}
            >
                <View className="flex-row items-center gap-4 flex-1 min-w-0">
                    <View className="w-12 h-12 rounded-lg bg-surface-container-highest items-center justify-center">
                        <MaterialIcons name={icon as any} size={24} color="#c6c6c6" />
                    </View>
                    <View className="flex-1 min-w-0">
                        <Text className="font-headline text-secondary font-bold text-sm tracking-wide">{title}</Text>
                        <Text className="font-label text-xs uppercase text-secondary/40">{subtitle}</Text>
                    </View>
                </View>
                
                {/* Industrial Toggle */}
                <View
                    className={`relative w-16 h-8 rounded-full p-1 flex-row items-center ${isChecked ? '' : 'bg-surface-container-lowest'} border border-outline-variant/10`}
                    style={isChecked ? { backgroundColor: `${activeColor}1a` } : undefined}
                >
                    <View
                        className={`h-6 w-6 rounded-full border border-white/20 shadow-lg absolute ${isChecked ? 'right-1' : 'bg-outline-variant left-1'}`}
                        style={isChecked ? { backgroundColor: activeColor } : undefined}
                    />
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <AppScreen edges={['top', 'bottom', 'left', 'right']}>
            <AppTopBar
                tone="subtle"
                className="z-50"
                leading={<AppIconButton accessibilityLabel="Go back" icon="arrow-back" onPress={() => navigation.goBack()} />}
                trailing={<View className="w-8 h-8 rounded-full border border-outline-variant overflow-hidden bg-surface-container-highest">
                    <MaterialIcons name="person" size={20} color="#a9c7ff" style={{ alignSelf: 'center', marginTop: 4 }} />
                </View>}
            >
                <Text className="font-headline uppercase tracking-widest text-sm font-bold text-[#a9c7ff]" numberOfLines={1}>PRE-RIDE CHECK</Text>
            </AppTopBar>

            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32 }}
            >
                <ActiveVehicleChip />
                {/* Hero Gauge Visual */}
                <View
                    className="relative mx-auto mb-10 items-center justify-center"
                    style={{
                        height: gaugeSize,
                        width: gaugeSize,
                    }}
                >
                    <Svg
                        width={gaugeSize}
                        height={gaugeSize}
                        viewBox="0 0 100 100"
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            transform: [{ rotate: '-90deg' }],
                        }}
                    >
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
                        <Text className="font-label text-xs uppercase tracking-widest text-secondary/60 mb-1">Checks Completed</Text>
                        <View className="flex-row items-start">
                            <Text className="font-headline text-5xl font-bold tracking-tighter text-secondary">{systemReadiness}</Text>
                            <Text className="text-xl font-light opacity-50 text-secondary mt-1">%</Text>
                        </View>
                        <View className="mt-2 flex-row items-center justify-center gap-2">
                            <View className={`w-2 h-2 rounded-full ${systemReadiness === 100 ? 'bg-emerald-500' : 'bg-primary'}`} />
                            <Text className={`font-label text-xs uppercase font-bold ${systemReadiness === 100 ? 'text-emerald-500' : 'text-primary'}`}>Manual Checklist</Text>
                        </View>
                    </View>
                </View>

                {/* Check List Bento Grid */}
                <View className="flex-col pb-6">
                    <CheckItem title="Brakes" subtitle="Response & Fluid" icon="emergency" checkedKey="brakes_checked" value={brakes_checked} colorTheme="emerald" />
                    <CheckItem title="Tires (Air/Wear)" subtitle="Visual Inspection" icon="tire-repair" checkedKey="tires_checked" value={tires_checked} colorTheme="amber" />
                    <CheckItem title="Lights" subtitle="All Beacons Active" icon="lightbulb" checkedKey="lights_checked" value={lights_checked} colorTheme="emerald" />
                    <CheckItem title="Oil Level" subtitle="If Applicable" icon="oil-barrel" checkedKey="oil_checked" value={oil_checked} colorTheme="emerald" />
                </View>

                {/* Master Confirmation Button */}
                <View className="mt-4 px-2">
                    <TouchableOpacity 
                        className={`h-16 rounded-xl shadow-lg flex-row items-center justify-center gap-3 active:scale-95 border-t border-white/20 ${systemReadiness === 100 ? 'bg-emerald-600' : 'bg-secondary'}`}
                        onPress={handleSaveCheck}
                        disabled={saving}
                        accessibilityRole="button"
                    >
                        {saving ? <ActivityIndicator color="#030f1c" /> : <MaterialIcons name="save" size={24} color="#030f1c" />}
                        <Text className="text-[#030f1c] font-headline font-bold uppercase tracking-[0.2em]">{saving ? 'Saving' : 'Save Pre-Ride Check'}</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </AppScreen>
    );
}
