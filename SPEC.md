# Jot — annotate any web UI, hand off to an agent

A Chrome extension that lets you attach **typed notes to specific
elements on a web page**, browse them on that page, and export them
all as structured markdown so you can paste them into an AI agent
session for processing.

The hosting web app **opts in** to being annotatable by adding
`data-jot-anchor="<stable-id>"` to any element it wants to be a target
of notes. Jot itself knows nothing about the host app — it just finds
those anchors, lets you annotate them, and produces a clean export.

---

## Why

Annotation is a great UX for "tell the agent what's wrong with this
thing" because it captures **what you were looking at when you wrote
the note**, not just the note text. Without the anchor + context, "this
is wrong" is meaningless five minutes later.

The notes are not interpreted on-page. They're a **batch directive**
you send to an agent — "here's a list of things, work through them."
Each note resolves to one of:

- A categorization / data change (the note IS the directive)
- A bug fix (the agent reproduces and patches)
- A UI improvement (the agent implements)
- A clarifying question back to you

This makes Jot a general feedback channel for any web app you build
with an AI agent co-pilot — not a domain-specific notes tool.

---

## Mental model

```
┌──────────────────────────────────────────────────────────┐
│  Host web app                                            │
│                                                          │
│   <div data-jot-anchor="event:evt_abc123"                │
│        data-jot-label="2026-05-21 Aliexpress $37">       │
│      ... the row ...                                     │
│   </div>                                                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
                       ▲                  │
                       │ inject overlay   │ read anchors
                       │                  ▼
┌──────────────────────────────────────────────────────────┐
│  Jot (Chrome extension)                                  │
│                                                          │
│   Toggle "note mode" → annotatable elements get an       │
│   outline + small icon → click to open popover →         │
│   write note → save to chrome.storage.local.             │
│                                                          │
│   Existing notes show a small dot on their anchor.       │
│   Click the extension icon → list of notes for current   │
│   page → Copy All → markdown to clipboard.               │
└──────────────────────────────────────────────────────────┘
```

---

## UX

### Note mode toggle

Floating button in the bottom-right corner of every page where the
extension is active. Click to toggle note mode on/off. Keyboard
shortcut: `Alt+J`.

When note mode is **off**, the button shows the current count of
unresolved notes on the page (e.g. `🗒 3`).

When note mode is **on**:
- Every `[data-jot-anchor]` element gets a faint blue outline on hover.
- A small pen icon (12px) appears at the top-right corner of each.
- Clicking anywhere inside an anchor opens the note popover for it.
- Pressing `Esc` exits note mode.

### Note popover

Compact card anchored next to the clicked element:

```
┌────────────────────────────────────┐
│ Note on:                           │
│   2026-05-21 Aliexpress $37        │
│   event:evt_abc123                 │
│ ────────────────────────────────── │
│ [ existing notes, if any, with ]   │
│ [ inline edit + delete            ]│
│                                    │
│ ┌──────────────────────────────┐   │
│ │ this is groceries not        │   │
│ │ shopping                     │   │
│ │                              │   │
│ └──────────────────────────────┘   │
│                          [ Save ]  │
└────────────────────────────────────┘
```

- Multi-line text input.
- Saves on `Cmd/Ctrl+Enter` or Save button. Closes on `Esc`.
- After save, the popover stays open showing the new note in the list
  so you can immediately edit / add another / move on.

### Notes browser (extension popup)

Click the toolbar extension icon. Shows:

- Header: page title, URL, count of notes on this page.
- List of notes for the **current origin + page**, ordered newest
  first. Each row: anchor label, note text (truncated), time,
  edit/delete buttons.
- A toggle: "All notes on this origin" vs "This page only".
- **Copy all** button at the bottom — copies markdown to clipboard.
- **Mark all resolved** — moves notes to a "resolved" pile (kept,
  but not exported by default).
- **Settings** link → opt out of specific origins, change keyboard
  shortcut, clear storage.

### Existing-note indicator

When note mode is **off**, each anchored element with one or more
unresolved notes shows a small unobtrusive dot at its top-right.
Hovering shows a tooltip with the first note's text. Clicking the
extension icon scrolls to and highlights that anchor.

---

## Anchoring contract (what host apps implement)

The host app adds attributes to elements it wants to be annotatable:

```html
<!-- required: stable identifier, namespaced like <type>:<id> -->
<div data-jot-anchor="event:evt_022f41a03b1a707e8de92b64">

<!-- optional but recommended: human-friendly label for the notes list -->
<div data-jot-anchor="category:personal:tom"
     data-jot-label="Personal:Tom expense category">

<!-- optional: tags/metadata as JSON-encoded object,
     surfaces in the export -->
<div data-jot-anchor="event:evt_abc"
     data-jot-meta='{"date":"2026-05-21","amount":-37.41,"ccy":"CAD"}'>
```

Recommended anchor format: `<type>:<stable-id>`. Types are entirely
up to the host app (`event`, `category`, `account`, `widget:net_worth`,
`tab:glance`, etc.). Jot makes no assumptions.

The host app is responsible for keeping anchors stable across reloads
and refactors. Notes survive page reloads as long as the anchor value
is unchanged.

If an element no longer exists when a stored note is viewed, the note
appears in the popup as an **orphan** with its anchor + last known
label, still copy-able, but no on-page dot.

---

## Data model (chrome.storage.local)

```ts
type Note = {
  id: string;           // ulid
  origin: string;       // e.g. "https://reconciler.app"
  url: string;          // full url where the note was created
  pageTitle: string;
  anchor: string;       // data-jot-anchor value
  anchorLabel: string | null;
  anchorMeta: Record<string, unknown> | null;
  text: string;
  createdAt: string;    // iso
  updatedAt: string;
  resolvedAt: string | null;
};

// chrome.storage.local key: `notes`
// shape: Note[]   (capped at a few thousand; jot warns on overflow)
```

No background sync, no remote storage. Local-only by design. v2 could
add iCloud-style sync if needed; not in MVP.

---

## Export format

`Copy all` produces markdown like this:

```markdown
# Jot notes — reconciler.app — 2026-05-29

15 unresolved notes across 4 pages.

---

## /?tab=glance · MTD

### event:evt_022f41a03b1a707e8de92b64
- **Anchor:** 2026-05-21 Aliexpress $37
- **Meta:** date=2026-05-21, amount=-37.41, ccy=CAD
- **When:** 2026-05-29 14:32

> this is groceries not shopping

### category:personal:tom
- **Anchor:** Personal:Tom expense category
- **When:** 2026-05-29 14:35

> rename this to personal:kids — we might have more kids later

---

## /?tab=reconcile
...
```

Grouping: by URL pathname+query so each "view" is its own section.
Within a view: notes in chronological order.

Includes meta when present, so an agent receiving the paste has
enough context to act without round-tripping.

---

## Implementation notes

### Stack

- **Manifest V3** Chrome extension.
- **Vanilla TypeScript** + **Vite** for build. No UI framework — the
  surface is small enough that hand-rolled DOM is faster than React/
  Svelte for this scope. (Author preference: Svelte 4 if you really
  want components. Either works.)
- No CSS framework. Inline styles + a single small stylesheet for the
  overlay. Goal: small bundle, no host-page bleed.
- Storage: `chrome.storage.local`. Wrap with a tiny typed API.
- IDs: `ulid` (sortable, no collision concerns at this scale).

### Files

```
jot/
├── manifest.json                # MV3 manifest
├── vite.config.ts
├── package.json
├── src/
│   ├── content/
│   │   ├── content.ts           # injected into pages; toggle, overlay, popover
│   │   └── content.css          # scoped overlay styles
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.ts             # notes browser + copy-all
│   │   └── popup.css
│   ├── lib/
│   │   ├── storage.ts           # chrome.storage.local typed wrapper
│   │   ├── export.ts            # notes → markdown
│   │   ├── ulid.ts              # tiny ulid impl (or import)
│   │   └── types.ts             # Note type
│   └── background.ts            # service worker (keyboard shortcut handler)
└── SPEC.md                      # this file
```

### Manifest essentials

```json
{
  "manifest_version": 3,
  "name": "Jot",
  "version": "0.1.0",
  "description": "Annotate web UI, hand off to an agent.",
  "permissions": ["storage", "activeTab", "scripting"],
  "host_permissions": ["<all_urls>"],
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["src/content/content.js"],
    "css": ["src/content/content.css"],
    "run_at": "document_idle"
  }],
  "action": { "default_popup": "src/popup/popup.html" },
  "commands": {
    "toggle-note-mode": {
      "suggested_key": { "default": "Alt+J" },
      "description": "Toggle Jot note mode"
    }
  },
  "background": { "service_worker": "src/background.js" }
}
```

### Content script behavior

On `document_idle`:
1. Inject the floating button (bottom-right). Always present, low
   opacity until hovered.
2. Subscribe to `chrome.storage.onChanged` to refresh dot indicators.
3. On note-mode toggle:
   - Add a `[data-jot-mode="on"]` attribute to `<html>` so CSS can
     style outlines + show pen icons via `[data-jot-anchor]:hover`.
   - Bind a click handler that opens the popover for the clicked
     anchor (walking up the DOM tree to find the nearest
     `[data-jot-anchor]`).
4. The popover is a single instance, repositioned per click. Renders
   existing notes + a new-note textarea. Closes on `Esc`.

### Anchor walking

```ts
function findAnchor(el: Element): { anchor: string; label: string | null; meta: any } | null {
  let cur: Element | null = el;
  while (cur && cur !== document.body) {
    const anchor = cur.getAttribute('data-jot-anchor');
    if (anchor) {
      return {
        anchor,
        label: cur.getAttribute('data-jot-label'),
        meta: safeJSON(cur.getAttribute('data-jot-meta')),
      };
    }
    cur = cur.parentElement;
  }
  return null;
}
```

### Don't bleed into the host page

- Style the floating button + popover + dots inside a Shadow DOM so
  host CSS can't touch them and vice-versa.
- The blue outline on `[data-jot-anchor]` during note mode is added
  via CSS using `outline` (not `border`) so it doesn't shift layout.

### Origin scoping

- Notes are keyed by full URL but listed/filtered by origin.
- Settings UI: per-origin toggle to disable Jot entirely on that
  domain (in case the floating button is annoying somewhere).

---

## MVP scope

In:
- Note mode toggle (button + Alt+J).
- Curated anchoring via `data-jot-anchor`.
- Create / edit / delete / resolve notes.
- Existing-note dots when mode is off.
- Popup with current-page notes list + Copy-all.
- Markdown export.
- Origin-scoped on/off.

Out (v2+):
- Free-pin notes on arbitrary screen coordinates.
- Screenshot attached to each note.
- Sync across devices.
- Team/shared notes.
- Notes on iframes (Jot only runs on the top frame for v1).
- Light/dark theme detection (use a neutral palette that works on
  both — v1 just picks one and ships).

---

## Done looks like

- I can load Jot as an unpacked extension in Chrome.
- I add `data-jot-anchor="event:evt_xyz"` to a few elements in my
  reconciler UI.
- I press `Alt+J`, see those elements highlight, click one, write a
  note, save.
- I refresh the page. The note persists. A small dot appears next to
  the element.
- I click the extension icon, see the note in the list, click Copy
  all, paste it into Claude in a new session — the markdown has
  enough context for the agent to act.
- Notes don't interfere with the host app's UI or styling.

---

## Open questions for the builder

- Should the popover support markdown formatting in the note body, or
  keep it plain text only for MVP? (Recommend: plain text. Easier
  export, less surface area.)
- Should resolved notes be exportable as a separate section or hidden
  entirely from `Copy all`? (Recommend: hidden by default; settings
  toggle to include them.)
- Should there be a "create note without anchor" affordance for
  global-page-level notes? (Recommend: yes, via a button in the
  popup; anchor stored as `page:<pathname>`.)
- Bundle size budget? (Recommend: < 50 KB gzipped for the content
  script — that's what we have right now if we stay framework-free.)
