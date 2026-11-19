/**
 * Attune view model.
 * Pure functions with no Foundry globals, so the exact same logic drives the module
 * and the standalone HTML preview.
 *
 * Normalized item shape (produced by adapter.js in Foundry, or by mock data in the preview):
 * {
 *   key, actorId, itemId, ownerName, name, img, category: "weapon"|"armor"|"shield"|"gear",
 *   level, price, priceGp, carry: "equipped"|"carried"|"stowed", hidden, canOpen, canEdit,
 *   invested: true|false|null,
 *   runes: { potency, striking, resilient, reinforcing, property: [slug] },
 *   base:  { dice, die, damageTypeLabel, acBonus, hardness, maxHp },
 *   activations: [parseActivations() entries], granted: { [index]: actionItemId }
 * }
 *
 * Catalog interface:
 *   property(category, slug)        -> { label, level, rarity, damage: [{diceNumber, dieSize, damageType, typeLabel, conditional}], effect? }
 *   fundamental(category, kind, n)  -> { level }
 */

import { glyphText } from "./activations.js";

export const COMPARE_MAX = 3;
const CATEGORY_ORDER = ["weapon", "armor", "shield", "gear"];
const FUNDAMENTAL_KINDS = { weapon: ["potency", "striking"], armor: ["potency", "resilient"], shield: ["reinforcing"], gear: [] };

const KIND_ICONS = {
  potency: "fa-gem",
  striking: "fa-burst",
  resilient: "fa-shield-halved",
  reinforcing: "fa-shield",
  property: "fa-diamond"
};

const DAMAGE_ICONS = {
  fire: "fa-fire",
  cold: "fa-snowflake",
  electricity: "fa-bolt",
  acid: "fa-flask",
  sonic: "fa-wave-square",
  spirit: "fa-ghost",
  vitality: "fa-sun",
  void: "fa-skull",
  force: "fa-hand-sparkles",
  poison: "fa-skull-crossbones",
  mental: "fa-brain",
  bleed: "fa-droplet"
};

const TIER_KEYS = {
  striking: ["striking", "greaterStriking", "majorStriking"],
  resilient: ["resilient", "greaterResilient", "majorResilient"],
  reinforcing: [
    "minorReinforcing", "lesserReinforcing", "moderateReinforcing",
    "greaterReinforcing", "majorReinforcing", "supremeReinforcing"
  ]
};

export function fmt(str, data = {}) {
  return String(str ?? "").replace(/\{(\w+)\}/g, (m, k) => (k in data ? data[k] : m));
}

export function humanize(slug) {
  return String(slug ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function kebab(slug) {
  return String(slug ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

const num = (v) => Number(v) || 0;
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

function dieAverage(die) {
  const faces = num(String(die ?? "").replace(/\D/g, ""));
  return faces ? (faces + 1) / 2 : 0;
}

export function initialState() {
  return {
    selectedKey: null,
    compareKeys: [],
    tab: "detail",
    filter: "all",
    search: "",
    expandedRune: null,
    descriptions: {},
    diffOnly: false,
    focusActor: null,
    focusItem: null,
    showParty: false,
    reveal: false
  };
}

/** Returns "added" | "removed" | "full". */
export function toggleCompareKey(state, key) {
  const i = state.compareKeys.indexOf(key);
  if (i >= 0) {
    state.compareKeys.splice(i, 1);
    return "removed";
  }
  if (state.compareKeys.length >= COMPARE_MAX) return "full";
  state.compareKeys.push(key);
  return "added";
}

export function fundamentalName(category, kind, n, L) {
  if (!n) return L[`no_${kind}`] ?? L.none;
  if (kind === "potency") return fmt(category === "armor" ? L.armorPotencyN : L.weaponPotencyN, { n });
  const key = TIER_KEYS[kind]?.[n - 1];
  return (key && L[key]) || `${humanize(kind)} ${n}`;
}

function fundamentalEffect(category, kind, n, L) {
  if (!n) return "";
  switch (kind) {
    case "potency": {
      const bonus = fmt(category === "armor" ? L.effectPotencyArmor : L.effectPotencyWeapon, { n });
      return `${bonus} · ${fmt(n === 1 ? L.slotOne : L.slotMany, { n })}`;
    }
    case "striking": return fmt(L.effectStriking, { n: n + 1 });
    case "resilient": return fmt(L.effectResilient, { n });
    case "reinforcing": return L.effectReinforcing;
    default: return "";
  }
}

function descState(runeKey, state) {
  const expanded = state.expandedRune === runeKey;
  const d = state.descriptions?.[runeKey];
  return {
    expanded,
    descLoading: expanded && (!d || d.loading),
    descHtml: expanded && d && !d.loading ? (d.html ?? "") : "",
    descMissing: expanded && !!d && !d.loading && !d.html
  };
}

function damageText(entries, L) {
  return (entries ?? [])
    .map((e) => {
      const base = `+${e.diceNumber ?? 1}${e.dieSize ?? ""} ${e.typeLabel ?? e.damageType ?? ""}`.trim();
      return e.conditional ? `${base} (${L.conditional})` : base;
    })
    .join(", ");
}

function fundamentalRune(item, kind, L, catalog, state) {
  const n = num(item.runes?.[kind]);
  const meta = (n && catalog.fundamental?.(item.category, kind, n)) || {};
  const runeKey = `${item.category}:${kind}:${n}`;
  return {
    kind,
    kindLabel: L[`kind_${kind}`] ?? humanize(kind),
    name: fundamentalName(item.category, kind, n, L),
    value: n,
    present: n > 0,
    icon: `fa-solid ${KIND_ICONS[kind] ?? KIND_ICONS.property}`,
    level: meta.level ? fmt(L.levelN, { n: meta.level }) : "",
    effect: fundamentalEffect(item.category, kind, n, L),
    runeKey,
    ...(n ? descState(runeKey, state) : {})
  };
}

function propertyRune(item, slug, index, total, L, catalog, state) {
  const meta = catalog.property?.(item.category, slug) || {};
  const runeKey = `${item.category}:property:${slug}`;
  const rarity = meta.rarity || "common";
  const damage = meta.damage ?? [];
  const firstType = damage[0]?.damageType;
  return {
    kind: "property",
    slug,
    rarity,
    isRare: rarity !== "common",
    kindLabel: rarity !== "common" ? (L[`rarity_${rarity}`] ?? humanize(rarity)) : L.kind_property,
    name: meta.label || humanize(slug),
    present: true,
    inactive: index >= total,
    icon: `fa-solid ${DAMAGE_ICONS[firstType] ?? KIND_ICONS.property}`,
    level: meta.level ? fmt(L.levelN, { n: meta.level }) : "",
    effect: meta.effect || damageText(damage, L),
    damage,
    runeKey,
    ...descState(runeKey, state)
  };
}

export function itemView(item, L, catalog, state) {
  const category = item.category;
  const runes = item.runes ?? {};
  const hidden = !!item.hidden;

  const fundamentals = hidden ? [] : (FUNDAMENTAL_KINDS[category] ?? []).map((k) => fundamentalRune(item, k, L, catalog, state));
  const slugs = hidden ? [] : [...(runes.property ?? [])];
  const hasSlots = category === "weapon" || category === "armor";
  const total = hasSlots ? num(runes.potency) : 0;
  const properties = slugs.map((s, i) => propertyRune(item, s, i, total, L, catalog, state));
  const emptySlots = Array.from({ length: Math.max(0, total - slugs.length) }, () => ({ isSlot: true }));
  const overflow = slugs.length > total;

  const runeGroups = [];
  if (fundamentals.length) runeGroups.push({ title: L.fundamental, runes: fundamentals, note: "" });
  if (!hidden && (hasSlots || properties.length)) {
    runeGroups.push({
      title: fmt(L.propertySlots, { used: slugs.length, total }),
      runes: [...properties, ...emptySlots],
      note: overflow ? L.overflowNote : ""
    });
  }

  const activations = hidden ? [] : (item.activations ?? []).map((a) => {
    const descKey = `act:${item.key}#${a.index}`;
    const onSheet = !!item.granted?.[a.index];
    return {
      index: a.index,
      itemKey: item.key,
      name: a.name || item.name,
      glyph: glyphText(a.actionType, a.actions),
      glyphCode: a.actionType === "reaction" ? "R" : a.actionType === "free" ? "F" : String(Math.max(1, Math.min(3, Number(a.actions) || 1))),
      actionType: a.actionType,
      typeLabel: a.actionType === "action" ? fmt(a.actions > 1 ? L.actionsN : L.actionOne, { n: a.actions || 1 }) : (L[`type_${a.actionType}`] ?? humanize(a.actionType)),
      traitsText: (a.traits ?? []).map(humanize).join(", "),
      frequency: a.frequency || "",
      trigger: a.trigger || "",
      requirements: a.requirements || "",
      onSheet,
      canEdit: !!item.canEdit,
      descKey,
      ...descState(descKey, state)
    };
  });
  const addable = activations.filter((a) => a.canEdit && !a.onSheet).length;

  const raw = {
    level: num(item.level),
    priceGp: num(item.priceGp),
    potency: num(runes.potency),
    striking: num(runes.striking),
    resilient: num(runes.resilient),
    reinforcing: num(runes.reinforcing),
    used: slugs.length,
    total
  };

  const stats = [];
  if (!hidden) {
    const slotsStat = { label: L.statSlots, value: `${slugs.length}/${total}`, sub: overflow ? L.inactiveExtra : "" };
    if (category === "weapon") {
      const dice = (num(item.base?.dice) || 1) + raw.striking;
      const die = item.base?.die ?? "";
      const active = properties.filter((p) => !p.inactive);
      const extraAvg = active
        .flatMap((p) => p.damage)
        .filter((e) => !e.conditional)
        .reduce((s, e) => s + (num(e.diceNumber) || 1) * dieAverage(e.dieSize), 0);
      raw.damageText = die ? `${dice}${die} ${item.base?.damageTypeLabel ?? ""}`.trim() : "—";
      raw.avgDamage = dice * dieAverage(die) + extraAvg;
      const extras = active.map((p) => damageText(p.damage, L)).filter(Boolean).join(", ");
      stats.push(
        { label: L.statAttack, value: signed(raw.potency), sub: L.itemBonus },
        { label: L.statDamage, value: raw.damageText, sub: extras },
        slotsStat
      );
    } else if (category === "armor") {
      raw.ac = num(item.base?.acBonus) + raw.potency;
      raw.saves = raw.resilient;
      stats.push(
        { label: L.statAC, value: signed(raw.ac), sub: raw.potency ? fmt(L.inclPotency, { n: raw.potency }) : "" },
        { label: L.statSaves, value: signed(raw.saves), sub: L.itemBonus },
        slotsStat
      );
    } else if (category === "shield") {
      raw.hardness = num(item.base?.hardness);
      raw.hp = num(item.base?.maxHp);
      raw.raise = num(item.base?.acBonus);
      stats.push(
        { label: L.statHardness, value: String(raw.hardness), sub: "" },
        { label: L.statHP, value: String(raw.hp), sub: "" },
        { label: L.statRaise, value: signed(raw.raise), sub: L.circumstance }
      );
    }
  }

  const parts = [];
  if (hidden) parts.push(L.unidentified);
  else {
    const f = [];
    if (raw.potency && category !== "shield") f.push(`+${raw.potency}`);
    for (const k of ["striking", "resilient", "reinforcing"]) if (raw[k]) f.push(fundamentalName(category, k, raw[k], L));
    if (f.length) parts.push(f.join(" "));
    if (properties.length) parts.push(properties.map((p) => p.name).join(", "));
    if (activations.length) parts.push(activations.map((a) => `${a.glyph} ${a.name}`).join(", "));
    if (!parts.length) parts.push(category === "gear" ? L.noActivations : L.noRunes);
  }
  const summary = parts.join(" · ");

  return {
    key: item.key,
    actorId: item.actorId,
    itemId: item.itemId,
    ownerName: item.ownerName,
    name: item.name,
    img: item.img,
    category,
    categoryLabel: L[`cat_${category}`] ?? humanize(category),
    categoryIcon: `fa-solid ${{ weapon: "fa-khanda", armor: "fa-vest", shield: "fa-shield", gear: "fa-ring" }[category] ?? "fa-box"}`,
    levelLabel: fmt(L.levelN, { n: raw.level }),
    price: item.price || "",
    carry: item.carry,
    carryLabel: L[item.carry] ?? "",
    isEquipped: item.carry === "equipped",
    hidden,
    canOpen: !!item.canOpen,
    isInvested: item.invested === true,
    notInvested: item.invested === false,
    investNote: item.invested === false && activations.length ? L.notInvestedNote : "",
    activations,
    hasActivations: activations.length > 0,
    addable,
    hasNew: addable > 0,
    canAddAll: addable > 1,
    summary,
    runeCount: fundamentals.filter((f) => f.present).length + properties.length,
    searchText: [item.name, item.ownerName, summary, ...activations.map((a) => a.trigger)].join(" ").toLowerCase(),
    runeGroups,
    properties,
    stats,
    raw
  };
}

function sortItems(a, b) {
  return (b.isEquipped - a.isEquipped)
    || (CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
    || a.name.localeCompare(b.name);
}

export function compareRows(items, L, diffOnly = false) {
  const rows = [];
  const section = (title) => rows.push({ section: title });
  const row = (label, get, { highlight = true } = {}) => {
    const cells = items.map((it) => {
      const v = it.hidden ? { text: "?" } : get(it);
      if (v == null) return { text: "—", na: true };
      return { text: String(v.text ?? ""), num: v.num, has: !!v.has };
    });
    const diff = new Set(cells.map((c) => c.text)).size > 1;
    if (highlight && diff) {
      const nums = cells.filter((c) => !c.na && typeof c.num === "number");
      if (nums.length > 1) {
        const max = Math.max(...nums.map((c) => c.num));
        const min = Math.min(...nums.map((c) => c.num));
        if (max > min) nums.forEach((c) => { if (c.num === max) c.best = true; });
      }
    }
    rows.push({ label, cells, diff });
  };

  const is = (cat) => (it) => it.category === cat;
  const isWA = (it) => it.category === "weapon" || it.category === "armor";
  const any = (fn) => items.some(fn);

  section(L.sectionGeneral);
  row(L.rowOwner, (it) => ({ text: it.ownerName }), { highlight: false });
  row(L.rowType, (it) => ({ text: it.categoryLabel }), { highlight: false });
  row(L.rowLevel, (it) => ({ text: String(it.raw.level), num: it.raw.level }), { highlight: false });
  row(L.rowPrice, (it) => ({ text: it.price || "—" }), { highlight: false });

  section(L.sectionFundamental);
  if (any(isWA)) row(L.kind_potency, (it) => (isWA(it) ? { text: signed(it.raw.potency), num: it.raw.potency } : null));
  if (any(is("weapon"))) row(L.kind_striking, (it) => (is("weapon")(it)
    ? { text: it.raw.striking ? fundamentalName("weapon", "striking", it.raw.striking, L) : "—", num: it.raw.striking } : null));
  if (any(is("armor"))) row(L.kind_resilient, (it) => (is("armor")(it)
    ? { text: it.raw.resilient ? fundamentalName("armor", "resilient", it.raw.resilient, L) : "—", num: it.raw.resilient } : null));
  if (any(is("shield"))) row(L.kind_reinforcing, (it) => (is("shield")(it)
    ? { text: it.raw.reinforcing ? fundamentalName("shield", "reinforcing", it.raw.reinforcing, L) : "—", num: it.raw.reinforcing } : null));

  section(L.sectionStats);
  if (any(is("weapon"))) row(L.statDamage, (it) => (is("weapon")(it) ? { text: it.raw.damageText, num: it.raw.avgDamage } : null));
  if (any(is("weapon"))) row(L.statAvgDamage, (it) => (is("weapon")(it) ? { text: it.raw.avgDamage.toFixed(1), num: it.raw.avgDamage } : null));
  if (any(is("armor"))) row(L.statAC, (it) => (is("armor")(it) ? { text: signed(it.raw.ac), num: it.raw.ac } : null));
  if (any(is("armor"))) row(L.statSaves, (it) => (is("armor")(it) ? { text: signed(it.raw.saves), num: it.raw.saves } : null));
  if (any(is("shield"))) row(L.statHardness, (it) => (is("shield")(it) ? { text: String(it.raw.hardness), num: it.raw.hardness } : null));
  if (any(is("shield"))) row(L.statHP, (it) => (is("shield")(it) ? { text: String(it.raw.hp), num: it.raw.hp } : null));
  if (any(isWA)) row(L.statSlots, (it) => (isWA(it) ? { text: `${it.raw.used}/${it.raw.total}`, num: it.raw.total } : null));

  const union = new Map();
  for (const it of items) for (const p of it.properties) if (!union.has(p.slug)) union.set(p.slug, p.name);
  if (union.size) {
    section(L.sectionProperty);
    for (const [slug, name] of union) {
      row(name, (it) => {
        if (!isWA(it) && !it.properties.length) return null;
        const p = it.properties.find((x) => x.slug === slug);
        if (!p) return { text: "—" };
        const t = p.effect || "✓";
        return p.inactive ? { text: `${t} (${L.inactive})` } : { text: t, has: true };
      }, { highlight: false });
    }
  }

  const acts = new Map();
  for (const it of items) for (const a of it.activations) if (!acts.has(a.name)) acts.set(a.name, a);
  if (acts.size) {
    section(L.sectionActivations);
    for (const [name] of acts) {
      row(name, (it) => {
        const a = it.activations.find((x) => x.name === name);
        return a ? { text: `${a.glyph} ${a.typeLabel}`, has: true } : { text: "—" };
      }, { highlight: false });
    }
  }

  let out = diffOnly ? rows.filter((r) => r.section || r.diff) : rows;
  out = out.filter((r, i) => !r.section || (out[i + 1] && !out[i + 1].section));
  return out;
}

export function buildView({ owners, state, L, catalog }) {
  const all = new Map();
  const counts = { all: 0, weapon: 0, armor: 0, shield: 0, gear: 0 };
  const sorted = [];

  const countable = (o) => !o.isParty || state.showParty;
  for (const o of owners) {
    const views = (o.items ?? []).map((it) => itemView(it, L, catalog, state)).sort(sortItems);
    for (const v of views) {
      v.isParty = !!o.isParty;
      all.set(v.key, v);
      if (!countable(o)) continue;
      counts.all += 1;
      counts[v.category] = (counts[v.category] ?? 0) + 1;
    }
    sorted.push({ ...o, items: views });
  }

  // Opening a party member's item on purpose (from the sheet badge or the compare table) reveals the party.
  const wanted = all.get(state.focusItem) ?? (state.reveal ? all.get(state.selectedKey) : null);
  if (wanted?.isParty) state.showParty = true;
  state.reveal = false;

  if (state.focusItem && all.has(state.focusItem)) {
    state.filter = "all";
    state.tab = "detail";
    state.selectedKey = state.focusItem;
    state.expandedRune = null;
    state.focusActor = null;
  }
  state.focusItem = null;

  if (state.focusActor) {
    const owner = sorted.find((o) => o.id === state.focusActor);
    if (owner?.items.length) {
      state.filter = "all";
      state.tab = "detail";
      state.selectedKey = owner.items[0].key;
    }
    state.focusActor = null;
  }

  const hasParty = sorted.some((o) => o.isParty && o.items.length);
  const ownersOut = sorted
    .filter((o) => !o.isParty || state.showParty)
    .map((o) => ({ ...o, items: o.items.filter((v) => state.filter === "all" || v.category === state.filter) }))
    .filter((o) => o.items.length);

  state.compareKeys = (state.compareKeys ?? []).filter((k) => all.has(k));
  const visibleKeys = ownersOut.flatMap((o) => o.items.map((i) => i.key));
  if (!visibleKeys.includes(state.selectedKey)) state.selectedKey = visibleKeys[0] ?? null;

  for (const v of all.values()) {
    v.isSelected = v.key === state.selectedKey;
    v.inCompare = state.compareKeys.includes(v.key);
  }

  const compare = state.compareKeys.map((k) => all.get(k));
  const filters = [
    ["all", "fa-layer-group", L.filterAll],
    ["weapon", "fa-khanda", L.filterWeapon],
    ["armor", "fa-vest", L.filterArmor],
    ["shield", "fa-shield", L.filterShield],
    ["gear", "fa-ring", L.filterGear]
  ].map(([id, icon, label]) => ({ id, icon: `fa-solid ${icon}`, label, count: counts[id] ?? 0, active: state.filter === id }));

  return {
    labels: L,
    state,
    owners: ownersOut,
    filters,
    hasAny: counts.all > 0,
    hasParty,
    showParty: !!state.showParty,
    partyLabel: state.showParty ? L.hideParty : L.showParty,
    selected: all.get(state.selectedKey) ?? null,
    isDetail: state.tab !== "compare",
    isCompare: state.tab === "compare",
    compare,
    compareRows: compare.length ? compareRows(compare, L, state.diffOnly) : [],
    compareCount: compare.length,
    compareMax: COMPARE_MAX,
    compareEmptyText: fmt(L.compareEmpty, { max: COMPARE_MAX }),
    diffOnly: !!state.diffOnly
  };
}
