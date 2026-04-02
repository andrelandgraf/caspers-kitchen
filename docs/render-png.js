/**
 * Patches the D2-generated SVG canvas background from the theme default (#1E1E2E)
 * to Navy 900 (#0B2026), then renders a 2x PNG via Playwright's Chromium.
 *
 * Prerequisites: d2 CLI, @playwright/test (devDep in apps/support-console)
 * Usage: d2 --theme 200 --pad 80 docs/architecture.d2 docs/architecture.svg && node docs/render-png.js
 */

const { chromium } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const SVG_PATH = path.resolve(__dirname, "architecture.svg");
const PNG_PATH = path.resolve(__dirname, "architecture.png");
const THEME_BG = "#1E1E2E";
const BRAND_BG = "#0B2026";

async function main() {
  const svg = fs.readFileSync(SVG_PATH, "utf-8");
  fs.writeFileSync(SVG_PATH, svg.replaceAll(THEME_BG, BRAND_BG));

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.goto("file://" + SVG_PATH);

  const [width, height] = await page.evaluate(() => {
    const vb = document.querySelector("svg").getAttribute("viewBox").split(" ").map(Number);
    return [vb[2], vb[3]];
  });

  await page.setViewportSize({ width, height });
  await page.screenshot({ path: PNG_PATH, clip: { x: 0, y: 0, width, height } });
  await browser.close();

  console.log(`${PNG_PATH} (${width * 2}x${height * 2}px)`);
}

main();
