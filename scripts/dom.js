/** DOM helpers shared by the module and the standalone preview. */

export function applySearch(root, query) {
  const q = String(query ?? "").trim().toLowerCase();
  let anyVisible = false;
  for (const owner of root.querySelectorAll(".at-owner")) {
    let any = false;
    for (const el of owner.querySelectorAll(".at-item")) {
      const hit = !q || (el.dataset.search ?? "").includes(q);
      el.hidden = !hit;
      any ||= hit;
    }
    owner.hidden = !any;
    anyVisible ||= any;
  }
  const empty = root.querySelector(".at-search-empty");
  if (empty) empty.hidden = !q || anyVisible;
}

export function bindSearch(root, state) {
  const input = root.querySelector(".at-search");
  if (!input) return;
  input.value = state.search ?? "";
  applySearch(root, input.value);
  input.addEventListener("input", () => {
    state.search = input.value;
    applySearch(root, input.value);
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && input.value) {
      ev.stopPropagation();
      input.value = "";
      state.search = "";
      applySearch(root, "");
    }
  });
}
