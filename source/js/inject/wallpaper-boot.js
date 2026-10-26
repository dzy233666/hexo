/* ============================================================================
 * source/js/inject/wallpaper-boot.js —— 自定义壁纸首屏应用（全站）
 * ----------------------------------------------------------------------------
 * 为什么需要它：
 *   fomalhaut 主题的 #web_bg 背景是**构建时写死**在 index.css 里的：
 *       #web_bg { background: url(/assets/bg-violet.webp); ... }
 *   它**不读** --default-bg / --darkmode-bg 这些 CSS 变量。
 *   所以主题原有的「自定义背景」链路（#defineBg + localStorage['blogbg'] +
 *   changeAppearanceBackground()）在这套主题上只改变量、不改画面 —— 这就是
 *   「提示切换成功、实际看不到变化」的真正原因。
 *
 * 做法：
 *   用我们自己的 localStorage 键 wpbg 记住壁纸 URL，并在 head 里追加一个
 *   <style id="wpbg-style"> 直接覆盖 #web_bg 的 background-image（带 !important，
 *   且晚于主题样式插入，同特异性后声明者胜）。
 *   放在 inject.head、同步执行 —— 早于首帧，不会先闪默认壁纸再跳。
 *
 * 对外 API（供 /box/gallery/wallpaper/ 页面的切换脚本调用）：
 *   window.wpSetBackground(url)      设置并持久化
 *   window.wpResetBackground()       恢复默认（删键 + 移除 style）
 *   window.wpCurrentBackground()     读取当前保存的 URL（没设过返回 ''）
 *
 * 回滚：删掉本文件 + 配置里那一行 <script src="/js/inject/wallpaper-boot.js">。
 * ========================================================================== */

(function () {
  'use strict';

  var KEY = 'wpbg';
  var STYLE_ID = 'wpbg-style';
  // 旧逻辑（主题背景模块）留下的键；如果里面存的是壁纸专区的图，说明是那套失效链路写的，清掉
  var LEGACY_KEY = 'blogbg';

  function read() {
    try {
      return localStorage.getItem(KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function cssFor(url) {
    var u = 'url("' + url + '")';
    return (
      '#web_bg{' +
        'background-image:' + u + '!important;' +
        'background-attachment:local!important;' +
        'background-position:center!important;' +
        'background-size:cover!important;' +
        'background-repeat:no-repeat!important;' +
      '}' +
      '[data-theme="dark"] #web_bg{' +
        'background-image:' + u + '!important;' +
        'background-size:cover!important;' +
        'background-position:center!important;' +
      '}'
    );
  }

  function apply(url) {
    var el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = cssFor(url);
  }

  function clear() {
    var el = document.getElementById(STYLE_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function setBackground(url) {
    if (!url) return false;
    try {
      localStorage.setItem(KEY, url);
    } catch (e) {
      /* 隐私模式下写不进去，本次仍然生效 */
    }
    apply(url);
    return true;
  }

  function resetBackground() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      /* ignore */
    }
    clear();
    return true;
  }

  // 对外暴露
  window.wpSetBackground = setBackground;
  window.wpResetBackground = resetBackground;
  window.wpCurrentBackground = read;

  // 首屏应用已保存的壁纸
  var saved = read();
  if (saved) apply(saved);

  // 清理旧链路遗留（那次"切换成功但没效果"写进去的 blogbg）
  try {
    var legacy = localStorage.getItem(LEGACY_KEY) || '';
    if (legacy.indexOf('/assets/wallpapers/') !== -1) localStorage.removeItem(LEGACY_KEY);
  } catch (e) {
    /* ignore */
  }
})();
