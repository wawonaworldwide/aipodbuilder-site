# AI POD Builder

A companion site for the AI POD Builder channel: free print-on-demand starter prompts, draft build resources, and optional email updates.

Built with Astro, TypeScript and a Cloudflare Worker. The site uses Kit for double opt-in subscriptions and Cloudflare Turnstile for signup protection. Checkout is disabled.

## Run locally

Use Node.js 24 and npm. On Windows, the optional project runtime can be installed with `./scripts/setup-node.ps1` and selected with `. ./scripts/use-local-node.ps1`.

```powershell
npm ci
npm run build
npm run dev:worker
```

Open http://localhost:8787. For Astro editing, run `npm run dev` in another terminal and use http://localhost:4321. These are the only local development ports.

Local signup uses test/log behavior. Do not enter real subscriber data or production credentials into local tests. To inspect draft content locally, set `SHOW_DRAFTS=true` before building.

## Check the project

```powershell
npm run check
npm run format:check
npm run build:production
npm run check:deployment -- production
```

The suite covers types, lint, content, exact prompt text, discovery feeds, accessibility, security, deployment boundaries and performance. External email/payment calls are mocked in automated tests.

## Deployment

Cloudflare deployment profiles are in `wrangler.jsonc`. Its resource identifiers, form/tag IDs and Turnstile site keys are public configuration, not credentials. Configure your own account resources and domains before deploying a fork.

Store credentials only as Cloudflare Worker secrets through Wrangler's masked prompts. Never commit private configuration files or paste credentials into issues or pull requests. Production requires `KIT_API_KEY` and `TURNSTILE_SECRET_KEY`; no payment credentials are needed while the store is off.

```powershell
npm run build:production
npm run check:deployment -- production
npx --no-install wrangler deploy --env production
```

Production hides draft episodes. The standalone `/free/s01/` page shares the approved starter prompt text without publishing the draft S01 episode. Preview stays non-indexable.

Generated builds, dependencies, local databases, email outboxes, private settings and internal working records are excluded from this repository.

## License and contact

Website source and free starter prompts: [MIT](LICENSE.txt). Third-party dependencies retain their own licenses. Any future paid app will state its own terms.

Support: [tee-bot@aipodbuilder.com](mailto:tee-bot@aipodbuilder.com).
