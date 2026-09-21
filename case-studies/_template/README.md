# Case-study template

Copy this folder to `case-studies/<project-slug>/` and turn it into a real case study.

```bash
cp -r case-studies/_template case-studies/my-project
```

Then:

1. Replace every `[bracketed]` token in `index.html`.
2. Delete the sections you do not have facts for, and renumber the ones that remain.
3. Add the new page to `sitemap.xml` and to the cards on `work.html` (and `index.html`
   if it is a featured project).
4. Remove the `<meta name="robots" content="noindex, nofollow" />` line and add the
   page's own canonical, Open Graph and Twitter tags, following an existing case study.
5. Wire the previous/next links so the sequence stays continuous.
6. Run `npm run check`.

## Section contract

| Section | Required? | Notes |
| --- | --- | --- |
| Breadcrumb | Required | Home → Work → project. |
| Project hero + metadata | Required | One-sentence summary of the product and the stack. |
| Overview | Required | What the product is and who it serves. |
| Challenge | Optional | The constraint the work had to satisfy. |
| Contribution | Required | What Anne personally did. Keep it defensible; if the project was a team effort, say so. |
| Approach | Optional | Decisions and the reason for them. |
| Technology | Required | Only technologies actually used. |
| Visuals | Optional | Real screenshots only. Never pass a mock-up off as the product. |
| Outcome / Where it stands | Optional | Verifiable results only. If nothing can be published, say that plainly. |
| Key takeaways | Optional | What the project taught. |
| Previous / next | Required | Keeps the case-study sequence navigable. |
| Closing CTA | Required | One route to contact. |

## Rules

- Never invent clients, metrics, awards, testimonials or outcomes. If a section would
  need invented detail, delete the section and record the gap in
  `/CONTENT-CHECKLIST.md`.
- Keep the class names — the layout, spacing and responsiveness come from
  `assets/css/main.css`. If a new component is genuinely needed, add it there rather
  than in an inline style.
- Images live in `images/optimized/` as WebP (with a JPEG fallback) and are referenced
  with `<picture>` + `srcset` + `sizes`.
- The template folder itself carries `noindex, nofollow` and is excluded from
  `sitemap.xml`, so it can stay in the repository safely.
