// The forecast's maths, tested against the page's own functions in a real browser:
// Sainte-Laguë, the 5% threshold, overhang, list exhaustion, seat chances, eff() and the simulation.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openPage } from "./helpers.mjs";

let browser, page, errors;
before(async () => ({ browser, page, errors } = await openPage()));
after(async () => { await browser?.close(); });
const run = (fn, arg) => page.evaluate(fn, arg);

// Independent reference: Sainte-Laguë (highest averages, divisors 1, 3, 5, …) over 120 seats.
function sainteLague(shares, seats = 120) {
  const q = [];
  for (const [p, v] of Object.entries(shares)) for (let k = 0; k < seats; k++) q.push([v / (2 * k + 1), p]);
  q.sort((a, b) => b[0] - a[0]);
  const out = Object.fromEntries(Object.keys(shares).map((p) => [p, 0]));
  for (const [, p] of q.slice(0, seats)) out[p]++;
  return out;
}

test("seat allocation matches an independent Sainte-Laguë calculation", async () => {
  // random polls; electorate winners are each seat's favourite on that poll
  let rnd = 12345; const rand = () => ((rnd = (rnd * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let t = 0; t < 40; t++) {
    const shares = { NAT: 20 + 15 * rand(), LAB: 20 + 15 * rand(), GRN: 6 + 12 * rand(), ACT: 3 + 10 * rand(),
      NZF: 3 + 10 * rand(), OPP: 2 + 8 * rand(), TPM: 0.3 + 3 * rand() };
    const res = await run((sh) => { const r = compute(sh, projectWinners(sh)); return { seats: r.seats, ent: r.ent, elec: r.elec, eligible: r.eligible }; }, shares);
    const eligible = Object.fromEntries(Object.entries(shares).filter(([p]) => res.eligible[p]));
    const ref = sainteLague(eligible);
    for (const p of Object.keys(shares)) {
      assert.equal(res.ent[p], ref[p] ?? 0, `poll ${t}: ${p} entitlement ${res.ent[p]} vs reference ${ref[p] ?? 0}`);
      if (res.eligible[p] && res.elec[p] <= res.ent[p] && p !== "TPM")
        assert.equal(res.seats[p], ref[p], `poll ${t}: ${p} seats`);
    }
  }
});

test("a party under 5% with no electorate gets no seats; at 5% or with an electorate it does", async () => {
  const r = await run(() => {
    const base = { NAT: 30, LAB: 30, GRN: 14, ACT: 9, NZF: 9, TPM: 1, OPP: 4.9 };
    const w = projectWinners(base), noOpp = w.map((j, i) => ESEATS[i].c[j].p === "OPP" ? ESEATS[i].c.findIndex((c) => c.p !== "OPP" && c.w > 0) : j);
    const under = compute(base, noOpp);
    const at = compute({ ...base, OPP: 5.0 }, noOpp);
    const ma = SEAT_IDX["Mount Albert"], wong = ESEATS[ma].c.findIndex((c) => c.nm === "Qiulae Wong");
    const withSeat = noOpp.slice(); withSeat[ma] = wong;
    const elect = compute(base, withSeat);
    return { under: under.seats.OPP, at: at.seats.OPP, elect: elect.seats.OPP, electElig: elect.eligible.OPP };
  });
  assert.equal(r.under, 0);
  assert.ok(r.at >= 5, `at exactly 5% Opportunity got ${r.at} seats`);
  assert.equal(r.electElig, true);
  assert.ok(r.elect >= 6, `under 5% but winning Mount Albert, Opportunity got ${r.elect} seats`);
});

test("overhang: extra electorate wins are kept and Parliament grows, raising the majority line", async () => {
  const r = await run(() => {
    const sh = { NAT: 30, LAB: 30, GRN: 14, ACT: 9, NZF: 9, TPM: 1, OPP: 6 };
    const w = projectWinners(sh).map((j, i) => ESEATS[i].m ? ESEATS[i].c.findIndex((c) => c.p === "TPM") : j);
    const res = compute(sh, w);
    // every eligible party's overhang (electorates won beyond its entitlement), not just Te Pāti Māori's
    const overhang = PARTIES.reduce((a, p) => a + (res.eligible[p.c] ? Math.max(0, res.elec[p.c] - res.ent[p.c]) : 0), 0);
    return { tpm: res.seats.TPM, ent: res.ent.TPM, elec: res.elec.TPM, total: res.total, majority: res.majority, overhang, oth: res.seats.OTH };
  });
  assert.equal(r.elec, 7);
  assert.equal(r.tpm, 7, "Te Pāti Māori keeps all seven electorates");
  assert.ok(r.ent < 7);
  assert.ok(r.overhang >= 7 - r.ent);
  assert.equal(r.total, 120 + r.overhang + r.oth, "the House is 120 plus every party's overhang");
  assert.equal(r.majority, Math.floor(r.total / 2) + 1);
});

test("a party can't fill more list seats than it has list candidates (Te Pāti Māori has one)", async () => {
  const r = await run(() => {
    const sh = { NAT: 28, LAB: 28, GRN: 12, ACT: 8, NZF: 8, TPM: 10, OPP: 6 };
    const w = projectWinners(sh).map((j, i) => ESEATS[i].m && ESEATS[i].c[j].p === "TPM" ? ESEATS[i].c.findIndex((c) => c.p !== "TPM" && c.w > 0) : j);
    const res = compute(sh, w);
    return { elec: res.elec.TPM, ent: res.ent.TPM, seats: res.seats.TPM, list: LISTS.TPM.length, total: res.total };
  });
  assert.equal(r.elec, 0);
  assert.ok(r.ent > 1, "10% of the vote earns more than one seat");
  assert.equal(r.seats, r.list, "seats beyond the list are left vacant");
  assert.ok(r.total < 120, "vacant seats shrink the House");
});

test("each electorate's chances add to 1, zero-weight candidates have none, and more party vote helps", async () => {
  const r = await run(() => {
    const out = { sums: [], zeroOk: true };
    for (const s of ESEATS) { const p = seatProbs(s, AVG); out.sums.push(p.reduce((a, b) => a + b, 0)); s.c.forEach((c, j) => { if (c.w === 0 && p[j] !== 0) out.zeroOk = false; }); }
    const s = ESEATS[SEAT_IDX["Mount Albert"]], j = s.c.findIndex((c) => c.p === "NAT");
    out.low = seatProbs(s, { ...AVG, NAT: AVG.NAT - 4 })[j]; out.mid = seatProbs(s, AVG)[j]; out.high = seatProbs(s, { ...AVG, NAT: AVG.NAT + 4 })[j];
    return out;
  });
  for (const v of r.sums) assert.ok(Math.abs(v - 1) < 1e-9);
  assert.ok(r.zeroOk);
  assert.ok(r.low < r.mid && r.mid < r.high, `National in Mount Albert: ${r.low} / ${r.mid} / ${r.high}`);
});

test("eff(): no change by default; Opportunity's squeeze moves its voters to other parties", async () => {
  const r = await run(() => {
    const saved = JSON.stringify(state); const sum = (o) => PARTIES.reduce((a, p) => a + o[p.c], 0);
    const plain = eff(), shares = { ...state.shares };
    Object.assign(state, { oppMode: "squeeze", squeeze: 50, squeezeTo: { LAB: 50, NAT: 50, NONE: 0 } });
    const sq = eff();
    const back = JSON.parse(saved); Object.assign(state, { oppMode: back.oppMode, squeeze: back.squeeze, squeezeTo: back.squeezeTo });
    return { plain, shares, sq, plainSum: sum(plain), sqSum: sum(sq) };
  });
  assert.deepEqual(r.plain, r.shares);
  assert.ok(Math.abs(r.sq.OPP - r.shares.OPP / 2) < 1e-9);
  assert.ok(Math.abs(r.sq.LAB - (r.shares.LAB + r.shares.OPP / 4)) < 1e-9);
  assert.ok(Math.abs(r.sqSum - r.plainSum) < 1e-9, "votes are moved, not lost");
});

test("the simulation is repeatable, and the quick first pass is the start of the full run", async () => {
  const r = await run(async () => {
    const pick = (s, n) => ({ tot: Array.from(s.totS).slice(0, n), nat: Array.from(s.seatsS[s.codes.indexOf("NAT")]).slice(0, n), outc: Array.from(s.outc).slice(0, n) });
    await simulate(1500); const a = pick(state.sim, 600);
    await simulate(1500); const b = pick(state.sim, 600);
    await simulate(600); const q = pick(state.sim, 600);
    return { same: JSON.stringify(a) === JSON.stringify(b), prefix: JSON.stringify(a) === JSON.stringify(q) };
  });
  assert.ok(r.same, "identical settings gave different results");
  assert.ok(r.prefix, "the first 600 runs of a longer simulation should equal a 600-run simulation");
});

test("calling one seat doesn't change any other seat's results", async () => {
  const r = await run(async () => {
    await simulate(1500); const before = state.sim.seatWin.map((a) => Array.from(a));
    const i = SEAT_IDX["Te Tai Tokerau"]; state.locks[i] = ESEATS[i].c.findIndex((c) => c.nm === "Mariameno Kapa-Kingi");
    await simulate(1500); const afterW = state.sim.seatWin.map((a) => Array.from(a)); delete state.locks[i];
    const changed = before.map((b, k) => JSON.stringify(b) !== JSON.stringify(afterW[k]) ? ESEATS[k].n : null).filter(Boolean);
    return { changed, locked: afterW[i][state.sim && ESEATS[i].c.findIndex((c) => c.nm === "Mariameno Kapa-Kingi")] };
  });
  assert.deepEqual(r.changed, ["Te Tai Tokerau"]);
  assert.equal(r.locked, 1500, "the called candidate wins every run");
});

test("every simulated Parliament adds up and is labelled with the right outcome", async () => {
  const bad = await run(async () => {
    await simulate(2000); const s = state.sim, problems = [];
    for (let k = 0; k < s.N; k++) {
      let sum = s.othS[k]; const t = { opp: 0, und: 0, gov: 0 };
      s.codes.forEach((c, i) => { const v = s.seatsS[i][k]; sum += v; if (v < 0) problems.push(`run ${k}: ${c} negative`); t[state.bloc[c]] += v; });
      t[state.bloc.OTH] += s.othS[k];
      if (sum !== s.totS[k]) problems.push(`run ${k}: parties add to ${sum}, House is ${s.totS[k]}`);
      const maj = Math.floor(s.totS[k] / 2) + 1, want = t.gov >= maj ? 0 : t.opp >= maj ? 1 : 2;
      if (want !== s.outc[k]) problems.push(`run ${k}: outcome ${s.outc[k]}, expected ${want}`);
      if (s.totS[k] < 110 || s.totS[k] > 135) problems.push(`run ${k}: House of ${s.totS[k]}`);
      if (problems.length > 5) break;
    }
    return problems;
  });
  assert.deepEqual(bad, []);
});

test("with simulations off, the result is the poll exactly as published", async () => {
  const r = await run(async () => {
    const e0 = state.err; state.err = 0; await simulate();
    const sim = Object.fromEntries(state.sim.codes.map((c, i) => [c, state.sim.seatsS[i][0]]));
    const direct = compute(eff(), projectWinners(eff())).seats; state.err = e0;
    return { N: state.sim.N, sim, direct };
  });
  assert.equal(r.N, 1);
  for (const c of Object.keys(r.sim)) assert.equal(r.sim[c], r.direct[c], `${c}: simulation ${r.sim[c]} vs direct ${r.direct[c]}`);
});

test("no page errors while running the logic tests", () => {
  assert.deepEqual(errors, []);
});
