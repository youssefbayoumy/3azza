import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getServiceLogs, addServiceLog, deleteServiceLog, resetIntervalByName, getVehicleProfile } from '../services/database';
import type { ServiceLog } from '../types/database.types';

// The 7 tracked service intervals — selecting one triggers the Smart-Link counter reset
const TRACKED_SERVICE_TYPES = [
    'Oil Change',
    'Gearbox Oil Change',
    'Air Filter',
    'Brake Pads',
    'Cleaning',
    'CVT & Pull Rollers',
    'Carburetor',
] as const;

const OTHER_CATEGORIES = ['Electrical', 'Repair', 'Bodywork', 'General', 'Tires'] as const;

export default function ServiceLogsScreen() {
    const navigation = useNavigation();
    const [logs, setLogs] = useState<ServiceLog[]>([]);
    const [isAddModalVisible, setAddModalVisible] = useState(false);
    const [currentOdometer, setCurrentOdometer] = useState(0);

    // Form State
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [mileage, setMileage] = useState('');
    const [serviceType, setServiceType] = useState<string | null>(null); // Tracked interval name, if selected
    const [otherCategory, setOtherCategory] = useState<string | null>(null); // Non-tracked category
    const [notes, setNotes] = useState('');

    const isTracked = serviceType !== null;

    const loadLogs = useCallback(async () => {
        const [data, profile] = await Promise.all([
            getServiceLogs(),
            getVehicleProfile(),
        ]);
        setLogs(data);
        setCurrentOdometer(profile?.current_mileage ?? 0);
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadLogs();
        }, [loadLogs])
    );

    const resetForm = () => {
        setTitle('');
        setDate(new Date().toISOString().split('T')[0]);
        setMileage('');
        setServiceType(null);
        setOtherCategory(null);
        setNotes('');
    };

    const handleAddSubmit = async () => {
        const category = serviceType ? serviceType.toLowerCase() : (otherCategory ?? 'general').toLowerCase();
        if (!title || !date || !mileage || (!serviceType && !otherCategory)) {
            Alert.alert('Missing Fields', 'Please fill in all required fields and select a service type.');
            return;
        }

        const km = parseInt(mileage, 10);

        await addServiceLog({
            title,
            date,
            mileage: km,
            category,
            notes,
            cost: null,
            service_type: serviceType ?? null,
        });

        // Smart-Link: reset the tracked interval's counter
        if (serviceType) {
            await resetIntervalByName(serviceType, km);
        }

        setAddModalVisible(false);
        resetForm();
        loadLogs();
    };

    const handleDelete = (log: ServiceLog) => {
        Alert.alert(
            'Delete Log',
            `Remove this "${log.title}" entry? The corresponding service interval will automatically roll back to its previous log entry.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        await deleteServiceLog(log.id);
                        loadLogs(); // Unified Data Model in MaintenanceScheduleScreen handles the rollback automatically
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

    const lastServiceMileage = logs.length > 0 ? Math.max(...logs.map(l => l.mileage)) : 0;

    return (
        <View className="flex-1 bg-background pt-12">
            {/* Top AppBar */}
            <View className="flex-row items-center justify-between px-6 h-16 w-full border-b border-[#C0C0C0]/10 bg-[#081421] z-50">
                <View className="flex-row items-center gap-4">
                    <TouchableOpacity className="p-2" onPress={() => navigation.goBack()}>
                        <MaterialIcons name="arrow-back" size={24} color="#a9c7ff" />
                    </TouchableOpacity>
                    <Text className="font-headline uppercase tracking-widest text-sm font-bold text-[#C0C0C0]">SERVICE LOGS</Text>
                </View>
            </View>

            <ScrollView className="flex-1 px-6 pt-8 pb-32">
                {/* Header */}
                <View className="mb-8">
                    <View className="flex-row items-end justify-between">
                        <View>
                            <Text className="font-label text-[10px] tracking-[0.2em] text-secondary/60 uppercase">Maintenance Logs</Text>
                            <Text className="font-headline text-4xl font-bold text-on-surface tracking-tight mt-1 uppercase">History</Text>
                        </View>
                        <View className="items-end">
                            <Text className="font-headline text-2xl font-bold text-primary tracking-tighter italic shadow-[0_0_12px_rgba(169,199,255,0.4)]">{lastServiceMileage} KM</Text>
                            <Text className="font-label text-[10px] uppercase text-secondary/50 tracking-widest">Last Service</Text>
                        </View>
                    </View>
                    <View className="h-[1px] w-full bg-secondary/20 mt-4" />
                </View>

                {/* Timeline */}
                <View className="relative min-h-[500px]">
                    <View className="absolute left-6 top-0 bottom-0 w-[2px] bg-secondary/20 shadow-[0_0_8px_rgba(192,192,192,0.3)]">
                        <View className="absolute inset-0 bg-primary/40 opacity-50" />
                    </View>

                    {logs.length === 0 ? (
                        <View className="pl-16 pt-10">
                            <Text className="text-secondary/60 italic font-body">No service logs found. Tap + to add the first log.</Text>
                        </View>
                    ) : (
                        <View className="space-y-8">
                            {logs.map((log, index) => {
                                const isFirst = index === 0;
                                return (
                                    <View key={log.id} className="relative pl-14 mb-8">
                                        <View className={`absolute left-[21px] top-6 w-3 h-3 rounded-full border-4 border-background z-10 ${isFirst ? 'bg-primary shadow-[0_0_10px_rgba(169,199,255,0.8)]' : 'bg-secondary/40'}`} />
                                        <View className="bg-surface-container-lowest border-t border-t-primary-fixed/10 border-b border-b-primary-container/30 rounded-xl p-5 flex-row items-center gap-4">
                                            <View className={`w-12 h-12 flex items-center justify-center rounded-lg bg-surface-container-high border border-outline-variant/30`}>
                                                <MaterialIcons name={getIconForCategory(log.service_type ?? log.category) as any} size={24} color={isFirst ? '#a9c7ff' : '#c6c6c6'} />
                                            </View>
                                            <View className="flex-1">
                                                <View className="flex-row items-center justify-between mb-1">
                                                    <Text className="font-headline text-xl font-bold tracking-tight text-on-surface">{log.mileage.toLocaleString()} KM</Text>
                                                    <View className="flex-row items-center gap-2">
                                                        {log.service_type && (
                                                            <View className="px-2 py-0.5 bg-primary/10 border border-primary/30 rounded">
                                                                <Text className="text-[8px] font-label font-bold text-primary tracking-widest uppercase">Tracked</Text>
                                                            </View>
                                                        )}
                                                        <View className="px-2 py-0.5 border border-secondary/30 rounded">
                                                            <Text className="text-[9px] font-label font-bold text-secondary tracking-widest uppercase">{log.service_type ?? log.category}</Text>
                                                        </View>
                                                    </View>
                                                </View>
                                                <Text className="font-label text-xs font-medium text-secondary/50 tracking-widest uppercase">{log.date}</Text>
                                                <Text className="mt-2 text-xs text-on-surface-variant font-body">{log.title}</Text>
                                                {log.notes ? (
                                                    <Text className="mt-1 text-[10px] text-secondary/60 italic leading-relaxed">{log.notes}</Text>
                                                ) : null}
                                            </View>
                                            <TouchableOpacity
                                                onPress={() => handleDelete(log)}
                                                className="p-2 -mr-1"
                                            >
                                                <MaterialIcons name="delete-outline" size={20} color="#8e9196" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </View>
                <View className="h-40" />
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity
                className="absolute bottom-24 right-6 w-16 h-16 rounded-full items-center justify-center shadow-2xl elevation-10"
                style={{ backgroundColor: '#e3e2e2', borderWidth: 3, borderColor: '#2a3644' }}
                onPress={() => setAddModalVisible(true)}
            >
                <MaterialIcons name="add" size={32} color="#081421" />
            </TouchableOpacity>

            {/* ── Add Log Modal ── */}
            <Modal visible={isAddModalVisible} animationType="slide" transparent={true}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-black/60">
                    <View className="bg-surface-container-low rounded-t-3xl p-6 border-t border-outline-variant/20 shadow-2xl" style={{ maxHeight: '92%' }}>
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="font-headline text-2xl font-bold text-on-surface">New Log</Text>
                            <TouchableOpacity onPress={() => { setAddModalVisible(false); resetForm(); }} className="bg-surface-container-high rounded-full p-2">
                                <MaterialIcons name="close" size={24} color="#c6c6c6" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            <View className="gap-4 mb-10">
                                {/* Title */}
                                <View>
                                    <Text className="font-label text-xs uppercase tracking-widest text-secondary mb-2">Title</Text>
                                    <TextInput
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
                                    <Text className="font-label text-[9px] uppercase tracking-[0.2em] text-primary/60 mb-1.5">
                                        ↳ Tracked Intervals (resets counter)
                                    </Text>
                                    <View className="flex-row flex-wrap gap-2 mb-3">
                                        {TRACKED_SERVICE_TYPES.map(type => (
                                            <TouchableOpacity
                                                key={type}
                                                onPress={() => { setServiceType(type === serviceType ? null : type); setOtherCategory(null); }}
                                                className={`px-3 py-2 rounded-lg border ${serviceType === type ? 'bg-primary/20 border-primary' : 'bg-surface-container-highest border-outline-variant/20'}`}
                                            >
                                                <Text className={`font-label text-[11px] font-bold ${serviceType === type ? 'text-primary' : 'text-secondary/70'}`}>{type}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* Section: Other */}
                                    <Text className="font-label text-[9px] uppercase tracking-[0.2em] text-secondary/50 mb-1.5">
                                        ↳ Other
                                    </Text>
                                    <View className="flex-row flex-wrap gap-2">
                                        {OTHER_CATEGORIES.map(cat => (
                                            <TouchableOpacity
                                                key={cat}
                                                onPress={() => { setOtherCategory(cat === otherCategory ? null : cat); setServiceType(null); }}
                                                className={`px-3 py-2 rounded-lg border ${otherCategory === cat ? 'bg-secondary/20 border-secondary/50' : 'bg-surface-container-highest border-outline-variant/20'}`}
                                            >
                                                <Text className={`font-label text-[11px] font-bold ${otherCategory === cat ? 'text-on-surface' : 'text-secondary/70'}`}>{cat}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* Smart-Link hint */}
                                    {isTracked && (
                                        <View className="mt-3 flex-row items-start gap-2 bg-primary/10 border border-primary/20 rounded-xl px-3 py-2.5">
                                            <MaterialIcons name="link" size={14} color="#a9c7ff" style={{ marginTop: 1 }} />
                                            <Text className="font-body text-xs text-primary/90 flex-1 leading-4">
                                                Selecting this will reset your{' '}
                                                <Text className="font-bold">{serviceType}</Text>{' '}
                                                counter to 100%.
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                {/* Notes */}
                                <View>
                                    <Text className="font-label text-xs uppercase tracking-widest text-secondary mb-2">Notes</Text>
                                    <TextInput
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
                            >
                                <Text className="font-headline font-bold text-on-primary text-base uppercase tracking-widest">Save Log</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}
