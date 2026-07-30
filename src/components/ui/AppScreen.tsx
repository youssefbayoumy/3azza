import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type AppScreenProps = ComponentProps<typeof SafeAreaView>;

/**
 * Safe-area-aware root for product screens. The default deliberately excludes
 * the bottom edge because the tab bar and scroll content manage that space.
 */
export default function AppScreen({ edges = ['top', 'left', 'right'], style, ...props }: AppScreenProps) {
  return <SafeAreaView edges={edges} style={[styles.screen, style]} {...props} />;
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#081421',
    flex: 1,
  },
});
