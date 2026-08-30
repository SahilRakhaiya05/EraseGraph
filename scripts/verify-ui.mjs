import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));

await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.waitForSelector("#landing-title");
const title = await page.locator("#landing-title").innerText();
await page.screenshot({ path: "output/playwright/polish-landing-desktop.png", fullPage: false });

await page.fill("#case-id", "ER-9999");
await page.locator("form.case-lookup button[type=submit]").click();
const badStatus = await page.locator("#case-lookup-status").innerText();

await page.fill("#case-id", "ER-2048");
await page.locator("form.case-lookup button[type=submit]").click();
await page.waitForSelector(".app-shell");
await page.screenshot({ path: "output/playwright/polish-workspace-desktop.png", fullPage: false });

await page.getByRole("button", { name: "Ledger" }).click();
await page.waitForSelector("text=Decision ledger");
await page.screenshot({ path: "output/playwright/polish-workspace-ledger.png", fullPage: false });

await page.getByRole("button", { name: /EraseGraph/i }).first().click();
await page.waitForSelector("#landing-title");
await page.locator("#surfaces").scrollIntoViewIfNeeded();
await page.screenshot({ path: "output/playwright/polish-surfaces.png", fullPage: false });
await page.locator("#architecture").scrollIntoViewIfNeeded();
await page.screenshot({ path: "output/playwright/polish-architecture.png", fullPage: false });

await page.setViewportSize({ width: 390, height: 844 });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.waitForSelector("#landing-title");
await page.screenshot({ path: "output/playwright/polish-landing-mobile.png", fullPage: false });
await page.getByLabel("Open navigation").click();
await page.locator(".landing-mobile-menu").getByRole("button", { name: "Open workspace" }).click();
await page.waitForSelector(".app-shell");
await page.screenshot({ path: "output/playwright/polish-workspace-mobile.png", fullPage: false });

console.log(JSON.stringify({ title, badStatus, errors, ok: errors.length === 0 }, null, 2));
if (errors.length) process.exitCode = 1;
await browser.close();
