// Builds a standalone preview from the module's own model, DOM helpers, template, CSS and lang file.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mod = join(here, "..");
const out = process.argv[2] ?? join(here, "..", "dist", "preview.html");
const read = (p) => readFileSync(join(mod, p), "utf8");
const strip = (src) => src.replace(/^import .*$/gm, "").replace(/^export /gm, "");

const css = read("styles/attune.css").replace(/^@import .*$/m, "");
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Attune Preview</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Spectral:ital,wght@0,400;0,500;0,600;1,400&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/handlebars.js/4.7.8/handlebars.min.js"></script>
<style>
html, body { margin: 0; height: 100%; }
body {
  background: radial-gradient(1200px 700px at 30% 20%, #3a3f33, #1d211a 60%, #111310);
  display: grid; place-items: center; font-family: "Spectral", serif;
}
.pv-window { position: relative; width: min(960px, calc(100vw - 32px)); height: min(660px, calc(100vh - 80px)); margin-bottom: 24px; display: flex; flex-direction: column; }
/* Outside Foundry the PF2e action font is missing: draw the glyph from its Unicode fallback. */
.pv-window .action-glyph { font-size: 0 !important; }
.pv-window .action-glyph::after { content: attr(data-fallback); font-family: "Spectral", serif; font-size: 15px; letter-spacing: -1px; }
.pv-window .window-header { display: flex; align-items: center; gap: 10px; }
.pv-window .window-header .title { flex: 1; }
.pv-window .window-header .fa-xmark { opacity: .6; }
.pv-window .window-content { flex: 1; min-height: 0; }
#at-toast { position: fixed; top: 18px; left: 50%; transform: translate(-50%, -20px); opacity: 0; transition: .2s; background: #2c2621; color: #e8dcc4;
  border: 1px solid #cf4a32; padding: 8px 16px; border-radius: 6px; font-family: "Spectral", serif; pointer-events: none; }
#at-toast.is-on { opacity: 1; transform: translate(-50%, 0); }
.pv-note { position: fixed; bottom: 8px; left: 0; right: 0; text-align: center; color: rgba(232,220,196,.4); font: italic 12px "Spectral", serif; }
${css}
</style>
</head>
<body>
<div class="application attune pv-window">
  <header class="window-header"><i class="window-icon fa-solid fa-gem"></i><span class="title">Attune</span><i class="fa-solid fa-xmark"></i></header>
  <section class="window-content" id="at-content"></section>
</div>
<div id="at-toast"></div>
<p class="pv-note">Preview with illustrative data. Rune levels and descriptions come from your PF2e compendium in Foundry.</p>
<script type="text/x-handlebars-template" id="at-template">${read("templates/attune.hbs")}</script>
<script type="module">
const LANG = ${read("lang/en.json")};
${strip(read("scripts/activations.js"))}
${strip(read("scripts/model.js"))}
${strip(read("scripts/dom.js"))}
${readFileSync(join(here, "preview-runtime.js"), "utf8")}
</script>
</body>
</html>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`preview → ${out}`);
