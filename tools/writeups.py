#!/usr/bin/env python3
"""
Regenerate the data-driven school write-ups in data/schools.json.

Only schools with "writeupAuto": true are touched; hand-written write-ups are left
alone. Every clause is a fixed rule over the school's own ABA figures and rank tier,
so a refresh of the data (tools/fetch_aba.py) followed by this script keeps the
prose in step with the numbers.

Usage:  python3 tools/writeups.py [--dry-run]
"""

import argparse
import json
import sys
from pathlib import Path

SCHOOLS_JSON = Path(__file__).resolve().parent.parent / "data" / "schools.json"

LEAD = {
    "T14": "National-elite", "T20": "National", "T30": "Strong national", "T50": "Solid national",
    "T60": "Regional-plus", "T70": "Regional-plus",
}

# Thresholds. Each sits in the gap the original hand-tuned cut-offs left in the data.
PLACE_HIGH, PLACE_LOW = 92, 75      # % of grads in FT long-term bar-required jobs
BIGLAW_HIGH, BIGLAW_THIN = 30, 2    # % to 500+ firms; "thin" applies to ranked tiers only
FED_HIGH = 7                        # % federal clerkships
GOV_PI_HIGH = 27.2                  # % government + public interest
BAR_GAP = 6                         # points above/below the state average
RESIDENCY_SAVES = 15000             # out-of-state minus in-state tuition
CHEAP_OUT, STEEP_OUT = 33300, 70000 # out-of-state tuition
MAX_CLAUSES = 2


def raw_pct(pct, grads):
    """Undo the 1dp rounding: pct came from an integer count over `grads`."""
    return round(pct * grads / 100) / grads * 100


def generate(s):
    a, o, bar = s["admissions"], s.get("outcomes"), s.get("bar") or {}
    lead = LEAD.get(s["tier"], "Regional")
    admit = round(a["offers"] / a["applications"] * 100)
    text = (f"{lead} school in {s['city']}, admitting {admit}% of applicants at a "
            f"{s['medianLSAT']}/{s['medianGPA']:.2f} median.")

    good, bad = [], []
    diff = bar.get("diff")
    out, res = s["tuitionOutState"], s["tuitionOutState"] - s["tuitionInState"]
    if o:
        g = o["graduates"]
        count = lambda k: round(o[k] * g / 100)
        # Thresholds compare the published 1dp figures; the text quotes the unrounded share.
        place, big, fed = o["barRequiredFTLT"], o["bigLaw"], o["federalClerk"]
        govpi = o["government"] + o["publicInterest"]
        if place >= PLACE_HIGH:
            good.append(f"{round(raw_pct(place, g))}% of the class lands full-time bar-required work, "
                        f"among the best placement rates in the country")
        if big >= BIGLAW_HIGH:
            good.append(f"BigLaw is a live option, with {round(raw_pct(big, g))}% going to firms of 500+ lawyers")
        if fed > FED_HIGH:
            good.append(f"the federal clerkship pipeline is unusually strong at {round(raw_pct(fed, g))}% of the class")
        if govpi > GOV_PI_HIGH:
            good.append(f"it pulls hard toward government and public interest ({round((count('government') + count('publicInterest')) / g * 100)}% of graduates)")
        if place < PLACE_LOW:
            bad.append(f"just {round(raw_pct(place, g))}% of graduates land full-time bar-required work")
        if s["tier"] not in ("Regional", "Unranked") and big < BIGLAW_THIN:
            bad.append(f"BigLaw is thin for the tier at {round(raw_pct(big, g))}% into 500+ lawyer firms")
    if diff is not None and diff >= BAR_GAP:
        good.append(f"graduates beat their states' average bar pass rate by {round(diff)} points")
    if diff is not None and diff <= -BAR_GAP:
        bad.append(f"graduates trail their states' average bar pass rate by {round(-diff)} points")
    if out <= CHEAP_OUT:
        good.append(f"the sticker price is low at ${out:,} out-of-state")
    if res >= RESIDENCY_SAVES:
        good.append(f"residency saves ${res:,} a year")
    if out >= STEEP_OUT:
        bad.append(f"the ${out:,} out-of-state sticker is steep")

    def join(items):
        items = items[:MAX_CLAUSES]
        return items[0] if len(items) == 1 else ", ".join(items[:-1]) + ", and " + items[-1]
    if good:
        text += f" Where it excels: {join(good)}."
    if bad:
        text += f" Where it falls short: {join(bad)}."
    if not good and not bad:
        text += (" Middle of the pack on cost, placement, and bar passage — no standout strength"
                 " or weakness in the 509 data.")
    return text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    payload = json.loads(SCHOOLS_JSON.read_text())
    changed = 0
    for s in payload["schools"]:
        if not s.get("writeupAuto"):
            continue
        new = generate(s)
        if new != s["writeup"]:
            changed += 1
            print(f"- {s['name']}\n    was: {s['writeup']}\n    now: {new}")
            s["writeup"] = new
    print(f"\n{changed} write-up(s) changed.")
    if not args.dry_run:
        SCHOOLS_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    sys.exit(main())
