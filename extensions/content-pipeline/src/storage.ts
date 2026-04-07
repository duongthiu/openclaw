/**
 * Cloudflare R2 storage with free tier limits.
 *
 * Free tier: 10GB storage, 1M reads, 100K writes, zero egress.
 * Hard limit: stops uploading at maxStorageGB (default 8GB).
 * Auto-cleanup: deletes runs older than retentionDays (default 30).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";

// Read env lazily so dotenv has time to load
const env = () => ({
  accountId: process.env.R2_ACCOUNT_ID ?? "",
  accessKey: process.env.R2_ACCESS_KEY_ID ?? "",
  secretKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  bucket: process.env.R2_BUCKET ?? "openclaw-pipeline",
  maxStorageGB: parseFloat(process.env.R2_MAX_STORAGE_GB ?? "8"),
  retentionDays: parseInt(process.env.R2_RETENTION_DAYS ?? "30", 10),
});

function getClient(): S3Client | null {
  const e = env();
  if (!e.accountId || !e.accessKey || !e.secretKey) return null;

  return new S3Client({
    region: "auto",
    endpoint: `https://${e.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: e.accessKey,
      secretAccessKey: e.secretKey,
    },
  });
}

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".srt": "text/plain",
  ".mp3": "audio/mpeg",
};

async function getCurrentStorageBytes(client: S3Client): Promise<number> {
  let total = 0;
  let token: string | undefined;

  do {
    const resp = await client.send(
      new ListObjectsV2Command({
        Bucket: env().bucket,
        ContinuationToken: token,
      }),
    );
    for (const obj of resp.Contents ?? []) {
      total += obj.Size ?? 0;
    }
    token = resp.NextContinuationToken;
  } while (token);

  return total;
}

async function cleanupOldRuns(client: S3Client): Promise<number> {
  const cutoff = Date.now() - env().retentionDays * 24 * 60 * 60 * 1000;
  const toDelete: { Key: string }[] = [];
  let token: string | undefined;

  do {
    const resp = await client.send(
      new ListObjectsV2Command({ Bucket: env().bucket, ContinuationToken: token }),
    );
    for (const obj of resp.Contents ?? []) {
      if (obj.LastModified && obj.LastModified.getTime() < cutoff && obj.Key) {
        toDelete.push({ Key: obj.Key });
      }
    }
    token = resp.NextContinuationToken;
  } while (token);

  if (toDelete.length === 0) return 0;

  // Delete in batches of 1000 (S3 limit)
  for (let i = 0; i < toDelete.length; i += 1000) {
    await client.send(
      new DeleteObjectsCommand({
        Bucket: env().bucket,
        Delete: { Objects: toDelete.slice(i, i + 1000) },
      }),
    );
  }

  return toDelete.length;
}

/**
 * Upload a pipeline run's output to R2.
 * Returns public URLs for uploaded files.
 */
export async function uploadRunToR2(
  outputDir: string,
  runId: string,
): Promise<Record<string, string>> {
  const client = getClient();
  if (!client) {
    console.log("  ⏭ R2 upload skipped (no credentials configured)");
    return {};
  }

  // Check bucket exists
  try {
    await client.send(new HeadBucketCommand({ Bucket: env().bucket }));
  } catch {
    console.warn(`  ❌ R2 bucket "${env().bucket}" not accessible`);
    return {};
  }

  // Cleanup old runs first
  const deleted = await cleanupOldRuns(client);
  if (deleted > 0) {
    console.log(`  🗑️ Cleaned up ${deleted} old files from R2`);
  }

  // Check storage limit
  const currentBytes = await getCurrentStorageBytes(client);
  const currentGB = currentBytes / (1024 * 1024 * 1024);
  console.log(`  📦 R2 storage: ${currentGB.toFixed(2)}GB / ${env().maxStorageGB}GB limit`);

  if (currentGB >= env().maxStorageGB) {
    console.warn(
      `  ⚠️ R2 storage limit reached (${currentGB.toFixed(2)}GB >= ${env().maxStorageGB}GB). Skipping upload.`,
    );
    return {};
  }

  // Collect files to upload: videos, slides, script
  const filesToUpload: { localPath: string; r2Key: string }[] = [];

  // Videos
  for (const file of ["video_landscape.mp4", "video_portrait.mp4"]) {
    const fullPath = join(outputDir, file);
    try {
      statSync(fullPath);
      filesToUpload.push({ localPath: fullPath, r2Key: `${runId}/${file}` });
    } catch {}
  }

  // Slides
  const slidesDir = join(outputDir, "slides");
  try {
    for (const file of readdirSync(slidesDir)) {
      if (file.endsWith(".png")) {
        filesToUpload.push({ localPath: join(slidesDir, file), r2Key: `${runId}/slides/${file}` });
      }
    }
  } catch {}

  // Script
  const scriptPath = join(outputDir, "script.json");
  try {
    statSync(scriptPath);
    filesToUpload.push({ localPath: scriptPath, r2Key: `${runId}/script.json` });
  } catch {}

  // Check total upload size won't exceed limit
  let uploadSize = 0;
  for (const f of filesToUpload) {
    uploadSize += statSync(f.localPath).size;
  }
  const uploadGB = uploadSize / (1024 * 1024 * 1024);
  if (currentGB + uploadGB >= env().maxStorageGB) {
    console.warn(
      `  ⚠️ Upload would exceed limit (${(currentGB + uploadGB).toFixed(2)}GB). Skipping.`,
    );
    return {};
  }

  // Upload files
  const urls: Record<string, string> = {};
  const publicBase = `https://pub-${env().accountId}.r2.dev`;

  for (const f of filesToUpload) {
    const fileData = readFileSync(f.localPath);
    const ext = extname(f.localPath);
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

    await client.send(
      new PutObjectCommand({
        Bucket: env().bucket,
        Key: f.r2Key,
        Body: fileData,
        ContentType: contentType,
      }),
    );

    urls[basename(f.localPath)] = `${publicBase}/${f.r2Key}`;
  }

  console.log(
    `  ☁️ Uploaded ${filesToUpload.length} files to R2 (${(uploadSize / (1024 * 1024)).toFixed(1)}MB)`,
  );

  return urls;
}
