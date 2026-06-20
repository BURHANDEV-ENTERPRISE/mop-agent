/**
 * Start messaging channels for which a bot token is configured. SDKs are loaded
 * lazily (dynamic import) so they cost nothing when unused.
 */
export async function startChannels(): Promise<string[]> {
  const started: string[] = [];
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const { startTelegram } = await import("./telegram");
    startTelegram(process.env.TELEGRAM_BOT_TOKEN);
    started.push("telegram");
  }
  if (process.env.DISCORD_BOT_TOKEN) {
    const { startDiscord } = await import("./discord");
    startDiscord(process.env.DISCORD_BOT_TOKEN);
    started.push("discord");
  }
  return started;
}
