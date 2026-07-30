import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';

type EmptyStateProps = {
  icon: ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  message: string;
  className?: string;
};

/** Reusable neutral state for a locally empty collection. */
export default function EmptyState({ className = '', icon, message, title }: EmptyStateProps) {
  return (
    <View accessibilityRole="summary" className={`bg-surface-container-low border border-secondary/10 p-8 rounded-xl items-center ${className}`.trim()}>
      <MaterialIcons name={icon} size={48} color="#2a3644" />
      <Text className="font-label text-xs font-bold text-on-surface-variant/50 mt-4 uppercase tracking-widest">{title}</Text>
      <Text className="font-body text-sm text-on-surface-variant/30 mt-2 text-center">{message}</Text>
    </View>
  );
}
