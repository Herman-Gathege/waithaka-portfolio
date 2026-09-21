/**
 * Visual QA harness: screenshots, horizontal-overflow and clipping detection,
 * and console errors for every page at ten viewport widths.
 *
 * Usage: node tools/qa-visual.mjs [--out /tmp/qa] [--only index]
 *        [--section "#introduction"] [--nomobile] [--eval "<expression>"]
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PAGES,
  VIEWPORTS,
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

const PORT = Number(flag("port", "4321"));
const DEBUG_PORT = 9333;
const OUT = flag("out", "/tmp/anne-portfolio-qa");
const ONLY = flag("only", "");
const SECTION = flag("section", "");
const EVAL = flag("eval", "");
/* Mobile emulation widens the layout viewport when content overflows, which can
   hide the offending element. --nomobile measures with a strict viewport. */
const NO_MOBILE = args.includes("--nomobile");

/* Scroll the page once so reveal observers fire and lazy images load, record any
   reveal that never fired, then force them visible so screenshots are complete. */
const PRIME = `(async () => {
  const html = document.documentElement;
  const previous = html.style.scrollBehavior;
  html.style.scrollBehavior = "auto";
  const step = Math.max(240, Math.round(window.innerHeight * 0.8));
  const end = document.body.scrollHeight;
  for (let y = 0; y < end; y += step) {
    window.scrollTo(0, y);
    await new Promise((done) => setTimeout(done, 110));
  }
  window.scrollTo(0, 0);
  await new Promise((done) => setTimeout(done, 400));
  html.style.scrollBehavior = previous;

  const hidden = [...document.querySelectorAll("[data-reveal]")]
    .filter((node) => !node.classList.contains("is-visible"))
    .map((node) => (node.className || "").toString().slice(0, 50));
  document.querySelectorAll("[data-reveal]").forEach((node) => node.classList.add("is-visible"));
  await new Promise((done) => setTimeout(done, 140));
  return hidden;
})()`;

const PROBE = `(() => {
  const doc = document.documentElement;
  const width = doc.clientWidth;
  const offenders = [];
  for (const node of document.querySelectorAll("body *")) {
    const box = node.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    const style = getComputedStyle(node);
    const overflowRight = box.right - width;
    const overflowLeft = box.left;
    if (overflowRight > 1 || overflowLeft < -1) {
      offenders.push({
        tag: node.tagName.toLowerCase(),
        cls: (node.className || "").toString().slice(0, 70),
        left: Math.round(overflowLeft),
        right: Math.round(overflowRight),
        w: Math.round(box.width),
        pos: style.position,
        vis: style.visibility,
      });
    }
  }
  offenders.sort((a, b) => Math.max(b.right, -b.left) - Math.max(a.right, -a.left));

  const clipped = [];
  for (const node of document.querySelectorAll("body *")) {
    /* The .sr-only pattern clips a 1px box on purpose. */
    if (node.classList.contains("sr-only")) continue;
    const style = getComputedStyle(node);
    const hidden = [style.overflow, style.overflowX, style.overflowY].some(
      (value) => value === "hidden" || value === "clip"
    );
    if (!hidden) continue;
    if (node.clientWidth <= 1 && node.clientHeight <= 1) continue;
    const dx = node.scrollWidth - node.clientWidth;
    const dy = node.scrollHeight - node.clientHeight;
    if (dx > 2 || dy > 2) {
      clipped.push({
        tag: node.tagName.toLowerCase(),
        cls: (node.className || "").toString().slice(0, 50),
        dx,
        dy,
      });
    }
  }

  return {
    viewport: width,
    scrollWidth: doc.scrollWidth,
    overflow: doc.scrollWidth - width,
    offenders: offenders.slice(0, 8),
    clipped: clipped.slice(0, 8),
    fonts: document.fonts ? document.fonts.status : "n/a",
    h1: document.querySelectorAll("h1").length,
    imgsMissingAlt: [...document.images].filter((img) => !img.hasAttribute("alt")).length,
    brokenImages: [...document.images]
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.currentSrc || img.src),
  };
})()`;

async function evaluate(cdp, expression) {
  const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text || "evaluation failed");
  return result.value;
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const server = await createStaticServer(PORT);
  const profile = chromeProfile("visual");
  const chrome = launchChrome({ port: DEBUG_PORT, profile });
  let chromeStderr = "";
  chrome.stderr.on("data", (chunk) => {
    chromeStderr += chunk.toString();
  });

  const cdp = await connectCdp(DEBUG_PORT);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");

  const problems = [];
  const failures = [];
  let currentPage = "";
  const record = (message) => problems.push(`${currentPage}: ${message}`);

  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) =>
    record(`exception — ${exceptionDetails.exception?.description || exceptionDetails.text}`)
  );
  cdp.on("Runtime.consoleAPICalled", ({ type, args: logged }) => {
    if (type !== "error" && type !== "warning") return;
    const text = logged.map((arg) => arg.value ?? arg.description ?? arg.type).join(" ");
    if (/favicon/i.test(text)) return;
    record(`console.${type} — ${text}`);
  });
  cdp.on("Log.entryAdded", ({ entry }) => {
    if (entry.level === "error" && !/favicon/i.test(entry.text)) {
      record(`log — ${entry.text} ${entry.url || ""}`.trim());
    }
  });

  const pages = ONLY ? PAGES.filter((page) => page.name.includes(ONLY)) : PAGES;

  for (const page of pages) {
    currentPage = page.name;

    for (const viewport of VIEWPORTS) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: NO_MOBILE ? false : viewport.mobile,
      });

      const loaded = waitForLoad(cdp);
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}${page.path}` });
      await loaded;
      await evaluate(cdp, "document.fonts ? document.fonts.ready : Promise.resolve()");
      const hiddenReveals = await evaluate(cdp, PRIME);
      await sleep(600);

      const data = await evaluate(cdp, PROBE);
      data.hiddenReveals = hiddenReveals || [];

      if (data.overflow > 1) {
        failures.push(
          `${page.name} @${viewport.label}px — horizontal overflow ${data.overflow}px ` +
            JSON.stringify(data.offenders)
        );
      }
      if (data.brokenImages.length) {
        failures.push(
          `${page.name} @${viewport.label}px — broken images ${data.brokenImages.join(", ")}`
        );
      }
      if (data.clipped.length) {
        failures.push(
          `${page.name} @${viewport.label}px — clipped content ${JSON.stringify(data.clipped)}`
        );
      }
      if (data.hiddenReveals.length) {
        failures.push(
          `${page.name} @${viewport.label}px — ${data.hiddenReveals.length} reveal(s) never fired`
        );
      }

      console.log(
        `${page.name.padEnd(14)} @${viewport.label.padEnd(5)} overflow=${String(data.overflow).padStart(4)}` +
          ` scrollWidth=${String(data.scrollWidth).padStart(5)} clipped=${data.clipped.length}`
      );

      if (!viewport.capture) continue;

      const metrics = await cdp.send("Page.getLayoutMetrics");
      const height = Math.min(Math.ceil(metrics.cssContentSize.height), 9000);
      let clip = { x: 0, y: 0, width: viewport.width, height, scale: 1 };

      if (SECTION) {
        const box = await evaluate(
          cdp,
          `(() => {
            const node = document.querySelector(${JSON.stringify(SECTION)});
            if (!node) return null;
            const rect = node.getBoundingClientRect();
            return {
              x: Math.max(0, rect.left + window.scrollX),
              y: Math.max(0, rect.top + window.scrollY),
              width: Math.min(rect.width, ${viewport.width}),
              height: rect.height,
            };
          })()`
        );
        if (box) clip = { ...box, scale: 1 };
        else failures.push(`${page.name} @${viewport.label}px — selector ${SECTION} not found`);
      }

      const shot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip,
      });
      await writeFile(
        join(OUT, `${page.name}-${viewport.label}.png`),
        Buffer.from(shot.data, "base64")
      );

      const top = await cdp.send("Page.captureScreenshot", { format: "png" });
      await writeFile(
        join(OUT, `${page.name}-${viewport.label}-top.png`),
        Buffer.from(top.data, "base64")
      );

      if (EVAL) {
        const probe = await evaluate(cdp, EVAL);
        console.log(`eval @${viewport.label}:`, JSON.stringify(probe, null, 2));
      }
    }
  }

  console.log("\n--- issues ---");
  if (!problems.length && !failures.length) console.log("none");
  [...new Set(problems)].forEach((line) => console.log(line));
  failures.forEach((line) => console.log(line));
  console.log(`\nScreenshots: ${OUT}`);

  chrome.kill("SIGTERM");
  server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
    (error) => console.warn("Could not remove the temporary Chrome profile:", error.message)
  );

  if (failures.length || problems.length || /ERROR/.test(chromeStderr)) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
