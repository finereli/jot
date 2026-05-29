import type { Fingerprint } from './types';

export const TEXT_CAP = 300; // max chars we store/match on
export const LABEL_CAP = 100; // max chars for display label

export function normText(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, TEXT_CAP);
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// Origin-local identity key.  is a separator that won't appear in text.
export function fpKey(fp: Fingerprint): string {
  return `${fp.tag}${fp.text}${fp.index}`;
}
