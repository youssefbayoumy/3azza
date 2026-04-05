import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Modal, TextInput, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { getDocuments, addDocument, deleteDocument } from '../services/database';
import type { DocumentItem } from '../types/database.types';

export default function DocumentsVaultScreen() {
    const [documents, setDocuments] = useState<DocumentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);

    // Form state
    const [title, setTitle] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const loadDocuments = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getDocuments();
            setDocuments(data);
        } catch (error) {
            console.error('Failed to load documents:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadDocuments();
        }, [loadDocuments])
    );

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Sorry, we need camera roll permissions to make this work!');
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

    const takePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Sorry, we need camera permissions to make this work!');
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
            Alert.alert('Missing Info', 'Please provide a title and select/take a photo.');
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
                expiry_date: expiryDate.trim() || 'N/A'
            });

            setModalVisible(false);
            setTitle('');
            setExpiryDate('');
            setImageUri(null);
            await loadDocuments();
        } catch (error) {
            console.error('Save error:', error);
            Alert.alert('Error', 'Failed to save document. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (doc: DocumentItem) => {
        Alert.alert('Delete Document', `Are you sure you want to delete "${doc.title}"?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', 
                style: 'destructive',
                onPress: async () => {
                    await deleteDocument(doc.id);
                    // Optionally delete file from system
                    try {
                        await FileSystem.deleteAsync(doc.image_uri, { idempotent: true });
                    } catch (e) {}
                    await loadDocuments();
                }
            }
        ]);
    };

    if (loading) {
        return (
            <View className="flex-1 bg-background items-center justify-center">
                <ActivityIndicator size="large" color="#a9c7ff" />
            </View>
        );
    }

    // Checking if a document is expiring soon (within 30 days) - simplified logic for demo
    const isExpiringSoon = (dateStr: string) => {
        if (!dateStr || dateStr === 'N/A') return false;
        const expiry = new Date(dateStr);
        if (isNaN(expiry.getTime())) return false; // Invalid date format
        const now = new Date();
        const diffTime = expiry.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 30 && diffDays > 0;
    };

    const isExpired = (dateStr: string) => {
        if (!dateStr || dateStr === 'N/A') return false;
        const expiry = new Date(dateStr);
        if (isNaN(expiry.getTime())) return false;
        return expiry.getTime() < new Date().getTime();
    };

    return (
        <View className="flex-1 bg-background pt-12">
            {/* TopAppBar */}
            <View className="flex-row items-center justify-between px-6 py-4 w-full border-b border-[#C0C0C0]/15 bg-[#0b1a2b]">
                <View className="flex-row items-center gap-3">
                    <Text className="text-xl font-bold text-[#C0C0C0] tracking-widest font-headline uppercase">DOCUMENTS_VAULT</Text>
                </View>
                <View className="w-8 h-8 rounded-full border border-outline-variant overflow-hidden bg-surface-container-highest">
                    <MaterialIcons name="person" size={20} color="#a9c7ff" style={{ alignSelf: 'center', marginTop: 4 }} />
                </View>
            </View>

            <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 150 }}>
                {/* Vault Header Info */}
                <View className="mb-10 flex-col md:flex-row md:items-end justify-between gap-6">
                    <View>
                        <Text className="font-label text-[10px] uppercase font-bold tracking-[0.2em] text-primary mb-2">SECURE ASSETS</Text>
                        <Text className="font-headline text-4xl font-bold text-on-surface">DIGITAL_VAULT</Text>
                    </View>
                    <View className="bg-surface-container-high/40 p-4 rounded-xl border border-outline-variant/10 flex-row items-center justify-center gap-6">
                        <View className="items-center">
                            <Text className="font-label text-[9px] text-secondary/60 uppercase">STORAGE</Text>
                            <Text className="font-headline text-xl font-bold text-primary">Secure</Text>
                        </View>
                        <View className="w-px h-8 bg-outline-variant/20" />
                        <View className="items-center">
                            <Text className="font-label text-[9px] text-secondary/60 uppercase">FILES</Text>
                            <Text className="font-headline text-xl font-bold text-on-surface">{documents.length}</Text>
                        </View>
                    </View>
                </View>

                {/* Bento Grid for Documents */}
                <View className="flex-row flex-wrap justify-between gap-y-6">
                    {documents.map((doc) => {
                        const expiring = isExpiringSoon(doc.expiry_date);
                        const expired = isExpired(doc.expiry_date);

                        return (
                            <TouchableOpacity
                                key={doc.id}
                                className="w-[47%] bg-[#1B2735] border border-secondary/30 rounded-xl p-4 flex-col gap-4 relative overflow-hidden"
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
                                        <Text className="font-label text-[8px] text-secondary/50 uppercase">Expires:</Text>
                                        <Text className={`font-label text-[10px] font-bold ${expired ? 'text-error' : expiring ? 'text-[#FFB100]' : 'text-secondary'}`}>
                                            {doc.expiry_date}
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

                    {/* Empty State / Add Placeholder inside Grid */}
                    <TouchableOpacity
                        className="w-[47%] border border-dashed border-outline-variant/30 rounded-xl p-4 flex-col items-center justify-center min-h-[160px] opacity-60 active:opacity-100"
                        onPress={() => setModalVisible(true)}
                    >
                        <MaterialIcons name="add-circle" size={32} color="#8e9196" className="mb-2" />
                        <Text className="font-label text-[9px] uppercase font-bold text-center tracking-widest text-outline">Add Vault Entry</Text>
                    </TouchableOpacity>
                </View>

                {/* System Stats Bar */}
                <View className="mt-12 p-4 rounded-xl bg-surface-container-low border border-outline-variant/10 flex-row gap-8 items-center">
                    <View className="flex-row items-center gap-3">
                        <View className="w-10 h-10 rounded-full bg-primary-container items-center justify-center">
                            <MaterialIcons name="verified-user" size={18} color="#a9c7ff" />
                        </View>
                        <View>
                            <Text className="font-label text-[9px] text-secondary/50 uppercase">Status</Text>
                            <Text className="font-headline text-sm font-bold uppercase text-on-surface">Encrypted</Text>
                        </View>
                    </View>
                </View>
            </ScrollView>

            {/* Floating Action Button */}
            <View className="absolute bottom-24 self-center items-center z-50">
                <TouchableOpacity 
                    className="w-16 h-16 rounded-full items-center justify-center shadow-lg border-2 border-surface-container-highest"
                    style={{ backgroundColor: '#8E8E8E' }}
                    onPress={() => setModalVisible(true)}
                    activeOpacity={0.8}
                >
                    <View className="w-14 h-14 rounded-full border border-black/20 items-center justify-center bg-transparent">
                        <MaterialIcons name="camera-alt" size={28} color="#2f3131" />
                    </View>
                </TouchableOpacity>
                <View className="mt-3 bg-background/80 px-3 py-1 rounded-full border border-secondary/10">
                    <Text className="font-label text-[9px] font-extrabold uppercase tracking-[0.2em] text-secondary">Scan Document</Text>
                </View>
            </View>

            {/* Add Document Modal */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-surface-container rounded-t-3xl p-6 border-t border-outline-variant/20 pt-8 shadow-2xl">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="font-headline text-xl font-bold text-on-surface">Scan & Store Item</Text>
                            <TouchableOpacity onPress={() => {
                                setModalVisible(false);
                                setImageUri(null);
                            }}>
                                <MaterialIcons name="close" size={24} color="#c4c6cc" />
                            </TouchableOpacity>
                        </View>

                        <View className="flex-col gap-5 mb-8">
                            <View>
                                <Text className="font-label text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">Document Title</Text>
                                <TextInput
                                    className="bg-surface-container-high rounded-xl px-4 py-3 text-on-surface font-body border border-outline-variant/20"
                                    placeholder="e.g. Vehicle Registration"
                                    placeholderTextColor="#64748b"
                                    value={title}
                                    onChangeText={setTitle}
                                />
                            </View>
                            
                            <View>
                                <Text className="font-label text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">Expiry Date (Optional)</Text>
                                <TextInput
                                    className="bg-surface-container-high rounded-xl px-4 py-3 text-on-surface font-body border border-outline-variant/20"
                                    placeholder="YYYY-MM-DD"
                                    placeholderTextColor="#64748b"
                                    value={expiryDate}
                                    onChangeText={setExpiryDate}
                                />
                            </View>

                            <View>
                                <Text className="font-label text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">Document Image</Text>
                                {imageUri ? (
                                    <View className="flex-row items-center gap-4">
                                        <Image source={{ uri: imageUri }} className="w-24 h-24 rounded-lg border border-outline-variant/30" />
                                        <TouchableOpacity onPress={() => setImageUri(null)} className="px-4 py-2 bg-surface-container-high rounded-lg">
                                            <Text className="text-secondary text-sm font-label font-bold">Remove</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View className="flex-row gap-4">
                                        <TouchableOpacity 
                                            className="flex-1 bg-surface-container-high rounded-xl py-4 flex-col items-center justify-center border border-outline-variant/20 border-dashed"
                                            onPress={takePhoto}
                                        >
                                            <MaterialIcons name="photo-camera" size={24} color="#a9c7ff" />
                                            <Text className="mt-2 text-[10px] font-bold uppercase text-primary tracking-widest">Camera</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity 
                                            className="flex-1 bg-surface-container-high rounded-xl py-4 flex-col items-center justify-center border border-outline-variant/20 border-dashed"
                                            onPress={pickImage}
                                        >
                                            <MaterialIcons name="photo-library" size={24} color="#a9c7ff" />
                                            <Text className="mt-2 text-[10px] font-bold uppercase text-primary tracking-widest">Gallery</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        </View>

                        <TouchableOpacity
                            className="bg-primary rounded-xl py-4 items-center mb-8 shadow-lg"
                            onPress={handleSaveDocument}
                            disabled={saving}
                            activeOpacity={0.85}
                        >
                            {saving ? (
                                <ActivityIndicator color="#081421" />
                            ) : (
                                <Text className="font-label text-base font-bold text-[#081421] uppercase tracking-wider">Encrypt & Store</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
