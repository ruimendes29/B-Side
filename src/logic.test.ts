import { describe, expect, it } from 'vitest';
import type { Track } from './types';
import { languages } from './languages/LanguageService';
import { addShare, languageShares, removeShare, setShare } from './lib/shares';
import { BlockList } from './services/BlockList';
import { chorusFromLyrics } from './services/LyricsService';
import { ARTIST_SIDES, SIDES } from './categories/sides';
import { DecadeCategory, YearWindowCategory, looksLikeSeveral } from './categories/Category';

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
    expect(new YearWindowCategory(3, '').answer(track())).toBe('Vale de 1984 a 1990');
    expect(new DecadeCategory('').answer(track({ year: 2004 }))).toBe('Anos 2000');
    expect(new DecadeCategory('').answer(track({ year: null }))).toBe('Ano desconhecido');
    expect(looksLikeSeveral('Earth, Wind & Fire', 'September')).toBe(true);
  });
  it('draws only categories the track supports in artist mode', () => {
    const facts = { source: 'A', albumName: 'X', albumOrder: 1, studioTitles: ['X'], pivot: 1987, trackNo: null, chorus: null };
    const t = track({ facts });
    const ctx = { artistNames: ['A'] };
    const keys = new Set(Array.from({ length: 50 }, () => ARTIST_SIDES.beginner.draw(ctx, t)!.key));
    expect([...keys].sort()).toEqual(['near3', 'title']);
    expect(ARTIST_SIDES.expert.categories(ctx).map((c) => c.key)).toContain('track_no');
    expect(ARTIST_SIDES.expert.categories({ artistNames: ['A', 'B'] }).map((c) => c.key)).toContain('artist_pick');
    expect(SIDES.beginner.categories(ctx)).toHaveLength(5);
  });
});

describe('chorus', () => {
  it('hides the end of the most repeated line', () => {
    const text = 'first verse line here\nla la sing it loud now\nanother verse line here\nla la sing it loud now';
    expect(chorusFromLyrics(text)).toEqual({ shown: 'la la sing it', hidden: ['loud', 'now'] });
    expect(chorusFromLyrics('one two three four\nfive six seven eight')).toBeNull();
  });
});
