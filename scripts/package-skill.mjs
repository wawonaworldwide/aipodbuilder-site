import { privateBrandPresent } from './content-rules.mjs';
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { zipSync } from 'fflate';
export function packageSkill(slug, base = resolve('src/content/skills')) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error('Invalid skill folder name.');
  const root = realpathSync(resolve(base, slug));
  const boundary = relative(realpathSync(base), root);
  if (boundary.startsWith('..') || isAbsolute(boundary))
    throw new Error('Skill folder leaves content root.');
  const entries = {};
  function walk(dir, prefix = '') {
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (item.isSymbolicLink())
        throw new Error('Skill packages cannot contain symbolic links.');
      if (/^(?:\.|node_modules$)/.test(item.name))
        throw new Error(
          'Skill packages cannot contain hidden files or dependencies.',
        );
      const name = prefix + item.name;
      const path = resolve(dir, item.name);
      if (item.isDirectory()) {
        walk(path, name + '/');
        continue;
      }
      const bytes = readFileSync(path);
      const text = bytes.toString('utf8');
      if (privateBrandPresent(text))
        throw new Error('Skill package contains prohibited brand copy.');
      const credentials =
        /\b(?:(?:sk|rk)_(?:live|test)_|whsec_)[A-Za-z0-9]{16,}|\bre_[A-Za-z0-9]{20,}|\bsk-proj-[A-Za-z0-9_-]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
      if (credentials.test(text))
        throw new Error(
          'Skill package contains a credential pattern; value withheld.',
        );
      entries[`${slug}/${name}`] = [
        new Uint8Array(bytes),
        { mtime: new Date('2000-01-01T00:00:00Z') },
      ];
    }
  }
  walk(root);
  if (!entries[`${slug}/SKILL.md`])
    throw new Error('Skill package requires SKILL.md.');
  return {
    raw: readFileSync(resolve(root, 'SKILL.md'), 'utf8'),
    zip: zipSync(entries, { level: 9 }),
  };
}
