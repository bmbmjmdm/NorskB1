import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

export interface FlashCardFace {
  /** Badge shown top-left, e.g. "English" / "Norsk". */
  label: string;
  /** Main word or phrase. */
  text: string;
  /** Secondary line, e.g. inflected forms or part of speech. */
  sub?: string;
}

export interface FlashCardProps {
  front: FlashCardFace;
  back: FlashCardFace;
  /** Changes whenever a new presentation should reset the card to its front. */
  resetKey: string | number;
  onFlip?: (flipped: boolean) => void;
}

/**
 * A large tappable card that flips along the Y axis to reveal its back.
 * Uses the built-in Animated API (spring) for a lively 3D flip plus a subtle
 * press-in scale for tactile feedback.
 */
export function FlashCard({ front, back, resetKey, onFlip }: FlashCardProps) {
  const flip = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);

  // Reset to front whenever a new card is presented.
  useEffect(() => {
    flip.setValue(0);
    setFlipped(false);
  }, [resetKey, flip]);

  const toggle = () => {
    const next = !flipped;
    setFlipped(next);
    onFlip?.(next);
    Animated.spring(flip, {
      toValue: next ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 10,
    }).start();
  };

  const onPressIn = () =>
    Animated.timing(press, {
      toValue: 1,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const onPressOut = () =>
    Animated.timing(press, {
      toValue: 0,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const frontRotate = flip.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backRotate = flip.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });
  const frontOpacity = flip.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });
  const backOpacity = flip.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });
  const scale = press.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.97],
  });

  return (
    <Pressable
      style={styles.pressable}
      onPress={toggle}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`Flash card. ${
        flipped ? back.text : front.text
      }. Double tap to flip.`}>
      <Animated.View style={[styles.cardWrap, { transform: [{ scale }] }]}>
        <Animated.View
          style={[
            styles.face,
            {
              opacity: frontOpacity,
              transform: [{ perspective: 1000 }, { rotateY: frontRotate }],
            },
          ]}>
          <CardFaceContent face={front} />
        </Animated.View>

        <Animated.View
          style={[
            styles.face,
            styles.faceBack,
            {
              opacity: backOpacity,
              transform: [{ perspective: 1000 }, { rotateY: backRotate }],
            },
          ]}>
          <CardFaceContent face={back} accent />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function CardFaceContent({
  face,
  accent,
}: {
  face: FlashCardFace;
  accent?: boolean;
}) {
  return (
    <>
      <View style={[styles.badge, accent && styles.badgeAccent]}>
        <Text style={styles.badgeText}>{face.label}</Text>
      </View>
      <View style={styles.center}>
        <Text style={styles.word} adjustsFontSizeToFit numberOfLines={4}>
          {face.text}
        </Text>
        {face.sub ? <Text style={styles.sub}>{face.sub}</Text> : null}
      </View>
      <Text style={styles.hint}>Tap to flip</Text>
    </>
  );
}

const styles = StyleSheet.create({
  pressable: { flex: 1, width: '100%' },
  cardWrap: { flex: 1, width: '100%' },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    backfaceVisibility: 'hidden',
    // Soft elevation.
    shadowColor: colors.shadow,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  faceBack: { backgroundColor: colors.surfaceAlt },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeAccent: { backgroundColor: colors.primary },
  badgeText: {
    ...typography.caption,
    color: colors.text,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  word: {
    ...typography.display,
    color: colors.text,
    textAlign: 'center',
  },
  sub: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
