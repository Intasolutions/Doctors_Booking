// Runs a Django manage.py command with the project's own Python (backend/venv).
//   node scripts/run-api.mjs runserver 0.0.0.0:8000
//   node scripts/run-api.mjs test
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const backend = join(dirname(fileURLToPath(import.meta.url)), "..", "backend");
const python = [join(backend, "venv", "Scripts", "python.exe"), join(backend, "venv", "bin", "python")].find(existsSync);

if (!python) {
  console.error("The API isn't set up yet. Run this once first:  npm run setup");
  process.exit(1);
}

const child = spawn(python, ["manage.py", ...process.argv.slice(2)], {
  cwd: backend,
  stdio: "inherit",
  // Show log lines immediately, and allow ₹ and other symbols in the console.
  env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
