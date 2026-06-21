// pay.js (patched) — динамическая цена по курсу (ориг. $5) + выбор провайдера
(() => {
  const cfg = window.NX_PAY || {};
  const qs = new URLSearchParams(window.location.search);

  // plan приходит: 1m / 3m / 12m / lifetime
  const rawPlan = (qs.get("plan") || "1m").toLowerCase();

  // 12m -> year (у тебя годовая ссылка)
  const PLAN_MAP = {
    "1m": "1m",
    "3m": "3m",
    "12m": "year",
    "year": "year",
    "lifetime": "lifetime",
    "life": "lifetime",
  };
  const plan = PLAN_MAP[rawPlan] || "1m";

  // ===== FX (live) =====
  const FX = { RUB_PER_USD: null, UAH_PER_USD: null, _loaded: false };

  async function loadFx() {
    const key = "nx_fx_cache_v1";
    const cached = (() => {
      try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
    })();

    if (cached && (Date.now() - cached.ts) < 30 * 60 * 1000) {
      FX.RUB_PER_USD = cached.rub;
      FX.UAH_PER_USD = cached.uah;
      FX._loaded = true;
      return;
    }

    // Frankfurter (без API key). Подходит для client-side. https://frankfurter.dev
    const res = await fetch("https://api.frankfurter.dev/latest?from=USD&to=RUB,UAH", { cache: "no-store" });
    if (!res.ok) throw new Error("FX fetch failed");

    const data = await res.json();
    const rub = data?.rates?.RUB;
    const uah = data?.rates?.UAH;

    if (typeof rub === "number") FX.RUB_PER_USD = rub;
    if (typeof uah === "number") FX.UAH_PER_USD = uah;
    FX._loaded = true;

    try {
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), rub: FX.RUB_PER_USD, uah: FX.UAH_PER_USD }));
    } catch {}
  }

  // ===== планы в USD (исходник) =====
  const PLAN_META = {
    "1m": { title: "1 месяц", usd: 5.00, hint: "Ежемесячный доступ" },
    "3m": { title: "3 месяца", usd: 12.00, hint: "Скидка 20%" },
    "year": { title: "12 месяцев", usd: 30.00, hint: "Скидка 50%" },
    "lifetime": { title: "Навсегда", usd: 44.99, hint: "Один платёж" },
  };
  const meta = PLAN_META[plan] || PLAN_META["1m"];

  const planTitle = document.getElementById("planTitle");
  const planPrice = document.getElementById("planPrice");
  const planHint = document.getElementById("planHint");

  function moneyUSD(n) {
    return `$${Number(n).toFixed(2)}`;
  }

  function moneyLocal(n, currency, locale) {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
    } catch {
      // fallback
      const rounded = Math.round(n);
      const sym = currency === "RUB" ? "₽" : currency === "UAH" ? "₴" : "$";
      return `${rounded.toLocaleString(locale)} ${sym}`;
    }
  }

  function setPriceText(region) {
    // region: us / world / ua / ru / cis
    const usd = meta.usd;

    // Если FX не загрузился — показываем USD, но без ошибок.
    if (!FX._loaded) {
      if (planPrice) planPrice.textContent = moneyUSD(usd);
      return;
    }

    if (region === "ru" || region === "cis") {
      const rub = usd * (FX.RUB_PER_USD || 0);
      if (planPrice) planPrice.textContent = `${moneyLocal(rub, "RUB", "ru-RU")} (≈ ${moneyUSD(usd)})`;
      return;
    }

    if (region === "ua") {
      const uah = usd * (FX.UAH_PER_USD || 0);
      if (planPrice) planPrice.textContent = `${moneyLocal(uah, "UAH", "uk-UA")} (≈ ${moneyUSD(usd)})`;
      return;
    }

    // us/world
    if (planPrice) planPrice.textContent = moneyUSD(usd);
  }

  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return alert(msg);
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 1600);
  }

  function openProvider(providerKey) {
    const link = cfg?.[providerKey]?.[plan];
    if (!link) return toast(`Нет ссылки: ${providerKey} / ${plan}`);
    window.open(link, "_blank", "noopener,noreferrer");
  }

  // Логика регионов -> провайдер
  const REGION_PROVIDER = {
    us: "stripe",
    ua: "stripe",
    world: "stripe",   // “другие страны” тоже через Stripe
    ru: "lava",
    cis: "lava",
    crypto: "crypto",
  };

  // Проставляем заголовки сразу
  if (planTitle) planTitle.textContent = meta.title;
  if (planHint) planHint.textContent = meta.hint;
  if (planPrice) planPrice.textContent = moneyUSD(meta.usd); // fallback, если FX не загрузится

  // Авто-регион по языку браузера (чтобы сразу подставить курс)
  function guessRegion() {
    const lang = (navigator.language || "").toLowerCase();
    if (lang.startsWith("ru")) return "ru";
    if (lang.startsWith("uk") || lang.includes("ua")) return "ua";
    return "us";
  }
  let currentRegion = guessRegion();

  // Загрузка FX и обновление цены
  loadFx()
    .then(() => setPriceText(currentRegion))
    .catch((e) => {
      // оставляем USD, но полезно увидеть ошибку в консоли
      console.warn("[NX] FX load failed:", e);
      setPriceText("us");
    });

  // При клике по регионам: обновляем цену + открываем нужный провайдер
  document.querySelectorAll("[data-region]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const region = btn.dataset.region;
      currentRegion = region || "us";

      // обновляем отображаемую цену по курсу
      setPriceText(currentRegion);

      const provider = REGION_PROVIDER[currentRegion];
      if (provider === "stripe") return openProvider("stripe");
      if (provider === "lava") return openProvider("lava");
      if (provider === "crypto") return toast("Крипта: пока не подключено");
      toast("Неизвестный регион");
    });
  });

  const backBtn = document.getElementById("backBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = "/subscription/index.html";
    });
  }
})();
