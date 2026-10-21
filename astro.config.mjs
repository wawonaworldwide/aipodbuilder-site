import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import sitemap from '@astrojs/sitemap';
export default defineConfig({
  site: 'https://aipodbuilder.com',
  output: 'static',
  // Small page styles avoid multiple render-blocking requests on mobile.
  build: { inlineStylesheets: 'always' },
  devToolbar: { enabled: false },
  // HTML links and canonicals use trailing slashes; spoken /free/11 URLs accept either form.
  trailingSlash: 'ignore',
  integrations: [
    mdx(),
    sitemap({
      filter: (url) => {
        const path = new URL(url).pathname;
        return (
          path.endsWith('/') &&
          (!/^\/(thanks|download|api|free)(\/|$)/.test(path) ||
            (path === '/free/s01/' && process.env.SHOW_DRAFTS !== 'true')) &&
          path !== '/newsletter/thanks/' &&
          path !== '/404/'
        );
      },
    }),
  ],
  server: { host: 'localhost', port: 4321 },
  vite: {
    // Keep component scripts external so the strict Worker CSP permits them.
    build: { assetsInlineLimit: 0 },
    server: {
      strictPort: true,
      // Generated tools, caches and private state are not source files to watch.
      watch: {
        ignored: [
          '**/.local-tools/**',
          '**/.npm-cache/**',
          '**/.wrangler/**',
          '**/.dev-outbox/**',
          '**/output/**',
          '**/dist/**',
        ],
      },
      proxy: {
        '^/api/(subscribe|checkout|order-status|resend-download|order-updates|stripe/webhook)(?:[?]|$)':
          {
            target: 'http://localhost:8787',
            changeOrigin: true,
          },
      },
    },
  },
  markdown: {
    syntaxHighlight: false,
    processor: satteri({ features: { smartPunctuation: false } }),
  },
});
