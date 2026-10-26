/**
 * 画廊 · 背景专区：手动切换全站壁纸
 *
 * 复用的既有机制（不另造一套）：
 *   source/js/modules/appearance-backgrounds.js 里的全局函数
 *     changeAppearanceBackground(value)  —— 传入 URL 或 'default'，内部会先探针校验图片，成功才应用
 *     localStorage['blogbg']             —— 主题保存背景偏好的键（同时被美化面板和首屏 beauty-boot.js 读取）
 *
 * 所以这里切换之后：
 *   1. 全站四套背景变量（default / darkmode / mobileday / mobilenight）会一起换掉
 *   2. 刷新后由主题自己恢复，不用我们管
 *
 * 注意：主题的校验函数用的是 `new URL(value)`，只接受**绝对地址**，
 * 所以这里必须拼上 location.origin，不能直接传 /assets/xxx.webp。
 */
(function () {
  'use strict';

  var KEY = 'blogbg';
  var grid = null;
  var tipEl = null;

  /* ---------------- 小工具 ---------------- */

  function absUrl(path) {
    return location.origin + path;
  }

  function savedValue() {
    try {
      return localStorage.getItem(KEY) || 'default';
    } catch (e) {
      return 'default';
    }
  }

  /** blogbg 里存的是 url("https://…/x.webp") 这种字符串，这里做包含判断 */
  function isActive(path) {
    return savedValue().indexOf(absUrl(path)) !== -1;
  }

  function toast(msg, type) {
    if (!tipEl) return;
    tipEl.textContent = msg;
    tipEl.className = 'wp-tip wp-tip-' + (type || 'info') + ' is-on';
    clearTimeout(tipEl.__t);
    tipEl.__t = setTimeout(function () {
      tipEl.classList.remove('is-on');
    }, 3200);
  }

  function fn() {
    return typeof window.changeAppearanceBackground === 'function'
      ? window.changeAppearanceBackground
      : null;
  }

  /* ---------------- 应用 / 恢复 / 随机 ---------------- */

  function applyPath(path, name) {
    var apply = fn();
    if (!apply) {
      toast('背景模块还没加载完，稍等一秒再点', 'err');
      return;
    }
    toast('正在检查这张图片…', 'info');
    Promise.resolve(apply(absUrl(path))).then(function (ok) {
      if (ok) {
        toast('已切换：' + (name || '新壁纸'), 'ok');
        sync();
      } else {
        toast('切换失败：图片加载不出来，已保留原背景', 'err');
      }
    }).catch(function (err) {
      toast('切换出错：' + (err && err.message ? err.message : err), 'err');
    });
  }

  function applyDefault() {
    var apply = fn();
    if (!apply) {
      toast('背景模块还没加载完，稍等一秒再点', 'err');
      return;
    }
    Promise.resolve(apply('default')).then(function () {
      toast('已恢复默认背景（随深浅色/屏幕自动切换）', 'ok');
      sync();
    });
  }

  function randomOne() {
    var cards = grid ? Array.prototype.slice.call(grid.querySelectorAll('.wp-card')) : [];
    if (!cards.length) return;
    var pick = cards[Math.floor(Math.random() * cards.length)];
    applyPath(pick.getAttribute('data-path'), pick.getAttribute('data-name'));
  }

  /* ---------------- 状态同步 ---------------- */

  function sync() {
    if (!grid) return;
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.wp-card'));
    var activeName = '';
    cards.forEach(function (card) {
      var on = isActive(card.getAttribute('data-path'));
      card.classList.toggle('is-active', on);
      var btn = card.querySelector('.wp-apply');
      if (btn) btn.textContent = on ? '当前壁纸' : '设为背景';
      if (on) activeName = card.getAttribute('data-name') || '';
    });

    var label = document.getElementById('wp-current-name');
    if (label) {
      var saved = savedValue();
      if (saved === 'default' || saved === 'null') label.textContent = '默认背景';
      else if (activeName) label.textContent = activeName;
      else if (saved.indexOf('url(') === 0) label.textContent = '自定义图片';
      else label.textContent = '自定义（' + saved + '）';
    }
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    grid = document.getElementById('wp-grid');
    tipEl = document.getElementById('wp-tip');
    if (!grid) return;
    if (grid.getAttribute('data-ready') === '1') {
      sync();
      return;
    }

    grid.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('.wp-apply') : null;
      if (!btn) return;
      ev.preventDefault();
      var card = btn.closest('.wp-card');
      if (!card) return;
      applyPath(card.getAttribute('data-path'), card.getAttribute('data-name'));
    });

    var reset = document.getElementById('wp-reset');
    if (reset) reset.addEventListener('click', function (ev) { ev.preventDefault(); applyDefault(); });

    var rand = document.getElementById('wp-random');
    if (rand) rand.addEventListener('click', function (ev) { ev.preventDefault(); randomOne(); });

    grid.setAttribute('data-ready', '1');
    sync();

    // 主题用 pjax 换页，回来时重新同步一次高亮（不影响已应用的背景）
    document.addEventListener('pjax:complete', function () {
      if (document.getElementById('wp-grid')) setTimeout(sync, 120);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
