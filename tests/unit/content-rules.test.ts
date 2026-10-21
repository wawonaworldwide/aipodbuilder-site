import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  privateBrandPresent,
  disallowedCopyPresent,
  paletteIssues,
  ownerNamePresent,
  blockedDigestPresent,
  pricePlacementIssue,
} from '../../scripts/content-rules.mjs';
import { readFileSync } from 'node:fs';
it('rejects the private brand even in alt text and links', () => {
  expect(privateBrandPresent('<img alt="MyDesigns" />')).toBe(true);
  expect(privateBrandPresent('https://MYDESIGNS.example')).toBe(true);
  expect(privateBrandPresent('Original artwork')).toBe(false);
});
it('rejects banned promotional copy while allowing the supplied honest copy', () => {
  for (const word of [
    'game-changer',
    'insane',
    'passive income',
    'secret',
    "in today's video",
    'guaranteed income',
  ])
    expect(disallowedCopyPresent(word)).toBe(true);
  expect(
    disallowedCopyPresent('No income promises. API costs are yours.'),
  ).toBe(false);
});
it('fails the build guard when a palette token drifts', () => {
  const css = readFileSync('src/styles/tokens.css', 'utf8');
  expect(paletteIssues(css, null)).toEqual([]);
  expect(paletteIssues(css.replace('#2ec4b6', '#2ec4b7'), null)).toHaveLength(
    1,
  );
});

it('rejects blocked hashes in public formats without plaintext names', () => {
  const word = 'exampleperson';
  const digests = [
    {
      length: word.length,
      sha256: createHash('sha256').update(word).digest('hex'),
    },
  ];
  for (const copy of [
    '<meta content="EXAMPLEPERSON">',
    '# ExamplePerson',
    '{"author":"ExamplePerson"}',
    '<rss>ExamplePerson</rss>',
    'prefixexamplepersonsuffix',
  ])
    expect(blockedDigestPresent(copy, digests)).toBe(true);
  expect(blockedDigestPresent('examplepersom', digests)).toBe(false);
  expect(
    ownerNamePresent('TEE-BOT (AI), human-reviewed. Wawona Worldwide.'),
  ).toBe(false);
});

it('rejects dollar prices outside Apps/product JSON/legal routes, including encoded prices', () => {
  for (const path of [
    'index.html',
    'episodes/s01/index.html',
    'prompts/s01.md',
    'blog/post/index.html',
    'llms.txt',
    'llms-full.txt',
    'rss.xml',
    'api/prompts.json',
  ]) {
    for (const amount of [
      '$24.99',
      '&#36;24.99',
      '&#x24;24.99',
      '&dollar;24.99',
      String.raw`\u002424.99`,
    ])
      expect(pricePlacementIssue(path, amount), path).toBe(true);
  }
  for (const path of [
    'apps/index.html',
    'apps/product/index.html',
    'apps/product.md',
    'api/products.json',
    'api/products/product.json',
    'refunds/index.html',
    'license.md',
  ])
    expect(pricePlacementIssue(path, '$24.99 + tax'), path).toBe(false);
  expect(
    pricePlacementIssue('episodes/s01/index.html', 'Three human gates.'),
  ).toBe(false);
});
