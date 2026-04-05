import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getInventoryItems, upsertInventoryItem, updateInventoryItem, deleteInventoryItem } from '../services/database';
import type { InventoryItem } from '../types/database.types';

const ICON_MAP: Record<string, string> = {
    'Oil': 'oil-barrel',
    'Filter': 'filter-alt',
    'Spark Plug': 'electric-bolt',
    'Belt': 'settings-input-component',
    'Brake': 'disc-full',
    'Battery': 'battery-charging-full',
    'default': 'build',
};

function getIconName(name: string): string {
    for (const [key, icon] of Object.entries(ICON_MAP)) {
        if (name.toLowerCase().includes(key.toLowerCase())) return icon;
    }
    return ICON_MAP['default'];
}

export default function InventoryScreen() {
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);

    // Form state
    const [formName, setFormName] = useState('');
    const [formCategory, setFormCategory] = useState('');
    const [formQuantity, setFormQuantity] = useState('');
    const [saving, setSaving] = useState(false);

    const loadItems = useCallback(async () => {
        setLoading(true);
        const data = await getInventoryItems();
        setItems(data);
        setLoading(false);
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadItems();
        }, [loadItems])
    );

    const handleIncrement = async (item: InventoryItem) => {
        const newQty = item.quantity + 1;
        const newStatus = newQty > 0 ? 'In Stock' : 'Out';
        await updateInventoryItem(item.id, { quantity: newQty, status: newStatus });
        await loadItems();
    };

    const handleDecrement = async (item: InventoryItem) => {
        if (item.quantity <= 0) return;
        const newQty = item.quantity - 1;
        const newStatus: InventoryItem['status'] = newQty === 0 ? 'Out' : newQty <= 1 ? 'Low' : 'In Stock';
        await updateInventoryItem(item.id, { quantity: newQty, status: newStatus });
        await loadItems();
    };

    const handleDelete = (item: InventoryItem) => {
        Alert.alert('Delete Item', `Remove "${item.name}" from inventory?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    await deleteInventoryItem(item.id);
                    await loadItems();
                },
            },
        ]);
    };

    const handleAddItem = async () => {
        if (!formName.trim()) {
            Alert.alert('Missing Name', 'Please enter a part name.');
            return;
        }
        const qty = parseInt(formQuantity, 10) || 0;
        setSaving(true);
        await upsertInventoryItem({
            name: formName.trim(),
            category: formCategory.trim() || 'General',
            status: qty > 0 ? 'In Stock' : 'Out',
            quantity: qty,
            last_replaced_at: null,
        });
        setFormName('');
        setFormCategory('');
        setFormQuantity('');
        setSaving(false);
        setModalVisible(false);
        await loadItems();
    };

    const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);

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
            <View className="flex-row items-center justify-between px-6 py-4 w-full border-b border-[#C0C0C0]/15">
                <View className="flex-row items-center gap-3">
                    <MaterialIcons name="precision-manufacturing" size={24} color="#a9c7ff" />
                    <Text className="text-xl font-bold text-[#C0C0C0] tracking-widest font-headline uppercase">3AZZA_INVENTORY</Text>
                </View>
                <View className="flex-row items-center gap-4">
                    <TouchableOpacity className="p-2 rounded-lg bg-[#a9c7ff]/10">
                        <MaterialIcons name="search" size={24} color="#C0C0C0" style={{ opacity: 0.6 }} />
                    </TouchableOpacity>
                    <TouchableOpacity className="p-2 rounded-lg bg-[#a9c7ff]/10">
                        <MaterialIcons name="notifications" size={24} color="#C0C0C0" style={{ opacity: 0.6 }} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 150 }}>
                {/* Dashboard Header Context */}
                <View className="mb-10 flex-col gap-6">
                    <View>
                        <Text className="font-label text-xs font-bold tracking-[0.2em] text-[#a9c7ff] uppercase mb-1">Stock Overview</Text>
                        <Text className="font-headline text-3xl font-bold tracking-tight text-on-surface">PARTS_REPOSITORY</Text>
                    </View>
                    <View className="flex-row gap-4">
                        <View className="bg-surface-container-low px-4 py-3 rounded-xl border border-outline-variant/15 flex-row items-center gap-3">
                            <View className="w-2 h-2 rounded-full bg-primary" />
                            <Text className="font-label text-xs font-bold tracking-widest uppercase text-on-surface">{totalUnits} TOTAL UNITS</Text>
                        </View>
                    </View>
                </View>

                {items.length === 0 ? (
                    <View className="bg-surface-container-low border border-secondary/10 p-8 rounded-xl items-center mb-8">
                        <MaterialIcons name="inventory-2" size={48} color="#2a3644" />
                        <Text className="font-label text-xs font-bold text-on-surface-variant/50 mt-4 uppercase tracking-widest">No items found</Text>
                        <Text className="font-body text-sm text-on-surface-variant/30 mt-2 text-center">Your repository is empty. Catalog your first component.</Text>
                    </View>
                ) : (
                    <View className="flex-col gap-6 mb-6">
                        {items.map((item) => {
                            const isOutOfStock = item.quantity === 0;
                            return (
                                <TouchableOpacity
                                    key={item.id}
                                    className="bg-surface-container-lowest border border-[#C0C0C0]/20 rounded-xl p-6 relative overflow-hidden"
                                    activeOpacity={0.9}
                                    onLongPress={() => handleDelete(item)}
                                >
                                    {isOutOfStock && <View className="absolute inset-0 bg-red-900/10" />}
                                    <View className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full opacity-50 -mr-16 -mt-16" />
                                    <View className="flex-row justify-between items-start mb-8 relative">
                                        <View className="bg-surface-container-high w-14 h-14 rounded-lg items-center justify-center border border-outline-variant/20">
                                            <MaterialIcons name={getIconName(item.name) as any} size={28} color="#a9c7ff" />
                                        </View>
                                        <View className="items-end">
                                            {isOutOfStock && (
                                                <View className="bg-[#FFB100]/10 px-2 py-1 rounded border border-[#FFB100]/20 mb-2">
                                                    <Text className="text-[#FFB100] text-[10px] font-bold font-label tracking-widest uppercase">Out of Stock</Text>
                                                </View>
                                            )}
                                            {!isOutOfStock && (
                                                <Text className="font-label text-[10px] font-bold tracking-[0.2em] text-[#C0C0C0]/40 uppercase">Quantity</Text>
                                            )}
                                            <Text className={`font-headline text-4xl font-bold ${isOutOfStock ? 'text-on-surface/30' : 'text-on-surface'}`}>
                                                {String(item.quantity).padStart(2, '0')}
                                            </Text>
                                        </View>
                                    </View>
                                    <Text className="font-headline text-xl font-medium text-[#C0C0C0] mb-6 tracking-wide">{item.name}</Text>
                                    <View className="flex-row justify-between gap-4 pt-4 border-t border-outline-variant/10">
                                        <TouchableOpacity
                                            disabled={isOutOfStock}
                                            className={`flex-1 items-center justify-center h-12 rounded-lg border border-outline-variant/20 ${isOutOfStock ? 'bg-surface-container-high/50 opacity-50' : 'bg-surface-container-high'}`}
                                            onPress={() => handleDecrement(item)}
                                        >
                                            <MaterialIcons name="remove" size={24} color={isOutOfStock ? 'rgba(198, 198, 198, 0.3)' : '#c6c6c6'} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            className="flex-1 items-center justify-center h-12 bg-secondary rounded-lg"
                                            onPress={() => handleIncrement(item)}
                                        >
                                            <MaterialIcons name="add" size={24} color="#081421" />
                                        </TouchableOpacity>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                    {/* Add New Part */}
                    <TouchableOpacity
                        className="bg-surface-container-low border-2 border-dashed border-outline-variant/30 rounded-xl p-6 flex-col items-center justify-center min-h-[220px] mb-8"
                        onPress={() => setModalVisible(true)}
                    >
                        <View className="w-16 h-16 rounded-full border-2 border-outline-variant/30 items-center justify-center mb-4">
                            <MaterialIcons name="add" size={32} color="#8e9196" />
                        </View>
                        <Text className="font-label text-xs font-bold tracking-widest text-outline uppercase">Catalog New Component</Text>
                    </TouchableOpacity>
            </ScrollView>

            {/* Add Item Modal */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <View className="flex-1 justify-end">
                    <View className="bg-surface-container rounded-t-3xl p-6 border-t border-outline-variant/20">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="font-headline text-xl font-bold text-on-surface">New Component</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <MaterialIcons name="close" size={24} color="#c4c6cc" />
                            </TouchableOpacity>
                        </View>

                        <View className="flex-col gap-4 mb-6">
                            <View>
                                <Text className="font-label text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">Part Name *</Text>
                                <TextInput
                                    className="bg-surface-container-high rounded-xl px-4 py-3 text-on-surface font-body border border-outline-variant/20"
                                    placeholder="e.g. Oil Filter"
                                    placeholderTextColor="#64748b"
                                    value={formName}
                                    onChangeText={setFormName}
                                />
                            </View>
                            <View>
                                <Text className="font-label text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">Category</Text>
                                <TextInput
                                    className="bg-surface-container-high rounded-xl px-4 py-3 text-on-surface font-body border border-outline-variant/20"
                                    placeholder="e.g. Filter, Oil, Belt"
                                    placeholderTextColor="#64748b"
                                    value={formCategory}
                                    onChangeText={setFormCategory}
                                />
                            </View>
                            <View>
                                <Text className="font-label text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">Initial Quantity</Text>
                                <TextInput
                                    className="bg-surface-container-high rounded-xl px-4 py-3 text-on-surface font-body border border-outline-variant/20"
                                    placeholder="0"
                                    placeholderTextColor="#64748b"
                                    keyboardType="number-pad"
                                    value={formQuantity}
                                    onChangeText={setFormQuantity}
                                />
                            </View>
                        </View>

                        <TouchableOpacity
                            className="bg-primary rounded-xl py-4 items-center"
                            onPress={handleAddItem}
                            disabled={saving}
                            activeOpacity={0.85}
                        >
                            {saving ? (
                                <ActivityIndicator color="#081421" />
                            ) : (
                                <Text className="font-label text-base font-bold text-[#081421] uppercase tracking-wider">Add to Inventory</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
