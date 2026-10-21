---
{
  "slug": "ornament-bulk-creator",
  "name": "Ornament Bulk Creator",
  "tagline": "Paste a list of cities, pick art styles, get a round 900 x 900 ornament PNG for every combo.",
  "summary": "A Windows app that turns a city list and your style examples into review-ready travel ornament designs.",
  "price_cents": 2499,
  "currency": "usd",
  "version": "1.0.0",
  "tax_code": "txcd_10202000",
  "launch_coupon": null,
  "r2_key": "apps/ornament-bulk-creator/1.0.0/ornament-bulk-creator-1.0.0.zip",
  "episode": "e17",
  "requirements": [
    "Windows PC with Node.js 24",
    "Your own Codex sign-in for image generation (you sign in yourself)",
    "Optional: an image API key (option B; the app asks before using it)"
  ],
  "includes": [
    "App source files (Next.js, SQLite, sharp)",
    "The Codex prompts that built it",
    "Its ICM folder (stage folders + CONTEXT.md files)",
    "Plain-English README",
    "LICENSE.txt"
  ],
  "does": [
    "One design per city x style, as a 900 x 900 transparent PNG for round ornaments",
    "Learns each style from example images you upload",
    "Shows only the city name as text, spelled exactly as you typed it",
    "Approve, reject or redo each design on desktop or phone",
    "Exports approved files with a listing.json each to a handoff folder for your listing step",
    "Mock mode for testing at $0"
  ],
  "does_not": [
    "Doesn't publish listings anywhere for you",
    "Doesn't include any API key or login",
    "Doesn't make heart or star shapes (round only)"
  ],
  "whats_in_zip": "ornament-bulk-creator/\n  README.md\n  LICENSE.txt\n  THIRD_PARTY_NOTICES.txt\n  app/\n  prompts/\n  icm/",
  "screenshots": [],
  "last_tested": null,
  "faq": [
    {
      "q": "Is this a subscription?",
      "a": "No. You pay $24.99 + tax once and keep the files."
    },
    {
      "q": "Can I sell the ornaments I make?",
      "a": "Yes. What you make is yours to sell. You just can't resell the app itself."
    },
    {
      "q": "Do I need an API key?",
      "a": "No. The main path uses your own Codex sign-in. An image API key is optional, and the app asks before using one."
    }
  ],
  "status": "draft"
}
---
Turn a city list and your art styles into round ornament designs. Use your own Codex sign-in, review each design on desktop or phone, and hand the approved files to your next step.

You get the source files, the prompts, and the stage folders so you can change the app yourself. This draft hasn't been tested yet. I’ll add the results after the build.
