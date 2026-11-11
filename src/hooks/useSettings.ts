import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '../types';
import { normalize, store } from '../lib/util';
import { normalizeShares } from '../lib/shares';
import { languages } from '../languages/LanguageService';
import { FAME } from '../services/TrackPicker';

export const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
export const MAX_ARTISTS = 10;

const DEFAULTS: Settings = {
  mode: 'decades',
  decades: [1970, 1980, 1990, 2000, 2010],
  languages: { en: 50, pt: 50 },
  dzPlaylist: '',
  artists: [],
  duration: 10,
  start: 'random',
  noRepeat: true,
  blockedArtists: [],
  fame: 'known',
  bingo: 'beginner',
};

/** Definições guardadas no browser, com valores inválidos ou antigos corrigidos. */
export function loadSettings(saved: Partial<Settings> = store.get<Partial<Settings>>('settings', {})): Settings {
  // Antes, "Português" incluía Portugal e Brasil: nas definições guardadas, a percentagem é repartida pelos dois.
  if ((saved.languages?.pt ?? 0) > 0 && !saved.ptSplit && !('br' in (saved.languages ?? {}))) {
    saved = { ...saved, languages: { ...saved.languages, pt: saved.languages!.pt! / 2, br: saved.languages!.pt! / 2 } };
  }
  const s: Settings = { ...DEFAULTS, ...saved, ptSplit: true };
  if (!['decades', 'playlists', 'artists'].includes(s.mode)) s.mode = DEFAULTS.mode;
  s.artists = (Array.isArray(s.artists) ? s.artists : []).filter((a) => a && a.id && a.name);
  if (!(s.fame in FAME)) s.fame = DEFAULTS.fame;
  if (!['beginner', 'expert', 'off'].includes(s.bingo)) s.bingo = DEFAULTS.bingo;
  if (!Array.isArray(s.decades) || !s.decades.length) s.decades = DEFAULTS.decades;
  const langs = Object.fromEntries(Object.entries(s.languages || {}).filter(([k]) => languages.has(k)));
  s.languages = normalizeShares(Object.keys(langs).length ? langs : DEFAULTS.languages);
  if (!Array.isArray(s.blockedArtists)) s.blockedArtists = [];
  return s;
}

export const sameName = (a: string, b: string) => normalize(a) === normalize(b);

export function useSettings() {
  const [settings, setSettings] = useState(() => loadSettings());

  useEffect(() => { store.set('settings', settings); }, [settings]);

  const update = useCallback((patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => {
    setSettings((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  }, []);

  return [settings, update] as const;
}

export type UpdateSettings = ReturnType<typeof useSettings>[1];
