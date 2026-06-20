/** Discord adapter (discord.js). Started only if DISCORD_BOT_TOKEN is set. */
import { Client, Events, GatewayIntentBits } from "discord.js";
import { handleIncoming } from "./handler";

export function startDiscord(token: string): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
  });

  client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot) return;
    const key = `discord:${msg.channelId}`;
    try {
      const reply = await handleIncoming(key, msg.content);
      if (reply) await msg.reply(reply.slice(0, 1900)); // Discord 2000-char limit
    } catch (e) {
      await msg.reply(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  void client.login(token);
  return client;
}
