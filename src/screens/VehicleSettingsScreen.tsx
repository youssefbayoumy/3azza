import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, ActivityIndicator, Alert, Linking, TextInput } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import {
  createVehicleProfile,
  deleteVehicleProfile,
  getVehicleProfile,
  getVehicleProfiles,
  getVehicleVitals,
  renameVehicleProfile,
  saveVehicleProfile,
  saveVehicleScooterSelection,
  setActiveVehicleId,
} from '../services/database';
import {
  exportBackupJson,
  exportServiceLogsCsv,
  prepareBackupJsonFromUri,
  restorePreparedBackup,
} from '../services/export';
import { scheduleTestNotification, syncBackupReminder, syncMaintenanceNotifications, type NotificationSyncResult } from '../services/notifications';
import { useAppStore } from '../store/useAppStore';
import ProtectedModal from '../components/ProtectedModal';
import type { MainStackNavigationProp } from '../navigation/types';
import type { VehicleProfile, VehicleVitals } from '../types/database.types';
import { getExportCompletionMessage } from '../utils/exportFormat';
import { configureLayoutDirection, formatNumber, localizeErrorMessage, t as appT, useTranslation, vehicleDisplayName, type AppLocale } from '../i18n';
import { changePin, disablePin } from '../services/auth';
import { isValidPin, normalizePinInput } from '../utils/appLock';
import { validateTankCapacityLiters } from '../utils/fuel';
import AppIconButton from '../components/ui/AppIconButton';
import AppTopBar from '../components/ui/AppTopBar';
import AppScreen from '../components/ui/AppScreen';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';
import { parseDecimalNumberInput } from '../utils/recordValidation';
import ScooterSelectionFields from '../components/vehicle/ScooterSelectionFields';
import OnlineManualAction from '../components/vehicle/OnlineManualAction';
import {
  formatScooterSelection,
  isScooterSelectionComplete,
  resolveScooterSelection,
  selectionFromProfile,
} from '../catalog/scooterCatalog';
import {
  createGuidedSelectionDraft,
  type GuidedScooterSelectionDraft,
} from '../catalog/guidedScooterIdentification';
import { createVehicleCreationGuard, prepareVehicleCreation } from './vehicleCreation';

function showNotificationFailure(result: Pick<NotificationSyncResult, 'blocked' | 'failed' | 'unsupported'>): void {
  const title = result.unsupported
    ? appT('settings.unsupported')
    : result.failed
      ? appT('settings.remindersUnavailable')
      : appT('settings.notificationsBlocked');
  const message = result.unsupported
    ? appT('settings.platformUnsupported')
    : result.failed
      ? appT('settings.scheduleFailed')
      : result.blocked
        ? appT('settings.blockedBody')
        : appT('settings.permissionDenied');

  const buttons = result.blocked
    ? [
        { text: appT('common.cancel'), style: 'cancel' as const },
        { text: appT('settings.openSystemSettings'), onPress: () => Linking.openSettings().catch(() => undefined) },
      ]
    : [{ text: appT('language.ok') }];
  Alert.alert(title, message, buttons);
}

export default function VehicleSettingsScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const maintenanceReminders = useAppStore((s) => s.maintenanceReminders);
  const backupReminder = useAppStore((s) => s.backupReminder);
  const setMaintenanceReminders = useAppStore((s) => s.setMaintenanceReminders);
  const setBackupReminder = useAppStore((s) => s.setBackupReminder);
  const setVehicleSetupComplete = useAppStore((s) => s.setVehicleSetupComplete);
  const logout = useAppStore((s) => s.logout);
  const appLockEnabled = useAppStore((s) => s.appLockEnabled);
  const setAppLockEnabled = useAppStore((s) => s.setAppLockEnabled);
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const { isRTL, t, tp } = useTranslation();

  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [vehicles, setVehicles] = useState<VehicleProfile[]>([]);
  const [vitals, setVitals] = useState<VehicleVitals | null>(null);
  const [fileAction, setFileAction] = useState<'json' | 'csv' | 'restore' | null>(null);
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);
  const [vehicleName, setVehicleName] = useState('');
  const [vehicleMileage, setVehicleMileage] = useState('');
  const [vehiclePurchaseCondition, setVehiclePurchaseCondition] = useState<'new' | 'used' | null>(null);
  const [newVehicleSelection, setNewVehicleSelection] = useState<GuidedScooterSelectionDraft>(() => createGuidedSelectionDraft());
  const [showNewVehicleSelectionErrors, setShowNewVehicleSelectionErrors] = useState(false);
  const [creatingVehicle, setCreatingVehicle] = useState(false);
  const vehicleCreationGuard = useRef(createVehicleCreationGuard());
  const [scooterModalVisible, setScooterModalVisible] = useState(false);
  const [scooterSelection, setScooterSelection] = useState<GuidedScooterSelectionDraft>(() => createGuidedSelectionDraft());
  const [scooterTargetVehicleId, setScooterTargetVehicleId] = useState<number | null>(null);
  const [showScooterSelectionErrors, setShowScooterSelectionErrors] = useState(false);
  const [savingScooter, setSavingScooter] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleProfile | null>(null);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [changingPin, setChangingPin] = useState(false);
  const [disablePinModalVisible, setDisablePinModalVisible] = useState(false);
  const [disablePinInput, setDisablePinInput] = useState('');
  const [disablingPin, setDisablingPin] = useState(false);
  const [fuelCapacityModalVisible, setFuelCapacityModalVisible] = useState(false);
  const [tankCapacityInput, setTankCapacityInput] = useState('');
  const [savingTankCapacity, setSavingTankCapacity] = useState(false);

  const loadData = useCallback(async (isCurrent: () => boolean) => {
    const [profileData, profilesData, vitalsData] = await Promise.all([
      getVehicleProfile(),
      getVehicleProfiles(),
      getVehicleVitals(),
    ]);
    if (!isCurrent()) return;
    setProfile(profileData);
    setVehicles(profilesData);
    setVitals(vitalsData);
  }, []);

  const { error: loadError, loading, reload } = useFocusedLoader(
    loadData,
    t('settings.loadError'),
    t('settings.loadLog')
  );

  const refreshDataAndNotifications = useCallback(async () => {
    await reload();
    await syncMaintenanceNotifications(maintenanceReminders);
  }, [maintenanceReminders, reload]);

  const handleMaintenanceToggle = async (enabled: boolean) => {
    setMaintenanceReminders(enabled);
    const result = await syncMaintenanceNotifications(enabled);

    if (enabled && !result.granted) {
      setMaintenanceReminders(false);
      showNotificationFailure(result);
    }
  };

  const handleBackupReminderToggle = async (enabled: boolean) => {
    setBackupReminder(enabled);
    const result = await syncBackupReminder(enabled);

    if (enabled && !result.granted) {
      setBackupReminder(false);
      showNotificationFailure(result);
    }
  };

  const handleTestNotification = async () => {
    const result = await scheduleTestNotification();
    if (result.unsupported) {
      Alert.alert(t('settings.unsupported'), t('settings.localUnsupported'));
      return;
    }
    if (!result.granted) {
      showNotificationFailure(result);
      return;
    }
    Alert.alert(t('settings.testScheduled'), t('settings.testScheduledBody'));
  };

  const handleLocaleChange = async (nextLocale: AppLocale) => {
    if (nextLocale === locale) return;
    setLocale(nextLocale);
    const restartRequired = configureLayoutDirection(nextLocale);
    // Recreate pending notices in the language the user selected.
    await Promise.all([
      syncMaintenanceNotifications(maintenanceReminders),
      syncBackupReminder(backupReminder),
    ]);
    if (restartRequired) {
      Alert.alert(
        appT('settings.restartTitle'),
        appT('settings.restartBody')
      );
    }
  };

  const performExportBackup = async () => {
    setFileAction('json');
    try {
      const result = await exportBackupJson();
      Alert.alert(
        t('settings.backupCreated'),
        t('settings.backupCreatedBody', { message: getExportCompletionMessage(t('export.backupFormat'), result.uri, result.shareSheetOutcome), count: result.documentPhotoCount ?? 0 })
      );
    } catch (error) {
      Alert.alert(
        t('settings.exportFailed'),
        localizeErrorMessage(error, t('settings.backupCreateFailed'))
      );
    } finally {
      setFileAction(null);
    }
  };

  const handleExportBackup = () => {
    Alert.alert(
      t('settings.exportBackupTitle'),
      t('settings.exportBackupBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.export'), onPress: performExportBackup },
      ]
    );
  };

  const performExportCsv = async () => {
    setFileAction('csv');
    try {
      const result = await exportServiceLogsCsv();
      Alert.alert(
        t('settings.csvCreated'),
        getExportCompletionMessage(t('export.csvFormat'), result.uri, result.shareSheetOutcome)
      );
    } catch (error) {
      console.error('CSV export failed:', error);
      Alert.alert(t('settings.exportFailed'), t('settings.csvCreateFailed'));
    } finally {
      setFileAction(null);
    }
  };

  const handleExportCsv = () => {
    Alert.alert(
      t('settings.exportCsvTitle'),
      t('settings.exportCsvBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.export'), onPress: performExportCsv },
      ]
    );
  };

  const vehicleCreation = prepareVehicleCreation({
    name: vehicleName,
    mileage: vehicleMileage,
    purchaseCondition: vehiclePurchaseCondition,
    selection: newVehicleSelection.selection,
  }, {
    startingOdometer: t('settings.startingOdometer'),
  });

  const handleCreateVehicle = async () => {
    if (!vehicleCreation) {
      setShowNewVehicleSelectionErrors(!resolveScooterSelection(newVehicleSelection.selection) || !isScooterSelectionComplete(newVehicleSelection.selection));
      Alert.alert(t('settings.completeVehicle'), t('settings.completeVehicleBody'));
      return;
    }
    if (!vehicleCreationGuard.current.tryStart()) return;

    setCreatingVehicle(true);
    try {
      await createVehicleProfile(
        vehicleCreation.name,
        vehicleCreation.currentMileage,
        vehicleCreation.selection,
        vehicleCreation.purchaseCondition
      );
      setVehicleName('');
      setVehicleMileage('');
      setVehiclePurchaseCondition(null);
      setNewVehicleSelection(createGuidedSelectionDraft());
      setShowNewVehicleSelectionErrors(false);
      setVehicleModalVisible(false);
      await refreshDataAndNotifications();
    } catch (error) {
      console.error('Failed to create vehicle:', error);
      Alert.alert(t('settings.vehicleNotAdded'), localizeErrorMessage(error, t('settings.vehicleNotAddedBody')));
    } finally {
      vehicleCreationGuard.current.finish();
      setCreatingVehicle(false);
    }
  };

  const openScooterModal = () => {
    setScooterSelection(createGuidedSelectionDraft(profile ? selectionFromProfile(profile) ?? {} : {}));
    setScooterTargetVehicleId(profile?.id ?? null);
    setShowScooterSelectionErrors(false);
    setScooterModalVisible(true);
  };

  const closeScooterModal = () => {
    if (savingScooter) return;
    setScooterModalVisible(false);
    setScooterTargetVehicleId(null);
    setScooterSelection(createGuidedSelectionDraft());
    setShowScooterSelectionErrors(false);
  };

  const openVehicleModal = () => {
    setVehicleName('');
    setVehicleMileage('');
    setVehiclePurchaseCondition(null);
    setNewVehicleSelection(createGuidedSelectionDraft());
    setShowNewVehicleSelectionErrors(false);
    setVehicleModalVisible(true);
  };

  const closeVehicleModal = () => {
    if (vehicleCreationGuard.current.isCreating()) return;
    setVehicleModalVisible(false);
    setVehiclePurchaseCondition(null);
    setNewVehicleSelection(createGuidedSelectionDraft());
    setShowNewVehicleSelectionErrors(false);
  };

  const saveScooterSelection = () => {
    const resolved = resolveScooterSelection(scooterSelection.selection);
    if (!resolved || !isScooterSelectionComplete(scooterSelection.selection) || scooterTargetVehicleId === null) {
      setShowScooterSelectionErrors(true);
      Alert.alert(t('settings.selectScooter'), t('settings.selectScooterBody'));
      return;
    }

    Alert.alert(
      t('settings.changeScooterTitle'),
      resolved.selectionMode === 'custom_brand'
        ? t('settings.changeCustomVehicleBody', { vehicle: formatScooterSelection(resolved) })
        : t('settings.changeScooterBody', { scooter: formatScooterSelection(resolved) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.apply'),
          onPress: async () => {
            setSavingScooter(true);
            try {
              await saveVehicleScooterSelection(resolved, scooterTargetVehicleId);
              await refreshDataAndNotifications();
              setScooterModalVisible(false);
              setScooterTargetVehicleId(null);
              setScooterSelection(createGuidedSelectionDraft());
            } catch (error) {
              Alert.alert(t('settings.scooterNotChanged'), localizeErrorMessage(error, t('dashboard.tryAgain')));
            } finally {
              setSavingScooter(false);
            }
          },
        },
      ]
    );
  };

  const openEditVehicle = (vehicle: VehicleProfile) => {
    setEditingVehicle(vehicle);
    setVehicleName(vehicle.name);
  };

  const handleRenameVehicle = async () => {
    if (!editingVehicle) return;
    try {
      await renameVehicleProfile(editingVehicle.id, vehicleName);
      setEditingVehicle(null);
      setVehicleName('');
      await refreshDataAndNotifications();
    } catch (error) {
      Alert.alert(t('settings.vehicleNotRenamed'), localizeErrorMessage(error, t('dashboard.tryAgain')));
    }
  };

  const closePinModal = () => {
    if (changingPin) return;
    setPinModalVisible(false);
    setCurrentPin('');
    setNewPin('');
    setConfirmNewPin('');
  };

  const handleChangePin = async () => {
    if (!isValidPin(currentPin) || !isValidPin(newPin)) {
      Alert.alert(t('settings.invalidPin'), t('settings.pinFourDigits'));
      return;
    }
    if (newPin !== confirmNewPin) {
      Alert.alert(t('settings.pinMismatch'), t('settings.pinMismatchBody'));
      return;
    }
    if (newPin === currentPin) {
      Alert.alert(t('settings.chooseNewPin'), t('settings.chooseNewPinBody'));
      return;
    }

    setChangingPin(true);
    try {
      if (!(await changePin(currentPin, newPin))) {
        Alert.alert(t('settings.pinNotChanged'), t('settings.currentPinIncorrect'));
        return;
      }
      setPinModalVisible(false);
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
      logout();
      Alert.alert(t('settings.pinChanged'), t('settings.pinChangedBody'));
    } catch (error) {
      Alert.alert(t('settings.pinNotChanged'), localizeErrorMessage(error, t('dashboard.tryAgain')));
    } finally {
      setChangingPin(false);
    }
  };

  const closeDisablePinModal = () => {
    if (disablingPin) return;
    setDisablePinModalVisible(false);
    setDisablePinInput('');
  };

  const handleDisablePin = async () => {
    if (!isValidPin(disablePinInput)) {
      Alert.alert(t('settings.invalidPin'), t('settings.enterCurrentPin'));
      return;
    }

    setDisablingPin(true);
    try {
      if (!(await disablePin(disablePinInput))) {
        Alert.alert(t('settings.pinNotDisabled'), t('settings.currentPinIncorrect'));
        return;
      }
      setDisablePinModalVisible(false);
      setDisablePinInput('');
      setAppLockEnabled(false);
      Alert.alert(t('settings.pinDisabled'), t('settings.pinDisabledBody'));
    } catch (error) {
      Alert.alert(t('settings.pinNotDisabled'), localizeErrorMessage(error, t('dashboard.tryAgain')));
    } finally {
      setDisablingPin(false);
    }
  };

  const handleSwitchVehicle = async (vehicleId: number) => {
    if (vehicleId === profile?.id) return;

    try {
      await setActiveVehicleId(vehicleId);
      const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);
      if (selectedVehicle) setProfile(selectedVehicle);
      setVehicleSetupComplete(Boolean(selectedVehicle && selectionFromProfile(selectedVehicle)));
      await refreshDataAndNotifications();
    } catch (error) {
      console.error('Failed to switch active vehicle:', error);
      Alert.alert(t('settings.vehicleNotSwitched'), t('settings.vehicleNotSwitchedBody'));
    }
  };

  const handleDeleteVehicle = (vehicle: VehicleProfile) => {
    Alert.alert(
      t('settings.deleteVehicleTitle'),
      t('settings.deleteVehicleBody', { name: vehicleDisplayName(vehicle.name) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.deleteVehicle'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVehicleProfile(vehicle.id);
              await refreshDataAndNotifications();
            } catch (error) {
              Alert.alert(t('settings.vehicleNotDeleted'), localizeErrorMessage(error, t('dashboard.tryAgain')));
            }
          },
        },
      ]
    );
  };

  const openFuelCapacityModal = () => {
    setTankCapacityInput(profile?.tank_capacity_liters === null || profile?.tank_capacity_liters === undefined
      ? ''
      : String(profile.tank_capacity_liters));
    setFuelCapacityModalVisible(true);
  };

  const saveFuelCapacity = async () => {
    const trimmed = tankCapacityInput.trim();
    const capacityResult = trimmed === ''
      ? null
      : parseDecimalNumberInput(trimmed, { label: t('settings.tankCapacity') });
    if (capacityResult && !capacityResult.ok) {
      Alert.alert(t('settings.invalidCapacity'), capacityResult.message);
      return;
    }
    const capacity = capacityResult?.value ?? null;
    const validationMessage = validateTankCapacityLiters(capacity);
    if (validationMessage) {
      Alert.alert(t('settings.invalidCapacity'), validationMessage);
      return;
    }

    setSavingTankCapacity(true);
    try {
      await saveVehicleProfile({ tank_capacity_liters: capacity });
      await reload();
      setFuelCapacityModalVisible(false);
    } catch (error) {
      Alert.alert(t('settings.capacityNotSaved'), localizeErrorMessage(error, t('dashboard.tryAgain')));
    } finally {
      setSavingTankCapacity(false);
    }
  };

  const handleRestoreBackup = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets[0]) return;

    const asset = picked.assets[0];
    setFileAction('restore');
    let archive;
    try {
      archive = await prepareBackupJsonFromUri(asset.uri);
    } catch (error) {
      Alert.alert(
        t('settings.restoreFailed'),
        localizeErrorMessage(error, t('settings.invalidBackup'))
      );
      setFileAction(null);
      return;
    }
    setFileAction(null);

    const includesPhotos = archive.source_schema === '3azza-local-backup/v4'
      || archive.source_schema === '3azza-local-backup/v5'
      || archive.source_schema === '3azza-local-backup/v6';
    const photoDisclosure = includesPhotos
      ? tp('settings.photosIncluded', archive.document_files.length)
      : t('settings.olderBackupPhotos');
    Alert.alert(
      t('settings.restoreTitle'),
      t('settings.restoreBody', { photos: photoDisclosure }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.restore'),
          style: 'destructive',
          onPress: async () => {
            setFileAction('restore');
            try {
              const result = await restorePreparedBackup(archive);
              await refreshDataAndNotifications();
              const restoredProfile = await getVehicleProfile();
              Alert.alert(
                t('settings.backupRestored'),
                t('settings.backupRestoredBody', { count: result.documentPhotoCount })
              );
              setVehicleSetupComplete(Boolean(
                restoredProfile?.has_completed_setup === 1
                && selectionFromProfile(restoredProfile)
              ));
            } catch (error) {
              Alert.alert(
                t('settings.restoreFailed'),
                localizeErrorMessage(error, t('settings.restoreFailedBody'))
              );
            } finally {
              setFileAction(null);
            }
          },
        },
      ]
    );
  };

  if (loading || loadError) {
    return <ScreenLoadState error={loadError} loading={loading} onBack={() => navigation.goBack()} onRetry={reload} title={t('settings.title')} />;
  }

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppTopBar
        tone="elevated"
        leading={<AppIconButton accessibilityLabel={t('common.back')} icon={isRTL ? 'arrow-forward' : 'arrow-back'} onPress={() => navigation.goBack()} />}
        trailing={<AppIconButton accessibilityLabel={t('vitals.editReadings')} icon="monitor-heart" color="#C0C0C0" onPress={() => navigation.navigate('VehicleVitals')} />}
      >
        <Text className="font-headline tracking-tight font-bold uppercase text-[#a9c7ff]" numberOfLines={1}>{t('settings.title')}</Text>
      </AppTopBar>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 32 }}
      >
        <View className="relative overflow-hidden rounded-xl bg-surface-container-low p-6 mb-6">
          <View className="flex-col items-center gap-5">
            <View className="w-24 h-24 rounded-full border-2 border-[#C0C0C0]/30 bg-surface-container-highest items-center justify-center">
              <MaterialIcons name="two-wheeler" size={42} color="#a9c7ff" />
            </View>
            <View className="items-center">
              <Text className="font-headline text-2xl font-bold tracking-tight text-[#C0C0C0] text-center">{profile ? vehicleDisplayName(profile.name) : t('settings.defaultVehicle')}</Text>
              <Text className="font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant font-bold mt-1 text-center">
                {profile ? t('settings.profileStats', { km: formatNumber(profile.current_mileage, locale), daily: formatNumber(profile.daily_average_km || 0, locale) }) : t('settings.profilePending')}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-col gap-6">
          <View className="bg-surface-container-lowest p-6 rounded-xl border border-primary/20">
            <View className="flex-row items-center gap-3 mb-4">
              <View className="w-10 h-10 rounded-lg bg-surface-container-high items-center justify-center">
                <MaterialIcons name="language" size={20} color="#a9c7ff" />
              </View>
              <View className="flex-1">
                <Text className="font-headline text-lg font-bold text-on-surface">{t('language.title')}</Text>
                <Text className="font-body text-xs text-on-surface-variant mt-1">
                  {t('settings.languageBody')}
                </Text>
              </View>
            </View>
            <View className="flex-row gap-3">
              {(['en', 'ar-EG'] as AppLocale[]).map((option) => {
                const active = locale === option;
                return (
                  <TouchableOpacity
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={option === 'en' ? t('language.english') : t('language.egyptianArabic')}
                    className={`flex-1 rounded-lg border px-3 py-3 items-center ${active ? 'bg-primary/15 border-primary' : 'border-outline-variant/30 bg-surface-container-high'}`}
                    onPress={() => handleLocaleChange(option)}
                  >
                    <Text className={`font-label text-xs font-bold ${active ? 'text-primary' : 'text-on-surface-variant'}`}>
                      {option === 'en' ? t('language.english') : t('language.egyptianArabic')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View className="bg-surface-container-lowest p-6 rounded-xl border border-primary/20">
            <View className="flex-row items-start justify-between gap-4">
              <View className="flex-1">
                <Text className="font-label text-xs font-bold text-primary uppercase tracking-widest mb-2">{t('settings.scooterReference')}</Text>
                <Text className="font-headline text-lg font-bold text-on-surface">
                  {profile && selectionFromProfile(profile)
                    ? formatScooterSelection(selectionFromProfile(profile)!)
                    : t('settings.scooterNotSelected')}
                </Text>
                <Text className="font-body text-xs text-on-surface-variant mt-2 leading-5">
                  {t('settings.scooterReferenceBody')}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityLabel={t('settings.changeScooterA11y')}
                accessibilityRole="button"
                className="px-4 py-3 bg-primary rounded-lg"
                onPress={openScooterModal}
              >
                <Text className="font-label text-xs font-bold text-[#081421] uppercase tracking-widest">{t('settings.change')}</Text>
              </TouchableOpacity>
            </View>
            <OnlineManualAction selection={profile ? selectionFromProfile(profile) : null} />
          </View>

          <View className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/10">
            <View className="flex-row items-center justify-between mb-4">
              <View>
                <Text className="font-label text-xs font-bold text-primary uppercase tracking-widest mb-1">{t('settings.garage')}</Text>
                <Text className="font-headline text-lg font-bold text-secondary uppercase tracking-wider">{t('settings.vehicles')}</Text>
              </View>
              <TouchableOpacity
                className="px-3 py-2 bg-primary rounded-lg flex-row items-center gap-2"
                onPress={openVehicleModal}
              >
                <MaterialIcons name="add" size={16} color="#081421" />
                <Text className="font-label text-xs font-bold text-[#081421] uppercase tracking-widest">{t('settings.add')}</Text>
              </TouchableOpacity>
            </View>

            <View className="gap-3">
              {vehicles.map((vehicle) => {
                const active = vehicle.id === profile?.id;
                return (
                  <View
                    key={vehicle.id}
                    className={`p-4 rounded-xl border ${active ? 'bg-primary/10 border-primary/30' : 'bg-surface-container-high border-outline-variant/10'}`}
                  >
                    <TouchableOpacity onPress={() => handleSwitchVehicle(vehicle.id)} className="flex-row items-center justify-between">
                      <View className="flex-1 pr-3">
                        <Text className={`font-headline text-base font-bold ${active ? 'text-primary' : 'text-on-surface'}`}>{vehicleDisplayName(vehicle.name)}</Text>
                        <Text className="font-label text-xs uppercase tracking-widest text-secondary/60 mt-1">
                          {t('settings.profileStats', { km: formatNumber(vehicle.current_mileage, locale), daily: formatNumber(vehicle.daily_average_km || 0, locale) })}
                        </Text>
                        <Text className="font-body text-xs text-on-surface-variant mt-1" numberOfLines={1}>
                          {selectionFromProfile(vehicle)
                            ? formatScooterSelection(selectionFromProfile(vehicle)!)
                            : t('settings.scooterRequired')}
                        </Text>
                      </View>
                      <MaterialIcons name={active ? 'check-circle' : 'radio-button-unchecked'} size={22} color={active ? '#a9c7ff' : '#8e9196'} />
                    </TouchableOpacity>
                    {vehicles.length > 1 && (
                      <View className="flex-row self-end mt-3 gap-3">
                        <TouchableOpacity onPress={() => openEditVehicle(vehicle)} className="px-2 py-1" accessibilityRole="button" accessibilityLabel={t('settings.renameA11y', { name: vehicleDisplayName(vehicle.name) })}>
                          <Text className="font-label text-xs uppercase tracking-widest text-primary">{t('settings.rename')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteVehicle(vehicle)} className="px-2 py-1" accessibilityRole="button" accessibilityLabel={t('settings.deleteA11y', { name: vehicleDisplayName(vehicle.name) })}>
                          <Text className="font-label text-xs uppercase tracking-widest text-error">{t('common.delete')}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          <View className="bg-surface-container-high p-6 rounded-xl border border-outline-variant/10">
            <Text className="font-label text-xs font-bold text-primary uppercase tracking-widest mb-2">{t('settings.manualReadings')}</Text>
            <Text className="font-body text-xs text-on-surface-variant mb-5">{t('settings.manualReadingsBody')}</Text>
            <View className="gap-1">
              <View className="flex-row items-baseline justify-between gap-4 py-2 border-b border-outline-variant/10">
                <Text className="font-label text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1">{t('settings.oilLife')}</Text>
                <Text className="font-headline font-bold text-primary text-lg text-right">{vitals ? `${formatNumber(vitals.oil_life_pct, locale)}%` : t('settings.notSet')}</Text>
              </View>
              <View className="flex-row items-baseline justify-between gap-4 py-2 border-b border-outline-variant/10">
                <Text className="font-label text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1">{t('settings.tirePressure')}</Text>
                <Text className="font-headline font-bold text-primary text-lg text-right">{vitals ? `${formatNumber(vitals.tire_pressure_psi, locale)} PSI` : t('settings.notSet')}</Text>
              </View>
              <View className="flex-row items-baseline justify-between gap-4 py-2 border-b border-outline-variant/10">
                <Text className="font-label text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1">{t('settings.brakePads')}</Text>
                <Text className="font-headline font-bold text-secondary text-lg text-right">{vitals ? `${formatNumber(vitals.brake_pad_pct, locale)}%` : t('settings.notSet')}</Text>
              </View>
              <View className="flex-row items-baseline justify-between gap-4 py-2">
                <Text className="font-label text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1">{t('settings.battery')}</Text>
                <Text className="font-headline font-bold text-primary text-lg text-right">{vitals ? `${formatNumber(vitals.battery_health_pct, locale)}%` : t('settings.notSet')}</Text>
              </View>
            </View>
            <TouchableOpacity className="py-4 bg-secondary rounded-lg items-center justify-center mt-6" onPress={() => navigation.navigate('VehicleVitals')}>
              <Text className="font-headline font-bold text-[#2f3131] uppercase tracking-widest">{t('settings.updateReadings')}</Text>
            </TouchableOpacity>
          </View>

          <View className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/10">
            <View className="gap-4">
              <View className="flex-1">
                <Text className="font-label text-xs font-bold text-primary uppercase tracking-widest mb-1">{t('settings.fuelModel')}</Text>
                <Text className="font-headline text-lg font-bold text-secondary">{t('settings.tankCapacity')}</Text>
                <Text className="font-body text-xs text-on-surface-variant mt-2">
                  {profile?.tank_capacity_liters === null || profile?.tank_capacity_liters === undefined
                    ? t('settings.capacityUnset')
                    : t('settings.capacitySaved', { capacity: formatNumber(profile.tank_capacity_liters, locale) })}
                </Text>
              </View>
              <TouchableOpacity className="px-4 py-3 bg-primary rounded-lg self-start" onPress={openFuelCapacityModal}>
                <Text className="font-label text-xs font-bold text-[#081421] uppercase tracking-widest">
                  {profile?.tank_capacity_liters === null || profile?.tank_capacity_liters === undefined ? t('settings.set') : t('common.edit')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/10">
            <View className="flex-row items-center justify-between mb-5">
              <View className="flex-row items-center gap-3 flex-1 pr-4">
                <View className="w-10 h-10 rounded-lg bg-surface-container-high items-center justify-center">
                  <MaterialIcons name="notifications-active" size={20} color="#c6c6c6" />
                </View>
                <View className="flex-1">
                  <Text className="font-headline font-bold text-secondary tracking-wide">{t('settings.maintenanceReminders')}</Text>
                  <Text className="font-body text-xs text-on-surface-variant mt-1">{t('settings.remindersBody')}</Text>
                </View>
              </View>
              <Switch
                accessibilityLabel={t('settings.maintenanceReminders')}
                accessibilityRole="switch"
                value={maintenanceReminders}
                onValueChange={handleMaintenanceToggle}
                trackColor={{ false: '#1f2b39', true: 'rgba(169, 199, 255, 0.2)' }}
                thumbColor={maintenanceReminders ? '#c6c6c6' : '#8e9196'}
              />
            </View>
            <TouchableOpacity
              accessibilityLabel={t('settings.sendTest')}
              accessibilityRole="button"
              className="py-3 border border-primary/25 rounded-lg items-center justify-center"
              onPress={handleTestNotification}
            >
              <Text className="font-label text-xs font-bold text-primary uppercase tracking-widest">{t('settings.sendTest')}</Text>
            </TouchableOpacity>
          </View>

          <View className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/10">
            <View className="flex-row items-center justify-between mb-5">
              <View className="flex-row items-center gap-3 flex-1 pr-4">
                <View className="w-10 h-10 rounded-lg bg-surface-container-high items-center justify-center">
                  <MaterialIcons name="archive" size={20} color="#c6c6c6" />
                </View>
                <View className="flex-1">
                  <Text className="font-headline font-bold text-secondary tracking-wide uppercase">{t('settings.localBackup')}</Text>
                  <Text className="font-body text-xs text-on-surface-variant mt-1">{t('settings.backupBody')}</Text>
                </View>
              </View>
              <Switch
                accessibilityLabel={t('settings.weeklyBackup')}
                accessibilityRole="switch"
                value={backupReminder}
                onValueChange={handleBackupReminderToggle}
                trackColor={{ false: '#1f2b39', true: 'rgba(169, 199, 255, 0.2)' }}
                thumbColor={backupReminder ? '#c6c6c6' : '#8e9196'}
              />
            </View>

            <View className="gap-3">
              <TouchableOpacity
                className="py-4 bg-primary rounded-lg items-center justify-center"
                onPress={handleExportBackup}
                disabled={fileAction !== null}
              >
                {fileAction === 'json' ? (
                  <ActivityIndicator color="#081421" />
                ) : (
                  <Text className="font-label text-xs font-bold text-[#081421] uppercase tracking-widest">{t('settings.exportJson')}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                className="py-4 border border-primary/30 rounded-lg items-center justify-center"
                onPress={handleExportCsv}
                disabled={fileAction !== null}
              >
                {fileAction === 'csv' ? (
                  <ActivityIndicator color="#a9c7ff" />
                ) : (
                  <Text className="font-label text-xs font-bold text-primary uppercase tracking-widest">{t('settings.serviceCsv')}</Text>
                )}
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              className="py-4 border border-error/30 rounded-lg items-center justify-center mt-3"
              onPress={handleRestoreBackup}
              disabled={fileAction !== null}
            >
              {fileAction === 'restore' ? (
                <ActivityIndicator color="#ffb4ab" />
              ) : (
                <Text className="font-label text-xs font-bold text-error uppercase tracking-widest">{t('settings.restoreJson')}</Text>
              )}
            </TouchableOpacity>
          </View>

          {appLockEnabled ? (
            <>
              <TouchableOpacity
                className="py-4 border border-primary/30 rounded-lg items-center justify-center mb-3"
                onPress={() => setPinModalVisible(true)}
              >
                <Text className="font-headline font-bold text-primary uppercase tracking-widest">{t('settings.changePin')}</Text>
              </TouchableOpacity>
              <TouchableOpacity className="py-4 border border-error/30 rounded-lg items-center justify-center" onPress={logout}>
                <Text className="font-headline font-bold text-error uppercase tracking-widest">{t('settings.lockApp')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="py-4 border border-error/30 rounded-lg items-center justify-center mt-3"
                onPress={() => setDisablePinModalVisible(true)}
              >
                <Text className="font-headline font-bold text-error uppercase tracking-widest">{t('settings.disablePin')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              className="py-4 border border-primary/30 rounded-lg items-center justify-center"
              onPress={() => {
                setAppLockEnabled(true);
                logout();
              }}
            >
              <Text className="font-headline font-bold text-primary uppercase tracking-widest">{t('settings.enablePin')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <ProtectedModal
        accessibilityLabel={t('settings.addVehicleDialog')}
        visible={vehicleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeVehicleModal}
      >
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="w-full max-w-xl self-center bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
            <Text className="font-headline text-xl font-bold text-on-surface mb-2">{t('settings.addVehicle')}</Text>
            <Text className="font-body text-sm text-secondary/80 mb-6">{t('settings.addVehicleBody')}</Text>
            <ScrollView className="max-h-[520px]" keyboardShouldPersistTaps="handled">
            <View pointerEvents={creatingVehicle ? 'none' : 'auto'}>
              <ScooterSelectionFields
                value={newVehicleSelection}
                onChange={(next) => {
                  setNewVehicleSelection(next);
                  setShowNewVehicleSelectionErrors(false);
                }}
                showErrors={showNewVehicleSelectionErrors}
              />
            </View>
            <View className="h-5" />
            <TextInput
              className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base mb-4"
              placeholder={t('settings.vehicleExample')}
              placeholderTextColor="#64748b"
              value={vehicleName}
              onChangeText={setVehicleName}
              editable={!creatingVehicle}
            />
            <TextInput className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base mb-4" placeholder={t('settings.startingOdometerPlaceholder')} placeholderTextColor="#64748b" keyboardType="numeric" value={vehicleMileage} onChangeText={setVehicleMileage} editable={!creatingVehicle} />
            <Text className="font-label text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">{t('setup.purchaseCondition')}</Text>
            <View className="gap-2 mb-6">
              {(['new', 'used'] as const).map((condition) => {
                const selected = vehiclePurchaseCondition === condition;
                return (
                  <TouchableOpacity
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    className={`min-h-12 rounded-xl border px-4 flex-row items-center gap-3 ${selected ? 'border-primary bg-primary/10' : 'border-outline-variant/20 bg-surface-container-highest'}`}
                    disabled={creatingVehicle}
                    key={condition}
                    onPress={() => setVehiclePurchaseCondition(condition)}
                  >
                    <MaterialIcons color={selected ? '#a9c7ff' : '#8e9196'} name={selected ? 'radio-button-checked' : 'radio-button-unchecked'} size={20} />
                    <Text className="font-body text-sm text-on-surface">{t(condition === 'new' ? 'setup.boughtNew' : 'setup.boughtUsed')}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            </ScrollView>
            <View className="flex-row justify-end gap-3">
              <TouchableOpacity onPress={closeVehicleModal} disabled={creatingVehicle} className={`px-4 py-2 rounded-lg ${creatingVehicle ? 'opacity-60' : ''}`} accessibilityState={{ disabled: creatingVehicle }}>
                <Text className="font-label font-bold text-secondary uppercase tracking-wider">{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleCreateVehicle()}
                disabled={creatingVehicle || vehicleCreation === null}
                className={`px-6 py-2 bg-primary rounded-lg min-w-24 items-center ${creatingVehicle || vehicleCreation === null ? 'opacity-60' : ''}`}
                accessibilityState={{ busy: creatingVehicle, disabled: creatingVehicle || vehicleCreation === null }}
              >
                {creatingVehicle ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" color="#081421" />
                    <Text className="font-label font-bold text-on-primary uppercase tracking-wider">{t('settings.creating')}</Text>
                  </View>
                ) : (
                  <Text className="font-label font-bold text-on-primary uppercase tracking-wider">{t('settings.create')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ProtectedModal>

      <ProtectedModal accessibilityLabel={t('settings.renameDialog')} visible={editingVehicle !== null} transparent animationType="fade" onRequestClose={() => setEditingVehicle(null)}>
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="w-full max-w-xl self-center bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
            <Text className="font-headline text-xl font-bold text-on-surface mb-2">{t('settings.renameVehicle')}</Text>
            <TextInput className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base mb-6" value={vehicleName} onChangeText={setVehicleName} accessibilityLabel={t('settings.vehicleName')} />
            <View className="flex-row justify-end gap-3">
              <TouchableOpacity onPress={() => setEditingVehicle(null)} className="px-4 py-2 rounded-lg"><Text className="font-label font-bold text-secondary uppercase tracking-wider">{t('common.cancel')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleRenameVehicle} className="px-6 py-2 bg-primary rounded-lg"><Text className="font-label font-bold text-on-primary uppercase tracking-wider">{t('common.save')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </ProtectedModal>

      <ProtectedModal
        accessibilityLabel={t('settings.changeScooterDialog')}
        visible={scooterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeScooterModal}
      >
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="w-full max-w-xl self-center bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
            <Text className="font-headline text-xl font-bold text-on-surface mb-2">{t('settings.changeScooter')}</Text>
            <Text className="font-body text-sm text-secondary/80 mb-6">
              {t('settings.changeScooterDescription')}
            </Text>
            <ScrollView className="max-h-[520px]" keyboardShouldPersistTaps="handled">
              <ScooterSelectionFields
                value={scooterSelection}
                onChange={(next) => {
                  setScooterSelection(next);
                  setShowScooterSelectionErrors(false);
                }}
                showErrors={showScooterSelectionErrors}
              />
            </ScrollView>
            <View className="flex-row justify-end gap-3 mt-6">
              <TouchableOpacity disabled={savingScooter} onPress={closeScooterModal} className="px-4 py-3 rounded-lg">
                <Text className="font-label font-bold text-secondary uppercase tracking-wider">{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={savingScooter} onPress={saveScooterSelection} className={`px-6 py-3 bg-primary rounded-lg ${savingScooter ? 'opacity-60' : ''}`}>
                {savingScooter ? <ActivityIndicator color="#081421" /> : (
                  <Text className="font-label font-bold text-on-primary uppercase tracking-wider">{t('common.save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ProtectedModal>

      <ProtectedModal accessibilityLabel={t('settings.changePinDialog')} visible={pinModalVisible} transparent animationType="fade" onRequestClose={closePinModal}>
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="w-full max-w-xl self-center bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
            <Text className="font-headline text-xl font-bold text-on-surface mb-2">{t('settings.changePin')}</Text>
            <Text className="font-body text-sm text-secondary/80 mb-6">{t('settings.changePinBody')}</Text>
            {[
              { label: t('settings.currentPin'), value: currentPin, setter: setCurrentPin },
              { label: t('settings.newPin'), value: newPin, setter: setNewPin },
              { label: t('settings.confirmNewPin'), value: confirmNewPin, setter: setConfirmNewPin },
            ].map((field) => (
              <View key={field.label} className="mb-4">
                <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/70 tracking-widest mb-2">{field.label}</Text>
                <TextInput
                  className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base"
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={4}
                  value={field.value}
                  onChangeText={(value) => field.setter(normalizePinInput(value))}
                  accessibilityLabel={field.label}
                />
              </View>
            ))}
            <View className="flex-row justify-end gap-3 mt-2">
              <TouchableOpacity onPress={closePinModal} disabled={changingPin} className="px-4 py-3 rounded-lg">
                <Text className="font-label font-bold text-secondary uppercase tracking-wider">{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleChangePin}
                disabled={changingPin}
                className={`px-6 py-3 bg-primary rounded-lg ${changingPin ? 'opacity-60' : ''}`}
              >
                {changingPin ? (
                  <ActivityIndicator color="#081421" />
                ) : (
                  <Text className="font-label font-bold text-on-primary uppercase tracking-wider">{t('settings.changePin')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ProtectedModal>

      <ProtectedModal accessibilityLabel={t('settings.disablePinDialog')} visible={disablePinModalVisible} transparent animationType="fade" onRequestClose={closeDisablePinModal}>
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="w-full max-w-xl self-center bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
            <Text className="font-headline text-xl font-bold text-on-surface mb-2">{t('settings.disablePin')}</Text>
            <Text className="font-body text-sm text-secondary/80 mb-6">{t('settings.disablePinBody')}</Text>
            <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/70 tracking-widest mb-2">{t('settings.currentPin')}</Text>
            <TextInput
              className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              value={disablePinInput}
              onChangeText={(value) => setDisablePinInput(normalizePinInput(value))}
              accessibilityLabel={t('settings.disablePinA11y')}
            />
            <View className="flex-row justify-end gap-3 mt-6">
              <TouchableOpacity onPress={closeDisablePinModal} disabled={disablingPin} className="px-4 py-3 rounded-lg">
                <Text className="font-label font-bold text-secondary uppercase tracking-wider">{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDisablePin}
                disabled={disablingPin}
                className={`px-6 py-3 bg-error rounded-lg ${disablingPin ? 'opacity-60' : ''}`}
              >
                {disablingPin ? <ActivityIndicator color="#081421" /> : (
                  <Text className="font-label font-bold text-[#081421] uppercase tracking-wider">{t('settings.disablePin')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ProtectedModal>

      <ProtectedModal
        accessibilityLabel={t('settings.capacityDialog')}
        visible={fuelCapacityModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !savingTankCapacity && setFuelCapacityModalVisible(false)}
      >
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="w-full max-w-xl self-center bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
            <Text className="font-headline text-xl font-bold text-on-surface mb-2">{t('settings.tankCapacity')}</Text>
            <Text className="font-body text-sm text-secondary/80 mb-6">
              {t('settings.capacityBody')}
            </Text>
            <TextInput
              className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base mb-6"
              placeholder={t('settings.capacityExample')}
              placeholderTextColor="#64748b"
              keyboardType="decimal-pad"
              value={tankCapacityInput}
              onChangeText={setTankCapacityInput}
              accessibilityLabel={t('settings.capacityA11y')}
            />
            <View className="flex-row justify-end gap-3">
              <TouchableOpacity
                onPress={() => setFuelCapacityModalVisible(false)}
                disabled={savingTankCapacity}
                className="px-4 py-3 rounded-lg"
              >
                <Text className="font-label font-bold text-secondary uppercase tracking-wider">{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveFuelCapacity}
                disabled={savingTankCapacity}
                className={`px-6 py-3 bg-primary rounded-lg ${savingTankCapacity ? 'opacity-60' : ''}`}
              >
                {savingTankCapacity ? <ActivityIndicator color="#081421" /> : (
                  <Text className="font-label font-bold text-on-primary uppercase tracking-wider">{t('common.save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ProtectedModal>
    </AppScreen>
  );
}
