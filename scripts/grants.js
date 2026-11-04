import { MODULE_ID } from "./constants.js";
import { parseFrequency } from "./activations.js";

/** Legacy activation components mapped to remaster traits. */
const LEGACY_TRAITS = { command: ["auditory", "concentrate"], envision: ["concentrate"], interact: ["manipulate"] };

function mapTraits(words) {
  const known = CONFIG.PF2E?.actionTraits ?? {};
  const out = new Set();
  for (const w of words ?? []) {
    const slug = String(w).toLowerCase().trim();
    for (const t of LEGACY_TRAITS[slug] ?? [slug]) if (t in known) out.add(t);
  }
  return [...out];
}

/** Map of "sourceItemId#index" → granted action item id, for one actor. */
export function grantedFor(actor) {
  const map = new Map();
  for (const it of actor?.items ?? []) {
    if (it.type !== "action") continue;
    const f = it.flags?.[MODULE_ID];
    if (f?.sourceId != null && f.index != null) map.set(`${f.sourceId}#${f.index}`, it.id);
  }
  return map;
}

export function buildActionData(item, act, grantedByText) {
  const name = act.name || item.name;
  const credit = grantedByText ? `<p><em>${grantedByText.replace("{name}", `@UUID[${item.uuid}]{${item.name}}`)}</em></p>\n` : "";
  const traits = mapTraits(act.traits);
  const itemIsMagical = (item.system?.traits?.value ?? []).includes("magical");
  if (itemIsMagical && !traits.includes("magical") && "magical" in (CONFIG.PF2E?.actionTraits ?? {})) traits.push("magical");
  const data = {
    name,
    type: "action",
    img: item.img,
    system: {
      actionType: { value: act.actionType },
      actions: { value: act.actionType === "action" ? (act.actions || 1) : null },
      traits: { value: traits },
      description: { value: credit + act.html }
    },
    flags: { [MODULE_ID]: { sourceId: item.id, index: act.index, name } }
  };
  const freq = parseFrequency(act.frequency);
  if (freq) data.system.frequency = { value: freq.max, max: freq.max, per: freq.per };
  return data;
}

export async function grantActivation(actor, item, act, grantedByText) {
  if (!actor?.isOwner) return null;
  if (grantedFor(actor).has(`${item.id}#${act.index}`)) return null;
  const [created] = await actor.createEmbeddedDocuments("Item", [buildActionData(item, act, grantedByText)]);
  return created ?? null;
}

export async function revokeActivation(actor, item, index) {
  const id = grantedFor(actor).get(`${item.id}#${index}`);
  if (id && actor.isOwner) await actor.deleteEmbeddedDocuments("Item", [id]);
}

/** When the source item leaves the actor, its granted actions go with it. */
export async function cleanupForItem(item) {
  const actor = item.parent;
  if (!actor || actor.documentName !== "Actor" || !actor.isOwner) return;
  const ids = actor.items
    .filter((it) => it.type === "action" && it.flags?.[MODULE_ID]?.sourceId === item.id)
    .map((it) => it.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
}
