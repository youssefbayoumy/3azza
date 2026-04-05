import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const AMBER = '#FFB100';

export default function OilChangeDetailsScreen() {
    return (
        <View className="flex-1 bg-background pt-12">
            {/* TopAppBar */}
            <View className="flex-row items-center justify-between px-6 py-4 w-full">
                <View className="flex-row items-center gap-4">
                    <TouchableOpacity className="p-2 rounded-lg">
                        <MaterialIcons name="arrow-back" size={24} color="#a9c7ff" />
                    </TouchableOpacity>
                    <Text className="font-headline uppercase tracking-widest text-sm text-[#a9c7ff]">SERVICE_DETAILS</Text>
                </View>
                <Text className="text-[#C0C0C0] font-bold tracking-tighter">3AZZA</Text>
            </View>

            <ScrollView className="flex-1 px-6 pt-4" contentContainerStyle={{ paddingBottom: 150 }}>

                {/* Service Title Section */}
                <View className="flex-row justify-between items-end border-b border-outline-variant/20 pb-4 mb-8">
                    <View>
                        <Text className="font-label text-[10px] uppercase tracking-tighter text-secondary mb-1">Maintenance Type</Text>
                        <Text className="font-headline text-4xl font-bold tracking-tight text-on-surface uppercase">Oil Change</Text>
                    </View>
                    <View className="items-end">
                        <Text className="font-label text-[10px] uppercase tracking-tighter text-secondary mb-1">Status</Text>
                        <View className="px-3 py-1 bg-primary-container border border-primary/20 rounded-full">
                            <Text className="font-label text-[10px] font-bold text-primary">COMPLETED</Text>
                        </View>
                    </View>
                </View>

                {/* Key Data Section: High Contrast Amber Boxes */}
                <View className="flex-row gap-4 mb-8">
                    <View className="flex-1 p-4 rounded-xl flex-col justify-between h-28 shadow-lg" style={{ backgroundColor: AMBER }}>
                        <Text className="font-label text-[10px] font-extrabold text-[#2f3131] uppercase">DATE</Text>
                        <Text className="font-headline text-xl font-bold text-[#2f3131]">2024-11-15</Text>
                    </View>
                    <View className="flex-1 p-4 rounded-xl flex-col justify-between h-28 shadow-lg" style={{ backgroundColor: AMBER }}>
                        <Text className="font-label text-[10px] font-extrabold text-[#2f3131] uppercase">ODOMETER</Text>
                        <View className="flex-row items-baseline gap-1">
                            <Text className="font-headline text-2xl font-bold text-[#2f3131]">10,450</Text>
                            <Text className="font-label text-xs font-bold text-[#2f3131] opacity-70">KM</Text>
                        </View>
                    </View>
                    <View className="flex-1 p-4 rounded-xl flex-col justify-between h-28 shadow-lg" style={{ backgroundColor: AMBER }}>
                        <Text className="font-label text-[10px] font-extrabold text-[#2f3131] uppercase">LOCATION</Text>
                        <Text className="font-headline text-lg font-bold text-[#2f3131] leading-tight">Garage Offline</Text>
                    </View>
                </View>

                {/* Notes */}
                <View className="bg-surface-container-low border border-secondary/30 rounded-xl p-6 relative overflow-hidden mb-8">
                    <View className="flex-row items-center gap-2 mb-4">
                        <MaterialIcons name="description" size={16} color="#c6c6c6" />
                        <Text className="font-headline text-sm font-bold tracking-widest text-secondary uppercase">SERVICE_NOTES</Text>
                    </View>
                    <Text className="font-body text-on-surface leading-relaxed text-lg">
                        Used <Text className="text-primary font-bold">Motul 7100</Text>. Felt smoother.
                    </Text>
                    <View className="mt-6 pt-4 border-t border-outline-variant/10 flex-row justify-between items-center">
                        <Text className="font-label text-[10px] text-outline uppercase tracking-widest">Entry Verified</Text>
                        <MaterialIcons name="verified" size={16} color="#a9c7ff" />
                    </View>
                </View>

                {/* Receipt Placeholder */}
                <TouchableOpacity className="w-full mb-8">
                    <View className="border-2 border-dashed border-outline-variant/30 rounded-xl p-8 flex-col items-center justify-center gap-3 bg-surface-container-lowest/30">
                        <View className="w-12 h-12 rounded-full bg-surface-container-high items-center justify-center">
                            <MaterialIcons name="add-a-photo" size={24} color="#8e9196" />
                        </View>
                        <Text className="font-label text-xs font-bold tracking-widest text-outline uppercase">ATTACH RECEIPT PHOTO</Text>
                    </View>
                </TouchableOpacity>

                {/* Technical Sub-Bento */}
                <View className="flex-row gap-4">
                    <View className="flex-1 bg-surface-container p-4 rounded-xl border-l-2 border-primary/40">
                        <Text className="font-label text-[9px] uppercase tracking-tighter text-secondary/60 mb-1">Viscosity</Text>
                        <Text className="font-headline text-xl font-medium text-on-surface">10W-40</Text>
                    </View>
                    <View className="flex-1 bg-surface-container p-4 rounded-xl">
                        <Text className="font-label text-[9px] uppercase tracking-tighter text-secondary/60 mb-1">Filter Type</Text>
                        <Text className="font-headline text-xl font-medium text-on-surface">OEM High Flow</Text>
                    </View>
                </View>

            </ScrollView>
        </View>
    );
}
