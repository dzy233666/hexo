/**
 * 「我的 galgame 清单」渲染（数据来自 Bangumi，见 tools/fetch-galgame.js）
 *
 * 数据文件：/galgame/list.json
 *   items[]: { id, name, nameCN, date, releaseYear, score, rank, url,
 *              status(doing|collect|wish), statusLabel, myRate, comment, tags,
 *              updatedAt, collectedYear, nsfw, developer, localCover }
 *
 * 页面结构：
 *   在玩        当前在推的
 *   玩过        按收藏年份分组（= 年度 galgame 清单）
 *   想玩        计划清单
 *
 * NSFW：带 nsfw=true 的卡片封面默认高斯模糊 + 遮罩「R18 · 点击展开」。
 *       点一次之后把标记写进 localStorage（galgame_nsfw_revealed=1），
 *       之后所有卡片直接显示——同一台机器不用逐张点。
 */
(function () {
  'use strict';

  var NSFW_KEY = 'galgame_nsfw_revealed';
  var data = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function stars(rate) {
    if (!rate) return '';
    var n = Math.round(rate / 2);
    var s = '';
    for (var i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    return s;
  }

  function revealedGlobally() {
    try {
      return localStorage.getItem(NSFW_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function card(it) {
    var title = it.nameCN || it.name;
    var sub = it.name && it.nameCN && it.name !== it.nameCN ? it.name : '';
    var cover = it.localCover || it.img || '';
    var meta = [];
    if (it.developer) meta.push(esc(it.developer));
    if (it.releaseYear) meta.push(esc(it.releaseYear));

    var isNsfw = it.nsfw && !revealedGlobally();

    return '' +
      '<article class="anime-card gg-card' + (isNsfw ? ' is-nsfw' : '') + '">' +
        '<a class="anime-cover" href="' + esc(it.url) + '" target="_blank" rel="noopener nofollow">' +
          (cover
            ? '<img loading="lazy" src="' + esc(cover) + '" alt="' + esc(title) + '">'
            : '<span class="anime-cover-fallback"></span>') +
          (it.score ? '<span class="anime-score">' + it.score + '</span>' : '') +
          (isNsfw
            ? '<span class="gg-nsfw-mask" role="button" tabindex="0">R18 · 点击展开</span>'
            : '') +
        '</a>' +
        '<div class="anime-body">' +
          '<a class="anime-title" href="' + esc(it.url) + '" target="_blank" rel="noopener nofollow">' + esc(title) + '</a>' +
          (sub ? '<div class="anime-romaji">' + esc(sub) + '</div>' : '') +
          (it.myRate
            ? '<div class="anime-rate" title="我的评分 ' + it.myRate + '/10">' +
              '<span class="anime-stars">' + stars(it.myRate) + '</span>' +
              '<span class="anime-rate-num">' + it.myRate + '</span></div>'
            : '') +
          (it.comment ? '<p class="anime-comment">' + esc(it.comment) + '</p>' : '') +
          (meta.length ? '<div class="gg-meta">' + meta.join(' · ') + '</div>' : '') +
        '</div>' +
      '</article>';
  }

  function section(title, list, extra) {
    if (!list.length) return '';
    return '<section class="anime-day"><h3 class="anime-day-title">' + esc(title) +
      '<span class="anime-day-num">' + list.length + '</span>' +
      (extra ? '<span class="anime-day-extra">' + esc(extra) + '</span>' : '') +
      '</h3><div class="anime-grid">' + list.map(card).join('') + '</div></section>';
  }

  function byUpdatedDesc(a, b) {
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  }

  function renderResults() {
    var box = document.getElementById('galgame-results');
    if (!box || !data) return;

    var items = data.items || [];
    if (!items.length) {
      box.innerHTML = '<p class="anime-empty">还没有收藏任何 galgame。去 <a href="' +
        esc(data.user && data.user.url ? data.user.url : 'https://bgm.tv') +
        '" target="_blank" rel="noopener nofollow">我的 Bangumi</a> 把玩过的作品收藏起来（打分、写短评），' +
        '再跑一次 <code>node tools/fetch-galgame.js</code> 就会出现。</p>';
      return;
    }

    var doing = items.filter(function (i) { return i.status === 'doing'; }).sort(byUpdatedDesc);
    var wish = items.filter(function (i) { return i.status === 'wish'; }).sort(byUpdatedDesc);
    var collect = items.filter(function (i) { return i.status === 'collect'; });

    var years = {};
    collect.forEach(function (it) {
      var y = it.collectedYear || '未知';
      (years[y] = years[y] || []).push(it);
    });

    var html = section('在玩', doing);

    Object.keys(years)
      .sort(function (a, b) { return String(b).localeCompare(String(a)); })
      .forEach(function (y) {
        var list = years[y].sort(function (a, b) {
          return (b.myRate || 0) - (a.myRate || 0) || byUpdatedDesc(a, b);
        });
        html += section(y + ' 年度 galgame 清单', list);
      });

    html += section('想玩', wish);
    box.innerHTML = html;
  }

  function bindNsfw() {
    var box = document.getElementById('galgame-results');
    if (!box) return;
    box.addEventListener('click', function (ev) {
      var mask = ev.target.closest ? ev.target.closest('.gg-nsfw-mask') : null;
      if (!mask) return;
      ev.preventDefault();
      ev.stopPropagation();
      try {
        localStorage.setItem(NSFW_KEY, '1');
      } catch (e) {
        /* 隐私模式忽略 */
      }
      // 一次点击后全部展开，不用逐张点
      Array.prototype.forEach.call(box.querySelectorAll('.gg-card.is-nsfw'), function (c) {
        c.classList.remove('is-nsfw');
        var m = c.querySelector('.gg-nsfw-mask');
        if (m) m.remove();
      });
    });
  }

  function init() {
    var root = document.getElementById('galgame-list');
    if (!root) return;
    if (root.getAttribute('data-ready') === '1') return;

    var load = data
      ? Promise.resolve(data)
      : fetch('/galgame/list.json', { cache: 'no-cache' }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        });

    root.innerHTML = '<p class="anime-loading">正在读取 galgame 清单…</p>';

    load
      .then(function (json) {
        data = json;
        root.innerHTML = '' +
          '<div class="anime-head">' +
            '<span class="anime-season-label">' + esc(data.user ? data.user.name : '') + ' 的 galgame</span>' +
            '<span class="anime-count">在玩 ' + ((data.counts && data.counts.doing) || 0) +
              ' · 玩过 ' + ((data.counts && data.counts.collect) || 0) +
              ' · 想玩 ' + ((data.counts && data.counts.wish) || 0) + '</span>' +
            '<span class="anime-updated">同步于 ' + esc(String(data.generatedAt || '').slice(0, 10)) + '</span>' +
          '</div>' +
          '<div class="anime-toolbar">' +
            '<span class="anime-hint" style="margin:0">数据来自 Bangumi 的「游戏」收藏，评分与短评就是我在那边写的。</span>' +
            (data.user
              ? '<a class="anime-user-link" href="' + esc(data.user.url) + '" target="_blank" rel="noopener nofollow">Bangumi 主页 ↗</a>'
              : '') +
          '</div>' +
          '<div id="galgame-results"></div>' +
          '<p class="anime-source">数据来源：<a href="https://bgm.tv" target="_blank" rel="noopener nofollow">Bangumi 番组计划</a>' +
            '（游戏收藏），由 <code>tools/fetch-galgame.js</code> 抓取后随站点发布；封面已本地化。</p>';

        renderResults();
        bindNsfw();
        root.setAttribute('data-ready', '1');
      })
      .catch(function (err) {
        root.innerHTML = '<p class="anime-error">galgame 清单加载失败（' + esc(err.message) +
          '）。请检查 /galgame/list.json 是否存在。</p>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('pjax:complete', init);
})();
