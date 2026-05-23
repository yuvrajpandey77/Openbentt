import { test, expect } from "@playwright/test";

test.describe("notebook studio beta 2.1 smoke", () => {
  test("template catalog is served with verified entries", async ({ request }) => {
    const res = await request.get("/templates/catalog.json");
    expect(res.ok()).toBeTruthy();
    const cat = (await res.json()) as { templates: { verified?: boolean; featured?: boolean }[] };
    expect(cat.templates.length).toBeGreaterThanOrEqual(100);
    expect(cat.templates.some((t) => t.verified && t.featured)).toBeTruthy();
  });

  test("minimal template pack loads with bibliography", async ({ request }) => {
    const res = await request.get("/templates/packs/minimal-article.json");
    expect(res.ok()).toBeTruthy();
    const pack = (await res.json()) as { draftTex: string; bibliography: string };
    expect(pack.draftTex).toContain("\\documentclass");
    expect(pack.draftTex).toContain("\\bibliography{references}");
    expect(pack.bibliography).toContain("@article");
  });

  test("projects hub route loads on web", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByText(/Projects|Desktop app required|Openbentt/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("projects hub shows template section when not gated", async ({ page }) => {
    await page.goto("/projects");
    const desktopRequired = page.getByRole("heading", { name: "Desktop app required" });
    if ((await desktopRequired.count()) > 0) {
      test.skip();
      return;
    }
    await expect(page.getByRole("heading", { name: /Start from a template/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});
