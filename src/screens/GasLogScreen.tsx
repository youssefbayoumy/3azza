import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getGasLogs, insertGasLog, deleteGasLog } from '../services/database';
import type { GasLog } from '../types/database.types';

export default function GasLogScreen() {
    const [logs, setLogs] = useState<GasLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);

    // Form state
    const [formLiters, setFormLiters] = useState('');
    const [formCost, setFormCost] = useState('');
    const [formOdometer, setFormOdometer] = useState('');
    const [formStation, setFormStation] = useState('');
    const [saving, setSaving] = useState(false);

    const loadLogs = useCallback(async () => {
        setLoading(true);
        const data = await getGasLogs();
        setLogs(data);
        setLoading(false);
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadLogs();
        }, [loadLogs])
    );

    // Computed stats
    const totalLiters = logs.reduce((sum, l) => sum + l.liters, 0);
    const latestOdometer = logs.length > 0 ? logs[0].odometer_km : 0;
    const oldestOdometer = logs.length > 1 ? logs[logs.length - 1].odometer_km : latestOdometer;
    const distanceDriven = latestOdometer - oldestOdometer;
    const efficiency = distanceDriven > 0 ? ((totalLiters / distanceDriven) * 100).toFixed(1) : '—';
    const estimatedRange = distanceDriven > 0 && totalLiters > 0
        ? Math.round((50 / (totalLiters / distanceDriven))) // assuming ~50L tank
        : 0;

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const handleAdd = async () => {
        const liters = parseFloat(formLiters);
        const cost = parseFloat(formCost);
        const odometer = parseInt(formOdometer, 10);

        if (isNaN(liters) || isNaN(cost) || isNaN(odometer)) {
            Alert.alert('Invalid Input', 'Please fill in Liters, Cost, and Odometer with valid numbers.');
            return;
        }

        setSaving(true);
        await insertGasLog({
            liters,
            cost,
            odometer_km: odometer,
            station: formStation.trim() || null,
        });
        // Reset form
        setFormLiters('');
        setFormCost('');
        setFormOdometer('');
        setFormStation('');
        setSaving(false);
        setModalVisible(false);
        await loadLogs();
    };

    const handleDelete = (id: number) => {
        Alert.alert('Delete Entry', 'Remove this fuel log entry?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    await deleteGasLog(id);
                    await loadLogs();
                },
            },
        ]);
    };

    if (loading) {
        return (
            <View className="flex-1 bg-background items-center justify-center">
                <ActivityIndicator size="large" color="#a9c7ff" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-background pt-12">
            {/* TopAppBar */}
            <View className="flex-row justify-between items-center px-6 h-16 w-full border-b border-[#C0C0C0]/10">
                <View className="flex-row items-center">
                    <MaterialIcons name="menu" size={24} color="#a9c7ff" />
                </View>
                <Text className="font-headline tracking-tighter uppercase text-xl font-bold text-[#C0C0C0] tracking-widest">FUEL_LOG</Text>
                <View className="flex-row items-center">
                    <MaterialIcons name="settings" size={24} color="#a9c7ff" />
                </View>
            </View>

            <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 150 }}>

                {/* Main Readout Module */}
                <View className="mb-12 items-center">
                    <Text className="font-label text-[10px] font-bold uppercase tracking-[0.3em] text-secondary opacity-60 mb-2">Efficiency Index</Text>
                    <View className="flex-row items-baseline">
                        <Text className="font-headline text-7xl font-bold text-primary tracking-tighter">{efficiency}</Text>
                        <Text className="text-2xl font-light opacity-80 font-label tracking-normal text-primary ml-2">L/100KM</Text>
                    </View>
                    <View className="mt-4 flex-row justify-center items-center gap-4">
                        <View className="items-center">
                            <Text className="font-label text-[9px] uppercase tracking-widest text-secondary opacity-40">Range</Text>
                            <Text className="font-headline text-lg text-on-surface">{estimatedRange > 0 ? `${estimatedRange} KM` : '— KM'}</Text>
                        </View>
                        <View className="w-px h-8 bg-outline-variant opacity-30" />
                        <View className="items-center">
                            <Text className="font-label text-[9px] uppercase tracking-widest text-secondary opacity-40">Total Fill</Text>
                            <Text className="font-headline text-lg text-on-surface">{totalLiters > 0 ? `${totalLiters.toLocaleString()} L` : '— L'}</Text>
                        </View>
                    </View>
                </View>

                {/* List Header */}
                <View className="flex-row justify-between items-end mb-6">
                    <Text className="font-headline text-xl font-bold tracking-tight text-secondary">Historical Telemetry</Text>
                    <Text className="font-label text-[10px] uppercase font-bold text-primary tracking-widest">{logs.length > 0 ? 'Active Scan' : 'No Data'}</Text>
                </View>

                {/* Empty State */}
                {logs.length === 0 && (
                    <View className="bg-surface-container-low border border-secondary/10 p-8 rounded-xl items-center">
                        <MaterialIcons name="local-gas-station" size={48} color="#2a3644" />
                        <Text className="font-label text-xs font-bold text-on-surface-variant/50 mt-4 uppercase tracking-widest">No fuel logs yet</Text>
                        <Text className="font-body text-sm text-on-surface-variant/30 mt-2 text-center">Tap the + button to record your first fill-up</Text>
                    </View>
                )}

                {/* Gas Log Entries */}
                <View className="flex-col gap-4">
                    {logs.map((entry, i) => {
                        const opacity = Math.max(0.4, 1 - i * 0.15);
                        return (
                            <TouchableOpacity
                                key={entry.id}
                                className="bg-surface-container-low border border-secondary/10 p-5 rounded-xl flex-row items-center justify-between"
                                style={{ opacity }}
                                activeOpacity={0.7}
                                onLongPress={() => handleDelete(entry.id)}
                            >
                                <View className="flex-col gap-1">
                                    <Text className="font-label text-[10px] font-bold text-secondary opacity-40 uppercase tracking-widest">{formatDate(entry.logged_at)}</Text>
                                    <View className="flex-row items-center gap-2">
                                        <MaterialIcons name="speed" size={16} color="#a9c7ff" />
                                        <Text className="font-headline text-lg font-medium text-on-surface">{entry.odometer_km.toLocaleString()} KM</Text>
                                    </View>
                                </View>
                                <View className="items-end">
                                    <View className="flex-row items-baseline">
                                        <Text className="font-headline text-2xl font-bold text-primary">{entry.liters}</Text>
                                        <Text className="font-label text-xs uppercase opacity-60 text-primary ml-1">L</Text>
                                    </View>
                                    {entry.station ? (
                                        <Text className="font-label text-[9px] text-secondary opacity-30 uppercase tracking-tighter">{entry.station}</Text>
                                    ) : (
                                        <Text className="font-label text-[9px] text-secondary opacity-30 uppercase tracking-tighter">{entry.cost > 0 ? `${entry.cost} EGP` : ''}</Text>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity
                className="absolute bottom-28 right-6 w-14 h-14 rounded-full bg-secondary items-center justify-center shadow-lg z-50"
                activeOpacity={0.8}
                onPress={() => setModalVisible(true)}
            >
                <MaterialIcons name="add" size={24} color="#2f3131" />
            </TouchableOpacity>

            {/* Add Entry Modal */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <View className="flex-1 justify-end">
                    <View className="bg-surface-container rounded-t-3xl p-6 border-t border-outline-variant/20">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="font-headline text-xl font-bold text-on-surface">New Fuel Log</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <MaterialIcons name="close" size={24} color="#c4c6cc" />
                            </TouchableOpacity>
                        </View>

                        <View className="flex-col gap-4 mb-6">
                            <View>
                                <Text className="font-label text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">Liters *</Text>
                                <TextInput
                                    className="bg-surface-container-high rounded-xl px-4 py-3 text-on-surface font-body border border-outline-variant/20"
                                    placeholder="e.g. 45.5"
                                    placeholderTextColor="#64748b"
                                    keyboardType="decimal-pad"
                                    value={formLiters}
                                    onChangeText={setFormLiters}
                                />
                            </View>
                            <View>
                                <Text className="font-label text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">Cost *</Text>
                                <TextInput
                                    className="bg-surface-container-high rounded-xl px-4 py-3 text-on-surface font-body border border-outline-variant/20"
                                    placeholder="e.g. 350"
                                    placeholderTextColor="#64748b"
                                    keyboardType="decimal-pad"
                                    value={formCost}
                                    onChangeText={setFormCost}
                                />
                            </View>
                            <View>
                                <Text className="font-label text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">Odometer (KM) *</Text>
                                <TextInput
                                    className="bg-surface-container-high rounded-xl px-4 py-3 text-on-surface font-body border border-outline-variant/20"
                                    placeholder="e.g. 10250"
                                    placeholderTextColor="#64748b"
                                    keyboardType="number-pad"
                                    value={formOdometer}
                                    onChangeText={setFormOdometer}
                                />
                            </View>
                            <View>
                                <Text className="font-label text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">Station (optional)</Text>
                                <TextInput
                                    className="bg-surface-container-high rounded-xl px-4 py-3 text-on-surface font-body border border-outline-variant/20"
                                    placeholder="e.g. Misr Petroleum"
                                    placeholderTextColor="#64748b"
                                    value={formStation}
                                    onChangeText={setFormStation}
                                />
                            </View>
                        </View>

                        <TouchableOpacity
                            className="bg-primary rounded-xl py-4 items-center"
                            onPress={handleAdd}
                            disabled={saving}
                            activeOpacity={0.85}
                        >
                            {saving ? (
                                <ActivityIndicator color="#081421" />
                            ) : (
                                <Text className="font-label text-base font-bold text-[#081421] uppercase tracking-wider">Log Fill-Up</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
