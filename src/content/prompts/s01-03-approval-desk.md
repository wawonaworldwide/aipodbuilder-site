---
{
  "id": "s01-03-approval-desk",
  "title": "An approval desk for designs",
  "summary": "Approve, reject with reasons, or regenerate designs in a folder.",
  "stage": "approval-desk",
  "episode": "s01",
  "order": 3,
  "what_it_builds": "An approval desk for designs",
  "model_used": "Codex (draft; not yet tested)",
  "date_tested": null,
  "result": null,
  "fix_prompt": null,
  "tags": [
    "starter",
    "showcase"
  ],
  "themes": [],
  "status": "draft"
}
---

## Prompt

```text
Build a local web page that shows every PNG in a folder as a grid. Each design gets Approve, Reject and Regenerate buttons. Reject asks for a reason from a short list (text incorrect, too busy for small print, bad edges, off-niche) or a custom note. Move approved files to approved/, keep rejected files in place, and write all decisions with reasons to decisions.csv so a later step can learn from them. Never delete a file. Works on my phone over my home network.
```

## Notes

Untested draft. Follow the approval steps in the prompt.
