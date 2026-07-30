import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { KnowledgeOrigin, ModelKnowledgeProfile } from '../modelData/types';

const ORIGIN_LABELS: Record<KnowledgeOrigin, string> = {
  manual: 'Manual recommendation',
  '3azza_policy': '3azza policy',
  user_override: 'User override',
  conflict: 'Manual conflict',
  missing: 'Missing',
};

type Props = {
  profile: ModelKnowledgeProfile;
  pages?: number[];
  origin?: KnowledgeOrigin;
  compact?: boolean;
};

export default function SourceProvenance({ compact = false, origin = 'manual', pages = [], profile }: Props) {
  const pageText = pages.length === 0
    ? 'Page not specified'
    : pages.length === 1
      ? `PDF page ${pages[0]}`
      : `PDF pages ${pages.join(', ')}`;
  return (
    <View
      accessibilityLabel={`${ORIGIN_LABELS[origin]}. ${profile.brandName} ${profile.modelName}, ${profile.manualYears}. ${pageText}.`}
      className={`${compact ? 'mt-2' : 'mt-3 pt-3 border-t border-outline-variant/10'} flex-row items-start gap-2`}
    >
      <MaterialCommunityIcons name="book-open-page-variant-outline" size={15} color="#7e91a8" />
      <View className="flex-1">
        <Text className="font-label text-[11px] font-bold text-secondary uppercase tracking-wider">
          {ORIGIN_LABELS[origin]}
        </Text>
        <Text className="font-body text-xs text-on-surface-variant mt-0.5">
          {profile.brandName} {profile.modelName} · {profile.manualYears} · {pageText}
        </Text>
      </View>
    </View>
  );
}
