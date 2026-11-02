import { defineConfig } from "@playwright/test";
import viteConfig from "./vite.config.js";

const baseURL = new URL(viteConfig.base, "http://127.0.0.1:4173").href;
export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL,
    headless: true,
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] }
      : {},
  },
  webServer: {
    command: "npm run preview -- --port 4173",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
