import { MODULE_ID } from "./constants.js";
import { openAttune, refreshAttune, toggleAttune } from "./app.js";
import { hasRunes, itemActivations } from "./adapter.js";
import { cleanupForItem, grantedFor } from "./grants.js";

const ICON = "fa-solid fa-gem";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "showParty", {
    name: "ATTUNE.Settings.ShowParty.Name",
    hint: "ATTUNE.Settings.ShowParty.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => refreshAttune()
  });

  game.settings.register(MODULE_ID, "partyVisible", {
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "sheetBadges", {
    name: "ATTUNE.Settings.SheetBadges.Name",
    hint: "ATTUNE.Settings.SheetBadges.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.keybindings.register(MODULE_ID, "toggle", {
    name: "ATTUNE.Keybind",
    hint: "ATTUNE.KeybindHint",
    editable: [{ key: "KeyR", modifiers: ["Shift"] }],
    onDown: () => {
      toggleAttune();
      return true;
    }
  });

  const load = foundry.applications?.handlebars?.loadTemplates ?? globalThis.loadTemplates;
  load([`modules/${MODULE_ID}/templates/attune.hbs`]);
});

Hooks.once("ready", () => {
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = { open: openAttune, toggle: toggleAttune };
});

/* ---------- Entry points ---------- */

// Triad installed: Attune's button lives in the tray's utility bar, for the character on display,
// and leaves the character sheet header. Older Triad versions without registerTool keep the sheet button.
Hooks.on("triad.ready", (api) => {
  if (typeof api?.registerTool !== "function") return;
  api.registerTool({
    id: MODULE_ID,
    label: "ATTUNE.Open",
    icon: ICON,
    order: 10,
    visible: (actor) => actor?.type === "character",
    onClick: (actor) => openAttune({ actorId: actor.id })
  });
});

/** True once Triad hosts the button, so the sheet does not show a second one. */
const inTriad = () => game.triad?.api?.hasTool?.(MODULE_ID) === true;

// Token controls (left toolbar)
Hooks.on("getSceneControlButtons", (controls) => {
  const title = game.i18n.localize("ATTUNE.Open");
  if (Array.isArray(controls)) {
    const token = controls.find((c) => c.name === "token");
    token?.tools.push({ name: MODULE_ID, title, icon: ICON, button: true, onClick: () => openAttune() });
    return;
  }
  const tokens = controls.tokens ?? controls.token;
  if (!tokens?.tools) return;
  tokens.tools[MODULE_ID] = {
    name: MODULE_ID,
    title,
    icon: ICON,
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => openAttune()
  };
});

// Character sheet header (AppV1 PF2e sheet)
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  if (sheet.actor?.type !== "character" || inTriad()) return;
  buttons.unshift({
    label: game.i18n.localize("ATTUNE.Button"),
    class: "attune-open-sheet",
    icon: ICON,
    onclick: () => openAttune({ actorId: sheet.actor.id })
  });
});

// Character sheet header (ApplicationV2 sheets, if PF2e migrates)
Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
  if (app.document?.type !== "character" || inTriad()) return;
  controls.push({
    icon: ICON,
    label: "ATTUNE.Button",
    onClick: () => openAttune({ actorId: app.document.id })
  });
});

// Inventory badges: a small icon next to items with runes or activations
Hooks.on("renderCharacterSheetPF2e", (sheet, html) => {
  if (!game.settings.get(MODULE_ID, "sheetBadges")) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (root) injectInventoryBadges(root, sheet.actor);
});

function injectInventoryBadges(root, actor) {
  if (!actor) return;
  const granted = grantedFor(actor);
  const scope = root.querySelector(".tab[data-tab='inventory']") ?? root;
  const seen = new Set();
  for (const row of scope.querySelectorAll("[data-item-id]")) {
    const id = row.dataset.itemId;
    if (seen.has(id) || row.querySelector(":scope .attune-badge")) continue;
    const item = actor.items.get(id);
    if (!item || !["weapon", "armor", "shield", "equipment"].includes(item.type)) continue;
    if (item.isIdentified === false && !game.user.isGM) continue;
    seen.add(id);

    const acts = itemActivations(item);
    const runes = hasRunes(item);
    if (!acts.length && !runes) continue;

    const pending = acts.filter((a) => !granted.has(`${item.id}#${a.index}`)).length;
    const hasReaction = acts.some((a) => a.actionType === "reaction");
    const L = game.i18n;
    const badge = document.createElement("a");
    badge.className = `attune-badge${pending ? " is-pending" : ""}`;
    badge.dataset.tooltip = pending
      ? L.format("ATTUNE.Badge.Pending", { n: pending })
      : L.localize(acts.length ? "ATTUNE.Badge.Activations" : "ATTUNE.Badge.Runes");
    badge.innerHTML = acts.length
      ? `<i class="fa-solid ${hasReaction ? "fa-rotate-left" : "fa-bolt"}"></i>`
      : `<i class="${ICON}"></i>`;
    badge.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openAttune({ itemKey: `${actor.id}.${item.id}` });
    });

    const nameEl = row.querySelector(".item-name h4, .item-name, h4") ?? row;
    nameEl.append(badge);
  }
}

/* ---------- Lifecycle & live refresh ---------- */

const touchesCharacter = (item) => item?.parent?.documentName === "Actor" && item.parent.type === "character";

Hooks.on("deleteItem", (item, options, userId) => {
  if (!touchesCharacter(item)) return;
  if (userId === game.user.id && item.type !== "action") cleanupForItem(item);
  refreshAttune();
});
for (const hook of ["createItem", "updateItem"]) {
  Hooks.on(hook, (item) => { if (touchesCharacter(item)) refreshAttune(); });
}
Hooks.on("updateActor", (actor, changes) => {
  if (actor.type === "character" && ("name" in changes || "img" in changes || "ownership" in changes)) refreshAttune();
});
