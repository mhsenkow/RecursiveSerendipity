import { chromium, type Browser } from "playwright-core";
import { join } from "path";
import { homedir } from "os";

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;

  const chromiumPath = join(
    homedir(),
    "Library/Caches/ms-playwright",
    "chromium-1200",
    "chrome-mac/Chromium.app/Contents/MacOS/Chromium"
  );

  browser = await chromium.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  return browser;
}

export async function screenshotHtml(html: string): Promise<Buffer> {
  const b = await getBrowser();
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    await page.setContent(html, { waitUntil: "networkidle", timeout: 10_000 });
    // Give JS animations a moment to render
    await page.waitForTimeout(1500);
    const buf = await page.screenshot({ type: "png", fullPage: false });
    return Buffer.from(buf);
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
