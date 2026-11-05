/* 面板会话令牌的存储键。全页只在这里定义一次：首帧判定要用它，所以必须先于
   任何页面内容；后面的脚本直接复用这个绑定，不要再写一遍字面量。 */
const PANEL_STORE = 'wb-proxy-panel-token';
const PANEL_REMEMBER_KEY = 'wb-proxy-panel-remember';
(function(){
  var panelToken = '';
  try { panelToken = sessionStorage.getItem(PANEL_STORE) || ''; } catch(e){}
  try { panelToken = panelToken || localStorage.getItem(PANEL_STORE) || ''; } catch(e){}
  if(panelToken) document.documentElement.classList.add('wb-panel-session');
})();
/* 新导航使用显式 URL 参数启用，默认保留用户现有布局。 */
(function(){
  var next = false;
  try { next = new URLSearchParams(location.search).get('ui') === 'next'; } catch(e){}
  if(typeof window !== 'undefined') window.__NEXT_UI__ = next;
  if(next && typeof document !== 'undefined' && document.documentElement) document.documentElement.setAttribute('data-ui', 'next');
})();

