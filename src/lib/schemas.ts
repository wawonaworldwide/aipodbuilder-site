import { z } from 'zod';
const summary = z.string().min(1).max(160);
const date = z.coerce.date();
const themes = z.array(
  z.enum(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8']),
);
const faq = z.array(z.object({ q: z.string().min(1), a: z.string().min(1) }));
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const episodeId = z.string().regex(/^(?:e\d+|s\d{2})$/);
const result = z.enum(['worked', 'worked after fix', 'failed']).nullable();
export const schemas = {
  episodes: z
    .object({
      id: episodeId,
      slug,
      title: z.string().min(1),
      number: z.number().int().positive().nullable(),
      format: z.enum(['E', 'S']).default('E'),
      url: z.url().optional(),
      youtube_id: z
        .string()
        .regex(/^[\w-]{11}$/)
        .nullable(),
      published: date.nullable(),
      stage: slug,
      themes: themes.default([]),
      verdict: z.string().nullable().default(null),
      prompts: z.array(slug).min(1),
      one_shot_result: z.string().nullable().default(null),
      related: z.object({
        loops: z.array(slug).default([]),
        skills: z.array(slug).default([]),
        posts: z.array(slug).default([]),
        apps: z.array(slug).default([]),
      }),
      status: z.enum(['draft', 'published']),
    })
    .refine(
      (d) =>
        d.format === 'S'
          ? /^s\d{2}$/.test(d.id) && d.number === null
          : /^e\d+$/.test(d.id) && d.number !== null,
      {
        message:
          'Showcases use an s ID and no number; episodes use an e ID and a number.',
      },
    ),
  prompts: z
    .object({
      id: z.string().regex(/^(?:e\d+|s\d{2})-\d{2}-[a-z0-9-]+$/),
      title: z.string(),
      summary,
      stage: slug,
      episode: episodeId,
      order: z.number().int().positive(),
      what_it_builds: z.string(),
      model_used: z.string(),
      date_tested: date.nullable(),
      result,
      fix_prompt: z.string().nullable(),
      tags: z.array(slug),
      themes,
      status: z.enum(['draft', 'tested', 'retired']),
    })
    .refine((d) => d.result === null || d.date_tested !== null, {
      message: 'A result requires date_tested.',
    })
    .refine(
      (d) =>
        d.status !== 'tested' || (d.date_tested !== null && d.result !== null),
      { message: 'Tested prompts require a dated result.' },
    ),
  loops: z
    .object({
      name: z.string(),
      slug,
      summary,
      category: z.enum([
        'Listings',
        'Design QA',
        'Research',
        'Publishing',
        'YouTube',
        'Operations',
      ]),
      author: z.string(),
      inspired_by: z
        .object({ title: z.string(), author: z.string(), url: z.url() })
        .nullable(),
      loop_prompt: z.string().min(1),
      success_check: z.string().min(1),
      stop_conditions: z.array(z.string().min(1)).min(1),
      approval_boundaries: z.array(z.string().min(1)).min(1),
      tags: z.array(slug),
      related_episode: z.string().nullable(),
      status: z.enum(['draft', 'tested', 'retired']),
      date_added: date,
      date_tested: date.nullable(),
      result: z.string().nullable(),
    })
    .refine(
      (d) =>
        d.status !== 'tested' || (d.date_tested !== null && Boolean(d.result)),
      { message: 'Tested loops require date_tested and result.' },
    ),
  posts: z.object({
    title: z.string(),
    description: summary,
    dek: z.string(),
    published: date,
    updated: date.nullable(),
    author: z.string(),
    tags: z.array(slug),
    episode: z.string().nullable(),
    tldr: z.array(z.string()).min(2).max(4),
    faq,
    hero: z.object({ src: z.string(), alt: z.string() }).nullable(),
    has_affiliate_links: z.boolean(),
    status: z.enum(['draft', 'published']),
  }),
  products: z
    .object({
      slug,
      name: z.string(),
      tagline: z.string(),
      summary,
      price_cents: z.number().int().min(2000).max(3000),
      currency: z.literal('usd'),
      version: z.string().regex(/^\d+\.\d+\.\d+$/),
      tax_code: z.literal('txcd_10202000'),
      launch_coupon: z
        .object({
          percent_off: z.number().min(1).max(100),
          redeem_by: date,
          max_redemptions: z.number().int().positive(),
          code: z.string(),
        })
        .nullable(),
      r2_key: z.string(),
      episode: z.string().nullable(),
      requirements: z.array(z.string()),
      includes: z.array(z.string()),
      whats_in_zip: z.string(),
      does: z.array(z.string()),
      does_not: z.array(z.string()),
      screenshots: z.array(z.object({ src: z.string(), alt: z.string() })),
      last_tested: date.nullable(),
      faq,
      status: z.enum(['draft', 'available', 'coming-soon', 'retired']),
    })
    .refine(
      (d) => d.slug !== 'ornament-bulk-creator' || d.price_cents === 2499,
      { message: 'Ornament Bulk Creator must cost 2499 cents.' },
    ),
  skills: z.object({
    name: z.string(),
    description: summary,
    license: z.string(),
    episode: z.string().nullable(),
    status: z.enum(['draft', 'published', 'retired']),
    version: z.string(),
  }),
  legal: z.object({
    title: z.string(),
    updated: date,
    summary: z.array(z.string()).min(1),
    status: z.enum(['draft', 'final']),
  }),
};
