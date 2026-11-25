/**
 * Give dialog view model. Pure (no Foundry globals) so the standalone preview uses it too.
 *
 * item:       { name, img, quantity, ownerName }
 * recipients: [{ id, name, img, sub, isOwn }]
 * state:      { targetId, quantity }
 */

import { fmt } from "./model.js";

export function clampQuantity(q, max) {
  const n = Math.floor(Number(q) || 0);
  return Math.max(1, Math.min(Math.max(1, Number(max) || 1), n));
}

export function giveView({ item, recipients, state, L, needsGM = () => false, gmOnline = true }) {
  const max = Math.max(1, Number(item.quantity) || 1);
  state.quantity = clampQuantity(state.quantity ?? 1, max);
  if (!recipients.some((r) => r.id === state.targetId)) state.targetId = null;
  const target = recipients.find((r) => r.id === state.targetId) ?? null;
  const blocked = needsGM(target) && !gmOnline;

  return {
    labels: L,
    item: {
      ...item,
      meta: fmt(L.giveFrom, { name: item.ownerName }) + (max > 1 ? ` · ${fmt(L.giveHave, { n: max })}` : "")
    },
    recipients: recipients.map((r) => ({ ...r, isSelected: r.id === state.targetId })),
    hasRecipients: recipients.length > 0,
    hasQuantity: max > 1,
    quantity: state.quantity,
    max,
    atMin: state.quantity <= 1,
    atMax: state.quantity >= max,
    isAll: state.quantity === max,
    canGive: !!target && !blocked,
    blockedNote: blocked ? L.giveNoGM : "",
    relayNote: target && needsGM(target) && !blocked ? L.giveViaGM : "",
    giveLabel: target
      ? fmt(state.quantity > 1 ? L.giveToN : L.giveTo, { name: target.name, n: state.quantity })
      : L.giveChoose
  };
}
