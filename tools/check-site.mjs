/**
 * Static checks for the portfolio.
 *
 *   - every internal link, asset and srcset entry resolves
 *   - fragments (#anchors) exist on their target page
 *   - per-page SEO metadata, headings, language and skip link
 *   - images have alt text and intrinsic dimensions
 *   - no inline styles, no third-party stylesheets or scripts
 *   - sitemap covers every indexable page and points at real files
 *   - colour tokens meet WCAG AA contrast for text
 *
 * Usage: node tools/check-site.mjs
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SKIP_DIRS = new Set(["node_modules", ".git", ".agents", ".codex"]);
const NOINDEX_PAGES = new Set(["404.html"]);
const TEMPLATE_PREFIX = "case-studies/_template/";
const SITE_ORIGIN = "https://annewaithaka.com";
const EXTERNAL_MARKER = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

const errors = [];
const warnings = [];
const notes = [];

const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

/* ------------------------------------------------------------------ files */

async function walk(dir, found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".well-known") continue;
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(absolute, found);
    } else {
      found.push(relative(ROOT, absolute).split(sep).join("/"));
    }
  }
  return found;
}

const files = await walk(ROOT);
const fileSet = new Set(files);
const htmlPages = files.filter((file) => file.endsWith(".html"));

/* ------------------------------------------------------- colour contrast */

function parseColor(value) {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((c) => c + c)
            .join("")
        : hex[1];
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgba = value.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/i
  );
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }

  return null;
}

function over(foreground, background) {
  if (foreground.a >= 1) return foreground;
  return {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

async function checkContrast() {
  const css = await readFile(join(ROOT, "assets/css/tokens.css"), "utf8");
  const tokens = new Map();

  for (const [, name, value] of css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/gi)) {
    tokens.set(name, value.trim());
  }

  const resolveToken = (name, depth = 0) => {
    if (depth > 5) return null;
    const raw = tokens.get(name.replace(/^--/, ""));
    if (!raw) return null;
    const reference = raw.match(/^var\(--([a-z0-9-]+)\)$/i);
    if (reference) return resolveToken(reference[1], depth + 1);
    return parseColor(raw);
  };

  const pairs = [
    ["ink-on-light", "bg-cream", 4.5, "body text on cream"],
    ["ink-on-light-muted", "bg-cream", 4.5, "muted text on cream"],
    ["ink-on-light-faint", "bg-cream", 4.5, "small labels on cream"],
    ["olive-deep", "bg-cream", 4.5, "olive accents on cream"],
    ["orange-deep", "bg-cream", 4.5, "links on cream"],
    ["ink-on-light-muted", "bg-cream-raised", 4.5, "muted text on raised panels"],
    ["ink-on-dark", "bg-dark", 4.5, "body text on charcoal"],
    ["ink-on-dark-muted", "bg-dark", 4.5, "muted text on charcoal"],
    ["ink-on-dark-faint", "bg-dark", 4.5, "small labels on charcoal"],
    ["gold", "bg-dark", 4.5, "gold accents on charcoal"],
    ["bg-dark", "burnt-orange", 4.5, "button label on burnt orange"],
    ["text-light", "olive", 4.5, "label on olive (active filter)"],
    ["ink-on-dark-muted", "bg-dark-soft", 4.5, "muted text on soft panels"],
  ];

  for (const [fgName, bgName, minimum, label] of pairs) {
    const fg = resolveToken(fgName);
    const bg = resolveToken(bgName);
    if (!fg || !bg) {
      warn(`contrast: could not resolve ${fgName} or ${bgName}`);
      continue;
    }
    const value = ratio(over(fg, bg), bg);
    const rounded = value.toFixed(2);
    if (value < minimum) {
      fail(`contrast ${fgName} on ${bgName} is ${rounded}:1 (needs ${minimum}:1) — ${label}`);
    } else {
      notes.push(`contrast ${label}: ${rounded}:1`);
    }
  }
}

/* --------------------------------------------------------------- helpers */

function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function attribute(html, pattern) {
  const match = html.match(pattern);
  return match ? match[1] : null;
}

function pagePathFromUrl(url) {
  const path = url.replace(SITE_ORIGIN, "").replace(/^\/+/, "");
  return path === "" ? "index.html" : path.endsWith("/") ? `${path}index.html` : path;
}

function resolveLocal(page, reference) {
  const clean = reference.split("#")[0].split("?")[0];
  if (!clean) return null;
  if (EXTERNAL_MARKER.test(clean)) return null;
  // 404.html declares <base href="/">, so its links resolve from the site root.
  const base = page === "404.html" ? "" : dirname(page);
  const combined = clean.startsWith("/")
    ? clean.slice(1)
    : normalize(join(base, clean)).split(sep).join("/");
  return combined.replace(/^\.\//, "");
}

function exists(target) {
  if (target.endsWith("/")) return fileSet.has(`${target}index.html`);
  if (fileSet.has(target)) return true;
  if (fileSet.has(`${target}/index.html`)) return true;
  return false;
}

function collectReferences(html) {
  const references = [];
  for (const [, value] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    references.push(value);
  }
  for (const [, value] of html.matchAll(/\s(?:srcset|imagesrcset)="([^"]+)"/g)) {
    for (const candidate of value.split(",")) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url) references.push(url);
    }
  }
  return references;
}

/* ----------------------------------------------------------- page checks */

const titles = new Map();
const descriptions = new Map();
const ids = new Map();

for (const page of htmlPages) {
  const html = await readFile(join(ROOT, page), "utf8");
  const body = stripComments(html);
  const isTemplate = page.startsWith(TEMPLATE_PREFIX);
  const isNoIndex = NOINDEX_PAGES.has(page) || isTemplate;

  ids.set(
    page,
    new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]))
  );

  if (!/^<!doctype html>/i.test(html.trimStart())) fail(`${page}: missing <!doctype html>`);
  if (!/<html lang="en">/.test(html)) fail(`${page}: <html> needs lang="en"`);
  if (!/class="skip-link"/.test(body)) fail(`${page}: missing skip link`);

  for (const sheet of ["fonts.css", "tokens.css", "main.css"]) {
    if (!body.includes(`assets/css/${sheet}`)) fail(`${page}: does not load assets/css/${sheet}`);
  }
  if (!body.includes("assets/js/main.js")) warn(`${page}: does not load assets/js/main.js`);

  const h1s = [...body.matchAll(/<h1[\s>]/g)].length;
  if (h1s !== 1) fail(`${page}: expected exactly one <h1>, found ${h1s}`);

  if (/<link[^>]+rel="stylesheet"[^>]+href="https?:/i.test(body)) {
    fail(`${page}: loads a third-party stylesheet`);
  }
  if (/<script[^>]+src="https?:/i.test(body)) fail(`${page}: loads a third-party script`);

  if (/style="[^"]+"/.test(body)) {
    fail(`${page}: inline style attribute found — move it into the stylesheet`);
  }

  if (!isNoIndex) {
    const title = attribute(body, /<title>([^<]+)<\/title>/);
    const description = attribute(body, /<meta\s+name="description"\s+content="([^"]+)"/);
    const canonical = attribute(body, /<link\s+rel="canonical"\s+href="([^"]+)"/);

    if (!title) fail(`${page}: missing <title>`);
    else if (title.length < 20 || title.length > 70) {
      warn(`${page}: title is ${title.length} characters (aim for 20–70)`);
    }

    if (!description) fail(`${page}: missing meta description`);
    else if (description.length < 70 || description.length > 175) {
      warn(`${page}: meta description is ${description.length} characters (aim for 70–175)`);
    }

    if (!canonical) fail(`${page}: missing canonical URL`);
    else {
      if (!canonical.startsWith(SITE_ORIGIN)) {
        fail(`${page}: canonical should use ${SITE_ORIGIN} (found ${canonical})`);
      }
      if (pagePathFromUrl(canonical) !== page) {
        fail(`${page}: canonical points at ${canonical}`);
      }
    }

    for (const tag of [
      'property="og:title"',
      'property="og:description"',
      'property="og:url"',
      'property="og:image"',
      'property="og:type"',
      'name="twitter:card"',
      'name="twitter:title"',
      'name="twitter:image"',
    ]) {
      if (!body.includes(tag)) fail(`${page}: missing ${tag}`);
    }

    if (title) {
      if (titles.has(title)) fail(`${page}: duplicate title with ${titles.get(title)}`);
      titles.set(title, page);
    }
    if (description) {
      if (descriptions.has(description)) {
        fail(`${page}: duplicate meta description with ${descriptions.get(description)}`);
      }
      descriptions.set(description, page);
    }
  }

  // Images
  for (const [tag] of body.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt=/.test(tag)) {
      fail(`${page}: <img> without alt — ${tag.slice(0, 80)}`);
      continue;
    }
    const alt = attribute(tag, /\salt="([^"]*)"/);
    if (alt && /\.(jpe?g|png|webp|gif|svg)\b/i.test(alt)) {
      warn(`${page}: alt text looks like a filename — “${alt}”`);
    }
    if (!/\swidth=/.test(tag) || !/\sheight=/.test(tag)) {
      warn(`${page}: <img> without width/height risks layout shift — alt “${alt}”`);
    }
  }

  // References
  for (const reference of collectReferences(body)) {
    const target = resolveLocal(page, reference);
    if (!target) continue;
    if (!exists(target)) {
      fail(`${page}: broken reference → ${reference}`);
      continue;
    }

    const fragment = reference.split("#")[1];
    if (fragment) {
      const targetPage = target.endsWith("/") ? `${target}index.html` : target;
      const targetIds = ids.get(targetPage);
      if (targetIds && !targetIds.has(fragment)) {
        warn(`${page}: fragment #${fragment} not found in ${targetPage}`);
      }
    }
  }
}

/* --------------------------------------------------------------- sitemap */

const sitemap = await readFile(join(ROOT, "sitemap.xml"), "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const sitemapFiles = new Set(sitemapUrls.map(pagePathFromUrl));

for (const url of sitemapUrls) {
  if (!url.startsWith(SITE_ORIGIN)) {
    fail(`sitemap: ${url} is outside ${SITE_ORIGIN}`);
    continue;
  }
  if (!exists(pagePathFromUrl(url))) fail(`sitemap: ${url} does not map to a file`);
}

for (const page of htmlPages) {
  if (NOINDEX_PAGES.has(page) || page.startsWith(TEMPLATE_PREFIX)) continue;
  if (!sitemapFiles.has(page)) fail(`sitemap: ${page} is missing from sitemap.xml`);
}

const robots = await readFile(join(ROOT, "robots.txt"), "utf8");
if (!robots.includes("Sitemap:")) fail("robots.txt: no sitemap reference");
if (!robots.includes("/case-studies/_template/")) {
  warn("robots.txt: the case-study template is not disallowed");
}

/* ---------------------------------------------------------------- report */

await checkContrast();

const groups = [
  ["ERRORS", errors],
  ["WARNINGS", warnings],
];

console.log(`Checked ${htmlPages.length} HTML pages, ${files.length} files total.\n`);

for (const [label, list] of groups) {
  console.log(`${label}: ${list.length}`);
  list.forEach((line) => console.log(`  ${label === "ERRORS" ? "✗" : "!"} ${line}`));
  console.log("");
}

if (!warnings.length) console.log("No warnings.\n");
console.log(
  `Contrast pairs verified: ${notes.length ? `${notes.length} passing` : "none"}` +
    (errors.length ? `\n\nFAILED with ${errors.length} error(s).` : "\n\nAll checks passed.")
);

if (errors.length) process.exitCode = 1;
