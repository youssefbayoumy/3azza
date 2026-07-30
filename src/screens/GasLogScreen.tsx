import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, Switch } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { getGasLogMetrics, getGasLogs, getVehicleProfile, insertGasLog, deleteGasLog, type GasLogMetrics } from '../services/database';
import type { GasLog, VehicleProfile } from '../types/database.types';
import type { MainStackNavigationProp } from '../navigation/types';
import ProtectedModal from '../components/ProtectedModal';
import { toIsoDate } from '../utils/dates';
import { validateFuelLogFields } from '../utils/fuel';
import AppIconButton from '../components/ui/AppIconButton';
import AppTopBar from '../components/ui/AppTopBar';
import AppBottomSheet from '../components/ui/AppBottomSheet';
import AppPrimaryButton from '../components/ui/AppPrimaryButton';
import AppTextField from '../components/ui/AppTextField';
import EmptyState from '../components/ui/EmptyState';
import StatusBadge from '../components/ui/StatusBadge';
import AppScreen from '../components/ui/AppScreen';
import AppListContinuation from '../components/ui/AppListContinuation';
import useIncrementalRecordLimit from '../hooks/useIncrementalRecordLimit';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';
import { parseDecimalNumberInput, parseWholeNumberInput } from '../utils/recordValidation';

const EMPTY_GAS_METRICS: GasLogMetrics = {
    recordCount: 0,
    totalLiters: 0,
    totalCost: 0,
    segmentCount: 0,
    averageKmPerLiter: null,
    latestKmPerLiter: null,
};

export default function GasLogScreen() {
    const navigation = useNavigation<MainStackNavigationProp>();
    const [logs, setLogs] = useState<GasLog[]>([]);
    const [metrics, setMetrics] = useState<GasLogMetrics>(EMPTY_GAS_METRICS);
    const { canLoadOlder, limit, loadOlder } = useIncrementalRecordLimit(logs.length);
    const [profile, setProfile] = useState<VehicleProfile | null>(null);
    const [modalVisible, setModalVisible] = useState(false);

    // Form state
    const [formLiters, setFormLiters] = useState('');
    const [formCost, setFormCost] = useState('');
    const [formOdometer, setFormOdometer] = useState('');
    const [formStation, setFormStation] = useState('');
    const [formDate, setFormDate] = useState(new Date());
    const [formIsFullTank, setFormIsFullTank] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [saving, setSaving] = useState(false);

    const loadLogs = useCallback(async (isCurrent: () => boolean) => {
        const [activeProfile, data, exactMetrics] = await Promise.all([
            getVehicleProfile(),
            getGasLogs({ limit }),
            getGasLogMetrics(),
        ]);
        if (!isCurrent()) return;
        setProfile(activeProfile);
        setLogs(data);
        setMetrics(exactMetrics);
    }, [limit]);

    const { error: loadError, loading, reload } = useFocusedLoader(
        loadLogs,
        'Fuel history could not be loaded. Your fuel records were not changed.',
        'Failed to load fuel logs:'
    );

    // Computed stats
    const estimatedRangeKm = metrics.averageKmPerLiter !== null
        && profile?.tank_capacity_liters !== null
        && profile?.tank_capacity_liters !== undefined
        ? metrics.averageKmPerLiter * profile.tank_capacity_liters
        : null;

    const formatDate = (iso: string) => {
        const d = new Date(`${iso}T12:00:00`);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const handleAdd = async () => {
        const litersResult = parseDecimalNumberInput(formLiters, { label: 'Fuel amount' });
        const costResult = parseDecimalNumberInput(formCost, { label: 'Fuel cost' });
        const odometerResult = parseWholeNumberInput(formOdometer, { label: 'Odometer' });
        const inputError = [litersResult, costResult, odometerResult].find((result) => !result.ok);
        if (inputError && !inputError.ok) {
            Alert.alert('Invalid fuel entry', inputError.message);
            return;
        }
        if (!litersResult.ok || !costResult.ok || !odometerResult.ok) return;

        const liters = litersResult.value;
        const cost = costResult.value;
        const odometer = odometerResult.value;
        const loggedOn = toIsoDate(formDate);
        const validationMessage = validateFuelLogFields({
            liters,
            cost,
            odometer_km: odometer,
            logged_on: loggedOn,
            is_full_tank: formIsFullTank ? 1 : 0,
        });

        if (validationMessage) {
            Alert.alert('Invalid fuel entry', validationMessage);
            return;
        }

        setSaving(true);
        try {
            await insertGasLog({
                liters,
                cost,
                odometer_km: odometer,
                station: formStation.trim() || null,
                logged_on: loggedOn,
                is_full_tank: formIsFullTank ? 1 : 0,
            });
            setFormLiters('');
            setFormCost('');
            setFormOdometer('');
            setFormStation('');
            setFormDate(new Date());
            setFormIsFullTank(false);
            setModalVisible(false);
            await reload();
        } catch (error) {
            Alert.alert(
                'Fuel entry not saved',
                error instanceof Error ? error.message : 'The fuel entry could not be saved. Try again.'
            );
        } finally {
            setSaving(false);
        }
    };

    const handleDateChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
        if (Platform.OS === 'android') setShowDatePicker(false);
        if (selectedDate) setFormDate(selectedDate);
    };

    const openAddModal = () => {
        setFormDate(new Date());
        setFormIsFullTank(false);
        setModalVisible(true);
    };

    const handleDelete = (id: number) => {
        Alert.alert('Delete Entry', 'Remove this fuel log entry?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await deleteGasLog(id);
                        await reload();
                    } catch (error) {
                        console.error('Failed to delete fuel log:', error);
                        Alert.alert('Fuel entry not deleted', 'The fuel entry is still saved. Try again.');
                    }
                },
            },
        ]);
    };

    if (loading || loadError) {
        return <ScreenLoadState error={loadError} loading={loading} onBack={() => navigation.goBack()} onRetry={reload} title="FUEL LOG" />;
    }

    return (
        <AppScreen edges={['top', 'bottom', 'left', 'right']}>
            <AppTopBar
                align="center"
                tone="subtle"
                leading={<AppIconButton accessibilityLabel="Go back" icon="arrow-back" className="-ml-2" onPress={() => navigation.goBack()} />}
                trailing={<AppIconButton accessibilityLabel="Open vehicle settings" icon="settings" className="-mr-2" onPress={() => navigation.navigate('VehicleSettings')} />}
            >
                <Text className="font-headline uppercase text-xl font-bold text-[#C0C0C0] tracking-widest" numberOfLines={1}>FUEL LOG</Text>
            </AppTopBar>

            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 }}
            >

                {/* Main Readout Module */}
                <View className="mb-12 items-center">
                    <Text className="font-label text-xs font-bold uppercase tracking-[0.3em] text-secondary opacity-60 mb-2">Latest measured efficiency</Text>
                    <View className="flex-row items-baseline justify-center">
                        <Text className="font-headline text-6xl font-bold text-primary tracking-tighter" numberOfLines={1} maxFontSizeMultiplier={1.2}>
                            {metrics.latestKmPerLiter === null ? '—' : metrics.latestKmPerLiter.toFixed(1)}
                        </Text>
                        <Text className="text-2xl font-light opacity-80 font-label tracking-normal text-primary ml-2">KM/L</Text>
                    </View>
                    <Text className="font-body text-xs text-on-surface-variant/70 text-center mt-2 px-2">
                        {metrics.segmentCount > 0
                            ? `Based on ${metrics.segmentCount} complete full-tank ${metrics.segmentCount === 1 ? 'segment' : 'segments'}.`
                            : 'Log two full-tank fills to calculate consumption. Partial fills are included only between those endpoints.'}
                    </Text>
                    <View className="mt-4 px-4 py-3 rounded-xl bg-surface-container-low border border-primary/15 items-center">
                        <Text className="font-label text-xs uppercase tracking-widest text-secondary/50">Estimated full-tank range</Text>
                        <Text className="font-headline text-xl font-bold text-on-surface mt-1">
                            {estimatedRangeKm === null ? 'Not available' : `~${Math.round(estimatedRangeKm).toLocaleString()} KM`}
                        </Text>
                        {profile?.tank_capacity_liters === null || profile?.tank_capacity_liters === undefined ? (
                            <TouchableOpacity onPress={() => navigation.navigate('VehicleSettings')} className="mt-2">
                                <Text className="font-label text-xs uppercase font-bold tracking-widest text-primary">Set tank capacity in vehicle settings</Text>
                            </TouchableOpacity>
                        ) : (
                            <Text className="font-body text-xs text-secondary/60 mt-1">Using your saved {profile.tank_capacity_liters.toLocaleString()} L capacity.</Text>
                        )}
                    </View>
                    <View className="mt-4 flex-row justify-center items-center gap-4">
                        <View className="items-center">
                            <Text className="font-label text-xs uppercase tracking-widest text-secondary opacity-40">Recorded fuel</Text>
                            <Text className="font-headline text-lg text-on-surface">{metrics.totalLiters > 0 ? `${metrics.totalLiters.toLocaleString()} L` : '—'}</Text>
                        </View>
                        <View className="w-px h-8 bg-outline-variant opacity-30" />
                        <View className="items-center">
                            <Text className="font-label text-xs uppercase tracking-widest text-secondary opacity-40">Recorded Cost</Text>
                            <Text className="font-headline text-lg text-on-surface">{metrics.totalCost > 0 ? `${metrics.totalCost.toLocaleString()} EGP` : '—'}</Text>
                        </View>
                    </View>
                </View>

                {/* List Header */}
                <View className="flex-row justify-between items-end mb-6">
                    <Text className="font-headline text-xl font-bold tracking-tight text-secondary">Fuel History</Text>
                    <Text className="font-label text-xs uppercase font-bold text-primary tracking-widest">{metrics.recordCount} {metrics.recordCount === 1 ? 'Entry' : 'Entries'}</Text>
                </View>

                <TouchableOpacity
                    className="mb-6 py-3.5 px-4 rounded-xl bg-secondary flex-row items-center justify-center gap-2"
                    accessibilityLabel="Add fuel log"
                    accessibilityRole="button"
                    activeOpacity={0.8}
                    onPress={openAddModal}
                >
                    <MaterialIcons name="add" size={20} color="#2f3131" />
                    <Text className="font-label text-xs font-bold uppercase tracking-wider text-[#2f3131]">Add fuel log</Text>
                </TouchableOpacity>

                {/* Empty State */}
                {logs.length === 0 && (
                    <EmptyState
                        icon="local-gas-station"
                        message="Use Add fuel log to record your first fill-up"
                        title="No fuel logs yet"
                    />
                )}

                {/* Gas Log Entries */}
                <View className="flex-col gap-4">
                    {logs.map((entry, i) => {
                        const opacity = Math.max(0.4, 1 - i * 0.15);
                        return (
                            <TouchableOpacity
                                key={entry.id}
                                className="bg-surface-container-low border border-secondary/10 p-5 rounded-xl flex-row items-center justify-between gap-3"
                                style={{ opacity }}
                                activeOpacity={0.7}
                                onLongPress={() => handleDelete(entry.id)}
                            >
                                <View className="flex-col gap-1 flex-1 min-w-0">
                                    <View className="flex-row flex-wrap items-center gap-2">
                                        <Text className="font-label text-xs font-bold text-secondary opacity-40 uppercase tracking-widest flex-shrink">{formatDate(entry.logged_on)}</Text>
                                        <StatusBadge label={entry.is_full_tank === 1 ? 'Full tank' : 'Partial fill'} tone={entry.is_full_tank === 1 ? 'success' : 'info'} />
                                    </View>
                                    <View className="flex-row items-center gap-2">
                                        <MaterialIcons name="speed" size={16} color="#a9c7ff" />
                                        <Text className="font-headline text-lg font-medium text-on-surface">{entry.odometer_km.toLocaleString()} KM</Text>
                                    </View>
                                </View>
                                <View className="items-end flex-shrink-0">
                                    <View className="flex-row items-baseline">
                                        <Text className="font-headline text-2xl font-bold text-primary">{entry.liters}</Text>
                                        <Text className="font-label text-xs uppercase opacity-60 text-primary ml-1">L</Text>
                                    </View>
                                    {entry.station ? (
                                        <Text className="font-label text-xs text-secondary opacity-30 uppercase tracking-tighter" numberOfLines={1}>{entry.station}</Text>
                                    ) : (
                                        <Text className="font-label text-xs text-secondary opacity-30 uppercase tracking-tighter">{entry.cost > 0 ? `${entry.cost} EGP` : ''}</Text>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                <AppListContinuation visible={canLoadOlder} onPress={loadOlder} />
            </ScrollView>

            {/* Add Entry Modal */}
            <ProtectedModal
                accessibilityLabel="New fuel log dialog"
                visible={modalVisible}
                animationType="slide"
                transparent
                onRequestClose={() => !saving && setModalVisible(false)}
            >
                <AppBottomSheet title="New Fuel Log" onClose={() => setModalVisible(false)} closeDisabled={saving}>
                        <View className="flex-col gap-4 mb-6">
                            <AppTextField label="Liters *" placeholder="e.g. 45.5" keyboardType="decimal-pad" value={formLiters} onChangeText={setFormLiters} />
                            <AppTextField label="Cost *" placeholder="e.g. 350" keyboardType="decimal-pad" value={formCost} onChangeText={setFormCost} />
                            <AppTextField label="Odometer (KM) *" placeholder="e.g. 10250" keyboardType="number-pad" value={formOdometer} onChangeText={setFormOdometer} />
                            <View>
                                <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">Fill date *</Text>
                                <TouchableOpacity
                                    onPress={() => setShowDatePicker(true)}
                                    className="bg-surface-container-high rounded-xl px-4 py-3 border border-outline-variant/20 flex-row items-center justify-between"
                                    accessibilityRole="button"
                                    accessibilityLabel="Fuel fill date"
                                >
                                    <Text className="text-on-surface font-body">{formatDate(toIsoDate(formDate))}</Text>
                                    <MaterialIcons name="calendar-today" size={18} color="#a9c7ff" />
                                </TouchableOpacity>
                                {showDatePicker && (
                                    <DateTimePicker value={formDate} mode="date" onChange={handleDateChange} maximumDate={new Date()} />
                                )}
                            </View>
                            <View className="bg-surface-container-high rounded-xl px-4 py-3 border border-outline-variant/20 flex-row items-center justify-between">
                                <View className="flex-1 pr-4">
                                    <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest">Filled to full?</Text>
                                    <Text className="font-body text-xs text-on-surface-variant mt-1">Enable only when the tank was filled completely.</Text>
                                </View>
                                <Switch
                                    accessibilityLabel="Filled tank completely"
                                    value={formIsFullTank}
                                    onValueChange={setFormIsFullTank}
                                    trackColor={{ false: '#1f2b39', true: 'rgba(169, 199, 255, 0.2)' }}
                                    thumbColor={formIsFullTank ? '#c6c6c6' : '#8e9196'}
                                />
                            </View>
                            <AppTextField label="Station (optional)" placeholder="e.g. Misr Petroleum" value={formStation} onChangeText={setFormStation} />
                        </View>
                        <AppPrimaryButton label="Log Fill-Up" loading={saving} onPress={handleAdd} />
                </AppBottomSheet>
            </ProtectedModal>
        </AppScreen>
    );
}
