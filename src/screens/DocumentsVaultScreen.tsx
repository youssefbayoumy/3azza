import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Image,
    TextInput,
    ActivityIndicator,
    Alert,
    Platform,
    type DimensionValue,
    type LayoutChangeEvent,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { getDocumentCount, getDocuments, addDocument, deleteDocument } from '../services/database';
import type { DocumentItem } from '../types/database.types';
import { formatDateLabel, isExpired, isExpiringSoon, toIsoDate } from '../utils/dates';
import { syncMaintenanceNotifications } from '../services/notifications';
import { useAppStore } from '../store/useAppStore';
import ProtectedModal from '../components/ProtectedModal';
import ActiveVehicleChip from '../components/ActiveVehicleChip';
import AppTopBar from '../components/ui/AppTopBar';
import AppScreen from '../components/ui/AppScreen';
import AppListContinuation from '../components/ui/AppListContinuation';
import useIncrementalRecordLimit from '../hooks/useIncrementalRecordLimit';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';
import { useTranslation } from '../i18n';

const DOCUMENT_GRID_GAP = 16;
const MIN_DOCUMENT_CARD_WIDTH = 220;

export default function DocumentsVaultScreen() {
    const { t } = useTranslation();
    const maintenanceReminders = useAppStore((state) => state.maintenanceReminders);
    const [documents, setDocuments] = useState<DocumentItem[]>([]);
    const [documentCount, setDocumentCount] = useState(0);
    const { canLoadOlder, limit, loadOlder } = useIncrementalRecordLimit(documents.length);
    const [modalVisible, setModalVisible] = useState(false);
    const [documentGridWidth, setDocumentGridWidth] = useState(0);

    // Form state
    const [title, setTitle] = useState('');
    const [expiryDate, setExpiryDate] = useState<Date | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const loadDocuments = useCallback(async (isCurrent: () => boolean) => {
        const [data, count] = await Promise.all([
            getDocuments({ limit }),
            getDocumentCount(),
        ]);
        if (!isCurrent()) return;
        setDocuments(data);
        setDocumentCount(count);
    }, [limit]);

    const { error: loadError, loading, reload } = useFocusedLoader(
        loadDocuments,
        t('documents.loadError'),
        t('documents.loadLog')
    );

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert(t('documents.photoPermission'), t('documents.photoPermissionBody'));
            return;
        }

        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 0.8,
        });

        if (!result.canceled) {
            setImageUri(result.assets[0].uri);
        }
    };

    const handleDateChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
        }
        if (selectedDate) {
            setExpiryDate(selectedDate);
        }
    };

    const takePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert(t('documents.cameraPermission'), t('documents.cameraPermissionBody'));
            return;
        }

        let result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            quality: 0.8,
        });

        if (!result.canceled) {
            setImageUri(result.assets[0].uri);
        }
    };

    const handleSaveDocument = async () => {
        if (!title.trim() || !imageUri) {
            Alert.alert(t('documents.missingTitle'), t('documents.missingBody'));
            return;
        }

        setSaving(true);
        try {
            // Move file to app's document directory to ensure persistence
            const filename = imageUri.split('/').pop() || `doc_${Date.now()}.jpg`;
            const destPath = `${FileSystem.documentDirectory}${filename}`;
            
            await FileSystem.copyAsync({
                from: imageUri,
                to: destPath
            });

            await addDocument({
                title: title.trim(),
                image_uri: destPath,
                expiry_date: expiryDate ? toIsoDate(expiryDate) : null
            });

            setModalVisible(false);
            setTitle('');
            setExpiryDate(null);
            setImageUri(null);
            await reload();
            await syncMaintenanceNotifications(maintenanceReminders);
        } catch (error) {
            console.error('Save error:', error);
            Alert.alert(t('documents.saveErrorTitle'), t('documents.saveErrorBody'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (doc: DocumentItem) => {
        Alert.alert(t('documents.deleteTitle'), t('documents.deleteBody', { title: doc.title }), [
            { text: t('common.cancel'), style: 'cancel' },
            {
                text: t('common.delete'),
                style: 'destructive',
                onPress: async () => {
                    try {
                        await deleteDocument(doc.id);
                        try {
                            await FileSystem.deleteAsync(doc.image_uri, { idempotent: true });
                        } catch (fileError) {
                            console.warn('Document record deleted but its local image could not be removed:', fileError);
                        }
                        await reload();
                        await syncMaintenanceNotifications(maintenanceReminders);
                    } catch (error) {
                        console.error('Failed to delete document:', error);
                        Alert.alert(t('documents.deleteFailedTitle'), t('documents.deleteFailedBody'));
                    }
                }
            }
        ]);
    };

    const handleDocumentGridLayout = useCallback((event: LayoutChangeEvent) => {
        const nextWidth = Math.round(event.nativeEvent.layout.width);
        setDocumentGridWidth((currentWidth) => currentWidth === nextWidth ? currentWidth : nextWidth);
    }, []);

    const documentColumnCount = documentGridWidth > 0
        ? Math.max(1, Math.floor((documentGridWidth + DOCUMENT_GRID_GAP) / (MIN_DOCUMENT_CARD_WIDTH + DOCUMENT_GRID_GAP)))
        : 1;
    const documentCardWidth: DimensionValue = documentGridWidth > 0
        ? (documentGridWidth - ((documentColumnCount - 1) * DOCUMENT_GRID_GAP)) / documentColumnCount
        : '100%';

    if (loading || loadError) {
        return <ScreenLoadState error={loadError} loading={loading} onRetry={reload} title={t('documents.title')} />;
    }

    return (
        <AppScreen>
            <AppTopBar
                tone="elevated"
                trailing={<View className="w-8 h-8 rounded-full border border-outline-variant overflow-hidden bg-surface-container-highest">
                    <MaterialIcons name="person" size={20} color="#a9c7ff" style={{ alignSelf: 'center', marginTop: 4 }} />
                </View>}
            >
                <Text className="text-xl font-bold text-[#C0C0C0] tracking-widest font-headline uppercase">{t('documents.title')}</Text>
            </AppTopBar>

            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}
            >
                {/* Vault Header Info */}
                <View className="mb-6 gap-4">
                    <View className="gap-2">
                        <ActiveVehicleChip />
                        <Text className="font-label text-xs uppercase font-bold tracking-[0.2em] text-primary">{t('documents.localRecords')}</Text>
                    </View>
                    <View className="bg-surface-container-high/40 p-4 rounded-xl border border-outline-variant/10 flex-row items-stretch">
                        <View className="flex-1 items-center justify-center px-2">
                            <Text className="font-label text-xs text-secondary/60 uppercase">{t('documents.storage')}</Text>
                            <Text className="font-headline text-lg font-bold text-primary text-center">{t('documents.onDevice')}</Text>
                        </View>
                        <View className="w-px self-stretch bg-outline-variant/20" />
                        <View className="flex-1 items-center justify-center px-2">
                            <Text className="font-label text-xs text-secondary/60 uppercase">{t('documents.files')}</Text>
                            <Text className="font-headline text-lg font-bold text-on-surface">{documentCount}</Text>
                        </View>
                    </View>
                </View>

                {documents.length === 0 ? (
                    <TouchableOpacity
                        className="border border-dashed border-outline-variant/30 rounded-2xl px-6 py-10 items-center justify-center bg-surface-container-low/30"
                        accessibilityLabel={t('documents.addFirst')}
                        accessibilityRole="button"
                        onPress={() => setModalVisible(true)}
                        activeOpacity={0.8}
                    >
                        <View className="w-14 h-14 rounded-full bg-primary/10 items-center justify-center mb-4">
                            <MaterialIcons name="note-add" size={28} color="#a9c7ff" />
                        </View>
                        <Text className="font-headline text-lg font-bold text-on-surface text-center">{t('documents.emptyTitle')}</Text>
                        <Text className="font-body text-sm text-on-surface-variant text-center mt-2 leading-5">
                            {t('documents.emptyBody')}
                        </Text>
                        <View className="mt-6 px-5 py-3 rounded-xl bg-primary flex-row items-center gap-2">
                            <MaterialIcons name="add" size={18} color="#082047" />
                            <Text className="font-label text-xs font-bold uppercase tracking-wider text-on-primary">{t('documents.add')}</Text>
                        </View>
                    </TouchableOpacity>
                ) : (
                    <>
                        {/* Width is measured at runtime so phones and tablets receive an appropriate column count. */}
                        <View
                            className="flex-row flex-wrap"
                            onLayout={handleDocumentGridLayout}
                            style={{ columnGap: DOCUMENT_GRID_GAP, rowGap: DOCUMENT_GRID_GAP }}
                        >
                            {documents.map((doc) => {
                        const expiring = isExpiringSoon(doc.expiry_date);
                        const expired = isExpired(doc.expiry_date);

                        return (
                            <TouchableOpacity
                                key={doc.id}
                                accessibilityLabel={t('documents.cardA11y', { title: doc.title, date: formatDateLabel(doc.expiry_date) })}
                                accessibilityRole="button"
                                className="bg-[#1B2735] border border-secondary/30 rounded-xl p-4 flex-col gap-4 relative overflow-hidden"
                                style={{ width: documentCardWidth }}
                                activeOpacity={0.8}
                                onLongPress={() => handleDelete(doc)}
                            >
                                <View className="flex-row justify-between items-start">
                                    <View className="w-14 h-16 bg-surface-container-lowest rounded-md border border-outline-variant/20 overflow-hidden items-center justify-center">
                                        <Image source={{ uri: doc.image_uri }} className="w-full h-full opacity-80" />
                                    </View>
                                    <MaterialIcons name="more-vert" size={16} color="rgba(198,198,198,0.4)" />
                                </View>
                                
                                <View>
                                    <Text className="font-headline text-sm font-bold text-secondary uppercase tracking-tight" numberOfLines={1}>
                                        {doc.title}
                                    </Text>
                                    <View className="mt-2 flex-row items-center gap-1">
                                        <Text className="font-label text-xs text-secondary/50 uppercase">{t('documents.expires')}</Text>
                                        <Text className={`font-label text-xs font-bold ${expired ? 'text-error' : expiring ? 'text-[#FFB100]' : 'text-secondary'}`}>
                                            {formatDateLabel(doc.expiry_date)}
                                        </Text>
                                    </View>
                                </View>
                                
                                {(expiring || expired) && (
                                    <View className="absolute top-2 right-2">
                                        <View className={`w-2 h-2 rounded-full ${expired ? 'bg-error shadow-[0_0_8px_#ffb4ab]' : 'bg-[#FFB100] shadow-[0_0_8px_#FFB100]'}`} />
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                            })}
                        </View>

                        <TouchableOpacity
                            className="mt-5 py-3.5 px-4 rounded-xl border border-primary/30 bg-primary/10 flex-row items-center justify-center gap-2"
                            accessibilityLabel={t('documents.add')}
                            accessibilityRole="button"
                            onPress={() => setModalVisible(true)}
                        >
                            <MaterialIcons name="add-photo-alternate" size={20} color="#a9c7ff" />
                            <Text className="font-label text-xs uppercase font-bold tracking-wider text-primary">{t('documents.add')}</Text>
                        </TouchableOpacity>
                    </>
                )}

                <AppListContinuation visible={canLoadOlder} onPress={loadOlder} />

                {/* System Stats Bar */}
                <View className="mt-6 p-4 rounded-xl bg-surface-container-low border border-outline-variant/10 gap-4 sm:flex-row sm:items-center">
                    <View className="flex-row items-center gap-3">
                        <View className="w-10 h-10 rounded-full bg-primary-container items-center justify-center">
                            <MaterialIcons name="lock-open" size={18} color="#a9c7ff" />
                        </View>
                        <View>
                            <Text className="font-label text-xs text-secondary/50 uppercase">{t('documents.status')}</Text>
                            <Text className="font-headline text-sm font-bold uppercase text-on-surface">{t('documents.notEncrypted')}</Text>
                        </View>
                    </View>
                    <Text className="font-body text-xs text-on-surface-variant flex-1 leading-5">{t('documents.securityBody')}</Text>
                </View>
            </ScrollView>

            {/* Add Document Modal */}
            <ProtectedModal
                accessibilityLabel={t('documents.dialog')}
                visible={modalVisible}
                animationType="slide"
                transparent
                onRequestClose={() => {
                    if (saving) return;
                    setModalVisible(false);
                    setImageUri(null);
                    setExpiryDate(null);
                    setShowDatePicker(false);
                }}
            >
                <View className="flex-1 justify-end bg-black/50">
                    <View className="w-full max-w-2xl self-center bg-surface-container rounded-t-3xl p-6 border-t border-outline-variant/20 pt-8 shadow-2xl">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="font-headline text-xl font-bold text-on-surface">{t('documents.addPhoto')}</Text>
                            <TouchableOpacity onPress={() => {
                                setModalVisible(false);
                                setImageUri(null);
                                setExpiryDate(null);
                                setShowDatePicker(false);
                            }} accessibilityLabel={t('documents.closeForm')} accessibilityRole="button">
                                <MaterialIcons name="close" size={24} color="#c4c6cc" />
                            </TouchableOpacity>
                        </View>

                        <View className="flex-col gap-5 mb-8">
                            <View>
                                <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">{t('documents.documentTitle')}</Text>
                                <TextInput
                                    accessibilityLabel={t('documents.titleA11y')}
                                    className="bg-surface-container-high rounded-xl px-4 py-3 text-on-surface font-body border border-outline-variant/20"
                                    placeholder={t('documents.titlePlaceholder')}
                                    placeholderTextColor="#64748b"
                                    value={title}
                                    onChangeText={setTitle}
                                />
                            </View>
                            
                            <View>
                                <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">{t('documents.expiryOptional')}</Text>
                                <View className="flex-row gap-3">
                                    <TouchableOpacity
                                        className="flex-1 bg-surface-container-high rounded-xl px-4 py-3 border border-outline-variant/20 flex-row items-center justify-between"
                                        accessibilityLabel={t('documents.setExpiry')}
                                        accessibilityRole="button"
                                        onPress={() => setShowDatePicker(true)}
                                    >
                                        <Text className={`font-body ${expiryDate ? 'text-on-surface' : 'text-slate-500'}`}>
                                            {expiryDate ? toIsoDate(expiryDate) : t('documents.noExpiry')}
                                        </Text>
                                        <MaterialIcons name="event" size={20} color="#a9c7ff" />
                                    </TouchableOpacity>
                                    {expiryDate && (
                                        <TouchableOpacity
                                            className="bg-surface-container-high rounded-xl px-4 items-center justify-center border border-outline-variant/20"
                                            accessibilityLabel={t('documents.clearExpiry')}
                                            accessibilityRole="button"
                                            onPress={() => setExpiryDate(null)}
                                        >
                                            <MaterialIcons name="close" size={20} color="#c6c6c6" />
                                        </TouchableOpacity>
                                    )}
                                </View>
                                {showDatePicker && (
                                    <DateTimePicker
                                        value={expiryDate ?? new Date()}
                                        mode="date"
                                        display={Platform.OS === 'ios' ? 'inline' : 'default'}
                                        onChange={handleDateChange}
                                    />
                                )}
                            </View>

                            <View>
                                <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">{t('documents.image')}</Text>
                                {imageUri ? (
                                    <View className="flex-row items-center gap-4">
                                        <Image source={{ uri: imageUri }} className="w-24 h-24 rounded-lg border border-outline-variant/30" />
                                        <TouchableOpacity onPress={() => setImageUri(null)} className="px-4 py-2 bg-surface-container-high rounded-lg">
                                            <Text className="text-secondary text-sm font-label font-bold">{t('documents.remove')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View className="flex-row gap-4">
                                        <TouchableOpacity 
                                            className="flex-1 bg-surface-container-high rounded-xl py-4 flex-col items-center justify-center border border-outline-variant/20 border-dashed"
                                            accessibilityLabel={t('documents.takePhoto')}
                                            accessibilityRole="button"
                                            onPress={takePhoto}
                                        >
                                            <MaterialIcons name="photo-camera" size={24} color="#a9c7ff" />
                                            <Text className="mt-2 text-xs font-bold uppercase text-primary tracking-widest">{t('documents.camera')}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity 
                                            className="flex-1 bg-surface-container-high rounded-xl py-4 flex-col items-center justify-center border border-outline-variant/20 border-dashed"
                                            accessibilityLabel={t('documents.chooseGallery')}
                                            accessibilityRole="button"
                                            onPress={pickImage}
                                        >
                                            <MaterialIcons name="photo-library" size={24} color="#a9c7ff" />
                                            <Text className="mt-2 text-xs font-bold uppercase text-primary tracking-widest">{t('documents.gallery')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        </View>

                        <TouchableOpacity
                            className="bg-primary rounded-xl py-4 items-center mb-8 shadow-lg"
                            accessibilityLabel={t('documents.saveA11y')}
                            accessibilityRole="button"
                            onPress={handleSaveDocument}
                            disabled={saving}
                            activeOpacity={0.85}
                        >
                            {saving ? (
                                <ActivityIndicator color="#081421" />
                            ) : (
                                <Text className="font-label text-base font-bold text-[#081421] uppercase tracking-wider">{t('documents.save')}</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </ProtectedModal>
        </AppScreen>
    );
}
