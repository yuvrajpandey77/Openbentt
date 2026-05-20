import { describe, expect, it } from "vitest";
import { createMockZoteroFetch } from "@/lib/zotero/mockZotero";
import {
  mapZoteroApiToSnapshot,
  zoteroFetchAllItems,
  zoteroWhoami,
} from "@/lib/zotero/zoteroWebApi";
import {
  MOCK_ZOTERO_API_ITEMS,
  MOCK_ZOTERO_COLLECTIONS,
  MOCK_ZOTERO_TAGS,
} from "@/lib/zotero/mockZotero";

describe("zoteroWebApi (mock fetch, no live API)", () => {
  const fetchFn = createMockZoteroFetch();

  it("authenticates against mock whoami endpoint", async () => {
    const user = await zoteroWhoami(fetchFn, "mock-key");
    expect(user.userID).toBe(12345);
  });

  it("maps API payload into snapshot shape with annotations", async () => {
    const items = await zoteroFetchAllItems(fetchFn, "mock-key", "12345");
    expect(items.length).toBeGreaterThan(0);
    const mapped = mapZoteroApiToSnapshot(
      items,
      MOCK_ZOTERO_COLLECTIONS,
      MOCK_ZOTERO_TAGS,
      "12345",
      1
    );
    expect(mapped.items.length).toBeGreaterThan(0);
    expect(mapped.annotations.length).toBeGreaterThan(0);
    expect(mapped.items[0].bibtexRaw).toContain("@");
  });

  it("uses stable mock fixtures when fetch is not called", () => {
    expect(MOCK_ZOTERO_API_ITEMS[0].title).toContain("Attention");
  });
});
