import crypto from "crypto";
import { Telegraf } from "telegraf";

function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}
function nowIso() {
  return new Date().toISOString();
}
function normalizeCode(raw) {
  return String(raw || "").trim().toUpperCase();
}

function genLoginCode() {
  const hex = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `LG-${hex.slice(0,4)}-${hex.slice(4,8)}-${hex.slice(8,12)}`;
}
function addSecondsIso(sec) {
  return new Date(Date.now() + sec * 1000).toISOString();
}


async function getTelegramAvatarUrl(bot, tgUserId) {
  try {
    const photos = await bot.telegram.getUserProfilePhotos(tgUserId, 1);
    if (!photos?.photos?.length) return null;
    const fileId = photos.photos[0][0].file_id;
    const file = await bot.telegram.getFile(fileId);
    if (!file?.file_path) return null;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return null;
    return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  } catch (e) {
    console.warn("TG avatar fetch failed:", e?.message || e);
    return null;
  }
}


/**
 * Простая "сессия" в памяти, чтобы:
 * - помнить что юзер сейчас вводит код
 * - чистить старые сообщения бота (не засорять чат)
 *
 * Если у тебя несколько инстансов — лучше вынести в Supabase таблицу telegram_sessions.
 */
const chatState = new Map(); // chatId -> { awaitingCode: boolean, lastBotMessageId?: number }

function getState(chatId) {
  const key = String(chatId);
  if (!chatState.has(key)) chatState.set(key, { awaitingCode: false, lastBotMessageId: null });
  return chatState.get(key);
}

async function safeDelete(bot, chatId, messageId) {
  try {
    if (!chatId || !messageId) return;
    await bot.telegram.deleteMessage(chatId, messageId);
  } catch {
    // ignore (нет прав / уже удалено / нельзя удалить старое)
  }
}

function getMiniAppUrl() {
  const raw = String(process.env.TELEGRAM_MINI_APP_URL || process.env.MINI_APP_URL || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function menuKeyboard() {
  const rows = [];
  const miniAppUrl = getMiniAppUrl();

  if (miniAppUrl) {
    rows.push([{ text: "🚀 Открыть приложение", web_app: { url: miniAppUrl } }]);
  }

  // The code login stays only as a fallback for the legacy desktop client.
  rows.push([{ text: "🔑 Войти по коду", callback_data: "MENU_LOGIN" }]);
  rows.push([
    { text: "🔗 Привязать старый аккаунт", callback_data: "MENU_LINK" },
    { text: "✅ Статус", callback_data: "MENU_STATUS" }
  ]);
  rows.push([{ text: "ℹ️ Помощь", callback_data: "MENU_HELP" }]);
  rows.push([{ text: "🔄 Обновить меню", callback_data: "MENU_HOME" }]);

  return { inline_keyboard: rows };
}

function cancelKeyboard() {
  return {
    inline_keyboard: [[{ text: "↩️ Назад в меню", callback_data: "MENU_HOME" }]]
  };
}

function escapeMd(s) {
  // Telegram MarkdownV2 escaping
  // Reserved: _ * [ ] ( ) ~ ` > # + - = | { } . !
  return String(s ?? "").replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

function plainifyMdV2(s) {
  // Best-effort: turn MarkdownV2-formatted text into safe plain text
  let out = String(s ?? "");

  // Unescape MarkdownV2 reserved chars (\- -> -, \. -> . etc.)
  out = out.replace(/\\([_\*\[\]\(\)~`>#+\-=|{}.!])/g, "$1");

  // Remove common markdown wrappers
  out = out.replace(/`([^`]+)`/g, "$1");       // inline code
  out = out.replace(/\*([^*]+)\*/g, "$1");     // *bold*
  out = out.replace(/_([^_]+)_/g, "$1");       // _italic_

  // Collapse double backslashes left from JS string building
  out = out.replace(/\\\\/g, "\\");
  return out;
}


async function sendOrEditMenu(ctx, bot, text, extra = {}) {
  const chatId = ctx.chat?.id;
  const state = getState(chatId);

  // 1) If callback — try edit; fallback to plain text if MarkdownV2 fails
  if (ctx.updateType === "callback_query") {
    try {
      await ctx.editMessageText(text, {
        parse_mode: "MarkdownV2",
        reply_markup: menuKeyboard(),
        disable_web_page_preview: true,
        ...extra
      });
      return;
    } catch (e) {
      try {
        await ctx.editMessageText(plainifyMdV2(text), {
          reply_markup: menuKeyboard(),
          disable_web_page_preview: true,
          ...extra
        });
        return;
      } catch {
        // continue to sending
      }
    }
  }

  // 2) If we have last bot message — delete to keep chat clean
  if (state.lastBotMessageId) {
    await safeDelete(bot, chatId, state.lastBotMessageId);
    state.lastBotMessageId = null;
  }

  // 3) Send new message; fallback to plain text if MarkdownV2 fails
  try {
    const msg = await ctx.reply(text, {
      parse_mode: "MarkdownV2",
      reply_markup: menuKeyboard(),
      disable_web_page_preview: true,
      ...extra
    });
    state.lastBotMessageId = msg?.message_id ?? null;
  } catch (e) {
    const msg = await ctx.reply(plainifyMdV2(text), {
      reply_markup: menuKeyboard(),
      disable_web_page_preview: true,
      ...extra
    });
    state.lastBotMessageId = msg?.message_id ?? null;
  }
}

async function sendOrEdit(ctx, bot, text, replyMarkup) {
  const chatId = ctx.chat?.id;
  const state = getState(chatId);

  // Prefer edit on callbacks to avoid clutter; fallback to plain text if MarkdownV2 fails
  if (ctx.updateType === "callback_query") {
    try {
      await ctx.editMessageText(text, {
        parse_mode: "MarkdownV2",
        reply_markup: replyMarkup,
        disable_web_page_preview: true
      });
      return;
    } catch (e) {
      try {
        await ctx.editMessageText(plainifyMdV2(text), {
          reply_markup: replyMarkup,
          disable_web_page_preview: true
        });
        return;
      } catch {}
    }
  }

  if (state.lastBotMessageId) {
    await safeDelete(bot, chatId, state.lastBotMessageId);
    state.lastBotMessageId = null;
  }

  try {
    const msg = await ctx.reply(text, {
      parse_mode: "MarkdownV2",
      reply_markup: replyMarkup,
      disable_web_page_preview: true
    });
    state.lastBotMessageId = msg?.message_id ?? null;
  } catch (e) {
    const msg = await ctx.reply(plainifyMdV2(text), {
      reply_markup: replyMarkup,
      disable_web_page_preview: true
    });
    state.lastBotMessageId = msg?.message_id ?? null;
  }
}

async function linkWithCode({ supabase, ctx, bot, codeRaw }) {
  const chatId = ctx.chat?.id;
  const state = getState(chatId);

  const code = normalizeCode(codeRaw);

  if (!code || !code.startsWith("TG-")) {
    await sendOrEdit(ctx, bot, "❌ Нужен TG\\-код\\.\n\nПример: `TG-AB12-CD34-EF56`", cancelKeyboard());
    return { ok: false, reason: "bad_code" };
  }

  const hash = sha256(code);

  const { data: tokens, error: tErr } = await supabase
    .from("telegram_tokens")
    .select("*")
    .eq("token_hash", hash)
    .is("used_at", null)
    .is("revoked_at", null)
    .limit(1);

  if (tErr) {
    console.error(tErr);
    await sendOrEdit(ctx, bot, "⚠️ Серверная ошибка\\.\nПопробуй позже\\.", cancelKeyboard());
    return { ok: false, reason: "server" };
  }

  const tokenRow = tokens?.[0];
  if (!tokenRow) {
    await sendOrEdit(
      ctx,
      bot,
      "❌ Код неверный или уже использован\\.\nЕсли код утерян — напиши в поддержку\\.",
      cancelKeyboard()
    );
    return { ok: false, reason: "not_found" };
  }

  const userId = tokenRow.user_id;

  const { data: user, error: uErr } = await supabase
    .from("users")
    .select("id, telegram_chat_id, role, vip_until")
    .eq("id", userId)
    .single();

  if (uErr) {
    console.error(uErr);
    await sendOrEdit(ctx, bot, "⚠️ Серверная ошибка\\.\nПопробуй позже\\.", cancelKeyboard());
    return { ok: false, reason: "server" };
  }

  if (user?.telegram_chat_id && String(user.telegram_chat_id) !== String(chatId)) {
    await sendOrEdit(
      ctx,
      bot,
      "❌ Этот аккаунт уже привязан к другому Telegram\\.\nЕсли нужно сменить — только через поддержку\\.",
      cancelKeyboard()
    );
    return { ok: false, reason: "already_linked_elsewhere" };
  }

  const username = ctx.from?.username ? String(ctx.from.username) : null;
  const avatarUrl = await getTelegramAvatarUrl(bot, ctx.from?.id);


  const { error: updErr } = await supabase
    .from("users")
    .update({
      telegram_chat_id: chatId,
      telegram_username: username,
      telegram_linked_at: nowIso(),
      avatar_url: avatarUrl
    })
    .eq("id", userId);

  if (updErr) {
    console.error(updErr);
    await sendOrEdit(ctx, bot, "⚠️ Не смог привязать\\.\nПопробуй позже\\.", cancelKeyboard());
    return { ok: false, reason: "server" };
  }

  const { error: useErr } = await supabase
    .from("telegram_tokens")
    .update({
      used_at: nowIso(),
      used_chat_id: chatId
    })
    .eq("id", tokenRow.id);

  if (useErr) console.error(useErr);

  state.awaitingCode = false;

  await sendOrEditMenu(
    ctx,
    bot,
    "✅ *Готово\\!* Telegram привязан\\.\n\nТеперь ты будешь получать уведомления от приложения\\."
  );
  return { ok: true };
}

function welcomeText() {
  const hasMiniApp = Boolean(getMiniAppUrl());
  return [
    "🌙 *NightCoreX*",
    "",
    "Добро пожаловать\!",
    "",
    hasMiniApp
      ? "• Нажми *«🚀 Открыть приложение»* — вход будет выполнен автоматически через Telegram"
      : "• Mini App пока не настроен администратором",
    "• Уведомления о таймерах включаются внутри приложения",
    "• Вход по коду оставлен только для старой десктопной версии",
    ""
  ].join("\n");
}

function helpText() {
  return [
    "ℹ️ *Помощь*",
    "",
    "1\\) Нажми *«🚀 Открыть приложение»* в меню бота",
    "2\\) Mini App проверит аккаунт автоматически",
    "3\\) Открой *Настройки* внутри приложения, чтобы включить уведомления",
    "",
    "Вход по коду нужен только для старой ПК\-версии\.",
    "",
    "Если нужна помощь — обратитесь к нам в [Discord](https://discord.gg/GESqaKKFty)"
  ].join("\n");
}
async function issueLoginCode({ supabase, ctx, bot }) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const username = ctx.from?.username ? String(ctx.from.username) : null;
  const avatarUrl = await getTelegramAvatarUrl(bot, ctx.from?.id);


  // Try find existing user:
  //  - linked via telegram_chat_id
  //  - or previously created "tg guest" via discord_id = guest_tg_<chatId>
  const guestDiscordId = `guest_tg_${chatId}`;

  let { data: user, error: uErr } = await supabase
    .from("users")
    .select("id")
    .or(`telegram_chat_id.eq.${chatId},discord_id.eq.${guestDiscordId}`)
    .maybeSingle();

  if (uErr) {
    console.error(uErr);
    await sendOrEdit(ctx, bot, "⚠️ Ошибка сервера. Попробуй позже.", cancelKeyboard());
    return;
  }

  // If not linked yet — auto-create a "Telegram guest" user so login can work immediately.
  if (!user?.id) {
    const guestDiscordId = `guest_tg_${chatId}`;
    const guestName = username ? `tg:${username}` : `tg:${chatId}`;

    // 1) Create user
    const { data: created, error: cErr } = await supabase
      .from("users")
      .insert({
        discord_id: guestDiscordId,
        discord_username: guestName,
        role: "free",
        telegram_username: username,
        avatar_url: await getTelegramAvatarUrl(bot, ctx.from?.id)
      })
      .select("id")
      .maybeSingle();

    if (cErr) {
      // If already exists (duplicate) — load it and ensure telegram fields are set
      console.error(cErr);
      const { data: existing, error: eErr } = await supabase
        .from("users")
        .select("id")
        .eq("discord_id", guestDiscordId)
        .maybeSingle();

      if (eErr || !existing?.id) {
        console.error(eErr);
        await sendOrEdit(ctx, bot, "⚠️ Не смог создать аккаунт. Попробуй позже.", cancelKeyboard());
        return;
      }

      // Best-effort: set telegram fields
      await supabase
        .from("users")
        .update({
      telegram_chat_id: chatId,
      telegram_username: username,
      telegram_linked_at: nowIso(),
      avatar_url: avatarUrl
    })
        .eq("id", existing.id);

      user = { id: existing.id };
    } else {
      user = { id: created.id };
    }
  }

  const code = genLoginCode();
  const codeHash = sha256(code);

  const { error: insErr } = await supabase.from("telegram_login_codes").insert({
    code_hash: codeHash,
    chat_id: chatId,
    user_id: user.id,
    expires_at: addSecondsIso(120),
    created_at: nowIso()
  });

  if (insErr) {
    console.error(insErr);
    await sendOrEdit(ctx, bot, "⚠️ Не смог выдать код. Попробуй позже.", cancelKeyboard());
    return;
  }

  await sendOrEdit(
    ctx,
    bot,
    [
      "🔑 *Код для входа*",
      "",
      "Скопируй и вставь в приложении на экране входа:",
      "",
      `\`${escapeMd(code)}\``,
      "",
      "_Код действителен 2 минуты и одноразовый\._"
    ].join("\n"),
    menuKeyboard()
  );
}

export function setupTelegram(app, supabase) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.warn("⚠️ TELEGRAM_BOT_TOKEN is not set. Telegram bot is disabled.");
    app.locals.telegramSend = async () => false;
    return;
  }

  const bot = new Telegraf(BOT_TOKEN);
  const miniAppUrl = getMiniAppUrl();

  if (miniAppUrl) {
    bot.telegram
      .setChatMenuButton({
        menu_button: { type: "web_app", text: "Открыть NightCoreX", web_app: { url: miniAppUrl } },
      })
      .then(() => console.log("✅ Telegram Mini App menu button set"))
      .catch((error) => console.warn("⚠️ Telegram Mini App menu button was not set:", error?.message || error));
  } else {
    console.warn("ℹ️ TELEGRAM_MINI_APP_URL is not set. Mini App buttons are hidden.");
  }

  // expose send helper to the rest of backend
  app.locals.telegramSend = async (chatId, text) => {
    try {
      if (!chatId) return false;

      // VIP-only notifications: only send if chat is linked to a VIP/GOLD/etc account
      const { data: u, error: uErr } = await supabase
        .from("users")
        .select("role, vip_until")
        .eq("telegram_chat_id", String(chatId))
        .maybeSingle();

      if (uErr) {
        console.warn("TG send user lookup failed:", uErr?.message || uErr);
        return false;
      }

      const role = String(u?.role || "").toLowerCase();
      const vipUntil = u?.vip_until ? new Date(u.vip_until) : null;
      const isVip =
        role === "vip" ||
        role === "gold" ||
        role === "support" ||
        role === "admin" ||
        (vipUntil && vipUntil.getTime() > Date.now());

      if (!isVip) return false;

      await bot.telegram.sendMessage(chatId, text, { disable_web_page_preview: true });
      return true;
    } catch (e) {
      console.warn("TG send failed:", e?.message || e);
      return false;
    }
  };

  // ✅ /start с поддержкой payload: /start TG-XXXX...
  bot.start(async (ctx) => {
    const chatId = ctx.chat?.id;
    const state = getState(chatId);

    // Telegraf: payload лежит в ctx.startPayload (если есть)
    const payload = normalizeCode(ctx.startPayload || "");
    if (payload && payload.startsWith("TG-")) {
      // Авто-привязка по deep-link
      await sendOrEdit(ctx, bot, "⏳ Привязываю аккаунт по старт\\-коду\\…", cancelKeyboard());
      await linkWithCode({ supabase, ctx, bot, codeRaw: payload });
      return;
    }

    state.awaitingCode = false;
    await sendOrEditMenu(ctx, bot, welcomeText());
  });

  bot.command("menu", async (ctx) => {
    const chatId = ctx.chat?.id;
    const state = getState(chatId);
    state.awaitingCode = false;
    await sendOrEditMenu(ctx, bot, welcomeText());
  });


  bot.command("login", async (ctx) => {
    try {
      await issueLoginCode({ supabase, ctx, bot });
    } catch (e) {
      console.error(e);
      await sendOrEdit(ctx, bot, "⚠️ Ошибка. Попробуй позже.", cancelKeyboard());
    }
  });

  // Оставим /link как fallback (на всякий)
  bot.command("link", async (ctx) => {
    try {
      const text = String(ctx.message?.text || "");
      const parts = text.split(/\s+/).filter(Boolean);
      const code = normalizeCode(parts[1]);

      await linkWithCode({ supabase, ctx, bot, codeRaw: code });
    } catch (e) {
      console.error(e);
      await sendOrEdit(ctx, bot, "⚠️ Ошибка\\.\nПопробуй позже\\.", cancelKeyboard());
    }
  });

  bot.command("id", async (ctx) => ctx.reply(`chat_id: ${ctx.chat?.id}`));

  // ✅ Inline menu actions
  bot.action("MENU_HOME", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const chatId = ctx.chat?.id;
    const state = getState(chatId);
    state.awaitingCode = false;
    await sendOrEditMenu(ctx, bot, welcomeText());
  });

  bot.action("MENU_HELP", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const chatId = ctx.chat?.id;
    const state = getState(chatId);
    state.awaitingCode = false;
    await sendOrEdit(ctx, bot, helpText(), cancelKeyboard());
  });


  bot.action("MENU_LOGIN", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    try {
      await issueLoginCode({ supabase, ctx, bot });
    } catch (e) {
      console.error(e);
      await sendOrEdit(ctx, bot, "⚠️ Ошибка. Попробуй позже.", cancelKeyboard());
    }
  });

  bot.action("MENU_LINK", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const chatId = ctx.chat?.id;
    const state = getState(chatId);
    state.awaitingCode = true;

    await sendOrEdit(
      ctx,
      bot,
      [
        "🔗 *Привязка аккаунта*",
        "",
        "Вставь свой TG\\-код сюда одним сообщением\\.",
        "",
        "Пример: `TG-AB12-CD34-EF56`",
        ""
      ].join("\n"),
      cancelKeyboard()
    );
  });

  bot.action("MENU_STATUS", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const chatId = ctx.chat?.id;
    const state = getState(chatId);
    state.awaitingCode = false;

    // Проверяем привязан ли этот chat_id к юзеру
    try {
      const { data: user, error } = await supabase
        .from("users")
        // показываем в статусе также роль/план из приложения
        .select("id, telegram_username, telegram_linked_at, role, vip_until")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      if (error) {
        console.error(error);
        await sendOrEdit(ctx, bot, "⚠️ Не смог проверить статус\\.\nПопробуй позже\\.", cancelKeyboard());
        return;
      }

      if (!user) {
        await sendOrEdit(
          ctx,
          bot,
          "❌ *Не привязан*\n\nНажми *«🔗 Привязать аккаунт»* и вставь TG\\-код\\.",
          cancelKeyboard()
        );
        return;
      }

      const when = user.telegram_linked_at ? new Date(user.telegram_linked_at).toLocaleString() : "—";
      const uname = user.telegram_username ? `@${escapeMd(user.telegram_username)}` : "—";
      const role = user.role ? String(user.role).toUpperCase() : "FREE";
      const vipUntil = user.vip_until ? new Date(user.vip_until).toLocaleDateString() : null;

      await sendOrEdit(
        ctx,
        bot,
        [
          "✅ *Статус привязки*",
          "",
          `• Telegram: ${uname}`,
          `• Привязан: ${escapeMd(when)}`,
          `• Роль: *${escapeMd(role)}*${vipUntil ? ` \\(до ${escapeMd(vipUntil)}\\)` : ""}`,
          "",
          "Меню ниже 👇"
        ].join("\n"),
        menuKeyboard()
      );
    } catch (e) {
      console.error(e);
      await sendOrEdit(ctx, bot, "⚠️ Ошибка\\.\nПопробуй позже\\.", cancelKeyboard());
    }
  });

  // ✅ Если человек нажал "Привязать" — любое следующее текстовое сообщение считаем кодом
  bot.on("text", async (ctx) => {
    const chatId = ctx.chat?.id;
    const state = getState(chatId);

    if (!state.awaitingCode) {
      // Чтобы не засорять: можно мягко вернуть меню
      await sendOrEditMenu(ctx, bot, welcomeText());
      return;
    }

    const text = String(ctx.message?.text || "");
    await sendOrEdit(ctx, bot, "⏳ Проверяю код\\…", cancelKeyboard());
    try {
      await linkWithCode({ supabase, ctx, bot, codeRaw: text });
    } finally {
      state.awaitingCode = false;
    }
});

  // Webhook route (Render-friendly). Set TELEGRAM_WEBHOOK_URL to enable webhook.
  const webhookPath = process.env.TELEGRAM_WEBHOOK_PATH || "/telegram/webhook";
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL; // e.g. https://your-backend.onrender.com

  if (webhookUrl) {
    bot.telegram
      .setWebhook(webhookUrl.replace(/\/$/, "") + webhookPath)
      .then(() => console.log("✅ Telegram webhook set"))
      .catch((e) => console.warn("⚠️ Failed to set webhook:", e?.message || e));
  } else {
    console.warn("ℹ️ TELEGRAM_WEBHOOK_URL is not set. Using long polling.");
    bot.launch().catch((e) => console.error("Telegram launch failed:", e));
  }

  app.post(webhookPath, (req, res) => {
    // ✅ Respond immediately to Telegram to prevent retries (duplicate updates)
    res.status(200).send("OK");

    // Process update asynchronously
    Promise.resolve()
      .then(() => bot.handleUpdate(req.body))
      .catch((e) => console.error("TG handleUpdate failed:", e?.message || e));
  });

app.get("/telegram/health", (req, res) => res.json({ ok: true }));
}
