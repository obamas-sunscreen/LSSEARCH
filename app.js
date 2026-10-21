"use strict";
(function () {
  const LS_KEY = "lawSchoolShortlist";
  const PROFILE_KEY = "lawSchoolProfile";

  const app = document.getElementById("app");
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
    const badge = document.getElementById("menuCount");
    badge.textContent = saved.length;
    badge.hidden = !saved.length;
  }
  // Your own notes per school, keyed by name. They outlive removing a school
  // from the list, so re-adding it brings them back.
  const NOTES_KEY = "lawSchoolNotes";
  let notes = loadNotes();
  function loadNotes() {
    try {
      const o = JSON.parse(localStorage.getItem(NOTES_KEY) || "{}");
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (e) { return {}; }
  }
  function persistNotes() {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); return true; } catch (e) { return false; }
  }

  // Attachments live in IndexedDB: a couple of scanned letters would blow
  // through localStorage's few megabytes on their own.
  const MAX_FILE = 10 * 1024 * 1024;
  let dbPromise = null;
  function fileDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open("lawSchoolFiles", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("files", { keyPath: "id", autoIncrement: true });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch((e) => { dbPromise = null; throw e; });
    }
    return dbPromise;
  }
  function fileStore(mode, fn) {
    return fileDB().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction("files", mode);
      const req = fn(tx.objectStore("files"));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    }));
  }
  const allFiles = () => fileStore("readonly", (s) => s.getAll());
  const putFile = (rec) => fileStore("readwrite", (s) => s.add(rec));
  const dropFile = (id) => fileStore("readwrite", (s) => s.delete(id));

  function isSaved(name) { return saved.indexOf(name) !== -1; }
  function toggleSaved(name) {
    const i = saved.indexOf(name);
    if (i === -1) saved.push(name); else saved.splice(i, 1);
    persist();
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
    return `<span class="tier ${tierClass(tier)}">${esc(tier || "—")}${RING}</span>`;
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

  const STATE_CODES = "AL Alabama AK Alaska AZ Arizona AR Arkansas CA California CO Colorado CT Connecticut DE Delaware DC District_of_Columbia FL Florida GA Georgia HI Hawaii ID Idaho IL Illinois IN Indiana IA Iowa KS Kansas KY Kentucky LA Louisiana ME Maine MD Maryland MA Massachusetts MI Michigan MN Minnesota MS Mississippi MO Missouri MT Montana NE Nebraska NV Nevada NH New_Hampshire NJ New_Jersey NM New_Mexico NY New_York NC North_Carolina ND North_Dakota OH Ohio OK Oklahoma OR Oregon PA Pennsylvania RI Rhode_Island SC South_Carolina SD South_Dakota TN Tennessee TX Texas UT Utah VT Vermont VA Virginia WA Washington WV West_Virginia WI Wisconsin WY Wyoming"
    .split(" ").reduce((m, v, i, a) => (i % 2 ? m : Object.assign(m, { [v]: a[i + 1].replace(/_/g, " ") })), {});

  // The one state someone typed: a two-letter code, a name, "DC", or failing
  // that the nearest spelling a slip or two away.
  function resolveState(text) {
    const t = text.trim();
    if (!t) return "";
    if (t.length === 2 && STATE_CODES[t.toUpperCase()]) return STATE_CODES[t.toUpperCase()];
    const low = t.toLowerCase().replace(/\./g, "");
    if (low === "washington dc" || low === "dc") return "District of Columbia";
    const limit = low.length < 5 ? 1 : low.length < 10 ? 2 : 3;
    let best = "", bestD = limit + 1;
    Object.keys(stateByName).forEach((s) => {
      const d = editDistance(low, s.toLowerCase());
      if (d < bestD) { best = s; bestD = d; }
    });
    return best;
  }
  // States that fit what's typed so far, for picking from as you go: names that
  // start with it, then names with a later word that does ("york" → New York),
  // then the closest spelling if it's a typo. A two-letter code leads.
  function suggestStates(text, max = 4) {
    const low = text.trim().toLowerCase();
    if (!low) return [];
    const names = Object.keys(stateByName), fixed = resolveState(text);
    const starts = names.filter((s) => s.toLowerCase().startsWith(low));
    const inner = names.filter((s) => s.toLowerCase().split(" ").slice(1).some((w) => w.startsWith(low)));
    const code = low.length === 2 && fixed ? [fixed] : [];
    return [...new Set([...code, ...starts, ...inner, ...(fixed ? [fixed] : [])])].slice(0, max);
  }
  // Typing slips between two strings; swapping two neighbouring letters counts as one.
  function editDistance(a, b) {
    let before = [], prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], before[j - 2] + 1);
      }
      before = prev; prev = cur;
    }
    return prev[b.length];
  }

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
  // The map card and state page show only the ones where a state genuinely stands apart, with the
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

  // ---------- projection + map build ----------
  // Fitted once to the geometry's bounds, then shared by the map and its city
  // pins, so a pin always lands where its city is drawn.
  let projection = null;
  function mapProjection() {
    if (projection) return projection;
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
    projection = { project, VBW, VBH };
    return projection;
  }

  // Alaska and Hawaii are drawn as insets, so real coordinates there have to
  // go through the same move. Hawaii's main-island extent, real -> inset.
  const HI_REAL = [-160.25, 18.91, -154.81, 22.24];
  const HI_INSET = [-104.734, 19.6, -98.264, 23.412];
  function schoolXY(sc) {
    const c = cityByKey[sc.city + "|" + sc.state];
    if (!c || c.lat == null) return null;
    let lon = c.lon, lat = c.lat;
    if (sc.state === "Hawaii") {
      lon = HI_INSET[0] + (lon - HI_REAL[0]) * (HI_INSET[2] - HI_INSET[0]) / (HI_REAL[2] - HI_REAL[0]);
      lat = HI_INSET[1] + (lat - HI_REAL[1]) * (HI_INSET[3] - HI_INSET[1]) / (HI_REAL[3] - HI_REAL[1]);
    }
    // Through the same wobble as the outlines, so a coastal city moves with its coast.
    return wobble(...mapProjection().project(lon, lat));
  }

  // Drawn by hand, not plotted: every outline wanders a little, the way a
  // marker line does. The wobble is a smooth function of position, so two
  // states sharing a border bend it identically, and it's baked into the path
  // once. (It used to be an SVG filter, which re-rendered the whole map on
  // every frame of a zoom — about 10fps.)
  const WOBBLE = 1.3, STEP = 7;   // map units: amplitude, and the longest unbent run
  const wobble = (x, y) => [
    x + WOBBLE * (Math.sin(x * .071 + y * .043 + 1.3) + .6 * Math.sin(x * .023 - y * .067 + 4.1)) / 1.6,
    y + WOBBLE * (Math.sin(x * .052 - y * .061 + 2.2) + .6 * Math.sin(y * .029 - x * .037 + .7)) / 1.6,
  ];
  // Long straight borders (Colorado is four points) are cut into short runs
  // first, or the wobble would only move their corners.
  function wobbleRing(pts) {
    const out = [];
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / STEP));
      for (let t = 0; t < n; t++) {
        if (i === pts.length - 1 && t > 0) break;   // the closing edge is drawn by Z
        out.push(wobble(p[0] + (q[0] - p[0]) * t / n, p[1] + (q[1] - p[1]) * t / n));
      }
    });
    return out;
  }

  // Each state's extent and drawn outline in map units, filled in by
  // buildMapSVG: the zoom frames the box, the state names are fitted to the rings.
  let stateBox = {}, stateRings = {};
  // The map is coloured in like a marker drawing: four markers, and no two
  // states that share a border in the same one. (Three can't do it: Nevada's
  // five neighbours form a ring, and an odd ring needs a fourth colour.)
  const MARKERS = 4;
  let markerOf = null;

  // Neighbours: walk every outline in short steps and note which states pass
  // through each small cell. Finds all 109 shared borders, Four Corners included.
  function neighbours() {
    const CELL = 1.5, cells = {}, near = {};
    Object.keys(stateRings).forEach((name) => {
      near[name] = new Set();
      stateRings[name].forEach((r) => r.forEach((p, i) => {
        const q = r[(i + 1) % r.length], steps = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / .75);
        for (let t = 0; t < steps; t++) {
          const k = Math.floor((p[0] + (q[0] - p[0]) * t / steps) / CELL) + "," +
            Math.floor((p[1] + (q[1] - p[1]) * t / steps) / CELL);
          (cells[k] = cells[k] || new Set()).add(name);
        }
      }));
    });
    Object.values(cells).forEach((s) => s.forEach((a) => s.forEach((b) => { if (a !== b) near[a].add(b); })));
    return near;
  }

  // Backtracking, always taking next the state with the fewest markers left
  // open to it, and trying the least-used marker first so the colours mix evenly.
  function colourStates() {
    if (markerOf) return markerOf;
    const near = neighbours(), names = Object.keys(near), out = {}, used = new Array(MARKERS).fill(0);
    const open = (n) => [...used.keys()].filter((c) => ![...near[n]].some((o) => out[o] === c));
    const solve = () => {
      const left = names.filter((n) => out[n] == null);
      if (!left.length) return true;
      const n = left.reduce((a, b) => (open(b).length < open(a).length ||
        (open(b).length === open(a).length && near[b].size > near[a].size) ? b : a));
      for (const c of open(n).sort((a, b) => used[a] - used[b] || a - b)) {
        out[n] = c; used[c]++;
        if (solve()) return true;
        delete out[n]; used[c]--;
      }
      return false;
    };
    solve();
    return (markerOf = out);
  }

  // Alaska and Hawaii are moved-in pieces, not neighbours of anything; a zoomed
  // view, which runs on past its frame, mustn't show them beside Arizona.
  const INSETS = new Set(["Alaska", "Hawaii"]);

  function buildMapSVG() {
    const geo = DATA.geo;
    const { project, VBW, VBH } = mapProjection();
    let paths = "", overlays = "";
    const drawn = [];
    for (const name in geo) {
      let d = "", sx = 0, sy = 0, n = 0;
      const box = [Infinity, Infinity, -Infinity, -Infinity];
      stateRings[name] = [];
      for (const ring of geo[name]) {
        if (!ring.length) continue;
        const pts = wobbleRing(ring.map((p) => project(p[0], p[1])));
        stateRings[name].push(pts);
        d += pts.map(([x, y], i) => {
          sx += x; sy += y; n++;
          if (x < box[0]) box[0] = x;
          if (y < box[1]) box[1] = y;
          if (x > box[2]) box[2] = x;
          if (y > box[3]) box[3] = y;
          return (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
        }).join(" ") + " Z ";
      }
      stateBox[name] = box;
      drawn.push({ name, d: d.trim(), sx, sy, n });
    }
    // Colouring needs every outline, so the paths are written in a second pass.
    const marker = colourStates();
    for (const { name, d, sx, sy, n } of drawn) {
      if (!stateByName[name]) {
        paths += `<path class="dead" d="${d}"></path>`;
        continue;
      }

      const inset = INSETS.has(name) ? " inset" : "";
      paths += `<path class="live m${marker[name]}${inset}" data-state="${esc(name)}" tabindex="0" role="button"` +
        ` aria-label="${esc(name)}" d="${d}"></path>`;

      // DC renders a couple of pixels wide — unhittable. Give it a labelled
      // callout dot out over the Atlantic, wired to the same handlers.
      if (name === "District of Columbia" && n) {
        const cx = sx / n, cy = sy / n, tx = cx + 46, ty = cy + 26;
        overlays +=
          `<line class="callout-line" x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}"></line>` +
          `<g class="callout m${marker[name]}" data-state="${esc(name)}" tabindex="0" role="button" aria-label="District of Columbia">` +
          `<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="11"></circle>` +
          `<text x="${tx.toFixed(1)}" y="${(ty + 3.6).toFixed(1)}">DC</text></g>`;
      }
    }
    return `<svg class="usmap" viewBox="0 0 ${VBW} ${VBH}" role="img" aria-label="US map — pick a state to see its law schools">` +
      `<g>${paths}</g>${overlays}<g class="names" aria-hidden="true"></g><g class="pins"></g></svg>`;
  }

  // ---------- state names ----------
  // Each state's postal code, lettered in the same marker as the headings, at
  // its roomiest interior point. One size everywhere; a state too small for it
  // takes a smaller one, and one too small even for that (RI, DE…) gets its
  // code written out in the ocean beside it with a leader line, the way DC is.
  const CODE_SIZE = 15, READABLE = 8.5, OUT_SIZE = 10;   // map units
  // Placed by eye where the roomiest point doesn't sit where you'd letter it
  // (California's is down by the Tehachapis). Map units, right and down.
  const NAME_NUDGE = { "North Carolina": [0, -4], California: [-10, -28], Michigan: [-7, 0], Illinois: [5, 0] };
  let nameLayout = null;

  // Even-odd point-in-polygon, and the distance to the nearest edge.
  function insideRings(rings, x, y) {
    let inside = false;
    for (const r of rings) {
      for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
        const [x1, y1] = r[i], [x2, y2] = r[k];
        if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) inside = !inside;
      }
    }
    return inside;
  }
  function edgeDistance(rings, x, y) {
    let best = Infinity;
    for (const r of rings) {
      for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
        const [x1, y1] = r[k], dx = r[i][0] - x1, dy = r[i][1] - y1;
        const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(x - x1 - t * dx, y - y1 - t * dy));
      }
    }
    return best;
  }

  // The interior point farthest from any edge: a coarse grid over the box,
  // then a finer one around the winner.
  function roomiest(rings, box) {
    let best = null, bd = -1;
    const search = (x0, y0, w, h, n) => {
      for (let i = 0; i <= n; i++) {
        for (let k = 0; k <= n; k++) {
          const x = x0 + w * i / n, y = y0 + h * k / n;
          if (!insideRings(rings, x, y)) continue;
          const d = edgeDistance(rings, x, y);
          if (d > bd) { bd = d; best = [x, y]; }
        }
      }
    };
    const w = box[2] - box[0], h = box[3] - box[1];
    search(box[0], box[1], w, h, 24);
    if (best) search(best[0] - w / 24, best[1] - h / 24, w / 12, h / 12, 12);
    return best && { x: best[0], y: best[1], r: bd };
  }

  // The stretch of land a horizontal line at y crosses around x.
  function spanAt(rings, x, y) {
    const xs = [];
    for (const r of rings) {
      for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
        const [x1, y1] = r[i], [x2, y2] = r[k];
        if ((y1 > y) !== (y2 > y)) xs.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i] <= x && x <= xs[i + 1]) return [xs[i], xs[i + 1]];
    return [x, x];
  }

  // How wide a run of text is at size 10, in the marker font.
  function measurer(svg) {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("class", "sname");
    t.setAttribute("font-size", "10");
    svg.appendChild(t);
    return {
      width: (s) => { t.textContent = s; return t.getComputedTextLength(); },
      done: () => t.remove(),
    };
  }

  function layoutNames(svg) {
    const m = measurer(svg), out = [], outside = [];
    Object.keys(stateByName).forEach((name) => {
      if (name === "District of Columbia") return;   // has its own callout
      const rings = stateRings[name], box = stateBox[name];
      // Alaska's and Hawaii's island chains would pull the box's search off the mainland.
      const c = rings && roomiest(rings, box);
      if (!c) return;
      // Centred either on the stretch of land through that point or on the
      // point itself, whichever fits bigger; sized to the narrowest of three
      // lines across the text's height.
      const [a0, b0] = spanAt(rings, c.x, c.y);
      const fits = (w10, fs, x) => {
        const room = Math.min(...[-.34, 0, .34].map((f) => {
          const [a, b] = spanAt(rings, x, c.y + f * fs);
          return Math.min(x - a, b - x) * 2;
        }));
        return w10 * fs / 10 <= room * .9 && fs <= c.r * 2.4;
      };
      const place = (text, lo, hi) => {
        const w10 = m.width(text);
        for (let fs = hi; fs >= lo; fs -= 0.5) {
          for (const x of [(a0 + b0) / 2, c.x]) {
            if (fits(w10, fs, x)) {
              const [nx, ny] = NAME_NUDGE[name] || [0, 0];
              out.push({ name, text, x: x + nx, y: c.y + ny, fs });
              return true;
            }
          }
        }
        return false;
      };
      const abbr = stateByName[name].abbr;
      if (!place(abbr, READABLE, CODE_SIZE)) outside.push({ name, text: abbr, ax: c.x, ay: c.y });
    });

    // Callouts sit just past the coast at their own height, then get pushed
    // apart so none overlap each other or DC's circle.
    // The coast is the last land crossed going east from a state at that
    // height, looking no further than its near neighbours.
    const live = Object.keys(stateByName).map((n) => stateRings[n]).filter(Boolean);
    const coastAt = (y, from) => {
      let mx = from;
      live.forEach((rings) => rings.forEach((r) => {
        for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
          const [x1, y1] = r[i], [x2, y2] = r[k];
          if ((y1 > y) === (y2 > y)) continue;
          const x = x1 + (y - y1) * (x2 - x1) / (y2 - y1);
          if (x > mx && x < from + 90) mx = x;
        }
      }));
      return mx;
    };
    const dc = app.querySelector("svg.usmap g.callout circle");
    const taken = dc ? [[+dc.getAttribute("cy") - 13, +dc.getAttribute("cy") + 13]] : [];
    outside.sort((a, b) => a.ay - b.ay).forEach((o) => {
      let y = o.ay;
      for (const [a, b] of taken.sort((p, q) => p[0] - q[0])) {
        if (y + OUT_SIZE * .7 > a && y - OUT_SIZE * .7 < b) y = b + OUT_SIZE * .75;
      }
      taken.push([y - OUT_SIZE * .7, y + OUT_SIZE * .7]);
      const x = Math.max(coastAt(y, o.ax), coastAt(o.ay, o.ax)) + 20;
      const w = m.width(o.text) * OUT_SIZE / 10;
      out.push({ name: o.name, text: o.text, x: x + w / 2, y, fs: OUT_SIZE, w, ax: o.ax, ay: o.ay });
    });
    m.done();
    return out;
  }

  // Layout waits for the marker font: measured in the fallback, every fit is wrong.
  function drawNames(svg) {
    const layer = svg.querySelector("g.names");
    const paint = () => {
      if (!svg.isConnected) return;
      nameLayout = nameLayout || layoutNames(svg);
      layer.innerHTML = nameLayout.map((l) =>
        (l.ax == null ? "" : `<line class="sname-lead" x1="${l.ax.toFixed(1)}" y1="${l.ay.toFixed(1)}"
            x2="${(l.x - l.w / 2 - 2).toFixed(1)}" y2="${l.y.toFixed(1)}"></line>`) +
        `<text class="sname m${markerOf[l.name]}${l.ax == null ? "" : " out"}" x="${l.x.toFixed(1)}" y="${(l.y + l.fs * .36).toFixed(1)}"
          font-size="${l.fs}">${esc(l.text)}</text>`).join("");
    };
    if (nameLayout) paint();
    else document.fonts.load(`10px "Permanent Marker"`).then(paint, paint);
  }

  // ---------- drawn by hand: bars ----------
  // Every bar is drawn as SVG at its real pixel size, so the marker
  // keeps one weight and the hatching one slant however wide the thing gets.
  // The wobble is seeded from what's drawn, so a redraw lands the same strokes.
  //   .track[data-fill]   a rail scribbled in from the left
  //   .track[data-pin]    a rail, their 25th-75th hatched in the middle, a tick for you
  //   [data-split]        admit / waitlist / deny, scribbled / hatched / left blank
  const DRAWN = ".track, [data-split]";
  const fx = (n) => n.toFixed(1);

  function seeded(str) {
    let s = [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) || 1;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  }

  // One quick stroke from a to b: bowed a little, and overshooting the ends the
  // way a line by hand never quite lands on the corner.
  function handLine(r, x1, y1, x2, y2, wob) {
    const j = (k) => (r() - .5) * k;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const over = Math.min(4, len * .05);
    const ax = x1 - ux * over * r() + j(wob), ay = y1 - uy * over * r() + j(wob);
    const bx = x2 + ux * over * r() + j(wob), by = y2 + uy * over * r() + j(wob);
    const bend = j(wob * 1.8 + len * .012);
    const mx = (ax + bx) / 2 - uy * bend, my = (ay + by) / 2 + ux * bend;
    return `M${fx(ax)} ${fx(ay)}Q${fx(mx)} ${fx(my)} ${fx(bx)} ${fx(by)}`;
  }

  // A box gone round twice, never twice the same way.
  function handBox(r, x, y, w, h, wob) {
    let d = "";
    for (let pass = 0; pass < 2; pass++) {
      d += handLine(r, x, y, x + w, y, wob) + handLine(r, x + w, y, x + w, y + h, wob) +
        handLine(r, x + w, y + h, x, y + h, wob) + handLine(r, x, y + h, x, y, wob);
    }
    return d;
  }

  // Colouring in with a marker: one zigzag stroke, back and forth on a slant,
  // spilling a hair past the top and bottom.
  function scribble(r, x0, x1, y0, y1, gap, dir = 1) {
    if (x1 - x0 < 1.5) return "";
    const slant = (y1 - y0) * .6 * dir, clamp = (x) => Math.max(x0, Math.min(x1, x));
    let d = "", x = x0 - Math.max(0, slant), bottom = true;
    while (x <= x1 + Math.abs(slant)) {
      const y = bottom ? y1 + (r() - .3) * 1.4 : y0 - (r() - .3) * 1.4;
      const px = clamp(bottom ? x : x + slant);
      d += `${d ? "L" : "M"}${fx(px)} ${fx(y)}`;
      if (!bottom) x += gap * (.8 + r() * .4);
      bottom = !bottom;
    }
    return d;
  }

  function sketch(el) {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    const r = seeded(el.className + JSON.stringify(el.dataset) + w);
    const path = (cls, d) => (d ? `<path class="${cls}" d="${d}"/>` : "");
    let ink = "";
    if (el.dataset.split) {
      const [a, wt] = el.dataset.split.split(",").map((v) => (+v / 100) * w);
      const tiny = h < 12;
      ink = path("hd-fill", scribble(r, 0, a, 1, h - 1, tiny ? 2.6 : 4)) +
        path("hd-hatch", scribble(r, a, a + wt, 1, h - 1, tiny ? 3.2 : 6, -1)) +
        path("hd-rail", handBox(r, 0, 0, w, h, tiny ? .4 : .9) +
          [a, a + wt].filter((x) => x > 2 && x < w - 2)
            .map((x) => handLine(r, x, 0, x, h, .6)).join(""));
    } else {
      ink = path("hd-rail", handBox(r, 0, 0, w, h, .8));
      if (el.dataset.fill != null) {
        ink = path("hd-fill", scribble(r, 0, +el.dataset.fill * w, 1, h - 1, Math.max(3, h * .38))) + ink;
      } else if (el.dataset.pin != null) {
        const x = +el.dataset.pin * w;
        ink = path("hd-hatch hd-band", scribble(r, w * .25, w * .75, 1, h - 1, Math.max(3.5, h * .5))) + ink +
          path("hd-pin", handLine(r, x, -5, x + 1, h + 5, .5) + handLine(r, x - 1, -4, x, h + 4, .5));
      }
    }
    const old = el.querySelector(":scope > svg.hd");
    if (old) old.remove();
    el.insertAdjacentHTML("afterbegin",
      `<svg class="hd" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${ink}</svg>`);
  }

  // Draw whatever arrives in #app, and redraw it whenever its size changes:
  // fonts landing, a window resize, a panel opening.
  const sketchSize = new ResizeObserver((entries) => entries.forEach((e) => sketch(e.target)));
  const drawnIn = (n) => (n.nodeType !== 1 ? [] : [...(n.matches(DRAWN) ? [n] : []), ...n.querySelectorAll(DRAWN)]);
  new MutationObserver((muts) => muts.forEach((m) => {
    m.addedNodes.forEach((n) => drawnIn(n).forEach((el) => sketchSize.observe(el)));
    m.removedNodes.forEach((n) => drawnIn(n).forEach((el) => sketchSize.unobserve(el)));
  })).observe(app, { childList: true, subtree: true });

  // ---------- views + history ----------
  // Results, state and school pages ask for `wide` and spread across the screen;
  // the rest keep a reading column. The map asks for more again (`full`), and
  // renderHome sets that itself.
  function setView(html, wide) {
    app.classList.remove("full");
    app.classList.toggle("roomy", !!wide);
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
    // Moving between states (or back out) on a map that's already up zooms it
    // in place; arriving from another view draws it fresh.
    map: (v) => (app.querySelector(".board") ? focusState(v.name, true) : renderHome(v.name)),
    fit: () => renderFit(),
    results: () => renderResults(),
    state: (v) => renderState(v.name),
    school: (v) => renderSchool(v.name),
    list: (v) => renderList(v),
  };

  function go(view, replace) {
    const y = window.scrollY, from = currentView;
    if (from && from.kind === "results") resultsScroll = y;
    currentView = view;
    history[replace ? "replaceState" : "pushState"](view, "");
    if (replace) {
      render(view);
      window.scrollTo({ top: y, behavior: "auto" });
    } else panTo(from, view);
  }

  window.addEventListener("popstate", (e) => {
    // Closing a folder steps back off its history entry by itself.
    if (skipPop) { skipPop = false; return; }
    if (currentView && currentView.kind === "results") resultsScroll = window.scrollY;
    const view = e.state && RENDERERS[e.state.kind] ? e.state : { kind: "map" };
    const from = currentView;
    currentView = view;
    panTo(from, view);
  });

  // The body carries the view's kind so the CSS can adjust the chrome per page.
  function render(view) {
    document.body.dataset.view = view.kind;
    RENDERERS[view.kind](view);
  }

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
    const fromFit = view.kind === "results" || view.fit;
    crumbLinks = [fromFit
      ? { label: "Find your fit", view: { kind: "fit" } }
      : { label: "Explore by state", view: { kind: "map" } }];
    if (view.fit) crumbLinks.push({ label: "Your schools", view: { kind: "results" } });
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


  // ---------- fit page ----------
  // The form is two blanks on the board, a GPA and an LSAT, with everything
  // else folded away under "add more". Anything you pick there is written in
  // blue marker.
  let moreOpen = false;   // survives re-renders, not reloads
  const SL_WORDS = ["Ignore", "A little", "Matters", "Priority"];
  const RING = `<svg class="ring" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M9 21C5 9 38 3 61 4c25 1 37 10 34 20-3 11-35 14-57 12C15 34 2 27 9 14c4-7 15-10 24-10"/></svg>`;


  const ARROW = `<span class="heard-arrow" aria-hidden="true">→</span>`;
  const pickWord = (label, attr, value, on) => `<button type="button" class="word${on ? " on" : ""}" ${attr}="${esc(value)}"
    aria-pressed="${on}">${esc(label)}</button>`;
  const regionOn = (r) => {
    const known = (REGIONS[r] || []).filter((s) => stateByName[s]);
    return known.length > 0 && known.every((s) => profile.states.indexOf(s) !== -1);
  };
  const stateWordsHTML = () => profile.states
    .map((s) => `<button type="button" class="word on" data-unstate="${esc(s)}" aria-label="Remove ${esc(s)}">${esc(s)}</button>`)
    .join("");

  function renderFit() {

    const careRows = FACTORS.map((f) => {
      const v = profile.factors[f.key] || 0;
      const opts = SL_WORDS.map((w, i) => `<label class="tick"><input type="radio" name="pf-${f.key}"
          value="${i}" data-factor="${f.key}"${i === v ? " checked" : ""}><span>${w}${RING}</span></label>`).join("");
      return `<div class="care-row" role="radiogroup" aria-label="${esc(f.label)}">
          <span class="care-label">${esc(f.label)}</span><span class="care-opts">${opts}</span>
        </div>`;
    }).join("");

    const num = (v) => (v == null ? "" : v);

    setView(`
      <section class="fitpage" id="fitForm">
        <div class="fit-hero">
          <input class="blank" id="pfGpa" type="number" step="0.01" min="1" max="4.33"
            placeholder="GPA" aria-label="GPA" value="${num(profile.gpa)}">
          <input class="blank" id="pfLsat" type="number" step="1" min="120" max="180"
            placeholder="LSAT" aria-label="LSAT" value="${num(profile.lsat)}">
        </div>

        <details class="more" id="pfMore"${moreOpen ? " open" : ""}>
          <summary><span class="more-plus" aria-hidden="true">+</span> add more
            <span class="more-set" id="pfMoreSet"></span></summary>
          <div class="more-body">
            <div class="more-block">
              <p class="mad">I'd pay up to <span class="nowrap">$<input class="blank" id="pfMaxTuition" type="number" step="1000" min="0"
                  placeholder="no limit" aria-label="Maximum tuition per year" style="--w:6.4ch"
                  value="${num(profile.maxTuition)}"></span> a year in tuition, and I'm a resident of
                <input class="blank blank-grow" id="pfResidency" type="text" placeholder="your state" style="--w:8ch"
                  aria-label="State residency" aria-describedby="pfResHint" autocomplete="address-level1"
                  value="${esc(profile.residency)}">.</p>
              <p class="heard" id="pfResHint"></p>
            </div>

            <div class="more-block">
              <p class="mad">After graduating, I'd like to end up in…</p>
              <div class="words" id="pfGoals">${GOALS.map((g) => pickWord(g.label, "data-goal", g.key, !!profile.goals[g.key])).join("")}</div>
            </div>

            <div class="more-block">
              <p class="mad">…somewhere around…</p>
              <div class="words" id="pfRegions">${Object.keys(REGIONS).map((r) => pickWord(r, "data-region", r, regionOn(r))).join("")}</div>
              <p class="mad mad-small">or a state: <input class="blank blank-grow" id="pfStateAdd" type="text" placeholder="type one"
                  style="--w:7ch" aria-label="Add a state" aria-describedby="pfStateHint"></p>
              <p class="heard" id="pfStateHint"></p>
              <div class="words" id="pfStates">${stateWordsHTML()}</div>
            </div>

            <div class="more-block">
              <p class="mad">And how much do I care about…</p>
              <div class="care">${careRows}</div>
            </div>
          </div>
        </details>

        <div class="pf-actions">
          <button class="btn-go" id="pfGo" type="button">Show my schools
            <svg viewBox="0 0 34 16" aria-hidden="true"><path d="M2 9c8-3 18 2 28-1M23 2.5l8 5.5-7 6"/></svg></button>
          <button class="linkbtn" id="pfReset" type="button">erase it all</button>
        </div>
      </section>`);
    wireFit();
  }

  // How many of the four folded-away questions have an answer.
  const moreAnswered = () => [
    profile.maxTuition != null || !!profile.residency,
    Object.values(profile.goals).some((w) => w > 0),
    profile.states.length > 0,
    Object.values(profile.factors).some((w) => w > 0),
  ].filter(Boolean).length;

  function updateFitControls() {
    const set = document.getElementById("pfMoreSet");
    if (set) { const n = moreAnswered(); set.textContent = n ? `· ${n} of 4 filled in` : ""; }
    const reset = document.getElementById("pfReset");
    if (reset) reset.hidden = profile.gpa == null && profile.lsat == null && !moreAnswered();
    const btn = document.getElementById("pfGo");
    if (btn) btn.disabled = !profileReady();
  }

  function wireFit() {
    const form = document.getElementById("fitForm");

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
        updateFitControls();
      });
    };
    numField("pfGpa", "gpa", parseFloat, 1, 4.33);
    numField("pfLsat", "lsat", (v) => parseInt(v, 10), 120, 180);
    numField("pfMaxTuition", "maxTuition", (v) => parseInt(v, 10), 0, 500000);
    ["pfGpa", "pfLsat"].forEach((id) => document.getElementById(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") openResults();
    }));
    document.getElementById("pfMore").addEventListener("toggle", (e) => { moreOpen = e.target.open; });

    // Residency is typed. While typing, show which state it's being read as;
    // on leaving the field, swap in the proper spelling.
    const resIn = document.getElementById("pfResidency");
    const resHint = document.getElementById("pfResHint");
    resIn.addEventListener("input", () => {
      const typed = resIn.value.trim();
      profile.residency = resolveState(typed);
      resIn.classList.toggle("bad", !!typed && !profile.residency);
      resHint.innerHTML = !typed || profile.residency.toLowerCase() === typed.toLowerCase() ? ""
        : profile.residency ? `${ARROW}<span class="heard-miss">${esc(profile.residency)}</span>`
        : `<span class="heard-miss">That isn't a state I recognise.</span>`;
      persistProfile(); updateFitControls();
    });
    resIn.addEventListener("change", () => {
      if (profile.residency) { resIn.value = profile.residency; resHint.innerHTML = ""; }
    });

    // Goals and regions: one tap writes them in blue, another rubs them out.
    form.querySelectorAll("[data-goal]").forEach((el) => {
      el.addEventListener("click", () => {
        const k = el.getAttribute("data-goal");
        if (profile.goals[k]) delete profile.goals[k]; else profile.goals[k] = 1;
        el.classList.toggle("on", !!profile.goals[k]);
        el.setAttribute("aria-pressed", !!profile.goals[k]);
        persistProfile(); updateFitControls();
      });
    });

    const redrawStates = () => {
      document.getElementById("pfStates").innerHTML = stateWordsHTML();
      form.querySelectorAll("[data-region]").forEach((el) => {
        const on = regionOn(el.getAttribute("data-region"));
        el.classList.toggle("on", on); el.setAttribute("aria-pressed", on);
      });
      persistProfile(); updateFitControls();
    };
    document.getElementById("pfStates").addEventListener("click", (e) => {
      const el = e.target.closest("[data-unstate]");
      if (!el) return;
      profile.states = profile.states.filter((s) => s !== el.getAttribute("data-unstate"));
      redrawStates();
    });
    form.querySelectorAll("[data-region]").forEach((el) => {
      el.addEventListener("click", () => {
        const r = el.getAttribute("data-region");
        const known = REGIONS[r].filter((s) => stateByName[s]);
        if (regionOn(r)) profile.states = profile.states.filter((s) => known.indexOf(s) === -1);
        else known.forEach((s) => { if (profile.states.indexOf(s) === -1) profile.states.push(s); });
        redrawStates();
      });
    });

    // Adding a state by name: the states that fit what's typed so far are offered
    // under the blank, one tap (or Enter, for the first) adds it. Leaving the
    // field adds it too, if what's there spells out a state.
    const addIn = document.getElementById("pfStateAdd");
    const addHint = document.getElementById("pfStateHint");
    let offered = [];
    const addState = (name) => {
      if (!name) return;
      if (profile.states.indexOf(name) === -1) profile.states.push(name);
      addIn.value = ""; addHint.innerHTML = ""; offered = [];
      addIn.classList.remove("bad");
      redrawStates();
    };
    addIn.addEventListener("input", () => {
      const typed = addIn.value.trim();
      offered = suggestStates(typed).filter((s) => profile.states.indexOf(s) === -1);
      addIn.classList.toggle("bad", !!typed && !suggestStates(typed).length);   // red only if it fits no state at all
      addHint.innerHTML = offered.length ? ARROW + offered.map((s) =>
        `<button type="button" class="word" data-addstate="${esc(s)}">${esc(s)}</button>`).join("") : "";
    });
    // mousedown would take focus off the blank first, and its change handler would
    // add whatever half-word is typed before the click lands.
    addHint.addEventListener("mousedown", (e) => { if (e.target.closest("[data-addstate]")) e.preventDefault(); });
    addHint.addEventListener("click", (e) => {
      const el = e.target.closest("[data-addstate]");
      if (el) { addState(el.getAttribute("data-addstate")); addIn.focus(); }
    });
    addIn.addEventListener("change", () => addState(resolveState(addIn.value)));
    addIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addState(offered[0] || resolveState(addIn.value)); }
    });

    form.querySelectorAll("[data-factor]").forEach((el) => {
      el.addEventListener("change", () => {
        profile.factors[el.getAttribute("data-factor")] = parseInt(el.value, 10) || 0;
        persistProfile(); updateFitControls();
      });
    });

    document.getElementById("pfGo").addEventListener("click", openResults);
    document.getElementById("pfReset").addEventListener("click", () => {
      profile = blankProfile();
      persistProfile();
      go({ kind: "fit" }, true);
    });

    updateFitControls();
  }

  function openResults() {
    if (!profileReady()) return;
    // A fresh search is a fresh list: don't carry over where you were sitting in
    // the last one, or which of its bands you'd expanded.
    resultsScroll = 0;
    expandedBands = {};
    go({ kind: "results" });
  }

  // Every page has its own spot on one big whiteboard, so moving between pages
  // pans the camera, and Back pans the same way in reverse. Going deeper heads
  // right; the fit trail sits up top, the map trail below it, the list off left.
  function spot(v) {
    if (v.kind === "school") return [2, v.fit ? 1 : 3];
    return { fit: [0, 0], results: [1, 1], map: [0, 2], state: [1, 3], list: [-1, 1] }[v.kind];
  }
  // Set by the arrow keys for the next pan: the board still decides up or down,
  // but the camera always heads the way the key points.
  let panSide = 0;

  // Render the new page and, if it replaced the old one, pan over to it: the old
  // page slides off one screen per axis and the new one comes in, already up on
  // the board, while the old smudges drift past with them. The glare stays put,
  // the way a reflection would. Moving around the map in place, or arriving with
  // no page before, just renders.
  function panTo(from, view) {
    const old = app.firstElementChild;
    const r = old && old.getBoundingClientRect();
    render(view);
    const fresh = app.firstElementChild;
    if (!from || !old || old.isConnected || REDUCED.matches) return;

    const a = spot(from), b = spot(view);
    let dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]);
    if (!dx && !dy) dx = 1;       // one school to the next, written just along from it
    if (panSide) { dx = panSide; dy = dy || 1; panSide = 0; }
    fresh.style.animation = "none";
    // Pin the old page where it sat on screen; the new one has already scrolled.
    Object.assign(old.style, {
      position: "fixed", top: r.top + "px", left: r.left + "px", width: r.width + "px",
      margin: "0", pointerEvents: "none", animation: "none",
    });
    app.appendChild(old);

    // A full screen per axis keeps the repeating smudges seamless when the pan ends.
    const x = -dx * window.innerWidth, y = -dy * window.innerHeight;
    const opts = { duration: 700, easing: "cubic-bezier(0, 0, .25, 1)" };
    const root = document.documentElement.style;
    root.overflowX = "clip";
    old.animate([{ transform: "none" }, { transform: `translate(${x}px, ${y}px)` }], opts);
    fresh.animate([{ transform: `translate(${-x}px, ${-y}px)` }, { transform: "none" }], opts);
    document.body.animate([
      { backgroundPosition: "0 0, 0 0, 0 0" },
      { backgroundPosition: `0 0, ${x}px ${y}px, ${x}px ${y}px` },
    ], opts).onfinish = () => {
      old.remove();
      root.overflowX = "";
    };
  }

  const SKIP_INK = ["pointerdown", "wheel", "keydown", "touchstart"];

  // The pieces a hand would write, in reading order: anything carrying its own
  // text is written whole, and bars, fields and drawings are one stroke each.
  function inkPieces(el, out = []) {
    for (const c of el.children) {
      const own = [...c.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (own || c.matches(".track, svg, input, select, textarea, img")) out.push(c);
      else inkPieces(c, out);
    }
    return out;
  }

  // Writes out whatever's on screen, piece by piece, as if in marker. A real hand
  // would take far longer, so the pace is squeezed to fit three seconds at most,
  // and any click, scroll or key skips to the end.
  function writeUp(view) {
    view.style.visibility = "";
    const strokes = [];
    for (let el of inkPieces(view)) {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height || box.bottom < 0 || box.top > window.innerHeight) continue;
      // Folded-away content (the closed "add more") still has a size; don't write it.
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      el = inkOnly(el);
      if (!el) continue;
      strokes.push({ el, ...strokeFrames(el) });
    }
    if (!strokes.length) return;
    const ink = strokes.reduce((t, s) => t + s.len, 0);
    const lift = Math.min(60, 800 / strokes.length);      // pen off the board between pieces
    const speed = Math.max(0.8, ink / (3000 - lift * strokes.length));   // px per ms

    const anims = [];
    let at = 0;
    strokes.forEach(({ el, frames, len }) => {
      const duration = len / speed;
      anims.push(el.animate(frames, { duration, delay: at, fill: "backwards" }));
      at += duration + lift;
    });

    const done = () => {
      anims.forEach((a) => a.finish());
      SKIP_INK.forEach((t) => window.removeEventListener(t, done));
    };
    SKIP_INK.forEach((t) => window.addEventListener(t, done, { passive: true }));
    anims[anims.length - 1].finished.then(done, () => {});
  }

  // Text sitting on its own box (a folder tab, a filled button) is written onto
  // the box rather than dragging it in: the letters get wrapped in a plain span
  // and that's what gets uncovered. A flex or grid box would lay out differently
  // with a wrapper, so it just appears whole, and so does anything you can't wrap.
  function inkOnly(el) {
    if (el.matches(".track, svg, input, select, textarea, img")) return el;
    const cs = getComputedStyle(el);
    const boxed = parseFloat(cs.borderTopWidth) || parseFloat(cs.borderBottomWidth) ||
      !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor);
    if (!boxed) return el;
    if (/flex|grid/.test(cs.display)) return null;
    const span = document.createElement("span");
    span.append(...el.childNodes);
    el.append(span);
    return span;
  }

  // Clip keyframes that uncover an element's text a line at a time, left to
  // right at an even pace, the way a marker crosses the board. Something with
  // no text (a range bar) is one stroke across its box.
  function strokeFrames(el) {
    const box = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    // Text and inline children come back as overlapping fragments; fold them into
    // lines. A bar's empty marker spans aren't text, so a bar is just its box.
    const lines = [];
    const text = el.textContent.trim() && !(el instanceof SVGElement);
    for (const r of text ? range.getClientRects() : []) {
      if (!r.width) continue;
      const l = lines.find((l) => r.top < l.bottom - 2 && r.bottom > l.top + 2);
      if (l) Object.assign(l, { left: Math.min(l.left, r.left), right: Math.max(l.right, r.right),
        top: Math.min(l.top, r.top), bottom: Math.max(l.bottom, r.bottom) });
      else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    if (!lines.length) lines.push({ left: box.left, right: box.right, top: box.top, bottom: box.bottom });
    lines.sort((a, b) => a.top - b.top);

    // Every line before this one is written, and this one is written up to x.
    // The pad leaves room for marker strokes that spill past the text box.
    const P = 8, W = box.width;
    const clip = (i, x) => {
      const t = i ? lines[i - 1].bottom - box.top : -P, b = lines[i].bottom - box.top + P;
      return `polygon(${-P}px ${-P}px, ${W + P}px ${-P}px, ${W + P}px ${t}px, ${x}px ${t}px, ${x}px ${b}px, ${-P}px ${b}px)`;
    };
    const len = lines.reduce((t, l) => t + l.right - l.left, 0) || 1;
    const frames = [];
    let done = 0;
    lines.forEach((l, i) => {
      frames.push({ offset: done / len, clipPath: clip(i, l.left - box.left) });
      done += l.right - l.left;
      frames.push({ offset: done / len, clipPath: clip(i, l.right - box.left) });
    });
    return { frames, len };
  }

  // ---------- home: the map on the board ----------
  // The whole country until you click a state. Then the map closes in on it,
  // drops a pin on every city with a law school, and the panel beside it lists
  // them. Before that, pointing at a state writes its card into the panel.
  let mapFocus = null;      // the state the map is zoomed into, or null
  let zoomFrame = 0;

  function renderHome(name) {
    setView(`
      <div class="board">
        <div class="mapwrap">${buildMapSVG()}</div>
        <aside class="statecard" id="stateCard" aria-live="polite"></aside>
      </div>`, true);
    app.classList.add("full");
    drawNames(app.querySelector("svg.usmap"));
    wireMap();
    focusState(name, false);
  }

  const openState = (name) => { if (name !== mapFocus) go({ kind: "map", name }); };
  const leaveState = () => { if (mapFocus) go({ kind: "map" }); };

  function wireMap() {
    const svg = app.querySelector("svg.usmap");
    const targets = app.querySelectorAll("svg path.live, svg g.callout");
    targets.forEach((el) => {
      const name = el.getAttribute("data-state");
      const enter = () => {
        targets.forEach((t) => t.classList.toggle("hot", t === el));
        if (!mapFocus) panelShow(name);
      };
      el.addEventListener("mouseenter", enter);
      el.addEventListener("focus", enter);
      el.addEventListener("click", (e) => { e.stopPropagation(); openState(name); });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openState(name); }
      });
    });

    const clear = () => {
      targets.forEach((t) => t.classList.remove("hot"));
      if (!mapFocus) panelShow();
    };
    svg.addEventListener("mouseleave", clear);
    // Open water zooms back out.
    svg.addEventListener("click", leaveState);
    targets.forEach((el) =>
      el.addEventListener("blur", () => { if (!app.contains(document.activeElement)) clear(); }));
  }

  // Frame a state with a margin, at the map's own aspect so nothing stretches,
  // and never closer than MIN_VIEW map units across — Rhode Island or DC at
  // full zoom would be three blocks of coastline and no context.
  const MIN_VIEW = 110;
  function viewFor(name) {
    const { VBW, VBH } = mapProjection();
    const b = name && stateBox[name];
    if (!b) return [0, 0, VBW, VBH];
    let w = Math.max((b[2] - b[0]) * 1.3, MIN_VIEW), h = (b[3] - b[1]) * 1.3;
    if (w / h < VBW / VBH) w = h * VBW / VBH; else h = w * VBH / VBW;
    return [(b[0] + b[2] - w) / 2, (b[1] + b[3] - h) / 2, w, h];
  }

  const setViewBox = (svg, v) => svg.setAttribute("viewBox", v.map((n) => n.toFixed(2)).join(" "));

  function focusState(name, animate) {
    const svg = app.querySelector("svg.usmap");
    if (!svg) return;
    mapFocus = stateByName[name] ? name : null;
    svg.classList.toggle("zoomed", !!mapFocus);
    svg.classList.toggle("in-inset", INSETS.has(mapFocus));
    app.querySelectorAll("svg [data-state]").forEach((el) => {
      el.classList.remove("hot");
      el.classList.toggle("sel", el.getAttribute("data-state") === mapFocus);
    });
    mapSel = null;
    drawDots(svg, null);
    panelShow();

    const to = viewFor(mapFocus);
    cancelAnimationFrame(zoomFrame);
    if (!animate || REDUCED.matches) { setViewBox(svg, to); drawDots(svg, mapFocus); return; }
    const vb = svg.viewBox.baseVal, from = [vb.x, vb.y, vb.width, vb.height];
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 560);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(2 - 2 * t, 3) / 2;
      setViewBox(svg, from.map((v, i) => v + (to[i] - v) * e));
      if (t < 1) zoomFrame = requestAnimationFrame(step);
      else drawDots(svg, mapFocus);
    };
    zoomFrame = requestAnimationFrame(step);
  }

  // Where a state's schools are, before you've picked one: a quiet dot per
  // city, no labels — DC's six schools are one dot. Dots and the pin hold one
  // on-screen size at any zoom: they're drawn in screen pixels and scaled
  // back into map units by k.
  let mapSel = null;        // the school whose pin is down
  const pxScale = (svg) => svg.viewBox.baseVal.width / svg.clientWidth;

  // The outlines are simplified, so a city right on the water (Malibu,
  // Honolulu, Bristol RI) can come out a few hundred metres offshore. Such a
  // point is pulled to the nearest stretch of its state's coast, a hair inland.
  const landXY = {};
  function onLand(sc) {
    const key = sc.city + "|" + sc.state;
    if (key in landXY) return landXY[key];
    let xy = schoolXY(sc);
    const path = xy && app.querySelector(`svg.usmap path[data-state="${CSS.escape(sc.state)}"]`);
    if (!path) return xy;
    const pt = path.ownerSVGElement.createSVGPoint();
    pt.x = xy[0]; pt.y = xy[1];
    if (!path.isPointInFill(pt)) {
      let best = null, bd = Infinity;
      for (let at = 0, len = path.getTotalLength(); at <= len; at += 0.25) {
        const q = path.getPointAtLength(at), d = (q.x - xy[0]) ** 2 + (q.y - xy[1]) ** 2;
        if (d < bd) { bd = d; best = q; }
      }
      const d = Math.sqrt(bd) || 1;
      xy = [best.x + (best.x - xy[0]) / d * 0.6, best.y + (best.y - xy[1]) / d * 0.6];
    }
    return (landXY[key] = xy);
  }

  function cityGroups(name) {
    const by = {};
    sortSchools(schoolsByState[name] || []).forEach((sc) => {
      const xy = onLand(sc);
      if (!xy) return;
      (by[sc.city] = by[sc.city] || { city: sc.city, xy, schools: [] }).schools.push(sc);
    });
    return Object.values(by);
  }

  function drawDots(svg, name) {
    const layer = svg.querySelector("g.pins");
    layer.innerHTML = "";
    if (!name) return;
    const k = pxScale(svg), groups = cityGroups(name);
    layer.innerHTML = groups.map((g) =>
      `<circle class="cdot" data-city="${esc(g.city)}" cx="${g.xy[0].toFixed(2)}" cy="${g.xy[1].toFixed(2)}"
        r="${(5 * k).toFixed(3)}" stroke-width="${(1.5 * k).toFixed(3)}"></circle>`).join("") +
      `<g class="droppin"></g>`;
    layer.querySelectorAll(".cdot").forEach((dot, i) => {
      const g = groups[i];
      dot.addEventListener("mouseenter", () => markCity(g.city));
      dot.addEventListener("mouseleave", () => markCity(null));
      // A dot picks its city's top school; the rest are right under it in the list.
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        selectSchool(g.schools[0].name);
        const row = app.querySelector(`.cs-row[data-school="${CSS.escape(g.schools[0].name)}"]`);
        if (row) row.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    });
  }

  // Picking a school drops its pin; picking it again lifts it.
  function selectSchool(name) {
    mapSel = mapSel === name ? null : name;
    app.querySelectorAll(".cs-row").forEach((r) => {
      const on = r.getAttribute("data-school") === mapSel;
      r.classList.toggle("on", on);
      r.setAttribute("aria-expanded", on);
    });
    dropPin(mapSel);
  }

  // The pin falls onto the school's city, lands with a little squash, and then
  // its label is written in. Its label goes on whichever side has room.
  function dropPin(name) {
    const svg = app.querySelector("svg.usmap");
    const slot = svg && svg.querySelector("g.droppin");
    if (!slot) return;
    const sc = name && schoolByName[name], xy = sc && onLand(sc);
    if (!xy) { slot.innerHTML = ""; return; }
    const st = stateByName[sc.state], k = pxScale(svg), vb = svg.viewBox.baseVal;
    slot.innerHTML = `
      <g transform="translate(${xy[0].toFixed(2)} ${xy[1].toFixed(2)}) scale(${k.toFixed(4)})">
        <ellipse class="dp-shadow" rx="9" ry="3"></ellipse>
        <g class="dp-fall">
          <path class="dp-head" d="M0 0C-4-7-11-12-11-20a11 11 0 1 1 22 0c0 8-7 13-11 20z"></path>
          <circle class="dp-eye" cx="0" cy="-20" r="4.4"></circle>
        </g>
        <g class="dp-lbl"><rect rx="6"></rect>
          <text><tspan class="dp-name">${esc(sc.name)}</tspan><tspan class="dp-city">${esc(sc.city)}, ${esc(st ? st.abbr : sc.state)}</tspan></text></g>
      </g>`;
    const text = slot.querySelector("text"), rect = slot.querySelector("rect");
    const [nameT, cityT] = text.querySelectorAll("tspan");
    const w = Math.max(nameT.getComputedTextLength(), cityT.getComputedTextLength()) + 20, h = 44;
    const sx = (xy[0] - vb.x) / k, sy = (xy[1] - vb.y) / k;
    const lx = sx + 16 + w > svg.clientWidth ? -16 - w : 16;
    const ly = sy - 50 < 0 ? 4 : -50;
    rect.setAttribute("x", lx); rect.setAttribute("y", ly);
    rect.setAttribute("width", w); rect.setAttribute("height", h);
    nameT.setAttribute("x", lx + 10); nameT.setAttribute("y", ly + 19);
    cityT.setAttribute("x", lx + 10); cityT.setAttribute("y", ly + 36);
  }

  // A dot and its schools in the panel light up together, whichever you point at.
  function markCity(city) {
    app.querySelectorAll(".cdot").forEach((d) => d.classList.toggle("hot", d.getAttribute("data-city") === city));
    app.querySelectorAll(".cs-row").forEach((r) =>
      r.classList.toggle("hot", r.getAttribute("data-city") === city));
  }

  // Written the way you'd letter a whiteboard with a fistful of markers:
  // each word picks up the next one.
  const markerWords = (text) => text.split(" ")
    .map((w, i) => `<span class="mk${i % MARKERS}">${esc(w)}</span>`).join(" ");

  function panelShow(hover) {
    const card = document.getElementById("stateCard");
    if (!card) return;
    if (mapFocus) { card.innerHTML = focusHTML(mapFocus); wirePanel(card); return; }
    card.innerHTML = hover && stateByName[hover] ? stateCardHTML(hover)
      : `<p class="card-hint card-idle">${markerWords(CAN_HOVER
        ? "Click a state to zoom in and see its law schools."
        : "Tap a state to zoom in and see its law schools.")}</p>`;
  }

  // The three factor scores, for every state, always. Strengths and weaknesses
  // only cover what stands out — without this a state that is merely good at
  // everything (Georgia is 2nd overall and has no weakness) would show no
  // numbers at all, which is less than the old hover tooltip gave you.
  function cardFacts(st) {
    const cell = (label, score) => `
      <div class="rf-cell">
        <div class="rf-lbl">${label}</div>
        <div class="rf-val">${score.toFixed(1)}<span>/5</span></div>
        <div class="track track-sm" data-fill="${(score / 5).toFixed(3)}"></div>
      </div>`;
    return `<div class="card-facts">
        ${cell("Afford", st.affordability.score)}
        ${cell("Quality", st.qualityOfLife.score)}
        ${cell("Market", st.legalIndustry.score)}
      </div>`;
  }

  function insGroup(kind, rows, brief) {
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
            ${brief ? "" : `<div class="ins-val">${esc(r.detail)}</div>`}
          </div>`).join("")}
      </div>`;
  }

  function stateCardHTML(name) {
    const st = stateByName[name];
    const ins = INSIGHTS[name] || { strengths: [], weaknesses: [] };
    const n = (schoolsByState[name] || []).length;

    const flat = !ins.strengths.length && !ins.weaknesses.length
      ? `<p class="ins-flat">Middle of the pack on every measure.</p>` : "";

    return `
      <h2 class="card-title mk${markerOf[name]}">${esc(name)}</h2>
      <div class="card-meta">${n ? plural(n, "law school") : "No law school"} · overall <b>${st.overall.toFixed(2)}</b>/5</div>
      ${cardFacts(st)}
      ${insGroup("up", ins.strengths.slice(0, 3), true)}
      ${insGroup("dn", ins.weaknesses.slice(0, 3), true)}
      ${flat}
      <p class="card-hint">Click to see its schools</p>`;
  }

  // The zoomed-in panel: the state's numbers, then every school in it, each
  // with your odds once there's a GPA and LSAT to read them from.
  function focusHTML(name) {
    const st = stateByName[name];
    const schools = sortSchools(schoolsByState[name] || []);
    const rows = schools.map((sc) => {
      const adm = admissionRead(sc);
      return `
        <div class="cs-row" role="button" tabindex="0" aria-expanded="false" data-school="${esc(sc.name)}" data-city="${esc(sc.city)}">
          <span class="cs-top">
            <span class="cs-name">${esc(sc.name)}</span>
            ${adm ? `<span class="cs-odds ${adm.cls}">${adm.label}</span>` : ""}
          </span>
          <span class="cs-sub">${esc(sc.city)} · ${esc(sc.tier || "—")}${sc.rank == null ? "" : " · #" + sc.rank}
            · LSAT ${sc.medianLSAT} · GPA ${sc.medianGPA.toFixed(2)}${isSaved(sc.name) ? ' · <span class="saved-flag">✓ on list</span>' : ""}</span>
          <button class="linkbtn cs-open" type="button">Open school page →</button>
        </div>`;
    }).join("");
    return `
      <button class="linkbtn card-back" type="button" data-leave>← All states</button>
      <h2 class="card-title mk${markerOf[name]}">${esc(name)}</h2>
      <div class="card-meta">${schools.length ? plural(schools.length, "law school") : "No law school"} · overall <b>${st.overall.toFixed(2)}</b>/5</div>
      ${cardFacts(st)}
      <div class="cs-list">${rows || `<p class="ins-flat">${esc(name)} has no ABA-accredited law school.</p>`}</div>
      <button class="linkbtn card-more" type="button" data-open-state>Full ${esc(name)} breakdown →</button>`;
  }

  function wirePanel(card) {
    card.querySelector("[data-leave]").addEventListener("click", leaveState);
    card.querySelector("[data-open-state]").addEventListener("click", () => go({ kind: "state", name: mapFocus }));
    card.querySelectorAll(".cs-row").forEach((el) => {
      const city = el.getAttribute("data-city");
      const name = el.getAttribute("data-school");
      el.addEventListener("click", () => selectSchool(name));
      el.addEventListener("keydown", (e) => {
        if (e.target === el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); selectSchool(name); }
      });
      el.querySelector(".cs-open").addEventListener("click", (e) => {
        e.stopPropagation();
        go({ kind: "school", name });
      });
      el.addEventListener("mouseenter", () => markCity(city));
      el.addEventListener("focus", () => markCity(city));
      el.addEventListener("mouseleave", () => markCity(null));
      el.addEventListener("blur", () => markCity(null));
    });
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
      : `<div class="track track-sm" data-pin="${(Math.max(3, Math.min(97, 50 + pos * 25)) / 100).toFixed(3)}"></div>`;
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
      <div class="rrow" data-school="${esc(s.name)}" role="button" tabindex="0">
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

  // The results page: one list, hardest band first. A row opens the school.
  function renderResults() {
    const results = scoreAll();
    const groups = [[], [], [], []];
    results.forEach((r) => groups[r.adm.band].push(r));

    // Hardest first, the way you'd split applications: reach, target, safety,
    // then far reach last so nothing quietly drops off the list.
    const order = [2, 1, 0, 3];

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
      <div class="res-head">
        <h2>Your schools</h2>
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
      </p>`, true);
    window.scrollTo({ top: resultsScroll, behavior: "auto" });

    app.querySelectorAll("[data-school]").forEach((el) => {
      const open = () => go({ kind: "school", name: el.getAttribute("data-school"), fit: true });
      el.addEventListener("click", open);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    });
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
    document.getElementById("editProfile").addEventListener("click", () => go({ kind: "fit" }));
  }

  // ---------- state view ----------
  function factorCard(title, score, detailRows, extra) {
    return `
      <div class="fcard">
        <h3>${title}</h3>
        <div class="fscore">${score.toFixed(1)}<span> / 5</span></div>
        <div class="track" data-fill="${(score / 5).toFixed(3)}"></div>
        <div class="fdetail">${detailRows}</div>
        ${extra || ""}
      </div>`;
  }

  function renderState(name) {
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
      <div class="school-list">${rows || `<div class="empty">
        ${esc(name)} has no ABA-accredited law school — the only state that doesn't.<br>
        Its scores are here so you can still weigh it against the others.</div>`}</div>`, true);

    wireCrumb();
    app.querySelectorAll(".srow").forEach((el) =>
      el.addEventListener("click", () =>
        go({ kind: "school", name: el.getAttribute("data-school"), fit: fitOrigin(currentView) })));
  }

  // ---------- school view ----------
  // The pieces of a school's read that both the full page and the results
  // detail panel show.
  function schoolOutcomesHTML(sc) {
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
    return oc ? `
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

  }

  function schoolOddsHTML(sc) {
    // Where the user's own numbers land in this school's admitted range.
    const adm = admissionRead(sc);
    const a = sc.admissions;
    const marker = (label, pos, value) => {
      if (pos == null) return "";
      const left = Math.max(2, Math.min(98, 50 + pos * 25));
      return `<div class="pctline"><span>${label}</span>
        <span class="track track-lg" data-pin="${(left / 100).toFixed(3)}"></span>
        <span class="pv"><b>${value}</b></span></div>`;
    };
    return adm ? (() => {
      const p = splitPct(adm.odds);
      return `
      <div class="odds">
        <div class="oh">
          <div class="writeup-h" style="margin:0">Your numbers here</div>
          <div class="oband ${adm.cls}">${p.admit}% · ${adm.label}</div>
        </div>
        ${marker("LSAT", adm.lsatPos, profile.lsat)}
        ${marker("GPA", adm.gpaPos, profile.gpa)}
        <div class="obar" data-split="${p.admit},${p.wait},${p.deny}"></div>
        <div class="okeys">
          <span class="okey"><i data-split="100,0,0"></i>Admit <b>${p.admit}%</b></span>
          <span class="okey"><i data-split="0,100,0"></i>Waitlist <b>${p.wait}%</b></span>
          <span class="okey"><i data-split="0,0,100"></i>Deny <b>${p.deny}%</b></span>
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

  }

  function schoolStatsHTML(sc) {
    const a = sc.admissions;
    return `
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
        </div>`;
  }

  function schoolLifestyleHTML(sc) {
    const city = cityByKey[sc.city + "|" + sc.state];
    const lifeBar = (label, v) =>
      `<div class="life-row"><span>${label}</span>
         <span class="track" data-fill="${(v / 5).toFixed(3)}"></span>
         <b>${v}/5</b></div>`;

    return city ? `
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
  }

  function renderSchool(schoolName) {
    const sc = schoolByName[schoolName];
    if (!sc) { go({ kind: "map" }, true); return; }
    const st = stateByName[sc.state];
    const added = isSaved(sc.name);

    setView(`
      <div class="view-top">
        ${crumbHTML(currentView, sc.name)}
        ${currentView.fit ? `<button class="markbtn mk-back" type="button" id="backResults">← Your schools</button>` : ""}
      </div>
      <div class="school-hero">
        <div class="h-top">
          <div>
            <h2>${esc(sc.name)}</h2>
            <div class="loc">${esc(sc.city)}, ${esc(st ? st.abbr : sc.state)}</div>
          </div>
          <div class="h-side">
            ${tierBadge(sc.tier)}
            <button class="markbtn mk-add${added ? " is-on" : ""}" id="toggleBtn" type="button">
              ${added ? "✓ On my list" : "Add to my list"}
            </button>
          </div>
        </div>
        ${schoolStatsHTML(sc)}
        ${schoolOddsHTML(sc)}
        <div class="writeup-h gap-t">How it stacks up</div>
        <p class="writeup">${esc(sc.writeup)}</p>
        ${schoolOutcomesHTML(sc)}
        ${schoolLifestyleHTML(sc)}
      </div>`, true);

    wireCrumb();
    const back = app.querySelector("#backResults");
    if (back) back.addEventListener("click", () => go({ kind: "results" }));
    app.querySelector("#toggleBtn").addEventListener("click", () => {
      toggleSaved(sc.name);
      rerender();
    });
  }

  // ---------- my saved list: a drawer of folders ----------
  // Every saved school gets a folder standing in a stack, filed under the same
  // bands as the results. Open one and the site's read of the school sits next
  // to whatever you've put in it yourself: notes, and attached files.
  function groupedSaved() {
    const groups = {};
    saved.map((n) => schoolByName[n]).filter(Boolean)
      .forEach((s) => { (groups[s.state] = groups[s.state] || []).push(s); });
    return groups;
  }

  // Hardest first, like the results. Without a GPA and LSAT there's no band to
  // read, so everything shares one unlabelled drawer (index 4).
  function savedBands() {
    const groups = [[], [], [], [], []];
    sortSchools(saved.map((n) => schoolByName[n]).filter(Boolean)).forEach((s) => {
      const a = admissionRead(s);
      groups[a ? a.band : 4].push(s);
    });
    return [2, 1, 0, 3, 4].filter((bi) => groups[bi].length).map((bi) => ({ bi, list: groups[bi] }));
  }
  const folderCls = (sc) => { const a = admissionRead(sc); return "f-" + (a ? a.band : 4); };

  function folderMeta(sc) {
    const st = stateByName[sc.state];
    const adm = admissionRead(sc);
    return `${esc(sc.city)}, ${esc(st ? st.abbr : sc.state)} · ${esc(sc.tier || "—")}` +
      (sc.rank == null ? "" : ` · #${sc.rank}`) +
      (adm ? ` · <b>${splitPct(adm.odds).admit}% admit</b>` : "");
  }

  let filesCache = null, filesBroken = false, fileUrls = [];
  function loadFiles() {
    return allFiles().then(
      (list) => { filesCache = list; filesBroken = false; },
      () => { filesCache = []; filesBroken = true; });
  }
  const filesFor = (name) => (filesCache || []).filter((f) => f.school === name);
  const fileSize = (n) => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1048576).toFixed(1) + " MB";

  function folderExtras(name) {
    const bits = [];
    if ((notes[name] || "").trim()) bits.push("✎ notes");
    const n = filesFor(name).length;
    if (n) bits.push(plural(n, "file"));
    return bits.join(" · ");
  }
  function refreshExtras() {
    app.querySelectorAll("[data-extra]").forEach((el) => {
      el.textContent = folderExtras(el.getAttribute("data-extra"));
    });
  }

  function folderHTML(sc, i) {
    return `
      <button class="folder ${folderCls(sc)}" type="button" data-folder="${esc(sc.name)}" data-tab="${i % 4}" style="--tab:${i % 4}">
        <span class="folder-tab">${esc(sc.name)}</span>
        <span class="folder-body">
          <span class="folder-meta">${folderMeta(sc)}</span>
          <span class="folder-extra" data-extra="${esc(sc.name)}">${folderExtras(sc.name)}</span>
        </span>
      </button>`;
  }

  function openFolderHTML(sc, tab) {
    const st = stateByName[sc.state];
    return `
      <div class="ofolder ${folderCls(sc)}" style="--tab:${tab}">
        <span class="folder-tab">${esc(sc.name)}</span>
        <div class="ofolder-body">
          <div class="ofolder-top">
            <div>
              <h2>${esc(sc.name)}</h2>
              <div class="loc">${esc(sc.city)}, ${esc(st ? st.abbr : sc.state)} ${tierBadge(sc.tier)}</div>
            </div>
            <div class="ofolder-actions">
              <button class="linkbtn" id="ofPage" type="button">Full school page →</button>
              <button class="linkbtn" id="ofRemove" type="button">Remove from list</button>
              <button class="iconbtn" id="ofClose" type="button" aria-label="Close folder">&times;</button>
            </div>
          </div>
          <div class="ofolder-pages">
            <section class="page">
              <h3 class="page-h">From the site</h3>
              ${schoolStatsHTML(sc)}
              ${schoolOddsHTML(sc)}
              <div class="writeup-h gap-t">How it stacks up</div>
              <p class="writeup">${esc(sc.writeup)}</p>
              ${schoolOutcomesHTML(sc)}
              ${schoolLifestyleHTML(sc)}
            </section>
            <section class="page page-mine">
              <h3 class="page-h">Your notes <span class="note-status" id="noteStatus"></span></h3>
              <textarea class="notes" id="ofNotes" spellcheck="true"
                placeholder="Visit impressions, people you talked to, deadlines, gut feel…">${esc(notes[sc.name] || "")}</textarea>
              <h3 class="page-h gap-t">Your files</h3>
              <label class="dropzone" id="ofDrop">
                <input type="file" id="ofFile" multiple hidden />
                Drop files here or <u>choose</u><span>up to 10 MB each</span>
              </label>
              <p class="fl-msg" id="ofFileMsg"></p>
              <div class="flist" id="ofList"></div>
            </section>
          </div>
        </div>
      </div>`;
  }

  function paintFiles(name) {
    const box = document.getElementById("ofList");
    if (!box) return;
    fileUrls.forEach((u) => URL.revokeObjectURL(u));
    fileUrls = [];
    if (filesBroken) {
      box.innerHTML = `<p class="fl-empty">This browser won't let the page store files — private windows usually don't.</p>`;
      return;
    }
    if (!filesCache) { box.innerHTML = `<p class="fl-empty">Loading…</p>`; return; }
    const mine = filesFor(name).sort((a, b) => b.added - a.added);
    box.innerHTML = mine.length ? mine.map((f) => {
      const u = URL.createObjectURL(f.blob);
      fileUrls.push(u);
      return `<div class="fl-row">
          <a class="fl-name" href="${u}" target="_blank" rel="noopener">${esc(f.name)}</a>
          <span class="fl-size">${fileSize(f.size)}</span>
          <a class="iconbtn" href="${u}" download="${esc(f.name)}" title="Download" aria-label="Download ${esc(f.name)}">↓</a>
          <button class="iconbtn" type="button" data-del="${f.id}" title="Remove" aria-label="Remove ${esc(f.name)}">&times;</button>
        </div>`;
    }).join("") : `<p class="fl-empty">Nothing attached yet.</p>`;
    box.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", async () => {
        try { await dropFile(+b.getAttribute("data-del")); } catch (e) {}
        await loadFiles();
        paintFiles(name);
        refreshExtras();
      }));
  }

  async function addFiles(name, list) {
    const msg = document.getElementById("ofFileMsg");
    const big = [];
    let failed = 0;
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE) { big.push(f.name); continue; }
      try {
        await putFile({ school: name, name: f.name, type: f.type, size: f.size, added: Date.now(), blob: f });
      } catch (e) { failed++; }
    }
    const out = [];
    if (big.length) out.push(`${big.join(", ")} ${big.length > 1 ? "are" : "is"} over 10 MB — skipped.`);
    if (failed) out.push(`Couldn't store ${plural(failed, "file")}.`);
    if (msg) msg.textContent = out.join(" ");
    await loadFiles();
    paintFiles(name);
    refreshExtras();
  }

  function wireOpenFolder(sc) {
    const name = sc.name;
    document.getElementById("ofClose").addEventListener("click", closeFolder);
    document.getElementById("ofPage").addEventListener("click", () =>
      go({ kind: "school", name, fit: fitOrigin(currentView) }));
    document.getElementById("ofRemove").addEventListener("click", () => {
      toggleSaved(name);
      leaveFolder();
      renderList(currentView);
    });

    const ta = document.getElementById("ofNotes");
    const status = document.getElementById("noteStatus");
    ta.addEventListener("input", () => {
      if (ta.value.trim()) notes[name] = ta.value; else delete notes[name];
      status.textContent = persistNotes() ? "saved" : "couldn't save";
    });

    const input = document.getElementById("ofFile");
    const drop = document.getElementById("ofDrop");
    input.addEventListener("change", () => { addFiles(name, input.files); input.value = ""; });
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("over");
      addFiles(name, e.dataTransfer.files);
    });
    paintFiles(name);
  }

  function renderList(v) {
    const bands = savedBands();
    const total = bands.reduce((a, g) => a + g.list.length, 0);
    const open = v.open && isSaved(v.open) ? schoolByName[v.open] : null;
    if (v.open && !open) { v = currentView = { kind: "list" }; history.replaceState(v, ""); }

    const body = total ? bands.map((g) => `
      <section class="fgroup">
        <div class="fgroup-h">
          <h3 class="${g.bi < 4 ? BAND_CLS[g.bi] : ""}">${g.bi < 4 ? BANDS[g.bi].label : profileReady() ? "No odds yet" : "Saved"}</h3>
          <span class="n">${plural(g.list.length, "school")}</span>
        </div>
        <div class="fstack">${g.list.map(folderHTML).join("")}</div>
      </section>`).join("")
      : `<div class="empty card">Your list is empty.<br>Add schools from any school's page and each one gets a folder here.</div>`;

    setView(`
      <div class="files${open ? " is-open" : ""}">
        <div class="files-stack">
          <div class="files-head">
            <div>
              <h2>My saved list</h2>
              <p class="files-sub">${total
                ? plural(total, "folder") + "."
                : "Nothing saved yet."}</p>
            </div>
            <div class="files-tools">
              <button class="ghostbtn" type="button" id="exportMd" ${total ? "" : "disabled"}>Markdown</button>
              <button class="ghostbtn" type="button" id="exportCsv" ${total ? "" : "disabled"}>CSV</button>
              <button class="ghostbtn" type="button" id="backupBtn" ${total ? "" : "disabled"}>Back up</button>
              <button class="ghostbtn" type="button" id="restoreBtn">Restore</button>
              <input type="file" id="restoreFile" accept=".json,application/json" hidden />
            </div>
          </div>
          <div class="restore-bar" id="restoreBar" hidden></div>
          ${body}
        </div>
        <div class="files-open" id="filesOpen">${open ? openFolderHTML(open, 0) : ""}</div>
      </div>`, true);

    app.querySelectorAll(".folder").forEach((el) =>
      el.addEventListener("click", () => openFolder(el.getAttribute("data-folder"), +el.getAttribute("data-tab"))));
    document.getElementById("exportMd").addEventListener("click", exportMarkdown);
    document.getElementById("exportCsv").addEventListener("click", exportCsv);
    document.getElementById("backupBtn").addEventListener("click", exportBackup);
    const rf = document.getElementById("restoreFile");
    document.getElementById("restoreBtn").addEventListener("click", () => rf.click());
    rf.addEventListener("change", () => { if (rf.files[0]) readBackup(rf.files[0]); rf.value = ""; });
    if (open) wireOpenFolder(open);

    loadFiles().then(() => {
      refreshExtras();
      if (open && currentView.open === open.name) paintFiles(open.name);
    });
  }

  // ---------- folder animation ----------
  // A fixed-position stand-in does the flying and the opening, so the real pages
  // can be laid out underneath at their final size and simply revealed.
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
  const FOLD_EASE = "cubic-bezier(.33, 1, .68, 1)";
  // The flight eases in as well as out, so it never starts from a dead stop.
  const FLY_EASE = "cubic-bezier(.45, 0, .2, 1)";
  let folderBusy = false, skipPop = false;

  const anim = (el, frames, ms, opts) =>
    el.animate(frames, Object.assign({ duration: ms, easing: FOLD_EASE, fill: "forwards" }, opts)).finished;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const box = (r) => ({ top: r.top + "px", left: r.left + "px", width: r.width + "px", height: r.height + "px" });
  // An open folder can run far past the fold; only fly the part you can see.
  function onScreen(r) {
    const top = Math.max(r.top, 0);
    return { top, left: r.left, width: r.width, height: Math.min(r.bottom, window.innerHeight - 12) - top };
  }
  function folderClone(sc, tab, rect) {
    const el = document.createElement("div");
    el.className = "ofolder fly " + folderCls(sc);
    el.style.setProperty("--tab", tab);
    el.innerHTML = `<span class="folder-tab">${esc(sc.name)}</span>
      <div class="ofolder-body"><div class="ofolder-cover"><span class="folder-meta">${folderMeta(sc)}</span></div></div>`;
    Object.assign(el.style, box(rect));
    app.appendChild(el);
    return el;
  }
  // Pin the clone where it currently looks, dropping finished fill-forwards animations.
  function settle(el) {
    const r = el.getBoundingClientRect();
    el.getAnimations().forEach((a) => a.cancel());
    Object.assign(el.style, box(r));
    return r;
  }

  async function openFolder(name, tab) {
    const sc = schoolByName[name];
    const wrap = app.querySelector(".files");
    const src = wrap && wrap.querySelector(`.folder[data-folder="${CSS.escape(name)}"]`);
    if (!sc || !src || folderBusy) return;
    currentView = { kind: "list", open: name };
    history.pushState(currentView, "");
    const pane = document.getElementById("filesOpen");
    pane.innerHTML = openFolderHTML(sc, tab);
    wireOpenFolder(sc);
    if (REDUCED.matches) { wrap.classList.add("is-open"); window.scrollTo(0, 0); return; }

    folderBusy = true;
    const from = src.getBoundingClientRect();
    const clone = folderClone(sc, tab, from);
    src.style.visibility = "hidden";
    // Lay the real pages out now, invisibly, so nothing heavy lands mid-flight.
    // The clone aims for where they'll sit once the page is scrolled to the top.
    wrap.classList.add("fading", "is-animating");
    const r = pane.querySelector(".ofolder").getBoundingClientRect();
    const y = window.scrollY;
    const to = onScreen({ top: r.top + y, bottom: r.bottom + y, left: r.left, width: r.width });
    try {
      // The cover starts swinging before the folder lands, and its label fades
      // before it turns edge-on (opacity flattens 3D, so backface-visibility
      // alone would let the mirrored text show through).
      const fly = anim(clone, [box(from), box(to)], 540, { easing: FLY_EASE });
      const swing = anim(clone.querySelector(".ofolder-cover"), [
        { transform: "rotateY(0deg)", opacity: 1 },
        { opacity: 1, offset: 0.55 },
        { transform: "rotateY(-178deg)", opacity: 0 },
      ], 660, { delay: 360 });
      anim(clone.querySelector(".ofolder-cover .folder-meta"), [{ opacity: 1 }, { opacity: 0 }], 120, { delay: 360, easing: "linear" });
      await fly;
      wrap.classList.add("is-open");
      window.scrollTo(0, 0);
      await swing;
      pane.querySelector(".ofolder").classList.add("reveal");
    } finally {
      clone.remove();
      src.style.visibility = "";
      wrap.classList.remove("fading", "is-animating");
      folderBusy = false;
    }
  }

  // Every open-folder history entry sits directly on top of a plain list entry,
  // so closing is just stepping back over it.
  function leaveFolder() {
    skipPop = true;
    history.back();
    currentView = { kind: "list" };
  }

  async function closeFolder() {
    const wrap = app.querySelector(".files");
    if (!wrap || folderBusy || !currentView || !currentView.open) return;
    const sc = schoolByName[currentView.open];
    const open = wrap.querySelector(".ofolder");
    const src = wrap.querySelector(`.folder[data-folder="${CSS.escape(currentView.open)}"]`);
    leaveFolder();
    refreshExtras();
    const done = () => {
      wrap.classList.remove("is-open", "is-animating", "fading");
      document.getElementById("filesOpen").innerHTML = "";
    };
    if (REDUCED.matches || !src || !open || !sc) { done(); return; }

    folderBusy = true;
    let clone = null;
    try {
      await Promise.all(Array.from(open.querySelectorAll(".ofolder-body > *"))
        .map((el) => anim(el, [{ opacity: 1 }, { opacity: 0 }], 140)));
      clone = folderClone(sc, open.style.getPropertyValue("--tab"), onScreen(open.getBoundingClientRect()));
      wrap.classList.add("is-animating");
      const swing = anim(clone.querySelector(".ofolder-cover"), [
        { transform: "rotateY(-178deg)", opacity: 0 },
        { opacity: 1, offset: 0.4 },
        { transform: "rotateY(0deg)", opacity: 1 },
      ], 560);
      const meta = clone.querySelector(".ofolder-cover .folder-meta");
      meta.style.opacity = 0;
      anim(meta, [{ opacity: 0 }, { opacity: 1 }], 160, { delay: 400 });
      // Back into the drawer while the cover is still settling shut.
      await wait(300);
      wrap.classList.add("fading");
      wrap.classList.remove("is-open");
      src.scrollIntoView({ block: "center" });
      src.style.visibility = "hidden";
      const from = settle(clone);
      wrap.classList.remove("fading");
      await Promise.all([swing, anim(clone, [box(from), box(src.getBoundingClientRect())], 520, { easing: FLY_EASE })]);
    } finally {
      if (clone) clone.remove();
      src.style.visibility = "";
      done();
      folderBusy = false;
    }
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
        if (notes[s.name]) md += notes[s.name].trim().split("\n").map((l) => "  > " + l).join("\n") + "\n";
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
    let csv = "State,School,City,MedianGPA,MedianLSAT,InStateTuition,OutStateTuition,Rank,Tier,Notes\n";
    names.forEach((stn) => {
      sortSchools(groups[stn]).forEach((s) => {
        csv += [
          cell(s.state), cell(s.name), cell(s.city),
          cell(s.medianGPA), cell(s.medianLSAT),
          cell(s.tuitionInState), cell(s.tuitionOutState),
          cell(s.rank == null ? "" : s.rank), cell(s.tier), cell(notes[s.name]),
        ].join(",") + "\n";
      });
    });
    download("law-school-shortlist.csv", csv, "text/csv");
  }

  // ---------- backup / restore ----------
  // One JSON file with the list, notes and every attachment (as data URLs), so
  // cleared site data or a new browser doesn't cost you your folders.
  const BACKUP_APP = "law-school-shortlist";
  const toDataURL = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

  async function exportBackup() {
    let files = [];
    try { files = await allFiles(); } catch (e) {}
    const out = await Promise.all(files.map(async (f) => ({
      school: f.school, name: f.name, added: f.added, data: await toDataURL(f.blob),
    })));
    download(`law-school-files-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ app: BACKUP_APP, version: 1, saved, notes, files: out }), "application/json");
  }

  let pendingRestore = null;
  function restoreBar(html) {
    const bar = document.getElementById("restoreBar");
    if (!bar) return null;
    bar.innerHTML = html;
    bar.hidden = !html;
    return bar;
  }

  // Restoring only ever adds: schools you don't have, notes you don't have
  // (appended under yours if both exist), files not already in that folder.
  async function readBackup(file) {
    let data = null;
    try { data = JSON.parse(await file.text()); } catch (e) {}
    if (!data || data.app !== BACKUP_APP || !Array.isArray(data.saved)) {
      restoreBar(`That isn't a backup from this site. <button class="linkbtn" type="button" id="restoreNo">Dismiss</button>`);
    } else {
      if (!filesCache) await loadFiles();
      const imported = data.notes && typeof data.notes === "object" ? data.notes : {};
      const names = data.saved.filter((n) => schoolByName[n] && !isSaved(n));
      const noteKeys = Object.keys(imported).filter((k) =>
        typeof imported[k] === "string" && imported[k].trim() && !(notes[k] || "").includes(imported[k]));
      const files = (Array.isArray(data.files) ? data.files : []).filter((f) =>
        f && typeof f.data === "string" && typeof f.name === "string" &&
        !filesFor(f.school).some((e) => e.name === f.name));
      if (!names.length && !noteKeys.length && !files.length) {
        restoreBar(`Nothing new in that backup — you already have all of it.
          <button class="linkbtn" type="button" id="restoreNo">Dismiss</button>`);
      } else {
        pendingRestore = { names, noteKeys, imported, files };
        restoreBar(`Restoring adds ${plural(names.length, "school")}, ${plural(noteKeys.length, "note")}
          and ${plural(files.length, "file")}. Nothing you have now is removed.
          <button class="btn" type="button" id="restoreGo">Restore</button>
          <button class="linkbtn" type="button" id="restoreNo">Cancel</button>`);
        document.getElementById("restoreGo").addEventListener("click", applyRestore);
      }
    }
    document.getElementById("restoreNo").addEventListener("click", () => {
      pendingRestore = null;
      restoreBar("");
    });
  }

  async function applyRestore() {
    const r = pendingRestore;
    pendingRestore = null;
    if (!r) return;
    restoreBar("Restoring…");
    r.names.forEach((n) => saved.push(n));
    persist();
    r.noteKeys.forEach((k) => {
      notes[k] = (notes[k] || "").trim() ? notes[k] + "\n\n" + r.imported[k] : r.imported[k];
    });
    persistNotes();
    let failed = 0;
    for (const f of r.files) {
      try {
        const blob = await (await fetch(f.data)).blob();
        await putFile({ school: f.school, name: f.name, type: blob.type, size: blob.size, added: f.added || Date.now(), blob });
      } catch (e) { failed++; }
    }
    go({ kind: "list" }, true);
    if (failed) restoreBar(`Restored, but ${plural(failed, "file")} couldn't be stored.`);
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

      profile = loadProfile();
      // Drop saved geography for states that aren't in the data.
      profile.states = profile.states.filter((s) => stateByName[s]);
      if (profile.residency && !stateByName[profile.residency]) profile.residency = "";
      persistProfile();

      // drop any saved names no longer in data
      saved = saved.filter((n) => schoolByName[n]);
      persist();

      go({ kind: "fit" }, true);
      // Opening (or reloading) the site is the one time the landing page gets
      // written up. Wait for the marker fonts so the strokes are measured right.
      if (!REDUCED.matches) {
        const view = app.firstElementChild;
        view.style.animation = "none";     // its fade-in starts at zero opacity, which reads as unwritable
        view.style.visibility = "hidden";
        document.fonts.ready.then(() => writeUp(view));
      }
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
  const menu = document.getElementById("menu");
  const menuBtn = document.getElementById("menuBtn");
  function menuToggle(open) {
    menu.classList.toggle("on", open);
    menuBtn.setAttribute("aria-expanded", open);
    // The ranked list needs numbers to rank on; say so rather than hide it.
    const res = document.getElementById("menuResults");
    res.disabled = !profileReady();
    res.title = profileReady() ? "" : "Enter a GPA and LSAT on Find your fit first";
  }
  menuBtn.addEventListener("click", (e) => { e.stopPropagation(); menuToggle(!menu.classList.contains("on")); });
  document.addEventListener("click", (e) => { if (!menu.contains(e.target)) menuToggle(false); });
  menu.querySelectorAll("[data-nav]").forEach((el) =>
    el.addEventListener("click", () => {
      menuToggle(false);
      const kind = el.getAttribute("data-nav");
      if (kind === "results") openResults(); else go({ kind });
    }));

  // Each letter gets its own span so hover can colour them in turn; spaces
  // don't take a colour.
  menu.querySelectorAll(".menu-list button").forEach((b) =>
    [...b.childNodes].forEach((n) => {
      if (n.nodeType !== 3) return;
      let i = 0;
      const word = document.createElement("span");
      word.append(...[...n.textContent].map((ch) => {
        if (!ch.trim()) return ch;
        const sp = document.createElement("span");
        sp.className = "c" + (i++ % 3);
        sp.textContent = ch;
        return sp;
      }));
      n.replaceWith(word);
    }));

  // The logo only shows on the landing page, so a click has nowhere to go:
  // it throws marker-coloured confetti in from every edge of the screen.
  function confetti() {
    if (REDUCED.matches) return;
    const cv = document.createElement("canvas");
    const dpr = window.devicePixelRatio || 1;
    const W = innerWidth, H = innerHeight;
    cv.className = "confetti";
    cv.width = W * dpr; cv.height = H * dpr;
    document.body.appendChild(cv);
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const colors = ["--accent", "--far", "--safety", "--reach"].map((v) => css.getPropertyValue(v).trim());
    const reach = Math.hypot(W, H) / 38;
    const bits = Array.from({ length: 240 }, () => {
      // A random spot on the screen's edge, aimed roughly at the middle.
      let p = Math.random() * 2 * (W + H), x, y;
      if (p < W) { x = p; y = 0; }
      else if ((p -= W) < H) { x = W; y = p; }
      else if ((p -= H) < W) { x = p; y = H; }
      else { x = 0; y = p - W; }
      const a = Math.atan2(H / 2 - y, W / 2 - x) + (Math.random() - .5) * 1.2;
      const v = reach * (.3 + Math.random() * .6) * (y === H ? 1.4 : 1);
      return {
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        w: 6 + Math.random() * 6, h: 3 + Math.random() * 4,
        r: Math.random() * 6, vr: (Math.random() - .5) * .4,
        c: colors[Math.floor(Math.random() * colors.length)],
      };
    });
    const start = performance.now();
    let last = start;
    (function frame(t) {
      // Steps are in 60fps frames so the throw looks the same on any display.
      const k = Math.min((t - last) / 16.7, 3), drag = Math.pow(.975, k);
      last = t;
      ctx.clearRect(0, 0, W, H);
      let live = 0;
      for (const b of bits) {
        b.vx *= drag; b.vy = b.vy * drag + .2 * k;
        b.x += b.vx * k + Math.sin(b.r) * .6 * k; b.y += b.vy * k; b.r += b.vr * k;
        if (b.y > H + 20) continue;
        live++;
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(b.r);
        ctx.scale(1, Math.cos(b.r * 1.7));
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      }
      if (live && t - start < 6000) requestAnimationFrame(frame); else cv.remove();
    })(start);
  }
  document.getElementById("logo").addEventListener("click", (e) => {
    e.preventDefault();
    confetti();
  });

  // ← and → step through the menu's pages in order, skipping Your schools
  // until there are numbers to rank on. A state page counts as the map; a
  // school page sits outside the order. Never while typing or picking.
  const PAGES = ["fit", "results", "map", "list"];
  function stepPage(dir) {
    const kind = currentView && (currentView.kind === "state" ? "map" : currentView.kind);
    let i = PAGES.indexOf(kind);
    if (i === -1) return false;
    do i += dir; while (PAGES[i] === "results" && !profileReady());
    if (i < 0 || i >= PAGES.length) return false;
    menuToggle(false);
    closeFolder();
    panSide = dir;
    if (PAGES[i] === "results") openResults(); else go({ kind: PAGES[i] });
    panSide = 0;                  // in case nothing panned (reduced motion)
    return true;
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      menuToggle(false);
      closeFolder();
      if (currentView && currentView.kind === "map") leaveState();
    }
    if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey
        && !e.target.closest("input, textarea, select, [contenteditable]")) {
      if (stepPage(e.key === "ArrowRight" ? 1 : -1)) e.preventDefault();
    }
  });

  persist();
  boot();
})();
