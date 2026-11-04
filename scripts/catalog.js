import { MODULE_ID, RUNE_PACKS } from "./constants.js";
import { humanize, kebab } from "./model.js";

const TIER_SLUGS = {
  striking: ["striking", "greater-striking", "major-striking"],
  resilient: ["resilient", "greater-resilient", "major-resilient"],
  reinforcing: [
    "minor-reinforcing", "lesser-reinforcing", "moderate-reinforcing",
    "greater-reinforcing", "major-reinforcing", "supreme-reinforcing"
  ]
};
const GRADE_PREFIX = /^(minor|lesser|moderate|greater|major|true|supreme)-(.+)$/;

function localize(key) {
  if (!key) return "";
  const k = String(key);
  if (game.i18n.has?.(k)) return game.i18n.localize(k);
  // An unresolved i18n key ("PF2E.Something.Name") is not a label; plain text is.
  return /^[\w-]+(\.[\w-]+)+$/.test(k) ? "" : k;
}

function slugify(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isPredicated(p) {
  if (!p) return false;
  if (Array.isArray(p)) return p.length > 0;
  return typeof p === "object" ? Object.keys(p).length > 0 : true;
}

/**
 * Rune metadata from CONFIG.PF2E.runes plus an index of rune items (usage "etched-onto-…")
 * from the PF2e equipment compendium, the Tarlan compendiums and world packs — used for
 * labels of custom runes and for the description text.
 */
export class RuneCatalog {
  constructor() {
    this.entries = new Map();
    this.loaded = false;
    this._loading = null;
  }

  get runeData() {
    return CONFIG.PF2E?.runes ?? {};
  }

  property(category, slug) {
    const group = category === "armor" ? "armor" : category === "shield" ? "shield" : "weapon";
    const data = this.runeData?.[group]?.property?.[slug];
    const legacy = group === "armor" ? CONFIG.PF2E?.armorPropertyRunes?.[slug] : CONFIG.PF2E?.weaponPropertyRunes?.[slug];
    const entry = this.find(this.candidates(category, "property", slug));
    const label = localize(data?.name) || localize(legacy) || entry?.name || humanize(slug);
    const damage = (data?.damage?.dice ?? []).map((d) => ({
      diceNumber: d.diceNumber ?? 1,
      dieSize: d.dieSize ?? "",
      damageType: d.damageType,
      typeLabel: (localize(CONFIG.PF2E?.damageTypes?.[d.damageType]) || d.damageType || "").toLowerCase(),
      conditional: isPredicated(d.predicate)
    }));
    return { label, level: data?.level ?? entry?.level, rarity: data?.rarity ?? "common", damage };
  }

  fundamental(category, kind, n) {
    const d = this.runeData?.[category]?.[kind]?.[n];
    if (d?.level) return { level: d.level };
    return { level: this.find(this.candidates(category, kind, n))?.level };
  }

  candidates(category, kind, value) {
    if (kind === "property") {
      const k = kebab(value);
      const out = [String(value), k];
      const m = k.match(GRADE_PREFIX);
      if (m) out.push(`${m[2]}-${m[1]}`);
      return out;
    }
    const n = Number(value);
    if (kind === "potency") {
      const p = category === "armor" ? "armor" : "weapon";
      return [`${p}-potency-${n}`, `${n}-${p}-potency`];
    }
    const t = TIER_SLUGS[kind]?.[n - 1];
    return t ? [t] : [];
  }

  find(cands) {
    for (const c of cands) {
      const e = this.entries.get(c);
      if (e) return e;
    }
    return null;
  }

  async load() {
    if (this.loaded) return;
    this._loading ??= (async () => {
      const fields = ["system.slug", "system.usage.value", "system.level.value"];
      for (const pack of game.packs) {
        if (pack.documentName !== "Item") continue;
        const id = pack.collection;
        if (!(RUNE_PACKS.includes(id) || pack.metadata?.packageType === "world")) continue;
        try {
          const index = await pack.getIndex({ fields });
          for (const e of index) this._ingest(e, e.uuid ?? `Compendium.${id}.Item.${e._id}`);
        } catch (err) {
          console.warn(`${MODULE_ID} | could not index ${id}`, err);
        }
      }
      for (const item of game.items ?? []) this._ingest(item, item.uuid);
      this.loaded = true;
    })();
    return this._loading;
  }

  _ingest(e, uuid) {
    const usage = String(foundry.utils.getProperty(e, "system.usage.value") ?? "");
    if (!usage.includes("etched")) return;
    const rec = { uuid, name: e.name, level: foundry.utils.getProperty(e, "system.level.value") };
    const slug = foundry.utils.getProperty(e, "system.slug");
    for (const key of [slug, slugify(e.name)]) if (key && !this.entries.has(key)) this.entries.set(key, rec);
  }

  /** Enriched HTML of the rune item's description, or null. */
  async describe(runeKey) {
    const [category, kind, value] = runeKey.split(":");
    await this.load();
    const entry = this.find(this.candidates(category, kind, value));
    if (!entry) return null;
    const doc = await fromUuid(entry.uuid);
    const raw = doc?.system?.description?.value;
    if (!raw) return null;
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
    return TE.enrichHTML(raw, { async: true, relativeTo: doc });
  }
}
