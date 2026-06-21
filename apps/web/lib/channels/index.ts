/**
 * Start messaging channels for which a bot token is configured. SDKs are loaded
 * lazily (dynamic import) so they cost nothing when unused.
 */
export async function startChannels(): Promise<string[]> {
  const started: string[] = [];
  const { listEnabledAppConfigs } = await import("./config");
  const configs = listEnabledAppConfigs();
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN ?? configs.find((config) => config.appId === "telegram")?.payload.secret;
  const discordToken = process.env.DISCORD_BOT_TOKEN ?? configs.find((config) => config.appId === "discord")?.payload.secret;
  if (telegramToken) {
    const { startTelegram } = await import("./telegram");
    startTelegram(telegramToken);
    started.push("telegram");
  }
  if (discordToken) {
    const { startDiscord } = await import("./discord");
    startDiscord(discordToken);
    started.push("discord");
  }
  return started;
}
