---
name: The listing SEO loop
slug: listing-seo-loop
summary: Improves a POD listing's title, tags and description until every Etsy rule passes and the score stops rising.
category: Listings
author: AI POD Builder
inspired_by: null
loop_prompt: |
  Improve the listing draft(s) in [file or folder] for [niche] on [marketplace, e.g. Etsy], using only the keywords in [research file]. Rules every listing must pass: title of 15 words or fewer that leads with the main research term; exactly 13 tags, each 20 characters or fewer, no duplicates; a description of at least 160 characters that includes the product block from [product block file]; none of these words: amazon, etsy, prime, free shipping, svg, png, mockup, template, bundle, wholesale; no trademarks, brands, characters or celebrity names; no claims the product can't back up. First score each listing: rules (pass/fail each), keyword coverage (how many of the top [10] research terms appear naturally), and readability (1-5). Each round, fix the single weakest item, then rescore the whole listing. Stop when every rule passes and the score reaches [target], after 3 rounds with no gain, or at [round cap]. Never publish or edit a live listing; save drafts only and ask me before using any API key. Finish with a before/after table, the scores, which keyword went where, and anything you couldn't fix.
success_check: Every rule passes on every listing, and the score meets [target] (or the run reports why not).
stop_conditions: [all rules pass and score >= target, "3 rounds without gain", "[round cap] reached", "research file missing", approval needed]
approval_boundaries: [no publishing or editing live listings, drafts only, ask before any API key, no trademarked terms]
tags: [etsy, seo, listings, titles, tags]
related_episode: e07 (Listing writer)
status: draft
date_added: 2026-10-18
date_tested: null
result: null
---
## How to use it
Paste it into Codex (or any agent) in the folder with your listing drafts. Fill in the `[brackets]`. "Keyword coverage" just means: do the words buyers actually search for show up in the listing?

## What can go wrong
- Keyword stuffing: the title turns into a word salad. The readability score is there to catch it; keep "naturally" in the prompt.
- Made-up research terms: the loop may only use words from your research file.
- Etsy changes its rules: re-check the limits before each season.
