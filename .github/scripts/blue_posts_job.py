import json
import os
import sys
import tempfile
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blue_posts

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(REPO, "data", "blueposts.js")
NEWS = os.path.join(os.environ.get("RUNNER_TEMP") or tempfile.gettempdir(), "blue_posts_news.json")
PAGE = "https://korkronguard.github.io/planner/whats-new.html"
MAX_MESSAGES = 5
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
    time.sleep(1)


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
        raise SystemExit("usage: blue_posts_job.py look | notify | test")


if __name__ == "__main__":
    main()
