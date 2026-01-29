import fs from "node:fs";

const files = fs.readdirSync("changelog/generated").filter((f) => f.endsWith(".json"));
for (const file of files) {
  const j = JSON.parse(fs.readFileSync(`changelog/generated/${file}`, "utf8"));
  const md =
`## PR #${j.prNumber}

${j.items
  .map(
    (it: any) =>
      `- **${it.type}(${it.scope})**: ${it.summary}${it.breaking ? " ⚠️ BREAKING" : ""}\n` +
      (it.details?.length ? it.details.map((d: string) => `  - ${d}`).join("\n") + "\n" : "")
  )
  .join("\n")}
`;
  fs.writeFileSync(`changelog/generated/pr-${j.prNumber}.md`, md, "utf8");
}