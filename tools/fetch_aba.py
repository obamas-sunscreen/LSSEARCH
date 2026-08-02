#!/usr/bin/env python3
"""
Pull official ABA Standard 509 data and fold it into data/schools.json.

Two compilation reports come from the ABA's own backend (the same endpoints the
disclosure site's UI calls — public, no key, no auth):

  EmploymentOutcomes/GenerateEQCompilationReport   -> employment outcomes
  AnnualQuestionnaire/GetAllCompilationData        -> "First Year Class" admissions

The ABA lists schools by parent institution ("Samford University"); this project
lists them by the name people actually use ("Cumberland School of Law"). ALIASES
below bridges the gap. The join is asserted 1:1 — if a school stops matching, the
script fails loudly rather than silently dropping outcomes for it.

Usage:  python3 tools/fetch_aba.py [--year 2025] [--dry-run]

Requires: openpyxl  (pip3 install openpyxl)
"""

import argparse
import io
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import openpyxl

API = "https://backend.abarequireddisclosures.org/api/"
ROOT = Path(__file__).resolve().parent.parent
SCHOOLS_JSON = ROOT / "data" / "schools.json"

# Our name -> ABA SchoolName. Only the ones normalization can't reach on its own:
# donor/branding names, campus abbreviations, and the ABA's inverted word order.
ALIASES = {
    "Cumberland School of Law": "Samford University",
    "Thomas Goode Jones School of Law": "Faulkner University",
    "Sandra Day O'Connor College of Law": "Arizona State University",
    "UCLA School of Law": "California-Los Angeles, University of",
    "UC Berkeley School of Law": "California-Berkeley, University of",
    "USC Gould School of Law": "Southern California, University of",
    "UC Irvine School of Law": "California-Irvine, University of",
    "UC Davis School of Law": "California-Davis, University of",
    "UC Law San Francisco": "California-San Francisco, University of",
    "Loyola Law School": "Loyola Marymount University-Los Angeles",
    "Pacific McGeorge School of Law": "Pacific, University of the",
    "Western State College of Law": "Western State, Westcliff University",
    "Columbus School of Law, Catholic University": "Catholic University of America, The",
    "UDC David A. Clarke School of Law": "District of Columbia, University of",
    "St. Thomas University College of Law": "St. Thomas University (Miami)",
    "University of Hawai'i at Manoa William S. Richardson School of Law": "Hawaii, University of",
    "Northwestern Pritzker School of Law": "Northwestern University",
    "Chicago-Kent College of Law": "Chicago-Kent, Illinois Institute of Technology",
    "UIC School of Law": "Illinois-Chicago, University of",
    "Indiana University Maurer School of Law": "Indiana University-Bloomington",
    "Indiana University McKinney School of Law": "Indiana University-Indianapolis",
    "NKU Salmon P. Chase College of Law": "Northern Kentucky University",
    "LSU Paul M. Hebert Law Center": "Louisiana State University",
    "Loyola University New Orleans College of Law": "Loyola University-New Orleans",
    "Loyola University Chicago School of Law": "Loyola University-Chicago",
    "UMass Law - Dartmouth": "Massachusetts/Dartmouth, University of",
    "New England Law Boston": "New England Law/Boston",
    "Western Michigan University Cooley Law School": "Cooley Law School",
    "University of St. Thomas School of Law": "St. Thomas, (Minneapolis) University of",
    "Mitchell Hamline School of Law": "Mitchell/Hamline School of Law",
    "Washington University School of Law": "Washington University (St. Louis)",
    "UMKC School of Law": "Missouri-Kansas City, University of",
    "William S. Boyd School of Law at UNLV": "Nevada-Las Vegas, University of",
    "Benjamin N. Cardozo School of Law": "Cardozo, Yeshiva University",
    "University at Buffalo School of Law (SUNY)": "Buffalo, University at",
    "CUNY School of Law": "City University of New York, University of",
    "UNC School of Law": "North Carolina, University of",
    "Ohio State Moritz College of Law": "The Ohio State University",
    "Cleveland State Cleveland-Marshall College of Law": "Cleveland State University",
    "SMU Dedman School of Law": "Southern Methodist University",
    "UNT Dallas College of Law": "North Texas at Dallas, University of",
    "BYU J. Reuben Clark Law School": "Brigham Young University",
    "Vermont Law and Graduate School": "Vermont Law School",
    "Antonin Scalia Law School, George Mason University": "George Mason University",
    "University of Memphis Cecil C. Humphreys": "Memphis, The University of",
    # These four are unambiguous to a human but not to a subset test — the ABA's
    # name for each is also a subset of a different school's ("Texas, University of"
    # sits inside "Texas A&M", "Washington, University of" inside "American
    # University Washington College of Law").
    "University of Arkansas at Little Rock Bowen School of Law": "Arkansas at Little Rock, University of",
    "American University Washington College of Law": "American University",
    "Texas A&M School of Law": "Texas A&M University",
    "Texas Southern University Thurgood Marshall": "Texas Southern University",
}

# Schools with no ABA outcomes record for this year, and why. Keeps the 1:1
# assertion honest instead of loosening it.
EXPECTED_MISSING = {
    "Wilmington University School of Law": "provisionally approved 2023; no graduating class yet",
}

# Trailing designators that say "this is a law school" and nothing about which one.
DESIGNATOR = re.compile(
    r"\b(school of law|college of law|law school|law center|law and graduate school|"
    r"school of law and graduate studies)\b"
)

# Words that carry no identity at all.
NOISE = {"law", "center", "the", "of", "at", "and", "a", "in", "univ"}

# Generic institution words. Kept in the full token set — they're what separates
# Boston College from Boston University — but ignored when scoring near-matches,
# since the ABA writes "Pepperdine University" where we write "Pepperdine Caruso".
GENERIC = {"university", "college", "school"}


def normalize(name):
    """Reduce a school name to a comparable token set."""
    n = name.lower()
    n = n.replace("&", "and").replace("'", "").replace("’", "")
    # Parentheticals are kept as plain tokens — "(Miami)" vs "(Minneapolis)" is the
    # only thing telling the two St. Thomases apart.
    n = re.sub(r"[^a-z0-9]+", " ", n)
    n = DESIGNATOR.sub(" ", n)
    return frozenset(t for t in n.split() if t not in NOISE)


def core(tokens):
    """Identity tokens only — no 'university'/'college'/'school'."""
    return tokens - GENERIC


def fetch(endpoint, params):
    url = API + endpoint + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "law-school-picker/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        ctype = r.headers.get("Content-Type", "")
        body = r.read()
    if "spreadsheet" not in ctype:
        raise SystemExit(f"{endpoint} returned {ctype}, not a spreadsheet:\n{body[:400]}")
    return body


def sheet_rows(blob):
    """First worksheet as a list of dicts keyed by header."""
    wb = openpyxl.load_workbook(io.BytesIO(blob), read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(rows)]
    out = []
    for row in rows:
        if not row or row[0] is None:
            continue
        out.append(dict(zip(header, row)))
    return out


def num(v):
    if v is None or v == "":
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f


def pct(part, whole):
    """Percentage of graduates, 1dp. None when there's no denominator."""
    p, w = num(part), num(whole)
    if not w:
        return None
    return round((p or 0) / w * 100, 1)


def build_index(rows, label):
    """Map normalized-name -> row, refusing ambiguous collisions."""
    idx = {}
    for r in rows:
        key = normalize(r["SchoolName"])
        if key in idx:
            raise SystemExit(f"{label}: two schools normalize alike: "
                             f"{idx[key]['SchoolName']} / {r['SchoolName']}")
        idx[key] = r
    return idx


def match(school_name, idx):
    """Explicit alias, then exact token match, then a unique core-token subset.

    Returns (row, how) so the caller can print every inexact match for review.
    """
    alias = ALIASES.get(school_name)
    key = normalize(alias) if alias else normalize(school_name)
    if key in idx:
        return idx[key], ("alias" if alias else "exact")
    if alias:
        return None, "alias-miss"  # a stale alias is a bug, not a cue to guess

    ours = core(key)
    hits = [r for k, r in idx.items() if core(k) and core(k) <= ours]
    if len(hits) == 1:
        return hits[0], "fuzzy"
    return None, ("ambiguous" if hits else "none")


STATE_FIX = {"DISTRICT OF COLUMBIA": "District of Columbia"}


def title_state(raw):
    if not raw:
        return None
    s = str(raw).strip()
    if s.upper() in STATE_FIX:
        return STATE_FIX[s.upper()]
    return " ".join(w.capitalize() for w in s.split())


def extract_admissions(r):
    apps, offers = num(r.get("Applications")), num(r.get("Offers"))
    rate = num(r.get("AcceptanceRate"))
    if rate is None and apps:
        rate = (offers or 0) / apps * 100
    return {
        "applications": int(apps) if apps else None,
        "offers": int(offers) if offers else None,
        "acceptanceRate": round(rate, 1) if rate is not None else None,
        "enrolled": int(num(r.get("Enrollees")) or 0) or None,
        "gpa25": num(r.get("All25thPercentileUGPA")),
        "gpa50": num(r.get("All50thPercentileUGPA")),
        "gpa75": num(r.get("All75thPercentileUGPA")),
        "lsat25": int(num(r.get("All25thPercentileLSAT")) or 0) or None,
        "lsat50": int(num(r.get("All50thPercentileLSAT")) or 0) or None,
        "lsat75": int(num(r.get("All75thPercentileLSAT")) or 0) or None,
    }


def extract_outcomes(r):
    grads = num(r.get("Total_GraduatesTotal"))
    if not grads:
        return None, []

    def g(key):
        return num(r.get(key)) or 0

    # The ABA's headline number: full-time, long-term, bar-required or JD-advantage.
    quality = g("Employed_BarAdmissionRequiredFTLT") + g("Employed_JDAdvantageFTLT")
    small = g("Solo-Total") + g("1-10-Total") + g("11-25-Total") + g("26-50-Total") + g("51-100-Total")
    mid = g("101-250-Total") + g("251-500-Total")

    outcomes = {
        "graduates": int(grads),
        "employmentRate": pct(quality, grads),
        "barRequiredFTLT": pct(g("Employed_BarAdmissionRequiredFTLT"), grads),
        "unemployedSeeking": pct(g("UnEmployedSeekingTotal"), grads),
        "bigLaw": pct(g("501Plus-Total"), grads),
        "midLaw": pct(mid, grads),
        "smallFirm": pct(small, grads),
        "government": pct(g("Government_Total"), grads),
        "publicInterest": pct(g("PublicInterest_Total"), grads),
        "federalClerk": pct(g("Clerkships_Federal_Total"), grads),
        "stateClerk": pct(g("Clerkships_StateLocal_Total"), grads),
        "business": pct(g("BusinessIndustry_Total"), grads),
        "academia": pct(g("Education_Total"), grads),
    }

    top = []
    for name_key, n_key in (
        ("FirstLargestEmployment", "FirstLargestEmploymentTotal"),
        ("SecondLargestEmployment", "SecondLargestEmploymentTotal"),
        ("ThirdLargestEmployment", "ThirdLargestEmploymentTotal"),
    ):
        st, n = title_state(r.get(name_key)), num(r.get(n_key))
        if st and n:
            top.append({"state": st, "n": int(n), "pct": pct(n, grads)})
    return outcomes, top


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2025,
                    help="ABA report year (2025 report covers the class of 2024)")
    ap.add_argument("--dry-run", action="store_true", help="report without writing")
    args = ap.parse_args()

    print(f"Fetching ABA {args.year} compilations…")
    eq = sheet_rows(fetch("EmploymentOutcomes/GenerateEQCompilationReport",
                          {"year": args.year}))
    fy = sheet_rows(fetch("AnnualQuestionnaire/GetAllCompilationData",
                          {"year": args.year, "scetionName": "First Year Class"}))
    print(f"  employment outcomes: {len(eq)} schools")
    print(f"  first year class:    {len(fy)} schools")

    eq_idx, fy_idx = build_index(eq, "EQ"), build_index(fy, "FYC")

    payload = json.loads(SCHOOLS_JSON.read_text())
    schools = payload["schools"]

    used_eq, missing_eq, missing_fy, shifts, fuzzy = set(), [], [], [], []

    for s in schools:
        eq_row, how = match(s["name"], eq_idx)
        fy_row, _ = match(s["name"], fy_idx)

        if eq_row is not None and how == "fuzzy":
            fuzzy.append((s["name"], eq_row["SchoolName"]))

        if eq_row is None:
            missing_eq.append((s["name"], how))
        else:
            key = eq_row["SchoolName"]
            if key in used_eq:
                raise SystemExit(f"ABA record '{key}' claimed by two schools — fix ALIASES")
            used_eq.add(key)
            outcomes, top = extract_outcomes(eq_row)
            if outcomes:
                s["outcomes"] = outcomes
                s["topStates"] = top

        if fy_row is None:
            missing_fy.append(s["name"])
        else:
            adm = extract_admissions(fy_row)
            s["admissions"] = adm
            # Refresh the medians the app already showed, and flag any drift.
            for field, key in (("medianGPA", "gpa50"), ("medianLSAT", "lsat50")):
                new = adm[key]
                if new is not None and s.get(field) != new:
                    shifts.append((s["name"], field, s.get(field), new))
                    s[field] = new

    unexpected = [n for n, _ in missing_eq if n not in EXPECTED_MISSING]
    print(f"\nJoined {len(used_eq)}/{len(schools)} to employment outcomes.")
    for n, how in missing_eq:
        why = EXPECTED_MISSING.get(n, f"*** UNEXPECTED ({how}) ***")
        print(f"  no outcomes: {n} — {why}")
    for n in missing_fy:
        print(f"  no admissions: {n}")

    if fuzzy:
        print(f"\n{len(fuzzy)} matched by name inference — check these read correctly:")
        for ours, theirs in fuzzy:
            print(f"  {ours}  ->  {theirs}")

    if unexpected:
        raise SystemExit(f"\n{len(unexpected)} school(s) failed to join. Add them to "
                         f"ALIASES or EXPECTED_MISSING before writing.")

    if shifts:
        print(f"\n{len(shifts)} median(s) corrected against the official 509:")
        for name, field, old, new in shifts[:200]:
            print(f"  {name}: {field} {old} -> {new}")

    payload["_note"] = (
        payload["_note"].split(" Editable.")[0]
        + f" Admissions percentiles (25/50/75 GPA and LSAT, acceptance rate) and employment "
          f"outcomes (firm-size distribution, employer type, federal and state clerkships, "
          f"top three states of employment) are pulled directly from the ABA {args.year} "
          f"Standard 509 compilation reports, which describe the class of {args.year - 1}. "
          f"Regenerate with tools/fetch_aba.py. Editable."
    )

    if args.dry_run:
        print("\n--dry-run: nothing written.")
        return

    SCHOOLS_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"\nWrote {SCHOOLS_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
