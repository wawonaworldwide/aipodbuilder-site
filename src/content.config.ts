import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { schemas } from './lib/schemas';
export const collections = {
  episodes: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/episodes' }),
    schema: schemas.episodes,
  }),
  prompts: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/prompts' }),
    schema: schemas.prompts,
  }),
  loops: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/loops' }),
    schema: schemas.loops,
  }),
  posts: defineCollection({
    loader: glob({ pattern: '**/*.mdx', base: './src/content/posts' }),
    schema: schemas.posts,
  }),
  products: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/products' }),
    schema: schemas.products,
  }),
  skills: defineCollection({
    loader: glob({ pattern: '**/SKILL.md', base: './src/content/skills' }),
    schema: schemas.skills,
  }),
  legal: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/legal' }),
    schema: schemas.legal,
  }),
};
