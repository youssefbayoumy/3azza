import { MaterialIcons } from '@expo/vector-icons';
import { Text, TouchableOpacity, View } from 'react-native';
import type { MaintenanceTaskProjection } from '../maintenance/types';
import {
  canCustomizeMaintenanceTask,
  maintenanceOverrideBadge,
  naturalMaintenanceActionLabel,
  naturalRecordActionLabel,
} from '../maintenance/presentation';
import ProtectedModal from './ProtectedModal';
import AppBottomSheet from './ui/AppBottomSheet';
import { useTranslation } from '../i18n';

type MaintenanceActionMenuProps = {
  onClose: () => void;
  onCustomize: (task: MaintenanceTaskProjection) => void;
  onHistory: () => void;
  onRecord: (task: MaintenanceTaskProjection) => void;
  onRestore: (task: MaintenanceTaskProjection) => void;
  onStopTracking?: (task: MaintenanceTaskProjection) => void;
  task: MaintenanceTaskProjection | null;
};

type MenuRowProps = {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'warning';
};

function MenuRow({ icon, label, onPress, tone = 'default' }: MenuRowProps) {
  const { isRTL } = useTranslation();
  return (
    <TouchableOpacity
      accessibilityLabel={label}
      accessibilityRole="button"
      className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 py-2"
      onPress={onPress}
    >
      <View className={`h-9 w-9 items-center justify-center rounded-lg ${tone === 'warning' ? 'bg-amber-500/10' : 'bg-primary/10'}`}>
        <MaterialIcons name={icon} size={19} color={tone === 'warning' ? '#f59e0b' : '#a9c7ff'} />
      </View>
      <Text className="font-body text-sm font-semibold text-on-surface flex-1">{label}</Text>
      <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color="#8e9196" />
    </TouchableOpacity>
  );
}

export default function MaintenanceActionMenu({
  onClose,
  onCustomize,
  onHistory,
  onRecord,
  onRestore,
  onStopTracking,
  task,
}: MaintenanceActionMenuProps) {
  const { t } = useTranslation();
  if (!task) return null;

  const historical = task.status === 'historical_unverified';
  const overrideBadge = maintenanceOverrideBadge(task);
  const customizable = canCustomizeMaintenanceTask(task);
  const closeThen = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <ProtectedModal
      accessibilityLabel={t('maintenance.actionsA11y', { label: naturalMaintenanceActionLabel(task) })}
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible
    >
      <View className="flex-1 bg-black/55">
        <AppBottomSheet onClose={onClose} title={naturalMaintenanceActionLabel(task)}>
          <View className="gap-1">
            {!historical && task.status !== 'not_applicable' ? (
              <MenuRow
                icon="edit-note"
                label={naturalRecordActionLabel(task, task.status === 'history_unknown_recommend_service' || task.status === 'history_unknown_request_record' || task.status === 'unknown')}
                onPress={() => closeThen(() => onRecord(task))}
              />
            ) : null}
            {customizable ? (
              <MenuRow
                icon="notifications-active"
                label={t('maintenance.customizeReminder')}
                onPress={() => closeThen(() => onCustomize(task))}
              />
            ) : null}
            <MenuRow icon="history" label={t('maintenance.viewHistory')} onPress={() => closeThen(onHistory)} />
            {customizable ? (
              <MenuRow
                icon={task.reminderDisabled ? 'notifications-active' : 'notifications-off'}
                label={task.reminderDisabled ? t('maintenance.enableReminder') : t('maintenance.disableReminder')}
                onPress={() => closeThen(() => onCustomize(task))}
                tone={task.reminderDisabled ? 'default' : 'warning'}
              />
            ) : null}
            {customizable && overrideBadge !== null ? (
              <MenuRow
                icon="restore"
                label={t('maintenance.restoreSchedule')}
                onPress={() => closeThen(() => onRestore(task))}
              />
            ) : null}
            {onStopTracking && !historical && task.status !== 'not_applicable' ? (
              <MenuRow
                icon="remove-circle-outline"
                label={t('maintenance.stopTracking')}
                onPress={() => closeThen(() => onStopTracking(task))}
                tone="warning"
              />
            ) : null}
          </View>
          {historical ? (
            <Text className="font-body text-xs text-on-surface-variant mt-3 leading-5">
              {t('maintenance.pastMilestoneHelp')}
            </Text>
          ) : null}
        </AppBottomSheet>
      </View>
    </ProtectedModal>
  );
}
