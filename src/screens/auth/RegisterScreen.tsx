import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import { createPin } from '../../services/auth';
import { isValidPin, normalizePinInput } from '../../utils/appLock';
import AppFormScreen from '../../components/ui/AppFormScreen';
import { localizeErrorMessage, useTranslation } from '../../i18n';

export default function RegisterScreen() {
    const { t } = useTranslation();
    const login = useAppStore((s) => s.login);
    const setAppLockEnabled = useAppStore((s) => s.setAppLockEnabled);

    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [saving, setSaving] = useState(false);

    const handleRegister = async () => {
        if (!isValidPin(pin)) {
            Alert.alert(t('lock.invalidTitle'), t('lock.invalidBody'));
            return;
        }
        if (pin !== confirmPin) {
            Alert.alert(t('lock.mismatchTitle'), t('lock.mismatchBody'));
            return;
        }

        setSaving(true);
        try {
            await createPin(pin);
            Alert.alert(t('lock.readyTitle'), t('lock.readyBody'), [
                { text: t('lock.continue'), onPress: () => login() }
            ]);
        } catch (err) {
            console.error('Create PIN error:', err);
            Alert.alert(t('lock.createFailedTitle'), localizeErrorMessage(err, t('lock.createFailedBody')));
        } finally {
            setSaving(false);
        }
    };

    const handleSkip = () => {
        setAppLockEnabled(false);
        login();
    };

    return (
        <AppFormScreen>
            <View className="mb-12 items-center">
                <Text className="font-headline text-3xl font-bold text-on-surface mb-2">{t('lock.createTitle')}</Text>
                <Text className="font-body text-on-surface-variant/80 text-center">{t('lock.createBody')}</Text>
                <Text className="font-body text-xs text-on-surface-variant/70 text-center mt-3">{t('lock.encryptionNotice')}</Text>
            </View>

            <View className="flex-col gap-6">
                <View>
                    <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest mb-3">{t('lock.createPin')}</Text>
                    <TextInput
                        className="bg-surface-container-high rounded-xl px-5 py-4 text-on-surface font-body text-xl tracking-widest border border-outline-variant/20"
                        placeholder="••••"
                        placeholderTextColor="#64748b"
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                        value={pin}
                        onChangeText={(value) => setPin(normalizePinInput(value))}
                        accessibilityLabel={t('lock.createPinA11y')}
                    />
                </View>

                <View>
                    <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest mb-3">{t('lock.confirmPin')}</Text>
                    <TextInput
                        className="bg-surface-container-high rounded-xl px-5 py-4 text-on-surface font-body text-xl tracking-widest border border-outline-variant/20"
                        placeholder="••••"
                        placeholderTextColor="#64748b"
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                        value={confirmPin}
                        onChangeText={(value) => setConfirmPin(normalizePinInput(value))}
                        accessibilityLabel={t('lock.confirmPinA11y')}
                    />
                </View>

                <TouchableOpacity
                    className={`bg-primary rounded-xl py-4 items-center mt-2 ${saving ? 'opacity-60' : ''}`}
                    onPress={handleRegister}
                    disabled={saving}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                >
                    <Text className="font-label text-base font-bold text-[#081421] uppercase tracking-wider">{t('lock.createPin')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    className="py-3 items-center"
                    onPress={handleSkip}
                    disabled={saving}
                    accessibilityRole="button"
                >
                    <Text className="font-label text-sm font-bold text-primary uppercase tracking-wider">{t('lock.skip')}</Text>
                </TouchableOpacity>
                <Text className="font-body text-xs text-on-surface-variant/70 text-center -mt-3">{t('lock.later')}</Text>
            </View>
        </AppFormScreen>
    );
}
