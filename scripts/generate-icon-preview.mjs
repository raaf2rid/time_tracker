import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const iconsRoot = path.join(rootDir, "node_modules", "fluentui-emoji", "icons");
const outputPath = path.join(rootDir, "ui", "electron-icons", "icons-preview.html");
const styles = ["modern", "flat", "high-contrast"];

if (!fs.existsSync(iconsRoot)) {
  console.error("fluentui-emoji icons directory not found. Run `npm install` first.");
  process.exit(1);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getIconsForStyle(style) {
  const dir = path.join(iconsRoot, style);
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".svg"))
    .map((entry) => {
      const absolutePath = path.join(dir, entry.name);
      const raw = fs.readFileSync(absolutePath, "utf8");
      const base64 = Buffer.from(raw, "utf8").toString("base64");
      const dataUri = `data:image/svg+xml;base64,${base64}`;
      return {
        fileName: entry.name,
        iconName: entry.name.replace(/\.svg$/, ""),
        dataUri
      };
    })
    .sort((a, b) => a.iconName.localeCompare(b.iconName));
}

const sections = styles.map((style) => ({
  style,
  icons: getIconsForStyle(style)
}));

const sectionHtml = sections
  .map((section) => {
    const cards = section.icons
      .map((icon) => {
        const name = escapeHtml(icon.iconName);
        const file = escapeHtml(icon.fileName);
        return `
          <article class="card" data-name="${name}" data-style="${section.style}">
            <div class="icon-wrap"><img loading="lazy" src="${icon.dataUri}" alt="${name}" /></div>
            <p class="name">${name}</p>
            <p class="file">${file}</p>
          </article>`;
      })
      .join("");

    return `
      <section class="section" data-style-section="${section.style}">
        <h2>${section.style}</h2>
        <div class="grid">${cards}</div>
      </section>`;
  })
  .join("");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Fluent Emoji Icon Preview</title>
    <style>
      :root {
        --bg: #0b1220;
        --panel: #111a2a;
        --panel-2: #0f1726;
        --border: rgba(189, 200, 224, 0.16);
        --text: #e8eefc;
        --muted: #9eb0d1;
        --accent: #c70066;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", system-ui, sans-serif;
        background: radial-gradient(circle at 20% -20%, #1b2640 0%, transparent 45%), var(--bg);
        color: var(--text);
      }
      header {
        position: sticky;
        top: 0;
        z-index: 10;
        background: rgba(8, 12, 20, 0.9);
        backdrop-filter: blur(6px);
        border-bottom: 1px solid var(--border);
        padding: 14px 18px;
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
      }
      h1 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        margin-right: 8px;
      }
      .tag {
        color: var(--muted);
        font-size: 13px;
      }
      input, select {
        border: 1px solid var(--border);
        background: var(--panel);
        color: var(--text);
        border-radius: 10px;
        padding: 9px 12px;
        font-size: 14px;
      }
      main {
        padding: 16px;
        max-width: 1400px;
        margin: 0 auto;
      }
      .section {
        margin-bottom: 24px;
      }
      .section h2 {
        margin: 0 0 10px;
        text-transform: capitalize;
        font-size: 16px;
        color: #d4def4;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 10px;
      }
      .card {
        background: linear-gradient(180deg, var(--panel), var(--panel-2));
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px;
        display: grid;
        gap: 8px;
        min-height: 154px;
      }
      .card:hover {
        border-color: rgba(199, 0, 102, 0.6);
      }
      .icon-wrap {
        height: 72px;
        display: grid;
        place-items: center;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.03);
      }
      .icon-wrap img {
        width: 64px;
        height: 64px;
      }
      .name {
        margin: 0;
        font-size: 12px;
        line-height: 1.3;
        word-break: break-word;
      }
      .file {
        margin: 0;
        color: var(--muted);
        font-size: 11px;
      }
      .hidden { display: none !important; }
    </style>
  </head>
  <body>
    <header>
      <h1>Fluent Emoji Icon Preview</h1>
      <span class="tag">Pick a filename, then I can apply it immediately.</span>
      <input id="search" type="search" placeholder="Search icon name..." />
      <select id="style">
        <option value="all">All styles</option>
        <option value="modern">modern</option>
        <option value="flat">flat</option>
        <option value="high-contrast">high-contrast</option>
      </select>
    </header>
    <main>${sectionHtml}</main>
    <script>
      const searchInput = document.getElementById("search");
      const styleSelect = document.getElementById("style");
      const cards = [...document.querySelectorAll(".card")];
      const sections = [...document.querySelectorAll("[data-style-section]")];

      function applyFilter() {
        const term = searchInput.value.trim().toLowerCase();
        const selectedStyle = styleSelect.value;

        cards.forEach((card) => {
          const name = card.dataset.name.toLowerCase();
          const style = card.dataset.style;
          const matchesTerm = !term || name.includes(term);
          const matchesStyle = selectedStyle === "all" || style === selectedStyle;
          card.classList.toggle("hidden", !(matchesTerm && matchesStyle));
        });

        sections.forEach((section) => {
          const visibleCards = section.querySelectorAll(".card:not(.hidden)");
          section.classList.toggle("hidden", visibleCards.length === 0);
        });
      }

      searchInput.addEventListener("input", applyFilter);
      styleSelect.addEventListener("change", applyFilter);
    </script>
  </body>
</html>`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, "utf8");
console.log(`Generated ${outputPath}`);
