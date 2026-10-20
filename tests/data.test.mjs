// Data integrity: electorates, party lists, map outlines and polls. No browser needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { json, headConstants } from "./helpers.mjs";

const DATA = json("data", "data.json");
const MAP = json("data", "map.json");
const H = headConstants();
const MODEL = new Set(H.PARTIES.map((p) => p.c));

test("71 electorates: 64 general and 7 Māori, no duplicate names", () => {
  assert.equal(DATA.seats.length, 71);
  assert.equal(DATA.seats.filter((s) => s.m).length, 7);
  assert.equal(new Set(DATA.seats.map((s) => s.n)).size, 71);
});

test("every electorate's starting weights add to 100 and someone can win", () => {
  for (const s of DATA.seats) {
    const total = s.c.reduce((a, c) => a + c.w, 0);
    assert.equal(total, 100, `${s.n} weights add to ${total}`);
    assert.ok(s.c.some((c) => c.w > 0), `${s.n} has no candidate with a chance`);
    assert.ok(s.c.every((c) => c.w >= 0), `${s.n} has a negative weight`);
  }
});

test("candidate and holder party codes are ones the model knows", () => {
  for (const s of DATA.seats) {
    assert.ok(MODEL.has(s.held), `${s.n} held by unknown party ${s.held}`);
    for (const c of s.c) assert.ok(MODEL.has(c.p) || c.p === "MIN" || c.p === "OTH", `${s.n}: ${c.nm} has code ${c.p}`);
  }
});

test("every modelled party has a list with no repeated names", () => {
  for (const p of H.PARTIES) {
    const list = DATA.lists[p.c];
    assert.ok(Array.isArray(list) && list.length > 0, `${p.n} has no list`);
    assert.equal(new Set(list).size, list.length, `${p.n} list has a repeated name`);
  }
});

test("map outlines match the electorates exactly, and Māori seats are in the Māori layer", () => {
  const gen = MAP.general.map((e) => e.n), mao = MAP.maori.map((e) => e.n);
  assert.deepEqual([...gen, ...mao].sort(), DATA.seats.map((s) => s.n).sort());
  for (const s of DATA.seats) assert.equal(mao.includes(s.n), s.m, `${s.n} is in the wrong map layer`);
  for (const e of [...MAP.general, ...MAP.maori]) {
    assert.match(e.d, /^M-?\d+ -?\d+l/, `${e.n} path looks malformed`);
    assert.ok(e.b[0] < e.b[2] && e.b[1] < e.b[3], `${e.n} bounding box is inverted`);
  }
});

test("polls: unique names, newest fieldwork first, all parties present, shares plausible", () => {
  const ids = H.POLLS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "two polls share a name");
  for (let i = 1; i < H.POLLS.length; i++)
    assert.ok(H.POLLS[i - 1].mid >= H.POLLS[i].mid, `${H.POLLS[i - 1].id} is listed above the newer ${H.POLLS[i].id}`);
  for (const p of H.POLLS) {
    for (const party of H.PARTIES) assert.ok(Number.isFinite(p.s[party.c]), `${p.id} has no figure for ${party.n}`);
    const total = H.PARTIES.reduce((a, party) => a + p.s[party.c], 0);
    // pollsters round each party (Verian to whole numbers), so the total can run a little over 100
    assert.ok(total > 85 && total <= 103, `${p.id} parties add to ${total}`);
  }
});

test("poll average is the mean of the polls marked for inclusion", () => {
  const inc = H.POLLS.filter((p) => p.inc);
  assert.ok(inc.length >= 3);
  for (const party of H.PARTIES) {
    const mean = inc.reduce((a, p) => a + p.s[party.c], 0) / inc.length;
    assert.ok(Math.abs(H.AVG[party.c] - mean) < 0.01, `${party.n} average ${H.AVG[party.c]} vs ${mean}`);
  }
});

test("late-swing trend is a finite slope for every party", () => {
  for (const party of H.PARTIES) assert.ok(Number.isFinite(H.TREND[party.c]), `${party.n} trend is ${H.TREND[party.c]}`);
});

test("seat presets and key seats name real electorates and candidates", () => {
  for (const n of H.KEY) assert.ok(n in H.SEAT_IDX, `key seat ${n} doesn't exist`);
  for (const p of H.PRESETS) for (const [seat, cand] of p.set || []) {
    assert.ok(seat in H.SEAT_IDX, `preset "${p.n}" names unknown seat ${seat}`);
    assert.ok(H.ESEATS[H.SEAT_IDX[seat]].c.some((c) => c.nm === cand), `preset "${p.n}": ${cand} isn't standing in ${seat}`);
  }
});
