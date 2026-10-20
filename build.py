"""Build dist/index.html: one self-contained page from the files in src/ and data/.

    python3 data/data.py   # only after editing seats, candidates or party lists
    python3 data/map.py    # only after replacing the boundary files in data/boundaries/
    python3 build.py       # always, after any change
    python3 build.py --preview   # a test copy for nzpolls.co.nz/preview/ (the deploy workflow does this for branches)
"""
import datetime, html, html.parser, json, math, os, re, shutil, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = "https://nzpolls.co.nz/"
PREVIEW = "--preview" in sys.argv


def preview(page):
    """The test copy served at /preview/: not indexed, no analytics, share links stay on the preview, and labelled."""
    url = SITE + "preview/"
    page = page.replace(f'<link rel="canonical" href="{SITE}">', f'<link rel="canonical" href="{url}">\n<meta name="robots" content="noindex, nofollow">')
    page = page.replace(f'<meta property="og:url" content="{SITE}">', f'<meta property="og:url" content="{url}">')
    page = re.sub(r'<script[^>]*umami[^>]*></script>\n?', "", page)
    flag = ('<div style="position:fixed;left:8px;bottom:8px;z-index:99;background:#A33A1D;color:#fff;font:600 12px/1 system-ui,sans-serif;'
            'padding:6px 9px;border-radius:999px;pointer-events:none">Preview: not the live site</div>\n')
    assert url in page and "cloud.umami.is" not in page, "preview build: head.html changed, update preview()"
    return page.replace("<body>\n", "<body>\n" + flag, 1)
read = lambda *p: open(os.path.join(ROOT, *p), encoding="utf-8").read()


class TagCheck(html.parser.HTMLParser):
    """Catches unbalanced tags in body.html, the cause of past breakages."""
    VOID = {"input", "br", "img", "meta", "link", "hr", "source"}

    def __init__(self):
        super().__init__()
        self.stack, self.errors = [], []

    def handle_starttag(self, tag, attrs):
        if tag not in self.VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if self.stack and self.stack[-1] == tag:
            self.stack.pop()
        else:
            self.errors.append(f"line {self.getpos()[0]}: </{tag}> but open {self.stack[-3:]}")


def latest_poll():
    """POLLS[0] and party names from head.js, so the newest poll is in the HTML as plain text for search engines."""
    js = read("src", "head.js")
    names = dict(re.findall(r'\{c:"(\w+)",n:"([^"]+)"\}', js))
    m = re.search(r'const POLLS = \[\s*\{id:"([^"]+)",mid:"[^"]+",inc:\d,s:\{([^}]*)\}', js)
    if not m:
        sys.exit("couldn't read the latest poll from head.js")
    shares = [(names[k], float(v)) for k, v in re.findall(r'(\w+):([\d.]+)', m.group(2)) if k in names]
    shares.sort(key=lambda x: -x[1])
    summary = ", ".join(f"{n} {v:g}%" for n, v in shares)
    return m.group(1), f"<b>Latest poll</b> ({html.escape(m.group(1))}): {html.escape(summary)}."


def faq():
    """Questions people search for, answered from the data files. Rendered as HTML and as FAQPage structured data."""
    js = read("src", "head.js")
    seats = json.loads(read("data", "data.json"))["seats"]
    n, maori = len(seats), sum(1 for x in seats if x["m"])
    house = int(re.search(r"SEATS = (\d+)", js).group(1))
    pollsters = list(dict.fromkeys(re.findall(r'\{id:"([^",]+)', js)))
    latest = re.search(r'const POLLS = \[\s*\{id:"([^"]+)"', js).group(1)
    return [
        ("When is the 2026 New Zealand election?", "Saturday 7 November 2026."),
        ("How many seats does a party or coalition need to govern?",
         f"A majority of the House: {house // 2 + 1} of the usual {house} seats. Overhang seats make the House bigger, which raises "
         "the number needed, so the forecast checks the majority line in every simulated Parliament."),
        ("What is the 5% threshold?",
         "A party gets list seats only if it wins at least 5% of the party vote or at least one electorate. Below that, its votes "
         f"don't turn into seats, and the other parties share the {house} seats between them."),
        ("What is an overhang?",
         "When a party wins more electorates than its party vote entitles it to, it keeps them all and Parliament grows by the "
         "difference. Those extra seats are the overhang."),
        ("How many electorates are there in 2026?",
         f"{n} electorates: {n - maori} general and {maori} Māori, on the boundaries the Representation Commission set in 2025."),
        ("Which polls does this forecast use?",
         f"Published national polls from {', '.join(pollsters[:-1])} and {pollsters[-1]}. The latest is {latest}. You can switch "
         "to any of them, or to an average, above the seat diagram."),
        ("How does the forecast work?",
         f"It plays out the election thousands of times. Each run nudges every party's vote by about as much as polls usually miss, "
         f"decides all {n} electorates, and shares out the seats with the Sainte-Laguë formula. Each percentage is how often that "
         "outcome happened."),
        ("Is this a prediction?",
         "No. It shows the range of results today's polls point to. Electorate chances are estimates built from 2023 results and "
         "published electorate polls, not official forecasts."),
    ]


def json_ld(today, qa):
    site, page = SITE + "#website", SITE + "#page"
    me = {"@type": "Person", "name": "Dan Richards"}
    graph = [
        {"@type": "WebSite", "@id": site, "url": SITE, "name": "nzpolls", "inLanguage": "en-NZ"},
        {"@type": "WebPage", "@id": page, "url": SITE, "name": "NZ election 2026: seat forecast and poll tracker",
         "description": "Seat forecast and poll tracker for New Zealand's 7 November 2026 general election.",
         "isPartOf": {"@id": site}, "inLanguage": "en-NZ", "dateModified": today, "author": me,
         "primaryImageOfPage": SITE + "og.png", "about": {"@id": SITE + "#election"}},
        {"@type": "WebApplication", "name": "NZ election 2026 seat simulator", "url": SITE,
         "applicationCategory": "ReferenceApplication", "operatingSystem": "Any", "browserRequirements": "Requires JavaScript",
         "isAccessibleForFree": True, "offers": {"@type": "Offer", "price": "0", "priceCurrency": "NZD"}, "author": me},
        {"@type": "Event", "@id": SITE + "#election", "name": "2026 New Zealand general election", "startDate": "2026-11-07",
         "endDate": "2026-11-07", "eventStatus": "https://schema.org/EventScheduled",
         "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
         "location": {"@type": "Country", "name": "New Zealand"}},
        {"@type": "FAQPage", "@id": SITE + "#faq", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in qa]},
    ]
    return json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False).replace("</", "<\\/")


def hemi_skeleton(n=120):
    """Grey seat diagram shown before the first simulation finishes; same layout as seatPositions() in main.js."""
    rows, inner = 8, 0.36
    radii = [inner + (1 - inner) * i / (rows - 1) for i in range(rows)]
    counts = [n * r / sum(radii) for r in radii]; fl = [math.floor(c) for c in counts]
    for _, i in sorted(((c - f, i) for i, (c, f) in enumerate(zip(counts, fl))), reverse=True)[:n - sum(fl)]:
        fl[i] += 1
    R, cx, cy, r = 200, 210, 212, 200 * (1 - inner) / (rows - 1) * 0.42
    dots = [f'<circle class="skel" cx="{cx + R * rr * math.cos(t):.1f}" cy="{cy - R * rr * math.sin(t):.1f}" r="{r:.2f}"/>'
            for rr, k in zip(radii, fl) for t in (math.pi - math.pi * j / (k - 1) for j in range(k))]
    return "".join(dots)


def main():
    body = read("src", "body.html")
    check = TagCheck()
    check.feed(body)
    if check.errors or check.stack:
        sys.exit("body.html structure problem:\n  " + "\n  ".join(check.errors or [f"unclosed {check.stack[-5:]}"]))
    json.loads(read("data", "data.json"))  # fail early on bad data
    json.loads(read("data", "map.json"))
    _, poll_summary = latest_poll()
    today = datetime.date.today().isoformat()
    qa = faq()
    faq_html = "\n".join(f'    <h3>{html.escape(q)}</h3>\n    <p>{html.escape(a)}</p>' for q, a in qa)
    body = body.replace("{{POLL_SUMMARY}}", poll_summary).replace("{{HEMI_SKELETON}}", hemi_skeleton()).replace("{{FAQ_HTML}}", faq_html)
    page = (read("src", "head.html").replace("{{BUILD_DATE}}", today).replace("{{JSON_LD}}", json_ld(today, qa)) + "<style>" + read("src", "base.css") + read("src", "extra.css")
            + "</style>\n</head>\n<body>\n" + body
            + "\n<script>\nconst DATA=" + read("data", "data.json") + ";\nconst MAP=" + read("data", "map.json") + ";\n"
            + read("src", "head.js") + read("src", "main.js") + "\n</script>\n" + read("src", "foot.html") + "</body>\n</html>\n")
    if PREVIEW:
        page = preview(page)
    os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
    open(os.path.join(ROOT, "dist", "index.html"), "w", encoding="utf-8").write(page)
    # icons, share image, robots.txt and sitemap.xml sit next to the page
    for f in os.listdir(os.path.join(ROOT, "static")):
        shutil.copy(os.path.join(ROOT, "static", f), os.path.join(ROOT, "dist", f))
    open(os.path.join(ROOT, "dist", "robots.txt"), "w").write(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}sitemap.xml\n")
    open(os.path.join(ROOT, "dist", "sitemap.xml"), "w").write(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url><loc>{SITE}</loc><lastmod>{today}</lastmod><changefreq>daily</changefreq></url>\n</urlset>\n")
    print(f"Built dist/index.html ({len(page) // 1024} KB){' as a preview' if PREVIEW else ''}")


if __name__ == "__main__":
    main()
