---
{
  "id": "s01-02-research-inbox",
  "title": "A research inbox I can approve from",
  "summary": "Approve or reject niche ideas from a CSV, with Amazon search links.",
  "stage": "research",
  "episode": "s01",
  "order": 2,
  "what_it_builds": "A research inbox I can approve from",
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
Build me a small local web app called Research Inbox. Read niche ideas from a CSV (niche, search phrase, why it might sell, product count, confidence). Show one card per idea with Approve and Reject buttons and an "Open Amazon search" link built from the phrase. Save every decision with a timestamp to a local SQLite file. Approved ideas go to an approved.csv export. Start in mock mode with 10 sample ideas. Use only free, local tools, and ask me before using any API key or paid service.
```

## Notes

Untested draft. Follow the approval steps in the prompt.
