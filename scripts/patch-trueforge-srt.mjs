#!/usr/bin/env node

import { constants } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const [mode, targetArgument] = process.argv.slice(2);
if (!(["apply", "restore"].includes(mode)) || !targetArgument) {
  throw new Error("Usage: node scripts/patch-trueforge-srt.mjs <apply|restore> <linux-sandbox-utils.js>");
}

const target = resolve(targetArgument);
const normalizedTarget = target.replaceAll("\\", "/");
const expectedSuffix = "/@anthropic-ai/sandbox-runtime/dist/sandbox/linux-sandbox-utils.js";
if (!normalizedTarget.endsWith(expectedSuffix)) {
  throw new Error(`Refusing to modify an unexpected target; required suffix is ${expectedSuffix}.`);
}

const packagePath = resolve(dirname(target), "..", "..", "package.json");
const packageManifest = JSON.parse(await readFile(packagePath, "utf8"));
if (packageManifest.name !== "@anthropic-ai/sandbox-runtime" || packageManifest.version !== "0.0.71") {
  throw new Error("Compatibility patch is valid only for @anthropic-ai/sandbox-runtime 0.0.71.");
}

const pristineSha256 = "44a8e3b2c896c3be0ddcfe6ebbe1416e4c64b8300d305ee41f771fc7cad7717b";
const marker = "Runtime workaround for denyRead:[\"/\"]";
const stockAnchor = `// ========== FILESYSTEM RESTRICTIONS ==========
        const fsArgs = await generateFilesystemArgs(readConfig, writeConfig, maskedFileBinds, maskedFileStoreDir, ripgrepConfig, mandatoryDenySearchDepth, allowGitConfig, abortSignal);
        bwrapArgs.push(...fsArgs);
        // Always bind /dev
        bwrapArgs.push('--dev', '/dev');`;
const patchedAnchor = `// ========== FILESYSTEM RESTRICTIONS ==========
        const fsArgs = await generateFilesystemArgs(readConfig, writeConfig, maskedFileBinds, maskedFileStoreDir, ripgrepConfig, mandatoryDenySearchDepth, allowGitConfig, abortSignal);
        bwrapArgs.push(...fsArgs);
        // Runtime workaround for denyRead:["/"]: filesystem tmpfs mounts can
        // hide the proxy socket binds added above. Re-bind only those sockets
        // after filesystem policy so network filtering remains reachable.
        if (needsNetworkRestriction && httpSocketPath && socksSocketPath) {
            bwrapArgs.push('--bind', httpSocketPath, httpSocketPath);
            if (socksSocketPath !== httpSocketPath) {
                bwrapArgs.push('--bind', socksSocketPath, socksSocketPath);
            }
        }
        // Always bind /dev
        bwrapArgs.push('--dev', '/dev');`;
const backup = `${target}.erasegraph-stock`;

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

function verifySyntax() {
  const result = spawnSync(process.execPath, ["--check", target], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error("Patched sandbox runtime failed Node syntax validation.");
  }
}

if (mode === "apply") {
  const original = await readFile(target);
  const source = original.toString("utf8");
  if (occurrences(source, marker) === 1) {
    const saved = await readFile(backup);
    if (sha256(saved) !== pristineSha256) {
      throw new Error("Existing compatibility backup is not the expected pristine release file.");
    }
    verifySyntax();
    console.log("TrueForge sandbox compatibility patch is already applied.");
    process.exit(0);
  }
  if (sha256(original) !== pristineSha256 || occurrences(source, stockAnchor) !== 1) {
    throw new Error("Sandbox runtime bytes or patch anchor differ from the reviewed 0.0.71 release; refusing to patch.");
  }

  try {
    await copyFile(target, backup, constants.COPYFILE_EXCL);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const saved = await readFile(backup);
    if (sha256(saved) !== pristineSha256) {
      throw new Error("Existing compatibility backup is not the expected pristine release file.");
    }
  }
  await writeFile(target, source.replace(stockAnchor, patchedAnchor), "utf8");
  verifySyntax();
  console.log("Applied the narrow SRT proxy-socket re-bind compatibility patch.");
} else {
  const current = await readFile(target, "utf8");
  if (occurrences(current, marker) !== 1) {
    throw new Error("The reviewed compatibility marker was not found exactly once; refusing to restore.");
  }
  const saved = await readFile(backup);
  if (sha256(saved) !== pristineSha256) {
    throw new Error("Pristine backup hash mismatch; refusing to restore.");
  }
  await copyFile(backup, target);
  if (sha256(await readFile(target)) !== pristineSha256) {
    throw new Error("Restored file hash mismatch.");
  }
  verifySyntax();
  console.log("Restored the pristine SRT 0.0.71 file. Restart TrueForge before reuse.");
}
