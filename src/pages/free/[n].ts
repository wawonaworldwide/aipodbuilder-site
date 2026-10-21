import type { APIRoute } from 'astro';
import { visibleCollection } from '../../lib/content';
export async function getStaticPaths() {
  return (await visibleCollection('episodes'))
    .filter((entry) => entry.data.id !== 's01')
    .map((entry) => ({
      params: {
        n:
          entry.data.format === 'S' ? entry.data.id : String(entry.data.number),
      },
      props: { slug: entry.data.slug },
    }));
}
// Dev returns an HTTP redirect; the static build emits matching _redirects rules.
export const GET: APIRoute = ({ props }) =>
  new Response(null, {
    status: 302,
    headers: { Location: `/episodes/${props.slug}/#prompts` },
  });
