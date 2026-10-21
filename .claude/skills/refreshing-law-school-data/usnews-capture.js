// Paste into the browser tools' JavaScript runner on
// https://www.usnews.com/best-graduate-schools/top-law-schools/law-rankings
// (usnews.com blocks curl/fetch from scripts; a real browser tab works).

// Step 1 — load every school. Re-run until it returns the same count twice (~194+).
const cards = () => (document.body.innerText.match(/\nin\nBest Law Schools/g) || []).length;
const t0 = Date.now(); let last = -1, still = 0;
while (Date.now() - t0 < 35000 && still < 4) {
  window.scrollTo(0, document.body.scrollHeight);
  const more = [...document.querySelectorAll("button")].find((b) => /load more/i.test(b.innerText));
  if (more) more.click();
  await new Promise((r) => setTimeout(r, 1200));
  const c = cards(); still = c === last ? still + 1 : 0; last = c;
}
cards();

// Step 2 — parse into "name|location|rank" lines. Footnote markers (" 1") are stripped;
// a card whose name line is only a footnote digit takes the line above.
const lines = document.body.innerText.split("\n").map((s) => s.trim());
const out = [];
for (let i = 0; i < lines.length; i++) {
  let rank = null;
  if (/^#[\d\-]+$/.test(lines[i]) && lines[i + 1] === "in" && /^Best Law Schools/.test(lines[i + 2] || "")) rank = lines[i].slice(1);
  else if (lines[i] === "Unranked in" && /^Best Law Schools/.test(lines[i + 1] || "")) rank = "Unranked";
  if (!rank) continue;
  const prev = []; for (let j = i - 1; j >= 0 && prev.length < 3; j--) if (lines[j]) prev.push(lines[j]);
  let [loc, name, before] = prev;
  if (/^\d$/.test(name)) name = before;
  out.push(name.replace(/\s+\d$/, "") + "|" + loc.replace(/\s+,/, ",") + "|" + rank);
}
window.__usn = out;
// Fingerprint: apply_ranks.py prints the same line. If they differ, a line was mistyped or lost.
`${out.length} entries, rank checksum ${out.reduce((a, s, i) => a + (i + 1) * (parseInt(s.split("|").pop(), 10) || 0), 0)}`;

// Step 3 — the tool output truncates around 1,000 characters, so read it in slices
// (0-25, 25-50, ... until empty) and write the lines, in order, to a text file:
window.__usn.slice(0, 25).join("\n");
