import { getCollection } from 'astro:content';
import { visibleCollection, showDrafts } from './content';
import { createDiscovery, type Collections, slugOfSkill } from './discovery';
import { packageSkill } from '../../scripts/package-skill.mjs';
export async function loadEntries(): Promise<Collections> {
  const [episodes, prompts, loops, posts, products, skills, legal] =
    await Promise.all([
      visibleCollection('episodes'),
      visibleCollection('prompts'),
      visibleCollection('loops'),
      visibleCollection('posts'),
      visibleCollection('products'),
      visibleCollection('skills'),
      visibleCollection('legal'),
    ]);
  return { episodes, prompts, loops, posts, products, skills, legal };
}
export async function loadResources() {
  const entries = await loadEntries();
  const resources = createDiscovery(
    { ...entries, prompts: await getCollection('prompts') },
    {
      drafts: showDrafts,
      license: import.meta.env.FREE_RESOURCES_LICENSE || 'MIT',
    },
  );
  for (const entry of entries.skills) {
    const slug = slugOfSkill(entry.id);
    const { raw, zip } = packageSkill(slug);
    resources.set(`/skills/${slug}/SKILL.md`, {
      body: raw,
      type: 'text/markdown; charset=utf-8',
    });
    resources.set(`/skills/${slug}.zip`, {
      body: zip,
      type: 'application/zip',
    });
  }
  return resources;
}
