import React, { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
    getServiceIntervals, updateServiceInterval, getVehicleProfile,
    recordServiceCompletion, getLatestLogForServiceType
} from '../services/database';
import type { ServiceInterval, VehicleProfile, ServiceLog } from '../types/database.types';
import ServiceHistoryWizard from '../components/ServiceHistoryWizard';
import type { VitalsNavigationProp } from '../navigation/types';
import { syncMaintenanceNotifications } from '../services/notifications';
import { useAppStore } from '../store/useAppStore';
import { computePredictedOdometer, getIntervalProgress } from '../utils/maintenance';
import ProtectedModal from '../components/ProtectedModal';
import AppIconButton from '../components/ui/AppIconButton';
import AppTopBar from '../components/ui/AppTopBar';
import AppScreen from '../components/ui/AppScreen';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';
import { formatScooterSelection, selectionFromProfile } from '../catalog/scooterCatalog';
import SourceProvenance from '../components/SourceProvenance';
import { getModelProfileForVehicle } from '../modelData/modelKnowledge';
import { getMaintenanceDueResult } from '../utils/maintenanceDue';

export default function MaintenanceScheduleScreen() {
    const navigation = useNavigation<VitalsNavigationProp>();
    const maintenanceReminders = useAppStore((state) => state.maintenanceReminders);
    const [intervals, setIntervals] = useState<ServiceInterval[]>([]);
    const [latestLogs, setLatestLogs] = useState<Record<string, ServiceLog | null>>({});
    const [profile, setProfile] = useState<VehicleProfile | null>(null);
    const [showWizard, setShowWizard] = useState(false);
    const wizardPresentedForVehiclesRef = useRef(new Set<number>());

    // Edit Modal State
    const [isEditModalVisible, setEditModalVisible] = useState(false);
    const [editingInterval, setEditingInterval] = useState<ServiceInterval | null>(null);
    const [editKmValue, setEditKmValue] = useState('');

    const loadData = useCallback(async (isCurrent: () => boolean) => {
        const [intervalsData, profileData] = await Promise.all([
            getServiceIntervals(),
            getVehicleProfile(),
        ]);

        // Unified Data Model: fetch the latest log for each interval (enables delete rollback)
        const logsMap: Record<string, ServiceLog | null> = {};
        await Promise.all(
            intervalsData.map(async (ivl) => {
                logsMap[ivl.name] = await getLatestLogForServiceType(ivl.name);
            })
        );

        if (!isCurrent()) return;
        setIntervals(intervalsData);
        setProfile(profileData);
        setLatestLogs(logsMap);

        if (
            profileData
            && profileData.service_history_setup_completed === 0
            && !wizardPresentedForVehiclesRef.current.has(profileData.id)
        ) {
            wizardPresentedForVehiclesRef.current.add(profileData.id);
            setShowWizard(true);
        } else if (profileData?.service_history_setup_completed === 1) {
            setShowWizard(false);
        }
    }, []);

    const { error: loadError, loading, reload } = useFocusedLoader(
        loadData,
        'The maintenance schedule could not be loaded. Your service records were not changed.',
        'Failed to load maintenance schedule:'
    );

    const refreshDataAndNotifications = useCallback(async () => {
        await reload();
        await syncMaintenanceNotifications(maintenanceReminders);
    }, [maintenanceReminders, reload]);


    // ── Predictive Odometer Engine ──
    const predictedOdometer = computePredictedOdometer(profile).mileage;

    const handleLogAsDone = async (item: ServiceInterval) => {
        if (!profile) return;

        Alert.alert(
            'Log Service',
            `Mark "${item.name}" as completed at ${predictedOdometer.toLocaleString()} KM?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Confirm',
                    onPress: async () => {
                        try {
                            await recordServiceCompletion({
                                title: item.name,
                                date: new Date().toISOString().split('T')[0],
                                mileage: predictedOdometer,
                                category: item.type === 'replace' ? 'engine' : item.type === 'clean' ? 'general' : 'brakes',
                                notes: 'Logged from Maintenance Schedule',
                                cost: null,
                                serviceIntervalId: item.id,
                            });
                            await refreshDataAndNotifications();
                        } catch (error) {
                            console.error('Failed to record service completion:', error);
                            Alert.alert('Save failed', 'The service and interval were not changed. Try again.');
                        }
                    }
                }
            ]
        );
    };

    const handleSaveEdit = async () => {
        if (!editingInterval) return;
        const input = editKmValue.trim();
        if (input !== '' && !/^\d+$/.test(input)) {
            Alert.alert('Invalid interval', 'Enter a positive whole number of kilometres, or leave it empty for manual tracking.');
            return;
        }

        const newInterval = input === '' ? null : Number(input);
        if (newInterval !== null && (!Number.isSafeInteger(newInterval) || newInterval <= 0)) {
            Alert.alert('Invalid interval', 'Enter a positive whole number of kilometres, or leave it empty for manual tracking.');
            return;
        }

        try {
            await updateServiceInterval(editingInterval.id, { interval_km: newInterval });
            setEditModalVisible(false);
            await refreshDataAndNotifications();
        } catch (error) {
            console.error('Failed to update maintenance interval:', error);
            Alert.alert('Save failed', 'The maintenance interval was not changed. Try again.');
        }
    };

    const openEditModal = (item: ServiceInterval) => {
        setEditingInterval(item);
        setEditKmValue(item.interval_km !== null ? String(item.interval_km) : '');
        setEditModalVisible(true);
    };

    const getStatusInfo = (item: ServiceInterval, currentMileage: number, latestLog: ServiceLog | null) => {
        const dueResult = getMaintenanceDueResult({
            currentMileage,
            intervalKm: item.interval_km,
            intervalMonths: item.recommended_interval_months ?? null,
            lastServiceMileage: item.last_service_odometer_km,
            hasKnownMileageBaseline: item.has_known_odometer_baseline === 1,
            lastServiceDate: latestLog?.date ?? item.last_service_date ?? null,
        });
        const intervalProgress = getIntervalProgress(item, currentMileage);

        if (intervalProgress.status === 'manual') {
            return {
                status: 'Not Fixed',
                color: 'text-secondary',
                bgColor: 'bg-secondary/10',
                borderColor: 'border-secondary/30',
                progress: 100,
                progressColor: '#8e9196',
                remainingLabel: 'Manual Check',
                icon: 'cleaning-services',
                dueReason: dueResult.reason,
            };
        }

        if (intervalProgress.status === 'unknown') {
            return {
                status: 'NOT LOGGED YET',
                color: 'text-secondary',
                bgColor: 'bg-secondary/10',
                borderColor: 'border-secondary/30',
                progress: 0,
                progressColor: '#8e9196',
                remainingLabel: 'Log it',
                icon: 'add-circle-outline',
                dueReason: dueResult.reason,
            };
        }

        const remaining = intervalProgress.remainingKm ?? 0;

        if (intervalProgress.status === 'overdue' || dueResult.isDue) {
            return {
                status: 'OVERDUE',
                color: 'text-error',
                bgColor: 'bg-error/10',
                borderColor: 'border-error',
                progress: intervalProgress.progressPct,
                progressColor: '#ffb4ab',
                remainingLabel: `${Math.abs(remaining).toLocaleString()} KM Over`,
                icon: 'warning',
                dueReason: dueResult.reason,
            };
        } else if (intervalProgress.status === 'due-soon') {
            return {
                status: 'DUE SOON',
                color: 'text-amber-500',
                bgColor: 'bg-amber-500/10',
                borderColor: 'border-amber-500',
                progress: intervalProgress.progressPct,
                progressColor: '#f59e0b',
                remainingLabel: `${remaining.toLocaleString()} KM Left`,
                icon: 'schedule',
                dueReason: dueResult.reason,
            };
        } else {
            return {
                status: 'ON SCHEDULE',
                color: 'text-emerald-500',
                bgColor: 'bg-surface-container-high',
                borderColor: 'border-emerald-500/30',
                progress: intervalProgress.progressPct,
                progressColor: '#10b981',
                remainingLabel: `${remaining.toLocaleString()} KM Left`,
                icon: item.type === 'replace' ? 'autorenew' : 'fact-check',
                dueReason: dueResult.reason,
            };
        }
    };

    if (loading || loadError || !profile) {
        return <ScreenLoadState error={loadError ?? (!loading ? 'The active vehicle is unavailable.' : null)} loading={loading} onRetry={reload} title="MAINTENANCE" />;
    }
    const scooterSelection = selectionFromProfile(profile);
    const modelProfile = getModelProfileForVehicle(profile);

    return (
       <AppScreen>
    {/* History Catch-up Wizard wrapped in a Modal */}
    <ProtectedModal
      accessibilityLabel="Service history setup dialog"
      visible={showWizard} 
      animationType="slide" 
      transparent={false}
      onRequestClose={() => setShowWizard(false)}
    >
      <ServiceHistoryWizard
        visible={showWizard}
        intervals={intervals}
        currentOdometer={predictedOdometer}
        onFinish={() => {
          setShowWizard(false);
          void refreshDataAndNotifications();
        }}
      />
    </ProtectedModal>
            <AppTopBar tone="subtle" className="z-50" leading={<AppIconButton accessibilityLabel="Go back" icon="arrow-back" onPress={() => navigation.goBack()} />}>
                <Text className="font-headline uppercase tracking-widest text-sm font-bold text-[#C0C0C0]">MAINTENANCE SCHEDULE</Text>
            </AppTopBar>

            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 24 }}
            >
                <View className="mb-6 px-2">
                    <Text className="font-label text-xs tracking-[0.2em] text-muted uppercase">Editable Intervals</Text>
                    <Text className="font-headline text-2xl font-bold text-on-surface tracking-tight mt-1 mb-2">Service Planner</Text>
                    <Text className="font-body text-xs text-on-surface-variant mb-2">
                        {scooterSelection ? formatScooterSelection(scooterSelection) : 'Scooter selection required'}
                    </Text>
                    <Text className="text-sm font-body text-secondary/80">Current Odometer: <Text className="font-bold text-primary">{predictedOdometer.toLocaleString()} KM</Text> {predictedOdometer !== profile.current_mileage ? '(Predicted)' : ''}</Text>
                </View>

                <View className="mx-2 mb-6 p-4 rounded-xl bg-primary/10 border border-primary/20 flex-row gap-3">
                    <MaterialIcons name="info-outline" size={20} color="#a9c7ff" />
                    <Text className="font-body text-xs text-on-surface-variant leading-5 flex-1">
                        Tasks come only from the selected owner manual. The recurring engine-oil recommendation is the approved 3azza 1,000 km policy; your edits remain separate user overrides. Missing history stays Not set.
                    </Text>
                </View>

                <View className="space-y-4 mb-20">
                    {intervals.map((item) => {
                        const latestLog = latestLogs[item.name];
                        const statusInfo = getStatusInfo(item, predictedOdometer, latestLog);
                        const pages = item.source_pages_json ? JSON.parse(item.source_pages_json) as number[] : [];
                        const initialMilestones = item.initial_milestones_json ? JSON.parse(item.initial_milestones_json) as number[] : [];
                        const origin = item.recommendation_origin === 'user_override'
                            ? 'user_override'
                            : item.recommendation_origin === '3azza_policy'
                                ? '3azza_policy'
                                : 'manual';
                        return (
                            <View key={item.id} className={`bg-surface-container-lowest border-l-4 ${statusInfo.borderColor} rounded-xl p-5 mb-4 shadow-sm`}>
                                <View className="flex-row justify-between items-start mb-4">
                                    <View className="flex-row items-center gap-3 flex-1 min-w-0 pr-2">
                                        <View className={`w-10 h-10 rounded-lg items-center justify-center ${statusInfo.bgColor}`}>
                                            <MaterialIcons name={statusInfo.icon as any} size={20} className={statusInfo.color} />
                                        </View>
                                        <View className="flex-1 min-w-0">
                                            <Text className="font-headline text-lg font-bold text-on-surface">{item.name}</Text>
                                            <Text className="font-label text-xs uppercase text-muted tracking-widest">
                                                {item.interval_km ? `Every ${item.interval_km.toLocaleString()} KM` : 'Manual / no fixed distance'}
                                                {item.recommended_interval_months ? ` · or ${item.recommended_interval_months} month${item.recommended_interval_months === 1 ? '' : 's'}` : ''}
                                            </Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity onPress={() => openEditModal(item)} className="p-2 flex-shrink-0" accessibilityLabel={`Edit ${item.name} interval`} accessibilityRole="button">
                                        <MaterialIcons name="edit" size={18} color="#8e9196" />
                                    </TouchableOpacity>
                                </View>

                                {/* Last performed — driven by Unified Data Model */}
                                {latestLog && (
                                    <View className="flex-row items-start gap-1.5 mb-3 -mt-2">
                                        <MaterialIcons name="history" size={12} color="#a9c7ff" />
                                        <Text className="font-label text-xs text-primary/70 uppercase tracking-widest flex-1">
                                            Last: {latestLog.sets_odometer_baseline === 1
                                                ? `${latestLog.mileage.toLocaleString()} KM · ${latestLog.date}`
                                                : `${latestLog.date} · Date only`}
                                        </Text>
                                    </View>
                                )}

                                <Text className={`font-body text-xs leading-5 mb-3 ${statusInfo.status === 'OVERDUE' ? 'text-error' : 'text-on-surface-variant'}`}>
                                    {statusInfo.dueReason}
                                </Text>

                                {initialMilestones.length > 0 ? (
                                    <View className="bg-tertiary/10 border border-tertiary/25 rounded-lg p-3 mb-3">
                                        <Text className="font-label text-xs font-bold text-tertiary uppercase tracking-wider">Initial service retained</Text>
                                        <Text className="font-body text-xs text-on-surface-variant mt-1">
                                            Manual milestone{initialMilestones.length === 1 ? '' : 's'}: {initialMilestones.map((value) => `${value.toLocaleString()} km`).join(', ')}. These are not postponed by a recurring interval.
                                        </Text>
                                    </View>
                                ) : null}

                                {item.severe_use_note ? (
                                    <Text className="font-body text-xs text-on-surface-variant leading-5 mb-3">Severe use: {item.severe_use_note}</Text>
                                ) : null}

                                {/* Progress Bar */}
                                {item.interval_km !== null && (
                                    <View className="mb-4">
                                        <View className="flex-row justify-between mb-1.5">
                                            <Text className={`font-label text-xs font-bold tracking-widest ${statusInfo.color}`}>
                                                {statusInfo.status}
                                            </Text>
                                            <Text className="font-headline text-xs font-bold text-secondary">
                                                {statusInfo.remainingLabel}
                                            </Text>
                                        </View>
                                        <View
                                            className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden"
                                            accessible
                                            accessibilityLabel={`${item.name} service interval progress`}
                                            accessibilityRole="progressbar"
                                            accessibilityValue={{ min: 0, max: 100, now: Math.round(statusInfo.progress) }}
                                        >
                                            <View
                                                className="h-full rounded-full"
                                                style={{
                                                    backgroundColor: statusInfo.progressColor,
                                                    width: `${statusInfo.progress}%`,
                                                }}
                                            />
                                        </View>
                                    </View>
                                )}

                                {/* Action */}
                                <View className="flex-row gap-3">
                                    <TouchableOpacity
                                        className="flex-1 py-3 rounded-lg flex-row items-center justify-center gap-2 border border-outline-variant/20 bg-surface-container-high"
                                        onPress={() => handleLogAsDone(item)}
                                    >
                                        <MaterialIcons name="check-circle-outline" size={18} color="#a9c7ff" />
                                        <Text className="font-label font-bold text-primary uppercase text-xs tracking-widest">Log as Completed</Text>
                                    </TouchableOpacity>
                                    {item.canonical_task_id === 'engine-oil' && (
                                        <TouchableOpacity
                                            className="px-4 py-3 rounded-lg flex-row items-center justify-center gap-2 border border-primary/25 bg-primary/10"
                                            onPress={() => navigation.navigate('OilChangeDetails')}
                                        >
                                            <MaterialIcons name="menu-book" size={18} color="#a9c7ff" />
                                            <Text className="font-label font-bold text-primary uppercase text-xs tracking-widest">Guide</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                {modelProfile ? <SourceProvenance origin={origin} pages={pages} profile={modelProfile} /> : null}
                            </View>
                        );
                    })}
                </View>
            </ScrollView>

            {/* Edit Modal */}
            <ProtectedModal
                accessibilityLabel="Edit maintenance interval dialog"
                visible={isEditModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setEditModalVisible(false)}
            >
                <View className="flex-1 bg-black/80 items-center justify-center px-6">
                    <View className="w-full max-w-xl self-center bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
                        <Text className="font-headline text-xl font-bold text-on-surface mb-2">Edit Interval</Text>
                        <Text className="font-body text-sm text-secondary/80 mb-6">
                            Set the planning interval for {editingInterval?.name} from your vehicle manual. Leave empty for manual tracking.
                        </Text>
                        <Text className="font-label text-xs uppercase tracking-widest text-secondary mb-2">Interval (KM)</Text>
                        <TextInput
                            accessibilityLabel="Service interval in kilometres"
                            className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base mb-6"
                            placeholder="e.g. 1000"
                            placeholderTextColor="#454747"
                            keyboardType="numeric"
                            value={editKmValue}
                            onChangeText={setEditKmValue}
                        />
                        <View className="flex-row justify-end gap-3">
                            <TouchableOpacity onPress={() => setEditModalVisible(false)} className="px-4 py-2 rounded-lg" accessibilityRole="button">
                                <Text className="font-label font-bold text-secondary uppercase tracking-wider">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleSaveEdit} className="px-6 py-2 bg-primary rounded-lg shadow-lg" accessibilityLabel="Save service interval" accessibilityRole="button">
                                <Text className="font-label font-bold text-on-primary uppercase tracking-wider">Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </ProtectedModal>
        </AppScreen>
    );
}
