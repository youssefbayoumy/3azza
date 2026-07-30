import { ActivityIndicator, Text, TouchableOpacity, type TouchableOpacityProps } from 'react-native';

type AppPrimaryButtonProps = Omit<TouchableOpacityProps, 'children'> & {
  label: string;
  loading?: boolean;
};

/** Consistent primary action for form submission and irreversible local writes. */
export default function AppPrimaryButton({
  className = '',
  disabled = false,
  label,
  loading = false,
  ...props
}: AppPrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      className={`bg-primary rounded-xl py-4 items-center ${isDisabled ? 'opacity-50' : ''} ${className}`.trim()}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color="#081421" />
      ) : (
        <Text className="font-label text-base font-bold text-[#081421] uppercase tracking-wider">{label}</Text>
      )}
    </TouchableOpacity>
  );
}
