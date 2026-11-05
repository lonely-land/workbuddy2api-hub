var defaultConsoleLayout = true;
try { defaultConsoleLayout = localStorage.getItem('wb-console-layout') !== '0'; } catch(e){}
if(!window.__NEXT_UI__ && defaultConsoleLayout) {
  document.documentElement.setAttribute('data-console-layout','on');
  document.getElementById('wb-alibaba-console').media = 'all';
  document.getElementById('wb-console-v2').media = 'all';
}

