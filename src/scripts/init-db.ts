import "dotenv/config";
// VS Code can falsely flag this NodeNext-style import; tsx/tsc resolve it to store.ts correctly.
// @ts-ignore
import { closeDatabase, initDatabase } from "../lib/store.ts";

async function main() {
  await initDatabase();
  console.log("SQLite schema initialized successfully.");
}

main()
  .catch((error) => {
    console.error("Failed to initialize SQLite schema:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDatabase();
  });
