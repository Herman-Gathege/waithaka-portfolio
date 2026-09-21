/**
 * Accessibility, UX and performance audit for the portfolio.
 *
 * For every page it reports:
 *   - heading outline and skipped levels
 *   - duplicate ids
 *   - JSON-LD structured data (parsed and type-checked)
 *   - network failures (any 4xx/5xx the page causes)
 *   - paint metrics: LCP, CLS and byte weight by resource type
 *   - tap-target sizes at mobile width
 *   - keyboard walk: tab order, focus visibility, unreachable controls
 *   - mobile menu: open/close, focus handling, Escape, aria state
 *   - no-JavaScript behaviour: content must remain visible and usable
 *
 * Usage: node tools/audit-site.mjs [--only index] [--json /tmp/audit.json]
 */

import { writeFile } from "node:fs/promises";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  PAGES,
  chromeProfile,
  connectCdp,
  createStaticServer,
  launchChrome,
  sleep,
  waitForLoad,
} from "./lib/harness.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const PORT = Number(flag("port", "4322"));
const DEBUG_PORT = 9334;
const ONLY = flag("only", "");
const JSON_OUT = flag("json", "/tmp/anne-audit.json");

const PERF_HOOK = `
  window.__perf = { lcp: 0, lcpElement: "", cls: 0 };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.startTime > window.__perf.lcp) {
          window.__perf.lcp = entry.startTime;
          window.__perf.lcpElement = entry.element
            ? entry.element.tagName.toLowerCase() + "." + String(entry.element.className || "").slice(0, 40)
            : "";
        }
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__perf.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch (error) {}
`;

const STRUCTURE_PROBE = `(() => {
  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((node) => ({
    level: Number(node.tagName[1]),
    text: node.textContent.replace(/\\s+/g, " ").trim().slice(0, 64),
  }));
  const skipped = [];
  let previous = 0;
  for (const heading of headings) {
    if (previous && heading.level > previous + 1) {
      skipped.push(previous + " -> " + heading.level + ": " + heading.text);
    }
    previous = heading.level;
  }
  const ids = {};
  const duplicateIds = [];
  for (const node of document.querySelectorAll("[id]")) {
    if (ids[node.id]) duplicateIds.push(node.id);
    ids[node.id] = true;
  }
  const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map((node) => {
    try {
      const data = JSON.parse(node.textContent);
      return { valid: true, type: data["@type"] || (data["@graph"] ? "graph" : "unknown") };
    } catch (error) {
      return { valid: false, error: String(error.message).slice(0, 80) };
    }
  });
  const landmarks = {
    header: document.querySelectorAll("header").length,
    nav: document.querySelectorAll("nav").length,
    navNamed: [...document.querySelectorAll("nav")].filter((n) => n.getAttribute("aria-label") || n.getAttribute("aria-labelledby")).length,
    main: document.querySelectorAll("main").length,
    footer: document.querySelectorAll("footer").length,
    article: document.querySelectorAll("article").length,
  };
  const resources = performance.getEntriesByType("resource");
  const bytes = {};
  for (const entry of resources) {
    const type = entry.initiatorType || "other";
    bytes[type] = (bytes[type] || 0) + (entry.transferSize || entry.encodedBodySize || 0);
  }
  const totalBytes = Object.values(bytes).reduce((sum, value) => sum + value, 0);
  return {
    headings,
    skipped,
    duplicateIds,
    jsonLd,
    landmarks,
    perf: {
      lcp: Math.round(window.__perf ? window.__perf.lcp : 0),
      lcpElement: window.__perf ? window.__perf.lcpElement : "",
      cls: Number((window.__perf ? window.__perf.cls : 0).toFixed(4)),
      requests: resources.length,
      totalKB: Math.round(totalBytes / 1024),
      bytesKB: Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, Math.round(v / 1024)])),
    },
  };
})()`;

/* Standalone controls (nav, buttons, card links) need ~44px targets.
   Links that sit inside a sentence are exempt under WCAG 2.2 (inline). */
const TAP_PROBE = `(() => {
  const standalone = [];
  const inline = [];
  const belowMinimum = [];
  const controls = document.querySelectorAll('a[href], button, [role="button"], input, select, textarea');
  for (const node of controls) {
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const box = node.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    /* WCAG 2.5.8 exempts targets that sit inline in a sentence, so a link only
       counts as a standalone control when its block has no other text. */
    const parentText = (node.parentElement ? node.parentElement.textContent : "")
      .replace(/\\s+/g, " ")
      .trim();
    const ownText = (node.textContent || "").replace(/\\s+/g, " ").trim();
    const inSentence = parentText.length > ownText.length + 3;
    const record = {
      tag: node.tagName.toLowerCase(),
      cls: (node.className || "").toString().slice(0, 44),
      text: (node.getAttribute("aria-label") || node.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 40),
      w: Math.round(box.width),
      h: Math.round(box.height),
    };
    if (box.height < 44 || box.width < 24) {
      (inSentence ? inline : standalone).push(record);
    }
    /* WCAG 2.5.8 (AA) requires 24x24 CSS px for pointer targets, exempting
       targets that sit inline in a sentence. */
    if (!inSentence && (box.height < 24 || box.width < 24)) belowMinimum.push(record);
  }
  return { standalone, inlineCount: inline.length, belowMinimum };
})()`;

const MENU_PROBE_OPEN = `(async () => {
  const toggle = document.querySelector("[data-nav-toggle]");
  const header = document.querySelector("[data-header]");
  if (!toggle) return { error: "no toggle" };
  toggle.click();
  await new Promise((done) => setTimeout(done, 420));
  const nav = document.getElementById("primary-nav");
  const active = document.activeElement;
  const navStyle = getComputedStyle(nav);
  return {
    expanded: toggle.getAttribute("aria-expanded"),
    headerState: header.getAttribute("data-nav-open"),
    navVisibility: navStyle.visibility,
    navOpacity: navStyle.opacity,
    bodyLocked: document.body.classList.contains("is-nav-open"),
    focusInsideNav: nav.contains(active),
    focused: active ? active.tagName.toLowerCase() + "." + String(active.className || "").slice(0, 30) : "none",
    firstNavLink: nav.querySelector("a") ? nav.querySelector("a").getAttribute("href") : null,
  };
})()`;

const MENU_PROBE_ESCAPE = `(async () => {
  const toggle = document.querySelector("[data-nav-toggle]");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await new Promise((done) => setTimeout(done, 420));
  return {
    expanded: toggle.getAttribute("aria-expanded"),
    focusReturned: document.activeElement === toggle,
    focused: document.activeElement ? document.activeElement.tagName.toLowerCase() : "none",
    bodyLocked: document.body.classList.contains("is-nav-open"),
  };
})()`;

const NO_JS_PROBE = `(() => {
  const invisible = [];
  for (const node of document.querySelectorAll("[data-reveal], .work-card, .bento__cell, .case-section, .timeline__item")) {
    const style = getComputedStyle(node);
    if (Number(style.opacity) < 0.9 || style.visibility === "hidden" || style.display === "none") {
      invisible.push((node.className || "").toString().slice(0, 40));
    }
  }
  const filter = document.querySelector(".work-filter");
  const cards = [...document.querySelectorAll("[data-types]")];
  return {
    invisibleCount: invisible.length,
    invisibleSample: invisible.slice(0, 5),
    filterDisplay: filter ? getComputedStyle(filter).display : "absent",
    visibleCards: cards.filter((card) => !card.hidden && getComputedStyle(card).display !== "none").length,
    totalCards: cards.length,
    navLinks: document.querySelectorAll("#primary-nav a").length,
  };
})()`;

const results = {};
const flush = (line) => process.stdout.write(`${line}\n`);

async function evaluate(cdp, expression) {
  const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text || "evaluation failed");
  return result.value;
}

async function navigate(cdp, path, { disableScript = false, prime = true } = {}) {
  await cdp.send("Emulation.setScriptExecutionDisabled", { value: disableScript });
  await cdp.send("Network.clearBrowserCache");
  const loaded = waitForLoad(cdp);
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}${path}` });
  await loaded;
  if (!disableScript) {
    await evaluate(cdp, "document.fonts ? document.fonts.ready : Promise.resolve()");
    if (prime) {
      const { PRIME } = await import("./lib/harness.mjs");
      await evaluate(cdp, PRIME);
    }
  }
  await sleep(400);
}

async function tabWalk(cdp, steps = 28) {
  const stops = [];
  await evaluate(cdp, "document.body.focus(); window.scrollTo(0,0);");
  for (let i = 0; i < steps; i += 1) {
    await cdp.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
    });
    await sleep(35);
    const stop = await evaluate(
      cdp,
      `(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return { tag: "body", name: "(document)" };
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        const parse = (value) => {
          const match = String(value).match(/rgba?\\(([^)]+)\\)/);
          if (!match) return null;
          const parts = match[1].split(",").map((part) => parseFloat(part));
          return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] === undefined ? 1 : parts[3] };
        };
        const luminance = (colour) => {
          const channel = (value) => {
            const c = value / 255;
            return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          };
          return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
        };
        const ratio = (a, b) => {
          const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
          return (hi + 0.05) / (lo + 0.05);
        };
        const background = () => {
          let node = el;
          while (node && node !== document.documentElement) {
            const colour = parse(getComputedStyle(node).backgroundColor);
            if (colour && colour.a > 0.5) return colour;
            node = node.parentElement;
          }
          return { r: 28, g: 28, b: 28, a: 1 };
        };
        const outlineColour = parse(style.outlineColor);
        const ringContrast =
          outlineColour && style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0
            ? Number(ratio(outlineColour, background()).toFixed(2))
            : null;
        return {
          tag: el.tagName.toLowerCase(),
          cls: (el.className || "").toString().slice(0, 40),
          name: (el.getAttribute("aria-label") || el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 44),
          href: el.getAttribute("href") || "",
          outline: style.outlineStyle + " " + style.outlineWidth + " " + style.outlineColor,
          shadow: style.boxShadow === "none" ? "" : style.boxShadow.slice(0, 40),
          visible: box.width > 0 && box.height > 0,
          inViewport: box.top >= -2 && box.top < window.innerHeight,
          small: box.height < 44 || box.width < 24,
          bg: "rgb(" + [background().r, background().g, background().b].join(",") + ")",
          ringContrast: ringContrast,
        };
      })()`
    );
    stops.push(stop);
  }
  const noRing = stops.filter(
    (stop) =>
      stop.tag !== "body" &&
      stop.visible &&
      (stop.outline.includes("none") || stop.outline.includes("0px")) &&
      !stop.shadow
  );
  /* WCAG 1.4.11: a focus indicator needs 3:1 against the adjacent colour. */
  const lowContrastRing = stops.filter(
    (stop) => stop.visible && stop.ringContrast !== null && stop.ringContrast < 3
  );
  return { stops, noRing, lowContrastRing };
}

async function run() {
  await rm(JSON_OUT, { force: true });
  const server = await createStaticServer(PORT);
  const profile = chromeProfile("audit");
  const chrome = launchChrome({ port: DEBUG_PORT, profile });
  let chromeStderr = "";
  chrome.stderr.on("data", (chunk) => {
    chromeStderr += chunk.toString();
  });

  const cdp = await connectCdp(DEBUG_PORT);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Log.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: PERF_HOOK });

  const networkProblems = [];
  let currentPage = "";

  cdp.on("Network.responseReceived", ({ response }) => {
    if (response.status >= 400) {
      networkProblems.push(`${currentPage}: HTTP ${response.status} ${response.url.replace(`http://127.0.0.1:${PORT}`, "")}`);
    }
  });
  cdp.on("Network.loadingFailed", ({ errorText, type }) => {
    if (errorText === "net::ERR_ABORTED") return;
    networkProblems.push(`${currentPage}: ${type} failed — ${errorText}`);
  });
  cdp.on("Log.entryAdded", ({ entry }) => {
    if (entry.level === "error" && !/favicon/i.test(entry.text)) {
      networkProblems.push(`${currentPage}: console — ${entry.text} ${entry.url || ""}`.trim());
    }
  });

  const pages = ONLY ? PAGES.filter((page) => page.name.includes(ONLY)) : PAGES;

  for (const page of pages) {
    currentPage = page.name;
    const record = {};

    // Desktop pass: structure, structured data and paint metrics.
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigate(cdp, page.path);
    Object.assign(record, await evaluate(cdp, STRUCTURE_PROBE));

    // Mobile pass: tap targets, mobile menu behaviour, keyboard walk.
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await navigate(cdp, page.path, { prime: false });
    record.tap = await evaluate(cdp, TAP_PROBE);
    record.menu = {
      open: await evaluate(cdp, MENU_PROBE_OPEN),
      afterEscape: await evaluate(cdp, MENU_PROBE_ESCAPE),
    };
    record.menu.afterEscape.linkFocusable = await evaluate(
      cdp,
      `(() => {
        const nav = document.getElementById("primary-nav");
        const link = nav.querySelector("a");
        const box = link.getBoundingClientRect();
        const style = getComputedStyle(link);
        return { visibility: style.visibility, height: Math.round(box.height) };
      })()`
    );

    // Keyboard walk at desktop width, where the nav is inline.
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigate(cdp, page.path, { prime: false });
    record.keyboard = await tabWalk(cdp);

    // No-JavaScript pass.
    await navigate(cdp, page.path, { disableScript: true, prime: false });
    record.noJs = await evaluate(cdp, NO_JS_PROBE);
    await cdp.send("Emulation.setScriptExecutionDisabled", { value: false });

    results[page.name] = record;
    flush(
      `${page.name.padEnd(14)} lcp=${String(record.perf.lcp).padStart(4)}ms cls=${record.perf.cls} ` +
        `weight=${String(record.perf.totalKB).padStart(4)}KB taps=${record.tap.standalone.length} ` +
        `noRing=${record.keyboard.noRing.length} skippedH=${record.skipped.length}`
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    pages: results,
    networkProblems: [...new Set(networkProblems)],
    chromeErrors: /ERROR/.test(chromeStderr) ? chromeStderr.split("\n").filter((l) => /ERROR/.test(l)).slice(0, 5) : [],
  };

  await writeFile(JSON_OUT, JSON.stringify(report, null, 2));

  flush("\n--- findings ---");
  const lines = [];
  for (const [name, record] of Object.entries(results)) {
    if (record.skipped.length) lines.push(`${name}: heading level skipped — ${record.skipped.join(" | ")}`);
    if (record.duplicateIds.length) lines.push(`${name}: duplicate ids — ${record.duplicateIds.join(", ")}`);
    for (const jsonLd of record.jsonLd) {
      if (!jsonLd.valid) lines.push(`${name}: invalid JSON-LD — ${jsonLd.error}`);
    }
    if (!record.jsonLd.length) lines.push(`${name}: no structured data`);
    if (record.tap.standalone.length) {
      lines.push(
        `${name}: ${record.tap.standalone.length} control(s) under 44px ` +
          `(${record.tap.belowMinimum.length} under the 24px WCAG 2.5.8 minimum) — ` +
          record.tap.standalone
            .slice(0, 6)
            .map((t) => `${t.tag}.${t.cls} ${t.w}x${t.h} “${t.text}”`)
            .join(" ; ")
      );
    }
    if (record.tap.belowMinimum.length) {
      lines.push(
        `${name}: WCAG 2.5.8 failures — ` +
          record.tap.belowMinimum
            .slice(0, 6)
            .map((t) => `${t.tag}.${t.cls} ${t.w}x${t.h} “${t.text}”`)
            .join(" ; ")
      );
    }
    if (record.keyboard.noRing.length) {
      lines.push(
        `${name}: ${record.keyboard.noRing.length} tab stop(s) without a focus indicator — ` +
          record.keyboard.noRing.slice(0, 5).map((s) => `${s.tag}.${s.cls} “${s.name}”`).join(" ; ")
      );
    }
    if (record.keyboard.lowContrastRing.length) {
      lines.push(
        `${name}: ${record.keyboard.lowContrastRing.length} focus ring(s) below 3:1 (WCAG 1.4.11) — ` +
          record.keyboard.lowContrastRing
            .slice(0, 5)
            .map((s) => `${s.tag}.${s.cls} “${s.name}” ring ${s.ringContrast}:1 on ${s.bg}`)
            .join(" ; ")
      );
    }
    if (record.menu.open.expanded !== "true") lines.push(`${name}: mobile menu did not open`);
    if (!record.menu.open.focusInsideNav) lines.push(`${name}: focus did not move into the open mobile menu`);
    if (record.menu.afterEscape.expanded !== "false") lines.push(`${name}: Escape did not close the mobile menu`);
    if (!record.menu.afterEscape.focusReturned) lines.push(`${name}: focus did not return to the toggle after Escape`);
    if (record.noJs.invisibleCount) {
      lines.push(`${name}: ${record.noJs.invisibleCount} element(s) invisible without JS — ${record.noJs.invisibleSample.join(", ")}`);
    }
    if (record.perf.cls > 0.1) lines.push(`${name}: CLS ${record.perf.cls} exceeds 0.1`);
    if (record.perf.lcp > 2500) lines.push(`${name}: LCP ${record.perf.lcp}ms exceeds 2.5s`);
    if (record.landmarks.main !== 1) lines.push(`${name}: expected one <main>, found ${record.landmarks.main}`);
    if (record.landmarks.navNamed < record.landmarks.nav) lines.push(`${name}: ${record.landmarks.nav - record.landmarks.navNamed} nav landmark(s) without a name`);
  }
  lines.push(...report.networkProblems.map((line) => `network — ${line}`));

  if (!lines.length) flush("none");
  lines.forEach((line) => flush(`  ${line}`));
  flush(`\nFull report: ${JSON_OUT}`);

  chrome.kill("SIGTERM");
  server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
