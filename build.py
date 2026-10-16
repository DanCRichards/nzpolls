"""Build dist/index.html: one self-contained page from the files in src/ and data/.

    python3 data/data.py   # only after editing seats, candidates or party lists
    python3 data/map.py    # only after replacing the boundary files in data/boundaries/
    python3 build.py       # always, after any change
"""
import datetime, html, html.parser, json, math, os, re, shutil, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = "https://nzpolls.co.nz/"
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
    body = body.replace("{{POLL_SUMMARY}}", poll_summary).replace("{{HEMI_SKELETON}}", hemi_skeleton())
    page = (read("src", "head.html").replace("{{BUILD_DATE}}", today) + "<style>" + read("src", "base.css") + read("src", "extra.css")
            + "</style>\n</head>\n<body>\n" + body
            + "\n<script>\nconst DATA=" + read("data", "data.json") + ";\nconst MAP=" + read("data", "map.json") + ";\n"
            + read("src", "head.js") + read("src", "main.js") + "\n</script>\n" + read("src", "foot.html") + "</body>\n</html>\n")
    os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
    open(os.path.join(ROOT, "dist", "index.html"), "w", encoding="utf-8").write(page)
    # icons, share image, robots.txt and sitemap.xml sit next to the page
    for f in os.listdir(os.path.join(ROOT, "static")):
        shutil.copy(os.path.join(ROOT, "static", f), os.path.join(ROOT, "dist", f))
    open(os.path.join(ROOT, "dist", "robots.txt"), "w").write(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}sitemap.xml\n")
    open(os.path.join(ROOT, "dist", "sitemap.xml"), "w").write(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url><loc>{SITE}</loc><lastmod>{today}</lastmod><changefreq>daily</changefreq></url>\n</urlset>\n")
    print(f"Built dist/index.html ({len(page) // 1024} KB)")


if __name__ == "__main__":
    main()
