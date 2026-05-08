const fs = require("node:fs");
const path = require("node:path");
const rcedit = require("rcedit");

const rootDir = path.resolve(__dirname, "..");
const exePath = path.join(rootDir, "dist", "win-unpacked", "Activity Log.exe");
const iconPath = path.join(rootDir, "ui", "electron-icons", "windows", "icon.ico");

if (!fs.existsSync(iconPath)) {
  console.error(`Icon file not found: ${iconPath}`);
  process.exit(1);
}

if (!fs.existsSync(exePath)) {
  console.error(`Unpacked exe not found: ${exePath}`);
  process.exit(1);
}

async function run() {
  try {
    await rcedit(exePath, { icon: iconPath });
    console.log(`Patched icon: ${exePath}`);
  } catch (error) {
    console.error("Failed to patch EXE icon:", error);
    process.exit(1);
  }
}

run();
