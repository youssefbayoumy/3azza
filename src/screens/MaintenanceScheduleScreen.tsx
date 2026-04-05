import React, { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
    getServiceIntervals, updateServiceInterval, getVehicleProfile,
    addServiceLog, getServiceLogCount, getLatestLogForServiceType
} from '../services/database';
import type { ServiceInterval, VehicleProfile, ServiceLog } from '../types/database.types';
import ServiceHistoryWizard from '../components/ServiceHistoryWizard';

export default function MaintenanceScheduleScreen() {
    const navigation = useNavigation();
    const [intervals, setIntervals] = useState<ServiceInterval[]>([]);
    const [latestLogs, setLatestLogs] = useState<Record<string, ServiceLog | null>>({});
    const [profile, setProfile] = useState<VehicleProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [showWizard, setShowWizard] = useState(false);
    const wizardShownRef = useRef(false); // prevent re-showing after first dismiss this session

    // Edit Modal State
    const [isEditModalVisible, setEditModalVisible] = useState(false);
    const [editingInterval, setEditingInterval] = useState<ServiceInterval | null>(null);
    const [editKmValue, setEditKmValue] = useState('');

    const activeRef = useRef(true); // Guards async setState after unmount/blur

    const loadData = useCallback(async () => {
        activeRef.current = true;
        setLoading(true);
        const [intervalsData, profileData, logCount] = await Promise.all([
            getServiceIntervals(),
            getVehicleProfile(),
            getServiceLogCount(),
        ]);

        if (!activeRef.current) return;
        setIntervals(intervalsData);
        setProfile(profileData);

        // Unified Data Model: fetch the latest log for each interval (enables delete rollback)
        const logsMap: Record<string, ServiceLog | null> = {};
        await Promise.all(
            intervalsData.map(async (ivl) => {
                logsMap[ivl.name] = await getLatestLogForServiceType(ivl.name);
            })
        );

        if (!activeRef.current) return;
        setLatestLogs(logsMap);

        // Wizard trigger: show once per session if no logs exist
        if (logCount === 0 && !wizardShownRef.current) {
            wizardShownRef.current = true;
            setShowWizard(true);
        }

        setLoading(false);
    }, []);

    useFocusEffect(
        useCallback(() => {
            activeRef.current = true;
            loadData();
            return () => { activeRef.current = false; };
        }, [loadData])
    );


    // ── Predictive Odometer Engine ──
    let predictedOdometer = profile?.current_mileage ?? 0;
    if (profile?.last_odometer_update_timestamp && (profile.daily_average_km ?? 0) > 0) {
        const lastUpdate = new Date(profile.last_odometer_update_timestamp).getTime();
        const diffDays = (Date.now() - lastUpdate) / (1000 * 60 * 60 * 24);
        if (diffDays > 0) {
            predictedOdometer += Math.floor(diffDays * profile.daily_average_km);
        }
    }

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
                        await updateServiceInterval(item.id, {
                            last_service_odometer_km: predictedOdometer
                        });
                        await addServiceLog({
                            title: item.name,
                            date: new Date().toISOString().split('T')[0],
                            mileage: predictedOdometer,
                            category: item.type === 'replace' ? 'engine' : item.type === 'clean' ? 'general' : 'brakes',
                            notes: 'Auto-logged from Maintenance Schedule',
                            cost: null,
                            service_type: item.name, // Smart-Link metadata
                        });
                        loadData();
                    }
                }
            ]
        );
    };

    const handleSaveEdit = async () => {
        if (!editingInterval) return;
        const newInterval = editKmValue.trim() === '' ? null : parseInt(editKmValue, 10);
        await updateServiceInterval(editingInterval.id, { interval_km: newInterval });
        setEditModalVisible(false);
        loadData();
    };

    const openEditModal = (item: ServiceInterval) => {
        setEditingInterval(item);
        setEditKmValue(item.interval_km !== null ? String(item.interval_km) : '');
        setEditModalVisible(true);
    };

    /**
     * Unified Data Model: resolves the effective last_service_odometer_km for an interval.
     * Priority: latest log entry's mileage > interval's own stored value.
     * This means deleting a log automatically "rolls back" the counter to the previous one.
     */
    const getEffectiveLastKm = (item: ServiceInterval): number => {
        const latestLog = latestLogs[item.name];
        return latestLog ? latestLog.mileage : item.last_service_odometer_km;
    };

    const getStatusInfo = (item: ServiceInterval, currentMileage: number) => {
        if (item.interval_km === null) {
            return {
                status: 'Not Fixed',
                color: 'text-secondary',
                bgColor: 'bg-secondary/10',
                borderColor: 'border-secondary/30',
                progress: 100,
                remainingLabel: 'Manual Check',
                icon: 'cleaning-services',
                lastKm: getEffectiveLastKm(item),
            };
        }

        const effectiveLastKm = getEffectiveLastKm(item);
        const target = effectiveLastKm + item.interval_km;
        const remaining = target - currentMileage;
        let progress = Math.max(0, Math.min(100, ((item.interval_km - remaining) / item.interval_km) * 100));

        if (remaining <= 0) {
            return {
                status: 'OVERDUE',
                color: 'text-error',
                bgColor: 'bg-error/10',
                borderColor: 'border-error',
                progress: 100,
                remainingLabel: `${Math.abs(remaining).toLocaleString()} KM Over`,
                icon: 'warning',
                lastKm: effectiveLastKm,
            };
        } else if (remaining <= item.interval_km * 0.1 || remaining <= 200) {
            return {
                status: 'DUE SOON',
                color: 'text-amber-500',
                bgColor: 'bg-amber-500/10',
                borderColor: 'border-amber-500',
                progress,
                remainingLabel: `${remaining.toLocaleString()} KM Left`,
                icon: 'schedule',
                lastKm: effectiveLastKm,
            };
        } else {
            return {
                status: 'OPTIMAL',
                color: 'text-emerald-500',
                bgColor: 'bg-surface-container-high',
                borderColor: 'border-emerald-500/30',
                progress,
                remainingLabel: `${remaining.toLocaleString()} KM Left`,
                icon: item.type === 'replace' ? 'autorenew' : 'fact-check',
                lastKm: effectiveLastKm,
            };
        }
    };

    if (loading || !profile) {
        return (
            <View className="flex-1 bg-background items-center justify-center">
                <ActivityIndicator size="large" color="#a9c7ff" />
            </View>
        );
    }

    return (
       <View className="flex-1 bg-background pt-12">
    {/* History Catch-up Wizard wrapped in a Modal */}
    <Modal 
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
          loadData();
        }}
      />
    </Modal>
            {/* Top AppBar */}
            <View className="flex-row items-center justify-between px-6 h-16 w-full border-b border-[#C0C0C0]/10 bg-[#081421] z-50">
                <View className="flex-row items-center gap-4">
                    <TouchableOpacity className="p-2" onPress={() => navigation.goBack()}>
                        <MaterialIcons name="arrow-back" size={24} color="#a9c7ff" />
                    </TouchableOpacity>
                    <Text className="font-headline uppercase tracking-widest text-sm font-bold text-[#C0C0C0]">MAINTENANCE SCHEDULE</Text>
                </View>
            </View>

            <ScrollView className="flex-1 px-4 pt-6 pb-20">
                <View className="mb-6 px-2">
                    <Text className="font-label text-[10px] tracking-[0.2em] text-secondary/60 uppercase">Dynamic Intervals</Text>
                    <Text className="font-headline text-2xl font-bold text-on-surface tracking-tight mt-1 mb-2">Service Planner</Text>
                    <Text className="text-sm font-body text-secondary/80">Current Odometer: <Text className="font-bold text-primary">{predictedOdometer.toLocaleString()} KM</Text> {predictedOdometer !== profile.current_mileage ? '(Predicted)' : ''}</Text>
                </View>

                <View className="space-y-4 mb-20">
                    {intervals.map((item) => {
                        const statusInfo = getStatusInfo(item, predictedOdometer);
                        const latestLog = latestLogs[item.name];
                        return (
                            <View key={item.id} className={`bg-surface-container-lowest border-l-4 ${statusInfo.borderColor} rounded-xl p-5 mb-4 shadow-sm`}>
                                <View className="flex-row justify-between items-start mb-4">
                                    <View className="flex-row items-center gap-3">
                                        <View className={`w-10 h-10 rounded-lg items-center justify-center ${statusInfo.bgColor}`}>
                                            <MaterialIcons name={statusInfo.icon as any} size={20} className={statusInfo.color} />
                                        </View>
                                        <View>
                                            <Text className="font-headline text-lg font-bold text-on-surface">{item.name}</Text>
                                            <Text className="font-label text-[10px] uppercase text-secondary/60 tracking-widest">
                                                Every {item.interval_km ? `${item.interval_km.toLocaleString()} KM` : 'As Needed'}
                                            </Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity onPress={() => openEditModal(item)} className="p-2">
                                        <MaterialIcons name="edit" size={18} color="#8e9196" />
                                    </TouchableOpacity>
                                </View>

                                {/* Last performed — driven by Unified Data Model */}
                                {latestLog && (
                                    <View className="flex-row items-center gap-1.5 mb-3 -mt-2">
                                        <MaterialIcons name="history" size={12} color="#a9c7ff" />
                                        <Text className="font-label text-[10px] text-primary/70 uppercase tracking-widest">
                                            Last: {latestLog.mileage.toLocaleString()} KM · {latestLog.date}
                                        </Text>
                                    </View>
                                )}

                                {/* Progress Bar */}
                                {item.interval_km !== null && (
                                    <View className="mb-4">
                                        <View className="flex-row justify-between mb-1.5">
                                            <Text className={`font-label text-[10px] font-bold tracking-widest ${statusInfo.color}`}>
                                                {statusInfo.status}
                                            </Text>
                                            <Text className="font-headline text-xs font-bold text-secondary">
                                                {statusInfo.remainingLabel}
                                            </Text>
                                        </View>
                                        <View className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                                            <View
                                                className={`h-full rounded-full ${statusInfo.color.replace('text-', 'bg-')}`}
                                                style={{ width: `${statusInfo.progress}%` }}
                                            />
                                        </View>
                                    </View>
                                )}

                                {/* Action */}
                                <TouchableOpacity
                                    className="w-full py-3 rounded-lg flex-row items-center justify-center gap-2 border border-outline-variant/20 bg-surface-container-high"
                                    onPress={() => handleLogAsDone(item)}
                                >
                                    <MaterialIcons name="check-circle-outline" size={18} color="#a9c7ff" />
                                    <Text className="font-label font-bold text-primary uppercase text-[10px] tracking-widest">Log as Completed</Text>
                                </TouchableOpacity>
                            </View>
                        );
                    })}
                </View>
            </ScrollView>

            {/* Edit Modal */}
            <Modal visible={isEditModalVisible} transparent={true} animationType="fade">
                <View className="flex-1 bg-black/80 items-center justify-center px-6">
                    <View className="w-full bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
                        <Text className="font-headline text-xl font-bold text-on-surface mb-2">Edit Interval</Text>
                        <Text className="font-body text-sm text-secondary/80 mb-6">
                            Change the frequency for {editingInterval?.name}. Leave empty for manual tracking.
                        </Text>
                        <Text className="font-label text-[10px] uppercase tracking-widest text-secondary mb-2">Interval (KM)</Text>
                        <TextInput
                            className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base mb-6"
                            placeholder="e.g. 1000"
                            placeholderTextColor="#454747"
                            keyboardType="numeric"
                            value={editKmValue}
                            onChangeText={setEditKmValue}
                        />
                        <View className="flex-row justify-end gap-3">
                            <TouchableOpacity onPress={() => setEditModalVisible(false)} className="px-4 py-2 rounded-lg">
                                <Text className="font-label font-bold text-secondary uppercase tracking-wider">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleSaveEdit} className="px-6 py-2 bg-primary rounded-lg shadow-lg">
                                <Text className="font-label font-bold text-on-primary uppercase tracking-wider">Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
