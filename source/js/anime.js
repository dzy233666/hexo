/**
 * 本季新番表渲染（数据来自 Bangumi 每日放送，见 tools/fetch-bangumi-season.js）
 *
 * 数据文件：/anime/season.json
 *   season: { label, source }
 *   items[]: { id, name, nameCN, airDate, weekdayIndex(0=周日), weekday,
 *              score, rank, ratingTotal, doing, url, img, localCover }
 *
 * 与追番清单保持一致：中文名优先、封面本地化、卡片链接到 Bangumi。
 * Bangumi 的每日放送只有「周几 + 首播日期」，没有具体时刻，所以卡片不显示 N 话/时间。
 */
(function () {
  'use strict';

  var WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cardHTML(item) {
    var title = item.nameCN || item.name || item.title || '';
    var sub = item.name && item.nameCN && item.name !== item.nameCN ? item.name : '';
    var cover = item.localCover || item.img || item.cover || '';
    var link = item.url || item.siteUrl || '#';

    var meta = [];
    if (item.airDate) meta.push('<span class="anime-time">首播 ' + esc(String(item.airDate).slice(5)) + '</span>');
    if (item.doing) meta.push('<span>' + item.doing + ' 人在追</span>');
    if (item.rank) meta.push('<span>#' + item.rank + '</span>');

    return '' +
      '<article class="anime-card">' +
        '<a class="anime-cover" href="' + esc(link) + '" target="_blank" rel="noopener nofollow">' +
          (cover
            ? '<img loading="lazy" src="' + esc(cover) + '" alt="' + esc(title) + '">'
            : '<span class="anime-cover-fallback"></span>') +
          (item.score ? '<span class="anime-score">' + item.score + '</span>' : '') +
        '</a>' +
        '<div class="anime-body">' +
          '<a class="anime-title" href="' + esc(link) + '" target="_blank" rel="noopener nofollow">' + esc(title) + '</a>' +
          (sub ? '<div class="anime-romaji">' + esc(sub) + '</div>' : '') +
          '<div class="anime-meta">' + meta.join('') + '</div>' +
        '</div>' +
      '</article>';
  }

  function section(title, list) {
    if (!list.length) return '';
    return '<section class="anime-day"><h3 class="anime-day-title">' + esc(title) +
      '<span class="anime-day-num">' + list.length + '</span></h3><div class="anime-grid">' +
      list.map(cardHTML).join('') +
      '</div></section>';
  }

  function renderSeason(root) {
    if (root.getAttribute('data-ready') === '1') return;
    root.innerHTML = '<p class="anime-loading">正在加载本季新番…</p>';

    fetch('/anime/season.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var items = (data.items || []).slice();
        var groups = {};
        items.forEach(function (it) {
          var k = typeof it.weekdayIndex === 'number' && it.weekdayIndex >= 0 ? String(it.weekdayIndex) : '-1';
          (groups[k] = groups[k] || []).push(it);
        });

        var html = '<div class="anime-head">' +
          '<span class="anime-season-label">' + esc((data.season && data.season.label) || '本季新番') + '</span>' +
          '<span class="anime-count">共 ' + (data.total || items.length) + ' 部</span>' +
          '<span class="anime-updated">数据更新：' + esc(String(data.generatedAt || '').slice(0, 10)) + '</span>' +
          '</div>' +
          '<p class="anime-hint">按放送星期分组，评分为 Bangumi 用户均分。想看我的追番记录？去 ' +
          '<a href="/box/bangumi/watching/">追番清单</a>。</p>';

        // weekdayIndex: 1..6 周一到周六，0 周日
        var order = ['1', '2', '3', '4', '5', '6', '0'];
        order.forEach(function (key, i) {
          var list = groups[key] || [];
          if (!list.length) return;
          html += section(WEEKDAYS[i], list);
        });

        var rest = groups['-1'] || [];
        if (rest.length) html += section('放送日未定', rest);

        html += '<p class="anime-source">数据来源：<a href="https://bgm.tv" target="_blank" rel="noopener nofollow">Bangumi 番组计划</a>' +
          '（每日放送），由 <code>tools/fetch-bangumi-season.js</code> 抓取后随站点发布；封面已本地化，构建过程不联网。</p>';

        root.innerHTML = html;
        root.setAttribute('data-ready', '1');
      })
      .catch(function (err) {
        root.innerHTML = '<p class="anime-error">新番数据加载失败（' + esc(err.message) +
          '）。数据文件是构建时生成的静态 JSON，请检查 /anime/season.json 是否存在。</p>';
      });
  }

  function init() {
    var root = document.getElementById('anime-season');
    if (root) renderSeason(root);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('pjax:complete', init);
})();
