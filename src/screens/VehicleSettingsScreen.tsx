import React, { useCallback, useState } from 'react';
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
import { changePin, disablePin } from '../services/auth';
import { isValidPin, normalizePinInput } from '../utils/appLock';
import { validateTankCapacityLiters } from '../utils/fuel';
import AppIconButton from '../components/ui/AppIconButton';
import AppTopBar from '../components/ui/AppTopBar';
import AppScreen from '../components/ui/AppScreen';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';
import { parseDecimalNumberInput, parseWholeNumberInput } from '../utils/recordValidation';
import ScooterSelectionFields from '../components/ScooterSelectionFields';
import OnlineManualAction from '../components/OnlineManualAction';
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

function showNotificationFailure(result: Pick<NotificationSyncResult, 'blocked' | 'failed' | 'unsupported'>): void {
  const title = result.unsupported
    ? 'Unsupported'
    : result.failed
      ? 'Reminders unavailable'
      : 'Notifications blocked';
  const message = result.unsupported
    ? 'Reminders are not available on this platform.'
    : result.failed
      ? '3azza could not safely schedule the reminder. Try again.'
      : result.blocked
        ? 'Notifications are blocked for 3azza. Open Android settings to allow them.'
        : 'Notification permission was not granted. You can enable it later in Android settings.';

  const buttons = result.blocked
    ? [
        { text: 'Cancel', style: 'cancel' as const },
        { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => undefined) },
      ]
    : [{ text: 'OK' }];
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

  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [vehicles, setVehicles] = useState<VehicleProfile[]>([]);
  const [vitals, setVitals] = useState<VehicleVitals | null>(null);
  const [fileAction, setFileAction] = useState<'json' | 'csv' | 'restore' | null>(null);
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);
  const [vehicleName, setVehicleName] = useState('');
  const [vehicleMileage, setVehicleMileage] = useState('');
  const [vehicleDailyAverage, setVehicleDailyAverage] = useState('');
  const [newVehicleSelection, setNewVehicleSelection] = useState<GuidedScooterSelectionDraft>(() => createGuidedSelectionDraft());
  const [showNewVehicleSelectionErrors, setShowNewVehicleSelectionErrors] = useState(false);
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
    'Vehicle settings could not be loaded. Your saved preferences were not changed.',
    'Failed to load vehicle settings:'
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
      Alert.alert('Unsupported', 'Local notifications are not available on this platform.');
      return;
    }
    if (!result.granted) {
      showNotificationFailure(result);
      return;
    }
    Alert.alert('Test scheduled', 'A local notification should appear in a few seconds.');
  };

  const performExportBackup = async () => {
    setFileAction('json');
    try {
      const result = await exportBackupJson();
      Alert.alert(
        'Backup created',
        `${getExportCompletionMessage('unencrypted self-contained backup', result.uri, result.shareSheetOutcome)}\n\nIncluded document photos: ${result.documentPhotoCount ?? 0}.`
      );
    } catch (error) {
      Alert.alert(
        'Export failed',
        error instanceof Error ? error.message : 'Could not create the backup file.'
      );
    } finally {
      setFileAction(null);
    }
  };

  const handleExportBackup = () => {
    Alert.alert(
      'Export unencrypted backup?',
      'This self-contained JSON includes local records and document photos. It excludes app preferences and the app-lock PIN. Anyone with the file can read its contents.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Export', onPress: performExportBackup },
      ]
    );
  };

  const performExportCsv = async () => {
    setFileAction('csv');
    try {
      const result = await exportServiceLogsCsv();
      Alert.alert(
        'CSV created',
        getExportCompletionMessage('unencrypted service-history CSV', result.uri, result.shareSheetOutcome)
      );
    } catch (error) {
      console.error('CSV export failed:', error);
      Alert.alert('Export failed', 'Could not create the service history CSV.');
    } finally {
      setFileAction(null);
    }
  };

  const handleExportCsv = () => {
    Alert.alert(
      'Export unencrypted CSV?',
      'The service-history file can be read by anyone or any app you share it with.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Export', onPress: performExportCsv },
      ]
    );
  };

  const handleCreateVehicle = async () => {
    const name = vehicleName.trim();
    const mileageResult = parseWholeNumberInput(vehicleMileage, { label: 'Starting odometer' });
    const dailyAverageResult = parseWholeNumberInput(vehicleDailyAverage, { label: 'Daily average' });
    const resolvedSelection = resolveScooterSelection(newVehicleSelection.selection);
    if (!name || !mileageResult.ok || !dailyAverageResult.ok || !resolvedSelection || !isScooterSelectionComplete(newVehicleSelection.selection)) {
      setShowNewVehicleSelectionErrors(!resolvedSelection || !isScooterSelectionComplete(newVehicleSelection.selection));
      Alert.alert('Complete vehicle details', 'Select a brand, model, manual version, and any required exact variant, then enter a name, starting odometer, and daily average.');
      return;
    }
    const mileage = mileageResult.value;
    const dailyAverage = dailyAverageResult.value;

    try {
      await createVehicleProfile(name, mileage, dailyAverage, resolvedSelection);
      setVehicleName('');
      setVehicleMileage('');
      setVehicleDailyAverage('');
      setNewVehicleSelection(createGuidedSelectionDraft());
      setShowNewVehicleSelectionErrors(false);
      setVehicleModalVisible(false);
      await refreshDataAndNotifications();
    } catch (error) {
      console.error('Failed to create vehicle:', error);
      Alert.alert('Vehicle not added', error instanceof Error ? error.message : 'No vehicle was added. Try again.');
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
    setVehicleDailyAverage('');
    setNewVehicleSelection(createGuidedSelectionDraft());
    setShowNewVehicleSelectionErrors(false);
    setVehicleModalVisible(true);
  };

  const closeVehicleModal = () => {
    setVehicleModalVisible(false);
    setNewVehicleSelection(createGuidedSelectionDraft());
    setShowNewVehicleSelectionErrors(false);
  };

  const saveScooterSelection = () => {
    const resolved = resolveScooterSelection(scooterSelection.selection);
    if (!resolved || !isScooterSelectionComplete(scooterSelection.selection) || scooterTargetVehicleId === null) {
      setShowScooterSelectionErrors(true);
      Alert.alert('Select your scooter', 'Choose a brand, model, manual version, and any required exact variant before saving.');
      return;
    }

    Alert.alert(
      'Change scooter reference?',
      `Use ${formatScooterSelection(resolved)} as the source for this vehicle? The starting maintenance plan will be reapplied, including oil replacement every 1,000 km. Service history is preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply',
          onPress: async () => {
            setSavingScooter(true);
            try {
              await saveVehicleScooterSelection(resolved, scooterTargetVehicleId);
              await refreshDataAndNotifications();
              setScooterModalVisible(false);
              setScooterTargetVehicleId(null);
              setScooterSelection(createGuidedSelectionDraft());
            } catch (error) {
              Alert.alert('Scooter not changed', error instanceof Error ? error.message : 'Try again.');
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
      Alert.alert('Vehicle not renamed', error instanceof Error ? error.message : 'Try again.');
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
      Alert.alert('Invalid PIN', 'Current and new PINs must each contain exactly four digits.');
      return;
    }
    if (newPin !== confirmNewPin) {
      Alert.alert('PIN mismatch', 'The new PIN entries do not match.');
      return;
    }
    if (newPin === currentPin) {
      Alert.alert('Choose a new PIN', 'The new PIN must be different from the current PIN.');
      return;
    }

    setChangingPin(true);
    try {
      if (!(await changePin(currentPin, newPin))) {
        Alert.alert('PIN not changed', 'The current PIN is incorrect.');
        return;
      }
      setPinModalVisible(false);
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
      logout();
      Alert.alert('PIN changed', 'The app is locked. Unlock it with your new PIN.');
    } catch (error) {
      Alert.alert('PIN not changed', error instanceof Error ? error.message : 'Try again.');
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
      Alert.alert('Invalid PIN', 'Enter your current 4-digit PIN.');
      return;
    }

    setDisablingPin(true);
    try {
      if (!(await disablePin(disablePinInput))) {
        Alert.alert('PIN not disabled', 'The current PIN is incorrect.');
        return;
      }
      setDisablePinModalVisible(false);
      setDisablePinInput('');
      setAppLockEnabled(false);
      Alert.alert('App PIN disabled', '3azza will no longer require a PIN to open. You can enable one again in Settings.');
    } catch (error) {
      Alert.alert('PIN not disabled', error instanceof Error ? error.message : 'Try again.');
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
      Alert.alert('Vehicle not switched', 'The previous active vehicle is still selected. Try again.');
    }
  };

  const handleDeleteVehicle = (vehicle: VehicleProfile) => {
    Alert.alert(
      'Delete vehicle?',
      `Delete ${vehicle.name} and all of its local maintenance, fuel, inventory, document, and pre-ride records? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete vehicle',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVehicleProfile(vehicle.id);
              await refreshDataAndNotifications();
            } catch (error) {
              Alert.alert('Vehicle not deleted', error instanceof Error ? error.message : 'Try again.');
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
      : parseDecimalNumberInput(trimmed, { label: 'Tank capacity' });
    if (capacityResult && !capacityResult.ok) {
      Alert.alert('Invalid tank capacity', capacityResult.message);
      return;
    }
    const capacity = capacityResult?.value ?? null;
    const validationMessage = validateTankCapacityLiters(capacity);
    if (validationMessage) {
      Alert.alert('Invalid tank capacity', validationMessage);
      return;
    }

    setSavingTankCapacity(true);
    try {
      await saveVehicleProfile({ tank_capacity_liters: capacity });
      await reload();
      setFuelCapacityModalVisible(false);
    } catch (error) {
      Alert.alert('Tank capacity not saved', error instanceof Error ? error.message : 'Try again.');
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
        'Restore failed',
        error instanceof Error ? error.message : 'The selected file is not a valid 3azza backup.'
      );
      setFileAction(null);
      return;
    }
    setFileAction(null);

    const includesPhotos = archive.source_schema === '3azza-local-backup/v4';
    const photoDisclosure = includesPhotos
      ? `It includes ${archive.document_files.length} document photo${archive.document_files.length === 1 ? '' : 's'}, which will be copied into this app.`
      : 'This older backup does not contain document photo files; restored document records may still point to photos that are no longer on this device.';
    Alert.alert(
      'Restore backup?',
      `This replaces local vehicle, service, fuel, inventory, document, and pre-ride data. ${photoDisclosure} App preferences and the app-lock PIN are not changed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setFileAction('restore');
            try {
              const result = await restorePreparedBackup(archive);
              await refreshDataAndNotifications();
              const restoredProfile = await getVehicleProfile();
              Alert.alert(
                'Backup restored',
                `Local data was replaced from the selected backup. Restored document photos: ${result.documentPhotoCount}.`
              );
              setVehicleSetupComplete(Boolean(
                restoredProfile?.has_completed_setup === 1
                && selectionFromProfile(restoredProfile)
              ));
            } catch (error) {
              Alert.alert(
                'Restore failed',
                error instanceof Error ? error.message : 'The selected backup could not be restored.'
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
    return <ScreenLoadState error={loadError} loading={loading} onBack={() => navigation.goBack()} onRetry={reload} title="VEHICLE SETTINGS" />;
  }

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppTopBar
        tone="elevated"
        leading={<AppIconButton accessibilityLabel="Go back" icon="arrow-back" onPress={() => navigation.goBack()} />}
        trailing={<AppIconButton accessibilityLabel="Open manual readings" icon="monitor-heart" color="#C0C0C0" onPress={() => navigation.navigate('VehicleVitals')} />}
      >
        <Text className="font-headline tracking-tight font-bold uppercase text-[#a9c7ff]" numberOfLines={1}>VEHICLE SETTINGS</Text>
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
              <Text className="font-headline text-2xl font-bold tracking-tight text-[#C0C0C0] text-center">{profile?.name ?? '3azza Vehicle'}</Text>
              <Text className="font-label text-xs uppercase tracking-[0.2em] text-on-surface-variant font-bold mt-1 text-center">
                {profile ? `${profile.current_mileage.toLocaleString()} KM - ${profile.daily_average_km || 0} KM/day` : 'Profile pending'}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-col gap-6">
          <View className="bg-surface-container-lowest p-6 rounded-xl border border-primary/20">
            <View className="flex-row items-start justify-between gap-4">
              <View className="flex-1">
                <Text className="font-label text-xs font-bold text-primary uppercase tracking-widest mb-2">Scooter Reference</Text>
                <Text className="font-headline text-lg font-bold text-on-surface">
                  {profile && selectionFromProfile(profile)
                    ? formatScooterSelection(selectionFromProfile(profile)!)
                    : 'Scooter not selected'}
                </Text>
                <Text className="font-body text-xs text-on-surface-variant mt-2 leading-5">
                  Maintenance, manuals, parts, and future model-specific features use this selection.
                </Text>
              </View>
              <TouchableOpacity
                accessibilityLabel="Change scooter brand, model, and version"
                accessibilityRole="button"
                className="px-4 py-3 bg-primary rounded-lg"
                onPress={openScooterModal}
              >
                <Text className="font-label text-xs font-bold text-[#081421] uppercase tracking-widest">Change</Text>
              </TouchableOpacity>
            </View>
            <OnlineManualAction selection={profile ? selectionFromProfile(profile) : null} />
          </View>

          <View className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/10">
            <View className="flex-row items-center justify-between mb-4">
              <View>
                <Text className="font-label text-xs font-bold text-primary uppercase tracking-widest mb-1">Garage</Text>
                <Text className="font-headline text-lg font-bold text-secondary uppercase tracking-wider">Vehicles</Text>
              </View>
              <TouchableOpacity
                className="px-3 py-2 bg-primary rounded-lg flex-row items-center gap-2"
                onPress={openVehicleModal}
              >
                <MaterialIcons name="add" size={16} color="#081421" />
                <Text className="font-label text-xs font-bold text-[#081421] uppercase tracking-widest">Add</Text>
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
                        <Text className={`font-headline text-base font-bold ${active ? 'text-primary' : 'text-on-surface'}`}>{vehicle.name}</Text>
                        <Text className="font-label text-xs uppercase tracking-widest text-secondary/60 mt-1">
                          {vehicle.current_mileage.toLocaleString()} KM - {vehicle.daily_average_km || 0} KM/day
                        </Text>
                        <Text className="font-body text-xs text-on-surface-variant mt-1" numberOfLines={1}>
                          {selectionFromProfile(vehicle)
                            ? formatScooterSelection(selectionFromProfile(vehicle)!)
                            : 'Scooter selection required'}
                        </Text>
                      </View>
                      <MaterialIcons name={active ? 'check-circle' : 'radio-button-unchecked'} size={22} color={active ? '#a9c7ff' : '#8e9196'} />
                    </TouchableOpacity>
                    {vehicles.length > 1 && (
                      <View className="flex-row self-end mt-3 gap-3">
                        <TouchableOpacity onPress={() => openEditVehicle(vehicle)} className="px-2 py-1" accessibilityRole="button" accessibilityLabel={`Rename ${vehicle.name}`}>
                          <Text className="font-label text-xs uppercase tracking-widest text-primary">Rename</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteVehicle(vehicle)} className="px-2 py-1" accessibilityRole="button" accessibilityLabel={`Delete ${vehicle.name}`}>
                          <Text className="font-label text-xs uppercase tracking-widest text-error">Delete</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          <View className="bg-surface-container-high p-6 rounded-xl border border-outline-variant/10">
            <Text className="font-label text-xs font-bold text-primary uppercase tracking-widest mb-2">Saved Manual Readings</Text>
            <Text className="font-body text-xs text-on-surface-variant mb-5">Entered by you; 3azza does not read data from the vehicle.</Text>
            <View className="gap-1">
              <View className="flex-row items-baseline justify-between gap-4 py-2 border-b border-outline-variant/10">
                <Text className="font-label text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1">Oil Life</Text>
                <Text className="font-headline font-bold text-primary text-lg text-right">{vitals ? `${vitals.oil_life_pct}%` : 'Not set'}</Text>
              </View>
              <View className="flex-row items-baseline justify-between gap-4 py-2 border-b border-outline-variant/10">
                <Text className="font-label text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1">Tire Pressure</Text>
                <Text className="font-headline font-bold text-primary text-lg text-right">{vitals ? `${vitals.tire_pressure_psi} PSI` : 'Not set'}</Text>
              </View>
              <View className="flex-row items-baseline justify-between gap-4 py-2 border-b border-outline-variant/10">
                <Text className="font-label text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1">Brake Pads</Text>
                <Text className="font-headline font-bold text-secondary text-lg text-right">{vitals ? `${vitals.brake_pad_pct}%` : 'Not set'}</Text>
              </View>
              <View className="flex-row items-baseline justify-between gap-4 py-2">
                <Text className="font-label text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1">Battery</Text>
                <Text className="font-headline font-bold text-primary text-lg text-right">{vitals ? `${vitals.battery_health_pct}%` : 'Not set'}</Text>
              </View>
            </View>
            <TouchableOpacity className="py-4 bg-secondary rounded-lg items-center justify-center mt-6" onPress={() => navigation.navigate('VehicleVitals')}>
              <Text className="font-headline font-bold text-[#2f3131] uppercase tracking-widest">Update Readings</Text>
            </TouchableOpacity>
          </View>

          <View className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/10">
            <View className="gap-4">
              <View className="flex-1">
                <Text className="font-label text-xs font-bold text-primary uppercase tracking-widest mb-1">Fuel model</Text>
                <Text className="font-headline text-lg font-bold text-secondary">Tank Capacity</Text>
                <Text className="font-body text-xs text-on-surface-variant mt-2">
                  {profile?.tank_capacity_liters === null || profile?.tank_capacity_liters === undefined
                    ? 'Not set. Range stays hidden until you enter a manual capacity.'
                    : `${profile.tank_capacity_liters.toLocaleString()} L saved. Range is calculated only from complete full-tank segments.`}
                </Text>
              </View>
              <TouchableOpacity className="px-4 py-3 bg-primary rounded-lg self-start" onPress={openFuelCapacityModal}>
                <Text className="font-label text-xs font-bold text-[#081421] uppercase tracking-widest">
                  {profile?.tank_capacity_liters === null || profile?.tank_capacity_liters === undefined ? 'Set' : 'Edit'}
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
                  <Text className="font-headline font-bold text-secondary tracking-wide">Maintenance Reminders</Text>
                  <Text className="font-body text-xs text-on-surface-variant mt-1">Daily pre-ride plus due-service and document alerts.</Text>
                </View>
              </View>
              <Switch
                accessibilityLabel="Maintenance reminders"
                accessibilityRole="switch"
                value={maintenanceReminders}
                onValueChange={handleMaintenanceToggle}
                trackColor={{ false: '#1f2b39', true: 'rgba(169, 199, 255, 0.2)' }}
                thumbColor={maintenanceReminders ? '#c6c6c6' : '#8e9196'}
              />
            </View>
            <TouchableOpacity
              accessibilityLabel="Send test reminder"
              accessibilityRole="button"
              className="py-3 border border-primary/25 rounded-lg items-center justify-center"
              onPress={handleTestNotification}
            >
              <Text className="font-label text-xs font-bold text-primary uppercase tracking-widest">Send Test Reminder</Text>
            </TouchableOpacity>
          </View>

          <View className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/10">
            <View className="flex-row items-center justify-between mb-5">
              <View className="flex-row items-center gap-3 flex-1 pr-4">
                <View className="w-10 h-10 rounded-lg bg-surface-container-high items-center justify-center">
                  <MaterialIcons name="archive" size={20} color="#c6c6c6" />
                </View>
                <View className="flex-1">
                  <Text className="font-headline font-bold text-secondary tracking-wide uppercase">Local Backup</Text>
                  <Text className="font-body text-xs text-on-surface-variant mt-1">The unencrypted JSON backup includes records and document photos. CSV includes service history only. App preferences and the app-lock PIN are excluded.</Text>
                </View>
              </View>
              <Switch
                accessibilityLabel="Weekly backup reminder"
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
                  <Text className="font-label text-xs font-bold text-[#081421] uppercase tracking-widest">Export JSON</Text>
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
                  <Text className="font-label text-xs font-bold text-primary uppercase tracking-widest">Service CSV</Text>
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
                <Text className="font-label text-xs font-bold text-error uppercase tracking-widest">Restore JSON Backup</Text>
              )}
            </TouchableOpacity>
          </View>

          {appLockEnabled ? (
            <>
              <TouchableOpacity
                className="py-4 border border-primary/30 rounded-lg items-center justify-center mb-3"
                onPress={() => setPinModalVisible(true)}
              >
                <Text className="font-headline font-bold text-primary uppercase tracking-widest">Change App PIN</Text>
              </TouchableOpacity>
              <TouchableOpacity className="py-4 border border-error/30 rounded-lg items-center justify-center" onPress={logout}>
                <Text className="font-headline font-bold text-error uppercase tracking-widest">Lock App</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="py-4 border border-error/30 rounded-lg items-center justify-center mt-3"
                onPress={() => setDisablePinModalVisible(true)}
              >
                <Text className="font-headline font-bold text-error uppercase tracking-widest">Disable App PIN</Text>
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
              <Text className="font-headline font-bold text-primary uppercase tracking-widest">Enable App PIN</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <ProtectedModal
        accessibilityLabel="Add vehicle dialog"
        visible={vehicleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeVehicleModal}
      >
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="w-full max-w-xl self-center bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
            <Text className="font-headline text-xl font-bold text-on-surface mb-2">Add Vehicle</Text>
            <Text className="font-body text-sm text-secondary/80 mb-6">Create a separate local maintenance profile tied to one manual catalog entry.</Text>
            <ScrollView className="max-h-[520px]" keyboardShouldPersistTaps="handled">
            <ScooterSelectionFields
              value={newVehicleSelection}
              onChange={(next) => {
                setNewVehicleSelection(next);
                setShowNewVehicleSelectionErrors(false);
              }}
              showErrors={showNewVehicleSelectionErrors}
            />
            <View className="h-5" />
            <TextInput
              className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base mb-4"
              placeholder="e.g. Delivery Scooter"
              placeholderTextColor="#64748b"
              value={vehicleName}
              onChangeText={setVehicleName}
            />
            <TextInput className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base mb-4" placeholder="Starting odometer (KM)" placeholderTextColor="#64748b" keyboardType="numeric" value={vehicleMileage} onChangeText={setVehicleMileage} />
            <TextInput className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base mb-6" placeholder="Daily average (KM)" placeholderTextColor="#64748b" keyboardType="numeric" value={vehicleDailyAverage} onChangeText={setVehicleDailyAverage} />
            </ScrollView>
            <View className="flex-row justify-end gap-3">
              <TouchableOpacity onPress={closeVehicleModal} className="px-4 py-2 rounded-lg">
                <Text className="font-label font-bold text-secondary uppercase tracking-wider">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateVehicle} className="px-6 py-2 bg-primary rounded-lg">
                <Text className="font-label font-bold text-on-primary uppercase tracking-wider">Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ProtectedModal>

      <ProtectedModal accessibilityLabel="Rename vehicle dialog" visible={editingVehicle !== null} transparent animationType="fade" onRequestClose={() => setEditingVehicle(null)}>
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="w-full max-w-xl self-center bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
            <Text className="font-headline text-xl font-bold text-on-surface mb-2">Rename Vehicle</Text>
            <TextInput className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base mb-6" value={vehicleName} onChangeText={setVehicleName} accessibilityLabel="Vehicle name" />
            <View className="flex-row justify-end gap-3">
              <TouchableOpacity onPress={() => setEditingVehicle(null)} className="px-4 py-2 rounded-lg"><Text className="font-label font-bold text-secondary uppercase tracking-wider">Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleRenameVehicle} className="px-6 py-2 bg-primary rounded-lg"><Text className="font-label font-bold text-on-primary uppercase tracking-wider">Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </ProtectedModal>

      <ProtectedModal
        accessibilityLabel="Change scooter reference dialog"
        visible={scooterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeScooterModal}
      >
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="w-full max-w-xl self-center bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
            <Text className="font-headline text-xl font-bold text-on-surface mb-2">Change Scooter</Text>
            <Text className="font-body text-sm text-secondary/80 mb-6">
              This becomes the reference used by maintenance, manuals, parts, reminders, and future scooter-specific features.
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
                <Text className="font-label font-bold text-secondary uppercase tracking-wider">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={savingScooter} onPress={saveScooterSelection} className={`px-6 py-3 bg-primary rounded-lg ${savingScooter ? 'opacity-60' : ''}`}>
                {savingScooter ? <ActivityIndicator color="#081421" /> : (
                  <Text className="font-label font-bold text-on-primary uppercase tracking-wider">Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ProtectedModal>

      <ProtectedModal accessibilityLabel="Change app PIN dialog" visible={pinModalVisible} transparent animationType="fade" onRequestClose={closePinModal}>
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="w-full max-w-xl self-center bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
            <Text className="font-headline text-xl font-bold text-on-surface mb-2">Change App PIN</Text>
            <Text className="font-body text-sm text-secondary/80 mb-6">Confirm the current PIN before replacing the local app lock.</Text>
            {[
              { label: 'Current PIN', value: currentPin, setter: setCurrentPin },
              { label: 'New PIN', value: newPin, setter: setNewPin },
              { label: 'Confirm New PIN', value: confirmNewPin, setter: setConfirmNewPin },
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
                <Text className="font-label font-bold text-secondary uppercase tracking-wider">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleChangePin}
                disabled={changingPin}
                className={`px-6 py-3 bg-primary rounded-lg ${changingPin ? 'opacity-60' : ''}`}
              >
                {changingPin ? (
                  <ActivityIndicator color="#081421" />
                ) : (
                  <Text className="font-label font-bold text-on-primary uppercase tracking-wider">Change PIN</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ProtectedModal>

      <ProtectedModal accessibilityLabel="Disable app PIN dialog" visible={disablePinModalVisible} transparent animationType="fade" onRequestClose={closeDisablePinModal}>
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="w-full max-w-xl self-center bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
            <Text className="font-headline text-xl font-bold text-on-surface mb-2">Disable App PIN</Text>
            <Text className="font-body text-sm text-secondary/80 mb-6">Enter your current PIN to remove the app lock. Anyone with this device will then be able to open 3azza.</Text>
            <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/70 tracking-widest mb-2">Current PIN</Text>
            <TextInput
              className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              value={disablePinInput}
              onChangeText={(value) => setDisablePinInput(normalizePinInput(value))}
              accessibilityLabel="Current PIN to disable app lock"
            />
            <View className="flex-row justify-end gap-3 mt-6">
              <TouchableOpacity onPress={closeDisablePinModal} disabled={disablingPin} className="px-4 py-3 rounded-lg">
                <Text className="font-label font-bold text-secondary uppercase tracking-wider">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDisablePin}
                disabled={disablingPin}
                className={`px-6 py-3 bg-error rounded-lg ${disablingPin ? 'opacity-60' : ''}`}
              >
                {disablingPin ? <ActivityIndicator color="#081421" /> : (
                  <Text className="font-label font-bold text-[#081421] uppercase tracking-wider">Disable PIN</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ProtectedModal>

      <ProtectedModal
        accessibilityLabel="Tank capacity dialog"
        visible={fuelCapacityModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !savingTankCapacity && setFuelCapacityModalVisible(false)}
      >
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="w-full max-w-xl self-center bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
            <Text className="font-headline text-xl font-bold text-on-surface mb-2">Tank Capacity</Text>
            <Text className="font-body text-sm text-secondary/80 mb-6">
              Optional. Enter the manufacturer-rated capacity in liters; 3azza never infers it from a fill-up.
            </Text>
            <TextInput
              className="bg-surface-container-highest px-4 py-3 rounded-xl border border-outline-variant/10 text-on-surface font-body text-base mb-6"
              placeholder="e.g. 8.5"
              placeholderTextColor="#64748b"
              keyboardType="decimal-pad"
              value={tankCapacityInput}
              onChangeText={setTankCapacityInput}
              accessibilityLabel="Tank capacity in liters"
            />
            <View className="flex-row justify-end gap-3">
              <TouchableOpacity
                onPress={() => setFuelCapacityModalVisible(false)}
                disabled={savingTankCapacity}
                className="px-4 py-3 rounded-lg"
              >
                <Text className="font-label font-bold text-secondary uppercase tracking-wider">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveFuelCapacity}
                disabled={savingTankCapacity}
                className={`px-6 py-3 bg-primary rounded-lg ${savingTankCapacity ? 'opacity-60' : ''}`}
              >
                {savingTankCapacity ? <ActivityIndicator color="#081421" /> : (
                  <Text className="font-label font-bold text-on-primary uppercase tracking-wider">Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ProtectedModal>
    </AppScreen>
  );
}
