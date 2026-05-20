import { test, expect } from "@playwright/test";

const SEED_PROJECT = {
  id: "e2e-research-project",
  title: "E2E Research",
  createdAt: "2026-05-20T00:00:00.000Z",
  updatedAt: "2026-05-20T00:00:00.000Z",
  targetVenue: "ieee",
  linkedThreadIds: [],
  draftTex: `\\documentclass{article}
\\begin{document}
\\begin{abstract}
We study local-first similarity for academic drafts with twenty five words minimum padding here.
\\end{abstract}
\\section{Introduction}
Prior work on neural citations is well documented in the literature.
\\end{document}`,
  bibliography: "@article{smith2024, title={Neural Citations}, author={Smith}, year={2024}}",
  bibEntries: [],
  papers: [
    {
      id: "paper-e2e-1",
      fileName: "sample.pdf",
      addedAt: "2026-05-20T00:00:00.000Z",
      extractedText:
        "Neural citation extraction from PDF documents enables local similarity scanning without cloud upload.",
      metadata: { title: "Sample Paper" },
    },
  ],
  chunks: [],
  revisionSuggestions: [],
  modelAttributions: [],
  abstractVariants: [],
  keywordSuggestions: [],
  captionSuggestions: [],
};

function seedAppStorage(project: typeof SEED_PROJECT) {
  localStorage.setItem("openbentt-workspace-panel-open", "1");
  localStorage.setItem(
    "openbentt-api-config",
    JSON.stringify({
      aiProvider: "webgpu_gemma",
      apiKey: "",
      model: "openbentt/local-qwen-0.5b",
      customModelIds: [],
      comparisonEnabled: false,
      comparisonModelIds: ["openbentt/local-qwen-0.5b"],
      researchEnabled: false,
      researchDepth: "standard",
      reasoningPreference: "default",
      braveSearchApiKey: "",
      researchProxyUrl: "",
      researchApprovedDomains: "",
      mathModeEnabled: false,
      debugModeEnabled: false,
      openAiCompatibleBaseUrl: "",
      redTeamModeEnabled: false,
      showAgentTraces: false,
      localInferenceProfile: "eco",
      researchWithLocalModel: true,
      localGgufBinaryPath: "",
      huggingFaceToken: "",
      localGgufMaxParamB: 8,
      localGgufDownloadConsent: false,
    })
  );
  localStorage.setItem(
    "openbentt-research-projects-index",
    JSON.stringify({
      activeId: project.id,
      projects: [
        {
          id: project.id,
          title: project.title,
          updatedAt: project.updatedAt,
          paperCount: project.papers.length,
        },
      ],
    })
  );
  localStorage.setItem(`openbentt-research-project-${project.id}`, JSON.stringify(project));
  localStorage.setItem(
    "openbentt-research-workspace-layout",
    JSON.stringify({
      preset: "literature-review",
      mode: "default",
      sidePanelOrder: ["papers", "search", "citations", "submit"],
      activeSidePanel: "citations",
      sidePanelSize: 32,
    })
  );
}

test.describe("research workspace Phase A (unified notebook)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(seedAppStorage, SEED_PROJECT);
  });

  test("submit checklist via Submit panel", async ({ page }) => {
    await page.goto("/notebook");
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText(/Target venue|checks passed/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("hybrid similarity scan with seeded corpus", async ({ page }) => {
    await page.goto("/notebook");
    await page.getByRole("button", { name: "Semantic search" }).click();
    await page.getByRole("button", { name: "Hybrid scan" }).click();
    await expect(page.getByText(/Sample Paper|TF-IDF|hybrid/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("citations panel shows Semantic Scholar graph action", async ({ page }) => {
    await page.goto("/notebook");
    await page.getByRole("button", { name: "Citations", exact: true }).click();
    await expect(page.getByRole("button", { name: /Build graph from project bib/i })).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe("research workspace smoke", () => {
  test("home page loads with Openbentt branding", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Openbentt/i);
  });

  test("notebook route is reachable", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "openbentt-api-config",
        JSON.stringify({ aiProvider: "webgpu_gemma", apiKey: "", model: "openbentt/local-qwen-0.5b" })
      );
      localStorage.setItem("openbentt-workspace-panel-open", "1");
    });
    await page.goto("/notebook");
    await expect(page.getByText(/E2E Research|Notebook/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
