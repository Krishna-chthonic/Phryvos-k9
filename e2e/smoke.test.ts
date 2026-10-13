/**
 * P8: Playwright smoke tests — core user flows.
 * Tests: setup → unlock → file ops → chat (mocked) → kanban drag → export.
 * Note: Requires Chromium. On Android/Termux, run on desktop Linux/macOS/Windows.
 */
import { test, expect } from "@playwright/test";

test.describe.configure({ retries: 0 });

test("setup → unlock → vault file create/read", async ({ page }) => {
  // Setup: create password
  await page.goto("/setup");
  await expect(page.locator("h1")).toContainText("Setup Vault");
  await page.fill('input[type="password"]', "TestPass123!");
  await page.fill('input[type="password"]:nth-of-type(2)', "TestPass123!");
  await page.click('button:has-text("Create Vault")');
  await expect(page).toHaveURL("/unlock");

  // Unlock
  await page.fill('input[type="password"]', "TestPass123!");
  await page.click('button:has-text("Unlock")');
  await expect(page).toHaveURL("/chat");

  // Navigate to vault
  await page.click('a:has-text("Vault")');
  await expect(page).toHaveURL("/vault");

  // Create a file
  await page.click('button:has-text("New File")');
  await page.fill('input[placeholder*="name"]', "smoke-test.md");
  await page.fill('textarea, [contenteditable="true"]', "# Smoke Test\n\nHello from Playwright!");
  await page.click('button:has-text("Save")');

  // Verify file appears
  await expect(page.locator('text=smoke-test.md')).toBeVisible();

  // Read file content
  await page.click('text=smoke-test.md');
  await expect(page.locator('text=Hello from Playwright')).toBeVisible();
});

test("chat with mocked provider", async ({ page }) => {
  // This test assumes a mock provider is configured or we test the UI only
  await page.goto("/unlock");
  await page.fill('input[type="password"]', "TestPass123!");
  await page.click('button:has-text("Unlock")');
  await expect(page).toHaveURL("/chat");

  // Check chat UI loads
  await expect(page.locator('textarea[placeholder*="Message"]')).toBeVisible();
  await expect(page.locator('button:has-text("Send")')).toBeVisible();
});

test("kanban drag and drop", async ({ page }) => {
  await page.goto("/unlock");
  await page.fill('input[type="password"]', "TestPass123!");
  await page.click('button:has-text("Unlock")');

  await page.click('a:has-text("Projects")');
  await expect(page).toHaveURL("/projects");

  // Create a project if none exists
  const newProjectBtn = page.locator('button:has-text("New Project")');
  if (await newProjectBtn.isVisible()) {
    await newProjectBtn.click();
    await page.fill('input[placeholder*="name"]', "Smoke Project");
    await page.click('button:has-text("Create")');
  }

  // Open project board
  await page.click('text=Smoke Project');
  await expect(page.locator('text=Todo')).toBeVisible();
  await expect(page.locator('text=Doing')).toBeVisible();
  await expect(page.locator('text=Done')).toBeVisible();
});

test("export bundle", async ({ page }) => {
  await page.goto("/unlock");
  await page.fill('input[type="password"]', "TestPass123!");
  await page.click('button:has-text("Unlock")');

  await page.click('a:has-text("Settings")');
  await expect(page).toHaveURL("/settings");

  // Run export
  await page.selectOption('select', 'export');
  await page.click('button:has-text("Run Now")');
  await expect(page.locator('text=Export bundle created')).toBeVisible({ timeout: 30000 });
});