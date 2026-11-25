import { MODULE_ID } from "./constants.js";
import { buildView, COMPARE_MAX, fmt, initialState, toggleCompareKey } from "./model.js";
import { bindSearch } from "./dom.js";
import { collectOwners, itemActivations } from "./adapter.js";
import { grantActivation, revokeActivation } from "./grants.js";
import { openGive } from "./give-app.js";
import { RuneCatalog } from "./catalog.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const catalog = new RuneCatalog();

export function uiLabels() {
  const fallback = game.i18n._fallback?.ATTUNE?.UI ?? {};
  const current = game.i18n.translations?.ATTUNE?.UI ?? {};
  return { ...fallback, ...current };
}

export class AttuneApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-app`,
    classes: [MODULE_ID],
    tag: "div",
    window: { title: "ATTUNE.Title", icon: "fa-solid fa-gem", resizable: true },
    position: { width: 940, height: 640 },
    actions: {
      select: AttuneApp.#onSelect,
      toggleCompare: AttuneApp.#onToggleCompare,
      clearCompare: AttuneApp.#onClearCompare,
      setTab: AttuneApp.#onSetTab,
      setFilter: AttuneApp.#onSetFilter,
      toggleRune: AttuneApp.#onToggleRune,
      toggleDiff: AttuneApp.#onToggleDiff,
      toggleActivation: AttuneApp.#onToggleActivation,
      addAll: AttuneApp.#onAddAll,
      toggleParty: AttuneApp.#onToggleParty,
      giveItem: AttuneApp.#onGiveItem,
      openSheet: AttuneApp.#onOpenSheet
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/attune.hbs`,
      scrollable: [".at-rail-list", ".at-pane"]
    }
  };

  state = Object.assign(initialState(), { showParty: !!game.settings.get(MODULE_ID, "partyVisible") });

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, buildView({ owners: collectOwners(), state: this.state, L: uiLabels(), catalog }));
  }

  async _preFirstRender(context, options) {
    await super._preFirstRender(context, options);
    if (!catalog.loaded) catalog.load().then(() => { if (this.rendered) this.render(); });
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    if (this.state.showParty !== game.settings.get(MODULE_ID, "partyVisible")) {
      game.settings.set(MODULE_ID, "partyVisible", this.state.showParty);
    }
    bindSearch(this.element, this.state);
  }

  static #onSelect(event, target) {
    this.state.selectedKey = target.dataset.key;
    this.state.reveal = target.dataset.reveal === "true";
    this.state.expandedRune = null;
    this.state.tab = "detail";
    this.render();
  }

  static #onToggleCompare(event, target) {
    const result = toggleCompareKey(this.state, target.dataset.key);
    if (result === "full") ui.notifications.warn(fmt(uiLabels().compareFull, { max: COMPARE_MAX }));
    this.render();
  }

  static #onClearCompare() {
    this.state.compareKeys = [];
    this.render();
  }

  static #onSetTab(event, target) {
    this.state.tab = target.dataset.tab;
    this.render();
  }

  static #onSetFilter(event, target) {
    this.state.filter = target.dataset.filter;
    this.render();
  }

  static #onToggleDiff() {
    this.state.diffOnly = !this.state.diffOnly;
    this.render();
  }

  static async #onToggleRune(event, target) {
    const key = target.dataset.rune;
    const state = this.state;
    state.expandedRune = state.expandedRune === key ? null : key;
    if (state.expandedRune && !state.descriptions[key]) {
      state.descriptions[key] = { loading: true };
      this.render();
      let html = null;
      try {
        html = key.startsWith("act:") ? await describeActivation(key) : await catalog.describe(key);
      } catch (err) {
        console.warn(`${MODULE_ID} | could not load description for ${key}`, err);
      }
      state.descriptions[key] = { loading: false, html: html ?? "" };
    }
    this.render();
  }

  static async #onToggleActivation(event, target) {
    const found = resolveItem(target.dataset.key);
    if (!found) return;
    const index = Number(target.dataset.index);
    const act = itemActivations(found.item).find((a) => a.index === index);
    if (!act) return;
    const L = uiLabels();
    target.disabled = true;
    try {
      if (target.dataset.on === "true") {
        await revokeActivation(found.actor, found.item, index);
        ui.notifications.info(fmt(L.removedNotice, { name: act.name || found.item.name, actor: found.actor.name }));
      } else {
        await grantActivation(found.actor, found.item, act, L.grantedBy);
        ui.notifications.info(fmt(L.addedNotice, { name: act.name || found.item.name, actor: found.actor.name }));
      }
    } catch (err) {
      console.error(`${MODULE_ID} | could not update ${found.actor.name}'s actions`, err);
      ui.notifications.error(L.grantError);
    }
    this.render();
  }

  static async #onAddAll(event, target) {
    const found = resolveItem(target.dataset.key);
    if (!found) return;
    const L = uiLabels();
    target.disabled = true;
    let n = 0;
    for (const act of itemActivations(found.item)) {
      if (await grantActivation(found.actor, found.item, act, L.grantedBy)) n += 1;
    }
    if (n) ui.notifications.info(fmt(L.addedAllNotice, { n, actor: found.actor.name }));
    this.render();
  }

  static #onToggleParty() {
    this.state.showParty = !this.state.showParty;
    this.render();
  }

  static #onGiveItem(event, target) {
    const found = resolveItem(target.dataset.key);
    if (found) openGive(found.actor, found.item);
  }

  static #onOpenSheet(event, target) {
    const [actorId, itemId] = String(target.dataset.key).split(".");
    game.actors.get(actorId)?.items.get(itemId)?.sheet?.render(true);
  }
}

function resolveItem(key) {
  const [actorId, itemId] = String(key ?? "").split(".");
  const actor = game.actors.get(actorId);
  const item = actor?.items.get(itemId);
  return actor && item ? { actor, item } : null;
}

async function describeActivation(descKey) {
  const [itemKey, index] = descKey.slice(4).split("#");
  const found = resolveItem(itemKey);
  const act = found && itemActivations(found.item).find((a) => a.index === Number(index));
  if (!act?.html) return null;
  const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  return TE.enrichHTML(act.html, { async: true, relativeTo: found.item });
}

let instance = null;

export function openAttune({ actorId, itemKey } = {}) {
  instance ??= new AttuneApp();
  if (actorId) instance.state.focusActor = actorId;
  if (itemKey) instance.state.focusItem = itemKey;
  instance.render({ force: true });
  if (instance.rendered) instance.bringToFront?.();
  return instance;
}

export function toggleAttune() {
  if (instance?.rendered) return instance.close();
  return openAttune();
}

export const refreshAttune = foundry.utils.debounce(() => {
  if (instance?.rendered) instance.render();
}, 150);
