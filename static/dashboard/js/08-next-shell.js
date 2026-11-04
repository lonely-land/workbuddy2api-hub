/* ---- 新面板外壳（/next）----
   只做导航、布局和状态同步，业务逻辑仍由上面的页面脚本负责。旧 / 不加载
   这些视觉规则，但脚本本身是幂等的：没有新壳节点时直接返回。 */
(function(){
  'use strict';

  var NEXT = !!window.__NEXT_UI__;
  var MORE_TABS = ['tasks', 'agents', 'media', 'settings', 'logs'];

  function nextCurrentTab(){
    var page = document.querySelector('.main-page.active');
    if(!page) return '';
    var id = page.id || '';
    if(id === 'pageOverview') return 'overview';
    if(id === 'pageGateway') return 'gateway';
    if(id === 'pageAccounts') return 'accounts';
    if(id === 'pageTasks') return 'tasks';
    if(id === 'pageAnalytics') return 'analytics';
    if(id === 'pageAgents') return 'agents';
    if(id === 'pageMedia') return 'media';
    if(id === 'pageSettings') return 'settings';
    if(id === 'pageLogs') return 'logs';
    return '';
  }

  function nextRealmLabel(){
    var realm = window.VIEW_REALM || 'intl';
    if(realm === 'codearts') return 'CodeArts';
    if(realm === 'cn') return '国内版';
    return '国际版';
  }

  var NEXT_META = {
    overview: { title: '总览', desc: '出口、账号健康和最近请求一屏看完。' },
    gateway: { title: '网关', desc: '模型目录、能力、思考档位与在售倍率。' },
    accounts: { title: '账号', desc: 'WorkBuddy 与 CodeArts 账号、积分和签到记录。' },
    analytics: { title: '用量', desc: 'Token、请求、缓存、成本和剩余额度。' },
    tasks: { title: '自动化', desc: '每日活跃、成长任务和后台调度器。' },
    agents: { title: '智能体', desc: '把本机 AI 客户端一键指向当前网关。' },
    media: { title: '媒体', desc: '图片与视频生成任务、额度、价格和账号分配。' },
    settings: { title: '设置', desc: 'API Key、出口、模型、调度和系统选项。' },
    logs: { title: '日志', desc: '实时运行日志、筛选、导出和落库状态。' }
  };

  function nextHideConflictingSettings(){
    var sep = document.getElementById('setAccountsSeparate');
    if(sep){
      var sec = sep.closest ? sep.closest('section') : null;
      if(sec){ sec.setAttribute('data-next-hidden', '1'); sec.hidden = true; }
    }
  }

  function nextHideLegacyHeaders(){
    [['pageSettings', '网关设置'], ['pageTasks', '任务与福利'], ['pageAgents', '智能体配置']].forEach(function(pair){
      var page = document.getElementById(pair[0]);
      if(!page) return;
      var heads = page.querySelectorAll('h2');
      for(var i = 0; i < heads.length; i++){
        if((heads[i].textContent || '').indexOf(pair[1]) >= 0){
          var box = heads[i].closest ? heads[i].closest('div') : null;
          if(box && !(box.classList && box.classList.contains('page-nav-body'))) box.hidden = true;
          break;
        }
      }
    });
  }

  function nextApplyHiddenPages(){
    var hidden = [];
    try {
      if(typeof _hiddenPages !== 'undefined' && Array.isArray(_hiddenPages)) hidden = _hiddenPages;
    } catch(e){}
    var order = ['overview', 'gateway', 'accounts', 'analytics', 'tasks', 'agents', 'media', 'settings', 'logs'];
    var firstVisible = '';
    order.forEach(function(key){
      var off = hidden.indexOf(key) >= 0;
      if(!off && !firstVisible) firstVisible = key;
      Array.prototype.forEach.call(document.querySelectorAll('[data-next-tab="' + key + '"]'), function(el){
        el.hidden = off;
      });
    });
    var cur = nextCurrentTab();
    if(cur && hidden.indexOf(cur) >= 0 && firstVisible && firstVisible !== cur){
      if(typeof switchMainTab === 'function') switchMainTab(firstVisible);
    }
  }

  function nextUpdateSchedSwitch(){
    var sw = document.getElementById('nextSchedSwitch');
    var txt = document.getElementById('schedStatusText');
    if(!sw) return;
    var on = txt ? (txt.textContent || '').indexOf('运行中') >= 0 : true;
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function nextSyncChrome(tab){
    if(!NEXT) return;
    tab = tab || nextCurrentTab() || 'overview';
    var meta = NEXT_META[tab] || NEXT_META.overview;
    var title = document.getElementById('nextPageTitle');
    var desc = document.getElementById('nextPageDesc');
    if(title) title.textContent = meta.title;
    if(desc) desc.textContent = meta.desc;

    Array.prototype.forEach.call(document.querySelectorAll('#nextNav [data-next-tab]'), function(item){
      item.classList.toggle('active', item.getAttribute('data-next-tab') === tab);
    });
    var inMore = MORE_TABS.indexOf(tab) >= 0;
    Array.prototype.forEach.call(document.querySelectorAll('#nextBottomNav [data-next-tab]'), function(item){
      item.classList.toggle('active', item.getAttribute('data-next-tab') === tab);
    });
    var moreBtn = document.getElementById('nextMoreBtn');
    if(moreBtn) moreBtn.classList.toggle('active', inMore);
    Array.prototype.forEach.call(document.querySelectorAll('#nextMoreSheet [data-next-tab]'), function(item){
      item.classList.toggle('active', item.getAttribute('data-next-tab') === tab);
    });

    var realm = nextRealmLabel();
    var realmKey = window.VIEW_REALM || 'intl';
    var realmName = document.getElementById('nextRealmName');
    if(realmName) realmName.textContent = realm;
    var gatewayRealm = document.getElementById('nextGatewayRealm');
    if(gatewayRealm) gatewayRealm.textContent = realm;
    Array.prototype.forEach.call(document.querySelectorAll('#nextGatewayRealmSwitch [data-realm]'), function(btn){
      btn.classList.toggle('active', btn.getAttribute('data-realm') === realmKey);
    });
    var caBtn = document.getElementById('nextGatewayRealmCodearts');
    var caCard = document.getElementById('tabCodearts');
    if(caBtn){
      var caVisible = !!(caCard && getComputedStyle(caCard).display !== 'none');
      caBtn.hidden = !caVisible;
    }
    var agentsOff = false;
    try { agentsOff = (typeof AGENTS_AVAILABLE !== 'undefined' && !AGENTS_AVAILABLE); } catch(e){}
    Array.prototype.forEach.call(document.querySelectorAll('[data-next-tab="agents"]'), function(el){
      el.classList.toggle('next-disabled', agentsOff);
      if(agentsOff){
        el.setAttribute('title', '智能体配置只在网关本机、用 127.0.0.1 打开面板时可用');
        el.setAttribute('data-disabled', '1');
      } else {
        el.removeAttribute('title');
        el.removeAttribute('data-disabled');
      }
    });
    if(tab === 'settings'){ nextHideConflictingSettings(); nextSettingsApplySaved(); }
    nextHideLegacyHeaders();
    nextApplyHiddenPages();
    nextUpdateSchedSwitch();
  }

  function nextGo(tab){
    var agentsOff = false;
    try { agentsOff = (typeof AGENTS_AVAILABLE !== 'undefined' && !AGENTS_AVAILABLE); } catch(e){}
    if(tab === 'agents' && agentsOff){
      nextOpenMore(false);
      nextOpenSidebar(false);
      if(typeof toast === 'function'){
        toast('智能体配置只在网关本机、用 127.0.0.1 打开面板时可用；当前是远程或容器访问。', 'warn');
      }
      return;
    }
    if(tab === 'accounts' && typeof applyAccountsTabLayout === 'function'){
      applyAccountsTabLayout(true);
    }
    if(typeof switchMainTab === 'function') switchMainTab(tab);
    nextSyncChrome(nextCurrentTab() || tab);
    nextOpenMore(false);
    nextOpenSidebar(false);
  }

  function nextOpenMore(open){
    var sheet = document.getElementById('nextMoreSheet');
    if(!sheet) return;
    var on = !!open;
    sheet.classList.toggle('open', on);
    sheet.setAttribute('aria-hidden', on ? 'false' : 'true');
    document.body.classList.toggle('next-more-open', on);
  }

  function nextOpenSidebar(open){
    var sidebar = document.getElementById('nextSidebar');
    if(!sidebar) return;
    var on = (open === undefined) ? !document.body.classList.contains('next-sidebar-open') : !!open;
    document.body.classList.toggle('next-sidebar-open', on);
  }

  var NEXT_SETTINGS_GROUP_ORDER = ['basic', 'api', 'model', 'automation', 'stability', 'system'];
  var NEXT_SETTINGS_GROUPS = {
    basic: {
      title: '基础',
      desc: '面板密码、界面语言、窗口限制和隐私声明。',
      items: ['面板访问密码', '界面语言', '顶部页签显示', '账号独立成一个页签', '面板窗口限高', '数据用途声明']
    },
    api: {
      title: 'API 与出口',
      desc: 'API Key、CodeArts、代理槽、账号限额和出站身份。',
      items: ['API Key', 'CodeArts 接入', '账号代理槽', '账号限额', '自动切换出站身份', '出站身份版本号', '跨出口回退']
    },
    model: {
      title: '模型与定价',
      desc: '价格估算、Anthropic 适配、思考档位和模型过滤。',
      items: ['模型价格估算', '启用 Anthropic Messages', '思考等级挡位映射', '按 API Key 过滤模型列表', '只列出可用模型', '免费额度耗尽回退积分版']
    },
    automation: {
      title: '自动化',
      desc: '每日活跃、全局提示词、本地网络工具和剩余用量调度。',
      items: ['国际版每日活跃打卡', '全局提示词', '本地网络工具', '剩余用量优先调度']
    },
    stability: {
      title: '稳定性',
      desc: '额度探针、退避、超时、并发上限和会话粘滞。',
      items: ['模型额度窗口探针', '出口级瞬时失败退避', '模型额度定时主动查询', '用量聚合保留窗口', '上游响应头超时', '账号级并发上限', '单请求体上限', '更稳的会话粘滞键']
    },
    system: {
      title: '日志与系统',
      desc: '日志落库、更新、版本回退和运行信息。',
      items: ['日志落库', '更新', '版本回退', '运行信息']
    }
  };

  function nextSettingsSectionGroup(sec){
    var h = sec.querySelector('h2');
    var text = h ? (h.textContent || '').replace(/\s+/g, ' ').trim() : '';
    var lower = text.toLowerCase();
    for(var i = 0; i < NEXT_SETTINGS_GROUP_ORDER.length; i++){
      var key = NEXT_SETTINGS_GROUP_ORDER[i];
      var items = NEXT_SETTINGS_GROUPS[key].items;
      for(var j = 0; j < items.length; j++){
        if(lower.indexOf(items[j].toLowerCase()) === 0) return key;
      }
    }
    return 'system';
  }

  function nextSettingsApplySaved(){
    var key = '';
    try {
      var q = new URLSearchParams(location.search).get('group');
      if(q && NEXT_SETTINGS_GROUPS[q]) key = q;
      if(!key){
        var s = localStorage.getItem('wb-next-settings-group');
        if(s && NEXT_SETTINGS_GROUPS[s]) key = s;
      }
    } catch(e){}
    if(!key) key = 'basic';
    nextSettingsGroup(key, null, { noScroll: true, noUrl: true });
  }

  function nextSettingsGroup(key, btn, opts){
    opts = opts || {};
    if(!NEXT_SETTINGS_GROUPS[key]) key = 'basic';
    var page = document.getElementById('pageSettings');
    if(!page) return;
    nextHideConflictingSettings();
    var sections = page.querySelectorAll('section');
    Array.prototype.forEach.call(sections, function(sec){
      var group = nextSettingsSectionGroup(sec);
      var permanentlyHidden = sec.getAttribute('data-next-hidden') === '1';
      sec.hidden = permanentlyHidden || group !== key;
    });
    Array.prototype.forEach.call(document.querySelectorAll('#nextSettingsGroups .next-settings-group'), function(b){
      b.classList.toggle('active', b.getAttribute('data-settings-group') === key);
    });
    var def = NEXT_SETTINGS_GROUPS[key];
    var title = document.getElementById('nextSettingsTitle');
    var desc = document.getElementById('nextSettingsDesc');
    if(title) title.textContent = def.title;
    if(desc) desc.textContent = def.desc;
    try { localStorage.setItem('wb-next-settings-group', key); } catch(e){}
    if(!opts.noUrl){
      try {
        var url = new URL(window.location.href);
        url.searchParams.set('tab', 'settings');
        url.searchParams.set('group', key);
        history.replaceState(null, '', url.toString());
      } catch(e){}
    }
    if(!opts.noScroll){
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  window.nextCurrentTab = nextCurrentTab;
  window.nextSyncChrome = nextSyncChrome;
  window.nextGo = nextGo;
  window.nextOpenMore = nextOpenMore;
  window.nextOpenSidebar = nextOpenSidebar;
  window.nextSettingsGroup = nextSettingsGroup;

  if(!NEXT){
    /* 合并页面时保留 pageGateway，供控制台的模型和请求子视图使用。 */
    var oldModels = document.getElementById('pageGateway');
    var oldOverview = document.getElementById('pageOverview');
    if(oldModels && oldOverview){
      var firstModel = oldModels.firstChild;
      while(oldOverview.firstChild) oldModels.insertBefore(oldOverview.firstChild, firstModel);
      if(oldOverview.parentNode) oldOverview.parentNode.removeChild(oldOverview);
    }
    return;
  }

  /* 旧顶栏右侧（主题、语言、状态）搬进新顶栏，保留原 ID 和事件。 */
  var headerRight = document.querySelector('header .header-right');
  var actions = document.getElementById('nextTopbarActions');
  if(headerRight && actions && headerRight.parentNode !== actions){
    actions.appendChild(headerRight);
  }

  /* 调度器属于自动化页，不再占着总览的汇总卡。 */
  var sched = document.getElementById('schedulerBar');
  var tasksPage = document.getElementById('pageTasks');
  if(sched && tasksPage && sched.parentNode !== tasksPage){
    var schedSection = document.createElement('section');
    schedSection.className = 'next-scheduler-section';
    var schedHead = document.createElement('div');
    schedHead.className = 'next-section-head';
    schedHead.innerHTML = '<div><h2>后台调度器</h2><p>定时签到、活跃、保活和任务巡检；关闭后不再自动执行，手动按钮仍可用。</p></div>'
      + '<div class="next-sched-toggle"><span>自动执行</span>'
      + '<button type="button" id="nextSchedSwitch" class="next-switch" role="switch" aria-checked="true" onclick="toggleScheduler(this)" title="暂停或恢复后台调度器"><span class="next-switch-knob"></span></button></div>';
    schedSection.appendChild(schedHead);
    schedSection.appendChild(sched);
    tasksPage.insertBefore(schedSection, tasksPage.firstChild);
  }

  /* 旧页签的 switchMainTab 是唯一入口：包一层，让新导航始终跟着真实页面走。 */
  if(typeof window.switchMainTab === 'function' && !window.__NEXT_SWITCH_WRAPPED__){
    window.__NEXT_SWITCH_WRAPPED__ = true;
    var originalSwitch = window.switchMainTab;
    window.switchMainTab = function(tab){
      var result = originalSwitch.apply(this, arguments);
      nextSyncChrome(nextCurrentTab() || tab);
      return result;
    };
  }
  if(typeof window.switchViewRealm === 'function' && !window.__NEXT_REALM_WRAPPED__){
    window.__NEXT_REALM_WRAPPED__ = true;
    var originalRealm = window.switchViewRealm;
    window.switchViewRealm = function(){
      var result = originalRealm.apply(this, arguments);
      nextSyncChrome(nextCurrentTab());
      return result;
    };
  }
  if(typeof window.applyHiddenPages === 'function' && !window.__NEXT_HIDDEN_WRAPPED__){
    window.__NEXT_HIDDEN_WRAPPED__ = true;
    var originalHiddenPages = window.applyHiddenPages;
    window.applyHiddenPages = function(){
      var result = originalHiddenPages.apply(this, arguments);
      nextApplyHiddenPages();
      return result;
    };
  }
  if(typeof window.loadSchedulerStatus === 'function' && !window.__NEXT_SCHED_WRAPPED__){
    window.__NEXT_SCHED_WRAPPED__ = true;
    var originalSchedulerStatus = window.loadSchedulerStatus;
    window.loadSchedulerStatus = function(){
      var result = originalSchedulerStatus.apply(this, arguments);
      if(result && typeof result.then === 'function'){
        return result.then(function(value){ nextUpdateSchedSwitch(); return value; });
      }
      nextUpdateSchedSwitch();
      return result;
    };
  }

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){
      nextOpenMore(false);
      nextOpenSidebar(false);
    }
  });

  document.addEventListener('DOMContentLoaded', function(){
    nextHideConflictingSettings();
    nextHideLegacyHeaders();
    nextSyncChrome(nextCurrentTab() || 'overview');
    setTimeout(function(){ nextHideConflictingSettings(); nextHideLegacyHeaders(); }, 800);
  });
  nextSyncChrome(nextCurrentTab() || 'overview');
})();

