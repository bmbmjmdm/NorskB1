import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { DIFFICULTIES, type Difficulty } from '@/types';
import { difficultyColors, radius, spacing, typography } from '@/theme';

export interface DifficultyButtonsProps {
  onGrade: (difficulty: Difficulty) => void;
  disabled?: boolean;
}

const LABELS: Record<Difficulty, string> = {
  trivial: 'Trivial',
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

export function DifficultyButtons({ onGrade, disabled }: DifficultyButtonsProps) {
  return (
    <View style={styles.row}>
      {DIFFICULTIES.map(d => (
        <GradeButton
          key={d}
          difficulty={d}
          onPress={() => onGrade(d)}
          disabled={disabled}
        />
      ))}
    </View>
  );
}

function GradeButton({
  difficulty,
  onPress,
  disabled,
}: {
  difficulty: Difficulty;
  onPress: () => void;
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
        accessibilityLabel={`Grade ${LABELS[difficulty]}`}
        style={[
          styles.btn,
          { backgroundColor: palette.base },
          disabled && styles.disabled,
        ]}>
        <Text style={[styles.label, { color: palette.text }]}>
          {LABELS[difficulty]}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  label: { ...typography.label },
});
