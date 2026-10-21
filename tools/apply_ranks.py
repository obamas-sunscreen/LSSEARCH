#!/usr/bin/env python3
"""
Set every school's U.S. News rank and tier from a list read off usnews.com.

U.S. News blocks scripted access, so the list is captured in a real browser (the
refreshing-law-school-data skill has the snippet) and saved one school per line:

    University of Chicago|Chicago, IL|2
    Barry University|FL|175-194
    Jacksonville University|Jacksonville, FL|Unranked

Each school is matched on its exact `usnewsName`. A school missing from the list,
or a U.S. News entry that matches nothing (other than the known non-site schools),
stops the script — fix `usnewsName` rather than letting a rank go stale.
Ranges like "175-194" and "Unranked" both mean no published rank: rank null.

Usage:  python3 tools/apply_ranks.py LIST.txt --edition "2027 edition (April 2027)" [--dry-run]
"""

import argparse
import json
import re
import sys
from pathlib import Path

import writeups

SCHOOLS_JSON = Path(__file__).resolve().parent.parent / "data" / "schools.json"

# On U.S. News's list but not on the site: Puerto Rico is out of scope, Golden Gate closed its JD.
NOT_ON_SITE = {"Inter-American University", "Pontifical Catholic University of Puerto Rico",
               "University of Puerto Rico", "Golden Gate University"}

BRACKETS = ((14, "T14"), (20, "T20"), (30, "T30"), (50, "T50"), (60, "T60"),
            (70, "T70"), (80, "T80"), (90, "T90"), (100, "T100"))


def tier_for(rank):
    if rank is None:
        return "Unranked"
    return next((t for cut, t in BRACKETS if rank <= cut), "Regional")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("list", help="name|location|rank lines captured from usnews.com")
    ap.add_argument("--edition", required=True, help='e.g. "2027 edition (April 2027)"')
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    live, checksum = {}, 0
    lines = [l for l in Path(args.list).read_text().splitlines() if l.strip()]
    for i, line in enumerate(lines, 1):
        name, _, rank = line.rsplit("|", 2)
        live[name.strip()] = int(rank) if rank.strip().isdigit() else None
        # A range like "175-194" counts as its first number, as parseInt does in the browser.
        checksum += i * int(re.match(r"\d*", rank.strip()).group() or 0)
    # Must match the line usnews-capture.js printed: catches any mistyped or dropped line.
    print(f"{len(lines)} entries, rank checksum {checksum}")

    payload = json.loads(SCHOOLS_JSON.read_text())
    schools = payload["schools"]
    missing = [s["name"] for s in schools if s.get("usnewsName") not in live]
    unknown = sorted(set(live) - {s.get("usnewsName") for s in schools} - NOT_ON_SITE)
    if missing or unknown:
        raise SystemExit("Name mismatch — fix usnewsName (or NOT_ON_SITE):\n"
                         + "".join(f"  site school not on the list: {n}\n" for n in missing)
                         + "".join(f"  list entry matching no school: {n}\n" for n in unknown))
    if len(live) < 190:
        raise SystemExit(f"Only {len(live)} entries — the page probably hadn't finished loading.")

    changed = 0
    for s in schools:
        rank = live[s["usnewsName"]]
        if (s["rank"], s["tier"]) != (rank, tier_for(rank)):
            changed += 1
            print(f"  {s['name']}: #{s['rank']} {s['tier']} -> #{rank} {tier_for(rank)}")
        s["rank"], s["tier"] = rank, tier_for(rank)
        if s.get("writeupAuto"):
            s["writeup"] = writeups.generate(s)  # the auto write-ups lead with the tier
    payload.setdefault("_vintage", {})["rank"] = f"U.S. News Best Law Schools, {args.edition}"
    print(f"\n{changed} school(s) changed rank or tier. Hand-written write-ups that name a tier need re-reading.")

    if args.dry_run:
        print("--dry-run: nothing written.")
        return
    SCHOOLS_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    sys.exit(main())
