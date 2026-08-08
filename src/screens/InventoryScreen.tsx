import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import ActiveVehicleChip from '../components/ActiveVehicleChip';
import { getInventoryItems, getInventoryMetrics, upsertInventoryItem, updateInventoryItem, deleteInventoryItem } from '../services/database';
import type { InventoryItem } from '../types/database.types';
import { parseWholeNumberInput } from '../utils/recordValidation';
import ProtectedModal from '../components/ProtectedModal';
import AppTopBar from '../components/ui/AppTopBar';
import AppBottomSheet from '../components/ui/AppBottomSheet';
import AppPrimaryButton from '../components/ui/AppPrimaryButton';
import AppTextField from '../components/ui/AppTextField';
import EmptyState from '../components/ui/EmptyState';
import StatusBadge from '../components/ui/StatusBadge';
import AppScreen from '../components/ui/AppScreen';
import AppListContinuation from '../components/ui/AppListContinuation';
import useIncrementalRecordLimit from '../hooks/useIncrementalRecordLimit';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';
import { formatNumber, localizeErrorMessage, useTranslation } from '../i18n';

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
    const { t } = useTranslation();
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [totalUnits, setTotalUnits] = useState(0);
    const { canLoadOlder, limit, loadOlder } = useIncrementalRecordLimit(items.length);
    const [modalVisible, setModalVisible] = useState(false);

    // Form state
    const [formName, setFormName] = useState('');
    const [formCategory, setFormCategory] = useState('');
    const [formQuantity, setFormQuantity] = useState('');
    const [formQuantityError, setFormQuantityError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const loadItems = useCallback(async (isCurrent: () => boolean) => {
        const [data, metrics] = await Promise.all([
            getInventoryItems({ limit }),
            getInventoryMetrics(),
        ]);
        if (!isCurrent()) return;
        setItems(data);
        setTotalUnits(metrics.totalUnits);
    }, [limit]);

    const { error: loadError, loading, reload } = useFocusedLoader(
        loadItems,
        t('inventory.loadError'), t('inventory.loadLog')
    );

    const updateQuantity = async (item: InventoryItem, quantity: number) => {
        try {
            await updateInventoryItem(item.id, { quantity });
            await reload();
        } catch (error) {
            console.error('Failed to update inventory quantity:', error);
            Alert.alert(t('inventory.quantityFailed'), t('inventory.quantityFailedBody'));
        }
    };

    const handleIncrement = async (item: InventoryItem) => {
        await updateQuantity(item, item.quantity + 1);
    };

    const handleDecrement = async (item: InventoryItem) => {
        if (item.quantity <= 0) return;
        await updateQuantity(item, item.quantity - 1);
    };

    const handleDelete = (item: InventoryItem) => {
        Alert.alert(t('inventory.deleteTitle'), t('inventory.deleteBody', { name: item.name }), [
            { text: t('common.cancel'), style: 'cancel' },
            {
                text: t('common.delete'),
                style: 'destructive',
                onPress: async () => {
                    try {
                        await deleteInventoryItem(item.id);
                        await reload();
                    } catch (error) {
                        console.error('Failed to delete inventory item:', error);
                        Alert.alert(t('inventory.deleteFailed'), t('inventory.deleteFailedBody'));
                    }
                },
            },
        ]);
    };

    const handleAddItem = async () => {
        if (!formName.trim()) {
            Alert.alert(t('inventory.missingName'), t('inventory.missingNameBody'));
            return;
        }
        const quantityResult = formQuantity.trim()
            ? parseWholeNumberInput(formQuantity, { label: t('inventory.quantity'), min: 0 })
            : { ok: true as const, value: 0 };
        if (!quantityResult.ok) {
            setFormQuantityError(quantityResult.message);
            return;
        }

        setFormQuantityError(null);
        setSaving(true);
        try {
            await upsertInventoryItem({
                name: formName.trim(),
                category: formCategory.trim() || 'General',
                quantity: quantityResult.value,
                last_replaced_at: null,
            });
            setFormName('');
            setFormCategory('');
            setFormQuantity('');
            setModalVisible(false);
            await reload();
        } catch (error) {
            setFormQuantityError(localizeErrorMessage(error, t('inventory.saveQuantityFailed')));
        } finally {
            setSaving(false);
        }
    };

    if (loading || loadError) {
        return <ScreenLoadState error={loadError} loading={loading} onRetry={reload} title={t('inventory.title')} />;
    }

    return (
        <AppScreen>
            <AppTopBar
                tone="elevated"
                leading={<MaterialIcons name="precision-manufacturing" size={24} color="#a9c7ff" />}
            >
                <Text className="text-xl font-bold text-[#C0C0C0] tracking-widest font-headline uppercase" numberOfLines={1}>{t('inventory.title')}</Text>
            </AppTopBar>

            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}
            >
                {/* Dashboard Header Context */}
                <View className="mb-10 flex-col gap-6">
                    <View>
                        <ActiveVehicleChip />
                        <Text className="font-label text-xs font-bold tracking-[0.2em] text-[#a9c7ff] uppercase mb-1">{t('inventory.overview')}</Text>
                        <Text className="font-headline text-3xl font-bold tracking-tight text-on-surface">{t('inventory.heading')}</Text>
                    </View>
                    <View className="flex-row gap-4">
                        <View className="bg-surface-container-low px-4 py-3 rounded-xl border border-outline-variant/15 flex-row items-center gap-3">
                            <View className="w-2 h-2 rounded-full bg-primary" />
                            <Text className="font-label text-xs font-bold tracking-widest uppercase text-on-surface">{t('inventory.totalUnits', { count: formatNumber(totalUnits) })}</Text>
                        </View>
                    </View>
                </View>

                {items.length === 0 ? (
                    <EmptyState
                        className="mb-8"
                        icon="inventory-2"
                        message={t('inventory.emptyBody')}
                        title={t('inventory.emptyTitle')}
                    />
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
                                            {isOutOfStock && <StatusBadge className="mb-2" label={t('inventory.out')} tone="warning" />}
                                            {!isOutOfStock && (
                                                <Text className="font-label text-xs font-bold tracking-[0.2em] text-[#C0C0C0]/40 uppercase">{t('inventory.quantity')}</Text>
                                            )}
                                            <Text className={`font-headline text-4xl font-bold ${isOutOfStock ? 'text-on-surface/30' : 'text-on-surface'}`}>
                                                {String(item.quantity).padStart(2, '0')}
                                            </Text>
                                        </View>
                                    </View>
                                    <Text className="font-headline text-xl font-medium text-[#C0C0C0] mb-6 tracking-wide flex-shrink">{item.name}</Text>
                                    <View className="flex-row justify-between gap-4 pt-4 border-t border-outline-variant/10">
                                        <TouchableOpacity
                                            disabled={isOutOfStock}
                                            className={`flex-1 items-center justify-center h-12 rounded-lg border border-outline-variant/20 ${isOutOfStock ? 'bg-surface-container-high/50 opacity-50' : 'bg-surface-container-high'}`}
                                            accessibilityLabel={t('inventory.decrease', { name: item.name })}
                                            accessibilityRole="button"
                                            accessibilityState={{ disabled: isOutOfStock }}
                                            onPress={() => handleDecrement(item)}
                                        >
                                            <MaterialIcons name="remove" size={24} color={isOutOfStock ? 'rgba(198, 198, 198, 0.3)' : '#c6c6c6'} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            className="flex-1 items-center justify-center h-12 bg-secondary rounded-lg"
                                            accessibilityLabel={t('inventory.increase', { name: item.name })}
                                            accessibilityRole="button"
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

                    <AppListContinuation visible={canLoadOlder} onPress={loadOlder} />

                    {/* Add New Part */}
                    <TouchableOpacity
                        className="bg-surface-container-low border-2 border-dashed border-outline-variant/30 rounded-xl p-6 flex-col items-center justify-center min-h-[220px] mb-8"
                        accessibilityLabel={t('inventory.catalog')}
                        accessibilityRole="button"
                        onPress={() => setModalVisible(true)}
                    >
                        <View className="w-16 h-16 rounded-full border-2 border-outline-variant/30 items-center justify-center mb-4">
                            <MaterialIcons name="add" size={32} color="#8e9196" />
                        </View>
                        <Text className="font-label text-xs font-bold tracking-widest text-outline uppercase">{t('inventory.catalog')}</Text>
                    </TouchableOpacity>
            </ScrollView>

            {/* Add Item Modal */}
            <ProtectedModal
                accessibilityLabel={t('inventory.dialog')}
                visible={modalVisible}
                animationType="slide"
                transparent
                onRequestClose={() => {
                    if (saving) return;
                    setFormQuantityError(null);
                    setModalVisible(false);
                }}
            >
                <AppBottomSheet
                    closeDisabled={saving}
                    onClose={() => { setFormQuantityError(null); setModalVisible(false); }}
                    title={t('inventory.newComponent')}
                >
                        <View className="flex-col gap-4 mb-6">
                            <AppTextField
                                label={t('inventory.partName')}
                                placeholder={t('inventory.partPlaceholder')}
                                value={formName}
                                onChangeText={setFormName}
                            />
                            <AppTextField label={t('inventory.category')} placeholder={t('inventory.categoryPlaceholder')} value={formCategory} onChangeText={setFormCategory} />
                            <AppTextField
                                error={formQuantityError}
                                label={t('inventory.initialQuantity')}
                                placeholder="0"
                                keyboardType="number-pad"
                                value={formQuantity}
                                onChangeText={(value) => {
                                    setFormQuantity(value);
                                    setFormQuantityError(null);
                                }}
                            />
                        </View>
                        <AppPrimaryButton label={t('inventory.add')} loading={saving} onPress={handleAddItem} />
                </AppBottomSheet>
            </ProtectedModal>
        </AppScreen>
    );
}
