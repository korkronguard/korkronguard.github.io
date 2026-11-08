"""The hourly job on GitHub: keeps the live What's New page's list of Blizzard's posts current and tells the guild's Discord.

It runs from the guild site's public repo (.github/workflows/blue-posts.yml); tools/copy_to_site.py copies this file and
blue_posts.py there, so change them here. It needs no game client and keeps no post text. The list it keeps is the site's own
data/blueposts.js, which nothing else writes, so it can't clash with a publish from the PC.

    python3 blue_posts_job.py look     update the list, and note what's new for notify
    python3 blue_posts_job.py notify   tell Discord what look found (needs the DISCORD_WEBHOOK secret; without it, nothing)
    python3 blue_posts_job.py test     send the newest post to Discord, to see that the webhook works
"""
import json
import os
import sys
import tempfile
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # .github/scripts, next to blue_posts.py
import blue_posts  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(REPO, "data", "blueposts.js")
NEWS = os.path.join(os.environ.get("RUNNER_TEMP") or tempfile.gettempdir(), "blue_posts_news.json")
PAGE = "https://korkronguard.github.io/planner/whats-new.html"
MAX_MESSAGES = 5  # more than this at once becomes one line pointing to the page
EXCERPT_CHARS = 300
RED = 0xC41F3B


def look(data=DATA, news=NEWS):
    posts, new, edited = blue_posts.look(data)
    for post in new:
        blue_posts.note_version(post, blue_posts.get_json(f"{blue_posts.FORUM}/posts/{post['id']}.json"))
    for post, full in edited:
        blue_posts.note_version(post, full)
    if new or edited:
        blue_posts.write_posts(posts, data)
    with open(news, "w", encoding="utf-8") as f:
        json.dump({"new": new, "edited": [post for post, _ in edited]}, f)
    print(f"{len(posts)} posts about Forever; {len(new)} new, {len(edited)} edited.")


def embed(post, label=""):
    """A post as a Discord message's card. Its words come from the forum, so send() stops them pinging anyone."""
    text = post["excerpt"]
    if len(text) > EXCERPT_CHARS:
        text = text[:EXCERPT_CHARS - 1].rstrip() + "…"
    author = post["author"] + (f", {post['role']}" if post["role"] else "")
    return {"title": f"{label}{post['title']}"[:256], "url": post["url"], "description": text, "color": RED,
            "author": {"name": author}, "footer": {"text": "All of Blizzard's posts: " + PAGE}}


def send(webhook, body):
    request = urllib.request.Request(webhook, data=json.dumps({**body, "allowed_mentions": {"parse": []}}).encode("utf-8"),
                                     headers={"Content-Type": "application/json", "User-Agent": "Kor'kron Guard post job"})
    urllib.request.urlopen(request, timeout=30).close()
    time.sleep(1)  # Discord allows a few messages a second


def notify(news=NEWS, webhook=None):
    with open(news, encoding="utf-8") as f:
        found = json.load(f)
    cards = [embed(p) for p in sorted(found["new"], key=lambda p: p["date"])] + [embed(p, "Updated: ") for p in found["edited"]]
    if not cards:
        return
    if not webhook:
        print("No Discord webhook set: nothing sent.")
    elif len(cards) > MAX_MESSAGES:
        send(webhook, {"content": f"Blizzard posted or updated {len(cards)} times about WoW: Forever. See them on What's New: {PAGE}"})
    else:
        for card in cards:
            send(webhook, {"embeds": [card]})


def test(webhook):
    if not webhook:
        raise SystemExit("No Discord webhook set: add the DISCORD_WEBHOOK secret first.")
    send(webhook, {"embeds": [embed(blue_posts.read_known(DATA)[0], "Test: ")]})


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    webhook = os.environ.get("DISCORD_WEBHOOK", "")
    if command == "look":
        look()
    elif command == "notify":
        notify(NEWS, webhook)
    elif command == "test":
        test(webhook)
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
