export function isPublicFeed(path: string): boolean {
  return /^\/api\/(?:loops\.json|prompts\.json|skills\.json|loops\/[a-z0-9]+(?:-[a-z0-9]+)*\.json)$/.test(
    path,
  );
}
export function discoveryType(path: string): string | null {
  if (isPublicFeed(path)) return 'application/json; charset=utf-8';
  if (path.endsWith('.md')) return 'text/markdown; charset=utf-8';
  if (path === '/rss.xml') return 'application/rss+xml; charset=utf-8';
  if (['/llms.txt', '/llms-full.txt', '/robots.txt'].includes(path))
    return 'text/plain; charset=utf-8';
  return null;
}
