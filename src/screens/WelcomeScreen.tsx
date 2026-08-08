import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from '../i18n';

export default function WelcomeScreen() {
    const { t } = useTranslation();
    return (
        <View className="flex-1 bg-background justify-center items-center">
            <Text className="text-on-background font-headline text-3xl font-bold">3AZZA App</Text>
            <Text className="text-primary font-body mt-2">{t('settings.setupSuccessful')}</Text>
        </View>
    );
}
