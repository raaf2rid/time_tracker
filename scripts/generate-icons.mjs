import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const sourceIconPath = path.join(rootDir, "ui", "electron-icons", "source.svg");
const generatedDir = path.join(rootDir, "ui", "electron-icons", ".generated");
const windowsDir = path.join(rootDir, "ui", "electron-icons", "windows");
if (!existsSync(sourceIconPath)) {
  console.error(`Missing source icon: ${sourceIconPath}`);
  process.exit(1);
}

mkdirSync(generatedDir, { recursive: true });
mkdirSync(windowsDir, { recursive: true });

const iconGenArgs = [
  "icon-gen",
  "-i", sourceIconPath,
  "-o", generatedDir,
  "--ico",
  "--ico-name", "icon",
  "--ico-sizes", "16,20,24,32,40,48,64,128,256",
  "--favicon",
  "--favicon-name", "win-",
  "--favicon-png-sizes", "16,32,48,64,128,256",
  "--favicon-ico-sizes", "16,20,24,32,40,48,64,128,256"
];

const generation = spawnSync("npx", iconGenArgs, {
  cwd: rootDir,
  stdio: "inherit",
  shell: process.platform === "win32"
});

if (generation.error) {
  console.error(generation.error.message);
  process.exit(1);
}

if (generation.status !== 0) {
  process.exit(generation.status ?? 1);
}

copyFileSync(path.join(generatedDir, "icon.ico"), path.join(windowsDir, "icon.ico"));
copyFileSync(path.join(generatedDir, "win-16.png"), path.join(windowsDir, "16x16.png"));
copyFileSync(path.join(generatedDir, "win-32.png"), path.join(windowsDir, "32x32.png"));
copyFileSync(path.join(generatedDir, "win-48.png"), path.join(windowsDir, "48x48.png"));
copyFileSync(path.join(generatedDir, "win-64.png"), path.join(windowsDir, "64x64.png"));
copyFileSync(path.join(generatedDir, "win-128.png"), path.join(windowsDir, "128x128.png"));
copyFileSync(path.join(generatedDir, "win-256.png"), path.join(windowsDir, "256x256.png"));
copyFileSync(path.join(generatedDir, "win-256.png"), path.join(rootDir, "ui", "electron-icons", "icon.png"));

console.log("Generated Windows icons in ui/electron-icons/windows");
