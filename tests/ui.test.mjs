// The page as a visitor uses it: loading, switching polls, calling seats, the map, reset and analytics.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openPage, settled, headConstants } from "./helpers.mjs";

const H = headConstants();
let browser, page, errors;
before(async () => ({ browser, page, errors } = await openPage()));
after(async () => { await browser?.close(); });

const odds = () => page.$$eval("#odds .big", (els) => els.map((e) => parseFloat(e.textContent.replace(/[<>]/g, "")) || 0));

test("loads the latest poll by default, with odds that add to about 100%", async () => {
  const first = await page.$eval("#scenario", (s) => s.selectedOptions[0].textContent);
  assert.ok(first.includes(H.POLLS[0].id), `default is "${first}"`);
  const o = await odds();
  assert.equal(o.length, 3);
  const total = o.reduce((a, b) => a + b, 0);
  assert.ok(total >= 98 && total <= 102, `odds add to ${total}`);
  assert.ok(await page.$$eval("#hemi circle:not(.skel)", (c) => c.length) >= 110, "seat diagram drawn");
});

test("every poll in the picker, and the average, runs cleanly", async () => {
  const values = await page.$$eval("#scenario option:not([disabled])", (o) => o.map((x) => x.value));
  assert.equal(values.length, H.POLLS.length + 1);
  for (const v of values) {
    await page.selectOption("#scenario", v);
    await settled(page);
    const total = (await odds()).reduce((a, b) => a + b, 0);
    assert.ok(total >= 98 && total <= 102, `poll ${v}: odds add to ${total}`);
  }
  await page.selectOption("#scenario", "0"); await settled(page);
});

test("changing the number of simulations runs that many in full", async () => {
  for (const v of ["1000", "20000", "5000"]) {
    await page.selectOption("#nsim", v); await page.waitForTimeout(250); await settled(page);
    assert.equal(await page.evaluate(() => state.sim.N), +v);
    assert.equal(await page.$eval("#chamberwrap", (e) => e.classList.contains("busy")), false, `still greyed out after ${v}`);
  }
});

test("calling a seat fixes it for that candidate, and calling again hands it back", async () => {
  await page.selectOption("#seatFilter", "all");
  const card = page.locator("#seatList .seat", { has: page.locator(".name", { hasText: /^Epsom$/ }) });
  const goldsmith = card.locator(".cand", { hasText: "Paul Goldsmith" });
  await goldsmith.click(); await settled(page);
  assert.equal(await card.locator(".rate").textContent(), "Called");
  assert.equal(await page.evaluate(() => { const i = SEAT_IDX["Epsom"]; return ESEATS[i].c[state.locks[i]].nm; }), "Paul Goldsmith");
  await card.locator(".cand", { hasText: "Paul Goldsmith" }).click(); await settled(page);
  assert.equal(await page.evaluate(() => state.locks[SEAT_IDX["Epsom"]]), undefined);
});

test("seat notes link their sources", async () => {
  await page.selectOption("#seatFilter", "all");
  const card = page.locator("#seatList .seat", { has: page.locator(".name", { hasText: /^Auckland Central$/ }) });
  const links = card.locator(".why .src a");
  assert.ok(await links.count() >= 1);
  assert.match(await links.first().getAttribute("href"), /^https:\/\//);
});

test("the map draws every electorate and selecting one shows its candidates", async () => {
  await page.click('#seatView button[data-v="map"]');
  assert.equal(await page.$$eval("#seatMap path.el", (p) => p.length), 64);
  await page.selectOption("#mapGo", { label: "Waiariki" });
  assert.equal(await page.$$eval("#seatMap path.el", (p) => p.length), 7, "switches to the Māori layer");
  assert.equal((await page.textContent("#mapSide .seathead .name")).trim(), "Waiariki");
  await page.click('#seatView button[data-v="list"]');
});

test("the why-our-numbers-differ section fills in live figures and its comparison table", async () => {
  await page.click("#diff > summary");
  await page.waitForSelector("#diffTable table", { timeout: 30000 });
  const rows = await page.$$eval("#diffTable tbody tr", (r) => r.map((x) => [...x.cells].map((c) => c.textContent)));
  assert.ok(rows.length >= 5);
  assert.equal(rows[0][0], "Your current settings");
  for (const r of rows) {
    const total = r.slice(1).reduce((a, c) => a + (parseFloat(c.replace(/^</, "")) || 0), 0);
    assert.ok(total >= 97 && total <= 103, `${r[0]}: odds add to ${total}`);
  }
  assert.match(await page.textContent("#diffOver"), /\d/);
  assert.ok((await page.textContent("#diffKing")).length > 10);
  // the comparison runs leave the page's own results alone
  assert.equal(await page.evaluate(() => state.sim.N), parseInt(await page.$eval("#nsim", (e) => e.value), 10));
  await page.click("#diff > summary");
});

test("reset puts every control back to the latest poll", async () => {
  await page.click('#lv-err .lvbtn');
  await page.click('#errSeg button[data-k="2.4"]');
  await page.selectOption("#scenario", "2"); await settled(page);
  await page.click("#resetLevers"); await settled(page);
  const s = await page.evaluate(() => ({ err: state.err, split: state.split, trend: state.trend, poll: state.pollName }));
  assert.deepEqual(s, { err: 1.6, split: 0, trend: 0, poll: H.POLLS[0].id });
});

test("analytics events fire for poll changes and seat calls", async () => {
  const names = await page.evaluate(() => window.__events.map((e) => e[0]));
  assert.ok(names.includes("Poll"));
  assert.ok(names.includes("Call seat"));
  assert.ok(names.includes("Electorate view"));
});

test("no page errors during the UI tests", () => {
  assert.deepEqual(errors, []);
});
