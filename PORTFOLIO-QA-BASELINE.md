# Anne Portfolio QA — Baseline

Date: 2026-09-21
Scope: current working tree of `/home/remington/Projects/2026-projects/anne-portfolio`
Method: static analysis (`tools/check-site.mjs`), live browser audit
(`tools/audit-site.mjs`) and visual regression runs (`tools/qa-visual.mjs`) against a
local server in headless Chrome. Every claim below is reproduced by a command in this
repository.

## Scorecard

Scanability: 7/10
Accessibility: 6.5/10
Responsiveness: 8.5/10
Information Clarity: 7.5/10
Navigation: 7.5/10
Visual Hierarchy: 8/10
Content Quality: 8/10
Project UX: 7.5/10
Mobile UX: 6.5/10
Performance: 7.5/10
SEO: 8.5/10
Interaction Quality: 7.5/10
Visual Consistency: 8.5/10
Technical Quality: 8/10
Recruiter/Client Usability: 7/10

## Critical Issues

None. No broken route, no dead link, no console error, no horizontal overflow, no
missing content, no broken image. Verified: `npm run check` reports 0 errors /
0 warnings across 9 pages; the browser audit reports no HTTP 4xx/5xx and no console
errors originating from the site.

## High Priority

### H1 — Focus indicator is invisible on every filled button (WCAG 1.4.11)

- **File:** `assets/css/main.css:95` (`:focus-visible`), used by
  `assets/css/main.css` `.btn--primary` and `.work-filter__btn[aria-pressed="true"]`.
- **Problem:** the global focus ring is `2px solid var(--burnt-orange)`. On a
  `--burnt-orange` filled button the ring measures **1:1** against the button
  background; on the olive active filter it measures **1.39:1**. The ring is drawn —
  it just cannot be seen.
- **Evidence:** `node tools/audit-site.mjs` →
  `index: 4 focus ring(s) below 3:1 … a.btn btn--primary “Let’s talk” ring 1:1 on rgb(201,108,58)`,
  reproduced on all 8 pages (2–4 instances each).
- **Why it matters:** a keyboard user loses their position at the most important
  control on the page. This is the single clearest accessibility failure in the build.
- **Fix:** give filled controls a light ring plus a dark halo so the indicator holds
  against any adjacent colour.

### H2 — Standalone controls below the 44px touch target (15–26 per page)

- **Files:** `assets/css/main.css` — `.link-arrow` (20px tall), `.footer-list a`
  (14px), `.contact-list__value a` (28px), `.work-filter__btn` (38px), `.nav-toggle`
  (39px), `.wordmark` (27px), `.skip-link` (42px), `.breadcrumb a` (14px).
- **Evidence:** `tools/audit-site.mjs` tap-target probe at 390px:
  `index: 21 undersized standalone control(s)`, `work: 26`, `contact: 19`,
  `case-alphaone: 18`.
- **Why it matters:** on a phone the footer, the case-study "Read case study" links and
  the work filters are the main navigation affordances, and they are the hardest things
  on the page to hit.
- **Fix:** raise primary controls to ≥44px; raise secondary inline-style links
  (breadcrumbs) to the WCAG 2.5.8 minimum of 24px, with the distinction documented.

### H3 — Unnamed `<nav>` landmark on all three case studies

- **File:** `case-studies/*/index.html` — `<nav class="case-nav">`.
- **Evidence:** `case-alphaone: 1 nav landmark(s) without a name` (same on webloom,
  onq). The breadcrumb and primary nav are named; the previous/next nav is not.
- **Why it matters:** screen-reader users navigating by landmark hear two identical
  "navigation" regions with no way to tell which is which.
- **Fix:** add `aria-label="Case study navigation"`.

## Medium Priority

### M1 — Inconsistent label for the same destination

- **File:** `contact.html` (header CTA) — "Email Anne"; every other page uses "Let's
  talk" for the same nav slot.
- **Why it matters:** the persistent CTA changes its name on one page, which reads as a
  different action.
- **Fix:** use "Let's talk" everywhere; the destination is unchanged.

### M2 — No structured data on the About page

- **File:** `about.html`.
- **Evidence:** `about: no structured data` in the audit.
- **Why it matters:** the About page is the natural place for `AboutPage` + `Person`
  markup; 404 is `noindex` so its absence is fine.
- **Fix:** add `AboutPage` with the same `Person` entity used on the homepage.

### M3 — Font payload dominates page weight

- **Files:** `assets/fonts/fraunces-normal-300-700-latin.woff2` (67KB),
  `fraunces-italic-300-600-latin.woff2` (81KB), `work-sans-normal-300-600-latin.woff2`
  (50KB).
- **Evidence:** homepage `weight=481KB`, of which `css: 243KB` — fonts requested from a
  stylesheet are attributed to `css` by `initiatorType`, i.e. ~198KB of webfont for
  ~60KB of CSS.
- **Why it matters:** it is the largest single cost on every page, on every visit.
- **Fix (partial):** the subsets are already minimal per family/style and
  `font-display: swap` is set, so runtime behaviour is sound; glyph-level subsetting
  needs `fonttools`/`brotli`, which are not installed and cannot be installed offline
  (network + new build dependency). Documented as a follow-up rather than faked.

### M4 — Several images are encoded heavier than their display size

- **Files:** `images/optimized/outdoor-702.webp` (189KB), `outdoor-480.webp` (102KB),
  `graduation-2-960.webp` (96KB), `hero-1024.webp` (87KB).
- **Evidence:** `du -b images/optimized/*`; the About page weighs 514KB.
- **Fix:** re-encode at a quality that keeps the photograph intact (verified visually)
  and drop the page weight.

### M5 — The CV is one scroll away from the hero

- **File:** `index.html` hero.
- **Problem:** the hero offers "Explore work" and "Let's talk"; the CV download first
  appears in the closing CTA band and the education section.
- **Why it matters:** a recruiter's most common next action is "get the CV".
- **Fix:** add a quiet tertiary "Download CV (PDF)" link to the hero actions.

### M6 — Metadata styling sits at 11.5px

- **File:** `assets/css/main.css` — `.tag { font-size: 0.72rem }` (≈11.5px), used for
  every technology chip on the homepage, work page, About page and all case studies.
- **Why it matters:** it is the smallest text on the site and it carries real
  information (the stack).
- **Fix:** raise to 0.75rem (12px) — no layout change at any measured width.

## Low Priority

### L1 — Sitemap has no `<lastmod>`

- **File:** `sitemap.xml`.
- **Why it matters:** minor crawl-scheduling signal only.
- **Fix:** add a `<lastmod>` per URL.

### L2 — Header/footer markup is repeated in nine files

- **Files:** all `*.html`.
- **Why it matters:** a change to navigation must be applied nine times.
- **Assessment:** this is the deliberate trade-off of a no-build static site
  (documented in `README.md`). Fixing it means introducing a build step, which the
  brief forbids without reason. Left as-is.

### L3 — Arrow glyphs (→, ↗) render from the fallback font

- **File:** `assets/css/main.css` — `.link-arrow__glyph`, `.external::after`,
  `.site-nav__link::after` use `content: "→"` / `"↗"` (U+2192, U+2197), which are
  outside the downloaded subset's `unicode-range`.
- **Why it matters:** arrow shape differs by platform.
- **Assessment:** the fallback is a system sans on every target platform and the arrows
  read correctly; replacing them with inline SVG would add markup to score no
  accessibility or clarity gain. Noted, not changed.

### L4 — The homepage is very long on a phone (~10,000px at 320px)

- **File:** `index.html`.
- **Assessment:** all six sections carry distinct information and each has its own
  heading; the length is a consequence of the editorial breadth, not padding. Noted.

## Evidence

Commands used for this baseline (all run from the repository root):

```bash
npm run check                                   # links, metadata, alt text, sitemap, contrast
node tools/audit-site.mjs --json /tmp/anne-audit-baseline.json
node tools/qa-visual.mjs --out /tmp/qa-baseline  # overflow + console at 10 widths
```

Measured results at baseline:

| Page | LCP | CLS | Weight | Undersized targets | Ring < 3:1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| index | 1472ms | 0.0003 | 481KB | 21 | 4 |
| work | 256ms | 0.0052 | 289KB | 26 | 3 |
| about | 296ms | 0.0167 | 514KB | 16 | 3 |
| contact | 232ms | 0.0014 | 254KB | 19 | 2 |
| 404 | 256ms | 0.0018 | 174KB | 15 | 2 |
| case-alphaone | 316ms | 0.0012 | 332KB | 18 | 2 |
| case-webloom | 252ms | 0.0012 | 294KB | 18 | 2 |
| case-onq | 208ms | 0.0014 | 254KB | 17 | 2 |

Verified clean at baseline: zero horizontal overflow at 320/375/390/414/768/820/1024/
1280/1440/1920px; zero clipped elements; no heading-level skips; no duplicate ids; valid
JSON-LD; no network or console errors; mobile menu opens, moves focus into the panel,
locks the page, closes on Escape and returns focus to the toggle; with JavaScript
disabled no content is hidden and all four work cards remain visible.
