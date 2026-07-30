import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    completeServiceHistorySetup,
    type ServiceCompletionInput,
} from '../services/database';
import type { ServiceInterval } from '../types/database.types';
import { isPastOrTodayIsoDate, toIsoDate } from '../utils/dates';
import { parseWholeNumberInput } from '../utils/recordValidation';

type WizardChoice = 'just_done' | 'a_while_ago' | 'dont_know' | null;

interface StepState {
    choice: WizardChoice;
    kmInput: string;
    dateInput: string;
    inputMode: 'km' | 'date';
}

interface Props {
    visible: boolean;
    intervals: ServiceInterval[];
    currentOdometer: number;
    onFinish: () => void;
}

const INTERVAL_ICONS: Record<string, { lib: 'MaterialIcons' | 'MaterialCommunityIcons'; name: string }> = {
    'Oil Change': { lib: 'MaterialCommunityIcons', name: 'oil' },
    'Gearbox Oil Change': { lib: 'MaterialCommunityIcons', name: 'cog' },
    'Air Filter': { lib: 'MaterialCommunityIcons', name: 'air-filter' },
    'Brake Pads': { lib: 'MaterialCommunityIcons', name: 'car-brake-alert' },
    'Cleaning': { lib: 'MaterialIcons', name: 'cleaning-services' },
    'CVT & Pull Rollers': { lib: 'MaterialCommunityIcons', name: 'engine' },
    'Carburetor': { lib: 'MaterialCommunityIcons', name: 'tools' },
};

function getIcon(name: string, color: string, size = 22) {
    const info = INTERVAL_ICONS[name];
    if (!info) return <MaterialIcons name="build-circle" size={size} color={color} />;
    if (info.lib === 'MaterialCommunityIcons') {
        return <MaterialCommunityIcons name={info.name as any} size={size} color={color} />;
    }
    return <MaterialIcons name={info.name as any} size={size} color={color} />;
}

function createSteps(intervals: ServiceInterval[]): StepState[] {
    const today = toIsoDate(new Date());
    return intervals.map(() => ({
        choice: null,
        kmInput: '',
        dateInput: today,
        inputMode: 'km',
    }));
}

function categoryForInterval(interval: ServiceInterval): string {
    if (interval.type === 'replace') return 'engine';
    if (interval.type === 'clean') return 'general';
    return 'brakes';
}

export default function ServiceHistoryWizard({ visible, intervals, currentOdometer, onFinish }: Props) {
    const insets = useSafeAreaInsets();
    const [currentStep, setCurrentStep] = useState(0);
    const [steps, setSteps] = useState<StepState[]>(() => createSteps(intervals));
    const [saving, setSaving] = useState(false);
    const [inputError, setInputError] = useState('');

    useEffect(() => {
        if (!visible) return;
        setCurrentStep(0);
        setSteps(createSteps(intervals));
        setInputError('');
    }, [intervals, visible]);

    const interval = intervals[currentStep];
    const stepState = steps[currentStep];
    const isLastStep = currentStep === intervals.length - 1;

    const updateStep = (partial: Partial<StepState>) => {
        setSteps((previous) => {
            const next = [...previous];
            next[currentStep] = { ...next[currentStep], ...partial };
            return next;
        });
        setInputError('');
    };

    const validateCurrentStep = (): boolean => {
        if (!stepState || stepState.choice !== 'a_while_ago') return true;

        if (stepState.inputMode === 'date') {
            if (!isPastOrTodayIsoDate(stepState.dateInput)) {
                setInputError('Enter a valid date on or before today (YYYY-MM-DD).');
                return false;
            }
            return true;
        }

        const result = parseWholeNumberInput(stepState.kmInput, {
            label: 'Service odometer',
            min: 0,
        });
        if (!result.ok) {
            setInputError(result.message);
            return false;
        }
        if (result.value > currentOdometer) {
            setInputError(`Cannot exceed current odometer (${currentOdometer.toLocaleString()} KM).`);
            return false;
        }
        return true;
    };

    const buildEntries = (): ServiceCompletionInput[] => {
        const today = toIsoDate(new Date());
        const entries: ServiceCompletionInput[] = [];

        steps.forEach((step, index) => {
            const serviceInterval = intervals[index];
            if (!serviceInterval || step.choice === null || step.choice === 'dont_know') return;

            const isDateOnly = step.choice === 'a_while_ago' && step.inputMode === 'date';
            entries.push({
                title: `${serviceInterval.name} — History Setup`,
                date: isDateOnly ? step.dateInput : today,
                mileage: isDateOnly
                    ? 0
                    : step.choice === 'just_done'
                        ? currentOdometer
                        : Number(step.kmInput),
                category: categoryForInterval(serviceInterval),
                notes: isDateOnly
                    ? 'Date-only history — entered during Service History Setup'
                    : 'Entered during Service History Setup',
                cost: null,
                serviceIntervalId: serviceInterval.id,
                setsOdometerBaseline: !isDateOnly,
            });
        });

        return entries;
    };

    const handleFinish = async (skip: boolean) => {
        if (saving) return;
        setSaving(true);
        try {
            await completeServiceHistorySetup(skip ? [] : buildEntries());
            onFinish();
        } catch (error) {
            Alert.alert(
                'History setup not saved',
                error instanceof Error ? error.message : 'Your history was not changed. Try again.'
            );
        } finally {
            setSaving(false);
        }
    };

    const goNext = () => {
        if (!stepState || stepState.choice === null || !validateCurrentStep()) return;
        if (isLastStep) {
            void handleFinish(false);
        } else {
            setCurrentStep((step) => step + 1);
        }
    };

    if (!visible) return null;
    if (!interval || !stepState) {
        return (
            <View style={StyleSheet.absoluteFill} className="bg-[#081421] items-center justify-center">
                <ActivityIndicator size="large" color="#a9c7ff" />
            </View>
        );
    }

    return (
        <View style={StyleSheet.absoluteFill} className="bg-[#081421]">
            <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                <View
                    className="px-6 pb-6"
                    style={{ paddingTop: Math.max(insets.top, 24) }}
                >
                    <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-row items-center gap-2">
                            <MaterialIcons name="history" size={20} color="#a9c7ff" />
                            <Text className="font-bold text-xs uppercase tracking-[0.2em] text-primary">History Setup</Text>
                        </View>
                        <TouchableOpacity onPress={() => void handleFinish(true)} activeOpacity={0.7} disabled={saving}>
                            <View className="px-3 py-1.5 rounded-full border border-white/10">
                                <Text className="text-xs text-white/50 uppercase font-bold">Skip All</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                    <Text className="text-2xl font-bold text-white mt-1">When was this last done?</Text>
                    <Text className="text-xs text-white/60 mt-2 leading-5">
                        Odometer entries start mileage counters. Date-only entries are saved as history without starting a counter.
                    </Text>
                    <Text className="text-xs text-white/40 mt-3 uppercase tracking-widest">
                        Step {currentStep + 1} of {intervals.length}
                    </Text>
                </View>

                <View className="mx-6 mb-6 bg-[#0c1d2e] border border-white/5 rounded-2xl p-5">
                    <View className="flex-row items-center gap-3 mb-6">
                        <View className="w-12 h-12 rounded-xl bg-primary/10 items-center justify-center">
                            {getIcon(interval.name, '#a9c7ff')}
                        </View>
                        <View className="flex-1">
                            <Text className="text-xl font-bold text-white">{interval.name}</Text>
                            <Text className="text-xs uppercase text-white/40">
                                Current template: {interval.interval_km ? `${interval.interval_km.toLocaleString()} KM` : 'As needed'}
                            </Text>
                        </View>
                    </View>

                    <View className="gap-3">
                        <TouchableOpacity onPress={() => updateStep({ choice: 'just_done' })}>
                            <View className={`flex-row items-center gap-3 p-4 rounded-xl border ${stepState.choice === 'just_done' ? 'bg-primary/20 border-primary' : 'bg-white/5 border-white/10'}`}>
                                <MaterialIcons name="check-circle" size={22} color={stepState.choice === 'just_done' ? '#a9c7ff' : '#454747'} />
                                <Text className="text-white font-bold">I just did it</Text>
                            </View>
                        </TouchableOpacity>

                        <View className={`rounded-xl border overflow-hidden ${stepState.choice === 'a_while_ago' ? 'bg-white/10 border-white/30' : 'bg-white/5 border-white/10'}`}>
                            <TouchableOpacity onPress={() => updateStep({ choice: 'a_while_ago' })}>
                                <View className="flex-row items-center gap-3 p-4">
                                    <MaterialIcons name="history" size={22} color={stepState.choice === 'a_while_ago' ? '#a9c7ff' : '#454747'} />
                                    <Text className="text-white font-bold">A while ago</Text>
                                </View>
                            </TouchableOpacity>
                            {stepState.choice === 'a_while_ago' && (
                                <View className="px-4 pb-4">
                                    <View className="flex-row gap-2 mb-3">
                                        <TouchableOpacity
                                            className={`flex-1 py-2 rounded-lg items-center border ${stepState.inputMode === 'km' ? 'bg-primary/20 border-primary' : 'border-white/10'}`}
                                            onPress={() => updateStep({ inputMode: 'km' })}
                                        >
                                            <Text className="text-white text-xs font-bold uppercase">By odometer</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            className={`flex-1 py-2 rounded-lg items-center border ${stepState.inputMode === 'date' ? 'bg-primary/20 border-primary' : 'border-white/10'}`}
                                            onPress={() => updateStep({ inputMode: 'date' })}
                                        >
                                            <Text className="text-white text-xs font-bold uppercase">By date</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <TextInput
                                        className={`bg-white/5 px-4 py-3 rounded-xl text-white ${inputError ? 'border border-error' : ''}`}
                                        placeholder={stepState.inputMode === 'km' ? 'Enter KM' : 'YYYY-MM-DD'}
                                        placeholderTextColor="#717373"
                                        keyboardType={stepState.inputMode === 'km' ? 'number-pad' : 'default'}
                                        value={stepState.inputMode === 'km' ? stepState.kmInput : stepState.dateInput}
                                        onChangeText={(value) => stepState.inputMode === 'km'
                                            ? updateStep({ kmInput: value })
                                            : updateStep({ dateInput: value })}
                                    />
                                    {inputError ? <Text className="text-error text-xs mt-1">{inputError}</Text> : null}
                                </View>
                            )}
                        </View>

                        <TouchableOpacity onPress={() => updateStep({ choice: 'dont_know' })}>
                            <View className={`flex-row items-center gap-3 p-4 rounded-xl border ${stepState.choice === 'dont_know' ? 'bg-error/20 border-error/50' : 'bg-white/5 border-white/10'}`}>
                                <MaterialIcons name="help-outline" size={22} color={stepState.choice === 'dont_know' ? '#ffb4ab' : '#454747'} />
                                <Text className="text-white font-bold">I don&apos;t know</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>

                <View
                    className="px-6 mt-auto"
                    style={{ paddingBottom: Math.max(insets.bottom, 40) }}
                >
                    <TouchableOpacity onPress={goNext} disabled={stepState.choice === null || saving}>
                        <View className={`w-full h-14 rounded-xl items-center justify-center ${stepState.choice !== null ? 'bg-primary' : 'bg-white/10'}`}>
                            {saving ? <ActivityIndicator color="#081421" /> : (
                                <Text className="font-bold text-[#081421] uppercase tracking-widest">
                                    {isLastStep ? 'Finish' : 'Next'}
                                </Text>
                            )}
                        </View>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}
