/**
 * Shared plumbing for the local QA tools: a tiny static server, a DevTools
 * Protocol client, Chrome launcher and the page/viewport matrix.
 *
 * Used by tools/qa-visual.mjs (screenshots, overflow) and
 * tools/audit-site.mjs (accessibility, performance, keyboard, no-JS).
 */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

export const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
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

export const PAGES = [
  { name: "index", path: "/" },
  { name: "work", path: "/work.html" },
  { name: "about", path: "/about.html" },
  { name: "contact", path: "/contact.html" },
  { name: "404", path: "/404.html" },
  { name: "case-alphaone", path: "/case-studies/alphaone/" },
  { name: "case-webloom", path: "/case-studies/webloom-tech/" },
  { name: "case-onq", path: "/case-studies/onq-global/" },
];

/* Every width from the brief. `capture` marks the ones worth keeping as
   screenshots; the rest are measured only, which keeps runs quick. */
export const VIEWPORTS = [
  { label: "320", width: 320, height: 720, mobile: true, capture: true },
  { label: "375", width: 375, height: 812, mobile: true },
  { label: "390", width: 390, height: 844, mobile: true, capture: true },
  { label: "414", width: 414, height: 896, mobile: true },
  { label: "768", width: 768, height: 1024, mobile: true, capture: true },
  { label: "820", width: 820, height: 1180, mobile: true },
  { label: "1024", width: 1024, height: 768, mobile: false },
  { label: "1280", width: 1280, height: 800, mobile: false },
  { label: "1440", width: 1440, height: 900, mobile: false, capture: true },
  { label: "1920", width: 1920, height: 1080, mobile: false },
];

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export function createStaticServer(port, root = ROOT) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://localhost:${port}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";

    const target = normalize(join(root, pathname));
    if (!target.startsWith(root + sep)) {
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

  return new Promise((done) => server.listen(port, "127.0.0.1", () => done(server)));
}

export class Cdp {
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

export async function connectCdp(port, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
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

export const CHROME_BIN =
  process.env.CHROME_PATH || "google-chrome";

export function launchChrome({ port, profile }) {
  return spawn(
    CHROME_BIN,
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
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
}

export function chromeProfile(label = "qa") {
  return join(tmpdir(), `anne-${label}-chrome-${Date.now()}`);
}

/* Wait for the next load event without leaking the listener. */
export function waitForLoad(cdp, timeout = 15000) {
  return new Promise((done) => {
    const handler = () => {
      const list = cdp.listeners.get("Page.loadEventFired") || [];
      list.splice(list.indexOf(handler), 1);
      done();
    };
    cdp.on("Page.loadEventFired", handler);
    setTimeout(done, timeout);
  });
}

/* Scroll the whole page once so reveal observers fire and lazy images load. */
export const PRIME = `(async () => {
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
  return { height: document.body.scrollHeight };
})()`;
