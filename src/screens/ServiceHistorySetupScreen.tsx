import React, { useState } from 'react';
import {
    View, Text, TouchableOpacity, TextInput, StyleSheet,
    ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { addServiceLog, resetIntervalByName } from '../services/database';
import type { ServiceInterval } from '../types/database.types';

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

export default function ServiceHistoryWizard({ visible, intervals, currentOdometer, onFinish }: Props) {
    const [currentStep, setCurrentStep] = useState(0);
    const [steps, setSteps] = useState<StepState[]>(() =>
        intervals.map(() => ({ choice: null, kmInput: '', dateInput: new Date().toISOString().split('T')[0], inputMode: 'km' }))
    );
    const [saving, setSaving] = useState(false);
    const [kmError, setKmError] = useState('');

    const interval = intervals[currentStep];
    const stepState = steps[currentStep];
    const isLastStep = currentStep === intervals.length - 1;

    const updateStep = (partial: Partial<StepState>) => {
        setSteps(prev => {
            const next = [...prev];
            next[currentStep] = { ...next[currentStep], ...partial };
            return next;
        });
        setKmError('');
    };

    const validateAndAdvance = () => {
        if (stepState.choice === 'a_while_ago' && stepState.inputMode === 'km') {
            const km = parseInt(stepState.kmInput, 10);
            if (!stepState.kmInput || isNaN(km) || km < 0) {
                setKmError('Please enter a valid KM value.');
                return false;
            }
            if (km > currentOdometer) {
                setKmError(`Cannot exceed current odometer (${currentOdometer.toLocaleString()} KM).`);
                return false;
            }
        }
        return true;
    };

    const goNext = () => {
        if (stepState.choice === null) return; // must pick something
        if (!validateAndAdvance()) return;
        if (isLastStep) {
            handleFinish(false);
        } else {
            setCurrentStep(s => s + 1);
        }
    };

    const handleFinish = async (skip: boolean) => {
        setSaving(true);
        const today = new Date().toISOString().split('T')[0];
        const stepsToProcess = skip ? [] : steps;

        for (let i = 0; i < stepsToProcess.length; i++) {
            const step = stepsToProcess[i];
            const ivl = intervals[i];
            if (!ivl) continue;

            if (step.choice === 'just_done') {
                const km = currentOdometer;
                await resetIntervalByName(ivl.name, km);
                await addServiceLog({
                    title: `${ivl.name} — Legacy Log`,
                    date: today,
                    mileage: km,
                    category: ivl.type === 'replace' ? 'engine' : ivl.type === 'clean' ? 'general' : 'brakes',
                    notes: 'Legacy log — entered during Service History Setup',
                    cost: null,
                    service_type: ivl.name,
                });
            } else if (step.choice === 'a_while_ago') {
                let km = 0;
                if (step.inputMode === 'km') {
                    km = parseInt(step.kmInput, 10) || 0;
                }
                // Date mode: we use km=0 as fallback (the date is stored in log.date)
                const logDate = step.inputMode === 'date' ? step.dateInput : today;
                await resetIntervalByName(ivl.name, km);
                await addServiceLog({
                    title: `${ivl.name} — Legacy Log`,
                    date: logDate,
                    mileage: km,
                    category: ivl.type === 'replace' ? 'engine' : ivl.type === 'clean' ? 'general' : 'brakes',
                    notes: 'Legacy log — entered during Service History Setup',
                    cost: null,
                    service_type: ivl.name,
                });
            }
            // 'dont_know' → leave at 0, do nothing
        }

        setSaving(false);
        onFinish();
    };

    const progress = ((currentStep + 1) / intervals.length) * 100;

    if (!visible) return null;

    return (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#081421', zIndex: 999 }]}>
            <View style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                    {/* Header */}
                    <View className="px-6 pt-14 pb-6">
                        <View className="flex-row items-center justify-between mb-2">
                            <View className="flex-row items-center gap-2">
                                <MaterialIcons name="history" size={20} color="#a9c7ff" />
                                <Text className="font-label text-[10px] uppercase tracking-[0.2em] text-primary">
                                    Service History Setup
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => handleFinish(true)}
                                activeOpacity={0.8}
                            >
                                <View className="px-3 py-1.5 rounded-full border border-secondary/30">
                                    <Text className="font-label text-xs text-secondary/70 uppercase tracking-widest">
                                        Skip All
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                        <Text className="font-headline text-2xl font-bold text-on-surface mt-1">
                            When was this last done?
                        </Text>
                        <Text className="font-body text-sm text-secondary/70 mt-1">
                            This sets the baseline for your maintenance counters.
                        </Text>

                        {/* Progress bar */}
                        <View className="mt-5 mb-1">
                            <View className="flex-row justify-between mb-1.5">
                                <Text className="font-label text-[10px] text-secondary/50 uppercase tracking-widest">
                                    Step {currentStep + 1} of {intervals.length}
                                </Text>
                                <Text className="font-label text-[10px] text-primary/80 uppercase tracking-widest">
                                    {Math.round(progress)}%
                                </Text>
                            </View>
                            <View className="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
                                <View
                                    className="h-full bg-primary rounded-full"
                                    style={{ width: `${progress}%` }}
                                />
                            </View>
                        </View>
                    </View>

                    {/* Interval Card */}
                    {interval && (
                        <View className="mx-6 mb-6 bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-5">
                            <View className="flex-row items-center gap-3 mb-6">
                                <View className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 items-center justify-center">
                                    {getIcon(interval.name, '#a9c7ff', 22)}
                                </View>
                                <View className="flex-1">
                                    <Text className="font-headline text-xl font-bold text-on-surface">
                                        {interval.name}
                                    </Text>
                                    <Text className="font-label text-[10px] uppercase text-secondary/50 tracking-widest">
                                        Every {interval.interval_km ? `${interval.interval_km.toLocaleString()} KM` : 'As Needed'}
                                    </Text>
                                </View>
                            </View>

                            {/* Choice buttons */}
                            <View className="gap-3">
                                {/* Just done */}
                                <TouchableOpacity
                                    onPress={() => updateStep({ choice: 'just_done' })}
                                    activeOpacity={0.8}
                                >
                                    <View className={`flex-row items-center gap-3 p-4 rounded-xl border ${stepState.choice === 'just_done' ? 'bg-primary/15 border-primary' : 'bg-surface-container-high border-outline-variant/20'}`}>
                                        <MaterialIcons
                                            name="check-circle"
                                            size={22}
                                            color={stepState.choice === 'just_done' ? '#a9c7ff' : '#8e9196'}
                                        />
                                        <View className="flex-1">
                                            <Text className={`font-headline text-base font-bold ${stepState.choice === 'just_done' ? 'text-primary' : 'text-on-surface'}`}>
                                                I just did it
                                            </Text>
                                            <Text className="font-body text-xs text-secondary/60">
                                                Sets baseline to {currentOdometer.toLocaleString()} KM (now)
                                            </Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>

                                {/* A while ago */}
                                <TouchableOpacity
                                    onPress={() => updateStep({ choice: 'a_while_ago' })}
                                    activeOpacity={0.8}
                                >
                                    <View className={`rounded-xl border overflow-hidden ${stepState.choice === 'a_while_ago' ? 'bg-secondary/10 border-secondary/50' : 'bg-surface-container-high border-outline-variant/20'}`}>
                                        <View className="flex-row items-center gap-3 p-4">
                                            <MaterialIcons
                                                name="history"
                                                size={22}
                                                color={stepState.choice === 'a_while_ago' ? '#c6c6c6' : '#8e9196'}
                                            />
                                            <View className="flex-1">
                                                <Text className={`font-headline text-base font-bold ${stepState.choice === 'a_while_ago' ? 'text-on-surface' : 'text-on-surface'}`}>
                                                    A while ago
                                                </Text>
                                                <Text className="font-body text-xs text-secondary/60">
                                                    Enter the KM or date when it was done
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Expandable input area */}
                                        {stepState.choice === 'a_while_ago' && (
                                            <View className="px-4 pb-4">
                                                {/* KM / Date toggle */}
                                                <View className="flex-row bg-surface-container-highest rounded-lg p-1 mb-3">
                                                    <TouchableOpacity
                                                        onPress={() => { updateStep({ inputMode: 'km' }); setKmError(''); }}
                                                        activeOpacity={0.8}
                                                        style={{ flex: 1 }}
                                                    >
                                                        <View className={`py-1.5 rounded-md items-center ${stepState.inputMode === 'km' ? 'bg-secondary/30' : ''}`}>
                                                            <Text className={`font-label text-xs font-bold uppercase ${stepState.inputMode === 'km' ? 'text-on-surface' : 'text-secondary/50'}`}>
                                                                By KM
                                                            </Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        onPress={() => { updateStep({ inputMode: 'date' }); setKmError(''); }}
                                                        activeOpacity={0.8}
                                                        style={{ flex: 1 }}
                                                    >
                                                        <View className={`py-1.5 rounded-md items-center ${stepState.inputMode === 'date' ? 'bg-secondary/30' : ''}`}>
                                                            <Text className={`font-label text-xs font-bold uppercase ${stepState.inputMode === 'date' ? 'text-on-surface' : 'text-secondary/50'}`}>
                                                                By Date
                                                            </Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                </View>

                                                {stepState.inputMode === 'km' ? (
                                                    <View>
                                                        <TextInput
                                                            className={`bg-surface-container-highest px-4 py-3 rounded-xl border text-on-surface font-body text-base ${kmError ? 'border-error' : 'border-outline-variant/20'}`}
                                                            placeholder={`e.g. ${Math.max(0, currentOdometer - 1000).toLocaleString()}`}
                                                            placeholderTextColor="#454747"
                                                            keyboardType="numeric"
                                                            value={stepState.kmInput}
                                                            onChangeText={v => { updateStep({ kmInput: v }); setKmError(''); }}
                                                        />
                                                        {kmError ? (
                                                            <Text className="font-body text-xs text-error mt-1.5">{kmError}</Text>
                                                        ) : (
                                                            <Text className="font-body text-xs text-secondary/50 mt-1.5">
                                                                Max: {currentOdometer.toLocaleString()} KM
                                                            </Text>
                                                        )}
                                                    </View>
                                                ) : (
                                                    <TextInput
                                                        className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/20 text-on-surface font-body text-base"
                                                        placeholder="YYYY-MM-DD"
                                                        placeholderTextColor="#454747"
                                                        value={stepState.dateInput}
                                                        onChangeText={v => updateStep({ dateInput: v })}
                                                    />
                                                )}
                                            </View>
                                        )}
                                    </View>
                                </TouchableOpacity>

                                {/* Don't know */}
                                <TouchableOpacity
                                    onPress={() => updateStep({ choice: 'dont_know' })}
                                    activeOpacity={0.8}
                                >
                                    <View className={`flex-row items-center gap-3 p-4 rounded-xl border ${stepState.choice === 'dont_know' ? 'bg-error/10 border-error/50' : 'bg-surface-container-high border-outline-variant/20'}`}>
                                        <MaterialIcons
                                            name="help-outline"
                                            size={22}
                                            color={stepState.choice === 'dont_know' ? '#ffb4ab' : '#8e9196'}
                                        />
                                        <View className="flex-1">
                                            <Text className={`font-headline text-base font-bold ${stepState.choice === 'dont_know' ? 'text-error' : 'text-on-surface'}`}>
                                                I don't know
                                            </Text>
                                            <Text className="font-body text-xs text-secondary/60">
                                                Will show as Overdue — fix it later
                                            </Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {/* Bottom Navigation */}
                    <View className="px-6 pb-10 gap-3">
                        <TouchableOpacity
                            onPress={goNext}
                            disabled={stepState.choice === null || saving}
                            activeOpacity={0.85}
                        >
                            <View className={`w-full h-14 rounded-xl items-center justify-center ${stepState.choice !== null ? 'bg-primary shadow-lg' : 'bg-surface-container-highest'}`}>
                                {saving ? (
                                    <ActivityIndicator color="#081421" />
                                ) : (
                                    <View className="flex-row items-center gap-2">
                                        <Text className={`font-headline font-bold text-base uppercase tracking-widest ${stepState.choice !== null ? 'text-on-primary' : 'text-secondary/40'}`}>
                                            {isLastStep ? 'Finish Setup' : 'Next'}
                                        </Text>
                                        {!isLastStep && (
                                            <MaterialIcons
                                                name="arrow-forward"
                                                size={18}
                                                color={stepState.choice !== null ? '#081421' : '#454747'}
                                            />
                                        )}
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>

                        {currentStep > 0 && (
                            <TouchableOpacity
                                onPress={() => setCurrentStep(s => s - 1)}
                            >
                                <View className="w-full py-3 items-center">
                                    <Text className="font-label text-xs text-secondary/50 uppercase tracking-widest">
                                        ← Back
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        )}
                    </View>
                </ScrollView>
            </View>
        </View>
    );
}

