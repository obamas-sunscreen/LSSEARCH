#!/usr/bin/env python3
"""
Check every school's `website`: does it load, and is it that school's page?

A page counts as confirmed when it returns 200 on the same host it was given, with
no "not found" or outage title. Everything else is listed for a look in a real
browser: bot walls (403/406), timeouts, soft 404s, and redirects to another host
(a moved site, a parked domain, an IT-outage page). Whether a page is the *right*
school's is checked by eye once, when a URL is added or changed.

Runs four requests at a time: university firewalls start dropping connections when
hit with bursts, and a blocked check proves nothing about the link.

Usage:  python3 tools/check_links.py
"""

import concurrent.futures
import html
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

SCHOOLS_JSON = Path(__file__).resolve().parent.parent / "data" / "schools.json"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126 Safari/537.36")


def check(s):
    url = s["website"]
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
        with urllib.request.urlopen(req, timeout=30) as r:
            status, final, body = r.status, r.geturl(), r.read(400_000).decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        return s, e.code, url, ""
    except Exception as e:
        return s, 0, url, type(e).__name__
    m = re.search(r"<title[^>]*>(.*?)</title>", body, re.S | re.I)
    return s, status, final, html.unescape(re.sub(r"\s+", " ", m.group(1))).strip() if m else ""


def main():
    schools = json.loads(SCHOOLS_JSON.read_text())["schools"]
    confirmed, review = 0, []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for s, status, final, title in pool.map(check, schools):
            same_host = urlparse(final).netloc.lower() == urlparse(s["website"]).netloc.lower()
            ok = status == 200 and same_host and not re.search(r"\b404\b|not found|outage", title, re.I)
            if ok:
                confirmed += 1
            else:
                review.append(f"  {status or 'ERR'}  {s['name']}\n       {final}  [{title[:80]}]")
    print(f"{confirmed}/{len(schools)} confirmed.")
    if review:
        print(f"{len(review)} to check by hand in a browser (bot walls and timeouts are usually fine):")
        print("\n".join(review))


if __name__ == "__main__":
    sys.exit(main())
