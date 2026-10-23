// The built page: placeholders filled, structured data valid, static files present.
import { test } from "node:test";
import assert from "node:assert/strict";
import { read, exists, json, headConstants } from "./helpers.mjs";

const html = read("dist", "index.html");
const H = headConstants();

test("every build placeholder is filled", () => {
  assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);
});

test("structured data parses and its FAQ matches the visible FAQ", () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  const types = ld["@graph"].map((g) => g["@type"]);
  assert.deepEqual(types, ["WebSite", "WebPage", "WebApplication", "Event", "FAQPage"]);
  const faq = ld["@graph"].find((g) => g["@type"] === "FAQPage").mainEntity.map((q) => q.name);
  const visible = [...html.matchAll(/<details class="faq"[\s\S]*?<\/details>/g)][0][0];
  const h3 = [...visible.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1].replace(/&#x27;|&#39;/g, "'"));
  assert.deepEqual(h3, faq);
});

test("the footer's latest-poll line names the default poll", () => {
  assert.match(html, new RegExp(`Latest poll</b> \\(${H.POLLS[0].id}\\)`));
});

test("icons, manifest, share image, robots.txt and sitemap.xml are deployed", () => {
  for (const f of ["favicon.ico", "favicon.svg", "favicon-96.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png",
    "icon-maskable-512.png", "site.webmanifest", "og.png", "robots.txt", "sitemap.xml", "BingSiteAuth.xml"])
    assert.ok(exists("dist", f), `dist/${f} is missing`);
  assert.match(read("dist", "sitemap.xml"), /<loc>https:\/\/nzpolls\.co\.nz\/<\/loc>/);
  JSON.parse(read("dist", "site.webmanifest"));
});

test("the latest-update note shows the newest entry from data/updates.json, with a valid NZ date and time", () => {
  const ups = json("data", "updates.json");
  assert.ok(ups.length > 0);
  for (const u of ups) {
    assert.match(u.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+1[23]:00$/, `${u.at} isn't an NZ time like 2026-10-23T10:45+13:00`);
    assert.ok(!Number.isNaN(Date.parse(u.at)) && u.text.trim(), `bad update ${JSON.stringify(u)}`);
  }
  for (let i = 1; i < ups.length; i++) assert.ok(Date.parse(ups[i - 1].at) >= Date.parse(ups[i].at), `updates.json isn't newest first at "${ups[i].text}"`);
  const summary = html.match(/<details class="updates" id="updates">\s*<summary>([\s\S]*?)<\/summary>/)[1];
  assert.match(summary, new RegExp(`datetime="${ups[0].at.replace("+", "\\+")}"`));
});
