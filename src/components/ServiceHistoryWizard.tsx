import React, { useState } from 'react';
import {
    View, Text, TouchableOpacity, TextInput, StyleSheet,
    ScrollView, ActivityIndicator, Modal
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
        intervals.map(() => ({ 
            choice: null, 
            kmInput: '', 
            dateInput: new Date().toISOString().split('T')[0], 
            inputMode: 'km' 
        }))
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
        if (stepState.choice === null) return;
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

        try {
            for (let i = 0; i < stepsToProcess.length; i++) {
                const step = stepsToProcess[i];
                const ivl = intervals[i];
                if (!ivl || step.choice === 'dont_know') continue;

                const km = step.choice === 'just_done' ? currentOdometer : (parseInt(step.kmInput, 10) || 0);
                const logDate = step.choice === 'a_while_ago' && step.inputMode === 'date' ? step.dateInput : today;

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
        } catch (error) {
            console.error("Wizard saving error:", error);
        } finally {
            setSaving(false);
            onFinish(); // Parent handles closing the modal
        }
    };

    const progress = ((currentStep + 1) / intervals.length) * 100;

    if (!visible) return null;

    return (
        <View style={StyleSheet.absoluteFill} className="bg-[#081421]">
            <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                <View className="px-6 pt-14 pb-6">
                    <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-row items-center gap-2">
                            <MaterialIcons name="history" size={20} color="#a9c7ff" />
                            <Text className="font-bold text-[10px] uppercase tracking-[0.2em] text-primary">History Setup</Text>
                        </View>
                        <TouchableOpacity onPress={() => handleFinish(true)} activeOpacity={0.7}>
                            <View className="px-3 py-1.5 rounded-full border border-white/10">
                                <Text className="text-[10px] text-white/50 uppercase font-bold">Skip All</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                    <Text className="text-2xl font-bold text-white mt-1">When was this last done?</Text>
                </View>

                {interval && (
                    <View className="mx-6 mb-6 bg-[#0c1d2e] border border-white/5 rounded-2xl p-5">
                        <View className="flex-row items-center gap-3 mb-6">
                            <View className="w-12 h-12 rounded-xl bg-primary/10 items-center justify-center">
                                {getIcon(interval.name, '#a9c7ff')}
                            </View>
                            <View className="flex-1">
                                <Text className="text-xl font-bold text-white">{interval.name}</Text>
                                <Text className="text-[10px] uppercase text-white/40">Every {interval.interval_km?.toLocaleString()} KM</Text>
                            </View>
                        </View>

                        <View className="gap-3">
                            {/* Option: Just Done */}
                            <TouchableOpacity onPress={() => updateStep({ choice: 'just_done' })}>
                                <View className={`flex-row items-center gap-3 p-4 rounded-xl border ${stepState.choice === 'just_done' ? 'bg-primary/20 border-primary' : 'bg-white/5 border-white/10'}`}>
                                    <MaterialIcons name="check-circle" size={22} color={stepState.choice === 'just_done' ? '#a9c7ff' : '#454747'} />
                                    <Text className="text-white font-bold">I just did it</Text>
                                </View>
                            </TouchableOpacity>

                            {/* Option: A while ago */}
                            <TouchableOpacity onPress={() => updateStep({ choice: 'a_while_ago' })}>
                                <View className={`rounded-xl border overflow-hidden ${stepState.choice === 'a_while_ago' ? 'bg-white/10 border-white/30' : 'bg-white/5 border-white/10'}`}>
                                    <View className="flex-row items-center gap-3 p-4">
                                        <MaterialIcons name="history" size={22} color={stepState.choice === 'a_while_ago' ? '#a9c7ff' : '#454747'} />
                                        <Text className="text-white font-bold">A while ago</Text>
                                    </View>
                                    {stepState.choice === 'a_while_ago' && (
                                        <View className="px-4 pb-4">
                                            <TextInput
                                                className={`bg-white/5 px-4 py-3 rounded-xl text-white ${kmError ? 'border border-error' : ''}`}
                                                placeholder={stepState.inputMode === 'km' ? "Enter KM" : "YYYY-MM-DD"}
                                                placeholderTextColor="#454747"
                                                keyboardType={stepState.inputMode === 'km' ? "numeric" : "default"}
                                                value={stepState.inputMode === 'km' ? stepState.kmInput : stepState.dateInput}
                                                onChangeText={v => stepState.inputMode === 'km' ? updateStep({ kmInput: v }) : updateStep({ dateInput: v })}
                                            />
                                            {kmError ? <Text className="text-error text-[10px] mt-1">{kmError}</Text> : null}
                                        </View>
                                    )}
                                </View>
                            </TouchableOpacity>

                            {/* Option: Don't Know */}
                            <TouchableOpacity onPress={() => updateStep({ choice: 'dont_know' })}>
                                <View className={`flex-row items-center gap-3 p-4 rounded-xl border ${stepState.choice === 'dont_know' ? 'bg-error/20 border-error/50' : 'bg-white/5 border-white/10'}`}>
                                    <MaterialIcons name="help-outline" size={22} color={stepState.choice === 'dont_know' ? '#ffb4ab' : '#454747'} />
                                    <Text className="text-white font-bold">I don't know</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                <View className="px-6 pb-10 mt-auto">
                    <TouchableOpacity onPress={goNext} disabled={stepState.choice === null || saving}>
                        <View className={`w-full h-14 rounded-xl items-center justify-center ${stepState.choice !== null ? 'bg-primary' : 'bg-white/10'}`}>
                            {saving ? <ActivityIndicator color="#081421" /> : (
                                <Text className="font-bold text-white uppercase tracking-widest">
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