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
import { useTranslation } from '../../i18n';

export default function LoginScreen() {
    const login = useAppStore((s) => s.login);
    const { t, tp } = useTranslation();

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
            Alert.alert(t('lock.invalidTitle'), t('lock.invalidEntry'));
            return;
        }

        setBusyAction('pin');
        try {
            const lockout = await getPinLockout();
            if (lockout.isLocked) {
                Alert.alert(t('lock.locked'), t('lock.trySeconds', { seconds: lockout.secondsRemaining }));
                return;
            }

            if (await verifyPin(pin)) {
                await resetPinFailures();
                login();
            } else {
                const next = await recordFailedPinAttempt();
                if (next.lockedUntil) {
                    Alert.alert(t('lock.locked'), t('lock.lockedFive'));
                } else {
                    const remainingAttempts = 5 - next.failedAttempts;
                    Alert.alert(
                        t('lock.incorrect'),
                        tp('lock.attempts', remainingAttempts)
                    );
                }
            }
        } catch (err) {
            console.error('PIN unlock error:', err);
            Alert.alert(t('lock.unlockFailed'), t('lock.unlockFailedBody'));
        } finally {
            setBusyAction(null);
        }
    };

    const handleBiometricUnlock = async () => {
        setBusyAction('biometric');
        try {
            if (!(await hasRegisteredPin())) {
                Alert.alert(t('lock.noPin'), t('lock.noPinBody'));
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
                Alert.alert(t('lock.notUnlocked'), t('lock.notUnlockedBody'));
            } else if (outcome === 'locked') {
                Alert.alert(t('lock.biometricLocked'), t('lock.biometricLockedBody'));
            } else if (outcome === 'unavailable') {
                setBiometricAvailable(false);
                Alert.alert(t('lock.biometricUnavailableTitle'), t('lock.biometricUnavailableBody'));
            } else {
                Alert.alert(t('lock.biometricError'), t('lock.biometricErrorBody'));
            }
        } catch (err) {
            console.error('Biometric unlock error:', err);
            Alert.alert(t('lock.biometricError'), t('lock.biometricErrorBody'));
        } finally {
            setBusyAction(null);
        }
    };

    return (
        <AppFormScreen>
            <View className="mb-12 items-center">
                <Text className="font-headline text-4xl font-bold text-on-surface mb-2">{t('lock.title')}</Text>
                <Text className="font-body text-on-surface-variant/80 text-center">{t('lock.body')}</Text>
            </View>

            <View className="flex-col gap-6">
                <View>
                    <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest mb-3">{t('lock.pinLabel')}</Text>
                    <TextInput
                        className="bg-surface-container-high rounded-xl px-5 py-4 text-on-surface font-body text-xl tracking-widest border border-outline-variant/20"
                        placeholder="••••"
                        placeholderTextColor="#64748b"
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                        value={pin}
                        onChangeText={(value) => setPin(normalizePinInput(value))}
                        accessibilityLabel={t('lock.pinA11y')}
                    />
                </View>

                <TouchableOpacity
                    className={`bg-primary rounded-xl py-4 items-center mt-2 ${busyAction ? 'opacity-60' : ''}`}
                    onPress={handleLogin}
                    disabled={busyAction !== null}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                >
                    <Text className="font-label text-base font-bold text-[#081421] uppercase tracking-wider">{t('lock.unlock')}</Text>
                </TouchableOpacity>

                {biometricAvailable ? (
                    <TouchableOpacity
                        className={`border border-primary/30 rounded-xl py-4 items-center ${busyAction ? 'opacity-60' : ''}`}
                        onPress={handleBiometricUnlock}
                        disabled={busyAction !== null}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                    >
                        <Text className="font-label text-sm font-bold text-primary uppercase tracking-wider">{t('lock.unlockBiometric')}</Text>
                    </TouchableOpacity>
                ) : biometricAvailable === false ? (
                    <Text className="font-body text-xs text-on-surface-variant/70 text-center">
                        {t('lock.biometricsUnavailable')}
                    </Text>
                ) : null}
            </View>
        </AppFormScreen>
    );
}
