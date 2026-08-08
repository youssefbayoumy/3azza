import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Alert } from 'react-native';
import PagerView from 'react-native-pager-view';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useAppStore } from '../../store/useAppStore';
import AppScreen from '../../components/ui/AppScreen';
import { configureLayoutDirection, useTranslation, type AppLocale } from '../../i18n';

interface Slide {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent: string;
}

export default function OnboardingScreen() {
  const pagerRef = useRef<PagerView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const { t, isRTL } = useTranslation();
  const { height: viewportHeight } = useWindowDimensions();
  const compactHeight = viewportHeight < 700;

  const slides: Slide[] = [
    { icon: <MaterialCommunityIcons name="engine" size={64} color="#a9c7ff" />, title: t('onboarding.slide1.title'), subtitle: t('onboarding.slide1.body'), accent: '#a9c7ff' },
    { icon: <MaterialCommunityIcons name="gas-station" size={64} color="#c6c6c7" />, title: t('onboarding.slide2.title'), subtitle: t('onboarding.slide2.body'), accent: '#c6c6c7' },
    { icon: <MaterialIcons name="inventory-2" size={64} color="#a9c7ff" />, title: t('onboarding.slide3.title'), subtitle: t('onboarding.slide3.body'), accent: '#a9c7ff' },
  ];
  const isLastSlide = currentPage === slides.length - 1;

  const handleNext = () => {
    if (isLastSlide) {
      completeOnboarding();
    } else {
      pagerRef.current?.setPage(currentPage + 1);
    }
  };

  const handleSkip = () => {
    completeOnboarding();
  };

  const changeLocale = (next: AppLocale) => {
    if (next === locale) return;
    setLocale(next);
    if (configureLayoutDirection(next)) {
      Alert.alert(
        t('language.changeTitle'),
        t('language.changeBody')
      );
    }
  };

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']} style={styles.container}>
      {/* Skip Button */}
      {!isLastSlide && (
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip} activeOpacity={0.7}>
          <Text style={[styles.skipText, isRTL && styles.arabicText]}>{t('onboarding.skip')}</Text>
        </TouchableOpacity>
      )}

      {/* Pager */}
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => setCurrentPage(e.nativeEvent.position)}
      >
        {slides.map((slide, index) => (
          <View
            key={index}
            style={[
              styles.slide,
              { paddingHorizontal: compactHeight ? 24 : 40 },
            ]}
          >
            {/* Glow circle behind icon */}
            <View
              style={[
                styles.iconGlow,
                {
                  marginBottom: compactHeight ? 24 : 40,
                  padding: compactHeight ? 20 : 28,
                  shadowColor: slide.accent,
                },
              ]}
            >
              <View style={styles.iconContainer}>{slide.icon}</View>
            </View>

            <Text style={[styles.title, isRTL && styles.arabicText, { fontSize: compactHeight ? 26 : 32 }]}>{slide.title}</Text>
            <Text style={[styles.subtitle, isRTL && styles.arabicText]}>{slide.subtitle}</Text>
          </View>
        ))}
      </PagerView>

      {/* Bottom section: dots + button */}
      <View
        style={[
          styles.bottomSection,
          {
            gap: compactHeight ? 16 : 32,
            paddingBottom: compactHeight ? 20 : 32,
          },
        ]}
      >
        {/* Page dots */}
        <View style={styles.dotsRow}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                currentPage === i ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {/* CTA Button */}
        <TouchableOpacity style={styles.ctaButton} onPress={handleNext} activeOpacity={0.85}>
          <Text style={[styles.ctaText, isRTL && styles.arabicText]}>{isLastSlide ? t('onboarding.getStarted') : t('onboarding.next')}</Text>
          <MaterialIcons
            name={isLastSlide ? 'check' : (isRTL ? 'arrow-back' : 'arrow-forward')}
            size={20}
            color="#081421"
          />
        </TouchableOpacity>
      </View>
      <View style={styles.languageRow}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: locale === 'en' }} onPress={() => changeLocale('en')}>
          <Text style={[styles.languageText, locale === 'en' && styles.languageActive]}>{t('language.english')}</Text>
        </TouchableOpacity>
        <Text style={styles.languageDivider}>|</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: locale === 'ar-EG' }} onPress={() => changeLocale('ar-EG')}>
          <Text style={[styles.languageText, locale === 'ar-EG' && styles.languageActive, styles.arabicText]}>{t('language.egyptianArabic')}</Text>
        </TouchableOpacity>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#081421',
  },
  skipButton: {
    position: 'absolute',
    top: 8,
    right: 24,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    fontFamily: 'PlusJakartaSans',
    fontSize: 14,
    fontWeight: '600',
    color: '#c4c6cc',
    letterSpacing: 0.5,
  },
  pager: {
    flex: 1,
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconGlow: {
    borderRadius: 999,
    backgroundColor: 'rgba(169, 199, 255, 0.06)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 12,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(169, 199, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(169, 199, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 32,
    color: '#d7e3f7',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    lineHeight: 26,
    color: '#c4c6cc',
    textAlign: 'center',
  },
  bottomSection: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 28,
    backgroundColor: '#a9c7ff',
  },
  dotInactive: {
    width: 8,
    backgroundColor: '#2a3644',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#a9c7ff',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 40,
    width: '100%',
  },
  ctaText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#081421',
    letterSpacing: 0.3,
  },
  arabicText: {
    fontFamily: 'Cairo_600SemiBold',
    letterSpacing: 0,
  },
  languageRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    paddingBottom: 12,
  },
  languageText: { color: '#8e9196', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
  languageActive: { color: '#a9c7ff' },
  languageDivider: { color: '#64748b' },
});
