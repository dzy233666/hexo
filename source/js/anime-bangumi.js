/**
 * 追番清单渲染（数据来自 Bangumi，见 tools/fetch-bangumi.js）
 *
 * 数据文件：/anime/watching.json
 *   items[]: { id, name, nameCN, date, eps, score, rank, localCover, url,
 *              status(doing|collect), statusLabel, myRate, comment, tags, epStatus, updatedAt, year }
 *
 * 页面结构：
 *   #anime-watching         容器
 *   .anime-search          搜索框（前端过滤）
 *   「在看」                当前追的番
 *   「年度动画清单」        看过的番，按收藏年份分组（代表那一年的好作品）
 */
(function () {
  'use strict';

  var cache = null; // 首次加载后缓存，避免搜索时重复请求

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function star(rate) {
    if (!rate) return '';
    var n = Math.round(rate / 2); // 10 分制 -> 5 星
    var s = '';
    for (var i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    return s;
  }

  function card(it) {
    var title = it.nameCN || it.name;
    var meta = [];
    if (it.score) meta.push('<span class="anime-ep">Bangumi ' + it.score + '</span>');
    if (it.rank) meta.push('<span class="anime-time">#' + it.rank + '</span>');
    if (it.date) meta.push('<span>' + esc(String(it.date).slice(0, 4)) + ' 年</span>');

    var mine = '';
    if (it.myRate) {
      mine = '<div class="anime-rate" title="我的评分 ' + it.myRate + '/10">' +
        '<span class="anime-stars">' + star(it.myRate) + '</span>' +
        '<span class="anime-rate-num">' + it.myRate + '</span></div>';
    }

    var cover = it.localCover || it.img || '';
    return '' +
      '<article class="anime-card">' +
        '<a class="anime-cover" href="' + esc(it.url) + '" target="_blank" rel="noopener nofollow">' +
          (cover
            ? '<img loading="lazy" src="' + esc(cover) + '" alt="' + esc(title) + '">'
            : '<span class="anime-cover-fallback"></span>') +
          (it.score ? '<span class="anime-score">' + it.score + '</span>' : '') +
        '</a>' +
        '<div class="anime-body">' +
          '<a class="anime-title" href="' + esc(it.url) + '" target="_blank" rel="noopener nofollow">' + esc(title) + '</a>' +
          (it.name && it.nameCN ? '<div class="anime-romaji">' + esc(it.name) + '</div>' : '') +
          '<div class="anime-meta">' + meta.join('') + '</div>' +
          mine +
          (it.comment ? '<p class="anime-comment">' + esc(it.comment) + '</p>' : '') +
        '</div>' +
      '</article>';
  }

  function section(title, list, extra) {
    if (!list.length) return '';
    return '<section class="anime-day"><h3 class="anime-day-title">' + esc(title) +
      '<span class="anime-day-num">' + list.length + '</span>' +
      (extra ? '<span class="anime-day-extra">' + esc(extra) + '</span>' : '') +
      '</h3><div class="anime-grid">' +
      list.map(card).join('') +
      '</div></section>';
  }

  function byUpdatedDesc(a, b) {
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  }

  function render(root, data, keyword) {
    var items = data.items || [];
    var kw = (keyword || '').trim().toLowerCase();
    if (kw) {
      items = items.filter(function (it) {
        return (it.nameCN + ' ' + it.name + ' ' + (it.tags || []).join(' '))
          .toLowerCase()
          .indexOf(kw) >= 0;
      });
    }

    var doing = items.filter(function (i) { return i.status === 'doing'; }).sort(byUpdatedDesc);
    var collect = items.filter(function (i) { return i.status === 'collect'; });

    // 年度分组：按收藏年份倒序
    var years = {};
    collect.forEach(function (it) {
      var y = it.year || '未知';
      (years[y] = years[y] || []).push(it);
    });

    var html = '' +
      '<div class="anime-head">' +
        '<span class="anime-season-label">' + esc(data.user ? data.user.name : '') + ' 的追番</span>' +
        '<span class="anime-count">在看 ' + (data.counts ? data.counts.doing : doing.length) +
          ' · 看过 ' + (data.counts ? data.counts.collect : collect.length) + '</span>' +
        '<span class="anime-updated">同步于 ' + esc(String(data.generatedAt || '').slice(0, 10)) + '</span>' +
      '</div>' +
      '<div class="anime-toolbar">' +
        '<input id="anime-search" class="anime-search" type="search" placeholder="搜索番名或标签…" value="' + esc(keyword || '') + '">' +
        (data.user ? '<a class="anime-user-link" href="' + esc(data.user.url) + '" target="_blank" rel="noopener nofollow">Bangumi 主页 ↗</a>' : '') +
      '</div>';

    if (!items.length) {
      html += '<p class="anime-empty">没有匹配「' + esc(keyword) + '」的番剧。</p>';
    } else {
      html += section('在看', doing);
      Object.keys(years)
        .sort(function (a, b) { return String(b).localeCompare(String(a)); })
        .forEach(function (y) {
          var list = years[y].sort(function (a, b) {
            return (b.myRate || 0) - (a.myRate || 0) || byUpdatedDesc(a, b);
          });
          html += section(y + ' 年度动画清单', list);
        });
    }

    html += '<p class="anime-source">数据来自 <a href="https://bgm.tv" target="_blank" rel="noopener nofollow">Bangumi 番组计划</a>，' +
      '由 <code>tools/fetch-bangumi.js</code> 抓取后随站点发布；封面已本地化。</p>';

    root.innerHTML = html;

    var input = root.querySelector('#anime-search');
    if (input) {
      input.addEventListener('input', function () {
        clearTimeout(input.__t);
        input.__t = setTimeout(function () {
          render(root, data, input.value);
          var again = root.querySelector('#anime-search');
          if (again) {
            again.focus();
            again.setSelectionRange(again.value.length, again.value.length);
          }
        }, 180);
      });
    }
  }

  function init() {
    var root = document.getElementById('anime-watching');
    if (!root || root.getAttribute('data-ready') === '1') return;

    if (cache) {
      render(root, cache, '');
      root.setAttribute('data-ready', '1');
      return;
    }

    root.innerHTML = '<p class="anime-loading">正在读取追番清单…</p>';
    fetch('/anime/watching.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        cache = data;
        render(root, data, '');
        root.setAttribute('data-ready', '1');
      })
      .catch(function (err) {
        root.innerHTML = '<p class="anime-error">追番清单加载失败（' + esc(err.message) +
          '）。数据文件是构建时生成的，请检查 /anime/watching.json 是否存在。</p>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('pjax:complete', init);
})();
