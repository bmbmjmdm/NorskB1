import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { DIFFICULTIES, type Difficulty } from '@/types';
import type { GradePreview, GradePreviews } from '@/hooks/useSession';
import { difficultyColors, radius, spacing, typography } from '@/theme';

export interface DifficultyButtonsProps {
  onGrade: (difficulty: Difficulty) => void;
  /** Per-button outcome for the current card (scheduled days, or "review again"). */
  previews?: GradePreviews | null;
  disabled?: boolean;
}

const LABELS: Record<Difficulty, string> = {
  trivial: 'Trivial',
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

/** Short text under each button: "review" if it stays, else the scheduled days. */
function previewLabel(preview?: GradePreview): string {
  if (!preview) return ' ';
  if (preview.stays) return '↻ review';
  if (preview.days <= 1) return '1 day';
  return `${preview.days} days`;
}

export function DifficultyButtons({
  onGrade,
  previews,
  disabled,
}: DifficultyButtonsProps) {
  return (
    <View style={styles.row}>
      {DIFFICULTIES.map(d => (
        <GradeButton
          key={d}
          difficulty={d}
          onPress={() => onGrade(d)}
          subLabel={previewLabel(previews?.[d])}
          disabled={disabled}
        />
      ))}
    </View>
  );
}

function GradeButton({
  difficulty,
  onPress,
  subLabel,
  disabled,
}: {
  difficulty: Difficulty;
  onPress: () => void;
  subLabel: string;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const palette = difficultyColors[difficulty];

  const animate = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      friction: 6,
      tension: 140,
    }).start();

  return (
    <Animated.View style={[styles.btnWrap, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animate(0.92)}
        onPressOut={() => animate(1)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Grade ${LABELS[difficulty]}, ${subLabel}`}
        style={[
          styles.btn,
          { backgroundColor: palette.base },
          disabled && styles.disabled,
        ]}>
        <Text style={[styles.label, { color: palette.text }]}>
          {LABELS[difficulty]}
        </Text>
        <Text style={[styles.sub, { color: palette.text }]} numberOfLines={1}>
          {subLabel}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  btnWrap: { flex: 1 },
  btn: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  disabled: { opacity: 0.4 },
  label: { ...typography.label },
  sub: { ...typography.caption, opacity: 0.8 },
});
