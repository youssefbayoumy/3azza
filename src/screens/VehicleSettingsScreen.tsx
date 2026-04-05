import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export default function VehicleSettingsScreen() {
    const [garageMode, setGarageMode] = useState(true);
    const [maintenanceReminders, setMaintenanceReminders] = useState(false);
    const [cloudSync, setCloudSync] = useState(true);

    return (
        <View className="flex-1 bg-background pt-12">
            {/* TopAppBar */}
            <View className="flex-row justify-between items-center w-full px-6 py-4 border-b border-[#C0C0C0]/15">
                <View className="flex-row items-center gap-4">
                    <TouchableOpacity className="p-2 rounded-lg">
                        <MaterialIcons name="arrow-back" size={24} color="#a9c7ff" />
                    </TouchableOpacity>
                    <Text className="font-headline tracking-tight font-bold uppercase text-[#a9c7ff]">VEHICLE SETTINGS</Text>
                </View>
                <TouchableOpacity className="p-2 rounded-lg">
                    <MaterialIcons name="settings-applications" size={24} color="#C0C0C0" />
                </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 px-6 pt-8" contentContainerStyle={{ paddingBottom: 150 }}>

                {/* Profile Header Section */}
                <View className="relative overflow-hidden rounded-xl bg-surface-container-low p-8 mb-6">
                    <View className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-20 -mt-20 opacity-60" />
                    <View className="flex-col items-center gap-6 relative z-10">
                        <View className="relative">
                            <View className="w-28 h-28 rounded-full border-2 border-[#C0C0C0]/30 p-1">
                                <Image
                                    source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB2zSy7lQQEmCiuPEnoSIeuOXPdW53kS-4O_olCkkblv7-0Ac5yIvbzjSwwkCAb4inwP7Ab1AgxRubavFBAnjATgHFoBO7bsz_fTuz7UqCc1uJ6RYz5xPNGnOVfTguBbOShbsgmBlul3xtXRo6EsyweCzNIZd2Luo5klqP-WyZZxVZVUXAiHdcLWHz7YDXOBM4rWpZwRIhS8LfoRiBtol0d1EK4VgtOLt2pKlbNn5CKT4-FhE_Wwj0XUvNN_jIOIfCHoCoMj657Myw' }}
                                    className="w-full h-full rounded-full"
                                />
                            </View>
                            <View className="absolute bottom-1 right-1 bg-secondary w-8 h-8 rounded-full items-center justify-center border border-background shadow-lg">
                                <MaterialIcons name="edit" size={14} color="#2f3131" />
                            </View>
                        </View>
                        <View className="items-center">
                            <View className="flex-row items-center gap-3 mb-1">
                                <Text className="font-headline text-2xl font-bold tracking-tight text-[#C0C0C0]">Mady's Symphony ST</Text>
                                <MaterialIcons name="edit" size={18} color="rgba(198,198,198,0.6)" />
                            </View>
                            <Text className="font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant font-bold">Performance Series • v4.2.0</Text>
                        </View>
                    </View>
                </View>

                {/* Bento Settings Grid */}
                <View className="flex-col gap-6">

                    {/* Garage Mode Module */}
                    <View className="bg-surface-container-lowest p-6 rounded-xl flex-col justify-between border border-outline-variant/10">
                        <View className="flex-row justify-between items-start">
                            <View className="flex-1 mr-4">
                                <MaterialIcons name="garage" size={28} color="#a9c7ff" style={{ marginBottom: 8 }} />
                                <Text className="font-headline text-lg font-bold text-secondary uppercase tracking-wider mb-1">Garage Mode</Text>
                                <Text className="font-body text-sm text-on-surface-variant leading-tight">Force maximum interface contrast for low-light workshops.</Text>
                            </View>
                            <Switch
                                value={garageMode}
                                onValueChange={setGarageMode}
                                trackColor={{ false: '#1f2b39', true: 'rgba(169, 199, 255, 0.2)' }}
                                thumbColor={garageMode ? '#c6c6c6' : '#8e9196'}
                            />
                        </View>
                        <View className="mt-4 pt-4 border-t border-outline-variant/10">
                            <Text className="font-label text-[10px] uppercase font-extrabold tracking-widest text-primary">Active: High Contrast Interface</Text>
                        </View>
                    </View>

                    {/* Health Index Card */}
                    <View className="bg-surface-container-high p-6 rounded-xl flex-col justify-center items-center border border-outline-variant/10">
                        <View className="mb-4 items-center">
                            <Text className="font-headline text-5xl font-extrabold text-primary">98<Text className="text-xl font-normal opacity-50 ml-1">%</Text></Text>
                            <Text className="font-label text-[10px] uppercase tracking-widest mt-1 text-on-surface-variant">Health Index</Text>
                        </View>
                        <View className="w-full bg-surface-container-low h-1 rounded-full overflow-hidden">
                            <View className="bg-primary h-full rounded-full" style={{ width: '98%' }} />
                        </View>
                    </View>

                    {/* Maintenance Reminders */}
                    <View className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/10">
                        <View className="flex-row items-center justify-between mb-6">
                            <View className="flex-row items-center gap-3">
                                <View className="w-10 h-10 rounded-lg bg-surface-container-high items-center justify-center">
                                    <MaterialIcons name="notifications-active" size={20} color="#c6c6c6" />
                                </View>
                                <Text className="font-headline font-bold text-secondary tracking-wide">Maintenance Reminders</Text>
                            </View>
                            <Switch
                                value={maintenanceReminders}
                                onValueChange={setMaintenanceReminders}
                                trackColor={{ false: '#1f2b39', true: 'rgba(169, 199, 255, 0.2)' }}
                                thumbColor={maintenanceReminders ? '#c6c6c6' : '#8e9196'}
                            />
                        </View>
                        <Text className="font-body text-sm text-on-surface-variant leading-relaxed">Automatic alerts for oil changes, tire rotations, and diagnostic cycles.</Text>
                    </View>

                    {/* Cloud Sync */}
                    <View className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/10">
                        <View className="flex-row items-center justify-between mb-4">
                            <View className="flex-row items-center gap-3">
                                <View className="w-10 h-10 rounded-lg bg-surface-container-high items-center justify-center">
                                    <MaterialIcons name="cloud-sync" size={20} color="#c6c6c6" />
                                </View>
                                <Text className="font-headline font-bold text-secondary tracking-wide uppercase">Cloud Sync Status</Text>
                            </View>
                            <Switch
                                value={cloudSync}
                                onValueChange={setCloudSync}
                                trackColor={{ false: '#1f2b39', true: 'rgba(169, 199, 255, 0.2)' }}
                                thumbColor={cloudSync ? '#c6c6c6' : '#8e9196'}
                            />
                        </View>
                        <View className="flex-row items-center gap-2 px-3 py-2 bg-primary/5 rounded-lg self-start">
                            <MaterialIcons name="check-circle" size={16} color="#a9c7ff" />
                            <Text className="font-label text-[10px] font-bold text-primary tracking-tighter uppercase">Synced • 2m ago</Text>
                        </View>
                    </View>

                    {/* System Telemetry */}
                    <View className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/10">
                        <Text className="font-headline text-lg font-bold text-secondary uppercase tracking-widest mb-6">System Telemetry</Text>
                        <View className="flex-row flex-wrap gap-y-6 mb-8">
                            <View className="w-1/2">
                                <Text className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant font-bold mb-1">Engine Temp</Text>
                                <Text className="font-headline font-bold text-primary text-xl">194°F</Text>
                            </View>
                            <View className="w-1/2">
                                <Text className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant font-bold mb-1">Oil Life</Text>
                                <Text className="font-headline font-bold text-primary text-xl">82%</Text>
                            </View>
                            <View className="w-1/2">
                                <Text className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant font-bold mb-1">Brake Wear</Text>
                                <Text className="font-headline font-bold text-secondary text-xl">Optimal</Text>
                            </View>
                            <View className="w-1/2">
                                <Text className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant font-bold mb-1">Battery</Text>
                                <Text className="font-headline font-bold text-primary text-xl">14.2V</Text>
                            </View>
                        </View>
                        <TouchableOpacity className="w-full py-4 bg-secondary rounded-lg items-center justify-center">
                            <Text className="font-headline font-bold text-[#2f3131] uppercase tracking-widest">Run Diagnostic</Text>
                        </TouchableOpacity>
                    </View>

                </View>
            </ScrollView>
        </View>
    );
}
