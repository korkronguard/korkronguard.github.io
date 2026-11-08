"""Blizzard's own posts about WoW: Forever, for the What's New page (site/data/blueposts.js) and the patch log.

Usage (from the project folder):
    python -I tools/blue_posts.py            download what's new, update the page's data, list new and edited posts
    python -I tools/blue_posts.py --print    ... and print their text (for edited posts, the lines that are new)

The source is the forum's Blizzard Tracker, every post by Blizzard staff on the US World of Warcraft forums:
https://us.forums.blizzard.com/en/wow/g/blizzard-tracker/activity/posts (the same list as JSON: FEED, 20 posts a page,
newest first, all games). Kept: posts in the forum's WoW: Forever categories, or with Forever in the thread's title.

Blizzard edits its hotfix and notes threads in place, and the feed doesn't say so, so those posts are looked up one by
one while they're still active (WATCH_DAYS). The page gets each post's title, author, date and the forum's own short
excerpt, with a link; the full text stays on this PC (raw/blue-posts/, untrusted, gitignored).

A copy of this file runs on GitHub too (blue_posts_job.py), so it needs nothing but Python itself.
"""
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FORUM = "https://us.forums.blizzard.com/en/wow"
FEED = FORUM + "/groups/blizzard-tracker/posts.json"
TEXT_DIR = os.path.join(ROOT, "raw", "blue-posts")
DATA = os.path.join(ROOT, "site", "data", "blueposts.js")
DATA_START = "KP.bluePosts="
# the forum's categories for the game: WoW: Forever, its General Discussion, Community Connections, Bug Report, Beta
FOREVER_CATEGORIES = {346, 347, 348, 349, 352}
START = "2026-09-12"  # Forever's announcement: the first run goes back this far
WATCH_DAYS = 30       # a notes post is looked up for edits this long after it last changed
NOTES = re.compile(r"hotfix|development notes|patch notes|tuning|known issues", re.I)  # threads about game changes
NEWS_ACCOUNT = "BlizzardEntertainment"
BUSY_WAITS = (5, 20, 60)  # seconds before asking again when the forum says it's busy (a first run met a 503)


def get_json(url):
    """A forum page as JSON, one request a second, asking again if the forum is busy. Raises OSError (network, HTTP error)
    or ValueError (not JSON)."""
    req = urllib.request.Request(url, headers={"User-Agent": "KorkronPlanner blue post check"})
    for wait in (*BUSY_WAITS, None):
        time.sleep(1)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503) or wait is None:
                raise
            time.sleep(wait)


def about_forever(post):
    return post["category_id"] in FOREVER_CATEGORIES or "forever" in post["topic_title"].lower()


def kind(post):
    """What sort of post it is, for the page's filter: game notes, official news, a reply in a thread, or anything else."""
    if NOTES.search(post["topic_title"]):
        return "notes"
    if post["username"] == NEWS_ACCOUNT:
        return "news"
    return "reply" if post["post_number"] > 1 else "other"


def plain(cooked):
    """A post's HTML as plain text, a line per paragraph or list item."""
    text = re.sub(r"</(p|li|h\d|tr|div|blockquote)>|<br\s*/?>", "\n", cooked)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def excerpt(post):
    """The forum's short preview as one plain line, without the banner link news posts open with."""
    text = re.sub(r"^<a [^>]*>\[[^\]]*\]</a>", "", post.get("excerpt") or "")
    return " ".join(html.unescape(re.sub(r"<[^>]+>", "", text)).split())


def title(post):
    """The thread's title without invisible text-direction marks (podcast titles pasted from YouTube have them)."""
    return re.sub(r"[‎‏‪-‮]", "", post["topic_title"])


def record(post):
    """What the page keeps of a feed post. The link is built from its numbers, not taken from the download."""
    return {"id": post["id"], "topic": post["topic_id"], "n": post["post_number"], "title": title(post),
            "author": post["username"], "role": post.get("user_title") or "", "date": post["created_at"],
            "kind": kind(post), "excerpt": excerpt(post), "category": post["category_id"],
            "url": f"{FORUM}/t/{post['topic_id']}/{post['post_number']}"}


def feed_posts(newest_known):
    """The feed's posts about Forever since this date (ISO text, as the feed writes it), walking back a page at a time."""
    found, before = [], None
    while True:
        page = get_json(FEED + (f"?before_post_id={before}" if before else ""))["posts"]
        found += [p for p in page if p["created_at"] > newest_known and about_forever(p)]
        if not page or page[-1]["created_at"] <= newest_known:
            return found
        before = page[-1]["id"]


def merge(known, fresh):
    """The page's list with these feed posts added, newest first. A news post Blizzard posted in two forums is kept once."""
    posts = list(known)
    seen = {(p["title"], p["author"], p["excerpt"]) for p in posts if p["kind"] == "news"}
    for p in sorted(fresh, key=lambda p: p["created_at"]):
        r = record(p)
        if r["kind"] == "news" and (r["title"], r["author"], r["excerpt"]) in seen:
            continue
        seen.add((r["title"], r["author"], r["excerpt"]))
        posts.append(r)
    return sorted(posts, key=lambda p: p["date"], reverse=True)


def watched(posts, now):
    """The notes posts worth looking up for edits: posted or edited in the last WATCH_DAYS."""
    since = (now - timedelta(days=WATCH_DAYS)).isoformat()[:10]
    return [p for p in posts if p["kind"] == "notes" and p.get("edited", p["date"]) >= since]


def edited_posts(posts, now):
    """[(post, its forum JSON)] for the watched posts whose edit count went up since the page's data was written. A post
    Blizzard has since deleted (404) just stays as it is."""
    out = []
    for p in watched(posts, now):
        try:
            full = get_json(f"{FORUM}/posts/{p['id']}.json")
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
            continue
        if full.get("version", 1) > p.get("version", 1):
            out.append((p, full))
    return out


def read_known(path=DATA):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        text = f.read()
    return json.JSONDecoder().raw_decode(text, text.index(DATA_START) + len(DATA_START))[0]["posts"]


def write_posts(posts, path=DATA):
    """The page's data file: a script, so the page also works opened from disk."""
    text = json.dumps({"posts": posts}, ensure_ascii=False, separators=(",", ":"))
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"window.KP=window.KP||{{}};{DATA_START}{text};\n")


def newest(posts):
    return max((p["date"] for p in posts), default=START)


def look(path=DATA):
    """(every post the page should list, the new ones among them, [(post, its forum JSON)] for the edited ones)."""
    known = read_known(path)
    known_ids = {p["id"] for p in known}
    posts = merge(known, feed_posts(newest(known)))
    return posts, [p for p in posts if p["id"] not in known_ids], edited_posts(known, datetime.now(timezone.utc))


def check():
    """(new posts, edited posts) since the page's data was written. Changes nothing: for the /update-addons report."""
    return look()[1:]


def note_version(post, full):
    """Remembers on the post how many times it's been edited, so the next look can tell."""
    if full.get("version", 1) > 1:
        post["version"], post["edited"] = full["version"], full["updated_at"]


def save_text(post, full, show):
    """Keeps a post's full text and version; with `show`, prints what a reader hasn't seen: all of a new post, only the new
    lines of an edited one."""
    os.makedirs(TEXT_DIR, exist_ok=True)
    text, path = plain(full["cooked"]), os.path.join(TEXT_DIR, f"{post['id']}.txt")
    old = None
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            old = set(f.read().splitlines())
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    note_version(post, full)
    if show:
        lines = text.splitlines() if old is None else [line for line in text.splitlines() if line not in old]
        print(f"\n=================== {post['title']} ({post['url']})\n" + "\n".join(lines))


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # post titles can hold characters Windows' console encoding lacks
    show = "--print" in sys.argv[1:]
    try:
        posts, new, edited = look()
        fulls = [(p, get_json(f"{FORUM}/posts/{p['id']}.json")) for p in new]
    except (OSError, ValueError) as e:
        raise SystemExit(f"Couldn't read the forum ({e}). Nothing changed: run this again later.") from None
    for p, full in fulls + edited:
        save_text(p, full, show)
    write_posts(posts)
    print(f"{len(posts)} posts about Forever; {len(new)} new, {len(edited)} edited.")
    for p in new:
        print(f"  NEW     {p['date'][:10]}  {p['author']:<22} {p['title']}")
    for p, full in edited:
        print(f"  EDITED  {full['updated_at'][:10]}  {p['author']:<22} {p['title']}")
    if new or edited:
        print("Read them, add what matters to FOREVER_CHANGES.md, and add a line to site/data/blue-notes.js for class "
              "changes the game's files can't show.")


if __name__ == "__main__":
    main()
