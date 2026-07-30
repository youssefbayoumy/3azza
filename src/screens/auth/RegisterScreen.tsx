import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import { createPin } from '../../services/auth';
import { isValidPin, normalizePinInput } from '../../utils/appLock';
import AppFormScreen from '../../components/ui/AppFormScreen';

export default function RegisterScreen() {
    const login = useAppStore((s) => s.login);

    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [saving, setSaving] = useState(false);

    const handleRegister = async () => {
        if (!isValidPin(pin)) {
            Alert.alert('Invalid PIN', 'PIN must contain exactly 4 digits.');
            return;
        }
        if (pin !== confirmPin) {
            Alert.alert('PIN Mismatch', 'The PINs you entered do not match.');
            return;
        }

        setSaving(true);
        try {
            await createPin(pin);
            Alert.alert('App lock ready', 'Your app-lock PIN was created.', [
                { text: 'Continue', onPress: () => login() }
            ]);
        } catch (err) {
            console.error('Create PIN error:', err);
            Alert.alert('PIN not created', err instanceof Error ? err.message : 'Failed to save the app-lock PIN.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <AppFormScreen>
            <View className="mb-12 items-center">
                <Text className="font-headline text-3xl font-bold text-on-surface mb-2">Create App Lock</Text>
                <Text className="font-body text-on-surface-variant/80 text-center">Create a 4-digit PIN to lock access to 3azza on this device.</Text>
                <Text className="font-body text-xs text-on-surface-variant/70 text-center mt-3">The PIN does not encrypt the database, document photos, backups, or CSV exports.</Text>
            </View>

            <View className="flex-col gap-6">
                <View>
                    <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest mb-3">Create PIN</Text>
                    <TextInput
                        className="bg-surface-container-high rounded-xl px-5 py-4 text-on-surface font-body text-xl tracking-widest border border-outline-variant/20"
                        placeholder="••••"
                        placeholderTextColor="#64748b"
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                        value={pin}
                        onChangeText={(value) => setPin(normalizePinInput(value))}
                        accessibilityLabel="Create 4-digit app-lock PIN"
                    />
                </View>

                <View>
                    <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest mb-3">Confirm PIN</Text>
                    <TextInput
                        className="bg-surface-container-high rounded-xl px-5 py-4 text-on-surface font-body text-xl tracking-widest border border-outline-variant/20"
                        placeholder="••••"
                        placeholderTextColor="#64748b"
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                        value={confirmPin}
                        onChangeText={(value) => setConfirmPin(normalizePinInput(value))}
                        accessibilityLabel="Confirm 4-digit app-lock PIN"
                    />
                </View>

                <TouchableOpacity
                    className={`bg-primary rounded-xl py-4 items-center mt-2 ${saving ? 'opacity-60' : ''}`}
                    onPress={handleRegister}
                    disabled={saving}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                >
                    <Text className="font-label text-base font-bold text-[#081421] uppercase tracking-wider">Create PIN</Text>
                </TouchableOpacity>
            </View>
        </AppFormScreen>
    );
}
