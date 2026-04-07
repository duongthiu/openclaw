import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env") });

import { uploadRunToR2 } from "./storage.js";

async function main() {
  const outputDir = resolve(__dirname, "..", "output/news-2026-04-07-07-10");
  console.log("Testing R2 upload...");
  console.log("Account:", process.env.R2_ACCOUNT_ID ? "set" : "MISSING");
  console.log("Key:", process.env.R2_ACCESS_KEY_ID ? "set" : "MISSING");

  const urls = await uploadRunToR2(outputDir, "news-2026-04-07-07-10");
  console.log("\nUploaded URLs:", JSON.stringify(urls, null, 2));
}

main().catch((e) => console.error("Error:", e.message));
