import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DIFFICULTIES, type Difficulty, type Settings } from '@/types';
import { DEFAULT_SETTINGS } from '@/services/srs';
import type { AddCardResult } from '@/hooks/useAppConfig';
import { colors, difficultyColors, radius, spacing, typography } from '@/theme';

export interface SettingsScreenProps {
  visible: boolean;
  settings: Settings;
  onClose: () => void;
  onSave: (next: Settings) => void;
  onReset: () => void;
  onAddCard: (no: string, en: string) => AddCardResult;
}

const DIFF_LABEL: Record<Difficulty, string> = {
  trivial: 'Trivial',
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

const numOr = (s: string, fallback: number): number => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
};

export function SettingsScreen({
  visible,
  settings,
  onClose,
  onSave,
  onReset,
  onAddCard,
}: SettingsScreenProps) {
  const [enFrontPct, setEnFrontPct] = useState(75);
  const [newRepeats, setNewRepeats] = useState(1);
  const [hardClears, setHardClears] = useState(2);
  const [intervals, setIntervals] = useState(() =>
    toIntervalForm(DEFAULT_SETTINGS),
  );

  const [cardNo, setCardNo] = useState('');
  const [cardEn, setCardEn] = useState('');
  const [cardMsg, setCardMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // Re-seed the form from the current settings whenever the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setEnFrontPct(Math.round(settings.enFrontProbability * 100));
    setNewRepeats(settings.newCardRepeats);
    setHardClears(settings.hardRelearnClears);
    setIntervals(toIntervalForm(settings));
    setCardNo('');
    setCardEn('');
    setCardMsg(null);
  }, [visible, settings]);

  const buildSettings = (): Settings => {
    const built: Settings['intervals'] = { ...settings.intervals };
    for (const d of DIFFICULTIES) {
      built[d] = {
        mult: Math.max(0, numOr(intervals[d].mult, settings.intervals[d].mult)),
        floor: Math.max(
          0,
          Math.round(numOr(intervals[d].floor, settings.intervals[d].floor)),
        ),
      };
    }
    return {
      enFrontProbability: clamp(enFrontPct, 0, 100) / 100,
      intervals: built,
      newCardRepeats: clamp(Math.round(newRepeats), 0, 20),
      hardRelearnClears: clamp(Math.round(hardClears), 0, 20),
    };
  };

  const save = () => {
    onSave(buildSettings());
    onClose();
  };

  const handleAdd = () => {
    const result = onAddCard(cardNo, cardEn);
    if (result.ok) {
      setCardMsg({ ok: true, text: `Added "${result.entry!.no}".` });
      setCardNo('');
      setCardEn('');
    } else {
      setCardMsg({ ok: false, text: result.error ?? 'Could not add card.' });
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Pressable onPress={save} hitSlop={8} accessibilityRole="button">
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled">
            {/* English-front probability */}
            <Section title="Card direction">
              <Stepper
                label="English on front"
                value={enFrontPct}
                suffix="%"
                step={5}
                min={0}
                max={100}
                onChange={setEnFrontPct}
              />
              <Text style={styles.hint}>
                Chance a card shows English first; the rest show Norwegian first.
              </Text>
            </Section>

            {/* Grading intervals */}
            <Section title="Grading intervals">
              <View style={styles.tableHead}>
                <Text style={[styles.cellLabel, styles.colName]} />
                <Text style={[styles.cellHead, styles.colNum]}>floor (days)</Text>
                <Text style={[styles.cellHead, styles.colNum]}>× mult</Text>
              </View>
              {DIFFICULTIES.map(d => (
                <View key={d} style={styles.tableRow}>
                  <Text
                    style={[
                      styles.colName,
                      styles.diffName,
                      { color: difficultyColors[d].base },
                    ]}>
                    {DIFF_LABEL[d]}
                  </Text>
                  <NumInput
                    style={styles.colNum}
                    value={intervals[d].floor}
                    keyboardType="number-pad"
                    onChangeText={t =>
                      setIntervals(prev => ({
                        ...prev,
                        [d]: { ...prev[d], floor: t },
                      }))
                    }
                  />
                  <NumInput
                    style={styles.colNum}
                    value={intervals[d].mult}
                    keyboardType="decimal-pad"
                    onChangeText={t =>
                      setIntervals(prev => ({
                        ...prev,
                        [d]: { ...prev[d], mult: t },
                      }))
                    }
                  />
                </View>
              ))}
              <Text style={styles.hint}>
                Next interval = max(current × mult, floor). Hard uses mult 0 to
                reset to its floor.
              </Text>
            </Section>

            {/* Repeats before leaving the queue */}
            <Section title="Repeats before a card leaves">
              <Stepper
                label="New card — extra views"
                value={newRepeats}
                step={1}
                min={0}
                max={20}
                onChange={setNewRepeats}
              />
              <Stepper
                label="Hard card — non-hard clears"
                value={hardClears}
                step={1}
                min={0}
                max={20}
                onChange={setHardClears}
              />
              <Text style={styles.hint}>
                How many times a new card, or a card you marked hard, must come
                back in the session before it's allowed out.
              </Text>
            </Section>

            {/* Add a flashcard */}
            <Section title="Add a flashcard">
              <Text style={styles.fieldLabel}>Norwegian</Text>
              <TextInput
                style={styles.textField}
                value={cardNo}
                onChangeText={t => {
                  setCardNo(t);
                  setCardMsg(null);
                }}
                placeholder="e.g. å lære"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />
              <Text style={styles.fieldLabel}>English</Text>
              <TextInput
                style={styles.textField}
                value={cardEn}
                onChangeText={t => {
                  setCardEn(t);
                  setCardMsg(null);
                }}
                placeholder="e.g. to learn"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />
              {cardMsg ? (
                <Text style={cardMsg.ok ? styles.success : styles.error}>
                  {cardMsg.text}
                </Text>
              ) : null}
              <Pressable
                onPress={handleAdd}
                style={styles.addBtn}
                accessibilityRole="button">
                <Text style={styles.addBtnText}>Add flashcard</Text>
              </Pressable>
            </Section>

            <Pressable
              onPress={() => {
                onReset();
                onClose();
              }}
              style={styles.resetBtn}
              accessibilityRole="button">
              <Text style={styles.resetText}>Reset settings to defaults</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function toIntervalForm(s: Settings): Record<Difficulty, { mult: string; floor: string }> {
  const out = {} as Record<Difficulty, { mult: string; floor: string }>;
  for (const d of DIFFICULTIES) {
    out[d] = { mult: String(s.intervals[d].mult), floor: String(s.intervals[d].floor) };
  }
  return out;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Stepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step: number;
  min: number;
  max: number;
  suffix?: string;
}) {
  const set = (n: number) => onChange(clamp(n, min, max));
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          onPress={() => set(value - step)}
          style={styles.stepBtn}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}>
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>
          {value}
          {suffix ?? ''}
        </Text>
        <Pressable
          onPress={() => set(value + step)}
          style={styles.stepBtn}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}>
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function NumInput({
  value,
  onChangeText,
  keyboardType,
  style,
}: {
  value: string;
  onChangeText: (t: string) => void;
  keyboardType: 'number-pad' | 'decimal-pad';
  style?: object;
}) {
  return (
    <TextInput
      style={[styles.numField, style]}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      selectTextOnFocus
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.title, color: colors.text },
  done: { ...typography.label, color: colors.primary },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  stepperLabel: { ...typography.body, color: colors.text, flex: 1 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 20, color: colors.text },
  stepValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
    minWidth: 52,
    textAlign: 'center',
  },
  tableHead: { flexDirection: 'row', alignItems: 'center' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  cellHead: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  cellLabel: {},
  colName: { flex: 1.2 },
  colNum: { flex: 1, marginLeft: spacing.sm },
  diffName: { ...typography.body, fontWeight: '700' },
  numField: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    textAlign: 'center',
    ...typography.body,
  },
  fieldLabel: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },
  textField: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    ...typography.body,
  },
  error: { ...typography.caption, color: difficultyColors.hard.base, marginTop: spacing.sm },
  success: { ...typography.caption, color: difficultyColors.trivial.base, marginTop: spacing.sm },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  addBtnText: { ...typography.label, color: '#04130D' },
  resetBtn: { alignItems: 'center', paddingVertical: spacing.md },
  resetText: { ...typography.label, color: colors.textMuted },
});
