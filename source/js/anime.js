/**
 * 本季新番表渲染（数据来自 AniList，见 tools/fetch-anilist.js）
 *
 * 数据文件：/anime/season.json
 *   season: { season, seasonCN, year, label }
 *   items[]: { id, title, romaji, cover, episodes, score, format, studio,
 *              nextEpisode, airingAt, weekday, weekdayIndex, dateText, timeText, siteUrl }
 *
 * 时间均为北京时间（由抓取脚本换算好写进数据里）。
 * 追番清单不在这里，见 anime-bangumi.js（数据来自 Bangumi）。
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
    var meta = [];
    if (item.nextEpisode) meta.push('<span class="anime-ep">第 ' + item.nextEpisode + ' 话</span>');
    if (item.dateText) meta.push('<span class="anime-time">' + esc(item.dateText) + ' ' + esc(item.timeText) + '</span>');
    var score = item.score ? '<span class="anime-score">' + item.score + '</span>' : '';
    var studio = item.studio ? '<span class="anime-studio">' + esc(item.studio) + '</span>' : '';

    return '' +
      '<article class="anime-card">' +
        '<a class="anime-cover" href="' + esc(item.siteUrl) + '" target="_blank" rel="noopener nofollow">' +
          (item.cover
            ? '<img loading="lazy" src="' + esc(item.cover) + '" alt="' + esc(item.title) + '">'
            : '<span class="anime-cover-fallback"></span>') +
          score +
        '</a>' +
        '<div class="anime-body">' +
          '<a class="anime-title" href="' + esc(item.siteUrl) + '" target="_blank" rel="noopener nofollow">' + esc(item.title) + '</a>' +
          (item.romaji ? '<div class="anime-romaji">' + esc(item.romaji) + '</div>' : '') +
          '<div class="anime-meta">' + meta.join('') + '</div>' +
          '<div class="anime-foot">' + studio + '</div>' +
        '</div>' +
      '</article>';
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
          var k = typeof it.weekdayIndex === 'number' ? String(it.weekdayIndex) : '-1';
          (groups[k] = groups[k] || []).push(it);
        });

        var html = '<div class="anime-head">' +
          '<span class="anime-season-label">' + esc((data.season && data.season.label) || '') + '</span>' +
          '<span class="anime-count">共 ' + (data.total || items.length) + ' 部</span>' +
          '<span class="anime-updated">数据更新：' + esc(String(data.generatedAt || '').slice(0, 10)) + '</span>' +
          '</div>' +
          '<p class="anime-hint">时间均为北京时间。想看完整追番记录？去 <a href="/box/bangumi/watching/">追番清单</a>。</p>';

        // weekdayIndex: 1..6 周一到周六，0 周日
        var order = ['1', '2', '3', '4', '5', '6', '0'];
        order.forEach(function (key, i) {
          var list = groups[key] || [];
          if (!list.length) return;
          html += '<section class="anime-day"><h3 class="anime-day-title">' + WEEKDAYS[i] +
            '<span class="anime-day-num">' + list.length + '</span></h3><div class="anime-grid">' +
            list.map(cardHTML).join('') +
            '</div></section>';
        });

        var rest = groups['-1'] || [];
        if (rest.length) {
          html += '<section class="anime-day"><h3 class="anime-day-title">已完结 / 待定档' +
            '<span class="anime-day-num">' + rest.length + '</span></h3><div class="anime-grid">' +
            rest.map(cardHTML).join('') +
            '</div></section>';
        }

        html += '<p class="anime-source">数据来源：<a href="https://anilist.co" target="_blank" rel="noopener nofollow">AniList</a>，' +
          '本站仅展示标题、封面与放送时间，观看请支持正版。</p>';

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
