<img src="logos/export/logo.svg" alt="Jot" width="96" align="left" hspace="16" />

# Jot

**Show, don't tell** - the fastest way to tell an AI agent what's wrong with the
app it built is to point at the broken thing, not describe it from memory. Jot is
a Chrome extension that turns any element on any page into a note: press Alt+J,
click what's off, type the fix, and it remembers each spot by its text so notes
survive a reload, then exports the whole pile as clean markdown to paste into an
agent session. No markup and no setup - it works on any web app, and every note
carries the context of what you were looking at, not just what you wrote.

<br clear="left" />

See [SPEC.md](./SPEC.md) for the original design (note: anchoring pivoted from
opt-in `data-jot-anchor` attributes to the picker + fingerprint model below).

## Develop / build

```sh
npm install
npm run build      # -> dist/  (typecheck + vite build)
npm run dev        # vite dev server with HMR
```

## Load in Chrome

1. `npm run build`
2. Go to `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the `dist/` folder.
4. Open any page (try `demo/index.html`), press **Alt+J**.

## Usage

- **Alt+J** or the floating button toggles note mode.
- In note mode the page enters "pick an element" mode: a highlight follows your
  cursor (snapped to the nearest sensible block). **Click** an element to add a
  note. **Enter** saves, **Shift+Enter** adds a line, **Esc** exits.
- A copy button appears by the floating button to grab all notes at once.
- Out of note mode, elements with unresolved notes show a small 🗒 icon; hover
  it to read the note, click it to open/edit.
- Click the toolbar icon for the notes browser: scope to this page or the whole
  site, edit/resolve/delete, and **Copy all** → markdown.
- Settings (in the popup): include resolved notes in export, hide the floating
  button, disable Jot per site, change the shortcut, clear all data.

## How anchoring works

Each note stores a fingerprint of its target element:

- `tag` — the element's tag name (`div`, `tr`, `span`, …)
- `text` — its normalized visible text (whitespace-collapsed, capped)
- `index` — which occurrence, when several elements share the same tag + text

On reload Jot re-finds the element by matching tag + text. This survives DOM
reordering and class/style changes; it can't follow an element whose **text**
changes (the text *is* the identity). When the element can't be found, the note
becomes an **orphan** — still listed and exportable, just without an on-page icon.
