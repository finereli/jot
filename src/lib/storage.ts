import type { Note, Settings } from './types';

const NOTES_KEY = 'notes';
const SETTINGS_KEY = 'settings';

// Soft cap; jot warns past this. chrome.storage.local is ~10MB by default.
export const NOTES_CAP = 5000;

const DEFAULT_SETTINGS: Settings = {
  disabledOrigins: [],
  includeResolvedInExport: false,
  showFab: true,
};

export async function getNotes(): Promise<Note[]> {
  const res = await chrome.storage.local.get(NOTES_KEY);
  return (res[NOTES_KEY] as Note[] | undefined) ?? [];
}

export async function saveNotes(notes: Note[]): Promise<void> {
  await chrome.storage.local.set({ [NOTES_KEY]: notes });
}

export async function addNote(note: Note): Promise<void> {
  const notes = await getNotes();
  notes.push(note);
  await saveNotes(notes);
}

export async function updateNote(id: string, patch: Partial<Note>): Promise<void> {
  const notes = await getNotes();
  const idx = notes.findIndex((n) => n.id === id);
  if (idx === -1) return;
  notes[idx] = { ...notes[idx], ...patch, updatedAt: new Date().toISOString() };
  await saveNotes(notes);
}

export async function deleteNote(id: string): Promise<void> {
  const notes = await getNotes();
  await saveNotes(notes.filter((n) => n.id !== id));
}

export async function getSettings(): Promise<Settings> {
  const res = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...((res[SETTINGS_KEY] as Partial<Settings>) ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function clearAll(): Promise<void> {
  await chrome.storage.local.clear();
}
