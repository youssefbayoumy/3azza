import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { useAppStore } from '../../store/useAppStore';

export default function RegisterScreen() {
    const navigation = useNavigation();
    const login = useAppStore((s) => s.login);

    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');

    const handleRegister = async () => {
        if (!pin || pin.length < 4) {
            Alert.alert('Invalid PIN', 'PIN must be 4 digits.');
            return;
        }
        if (pin !== confirmPin) {
            Alert.alert('PIN Mismatch', 'The PINs you entered do not match.');
            return;
        }

        try {
            await SecureStore.setItemAsync('user_pin', pin);
            Alert.alert('Success', 'Security PIN set. System initialized.', [
                { text: 'Continue', onPress: () => login() }
            ]);
        } catch (err) {
            console.error('Register error:', err);
            Alert.alert('Error', 'Failed to save PIN.');
        }
    };

    return (
        <View className="flex-1 bg-background justify-center px-6">
            <View className="mb-12 items-center">
                <Text className="font-headline text-3xl font-bold text-on-surface mb-2">Initialize System</Text>
                <Text className="font-body text-on-surface-variant/80 text-center">Set a 4-digit security PIN to encrypt and protect your local vehicle data.</Text>
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
                        onChangeText={setPin}
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
                        onChangeText={setConfirmPin}
                    />
                </View>

                <TouchableOpacity
                    className="bg-primary rounded-xl py-4 items-center mt-2"
                    onPress={handleRegister}
                    activeOpacity={0.85}
                >
                    <Text className="font-label text-base font-bold text-[#081421] uppercase tracking-wider">Set PIN & Continue</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    className="py-4 items-center"
                    onPress={() => navigation.goBack()}
                >
                    <Text className="font-label text-sm text-primary underline">Already initialized? Login here</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
