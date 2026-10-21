import type { APIRoute } from 'astro';
import { loadResources } from './discovery-content';
import type { Resource } from './discovery';
export function resourceResponse(resource: Resource | undefined): Response {
  if (!resource) return new Response('Resource not found.', { status: 404 });
  const headers: Record<string, string> = {
    'Content-Type': resource.type,
    'Cache-Control': 'public, max-age=300',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
    Link: '</llms.txt>; rel="describedby"',
  };
  return new Response(
    typeof resource.body === 'string'
      ? resource.body
      : new Uint8Array(resource.body),
    { headers },
  );
}
export async function resourcePaths(
  prefix: string,
  suffix: string,
  param = 'slug',
) {
  const resources = await loadResources();
  return [...resources].flatMap(([path, resource]) => {
    if (!path.startsWith(prefix) || !path.endsWith(suffix)) return [];
    const slug = path.slice(prefix.length, -suffix.length);
    if (!slug || slug.includes('/')) return [];
    return [{ params: { [param]: slug }, props: { resource } }];
  });
}
export const resourceGET: APIRoute = ({ props }) =>
  resourceResponse(props.resource);
export const fixedResource =
  (path: string): APIRoute =>
  async () =>
    resourceResponse((await loadResources()).get(path));
