import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { FlashCard, type FlashCardFace } from '@/components/FlashCard';
import { DifficultyButtons } from '@/components/DifficultyButtons';
import { ProgressHeader } from '@/components/ProgressHeader';
import { useSession } from '@/hooks/useSession';
import type { Pos, SessionItem, Settings, VocabEntry } from '@/types';
import { colors, radius, spacing, typography } from '@/theme';

export interface SessionScreenProps {
  entries: readonly VocabEntry[];
  settings: Settings;
  onOpenSettings: () => void;
}

const POS_LABEL: Record<Pos, string> = {
  noun: 'noun',
  verb: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  prep: 'preposition',
  conj: 'conjunction',
  expr: 'expression',
};

function buildFaces(item: SessionItem): { front: FlashCardFace; back: FlashCardFace } {
  const { entry, direction } = item;
  const norsk: FlashCardFace = {
    label: 'Norsk',
    text: entry.no,
    sub: entry.forms || undefined,
  };
  const english: FlashCardFace = {
    label: 'English',
    text: entry.en,
    sub: POS_LABEL[entry.pos],
  };
  return direction === 'en-no'
    ? { front: english, back: norsk }
    : { front: norsk, back: english };
}

export function SessionScreen({
  entries,
  settings,
  onOpenSettings,
}: SessionScreenProps) {
  const session = useSession(entries, settings);
  const { phase, current, remaining, stats } = session;

  const faces = useMemo(
    () => (current ? buildFaces(current) : null),
    [current],
  );

  if (phase === 'loading') {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Preparing your session…</Text>
      </Screen>
    );
  }

  if (phase === 'done' || !current || !faces) {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.doneTitle}>Ferdig! 🎉</Text>
        <Text style={styles.doneSubtitle}>Session complete.</Text>
        <View style={styles.statsCard}>
          <StatRow label="New words learned" value={`${stats.newLearned}`} />
          <StatRow label="Reviews in session" value={`${stats.reviewTotal}`} />
          <StatRow label="Total cards graded" value={`${stats.graded}`} />
        </View>
        <PrimaryButton label="Start new session" onPress={session.startNewSession} />
        <SecondaryButton label="⚙ Settings" onPress={onOpenSettings} />
        <SecondaryButton label="Reset all progress" onPress={session.resetAllProgress} />
      </Screen>
    );
  }

  const total = stats.graded + remaining;
  const progress = total > 0 ? stats.graded / total : 0;

  return (
    <Screen>
      <ProgressHeader
        progress={progress}
        remaining={remaining}
        onUndo={session.undo}
        canUndo={session.canUndo}
        onOpenSettings={onOpenSettings}
      />
      <View style={styles.cardArea}>
        <FlashCard
          front={faces.front}
          back={faces.back}
          resetKey={`${current.entry.id}-${stats.graded}`}
        />
      </View>
      <DifficultyButtons onGrade={session.grade} previews={session.previews} />
    </Screen>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text style={styles.primaryBtn} onPress={onPress} accessibilityRole="button">
      {label}
    </Text>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text style={styles.secondaryBtn} onPress={onPress} accessibilityRole="button">
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body, color: colors.textMuted, marginTop: spacing.md },
  cardArea: { flex: 1, marginVertical: spacing.lg },
  doneTitle: { ...typography.display, color: colors.text },
  doneSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  statsCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  statLabel: { ...typography.body, color: colors.textMuted },
  statValue: { ...typography.body, color: colors.text, fontWeight: '700' },
  primaryBtn: {
    ...typography.label,
    color: '#04130D',
    backgroundColor: colors.primary,
    textAlign: 'center',
    overflow: 'hidden',
    width: '100%',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  secondaryBtn: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
});
