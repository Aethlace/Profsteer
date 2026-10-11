require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.MODEL || "gemini-flash-latest";

// Simple rate limit: 20 requests per minute per IP
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 60000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

function buildSystem(ctx = {}) {
  const p = ctx.profile || {};
  const matches = (ctx.matches || [])
    .map(m => `- ${m.name} (${m.pct}% match; ${(m.inst || []).join("/")}): ${m.unlocks}`)
    .join("\n") || "(none yet)";
  const covered = (ctx.allExams || []).join(", ") || "(unknown)";

  return `You are the Profsteer Advisor, a friendly and knowledgeable guide who helps students choose entrance exams, higher-education routes and scholarships, from high school up to PhD, at home or abroad.

How to answer:
- Give real advice, not one-liners. Reason from the student's situation, compare 2-3 realistic paths, explain trade-offs (competitiveness, cost, timeline, government vs private colleges) and end with concrete next steps in a sensible order.
- You are NOT limited to the app's database. Use your own knowledge freely.
 ${process.env.SEARCH === "off"
  ? "- You cannot search the web in this session. For dates, fees, deadlines or recent changes, share what you know, clearly say it may be outdated, and point the student to the official website to confirm."
  : "- Use web search for exams, scholarships, dates, fees, eligibility or recent changes that are not in the database or may have changed. Mention when something comes from a search."}
- Be honest. Never invent dates, fees or eligibility rules. If unsure or sources conflict, say so and tell the student to confirm on the official website.
- If key information is missing (home country, year of study, budget, reservation category), still give a useful answer first, then ask ONE short clarifying question at the end.
- Format: concise markdown, short paragraphs, bullets for lists. Keep answers under about 350 words unless the student asks for more detail.
- Stay on topic: exams, education paths, scholarships, careers. Politely redirect anything else.
- Assume the student's home country is India unless they say otherwise.

The student's current selections in the finder (hints only; the student may override them in chat):
- Mode: ${p.mode}; current qualification: ${p.level}; aiming for: ${p.target}
- Field: ${p.field}; career goal: ${p.career}; college type: ${p.inst}; region: ${p.region}

Exams the finder currently recommends for them:
${matches}

Exams already in the app's database: ${covered}`;
}

app.post("/api/chat", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "Server is missing GEMINI_API_KEY. Add it to .env and restart the server." });
  }
  if (limited(req.ip)) {
    return res.status(429).json({ error: "Too many messages. Please wait a minute." });
  }

  const { messages, context } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: "No messages provided." });
  }

  const clean = messages
    .slice(-20)
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content.slice(0, 4000) }] }));
  while (clean.length && clean[0].role !== "user") clean.shift();
  if (!clean.length) return res.status(400).json({ error: "No valid user message." });

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildSystem(context) }] },
          contents: clean,
          ...(process.env.SEARCH === "off" ? {} : { tools: [{ google_search: {} }] }),
          generationConfig: { maxOutputTokens: 4096 }
        })
      }
    );

    const data = await r.json();
    if (!r.ok) {
      console.error("Gemini API error:", JSON.stringify(data));
      return res.status(502).json({ error: data?.error?.message || "The AI service returned an error." });
    }

    const cand = data.candidates && data.candidates[0];
    const reply = ((cand && cand.content && cand.content.parts) || [])
      .map(p => p.text || "").join("").trim();

    const sources = new Map();
    ((cand && cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || []).forEach(c => {
      if (c.web && c.web.uri) sources.set(c.web.uri, c.web.title || c.web.uri);
    });

    res.json({
      reply: reply || "I couldn't put together an answer. Could you rephrase that?",
      sources: [...sources].map(([url, title]) => ({ url, title }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not reach the AI service." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Profsteer running at http://localhost:${PORT} (model: ${MODEL})`));