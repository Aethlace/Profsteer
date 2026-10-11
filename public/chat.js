(function () {
  const KEY = "profsteer_chat_v1";
  const WELCOME = "Hi! I'm your Profsteer advisor. Ask me about exams, colleges or scholarships, including ones that aren't in the finder. I'll reason through your options in detail.";
  const CHIPS = [
    "Which path suits my profile best?",
    "Compare studying at home vs abroad for me",
    "Any exams for my field that the finder missed?"
  ];

  let history = [];
  try { history = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) {}
  let busy = false;

  // ---------- build the widget ----------
  const root = document.createElement("div");
  root.id = "chat-widget";
  root.innerHTML = `
    <button id="chat-fab" type="button">💬 Ask the advisor</button>
    <section id="chat-panel" hidden>
      <div class="chat-head">
        <strong>Profsteer Advisor</strong>
        <span>
          <button id="chat-clear" type="button" title="Clear conversation">Clear</button>
          <button id="chat-close" type="button" aria-label="Close">✕</button>
        </span>
      </div>
      <div id="chat-log" aria-live="polite"></div>
      <div id="chat-chips"></div>
      <form id="chat-form">
        <textarea id="chat-input" rows="1" placeholder="Ask about exams, scholarships, paths…"></textarea>
        <button id="chat-send" type="submit">Send</button>
      </form>
    </section>`;
  document.body.appendChild(root);

  const $c = id => document.getElementById(id);
  const panel = $c("chat-panel"), log = $c("chat-log"), input = $c("chat-input");

  // ---------- helpers ----------
  const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function md(text) {
    let h = esc(text);
    h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    const out = []; let inList = false;
    for (const line of h.split("\n")) {
      const m = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
      if (m) {
        if (!inList) { out.push("<ul>"); inList = true; }
        out.push("<li>" + m[1] + "</li>");
      } else {
        if (inList) { out.push("</ul>"); inList = false; }
        if (/^#{1,4}\s+/.test(line)) out.push("<p><strong>" + line.replace(/^#{1,4}\s+/, "") + "</strong></p>");
        else if (line.trim()) out.push("<p>" + line + "</p>");
      }
    }
    if (inList) out.push("</ul>");
    return out.join("");
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(history.slice(-60))); } catch (e) {}
  }

  function addMsg(role, text, sources) {
    const div = document.createElement("div");
    div.className = "msg " + role;
    div.innerHTML = role === "user" ? "<p>" + esc(text) + "</p>" : md(text);
    if (sources && sources.length) {
      const s = document.createElement("div");
      s.className = "sources";
      s.innerHTML = "Sources: " + sources.slice(0, 5).map(x =>
        `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || x.url)}</a>`).join(" · ");
      div.appendChild(s);
    }
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  function renderAll() {
    log.innerHTML = "";
    addMsg("assistant", WELCOME);
    history.forEach(m => addMsg(m.role, m.content, m.sources));
    $c("chat-chips").style.display = history.length ? "none" : "flex";
  }

  function buildContext() {
    let profile = {}, matches = [];
    try {
      profile = getProfile();
      matches = EXAMS.map(e => scoreExam(e, profile)).filter(Boolean)
        .sort((a, b) => b.score - a.score).slice(0, 8)
        .map(r => ({ name: r.exam.name, pct: r.pct, inst: r.exam.inst, unlocks: r.exam.unlocks }));
    } catch (e) {}
    return { profile, matches, allExams: typeof EXAMS !== "undefined" ? EXAMS.map(e => e.name) : [] };
  }

  // ---------- send ----------
  async function ask(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true;
    $c("chat-send").disabled = true;
    $c("chat-chips").style.display = "none";

    history.push({ role: "user", content: text });
    save();
    addMsg("user", text);
    input.value = "";
    input.style.height = "auto";

    const typing = addMsg("assistant typing", "Thinking…");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(m => ({ role: m.role, content: m.content })),
          context: buildContext()
        })
      });
      const data = await res.json();
      typing.remove();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      history.push({ role: "assistant", content: data.reply, sources: data.sources });
      save();
      addMsg("assistant", data.reply, data.sources);
    } catch (err) {
      typing.remove();
      const hint = location.port === "5500"
        ? " (Start the server with `node server.js` and open http://localhost:3000, not Live Server.)" : "";
      addMsg("assistant error", "Sorry, I couldn't get an answer: " + err.message + hint);
    } finally {
      busy = false;
      $c("chat-send").disabled = false;
      input.focus();
    }
  }

  // ---------- events ----------
  $c("chat-fab").onclick = () => { panel.hidden = false; $c("chat-fab").style.display = "none"; input.focus(); log.scrollTop = log.scrollHeight; };
  $c("chat-close").onclick = () => { panel.hidden = true; $c("chat-fab").style.display = "block"; };
  $c("chat-clear").onclick = () => {
    if (!history.length || confirm("Clear this conversation?")) { history = []; save(); renderAll(); }
  };
  $c("chat-form").onsubmit = e => { e.preventDefault(); ask(input.value); };
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input.value); }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 110) + "px";
  });

  const chips = $c("chat-chips");
  CHIPS.forEach(t => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = t; b.onclick = () => ask(t);
    chips.appendChild(b);
  });

  renderAll();
})();