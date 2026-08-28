import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { useAppStore } from '../../store/useAppStore';
import { getVehicleProfile, saveInitialVehicleSetup } from '../../services/database';
import { syncMaintenanceNotifications } from '../../services/notifications';
import AppFormScreen from '../../components/ui/AppFormScreen';
import { parseWholeNumberInput } from '../../utils/recordValidation';
import ScooterSelectionFields from '../../components/vehicle/ScooterSelectionFields';
import { isScooterSelectionComplete, resolveScooterSelection, selectionFromProfile } from '../../catalog/scooterCatalog';
import {
    createGuidedSelectionDraft,
    type GuidedScooterSelectionDraft,
} from '../../catalog/guidedScooterIdentification';
import type { VehiclePurchaseCondition } from '../../types/database.types';
import { useTranslation } from '../../i18n';

type SetupFormData = {
    mileage: string;
};

export default function VehicleSetupScreen() {
    const { t, isRTL } = useTranslation();
    const maintenanceReminders = useAppStore((state) => state.maintenanceReminders);
    const completeVehicleSetup = useAppStore((s) => s.completeVehicleSetup);
    const [saving, setSaving] = useState(false);
    const [purchaseCondition, setPurchaseCondition] = useState<Exclude<VehiclePurchaseCondition, 'unknown'> | null>(null);
    const [selectionDraft, setSelectionDraft] = useState<GuidedScooterSelectionDraft>(() => createGuidedSelectionDraft());
    const [showSelectionErrors, setShowSelectionErrors] = useState(false);

    const { control, handleSubmit, reset, formState: { errors } } = useForm<SetupFormData>({
        defaultValues: { mileage: '' }
    });

    useEffect(() => {
        getVehicleProfile().then((profile) => {
            if (!profile) return;
            reset({
                mileage: String(profile.current_mileage),
            });
            setSelectionDraft(createGuidedSelectionDraft(selectionFromProfile(profile) ?? {}));
            if (profile.purchase_condition === 'new' || profile.purchase_condition === 'used') {
                setPurchaseCondition(profile.purchase_condition);
            }
            if (profile.has_completed_setup === 1) {
                completeVehicleSetup();
            }
        }).catch((error) => console.info('Existing vehicle setup could not be prefilled:', error));
    }, [completeVehicleSetup, reset]);

    const onSubmit = async (data: SetupFormData) => {
        const resolvedSelection = resolveScooterSelection(selectionDraft.selection);
        if (!resolvedSelection || !isScooterSelectionComplete(selectionDraft.selection)) {
            setShowSelectionErrors(true);
            Alert.alert(t('settings.selectScooter'), t('setup.selectBody'));
            return;
        }
        const mileageResult = parseWholeNumberInput(data.mileage, { label: t('setup.currentOdometer') });
        if (!mileageResult.ok) {
            Alert.alert(t('setup.invalidTitle'), t('setup.invalidBody'));
            return;
        }
        if (!purchaseCondition) {
            Alert.alert(t('setup.purchaseCondition'), t('setup.purchaseConditionRequired'));
            return;
        }
        
        setSaving(true);
        try {
            await saveInitialVehicleSetup({
                currentMileage: mileageResult.value,
                selection: resolvedSelection,
                purchaseCondition,
            });
            await syncMaintenanceNotifications(maintenanceReminders);
            completeVehicleSetup();
        } catch (err) {
            console.error('Setup error:', err);
            Alert.alert(t('documents.saveErrorTitle'), t('setup.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <AppFormScreen>
            <View className="items-center mb-10">
                <View className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 mb-6">
                    <MaterialCommunityIcons name="car-cog" size={40} color="#a9c7ff" />
                </View>
                <Text className={`font-headline text-3xl font-bold text-on-surface mb-2 ${isRTL ? 'font-body' : ''}`}>{t('setup.title')}</Text>
                <Text className={`font-body text-on-surface-variant/80 text-center px-4 ${isRTL ? 'font-body' : ''}`}>
                    {t('setup.body')}
                </Text>
            </View>

            <View className="bg-surface-container-lowest border border-outline-variant/15 rounded-2xl p-5 mb-8">
                <View className="flex-row items-center gap-3 mb-5">
                    <MaterialCommunityIcons name="book-open-page-variant" size={22} color="#a9c7ff" />
                    <View className="flex-1">
                        <Text className={`font-headline text-lg font-bold text-on-surface ${isRTL ? 'font-body' : ''}`}>{t('setup.chooseScooter')}</Text>
                        <Text className="font-body text-xs text-on-surface-variant mt-1">{t('setup.catalogBody')}</Text>
                    </View>
                </View>
                <ScooterSelectionFields
                    value={selectionDraft}
                    onChange={(next) => {
                        setSelectionDraft(next);
                        setShowSelectionErrors(false);
                    }}
                    showErrors={showSelectionErrors}
                />
            </View>

            <View className="flex-col gap-2 mb-8">
                <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest pl-1">{t('setup.currentOdometer')}</Text>
                
                <Controller
                    control={control}
                    rules={{
                        required: t('setup.mileageRequired'),
                        pattern: { value: /^[0-9]+$/, message: t('setup.validNumber') },
                        min: { value: 0, message: t('setup.nonNegative') }
                    }}
                    name="mileage"
                    render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                            accessibilityLabel={t('setup.odometerA11y')}
                            className={`bg-surface-container-high rounded-xl px-5 py-4 text-on-surface font-headline text-2xl tracking-wider border ${errors.mileage ? 'border-error' : 'border-outline-variant/30'}`}
                            placeholder={t('setup.odometerExample')}
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

            <View className="mb-8">
                <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest pl-1 mb-3">{t('setup.purchaseCondition')}</Text>
                <View className="gap-3">
                    {(['new', 'used'] as const).map((condition) => {
                        const selected = purchaseCondition === condition;
                        return (
                            <TouchableOpacity
                                accessibilityRole="radio"
                                accessibilityState={{ checked: selected }}
                                className={`min-h-16 rounded-xl border px-4 py-3 flex-row items-center gap-3 ${selected ? 'border-primary bg-primary/10' : 'border-outline-variant/30 bg-surface-container-high'}`}
                                key={condition}
                                onPress={() => setPurchaseCondition(condition)}
                            >
                                <MaterialCommunityIcons name={selected ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={selected ? '#a9c7ff' : '#8e9196'} />
                                <View className="flex-1">
                                    <Text className="font-headline text-base font-bold text-on-surface">{t(condition === 'new' ? 'setup.boughtNew' : 'setup.boughtUsed')}</Text>
                                    <Text className="font-body text-xs text-on-surface-variant mt-1">{t(condition === 'new' ? 'setup.boughtNewBody' : 'setup.boughtUsedBody')}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            <TouchableOpacity
                className="bg-primary rounded-xl py-4 items-center"
                accessibilityLabel={t('setup.saveA11y')}
                accessibilityRole="button"
                accessibilityState={{ busy: saving, disabled: saving }}
                onPress={handleSubmit(onSubmit)}
                disabled={saving}
                activeOpacity={0.85}
            >
                {saving ? (
                    <ActivityIndicator color="#081421" />
                ) : (
                    <Text className="font-label text-base font-bold text-[#081421] uppercase tracking-wider">{t('setup.save')}</Text>
                )}
            </TouchableOpacity>
        </AppFormScreen>
    );
}
