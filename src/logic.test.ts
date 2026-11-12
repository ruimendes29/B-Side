import { describe, expect, it } from 'vitest';
import type { Track } from './types';
import { languages } from './languages/LanguageService';
import { addShare, languageShares, removeShare, setShare } from './lib/shares';
import { BlockList } from './services/BlockList';
import { chorusFromLyrics } from './services/LyricsService';
import { ARTIST_SIDES, SIDES } from './categories/sides';
import { BeforeYearCategory, DecadeCategory, YearWindowCategory, looksLikeSeveral, pivotYear } from './categories/Category';

const track = (over: Partial<Track> = {}): Track => ({
  id: 'dz1', deezerId: 1, title: 'Song', artists: ['Artist'], year: 1987, yearPromise: Promise.resolve(1987), preview: '', ...over,
});

describe('languages', () => {
  it('detects clear titles only', () => {
    expect(languages.detect('O meu amor é para sempre')).toBe('pt');
    expect(languages.detect('Hello')).toBeNull();
  });
  it('separates Portugal and Brazil by country', () => {
    expect(languages.titleConfirms('pt', 'O meu amor é para sempre')).toBe(false);
    expect(languages.artistFits('pt', 'PT')).toBe(true);
    expect(languages.artistFits('pt', 'BR')).toBe(false);
    expect(languages.artistFits('pt', null)).toBe(false);
    expect(languages.artistFits('en', 'SE')).toBe(true);
    expect(languages.artistFits('en', 'ES')).toBe(false);
  });
});

describe('shares', () => {
  it('always sums to 100', () => {
    const s = addShare({ en: 50, pt: 50 }, 'br');
    expect(languageShares(s).reduce((a, l) => a + l.pct, 0)).toBe(100);
    expect(Math.round(s.br!)).toBe(33);
    expect(setShare(s, 'en', 100)).toMatchObject({ en: 100, pt: 0, br: 0 });
    expect(removeShare({ en: 50, pt: 25, br: 25 }, 'en')).toEqual({ pt: 50, br: 50 });
  });
});

describe('BlockList', () => {
  it('catches duets, feat. and connector words', () => {
    const b = new BlockList(['Shakira', 'Xutos & Pontapés']);
    expect(b.has('Shakira & Wyclef Jean')).toBe(true);
    expect(b.has('Pitbull', 'Rain Over Me (feat. Shakira)')).toBe(true);
    expect(b.has('Xutos e Pontapés')).toBe(true);
    expect(b.has('Rui Veloso')).toBe(false);
  });
});

describe('categories', () => {
  it('answers year categories', () => {
    expect(new YearWindowCategory(3, 'purple').answer(track())).toBe('Vale de 1984 a 1990');
    expect(new DecadeCategory('orange').answer(track({ year: 2004 }))).toBe('Anos 2000');
    expect(new DecadeCategory('orange').answer(track({ year: null }))).toBe('Ano desconhecido');
    expect(looksLikeSeveral('Earth, Wind & Fire', 'September')).toBe(true);
  });
  it('draws only categories the track supports in artist mode', () => {
    const facts = { source: 'A', albumName: 'X', albumOrder: 1, studioTitles: ['X'], pivot: 1987, trackNo: null };
    const t = track({ facts, chorus: null });
    const ctx = { artistNames: ['A'], decades: [] };
    const keys = new Set(Array.from({ length: 50 }, () => ARTIST_SIDES.beginner.draw(ctx, t)!.key));
    expect([...keys].sort()).toEqual(['near3', 'title']);
    expect(ARTIST_SIDES.expert.categories(ctx).map((c) => c.key)).toContain('track_no');
    expect(ARTIST_SIDES.expert.categories({ artistNames: ['A', 'B'], decades: [] }).map((c) => c.key)).toContain('artist_pick');
    expect(SIDES.beginner.categories(ctx)).toHaveLength(5);
  });
  it('splits the chosen decades for "before"', () => {
    expect(pivotYear([1970, 1980, 1990, 2000, 2010])).toBe(2000);
    expect(pivotYear([1990, 1980])).toBe(1990);
    expect(pivotYear([1980])).toBe(1985);
    expect(pivotYear([])).toBe(2000);
    const before = new BeforeYearCategory('yellow');
    const ctx = { artistNames: [], decades: [1980, 1990] };
    expect(before.question(track(), ctx).ask).toBe('Saiu antes de 1990? Sim ou não.');
    expect(before.answer(track({ year: 1992 }), ctx)).toBe('Não, 1990 ou depois');
  });
  it('swaps "Década" for "Quem canta?" with 3 decades or fewer', () => {
    const keys = (decades: number[]) => SIDES.beginner.categories({ artistNames: [], decades }).map((c) => c.key);
    expect(keys([1980, 1990])).toContain('artist_choice');
    expect(keys([1980, 1990])).not.toContain('decade');
    expect(keys([1970, 1980, 1990, 2000])).toContain('decade');
    expect(keys([])).toContain('decade'); // playlist
    const h = (artist: string, lang: 'pt' | 'en' = 'pt') => ({ artist, lang });
    const choice = SIDES.beginner.categories({ artistNames: [], decades: [1980] }).find((c) => c.key === 'artist_choice')!;
    const t = track({ artists: ['Xutos & Pontapés'], lang: 'pt' });
    // Só um artista diferente na mesma língua (o dueto com o próprio e o inglês não contam): não serve.
    const few = { artistNames: [], decades: [1980], pastArtists: [h('Rui Veloso'), h('Xutos & Pontapés'), h('Madonna', 'en')] };
    expect(choice.isAvailable(t, few)).toBe(false);
    const ok = { ...few, pastArtists: [...few.pastArtists, h('GNR'), h('GNR')] };
    const q = choice.question(t, ok);
    expect([...q.options!].sort()).toEqual(['GNR', 'Rui Veloso', 'Xutos & Pontapés']);
    expect(choice.answer(t, ok)).toBe('Xutos & Pontapés');
  });
  it('draws lyrics twice as often as the others', () => {
    const chorus = { shown: 'a b', hidden: ['c', 'd'] };
    const ctx = { artistNames: [], decades: [] };
    // 5 categorias, a letra com peso 2: total 6; rng 0.99 cai na letra (última).
    expect(SIDES.expert.draw(ctx, track({ chorus }), () => 0.99)!.key).toBe('chorus');
    expect(SIDES.expert.draw(ctx, track({ chorus }), () => 4.5 / 6)!.key).toBe('chorus');
    expect(SIDES.expert.draw(ctx, track({ chorus: null }), () => 0.99)!.key).not.toBe('chorus');
    const q = SIDES.expert.categories(ctx).find((c) => c.key === 'chorus')!.question(track({ chorus }), ctx);
    expect(q).toEqual({ ask: '«a b ____ ____»' });
  });
});

describe('chorus', () => {
  it('hides the end of the most repeated line', () => {
    const text = 'first verse line here\nla la sing it loud now!\nanother verse line here\nla la sing it loud now';
    expect(chorusFromLyrics(text)).toEqual({ shown: 'la la sing it', hidden: ['loud', 'now'] });
    expect(chorusFromLyrics('one two three four\nfive six seven eight')).toBeNull();
  });
});

describe('settings', () => {
  it('keeps the side saved under the old "bingo" key', async () => {
    const { loadSettings } = await import('./hooks/useSettings');
    expect(loadSettings({ bingo: 'expert' } as never).side).toBe('expert');
    expect(loadSettings({}).side).toBe('beginner');
  });
});

describe('tooltip placement', () => {
  it('flips below near the top and stays inside the screen', async () => {
    const { placeTooltip } = await import('./tooltips/placement');
    const viewport = { width: 375, height: 800 };
    const tip = { width: 120, height: 30 };
    expect(placeTooltip({ top: 400, bottom: 440, left: 100, width: 40 }, tip, viewport)).toEqual({ top: 362, left: 60, placement: 'top' });
    expect(placeTooltip({ top: 10, bottom: 50, left: 100, width: 40 }, tip, viewport).placement).toBe('bottom');
    expect(placeTooltip({ top: 400, bottom: 440, left: 0, width: 20 }, tip, viewport).left).toBe(8);
    expect(placeTooltip({ top: 400, bottom: 440, left: 360, width: 15 }, tip, viewport).left).toBe(247);
  });
  it('has a theme for every category colour', async () => {
    const { TOOLTIP_THEMES } = await import('./tooltips/themes');
    const { CATEGORY_TONES } = await import('./theme/colors');
    for (const t of CATEGORY_TONES) expect(TOOLTIP_THEMES[t].background).toBe(`var(--cat-${t})`);
  });
});
