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

type MaintenanceActionMenuProps = {
  onClose: () => void;
  onCustomize: (task: MaintenanceTaskProjection) => void;
  onHistory: () => void;
  onRecord: (task: MaintenanceTaskProjection) => void;
  onRestore: (task: MaintenanceTaskProjection) => void;
  task: MaintenanceTaskProjection | null;
};

type MenuRowProps = {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'warning';
};

function MenuRow({ icon, label, onPress, tone = 'default' }: MenuRowProps) {
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
      <MaterialIcons name="chevron-right" size={20} color="#8e9196" />
    </TouchableOpacity>
  );
}

export default function MaintenanceActionMenu({
  onClose,
  onCustomize,
  onHistory,
  onRecord,
  onRestore,
  task,
}: MaintenanceActionMenuProps) {
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
      accessibilityLabel={`${naturalMaintenanceActionLabel(task)} actions`}
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
                label="Customize reminder"
                onPress={() => closeThen(() => onCustomize(task))}
              />
            ) : null}
            <MenuRow icon="history" label="View history" onPress={() => closeThen(onHistory)} />
            {customizable ? (
              <MenuRow
                icon={task.reminderDisabled ? 'notifications-active' : 'notifications-off'}
                label={task.reminderDisabled ? 'Enable reminder' : 'Disable reminder'}
                onPress={() => closeThen(() => onCustomize(task))}
                tone={task.reminderDisabled ? 'default' : 'warning'}
              />
            ) : null}
            {customizable && overrideBadge !== null ? (
              <MenuRow
                icon="restore"
                label="Restore original schedule"
                onPress={() => closeThen(() => onRestore(task))}
              />
            ) : null}
          </View>
          {historical ? (
            <Text className="font-body text-xs text-on-surface-variant mt-3 leading-5">
              Past break-in milestones are kept in Maintenance history and cannot be turned into recurring reminders.
            </Text>
          ) : null}
        </AppBottomSheet>
      </View>
    </ProtectedModal>
  );
}
