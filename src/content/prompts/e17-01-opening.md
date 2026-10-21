---
{
  "id": "e17-01-opening",
  "title": "Opening prompt: the ornament bulk creator",
  "summary": "Step 1 of the ornament build: paste cities, pick styles, get a 900 x 900 round ornament PNG for every city and style.",
  "stage": "designs",
  "episode": "e17",
  "order": 1,
  "what_it_builds": "A batch generator for travel city ornament designs with review on desktop and phone",
  "model_used": "Codex (model shown in the session)",
  "date_tested": null,
  "result": null,
  "fix_prompt": null,
  "tags": [
    "ornaments",
    "codex-images",
    "nextjs",
    "sqlite",
    "sharp"
  ],
  "themes": [
    "T1",
    "T7"
  ],
  "status": "draft"
}
---
## Prompt

```text
I sell travel Christmas ornaments: the same city in lots of different art styles. I want an app where I paste a list of cities, like "Paris, France", pick a few styles, and it makes one ornament design for every city and style combo. Each style learns from example images I upload. Use my own Codex sign-in to make the images, the same way I use Codex already. I want to approve or reject each design (on my phone too), redo the bad ones, and then hand the approved files to my listing tool.

A few things that matter to me:
- Next.js with a small SQLite database and the sharp image library.
- Every design is a round-ornament transparent PNG, exactly 900 by 900 pixels.
- The only text on a design is the city name, spelled exactly as I typed it. No mockup, hook or background.
- Images come from Codex using my own sign-in (I'll log in myself; never save or show my login). An image API key is only an option, and you ask me before using any API key.
```

## What you'll see

A batch generator for travel city ornament designs with review on desktop and phone. This is the intended build, not a tested result.

## Notes

Untested draft. I’ll add the result after recording the build.
