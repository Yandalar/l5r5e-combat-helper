// Builds the installable module ZIP for a release:
//
//   npm run release            → release/l5r5e-combat-helper-v<version>.zip + release/module.json
//   node tools/release.mjs --tag v1.2.0   (CI: fails if the tag does not match the versions)
//
// The ZIP has module.json at its root (Foundry installs it into modules/<id>/)
// plus dist/, lang/, styles/, README.md, CHANGELOG.md and LICENSE. Its module.json
// gets the `download` URL of this exact version; the `manifest` URL always points
// to the latest release, so Foundry offers updates automatically.
// Expects `npm run build:release` to have produced dist/bundle.js without a
// source map (the map is only useful while developing).
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, cpSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "module.json"), "utf8"));

const tagArg = process.argv.indexOf("--tag");
const tag = tagArg > 0 ? process.argv[tagArg + 1] : null;
const version = manifest.version;
const problems = [];
if (pkg.version !== version) problems.push(`package.json (${pkg.version}) y module.json (${version}) no coinciden`);
if (tag && tag !== `v${version}`) problems.push(`el tag ${tag} no coincide con module.json (v${version})`);
const bundlePath = join(root, "dist/bundle.js");
if (!existsSync(bundlePath)) problems.push("falta dist/bundle.js: corré npm run build:release");
else if (readFileSync(bundlePath, "utf8").includes("sourceMappingURL")) {
  problems.push("dist/bundle.js es un build de desarrollo (tiene source map): corré npm run build:release");
}
if (problems.length) {
  console.error(`✗ ${problems.join("\n✗ ")}`);
  process.exit(1);
}

const repo = manifest.url.replace(/\/$/, "");
const zipName = `${manifest.id}-v${version}.zip`;
manifest.download = `${repo}/releases/download/v${version}/${zipName}`;

const out = join(root, "release");
const stage = join(out, manifest.id);
rmSync(out, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
// Only the bundle from dist/: a stale dev source map is not shipped.
mkdirSync(join(stage, "dist"));
cpSync(bundlePath, join(stage, "dist/bundle.js"));
for (const item of ["lang", "styles", "README.md", "CHANGELOG.md", "LICENSE"]) {
  cpSync(join(root, item), join(stage, item), { recursive: true });
}
writeFileSync(join(stage, "module.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join(out, "module.json"), JSON.stringify(manifest, null, 2) + "\n");
// Release assets next to the ZIP: module.json's readme/changelog/license URLs point here.
for (const doc of ["README.md", "CHANGELOG.md", "LICENSE"]) cpSync(join(root, doc), join(out, doc));
execFileSync("zip", ["-r", "-X", "-q", join(out, zipName), ".", "-x", "*.DS_Store"], { cwd: stage });
rmSync(stage, { recursive: true });

console.log(`✓ ${join("release", zipName)}`);
console.log(`✓ release/module.json (download → ${manifest.download})`);
