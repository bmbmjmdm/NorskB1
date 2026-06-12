import type { VocabEntry } from '@/types';

/**
 * Normalize a Norwegian headword for duplicate detection: lowercase, drop a
 * leading article / "å", strip parentheticals and quotes, collapse whitespace.
 */
export function normalizeHeadword(no: string): string {
  let s = no.toLowerCase().trim();
  s = s.replace(/\(.*?\)/g, '').replace(/["“”]/g, '');
  s = s.trim().replace(/^(en|ei|et|å)\s+/, '');
  return s.replace(/\s+/g, ' ').trim().replace(/^[.,/]+|[.,/]+$/g, '');
}

/**
 * Return the first existing entry whose Norwegian headword matches `no`
 * (normalized), or null. Used to block adding a duplicate flashcard.
 */
export function findByHeadword(
  entries: readonly VocabEntry[],
  no: string,
): VocabEntry | null {
  const target = normalizeHeadword(no);
  if (!target) return null;
  return entries.find(e => normalizeHeadword(e.no) === target) ?? null;
}
