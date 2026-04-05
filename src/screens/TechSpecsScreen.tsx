import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';

export default function TechSpecsScreen() {
    return (
        <View className="flex-1 bg-background pt-12">
            {/* TopAppBar */}
            <View className="flex-row items-center justify-between px-6 py-4 w-full border-b border-[#C0C0C0]/15">
                <View className="flex-row items-center gap-4">
                    <MaterialIcons name="menu" size={24} color="#a9c7ff" />
                    <Text className="font-headline uppercase tracking-widest text-sm font-bold text-[#a9c7ff]">TECH_SPECS</Text>
                </View>
                <View className="flex-row items-center gap-4">
                    <Text className="text-[#C0C0C0] font-black tracking-tighter text-2xl italic">3AZZA</Text>
                    <View className="w-8 h-8 rounded-full bg-surface-container-highest border border-outline-variant items-center justify-center overflow-hidden">
                        <Image
                            source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCQ4bjtVeemnnZeZxsec7dgRbNOI_C8JeGJFl3x6aIciuXeSEuLv3MLtqjXIqQbN65HsoubhEyhr9x7BvWs9BPjaqpnECu6BHpFUToZM05-aGSxrzViN9b_X3G-K9gz7-xvBZNp4beqcHgHcfwtsPcbjL_HxG2HudApDtn1zdFPLRq8GJs2B18qNg5rJnmKxCwL_rgl99nKobnVLEvN7ciDnU1k4SUXT3lsIYO88MHBJKJrsRW98daZ-7cbIcpvoX0SR7nlJNETv9E' }}
                            className="w-full h-full"
                        />
                    </View>
                </View>
            </View>

            <ScrollView className="flex-1 px-4 pt-6" contentContainerStyle={{ paddingBottom: 150 }}>
                {/* Hero Branding Section */}
                <View className="mb-10 flex-col gap-6">
                    <View>
                        <Text className="font-label text-primary uppercase tracking-[0.3em] text-[10px] font-extrabold mb-2">MAINTENANCE_PROTOCOL</Text>
                        <Text className="font-headline text-5xl font-bold text-secondary tracking-tighter">SYM ST 2024</Text>
                        <Text className="font-body text-on-surface-variant/70 mt-2">High-precision torque specification reference for orbital maintenance and mechanical calibration.</Text>
                    </View>
                    <View className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 flex-row items-center gap-4 self-start">
                        <View className="w-12 h-12 rounded-full bg-primary/10 items-center justify-center">
                            <MaterialIcons name="precision-manufacturing" size={24} color="#a9c7ff" />
                        </View>
                        <View>
                            <Text className="font-label text-[10px] text-secondary/60 uppercase">SYSTEM_STATUS</Text>
                            <Text className="font-headline font-bold text-secondary text-lg">CERTIFIED</Text>
                        </View>
                    </View>
                </View>

                {/* Tech Specs Bento Grid */}
                <View className="flex-col gap-6">

                    {/* Torque Table Module */}
                    <View className="bg-surface-container-lowest rounded-xl overflow-hidden border border-outline-variant/15">
                        <View className="px-6 py-4 bg-surface-container-high/50 flex-row items-center justify-between border-b border-outline-variant/20">
                            <Text className="font-headline font-bold text-secondary tracking-tight">MECHANICAL_TORQUE_MATRIX</Text>
                            <View className="bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                                <Text className="font-label text-[9px] text-primary">UNITS: NM / MM</Text>
                            </View>
                        </View>

                        <View className="w-full border-b border-outline-variant/10">
                            {/* Table Header mock */}
                            <View className="flex-row bg-surface-container-low/40 px-6 py-2">
                                <Text className="flex-1 font-headline text-xs font-bold text-primary tracking-widest uppercase">Component</Text>
                                <Text className="flex-1 font-headline text-xs font-bold text-primary tracking-widest uppercase text-center">Torque</Text>
                                <Text className="flex-1 font-headline text-xs font-bold text-primary tracking-widest uppercase text-right">Tool Size</Text>
                            </View>

                            {/* Rows */}
                            <View className="px-6 py-4 border-b border-outline-variant/10 flex-row items-center">
                                <View className="flex-1">
                                    <Text className="font-body font-bold text-secondary text-sm">Rear Axle Nut</Text>
                                    <Text className="font-label text-[10px] text-on-surface-variant/50 uppercase tracking-tighter">Critical_Safety_Node</Text>
                                </View>
                                <View className="flex-1 items-center">
                                    <Text className="font-headline text-xl font-light text-on-surface">100-120</Text>
                                </View>
                                <View className="flex-1 items-end">
                                    <View className="bg-[#484949]/30 px-3 py-1 rounded-md border border-outline-variant/20">
                                        <Text className="font-label font-black text-[#c6c6c6] text-xs">24mm Socket</Text>
                                    </View>
                                </View>
                            </View>

                            <View className="px-6 py-4 border-b border-outline-variant/10 flex-row items-center">
                                <View className="flex-1">
                                    <Text className="font-body font-bold text-secondary text-sm">Oil Drain Bolt</Text>
                                    <Text className="font-label text-[10px] text-on-surface-variant/50 uppercase tracking-tighter">Fluid_Containment</Text>
                                </View>
                                <View className="flex-1 items-center">
                                    <Text className="font-headline text-xl font-light text-on-surface">20-25</Text>
                                </View>
                                <View className="flex-1 items-end">
                                    <View className="bg-[#484949]/30 px-3 py-1 rounded-md border border-outline-variant/20">
                                        <Text className="font-label font-black text-[#c6c6c6] text-xs">17mm Socket</Text>
                                    </View>
                                </View>
                            </View>

                            <View className="px-6 py-4 flex-row items-center">
                                <View className="flex-1">
                                    <Text className="font-body font-bold text-secondary text-sm">Air Filter</Text>
                                    <Text className="font-label text-[10px] text-on-surface-variant/50 uppercase tracking-tighter">Induction_Seal</Text>
                                </View>
                                <View className="flex-1 items-center">
                                    <Text className="font-headline text-xl font-light text-on-surface">1.2</Text>
                                </View>
                                <View className="flex-1 items-end">
                                    <View className="bg-[#484949]/30 px-3 py-1 rounded-md border border-outline-variant/20">
                                        <Text className="font-label font-black text-[#c6c6c6] text-xs">8mm T-Handle</Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Visualization Module */}
                    <View className="flex-col gap-6">
                        <View className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/15 flex-col items-center justify-center relative overflow-hidden">
                            <View className="absolute inset-0 opacity-10 pointer-events-none items-center justify-center">
                                <View className="w-full aspect-square border-[20px] border-primary/20 rounded-full scale-150" />
                            </View>
                            <View className="relative w-48 h-48 mb-4 items-center justify-center">
                                <Svg width="100%" height="100%" viewBox="0 0 100 100" style={{ transform: [{ rotate: '-90deg' }] }}>
                                    <Circle cx="50" cy="50" r="45" stroke="#1f2b39" strokeWidth="6" fill="transparent" />
                                    <Circle cx="50" cy="50" r="45" stroke="#a9c7ff" strokeWidth="6" fill="transparent" strokeDasharray="282.7" strokeDashoffset="70" />
                                </Svg>
                                <View className="absolute inset-0 flex-col items-center justify-center">
                                    <Text className="font-label text-[10px] text-secondary/60 uppercase">MAX_LOAD</Text>
                                    <Text className="font-headline text-4xl font-black text-secondary tracking-tighter">120</Text>
                                    <Text className="font-label text-[10px] text-primary">NM</Text>
                                </View>
                            </View>
                            <View className="items-center">
                                <Text className="font-headline text-sm font-bold text-secondary uppercase tracking-widest">Torque Threshold</Text>
                                <Text className="font-body text-xs text-on-surface-variant/60 mt-1">Calibration based on factory SYM ISO standards.</Text>
                            </View>
                        </View>

                        <View className="bg-primary-container/20 rounded-xl p-6 border border-primary/20">
                            <View className="flex-row items-center gap-3 mb-3">
                                <MaterialIcons name="warning" size={20} color="#a9c7ff" />
                                <Text className="font-headline text-sm font-bold text-primary uppercase">Precision Note</Text>
                            </View>
                            <Text className="font-body text-xs text-on-surface/80 leading-relaxed italic">
                                "Ensure all threads are clean and dry before applying specified torque. Re-check critical nodes after 100km of operational heat cycles."
                            </Text>
                        </View>
                    </View>

                    {/* Tooling Quick-Search Bento */}
                    <View className="flex-row flex-wrap gap-4 mt-2 justify-between">
                        <View className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 flex-col items-center justify-center flex-1 min-w-[45%]">
                            <MaterialIcons name="build" size={24} color="rgba(198, 198, 198, 0.4)" style={{ marginBottom: 8 }} />
                            <Text className="font-label text-[10px] text-secondary/60 uppercase mb-1">Sockets Needed</Text>
                            <Text className="font-headline font-bold text-secondary">24/17/12</Text>
                        </View>
                        <View className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 flex-col items-center justify-center flex-1 min-w-[45%]">
                            <MaterialIcons name="hardware" size={24} color="rgba(198, 198, 198, 0.4)" style={{ marginBottom: 8 }} />
                            <Text className="font-label text-[10px] text-secondary/60 uppercase mb-1">Calibration</Text>
                            <Text className="font-headline font-bold text-secondary">ISO 6789</Text>
                        </View>
                        <View className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 flex-col items-center justify-center flex-1 min-w-[45%]">
                            <MaterialIcons name="history" size={24} color="rgba(198, 198, 198, 0.4)" style={{ marginBottom: 8 }} />
                            <Text className="font-label text-[10px] text-secondary/60 uppercase mb-1">Cycle Count</Text>
                            <Text className="font-headline font-bold text-secondary">15,000 KM</Text>
                        </View>
                        <View className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 flex-col items-center justify-center flex-1 min-w-[45%]">
                            <MaterialIcons name="compress" size={24} color="rgba(198, 198, 198, 0.4)" style={{ marginBottom: 8 }} />
                            <Text className="font-label text-[10px] text-secondary/60 uppercase mb-1">Air Pressure</Text>
                            <Text className="font-headline font-bold text-secondary">32 PSI / 2.2</Text>
                        </View>
                    </View>

                </View>
            </ScrollView>
        </View>
    );
}
