import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, TouchableOpacity, type TouchableOpacityProps } from 'react-native';

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

type AppIconButtonProps = Omit<TouchableOpacityProps, 'accessibilityLabel' | 'children'> & {
  accessibilityLabel: string;
  icon: MaterialIconName;
  color?: string;
  iconSize?: number;
  variant?: 'bare' | 'tonal';
};

/**
 * Shared visual treatment for compact app-bar actions. Every icon-only action
 * supplies an explicit name for screen-reader users.
 */
export default function AppIconButton({
  className = '',
  color = '#a9c7ff',
  icon,
  iconSize = 24,
  style,
  variant = 'bare',
  ...props
}: AppIconButtonProps) {
  const variantClassName = variant === 'tonal' ? 'rounded-lg bg-primary/10' : '';

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      accessibilityRole="button"
      className={`${variantClassName} ${className}`.trim()}
      hitSlop={4}
      style={[styles.touchTarget, style]}
      {...props}
    >
      <MaterialIcons name={icon} size={iconSize} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchTarget: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
});
