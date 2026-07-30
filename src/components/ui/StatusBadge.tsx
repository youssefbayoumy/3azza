import { Text, View } from 'react-native';

type StatusTone = 'info' | 'success' | 'warning' | 'error';

type StatusBadgeProps = {
  label: string;
  tone?: StatusTone;
  className?: string;
};

const toneClassNames: Record<StatusTone, string> = {
  info: 'bg-primary/10 border-primary/20 text-primary',
  success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500',
  warning: 'bg-[#FFB100]/10 border-[#FFB100]/20 text-[#FFB100]',
  error: 'bg-error/10 border-error/20 text-error',
};

/** Compact, text-first state indicator that does not rely on color alone. */
export default function StatusBadge({ className = '', label, tone = 'info' }: StatusBadgeProps) {
  const [backgroundClassName, borderClassName, textClassName] = toneClassNames[tone].split(' ');

  return (
    <View accessibilityRole="text" className={`${backgroundClassName} ${borderClassName} px-2 py-1 rounded border ${className}`.trim()}>
      <Text className={`${textClassName} text-xs font-bold font-label tracking-widest uppercase`}>{label}</Text>
    </View>
  );
}
