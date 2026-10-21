import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import matter from '../../scripts/frontmatter.mjs';
import { schemas } from '../../src/lib/schemas';
import { extractPrompt } from '../../src/lib/markdown';
const read = (kind: string, file: string) =>
  matter(readFileSync(join('src/content', kind, file), 'utf8'));
describe('seed content', () => {
  for (const [collection, schema] of Object.entries(schemas)) {
    it(`validates all ${collection} entries`, () => {
      const files = readdirSync(`src/content/${collection}`).filter((f) =>
        /\.mdx?$/.test(f),
      );
      for (const file of files)
        expect(
          schema.safeParse(read(collection, file).data).success,
          `${collection}/${file}`,
        ).toBe(true);
      if (collection === 'skills') expect(files).toHaveLength(0);
    });
  }
  it('keeps editorial seeds draft and approved legal pages final', () => {
    for (const collection of Object.keys(schemas))
      for (const file of readdirSync(`src/content/${collection}`).filter((f) =>
        /\.mdx?$/.test(f),
      )) {
        const { data } = read(collection, file);
        expect(data.status).toBe(collection === 'legal' ? 'final' : 'draft');
        if ('date_tested' in data) expect(data.date_tested).toBeNull();
        if ('result' in data) expect(data.result).toBeNull();
      }
  });
  it('preserves all three exact source prompts', () => {
    for (const id of ['e11-01-opening', 'e17-01-opening', 'e17-02-level-2']) {
      const original = readFileSync(
        'tests/fixtures/editorial/' + id + '.txt',
        'utf8',
      );
      expect(extractPrompt(read('prompts', `${id}.md`).content)).toBe(original);
    }
  });
  it('preserves the loops with approved anonymous wording and locked post body', () => {
    for (const id of ['listing-seo-loop', 'design-qa-loop'])
      expect(readFileSync(`src/content/loops/${id}.md`, 'utf8').trim()).toBe(
        readFileSync('tests/fixtures/editorial/' + id + '.txt', 'utf8').trim(),
      );
    expect(read('posts', 'meet-tee-bot.mdx').content.trim()).toBe(
      readFileSync('tests/fixtures/editorial/meet-tee-bot.txt', 'utf8').trim(),
    );
  });
  it('rejects undated results, unbounded loops, and the wrong product price', () => {
    const prompt = read('prompts', 'e11-01-opening.md').data;
    expect(
      schemas.prompts.safeParse({ ...prompt, result: 'worked' }).success,
    ).toBe(false);
    expect(
      schemas.prompts.safeParse({ ...prompt, summary: 'x'.repeat(161) })
        .success,
    ).toBe(false);
    const loop = read('loops', 'listing-seo-loop.md').data;
    expect(
      schemas.loops.safeParse({ ...loop, stop_conditions: [] }).success,
    ).toBe(false);
    expect(
      schemas.loops.safeParse({ ...loop, approval_boundaries: [] }).success,
    ).toBe(false);
    expect(schemas.loops.safeParse({ ...loop, status: 'tested' }).success).toBe(
      false,
    );
    const product = read('products', 'ornament-bulk-creator.md').data;
    expect(
      schemas.products.safeParse({ ...product, price_cents: 2500 }).success,
    ).toBe(false);
  });
  it('keeps whitespace and literal markup during extraction', () => {
    expect(
      extractPrompt(
        '## Prompt\r\n\r\n```text\r\n  <city-country> & "quotes"\r\n\r\nlast line  \r\n```',
      ),
    ).toBe('  <city-country> & "quotes"\n\nlast line  ');
    expect(() => extractPrompt('missing fence')).toThrow();
  });
});
