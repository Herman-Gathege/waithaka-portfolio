/**
 * Local visual QA harness for the portfolio.
 *
 * Serves the repository over HTTP, drives headless Chrome through the DevTools
 * Protocol and reports, per page and per viewport:
 *   - horizontal overflow (and the elements responsible)
 *   - console errors and uncaught exceptions
 *   - screenshots written to the output directory
 *
 * Usage: node tools/qa-visual.mjs [--out /tmp/qa] [--port 4321] [--only index]
 *        [--section "#introduction"]  capture one element instead of the full page
 */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const PORT = Number(flag("port", "4321"));
const OUT = resolve(flag("out", join(tmpdir(), "anne-portfolio-qa")));
const ONLY = flag("only", "");
const SECTION = flag("section", "");
const EVAL = flag("eval", "");
/* Mobile emulation expands the layout viewport when content overflows, which
   hides the offending element. --nomobile measures with a strict viewport. */
const NO_MOBILE = args.includes("--nomobile");
const CHROME =
  process.env.CHROME_PATH ||
  ["google-chrome", "chromium", "chromium-browser"].find(Boolean);

const PAGES = [
  { name: "index", path: "/" },
  { name: "work", path: "/work.html" },
  { name: "about", path: "/about.html" },
  { name: "contact", path: "/contact.html" },
  { name: "404", path: "/404.html" },
  { name: "case-alphaone", path: "/case-studies/alphaone/" },
  { name: "case-webloom", path: "/case-studies/webloom-tech/" },
  { name: "case-onq", path: "/case-studies/onq-global/" },
];

const VIEWPORTS = [
  { label: "320", width: 320, height: 720, mobile: true },
  { label: "390", width: 390, height: 844, mobile: true },
  { label: "768", width: 768, height: 1024, mobile: true },
  { label: "1440", width: 1440, height: 900, mobile: false },
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function serve() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";

    const target = normalize(join(ROOT, pathname));
    if (!target.startsWith(ROOT + sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    try {
      const body = await readFile(target);
      response.writeHead(200, {
        "Content-Type": MIME[extname(target)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    }
  });

  return new Promise((done) => server.listen(PORT, "127.0.0.1", () => done(server)));
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve: ok, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else ok(message.result);
        return;
      }
      (this.listeners.get(message.method) || []).forEach((fn) => fn(message.params));
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((ok, reject) => {
      this.pending.set(id, { resolve: ok, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function connect(port) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page");
      if (page) {
        const socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((ok, fail) => {
          socket.addEventListener("open", ok, { once: true });
          socket.addEventListener("error", fail, { once: true });
        });
        return new Cdp(socket);
      }
    } catch {
      /* Chrome is still starting. */
    }
    await sleep(300);
  }
  throw new Error("Could not connect to Chrome DevTools Protocol.");
}

const PROBE = `(() => {
  const doc = document.documentElement;
  const width = doc.clientWidth;
  const offenders = [];
  const nodes = document.querySelectorAll("body *");
  for (const node of nodes) {
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
  return {
    viewport: width,
    scrollWidth: doc.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    overflow: doc.scrollWidth - width,
    offenders: offenders.slice(0, 8),
    fonts: document.fonts ? document.fonts.status : "n/a",
    title: document.title,
    h1: document.querySelectorAll("h1").length,
    hiddenReveals: [...document.querySelectorAll("[data-reveal]")]
      .filter((node) => !node.classList.contains("is-visible"))
      .map((node) => (node.className || "").toString().slice(0, 50))
      .slice(0, 6),
    imgsMissingAlt: [...document.images].filter((img) => !img.hasAttribute("alt")).length,
    brokenImages: [...document.images]
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.currentSrc || img.src),
  };
})()`;

/* Scroll the whole page once so reveal observers fire and lazy images load,
   then return to the top before capturing. */
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
  return { height: document.body.scrollHeight, step };
})()`;

async function run() {
  await mkdir(OUT, { recursive: true });
  const server = await serve();
  const profile = join(tmpdir(), `anne-qa-chrome-${Date.now()}`);

  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--remote-debugging-port=9333",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );

  let chromeErrors = "";
  chrome.stderr.on("data", (chunk) => {
    chromeErrors += chunk.toString();
  });

  const cdp = await connect(9333);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");

  let problems = [];
  let currentPage = "";
  const record = (message) => problems.push(`${currentPage}: ${message}`);

  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) =>
    record(`exception — ${exceptionDetails.exception?.description || exceptionDetails.text}`)
  );
  cdp.on("Runtime.consoleAPICalled", ({ type, args }) => {
    if (type !== "error" && type !== "warning") return;
    const text = args.map((arg) => arg.value ?? arg.description ?? arg.type).join(" ");
    if (/favicon/i.test(text)) return;
    record(`console.${type} — ${text}`);
  });
  cdp.on("Log.entryAdded", ({ entry }) => {
    if (entry.level === "error" && !/favicon/i.test(entry.text)) {
      record(`log — ${entry.text} ${entry.url || ""}`.trim());
    }
  });

  const pages = ONLY ? PAGES.filter((page) => page.name.includes(ONLY)) : PAGES;
  const failures = [];

  for (const page of pages) {
    currentPage = page.name;

    for (const viewport of VIEWPORTS) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: NO_MOBILE ? false : viewport.mobile,
      });

      await cdp.send("Page.navigate", {
        url: `http://127.0.0.1:${PORT}${page.path}`,
      });
      await new Promise((done) => {
        const off = () => cdp.listeners.get("Page.loadEventFired");
        const handler = () => {
          const list = off();
          list.splice(list.indexOf(handler), 1);
          done();
        };
        cdp.on("Page.loadEventFired", handler);
        setTimeout(done, 8000);
      });

      await cdp.send("Runtime.evaluate", {
        expression: "document.fonts ? document.fonts.ready : Promise.resolve()",
        awaitPromise: true,
      });

      await cdp.send("Runtime.evaluate", { expression: PRIME, awaitPromise: true });
      await sleep(700);

      /* Record which reveals are still hidden (a real signal), then force them
         visible so screenshots never show blank sections. */
      const revealed = await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const hidden = [...document.querySelectorAll("[data-reveal]")]
            .filter((node) => !node.classList.contains("is-visible"))
            .map((node) => (node.className || "").toString().slice(0, 50));
          document.querySelectorAll("[data-reveal]").forEach((node) =>
            node.classList.add("is-visible")
          );
          return hidden;
        })()`,
        returnByValue: true,
      });
      await sleep(120);

      const { result } = await cdp.send("Runtime.evaluate", {
        expression: PROBE,
        returnByValue: true,
      });
      const data = result.value;
      data.hiddenReveals = revealed.result.value || [];

      if (EVAL) {
        const probe = await cdp.send("Runtime.evaluate", {
          expression: EVAL,
          returnByValue: true,
        });
        console.log(
          `eval @${viewport.label}:`,
          JSON.stringify(probe.result.value, null, 2),
          probe.exceptionDetails ? probe.exceptionDetails.text : ""
        );
        if (viewport.label === VIEWPORTS[0].label) continue;
      }

      if (data.overflow > 1) {
        failures.push(
          `${page.name} @${viewport.label}px — horizontal overflow ${data.overflow}px ` +
            JSON.stringify(data.offenders)
        );
      }
      if (data.brokenImages.length) {
        failures.push(`${page.name} @${viewport.label}px — broken images ${data.brokenImages.join(", ")}`);
      }
      if (data.hiddenReveals.length) {
        failures.push(
          `${page.name} @${viewport.label}px — ${data.hiddenReveals.length} reveal(s) never fired: ` +
            data.hiddenReveals.join(" | ")
        );
      }

      const metrics = await cdp.send("Page.getLayoutMetrics");
      const height = Math.min(Math.ceil(metrics.cssContentSize.height), 9000);
      let clip = { x: 0, y: 0, width: viewport.width, height, scale: 1 };

      if (SECTION) {
        const box = await cdp.send("Runtime.evaluate", {
          expression: `(() => {
            const node = document.querySelector(${JSON.stringify(SECTION)});
            if (!node) return null;
            const rect = node.getBoundingClientRect();
            return {
              x: Math.max(0, rect.left + window.scrollX),
              y: Math.max(0, rect.top + window.scrollY),
              width: Math.min(rect.width, ${viewport.width}),
              height: rect.height,
            };
          })()`,
          returnByValue: true,
        });

        if (box.result.value) {
          clip = { ...box.result.value, scale: 1 };
        } else {
          failures.push(`${page.name} @${viewport.label}px — selector ${SECTION} not found`);
        }
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

      console.log(
        `${page.name.padEnd(14)} @${viewport.label.padEnd(5)} overflow=${String(
          data.overflow
        ).padStart(4)} scrollWidth=${String(data.scrollWidth).padStart(5)} height=${height}`
      );
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

  if (failures.length || problems.length || /ERROR/.test(chromeErrors)) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
