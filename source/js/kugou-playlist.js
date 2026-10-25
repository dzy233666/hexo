/**
 * 歌单：我的年度歌单（2021-2025）
 *
 * 数据文件：/life/music/playlists.json（由 tools/fetch-kugou.js 生成）
 *   years[]: { year, listid, name, count, cover, songs[{index,name,singer,album,duration,durationText}] }
 *
 * 交互：卡片网格 → 点开弹层看那年的 10 首；Esc / 点遮罩 / 点 ✕ 关闭。
 * 不做音频播放（酷狗播放地址需要额外签名和 VIP 校验，且涉及版权）。
 */
(function () {
  'use strict';

  var data = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cardHTML(y) {
    var cover = y.cover
      ? '<img loading="lazy" src="' + esc(y.cover) + '" alt="' + esc(y.name) + '">'
      : '';
    return '' +
      '<button class="kgp-card" type="button" data-year="' + esc(y.year) + '" ' +
        'aria-label="查看 ' + esc(y.year) + ' 年度歌单，共 ' + esc(y.count) + ' 首">' +
        '<span class="kgp-cover">' + cover +
          '<span class="kgp-year">' + esc(y.year) + '</span>' +
        '</span>' +
        '<span class="kgp-meta">' +
          '<span class="kgp-name">' + esc(y.name) + '</span>' +
          '<span class="kgp-count">' + esc(y.count) + ' 首</span>' +
        '</span>' +
      '</button>';
  }

  function songsHTML(y) {
    return (y.songs || [])
      .map(function (s) {
        return '' +
          '<li class="kgp-song">' +
            '<span class="kgp-i">' + esc(s.index) + '</span>' +
            '<span class="kgp-song-main">' +
              '<span class="kgp-t">' + esc(s.name) + '</span>' +
              (s.singer ? '<span class="kgp-s">' + esc(s.singer) + '</span>' : '') +
            '</span>' +
            '<span class="kgp-d">' + esc(s.durationText || '') + '</span>' +
          '</li>';
      })
      .join('');
  }

  /* ---------------- 弹层 ---------------- */

  function openModal(y) {
    var modal = document.getElementById('kgp-modal');
    if (!modal) return;
    modal.innerHTML = '' +
      '<div class="kgp-backdrop" data-close="1"></div>' +
      '<div class="kgp-panel" role="dialog" aria-modal="true" aria-label="' + esc(y.name) + '">' +
        '<div class="kgp-panel-head">' +
          (y.cover ? '<img src="' + esc(y.cover) + '" alt="">' : '') +
          '<div class="kgp-panel-title">' +
            '<h4>' + esc(y.year) + ' 年度歌单</h4>' +
            '<p>' + esc(y.name) + ' · ' + esc(y.count) + ' 首</p>' +
          '</div>' +
          '<button class="kgp-close" type="button" data-close="1" aria-label="关闭">✕</button>' +
        '</div>' +
        '<ol class="kgp-songs">' + songsHTML(y) + '</ol>' +
      '</div>';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';

    var closeBtn = modal.querySelector('.kgp-close');
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    var modal = document.getElementById('kgp-modal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    modal.innerHTML = '';
    document.body.style.overflow = '';
  }

  /* ---------------- 渲染 ---------------- */

  function render(root, json) {
    var years = (json.years || []).slice().sort(function (a, b) { return b.year - a.year; });
    var total = years.reduce(function (n, y) { return n + (y.songs ? y.songs.length : 0); }, 0);

    root.innerHTML = '' +
      '<div class="kgp-head">' +
        '<h3 class="kgp-title">我的年度歌单</h3>' +
        '<span class="kgp-sub">' + years.length + ' 个年份 · 共 ' + total + ' 首</span>' +
        '<span class="kgp-sync">同步于 ' + esc(String(json.generatedAt || '').slice(0, 10)) + '</span>' +
      '</div>' +
      '<div class="kgp-grid">' + years.map(cardHTML).join('') + '</div>' +
      '<div class="kgp-modal" id="kgp-modal" hidden></div>' +
      '<p class="kgp-foot">歌单来自我的酷狗音乐账号，由 <code>tools/fetch-kugou.js</code> 抓取后随站点发布，' +
        '构建过程不联网。这里只记录歌名与歌手，不提供音频播放。</p>';

    // 卡片点击 → 打开弹层
    root.querySelector('.kgp-grid').addEventListener('click', function (ev) {
      var card = ev.target.closest ? ev.target.closest('.kgp-card') : null;
      if (!card) return;
      var year = Number(card.getAttribute('data-year'));
      var y = years.filter(function (x) { return x.year === year; })[0];
      if (y) openModal(y);
    });

    // 关闭：点遮罩 / ✕ / Esc
    var modal = document.getElementById('kgp-modal');
    modal.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') closeModal();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closeModal();
    });
  }

  function init() {
    var root = document.getElementById('kgp-root');
    if (!root || root.getAttribute('data-ready') === '1') return;

    if (data) {
      render(root, data);
      root.setAttribute('data-ready', '1');
      return;
    }

    root.innerHTML = '<p style="color:#8a9099;padding:24px 0;text-align:center">正在读取年度歌单…</p>';
    fetch('/life/music/playlists.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        data = json;
        render(root, json);
        root.setAttribute('data-ready', '1');
      })
      .catch(function (err) {
        root.innerHTML = '<p style="color:#e05555;padding:24px 0;text-align:center">' +
          '歌单数据加载失败（' + esc(err.message) + '），请检查 /life/music/playlists.json。</p>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('pjax:complete', init);
})();
