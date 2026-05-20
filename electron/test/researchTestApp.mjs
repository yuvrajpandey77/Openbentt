import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function makeTempUserData() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openbentt-research-test-"));
  return {
    root,
    app: {
      getPath: (name) => {
        if (name === "userData") return root;
        return path.join(root, name);
      },
    },
    async cleanup() {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}
