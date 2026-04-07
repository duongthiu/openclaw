/**
 * Listens for approval/rejection via Discord messages.
 *
 * Discord buttons require a webhook endpoint (complex setup).
 * Instead, we poll for reply messages in the published channels.
 *
 * Usage: npx tsx src/approval-listener.ts
 * Or:    npx tsx src/cli.ts approve <runId>
 *        npx tsx src/cli.ts reject <runId>
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "..", ".env") });

import { handleApproval, handleRejection } from "./approval.js";

const API = "https://discord.com/api/v10";
const getToken = () => process.env.DISCORD_BOT_TOKEN ?? "";
const CHANNELS = {
  publishedNews: "1490932855453515898",
  publishedTutorials: "1490932862386442240",
};

/** Find pending approvals from output directories */
function findPendingApprovals(): Array<{
  runId: string;
  outputDir: string;
  data: Record<string, unknown>;
}> {
  const outputBase = resolve(__dirname, "..", "output");
  const pending: Array<{ runId: string; outputDir: string; data: Record<string, unknown> }> = [];

  try {
    for (const dir of readdirSync(outputBase)) {
      const approvalFile = resolve(outputBase, dir, "approval.json");
      if (existsSync(approvalFile)) {
        const data = JSON.parse(readFileSync(approvalFile, "utf-8"));
        if (data.status === "pending") {
          pending.push({ runId: dir, outputDir: resolve(outputBase, dir), data });
        }
      }
    }
  } catch {}

  return pending;
}

/** Poll Discord channel for approve/reject replies */
async function pollForReplies(): Promise<void> {
  const token = getToken();
  if (!token) {
    console.log("No Discord bot token");
    return;
  }

  const pending = findPendingApprovals();
  if (pending.length === 0) {
    console.log("No pending approvals");
    return;
  }

  console.log(`Found ${pending.length} pending approval(s):`);
  for (const p of pending) {
    console.log(`  - ${p.runId}: ${(p.data as Record<string, string>).videoTitle ?? "unknown"}`);
  }

  // Check recent messages in both channels
  for (const channelId of [CHANNELS.publishedNews, CHANNELS.publishedTutorials]) {
    const resp = await fetch(`${API}/channels/${channelId}/messages?limit=20`, {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!resp.ok) continue;
    const messages = (await resp.json()) as Array<{
      content: string;
      author: { bot?: boolean };
      id: string;
    }>;

    for (const msg of messages) {
      if (msg.author.bot) continue;
      const text = msg.content.toLowerCase().trim();

      for (const p of pending) {
        if (text === "approve" || text === `approve ${p.runId}`) {
          console.log(`\n✅ Approval received for ${p.runId}`);
          // Re-load approval data into memory
          const { requestApproval: _, ...approvalData } = p.data as Record<string, unknown>;
          const { handleApproval: doApproval } = await import("./approval.js");

          // We need to manually set up the pending approval
          const { getAllPendingApprovals } = await import("./approval.js");
          getAllPendingApprovals().set(p.runId, p.data as never);

          const results = await doApproval(p.runId);
          console.log("Upload results:", results);
          return;
        }

        if (text === "reject" || text.startsWith(`reject ${p.runId}`)) {
          const reason = text
            .replace(/^reject\s*/, "")
            .replace(p.runId, "")
            .trim();
          console.log(`\n❌ Rejection received for ${p.runId}`);
          const { getAllPendingApprovals } = await import("./approval.js");
          getAllPendingApprovals().set(p.runId, p.data as never);
          await handleRejection(p.runId, reason || undefined);
          return;
        }
      }
    }
  }

  console.log("\nNo approve/reject messages found. Waiting...");
  console.log("Reply 'approve' or 'reject' in #published-news to continue.");
}

// Direct CLI approve/reject
async function directAction(action: string, runId?: string): Promise<void> {
  const pending = findPendingApprovals();

  if (pending.length === 0) {
    console.log("No pending approvals");
    return;
  }

  const target = runId ? pending.find((p) => p.runId === runId) : pending[0];
  if (!target) {
    console.log(`Run "${runId}" not found. Pending: ${pending.map((p) => p.runId).join(", ")}`);
    return;
  }

  const { getAllPendingApprovals } = await import("./approval.js");
  getAllPendingApprovals().set(target.runId, target.data as never);

  if (action === "approve") {
    console.log(`✅ Approving: ${target.runId}`);
    const results = await handleApproval(target.runId);
    console.log("Results:", results);
  } else {
    console.log(`❌ Rejecting: ${target.runId}`);
    await handleRejection(target.runId);
  }
}

// Entry point
const args = process.argv.slice(2);
if (args[0] === "approve") {
  directAction("approve", args[1]).catch(console.error);
} else if (args[0] === "reject") {
  directAction("reject", args[1]).catch(console.error);
} else {
  pollForReplies().catch(console.error);
}
