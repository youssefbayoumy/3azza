import { MaterialIcons } from '@expo/vector-icons';
import { Text, TouchableOpacity, View } from 'react-native';
import {
  maintenanceOverrideBadge,
  maintenanceBaseActionLabel,
  maintenanceScheduleText,
  naturalMaintenanceActionLabel,
} from '../maintenance/presentation';
import type { MaintenanceTaskProjection } from '../maintenance/types';
import { formatNumber, t } from '../i18n/core';

type MaintenanceActionRowProps = {
  onPress: (task: MaintenanceTaskProjection) => void;
  task: MaintenanceTaskProjection;
};

function compactStatus(task: MaintenanceTaskProjection): string {
  if (task.reminderDisabled) return t('maintenance.reminderDisabled');
  if (task.status === 'overdue') return task.remainingKm !== null
    ? t('maintenance.overdueKm', { km: formatNumber(Math.abs(task.remainingKm)) })
    : t('maintenance.overdue');
  if (task.status === 'due') return t('maintenance.dueNow');
  if (task.status === 'due_soon') return t('maintenance.dueSoon');
  if (task.conditionResult === 'cleaning_needed') return t('maintenance.cleaningNeeded');
  if (task.conditionResult === 'healthy') return t('maintenance.healthy');
  if (task.conditionResult === 'monitor') return t('maintenance.monitor');
  if (task.conditionResult === 'replace_soon') return t('maintenance.replaceSoon');
  if (task.conditionResult === 'replace_now') return t('maintenance.replaceNow');
  if (task.status === 'condition_attention') return t('maintenance.needsAttention');
  if (task.status === 'history_unknown_recommend_service') return task.action === 'replace'
    ? t('maintenance.lastReplacementUnknown')
    : t('maintenance.lastServiceUnknown');
  if (task.status === 'history_unknown_request_record' || task.status === 'unknown') {
    return task.action === 'inspect' || task.action === 'condition_check' || task.action === 'test'
      ? t('maintenance.lastInspectionUnknown')
      : t('maintenance.lastActionUnknown');
  }
  const lastAction = task.action === 'replace' ? t('maintenance.actionReplacement')
    : task.action === 'inspect' || task.action === 'condition_check' || task.action === 'test' ? t('maintenance.actionInspection')
      : maintenanceBaseActionLabel(task.action);
  if (task.lastPerformedAtKm !== null) return t('maintenance.lastAtKm', { action: lastAction, km: formatNumber(task.lastPerformedAtKm) });
  if (task.lastPerformedOn !== null) return t('maintenance.lastOn', { action: lastAction, date: task.lastPerformedOn });
  if (task.remainingKm !== null) return t('maintenance.kmRemaining', { km: formatNumber(task.remainingKm) });
  if (task.remainingDays !== null) return t('maintenance.daysRemaining', { days: formatNumber(task.remainingDays) });
  return task.status === 'no_fixed_interval' || task.status === 'informational' ? t('maintenance.checkCondition') : t('maintenance.upcoming');
}

function statusColor(task: MaintenanceTaskProjection): string {
  if (task.status === 'overdue' || task.status === 'due') return 'text-error';
  if (task.status === 'due_soon' || task.status === 'condition_attention') return 'text-amber-400';
  return 'text-on-surface-variant';
}

function technicianLabel(task: MaintenanceTaskProjection): string {
  if (task.technicianLevel === 'workshop_required') return t('maintenance.workshopRequired');
  if (task.technicianLevel === 'workshop_recommended') return t('maintenance.workshop');
  return t('maintenance.ownerCheckable');
}

export default function MaintenanceActionRow({ onPress, task }: MaintenanceActionRowProps) {
  const overrideBadge = maintenanceOverrideBadge(task);
  return (
    <TouchableOpacity
      accessibilityLabel={t('maintenance.openActions', { label: naturalMaintenanceActionLabel(task) })}
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
