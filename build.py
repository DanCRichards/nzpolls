"""Build dist/index.html: one self-contained page from the files in src/ and data/.

    python3 data/data.py   # only after editing seats, candidates or party lists
    python3 data/map.py    # only after replacing the boundary files in data/boundaries/
    python3 build.py       # always, after any change
"""
import html.parser, json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
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


def main():
    body = read("src", "body.html")
    check = TagCheck()
    check.feed(body)
    if check.errors or check.stack:
        sys.exit("body.html structure problem:\n  " + "\n  ".join(check.errors or [f"unclosed {check.stack[-5:]}"]))
    json.loads(read("data", "data.json"))  # fail early on bad data
    json.loads(read("data", "map.json"))
    page = (read("src", "head.html") + "<style>" + read("src", "base.css") + read("src", "extra.css")
            + "</style>\n</head>\n<body>\n" + body
            + "\n<script>\nconst DATA=" + read("data", "data.json") + ";\nconst MAP=" + read("data", "map.json") + ";\n"
            + read("src", "head.js") + read("src", "main.js") + "\n</script>\n</body>\n</html>\n")
    os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
    open(os.path.join(ROOT, "dist", "index.html"), "w", encoding="utf-8").write(page)
    print(f"Built dist/index.html ({len(page) // 1024} KB)")


if __name__ == "__main__":
    main()
