/* FIZZAROLLIO · аккаунт, вход и карточка. Подключается ПОСЛЕ основного скрипта сайта. */
(function () {
  "use strict";
  var CFG = window.FZ_CONFIG || {};
  var configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
  var sb = null, session = null, card = null, view = "login", busy = false;

  var $q = function (s) { return document.querySelector(s); };
  var say = function (t, ms) { try { toast(t, ms || 2600); } catch (e) {} };

  /* ---------- стили ---------- */
  var css = document.createElement("style");
  css.textContent =
    "#acb{margin-left:auto;display:none;border:1px solid var(--pk);padding:3px 7px;background:rgba(8,7,10,.7);color:#fff;min-height:26px}" +
    "body.navon #acb{display:block}body.navon #cb{margin-left:6px}" +
    "#acc{position:fixed;inset:0;z-index:74;display:none;overflow:auto;padding:calc(var(--st) + 14px) 12px calc(var(--sb) + 14px);background:#08070Af2}" +
    "#acc.on{display:block;animation:in .35s}#acc .pn{max-width:480px}" +
    "#acc h3{font-size:clamp(24px,7vw,36px);margin-bottom:10px}" +
    "#acc form{max-width:none;margin:8px 0}#acc .lnk{display:block;margin:6px 0;font-size:12px;color:var(--sv);text-decoration:underline;min-height:34px;text-align:left}" +
    "#acc .err{color:#ff5577;font-size:12px;min-height:16px}#acc .ok{color:var(--pk);font-size:12px}" +
    "#acc .x{float:right;font-size:12px;padding:8px 12px;border:1px solid var(--sv);min-height:40px}" +
    ".fzcard{--rc:#D5D3DB;position:relative;margin:12px 0;padding:16px;border:2px solid var(--rc);background:linear-gradient(160deg,#1a0f1f,#000 75%);box-shadow:0 0 28px var(--rc);text-align:center}" +
    ".fzcard .sm{font-size:56px;line-height:1.1;color:var(--rc);text-shadow:0 0 18px var(--rc);margin:6px 0}" +
    ".fzcard .rr{font-size:12px;color:var(--rc);letter-spacing:.2em}.fzcard .nm{font-size:22px;margin:6px 0;text-transform:uppercase}" +
    ".fzcard .ds{font-size:12px;color:var(--sv);line-height:1.6}.fzcard .mt{font-size:11px;color:var(--gr);margin-top:10px;word-break:break-all}" +
    ".fzcard.COMMON{--rc:#D5D3DB}.fzcard.UNCOMMON{--rc:#5DFFA6}.fzcard.RARE{--rc:#4DA3FF}.fzcard.EPIC{--rc:#A600FF}.fzcard.LEGENDARY{--rc:#FFB020}" +
    ".fzcard.ANOMALY{--rc:#FF2D55;animation:fzan 1.6s infinite}" +
    "@keyframes fzan{0%,92%,100%{transform:none}94%{transform:translateX(-4px) skewX(4deg)}96%{transform:translateX(4px)}98%{transform:translateX(-2px)}}" +
    "@media(prefers-reduced-motion:reduce){.fzcard.ANOMALY{animation:none}}";
  document.head.appendChild(css);

  /* ---------- каркас ---------- */
  var btn = document.createElement("button");
  btn.id = "acb"; btn.className = "m"; btn.textContent = "ВХОД";
  var bar = $q("#bar"), hud = $q("#hud");
  bar.insertBefore(btn, $q("#cb") || hud);

  var box = document.createElement("div");
  box.id = "acc";
  box.innerHTML = "<div class='pn' role='dialog' aria-modal='true' aria-label='аккаунт'><button class='x m' id='accx'>ЗАКРЫТЬ</button><div id='accb' class='m'></div></div>";
  document.body.appendChild(box);
  var body = $q("#accb");

  function open() { box.classList.add("on"); render(); }
  function close() { box.classList.remove("on"); }
  btn.onclick = open;
  $q("#accx").onclick = close;
  addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

  /* ---------- вспомогательное ---------- */
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function field(type, id, ph, ac) {
    var i = document.createElement("input");
    i.type = type; i.id = id; i.placeholder = ph; i.required = true;
    if (ac) i.autocomplete = ac;
    if (type === "password") i.minLength = 8;
    return i;
  }
  function msg(text, ok) { var m = $q("#accm"); if (m) { m.className = ok ? "ok" : "err"; m.textContent = text || ""; } }
  function human(err) {
    var t = ((err && err.message) || "").toLowerCase();
    if (t.indexOf("invalid login") > -1) return "НЕВЕРНАЯ ПОЧТА ИЛИ ПАРОЛЬ.";
    if (t.indexOf("not confirmed") > -1) return "ПОЧТА ЕЩЁ НЕ ПОДТВЕРЖДЕНА. ПРОВЕРЬ ПИСЬМО.";
    if (t.indexOf("already") > -1) return "ТАКАЯ ПОЧТА УЖЕ ЗАРЕГИСТРИРОВАНА.";
    if (t.indexOf("password") > -1) return "ПАРОЛЬ СЛИШКОМ ПРОСТОЙ ИЛИ КОРОТКИЙ (МИНИМУМ 8 СИМВОЛОВ).";
    if (t.indexOf("rate") > -1 || t.indexOf("seconds") > -1) return "СЛИШКОМ МНОГО ПОПЫТОК. ПОДОЖДИ МИНУТУ.";
    if (t.indexOf("fetch") > -1 || t.indexOf("network") > -1) return "НЕТ СВЯЗИ С СЕРВЕРОМ.";
    return "ОШИБКА. ПОПРОБУЙ ЕЩЁ РАЗ.";
  }
  function redirectUrl() { return location.origin + location.pathname; }
  function lock(b, on) { busy = on; if (b) b.disabled = on; }

  /* ---------- экраны ---------- */
  function render() {
    body.innerHTML = "";
    if (!configured) {
      body.appendChild(el("h3", "", "БАЗА НЕ ПОДКЛЮЧЕНА"));
      body.appendChild(el("p", "", "ВЛАДЕЛЕЦ САЙТА ЕЩЁ НЕ ВСТАВИЛ НАСТРОЙКИ SUPABASE В config.js."));
      return;
    }
    if (session && view !== "recover") return renderAccount();
    if (view === "register") return renderRegister();
    if (view === "forgot") return renderForgot();
    if (view === "recover") return renderRecover();
    if (view === "sent") return renderSent();
    renderLogin();
  }
  function link(text, v) { var b = el("button", "lnk m", text); b.type = "button"; b.onclick = function () { view = v; render(); }; return b; }

  function renderLogin() {
    body.appendChild(el("h3", "", "ВХОД"));
    var f = document.createElement("form");
    var em = field("email", "lem", "ПОЧТА", "email"), pw = field("password", "lpw", "ПАРОЛЬ", "current-password");
    var sub = el("button", "btn", "ВОЙТИ"); sub.type = "submit";
    f.append(em, pw, sub, el("div", "err", ""));
    f.lastChild.id = "accm";
    f.onsubmit = async function (e) {
      e.preventDefault(); if (busy) return; lock(sub, true); msg("");
      var r = await sb.auth.signInWithPassword({ email: em.value.trim(), password: pw.value });
      lock(sub, false);
      if (r.error) return msg(human(r.error));
      say("ДОСТУП РАЗРЕШЁН.");
    };
    body.append(f, link("НЕТ АККАУНТА? РЕГИСТРАЦИЯ", "register"), link("ЗАБЫЛ ПАРОЛЬ?", "forgot"));
  }

  function renderRegister() {
    body.appendChild(el("h3", "", "РЕГИСТРАЦИЯ"));
    var f = document.createElement("form");
    var nk = field("text", "rnk", "НИКНЕЙМ (2–24 СИМВОЛА)", "nickname"); nk.minLength = 2; nk.maxLength = 24;
    var em = field("email", "rem", "ПОЧТА", "email"), pw = field("password", "rpw", "ПАРОЛЬ (МИНИМУМ 8 СИМВОЛОВ)", "new-password");
    var sub = el("button", "btn", "СОЗДАТЬ"); sub.type = "submit";
    var er = el("div", "err", ""); er.id = "accm";
    f.append(nk, em, pw, sub, er);
    f.onsubmit = async function (e) {
      e.preventDefault(); if (busy) return; msg("");
      var nick = nk.value.replace(/[<>&"']/g, "").trim();
      if (nick.length < 2) return msg("НИКНЕЙМ СЛИШКОМ КОРОТКИЙ.");
      lock(sub, true);
      var r = await sb.auth.signUp({ email: em.value.trim(), password: pw.value,
        options: { emailRedirectTo: redirectUrl(), data: { nickname: nick } } });
      lock(sub, false);
      if (r.error) return msg(human(r.error));
      view = "sent"; render();
    };
    body.append(f, link("УЖЕ ЕСТЬ АККАУНТ? ВХОД", "login"));
  }

  function renderSent() {
    body.appendChild(el("h3", "", "ПРОВЕРЬ ПОЧТУ"));
    body.appendChild(el("p", "ok", "МЫ ОТПРАВИЛИ ПИСЬМО С ССЫЛКОЙ ПОДТВЕРЖДЕНИЯ. ПЕРЕЙДИ ПО НЕЙ, ПОТОМ ВОЙДИ. ЕСЛИ ПИСЬМА НЕТ — ПРОВЕРЬ «СПАМ»."));
    body.appendChild(link("ВЕРНУТЬСЯ КО ВХОДУ", "login"));
  }

  function renderForgot() {
    body.appendChild(el("h3", "", "ВОССТАНОВЛЕНИЕ"));
    var f = document.createElement("form");
    var em = field("email", "fem", "ПОЧТА", "email");
    var sub = el("button", "btn", "ОТПРАВИТЬ"); sub.type = "submit";
    var er = el("div", "err", ""); er.id = "accm";
    f.append(em, sub, er);
    f.onsubmit = async function (e) {
      e.preventDefault(); if (busy) return; lock(sub, true); msg("");
      var r = await sb.auth.resetPasswordForEmail(em.value.trim(), { redirectTo: redirectUrl() });
      lock(sub, false);
      if (r.error) return msg(human(r.error));
      msg("ЕСЛИ ТАКАЯ ПОЧТА ЕСТЬ, МЫ ОТПРАВИЛИ ПИСЬМО СО ССЫЛКОЙ.", true);
    };
    body.append(f, link("НАЗАД", "login"));
  }

  function renderRecover() {
    body.appendChild(el("h3", "", "НОВЫЙ ПАРОЛЬ"));
    var f = document.createElement("form");
    var pw = field("password", "npw", "НОВЫЙ ПАРОЛЬ (МИНИМУМ 8)", "new-password");
    var sub = el("button", "btn", "СОХРАНИТЬ"); sub.type = "submit";
    var er = el("div", "err", ""); er.id = "accm";
    f.append(pw, sub, er);
    f.onsubmit = async function (e) {
      e.preventDefault(); if (busy) return; lock(sub, true); msg("");
      var r = await sb.auth.updateUser({ password: pw.value });
      lock(sub, false);
      if (r.error) return msg(human(r.error));
      view = "login"; say("ПАРОЛЬ ИЗМЕНЁН."); render();
    };
    body.appendChild(f);
  }

  function cardNode(c) {
    var d = el("div", "fzcard " + c.rarity);
    d.append(el("div", "rr m", c.rarity), el("div", "sm", c.symbol), el("div", "nm", c.name), el("div", "ds m", c.description));
    var dt = new Date(c.acquired_at);
    d.appendChild(el("div", "mt m", "№ " + c.serial_number + " · ПОЛУЧЕНА " + dt.toLocaleDateString("ru-RU") + " · ВЛАДЕЛЕЦ " + String(c.owner_id).slice(0, 8)));
    return d;
  }

  async function renderAccount() {
    var u = session.user;
    body.appendChild(el("h3", "", "ЛИЧНЫЙ АККАУНТ"));
    var info = el("p", "", "ПОЧТА: " + u.email); body.appendChild(info);
    var nickP = el("p", "", "НИКНЕЙМ: …"); body.appendChild(nickP);
    var holder = el("div", ""); body.appendChild(holder);
    var er = el("div", "err", ""); er.id = "accm"; body.appendChild(er);

    var out = el("button", "tg m", "ВЫЙТИ"); out.onclick = async function () { await sb.auth.signOut(); card = null; view = "login"; render(); say("СЕАНС ЗАВЕРШЁН."); };
    var pr = await sb.from("profiles").select("nickname").eq("id", u.id).maybeSingle();
    if (pr.data) nickP.textContent = "НИКНЕЙМ: " + pr.data.nickname;

    var cr = await sb.from("cards").select("serial_number,name,description,symbol,rarity,acquired_at,owner_id").maybeSingle();
    if (cr.data) card = cr.data;
    if (card) holder.appendChild(cardNode(card));
    else {
      var get = el("button", "btn", "ПОЛУЧИТЬ КАРТОЧКУ");
      get.onclick = async function () {
        if (busy) return; lock(get, true); msg("");
        var r = await sb.functions.invoke("claim-card", { method: "POST" });
        lock(get, false);
        if (r.error || !r.data || !r.data.card) return msg("НЕ УДАЛОСЬ ПОЛУЧИТЬ КАРТОЧКУ. ПОПРОБУЙ ПОЗЖЕ.");
        card = r.data.card; holder.innerHTML = ""; holder.appendChild(cardNode(card));
        try { flash(); } catch (e) {} say(r.data.is_new ? "КАРТОЧКА ПОЛУЧЕНА." : "ЭТО УЖЕ ТВОЯ КАРТОЧКА.");
      };
      holder.append(el("p", "", "У ТЕБЯ ПОКА НЕТ КАРТОЧКИ. ОНА МОЖЕТ БЫТЬ ТОЛЬКО ОДНА."), get);
    }
    body.appendChild(out);
  }

  /* ---------- запуск ---------- */
  function setBtn() { btn.textContent = session ? "АККАУНТ" : "ВХОД"; }
  if (!configured) { return; }

  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  sb.auth.onAuthStateChange(function (ev, s) {
    session = s; if (!s) card = null;
    setBtn();
    /* не вызываем запросы Supabase прямо внутри обработчика, поэтому setTimeout */
    setTimeout(function () {
      if (ev === "PASSWORD_RECOVERY") { view = "recover"; open(); }
      else if (box.classList.contains("on") && (ev === "SIGNED_IN" || ev === "SIGNED_OUT")) { if (ev === "SIGNED_IN") view = "login"; render(); }
    }, 0);
  });

  /* убираем ?code=... из адреса, чтобы он не мешал сайту */
  (function cleanUrl() {
    var q = new URLSearchParams(location.search);
    if (q.has("code") || q.has("error") || q.has("error_description")) {
      var bad = q.has("error_description");
      setTimeout(function () {
        history.replaceState(null, "", location.pathname + location.hash);
        if (bad) say("ССЫЛКА НЕДЕЙСТВИТЕЛЬНА ИЛИ УСТАРЕЛА. ВОЙДИ ПО ПАРОЛЮ ИЛИ ЗАПРОСИ НОВУЮ.", 4500);
      }, 1500);
    }
  })();

  sb.auth.getSession().then(function (r) { session = r.data.session; setBtn(); });
})();
