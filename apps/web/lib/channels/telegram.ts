/** Telegram adapter (grammy). Long-polling; started only if TELEGRAM_BOT_TOKEN is set. */
import { Bot } from "grammy";
import { handleIncoming } from "./handler";

export function startTelegram(token: string): Bot {
  const bot = new Bot(token);
  bot.on("message:text", async (ctx) => {
    const key = `telegram:${ctx.chat.id}`;
    try {
      const reply = await handleIncoming(key, ctx.message.text);
      if (reply) await ctx.reply(reply);
    } catch (e) {
      await ctx.reply(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  void bot.start();
  return bot;
}
