// A note is anchored to an element by a text fingerprint — no host-app
// cooperation required. We re-find the element on reload by matching its
// tag + visible text (disambiguated by occurrence index).
export type Fingerprint = {
  tag: string; // lowercased tagName, e.g. "div"
  text: string; // normalized visible text (whitespace-collapsed, capped)
  index: number; // which occurrence among elements with the same tag+text
};

export type Note = {
  id: string; // ulid
  origin: string; // e.g. "https://reconciler.app"
  url: string; // full url where the note was created
  pageTitle: string;
  anchor: string; // origin-local identity key derived from the fingerprint
  anchorLabel: string; // human display text (truncated element text)
  fp: Fingerprint;
  text: string;
  createdAt: string; // iso
  updatedAt: string;
  resolvedAt: string | null;
};

export type Settings = {
  disabledOrigins: string[];
  includeResolvedInExport: boolean;
  showFab: boolean;
};
