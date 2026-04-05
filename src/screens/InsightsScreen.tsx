import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';

const AMBER = '#FFB100';

export default function InsightsScreen() {
    return (
        <View className="flex-1 bg-background pt-12">
            {/* TopAppBar */}
            <View className="flex-row justify-between items-center px-6 h-16 w-full border-b border-[#C0C0C0]/10">
                <TouchableOpacity>
                    <MaterialIcons name="menu" size={24} color="#a9c7ff" />
                </TouchableOpacity>
                <Text className="font-headline uppercase tracking-widest text-2xl text-[#a9c7ff]">INSIGHTS</Text>
                <View className="w-10 h-10 rounded-full border border-outline-variant/30 items-center justify-center bg-surface-container-high overflow-hidden">
                    <Image
                        source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBGvjS_JXTZjbhEjfLCqGogc0wC_8S1IA0ydKLr6QAkIQcdR21VrzBISlUFLcIevJEmBSPRYyvjosSDFkMOPifgcC8gS7mE7LNZkrHMHX9ased7WU4SMlgYabqr1cZcKAW5zgGyQBdXFij6ThxVRKl0qTa91BGimMazGdDlQB0TixWh7pCrWjH__IjgHBcUuUPpCIkThfU9MWQKAp8E-8nVV0lL5agdZHX02cB5NDmQWWT-FvZg81bZ8iRp_Mt5R9uot7xsOudK9cE' }}
                        className="w-full h-full"
                    />
                </View>
            </View>

            <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 150 }}>

                {/* Hero Metric Section */}
                <View className="mb-10">
                    <Text className="font-label text-[10px] uppercase font-bold tracking-[0.2em] text-secondary opacity-60 mb-1">Fleet Efficiency Index</Text>
                    <View className="flex-row items-baseline gap-4">
                        <Text className="font-headline text-6xl font-bold tracking-tighter text-on-surface">94.2</Text>
                        <View className="flex-row items-center gap-1">
                            <MaterialIcons name="trending-up" size={16} color={AMBER} />
                            <Text className="font-label text-sm" style={{ color: AMBER }}>+2.4%</Text>
                        </View>
                    </View>
                </View>

                {/* Main Spending Chart Module */}
                <View className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 mb-6">
                    <View className="flex-row justify-between items-start mb-12">
                        <View>
                            <Text className="font-headline text-xl font-bold text-secondary uppercase tracking-tight">Monthly Allocation</Text>
                            <Text className="font-label text-[10px] text-outline uppercase tracking-widest mt-1">Operational Expenditure (SAR)</Text>
                        </View>
                        <View className="bg-surface-container-high rounded-md px-3 py-1 border border-outline-variant/20">
                            <Text className="font-label text-[10px] font-bold text-primary tracking-tighter uppercase">OCT 2023</Text>
                        </View>
                    </View>

                    {/* Bar Chart */}
                    <View className="flex-row items-end justify-between px-4 gap-8" style={{ height: 160 }}>
                        {/* Fuel Bar */}
                        <View className="flex-1 flex-col items-center">
                            <View className="w-full bg-secondary rounded-t-md" style={{ height: '75%' }} />
                            <Text className="font-label text-[10px] mt-3 font-bold text-secondary uppercase tracking-widest">Fuel</Text>
                        </View>
                        {/* Maintenance Bar */}
                        <View className="flex-1 flex-col items-center">
                            <View className="w-full rounded-t-md" style={{ height: '60%', backgroundColor: AMBER }} />
                            <Text className="font-label text-[10px] mt-3 font-bold uppercase tracking-widest" style={{ color: AMBER }}>Maint</Text>
                        </View>
                        {/* Parts Bar */}
                        <View className="flex-1 flex-col items-center">
                            <View className="w-full bg-surface-container-highest rounded-t-md border-t border-secondary/20" style={{ height: '50%' }} />
                            <Text className="font-label text-[10px] mt-3 font-bold text-outline uppercase tracking-widest">Parts</Text>
                        </View>
                    </View>
                </View>

                {/* Secondary Analytics */}
                <View className="flex-col gap-6 mb-10">
                    {/* Lifetime Spend Card */}
                    <View className="bg-surface-container-high rounded-xl p-6 border-t border-primary/20 flex-col justify-between" style={{ minHeight: 140 }}>
                        <Text className="font-label text-[10px] font-bold text-primary uppercase tracking-widest mb-4">Total Lifetime Spend</Text>
                        <View>
                            <View className="flex-row items-baseline">
                                <Text className="font-headline text-4xl font-extrabold text-on-surface tracking-tighter">4,500</Text>
                                <Text className="font-label text-sm text-secondary opacity-60 ml-2">SAR</Text>
                            </View>
                            <View className="h-1 w-full bg-surface-container-highest mt-4 rounded-full overflow-hidden">
                                <View className="h-full bg-primary rounded-full" style={{ width: '65%' }} />
                            </View>
                        </View>
                    </View>

                    {/* Circular Health Gauge */}
                    <View className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 items-center justify-center relative overflow-hidden" style={{ aspectRatio: 1 }}>
                        <Svg width={128} height={128} viewBox="0 0 128 128" style={{ transform: [{ rotate: '-90deg' }] }}>
                            <Circle cx="64" cy="64" r="56" stroke="#2a3644" strokeWidth="8" fill="transparent" />
                            <Circle
                                cx="64" cy="64" r="56"
                                stroke={AMBER}
                                strokeWidth="8"
                                fill="transparent"
                                strokeDasharray="351.9"
                                strokeDashoffset="88"
                            />
                        </Svg>
                        <View className="absolute inset-0 items-center justify-center">
                            <Text className="font-headline text-2xl font-bold text-on-surface">75%</Text>
                            <Text className="font-label text-[8px] uppercase tracking-tighter text-outline">Health</Text>
                        </View>
                        <Text className="font-label text-[10px] mt-2 font-bold text-secondary opacity-40 uppercase tracking-widest absolute bottom-6">System Integrity</Text>
                    </View>
                </View>

                {/* Add Button */}
                <View className="items-center mt-2">
                    <TouchableOpacity className="w-16 h-16 rounded-full border border-secondary/30 bg-surface-container-high items-center justify-center">
                        <MaterialIcons name="add" size={28} color="#c6c6c6" />
                    </TouchableOpacity>
                </View>

            </ScrollView>
        </View>
    );
}
