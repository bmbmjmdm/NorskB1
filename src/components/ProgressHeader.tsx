import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

export interface ProgressHeaderProps {
  /** 0..1 fraction of the session completed. */
  progress: number;
  newLearned: number;
  newTarget: number;
  remaining: number;
  onUndo?: () => void;
  canUndo?: boolean;
  onOpenSettings?: () => void;
}

export function ProgressHeader({
  progress,
  newLearned,
  newTarget,
  remaining,
  onUndo,
  canUndo,
  onOpenSettings,
}: ProgressHeaderProps) {
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(width, {
      toValue: Math.max(0, Math.min(1, progress)),
      useNativeDriver: false,
      friction: 9,
      tension: 60,
    }).start();
  }, [progress, width]);

  const barWidth = width.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.title}>NorskB1</Text>
        <View style={styles.rightGroup}>
          {onUndo ? <UndoButton onPress={onUndo} disabled={!canUndo} /> : null}
          {onOpenSettings ? (
            <Pressable
              onPress={onOpenSettings}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              style={styles.gear}>
              <Text style={styles.gearText}>⚙</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>
          {remaining} {remaining === 1 ? 'card' : 'cards'} in queue
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: barWidth }]} />
      </View>
      <Text style={styles.caption}>
        {newLearned}/{newTarget} new words learned today
      </Text>
    </View>
  );
}

function UndoButton({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      friction: 6,
      tension: 160,
    }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animate(0.9)}
        onPressOut={() => animate(1)}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Undo last answer"
        accessibilityState={{ disabled: !!disabled }}
        style={[styles.undo, disabled && styles.undoDisabled]}>
        <Text style={styles.undoText}>↶ Undo</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rightGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  title: { ...typography.title, color: colors.text },
  meta: { ...typography.label, color: colors.textMuted },
  gear: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearText: { fontSize: 18, color: colors.text },
  undo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  undoDisabled: { opacity: 0.35 },
  undoText: { ...typography.label, color: colors.text },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  caption: { ...typography.caption, color: colors.textMuted },
});
