"use strict";
(function () {
  const LS_KEY = "lawSchoolShortlist";
  const PROFILE_KEY = "lawSchoolProfile";
  const UI_KEY = "lawSchoolUI";

  const app = document.getElementById("app");
  const cursorTag = document.getElementById("cursorTag");
  const CAN_HOVER = window.matchMedia("(hover: hover)").matches;

  let DATA = { geo: null };
  let stateByName = {};        // name -> state record
  let schoolsByState = {};     // state name -> [schools]
  let schoolByName = {};       // school name -> school
  let cityByKey = {};          // "city|state" -> city lifestyle record
  let saved = loadSaved();

  // ---------- persistence ----------
  function loadSaved() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(saved)); } catch (e) {}
    document.getElementById("listCount").textContent = saved.length;
  }
  function isSaved(name) { return saved.indexOf(name) !== -1; }
  function toggleSaved(name) {
    const i = saved.indexOf(name);
    if (i === -1) saved.push(name); else saved.splice(i, 1);
    persist();
  }

  // Small bag of view preferences — which map layer you were on, whether the fit
  // panel was open. Never worth an error if storage is unavailable.
  let ui = { mapMode: "overall", dockOpen: null };
  function loadUI() {
    try {
      const raw = localStorage.getItem(UI_KEY);
      if (raw) ui = Object.assign(ui, JSON.parse(raw));
    } catch (e) {}
  }
  function persistUI() {
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) {}
  }

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("en-US"));
  const kMoney = (n) => (n == null ? "—" : "$" + Math.round(n / 1000) + "k");
  const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");
  const median = (arr) => {
    const v = arr.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  // Percentile rank of `v` within a sorted array, ties shared at the midpoint.
  function pctIn(sortedVals, v) {
    const n = sortedVals.length;
    if (n < 2) return 1;
    let below = 0, equal = 0;
    for (const x of sortedVals) { if (x < v) below++; else if (x === v) equal++; }
    return (below + (equal - 1) / 2) / (n - 1);
  }

  function tierClass(tier) {
    if (tier === "T14") return "tier-1";
    if (tier === "T20") return "tier-2";
    if (tier === "T30") return "tier-3";
    if (tier === "T50") return "tier-4";
    if (tier === "Regional") return "tier-6";
    return "tier-5"; // T60/T70/T80/T90/T100
  }
  function tierBadge(tier) {
    return `<span class="tier ${tierClass(tier)}">${esc(tier || "—")}</span>`;
  }
  function tierRank(t) {
    const order = ["T14", "T20", "T30", "T50", "T60", "T70", "T80", "T90", "T100", "Regional"];
    const i = order.indexOf(t);
    return i === -1 ? 999 : i;
  }
  function sortSchools(list) {
    return list.slice().sort((a, b) => {
      const ar = a.rank == null ? Infinity : a.rank;
      const br = b.rank == null ? Infinity : b.rank;
      if (ar !== br) return ar - br;
      const at = tierRank(a.tier), bt = tierRank(b.tier);
      if (at !== bt) return at - bt;
      return a.name.localeCompare(b.name);
    });
  }

  // ---------- profile + fit scoring ----------
  // Career goals map onto the ABA employment-outcome fields pulled by
  // tools/fetch_aba.py. Every one is a real reported percentage of graduates,
  // so a goal that a school is genuinely bad at will sink it.
  const GOALS = [
    { key: "bigLaw",         label: "BigLaw",              field: "bigLaw",         blurb: "firms of 500+" },
    { key: "federalClerk",   label: "Federal clerkship",   field: "federalClerk",   blurb: "federal clerkships" },
    { key: "government",     label: "Government",          field: "government",     blurb: "government" },
    { key: "publicInterest", label: "Public interest",     field: "publicInterest", blurb: "public interest" },
    { key: "business",       label: "In-house / business", field: "business",       blurb: "business & industry" },
    { key: "smallFirm",      label: "Small firm",          field: "smallFirm",      blurb: "firms of 100 or fewer" },
    { key: "academia",       label: "Academia",            field: "academia",       blurb: "education" },
  ];

  const FACTORS = [
    { key: "affordability", label: "Affordability" },
    { key: "qualityOfLife", label: "Quality of life" },
    { key: "lifestyle",     label: "City lifestyle" },
    { key: "legalIndustry", label: "Legal market" },
  ];

  const REGIONS = {
    "Northeast": ["Connecticut", "Maine", "Massachusetts", "New Hampshire", "New Jersey", "New York", "Pennsylvania", "Rhode Island", "Vermont"],
    "Mid-Atlantic": ["Delaware", "District of Columbia", "Maryland", "Virginia", "West Virginia"],
    "South": ["Alabama", "Arkansas", "Florida", "Georgia", "Kentucky", "Louisiana", "Mississippi", "North Carolina", "South Carolina", "Tennessee"],
    "Midwest": ["Illinois", "Indiana", "Iowa", "Kansas", "Michigan", "Minnesota", "Missouri", "Nebraska", "North Dakota", "Ohio", "South Dakota", "Wisconsin"],
    "Southwest": ["Arizona", "Nevada", "New Mexico", "Oklahoma", "Texas"],
    "Mountain": ["Colorado", "Idaho", "Montana", "Utah", "Wyoming"],
    "West Coast": ["Alaska", "California", "Hawaii", "Oregon", "Washington"],
  };

  const blankProfile = () => ({
    gpa: null, lsat: null, goals: {}, states: [], residency: "",
    factors: { affordability: 0, qualityOfLife: 0, lifestyle: 0, legalIndustry: 0 },
    maxTuition: null,
  });
  let profile = blankProfile();

  function loadProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return blankProfile();
      const p = Object.assign(blankProfile(), JSON.parse(raw));
      p.goals = p.goals || {};
      p.states = Array.isArray(p.states) ? p.states : [];
      p.factors = Object.assign(blankProfile().factors, p.factors || {});
      return p;
    } catch (e) { return blankProfile(); }
  }
  function persistProfile() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) {}
  }
  // A profile only does useful work once it has scores or preferences to act on.
  function profileReady() {
    return profile.gpa != null && profile.lsat != null;
  }
  function hasPreferences() {
    return Object.values(profile.goals).some((w) => w > 0)
      || profile.states.length > 0
      || Object.values(profile.factors).some((w) => w > 0);
  }

  // Percentile rank of every school on every outcome field, computed once.
  // Percentiles rather than raw percentages, because 12% federal clerkships is
  // extraordinary while 12% BigLaw is unremarkable — raw numbers aren't comparable.
  const pctRank = {};
  function buildPercentiles() {
    const fields = GOALS.map((g) => g.field).concat(["employmentRate"]);
    const all = Object.values(schoolByName).filter((s) => s.outcomes);
    fields.forEach((f) => {
      const vals = all.map((s) => s.outcomes[f]).filter((v) => v != null).sort((a, b) => a - b);
      const table = {};
      all.forEach((s) => {
        const v = s.outcomes[f];
        if (v == null) return;
        table[s.name] = pctIn(vals, v);
      });
      pctRank[f] = table;
    });
  }
  const rankOf = (school, field) => {
    const t = pctRank[field];
    const v = t ? t[school.name] : undefined;
    return v == null ? null : v;
  };
  // Say "top 4%" only when it's genuinely top-decile; otherwise give the plain
  // percentile. "Top 75%" would read as praise for a bottom-quartile number.
  function pctLabel(r) {
    if (r == null) return "";
    if (r >= 0.9) return "top " + Math.max(1, Math.round((1 - r) * 100)) + "%";
    const n = Math.round(r * 100);
    const suffix = n % 10 === 1 && n % 100 !== 11 ? "st"
      : n % 10 === 2 && n % 100 !== 12 ? "nd"
      : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th";
    return n + suffix + " pct";
  }
  const ordinal = (n) => {
    const s = n % 10, h = n % 100;
    return n + (s === 1 && h !== 11 ? "st" : s === 2 && h !== 12 ? "nd" : s === 3 && h !== 13 ? "rd" : "th");
  };

  // Where an applicant sits in a school's own admitted-student distribution.
  // -1 = their 25th percentile, 0 = median, +1 = their 75th. Linear between the
  // reported points, extrapolated (at half slope) beyond them.
  function position(value, p25, p50, p75) {
    if (value == null || p25 == null || p50 == null || p75 == null) return null;
    if (value >= p50) {
      const span = p75 - p50;
      if (span <= 0) return value > p50 ? 1 : 0;
      const t = (value - p50) / span;
      return t <= 1 ? t : 1 + (t - 1) * 0.5;
    }
    const span = p50 - p25;
    if (span <= 0) return value < p50 ? -1 : 0;
    const t = (p50 - value) / span;
    return t <= 1 ? -t : -1 - (t - 1) * 0.5;
  }

  // LSAT carries more weight than GPA because that is how admissions committees
  // actually behave — it's the number that moves a school's reported medians most.
  const LSAT_WEIGHT = 0.6, GPA_WEIGHT = 0.4;

  // ---------- admit / waitlist / deny odds ----------
  //
  // An ordered logit. Every applicant gets a latent "review score" from their
  // numbers alone; two thresholds cut it into admit, waitlist and deny, so the
  // three always sum to 1 and admit rises monotonically with both numbers.
  //
  // Nothing here is FIT to admission results — this repo has no individual
  // outcome data, and none is public. The curve is CONSTRAINED by three figures
  // each school actually reports, and everything else is a stated assumption:
  //
  //   acceptance rate  -> where the curve sits. An applicant at a school's own
  //                       medians lands at acceptanceRate^anchorExp, minus a
  //                       penalty at the very selective end, where the decision
  //                       stops being about numbers at all.
  //   25th-75th spread -> how steep it is. A school with a tight band has a
  //                       sharper cliff than one that admits across a wide range.
  //   yield            -> a small correction. The reported percentiles describe
  //                       ENROLLED students, not admitted ones. A school that
  //                       loses most of its admits to better offers had an
  //                       admitted class stronger than the class it enrolled.
  //
  // Tune any of it here; the whole model is these ten numbers.
  const ODDS = {
    iqrToSd: 1.349,          // IQR -> SD, assuming roughly normal within the band
    lsatSdFloor: 1.0,        // guards schools reporting a degenerate spread
    gpaSdFloor: 0.04,
    anchorExp: 0.35,         // at-medians admit chance = acceptanceRate ^ this
    holisticPenalty: 1.4,    // extra logits off the anchor as selectivity rises
    slope: 2.0,              // logits per SD of index
    slopeFlatten: 0.35,      // how much flatter that curve runs at the top end
    holisticCeiling: 0.45,   // numbers alone can't take you past this at the top
    refYield: 0.45,          // yield below this implies a stronger admitted class
    yieldShift: 0.6,         // SDs of anchor shift per unit of yield shortfall
    wlBase: 0.55,            // waitlist band width, in logits, at an open school
    wlSelective: 1.5,        // how much wider that band runs at a selective one
    splitterGap: 1.6,        // SDs between LSAT and GPA before we flag a splitter
  };
  const logit = (p) => Math.log(p / (1 - p));
  const sigmoid = (x) => 1 / (1 + Math.exp(-x));
  const softplus = (u) => (u > 30 ? u : Math.log1p(Math.exp(u)));
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function sdFrom(p25, p75, floor) {
    if (p25 == null || p75 == null) return null;
    return Math.max((p75 - p25) / ODDS.iqrToSd, floor);
  }

  function admitOdds(school) {
    const a = school.admissions;
    if (!a || !profileReady()) return null;
    const acc = a.acceptanceRate;
    if (acc == null || acc <= 0 || acc >= 100) return null;

    // Position in the school's own units: SDs above or below its median.
    const sdL = sdFrom(a.lsat25, a.lsat75, ODDS.lsatSdFloor);
    const sdG = sdFrom(a.gpa25, a.gpa75, ODDS.gpaSdFloor);
    const zL = sdL != null && a.lsat50 != null ? (profile.lsat - a.lsat50) / sdL : null;
    const zG = sdG != null && a.gpa50 != null ? (profile.gpa - a.gpa50) / sdG : null;
    if (zL == null && zG == null) return null;
    const z = zL == null ? zG : zG == null ? zL
      : LSAT_WEIGHT * zL + GPA_WEIGHT * zG;

    // Everything below scales with how selective the school is; 20% acceptance
    // is where the "your numbers are enough" assumption starts breaking down.
    const sel = clamp01((20 - acc) / 20);

    const yieldRate = a.offers && a.enrolled ? a.enrolled / a.offers : null;
    const shift = yieldRate == null ? 0
      : ODDS.yieldShift * Math.max(0, ODDS.refYield - yieldRate);

    const anchor = logit(Math.pow(acc / 100, ODDS.anchorExp))
      - ODDS.holisticPenalty * sel * sel;
    const slope = ODDS.slope * (1 - ODDS.slopeFlatten * sel);
    const raw = anchor + slope * (z - shift);

    // A soft ceiling, approached but never crossed. At a school admitting 4% of
    // applicants there is no LSAT that makes you a favourite, and a model built
    // only on numbers should say so rather than run to 99%.
    const ceiling = logit(1 - ODDS.holisticCeiling * sel - 0.02);
    const latent = ceiling - softplus(ceiling - raw);

    // Second threshold, w above the first: the waitlist band. Selective schools
    // waitlist far more of the people they don't outright admit.
    const w = ODDS.wlBase + ODDS.wlSelective * sel;
    const pAdmit = sigmoid(latent);
    const pOrWait = sigmoid(latent + w);

    return {
      z, pAdmit, pWait: pOrWait - pAdmit, pDeny: 1 - pOrWait,
      // A big gap between the two numbers is exactly where a single blended
      // index is least trustworthy — schools treat splitters very differently.
      splitter: zL != null && zG != null && Math.abs(zL - zG) >= ODDS.splitterGap,
    };
  }

  // Band cuts, in admit probability. The label is just a plain-English name for
  // the number next to it, so the two can't disagree.
  const BAND_CUTS = [0.70, 0.35, 0.12];
  const bandOf = (p) =>
    p >= BAND_CUTS[0] ? 0 : p >= BAND_CUTS[1] ? 1 : p >= BAND_CUTS[2] ? 2 : 3;

  function admissionRead(school) {
    const a = school.admissions;
    if (!a || !profileReady()) return null;
    const odds = admitOdds(school);
    if (!odds) return null;

    // Kept for the range readouts: where the numbers sit between the reported
    // 25th and 75th, which is a different question from what the odds are.
    const lp = position(profile.lsat, a.lsat25, a.lsat50, a.lsat75);
    const gp = position(profile.gpa, a.gpa25, a.gpa50, a.gpa75);

    const band = bandOf(odds.pAdmit);
    return {
      band, odds,
      lsatPos: lp, gpaPos: gp,
      label: ["Safety", "Target", "Reach", "Far reach"][band],
      cls: ["band-safety", "band-target", "band-reach", "band-far"][band],
    };
  }

  // Round the three shares to whole numbers that still add to 100 — largest
  // remainder, so a displayed split never reads 33/33/33 and leaves a point over.
  function splitPct(odds) {
    const raw = [odds.pAdmit * 100, odds.pWait * 100, odds.pDeny * 100];
    const out = raw.map(Math.floor);
    let left = 100 - out.reduce((a, b) => a + b, 0);
    raw.map((v, i) => [v - out[i], i])
      .sort((a, b) => b[0] - a[0])
      .forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
    return { admit: out[0], wait: out[1], deny: out[2] };
  }

  function careerFit(school) {
    if (!school.outcomes) return null;
    const active = GOALS.filter((g) => (profile.goals[g.key] || 0) > 0);
    const employ = rankOf(school, "employmentRate");
    if (!active.length) return employ;   // no stated goal — fall back to placement

    let sum = 0, wsum = 0;
    active.forEach((g) => {
      const r = rankOf(school, g.field);
      if (r == null) return;
      const w = profile.goals[g.key];
      sum += w * r; wsum += w;
    });
    if (!wsum) return employ;
    const goalPart = sum / wsum;
    // Placement always counts for something: a school can be strong on your goal
    // and still be one you shouldn't go to.
    return employ == null ? goalPart : 0.8 * goalPart + 0.2 * employ;
  }

  // Credit for schools that FEED a target market, not just schools sitting in one.
  function geoFit(school) {
    if (!profile.states.length) return null;
    if (profile.states.indexOf(school.state) !== -1) return 1;
    let best = 0;
    (school.topStates || []).forEach((t) => {
      if (profile.states.indexOf(t.state) === -1) return;
      best = Math.max(best, Math.min(1, (t.pct || 0) / 50) * 0.85);
    });
    return best;
  }

  function factorFit(school) {
    const st = stateByName[school.state];
    const city = cityByKey[school.city + "|" + school.state];
    let sum = 0, wsum = 0;
    const add = (w, val) => { if (w > 0 && val != null) { sum += w * (val / 5); wsum += w; } };
    if (st) {
      add(profile.factors.affordability, st.affordability && st.affordability.score);
      add(profile.factors.qualityOfLife, st.qualityOfLife && st.qualityOfLife.score);
      add(profile.factors.legalIndustry, st.legalIndustry && st.legalIndustry.score);
    }
    add(profile.factors.lifestyle, city && city.lifestyleScore);
    return wsum ? sum / wsum : null;
  }

  function locationFit(school) {
    const geo = geoFit(school), fac = factorFit(school);
    // Naming a state is an explicit, high-confidence preference; the sliders are
    // soft. So geography carries most of the weight when both are present.
    if (geo != null && fac != null) return 0.7 * geo + 0.3 * fac;
    if (geo != null) return geo;
    if (fac != null) return fac;
    return null;
  }

  function tuitionFor(school) {
    return profile.residency && profile.residency === school.state
      ? school.tuitionInState : school.tuitionOutState;
  }

  // One line explaining why a school placed where it did — the strongest real
  // signals behind its score, so a high rank for a reason you don't care about
  // is visible rather than hidden.
  function whyLine(school) {
    const bits = [];
    const active = GOALS.filter((g) => (profile.goals[g.key] || 0) > 0);
    active
      .map((g) => ({ g, r: rankOf(school, g.field), v: school.outcomes && school.outcomes[g.field] }))
      .filter((x) => x.r != null && x.v != null)
      .sort((a, b) => b.r - a.r)
      .slice(0, 2)
      .forEach((x) => bits.push(`<b>${x.v}%</b> ${x.g.blurb} <span class="dim">(${pctLabel(x.r)})</span>`));

    if (profile.states.length) {
      if (profile.states.indexOf(school.state) !== -1) {
        bits.push(`in ${esc(school.state)}`);
      } else {
        const feed = (school.topStates || [])
          .filter((t) => profile.states.indexOf(t.state) !== -1)
          .sort((a, b) => b.n - a.n)[0];
        if (feed) bits.push(`<b>${feed.pct}%</b> of grads go to ${esc(feed.state)}`);
      }
    }
    if (!active.length && school.outcomes && school.outcomes.employmentRate != null) {
      bits.push(`<b>${school.outcomes.employmentRate}%</b> employed in FT long-term JD jobs`);
    }
    const t = tuitionFor(school);
    if (t != null) bits.push(money(t) + "/yr");
    return bits.join(" · ");
  }

  function scoreAll() {
    const out = [];
    Object.values(schoolByName).forEach((s) => {
      const adm = admissionRead(s);
      if (!adm) return;                                   // no admissions data, can't place it
      const t = tuitionFor(s);
      if (profile.maxTuition != null && t != null && t > profile.maxTuition) return;

      const career = careerFit(s);
      const location = locationFit(s);
      // Rank within a band on preferences only. Admission odds decide WHICH band,
      // so folding them into the score too would double-count them.
      const parts = [];
      if (career != null) parts.push([0.55, career]);
      if (location != null) parts.push([0.45, location]);
      const wsum = parts.reduce((a, p) => a + p[0], 0);
      const fit = wsum ? parts.reduce((a, p) => a + p[0] * p[1], 0) / wsum : 0.5;

      out.push({ school: s, adm, career, location, fit });
    });
    out.sort((a, b) => b.fit - a.fit || a.school.name.localeCompare(b.school.name));
    return out;
  }

  // ---------- state insights ----------
  // Ten measures per jurisdiction, each percentile-ranked against the other 50.
  // The rail shows only the ones where a state genuinely stands apart, with the
  // raw figure attached — a strength you can't see the number behind is a vibe.
  const INSIGHT_METRICS = [
    {
      key: "market", label: "Legal market", good: "high",
      value: (st) => st.legalIndustry && st.legalIndustry.lawyerJobsPer1k,
      fmt: (v) => v.toFixed(1) + " lawyer jobs per 1,000",
    },
    {
      key: "pay", label: "Legal pay", good: "high",
      value: (st) => st.legalIndustry && st.legalIndustry.avgLegalSalary,
      fmt: (v) => kMoney(v) + " average salary",
    },
    {
      key: "cost", label: "Cost of living", good: "low",
      value: (st) => st.affordability && st.affordability.costOfLivingIndex,
      fmt: (v) => "index " + v.toFixed(0) + ", against a US average of 100",
    },
    {
      key: "qol", label: "Quality of life", good: "high",
      value: (st) => st.qualityOfLife && st.qualityOfLife.score,
      fmt: (v) => v.toFixed(1) + "/5 across safety, health and climate",
    },
    {
      key: "choice", label: "Choice of school", good: "high",
      value: (st, list) => (list.length ? list.length : null),
      fmt: (v) => plural(v, "ABA-accredited school"),
    },
    {
      key: "elite", label: "Top of the market", good: "low",
      value: (st, list, ctx) => (ctx.best ? ctx.best.rank : null),
      fmt: (v, ctx) => "#" + v + " — " + ctx.best.name,
    },
    {
      key: "tuition", label: "Tuition", good: "low",
      value: (st, list) => median(list.map((s) => s.tuitionOutState)),
      fmt: (v) => kMoney(v) + " median, out-of-state",
    },
    {
      key: "jobs", label: "Employment at graduation", good: "high",
      value: (st, list) => median(list.map((s) => s.outcomes && s.outcomes.employmentRate)),
      fmt: (v) => v.toFixed(0) + "% median in FT long-term JD jobs",
    },
    {
      key: "biglaw", label: "BigLaw access", good: "high",
      value: (st, list, ctx) => (ctx.bigSchool ? ctx.bigSchool.outcomes.bigLaw : null),
      fmt: (v, ctx) => v + "% at " + ctx.bigSchool.name + ", the state's best route in",
    },
    {
      key: "stay", label: "Graduates stay local", good: "high",
      value: (st, list, ctx) => median(list.map((s) => {
        const hit = (s.topStates || []).find((t) => t.state === ctx.state);
        return hit ? hit.pct : null;
      })),
      fmt: (v) => v.toFixed(0) + "% of a typical class stays in state",
    },
  ];

  let INSIGHTS = {};
  function buildInsights() {
    const names = Object.keys(stateByName);
    const ctxByState = {};
    const raw = {};

    names.forEach((name) => {
      const st = stateByName[name];
      const list = schoolsByState[name] || [];
      const ranked = list.filter((s) => s.rank != null).sort((a, b) => a.rank - b.rank);
      const big = list.filter((s) => s.outcomes && s.outcomes.bigLaw != null)
        .sort((a, b) => b.outcomes.bigLaw - a.outcomes.bigLaw);
      const ctx = { state: name, list, best: ranked[0] || null, bigSchool: big[0] || null };
      ctxByState[name] = ctx;

      INSIGHT_METRICS.forEach((m) => {
        const v = m.value(st, list, ctx);
        if (v != null && isFinite(v)) (raw[m.key] = raw[m.key] || {})[name] = v;
      });
    });

    const ranked = {};
    INSIGHT_METRICS.forEach((m) => {
      const table = raw[m.key] || {};
      const keys = Object.keys(table);
      const vals = keys.map((k) => table[k]).sort((a, b) => a - b);
      const out = {};
      keys.forEach((k) => {
        let p = pctIn(vals, table[k]);
        if (m.good === "low") p = 1 - p;         // low is good: invert so high pct always means "strong"
        out[k] = {
          pct: p, value: table[k], of: vals.length,
          place: vals.length < 2 ? 1 : Math.round((1 - p) * (vals.length - 1)) + 1,
        };
      });
      ranked[m.key] = out;
    });

    INSIGHTS = {};
    names.forEach((name) => {
      const rows = [];
      INSIGHT_METRICS.forEach((m) => {
        const e = ranked[m.key][name];
        if (!e) return;
        rows.push({
          label: m.label, pct: e.pct, place: e.place, of: e.of,
          detail: m.fmt(e.value, ctxByState[name]),
        });
      });
      INSIGHTS[name] = {
        strengths: rows.filter((r) => r.pct >= 0.62).sort((a, b) => b.pct - a.pct).slice(0, 3),
        weaknesses: rows.filter((r) => r.pct <= 0.38).sort((a, b) => a.pct - b.pct).slice(0, 3),
      };
    });
  }

  // ---------- colour ramp + map layers --------------------------------------
  // pale -> mid -> deep as the active measure rises. Multi-stop so the lightness
  // range is far wider than a single linear 2-stop blend.
  const RAMP_STOPS = [
    [0.0, [237, 245, 246]], // very pale tint
    [0.5, [74, 127, 138]],  // mid teal
    [1.0, [15, 51, 58]],    // deep saturated teal
  ];
  function rampColor(t) {
    t = Math.max(0, Math.min(1, t));
    let i = 0;
    while (i < RAMP_STOPS.length - 2 && t > RAMP_STOPS[i + 1][0]) i++;
    const [t0, c0] = RAMP_STOPS[i], [t1, c1] = RAMP_STOPS[i + 1];
    const f = (t - t0) / (t1 - t0 || 1);
    const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  // With a profile set, the map answers "where should I be looking?" rather than
  // "which states score well in general". A state is worth what its best school
  // is worth to you, ranked against the other states the same way.
  let stateFit = null;      // state name -> 0..1, or null when there's no profile
  let bestByState = {};     // state name -> the result behind that number
  function buildStateFit(results) {
    bestByState = {};
    if (!results || !results.length) { stateFit = null; return; }
    results.forEach((r) => {
      const cur = bestByState[r.school.state];
      if (!cur || r.fit > cur.fit) bestByState[r.school.state] = r;
    });
    const vals = Object.values(bestByState).map((r) => r.fit).sort((a, b) => a - b);
    const table = {};
    Object.keys(bestByState).forEach((k) => { table[k] = pctIn(vals, bestByState[k].fit); });
    stateFit = table;
  }

  // How far your two numbers alone reach into each state, measured at its
  // flagship — the highest-ranked school there.
  //
  // The obvious metric, "best odds anywhere in the state", is useless: almost
  // every state has some school that admits broadly, so a strong applicant sees
  // 98% nearly everywhere and the map goes flat (8 distinct values across 51
  // jurisdictions at GPA 3.2 / LSAT 174). Measured at the flagship the same
  // applicant gets 25, and it stays informative for weaker profiles too.
  let reachByState = {};
  function buildStateReach() {
    reachByState = {};
    if (!profileReady()) return;
    Object.keys(schoolsByState).forEach((st) => {
      const flagship = schoolsByState[st].slice().sort((a, b) => {
        const ar = a.rank == null ? Infinity : a.rank;
        const br = b.rank == null ? Infinity : b.rank;
        return ar - br || (b.medianLSAT || 0) - (a.medianLSAT || 0);
      })[0];
      const o = flagship && admitOdds(flagship);
      if (o) reachByState[st] = { p: o.pAdmit, school: flagship };
    });
  }

  const MAP_MODES = [
    {
      key: "overall", label: "Overall",
      value: (n, st) => st.overall,
      fmt: (v) => v.toFixed(2) + "/5",
      legend: (n) => `Colour ranks each state's blend of affordability, quality of life and legal market against all ${n} jurisdictions.`,
    },
    {
      key: "reach", label: "Your reach", needs: "numbers",
      value: (n) => (reachByState[n] ? reachByState[n].p : null),
      fmt: (v) => Math.round(v * 100) + "% at the flagship",
      legend: () => `Darker means a better modelled chance at that state's highest-ranked school, on your two numbers alone. Measured at the flagship rather than at the easiest school in the state, which nearly everyone gets into.`,
    },
    {
      key: "fit", label: "Your fit", needs: "prefs",
      value: (n) => (stateFit ? stateFit[n] : null),
      fmt: (v) => ordinal(Math.max(1, Math.round(v * 100))) + " pct",
      legend: () => `Colour shows how the best-fitting school in each state ranks for your profile. Pale states have nothing that matched.`,
    },
    {
      key: "cost", label: "Affordability",
      value: (n, st) => st.affordability && st.affordability.score,
      fmt: (v) => v.toFixed(1) + "/5",
      legend: () => `Darker is cheaper to live in — the C2ER cost-of-living and housing indices, inverted.`,
    },
    {
      key: "market", label: "Legal market",
      value: (n, st) => st.legalIndustry && st.legalIndustry.score,
      fmt: (v) => v.toFixed(1) + "/5",
      legend: () => `Darker means more lawyer jobs per 1,000 and higher average legal pay (BLS OES, May 2025).`,
    },
    {
      key: "schools", label: "Schools",
      value: (n) => (schoolsByState[n] || []).length,
      fmt: (v) => plural(v, "school"),
      legend: () => `Darker means more ABA-accredited law schools inside the state.`,
    },
  ];
  const activeMode = () => MAP_MODES.find((m) => m.key === ui.mapMode) || MAP_MODES[0];
  // A layer is locked until the profile carries what it needs to mean anything.
  const modeLocked = (m) =>
    (m.needs === "numbers" && !profileReady()) || (m.needs === "prefs" && !stateFit);
  const lockReason = (m) => m.needs === "prefs"
    ? "Name a career goal or a target state to unlock"
    : "Enter a GPA and LSAT to unlock";

  let colorByState = {};
  let valueByState = {};
  function buildColorTable() {
    const mode = activeMode();
    valueByState = {};
    Object.keys(stateByName).forEach((n) => {
      const v = mode.value(n, stateByName[n]);
      if (v != null && isFinite(v)) valueByState[n] = v;
    });
    const vals = Object.values(valueByState).sort((a, b) => a - b);
    colorByState = {};
    Object.keys(stateByName).forEach((n) => {
      const v = valueByState[n];
      // Floor at 0.22 so even the weakest state still reads as teal rather than
      // white — white is reserved for "no data on this layer".
      colorByState[n] = v == null ? rampColor(0) : rampColor(0.22 + 0.78 * pctIn(vals, v));
    });
  }

  // ---------- projection + map build ----------
  function buildMapSVG() {
    const geo = DATA.geo;
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const name in geo) {
      for (const ring of geo[name]) {
        for (const p of ring) {
          if (p[0] < minLon) minLon = p[0];
          if (p[0] > maxLon) maxLon = p[0];
          if (p[1] < minLat) minLat = p[1];
          if (p[1] > maxLat) maxLat = p[1];
        }
      }
    }
    const midLat = (minLat + maxLat) / 2;
    const kx = Math.cos(midLat * Math.PI / 180); // x correction
    const VBW = 960, VBH = 600, PAD = 24;

    const rawW = (maxLon - minLon) * kx;
    const rawH = (maxLat - minLat);
    const scale = Math.min((VBW - 2 * PAD) / rawW, (VBH - 2 * PAD) / rawH);
    const drawW = rawW * scale, drawH = rawH * scale;
    const offX = (VBW - drawW) / 2;
    const offY = (VBH - drawH) / 2;

    const project = (lon, lat) => [
      offX + (lon - minLon) * kx * scale,
      offY + (maxLat - lat) * scale,   // flip: north up
    ];

    let paths = "", overlays = "";
    const liveNames = new Set(Object.keys(stateByName));
    for (const name in geo) {
      let d = "", sx = 0, sy = 0, n = 0;
      for (const ring of geo[name]) {
        if (!ring.length) continue;
        d += ring.map((p, i) => {
          const [x, y] = project(p[0], p[1]);
          sx += x; sy += y; n++;
          return (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
        }).join(" ") + " Z ";
      }
      if (!liveNames.has(name)) { paths += `<path class="dead" d="${d.trim()}"></path>`; continue; }

      paths += `<path class="live" data-state="${esc(name)}" tabindex="0" role="button"` +
        ` aria-label="${esc(name)}" fill="${colorByState[name]}" d="${d.trim()}"></path>`;

      // DC renders a couple of pixels wide — unhittable. Give it a labelled
      // callout dot out over the Atlantic, wired to the same handlers.
      if (name === "District of Columbia" && n) {
        const cx = sx / n, cy = sy / n, tx = cx + 46, ty = cy + 26;
        overlays +=
          `<line class="callout-line" x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}"></line>` +
          `<g class="callout" data-state="${esc(name)}" tabindex="0" role="button" aria-label="District of Columbia">` +
          `<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="11" fill="${colorByState[name]}"></circle>` +
          `<text x="${tx.toFixed(1)}" y="${(ty + 3.6).toFixed(1)}">DC</text></g>`;
      }
    }
    return `<svg class="usmap" viewBox="0 0 ${VBW} ${VBH}" role="img" aria-label="US map of states scored for law school fit">${paths}${overlays}</svg>`;
  }

  // ---------- views + history ----------
  // The map wants the full 1240px; a list of rows read at that width leaves a
  // dead gap down the middle, so every other view gets a narrower column.
  function setView(html, wide) {
    app.innerHTML = `<div class="view${wide ? "" : " reading"}">${html}</div>`;
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  // A view is a plain descriptor: { kind, name, fit }. `fit: true` means it was
  // reached from the fit results, which is what lets its breadcrumb link back
  // there instead of stranding you at the map. Descriptors go into
  // history.pushState (state only, no URL — this page is often opened from a
  // plain local server or file path), so the browser Back button works too.
  let currentView = null;
  // Only the results list remembers its scroll offset. You bounce in and out of
  // it while opening schools, and losing your place there is the whole problem.
  let resultsScroll = 0;

  const RENDERERS = {
    map: () => renderHome(),
    results: () => renderResults(),
    state: (v) => renderState(v.name),
    school: (v) => renderSchool(v.name),
  };

  function go(view, replace) {
    const y = window.scrollY;
    if (currentView && currentView.kind === "results") resultsScroll = y;
    currentView = view;
    history[replace ? "replaceState" : "pushState"](view, "");
    RENDERERS[view.kind](view);
    if (replace) window.scrollTo({ top: y, behavior: "auto" });
  }

  window.addEventListener("popstate", (e) => {
    if (currentView && currentView.kind === "results") resultsScroll = window.scrollY;
    const view = e.state && RENDERERS[e.state.kind] ? e.state : { kind: "map" };
    currentView = view;
    RENDERERS[view.kind](view);
  });

  // Re-render the current view in place so ✓ flags stay accurate. Home is
  // skipped: it carries no per-school flags, and rebuilding it would blow away
  // whatever is half-typed into the fit panel.
  function rerender() {
    if (!currentView || currentView.kind === "map") return;
    go(currentView, true);
  }

  // Does the view you're on still have a live path back to the fit results?
  // Anything opened from here inherits it, so the trail survives sideways hops.
  const fitOrigin = (v) => !!v && (v.kind === "results" || !!v.fit);

  let crumbLinks = [];
  function crumbHTML(view, current) {
    crumbLinks = [{ label: "Map", view: { kind: "map" } }];
    if (view.fit) crumbLinks.push({ label: "Your fit", view: { kind: "results" } });
    if (view.kind === "school") {
      const sc = schoolByName[view.name];
      if (sc) crumbLinks.push({ label: sc.state, view: { kind: "state", name: sc.state, fit: view.fit } });
    }
    const trail = crumbLinks
      .map((l, i) => `<span class="link" data-crumb="${i}">${esc(l.label)}</span><span class="sep">▸</span>`)
      .join("");
    return `<div class="crumb">${trail}<span class="cur">${esc(current)}</span></div>`;
  }
  function wireCrumb() {
    app.querySelectorAll("[data-crumb]").forEach((el) =>
      el.addEventListener("click", () => go(crumbLinks[+el.getAttribute("data-crumb")].view)));
  }

  // The ordered list you arrived from, so a school page can step to the next one
  // without making you go back out to find it.
  let navList = [];

  // ---------- fit panel ----------
  const SL_WORDS = ["Ignore", "A little", "Matters", "Priority"];

  function profileSummary() {
    if (!profileReady()) return "Your numbers, your goals, and where you want to practise.";
    const bits = [`GPA <b>${profile.gpa}</b>`, `LSAT <b>${profile.lsat}</b>`];
    const goals = GOALS.filter((g) => profile.goals[g.key]);
    if (goals.length) bits.push(goals.length > 2 ? `<b>${goals.length}</b> goals` : goals.map((g) => g.label).join(", "));
    if (profile.states.length) {
      bits.push(profile.states.length > 3 ? `<b>${profile.states.length}</b> states` : profile.states.join(", "));
    }
    return bits.join(" · ");
  }

  function dockHTML() {
    const goalChips = GOALS.map((g) => {
      const w = profile.goals[g.key] || 0;
      const cls = w >= 2 ? "chip top" : w === 1 ? "chip on" : "chip";
      return `<button type="button" class="${cls}" data-goal="${g.key}">${w >= 2 ? "★ " : ""}${esc(g.label)}</button>`;
    }).join("");

    const regionChips = Object.keys(REGIONS)
      .map((r) => `<button type="button" class="chip region" data-region="${esc(r)}">+ ${esc(r)}</button>`)
      .join("");

    const allStates = Object.keys(stateByName).sort();
    const stateOpts = allStates.map((s) => `<option value="${esc(s)}"></option>`).join("");
    const residencyOpts = allStates
      .map((s) => `<option value="${esc(s)}"${profile.residency === s ? " selected" : ""}>${esc(s)}</option>`)
      .join("");

    const sliders = FACTORS.map((f) => {
      const v = profile.factors[f.key] || 0;
      return `<div class="sl-row">
          <span>${esc(f.label)}</span>
          <input type="range" min="0" max="3" step="1" value="${v}" data-factor="${f.key}"
                 aria-label="${esc(f.label)}">
          <span class="sl-val" data-slval="${f.key}">${SL_WORDS[v]}</span>
        </div>`;
    }).join("");

    const open = dockOpen();
    return `
      <section class="dock" id="dock" data-open="${open}">
        <div class="dock-bar">
          <button class="dock-toggle" id="dockToggle" type="button" aria-expanded="${open}" aria-controls="dockPanel">
            <span class="dock-glyph" aria-hidden="true">◧</span>
            <span class="dock-copy">
              <span class="dock-title">Find your fit <span class="dock-chev" aria-hidden="true">▼</span></span>
              <span class="dock-sum">${profileSummary()}</span>
            </span>
          </button>
          ${profileReady() ? `<button class="btn" id="dockResults" type="button">See my ranked list</button>` : ""}
        </div>
        <div class="dock-panel" id="dockPanel">
          <div class="dock-inner"><div class="dock-pad">
            <p class="pf-lede">Your numbers and what you want out of the degree, matched against
              every ABA school's own reported admissions spread and employment outcomes.</p>
            <div class="pf-grid">
              <div>
                <div class="pf-field">
                  <label for="pfGpa">Your numbers</label>
                  <div class="pf-row">
                    <div><input id="pfGpa" type="number" step="0.01" min="1" max="4.33"
                      placeholder="GPA" aria-label="GPA" value="${profile.gpa == null ? "" : profile.gpa}"></div>
                    <div><input id="pfLsat" type="number" step="1" min="120" max="180"
                      placeholder="LSAT" aria-label="LSAT" value="${profile.lsat == null ? "" : profile.lsat}"></div>
                  </div>
                  <p class="pf-hint">Placed against each school's reported 25th/50th/75th percentiles.</p>
                </div>
                <div class="pf-field">
                  <label for="pfMaxTuition">Cost</label>
                  <div class="pf-row">
                    <div><input id="pfMaxTuition" type="number" step="1000" min="0"
                      placeholder="Max tuition/yr" aria-label="Maximum tuition per year"
                      value="${profile.maxTuition == null ? "" : profile.maxTuition}"></div>
                    <div>
                      <select id="pfResidency" aria-label="State residency">
                        <option value="">Residency — none</option>
                        ${residencyOpts}
                      </select>
                    </div>
                  </div>
                  <p class="pf-hint">Residency picks the in-state price where it applies.</p>
                </div>
                <div class="pf-field">
                  <span class="pf-legend">What else matters</span>
                  <div class="sliders">${sliders}</div>
                </div>
              </div>

              <div class="pf-field">
                <label>Career goals</label>
                <div class="chips" id="pfGoals">${goalChips}</div>
                <p class="pf-hint">Click once for <b>matters</b>, twice for <b>★ priority</b>. Scored on
                  each school's actual ABA employment outcomes, not its rank.</p>
              </div>

              <div class="pf-field">
                <label for="pfStateAdd">Where you want to practise</label>
                <div class="chips" style="margin-bottom:8px">${regionChips}</div>
                <div class="pf-add"><input id="pfStateAdd" list="pfStateList" placeholder="Add a state…"></div>
                <datalist id="pfStateList">${stateOpts}</datalist>
                <div class="chips" id="pfStates" style="margin-top:8px">${stateChipsHTML()}</div>
                <p class="pf-hint">Schools that <i>feed</i> a market count too, not just ones sitting in it.</p>
              </div>
            </div>
            <div class="pf-actions">
              <button class="btn" id="pfGo" type="button">Rank every school for me</button>
              <button class="linkbtn" id="pfReset" type="button">Clear</button>
              <span class="pf-status" id="pfStatus"></span>
            </div>
          </div></div>
        </div>
      </section>`;
  }

  const stateChipsHTML = () => profile.states
    .map((s) => `<button type="button" class="chip on rm" data-unstate="${esc(s)}">${esc(s)}</button>`)
    .join("");

  // Open by default for a blank profile — the tool is the point. Once there's a
  // profile it collapses so the map gets the room, unless you say otherwise.
  function dockOpen() {
    return ui.dockOpen == null ? !profileReady() : !!ui.dockOpen;
  }

  function updateGoStatus() {
    const status = document.getElementById("pfStatus");
    const btn = document.getElementById("pfGo");
    if (!status || !btn) return;
    if (!profileReady()) {
      btn.disabled = true;
      status.textContent = "Enter a GPA and LSAT to rank schools.";
    } else if (!hasPreferences()) {
      btn.disabled = false;
      status.textContent = "No preferences set — results will rank on placement alone.";
    } else {
      btn.disabled = false;
      status.textContent = "";
    }
  }

  function wireDock() {
    const dock = document.getElementById("dock");
    if (!dock) return;

    const toggle = document.getElementById("dockToggle");
    toggle.addEventListener("click", () => {
      const next = dock.getAttribute("data-open") !== "true";
      dock.setAttribute("data-open", next);
      toggle.setAttribute("aria-expanded", next);
      ui.dockOpen = next; persistUI();
      if (next) setTimeout(() => document.getElementById("pfGpa").focus(), 220);
    });

    const results = document.getElementById("dockResults");
    if (results) results.addEventListener("click", openResults);

    const numField = (id, key, parse, lo, hi) => {
      const el = document.getElementById(id);
      el.addEventListener("input", () => {
        const raw = el.value.trim();
        if (raw === "") { profile[key] = null; el.classList.remove("bad"); }
        else {
          const v = parse(raw);
          const ok = !isNaN(v) && v >= lo && v <= hi;
          el.classList.toggle("bad", !ok);
          profile[key] = ok ? v : null;
        }
        persistProfile();
        updateGoStatus();
      });
    };
    numField("pfGpa", "gpa", parseFloat, 1, 4.33);
    numField("pfLsat", "lsat", (v) => parseInt(v, 10), 120, 180);
    numField("pfMaxTuition", "maxTuition", (v) => parseInt(v, 10), 0, 500000);

    document.getElementById("pfResidency").addEventListener("change", (e) => {
      profile.residency = e.target.value; persistProfile();
    });

    // Goals cycle none -> matters -> priority -> none.
    dock.querySelectorAll("[data-goal]").forEach((el) => {
      el.addEventListener("click", () => {
        const k = el.getAttribute("data-goal");
        const next = ((profile.goals[k] || 0) + 1) % 3;
        if (next) profile.goals[k] = next; else delete profile.goals[k];
        el.className = next >= 2 ? "chip top" : next === 1 ? "chip on" : "chip";
        el.textContent = (next >= 2 ? "★ " : "") + GOALS.find((g) => g.key === k).label;
        persistProfile(); updateGoStatus();
      });
    });

    const redrawStates = () => {
      document.getElementById("pfStates").innerHTML = stateChipsHTML();
      wireStateChips();
      persistProfile(); updateGoStatus();
    };
    function wireStateChips() {
      dock.querySelectorAll("[data-unstate]").forEach((el) => {
        el.addEventListener("click", () => {
          profile.states = profile.states.filter((s) => s !== el.getAttribute("data-unstate"));
          redrawStates();
        });
      });
    }
    wireStateChips();

    dock.querySelectorAll("[data-region]").forEach((el) => {
      el.addEventListener("click", () => {
        const known = (REGIONS[el.getAttribute("data-region")] || []).filter((s) => stateByName[s]);
        const allOn = known.every((s) => profile.states.indexOf(s) !== -1);
        if (allOn) profile.states = profile.states.filter((s) => known.indexOf(s) === -1);
        else known.forEach((s) => { if (profile.states.indexOf(s) === -1) profile.states.push(s); });
        redrawStates();
      });
    });

    const addInput = document.getElementById("pfStateAdd");
    const commitState = () => {
      const v = addInput.value.trim();
      const hit = Object.keys(stateByName).find((s) => s.toLowerCase() === v.toLowerCase());
      if (hit && profile.states.indexOf(hit) === -1) { profile.states.push(hit); redrawStates(); }
      if (hit) addInput.value = "";
    };
    addInput.addEventListener("change", commitState);
    addInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commitState(); } });

    dock.querySelectorAll("[data-factor]").forEach((el) => {
      el.addEventListener("input", () => {
        const k = el.getAttribute("data-factor");
        profile.factors[k] = parseInt(el.value, 10) || 0;
        dock.querySelector(`[data-slval="${k}"]`).textContent = SL_WORDS[profile.factors[k]];
        persistProfile(); updateGoStatus();
      });
    });

    document.getElementById("pfGo").addEventListener("click", openResults);
    document.getElementById("pfReset").addEventListener("click", () => {
      profile = blankProfile();
      persistProfile();
      stateFit = null;
      if (ui.mapMode === "fit") { ui.mapMode = "overall"; persistUI(); }
      go({ kind: "map" }, true);
    });

    updateGoStatus();
  }

  function openResults() {
    if (!profileReady()) return;
    // A fresh search is a fresh list: don't carry over where you were sitting in
    // the last one, or which of its bands you'd expanded.
    resultsScroll = 0;
    expandedBands = {};
    go({ kind: "results" });
  }

  // ---------- home: map + rail ----------
  let railPinned = null;    // state name the rail is holding when nothing is hovered

  function renderHome() {
    // Personalised colouring only once there's a profile worth colouring by.
    buildStateFit(profileReady() && hasPreferences() ? scoreAll() : null);
    buildStateReach();
    if (modeLocked(activeMode())) ui.mapMode = "overall";
    buildColorTable();

    const modes = MAP_MODES.map((m) => {
      const off = modeLocked(m);
      return `<button class="mode" type="button" data-mode="${m.key}"
        aria-pressed="${m.key === ui.mapMode}"${off ? ` disabled title="${lockReason(m)}"` : ""}>${esc(m.label)}</button>`;
    }).join("");

    setView(`
      ${dockHTML()}
      <div class="home">
        <div class="mapcol">
          <div class="modes" role="group" aria-label="Map layer">${modes}</div>
          <div class="mapwrap">${buildMapSVG()}</div>
          <div class="maplegend">
            <span class="legend-cap">Lower</span>
            <div class="rampbar" id="rampBar"></div>
            <span class="legend-cap">Higher</span>
            <span class="legend-text" id="legendText"></span>
          </div>
        </div>
        <aside class="rail" id="rail" aria-live="polite"></aside>
      </div>`, true);

    wireDock();
    wireMap();
    paintLegend();
    railShow(railPinned);
  }

  function paintLegend() {
    const bar = document.getElementById("rampBar");
    const text = document.getElementById("legendText");
    if (!bar || !text) return;
    bar.style.background = `linear-gradient(90deg, ${rampColor(0.18)}, ${rampColor(0.6)}, ${rampColor(1)})`;
    // The full sentence lives in the rail; this is just the axis label.
    text.textContent = activeMode().label;
  }

  function setMode(key) {
    const mode = MAP_MODES.find((m) => m.key === key);
    if (!mode || modeLocked(mode)) return;
    ui.mapMode = key; persistUI();
    buildColorTable();
    app.querySelectorAll("svg path.live").forEach((el) => {
      el.setAttribute("fill", colorByState[el.getAttribute("data-state")]);
    });
    app.querySelectorAll("svg g.callout circle").forEach((el) => {
      el.setAttribute("fill", colorByState[el.parentNode.getAttribute("data-state")]);
    });
    app.querySelectorAll("[data-mode]").forEach((el) =>
      el.setAttribute("aria-pressed", el.getAttribute("data-mode") === key));
    paintLegend();
    railShow(railPinned);
  }

  function wireMap() {
    const svg = app.querySelector("svg.usmap");
    if (!svg) return;

    app.querySelectorAll("[data-mode]").forEach((el) =>
      el.addEventListener("click", () => setMode(el.getAttribute("data-mode"))));

    const targets = app.querySelectorAll("svg path.live, svg g.callout");
    targets.forEach((el) => {
      const name = el.getAttribute("data-state");

      const enter = () => {
        svg.classList.add("probing");
        targets.forEach((t) => t.classList.toggle("hot", t === el));
        railShow(name);
      };
      el.addEventListener("mouseenter", enter);
      el.addEventListener("focus", enter);
      el.addEventListener("mousemove", (e) => moveCursorTag(e, name));

      // Desktop: a click drills straight in. Touch: the first tap fills the rail,
      // and the rail's own button takes you into the state.
      el.addEventListener("click", () => {
        if (CAN_HOVER) go({ kind: "state", name });
        else { railPinned = name; railShow(name); }
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go({ kind: "state", name }); }
      });
    });

    const clear = () => {
      svg.classList.remove("probing");
      targets.forEach((t) => t.classList.remove("hot"));
      hideCursorTag();
      railShow(railPinned);
    };
    svg.addEventListener("mouseleave", clear);
    app.querySelectorAll("svg path.live, svg g.callout").forEach((el) =>
      el.addEventListener("blur", () => { if (!app.contains(document.activeElement)) clear(); }));
  }

  function moveCursorTag(e, name) {
    const v = valueByState[name];
    cursorTag.innerHTML = `${esc(name)}${v == null ? "" : ` <span>${esc(activeMode().fmt(v))}</span>`}`;
    cursorTag.classList.add("on");
    const pad = 14;
    let x = e.clientX + pad, y = e.clientY + pad;
    const r = cursorTag.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
    cursorTag.style.left = x + "px";
    cursorTag.style.top = y + "px";
  }
  function hideCursorTag() { cursorTag.classList.remove("on"); }

  // The rail: strengths and weaknesses for one state, or the leaderboard for the
  // current layer when nothing is under the pointer.
  function railShow(name) {
    const rail = document.getElementById("rail");
    if (!rail) return;
    app.querySelectorAll("svg path.live").forEach((el) =>
      el.classList.toggle("sel", !!name && el.getAttribute("data-state") === name));
    rail.innerHTML = name && stateByName[name] ? railStateHTML(name) : railLeadersHTML();

    const open = rail.querySelector("[data-open-state]");
    if (open) open.addEventListener("click", () => go({ kind: "state", name: open.getAttribute("data-open-state") }));
    rail.querySelectorAll("[data-lead]").forEach((el) => {
      const n = el.getAttribute("data-lead");
      el.addEventListener("click", () => go({ kind: "state", name: n }));
      el.addEventListener("mouseenter", () => railShow(n));
      el.addEventListener("mouseleave", () => railShow(railPinned));
    });
  }

  // The three factor scores, for every state, always. Strengths and weaknesses
  // only cover what stands out — without this a state that is merely good at
  // everything (Georgia is 2nd overall and has no weakness) would show no
  // numbers at all, which is less than the old hover tooltip gave you.
  function railFacts(st) {
    const cell = (label, score) => `
      <div class="rf-cell">
        <div class="rf-lbl">${label}</div>
        <div class="rf-val">${score.toFixed(1)}<span>/5</span></div>
        <div class="track track-sm"><span class="fill" style="width:${(score / 5) * 100}%"></span></div>
      </div>`;
    return `<div class="rail-facts">
        ${cell("Afford", st.affordability.score)}
        ${cell("Quality", st.qualityOfLife.score)}
        ${cell("Market", st.legalIndustry.score)}
      </div>`;
  }

  function insGroup(kind, rows) {
    if (!rows.length) return "";
    const up = kind === "up";
    return `
      <div class="ins-group">
        <div class="ins-h ${kind}"><i>${up ? "+" : "−"}</i>${up ? "Strengths" : "Weaknesses"}</div>
        ${rows.map((r) => `
          <div class="ins-row">
            <div class="ins-top">
              <span class="ins-label">${esc(r.label)}</span>
              <span class="ins-rank">${ordinal(r.place)} of ${r.of}</span>
            </div>
            <div class="ins-val">${esc(r.detail)}</div>
          </div>`).join("")}
      </div>`;
  }

  function railStateHTML(name) {
    const st = stateByName[name];
    const ins = INSIGHTS[name] || { strengths: [], weaknesses: [] };
    const n = (schoolsByState[name] || []).length;
    const v = valueByState[name];

    // Your own read on this state: the best-fitting school when there are stated
    // preferences to rank on, otherwise the one your numbers reach furthest into.
    const mine = bestByState[name]
      ? { school: bestByState[name].school, adm: bestByState[name].adm, head: "Your best fit here" }
      : reachByState[name]
        ? { school: reachByState[name].school, adm: admissionRead(reachByState[name].school), head: "Your odds at the flagship" }
        : null;
    const fitRow = mine && mine.adm ? `
        <div class="rail-fit">
          <div class="rf-h">${mine.head}</div>
          <div class="rf-school">${esc(mine.school.name)}</div>
          <div class="rf-odds"><b class="${mine.adm.cls}">${splitPct(mine.adm.odds).admit}% · ${mine.adm.label}</b></div>
        </div>` : "";

    const flat = !ins.strengths.length && !ins.weaknesses.length
      ? `<p class="ins-flat">Middle of the pack on every measure — no standout strengths
         or weaknesses against the other 50 jurisdictions.</p>` : "";

    return `
      <div class="rail-head">
        <div class="rail-kicker">${esc(activeMode().label)} · ${v == null ? "no data" : esc(activeMode().fmt(v))}</div>
        <h2 class="rail-title">${esc(name)}</h2>
        <div class="rail-meta">${n ? plural(n, "law school") : "No law school"} ·
          overall <b>${st.overall.toFixed(2)}</b>/5 · anchored to ${esc(st.anchorCity)}</div>
      </div>
      <div class="rail-body">
        ${railFacts(st)}
        ${fitRow}
        ${insGroup("up", ins.strengths)}
        ${insGroup("dn", ins.weaknesses)}
        ${flat}
        <button class="rail-cta" type="button" data-open-state="${esc(name)}">
          ${n ? `See all ${plural(n, "school")}` : `Open ${esc(name)}`} →
        </button>
      </div>`;
  }

  function railLeadersHTML() {
    const mode = activeMode();
    const top = Object.keys(valueByState)
      .sort((a, b) => valueByState[b] - valueByState[a])
      .slice(0, 10);
    const rows = top.map((n, i) => `
      <button class="lead-row" type="button" data-lead="${esc(n)}">
        <span class="lead-n">${i + 1}</span>
        <span class="lead-swatch" style="background:${colorByState[n]}"></span>
        <span class="lead-name">${esc(n)}</span>
        <span class="lead-val">${esc(mode.fmt(valueByState[n]))}</span>
      </button>`).join("");

    return `
      <div class="rail-head">
        <div class="rail-kicker">Leading states</div>
        <h2 class="rail-title">${esc(mode.label)}</h2>
        <div class="rail-meta">${CAN_HOVER ? "Hover" : "Tap"} any state for its strengths and weaknesses.</div>
      </div>
      <div class="rail-body">${rows}
        <p class="rail-note">${esc(mode.legend(Object.keys(stateByName).length))}</p>
      </div>`;
  }

  // ---------- results ----------
  const BANDS = [
    { label: "Safety",    sub: "Modelled at better than a 70% chance of admission." },
    { label: "Target",    sub: "Modelled between 35% and 70% — the range worth spending applications on." },
    { label: "Reach",     sub: "Modelled between 12% and 35%: possible, and not something to count on." },
    { label: "Far reach", sub: "Modelled under 12%. Your numbers alone won't carry these." },
  ];
  const BAND_CLS = ["band-safety", "band-target", "band-reach", "band-far"];
  const SHOW_PER_BAND = 8;
  let expandedBands = {};

  // Their median next to yours. `pos` comes straight from admissionRead, so the
  // tick sits in exactly the place the school's own detail page puts it.
  function numTile(label, med, mine, pos, fmt) {
    if (med == null) {
      return `<div class="sub"><div class="sv" style="color:var(--ink-faint)">—</div><div class="sl">${label}</div></div>`;
    }
    const track = pos == null ? ""
      : `<div class="track track-sm"><span class="band"></span>
           <span class="pin" style="left:${Math.max(3, Math.min(97, 50 + pos * 25)).toFixed(1)}%"></span></div>`;
    let diff = "";
    if (mine != null) {
      const d = mine - med;
      const mag = fmt(Math.abs(d));
      diff = Number(mag) === 0
        ? `<div class="sdiff">You match</div>`
        : `<div class="sdiff ${d > 0 ? "up" : "dn"}">You ${d > 0 ? "+" : "−"}${mag}</div>`;
    }
    return `<div class="sub">
        <div class="sv">${fmt(med)}</div>
        <div class="sl">${label}</div>
        ${track}${diff}
      </div>`;
  }

  const fmtLsat = (n) => String(Math.round(n));
  const fmtGpa = (n) => n.toFixed(2);

  // Band and probability as one element — the label names the number, so a row
  // can never show you a reassuring word next to a discouraging percentage.
  function oddsChip(adm) {
    const p = splitPct(adm.odds);
    return `<div class="pchip ${adm.cls}">
        <div class="pcv">${p.admit}%</div>
        <div class="pcl">${adm.label}</div>
        <div class="pcs">${p.wait}% wait · ${p.deny}% deny</div>
      </div>`;
  }

  function resultRow(r) {
    const s = r.school;
    const a = s.admissions || {};
    const lsatMed = a.lsat50 != null ? a.lsat50 : s.medianLSAT;
    const gpaMed = a.gpa50 != null ? a.gpa50 : s.medianGPA;
    return `
      <div class="rrow" data-school="${esc(s.name)}">
        <div class="rmain">
          <div class="rname">${esc(s.name)}${isSaved(s.name) ? ' <span class="saved-flag">✓ on list</span>' : ""}</div>
          <div class="rloc">${esc(s.city)}, ${esc(s.state)} · ${esc(s.tier || "—")}${s.rank == null ? "" : " · #" + s.rank}</div>
          <div class="rwhy">${whyLine(s)}</div>
        </div>
        <div class="subs">
          ${numTile("Median LSAT", lsatMed, profile.lsat, r.adm.lsatPos, fmtLsat)}
          ${numTile("Median GPA", gpaMed, profile.gpa, r.adm.gpaPos, fmtGpa)}
        </div>
        ${oddsChip(r.adm)}
        ${tierBadge(s.tier)}
      </div>`;
  }

  function renderResults() {
    const results = scoreAll();
    const groups = [[], [], [], []];
    results.forEach((r) => groups[r.adm.band].push(r));

    // Target first — it's the actionable middle. Then reach, safety, far reach.
    const order = [1, 2, 0, 3];
    // Step order has to match reading order, or "next" jumps from the top of
    // Target to something buried in Far reach.
    navList = order.reduce((acc, bi) => acc.concat(groups[bi].map((r) => r.school.name)), []);

    let jumps = "", body = "";
    order.forEach((bi) => {
      const list = groups[bi];
      if (!list.length) return;
      jumps += `<button class="bandjump ${BAND_CLS[bi]}" type="button" data-jump="${bi}">
          ${BANDS[bi].label} <em>${list.length}</em></button>`;
      const limit = expandedBands[bi] ? list.length : SHOW_PER_BAND;
      body += `
        <section class="band" id="band-${bi}">
          <div class="band-h">
            <h3 class="${BAND_CLS[bi]}">${BANDS[bi].label}</h3>
            <span class="n">${plural(list.length, "school")}</span>
          </div>
          <p class="band-sub">${BANDS[bi].sub}</p>
          ${list.slice(0, limit).map(resultRow).join("")}
          ${list.length > limit
            ? `<button class="band-more" type="button" data-expand="${bi}">Show all ${list.length}</button>`
            : ""}
        </section>`;
    });

    if (!body) body = `<div class="empty">Nothing matched. If you set a tuition ceiling, try raising it.</div>`;

    const goalNames = GOALS.filter((g) => profile.goals[g.key]).map((g) => g.label);
    const bits = [`GPA ${profile.gpa} · LSAT ${profile.lsat}`];
    if (goalNames.length) bits.push(goalNames.join(", "));
    if (profile.states.length) {
      bits.push(profile.states.length > 4 ? `${profile.states.length} states` : profile.states.join(", "));
    }

    setView(`
      ${crumbHTML({ kind: "results" }, "Your fit")}
      <div class="res-head">
        <h2>${plural(results.length, "school")} ranked for you</h2>
        <p>${esc(bits.join("  ·  "))} · <button class="linkbtn" id="editProfile" type="button">edit</button></p>
      </div>
      <div class="bandnav">${jumps}</div>
      ${body}
      <p class="footnote">
        The LSAT and GPA figures are each school's own reported medians, with the tick
        marking where your number falls inside their 25th–75th percentile spread. The
        percentage is a modelled chance of admission on your two numbers alone, built
        from each school's acceptance rate, its reported spread, and its yield — it has
        no knowledge of your essays, work history, or softs, and nothing in it is fitted
        to real admission results, because no school publishes them. The band label is
        just a name for that percentage. Waitlist is the softest figure on the page: the
        ABA collects no waitlist data at all, so that share is a modelled band around the
        decision boundary rather than anything reported. Ranking within a band uses your
        stated goals and geography — the line under each school names the outcomes doing
        the work. Employment figures describe the class of 2024.
      </p>`);
    window.scrollTo({ top: resultsScroll, behavior: "auto" });

    wireCrumb();
    app.querySelectorAll("[data-school]").forEach((el) =>
      el.addEventListener("click", () =>
        go({ kind: "school", name: el.getAttribute("data-school"), fit: fitOrigin(currentView) })));
    app.querySelectorAll("[data-expand]").forEach((el) =>
      el.addEventListener("click", () => {
        expandedBands[el.getAttribute("data-expand")] = true;
        rerender();
      }));
    app.querySelectorAll("[data-jump]").forEach((el) =>
      el.addEventListener("click", () => {
        const t = document.getElementById("band-" + el.getAttribute("data-jump"));
        if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      }));
    document.getElementById("editProfile").addEventListener("click", () => {
      ui.dockOpen = true; persistUI();
      go({ kind: "map" });
    });
  }

  // ---------- state view ----------
  function factorCard(title, score, detailRows, extra) {
    return `
      <div class="fcard">
        <h3>${title}</h3>
        <div class="fscore">${score.toFixed(1)}<span> / 5</span></div>
        <div class="track"><span class="fill" style="width:${Math.round((score / 5) * 100)}%"></span></div>
        <div class="fdetail">${detailRows}</div>
        ${extra || ""}
      </div>`;
  }

  function renderState(name) {
    hideCursorTag();
    const s = stateByName[name];
    if (!s) { go({ kind: "map" }, true); return; }
    const aff = s.affordability, qol = s.qualityOfLife, leg = s.legalIndustry;

    const affRows =
      `<div class="drow"><span>Cost-of-living index</span><b>${aff.costOfLivingIndex}</b></div>` +
      `<div class="drow"><span>Housing index</span><b>${aff.housingIndex}</b></div>`;
    const qolRows =
      `<div class="drow"><span>Safety</span><b>${qol.safety}/5</b></div>` +
      `<div class="drow"><span>Healthcare</span><b>${qol.healthcare}/5</b></div>` +
      `<div class="drow"><span>Livability / climate</span><b>${qol.livability}/5</b></div>`;
    const legRows =
      `<div class="drow"><span>Lawyer jobs / 1k</span><b>${leg.lawyerJobsPer1k}</b></div>` +
      `<div class="drow"><span>Avg legal salary</span><b>${money(leg.avgLegalSalary)}</b></div>`;

    const schools = sortSchools(schoolsByState[name] || []);
    navList = schools.map((sc) => sc.name);

    const rows = schools.map((sc) => `
      <div class="srow" data-school="${esc(sc.name)}">
        <div class="sname">
          <div class="n">${esc(sc.name)}</div>
          <div class="c">${esc(sc.city)}, ${esc(s.abbr)}</div>
        </div>
        ${tierBadge(sc.tier)}
        <div class="stats">LSAT <b>${sc.medianLSAT}</b> &nbsp;·&nbsp; GPA <b>${sc.medianGPA.toFixed(2)}</b></div>
        ${isSaved(sc.name) ? '<span class="saved-flag">✓ on my list</span>' : ""}
      </div>`).join("");

    const ins = INSIGHTS[name] || { strengths: [], weaknesses: [] };
    const insBlock = ins.strengths.length || ins.weaknesses.length ? `
      <div class="fcard ins-card">
        <h3>Against the other 50</h3>
        <div class="ins-split">
          ${insGroup("up", ins.strengths)}
          ${insGroup("dn", ins.weaknesses)}
        </div>
      </div>` : "";

    setView(`
      ${crumbHTML(currentView, name)}
      <div class="state-head">
        <div>
          <h2>${esc(name)}</h2>
          <p class="state-sub">Overall fit <b>${s.overall.toFixed(2)}</b>/5 · anchored to ${esc(s.anchorCity)}</p>
        </div>
      </div>
      <div class="factor-grid">
        ${factorCard("Affordability", aff.score, affRows, `<div class="anchor-note">Index values are US average = 100; lower is cheaper.</div>`)}
        ${factorCard("Quality of Life", qol.score, qolRows, schools.length
          ? `<div class="anchor-note">Youthful-active-lifestyle varies by city — shown on each school below.</div>` : "")}
        ${factorCard("Legal Industry", leg.score, legRows)}
      </div>
      ${insBlock}
      <div class="section-h">Law schools in ${esc(name)} (${schools.length})</div>
      <div class="school-list">${rows || `<div class="empty card">
        ${esc(name)} has no ABA-accredited law school — the only state that doesn't.<br>
        Its scores are here so you can still weigh it against the others.</div>`}</div>`);

    wireCrumb();
    app.querySelectorAll(".srow").forEach((el) =>
      el.addEventListener("click", () =>
        go({ kind: "school", name: el.getAttribute("data-school"), fit: fitOrigin(currentView) })));
  }

  // ---------- school view ----------
  function renderSchool(schoolName) {
    const sc = schoolByName[schoolName];
    if (!sc) { go({ kind: "map" }, true); return; }
    const st = stateByName[sc.state];
    const added = isSaved(sc.name);
    const city = cityByKey[sc.city + "|" + sc.state];

    const lifeBar = (label, v) =>
      `<div class="life-row"><span>${label}</span>
         <span class="track"><span class="fill" style="width:${(v / 5) * 100}%"></span></span>
         <b>${v}/5</b></div>`;

    // Class-of-2024 outcomes, with each figure's percentile against every other
    // ABA school — 12% federal clerkships means something very different from 12% BigLaw.
    const oc = sc.outcomes;
    const ocTile = (label, field, val) => {
      if (val == null) return "";
      const r = rankOf(sc, field);
      return `<div class="oc"><div class="ov">${val}%</div><div class="ol">${label}</div>` +
        `${r == null ? "" : `<div class="op">${pctLabel(r)}</div>`}</div>`;
    };
    const feeds = (sc.topStates || []).length
      ? `<div class="feeds">Graduates land mostly in ` +
        sc.topStates.map((t) => `<b>${esc(t.state)}</b> (${t.pct}%)`).join(", ") + `.</div>`
      : "";
    const outcomesBlock = oc ? `
      <div class="outcomes">
        <div class="writeup-h">Where the class of 2024 ended up</div>
        <div class="oc-grid">
          ${ocTile("Employed, FT long-term", "employmentRate", oc.employmentRate)}
          ${ocTile("BigLaw (500+)", "bigLaw", oc.bigLaw)}
          ${ocTile("Federal clerkship", "federalClerk", oc.federalClerk)}
          ${ocTile("Government", "government", oc.government)}
          ${ocTile("Public interest", "publicInterest", oc.publicInterest)}
          ${ocTile("Small firm (≤100)", "smallFirm", oc.smallFirm)}
          ${ocTile("Business / in-house", "business", oc.business)}
          ${ocTile("Academia", "academia", oc.academia)}
        </div>
        ${feeds}
      </div>` : "";

    // Where the user's own numbers land in this school's admitted range.
    const adm = admissionRead(sc);
    const a = sc.admissions;
    const marker = (label, pos, value) => {
      if (pos == null) return "";
      const left = Math.max(2, Math.min(98, 50 + pos * 25));
      return `<div class="pctline"><span>${label}</span>
        <span class="track track-lg"><span class="band"></span>
          <span class="pin" style="left:${left.toFixed(1)}%"></span></span>
        <span class="pv"><b>${value}</b></span></div>`;
    };
    const oddsBlock = adm ? (() => {
      const p = splitPct(adm.odds);
      const seg = (cls, v) => (v <= 0 ? "" : `<span class="${cls}" style="width:${v}%"></span>`);
      return `
      <div class="odds">
        <div class="oh">
          <div class="writeup-h" style="margin:0">Your numbers here</div>
          <div class="oband ${adm.cls}">${p.admit}% · ${adm.label}</div>
        </div>
        ${marker("LSAT", adm.lsatPos, profile.lsat)}
        ${marker("GPA", adm.gpaPos, profile.gpa)}
        <div class="obar">${seg("oa", p.admit)}${seg("ow", p.wait)}${seg("odn", p.deny)}</div>
        <div class="okeys">
          <span class="okey"><i class="ka"></i>Admit <b>${p.admit}%</b></span>
          <span class="okey"><i class="kw"></i>Waitlist <b>${p.wait}%</b></span>
          <span class="okey"><i class="kd"></i>Deny <b>${p.deny}%</b></span>
        </div>
        <div class="omodel">Waitlist is hatched because it's modelled, not reported —
          the ABA publishes no waitlist figures for any school.</div>
        ${adm.odds.splitter ? `<div class="oflag">Your LSAT and GPA pull hard in opposite
          directions. Splitters are exactly where a single blended number is least
          reliable; schools vary enormously in how they treat them.</div>` : ""}
        <div class="od">Shaded band is their 25th–75th percentile:
          LSAT <b>${a.lsat25}–${a.lsat75}</b>, GPA <b>${a.gpa25}–${a.gpa75}</b>.
          They admit <b>${a.acceptanceRate}%</b> of ${a.applications.toLocaleString("en-US")} applicants.
          The split above comes from those figures and your two numbers alone —
          it knows nothing about your essays, work history, or softs.</div>
      </div>`;
    })() : "";

    const lifestyleBlock = city ? `
      <div class="lifestyle">
        <div class="life-head">
          <div class="writeup-h" style="margin:0">Lifestyle in ${esc(sc.city)}</div>
          <div class="life-score">${city.lifestyleScore.toFixed(1)}<span>/5</span></div>
        </div>
        <div class="life-sub">Youthful, active-lifestyle fit for where you'd actually live</div>
        ${lifeBar("Social scene", city.social)}
        ${lifeBar("Outdoors", city.outdoors)}
        ${lifeBar("Walkability", city.walkability)}
        <p class="writeup gap-t">${esc(city.blurb)}</p>
      </div>` : "";

    // Step through whatever list brought you here, so comparing two schools
    // doesn't mean bouncing back out to find the second one.
    const idx = navList.indexOf(sc.name);
    const step = (delta, label) => {
      const target = idx === -1 ? null : navList[idx + delta];
      return `<button class="navbtn" type="button" ${target ? `data-step="${esc(target)}"` : "disabled"}>
        ${delta < 0 ? "←" : ""}<span>${target ? esc(target) : label}</span>${delta > 0 ? "→" : ""}</button>`;
    };
    const navBlock = idx === -1 ? "" : `
      <div class="schoolnav">
        ${step(-1, "")}
        ${step(1, "")}
      </div>`;

    setView(`
      ${crumbHTML(currentView, sc.name)}
      <div class="school-hero">
        <div class="h-top">
          <div>
            <h2>${esc(sc.name)}</h2>
            <div class="loc">${esc(sc.city)}, ${esc(st ? st.abbr : sc.state)}</div>
          </div>
          <div class="h-side">
            ${tierBadge(sc.tier)}
            <button class="btn ${added ? "btn-quiet" : ""}" id="toggleBtn" type="button">
              ${added ? "✓ On my list" : "Add to my list"}
            </button>
          </div>
        </div>
        <div class="statblock">
          <div class="stat"><div class="lbl">Median GPA</div><div class="val">${sc.medianGPA.toFixed(2)}</div>
            ${a ? `<div class="rng">${a.gpa25}–${a.gpa75} (25th–75th)</div>` : ""}</div>
          <div class="stat"><div class="lbl">Median LSAT</div><div class="val">${sc.medianLSAT}</div>
            ${a ? `<div class="rng">${a.lsat25}–${a.lsat75} (25th–75th)</div>` : ""}</div>
          <div class="stat"><div class="lbl">Acceptance Rate</div>
            <div class="val">${a && a.acceptanceRate != null ? a.acceptanceRate + "%" : "—"}</div>
            ${a && a.applications ? `<div class="rng">${a.applications.toLocaleString("en-US")} applied</div>` : ""}</div>
          <div class="stat"><div class="lbl">Rank</div><div class="val">${sc.rank == null ? "—" : "#" + sc.rank}</div></div>
          <div class="stat"><div class="lbl">In-State Tuition</div><div class="val">${money(sc.tuitionInState)}</div></div>
          <div class="stat"><div class="lbl">Out-of-State Tuition</div><div class="val">${money(sc.tuitionOutState)}</div></div>
        </div>
        ${oddsBlock}
        <div class="writeup-h gap-t">How it stacks up</div>
        <p class="writeup">${esc(sc.writeup)}</p>
        ${outcomesBlock}
        ${lifestyleBlock}
      </div>
      ${navBlock}`);

    wireCrumb();
    app.querySelector("#toggleBtn").addEventListener("click", () => {
      toggleSaved(sc.name);
      rerender();
      renderDrawer();
    });
    app.querySelectorAll("[data-step]").forEach((el) =>
      el.addEventListener("click", () =>
        go({ kind: "school", name: el.getAttribute("data-step"), fit: fitOrigin(currentView) })));
  }

  // ---------- saved-list drawer ----------
  function groupedSaved() {
    const groups = {};
    saved.map((n) => schoolByName[n]).filter(Boolean)
      .forEach((s) => { (groups[s.state] = groups[s.state] || []).push(s); });
    return groups;
  }

  function renderDrawer() {
    const body = document.getElementById("drawerBody");
    const sub = document.getElementById("drawerSub");
    const groups = groupedSaved();
    const names = Object.keys(groups).sort();
    const total = names.reduce((a, n) => a + groups[n].length, 0);

    document.getElementById("exportMd").disabled = !total;
    document.getElementById("exportCsv").disabled = !total;

    if (!total) {
      sub.textContent = "Nothing saved yet.";
      body.innerHTML = `<div class="empty">Your list is empty.<br>Add schools from any school's page.</div>`;
      return;
    }
    sub.textContent = `${plural(total, "school")} across ${plural(names.length, "state")}.`;

    body.innerHTML = names.map((stn) =>
      `<div class="pl-state">${esc(stn)}</div>` +
      sortSchools(groups[stn]).map((s) => `
        <div class="pl-entry">
          <div class="pe-main" data-school="${esc(s.name)}">
            <div class="n">${esc(s.name)}</div>
            <div class="m">${esc(s.city)} · ${esc(s.tier || "—")} · LSAT ${s.medianLSAT} · GPA ${s.medianGPA.toFixed(2)} · ${money(s.tuitionInState)} in / ${money(s.tuitionOutState)} out</div>
          </div>
          <button class="pl-remove" type="button" data-remove="${esc(s.name)}" title="Remove" aria-label="Remove ${esc(s.name)}">&times;</button>
        </div>`).join("")
    ).join("");

    body.querySelectorAll(".pe-main").forEach((el) =>
      el.addEventListener("click", () => {
        closeDrawer();
        go({ kind: "school", name: el.getAttribute("data-school"), fit: fitOrigin(currentView) });
      }));
    body.querySelectorAll(".pl-remove").forEach((el) =>
      el.addEventListener("click", () => {
        toggleSaved(el.getAttribute("data-remove"));
        renderDrawer();
        rerender();
      }));
  }

  const drawer = document.getElementById("drawer");
  const scrim = document.getElementById("scrim");
  function openDrawer() {
    renderDrawer();
    scrim.classList.add("on");
    drawer.classList.add("on");
    drawer.setAttribute("aria-hidden", "false");
  }
  function closeDrawer() {
    scrim.classList.remove("on");
    drawer.classList.remove("on");
    drawer.setAttribute("aria-hidden", "true");
  }

  // ---------- search ----------
  const searchScrim = document.getElementById("searchScrim");
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");
  let searchHits = [], searchSel = 0;

  function searchOpen() {
    searchScrim.classList.add("on");
    searchInput.value = "";
    runSearch("");
    setTimeout(() => searchInput.focus(), 30);
  }
  function searchClose() {
    searchScrim.classList.remove("on");
    searchInput.blur();
  }

  // Substring match, ranked: whole-name prefix, then word-start, then anywhere in
  // the name, then a hit on the city or state. Enough for 244 rows.
  function findMatches(q) {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const out = [];

    Object.keys(stateByName).forEach((n) => {
      const low = n.toLowerCase();
      const i = low.indexOf(s);
      const abbrHit = stateByName[n].abbr.toLowerCase() === s;
      if (i === -1 && !abbrHit) return;
      out.push({
        kind: "state", name: n, hit: i,
        sub: `${plural((schoolsByState[n] || []).length, "school")} · ${stateByName[n].abbr}`,
        score: abbrHit ? -1 : i === 0 ? 0 : wordStart(low, s) ? 1 : 2,
      });
    });

    Object.values(schoolByName).forEach((sc) => {
      const low = sc.name.toLowerCase();
      const i = low.indexOf(s);
      const locHit = i === -1 && (sc.city + " " + sc.state).toLowerCase().indexOf(s) !== -1;
      if (i === -1 && !locHit) return;
      out.push({
        kind: "school", name: sc.name, hit: i,
        sub: `${sc.city}, ${sc.state} · ${sc.tier || "—"}${sc.rank == null ? "" : " · #" + sc.rank}`,
        score: locHit ? 4 : i === 0 ? 0.5 : wordStart(low, s) ? 1.5 : 3,
      });
    });

    return out.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name)).slice(0, 9);
  }
  const wordStart = (hay, needle) =>
    hay.split(/[\s\-–,.'()]+/).some((w) => w.indexOf(needle) === 0);

  function markMatch(text, q) {
    const i = text.toLowerCase().indexOf(q.trim().toLowerCase());
    if (i === -1 || !q.trim()) return esc(text);
    const n = q.trim().length;
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + n)) + "</mark>" + esc(text.slice(i + n));
  }

  function runSearch(q) {
    searchHits = findMatches(q);
    searchSel = 0;
    if (!q.trim()) {
      searchResults.innerHTML = `<div class="sr-empty">Type a school, a city, or a state.</div>`;
      return;
    }
    if (!searchHits.length) {
      searchResults.innerHTML = `<div class="sr-empty">Nothing matched “${esc(q)}”.</div>`;
      return;
    }
    paintSearch();
  }

  function paintSearch() {
    const q = searchInput.value;
    let html = "", lastKind = "";
    searchHits.forEach((h, i) => {
      if (h.kind !== lastKind) {
        html += `<div class="sr-group">${h.kind === "state" ? "States" : "Schools"}</div>`;
        lastKind = h.kind;
      }
      html += `<button class="sr-item" type="button" role="option" data-i="${i}"
          aria-selected="${i === searchSel}">
          <span class="sr-main">
            <span class="sr-name">${markMatch(h.name, q)}</span>
            <span class="sr-sub">${esc(h.sub)}</span>
          </span>
          <span class="sr-kind">${h.kind === "state" ? "state" : "school"}</span>
        </button>`;
    });
    html += `<div class="sr-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span>
      <span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>`;
    searchResults.innerHTML = html;
    searchResults.querySelectorAll("[data-i]").forEach((el) =>
      el.addEventListener("click", () => pickSearch(+el.getAttribute("data-i"))));
  }

  function moveSearch(delta) {
    if (!searchHits.length) return;
    searchSel = (searchSel + delta + searchHits.length) % searchHits.length;
    searchResults.querySelectorAll("[data-i]").forEach((el) => {
      const on = +el.getAttribute("data-i") === searchSel;
      el.setAttribute("aria-selected", on);
      if (on) el.scrollIntoView({ block: "nearest" });
    });
  }

  function pickSearch(i) {
    const h = searchHits[i];
    if (!h) return;
    searchClose();
    go(h.kind === "state"
      ? { kind: "state", name: h.name }
      : { kind: "school", name: h.name, fit: fitOrigin(currentView) });
  }

  // ---------- exports ----------
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }
  function exportMarkdown() {
    const groups = groupedSaved();
    const names = Object.keys(groups).sort();
    if (!names.length) return;
    let md = "# My Law School Target List\n\n";
    names.forEach((stn) => {
      md += `## ${stn}\n\n`;
      sortSchools(groups[stn]).forEach((s) => {
        const rk = s.rank == null ? (s.tier || "unranked") : "#" + s.rank;
        md += `- **${s.name}** — ${s.city}. GPA ${s.medianGPA.toFixed(2)}, LSAT ${s.medianLSAT}, ` +
          `${money(s.tuitionInState)} in-state / ${money(s.tuitionOutState)} out-of-state, ${rk} (${s.tier || "—"})\n`;
      });
      md += "\n";
    });
    download("law-school-shortlist.md", md, "text/markdown");
  }
  function exportCsv() {
    const groups = groupedSaved();
    const names = Object.keys(groups).sort();
    if (!names.length) return;
    const cell = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    let csv = "State,School,City,MedianGPA,MedianLSAT,InStateTuition,OutStateTuition,Rank,Tier\n";
    names.forEach((stn) => {
      sortSchools(groups[stn]).forEach((s) => {
        csv += [
          cell(s.state), cell(s.name), cell(s.city),
          cell(s.medianGPA), cell(s.medianLSAT),
          cell(s.tuitionInState), cell(s.tuitionOutState),
          cell(s.rank == null ? "" : s.rank), cell(s.tier),
        ].join(",") + "\n";
      });
    });
    download("law-school-shortlist.csv", csv, "text/csv");
  }

  // ---------- boot ----------
  async function boot() {
    try {
      const grab = (f) => fetch("data/" + f).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
      const [geo, states, schools, cities] = await Promise.all([
        grab("us-states.json"), grab("states.json"), grab("schools.json"), grab("cities.json"),
      ]);
      DATA.geo = geo;

      (cities.cities || []).forEach((c) => {
        if (typeof c.city !== "string" || c.city[0] === "_") return;
        cityByKey[c.city + "|" + c.state] = c;
      });
      (states.states || []).forEach((s) => {
        if (typeof s.state !== "string" || s.state[0] === "_") return;
        stateByName[s.state] = s;
      });
      (schools.schools || []).forEach((sc) => {
        if (typeof sc.name !== "string" || sc.name[0] === "_") return;
        schoolByName[sc.name] = sc;
        (schoolsByState[sc.state] = schoolsByState[sc.state] || []).push(sc);
      });

      buildPercentiles();
      buildInsights();
      loadUI();

      profile = loadProfile();
      // Drop saved geography for states that aren't in the data.
      profile.states = profile.states.filter((s) => stateByName[s]);
      if (profile.residency && !stateByName[profile.residency]) profile.residency = "";
      persistProfile();

      // drop any saved names no longer in data
      saved = saved.filter((n) => schoolByName[n]);
      persist();

      const nJur = Object.keys(stateByName).length;
      const nSch = Object.keys(schoolByName).length;
      document.getElementById("brandSub").textContent =
        `${nJur - 1} states and DC · ${nSch} ABA-accredited schools`;
      searchInput.placeholder = `Search ${nSch} schools and ${nJur} states…`;

      go({ kind: "map" }, true);
    } catch (err) {
      app.innerHTML = `<div class="view"><div class="errbox">
        <b>Couldn't load the data.</b><br>
        Failed on <code>${esc(err.message || err)}</code>.
        This app fetches local JSON, so it must be served over a local HTTP server
        (e.g. <code>python3 -m http.server</code>) rather than opened via <code>file://</code>.
      </div></div>`;
    }
  }

  // ---------- persistent wiring ----------
  document.getElementById("brandBtn").addEventListener("click", () => go({ kind: "map" }));
  document.getElementById("listBtn").addEventListener("click", openDrawer);
  document.getElementById("drawerClose").addEventListener("click", closeDrawer);
  scrim.addEventListener("click", closeDrawer);
  document.getElementById("exportMd").addEventListener("click", exportMarkdown);
  document.getElementById("exportCsv").addEventListener("click", exportCsv);

  document.getElementById("searchBtn").addEventListener("click", searchOpen);
  document.getElementById("searchClose").addEventListener("click", searchClose);
  searchScrim.addEventListener("click", (e) => { if (e.target === searchScrim) searchClose(); });
  searchInput.addEventListener("input", () => runSearch(searchInput.value));
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); moveSearch(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveSearch(-1); }
    else if (e.key === "Enter") { e.preventDefault(); pickSearch(searchSel); }
  });

  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === "Escape") { searchClose(); closeDrawer(); return; }
    if (typing) return;
    if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "k")) {
      e.preventDefault(); searchOpen();
    }
  });

  persist();
  boot();
})();
