import './popup.css';
import type { Note, Settings } from '../lib/types';
import {
  getNotes,
  getSettings,
  saveSettings,
  saveNotes,
  updateNote,
  deleteNote,
  clearAll,
} from '../lib/storage';
import { exportMarkdown } from '../lib/export';
import { copyText } from '../lib/clipboard';
import { fmtTime, viewKey, hostOf } from '../lib/format';

const app = document.getElementById('app')!;

let tab: chrome.tabs.Tab | undefined;
let notes: Note[] = [];
let settings: Settings;
let presentAnchors = new Set<string>();
let view: 'list' | 'settings' = 'list';

const tabUrl = () => tab?.url ?? '';
const tabOrigin = () => {
  try {
    return new URL(tabUrl()).origin;
  } catch {
    return '';
  }
};

function toast(msg: string): void {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 250);
  }, 1400);
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function isCurrentPage(n: Note): boolean {
  return pathOf(n.url) === pathOf(tabUrl());
}

// All unresolved notes for the current origin (scheme + host + port).
// Current-page notes first, then newest-first. We never scope away notes —
// the list mirrors what Copy all exports, so nothing can look "missing".
function visibleNotes(): Note[] {
  const origin = tabOrigin();
  return notes
    .filter((n) => n.origin === origin && !n.resolvedAt)
    .sort((a, b) => {
      const ca = isCurrentPage(a) ? 1 : 0;
      const cb = isCurrentPage(b) ? 1 : 0;
      if (ca !== cb) return cb - ca; // current page first
      return b.createdAt.localeCompare(a.createdAt);
    });
}

async function reload(): Promise<void> {
  notes = await getNotes();
  render();
}

// ---------------------------------------------------------------- elements
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function iconBtn(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', 'icon', label);
  b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

// ------------------------------------------------------------- list render
function renderList(): void {
  app.innerHTML = '';

  const head = el('div', 'head');
  head.appendChild(el('div', 'title', tab?.title || 'Untitled'));
  head.appendChild(el('div', 'url', tabUrl()));

  const sub = el('div', 'sub');
  const vis = visibleNotes();
  sub.appendChild(
    el('span', 'count', `${vis.length} note${vis.length === 1 ? '' : 's'} · ${hostOf(tabOrigin())}`),
  );
  head.appendChild(sub);
  app.appendChild(head);

  const list = el('div', 'list');
  if (!vis.length) {
    list.appendChild(el('div', 'empty', 'No notes on this site yet. Press Alt+J to add some.'));
  } else {
    for (const n of vis) list.appendChild(renderNote(n));
  }
  app.appendChild(list);

  app.appendChild(renderFooter(vis.length));
}

function renderNote(n: Note): HTMLElement {
  const card = el('div', 'note');
  const onPage = isCurrentPage(n);

  // "orphan" only means something on the page the note belongs to.
  const isOrphan = onPage && presentAnchors.size > 0 && !presentAnchors.has(n.anchor);
  const label = el('div', 'label' + (isOrphan || !onPage ? ' orphan' : ''), n.anchorLabel || n.anchor);
  if (isOrphan) {
    label.appendChild(el('span', 'badge', 'orphan'));
  } else if (onPage) {
    label.title = 'Scroll to this element';
    label.addEventListener('click', () => {
      if (tab?.id != null) {
        chrome.tabs.sendMessage(tab.id, { type: 'jot:scrollTo', fp: n.fp }).catch(() => {});
        window.close();
      }
    });
  }
  card.appendChild(label);

  card.appendChild(el('div', 'text', n.text));

  // Show which page an off-current-page note lives on.
  if (!onPage) {
    card.appendChild(el('div', 'page', viewKey(n.url)));
  }

  const row = el('div', 'row');
  row.appendChild(el('span', 'when', fmtTime(n.createdAt)));
  const acts = el('div', 'acts');
  acts.appendChild(
    iconBtn('✎', 'Edit', () => startEdit(card, n)),
  );
  acts.appendChild(
    iconBtn('✓', 'Resolve', async () => {
      await updateNote(n.id, { resolvedAt: new Date().toISOString() });
      await reload();
    }),
  );
  acts.appendChild(
    iconBtn('🗑', 'Delete', async () => {
      await deleteNote(n.id);
      await reload();
    }),
  );
  row.appendChild(acts);
  card.appendChild(row);
  return card;
}

function startEdit(card: HTMLElement, n: Note): void {
  card.innerHTML = '';
  const ta = el('textarea');
  ta.value = n.text;
  ta.style.cssText =
    'width:100%;min-height:54px;border:1px solid var(--line);border-radius:8px;padding:8px;font:13px/1.4 system-ui,sans-serif;resize:vertical;background:var(--bg);color:var(--ink);';
  card.appendChild(ta);
  const row = el('div', 'row');
  const acts = el('div', 'acts');
  acts.appendChild(
    iconBtn('✔', 'Save', async () => {
      const v = ta.value.trim();
      if (v) await updateNote(n.id, { text: v });
      await reload();
    }),
  );
  acts.appendChild(iconBtn('✕', 'Cancel', () => render()));
  row.appendChild(el('span', 'when', ''));
  row.appendChild(acts);
  card.appendChild(row);
  ta.focus();
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      const v = ta.value.trim();
      if (v) updateNote(n.id, { text: v }).then(reload);
    }
  });
}

function renderFooter(visCount: number): HTMLElement {
  const foot = el('div', 'foot');

  const btns = el('div', 'btns');
  const copyBtn = el('button', 'btn primary', 'Copy all');
  copyBtn.addEventListener('click', async () => {
    const md = exportMarkdown(notes, tabOrigin(), {
      includeResolved: settings.includeResolvedInExport,
      nowIso: new Date().toISOString(),
    });
    const ok = await copyText(md);
    toast(ok ? 'Copied to clipboard' : 'Copy failed');
  });
  const resolveBtn = el('button', 'btn', 'Mark all resolved');
  resolveBtn.disabled = visCount === 0;
  resolveBtn.addEventListener('click', async () => {
    const now = new Date().toISOString();
    const ids = new Set(visibleNotes().map((n) => n.id));
    notes = notes.map((n) => (ids.has(n.id) ? { ...n, resolvedAt: now, updatedAt: now } : n));
    await saveNotes(notes);
    await reload();
  });
  btns.append(copyBtn, resolveBtn);
  foot.appendChild(btns);

  const linkrow = el('div', 'linkrow');
  linkrow.style.justifyContent = 'flex-end';
  const settingsLink = el('button', 'link', 'Settings');
  settingsLink.addEventListener('click', () => {
    view = 'settings';
    render();
  });
  linkrow.append(settingsLink);
  foot.appendChild(linkrow);

  return foot;
}

// --------------------------------------------------------- settings render
function renderSettings(): void {
  app.innerHTML = '';
  const wrap = el('div', 'settings');
  wrap.appendChild(el('h2', undefined, 'Settings'));

  const origin = tabOrigin();
  const disabled = settings.disabledOrigins.includes(origin);

  // include resolved in export
  const optResolved = el('label', 'opt');
  const cbResolved = el('input');
  cbResolved.type = 'checkbox';
  cbResolved.checked = settings.includeResolvedInExport;
  cbResolved.addEventListener('change', async () => {
    settings.includeResolvedInExport = cbResolved.checked;
    await saveSettings(settings);
  });
  optResolved.append(cbResolved, document.createTextNode('Include resolved notes in Copy all'));
  wrap.appendChild(optResolved);

  // show floating button
  const optFab = el('label', 'opt');
  const cbFab = el('input');
  cbFab.type = 'checkbox';
  cbFab.checked = settings.showFab;
  cbFab.addEventListener('change', async () => {
    settings.showFab = cbFab.checked;
    await saveSettings(settings);
  });
  optFab.append(cbFab, document.createTextNode('Show floating button on pages'));
  wrap.appendChild(optFab);

  // disable origin
  const optOrigin = el('label', 'opt');
  const cbOrigin = el('input');
  cbOrigin.type = 'checkbox';
  cbOrigin.checked = disabled;
  cbOrigin.addEventListener('change', async () => {
    const set = new Set(settings.disabledOrigins);
    if (cbOrigin.checked) set.add(origin);
    else set.delete(origin);
    settings.disabledOrigins = [...set];
    await saveSettings(settings);
    toast(cbOrigin.checked ? 'Jot disabled here (reload page)' : 'Jot enabled here (reload page)');
  });
  optOrigin.append(
    cbOrigin,
    document.createTextNode(`Disable Jot on ${hostOf(origin) || 'this origin'}`),
  );
  wrap.appendChild(optOrigin);

  // change shortcut
  const shortcutBtn = el('button', 'btn', 'Change keyboard shortcut');
  shortcutBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
  wrap.appendChild(shortcutBtn);

  // clear storage
  const clearBtn = el('button', 'btn danger', 'Clear all Jot data');
  clearBtn.addEventListener('click', async () => {
    if (confirm('Delete ALL notes and settings? This cannot be undone.')) {
      await clearAll();
      settings = await getSettings();
      await reload();
      toast('All data cleared');
    }
  });
  wrap.appendChild(clearBtn);

  const back = el('button', 'link', '← Back to notes');
  back.addEventListener('click', () => {
    view = 'list';
    render();
  });
  wrap.appendChild(back);

  app.appendChild(wrap);
}

function render(): void {
  if (view === 'settings') renderSettings();
  else renderList();
}

// ------------------------------------------------------------------- init
async function init(): Promise<void> {
  // Paint as soon as we have notes + settings; don't block on the content
  // script round-trip (that was the slow part on open).
  [[tab], notes, settings] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    getNotes(),
    getSettings(),
  ]);
  render();

  // Fetch present anchors in the background, then re-render orphan badges.
  if (tab?.id != null) {
    chrome.tabs
      .sendMessage(tab.id, { type: 'jot:getAnchors' })
      .then((res) => {
        presentAnchors = new Set((res?.anchors as string[]) ?? []);
        render();
      })
      .catch(() => {
        /* no content script here (e.g. chrome:// page) */
      });
  }
}

void init();
