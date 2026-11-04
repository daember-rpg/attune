import { MODULE_ID } from "./constants.js";
import { parseActivations } from "./activations.js";
import { grantedFor } from "./grants.js";

const RUNE_TYPES = new Set(["weapon", "armor", "shield"]);
const byName = (a, b) => a.name.localeCompare(b.name);

/** Characters the current user may browse, own characters first. */
export function collectOwners() {
  const user = game.user;
  const chars = game.actors.filter((a) => a.type === "character");
  const own = user.isGM ? chars.filter((a) => a.hasPlayerOwner) : chars.filter((a) => a.isOwner);
  const ownIds = new Set(own.map((a) => a.id));

  let party = [];
  if (!user.isGM && game.settings.get(MODULE_ID, "showParty")) {
    const members = game.actors.party?.members ?? chars.filter((a) => a.hasPlayerOwner);
    party = members.filter((a) => a?.type === "character" && !ownIds.has(a.id) && a.testUserPermission(user, "LIMITED"));
  }

  const toOwner = (actor, isOwn, isParty = false) => {
    const granted = grantedFor(actor);
    return {
      id: actor.id,
      name: actor.name,
      img: actor.img,
      isOwn,
      isParty,
      items: actor.items.map((i) => normalizeItem(i, actor, granted)).filter(Boolean)
    };
  };

  return [
    ...own.sort(byName).map((a) => toOwner(a, !user.isGM)),
    ...party.sort(byName).map((a) => toOwner(a, false, true))
  ];
}

function carryState(item) {
  if (item.isEquipped) return "equipped";
  const type = item.system?.equipped?.carryType;
  if (item.isStowed || type === "stowed") return "stowed";
  return "carried";
}

function traitSet(item) {
  const t = item.system?.traits?.value;
  return new Set(Array.isArray(t) ? t : []);
}

export function itemActivations(item) {
  if (item.isIdentified === false && !game.user.isGM) return [];
  return parseActivations(item.system?.description?.value);
}

/** Rune state in brief — used by the inventory badges on the character sheet. */
export function hasRunes(item) {
  const r = item.system?.runes;
  if (!r) return false;
  return !!(r.potency || r.striking || r.resilient || r.reinforcing || r.property?.length);
}

export function normalizeItem(item, actor, granted = grantedFor(actor)) {
  const isRuneType = RUNE_TYPES.has(item.type);
  const isGear = item.type === "equipment";
  if (!isRuneType && !isGear) return null;

  const hidden = item.isIdentified === false && !game.user.isGM;
  const activations = hidden ? [] : itemActivations(item);
  const traits = traitSet(item);
  // Mundane gear (rope, torches…) stays out; magic gear and anything with an activation is in.
  if (isGear && !activations.length && !traits.has("invested") && !traits.has("magical")) return null;

  const sys = item.system ?? {};
  const src = item._source?.system ?? {};
  const runes = sys.runes ?? {};

  let price = "";
  let priceGp = 0;
  try {
    const v = item.price?.value;
    price = v?.toString?.() ?? "";
    priceGp = v?.goldValue ?? 0;
  } catch { /* price is cosmetic */ }

  const dt = sys.damage?.damageType;
  const unidentified = sys.identification?.unidentified ?? {};
  const grantedHere = {};
  for (const a of activations) {
    const id = granted.get(`${item.id}#${a.index}`);
    if (id) grantedHere[a.index] = id;
  }

  return {
    key: `${actor.id}.${item.id}`,
    actorId: actor.id,
    itemId: item.id,
    ownerName: actor.name,
    name: hidden ? (unidentified.name || item.name) : item.name,
    img: hidden ? (unidentified.img || item.img) : item.img,
    category: isGear ? "gear" : item.type,
    level: item.level ?? sys.level?.value ?? 0,
    price: hidden ? "" : price,
    priceGp,
    carry: carryState(item),
    hidden,
    canOpen: item.testUserPermission(game.user, "OBSERVER"),
    canEdit: actor.isOwner,
    invested: traits.has("invested") ? !!item.isInvested : null,
    activations,
    granted: grantedHere,
    runes: {
      potency: runes.potency ?? 0,
      striking: runes.striking ?? 0,
      resilient: runes.resilient ?? 0,
      reinforcing: runes.reinforcing ?? 0,
      property: [...(runes.property ?? [])].filter(Boolean)
    },
    base: {
      // _source avoids counting striking twice if the system already folded it into damage.dice
      dice: src.damage?.dice ?? sys.damage?.dice ?? 1,
      die: src.damage?.die ?? sys.damage?.die ?? "",
      damageTypeLabel: dt ? game.i18n.localize(CONFIG.PF2E?.damageTypes?.[dt] ?? dt).toLowerCase() : "",
      acBonus: src.acBonus ?? sys.acBonus ?? 0,
      hardness: sys.hardness ?? 0,
      maxHp: sys.hp?.max ?? 0
    }
  };
}
