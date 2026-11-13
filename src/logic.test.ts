import { describe, expect, it } from 'vitest';
import type { Track } from './types';
import { languages } from './languages/LanguageService';
import { addShare, languageShares, removeShare, setShare } from './lib/shares';
import { BlockList } from './services/BlockList';
import { chorusFromLyrics } from './services/LyricsService';
import { cleanDecoys, decoyPrompt } from './services/TitleDecoyService';
import { ARTIST_SIDES, SIDES } from './categories/sides';
import { AgeCategory, BeforeYearCategory, HalfDecadeCategory, PopularityCategory, YearWindowCategory, pivotYear } from './categories/Category';

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
    expect(new HalfDecadeCategory('blue').answer(track({ year: 2004 }))).toBe('Início dos anos 2000 (2004)');
    expect(new HalfDecadeCategory('blue').answer(track())).toBe('Fim dos anos 80 (1987)');
    expect(new HalfDecadeCategory('blue').answer(track({ year: null }))).toBe('Ano desconhecido');
  });
  it('draws only categories the track supports in artist mode', () => {
    const facts = { source: 'A', albumName: 'X', albumOrder: 1, studioTitles: ['X'], pivot: 1987, born: null, group: null, rival: null };
    const t = track({ facts, chorus: null });
    const ctx = { artistNames: ['A'], decades: [] };
    const keys = new Set(Array.from({ length: 50 }, () => ARTIST_SIDES.beginner.draw(ctx, t)!.key));
    expect([...keys].sort()).toEqual(['near3']);
    expect(SIDES.beginner.categories(ctx)).toHaveLength(5);
  });
  it('keeps the same question per colour, tighter on side B', () => {
    for (const sides of [SIDES, ARTIST_SIDES]) {
      const ctx = { artistNames: [], decades: [] };
      const tones = (k: 'beginner' | 'expert') => sides[k].categories(ctx).map((c) => c.tone);
      expect(tones('expert')).toEqual(tones('beginner'));
    }
  });
  it('asks the artist age and compares popularity', () => {
    const facts = { source: 'Xutos', albumName: 'X', albumOrder: 1, studioTitles: ['X'], pivot: 1987, born: 1978, group: true, rival: { title: 'Contentores', rank: 500 } };
    const t = track({ facts, rank: 900 });
    const age = new AgeCategory(2, 'orange');
    expect(age.question(t).ask).toBe('Há quantos anos existiam os Xutos quando saiu? Vale ±2.');
    expect(age.answer(t)).toBe('9 anos (desde 1978)');
    expect(age.isAvailable(track({ facts: { ...facts, born: null } }))).toBe(false);
    const pop = new PopularityCategory('blue');
    expect(pop.question(t).ask).toBe('É mais ou menos famosa do que «Contentores»?');
    expect(pop.answer(t)).toBe('Mais famosa do que «Contentores»');
    expect(pop.isAvailable(track({ facts: { ...facts, rival: null }, rank: 900 }))).toBe(false);
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
  it('offers "Quem canta?" on side A', async () => {
    const h = (artist: string, lang: 'pt' | 'en' = 'pt') => ({ artist, lang });
    const choice = SIDES.beginner.categories({ artistNames: [], decades: [1980] }).find((c) => c.key === 'artist_choice')!;
    const t = track({ artists: ['Xutos & Pontapés'], lang: 'pt' });
    // Só um artista diferente na mesma língua (o dueto com o próprio e o inglês não contam): não serve.
    const few = { artistNames: [], decades: [1980], pastArtists: [h('Rui Veloso'), h('Xutos & Pontapés'), h('Madonna', 'en')] };
    expect(choice.isAvailable(t, few)).toBe(false);
    const ok = { ...few, pastArtists: [...few.pastArtists, h('GNR'), h('GNR')] };
    const q = await choice.question(t, ok);
    expect([...q.options!].sort()).toEqual(['GNR', 'Rui Veloso', 'Xutos & Pontapés']);
    expect(choice.answer(t, ok)).toBe('Xutos & Pontapés');
  });
  it('draws lyrics twice as often as the others', async () => {
    const chorus = { shown: 'a b', hidden: ['c', 'd'] };
    const ctx = { artistNames: [], decades: [] };
    // 5 categorias, a letra com peso 2: total 6; rng 0.99 cai na letra (última).
    expect(SIDES.expert.draw(ctx, track({ chorus }), () => 0.99)!.key).toBe('chorus');
    expect(SIDES.expert.draw(ctx, track({ chorus }), () => 4.5 / 6)!.key).toBe('chorus');
    expect(SIDES.expert.draw(ctx, track({ chorus: null }), () => 0.99)!.key).not.toBe('chorus');
    const q = await SIDES.expert.categories(ctx).find((c) => c.key === 'chorus')!.question(track({ chorus }), ctx);
    expect(q.lyric).toEqual(chorus);
  });
});

describe('chorus', () => {
  it('hides the end of the most repeated line', () => {
    const text = 'first verse line here\nla la sing it loud now!\nanother verse line here\nla la sing it loud now';
    expect(chorusFromLyrics(text)).toEqual({ shown: 'la la sing it', hidden: ['loud', 'now'] });
    expect(chorusFromLyrics('one two three four\nfive six seven eight')).toBeNull();
    expect(chorusFromLyrics("It's getting hot in here (so hot)\nverse one two three\nIt's getting hot in here (so hot)"))
      .toEqual({ shown: "It's getting hot", hidden: ['in', 'here'] });
  });
});

describe('settings', () => {
  it('keeps the side saved under the old "bingo" key', async () => {
    const { loadSettings } = await import('./hooks/useSettings');
    expect(loadSettings({ bingo: 'expert' } as never).side).toBe('expert');
    expect(loadSettings({}).side).toBe('beginner');
    expect(loadSettings({ side: 'off' } as never).side).toBe('beginner');
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

describe('multiplayer', () => {
  it('never sends the hidden lyric words to the phones', async () => {
    const { publicCategory } = await import('./multiplayer/roundCategory');
    const view = { key: 'chorus', name: 'Completar o refrão', color: 'var(--cat-purple)', ask: '?', lyric: { shown: 'la la', hidden: ['loud', 'now'] } };
    const pub = publicCategory(view);
    expect(pub).toEqual({ name: 'Completar o refrão', color: 'var(--cat-purple)', ask: '?', lyric: { shown: 'la la', blanks: 2 } });
    expect(JSON.stringify(pub)).not.toContain('loud');
  });
});

describe('title decoys', () => {
  it('keeps three distinct fake titles that are not the real one', () => {
    expect(cleanDecoys('Chuva', ['chuva', '"Chuva Miúda"', 'Chuva Miuda', 'Sol', 3, '', 'Trovoada', 'Extra'])).toEqual(['Chuva Miúda', 'Sol', 'Trovoada']);
    expect(cleanDecoys('X', 'nope')).toEqual([]);
    expect(decoyPrompt({ title: 'Chuva', artists: ['Mariza'], year: 2004, lang: 'pt' })).toContain('European Portuguese');
  });
});

describe('scoring', () => {
  it('counts approvals against rejections, ignoring self-votes', async () => {
    const { tally, roundWinners } = await import('./multiplayer/roundCategory');
    const votes = { a: { b: true, c: false, a: true }, b: { c: false }, c: { b: true } };
    expect(tally('b', votes)).toEqual({ approve: 2, reject: 0, ok: true });
    expect(tally('c', votes)).toEqual({ approve: 0, reject: 2, ok: false });
    expect(tally('a', votes).ok).toBe(false); // ninguém votou: não ganha
    const cat = { name: 'x', color: 'c', ask: 'q' };
    const round = { n: 2, revealed: true, cat, answer: 'Y', answered: { b: true, c: true } as Record<string, true> };
    expect(roundWinners(round, {}, votes)).toEqual(['b']);
    expect(roundWinners({ ...round, revealed: false }, {}, votes)).toEqual([]);
    const choice = { ...round, cat: { ...cat, options: ['X', 'Y', 'Z'] } };
    const answers = { a: { round: 2, choice: 1 }, b: { round: 2, choice: 0 }, c: { round: 1, choice: 1 } };
    expect(roundWinners(choice, answers, votes)).toEqual(['a']);
  });
});
