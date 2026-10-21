import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
const expected = {
  ink: '#0f1b2d',
  navy: '#16263f',
  panel: '#1f3557',
  teal: '#2ec4b6',
  orange: '#ff9f1c',
  cream: '#fdf0d5',
  magenta: '#ef476f',
  lime: '#a7e05a',
  grey: '#8aa0b8',
  paper: '#fffaf0',
  'teal-ink': '#0e7c72',
  'orange-ink': '#b35c00',
  'magenta-ink': '#c2185b',
  'lime-ink': '#3f7a1a',
  'grey-ink': '#4a5d75',
};
const css = readFileSync('src/styles/tokens.css', 'utf8');
const actual = Object.fromEntries(
  [...css.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [
    m[1],
    m[2].toLowerCase(),
  ]),
);
function luminance(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((v) => {
      const s = parseInt(v, 16) / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const x = luminance(actual[a]),
    y = luminance(actual[b]);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
describe('palette and accessibility', () => {
  it('matches every supplied palette value', () =>
    expect(actual).toEqual(expected));
  const canonical = '../studio/src/constants/palette.ts';
  it('matches the studio palette or its supplied Notion fixture', () => {
    const source = readFileSync(
      existsSync(canonical) ? canonical : 'tests/fixtures/studio-palette.ts',
      'utf8',
    ).toLowerCase();
    for (const [name, hex] of Object.entries(expected).slice(0, 9)) {
      expect(source).toMatch(new RegExp(`\\b${name}\\s*:\\s*['"]${hex}['"]`));
      expect(actual[name]).toBe(hex);
    }
  });
  const pairs = [
    ['cream', 'navy'],
    ['cream', 'panel'],
    ['grey', 'navy'],
    ['grey', 'panel'],
    ['teal', 'navy'],
    ['teal', 'panel'],
    ['ink', 'orange'],
    ['ink', 'teal'],
    ['ink', 'magenta'],
    ['ink', 'lime'],
    ['ink', 'grey'],
    ['ink', 'paper'],
    ['ink', 'cream'],
    ['grey-ink', 'paper'],
    ['grey-ink', 'cream'],
    ['teal-ink', 'paper'],
  ];
  for (const [fg, bg] of pairs)
    it(`${fg} on ${bg} passes normal text contrast`, () =>
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5));
  for (const [fg, bg] of [
    ['grey', 'navy'],
    ['grey', 'panel'],
    ['grey-ink', 'paper'],
    ['grey-ink', 'cream'],
    ['teal', 'panel'],
    ['teal-ink', 'cream'],
  ])
    it(`${fg} on ${bg} passes control/focus contrast`, () =>
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3));
});
