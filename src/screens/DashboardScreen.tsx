import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert, useWindowDimensions } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import {
    correctOdometerReading,
    getMaintenanceEvents,
    getMaintenanceHistoryStates,
    getMaintenancePreferences,
    getMinimumOdometerReading,
    getOdometerCorrectionFloor,
    getVehicleProfile,
    saveVehicleProfile,
} from '../services/database';
import type { VehicleProfile } from '../types/database.types';
import type { DashboardNavigationProp } from '../navigation/types';
import { computePredictedOdometer } from '../utils/maintenance';
import { syncMaintenanceNotifications } from '../services/notifications';
import { useAppStore } from '../store/useAppStore';
import { parseWholeNumberInput, validateOdometerReading } from '../utils/recordValidation';
import ProtectedModal from '../components/ProtectedModal';
import AppIconButton from '../components/ui/AppIconButton';
import AppTopBar from '../components/ui/AppTopBar';
import AppScreen from '../components/ui/AppScreen';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';
import { getApplicableBreakInGuidance, getModelProfileForVehicle, getSelectedVariant } from '../modelData/modelKnowledge';
import { getMaintenanceProfileForSelection } from '../maintenance/profiles';
import { isTaskTracked, projectMaintenanceTasks } from '../maintenance/scheduler';
import { maintenanceComponentGroup, naturalMaintenanceActionLabel } from '../maintenance/presentation';
import {
    maintenanceHistoryByAction,
    maintenancePreferencesForScheduler,
} from '../maintenance/storageProjection';
import type {
    MaintenanceTaskProjection,
} from '../maintenance/types';

const HOME_COMPONENT_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
    'engine-oil': 'opacity',
    'gear-oil': 'settings',
    'air-filter': 'air',
    'spark-plug': 'bolt',
    cvt: 'settings-input-component',
    brakes: 'do-not-disturb-on',
    tires: 'trip-origin',
    battery: 'battery-charging-full',
    steering: 'device-hub',
    suspension: 'device-hub',
    'nuts-and-bolts': 'build',
    'main-side-stands': 'two-wheeler',
    'general-workshop-inspection': 'fact-check',
};

function homeGroup(task: MaintenanceTaskProjection): { id: string; label: string; icon: keyof typeof MaterialIcons.glyphMap } {
    const group = maintenanceComponentGroup(task.componentId);
    return {
        id: group.key,
        label: group.label,
        icon: HOME_COMPONENT_ICONS[group.key] ?? 'build',
    };
}

function isHomePriority(task: MaintenanceTaskProjection): boolean {
    return task.status === 'condition_attention'
        || task.status === 'overdue'
        || task.status === 'due'
        || task.status === 'due_soon'
        || task.status === 'history_unknown_recommend_service'
        || task.status === 'upcoming';
}

function homePriorityCopy(task: MaintenanceTaskProjection): string {
    if (task.status === 'condition_attention') {
        if (task.conditionResult === 'replace_now') return 'Replace now';
        if (task.conditionResult === 'replace_soon') return 'Replace soon';
        if (task.conditionResult === 'service_soon') return 'Service soon';
        if (task.conditionResult === 'cleaning_needed') return 'Cleaning needed';
        if (task.conditionResult === 'unable_to_inspect') return 'Workshop inspection needed';
        return 'Condition needs attention';
    }
    if (task.status === 'history_unknown_recommend_service') return 'Last change unknown';
    if (task.remainingKm !== null) {
        if (task.remainingKm < 0) return `${Math.abs(task.remainingKm).toLocaleString()} km overdue`;
        if (task.remainingKm === 0) return 'Due now';
        return `${task.remainingKm.toLocaleString()} km remaining`;
    }
    if (task.remainingDays !== null) {
        if (task.remainingDays < 0) return `${Math.abs(task.remainingDays)} days overdue`;
        if (task.remainingDays === 0) return 'Due today';
        return `${task.remainingDays} days remaining`;
    }
    return task.status === 'due' ? 'Due now' : task.status === 'due_soon' ? 'Due soon' : 'Upcoming';
}

function homePriorityColor(task: MaintenanceTaskProjection): string {
    if (task.status === 'overdue' || task.status === 'due' || task.conditionResult === 'replace_now') return 'text-error';
    if (task.status === 'due_soon' || task.status === 'condition_attention') return 'text-amber-400';
    if (task.status === 'history_unknown_recommend_service') return 'text-secondary';
    return 'text-primary';
}

export default function DashboardScreen() {
    const navigation = useNavigation<DashboardNavigationProp>();
    const { width: viewportWidth } = useWindowDimensions();
    const maintenanceReminders = useAppStore((state) => state.maintenanceReminders);
    const [profile, setProfile] = useState<VehicleProfile | null>(null);
    const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTaskProjection[]>([]);

    const [isOdoModalVisible, setIsOdoModalVisible] = useState(false);
    const [newOdoValue, setNewOdoValue] = useState('');
    const [odoError, setOdoError] = useState('');
    const [savingOdometer, setSavingOdometer] = useState(false);
    const [isCorrectionModalVisible, setIsCorrectionModalVisible] = useState(false);
    const [correctionValue, setCorrectionValue] = useState('');
    const [correctionReason, setCorrectionReason] = useState('');
    const [correctionFloor, setCorrectionFloor] = useState(0);
    const [correctionError, setCorrectionError] = useState('');
    const [savingCorrection, setSavingCorrection] = useState(false);

    const openOdoModal = () => {
        // We will default the input box to the computed mileage (prediction) rather than the last confirmed
        setNewOdoValue(computedMileage.toString() || '');
        setOdoError('');
        setIsOdoModalVisible(true);
    };

    const openCorrectionModal = async () => {
        if (!profile) return;
        setCorrectionValue(String(profile.current_mileage));
        setCorrectionReason('');
        // Fail closed until durable baselines have been read for this vehicle.
        setCorrectionFloor(profile.current_mileage);
        setCorrectionError('');
        setIsOdoModalVisible(false);
        setIsCorrectionModalVisible(true);
        try {
            setCorrectionFloor(await getOdometerCorrectionFloor());
        } catch (error) {
            console.error('Failed to read the odometer correction floor:', error);
            setCorrectionError('Saved odometer baselines could not be checked. Close this dialog and try again.');
        }
    };

    const saveCorrection = async (correctedMileageKm: number) => {
        setSavingCorrection(true);
        setCorrectionError('');
        try {
            await correctOdometerReading({ correctedMileageKm, reason: correctionReason });
            const data = await getVehicleProfile();
            await syncMaintenanceNotifications(maintenanceReminders);
            setProfile(data);
            setIsCorrectionModalVisible(false);
        } catch (error) {
            console.error('Failed to correct odometer:', error);
            setCorrectionError(error instanceof Error ? error.message : 'The odometer correction was not saved.');
        } finally {
            setSavingCorrection(false);
        }
    };

    const confirmCorrection = () => {
        if (!profile) return;
        const parsed = parseWholeNumberInput(correctionValue, { label: 'Corrected odometer' });
        if (!parsed.ok) {
            setCorrectionError(parsed.message);
            return;
        }
        if (parsed.value >= profile.current_mileage) {
            setCorrectionError(`Enter a value below the current ${profile.current_mileage.toLocaleString()} km reading.`);
            return;
        }
        if (parsed.value < correctionFloor) {
            setCorrectionError(`Saved records require at least ${correctionFloor.toLocaleString()} km.`);
            return;
        }
        if (!correctionReason.trim()) {
            setCorrectionError('Explain why this reading needs correction.');
            return;
        }
        setCorrectionError('');
        Alert.alert(
            'Confirm odometer correction',
            `Change the current odometer from ${profile.current_mileage.toLocaleString()} km to ${parsed.value.toLocaleString()} km? Maintenance due values will be recalculated, but saved maintenance and fuel records will not be changed.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Correct reading', onPress: () => void saveCorrection(parsed.value) },
            ]
        );
    };

    const confirmPredictedMileage = async () => {
        if (!profile) return;
        try {
            await saveVehicleProfile({
                current_mileage: computedMileage,
                last_odometer_update_timestamp: new Date().toISOString(),
            });
            const data = await getVehicleProfile();
            await syncMaintenanceNotifications(maintenanceReminders);
            setProfile(data);
        } catch (error) {
            console.error('Failed to confirm predicted odometer:', error);
            Alert.alert('Odometer not updated', error instanceof Error ? error.message : 'Try again.');
        }
    };

    const saveConfirmedOdometer = async (currentMileage: number, dailyAverageKm?: number) => {
        setSavingOdometer(true);
        setOdoError('');
        try {
            await saveVehicleProfile({
                current_mileage: currentMileage,
                ...(dailyAverageKm === undefined ? {} : { daily_average_km: dailyAverageKm }),
                last_odometer_update_timestamp: new Date().toISOString(),
            });
            const data = await getVehicleProfile();
            await syncMaintenanceNotifications(maintenanceReminders);
            setProfile(data);
            setIsOdoModalVisible(false);
        } catch (error) {
            console.error('Failed to update odometer:', error);
            setOdoError(error instanceof Error ? error.message : 'The odometer could not be updated.');
        } finally {
            setSavingOdometer(false);
        }
    };

    const handleSaveOdo = async () => {
        if (!profile) return;
        const parsed = parseWholeNumberInput(newOdoValue, { label: 'Odometer reading' });
        if (!parsed.ok) {
            setOdoError(parsed.message);
            return;
        }

        setSavingOdometer(true);
        let minimum: number;
        try {
            minimum = await getMinimumOdometerReading();
        } catch (error) {
            console.error('Failed to validate odometer:', error);
            setOdoError('The odometer could not be checked. Try again.');
            setSavingOdometer(false);
            return;
        }
        setSavingOdometer(false);

        const validationError = validateOdometerReading(parsed.value, minimum);
        if (validationError) {
            setOdoError(validationError);
            return;
        }

        const val = parsed.value;
        setOdoError('');
            
        // Recalculation logic
        if (diffDays >= 1) {
            const diffFromPredicted = Math.abs(val - computedMileage);
            const threshold = Math.max(10, (profile.daily_average_km ?? 0) * 0.2);
                
            if (diffFromPredicted > threshold) {
                const actualAdded = val - profile.current_mileage;
                const newAverage = Math.max(0, Math.round(actualAdded / diffDays));
                    
                Alert.alert(
                    'Update Daily Average?',
                    `Your actual mileage is different than expected. Since your last check, you've averaged ${newAverage} KM per day.\n\nDo you want to update your daily average to ${newAverage} KM for better future accuracy?`,
                    [
                        {
                            text: 'No, Just Keep ODO',
                            onPress: async () => {
                                await saveConfirmedOdometer(val);
                            }
                        },
                        {
                            text: 'Yes, Update Average',
                            onPress: async () => {
                                await saveConfirmedOdometer(val, newAverage);
                            }
                        }
                    ]
                );
                return; // exit early, let alert handle the save
            }
        }

        await saveConfirmedOdometer(val);
    };

    const loadDashboard = useCallback(async (isCurrent: () => boolean) => {
        const [profileData, events, preferences, historyStates] = await Promise.all([
            getVehicleProfile(),
            getMaintenanceEvents(),
            getMaintenancePreferences(),
            getMaintenanceHistoryStates(),
        ]);
        if (!isCurrent()) return;
        setProfile(profileData);
        const domainProfile = getMaintenanceProfileForSelection(profileData ? {
            brandId: profileData.scooter_brand_id,
            modelId: profileData.scooter_model_id,
            versionId: profileData.scooter_version_id,
            variantId: profileData.scooter_variant_id,
        } : null);
        const schedulerPreferences = maintenancePreferencesForScheduler(preferences);
        const projectedTasks = profileData && domainProfile ? projectMaintenanceTasks({
            profile: domainProfile,
            currentOdometerKm: profileData.current_mileage,
            vehicleId: profileData.id,
            now: new Date(),
            events,
            preferences: schedulerPreferences,
            historyByAction: maintenanceHistoryByAction(historyStates),
            defaultHistoryKnowledge: 'unknown',
            vehicleInServiceDate: profileData.created_at.slice(0, 10),
        }) : [];
        setMaintenanceTasks(projectedTasks.filter((task) => isTaskTracked(task, {
            preferences: schedulerPreferences,
            events,
            vehicleId: profileData?.id,
        })));
    }, []);
    const { error: loadError, loading, reload } = useFocusedLoader(
        loadDashboard,
        'Your vehicle overview could not be loaded. Your records were not changed.',
        'Failed to load dashboard:'
    );

    // ── Predictive Odometer Engine ──
    const dailyAvg = profile?.daily_average_km ?? 0;
    const { mileage: computedMileage, predictedAdded, diffDays } = computePredictedOdometer(profile);
    // Maintenance stays on the confirmed reading until the owner accepts or adjusts the prediction.
    const mileage = profile?.current_mileage ?? 0;
    const hasSelectableMaintenanceProfile = Boolean(getMaintenanceProfileForSelection(profile ? {
        brandId: profile.scooter_brand_id,
        modelId: profile.scooter_model_id,
        versionId: profile.scooter_version_id,
        variantId: profile.scooter_variant_id,
    } : null));
    const setupNeeded = hasSelectableMaintenanceProfile && (
        profile?.maintenance_history_level === undefined
        || profile.maintenance_history_level === 'not_asked'
        || profile.maintenance_history_level === 'skipped'
    );

    // Status logic: if we've added at least 1 KM via prediction, show the verify banner
    const isPredicted = predictedAdded >= 1;

    // Home uses the same projected odometer, task order, and baselines as Maintenance.
    const homePriorities = maintenanceTasks.reduce<{
        group: ReturnType<typeof homeGroup>;
        task: MaintenanceTaskProjection;
    }[]>((items, task) => {
        if (!isHomePriority(task)) return items;
        // The compact setup prompt outranks purely informational upcoming work.
        // Confirmed due work and important unknown fixed changes still stay first.
        if (setupNeeded && task.status === 'upcoming') return items;
        const group = homeGroup(task);
        if (!items.some((item) => item.group.id === group.id)) items.push({ group, task });
        return items;
    }, []).slice(0, 3);
    const nextService = maintenanceTasks.find((task) =>
        task.dueAtKm !== null
        && task.status !== 'historical_unverified'
        && task.status !== 'history_unknown_recommend_service'
        && task.status !== 'history_unknown_request_record'
        && task.status !== 'unknown'
    );
    const remainingToNext = nextService?.remainingKm ?? null;
    const gaugeStartKm = nextService?.lastPerformedAtKm
        ?? (nextService?.isOneTime
            ? 0
            : nextService?.dueAtKm !== null && nextService?.dueAtKm !== undefined && nextService.effectiveIntervalKm
                ? nextService.dueAtKm - nextService.effectiveIntervalKm
                : null);
    const gaugeDistance = nextService?.dueAtKm !== null && nextService?.dueAtKm !== undefined && gaugeStartKm !== null
        ? nextService.dueAtKm - gaugeStartKm
        : null;
    const gaugeProgress = gaugeDistance !== null && gaugeDistance > 0
        ? Math.max(0, Math.min(100, ((mileage - (gaugeStartKm ?? 0)) / gaugeDistance) * 100))
        : 0;
    const gaugePathLength = Math.PI * 80;
    const gaugeOffset = gaugePathLength * (1 - (gaugeProgress / 100));
    const gaugeWidth = Math.min(Math.max(viewportWidth - 48, 0), 520);
    const gaugeHeight = gaugeWidth * 0.54;
    const gaugeColor = nextService?.status === 'overdue' || nextService?.status === 'due'
        ? '#ffb4ab'
        : nextService?.status === 'due_soon'
            ? '#f59e0b'
            : '#a9c7ff';
    const gaugeServiceLabel = !nextService
        ? 'ADD SERVICE HISTORY TO CALIBRATE'
        : (remainingToNext ?? 0) <= 0
            ? `${Math.abs(remainingToNext ?? 0).toLocaleString()} KM OVER - ${homeGroup(nextService).label}`
            : `${(remainingToNext ?? 0).toLocaleString()} KM TO ${homeGroup(nextService).label}`;
    const warningsCount = new Set(maintenanceTasks
        .filter((task) => task.status === 'overdue'
            || task.status === 'due'
            || task.status === 'due_soon'
            || task.status === 'condition_attention')
        .map((task) => homeGroup(task).id)).size;
    const modelProfile = getModelProfileForVehicle(profile);
    const selectedVariant = getSelectedVariant(profile, modelProfile);
    const breakInGuidance = getApplicableBreakInGuidance(profile);
    const breakInLimits = breakInGuidance.flatMap((record) =>
        [...JSON.stringify(record.value).matchAll(/([0-9][0-9,]*)\s*km\b/gi)]
            .map((match) => Number(match[1].replaceAll(',', '')))
            .filter((value) => Number.isFinite(value) && value > 0)
    );
    const breakInLimit = breakInLimits.length > 0 ? Math.max(...breakInLimits) : null;
    const isInBreakIn = breakInLimit !== null && mileage <= breakInLimit;
    if (loading || loadError) {
        return <ScreenLoadState error={loadError} loading={loading} onRetry={reload} title="DASHBOARD" />;
    }

    return (
        <AppScreen>
            <AppTopBar
                leading={
                    <View className="w-8 h-8 rounded-full bg-surface-container-highest border border-outline-variant/30 items-center justify-center">
                        <MaterialIcons name="two-wheeler" size={18} color="#a9c7ff" />
                    </View>
                }
                trailing={<AppIconButton accessibilityLabel="Open vehicle settings" icon="settings" onPress={() => navigation.navigate('VehicleSettings')} />}
            >
                <Text className="font-headline text-2xl font-bold tracking-tighter text-slate-100">3AZZA</Text>
            </AppTopBar>

            {warningsCount > 0 && (
                <TouchableOpacity 
                    className="w-full bg-error/90 px-6 py-3 flex-row items-center justify-between"
                    activeOpacity={0.9}
                    onPress={() => navigation.navigate('Maintenance')}
                >
                    <View className="flex-row items-center gap-3 flex-1 min-w-0 pr-2">
                        <MaterialIcons name="warning" size={20} color="#fff" />
                        <Text className="font-headline font-bold text-white text-sm tracking-wide">
                            {warningsCount} {warningsCount === 1 ? 'Service' : 'Services'} Due
                        </Text>
                    </View>
                    <View className="flex-row items-center flex-shrink-0">
                        <Text className="font-label text-xs text-error-container uppercase font-bold tracking-wider mr-1" numberOfLines={1}>View Schedule</Text>
                        <MaterialIcons name="chevron-right" size={16} color="#ffeceb" />
                    </View>
                </TouchableOpacity>
            )}

            {isPredicted && warningsCount === 0 && (
                <View className="w-full bg-secondary-container px-4 py-3 pb-4">
                    <View className="flex-row items-center gap-2 mb-2">
                        <MaterialCommunityIcons name="auto-fix" size={16} color="#030f1c" />
                        <Text className="font-headline font-bold text-on-secondary-container text-xs">
                            Predicted Mileage: {computedMileage.toLocaleString()} KM
                        </Text>
                    </View>
                    <Text className="font-body text-xs text-on-secondary-container/80 mb-3 ml-6">
                        Automatically updated based on your {dailyAvg} KM daily avg. Is this accurate?
                    </Text>
                    <View className="flex-row gap-2 ml-6">
                        <TouchableOpacity 
                            className="bg-on-secondary-container px-4 py-1.5 rounded-md"
                            onPress={confirmPredictedMileage}
                        >
                            <Text className="font-label text-secondary-container text-xs font-bold uppercase tracking-widest">Yes, Confirm</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            className="bg-secondary-container border border-on-secondary-container/30 px-4 py-1.5 rounded-md"
                            onPress={openOdoModal}
                        >
                            <Text className="font-label text-on-secondary-container text-xs font-bold uppercase tracking-widest">No / Adjust</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }} className="flex-grow">
                <View className="w-full bg-surface-container-lowest border border-primary/20 rounded-xl p-5 mb-5">
                    <Text className="font-label text-xs uppercase tracking-[0.2em] text-primary font-bold">Active scooter</Text>
                    <Text className="font-headline text-xl font-bold text-on-surface mt-1">
                        {modelProfile ? `${modelProfile.brandName} ${modelProfile.modelName}` : 'Scooter not selected'}
                    </Text>
                    <Text className="font-body text-xs text-on-surface-variant mt-1">
                        {modelProfile
                            ? `${selectedVariant?.name ?? (modelProfile.requiresVariant ? 'Exact variant not selected' : modelProfile.manualVersion)} / ${modelProfile.manualYears}`
                            : 'Choose an exact manual in Vehicle Settings.'}
                    </Text>
                    {isInBreakIn ? (
                        <TouchableOpacity
                            accessibilityRole="button"
                            className="bg-tertiary/10 border border-tertiary/25 rounded-lg p-3 mt-4 flex-row items-center gap-3"
                            onPress={() => navigation.navigate('TechSpecs')}
                        >
                            <MaterialCommunityIcons name="engine-outline" size={20} color="#f2ca50" />
                            <View className="flex-1">
                                <Text className="font-label text-xs font-bold text-tertiary uppercase tracking-wider">Break-in guidance active</Text>
                                <Text className="font-body text-xs text-on-surface-variant mt-1">Break-in guidance extends to {breakInLimit?.toLocaleString()} km. Open Model Reference to review it.</Text>
                            </View>
                        </TouchableOpacity>
                    ) : null}
                </View>

                {homePriorities.length > 0 ? (
                    <View className="w-full bg-surface-container-low border border-outline-variant/15 rounded-xl p-5 mb-4">
                        <View className="flex-row items-center justify-between gap-3 mb-2">
                            <Text className="font-label text-xs font-bold text-secondary uppercase tracking-[0.2em]">Maintenance priorities</Text>
                            <TouchableOpacity accessibilityRole="button" className="min-h-11 justify-center" onPress={() => navigation.navigate('Maintenance')}>
                                <Text className="font-label text-xs font-bold text-primary">View plan</Text>
                            </TouchableOpacity>
                        </View>
                        {homePriorities.map(({ group, task }) => (
                            <TouchableOpacity
                                key={`${group.id}:${task.key}`}
                                accessibilityRole="button"
                                className="min-h-14 flex-row items-center gap-3 py-2 border-b border-outline-variant/10 last:border-b-0"
                                onPress={() => group.id === 'engine-oil'
                                    ? navigation.navigate('OilChangeDetails')
                                    : navigation.navigate('Maintenance', { openRuleId: task.ruleId })}
                            >
                                <View className="w-9 h-9 rounded-lg bg-surface-container-high items-center justify-center">
                                    <MaterialIcons name={group.icon} size={18} color="#a9c7ff" />
                                </View>
                                <Text className="font-body text-sm font-semibold text-on-surface flex-1">{naturalMaintenanceActionLabel(task)}</Text>
                                <Text className={`font-label text-xs font-bold text-right ${homePriorityColor(task)}`} numberOfLines={2}>
                                    {homePriorityCopy(task)}
                                </Text>
                                <MaterialIcons name="chevron-right" size={18} color="#8e9196" />
                            </TouchableOpacity>
                        ))}
                    </View>
                ) : null}

                {setupNeeded ? (
                    <TouchableOpacity
                        accessibilityRole="button"
                        className="w-full min-h-20 bg-primary/10 border border-primary/25 rounded-xl p-4 mb-6 flex-row items-center gap-3"
                        onPress={() => navigation.navigate('MaintenanceHistorySetup')}
                    >
                        <MaterialIcons name="playlist-add-check" size={22} color="#a9c7ff" />
                        <View className="flex-1">
                            <Text className="font-headline text-sm font-bold text-on-surface">Finish setting up maintenance history</Text>
                            <Text className="font-body text-xs text-on-surface-variant mt-1">Add only the recent records you know.</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={20} color="#a9c7ff" />
                    </TouchableOpacity>
                ) : null}

                {/* Kinetic Gauge Section */}
                <View className="w-full flex-col items-center mb-8">
                    <View
                        className="relative items-center justify-end"
                        style={{ width: gaugeWidth, height: gaugeHeight }}
                    >
                        <Svg
                            width={gaugeWidth}
                            height={gaugeHeight}
                            viewBox="0 0 200 108"
                            opacity={0.9}
                            style={{ position: 'absolute', top: 0, left: 0 }}
                        >
                            <Path
                                d="M 20 96 A 80 80 0 0 1 180 96"
                                fill="none"
                                stroke="#a9c7ff"
                                strokeWidth="10"
                                strokeLinecap="round"
                                opacity={0.18}
                            />
                            <Path
                                d="M 20 96 A 80 80 0 0 1 180 96"
                                fill="none"
                                stroke={gaugeColor}
                                strokeWidth="10"
                                strokeLinecap="round"
                                strokeDasharray={gaugePathLength}
                                strokeDashoffset={gaugeOffset}
                            />
                        </Svg>
                        <TouchableOpacity
                            className="items-center justify-end pb-1 z-10 px-4"
                            onPress={openOdoModal}
                            activeOpacity={0.7}
                            accessibilityLabel={`Odometer ${mileage.toLocaleString()} kilometres. ${gaugeServiceLabel}. Edit odometer.`}
                            accessibilityRole="button"
                        >
                            <Text
                                className="font-headline text-5xl font-bold tracking-tight text-white leading-none"
                                maxFontSizeMultiplier={1.2}
                                numberOfLines={1}
                            >
                                {mileage.toLocaleString()}
                            </Text>
                            <View className="flex-row items-center gap-1 mt-1">
                                <Text className="font-label text-xs font-extrabold uppercase tracking-[0.2em] text-primary/70">Total ODO KM</Text>
                                <MaterialIcons name="edit" size={10} color="#a9c7ff" style={{ opacity: 0.7 }} />
                            </View>
                        </TouchableOpacity>
                    </View>
                    <Text
                        className="font-label text-[10px] font-bold uppercase tracking-wider text-on-surface-variant text-center mt-2 px-4"
                        numberOfLines={2}
                    >
                        {gaugeServiceLabel}
                    </Text>
                    <View className="w-full h-[1px] bg-outline-variant/20" />
                </View>

                {/* Check & Module Links */}
                <TouchableOpacity 
                    className="w-full bg-[#101c2a] rounded-xl p-6 border border-emerald-500/20 mb-4 flex-row items-center justify-between"
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('PreRideCheck')}
                >
                    <View className="flex-row items-center gap-4 flex-1 min-w-0 pr-2">
                        <View className="w-12 h-12 bg-emerald-500/10 rounded-full items-center justify-center border border-emerald-500/20">
                            <MaterialCommunityIcons name="shield-check" size={24} color="#10b981" />
                        </View>
                        <View className="flex-1 min-w-0">
                            <Text className="font-headline text-lg font-bold text-on-surface">Pre-Ride Check</Text>
                            <Text className="font-body text-xs text-on-surface-variant/80 mt-1">Complete your manual safety checklist</Text>
                        </View>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color="#64748b" style={{ flexShrink: 0 }} />
                </TouchableOpacity>

                <TouchableOpacity 
                    className="w-full bg-surface-container-low rounded-xl p-6 border border-secondary/20 mb-4 flex-row items-center justify-between"
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('VehicleVitals')}
                >
                    <View className="flex-row items-center gap-4 flex-1 min-w-0 pr-2">
                        <View className="w-12 h-12 bg-primary/10 rounded-full items-center justify-center border border-primary/20">
                            <MaterialCommunityIcons name="heart-pulse" size={24} color="#a9c7ff" />
                        </View>
                        <View className="flex-1 min-w-0">
                            <Text className="font-headline text-lg font-bold text-on-surface">Manual Readings</Text>
                            <Text className="font-body text-xs text-on-surface-variant/80 mt-1">Record fluids, tires, battery & brakes</Text>
                        </View>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color="#64748b" style={{ flexShrink: 0 }} />
                </TouchableOpacity>

                <TouchableOpacity 
                    className="w-full bg-[#1c2e40] rounded-xl p-6 border border-primary-fixed/30 mb-8 flex-row items-center justify-between"
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('ServiceLogs')}
                >
                    <View className="flex-row items-center gap-4 flex-1 min-w-0 pr-2">
                        <View className="w-12 h-12 bg-primary-fixed/10 rounded-full items-center justify-center border border-primary-fixed/20">
                            <MaterialIcons name="build" size={24} color="#d6e3ff" />
                        </View>
                        <View className="flex-1 min-w-0">
                            <Text className="font-headline text-lg font-bold text-on-surface">Service Logs</Text>
                            <Text className="font-body text-xs text-on-surface-variant/80 mt-1">Maintenance & servicing history</Text>
                        </View>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color="#64748b" style={{ flexShrink: 0 }} />
                </TouchableOpacity>

                {/* Features Links */}
                <View className="flex-row justify-between mb-8 gap-4">
                    <TouchableOpacity 
                        className="flex-1 bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 justify-between"
                        onPress={() => navigation.navigate('Inventory')}
                    >
                        <MaterialIcons name="inventory-2" size={28} color="#c6c6c6" />
                        <View className="flex-col mt-4">
                            <Text className="font-headline text-sm font-bold text-on-surface">Parts Inventory</Text>
                            <Text className="font-label text-xs uppercase font-extrabold tracking-widest text-[#d7e3f7]/40 mt-1">Manage Stock</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        className="flex-1 bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 justify-between"
                        onPress={() => navigation.navigate('Vault')}
                    >
                        <MaterialIcons name="folder-special" size={28} color="#c6c6c6" />
                        <View className="flex-col mt-4">
                            <Text className="font-headline text-sm font-bold text-on-surface">Documents</Text>
                            <Text className="font-label text-xs uppercase font-extrabold tracking-widest text-[#d7e3f7]/40 mt-1">Local Photos</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                <View className="flex-row justify-between mb-4 gap-4">
                    <TouchableOpacity
                        className="flex-1 bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 justify-between"
                        onPress={() => navigation.navigate('GasLog')}
                    >
                        <MaterialIcons name="local-gas-station" size={28} color="#c6c6c6" />
                        <View className="flex-col mt-4">
                            <Text className="font-headline text-sm font-bold text-on-surface">Fuel Log</Text>
                            <Text className="font-label text-xs uppercase font-extrabold tracking-widest text-[#d7e3f7]/40 mt-1">Track Spend</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        className="flex-1 bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 justify-between"
                        onPress={() => navigation.navigate('Insights')}
                    >
                        <MaterialIcons name="insights" size={28} color="#c6c6c6" />
                        <View className="flex-col mt-4">
                            <Text className="font-headline text-sm font-bold text-on-surface">Insights</Text>
                            <Text className="font-label text-xs uppercase font-extrabold tracking-widest text-[#d7e3f7]/40 mt-1">Record Summary</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                <View className="flex-row justify-between mb-8 gap-4">
                    <TouchableOpacity
                        className="flex-1 bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 justify-between"
                        onPress={() => navigation.navigate('TechSpecs')}
                    >
                        <MaterialIcons name="precision-manufacturing" size={28} color="#c6c6c6" />
                        <View className="flex-col mt-4">
                            <Text className="font-headline text-sm font-bold text-on-surface">Vehicle Reference</Text>
                            <Text className="font-label text-xs uppercase font-extrabold tracking-widest text-[#d7e3f7]/40 mt-1">Specs Not Set</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        className="flex-1 bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 justify-between"
                        onPress={() => navigation.navigate('VehicleSettings')}
                    >
                        <MaterialIcons name="settings" size={28} color="#c6c6c6" />
                        <View className="flex-col mt-4">
                            <Text className="font-headline text-sm font-bold text-on-surface">Settings</Text>
                            <Text className="font-label text-xs uppercase font-extrabold tracking-widest text-[#d7e3f7]/40 mt-1">Backup & Alerts</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            {/* Edit Odo Modal */}
            <ProtectedModal
                accessibilityLabel="Update odometer dialog"
                visible={isOdoModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => !savingOdometer && setIsOdoModalVisible(false)}
            >
                <View className="flex-1 bg-black/80 items-center justify-center px-6">
                    <View className="w-full max-w-xl self-center bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
                        <Text className="font-headline text-xl font-bold text-on-surface mb-2">Update Odometer</Text>
                        <Text className="font-body text-sm text-secondary/80 mb-6">
                            Enter your dashboard&apos;s current reading. This drives the maintenance schedule.
                        </Text>
                        
                        <Text className="font-label text-xs uppercase tracking-widest text-secondary mb-2">Current Mileage (KM)</Text>
                        <TextInput 
                            accessibilityLabel="Current odometer in kilometres"
                            className={`bg-surface-container-highest flex-row items-center px-4 py-3 rounded-xl border text-on-surface font-body text-base ${odoError ? 'border-error mb-2' : 'border-outline-variant/10 mb-6'}`}
                            placeholder="e.g. 15000"
                            placeholderTextColor="#454747"
                            keyboardType="numeric"
                            value={newOdoValue}
                            onChangeText={(value) => {
                                setNewOdoValue(value);
                                setOdoError('');
                            }}
                        />
                        {odoError ? <Text className="font-body text-xs text-error mb-6">{odoError}</Text> : null}

                        <TouchableOpacity
                            accessibilityRole="button"
                            className="min-h-11 justify-center mb-4"
                            disabled={savingOdometer}
                            onPress={() => void openCorrectionModal()}
                        >
                            <Text className="font-label text-sm font-bold text-primary">Correct a previously saved reading</Text>
                        </TouchableOpacity>

                        <View className="flex-row justify-end gap-3">
                            <TouchableOpacity onPress={() => setIsOdoModalVisible(false)} className="px-4 py-2 rounded-lg" disabled={savingOdometer} accessibilityRole="button">
                                <Text className="font-label font-bold text-secondary uppercase tracking-wider">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleSaveOdo} className="px-6 py-2 bg-primary rounded-lg shadow-lg min-w-24 items-center" disabled={savingOdometer} accessibilityLabel="Save odometer" accessibilityRole="button" accessibilityState={{ busy: savingOdometer, disabled: savingOdometer }}>
                                {savingOdometer ? <ActivityIndicator size="small" color="#081421" /> : (
                                    <Text className="font-label font-bold text-on-primary uppercase tracking-wider">Update</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </ProtectedModal>

            <ProtectedModal
                accessibilityLabel="Correct odometer reading dialog"
                visible={isCorrectionModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => !savingCorrection && setIsCorrectionModalVisible(false)}
            >
                <View className="flex-1 bg-black/80 items-center justify-center px-6">
                    <View className="w-full max-w-xl self-center bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
                        <Text className="font-headline text-xl font-bold text-on-surface">Correct odometer</Text>
                        <Text className="font-body text-sm text-on-surface-variant mt-2 leading-5">
                            Use this only to fix a previously saved lifetime reading. Maintenance projections will refresh; saved history stays unchanged.
                        </Text>
                        <Text className="font-body text-xs text-secondary mt-3">
                            Lowest value allowed by saved records: {correctionFloor.toLocaleString()} km
                        </Text>

                        <Text className="font-label text-xs uppercase tracking-widest text-secondary mt-6 mb-2">Corrected odometer (KM)</Text>
                        <TextInput
                            accessibilityLabel="Corrected odometer in kilometres"
                            className={`min-h-12 bg-surface-container-highest px-4 py-3 rounded-xl border text-on-surface font-body text-base ${correctionError ? 'border-error' : 'border-outline-variant/10'}`}
                            keyboardType="number-pad"
                            value={correctionValue}
                            onChangeText={(value) => {
                                setCorrectionValue(value);
                                setCorrectionError('');
                            }}
                        />

                        <Text className="font-label text-xs uppercase tracking-widest text-secondary mt-5 mb-2">Reason</Text>
                        <TextInput
                            accessibilityLabel="Reason for odometer correction"
                            className={`min-h-20 bg-surface-container-highest px-4 py-3 rounded-xl border text-on-surface font-body text-base ${correctionError ? 'border-error' : 'border-outline-variant/10'}`}
                            multiline
                            placeholder="e.g. I entered an extra zero"
                            placeholderTextColor="#64748b"
                            style={{ textAlignVertical: 'top' }}
                            value={correctionReason}
                            onChangeText={(value) => {
                                setCorrectionReason(value);
                                setCorrectionError('');
                            }}
                        />
                        {correctionError ? <Text accessibilityRole="alert" className="font-body text-xs text-error mt-2">{correctionError}</Text> : null}

                        <View className="flex-row justify-end gap-3 mt-6">
                            <TouchableOpacity
                                accessibilityRole="button"
                                className="min-h-11 px-4 items-center justify-center rounded-lg"
                                disabled={savingCorrection}
                                onPress={() => setIsCorrectionModalVisible(false)}
                            >
                                <Text className="font-label font-bold text-secondary uppercase tracking-wider">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                accessibilityRole="button"
                                accessibilityState={{ busy: savingCorrection, disabled: savingCorrection }}
                                className="min-h-11 min-w-32 px-5 bg-primary rounded-lg items-center justify-center"
                                disabled={savingCorrection}
                                onPress={confirmCorrection}
                            >
                                {savingCorrection ? <ActivityIndicator size="small" color="#081421" /> : (
                                    <Text className="font-label font-bold text-on-primary uppercase tracking-wider">Review correction</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </ProtectedModal>
        </AppScreen>
    );
}
