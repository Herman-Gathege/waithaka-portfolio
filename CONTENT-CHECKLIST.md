# Content checklist

Everything on the site is drawn from `docs/Anne-Waithaka-CV.pdf` or from public
project material. Nothing has been invented. This file tracks what is still missing
or needs confirmation — nothing here is a placeholder that looks like a finished fact.

## Needs confirmation before launch

- [ ] **Production domain.** The site currently assumes `https://annewaithaka.com` for
      canonical URLs, Open Graph URLs, `sitemap.xml` and `robots.txt`. If the site will
      live elsewhere (a subdomain, a host-provided URL, a GitHub Pages path), update
      `SITE_ORIGIN` in `tools/check-site.mjs`, then the canonical/`og:url` tags on all
      five indexable pages, `sitemap.xml` and `robots.txt`.
- [ ] **Availability and engagement preferences.** The site deliberately makes no claim
      about being open to work, notice periods or rates. Confirm the wording to use, if any.
- [ ] **Location.** No location is stated anywhere, because the CV does not state one.
      Confirm whether "Kenya" or "Nairobi" should appear in the hero and contact page.
- [ ] **Contact form backend.** There is no form: email, phone, LinkedIn and GitHub are
      the contact routes, with a copy-to-clipboard button for the email address. If a
      backend (Formspree, Netlify Forms, an API route) is added later, add the form with
      real labels, error states and a success message.

## Content gaps

- [ ] **Additional portfolio projects.** The CV documents one key project (AlphaOne).
      The other three entries on `/work.html` are engagement case studies built from the
      role descriptions. If there are further projects — client builds, personal tools,
      open-source work — send the details (name, problem, stack, live URL, screenshots) and
      they can be added using `case-studies/_template/`.
- [ ] **Contribution split on AlphaOne.** The CV describes AlphaOne as developed
      collaboratively. The case study says so and attributes only the documented work.
      Confirm the precise split (who built which layer) so the contribution section can be
      more specific.
- [ ] **Project screenshots.** The AlphaOne and Webloom Tech visuals are screenshots of
      the live public sites. Confirm both may be published here. Dashboard screenshots
      (with sample data only, no real tenant information) would strengthen the AlphaOne
      case study considerably.
- [ ] **No published metrics for any project.** Commercial, usage and performance figures
      are deliberately absent. If any can be shared (Core Web Vitals, Lighthouse scores,
      delivery timelines), they can be added to the "Where it stands" sections.
- [ ] **"AI" is not yet a work category.** `/work.html` filters by Software and Web only.
      Webloom Tech lists AI solutions among its services, but the CV documents AI only as
      university coursework, so no AI project is claimed. Add the category when there is
      an AI project to show.
- [ ] **Certification links.** The four certifications are listed as text. LinkedIn
      Learning issue shareable credential URLs — supply them and the entries can link out.
- [ ] **References.** The site says references are available on request, matching the CV.
      Confirm that is still the preferred approach.

## Decisions taken (change if you disagree)

- **CV file renamed** from `docs/Anne_Waithaka_CV (1).pdf` to `docs/Anne-Waithaka-CV.pdf`
  so the download URL is clean. The file itself is unchanged.
- **Photographs.** All four supplied images are used deliberately: the studio portrait in
  the hero and About story, the landscape graduation photo in the education section, the
  rooftop graduation photo in the About page's paired figures, and the outdoor photograph
  as the narrow editorial strip in the introduction. The hero and social card carry a very
  light grade (saturation 0.93) so the portrait sits comfortably beside the warm palette;
  the other three are untouched.
- **No invented captions.** Graduation photographs are captioned "Graduation day" rather
  than naming an institution, because the CV does not say which ceremony each photo is from.
- **No fake testimonials, clients, awards or numbers**, per the brief.

## Nice to have later

- [ ] **Font subsetting.** The three webfont subsets in use are ~198KB of the homepage's
      483KB. Reducing them to the glyphs the site actually uses (roughly 40KB) requires
      `fonttools` + `brotli` at build time — neither is installed, and adding them means a
      new tooling dependency. Worth doing when a build step is acceptable.
- [ ] A branded Open Graph card in the final typeface (the current one is composed from
      the portrait and uses DejaVu Serif, the closest serif available in the build
      environment, not Fraunces).
- [ ] Analytics: no tracking script is installed. Add GA4 with a measurement ID if that
      is wanted, and update the privacy note.
- [ ] A writing or notes section, if Anne wants to publish about front-end practice.
- [ ] 1200×630 social cards per case study, rather than reusing the portrait card.

## Accepted trade-offs (documented, not defects)

- **Touch targets.** All controls meet WCAG 2.5.8 (24×24px) and the primary controls meet
  the 44px touch guidance. Four secondary links that sit inside a line of text — the
  Webloom link in the About timeline, the live URLs in the case-study metadata, and
  "Back to all work" — are 30–36px tall. They are covered by the WCAG inline exception;
  padding them to 44px would visibly loosen those metadata rows.
- **Base colour** is `#171717`, one step darker than the original `#1C1C1C` at the client's
  request. The footer/deepest surface is `#101010` and panels are `#1D1D1C`, so the
  hierarchy inside the dark sections is unchanged.
- **Header and footer markup is repeated in each HTML file.** The site has no build step by
  design; a template step would be required to change that.
- **Arrow glyphs** (→, ↗) come from the system fallback font because they fall outside the
  webfont subsets' `unicode-range`.
