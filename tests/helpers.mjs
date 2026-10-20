// Shared test helpers. Run the suite with `npm test` (it builds first).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { chromium } from "playwright";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");
export const json = (...p) => JSON.parse(read(...p));
export const exists = (...p) => existsSync(join(ROOT, ...p));

/** Evaluate src/head.js the way the page does, with DATA from data/data.json. */
export function headConstants() {
  const ctx = { DATA: json("data", "data.json"), Date };
  vm.createContext(ctx);
  // top-level const/let don't become context properties, so re-export what the tests need
  vm.runInContext(read("src", "head.js") + "\n;this.out={POLLS,AVG,PARTIES,TREND,SEATS,THRESH,ESEATS,LISTS,SEAT_IDX,KEY,PRESETS};", ctx);
  return ctx.out;
}

/**
 * Open dist/index.html in headless Chromium with third-party scripts blocked, and wait until the
 * first full simulation has finished. Returns { browser, page, errors }; page errors are collected.
 */
export async function openPage({ viewport = { width: 1280, height: 900 } } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)|umami\.is|buymeacoffee|utteranc\.es/, (r) => r.abort());
  await page.addInitScript(() => { window.__events = []; window.umami = { track: (n, d) => window.__events.push([n, d]) }; });
  await page.goto("file://" + join(ROOT, "dist", "index.html"));
  await settled(page);
  return { browser, page, errors };
}

/** Wait until no simulation is pending and the full run for the current settings is drawn. */
export async function settled(page) {
  await page.waitForFunction(() => {
    const n = state.err === 0 ? 1 : parseInt(document.getElementById("nsim").value, 10);
    return state.sim && state.sim.N === n && !document.getElementById("loadbar").classList.contains("on");
  }, null, { timeout: 60000, polling: 50 });
}
