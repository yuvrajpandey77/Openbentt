import { test, expect } from "@playwright/test";

test.describe("notebook studio beta 2.1 smoke", () => {
  test("template catalog is served", async ({ request }) => {
    const res = await request.get("/templates/catalog.json");
    expect(res.ok()).toBeTruthy();
    const cat = (await res.json()) as { templates: unknown[] };
    expect(cat.templates.length).toBeGreaterThanOrEqual(100);
  });

  test("minimal template pack loads", async ({ request }) => {
    const res = await request.get("/templates/packs/minimal-article.json");
    expect(res.ok()).toBeTruthy();
    const pack = (await res.json()) as { draftTex: string };
    expect(pack.draftTex).toContain("\\documentclass");
  });

  test("projects hub route loads on web", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByText(/Projects|Desktop app required|Openbentt/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
