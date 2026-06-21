import { Client, GatewayIntentBits, Partials } from "discord.js";

export async function startDiscordBot() {
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;

  if (!DISCORD_BOT_TOKEN) {
    console.error("❌ DISCORD_BOT_TOKEN not set (Render -> Environment)");
    return;
  }
  if (!DISCORD_GUILD_ID) {
    console.error("❌ DISCORD_GUILD_ID not set (Render -> Environment)");
    return;
  }

  console.log("🤖 Discord bot init...");
  console.log("   • token:", `len=${String(DISCORD_BOT_TOKEN).length}`);
  console.log("   • guild:", DISCORD_GUILD_ID);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
  });

  // Extra visibility
  client.on("ready", () => {
    console.log("✅ Discord READY:", client.user?.tag);
  });
  client.on("warn", (m) => console.warn("⚠️ Discord WARN:", m));
  client.on("error", (e) => console.error("❌ Discord ERROR:", e));
  client.on("shardError", (e) => console.error("❌ Discord SHARD ERROR:", e));
  client.on("invalidated", () => console.error("❌ Discord session invalidated"));
  client.rest?.on?.("rateLimited", (info) => {
    try { console.warn("⚠️ Discord REST rateLimited:", info); } catch {}
  });

  // If login hangs, print a hint
  const hangTimer = setTimeout(() => {
    console.error("❌ Discord login still pending after 25s (network / token / gateway).");
    console.error("   Tips: reset bot token in Dev Portal, redeploy, or try again later.");
  }, 25_000);

  try {
    console.log("🔑 Logging in to Discord gateway...");
    // Hard timeout on login so we never hang silently
    await Promise.race([
      client.login(DISCORD_BOT_TOKEN),
      new Promise((_, reject) => setTimeout(() => reject(new Error("LOGIN_TIMEOUT_25S")), 25_000))
    ]);

    clearTimeout(hangTimer);

    // Fetch guild to confirm access
    const guild = await client.guilds.fetch(DISCORD_GUILD_ID).catch(() => null);
    if (!guild) {
      console.error("❌ Logged in, but cannot fetch guild. Check DISCORD_GUILD_ID and bot is on the server.");
      return;
    }

    console.log("🤖 Discord bot online:", client.user?.tag);
    console.log("   • guild name:", guild.name);
  } catch (e) {
    clearTimeout(hangTimer);
    console.error("❌ Discord login failed:", e?.message || e);
  }
}
