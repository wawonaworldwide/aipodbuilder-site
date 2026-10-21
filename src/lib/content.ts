import {
  getCollection,
  type CollectionEntry,
  type CollectionKey,
} from 'astro:content';
export const showDrafts =
  import.meta.env.SHOW_DRAFTS === 'true' ||
  (import.meta.env.DEV && import.meta.env.SHOW_DRAFTS !== 'false');
export const storeMode = import.meta.env.STORE_MODE === 'off' ? 'off' : 'test';
export function isVisible(status: string, drafts: boolean): boolean {
  return status !== 'retired' && (status !== 'draft' || drafts);
}
export async function visibleCollection<K extends CollectionKey>(name: K) {
  if (
    name === 'skills' &&
    Object.keys(import.meta.glob('../content/skills/**/SKILL.md')).length === 0
  )
    return [] as CollectionEntry<K>[];
  return getCollection(name, ({ data }) => isVisible(data.status, showDrafts));
}
export const stages = [
  { id: 'research', label: 'Niche research' },
  { id: 'designs', label: 'Designs' },
  { id: 'background-remover', label: 'Background remover' },
  { id: 'design-prep', label: 'Design prep' },
  { id: 'approval-desk', label: 'Approval desk' },
  { id: 'listing-writer', label: 'Listing writer' },
  { id: 'publishing', label: 'Publishing' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'scheduling', label: 'Scheduling' },
];
export function stageLabel(stage: string): string {
  if (stage === 'showcase') return 'Showcase';
  return stage === 'design-generation'
    ? 'Designs'
    : (stages.find((s) => s.id === stage)?.label ?? stage);
}
export const themes: Record<string, string> = {
  T1: "Build it, don't buy it",
  T2: 'Show the real numbers',
  T3: 'Watch it break',
  T4: 'The shop runs while you sleep',
  T5: 'AI news filtered for sellers',
  T6: 'Everything you see, you can take',
  T7: 'Anyone can do this',
  T8: 'Automate anything, POD first',
};
export const formatDate = (date: Date | string) =>
  new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
export const readingMinutes = (body: string) =>
  Math.max(1, Math.ceil(body.split(/\s+/).length / 200));

export const episodeLabel = (id: string) =>
  id.startsWith('s')
    ? `Showcase ${id.toUpperCase()}`
    : `Episode ${Number(id.slice(1))}`;
