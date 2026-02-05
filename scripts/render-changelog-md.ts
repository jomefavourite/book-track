import fs from "node:fs";

import {
  CHANGELOG_JSON_PATH,
  CHANGELOG_MD_PATH,
  renderChangelogMarkdown,
  type ConsolidatedChangelog,
} from "./changelog-lib";

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * Render consolidated markdown changelog.
 *
 * Usage:
 * - `node scripts/render-changelog-md.ts`
 * - `node scripts/render-changelog-md.ts path/to/CHANGELOG.json path/to/CHANGELOG.md`
 */
function main() {
  const inputPath = process.argv[2] ?? CHANGELOG_JSON_PATH;
  const outputPath = process.argv[3] ?? CHANGELOG_MD_PATH;

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Missing input changelog JSON: ${inputPath}`);
  }

  const changelog = readJson<ConsolidatedChangelog>(inputPath);
  const md = renderChangelogMarkdown(changelog);

  fs.mkdirSync("changelog", { recursive: true });
  fs.writeFileSync(outputPath, md, "utf8");

  console.log(`✅ Wrote ${outputPath}`);
}

main();