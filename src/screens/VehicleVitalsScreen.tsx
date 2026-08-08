import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { getVehicleVitals, saveVehicleVitals } from '../services/database';
import type { MainStackNavigationProp } from '../navigation/types';
import { parseVehicleVitalInput } from '../utils/recordValidation';
import AppIconButton from '../components/ui/AppIconButton';
import AppTopBar from '../components/ui/AppTopBar';
import AppScreen from '../components/ui/AppScreen';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';
import { formatDate, localizeErrorMessage, useTranslation } from '../i18n';

type VitalsFormData = {
    oil_life_pct: string;
    tire_pressure_psi: string;
    battery_health_pct: string;
    coolant_temp_c: string;
    brake_pad_pct: string;
};

const EMPTY_VITALS_FORM: VitalsFormData = {
    oil_life_pct: '',
    tire_pressure_psi: '',
    battery_health_pct: '',
    coolant_temp_c: '',
    brake_pad_pct: '',
};

export default function VehicleVitalsScreen() {
    const { isRTL, t } = useTranslation();
    const navigation = useNavigation<MainStackNavigationProp>();
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [persistedFormData, setPersistedFormData] = useState<VitalsFormData>(EMPTY_VITALS_FORM);

    const { control, handleSubmit, reset } = useForm<VitalsFormData>({
        defaultValues: EMPTY_VITALS_FORM,
    });

    const loadVitals = useCallback(async (isCurrent: () => boolean) => {
        const data = await getVehicleVitals();
        if (!isCurrent()) return;
        if (data) {
            const formData = {
                oil_life_pct: String(data.oil_life_pct),
                tire_pressure_psi: String(data.tire_pressure_psi),
                battery_health_pct: String(data.battery_health_pct),
                coolant_temp_c: String(data.coolant_temp_c),
                brake_pad_pct: String(data.brake_pad_pct),
            };
            reset(formData);
            setPersistedFormData(formData);
            setLastUpdated(formatDate(new Date(data.updated_at)));
        } else {
            reset(EMPTY_VITALS_FORM);
            setPersistedFormData(EMPTY_VITALS_FORM);
            setLastUpdated(null);
        }
    }, [reset]);

    const { error: loadError, loading, reload } = useFocusedLoader(
        loadVitals,
        t('vitals.loadError'),
        t('vitals.loadLog')
    );

    const onSubmit = async (data: VitalsFormData) => {
        setSaving(true);
        try {
            const parsedEntries = Object.entries(data).map(([field, value]) => {
                const result = parseVehicleVitalInput(field as keyof VitalsFormData, value);
                if (!result.ok) throw new Error(result.message);
                return [field, result.value] as const;
            });
            const parsedVitals = Object.fromEntries(parsedEntries) as Record<keyof VitalsFormData, number>;

            await saveVehicleVitals(parsedVitals);
            await reload();
            setIsEditing(false);
        } catch (err) {
            Alert.alert(t('vitals.saveFailed'), localizeErrorMessage(err, t('vitals.saveFailedBody')));
        } finally {
            setSaving(false);
        }
    };

    const beginEditing = () => {
        reset(persistedFormData);
        setIsEditing(true);
    };

    const cancelEditing = () => {
        reset(persistedFormData);
        setIsEditing(false);
    };

    if (loading || loadError) {
        return <ScreenLoadState error={loadError} loading={loading} onBack={() => navigation.goBack()} onRetry={reload} title={t('vitals.title')} />;
    }

    const InputRow = ({ label, name, icon, unit }: { label: string; name: keyof VitalsFormData; icon: React.ReactNode; unit: string }) => (
        <View className="mb-6 bg-surface-container-low p-4 rounded-xl border border-secondary/10 gap-3">
            <View className="flex-row items-center gap-4">
                <View className="w-10 h-10 bg-surface-container-highest rounded-full items-center justify-center border border-white/5">
                    {icon}
                </View>
                <Text className="font-headline text-base text-on-surface flex-1">{label}</Text>
            </View>
            <View>
                {isEditing ? (
                    <Controller
                        control={control}
                        name={name}
                        rules={{
                            validate: (value) => {
                                const result = parseVehicleVitalInput(name, value);
                                return result.ok || result.message;
                            },
                        }}
                        render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                            <View>
                                <View className="flex-row items-center gap-2">
                                    <TextInput
                                        accessibilityLabel={label}
                                        className={`flex-1 min-w-0 bg-surface-container-highest rounded-lg px-3 py-2 text-right font-headline text-lg text-primary ${error ? 'border border-error' : ''}`}
                                        keyboardType="number-pad"
                                        onBlur={onBlur}
                                        onChangeText={onChange}
                                        value={value}
                                        placeholder="—"
                                        placeholderTextColor="#8e9196"
                                    />
                                    <Text className="font-label text-xs uppercase text-on-surface-variant/60 flex-shrink-0">{unit}</Text>
                                </View>
                                {error ? (
                                    <Text className="text-error font-body text-xs mt-1 text-right">{error.message}</Text>
                                ) : null}
                            </View>
                        )}
                    />
                ) : (
                    <Controller
                        control={control}
                        name={name}
                        render={({ field: { value } }) => (
                            <View className="flex-row items-baseline justify-end gap-2">
                                <Text className="font-headline text-xl font-bold text-primary">{value || t('vitals.notSet')}</Text>
                                <Text className="font-label text-xs uppercase text-on-surface-variant/60">{lastUpdated ? unit : ''}</Text>
                            </View>
                        )}
                    />
                )}
            </View>
        </View>
    );

    return (
        <AppScreen edges={['top', 'bottom', 'left', 'right']}>
            <AppTopBar
                leading={<AppIconButton accessibilityLabel={t('common.back')} icon={isRTL ? 'arrow-forward' : 'arrow-back'} className="-ml-2" onPress={() => navigation.goBack()} />}
                trailing={<TouchableOpacity onPress={isEditing ? cancelEditing : beginEditing} className="flex-row items-center gap-2 bg-surface-container-highest px-4 py-2 rounded-full border border-outline-variant/30" accessibilityLabel={isEditing ? t('vitals.cancelEditing') : t('vitals.editReadings')} accessibilityRole="button">
                    <MaterialIcons name={isEditing ? 'close' : 'edit'} size={18} color={isEditing ? '#ffb4ab' : '#a9c7ff'} />
                    <Text className={`font-label text-xs font-bold uppercase tracking-widest ${isEditing ? 'text-error' : 'text-primary'}`}>
                        {isEditing ? t('common.cancel') : t('common.edit')}
                    </Text>
                </TouchableOpacity>}
            >
                <Text className="font-headline text-xl font-bold tracking-tighter text-slate-100 uppercase" numberOfLines={1}>{t('vitals.title')}</Text>
            </AppTopBar>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 32 }} className="flex-grow">
                <Text className="font-body text-sm text-on-surface-variant text-center mb-5 bg-primary/10 border border-primary/20 px-4 py-3 rounded-xl">
                    {t('vitals.description')}
                </Text>
                {lastUpdated && !isEditing && (
                    <Text className="font-label text-xs text-on-surface-variant/50 uppercase tracking-widest text-center mb-8">
                        {t('vitals.lastUpdated', { date: lastUpdated })}
                    </Text>
                )}
                {isEditing && (
                    <Text className="font-body text-sm text-primary/80 text-center mb-8 bg-primary/10 py-3 rounded-lg">
                        {t('vitals.editHint')}
                    </Text>
                )}

                <InputRow label={t('vitals.oilLife')} name="oil_life_pct" icon={<MaterialCommunityIcons name="oil" size={20} color="#a9c7ff" />} unit="%" />
                <InputRow label={t('vitals.tirePressure')} name="tire_pressure_psi" icon={<MaterialCommunityIcons name="tire" size={20} color="#a9c7ff" />} unit="PSI" />
                <InputRow label={t('vitals.batteryHealth')} name="battery_health_pct" icon={<MaterialCommunityIcons name="car-battery" size={20} color="#a9c7ff" />} unit="%" />
                <InputRow label={t('vitals.coolantTemp')} name="coolant_temp_c" icon={<MaterialIcons name="thermostat" size={20} color="#a9c7ff" />} unit="°C" />
                <InputRow label={t('vitals.brakePads')} name="brake_pad_pct" icon={<MaterialCommunityIcons name="car-brake-alert" size={20} color="#a9c7ff" />} unit="%" />

                {isEditing && (
                    <TouchableOpacity
                        className="bg-primary rounded-xl py-4 items-center mt-6 shadow-lg"
                        accessibilityLabel={t('vitals.saveReadingsLabel')}
                        accessibilityRole="button"
                        accessibilityState={{ busy: saving, disabled: saving }}
                        onPress={handleSubmit(onSubmit)}
                        disabled={saving}
                        activeOpacity={0.85}
                    >
                        {saving ? (
                            <ActivityIndicator color="#081421" />
                        ) : (
                            <Text className="font-label text-base font-bold text-[#081421] uppercase tracking-wider">{t('vitals.saveReadings')}</Text>
                        )}
                    </TouchableOpacity>
                )}
            </ScrollView>
        </AppScreen>
    );
}
