// Preview runtime: mock data + AppV2-style action delegation. Model/dom code is inlined above by the build.

const svgIcon = (glyph, a, b) => "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><text x="32" y="43" font-size="30" text-anchor="middle" fill="#e8dcc4" font-family="serif">${glyph}</text></svg>`);
const IMG = {
  sword: svgIcon("⚔", "#5a3a2a", "#2a1d17"), bow: svgIcon("➶", "#3e4a2c", "#1e2416"),
  hammer: svgIcon("⚒", "#4a3c30", "#211a15"), rapier: svgIcon("†", "#55302a", "#24150f"),
  dagger: svgIcon("?", "#333", "#151515"), plate: svgIcon("⛨", "#4b4a52", "#1f1e24"),
  leather: svgIcon("❖", "#5b4632", "#271d14"), breast: svgIcon("⛊", "#46423a", "#1d1b17"),
  shield: svgIcon("⛉", "#4a3728", "#1f1610"), tower: svgIcon("▮", "#3d3a33", "#191814"),
  cloak: svgIcon("❦", "#6a2d22", "#2b1310"), ring: svgIcon("◎", "#4a4430", "#1f1c12"),
  boots: svgIcon("❧", "#3b3424", "#18150e"), amulet: svgIcon("✶", "#2f3f4a", "#12191e"),
  pc1: svgIcon("S", "#7a3a28", "#3a1a12"), pc2: svgIcon("B", "#4d5a34", "#22291a"), pc3: svgIcon("N", "#3e3a5a", "#1b1a29")
};

// Gear descriptions use the same HTML layout as PF2e item data, so the real parser runs on them.
const DESCRIPTIONS = {
  cloak: `<p>Soot-dark wool that never quite stops smoldering.</p><hr /><p><strong>Activate—Ember Ward</strong> <span class="action-glyph">R</span> (concentrate)</p><p><strong>Frequency</strong> once per day</p><p><strong>Trigger</strong> You would take fire damage</p><hr /><p><strong>Effect</strong> The cloak drinks the flames. You gain <strong>resistance 10 to fire</strong> against the triggering damage.</p>`,
  ring: `<p>A plain band etched with a single sidestep.</p><p><strong>Activate</strong> <span class="action-glyph">R</span> command; <strong>Frequency</strong> once per hour; <strong>Trigger</strong> An enemy you can see hits you with a melee Strike; <strong>Effect</strong> You Step, and the attacker takes a –2 circumstance penalty to its next attack against you.</p>`,
  boots: `<p>Light boots with springs of woven silver.</p><hr /><p><strong>Activate—Bound</strong> <span class="action-glyph">1</span> (manipulate)</p><p><strong>Effect</strong> You Leap up to 20 feet, ignoring difficult terrain on the landing square.</p><p><strong>Activate—Skyward Stride</strong> <span class="action-glyph">2</span> (concentrate, manipulate)</p><p><strong>Frequency</strong> once per day</p><p><strong>Effect</strong> For 1 minute, you can walk on air as if it were solid ground.</p>`,
  amulet: `<p>A star-shaped amulet humming with quiet power.</p><hr /><p><strong>Activate—Steady Mind</strong> <span class="action-glyph">F</span> (concentrate)</p><p><strong>Requirements</strong> You are frightened</p><p><strong>Effect</strong> Reduce your frightened value by 1.</p>`
};

const item = (o) => {
  const it = { priceGp: 0, carry: "carried", hidden: false, canOpen: true, canEdit: true, invested: null, base: {}, granted: {}, ...o,
    runes: { potency: 0, striking: 0, resilient: 0, reinforcing: 0, property: [], ...o.runes } };
  it.activations = it.hidden ? [] : parseActivations(o.description ?? "");
  return it;
};

const OWNERS = [
  { id: "a1", name: "Seraphine Vale", img: IMG.pc1, isOwn: true, items: [
    item({ key: "a1.i1", actorId: "a1", itemId: "i1", ownerName: "Seraphine Vale", name: "Longsword", img: IMG.sword, category: "weapon", level: 12, price: "1,365 gp", carry: "equipped",
      runes: { potency: 2, striking: 2, property: ["flaming", "frost"] }, base: { dice: 1, die: "d8", damageTypeLabel: "slashing" } }),
    item({ key: "a1.i2", actorId: "a1", itemId: "i2", ownerName: "Seraphine Vale", name: "Composite Shortbow", img: IMG.bow, category: "weapon", level: 8, price: "535 gp",
      runes: { potency: 1, striking: 1, property: ["shock"] }, base: { dice: 1, die: "d6", damageTypeLabel: "piercing" } }),
    item({ key: "a1.i3", actorId: "a1", itemId: "i3", ownerName: "Seraphine Vale", name: "Full Plate", img: IMG.plate, category: "armor", level: 8, price: "520 gp", carry: "equipped",
      runes: { potency: 1, resilient: 1, property: ["slick"] }, base: { acBonus: 6 } }),
    item({ key: "a1.i4", actorId: "a1", itemId: "i4", ownerName: "Seraphine Vale", name: "Steel Shield", img: IMG.shield, category: "shield", level: 7, price: "302 gp", carry: "equipped",
      runes: { reinforcing: 2 }, base: { acBonus: 2, hardness: 8, maxHp: 64 } }),
    item({ key: "a1.i5", actorId: "a1", itemId: "i5", ownerName: "Seraphine Vale", name: "Cloak of Smoldering Ash", img: IMG.cloak, category: "gear", level: 9, price: "650 gp", carry: "equipped", invested: true, description: DESCRIPTIONS.cloak }),
    item({ key: "a1.i6", actorId: "a1", itemId: "i6", ownerName: "Seraphine Vale", name: "Bounding Boots", img: IMG.boots, category: "gear", level: 7, price: "340 gp", carry: "equipped", invested: false, description: DESCRIPTIONS.boots })
  ]},
  { id: "a2", name: "Bram Ashguard", img: IMG.pc2, isOwn: false, isParty: true, items: [
    item({ key: "a2.i1", actorId: "a2", itemId: "i1", ownerName: "Bram Ashguard", canEdit: false, name: "Warhammer", img: IMG.hammer, category: "weapon", level: 11, price: "1,035 gp", carry: "equipped",
      runes: { potency: 1, striking: 1, property: ["holy"] }, base: { dice: 1, die: "d8", damageTypeLabel: "bludgeoning" } }),
    item({ key: "a2.i2", actorId: "a2", itemId: "i2", ownerName: "Bram Ashguard", canEdit: false, name: "Breastplate", img: IMG.breast, category: "armor", level: 14, price: "1,560 gp", carry: "equipped",
      runes: { potency: 2, resilient: 2, property: ["fortification"] }, base: { acBonus: 4 } }),
    item({ key: "a2.i3", actorId: "a2", itemId: "i3", ownerName: "Bram Ashguard", canEdit: false, name: "Tower Shield", img: IMG.tower, category: "shield", level: 10, price: "900 gp", carry: "carried",
      runes: { reinforcing: 3 }, base: { acBonus: 2, hardness: 10, maxHp: 80 } }),
    item({ key: "a2.i4", actorId: "a2", itemId: "i4", ownerName: "Bram Ashguard", canEdit: false, name: "Starlit Amulet", img: IMG.amulet, category: "gear", level: 6, price: "250 gp", carry: "equipped", invested: true, canEdit: false, description: DESCRIPTIONS.amulet })
  ]},
  { id: "a3", name: "Nym", img: IMG.pc3, isOwn: false, isParty: true, items: [
    item({ key: "a3.i1", actorId: "a3", itemId: "i1", ownerName: "Nym", canEdit: false, name: "Rapier", img: IMG.rapier, category: "weapon", level: 8, price: "625 gp", carry: "equipped",
      runes: { potency: 1, striking: 1, property: ["wounding", "corrosive"] }, base: { dice: 1, die: "d6", damageTypeLabel: "piercing" } }),
    item({ key: "a3.i2", actorId: "a3", itemId: "i2", ownerName: "Nym", canEdit: false, name: "Studded Leather", img: IMG.leather, category: "armor", level: 5, price: "160 gp", carry: "equipped",
      runes: { potency: 1 }, base: { acBonus: 2 } }),
    item({ key: "a3.i4", actorId: "a3", itemId: "i4", ownerName: "Nym", canEdit: false, name: "Ring of the Sidestep", img: IMG.ring, category: "gear", level: 5, price: "160 gp", carry: "equipped", invested: true, canEdit: false, granted: { 0: "x" }, description: DESCRIPTIONS.ring }),
    item({ key: "a3.i3", actorId: "a3", itemId: "i3", ownerName: "Nym", canEdit: false, name: "Unusual Dagger", img: IMG.dagger, category: "weapon", level: 0, price: "", carry: "stowed", hidden: true,
      runes: { potency: 2, property: ["vorpal"] }, base: { dice: 1, die: "d4" } })
  ]}
];

const dmg = (diceNumber, dieSize, damageType, conditional = false) => ({ diceNumber, dieSize, damageType, typeLabel: damageType, conditional });
const PROPERTY = {
  flaming: { label: "Flaming", level: 8, damage: [dmg(1, "d6", "fire")] },
  frost: { label: "Frost", level: 8, damage: [dmg(1, "d6", "cold")] },
  shock: { label: "Shock", level: 8, damage: [dmg(1, "d6", "electricity")] },
  corrosive: { label: "Corrosive", level: 8, damage: [dmg(1, "d6", "acid")] },
  wounding: { label: "Wounding", level: 7, damage: [dmg(1, "d6", "bleed")] },
  holy: { label: "Holy", level: 11, rarity: "uncommon", damage: [dmg(1, "d4", "spirit", true)] },
  slick: { label: "Slick", level: 5, effect: "+1 Acrobatics to Escape and Squeeze" },
  fortification: { label: "Fortification", level: 12, effect: "Flat check DC 17 negates crits" }
};
const FUND = {
  weapon: { potency: { 1: 2, 2: 10, 3: 16, 4: 16 }, striking: { 1: 4, 2: 12, 3: 19 } },
  armor: { potency: { 1: 5, 2: 11, 3: 18 }, resilient: { 1: 8, 2: 14, 3: 20 } },
  shield: { reinforcing: { 1: 4, 2: 7, 3: 10, 4: 13, 5: 16, 6: 19 } }
};
const DESC = {
  "weapon:property:flaming": "<p>The weapon is wreathed in fire. It deals an extra <strong>1d6 fire damage</strong> on a successful Strike, plus persistent fire damage on a critical hit.</p>",
  "weapon:property:frost": "<p>Rime coats the weapon. It deals an extra <strong>1d6 cold damage</strong>; a critical hit also leaves the target slowed by the cold.</p>",
  "weapon:striking:2": "<p>A greater striking rune lets the weapon deal <strong>three weapon damage dice</strong> instead of one.</p>",
  "weapon:potency:2": "<p>Grants a <strong>+2 item bonus</strong> to attack rolls and lets the weapon hold up to two property runes.</p>"
};

const catalog = {
  property: (category, slug) => PROPERTY[slug] ?? null,
  fundamental: (category, kind, n) => ({ level: FUND[category]?.[kind]?.[n] }),
  describe: (key) => new Promise((r) => setTimeout(() => r(DESC[key] ?? null), 450))
};

const L = LANG.ATTUNE.UI;
const template = Handlebars.compile(document.getElementById("at-template").innerHTML);
const content = document.getElementById("at-content");
const state = initialState();

function findItem(key) {
  for (const o of OWNERS) for (const it of o.items) if (it.key === key) return it;
  return null;
}
function activationHtml(descKey) {
  const [key, index] = descKey.slice(4).split("#");
  return findItem(key)?.activations.find((a) => a.index === Number(index))?.html ?? null;
}

function toast(msg) {
  const t = document.getElementById("at-toast");
  t.textContent = msg;
  t.classList.add("is-on");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("is-on"), 2400);
}

function render() {
  const keep = [...content.querySelectorAll(".at-rail-list, .at-pane")].map((el) => el.scrollTop);
  content.innerHTML = template(buildView({ owners: OWNERS, state, L, catalog }));
  content.querySelectorAll(".at-rail-list, .at-pane").forEach((el, i) => { el.scrollTop = keep[i] ?? 0; });
  content.querySelectorAll("[data-tooltip]").forEach((el) => { el.title = el.dataset.tooltip; });
  bindSearch(content, state);
}

const actions = {
  select: (t) => { state.selectedKey = t.dataset.key; state.reveal = t.dataset.reveal === "true"; state.expandedRune = null; state.tab = "detail"; },
  toggleParty: () => { state.showParty = !state.showParty; },
  toggleCompare: (t) => { if (toggleCompareKey(state, t.dataset.key) === "full") toast(fmt(L.compareFull, { max: COMPARE_MAX })); },
  clearCompare: () => { state.compareKeys = []; },
  setTab: (t) => { state.tab = t.dataset.tab; },
  setFilter: (t) => { state.filter = t.dataset.filter; },
  toggleDiff: () => { state.diffOnly = !state.diffOnly; },
  openSheet: () => toast("In Foundry this opens the item sheet."),
  toggleActivation: (t) => {
    const it = findItem(t.dataset.key);
    const i = Number(t.dataset.index);
    const act = it.activations.find((a) => a.index === i);
    if (it.granted[i]) { delete it.granted[i]; toast(fmt(L.removedNotice, { name: act.name || it.name, actor: it.ownerName })); }
    else { it.granted[i] = "mock"; toast(fmt(L.addedNotice, { name: act.name || it.name, actor: it.ownerName })); }
  },
  addAll: (t) => {
    const it = findItem(t.dataset.key);
    let n = 0;
    for (const a of it.activations) if (!it.granted[a.index]) { it.granted[a.index] = "mock"; n += 1; }
    toast(fmt(L.addedAllNotice, { n, actor: it.ownerName }));
  },
  toggleRune: async (t) => {
    const key = t.dataset.rune;
    state.expandedRune = state.expandedRune === key ? null : key;
    if (state.expandedRune && !state.descriptions[key]) {
      state.descriptions[key] = { loading: true };
      render();
      const html = key.startsWith("act:") ? activationHtml(key) : await catalog.describe(key);
      state.descriptions[key] = { loading: false, html: html ?? "" };
    }
  }
};

content.addEventListener("click", async (ev) => {
  const target = ev.target.closest("[data-action]");
  if (!target || !content.contains(target)) return;
  const fn = actions[target.dataset.action];
  if (!fn) return;
  ev.preventDefault();
  await fn(target);
  render();
});

render();
