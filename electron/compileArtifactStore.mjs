import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

/** File-based compile PDF cache for desktop (SQLite-adjacent artifact dir). */
export function compileCacheDir(app, projectId) {
  const root = path.join(app.getPath("userData"), "research", "compile-cache", projectId);
  return root;
}

export async function getCompileArtifactDesktop(app, projectId, hash) {
  const fp = path.join(compileCacheDir(app, projectId), `${hash}.pdf`);
  try {
    const buf = await fsPromises.readFile(fp);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch {
    return null;
  }
}

export async function putCompileArtifactDesktop(app, projectId, hash, pdfBuffer, meta = {}) {
  const dir = compileCacheDir(app, projectId);
  await fsPromises.mkdir(dir, { recursive: true });
  const fp = path.join(dir, `${hash}.pdf`);
  await fsPromises.writeFile(fp, Buffer.from(pdfBuffer));
  await fsPromises.writeFile(
    path.join(dir, `${hash}.json`),
    JSON.stringify({ hash, createdAt: new Date().toISOString(), ...meta })
  );
}

export async function clearCompileCacheDesktop(app, projectId) {
  const dir = compileCacheDir(app, projectId);
  if (fs.existsSync(dir)) {
    await fsPromises.rm(dir, { recursive: true, force: true });
  }
}
