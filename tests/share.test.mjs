// Sharing: settings travel in the link (?s=…), a shared link reproduces the forecast, and visitors can reset it.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { openPage, settled } from "./helpers.mjs";

const open = [];
after(async () => { for (const b of open) await b.close(); });
const page = async (search = "") => { const r = await openPage({ search }); open.push(r.browser); return r; };
const odds = (p) => p.$$eval("#odds .big", (els) => els.map((e) => e.textContent));
const wait = async (p) => { await p.waitForTimeout(250); await settled(p); };

let link, sharedOdds;

test("changing settings shows what changed, and the share link carries them", async () => {
  const { page: p, errors } = await page();
  assert.equal(await p.$eval("#cfgBar", (e) => e.hidden), true, "no banner on the standard forecast");
  await p.selectOption("#scenario", "avg"); await settled(p);
  await p.click('#oppSide button[data-b="opp"]'); await wait(p);
  await p.evaluate(() => { const i = SEAT_IDX["Te Tai Tokerau"]; state.locks[i] = ESEATS[i].c.findIndex((c) => c.nm === "Mariameno Kapa-Kingi"); update(); }); await wait(p);
  const bar = await p.textContent("#cfgBar");
  assert.match(bar, /changed 3 things/);
  assert.match(bar, /Te Tai Tokerau to Mariameno Kapa-Kingi/);
  await p.click("#shareBtn");
  link = await p.inputValue("#shareUrl");
  assert.match(link, /^https:\/\/nzpolls\.co\.nz\/\?s=[A-Za-z0-9_-]+$/);
  assert.match(await p.inputValue("#shareText"), /National-led majority \d+%/);
  await p.check('#shareWhat input[value="plain"]');
  assert.equal(await p.inputValue("#shareUrl"), "https://nzpolls.co.nz/");
  sharedOdds = await odds(p);
  assert.deepEqual(errors, []);
});

test("a shared link opens with the sharer's settings and odds, says so, and resets cleanly", async () => {
  const { page: p, errors } = await page(link.slice(link.indexOf("?")));
  const s = await p.evaluate(() => ({ poll: state.pollName, opp: state.bloc.OPP, locks: Object.keys(state.locks).map((i) => ESEATS[i].c[state.locks[i]].nm) }));
  assert.deepEqual(s, { poll: "Poll average", opp: "opp", locks: ["Mariameno Kapa-Kingi"] });
  assert.deepEqual(await odds(p), sharedOdds, "the same settings give the same odds");
  assert.match(await p.textContent("#cfgBar"), /forecast someone shared/);
  await p.click("#cfgReset"); await wait(p);
  const r = await p.evaluate(() => ({ hidden: document.getElementById("cfgBar").hidden, poll: state.pollName, opp: state.bloc.OPP, locks: Object.keys(state.locks).length, search: location.search }));
  assert.deepEqual(r, { hidden: true, poll: (await p.evaluate(() => POLLS[0].id)), opp: "und", locks: 0, search: "" });
  const ev = await p.evaluate(() => window.__events.map((e) => e[0]));
  assert.ok(ev.includes("Opened shared link") && ev.includes("Reset to standard forecast"));
  assert.deepEqual(errors, []);
});

test("broken or tampered links are ignored", async () => {
  const bad = { b: { LAB: "gov", OPP: "<img>" }, e: 99, n: 7, l: { Nowhere: "Nobody", Epsom: "Nobody" }, v: { NAT: "x", LAB: 500 }, t: -1e9 };
  const s = Buffer.from(JSON.stringify(bad)).toString("base64url");
  for (const q of ["?s=%3Cscript%3E", "?s=" + s]) {
    const { page: p, errors } = await page(q);
    const r = await p.evaluate(() => ({ bloc: state.bloc, err: state.err, n: document.getElementById("nsim").value, locks: Object.keys(state.locks).length, lab: state.shares.LAB, trend: state.trend }));
    assert.equal(r.bloc.LAB, "opp"); assert.equal(r.bloc.OPP, "und");
    assert.equal(r.err, 1.6); assert.equal(r.n, "5000"); assert.equal(r.locks, 0); assert.ok(r.lab <= 60); assert.equal(r.trend, 0);
    assert.deepEqual(errors, []);
  }
});
