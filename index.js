import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const distEntry = path.join(rootDir, "dist", "index.js");

if (!existsSync(distEntry)) {
  const installCmd = process.env.npm_execpath?.includes("pnpm") ? "pnpm" : "npm";
  const buildArgs = installCmd === "pnpm" ? ["build"] : ["run", "build"];

  const result = spawnSync(installCmd, buildArgs, {
    cwd: rootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

await import("./dist/index.js");
