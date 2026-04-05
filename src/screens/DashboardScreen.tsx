import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getVehicleProfile, getServiceIntervals, saveVehicleProfile } from '../services/database';
import type { VehicleProfile, ServiceInterval } from '../types/database.types';

export default function DashboardScreen() {
    const navigation = useNavigation<any>();
    const [profile, setProfile] = useState<VehicleProfile | null>(null);
    const [intervals, setIntervals] = useState<ServiceInterval[]>([]);
    const [loading, setLoading] = useState(true);

    const [isOdoModalVisible, setIsOdoModalVisible] = useState(false);
    const [newOdoValue, setNewOdoValue] = useState('');

    const openOdoModal = () => {
        // We will default the input box to the computed mileage (prediction) rather than the last confirmed
        setNewOdoValue(computedMileage.toString() || '');
        setIsOdoModalVisible(true);
    };

    const confirmPredictedMileage = async () => {
        if (!profile) return;
        await saveVehicleProfile({ 
            current_mileage: computedMileage, 
            last_odometer_update_timestamp: new Date().toISOString() 
        });
        const data = await getVehicleProfile();
        setProfile(data);
    };

    const handleSaveOdo = async () => {
        const val = parseInt(newOdoValue, 10);
        if (!isNaN(val) && profile) {
            
            // Recalculation logic
            if (diffDays >= 1) {
                const diffFromPredicted = Math.abs(val - computedMileage);
                const threshold = Math.max(10, (profile.daily_average_km ?? 0) * 0.2);
                
                if (diffFromPredicted > threshold) {
                    const actualAdded = val - profile.current_mileage;
                    const newAverage = Math.max(0, Math.round(actualAdded / diffDays));
                    
                    Alert.alert(
                        'Update Daily Average?',
                        `Your actual mileage is different than expected. Since your last check, you've averaged ${newAverage} KM per day.\n\nDo you want to update your daily average to ${newAverage} KM for better future accuracy?`,
                        [
                            {
                                text: 'No, Just Keep ODO',
                                onPress: async () => {
                                    await saveVehicleProfile({ 
                                        current_mileage: val, 
                                        last_odometer_update_timestamp: new Date().toISOString() 
                                    });
                                    setProfile(await getVehicleProfile());
                                    setIsOdoModalVisible(false);
                                }
                            },
                            {
                                text: 'Yes, Update Average',
                                onPress: async () => {
                                    await saveVehicleProfile({ 
                                        current_mileage: val, 
                                        daily_average_km: newAverage,
                                        last_odometer_update_timestamp: new Date().toISOString() 
                                    });
                                    setProfile(await getVehicleProfile());
                                    setIsOdoModalVisible(false);
                                }
                            }
                        ]
                    );
                    return; // exit early, let alert handle the save
                }
            }

            await saveVehicleProfile({ 
                current_mileage: val,
                last_odometer_update_timestamp: new Date().toISOString() 
            });
            const data = await getVehicleProfile();
            setProfile(data);
        }
        setIsOdoModalVisible(false);
    };

    useFocusEffect(
        useCallback(() => {
            let cancelled = false;
            (async () => {
                setLoading(true);
                const [profileData, intervalsData] = await Promise.all([
                    getVehicleProfile(),
                    getServiceIntervals()
                ]);
                if (!cancelled) {
                    setProfile(profileData);
                    setIntervals(intervalsData);
                    setLoading(false);
                }
            })();
            return () => { cancelled = true; };
        }, [])
    );

    // ── Predictive Odometer Engine ──
    const lastConfirmedMileage = profile?.current_mileage ?? 0;
    const dailyAvg = profile?.daily_average_km ?? 0;
    const lastTimestampStr = profile?.last_odometer_update_timestamp;
    
    let diffDays = 0;
    let predictedAdded = 0;

    if (lastTimestampStr && dailyAvg > 0) {
        const lastUpdate = new Date(lastTimestampStr).getTime();
        const now = Date.now();
        const diffHours = (now - lastUpdate) / (1000 * 60 * 60);
        diffDays = diffHours / 24;
        if (diffDays > 0) {
            predictedAdded = Math.floor(diffDays * dailyAvg);
        }
    }

    const computedMileage = lastConfirmedMileage + predictedAdded;
    // We treat this variable identically to previous 'mileage', serving UI and Service Warning Math natively.
    const mileage = computedMileage;

    // Status logic: if we've added at least 1 KM via prediction, show the verify banner
    const isPredicted = predictedAdded >= 1;

    // Gauge: 0–100,000 km mapped roughly. Let's make it a dynamic visualizer for current mileage vs next service interval (e.g. 10000)
    // For visual awesomeness, let's just make it fill based on mileage modulo 10000
    const nextServiceInterval = 10000;
    const progressToService = mileage % nextServiceInterval;
    const maxRange = nextServiceInterval;
    
    // Path length of a semi-circle with radius 80 is PI * 80 ≈ 251.3
    const pathLength = 251;
    const gaugeOffset = pathLength - ((Math.min(progressToService, maxRange) / maxRange) * pathLength);

    // Compute Service Warnings
    const warningsCount = intervals.reduce((acc, item) => {
        if (item.interval_km === null) return acc;
        const remaining = (item.last_service_odometer_km + item.interval_km) - mileage;
        if (remaining <= item.interval_km * 0.1 || remaining <= 200) {
            return acc + 1;
        }
        return acc;
    }, 0);

    if (loading) {
        return (
            <View className="flex-1 bg-background items-center justify-center">
                <ActivityIndicator size="large" color="#a9c7ff" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-background pt-12">
            {/* TopAppBar */}
            <View className="flex-row justify-between items-center px-6 h-16 w-full border-b border-outline-variant/20">
                <View className="flex-row items-center gap-3">
                    <View className="w-8 h-8 rounded-full bg-surface-container-highest overflow-hidden border border-outline-variant/30">
                        <Image
                            source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBlkIpX9ujqBRAUUU4pZyc0yogyVLTWUMuL_E_GBEe-H6e0pRIwhRh3DrcMXW3VU1YkT3SMiQqao41OgQxqqtQYm_jLmJBkGtU-gsK71Gj8is3sOYPElC7E7QAFRRME9XlnjbCC6lgKmh27lfdSzNCe3qiylruoJQ0bab5LgQ5vDAcsgJgMf9Wusv7BDTrc_p9IFtyEEjLr7qKYNcVep55GfDOUjXhYwTzFLUuUnYJmzxQuZPJrRkBcM8OKLAnTG4UjOiRQJSN_7nM' }}
                            className="w-full h-full"
                        />
                    </View>
                    <Text className="font-headline text-2xl font-bold tracking-tighter text-slate-100">3AZZA</Text>
                </View>
                <TouchableOpacity className="p-2">
                    <MaterialIcons name="settings" size={24} color="#a9c7ff" />
                </TouchableOpacity>
            </View>

            {warningsCount > 0 && (
                <TouchableOpacity 
                    className="w-full bg-error/90 px-6 py-3 flex-row items-center justify-between"
                    activeOpacity={0.9}
                    onPress={() => navigation.navigate('Vitals')}
                >
                    <View className="flex-row items-center gap-3">
                        <MaterialIcons name="warning" size={20} color="#fff" />
                        <Text className="font-headline font-bold text-white text-sm tracking-wide">
                            {warningsCount} {warningsCount === 1 ? 'Service' : 'Services'} Due
                        </Text>
                    </View>
                    <View className="flex-row items-center">
                        <Text className="font-label text-[10px] text-error-container uppercase font-bold tracking-widest mr-1">View Schedule</Text>
                        <MaterialIcons name="chevron-right" size={16} color="#ffeceb" />
                    </View>
                </TouchableOpacity>
            )}

            {isPredicted && warningsCount === 0 && (
                <View className="w-full bg-secondary-container px-4 py-3 pb-4">
                    <View className="flex-row items-center gap-2 mb-2">
                        <MaterialCommunityIcons name="auto-fix" size={16} color="#030f1c" />
                        <Text className="font-headline font-bold text-on-secondary-container text-xs">
                            Predicted Mileage: {computedMileage.toLocaleString()} KM
                        </Text>
                    </View>
                    <Text className="font-body text-[11px] text-on-secondary-container/80 mb-3 ml-6">
                        Automatically updated based on your {dailyAvg} KM daily avg. Is this accurate?
                    </Text>
                    <View className="flex-row gap-2 ml-6">
                        <TouchableOpacity 
                            className="bg-on-secondary-container px-4 py-1.5 rounded-md"
                            onPress={confirmPredictedMileage}
                        >
                            <Text className="font-label text-secondary-container text-[10px] font-bold uppercase tracking-widest">Yes, Confirm</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            className="bg-secondary-container border border-on-secondary-container/30 px-4 py-1.5 rounded-md"
                            onPress={openOdoModal}
                        >
                            <Text className="font-label text-on-secondary-container text-[10px] font-bold uppercase tracking-widest">No / Adjust</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 120 }} className="flex-grow">
                {/* Kinetic Gauge Section */}
                <View className="w-full flex-col items-center mb-8">
                  <View className="relative w-72 h-40.01 items-center justify-end">
    <Svg 
        width="288" // Matches w-72 (72 * 4 = 288px)
        height="144" // Matches h-36 (36 * 4 = 144px)
        viewBox="0 0 200 100" 
        className="absolute top-0 opacity-80" 
        style={{ transform: [{ scaleX: 1 }] }}
    >
        {/* Background Track */}
        <Path 
            d="M 20 95 A 80 80 0 0 1 180 95" 
            fill="none" 
            stroke="#a9c7ff" 
            strokeWidth="10" 
            strokeLinecap="round" 
            opacity={0.2} 
        />
        {/* Progress Path */}
        <Path 
            d="M 20 95 A 80 80 0 0 1 180 95" 
            fill="none" 
            stroke="#a9c7ff" 
            strokeWidth="10" 
            strokeLinecap="round" 
            strokeDasharray="251.3" 
            strokeDashoffset={String(gaugeOffset)} 
        />
    </Svg>
                        <TouchableOpacity className="items-center justify-end pb-2 z-10" onPress={openOdoModal} activeOpacity={0.7}>
                            <Text className="font-headline text-5xl font-bold tracking-tight text-white leading-none">{mileage.toLocaleString()}</Text>
                            <View className="flex-row items-center gap-1 mt-1">
                                <Text className="font-label text-[10px] font-extrabold uppercase tracking-[0.2em] text-primary/70">Total ODO KM</Text>
                                <MaterialIcons name="edit" size={10} color="#a9c7ff" style={{ opacity: 0.7 }} />
                            </View>
                        </TouchableOpacity>
                    </View>
                    <View className="w-full h-[1px] bg-outline-variant/20" />
                </View>

                {/* Check & Module Links */}
                <TouchableOpacity 
                    className="w-full bg-[#101c2a] rounded-xl p-6 border border-emerald-500/20 mb-4 flex-row items-center justify-between"
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('PreRideCheck')}
                >
                    <View className="flex-row items-center gap-4">
                        <View className="w-12 h-12 bg-emerald-500/10 rounded-full items-center justify-center border border-emerald-500/20">
                            <MaterialCommunityIcons name="shield-check" size={24} color="#10b981" />
                        </View>
                        <View>
                            <Text className="font-headline text-lg font-bold text-on-surface">Pre-Ride Check</Text>
                            <Text className="font-body text-xs text-on-surface-variant/80 mt-1">Verify systems before departure</Text>
                        </View>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color="#64748b" />
                </TouchableOpacity>

                <TouchableOpacity 
                    className="w-full bg-surface-container-low rounded-xl p-6 border border-secondary/20 mb-4 flex-row items-center justify-between"
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('Vitals')}
                >
                    <View className="flex-row items-center gap-4">
                        <View className="w-12 h-12 bg-primary/10 rounded-full items-center justify-center border border-primary/20">
                            <MaterialCommunityIcons name="heart-pulse" size={24} color="#a9c7ff" />
                        </View>
                        <View>
                            <Text className="font-headline text-lg font-bold text-on-surface">Vehicle Vitals</Text>
                            <Text className="font-body text-xs text-on-surface-variant/80 mt-1">Check fluids, tires, battery & brakes</Text>
                        </View>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color="#64748b" />
                </TouchableOpacity>

                <TouchableOpacity 
                    className="w-full bg-[#1c2e40] rounded-xl p-6 border border-primary-fixed/30 mb-8 flex-row items-center justify-between"
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('ServiceLogs')}
                >
                    <View className="flex-row items-center gap-4">
                        <View className="w-12 h-12 bg-primary-fixed/10 rounded-full items-center justify-center border border-primary-fixed/20">
                            <MaterialIcons name="build" size={24} color="#d6e3ff" />
                        </View>
                        <View>
                            <Text className="font-headline text-lg font-bold text-on-surface">Service Logs</Text>
                            <Text className="font-body text-xs text-on-surface-variant/80 mt-1">Maintenance & servicing history</Text>
                        </View>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color="#64748b" />
                </TouchableOpacity>

                {/* Features Links */}
                <View className="flex-row justify-between mb-8 gap-4">
                    <TouchableOpacity 
                        className="flex-1 bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 aspect-square justify-between"
                        onPress={() => navigation.navigate('Inventory')}
                    >
                        <MaterialIcons name="inventory-2" size={28} color="#c6c6c6" />
                        <View className="flex-col mt-4">
                            <Text className="font-headline text-sm font-bold text-on-surface">Parts Inventory</Text>
                            <Text className="font-label text-[9px] uppercase font-extrabold tracking-widest text-[#d7e3f7]/40 mt-1">Manage Stock</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        className="flex-1 bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 aspect-square justify-between"
                        onPress={() => navigation.navigate('Vault')}
                    >
                        <MaterialIcons name="folder-special" size={28} color="#c6c6c6" />
                        <View className="flex-col mt-4">
                            <Text className="font-headline text-sm font-bold text-on-surface">Digital Vault</Text>
                            <Text className="font-label text-[9px] uppercase font-extrabold tracking-widest text-[#d7e3f7]/40 mt-1">Secure Assets</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            {/* Edit Odo Modal */}
            <Modal visible={isOdoModalVisible} transparent={true} animationType="fade">
                <View className="flex-1 bg-black/80 items-center justify-center px-6">
                    <View className="w-full bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
                        <Text className="font-headline text-xl font-bold text-on-surface mb-2">Update Odometer</Text>
                        <Text className="font-body text-sm text-secondary/80 mb-6">
                            Enter your dashboard's current reading. This drives the maintenance schedule.
                        </Text>
                        
                        <Text className="font-label text-[10px] uppercase tracking-widest text-secondary mb-2">Current Mileage (KM)</Text>
                        <TextInput 
                            className="bg-surface-container-highest flex-row items-center px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base mb-6"
                            placeholder="e.g. 15000"
                            placeholderTextColor="#454747"
                            keyboardType="numeric"
                            value={newOdoValue}
                            onChangeText={setNewOdoValue}
                        />

                        <View className="flex-row justify-end gap-3">
                            <TouchableOpacity onPress={() => setIsOdoModalVisible(false)} className="px-4 py-2 rounded-lg">
                                <Text className="font-label font-bold text-secondary uppercase tracking-wider">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleSaveOdo} className="px-6 py-2 bg-primary rounded-lg shadow-lg">
                                <Text className="font-label font-bold text-on-primary uppercase tracking-wider">Update</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
