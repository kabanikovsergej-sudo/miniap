// ====== STARS BACKGROUND (canvas) ======
(function initStars(){
  const canvas = document.getElementById("stars");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let w = 0, h = 0;
  let stars = [];

  function resize() {
    w = canvas.width = window.innerWidth * devicePixelRatio;
    h = canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";

    const count = Math.min(280, Math.floor((window.innerWidth * window.innerHeight) / 8500));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: (Math.random() * 1.3 + 0.3) * devicePixelRatio,
      a: Math.random() * 0.7 + 0.15,
      s: (Math.random() * 0.35 + 0.05) * devicePixelRatio,
      tw: Math.random() * 0.03 + 0.01
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    const grd = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w,h)/1.8);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(1, "rgba(0,0,0,0.65)");
    ctx.fillStyle = grd;
    ctx.fillRect(0,0,w,h);

    for (const st of stars) {
      st.y += st.s;
      if (st.y > h + 10) { st.y = -10; st.x = Math.random() * w; }

      st.a += (Math.random() - 0.5) * st.tw;
      st.a = Math.max(0.12, Math.min(0.85, st.a));

      ctx.beginPath();
      ctx.fillStyle = `rgba(255,255,255,${st.a})`;
      ctx.arc(st.x, st.y, st.r, 0, Math.PI*2);
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  resize();
  draw();
})();

const DISCORD_INVITE = "https://discord.gg/GESqaKKFty";

// Support buttons (support.html)
(function bindSupport(){
  const openDiscordBtn = document.getElementById("openDiscordBtn");
  if (openDiscordBtn) openDiscordBtn.addEventListener("click", () => window.open(DISCORD_INVITE, "_blank"));

  const copySupportBtn = document.getElementById("copySupportBtn");
  if (copySupportBtn) {
    copySupportBtn.addEventListener("click", async () => {
      try{
        await navigator.clipboard.writeText(DISCORD_INVITE);
        copySupportBtn.textContent = "Скопировано ✓";
        setTimeout(()=> (copySupportBtn.textContent = "Скопировать invite"), 1200);
      }catch{
        alert("Не удалось скопировать. Вот ссылка:\n" + DISCORD_INVITE);
      }
    });
  }

  const faqBtn = document.getElementById("faqBtn");
  if (faqBtn) faqBtn.addEventListener("click", () => alert("FAQ добавим позже."));

  const logsBtn = document.getElementById("logsBtn");
  if (logsBtn) logsBtn.addEventListener("click", () => alert("Экспорт логов подключим позже."));

  const statusBtn = document.getElementById("statusBtn");
  if (statusBtn) statusBtn.addEventListener("click", () => alert("Статус: Online (демо)."));
})();

// Pricing checkout (subscription.html) — Stripe links
(function pricingStripe(){
  // Only run on subscription page
  const subBtn1 = document.getElementById("subBtn1");
  const subBtn2 = document.getElementById("subBtn2");
  const segs = document.querySelectorAll(".pricing-switch .seg");

  if (!subBtn1 && !subBtn2) return;


  function getActivePlan(){
    const active = document.querySelector(".pricing-switch .seg.active");
    return active?.dataset?.plan || "1w";
  }

  function openLink(url){
    if (!url) return alert("Ссылка оплаты не найдена. Напиши в поддержку.");
    // in-app / browser safe open
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // Subscribe button uses active plan (left card)
  if (subBtn1){
    subBtn1.addEventListener("click", () => {
      const key = getActivePlan();
      openLink(STRIPE_LINKS[key]);
    });
  }

  // Lifetime button always uses lifetime
  if (subBtn2){
    subBtn2.addEventListener("click", () => openLink(STRIPE_LINKS["lifetime"]));
  }

  // Optional: make clicking lifetime card highlight nothing; keep existing UI logic elsewhere
  segs.forEach((btn) => {
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") btn.click();
    });
  });
})();



// ====== SUPPORT PAGE INTERACTIONS ======
(function initSupportHub(){
  const runBtn = document.getElementById("runDiagBtn");
  const copyBtn = document.getElementById("copyDiagBtn");
  const diagBox = document.getElementById("diagBox");
  const modal = document.getElementById("ncSupportModal");
  const modalBody = document.getElementById("ncModalBody");
  const modalTitle = document.getElementById("ncModalTitle");
  const modalFoot = document.getElementById("ncModalFoot");

  // not on support page
  if(!runBtn || !diagBox || !modal || !modalBody || !modalTitle || !modalFoot) return;

  const DISCORD_INVITE = "https://discord.gg/GESqaKKFty";

  function setModal(title, bodyHtml, actions=[]){
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modalFoot.innerHTML = "";
    actions.forEach(a=>{
      const b = document.createElement("button");
      b.className = a.ghost ? "btn ghost" : "btn";
      b.type = "button";
      b.textContent = a.label;
      b.onclick = a.onClick;
      modalFoot.appendChild(b);
    });
    if(actions.length === 0){
      const b = document.createElement("button");
      b.className = "btn";
      b.type = "button";
      b.textContent = "Ок";
      b.onclick = ncCloseModal;
      modalFoot.appendChild(b);
    }
  }

  window.ncCloseModal = function ncCloseModal(){
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden","true");
  };

  function openModal(){
    modal.classList.add("show");
    modal.setAttribute("aria-hidden","false");
  }

  modal.addEventListener("click", (e)=>{
    if(e.target === modal) window.ncCloseModal();
  });
  document.addEventListener("keydown",(e)=>{
    if(e.key === "Escape" && modal.classList.contains("show")) window.ncCloseModal();
  });

  const fixes = {
    login: {
      title: "Не заходит в аккаунт",
      steps: [
        "Убедись, что Discord открыт и ты залогинен (в браузере или приложении).",
        "Нажми «Открыть Discord» и попробуй ещё раз через 10–15 секунд.",
        "Если всё равно ошибка — запусти «Диагностику» и отправь отчёт в #support."
      ]
    },
    update: {
      title: "Не обновляется статус",
      steps: [
        "Проверь интернет (Wi‑Fi/мобильные данные).",
        "Подожди 20–40 секунд — иногда Discord отвечает с задержкой.",
        "Если не помогло — запусти «Диагностику» и отправь отчёт."
      ]
    },
    sub: {
      title: "Проблема с подпиской",
      steps: [
        "Если оплатил только что — обработка может занять до 10 минут.",
        "Обнови страницу и зайди снова в приложение.",
        "Если прошло больше 10 минут — напиши в #support и приложи отчёт диагностики."
      ]
    },
    perf: {
      title: "Лагает / вылетает",
      steps: [
        "Перезапусти приложение/страницу.",
        "Закрой лишние вкладки/программы и попробуй снова.",
        "Запусти «Диагностику», скопируй отчёт и отправь в #support."
      ]
    }
  };

  function stepsHtml(arr){
    return `<ol class="steps">${arr.map(s=>`<li>${s}</li>`).join("")}</ol>`;
  }

  // Quick fixes buttons (existing)
  document.querySelectorAll(".qfix[data-fix]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const key = btn.getAttribute("data-fix");
      const item = fixes[key] || { title: "Подсказка", steps: ["Опиши проблему в Discord и приложи скрин/отчёт диагностики."] };
      setModal(item.title, stepsHtml(item.steps) + `<div class="hint">Совет: в Discord прикрепи скрин + отчёт диагностики — так мы ответим быстрее.</div>`, [
        { label: "Открыть Discord", ghost: true, onClick: ()=> window.open(DISCORD_INVITE, "_blank") },
        { label: "Запустить диагностику", onClick: ()=> { window.ncCloseModal(); runBtn.click(); } },
        { label: "Ок", ghost: true, onClick: window.ncCloseModal }
      ]);
      openModal();
    });
  });

  // Open all FAQ button (existing)
  const openFaqBtn = document.getElementById("openFaqBtn");
  if(openFaqBtn){
    openFaqBtn.addEventListener("click", ()=>{
      const all = ["login","update","sub","perf"].map(k=>`<b>${fixes[k].title}</b>${stepsHtml(fixes[k].steps)}`).join("<hr style='border:none;border-top:1px solid rgba(255,255,255,.08);margin:12px 0;'>");
      setModal("Быстрые решения", all, [
        { label: "Открыть Discord", ghost: true, onClick: ()=> window.open(DISCORD_INVITE, "_blank") },
        { label: "Ок", onClick: window.ncCloseModal }
      ]);
      openModal();
    });
  }

  // Updates: idea button -> discord
  const feedbackBtn = document.getElementById("feedbackBtn");
  if(feedbackBtn){
    feedbackBtn.addEventListener("click", ()=> window.open(DISCORD_INVITE, "_blank"));
  }

  // Logs export: download txt with diag + env
  const logsBtn = document.getElementById("logsBtn");
  if(logsBtn){
    logsBtn.addEventListener("click", ()=>{
      const txt = [
        "Night Core — Support Logs",
        "Time: " + new Date().toISOString(),
        "URL: " + location.href,
        "UserAgent: " + navigator.userAgent,
        "",
        (window.__NC_DIAG_REPORT || "Диагностика: (сначала нажми «Запустить»)")
      ].join("\n");
      const blob = new Blob([txt], {type:"text/plain;charset=utf-8"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "nightcore-support-log.txt";
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
    });
  }

  // Diagnostics runner (existing dots + buttons)
  const dots = {
    net: diagBox.querySelector('[data-diag="net"]'),
    discord: diagBox.querySelector('[data-diag="discord"]'),
    cache: diagBox.querySelector('[data-diag="cache"]'),
    page: diagBox.querySelector('[data-diag="page"]'),
  };

  function mark(dot, cls){
    if(!dot) return;
    dot.classList.remove("idle","pending","ok","bad","warn");
    dot.classList.add(cls);
  }

  async function withTimeout(promise, ms){
    let t;
    const timeout = new Promise((_,rej)=> t=setTimeout(()=>rej(new Error("timeout")), ms));
    return Promise.race([promise, timeout]).finally(()=>clearTimeout(t));
  }

  async function runDiagnostics(){
    // set pending
    Object.values(dots).forEach(d=>mark(d,"pending"));

    // 1) internet
    const netOk = navigator.onLine;
    mark(dots.net, netOk ? "ok" : "bad");

    // 2) discord reachability (best-effort)
    let discordOk = false;
    try{
      await withTimeout(fetch("https://discord.com/api/v10/gateway", {method:"GET", mode:"cors"}), 3500);
      discordOk = true;
    }catch(e){
      // could be blocked by network/CORS; treat as warn if internet ok
      discordOk = false;
    }
    mark(dots.discord, discordOk ? "ok" : (netOk ? "warn" : "bad"));

    // 3) cache/storage
    let cacheOk = true;
    try{
      localStorage.setItem("__nc_test","1");
      localStorage.removeItem("__nc_test");
    }catch(e){ cacheOk = false; }
    mark(dots.cache, cacheOk ? "ok" : "warn");

    // 4) page/build
    mark(dots.page, "ok");

    const report = [
      "🧪 Диагностика Night Core",
      "",
      `Интернет: ${netOk ? "OK" : "OFF"}`,
      `Discord: ${discordOk ? "OK" : (netOk ? "Не удалось проверить" : "OFF")}`,
      `Хранилище: ${cacheOk ? "OK" : "Ограничено"}`,
      `Страница: ${location.pathname}`,
      `Время: ${new Date().toLocaleString()}`,
      "",
      "Если нужна помощь — вставь этот отчёт в #support и прикрепи скрин."
    ].join("\n");

    window.__NC_DIAG_REPORT = report;
    return report;
  }

  runBtn.addEventListener("click", async ()=>{
    const report = await runDiagnostics();
    setModal("Отчёт диагностики", `<pre style="white-space:pre-wrap;margin:0;padding:12px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);font-size:12px;">${report.replace(/</g,"&lt;")}</pre>`, [
      { label: "Копировать", onClick: ()=> copyToClipboard(report) },
      { label: "Открыть Discord", ghost: true, onClick: ()=> window.open(DISCORD_INVITE, "_blank") },
      { label: "Ок", ghost: true, onClick: window.ncCloseModal }
    ]);
    openModal();
  });

  function copyToClipboard(text){
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(()=>{
        setModal("Готово", "Отчёт скопирован. Вставь его в Discord (#support).", [
          { label: "Открыть Discord", onClick: ()=> window.open(DISCORD_INVITE, "_blank") },
          { label: "Ок", ghost: true, onClick: window.ncCloseModal }
        ]);
        openModal();
      });
    }else{
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position="fixed";
      ta.style.left="-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  if(copyBtn){
    copyBtn.addEventListener("click", ()=>{
      const r = window.__NC_DIAG_REPORT;
      if(!r){
        setModal("Сначала запусти диагностику", "Нажми «Запустить», затем «Копировать отчёт».", [
          { label: "Запустить", onClick: ()=> { window.ncCloseModal(); runBtn.click(); } },
          { label: "Ок", ghost: true, onClick: window.ncCloseModal }
        ]);
        openModal();
        return;
      }
      copyToClipboard(r);
    });
  }
})();
