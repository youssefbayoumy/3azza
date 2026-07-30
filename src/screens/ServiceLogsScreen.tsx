import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getServiceIntervals, getServiceLogMaxMileage, getServiceLogs, recordServiceCompletion, deleteServiceLogAndRecomputeBaseline } from '../services/database';
import type { ServiceInterval, ServiceLog } from '../types/database.types';
import type { ServiceLogsNavigationProp } from '../navigation/types';
import { syncMaintenanceNotifications } from '../services/notifications';
import { useAppStore } from '../store/useAppStore';
import ProtectedModal from '../components/ProtectedModal';
import ActiveVehicleChip from '../components/ActiveVehicleChip';
import AppIconButton from '../components/ui/AppIconButton';
import AppTopBar from '../components/ui/AppTopBar';
import AppScreen from '../components/ui/AppScreen';
import AppListContinuation from '../components/ui/AppListContinuation';
import useIncrementalRecordLimit from '../hooks/useIncrementalRecordLimit';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';
import { isPastOrTodayIsoDate } from '../utils/dates';
import { parseDecimalNumberInput, parseWholeNumberInput } from '../utils/recordValidation';

// Tracked labels come from the active vehicle's interval rows and resolve by canonical ID.
const OTHER_CATEGORIES = ['Electrical', 'Repair', 'Bodywork', 'General', 'Tires'] as const;

export default function ServiceLogsScreen() {
    const navigation = useNavigation<ServiceLogsNavigationProp>();
    const maintenanceReminders = useAppStore((state) => state.maintenanceReminders);
    const [logs, setLogs] = useState<ServiceLog[]>([]);
    const [lastServiceMileage, setLastServiceMileage] = useState(0);
    const { canLoadOlder, limit, loadOlder } = useIncrementalRecordLimit(logs.length);
    const [intervals, setIntervals] = useState<ServiceInterval[]>([]);
    const [isAddModalVisible, setAddModalVisible] = useState(false);

    // Form State
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [mileage, setMileage] = useState('');
    const [serviceType, setServiceType] = useState<string | null>(null); // Tracked interval name, if selected
    const [otherCategory, setOtherCategory] = useState<string | null>(null); // Non-tracked category
    const [notes, setNotes] = useState('');
    const [cost, setCost] = useState('');

    const isTracked = serviceType !== null;

    const loadLogs = useCallback(async (isCurrent: () => boolean) => {
        const [data, intervalData, maxMileage] = await Promise.all([
            getServiceLogs({ limit }),
            getServiceIntervals(),
            getServiceLogMaxMileage(),
        ]);
        if (!isCurrent()) return;
        setLogs(data);
        setIntervals(intervalData);
        setLastServiceMileage(maxMileage);
    }, [limit]);

    const { error: loadError, loading, reload } = useFocusedLoader(
        loadLogs,
        'Service history could not be loaded. Your maintenance records were not changed.',
        'Failed to load service logs:'
    );

    const resetForm = () => {
        setTitle('');
        setDate(new Date().toISOString().split('T')[0]);
        setMileage('');
        setServiceType(null);
        setOtherCategory(null);
        setNotes('');
        setCost('');
    };

    const handleAddSubmit = async () => {
        const category = serviceType ? serviceType.toLowerCase() : (otherCategory ?? 'general').toLowerCase();
        if (!title.trim() || !date.trim() || !mileage.trim() || (!serviceType && !otherCategory)) {
            Alert.alert('Missing Fields', 'Please fill in all required fields and select a service type.');
            return;
        }

        const mileageResult = parseWholeNumberInput(mileage, { label: 'Service odometer' });
        if (!mileageResult.ok) {
            Alert.alert('Invalid service details', mileageResult.message);
            return;
        }
        if (!isPastOrTodayIsoDate(date)) {
            Alert.alert('Invalid service details', 'Enter a valid service date on or before today (YYYY-MM-DD).');
            return;
        }

        const costResult = cost.trim() === ''
            ? null
            : parseDecimalNumberInput(cost, { label: 'Service cost' });
        if (costResult && !costResult.ok) {
            Alert.alert('Invalid service details', costResult.message);
            return;
        }
        const km = mileageResult.value;
        const recordedCost = costResult?.value ?? null;

        const trackedInterval = serviceType
            ? intervals.find((interval) => interval.name === serviceType)
            : null;
        if (serviceType && !trackedInterval) {
            Alert.alert('Unavailable service type', 'The selected interval is not available for the active vehicle. Reopen this screen and try again.');
            return;
        }

        try {
            await recordServiceCompletion({
                title: title.trim(),
                date,
                mileage: km,
                category,
                notes: notes.trim(),
                cost: recordedCost,
                serviceIntervalId: trackedInterval?.id ?? null,
            });
            setAddModalVisible(false);
            resetForm();
            await reload();
            await syncMaintenanceNotifications(maintenanceReminders);
        } catch (error) {
            Alert.alert(
                'Service log not saved',
                error instanceof Error ? error.message : 'The service log and maintenance interval were not changed.'
            );
        }
    };

    const handleDelete = (log: ServiceLog) => {
        const deleteMessage = log.service_type
            ? `Remove this "${log.title}" entry? The linked service interval will automatically roll back to its previous log entry.`
            : `Remove this "${log.title}" entry? This custom log is not linked to a maintenance interval.`;

        Alert.alert(
            'Delete Log',
            deleteMessage,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteServiceLogAndRecomputeBaseline(log.id);
                            await reload();
                            await syncMaintenanceNotifications(maintenanceReminders);
                        } catch (error) {
                            console.error('Failed to delete service log:', error);
                            Alert.alert(
                                'Delete failed',
                                log.service_type
                                    ? 'The service log and linked interval were not changed.'
                                    : 'The custom service log was not deleted.'
                            );
                        }
                    }
                }
            ]
        );
    };

    const getIconForCategory = (cat: string) => {
        switch (cat.toLowerCase()) {
            case 'oil change': case 'engine': return 'oil-barrel';
            case 'gearbox oil change': return 'settings';
            case 'filter': case 'air filter': return 'filter';
            case 'tires': case 'wheels': return 'tire-repair';
            case 'brakes': case 'brake pads': return 'emergency';
            case 'electrical': return 'battery-charging-full';
            default: return 'build-circle';
        }
    };

    if (loading || loadError) {
        return <ScreenLoadState error={loadError} loading={loading} onBack={() => navigation.goBack()} onRetry={reload} title="SERVICE LOGS" />;
    }

    return (
        <AppScreen edges={['top', 'bottom', 'left', 'right']}>
            <AppTopBar tone="subtle" className="z-50" leading={<AppIconButton accessibilityLabel="Go back" icon="arrow-back" onPress={() => navigation.goBack()} />}>
                <Text className="font-headline uppercase tracking-widest text-sm font-bold text-[#C0C0C0]" numberOfLines={1}>SERVICE LOGS</Text>
            </AppTopBar>

            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 32 }}
            >
                {/* Header */}
                <View className="mb-8">
                    <ActiveVehicleChip />
                    <View className="flex-row items-end justify-between">
                        <View>
                            <Text className="font-label text-xs tracking-[0.2em] text-secondary/60 uppercase">Maintenance Logs</Text>
                            <Text className="font-headline text-4xl font-bold text-on-surface tracking-tight mt-1 uppercase">History</Text>
                        </View>
                        <View className="items-end">
                            <Text className="font-headline text-2xl font-bold text-primary tracking-tighter italic shadow-[0_0_12px_rgba(169,199,255,0.4)]">{lastServiceMileage} KM</Text>
                            <Text className="font-label text-xs uppercase text-secondary/50 tracking-widest">Last Service</Text>
                        </View>
                    </View>
                    <View className="h-[1px] w-full bg-secondary/20 mt-4" />
                </View>

                <TouchableOpacity
                    className="mb-6 py-3.5 px-4 rounded-xl bg-primary flex-row items-center justify-center gap-2"
                    accessibilityLabel="Add service log"
                    accessibilityRole="button"
                    onPress={() => setAddModalVisible(true)}
                >
                    <MaterialIcons name="add" size={20} color="#081421" />
                    <Text className="font-label text-xs font-bold uppercase tracking-wider text-on-primary">Add service log</Text>
                </TouchableOpacity>

                {/* Timeline */}
                <View className="relative">
                    <View className="absolute left-6 top-0 bottom-0 w-[2px] bg-secondary/20 shadow-[0_0_8px_rgba(192,192,192,0.3)]">
                        <View className="absolute inset-0 bg-primary/40 opacity-50" />
                    </View>

                    {logs.length === 0 ? (
                        <View className="pl-16 pt-10">
                            <Text className="text-secondary/60 italic font-body">No service logs found. Use Add service log to record the first one.</Text>
                        </View>
                    ) : (
                        <View className="space-y-8">
                            {logs.map((log, index) => {
                                const isFirst = index === 0;
                                return (
                                    <View key={log.id} className="relative pl-14 mb-8">
                                        <View className={`absolute left-[21px] top-6 w-3 h-3 rounded-full border-4 border-background z-10 ${isFirst ? 'bg-primary shadow-[0_0_10px_rgba(169,199,255,0.8)]' : 'bg-secondary/40'}`} />
                                        <View className="bg-surface-container-lowest border-t border-t-primary-fixed/10 border-b border-b-primary-container/30 rounded-xl p-5 gap-3">
                                            <View className="flex-row items-center justify-between">
                                                <View className="w-12 h-12 flex items-center justify-center rounded-lg bg-surface-container-high border border-outline-variant/30">
                                                    <MaterialIcons name={getIconForCategory(log.service_type ?? log.category) as any} size={24} color={isFirst ? '#a9c7ff' : '#c6c6c6'} />
                                                </View>
                                                <TouchableOpacity
                                                    onPress={() => handleDelete(log)}
                                                    className="p-2 -mr-1"
                                                    accessibilityLabel={`Delete ${log.title} service log`}
                                                    accessibilityRole="button"
                                                >
                                                    <MaterialIcons name="delete-outline" size={20} color="#8e9196" />
                                                </TouchableOpacity>
                                            </View>
                                            <View>
                                                <View className="flex-row items-start justify-between mb-1 gap-2">
                                                    <Text className="font-headline text-xl font-bold tracking-tight text-on-surface" style={{ flexShrink: 1 }}>
                                                        {log.sets_odometer_baseline === 1 ? `${log.mileage.toLocaleString()} KM` : 'Date only'}
                                                    </Text>
                                                    <View className="flex-row flex-wrap items-center gap-1 justify-end" style={{ flexShrink: 0, maxWidth: '55%' }}>
                                                        {log.service_type && (
                                                            <View className="px-2 py-0.5 bg-primary/10 border border-primary/30 rounded">
                                                                <Text className="text-xs font-label font-bold text-primary tracking-widest uppercase">Tracked</Text>
                                                            </View>
                                                        )}
                                                        {log.sets_odometer_baseline === 0 && (
                                                            <View className="px-2 py-0.5 bg-secondary/10 border border-secondary/30 rounded">
                                                                <Text className="text-xs font-label font-bold text-secondary tracking-widest uppercase">No odometer</Text>
                                                            </View>
                                                        )}
                                                        <View className="px-2 py-0.5 border border-secondary/30 rounded">
                                                            <Text className="text-xs font-label font-bold text-secondary tracking-widest uppercase">{log.service_type ?? log.category}</Text>
                                                        </View>
                                                    </View>
                                                </View>
                                                <Text className="font-label text-xs font-medium text-secondary/50 tracking-widest uppercase">{log.date}</Text>
                                                <Text className="mt-2 text-xs text-on-surface-variant font-body">{log.title}</Text>
                                                {log.notes ? (
                                                    <Text className="mt-1 text-xs text-secondary/60 italic leading-relaxed">{log.notes}</Text>
                                                ) : null}
                                                {log.cost !== null ? (
                                                    <Text className="mt-1 text-xs text-primary font-label">{log.cost.toLocaleString()} EGP</Text>
                                                ) : null}
                                            </View>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </View>
                <AppListContinuation visible={canLoadOlder} onPress={loadOlder} />
            </ScrollView>

            {/* ── Add Log Modal ── */}
            <ProtectedModal
                accessibilityLabel="New service log dialog"
                visible={isAddModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => {
                    setAddModalVisible(false);
                    resetForm();
                }}
            >
                <View className="flex-1 justify-end bg-black/60">
                    <View className="w-full max-w-2xl self-center bg-surface-container-low rounded-t-3xl p-6 border-t border-outline-variant/20 shadow-2xl" style={{ maxHeight: '92%' }}>
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="font-headline text-2xl font-bold text-on-surface">New Log</Text>
                            <TouchableOpacity onPress={() => { setAddModalVisible(false); resetForm(); }} className="bg-surface-container-high rounded-full p-2" accessibilityLabel="Close add service log form" accessibilityRole="button">
                                <MaterialIcons name="close" size={24} color="#c6c6c6" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            <View className="gap-4 mb-10">
                                {/* Title */}
                                <View>
                                    <Text className="font-label text-xs uppercase tracking-widest text-secondary mb-2">Title</Text>
                                    <TextInput
                                        accessibilityLabel="Service log title"
                                        className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base"
                                        placeholder="e.g. Synthetic Oil Change"
                                        placeholderTextColor="#454747"
                                        value={title}
                                        onChangeText={setTitle}
                                    />
                                </View>

                                {/* Mileage & Date */}
                                <View className="flex-row gap-4">
                                    <View className="flex-1">
                                        <Text className="font-label text-xs uppercase tracking-widest text-secondary mb-2">Mileage (KM)</Text>
                                        <TextInput
                                            accessibilityLabel="Service mileage in kilometres"
                                            className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base"
                                            placeholder="15000"
                                            placeholderTextColor="#454747"
                                            keyboardType="numeric"
                                            value={mileage}
                                            onChangeText={setMileage}
                                        />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="font-label text-xs uppercase tracking-widest text-secondary mb-2">Date</Text>
                                        <TextInput
                                            accessibilityLabel="Service date"
                                            className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base"
                                            placeholder="YYYY-MM-DD"
                                            placeholderTextColor="#454747"
                                            value={date}
                                            onChangeText={setDate}
                                        />
                                    </View>
                                </View>

                                {/* ── Service Type Selector ── */}
                                <View>
                                    <Text className="font-label text-xs uppercase tracking-widest text-secondary mb-2">Service Type</Text>

                                    {/* Section: Tracked */}
                                    <Text className="font-label text-xs uppercase tracking-[0.2em] text-primary/60 mb-1.5">
                                        Tracked intervals (updates planner)
                                    </Text>
                                    <View className="flex-row flex-wrap gap-2 mb-3">
                                        {intervals.map((interval) => {
                                            const type = interval.name;
                                            return (
                                            <TouchableOpacity
                                                key={type}
                                                onPress={() => { setServiceType(type === serviceType ? null : type); setOtherCategory(null); }}
                                                accessibilityRole="radio"
                                                accessibilityState={{ checked: serviceType === type }}
                                                className={`px-3 py-2 rounded-lg border ${serviceType === type ? 'bg-primary/20 border-primary' : 'bg-surface-container-highest border-outline-variant/20'}`}
                                            >
                                                <Text className={`font-label text-xs font-bold ${serviceType === type ? 'text-primary' : 'text-secondary/70'}`}>{type}</Text>
                                            </TouchableOpacity>
                                            );
                                        })}
                                    </View>

                                    {/* Section: Other */}
                                    <Text className="font-label text-xs uppercase tracking-[0.2em] text-secondary/50 mb-1.5">
                                        ↳ Other
                                    </Text>
                                    <View className="flex-row flex-wrap gap-2">
                                        {OTHER_CATEGORIES.map(cat => (
                                            <TouchableOpacity
                                                key={cat}
                                                onPress={() => { setOtherCategory(cat === otherCategory ? null : cat); setServiceType(null); }}
                                                accessibilityRole="radio"
                                                accessibilityState={{ checked: otherCategory === cat }}
                                                className={`px-3 py-2 rounded-lg border ${otherCategory === cat ? 'bg-secondary/20 border-secondary/50' : 'bg-surface-container-highest border-outline-variant/20'}`}
                                            >
                                                <Text className={`font-label text-xs font-bold ${otherCategory === cat ? 'text-on-surface' : 'text-secondary/70'}`}>{cat}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* Smart-Link hint */}
                                    {isTracked && (
                                        <View className="mt-3 flex-row items-start gap-2 bg-primary/10 border border-primary/20 rounded-xl px-3 py-2.5">
                                            <MaterialIcons name="link" size={14} color="#a9c7ff" style={{ marginTop: 1 }} />
                                            <Text className="font-body text-xs text-primary/90 flex-1 leading-4">
                                                Selecting this sets the{' '}
                                                <Text className="font-bold">{serviceType}</Text>{' '}
                                                planner baseline to this log&apos;s odometer.
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                {/* Notes */}
                                <View>
                                    <Text className="font-label text-xs uppercase tracking-widest text-secondary mb-2">Cost (EGP, optional)</Text>
                                    <TextInput
                                        accessibilityLabel="Service cost in EGP"
                                        className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base"
                                        placeholder="e.g. 750"
                                        placeholderTextColor="#454747"
                                        keyboardType="decimal-pad"
                                        value={cost}
                                        onChangeText={setCost}
                                    />
                                </View>

                                {/* Notes */}
                                <View>
                                    <Text className="font-label text-xs uppercase tracking-widest text-secondary mb-2">Notes</Text>
                                    <TextInput
                                        accessibilityLabel="Service notes"
                                        className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base min-h-[80px]"
                                        placeholder="Add any extra details..."
                                        placeholderTextColor="#454747"
                                        multiline
                                        textAlignVertical="top"
                                        value={notes}
                                        onChangeText={setNotes}
                                    />
                                </View>
                            </View>

                            <TouchableOpacity
                                className="w-full h-14 bg-primary rounded-xl items-center justify-center mb-10 shadow-lg shadow-primary/20"
                                onPress={handleAddSubmit}
                                accessibilityLabel="Save service log"
                                accessibilityRole="button"
                            >
                                <Text className="font-headline font-bold text-on-primary text-base uppercase tracking-widest">Save Log</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </ProtectedModal>
        </AppScreen>
    );
}
