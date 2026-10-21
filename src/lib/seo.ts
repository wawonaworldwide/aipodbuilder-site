export const siteUrl = 'https://aipodbuilder.com';
export function pageTitle(title: string): string {
  const full = `${title} | AI POD Builder`;
  if (full.length > 60)
    throw new Error(`Search title exceeds 60 characters: ${title}`);
  return full;
}
export function canonicalUrl(path: string): string {
  const clean = path.replace(/\/+$/, '') || '';
  return `${siteUrl}${clean}/`;
}
export const episodeTitles: Record<string, string> = {
  s01: 'S01: A day with my POD pipeline',
  e11: 'Ep 11: Image API ranker',
  e17: 'Ep 17: Ornament bulk creator',
};
export const promptTitles: Record<string, string> = {
  's01-01-pipeline-map': 'S01: Map my POD pipeline',
  's01-02-research-inbox': 'S01: Research inbox prompt',
  's01-03-approval-desk': 'S01: Design approval desk prompt',
  'e11-01-opening': 'Image API ranker: opening prompt',
  'e17-01-opening': 'Ornament creator: opening prompt',
  'e17-02-level-2': 'Ornament creator: Level 2 prompt',
};
