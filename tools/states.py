#!/usr/bin/env python3
"""
Refresh the state figures in data/states.json and recompute every score.

Fetched here, newest available:
  costOfLivingIndex, housingIndex   MERIC's C2ER table   https://meric.mo.gov/data/cost-living-data-series
  violentCrimeRate                  FBI Crime in the United States, Table 4 (estimated rate per 100k),
                                    via the Crime Data Explorer download (cius/<year>/cius-estimations-<year>.zip)
  lawyerJobsPer1k, avgLegalSalary   BLS OEWS, occupation 23-1011, latest annual release (public API, no key;
                                    the score uses BLS's 3-decimal jobs figure, stored rounded to 1)
Edited by hand, then re-scored here:
  lifeExpectancy                    CDC/NCHS U.S. State Life Tables (NVSR) — PDF only, roughly yearly
  livability                        editorial

Scores: 1-5 percentile ranks across the 51 jurisdictions (ties at the midpoint).
  affordability = 2/3 cost-of-living + 1/3 housing, both inverted, as 1 + 4·pct
  legalIndustry = 1/2 lawyer job density + 1/2 average salary, as 1 + 4·pct
  safety, healthcare = quintiles (10/10/10/10/11) of crime (inverted) and life expectancy
  qualityOfLife.score = mean(safety, healthcare, livability); overall = mean of the three factors

Usage:  python3 tools/states.py [--dry-run]
"""

import argparse
import datetime
import html
import io
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

import openpyxl

STATES_JSON = Path(__file__).resolve().parent.parent / "data" / "states.json"
UA = {"User-Agent": "Mozilla/5.0 (law-school-picker data refresh)"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def meric():
    t = get("https://meric.mo.gov/data/cost-living-data-series").decode("utf-8", "ignore")
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", t, flags=re.S)
    t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t)))
    quarter = re.search(r"Cost of Living-([A-Za-z]+ Quarter \d{4})", t)
    rows = re.findall(r"(\d+) ([A-Z][A-Za-z. ]+?) +(\d+\.\d) (\d+\.\d) (\d+\.\d) ", t[t.find("Rank State"):])
    return (quarter.group(1) if quarter else "unknown quarter"), {n.strip(): (float(i), float(h)) for _, n, i, _, h in rows}


def fbi():
    """Newest year with a published CIUS estimations download -> {state name: rate}."""
    for year in range(datetime.date.today().year, datetime.date.today().year - 3, -1):
        key = f"cius/{year}/cius-estimations-{year}.zip"
        signed = json.loads(get("https://cde.ucr.cjis.gov/LATEST/s3/signedurl?key=" + key) or b"{}")
        url = signed.get(key) or next(iter(signed.values()), None)
        if not url:
            continue
        z = zipfile.ZipFile(io.BytesIO(get(url)))
        name = next(n for n in z.namelist() if "Table_4" in n)
        ws = openpyxl.load_workbook(io.BytesIO(z.read(name)), read_only=True, data_only=True).worksheets[0]
        rates, area = {}, None
        for r in ws.iter_rows(values_only=True):
            if r[0]:
                area = re.sub(r"[\d,\s]+$", "", str(r[0]).strip())  # strip footnote digits
            if r[1] == year and isinstance(r[4], (int, float)):
                rates[area] = float(r[4])
        return year, rates
    raise SystemExit("No FBI CIUS estimations download found for the last three years")


FIPS = {"AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09", "DE": "10",
        "DC": "11", "FL": "12", "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18", "IA": "19",
        "KS": "20", "KY": "21", "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27",
        "MS": "28", "MO": "29", "MT": "30", "NE": "31", "NV": "32", "NH": "33", "NJ": "34", "NM": "35",
        "NY": "36", "NC": "37", "ND": "38", "OH": "39", "OK": "40", "OR": "41", "PA": "42", "RI": "44",
        "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49", "VT": "50", "VA": "51", "WA": "53",
        "WV": "54", "WI": "55", "WY": "56"}


def bls():
    """{abbr: (jobs per 1,000, annual mean wage)} for lawyers (23-1011), latest OEWS year."""
    series = lambda a, kind: f"OEUS{FIPS[a]}00000000000231011{kind}"  # 16 = per 1,000 jobs, 04 = mean wage
    ids = [series(a, k) for a in FIPS for k in ("16", "04")]
    vals, years = {}, set()
    for i in range(0, len(ids), 25):  # the keyless API takes 25 series a request
        body = json.dumps({"seriesid": ids[i:i + 25], "latest": True}).encode()
        req = urllib.request.Request("https://api.bls.gov/publicAPI/v2/timeseries/data/", data=body,
                                     headers={**UA, "Content-type": "application/json"})
        for s in json.load(urllib.request.urlopen(req, timeout=120))["Results"]["series"]:
            if s["data"]:
                vals[s["seriesID"]] = float(s["data"][0]["value"])
                years.add(s["data"][0]["year"])
    return "/".join(sorted(years)), {a: (vals[series(a, "16")], vals[series(a, "04")]) for a in FIPS}


def pct(vals, v):
    below, eq = sum(x < v for x in vals), sum(x == v for x in vals)
    return (below + (eq - 1) / 2) / (len(vals) - 1)


def quintile(vals, v, high_good):
    p = pct(vals, v) if high_good else 1 - pct(vals, v)
    return min(5, 1 + int(p * 5 + 1e-9))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    d = json.loads(STATES_JSON.read_text())
    states = d["states"]
    quarter, col = meric()
    year, crime = fbi()
    bls_year, legal = bls()
    missing = [s["state"] for s in states if s["state"] not in col or s["state"] not in crime]
    if missing:
        raise SystemExit(f"Missing from MERIC/FBI tables: {missing}")
    print(f"MERIC: {quarter} · FBI: {year} estimates · BLS OEWS: May {bls_year}")

    cols = [col[s["state"]][0] for s in states]
    hous = [col[s["state"]][1] for s in states]
    crimes = [crime[s["state"]] for s in states]
    lifes = [s["qualityOfLife"]["lifeExpectancy"] for s in states]
    jobs = [legal[s["abbr"]][0] for s in states]
    pay = [legal[s["abbr"]][1] for s in states]
    changes = []
    for s in states:
        a, q, l = s["affordability"], s["qualityOfLife"], s["legalIndustry"]
        before = json.dumps(s, sort_keys=True)
        a["costOfLivingIndex"], a["housingIndex"] = col[s["state"]]
        a["score"] = round(2 / 3 * (1 + 4 * (1 - pct(cols, a["costOfLivingIndex"])))
                           + 1 / 3 * (1 + 4 * (1 - pct(hous, a["housingIndex"]))), 1)
        j, w = legal[s["abbr"]]
        l["lawyerJobsPer1k"], l["avgLegalSalary"] = round(j, 1), int(w)
        l["score"] = round(0.5 * (1 + 4 * pct(jobs, j)) + 0.5 * (1 + 4 * pct(pay, w)), 1)
        q["violentCrimeRate"] = crime[s["state"]]
        q["safety"] = quintile(crimes, q["violentCrimeRate"], high_good=False)
        q["healthcare"] = quintile(lifes, q["lifeExpectancy"], high_good=True)
        q["score"] = round((q["safety"] + q["healthcare"] + q["livability"]) / 3, 2)
        s["overall"] = round((a["score"] + q["score"] + l["score"]) / 3, 2)
        if json.dumps(s, sort_keys=True) != before:
            changes.append(f"  {s['abbr']}: afford {a['score']} · safety {q['safety']} · health {q['healthcare']} · overall {s['overall']}")
    print(f"{len(changes)} state(s) changed")
    print("\n".join(changes))
    print("Update the source years in states.json's _note and the README table if they moved.")
    if not args.dry_run:
        STATES_JSON.write_text(json.dumps(d, indent=2) + "\n")


if __name__ == "__main__":
    sys.exit(main())
