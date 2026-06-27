import type { Difficulty } from '@/types';

export const colors = {
  background: '#0B0B0F',
  surface: '#16161D',
  surfaceAlt: '#1F1F2A',
  border: '#2A2A38',
  primary: '#5B8DEF',
  text: '#F5F5F7',
  textMuted: '#9A9AA5',
  shadow: '#000000',
} as const;

/** Button palette per difficulty. */
export const difficultyColors: Record<
  Difficulty,
  { base: string; text: string }
> = {
  trivial: { base: '#3FB68B', text: '#04130D' },
  easy: { base: '#6FC36B', text: '#06140A' },
  normal: { base: '#E0A92E', text: '#1A1303' },
  newHard: { base: '#E07B39', text: '#1A0C03' },
  wrong: { base: '#E5564E', text: '#1A0605' },
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 20, xl: 28, pill: 999 } as const;

export const typography = {
  display: { fontSize: 34, fontWeight: '700' as const },
  title: { fontSize: 26, fontWeight: '700' as const },
  body: { fontSize: 17, fontWeight: '400' as const },
  label: { fontSize: 14, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
} as const;
