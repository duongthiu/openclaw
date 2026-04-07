/**
 * Direct Discord notifications via bot API.
 * Posts pipeline progress to specific channels without needing LLM tool calling.
 */

// Read token lazily so dotenv has time to load
const getToken = () => process.env.DISCORD_BOT_TOKEN ?? "";
const API = "https://discord.com/api/v10";

// Channel IDs from your server
const CHANNELS = {
  teamStatus: "1490891176272986308",
  scrapedArticles: "1490932828228026439",
  scripts: "1490932835257680042",
  slidePreview: "1490932841599729748",
  videoProgress: "1490932848184655883",
  publishedNews: "1490932855453515898",
  publishedTutorials: "1490932862386442240",
  commands: "1490891176272986307",
};

async function sendToChannel(channelId: string, content: string): Promise<void> {
  const BOT_TOKEN = getToken();
  if (!BOT_TOKEN) return;

  try {
    await fetch(`${API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: content.slice(0, 2000) }),
    });
  } catch (err) {
    console.warn(`  Discord notify failed: ${(err as Error).message}`);
  }
}

async function sendFileToChannel(
  channelId: string,
  filePath: string,
  message: string,
): Promise<void> {
  const BOT_TOKEN = getToken();
  if (!BOT_TOKEN) return;

  try {
    const { readFileSync } = await import("node:fs");
    const { basename } = await import("node:path");
    const fileData = readFileSync(filePath);
    const fileName = basename(filePath);

    const formData = new FormData();
    formData.append("content", message);
    formData.append("files[0]", new Blob([fileData]), fileName);

    await fetch(`${API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
      body: formData,
    });
  } catch (err) {
    console.warn(`  Discord file send failed: ${(err as Error).message}`);
  }
}

export const discord = {
  /** Post to #team-status */
  status: (msg: string) => sendToChannel(CHANNELS.teamStatus, msg),

  /** Post scraped articles to #scraped-articles */
  articles: (msg: string) => sendToChannel(CHANNELS.scrapedArticles, msg),

  /** Post script to #scripts */
  script: (msg: string) => sendToChannel(CHANNELS.scripts, msg),

  /** Post slide image to #slide-preview */
  slideImage: (filePath: string, caption: string) =>
    sendFileToChannel(CHANNELS.slidePreview, filePath, caption),

  /** Post to #video-progress */
  videoProgress: (msg: string) => sendToChannel(CHANNELS.videoProgress, msg),

  /** Post to #published-news */
  publishedNews: (msg: string) => sendToChannel(CHANNELS.publishedNews, msg),

  /** Post to #published-tutorials */
  publishedTutorials: (msg: string) => sendToChannel(CHANNELS.publishedTutorials, msg),

  /** Post to #commands */
  commands: (msg: string) => sendToChannel(CHANNELS.commands, msg),
};
