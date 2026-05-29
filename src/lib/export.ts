import type { Note } from './types';
import { fmtTime, fmtDate, viewKey, hostOf } from './format';
import { truncate, LABEL_CAP } from './fingerprint';

/**
 * notes -> markdown for pasting into an agent session.
 * Scoped to a single origin. Grouped by view (pathname+query),
 * chronological within each view.
 */
export function exportMarkdown(
  notes: Note[],
  origin: string,
  opts: { includeResolved: boolean; nowIso: string },
): string {
  const filtered = notes
    .filter((n) => n.origin === origin)
    .filter((n) => opts.includeResolved || !n.resolvedAt);

  const groups = new Map<string, Note[]>();
  for (const n of filtered) {
    const key = viewKey(n.url);
    const arr = groups.get(key);
    if (arr) arr.push(n);
    else groups.set(key, [n]);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const lines: string[] = [];
  const word = opts.includeResolved ? 'notes' : 'unresolved notes';
  lines.push(`# Jot notes — ${hostOf(origin)} — ${fmtDate(opts.nowIso)}`);
  lines.push('');
  lines.push(
    `${filtered.length} ${word} across ${groups.size} page${groups.size === 1 ? '' : 's'}.`,
  );
  lines.push('');

  for (const [key, arr] of groups) {
    lines.push('---');
    lines.push('');
    const title = arr[0]?.pageTitle ? ` · ${arr[0].pageTitle}` : '';
    lines.push(`## ${key}${title}`);
    lines.push('');
    for (const n of arr) {
      const heading = truncate(n.anchorLabel || n.fp.text || '(element)', LABEL_CAP);
      lines.push(`### ${heading}`);
      lines.push(`- **Element:** \`<${n.fp.tag}>\``);
      // Include the full anchored text when the heading had to be truncated.
      if (n.fp.text && n.fp.text !== heading) lines.push(`- **Text:** ${n.fp.text}`);
      lines.push(`- **When:** ${fmtTime(n.createdAt)}`);
      if (n.resolvedAt) lines.push(`- **Resolved:** ${fmtTime(n.resolvedAt)}`);
      lines.push('');
      for (const textLine of n.text.split('\n')) {
        lines.push(`> ${textLine}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}
