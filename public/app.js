const $ = id => document.getElementById(id);
const mode = () => document.querySelector('input[name="mode"]:checked').value;

// Show region picker only for abroad
document.querySelectorAll('input[name="mode"]').forEach(r =>
  r.addEventListener("change", () => {
    $("regionBox").style.display = mode() === "abroad" ? "block" : "none";
  })
);

function getProfile() {
  return {
    mode: mode(), level: $("level").value, target: $("target").value,
    field: $("field").value, career: $("career").value,
    inst: $("inst").value, region: $("region").value
  };
}

function scoreExam(e, p) {
  // ----- hard filters -----
  if (e.mode !== p.mode) return null;
  if (!e.from.includes(p.level)) return null;
  if (p.target !== "any" && !e.target.includes(p.target)) return null;
  if (p.inst !== "any" && !e.inst.includes(p.inst) && !e.inst.includes("any")) return null;
  if (p.mode === "abroad" && p.region !== "any" && !e.regions.includes(p.region)) return null;

  // ----- weighted scoring -----
  let score = 0, max = 5, reasons = [];

  if (e.fields.includes(p.field)) { score += 3; reasons.push("Directly matches your field"); }
  else if (e.fields.includes("all")) { score += 1; reasons.push("Open to all fields"); }

  if (e.careers.includes(p.career)) { score += 2; reasons.push("Supports your career path"); }
  else if (e.careers.includes("any")) { score += 1; reasons.push("Useful for any career path"); }

  if (p.target !== "any") { max += 1; score += 1; reasons.push("Leads to your target level"); }
  if (p.inst !== "any")   { max += 1; score += 1; reasons.push("Feeds into " + p.inst + " colleges"); }

  if (score === 0) return null;
  return { exam: e, score, pct: Math.round((score / max) * 100), reasons };
}

function instTags(e) {
  return e.inst.map(i => i === "government" ? '<span class="tag gov">Government</span>'
                       : i === "private"    ? '<span class="tag pvt">Private</span>' : "").join("");
}

function render(results, p) {
  const out = $("results");
  if (!results.length) {
    out.innerHTML = '<div class="card">No matching exams found. Try loosening a filter (e.g. set target to "Show me everything").</div>';
    return;
  }

  // Exam cards
  let html = '<h2>Recommended exams</h2>';
  results.forEach(r => {
    const e = r.exam;
    html += `
      <div class="card result">
        <span class="score">${r.pct}% match</span>
        <h3>${e.name}</h3>
        <div class="tags">${instTags(e)}${e.target.map(t => `<span class="tag">${t}</span>`).join("")}</div>
        <div class="why">✓ ${r.reasons.join(" · ")}</div>
        <div class="unlocks"><strong>Unlocks:</strong> ${e.unlocks}</div>
      </div>`;
  });

  // Scholarships linked to the top results, filtered by mode, target and region
  const ids = new Set();
  results.forEach(r => r.exam.sch.forEach(id => ids.add(id)));
  const schol = [...ids].map(id => SCHOLARSHIPS[id]).filter(s =>
    s.mode === p.mode &&
    (p.target === "any" || s.target.includes(p.target)) &&
    (p.mode === "home" || p.region === "any" || s.regions.includes(p.region))
  );

  if (schol.length) {
    html += '<div class="card sch-card"><h3>🎓 Scholarships that may help</h3>';
    schol.forEach(s => {
      html += `<div class="sch-item"><span class="tag sch">${s.target.join(" / ")}</span><strong>${s.name}</strong><br>${s.desc}</div>`;
    });
    html += '</div>';
  }

  html += '<p class="note">Always verify eligibility, dates and fees on the official exam and scholarship websites.</p>';
  out.innerHTML = html;
}

$("go").addEventListener("click", () => {
  const p = getProfile();
  const results = EXAMS.map(e => scoreExam(e, p))
                       .filter(Boolean)
                       .sort((a, b) => b.score - a.score)
                       .slice(0, 8);
  render(results, p);
  $("results").scrollIntoView({ behavior: "smooth" });
});

// ---- decorative pixel scatter (Omarchy-style) ----
(function () {
  const box = document.getElementById("pixels");
  const size = 14;
  const cols = Math.ceil(window.innerWidth / size);
  const rows = Math.ceil(window.innerHeight / size);
  const count = Math.round(cols * rows * 0.02);
  for (let i = 0; i < count; i++) {
    const nearEdge = Math.random() < 0.8;          // most squares cluster at the left/right edges
    const band = Math.floor(Math.random() * cols * 0.12);
    const c = nearEdge ? (Math.random() < 0.5 ? band : cols - 1 - band)
                       : Math.floor(Math.random() * cols);
    const r = Math.floor(Math.random() * rows);
    const d = document.createElement("div");
    d.className = "px";
    d.style.left = c * size + "px";
    d.style.top = r * size + "px";
    d.style.opacity = (0.12 + Math.random() * 0.35).toFixed(2);
    box.appendChild(d);
  }
})();