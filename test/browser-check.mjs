// Opt-in browser verification against a separately launched throwaway database.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
const base = process.env.BASE_URL || "http://localhost:4332";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  }),
  page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const out = ".impeccable/review";
await mkdir(out, { recursive: true });
const checkOverflow = async (p, name) =>
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    `${name}: horizontal overflow`,
  );
try {
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Share the answer. Keep the view." })
    .waitFor();
  await page.screenshot({ path: `${out}/desktop.png`, fullPage: true });
  await checkOverflow(page, "landing desktop");
  const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    }),
    mp = await mobile.newPage();
  await mp.goto(base);
  await mp
    .getByRole("heading", { name: "Share the answer. Keep the view." })
    .waitFor();
  await mp.screenshot({ path: `${out}/mobile.png`, fullPage: true });
  await checkOverflow(mp, "landing mobile");
  await mobile.close();
  await page.getByRole("button", { name: "Create your first pass" }).click();
  await page.getByRole("heading", { name: "Make room for less." }).waitFor();
  await page.getByLabel("Your name").fill("Verification owner");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`review-${Date.now()}@example.test`);
  await page.getByLabel(/^Password/).fill("browser verification only 2049");
  await page.getByRole("button", { name: "Create private workspace" }).click();
  await page.getByRole("heading", { name: "Your field of view." }).waitFor();
  await page.screenshot({
    path: `${out}/owner-empty-desktop.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add your first reference" }).click();
  await page.getByRole("heading", { name: "Frame your question." }).waitFor();
  const image = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#747f60" },
  })
    .png()
    .toBuffer();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "synthetic-verification-fixture.png",
      mimeType: "image/png",
      buffer: image,
    });
  await page
    .getByLabel("Reference name")
    .fill("Synthetic verification fixture");
  await page.getByLabel(/^The exact object/).fill("the test object");
  await page.getByLabel("The approved area").fill("the marked test area");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save private reference" }).click();
  await page.getByRole("heading", { name: "Your field of view." }).waitFor();
  await page
    .getByRole("button", { name: "Shared passes", exact: true })
    .click();
  await page.getByRole("button", { name: "Create pass", exact: true }).click();
  await page.getByLabel("Private pass label").fill("Browser verification");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create expiring pass" }).click();
  await page
    .getByRole("heading", { name: "The permission is yours to share." })
    .waitFor();
  const link = await page.getByLabel("Private bearer link").inputValue();
  assert.match(link, /\/p\/[A-Za-z0-9_-]{43}$/);
  const rc = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      reducedMotion: "reduce",
    }),
    rp = await rc.newPage();
  rp.on("pageerror", (e) => errors.push(e.message));
  await rp.goto(link);
  await rp
    .getByRole("button", { name: "Request a check", exact: true })
    .waitFor();
  assert.equal(await rp.locator("img").count(), 0);
  await rp
    .getByRole("button", { name: "Request a check", exact: true })
    .click();
  await rp
    .getByRole("heading", { name: "Waiting for the owner’s view." })
    .waitFor();
  await rp.screenshot({ path: `${out}/recipient-mobile.png`, fullPage: true });
  await checkOverflow(rp, "recipient mobile");
  await page.getByRole("button", { name: "Back to passes" }).click();
  await page.getByRole("button", { name: /Requested checks/ }).click();
  await page
    .getByRole("heading", {
      name: "Is the test object visible in the marked test area?",
    })
    .waitFor({ timeout: 10000 });
  await page
    .getByRole("radio", {
      name: "Visible The reference object is clearly visible in the approved area.",
    })
    .check();
  await page.getByLabel("Private note").fill("Private verification note visible only to the owner.");
  await page.getByRole("button", { name: "Use current time" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Release approved answer" }).click();
  await rp
    .getByRole("heading", { name: "Visible.", exact: true })
    .waitFor({ timeout: 10000 });
  assert.equal(await rp.locator("img").count(), 0);
  await page.getByRole("button", { name: "Activity journal" }).click();
  await page
    .getByRole("heading", { name: "Owner observation recorded" })
    .waitFor();
  await page.locator("summary").click();
  await page.getByText("Private verification note visible only to the owner.").waitFor();
  assert.ok(!(await rp.locator("body").innerText()).includes("Private verification note"));
  await page.screenshot({
    path: `${out}/owner-journal-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${out}/owner-journal-mobile.png`,
    fullPage: true,
  });
  await checkOverflow(page, "owner mobile");
  await page
    .getByRole("button", { name: "Shared passes", exact: true })
    .click();
  await page.getByRole("button", { name: "Revoke pass" }).click();
  await rp.reload();
  await rp
    .getByRole("heading", { name: "This permission has closed." })
    .waitFor();
  assert.equal(
    await rp.getByRole("heading", { name: "Visible.", exact: true }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  await rc.close();
  console.log(
    JSON.stringify({
      passed: true,
      checks: [
        "desktop and mobile landing",
        "registration",
        "private reference upload",
        "pass creation",
        "anonymous recipient requests",
        "owner manual observation",
        "recipient output contains no images",
        "mobile journal and no horizontal overflow",
        "revocation closes recipient view",
        "no browser runtime errors",
      ],
      screenshots: out,
    }),
  );
} finally {
  await browser.close();
}
