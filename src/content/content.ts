import './content.css';
import type { Note, Fingerprint, Settings } from '../lib/types';
import { getNotes, addNote, updateNote, deleteNote, getSettings } from '../lib/storage';
import { exportMarkdown } from '../lib/export';
import { ulid } from '../lib/ulid';
import { copyText } from '../lib/clipboard';
import { normText, truncate, fpKey, LABEL_CAP } from '../lib/fingerprint';

const ORIGIN = location.origin;
const PAGE_URL = location.href;

type Target = { el: HTMLElement; anchor: string; label: string; fp: Fingerprint };

let noteMode = false;
let enabled = true;
let allNotes: Note[] = [];
let settings: Settings;
let popoverEl: HTMLElement | null = null;
let currentInfo: Target | null = null;
let currentPoint = { x: 0, y: 0 };
let hoverEl: HTMLElement | null = null;

// ---------------------------------------------------------------- shadow UI
const SHADOW_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483600; }
.hl {
  position: fixed; top: 0; left: 0; border: 2px solid #2563eb;
  background: rgba(37,99,235,.12); border-radius: 4px; pointer-events: none;
  display: none; transition: transform .03s linear;
}
.fab {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483601;
  font: 13px/1 system-ui, -apple-system, sans-serif;
  background: #1f2937; color: #fff; border: none; border-radius: 999px;
  padding: 10px 14px; cursor: pointer; opacity: .55;
  transition: opacity .15s ease; box-shadow: 0 2px 8px rgba(0,0,0,.25);
}
.fab:hover { opacity: 1; }
.fab.on { background: #2563eb; opacity: 1; }
.copy {
  position: fixed; right: 16px; bottom: 58px; z-index: 2147483601;
  font: 13px/1 system-ui, -apple-system, sans-serif;
  background: #2563eb; color: #fff; border: none; border-radius: 999px;
  padding: 9px 13px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.25);
}
.copy:hover { filter: brightness(1.08); }
.marker {
  position: absolute; top: 0; left: 0; pointer-events: auto; cursor: pointer;
  font: 12px/1 system-ui, sans-serif; color: #2563eb;
  background: none; border: none; padding: 0; user-select: none;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,.35));
}
.marker .ct { font-size: 10px; font-weight: 600; vertical-align: top; }
.tip {
  position: fixed; top: 0; left: 0; max-width: 260px; z-index: 2147483603;
  background: #111827; color: #fff; font: 12px/1.4 system-ui, sans-serif;
  padding: 7px 9px; border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,.35);
  pointer-events: none; white-space: pre-wrap; word-break: break-word; display: none;
}
.popover {
  position: fixed; top: 0; left: 0; width: 300px; max-height: 60vh; overflow: auto;
  z-index: 2147483602; background: #fff; color: #111827;
  border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,.22); pointer-events: auto;
  font: 13px/1.4 system-ui, -apple-system, sans-serif;
}
.ph .pl { font-weight: 600; word-break: break-word; }
.ph .pa { color: #6b7280; font-size: 11px; font-family: ui-monospace, monospace; margin-top: 2px; }
.hr { height: 1px; background: #e5e7eb; margin: 10px 0; }
.nl { display: flex; flex-direction: column; gap: 8px; }
.nr { border: 1px solid #eef0f2; border-radius: 8px; padding: 8px; background: #fafafa; }
.nr.resolved { opacity: .5; }
.nt { white-space: pre-wrap; word-break: break-word; }
.nm { color: #9ca3af; font-size: 11px; margin-top: 4px; }
.na { display: flex; gap: 6px; margin-top: 6px; }
.icon { cursor: pointer; border: none; background: #eef2ff; color: #1f2937; border-radius: 6px; padding: 2px 7px; font-size: 12px; }
.icon:hover { background: #e0e7ff; }
.ta {
  width: 100%; min-height: 62px; margin-top: 10px; padding: 8px;
  border: 1px solid #d1d5db; border-radius: 8px; resize: vertical;
  background: #fff; color: #111827;
  font: 13px/1.4 system-ui, -apple-system, sans-serif;
}
.bar { display: flex; justify-content: flex-end; margin-top: 8px; }
.btn { border: none; border-radius: 8px; padding: 6px 14px; cursor: pointer; font-size: 13px; }
.btn.primary { background: #2563eb; color: #fff; }

@media (prefers-color-scheme: dark) {
  .fab { background: #374151; }
  .marker { color: #93c5fd; }
  .tip { background: #e5e7eb; color: #111827; }
  .popover { background: #1f2937; color: #f3f4f6; border-color: #374151; box-shadow: 0 8px 30px rgba(0,0,0,.6); }
  .ph .pa { color: #9ca3af; }
  .hr { background: #374151; }
  .nr { background: #111827; border-color: #374151; }
  .nm { color: #6b7280; }
  .icon { background: #374151; color: #f3f4f6; }
  .icon:hover { background: #4b5563; }
  .ta { background: #111827; color: #f3f4f6; border-color: #4b5563; }
}
`;

const host = document.createElement('div');
host.id = '__jot_root';
host.style.cssText = 'all: initial;';
const shadow = host.attachShadow({ mode: 'open' });
shadow.appendChild(Object.assign(document.createElement('style'), { textContent: SHADOW_CSS }));

const layer = document.createElement('div');
layer.className = 'layer';
shadow.appendChild(layer);

const hl = document.createElement('div');
hl.className = 'hl';
layer.appendChild(hl);

const tip = document.createElement('div');
tip.className = 'tip';
layer.appendChild(tip);

const button = document.createElement('button');
button.className = 'fab';
shadow.appendChild(button);

const copyBtn = document.createElement('button');
copyBtn.className = 'copy';
copyBtn.textContent = 'Copy all';
copyBtn.style.display = 'none';
shadow.appendChild(copyBtn);

let markers: { el: HTMLElement; target: HTMLElement }[] = [];

// --------------------------------------------------------- fingerprinting
function elText(el: Element): string {
  return normText(el.textContent || '');
}

// Pick a sensible block to annotate: climb out of tiny inline wrappers.
function bestTarget(el: Element | null): HTMLElement | null {
  if (!el || el === host || host.contains(el)) return null;
  let cur = el as HTMLElement;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    const cs = getComputedStyle(cur);
    const r = cur.getBoundingClientRect();
    if (!cs.display.startsWith('inline') && r.height >= 16 && r.width >= 16) return cur;
    if (!cur.parentElement) break;
    cur = cur.parentElement;
  }
  return el as HTMLElement;
}

function makeFingerprint(el: HTMLElement): Fingerprint {
  const tag = el.tagName.toLowerCase();
  const text = elText(el);
  const same = Array.from(document.querySelectorAll(tag)).filter((e) => elText(e) === text);
  return { tag, text, index: Math.max(0, same.indexOf(el)) };
}

function resolveFp(fp: Fingerprint | undefined): HTMLElement | null {
  if (!fp?.tag) return null; // pre-fingerprint notes, or malformed
  const cands = Array.from(document.querySelectorAll<HTMLElement>(fp.tag)).filter(
    (e) => elText(e) === fp.text,
  );
  return cands[fp.index] ?? cands[0] ?? null;
}

function targetFromElement(el: HTMLElement): Target {
  const fp = makeFingerprint(el);
  return { el, fp, anchor: fpKey(fp), label: truncate(fp.text || `<${fp.tag}>`, LABEL_CAP) };
}

// --------------------------------------------------------------- helpers
function notesForAnchor(anchor: string): Note[] {
  return allNotes.filter((n) => n.origin === ORIGIN && n.anchor === anchor);
}
function unresolvedForAnchor(anchor: string): Note[] {
  return notesForAnchor(anchor).filter((n) => !n.resolvedAt);
}
function originNotes(): Note[] {
  return allNotes.filter((n) => n.origin === ORIGIN);
}
function fmtShort(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// --------------------------------------------------------------- chrome UI
function applyChrome(): void {
  const show = settings?.showFab !== false;
  button.style.display = show ? '' : 'none';
  copyBtn.style.display = show && noteMode ? '' : 'none';
}

function updateButton(): void {
  if (noteMode) {
    button.textContent = '✕ Jot';
    button.classList.add('on');
    return;
  }
  button.classList.remove('on');
  // Count unresolved notes that currently resolve to an element on this page.
  let count = 0;
  for (const n of originNotes()) {
    if (!n.resolvedAt && resolveFp(n.fp)) count++;
  }
  button.textContent = count > 0 ? `🗒 ${count}` : '🗒';
}

// Note-icon markers, shown in BOTH modes, positioned at the resolved element.
function renderMarkers(): void {
  for (const { el } of markers) el.remove();
  markers = [];
  tip.style.display = 'none';
  if (!enabled) return;

  // Group unresolved notes by anchor, resolve each anchor once.
  const byAnchor = new Map<string, Note[]>();
  for (const n of originNotes()) {
    if (n.resolvedAt) continue;
    const arr = byAnchor.get(n.anchor);
    if (arr) arr.push(n);
    else byAnchor.set(n.anchor, [n]);
  }

  for (const [anchor, notes] of byAnchor) {
    const el = resolveFp(notes[0].fp);
    if (!el) continue; // orphan — no on-page marker
    const m = document.createElement('div');
    m.className = 'marker';
    m.textContent = '🗒';
    if (notes.length > 1) {
      const c = document.createElement('span');
      c.className = 'ct';
      c.textContent = String(notes.length);
      m.appendChild(c);
    }
    m.addEventListener('mouseenter', () => {
      tip.textContent = unresolvedForAnchor(anchor)
        .map((n) => n.text)
        .join('\n\n');
      const r = m.getBoundingClientRect();
      tip.style.display = 'block';
      let left = r.left;
      if (left + tip.offsetWidth > window.innerWidth - 8) left = window.innerWidth - tip.offsetWidth - 8;
      let top = r.bottom + 6;
      if (top + tip.offsetHeight > window.innerHeight - 8) top = r.top - tip.offsetHeight - 6;
      tip.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
    });
    m.addEventListener('mouseleave', () => {
      tip.style.display = 'none';
    });
    m.addEventListener('click', (e) => {
      e.stopPropagation();
      openPopover(targetFromElement(el), e.clientX, e.clientY);
    });
    layer.appendChild(m);
    markers.push({ el: m, target: el });
  }
  positionMarkers();
}

function positionMarkers(): void {
  for (const { el, target } of markers) {
    const r = target.getBoundingClientRect();
    el.style.transform = `translate(${r.right - 16}px, ${r.top - 9}px)`;
  }
}

async function refresh(): Promise<void> {
  allNotes = await getNotes();
  updateButton();
  renderMarkers();
  applyChrome();
}

// ----------------------------------------------------------------- popover
function closePopover(): void {
  if (popoverEl) {
    popoverEl.remove();
    popoverEl = null;
  }
  currentInfo = null;
}

// Anchor the popover to the cursor position, clamped to the viewport.
function positionPopoverAt(card: HTMLElement, x: number, y: number): void {
  const cw = 300;
  const ch = card.offsetHeight || 220;
  let left = x + 12;
  if (left + cw > window.innerWidth - 8) left = x - cw - 12; // flip to the left
  if (left < 8) left = Math.max(8, window.innerWidth - cw - 8);
  let top = y + 12;
  if (top + ch > window.innerHeight - 8) top = y - ch - 12; // flip above
  if (top < 8) top = 8;
  card.style.transform = `translate(${left}px, ${top}px)`;
}

function makeIcon(label: string, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'icon';
  b.textContent = label;
  b.title = title;
  return b;
}

function buildNoteRow(n: Note, info: Target, card: HTMLElement): HTMLElement {
  const row = document.createElement('div');
  row.className = 'nr' + (n.resolvedAt ? ' resolved' : '');

  const txt = document.createElement('div');
  txt.className = 'nt';
  txt.textContent = n.text;

  const meta = document.createElement('div');
  meta.className = 'nm';
  meta.textContent = fmtShort(n.createdAt) + (n.resolvedAt ? ' · resolved' : '');

  const acts = document.createElement('div');
  acts.className = 'na';
  const editBtn = makeIcon('✎', 'Edit');
  const delBtn = makeIcon('🗑', 'Delete');
  acts.append(editBtn, delBtn);

  editBtn.addEventListener('click', () => {
    const ed = document.createElement('textarea');
    ed.className = 'ta';
    ed.value = n.text;
    txt.replaceWith(ed);
    ed.focus();
    acts.innerHTML = '';
    const saveBtn = makeIcon('✔', 'Save edit');
    const cancelBtn = makeIcon('✕', 'Cancel');
    acts.append(saveBtn, cancelBtn);
    const commit = async () => {
      const v = ed.value.trim();
      if (v) await updateNote(n.id, { text: v });
      await refresh();
      renderPopoverContent(card, info);
    };
    saveBtn.addEventListener('click', commit);
    cancelBtn.addEventListener('click', () => renderPopoverContent(card, info));
    ed.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit();
      }
    });
  });

  delBtn.addEventListener('click', async () => {
    await deleteNote(n.id);
    await refresh();
    renderPopoverContent(card, info);
  });

  row.append(txt, meta, acts);
  return row;
}

function renderPopoverContent(card: HTMLElement, info: Target): void {
  card.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'ph';
  const pl = document.createElement('div');
  pl.className = 'pl';
  pl.textContent = info.label;
  head.append(pl);
  card.appendChild(head);

  card.appendChild(Object.assign(document.createElement('div'), { className: 'hr' }));

  const existing = notesForAnchor(info.anchor).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  if (existing.length) {
    const list = document.createElement('div');
    list.className = 'nl';
    for (const n of existing) list.appendChild(buildNoteRow(n, info, card));
    card.appendChild(list);
  }

  const ta = document.createElement('textarea');
  ta.className = 'ta';
  ta.placeholder = 'Add a note…';
  card.appendChild(ta);

  const bar = document.createElement('div');
  bar.className = 'bar';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn primary';
  saveBtn.textContent = 'Save';
  bar.appendChild(saveBtn);
  card.appendChild(bar);

  const doSave = async () => {
    const text = ta.value.trim();
    if (!text) return;
    const now = new Date().toISOString();
    const note: Note = {
      id: ulid(),
      origin: ORIGIN,
      url: PAGE_URL,
      pageTitle: document.title,
      anchor: info.anchor,
      anchorLabel: info.label,
      fp: info.fp,
      text,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };
    await addNote(note);
    await refresh();
    closePopover(); // submitting a note closes the popover
  };

  saveBtn.addEventListener('click', doSave);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSave();
    }
  });

  positionPopoverAt(card, currentPoint.x, currentPoint.y);
  setTimeout(() => ta.focus(), 0);
}

function openPopover(info: Target, x: number, y: number): void {
  closePopover();
  hl.style.display = 'none';
  currentPoint = { x, y };
  const card = document.createElement('div');
  card.className = 'popover';
  shadow.appendChild(card);
  popoverEl = card;
  currentInfo = info;
  renderPopoverContent(card, info);
  positionPopoverAt(card, x, y);
}

// -------------------------------------------------------------- note mode
function setMode(on: boolean): void {
  noteMode = on;
  if (on) document.documentElement.setAttribute('data-jot-mode', 'on');
  else document.documentElement.removeAttribute('data-jot-mode');
  hl.style.display = 'none';
  hoverEl = null;
  if (!on) closePopover();
  updateButton();
  applyChrome();
}

async function copyAll(): Promise<void> {
  const md = exportMarkdown(allNotes, ORIGIN, {
    includeResolved: settings?.includeResolvedInExport ?? false,
    nowIso: new Date().toISOString(),
  });
  const ok = await copyText(md);
  copyBtn.textContent = ok ? '✓ Copied' : 'Copy failed';
  setTimeout(() => {
    copyBtn.textContent = 'Copy all';
  }, 1200);
}

function flash(el: HTMLElement): void {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('__jot_flash');
  setTimeout(() => el.classList.remove('__jot_flash'), 1300);
}

// --------------------------------------------------------------- listeners
function registerListeners(): void {
  button.addEventListener('click', () => setMode(!noteMode));
  copyBtn.addEventListener('click', copyAll);

  // Picker: highlight the snapped element under the cursor while in note mode.
  document.addEventListener(
    'mousemove',
    (e) => {
      if (!noteMode || popoverEl) {
        hl.style.display = 'none';
        return;
      }
      const t = bestTarget(document.elementFromPoint(e.clientX, e.clientY));
      hoverEl = t;
      if (!t) {
        hl.style.display = 'none';
        return;
      }
      const r = t.getBoundingClientRect();
      hl.style.display = 'block';
      hl.style.width = `${r.width}px`;
      hl.style.height = `${r.height}px`;
      hl.style.transform = `translate(${r.left}px, ${r.top}px)`;
    },
    true,
  );

  // Click locks the picked element and opens the popover.
  document.addEventListener(
    'click',
    (e) => {
      if (!noteMode) return;
      if (e.composedPath().includes(host)) return; // our own UI
      // A click outside an open popover dismisses it — don't open a new one.
      if (popoverEl) {
        e.preventDefault();
        e.stopPropagation();
        closePopover();
        return;
      }
      const t = bestTarget(document.elementFromPoint(e.clientX, e.clientY));
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      openPopover(targetFromElement(t), e.clientX, e.clientY);
    },
    true,
  );

  // Click outside the popover closes it (bubble). Picker/marker clicks
  // stopPropagation above, so they won't reach this.
  document.addEventListener('click', (e) => {
    if (!popoverEl) return;
    if (e.composedPath().includes(host)) return;
    closePopover();
  });

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      if (popoverEl) closePopover();
      else if (noteMode) setMode(false);
    },
    true,
  );

  let raf = 0;
  const onScrollResize = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      positionMarkers();
      tip.style.display = 'none';
      hl.style.display = 'none';
      // Popover is anchored to the cursor point (fixed), so it stays put.
    });
  };
  window.addEventListener('scroll', onScrollResize, true);
  window.addEventListener('resize', onScrollResize);

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) {
      settings = await getSettings();
      if (settings.disabledOrigins.includes(ORIGIN) && enabled) {
        enabled = false;
        host.remove();
        return;
      }
    }
    if (changes.notes || changes.settings) refresh();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'jot:toggle') {
      setMode(!noteMode);
    } else if (msg?.type === 'jot:getAnchors') {
      // Which note anchors currently resolve to an element on this page.
      const keys = new Set<string>();
      for (const n of originNotes()) if (resolveFp(n.fp)) keys.add(n.anchor);
      sendResponse({ anchors: [...keys] });
    } else if (msg?.type === 'jot:scrollTo' && msg.fp) {
      const el = resolveFp(msg.fp as Fingerprint);
      if (el) flash(el);
    } else if (msg?.type === 'jot:reload') {
      // Explicit nudge from the popup (storage.onChanged can be flaky in
      // content scripts), e.g. after a settings change.
      void (async () => {
        settings = await getSettings();
        if (settings.disabledOrigins.includes(ORIGIN) && enabled) {
          enabled = false;
          host.remove();
          return;
        }
        refresh();
      })();
    }
    return false;
  });

  let moTimer = 0;
  const mo = new MutationObserver(() => {
    clearTimeout(moTimer);
    moTimer = window.setTimeout(() => {
      updateButton();
      renderMarkers();
    }, 300);
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

// ------------------------------------------------------------------- init
async function init(): Promise<void> {
  settings = await getSettings();
  if (settings.disabledOrigins.includes(ORIGIN)) {
    enabled = false;
    return;
  }
  document.documentElement.appendChild(host);
  registerListeners();
  await refresh();
}

void init();
