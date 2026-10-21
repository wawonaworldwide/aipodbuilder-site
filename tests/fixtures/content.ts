import { readFileSync, readdirSync } from 'node:fs';
import matter from '../../scripts/frontmatter.mjs';
import { schemas } from '../../src/lib/schemas';
import type { Collections } from '../../src/lib/discovery';
export function seedCollections(): Collections {
  const all = {} as Collections;
  for (const kind of Object.keys(schemas) as (keyof Collections)[]) {
    const entries = readdirSync(`src/content/${kind}`)
      .filter((f) => /\.mdx?$/.test(f))
      .map((file) => {
        const { data, content } = matter(
          readFileSync(`src/content/${kind}/${file}`, 'utf8'),
        );
        return {
          id: file.replace(/\.mdx?$/, ''),
          collection: kind,
          data: schemas[kind].parse(data),
          body: content,
        };
      });
    Object.assign(all, { [kind]: entries });
  }
  return all;
}
