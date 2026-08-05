import { MaterialIcons } from '@expo/vector-icons';
import { Text, TouchableOpacity, View } from 'react-native';
import {
  maintenanceOverrideBadge,
  maintenanceScheduleText,
  naturalMaintenanceActionLabel,
} from '../maintenance/presentation';
import type { MaintenanceTaskProjection } from '../maintenance/types';

type MaintenanceActionRowProps = {
  onPress: (task: MaintenanceTaskProjection) => void;
  task: MaintenanceTaskProjection;
};

function compactStatus(task: MaintenanceTaskProjection): string {
  if (task.reminderDisabled) return 'Reminder disabled';
  if (task.status === 'overdue') return task.remainingKm !== null
    ? `${Math.abs(task.remainingKm).toLocaleString()} km overdue`
    : 'Overdue';
  if (task.status === 'due') return 'Due now';
  if (task.status === 'due_soon') return 'Due soon';
  if (task.conditionResult === 'cleaning_needed') return 'Latest condition: cleaning needed';
  if (task.conditionResult === 'healthy') return 'Latest condition: healthy';
  if (task.conditionResult === 'monitor') return 'Latest condition: monitor';
  if (task.conditionResult === 'replace_soon') return 'Latest condition: replace soon';
  if (task.conditionResult === 'replace_now') return 'Latest condition: replace now';
  if (task.status === 'condition_attention') return 'Needs attention';
  if (task.status === 'history_unknown_recommend_service') return task.action === 'replace'
    ? 'Last replacement unknown'
    : 'Last service unknown';
  if (task.status === 'history_unknown_request_record' || task.status === 'unknown') {
    return task.action === 'inspect' || task.action === 'condition_check' || task.action === 'test'
      ? 'Last inspection unknown'
      : 'Last action unknown';
  }
  const lastAction = task.action === 'replace' ? 'replacement'
    : task.action === 'inspect' || task.action === 'condition_check' || task.action === 'test' ? 'inspection'
      : task.action.replace('_', ' ');
  if (task.lastPerformedAtKm !== null) return `Last ${lastAction} at ${task.lastPerformedAtKm.toLocaleString()} km`;
  if (task.lastPerformedOn !== null) return `Last ${lastAction} on ${task.lastPerformedOn}`;
  if (task.remainingKm !== null) return `${task.remainingKm.toLocaleString()} km remaining`;
  if (task.remainingDays !== null) return `${task.remainingDays} days remaining`;
  return task.status === 'no_fixed_interval' || task.status === 'informational' ? 'Check by condition' : 'Upcoming';
}

function statusColor(task: MaintenanceTaskProjection): string {
  if (task.status === 'overdue' || task.status === 'due') return 'text-error';
  if (task.status === 'due_soon' || task.status === 'condition_attention') return 'text-amber-400';
  return 'text-on-surface-variant';
}

function technicianLabel(task: MaintenanceTaskProjection): string {
  if (task.technicianLevel === 'workshop_required') return 'Workshop required';
  if (task.technicianLevel === 'workshop_recommended') return 'Workshop';
  return 'Owner-checkable';
}

export default function MaintenanceActionRow({ onPress, task }: MaintenanceActionRowProps) {
  const overrideBadge = maintenanceOverrideBadge(task);
  return (
    <TouchableOpacity
      accessibilityLabel={`Open ${naturalMaintenanceActionLabel(task)} actions`}
      accessibilityRole="button"
      className="min-h-14 flex-row items-center gap-3 border-b border-outline-variant/10 px-3 py-2.5 last:border-b-0"
      onPress={() => onPress(task)}
    >
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-2">
          <Text className="font-body text-sm font-semibold text-on-surface flex-shrink" numberOfLines={1}>
            {naturalMaintenanceActionLabel(task)}
          </Text>
          {overrideBadge ? (
            <View className="rounded-full bg-primary/12 px-2 py-0.5">
              <Text className="font-label text-[9px] font-bold text-primary">{overrideBadge}</Text>
            </View>
          ) : null}
        </View>
        <Text className="font-body text-[11px] text-on-surface-variant mt-0.5" numberOfLines={1}>
          {maintenanceScheduleText(task)} · {technicianLabel(task)}
        </Text>
        <Text className={`font-label text-[10px] mt-0.5 ${statusColor(task)}`} numberOfLines={1}>
          {compactStatus(task)}
        </Text>
      </View>
      <MaterialIcons name="more-vert" size={21} color="#8e9196" />
    </TouchableOpacity>
  );
}
