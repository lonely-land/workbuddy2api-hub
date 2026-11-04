/* Runs before <body> is parsed, so the page the user last had is the
   first one painted. Kept inline and dependency-free on purpose: an
   external or deferred script would run too late to avoid the flash. */
(function(){
  var THEME_KEY = 'wb-theme';
  var THEME_STYLE_KEY = 'wb-theme-style';
  var THEME_STYLES = {
    claude: {label:'Claude', light:{"--bg":"#efebe0","--panel":"#ffffff","--panel2":"#e9e5d6","--panel3":"#e0dbc9","--line":"#d5cfbc","--line-hover":"#c5bfab","--fg":"#1f1e1b","--dim":"#625f57","--dim-light":"#87847a","--accent":"#a14427","--accent-hover":"#8a3a20","--accent-soft":"rgba(161,68,39,.09)","--accent-selected-bg":"rgba(161,68,39,.14)","--accent2":"#497035","--accent2-soft":"rgba(73,112,53,.12)","--warn":"#a0691c","--warn-soft":"rgba(183,121,31,.12)","--think":"#7d5c8a","--think-soft":"rgba(125,92,138,.10)","--bad":"#b5473b","--bad-soft":"rgba(181,71,59,.09)","--shadow-sm":"0 1px 2px 0 rgba(31,30,27,.05)","--shadow":"0 1px 2px 0 rgba(31,30,27,.05),0 4px 14px rgba(31,30,27,.04)","--shadow-md":"0 2px 6px 0 rgba(31,30,27,.06),0 12px 32px rgba(31,30,27,.09)","--header-bg":"rgba(239,235,224,.92)","--hm0":"#ece6db","--hm1":"#f3d5c1","--hm2":"#e8a98a","--hm3":"#d6846a","--hm4":"#b4533a"}, dark:{"--bg":"#1f1e1b","--panel":"#2d2c25","--panel2":"#38362f","--panel3":"#433f37","--line":"#4f4b42","--line-hover":"#5d584e","--fg":"#edebe3","--dim":"#a5a29a","--dim-light":"#9c9a90","--accent":"#e88a68","--accent-hover":"#f0967a","--accent-soft":"rgba(232,138,104,.14)","--accent-selected-bg":"rgba(232,138,104,.18)","--accent2":"#8fae78","--accent2-soft":"rgba(143,174,120,.15)","--warn":"#d9b25f","--warn-soft":"rgba(217,178,95,.15)","--think":"#bfa3cc","--think-soft":"rgba(191,163,204,.15)","--bad":"#d97b72","--bad-soft":"rgba(217,123,114,.15)","--shadow-sm":"0 1px 2px 0 rgba(0,0,0,.25)","--shadow":"0 1px 2px 0 rgba(0,0,0,.25),0 4px 14px rgba(0,0,0,.25)","--shadow-md":"0 2px 6px 0 rgba(0,0,0,.3),0 12px 32px rgba(0,0,0,.4)","--header-bg":"rgba(31,30,27,.92)","--hm0":"#2b2924","--hm1":"#3d352e","--hm2":"#5a3e30","--hm3":"#8a5a45","--hm4":"#c97250"}},
    alibaba: {label:'Alibaba', light:{"--bg":"#f5f7fa","--panel":"#ffffff","--panel2":"#f2f4f7","--panel3":"#e9edf2","--line":"#e3e8ef","--line-hover":"#c9d3e1","--fg":"#1d2129","--dim":"#4e5969","--dim-light":"#86909c","--accent":"#ff6a00","--accent-hover":"#e65f00","--accent-soft":"rgba(255,106,0,.10)","--accent-selected-bg":"rgba(255,106,0,.08)","--accent2":"#00a870","--accent2-soft":"rgba(0,168,112,.12)","--warn":"#ff9a2e","--warn-soft":"rgba(255,154,46,.14)","--think":"#1677ff","--think-soft":"rgba(22,119,255,.10)","--bad":"#d93026","--bad-soft":"rgba(217,48,38,.10)","--shadow-sm":"0 1px 2px rgba(29,33,41,.05)","--shadow":"0 1px 2px rgba(29,33,41,.04)","--shadow-md":"0 6px 16px rgba(29,33,41,.08)","--header-bg":"rgba(255,255,255,.92)","--hm0":"#fff3e8","--hm1":"#ffd9bf","--hm2":"#ffb27a","--hm3":"#ff8a3d","--hm4":"#ff6a00"}, dark:{"--bg":"#0f172a","--panel":"#151f32","--panel2":"#1b2940","--panel3":"#22334e","--line":"#2a3a50","--line-hover":"#3b4d66","--fg":"#f2f5fa","--dim":"#a9b7c9","--dim-light":"#8494a8","--accent":"#ff7a1a","--accent-hover":"#ff9440","--accent-soft":"rgba(255,122,26,.15)","--accent-selected-bg":"rgba(255,122,26,.18)","--accent2":"#2bd19a","--accent2-soft":"rgba(43,209,154,.16)","--warn":"#ffb454","--warn-soft":"rgba(255,180,84,.16)","--think":"#5b9cff","--think-soft":"rgba(91,156,255,.16)","--bad":"#ff6b6b","--bad-soft":"rgba(255,107,107,.16)","--shadow-sm":"0 1px 2px rgba(0,0,0,.35)","--shadow":"0 1px 2px rgba(0,0,0,.35)","--shadow-md":"0 8px 24px rgba(0,0,0,.45)","--header-bg":"rgba(15,23,42,.90)","--hm0":"#1b2940","--hm1":"#2a3a50","--hm2":"#6a3b1f","--hm3":"#b05a20","--hm4":"#ff7a1a"}},
    material: {label:'Material', light:{"--bg":"#fefbff","--panel":"#ffffff","--panel2":"#f5eff7","--panel3":"#ece6f0","--line":"#cac4d0","--line-hover":"#b4aab8","--fg":"#1d1b20","--dim":"#5b5b66","--dim-light":"#767680","--accent":"#6750a4","--accent-hover":"#4f378b","--accent-soft":"#eaddff","--accent-selected-bg":"#e8def8","--accent2":"#006a60","--accent2-soft":"#ccfbee","--warn":"#7e5260","--bad":"#b3261e","--bad-soft":"#f9dedc","--think":"#5e5891","--think-soft":"#e5dffa","--shadow-sm":"0 1px 2px 0 rgba(29,27,32,.15)","--shadow":"0 1px 2px 0 rgba(29,27,32,.18),0 1px 3px 1px rgba(29,27,32,.10)","--shadow-md":"0 2px 4px -1px rgba(29,27,32,.12),0 4px 6px 1px rgba(29,27,32,.10)","--header-bg":"rgba(254,251,255,.94)","--hm0":"#e8def8","--hm1":"#d3c2f1","--hm2":"#b8a1ec","--hm3":"#9a82e3","--hm4":"#6750a4"}, dark:{"--bg":"#141218","--panel":"#211f26","--panel2":"#2b2930","--panel3":"#36343b","--line":"#49454f","--line-hover":"#5b5963","--fg":"#e6e1e5","--dim":"#c4c5d0","--dim-light":"#928f9a","--accent":"#d0bcff","--accent-hover":"#b9a4fa","--accent-soft":"rgba(208,188,255,.24)","--accent-selected-bg":"rgba(208,188,255,.30)","--accent2":"#4ecdb4","--accent2-soft":"rgba(78,205,180,.24)","--warn":"#f2b8b4","--bad":"#f2b8b4","--bad-soft":"rgba(242,184,180,.24)","--think":"#cfc4f7","--think-soft":"rgba(207,196,247,.18)","--shadow-sm":"0 1px 2px 0 rgba(0,0,0,.30)","--shadow":"0 1px 2px 0 rgba(0,0,0,.40),0 1px 3px 1px rgba(0,0,0,.30)","--shadow-md":"0 2px 4px -1px rgba(0,0,0,.45),0 4px 6px 1px rgba(0,0,0,.32)","--header-bg":"rgba(20,18,24,.88)","--hm0":"#2b2930","--hm1":"#332e44","--hm2":"#3d3460","--hm3":"#4d4080","--hm4":"#d0bcff"}},
    miuix: {label:'MiuiX', light:{"--bg":"#f6f7fa","--panel":"#ffffff","--panel2":"#eef0f4","--panel3":"#e2e6ee","--line":"#dde1e8","--line-hover":"#c9d0db","--fg":"#1f2024","--dim":"#5f6671","--dim-light":"#8c93a0","--accent":"#ff5c00","--accent-hover":"#ff7a33","--accent-soft":"rgba(255,92,0,.10)","--accent-selected-bg":"rgba(255,92,0,.18)","--accent2":"#07c160","--accent2-soft":"rgba(7,193,96,.12)","--warn":"#d48200","--bad":"#e53935","--bad-soft":"rgba(229,57,53,.10)","--think":"#7c4dff","--think-soft":"rgba(124,77,255,.10)","--shadow-sm":"0 1px 2px 0 rgba(31,32,36,.05)","--shadow":"0 2px 6px 0 rgba(31,32,36,.08)","--shadow-md":"0 6px 16px 0 rgba(31,32,36,.10)","--header-bg":"rgba(255,255,255,.85)","--hm0":"#ffece0","--hm1":"#ffd0b8","--hm2":"#ffb085","--hm3":"#ff8c4a","--hm4":"#ff5c00"}, dark:{"--bg":"#0e0f12","--panel":"#191b1f","--panel2":"#22252b","--panel3":"#2a2d34","--line":"#2e3239","--line-hover":"#3a3f48","--fg":"#f0f1f4","--dim":"#9aa0aa","--dim-light":"#7a8090","--accent":"#ff7a33","--accent-hover":"#ff9056","--accent-soft":"rgba(255,122,51,.18)","--accent-selected-bg":"rgba(255,122,51,.26)","--accent2":"#3ed984","--accent2-soft":"rgba(62,217,132,.20)","--warn":"#ffb852","--bad":"#ff6f6f","--bad-soft":"rgba(255,111,111,.16)","--think":"#a78bff","--think-soft":"rgba(167,139,255,.18)","--shadow-sm":"0 1px 2px 0 rgba(0,0,0,.40)","--shadow":"0 2px 6px 0 rgba(0,0,0,.55)","--shadow-md":"0 6px 18px 0 rgba(0,0,0,.60)","--header-bg":"rgba(14,15,18,.78)","--hm0":"#22252b","--hm1":"#332820","--hm2":"#4a2c20","--hm3":"#5c3220","--hm4":"#ff7a33"}}
  };
  window.__WB_THEME_STYLES__ = THEME_STYLES;
  var STYLE_GEOMETRY = {claude:12, alibaba:10, material:14, miuix:20};
  Object.keys(THEME_STYLES).forEach(function(id){
    ['light','dark'].forEach(function(mode){
      var v=THEME_STYLES[id][mode];
      var r = STYLE_GEOMETRY[id] || 12;
      v['--radius-card'] = r + 'px';
      v['--radius-pill'] = (id === 'miuix' ? 16 : r) + 'px';
      v['--radius-control'] = Math.max(6, Math.round(r*0.6)) + 'px';
    });
  });
  function getStyle(){ try { var s=localStorage.getItem(THEME_STYLE_KEY); return THEME_STYLES[s] ? s : 'alibaba'; } catch(e){ return 'alibaba'; } }
  function setStyleAttr(s){ document.documentElement.setAttribute('data-theme-style',s); }
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function getPref(){
    try { return localStorage.getItem(THEME_KEY) || 'system'; } catch(e){ return 'system'; }
  }
  function resolve(pref){
    if(pref === 'dark' || pref === 'light') return pref;
    return (mq && mq.matches) ? 'dark' : 'light';
  }

  // 1. 初始化主题（防止闪烁）
  var savedTheme = getPref();
  var savedStyle = getStyle();
  var resolvedTheme = resolve(savedTheme);
  setStyleAttr(savedStyle);
  document.documentElement.setAttribute('data-theme', resolvedTheme);
  document.documentElement.setAttribute('data-theme-pref', savedTheme);
  document.documentElement.style.colorScheme = resolvedTheme;
  applyStyle(savedStyle);

  // 2. 主题切换核心与UI同步逻辑
  var svgSun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg>';
  var svgMoon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>';
  var svgMonitor = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>';

  function applyStyle(style){
    if(!THEME_STYLES[style]) style = 'alibaba';
    var vars = THEME_STYLES[style][resolvedTheme === 'dark' ? 'dark' : 'light'];
    setStyleAttr(style);
    // 新面板有自己的 token；旧主题预设只保留亮/暗切换，不再往根节点写
    // 内联变量，否则内联样式会压过 #nextStyles。
    if(!window.__NEXT_UI__){
      Object.keys(vars).forEach(function(k){ document.documentElement.style.setProperty(k, vars[k]); });
    }
    try { localStorage.setItem(THEME_STYLE_KEY, style); } catch(e){}
    return style;
  }
  function updateStyleUI(style){
    var menu = document.getElementById('themeDropdown');
    if(!menu) return;
    Array.prototype.forEach.call(menu.querySelectorAll('[data-theme-style-option]'), function(opt){
      opt.classList.toggle('active', opt.getAttribute('data-theme-style-option') === style);
    });
  }
  function updateThemeUI(pref, resolved){
    var icon = document.getElementById('themeToggleIcon');
    var btn = document.getElementById('themeToggleBtn');
    if(!icon) return;
    if(pref === 'dark'){
      icon.innerHTML = svgMoon;
    } else if(pref === 'light'){
      icon.innerHTML = svgSun;
    } else {
      icon.innerHTML = svgMonitor;
    }
    ['light', 'dark', 'system'].forEach(function(val){
      var opt = document.getElementById('themeOpt' + val.charAt(0).toUpperCase() + val.slice(1));
      if(opt) opt.classList.toggle('active', pref === val);
    });
    var label = pref === 'dark' ? '深色' : (pref === 'light' ? '浅色' : '跟随系统 (' + (resolved === 'dark' ? '当前深色' : '当前浅色') + ')');
    if(btn) btn.title = '颜色主题: ' + label;
  }

  window.applyStyle = function(style){
    style = THEME_STYLES[style] ? style : 'alibaba';
    try { localStorage.setItem(THEME_STYLE_KEY, style); } catch(e){}
    setStyleAttr(style);
    if(window.__NEXT_UI__){ updateStyleUI(style); return style; }
    var mode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var vars = THEME_STYLES[style][mode];
    Object.keys(vars).forEach(function(k){ document.documentElement.style.setProperty(k, vars[k]); });
    updateStyleUI(style);
    var analytics = document.getElementById('pageAnalytics');
    if(analytics){
      ['--bg','--panel','--panel2','--panel3','--line','--line2','--fg','--fg2','--dim','--dim2','--accent','--accent-2','--green','--green-soft','--gold','--red','--blue','--chart-bar','--chart-bar-soft','--chart-line','--hm0','--hm1','--hm2','--hm3','--hm4','--shadow','--shadow-lg'].forEach(function(k){
        var source = {'--green':'--accent2','--gold':'--warn','--red':'--bad'}[k] || k;
        analytics.style.setProperty(k, getComputedStyle(document.documentElement).getPropertyValue(source).trim());
      });
    }
    return style;
  };
  window.selectStyle = function(style, evt){
    if(evt){ evt.preventDefault(); evt.stopPropagation(); }
    window.applyStyle(style);
    var menu = document.getElementById('themeDropdown');
    var btn = document.getElementById('themeToggleBtn');
    if(menu) menu.classList.remove('open');
    if(btn) btn.setAttribute('aria-expanded', 'false');
    return false;
  };
  window.applyTheme = function(pref){
    var resolved = resolve(pref);
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-theme-pref', pref);
    document.documentElement.style.colorScheme = resolved;
    try { localStorage.setItem(THEME_KEY, pref); } catch(e){}
    window.applyStyle(getStyle());
    updateThemeUI(pref, resolved);
  };

  window.selectTheme = function(pref, evt){
    if(evt){
      evt.preventDefault();
      evt.stopPropagation();
    }
    window.applyTheme(pref);
    var menu = document.getElementById('themeDropdown');
    var btn = document.getElementById('themeToggleBtn');
    if(menu) menu.classList.remove('open');
    if(btn) btn.setAttribute('aria-expanded', 'false');
  };

  window.toggleThemeMenu = function(evt){
    if(evt){
      evt.preventDefault();
      evt.stopPropagation();
    }
    var menu = document.getElementById('themeDropdown');
    var btn = document.getElementById('themeToggleBtn');
    if(!menu) return;
    var isOpen = menu.classList.toggle('open');
    if(btn) btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  };

  window.initThemeSystem = function(){
    var curPref = getPref();
    updateThemeUI(curPref, resolve(curPref));
    if(mq && mq.addEventListener){
      mq.addEventListener('change', function(){
        if(getPref() === 'system'){
          window.applyTheme('system');
        }
      });
    }
    document.addEventListener('click', function(e){
      var wrap = document.getElementById('themeDropdownWrap');
      if(wrap && !wrap.contains(e.target)){
        var menu = document.getElementById('themeDropdown');
        var btn = document.getElementById('themeToggleBtn');
        if(menu && menu.classList.contains('open')){
          menu.classList.remove('open');
          if(btn) btn.setAttribute('aria-expanded', 'false');
        }
      }
    });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape'){
        var menu = document.getElementById('themeDropdown');
        var btn = document.getElementById('themeToggleBtn');
        if(menu && menu.classList.contains('open')){
          menu.classList.remove('open');
          if(btn) btn.setAttribute('aria-expanded', 'false');
        }
      }
    });
  };

  // 3. Tab 初始化（与下方主脚本的 MAIN_TABS 保持一致）
  var TABS = ['overview','gateway','accounts','tasks','media','analytics','agents','settings','logs'];
  var fallback = window.__NEXT_UI__ ? 'overview' : 'gateway';
  var pick = null;
  try {
    var q = new URLSearchParams(location.search).get('tab');
    var s = localStorage.getItem('wb-proxy-main-tab');
    pick = [q, s].find(function(t){ return TABS.indexOf(t) !== -1; }) || fallback;
  } catch(e) { pick = fallback; }
  window.__MAIN_TAB__ = pick;

  document.addEventListener('DOMContentLoaded', function(){
    TABS.forEach(function(t){
      var page = document.getElementById('page' + t.charAt(0).toUpperCase() + t.slice(1));
      if(page) page.classList.toggle('active', t === pick);
      var btn = document.getElementById('btnNav' + t.charAt(0).toUpperCase() + t.slice(1));
      if(btn) btn.classList.toggle('active', t === pick);
    });
    window.initThemeSystem();
    if(typeof initConsoleLayout === 'function') initConsoleLayout();
    if(typeof initConsoleShell === 'function') initConsoleShell();
    if(window.applyStyle) window.applyStyle(getStyle());
  });
})();

