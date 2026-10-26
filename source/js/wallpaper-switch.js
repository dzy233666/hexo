/**
 * 画廊 · 背景专区：手动切换全站壁纸
 *
 * 真正的应用逻辑在 source/js/inject/wallpaper-boot.js（inject.head，全站生效）：
 *   window.wpSetBackground(url) / wpResetBackground() / wpCurrentBackground()
 *
 * 这里只负责页面交互：校验图片 → 调上面的 API → 更新按钮状态与提示。
 *
 * 【为什么不用主题的 changeAppearanceBackground()】
 *   2026-10-26 排查发现：fomalhaut 的 #web_bg 背景是构建时写死在 index.css 里的
 *   （#web_bg{background:url(/assets/bg-violet.webp)}），**不读** --default-bg 变量。
 *   主题那套「自定义背景」只改变量、不改画面，于是出现"提示成功但没有变化"。
 *   所以这里改走直接覆盖 #web_bg 的方案。
 */
(function () {
  'use strict';

  var grid = null;
  var tipEl = null;

  /* ---------------- 小工具 ---------------- */

  function absUrl(path) {
    return location.origin + path;
  }

  function savedUrl() {
    return typeof window.wpCurrentBackground === 'function' ? window.wpCurrentBackground() : '';
  }

  function isActive(path) {
    return savedUrl() === absUrl(path);
  }

  function toast(msg, type) {
    if (!tipEl) return;
    tipEl.textContent = msg;
    tipEl.className = 'wp-tip wp-tip-' + (type || 'info') + ' is-on';
    clearTimeout(tipEl.__t);
    tipEl.__t = setTimeout(function () {
      tipEl.classList.remove('is-on');
    }, 3600);
  }

  /** 先探针加载一遍，图片坏了就不应用（避免全站背景变空白） */
  function preload(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        img.src = '';
        resolve(false);
      }, 15000);
      img.onload = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(true);
      };
      img.onerror = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(false);
      };
      img.src = url;
    });
  }

  /* ---------------- 应用 / 恢复 / 随机 ---------------- */

  function applyPath(path, name) {
    var set = window.wpSetBackground;
    if (typeof set !== 'function') {
      toast('壁纸模块还没加载完，刷新页面再试一次', 'err');
      return;
    }
    var url = absUrl(path);
    toast('正在检查这张图片…', 'info');
    preload(url).then(function (ok) {
      if (!ok) {
        toast('这张图加载失败了，已保留原背景', 'err');
        return;
      }
      set(url);
      toast('已切换：' + (name || '新壁纸') + '（刷新、换页都会保留）', 'ok');
      sync();
    });
  }

  function applyDefault() {
    var reset = window.wpResetBackground;
    if (typeof reset !== 'function') {
      toast('壁纸模块还没加载完，刷新页面再试一次', 'err');
      return;
    }
    reset();
    toast('已恢复默认背景（随深浅色/屏幕自动切换）', 'ok');
    sync();
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
    if (label) label.textContent = activeName || '默认背景（随深浅色/屏幕切换）';
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

    // 主题用 pjax 换页，回来时重新同步一次高亮
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
