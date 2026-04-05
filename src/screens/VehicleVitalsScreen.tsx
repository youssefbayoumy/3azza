import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { getVehicleVitals, saveVehicleVitals } from '../services/database';
import type { VehicleVitals } from '../types/database.types';

type VitalsFormData = {
    oil_life_pct: string;
    tire_pressure_psi: string;
    battery_health_pct: string;
    coolant_temp_c: string;
    brake_pad_pct: string;
};

export default function VehicleVitalsScreen() {
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);

    const { control, handleSubmit, reset } = useForm<VitalsFormData>({
        defaultValues: {
            oil_life_pct: '0',
            tire_pressure_psi: '0',
            battery_health_pct: '0',
            coolant_temp_c: '0',
            brake_pad_pct: '0',
        }
    });

    const loadVitals = useCallback(async () => {
        setLoading(true);
        const data = await getVehicleVitals();
        if (data) {
            reset({
                oil_life_pct: String(data.oil_life_pct),
                tire_pressure_psi: String(data.tire_pressure_psi),
                battery_health_pct: String(data.battery_health_pct),
                coolant_temp_c: String(data.coolant_temp_c),
                brake_pad_pct: String(data.brake_pad_pct),
            });
            setLastUpdated(new Date(data.updated_at).toLocaleString());
        }
        setLoading(false);
    }, [reset]);

    useFocusEffect(
        useCallback(() => {
            loadVitals();
        }, [loadVitals])
    );

    const onSubmit = async (data: VitalsFormData) => {
        setSaving(true);
        try {
            await saveVehicleVitals({
                oil_life_pct: parseInt(data.oil_life_pct, 10) || 0,
                tire_pressure_psi: parseInt(data.tire_pressure_psi, 10) || 0,
                battery_health_pct: parseInt(data.battery_health_pct, 10) || 0,
                coolant_temp_c: parseInt(data.coolant_temp_c, 10) || 0,
                brake_pad_pct: parseInt(data.brake_pad_pct, 10) || 0,
            });
            await loadVitals();
            setIsEditing(false);
        } catch (err) {
            console.error('Save error:', err);
            Alert.alert('Error', 'Failed to save vehicle vitals.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <View className="flex-1 bg-background items-center justify-center">
                <ActivityIndicator size="large" color="#a9c7ff" />
            </View>
        );
    }

    const InputRow = ({ label, name, icon, unit, max }: { label: string; name: keyof VitalsFormData; icon: React.ReactNode; unit: string; max?: number }) => (
        <View className="flex-row items-center justify-between mb-6 bg-surface-container-low p-4 rounded-xl border border-secondary/10">
            <View className="flex-row items-center gap-4">
                <View className="w-10 h-10 bg-surface-container-highest rounded-full items-center justify-center border border-white/5">
                    {icon}
                </View>
                <Text className="font-headline text-base text-on-surface">{label}</Text>
            </View>
            <View className="flex-row items-center">
                {isEditing ? (
                    <Controller
                        control={control}
                        name={name}
                        rules={{
                            required: true,
                            pattern: /^[0-9]+$/,
                            validate: (val) => max ? parseInt(val, 10) <= max : true
                        }}
                        render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                            <TextInput
                                className={`w-16 bg-surface-container-highest rounded px-2 py-1 text-center font-headline text-lg text-primary ${error ? 'border border-error' : ''}`}
                                keyboardType="number-pad"
                                onBlur={onBlur}
                                onChangeText={onChange}
                                value={value}
                            />
                        )}
                    />
                ) : (
                    <Controller
                        control={control}
                        name={name}
                        render={({ field: { value } }) => (
                            <Text className="font-headline text-xl font-bold text-primary">{value}</Text>
                        )}
                    />
                )}
                <Text className="font-label text-xs uppercase text-on-surface-variant/60 ml-2 w-8">{unit}</Text>
            </View>
        </View>
    );

    return (
        <View className="flex-1 bg-background pt-12">
            {/* TopAppBar */}
            <View className="flex-row justify-between items-center px-6 h-16 w-full border-b border-outline-variant/20">
                <Text className="font-headline text-xl font-bold tracking-tighter text-slate-100 uppercase">System Vitals</Text>
                <TouchableOpacity onPress={() => setIsEditing(!isEditing)} className="flex-row items-center gap-2 bg-surface-container-highest px-4 py-2 rounded-full border border-outline-variant/30">
                    <MaterialIcons name={isEditing ? 'close' : 'edit'} size={18} color={isEditing ? '#ffb4ab' : '#a9c7ff'} />
                    <Text className={`font-label text-xs font-bold uppercase tracking-widest ${isEditing ? 'text-error' : 'text-primary'}`}>
                        {isEditing ? 'Cancel' : 'Edit'}
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 100 }} className="flex-grow">
                {lastUpdated && !isEditing && (
                    <Text className="font-label text-[10px] text-on-surface-variant/50 uppercase tracking-widest text-center mb-8">
                        Last Synced: {lastUpdated}
                    </Text>
                )}
                {isEditing && (
                    <Text className="font-body text-sm text-primary/80 text-center mb-8 bg-primary/10 py-3 rounded-lg">
                        Tap any value to update current readings.
                    </Text>
                )}

                <InputRow label="Oil Life" name="oil_life_pct" icon={<MaterialCommunityIcons name="oil" size={20} color="#a9c7ff" />} unit="%" max={100} />
                <InputRow label="Tire Pressure" name="tire_pressure_psi" icon={<MaterialCommunityIcons name="tire" size={20} color="#a9c7ff" />} unit="PSI" />
                <InputRow label="Battery Health" name="battery_health_pct" icon={<MaterialCommunityIcons name="car-battery" size={20} color="#a9c7ff" />} unit="%" max={100} />
                <InputRow label="Coolant Temp" name="coolant_temp_c" icon={<MaterialIcons name="thermostat" size={20} color="#a9c7ff" />} unit="°C" />
                <InputRow label="Brake Pads" name="brake_pad_pct" icon={<MaterialCommunityIcons name="car-brake-alert" size={20} color="#a9c7ff" />} unit="%" max={100} />

                {isEditing && (
                    <TouchableOpacity
                        className="bg-primary rounded-xl py-4 items-center mt-6 shadow-lg"
                        onPress={handleSubmit(onSubmit)}
                        disabled={saving}
                        activeOpacity={0.85}
                    >
                        {saving ? (
                            <ActivityIndicator color="#081421" />
                        ) : (
                            <Text className="font-label text-base font-bold text-[#081421] uppercase tracking-wider">Save Telemetry</Text>
                        )}
                    </TouchableOpacity>
                )}
            </ScrollView>
        </View>
    );
}
