import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import { useAppStore } from '../../store/useAppStore';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

export default function LoginScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
    const login = useAppStore((s) => s.login);

    const [pin, setPin] = useState('');

    const handleLogin = async () => {
        if (!pin) {
            Alert.alert('Missing PIN', 'Please enter your PIN.');
            return;
        }

        try {
            const storedPin = await SecureStore.getItemAsync('user_pin');
            if (storedPin === pin) {
                // Success
                login();
            } else {
                Alert.alert('Incorrect PIN', 'The PIN you entered is incorrect or no account exists. Try registering.');
            }
        } catch (err) {
            console.error('Login error:', err);
            Alert.alert('Error', 'An error occurred while logging in.');
        }
    };

    return (
        <View className="flex-1 bg-background justify-center px-6">
            <View className="mb-12 items-center">
                <Text className="font-headline text-4xl font-bold text-on-surface mb-2">Welcome Back</Text>
                <Text className="font-body text-on-surface-variant/80 text-center">Enter your secure PIN to access your vehicle telemetry.</Text>
            </View>

            <View className="flex-col gap-6">
                <View>
                    <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest mb-3">Secure PIN</Text>
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

                <TouchableOpacity
                    className="bg-primary rounded-xl py-4 items-center mt-2"
                    onPress={handleLogin}
                    activeOpacity={0.85}
                >
                    <Text className="font-label text-base font-bold text-[#081421] uppercase tracking-wider">Access System</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    className="py-4 items-center"
                    onPress={() => navigation.navigate('Register')}
                >
                    <Text className="font-label text-sm text-primary underline">First time? Initialize System (Register)</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
