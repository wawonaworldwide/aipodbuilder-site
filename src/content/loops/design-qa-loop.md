---
name: The design QA loop
slug: design-qa-loop
summary: Checks every design file for print size, DPI, true transparency and clean edges, fixes what's safe, and flags the rest.
category: Design QA
author: AI POD Builder
inspired_by: null
loop_prompt: |
  Check every PNG in [batch folder] against this print spec: exactly [width x height] px (e.g. 4500 x 5400), 300 DPI saved in the file, a truly transparent background (real alpha, not a painted checkerboard and not a solid color), no leftover fringe or halo around the edges (no edge pixels within [tolerance] of the old background color, e.g. near-green), no stray specks or faint semi-transparent pixels outside the artwork, artwork not touching or cut off at the canvas edge, and file size under [size cap]. Write a QC report row for each file: each check pass/fail with the measured value. For each failure, make the smallest safe fix on a COPY in [output folder]: resize from the original (never more than 2x upscaling), set DPI, defringe edges, remove specks, or re-center. Then rerun every check on that file. Keep originals untouched and never delete anything. Stop when every file passes, when a file fails the same check twice (mark it "needs human review" with the reason), or when a fix would need more than 2x upscaling. Ask me before using any API key. Finish with the QC report CSV, the list of fixed files, and the files that need me.
success_check: Every file in the output folder passes all checks, or is listed as "needs human review" with the failed check and measured value.
stop_conditions: [all files pass, "same check fails twice on a file", "fix needs > 2x upscale", "folder unreadable"]
approval_boundaries: [never overwrite or delete originals, ask before any API key, no paid upscaling service without asking]
tags: [print-ready, dpi, transparency, png, qc]
related_episode: e05 (Design prep)
status: draft
date_added: 2026-10-18
date_tested: null
result: null
---
## How to use it
Run it on a folder of finished designs before they go to the approval desk. DPI means "dots per inch"; print shops want 300. A halo is the thin colored outline left behind after a background is removed.

## What can go wrong
- A painted checkerboard looks transparent but isn't. The alpha check catches it.
- Over-defringing eats into thin lines and text. Compare before/after at 100% zoom.
- A tiny design upscaled 4x looks soft; that's why the loop stops at 2x and asks.
