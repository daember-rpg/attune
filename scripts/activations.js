/**
 * Parses item activations out of a PF2e item description.
 * Pure string work (no DOM, no Foundry), shared with the standalone preview.
 *
 * Handles both layouts found in PF2e data:
 *   <p><strong>Activate—Name</strong> <span class="action-glyph">R</span> (manipulate)</p>
 *   <p><strong>Trigger</strong> …</p><p><strong>Effect</strong> …</p>
 * and the legacy inline one:
 *   <p><strong>Activate</strong> <span class="action-glyph">R</span> command; <strong>Trigger</strong> …; <strong>Effect</strong> …</p>
 *
 * Only activations with an action glyph (1, 2, 3, reaction, free) are returned — those are
 * the ones that belong among the character's encounter actions.
 */

const GLYPHS = {
  "1": ["action", 1], a: ["action", 1],
  "2": ["action", 2], d: ["action", 2],
  "3": ["action", 3], t: ["action", 3],
  r: ["reaction", null],
  f: ["free", null]
};

const ACTIVATE = /^(activate|activation|ativar|ativa[cç][aã]o)\b/i;
const LABELS = {
  frequency: /^(frequency|frequ[eê]ncia)\b/i,
  trigger: /^(trigger|gatilho)\b/i,
  requirements: /^(requirements?|requisitos?|pr[eé]-requisitos?)\b/i,
  effect: /^(effect|efeito)\b/i
};
const GLYPH_RE = /<span[^>]*class="[^"]*action-glyph[^"]*"[^>]*>\s*([^<]*?)\s*<\/span>/i;

const stripTags = (s) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const trimPunct = (s) => s.replace(/^[\s;:.,—–-]+/, "").replace(/[\s;,]+$/, "").trim();

function labelKind(label) {
  if (ACTIVATE.test(label)) return "activate";
  for (const [kind, re] of Object.entries(LABELS)) if (re.test(label)) return kind;
  return null;
}

/** Trim dangling paragraph boundaries so a fragment can be re-wrapped in <p>. */
function cleanFragment(html) {
  return String(html ?? "")
    .replace(/^[\s;:]*(<\/p>\s*)?/i, "")
    .replace(/(\s|;|<\/p>|<p[^>]*>|<br\s*\/?>|<hr[^>]*>)+$/i, "")
    .trim();
}

export function parseActivations(html) {
  const src = String(html ?? "");
  const marks = [];
  const re = /<strong[^>]*>([\s\S]*?)<\/strong>/gi;
  let m;
  while ((m = re.exec(src))) {
    const label = stripTags(m[1]);
    const kind = labelKind(label);
    if (kind) marks.push({ label, kind, start: m.index, end: re.lastIndex });
  }

  const out = [];
  const acts = marks.filter((mk) => mk.kind === "activate");
  acts.forEach((act, a) => {
    // Next activation starts a new one; inside, <hr> separates Trigger from Effect, so only the
    // text after the last labeled segment is cut at the first <hr> or heading.
    const limit = acts[a + 1]?.start ?? src.length;
    const segs = marks.filter((mk) => mk.start >= act.start && mk.start < limit);
    const last = segs[segs.length - 1];
    const stop = src.slice(last.end, limit).search(/<hr\b|<h[1-6]\b/i);
    const regionEnd = stop >= 0 ? last.end + stop : limit;

    const content = (i) => src.slice(segs[i].end, segs[i + 1]?.start ?? regionEnd);
    const head = content(0);
    const glyphMatch = head.match(GLYPH_RE);
    const glyph = GLYPHS[String(glyphMatch?.[1] ?? "").trim().toLowerCase()];
    if (!glyph) return;

    const dash = act.label.split(/\s*[—–]\s*|\s+-\s+/);
    const name = dash.length > 1 ? dash.slice(1).join(" — ").trim() : "";
    const traitsText = trimPunct(stripTags(head.replace(GLYPH_RE, "")).split(";")[0]).replace(/^\(|\)$/g, "");
    const traits = traitsText ? traitsText.split(/\s*,\s*/).map((t) => t.toLowerCase()).filter(Boolean) : [];

    const fields = { frequency: "", trigger: "", requirements: "", effect: "" };
    const parts = [];
    for (let i = 1; i < segs.length; i++) {
      const raw = content(i);
      const text = trimPunct(stripTags(raw));
      if (segs[i].kind in fields && !fields[segs[i].kind]) fields[segs[i].kind] = text;
      parts.push(`<p><strong>${segs[i].label}</strong> ${cleanFragment(raw)}</p>`);
    }

    out.push({
      index: out.length,
      name,
      actionType: glyph[0],
      actions: glyph[1],
      traits,
      frequency: fields.frequency,
      trigger: fields.trigger,
      requirements: fields.requirements,
      effect: fields.effect,
      html: parts.join("\n")
    });
  });
  return out;
}

/** "once per day" → { max: 1, per: "day" } in PF2e frequency terms, or null. */
export function parseFrequency(text) {
  const t = String(text ?? "").toLowerCase();
  const counts = { once: 1, twice: 2, "three times": 3, "1": 1, "2": 2, "3": 3 };
  const cm = t.match(/\b(once|twice|three times|\d+)\b/);
  const max = cm ? (counts[cm[1]] ?? Number(cm[1])) : null;
  if (!max) return null;
  const pers = [
    [/per (turn)/, "turn"], [/per (round)/, "round"], [/per (10 minutes)/, "PT10M"],
    [/per (minute)/, "PT1M"], [/per (hour)/, "PT1H"], [/per (day)/, "day"], [/per (week)/, "P1W"],
    [/per (month)/, "P1M"], [/per (year)/, "P1Y"]
  ];
  for (const [re, per] of pers) if (re.test(t)) return { max, per };
  return null;
}

export function glyphText(actionType, actions) {
  if (actionType === "reaction") return "⟲";
  if (actionType === "free") return "◇";
  return "◆".repeat(Math.max(1, Math.min(3, Number(actions) || 1)));
}
