import fs from "node:fs";

const rawTag = process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME || "";
const expectedVersion = rawTag.replace(/^v/i, "").trim();

if (!expectedVersion) {
  console.error("Release version check requires RELEASE_TAG or GITHUB_REF_NAME (for example v2.2.5).");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (pkg.version !== expectedVersion) {
  console.error(
    `Release tag ${rawTag} does not match package.json version ${pkg.version}. ` +
      `Bump package.json before pushing the tag so installer filenames match the release.`
  );
  process.exit(1);
}

if (fs.existsSync("package-lock.json")) {
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  const rootVersion = lock.packages?.[""]?.version;
  if (lock.version !== pkg.version || rootVersion !== pkg.version) {
    console.error(
      `package-lock.json version drift detected (top=${lock.version}, root=${rootVersion}, package=${pkg.version}). ` +
        `Run npm install --package-lock-only after bumping package.json.`
    );
    process.exit(1);
  }
}

console.log(`Release version OK: ${rawTag} -> ${pkg.version}`);
