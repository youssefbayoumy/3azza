import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import {
    authenticateWithBiometrics,
    canUseBiometricUnlock,
    getPinLockout,
    hasRegisteredPin,
    recordFailedPinAttempt,
    resetPinFailures,
    verifyPin,
} from '../../services/auth';
import { isValidPin, normalizePinInput } from '../../utils/appLock';
import AppFormScreen from '../../components/ui/AppFormScreen';

export default function LoginScreen() {
    const login = useAppStore((s) => s.login);

    const [pin, setPin] = useState('');
    const [biometricAvailable, setBiometricAvailable] = useState<boolean | null>(null);
    const [busyAction, setBusyAction] = useState<'pin' | 'biometric' | null>(null);

    useEffect(() => {
        let cancelled = false;
        canUseBiometricUnlock()
            .then((available) => {
                if (!cancelled) setBiometricAvailable(available);
            })
            .catch(() => {
                if (!cancelled) setBiometricAvailable(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const handleLogin = async () => {
        if (!isValidPin(pin)) {
            Alert.alert('Invalid PIN', 'Enter the 4-digit app-lock PIN.');
            return;
        }

        setBusyAction('pin');
        try {
            const lockout = await getPinLockout();
            if (lockout.isLocked) {
                Alert.alert('Locked', `Too many attempts. Try again in ${lockout.secondsRemaining} seconds.`);
                return;
            }

            if (await verifyPin(pin)) {
                await resetPinFailures();
                login();
            } else {
                const next = await recordFailedPinAttempt();
                if (next.lockedUntil) {
                    Alert.alert('Locked', 'Too many incorrect attempts. PIN login is locked for 5 minutes.');
                } else {
                    const remainingAttempts = 5 - next.failedAttempts;
                    Alert.alert(
                        'Incorrect PIN',
                        `The PIN is incorrect. ${remainingAttempts} ${remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining.`
                    );
                }
            }
        } catch (err) {
            console.error('PIN unlock error:', err);
            Alert.alert('Unlock failed', '3azza could not check the app-lock PIN. Try again.');
        } finally {
            setBusyAction(null);
        }
    };

    const handleBiometricUnlock = async () => {
        setBusyAction('biometric');
        try {
            if (!(await hasRegisteredPin())) {
                Alert.alert('App lock unavailable', 'No app-lock PIN is registered on this device.');
                return;
            }

            const outcome = await authenticateWithBiometrics();
            if (outcome === 'success') {
                await resetPinFailures();
                login();
                return;
            }
            if (outcome === 'cancelled') return;
            if (outcome === 'failed') {
                Alert.alert('Not unlocked', 'The biometric did not match. Use your app PIN or try again.');
            } else if (outcome === 'locked') {
                Alert.alert('Biometrics locked', 'The device temporarily locked biometric attempts. Use your app PIN.');
            } else if (outcome === 'unavailable') {
                setBiometricAvailable(false);
                Alert.alert('Biometrics unavailable', 'Biometric unlock is not available. Use your app PIN.');
            } else {
                Alert.alert('Biometric error', 'The device could not complete biometric unlock. Use your app PIN.');
            }
        } catch (err) {
            console.error('Biometric unlock error:', err);
            Alert.alert('Biometric error', 'The device could not complete biometric unlock. Use your app PIN.');
        } finally {
            setBusyAction(null);
        }
    };

    return (
        <AppFormScreen>
            <View className="mb-12 items-center">
                <Text className="font-headline text-4xl font-bold text-on-surface mb-2">App Locked</Text>
                <Text className="font-body text-on-surface-variant/80 text-center">Enter your app PIN to view maintenance records stored on this device.</Text>
            </View>

            <View className="flex-col gap-6">
                <View>
                    <Text className="font-label text-xs uppercase font-bold text-muted tracking-widest mb-3">4-Digit PIN</Text>
                    <TextInput
                        className="bg-surface-container-high rounded-xl px-5 py-4 text-on-surface font-body text-xl tracking-widest border border-outline-variant/20"
                        placeholder="••••"
                        placeholderTextColor="#64748b"
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                        value={pin}
                        onChangeText={(value) => setPin(normalizePinInput(value))}
                        accessibilityLabel="4-digit app-lock PIN"
                    />
                </View>

                <TouchableOpacity
                    className={`bg-primary rounded-xl py-4 items-center mt-2 ${busyAction ? 'opacity-60' : ''}`}
                    onPress={handleLogin}
                    disabled={busyAction !== null}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                >
                    <Text className="font-label text-base font-bold text-[#081421] uppercase tracking-wider">Unlock App</Text>
                </TouchableOpacity>

                {biometricAvailable ? (
                    <TouchableOpacity
                        className={`border border-primary/30 rounded-xl py-4 items-center ${busyAction ? 'opacity-60' : ''}`}
                        onPress={handleBiometricUnlock}
                        disabled={busyAction !== null}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                    >
                        <Text className="font-label text-sm font-bold text-primary uppercase tracking-wider">Unlock with Biometrics</Text>
                    </TouchableOpacity>
                ) : biometricAvailable === false ? (
                    <Text className="font-body text-xs text-on-surface-variant/70 text-center">
                        Biometric unlock is not set up on this device. Use your app PIN.
                    </Text>
                ) : null}
            </View>
        </AppFormScreen>
    );
}
