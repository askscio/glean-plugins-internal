// Turn license-checker's JSON output into LICENSES-THIRD-PARTY.txt.
//
// Usage: node scripts/build-licenses.mjs <licenses.json> <out.txt>
//
// We keep this split out of pack-plugin.sh because shelling enough JSON
// munging to walk `licenses`, `publisher`, `repository`, and inline the
// LICENSE file contents through bash/jq gets gnarly fast.

import fs from "node:fs";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: build-licenses.mjs <licenses.json> <out.txt>");
  process.exit(2);
}

const licenses = JSON.parse(fs.readFileSync(inPath, "utf8"));
const lines = [
  "Third-Party Licenses",
  "====================",
  "",
  "This Glean plugin bundles the following open-source dependencies. Each",
  "is governed by its original license; the full license text (where",
  "available on disk at build time) is included below each entry.",
  "",
];

for (const name of Object.keys(licenses).sort()) {
  const info = licenses[name];
  lines.push("----");
  lines.push(name);
  lines.push(`  License: ${info.licenses || "UNKNOWN"}`);
  if (info.publisher) lines.push(`  Publisher: ${info.publisher}`);
  if (info.repository) lines.push(`  Repo: ${info.repository}`);
  if (info.licenseFile) {
    try {
      const txt = fs.readFileSync(info.licenseFile, "utf8").trim();
      if (txt) {
        lines.push("");
        lines.push(txt);
        lines.push("");
      }
    } catch {
      // License file referenced but missing — fall through silently.
    }
  }
  lines.push("");
}

fs.writeFileSync(outPath, lines.join("\n"));
console.error(
  `Wrote ${outPath} (${Object.keys(licenses).length} deps)`,
);
