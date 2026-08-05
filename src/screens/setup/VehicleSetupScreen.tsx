import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { useAppStore } from '../../store/useAppStore';
import { getVehicleProfile, saveInitialVehicleSetup } from '../../services/database';
import { syncMaintenanceNotifications } from '../../services/notifications';
import AppFormScreen from '../../components/ui/AppFormScreen';
import AppScreen from '../../components/ui/AppScreen';
import { parseWholeNumberInput } from '../../utils/recordValidation';
import ScooterSelectionFields from '../../components/ScooterSelectionFields';
import MaintenanceHistoryOnboarding from '../../components/MaintenanceHistoryOnboarding';
import {
    saveMaintenanceHistorySetup,
    skipMaintenanceHistorySetup,
} from '../../services/maintenanceHistoryOnboarding';
import { isScooterSelectionComplete, resolveScooterSelection, selectionFromProfile } from '../../catalog/scooterCatalog';
import {
    createGuidedSelectionDraft,
    type GuidedScooterSelectionDraft,
} from '../../catalog/guidedScooterIdentification';
import { getMaintenanceProfileForSelection } from '../../maintenance/profiles';

type SetupFormData = {
    mileage: string;
    dailyAvg: string;
};

export default function VehicleSetupScreen() {
    const maintenanceReminders = useAppStore((state) => state.maintenanceReminders);
    const completeVehicleSetup = useAppStore((s) => s.completeVehicleSetup);
    const [saving, setSaving] = useState(false);
    const [savedOdometerKm, setSavedOdometerKm] = useState<number | null>(null);
    const [selectionDraft, setSelectionDraft] = useState<GuidedScooterSelectionDraft>(() => createGuidedSelectionDraft());
    const [showSelectionErrors, setShowSelectionErrors] = useState(false);

    const { control, handleSubmit, reset, formState: { errors } } = useForm<SetupFormData>({
        defaultValues: { mileage: '', dailyAvg: '' }
    });

    useEffect(() => {
        getVehicleProfile().then((profile) => {
            if (!profile) return;
            reset({
                mileage: String(profile.current_mileage),
                dailyAvg: String(profile.daily_average_km),
            });
            setSelectionDraft(createGuidedSelectionDraft(selectionFromProfile(profile) ?? {}));
            if (profile.has_completed_setup === 1) {
                const selection = selectionFromProfile(profile);
                if (selection && getMaintenanceProfileForSelection(selection)) {
                    setSavedOdometerKm(profile.current_mileage);
                } else {
                    completeVehicleSetup();
                }
            }
        }).catch((error) => console.info('Existing vehicle setup could not be prefilled:', error));
    }, [completeVehicleSetup, reset]);

    const onSubmit = async (data: SetupFormData) => {
        const resolvedSelection = resolveScooterSelection(selectionDraft.selection);
        if (!resolvedSelection || !isScooterSelectionComplete(selectionDraft.selection)) {
            setShowSelectionErrors(true);
            Alert.alert('Select your scooter', 'Choose a brand, model, manual version, and any required exact variant before continuing.');
            return;
        }
        const mileageResult = parseWholeNumberInput(data.mileage, { label: 'Current odometer' });
        const dailyAverageResult = parseWholeNumberInput(data.dailyAvg, { label: 'Daily average' });
        if (!mileageResult.ok || !dailyAverageResult.ok) {
            Alert.alert('Invalid vehicle details', 'Enter the odometer and daily average as non-negative whole numbers.');
            return;
        }
        
        setSaving(true);
        try {
            await saveInitialVehicleSetup({
                currentMileage: mileageResult.value,
                dailyAverageKm: dailyAverageResult.value,
                selection: resolvedSelection,
            });
            if (getMaintenanceProfileForSelection(resolvedSelection)) {
                setSavedOdometerKm(mileageResult.value);
            } else {
                await syncMaintenanceNotifications(maintenanceReminders);
                completeVehicleSetup();
            }
        } catch (err) {
            console.error('Setup error:', err);
            Alert.alert('Error', 'Failed to save vehicle profile.');
        } finally {
            setSaving(false);
        }
    };

    const finishHistorySetup = async (operation: () => Promise<void>) => {
        setSaving(true);
        try {
            await operation();
            await syncMaintenanceNotifications(maintenanceReminders);
            completeVehicleSetup();
        } catch (error) {
            console.error('Maintenance history setup error:', error);
            Alert.alert(
                'History setup not saved',
                error instanceof Error ? error.message : 'Your vehicle is saved. Try the history step again.'
            );
        } finally {
            setSaving(false);
        }
    };

    if (savedOdometerKm !== null) {
        return (
            <AppScreen edges={['top', 'bottom', 'left', 'right']}>
                <MaintenanceHistoryOnboarding
                    currentOdometerKm={savedOdometerKm}
                    onComplete={(draft) => finishHistorySetup(() => saveMaintenanceHistorySetup(draft))}
                    onSkip={() => finishHistorySetup(skipMaintenanceHistorySetup)}
                    saving={saving}
                />
            </AppScreen>
        );
    }

    return (
        <AppFormScreen>
            <View className="items-center mb-10">
                <View className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 mb-6">
                    <MaterialCommunityIcons name="car-cog" size={40} color="#a9c7ff" />
                </View>
                <Text className="font-headline text-3xl font-bold text-on-surface mb-2">Set Up Your Vehicle</Text>
                <Text className="font-body text-on-surface-variant/80 text-center px-4">
                    Select the exact scooter manual first, then enter its current odometer and typical daily distance.
                </Text>
            </View>

            <View className="bg-surface-container-lowest border border-outline-variant/15 rounded-2xl p-5 mb-8">
                <View className="flex-row items-center gap-3 mb-5">
                    <MaterialCommunityIcons name="book-open-page-variant" size={22} color="#a9c7ff" />
                    <View className="flex-1">
                        <Text className="font-headline text-lg font-bold text-on-surface">Choose Your Scooter</Text>
                        <Text className="font-body text-xs text-on-surface-variant mt-1">Models and versions come from the installed manual catalog.</Text>
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
                            accessibilityLabel="Current odometer in kilometres"
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
                            accessibilityLabel="Daily driving average in kilometres"
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
                accessibilityLabel="Save vehicle setup"
                accessibilityRole="button"
                accessibilityState={{ busy: saving, disabled: saving }}
                onPress={handleSubmit(onSubmit)}
                disabled={saving}
                activeOpacity={0.85}
            >
                {saving ? (
                    <ActivityIndicator color="#081421" />
                ) : (
                    <Text className="font-label text-base font-bold text-[#081421] uppercase tracking-wider">Save Vehicle</Text>
                )}
            </TouchableOpacity>
        </AppFormScreen>
    );
}
