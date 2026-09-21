# Anne Portfolio QA — Final

Date: 2026-09-21
Baseline: `PORTFOLIO-QA-BASELINE.md` (same day, same tooling)
Method: `npm run check`, `node tools/audit-site.mjs`, `node tools/qa-visual.mjs`
(8 pages × 10 viewports, headless Chrome against a local server).

## Scorecard

| Category | Before | After |
| --- | ---: | ---: |
| Scanability | 7 | 8 |
| Accessibility | 6.5 | 8.5 |
| Responsiveness | 8.5 | 9 |
| Information Clarity | 7.5 | 8 |
| Navigation | 7.5 | 8.5 |
| Visual Hierarchy | 8 | 8 |
| Content Quality | 8 | 8 |
| Project UX | 7.5 | 8 |
| Mobile UX | 6.5 | 8.5 |
| Performance | 7.5 | 8.5 |
| SEO | 8.5 | 9 |
| Interaction Quality | 7.5 | 8.5 |
| Visual Consistency | 8.5 | 8.5 |
| Technical Quality | 8 | 9 |
| Recruiter/Client Usability | 7 | 8.5 |

Scores are held down deliberately where the remaining gap is real. Visual hierarchy,
content quality and visual consistency are unchanged because this pass was remediation,
not redesign — nothing about the art direction was altered.

## What changed

### Accessibility

1. **Focus indicator on filled controls** (`assets/css/main.css`). The global ring was
   `--burnt-orange`, which measured **1:1** against the burnt-orange button fill and
   **1.39:1** against the olive filter chip. Filled controls now use a light ring with a
   dark halo, visible on any background. Result: **4 → 0** low-contrast rings on the
   homepage, **0 across all 8 pages**.
2. **Touch targets.** `.btn`, `.link-arrow`, `.nav-toggle`, `.wordmark`, `.work-filter__btn`,
   `.contact-list__value a`, `.hero__cv` and the skip link now meet ~44px; footer links get
   full-height targets on phones only. Result: **21/26/19/16/18/17/15 undersized controls →
   0 on four pages, 1 on four pages**, and **0 WCAG 2.5.8 (24px) failures site-wide**.
3. **Landmark naming.** `<nav class="case-nav">` on all three case studies now carries
   `aria-label="Case study navigation"`.
4. **Structured data.** `about.html` gains `AboutPage` + `Person` JSON-LD, so every
   indexable page now carries valid structured data (404 remains `noindex`, by design).

### Mobile UX and responsiveness

5. **Clipped project-cover captions** — the most concrete layout bug found. At ≤820px the
   typographic covers kept a fixed 16:10 box while their content needed up to 214px inside
   176px, so the caption line was cut off by `overflow: hidden`. Below the desktop
   breakpoint the cover and its media wrapper now size to content with a 14rem minimum, so
   the caption is always complete and the desktop poster proportion is untouched.
6. **`<picture>` sizing** — media wrappers relied on clipping rather than `object-fit`
   (the `<picture>` element had no height, so images overflowed and were cut at the
   bottom). `picture { height: 100% }` makes the intended crop real and fixed every
   `.portrait-frame__media`, `.intro__figure-media`, `.duo__media` and `.work-card__media`
   box at once.
7. **Verified across ten widths** — 320, 375, 390, 414, 768, 820, 1024, 1280, 1440, 1920:
   **0 horizontal overflow, 0 clipped elements, 0 console errors** on all eight pages.

### Consistency

8. The header CTA on `contact.html` said "Email Anne" while every other page said
   "Let's talk"; unified.
9. `.tag` raised from 11.5px to 12px — the smallest text on the site carries the
   technology stack.

### Performance

10. **Image re-encode** of the heaviest files (`outdoor-702/480.webp`,
    `graduation-2-960.webp`, `hero-1024.webp`, two JPEG fallbacks). About page weight
    **514KB → 479KB**; the difference is a mean of ≤2.8/255 per channel, verified by pixel
    comparison and by eye.
11. **Post-fix paint metrics:** LCP 252–1348ms, CLS ≤0.0167, 174–483KB per page,
    10–14 requests, no third-party requests.

### Palette (requested change)

12. **Base darkened one step**: `--bg-dark #1C1C1C → #171717`, with the derived surfaces
    moved to match (`--bg-dark-deep #101010`, `--bg-dark-soft #1F1F1E`, `--panel #1D1D1C`,
    glass `rgba(17,17,17,·)`). The step is deliberately small — "a tad". Applied everywhere
    the base appears: tokens, the focus halo, `theme-color` meta on all nine pages, the
    favicon SVG and PNG icons, and the social card, which was regenerated on the new
    background. All 13 contrast pairs re-verified; text contrast improved slightly (button
    label on burnt orange 4.64:1 → 4.88:1).

### Tooling / technical quality

13. **`tools/lib/harness.mjs`** now holds the static server, CDP client, Chrome launcher
    and page/viewport matrix; `qa-visual.mjs` was rewritten against it, removing ~200
    lines of duplicated plumbing.
14. **`tools/audit-site.mjs`** is new: per page it reports heading outline and skipped
    levels, duplicate ids, JSON-LD validity, network failures (any 4xx/5xx the page
    causes), LCP/CLS and byte weight by resource type, tap-target sizes, a keyboard walk
    with focus-ring contrast, mobile-menu open/close/focus/Escape behaviour, and a
    no-JavaScript pass.
15. **The visual harness** now measures ten widths (screenshots kept for four) and fails on
    internal content clipping, not only horizontal overflow.

## Verification after fixes

| Check | Result |
| --- | --- |
| `npm run check` (links, metadata, alt text, sitemap, contrast) | 9 pages, 0 errors, 0 warnings, 13 contrast pairs pass |
| Horizontal overflow | 0 at all 10 widths × 8 pages |
| Clipped content inside containers | 0 |
| Broken images or missing assets | 0 |
| Console errors, exceptions, network 4xx/5xx | 0 (Chrome's own account-sync noise excluded) |
| Heading-order skips | 0 |
| Duplicate ids | 0 |
| Tab stops without a visible focus ring | 0 |
| Focus rings below 3:1 | 0 |
| WCAG 2.5.8 target-size failures | 0 |
| Content hidden without JavaScript | 0 (filter hides, all four work cards stay visible) |
| Mobile menu: open, focus-in, body lock, Escape, focus return | pass on all 8 pages |
| Structured data | valid on 7/8 pages (404 is noindex) |

## Remaining Issues

### Critical

None.

### High

None.

### Medium

1. **Webfont payload (~198KB of the homepage's 483KB).** The three subsets in use are
   already the smallest Google ships per family and style. Cutting to the glyphs actually
   used would take it to roughly 40KB, but that needs a subsetting step (`fonttools` +
   `brotli`), which is not installed and cannot be installed without network access and a
   new build dependency. Blocked on a tooling decision, not on Anne.
2. **Four secondary text links sit between 30px and 36px tall** — the Webloom link in the
   About timeline, "Live at alphaone.africa" and "webloom-tech.onrender.com" in the
   case-study metadata, and "Back to all work" in the OnQ sidebar. They pass WCAG 2.5.8
   under the inline exception and sit in text lines, but are below the 44px touch
   guidance; raising them further would visibly pad out those metadata rows.
3. **The homepage is ~10,000px tall on a 320px phone.** Every section carries distinct
   information, but scanability on small screens would improve with the work section above
   capabilities. That is a content-hierarchy decision, not a defect.

### Low

4. `404.html` carries no structured data (it is `noindex`, so the value is nil).
5. Header and footer markup is repeated across nine files — the deliberate cost of having
   no build step, documented in `README.md`.
6. Arrow glyphs (→, ↗) render from the system fallback because they fall outside the
   subset's `unicode-range`; shape therefore varies by platform. Inline SVG would fix it at
   the cost of markup in every arrow, with no accessibility or clarity gain.
7. Canonical URLs, `og:url` and the sitemap all assume `https://annewaithaka.com`.

### Information Still Required From Anne

- **Production domain**, to correct canonical, Open Graph, sitemap and robots if the
  assumption is wrong.
- **Permission to publish the Webloom Tech and OnQ Global screenshots** — they are live
  captures of those organisations' public sites.
- **Availability and location wording**, if either should appear on the site.
- **The contribution split on AlphaOne**, so the team effort can be described precisely.
- **Any publishable numbers** (Core Web Vitals, delivery timelines) for the "Where it
  stands" sections; nothing is fabricated in the meantime.
- **Additional projects**, if the work index should grow beyond one product and three
  engagements.
- **Contact-form backend**, if a real form is wanted; today email is the only route and the
  page says so.
- **Credential URLs** for the four LinkedIn Learning certificates, if they should link out.

## Strongest Areas

- **Responsiveness and layout integrity** — 80 page/viewport combinations with zero
  overflow and zero clipping, including the two container-sizing bugs this pass found.
- **Honest content** — every fact traces to the CV; no metric, client, testimonial or
  outcome is invented, and the case studies say plainly where the evidence stops.
- **Technical hygiene** — no dependencies, no inline styles, no dead CSS, one token system,
  and three small QA tools that reproduce every claim in this report.
- **Progressive enhancement** — the site is fully readable and navigable with JavaScript
  disabled, verified per page.

## Areas Requiring Attention

- Font payload (needs a subsetting step) — the last significant performance item.
- Homepage section order on small screens (work sits below capabilities).
- Content completeness — honest but thin on project evidence until Anne supplies more.

## Recommended Next Steps

1. Confirm the domain, publish, and resubmit the sitemap.
2. Decide on the screenshots and the availability/location wording.
3. Add glyph subsetting when a build step is acceptable.
4. Add one more documented project when one exists.
