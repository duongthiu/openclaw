import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env") });

const SA_PATH = "/Users/tranduongthieu/.openclaw/google-service-account.json";
const PROJECT_ID = "openclaww-492603";

async function main() {
  console.log("🔑 Testing Google Cloud auto key generation step by step...\n");

  // Step 1: Load service account
  console.log("Step 1: Loading service account...");
  const sa = JSON.parse(readFileSync(SA_PATH, "utf-8"));
  console.log(`  ✅ Email: ${sa.client_email}`);
  console.log(`  ✅ Project: ${sa.project_id}`);

  // Step 2: Create JWT
  console.log("\nStep 2: Creating OAuth JWT...");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  ).toString("base64url");

  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(sa.private_key, "base64url");
  const jwt = `${header}.${payload}.${signature}`;
  console.log(`  ✅ JWT created (${jwt.length} chars)`);

  // Step 3: Exchange JWT for access token
  console.log("\nStep 3: Getting OAuth access token...");
  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResp.ok) {
    const err = await tokenResp.text();
    console.log(`  ❌ Token exchange failed (${tokenResp.status}): ${err.slice(0, 200)}`);
    return;
  }

  const tokenData = (await tokenResp.json()) as { access_token: string; expires_in: number };
  console.log(`  ✅ Access token obtained (expires in ${tokenData.expires_in}s)`);

  // Step 4: Create API key
  console.log("\nStep 4: Creating Gemini API key...");
  const createResp = await fetch(
    `https://apikeys.googleapis.com/v2/projects/${sa.project_id}/locations/global/keys`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName: `auto-pipeline-${Date.now()}`,
        restrictions: {
          apiTargets: [{ service: "generativelanguage.googleapis.com" }],
        },
      }),
    },
  );

  if (!createResp.ok) {
    const err = await createResp.text();
    console.log(`  ❌ Key creation failed (${createResp.status}): ${err.slice(0, 300)}`);
    return;
  }

  const operation = (await createResp.json()) as { name: string; done?: boolean };
  console.log(`  ✅ Operation started: ${operation.name}`);

  // Step 5: Poll until done
  console.log("\nStep 5: Waiting for key creation...");
  let result = operation;
  for (let i = 0; i < 15 && !result.done; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    process.stdout.write(`  Polling (${i + 1})... `);
    const pollResp = await fetch(`https://apikeys.googleapis.com/v2/${result.name}`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    result = (await pollResp.json()) as typeof operation & {
      done?: boolean;
      response?: Record<string, unknown>;
    };
    console.log(result.done ? "done!" : "waiting...");
  }

  // Step 6: Get the key string
  console.log("\nStep 6: Retrieving key string...");
  const keyResponse = result as { response?: { uid?: string; name?: string } };
  const keyResourceName =
    keyResponse.response?.name ?? result.name?.replace(/\/operations\/.*/, "");

  if (!keyResourceName) {
    console.log("  ❌ Could not determine key resource name");
    console.log("  Full response:", JSON.stringify(result, null, 2).slice(0, 500));
    return;
  }

  const keyStringResp = await fetch(
    `https://apikeys.googleapis.com/v2/${keyResourceName}/keyString`,
    { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
  );

  if (!keyStringResp.ok) {
    const err = await keyStringResp.text();
    console.log(`  ❌ Key string fetch failed (${keyStringResp.status}): ${err.slice(0, 200)}`);
    return;
  }

  const keyData = (await keyStringResp.json()) as { keyString: string };
  const newKey = keyData.keyString;
  console.log(`  ✅ New API key: ${newKey.slice(0, 12)}...${newKey.slice(-4)}`);

  // Step 7: Test the new key
  console.log("\nStep 7: Testing new key with Gemini...");
  const testResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${newKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "What is 2+2? Answer in one word." }] }],
      }),
    },
  );

  if (!testResp.ok) {
    const err = await testResp.text();
    console.log(`  ❌ Gemini test failed (${testResp.status}): ${err.slice(0, 200)}`);
    return;
  }

  const geminiData = (await testResp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log(`  ✅ Gemini response: "${text?.trim()}"`);

  console.log("\n🎉 SUCCESS! Auto key generation works end-to-end!");
  console.log(`\nYour new Gemini API key: ${newKey}`);
  console.log("Add it to .env as GOOGLE_AI_API_KEY to use it.");
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message);
});
