let loginState = null, loginTimer = null;

function openLogin(){
  const m = document.getElementById("loginModal");
  if(m) m.classList.add("show");
}

function closeLogin(){
  const m = document.getElementById("loginModal");
  if(m) m.classList.remove("show");
  if(loginTimer){ clearInterval(loginTimer); loginTimer = null; }
  if(loginState){ postJSON("/accounts/login/cancel", {state: loginState}).catch(()=>{}); loginState = null; }
}

// 登录出口代理下拉：没有启用的代理槽时整块隐藏，登录与以前一样直连。
// 默认选「直连」；「自动」(value=auto) 由后端随机挑一个没绑定、没被其他登录占着的槽。
async function loadLoginProxyOptions(){
  const sel = document.getElementById("loginProxySlot");
  const box = document.getElementById("loginProxyBox");
  if(!sel) return;
  const keep = sel.value || "";
  try{
    const r = await getJSON("/proxy/slots");
    const slots = ((r && r.slots) || []).filter(s => s.enabled !== false);
    const opts = ['<option value="">直连（不走代理槽）</option>'];
    if(slots.length) opts.push('<option value="auto">自动（随机挑选未使用的代理槽）</option>');
    for(const s of slots){
      const label = (s.label || s.name || s.id) + (s.ip ? " · " + s.ip : "") + (s.bound ? " · 已绑定 " + s.bound + " 个账号" : "");
      opts.push('<option value="' + esc(s.id) + '">' + esc(label) + '</option>');
    }
    sel.innerHTML = opts.join("");
    if(keep === "auto" && slots.length) sel.value = "auto";
    else if(keep && slots.some(x => x.id === keep)) sel.value = keep;
    if(box) box.style.display = slots.length ? "" : "none";
  }catch(e){
    console.warn("loadLoginProxyOptions failed", e);
  }
}

async function openLoginModal(targetRealm){
  openLogin();
  // 先刷新下拉再发起登录：上次选的槽若已删除/停用，这里会回落到「直连」。
  await loadLoginProxyOptions();
  const realm = targetRealm || window.VIEW_REALM || "intl";
  const isCn = (realm === "cn");
  const rCn = document.getElementById("radioCn");
  const rIntl = document.getElementById("radioIntl");
  if(rCn) rCn.checked = isCn;
  if(rIntl) rIntl.checked = !isCn;
  triggerLoginForSelectedRealm();
}

function switchLoginRealm(realm){
  triggerLoginForSelectedRealm();
}

function restartLogin(){
  triggerLoginForSelectedRealm();
}

async function triggerLoginForSelectedRealm(){
  const checkedRadio = document.querySelector('input[name="loginRealm"]:checked');
  const realm = checkedRadio ? checkedRadio.value : (window.VIEW_REALM || "intl");
  const isCn = (realm === "cn");

  if(loginTimer){ clearInterval(loginTimer); loginTimer = null; }
  if(loginState){ postJSON("/accounts/login/cancel", {state: loginState}).catch(()=>{}); loginState = null; }

  const linkBox = document.getElementById("loginLinkBox");
  const statusBox = document.getElementById("loginStatus");
  if(linkBox) linkBox.innerHTML = "";
  if(statusBox) statusBox.textContent = "";

  const s1 = document.getElementById("step1");
  const s2 = document.getElementById("step2");
  const s3 = document.getElementById("step3");
  if(s1) s1.className = "step active";
  if(s2) s2.className = "step";
  if(s3) s3.className = "step";

  const s1Text = document.getElementById("step1Text");
  if(s1Text) s1Text.textContent = isCn ? "正在向 copilot.tencent.com (国内版) 申请授权..." : "正在向 www.workbuddy.ai (国际版) 申请授权...";

  try{
    const proxySel = document.getElementById("loginProxySlot");
    const proxySlot = proxySel ? proxySel.value : "";
    const r = await postJSON("/accounts/login/start", {platform: "CLI", realm: realm, proxySlot: proxySlot});
    loginState = r.state;
    const ph = document.getElementById("loginProxyHint");
    // r.proxy 只有 host:port（后端已去掉用户名密码）。
    if(ph) ph.textContent = r.proxy ? ("本次登录出口：" + (r.proxySlot ? r.proxySlot + " · " : "") + r.proxy)
      : (proxySlot === "auto" ? "没有空闲的代理槽，本次登录直连" : "本次登录直连");
    if(s1) s1.className = "step done";
    if(s2) s2.className = "step active";
    if(linkBox) linkBox.innerHTML =
      '<a class="login-link" id="loginLink" href="' + esc(r.authUrl) + '" target="_blank" rel="noopener">' + esc(r.authUrl) + '</a>'
      + '<button class="sec mini" onclick="copyLoginLink()">复制登录链接</button>'
      + '<div class="hint">点击上方链接在浏览器里完成登录授权。登录完成后本窗口会自动检测并完成入池。</div>';
    pollLogin();
    loginTimer = setInterval(pollLogin, 2500);
  }catch(e){
    if(statusBox) statusBox.textContent = "发起失败: " + e.message;
    if(s1) s1.className = "step";
  }
}

async function copyLoginLink(){
  const link = document.getElementById("loginLink");
  if(!link) return;
  try{
    await writeClipboard(link.getAttribute("href"));
    toast('已复制到剪贴板', 'ok');
  }catch(e){
    toast('复制失败: ' + e.message, 'bad');
  }
}

async function pollLogin(){
  if(!loginState) return;
  try{
    const r = await getJSON("/accounts/login/poll?state=" + encodeURIComponent(loginState));
    const s3 = document.getElementById("step3");
    const statusBox = document.getElementById("loginStatus");
    if(s3) s3.className = "step active";
    if(statusBox) statusBox.textContent = r.message || r.status;
    if(r.status === "ok"){
      if(s3) s3.className = "step done";
      if(statusBox) statusBox.textContent = "登录成功：" + (r.account && r.account.nickname) + " 已加入账号池";
      if(loginTimer){ clearInterval(loginTimer); loginTimer = null; }
      loginState = null;
      await loadAccounts();
      setTimeout(closeLogin, 1200);
    }else if(r.status === "error" || r.status === "expired" || r.status === "unknown"){
      if(loginTimer){ clearInterval(loginTimer); loginTimer = null; }
    }
  }catch(e){}
}


window.ACTIVE_GATEWAY_REALM = "intl";
window.VIEW_REALM = "intl";
window.REALM_FILTER = "all";
window.MODELS_DATA = [];
window.ACCOUNTS = [];

function updateUI(){
  const isIntlView = (window.VIEW_REALM === "intl");
  const isCnView = (window.VIEW_REALM === "cn");
  const isCodeartsView = (window.VIEW_REALM === "codearts");
  const caEnabled = (window.REALM_OPTIONS || []).includes("codearts");
  const tIntl = document.getElementById("tabIntl");
  const tCn = document.getElementById("tabCn");
  const tCa = document.getElementById("tabCodearts");
  if(tIntl) tIntl.className = "realm-card" + (isIntlView ? " active" : "");
  if(tCn) tCn.className = "realm-card" + (isCnView ? " active" : "");
  if(tCa){
    tCa.style.display = caEnabled ? "" : "none";
    tCa.className = "realm-card" + (isCodeartsView ? " active" : "");
  }
  const vbIntl = document.getElementById("tabIntlViewBadge");
  if(vbIntl) vbIntl.style.display = isIntlView ? "inline-block" : "none";
  const vbCn = document.getElementById("tabCnViewBadge");
  if(vbCn) vbCn.style.display = isCnView ? "inline-block" : "none";
  const vbCa = document.getElementById("tabCodeartsViewBadge");
  if(vbCa) vbCa.style.display = isCodeartsView ? "inline-block" : "none";

  // 账号页页头的版本切换与上面两张卡片同一份状态（VIEW_REALM），所以两边永远
  // 一起亮：在账号页切过去，回网关页看到的就是刚切的那一版，反之亦然。
  const rsIntl = document.getElementById("accountsRealmIntl");
  if(rsIntl){
    rsIntl.classList.toggle("active", isIntlView);
    rsIntl.setAttribute("aria-pressed", isIntlView ? "true" : "false");
  }
  const rsCn = document.getElementById("accountsRealmCn");
  if(rsCn){
    rsCn.classList.toggle("active", isCnView);
    rsCn.setAttribute("aria-pressed", isCnView ? "true" : "false");
  }
  const rsCa = document.getElementById("accountsRealmCodearts");
  if(rsCa){
    rsCa.style.display = caEnabled ? "" : "none";
    rsCa.classList.toggle("active", isCodeartsView);
    rsCa.setAttribute("aria-pressed", isCodeartsView ? "true" : "false");
  }

  // 区块标题上的出口标签：这几个区块的内容都按当前视图区域取（账号、禁用汇总、
  // 最近请求、模型清单），标出来免得把国际版的数字看成全局的。用 <em> 承载：
  // 侧栏导航由 h2 生成时会剥掉 <em>，所以标签不会串进导航项。
  const sectionRealm = isIntlView ? "（国际版）" : (isCnView ? "（国内版）" : "（CodeArts）");
  ["disabledRealmTag", "recentRealmTag", "modelsRealmTag"].forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.textContent = sectionRealm;
  });

  // 工具栏上「一键切换所有出站身份」的当前值：它作用于全部账号（含另一个
  // 版本），所以不看视图、只看 window.ACCOUNTS。
  updateProductAllButton();

  const gwRealm = window.ACTIVE_GATEWAY_REALM || "intl";
  const isIntlGw = (gwRealm === "intl");
  const isCnGw = (gwRealm === "cn");
  const isCaGw = (gwRealm === "codearts");
  const dbIntl = document.getElementById("tabIntlDefaultBadge");
  if(dbIntl) dbIntl.style.display = isIntlGw ? "inline-block" : "none";
  const dbCn = document.getElementById("tabCnDefaultBadge");
  if(dbCn) dbCn.style.display = isCnGw ? "inline-block" : "none";
  const dbCa = document.getElementById("tabCodeartsDefaultBadge");
  if(dbCa) dbCa.style.display = isCaGw ? "inline-block" : "none";

  const gwName = document.getElementById("activeGatewayName");
  if(gwName) {
    gwName.textContent = isIntlGw ? "国际版 (Global)"
      : (isCnGw ? "国内版 (China)" : "CodeArts (华为云)");
    gwName.style.color = isIntlGw ? "var(--accent)"
      : (isCnGw ? "var(--bad)" : "#5b3fa0");
  }
  const ep = document.getElementById("activeEndpoint");
  if(ep) ep.textContent = isIntlGw ? "https://www.workbuddy.ai/v2"
    : (isCnGw ? "https://copilot.tencent.com/v2"
              : ((window.CODEARTS_OVERVIEW || {}).base_url || "华为云 CodeArts"));

  const gwOptions = (window.REALM_OPTIONS && window.REALM_OPTIONS.length)
    ? window.REALM_OPTIONS : ["intl", "cn"];
  let gwIdx = gwOptions.indexOf(gwRealm);
  if(gwIdx < 0) gwIdx = 0;
  const nextGw = gwOptions[(gwIdx + 1) % gwOptions.length];
  const nextGwName = (nextGw === "intl") ? "国际版" : (nextGw === "cn" ? "国内版" : "CodeArts");
  const btnToggle = document.getElementById("btnToggleRealm");
  if(btnToggle) {
    btnToggle.textContent = "切换默认出口为【" + nextGwName + "】";
    btnToggle.style.borderColor = isIntlGw ? "var(--accent)" : (isCnGw ? "var(--bad)" : "#5b3fa0");
    btnToggle.style.color = isIntlGw ? "var(--accent)" : (isCnGw ? "var(--bad)" : "#5b3fa0");
  }
  const cardGw = document.getElementById("cardGatewayCtrl");
  if(cardGw){
    cardGw.style.borderColor = isIntlGw ? "rgba(37,99,235,.28)"
      : (isCnGw ? "rgba(220,38,38,.28)" : "rgba(124,92,214,.30)");
    cardGw.style.background = isIntlGw ? "rgba(37,99,235,.03)"
      : (isCnGw ? "rgba(220,38,38,.03)" : "rgba(124,92,214,.04)");
  }

  const btnCheckin = document.getElementById("btnCheckin");
  if(btnCheckin) btnCheckin.style.display = (window.VIEW_REALM === "cn" ? "inline-block" : "none");
  const btnDailyChat = document.getElementById("btnDailyChat");
  if(btnDailyChat) btnDailyChat.style.display = (window.VIEW_REALM === "intl" ? "inline-block" : "none");
  // btnDailyChatWeb 不上屏（见按钮上的注释），所以这里不再按视图显隐它。

  // 计算当前绑定与生效的 Key 数量
  const keys = (typeof API_KEY_ROWS !== 'undefined' && API_KEY_ROWS.length) ? API_KEY_ROWS : (window.API_KEY_ROWS || []);
  const intlKeys = keys.filter(k => k.enabled !== false && k.realm === 'intl').length;
  const cnKeys = keys.filter(k => k.enabled !== false && k.realm === 'cn').length;
  const caKeys = keys.filter(k => k.enabled !== false && k.realm === 'codearts').length;
  const followKeys = keys.filter(k => k.enabled !== false && !k.realm).length;
  const activeKeysTotal = isIntlGw ? (intlKeys + followKeys)
    : (isCnGw ? (cnKeys + followKeys) : (caKeys + followKeys));

  const elGwKeyBadge = document.getElementById("activeGatewayKeyCount");
  if(elGwKeyBadge) elGwKeyBadge.textContent = activeKeysTotal + ' 个 Key 生效';

  const elIntlKey = document.getElementById("tabIntlKeyBadge");
  if(elIntlKey) elIntlKey.textContent = intlKeys + ' 个 Key';

  const elCnKey = document.getElementById("tabCnKeyBadge");
  if(elCnKey) elCnKey.textContent = cnKeys + ' 个 Key';
  const elCaKey = document.getElementById("tabCodeartsKeyBadge");
  if(elCaKey) elCaKey.textContent = caKeys + ' 个 Key';

  // 左侧卡片账号数与积分统计：大数字是「总剩余」（含停用账号），副行的
  // 「可用」只算 isAcctActive（启用且未触发保留/限额护栏）的账号——与旁边
  // 的 N/M 账号计数同一个口径，两个数字才有可比性。
  const allAccts = window.ACCOUNTS || [];
  const intlAccts = allAccts.filter(a => a.realm === 'intl' || !a.realm);
  const cnAccts = allAccts.filter(a => a.realm === 'cn');

  const isAcctActive = a => a.enabled && !a.reserveBlocked && !a.dailyLimitBlocked && !a.creditLimitReached;

  let intlCred = 0, hasIntlCred = false, intlAvailCred = 0, hasIntlAvail = false;
  intlAccts.forEach(a => {
    if(a.credits && a.credits.remain != null){
      intlCred += a.credits.remain; hasIntlCred = true;
      if(isAcctActive(a)){ intlAvailCred += a.credits.remain; hasIntlAvail = true; }
    }
  });
  let cnCred = 0, hasCnCred = false, cnAvailCred = 0, hasCnAvail = false;
  cnAccts.forEach(a => {
    if(a.credits && a.credits.remain != null){
      cnCred += a.credits.remain; hasCnCred = true;
      if(isAcctActive(a)){ cnAvailCred += a.credits.remain; hasCnAvail = true; }
    }
  });

  const intlActive = intlAccts.filter(isAcctActive).length;
  const cnActive = cnAccts.filter(isAcctActive).length;

  // 区域卡片：大字 = 可用积分（只算 isAcctActive——启用且未触发保留/限额
  // 护栏的账号，与旁边的 N/M 账号计数同一口径）；小字 = 总积分（全部账号
  // 含停用）。数字各挂各的节点，样式（大字/小字）由 HTML 决定。
  const elIntlCred = document.getElementById("tabIntlCredits");
  if(elIntlCred) elIntlCred.textContent = hasIntlCred ? fmt(intlCred) : "—";
  const elIntlAvail = document.getElementById("tabIntlAvailCred");
  if(elIntlAvail) elIntlAvail.innerHTML = '<span class="credit-kind">可用</span> ' + (hasIntlAvail ? fmt(intlAvailCred) : "—");
  const elIntlAcct = document.getElementById("tabIntlAccts");
  if(elIntlAcct) elIntlAcct.innerHTML = '<b style="color:var(--accent)">' + intlActive + '</b>/' + intlAccts.length + ' 账号';

  const elCnCred = document.getElementById("tabCnCredits");
  if(elCnCred) elCnCred.textContent = hasCnCred ? fmt(cnCred) : "—";
  const elCnAvail = document.getElementById("tabCnAvailCred");
  if(elCnAvail) elCnAvail.innerHTML = '<span class="credit-kind">可用</span> ' + (hasCnAvail ? fmt(cnAvailCred) : "—");
  const elCnAcct = document.getElementById("tabCnAccts");
  if(elCnAcct) elCnAcct.innerHTML = '<b style="color:var(--accent)">' + cnActive + '</b>/' + cnAccts.length + ' 账号';

  // CodeArts 卡片：健康/总数、模型数、离线标记。没有积分——codearts2api 的
  // stats.credits 实际是健康账号数，不是余额。
  const ca = window.CODEARTS_OVERVIEW || {};
  const caStats = ca.stats || {};
  const caHealthy = (caStats.healthy != null) ? caStats.healthy : "—";
  const caTotal = (caStats.total != null) ? caStats.total : 0;
  const caModels = (ca.models || []).length;
  const elCaHealthy = document.getElementById("tabCodeartsHealthy");
  if(elCaHealthy) elCaHealthy.textContent = caHealthy;
  const elCaTotal = document.getElementById("tabCodeartsTotal");
  if(elCaTotal) elCaTotal.textContent = caTotal;
  const elCaModels = document.getElementById("tabCodeartsModels");
  if(elCaModels) elCaModels.textContent = caModels;
  const elCaCredits = document.getElementById("tabCodeartsCredits");
  if(elCaCredits) elCaCredits.textContent = fmtCredits(caStats.credits);
  const elCaOffline = document.getElementById("tabCodeartsOffline");
  if(elCaOffline) elCaOffline.style.display = (ca.online === false) ? "inline-block" : "none";
  const elCaHost = document.getElementById("tabCodeartsHost");
  if(elCaHost && ca.base_url){
    try { elCaHost.textContent = new URL(ca.base_url).host; }
    catch(e) { elCaHost.textContent = ca.base_url; }
  }

  // CodeArts 视图隐藏 WorkBuddy 专属区块，避免把两套账号/积分读混。
  ["workbuddyAccountsSection", "workbuddyDisabledSection",
   "workbuddyActivitySection"].forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.style.display = isCodeartsView ? "none" : "";
  });
  const caSection = document.getElementById("codeartsAccountsSection");
  if(caSection) caSection.style.display = isCodeartsView ? "" : "none";
  const caSummary = document.getElementById("codeartsSummary");
  if(caSummary) caSummary.style.display = isCodeartsView ? "" : "none";
  const wbCards = document.getElementById("cards");
  if(wbCards) wbCards.style.display = isCodeartsView ? "none" : "";
  const wbSched = document.getElementById("schedulerBar");
  if(wbSched) wbSched.style.display = isCodeartsView ? "none" : "";
};

// 切换视图的唯一入口：改完 VIEW_REALM 立刻用**已经加载好的**全量 window.ACCOUNTS
// 重画一次「当前禁用账号与模型」，不等后面的异步账号重载 —— 否则在重载返回之前那
// 段间隙里，DOM 里还留着上一个 realm 的停用行，重载失败时它们会一直留着（issue
// #31 要求切换立即生效、不留旧行）。启动时的赋值不走这里：那时还没有任何行被画
// 出来，第一次 loadAccounts() 会画。
function setViewRealm(r){
  window.VIEW_REALM = r;
  renderDisabled();
}

async function switchViewRealm(r){
  if(window.VIEW_REALM === r) return;
  setViewRealm(r);
  RECENT_PAGE = 1;
  window.updateUI();
  if(r === "codearts"){
    // CodeArts 没有 WorkBuddy 的账号池/成长任务/调度器，别拿空数据去刷那些接口。
    await Promise.all([loadCodeartsOverview(true), loadModels(),
                       loadAnalytics(), refresh()]);
    return;
  }
  // 并行发起，不要逐个 await：国内版的成长任务一次要约 2 秒（上游两个接口），
  // 串行排队时后面那些毫秒级的用量接口全被它堵着，切过去看着就是"过几秒才刷新"。
  await Promise.all([loadAccounts(), loadModels(), loadGrowthTasks(),
                     loadSchedulerStatus(), loadAnalytics(), refresh()]);
};

function realmLabel(r){
  return r === "intl" ? "国际版" : (r === "cn" ? "国内版" : "CodeArts");
}

async function toggleActiveGatewayRealm(){
  const options = window.REALM_OPTIONS || ["intl", "cn"];
  const cur = window.ACTIVE_GATEWAY_REALM || "intl";
  let idx = options.indexOf(cur);
  if(idx < 0) idx = 0;
  const next = options[(idx + 1) % options.length];
  try {
    const res = await postJSON("/realm", {realm: next});
    window.ACTIVE_GATEWAY_REALM = res.current || next;
    toast("网关默认上游已切换并永久保存为: " + realmLabel(window.ACTIVE_GATEWAY_REALM));
    setViewRealm(window.ACTIVE_GATEWAY_REALM);
    window.updateUI();
    if(window.ACTIVE_GATEWAY_REALM === "codearts"){
      await Promise.all([loadCodeartsOverview(true), loadModels(),
                         loadAnalytics(), refresh()]);
    }else{
      await Promise.all([loadAccounts(), loadModels(), loadGrowthTasks(),
                         loadSchedulerStatus(), loadAnalytics(), refresh()]);
    }
  }catch(e){
    alert("切换失败: " + e.message);
  }
};

/* ---- CodeArts 第三出口 ---- */
window.CODEARTS_OVERVIEW = null;
window.REALM_OPTIONS = ["intl", "cn"];

async function loadCodeartsOverview(force){
  const box = document.getElementById("codeartsAccounts");
  try{
    const r = await getJSON("/codearts/overview");
    window.CODEARTS_OVERVIEW = r;
    await loadProxySlots();
    renderCodeartsCards(r);
    renderCodeartsAccounts(r);
    window.updateUI();
  }catch(e){
    if(box){
      box.innerHTML = '<div style="padding:24px;text-align:center;color:var(--bad)">'
        + escapeHtml(e.message || "读取 CodeArts 失败")
        + '<div style="margin-top:8px;color:var(--dim);font-size:12px">检查「设置 → CodeArts 接入」的 Base URL 和 API Key。</div></div>';
    }
    window.updateUI();
  }
}

function fmtCredits(value){
  if(value == null || value === "" || isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, {maximumFractionDigits: 2});
}

function renderCodeartsCards(r){
  const box = document.getElementById("codeartsCards");
  if(!box) return;
  const st = r.stats || {};
  const healthy = (st.healthy != null) ? st.healthy : "—";
  const total = (st.total != null) ? st.total : 0;
  const credits = (st.credits != null) ? st.credits : null;
  const creditsTotal = (st.credits_total != null) ? st.credits_total : null;
  const creditsUsed = (st.credits_used != null) ? st.credits_used : null;
  const creditSub = (creditsTotal != null)
    ? ("剩余 / 总 " + fmtCredits(creditsTotal)
       + (creditsUsed != null ? " · 已用 " + fmtCredits(creditsUsed) : ""))
    : "CodeArts 积分";
  box.innerHTML =
    card("健康账号", healthy + "/" + total, "由本进程直接管理")
    + card("积分", fmtCredits(credits), creditSub)
    + card("模型", (r.models || []).length, "CodeArts 目录")
    + card("冷却", (st.cooling != null) ? st.cooling : 0, "到点自动恢复")
    + card("停用", (st.disabled != null) ? st.disabled : 0, "手动/上游");
}

function codeartsSlotSelectHtml(a){
  const current = a.proxy_slot || '';
  const opts = ['<option value=""' + (current ? '' : ' selected') + '>直连</option>'];
  const known = PROXY_SLOTS.some(s => s.id === current);
  if(current && !known){
    opts.push('<option value="" selected>已删除的槽位（直连）</option>');
  }
  opts.push.apply(opts, PROXY_SLOTS.map(s =>
    '<option value="' + esc(s.id) + '"' + (s.id === current ? ' selected' : '') + '>'
    + esc(s.label || s.name || s.id) + (s.enabled === false ? '（停用）' : '') + '</option>'));
  const uidAttr = esc(String(a.uid || '').replace(/[^\w.@-]/g, ''));
  return '<select class="slot-select" onchange="codeartsSetProxy(&quot;' + uidAttr + '&quot;, this.value, this)">'
    + opts.join('') + '</select>';
}

async function codeartsSetProxy(uid, slotId, el){
  if(el) el.disabled = true;
  try{
    await postJSON('/codearts/accounts/proxy', {uid: uid, slot_id: slotId});
    toast('出口已更新', 'ok');
    await loadCodeartsOverview(true);
  }catch(e){
    toast('出口更新失败: ' + e.message, 'bad');
  }finally{
    if(el) el.disabled = false;
  }
}

function renderCodeartsAccounts(r){
  const box = document.getElementById("codeartsAccounts");
  const count = document.getElementById("codeartsAcctCount");
  const accounts = r.accounts || [];
  if(count) count.textContent = accounts.length ? (" · " + accounts.length) : "";
  if(!box) return;
  if(!accounts.length){
    box.innerHTML = '<div style="padding:24px;text-align:center;color:var(--dim)">还没有 CodeArts 账号。点「+ 添加账号 (OAuth)」开始。</div>';
    return;
  }
  let html = '<div class="table-wrap"><table><thead><tr>'
    + '<th>账号</th><th>状态</th><th>Token</th><th>出口</th><th>积分</th><th>并发</th><th>签到</th><th>操作</th>'
    + '</tr></thead><tbody>';
  accounts.forEach(function(a){
    const uid = escapeHtml(a.uid || "");
    const uidSafe = esc(String(a.uid || "").replace(/[^\w.@-]/g, ""));
    const name = escapeHtml(a.nickname || a.user_name || a.uid || "");
    const note = a.note
      ? '<div style="font-size:11px;color:var(--dim)">' + escapeHtml(a.note) + '</div>'
      : '';
    let status = '<span class="badge ok mini">正常</span>';
    if(a.disabled) status = '<span class="badge bad mini">已停用</span>';
    else if(a.cooling) status = '<span class="badge warn mini">冷却中</span>';
    const token = escapeHtml((a.token_remaining || "—") + (a.expires_at ? " · " + a.expires_at : ""));
    const credits = (a.credits && a.credits.remain != null)
      ? (fmtCredits(a.credits.remain)
         + (a.credits.used ? '<div style="font-size:11px;color:var(--dim)">已用 ' + fmtCredits(a.credits.used) + '</div>' : ''))
      : "—";
    const conc = (a.active_concurrent != null ? a.active_concurrent : 0)
      + "/" + (a.max_concurrent != null ? a.max_concurrent : "—");
    let checkin = "—";
    if(a.checkin && a.checkin.ok) checkin = "已签到";
    else if(a.checkin && a.checkin.message) checkin = escapeHtml(a.checkin.message);
    const actions = [];
    if(a.disabled){
      actions.push('<button class="sec mini" onclick="codeartsAccountAction(\'enable\',\'' + uidSafe + '\')">启用</button>');
    }else{
      actions.push('<button class="sec mini" onclick="codeartsAccountAction(\'disable\',\'' + uidSafe + '\')">停用</button>');
    }
    actions.push('<button class="sec mini" onclick="codeartsRelogin(\'' + uidSafe + '\')">重新登录</button>');
    actions.push('<button class="sec mini" onclick="codeartsAccountAction(\'clear-cooldown\',\'' + uidSafe + '\')">清冷却</button>');
    actions.push('<button class="sec mini" onclick="codeartsAccountAction(\'test\',\'' + uidSafe + '\')">测试</button>');
    actions.push('<button class="sec mini" onclick="codeartsAccountAction(\'tasks\',\'' + uidSafe + '\',' + (!a.tasks_enabled) + ')">' + (a.tasks_enabled ? '停任务' : '开任务') + '</button>');
    actions.push('<button class="sec mini" onclick="codeartsEditNote(\'' + uidSafe + '\')">备注</button>');
    actions.push('<button class="sec mini" onclick="codeartsAccountAction(\'checkin\',\'' + uidSafe + '\')">签到</button>');
    actions.push('<button class="sec mini" onclick="codeartsAccountAction(\'delete\',\'' + uidSafe + '\')">删除</button>');
    html += '<tr><td><b>' + name + '</b>' + note + '<div class="mono" style="color:var(--dim);font-size:11px">' + uid + '</div></td>'
      + '<td>' + status + (a.reason ? '<div style="font-size:11px;color:var(--dim)">' + escapeHtml(a.reason) + '</div>' : '') + '</td>'
      + '<td class="mono" style="font-size:11px">' + token + '</td>'
      + '<td>' + codeartsSlotSelectHtml(a) + '</td>'
      + '<td>' + credits + '</td>'
      + '<td>' + conc + '</td><td>' + checkin + '</td>'
      + '<td style="white-space:nowrap">' + actions.join(" ") + '</td></tr>';
  });
  html += '</tbody></table></div>';
  box.innerHTML = html;
}

async function codeartsAccountAction(action, uid, extra){
  if(action === "delete"){
    if(!confirm("删除 CodeArts 账号 " + uid + "？\n\n会删除凭据并移出账号池，不可恢复。")) return;
  }
  const payload = {uid: uid};
  if(action === "tasks") payload.enabled = !!extra;
  if(action === "note") payload.note = String(extra == null ? "" : extra);
  try{
    const r = await postJSON("/codearts/accounts/" + action, payload);
    if(action === "test" && r && r.ok === false){
      toast("测试失败: " + (r.message || "未知错误"), "bad");
      return;
    }
    toast((r && r.message) || "操作成功", "ok");
    await loadCodeartsOverview(true);
  }catch(e){
    toast("操作失败: " + e.message, "bad");
  }
}

function codeartsRelogin(uid){
  openCodeartsOauthModal();
  setTimeout(function(){
    setCodeartsOauthStatus("请用账号 " + uid + " 完成授权；同 UID 会更新现有账号。", null);
  }, 50);
}

function codeartsEditNote(uid){
  const acct = ((window.CODEARTS_OVERVIEW || {}).accounts || [])
    .find(a => a.uid === uid) || {};
  const note = prompt("备注", acct.note || "");
  if(note === null) return;
  codeartsAccountAction("note", uid, note);
}

async function refreshCodeartsCredits(btn){
  if(btn) btn.disabled = true;
  try{
    const r = await postJSON("/codearts/credits/refresh", {});
    toast((r && r.message) || "已刷新积分", "ok");
    await loadCodeartsOverview(true);
  }catch(e){
    toast("刷新积分失败: " + e.message, "bad");
  }finally{
    if(btn) btn.disabled = false;
  }
}

async function codeartsCheckinAll(btn){
  if(btn) btn.disabled = true;
  try{
    const r = await postJSON("/codearts/accounts/checkin", {});
    toast((r && r.message) || "已发起签到", "ok");
    await loadCodeartsOverview(true);
  }catch(e){
    toast("签到失败: " + e.message, "bad");
  }finally{
    if(btn) btn.disabled = false;
  }
}

async function codeartsKeepalive(btn){
  if(btn) btn.disabled = true;
  try{
    const r = await postJSON("/codearts/keepalive", {});
    toast((r && r.message) || "已发起保活", "ok");
    await loadCodeartsOverview(true);
  }catch(e){
    toast("保活失败: " + e.message, "bad");
  }finally{
    if(btn) btn.disabled = false;
  }
}

function openCodeartsConsole(){
  const base = (window.CODEARTS_OVERVIEW || {}).base_url || "";
  if(!base){ toast("CodeArts 还没有配置 Base URL", "warn"); return; }
  window.open(base, "_blank", "noopener,noreferrer");
}

let CODEARTS_OAUTH_SESSION = "";
let CODEARTS_OAUTH_TIMER = null;

function setCodeartsOauthStatus(msg, ok){
  const el = document.getElementById("codeartsOauthStatus");
  if(!el) return;
  el.textContent = msg || "";
  el.style.color = (ok === true) ? "var(--accent2)" : (ok === false ? "var(--bad)" : "var(--dim)");
}

function openCodeartsOauthModal(){
  const modal = document.getElementById("codeartsOauthModal");
  if(modal) modal.classList.add("show");
  const url = document.getElementById("codeartsOauthUrl");
  if(url) url.textContent = "";
  const cb = document.getElementById("codeartsOauthCallback");
  if(cb) cb.value = "";
  startCodeartsOAuth();
}

function closeCodeartsOauthModal(){
  if(CODEARTS_OAUTH_TIMER){ clearInterval(CODEARTS_OAUTH_TIMER); CODEARTS_OAUTH_TIMER = null; }
  CODEARTS_OAUTH_SESSION = "";
  const modal = document.getElementById("codeartsOauthModal");
  if(modal) modal.classList.remove("show");
}

async function startCodeartsOAuth(){
  try{
    const r = await postJSON("/codearts/accounts/oauth/start", {});
    CODEARTS_OAUTH_SESSION = r.session_id || "";
    const url = document.getElementById("codeartsOauthUrl");
    if(url) url.textContent = r.auth_url || "";
    setCodeartsOauthStatus("已生成链接，正在等待授权…", null);
    if(r.auth_url) window.open(r.auth_url, "_blank", "noopener,noreferrer");
    if(CODEARTS_OAUTH_TIMER) clearInterval(CODEARTS_OAUTH_TIMER);
    CODEARTS_OAUTH_TIMER = setInterval(function(){ pollCodeartsOAuth(true); }, 2500);
  }catch(e){
    setCodeartsOauthStatus("发起失败: " + e.message, false);
  }
}

async function pollCodeartsOAuth(silent){
  if(!CODEARTS_OAUTH_SESSION) return;
  try{
    const r = await postJSON("/codearts/accounts/oauth/poll",
                             {session_id: CODEARTS_OAUTH_SESSION});
    if(r.status === "pending"){
      setCodeartsOauthStatus(r.message || "等待浏览器完成授权…", null);
      return;
    }
    if(r.status === "done" && r.ok){
      setCodeartsOauthStatus("✓ " + (r.message || "登录成功"), true);
      if(CODEARTS_OAUTH_TIMER){ clearInterval(CODEARTS_OAUTH_TIMER); CODEARTS_OAUTH_TIMER = null; }
      CODEARTS_OAUTH_SESSION = "";
      await loadCodeartsOverview(true);
      setTimeout(closeCodeartsOauthModal, 900);
      return;
    }
    setCodeartsOauthStatus("✗ " + (r.message || "授权失败"), false);
    if(CODEARTS_OAUTH_TIMER){ clearInterval(CODEARTS_OAUTH_TIMER); CODEARTS_OAUTH_TIMER = null; }
  }catch(e){
    if(!silent) setCodeartsOauthStatus("查询失败: " + e.message, false);
  }
}

async function importCodeartsCallback(btn){
  const input = document.getElementById("codeartsOauthCallback");
  const callbackUrl = input ? input.value.trim() : "";
  if(!CODEARTS_OAUTH_SESSION || !callbackUrl){
    setCodeartsOauthStatus("请先发起授权，再粘贴完整回调地址", false);
    return;
  }
  if(btn) btn.disabled = true;
  try{
    const r = await postJSON("/codearts/accounts/oauth/callback", {
      session_id: CODEARTS_OAUTH_SESSION,
      callback_url: callbackUrl,
    });
    if(input) input.value = "";
    setCodeartsOauthStatus(r.message || "回调已接收，继续等待授权…", null);
    if(r.next_url){
      const url = document.getElementById("codeartsOauthUrl");
      if(url) url.textContent = r.next_url;
      window.open(r.next_url, "_blank", "noopener,noreferrer");
    }
    setTimeout(function(){ pollCodeartsOAuth(true); }, 500);
  }catch(e){
    setCodeartsOauthStatus("中转失败: " + e.message, false);
  }finally{
    if(btn) btn.disabled = false;
  }
}

function openCodeartsAuthUrl(){
  const el = document.getElementById("codeartsOauthUrl");
  const url = el ? el.textContent.trim() : "";
  if(url) window.open(url, "_blank", "noopener,noreferrer");
}

function renderCodeartsSettings(cfg){
  if(!cfg) return;
  const enabled = document.getElementById("setCodeartsEnabled");
  if(enabled) enabled.checked = cfg.enabled === true;
  const auto = document.getElementById("setCodeartsAutoCheckin");
  if(auto) auto.checked = cfg.credits_auto_claim === true;
  const conc = document.getElementById("setCodeartsMaxConcurrent");
  if(conc) conc.value = cfg.max_concurrent || 1;
  const timeout = document.getElementById("setCodeartsTimeout");
  if(timeout) timeout.value = cfg.timeout_seconds || 30;
  const stream = document.getElementById("setCodeartsStreamTimeout");
  if(stream) stream.value = cfg.stream_timeout_seconds || 600;
  const ttl = document.getElementById("setCodeartsModelsTtl");
  if(ttl) ttl.value = cfg.models_ttl_seconds || 300;
  const state = document.getElementById("setCodeartsState");
  if(state){
    state.textContent = cfg.configured ? "(已启用)" : "(未启用)";
    state.style.color = cfg.configured ? "var(--accent2)" : "var(--dim)";
  }
  const hint = document.getElementById("setCodeartsHint");
  if(hint){
    hint.textContent = (cfg.accounts || 0) + " 个账号，"
      + (cfg.healthy || 0) + " 个健康；账号在「账号」页的 CodeArts 视图管理。";
  }
}

async function saveCodeartsSettings(btn){
  const val = id => { const el = document.getElementById(id); return el ? el.value : ""; };
  const payload = {
    enabled: !!(document.getElementById("setCodeartsEnabled") || {}).checked,
    credits_auto_claim: !!(document.getElementById("setCodeartsAutoCheckin") || {}).checked,
    max_concurrent: parseInt(val("setCodeartsMaxConcurrent"), 10) || 1,
    timeout_seconds: parseFloat(val("setCodeartsTimeout")) || 30,
    stream_timeout_seconds: parseFloat(val("setCodeartsStreamTimeout")) || 600,
    models_ttl_seconds: parseFloat(val("setCodeartsModelsTtl")) || 300,
  };
  if(btn) btn.disabled = true;
  try{
    const r = await postJSON("/settings/save", {codearts: payload});
    if(r && r.warning) toast(r.warning, "warn");
    else toast("CodeArts 设置已保存", "ok");
    if(r && r.codearts) renderCodeartsSettings(r.codearts);
    await refreshActiveRealm();
    window.updateUI();
  }catch(e){
    toast("保存失败: " + e.message, "bad");
  }finally{
    if(btn) btn.disabled = false;
  }
}

async function testCodeartsConnection(btn){
  if(btn) btn.disabled = true;
  try{
    const r = await postJSON("/codearts/test", {});
    toast("CodeArts 连接正常（" + ((r.models != null) ? r.models : 0) + " 个模型）", "ok");
  }catch(e){
    toast("CodeArts 连接失败: " + e.message, "bad");
  }finally{
    if(btn) btn.disabled = false;
  }
}

async function refreshActiveRealm(){
  // Refresh which exit the gateway is switched to. Deliberately does NOT touch
  // VIEW_REALM: the view is the user's choice, and an account action taken from
  // one realm's view must not throw them into the other one. Boot-time view
  // selection (including the ?view= parameter) lives in initRealm().
  try {
    const r = await getJSON("/realm");
    if(r && r.current) window.ACTIVE_GATEWAY_REALM = r.current;
    if(r && Array.isArray(r.options)) window.REALM_OPTIONS = r.options;
  } catch(e){}
}

async function initRealm(){
  // Boot only - the initial view follows the active exit unless the URL pins it.
  // Account actions call refreshActiveRealm() instead: reading ?view= here was
  // what moved the panel back to the other realm after 签到 / 活跃打卡, because
  // the view buttons do not rewrite the URL.
  await refreshActiveRealm();
  window.VIEW_REALM = window.ACTIVE_GATEWAY_REALM;
  const viewFromUrl = new URLSearchParams(window.location.search).get('view');
  if(viewFromUrl && ['intl', 'cn', 'codearts'].includes(viewFromUrl)) window.VIEW_REALM = viewFromUrl;
  const limitFromUrl = new URLSearchParams(window.location.search).get('limit');
  if(limitFromUrl && [10, 20, 50, 100].includes(parseInt(limitFromUrl, 10))) RECENT_LIMIT = parseInt(limitFromUrl, 10);
  window.updateUI();
  if(window.VIEW_REALM === 'codearts') loadCodeartsOverview(true);
}

async function refreshModelCatalog(btn){
  // 手动刷新模型清单：强制走一次上游 /v3/config（服务端执行，绕过 300s 缓存），
  // 只刷当前视图版本——这张表显示的是哪个版本，刷新按钮就只拉哪个版本，绝
  // 不跨区（服务端会挑该版本自己的账号发请求）。完成后立即重载表格。
  if(window.VIEW_REALM === 'codearts'){
    if(btn) btn.disabled = true;
    const prevText = btn ? btn.textContent : '';
    if(btn) btn.textContent = '刷新中...';
    try{
      const r = await postJSON('/codearts/models/refresh', {});
      toast('CodeArts 模型目录：' + ((r && r.models) || 0) + ' 个模型', 'ok');
      await loadModels();
    }catch(e){
      toast('CodeArts 模型目录刷新失败：' + e.message, 'bad');
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = prevText; }
    }
    return;
  }
  const realm = window.VIEW_REALM === 'cn' ? 'cn' : 'intl';
  const label = realm === 'cn' ? '国内版' : '国际版';
  if(btn) btn.disabled = true;
  const prevText = btn ? btn.textContent : '';
  if(btn) btn.textContent = '刷新中...';
  try{
    const r = await postJSON('/catalog/refresh', {realm: realm});
    if(r && r.ok){
      toast(label + '模型清单：' + (r.msg || '已更新'), 'ok');
      await loadModels();
    } else if(r && r.cooldown){
      // 冷却不是失败：清单还在、只是这次没到窗口，按提示语气说。
      toast(label + '模型清单：' + (r.msg || '刷新太频繁'), 'warn');
    } else {
      toast(label + '模型清单刷新失败：' + ((r && r.msg) || '未知原因'), 'warn');
    }
  }catch(e){
    toast(label + '模型清单刷新失败：' + e.message, 'bad');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = prevText; }
  }
}

async function loadModels(){
  try{
    const r = await getJSON('/v1/models?realm=' + encodeURIComponent(window.VIEW_REALM));
    MODELS_DATA = r.data || [];
    renderModelsSourceLine(r.catalog || null);
    renderAvailableModels();
  }catch(e){
    console.error('loadModels error:', e);
  }
}

/* ---- 「网关模型清单」勾选（一键配置用，全局一份） ----
   这张表每行前面的复选框只决定「一键配置」把哪些模型写进 DSH 等客户端，不改
   网关路由：未勾选的模型在网关侧照常可以调用。选择是全局的（不按版本视图划
   分），后端存一份 id 列表，见 /agents/model-selection。
   默认态是「全部勾选」：服务端还没存过时（configured=false）空集合表示
   「全都要」，所以升级后第一次打开面板看到的就是全勾，一键配置写出的清单与
   升级前逐字相同。只有用户改过（含表头的批量动作）才会落一份显式列表。 */
let AGENT_MODEL_SELECTION = new Set();
// 服务端是否存过勾选。false = 从未保存 = 视作全部勾选（与「明确全不选」区分开，
// 后端的 agent_models 也是这个三态：None / [] / 非空）。
let MODEL_SELECTION_CONFIGURED = false;
// 上一次确认写进服务端的那份选择：失败回滚与「没变化就不重发」都靠它。
// null = 还没保存过（与空集合语义不同）。
let MODEL_SELECTION_SAVED = null;
let MODEL_SELECTION_TIMER = null;
let MODEL_SELECTION_SAVING = false;
let MODEL_SELECTION_QUEUED = false;
let MODEL_SELECTION_LOADING = false;

function modelSelectionKey(list){
  return (list || []).map(String).sort().join('\n');
}
function currentModelSelection(){
  return Array.from(AGENT_MODEL_SELECTION);
}
// 某个模型当前算不算被勾选。所有「读勾选」的地方都走这里，别直接看集合，
// 否则「从未保存」的全选态会被读成「全都不要」。
function isModelPicked(id){
  return !MODEL_SELECTION_CONFIGURED || AGENT_MODEL_SELECTION.has(id);
}
// 批量动作始终针对当前目录全量 id，不受纯展示筛选隐藏的行影响。
function allModelPickIds(){
  return (MODELS_DATA || []).map(m => String((m && m.id) || '')).filter(Boolean);
}
let MODEL_CATALOG_FILTER = '';
function clearModelCatalogFilter(){
  MODEL_CATALOG_FILTER = '';
  const input = document.getElementById('modelCatalogFilter');
  if(input) input.value = '';
  renderAvailableModels();
}

// 计数挂在「网关模型清单」标题后面：共几个 + 已勾选几个。勾选数放在这里而
// 不是每行旁边，是因为「一个都没勾」在第一眼看不出来（所有框都是空的）。
function updateAvailModelCount(){
  const em = document.getElementById('availModelCount');
  if(!em) return;
  const total = MODELS_DATA.length;
  const picked = MODEL_SELECTION_CONFIGURED ? AGENT_MODEL_SELECTION.size : total;
  em.textContent = '(共 ' + total + ' 个) · 已选 ' + picked;
}

// 只改复选框的勾选状态与计数，不重建行——避免把滚动位置、排序和焦点抖掉。
// 选择在别处变化（GET 回来、POST 失败回滚、批量动作）时用这个同步。
function syncModelPickBoxes(){
  Array.from(document.querySelectorAll('#modelsTable input.model-pick')).forEach(box => {
    box.checked = isModelPicked(box.dataset.modelId);
  });
  updateAvailModelCount();
}

async function loadAgentModelSelection(){
  if(MODEL_SELECTION_LOADING) return;
  MODEL_SELECTION_LOADING = true;
  try{
    const r = await getJSON('/agents/model-selection');
    const list = (r && (r.selected_models || r.models)) || [];
    // configured=false 表示服务端还没存过：这时维持「全部勾选」的默认态，
    // 空集合在这里读作「全都要」。存过之后才按存的那份画。
    MODEL_SELECTION_CONFIGURED = !!(r && r.configured);
    AGENT_MODEL_SELECTION = new Set(MODEL_SELECTION_CONFIGURED ? list.map(String) : []);
    MODEL_SELECTION_SAVED = MODEL_SELECTION_CONFIGURED ? new Set(AGENT_MODEL_SELECTION) : null;
    syncModelPickBoxes();
  }catch(e){
    // 读不到就维持「全部勾选」的默认态（等价于升级前的行为：整份目录都写进客户端），
    // 不打断页面其它加载；授权失效由面板登录门统一处理，这里不重复弹提示。
    if(!isAuthError(e)) console.error('loadAgentModelSelection error:', e);
  }finally{
    MODEL_SELECTION_LOADING = false;
  }
}

// 勾选落库：本地立即生效，POST 防抖 400ms——连点几行只发一次整份列表。
// 选择没变化（比如勾上又取消）时不发请求。
function scheduleModelSelectionSave(){
  if(MODEL_SELECTION_TIMER) clearTimeout(MODEL_SELECTION_TIMER);
  MODEL_SELECTION_TIMER = setTimeout(saveModelSelection, 400);
}

async function saveModelSelection(){
  MODEL_SELECTION_TIMER = null;
  if(MODEL_SELECTION_SAVING){ MODEL_SELECTION_QUEUED = true; return; }
  const payload = currentModelSelection();
  const key = modelSelectionKey(payload);
  // 还没存过时（SAVED=null）不能拿空集合当"上次保存的结果"比，否则用户从全选态
  // 里取消一个模型，会被误判成"没变化"而永远发不出去。
  if(MODEL_SELECTION_SAVED && key === modelSelectionKey(Array.from(MODEL_SELECTION_SAVED))) return;
  MODEL_SELECTION_SAVING = true;
  try{
    const r = await postJSON('/agents/model-selection', {models: payload});
    MODEL_SELECTION_SAVED = new Set(payload);
    MODEL_SELECTION_CONFIGURED = true;
    // 服务端会清洗列表（去重 / 超长截断）。保存期间没人继续勾选时以返回值为准，
    // 让面板上的勾选与真正落盘的清单一致；有人在期间改过就保留本地状态，等
    // 下面 finally 里的补发把最新一份送上去。
    const saved = r && (r.selected_models || r.models);
    if(Array.isArray(saved) && modelSelectionKey(currentModelSelection()) === key){
      const normalized = new Set(saved.map(String));
      if(modelSelectionKey(Array.from(normalized)) !== key){
        AGENT_MODEL_SELECTION = normalized;
        MODEL_SELECTION_SAVED = new Set(normalized);
        syncModelPickBoxes();
        if(AGENT_MODELS.length) renderAgentConnForm();
      }
    }
  }catch(e){
    // 面板上的勾选必须和服务器保持一致：回滚到上次成功的快照并重画。智能体页
    // 的默认模型下拉是按勾选集合画的，回滚后也要跟着重画，否则它会继续列一个
    // 已经被取消勾选的模型。
    AGENT_MODEL_SELECTION = MODEL_SELECTION_SAVED ? new Set(MODEL_SELECTION_SAVED) : new Set();
    MODEL_SELECTION_CONFIGURED = !!MODEL_SELECTION_SAVED;
    syncModelPickBoxes();
    if(AGENT_MODELS.length) renderAgentConnForm();
    if(!isAuthError(e)) toast('模型勾选保存失败：' + e.message, 'bad');
  }finally{
    MODEL_SELECTION_SAVING = false;
    // 保存期间又有勾选：串行补发一次，别让旧响应把新的选择盖掉。
    if(MODEL_SELECTION_QUEUED){
      MODEL_SELECTION_QUEUED = false;
      scheduleModelSelectionSave();
    } else if(modelSelectionKey(currentModelSelection())
              !== modelSelectionKey(MODEL_SELECTION_SAVED ? Array.from(MODEL_SELECTION_SAVED) : [])){
      scheduleModelSelectionSave();
    }
  }
}

// 复选框走事件委托：表格每次重画都会换掉整批 input，逐行挂监听会跟着丢。
// 排序的点击委托只认表头（sortHeaderAt），勾选不会触发表格排序。
document.addEventListener('change', function(ev){
  const box = ev.target;
  if(!box || !box.classList || !box.classList.contains('model-pick')) return;
  const id = box.dataset ? box.dataset.modelId : '';
  if(!id) return;
  if(!MODEL_SELECTION_CONFIGURED){
    // 从「从未保存」的全选态改起：先把整份清单落成显式集合，再应用这一次改动。
    // 少了这一步，「取消一个模型」会被存成「只选这一个」的反面。
    AGENT_MODEL_SELECTION = new Set(allModelPickIds());
    MODEL_SELECTION_CONFIGURED = true;
  }
  if(box.checked) AGENT_MODEL_SELECTION.add(id);
  else AGENT_MODEL_SELECTION.delete(id);
  updateAvailModelCount();
  scheduleModelSelectionSave();
  // 智能体页的默认模型下拉只列已勾选的模型，选择变了就跟着重画；目录还没
  // 加载（没打开过智能体页）时由 loadAgents() 自己按当前选择画。
  if(AGENT_MODELS.length) renderAgentConnForm();
});

// 表头三个批量动作：全选 / 全不选 / 反选。
// 做成按钮而不是「反选」复选框：反选是动作、不是状态。复选框形态要么得额外记一份
// 「反选之前的集合」（否则两次开关回不到原状），要么让「界面显示的勾选」和
// 「实际保存的清单」分家——两者都是最难查的那类双状态 bug。
function applyModelPickAction(kind){
  const all = allModelPickIds();
  if(kind === 'all') AGENT_MODEL_SELECTION = new Set(all);
  else if(kind === 'none') AGENT_MODEL_SELECTION = new Set();
  else if(kind === 'invert') AGENT_MODEL_SELECTION = new Set(all.filter(id => !isModelPicked(id)));
  else return;
  MODEL_SELECTION_CONFIGURED = true;
  syncModelPickBoxes();
  scheduleModelSelectionSave();
  if(AGENT_MODELS.length) renderAgentConnForm();
}

// 清单来源横幅：把「通过 API 获取的最新数据」和「项目默认/缓存文件数据」在
// 视觉上分清楚——非 API 来源给黄色警示（模型、倍率数据可能不一致），API 来源
// 给绿色状态条并附刷新时间。数据由 /v1/models 响应的 catalog 字段驱动（见
// wb_proxy.catalog_meta）；旧版服务端没有该字段时如实提示。
const CATALOG_SOURCE_ORIGIN = {
  remote:   '上游 API · /v3/config',
  endpoint: '上游 API · /v1/models 端点',
  cache:    '本地配置文件（桌面客户端缓存）',
  legacy:   '本地配置文件（桌面客户端缓存）',
  bundled:  '内置快照'
};
const CATALOG_BANNER_BASE = 'font-size:12px;margin:0 0 12px;padding:7px 10px;border-radius:6px;'
  + 'display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;line-height:1.5;';

function fmtCatalogStamp(sec){
  const n = Number(sec);
  if(!n || n <= 0) return '';
  const d = new Date(n * 1000);
  if(isNaN(d.getTime())) return '';
  const p = v => String(v).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function renderModelsSourceLine(meta){
  const el = document.getElementById('modelsSourceLine');
  if(!el) return;
  const tip = '清单构建顺序：先请求上游 API（/v3/config，用当前视图版本的账号）→ 失败则读取本机桌面客户端缓存文件 → 都拿不到才用内置快照。'
    + '清单在 5 分钟缓存期内复用，过期自动重取；网关后台每天也会兜底获取一次；点「刷新模型清单」可立即从上游更新。';
  if(!meta || !meta.source){
    el.style.cssText = CATALOG_BANNER_BASE + 'flex-direction:column;align-items:flex-start;gap:2px;background:transparent;border:1px dashed var(--line);color:var(--dim)';
    el.title = tip;
    el.innerHTML = '数据来源：未知（当前网关进程版本较旧未提供来源信息，重启网关后可见）';
    return;
  }
  const isApi = (meta.source === 'remote' || meta.source === 'endpoint');
  const at = fmtCatalogStamp(meta.fetched_at);
  el.title = tip;
  if(meta.source === 'codearts'){
    el.style.cssText = CATALOG_BANNER_BASE
      + 'background:var(--accent2-soft);border:1px solid rgba(94,140,79,.28);color:var(--accent2)';
    el.title = 'CodeArts 模型目录来自本进程的 agent-center / builtin / 福利三路发现；缓存过期后自动重取，失败时回退到上次成功的目录。';
    el.innerHTML = '<b>✓ 当前为 CodeArts 模型目录</b>'
      + '<span style="color:var(--dim)">刷新时间 ' + esc(at || '—')
      + (meta.stale ? ' · 上游暂时不可达，显示上次成功的目录' : '')
      + '</span>';
    return;
  }
  if(isApi){
    el.style.cssText = CATALOG_BANNER_BASE
      + 'background:var(--accent2-soft);border:1px solid rgba(94,140,79,.28);color:var(--accent2)';
    el.innerHTML = '<b>✓ 当前为通过 API 获取的最新数据</b>'
      + '<span style="color:var(--dim)">刷新时间 ' + esc(at || '—')
      + ' · 来源 ' + esc(CATALOG_SOURCE_ORIGIN[meta.source] || meta.source) + '</span>';
    return;
  }
  // 非 API（缓存文件 / 内置快照）：警示横幅 + 真实出处做小字。
  let origin = CATALOG_SOURCE_ORIGIN[meta.source] || meta.source;
  if(meta.source === 'cache' || meta.source === 'legacy'){
    const fm = fmtCatalogStamp(meta.file_mtime);
    if(fm) origin += ' · 文件写入于 ' + fm;
    if(at) origin += ' · 网关读取于 ' + at;
  } else if(at){
    origin += ' · 生成于 ' + at;
  }
  el.style.cssText = CATALOG_BANNER_BASE
    + 'flex-direction:column;align-items:flex-start;gap:2px;'
    + 'background:var(--warn-soft);border:1px solid rgba(183,121,31,.35);color:var(--warn)';
  el.innerHTML = '<b>⚠ 当前为项目默认模型信息（未经 API 刷新）：模型、倍率数据可能不一致</b>'
    + '<span style="color:var(--dim)">数据出处：' + esc(origin)
    + ' · 建议点击「刷新模型清单」获取最新数据</span>';
}

function renderAvailableModels(){
  const tb = document.querySelector('#modelsTable tbody');
  if(!tb) return;
  updateAvailModelCount();
  const query = MODEL_CATALOG_FILTER.trim().toLowerCase();
  const visibleModels = MODELS_DATA.filter(m => !query || [
    m.id, m.name, m.description, m.credits,
    m.supports_vision ? '视觉 vision' : '文本 text',
    m.supports_tool_calls ? '工具 tools' : '',
    m.supports_reasoning ? '推理 reasoning' : ''
  ].some(v => String(v || '').toLowerCase().includes(query)));
  const count = document.getElementById('modelCatalogFilterCount');
  if(count) count.textContent = query ? ('显示 ' + visibleModels.length + ' / ' + MODELS_DATA.length + ' 个模型') : '';
  if(!MODELS_DATA.length){
    tb.innerHTML = '<tr><td colspan="8" class="empty">暂无可用模型</td></tr>';
    return;
  }
  if(!visibleModels.length){
    tb.innerHTML = '<tr><td colspan="8"><div class="console-filter-empty"><span>没有符合当前条件的模型</span><button type="button" class="sec mini" onclick="clearModelCatalogFilter()">清除筛选</button></div></td></tr>';
    return;
  }
  tb.innerHTML = visibleModels.map(m => {
    // 1. 倍率与折扣 —— 一律以 /v1/models 取回的 credits 为准（活目录优先、
    //    内置快照兜底）。以前这里还按模型 id 写死了 hy3 / hy4-preview-f /
    //    国际版 deepseek-v4.1-flash 三个"限时免费"，与 credits 值是 OR 关系，
    //    上游一旦调价面板会继续宣传免费；cn 的夜间注记在 credits 缺失时还会
    //    兜底显示写死的 0.79x。现在取不到就不显示数字。
    let credBadge = '-';
    let credText = (m.credits == null ? '' : String(m.credits)).trim();

    const c = credText.toLowerCase().replace('x', '');
    if(c === '0.00' || c === '0'){
      credBadge = '<span class="badge ok" style="background:var(--accent2-soft);color:var(--accent2)">限时免费 0.00x</span>';
    } else if(credText){
      // 统一成倍率写法：'x0.79' / '0.79' / 数字 0.5 都显示成 '0.79x' / '0.5x'。
      const raw = credText.replace(/^x/i, '') + 'x';
      const night = ((m.id === 'glm-5.2' || m.id === 'deepseek-v4-pro') && window.VIEW_REALM === 'cn')
        ? ' <span style="font-size:10px;color:var(--accent)">(夜间0.5x)</span>' : '';
      credBadge = '<span class="badge s">' + esc(raw) + night + '</span>';
    }
    
    // #505: 只标「Pro Only」（与上游徽章同名），不标「可用」。没有 entitlement 就什么都不显示。
    // 标注由 /v1/models 给出：source=catalog 是上游目录 modelTiers 的声明（与
    // 调度器拦人用的是同一份数据），source=runtime 是历史上真撞到过 11158。
    const ent = m.entitlement;
    if(ent){
      const stamp = ent.checked_at || ent.at;
      const when = stamp ? new Date(Number(stamp) * 1000).toLocaleString() : '';
      const tip = (ent.source === 'catalog')
        ? ('上游目录声明：该模型仅限 PRO 账号（requiredUserType=standard）'
           + (when ? (' · 目录刷新于 ' + when) : '')
           + ' · 免费账号的请求会被本地拦下，不发往上游 · 仅标记不可用，未标记不代表可用')
        : ('上游 ' + ent.code + ' · ' + (ent.userType ? ('user type ' + ent.userType) : '免费账号')
           + (when ? (' · ' + when) : '') + ' · 仅标记不可用，未标记不代表可用');
      credBadge += ' <span class="badge warn" style="font-size:11px;background:var(--warn-soft);color:var(--warn);border-color:rgba(183,121,31,.35)" title="'
        + esc(tip) + '">Pro Only</span>';
    }

    // 2. 模型能力 (Vision, Tool calls)
    const caps = [];
    const hasVis = m.supports_vision || m.vision || m.multimodal || (m.input_modalities && m.input_modalities.includes('image'));
    if(hasVis){
      caps.push('<span class="badge ok" style="font-size:11px">视觉</span>');
    } else if(m.id === 'glm-5.3-flash' || m.vision_note){
      const tip = m.vision_note || '上游配置宣告支持多模态，但实际后端未接入视觉通道，已强制修正为纯文本';
      caps.push('<span class="badge warn" style="font-size:11px;background:var(--warn-soft);color:var(--warn);border-color:rgba(183,121,31,.35)" title="' + esc(tip) + '">文本 (实测无视觉)</span>');
    } else {
      caps.push('<span class="badge" style="color:var(--dim);font-size:11px">文本</span>');
    }
    const hasTool = m.supports_tool_calls || (m.capabilities && m.capabilities.tool_calls);
    if(hasTool){
      caps.push('<span class="badge ok" style="font-size:11px">工具</span>');
    }
    const hasReasoning = m.supports_reasoning || m.reasoning_fixed_effort || (m.reasoning_efforts && m.reasoning_efforts.length);
    if(hasReasoning){
      caps.push('<span class="badge" style="background:rgba(124,58,237,.12);color:var(--think);border-color:rgba(124,58,237,.3);font-size:11px;font-weight:600">推理</span>');
    }
    const capHtml = caps.join(' ');

    const fmtK = v => {
      if(!v) return '-';
      const k = Math.round(v / 1000);
      return k >= 1000 ? (k / 1000) + 'M' : k + 'K';
    };

    // 3. 上下文窗口
    let ctx = '-';
    if(m.context_length){
      ctx = '<b>' + fmtK(m.context_length) + '</b>';
    } else if(m.context_windows && m.context_windows.length){
      ctx = '<b>' + m.context_windows.map(fmtK).join(' / ') + '</b>';
    }

    // 4. 最大输出（有实测钳制时标注「钳制 N×」，数据来自 output_probes.json）
    let maxOut = m.max_output_tokens ? ('<b>' + fmtK(m.max_output_tokens) + '</b>') : '-';
    const clamp = Number(m.output_clamp || 0);
    if(clamp > 0){
      const claimed = Number(m.max_output_tokens || 0);
      const tip = '声称 ' + (claimed ? fmtK(claimed) : '?') + ' · 实测 ' + fmtK(clamp);
      if(!claimed){
        maxOut = '<b style="color:var(--warn)">' + fmtK(clamp) + ' ⚠</b>'
          + '<div style="font-size:11px;color:var(--warn);margin-top:2px" title="' + esc(tip) + '">实测上限</div>';
      }else if(clamp < claimed){
        const ratio = claimed / clamp;
        const xs = (ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10) + '×';
        maxOut = '<b style="color:var(--warn)">' + fmtK(clamp) + ' ⚠</b>'
          + '<div style="font-size:11px;color:var(--warn);margin-top:2px" title="' + esc(tip) + '">钳制 ' + xs + '</div>';
      }else{
        maxOut = '<b>' + fmtK(clamp) + '</b> <span style="color:var(--accent2)">✓</span>';
      }
    }

    // 5. 思考档位（档位徽章 + 默认档位 / 能否关闭思考两行注记）
    let effort = '<span style="color:var(--dim)">—</span>';
    const renderEffortBadge = e => {
      const lvl = String(e || '').toLowerCase();
      return '<span class="badge-effort">' + esc(lvl) + '</span>';
    };
    if(m.reasoning_fixed_effort){
      effort = renderEffortBadge(m.reasoning_fixed_effort);
    } else if(m.reasoning_efforts && m.reasoning_efforts.length === 1){
      effort = renderEffortBadge(m.reasoning_efforts[0]);
    } else if(m.reasoning_efforts && m.reasoning_efforts.length){
      effort = m.reasoning_efforts.map(renderEffortBadge).join(' ');
    } else if(m.supports_reasoning){
      effort = '<span class="badge-effort">原生</span>';
    }
    const effortNotes = [];
    if(m.reasoning_default_effort){
      effortNotes.push('默认 ' + esc(String(m.reasoning_default_effort)));
    }
    if(m.reasoning_can_disable === true){
      effortNotes.push('可关闭思考');
    } else if(m.reasoning_can_disable === false){
      effortNotes.push('不可关闭思考');
    }
    if(effortNotes.length){
      effort += '<div style="font-size:11px;color:var(--dim);margin-top:2px">' + effortNotes.join(' · ') + '</div>';
    }

    // 6. 名称（默认模型带星标；描述挂在名称的悬浮提示上）
    const nm = String(m.name || '').trim();
    const nmDesc = String(m.description || '').trim();
    const nameCell = '<td style="text-align:left" data-label="名称">'
      + (m.is_default ? '<span title="默认模型" style="color:var(--accent)">★</span> ' : '')
      + (nm
          ? '<span' + (nmDesc ? ' title="' + esc(nmDesc) + '"' : '') + '>' + esc(nm) + '</span>'
          : '<span style="color:var(--dim)">—</span>')
      + '</td>';

    // 7. 默认采样参数（上游对缺省请求生效的采样值；有的模型只给部分字段）
    const samples = [];
    if(m.temperature != null) samples.push('温度 ' + esc(String(m.temperature)));
    if(m.top_p != null) samples.push('top_p ' + esc(String(m.top_p)));
    const sampleCell = '<td style="text-align:left;padding-right:14px" data-label="默认采样参数">'
      + (samples.length
          ? '<span style="font-size:12px;display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap">' + samples.map(s => '<span style="background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:2px 8px">' + s + '</span>').join('') + '</span>'
          : '<span style="color:var(--dim)">—</span>')
      + '</td>';

    // 8. 模型 ID 前的「一键配置」复选框：勾上才会被写进 DSH 等客户端的模型
    //    清单（选择全局一份，见 AGENT_MODEL_SELECTION）。服务端还没存过勾选时
    //    isModelPicked() 一律返回 true——默认全部勾选，首屏不必等 GET 回来。
    const picked = isModelPicked(m.id);
    return '<tr>'
      + '<td style="text-align:left" class="mono model-id-cell" data-label="模型 ID" title="' + esc(m.id) + '">'
      + '<label><input type="checkbox" class="model-pick" data-model-id="' + esc(m.id) + '"'
      + (picked ? ' checked' : '')
      + ' title="勾选后该模型才会写入 DSH 等客户端的一键配置"><b>' + esc(m.id) + '</b></label>' + '</td>'
      + nameCell
      + '<td style="text-align:center" class="rate-cell" data-label="消费倍率">' + credBadge + '</td>'
      + '<td style="text-align:center" data-label="能力">' + capHtml + '</td>'
      + '<td style="text-align:center" data-label="上下文">' + ctx + '</td>'
      + '<td style="text-align:center" data-label="最大输出">' + maxOut + '</td>'
      + '<td style="text-align:left" data-label="思考档位">' + effort + '</td>'
      + sampleCell
      + '</tr>';
  }).join('');
  applyTableSort('modelsTable');
}

let CURRENT_GROWTH_UID = 'all';
try {
  const _autoClaim = document.getElementById('growthAutoClaim');
  if(_autoClaim && localStorage.getItem('wb-growth-auto-claim') === '0') _autoClaim.checked = false;
} catch(e) {}

async function switchGrowthAccount(uid){
  CURRENT_GROWTH_UID = uid;
  await loadGrowthTasks();
}

/* Task participation: `tasksEnabled` is authoritative; older gateways do
 * not send it, so fall back to `enabled`. */
function taskActive(a){
  return !!a && (a.tasksEnabled !== undefined ? !!a.tasksEnabled : !!a.enabled);
}

async function loadIntlTasks(){
  try{
    const [r, g] = await Promise.all([
      getJSON('/accounts?realm=all'),
      getJSON('/accounts/credits/grants').catch(() => ({}))
    ]);
    const accts = (r.accounts || []).filter(a => a.realm === 'intl' && taskActive(a));
    const countEl = document.getElementById("intlAcctCount");
    if(countEl) countEl.textContent = accts.length + ' 个';
    const bonusEl = document.getElementById("intlBonusCredits");
    if(bonusEl) bonusEl.textContent = '30 / 50 积分';

    const intlTotalEl = document.getElementById("intlTotalGranted");
    if(intlTotalEl){
      const gRows = (g.rows || []).filter(x => x.realm === 'intl' && (x.name === 'Bonus Pack' || (x.source_inferred && x.source_inferred.includes('活跃'))));
      const totalAmt = gRows.reduce((acc, x) => acc + (Number(x.size || x.amount) || 0), 0);
      intlTotalEl.textContent = '+' + fmt(totalAmt) + ' 积分';
    }

    if(typeof updateTaskPageCheckinCards === 'function') updateTaskPageCheckinCards();
  }catch(e){
    console.error('loadIntlTasks error:', e);
  }
}

async function loadGrowthTasks(){
  loadIntlTasks();
  const sec = document.getElementById("sectionGrowthTasks");
  if(!sec) return;
  sec.style.display = 'block';
  try{
    const q = (CURRENT_GROWTH_UID && CURRENT_GROWTH_UID !== 'all') ? ('?uid=' + encodeURIComponent(CURRENT_GROWTH_UID)) : '';
    const r = await getJSON('/tasks' + q);
    const tasks = r.tasks || [];
    const sum = r.summary || {};
    const accts = r.accounts || [];
    const streak = sum.streak_days || 0;
    const energy = sum.energy || 0;
    const tr = sum.travel || {};

    const sel = document.getElementById("growthAcctSelect");
    if(sel){
      if(accts.length){
        const opts = ['<option value="all"' + (CURRENT_GROWTH_UID === 'all' ? ' selected' : '') + '>全部国内账号 (批量)</option>']
          .concat(accts.map(a => '<option value="' + esc(a.uid) + '"' + (CURRENT_GROWTH_UID === a.uid ? ' selected' : '') + '>' + esc(a.nickname) + ' (' + esc(a.uid.slice(0,6)) + ')</option>'))
          .join('');
        sel.innerHTML = opts;
      } else {
        sel.innerHTML = '<option value="">无国内版账号</option>';
      }
    }
    if(!accts.length){
      if(typeof updateTaskPageCheckinCards === 'function') updateTaskPageCheckinCards();
      const elStk = document.getElementById("stkDays"); if(elStk) elStk.textContent = '-';
      const elNrg = document.getElementById("nrgBalance"); if(elNrg) elNrg.textContent = '-';
      const elCards = document.getElementById("makeupCards"); if(elCards) elCards.textContent = '-';
      const elLottery = document.getElementById("lotteryChances"); if(elLottery) elLottery.textContent = '-';
      const elCat = document.getElementById("catState"); if(elCat) elCat.textContent = '-';
      const elCatDesc = document.getElementById("catDesc"); if(elCatDesc) elCatDesc.textContent = '-';
      const tb = document.querySelector("#growthTable tbody");
      if(tb) tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dim);padding:24px">暂无任务或未登录国内版账号</td></tr>';
      return;
    }

    if(typeof updateTaskPageCheckinCards === 'function') updateTaskPageCheckinCards();

    const elStk = document.getElementById("stkDays");
    if(elStk) elStk.textContent = streak + ' 天';
    const elNrg = document.getElementById("nrgBalance");
    if(elNrg) elNrg.textContent = energy;
    const elCards = document.getElementById("makeupCards");
    if(elCards) elCards.textContent = (sum.makeup_cards != null ? sum.makeup_cards : '-') + ' 张';
    const elLottery = document.getElementById("lotteryChances");
    if(elLottery) elLottery.textContent = (sum.lottery_chances != null ? sum.lottery_chances : '-') + ' 次';

    const cnTotalEl = document.getElementById("cnTotalGranted");
    if(cnTotalEl){
      try{
        const g = await getJSON('/accounts/credits/grants');
        let gRows = (g.rows || []).filter(x => x.realm === 'cn');
        if(CURRENT_GROWTH_UID && CURRENT_GROWTH_UID !== 'all'){
          gRows = gRows.filter(x => x.uid === CURRENT_GROWTH_UID);
        }
        // 排除掉不带任务/活动属性的纯体验包，统计签到、成长、活动等福利
        const perksRows = gRows.filter(x => {
          const r = String(x.grant_reason || '');
          const n = String(x.name || '');
          return r.includes('签到') || r.includes('成长') || r.includes('活动') || r.includes('裂变') || n.includes('裂变');
        });
        const totalAmt = perksRows.reduce((acc, x) => acc + (Number(x.size || x.amount) || 0), 0);
        cnTotalEl.textContent = '+' + fmt(totalAmt) + ' 积分';
      }catch(e){
        cnTotalEl.textContent = '-';
      }
    }

    const elCat = document.getElementById("catState");
    const elCatDesc = document.getElementById("catDesc");
    if(elCat){
      if(tr.state === 'arrived') {
        elCat.innerHTML = '<span style="color:var(--accent2)">待领奖</span>';
        if(elCatDesc) elCatDesc.textContent = '猫猫旅行 (奖励 +' + (tr.reward_credit || 0) + ' 积分)';
      } else if(tr.state === 'traveling') {
        elCat.innerHTML = '<span style="color:var(--accent)">旅行中</span>';
        if(elCatDesc) elCatDesc.textContent = '猫猫旅行 (预计稍后归来)';
      } else if(tr.daily_limit_reached) {
        elCat.innerHTML = '<span style="color:var(--dim)">今日已完成</span>';
        if(elCatDesc) elCatDesc.textContent = '次日 00:00 刷新';
      } else {
        elCat.innerHTML = '<span style="color:var(--accent2)">在家待命</span>';
        if(elCatDesc) elCatDesc.textContent = '随时可出发旅行';
      }
    }

    const tb = document.querySelector("#growthTable tbody");
    if(!tb) return;
    if(!tasks.length){
      tb.innerHTML = '<tr><td colspan="5" class="empty">暂无任务或未登录国内版账号</td></tr>';
      return;
    }
    tb.innerHTML = tasks.map(t => {
      let stBadge = '<span class="badge">' + esc(t.status) + '</span>';
      if(t.status === 'claimed'){
        stBadge = '<span class="badge off">已领取</span>';
      } else if(t.status === 'completed' || t.current >= t.target){
        stBadge = '<span class="badge ok">待领奖</span>';
      } else if(t.status === 'accepted' || t.status === 'in_progress'){
        stBadge = '<span class="badge s">进行中</span>';
      } else if(t.status === 'not_accepted'){
        stBadge = '<span class="badge">未接取</span>';
      }
      const prog = (t.status === 'claimed' || t.status === 'completed') ? '已达成' : (t.current + ' / ' + t.target);
      const rwd = (t.reward_credit ? ('<b style="color:var(--accent2)">+' + t.reward_credit + '</b> 积分') : '') +
                  (t.reward_energy ? (' <span style="color:var(--accent)">+' + t.reward_energy + ' 能量</span>') : '');
      return '<tr>'
        + '<td data-label="任务"><b>' + esc(t.name) + '</b><br><span class="mono" style="font-size:11px;color:var(--dim)">' + esc(t.task_code) + '</span></td>'
        + '<td style="font-size:12px;color:var(--dim);max-width:300px" data-label="说明">' + esc(t.description || '-') + '</td>'
        + '<td data-label="进度">' + prog + '</td>'
        + '<td data-label="奖励">' + (rwd || '-') + '</td>'
        + '<td data-label="状态">' + stBadge
        + ((t.status !== 'claimed' && (t.status === 'completed' || (Number(t.current) || 0) >= (Number(t.target) || 0)))
           ? ' <button class="sec mini" data-code="' + esc(t.task_code) + '" onclick="claimGrowthTask(this)">领取</button>' : '')
        + '</td>'
        + '</tr>';
    }).join('');
    applyTableSort('growthTable');
  }catch(e){
    console.error('loadGrowthTasks error:', e);
  }
}

async function runGrowthTasks(btn){
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = '任务执行中...';
  const logBox = document.getElementById("taskLogBox");
  if(logBox){
    logBox.style.display = 'block';
    logBox.innerHTML = '<div style="color:var(--accent)">[task_runner] 正在启动全自动任务接取、事件上报与奖励领取流水...</div>';
  }
  try{
    const payload = {};
    if(CURRENT_GROWTH_UID && CURRENT_GROWTH_UID !== 'all'){
      payload.uid = CURRENT_GROWTH_UID;
    }
    const autoClaim = document.getElementById('growthAutoClaim');
    payload.claim = !autoClaim || autoClaim.checked;
    const r = await postJSON("/tasks/run", payload);
    const logs = r.logs || [];
    if(logBox){
      logBox.innerHTML = logs.map(l => '<div>' + esc(l) + '</div>').join('');
      logBox.scrollTop = logBox.scrollHeight;
    }
    await loadAccounts();
    await loadGrowthTasks();
    const sumC = r.credit_added != null ? ('，共增加 +' + r.credit_added + ' 积分') : '';
    toast("成长任务流水执行完成" + sumC + "！");
  }catch(e){
    if(logBox) logBox.innerHTML += '<div style="color:var(--warn)">执行出错: ' + esc(e.message) + '</div>';
    alert("任务执行失败: " + e.message);
  }finally{
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

function saveGrowthAutoClaim(checked){
  try { localStorage.setItem('wb-growth-auto-claim', checked ? '1' : '0'); } catch(e) {}
}

async function claimGrowthTask(btn){
  const code = (btn && btn.dataset && btn.dataset.code) || '';
  const uid = (CURRENT_GROWTH_UID && CURRENT_GROWTH_UID !== 'all') ? CURRENT_GROWTH_UID : '';
  if(!code) return;
  if(!uid){ toast('请先在右上角选择一个国内版账号', 'warn'); return; }
  if(btn) btn.disabled = true;
  try{
    const r = await postJSON('/tasks/claim', {uid, code});
    if(r.ok){
      toast('领取成功' + (r.credit ? ('，+' + r.credit + ' 积分') : ''), 'ok');
    } else {
      toast('领取失败: ' + (r.msg || '未知原因'), 'bad');
    }
    await loadGrowthTasks();
    await loadAccounts();
  }catch(e){
    toast('领取失败: ' + e.message, 'bad');
  }finally{
    if(btn) btn.disabled = false;
  }
}

async function triggerCatTravel(btn){
  if(btn){ btn.disabled = true; btn.textContent = '旅行中...'; }
  try{
    const payload = {};
    if(CURRENT_GROWTH_UID && CURRENT_GROWTH_UID !== 'all'){
      payload.uid = CURRENT_GROWTH_UID;
    }
    const r = await postJSON("/tasks/travel", payload);
    toast(r.msg || (r.ok ? "猫猫旅行结算完成" : "操作失败"), r.ok ? "ok" : "warn");
    await loadAccounts();
    await loadGrowthTasks();
  }catch(e){
    toast("猫猫旅行失败: " + e.message, "bad");
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '猫猫旅行'; }
  }
}

async function triggerBuddyCheckin(btn){
  btn.disabled = true; const ot = btn.textContent; btn.textContent = "签到中...";
  try {
    const payload = {};
    if(CURRENT_GROWTH_UID && CURRENT_GROWTH_UID !== 'all'){
      payload.uid = CURRENT_GROWTH_UID;
    }
    const r = await postJSON("/accounts/checkin", payload);
    const res = r.results || [];
    if(!res.length) toast("未发现国内版账号", "warn");
    else {
      const summary = res.map(x => (x.nickname||x.uid.slice(0,6)) + ": " + (x.ok ? "签到成功 (+100积分)" : (x.error||x.msg))).join("；");
      toast("Buddy 加油站签到: " + summary, res.some(x => x.ok) ? "ok" : "warn");
    }
    await loadAccounts(); await loadGrowthTasks();
  }catch(e){ toast("签到失败: " + e.message, "bad"); }
  finally { btn.disabled = false; btn.textContent = ot; }
}

async function triggerStreakBonus(btn){
  if(btn){ btn.disabled = true; btn.textContent = '执行中...'; }
  try{
    const payload = {};
    if(CURRENT_GROWTH_UID && CURRENT_GROWTH_UID !== 'all'){
      payload.uid = CURRENT_GROWTH_UID;
    }
    const r = await postJSON("/tasks/streak-bonus", payload);
    const msg = r.msg || (r.ok ? "连登管家与抽奖执行完成" : "操作未完成");
    toast(msg, r.ok ? "ok" : "warn");
    await loadAccounts();
    await loadGrowthTasks();
  }catch(e){
    toast("连登管家执行失败: " + e.message, "bad");
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '连登管家与抽奖'; }
  }
}

async function loadSchedulerStatus(){
  try{
    const s = await getJSON("/scheduler");
    const bar = document.getElementById("schedulerBar");
    if(!bar) return;
    const dot = document.getElementById("schedDot");
    const txt = document.getElementById("schedStatusText");
    const times = document.getElementById("schedTimes");
    const btn = document.getElementById("btnToggleSched");
    const btnTrig = document.getElementById("btnTriggerSched");

    if(dot) dot.className = s.enabled ? 'dot' : 'dot off';
    const modeText = (window.VIEW_REALM === 'intl')
      ? (s.mode_intl || '账号 Token 自动保活与凭证常驻 (每日 22:00 集中巡检)')
      : (s.mode_cn || s.mode || '整点排程');
    if(txt) txt.textContent = s.enabled ? ('运行中 · ' + modeText) : '已暂停';
    if(times){
      let line = '上次: ' + (s.last_run_time || '-') + ' · 下次: ' + (s.next_run_time || '-');
      // 待触发的模型额度窗口：探针会在这些时刻到点时自动发请求，看不到就成了黑盒。
      const wins = Array.isArray(s.windows) ? s.windows : [];
      if(wins.length){
        const w = wins[0];
        const left = Math.max(0, Math.round(Number(w.reset_in) || 0));
        const h = Math.floor(left / 3600);
        const m = Math.floor((left % 3600) / 60);
        line += ' · 待触发窗口 ' + wins.length + ' 个，最近: ' + (w.model || '-')
             + '（' + (w.uid8 || '-') + '）' + (h ? h + 'h' : '') + m + 'm 后';
      }
      // 定时主动查询同样要看得见：知道下一次会查哪个模型，比黑盒轮询好。
      const scans = Array.isArray(s.quota_scans) ? s.quota_scans.filter(x => !x.pending) : [];
      if(scans.length){
        const sc = scans[0];
        line += ' · 额度查询 ' + scans.length + ' 条，最近: ' + (sc.model || '-')
             + ' ' + fmtDueSec(sc.due_in) + ' 后';
      }
      times.textContent = line;
    }
    if(btn) btn.textContent = s.enabled ? '暂停调度' : '启用调度';
    if(btnTrig) btnTrig.textContent = '立即巡检保活';
  }catch(e){}
}

async function triggerSchedulerNow(btn){
  if(btn){ btn.disabled = true; btn.textContent = '巡检中...'; }
  try{
    const r = await postJSON("/scheduler/trigger", {});
    toast(r.msg || "已触发巡检保活", "ok");
    setTimeout(loadSchedulerStatus, 2000);
  }catch(e){
    toast("触发失败: " + e.message, "bad");
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = (window.VIEW_REALM === 'intl') ? '立即保活刷新' : '立即巡检保活'; }
  }
}

async function toggleScheduler(btn){
  if(btn){ btn.disabled = true; }
  try{
    const r = await postJSON("/scheduler/toggle", {});
    await loadSchedulerStatus();
    toast("后台调度器已" + (r.enabled ? "启用" : "暂停"), "ok");
  }catch(e){
    toast("切换失败: " + e.message, "bad");
  }finally{
    if(btn){ btn.disabled = false; }
  }
}
function filterRealm(m){
  REALM_FILTER = m;
  document.getElementById("fltAll").className = m === "all" ? "active" : "";
  document.getElementById("fltIntl").className = m === "intl" ? "active" : "";
  document.getElementById("fltCn").className = m === "cn" ? "active" : "";
  renderAccounts();
}
async function doCheckin(btn){
  btn.disabled = true; const ot = btn.textContent; btn.textContent = "签到中...";
  try {
    const r = await postJSON("/accounts/checkin", {});
    const res = r.results || [];
    if(!res.length) toast("未发现国内版账号", "warn");
    else {
      const summary = res.map(x => (x.nickname||x.uid.slice(0,6)) + ": " + (x.ok ? "签到成功" : (x.error||x.msg))).join("；");
      toast("每日签到: " + summary, res.some(x => x.ok) ? "ok" : "warn");
    }
    await refreshActiveRealm(); window.updateUI(); loadAccounts(); loadModels();
  }catch(e){ toast("签到失败: " + e.message, "bad"); }
  finally { btn.disabled = false; btn.textContent = ot; }
}

async function doDailyChat(btn){
  btn.disabled = true; const ot = btn.textContent; btn.textContent = "打卡中...";
  try {
    const r = await postJSON("/accounts/daily-chat", {});
    const res = r.results || [];
    if(!res.length) toast("未发现国际版账号", "warn");
    else {
      const summary = res.map(x => (x.nickname||x.uid.slice(0,6)) + ": " + (x.ok ? "活跃打卡成功" : (x.error||x.msg))).join("；");
      toast("每日活跃: " + summary, res.some(x => x.ok) ? "ok" : "warn");
    }
    await refreshActiveRealm(); window.updateUI(); loadAccounts(); loadModels();
  }catch(e){ toast("打卡失败: " + e.message, "bad"); }
  finally { btn.disabled = false; btn.textContent = ot; }
}

/* 今天还没有活跃打卡记录的国际版账号。判定口径与「今日活跃打卡状态」卡片完全一致
 * （都用 activityStatusOf()），所以卡片上悬停看到的未打卡名单，就是下面按钮要打的那批。 */
function pendingDailyChatAccounts(){
  const all = window.ACCOUNTS || [];
  return all.filter(a => a.realm === 'intl' && taskActive(a)).filter(a => {
    const s = activityStatusOf(a);
    return !(s.kind === 'ok' || s.kind === 'done');
  });
}

// 卡片悬停提示：把未打卡账号逐个列出来，省得去账号页一个个比对。
function pendingDailyChatTip(pending){
  const MAX = 30;
  const lines = pending.slice(0, MAX).map(a => '· ' + (a.nickname || String(a.uid || '').slice(0, 8)));
  if(pending.length > MAX) lines.push('· …');
  return '今日未打卡账号 (' + pending.length + ')：\n' + lines.join('\n');
}

/* 未活跃打卡一键打卡：只对今天还没打过卡的国际版账号补跑，名单交给服务端精确执行。
 * 全部已打卡时直接提示，不发请求——重复打卡不会多给积分，只会白烧账号额度。 */
async function doDailyChatPending(btn){
  const pending = pendingDailyChatAccounts();
  if(!pending.length){ toast("国际版账号今天都已打卡", "ok"); return; }
  btn.disabled = true; const ot = btn.textContent; btn.textContent = "打卡中...";
  try {
    const r = await postJSON("/accounts/daily-chat", {uids: pending.map(a => String(a.uid))});
    const res = r.results || [];
    if(!res.length) toast("未发现待打卡的国际版账号", "warn");
    else {
      const summary = res.map(x => (x.nickname||x.uid.slice(0,6)) + ": " + (x.ok ? "活跃打卡成功" : (x.error||x.msg))).join("；");
      toast("未活跃打卡: " + summary, res.some(x => x.ok) ? "ok" : "warn");
    }
    await refreshActiveRealm(); window.updateUI(); loadAccounts(); loadModels();
  }catch(e){ toast("未活跃打卡失败: " + e.message, "bad"); }
  finally { btn.disabled = false; btn.textContent = ot; }
}

/* 网页通道打卡：只建网页端会话（官方每日活跃只认网页端对话）。
 * 会真的起一次任务，所以先确认一次。 */
async function doDailyChatWeb(btn){
  if(!confirm('将为每个已启用的国际版账号各建一个网页端会话。\n\n这会真的起一次任务，用于计入官方「每日活跃」；活跃走免费模型（0.00x）。继续？')) return;
  btn.disabled = true; const ot = btn.textContent; btn.textContent = "打卡中...";
  try {
    const r = await postJSON("/accounts/daily-chat-web", {});
    const res = r.results || [];
    if(!res.length) toast("未发现国际版账号", "warn");
    else {
      const summary = res.map(x => (x.nickname||x.uid.slice(0,6)) + ": " + (x.ok ? ("已建会话 " + (x.conversation||"")) : (x.error||"失败"))).join("；");
      toast("网页通道打卡: " + summary, res.some(x => x.ok) ? "ok" : "warn");
    }
    await refreshActiveRealm(); window.updateUI(); loadAccounts(); loadModels();
  }catch(e){ toast("网页通道打卡失败: " + e.message, "bad"); }
  finally { btn.disabled = false; btn.textContent = ot; }
}

const fmt = n => (n ?? 0).toLocaleString('en-US');
/* Token 数的紧凑显示：<1 万精确显示（千分位），≥1 万 K，≥100 万 M，≥10 亿 B；
   小数位随量级收缩（123K / 12.3K / 1.23K），尾零去掉。单位用大写 K/M/B，
   与表头排序解析器（cellSortValue 的 'K'/'M'/'G' 换算）同一口径，带单位的
   单元格照样按数值排序。 */
const fmtCompact = n => {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const pick = (div, suffix) => {
    const x = v / div;
    const d = Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 10 ? 1 : 2;
    return x.toFixed(d).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') + suffix;
  };
  if(abs >= 1e9) return pick(1e9, 'B');
  if(abs >= 1e6) return pick(1e6, 'M');
  if(abs >= 1e4) return pick(1e3, 'K');
  return fmt(v);
};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ms = v => v == null ? '—' : (v >= 1000 ? (v/1000).toFixed(2) + ' s' : Math.round(v) + ' ms');
const pct = v => v == null ? '—' : v.toFixed(1) + '%';

/* ---- OpenRouter 价估算（等价 token 花费） ---- */
// 后端按权威定价快照把每条请求的 token 折算成人民币；这里只负责展示，
// 展示货币默认人民币，可切美元（按接口返回的 usd_cny 折算，无需重新请求）。
let costCurrency = 'CNY';
try { if(localStorage.getItem('wb-cost-currency') === 'USD') costCurrency = 'USD'; } catch(e) {}
// 汇率由 /usage、/usage/recent、/usage/analytics 的 usd_cny 字段更新。
let costUsdRate = 7.1;
// 价估算总开关（后端设置 pricing_enabled，默认开）。关掉只是为了省掉算价与
// 渲染开销：价格列与卡片都留在原地，内容显示「—」，观感不变。
let PRICING_ON = true;
function costSymbol(){ return costCurrency === 'USD' ? '$' : '￥'; }
// 小额保留更多小数位，避免 0.00x 被显示成 0.00；与费用估算的展示口径一致。
function fmtCostVal(val, sym){
  const a = Math.abs(val);
  if(a > 0 && a < 0.01) return sym + val.toFixed(4);
  if(a < 1) return sym + val.toFixed(3);
  if(a < 1000) return sym + val.toFixed(2);
  return sym + val.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}
function fmtCost(cny){
  if(cny == null || cny === '') return '—';
  const raw = Number(cny) || 0;
  const n = costCurrency === 'USD' ? raw / (costUsdRate || 1) : raw;
  return fmtCostVal(n, costSymbol());
}
// size 是数值字号（默认 18px，网关页的卡片用）：KPI 卡片窄，调用方可以调小。
// 中间那个「/」跟网关页「次」的处理保持一致：小一号、dim 色、左右各 4px。
// 红/绿用主题变量而不是写死的色值：深色主题下要跟着变，而且旁边
// 「请求成功率」的绿就是 --accent2，两张卡并排时是同一个绿。
function fmtCostBoth(cny, size){
  if(cny == null || cny === '') return '—';
  const raw = Number(cny) || 0;
  const fs = size || 18;
  const sep = Math.max(10, Math.round(fs * 0.6));
  const cnyStr = fmtCostVal(raw, '￥');
  const usdStr = fmtCostVal(raw / (costUsdRate || 7.1), '$');
  return '<span style="color:var(--bad);font-size:' + fs + 'px;font-weight:700">' + cnyStr + '</span> ' +
         '<span style="color:var(--dim);font-weight:500;font-size:' + sep + 'px;margin:0 4px">/</span> ' +
         '<span style="color:var(--accent2);font-size:' + fs + 'px;font-weight:700">' + usdStr + '</span>';
}

// ---- 表头点击排序 ---------------------------------------------------------
// 默认对所有数据表生效：任何带 id 的表都会自动接上，新加一张表不用改这里。例外
// 只有三处登记——SORT_DENY_TABLES（整表不排）、SORT_COL_KINDS（列类型 / 不可排）、
// SORT_PIN_ROWS（表体开头的汇总行）。
//
// 排的是渲染后的 DOM 行，不是回头排数据数组：单元格里已经是最终显示值，按数据重排
// 就得把那些格式化逻辑再抄一遍，两处不同步「看到的值」和「排出来的顺序」就会打架。
//
// 状态放在模块级变量里，所以 5 秒一次的整表重画不会把排序丢掉；没点过任何表头时
// SORT_STATE 里没有条目，各面板原本的默认顺序（多数是服务端顺序）原样保留。
//
// 手型、tooltip、箭头一律运行时挂到 DOM 上，源码标记一个字都不动——积分扣减历史表
// 的表头必须保持裸 <th>，最近请求表 / 禁用表 / 按 Key 表 / 按账号表的行必须保持裸
// <tr>，这几条都有测试写死。

/* 整表不参与排序。默认任何带 id 的表都可排——新加一张表不必改这里。登记进来的
   三条，理由各是：
     recent              最近请求严格按时间倒序，顺序本身就是要看的信息
     desktopScanBody     桌面扫描结果按「有效 / 无效 / 需要 Key」分组，跨组排序会打散分组
     creditsModalContent 套餐权益包明细，已经有 #cmPkgSort 下拉（含「最快到期优先」这类语义排序） */
const SORT_DENY_TABLES = new Set(['recent', 'desktopScanBody', 'creditsModalContent']);

/* 列类型的显式登记。默认按单元格内容推断（见 inferColKind），登记过的表按登记
   的来——「进度 4 / 10」「剩余 42 / 50 积分」「首字延迟 1.89 s (P50 1.90 s)」
   这类复合单元格只取其中一个数字是错的，得点名。

   下标 = 表头列序号。'num' 取单元格里的数字，'text' 按文本比，null = 该列不排
   （下拉框、按钮、拼给人看的标签串）。 */
const SORT_COL_KINDS = {
  modelsTable:      ['text', 'text', 'num', 'text', 'num', 'num', 'text', 'text'],
  growthTable:      ['text', 'text', 'num', 'num', 'text'],
  // 时间列是 ISO 串，字典序就是时间序，不必另给排序值。
  creditHistoryTable: ['text', 'text', 'text', 'num', 'num'],
  // 这两张表的时间列显示的是 MM-DD HH:MM，跨年字典序就错了，排序值由 render
  // 挂 data-sort 单独给（见 renderRemainingUsage / renderCreditGrants）。
  remainingUsageTable: ['text', 'text', 'text', 'text', 'num', 'num', 'num'],
  creditGrantsTable:   ['text', 'text', 'text', 'text', 'text', 'num', 'num', 'text', 'text'],
  analyticsAccountTable: ['text', 'text', 'num', 'num', 'num', 'num', null, 'num'],
  analyticsKeyTable: ['text', 'text', 'num', 'num', 'num', 'num', 'num', null],
  perfMatrix:       ['text', 'text', 'text', 'num', 'num', 'num', 'num', 'num',
                     'num', 'num', 'num', 'num', 'num'],
  accounts:         ['text', 'text', 'text', null, 'num', 'num', 'num', 'num', null],
  // 名称 / 代理地址是 <input>（textContent 恒为空串，按它排等于没排）、启用是复选框、
  // 操作是按钮列——登记成 null，别让表头挂上一个点了没反应的箭头。
  slotList:         [null, null, 'text', null, 'num', null],
  disabledList:     ['text', 'text', 'text', 'text', 'text', 'text'],
};
/* 表体开头有几行是汇总行、不是数据行：矩阵面板的「全部模型合计」钉在表体第一行，
   它跟着表头走，不参与排序。 */
const SORT_PIN_ROWS = {perfMatrix: 1};
const SORT_STATE = {};
const SORT_HINT = '按此列排序（再点一次反向）';
/* 可排但当前没在排的列挂这个双向箭头——光靠手型和 tooltip 声明不了「这一列能排」，
   截图里看不见、触屏上也没有 hover。它是「能排」的常驻声明，▼ / ▲ 是「正在按这一列
   排」的状态，两者互斥。 */
const SORT_ARROW_IDLE = '⇅';
const SORT_KEY_PREFIX = 'wb-sort-';

/* 刷新后接着上次的选择排（键名照 wb-theme 的习惯）。读回来的列序号可能对不上
   表头——列增减、顺序调整都会让同一个序号指向别的字段，所以越界或那一列已经
   不可排就整条丢弃，退回该面板原本的默认顺序。

   遍历 localStorage 的键而不是 SORT_COL_KINDS：没登记过的表也存过选择，那些
   要一起恢复（列序号等 applyTableSort 推断出列类型时再校验）。 */
try {
  for(const key of Object.keys(localStorage)){
    if(key.indexOf(SORT_KEY_PREFIX) !== 0) continue;
    const id = key.slice(SORT_KEY_PREFIX.length);
    if(SORT_DENY_TABLES.has(id)) continue;
    const m = /^(\d+):(asc|desc)$/.exec(localStorage.getItem(key) || '');
    if(!m) continue;
    const col = Number(m[1]);
    const spec = SORT_COL_KINDS[id];
    if(spec && !spec[col]) continue;   // 登记过的表：越界或该列本就不排
    SORT_STATE[id] = {col: col, dir: m[2]};
  }
} catch(e) {}

/* 一个单元格的排序取值。返回 {text, forced}：forced 表示这个值是 data-sort 给的，
   不是显示出来的那个——那是给「显示的不是能排序的那个数」的列用的：剩余用量估算与
   积分获取历史的时间列显示 MM-DD HH:MM，跨年字典序就错，排序要的是 ISO 串。 */
function cellRaw(cell){
  const forced = cell.getAttribute ? cell.getAttribute('data-sort') : null;
  if(forced != null && forced !== '') return {text: String(forced), forced: true};
  return {text: String(cell.textContent == null ? '' : cell.textContent).trim(), forced: false};
}

/* 单元格取值。数字列忽略千分位、货币符号和百分号，并换算单位——否则「950 ms」和
   「4.01 s」会按 950 > 4.01 排反。量级单位只认大写 K/M/G：小写 m 在界面上是
   「分钟」（fmtLeft 的 29m），当成百万去缩放会把冷却时间排得乱七八糟。取不到数的
   格（「—」「-」「未查询」）返回 null，恒沉底，不随升降序翻转。 */
function cellSortValue(cell, kind){
  if(!cell) return null;
  const raw = cellRaw(cell);
  const text = raw.text;
  if(kind === 'text') return text || null;
  // data-sort 给的已经是排序用的那个值，不再做千分位 / 单位解析。
  if(raw.forced){
    const n = Number(text);
    return isFinite(n) ? n : null;
  }
  const m = text.match(/(-?\d[\d,]*(?:\.\d+)?)\s*([A-Za-z%]*)/);
  if(!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if(!isFinite(n)) return null;
  switch(m[2]){
    case 's': return n * 1000;   // 换算到毫秒，好跟同一列里的 ms 比
    case 'K': return n * 1e3;
    case 'M': return n * 1e6;
    case 'G': return n * 1e9;
    case 'B': return n * 1e9;   // fmtCompact 用 B 表示十亿，别让那一格按 1.5 排序
    default: return n;           // ms / % / 空 / 其它后缀（tok/s 之类）一律原值
  }
}

/* 整格就是一个「数字 + 可选单位」才算数字格。锚定整串而不是「搜到数字就算」：
   「glm-5.3」「10-09 16:19」里也有数字，但那两列该按文本排。 */
const SORT_NUM_CELL = /^[\s￥$]*(-?\d[\d,]*(?:\.\d+)?)\s*([A-Za-z%/]*)$/;
/* 取不到值的占位格，不参与整列的类型判断。 */
const SORT_BLANK_CELL = /^(—|-|–|未查询|无调用|无)$/;
/* 单元格里是交互控件的列不排：「出口」是下拉框、「操作」是按钮，拿它们的文字比
   大小没有意义。放在推断里而不是逐表登记，新表也能自动免掉这类列。 */
const SORT_WIDGET_SEL = 'select,button,input,textarea,a';

/* 整列的类型：'num' / 'text' / null（不可排）。只要有一个格按文本看，整列就按文本
   排——同一列里一半数字一半文本，混着比会乱。 */
function inferColKind(rows, col){
  let sawNum = false;
  for(const r of rows){
    const cell = r.children[col];
    if(!cell) continue;
    if(cell.querySelector && cell.querySelector(SORT_WIDGET_SEL)) return null;
    const text = cellRaw(cell).text;
    if(!text || SORT_BLANK_CELL.test(text)) continue;
    if(SORT_NUM_CELL.test(text)) sawNum = true;
    else return 'text';
  }
  return sawNum ? 'num' : null;
}

/* 一列的可排性与类型：登记过的表查表，没登记的按内容推断。 */
function colKind(id, i, rows, nCols){
  const spec = SORT_COL_KINDS[id];
  /* 登记表的列数与实际表头对不上时（上游加了一列或删了一列）不硬套登记——硬套
     会让每个序号都指向错的列，排出来的顺序看着对、其实全错。退回按内容推断：
     某一列可能排得不如登记时准，但不会错位。 */
  if(spec && spec.length === nCols) return spec[i] || null;
  return inferColKind(rows, i);
}

/* 按当前选中的列重排表体。返回各列的类型（给账号表分页记下全量口径用）。 */
function applyTableSort(id, rootEl){
  if(SORT_DENY_TABLES.has(id)) return;
  // rootEl：账号表分页时先在一个游离节点里把全部账号排好再切页（见 renderAccounts），
  // 那张表不在文档里，按 id 取不到。
  const root = rootEl || document.getElementById(id);
  const table = !root ? null
    : (root.tagName === 'TABLE' ? root : root.querySelector('table'));
  if(!table) return;
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  // 没有表头表体的不是数据表（KV 列表、纯布局表），不接。
  if(!thead || !tbody) return;
  // 把「表 → 登记项」接上，委托的点击监听才知道点的是哪张表。运行时挂，不进标记。
  table.setAttribute('data-sort-id', id);
  const rows = Array.from(tbody.children).filter(r => r.tagName === 'TR');
  const pinN = SORT_PIN_ROWS[id] || 0;
  /* 续行（账号表里 cool-row 的冷却 / 达限胶囊）是上一行的附注，不是独立数据行：
     只排 accountRow 会把胶囊留在原地，排完就是「账号 账号 胶囊 胶囊」——胶囊跟
     的不是它自己那行账号。按「行 + 它的续行」成组排，整块一起走。 */
  const isCont = r => !!(r.classList && r.classList.contains('cool-row'));
  const units = [];
  for(const r of rows){
    if(units.length && isCont(r)) units[units.length - 1].extras.push(r);
    else units.push({row: r, extras: []});
  }
  const body = units.slice(pinN).map(u => u.row);
  const ths = Array.from(thead.querySelectorAll('th'));
  /* 账号表分页且有表头排序时，全量已在 renderAccounts 里排好、这一页只是切片：
     页内只挂表头装饰、不重排，列类型沿用全量推断的那份——只看这 50 行推断，
     某列这一页全是「—」就会被判成不可排，箭头被摘、顺序也可能跟全量对不上。 */
  const fixedKinds = (id === 'accounts' && !rootEl) ? ACCT_FIXED_KINDS : null;
  const kinds = (fixedKinds && fixedKinds.length === ths.length)
    ? fixedKinds : ths.map((th, i) => colKind(id, i, body, ths.length));
  const st = SORT_STATE[id] || null;
  ths.forEach((th, i) => {
    const kind = kinds[i];
    const active = !!(kind && st && st.col === i);
    if(!kind){
      /* 这一列不可排（登记成 null，或者推断出来整列没有可比内容）。把上一轮可能
         挂过的装饰摘干净——否则某一列的数据变空之后，表头还留着旧的手型和箭头，
         点上去没反应。 */
      th.classList.remove('sortable');
      th.removeAttribute('title');
      th.removeAttribute('tabindex');
      th.removeAttribute('aria-sort');
      const dead = th.querySelector('.sort-arrow');
      if(dead && dead.remove) dead.remove();
      return;
    }
    th.classList.add('sortable');
    /* tooltip 只补一次：i18n 会把它换成译文（title 在 ATTRS 里），每轮重写成中文
       会让它再翻一遍——英文 / 繁中界面下每 5 秒白跑一轮翻译。 */
    if(!th.title) th.title = SORT_HINT;
    // 可 Tab 聚焦，回车 / 空格触发（见下面那条 keydown 委托）。
    th.setAttribute('tabindex', '0');
    th.setAttribute('aria-sort', active ? (st.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    /* 箭头只在真要变的时候动 DOM：这个函数每轮轮询都会跑一遍，白改一次就会多
       触发一轮 i18n 的 MutationObserver 重扫。 */
    const old = th.querySelector('.sort-arrow');
    const want = active ? (st.dir === 'asc' ? '▲' : '▼') : SORT_ARROW_IDLE;
    const cls = 'sort-arrow' + (active ? '' : ' idle');
    if(old){
      if(old.textContent !== want) old.textContent = want;
      if(old.className !== cls) old.className = cls;
    }else{
      // 前面不留空格：箭头是绝对定位的，不参与行内排版，留一个空格只会变成表头
      // 文本末尾的一个多余空白（读屏和复制表头时会带上）。
      th.insertAdjacentHTML('beforeend',
        '<span class="' + cls + '" aria-hidden="true">' + want + '</span>');
    }
  });
  if(fixedKinds || !st || !kinds[st.col]) return kinds;
  const kind = kinds[st.col];
  const dir = st.dir === 'asc' ? 1 : -1;
  const sorted = units.slice(pinN)
    .map((u, i) => [cellSortValue(u.row.children[st.col], kind), i, u])
    .sort((a, b) => {
      const av = a[0], bv = b[0];
      if(av == null || bv == null){
        if(av == null && bv == null) return a[1] - b[1];
        return av == null ? 1 : -1;   // 缺值的行沉底，两个方向都一样
      }
      const c = (typeof av === 'number' && typeof bv === 'number')
        ? av - bv : String(av).localeCompare(String(bv), 'zh-Hans-CN', {numeric: true});
      return c ? c * dir : a[1] - b[1];   // 同值保持原序，表不会自己抖
    })
    .map(t => t[2]);
  const ordered = units.slice(0, pinN).concat(sorted)
    .reduce((acc, u) => acc.concat([u.row], u.extras), []);
  /* 顺序没变就别碰 DOM：每一轮轮询都会走这里，白挪一遍行没有任何收益，只会多触发
     一轮 i18n 的 MutationObserver 重扫。 */
  if(ordered.some((r, i) => rows[i] !== r)){
    // appendChild 对已在册的子节点是「移动」，所以这一遍就把顺序定下来了。
    ordered.forEach(r => tbody.appendChild(r));
  }
  return kinds;
}

/* 扫一遍页面上所有数据表，把排序接上。挂在每 5 秒那条轮询上，新加一张表只要带
   id 就自动可排——不必在它的 render 函数里再写一行 applyTableSort。

   「带 id」这条把非数据表挡在外面：设置页的护栏表单、运行信息 / 其他客户端的 KV
   列表都没有 id（它们本来也不是能按列比大小的东西）。 */
function applyAllTableSorts(){
  if(!document.querySelectorAll) return;
  Array.from(document.querySelectorAll('table')).forEach(t => {
    const id = sortTableId(t);
    if(id) applyTableSort(id);
  });
}

/* 表的 id：自己带就用自己，否则找最近带 id 的祖先——最近请求、账号列表这些表是
   innerHTML 生成的，id 在包着它们的容器上。

   页面容器（.main-page）不算：那是「这一页」的 id，不是「这张表」的 id，拿它当
   表 id 会把设置页的护栏表单、智能体页的表格一起误认成数据表。都没有就不接。 */
function sortTableId(table){
  let el = table;
  while(el && el !== document.body){
    if(el.id && !(el.classList && el.classList.contains('main-page'))) return el.id;
    el = el.parentElement || el.parentNode;
  }
  return '';
}

/* 同一列再点一次翻转方向；换一列一律从降序开始——「最大的排最上面」是这些表
   最常用的读法。 */
function toggleTableSort(id, col){
  if(SORT_DENY_TABLES.has(id)) return;
  const st = SORT_STATE[id];
  if(st && st.col === col) st.dir = st.dir === 'desc' ? 'asc' : 'desc';
  else SORT_STATE[id] = {col: col, dir: 'desc'};
  try { localStorage.setItem(SORT_KEY_PREFIX + id, col + ':' + SORT_STATE[id].dir); } catch(e) {}
  // 账号表是分页的：只重排 DOM 只能排当前这一页。改成整表重画（全部账号先排序
  // 再切页），并回到第一页。
  if(id === 'accounts' && typeof renderAccounts === 'function'){
    ACCT_PAGE = 1;
    renderAccounts();
    return;
  }
  applyTableSort(id);
}

/* 点击与键盘两条委托都从这里问「点到 / 按到的是哪张表的哪一列」。表是每 5 秒整体
   重画的，逐个头挂监听就得跟着重挂，所以委托到 document。只认挂过 sortable 的表头
   ——不可排的列（下拉框、按钮、标签串）没挂，点了没反应。 */
function sortHeaderAt(e){
  const th = e.target && e.target.closest ? e.target.closest('th') : null;
  if(!th || !th.parentNode) return null;
  if(!th.classList || !th.classList.contains('sortable')) return null;
  const table = th.closest('table');
  const id = table && table.getAttribute ? table.getAttribute('data-sort-id') : null;
  if(!id) return null;
  const col = Array.from(th.parentNode.children).indexOf(th);
  return col < 0 ? null : {id: id, col: col};
}

document.addEventListener('click', e => {
  const hit = sortHeaderAt(e);
  if(hit) toggleTableSort(hit.id, hit.col);
});

/* 键盘走同一条路。空格在浏览器里默认是滚动页面，所以只在表头上吃掉它。 */
document.addEventListener('keydown', e => {
  if(e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
  const hit = sortHeaderAt(e);
  if(!hit) return;
  e.preventDefault();
  toggleTableSort(hit.id, hit.col);
});

function setCostCurrency(cur){
  costCurrency = (cur === 'USD') ? 'USD' : 'CNY';
  try { localStorage.setItem('wb-cost-currency', costCurrency); } catch(e) {}
  renderCostToggle();
  // 已经渲染出来的表格/卡片就地换算重画，不必等下一轮轮询。
  if(typeof refreshAllCostViews === 'function') refreshAllCostViews();
}
// 悬停里说清这个数是怎么来的：哪条定价策略算的、三档单价多少、落在哪个条件
// 档、这条价是怎么匹配到 OpenRouter 条目的、是不是补算。
//
// 用自绘气泡而不是原生 title：单价要按列对齐才好读，而且原生 tooltip 由浏览器
// 绘制，截图验收时根本截不到。内容全部来自 /usage/recent 每行自带的 cost_* 字
// 段，前端一个价都不重算。
const COST_VIA_TEXT = {
  direct: '直接匹配（归一化同名且唯一命中）',
  override: '人工映射表 OVERRIDES',
  variant: '变体后缀继承'
};
// 变体继承剥掉的后缀：基准名是原始名去掉尾部一段（剥的是后缀，留下的基准名
// 就成了前缀），差值就是被剥的那截。
function costVariantSuffix(r){
  const base = r.cost_inherited_from;
  const name = String(r.model || '');
  return (base && name.length > base.length && name.slice(0, base.length) === base)
    ? name.slice(base.length) : '';
}
// 每百万 token 的美元原价：按原样显示，不折算、不补齐。
function fmtRate(v){
  if(v == null || v === '') return '—';
  const n = Number(v);
  if(!isFinite(n)) return '—';
  return n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 6});
}
function costUnitLabel(r){
  const n = Number(r.cost_unit);
  return (isFinite(n) && n > 0) ? fmt(n) + ' token' : '百万 token';
}
// 气泡的结构化内容：{lines: 纯文字行, rates: 三档单价, notes: 补充说明}。
// 文本与 HTML 两种渲染共用这一份，口径不会两处走样。
function costTipModel(r){
  if(!r || r.cost_cny == null){
    return {lines: [], rates: [], notes: ['该模型暂无定价数据']};
  }
  const sym = (r.cost_currency === 'CNY') ? '￥' : '$';
  const lines = [];
  if(r.cost_source === 'builtin'){
    lines.push('定价依据：出厂快照（还没有取到策略）');
  } else if(r.cost_source){
    lines.push('定价策略：' + r.cost_source
      + (r.cost_source_at ? '（' + new Date(r.cost_source_at * 1000).toLocaleString() + ' 首次取到）' : ''));
  }
  const via = r.cost_via || 'direct';
  if(via === 'override'){
    lines.push('匹配来源：' + COST_VIA_TEXT.override
      + (r.cost_via_derived ? '（策略早于该字段，按当前映射表推断）' : '')
      + '：' + (r.cost_override_from || r.model) + ' → ' + (r.cost_or_id || '—'));
  } else if(via === 'variant'){
    const cut = costVariantSuffix(r);
    lines.push('匹配来源：' + COST_VIA_TEXT.variant + '：' + r.model
      + ' → ' + (r.cost_inherited_from || '—') + '（基准） → ' + (r.cost_or_id || '—'));
    if(cut) lines.push('剥掉的后缀：' + cut);
  } else {
    lines.push('匹配来源：' + COST_VIA_TEXT.direct + '：' + (r.cost_or_id || '—'));
  }
  const rates = r.cost_rates || {};
  const hit = rates.input_cache_hit;
  const rows = [
    {k: '输入（缓存未命中）', v: sym + fmtRate(rates.input_cache_miss)},
    {k: '输入（缓存命中）', v: hit == null ? '未公布，按未命中价计' : sym + fmtRate(hit)},
    {k: '输出', v: sym + fmtRate(rates.output)}
  ];
  const notes = [];
  if(r.cost_usd_cny != null){
    notes.push('汇率：1 USD = ' + fmtRate(r.cost_usd_cny) + ' CNY（策略记录的汇率，'
      + '上面的美元单价按它折算成人民币）');
  }
  if(r.cost_band != null){
    notes.push('条件档位：第 ' + (r.cost_band + 1) + ' 档'
      + (r.cost_band_note ? ' · ' + r.cost_band_note : '') + '，本行按该档单价计');
  }
  if(r.cost_backfilled){
    notes.push('补算：这条请求发生在该策略取到之前，用之后第一次取到的价补算');
  }
  return {lines: lines, rates: rows, notes: notes};
}
// 纯文本版（多行），给无气泡的场合与单元测试用。
function costTitle(r){
  const m = costTipModel(r);
  const out = ['按 OpenRouter 公布的模型价折算的等价 token 花费'];
  out.push.apply(out, m.lines);
  if(m.rates.length){
    out.push('单价（USD / ' + costUnitLabel(r) + '，OpenRouter 原始价，未折算）');
    m.rates.forEach(row => out.push('　' + row.k + '：' + row.v));
  }
  out.push.apply(out, m.notes);
  return out.join('\n');
}
function costTipHtml(r){
  const m = costTipModel(r);
  if(!m.rates.length && !m.lines.length){
    return '<div class="ct-note">' + esc(m.notes.join('')) + '</div>';
  }
  let html = '<div class="ct-h">按 OpenRouter 公布的模型价折算的等价 token 花费</div>';
  m.lines.forEach(line => {
    html += '<div class="ct-line">' + esc(line) + '</div>';
  });
  html += '<div class="ct-sep"></div>'
    + '<div class="ct-h">单价 · USD / ' + esc(costUnitLabel(r)) + ' · 原始价，未折算</div>';
  m.rates.forEach(row => {
    html += '<div class="ct-row"><span class="ct-k">' + esc(row.k)
      + '</span><span class="ct-v">' + esc(row.v) + '</span></div>';
  });
  m.notes.forEach(note => {
    html += '<div class="ct-note">' + esc(note) + '</div>';
  });
  return html;
}
// 气泡只此一个，挂在 body 上；行数据按本次渲染的 key 索引，重画后按 key 复位。
let COST_TIP_EL = null;
let COST_TIP_KEY = null;
const COST_TIP_ROWS = new Map();
function costRowKey(r, i){
  return [r.at, r.model, r.account, r.prompt_tokens, r.completion_tokens,
          r.cached_tokens, r.elapsed_ms, i].join('|');
}
function costTipEl(){
  if(!COST_TIP_EL){
    COST_TIP_EL = document.createElement('div');
    COST_TIP_EL.id = 'costTip';
    document.body.appendChild(COST_TIP_EL);
  }
  return COST_TIP_EL;
}
function hideCostTip(){
  COST_TIP_KEY = null;
  if(COST_TIP_EL) COST_TIP_EL.style.display = 'none';
}
function showCostTip(cell, r){
  const el = costTipEl();
  el.innerHTML = costTipHtml(r);
  el.style.display = 'block';
  const box = cell.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  // 贴着列尾右对齐，越界就往回收；放不下就翻到单元格下面。
  let left = Math.max(8, Math.min(box.right - w, window.innerWidth - w - 8));
  let top = box.top - h - 8;
  if(top < 8) top = Math.min(box.bottom + 8, window.innerHeight - h - 8);
  el.style.left = left + 'px';
  el.style.top = Math.max(8, top) + 'px';
}
// 表格每 5 秒整体重画一次，重画后把气泡复位到同一行，别让它悬在旧位置。
function reanchorCostTip(){
  if(!COST_TIP_KEY) return;
  const cells = document.querySelectorAll('[data-cost-key]');
  for(let i = 0; i < cells.length; i++){
    if(cells[i].getAttribute('data-cost-key') === COST_TIP_KEY){
      const r = COST_TIP_ROWS.get(COST_TIP_KEY);
      if(r){ showCostTip(cells[i], r); return; }
    }
  }
  hideCostTip();
}
document.addEventListener('mouseover', e => {
  const cell = e.target && e.target.closest ? e.target.closest('[data-cost-key]') : null;
  if(!cell) return;
  const key = cell.getAttribute('data-cost-key');
  if(!key || key === COST_TIP_KEY) return;
  const r = COST_TIP_ROWS.get(key);
  if(!r) return;
  COST_TIP_KEY = key;
  showCostTip(cell, r);
});
document.addEventListener('mouseout', e => {
  const cell = e.target && e.target.closest ? e.target.closest('[data-cost-key]') : null;
  if(!cell) return;
  if(e.relatedTarget && cell.contains(e.relatedTarget)) return;
  hideCostTip();
});
function renderCostToggle(){
  document.querySelectorAll('.cost-toggle').forEach(el => {
    el.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.cur === costCurrency);
    });
  });
}
// CNY/USD 二选一的切换按钮组；用于费用卡片与表格标题区。
function costToggleHtml(){
  return '<span class="cost-toggle" style="display:inline-flex;gap:4px">'
    + '<button type="button" class="range-btn' + (costCurrency === 'CNY' ? ' active' : '') + '" data-cur="CNY" onclick="setCostCurrency(\'CNY\')">￥ 人民币</button>'
    + '<button type="button" class="range-btn' + (costCurrency === 'USD' ? ' active' : '') + '" data-cur="USD" onclick="setCostCurrency(\'USD\')">$ 美元</button>'
    + '</span>';
}
// 输入 / 输出 / 思考 三个数字，各自一色，斜杠分隔。思考为 0 也写出来，
// 列的形状因此固定，不会因某个模型不推理就缩短。
const tripleTokens = (inp, out, think) =>
  '<span style="color:var(--accent)">' + fmt(inp || 0) + '</span>' +
  ' <span style="color:var(--dim-light)">/</span> ' +
  '<span style="color:var(--accent2)">' + fmt(out || 0) + '</span>' +
  ' <span style="color:var(--dim-light)">/</span> ' +
  '<span style="color:var(--think)">' + fmt(think || 0) + '</span>';

function perfRow(label, b, unit, fmtFn, color){
  if(!b) return '<tr><td>' + label + '</td><td colspan="5" style="color:var(--dim)">暂无数据</td></tr>';
  const f = fmtFn || (v => v);
  const dot = color ? ' <i style="display:inline-block;width:7px;height:7px;border-radius:2px;background:' + color + ';margin-left:6px"></i>' : '';
  return '<tr><td>' + label + dot + '</td>'
    + '<td><b>' + f(b.avg) + '</b>' + unit + '</td>'
    + '<td>' + f(b.p50) + unit + '</td>'
    + '<td>' + f(b.p90) + unit + '</td>'
    + '<td>' + f(b.p99) + unit + '</td>'
    + '<td style="color:var(--dim)">' + b.samples + ' 次</td></tr>';
}

function card(k, v, sub, cls){
  return '<div class="card ' + (cls||'') + '"><div class="k">' + k + '</div>'
    + '<div class="v">' + v + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';
}

/* ---- api key handling ---- */
const KEY_STORE = 'wb-proxy-api-key';
// PANEL_STORE 在 <head> 里定义（首帧判定要用它），这里不再重复声明。
let API_KEY = '';
let PANEL_TOKEN = '';
let PANEL_REMEMBER = false;
try { PANEL_TOKEN = sessionStorage.getItem(PANEL_STORE) || ''; } catch(e) {}
try { PANEL_TOKEN = PANEL_TOKEN || localStorage.getItem(PANEL_STORE) || ''; } catch(e) {}
try { PANEL_REMEMBER = localStorage.getItem(PANEL_REMEMBER_KEY) === '1'; } catch(e) {}
let PANEL_STATUS = {};
(function initKey(){
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('key');
    if(fromUrl){
      API_KEY = fromUrl.trim();
      localStorage.setItem(KEY_STORE, API_KEY);
      // Drop the key from the address bar, but keep any other parameters:
      // this used to clear the whole query string, which also discarded a
      // ?tab= the user had been given.
      const rest = new URLSearchParams(window.location.search);
      rest.delete('key');
      const qs = rest.toString();
      history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
    } else {
      API_KEY = (localStorage.getItem(KEY_STORE) || '').trim();
    }
  } catch(e){ API_KEY = ''; }
})();

// A key with non-ASCII characters cannot go into an HTTP header at all: fetch
// throws "String contains non ISO-8859-1 code point" before the request is
// sent. Such a value is never a real gateway key, so drop it and let the panel
// session carry the request.
function usableKey(value){
  return value && /^[\x20-\x7e]+$/.test(value) ? value : '';
}

function authHeaders(base){
  const h = Object.assign({}, base || {});
  const key = usableKey(API_KEY);
  if(key) h['Authorization'] = 'Bearer ' + key;
  if(PANEL_TOKEN) h['X-Panel-Token'] = PANEL_TOKEN;
  return h;
}

// 同一 URL 的在飞请求只保留一份（单飞）。5 秒轮询、手动切页/切窗口、可见性回调
// 叠在一起时，同一个 URL 会同时发出好几份完全相同的请求：冷窗口的 /usage 扫描
// 要十几秒，这几份就全在服务端重跑一遍聚合，还占着浏览器的连接池，把后面的
// /accounts、/scheduler 一起堵住——"切窗口后面板像死了"有一半是这里自己放大的。
// 登记表按 URL 键控，后来者直接等第一份的结果；请求落定（无论成败）就摘掉登记项，
// 下一次轮询照常发新请求，所以不会把"每次都要新数据"的语义变成缓存。
const GETJSON_INFLIGHT = new Map();
// 挂死保护：网络层僵住时 fetch 可能永远不落定，登记项会一直占着这个 URL，之后
// 每一轮轮询都陪它一起等。超过这个时长就把登记项视为已死，放行新请求。
const GETJSON_STALE_MS = 60000;
// ---- 顶栏：运行日志窗口 + 关闭服务 ------------------------------------
// 「眼睛」按钮在新窗口打开运行日志页：服务端不 spawn 任何进程，Windows /
// macOS / 容器走同一条路（#427）。关闭服务不能凭一次 postJSON 的成败就宣布
// 成功——容器或守护进程可能把进程重新拉起，所以要用 /health 复核（#426）。
let GATEWAY_DOWN = false;

function toggleConsoleWindow(){
  let win = null;
  try{ win = window.open('/dashboard?tab=logs', 'wb-logs', 'width=1000,height=640'); }catch(e){}
  if(!win){ toast('浏览器拦截了新窗口，请允许弹窗后重试', 'bad'); return; }
  try{ win.focus(); }catch(e){}
  toast('已在新窗口打开运行日志', 'ok');
}

async function shutdownGateway(opts){
  if(!confirm('确定关闭网关服务？进程会退出，需要重新运行启动脚本才能再次使用。')) return;
  const pollMs = (opts && opts.pollMs) || 600;
  const tries = (opts && opts.tries) || 10;
  let sent = false;
  try{ await postJSON('/shutdown', {}); sent = true; }
  catch(e){
    if(String(e.message) === 'unauthorized'){
      toast('面板会话已失效，请重新登录后再关闭服务', 'bad');
      return;
    }
    // 进程退出会掐断连接（Failed to fetch / 空响应），真正死没死看 /health。
  }
  for(let i = 0; i < tries; i++){
    await new Promise(function(resolve){ setTimeout(resolve, pollMs); });
    let alive = false;
    try{
      const res = await fetch('/health', {cache: 'no-store'});
      alive = !!res.ok;
    }catch(e){ alive = false; }
    if(!alive) break;
    if(i === tries - 1){
      toast(sent
        ? '停止请求已发送，但服务仍在运行：可能由容器或守护进程自动拉起'
        : '关闭请求失败：服务仍在运行', sent ? 'warn' : 'bad');
      return;
    }
  }
  GATEWAY_DOWN = true;
  toast('网关服务已关闭，需重新运行启动脚本才能恢复', 'warn');
  const dot = document.getElementById('statusDot');
  if(dot) dot.style.background = 'var(--bad)';
  const t = document.getElementById('btnConsoleToggle');
  if(t) t.disabled = true;
  const s = document.getElementById('btnGatewayShutdown');
  if(s) s.disabled = true;
}
async function getJSON(url, opts){
  // 服务已关闭：所有轮询静默挂起，不再发请求（见 shutdownGateway）。
  if(GATEWAY_DOWN) return new Promise(function(){});
  // cache 模式分两档，按"响应体在服务端是否有一份 TTL 缓存"来选：
  //
  //  - 默认 no-store：不落盘、每次整份重取。登录轮询（/accounts/login/poll）、
  //    密钥类读取（/settings/reveal）以及任何"写完之后立刻回读"都必须走这档。
  //  - opts.revalidate（见 POLL_READ）：允许浏览器存一份、每次使用前回源校验。
  //    用量那几个读接口在服务端带 _STATS_TTL 缓存，同一份缓存期间响应体逐字节
  //    不变，服务端会发 ETag + Cache-Control: no-cache。no-cache 的语义正是
  //    "可以存、每次使用前必须回源校验"，于是浏览器自动带上 If-None-Match：
  //    数字没变就只回一个 304（无 body），省下 10~100KB 的重复传输。
  //    这里绝不能写 no-store——那会让浏览器连副本都不存，条件请求无从谈起，
  //    服务端的 ETag 也就永远用不上。
  const cache = (opts && opts.revalidate) ? 'no-cache' : 'no-store';
  // 键里带上 cache 档位：同一 URL 若一处走可校验、一处走 no-store，两者语义不同
  // （前者允许浏览器回 304 复用副本），合并会让其中一方悄悄拿到不该拿的副本。
  const key = cache + ' ' + url;
  const hit = GETJSON_INFLIGHT.get(key);
  if(hit && (Date.now() - hit.at) < GETJSON_STALE_MS) return hit.p;
  const run = async () => {
    const r = await fetch(url, {cache: cache, headers: authHeaders()});
    if(r.status === 401 || r.status === 403){ panelSessionLost(); throw new Error('unauthorized'); }
    if(!r.ok) throw new Error(r.status);
    return r.json();
  };
  // 落定即摘除；只摘自己那一份，别误删后来顶替的登记项（上面超时换新时会顶替）。
  const entry = {p: null, at: Date.now()};
  entry.p = run().finally(() => { if(GETJSON_INFLIGHT.get(key) === entry) GETJSON_INFLIGHT.delete(key); });
  GETJSON_INFLIGHT.set(key, entry);
  return entry.p;
}
// 轮询读取的 fetch 选项：这些接口的响应体由服务端的 TTL 缓存决定，同一份缓存
// 期间不变，所以可以让浏览器存一份、每次回源校验（服务端 ETag 命中即 304）。
// 只有真的会被轮询、且服务端确实发 ETag 的只读接口才用它；其余读取保持默认的
// no-store，免得"顺手加上"之后把必须每次都新的响应也变成可缓存校验的。
const POLL_READ = {revalidate: true};
async function postJSON(url, body){
  if(GATEWAY_DOWN) throw new Error('服务已关闭');
  const r = await fetch(url, {method:'POST', headers: authHeaders({'Content-Type':'application/json'}),
                              body: JSON.stringify(body || {})});
  const t = await r.text();
  let parsed = {};
  try { parsed = t ? JSON.parse(t) : {}; } catch(e) { parsed = {raw: t}; }
  if(r.status === 401 || r.status === 403){ panelSessionLost(); throw new Error('unauthorized'); }
  if(!r.ok) throw new Error((parsed.error && parsed.error.message) || r.status);
  return parsed;
}
function toast(msg, kind){
  console.log('[wb]', msg);
  // An expired session already raised the gate; a toast per failing poll
  // would repeat the same line every few seconds until the user logs in.
  if(String(msg).indexOf('unauthorized') !== -1) return;
  let box = document.getElementById('toastBox');
  if(!box){
    box = document.createElement('div');
    box.id = 'toastBox';
    box.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:9999;'
      + 'display:flex;flex-direction:column;gap:10px;align-items:flex-end;pointer-events:none';
    document.body.appendChild(box);
  }
  const item = document.createElement('div');
  const isBad = (kind === 'bad' || kind === 'err' || kind === 'error');
  const isWarn = (kind === 'warn' || kind === 'warning');
  const isOk = (kind === 'ok' || kind === 'success');
  const borderColor = isBad ? 'var(--bad)' : (isWarn ? 'var(--warn)' : (isOk ? 'var(--accent2)' : 'var(--accent)'));
  const textColor = isBad ? 'var(--bad)' : (isWarn ? 'var(--warn)' : (isOk ? 'var(--accent2)' : 'var(--fg)'));
  const icon = '';
  const bg = isBad ? 'rgba(254,242,242,.98)' : (isWarn ? 'rgba(255,251,235,.98)' : 'var(--panel)');

  item.textContent = icon + msg;
  item.style.cssText = 'background:' + bg + ';border:1px solid var(--line);'
    + 'border-left:4px solid ' + borderColor + ';'
    + 'border-radius:8px;padding:10px 16px;font-size:13px;font-weight:500;color:' + textColor + ';'
    + 'box-shadow:0 10px 25px -5px rgba(0,0,0,.15),0 8px 10px -6px rgba(0,0,0,.1);'
    + 'max-width:380px;word-break:break-all;pointer-events:auto;transition:all .2s ease;';
  box.appendChild(item);
  setTimeout(() => {
    item.style.opacity = '0';
    item.style.transform = 'translateY(6px)';
    setTimeout(() => item.remove(), 250);
  }, 4200);
}

/* ------------------------------- accounts ------------------------------- */
let USAGE_BY_ACCOUNT = {};

/* The API sends epoch seconds; display the recovery in the browser's local time. */
function fmtCoolAt(epoch){
  const seconds = Number(epoch);
  if(!Number.isFinite(seconds) || seconds <= 0) return '';
  const d = new Date(seconds * 1000);
  if(!Number.isFinite(d.getTime())) return '';
  const two = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate())
    + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
}
// 徽章里放不下完整时间，折算成剩余量：45s / 29m / 2h05m。
function fmtLeft(seconds){
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if(s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if(m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0') + 'm';
}
// 模型冷却 / 达日限额的胶囊：从账号列里拆出来，单独占一整行（colspan 跨满表头
// 列数），文本完整可见、不再被 180px 的账号列切掉。
//
// 胶囊的悬停提示只补「可见文本没说的部分」——原因与影响范围。模型名、撞线 /
// 恢复时刻、本地时间口径都已经画在胶囊上了，再塞进 title 就是同一句话说两遍
// （第一版就是那样：悬停里一半是重复内容，用户明确要求去掉）。
// 用整句常量而不是拼动态值：title 在 i18n 的 ATTRS 里，整句才能被 DICT 精确
// 命中；一旦拼进模型名与时间戳，整串命不中键，只剩逐片段匹配，容易漏译。
const TIP_COOL_HIT = '上游判定该模型额度用满（code 6004）；仅此模型受限，同账号其他模型照常接单';
const TIP_COOL_PLAIN = '上游临时限流（429），到点自动恢复；仅此模型受限，同账号其他模型照常接单';
const TIP_LIMIT = '该模型今日 token 用量达到「按模型每日 Token 限额」；仅此模型受限，同账号其他模型照常接单';
const COOL_ROW_COLS = 11;   // 与 accounts 表头的列数一致
function coolRow(a){
  const list = a && Array.isArray(a.modelCooldowns) ? a.modelCooldowns : [];
  const pills = list.map(c => {
    const at = c && fmtCoolAt(c.expiresAt);
    if(!at) return '';
    // 撞过线（上游 code 6004）的模型带 cappedAt：把撞线时间一并写出来，
    // 两段时间配合就能看出这是窗口配额用满，而不是一次临时限流。
    const hit = c && fmtCoolAt(c.cappedAt);
    return hit
      ? '<span class="cool-pill" title="' + esc(TIP_COOL_HIT) + '">'
        + esc(c.model) + ' · 撞线 ' + hit + ' · 恢复 ' + at + '（时间为本地时间）</span>'
      // 这一支的措辞刻意与 6004 那支错开：用「恢复时刻」而不是「恢复」。因为
      // DICT 里已有一条 ' 恢复': ''（给「剩余用量」的「），额度 X 恢复」用，
      // 那边整词要并进 returns at），胶囊若也用「X 恢复」，英文会被那段规则
      // 先手吃掉，变成「18:04(times are local)」——「back」整个丢了。
      : '<span class="cool-pill" title="' + esc(TIP_COOL_PLAIN) + '">'
        + esc(c.model) + ' · 恢复时刻 ' + at + '（时间为本地时间）</span>';
  }).filter(Boolean);
  if(!pills.length) return '';
  return '<tr class="cool-row"><td colspan="' + COOL_ROW_COLS + '">'
    + '<div class="cool-list">' + pills.join('') + '</div></td></tr>';
}

// 按模型达日限额的清单（与冷却同一行承载）：只影响列出的模型，其他模型照常。
function limitRow(a){
  const limit = Number(a.modelDailyTokenLimit || 0);
  if(limit <= 0 || !a.modelDailyTokens) return '';
  const hit = Object.entries(a.modelDailyTokens)
    .filter(([mid, v]) => Number(v) >= limit);
  if(!hit.length) return '';
  return '<tr class="cool-row"><td colspan="' + COOL_ROW_COLS + '">'
    + '<div class="cool-list">' + hit.map(([mid, v]) =>
        '<span class="cool-pill" title="' + esc(TIP_LIMIT) + '">'
        + esc(mid) + ' · 今日已用 ' + fmt(v)
        + ' / 上限 ' + fmt(limit) + ' token 已达限额（本地 0 点恢复）</span>'
      ).join('') + '</div></td></tr>';
}

// ---- 每日活动（国内签到 / 国际活跃）------------------------------------
// GET /activity/history 是唯一事实来源。账号行上的状态只由「今天已记录的事件」
// 推导：**没有记录不等于失败**，所以缺记录时给的是中性文案而不是红色。账号自带
// 的 lastCheckin / lastDailyChat 只在「今天确实完成过、但这一版还没留下历史行」
// 时补一个中性的「今日已完成」，不据此伪造事件、时间或说明。
//
// 关联键始终是 uid：切区域、刷新账号都只是重画同一份按 uid 建的表，另一个账号的
// 事件不会画到这一行上。
let ACTIVITY_TODAY = {byUid: {}, error: '', loaded: false};
const ACT_FILTER = {range: '7d', uid: '', task: '', result: ''};

const ACTIVITY_TASKS = {checkin: '国内签到', daily_chat: '国际活跃'};
const ACTIVITY_TRIGGERS = {scheduler: '定时', manual: '手动',
                           account_add: '添加账号', account_import: '导入账号'};

function todayStamp(){
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// 一个账号今天的活动状态。
// 国际版只有一项：今日活跃（daily_chat 流水或 lastDailyChat）。
// 国内版有两项独立活动：
//   1. Buddy 加油站（checkin 流水或 lastCheckin）
//   2. 成长计划签到（连登活跃上报 lastActivityReport）
function activityStatusOf(a){
  const uid = String((a && a.uid) || '');
  const isCn = (a && a.realm) === 'cn';
  if(!isCn){
    const label = '今日活跃';
    const done = a && a.lastDailyChat;
    const event = ACTIVITY_TODAY.byUid[uid];
    if(event){
      return {kind: event.ok ? 'ok' : 'failed', label: label,
              state: event.ok ? '成功' : '失败',
              at: String(event.ts || '').replace('T', ' ').slice(0, 19),
              message: String(event.message || '')};
    }
    if(done && String(done).startsWith(todayStamp())){
      return {kind: 'done', label: label, state: '已完成', at: '', message: ''};
    }
    return {kind: 'none', label: label, state: '无记录', at: '', message: ''};
  }

  // 国内版：加油站
  const event = ACTIVITY_TODAY.byUid[uid];
  const gasDone = a && a.lastCheckin;
  let gas = {kind: 'none', label: '加油站', state: '无本地记录', at: '', message: ''};
  if(event && event.task === 'checkin'){
    gas = {kind: event.ok ? 'ok' : 'failed', label: '加油站',
           state: event.ok ? '已领' : '失败',
           at: String(event.ts || '').replace('T', ' ').slice(0, 19),
           message: String(event.message || '')};
  } else if(gasDone && String(gasDone).startsWith(todayStamp())){
    gas = {kind: 'done', label: '加油站', state: '已领', at: '', message: ''};
  }

  // 国内版：成长计划连登打卡
  const streakDone = a && a.lastActivityReport;
  let streak = {kind: 'none', label: '成长连登', state: '无本地记录', at: '', message: ''};
  if(streakDone && String(streakDone).startsWith(todayStamp())){
    streak = {kind: 'done', label: '成长连登', state: '已打卡', at: String(streakDone), message: '连登活跃已上报'};
  }

  return {isCn: true, gas: gas, streak: streak,
          // 整体是否算已完成（供任务页统计卡片判断）
          kind: (gas.kind === 'ok' || gas.kind === 'done') ? 'done' : 'none'};
}

function activityStatusChip(a){
  const status = activityStatusOf(a);
  const uidAttr = esc(String((a && a.uid) || '').replace(/[^\w.@-]/g, ''));
  if(!status.isCn){
    const cls = status.kind === 'ok' ? 'badge ok'
              : status.kind === 'failed' ? 'badge bad'
              : status.kind === 'done' ? 'badge ok' : 'badge off';
    const tip = status.kind === 'none'
      ? status.label + '：今天还没有记录（没有记录不等于失败）'
      : (status.label + '：' + status.state
         + (status.at ? ' · ' + status.at : '')
         + (status.message ? ' · ' + status.message : ''));
    return '<span class="' + cls + '" style="cursor:pointer" title="' + esc(tip) + '"'
      + ' onclick="openActivityHistory(&quot;' + uidAttr + '&quot;)">'
      + esc(status.label + ' · ' + status.state) + '</span>';
  }

  // 国内版双徽章渲染：主徽章保持「今日签到 · 成功/失败/已完成/无记录」，保证历史兼容；副徽章标明「成长计划」连登状态
  const mainStatus = (status.gas.kind === 'ok') ? {cls: 'badge ok', text: '今日签到 · 成功', tip: status.gas.message}
                   : (status.gas.kind === 'failed') ? {cls: 'badge bad', text: '今日签到 · 失败', tip: status.gas.message}
                   : (status.gas.kind === 'done') ? {cls: 'badge ok', text: '今日签到 · 已完成', tip: ''}
                   : {cls: 'badge off', text: '今日签到 · 无记录', tip: '今天还没有记录'};

  const gasTip = 'Buddy加油站领取：' + (status.gas.state === '已领' ? '今日已领' : status.gas.state)
               + (status.gas.at ? ' · ' + status.gas.at : '')
               + (mainStatus.tip ? ' · ' + mainStatus.tip : '');

  const stkCls = (status.streak.kind === 'done') ? 'badge ok' : 'badge off';
  const stkTip = '成长计划连登活跃：' + status.streak.state
               + (status.streak.at ? ' · ' + status.streak.at : '');

  return '<div style="display:inline-flex;flex-direction:column;gap:4px;align-items:center">'
    + '<span class="' + mainStatus.cls + '" style="cursor:pointer;white-space:nowrap" title="' + esc(gasTip) + '"'
    + ' onclick="openActivityHistory(&quot;' + uidAttr + '&quot;)">'
    + esc('Buddy 加油站 · ' + status.gas.state) + '</span>'
    + '<span class="' + stkCls + '" style="cursor:pointer;white-space:nowrap" title="' + esc(stkTip) + '"'
    + ' onclick="openActivityHistory(&quot;' + uidAttr + '&quot;)">'
    + esc('成长计划 · ' + (status.streak.kind === 'done' ? '已签到' : '无本地记录')) + '</span>'
    + '</div>'
    + '<span style="display:none">' + esc(mainStatus.text) + '</span>';
}

// 今天的事件，按 uid 建表。rows 是最新在前，所以第一次见到的就是最近一次。
// 读不到历史只是没有状态可显示：绝不能让它把账号区一起带坏。
async function loadActivityToday(){
  try{
    const payload = await getJSON('/activity/history?range=today&limit=200');
    const rows = (payload && Array.isArray(payload.rows)) ? payload.rows : [];
    const byUid = {};
    rows.forEach(row => {
      const uid = String((row && row.uid) || '');
      if(uid && !byUid[uid]) byUid[uid] = row;
    });
    ACTIVITY_TODAY = {byUid: byUid, error: '', loaded: true};
  }catch(e){
    ACTIVITY_TODAY = {byUid: {}, error: (e && e.message) || '读取失败', loaded: true};
  }
}

// 国际版每日活跃的现场面板：时段、下次到点、正在跑的账号与未完成名单。
// 名单与「未活跃打卡一键打卡」同源（pending 由 updateTaskPageCheckinCards 传进来），
// 原因取今天最近一条活跃流水的说明，所以「没跑」和「失败」在界面上分得开。
let DAILY_CHAT_PANEL_CACHE = {at: 0, data: null};
async function fetchDailyChatScheduler(){
  const now = Date.now();
  if(DAILY_CHAT_PANEL_CACHE.data && now - DAILY_CHAT_PANEL_CACHE.at < 10000){
    return DAILY_CHAT_PANEL_CACHE.data;
  }
  try{
    const s = await getJSON('/scheduler');
    const info = (s && s.daily_chat) ? s.daily_chat : null;
    DAILY_CHAT_PANEL_CACHE = {at: now, data: info};
    return info;
  }catch(e){
    return DAILY_CHAT_PANEL_CACHE.data;
  }
}
function fmtDuration(sec){
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if(s < 60) return s + 's';
  const m = Math.floor(s / 60);
  return m + 'm' + String(s % 60).padStart(2, '0') + 's';
}
async function renderDailyChatPanel(pending, intlAccts){
  const slotsEl = document.getElementById('intlDailyChatSlots');
  const liveEl = document.getElementById('intlDailyChatLive');
  const pendingEl = document.getElementById('intlDailyChatPending');
  if(!slotsEl && !liveEl && !pendingEl) return;
  const info = await fetchDailyChatScheduler();
  const total = (intlAccts || []).length;
  const done = total - ((pending || []).length);
  if(slotsEl){
    if(!info || !Array.isArray(info.times) || !info.times.length){
      slotsEl.textContent = '今日时段：未读取到排程（调度器未运行？）';
    }else{
      const label = info.random ? '（每天随机，间隔 12 小时）' : '';
      const next = info.next_slot ? (' · 下次 ' + info.next_slot) : ' · 今日时段已全部触发';
      slotsEl.textContent = '今日时段 ' + info.times.join(' / ') + label + next
        + ' · 完成 ' + done + '/' + total
        + (info.budget_s ? (' · 单账号预算 ' + fmtDuration(info.budget_s)) : ' · 预算不限制');
    }
  }
  if(liveEl){
    const live = (info && Array.isArray(info.live)) ? info.live : [];
    if(!live.length){
      liveEl.textContent = '';
    }else{
      liveEl.innerHTML = live.map(function(item){
        const left = item.remaining_s == null ? '' : (' / 剩余 ' + fmtDuration(item.remaining_s));
        return '<span style="color:var(--accent)">运行中 ' + esc(item.uid8 || '') + ' · 已用 '
          + fmtDuration(item.elapsed_s) + left + '</span>';
      }).join('<br>');
    }
  }
  if(pendingEl){
    const list = pending || [];
    if(!list.length){
      pendingEl.innerHTML = '<span style="color:var(--accent2)">今天全部完成</span>';
      return;
    }
    const rows = list.map(function(a){
      const uid8 = String(a.uid || '').slice(0, 8);
      const nick = a.nickname || '';
      const row = (ACTIVITY_TODAY && ACTIVITY_TODAY.byUid) ? ACTIVITY_TODAY.byUid[a.uid] : null;
      let reason = '未到时段';
      if(row && row.message){
        reason = (row.ok === false ? '失败：' : '') + String(row.message);
      }
      return '<div><span style="color:var(--dim)">·</span> ' + esc(uid8)
        + ' <span style="color:var(--fg)">' + esc(nick) + '</span> '
        + '<span style="color:var(--warn)">' + esc(reason.slice(0, 120)) + '</span></div>';
    }).join('');
    pendingEl.innerHTML = '<div style="color:var(--dim)">未完成 ' + list.length + '</div>' + rows;
  }
}

// 任务与福利页面的今日打卡/签到卡片状态：与网关与账号页面的今日活跃/今日签到完全同一口径
// 统一通过 activityStatusOf(a) 判定（以今天真实流水为准，回落到本日本地时间前缀）。
function updateTaskPageCheckinCards(){
  const allList = window.ACCOUNTS || [];
  const stateEl = document.getElementById("intlTodayActiveState");
  const intlCard = document.getElementById("cardIntlTodayActive");
  if(stateEl){
    // 卡片（与卡片里的数值）都挂上同一个 title，鼠标落在卡片任何位置都能看到名单。
    const setCardTip = tip => {
      stateEl.title = tip;
      if(intlCard) intlCard.title = tip;
    };
    const intlAccts = allList.filter(a => a.realm === 'intl' && taskActive(a));
    if(!intlAccts.length){
      stateEl.textContent = '无国际账号';
      setCardTip('');
    } else {
      const isDone = a => {
        const s = activityStatusOf(a);
        return s.kind === 'ok' || s.kind === 'done';
      };
      const pending = intlAccts.filter(a => !isDone(a));
      const doneCount = intlAccts.length - pending.length;
      if(doneCount === intlAccts.length){
        stateEl.innerHTML = '<span style="color:var(--accent2)">今日已打卡 (' + doneCount + '/' + intlAccts.length + ')</span>';
      } else if(doneCount > 0){
        stateEl.innerHTML = '<span style="color:var(--accent)">部分已打卡 (' + doneCount + '/' + intlAccts.length + ')</span>';
      } else {
        stateEl.innerHTML = '<span style="color:var(--warn)">今日未打卡 (0/' + intlAccts.length + ')</span>';
      }
      // 悬停看未打卡名单：与「未活跃打卡一键打卡」按钮要打的那批同源，看到什么就打什么。
      setCardTip(pending.length ? pendingDailyChatTip(pending) : '国际版账号今天都已打卡');
      renderDailyChatPanel(pending, intlAccts);
    }
  }

  const chkStateEl = document.getElementById("cnTodayCheckinState");
  if(chkStateEl){
    let targetAccts = allList.filter(a => a.realm === 'cn' && taskActive(a));
    if(typeof CURRENT_GROWTH_UID !== 'undefined' && CURRENT_GROWTH_UID && CURRENT_GROWTH_UID !== 'all'){
      targetAccts = targetAccts.filter(a => a.uid === CURRENT_GROWTH_UID);
    }
    if(!targetAccts.length){
      chkStateEl.textContent = '无国内账号';
    } else {
      const isDone = a => {
        const s = activityStatusOf(a);
        return s.kind === 'ok' || s.kind === 'done';
      };
      const doneCount = targetAccts.filter(isDone).length;
      if(doneCount === targetAccts.length){
        chkStateEl.innerHTML = '<span style="color:var(--accent2)">今日已领 (' + doneCount + '/' + targetAccts.length + ')</span>';
      } else if(doneCount > 0){
        chkStateEl.innerHTML = '<span style="color:var(--accent)">部分已领 (' + doneCount + '/' + targetAccts.length + ')</span>';
      } else {
        chkStateEl.innerHTML = '<span style="color:var(--warn)">今日未领 (0/' + targetAccts.length + ')</span>';
      }
    }
  }
}


// 面板拼查询串，筛选在服务端做；写错的取值服务端会回 400，这里原样透出。
function activityFilterQuery(){
  const parts = ['range=' + encodeURIComponent(ACT_FILTER.range || '7d'), 'limit=200'];
  if(ACT_FILTER.uid) parts.push('uid=' + encodeURIComponent(ACT_FILTER.uid));
  if(ACT_FILTER.task) parts.push('task=' + encodeURIComponent(ACT_FILTER.task));
  if(ACT_FILTER.result) parts.push('result=' + encodeURIComponent(ACT_FILTER.result));
  return '/activity/history?' + parts.join('&');
}

function renderActivityFilters(){
  const uidSel = document.getElementById('actUid');
  if(uidSel){
    const accounts = Array.isArray(window.ACCOUNTS) ? window.ACCOUNTS : [];
    uidSel.innerHTML = '<option value="">全部账号</option>' + accounts.map(a =>
      '<option value="' + esc(String(a.uid || '')) + '">'
      + esc((a.nickname || a.uid || '') + (a.realm === 'cn' ? ' · 国内版' : ' · 国际版'))
      + '</option>').join('');
  }
  const bind = (id, value) => {
    const el = document.getElementById(id);
    if(el) el.value = value;
  };
  bind('actRange', ACT_FILTER.range);
  bind('actUid', ACT_FILTER.uid);
  bind('actTask', ACT_FILTER.task);
  bind('actResult', ACT_FILTER.result);
}

function activityHistoryRow(row){
  const uid = String((row && row.uid) || '');
  const nick = String((row && row.nickname) || '') || (uid ? uid.slice(0, 8) : '未知账号');
  const task = ACTIVITY_TASKS[row && row.task] || '—';
  const trigger = ACTIVITY_TRIGGERS[row && row.trigger] || '';
  const message = String((row && row.message) || '');
  return '<tr>'
    + '<td class="mono" data-label="时间">'
    +   esc(String((row && row.ts) || '').replace('T', ' ').slice(0, 19)) + '</td>'
    + '<td data-label="账号">' + esc(nick)
    +   (uid ? '<div class="mono" style="color:var(--dim);font-size:11px">' + esc(uid.slice(0, 8)) + '</div>' : '')
    + '</td>'
    + '<td data-label="任务">' + esc(task)
    +   (trigger ? '<div style="color:var(--dim);font-size:11px">' + esc(trigger) + '</div>' : '')
    + '</td>'
    + '<td data-label="结果">'
    +   (row && row.ok ? '<span class="badge ok">成功</span>' : '<span class="badge bad">失败</span>')
    + '</td>'
    // 上游原文可能很长：在 span 上做行内截断（td 自身不吃 max-width），完整
    // 内容留在 title 里，模态框不会被撑宽。.note-clip 与账号页活动表共用分档
    // 上限（中屏 300px），手机上由 640px 断点改折行。
    + '<td data-label="说明" style="text-align:left">'
    +   '<span class="note-clip" style="max-width:420px"'
    +   ' title="' + esc(message) + '">' + esc(message || '—') + '</span></td>'
    + '</tr>';
}

function renderActivityHistory(payload, error){
  const box = document.getElementById('activityHistoryRows');
  const meta = document.getElementById('activityHistoryMeta');
  if(!box) return;
  if(error){
    box.innerHTML = '<tr><td colspan="5" class="empty">活动记录读取失败：'
      + esc(error) + '</td></tr>';
    if(meta) meta.textContent = '';
    return;
  }
  const rows = (payload && Array.isArray(payload.rows)) ? payload.rows : [];
  const total = (payload && payload.total != null) ? payload.total : rows.length;
  if(meta) meta.textContent = rows.length ? ('显示 ' + rows.length + ' / ' + total + ' 条') : '';
  if(!rows.length){
    box.innerHTML = '<tr><td colspan="5" class="empty">这段时间没有活动记录</td></tr>';
    return;
  }
  box.innerHTML = rows.map(activityHistoryRow).join('');
}

function loadActivityHistory(){
  const box = document.getElementById('activityHistoryRows');
  if(box) box.innerHTML = '<tr><td colspan="5" class="empty">正在读取活动记录…</td></tr>';
  return getJSON(activityFilterQuery()).then(payload => {
    renderActivityHistory(payload, '');
  }).catch(e => {
    renderActivityHistory(null, (e && e.message) || '读取失败');
  });
}

function setActivityFilter(name, value){
  if(!Object.prototype.hasOwnProperty.call(ACT_FILTER, name)) return undefined;
  ACT_FILTER[name] = String(value == null ? '' : value);
  return loadActivityHistory();
}

// uid 为空表示「全部账号」；从账号行的状态徽章点进来时带上该账号，等于预筛选。
function openActivityHistory(uid){
  ACT_FILTER.uid = String(uid || '');
  const mask = document.getElementById('activityHistoryModal');
  if(mask) mask.style.display = 'flex';
  renderActivityFilters();
  return loadActivityHistory();
}

function closeActivityHistory(){
  const mask = document.getElementById('activityHistoryModal');
  if(mask) mask.style.display = 'none';
}

// 账号的手动调度权重提示：与 wb_accounts._pick_weighted_first 的行为一一对应。
const WEIGHT_TIP = '权重 >1 的账号优先接单，多个高权重账号按权重比分流量；它们都接不了单时其他账号照常顶上。已开始的会话保持粘性不换号，权重对新会话生效。1 = 不干预，临期积分优先等自动规则照旧。';

function accountRow(a){
  const realmBadge = a.realm === 'cn'
    ? '<span class="realm-badge-cn">国内版</span>'
    : '<span class="realm-badge-intl">国际版</span>';
  // 移动端卡片视图：版本列与状态列隐藏，徽章改在账号名右侧同行显示（见 ≤640px 块），
  // 桌面表格视图仍用上面的 realmBadge / state 两列，行为不变。
  const realmBadgeMobile = a.realm === 'cn'
    ? '<span class="realm-badge-cn acct-mobile-badge">国内版</span>'
    : '<span class="realm-badge-intl acct-mobile-badge">国际版</span>';
  // Inline handlers embed these in an HTML attribute, so they must survive
  // both the attribute and the quoted JS string. uid comes from an upstream
  // JWT; treat it as untrusted and keep it to a safe charset.
  const uidAttr = esc(String(a.uid || '').replace(/[^\w.@-]/g, ''));
  const realmAttr = esc(String(a.realm || 'intl').replace(/[^\w-]/g, ''));
  const nameAttr = esc(String(a.nickname || '').replace(/["'\\<>]/g, ''));
  const usage = USAGE_BY_ACCOUNT[a.uid] || {};
  const isTokenBad = !!(a.tokenExpired || a.expiresIn === 'expired');
  const state = !a.enabled
              ? (a.tasksEnabled
                 ? '<span class="badge off" title="不接 API 流量，但仍参与签到 / 任务">已停用 · 任务中</span>'
                 : '<span class="badge off">已停用</span>')
              : isTokenBad ? '<span class="badge bad" title="登录凭证已失效（上游返回 401 或已过期），请重新登录">凭证失效</span>'
              : a.reserveBlocked ? '<span class="badge warn">保留积分</span>'
              : a.dailyLimitBlocked ? '<span class="badge warn" title="今日已用 ' + fmt(a.dailyTokensToday || 0) + ' / ' + fmt(a.dailyTokenLimit || 0) + ' token，暂停接单（本地 0 点恢复）">日限额</span>'
              : a.creditLimitReached ? '<span class="badge warn" title="今日已消费 ' + Number(a.dailyCreditsToday || 0).toFixed(2) + ' / ' + (a.dailyCreditLimit || 0) + ' 积分，仅免费模型可用（本地 0 点恢复）">积分限额</span>'
              // 熔断/降权也是"不接单"，但跟上游配额无关：上游连续失败把账号
              // 关进本地保护窗口。少了这两支，账号会被画成绿色「可用」，而池子
              // 其实是空的——生产上就是这么误导排查的。
              : a.breakerFor ? '<span class="badge bad" title="上游连续失败触发熔断，本窗口内不接单；账号与凭证本身没问题，' + fmtLeft(a.breakerFor) + '后自动恢复">熔断 ' + fmtLeft(a.breakerFor) + '</span>'
              : a.degradeFor ? '<span class="badge warn" title="连续未知失败进入降权窗口，' + fmtLeft(a.degradeFor) + '后恢复">降权 ' + fmtLeft(a.degradeFor) + '</span>'
              : a.inCooldown ? '<span class="badge warn"' + (Number(a.softStreak || 0) > 1 ? ' title="连续软限流 ' + Number(a.softStreak) + ' 次，冷却时间按 2 倍递增"' : '') + '>冷却 ' + (a.cooldownFor||0) + 's</span>'
              : a.expiresIn === 'expired' ? '<span class="badge bad">已过期</span>'
              : '<span class="badge ok">可用</span>';
  // 模型冷却 / 达日限额的胶囊不放在账号列里：那里只有 180px，长模型名必然被
  // 省略号切掉。它们改成账号行之后紧跟的一整行（coolRow / limitRow）在
  // </tr> 之后输出，宽度够把话说全。
  // The visible label keeps the exact truncation it had before; the tooltip carries
  // the whole upstream body (lastErrorDetail) so a 429 reason is readable on hover
  // without widening the card.
  // 「到期 358 days」收成「到期：358d」；完整原值（data-tip）保持后端给的原样。
  const expRaw = String(a.expiresIn || '?');
  const expShort = expRaw.replace(/\s*days?$/i, 'd').replace(/\s*hours?$/i, 'h');
  // 报错只画可扫读的短标签「HTTP 429 · code:6004」；完整响应进悬浮气泡
  // （data-tip），行尾的 ⓘ 提示可悬停查看。原样打印整段响应会把账号列
  // 拉宽、也读不出重点。
  const errFull = a.lastErrorDetail || a.lastError || '';
  let err = '';
  // 模型级 429（6004）由 coolRow 画「撞线 / 恢复」；lastError 只是那次的
  // 历史记录，冷却到期后也不能把旧记录再画成账号级错误（#454）。
  if (a.lastError && a.lastError !== 'HTTP 429 (model throttled)') {
    const httpM = String(a.lastError).match(/HTTP\s+(\d{3})/);
    const codeM = String(errFull).match(/"code"\s*:\s*(\d+)/);
    const label = httpM
      ? ('HTTP ' + httpM[1] + (codeM ? ' · code:' + codeM[1] : ''))
      : String(a.lastError).slice(0, 60);
    err = '<div class="acct-err" data-tip="' + esc(errFull) + '">'
        + '<span class="err-label">' + esc(label) + '</span>'
        + '<span class="err-info" aria-hidden="true">ⓘ</span></div>';
  }
  const cred = a.credits;
  let expBadge = '';
  if(cred && cred.earliest_expiring && cred.earliest_expiring.days_left !== undefined && cred.earliest_expiring.days_left !== null){
    const d = Number(cred.earliest_expiring.days_left);
    if(d <= 3 && d >= 0){
      const expEnd = String(cred.earliest_expiring.cycle_end_time || '');
      expBadge = '<span class="badge mini bad" style="font-size:10px;padding:1px 4px" title="最近套餐包将于 ' + esc(expEnd.slice(5,10)) + ' 到期 (剩' + d.toFixed(1) + '天)">临期</span>';
    } else if(d <= 7 && d >= 0){
      const expEnd = String(cred.earliest_expiring.cycle_end_time || '');
      expBadge = '<span class="badge mini warn" style="font-size:10px;padding:1px 4px" title="最近套餐包将于 ' + esc(expEnd.slice(5,10)) + ' 到期 (剩' + Math.ceil(d) + '天)">7天内到期</span>';
    }
  }
  // 账号档位（#505）读自上游计费摘要，包名原样显示（国际版 Free、国内版体验版），
  // 与 workbuddy 官方叫法一致，不自造「免费 / 付费」标签。tier 为空 = 还没读过，
  // 那是「未知」而不是免费，所以不画任何胶囊（企业号与被风控限制的号也是空）。
  //
  // 位置放在「版本」格里、区域徽章的正下方：这一格只有一枚区域徽章（实测 76px
  // 宽、内容约 52px），是全表唯一还有余量又不会被别的元素挤到的地方。积分格
  // 实测只有 120px，加了「临期 / 明细」就顶满；账号格里的次要信息行是 10px 的
  // 可点击链接，胶囊挤在旁边既会被长名单推走、又容易被当成链接的一部分。
  // 行高不受影响：账号格本来就比这一格高。
  const tier = a.tier && typeof a.tier === 'object' ? a.tier : null;
  const tierPkg = tier && tier.package ? String(tier.package) : '';
  let tierBadge = '';
  if(tierPkg){
    const at = tier.checked_at ? new Date(tier.checked_at * 1000).toLocaleString() : '';
    tierBadge = '<span class="badge mini' + (tier.paid === true ? ' ok' : '') + '"'
      + ' title="会员类型: ' + esc(tierPkg) + (at ? ' · 读取于 ' + esc(at) : '') + '">'
      + esc(tierPkg) + '</span>';
  }
  const tierBadgeBlock = tierBadge ? '<div style="margin-top:2px">' + tierBadge + '</div>' : '';
  const credText = cred
    ? ('<div class="credit-stack">'
       + '<div class="credit-main"><b>' + fmt(cred.remain) + '</b>'
       + '<span class="credit-total">/ ' + fmt(cred.size) + '</span></div>'
       + '<div class="credit-meta">' + expBadge
       + '<span class="badge mini" style="cursor:pointer" onclick="openCreditsDetail(&quot;' + uidAttr + '&quot;)" title="点击查看积分与套餐明细">明细</span></div>'
       + '</div>')
    : ('<div class="credit-stack">'
       + '<div class="credit-main"><span style="color:var(--dim)">未查询</span></div>'
       + '<div class="credit-meta"><span class="badge mini" style="cursor:pointer" onclick="openCreditsDetail(&quot;' + uidAttr + '&quot;)" title="点击查询积分明细">查询</span></div>'
       + '</div>');
  // 权重下拉：选项给 1-10；历史值超出范围时不让 select 悄悄跳回最近的档位，
  // 补一个选中项把真实值显示出来。
  const weight = Math.max(1, Math.min(100, Number(a.weight || 1) || 1));
  let weightOpts = '';
  for(let i = 1; i <= 10; i++){
    weightOpts += '<option value="' + i + '"' + (weight === i ? ' selected' : '') + '>' + i + '</option>';
  }
  if(weight > 10) weightOpts += '<option value="' + weight + '" selected>' + weight + '</option>';
  // 人工禁用的模型名单（账号级黑名单，与自动冷却无关）
  const deny = (a.disabledModels || []);
  // 冷却 / 达日限额的胶囊紧跟本账号行另起一整行：账号列只有 180px，长模型名
  // 在那里必然被省略号切掉，整行才放得下完整文本。colspan 跨满表头列数，
  // 所以桌面与窄屏（grid 下 td[colspan] 已跨满 6 栏）都不用再各自的宽度。
  // 有续行时给账号行打 has-alert：两行是同一块内容，中间不该有分割线（见 CSS）。
  const alertRows = coolRow(a) + limitRow(a);
  return '<tr' + (alertRows ? ' class="has-alert"' : '') + '>'
    + '<td style="text-align:center;white-space:nowrap" data-label="版本">' + realmBadge + tierBadgeBlock + '</td>'
    + '<td style="text-align:left" data-label="账号">'
    // 账号名（大一号）+ 备注 chip 同一行；备注从独立一行收进账号后面。
    +   '<div class="acct-name-row">'
    +     '<span class="acct-name" title="' + esc(a.nickname) + '">' + esc(a.nickname) + '</span>'
    // 静态 API Key 账号：没有登录身份，也没有签到/成长体系，标出来省得当成
    // 普通 OAuth 号去点「重新登录」。悬停给出脱敏后的凭证，方便对上是哪一把。
    +     (a.apiKey
          ? '<span class="badge mini" style="background:var(--panel2);color:var(--dim)"'
            + ' title="静态 API Key 账号（' + esc(a.credentialMask || 'ck_***') + '）：不参与刷新 / 签到 / 成长任务，额度走企业口径"'
            + '>API Key</span>'
          : '')
    +     (a.note
          ? '<span class="note-chip has" title="点击编辑备注" onclick="editAccountNote(&quot;' + uidAttr + '&quot;)">' + esc(a.note) + '</span>'
          : '<span class="note-chip" title="点击添加备注，比如「批量」/「自用」" onclick="editAccountNote(&quot;' + uidAttr + '&quot;)">+ 备注</span>')
    // API Key 账号没有个人成长体系，签到/任务开关对它没有意义：上游一律拒绝，
    // 画出来只会让人以为点了能开。
    +     (a.apiKey ? ''
          : '<span class="badge mini ' + (a.tasksEnabled ? 'ok' : 'off') + '" style="cursor:pointer;margin-left:6px" title="参与签到 / 成长任务 / 连登管家 / 猫猫旅行 / 国际版活跃；与 API 取号无关，点一下切换" onclick="toggleAccountTasks(&quot;' + uidAttr + '&quot;,' + (!a.tasksEnabled) + ')">任务' + (a.tasksEnabled ? '开' : '关') + '</span>')
    // 移动端专用：版本 + 状态徽章靠右同行（桌面隐藏，用表格自己的两列）。
    +     '<span class="acct-mobile-badges">' + realmBadgeMobile + state + tierBadge + '</span>'
    +   '</div>'
    // 次要信息收成一行：值截断到几个字符，完整值走悬浮气泡（data-tip）。
    +   '<div class="acct-meta mono">'
    +     '<span data-tip="账号 ID：' + esc(String(a.uid || '')) + '">' + esc(a.source) + '：' + esc(String(a.uid || '').slice(0, 5)) + '…</span>'
    +     ' · <span data-tip="凭证到期：' + esc(expRaw) + '">到期：' + esc(expShort) + '</span>'
    +     (a.machineId ? ' · <span data-tip="设备码：' + esc(String(a.machineId)) + '（由账号 UID 稳定派生的专属设备码，防多号关联风控）">设备码:' + esc(String(a.machineId).slice(0, 4)) + '…</span>' : '')
    +   '</div>'
    + (deny.length
        // 这一行的可见文本没有 ellipsis，名单再长也会换行显示完整，所以悬停里
        // 只留「点击能干什么」，不再把名单重复一遍（重复即噪音）。
        ? '<div style="font-size:11px;color:var(--warn);margin-top:2px;cursor:pointer" title="' + esc('点击编辑该账号禁用的模型（逗号分隔；留空 = 不限制）') + '" onclick="editAccountDisabledModels(&quot;' + uidAttr + '&quot;)">禁用的模型: ' + esc(deny.join(', ')) + '</div>'
        : '<div style="font-size:10px;color:var(--dim);margin-top:2px;cursor:pointer;opacity:.7" title="点击设置该账号禁用的模型：命中的模型不再派给这个号，池子里其他号照常接单" onclick="editAccountDisabledModels(&quot;' + uidAttr + '&quot;)">+ 禁用模型</div>')
    + err + '</td>'
    + '<td style="text-align:center" data-label="状态">' + state + '</td>'
    + '<td style="text-align:center" data-label="今日活动">' + activityStatusChip(a) + '</td>'
    + '<td style="text-align:center" data-label="出口">' + slotSelectHtml(a) + '</td>'
    + '<td style="text-align:center;white-space:nowrap" data-label="权重">'
    +   '<select class="mini-select" title="' + esc(WEIGHT_TIP) + '" onchange="setAccountWeight(&quot;' + uidAttr + '&quot;, this.value, this)">' + weightOpts + '</select></td>'
    + '<td style="text-align:left;white-space:normal" data-label="积分">' + credText + '</td>'
    + '<td style="text-align:right" data-label="请求">' + fmt(usage.requests) + '</td>'
    + '<td style="text-align:right" data-label="总 token" data-tip="' + fmt(usage.total_tokens) + '">' + fmtCompact(usage.total_tokens) + '</td>'
    + '<td style="text-align:right" data-label="缓存" data-tip="' + fmt(usage.cached_tokens) + '">' + fmtCompact(usage.cached_tokens) + '</td>'
    + '<td class="acct-actions" style="text-align:center;white-space:nowrap;vertical-align:middle">'
    + '<div class="acct-actions-col">'
    +   '<div class="acct-actions-row">'
    +     '<button class="sec mini" onclick="toggleAccount(&quot;' + uidAttr + '&quot;,' + (!a.enabled) + ', this)">' + (a.enabled ? '停用' : '启用') + '</button>'
    +     '<button class="sec mini" onclick="testAccount(&quot;' + uidAttr + '&quot;, this)">测试</button>'
    +     (isTokenBad
          ? '<button class="bad mini" onclick="openLoginModal(&quot;' + realmAttr + '&quot;)" title="凭证已失效，点击重新扫码授权并自动更新该账号">重新登录</button>'
          : '<button class="sec mini" onclick="refreshOne(&quot;' + uidAttr + '&quot;, this)">刷新凭证</button>')
    +     '<button class="sec mini" onclick="syncProfile(&quot;' + uidAttr + '&quot;, this)" title="从 Web 控制台同步最新昵称（改名后免重登）">同步昵称</button>'
    +   '</div>'
    +   '<div class="acct-actions-row">'
    +     '<span class="id-btn-label">出站身份：</span>'
    +     '<div class="id-btn-group" title="出站身份：WB = WorkBuddy 独立桌面客户端（默认），VSC = 官方 VSCode 插件，CLI = 官方 CodeBuddy CLI；三者对应不同的出站指纹与配额通道。">'
    +       '<button class="id-btn' + ((!a.product || a.product === 'workbuddy') ? ' active' : '') + '" onclick="setAccountProduct(&quot;' + uidAttr + '&quot;, &quot;workbuddy&quot;, this)">WB</button>'
    +       '<button class="id-btn' + (a.product === 'vscode' ? ' active' : '') + '" onclick="setAccountProduct(&quot;' + uidAttr + '&quot;, &quot;vscode&quot;, this)">VSC</button>'
    +       '<button class="id-btn' + (a.product === 'cli' ? ' active' : '') + '" onclick="setAccountProduct(&quot;' + uidAttr + '&quot;, &quot;cli&quot;, this)">CLI</button>'
    +     '</div>'
    +     '<button class="sec mini" onclick="exportOne(&quot;' + uidAttr + '&quot;)">导出</button>'
    +     '<button class="danger mini" onclick="deleteAccount(&quot;' + uidAttr + '&quot;,&quot;' + nameAttr + '&quot;, this)">删除</button>'
    +   '</div>'
    + '</div>'
    + '</td></tr>'
    + alertRows;
}

// 「!」帮助标记的展开/收起：说明文本只写一份（在 .help-detail 里），
// 点击标记才显示，再点一次收起。
function toggleHelpDetail(id, evt){
  if(evt && evt.stopPropagation) evt.stopPropagation();
  const box = document.getElementById(id);
  if(!box) return;
  const willOpen = box.hasAttribute('hidden');
  if(willOpen) box.removeAttribute('hidden'); else box.setAttribute('hidden', '');
  const mark = document.querySelector('.help-mark[onclick*="' + id + '"]');
  if(mark) mark.classList.toggle('open', willOpen);
}

// 悬停气泡（全局单例）。用自定义 DOM 而不是原生 title：原生 tooltip 由浏览器
// 自己绘制，既截不进图、也没法控制样式与换行。元素只要带 data-tip 就生效，
// 事件走委托，动态重渲染出来的节点不必重新绑定。
let _hoverTip = null;
function moveHoverTip(e){
  if(!_hoverTip) return;
  const pad = 14;
  const w = _hoverTip.offsetWidth, h = _hoverTip.offsetHeight;
  let x = e.clientX + pad, y = e.clientY + pad;
  if(x + w > window.innerWidth - 8) x = Math.max(8, e.clientX - w - pad);
  if(y + h > window.innerHeight - 8) y = Math.max(8, e.clientY - h - pad);
  _hoverTip.style.left = x + 'px';
  _hoverTip.style.top = y + 'px';
}
function ensureHoverTip(){
  if(_hoverTip) return _hoverTip;
  const el = document.createElement('div');
  el.id = 'hoverTip';
  el.style.cssText = 'position:fixed;z-index:9999;display:none;max-width:560px;'
    + 'padding:8px 10px;border-radius:8px;background:var(--panel);border:1px solid var(--line);'
    + 'box-shadow:var(--shadow-sm);font-size:12px;line-height:1.55;color:var(--fg);'
    + 'white-space:pre-wrap;word-break:break-word;pointer-events:none';
  document.body.appendChild(el);
  _hoverTip = el;
  document.addEventListener('mouseover', e => {
    const host = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
    if(!host) return;
    el.textContent = host.getAttribute('data-tip');
    el.style.display = 'block';
    moveHoverTip(e);
  });
  document.addEventListener('mousemove', e => {
    if(el.style.display === 'block') moveHoverTip(e);
  });
  document.addEventListener('mouseout', e => {
    const host = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
    if(host) el.style.display = 'none';
  });
  return el;
}

// 当前视图的账号：realm 为空的账号两侧都可见，与账号卡片一直以来的口径一致。
// 全页只留这一处 realm 过滤表达式 —— 账号卡片与「当前禁用账号与模型」都走它，
// 两处不会各写一份、然后各自漂移。视图的真源是 window.VIEW_REALM。
function accountsInView(){
  const view = window.VIEW_REALM || "intl";
  return (window.ACCOUNTS || []).filter(a => !a.realm || a.realm === view);
}

// 纯展示筛选：账号池、禁用汇总和批量操作的输入仍使用 accountsInView()。
function accountIsHealthy(a){
  return !!a.enabled && !(a.tokenExpired || a.expiresIn === 'expired')
    && !a.inCooldown && !a.breakerFor && !a.degradeFor
    && !a.reserveBlocked && !a.dailyLimitBlocked && !a.creditLimitReached;
}
const ACCOUNT_FILTERS = {query: '', status: ''};
function accountMatchesFilters(a){
  const q = ACCOUNT_FILTERS.query.trim().toLowerCase();
  if(q && ![a.nickname, a.note, a.uid].some(v => String(v || '').toLowerCase().includes(q))) return false;
  if(ACCOUNT_FILTERS.status === 'disabled') return !a.enabled;
  const attention = !accountIsHealthy(a);
  if(ACCOUNT_FILTERS.status === 'healthy') return !attention;
  if(ACCOUNT_FILTERS.status === 'attention') return !!attention;
  return true;
}
function clearAccountFilters(){
  ACCOUNT_FILTERS.query = '';
  ACCOUNT_FILTERS.status = '';
  const q = document.getElementById('accountSearchFilter');
  const s = document.getElementById('accountStatusFilter');
  if(q) q.value = '';
  if(s) s.value = '';
  renderAccounts();
}

// 当前禁用总览：把散落在账号卡片上的停用/限流状态汇总成一张表。
// 四类来源：①面板手动停用 ②上游账号级冷却 ③上游模型级冷却 ④本地日限额/积分护栏。
// 全部读 window.ACCOUNTS，不额外发请求；数据与账号卡片同源，不会互相矛盾。
// 只描述当前视图（accountsInView）：计数、分组与空状态都从这同一份过滤后的数据
// 算出来，否则切到国内版时会看到国际版的停用状态（issue #31）。
function disabledRows(){
  const rows = [];
  const now = Math.floor(Date.now() / 1000);
  // 日限额与积分护栏按本地自然日恢复，这里取下一个零点。
  const nextMidnight = (() => {
    const d = new Date(); d.setHours(24, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  })();
  accountsInView().forEach(a => {
    const who = (a.nickname || '?') + ' (' + String(a.uid || '').slice(0, 8) + ')';
    const realm = a.realm === 'cn' ? '国内版' : '国际版';
    const detail = a.lastErrorDetail || '';
    if(!a.enabled){
      rows.push({who, realm, scope: '账号', kind: '本地停用', manual: true,
                 reason: '面板手动停用，该账号不参与轮询', until: ''});
    }
    if(a.inCooldown){
      const secs = Number(a.cooldownFor || 0);
      const streak = Number(a.softStreak || 0);
      rows.push({who, realm, scope: '账号', kind: '上游限流', detail,
                 reason: (a.lastError || '上游 429')
                       + (streak > 1 ? '（连续软限流 ' + streak + ' 次，冷却按 2 倍递增）' : ''),
                 until: secs > 0 ? fmtCoolAt(now + secs) : ''});
    }
    if(a.breakerFor){
      const secs = Number(a.breakerFor || 0);
      rows.push({who, realm, scope: '账号', kind: '熔断', detail,
                 reason: '上游连续失败触发熔断，本窗口内不接单（账号与凭证本身没问题，恢复后可继续用）',
                 until: secs > 0 ? fmtCoolAt(now + secs) : ''});
    }
    if(a.degradeFor){
      const secs = Number(a.degradeFor || 0);
      rows.push({who, realm, scope: '账号', kind: '降权', detail,
                 reason: '连续未知失败进入降权窗口，优先级被压低',
                 until: secs > 0 ? fmtCoolAt(now + secs) : ''});
    }
    (Array.isArray(a.modelCooldowns) ? a.modelCooldowns : []).forEach(c => {
      if(!c || !c.model) return;
      // 带 cappedAt 的是 6004 撞线（恢复时间来自上游）：撞线时间单独一列。
      const hit = c.cappedAt ? fmtCoolAt(c.cappedAt) : '';
      // 起始时刻：6004 用上游给的撞线时刻；其余 429 用 hub 记下的限流时刻
      // （c.startedAt）。两者都取不到时才留空——不用假值填充表格。
      const started = hit || (c.startedAt ? fmtCoolAt(c.startedAt) : '');
      // 两类模型级限流的原因必须分开写：带 cappedAt 的是上游 6004 配额耗尽
      // （恢复时间以小时计），不带 cappedAt 的只是一次 429 临时限流（60s~10m
      // 的短窗口，到点自动恢复）。共用一句「配额耗尽」会把短时 parking 说成
      // 要等几小时，也让真正该关注的 6004 淹没在里面。
      rows.push({who, realm, scope: c.model, kind: '上游限流', detail, cappedAt: hit,
                 startedAt: started,
                 reason: hit
                   ? '该模型配额耗尽（code 6004），同账号其他模型不受影响'
                   : '该模型被上游临时限流（429），仅此模型受限，到点自动恢复',
                 until: fmtCoolAt(c.expiresAt)});
    });
    if(a.dailyLimitBlocked){
      rows.push({who, realm, scope: '账号', kind: '日限额',
                 reason: '今日 token ' + Number(a.dailyTokensToday || 0).toLocaleString()
                       + ' / 上限 ' + Number(a.dailyTokenLimit || 0).toLocaleString(),
                 until: fmtCoolAt(nextMidnight)});
    }
    if(a.creditLimitReached){
      rows.push({who, realm, scope: '账号', kind: '积分限额',
                 reason: '剩余积分低于保留线', until: fmtCoolAt(nextMidnight)});
    }
    const mcap = Number(a.modelDailyTokenLimit || 0);
    if(mcap > 0 && a.modelDailyTokens){
      Object.entries(a.modelDailyTokens).forEach(([mid, v]) => {
        if(Number(v) >= mcap){
          rows.push({who, realm, scope: mid, kind: '日限额',
                     reason: '今日 token ' + Number(v).toLocaleString() + ' / 上限 ' + mcap.toLocaleString(),
                     until: fmtCoolAt(nextMidnight)});
        }
      });
    }
  });
  return rows;
}

function renderDisabled(){
  const box = document.getElementById('disabledList');
  if(!box) return;
  ensureHoverTip();
  const count = document.getElementById('disabledCount');
  const rows = disabledRows();
  if(count) count.textContent = rows.length ? '(' + rows.length + ')' : '';
  if(!rows.length){
    box.innerHTML = '<div class="legend" style="margin:0"><span>当前没有禁用的账号或模型。</span></div>';
    return;
  }
  const badge = k => k === '上游限流' ? 'warn' : (k === '本地停用' || k === '熔断' ? 'bad' : 's');
  box.innerHTML = '<div class="table-wrap"><table class="data-cards"><thead><tr>'
    + '<th style="text-align:left">账号</th>'
    + '<th style="text-align:center;width:76px">版本</th>'
    + '<th style="text-align:left">范围</th>'
    + '<th style="text-align:center;width:100px">类型</th>'
    + '<th style="text-align:left">原因</th>'
    + '<th style="text-align:center;width:156px">开始时间</th>'
    + '<th style="text-align:center;width:156px">恢复时间</th>'
    + '</tr></thead><tbody>'
    + rows.map(r => '<tr>'
        + '<td style="text-align:left">' + esc(r.who) + '</td>'
        + '<td style="text-align:center">' + esc(r.realm) + '</td>'
        + '<td style="text-align:left" class="mono">' + esc(r.scope) + '</td>'
        + '<td style="text-align:center"><span class="badge ' + badge(r.kind) + '">' + esc(r.kind) + '</span></td>'
        + '<td style="text-align:left"' + (r.detail ? ' data-tip="' + esc(r.detail) + '"' : '') + '>'
          + esc(r.reason) + '</td>'
        // 开始时间：这一行是何时进入该状态的。模型级限流两类都有真实时刻——
        // 6004 是上游给的撞线时刻（cappedAt），临时 429 是 hub 记下的限流时刻
        // （startedAt）；其余行类没有起始时刻，留「—」。
        + '<td style="text-align:center">' + esc(r.startedAt || '—') + '</td>'
        + '<td style="text-align:center">' + (r.manual ? '—（需手动启用）' : (r.until || '—')) + '</td>'
        + '</tr>').join('')
    + '</tbody></table></div>';
  applyTableSort('disabledList');
}

/* ---- 签到与活跃记录（GET /activity/history，issue #176）----
   国内版签到与国际版每日活跃的每一次真实尝试，都由 wb_activity.py 落成一行：
   时间 / uid / 昵称 / 区域 / 任务 / 触发来源 / 结果 / 说明。筛选全部交给服务端
   （range/task/result/uid/limit），它还会校验认不出来的值并回 400——前端不再
   自己过滤一遍，两处各写一份筛选规则迟早会跑偏。
   这份历史是按需读的日志视图，不跟着 15 秒轮询走：轮询会每轮把「加载更多」翻
   出来的页码重置回第一页，操作者正看着的记录会跳走。 */
const ACTIVITY_PAGE = 100;
const ACTIVITY_MAX_LIMIT = 1000;
let ACTIVITY_LIMIT = ACTIVITY_PAGE;
let ACTIVITY_LOADING = false;

const ACTIVITY_TASK_LABEL = {checkin: '国内版签到', daily_chat: '国际版每日活跃'};
function activityTaskLabel(r){
  if(r && r.task === 'checkin' && r.realm === 'codearts') return 'CodeArts 签到';
  return ACTIVITY_TASK_LABEL[r.task] || r.task || '—';
}
const ACTIVITY_TRIGGER_LABEL = {scheduler: '定时', manual: '手动', account_add: '添加账号',
                                account_import: '导入', unknown: '未知'};
const ACTIVITY_REALM_LABEL = {cn: '国内版', intl: '国际版', codearts: 'CodeArts'};

function activityValue(id){
  const el = document.getElementById(id);
  return el ? String(el.value == null ? '' : el.value) : '';
}

function activityQuery(limit){
  const q = new URLSearchParams();
  q.set('range', activityValue('activityRange') || '7d');
  const task = activityValue('activityTask');
  if(task) q.set('task', task);
  const result = activityValue('activityResult');
  if(result) q.set('result', result);
  const uid = activityValue('activityAccount');
  if(uid) q.set('uid', uid);
  q.set('limit', String(limit));
  return '/activity/history?' + q.toString();
}

/* 账号下拉的选项取自当前账号池（/accounts）。账号轮询每 15 秒刷一次窗口，这里
   每次重建选项都要把操作者已选中的 uid 放回去，否则筛选条件会被悄悄清掉。 */
function renderActivityAccounts(){
  const sel = document.getElementById('activityAccount');
  if(!sel) return;
  const keep = String(sel.value || '');
  const opts = ['<option value="">全部账号</option>'];
  (window.ACCOUNTS || []).forEach(a => {
    if(!a || !a.uid) return;
    const name = a.nickname || String(a.uid).slice(0, 8);
    // 昵称是数据不是界面文案，别让 i18n 按汉字逐字转换它。
    opts.push('<option value="' + esc(a.uid) + '" data-no-i18n>' + esc(name) + '</option>');
  });
  sel.innerHTML = opts.join('');
  if(keep) sel.value = keep;
}

/* 时间按记录里写的墙上时间显示（服务端落盘时带本机偏移量），所以这里只做字符串
   截取，不做时区换算：换算一次就等于把运维看到的本地时间再挪一遍。 */
function activityTime(ts){
  const m = String(ts || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if(!m) return String(ts || '') || '—';
  return m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5];
}

function activityWho(r){
  const nick = String((r && r.nickname) || '').trim();
  if(nick) return nick;
  return (r && r.uid) ? String(r.uid).slice(0, 8) : '—';
}

function renderActivityBoard(data){
  const box = document.getElementById('activityList');
  if(!box) return;
  const rows = (data && data.rows) || [];
  const total = Number((data && data.total) || 0);
  const count = document.getElementById('activityCount');
  if(count) count.textContent = total ? '(共 ' + total + ' 条)' : '';
  const more = document.getElementById('activityMore');
  const info = document.getElementById('activityMoreInfo');
  if(more) more.style.display = (rows.length < total) ? 'flex' : 'none';
  if(info) info.textContent = (rows.length < total)
    ? ('已显示最新 ' + rows.length + ' 条 / 共 ' + total + ' 条') : '';
  if(!rows.length){
    box.innerHTML = '<div class="legend" style="margin:0"><span>这个区间里没有签到或活跃记录。</span></div>';
    return;
  }
  const resultBadge = ok => ok ? '<span class="badge ok">成功</span>'
                               : '<span class="badge bad">失败</span>';
  box.innerHTML = '<table class="data-cards activity-table"><thead><tr>'
    + '<th style="text-align:left;width:132px">时间</th>'
    + '<th style="text-align:left;width:11%">账号</th>'
    + '<th style="text-align:center;width:76px">区域</th>'
    + '<th style="text-align:left;width:132px">任务</th>'
    + '<th style="text-align:center;width:76px">来源</th>'
    + '<th style="text-align:center;width:76px">结果</th>'
    + '<th style="text-align:left">说明</th>'
    + '</tr></thead><tbody>'
    + rows.map(r => '<tr>'
        + '<td class="mono" data-label="时间">' + esc(activityTime(r.ts)) + '</td>'
        + '<td data-label="账号" title="' + esc(r.uid || '') + '">'
          + '<span class="note-clip" style="max-width:160px" title="'
          + esc(activityWho(r)) + '" data-no-i18n>' + esc(activityWho(r)) + '</span></td>'
        + '<td style="text-align:center" data-label="区域">'
          + esc(ACTIVITY_REALM_LABEL[r.realm] || '—') + '</td>'
        + '<td data-label="任务">' + esc(activityTaskLabel(r)) + '</td>'
        + '<td style="text-align:center" data-label="来源">'
          + esc(ACTIVITY_TRIGGER_LABEL[r.trigger] || r.trigger || '—') + '</td>'
        + '<td style="text-align:center" data-label="结果">' + resultBadge(r.ok) + '</td>'
        // 上游原文可能很长：在 span 上做行内截断（td 自身不吃 max-width，撑宽的是
        // 整张表），完整内容留在 title 里，表格不会被一条 429 原文拉出横向滚动。
        // 上限分档给（.note-clip）：大屏 520px，中屏 641–960px 桌面布局还在但
        // 宽度有限，收到 300px，免得账号贴着时间；手机卡片模式下改折行显示全文。
        + '<td data-label="说明" style="text-align:left">'
        +   (r.message
              ? '<span class="note-clip" style="max-width:520px" title="' + esc(r.message) + '">' + esc(r.message) + '</span>'
              : '<span style="color:var(--dim)">—</span>')
        + '</td>'
        + '</tr>').join('')
    + '</tbody></table>';
}

async function loadActivityBoard(showToast, more){
  if(ACTIVITY_LOADING) return;
  ACTIVITY_LOADING = true;
  const btn = document.getElementById('btnActivityRefresh');
  if(btn) btn.disabled = true;
  const box = document.getElementById('activityList');
  if(more) ACTIVITY_LIMIT = Math.min(ACTIVITY_MAX_LIMIT, ACTIVITY_LIMIT + ACTIVITY_PAGE);
  else ACTIVITY_LIMIT = ACTIVITY_PAGE;
  if(box && !more) box.innerHTML = '<div class="legend" style="margin:0"><span>加载中…</span></div>';
  try {
    renderActivityAccounts();
    const data = await getJSON(activityQuery(ACTIVITY_LIMIT));
    renderActivityBoard(data);
    if(showToast) toast('签到记录已刷新', 'ok');
  } catch(e) {
    if(box) box.innerHTML = '<div class="legend" style="margin:0"><span>读取签到记录失败: '
      + esc(e && e.message ? e.message : e) + '</span></div>';
    if(showToast) toast('读取签到记录失败: ' + (e && e.message ? e.message : e), 'bad');
  } finally {
    ACTIVITY_LOADING = false;
    if(btn) btn.disabled = false;
  }
}

// 账号表客户端分页（上百个号时整表重画是面板卡顿的主因之一）。排序在全部账号上
// 做完再切页；页码跨轮询保留，账号变少时夹回最后一页，切换视图区域回第一页。
const ACCT_PAGE_SIZE = 50;
let ACCT_PAGE = 1;
let ACCT_TOTAL_PAGES = 1;
let ACCT_PAGE_REALM = null;
let ACCT_PAGE_FILTER = null;
// 账号表上次真正画进 DOM 的内容指纹（同最近请求表的 lastRecentFp）：轮询拿回来
// 的数据没变就整段跳过，不重拼 HTML、不重排。
let lastAccountsFp = null;
// 分页 + 表头排序时，全量排序那一遍推断出的列类型；页内的 applyTableSort（含每 5
// 秒的 applyAllTableSorts）照它挂表头、且不再重排。其余情况为 null，照常推断。
let ACCT_FIXED_KINDS = null;
function accountsRenderFp(){
  // 行里用到的全部输入：账号本身、按账号用量、代理槽（出口下拉）、今日活动
  // （今日活动列）、视图区域、页码、表头排序、筛选条件、本地日期（「今日」口径）。
  // 筛选也进指纹：不靠「改筛选一定无参调用 renderAccounts()」这条约定兜底。
  return [
    window.VIEW_REALM || 'intl', ACCT_PAGE, JSON.stringify(SORT_STATE.accounts || null),
    JSON.stringify(ACCOUNT_FILTERS),
    new Date().toDateString(),
    JSON.stringify(window.ACCOUNTS || []), JSON.stringify(USAGE_BY_ACCOUNT || {}),
    JSON.stringify(PROXY_SLOTS || []), JSON.stringify(ACTIVITY_TODAY || null),
  ].join('\u0002');
}
function changeAcctPage(delta){
  const next = ACCT_PAGE + delta;
  if(next < 1 || next > ACCT_TOTAL_PAGES) return;
  ACCT_PAGE = next;
  renderAccounts();
}
function gotoAcctPage(p){
  if(p < 1 || p > ACCT_TOTAL_PAGES || p === ACCT_PAGE) return;
  ACCT_PAGE = p;
  renderAccounts();
}
function acctPagerHtml(total){
  // 与最近请求表的分页条同一套样式（generatePageList + range-btn）。
  const pages = generatePageList(ACCT_PAGE, ACCT_TOTAL_PAGES);
  return '<div id="acctPagination" style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:12px;border-top:1px solid var(--line);font-size:12px;color:var(--dim);flex-wrap:wrap;gap:8px">'
    + '<div id="acctPageInfo">第 ' + ACCT_PAGE + ' / ' + ACCT_TOTAL_PAGES + ' 页 · 共 ' + fmt(total) + ' 个账号</div>'
    + '<div style="display:inline-flex;gap:5px;align-items:center">'
    +   '<button class="sec mini" id="btnAcctPrev" onclick="changeAcctPage(-1)"' + (ACCT_PAGE <= 1 ? ' disabled' : '') + '>上一页</button>'
    +   '<div style="display:inline-flex;gap:3px;align-items:center">'
    +     pages.map(p => p === '...'
            ? '<span style="color:var(--dim);padding:0 3px">…</span>'
            : '<button class="range-btn' + (p === ACCT_PAGE ? ' active' : '') + '" style="min-width:26px;padding:3px 6px;font-size:11px" onclick="gotoAcctPage(' + p + ')">' + p + '</button>').join('')
    +   '</div>'
    +   '<button class="sec mini" id="btnAcctNext" onclick="changeAcctPage(1)"' + (ACCT_PAGE >= ACCT_TOTAL_PAGES ? ' disabled' : '') + '>下一页</button>'
    + '</div></div>';
}
// 第一个参数严格等于 true（只有轮询这么传）——数据与视图都没变就不重画表格。
// 用户操作（启停、排序、翻页、切区域）一律无参调用，照常重画；只认 === true，
// 免得被当回调时传进来的事件/数据对象误触发跳过。
function renderAccounts(){
  // Same data source as the account cards, so the two views can never disagree.
  renderDisabled();
  if(typeof updateTaskPageCheckinCards === 'function') updateTaskPageCheckinCards();
  const box = document.getElementById('accounts');
  const currentView = (window.VIEW_REALM || "intl");
  let list = accountsInView();
  const skipIfSame = arguments[0] === true;
  if(ACCT_PAGE_REALM !== currentView){ ACCT_PAGE_REALM = currentView; ACCT_PAGE = 1; }
  const filterKey = ACCOUNT_FILTERS.query + '\u0001' + ACCOUNT_FILTERS.status;
  if(ACCT_PAGE_FILTER !== filterKey){ ACCT_PAGE_FILTER = filterKey; ACCT_PAGE = 1; }
  const unfilteredCount = list.length;
  list = list.filter(accountMatchesFilters);
  const filterCount = document.getElementById('accountFilterCount');
  if(filterCount) filterCount.textContent = '显示 ' + list.length + ' / ' + unfilteredCount + ' 个账号';
  // 排序：停用的永远沉底（备注/权重再高也一样）→ 备注是启用组内的加分项
  // （有备注的账号只在同权重时排前面，不再全局置顶）→ 权重高的在前 →
  // 同权重保持服务端顺序稳定，表格不乱跳。
  list = list.map((a, i) => [a, i])
    .sort((x, y) => {
      if(x[0].enabled !== y[0].enabled) return x[0].enabled ? -1 : 1;
      const nx = x[0].note ? 0 : 1, ny = y[0].note ? 0 : 1;
      if(nx !== ny) return nx - ny;
      const wx = Number(x[0].weight || 1) || 1, wy = Number(y[0].weight || 1) || 1;
      if(wx !== wy) return wy - wx;
      return x[1] - y[1];
    })
    .map(pair => pair[0]);
  const usable = list.filter(a => a.enabled).length;
  const viewName = currentView === 'cn' ? '国内版' : '国际版';
  ACCT_TOTAL_PAGES = Math.max(1, Math.ceil(list.length / ACCT_PAGE_SIZE));
  if(ACCT_PAGE > ACCT_TOTAL_PAGES) ACCT_PAGE = ACCT_TOTAL_PAGES;
  if(ACCT_PAGE < 1) ACCT_PAGE = 1;
  const fp = accountsRenderFp();
  if(skipIfSame && fp === lastAccountsFp) return;
  lastAccountsFp = fp;
  document.getElementById('acctCount').textContent =
    list.length ? ('（' + viewName + '共 ' + list.length + ' 个，启用 ' + usable + ' 个）') : '';
  if(!list.length){
    if(unfilteredCount){
      box.innerHTML = '<div class="console-filter-empty"><span>没有符合当前条件的账号</span><button type="button" class="sec mini" onclick="clearAccountFilters()">清除筛选</button></div>';
      return;
    }
    box.innerHTML =
      '<div style="text-align:center;padding:30px 16px">'
      + '<div style="font-size:15px;margin-bottom:8px">当前' + viewName + '还没有账号</div>'
      + '<div style="color:var(--dim);font-size:13px;margin-bottom:18px">'
      +   '请先登录或导入一个 ' + viewName + ' 账号，之后相关请求都会走该账号'
      + '</div>'
      + '<button onclick="openLoginModal()" style="font-size:14px;padding:10px 22px">'
      +   '登录新账号 (OAuth)'
      + '</button>'
      + '</div>';
    return;
  }
  const tableHtml = body => '<div class="table-wrap"><table class="data-cards account-cards"><thead><tr>'
    + '<th style="text-align:center;width:76px">版本</th>'
    + '<th style="text-align:left">账号</th>'
    + '<th style="text-align:center;width:84px">状态</th>'
    + '<th style="text-align:center;width:118px">今日活动</th>'
    + '<th style="text-align:center;width:150px">出口</th>'
    + '<th style="text-align:center;width:64px">权重</th>'
    + '<th style="text-align:left;width:120px">积分</th>'
    + '<th style="text-align:right;width:70px">请求</th>'
    + '<th style="text-align:right;width:88px">总 token</th>'
    + '<th style="text-align:right;width:80px">缓存</th>'
    + '<th style="text-align:center;width:232px">操作</th>'
    + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  const pager = ACCT_TOTAL_PAGES > 1 ? acctPagerHtml(list.length) : '';
  const lo = (ACCT_PAGE - 1) * ACCT_PAGE_SIZE;
  ACCT_FIXED_KINDS = null;
  if(ACCT_TOTAL_PAGES > 1 && SORT_STATE.accounts){
    // 有表头排序时按单元格排（applyTableSort 的口径），而它只认 DOM：先在游离
    // 节点里画出全部账号排好序（不进文档、不触发布局），再把这一页的行搬进来。
    const tmp = document.createElement('div');
    tmp.innerHTML = tableHtml(list.map(accountRow).join(''));
    ACCT_FIXED_KINDS = applyTableSort('accounts', tmp) || null;
    const units = [];
    Array.from(tmp.querySelector('tbody').children).forEach(r => {
      if(units.length && r.classList.contains('cool-row')) units[units.length - 1].push(r);
      else units.push([r]);
    });
    box.innerHTML = tableHtml('') + pager;
    const tbody = box.querySelector('tbody');
    units.slice(lo, lo + ACCT_PAGE_SIZE).forEach(u => u.forEach(r => tbody.appendChild(r)));
  } else {
    box.innerHTML = tableHtml(list.slice(lo, lo + ACCT_PAGE_SIZE).map(accountRow).join('')) + pager;
  }
  // 表下不再堆两行说明图例（出站身份解释留在每行身份按钮组的悬停提示里，
  // 轮询/粘性说明挂到「账号列表」标题上），表格底部保持干净。
  applyTableSort('accounts');
}

// 自动补积分快照：每个账号每次页面加载最多补一次，只补缺积分的那几个号。原来
// 只要有一个号缺积分就 POST 不带参数的 /accounts/credits——服务端把整池逐个
// 刷一遍（上百个号要几分钟），刷不到的号（失效 / API Key）每 15 秒再触发一轮。
// 手动「一键刷新积分」不走这里，行为不变。
const CREDITS_AUTO_TRIED = new Set();
let CREDITS_AUTO_BUSY = false;
function autoFetchMissingCredits(){
  if(CREDITS_AUTO_BUSY) return;
  const uids = (window.ACCOUNTS || [])
    .filter(a => a && a.uid && !a.credits && !CREDITS_AUTO_TRIED.has(a.uid))
    .map(a => a.uid);
  if(!uids.length) return;
  uids.forEach(u => CREDITS_AUTO_TRIED.add(u));
  CREDITS_AUTO_BUSY = true;
  postJSON('/accounts/credits', {uids: uids}).then(r => {
    // 撞上别人正在跑的全量刷（busy）：这一次什么都没刷，放回去下一轮再补。
    if(r && r.busy){ uids.forEach(u => CREDITS_AUTO_TRIED.delete(u)); return; }
    window.ACCOUNTS = r.accounts || ACCOUNTS;
    renderAccounts();
  }).catch(e => {
    console.log('[wb] 自动补积分失败: ' + (e && e.message));
  }).finally(() => { CREDITS_AUTO_BUSY = false; });
}

// poll=true 只给定时轮询 / 切页签 / 回到前台用：数据没变时不重画表格。操作之后
// 的回读一律不带参数，整表重画。/accounts 始终 no-store：响应里有带凭据的代理
// 地址，不能落浏览器磁盘缓存。
async function loadAccounts(poll){
  try{
    const [acct, byAcct] = await Promise.all([
      getJSON('/accounts?realm=all'),
      getJSON('/usage/by-account', POLL_READ),
      // 今日活动与账号列表并行取；它自己吞掉失败，读不到历史不该让账号区跟着坏。
      loadActivityToday(),
    ]);
    window.ACCOUNTS = acct.accounts || [];
    USAGE_BY_ACCOUNT = {};
    (byAcct.accounts || []).forEach(a => { USAGE_BY_ACCOUNT[a.account] = a; });
    await loadProxySlots();
    renderAccounts(!!poll);
    renderConsoleAccountHealth(window.ACCOUNTS || []);
    updateUI();
    // 昵称刚到位，补画一次积分扣减历史：它和本请求是并行的，先渲染的那次只有 uid。
    if(LAST_CREDIT_DATA) renderCreditHistory();
    autoFetchMissingCredits();
  }catch(e){ toast('账号加载失败: ' + e.message); }
}

async function fetchCredits(btn){
  if(btn){ btn.disabled = true; btn.textContent = '刷新中...'; }
  const currentView = (window.VIEW_REALM || "intl");
  const viewName = currentView === 'cn' ? '国内版' : '国际版';
  try{
    const r = await postJSON('/accounts/credits', {realm: currentView});
    await loadAccounts();
    refresh();
    const count = (r.results || []).length;
    toast('已成功刷新当前' + viewName + ' ' + count + ' 个账号的积分', 'ok');
  }catch(e){
    toast('刷新积分失败: ' + e.message, 'bad');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '一键刷新积分'; }
  }
}
const queryCredits = fetchCredits;

async function toggleAccount(uid, enable, btn){
  if(btn) btn.disabled = true;
  try{
    await postJSON('/accounts/set', {uid: uid, enabled: enable});
    await loadAccounts();
    toast(enable ? '账号已成功启用' : '账号已停用', 'ok');
  }catch(e){
    toast('操作失败: ' + e.message, 'bad');
  }finally{
    if(btn) btn.disabled = false;
  }
}
async function toggleAccountTasks(uid, enable){
  try{
    await postJSON('/accounts/set', {uid: uid, tasksEnabled: enable});
    await loadAccounts();
    toast(enable ? '该账号已参与任务' : '该账号已停止任务', 'ok');
  }catch(e){
    toast('操作失败: ' + e.message, 'bad');
  }
}

async function setAccountWeight(uid, weight, sel){
  if(sel) sel.disabled = true;
  try{
    await postJSON('/accounts/set', {uid: uid, weight: Number(weight)});
    await loadAccounts();
    toast(Number(weight) > 1 ? '权重已调整：该账号将优先接单' : '权重已恢复默认', 'ok');
  }catch(e){
    toast('权重设置失败: ' + e.message, 'bad');
    renderAccounts();
  }finally{
    if(sel) sel.disabled = false;
  }
}
async function editAccountNote(uid){
  const cur = (window.ACCOUNTS || []).find(a => a.uid === uid);
  const next = prompt('账号备注（留空清除；可用来标记「批量」/「自用」）:', (cur && cur.note) || '');
  if(next === null) return;
  try{
    await postJSON('/accounts/set', {uid: uid, note: next});
    await loadAccounts();
    toast(next.trim() ? '备注已保存' : '备注已清除', 'ok');
  }catch(e){
    toast('备注保存失败: ' + e.message, 'bad');
  }
}

async function editAccountDisabledModels(uid){
  const cur = (window.ACCOUNTS || []).find(a => a.uid === uid);
  if(!cur) return;
  // 按**该账号自己的**区域取模型清单：看板当前视图切到别的区域时，
  // MODELS_DATA 里那份是另一个区域的，用它会给出对不上的选项。
  const realm = cur.realm || window.VIEW_REALM;
  let models = [];
  try{
    const r = await getJSON('/v1/models?realm=' + encodeURIComponent(realm));
    models = (r.data || []).map(m => m.id).filter(Boolean).sort();
  }catch(e){
    toast('取模型清单失败: ' + e.message, 'bad');
    return;
  }
  if(!models.length){ toast('该区域没有可用模型', 'bad'); return; }

  const denied = new Set(cur.disabledModels || []);
  // 面板按「启用的模型」勾选，默认全选 = 不限制；**取消勾选即禁用**。
  const picked = new Set(models.filter(m => !denied.has(m)));
  const nick = esc(cur.nickname || uid.slice(0, 8));

  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.style.display = 'flex';
  mask.innerHTML = '<div class="modal" role="dialog" aria-modal="true" style="width:min(560px,100%)">'
    + '<div class="modal-hd"><h2>启用模型 · ' + nick + '</h2>'
    +   '<button class="modal-x" aria-label="关闭">×</button></div>'
    + '<div class="modal-bd">'
    +   '<div style="font-size:12px;color:var(--dim);line-height:1.7;margin-bottom:10px">'
    +     '取消勾选的模型<b>不再派给这个账号</b>，请求会自动落到池子里其他账号；其余模型不受影响。'
    +     '<br>默认全部勾选 = 不限制。区域 <b>' + esc(realm) + '</b>，共 ' + models.length + ' 个模型。'
    +   '</div>'
    +   '<div id="mdmList" style="max-height:46vh;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:4px 10px"></div>'
    +   '<div style="display:flex;align-items:center;gap:8px;margin-top:12px">'
    +     '<button class="sec" id="mdmAll">全选</button>'
    +     '<button class="sec" id="mdmNone">全不选</button>'
    +     '<span style="flex:1"></span><span id="mdmCount" style="font-size:12px"></span>'
    +   '</div>'
    + '</div>'
    + '<div class="modal-ft">'
    +   '<button class="sec" id="mdmCancel">取消</button>'
    +   '<button id="mdmSave">保存</button>'
    + '</div></div>';

  const listEm = mask.querySelector('#mdmList');
  const countEm = mask.querySelector('#mdmCount');
  listEm.innerHTML = models.map(m =>
    '<label style="display:flex;align-items:center;gap:8px;padding:5px 2px;cursor:pointer;font-size:13px">'
    + '<input type="checkbox" data-model="' + esc(m) + '"' + (picked.has(m) ? ' checked' : '') + '>'
    + '<span class="mono">' + esc(m) + '</span></label>').join('');
  function updateCount(){
    const off = models.length - picked.size;
    countEm.textContent = off ? ('将禁用 ' + off + ' 个') : '不限制';
    countEm.style.color = off ? 'var(--warn)' : 'var(--dim)';
  }
  updateCount();
  // 只更新计数、不重建复选框：重建会把滚动位置和焦点抖掉。
  listEm.addEventListener('change', function(ev){
    const box = ev.target;
    if(!box || box.type !== 'checkbox') return;
    if(box.checked) picked.add(box.dataset.model);
    else picked.delete(box.dataset.model);
    updateCount();
  });
  function setAll(on){
    picked.clear();
    if(on) models.forEach(m => picked.add(m));
    listEm.querySelectorAll('input[type=checkbox]').forEach(b => { b.checked = on; });
    updateCount();
  }
  mask.querySelector('#mdmAll').onclick = function(){ setAll(true); };
  mask.querySelector('#mdmNone').onclick = function(){ setAll(false); };
  function close(){ mask.remove(); }
  mask.querySelector('.modal-x').onclick = close;
  mask.querySelector('#mdmCancel').onclick = close;
  mask.addEventListener('click', function(ev){ if(ev.target === mask) close(); });
  mask.querySelector('#mdmSave').onclick = async function(){
    const denyList = models.filter(m => !picked.has(m));   // 未勾选 = 禁用
    try{
      await postJSON('/accounts/set', {uid: uid, disabledModels: denyList});
      await loadAccounts();
      toast(denyList.length ? ('已禁用 ' + denyList.length + ' 个模型') : '已取消模型禁用', 'ok');
      close();
    }catch(e){
      toast('保存失败: ' + e.message, 'bad');
    }
  };
  document.body.appendChild(mask);
}
async function setAccountProduct(uid, prod, btn){
  const names = {
    'workbuddy': 'WorkBuddy 独立桌面客户端 (WB)',
    'vscode': '官方 VSCode 插件 (VSC)',
    'cli': '官方 CodeBuddy CLI (CLI)'
  };
  const label = names[prod] || prod;
  if(!confirm('将该账号的出站身份切换为 ' + label + '？\n\n不同身分对应不同的出站指纹、端点和配额通道。')) return;
  if(btn){ btn.disabled = true; }
  try {
    const r = await postJSON('/accounts/product', {uid: uid, product: prod});
    toast('已切换为 ' + label, 'ok');
    await loadAccounts();
  } catch(e) {
    toast('切换失败: ' + e.message, 'bad');
  } finally {
    if(btn){ btn.disabled = false; }
  }
}
async function switchProduct(uid, btn){ return setAccountProduct(uid, 'workbuddy', btn); }
// 一键切换所有出站身份：后端 /accounts/product 不带 uid / realm 就是全量
// （含另一个版本），所以这里只负责挑下一个身分、并把当前身分显示在按钮上。
const PRODUCT_ORDER = ['workbuddy', 'vscode', 'cli'];
const PRODUCT_SHORT = {workbuddy: 'WB', vscode: 'VSC', cli: 'CLI'};
function allProductsUniform(){
  const list = window.ACCOUNTS || [];
  if(!list.length) return null;
  const first = list[0].product || 'workbuddy';
  return list.every(a => (a.product || 'workbuddy') === first) ? first : null;
}
function updateProductAllButton(){
  const label = document.getElementById('productAllLabel');
  if(!label) return;
  // 账号还没加载完时保持原样，别把按钮先写成「混合」再改回来。
  if(!(window.ACCOUNTS || []).length) return;
  const cur = allProductsUniform();
  label.textContent = cur ? PRODUCT_SHORT[cur] : '混合';
}
async function cycleAllProducts(btn){
  const list = window.ACCOUNTS || [];
  if(!list.length){ toast('还没有账号', 'bad'); return; }
  const cur = allProductsUniform();
  // cur 为 null（各账号身分不一致）时落到第一项，等于「统一成 WB」。
  const next = PRODUCT_ORDER[(PRODUCT_ORDER.indexOf(cur) + 1) % PRODUCT_ORDER.length];
  const label = PRODUCT_SHORT[next];
  if(!confirm('将把全部账号的出站身份切换为 ' + label + '？（含另一个版本）')) return;
  if(btn) btn.disabled = true;
  try{
    await postJSON('/accounts/product', {product: next});
    await loadAccounts();
    toast('已把全部账号的出站身份切换为 ' + label, 'ok');
  }catch(e){
    toast('切换失败: ' + e.message, 'bad');
  }finally{
    if(btn) btn.disabled = false;
  }
}

async function refreshOne(uid, btn){
  if(btn){ btn.disabled = true; btn.textContent = '刷新中...'; }
  try{
    const r = await postJSON('/accounts/refresh', {uid: uid});
    const ok = (r.results||[])[0];
    toast(ok && ok.ok ? '账号凭证刷新成功' : ('刷新失败: ' + (ok && ok.error || '未知错误')), ok && ok.ok ? 'ok' : 'bad');
    await loadAccounts();
  }catch(e){
    toast('刷新失败: ' + e.message, 'bad');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '刷新凭证'; }
  }
}
async function syncProfile(uid, btn){
  if(btn){ btn.disabled = true; btn.textContent = '同步中...'; }
  try{
    const r = await postJSON('/accounts/sync-profile', {uid: uid});
    const item = (r.updated || [])[0];
    const bad = (r.failed || [])[0];
    if(item && item.nickname) toast('昵称已同步: ' + item.nickname, 'ok');
    else if(bad) toast('同步失败: ' + bad.error, 'bad');
    else toast('同步完成（上游未返回昵称）', 'warn');
    await loadAccounts();
  }catch(e){
    toast('同步失败: ' + e.message, 'bad');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '同步昵称'; }
  }
}
async function testAccount(uid, btn){
  if(btn){ btn.disabled = true; btn.textContent = '测试中...'; }
  try{
    const r = await postJSON('/accounts/test', {uid: uid});
    if(r.ok){
      toast('测试通过 (' + r.elapsed_ms + 'ms) [' + r.model + ']: ' + (r.reply || '正常'), 'ok');
    } else if(r.network){
      // 本机断网时上游一个字节都没收到：说清是网络问题，别让人以为账号坏了。
      toast('本机网络不可用: ' + (r.error || 'DNS/路由失败'), 'bad');
    } else {
      toast('测试失败: ' + (r.error || r.status || '异常'), 'bad');
    }
    await loadAccounts();
  }catch(e){
    toast('测试请求失败: ' + e.message, 'bad');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '测试'; }
  }
}

/* 一键测试：区域内每个已启用账号 + 本机连通性一次看全。
   池子出问题时最需要分辨的就是「账号真不行」与「本机没网 / 只是被本地窗口关着」，
   红点一屏的时候，逐个点测出来的结论往往是错的。 */
function openTestAll(){
  const m = document.getElementById('testAllModal');
  const body = document.getElementById('testAllBody');
  if(body) body.innerHTML = '<p class="hint">正在测试…</p>';
  if(m) m.classList.add('show');
}
function closeTestAll(){
  const m = document.getElementById('testAllModal');
  if(m) m.classList.remove('show');
}

async function testAccounts(btn){
  if(btn){ btn.disabled = true; btn.textContent = '测试中...'; }
  openTestAll();
  try{
    const r = await postJSON('/accounts/test', {realm: window.VIEW_REALM});
    renderTestAll(r);
    const s = r.summary || {};
    if(s.networkDown){
      toast('本机网络不通：' + ((r.network || {}).error || 'DNS/路由失败') + '（账号未被计入熔断）', 'bad');
    } else {
      toast('一键测试: ' + (s.passed || 0) + '/' + (s.tested || 0) + ' 通过 (' + (s.elapsed_ms || 0) + 'ms)',
            (s.failed ? 'warn' : 'ok'));
    }
    await loadAccounts();
  }catch(e){
    const body = document.getElementById('testAllBody');
    if(body) body.innerHTML = '<p class="hint" style="color:var(--warn)">测试请求失败: ' + esc(e.message) + '</p>';
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '一键测试'; }
  }
}

function renderTestAll(r){
  const body = document.getElementById('testAllBody');
  if(!body) return;
  const net = r.network || {};
  const s = r.summary || {};
  const rows = r.results || [];
  let html = '';
  // 本机连通性单独一行放最前面：它不通的话，下面的红点一个都不能算账号的账。
  html += '<div style="background:' + (net.ok ? 'var(--accent2-soft)' : 'var(--bad-soft)')
    + ';border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:13px">'
    + '<b>' + (net.ok ? '本机网络正常' : '本机网络不通') + '</b>'
    + '<span class="hint" style="margin-left:8px">' + esc(net.host || '')
    + (net.ip ? ' → ' + esc(net.ip) : '')
    + (net.dns_ms !== null && net.dns_ms !== undefined ? ' · DNS ' + net.dns_ms + 'ms' : '')
    + (net.tcp_ms !== null && net.tcp_ms !== undefined ? ' · TCP ' + net.tcp_ms + 'ms' : '')
    + (net.ok ? '' : ' · ' + esc(net.error || ''))
    + '</span></div>';
  html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px;font-size:13px">'
    + '<span>共测 <b>' + esc(String(s.tested || 0)) + '</b></span>'
    + '<span>通过 <b style="color:var(--accent2)">' + esc(String(s.passed || 0)) + '</b></span>'
    + '<span>失败 <b style="color:var(--warn)">' + esc(String(s.failed || 0)) + '</b></span>'
    + '<span class="hint">模型 ' + esc(s.model || '') + ' · 耗时 ' + esc(String(s.elapsed_ms || 0)) + 'ms</span>'
    + '</div>';
  if(!rows.length){
    html += '<p class="hint">该区域没有已启用的账号。</p>';
  } else {
    html += '<div class="table-wrap"><table class="data-cards"><thead><tr>'
      + '<th style="text-align:left">账号</th><th style="text-align:center">结果</th>'
      + '<th style="text-align:center;width:90px">耗时</th>'
      + '<th style="text-align:left">回复 / 原因</th></tr></thead><tbody>';
    rows.forEach(row => {
      // 本机断网的行单独标出来：这不是账号的问题，不该跟真失败画成一个颜色。
      const badge = row.ok ? '<span class="badge ok">通过</span>'
                  : row.network ? '<span class="badge warn">本机网络</span>'
                  : '<span class="badge bad">失败</span>';
      const detail = row.ok ? (row.reply || '正常') : (row.error || '');
      // 失败行带上「连续失败 N 次」：这是熔断的唯一依据，看得见才知道离熔断还有多远。
      const ladder = (!row.ok && Number(row.fails || 0) > 0)
        ? '（连续失败 ' + Number(row.fails) + ' 次）' : '';
      html += '<tr>'
        + '<td style="text-align:left"><b>' + esc(row.nickname || (row.uid || '').slice(0, 8)) + '</b>'
        + '<div class="mono" style="font-size:11px;color:var(--dim)">'
        + esc((row.uid || '').slice(0, 8)) + ' · ' + esc(row.realm === 'cn' ? '国内版' : '国际版') + '</div></td>'
        + '<td style="text-align:center">' + badge + '</td>'
        + '<td style="text-align:center">' + esc(String(row.elapsed_ms || 0)) + 'ms</td>'
        + '<td style="text-align:left;font-size:12px">' + esc(detail + ladder) + '</td>'
        + '</tr>';
    });
    html += '</tbody></table></div>';
  }
  body.innerHTML = html;
}
async function refreshAccounts(btn){
  if(btn){ btn.disabled = true; btn.textContent = '刷新中...'; }
  try{
    const r = await postJSON('/accounts/refresh', {});
    const results = r.results || [];
    const okc = results.filter(x=>x.ok).length;
    const bad = results.filter(x=>!x.ok);
    toast('刷新完成: ' + okc + '/' + results.length, bad.length ? 'warn' : 'ok');
    if(bad.length){
      toast('刷新失败: ' + (bad[0].error || '未知错误') + ' (' + bad.length + ')', 'bad');
    }
    await loadAccounts();
  }catch(e){
    toast('刷新失败: ' + e.message, 'bad');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '一键刷新凭证'; }
  }
}
async function setAll(enable, btn){
  if(btn) btn.disabled = true;
  try{
    await postJSON('/accounts/set-all', {enabled: enable});
    await loadAccounts();
    toast(enable ? '已全部启用所有账号' : '已全部停用所有账号', 'ok');
  }catch(e){
    toast('批量操作失败: ' + e.message, 'bad');
  }finally{
    if(btn) btn.disabled = false;
  }
}
async function deleteAccount(uid, name, btn){
  if(!confirm("确定删除账号 " + name + "？")) return;
  if(btn) btn.disabled = true;
  try{
    await postJSON('/accounts/delete', {uid: uid});
    if(typeof CURRENT_GROWTH_UID !== 'undefined' && CURRENT_GROWTH_UID === uid){
      CURRENT_GROWTH_UID = 'all';
    }
    await loadAccounts();
    if(typeof loadGrowthTasks === 'function'){
      await loadGrowthTasks();
    }
    toast('已成功删除账号 ' + name, 'ok');
  }catch(e){
    toast('删除失败: ' + e.message, 'bad');
  }finally{
    if(btn) btn.disabled = false;
  }
}

/* ---- 账号导出 / 导入 ---- */
async function downloadExport(query, fallbackLabel){
  // Fetch through the authorised JSON API and save the blob client-side.
  // A plain <a href> would not carry the X-Panel-Token header, so a
  // password-only session would be rejected.
  const r = await fetch('/accounts/export' + (query || ''), {cache:'no-store', headers: authHeaders()});
  if(r.status === 401 || r.status === 403){ panelSessionLost(); throw new Error('unauthorized'); }
  if(r.status === 404){
    let msg = '账号不存在';
    try{ const e = await r.json(); msg = (e.error && e.error.message) || msg; }catch(_){}
    throw new Error(msg);
  }
  if(!r.ok) throw new Error('HTTP ' + r.status);
  const text = await r.text();
  let doc;
  try{ doc = JSON.parse(text); }catch(e){ throw new Error('返回内容不是 JSON'); }
  const stamp = new Date().toISOString().slice(0,19).replace(/[-:T]/g,'');
  const name = 'workbuddy-accounts-' + (fallbackLabel || '') + stamp + '.json';
  const blob = new Blob([text], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return {count: doc.count || 0, name: name};
}

async function exportAccounts(btn){
  if(btn){ btn.disabled = true; btn.textContent = '导出中...'; }
  try{
    const r = await downloadExport('', '');
    toast('已导出 ' + r.count + ' 个账号 → ' + r.name);
  }catch(e){
    toast('导出失败: ' + e.message, 'err');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '导出'; }
  }
}

async function exportOne(uid){
  // Same document format as the bulk export, just narrowed to one account, so
  // the file can be re-imported on another instance without editing.
  try{
    const r = await downloadExport('?uid=' + encodeURIComponent(uid), uid.slice(0,8) + '-');
    toast('已导出 1 个账号 → ' + r.name);
  }catch(e){
    toast('导出失败: ' + e.message, 'err');
  }
}

let importRows = null;   // 已解析、待导入的账号行

function openImport(){
  importRows = null;
  const m = document.getElementById('importModal');
  const body = document.getElementById('importBody');
  const ow = document.getElementById('importOverwrite');
  if(ow) ow.checked = false;
  if(body) body.innerHTML = '<p class="hint">正在打开文件…</p>';
  if(m) m.classList.add('show');
  // The picker is created per call so choosing the same file twice still fires.
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = '.json,application/json';
  picker.onchange = () => {
    const f = picker.files && picker.files[0];
    if(!f){ closeImport(); return; }
    readImportFile(f);
  };
  picker.click();
}

function openApiKeyModal(){
  const m = document.getElementById('apiKeyModal');
  const input = document.getElementById('apiKeyInput');
  const name = document.getElementById('apiKeyNickname');
  const msg = document.getElementById('apiKeyModalMsg');
  const btn = document.getElementById('btnApiKeyCommit');
  if(input) input.value = '';
  if(name) name.value = '';
  if(msg) msg.textContent = '';
  if(btn){ btn.disabled = false; btn.textContent = '验证并添加'; }
  if(m) m.classList.add('show');
  if(input) setTimeout(() => input.focus(), 50);
}

function closeApiKeyModal(){
  const m = document.getElementById('apiKeyModal');
  if(m) m.classList.remove('show');
  const input = document.getElementById('apiKeyInput');
  // 关掉就抹掉：这串东西等同于账号本身，留在 DOM 里没有任何好处。
  if(input) input.value = '';
}

async function commitApiKey(btn){
  const input = document.getElementById('apiKeyInput');
  const name = document.getElementById('apiKeyNickname');
  const msg = document.getElementById('apiKeyModalMsg');
  const key = (input && input.value || '').trim();
  if(!key){
    if(msg){ msg.style.color = 'var(--warn)'; msg.textContent = '请先填入 API Key'; }
    return;
  }
  if(!/^(ck_|pt_)/.test(key)){
    if(msg){ msg.style.color = 'var(--warn)'; msg.textContent = '前缀不对：应当以 ck_ 或 pt_ 开头'; }
    return;
  }
  if(btn){ btn.disabled = true; btn.textContent = '验证中…'; }
  if(msg){ msg.style.color = 'var(--dim)'; msg.textContent = '正在用企业额度端点验一次…'; }
  try{
    const r = await postJSON('/accounts/add-api-key', {
      key: key,
      nickname: (name && name.value || '').trim(),
    });
    const probe = r.probe || {};
    let msg = (r.updated ? '已更新 ' : '已添加 ') + (r.nickname || r.uid || 'API Key 账号');
    if(probe.limit !== undefined && probe.limit !== null){
      msg += ' · 额度 ' + probe.limit
           + (probe.used !== undefined && probe.used !== null ? '，本期已用 ' + probe.used : '');
    }
    toast(msg);
    closeApiKeyModal();
    // 与导入一致：只重拉账号列表，不整页刷新（会打断正在看的其他面板）。
    await loadAccounts();
  }catch(e){
    if(msg){ msg.style.color = 'var(--warn)'; msg.textContent = '添加失败: ' + e.message; }
    if(btn){ btn.disabled = false; btn.textContent = '验证并添加'; }
  }
}

function closeImport(){
  const m = document.getElementById('importModal');
  if(m) m.classList.remove('show');
  importRows = null;
  const btn = document.getElementById('btnImportCommit');
  if(btn) btn.disabled = true;
}

async function readImportFile(file){
  const body = document.getElementById('importBody');
  try{
    const text = await file.text();
    let doc;
    try{ doc = JSON.parse(text); }
    catch(e){ throw new Error('文件不是合法 JSON'); }

    // Accept the export document, a bare array, or a single account object.
    let rows;
    if(Array.isArray(doc)) rows = doc;
    else if(doc && Array.isArray(doc.accounts)) rows = doc.accounts;
    else if(doc && (doc.accessToken || doc.auth)) rows = [doc];
    else throw new Error('文件里没有找到账号（既没有 accounts 数组，也不是单个账号）');

    if(!rows.length) throw new Error('账号列表是空的');
    importRows = rows;

    // Dry-run first so the user sees exactly what will happen.
    const r = await postJSON('/accounts/import', {data: doc, dryRun: true});
    renderImportPreview(file.name, r.result || {}, rows.length);
  }catch(e){
    importRows = null;
    const btn = document.getElementById('btnImportCommit');
    if(btn) btn.disabled = true;
    if(body) body.innerHTML = '<p class="hint" style="color:var(--warn)">读取失败: ' + esc(e.message) + '</p>';
  }
}

function renderImportPreview(filename, res, total){
  const body = document.getElementById('importBody');
  const btn = document.getElementById('btnImportCommit');
  const added = res.added || [], updated = res.updated || [];
  const skipped = res.skipped || [], invalid = res.invalid || [];

  const rowsHtml = list => list.map(x => {
    const uid = (typeof x === 'string' ? x : x.uid) || '?';
    const reason = (typeof x === 'object' && x.reason) ? ' — ' + esc(x.reason) : '';
    return '<li><code>' + esc(String(uid).slice(0,8)) + '</code>' + reason + '</li>';
  }).join('');

  let html = '<p class="hint" style="margin-top:0">文件：<b>' + esc(filename) + '</b>'
    + ' · 共 ' + total + ' 条</p>';
  html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px">'
    + '<span>新增 <b style="color:var(--accent2)">' + added.length + '</b></span>'
    + '<span>覆盖 <b>' + updated.length + '</b></span>'
    + '<span>跳过 <b>' + skipped.length + '</b></span>'
    + '<span>无效 <b style="color:var(--warn)">' + invalid.length + '</b></span>'
    + '</div>';

  if(added.length)   html += '<div style="margin-bottom:8px"><b>将新增</b><ul class="hint" style="margin:4px 0 0 18px;padding:0">' + rowsHtml(added) + '</ul></div>';
  if(updated.length) html += '<div style="margin-bottom:8px"><b>将覆盖</b><ul class="hint" style="margin:4px 0 0 18px;padding:0">' + rowsHtml(updated) + '</ul></div>';
  if(skipped.length) html += '<div style="margin-bottom:8px"><b>将跳过</b><ul class="hint" style="margin:4px 0 0 18px;padding:0">' + rowsHtml(skipped) + '</ul></div>';
  if(invalid.length) html += '<div style="margin-bottom:8px"><b>无法解析</b><ul class="hint" style="margin:4px 0 0 18px;padding:0">' + rowsHtml(invalid) + '</ul></div>';

  if(!added.length && !updated.length){
    html += '<p class="hint" style="color:var(--warn)">没有可导入的账号。'
      + (skipped.length ? '若要覆盖已存在的账号，请勾选下方「覆盖同 UID 账号」。' : '') + '</p>';
  }
  if(body) body.innerHTML = html;

  const canCommit = (added.length + updated.length) > 0;
  if(btn){
    btn.disabled = !canCommit;
    btn.textContent = '确认导入 ' + (added.length + updated.length) + ' 个';
  }
}

async function commitImport(btn){
  if(!importRows) return;
  const ow = document.getElementById('importOverwrite');
  const overwrite = !!(ow && ow.checked);
  if(overwrite && !confirm('将覆盖同 UID 的现有账号（含其凭证），确定继续？')) return;

  if(btn){ btn.disabled = true; btn.textContent = '导入中...'; }
  try{
    const r = await postJSON('/accounts/import', {data: importRows, overwrite: overwrite});
    const res = r.result || {};
    const n = (res.added || []).length + (res.updated || []).length;
    toast('导入完成：新增 ' + (res.added || []).length
          + '，覆盖 ' + (res.updated || []).length
          + '，跳过 ' + (res.skipped || []).length
          + '，无效 ' + (res.invalid || []).length);
    if(n > 0){ closeImport(); await loadAccounts(); }
    else { renderImportPreview('（已导入）', res, importRows.length); }
  }catch(e){
    toast('导入失败: ' + e.message, 'err');
    if(btn){ btn.disabled = false; btn.textContent = '确认导入'; }
  }
}

/* 桌面客户端账号：两步确认（先扫描展示弹窗，再逐条导入） */
async function scanDesktop(btn){
  if(btn){ btn.disabled = true; btn.textContent = '扫描中...'; }
  openDesktopScan();
  try{
    const acct = await getJSON('/accounts?realm=all').catch(() => ({accounts: []}));
    window.SCAN_POOL = new Set((acct.accounts || []).map(a => a.uid));
    const r = await postJSON('/accounts/import/desktop', {});
    renderDesktopScan(r.detected || [], r.atrest || null);
  }catch(e){
    const body = document.getElementById('desktopScanBody');
    if(body) body.innerHTML = '<p class="hint" style="color:var(--warn)">扫描失败: ' + esc(e.message) + '</p>';
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '扫描桌面客户端'; }
  }
}

/* --------------------------- credits detail modal --------------------------- */
let CURRENT_CREDIT_DETAIL_UID = null;
let CURRENT_CREDITS_DATA = null;
let CURRENT_PKG_FILTER = 'active';
let CURRENT_PKG_SEARCH = '';
let CURRENT_PKG_SORT = 'expiry_asc';

async function openCreditsDetail(uid, forceRefresh = false){
  CURRENT_CREDIT_DETAIL_UID = uid;
  CURRENT_PKG_FILTER = 'active';
  CURRENT_PKG_SEARCH = '';
  CURRENT_PKG_SORT = 'expiry_asc';

  const m = document.getElementById("creditsDetailModal");
  if(m) m.classList.add("show");

  const errEl = document.getElementById("creditsModalError");
  if(errEl) errEl.style.display = "none";
  const contEl = document.getElementById("creditsModalContent");
  if(contEl) contEl.style.display = "block";

  const searchInput = document.getElementById("cmPkgSearch");
  if(searchInput) searchInput.value = "";
  const sortSelect = document.getElementById("cmPkgSort");
  if(sortSelect) sortSelect.value = "expiry_asc";

  // 重置过滤器按钮高亮
  const filterBtns = document.querySelectorAll(".realm-filter button[data-filter]");
  filterBtns.forEach(b => {
    if(b.getAttribute("data-filter") === "all") b.classList.add("active");
    else b.classList.remove("active");
  });

  const acct = (window.ACCOUNTS || []).find(a => a.uid === uid);
  const titleEl = document.getElementById("creditsModalTitle");
  const realmEl = document.getElementById("creditsModalRealm");
  const tierEl = document.getElementById("creditsModalTier");
  if(titleEl) titleEl.textContent = (acct ? (acct.nickname || acct.uid.slice(0,8)) : uid.slice(0,8)) + " · 积分明细";
  if(realmEl && acct){
    realmEl.className = acct.realm === 'cn' ? 'realm-badge-cn' : 'realm-badge-intl';
    realmEl.textContent = acct.realm === 'cn' ? '国内版' : '国际版';
  }
  if(tierEl){
    if(acct && acct.credits && acct.credits.is_paid_user !== undefined){
      tierEl.style.display = "inline-block";
      tierEl.className = acct.credits.is_paid_user ? "badge mini ok" : "badge mini";
      tierEl.textContent = acct.credits.is_paid_user ? "付费用户" : "普通用户";
      const tier = acct.tier;
      tierEl.title = (tier && tier.package)
        ? (tier.package + (tier.checked_at ? " · " + new Date(tier.checked_at * 1000).toLocaleString() : ""))
        : "";
    } else {
      tierEl.style.display = "none";
    }
  }

  // 检查已缓存的数据是否包含有效期字段，若包含且无需强制刷新，先秒开渲染本地已缓存数据
  const cachedPkgs = (acct && acct.credits && Array.isArray(acct.credits.packages)) ? acct.credits.packages : [];
  const hasExpiryData = cachedPkgs.length > 0 && cachedPkgs.some(p => p.cycle_end_time || p.cycleEndTime || p.CycleEndTime || p.expired_time || p.ExpiredTime);
  if(!forceRefresh && hasExpiryData){
    CURRENT_CREDITS_DATA = acct.credits;
    renderCreditsDetail(acct.credits, acct);
    return;
  }

  await reloadCreditsDetail();
}

async function reloadCreditsDetail(btn){
  if(!CURRENT_CREDIT_DETAIL_UID) return;
  const btnEl = btn || document.getElementById("btnRefreshCreditsDetail");
  if(btnEl){ btnEl.disabled = true; btnEl.textContent = "刷新中..."; }
  const loadingEl = document.getElementById("creditsModalLoading");
  const contentEl = document.getElementById("creditsModalContent");
  const errorEl = document.getElementById("creditsModalError");
  if(loadingEl && (!contentEl || contentEl.style.display === 'none')) loadingEl.style.display = "block";
  if(errorEl) errorEl.style.display = "none";

  try {
    const res = await postJSON("/accounts/credits/detail", { uid: CURRENT_CREDIT_DETAIL_UID, refresh: true });
    if(res && res.ok && res.credits){
      CURRENT_CREDITS_DATA = res.credits;
      // 同步更新全局 window.ACCOUNTS 中的 credits
      const acct = (window.ACCOUNTS || []).find(a => a.uid === CURRENT_CREDIT_DETAIL_UID);
      if(acct){
        acct.credits = res.credits;
        acct.tokenExpired = false;
        renderAccounts();
      }
      if(errorEl) errorEl.style.display = "none";
      if(contentEl) contentEl.style.display = "block";
      renderCreditsDetail(res.credits, acct);
    } else {
      const errMsg = (res && res.error) || "请确认后端代理服务已重启以加载新代码";
      const isAuthErr = errMsg.includes("401") || errMsg.includes("登录") || errMsg.includes("过期")
        || errMsg.includes("Unauthorized") || errMsg.includes("Authorization")
        || errMsg.toLowerCase().includes("token") || !!(res && res.need_relogin);
      if(contentEl) contentEl.style.display = "none";
      if(errorEl){
        errorEl.style.display = "block";
        const titleEl = document.getElementById("creditsModalErrorTitle");
        const msgEl = document.getElementById("creditsModalErrorMsg");
        const btnRelogin = document.getElementById("btnCreditsRelogin");
        if(titleEl) titleEl.textContent = isAuthErr ? "登录凭证已失效" : "拉取积分明细失败";
        if(msgEl) msgEl.textContent = errMsg;
        if(btnRelogin) btnRelogin.style.display = isAuthErr ? "inline-block" : "none";
      }
      if(isAuthErr){
        const acct = (window.ACCOUNTS || []).find(a => a.uid === CURRENT_CREDIT_DETAIL_UID);
        if(acct){
          acct.tokenExpired = true;
          acct.lastError = errMsg;
          renderAccounts();
        }
      }
      toast(isAuthErr ? "登录已过期，请重新登录" : ("拉取积分明细失败: " + errMsg), "bad");
    }
  } catch(e) {
    if(contentEl) contentEl.style.display = "none";
    if(errorEl){
      errorEl.style.display = "block";
      const titleEl = document.getElementById("creditsModalErrorTitle");
      const msgEl = document.getElementById("creditsModalErrorMsg");
      const btnRelogin = document.getElementById("btnCreditsRelogin");
      if(titleEl) titleEl.textContent = "网络异常";
      if(msgEl) msgEl.textContent = e.message;
      if(btnRelogin) btnRelogin.style.display = "none";
    }
    toast("网络异常: " + e.message, "bad");
  } finally {
    if(loadingEl) loadingEl.style.display = "none";
    if(btnEl){ btnEl.disabled = false; btnEl.textContent = "刷新明细"; }
  }
}

function filterCreditsPackages(filterType, btn){
  CURRENT_PKG_FILTER = filterType;
  const parent = btn && btn.parentNode;
  if(parent){
    parent.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }
  renderCreditsPackagesTable();
}

function onCreditsSearchInput(val){
  CURRENT_PKG_SEARCH = (val || "").trim().toLowerCase();
  renderCreditsPackagesTable();
}

function onCreditsSortChange(val){
  CURRENT_PKG_SORT = val || "expiry_asc";
  renderCreditsPackagesTable();
}

function renderCreditsDetail(credits, acct){
  if(!credits) return;
  CURRENT_CREDITS_DATA = credits;
  const remain = Number(credits.remain) || 0;
  const used = Number(credits.used) || 0;
  const size = Number(credits.size) || (remain + used);
  const usedPct = credits.used_percent || (size > 0 ? (used / size * 100).toFixed(1) + '%' : '0.0%');

  const elRemain = document.getElementById("cmMetricRemain");
  const elUsed = document.getElementById("cmMetricUsed");
  const elTotal = document.getElementById("cmMetricTotal");
  const elUsedPct = document.getElementById("cmUsedPercent");
  const elBar = document.getElementById("cmProgressBar");
  const elUpdated = document.getElementById("cmUpdatedText");

  if(elRemain) elRemain.textContent = fmt(remain);
  if(elUsed) elUsed.textContent = fmt(used);
  if(elTotal) elTotal.textContent = fmt(size);
  if(elUsedPct) elUsedPct.textContent = usedPct;
  if(elBar){
    const frac = size > 0 ? Math.min(100, Math.max(0, (used / size) * 100)) : 0;
    elBar.style.width = frac.toFixed(1) + "%";
    elBar.style.background = frac >= 90 ? "var(--bad)" : frac >= 70 ? "var(--warn)" : "var(--accent)";
  }
  if(elUpdated) elUpdated.textContent = "更新时间: " + (credits.updated_iso || "刚刚");

  // 会员等级徽章
  const tierEl = document.getElementById("creditsModalTier");
  if(tierEl){
    if(credits.is_paid_user !== undefined){
      tierEl.style.display = "inline-block";
      tierEl.className = credits.is_paid_user ? "badge mini ok" : "badge mini";
      tierEl.textContent = credits.is_paid_user ? "付费用户" : "普通用户";
    } else {
      tierEl.style.display = "none";
    }
  }

  // 最近到期卡片（优先取后端计算的 earliest_expiring，缺失时前端自动推导）
  const elExpVal = document.getElementById("cmExpiryValue");
  const elExpSub = document.getElementById("cmExpirySub");
  if(elExpVal && elExpSub){
    let ep = credits.earliest_expiring;
    if(!ep && Array.isArray(credits.packages)){
      const candidates = [];
      credits.packages.forEach(p => {
        if(p.no_expiry) return;
        const rem = Number(p.remain ?? p.CycleCapacityRemain) || 0;
        const eStr = p.cycle_end_time || p.cycleEndTime || p.CycleEndTime || p.expired_time || p.ExpiredTime || '';
        if(rem > 0 && eStr && eStr !== '-'){
          try {
            const clean = eStr.replace(/-/g, '/').replace('T', ' ');
            const ts = new Date(clean).getTime();
            if(!isNaN(ts)){
              const d = Math.round((ts - Date.now()) / 86400000 * 10) / 10;
              candidates.push({ name: p.name || '套餐包', remain: rem, cycle_end_time: eStr, days_left: d });
            }
          } catch(e){}
        }
      });
      if(candidates.length){
        candidates.sort((a, b) => a.days_left - b.days_left);
        ep = candidates[0];
      }
    }

    if(ep && ep.days_left !== undefined && ep.days_left !== null){
      const days = Number(ep.days_left);
      const endStr = String(ep.cycle_end_time || '');
      if(days < 0){
        elExpVal.textContent = "已有包过期";
        elExpVal.style.color = "var(--bad)";
        elExpSub.textContent = esc(ep.name) + " · 周期已过";
      } else if(days <= 3){
        elExpVal.textContent = "剩 " + days.toFixed(1) + " 天";
        elExpVal.style.color = "var(--bad)";
        elExpSub.textContent = esc(endStr.slice(5, 16)) + " · " + fmt(ep.remain) + " 积分即将到期";
      } else if(days <= 7){
        elExpVal.textContent = "剩 " + Math.ceil(days) + " 天";
        elExpVal.style.color = "var(--warn)";
        elExpSub.textContent = esc(endStr.slice(5, 10)) + " 到期 · " + fmt(ep.remain) + " 积分";
      } else {
        elExpVal.textContent = "剩 " + Math.floor(days) + " 天";
        elExpVal.style.color = "var(--fg)";
        elExpSub.textContent = esc(endStr.slice(5, 10)) + " 到期 · " + fmt(ep.remain) + " 积分";
      }
      elExpSub.title = (ep.name || "") + " (" + endStr + ")";
    } else {
      elExpVal.textContent = "长期有效";
      elExpVal.style.color = "var(--accent2)";
      elExpSub.textContent = "暂无临期生效套餐包";
    }
  }

  // 扩展状态（签到与会员信息）
  const checkinCard = document.getElementById("cmCheckinCard");
  const checkinText = document.getElementById("cmCheckinText");
  if(checkinCard && checkinText){
    let items = [];
    if(credits.checkin){
      const c = credits.checkin;
      const st = c.today_checked_in
        ? '<span style="color:var(--accent2);font-weight:600">今日已签到</span>'
        : '<span style="color:var(--warn);font-weight:600">今日未签到</span>';
      items.push('每日签到: ' + st + ' (连续 ' + (c.streak_days || 0) + ' 天)');
      if(c.daily_credit) items.push('签到奖励: ' + c.daily_credit + ' 积分');
      if(c.today_credit) items.push('今日领取: ' + c.today_credit + ' 积分');
    }
    if(credits.is_paid_user !== undefined){
      // 档位来自计费摘要（#505）：付费 / 免费之外把包名也带上，方便一眼看出
      // 池子里哪些号是免费档、结论是什么时候读的。
      let tierText = credits.is_paid_user ? '<span class="badge ok mini">付费用户</span>' : '<span class="badge mini">普通/体验用户</span>';
      const tier = acct && acct.tier;
      if(tier && tier.package){
        const checked = tier.checked_at ? new Date(tier.checked_at * 1000).toLocaleString() : '';
        tierText += ' <span class="badge mini" title="计费摘要' + (checked ? ' · ' + checked : '') + '">' + escapeHtml(tier.package) + '</span>';
      }
      items.push('会员类型: ' + tierText);
    }
    if(items.length){
      checkinText.innerHTML = items.join(' · ');
      checkinCard.style.display = "block";
    } else {
      checkinCard.style.display = "none";
    }
  }

  // 渲染套餐权益包明细表格
  renderCreditsPackagesTable();
}

function renderCreditsPackagesTable(){
  const credits = CURRENT_CREDITS_DATA;
  if(!credits) return;
  const tbody = document.getElementById("cmPackagesBody");
  if(!tbody) return;

  const rawPkgs = Array.isArray(credits.packages) ? credits.packages : [];
  const countBadge = document.getElementById("cmPkgCountBadge");
  if(countBadge) countBadge.textContent = "共 " + rawPkgs.length + " 个";

  // 统一预处理各套餐包的有效期与数值
  const preparedPkgs = rawPkgs.map(p => {
    const pSize = Number(p.size ?? p.total ?? p.CycleCapacitySize) || 0;
    const pUsed = Number(p.used ?? p.CycleCapacityUsed) || 0;
    const pRemain = Number(p.remain ?? p.CycleCapacityRemain) || 0;
    const endTime = p.cycle_end_time || p.cycleEndTime || p.CycleEndTime || p.expired_time || p.ExpiredTime || '';
    const startTime = p.cycle_start_time || p.cycleStartTime || p.CycleStartTime || '';

    // no_expiry：上游的抵扣截止时间远超真实周期，CycleEndTime 只是每月
    // 计费边界。这种包不能拿周期结束算倒计时，否则表格会显示「剩 12 天」
    // 而最近到期卡片又正确地不认它（#474）。
    const noExpiry = !!p.no_expiry;
    let days = (p.days_left !== undefined && p.days_left !== null) ? Number(p.days_left) : null;
    if(days === null && !noExpiry && endTime && endTime !== '-'){
      try {
        const cleanStr = endTime.replace(/-/g, '/').replace('T', ' ');
        const endTs = new Date(cleanStr).getTime();
        if(!isNaN(endTs)){
          days = Math.round((endTs - Date.now()) / 86400000 * 10) / 10;
        }
      } catch(e){}
    }
    const isExpired = p.is_expired !== undefined ? !!p.is_expired : (days !== null && days < 0);
    return {
      raw: p,
      name: p.name || '套餐包',
      package_code: p.package_code || p.packageCode || p.PackageCode || '',
      resource_id: p.resource_id || p.resourceId || p.ResourceId || '',
      grant_reason: p.grant_reason || p.grantReason || '',
      sub_product_name: p.sub_product_name || p.subProductName || p.SubProductName || '',
      in_usage: p.in_usage ?? p.inUsage ?? p.InUsage,
      auto_renew: p.auto_renew ?? p.autoRenew ?? p.AutoRenewFlag,
      size: pSize,
      used: pUsed,
      remain: pRemain,
      cycle_start_time: startTime,
      cycle_end_time: endTime,
      days_left: days,
      no_expiry: noExpiry,
      is_expired: isExpired
    };
  });

  // 过滤
  let pkgs = preparedPkgs.filter(p => {
    const remain = p.remain;
    const isExpired = p.is_expired;
    const daysLeft = p.days_left;

    if(CURRENT_PKG_FILTER === 'active'){
      if(remain <= 0 || isExpired) return false;
    } else if(CURRENT_PKG_FILTER === 'expiring'){
      if(isExpired || remain <= 0) return false;
      if(daysLeft === null || daysLeft > 7) return false;
    } else if(CURRENT_PKG_FILTER === 'exhausted'){
      if(remain > 0 && !isExpired) return false;
    }

    if(CURRENT_PKG_SEARCH){
      const q = CURRENT_PKG_SEARCH;
      const match = (p.name && p.name.toLowerCase().includes(q))
        || (p.package_code && p.package_code.toLowerCase().includes(q))
        || (p.grant_reason && p.grant_reason.toLowerCase().includes(q))
        || (p.sub_product_name && p.sub_product_name.toLowerCase().includes(q))
        || (p.resource_id && p.resource_id.toLowerCase().includes(q));
      if(!match) return false;
    }
    return true;
  });

  // 排序
  pkgs.sort((a, b) => {
    if(CURRENT_PKG_SORT === 'expiry_asc'){
      const inUseA = a.in_usage ? 0 : 1;
      const inUseB = b.in_usage ? 0 : 1;
      if(inUseA !== inUseB) return inUseA - inUseB;
      const expA = a.is_expired ? 1 : 0;
      const expB = b.is_expired ? 1 : 0;
      if(expA !== expB) return expA - expB;
      const daysA = a.days_left !== null ? a.days_left : 99999;
      const daysB = b.days_left !== null ? b.days_left : 99999;
      if(daysA !== daysB) return daysA - daysB;
      return (b.remain || 0) - (a.remain || 0);
    } else if(CURRENT_PKG_SORT === 'remain_desc'){
      return (b.remain || 0) - (a.remain || 0);
    } else if(CURRENT_PKG_SORT === 'used_desc'){
      return (b.used || 0) - (a.used || 0);
    } else if(CURRENT_PKG_SORT === 'size_desc'){
      return (b.size || 0) - (a.size || 0);
    }
    return 0;
  });

  if(!pkgs.length){
    tbody.innerHTML = '<tr><td colspan="6" class="empty" style="text-align:center;padding:24px;color:var(--dim)">无符合条件的套餐权益包</td></tr>';
    return;
  }

  tbody.innerHTML = pkgs.map(p => {
    const pSize = p.size;
    const pUsed = p.used;
    const pRemain = p.remain;
    const pct = pSize > 0 ? Math.min(100, (pUsed / pSize) * 100) : 0;
    const days = p.days_left;

    // 到期倒计时与周期格式化
    let expiryBadge = '';
    if(p.is_expired || (days !== null && days < 0)){
      expiryBadge = '<span class="badge mini off">已过期</span>';
    } else if(days !== null){
      if(days <= 3){
        expiryBadge = '<span class="badge mini bad">剩 ' + days.toFixed(1) + ' 天 (即将到期)</span>';
      } else if(days <= 7){
        expiryBadge = '<span class="badge mini warn">剩 ' + Math.ceil(days) + ' 天</span>';
      } else if(days < 365){
        expiryBadge = '<span class="badge mini ok">剩 ' + Math.floor(days) + ' 天</span>';
      } else {
        expiryBadge = '<span class="badge mini">长期有效</span>';
      }
    } else if(p.no_expiry){
      expiryBadge = '<span class="badge mini">长期有效</span>';
    } else if(p.cycle_end_time){
      expiryBadge = '<span class="badge mini">正常</span>';
    }

    const cycleEndTimeStr = p.cycle_end_time ? p.cycle_end_time.slice(0, 19) : '-';
    const cycleStartTimeStr = p.cycle_start_time ? p.cycle_start_time.slice(0, 19) : '';

    // 来源/原因/产品描述
    const reasonParts = [];
    if(p.grant_reason) reasonParts.push(esc(p.grant_reason));
    if(p.sub_product_name && p.sub_product_name !== p.name) reasonParts.push(esc(p.sub_product_name));
    const reasonLine = reasonParts.length ? ('<div style="font-size:11px;color:var(--dim);margin-top:2px">' + reasonParts.join(' · ') + '</div>') : '';

    // 标识行
    const idParts = [];
    if(p.package_code) idParts.push(esc(p.package_code));
    if(p.resource_id) idParts.push(esc(p.resource_id));
    const idLine = idParts.length ? ('<div class="mono" style="font-size:10px;color:var(--dim);margin-top:2px">' + idParts.join(' · ') + '</div>') : '';

    // 状态标签
    let statusTags = '';
    if(p.in_usage){
      statusTags += '<span class="badge mini s" style="margin-left:4px;font-size:10px">生效中</span>';
    }
    if(p.auto_renew){
      statusTags += '<span class="badge mini ok" style="margin-left:4px;font-size:10px">自动续费</span>';
    }

    const barColor = pct >= 90 ? "var(--bad)" : pct >= 70 ? "var(--warn)" : "var(--accent)";

    return '<tr>'
      + '<td style="text-align:left;padding:8px 10px">'
      +   '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">'
      +     '<span style="font-weight:600;color:var(--fg)">' + esc(p.name) + '</span>'
      +     statusTags
      +   '</div>'
      +   reasonLine
      +   idLine
      + '</td>'
      + '<td style="text-align:center;padding:8px 10px">'
      +   (expiryBadge ? ('<div style="margin-bottom:3px">' + expiryBadge + '</div>') : '')
      +   '<div class="mono" style="font-size:11px;color:var(--fg)" title="' + (p.no_expiry ? '计费周期结束（积分不过期）' : '到期时间') + '">' + esc(cycleEndTimeStr) + '</div>'
      +   (cycleStartTimeStr ? ('<div class="mono" style="font-size:10px;color:var(--dim)" title="生效时间">自 ' + esc(cycleStartTimeStr.slice(0, 10)) + '</div>') : '')
      + '</td>'
      + '<td style="text-align:right;padding:8px 10px;font-weight:600">' + fmt(pSize) + '</td>'
      + '<td style="text-align:right;padding:8px 10px;color:var(--dim)">' + fmt(pUsed) + '</td>'
      + '<td style="text-align:right;padding:8px 10px;color:var(--accent2);font-weight:700;font-size:13px">' + fmt(pRemain) + '</td>'
      + '<td style="text-align:center;padding:8px 10px">'
      +   '<div style="display:flex;align-items:center;justify-content:center;gap:6px">'
      +     '<span style="font-size:11px;min-width:34px;text-align:right">' + pct.toFixed(1) + '%</span>'
      +     '<div style="width:46px;height:5px;background:var(--line);border-radius:3px;overflow:hidden">'
      +       '<div style="width:' + pct.toFixed(1) + '%;height:100%;background:' + barColor + '"></div>'
      +     '</div>'
      +   '</div>'
      + '</td>'
      + '</tr>';
  }).join('');
}

function reloginFromCreditsModal(){
  const acct = (window.ACCOUNTS || []).find(a => a.uid === CURRENT_CREDIT_DETAIL_UID);
  const realm = acct ? acct.realm : (window.VIEW_REALM || "intl");
  closeCreditsDetail();
  openLoginModal(realm);
}

function closeCreditsDetail(){
  const m = document.getElementById("creditsDetailModal");
  if(m) m.classList.remove("show");
  CURRENT_CREDIT_DETAIL_UID = null;
}

function openDesktopScan(){
  const m = document.getElementById('desktopScanModal');
  const body = document.getElementById('desktopScanBody');
  if(body) body.innerHTML = '<p class="hint">正在检测本机桌面客户端账号…</p>';
  if(m) m.classList.add('show');
}

function closeDesktopScan(){
  const m = document.getElementById('desktopScanModal');
  if(m) m.classList.remove('show');
}

async function refreshDesktopScan(btn){
  if(btn){ btn.disabled = true; btn.textContent = '扫描中...'; }
  const body = document.getElementById('desktopScanBody');
  if(body) body.innerHTML = '<p class="hint">正在检测本机桌面客户端账号…</p>';
  try{
    const r = await postJSON('/accounts/import/desktop', {});
    renderDesktopScan(r.detected || [], r.atrest || null);
  }catch(e){
    if(body) body.innerHTML = '<p class="hint" style="color:var(--warn)">扫描失败: ' + esc(e.message) + '</p>';
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '重新扫描'; }
  }
}

/* at-rest 密钥：桌面端把 token 加密存了，得先从客户端进程内存里把静态密钥
   找回来才能解密导入。密钥只留在网关进程内存里，不落盘、不写日志。 */
async function recoverAtrestKey(btn){
  const idle = btn.textContent;
  btn.disabled = true;
  btn.textContent = '正在扫描 WorkBuddy.exe 内存…';
  try{
    const r = await postJSON('/accounts/import/desktop', {recoverKey: true});
    if(!r.ok){ throw new Error(r.msg || '回收失败'); }
    toast('密钥已回收，正在重新扫描');
    await refreshDesktopScan();
  }catch(e){
    toast('回收失败: ' + e.message, 'err');
    btn.disabled = false;
    btn.textContent = idle;
    const tip = document.getElementById('atrestTip');
    if(tip){
      tip.innerHTML = '回收失败：' + esc(e.message)
        + '<br><span style="color:var(--dim)">请确认 WorkBuddy 桌面客户端正在运行并已登录；'
        + '权限不足时可以管理员身份运行网关再试一次。</span>';
    }
  }
}

/* 手工导入解码密钥：macOS / Linux 上回收不了客户端进程内存（huntSupported
   为 false），用户可以把保护密钥贴进来。后端会用 keyblob 自检，贴错直接报错。 */
async function adoptAtrestKey(btn){
  const input = document.getElementById('adoptKeyInput');
  const value = (input && input.value || '').trim();
  if(!value){ toast('请先粘贴密钥', 'err'); return; }
  const idle = btn.textContent;
  btn.disabled = true;
  btn.textContent = '校验中…';
  try{
    const r = await postJSON('/accounts/import/desktop', {keyText: value});
    if(!r.ok){ throw new Error(r.msg || '导入失败'); }
    if(input) input.value = '';
    toast('密钥已导入，正在重新扫描');
    await refreshDesktopScan();
  }catch(e){
    toast('导入失败: ' + e.message, 'err');
    btn.disabled = false;
    btn.textContent = idle;
    const tip = document.getElementById('atrestTip');
    if(tip){
      tip.innerHTML = '导入失败：' + esc(e.message)
        + '<br><span style="color:var(--dim)">密钥必须与桌面客户端 keyblob 里的 '
        + 'protectorKeyId 对得上；贴错或客户端已换钥都会走到这里。</span>';
    }
  }
}

function renderAtrestBar(atrest, list){
  if(!atrest) return '';
  if(atrest.keyCached){
    // 手工导入的密钥会随客户端换钥失效，所以把来路也写出来，便于用户对照。
    const how = atrest.keySource === 'manual' ? '手动导入' : '进程内存回收';
    return '<div class="hint" style="margin:0 0 12px;color:var(--accent2)">解码密钥已就绪（keyId '
      + esc(atrest.keyId || '-') + '，' + how + '），加密凭据可直接导入。</div>';
  }
  if(!list.some(d => d.needsKey)) return '';
  let html = '<div style="background:var(--panel2);border:1px solid var(--line);border-radius:10px;'
    + 'padding:12px 14px;margin-bottom:14px;font-size:13px">'
    + '<b>检测到加密凭据</b><div class="hint" style="margin:6px 0 8px" id="atrestTip">';
  if(atrest.huntSupported){
    html += '桌面客户端把 token 加密存储了，需要从正在运行的客户端进程内存里回收静态密钥'
      + '（只读，密钥只留在网关内存里）。通常几秒钟，内存大时要十几秒。'
      + '<br>回收不到时，也可以在下面手动粘贴密钥。';
  }else{
    html += esc(atrest.huntHint || '当前系统不支持从进程内存回收密钥。')
      + '<br>可以在下面手动粘贴解码密钥，或改用「+ 添加账号 (OAuth)」走浏览器登录。';
  }
  html += '</div>';
  if(atrest.huntSupported){
    html += '<button class="primary mini" onclick="recoverAtrestKey(this)">回收密钥</button>';
  }
  html += '<div style="display:flex;gap:8px;align-items:center;margin-top:10px">'
    + '<input id="adoptKeyInput" class="slot-input" type="password" autocomplete="off"'
    + ' spellcheck="false" placeholder="粘贴解码密钥：64 位 hex，或 44 字符 base64"'
    + ' style="flex:1;max-width:460px">'
    + '<button class="mini" onclick="adoptAtrestKey(this)">导入密钥</button>'
    + '</div>'
    + '<div class="hint" style="margin-top:6px">手工导入的密钥只留在网关内存里，'
    + '不落盘、不写日志；导入时会先用 keyblob 校验，贴错会直接报错。</div>';
  return html + '</div>';
}

function renderDesktopScan(list, atrest){
  const body = document.getElementById('desktopScanBody');
  if(!body) return;
  const valid = list.filter(d => d.valid);
  const bad = list.filter(d => !d.valid);
  const needKey = bad.filter(d => d.needsKey);
  const broken = bad.filter(d => !d.needsKey);
  // 回收只在 Windows 上有；其他平台这一列改成「导入」（手工粘贴）。
  const keyAction = (atrest && atrest.huntSupported) ? '需要先回收密钥' : '需要先导入密钥';
  // Use every account across both realms: the visible list is filtered by the
  // current view, so an earlier import could otherwise look "not imported".
  const already = window.SCAN_POOL && window.SCAN_POOL.size
    ? window.SCAN_POOL
    : new Set((window.ACCOUNTS || []).map(a => a.uid));

  const section = (title, items, cls) => {
    let html = '<div style="margin:14px 0 6px;font-size:12px;font-weight:600" class="' + cls + '">'
      + title + ' <span style="color:var(--dim);font-weight:400">(' + items.length + ')</span></div>';
    if(!items.length){
      html += '<div class="hint" style="margin:4px 0 10px">未检测到该版本账号</div>';
      return html;
    }
    html += '<table><thead><tr><th>账号</th><th>域名</th><th>有效期</th><th></th></tr></thead><tbody>';
    items.forEach(d => {
      const dup = already.has(d.uid);
      // NOTE: never interpolate the path into an inline onclick - JSON.stringify
      // emits double quotes, which would terminate the HTML attribute and make
      // the button silently do nothing. Use a data attribute + delegation.
      const act = dup
        ? '<span class="badge off">已导入</span>'
        : '<button class="primary mini btn-import-desktop"'
          + ' data-path="' + esc(d.path) + '"'
          + ' data-realm="' + esc(d.realm) + '">导入</button>';
      html += '<tr>'
        + '<td><b>' + esc(d.nickname || (d.uid||'').slice(0,8)) + '</b>'
        + '<div class="mono" style="font-size:11px;color:var(--dim)">' + esc((d.uid||'').slice(0,8)) + ' · ' + esc(d.file) + '</div></td>'
        + '<td class="mono" style="font-size:11px">' + esc(d.domain || '-') + '</td>'
        + '<td>' + esc(d.expiresIn || '未知') + '</td>'
        + '<td style="text-align:right">' + act + '</td>'
        + '</tr>';
    });
    html += '</tbody></table>';
    return html;
  };

  let html = renderAtrestBar(atrest, list);
  if(!list.length && !html){
    body.innerHTML = '<p class="hint">未在本机检测到桌面客户端登录凭证。<br>'
      + '请确认已安装并登录 WorkBuddy 客户端后点「重新扫描」。</p>';
    return;
  }
  if(list.length){
    html += section('国际版 (Global) · www.workbuddy.ai',
                    valid.filter(d => d.realm !== 'cn'), '');
    html += section('国内版 (China) · copilot.tencent.com',
                    valid.filter(d => d.realm === 'cn'), '');
  }

  if(needKey.length){
    html += '<div style="margin:14px 0 6px;font-size:12px;font-weight:600;color:var(--warn)">'
      + '待解码的凭证（加密存储）</div>';
    html += '<table><tbody>';
    needKey.forEach(d => {
      html += '<tr><td class="mono" style="font-size:11px">' + esc(d.file) + '</td>'
        + '<td style="color:var(--dim);font-size:12px;text-align:right">' + esc(keyAction) + '</td></tr>';
    });
    html += '</tbody></table>';
  }
  if(broken.length){
    html += '<div style="margin:14px 0 6px;font-size:12px;font-weight:600;color:var(--warn)">无法读取的凭证</div>';
    html += '<table><tbody>';
    broken.forEach(d => {
      html += '<tr><td class="mono" style="font-size:11px">' + esc(d.file) + '</td>'
        + '<td style="color:var(--warn);font-size:12px;text-align:right">' + esc(d.error || '未知原因') + '</td></tr>';
    });
    html += '</tbody></table>';
  }
  if(!html){
    html = '<p class="hint">未在本机检测到桌面客户端登录凭证。<br>'
      + '请确认已安装并登录 WorkBuddy 客户端后点「重新扫描」。</p>';
  }
  body.innerHTML = html;
  // Wire the import buttons through event delegation (see renderDesktopScan).
  body.querySelectorAll('.btn-import-desktop').forEach(btn => {
    btn.addEventListener('click', () => {
      doImportDesktop(btn, btn.getAttribute('data-path'), btn.getAttribute('data-realm'));
    });
  });
}

async function doImportDesktop(btn, path, realm){
  btn.disabled = true;
  btn.textContent = '导入中...';
    try{
    const r = await postJSON('/accounts/import/desktop', {path: path, realm: realm});
    const a = (r.imported || [])[0] || {};
    toast('已导入 ' + (a.nickname || (a.uid||'').slice(0,8)) + ' 到 ' + (a.realm === 'cn' ? '国内版' : '国际版'));
    if(a.uid && window.SCAN_POOL) window.SCAN_POOL.add(a.uid);
    await loadAccounts();
    await refresh();
    try {
      const s = await postJSON('/accounts/import/desktop', {});
      if(s.pool_uids) window.SCAN_POOL = new Set(s.pool_uids);
      renderDesktopScan(s.detected || [], s.atrest || null);
    } catch(e2) { /* keep the refreshed toasts; list will refresh on next scan */ }
    // The scan list is filtered by the current view; tell the user where the
    // account actually landed so this never looks like a no-op.
    if(a.realm && a.realm !== window.VIEW_REALM){
      toast('该账号属于' + (a.realm === 'cn' ? '国内版' : '国际版')
            + '列表，点击上方选项卡即可查看', 'err');
    }
  }catch(e){
    toast('导入失败: ' + e.message, 'err');
    btn.disabled = false;
    btn.textContent = '导入';
  }
}

/* 概览附加图只读当前已加载的数据，不新增请求，也不把当前页分布冒充历史趋势。 */
let CONSOLE_INSIGHT_ROWS = [];
function renderConsoleAccountHealth(accts){
  const box = document.getElementById('consoleAccountHealth');
  if(!box) return;
  const isCodearts = window.VIEW_REALM === 'codearts';
  const all = isCodearts ? [] : accountsInView();
  const groups = isCodearts ? (() => {
    const st = (window.CODEARTS_OVERVIEW || {}).stats || {};
    return [
      {label: 'CodeArts', total: Number(st.total || 0), ok: Number(st.healthy || 0)}
    ];
  })() : [
    {label: '国际版', total: (accts || []).filter(a => a.realm === 'intl').length, ok: (accts || []).filter(a => a.realm === 'intl' && accountIsHealthy(a)).length},
    {label: '国内版', total: (accts || []).filter(a => a.realm === 'cn').length, ok: (accts || []).filter(a => a.realm === 'cn' && accountIsHealthy(a)).length}
  ];
  const total = groups.reduce((n, g) => n + g.total, 0);
  const healthy = groups.reduce((n, g) => n + g.ok, 0);
  const summary = document.getElementById('consoleHealthSummary');
  if(summary) summary.textContent = healthy + ' / ' + total + ' 可用';
  box.innerHTML = groups.map(g => {
    const ratio = g.total ? Math.max(0, Math.min(100, g.ok / g.total * 100)) : 0;
    return '<div class="console-health-row"><span>' + esc(g.label) + '</span>'
      + '<div class="console-health-track" role="progressbar" aria-label="' + esc(g.label) + '账号可用比例" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + ratio.toFixed(1) + '"><span class="console-health-fill" style="width:' + ratio + '%"></span></div>'
      + '<strong>' + g.ok + ' / ' + g.total + '</strong></div>';
  }).join('');
}
function renderConsoleUsageChart(rows){
  const cv = document.getElementById('consoleUsageChart');
  if(!cv) return;
  const host = cv.parentElement;
  if(!host) return;
  const style = getComputedStyle(host);
  const available = host.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  const W = Math.max(1, available), H = 168;
  const dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d');
  if(!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue('--dim').trim() || '#4e5969';
  const grid = css.getPropertyValue('--line').trim() || '#e3e8ef';
  const color = css.getPropertyValue('--think').trim() || '#1677ff';
  const pad = {l: 44, r: 10, t: 8, b: 30};
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const vals = rows.map(r => Number(r.total_tokens || 0));
  const max = Math.max(1, ...vals);
  ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
  ctx.textBaseline = 'middle'; ctx.fillStyle = ink;
  for(let i = 0; i <= 4; i++){
    const y = pad.t + ih - ih * i / 4;
    ctx.strokeStyle = grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillText(fmtCompact(max * i / 4), 4, y);
  }
  if(!rows.length){
    ctx.textAlign = 'center'; ctx.fillText('当前页暂无请求，等待真实调用数据', W / 2, H / 2); ctx.textAlign = 'left';
    return;
  }
  const step = iw / rows.length, bw = Math.max(2, Math.min(24, step * .62));
  rows.forEach((r, i) => {
    const h = Number(r.total_tokens || 0) / max * ih;
    const x = pad.l + i * step + (step - bw) / 2;
    ctx.fillStyle = color;
    if(h > 0) ctx.fillRect(x, pad.t + ih - h, bw, h);
    if(rows.length <= 12 || i % Math.ceil(rows.length / 6) === 0){
      const label = String(r.model || '—');
      ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(label.length > 11 ? label.slice(0, 10) + '…' : label, Math.max(pad.l + 25, Math.min(W - 30, x + bw / 2)), H - 20);
    }
  });
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
function renderConsoleInsights(rows, accts){
  CONSOLE_INSIGHT_ROWS = rows || [];
  renderConsoleUsageChart(CONSOLE_INSIGHT_ROWS);
  const totals = {};
  CONSOLE_INSIGHT_ROWS.forEach(r => {
    const id = String(r.model || '未命名模型');
    totals[id] = (totals[id] || 0) + Number(r.total_tokens || 0);
  });
  const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const total = Object.values(totals).reduce((n, value) => n + value, 0);
  const note = document.getElementById('consoleUsageNote');
  if(note) note.textContent = '当前页 ' + CONSOLE_INSIGHT_ROWS.length + ' 条请求 · 非时间序列';
  const share = document.getElementById('consoleModelShare');
  if(share) share.innerHTML = ranked.length ? ranked.map(([id, tokens]) => {
    const ratio = total ? tokens / total * 100 : 0;
    return '<div class="console-share-row"><span class="console-share-name" title="' + esc(id) + '">' + esc(id) + '</span>'
      + '<span class="console-share-track"><span class="console-share-fill" style="display:block;width:' + ratio + '%"></span></span>'
      + '<span class="console-share-value">' + fmtCompact(tokens) + ' · ' + ratio.toFixed(1) + '%</span></div>';
  }).join('') : '<div style="padding:8px 0;color:var(--dim);font-size:12px">暂无模型用量分布</div>';
  renderConsoleAccountHealth(accts || []);
}

/* ------------------------------- dashboard ------------------------------ */
let REFRESH_RUNNING = false;
let REFRESH_QUEUED = false;
let REFRESH_GEN = 0;
async function refresh(){
  // 5 秒轮询。撞上正在飞的那一轮时**排队补跑**，而不是直接丢掉：早先的实现是
  // `if(REFRESH_BUSY) return;`，切区域/切账号那一下如果正好撞上轮询在飞，这次
  // 刷新就没了下文，只能干等下一个 5 秒周期——"点了要过几秒才变"就是这么来的。
  REFRESH_GEN++;
  if(REFRESH_RUNNING){ REFRESH_QUEUED = true; return; }
  REFRESH_RUNNING = true;
  const gen = REFRESH_GEN;
  try { await refreshInner(gen); }
  finally {
    REFRESH_RUNNING = false;
    if(REFRESH_QUEUED){ REFRESH_QUEUED = false; refresh(); }
  }
}
// 展示货币切换后，把带费用的视图就地重画：各接口有服务端 TTL 缓存，
// 重新拉取的代价很小，不必为每处维护一份数据副本。
function refreshAllCostViews(){
  refresh();
  if(currentMainTab === 'analytics'){
    loadAnalytics();
    loadAnalyticsMatrix();
  }
}
async function refreshInner(gen){
  let usage, recent, perf;
  try{
    [usage, recent, perf] = await Promise.all([
      getJSON('/usage?realm=' + encodeURIComponent(window.VIEW_REALM), POLL_READ),
      // /usage/recent 不在这里改成可校验：它没有服务端缓存，每次新请求都进榜，
      // 响应体每轮都在变，服务端也就没有稳定的校验符可发——照旧整份重取。
      getJSON('/usage/recent?limit=' + RECENT_LIMIT + '&page=' + RECENT_PAGE + '&realm=' + encodeURIComponent(window.VIEW_REALM)),
      getJSON('/usage/perf?realm=' + encodeURIComponent(window.VIEW_REALM), POLL_READ),
    ]);
    // 取数期间又发起了更新的一轮（例如刚切了区域），这批结果已经过期，
    // 直接扔掉，交给排队的那一轮渲染，免得把旧区域的数字画上去。
    if(gen !== REFRESH_GEN) return;
    document.getElementById('statusDot').className = 'dot';
  }catch(e){
    if(gen === REFRESH_GEN){
      document.getElementById('statusDot').className = 'dot err';
      if(String(e.message) !== 'unauthorized'){
        document.getElementById('meta').innerHTML = '<b>无法连接反代</b>';
      }
    }
    return;
  }

  const t = usage;
  const metaEl = document.getElementById('meta');
  if(metaEl) metaEl.innerHTML = '';
  document.getElementById('logfile').textContent = t.log_file || '';
  const rEl = document.getElementById('realm'); if(rEl) rEl.textContent = t.realm ? ' · ' + t.realm : '';

  // 分别统计国际版与国内版账号与积分
  const accts = window.ACCOUNTS || [];
  const intlAccts = accts.filter(a => a.realm === 'intl');
  const cnAccts = accts.filter(a => a.realm === 'cn');

  const isAcctActive = a => a.enabled && !a.reserveBlocked && !a.dailyLimitBlocked && !a.creditLimitReached;
  const intlActive = intlAccts.filter(isAcctActive).length;
  const cnActive = cnAccts.filter(isAcctActive).length;

  let intlRemain = 0, cnRemain = 0;
  intlAccts.forEach(a => { if(a.credits) intlRemain += (a.credits.remain || 0); });
  cnAccts.forEach(a => { if(a.credits) cnRemain += (a.credits.remain || 0); });

  const poolHtml =
    '<div class="v-split">' +
      '<div class="v-row"><span class="v-label">国际</span><span class="v-num" style="color:var(--accent)">' + intlActive + '<span class="v-unit">/' + intlAccts.length + '</span></span></div>' +
      '<div class="v-row"><span class="v-label">国内</span><span class="v-num" style="color:var(--accent)">' + cnActive + '<span class="v-unit">/' + cnAccts.length + '</span></span></div>' +
    '</div>';

  const credHtml =
    '<div class="v-split">' +
      '<div class="v-row"><span class="v-label">国际</span><span class="v-num" style="color:var(--accent2)">' + fmt(intlRemain) + '</span></div>' +
      '<div class="v-row"><span class="v-label">国内</span><span class="v-num" style="color:var(--accent2)">' + fmt(cnRemain) + '</span></div>' +
    '</div>';

  const succStr = (perf.success_rate_pct != null ? pct(perf.success_rate_pct) : '100.0%');
  if(t.usd_cny) costUsdRate = Number(t.usd_cny) || costUsdRate;

  // 这三张卡的数字都按当前视图区域取（/usage 等接口带 realm），标题带上区域，
  // 免得把国际版的用量看成全局的。
  const realmTag = '（' + (window.VIEW_REALM === 'cn' ? '国内版' : '国际版') + '）';
  document.getElementById('cards').innerHTML =
    card('网关调用量' + realmTag, fmt(t.requests) + ' <span style="font-size:13px;font-weight:500;color:var(--dim);margin-left:4px">次</span>', '', '') +
    card('积分消耗' + realmTag, (t.credit != null ? Number(t.credit).toFixed(2) : '0.00') + ' <span style="font-size:13px;font-weight:500;color:var(--dim);margin-left:4px">积分</span>', ((PRICING_ON && t.cost_cny != null) ? ('估算价值: ' + fmtCostBoth(t.cost_cny, 12)) : ''), 'warn') +
    card('请求成功率' + realmTag, '<span style="color:' + (perf.errors ? 'var(--warn)' : 'var(--accent2)') + '">' + succStr + '</span>', '', '');

  const total = recent.total || 0;
  RECENT_PAGE = recent.page || 1;
  RECENT_TOTAL_PAGES = recent.total_pages || Math.max(1, Math.ceil(total / RECENT_LIMIT));

  const pageInfo = document.getElementById('recentPageInfo');
  if(pageInfo){
    pageInfo.textContent = '第 ' + RECENT_PAGE + ' / ' + RECENT_TOTAL_PAGES + ' 页 · 共 ' + fmt(total) + ' 条记录';
  }
  const btnPrev = document.getElementById('btnRecentPrev');
  if(btnPrev) btnPrev.disabled = (RECENT_PAGE <= 1);
  const btnNext = document.getElementById('btnRecentNext');
  if(btnNext) btnNext.disabled = (RECENT_PAGE >= RECENT_TOTAL_PAGES);
  const btnBox = document.getElementById('recentPageButtons');
  if(btnBox){
    const pages = generatePageList(RECENT_PAGE, RECENT_TOTAL_PAGES);
    btnBox.innerHTML = pages.map(p => {
      if(p === '...'){
        return '<span style="color:var(--dim);padding:0 3px">…</span>';
      }
      const active = (p === RECENT_PAGE);
      return '<button class="range-btn' + (active ? ' active' : '') + '" style="min-width:26px;padding:3px 6px;font-size:11px" onclick="gotoRecentPage(' + p + ')">' + p + '</button>';
    }).join('');
  }

  const rows = recent.rows || [];
  renderConsoleInsights(rows, accts);
  // Terminal state of a request. Rows written before the outcome field only
  // carry error/status, so fall back to that; a client cancellation is shown
  // apart from a real failure because the gateway did nothing wrong.
  const outcomeBadge = r => {
    const o = r.outcome || (r.error ? 'failed' : 'completed');
    if(o === 'completed') return '<span class="badge ok">完成</span>';
    if(o === 'client_aborted') return '<span class="badge off">客户端取消</span>';
    if(o === 'upstream_aborted') return '<span class="badge warn">上游中断</span>';
    return '<span class="badge bad">失败</span>';
  };
  const countEl = document.getElementById('recentCount');
  if(countEl) countEl.textContent = '(第 ' + RECENT_PAGE + ' 页 / 共 ' + fmt(total) + ' 条)';
  // 推理强度：这次请求实际跑在哪个档位（网关写入 usage 行时的 reasoning_effort）。
  // v1.6.16 拆分为独立「推理强度」列展示。
  // 账号列显示昵称：uid -> 昵称取自 /usage 的 accounts_map（当前账号池）。
  // 已删除/不存在的账号回退到 uid 前 8 位，避免留空。
  const acctName = (uid) => {
    if(!uid) return '—';
    const m = (t.accounts_map && t.accounts_map[uid]);
    return (m && m.nickname) ? m.nickname : String(uid).slice(0,8);
  };
  // 5 秒一轮的重画里，内容没变就不碰 DOM：实测 100 行时一次 innerHTML 重写要花
  // ~10ms 解析 + 50~65ms 强制布局（每个 tick 一个 57~77ms 的长任务），而相邻两轮
  // 里有 1/4~1/2 的轮次数据逐字节相同——代价全白付。指纹覆盖所有会画进表格的
  // 输入：行数据本身（JSON 快照，任何字段变化都算）、页码/每页条数/区域、账号
  // 昵称（来自 /usage 的 accounts_map，与行分开变化）、以及价格列的三个开关
  // （PRICING_ON、CNY/USD 显示币种、汇率——它们和行数据分开变化，漏一个就会
  // 让"切换币种"这类操作被指纹挡住、表格停在旧币种上）。相同就整段跳过：
  // 不重拼 HTML、不重排、不重挂悬停明细。
  const recentFp = [
    total, RECENT_PAGE, RECENT_LIMIT, window.VIEW_REALM,
    PRICING_ON ? '1' : '0', costCurrency, costUsdRate,
    rows.map(r => acctName(r.account) + '\u0000' + (r.key_name || '')).join('\u0001'),
    JSON.stringify(rows),
  ].join('\u0002');
  if(recentFp === lastRecentFp) return;
  lastRecentFp = recentFp;
  COST_TIP_ROWS.clear();
  const buildRecentTable = tableRows => tableRows.length ?
    '<table class="data-cards"><thead><tr><th>时间</th><th>模型</th><th>推理强度</th><th>账号</th><th>API Key</th><th>模式</th><th>结果</th><th>耗时</th><th>首字</th><th>速度</th><th>输入</th><th>输出</th><th>思考</th><th>缓存</th><th>总 token</th><th>积分</th><th class="pricing-col" style="color:var(--warn)">估算价格</th></tr></thead><tbody>'
    + tableRows.map((r, i) => {
        // 关闭时不登记悬停明细，也不挂 data-cost-key：列还在（观感不变），
        // 但没有任何可解释的价格，省掉整张表的明细构建与 hover 开销。
        const costKey = PRICING_ON ? costRowKey(r, i) : '';
        if(costKey) COST_TIP_ROWS.set(costKey, r);
        return '<tr>'
        + '<td class="mono" data-label="时间">' + esc((r.iso||'').replace('T',' ').slice(5)) + '</td>'
        + '<td class="mono" data-label="模型">' + esc(r.model) + '</td>'
        + '<td data-label="推理强度">' + (r.reasoning_effort ? ('<span class="badge-effort">' + esc(r.reasoning_effort) + '</span>') : '<span style="color:var(--dim)">—</span>') + '</td>'
        + '<td class="mono" style="font-size:11px;color:var(--dim)" data-label="账号" title="' + esc(r.account||'') + '">' + esc(acctName(r.account)) + '</td>'
        + '<td class="mono" style="font-size:11px;color:var(--dim)" data-label="API Key" title="' + esc(r.key||'') + '">' + esc(r.key_name || '—') + '</td>'
        + '<td data-label="模式"><span class="badge ' + (r.stream?'s':'') + '">' + (r.stream?'流式':'非流式') + '</span></td>'
        + '<td data-label="结果">' + outcomeBadge(r) + '</td>'
        + '<td data-label="耗时">' + ms(r.elapsed_ms) + '</td>'
        + '<td data-label="首字">' + ms(r.ttft_ms) + '</td>'
        + '<td data-label="速度">' + (r.tokens_per_sec ? r.tokens_per_sec.toFixed(1) : '—') + '</td>'
        + '<td data-label="输入">' + fmt(r.prompt_tokens) + '</td>'
        + '<td data-label="输出">' + fmt(r.completion_tokens) + '</td>'
        + '<td style="color:var(--think)" data-label="思考">' + fmt(r.reasoning_tokens) + '</td>'
        + '<td data-label="缓存">' + (r.cache_hit_pct!=null ? r.cache_hit_pct+'%' : '—') + '</td>'
        + '<td data-label="总 token"><b>' + fmt(r.total_tokens) + '</b></td>'
        + '<td data-label="积分" style="color:var(--accent2)">' + (r.credit != null ? Number(r.credit).toFixed(2) : '—') + '</td>'
        + '<td data-label="OpenRouter 价估算" class="cost-cell pricing-col" style="color:var(--warn)"'
        +   (costKey ? ' data-cost-key="' + esc(costKey) + '"' : '') + '>'
        +   fmtCost(r.cost_cny)
        +   (r.cost_backfilled ? '<span style="color:var(--dim)">*</span>' : '')
        + '</td>'
      + '</tr>';
      }).join('') + '</tbody></table>'
    : '<div class="empty">还没有请求记录</div>';
  RECENT_RENDER = {rows: rows, acctName: acctName, buildTable: buildRecentTable};
  renderRecentView();
  reanchorCostTip();
}

(async function initDashboard(){
  await bootPanel();
})();

/* 侧栏尽早建：区块是静态标记，现场生成不依赖任何接口。原来只在
   switchMainTab() 里建，而它排在启动链的末端——/panel/status、/settings、
   /realm 三趟串行往返，再加 Promise.all 里那批数据加载（含走上游的
   /v1/models 与国内版成长任务）之后才轮到，所以刷新时左侧要先空一列、
   过一会儿才补上。这里在 DOMContentLoaded 就建（head 里那段已按 ?tab=
   与上次选择定好 .active），switchMainTab() 那次会因清单未变直接返回，
   不会重建、也不会闪。 */
document.addEventListener('DOMContentLoaded', function(){
  initPageNav(document.querySelector('.main-page.active'));
});

let RECENT_LIMIT = parseInt(localStorage.getItem('WB_RECENT_LIMIT') || '20', 10);
if(![10, 20, 50, 100].includes(RECENT_LIMIT)) RECENT_LIMIT = 20;
let RECENT_PAGE = 1;
let RECENT_TOTAL_PAGES = 1;
// 最近请求表上次真正画进 DOM 的内容指纹（见 refreshInner 里的 recentFp）。
// 5 秒一轮的重画代价几乎全在布局（100 行实测 50~65ms），数据没变就不该重画。
let lastRecentFp = null;
let RECENT_RENDER = null;
const RECENT_FILTERS = {query: '', outcome: ''};
function clearRecentFilters(){
  RECENT_FILTERS.query = '';
  RECENT_FILTERS.outcome = '';
  const q = document.getElementById('recentModelFilter');
  const s = document.getElementById('recentOutcomeFilter');
  if(q) q.value = '';
  if(s) s.value = '';
  renderRecentView();
}
function renderRecentView(){
  if(!RECENT_RENDER) return;
  const rows = RECENT_RENDER.rows.filter(r => {
    const q = RECENT_FILTERS.query.trim().toLowerCase();
    const outcome = r.outcome || (r.error ? 'failed' : 'completed');
    if(RECENT_FILTERS.outcome && outcome !== RECENT_FILTERS.outcome) return false;
    return !q || [r.model, RECENT_RENDER.acctName(r.account), r.account, r.key_name].some(v => String(v || '').toLowerCase().includes(q));
  });
  const count = document.getElementById('recentFilterCount');
  if(count) count.textContent = (RECENT_FILTERS.query || RECENT_FILTERS.outcome)
    ? ('当前页显示 ' + rows.length + ' / ' + RECENT_RENDER.rows.length + ' 条') : ('当前页 ' + RECENT_RENDER.rows.length + ' 条');
  const box = document.getElementById('recent');
  if(!rows.length){
    box.innerHTML = '<div class="console-filter-empty"><span>当前页没有符合筛选条件的请求</span><button type="button" class="sec mini" onclick="clearRecentFilters()">清除筛选</button></div>';
  } else {
    box.innerHTML = RECENT_RENDER.buildTable(rows);
  }
  renderConsoleInsights(RECENT_RENDER.rows, window.ACCOUNTS || []);
}

function updateRecentLimitButtons(){
  [10, 20, 50, 100].forEach(n => {
    const btn = document.getElementById('btnRecentLimit' + n);
    if(btn) btn.classList.toggle('active', RECENT_LIMIT === n);
  });
}

function setRecentLimit(n){
  RECENT_LIMIT = n;
  RECENT_PAGE = 1;
  try { localStorage.setItem('WB_RECENT_LIMIT', String(n)); } catch(e){}
  updateRecentLimitButtons();
  refresh();
}

async function changeRecentPage(delta){
  const next = RECENT_PAGE + delta;
  if(next < 1 || next > RECENT_TOTAL_PAGES) return;
  RECENT_PAGE = next;
  await refresh();
}

async function gotoRecentPage(p){
  if(p < 1 || p > RECENT_TOTAL_PAGES || p === RECENT_PAGE) return;
  RECENT_PAGE = p;
  await refresh();
}

function generatePageList(current, total){
  if(total <= 7){
    return Array.from({length: total}, (_, i) => i + 1);
  }
  const pages = [1];
  let start = Math.max(2, current - 2);
  let end = Math.min(total - 1, current + 2);
  if(current <= 4){
    end = 5;
  }
  if(current >= total - 3){
    start = total - 4;
  }
  if(start > 2) pages.push('...');
  for(let i = start; i <= end; i++){
    pages.push(i);
  }
  if(end < total - 1) pages.push('...');
  pages.push(total);
  return pages;
}

// Tab ids in nav order. One list so the restore path and the nav cannot
// drift apart.
const MAIN_TABS = ['overview', 'gateway', 'accounts', 'tasks', 'media', 'analytics', 'agents', 'settings', 'logs'];
const MAIN_TAB_STORE = 'wb-proxy-main-tab';
let currentMainTab = 'gateway';
let analyticsRange = 'today';
let cachedMatrixData = null;
let matrixAcctFilter = '';
let matrixModelFilter = '';
// Model allowlist for the combined matrix; filled by loadAnalyticsMatrix().
let MATRIX_MODELS = new Set();


/* ---- panel password gate ---- */
function isAuthError(err){
  // Every 401/403 from the JSON helpers carries this message; the gate is
  // the single place that explains it, so callers stay quiet instead of
  // stacking an identical toast on top of it.
  return !!err && String(err.message) === 'unauthorized';
}

function panelStoreToken(token, remember){
  PANEL_TOKEN = token || '';
  PANEL_REMEMBER = !!remember;
  try {
    if(PANEL_REMEMBER){
      localStorage.setItem(PANEL_STORE, PANEL_TOKEN);
      sessionStorage.removeItem(PANEL_STORE);
    } else {
      sessionStorage.setItem(PANEL_STORE, PANEL_TOKEN);
      localStorage.removeItem(PANEL_STORE);
    }
    localStorage.setItem(PANEL_REMEMBER_KEY, PANEL_REMEMBER ? '1' : '0');
  } catch(e){}
}

function panelClearToken(){
  PANEL_TOKEN = '';
  try { localStorage.removeItem(PANEL_STORE); } catch(e){}
  try { sessionStorage.removeItem(PANEL_STORE); } catch(e){}
}

function panelSyncRemember(){
  const el = document.getElementById('panelRemember');
  if(el) el.checked = PANEL_REMEMBER;
}

function panelRememberChanged(el){
  PANEL_REMEMBER = !!(el && el.checked);
  try { localStorage.setItem(PANEL_REMEMBER_KEY, PANEL_REMEMBER ? '1' : '0'); } catch(e){}
}

function panelNeedsLogin(){
  // 闸门的可见性有两处来源：markup 上的 display:flex，和 <head> 首帧判定加的
  // html.wb-panel-session（!important）。必须先摘掉那个类，否则闸门永远出不来
  // ——会话过期、登录失败都靠这个函数把登录框放回屏幕。
  document.documentElement.classList.remove('wb-panel-session');
  const gate = document.getElementById('panelGate');
  if(gate) gate.style.display = 'flex';
  panelSyncRemember();
  const input = document.getElementById('panelPwdInput');
  if(input){ input.focus(); }
}

function panelSessionLost(){
  // The session this tab holds is no longer valid - the gateway restarted,
  // or the token expired. Drop it and stop every poller: leaving them
  // running means each tick fails, re-opens the gate and logs another 401
  // server-side, which is how a stale tab ends up filling the log.
  PANEL_READY = false;
  PANEL_TIMERS.forEach(t => clearInterval(t));
  PANEL_TIMERS = [];
  if(typeof stopLogPolling === 'function') stopLogPolling();
  // 「+ 添加账号 (OAuth)」弹窗里的登录轮询不在 PANEL_TIMERS 里，是它自己的一条
  // 2.5s 定时器。不清它的话：网关重启/会话过期时弹窗还开着，pollLogin 每 2.5 秒
  // 打一次 /accounts/login/poll，每次 401 又回到这里开闸门，这个标签页就会永远
  // 每 2.5 秒刷一次 401（实测 9 秒内又发 3 次，永不停止）。
  if(loginTimer){ clearInterval(loginTimer); loginTimer = null; }
  panelClearToken();
  const msg = document.getElementById('panelLoginMsg');
  if(msg) msg.textContent = '会话已失效，请重新输入密码';
  panelNeedsLogin();
}

function panelHideGate(){
  // 首帧判定的类只在「复核还没回来」时有用；一旦确认已登录就清掉，
  // 让「有类 ⇔ 闸门被首帧判定隐藏」这条不变式只作用于启动阶段。
  document.documentElement.classList.remove('wb-panel-session');
  const gate = document.getElementById('panelGate');
  if(gate) gate.style.display = 'none';
}

async function submitPanelLogin(){
  const input = document.getElementById('panelPwdInput');
  const msg = document.getElementById('panelLoginMsg');
  const password = (input && input.value) || '';
  if(!password){ if(msg) msg.textContent = '请输入面板密码'; return; }
  if(msg) msg.textContent = '';
  if(location.protocol === 'file:'){
    if(msg) msg.textContent = '请通过 http://127.0.0.1:8788/ 打开面板，不要直接双击 dashboard.html';
    panelNeedsLogin();
    return;
  }
  try {
    const r = await fetch('/panel/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({password: password})
    });
    const data = await r.json().catch(() => ({}));
    if(!r.ok){
      if(msg) msg.textContent = (data.error && data.error.message) || '密码错误';
      // 登录失败必须保证闸门在屏幕上：带 ?pwd= 自动登录时页面不会走 bootPanel 的
      // 未认证分支，闸门若停在首帧判定的隐藏态，用户看到的是「看着已登录、其实
      // 进不去」的空看板，连重输的框都没有。
      panelNeedsLogin();
      return;
    }
    const rememberEl = document.getElementById('panelRemember');
    const remember = rememberEl ? !!rememberEl.checked : PANEL_REMEMBER;
    panelStoreToken(data.token || '', remember);
    if(input) input.value = '';
    panelHideGate();
    toast('已进入面板', 'ok');
    if(data.using_default_password){
      toast('当前是默认密码 admin，建议到「设置」里修改', 'warn');
    }
    await startDashboard();
  } catch(e) {
    if(msg) msg.textContent = '登录失败: ' + e.message;
    // 网络层失败（网关没起来、反代 502）同样要把闸门留在屏幕上。
    panelNeedsLogin();
  }
}

async function panelLogout(){
  try { await postJSON('/panel/logout', {}); } catch(e) {}
  PANEL_READY = false;
  PANEL_TIMERS.forEach(t => clearInterval(t));
  PANEL_TIMERS = [];
  panelClearToken();
  location.reload();
}

async function bootPanel(){
  try {
    const r = await fetch('/panel/status', {cache: 'no-store', headers: authHeaders()});
    PANEL_STATUS = await r.json().catch(() => ({}));
  } catch(e) { PANEL_STATUS = {}; }
  const hint = document.getElementById('panelDefaultHint');
  if(hint && PANEL_STATUS.panel_password_is_default) hint.style.display = 'block';
  const cryptoWarn = document.getElementById('panelCryptoWarning');
  if(cryptoWarn && PANEL_STATUS.crypto_ok === false) cryptoWarn.style.display = 'block';
  if(PANEL_STATUS.authenticated){
    panelHideGate();
    await startDashboard();
  } else {
    const pwdFromUrl = new URLSearchParams(window.location.search).get('pwd');
    if(pwdFromUrl){
      const input = document.getElementById('panelPwdInput');
      if(input) input.value = pwdFromUrl;
      await submitPanelLogin();
    } else {
      panelNeedsLogin();
    }
  }
}

let PANEL_READY = false;
let PANEL_TIMERS = [];
// 显示账号数据（window.ACCOUNTS）、需要 15 秒轮询跟着刷的页签：网关页（出口卡片
// 的账号数 / Key 数；合并模式下账号表也在这一页）、账号页、任务页（签到 /
// 每日活跃卡片与未完成名单）。数据看板（积分历史的昵称）与设置页（Key 绑定、
// 一键分配代理）只用名单本身，启动时那一次加载与操作后的回读就够了。
function accountsTabActive(tab){
  const t = tab || currentMainTab;
  // 新导航（?ui=next）的总览页：账号区块合并在这一页，且健康卡总在这一页
  return t === 'gateway' || t === 'accounts' || t === 'tasks' ||
    (t === 'overview' && !!window.__NEXT_UI__);
}
let visHookInstalled = false;

async function startDashboard(){
  if(PANEL_READY) return;
  PANEL_READY = true;
  // 前两步决定下面各自查什么（VIEW_REALM / 面板可见性），必须先行；之后就并行，
  // 别让国内版那条约 2 秒的成长任务接口把首屏的用量卡片拖在后面。
  await loadSettings();
  // 新面板把账号固定成独立页：服务端仍保留 accounts_separate_tab 字段给旧壳，
  // 但新壳每次都按拆分布局渲染，避免账号区被搬回总览。
  if(window.__NEXT_UI__) applyAccountsTabLayout(true);
  await initRealm();
  // 成长任务那条走上游、约 2 秒，只服务「任务与福利」页，而且它自己渲染。原来
  // 它在这一批 Promise.all 里，switchMainTab 因此被押到它后面——落在数据看板
  // 页签时，KPI 要等这两秒过去才开始发 /usage/analytics。这里只把它摘出来让它
  // 并行跑，其余照旧等待；异常自己收，别变成未处理的拒绝。
  loadGrowthTasks().catch(() => {});
  await Promise.all([loadAccounts(), loadModels(), loadAgentModelSelection(),
                     loadSchedulerStatus(), refresh(), loadAgentsAvailability()]);
  updateRecentLimitButtons();
  // The head script already resolved this before first paint; re-apply it
  // here so the data loaders for the active page actually run.
  switchMainTab(MAIN_TABS.includes(window.__MAIN_TAB__)
    ? window.__MAIN_TAB__
    : (window.__NEXT_UI__ ? 'overview' : 'gateway'));
  // 首屏把数据表接上排序：静态标记里就有的表不会被任何 loader 触发 render，
  // 轮询那条兜底要等 5 秒才轮到它。
  applyAllTableSorts();
  // Polling only starts after the panel is unlocked, so a locked browser
  // never hammers the server with 401s.
  PANEL_TIMERS.forEach(t => clearInterval(t));
  // 后台标签页不再轮询：浏览器停止绘制后台页，但定时器照跑——实测网关页在后台
  // 仍有 50 次/分钟、统计页 110 次/分钟的请求，全是白跑的。可见性变化时下面会
  // 补一次刷新，所以切回前台看到的数据仍是新的。
  PANEL_TIMERS = [
    setInterval(() => {
      if(!PANEL_READY || document.hidden) return;
      if(currentMainTab === 'analytics'){ loadAnalytics(); loadAnalyticsMatrix(); }
    }, 5000),
    // 每 5 秒在任何页面都跑，顺带把页面上的数据表接上排序（见
    // applyAllTableSorts）：表本来就是 5 秒重画一次，扫描跟同一个节奏走，新加
    // 一张表不必在它的 render 函数里再写一行，下一轮自己就接上了。
    setInterval(() => { if(!document.hidden){ refresh(); applyAllTableSorts(); } }, 5000),
    setInterval(() => { if(!document.hidden) loadSchedulerStatus(); }, 30000),
    // 账号轮询只在显示账号数据的页签上跑（见 accountsTabActive）。
    setInterval(() => { if(!document.hidden && accountsTabActive()) loadAccounts(true); }, 15000),
  ];
  if(!visHookInstalled){
    visHookInstalled = true;
    // 回到前台补一次：按当前所在页刷新，复用 refresh 自身的并发合并（撞上在飞
    // 的那一轮会排队补跑），所以不会与刚跑完的一轮重复。
    document.addEventListener('visibilitychange', () => {
      if(document.hidden || !PANEL_READY) return;
      refresh();
      if(accountsTabActive()) loadAccounts(true);
      loadSchedulerStatus();
      if(currentMainTab === 'analytics'){ loadAnalytics(); loadAnalyticsMatrix(); }
      if(currentMainTab === 'logs' && logAutoRefresh) fetchNewLogs(false);
    });
  }
}

/* ---- 页面区块导航 ----
   导航项完全由页面内的 section 现场生成：标题取该 section 首个 h2 的文本
   （忽略用于显示状态的 <em>），锚点 id 由标题内容哈希得到。对所有
   .main-page 生效，所以新增页面、增删区块或调整顺序都不需要改这里。 */
const PAGE_NAV_TOP_VAR = '--page-nav-top';
/* 侧栏收起状态跨页面、跨刷新共用一份 */
const PAGE_NAV_COLLAPSE_KEY = 'wb-page-nav-collapsed';
/* 只有一项的页面不给侧栏：白占一列宽度，也没什么可跳的 */
const PAGE_NAV_MIN_SECTIONS = 2;
let pageNavLock = 0;
let pageNavTimer = 0;

/* 参与导航的区块：页面内最外层的 section（嵌套的 section 属于父区块的内容，
   不单独成项），自身没被 display:none 隐藏，且带 h2 标题。判据用 computed
   display 而不是 offsetParent —— 后者在整页隐藏（切到其它标签页）时会把所有
   区块都判成不可见，导航会整个空掉。 */
function pageNavSections(page){
  if(!page) return [];
  return Array.from(page.querySelectorAll('section')).filter(function(sec){
    if(getComputedStyle(sec).display === 'none') return false;
    if(!sec.querySelector('h2')) return false;
    for(let p = sec.parentElement; p && p !== page; p = p.parentElement){
      if(p.tagName === 'SECTION') return false;
    }
    return true;
  });
}

function pageNavLabel(section, index){
  const h2 = section.querySelector('h2');
  if(h2){
    const clone = h2.cloneNode(true);
    // em 是计数/版本这类附属标注；.page-nav-exclude 是标题里那些不该进导航的
    // 控件（例如「网关模型清单」标题里的 全选 / 全不选 / 反选 按钮）——它们
    // 只是摆在同一行，不是标题文本，混进来会让导航项和锚点 id 都带上按钮名。
    clone.querySelectorAll('em, .page-nav-exclude').forEach(el => el.remove());
    const text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    if(text) return text;
  }
  return '未命名区块 ' + (index + 1);
}

/* 由标题内容导出稳定 id：与区块顺序无关，链接可长期复用 */
function pageNavAnchorId(label, taken){
  let hash = 5381;
  for(let i = 0; i < label.length; i++) hash = ((hash << 5) + hash + label.charCodeAt(i)) >>> 0;
  const base = 'page-sec-' + hash.toString(36);
  let id = base, n = 2;
  while(taken.has(id)) id = base + '-' + (n++);
  return id;
}

/* 区块清单的指纹：只有它变了才重建导航，免得轮询重建表格时把高亮抖掉 */
function pageNavSignature(page){
  return pageNavSections(page).map(function(sec, i){ return pageNavLabel(sec, i); }).join('\u0001');
}

/* 跳转时要让开的距离：吸顶 header，窄屏下再加上同样吸顶的导航条本身 */
function pageNavHeaderOffset(page){
  const header = document.querySelector('header');
  const narrow = window.matchMedia('(max-width:860px)').matches;
  // 窄屏下二级导航条紧贴 header 底边（见 syncPageNavOffset），不再留 14px 缝，
  // 否则内容会从两条吸顶栏之间的缝隙里穿过去。
  const base = (header ? header.offsetHeight : 64) + (narrow ? 0 : 14);
  const sidebar = page ? page.querySelector('.page-sidebar') : null;
  if(sidebar && narrow){
    return base + sidebar.offsetHeight + 10;
  }
  return base;
}

function syncPageNavOffset(){
  const header = document.querySelector('header');
  const narrow = window.matchMedia('(max-width:860px)').matches;
  const top = (header ? header.offsetHeight : 64) + (narrow ? 0 : 14);
  document.documentElement.style.setProperty(PAGE_NAV_TOP_VAR, top + 'px');
}

function setActivePageNav(page, id){
  const nav = page ? page.querySelector('.page-nav') : null;
  if(!nav) return;
  nav.querySelectorAll('.page-nav-item').forEach(function(item){
    item.classList.toggle('active', !!id && item.dataset.target === id);
  });
}

function scrollToPageSection(page, id, smooth){
  const section = document.getElementById(id);
  if(!section) return;
  const top = section.getBoundingClientRect().top + window.pageYOffset - pageNavHeaderOffset(page);
  window.scrollTo({ top: Math.max(0, top), behavior: smooth === false ? 'auto' : 'smooth' });
  setActivePageNav(page, id);
  // 平滑滚动期间抑制滚动高亮，避免中途掠过其它区块把高亮抢走
  pageNavLock = Date.now() + 700;
  section.classList.add('page-nav-flash');
  setTimeout(() => section.classList.remove('page-nav-flash'), 900);
  try {
    const url = new URL(window.location.href);
    url.hash = id;
    history.replaceState(null, '', url.toString());
  } catch(e){}
}

/* 回到顶部：和区块跳转一样在平滑滚动期间抑制滚动高亮，免得中途掠过其它区块
   把高亮抢走；顺便清掉锚点，免得刷新后又落回刚才那个区块。滚完不会再触发滚动
   事件，所以高亮得自己收尾到第一项。 */
function scrollPageToTop(page){
  window.scrollTo({ top: 0, behavior: 'smooth' });
  pageNavLock = Date.now() + 700;
  const first = page ? page.querySelector('.page-nav-item') : null;
  if(first) setActivePageNav(page, first.dataset.target);
  try {
    const url = new URL(window.location.href);
    history.replaceState(null, '', url.pathname + url.search);
  } catch(e){}
}

function pageNavSpy(){
  if(Date.now() < pageNavLock) return;
  const page = document.querySelector('.main-page.active.page-nav-on');
  if(!page) return;
  const nav = page.querySelector('.page-nav');
  if(!nav) return;
  const items = Array.from(nav.querySelectorAll('.page-nav-item'));
  if(!items.length) return;
  const threshold = pageNavHeaderOffset(page) + 8;
  let activeId = items[0].dataset.target;
  for(const item of items){
    const section = document.getElementById(item.dataset.target);
    if(!section) continue;
    if(section.getBoundingClientRect().top - threshold <= 0) activeId = item.dataset.target;
    else break;
  }
  // 滚到底时高亮最后一项，否则末尾区块永远点不亮
  if(window.innerHeight + window.pageYOffset >= document.documentElement.scrollHeight - 4){
    activeId = items[items.length - 1].dataset.target;
  }
  setActivePageNav(page, activeId);
}

/* 滚动高亮：滚动事件本身已按帧节流，这里不再叠一层 requestAnimationFrame
   （后台标签页会挂起 rAF，反而让高亮停在旧位置）。 */
function onPageNavScroll(){
  pageNavSpy();
}

function pageNavCollapsedPref(){
  try { return localStorage.getItem(PAGE_NAV_COLLAPSE_KEY) === '1'; } catch(e){ return false; }
}

/* 收起与否只体现为页面上的一个类，样式和窄屏回退都由 CSS 决定；按钮的
   文字/标题跟着状态走，收起后它就是唯一的入口。 */
function applyPageNavCollapse(page, collapsed){
  if(!page) return;
  page.classList.toggle('page-nav-collapsed', !!collapsed);
  const btn = page.querySelector('.page-sidebar-toggle');
  if(!btn) return;
  const label = collapsed ? '展开本页导航' : '收起本页导航';
  btn.textContent = collapsed ? '»' : '«';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

function togglePageNavCollapse(page){
  const collapsed = !page.classList.contains('page-nav-collapsed');
  try { localStorage.setItem(PAGE_NAV_COLLAPSE_KEY, collapsed ? '1' : '0'); } catch(e){}
  applyPageNavCollapse(page, collapsed);
}

let CURRENT_SETTINGS_CAT = 'all';

function filterSettingsCategory(cat){
  CURRENT_SETTINGS_CAT = cat || 'all';
  try { localStorage.setItem('WB_SETTINGS_CAT', CURRENT_SETTINGS_CAT); } catch(e){}
  
  // 1. Update capsule button active class
  document.querySelectorAll('.settings-cat-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === CURRENT_SETTINGS_CAT);
  });

  // 2. Filter sections inside #pageSettings
  const page = document.getElementById('pageSettings');
  if(!page) return;
  const sections = page.querySelectorAll('section[data-cat]');
  sections.forEach(sec => {
    const match = (CURRENT_SETTINGS_CAT === 'all' || sec.dataset.cat === CURRENT_SETTINGS_CAT);
    sec.style.display = match ? '' : 'none';
  });

  // 3. Refresh left sidebar navigation so it dynamically matches the filtered sections
  if(typeof refreshPageNav === 'function'){
    refreshPageNav();
  }
}

function initPageNav(page){
  if(!page) return;
  syncPageNavOffset();
  const sections = pageNavSections(page);
  const signature = pageNavSignature(page);
  let sidebar = page.querySelector('.page-sidebar');

  // 区块不足两项（例如日志页只有一个视图）就不给侧栏，页面保持单栏
  if(sections.length < PAGE_NAV_MIN_SECTIONS){
    if(sidebar) sidebar.remove();
    page.classList.remove('page-nav-on', 'page-nav-collapsed');
    delete page.dataset.pageNavSignature;
    return;
  }
  // 清单没变就不动 DOM，保留现有高亮
  if(sidebar && page.dataset.pageNavSignature === signature) return;

  const taken = new Set(Array.from(document.querySelectorAll('[id]')).map(el => el.id));
  const anchors = [];
  sections.forEach(function(section, i){
    const label = pageNavLabel(section, i);
    let id = section.id;
    if(!id){
      id = pageNavAnchorId(label, taken);
      section.id = id;
    }
    taken.add(id);
    anchors.push({ id: id, label: label });
  });

  // 重建时保留原来的高亮，别因为一次重建就闪回第一项
  const prevActive = sidebar ? sidebar.querySelector('.page-nav-item.active') : null;
  const prevTarget = prevActive ? prevActive.dataset.target : null;

  // 内容整体包一层：grid 里只剩「侧栏 + 内容」两项，侧栏才跨得满整个内容区，
  // 区块之间的间距也不会被网格行间距再叠一次。
  let body = page.querySelector('.page-nav-body');
  if(!body){
    body = document.createElement('div');
    body.className = 'page-nav-body';
    Array.from(page.children).forEach(function(el){ if(el !== sidebar) body.appendChild(el); });
    page.appendChild(body);
  }

  if(!sidebar){
    sidebar = document.createElement('aside');
    sidebar.className = 'page-sidebar';
    sidebar.setAttribute('aria-label', '本页区块导航');
    page.insertBefore(sidebar, page.firstChild);
  }
  sidebar.textContent = '';
  const head = document.createElement('div');
  head.className = 'page-sidebar-head';
  const title = document.createElement('div');
  title.className = 'page-sidebar-title';
  title.textContent = '本页导航';
  head.appendChild(title);
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'page-sidebar-toggle';
  collapseBtn.addEventListener('click', function(){ togglePageNavCollapse(page); });
  head.appendChild(collapseBtn);
  sidebar.appendChild(head);
  applyPageNavCollapse(page, pageNavCollapsedPref());

  // 排在区块清单之外：它不是一个区块，不参与高亮与滚动侦测；窄屏下也就能
  // 留在横向胶囊行的左端，不跟着一起滚走。
  const toTop = document.createElement('button');
  toTop.type = 'button';
  toTop.className = 'page-nav-top';
  toTop.textContent = '↑ 回到顶部';
  toTop.title = '回到顶部';
  toTop.addEventListener('click', function(){ scrollPageToTop(page); });
  sidebar.appendChild(toTop);

  const nav = document.createElement('nav');
  nav.className = 'page-nav';
  anchors.forEach(function(a){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-nav-item';
    btn.dataset.target = a.id;
    btn.textContent = a.label;
    btn.title = a.label;
    btn.addEventListener('click', function(){ scrollToPageSection(page, a.id); });
    nav.appendChild(btn);
  });
  sidebar.appendChild(nav);

  page.classList.add('page-nav-on');
  page.dataset.pageNavSignature = signature;

  if(!window.__pageNavBound){
    window.__pageNavBound = true;
    window.addEventListener('scroll', onPageNavScroll, { passive: true });
    window.addEventListener('resize', function(){
      syncPageNavOffset();
      initPageNav(document.querySelector('.main-page.active'));
      onPageNavScroll();
    });
  }
  observePageNav();
  const keep = prevTarget && anchors.some(function(a){ return a.id === prevTarget; });
  setActivePageNav(page, keep ? prevTarget : anchors[0].id);
  onPageNavScroll();
}

/* 区块在运行时可能增删或整块显隐（例如国内版的成长任务区块），让导航跟上，
   免得侧栏停在旧清单上。只盯当前页：非当前页的变化在切过去时由 initPageNav()
   重算，没必要在后台一直扫。 */
function refreshPageNav(){
  pageNavTimer = 0;
  initPageNav(document.querySelector('.main-page.active'));
}

function observePageNav(){
  if(window.__pageNavObserved || typeof MutationObserver === 'undefined') return;
  window.__pageNavObserved = true;
  const schedule = function(records){
    // 导航自身重建/改高亮引起的变更不必再算一遍，否则滚动时会自激
    if(records && records.every(function(r){
      const el = r.target;
      return el && el.closest && el.closest('.page-sidebar');
    })) return;
    if(pageNavTimer) clearTimeout(pageNavTimer);
    pageNavTimer = setTimeout(refreshPageNav, 200);
  };
  new MutationObserver(schedule).observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'],
  });
}

/* 带 #锚点 打开时直接落到对应区块 */
function restorePageNavHash(){
  const page = document.querySelector('.main-page.active.page-nav-on');
  if(!page) return;
  const id = (window.location.hash || '').slice(1);
  if(!id) return;
  // 被隐藏的区块不进导航，也不该作为锚点落点（否则会滚到一个不可见的位置）
  const navigable = pageNavSections(page).some(function(s){ return s.id === id; });
  if(navigable) scrollToPageSection(page, id, false);
}

// ==== 账号区折叠开始 ====
// 折叠纯粹是呈现：账号轮询（loadAccounts）、realm 切换、签到/启用停用等逻辑
// 都不碰这里，所以收起之后它们照常跑，也不会把区域顶开。偏好存在服务端的
// accounts/settings.json（accounts_collapsed），不用 localStorage。
let _accountsCollapsed = false;

function accountsSectionBody(){
  return document.getElementById('accountsBody');
}

// 唯一的写入口：aria-expanded、正文的 collapsed 类与内存状态一起改，
// 三者不可能不同步。
function applyAccountsCollapsed(collapsed){
  _accountsCollapsed = collapsed === true;
  const body = accountsSectionBody();
  const btn = document.getElementById('accountsToggle');
  if(body) body.classList.toggle('collapsed', _accountsCollapsed);
  if(btn) btn.setAttribute('aria-expanded', _accountsCollapsed ? 'false' : 'true');
  return _accountsCollapsed;
}

function accountsCollapsed(){
  return _accountsCollapsed;
}

// 显式选择走既有的 settings save 通道（一个键的 patch，不动别的设置）。
async function toggleAccountsSection(evt){
  if(evt && evt.preventDefault) evt.preventDefault();
  const next = !_accountsCollapsed;
  applyAccountsCollapsed(next);
  try {
    await postJSON('/settings/save', {accounts_collapsed: next});
  } catch(e) {
    toast('折叠状态保存失败: ' + e.message, 'bad');
  }
}
// ==== 账号区折叠结束 ====

// ==== 顶部页签显示开始 ====
// 顶部页签的显隐偏好。清单不写死：按 .main-nav 里现有的按钮现场生成，上游以后
// 增删页面这里自动跟上，不必同步改这份代码。
// 偏好存在服务端（accounts/settings.json 的 hidden_pages），与账号区折叠、
// 「(切换前)」行是同一套通道，换浏览器、重启服务都记得，不用 localStorage。

/* 「设置」固定保留：它是这个开关自己的入口，收起来之后面板里再没有别的地方能把它
   放回来。其余页面都能自由选择。 */
const PAGE_KEEP_VISIBLE = 'settings';
/* 页签 key 由按钮 id 推出（btnNavGateway → gateway），与 switchMainTab() 和启动
   脚本用的是同一套命名；id 不是这个形状的按钮直接跳过，不猜。 */
const NAV_BUTTON_PREFIX = 'btnNav';
/* 页面 key 的合法形状，与 wb_settings.PAGE_KEY_RE 一致 */
const PAGE_KEY_SHAPE = /^[a-z][a-z0-9_-]{0,31}$/;

let _hiddenPages = [];

function navPageKey(btn){
  const id = (btn && btn.id) || '';
  if(id.indexOf(NAV_BUTTON_PREFIX) !== 0) return '';
  return id.slice(NAV_BUTTON_PREFIX.length).toLowerCase();
}

function navPageRows(){
  const nav = document.querySelector('.main-nav');
  if(!nav) return [];
  const rows = [];
  Array.from(nav.querySelectorAll('.main-nav-btn')).forEach(function(btn){
    const key = navPageKey(btn);
    if(!key) return;
    rows.push({
      key: key,
      btn: btn,
      page: document.getElementById('page' + key.charAt(0).toUpperCase() + key.slice(1)),
    });
  });
  return rows;
}

/* 清单上的标签取页签按钮的文案。i18n 把原文留在文本节点的 __wbSrc 上（译文写在
   data 上），所以这里读 __wbSrc 拿到的一律是中文原文——插进设置页后由面板自己的
   i18n 观察者翻译，切语言时也跟着 restore/walk 走，不用在这里额外重建一次。
   没被 walk 过的节点（界面一直是中文）没有 __wbSrc，textContent 本身就是原文。 */
function navPageLabel(row){
  // 新壳的导航文案与旧顶栏不同（任务与福利 → 自动化，数据看板 → 用量…），
  // 设置里的「顶部页签显示」要跟着新壳走，不能把旧标签又露出来。
  if(window.__NEXT_UI__){
    const nextLabels = {
      gateway: '网关', accounts: '账号', tasks: '自动化', analytics: '用量',
      agents: '智能体', settings: '设置', logs: '日志'
    };
    if(nextLabels[row.key]) return nextLabels[row.key];
  }
  const btn = row.btn;
  const node = btn ? btn.firstChild : null;
  const source = (node && node.nodeType === 3 && node.__wbSrc != null)
    ? node.__wbSrc : (btn ? btn.textContent : '');
  return String(source || '').replace(/\s+/g, ' ').trim() || row.key;
}

function hiddenPages(){
  return _hiddenPages.slice();
}

/* 「设置」固定可见，所以一定有结果；真到了没有可见页面那一步，退回网关页。 */
function firstVisiblePage(){
  const rows = navPageRows();
  for(let i = 0; i < rows.length; i++){
    if(!pageHidden(rows[i].key)) return rows[i].key;
  }
  return 'gateway';
}

/* 这一页是否被收起。判断散在六个地方，两个方向写反一次就是「点一下收起来、
   再点一下还是收起来」，收进这里只留一处。 */
function pageHidden(key){
  return _hiddenPages.indexOf(key) >= 0;
}

/* 服务端下发的清单照单收下，但仍过一遍归一化：手改过的文件、将来的客户端或上游
   新增的页面都可能带来这里不认识的 key，不认识的忽略即可。「设置」无论从哪个来源
   来都不收起——不这样兜底，手改 settings.json 就能把面板唯一的入口关掉。
   归一化口径与 wb_settings._clean_page_keys 对齐（形状、去重、丢掉「设置」），
   免得两边记的清单不是一回事；条数上限只在服务端，面板一次最多提交自己那几个页签。 */
function normaliseHiddenPages(hidden){
  if(!Array.isArray(hidden)) return [];
  const out = [];
  hidden.forEach(function(key){
    if(typeof key !== 'string') return;
    const page = key.trim();
    if(!PAGE_KEY_SHAPE.test(page) || page === PAGE_KEEP_VISIBLE) return;
    if(out.indexOf(page) >= 0) return;
    out.push(page);
  });
  return out;
}

/* 唯一写内存状态的入口：页签按钮、页面容器与设置页的勾选框一起改，三者不可能不同步。 */
function applyHiddenPages(hidden){
  _hiddenPages = normaliseHiddenPages(hidden);
  navPageRows().forEach(function(row){
    const off = pageHidden(row.key);
    // 用 hidden 属性而不是内联 display：「智能体配置」不可用时也是自己改 display
    // 收起来的，两套机制各管各的，谁都不会把对方放出来。
    row.btn.hidden = off;
    if(row.page) row.page.hidden = off;
  });
  // 当前所在页被收起来了（书签、上次停留的页签）就退到第一个还看得见的页面，
  // 免得停在一个顶部没有任何入口的页面上。「设置」固定可见，所以一定有落点。
  if(pageHidden(currentMainTab)){
    const visible = navPageRows().filter(function(row){ return !pageHidden(row.key); });
    if(visible.length) switchMainTab(visible[0].key);
  }
  renderPageVisibility();
  return _hiddenPages;
}

function pageVisibilityBox(list, key){
  const items = Array.from(list.children);
  for(let i = 0; i < items.length; i++){
    const box = items[i].firstElementChild;
    if(box && box.dataset && box.dataset.pageKey === key) return box;
  }
  return null;
}

function pageVisibilityItem(row){
  const item = document.createElement('label');
  item.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:13px;min-height:32px;cursor:pointer';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.style.cssText = 'width:16px;height:16px';
  box.dataset.pageKey = row.key;
  box.disabled = (row.key === PAGE_KEEP_VISIBLE);
  if(box.disabled) item.title = '「设置」是页面显示开关自己的入口，收起来就放不回去了，固定保留。';
  box.addEventListener('change', function(){ togglePageVisibility(row.key); });
  const text = document.createElement('span');
  text.textContent = navPageLabel(row);
  item.appendChild(box);
  item.appendChild(text);
  return item;
}

/* 重建只在清单变了的时候做：其余情况只同步勾选状态，免得每次 loadSettings 都把
   焦点和滚动位置抖掉。指纹的写法与侧栏导航的 pageNavSignature 一致。 */
function renderPageVisibility(){
  const list = document.getElementById('setPagesList');
  if(!list) return;
  const rows = navPageRows();
  const stamp = rows.map(function(row){ return row.key + '\u0001' + navPageLabel(row); }).join('\u0002');
  if(list.dataset.pagesStamp !== stamp){
    while(list.firstChild) list.removeChild(list.firstChild);
    rows.forEach(function(row){ list.appendChild(pageVisibilityItem(row)); });
    list.dataset.pagesStamp = stamp;
  }
  rows.forEach(function(row){
    const box = pageVisibilityBox(list, row.key);
    if(box) box.checked = !pageHidden(row.key);
  });
  const state = document.getElementById('setPagesState');
  if(state){
    const shown = rows.length - _hiddenPages.length;
    state.textContent = _hiddenPages.length ? ('(显示 ' + shown + '/' + rows.length + ')') : '(全部显示)';
    state.style.color = _hiddenPages.length ? 'var(--warn)' : 'var(--dim)';
  }
}

/* 显式选择走既有的 settings save 通道（一个键的 patch，不动别的设置）。 */
async function togglePageVisibility(key){
  const before = _hiddenPages.slice();
  const next = before.filter(function(k){ return k !== key; });
  if(before.indexOf(key) < 0) next.push(key);
  applyHiddenPages(next);
  try {
    const res = await postJSON('/settings/save', {hidden_pages: next});
    // 服务端会丢掉不合法的 key，以它存的为准，免得两边记的不是一回事
    if(res && Array.isArray(res.hidden_pages)) applyHiddenPages(res.hidden_pages);
  } catch(e) {
    applyHiddenPages(before);
    toast('页面显示设置保存失败: ' + e.message, 'bad');
  }
}
// ==== 顶部页签显示结束 ====

// ==== 账号页签模式开始 ====
// 「账号」是独立成一个主菜单，还是留在「网关与账号」页，由服务端设置
// accounts_separate_tab 决定（默认关闭 = 合并，与拆分前一致）。
//
// 三个账号区块始终是同一批 DOM 节点，只是挂在不同页下面：合并时挂到
// #pageGateway 的锚点处（控制栏之后、最近请求之前，也就是拆分前的位置），
// 拆分时挂回 #pageAccounts 的页头之后。挂在谁下面就归谁的侧栏——区块侧栏是
// initPageNav() 现场扫描本页区块生成的，所以搬完不用另外维护导航。
let _accountsSeparateTab = false;
let _accountsSections = null;

function accountsPageSections(){
  // 区块可能已经被 initPageNav() 包进 .page-nav-body（页面内容整体包一层，
  // grid 里才只剩「侧栏 + 内容」两项），所以页面 div 与那层包裹都要找一遍。
  // 只在拿到非空结果时才记住：搬走之后账号页里就只剩页头了，那时再找也找不回来。
  if(_accountsSections && _accountsSections.length) return _accountsSections;
  const page = document.getElementById('pageAccounts');
  if(!page) return [];
  const scopes = [page];
  Array.from(page.children).forEach(el => {
    if(el.classList && el.classList.contains('page-nav-body')) scopes.push(el);
  });
  const found = [];
  scopes.forEach(scope => Array.from(scope.children).forEach(el => {
    if(el.tagName === 'SECTION' && found.indexOf(el) === -1) found.push(el);
  }));
  if(found.length) _accountsSections = found;
  return found;
}

function accountsSeparateTab(){
  return _accountsSeparateTab;
}

// 插到锚点前面——插在锚点**所在的那个容器**里，而不是插到页面 div 上：
// 锚点被 .page-nav-body 包起来之后就不再是页面 div 的直接子节点了，直接对页面
// div 调 insertBefore 会抛 NotFoundError（而 loadSettings 的 try/catch 会把它
// 吞掉，表现成「开关没反应」这种最难查的样子）。
function insertBeforeAnchor(sections, anchor){
  const host = anchor && anchor.parentNode;
  if(!host || !sections.length) return false;
  sections.forEach(s => host.insertBefore(s, anchor));
  return true;
}

function applyAccountsTabLayout(separate){
  _accountsSeparateTab = (separate === true);
  const pageGateway = document.getElementById('pageOverview') || document.getElementById('pageGateway');
  const pageAccounts = document.getElementById('pageAccounts');
  if(!pageGateway || !pageAccounts) return _accountsSeparateTab;

  const sections = accountsPageSections();
  // 版本切换跟着账号区块走：拆分时回到账号页页头右侧，合并时搬到网关页的账号
  // 区块正上方。合并模式下网关页最上面那两张出口卡片也能切版本，但账号区在页面
  // 中段，要换一版得先滚回页首——跟着搬一次就不必了。
  // 先摆它再摆区块：两者都是「插到锚点前面」，谁先插谁在前，顺序才是控件 → 区块。
  const realmSwitch = document.getElementById('accountsRealmSwitch');
  if(realmSwitch){
    if(_accountsSeparateTab){
      const home = document.getElementById('accountsHeader');
      if(home && realmSwitch.parentNode !== home) home.appendChild(realmSwitch);
    } else {
      insertBeforeAnchor([realmSwitch], document.getElementById('accountsSectionsAnchor'));
    }
  }

  if(_accountsSeparateTab){
    // 两个页签：区块回账号页的页头之后，按原顺序。
    insertBeforeAnchor(sections, document.getElementById('accountsHomeAnchor'));
  } else {
    // 一个页签：区块挂到网关页的锚点处，位置与拆分前一致。
    insertBeforeAnchor(sections, document.getElementById('accountsSectionsAnchor'));
  }

  const btnAccounts = document.getElementById('btnNavAccounts');
  if(btnAccounts) btnAccounts.style.display = _accountsSeparateTab ? '' : 'none';
  // 名字跟着走：账号已经不在这一页了，就不能再叫「网关与账号」。
  const gatewayLabel = document.getElementById('navGatewayLabel');
  if(gatewayLabel) gatewayLabel.textContent = document.documentElement.getAttribute('data-console-layout') === 'on' ? '运行概览' : (_accountsSeparateTab ? '网关' : '网关与账号');
  if(window.__NEXT_UI__){
    const title = document.getElementById('gatewayPageTitle');
    const desc = document.getElementById('gatewayPageDesc');
    if(title) title.textContent = '总览';
    if(desc) desc.textContent = '出口、账号健康、当日调用和最近请求一屏看完。';
  } else if(document.documentElement.getAttribute('data-console-layout') === 'on') {
    if(typeof applyConsoleView === 'function') applyConsoleView(CONSOLE_VIEW);
  } else {
    const pageTitle = document.getElementById('gatewayPageTitle');
    const pageDesc = document.getElementById('gatewayPageDesc');
    if(pageTitle) pageTitle.textContent = _accountsSeparateTab ? '网关' : '网关与账号';
    if(pageDesc) pageDesc.textContent = _accountsSeparateTab
      ? '管理代理出口与网关模型，查看当日调用量、估算花费、成功率与最近请求。'
      : '管理账号池与代理出口，查看当日调用量、估算花费、成功率、最近请求与网关模型清单。';
  }
  return _accountsSeparateTab;
}

// 显式选择走既有的 settings save 通道（一个键的 patch，不动别的设置）。
// ==== 媒体能力（生图 / 生视频）开始 ====
// 说明：这里只做两件事——把设置回填/提交，以及在「媒体」页画两张只读表。
// 生图与生视频的**花钱判断全在服务端**（开关、每分钟次数、每日积分、余额、日限额、
// 队列上限），前端不做任何预估，避免"面板说可以、服务端拒了"这种自相矛盾。
const MEDIA_STATUS_LABEL = {
  queued: '排队中', in_progress: '生成中', running: '生成中',
  completed: '已完成', failed: '失败'
};
const MEDIA_STATUS_BADGE = {
  queued: 's', in_progress: 'warn', running: 'warn',
  completed: 'ok', failed: 'bad'
};

function applyMediaSettings(media){
  const cfg = media || {};
  const enabled = document.getElementById('setMediaEnabled');
  if(enabled) enabled.checked = cfg.enabled === true;
  const realm = document.getElementById('setMediaRealm');
  if(realm && cfg.realm) realm.value = cfg.realm;
  const identity = document.getElementById('setMediaIdentity');
  if(identity && cfg.identity) identity.value = cfg.identity;
  const rate = document.getElementById('setMediaImageRate');
  if(rate && cfg.image_max_per_minute != null) rate.value = cfg.image_max_per_minute;
  const seconds = document.getElementById('setMediaVideoSeconds');
  if(seconds && cfg.video_max_seconds != null) seconds.value = cfg.video_max_seconds;
  const credits = document.getElementById('setMediaDailyCredits');
  if(credits && cfg.daily_credits_per_key != null) credits.value = cfg.daily_credits_per_key;
  const conc = document.getElementById('setMediaVideoConcurrency');
  if(conc && cfg.video_concurrency != null) conc.value = cfg.video_concurrency;
  const state = document.getElementById('setMediaState');
  if(state){
    state.textContent = cfg.enabled === true ? '(已开启)' : '(已关闭)';
    state.style.color = cfg.enabled === true ? 'var(--accent2)' : 'var(--dim)';
  }
}

async function saveMediaConfig(btn){
  const num = (id, fallback) => {
    const el = document.getElementById(id);
    const value = el ? Number(el.value) : NaN;
    return Number.isFinite(value) ? value : fallback;
  };
  const payload = {
    media: {
      enabled: !!(document.getElementById('setMediaEnabled') || {}).checked,
      realm: (document.getElementById('setMediaRealm') || {}).value || 'cn',
      identity: (document.getElementById('setMediaIdentity') || {}).value || 'desktop',
      image_max_per_minute: num('setMediaImageRate', 6),
      video_max_seconds: num('setMediaVideoSeconds', 15),
      daily_credits_per_key: num('setMediaDailyCredits', 0),
      video_concurrency: num('setMediaVideoConcurrency', 3)
    }
  };
  if(btn) btn.disabled = true;
  try{
    const res = await postJSON('/settings/save', payload);
    if(res && res.media) applyMediaSettings(res.media);
    toast(payload.media.enabled ? '已开启：媒体路由可用' : '已关闭：媒体路由不再存在');
    loadSettings();
  }catch(e){
    toast('保存失败: ' + e.message, 'bad');
  }finally{
    if(btn) btn.disabled = false;
  }
}

async function loadMediaPage(){
  loadMediaModels();
  loadMediaTasks();
}

async function loadMediaModels(force){
  const box = document.getElementById('mediaModelsList');
  const state = document.getElementById('mediaModelsState');
  if(!box) return;
  if(state){ state.textContent = '(读取中…)'; state.style.color = 'var(--dim)'; }
  try{
    const data = await getJSON('/v1/media/models');
    const models = (data && data.models) || [];
    if(state){
      state.textContent = '(' + models.length + ' 个 · ' + (data.realm || '-')
        + (data.enabled ? ' · 已开启' : ' · 未开启') + ')';
      state.style.color = data.enabled ? 'var(--accent2)' : 'var(--warn)';
    }
    if(!models.length){
      box.innerHTML = '<div style="font-size:12px;color:var(--dim)">该区目录里没有媒体模型——账号可能没有生图 / 生视频权限。</div>';
      return;
    }
    box.innerHTML = '<table><thead><tr><th>模型</th><th>能力</th><th>时长</th>'
      + '<th>分辨率</th><th>比例</th><th>prompt 上限</th></tr></thead><tbody>'
      + models.map(m => {
          const g = m.videoGeneration || {};
          const tags = (m.tags || []).map(t => {
            const label = {'text-to-image': '文生图', 'image-to-image': '改图',
                           'text-to-video': '文生视频', 'image-to-video': '图生视频'}[t];
            return '<span class="badge s mini">' + esc(label || t) + '</span>';
          }).join(' ');
          const span = (g.minSeconds != null && g.maxSeconds != null)
            ? (g.minSeconds + '–' + g.maxSeconds + ' 秒') : '-';
          const res = (g.resolutions || []).length ? g.resolutions.join(' / ') : '-';
          const ratios = (g.aspectRatios || []).length ? g.aspectRatios.join(' / ') : '-';
          const prompt = g.maxPromptLength != null ? (g.maxPromptLength + ' 字符') : '-';
          return '<tr><td class="mono">' + esc(m.id) + '</td>'
               + '<td>' + tags + '</td><td>' + esc(span) + '</td>'
               + '<td class="mono">' + esc(res) + '</td>'
               + '<td class="mono">' + esc(ratios) + '</td>'
               + '<td>' + esc(prompt) + '</td></tr>';
        }).join('')
      + '</tbody></table>';
  }catch(e){
    if(state){ state.textContent = '(读取失败)'; state.style.color = 'var(--bad)'; }
    box.innerHTML = '<div style="font-size:12px;color:var(--bad)">' + esc(e.message) + '</div>';
  }
}

async function loadMediaTasks(force){
  const box = document.getElementById('mediaTasksList');
  const state = document.getElementById('mediaTasksState');
  if(!box) return;
  if(state){ state.textContent = '(读取中…)'; state.style.color = 'var(--dim)'; }
  try{
    const data = await getJSON('/v1/media/tasks?limit=50');
    const tasks = (data && data.tasks) || [];
    const stats = (data && data.stats) || {};
    if(state){
      const pending = stats.pending || 0;
      state.textContent = '(' + tasks.length + ' 条' + (pending ? ' · ' + pending + ' 条进行中' : '') + ')';
      state.style.color = 'var(--dim)';
    }
    if(!tasks.length){
      box.innerHTML = '<div style="font-size:12px;color:var(--dim)">还没有任务。生视频提交成功后会出现在这里。</div>';
      return;
    }
    box.innerHTML = '<table><thead><tr><th>任务</th><th>状态</th><th>模型</th>'
      + '<th>时长</th><th>花费</th><th>提交时间</th><th>操作</th></tr></thead><tbody>'
      + tasks.map(t => {
          const label = MEDIA_STATUS_LABEL[t.status] || t.status;
          const badge = MEDIA_STATUS_BADGE[t.status] || 's';
          const when = t.created_at ? new Date(t.created_at * 1000).toLocaleString() : '-';
          const credit = (t.credit != null) ? (t.credit + ' 积分') : '-';
          const span = t.seconds ? (t.seconds + ' 秒') : '-';
          let action = '-';
          if(t.url){
            action = '<a href="' + esc(t.url) + '" target="_blank" rel="noopener">下载</a>';
          }else if(t.status === 'queued'){
            action = '<a href="#" data-media-task="' + esc(t.id)
              + '" onclick="cancelMediaTask(this);return false">取消</a>';
          }
          let tip = '';
          if(t.error && (t.error.code || t.error.message)){
            // 一行省略 + title 看全文：失败原因可能有整段上游原文，
            // 直接铺开会把整行撑得很高，后面的表格就对不齐了。
            const full = t.error.message || '';
            tip = '<div style="font-size:11px;color:var(--dim);margin-top:2px;'
              + 'max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"'
              + ' title="' + esc(full) + '">' + esc(full) + '</div>';
          }
          return '<tr><td class="mono">' + esc(t.id) + '</td>'
               + '<td><span class="badge ' + badge + '">' + esc(label) + '</span>' + tip + '</td>'
               + '<td class="mono">' + esc(t.model || '-') + '</td>'
               + '<td>' + esc(span) + '</td><td>' + esc(credit) + '</td>'
               + '<td>' + esc(when) + '</td><td>' + action + '</td></tr>';
        }).join('')
      + '</tbody></table>'
      + '<div style="font-size:12px;color:var(--dim);margin-top:8px">'
      + '排队 ' + (stats.queue_depth || 0) + ' 条 · 进行中 ' + (stats.pending || 0)
      + ' 条 · 共持有 ' + (stats.total || 0) + ' 条。失败的任务请展开看原因：'
      + '「invalid_request」没扣积分可以改参数重试，「upstream_error / task_lost」可能已经扣过费。</div>';
  }catch(e){
    if(state){ state.textContent = '(读取失败)'; state.style.color = 'var(--bad)'; }
    box.innerHTML = '<div style="font-size:12px;color:var(--bad)">' + esc(e.message) + '</div>';
  }
}

async function cancelMediaTask(trigger){
  const taskId = (trigger && trigger.getAttribute)
    ? trigger.getAttribute('data-media-task') : trigger;
  if(!taskId){ toast('缺少任务 id', 'bad'); return; }
  try{
    const res = await postJSON('/v1/videos/' + encodeURIComponent(taskId) + '/cancel', {});
    if(res && res.status) toast('已取消（本地轮询已停止）');
    else toast('取消请求已发送');
    loadMediaTasks();
  }catch(e){
    toast('取消失败: ' + e.message, 'bad');
  }
}
// ==== 媒体能力结束 ====

async function saveAccountsSeparateTab(btn){
  const el = document.getElementById('setAccountsSeparate');
  const value = !!(el && el.checked);
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {accounts_separate_tab: value});
    applyAccountsTabLayout(value);
    // 布局换了，导航、侧栏与当前页都要按新布局重算一遍；正停在「账号」页而
    // 刚关掉开关时，switchMainTab 会把这一页退回「网关与账号」。
    switchMainTab(currentMainTab);
    toast(value ? '已开启：账号独立成一个页签' : '已关闭：账号与网关回到同一页');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}
// ==== 账号页签模式结束 ====

// Layout and color theme are independent; use the console layout by default.
function toggleNextLayout(){
  const url = new URL(window.location.href);
  if(window.__NEXT_UI__) url.searchParams.delete('ui');
  else url.searchParams.set('ui', 'next');
  url.searchParams.delete('tab');
  window.location.assign(url.toString());
}
function initConsoleLayout(){
  const nextOption = document.getElementById('nextLayoutOption');
  if(nextOption && window.__NEXT_UI__) nextOption.textContent = '返回原布局';
  const on = document.documentElement.getAttribute('data-console-layout') === 'on';
  const nav = document.querySelector('.main-nav');
  const sidebar = document.getElementById('consoleSidebar');
  const header = document.querySelector('.header-left');
  const status = document.getElementById('statusDot');
  const statusHost = document.getElementById(on ? 'consoleStatusSlot' : 'classicTitle');
  if(status && statusHost) statusHost.insertBefore(status, statusHost.firstChild);
  if(nav && sidebar && header){
    if(on) sidebar.insertBefore(nav, sidebar.querySelector('.console-sidebar-foot'));
    else header.insertBefore(nav, header.querySelector('.gh-link'));
  }
  const option = document.getElementById('consoleLayoutOption');
  if(option) { option.setAttribute('aria-checked', on ? 'true' : 'false'); option.classList.toggle('active', on); }
}
function toggleConsoleLayout(evt){
  if(evt) { evt.preventDefault(); evt.stopPropagation(); }
  const menu = document.getElementById('themeDropdown');
  const themeButton = document.getElementById('themeToggleBtn');
  if(menu) menu.classList.remove('open');
  if(themeButton) themeButton.setAttribute('aria-expanded', 'false');
  const root = document.documentElement;
  const on = root.getAttribute('data-console-layout') !== 'on';
  if(on) root.setAttribute('data-console-layout', 'on'); else root.removeAttribute('data-console-layout');
  ['wb-alibaba-console','wb-console-v2'].forEach(id => { const el = document.getElementById(id); if(el) el.media = on ? 'all' : 'not all'; });
  try { localStorage.setItem('wb-console-layout', on ? '1' : '0'); } catch(e){}
  if(!on){
    document.querySelectorAll('.console-view-hidden').forEach(el => el.classList.remove('console-view-hidden'));
    setConsoleNavOpen(false);
  }
  initConsoleLayout();
  applyAccountsTabLayout(_accountsSeparateTab);
  if(typeof switchMainTab === 'function') switchMainTab(currentMainTab);
  window.dispatchEvent(new Event('resize'));
}

// ==== 全局控制台导航开始 ====
const CONSOLE_COLLAPSE_KEY = 'wb-console-nav-collapsed';
const CONSOLE_PAGE_LABELS = {
  gateway: '运行概览', accounts: '账号管理', tasks: '任务与福利',
  media: '媒体', analytics: '数据看板', logs: '运行日志', settings: '网关设置', agents: '智能体接入'
};
function consoleNavIsMobile(){
  return !!(window.matchMedia && window.matchMedia('(max-width:760px)').matches);
}
function syncConsoleCollapseButton(){
  const collapsed = document.body.classList.contains('console-collapsed');
  const btn = document.getElementById('btnConsoleCollapse');
  if(!btn) return;
  const label = collapsed ? '展开功能导航' : '收起功能导航';
  btn.textContent = collapsed ? '»' : '«';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  document.querySelectorAll('.console-sidebar .main-nav-btn,.console-sidebar .console-nav-link').forEach(function(item){
    item.title = collapsed ? item.textContent.trim() : '';
  });
}
function toggleConsoleCollapse(){
  if(consoleNavIsMobile()){ setConsoleNavOpen(false); return; }
  const collapsed = document.body.classList.toggle('console-collapsed');
  try { localStorage.setItem(CONSOLE_COLLAPSE_KEY, collapsed ? '1' : '0'); } catch(e){}
  syncConsoleCollapseButton();
  if(typeof syncPageNavOffset === 'function') syncPageNavOffset();
  requestAnimationFrame(function(){ window.dispatchEvent(new Event('resize')); });
}
function setConsoleNavOpen(open){
  const on = !!open && consoleNavIsMobile();
  document.body.classList.toggle('console-nav-open', on);
  const btn = document.getElementById('btnConsoleNav');
  if(btn){
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? '关闭功能导航' : '打开功能导航');
  }
  const sidebar = document.getElementById('consoleSidebar');
  if(sidebar){
    if(consoleNavIsMobile()) sidebar.setAttribute('aria-hidden', on ? 'false' : 'true');
    else sidebar.removeAttribute('aria-hidden');
  }
  if(on && sidebar){
    const active = sidebar.querySelector('.main-nav-btn.active,.console-nav-link.active');
    if(active) active.focus();
  } else if(consoleNavIsMobile() && document.activeElement && sidebar && sidebar.contains(document.activeElement)){
    if(btn) btn.focus();
  }
}
function toggleConsoleNav(){ setConsoleNavOpen(!document.body.classList.contains('console-nav-open')); }
function initConsoleShell(){
  // 端口按实际访问地址显示：默认 8788，但部署在别的端口上时不该写死。
  const portEl = document.getElementById('consolePort');
  const port = (window.location && window.location.port) || '8788';
  if(portEl) portEl.textContent = port;
  const footPort = document.getElementById('consoleFootPort');
  if(footPort) footPort.textContent = ':' + port;
  let collapsed = false;
  try { collapsed = localStorage.getItem(CONSOLE_COLLAPSE_KEY) === '1'; } catch(e){}
  document.body.classList.toggle('console-collapsed', collapsed && !consoleNavIsMobile());
  window.addEventListener('resize', function(){
    if(!document.body.classList.contains('console-nav-open')) renderConsoleUsageChart(CONSOLE_INSIGHT_ROWS);
  });
  syncConsoleCollapseButton();
  setConsoleNavOpen(false);
  document.addEventListener('keydown', function(ev){
    if(ev.key === 'Escape' && document.body.classList.contains('console-nav-open')) setConsoleNavOpen(false);
  });
  document.addEventListener('click', function(ev){
    if(consoleNavIsMobile() && document.body.classList.contains('console-nav-open')
       && ev.target && ev.target.closest && ev.target.closest('.console-sidebar .main-nav-btn,.console-sidebar .console-nav-link')){
      setConsoleNavOpen(false);
    }
  });
  if(window.matchMedia){
    const media = window.matchMedia('(max-width:760px)');
    const changed = function(){
      if(!media.matches) setConsoleNavOpen(false);
      syncConsoleCollapseButton();
    };
    if(media.addEventListener) media.addEventListener('change', changed);
    else if(media.addListener) media.addListener(changed);
  }
}
function syncConsoleContext(tab){
  const label = document.getElementById('consoleCurrentPage');
  if(label) label.textContent = CONSOLE_PAGE_LABELS[tab] || '控制台';
  // 视觉高亮与 aria-current 必须由「同一个函数」一起清、一起设。
  // 原先这里只摘 active 类、不管 aria-current，而 setConsoleNavActive() 又只给
  // console-nav-link 设 aria-current —— 结果切到任务/媒体/看板/日志/智能体时，
  // 屏幕上高亮的是新页，屏幕阅读器读到的仍是「运行概览」，两套状态分叉。
  document.querySelectorAll('.console-nav-link').forEach(function(item){
    item.classList.remove('active');
    item.removeAttribute('aria-current');
  });
}
// 内容入口（模型管理 / 请求记录）与「运行概览」是三个互斥视图：
// 进入其中一个时，只显示它自己的区块，其余隐藏——不是在同一页里滚动定位。
let CONSOLE_VIEW = 'overview';
function setConsoleNavActive(linkId, label){
  // 只清「网关页内部」的三个视图入口（运行概览 / 模型管理 / 请求记录）。
  // 原先是 .console-sidebar .main-nav-btn.active —— 那条选择器会命中侧栏里
  // 所有一级页面按钮（设置、日志…），而这个函数在每次网关视图重算时都会跑，
  // 于是切到设置页后它刚被 switchMainTab() 点亮的 active 与 aria-current
  // 会在几帧之内被这里摘掉，表现为「点设置没有任何高亮」。
  document.querySelectorAll('#btnNavGateway.active, #btnNavModels.active, #btnNavRequests.active')
    .forEach(function(btn){
      btn.classList.remove('active');
      btn.removeAttribute('aria-current');
    });
  document.querySelectorAll('.console-nav-link').forEach(function(item){
    const on = !!linkId && item.id === linkId;
    item.classList.toggle('active', on);
    if(on) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  // 只有真的停在网关页时才把「当前页」还给网关按钮。
  // 这个函数由 applyConsoleView() 在网关页内部切换 模型管理/请求记录/运行概览
  // 三个视图时调用；如果不管当前 tab 就无条件点亮网关门，切到任务/媒体/看板
  // 时它会和 switchMainTab() 刚设好的 aria-current 打架——屏幕上高亮的是新页，
  // 读屏软件却仍报「网关」。
  if(!linkId){
    const gw = document.getElementById('btnNavGateway');
    const onGateway = (typeof currentMainTab === 'undefined' || currentMainTab === 'gateway');
    if(gw && onGateway){ gw.classList.add('active'); gw.setAttribute('aria-current', 'page'); }
  }
  const ctx = document.getElementById('consoleCurrentPage');
  if(ctx && label) ctx.textContent = label;
}
function applyConsoleView(view){
  if(document.documentElement.getAttribute('data-console-layout') !== 'on') return;
  CONSOLE_VIEW = (view === 'models' || view === 'requests') ? view : 'overview';
  const page = document.getElementById('pageGateway');
  const head = document.getElementById('gatewayPageHead');
  if(page){
    const host = page.querySelector('.page-nav-body') || page;
    const kids = host && host.children ? Array.from(host.children) : [];
    kids.forEach(function(el){
      if(!el || el.classList.contains('page-sidebar') || el.classList.contains('page-nav')) return;
      let keep;
      if(CONSOLE_VIEW === 'models') keep = el.id === 'gatewayModelsSection' || el.id === 'accountsRealmSwitch' || el === head;
      else if(CONSOLE_VIEW === 'requests') keep = el.id === 'recentRequestsSection' || el.id === 'accountsRealmSwitch' || el === head;
      // 概览：模型清单与请求记录各自成页，不在这里重复出现。
      else keep = el.id !== 'gatewayModelsSection' && el.id !== 'recentRequestsSection';
      // 用类而不是内联 display：其它代码（CodeArts 视图、账号分区等）也在管
      // 这些元素的显隐，直接写 style.display 会把它们的判断覆盖掉。
      el.classList.toggle('console-view-hidden', !keep);
    });
  }
  // 页头随视图走：三个视图各有自己的标题与说明。
  const title = document.getElementById('gatewayPageTitle');
  const desc = document.getElementById('gatewayPageDesc');
  const COPY = {
    overview: ['运行概览', _accountsSeparateTab
      ? '管理代理出口与网关模型，查看当日调用量、估算花费、成功率与最近请求。'
      : '管理账号池与代理出口，查看当日调用量、估算花费、成功率、最近请求与网关模型清单。'],
    models: ['模型管理', '当前视图下官方对话大模型、上下文容量、推理/视觉能力、思考控制、默认采样参数与在售倍率。'],
    requests: ['请求记录', '当前视图的请求明细：模型、账号、结果、耗时与用量，可按关键词和结果筛选。']
  }[CONSOLE_VIEW];
  if(title) title.textContent = COPY[0];
  if(desc) desc.textContent = COPY[1];
  if(CONSOLE_VIEW === 'models') setConsoleNavActive('btnNavModels', '模型管理');
  else if(CONSOLE_VIEW === 'requests') setConsoleNavActive('btnNavRequests', '请求记录');
  else setConsoleNavActive(null, '运行概览');
}
// 兼容旧调用点：保持原来的函数名语义不变。
function selectConsoleEntry(linkId, label){
  if(linkId === 'btnNavModels') return applyConsoleView('models');
  if(linkId === 'btnNavRequests') return applyConsoleView('requests');
  return applyConsoleView('overview');
}
function openModelCatalog(){
  switchMainTab('gateway');
  applyConsoleView('models');
  window.scrollTo({top: 0, behavior: 'smooth'});
}
function openRecentRequests(){
  switchMainTab('gateway');
  applyConsoleView('requests');
  window.scrollTo({top: 0, behavior: 'smooth'});
}
// ==== 全局控制台导航结束 ====

// ==== 面板窗口限高开始 ====
// 每个窗口（区块 + 日志终端）超过限高时在窗口内部滚动、标题行吸顶，整页不再被
// 单个窗口拉长。限高存在服务端（accounts/settings.json 的 section_max_height，
// 0 = 不限），这里只负责把它落到 CSS 变量与 body 类上：CSS 那三条规则全部挂在
// body.win-capped 之下，没挂类时版式与从前逐像素一致。loadSettings 每次都按服务端
// 存的值重放一遍，所以多个标签页之间不会各说各话。
function applyWinMaxHeight(px){
  const value = Number(px);
  const on = Number.isFinite(value) && value > 0;
  const root = document.documentElement;
  if(on) root.style.setProperty('--win-max-h', Math.round(value) + 'px');
  else root.style.removeProperty('--win-max-h');
  document.body.classList.toggle('win-capped', on);
  const state = document.getElementById('setWinMaxHeightState');
  if(state) state.textContent = on ? ('(当前 ' + Math.round(value) + 'px)') : '(不限)';
  return on;
}

async function saveWinMaxHeight(btn){
  const el = document.getElementById('setWinMaxHeight');
  // 空值必须显式拦下：Number('') 是 0，放过去就是「清空输入框」静默把限高关掉。
  const raw = el ? String(el.value) : '';
  const value = Number(raw);
  if(raw.trim() === '' || !Number.isFinite(value) || value < 0){
    toast('请填写 0 或正数（像素）', 'warn'); return;
  }
  if(btn) btn.disabled = true;
  try {
    const res = await postJSON('/settings/save', {section_max_height: Math.round(value)});
    // 回包里的才是服务端最终存下的（超上限会被夹到 4000），按它重放。
    const stored = res && res.section_max_height !== undefined
      ? Number(res.section_max_height) : Math.round(value);
    applyWinMaxHeight(stored);
    toast(stored > 0 ? ('已限高：窗口最高 ' + stored + 'px') : '已取消窗口限高（不限）', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}
// ==== 面板窗口限高结束 ====

async function loadSettings(showToast){
  try {
    const data = await getJSON('/settings');
    const pwdState = document.getElementById('setPwdState');
    if(pwdState){
      pwdState.textContent = data.panel_password_is_default ? '(当前为默认密码)' : '(已自定义)';
      pwdState.style.color = data.panel_password_is_default ? 'var(--warn)' : 'var(--accent2)';
    }
    const keyState = document.getElementById('setKeyState');
    if(keyState){
      const count = (data.api_keys || []).filter(k => k.enabled).length;
      keyState.textContent = count ? ('(' + count + ' 个生效)') : '(当前不校验)';
      keyState.style.color = count ? 'var(--accent2)' : 'var(--dim)';
    }

    applyLimits(data);
    applyUiLanguageSelect(data.ui_language || 'zh');

    // 账号区折叠：服务端没存过、存坏了，或后端根本没这个字段，都按展开算。
    applyAccountsCollapsed(data.accounts_collapsed === true);
    // 「(切换前)」行开关同理：只有明确存过 true 才收起，其余都照常显示。
    applyKeyBeforeHidden(data.key_before_hidden === true);
    // 顶部页签显示：字段缺失或存坏了都按「全部显示」算，见 normaliseHiddenPages。
    applyHiddenPages(data.hidden_pages);
    // 账号页签模式：同样只有明确存过 true 才拆开，其余（没存过、存坏了、
    // 后端没这个字段）都保持上游那个合并的「网关与账号」页。
    const separateTab = data.accounts_separate_tab === true;
    applyAccountsTabLayout(window.__NEXT_UI__ || separateTab);
    applyMediaSettings(data.media);
    const separateState = document.getElementById('setAccountsSeparateState');
    if(separateState) separateState.textContent = separateTab ? '(已开启)' : '(默认：合并)';
    const separateInput = document.getElementById('setAccountsSeparate');
    if(separateInput) separateInput.checked = separateTab;

    // 面板窗口限高：字段缺失（后端旧一点）或存坏了都按默认 640px 算，0 = 不限。
    // 坏值回落默认状态这条口径与「顶部页签显示」「账号区折叠」一致，见
    // wb_settings.section_max_height 与 applyWinMaxHeight。
    const rawWinMax = data.section_max_height;
    const winMax = (typeof rawWinMax === 'number' && Number.isFinite(rawWinMax) && rawWinMax >= 0)
      ? rawWinMax : 640;
    applyWinMaxHeight(winMax);
    if(!window.__NEXT_UI__){
      const savedCat = (typeof localStorage !== 'undefined') ? (localStorage.getItem('WB_SETTINGS_CAT') || 'all') : 'all';
      filterSettingsCategory(savedCat);
    }
    const winMaxInput = document.getElementById('setWinMaxHeight');
    if(winMaxInput) winMaxInput.value = String(Math.round(winMax));

      const creditsHoursInput = document.getElementById('setCreditsRefreshHours');
      if(creditsHoursInput && data.credits_refresh_hours !== undefined){
        creditsHoursInput.value = String(Number(data.credits_refresh_hours || 0));
      }

      const pricingOn = data.pricing_enabled !== false;
      const pricingEnabledInput = document.getElementById('setPricingEnabled');
      if(pricingEnabledInput) pricingEnabledInput.checked = pricingOn;
      applyPricingEnabled(pricingOn);
      const pricingMinutes = Number(data.pricing_refresh_minutes || 0);
      const pricingInput = document.getElementById('setPricingMinutes');
      if(pricingInput) pricingInput.value = String(pricingMinutes);
      const pricingState = document.getElementById('setPricingState');
      if(pricingState){
        pricingState.textContent = pricingMinutes > 0 ? ('(每 ' + pricingMinutes + ' 分钟)') : '(未启用)';
        pricingState.style.color = pricingMinutes > 0 ? 'var(--accent2)' : 'var(--dim)';
      }
      const variantOn = data.pricing_variant_inherit !== false;
      const variantInput = document.getElementById('setPricingVariant');
      if(variantInput) variantInput.checked = variantOn;
      // 关闭时不去拉 /pricing：取价与未定价清单都没有意义，省掉这一趟。
      if(pricingOn){
        loadPricingStatus();
      } else {
        const meta = document.getElementById('setPricingMeta');
        if(meta) meta.textContent = '　价估算已关闭，未取价也不计费。';
        const cur = document.getElementById('setPricingCurrent');
        if(cur) cur.innerHTML = '';
        const gaps = document.getElementById('setPricingGaps');
        if(gaps) gaps.innerHTML = '';
      }
      window.CURRENT_SETTINGS = data;
    
    const autoSwitch = data.auto_switch_product === true;
      const creditFallback = data.free_model_credit_fallback === true;
      const anthropicMsg = data.enable_anthropic_messages === true;
      const filterModelsByKey = data.filter_models_by_key === true;
      const reasoningEffortMap = data.reasoning_effort_map !== false;
      const reasoningEffortMapInput = document.getElementById('setReasoningEffortMap');
      if(reasoningEffortMapInput) reasoningEffortMapInput.checked = reasoningEffortMap;
      const reasoningEffortMapState = document.getElementById('setReasoningEffortMapState');
      if(reasoningEffortMapState){
        reasoningEffortMapState.textContent = reasoningEffortMap ? '(已启用)' : '(未启用)';
        reasoningEffortMapState.style.color = reasoningEffortMap ? 'var(--accent2)' : 'var(--dim)';
      }
      const filterModelsByKeyInput = document.getElementById('setFilterModelsByKey');
      if(filterModelsByKeyInput) filterModelsByKeyInput.checked = filterModelsByKey;
      const filterModelsByKeyState = document.getElementById('setFilterModelsByKeyState');
      if(filterModelsByKeyState){
        filterModelsByKeyState.textContent = filterModelsByKey ? '(已启用)' : '(未启用)';
        filterModelsByKeyState.style.color = filterModelsByKey ? 'var(--accent2)' : 'var(--dim)';
      }
      const modelsOnlyAvailable = data.models_only_available === true;
      const modelsOnlyAvailableInput = document.getElementById('setModelsOnlyAvailable');
      if(modelsOnlyAvailableInput) modelsOnlyAvailableInput.checked = modelsOnlyAvailable;
      const modelsOnlyAvailableState = document.getElementById('setModelsOnlyAvailableState');
      if(modelsOnlyAvailableState){
        modelsOnlyAvailableState.textContent = modelsOnlyAvailable ? '(已启用)' : '(未启用)';
        modelsOnlyAvailableState.style.color = modelsOnlyAvailable ? 'var(--accent2)' : 'var(--dim)';
      }
      const anthropicMsgInput = document.getElementById('setAnthropicMessages');
      if(anthropicMsgInput) anthropicMsgInput.checked = anthropicMsg;
      const anthropicMsgState = document.getElementById('setAnthropicMessagesState');
      if(anthropicMsgState){
        anthropicMsgState.textContent = anthropicMsg ? '(已启用)' : '(未启用)';
        anthropicMsgState.style.color = anthropicMsg ? 'var(--accent2)' : 'var(--dim)';
      }
      const creditFallbackInput = document.getElementById('setCreditFallback');
      if(creditFallbackInput) creditFallbackInput.checked = creditFallback;
      const creditFallbackState = document.getElementById('setCreditFallbackState');
      if(creditFallbackState){
        creditFallbackState.textContent = creditFallback ? '(已启用)' : '(未启用)';
        creditFallbackState.style.color = creditFallback ? 'var(--accent2)' : 'var(--dim)';
      }
      const autoSwitchInput = document.getElementById('setAutoSwitch');
      if(autoSwitchInput) autoSwitchInput.checked = autoSwitch;
      const autoSwitchState = document.getElementById('setAutoSwitchState');
      if(autoSwitchState){
        autoSwitchState.textContent = autoSwitch ? '(已启用)' : '(未启用)';
        autoSwitchState.style.color = autoSwitch ? 'var(--accent2)' : 'var(--dim)';
      }
      const autoSwitchProducts = Array.isArray(data.auto_switch_products)
        ? data.auto_switch_products : ['workbuddy', 'vscode', 'cli'];
      [['setAutoSwitchWB', 'workbuddy'], ['setAutoSwitchVSC', 'vscode'],
       ['setAutoSwitchCLI', 'cli']].forEach(function(pair){
        const input = document.getElementById(pair[0]);
        if(input) input.checked = autoSwitchProducts.indexOf(pair[1]) >= 0;
      });
      IDENTITY_VERSION_DEFAULTS = (data.identity_version_defaults && typeof data.identity_version_defaults === 'object')
        ? data.identity_version_defaults : {};
      IDENTITY_VERSION_CURRENT = (data.identity && data.identity.versions && typeof data.identity.versions === 'object')
        ? data.identity.versions : {};
      renderIdentityVersions();
      const privateData = (data.identity && data.identity.private_data) || 'auto';
      const privateDataInput = document.getElementById('setPrivateData');
      if(privateDataInput) privateDataInput.value = privateData;
      const privateDataState = document.getElementById('setPrivateDataState');
      if(privateDataState){
        privateDataState.textContent = privateData === 'auto'
          ? '(跟随身份默认)' : ('(' + privateData + ')');
        privateDataState.style.color = privateData === 'auto'
          ? 'var(--dim)' : 'var(--accent2)';
      }
      const dailyActivity = data.daily_activity !== false;
      const dailyActivityInput = document.getElementById('setDailyActivity');
      if(dailyActivityInput){
        dailyActivityInput.checked = dailyActivity;
        // 只有真读到过 /settings 才允许保存时带上总开关（见 saveDailyChatModule）。
        dailyActivityInput.dataset.loaded = '1';
      }
      const dailyActivityState = document.getElementById('setDailyActivityState');
      if(dailyActivityState){
        dailyActivityState.textContent = dailyActivity ? '(已启用)' : '(未启用)';
        dailyActivityState.style.color = dailyActivity ? 'var(--accent2)' : 'var(--dim)';
      }
      const dailyWeb = data.daily_chat_web !== false;
      const dailyWebInput = document.getElementById('setDailyChatWeb');
      if(dailyWebInput) dailyWebInput.checked = dailyWeb;
      const dailyWebState = document.getElementById('setDailyChatWebState');
      if(dailyWebState){
        dailyWebState.textContent = dailyWeb ? '(已启用)' : '(仅桌面端对话)';
        dailyWebState.style.color = dailyWeb ? 'var(--accent2)' : 'var(--dim)';
      }
      // ① 时段：显式时段优先；留空时后端每天随机抽两个（间隔 12 小时）。
      const scheduleCfg = (data.schedule && typeof data.schedule === 'object') ? data.schedule : {};
      const dailyChatTimes = Array.isArray(scheduleCfg.daily_chat) ? scheduleCfg.daily_chat : [];
      renderDailyChatTimes(dailyChatTimes);
      const dailyChatEffective = Array.isArray(scheduleCfg.daily_chat_effective)
        ? scheduleCfg.daily_chat_effective : [];
      const dailyChatEffectiveEl = document.getElementById('setDailyChatEffective');
      if(dailyChatEffectiveEl){
        dailyChatEffectiveEl.textContent = dailyChatEffective.length
          ? (dailyChatEffective.join(' / ') + (scheduleCfg.daily_chat_random ? '（随机）' : ''))
          : '-';
      }
      // ② 候选模型：有序，第一个是首选。
      renderDailyChatModelList(Array.isArray(data.daily_chat_models) ? data.daily_chat_models : []);
      // ③ 预算：单账号总预算、单轮上限、并发、建会话退避。
      const dailyChatBudgetDefault = Number(data.daily_chat_budget_default || 600);
      const dailyChatBudget = Number(data.daily_chat_budget != null
        ? data.daily_chat_budget : dailyChatBudgetDefault);
      const dailyChatBudgetInput = document.getElementById('setDailyChatBudget');
      if(dailyChatBudgetInput){
        dailyChatBudgetInput.value = String(dailyChatBudget);
        dailyChatBudgetInput.max = String(Number(data.daily_chat_budget_max || 7200));
      }
      const dailyChatTurnDefault = Number(data.daily_chat_web_timeout_default || 120);
      const dailyChatTurn = Number(data.daily_chat_web_timeout || dailyChatTurnDefault);
      const dailyChatTurnInput = document.getElementById('setDailyChatTurnTimeout');
      if(dailyChatTurnInput){
        dailyChatTurnInput.value = String(dailyChatTurn);
        dailyChatTurnInput.max = String(Number(data.daily_chat_web_timeout_max || 3600));
      }
      const dailyChatConcurrency = Number(data.daily_chat_web_concurrency || 1);
      const dailyChatConcurrencyInput = document.getElementById('setDailyChatWebConcurrency');
      if(dailyChatConcurrencyInput) dailyChatConcurrencyInput.value = String(dailyChatConcurrency);
      // 建会话阶段失败的退避：0 表示不退避，所以不能用 || 兜底。
      const dailyChatBackoffDefault = Number(
        data.daily_chat_web_retry_backoff_default != null
          ? data.daily_chat_web_retry_backoff_default : 5);
      const dailyChatBackoff = Number(
        data.daily_chat_web_retry_backoff != null
          ? data.daily_chat_web_retry_backoff : dailyChatBackoffDefault);
      const dailyChatBackoffInput = document.getElementById('setDailyChatWebRetryBackoff');
      if(dailyChatBackoffInput){
        dailyChatBackoffInput.value = String(dailyChatBackoff);
        dailyChatBackoffInput.max = String(Number(data.daily_chat_web_retry_backoff_max || 60));
      }
      const dailyChatCatchup = data.daily_chat_startup_catchup !== false;
      const dailyChatCatchupInput = document.getElementById('setDailyChatStartupCatchup');
      if(dailyChatCatchupInput) dailyChatCatchupInput.checked = dailyChatCatchup;
      const dailyChatCatchupState = document.getElementById('setDailyChatStartupCatchupState');
      if(dailyChatCatchupState){
        dailyChatCatchupState.textContent = dailyChatCatchup ? '(已启用)' : '(关闭)';
        dailyChatCatchupState.style.color = dailyChatCatchup ? 'var(--accent2)' : 'var(--dim)';
      }
      const dailyChatActivityFallback = data.daily_chat_web_fallback_activity === true;
      const dailyChatActivityFallbackInput = document.getElementById('setDailyChatActivityFallback');
      if(dailyChatActivityFallbackInput) dailyChatActivityFallbackInput.checked = dailyChatActivityFallback;
      const dailyChatActivityFallbackState = document.getElementById('setDailyChatActivityFallbackState');
      if(dailyChatActivityFallbackState){
        dailyChatActivityFallbackState.textContent = dailyChatActivityFallback ? '(已启用)' : '(关闭)';
        dailyChatActivityFallbackState.style.color = dailyChatActivityFallback ? 'var(--accent2)' : 'var(--dim)';
      }
      const dailyWebRandomPrompt = data.daily_chat_web_random_prompt === true;
      const dailyWebRandomPromptInput = document.getElementById('setDailyChatRandomPrompt');
      if(dailyWebRandomPromptInput) dailyWebRandomPromptInput.checked = dailyWebRandomPrompt;
      PROMPT_PICKER_BUILTIN = Array.isArray(data.daily_chat_web_builtin_prompts)
        ? data.daily_chat_web_builtin_prompts.slice() : [];
      window.DAILY_CHAT_PROMPTS_STORED = Array.isArray(data.daily_chat_web_prompts)
        ? data.daily_chat_web_prompts.slice() : [];
      updatePromptPickerState();
      const dailyWebRandomPromptState = document.getElementById('setDailyChatRandomPromptState');
      if(dailyWebRandomPromptState){
        dailyWebRandomPromptState.textContent = dailyWebRandomPrompt
          ? ('已启用 · ' + (window.DAILY_CHAT_PROMPTS_STORED.length
              ? window.DAILY_CHAT_PROMPTS_STORED.length + ' 条候选'
              : '默认全部内置 300 条'))
          : '(未启用 · 固定发 Hi)';
        dailyWebRandomPromptState.style.color = dailyWebRandomPrompt
          ? 'var(--accent2)' : 'var(--dim)';
      }
      const promptCfg = (data.prompt && typeof data.prompt === 'object') ? data.prompt : {};
      const promptMode = ['passthrough', 'append', 'custom'].indexOf(promptCfg.mode) >= 0
        ? promptCfg.mode : 'passthrough';
      const promptModeInput = document.getElementById('setGlobalPromptMode');
      if(promptModeInput) promptModeInput.value = promptMode;
      const promptTextInput = document.getElementById('setGlobalPromptText');
      if(promptTextInput) promptTextInput.value = promptCfg.text || '';
      const promptState = document.getElementById('setGlobalPromptState');
      if(promptState){
        promptState.textContent = promptMode === 'passthrough' ? '(透传)'
          : (promptMode === 'append' ? '(追加)' : '(替换)');
        promptState.style.color = promptMode === 'passthrough'
          ? 'var(--dim)' : 'var(--accent2)';
      }
      const localWeb = data.local_web_tools === true;
      const localWebInput = document.getElementById('setLocalWebTools');
      if(localWebInput) localWebInput.checked = localWeb;
      const localWebState = document.getElementById('setLocalWebToolsState');
      if(localWebState){
        localWebState.textContent = localWeb ? '(已启用)' : '(直通)';
        localWebState.style.color = localWeb ? 'var(--accent2)' : 'var(--dim)';
      }
      const remainingPriority = data.remaining_priority_enabled === true;
      const remainingPriorityInput = document.getElementById('setRemainingPriority');
      if(remainingPriorityInput) remainingPriorityInput.checked = remainingPriority;
      const remainingPriorityState = document.getElementById('setRemainingPriorityState');
      if(remainingPriorityState){
        remainingPriorityState.textContent = remainingPriority ? '(已启用)' : '(未启用)';
        remainingPriorityState.style.color = remainingPriority ? 'var(--accent2)' : 'var(--dim)';
      }
      const realmFallback = data.realm_fallback_enabled === true;
      const realmFallbackInput = document.getElementById('setRealmFallback');
      if(realmFallbackInput) realmFallbackInput.checked = realmFallback;
      const realmFallbackState = document.getElementById('setRealmFallbackState');
      if(realmFallbackState){
        realmFallbackState.textContent = realmFallback ? '(已启用)' : '(未启用)';
        realmFallbackState.style.color = realmFallback ? 'var(--accent2)' : 'var(--dim)';
      }
      const windowProbe = data.window_probe !== false;
      const windowProbeInput = document.getElementById('setWindowProbe');
      if(windowProbeInput) windowProbeInput.checked = windowProbe;
      const windowProbeState = document.getElementById('setWindowProbeState');
      if(windowProbeState){
        windowProbeState.textContent = windowProbe ? '(已启用)' : '(未启用)';
        windowProbeState.style.color = windowProbe ? 'var(--accent2)' : 'var(--dim)';
      }
      const egressBackoff = data.egress_backoff_enabled === true;
      const egressBackoffInput = document.getElementById('setEgressBackoff');
      if(egressBackoffInput) egressBackoffInput.checked = egressBackoff;
      const egressBackoffState = document.getElementById('setEgressBackoffState');
      if(egressBackoffState){
        egressBackoffState.textContent = egressBackoff ? '(已启用)' : '(未启用)';
        egressBackoffState.style.color = egressBackoff ? 'var(--accent2)' : 'var(--dim)';
      }
      const accountConcurrent = (typeof data.account_max_concurrent === 'number') ? data.account_max_concurrent : 0;
      const accountConcurrentInput = document.getElementById('setAccountConcurrent');
      if(accountConcurrentInput) accountConcurrentInput.value = accountConcurrent;
      const accountConcurrentState = document.getElementById('setAccountConcurrentState');
      if(accountConcurrentState){
        accountConcurrentState.textContent = accountConcurrent > 0 ? '(' + accountConcurrent + ' 个 / 账号)' : '(不限)';
        accountConcurrentState.style.color = accountConcurrent > 0 ? 'var(--accent2)' : 'var(--dim)';
      }
      const affinityStableKey = data.affinity_stable_key_enabled === true;
      const affinityStableKeyInput = document.getElementById('setAffinityStableKey');
      if(affinityStableKeyInput) affinityStableKeyInput.checked = affinityStableKey;
      const affinityStableKeyState = document.getElementById('setAffinityStableKeyState');
      if(affinityStableKeyState){
        affinityStableKeyState.textContent = affinityStableKey ? '(已启用)' : '(未启用)';
        affinityStableKeyState.style.color = affinityStableKey ? 'var(--accent2)' : 'var(--dim)';
      }
      SAVED_QUOTA_SCAN_MODELS = Array.isArray(data.quota_scan_models) ? data.quota_scan_models.slice() : [];
      QUOTA_SCAN_SELECTED = SAVED_QUOTA_SCAN_MODELS.slice();
      await loadQuotaScanCatalog();
      renderQuotaScanModels();
      renderQuotaScanState(data);
      const maxPayload = document.getElementById('setMaxPayloadMB');
      if(maxPayload) maxPayload.value = data.max_payload_mb || Math.ceil((data.max_payload_bytes_effective || 16777216) / 1048576);
      // 上游响应头超时：没改过时后端给的就是默认 120，所以「等于 120」按默认态
      // 显示，只有被改过才标出实际秒数。
      const headerTimeout = (data.upstream || {}).header_timeout_seconds;
      const headerTimeoutInput = document.getElementById('setHeaderTimeout');
      if(headerTimeoutInput){
        headerTimeoutInput.value = (typeof headerTimeout === 'number') ? headerTimeout : 120;
      }
      const headerTimeoutState = document.getElementById('setHeaderTimeoutState');
      if(headerTimeoutState){
        const headerTimeoutDefault = (typeof headerTimeout !== 'number') || headerTimeout === 120;
        headerTimeoutState.textContent = headerTimeoutDefault ? '(默认 120 秒)' : '(' + headerTimeout + ' 秒)';
        headerTimeoutState.style.color = headerTimeoutDefault ? 'var(--dim)' : 'var(--accent2)';
      }
      const logDbEnabled = data.log_db_enabled === true;
      const logDbEnabledInput = document.getElementById('setLogDbEnabled');
      if(logDbEnabledInput) logDbEnabledInput.checked = logDbEnabled;
      const logDbState = document.getElementById('setLogDbState');
      if(logDbState){
        logDbState.textContent = logDbEnabled ? '(已启用)' : '(未启用)';
        logDbState.style.color = logDbEnabled ? 'var(--accent2)' : 'var(--dim)';
      }
      fillCapInput('setLogDbMaxRows', data.log_db_max_rows);
      fillCapInput('setLogDbMaxDays', data.log_db_max_days);
      fillCapInputMB('setLogDbMaxMB', data.log_db_max_bytes);
    // Rebuild the editable rows, keeping stored values so an untouched field
    // is not accidentally blanked.
    API_KEY_ROWS = (data.api_keys || []).map(k => ({
      id: k.id || '',
      name: k.name || '',
      key: '',
      // The server keeps the stored value when a row comes back blank, so
      // leaving the field untouched will not wipe an existing key.
      stored_key: '',
      masked: k.masked || '',
      realm: k.realm || '',
      models: Array.isArray(k.models) ? k.models.slice() : [],
      accounts: Array.isArray(k.accounts) ? k.accounts.slice() : [],
      concurrency_limit: parseInt(k.concurrency_limit || 0, 10) || 0,
      enabled: k.enabled !== false,
      created_at: k.created_at || '',
      _editing: false,
    }));
    window.API_KEY_ROWS = API_KEY_ROWS;
    DELETED_KEY_ROWS = (data.deleted_api_keys || []).map(k => ({
      id: k.id || '',
      name: k.name || '',
      realm: k.realm || '',
      created_at: k.created_at || '',
      deleted_at: k.deleted_at || '',
    }));
    renderKeyRows();
    renderCodeartsSettings(data.codearts);
    updateUI();
    const set = (id, value) => { const el = document.getElementById(id); if(el) el.textContent = value || '-'; };
    set('setProject', data.project);
    set('setVersion', data.version);
    set('setUpdateRepo', data.update_repository);
    set('setAccountsDir', data.accounts_dir);
    set('setUsageDir', data.usage_dir);
    set('setFile', data.settings_file);
    set('setSettingsFile', data.settings_file);
    // 更新状态来自 /updates 而不是 /settings，单独拉一次；它自带兜底，
    // 失败只写在自己的状态行里，不会把上面这些区块一起带走。
    loadUpdateStatus();
    // 备份份数走 /settings 的既有字段；备份列表与当前版本另有一份只读接口，
    // 拉不到时只影响「版本回退」卡片，不影响上面的更新卡片。
    const keepSelect = document.getElementById('setKeepBackups');
    if(keepSelect){
      keepSelect.value = String((typeof data.keep_backups === 'number') ? data.keep_backups : 1);
    }
    loadUpdateBackups();
      // 用量聚合保留窗口：没改过时后端给的就是内置默认（小时层 48 / 日桶 32），
      // 所以「等于默认」按默认态显示，只有被调过才标出实际值。
      const usageKeep = data.usage || {};
      const usageHourKeep = usageKeep.hour_keep_hours;
      const usageDayKeep = usageKeep.day_keep_days;
      const usageHourInput = document.getElementById('setUsageHourKeep');
      if(usageHourInput){
        usageHourInput.value = (typeof usageHourKeep === 'number') ? usageHourKeep : 48;
      }
      const usageDayInput = document.getElementById('setUsageDayKeep');
      if(usageDayInput){
        usageDayInput.value = (typeof usageDayKeep === 'number') ? usageDayKeep : 32;
      }
      const usageKeepState = document.getElementById('setUsageKeepState');
      if(usageKeepState){
        const hourDefault = (typeof usageHourKeep !== 'number') || usageHourKeep === 48;
        const dayDefault = (typeof usageDayKeep !== 'number') || usageDayKeep === 32;
        const isDefault = hourDefault && dayDefault;
        usageKeepState.textContent = isDefault
          ? '(默认 48 小时 / 32 天)'
          : '(' + (typeof usageHourKeep === 'number' ? usageHourKeep : 48) + ' 小时 / '
              + (typeof usageDayKeep === 'number' ? usageDayKeep : 32) + ' 天)';
        usageKeepState.style.color = isDefault ? 'var(--dim)' : 'var(--accent2)';
      }
    if(showToast) toast('设置已刷新', 'ok');
  } catch(e) {
    if(showToast) toast('读取设置失败: ' + e.message, 'bad');
  }
}

function applyUiLanguageSelect(value){
  const select = document.getElementById('setUiLanguage');
  if(select) select.value = value || 'zh';
  const state = document.getElementById('setUiLanguageState');
  if(state){
    const label = value === 'zh-Hant' ? '(正體中文)' : (value === 'en' ? '(English)' : '(简体中文)');
    state.textContent = label;
    state.style.color = 'var(--dim)';
  }
}

async function saveUiLanguage(btn){
  const select = document.getElementById('setUiLanguage');
  const value = select ? select.value : 'zh';
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {ui_language: value});
    toast('实例默认语言已保存', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

function clearUiLanguageOverride(btn){
  try { localStorage.removeItem('wb-lang'); } catch(e){}
  if(btn) btn.disabled = true;
  location.reload();
}

async function savePanelPassword(btn){
  const cur = (document.getElementById('setPwdCurrent') || {}).value || '';
  const nw = (document.getElementById('setPwdNew') || {}).value || '';
  if(!cur || !nw){ toast('请填写当前密码和新密码', 'warn'); return; }
  btn.disabled = true;
  try {
    const data = await postJSON('/panel/password', {current: cur, new: nw});
    if(data.token){
      panelStoreToken(data.token, PANEL_REMEMBER);
    }
    document.getElementById('setPwdCurrent').value = '';
    document.getElementById('setPwdNew').value = '';
    toast('面板密码已更新', 'ok');
    const pwdState = document.getElementById('setPwdState');
    // 以服务端返回为准：如果保存落到另一个实例，界面上不能假装已生效。
    const usingDefault = (data.using_default_password !== undefined)
      ? !!data.using_default_password : (nw === 'admin');
    if(pwdState){
      pwdState.textContent = usingDefault ? '(当前为默认密码)' : '(已自定义)';
      pwdState.style.color = usingDefault ? 'var(--warn)' : 'var(--accent2)';
    }
  } catch(e) {
    if(isAuthError(e)) return;  // 会话真失效：闸门已经出来了，不再叠一条 toast
    const msg = String((e && e.message) || '');
    if(msg.indexOf('current password is wrong') >= 0){
      toast('当前密码不正确，密码未修改', 'bad');
    } else if(msg.indexOf('new password must be at least 4') >= 0){
      toast('新密码至少 4 位', 'bad');
    } else {
      toast('修改失败: ' + msg, 'bad');
    }
  } finally {
    btn.disabled = false;
  }
}

// ---- 限额（全局默认 + 可选分版本） -------------------------------------
// 五个护栏共用一张表：一列一个作用域。国际版/国内版留空即继承全局默认，
// 所以“不分版本”只是“两列都留空”的一个特例，不必再另存一套开关。
const LIMIT_FIELDS = [
  {key:'reserve_credits',         id:'Reserve',         label:'保留积分'},
  {key:'daily_token_limit',       id:'DailyToken',      label:'每日 Token 限额'},
  {key:'daily_credit_limit',      id:'DailyCredit',     label:'每日积分限额'},
  {key:'model_daily_token_limit', id:'ModelDailyToken', label:'按模型每日 Token 限额'},
  {key:'expiring_window_days',    id:'ExpiringWindow',  label:'临期积分优先'},
];
const LIMIT_SCOPES = [
  {scope:'global', prefix:'Global', label:'全局默认'},
  {scope:'intl',   prefix:'Intl',   label:'国际版'},
  {scope:'cn',     prefix:'Cn',     label:'国内版'},
];

function limitEl(prefix, id){
  return document.getElementById('limit' + prefix + id);
}

function limitHasOverride(entry){
  return LIMIT_SCOPES.slice(1).some(
    ({scope}) => entry[scope] !== null && entry[scope] !== undefined);
}

// 括号里写清这条护栏当前生效的值：先全局，再任何被单独设置的版本。
function limitBadge(entry){
  const bits = [];
  const globalValue = Number(entry.global || 0);
  if(globalValue > 0) bits.push('全局 ' + fmt(globalValue));
  for(const {scope, label} of LIMIT_SCOPES.slice(1)){
    const value = entry[scope];
    if(value !== null && value !== undefined) bits.push(label + ' ' + fmt(value));
  }
  return bits.length ? ('(' + bits.join(' · ') + ')') : '(全部关闭)';
}

function toggleLimitRealms(show){
  document.querySelectorAll('.limit-realm-col').forEach(el => {
    el.style.display = show ? '' : 'none';
  });
}

function applyLimits(data){
  const limits = data.limits || {};
  const anyOverride = LIMIT_FIELDS.some(
    field => limitHasOverride(limits[field.key] || {}));
  for(const field of LIMIT_FIELDS){
    const entry = limits[field.key] || {};
    const globalValue = Number(entry.global || 0);
    const globalInput = limitEl('Global', field.id);
    if(globalInput) globalInput.value = String(globalValue);
    for(const {scope, prefix} of LIMIT_SCOPES.slice(1)){
      const input = limitEl(prefix, field.id);
      const raw = entry[scope];
      const inherited = (raw === null || raw === undefined);
      if(input){
        input.value = inherited ? '' : String(raw);
        // 占位符直接写出继承到的那个数，省得再翻回全局列对照。
        input.placeholder = '继承 ' + fmt(globalValue);
      }
    }
    const state = document.getElementById('set' + field.id + 'State');
    if(state){
      state.textContent = limitBadge(entry);
      state.style.color = (globalValue > 0 || anyOverride) ? 'var(--accent2)' : 'var(--dim)';
    }
  }
  const expiringToggle = document.getElementById('setExpiringWindowToggle');
  if(expiringToggle){
    expiringToggle.checked =
      Number((limits.expiring_window_days || {}).global || 0) > 0;
  }
  const toggle = document.getElementById('setLimitsPerRealm');
  if(toggle) toggle.checked = anyOverride;
  toggleLimitRealms(anyOverride);
  const sectionState = document.getElementById('setLimitsState');
  if(sectionState){
    sectionState.textContent = anyOverride ? '(已分版本设置)' : '(全局生效)';
    sectionState.style.color = anyOverride ? 'var(--accent2)' : 'var(--dim)';
  }
}

function limitFormValue(prefix, field){
  const input = limitEl(prefix, field.id);
  return input ? String(input.value).trim() : '';
}

async function saveLimits(btn){
  const perRealmBox = document.getElementById('setLimitsPerRealm');
  const showRealms = !!(perRealmBox && perRealmBox.checked);
  const payload = {};
  for(const field of LIMIT_FIELDS){
    const globalValue = Math.floor(Number(limitFormValue('Global', field) || 0));
    if(!Number.isFinite(globalValue) || globalValue < 0){
      toast('「' + field.label + '」的全局默认请填 0 或正整数', 'warn'); return;
    }
    const entry = {global: globalValue};
    for(const {scope, prefix, label} of LIMIT_SCOPES.slice(1)){
      const raw = limitFormValue(prefix, field);
      // 收起分版本、或该版本留空，都表示“继承全局”；服务端收到 null 会清掉旧覆盖值。
      if(!showRealms || raw === ''){ entry[scope] = null; continue; }
      const value = Math.floor(Number(raw));
      if(!Number.isFinite(value) || value < 0){
        toast('「' + field.label + '」的' + label + '请填 0 或正整数（留空 = 继承全局）', 'warn'); return;
      }
      entry[scope] = value;
    }
    payload[field.key] = entry;
  }
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {limits: payload});
    toast('限额已保存', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

/* 临期积分优先的开关：开着等价于「窗口天数 > 0」，关掉就写 0。窗口天数本身
   仍可在表格里单独填（例如 3 天、14 天），开关只负责一键开/关。 */
async function toggleExpiringWindow(el){
  const enabled = !!(el && el.checked);
  const input = document.getElementById('limitGlobalExpiringWindow');
  const current = Math.floor(Number(input && input.value) || 0);
  const value = enabled ? (current > 0 ? current : 7) : 0;
  if(input) input.value = String(value);
  el.disabled = true;
  try {
    await postJSON('/settings/save', {limits:{expiring_window_days:{global:value}}});
    toast(enabled ? '已开启临期积分优先' : '已关闭临期积分优先', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
    el.checked = !enabled;
  } finally {
    el.disabled = false;
  }
}

/* 积分数据的后台刷新间隔。分派读的是账号上缓存的积分余额，只有签到/每日活跃
   会刷新它；这里给一个 TTL，超时的账号由后台每十分钟挑最旧的一个刷一次，填 0
   关闭后台刷新。 */
async function saveCreditsRefreshHours(btn){
  const input = document.getElementById('setCreditsRefreshHours');
  const value = Number(input && input.value);
  if(!Number.isFinite(value) || value < 0){
    toast('积分数据刷新间隔请填 0 或正整数（0 = 关闭后台刷新）', 'warn'); return;
  }
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {credits_refresh_hours: value});
    toast('已保存积分数据刷新间隔', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

/* 价估算总开关。关闭时整块功能从界面上撤掉（价格列、KPI 卡片、取价子控件、
   未定价清单），只留开关本身；后端同时停止取价与算价。历史数据不动。 */
function applyPricingEnabled(on){
  const enabled = on !== false;
  PRICING_ON = enabled;
  document.body.classList.toggle('pricing-off', !enabled);
  const state = document.getElementById('setPricingEnabledState');
  if(state){
    state.textContent = enabled ? '(已启用)' : '(已关闭)';
    state.style.color = enabled ? 'var(--accent2)' : 'var(--dim)';
  }
  const note = document.getElementById('pricingOffNote');
  if(note) note.style.display = enabled ? 'none' : '';
  // 关闭时除开关本身外，取价控件、当前生效策略与未定价清单一起隐藏。
  const details = document.getElementById('pricingDetails');
  if(details) details.style.display = enabled ? '' : 'none';
  const controls = document.getElementById('pricingControls');
  if(controls) controls.style.display = enabled ? 'flex' : 'none';
}

async function savePricingEnabled(btn){
  const el = document.getElementById('setPricingEnabled');
  const value = !!(el && el.checked);
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {pricing_enabled: value});
    toast(value ? '已启用 OpenRouter 价估算' : '已关闭 OpenRouter 价估算', 'ok');
    loadSettings();
    if(value) loadPricingStatus();
  } catch(e) {
    // 开关点一下即生效，保存失败就把它拨回原位，别让界面和后端各说各话。
    if(el) el.checked = !value;
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function savePricingMinutes(btn){
  const el = document.getElementById('setPricingMinutes');
  const value = Number((el || {}).value || 0);
  if(!Number.isFinite(value) || value < 0){ toast('请填写 0 或正数（分钟）', 'warn'); return; }
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {pricing_refresh_minutes: value});
    toast(value > 0 ? ('已启用：每 ' + value + ' 分钟取一次价') : '已关闭自动取价（仍可手动取一次）', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function loadPricingStatus(){
  const meta = document.getElementById('setPricingMeta');
  const box = document.getElementById('setPricingCurrent');
  if(!meta) return;
  try {
    const st = await getJSON('/pricing');
    const bits = [];
    if(st.current_at_label) bits.push('当前生效 ' + st.current_at_label + ' 那一份（' + (st.models || 0) + ' 个模型）');
    else bits.push('还没取过价，暂用出厂快照');
    if(st.last_run_label) bits.push('上次取价 ' + st.last_run_label);
    if(st.enabled && st.next_run_label) bits.push('下次 ' + st.next_run_label);
    bits.push('策略表 ' + (st.policies || 0) + ' 条');
    if(st.last_error) bits.push('上次失败：' + st.last_error);
    meta.textContent = '　' + bits.join('；');
    meta.style.color = st.last_error ? 'var(--warn)' : 'var(--dim)';
    if(box){
      const cur = st.current || {};
      const models = Object.keys(cur);
      box.innerHTML = models.length
        ? '<details><summary style="cursor:pointer">展开查看每个模型当前生效的策略</summary>'
          + '<div style="margin-top:6px;max-height:260px;overflow:auto;font-family:monospace;line-height:1.7">'
          + models.map(m => esc(m) + ' → ' + esc(cur[m].id || '')
              + (cur[m].via === 'variant' ? '（继承自 ' + esc(cur[m].inherited_from || '?') + '）' : '')
              + (cur[m].label ? '　' + esc(cur[m].label) + ' 首次取到' : '')).join('<br>')
          + '</div></details>'
        : '';
    }
    renderPricingGaps(st);
  } catch(e) {
    meta.textContent = '';
    if(box) box.innerHTML = '';
  }
}

/* ---- unpriced models: what shows a dash, why, and a way to map it ---- */
const PRICING_GAP_LABELS = {
  or_missing: {text: 'OpenRouter 无对应', color: 'var(--warn)'},
  variant_unmatched: {text: '变体名未命中基准', color: 'var(--warn)'},
  alias: {text: '虚拟别名（非实体模型）', color: 'var(--dim)'},
};

function safeModelId(value){
  // Model ids and OpenRouter ids are [A-Za-z0-9._/:-]; anything else is
  // dropped before it reaches an attribute or an inline handler argument.
  return String(value == null ? '' : value).replace(/[^A-Za-z0-9._/:\-]/g, '');
}

function renderPricingGaps(st){
  const box = document.getElementById('setPricingGaps');
  if(!box) return;
  const gaps = Array.isArray(st.gaps) ? st.gaps : [];
  const sum = st.gap_summary || {};
  const head = '<div style="font-size:12px;color:var(--dim);margin-top:10px">'
    + '<b>未定价模型</b>：' + fmt(sum.total || 0) + ' 个需要人工关注'
    + (sum.or_missing ? '（无对应 ' + fmt(sum.or_missing) + '）' : '')
    + (sum.variant_unmatched ? '（变体未命中 ' + fmt(sum.variant_unmatched) + '）' : '')
    + (sum.aliases ? '；另有 ' + fmt(sum.aliases) + ' 个虚拟别名不参与统计' : '')
    + (sum.variants_enabled === false ? '；变体继承当前已关闭' : '')
    + '</div>';
  if(!gaps.length){
    box.innerHTML = head + '<div style="font-size:12px;color:var(--accent2);margin-top:4px">全部模型都有价。</div>';
    return;
  }
  const rows = gaps.map(g => {
    const model = safeModelId(g.model);
    const label = PRICING_GAP_LABELS[g.reason] || {text: g.reason || '未定价', color: 'var(--dim)'};
    const cands = (g.candidates || []).map(c =>
      '<a href="javascript:void(0)" data-or-id="' + safeModelId(c)
      + '" onclick="fillPricingMapping(this)" style="color:var(--accent2)">' + esc(c) + '</a>'
    ).join('、');
    const editable = g.reason !== 'alias';
    const control = editable
      ? '<input placeholder="vendor/model" style="width:190px;background:var(--panel2);'
        + 'border:1px solid var(--line);border-radius:6px;padding:4px 8px;color:var(--fg);font:inherit;font-size:12px">'
        + '<button onclick="savePricingMapping(this)" style="font-size:12px;padding:4px 10px">登记</button>'
      : '<span style="color:var(--dim);font-size:12px">无需登记</span>';
    return '<div data-model="' + model + '" style="display:flex;align-items:center;gap:8px;'
      + 'flex-wrap:wrap;padding:5px 0;border-top:1px solid var(--line)">'
      + '<span class="mono" style="font-size:12px;min-width:180px">' + esc(g.model) + '</span>'
      + '<span style="font-size:12px;color:' + label.color + '">' + esc(label.text) + '</span>'
      + '<span style="font-size:12px;color:var(--dim)">' + (cands ? '候选：' + cands : '') + '</span>'
      + control + '</div>';
  }).join('');
  box.innerHTML = head
    + '<details style="margin-top:4px"><summary style="cursor:pointer;font-size:12px">展开逐条查看 / 手填 OpenRouter id</summary>'
    + '<div style="margin-top:4px;max-height:320px;overflow:auto">' + rows + '</div>'
    + '<div style="font-size:11px;color:var(--dim);margin-top:6px">手填的映射存在数据目录的 pricing-overrides.json（不改源码），登记后立即触发一次取价；留空提交即删除该映射。候选只是字面相似度建议，不自动采用。</div>'
    + '</details>';
}

function fillPricingMapping(link){
  const row = link.closest('[data-model]');
  const input = row && row.querySelector('input');
  if(input) input.value = link.getAttribute('data-or-id') || '';
}

async function savePricingMapping(btn){
  const row = btn.closest('[data-model]');
  if(!row) return;
  const model = row.getAttribute('data-model');
  const input = row.querySelector('input');
  const orId = (input && input.value || '').trim();
  btn.disabled = true;
  try {
    const res = await postJSON('/pricing/mapping', {model: model, or_id: orId});
    toast(res.msg || '已记录', res.known || !orId ? 'ok' : 'warn');
    setTimeout(loadPricingStatus, 3000);
    setTimeout(loadPricingStatus, 12000);
  } catch(e) {
    toast('登记失败: ' + e.message, 'bad');
  } finally {
    btn.disabled = false;
  }
}

async function savePricingVariant(btn){
  const el = document.getElementById('setPricingVariant');
  const value = !!(el && el.checked);
  if(btn) btn.disabled = true;
  try {
    const res = await postJSON('/settings/save', {pricing_variant_inherit: value});
    toast(value
      ? '已开启：带渠道后缀的模型按基准模型继承定价（仅在唯一命中时）'
      : '已关闭变体继承：带后缀的名字不再自动取价', 'ok');
    if(res.pricing_refresh_started) setTimeout(loadPricingStatus, 4000);
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function refreshPricingNow(btn){
  if(btn) btn.disabled = true;
  try {
    const st = await postJSON('/pricing/refresh', {});
    toast(st.msg || '已开始抓取', 'ok');
    // The fetch runs on the server's own thread, so come back for the result
    // instead of holding the button.
    setTimeout(loadPricingStatus, 4000);
    setTimeout(loadPricingStatus, 15000);
  } catch(e) {
    toast('触发失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function saveAnthropicMessages(btn){
  const el = document.getElementById('setAnthropicMessages');
  const value = !!(el && el.checked);
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {enable_anthropic_messages: value});
    toast(value ? '已启用：Anthropic Messages 接口' : '已关闭：Anthropic Messages 接口', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function saveReasoningEffortMap(btn){
  const el = document.getElementById('setReasoningEffortMap');
  const value = !!(el && el.checked);
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {reasoning_effort_map: value});
    toast(value ? '已启用：思考等级挡位映射' : '已关闭：思考等级原样透传', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function saveModelsOnlyAvailable(btn){
  const el = document.getElementById('setModelsOnlyAvailable');
  const value = !!(el && el.checked);
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {models_only_available: value});
    toast(value ? '已启用：/v1/models 只列出可用模型' : '已关闭：/v1/models 返回全量目录', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function saveFilterModelsByKey(btn){
  const el = document.getElementById('setFilterModelsByKey');
  const value = !!(el && el.checked);
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {filter_models_by_key: value});
    toast(value ? '已启用：按 API Key 过滤 /v1/models' : '已关闭：/v1/models 返回全部模型', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}



async function saveCreditFallback(btn){
  const el = document.getElementById('setCreditFallback');
  const value = !!(el && el.checked);
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {free_model_credit_fallback: value});
    toast(value ? '已启用：免费额度耗尽自动回退付费积分版' : '已关闭自动回退付费积分版', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function saveAutoSwitchProduct(btn){
  const el = document.getElementById('setAutoSwitch');
  const value = !!(el && el.checked);
  const products = [];
  [['setAutoSwitchWB', 'workbuddy'], ['setAutoSwitchVSC', 'vscode'],
   ['setAutoSwitchCLI', 'cli']].forEach(function(pair){
    const input = document.getElementById(pair[0]);
    if(input && input.checked) products.push(pair[1]);
  });
  if(!products.length){
    toast('至少选择一个身份', 'bad');
    return;
  }
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {auto_switch_product: value,
                                      auto_switch_products: products});
    toast(value ? '已启用：429 时自动切换出站身份' : '已关闭自动切换出站身份', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

let IDENTITY_VERSION_DEFAULTS = {};
let IDENTITY_VERSION_CURRENT = {};
const IDENTITY_VERSION_FIELDS = [
  ['desktop_intl', 'WorkBuddy 国际版', 'setIdentityVerDesktopIntl'],
  ['desktop_cn', 'WorkBuddy 国内版', 'setIdentityVerDesktopCn'],
  ['desktop_cli', '桌面端内置 CLI', 'setIdentityVerDesktopCli'],
  ['vscode_product', 'VSCode 扩展', 'setIdentityVerVscodeProduct'],
  ['vscode_ide', '宿主 VSCode', 'setIdentityVerVscodeIde'],
  ['cli', 'CodeBuddy CLI', 'setIdentityVerCli'],
  ['sdk', 'OpenAI Node SDK', 'setIdentityVerSdk'],
  ['node', 'Node 版本', 'setIdentityVerNode'],
];
function renderIdentityVersions(){
  const summary = document.getElementById('identityVersionSummary');
  if(summary){
    summary.innerHTML = IDENTITY_VERSION_FIELDS.map(function(item){
      const key = item[0], label = item[1];
      const fallback = IDENTITY_VERSION_DEFAULTS[key] || '-';
      const current = IDENTITY_VERSION_CURRENT[key] || fallback;
      const changed = IDENTITY_VERSION_CURRENT[key]
        && IDENTITY_VERSION_CURRENT[key] !== IDENTITY_VERSION_DEFAULTS[key];
      return '<div>' + esc(label) + '：<span class="mono" style="color:var(--fg)">'
        + esc(current) + '</span> '
        + (changed
            ? '<span class="badge warn" style="font-size:10px">已修改（默认 ' + esc(fallback) + '）</span>'
            : '<span style="color:var(--dim-light)">默认</span>')
        + '</div>';
    }).join('');
  }
  IDENTITY_VERSION_FIELDS.forEach(function(item){
    const el = document.getElementById(item[2]);
    if(el) el.value = IDENTITY_VERSION_CURRENT[item[0]] || '';
  });
}
function toggleIdentityVersionEditor(){
  const el = document.getElementById('identityVersionEditor');
  if(el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
async function saveIdentityVersions(btn){
  const passwordEl = document.getElementById('setIdentityVersionPassword');
  const password = String((passwordEl && passwordEl.value) || '');
  if(!password){ toast('请输入面板密码', 'warn'); return; }
  const versions = {};
  IDENTITY_VERSION_FIELDS.forEach(function(item){
    const el = document.getElementById(item[2]);
    const value = String((el && el.value) || '').trim();
    if(value) versions[item[0]] = value;
  });
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {identity_versions: versions, panel_password: password});
    toast('出站身份版本号已保存', 'ok');
    if(passwordEl) passwordEl.value = '';
    const editor = document.getElementById('identityVersionEditor');
    if(editor) editor.style.display = 'none';
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function savePrivateData(btn){
  const el = document.getElementById('setPrivateData');
  const value = el ? el.value : 'auto';
  if(['auto', 'true', 'false'].indexOf(value) < 0) return;
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {identity: {private_data: value}});
    toast('已保存数据用途声明: ' + value, 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

/* 随机提示词开关。后端只接受严格布尔，所以这里直接发勾选状态；存失败时把开关
   拨回去，免得界面显示一个其实没落盘的状态。 */
async function saveDailyChatRandomPrompt(){
  const el = document.getElementById('setDailyChatRandomPrompt');
  const value = !!(el && el.checked);
  try {
    await postJSON('/settings/save', {daily_chat_web_random_prompt: value});
    toast(value ? '已启用：网页活跃随机提示词'
                : '已关闭：网页活跃固定发 Hi', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
    if(el) el.checked = !value;
  }
}

let PROMPT_PICKER_BUILTIN = [];
let PROMPT_PICKER_SELECTED = new Set();
let PROMPT_PICKER_CUSTOM = new Set();

function promptPickerItems(){
  const out = [];
  const seen = new Set();
  PROMPT_PICKER_BUILTIN.concat(Array.from(PROMPT_PICKER_CUSTOM)).forEach(function(p){
    if(p && !seen.has(p)){ seen.add(p); out.push(p); }
  });
  return out;
}
function updatePromptPickerState(){
  const el = document.getElementById('setDailyChatPromptsState');
  if(!el) return;
  el.textContent = PROMPT_PICKER_SELECTED.size
    ? ('已选 ' + PROMPT_PICKER_SELECTED.size + ' 条')
    : '默认全部内置 300 条';
}
function renderPromptPicker(){
  const list = document.getElementById('promptPickerList');
  if(!list) return;
  const items = promptPickerItems();
  list.innerHTML = items.map(function(p){
    const checked = PROMPT_PICKER_SELECTED.has(p) ? ' checked' : '';
    return '<label class="prompt-pick-row" data-search="' + esc(p.toLowerCase()) + '" style="display:flex;align-items:flex-start;gap:8px;padding:4px 2px;font-size:13px;cursor:pointer"><input type="checkbox" value="' + esc(p) + '"' + checked + ' onchange="togglePromptPicker(this)"><span>' + esc(p) + '</span></label>';
  }).join('') || '<div style="font-size:12px;color:var(--dim);padding:4px">没有提示词</div>';
  updatePromptPickerState();
}
function openPromptPicker(){
  const stored = Array.isArray(window.DAILY_CHAT_PROMPTS_STORED)
    ? window.DAILY_CHAT_PROMPTS_STORED : [];
  PROMPT_PICKER_CUSTOM = new Set(stored.filter(function(p){
    return PROMPT_PICKER_BUILTIN.indexOf(p) < 0;
  }));
  PROMPT_PICKER_SELECTED = new Set(stored.length ? stored : PROMPT_PICKER_BUILTIN);
  renderPromptPicker();
  const mask = document.getElementById('promptPickerMask');
  if(mask) mask.style.display = 'flex';
  const search = document.getElementById('promptPickerSearch');
  if(search) search.value = '';
}
function closePromptPicker(){
  const mask = document.getElementById('promptPickerMask');
  if(mask) mask.style.display = 'none';
}
function togglePromptPicker(el){
  if(el.checked) PROMPT_PICKER_SELECTED.add(el.value);
  else PROMPT_PICKER_SELECTED.delete(el.value);
  updatePromptPickerState();
}
function setPromptPickerAll(on){
  const list = document.getElementById('promptPickerList');
  if(!list) return;
  list.querySelectorAll('input[type=checkbox]').forEach(function(el){
    el.checked = on;
    if(on) PROMPT_PICKER_SELECTED.add(el.value);
    else PROMPT_PICKER_SELECTED.delete(el.value);
  });
  updatePromptPickerState();
}
function filterPromptPicker(){
  const input = document.getElementById('promptPickerSearch');
  const list = document.getElementById('promptPickerList');
  if(!list) return;
  const q = String((input && input.value) || '').trim().toLowerCase();
  list.querySelectorAll('.prompt-pick-row').forEach(function(el){
    el.style.display = !q || (el.getAttribute('data-search') || '').indexOf(q) >= 0 ? 'flex' : 'none';
  });
}
function addPromptPickerCustom(){
  const ta = document.getElementById('promptPickerCustom');
  const lines = String((ta && ta.value) || '').split('\n')
    .map(function(s){ return s.trim(); }).filter(function(s){ return s.length > 0; });
  lines.forEach(function(p){
    PROMPT_PICKER_CUSTOM.add(p);
    PROMPT_PICKER_SELECTED.add(p);
  });
  if(ta) ta.value = '';
  renderPromptPicker();
}
async function savePromptPicker(btn){
  const prompts = Array.from(PROMPT_PICKER_SELECTED);
  if(btn) btn.disabled = true;
  try {
    const res = await postJSON('/settings/save', {daily_chat_web_prompts: prompts});
    const stored = Array.isArray(res && res.daily_chat_web_prompts)
      ? res.daily_chat_web_prompts : prompts;
    window.DAILY_CHAT_PROMPTS_STORED = stored;
    toast(stored.length ? ('已保存 ' + stored.length + ' 条候选提示词')
                        : '已清空：使用全部内置 300 条', 'ok');
    closePromptPicker();
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

// ---- 国际版每日活跃：候选模型序列 + 预算 -------------------------------------
// 旧的六个旋钮（最多尝试次数 / 失败重试 / 回退开关 / 回退组合 / 首轮等待 /
// 建会话退避）在代码里互相覆盖，面板上又看不出来，所以整块换成一个有序候选序列
// 加一个总预算：顺序即优先级，预算用完必给结论。
let DAILY_CHAT_MODEL_SELECTED = [];   // 面板上正在编辑的有序候选
let DAILY_CHAT_MODELS = null;         // /v1/models 的元数据缓存

async function loadDailyChatModels(){
  if(DAILY_CHAT_MODELS) return DAILY_CHAT_MODELS;
  try {
    const r = await getJSON('/v1/models?realm=intl');
    const out = [];
    for(const m of (r.data || [])){
      if(!m.id) continue;
      const credits = String(m.credits == null ? '' : m.credits).trim();
      const raw = credits.toLowerCase().replace(/^x/, '');
      const free = (raw === '0.00' || raw === '0');
      out.push({id: m.id, free: free, credits: credits});
    }
    // 免费的在前，其余在后，各自按 id 排序。
    out.sort((a, b) => (a.free === b.free ? a.id.localeCompare(b.id) : (a.free ? -1 : 1)));
    DAILY_CHAT_MODELS = out;
  } catch(e) {
    DAILY_CHAT_MODELS = [];
  }
  return DAILY_CHAT_MODELS;
}

async function renderDailyChatModelList(selected){
  DAILY_CHAT_MODEL_SELECTED = Array.isArray(selected) ? selected.slice() : [];
  const state = document.getElementById('setDailyChatModelsState');
  if(state){
    state.textContent = DAILY_CHAT_MODEL_SELECTED.length
      ? ('已指定 ' + DAILY_CHAT_MODEL_SELECTED.length + ' 个 · 按顺序试')
      : '(自动：首选 + 该区域免费模型)';
    state.style.color = DAILY_CHAT_MODEL_SELECTED.length ? 'var(--accent2)' : 'var(--dim)';
  }
  const box = document.getElementById('setDailyChatModelList');
  if(!box) return;
  if(!DAILY_CHAT_MODEL_SELECTED.length){
    box.innerHTML = '<div style="font-size:12px;color:var(--dim)">自动模式：只用首选模型，失败时按目录倍率挑下一个免费模型。</div>';
    return;
  }
  const models = await loadDailyChatModels();
  const byId = {};
  for(const m of models) byId[m.id] = m;
  box.innerHTML = DAILY_CHAT_MODEL_SELECTED.map(function(id, index){
    const meta = byId[id];
    const tag = meta ? (meta.free ? '免费' : (meta.credits || '付费')) : '不在目录里';
    return '<div style="display:flex;align-items:center;gap:8px;font-size:12px">'
      + '<span style="color:var(--dim);min-width:18px">' + (index + 1) + '.</span>'
      + '<span style="font-family:var(--mono,monospace)">' + esc(id) + '</span>'
      + '<span style="color:var(--dim-light)">' + esc(tag) + '</span>'
      + '<button class="sec mini" onclick="moveDailyChatModel(' + index + ',-1)">↑</button>'
      + '<button class="sec mini" onclick="moveDailyChatModel(' + index + ',1)">↓</button>'
      + '<button class="sec mini" onclick="removeDailyChatModel(' + index + ')">×</button>'
      + '</div>';
  }).join('');
}

function moveDailyChatModel(index, delta){
  const next = index + delta;
  if(index < 0 || index >= DAILY_CHAT_MODEL_SELECTED.length) return;
  if(next < 0 || next >= DAILY_CHAT_MODEL_SELECTED.length) return;
  const list = DAILY_CHAT_MODEL_SELECTED.slice();
  const item = list.splice(index, 1)[0];
  list.splice(next, 0, item);
  renderDailyChatModelList(list);
}
function removeDailyChatModel(index){
  const list = DAILY_CHAT_MODEL_SELECTED.slice();
  if(index < 0 || index >= list.length) return;
  list.splice(index, 1);
  renderDailyChatModelList(list);
}
async function toggleDailyChatModelPicker(){
  const el = document.getElementById('setDailyChatModelPicker');
  if(!el) return;
  const opening = el.style.display === 'none';
  el.style.display = opening ? 'block' : 'none';
  if(opening) await renderDailyChatModelPicker();
}
async function renderDailyChatModelPicker(){
  const list = document.getElementById('setDailyChatModelPickList');
  if(!list) return;
  const models = await loadDailyChatModels();
  list.innerHTML = (models || []).map(function(m){
    const checked = DAILY_CHAT_MODEL_SELECTED.indexOf(m.id) >= 0 ? ' checked' : '';
    const tag = m.free ? '免费' : (m.credits || '付费');
    return '<label class="fallback-pick-row" data-search="' + esc(m.id.toLowerCase()) + '" style="display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 4px"><input type="checkbox" value="' + esc(m.id) + '"' + checked + ' onchange="toggleDailyChatModel(this)">' + esc(m.id) + ' <span style="color:var(--dim-light)">' + esc(tag) + '</span></label>';
  }).join('') || '<div style="font-size:12px;color:var(--dim);padding:4px">模型清单为空</div>';
}
function toggleDailyChatModel(el){
  const id = el.value;
  const list = DAILY_CHAT_MODEL_SELECTED.slice();
  const index = list.indexOf(id);
  if(el.checked && index < 0) list.push(id);
  if(!el.checked && index >= 0) list.splice(index, 1);
  renderDailyChatModelList(list);
}
function setDailyChatModelAll(on){
  const box = document.getElementById('setDailyChatModelPickList');
  if(!box) return;
  const ids = Array.from(box.querySelectorAll('input[type=checkbox]')).map(function(el){ return el.value; });
  if(!on){ renderDailyChatModelList([]); renderDailyChatModelPicker(); return; }
  const merged = DAILY_CHAT_MODEL_SELECTED.slice();
  for(const id of ids) if(merged.indexOf(id) < 0) merged.push(id);
  renderDailyChatModelList(merged);
  renderDailyChatModelPicker();
}
function filterDailyChatModelPicker(){
  const input = document.getElementById('setDailyChatModelSearch');
  const box = document.getElementById('setDailyChatModelPickList');
  if(!box) return;
  const q = String((input && input.value) || '').trim().toLowerCase();
  box.querySelectorAll('.fallback-pick-row').forEach(function(el){
    el.style.display = !q || (el.getAttribute('data-search') || '').indexOf(q) >= 0 ? 'flex' : 'none';
  });
}
async function resetDailyChatModels(){
  renderDailyChatModelList([]);
  await renderDailyChatModelPicker();
}
function resetDailyChatTimes(){
  renderDailyChatTimes([]);
}

async function saveDailyChatModule(btn){
  const activityEl = document.getElementById('setDailyActivity');
  const webEl = document.getElementById('setDailyChatWeb');
  const budgetEl = document.getElementById('setDailyChatBudget');
  const turnEl = document.getElementById('setDailyChatTurnTimeout');
  const concEl = document.getElementById('setDailyChatWebConcurrency');
  const backoffEl = document.getElementById('setDailyChatWebRetryBackoff');
  const catchupEl = document.getElementById('setDailyChatStartupCatchup');
  const fallbackEl = document.getElementById('setDailyChatActivityFallback');
  const payload = {
    daily_chat_web: !!(webEl && webEl.checked),
    daily_chat_models: DAILY_CHAT_MODEL_SELECTED.slice(),
    daily_chat_budget: Number((budgetEl && budgetEl.value) || 0),
    daily_chat_web_timeout: Number((turnEl && turnEl.value) || 120),
    daily_chat_web_concurrency: Number((concEl && concEl.value) || 1),
    daily_chat_web_retry_backoff: Number((backoffEl && backoffEl.value) || 0),
    daily_chat_startup_catchup: !!(catchupEl && catchupEl.checked),
    daily_chat_web_fallback_activity: !!(fallbackEl && fallbackEl.checked),
    schedule: {daily_chat: DAILY_CHAT_TIMES_SELECTED.slice()}
  };
  // 总开关只在勾选框已按 /settings 回填过时才提交：设置没读到（或页面上没有
  // 这个元素）时不能凭默认状态把它悄悄写成关闭——缺省是开，不提交就保持原值。
  if(activityEl && activityEl.dataset && activityEl.dataset.loaded === '1'){
    payload.daily_activity = !!activityEl.checked;
  }
  if(btn) btn.disabled = true;
  const state = document.getElementById('setDailyChatSaveState');
  try {
    await postJSON('/settings/save', payload);
    if(state){ state.textContent = '已保存'; state.style.color = 'var(--accent2)'; }
    toast('每日活跃设置已保存', 'ok');
    loadSettings();
  } catch(e) {
    if(state){ state.textContent = ''; }
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function resetDailyChatModule(btn){
  const budgetEl = document.getElementById('setDailyChatBudget');
  const turnEl = document.getElementById('setDailyChatTurnTimeout');
  const concEl = document.getElementById('setDailyChatWebConcurrency');
  const backoffEl = document.getElementById('setDailyChatWebRetryBackoff');
  const catchupEl = document.getElementById('setDailyChatStartupCatchup');
  const fallbackEl = document.getElementById('setDailyChatActivityFallback');
  if(budgetEl) budgetEl.value = '600';
  if(turnEl) turnEl.value = '120';
  if(concEl) concEl.value = '1';
  if(backoffEl) backoffEl.value = '5';
  if(catchupEl) catchupEl.checked = true;
  if(fallbackEl) fallbackEl.checked = false;
  renderDailyChatModelList([]);
  renderDailyChatTimes([]);
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {
      daily_chat_models: [],
      daily_chat_budget: 600,
      daily_chat_web_timeout: 120,
      daily_chat_web_concurrency: 1,
      daily_chat_web_retry_backoff: 5,
      daily_chat_startup_catchup: true,
      daily_chat_web_fallback_activity: false,
      schedule: {daily_chat: []}
    });
    toast('已恢复推荐值：随机两个时段、自动候选、预算 600 秒', 'ok');
    loadSettings();
  } catch(e) {
    toast('恢复失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function saveGlobalPrompt(btn){
  const modeEl = document.getElementById('setGlobalPromptMode');
  const textEl = document.getElementById('setGlobalPromptText');
  const mode = (modeEl && modeEl.value) || 'passthrough';
  const text = (textEl && textEl.value) || '';
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {prompt: {mode: mode, text: text}});
    toast(mode === 'passthrough' ? '已保存：全局提示词透传'
        : ('已保存：全局提示词' + (mode === 'append' ? '追加到 system' : '替换 system')), 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

let DAILY_CHAT_TIMES_SELECTED = [];
function renderDailyChatTimes(times){
  DAILY_CHAT_TIMES_SELECTED = Array.isArray(times) ? times.slice().sort() : [];
  const list = document.getElementById('setDailyChatTimesList');
  if(list){
    list.innerHTML = DAILY_CHAT_TIMES_SELECTED.map(function(t){
      return '<span class="badge s" style="font-size:12px;padding:4px 8px;display:inline-flex;align-items:center;gap:6px">' + esc(t) + '<button class="key-action-btn" style="padding:0 4px" data-time="' + esc(t) + '" onclick="removeDailyChatTime(this)">×</button></span>';
    }).join('') || '<span style="font-size:12px;color:var(--dim)">未设置：每天随机两个时间（间隔 12 小时）</span>';
  }
  const state = document.getElementById('setDailyChatTimesState');
  if(state){
    state.textContent = DAILY_CHAT_TIMES_SELECTED.length
      ? ('独立时段 · ' + DAILY_CHAT_TIMES_SELECTED.join(' / '))
      : '每天随机两个时间（间隔 12 小时）';
    state.style.color = DAILY_CHAT_TIMES_SELECTED.length
      ? 'var(--accent2)' : 'var(--dim)';
  }
}
function addDailyChatTime(){
  const input = document.getElementById('setDailyChatTimeInput');
  const value = String((input && input.value) || '').trim();
  if(!value){ toast('请先选择时间', 'warn'); return; }
  if(DAILY_CHAT_TIMES_SELECTED.indexOf(value) < 0){
    DAILY_CHAT_TIMES_SELECTED.push(value);
    DAILY_CHAT_TIMES_SELECTED.sort();
  }
  renderDailyChatTimes(DAILY_CHAT_TIMES_SELECTED);
  if(input) input.value = '';
}
function removeDailyChatTime(el){
  const value = (el && el.getAttribute) ? el.getAttribute('data-time') : '';
  DAILY_CHAT_TIMES_SELECTED = DAILY_CHAT_TIMES_SELECTED.filter(function(t){ return t !== value; });
  renderDailyChatTimes(DAILY_CHAT_TIMES_SELECTED);
}
async function saveDailyChatTimes(btn){
  const times = DAILY_CHAT_TIMES_SELECTED.slice();
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {schedule: {daily_chat: times}});
    toast(times.length ? ('已保存每日活跃时段：' + times.join(' / '))
                       : '已清空：每日活跃改为每天随机两个时间', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function saveLocalWebTools(btn){
  const el = document.getElementById('setLocalWebTools');
  const value = !!(el && el.checked);
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {local_web_tools: value});
    toast(value ? '已启用：由网关代跑 web_search / web_fetch' : '已关闭：工具声明原样透传', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function saveRemainingPriority(btn){
  const el = document.getElementById('setRemainingPriority');
  const value = !!(el && el.checked);
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {remaining_priority_enabled: value});
    toast(value ? '已启用：剩余用量接近耗尽的组合优先调度' : '已关闭剩余用量优先调度', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function saveRealmFallback(btn){
  const el = document.getElementById('setRealmFallback');
  const value = !!(el && el.checked);
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {realm_fallback_enabled: value});
    toast(value ? '已启用：国际版限流时回退到国内版' : '已关闭跨出口回退', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function saveWindowProbe(btn){
  const el = document.getElementById('setWindowProbe');
  const value = !!(el && el.checked);
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {window_probe: value});
    toast(value ? '已启用：额度窗口到点自动请求' : '已关闭额度窗口探针', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function saveAffinityStableKey(btn){
  const el = document.getElementById('setAffinityStableKey');
  const value = !!(el && el.checked);
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {affinity_stable_key_enabled: value});
    toast(value ? '已启用：会话键包含首条回复' : '已关闭：会话键只用前两条消息', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

/* 账号级并发上限：0 = 不限，1..10 = 每账号同时几个。后端只接受整数，
   空值/小数/非数字就地拦下，不送上去换 400。 */
async function saveAccountConcurrent(btn){
  const el = document.getElementById('setAccountConcurrent');
  const raw = (el && el.value !== '') ? Number(el.value) : NaN;
  const value = Math.floor(raw);
  if(!isFinite(value) || value < 0 || value > 10){
    toast('请输入 0 到 10 的整数（0 = 不限）', 'bad');
    return;
  }
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {account_max_concurrent: value});
    toast(value > 0 ? ('已保存：每个账号同时最多 ' + value + ' 个请求') : '已保存：账号并发不限', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function saveEgressBackoff(btn){
  const el = document.getElementById('setEgressBackoff');
  const value = !!(el && el.checked);
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {egress_backoff_enabled: value});
    toast(value ? '已启用：出口级瞬时失败退避' : '已关闭出口级瞬时失败退避', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

/* 用量聚合保留窗口（空间换时间）。后端只接受 >=1 的整数，且各有上限，所以
   先把输入收成整数再发；空值/小数/非数字就地拦下，不送上去换 400。 */
async function saveUsageKeep(btn){
  const hourEl = document.getElementById('setUsageHourKeep');
  const dayEl = document.getElementById('setUsageDayKeep');
  const hours = Math.floor(Number(hourEl && hourEl.value));
  const days = Math.floor(Number(dayEl && dayEl.value));
  if(!isFinite(hours) || hours < 1 || !isFinite(days) || days < 1){
    toast('请输入不小于 1 的整数', 'bad');
    return;
  }
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {usage: {hour_keep_hours: hours, day_keep_days: days}});
    toast('已保存：小时层 ' + hours + ' 小时 / 日桶 ' + days + ' 天', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}
async function saveMaxPayload(btn){
  const el = document.getElementById('setMaxPayloadMB');
  const value = Number(el && el.value);
  if(!Number.isInteger(value) || value < 1 || value > 256){ toast('请输入 1 到 256 的整数 MB', 'bad'); return; }
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {max_payload_mb: value});
    toast('单请求体上限已保存', 'ok');
    loadSettings();
  } catch(e) { toast('保存失败: ' + e.message, 'bad'); }
  finally { if(btn) btn.disabled = false; }
}
/* 上游响应头超时。后端只接受 >=1 的整数秒，所以先把输入收成整数再发：空值、
   小数、非数字就地拦下，而不是送上去换一个 400 回来。 */
async function saveHeaderTimeout(btn){
  const el = document.getElementById('setHeaderTimeout');
  const value = Math.floor(Number(el && el.value));
  if(!isFinite(value) || value < 1){
    toast('请输入不小于 1 的整数秒', 'bad');
    return;
  }
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {upstream: {header_timeout_seconds: value}});
    toast('已保存：上游响应头超时 ' + value + ' 秒', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

/* ---- 日志落库 ----
   开关与三条保留上限一次提交；上限框留空就发 null，服务端存成「不限」。
   大小框以 MB 输入，发出去时换算成字节（服务端一律以字节记）。 */
function capInputValue(id){
  const el = document.getElementById(id);
  if(!el) return null;
  const raw = String(el.value == null ? '' : el.value).trim();
  if(raw === '') return null;
  const n = Number(raw);
  if(!isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}
function fillCapInput(id, value){
  const el = document.getElementById(id);
  if(!el) return;
  el.value = (value === null || value === undefined || value === '') ? '' : String(value);
}
function fillCapInputMB(id, bytes){
  const el = document.getElementById(id);
  if(!el) return;
  el.value = (bytes === null || bytes === undefined || bytes === '' || bytes <= 0)
    ? '' : String(Math.max(1, Math.round(bytes / 1048576)));
}
async function saveLogDb(btn){
  const enabledEl = document.getElementById('setLogDbEnabled');
  const rows = capInputValue('setLogDbMaxRows');
  const days = capInputValue('setLogDbMaxDays');
  const mb = capInputValue('setLogDbMaxMB');
  const payload = {
    log_db_enabled: !!(enabledEl && enabledEl.checked),
    log_db_max_rows: rows,
    log_db_max_days: days,
    log_db_max_bytes: mb === null ? null : mb * 1048576,
  };
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', payload);
    toast(payload.log_db_enabled ? '已启用日志落库' : '已关闭日志落库', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

/* ---- 更新检查与手动安装 ----
   浏览器只请求本机面板接口，不直接下载更新包或访问 GitHub。安装状态由
   root-owned systemd 更新服务回报；自动检查开关永远不会自动安装。 */

/* 200 不等于成功：后端把「检查根本没跑起来」（ok=false）和「这一次查询失败」
   （last_error 非空）都放在 200 的响应体里回来。两处都要看，否则按钮会对着
   一次失败的检查报「已是最新版本」——这正是它以前做的事。 */
function updateCheckFailure(data){
  if(!data) return '响应为空';
  if(data.ok === false) return data.msg || '更新检查未运行';
  return data.last_error || '';
}

function updateStateLabel(data){
  if(!data) return '未知';
  if(updateCheckFailure(data)) return '检查失败';
  if(data.update_available) return '发现新版本';
  if(data.latest_version) return '已是最新';
  return '尚未检查';
}

/* 更新/回退进行中的状态：安装按钮与回退按钮共用同一份，避免两处列表漂移。 */
const INSTALL_BUSY_STATES = ['queued','downloading','verifying','backing_up','stopping',
  'applying','restoring','restarting','checking','rolling_back'];
let LAST_INSTALL_STATE = 'idle';

function applyUpdateStatus(data){
  data = data || {};
  const failure = updateCheckFailure(data);
  const set = (id, value) => { const el = document.getElementById(id); if(el) el.textContent = value || '-'; };
  set('setUpdateCurrent', data.current_version);
  set('setUpdateLatest', data.latest_version);
  set('setUpdateLastCheck', data.last_attempt);
  const state = document.getElementById('setUpdateState');
  if(state){
    state.textContent = '(' + updateStateLabel(data) + ')';
    state.style.color = failure ? 'var(--warn)'
      : data.update_available ? 'var(--accent2)' : 'var(--dim)';
  }
  const enabled = document.getElementById('setUpdateCheckEnabled');
  if(enabled) enabled.checked = data.enabled === true;
  const err = document.getElementById('setUpdateError');
  if(err) err.textContent = failure ? ('上次检查失败：' + failure) : '';
  const installation = data.installation || {};
  const installState = String(installation.state || 'idle');
  LAST_INSTALL_STATE = installState;
  const installLabels = {
    idle: '尚未开始', queued: '等待安装', downloading: '正在下载更新包',
    verifying: '正在校验更新包', backing_up: '正在备份程序文件',
    stopping: '正在停止网关', applying: '正在安装程序',
    restoring: '正在回退到历史版本',
    restarting: '正在重启网关', checking: '正在检查网关',
    succeeded: '更新完成', restored: '回退完成',
    rolling_back: '更新失败，正在回滚',
    rolled_back: '更新已回滚', failed: '更新失败', unavailable: '更新服务未安装'
  };
  const installStatus = document.getElementById('setUpdateInstallStatus');
  if(installStatus){
    const label = installLabels[installState] || '更新状态暂时无法读取';
    installStatus.textContent = label;
  }
  if(err && !failure && (installState === 'failed' || installState === 'rolled_back')){
    const prefix = installState === 'rolled_back' ? '更新已回滚：' : '更新失败：';
    err.textContent = prefix + String(installation.message || '');
  }
  const install = document.getElementById('setUpdateInstallBtn');
  if(install){
    const busy = INSTALL_BUSY_STATES.includes(installState);
    const canInstall = data.install_enabled === true && data.update_available === true
      && !!data.latest_tag && !!data.release_url && !data.checking && !busy
      && installState !== 'unavailable';
    install.disabled = !canInstall;
    install.title = !data.install_enabled ? '更新服务未安装'
      : busy ? '已有更新任务正在运行'
      : data.checking ? '正在检查更新，请稍候'
      : !data.update_available ? '当前没有可安装的新版本'
      : (!data.latest_tag || !data.release_url) ? '请先点击立即检查更新' : '';
    const hint = document.getElementById('setUpdateInstallHint');
    if(hint) hint.textContent = canInstall ? '发现新版本，点击“安装更新”开始安装。' : install.title;
  }
}

async function loadUpdateStatus(){
  try {
    applyUpdateStatus(await getJSON('/updates'));
  } catch(e) {
    // 读不到更新状态不该影响设置页的其它区块，也不该谎报「已是最新」。
    const state = document.getElementById('setUpdateState');
    if(state){ state.textContent = '(读取失败)'; state.style.color = 'var(--warn)'; }
  }
}

async function checkUpdateNow(btn){
  if(btn) btn.disabled = true;
  try {
    const data = await postJSON('/updates/check', {});
    applyUpdateStatus(data);
    const failure = updateCheckFailure(data);
    if(failure){ toast('检查更新失败: ' + failure, 'bad'); return; }
    toast(data.update_available ? ('发现新版本 ' + data.latest_version) : '已是最新版本', 'ok');
  } catch(e) {
    toast('检查更新失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function installUpdateNow(btn){
  if(btn) btn.disabled = true;
  try {
    const current = await getJSON('/updates');
    applyUpdateStatus(current);
    if(current.install_enabled !== true){
      toast('安装更新服务尚未配置', 'bad');
      return;
    }
    if(!current.update_available || !current.latest_tag || !current.release_url){
      toast('请先点击立即检查更新', 'warn');
      return;
    }
    if(btn) btn.disabled = true;
    if(!confirm('安装更新会短暂重启网关。账号与用量数据会保留。继续吗？')) return;
    const accepted = await postJSON('/updates/install', {});
    if(accepted && accepted.ok === false) throw new Error(accepted.msg || '提交更新任务失败');
    toast('已开始安装更新', 'ok');
    await pollUpdateInstall();
  } catch(e) {
    toast('安装更新失败: ' + e.message, 'bad');
    loadUpdateStatus();
  } finally {
    if(btn) btn.disabled = false;
    loadUpdateStatus();
  }
}

async function pollUpdateInstall(){
  for(let i = 0; i < 120; i++){
    await new Promise(resolve => setTimeout(resolve, 2000));
    try {
      const data = await getJSON('/updates');
      applyUpdateStatus(data);
      const state = String((data.installation || {}).state || '');
      if(state === 'succeeded'){
        toast('更新已完成，正在刷新页面', 'ok');
        setTimeout(() => window.location.reload(), 1200);
        return;
      }
      if(state === 'failed' || state === 'rolled_back'){
        const detail = (data.installation || {}).message || '';
        toast((state === 'rolled_back' ? '更新已回滚：' : '更新失败：') + detail, 'bad');
        return;
      }
    } catch(e) {
      // The gateway briefly stops while the root updater replaces its files.
    }
  }
  toast('更新仍在执行，请稍后刷新', 'warn');
}

async function saveUpdateCheckEnabled(btn){
  const el = document.getElementById('setUpdateCheckEnabled');
  const value = !!(el && el.checked);
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {update_check_enabled: value});
    toast(value ? '已启用：每天自动检查更新' : '已关闭：不再自动检查更新', 'ok');
    loadSettings();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

/* ---- 版本回退：列出本机保留的备份，回退到其中一版 ---- */
async function saveKeepBackups(btn){
  const el = document.getElementById('setKeepBackups');
  const value = parseInt((el && el.value) || '1', 10);
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {keep_backups: value});
    toast(value === 0 ? '已保存：不再保留历史版本备份（回退不可用）'
                      : ('已保存：保留 ' + value + ' 份历史版本备份'), 'ok');
    await loadUpdateBackups();
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
  }
}

function renderRollbackRows(data){
  data = data || {};
  const body = document.getElementById('setRollbackRows');
  const hint = document.getElementById('setRollbackHint');
  const state = document.getElementById('setRollbackState');
  const current = String(data.current_version || '');
  const rows = Array.isArray(data.backups) ? data.backups : [];
  const keep = (typeof data.keep_backups === 'number') ? data.keep_backups : 1;
  const enabled = data.rollback_enabled === true;
  const busy = INSTALL_BUSY_STATES.includes(LAST_INSTALL_STATE);
  if(state) state.textContent = current ? ('(当前 ' + current + ')') : '';
  if(body){
    if(!rows.length){
      body.innerHTML = '<tr><td colspan="5" style="color:var(--dim)">没有可回退的本地备份</td></tr>';
    } else {
      body.innerHTML = rows.map(row => {
        const version = String(row.version || '');
        // The onclick argument is built from backend data: keep it to the
        // characters a version can contain, so an odd backup name cannot break
        // out of the attribute.
        const arg = version.replace(/[^0-9.]/g, '');
        const complete = row.complete === true;
        const same = !!version && version === current;
        const reason = !complete ? (row.reason || '备份不完整')
          : same ? '这就是当前版本'
          : !enabled ? '更新服务未安装'
          : busy ? '已有更新任务正在运行' : '';
        const disabled = !!reason;
        // Backup ids become inline onclick arguments too; keep the same
        // conservative charset used for account ids, not just HTML escaping.
        const argAttr = esc(String(arg || '').replace(/[^\w.@-]/g, ''));
        const integrity = complete ? '完整'
          : ('<span style="color:var(--warn)">不完整</span>'
             + (row.reason ? '<div style="font-size:11px;color:var(--dim)">' + esc(row.reason) + '</div>' : ''));
        return '<tr>'
          + '<td class="mono">' + esc(version || '-') + '</td>'
          + '<td class="mono">' + esc(row.created_at || '-') + '</td>'
          + '<td>' + esc(String(row.files || 0)) + '</td>'
          + '<td>' + integrity + '</td>'
          + '<td><button class="sec" ' + (disabled ? 'disabled ' : '')
          +   'title="' + esc(reason) + '" '
          +   'onclick="rollbackToVersion(this, \'' + argAttr + '\')">回退到此版本</button></td>'
          + '</tr>';
      }).join('');
    }
  }
  if(hint){
    if(keep === 0){
      hint.textContent = '当前设置为不保留备份，回退不可用';
    } else if(!rows.length){
      hint.textContent = '更新成功后才会留下可回退的备份';
    } else {
      hint.textContent = '';
    }
  }
}

async function loadUpdateBackups(showToast){
  const body = document.getElementById('setRollbackRows');
  try {
    const data = await getJSON('/updates/backups');
    renderRollbackRows(data);
  } catch(e) {
    // 老版本后端没有这个接口（404），或者读取本身失败：只让这张卡片降级，
    // 上面的「更新」卡片照旧。
    if(body) body.innerHTML = '<tr><td colspan="5" style="color:var(--warn)">读取备份列表失败</td></tr>';
    if(showToast) toast('读取备份列表失败: ' + e.message, 'bad');
  }
}

async function rollbackToVersion(btn, version){
  if(btn) btn.disabled = true;
  try {
    if(!confirm('回退到 ' + version + ' 会重启网关并中断当前请求，账号与用量数据不受影响。继续吗？')) return;
    const accepted = await postJSON('/updates/rollback', {version: version});
    if(accepted && accepted.ok === false) throw new Error(accepted.msg || '提交回退任务失败');
    toast('已开始回退到 ' + version, 'ok');
    await pollUpdateRollback(version);
  } catch(e) {
    toast('回退失败: ' + e.message, 'bad');
  } finally {
    if(btn) btn.disabled = false;
    loadUpdateBackups();
  }
}

async function pollUpdateRollback(version){
  for(let i = 0; i < 120; i++){
    await new Promise(resolve => setTimeout(resolve, 2000));
    try {
      const data = await getJSON('/updates');
      applyUpdateStatus(data);
      const installation = data.installation || {};
      const state = String(installation.state || '');
      if(state === 'restored'){
        toast('已回退到 ' + version + '，正在刷新页面', 'ok');
        setTimeout(() => window.location.reload(), 1200);
        return;
      }
      if(state === 'failed' || state === 'rolled_back'){
        toast('回退失败：' + (installation.message || ''), 'bad');
        return;
      }
    } catch(e) {
      // 回退过程中网关会短暂停止，这里的读取失败是预期的。
    }
  }
  toast('回退仍在执行，请稍后刷新', 'warn');
}

/* ---- Model quota scan: watch a chosen set of models on a fixed timer ---- */
let SAVED_QUOTA_SCAN_MODELS = [];
let QUOTA_SCAN_SELECTED = [];

let QUOTA_MODEL_CATALOG = [];

async function loadQuotaScanCatalog(){
  // Only the "all realms" listing can offer every model to watch: MODELS_DATA
  // follows whichever realm tab is open, so half the catalogue would be
  // missing when the panel is showing the other one.
  if(QUOTA_MODEL_CATALOG.length) return QUOTA_MODEL_CATALOG;
  try{
    const r = await getJSON('/v1/models?realm=all');
    QUOTA_MODEL_CATALOG = (r.data || []).filter(m => m && m.id);
  }catch(e){
    QUOTA_MODEL_CATALOG = [];
  }
  // Fall back to whatever the models tab already cached rather than showing
  // an empty box when the listing call fails. Go through window so a test
  // stub that never defined MODELS_DATA reads undefined instead of throwing.
  if(!QUOTA_MODEL_CATALOG.length && Array.isArray(window.MODELS_DATA)){
    QUOTA_MODEL_CATALOG = window.MODELS_DATA.filter(m => m && m.id);
  }
  return QUOTA_MODEL_CATALOG;
}

function renderQuotaScanModels(){
  const box = document.getElementById('quotaScanModels');
  const hint = document.getElementById('quotaScanHint');
  if(!box) return;
  const models = QUOTA_MODEL_CATALOG || [];
  if(!models.length){
    box.innerHTML = '<span style="font-size:12px;color:var(--dim)">暂无可用模型目录</span>';
    if(hint) hint.textContent = '';
    return;
  }
  const selected = {};
  (QUOTA_SCAN_SELECTED || []).forEach(m => { selected[m] = true; });
  box.innerHTML = models.map(m => {
    const id = String(m.id || '');
    if(!id) return '';
    return '<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">'
         + '<input type="checkbox" data-model="' + esc(id) + '"'
         + (selected[id] ? ' checked' : '') + ' style="width:14px;height:14px">'
         + '<span class="mono">' + esc(id) + '</span></label>';
  }).join('');
  // A model that was saved earlier but is no longer published upstream cannot
  // be unchecked through the catalogue; say so rather than silently dropping it.
  const missing = SAVED_QUOTA_SCAN_MODELS.filter(
    m => !models.some(x => String((x && x.id) || '') === m));
  if(hint){
    hint.textContent = missing.length
      ? ('已有 ' + missing.length + ' 个勾选模型不在当前目录中（' + missing.join(', ') + '），保存时保留')
      : ('共 ' + models.length + ' 个模型可选');
  }
}

function toggleAllQuotaScanModels(on){
  const box = document.getElementById('quotaScanModels');
  if(!box) return;
  box.querySelectorAll('input[type=checkbox]').forEach(el => { el.checked = !!on; });
}

async function saveQuotaScanModels(btn){
  const box = document.getElementById('quotaScanModels');
  if(btn){ btn.disabled = true; btn.textContent = '保存中...'; }
  try{
    const checked = [];
    if(box){
      box.querySelectorAll('input[type=checkbox]').forEach(el => {
        if(el.checked && el.dataset.model) checked.push(el.dataset.model);
      });
    }
    const catalogued = {};
    (QUOTA_MODEL_CATALOG || []).forEach(m => { catalogued[String(m.id)] = true; });
    // Keep watch entries the catalogue no longer publishes: they were chosen
    // deliberately and would otherwise vanish on the next save.
    (SAVED_QUOTA_SCAN_MODELS || []).forEach(m => {
      if(m && !catalogued[m] && checked.indexOf(m) < 0) checked.push(m);
    });
    await postJSON('/settings/save', {quota_scan_models: checked});
    toast(checked.length ? ('已保存：定时查询 ' + checked.length + ' 个模型') : '已清空：不再定时查询任何模型', 'ok');
    loadSettings();
  }catch(e){
    toast('保存失败: ' + e.message, 'bad');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '保存勾选'; }
  }
}

async function runQuotaScan(btn){
  if(btn){ btn.disabled = true; btn.textContent = '查询中...'; }
  try{
    const r = await postJSON('/quota-scan/run', {});
    toast(r.msg || '查询完成', r.ok ? 'ok' : 'bad');
    loadSettings();
  }catch(e){
    toast('查询失败: ' + e.message, 'bad');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '立即查询'; }
  }
}

function fmtDueSec(sec){
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if(s < 60) return s + ' 秒';
  const m = Math.floor(s / 60);
  if(m < 60) return m + ' 分钟';
  const h = Math.floor(m / 60);
  return h + ' 小时' + (m % 60 ? (m % 60) + ' 分' : '');
}

function renderQuotaScanState(data){
  const stateEm = document.getElementById('setQuotaScanState');
  const box = document.getElementById('quotaScanState');
  const watched = Array.isArray(data.quota_scan_models) ? data.quota_scan_models.length : 0;
  const hours = Number(data.quota_scan_interval_hours || 6);
  if(stateEm){
    stateEm.textContent = watched ? ('(已监视 ' + watched + ' 个模型)') : '(未启用)';
    stateEm.style.color = watched ? 'var(--accent2)' : 'var(--dim)';
  }
  if(!box) return;
  const rows = Array.isArray(data.quota_scans) ? data.quota_scans : [];
  if(!rows.length){
    box.innerHTML = '<div style="font-size:12px;color:var(--dim)">'
      + (watched ? '尚无查询记录，第一条记录会在首次查询后写入。' : '勾选上方模型并保存后开始定时查询。')
      + '</div>';
    return;
  }
  const label = {ok: '正常 (未达限额)', throttled: '已达限额', error: '查询失败'};
  box.innerHTML = '<table><thead><tr><th>模型</th><th>账号</th><th>最近结果</th>'
    + '<th>上次查询</th><th>下次查询</th></tr></thead><tbody>'
    + rows.map(r => {
        const status = r.pending
          ? '<span class="badge s">已登记 429，交给窗口探针</span>'
          : '<span class="badge ' + (r.last_result === 'ok' ? 'ok' : 'warn') + '">'
            + esc(label[r.last_result] || r.last_result || '等待首次查询') + '</span>';
        const last = Number(r.last_scan) || 0
          ? (fmtDueSec((Date.now() / 1000) - Number(r.last_scan)) + ' 前')
          : '尚未查询';
        return '<tr><td class="mono">' + esc(r.model || '-') + '</td>'
             + '<td class="mono">' + esc(r.uid8 || '-') + '</td>'
             + '<td>' + status + '</td><td>' + last + '</td>'
             + '<td>' + (r.pending ? '-' : fmtDueSec(r.due_in) + ' 后') + '</td></tr>';
      }).join('')
    + '</tbody></table>'
    + '<div style="font-size:12px;color:var(--dim);margin-top:8px">查询周期：每 '
    + hours + ' 小时；已登记 429 窗口的配额线不再轮询。</div>';
}

/* ---- API key list: several keys, each bound to an upstream exit ---- */
let API_KEY_ROWS = [];
let DELETED_KEY_ROWS = [];
/* Ids the user removed but that are still stored server-side, pending the
   next save. Deletion is sent explicitly (rather than by leaving the row out
   of the list) so a submission that is stale or incomplete - a second tab, a
   save that raced the post-save reload - can never retire a key nobody
   removed. */
let DELETED_KEY_IDS = [];

function randomKeyValue(){
  const bytes = new Uint8Array(18);
  if(window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
  const raw = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  // crypto.getRandomValues is present in every supported browser; the
  // timestamp fallback only exists so the field is never left empty.
  return raw || ('wb-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
}

const REALM_CHOICES = [
  ['', '跟随面板切换'],
  ['intl', '固定国际版出口'],
  ['cn', '固定国内版出口'],
];

/* Model allow-list per key. Patterns are matched case-insensitively with `*`
   wildcards ("deepseek*", "gpt-6-astra"). An empty list means no limit, which
   is how every key saved before this field existed comes back. */
function parseModelPatterns(text){
  const out = [];
  String(text || '').split(/[,;]/).forEach(part => {
    const pattern = part.trim().toLowerCase();
    if(pattern && out.indexOf(pattern) === -1) out.push(pattern);
  });
  return out;
}
function modelPatternsText(patterns){
  return Array.isArray(patterns) ? patterns.join(', ') : '';
}

/* 允许账号按精确 uid 匹配（不做通配），所以这里只做去空白与去重。 */
function parseAccountRefs(text){
  const out = [];
  String(text || '').split(/[,;\n]/).forEach(part => {
    const ref = part.trim();
    if(ref && out.indexOf(ref) === -1) out.push(ref);
  });
  return out;
}
function accountRefsText(refs){
  return Array.isArray(refs) ? refs.join(', ') : '';
}

/* 已删除的 Key 是只读历史：密钥已被抹掉，所以这里不提供复制，也不提供恢复。 */
function renderDeletedKeyRows(){
  const box = document.getElementById('deletedKeySection');
  if(!box) return;
  if(!DELETED_KEY_ROWS.length){ box.innerHTML = ''; return; }
  const rows = DELETED_KEY_ROWS.map(k => {
    const realmLbl = (k.realm === 'intl') ? '固定国际版出口'
      : ((k.realm === 'cn') ? '固定国内版出口'
        : ((k.realm === 'codearts') ? '固定 CodeArts 出口' : '跟随面板切换'));
    return '<div style="font-size:12px;color:var(--dim);display:flex;gap:14px;flex-wrap:wrap;padding:7px 0;border-top:1px solid var(--line)">'
      + '<span style="color:var(--fg);font-weight:600">' + esc(k.name || '未命名') + '</span>'
      + '<span>' + esc(realmLbl) + '</span>'
      + (k.created_at ? '<span>创建 ' + esc(k.created_at) + '</span>' : '')
      + (k.deleted_at ? '<span>删除 ' + esc(k.deleted_at) + '</span>' : '')
      + '<span class="mono">' + esc(k.id) + '</span>'
      + '</div>';
  }).join('');
  box.innerHTML = '<details style="margin-top:14px">'
    + '<summary style="cursor:pointer;font-size:12px;color:var(--dim);font-weight:600">已删除的 API Key（'
    + DELETED_KEY_ROWS.length + '）· 只读</summary>'
    + '<div style="margin-top:4px">' + rows + '</div>'
    + '<div style="font-size:11px;color:var(--dim);margin-top:8px">'
    + '删除时密钥已被抹掉，无法恢复、也无法再用于请求。保留这条记录是为了让「按 API Key 的消耗归属」里这些 Key 的历史用量仍然显示名字。'
    + '</div></details>';
}

function renderKeyRows(){
  renderDeletedKeyRows();
  const box = document.getElementById('keyList');
  if(!box) return;
  if(!API_KEY_ROWS.length){
    box.innerHTML = '<div class="empty" style="padding:24px 0">还没有配置 API Key，点击右上角「+ 添加 API Key」创建。</div>';
    return;
  }
  box.innerHTML = API_KEY_ROWS.map((row, i) => {
    if(row._editing){
      const realmChoices = REALM_CHOICES.concat(
        (window.REALM_OPTIONS || []).includes('codearts')
          ? [['codearts', '固定 CodeArts 出口']] : []);
      const options = realmChoices.map(([val, lbl]) =>
        '<option value="' + val + '"' + ((row.realm || '') === val ? ' selected' : '') + '>' + lbl + '</option>'
      ).join('');
      return '<div class="key-card" style="border-color:var(--accent);background:var(--panel);box-shadow:0 0 0 1px var(--accent), var(--shadow-md)">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
        +   '<div style="font-size:14px;font-weight:700;color:var(--fg)">' + (row.id ? '编辑 API Key' : '新建 API Key') + '</div>'
        +   '<span class="badge s mini">设置出口</span>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">'
        +   '<div>'
        +     '<div style="font-size:12px;color:var(--dim);margin-bottom:4px;font-weight:500">备注名称</div>'
        +     '<input type="text" id="editKeyName_' + i + '" value="' + esc(row.name || '') + '" placeholder="如: Cursor / DSH / 本地测试" '
        +       'style="width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:7px 10px;font:inherit;color:var(--fg)">'
        +   '</div>'
        +   '<div>'
        +     '<div style="font-size:12px;color:var(--dim);margin-bottom:4px;font-weight:500">出口绑定</div>'
        +     '<select id="editKeyRealm_' + i + '" style="width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:7px 10px;font:inherit;color:var(--fg)">'
        +       options
        +       '</select>'
        +   '</div>'
        +   '<div>'
        +     '<div style="font-size:12px;color:var(--dim);margin-bottom:4px;font-weight:500">最大并发限制 <span style="color:var(--dim-light)">(选填，0 = 不限)</span></div>'
        +     '<input type="number" min="0" max="1000" id="editKeyConc_' + i + '" value="' + (row.concurrency_limit || '') + '" placeholder="0 代表不限制" '
        +       'style="width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:7px 10px;font:inherit;color:var(--fg)">'
        +   '</div>'
        +   '<div style="grid-column:1 / -1">'
        +     '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">'
        +       '<div style="font-size:12px;color:var(--dim);font-weight:500">模型准入 <span id="editKeyModelsSummary_' + i + '" style="color:var(--dim-light)"></span></div>'
        +       '<button class="sec mini" style="border-radius:8px;padding:4px 12px" onclick="toggleKeyPicker(\'model\',' + i + ')">选择模型</button>'
        +     '</div>'
        +     '<div id="editKeyModelPicker_' + i + '" style="display:none;border:1px solid var(--line);border-radius:8px;padding:8px;margin-top:4px">'
        +       '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">'
        +         '<input id="editKeyModelSearch_' + i + '" placeholder="搜索模型" oninput="filterKeyModelPicker(' + i + ')" style="flex:1;min-width:160px;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:6px 9px;font:inherit;color:var(--fg)">'
        +         '<button class="sec mini" onclick="setKeyModelsAll(' + i + ',true)">全选</button>'
        +         '<button class="sec mini" onclick="setKeyModelsAll(' + i + ',false)">全不选</button>'
        +       '</div>'
        +       '<div id="editKeyModelList_' + i + '" style="max-height:220px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:2px 8px"></div>'
        +     '</div>'
        +     '<div id="editKeyModelWildcards_' + i + '" style="font-size:11px;color:var(--warn);margin-top:4px"></div>'
        +   '</div>'
        +   '<div style="grid-column:1 / -1">'
        +     '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">'
        +       '<div style="font-size:12px;color:var(--dim);font-weight:500">允许账号 <span id="editKeyAccountsSummary_' + i + '" style="color:var(--dim-light)"></span></div>'
        +       '<button class="sec mini" style="border-radius:8px;padding:4px 12px" onclick="toggleKeyPicker(\'account\',' + i + ')">选择账号</button>'
        +     '</div>'
        +     '<div id="editKeyAccountPicker_' + i + '" style="display:none;border:1px solid var(--line);border-radius:8px;padding:8px;margin-top:4px">'
        +       '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">'
        +         '<input id="editKeyAccountSearch_' + i + '" placeholder="搜索昵称或 UID" oninput="filterKeyAccountPicker(' + i + ')" style="flex:1;min-width:160px;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:6px 9px;font:inherit;color:var(--fg)">'
        +         '<button class="sec mini" onclick="setKeyAccountsAll(' + i + ',true)">全选</button>'
        +         '<button class="sec mini" onclick="setKeyAccountsAll(' + i + ',false)">全不选</button>'
        +       '</div>'
        +       '<div id="editKeyAccountList_' + i + '" style="max-height:220px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:2px 8px"></div>'
        +     '</div>'
        +   '</div>'
        +   '<div style="grid-column:1 / -1">'
        +     '<div style="font-size:12px;color:var(--dim);margin-bottom:4px;font-weight:500">API Key 内容 ' + (row.masked ? '<span style="color:var(--dim-light)">(已保存: ' + esc(row.masked) + '，留空表示不改)</span>' : '') + '</div>'
        +     '<div style="display:flex;gap:8px">'
        +       '<input type="text" id="editKeyValue_' + i + '" value="' + esc(row.key || '') + '" placeholder="' + (row.masked ? '留空表示保持原 Key 不变' : '输入自定义密钥，或点击右侧生成') + '" '
        +         'style="flex:1;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:7px 10px;font:inherit;color:var(--fg)">'
        +       '<button class="sec mini" style="white-space:nowrap;border-radius:8px;padding:7px 14px" onclick="generateKeyForEdit(' + i + ')">随机生成</button>'
        +     '</div>'
        +   '</div>'
        + '</div>'
        + '<div style="display:flex;gap:8px;justify-content:flex-end">'
        +   '<button class="sec mini" style="border-radius:8px;padding:6px 16px" onclick="cancelEditKey(' + i + ')">取消</button>'
        +   '<button class="mini" style="border-radius:8px;padding:6px 18px" onclick="saveSingleKey(' + i + ', this)">保存</button>'
        + '</div>'
        + '</div>';
    }

    const statusBadge = row.enabled
      ? '<span class="badge ok" style="font-size:11px;font-weight:600;padding:2px 10px">已启用</span>'
      : '<span class="badge off" style="font-size:11px;font-weight:600;padding:2px 10px">已禁用</span>';

    const realmBadge = (row.realm === 'intl')
      ? '<span class="realm-badge-intl" style="font-size:11px">固定国际版出口</span>'
      : (row.realm === 'cn')
      ? '<span class="realm-badge-cn" style="font-size:11px">固定国内版出口</span>'
      : '<span class="badge s" style="font-size:11px">跟随面板切换</span>';

    const concBadge = (row.concurrency_limit && row.concurrency_limit > 0)
      ? '<span class="badge s mini" style="font-size:11px">并发上限 ' + row.concurrency_limit + '</span>'
      : '';
    const modelBadge = (Array.isArray(row.models) && row.models.length)
      ? '<span class="badge s" style="font-size:11px">限 ' + esc(modelPatternsText(row.models)) + '</span>'
      : '';
    const accountBadge = (Array.isArray(row.accounts) && row.accounts.length)
      ? '<span class="badge s" style="font-size:11px">限 ' + row.accounts.length + ' 个账号</span>'
      : '';

    const displayKey = row.masked || (row.key ? (row.key.slice(0, 4) + '******' + row.key.slice(-4)) : '未设置');
    const createdStr = row.created_at ? ('创建时间 ' + esc(row.created_at)) : '';

    return '<div class="key-card' + (row.enabled ? '' : ' disabled') + '">'
      + '<div class="key-card-main">'
      +   '<div>'
      +     '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">'
      +       '<span style="font-size:15px;font-weight:700;color:var(--fg)">' + esc(row.name || '未命名') + '</span>'
      +       statusBadge
      +       realmBadge
      +       modelBadge
        +       accountBadge
        +       concBadge
      +     '</div>'
      +     '<div style="font-size:12px;color:var(--dim);display:flex;align-items:center;gap:16px;flex-wrap:wrap">'
      +       '<span>Key: <span class="mono" style="color:var(--fg);font-weight:500">' + esc(displayKey) + '</span></span>'
      +       (createdStr ? ('<span>' + createdStr + '</span>') : '')
      +     '</div>'
      +   '</div>'
      +   '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      +     '<button class="key-action-btn" id="copyBtn' + i + '" onclick="copyKeyRow(' + i + ')">复制</button>'
      +     '<button class="key-action-btn" onclick="openEditKey(' + i + ')">编辑</button>'
      +     '<button class="key-action-btn" onclick="toggleKeyRow(' + i + ')">' + (row.enabled ? '禁用' : '启用') + '</button>'
      +     '<button class="key-action-btn danger" onclick="removeKeyRow(' + i + ')">删除</button>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }).join('');
  API_KEY_ROWS.forEach((row, i) => { if(row._editing) renderKeyPickers(i); });
}

function keyModelWildcards(row){
  return (row.models || []).filter(p => String(p).indexOf('*') >= 0);
}
function keyModelExact(row){
  return (row.models || []).filter(p => String(p).indexOf('*') < 0);
}
function updateKeyModelSummary(i){
  const row = API_KEY_ROWS[i];
  if(!row) return;
  const exact = keyModelExact(row).length;
  const wild = keyModelWildcards(row).length;
  const el = document.getElementById('editKeyModelsSummary_' + i);
  if(el){
    el.textContent = (exact || wild)
      ? ('（已选 ' + exact + ' 个' + (wild ? ' + ' + wild + ' 个通配符' : '') + '）')
      : '（不限制）';
  }
  const wildEl = document.getElementById('editKeyModelWildcards_' + i);
  if(wildEl) wildEl.textContent = wild.length ? ('保留通配符：' + wild.join(', ')) : '';
}
function updateKeyAccountSummary(i){
  const row = API_KEY_ROWS[i];
  if(!row) return;
  const n = (row.accounts || []).length;
  const el = document.getElementById('editKeyAccountsSummary_' + i);
  if(el) el.textContent = n ? ('（已选 ' + n + ' 个账号）') : '（不限制）';
}
function toggleKeyPicker(kind, i){
  const id = kind === 'model' ? 'editKeyModelPicker_' + i : 'editKeyAccountPicker_' + i;
  const el = document.getElementById(id);
  if(el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
async function loadKeyModelCatalog(){
  if(Array.isArray(window.KEY_MODEL_CATALOG) && window.KEY_MODEL_CATALOG.length){
    return window.KEY_MODEL_CATALOG;
  }
  const out = [];
  const seen = new Set();
  const add = function(list){
    for(const m of (list || [])){
      const id = String((m && m.id) || '');
      if(id && !seen.has(id)){ seen.add(id); out.push(m); }
    }
  };
  // The unscoped listing is the widest catalogue the gateway advertises; the
  // per-realm calls fill in anything it omits.
  try { const r = await getJSON('/v1/models'); add(r.data); } catch(e) { /* keep going */ }
  for(const realm of ['intl', 'cn']){
    try {
      const r = await getJSON('/v1/models?realm=' + realm);
      add(r.data);
    } catch(e) { /* one realm failing must not blank the picker */ }
  }
  if(!out.length && Array.isArray(window.MODELS_DATA)) out.push(...window.MODELS_DATA);
  window.KEY_MODEL_CATALOG = out;
  return out;
}
async function renderKeyPickers(i){
  const row = API_KEY_ROWS[i];
  if(!row) return;
  const modelList = document.getElementById('editKeyModelList_' + i);
  if(modelList){
    modelList.innerHTML = '<div style="font-size:12px;color:var(--dim);padding:4px">正在加载模型清单…</div>';
    let models = [];
    try { models = await loadKeyModelCatalog(); } catch(e) { models = []; }
    // The all-realm listing is the primary source; fall back to the models tab
    // cache so the picker is never blank just because that one call failed.
    if(!(models || []).length && Array.isArray(window.MODELS_DATA)){
      models = window.MODELS_DATA;
    }
    if(!(models || []).length){
      modelList.innerHTML = '<div style="font-size:12px;color:var(--warn);padding:4px">模型清单为空或加载失败，<a href="javascript:void(0)" onclick="renderKeyPickers(' + i + ')">重试</a></div>';
    } else {
      modelList.innerHTML = models.map(m => {
        const id = String((m && m.id) || '');
        if(!id) return '';
        const checked = keyModelExact(row).indexOf(id) >= 0 ? ' checked' : '';
        return '<label class="key-pick-row" data-search="' + esc(id.toLowerCase()) + '" style="display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 4px"><input type="checkbox" value="' + esc(id) + '"' + checked + ' onchange="toggleKeyModel(' + i + ',this)">' + esc(id) + '</label>';
      }).join('');
    }
    updateKeyModelSummary(i);
  }
  const accountList = document.getElementById('editKeyAccountList_' + i);
  if(accountList){
    if(!(window.ACCOUNTS || []).length){
      try { await loadAccounts(); } catch(e) { /* keep the empty hint */ }
    }
    const accts = window.ACCOUNTS || [];
    accountList.innerHTML = accts.map(a => {
      const uid = String((a && a.uid) || '');
      if(!uid) return '';
      const note = String(a.note || '').trim();
      const label = (a.nickname || uid.slice(0, 8)) + (note ? ' · ' + note : '') + ' · ' + uid.slice(0, 8) + (a.realm ? ' · ' + a.realm : '');
      const checked = (row.accounts || []).indexOf(uid) >= 0 ? ' checked' : '';
      return '<label class="key-pick-row" data-search="' + esc((label + ' ' + uid).toLowerCase()) + '" style="display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 4px"><input type="checkbox" value="' + esc(uid) + '"' + checked + ' onchange="toggleKeyAccount(' + i + ',this)">' + esc(label) + '</label>';
    }).join('') || '<div style="font-size:12px;color:var(--warn);padding:4px">账号列表为空或加载失败，<a href="javascript:void(0)" onclick="renderKeyPickers(' + i + ')">重试</a></div>';
    updateKeyAccountSummary(i);
  }
}
function toggleKeyModel(i, el){
  const row = API_KEY_ROWS[i];
  if(!row) return;
  const exact = new Set(keyModelExact(row));
  if(el.checked) exact.add(el.value); else exact.delete(el.value);
  row.models = keyModelWildcards(row).concat(Array.from(exact).sort());
  updateKeyModelSummary(i);
}
function toggleKeyAccount(i, el){
  const row = API_KEY_ROWS[i];
  if(!row) return;
  const set = new Set(row.accounts || []);
  if(el.checked) set.add(el.value); else set.delete(el.value);
  row.accounts = Array.from(set).sort();
  updateKeyAccountSummary(i);
}
function setKeyModelsAll(i, on){
  const list = document.getElementById('editKeyModelList_' + i);
  const row = API_KEY_ROWS[i];
  if(!list || !row) return;
  list.querySelectorAll('input[type=checkbox]').forEach(el => { el.checked = on; });
  const exact = on
    ? Array.from(list.querySelectorAll('input[type=checkbox]')).map(el => el.value).sort()
    : [];
  row.models = keyModelWildcards(row).concat(exact);
  updateKeyModelSummary(i);
}
function setKeyAccountsAll(i, on){
  const list = document.getElementById('editKeyAccountList_' + i);
  const row = API_KEY_ROWS[i];
  if(!list || !row) return;
  list.querySelectorAll('input[type=checkbox]').forEach(el => { el.checked = on; });
  row.accounts = on
    ? Array.from(list.querySelectorAll('input[type=checkbox]')).map(el => el.value).sort()
    : [];
  updateKeyAccountSummary(i);
}
function filterKeyModelPicker(i){
  const input = document.getElementById('editKeyModelSearch_' + i);
  const list = document.getElementById('editKeyModelList_' + i);
  if(!list) return;
  const q = String((input && input.value) || '').trim().toLowerCase();
  list.querySelectorAll('.key-pick-row').forEach(el => {
    el.style.display = !q || (el.getAttribute('data-search') || '').indexOf(q) >= 0 ? 'flex' : 'none';
  });
}
function filterKeyAccountPicker(i){
  const input = document.getElementById('editKeyAccountSearch_' + i);
  const list = document.getElementById('editKeyAccountList_' + i);
  if(!list) return;
  const q = String((input && input.value) || '').trim().toLowerCase();
  list.querySelectorAll('.key-pick-row').forEach(el => {
    el.style.display = !q || (el.getAttribute('data-search') || '').indexOf(q) >= 0 ? 'flex' : 'none';
  });
}

function openEditKey(index){
  if(!API_KEY_ROWS[index]) return;
  API_KEY_ROWS[index]._editing = true;
  renderKeyRows();
}

function cancelEditKey(index){
  if(!API_KEY_ROWS[index]) return;
  if(!API_KEY_ROWS[index].id && !API_KEY_ROWS[index].masked){
    API_KEY_ROWS.splice(index, 1);
  } else {
    API_KEY_ROWS[index]._editing = false;
  }
  renderKeyRows();
}

function generateKeyForEdit(index){
  const el = document.getElementById('editKeyValue_' + index);
  if(el){
    el.value = randomKeyValue();
  }
}

async function saveSingleKey(index, btn){
  const row = API_KEY_ROWS[index];
  if(!row) return;
  const nameInput = document.getElementById('editKeyName_' + index);
  const realmSelect = document.getElementById('editKeyRealm_' + index);
  const keyInput = document.getElementById('editKeyValue_' + index);
    const concInput = document.getElementById('editKeyConc_' + index);

  const name = nameInput ? nameInput.value.trim() : (row.name || '');
  const realm = realmSelect ? realmSelect.value : (row.realm || '');
  const keyVal = keyInput ? keyInput.value.trim() : (row.key || '');

  if(!keyVal && !row.masked){
    toast('API Key 不能为空', 'warn');
    return;
  }

  row.name = name || '未命名';
  row.realm = realm;
  row.models = Array.isArray(row.models) ? row.models.slice() : [];
  row.accounts = Array.isArray(row.accounts) ? row.accounts.slice() : [];
    row.concurrency_limit = Math.max(0, parseInt((concInput ? concInput.value : row.concurrency_limit) || 0, 10) || 0);
  if(keyVal) row.key = keyVal;
  row._editing = false;

  if(btn) btn.disabled = true;
  try {
    if(!await saveApiKeys()) return;
    toast('API Key [' + row.name + '] 已保存', 'ok');
  } catch(e){
    toast('保存失败: ' + e.message, 'bad');
  }
}

async function toggleKeyRow(index){
  const row = API_KEY_ROWS[index];
  if(!row) return;
  row.enabled = !row.enabled;
  try {
    if(!await saveApiKeys()){
      // The save was rejected; put the switch back so the row does not lie.
      row.enabled = !row.enabled;
      renderKeyRows();
      return;
    }
    toast(row.enabled ? 'Key [' + row.name + '] 已启用' : 'Key [' + row.name + '] 已禁用', 'ok');
  } catch(e){
    row.enabled = !row.enabled;
    renderKeyRows();
    toast('操作失败: ' + e.message, 'bad');
  }
}

async function removeKeyRow(index){
  const row = API_KEY_ROWS[index];
  if(!row) return;
  if(!confirm('确定删除 API Key [' + (row.name || '未命名') + '] 吗？密钥会被抹掉且无法恢复；看板里它已经产生的历史用量仍会保留这个名字。')) return;
  if(row.id && DELETED_KEY_IDS.indexOf(row.id) === -1) DELETED_KEY_IDS.push(row.id);
  API_KEY_ROWS.splice(index, 1);
  try {
    if(!await saveApiKeys()){
      // The server kept the key; drop the pending delete and resync the list
      // so the row comes back instead of lingering as a phantom.
      DELETED_KEY_IDS = DELETED_KEY_IDS.filter(id => id !== row.id);
      await loadSettings();
      return;
    }
    toast('已删除 API Key', 'ok');
  } catch(e){
    toast('删除失败: ' + e.message, 'bad');
  }
}

function addApiKeyRow(){
  API_KEY_ROWS.push({
    id: '',
    name: '',
    key: randomKeyValue(),
    realm: '',
    models: [],
      concurrency_limit: 0,
    enabled: true,
    masked: '',
    _editing: true
  });
  renderKeyRows();
  setTimeout(() => {
    const el = document.getElementById('editKeyName_' + (API_KEY_ROWS.length - 1));
    if(el) el.focus();
  }, 50);
}
/* Copy the key in a row, fetching the stored value when the field is blank
   (the panel only ever displays a masked key).

   Safari ties navigator.clipboard to the click's transient activation: an
   `await` before the write drops it and the promise rejects with
   NotAllowedError ("... not allowed by the user agent ..."). Chrome is looser
   about "recent activation", which is why only Safari fails here. So copy
   synchronously when the value is already in hand, and when it has to be
   fetched hand the plaintext to the clipboard as a promise inside a
   ClipboardItem -- the one asynchronous copy form Safari accepts. */
async function copyKeyRow(index){
  const row = API_KEY_ROWS[index];
  if(!row) return;
  const btn = document.getElementById('copyBtn' + index);
  const markCopied = () => {
    if(!btn) return;
    const old = btn.textContent;
    btn.textContent = '已复制';
    setTimeout(() => { btn.textContent = old; }, 1600);
  };
  const value = (row.key || '').trim();
  try {
    if(value){
      // Already in hand: copy without yielding, keeping the click activation.
      await writeClipboard(value);
      markCopied();
      toast('已复制到剪贴板', 'ok');
      return;
    }
    if(!row.id){
      toast('这一行还没有 Key，点「随机生成」或直接填写', 'warn');
      return;
    }
    const reveal = () => getJSON('/settings/reveal?id=' + encodeURIComponent(row.id))
      .then(d => (d.key || '').trim());
    if(window.ClipboardItem && navigator.clipboard && window.isSecureContext){
      // write() is called synchronously inside the click handler; the plaintext
      // arrives later through the item's promise.
      const item = new ClipboardItem({
        'text/plain': reveal().then(k => {
          if(!k) throw new Error('这一行还没有 Key');
          return new Blob([k], { type: 'text/plain' });
        }),
      });
      await navigator.clipboard.write([item]);
    } else {
      // Older engines / insecure context: fetch first, then the textarea path.
      const k = await reveal();
      if(!k){
        toast('这一行还没有 Key，点「随机生成」或直接填写', 'warn');
        return;
      }
      await writeClipboard(k);
    }
    markCopied();
    toast('已复制到剪贴板', 'ok');
  } catch(e) {
    toast('复制失败: ' + e.message, 'bad');
  }
}

async function writeClipboard(text){
  // navigator.clipboard needs a secure context; plain http on a LAN address
  // does not qualify, so fall back to a temporary textarea.
  if(navigator.clipboard && window.isSecureContext){
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, area.value.length);
  const ok = document.execCommand('copy');
  document.body.removeChild(area);
  if(!ok) throw new Error('浏览器拒绝了复制操作');
}

/* Save the whole visible list, plus the ids the user explicitly removed.
   Returns true when the server accepted the save.

   The submit is an upsert: the server retires only the ids named in
   `deleted_api_key_ids` and leaves every other stored key alone. That is what
   keeps a stale or incomplete list from wiping keys the user never removed,
   which is how "adding a new key" used to lose the old ones. */
async function saveApiKeys(btn){
  const payload = API_KEY_ROWS
    .filter(row => !row.id || DELETED_KEY_IDS.indexOf(row.id) === -1)
    .map(row => ({
      id: row.id || '',
      name: row.name || '',
      realm: row.realm || '',
      models: row.models || [],
      accounts: row.accounts || [],
        concurrency_limit: parseInt(row.concurrency_limit || 0, 10) || 0,
      enabled: row.enabled !== false,
      // Blank means "keep the stored key", which the server honours per row.
      key: (row.key || '').trim(),
    }));
  if(API_KEY_ROWS.some(row => !row.masked && !row.id && !(row.key || '').trim())){
    toast('新增的行还没有填写 Key', 'warn');
    return false;
  }
  // Several callers save without going through a button (saveSingleKey,
  // toggleKeyRow, removeKeyRow), so a missing button must not abort the save.
  if(btn) btn.disabled = true;
  try {
    await postJSON('/settings/save', {
      api_keys: payload,
      deleted_api_key_ids: DELETED_KEY_IDS.slice(),
    });
    DELETED_KEY_IDS = [];
    toast('已保存 ' + payload.length + ' 个 Key', 'ok');
    // Reload before returning: the next edit must start from the ids the
    // server just minted, or a quick second save would resubmit the rows with
    // empty ids and duplicate them.
    await loadSettings();
    return true;
  } catch(e) {
    toast('保存失败: ' + e.message, 'bad');
    return false;
  } finally {
    if(btn) btn.disabled = false;
  }
}

let PROXY_SLOTS = [];
/* 编辑器里有未保存改动时为 true（issue #79）。
 *
 * 刷新槽位是「拉服务端列表 → 整体替换 → 重绘整张表」，而「+ 添加槽位」只是把
 * 一行 push 进本地列表、服务端并不知道它存在；loadAccounts() 每 15 秒会顺带
 * 刷新一次槽位，于是刚加的那行（以及改了一半的已有行）会被服务端的旧列表顶掉。
 * 置位期间跳过刷新，保存成功后清零。 */
let SLOTS_DIRTY = false;
let SLOT_DISCOVER = [];

function slotSelectHtml(a){
  const current = a.proxySlot || '';
  // A legacy per-account proxy URL still routes traffic while no slot is
  // bound. Surface it instead of pretending the account is direct.
  const legacy = (!current && a.proxy) ? String(a.proxy) : '';
  const legacyLabel = legacy.length > 28 ? legacy.slice(0, 25) + '...' : legacy;
  const opts = [];
  if(legacy){
    opts.push('<option value="__legacy__" selected>旧代理：' + esc(legacyLabel) + '</option>');
    opts.push('<option value="">直连（清除旧代理）</option>');
  } else {
    opts.push('<option value=""' + (current ? '' : ' selected') + '>直连</option>');
  }
  opts.push.apply(opts, PROXY_SLOTS.map(s =>
    '<option value="' + esc(s.id) + '"' + (s.id === current ? ' selected' : '') + '>'
    + esc(s.label || s.name || s.id) + (s.enabled === false ? '（停用）' : '') + '</option>'));
  const uidAttr = esc(String(a.uid || '').replace(/[^\w.@-]/g, ''));
  return '<select class="slot-select" onchange="setAccountSlot(&quot;' + uidAttr + '&quot;, this.value, this)">'
    + opts.join('') + '</select>';
}

async function setAccountSlot(uid, slotId, el){
  if(slotId === '__legacy__') return;
  if(el) el.disabled = true;
  try{
    await postJSON('/accounts/set', {uid: uid, proxySlot: slotId});
    toast('出口已更新', 'ok');
    await loadAccounts();
    await loadProxySlots();
  }catch(e){
    toast('出口更新失败: ' + e.message, 'bad');
  }finally{
    if(el) el.disabled = false;
  }
}

async function loadProxySlots(force){
  // 编辑器有未保存改动时不动它：轮询与「切到设置页」都不该覆盖正在填的内容。
  if(SLOTS_DIRTY && !force) return;
  try{
    const r = await getJSON('/proxy/slots');
    PROXY_SLOTS = r.slots || [];
    renderProxySlots();
  }catch(e){
    // Panel not logged in yet; actions on the settings page surface errors.
  }
}

/* 标题旁的状态提示。单独抽出来，是因为标记「未保存」时只能更新这段文字，
 * 不能重绘表格——重绘会让正在输入的那个框失焦。 */
function renderSlotState(){
  const stateEl = document.getElementById('slotState');
  if(!stateEl) return;
  const parts = [];
  if(PROXY_SLOTS.length) parts.push(PROXY_SLOTS.length + ' 个');
  if(SLOTS_DIRTY) parts.push('未保存');
  stateEl.textContent = parts.length ? ('（' + parts.join(' · ') + '）') : '';
  stateEl.style.color = SLOTS_DIRTY ? 'var(--warn)' : '';
}

function markSlotsDirty(){
  if(SLOTS_DIRTY) return;
  SLOTS_DIRTY = true;
  renderSlotState();
}

/* 出口信息的展示口径，与服务端 wb_ipintel 保持一致：hosting 地址算机房，
   其余算住宅；国家名由查询服务直接给中文。 */
const IP_TYPE_LABELS = {residential: '住宅', datacenter: '机房'};

function ipTypeLabel(t){ return IP_TYPE_LABELS[t] || ''; }

/* 默认名称：国家 + 类型（如「美国 住宅」）。没有国家就不自动命名——只有
   「住宅」两个字区分不了不同槽位，此时回退显示槽位 id。 */
function autoSlotName(c){
  const where = String((c && c.country) || '').trim();
  if(!where) return '';
  const kind = ipTypeLabel(c && c.ip_type);
  return kind ? (where + ' ' + kind) : where;
}

/* 保存时要把探测到的出口字段一起送回，否则一次保存就把它们抹掉了。 */
function slotPayload(){
  return PROXY_SLOTS.map(s => ({
    id: s.id || '', name: s.name || '', url: (s.url || '').trim(),
    enabled: s.enabled !== false,
    ip: s.ip || '', country: s.country || '', country_code: s.country_code || '',
    ip_type: s.ip_type || '', isp: s.isp || '', asn: s.asn || '',
    probed_at: s.probed_at || 0,
  }));
}

function slotExitHtml(s){
  if(!s.ip) return '<span style="color:var(--dim-light)">未探测</span>';
  const kind = ipTypeLabel(s.ip_type);
  const badge = kind
    ? '<span class="badge ' + (kind === '住宅' ? 's' : '') + '" style="font-size:11px">' + kind + '</span>'
    : '';
  const where = [s.country ? esc(s.country) : '', badge].filter(Boolean).join(' ');
  const tip = [s.isp, s.asn].filter(Boolean).join(' · ');
  return '<div class="mono" style="font-size:12px">' + esc(s.ip) + '</div>'
    + '<div style="font-size:12px;color:var(--dim);margin-top:2px"'
    + (tip ? ' title="' + esc(tip) + '"' : '') + '>'
    + (where || '<span style="color:var(--dim-light)">国家未知</span>') + '</div>';
}

function renderProxySlots(){
  const box = document.getElementById('slotList');
  if(!box) return;
  renderSlotState();
  if(!PROXY_SLOTS.length){
    box.innerHTML = '<div class="hint" style="color:var(--dim)">还没有代理槽。点击「自动发现 mihomo 端口」或「+ 添加槽位」。</div>';
    return;
  }
  box.innerHTML = '<div class="table-wrap"><table class="data-cards"><thead><tr>'
    + '<th style="width:150px">名称</th>'
    + '<th>代理地址</th>'
    + '<th style="width:150px">出口</th>'
    + '<th style="width:90px;text-align:center">启用</th>'
    + '<th style="width:90px;text-align:center">绑定账号</th>'
    + '<th style="width:190px;text-align:center">操作</th>'
    + '</tr></thead><tbody>'
    + PROXY_SLOTS.map((s, i) =>
        '<tr>'
        + '<td data-label="名称"><input value="' + esc(s.name || '') + '" placeholder="' + esc(s.label || '') + '" oninput="PROXY_SLOTS[' + i + '].name=this.value; markSlotsDirty()" class="slot-input"></td>'
        + '<td data-label="代理地址"><input value="' + esc(s.url || '') + '" oninput="PROXY_SLOTS[' + i + '].url=this.value; markSlotsDirty()" class="slot-input mono"></td>'
        + '<td data-label="出口">' + slotExitHtml(s) + '</td>'
        + '<td style="text-align:center" data-label="启用"><input type="checkbox" ' + (s.enabled === false ? '' : 'checked')
        +   ' onchange="PROXY_SLOTS[' + i + '].enabled=this.checked; markSlotsDirty()"></td>'
        + '<td style="text-align:center" data-label="绑定账号">' + (s.bound || 0) + '</td>'
        + '<td style="text-align:center;white-space:nowrap" data-label="">'
        +   '<button class="sec mini" onclick="testProxySlot(' + i + ', this)">测试</button> '
        +   '<button class="danger mini" onclick="removeProxySlot(' + i + ')">删除</button>'
        + '</td></tr>'
      ).join('')
    + '</tbody></table></div>'
    + '<div class="legend"><span>「绑定账号」只统计已启用账号；停用账号会自动释放槽位，重新启用后需重新绑定。在网关页账号表的「出口」下拉中调整绑定。名称留空时按出口自动显示「国家 类型」，点「测试」会补全出口信息并据此命名。</span></div>';
  applyTableSort('slotList');
}

function addProxySlotRow(){
  SLOTS_DIRTY = true;
  // 名称留空：探测到出口后按「国家 类型」自动命名，填过就按填的显示。
  PROXY_SLOTS.push({id: '', name: '', url: '', enabled: true, bound: 0});
  renderProxySlots();
}

function removeProxySlot(index){
  const s = PROXY_SLOTS[index];
  if(!s) return;
  if((s.bound || 0) > 0 && !confirm('该槽位被 ' + s.bound + ' 个账号绑定，删除后它们将回退直连。继续？')) return;
  SLOTS_DIRTY = true;
  PROXY_SLOTS.splice(index, 1);
  renderProxySlots();
}

async function saveProxySlots(btn){
  if(btn) btn.disabled = true;
  try{
      const r = await postJSON('/proxy/slots/save', {slots: slotPayload()});
      PROXY_SLOTS = r.slots || [];
      SLOTS_DIRTY = false;
      renderProxySlots();
      await loadAccounts();
      toast('已保存 ' + PROXY_SLOTS.length + ' 个代理槽', 'ok');
  }catch(e){
    toast('保存失败: ' + e.message, 'bad');
  }finally{
    if(btn) btn.disabled = false;
  }
}

async function testProxySlot(index, btn){
  const s = PROXY_SLOTS[index];
  if(!s || !s.url){ toast('槽位还没有填写代理地址', 'warn'); return; }
  if(btn){ btn.disabled = true; btn.textContent = '测试中...'; }
  try{
    let id = s.id;
    if(!id){
      const r = await postJSON('/proxy/slots/save', {slots: slotPayload()});
      PROXY_SLOTS = r.slots || [];
      SLOTS_DIRTY = false;
      renderProxySlots();
      id = (PROXY_SLOTS[index] || {}).id;
    }
    const r = await postJSON('/proxy/slots/test', {id: id});
    if(r.ok){
      // 服务端已把出口信息写进槽位，这里只把这一行同步过来，不整表重载——
      // 其他行里还没保存的输入都还在 PROXY_SLOTS 里，重绘不会丢。
      const row = PROXY_SLOTS[index];
      if(row && r.slot){
        ['ip', 'country', 'country_code', 'ip_type', 'isp', 'asn', 'probed_at'].forEach(k => {
          if(r.slot[k] !== undefined) row[k] = r.slot[k];
        });
        if(r.slot.name) row.name = r.slot.name;
        row.label = row.name || autoSlotName(row) || row.id;
        renderProxySlots();
      }
      const where = [r.country, ipTypeLabel(r.ip_type)].filter(Boolean).join(' ');
      toast('出口 ' + r.exit_ip + (where ? ' · ' + where : '') + '（' + r.latency_ms + 'ms）', 'ok');
    }else{
      toast('测试失败: ' + (r.error || 'unknown'), 'bad');
    }
  }catch(e){
    toast('测试失败: ' + e.message, 'bad');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '测试'; }
  }
}

async function discoverProxySlots(btn){
  if(btn){ btn.disabled = true; btn.textContent = '探测中...'; }
  try{
    const r = await postJSON('/proxy/discover', {});
    SLOT_DISCOVER = r.candidates || [];
    renderDiscover();
    const ok = SLOT_DISCOVER.filter(c => c.reachable).length;
    toast('发现 ' + ok + ' 个可用出口', ok ? 'ok' : 'warn');
  }catch(e){
    toast('自动发现失败: ' + e.message, 'bad');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '自动发现 mihomo 端口'; }
  }
}

function renderDiscover(){
  const box = document.getElementById('slotDiscover');
  if(!box) return;
  if(!SLOT_DISCOVER.length){ box.innerHTML = ''; return; }
  box.innerHTML = '<div style="margin-top:14px"><div style="font-size:12px;color:var(--dim);margin-bottom:8px">'
    + '勾选要导入为槽位的出口：</div>'
    + SLOT_DISCOVER.map((c, i) =>
        '<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px">'
        + '<input type="checkbox" ' + (c.reachable ? 'checked' : 'disabled') + ' data-idx="' + i + '">'
        + '<span class="mono">' + esc(c.url) + '</span>'
        + '<span style="color:' + (c.reachable ? 'var(--accent2)' : 'var(--bad)') + '">'
        + (c.reachable
            ? ('出口 ' + esc(c.exit_ip)
               + (autoSlotName(c) ? ' · ' + esc(autoSlotName(c)) : '')
               + ' · ' + c.latency_ms + 'ms')
            : '不可达') + '</span>'
        + '</label>').join('')
    + '<button class="sec" onclick="importDiscovered()" style="margin-top:8px">导入勾选的出口</button></div>';
}

function importDiscovered(){
  const box = document.getElementById('slotDiscover');
  if(!box) return;
  const picked = Array.from(box.querySelectorAll('input[type=checkbox]:checked')).map(el => SLOT_DISCOVER[+el.dataset.idx]);
  if(!picked.length){ toast('没有勾选任何出口', 'warn'); return; }
  picked.forEach(c => {
    if(PROXY_SLOTS.some(s => s.url === c.url)) return;
    // 导入时就把探测到的出口信息一起带上。名称留空：空名称 = 「按出口自动命名」，
    // 标签由 country/ip_type 每次现算，所以出口换了名字跟着换；写进 name 就成了
    // 用户名称，会被 slot_label() 永久优先，出口变了也还显示旧的国家。
    PROXY_SLOTS.push({
      id: '', name: '', url: c.url, enabled: true, bound: 0,
      ip: c.exit_ip || '', country: c.country || '', country_code: c.country_code || '',
      ip_type: c.ip_type || '', isp: c.isp || '', asn: c.asn || '',
      probed_at: Math.floor(Date.now() / 1000),
    });
  });
  renderProxySlots();
  toast('已加入 ' + picked.length + ' 个槽位，记得点「保存槽位」', 'ok');
}

async function autoAssignSlots(){
  // Only fills in accounts that have no exit yet: an account that is already
  // bound keeps its slot, so this is not a rebalancer.
  const unbound = (window.ACCOUNTS || []).filter(a => a.enabled && !a.proxySlot);
  if(!unbound.length){ toast('所有已启用账号都已绑定代理出口', 'ok'); return; }
  const slots = PROXY_SLOTS.filter(s => s.enabled !== false);
  if(!slots.length){ toast('没有启用的代理槽，请先在「设置 → 账号代理槽」添加并保存', 'warn'); return; }
  let i = 0;
  for(const a of unbound){
    const slot = slots[i % slots.length];
    i++;
    try{ await postJSON('/accounts/set', {uid: a.uid, proxySlot: slot.id}); }catch(e){}
  }
  await loadAccounts();
  await loadProxySlots();
  toast('已为 ' + unbound.length + ' 个未绑定账号分配代理出口', 'ok');
}

/* 智能体配置只在「浏览器和网关进程同一台机器」时成立（issue #246）：服务端 /
   Docker / OpenWrt 部署下看板是远程打开的，一键配置改的是容器或路由器里的
   配置目录，到不了用户自己的电脑。服务端据此回 enabled:false，这里把入口整个
   撤掉；判定失败（网络抖动等）保持可见——本机用户不该因此丢掉这个入口。 */
let AGENTS_AVAILABLE = true;
async function loadAgentsAvailability(){
  try {
    const r = await getJSON('/agents/available');
    if(r && r.enabled === false){
      AGENTS_AVAILABLE = false;
      const btn = document.getElementById('btnNavAgents');
      if(btn) btn.style.display = 'none';
    }
  } catch(e){}
}

function switchMainTab(tab){
  // 入口被撤掉后（?tab=agents 的书签、上次停留的页签）退回网关页
  if(tab === 'agents' && !AGENTS_AVAILABLE) tab = 'gateway';
  // 被「顶部页签显示」收起来的页面同理：书签与上次停留的页签都不能把内容调出来，
  // 否则页面容器带着 hidden 被点亮，屏幕上一片空白。
  if(pageHidden(tab)) tab = firstVisiblePage();
  // 账号页被合并掉之后（设置里的「账号独立成一个页签」关闭，默认），
  // ?tab=accounts 的书签与上次停留的页签都退回总览页——区块就在那一页里。
  if(tab === 'accounts' && !_accountsSeparateTab) tab = window.__NEXT_UI__ ? 'overview' : 'gateway';
  if(!window.__NEXT_UI__ && tab === 'overview') tab = 'gateway';
  const prevTab = currentMainTab;
  currentMainTab = tab;
  syncConsoleContext(tab);
  // 从不轮询账号的页签切过来：立刻拉一次，不等下一轮 15 秒。
  if(PANEL_READY && accountsTabActive(tab) && !accountsTabActive(prevTab)) loadAccounts(true);
  // Remember the page across reloads. The URL is updated so the address bar
  // matches what is on screen and a copied link reopens the same page;
  // storage covers a plain reload and the ?key= link, which strips the
  // query string on load.
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    history.replaceState(null, '', url.toString());
  } catch(e){}
  try { localStorage.setItem(MAIN_TAB_STORE, tab); } catch(e){}
  const btnOverview = document.getElementById('btnNavOverview');
  const btnGateway = document.getElementById('btnNavGateway');
  const btnTasks = document.getElementById('btnNavTasks');
  const btnAccounts = document.getElementById('btnNavAccounts');
  const btnAnalytics = document.getElementById('btnNavAnalytics');
  const btnLogs = document.getElementById('btnNavLogs');
  const btnSettings = document.getElementById('btnNavSettings');
  const btnAgents = document.getElementById('btnNavAgents');
  const pageOverview = document.getElementById('pageOverview');
  const btnMedia = document.getElementById('btnNavMedia');
  const pageGateway = document.getElementById('pageGateway');
  const pageTasks = document.getElementById('pageTasks');
  const pageAccounts = document.getElementById('pageAccounts');
  const pageAnalytics = document.getElementById('pageAnalytics');
  const pageLogs = document.getElementById('pageLogs');
  const pageSettings = document.getElementById('pageSettings');
  const pageAgents = document.getElementById('pageAgents');
  const pageMedia = document.getElementById('pageMedia');
  const tabs = [
    ['overview', btnOverview, pageOverview],
    ['gateway', btnGateway, pageGateway],
    ['accounts', btnAccounts, pageAccounts],
    ['tasks', btnTasks, pageTasks],
    ['analytics', btnAnalytics, pageAnalytics],
    ['logs', btnLogs, pageLogs],
    ['settings', btnSettings, pageSettings],
    ['agents', btnAgents, pageAgents],
    ['media', btnMedia, pageMedia]
  ];
  tabs.forEach(([name, btn, page]) => {
    if(!page) return;
    const on = (name === tab);
    if(btn){
      btn.classList.toggle('active', on);
      // active 类只影响颜色，读屏软件不看它；aria-current 才是「当前页」的
      // 语义标记。两者必须在同一处一起更新，否则视觉与语义会分叉。
      if(on) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    }
    page.classList.toggle('active', on);
    // 每个页面各自按自己的区块重建侧栏；非当前页的区块变化在切过来时补上
    if(on) initPageNav(page);
  });
  if(!window.__NEXT_UI__ && tab === 'gateway') applyConsoleView('overview');
  if(tab === 'tasks'){ loadGrowthTasks(); }
  if(tab === 'accounts' || (!_accountsSeparateTab && tab === 'gateway')){ loadActivityBoard(); }
  if(window.__NEXT_UI__ && !_accountsSeparateTab && tab === 'overview'){ loadActivityBoard(); }
  if(tab === 'analytics'){ loadAnalytics(); loadAnalyticsMatrix(); }
  if(tab === 'settings'){ loadSettings(); loadProxySlots(); }
  if(tab === 'agents'){ loadAgents(); }
  if(tab === 'media'){ loadMediaPage(); }
  if(tab === 'logs'){
    startLogPolling();
    fetchNewLogs(true);
  } else {
    stopLogPolling();
  }
  restorePageNavHash();
}

/* ---- 智能体一键配置模块 ----
   后端接口（wb_agents.py / wb_proxy.py）：
     GET  /agents          → {clients:[...], keys:[...], models:[...], gateway:{base_url}}
     POST /agents/apply    {client, client_id, base_url, key_id, model, models} → {client, label, applied_at, base_url, model, files, warnings}
     POST /agents/restore  {client, client_id}                                 → {client, label, restored, deleted}
   每个 client: {id, label, desc, protocol('anthropic'|'openai'), config_paths:[...],
                 installed, configured, applied:{at, base_url, model, files, external_change}}
   这里只用 getJSON/postJSON/toast/esc，接口字段缺省时尽量降级展示而不是报错。 */
let AGENTS_DATA = null;
let AGENT_MODELS = [];
let AGENT_KEYS = [];
let AGENTS_LOADING = false;

function agentClients(){
  const d = AGENTS_DATA || {};
  return d.clients || d.agents || [];
}

async function loadAgents(showToast){
  if(AGENTS_LOADING) return;
  AGENTS_LOADING = true;
  const state = document.getElementById('agentDetectState');
  if(state){ state.textContent = '(检测中...)'; state.style.color = 'var(--dim)'; }
  try {
    const data = await getJSON('/agents');
    AGENTS_DATA = data || {};
    AGENT_MODELS = AGENTS_DATA.models || [];
    AGENT_KEYS = AGENTS_DATA.keys || AGENTS_DATA.api_keys || [];
    renderAgentConnForm();
    renderAgentCards();
    renderAgentManualUrls();
    const n = agentClients().filter(c => c.installed || (c.status && c.status !== 'missing')).length;
    if(state){
      // 计数必须按卡片自己的判定来数（agentStatusBadge 认 installed / detected），
      // 否则会出现「5 张卡片、标题 4 个」的错位（issue #250）：卡片列表是全部
      // 支持的客户端，检测到的只是其中一部分，两个数字都写出来。
      const clients = agentClients();
      const found = clients.filter(c => c.installed || c.detected).length;
      state.textContent = clients.length > found
        ? '(已检测到 ' + found + ' / 共 ' + clients.length + ' 个)'
        : '(已检测到 ' + found + ' 个)';
      state.style.color = found ? 'var(--accent2)' : 'var(--dim)';
    }
    if(showToast) toast('客户端检测完成', 'ok');
  } catch(e) {
    if(state){ state.textContent = '(加载失败)'; state.style.color = 'var(--bad)'; }
    if(!isAuthError(e)) toast('智能体列表加载失败: ' + e.message, 'bad');
  } finally {
    AGENTS_LOADING = false;
  }
}

function renderAgentConnForm(){
  // 网关地址：只在用户还没改过时填默认值，避免刷新把用户编辑冲掉。
  const baseInput = document.getElementById('agentBaseUrl');
  if(baseInput && !baseInput.dataset.touched){
    const def = (AGENTS_DATA && AGENTS_DATA.gateway && AGENTS_DATA.gateway.base_url)
      || (location.origin + '/v1');
    baseInput.value = def;
  }
  const keySel = document.getElementById('agentKeySelect');
  if(keySel){
    const prev = keySel.value;
    let html = '<option value="">全局 API Key</option>';
    AGENT_KEYS.forEach(k => {
      const id = k.id != null ? String(k.id) : '';
      const name = k.name || id || 'Key';
      html += '<option value="' + esc(id) + '"' + (k.enabled === false ? ' disabled' : '')
        + '>' + esc(name) + (k.realm ? ' (' + esc(k.realm) + ')' : '') + '</option>';
    });
    keySel.innerHTML = html;
    if(prev && keySel.querySelector('option[value="' + prev.replace(/"/g, '\\"') + '"]')) keySel.value = prev;
  }
  const modelSel = document.getElementById('agentModelSelect');
  if(modelSel){
    const prev = modelSel.value;
    let html = '<option value="">(不指定模型)</option>';
    AGENT_MODELS.forEach(m => {
      const id = String((typeof m === 'string' ? m : (m.id || m.model || '')) || '');
      if(!id) return;
      // 只列「网关模型清单」里勾选的模型：一键配置只写这份清单，下拉里出现
      // 没勾选的模型会让用户以为它也会被写进去。
      if(!isModelPicked(id)) return;
      const cw = (typeof m === 'object' && m) ? (m.context_window || m.contextWindow || 0) : 0;
      const label = id + (cw ? ' (' + fmt(cw) + ' ctx)' : '');
      html += '<option value="' + esc(id) + '">' + esc(label) + '</option>';
    });
    modelSel.innerHTML = html;
    if(prev && modelSel.querySelector('option[value="' + prev.replace(/"/g, '\\"') + '"]')) modelSel.value = prev;
  }
}

function renderAgentManualUrls(){
  const origin = location.origin;
  const openAIEl = document.getElementById('agentOpenAIUrl');
  const anthEl = document.getElementById('agentAnthropicUrl');
  if(openAIEl) openAIEl.textContent = origin + '/v1';
  if(anthEl) anthEl.textContent = origin; // Anthropic 客户端的 Base URL 不带 /v1 前缀
}

async function copyAgentUrl(elId, btn){
  const el = document.getElementById(elId);
  const text = el ? el.textContent : '';
  if(!text){ toast('没有可复制的内容', 'warn'); return; }
  try {
    await writeClipboard(text);
    if(btn){
      const old = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(() => { btn.textContent = old; }, 1600);
    }
    toast('已复制到剪贴板', 'ok');
  } catch(e) {
    toast('复制失败: ' + e.message, 'bad');
  }
}

function agentProtocolLabel(p){
  return p === 'anthropic' ? 'Anthropic Messages' : 'OpenAI 兼容';
}

function agentStatusBadge(c){
  if(c.applied) return '<span class="badge ok">已配置</span>';
  if(c.installed || c.detected) return '<span class="badge s">已检测到</span>';
  return '<span class="badge off">未检测到</span>';
}

function renderAgentCards(){
  const grid = document.getElementById('agentCardGrid');
  if(!grid) return;
  const clients = agentClients();
  if(!clients.length){
    grid.innerHTML = '<div style="font-size:13px;color:var(--dim);padding:18px;border:1px dashed var(--line);border-radius:10px">'
      + '暂未获取到客户端列表，点右上角「刷新」重新检测。' + '</div>';
    return;
  }
  const cards = clients.map(c => {
    const id = c.id || '';
    const idAttr = esc(id);
    const name = esc(c.label || c.name || id);
    const desc = c.desc ? '<div style="font-size:12px;color:var(--dim);margin-top:4px">' + esc(c.desc) + '</div>' : '';
    const paths = (c.config_paths || (c.config_path ? [c.config_path] : []));
    const pathsHtml = paths.length
      ? '<div class="mono" style="font-size:11px;color:var(--dim);margin-top:8px;word-break:break-all">'
        + paths.map(p => esc(p)).join('<br>') + '</div>'
      : '';
    const applied = c.applied || null;
    let appliedHtml = '';
    let warnHtml = '';
    if(applied){
      let at = '-';
      if(applied.at){
        if(typeof applied.at === 'number'){
          const d = new Date(applied.at > 1e11 ? applied.at : applied.at * 1000);
          at = isNaN(d.getTime()) ? String(applied.at) : (d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0'));
        } else {
          at = esc(String(applied.at).replace('T', ' ').slice(0, 19));
        }
      }
      appliedHtml = '<div style="font-size:11px;color:var(--dim);margin-top:8px;line-height:1.7">'
        + '<div>应用时间: <span class="mono">' + at + '</span></div>'
        + '<div>base_url: <span class="mono">' + esc(applied.base_url || '-') + '</span></div>'
        + '<div>模型: <span class="mono">' + esc(applied.model || '(未指定)') + '</span></div>'
        + '</div>';
      if(applied.external_change){
        warnHtml = '<div class="badge warn" style="margin-top:8px" title="配置文件在应用之后被外部修改过">'
          + '检测到外部修改：还原将覆盖外部改动</div>';
      }
    }
    const applyLabel = applied ? '重新应用' : '一键配置';
    const notDetected = !(c.installed || c.detected);
    const btns = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'
      + '<button class="mini" onclick="applyAgent(&quot;' + idAttr + '&quot;, this)"' + (notDetected ? ' disabled title="未检测到该客户端"' : '') + '>' + applyLabel + '</button>'
      + (applied ? '<button class="danger mini" onclick="restoreAgent(&quot;' + idAttr + '&quot;, this)">还原原始配置</button>' : '')
      + '</div>';
    return '<div style="background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:6px">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">'
      + '<div style="font-weight:600;color:var(--fg);font-size:14px">' + name + '</div>'
      + agentStatusBadge(c) + '</div>'
      + '<div style="font-size:11px;color:var(--accent)">' + agentProtocolLabel(c.protocol) + '</div>'
      + desc
      + pathsHtml
      + appliedHtml
      + warnHtml
      + btns
      + '</div>';
  });
  grid.innerHTML = cards.join('');
}

function agentFindClient(id){
  return agentClients().find(c => String(c.id) === String(id)) || null;
}

async function applyAgent(id, btn){
  const client = agentFindClient(id);
  if(!client){ toast('未找到客户端: ' + id, 'bad'); return; }
  const baseInput = document.getElementById('agentBaseUrl');
  const keySel = document.getElementById('agentKeySelect');
  const modelSel = document.getElementById('agentModelSelect');
  const baseUrl = baseInput ? baseInput.value.trim() : '';
  if(!baseUrl){ toast('请先填写网关地址', 'warn'); return; }
  // 只把「网关模型清单」里勾选的模型写进客户端（与 AGENT_MODELS 取交集，避免
  // 把不在当前模型目录里的 id 也发上去）。一个都没勾就先别发请求：后端对 DSH
  // 这类客户端收到空列表会返回 400，这里给一句更明确的下一步提示。
  const pickedModels = (AGENT_MODELS || [])
    .map(m => String((typeof m === 'object' ? (m.id || m.model || '') : m) || ''))
    .filter(id => id && isModelPicked(id));
  // 只有把模型清单写进自身配置的客户端（DSH / OpenCode / Crush / ZCode，
  // 后端 /agents 的 model_embedding_clients 声明）才需要「至少勾一个」；
  // Claude Code / Codex 不读这份清单，别因为没勾模型就把它们的一键配置也挡掉。
  const embeddingClients = (AGENTS_DATA && AGENTS_DATA.model_embedding_clients) || [];
  const embedsModels = embeddingClients.map(String).indexOf(String(id)) !== -1;
  if(!pickedModels.length && embedsModels){
    toast('请先在「网关模型清单」勾选至少一个模型', 'warn');
    return;
  }
  if(client.applied && client.applied.external_change){
    if(!confirm('「' + (client.label || id) + '」的配置文件在应用后被外部修改过，重新应用将覆盖这些改动。确定继续吗？')) return;
  }
  if(btn){ btn.disabled = true; }
  try {
    const r = await postJSON('/agents/apply', {
      client: id,
      client_id: id,
      base_url: baseUrl,
      key_id: keySel ? keySel.value : '',
      model: modelSel ? modelSel.value : '',
      models: pickedModels
    });
    if(r && (r.ok === false || r.error)){
      toast('配置失败: ' + (r.message || (r.error && r.error.message) || '未知错误'), 'bad');
    } else {
      toast('已配置「' + (client.label || id) + '」，原配置已备份', 'ok');
    }
  } catch(e) {
    if(!isAuthError(e)) toast('配置失败: ' + e.message, 'bad');
  } finally {
    if(btn){ btn.disabled = false; }
    await loadAgents();
  }
}

async function restoreAgent(id, btn){
  const client = agentFindClient(id);
  const label = (client && (client.label || client.name)) || id;
  if(!confirm('确定还原「' + label + '」的原始配置吗？将恢复成一键配置之前的备份文件。')) return;
  if(btn){ btn.disabled = true; }
  try {
    const r = await postJSON('/agents/restore', {client: id, client_id: id});
    if(r && (r.ok === false || r.error)){
      toast('还原失败: ' + (r.message || (r.error && r.error.message) || '未知错误'), 'bad');
    } else {
      toast('已还原「' + label + '」的原始配置', 'ok');
    }
  } catch(e) {
    if(!isAuthError(e)) toast('还原失败: ' + e.message, 'bad');
  } finally {
    if(btn){ btn.disabled = false; }
    await loadAgents();
  }
}

// 网关地址输入框：用户改过后打标，刷新检测不再覆盖。
(function(){
  const bind = () => {
    const baseInput = document.getElementById('agentBaseUrl');
    if(baseInput) baseInput.addEventListener('input', () => { baseInput.dataset.touched = '1'; });
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();

window.loadAgents = loadAgents;
window.loadAgentModelSelection = loadAgentModelSelection;
window.renderAgentCards = renderAgentCards;
window.applyAgent = applyAgent;
window.restoreAgent = restoreAgent;
window.copyAgentUrl = copyAgentUrl;

/* ---- 系统运行日志模块 ---- */
let logEntries = [];
let lastLogId = 0;
let logFilterLevel = '';
let logFilterTag = '';
let logSearchText = '';
let logAutoRefresh = true;
let logAutoScroll = true;
let logPollTimer = null;
let logFetching = false;
let logUserScrolledUp = false;
// 增量渲染的簿记：DOM 里此刻画着的是"哪个过滤条件下的多少行"。轮询带回新行时
// 只 append 新增的几行；过滤/搜索变化或状态对不上时才整表重画。
let logDomKey = null;     // 上次渲染时的过滤条件指纹（logFilterKey()）
let logDomCount = 0;      // DOM 中当前的 .log-line 行数
const LOG_DOM_MAX = 2000; // 与 logEntries 的缓冲上限一致，超出就从头部裁

// 过滤谓词抽出来共用：整表渲染与增量 append 必须用同一套判据，否则会出现
// "新行画上去了、但按当前过滤条件它本不该显示"这类两套逻辑漂移出来的脏数据。
function logMatchesFilter(item){
  if(logFilterLevel && item.level !== logFilterLevel) return false;
  if(logFilterTag && item.tag !== logFilterTag) return false;
  if(logSearchText){
    const haystack = ((item.msg || '') + ' ' + (item.tag || '') + ' ' + (item.time || '')).toLowerCase();
    if(!haystack.includes(logSearchText)) return false;
  }
  return true;
}
function logFilterKey(){ return logFilterLevel + '|' + logFilterTag + '|' + logSearchText; }
/* 顶部文案跟着模式走：落库时报告库里累计多少条历史、并指向设置页的上限；纯内存
   时保持上游原话。data.mode 由 /logs 带回（后端按当前开关判定）。 */
function updateLogPageHint(data){
  const hint = document.getElementById('logPageHint');
  if(!hint) return;
  if(data && data.mode === 'db'){
    const stored = (typeof data.stored === 'number') ? data.stored : null;
    hint.textContent = '实时捕获反向代理请求、流式转发、调度巡检、任务打卡与异常告警'
      + ' (已落库' + (stored === null ? '' : '，共 ' + stored + ' 条历史')
      + '，可在设置页调整保留上限)';
  } else {
    hint.textContent = '实时捕获反向代理请求、流式转发、调度巡检、任务打卡与异常告警 (内存保留最新 2000 条)';
  }
}
// 单行 HTML 只有这一处定义，整表渲染和增量 append 都用它。
function logLineHtml(item){
  const lvlCls = 'lvl-' + (item.level || 'INFO');
  const tagCls = 'tag-' + (item.tag || 'system');
  return '<div class="log-line">' +
    '<span class="log-ts">' + escapeHtml(item.time || '') + '</span>' +
    '<span class="log-lvl ' + lvlCls + '">' + escapeHtml(item.level || 'INFO') + '</span>' +
    '<span class="log-tag ' + tagCls + '">[' + escapeHtml(item.tag || 'system') + ']</span>' +
    '<span class="log-msg">' + escapeHtml(item.msg || '') + '</span>' +
  '</div>';
}

function startLogPolling(){
  if(logPollTimer) clearInterval(logPollTimer);
  logPollTimer = setInterval(() => {
    if(logAutoRefresh && currentMainTab === 'logs' && !document.hidden){
      fetchNewLogs(false);
    }
  }, 2000);
}

function stopLogPolling(){
  if(logPollTimer){
    clearInterval(logPollTimer);
    logPollTimer = null;
  }
}

async function fetchNewLogs(forceReset){
  if(logFetching) return;
  logFetching = true;
  const statusEl = document.getElementById('logTerminalStatus');
  if(statusEl && forceReset) statusEl.textContent = '正在拉取...';
  try {
    const since = forceReset ? 0 : lastLogId;
    const limit = forceReset ? 500 : 200;
    const data = await getJSON('/logs?since_id=' + since + '&limit=' + limit);
    if(data && data.logs){
      updateLogPageHint(data);
      let fresh = null;     // 本轮真正新增的条目（去重后）
      let dropped = null;   // 因超上限被挤出缓冲的最旧条目
      if(forceReset){
        logEntries = data.logs;
      } else if(data.logs.length > 0){
        const existingIds = new Set(logEntries.map(x => x.id));
        fresh = data.logs.filter(item => !existingIds.has(item.id));
        fresh.forEach(item => logEntries.push(item));
        if(logEntries.length > 2000){
          dropped = logEntries.slice(0, logEntries.length - 2000);
          logEntries = logEntries.slice(-2000);
        }
      }
      if(data.max_id){
        lastLogId = Math.max(lastLogId, data.max_id);
      } else if(logEntries.length > 0){
        lastLogId = logEntries[logEntries.length - 1].id;
      }
      // 渲染策略：只有真的带着新行回来才碰 DOM。
      //  - 首次进入 / 手动刷新（forceReset）、过滤条件与上次渲染不一致、或 DOM
      //    里现在是空态：整表重画，顺带把簿记校正回来；
      //  - 有新增行且条件一致：只把新增的几行 append 上去，被挤出的旧行从头部
      //    等量删掉；
      //  - 没有任何新行：直接跳过——旧实现里 `data.logs` 为空数组也真，于是每
      //    2 秒把整个终端重写一遍，2000 行时每次约 700KB 的 HTML 解析 + 布局
      //    （实测 layout 254~324ms）全白烧，忙碌时"每 2 秒卡 0.3 秒"就是它。
      if(forceReset || logDomKey !== logFilterKey() || logDomCount === 0){
        renderLogs();
      } else {
        if(dropped && dropped.length) dropLogDomHead(dropped);
        if(fresh && fresh.length) appendLogLines(fresh);
      }
      // 统计徽章的数字只由 logEntries 决定，缓冲没变就不用重写（少一次 DOM 写）。
      if(forceReset || (fresh && fresh.length)) updateLogStats();
    }
    if(statusEl) statusEl.textContent = '就绪 · ' + new Date().toLocaleTimeString();
  } catch(e) {
    if(statusEl) statusEl.textContent = '连接中断: ' + e.message;
  } finally {
    logFetching = false;
  }
}

function updateLogStats(){
  const badge = document.getElementById('logStatsBadge');
  if(!badge) return;
  let errors = 0, warns = 0;
  logEntries.forEach(x => {
    if(x.level === 'ERROR') errors++;
    else if(x.level === 'WARN') warns++;
  });
  let txt = '共 ' + logEntries.length + ' 条';
  if(errors > 0) txt += ' · <span style="color:var(--bad)">' + errors + ' 错误</span>';
  if(warns > 0) txt += ' · <span style="color:var(--warn)">' + warns + ' 警告</span>';
  badge.innerHTML = txt;
}

function setLogFilterLevel(lvl){
  logFilterLevel = lvl;
  ['All', 'Info', 'Warn', 'Error'].forEach(name => {
    const btn = document.getElementById('btnLogLvl' + name);
    if(btn){
      const match = (lvl === '' && name === 'All') || (lvl.toUpperCase() === name.toUpperCase());
      btn.classList.toggle('active', match);
    }
  });
  renderLogs();
}

/* 模块筛选按钮的固定顺序与中文名。顺序按「排查时最常先看哪个模块」排，未列出
   的 tag 排到最后并按字母序补上——后端新增 tag 时这里不改也能用。 */
const LOG_TAG_ORDER = ['chat', 'tasks', 'scheduler', 'accounts', 'agents', 'pricing',
                       'egress', 'upstream', 'webtools', 'catalog', 'auth', 'settings',
                       'update', 'usage', 'system'];
const LOG_TAG_LABELS = {
  chat: '对话', tasks: '任务福利', scheduler: '调度器', accounts: '账号',
  agents: '智能体', pricing: '定价', egress: '出口', upstream: '上游',
  webtools: '网络工具', catalog: '模型', auth: '鉴权', settings: '设置',
  update: '更新', usage: '用量', system: '系统'
};
let logTagBtnKey = null;
/* 按当前缓冲里真正出现过的 tag 重建按钮组。集合没变就不动 DOM——这个函数每
   次渲染都会调，重建本身会让正在点的按钮闪一下。 */
function renderLogTagFilters(){
  const bar = document.getElementById('logTagBar');
  if(!bar) return;
  const seen = new Set();
  logEntries.forEach(x => { if(x.tag) seen.add(x.tag); });
  // 当前筛选的 tag 即使暂时没有日志也留在栏里，否则按钮一消失就不知道自己在
  // 筛什么，也没法一眼切回去。
  if(logFilterTag) seen.add(logFilterTag);
  const ordered = LOG_TAG_ORDER.filter(t => seen.has(t))
    .concat(Array.from(seen).filter(t => LOG_TAG_ORDER.indexOf(t) < 0).sort());
  const key = ordered.join(',');
  if(key !== logTagBtnKey){
    logTagBtnKey = key;
    bar.innerHTML = '';
    [{tag: '', label: '全部模块'}]
      .concat(ordered.map(t => ({tag: t, label: LOG_TAG_LABELS[t] || t})))
      .forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'range-btn';
        btn.dataset.tag = item.tag;
        btn.textContent = item.label;
        btn.onclick = () => setLogFilterTag(item.tag);
        bar.appendChild(btn);
      });
  }
  bar.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', (b.dataset.tag || '') === logFilterTag);
  });
}

function setLogFilterTag(tag){
  logFilterTag = tag;
  renderLogTagFilters();
  renderLogs();
}

let logSearchDebounce = null;
function onLogSearchInput(){
  clearTimeout(logSearchDebounce);
  logSearchDebounce = setTimeout(() => {
    const input = document.getElementById('logSearchInput');
    logSearchText = input ? input.value.trim().toLowerCase() : '';
    renderLogs();
  }, 200);
}

function toggleLogAuto(){
  logAutoRefresh = !logAutoRefresh;
  const btn = document.getElementById('btnToggleLogAuto');
  if(btn){
    if(logAutoRefresh){
      btn.textContent = '实时监听中';
      btn.style.color = 'var(--accent2)';
      startLogPolling();
    } else {
      btn.textContent = '已暂停监听';
      btn.style.color = 'var(--dim)';
      stopLogPolling();
    }
  }
}

function toggleLogScroll(){
  logAutoScroll = !logAutoScroll;
  const btn = document.getElementById('btnToggleLogScroll');
  if(btn){
    btn.textContent = logAutoScroll ? '自动滚屏: 开' : '自动滚屏: 关';
  }
  if(logAutoScroll){
    const body = document.getElementById('logTerminalBody');
    if(body) body.scrollTop = body.scrollHeight;
  }
}

function handleLogTerminalScroll(){
  const body = document.getElementById('logTerminalBody');
  if(!body) return;
  const atBottom = (body.scrollHeight - body.scrollTop - body.clientHeight) < 40;
  if(!atBottom && logAutoScroll){
    logUserScrolledUp = true;
  } else if(atBottom && logUserScrolledUp){
    logUserScrolledUp = false;
  }
}

function escapeHtml(s){
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderLogs(){
  const body = document.getElementById('logTerminalBody');
  if(!body) return;

  renderLogTagFilters();
  const filtered = logEntries.filter(logMatchesFilter);

  if(filtered.length === 0){
    body.innerHTML = '<div class="log-empty">暂无匹配的日志记录</div>';
    logDomKey = logFilterKey();
    logDomCount = 0;
    return;
  }

  body.innerHTML = filtered.map(logLineHtml).join('');
  logDomKey = logFilterKey();
  logDomCount = filtered.length;

  if(logAutoScroll && !logUserScrolledUp){
    body.scrollTop = body.scrollHeight;
  }
}

// 只把新到的行追加到终端末尾（insertAdjacentHTML 只解析这一段，不碰已有行）。
// 旧实现每次轮询都把全部行重拼一遍再整体 innerHTML，2000 行时约 700KB/次；
// 忙碌时新行通常只有几行，append 的代价与新增量成正比。
function appendLogLines(items){
  const body = document.getElementById('logTerminalBody');
  if(!body) return;
  const visible = items.filter(logMatchesFilter);
  if(!visible.length) return;   // 新行全被过滤掉：DOM 一个字节都不动
  body.insertAdjacentHTML('beforeend', visible.map(logLineHtml).join(''));
  logDomCount += visible.length;
  // 兜底上限：正常情况下头部裁剪由 dropLogDomHead 按"被挤出的条目"精确完成，
  // 这里只防簿记与 DOM 万一脱节（比如有人在控制台里手动改过 DOM）。
  while(logDomCount > LOG_DOM_MAX){
    const first = body.firstElementChild;
    if(!first){ logDomCount = 0; break; }
    body.removeChild(first);
    logDomCount--;
  }
  if(logAutoScroll && !logUserScrolledUp){
    body.scrollTop = body.scrollHeight;
  }
}

// 缓冲超上限时，最旧的条目被挤出 logEntries；DOM 头部也要把"其中当前过滤条件
// 下曾经画出来的那些行"删掉，否则开着过滤时终端会攒下已经不在缓冲里的旧行，
// 和切一次过滤后的整表重画结果对不上。按条数从头部删即可：DOM 顺序与条目顺序
// 一致，被挤出的条目必然是最老的，也就是 DOM 头部的那几行。
function dropLogDomHead(droppedEntries){
  const body = document.getElementById('logTerminalBody');
  if(!body) return;
  let cut = 0;
  for(let i = 0; i < droppedEntries.length; i++){
    if(logMatchesFilter(droppedEntries[i])) cut++;
  }
  while(cut > 0){
    const first = body.firstElementChild;
    if(!first){ logDomCount = 0; return; }
    body.removeChild(first);
    logDomCount--;
    cut--;
  }
}

function copyFilteredLogs(){
  const filtered = logEntries.filter(item => {
    if(logFilterLevel && item.level !== logFilterLevel) return false;
    if(logFilterTag && item.tag !== logFilterTag) return false;
    if(logSearchText){
      const haystack = ((item.msg || '') + ' ' + (item.tag || '') + ' ' + (item.time || '')).toLowerCase();
      if(!haystack.includes(logSearchText)) return false;
    }
    return true;
  });
  const text = filtered.map(x => '[' + (x.ts || x.time) + '] [' + x.level + '] [' + x.tag + '] ' + x.msg).join('\n');
  // Same secure-context caveat as writeClipboard(): plain http on a LAN address
  // has no navigator.clipboard at all, so reuse the shared helper.
  writeClipboard(text).then(() => {
    toast('已复制 ' + filtered.length + ' 行日志', 'ok');
  }).catch(e => {
    toast('复制失败: ' + e.message, 'bad');
  });
}

async function exportLogsFile(){
  try {
    const data = await getJSON('/logs?limit=5000');
    if(!data || !data.logs || !data.logs.length){
      toast('暂无日志可导出', 'warn');
      return;
    }
    const lines = data.logs.map(x => '[' + (x.ts || x.time) + '] [' + x.level + '] [' + x.tag + '] ' + x.msg);
    const text = lines.join('\n');
    const blob = new Blob([text], {type: 'text/plain;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = 'wb-proxy-' + ts + '.log';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('已导出 ' + data.logs.length + ' 行日志', 'ok');
  } catch(e) {
    toast('导出日志失败: ' + e.message, 'bad');
  }
}

async function clearServerLogs(){
  if(!confirm('确定要清空网关日志吗？内存缓冲会被清空；若已启用日志落库，数据库里的历史记录也会一并删除。')) return;
  try {
    await postJSON('/logs/clear', {});
    logEntries = [];
    lastLogId = 0;
    renderLogs();
    updateLogStats();
    toast('网关日志已清空', 'ok');
  } catch(e) {
    toast('清空失败: ' + e.message, 'bad');
  }
}

/* 时间范围：每个窗口都是服务端的一段切片，切换即重新取数。
 *
 * 只有「今日 / 全部历史」时，一次 /usage/analytics 同时带回两个桶，切换按钮
 * 重渲染缓存就够了；窗口变多之后一个 payload 装不下所有窗口，继续重渲染缓存
 * 只会把上一个窗口的数字挂到新标签下面，所以一律重取。 */
function setAnalyticsRange(range){
  analyticsRange = range;
  const btns = {today:'btnRangeToday', week:'btnRangeWeek', month:'btnRangeMonth',
                all:'btnRangeAll', custom:'btnRangeCustom'};
  Object.keys(btns).forEach(k => {
    const b = document.getElementById(btns[k]);
    if(b) b.classList.toggle('active', k === range);
  });
  const box = document.getElementById('rangeCustomBox');
  if(box) box.style.display = (range === 'custom') ? 'inline-flex' : 'none';
  if(range === 'custom') prefillCustomRange();
  loadAnalytics();
  // The model matrix reads /usage and /usage/perf directly, so it has to be
  // refetched: without this the table kept showing all-time figures while the
  // page said "today", which is the inconsistency the range buttons were
  // meant to remove.
  loadAnalyticsMatrix();
}

/* 自定义区间的输入框初始为空，而空 = 不限，画面会和「全部历史」一模一样，看起来
 * 像按钮坏了。第一次点开时把起点填成今天零点：一个能看懂的默认窗口，操作者再自己
 * 放宽或收窄；终点留空表示「到现在」。 */
function prefillCustomRange(){
  const el = document.getElementById('rangeCustomSince');
  if(!el || el.value) return;
  const d = new Date();
  el.value = toLocalInputValue(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000);
}

function pad2(n){ return String(n).padStart(2, '0'); }

/* datetime-local 与 epoch 互转：输入框里是操作者按日历读到的本地墙上时间，所以
 * 转换用浏览器自己的时区；服务端拿 epoch 与它自己的时钟比较。 */
function toLocalInputValue(epochSec){
  if(!epochSec) return '';
  const d = new Date(epochSec * 1000);
  if(isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
    + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function fromLocalInputValue(value){
  if(!value) return null;
  const t = new Date(value).getTime();
  return isNaN(t) ? null : Math.floor(t / 1000);
}

function onRangeCustomChange(){
  loadAnalytics();
  loadAnalyticsMatrix();
}

/* 三个取数端点共用同一个查询串，避免 /usage 与 /usage/perf 各拼一份而漏掉自定义
 * 区间——那正是「卡片与表格口径不一致」的复发路径。 */
function analyticsQuery(){
  let q = '?realm=all&range=' + encodeURIComponent(analyticsRange || 'today');
  if(analyticsRange === 'custom'){
    const sEl = document.getElementById('rangeCustomSince');
    const uEl = document.getElementById('rangeCustomUntil');
    const s = fromLocalInputValue(sEl ? sEl.value : '');
    const u = fromLocalInputValue(uEl ? uEl.value : '');
    if(s !== null) q += '&since=' + s;
    if(u !== null) q += '&until=' + u;
  }
  return q;
}

/* 模型性能指标与用量一览
 *
 * Reads the combined view on purpose. The table carries its own 区域
 * column, so scoping it to the gateway's current exit would hide exactly the
 * models this page exists to compare. */
// /v1/models?realm=all 的目录在这里只作展示白名单（哪些模型算"已知模型"），
// 内容变化极慢，却跟着 5 秒轮询每轮重取一份（实测统计页开着约 12~15 次/分钟、
// 约 24KB/次）。改成一个 TTL：进统计页时取一次，之后最多每 10 分钟回源一次；
// 取失败不刷新时间戳，下一轮继续重试（和原来"失败也不清空白名单"一致）。
let matrixModelsAt = 0;
const MATRIX_MODELS_TTL_MS = 10 * 60 * 1000;
async function loadAnalyticsMatrix(){
  try{
      const q = analyticsQuery();
    const needModels = !MATRIX_MODELS.size || (Date.now() - matrixModelsAt) >= MATRIX_MODELS_TTL_MS;
    const [usage, perf, models] = await Promise.all([
      getJSON('/usage' + q, POLL_READ),
      getJSON('/usage/perf' + q, POLL_READ),
      // The catalog is only a display filter, so a failure here must not
      // blank the table; null keeps the previous allowlist.
      needModels ? getJSON('/v1/models?realm=all').catch(() => null) : Promise.resolve(null),
    ]);
    if(models && models.data){
      MATRIX_MODELS = new Set(models.data.map(m => m.id));
      matrixModelsAt = Date.now();
    }
    cachedMatrixData = { usage: usage, perf: perf };
    fillMatrixFilters(usage);
    renderPerfMatrix(usage, perf);
  }catch(err){
    if(!isAuthError(err)) console.error('loadAnalyticsMatrix failed:', err);
  }
}

/* Rebuild the two matrix filter dropdowns from the payload just fetched.
 *
 * Options are derived from the data rather than from the account pool, so the
 * list only offers accounts and models that actually have rows - a filter that
 * can only ever yield an empty table is worse than no filter. A previously
 * chosen value is kept when it is still present, and cleared when it is not,
 * which is what happens when the range flips and an account drops out.
 */
function fillMatrixFilters(usage){
  const acctSel = document.getElementById('matrixAcctFilter');
  const modelSel = document.getElementById('matrixModelFilter');
  const names = (usage && usage.accounts_map) || {};
  const modelCount = {};
  Object.keys((usage && usage.by_model) || {}).forEach(id => {
    if(!id.endsWith('-model')) modelCount[id] = (usage.by_model[id] || {}).requests || 0;
  });
  if(acctSel){
    const seen = new Set();
    Object.values((usage && usage.by_model_acct) || {}).forEach(byRealm => {
      Object.values(byRealm || {}).forEach(byAcct => {
        Object.keys(byAcct || {}).forEach(uid => {
          if(uid && uid !== '(unattributed)') seen.add(uid);
        });
      });
    });
    const opts = Array.from(seen).sort((a, b) => {
      const na = (names[a] || {}).nickname || a;
      const nb = (names[b] || {}).nickname || b;
      return na.localeCompare(nb);
    });
    if(matrixAcctFilter && !seen.has(matrixAcctFilter)) matrixAcctFilter = '';
    acctSel.innerHTML = '<option value="">全部账号</option>' + opts.map(uid => {
      const info = names[uid] || {};
      const label = (info.nickname || uid.slice(0, 8)) + ' (' + uid.slice(0, 6) + ')';
      return '<option value="' + esc(uid) + '"' + (uid === matrixAcctFilter ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  }
  if(modelSel){
    const ids = Object.keys(modelCount).filter(id => modelCount[id] > 0).sort();
    if(matrixModelFilter && ids.indexOf(matrixModelFilter) === -1) matrixModelFilter = '';
    modelSel.innerHTML = '<option value="">全部模型</option>' + ids.map(id =>
      '<option value="' + esc(id) + '"' + (id === matrixModelFilter ? ' selected' : '') + '>' + esc(id) + '</option>'
    ).join('');
  }
}

function renderPerfMatrix(usage, perf){
  const matrixEl = document.getElementById("perfMatrix");
  if(!matrixEl) return;
  const bmPerf = (perf && perf.by_model) || {};
  const validModels = MATRIX_MODELS;
  const modelMap = {};
  Object.entries(usage.by_model || {}).forEach(([id, m]) => {
    if((!validModels.size || validModels.has(id)) && m.requests > 0 && !id.endsWith('-model')){
      modelMap[id] = Object.assign({id: id}, m);
    }
  });
  Object.entries(bmPerf).forEach(([id, p]) => {
    if((!validModels.size || validModels.has(id)) && p.requests > 0 && !id.endsWith('-model') && !modelMap[id]){
      modelMap[id] = {
        id: id,
        requests: p.requests || 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        reasoning_tokens: 0,
        cached_tokens: 0,
        total_tokens: 0
      };
    }
  });
  // One row per (model, exit). A model served by both exits gets two rows,
  // each carrying its own tokens, latency and speed; the region column then
  // describes exactly the numbers next to it instead of collapsing both.
  const realmMap = (usage && usage.by_model_realm) || {};
  const acctMap = (usage && usage.by_model_acct) || {};
  const perfAcctMap = (perf && perf.by_model_acct) || {};
  const rowsData = [];
  Object.values(modelMap)
    .sort((a,b) => (b.total_tokens || b.requests) - (a.total_tokens || a.requests))
    .forEach(m => {
      if(matrixModelFilter && m.id !== matrixModelFilter) return;
      const per = realmMap[m.id];
      const realms = per ? Object.keys(per).filter(r => (per[r].requests || 0) > 0) : [];
      if(realms.length > 1){
        // Most-used exit first, so the ordering stays meaningful.
        realms.sort((x, y) => (per[y].total_tokens || 0) - (per[x].total_tokens || 0));
      }
      // Within an exit, one row per account: two accounts sharing an exit are
      // two different consumers, and merging them hid which one spent what.
      const parts = [];
      (realms.length ? realms : ['']).forEach(r => {
        const accts = ((acctMap[m.id] || {})[r]) || {};
        const perfAccts = ((perfAcctMap[m.id] || {})[r]) || {};
        // Union of both maps: a bucket holding only failures exists in perf
        // alone, and dropping it would hide failures the total counts.
        const keys = Array.from(new Set(
          Object.keys(accts).concat(Object.keys(perfAccts))
        )).filter(a => {
          const u = accts[a] || {};
          const p = perfAccts[a] || {};
          return (u.requests || 0) > 0 || (u.errors || 0) > 0 ||
                 (p.requests || 0) > 0 || (p.errors || 0) > 0 ||
                 (p.client_aborted || 0) > 0;
        });
        // The account filter narrows the rows themselves, not just their
        // visibility, so the summary below always matches what is shown.
        const shown = matrixAcctFilter ? keys.filter(a => a === matrixAcctFilter) : keys;
        if(shown.length){
          shown.sort((x, y) =>
            ((accts[y] || {}).total_tokens || 0) - ((accts[x] || {}).total_tokens || 0));
          shown.forEach(a => {
            // Tokens come from usage; a failure-only bucket has none.
            const u = accts[a] || {requests: 0, prompt_tokens: 0, completion_tokens: 0,
                                   reasoning_tokens: 0, cached_tokens: 0, total_tokens: 0};
            parts.push({ stat: u, realm: r, acct: a,
                         accts: { [a]: u.requests || 0 } });
          });
        } else if(!matrixAcctFilter){
          // No per-account data for this exit (an older log, say): fall back
          // to the exit totals rather than dropping the row.
          const fallback = per ? per[r] : m;
          parts.push({ stat: fallback, realm: r, acct: '',
                       accts: fallback.accounts || {} });
        }
      });
      parts.forEach((p, i) => {
        rowsData.push(Object.assign({}, p.stat, {
          id: m.id, realm: p.realm, acct: p.acct, accts: p.accts,
          split: parts.length > 1, first: i === 0,
        }));
      });
    });

  const countEm = document.getElementById("matrixModelCount");
  if(countEm){
    const nModels = new Set(rowsData.map(r => r.id)).size;
    const anyFilter = !!(matrixAcctFilter || matrixModelFilter);
    countEm.textContent = nModels ? ("(有调用的模型: " + nModels +
      " 个·共 " + rowsData.length + " 行明细" + (anyFilter ? " · 已筛选" : "") + ")") : "";
  }

  if(!rowsData.length){
    matrixEl.innerHTML = '<div class="empty">当前版本暂无模型请求或性能数据</div>';
  } else {
    /* Summary row (Total / All Models).
     *
     * With no filter this is the endpoint-wide figure, as before. With a
     * filter active it is recomputed from the visible rows instead, because a
     * total that ignores the filter contradicts the rows directly beneath it -
     * the exact confusion the filter is meant to remove. Latency, speed and
     * wall time are averages over the filtered rows' own sample counts, so a
     * barely-used row cannot outvote a heavily-used one.
     */
    const filtering = !!(matrixAcctFilter || matrixModelFilter);
    let sumReq, sumErr, sumTok, sumP, sumC, sumR, totTtft, totTps, totWall, totCache, sumCost;
    if(!filtering){
      sumReq = usage.requests; sumErr = perf.errors; sumTok = usage.total_tokens;
      sumP = usage.prompt_tokens; sumC = usage.completion_tokens; sumR = usage.reasoning_tokens;
      // OpenRouter 价估算的合计：未筛选时取出口级汇总（与上面的数字同源）。
      sumCost = usage.cost_cny || 0;
      totTtft = perf.ttft_ms ? (ms(perf.ttft_ms.avg) + " (P50 " + ms(perf.ttft_ms.p50) + ")") : "-";
      totTps = perf.tokens_per_sec ? (perf.tokens_per_sec.avg.toFixed(1) + " tok/s") : "-";
      totWall = perf.wall_ms ? ms(perf.wall_ms.avg) : "-";
      totCache = perf.cache_hit_pct ? (perf.cache_hit_pct.avg.toFixed(1) + "%") : "-";
    } else {
      sumReq = 0; sumErr = 0; sumTok = 0; sumP = 0; sumC = 0; sumR = 0; sumCost = 0;
      let ttftW = 0, ttftN = 0, tpsW = 0, tpsN = 0, wallW = 0, wallN = 0, cacheW = 0, cacheN = 0;
      rowsData.forEach(m => {
        sumReq += m.requests || 0;
        sumTok += m.total_tokens || 0;
        sumP += m.prompt_tokens || 0;
        sumC += m.completion_tokens || 0;
        sumR += m.reasoning_tokens || 0;
        sumCost += m.cost_cny || 0;
        const mp = ((perf && perf.by_model_realm) || {})[m.id] || {};
        const mpAcctAll = ((perf && perf.by_model_acct) || {})[m.id] || {};
        const mpRealm = m.realm ? (mp[m.realm] || null) : null;
        const mpAcct = (m.realm && m.acct && mpAcctAll[m.realm])
          ? (mpAcctAll[m.realm][m.acct] || null) : null;
        const e = mpAcct || mpRealm || bmPerf[m.id] || {};
        sumErr += e.errors || 0;
        if(e.ttft_ms && e.ttft_ms.samples){ ttftW += e.ttft_ms.avg * e.ttft_ms.samples; ttftN += e.ttft_ms.samples; }
        if(e.tokens_per_sec && e.tokens_per_sec.samples){ tpsW += e.tokens_per_sec.avg * e.tokens_per_sec.samples; tpsN += e.tokens_per_sec.samples; }
        if(e.wall_ms && e.wall_ms.samples){ wallW += e.wall_ms.avg * e.wall_ms.samples; wallN += e.wall_ms.samples; }
        if(e.cache_hit_pct && e.cache_hit_pct.samples){ cacheW += e.cache_hit_pct.avg * e.cache_hit_pct.samples; cacheN += e.cache_hit_pct.samples; }
      });
      totTtft = ttftN ? ms(ttftW / ttftN) : "-";
      totTps = tpsN ? (((tpsW / tpsN)).toFixed(1) + " tok/s") : "-";
      totWall = wallN ? ms(wallW / wallN) : "-";
      totCache = cacheN ? ((cacheW / cacheN).toFixed(1) + "%") : "-";
    }
    const summaryRow = '<tr style="background:rgba(37,99,235,.06);font-weight:600">'
      + '<td style="text-align:left" data-label="模型"><b>' + (filtering ? '筛选结果合计 (Filtered)' : '全部模型合计 (Total)') + '</b></td>'
      + '<td style="text-align:center" data-label="区域"><span style="color:var(--dim)">—</span></td>'
      + '<td style="text-align:left" data-label="账号"><span style="color:var(--dim)">' + (filtering ? '已筛选' : '全部账号') + '</span></td>'
      + '<td data-label="请求数">' + fmt(sumReq) + '</td>'
      + '<td data-label="失败">' + (sumErr
          ? ('<span style="color:var(--bad)">' + fmt(sumErr) + '</span>')
          : '<span style="color:var(--dim)">0</span>') + '</td>'
      + '<td data-label="总 Token"><b style="color:var(--accent)">' + fmt(sumTok) + '</b></td>'
      + '<td class="triple" data-label="输入 / 输出 / 思考">' + tripleTokens(sumP, sumC, sumR) + '</td>'
      + '<td data-label="首字延迟">' + totTtft + '</td>'
      + '<td data-label="生成速度"><b style="color:var(--accent2)">' + totTps + '</b></td>'
      + '<td data-label="端到端耗时">' + totWall + '</td>'
      + '<td data-label="缓存命中">' + totCache + '</td>'
      + '<td data-label="用量占比">100%</td>'
      + '<td data-label="OpenRouter 价估算" class="pricing-col" style="color:var(--warn)">' + (PRICING_ON ? fmtCost(sumCost) : '—') + '</td>'
      + '</tr>';

    const rows = rowsData.map(m => {
      // Latency/speed come from the matching (model, exit) bucket when the
      // backend supplied one; otherwise fall back to the model-wide figure.
      const mp = ((perf && perf.by_model_realm) || {})[m.id] || {};
      const mpAcctAll = ((perf && perf.by_model_acct) || {})[m.id] || {};
      const mpRealm = m.realm ? (mp[m.realm] || null) : null;
      // Most specific first: this account on this exit, then the exit, then
      // the model. A split row must not borrow another account's latency.
      const mpAcct = (m.realm && m.acct && mpAcctAll[m.realm])
        ? (mpAcctAll[m.realm][m.acct] || null) : null;
      const mpEff = mpAcct || mpRealm || bmPerf[m.id] || {};
      const m_ttft = mpEff.ttft_ms ? (ms(mpEff.ttft_ms.avg) + " <span style='color:var(--dim);font-size:11px'>(P50 " + ms(mpEff.ttft_ms.p50) + ")</span>") : "-";
      const m_tps = mpEff.tokens_per_sec ? ('<b style="color:var(--accent2)">' + mpEff.tokens_per_sec.avg.toFixed(1) + '</b> <span style="font-size:11px;color:var(--dim)">tok/s</span>') : "-";
      const m_wall = mpEff.wall_ms ? ms(mpEff.wall_ms.avg) : "-";
      const m_cache = (m.prompt_tokens > 0) ? pct(m.cached_tokens / m.prompt_tokens * 100) : (mpEff.cache_hit_pct ? mpEff.cache_hit_pct.avg.toFixed(1) + "%" : "-");
      /* Share of the table's own total - the figure in the summary row -
       * rather than of the largest row. Dividing by the maximum made the
       * biggest model read 100% and every other row a fraction of it, which
       * is a relative ranking, not the share the column name promises.
       * One decimal, like every other percentage on the page: a whole-percent
       * reading collapses a model that spent millions of tokens to "0%". */
      const pctTok = sumTok > 0 ? Math.round(m.total_tokens / sumTok * 1000) / 10 : 0;
      // 0 is a real result (the model ran and never failed), so it stays
      // visible as a muted zero rather than the dash used for no data.
      const errCell = mpEff.errors
        ? ('<span style="color:var(--bad)">' + fmt(mpEff.errors) + '</span>')
        : '<span style="color:var(--dim)">0</span>';
      const acctsMap = usage.accounts_map || {};
      // This row's own accounts, not every account that touched the model.
      const mAccts = m.accts || m.accounts || {};
      const acctEntries = Object.entries(mAccts);
      let realmCell = '<span style="color:var(--dim)">—</span>';
      let acctCell = '<span style="color:var(--dim)">—</span>';
      const realms = new Set();
      if(m.realm){
        realms.add(m.realm);
      } else {
        acctEntries.forEach(([uid]) => {
          const info = acctsMap[uid] || {};
          if(info.realm) realms.add(info.realm);
        });
      }
      if(realms.size === 1){
        const r = Array.from(realms)[0];
        realmCell = r === 'cn' ? '<span class="realm-badge-cn">国内版</span>' : '<span class="realm-badge-intl">国际版</span>';
      } else if(realms.size > 1){
        realmCell = '<span class="realm-badge-intl">国际版</span> <span class="realm-badge-cn">国内版</span>';
      } else {
        // No account attribution on these rows (a test call,
        // say). Decide from the model id itself: this table
        // spans both realms, so the gateway's current exit
        // would mislabel domestic-only models.
        const isIntlOnly = ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gemini-3.8-flash', 'gemini-3.5-flash', 'grok-4.7'].includes(m.id);
        const isCnOnly = ['deepseek-v4-pro', 'glm-5.1', 'glm-5v-turbo', 'kimi-k3-1', 'kimi-k2.7', 'minimax-m3'].includes(m.id);
        realmCell = isIntlOnly ? '<span class="realm-badge-intl">国际版</span>'
          : (isCnOnly ? '<span class="realm-badge-cn">国内版</span>'
            : '<span style="color:var(--dim)">—</span>');
      }
      if(acctEntries.length === 1 && acctEntries[0][0] === '(unattributed)'){
        acctCell = '<span style="color:var(--dim)">—</span>';
      } else if(acctEntries.length === 1){
        const [uid, count] = acctEntries[0];
        const info = acctsMap[uid] || {};
        const name = esc(info.nickname || uid.slice(0, 8));
        acctCell = '<b>' + name + '</b>';
      } else if(acctEntries.length > 1){
        acctCell = acctEntries.map(([uid, count]) => {
          const info = acctsMap[uid] || {};
          const name = esc(info.nickname || uid.slice(0, 6));
          return '<span class="badge mini" style="margin:1px 2px">' + name + ' <span style="color:var(--dim)">(' + count + ')</span></span>';
        }).join('');
      }
      return '<tr>'
        + '<td style="text-align:left" class="mono" data-label="模型"><b>' + esc(m.id) + '</b></td>'
        + '<td style="text-align:center;white-space:nowrap" data-label="区域">' + realmCell + '</td>'
        + '<td style="text-align:left" data-label="账号">' + acctCell + '</td>'
        + '<td data-label="请求数">' + fmt(m.requests) + '</td>'
        + '<td data-label="失败">' + errCell + '</td>'
        + '<td data-label="总 Token"><b>' + fmt(m.total_tokens) + '</b></td>'
        + '<td class="triple" data-label="输入 / 输出 / 思考">' + tripleTokens(m.prompt_tokens, m.completion_tokens, m.reasoning_tokens) + '</td>'
        + '<td data-label="首字延迟">' + m_ttft + '</td>'
        + '<td data-label="生成速度">' + m_tps + '</td>'
        + '<td data-label="端到端耗时">' + m_wall + '</td>'
        + '<td data-label="缓存命中">' + m_cache + '</td>'
        + '<td style="min-width:90px" data-label="用量占比"><span class="bar-fill" style="width:' + Math.max(3, pctTok).toFixed(1) + '%"></span> <span style="font-size:11px;color:var(--dim)">' + pctTok.toFixed(1) + '%</span></td>'
        + '<td data-label="OpenRouter 价估算" class="pricing-col" style="color:var(--warn)" title="OpenRouter 价估算：按该行（模型·区域·账号）的 token 消耗折算；按条件定价的模型（输入长度阈值或时段）按每条请求取档；单条请求实际用的策略、三档单价与匹配来源见「最近请求」里那条的悬停提示">'
        +   ((m.cost_cny || 0) > 0 ? fmtCost(m.cost_cny) : '<span style="color:var(--dim)">—</span>')
        + '</td>'
        + '</tr>';
    }).join('');

    // 延迟 / 速度列取自日志末尾的采样，窗口比采样更宽时它们只覆盖最新的那一段。
    // 明说覆盖范围，比让局部数字冒充整个窗口要好。
    let coverageNote = '';
    if(perf && perf.sample_capped && perf.sample_from){
      coverageNote = '<div style="font-size:12px;color:var(--dim);margin-bottom:8px">'
        + '延迟 / 速度列只覆盖日志末尾的部分请求（自 '
        + esc(new Date(perf.sample_from * 1000).toLocaleString())
        + ' 起），更早的请求未纳入这三列。</div>';
    }
    matrixEl.innerHTML = coverageNote + '<table class="data-cards"><thead><tr>'
      + '<th style="text-align:left">模型名称</th>'
      + '<th style="text-align:center;width:76px">区域</th>'
      + '<th style="text-align:left">账号</th>'
      + '<th>请求数</th><th>失败</th><th>总 Token</th><th style="min-width:190px">输入 / 输出 / 思考</th>'
      + '<th>首字延迟 (TTFT)</th><th>生成速度</th><th>端到端耗时</th><th>缓存命中率</th><th>用量占比</th>'
      + '<th class="pricing-col" style="color:var(--warn)">估算价格</th>'
      + '</tr></thead><tbody>' + summaryRow + rows + '</tbody></table>';
    applyTableSort('perfMatrix');
  }

}

async function loadAnalytics(){
  try {
    // 载荷永远按当前选中的窗口取，它的 window 桶就是第一列要展示的数字。
    const data = await getJSON('/usage/analytics' + analyticsQuery(), POLL_READ);
    renderAnalytics(data);
    loadUsageSeries();
    loadRemainingUsage();
    loadCreditGrants();
  } catch(err) {
    console.error('loadAnalytics failed:', err);
  }
}

// ---------------------------------------------------------------------------
// 剩余用量估算（/usage/remaining）
//
// 上游按 24 小时窗口给「账号 × 模型」配额，预算 = 撞线账号窗口用量的平均；
// 这个区块把每个账号当前窗口的剩余列出来。数字随用量实时变化，不跟时间窗
// 选择器联动（它只描述「现在」），所以载荷不带 range 参数。
// ---------------------------------------------------------------------------
async function loadRemainingUsage(){
  try {
    const data = await getJSON('/usage/remaining', POLL_READ);
    renderRemainingUsage(data);
  } catch(err) {
    if(!isAuthError(err)) console.error('loadRemainingUsage failed:', err);
  }
}

function fmtTok(v){
  if(v == null) return '—';
  const n = Number(v) || 0;
  if(Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if(Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

// 上一轮真正画进 DOM 的载荷指纹（同 refreshInner 里的 recentFp 那套）。
let lastRemainingFp = null;
// 模型筛选（点「模型总量」徽章只看那个模型，再点一次显示全部）与最近一次载荷
// ——切换筛选要立刻重画，不能等下一轮轮询。
let remainingModelFilter = '';
let lastRemainingData = null;

function toggleRemainingModelFilter(model){
  remainingModelFilter = (remainingModelFilter === model) ? '' : (model || '');
  if(lastRemainingData) renderRemainingUsage(lastRemainingData);
}

// 剩余用量按区域分成两块（国际版 / 国内版）：各自的徽章、统计与表格；区域列
// 因此不再需要——区块标签已经说明了区域。
const REMAINING_REALMS = [
  {realm: 'intl', budgets: 'remainingBudgetsIntl',
   summary: 'remainingSummaryIntl', tbody: 'remainingTbodyIntl'},
  {realm: 'cn', budgets: 'remainingBudgetsCn',
   summary: 'remainingSummaryCn', tbody: 'remainingTbodyCn'},
];

function renderRemainingUsage(data){
  const bodies = REMAINING_REALMS.map(r => document.getElementById(r.tbody));
  if(!bodies[0]) return;
  const tbody = bodies[0];   // 指纹守卫只关心「这一块画过没有」
  // 5 秒一轮的重画里，载荷没变就不碰 DOM：接口挂了 15 秒 TTL，同一个缓存
  // 条目会连着命中好几轮轮询，每轮重写三十行 innerHTML 是白付的解析与布局。
  // 指纹取载荷本身——它包含所有会画进表格的输入，而同一缓存条目的两次响应
  // 逐字节相同。tbody 为空时照常重画（换页签/清空后不能停在空白上）。
  // 筛选状态也算指纹的一部分：切换筛选必须立刻重画。
  const fp = remainingModelFilter + '\u0000' + JSON.stringify(data);
  if(fp === lastRemainingFp && tbody.innerHTML) return;
  lastRemainingFp = fp;
  lastRemainingData = data;
  const rows = (data && data.rows) || [];
  const budgets = (data && data.budgets) || [];
  // 模型筛选：徽章选中的模型只留它自己的行（'' = 全部）。统计行按可见行算，
  // 免得「表里 3 行、上面写 20 项」。
  const visible = remainingModelFilter
    ? rows.filter(r => r.model === remainingModelFilter) : rows;

  const winEm = document.getElementById('remainingUsageWindow');
  if(winEm){
    winEm.textContent = data ? ('窗口 ' + (data.window_seconds / 3600) + 'h') : '';
  }
  // 预算样本与按模型总剩余并成同一个徽章：同一个 (区域, 模型) 的两个指标
  // （预算来自撞线样本；总剩余 = 可用组的剩余之和，冷却/已满记 0、只加不减），
  // 分两行展示会被当成重复条目。徽章按区域各画一块。
  const models = (data && data.models) || [];
  const merged = new Map();
  budgets.forEach(b => merged.set(b.realm + '\u0000' + b.model, {budget: b}));
  models.forEach(m => {
    const key = m.realm + '\u0000' + m.model;
    const entry = merged.get(key) || {};
    entry.model = m;
    merged.set(key, entry);
  });
  REMAINING_REALMS.forEach(({realm, budgets: elId}) => {
    const el = document.getElementById(elId);
    if(!el) return;
    const chips = [];
    merged.forEach(entry => {
      const budget = entry.budget, model = entry.model;
      const src = model || budget;
      if(src.realm !== realm) return;
      // 近两日没消耗的模型不参与剩余计算（服务端过滤），但预算样本保留并
      // 标「未参与」——预算要撞线才学得到，不能因为暂时没用就从面板消失。
      const off = budget && budget.active === false;
      const bits = [];
      const tips = [];
      if(budget){
        bits.push('预算 ≈ <b>' + fmtTok(budget.avg) + '</b>'
                  + ' <span style="color:var(--dim)">(n=' + budget.n + ')</span>'
                  + (off ? ' <span style="color:var(--dim)">未参与</span>' : ''));
        tips.push('样本 ' + budget.n + ' · 区间 ' + fmtTok(budget.min) + ' ~ ' + fmtTok(budget.max)
                  + (off ? ' · 近两日未使用，未参与剩余用量' : ''));
      }
      if(model){
        bits.push('总剩余 <b>'
                  + (model.total_remaining == null ? '—' : fmtTok(model.total_remaining)) + '</b>'
                  + ' <span style="color:var(--dim)">(可用 ' + (model.available || 0)
                  + ' · 冷却 ' + (model.cooling || 0)
                  + (model.unknown ? ' · 未知 ' + model.unknown : '') + ')</span>');
        tips.push('按模型汇总：可用组的剩余之和；冷却/用完的组记 0，不拉低别的组');
      }
      chips.push('<span class="badge" style="font-size:11px;cursor:pointer'
        + (off ? ';opacity:.55' : '')
        + (remainingModelFilter === src.model
           ? ';outline:2px solid var(--accent);outline-offset:1px' : '')
        + '" title="' + esc(tips.join('；') + ' · 点击只看这个模型，再点一次显示全部') + '"'
        + ' data-model="' + esc(src.model) + '"'
        + ' onclick="toggleRemainingModelFilter(this.dataset.model)">'
        + esc(src.model) + ' · ' + bits.join(' · ') + '</span>');
    });
    el.innerHTML = chips.length
      ? chips.join(' ')
      : '<span style="font-size:12px;color:var(--dim)">暂无预算样本：等某个账号把某个模型的窗口用满（撞线）后自动出现。</span>';
  });

  const countLine = list => {
    const cooling = list.filter(r => r.cooling).length;
    const tight = list.filter(r => !r.cooling && r.used_pct != null && r.used_pct >= 80).length;
    return list.length
      ? (list.length + ' 项 · 冷却中 ' + cooling + ' · 用量 ≥80% ' + tight)
      : '暂无数据';
  };
  const summary = document.getElementById('remainingUsageSummary');
  if(summary) summary.textContent = countLine(visible);
  REMAINING_REALMS.forEach(({realm, summary: elId}) => {
    const el = document.getElementById(elId);
    if(el) el.textContent = countLine(visible.filter(r => r.realm === realm));
  });

const emptyRow = '<tr><td colspan="6" style="text-align:center;color:var(--dim)">'
    + (remainingModelFilter
       ? esc('「' + remainingModelFilter + '」在当前范围内没有记录（再点一次选中的徽章显示全部）')
       : '暂无数据（需要账号先有用量或撞线记录）')
    + '</td></tr>';
  REMAINING_REALMS.forEach(({realm, tbody: bodyId}) => {
    const body = document.getElementById(bodyId);
    if(!body) return;
    const realmRows = visible.filter(r => r.realm === realm);
    if(!realmRows.length){
      body.innerHTML = emptyRow;
      return;
    }
    body.innerHTML = realmRows.map(r => {
      const pct = r.used_pct == null ? null : Math.max(0, Math.min(100, r.used_pct));
      const color = r.cooling || (pct != null && pct >= 90) ? 'var(--bad)'
        : (pct != null && pct >= 70 ? 'var(--warn)' : 'var(--accent2)');
      const bar = '<div style="display:flex;align-items:center;gap:6px">'
        + '<div style="flex:1;height:6px;background:var(--panel2);border:1px solid var(--line);border-radius:3px;overflow:hidden">'
        + '<div style="height:100%;width:' + (pct == null ? 0 : pct) + '%;background:' + color + ';transition:width .3s ease"></div>'
        + '</div>'
        + '<span style="font-size:11px;color:var(--dim);min-width:44px;text-align:right">'
        + (r.used_pct == null ? '—' : r.used_pct.toFixed(1) + '%') + '</span></div>';
      const flags = [];
      if(r.cooling) flags.push('<span class="badge" style="font-size:10px;color:var(--bad)">冷却至 '
        + esc((r.reset_iso || '').slice(5, 16)) + '</span>');
        else if(r.estimated) flags.push('<span class="badge" style="font-size:10px;color:var(--dim)" '
        + 'title="当前窗口的起点未知（没有撞线记录，或记录已过期），已用按最近 24 小时统计，是剩余量的下界">按 24h 估算</span>');
      const remainCell = r.remaining == null ? '—'
        : (r.cooling ? '<b style="color:var(--bad)">0</b>' : '<b>' + fmtTok(r.remaining) + '</b>');
      // 分段明细不在这张表里展示：两段相加的总量看「各账号用量透视与模型消耗
      // 分布」（原始消耗本来就含两段）。这里只保留冷却行的悬停提示——窗口的
      // 记账在撞线处截止。
      const segs = Array.isArray(r.segments) ? r.segments : [];
      const usedTitle = r.cooling && segs.length
        ? ' title="' + esc('已用到撞线时刻为止（' + (segs[0].end_iso || '').slice(5, 16)
                           + '），额度 ' + (r.reset_iso || '').slice(5, 16) + ' 恢复') + '"'
        : '';
      return '<tr>'
        + '<td style="text-align:left">' + esc(r.nickname || (r.uid || '').slice(0, 8)) + '</td>'
        + '<td style="text-align:left">' + esc(r.model) + ' ' + flags.join(' ') + '</td>'
        + '<td style="text-align:center;font-size:11px;color:var(--dim)">'
        + esc((r.window_iso || '').slice(5, 16)) + '</td>'
        + '<td style="text-align:right"' + usedTitle + '>' + fmtTok(r.used) + '</td>'
        + '<td style="text-align:right">' + remainCell + '</td>'
        + '<td>' + bar + '</td>'
        + '</tr>';
    }).join('');
  });
  const sampleBody = document.getElementById('remainingSamplesBody');
  if(sampleBody){
    const groups = budgets.filter(b => Array.isArray(b.samples_list) && b.samples_list.length);
    if(!groups.length){
      sampleBody.textContent = '暂无撞线样本。';
    } else {
      sampleBody.innerHTML = groups.map(b => {
        const rows = b.samples_list.map(s =>
          '<div style="margin-left:12px">'
          + esc((s.at_iso || '').slice(5, 16)) + ' · '
          + esc((s.account || '').slice(0, 8)) + ' · '
          + fmtTok(s.sample) + ' tok</div>').join('');
        return '<div style="margin:6px 0"><b>'
          + esc(b.realm === 'cn' ? '国内版' : '国际版') + ' / ' + esc(b.model)
          + '</b> <span style="color:var(--dim)">n=' + b.n
          + ' · ' + fmtTok(b.min) + ' ~ ' + fmtTok(b.max) + '</span>'
          + rows + '</div>';
      }).join('');
    }
  }
    applyTableSort('remainingUsageTableIntl');
    applyTableSort('remainingUsageTableCn');
}

function remainingSamplesText(){
  const budgets = (lastRemainingData && lastRemainingData.budgets) || [];
  const lines = [];
  budgets.forEach(b => {
    const rows = b.samples_list || [];
    if(!rows.length) return;
    const vals = rows.map(s => fmtTok(s.sample)).join(' / ');
    lines.push((b.realm === 'cn' ? '国内版' : '国际版') + ' / ' + b.model + ' / ' + vals);
  });
  return lines.join('\n');
}

function copyRemainingSamples(){
  const text = remainingSamplesText();
  if(!text){ toast('暂无撞线样本', 'warn'); return; }
  writeClipboard(text).then(() => {
    toast('已复制 ' + text.split('\n').length + ' 组样本', 'ok');
  }).catch(e => toast('复制失败: ' + e.message, 'bad'));
}

function loadUsageSeries(){
  getJSON('/usage/timeseries' + analyticsQuery(), POLL_READ)
    .then(data => { renderUsageSeries(data); renderCreditHistory(data); })
    .catch(() => {});
}

function renderUsageSeries(data){
  const canvas = document.getElementById('usageSeriesChart');
  if(!canvas) return;
  const series = (data && data.series) || [];
  const summary = document.getElementById('usageSeriesSummary');
  const totalTokens = series.reduce((sum, b) => sum + (b.total_tokens || 0), 0);
  const totalCredit = series.reduce((sum, b) => sum + (b.credit || 0), 0);
  if(summary) summary.textContent = '总 Token ' + fmt(totalTokens) + ' · 扣减积分 ' + fmt(totalCredit)
    + ' · 桶 ' + (data ? data.bucket_seconds : '-') + 's';
  const ctx = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 800;
  const cssH = 220;
  canvas.width = cssW * ratio;
  canvas.height = cssH * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if(!series.length){
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim() || '#64748b';
    ctx.font = '12px sans-serif';
    ctx.fillText('当前范围没有请求数据', 12, 24);
    return;
  }
  const pad = {l: 52, r: 16, t: 12, b: 26};
  const plotW = Math.max(10, cssW - pad.l - pad.r);
  const plotH = Math.max(10, cssH - pad.t - pad.b);
  const maxTokens = Math.max(1, ...series.map(b => b.total_tokens || 0));
  const maxReq = Math.max(1, ...series.map(b => b.requests || 0));
  const slot = plotW / series.length;
  const barW = Math.max(1, slot - 2);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--chart-axis').trim() || '#1e293b';
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, pad.t + plotH);
  ctx.lineTo(pad.l + plotW, pad.t + plotH);
  ctx.stroke();
  series.forEach((b, i) => {
    const h = plotH * (b.total_tokens || 0) / maxTokens;
    const x = pad.l + slot * i + 1;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--chart-bar').trim() || 'rgba(56,189,248,.55)';
    ctx.fillRect(x, pad.t + plotH - h, barW, h);
  });
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--chart-line').trim() || '#a78bfa';
  ctx.beginPath();
  series.forEach((b, i) => {
    const x = pad.l + slot * (i + 0.5);
    const y = pad.t + plotH - plotH * (b.requests || 0) / maxReq;
    if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim() || '#64748b';
  ctx.font = '10px monospace';
  ctx.fillText(fmt(maxTokens), 4, pad.t + 8);
  ctx.fillText('0', 4, pad.t + plotH);
  const tsLabel = t => new Date(t * 1000).toLocaleString();
  const firstLabel = tsLabel(series[0].at);
  const lastLabel = tsLabel(series[series.length - 1].at);
  ctx.fillText(firstLabel, pad.l, cssH - 6);
  ctx.fillText(lastLabel, Math.max(pad.l, cssW - pad.r - ctx.measureText(lastLabel).width), cssH - 6);
}

async function loadCreditHistory(btn){
  if(btn) btn.disabled = true;
  try{
    const data = await getJSON('/usage/timeseries' + analyticsQuery(), POLL_READ);
    renderUsageSeries(data);
    renderCreditHistory(data);
    if(btn) toast('积分扣减历史已刷新', 'ok');
  }catch(e){
    if(btn) toast('刷新失败: ' + e.message, 'bad');
  }finally{
    if(btn) btn.disabled = false;
  }
}

// 最近一次的积分扣减数据。账号昵称来自 /accounts（另一条并行请求），
// 它比 /usage/timeseries 晚到时就先用 uid 兜底，等账号到位后再补画一次。
let LAST_CREDIT_DATA = null;

// uid -> 昵称。取不到（账号已删除/尚未加载完）就回退 uid 前 8 位，不留空。
function creditAccountLabel(uid){
  const id = String(uid || '');
  if(!id) return '—';
  const acct = (window.ACCOUNTS || []).find(a => a.uid === id);
  return (acct && acct.nickname) || id.slice(0, 8);
}

function renderCreditHistory(data){
  if(data) LAST_CREDIT_DATA = data;
  const rows = ((LAST_CREDIT_DATA && LAST_CREDIT_DATA.credits) || []).slice(0, 50);
  const tbody = document.querySelector('#creditHistoryTable tbody');
  if(!tbody) return;
  tbody.innerHTML = rows.map(x => '<tr>'
    + '<td>' + esc(x.iso || '') + '</td>'
    + '<td>' + esc(x.model || '') + '</td>'
    + '<td title="' + esc(x.account || '') + '">' + esc(creditAccountLabel(x.account)) + '</td>'
    + '<td>' + fmt(x.credit) + '</td>'
    + '<td>' + fmt(x.total_tokens || 0) + '</td>'
    + '</tr>').join('') || '<tr><td colspan="5" style="color:var(--dim)">没有积分扣减记录</td></tr>';
  applyTableSort('creditHistoryTable');
}

// ---------------------------------------------------------------------------
// 积分获取历史（/accounts/credits/grants）
//
// 上游给每个账号一份积分包清单（免费套餐、每日活跃奖励的 Bonus Pack、活动包…），
// 每个包带面额与发放时间。这个区块把全部账号的包摊平成一张表、新的在前；接口只读
// 最近一次「刷新积分」留下的快照（不发上游请求），所以摘要里带上快照时刻。
// ---------------------------------------------------------------------------
let LAST_GRANTS_DATA = null;
const GRANT_STATUS_LABEL = {active: '生效中', available: '可用', used_up: '已用完', expired: '已过期'};

async function loadCreditGrants(btn){
  if(btn){ btn.disabled = true; btn.textContent = '刷新中...'; }
  try{
    const data = await getJSON('/accounts/credits/grants', POLL_READ);
    renderCreditGrants(data);
    if(btn) toast('积分获取历史已刷新', 'ok');
  }catch(e){
    if(!isAuthError(e)) toast('积分获取历史加载失败: ' + e.message, 'bad');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '刷新'; }
  }
}

function renderCreditGrants(data){
  if(data) LAST_GRANTS_DATA = data;
  const d = LAST_GRANTS_DATA || {};
  const rows = (d.rows || []).slice(0, 100);
  const s = d.summary || {};
  const summary = document.getElementById('creditGrantsSummary');
  if(summary){
    summary.textContent = rows.length
      ? ('共 ' + fmt(s.count || rows.length) + ' 笔 · 合计 ' + fmt(s.size || 0)
         + ' · 剩余 ' + fmt(s.remain || 0)
         + (d.fetched_iso ? ' · 数据截至 ' + String(d.fetched_iso).slice(5, 16) : ''))
      : '暂无积分获取记录（上游只返回当前仍可见的积分包，先点「一键刷新积分」拉一次）';
  }
  const tbody = document.getElementById('creditGrantsTbody');
  if(!tbody) return;
  tbody.innerHTML = rows.map(r => {
    const status = GRANT_STATUS_LABEL[r.status] || String(r.status || '');
    const tone = (r.status === 'expired' || r.status === 'used_up') ? 'bad'
      : (r.status === 'active' ? 'ok' : '');
    const expiry = r.no_expiry ? '不过期' : String(r.expire_iso || '').slice(5, 16) || '—';
    // 来源：上游给了发放原因就用它的原文（如「Buddy 加油站签到」「成长计划奖励」），
    // 没有就按包名与面额推断（国际版的 Bonus Pack 30/50 就是每日活跃奖励）。本机
    // 签到 / 每日活跃的记录按时间对得上时一并挂进悬停提示，指出这次发放对应哪次动作。
    const reason = String(r.grant_reason || '').trim();
    const inferred = !reason && r.realm === 'intl' && /bonus/i.test(String(r.name || ''))
      && (Number(r.size) === 30 || Number(r.size) === 50);
    const source = reason || (inferred ? '每日活跃奖励' : '');
    const tips = [];
    if(reason) tips.push('上游发放原因：' + reason);
    if(inferred) tips.push('按包名与面额推断（官方规则：每日活跃 30 / Pro 50 积分）');
    if(r.action && r.action.task){
      const task = r.action.task === 'checkin' ? '每日签到' : '每日活跃打卡';
      tips.push('本机动作：' + task + ' ' + String(r.action.ts || '').slice(5, 16).replace('T', ' ')
                + ' ' + (r.action.ok ? '成功' : '失败'));
    }
    return '<tr>'
      + '<td' + (r.create_iso ? ' data-sort="' + esc(r.create_iso) + '"' : '') + '>'
      + esc(String(r.create_iso || '').slice(5, 16) || '—') + '</td>'
      + '<td title="' + esc(r.uid || '') + '">' + esc(r.nickname || creditAccountLabel(r.uid)) + '</td>'
      + '<td style="text-align:center">' + esc(r.realm === 'cn' ? '国内版' : '国际版') + '</td>'
      + '<td' + (r.grant_reason ? ' title="' + esc(r.grant_reason) + '"' : '') + '>' + esc(r.name || '') + '</td>'
      + '<td' + (tips.length ? ' title="' + esc(tips.join('；')) + '"' : '') + '>' + esc(source || '—') + '</td>'
      + '<td style="text-align:right">' + fmt(r.size || 0) + '</td>'
      + '<td style="text-align:right">' + fmt(r.remain || 0) + '</td>'
      + '<td style="text-align:center;font-size:11px;color:var(--dim)"'
      + (!r.no_expiry && r.expire_iso ? ' data-sort="' + esc(r.expire_iso) + '"' : '') + '>'
      + esc(expiry) + '</td>'
      + '<td style="text-align:center"><span class="badge ' + tone + '">' + esc(status) + '</span></td>'
      + '</tr>';
  }).join('') || '<tr><td colspan="9" style="color:var(--dim)">暂无积分获取记录</td></tr>';
  applyTableSort('creditGrantsTable');
}

/* 第一列的口径随范围切换，标签必须跟着走，否则「本周」的数字会被当成「今日」读。 */
const RANGE_LABELS = {today:'今日', week:'本周', month:'本月', custom:'自定义区间', all:'全部历史'};
function rangeLabel(){ return RANGE_LABELS[analyticsRange] || RANGE_LABELS.today; }

function renderAnalytics(data){
  if(!data || !data.summary) return;
  const sumWindow = data.summary.window || {};
  const sumAll = data.summary.all_time || {};
  const currentSum = sumWindow;

  // KPI 1: follows the range selector. It used to be hard-wired to the Today
  // bucket while the card next to it was hard-wired to All Time, so the range
  // buttons appeared to do nothing to the headline number.
  const elTodayTok = document.getElementById('kpiTodayTokens');
  const elTodayDetail = document.getElementById('kpiTodayTokensDetail');
  const elTodayTitle = document.getElementById('kpiRangeTokenTitle');
  if(elTodayTitle) elTodayTitle.textContent = rangeLabel() + '消耗 Token';
  if(elTodayTok) elTodayTok.textContent = fmtCompact(currentSum.total_tokens || 0);
  if(elTodayDetail) elTodayDetail.innerHTML =
    '<span style="color:var(--accent)">输入 ' + fmtCompact(currentSum.prompt_tokens || 0) + '</span>' +
    ' <span style="color:var(--dim-light)">/</span> ' + '<span style="color:var(--accent2)">输出 ' + fmtCompact(currentSum.completion_tokens || 0) + '</span>' +
    ' <span style="color:var(--dim-light)">/</span> ' + '<span style="color:var(--think)">思考 ' + fmtCompact(currentSum.reasoning_tokens || 0) + '</span>' +
    ' <span style="color:var(--dim-light)">/</span> ' + '<span style="color:var(--ok)">缓存 ' + fmtCompact(currentSum.cached_tokens || 0) + '</span>';

  // KPI 2: always the all-time figure, as the stable reference next to KPI 1.
  const elTotalTok = document.getElementById('kpiTotalTokens');
  const elTotalDetail = document.getElementById('kpiTotalTokensDetail');
  if(elTotalTok) elTotalTok.textContent = fmtCompact(sumAll.total_tokens || 0);
  if(elTotalDetail) elTotalDetail.innerHTML =
    '<span style="color:var(--accent)">输入 ' + fmtCompact(sumAll.prompt_tokens || 0) + '</span>' +
    ' <span style="color:var(--dim-light)">/</span> ' + '<span style="color:var(--accent2)">输出 ' + fmtCompact(sumAll.completion_tokens || 0) + '</span>' +
    ' <span style="color:var(--dim-light)">/</span> ' + '<span style="color:var(--think)">思考 ' + fmtCompact(sumAll.reasoning_tokens || 0) + '</span>' +
    ' <span style="color:var(--dim-light)">/</span> ' + '<span style="color:var(--ok)">缓存 ' + fmtCompact(sumAll.cached_tokens || 0) + '</span>' +
    // 只有「所选范围已经覆盖了日志里的全部请求」这一种情况需要说明：两张卡数字
    // 相同不是计数器坏了，而是没有更早的数据。
    ((analyticsRange !== 'all' && (sumAll.total_tokens || 0) === (sumWindow.total_tokens || 0) && (sumAll.total_tokens || 0) > 0)
      ? '<br><span style="color:var(--dim);font-size:11px">与' + rangeLabel() + '相同：所选范围已覆盖日志中的全部请求</span>'
      : '');

  // KPI 3: 网关平均生成速度（耗时作为副文案，速度与耗时是一对）
  const elAvgSpeed = document.getElementById('kpiAvgSpeed');
  const elAvgElapsed = document.getElementById('kpiAvgElapsed');
  if(elAvgSpeed) elAvgSpeed.innerHTML = (currentSum.speed_avg ? currentSum.speed_avg.toFixed(1) : '0.0') + ' <span style="font-size:12px;font-weight:400;color:var(--dim)">tok/s</span>';
  if(elAvgElapsed) elAvgElapsed.textContent = '平均耗时 ' + ms(currentSum.elapsed_ms_avg);

  // KPI 4: 平均首字延迟，单独一张卡
  const elAvgLatency = document.getElementById('kpiAvgLatency');
  if(elAvgLatency) elAvgLatency.textContent = ms(currentSum.ttft_ms_avg);

  // KPI 5: 缓存命中率
  const elCacheRate = document.getElementById('kpiCacheRate');
  if(elCacheRate) elCacheRate.textContent = (currentSum.cache_hit_pct != null ? currentSum.cache_hit_pct.toFixed(1) : '0.0') + '%';
  const elCacheDetail = document.getElementById('kpiCacheDetail');
  if(elCacheDetail) elCacheDetail.textContent = '缓存 ' + fmtCompact(currentSum.cached_tokens || 0) + ' tokens · 提示词前缀命中复用比';

  // KPI 6: 请求数（成功数）与 KPI 7: 成功率，拆成两张卡
  const elReqTitle = document.getElementById('kpiReqTitle');
  const elReqCount = document.getElementById('kpiReqCount');
  const elReqDetail = document.getElementById('kpiReqDetail');
  const elSuccessRate = document.getElementById('kpiSuccessRate');
  const elSuccessDetail = document.getElementById('kpiSuccessDetail');
  if(elReqTitle) elReqTitle.textContent = (analyticsRange === 'all' ? '累计' : rangeLabel()) + '请求数';
  const okReq = currentSum.requests || 0;
  const errReq = currentSum.errors || 0;
  const totalReq = okReq + errReq;
  const successPct = totalReq > 0 ? ((okReq / totalReq) * 100).toFixed(1) : '100.0';
  if(elReqCount) elReqCount.textContent = fmt(okReq) + ' 次';
  if(elReqDetail) elReqDetail.textContent = '含失败共 ' + fmt(totalReq) + ' 次';
  if(elSuccessRate) elSuccessRate.innerHTML = '<span style="color:' + (errReq ? 'var(--warn)' : 'var(--accent2)') + '">' + successPct + '%</span>';
  if(elSuccessDetail) elSuccessDetail.textContent = '失败 ' + fmt(errReq) + ' 次';

  // KPI 8: API 等价花费（跟随范围切换；与网关页一致，人民币与美元同时给出）
  if(data.usd_cny) costUsdRate = Number(data.usd_cny) || costUsdRate;
  const elCostRange = document.getElementById('kpiCostRange');
  const elCostValue = document.getElementById('kpiCostValue');
  const elCostDetail = document.getElementById('kpiCostDetail');
  if(elCostRange) elCostRange.textContent = '(' + rangeLabel() + ')';
  // 关闭时卡片留在原地（观感不变），数值显示「—」：后端根本没有折算金额，
  // 这里不能把「没有数」渲染成 ￥0.000。
  if(elCostValue) elCostValue.innerHTML = PRICING_ON
    ? fmtCostBoth(currentSum.cost_cny != null ? currentSum.cost_cny : 0, 14) : '—';
  if(elCostDetail) elCostDetail.innerHTML = (PRICING_ON && analyticsRange !== 'all' && sumAll.cost_cny != null)
    ? '总计（全部历史）' + fmtCostBoth(sumAll.cost_cny, 11) + '<br>按 OpenRouter 模型价折算'
    : '按 OpenRouter 模型价折算的等价 token 花费';

  // Table 1: 账号透视表
  const acctTbody = document.getElementById('analyticsAccountTbody');
  const acctCountEm = document.getElementById('analyticsAcctCount');
  let accts = (data.accounts || []).filter(a => {
    if(a.uid === '(unattributed)' && !((a.window || {}).requests || a.all_time.requests)) return false;
    return true;
  });
  if(acctCountEm) acctCountEm.textContent = accts.length ? '(' + accts.length + ' 个账号)' : '';

  if(acctTbody){
    if(!accts.length){
      acctTbody.innerHTML = '<tr><td colspan="8" class="empty">暂无账号用量数据</td></tr>';
    } else {
      acctTbody.innerHTML = accts.map(a => {
        // window 桶就是当前选中的范围，也就是这张表要展示的口径。
        const st = a.window || {};
        const modelsMap = a.window_models || {};
        const entries = Object.entries(modelsMap || {}).sort((x, y) => (y[1].tokens || 0) - (x[1].tokens || 0));
        
        let pills = '<span style="color:var(--dim)">无调用</span>';
        if(entries.length){
          pills = entries.map(([mid, ms]) => {
            return '<span class="model-pill">'
              + '<b style="color:var(--fg)">' + esc(mid) + '</b>: '
              + ms.requests + '次 · <b style="color:var(--accent)">' + fmtCompact(ms.tokens) + '</b> tok'
              + '</span>';
          }).join('');
        }

        const realmBadge = a.realm === 'cn'
          ? '<span class="badge warn" style="font-size:10px">国内版</span>'
          : '<span class="badge s" style="font-size:10px">国际版</span>';

        let creditStr = '<span style="color:var(--dim)">—</span>';
        if(a.credits && a.credits.remain != null){
          if(a.credits.size){
            creditStr = '<b style="color:var(--accent2)">' + fmt(a.credits.remain) + '</b> <span style="color:var(--dim);font-size:11px">/ ' + fmt(a.credits.size) + ' 积分</span>';
          } else {
            creditStr = '<b style="color:var(--accent2)">' + fmt(a.credits.remain) + '</b> <span style="color:var(--dim);font-size:11px">积分</span>';
          }
        }

        return '<tr>'
          + '<td style="text-align:left">'
          +   '<b>' + esc(a.nickname || a.uid) + '</b>'
          +   '<div style="color:var(--dim);font-size:11px;font-family:monospace">' + esc((a.uid || '').slice(0, 10)) + '...</div>'
          + '</td>'
          + '<td>' + realmBadge + '</td>'
          + '<td>' + creditStr + '</td>'
          + '<td>' + fmt(st.requests || 0) + '</td>'
          + '<td><b style="color:var(--accent)">' + fmtCompact(st.total_tokens || 0) + '</b></td>'
          + '<td><b style="color:var(--accent2)">' + (st.credit != null ? Number(st.credit).toFixed(2) : '0.00') + '</b></td>'
          + '<td style="text-align:left;max-width:440px">' + pills + '</td>'
          + '<td class="pricing-col" style="color:var(--warn)" title="OpenRouter 价估算：按 OpenRouter 公布的模型价折算，覆盖该账号在所选区间内的请求；按条件定价的模型（输入长度阈值或时段）按每条请求取档；单条请求实际用的策略、三档单价与匹配来源见「最近请求」里那条的悬停提示">'
          +   (st.cost_cny != null && st.cost_cny > 0 ? fmtCost(st.cost_cny) : '<span style="color:var(--dim)">—</span>')
          + '</td>'
          + '</tr>';
      }).join('');
    }
    applyTableSort('analyticsAccountTable');
  }

  renderKeyTable(data);
}

/* 按 API Key 的归属表。口径与账号表完全一致（window 桶 = 当前选中范围），
   所以两张表的请求数应当相等；对不上是数据问题，不是渲染能修的，故这里
   不隐藏任何会兜差额的行——(未知 key) 正是用来兜住差额的。唯一能收起的是
   「(切换前)」：它是升级前的历史尾巴，只减不增，收起与否都不影响对账。 */

/* 「(切换前)」行开关的状态。表格每 5 秒重绘一次，所以状态不能存在渲染函数
   里，得放在外面；偏好与账号区折叠一样存服务端的 accounts/settings.json
   （key_before_hidden），不用 localStorage。 */
let keyBeforeHidden = false;
let lastKeyData = null;
/* 唯一的写入口：内存状态、复选框与表格一起改，三者不会不同步。 */
function applyKeyBeforeHidden(hidden){
  keyBeforeHidden = hidden === true;
  const box = document.getElementById('keyBeforeToggle');
  if(box) box.checked = keyBeforeHidden;
  if(lastKeyData) renderKeyTable(lastKeyData);
  return keyBeforeHidden;
}
// 显式选择走既有的 settings save 通道（一个键的 patch，不动别的设置）。
async function onKeyBeforeToggle(box){
  const next = !!(box && box.checked);
  applyKeyBeforeHidden(next);
  try {
    await postJSON('/settings/save', {key_before_hidden: next});
  } catch(e) {
    toast('「(切换前)」行开关保存失败: ' + e.message, 'bad');
  }
}
function keyRealmCell(k){
  if(k.source === 'bucket') return '<span style="color:var(--dim)">—</span>';
  if(k.realm === 'cn') return '<span class="badge warn" style="font-size:10px">国内版</span>';
  if(k.realm === 'intl') return '<span class="badge s" style="font-size:10px">国际版</span>';
  // realm 为空的 Key 不绑出口，而是跟着模型走：它可能两个出口都用过，
  // 那时代理返回的积分是两个价格体系相加的结果，必须说出来。
  if(k.cross_realm) return '<span class="badge warn" style="font-size:10px">跟随 · 混合</span>';
  return '<span class="badge off" style="font-size:10px">跟随</span>';
}

function keyModelPills(k){
  const pills = (k.models || []).map(m =>
    '<span class="model-pill">'
    + '<b style="color:var(--fg)">' + esc(m.model) + '</b>: '
    + m.requests + '次 · <b style="color:var(--accent)">' + fmtCompact(m.tokens) + '</b> tok'
    + '</span>');
  const rest = k.models_other;
  if(rest){
    pills.push('<span class="model-pill">'
      + '<b style="color:var(--dim)">' + esc(rest.model || '(其他)') + '</b> '
      + '<span style="color:var(--dim)">' + (rest.models || 0) + ' 个模型 · </span>'
      + rest.requests + '次 · ' + fmtCompact(rest.tokens) + ' tok</span>');
  }
  return pills.length ? pills.join('') : '<span style="color:var(--dim)">无调用</span>';
}

function renderKeyTable(data){
  const tbody = document.getElementById('analyticsKeyTbody');
  if(!tbody) return;
  const countEm = document.getElementById('analyticsKeyCount');
  const note = document.getElementById('analyticsKeyNote');
  const keys = data.keys || [];
  lastKeyData = data;
  const wrap = document.getElementById('keyBeforeSwitch');
  const box = document.getElementById('keyBeforeToggle');
  const hasBefore = keys.some(k => k.key === '__before_keys__');
  // 新装的环境没有这一行，就没得收，开关也不该出现。
  if(wrap) wrap.style.display = hasBefore ? '' : 'none';
  if(box) box.checked = keyBeforeHidden;
  const shown = keyBeforeHidden ? keys.filter(k => k.key !== '__before_keys__') : keys;
  if(countEm) countEm.textContent = shown.length ? '(' + shown.length + ' 把)' : '';

  if(note){
    const named = keys.filter(k => k.source !== 'bucket');
    const cross = named.filter(k => k.cross_realm).length;
    const parts = [];
    if(!named.length) parts.push('设置里还没有任何 API Key，全部流量都落在下面的未归属行里。');
    if(cross) parts.push('有 ' + cross + ' 把 Key 没有绑定出口，它的积分由国际版与国内版两套价格相加而来，只能当量级看。');
    // 收起那行时就不再解释那行，否则读者找不到话里指的东西。
    if(!keyBeforeHidden) parts.push('Key 维度只从本次升级之后开始记录：更早的请求没有这个字段，会一直留在「(切换前)」里且不会再增长。');
    note.innerHTML = parts.join(' ');
  }

  if(!shown.length){
    tbody.innerHTML = '<tr><td colspan="8" class="empty">暂无 API Key 用量数据</td></tr>';
    return;
  }

  tbody.innerHTML = shown.map(k => {
    const st = k.window || {};
    const sub = {panel:'面板 Key', launcher:'启动参数', bucket:'未归属', builtin:'内置'}[k.source] || '';
    let nameCell = '<td style="text-align:left" data-label="API Key">'
      + '<b>' + esc(k.name || k.key) + '</b>';
    if(sub || !k.enabled){
      nameCell += '<div style="font-size:11px">'
        + (sub ? '<span style="color:var(--dim)">' + esc(sub) + '</span>' : '')
        + (!k.enabled && k.source === 'panel' ? '<span class="badge off mini">已禁用</span>' : '')
        + '</div>';
    }
    nameCell += '</td>';

    const reqCell = '<td data-label="请求次数">' + fmt(st.requests || 0) + ' 次'
      + (st.errors ? '<span style="color:var(--bad);font-size:11px"> · 失败 ' + fmt(st.errors) + '</span>' : '')
      + '</td>';
    const tokCell = '<td data-label="消耗总 Token"><b style="color:var(--accent)">'
      + fmtCompact(st.total_tokens || 0) + '</b></td>';
    const splitCell = '<td data-label="输入 · 输出 · 思考" style="font-size:12px">'
      + '<span style="color:var(--accent)">' + fmtCompact(st.prompt_tokens || 0) + '</span>'
      + ' <span style="color:var(--dim-light)">/</span> '
      + '<span style="color:var(--accent2)">' + fmtCompact(st.completion_tokens || 0) + '</span>'
      + ' <span style="color:var(--dim-light)">/</span> '
      + '<span style="color:var(--think)">' + fmtCompact(st.reasoning_tokens || 0) + '</span>'
      + '</td>';
    const cacheCell = '<td data-label="缓存命中">'
      + (st.cache_hit_pct != null ? st.cache_hit_pct.toFixed(1) : '0.0') + '%</td>';
    const creditCell = '<td data-label="消耗积分"><b style="color:var(--accent2)">'
      + (st.credit != null ? Number(st.credit).toFixed(2) : '0.00') + '</b></td>';
    const modelCell = '<td style="text-align:left;max-width:440px" data-label="调用的模型分布">'
      + keyModelPills(k) + '</td>';

    return '<tr>'
      + nameCell
      + '<td data-label="出口">' + keyRealmCell(k) + '</td>'
      + reqCell + tokCell + splitCell + cacheCell + creditCell + modelCell
      + '</tr>';
  }).join('');
  applyTableSort('analyticsKeyTable');
}

