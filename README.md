# Anne Nyambura Waithaka — portfolio

A static portfolio for a front-end engineer: warm editorial minimalism, bento layouts and
restrained glassmorphism. No framework, no build step, no runtime dependencies — nine HTML
pages, three stylesheets, one small JavaScript file and a set of optimised images.

## Pages

```
index.html                      Homepage — hero, introduction, capabilities, work, experience
about.html                      Story, full experience, skills, working principles, education
work.html                       Filterable project index
contact.html                    Contact details and CV download
404.html                        Error page (served from the site root; uses <base href="/">)
case-studies/alphaone/          Featured case study
case-studies/webloom-tech/      Engagement case study
case-studies/onq-global/        Engagement case study
case-studies/_template/         Copy this to start a new case study (noindex, not in the sitemap)
```

## Working on the site

```bash
npm run check     # links, metadata, alt text, sitemap, contrast — no dependencies
npm run audit     # accessibility, tap targets, keyboard, no-JS, LCP/CLS/weight (needs Chrome)
npm run serve     # http://localhost:4321 (python3 -m http.server)
npm run qa        # headless-Chrome screenshots + overflow/console report (needs Chrome)
```

`npm run qa` measures ten widths (320–1920px), keeps screenshots for 320/390/768/1440 in
`/tmp/anne-portfolio-qa`, and fails on horizontal overflow, clipped content, broken images
or console errors. Add `--only index` or `--section "#introduction"` to narrow it down.

`npm run audit` writes `/tmp/anne-audit.json` and prints findings per page: heading outline,
duplicate ids, JSON-LD, network 4xx/5xx, LCP/CLS and byte weight, tap-target sizes, a
keyboard walk with focus-ring contrast, mobile-menu behaviour and a no-JavaScript pass.
Both tools share `tools/lib/harness.mjs`.

The audit reports from the last full pass are in `PORTFOLIO-QA-BASELINE.md` and
`PORTFOLIO-QA-FINAL.md`.

## Structure

```
assets/css/tokens.css   Design tokens: palette, type scale, space, motion, glass, layers
assets/css/fonts.css    Self-hosted variable fonts (Fraunces, Work Sans)
assets/css/main.css     All components, mobile-first
assets/js/main.js       Header state, mobile nav, reveal, work filter, copy-to-clipboard
assets/img/             Favicon and touch icons
assets/fonts/           woff2 subsets (latin, latin-ext)
images/                 The four supplied photographs (originals, untouched)
images/optimized/       Resized WebP + JPEG derivatives used by the pages
images/og-card.jpg      Social preview card
docs/Anne-Waithaka-CV.pdf
tools/check-site.mjs    Static validation (run before every deploy)
tools/audit-site.mjs    Browser audit: accessibility, performance, keyboard, no-JS
tools/qa-visual.mjs     Visual harness: screenshots, overflow, clipping, console
tools/lib/harness.mjs   Shared static server, CDP client and page/viewport matrix
CONTENT-CHECKLIST.md    What still needs a decision or new material
```

## Conventions

- **Paths are relative** (`assets/css/main.css`, `../../work.html`) so the site works from a
  domain root, a sub-path and the local filesystem. The single exception is `404.html`,
  which declares `<base href="/">` because hosts serve it for arbitrary URLs.
- **Theming**: a section carries `theme-dark` or `theme-cream`, which sets `--rule`,
  `--muted`, `--panel` and `--accent-ink`. Components read those variables instead of
  hard-coding colours, so the same markup works on charcoal and on cream.
- **No inline styles.** The spacing helpers (`.mt-sm`, `.mt-lg`, `.mt-xl`) are the only
  single-purpose utilities.
- **JavaScript is an enhancement.** Without it: the mobile navigation falls back to the
  static header, reveal animations never hide content, the work filter is hidden so every
  project stays visible, and the copy-email button disappears in favour of the `mailto:` link.
- **Motion** stays between 180ms and 400ms on `ease`/`ease-out`, and `prefers-reduced-motion`
  removes it entirely.
- **Images** are served as WebP through `<picture>` with a JPEG fallback, explicit
  `width`/`height`, `loading="lazy"` below the fold and `fetchpriority="high"` for the hero.

## Deploying

Upload the repository as-is (any static host: Netlify, Cloudflare Pages, GitHub Pages, S3,
DigitalOcean App Platform). Two host settings matter:

1. Serve `404.html` for unknown paths, from the domain root.
2. Keep the `/docs` folder public if the CV download links are to work, or remove those
   links deliberately.

Before going live, update the domain in `sitemap.xml`, `robots.txt` and the canonical /
Open Graph tags — see `CONTENT-CHECKLIST.md`.
