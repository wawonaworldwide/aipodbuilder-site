import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import matter from '../../scripts/frontmatter.mjs';
import { schemas } from '../../src/lib/schemas';
import { extractPrompt } from '../../src/lib/markdown';
import { createDiscovery } from '../../src/lib/discovery';
import { seedCollections } from '../fixtures/content';
const source = JSON.parse(
  readFileSync('tests/fixtures/editorial/s01-source.json', 'utf8'),
);
it('preserves the exact S01 episode, prompt payloads and transcript from Notion', () => {
  expect(
    readFileSync(
      'src/content/episodes/s01-day-with-my-pod-pipeline.md',
      'utf8',
    ),
  ).toBe(source.episode + '\n');
  expect(readFileSync('src/content/transcripts/s01.txt', 'utf8')).toBe(
    source.transcript,
  );
  for (const m of source.prompts.matchAll(
    /## (s01-\S+) — "([^"]+)"\n~~~\n([\s\S]*?)\n~~~/g,
  )) {
    const p = matter(
      readFileSync('src/content/prompts/' + m[1] + '.md', 'utf8'),
    );
    expect(p.data.title).toBe(m[2]);
    expect(extractPrompt(p.content)).toBe(m[3]);
    expect(p.data.status).toBe('draft');
  }
});
it('supports an unnumbered showcase and rejects inconsistent episode metadata', () => {
  const data = matter(source.episode).data;
  expect(schemas.episodes.parse(data)).toMatchObject({
    id: 's01',
    format: 'S',
    number: null,
    status: 'draft',
    youtube_id: null,
    published: null,
  });
  expect(schemas.episodes.safeParse({ ...data, number: 1 }).success).toBe(
    false,
  );
  expect(schemas.episodes.safeParse({ ...data, format: 'E' }).success).toBe(
    false,
  );
});
it('exposes exact S01 discovery entries and transcript only with drafts enabled', () => {
  const all = seedCollections();
  const resources = createDiscovery(all, { drafts: true });
  for (const line of source.llms
    .split('\n')
    .filter((line: string) => line.startsWith('- [')))
    expect(resources.get('/llms.txt')?.body).toContain(line);
  expect(
    resources.get('/episodes/s01-day-with-my-pod-pipeline.md')?.body,
  ).toContain(source.transcript);
  const hidden = createDiscovery(all, { drafts: false });
  for (const [path, resource] of hidden) {
    expect(path).not.toMatch(/^\/(episodes|prompts)\/s01/);
    expect(String(resource.body)).not.toContain(
      '/episodes/s01-day-with-my-pod-pipeline/',
    );
    expect(String(resource.body)).not.toContain(source.transcript);
  }
});
