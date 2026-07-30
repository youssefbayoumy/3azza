import type { ReactNode } from 'react';
import { View } from 'react-native';

type AppTopBarProps = {
  children: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  align?: 'start' | 'center';
  tone?: 'standard' | 'subtle' | 'elevated';
  className?: string;
};

const toneClassNames: Record<NonNullable<AppTopBarProps['tone']>, string> = {
  standard: 'border-outline-variant/20',
  subtle: 'border-[#C0C0C0]/10 bg-background',
  elevated: 'border-[#C0C0C0]/15 bg-[#0b1a2b]',
};

/**
 * Shared top-level navigation chrome. Slots preserve each screen's existing
 * title treatment while keeping header height, spacing, and dividers aligned.
 */
export default function AppTopBar({
  align = 'start',
  children,
  className = '',
  leading,
  tone = 'standard',
  trailing,
}: AppTopBarProps) {
  const barClassName = `flex-row items-center px-6 h-16 w-full border-b ${toneClassNames[tone]} ${className}`.trim();

  if (align === 'center') {
    return (
      <View className={`${barClassName} justify-between`}>
        <View className="min-w-10 items-start">{leading}</View>
        <View className="flex-1 items-center">{children}</View>
        <View className="min-w-10 items-end">{trailing}</View>
      </View>
    );
  }

  return (
    <View className={`${barClassName} justify-between`}>
      <View className="flex-row items-center gap-3 flex-shrink">{leading}{children}</View>
      {trailing ? <View className="flex-row items-center">{trailing}</View> : null}
    </View>
  );
}
