import { chromium } from "playwright";

const BASE = process.env.STEP_TREE_URL ?? "http://127.0.0.1:5173/fixtures/step-tree.html?at=link";
const PHOSPHOR = "rgb(72, 213, 151)";

function parseRgb(color) {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isPhosphor(color) {
  const rgb = parseRgb(color);
  if (!rgb) {
    return false;
  }
  const [r, g, b] = rgb;
  return r === 72 && g === 213 && b === 151;
}

function assertAligned(values, label) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min > 0.5) {
    throw new Error(`${label} misaligned: ${values.join(", ")}px (spread ${max - min}px)`);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage();

try {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const lit = document.querySelector(".tree-connector.is-lit");
    if (!lit) {
      return false;
    }
    return getComputedStyle(lit).color === "rgb(72, 213, 151)";
  });

  const spines = page.locator(".tree-spine");
  const connectors = page.locator(".tree-connector");
  const spineCount = await spines.count();
  const connectorCount = await connectors.count();

  if (spineCount !== 3) {
    throw new Error(`expected 3 spine cells, got ${spineCount}`);
  }
  if (connectorCount !== 4) {
    throw new Error(`expected 4 connector cells, got ${connectorCount}`);
  }

  const spineLeft = [];
  for (let i = 0; i < spineCount; i++) {
    const box = await spines.nth(i).boundingBox();
    if (!box) {
      throw new Error(`spine ${i} has no bounding box`);
    }
    spineLeft.push(box.x);
  }
  assertAligned(spineLeft, "spine column");

  const connectorLeft = [];
  for (let i = 0; i < connectorCount; i++) {
    const box = await connectors.nth(i).boundingBox();
    if (!box) {
      throw new Error(`connector ${i} has no bounding box`);
    }
    connectorLeft.push(box.x);
  }

  const nestedConnectorLeft = connectorLeft.slice(1);
  assertAligned(nestedConnectorLeft, "nested connector column");

  if (Math.abs(connectorLeft[0] - spineLeft[0]) > 0.5) {
    throw new Error(
      `top-level connector should align with spine column: ${connectorLeft[0]} vs ${spineLeft[0]}`,
    );
  }

  for (const i of [...Array(spineCount).keys()]) {
    const color = await spines.nth(i).evaluate((el) => getComputedStyle(el).color);
    const shouldLit = i === spineCount - 2;
    if (shouldLit && !isPhosphor(color)) {
      throw new Error(`spine ${i} (row above current) should be phosphor, got ${color}`);
    }
    if (!shouldLit && isPhosphor(color)) {
      throw new Error(`spine ${i} should stay muted, got ${color}`);
    }
  }

  const rootConnectorColor = await connectors.first().evaluate((el) =>
    getComputedStyle(el).color,
  );
  if (isPhosphor(rootConnectorColor)) {
    throw new Error(`root entry branch should stay muted, got ${rootConnectorColor}`);
  }

  for (let i = 1; i < connectorCount - 1; i++) {
    const color = await connectors.nth(i).evaluate((el) => getComputedStyle(el).color);
    if (isPhosphor(color)) {
      throw new Error(`sibling connector ${i} should stay muted, got ${color}`);
    }
  }

  const lastConnectorColor = await connectors.last().evaluate((el) => getComputedStyle(el).color);
  if (!isPhosphor(lastConnectorColor)) {
    throw new Error(`current connector should be phosphor, got ${lastConnectorColor}`);
  }

  const activeLabel = page.locator(".tree-node.is-active");
  if ((await activeLabel.count()) !== 1) {
    throw new Error("expected exactly one active label");
  }
  if ((await activeLabel.textContent())?.trim() !== "share link ready") {
    throw new Error("active label should be the current step");
  }

  console.log("step-tree browser checks passed");
  console.log(`  spine column: ${spineLeft.map((v) => v.toFixed(1)).join(", ")}px`);
  console.log(
    `  connector column: ${connectorLeft.map((v) => v.toFixed(1)).join(", ")}px`,
  );
} finally {
  await browser.close();
}
