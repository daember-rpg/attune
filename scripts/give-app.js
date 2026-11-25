import { MODULE_ID } from "./constants.js";
import { giveView, clampQuantity } from "./give-model.js";
import { canGiveFrom, giveItem, gmOnline, needsGM, recipientsFor } from "./give.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const labels = () => {
  const fallback = game.i18n._fallback?.ATTUNE?.UI ?? {};
  const current = game.i18n.translations?.ATTUNE?.UI ?? {};
  return { ...fallback, ...current };
};

/** Small window: pick a character, pick a quantity, give. */
export class GiveDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["attune", "attune-give"],
    tag: "div",
    window: { title: "ATTUNE.UI.giveTitle", icon: "fa-solid fa-hand-holding", resizable: false },
    position: { width: 420, height: "auto" },
    actions: {
      pick: GiveDialog.#onPick,
      step: GiveDialog.#onStep,
      all: GiveDialog.#onAll,
      give: GiveDialog.#onGive,
      cancel: GiveDialog.#onCancel
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/give.hbs` }
  };

  constructor({ actor, item, ...options } = {}) {
    super({ ...options, id: `${MODULE_ID}-give-${actor.id}-${item.id}` });
    this.actor = actor;
    this.item = item;
    this.choice = { targetId: null, quantity: 1 };
    this.busy = false;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.item;
    return Object.assign(context, giveView({
      item: { name: item.name, img: item.img, quantity: Number(item.system?.quantity) || 1, ownerName: this.actor.name },
      recipients: recipientsFor(this.actor),
      state: this.choice,
      L: labels(),
      needsGM: (r) => needsGM(r && game.actors.get(r.id)),
      gmOnline: gmOnline()
    }), { busy: this.busy });
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const input = this.element.querySelector(".at-qty-input");
    input?.addEventListener("change", () => {
      this.choice.quantity = clampQuantity(input.value, Number(this.item.system?.quantity) || 1);
      this.render();
    });
    input?.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); input.blur(); } });
  }

  static #onPick(event, target) {
    this.choice.targetId = target.dataset.id;
    this.render();
  }

  static #onStep(event, target) {
    this.choice.quantity += Number(target.dataset.step) || 0;
    this.render();
  }

  static #onAll() {
    this.choice.quantity = Number(this.item.system?.quantity) || 1;
    this.render();
  }

  static async #onGive() {
    if (this.busy) return;
    const target = game.actors.get(this.choice.targetId);
    if (!target) return;
    this.busy = true;
    this.render();
    const ok = await giveItem({ source: this.actor, item: this.item, target, quantity: this.choice.quantity });
    this.busy = false;
    if (ok) this.close();
    else this.render();
  }

  static #onCancel() {
    this.close();
  }
}

export function openGive(actor, item) {
  if (!canGiveFrom(actor, item)) {
    ui.notifications.warn(labels().giveCannot);
    return null;
  }
  try {
    const app = new GiveDialog({ actor, item });
    app.render({ force: true }).catch((err) => {
      console.error(`${MODULE_ID} | could not open the Give dialog`, err);
      ui.notifications.error(labels().giveError);
    });
    return app;
  } catch (err) {
    console.error(`${MODULE_ID} | could not open the Give dialog`, err);
    ui.notifications.error(labels().giveError);
    return null;
  }
}
