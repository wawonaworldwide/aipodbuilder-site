import { origin, entryPath, type Collections } from './discovery';
export type LinkedData = Record<string, unknown>;
export function structuredData(
  path: string,
  title: string,
  description: string,
  all: Collections,
): LinkedData {
  const canonical = origin + (path.endsWith('/') ? path : path + '/');
  const organization = {
    '@type': 'Organization',
    '@id': origin + '/#organization',
    name: 'AI POD Builder',
    url: origin + '/',
    logo: origin + '/favicon.svg',
    sameAs: [
      'https://www.youtube.com/@AIPODBuilder',
      'https://x.com/AIPODBuilder',
    ],
    parentOrganization: { '@type': 'Organization', name: 'Wawona Worldwide' },
  };
  const graph: LinkedData[] = [
    organization,
    {
      '@type': 'WebSite',
      '@id': origin + '/#website',
      name: 'AI POD Builder',
      url: origin + '/',
      publisher: { '@id': organization['@id'] },
    },
  ];
  const parts = path.split('/').filter(Boolean);
  const names: Record<string, string> = {
    episodes: 'Episodes',
    prompts: 'Free prompts',
    loops: 'Loop Library',
    apps: 'Apps',
    blog: 'Blog',
    skills: 'Agent skills',
    tags: 'Tags',
    newsletter: 'Newsletter',
  };
  // Only include real ancestor pages. Blog tags and page are routing segments, not pages.
  const ancestors =
    parts.length > 1 && names[parts[0]]
      ? [{ name: names[parts[0]], item: origin + '/' + parts[0] + '/' }]
      : [];
  const breadcrumbs = [
    { name: 'Home', item: origin + '/' },
    ...ancestors,
    ...(parts.length ? [{ name: title, item: canonical }] : []),
  ];
  graph.push({
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      ...b,
    })),
  });
  const post = all.posts.find((e) => entryPath('posts', e) === path);
  const loop = all.loops.find((e) => entryPath('loops', e) === path);
  const product = all.products.find((e) => entryPath('products', e) === path);
  const episode = all.episodes.find((e) => entryPath('episodes', e) === path);
  if (post)
    graph.push({
      '@type': 'BlogPosting',
      headline: post.data.title,
      description: post.data.description,
      url: canonical,
      mainEntityOfPage: canonical,
      author: {
        '@type': 'Organization',
        name: 'AI POD Builder',
        url: origin + '/about/',
      },
      publisher: { '@id': organization['@id'] },
      datePublished: post.data.published.toISOString(),
      ...(post.data.updated
        ? { dateModified: post.data.updated.toISOString() }
        : {}),
      image: post.data.hero
        ? new URL(post.data.hero.src, origin).href
        : origin + '/og-default.png',
    });
  if (episode?.data.youtube_id)
    graph.push({
      '@type': 'VideoObject',
      name: episode.data.title,
      description,
      thumbnailUrl: `https://i.ytimg.com/vi/${episode.data.youtube_id}/hqdefault.jpg`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${episode.data.youtube_id}`,
      ...(episode.data.published
        ? { uploadDate: episode.data.published.toISOString() }
        : {}),
    });
  if (loop)
    graph.push({
      '@type': 'HowTo',
      name: loop.data.name,
      description: loop.data.summary,
      url: canonical,
      step: [
        {
          name: 'Check approval boundaries',
          text: loop.data.approval_boundaries.join('\n'),
        },
        { name: 'Run the loop', text: loop.data.loop_prompt },
        { name: 'Check the result', text: loop.data.success_check },
        {
          name: 'Stop when a condition is met',
          text: loop.data.stop_conditions.join('\n'),
        },
      ].map((s, i) => ({ '@type': 'HowToStep', position: i + 1, ...s })),
    });
  if (product) {
    const d = product.data;
    graph.push({
      '@type': 'SoftwareApplication',
      name: d.name,
      description: d.summary,
      url: canonical,
      applicationCategory: 'DesignApplication',
      operatingSystem: 'Windows',
      softwareVersion: d.version,
      offers: {
        '@type': 'Offer',
        url: canonical,
        price: (d.price_cents / 100).toFixed(2),
        priceCurrency: d.currency.toUpperCase(),
        description: `$${(d.price_cents / 100).toFixed(2)} + tax; one-time. Checkout is unavailable in this local preview.`,
        seller: { '@id': organization['@id'] },
      },
    });
  }
  const faq = post?.data.faq ?? product?.data.faq;
  if (faq?.length)
    graph.push({
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  return { '@context': 'https://schema.org', '@graph': graph };
}
export const safeJson = (value: unknown) =>
  JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
