#!/usr/bin/env python3
"""
Pull official ABA Standard 509 data and fold it into data/schools.json.

Every school figure the site shows comes from one source, the ABA's compilation
reports, fetched from its own backend (the same endpoints the disclosure site's UI
calls — public, no key, no auth):

  AnnualQuestionnaire/GetAllCompilationData        -> "First Year Class" admissions,
                                                      tuition, required credit hours
  EmploymentOutcomes/GenerateEQCompilationReport   -> employment outcomes
  BarPassageOutcomes/GenerateBarPassageCompilationReport -> first-time bar passage

Each category uses the newest report the ABA has actually published. Before a
release the backend serves an empty, zero-filled, or half-filled file (schools'
in-progress submissions: application counts with no percentiles, say), so a report
only counts once nearly every school has its headline figure. What
each report's year covers (verified against schools' own published figures):

  First Year Class, year Y  -> the class that entered in fall Y   (out mid-December)
  Tuition, year Y           -> the Y–Y+1 academic year             (out mid-December)
  Employment, year Y        -> the class of Y, ten months on       (out late April)
  Bar passage, year Y       -> graduates of Y-1, first attempt     (out in spring)

The data-driven write-ups are regenerated afterwards (tools/writeups.py), since
they quote these figures.

The ABA lists schools by parent institution ("Samford University"); this project
lists them by the name people actually use ("Cumberland School of Law"). ALIASES
below bridges the gap. The join is asserted 1:1 — if a school stops matching, the
script fails loudly rather than silently dropping outcomes for it.

Usage:  python3 tools/fetch_aba.py [--dry-run]

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

import writeups

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
    "Thomas M. Cooley Law School": "Cooley Law School",
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
    "SMU Dedman School of Law": "Southern Methodist University",
    "UNT Dallas College of Law": "North Texas at Dallas, University of",
    "BYU J. Reuben Clark Law School": "Brigham Young University",
    "Vermont Law and Graduate School": "Vermont Law School",
    "Mississippi Christian University School of Law": "Mississippi Christian University",
    "Wilmington University Farnan School of Law": "Wilmington University School of Law",
    "SIU Simmons Law School": "Southern Illinois University",
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
    "Wilmington University Farnan School of Law": "provisionally approved 2023; no graduating class yet",
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
    first = next(rows, None)
    if first is None:
        return []  # an unpublished report can come back as a blank sheet
    # The bar report heads its name column "School Name"; everything else says "SchoolName".
    header = [str(h).strip().replace("School Name", "SchoolName") if h is not None else ""
              for h in first]
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


def money(v):
    """'$12,345' -> 12345.0; blanks and 'N/A' -> 0."""
    v = num(str(v).replace("$", "").replace(",", "")) if v is not None else None
    return v or 0


def extract_tuition(r, credits_row):
    """Full-time tuition, (in-state, out-of-state).

    Schools that charge per credit report no annual figure; those are annualized at a
    third of the JD's required credit hours, rounded to $10. A private school leaves the
    non-resident column blank because there's only one price.
    """
    per_year = None
    m = re.match(r"\s*(\d+)", str((credits_row or {}).get("RequiredCreditHours") or ""))
    if m:
        per_year = int(m.group(1)) / 3

    def price(annual_key, credit_key):
        annual = money(r.get(annual_key))
        if annual:
            return int(annual)
        credit = money(r.get(credit_key))
        if credit and per_year:
            return int(round(credit * per_year, -1))
        return None

    res = price("FT_Resident_Annual", "FT_Resident_Credit")
    non = price("FT_NonResident_Annual", "FT_NonResident_Credit")
    return res, non or res


def extract_bar(r):
    pct = lambda k: num(str(r.get(k) or "").rstrip("%"))
    out = {
        "passRate": pct("AvgSchoolPassPercent*"),
        "statePassRate": pct("AvgStatePassPercent**"),
        "diff": pct("TotalDifferencePercent***"),
        "takers": int(num(r.get("Total First Time Takers")) or 0) or None,
    }
    return out if out["passRate"] is not None else None


def newest(fetcher, has_data, label, start):
    """The most recent year whose report actually has numbers in it."""
    for year in range(start, start - 3, -1):
        rows = sheet_rows(fetcher(year))
        if rows and has_data(rows):
            print(f"  {label}: {year} ({len(rows)} schools)")
            return year, rows
        print(f"  {label}: {year} not published yet")
    raise SystemExit(f"No {label} report with data in the last three years")


def join(schools, rows, label, expected_missing=()):
    """Match every school to exactly one ABA row. Fails loudly on gaps or double claims."""
    idx = build_index(rows, label)
    out, used, missing, fuzzy = {}, set(), [], []
    for s in schools:
        row, how = match(s["name"], idx)
        if row is None:
            if s["name"] not in expected_missing:
                missing.append(f"{s['name']} ({how})")
            continue
        if row["SchoolName"] in used:
            raise SystemExit(f"{label}: ABA record '{row['SchoolName']}' claimed by two schools — fix ALIASES")
        used.add(row["SchoolName"])
        if how == "fuzzy":
            fuzzy.append(f"{s['name']}  ->  {row['SchoolName']}")
        out[s["name"]] = row
    if missing:
        raise SystemExit(f"{label}: {len(missing)} school(s) failed to join — add them to ALIASES:\n  "
                         + "\n  ".join(missing))
    return out, fuzzy


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="report without writing")
    args = ap.parse_args()
    this_year = __import__("datetime").date.today().year

    section = lambda name: lambda y: fetch("AnnualQuestionnaire/GetAllCompilationData",
                                           {"year": y, "scetionName": name})
    # "Published" = at least 95% of schools have the figure. In-progress files are partial.
    nonzero = lambda key: lambda rows: sum(1 for r in rows if num(r.get(key))) >= 0.95 * len(rows)

    print("Finding the newest ABA reports…")
    fy_year, fy = newest(section("First Year Class"), nonzero("All50thPercentileLSAT"), "first-year class", this_year)
    tu_year, tu = newest(section("Tuitions and Fees/Living Expenses/Cond. Scholarships"),
                         lambda rows: sum(1 for r in rows if money(r.get("FT_Resident_Annual"))
                                          or money(r.get("FT_Resident_Credit"))) >= 0.95 * len(rows),
                         "tuition", this_year)
    cr = sheet_rows(section("The Basics/Academic Calendar")(tu_year))
    eq_year, eq = newest(lambda y: fetch("EmploymentOutcomes/GenerateEQCompilationReport", {"year": y}),
                         nonzero("Total_GraduatesTotal"), "employment", this_year)
    bar_year, bar = newest(lambda y: fetch("BarPassageOutcomes/GenerateBarPassageCompilationReport",
                                           {"year": y, "sectionName": "First Time Bar Admission"}),
                           nonzero("Total First Time Takers"), "bar passage", this_year)

    payload = json.loads(SCHOOLS_JSON.read_text())
    schools = payload["schools"]

    fy_rows, f1 = join(schools, fy, "first-year class")
    tu_rows, f2 = join(schools, tu, "tuition")
    cr_rows, _ = join(schools, cr, "credit hours")
    eq_rows, f3 = join(schools, eq, "employment", EXPECTED_MISSING)
    bar_rows, f4 = join(schools, bar, "bar passage", EXPECTED_MISSING)
    fuzzy = sorted(set(f1 + f2 + f3 + f4))
    if fuzzy:
        print(f"\n{len(fuzzy)} matched by name inference — check these read correctly:")
        for f in fuzzy:
            print("  " + f)

    changes = []
    def put(s, field, new):
        if new is not None and s.get(field) != new:
            changes.append(f"{s['name']}: {field} {s.get(field)} -> {new}")
            s[field] = new

    for s in schools:
        adm = extract_admissions(fy_rows[s["name"]])
        put(s, "admissions", adm)
        put(s, "medianGPA", adm["gpa50"])
        put(s, "medianLSAT", adm["lsat50"])
        res, non = extract_tuition(tu_rows[s["name"]], cr_rows.get(s["name"]))
        put(s, "tuitionInState", res)
        put(s, "tuitionOutState", non)
        if s["name"] in eq_rows:
            outcomes, top = extract_outcomes(eq_rows[s["name"]])
            if outcomes:
                put(s, "outcomes", outcomes)
                put(s, "topStates", top)
        if s["name"] in bar_rows:
            put(s, "bar", extract_bar(bar_rows[s["name"]]))
        if s.get("writeupAuto"):
            put(s, "writeup", writeups.generate(s))

    print(f"\n{len(changes)} field(s) changed:")
    for c in changes:
        print("  " + (c if len(c) < 240 else c[:237] + "…"))

    # Merge, don't replace: "rank" is set by hand from US News, not by this script.
    payload.setdefault("_vintage", {}).update({
        "admissions": f"Fall {fy_year} entering class",
        "tuition": f"{tu_year}–{str(tu_year + 1)[-2:]} academic year",
        "outcomes": f"Class of {eq_year}",
        "bar": f"Class of {bar_year - 1}, first attempt",
        "source": "ABA Standard 509 compilation reports, via tools/fetch_aba.py",
    })
    print("\nVintage:", json.dumps(payload["_vintage"], indent=2))

    if args.dry_run:
        print("\n--dry-run: nothing written.")
        return
    SCHOOLS_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"\nWrote {SCHOOLS_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
