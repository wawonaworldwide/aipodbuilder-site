import { afterEach, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { packageSkill } from '../../scripts/package-skill.mjs';
mkdirSync('.local-tools', { recursive: true });
const root = mkdtempSync(resolve('.local-tools/skill-test-'));
const skill = join(root, 'test-skill');
function save(path: string, text: string) {
  writeFileSync(path + '.tmp', text);
  renameSync(path + '.tmp', path);
}
afterEach(() => {
  if (!skill.startsWith(root + '\\') && !skill.startsWith(root + '/'))
    throw Error('Unexpected test path');
  rmSync(skill, { recursive: true, force: true });
});
it('packages raw SKILL.md and nested support files reproducibly', () => {
  mkdirSync(join(skill, 'references'), { recursive: true });
  save(join(skill, 'SKILL.md'), '---\nname: Test skill\n---\nFixture only.\n');
  save(join(skill, 'references', 'guide.txt'), 'Fixture guidance.');
  const result = packageSkill('test-skill', root);
  expect(result.zip).toEqual(packageSkill('test-skill', root).zip);
  const entries = unzipSync(result.zip);
  expect(Object.keys(entries)).toEqual(
    ['test-skill/SKILL.md', 'test-skill/references/guide.txt'].sort((a, b) =>
      a.localeCompare(b),
    ),
  );
  expect(strFromU8(entries['test-skill/SKILL.md'])).toBe(result.raw);
});
it('rejects traversal, hidden files and credential-bearing packages', () => {
  expect(() => packageSkill('../test-skill', root)).toThrow();
  mkdirSync(skill);
  save(join(skill, 'SKILL.md'), 'Fixture only.');
  save(join(skill, '.env'), 'EXAMPLE=');
  expect(() => packageSkill('test-skill', root)).toThrow('hidden');
  rmSync(join(skill, '.env'));
  save(join(skill, 'bad.txt'), ['sk', 'test', 'a'.repeat(20)].join('_'));
  expect(() => packageSkill('test-skill', root)).toThrow('credential');
});
