/**
 * 追番清单渲染（数据来自 Bangumi，见 tools/fetch-bangumi.js）
 *
 * 数据文件：/anime/watching.json
 *   items[]: { id, name, nameCN, date, eps, score, rank, localCover, url,
 *              status(doing|collect), statusLabel, myRate, comment, tags, epStatus, updatedAt, year }
 *
 * 页面结构：
 *   #anime-watching         容器（整块由脚本生成）
 *   .anime-search          搜索框 —— **只创建一次**
 *   #anime-results         结果区 —— 输入时只重绘这里
 *   「在看」                当前追的番
 *   「年度动画清单」        看过的番，按收藏年份分组（代表那一年的好作品）
 *
 * 注意事项（踩过的坑）：
 *   搜索框绝对不能随每次输入重建 DOM —— 输入法（IME）组词过程中如果 input 元素被销毁，
 *   中文就永远打不出来。所以输入框只创建一次，只更新 #anime-results；
 *   并且要在 compositionstart/end 期间跳过过滤，等组词结束再查。
 */
(function () {
  'use strict';

  var data = null; // 首次加载后缓存

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function star(rate) {
    if (!rate) return '';
    var n = Math.round(rate / 2);
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

  function section(title, list) {
    if (!list.length) return '';
    return '<section class="anime-day"><h3 class="anime-day-title">' + esc(title) +
      '<span class="anime-day-num">' + list.length + '</span>' +
      '</h3><div class="anime-grid">' + list.map(card).join('') + '</div></section>';
  }

  function byUpdatedDesc(a, b) {
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  }

  /** 只重绘结果区，绝不碰搜索框 */
  function renderResults(keyword) {
    var box = document.getElementById('anime-results');
    if (!box || !data) return;

    var items = data.items || [];
    var kw = (keyword || '').trim().toLowerCase();
    if (kw) {
      items = items.filter(function (it) {
        return (it.nameCN + ' ' + it.name + ' ' + (it.tags || []).join(' '))
          .toLowerCase()
          .indexOf(kw) >= 0;
      });
    }

    if (!items.length) {
      box.innerHTML = '<p class="anime-empty">没有匹配「' + esc(keyword) + '」的番剧。</p>';
      return;
    }

    var doing = items.filter(function (i) { return i.status === 'doing'; }).sort(byUpdatedDesc);
    var collect = items.filter(function (i) { return i.status === 'collect'; });

    var years = {};
    collect.forEach(function (it) {
      var y = it.year || '未知';
      (years[y] = years[y] || []).push(it);
    });

    var html = section('在看', doing);
    Object.keys(years)
      .sort(function (a, b) { return String(b).localeCompare(String(a)); })
      .forEach(function (y) {
        var list = years[y].sort(function (a, b) {
          return (b.myRate || 0) - (a.myRate || 0) || byUpdatedDesc(a, b);
        });
        html += section(y + ' 年度动画清单', list);
      });

    box.innerHTML = html;
  }

  function renderShell() {
    var root = document.getElementById('anime-watching');
    if (!root) return;

    // 搜索框只在这里创建一次，之后永不重建
    root.innerHTML = '' +
      '<div class="anime-head">' +
        '<span class="anime-season-label">' + esc(data.user ? data.user.name : '') + ' 的追番</span>' +
        '<span class="anime-count">在看 ' + (data.counts ? data.counts.doing : 0) +
          ' · 看过 ' + (data.counts ? data.counts.collect : 0) + '</span>' +
        '<span class="anime-updated">同步于 ' + esc(String(data.generatedAt || '').slice(0, 10)) + '</span>' +
      '</div>' +
      '<div class="anime-toolbar">' +
        '<input id="anime-search" class="anime-search" type="search" ' +
          'placeholder="搜索番名或标签…" autocomplete="off" ' +
          'inputmode="search" lang="zh-CN" enterkeyhint="search">' +
        (data.user
          ? '<a class="anime-user-link" href="' + esc(data.user.url) + '" target="_blank" rel="noopener nofollow">Bangumi 主页 ↗</a>'
          : '') +
      '</div>' +
      '<div id="anime-results"></div>' +
      '<p class="anime-source">数据来自 <a href="https://bgm.tv" target="_blank" rel="noopener nofollow">Bangumi 番组计划</a>，' +
        '由 <code>tools/fetch-bangumi.js</code> 抓取后随站点发布；封面已本地化。</p>';

    var input = document.getElementById('anime-search');
    var composing = false; // 输入法是否正在组词

    function apply() {
      renderResults(input.value);
    }

    input.addEventListener('compositionstart', function () {
      composing = true;
    });
    input.addEventListener('compositionend', function () {
      composing = false;
      apply(); // 组词结束立即按已确认的文字过滤
    });
    input.addEventListener('input', function (e) {
      // 组词过程中不过滤（否则会把拼音字母当成关键词），也不做任何 DOM 重建
      if (composing || e.isComposing) return;
      clearTimeout(input.__t);
      input.__t = setTimeout(apply, 150);
    });
    input.addEventListener('search', apply); // 点浏览器自带的 ✕ 清空时触发

    renderResults('');
  }

  function init() {
    var root = document.getElementById('anime-watching');
    if (!root) return;

    if (data) {
      if (root.getAttribute('data-ready') !== '1') {
        renderShell();
        root.setAttribute('data-ready', '1');
      }
      return;
    }

    root.innerHTML = '<p class="anime-loading">正在读取追番清单…</p>';
    fetch('/anime/watching.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        data = json;
        renderShell();
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
