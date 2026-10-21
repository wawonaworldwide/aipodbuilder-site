---
{
  "id": "e11-01-opening",
  "title": "Opening prompt: the image API ranker",
  "summary": "Step 1 of the Ep 11 build: a plain-English ask for a side-by-side image service tester with mock mode and spending limits.",
  "stage": "design-generation",
  "episode": "e11",
  "order": 1,
  "what_it_builds": "A local app that sends one prompt to several image services and shows results side by side with cost and time",
  "model_used": "Codex (model shown in the session)",
  "date_tested": null,
  "result": null,
  "fix_prompt": null,
  "tags": [
    "image-api",
    "node",
    "mock-mode"
  ],
  "themes": [
    "T1",
    "T2",
    "T7"
  ],
  "status": "draft"
}
---
## Prompt

```text
I keep wondering which AI image service is actually best for t-shirt designs. I want a little app on my PC where I type one prompt, it goes to several image services at once, and I see the results side by side with what each one cost and how long it took. Then I'd like to score them without knowing which is which.

A few things that matter to me:
- Node.js and TypeScript with a small Express server, running at localhost.
- Mock mode first with fake images, plus hard spending limits per service and in total.
- Save every result to a CSV file.
- Ask me before using any API key.
```

## What you'll see

A local app that sends one prompt to several image services and shows results side by side with cost and time. This is the intended build, not a tested result.

## Notes

Untested draft. I’ll add the result after recording the build.
