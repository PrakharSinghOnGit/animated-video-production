import fs from "node:fs";
import path from "node:path";
import { COMPONENT_REGISTRY } from "../src/lib/registry";

function main() {
  console.log("Generating docs/COMPONENTS.md from Component Registry...");

  let markdown = `# Motion Engine — Component Catalog

This document is auto-generated from the active \`COMPONENT_REGISTRY\` in \`src/lib/registry.ts\`.
Every component reads strictly from design tokens and motion constants.

---

| Component | Purpose | Status |
| :--- | :--- | :--- |
`;

  const componentNames = Object.keys(COMPONENT_REGISTRY);

  for (const name of componentNames) {
    const entry = COMPONENT_REGISTRY[name];
    markdown += `| \`${name}\` | ${entry.description} | **Active** |\n`;
  }

  markdown += `\n---\n\n## Component Details & Fixtures\n\n`;

  for (const name of componentNames) {
    const entry = COMPONENT_REGISTRY[name];
    const fixturePath = path.resolve(process.cwd(), "src", "components", name, "fixtures.json");
    let sampleFixture = "";
    if (fs.existsSync(fixturePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
        sampleFixture = JSON.stringify(raw[0] || {}, null, 2);
      } catch {
        sampleFixture = "// No fixture available";
      }
    }

    markdown += `### \`${name}\`\n\n`;
    markdown += `**Description:** ${entry.description}\n\n`;
    markdown += `#### Example Fixture Props:\n\`\`\`json\n${sampleFixture}\n\`\`\`\n\n`;
  }

  const outputPath = path.resolve(process.cwd(), "docs", "COMPONENTS.md");
  fs.writeFileSync(outputPath, markdown, "utf-8");
  console.log(`✓ Updated ${outputPath} (${componentNames.length} components)`);
}

main();
