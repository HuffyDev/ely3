import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db";
import { fetchVerifiedSource, type VerifiedSource } from "../explorer";

/** Contracts we deployed ourselves (local demo chain). Their source lives in this repo. */
export function ownContract(address: string, network: string): { name: string; sourcePath: string } | null {
  const row = getDb()
    .prepare("SELECT name, source_path FROM own_contracts WHERE lower(address)=lower(?) AND network=?")
    .get(address, network) as { name: string; source_path: string } | undefined;
  return row ? { name: row.name, sourcePath: row.source_path } : null;
}

export async function loadSource(
  address: string,
  network: string,
): Promise<{ source: VerifiedSource | null; origin: "own" | "explorer" | "none" }> {
  const own = ownContract(address, network);
  if (own) {
    const abs = path.resolve(process.cwd(), own.sourcePath);
    if (fs.existsSync(abs)) {
      return {
        source: { name: own.name, files: [{ path: path.basename(abs), content: fs.readFileSync(abs, "utf8") }] },
        origin: "own",
      };
    }
  }
  const fetched = await fetchVerifiedSource(address);
  return { source: fetched, origin: fetched ? "explorer" : "none" };
}

/** Concatenate verified source files, dropping import lines, for display and AI review. */
export function flattenSource(source: VerifiedSource): string {
  return source.files.map((f) => `// ==== ${f.path} ====\n${f.content}`).join("\n\n");
}
