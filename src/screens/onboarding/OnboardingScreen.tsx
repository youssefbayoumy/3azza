import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated } from 'react-native';
import PagerView from 'react-native-pager-view';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useAppStore } from '../../store/useAppStore';

const { width } = Dimensions.get('window');

interface Slide {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent: string;
}

const SLIDES: Slide[] = [
  {
    icon: <MaterialCommunityIcons name="engine" size={64} color="#a9c7ff" />,
    title: 'Track Your Ride',
    subtitle:
      'Monitor every vital — oil pressure, coolant temp, gearbox health — all in one clean dashboard.',
    accent: '#a9c7ff',
  },
  {
    icon: <MaterialCommunityIcons name="gas-station" size={64} color="#c6c6c7" />,
    title: 'Log Every Fill-Up',
    subtitle:
      'Record fuel costs and consumption. Watch patterns emerge and save money over time.',
    accent: '#c6c6c7',
  },
  {
    icon: <MaterialIcons name="inventory-2" size={64} color="#a9c7ff" />,
    title: 'Stay Ahead of Wear',
    subtitle:
      'Keep an inventory of parts, filters, and fluids. Always know what\'s due next.',
    accent: '#a9c7ff',
  },
];

export default function OnboardingScreen() {
  const pagerRef = useRef<PagerView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const isLastSlide = currentPage === SLIDES.length - 1;

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

  return (
    <View style={styles.container}>
      {/* Skip Button */}
      {!isLastSlide && (
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip} activeOpacity={0.7}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Pager */}
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => setCurrentPage(e.nativeEvent.position)}
      >
        {SLIDES.map((slide, index) => (
          <View key={index} style={styles.slide}>
            {/* Glow circle behind icon */}
            <View style={[styles.iconGlow, { shadowColor: slide.accent }]}>
              <View style={styles.iconContainer}>{slide.icon}</View>
            </View>

            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.subtitle}>{slide.subtitle}</Text>
          </View>
        ))}
      </PagerView>

      {/* Bottom section: dots + button */}
      <View style={styles.bottomSection}>
        {/* Page dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
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
          <Text style={styles.ctaText}>{isLastSlide ? 'Get Started' : 'Next'}</Text>
          <MaterialIcons
            name={isLastSlide ? 'check' : 'arrow-forward'}
            size={20}
            color="#081421"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#081421',
  },
  skipButton: {
    position: 'absolute',
    top: 56,
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
    paddingHorizontal: 40,
  },
  iconGlow: {
    marginBottom: 40,
    borderRadius: 999,
    padding: 28,
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
    maxWidth: 300,
  },
  bottomSection: {
    paddingHorizontal: 24,
    paddingBottom: 56,
    alignItems: 'center',
    gap: 32,
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
    maxWidth: 340,
  },
  ctaText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#081421',
    letterSpacing: 0.3,
  },
});
