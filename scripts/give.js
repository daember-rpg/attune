import { MODULE_ID } from "./constants.js";
import { fmt } from "./model.js";

/**
 * Giving an item to another character.
 *
 * A player may only change actors they own. When the giver owns both characters (or is a GM)
 * the transfer happens right here. Otherwise the request travels to the active GM as a hidden,
 * GM-whispered chat message — the reliable cross-client channel — and the GM's client moves the
 * item with the system's own transfer, then sends a hidden notice so the people involved get a toast.
 * Neither message is ever shown in the chat log, and the GM deletes both.
 */

const REQUEST = "giveRequest";
const NOTICE = "giveNotice";

const L = () => {
  const fallback = game.i18n._fallback?.ATTUNE?.UI ?? {};
  const current = game.i18n.translations?.ATTUNE?.UI ?? {};
  return { ...fallback, ...current };
};

export function isPhysical(item) {
  if (!item) return false;
  if (typeof item.isOfType === "function") return item.isOfType("physical");
  return ["weapon", "armor", "shield", "equipment", "consumable", "treasure", "backpack", "book"].includes(item.type);
}

export function canGiveFrom(actor, item) {
  return !!actor?.isOwner && actor.type === "character" && isPhysical(item) && item.parent === actor;
}

const activeGM = () => game.users.activeGM ?? game.users.find((u) => u.isGM && u.active) ?? null;
export const gmOnline = () => !!activeGM();

/** True when the current user cannot change the target and the GM has to make the move. */
export const needsGM = (target) => !!target && !target.isOwner;

const playerOwners = (actor) => game.users.filter((u) => !u.isGM && actor.testUserPermission(u, "OWNER"));

/** Characters an item can go to: the party plus every character the user owns, minus the giver. */
export function recipientsFor(source) {
  const L_ = L();
  const party = (game.actors.party?.members ?? []).filter((a) => a?.type === "character");
  const pool = party.length ? party : game.actors.filter((a) => a.type === "character" && a.hasPlayerOwner);
  const own = game.actors.filter((a) => a.type === "character" && a.isOwner && (game.user.isGM ? a.hasPlayerOwner : true));
  const seen = new Set([source.id]);
  const out = [];
  for (const a of [...pool, ...own]) {
    if (!a || seen.has(a.id)) continue;
    seen.add(a.id);
    const isOwn = !game.user.isGM && a.isOwner;
    const players = playerOwners(a).map((u) => u.name).join(", ");
    out.push({ id: a.id, name: a.name, img: a.img, isOwn, sub: isOwn ? L_.giveYours : (players || L_.giveNoPlayer) });
  }
  return out.sort((a, b) => (b.isOwn - a.isOwn) || a.name.localeCompare(b.name));
}

/** Move `quantity` of `item` from `source` to `target`. Must run on a client that owns both. */
async function transfer(source, item, target, quantity) {
  if (typeof source.transferItemToActor === "function") {
    return source.transferItemToActor(target, item, quantity);
  }
  // Fallback for systems without transferItemToActor: copy, then reduce or remove the original.
  const data = item.toObject();
  delete data._id;
  foundry.utils.setProperty(data, "system.quantity", quantity);
  foundry.utils.setProperty(data, "system.containerId", null);
  const [created] = await target.createEmbeddedDocuments("Item", [data]);
  const have = Number(item.system?.quantity) || 1;
  if (quantity >= have) await item.delete();
  else await item.update({ "system.quantity": have - quantity });
  return created;
}

function noticeText(n) {
  const labels = L();
  const qty = n.quantity > 1 ? `${n.quantity}× ` : "";
  return fmt(labels.giveNotice, { giver: n.sourceName, item: `${qty}${n.itemName}`, target: n.targetName });
}

/**
 * Give an item. Returns true when the item moved (or the request reached the GM).
 * @param {{ source: Actor, item: Item, target: Actor, quantity: number }} args
 */
export async function giveItem({ source, item, target, quantity }) {
  const labels = L();
  if (!canGiveFrom(source, item) || !target || target.id === source.id) return false;
  const have = Number(item.system?.quantity) || 1;
  const qty = Math.max(1, Math.min(have, Math.floor(Number(quantity) || 1)));
  const info = { sourceName: source.name, targetName: target.name, itemName: item.name, quantity: qty };

  if (!needsGM(target)) {
    try {
      await transfer(source, item, target, qty);
      ui.notifications.info(noticeText(info));
      return true;
    } catch (err) {
      console.error(`${MODULE_ID} | give failed`, err);
      ui.notifications.error(labels.giveError);
      return false;
    }
  }

  const gm = activeGM();
  if (!gm) {
    ui.notifications.warn(labels.giveNoGM);
    return false;
  }
  await ChatMessage.create({
    content: `<p>${noticeText(info)}</p>`,
    whisper: game.users.filter((u) => u.isGM).map((u) => u.id),
    flags: {
      [MODULE_ID]: {
        [REQUEST]: { sourceId: source.id, itemId: item.id, targetId: target.id, quantity: qty, userId: game.user.id }
      }
    }
  });
  ui.notifications.info(fmt(labels.giveSent, { item: item.name, target: target.name }));
  return true;
}

/* ---------- GM side ---------- */

async function processRequest(message) {
  const req = message.flags?.[MODULE_ID]?.[REQUEST];
  const author = game.users.get(req?.userId) ?? message.author;
  const source = game.actors.get(req?.sourceId);
  const target = game.actors.get(req?.targetId);
  const item = source?.items.get(req?.itemId);
  const fail = (why) => {
    console.warn(`${MODULE_ID} | give request refused: ${why}`, req);
    sendNotice({ error: true, userIds: [author?.id].filter(Boolean), sourceName: source?.name ?? "?", targetName: target?.name ?? "?", itemName: item?.name ?? "?", quantity: req?.quantity ?? 1 });
  };

  try {
    if (!author || !source || !target || !item) return fail("missing actor or item");
    if (!source.testUserPermission(author, "OWNER")) return fail("requester does not own the giver");
    if (target.type !== "character" || !isPhysical(item)) return fail("invalid target or item");
    const have = Number(item.system?.quantity) || 1;
    const qty = Math.max(1, Math.min(have, Math.floor(Number(req.quantity) || 1)));
    await transfer(source, item, target, qty);
    const info = { sourceName: source.name, targetName: target.name, itemName: item.name, quantity: qty };
    ui.notifications.info(noticeText(info));
    const userIds = new Set([author.id, ...playerOwners(target).map((u) => u.id)]);
    sendNotice({ ...info, userIds: [...userIds] });
  } catch (err) {
    console.error(`${MODULE_ID} | give request failed`, err);
    fail(err?.message ?? "error");
  } finally {
    message.delete().catch(() => {});
  }
}

async function sendNotice({ userIds, ...info }) {
  const ids = userIds.filter((id) => id && id !== game.user.id);
  if (!ids.length) return;
  const msg = await ChatMessage.create({
    content: `<p>${noticeText(info)}</p>`,
    whisper: ids,
    flags: { [MODULE_ID]: { [NOTICE]: info } }
  });
  setTimeout(() => msg?.delete().catch(() => {}), 15000);
}

/* ---------- Wiring ---------- */

const isHidden = (message) => {
  const f = message?.flags?.[MODULE_ID];
  return !!(f?.[REQUEST] || f?.[NOTICE]);
};

function hide(html) {
  const el = html instanceof HTMLElement ? html : html?.[0];
  if (el) {
    el.hidden = true;
    el.style.display = "none";
  }
}

export function registerGive() {
  Hooks.on("createChatMessage", (message) => {
    const f = message.flags?.[MODULE_ID];
    if (!f) return;
    if (f[REQUEST] && game.user.id === activeGM()?.id) processRequest(message);
    if (f[NOTICE] && message.whisper?.includes(game.user.id)) {
      const n = f[NOTICE];
      if (n.error) ui.notifications.warn(fmt(L().giveRefused, { item: n.itemName, target: n.targetName }));
      else ui.notifications.info(noticeText(n));
    }
  });
  Hooks.on("renderChatMessageHTML", (message, html) => { if (isHidden(message)) hide(html); });
  Hooks.on("renderChatMessage", (message, html) => { if (isHidden(message)) hide(html); });
}
