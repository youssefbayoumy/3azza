import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { useAppStore } from '../../store/useAppStore';
import { saveVehicleProfile } from '../../services/database';

type SetupFormData = {
    mileage: string;
    dailyAvg: string;
};

export default function VehicleSetupScreen() {
    const completeVehicleSetup = useAppStore((s) => s.completeVehicleSetup);
    const [saving, setSaving] = useState(false);

    const { control, handleSubmit, formState: { errors } } = useForm<SetupFormData>({
        defaultValues: { mileage: '', dailyAvg: '' }
    });

    const onSubmit = async (data: SetupFormData) => {
        const mileage = parseInt(data.mileage, 10);
        const dailyAvg = parseInt(data.dailyAvg, 10);
        
        setSaving(true);
        try {
            await saveVehicleProfile({
                current_mileage: mileage,
                total_km_range: 0,
                has_completed_setup: 1,
                daily_average_km: isNaN(dailyAvg) ? 0 : dailyAvg,
                last_odometer_update_timestamp: new Date().toISOString()
            });
            completeVehicleSetup();
        } catch (err) {
            console.error('Setup error:', err);
            Alert.alert('Error', 'Failed to save vehicle profile.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <View className="flex-1 bg-background justify-center px-6">
            <View className="items-center mb-10">
                <View className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 mb-6">
                    <MaterialCommunityIcons name="car-cog" size={40} color="#a9c7ff" />
                </View>
                <Text className="font-headline text-3xl font-bold text-on-surface mb-2">Vehicle Calibration</Text>
                <Text className="font-body text-on-surface-variant/80 text-center px-4">
                    Enter your current odometer reading and daily commute to initialize the predictive tracking system.
                </Text>
            </View>

            <View className="flex-col gap-2 mb-8">
                <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest pl-1">Current Odometer (KM)</Text>
                
                <Controller
                    control={control}
                    rules={{
                        required: 'Mileage is required',
                        pattern: { value: /^[0-9]+$/, message: 'Must be a valid number' },
                        min: { value: 0, message: 'Cannot be negative' }
                    }}
                    name="mileage"
                    render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                            className={`bg-surface-container-high rounded-xl px-5 py-4 text-on-surface font-headline text-2xl tracking-wider border ${errors.mileage ? 'border-error' : 'border-outline-variant/30'}`}
                            placeholder="e.g. 45000"
                            placeholderTextColor="#64748b"
                            keyboardType="number-pad"
                            onBlur={onBlur}
                            onChangeText={onChange}
                            value={value}
                        />
                    )}
                />
                {errors.mileage && (
                    <Text className="text-error font-body text-xs mt-1 pl-1">{errors.mileage.message}</Text>
                )}
            </View>

            <View className="flex-col gap-2 mb-8">
                <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest pl-1">Daily Drive Average (KM)</Text>
                
                <Controller
                    control={control}
                    rules={{
                        required: 'Average is required',
                        pattern: { value: /^[0-9]+$/, message: 'Must be a valid number' },
                        min: { value: 0, message: 'Cannot be negative' }
                    }}
                    name="dailyAvg"
                    render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                            className={`bg-surface-container-high rounded-xl px-5 py-4 text-on-surface font-headline text-2xl tracking-wider border ${errors.dailyAvg ? 'border-error' : 'border-outline-variant/30'}`}
                            placeholder="e.g. 30"
                            placeholderTextColor="#64748b"
                            keyboardType="number-pad"
                            onBlur={onBlur}
                            onChangeText={onChange}
                            value={value}
                        />
                    )}
                />
                {errors.dailyAvg && (
                    <Text className="text-error font-body text-xs mt-1 pl-1">{errors.dailyAvg.message}</Text>
                )}
            </View>

            <TouchableOpacity
                className="bg-primary rounded-xl py-4 items-center"
                onPress={handleSubmit(onSubmit)}
                disabled={saving}
                activeOpacity={0.85}
            >
                {saving ? (
                    <ActivityIndicator color="#081421" />
                ) : (
                    <Text className="font-label text-base font-bold text-[#081421] uppercase tracking-wider">Initialize</Text>
                )}
            </TouchableOpacity>
        </View>
    );
}
