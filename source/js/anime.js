/**
 * 番剧页面渲染：本季新番表 + 我的年度动画清单
 *
 * 数据来源：
 *   /anime/season.json   —— tools/fetch-anilist.js 生成（AniList 当季数据，离线文件）
 *   /anime/likes.json    —— 人工提交的「公开榜单」，结构 { years: { "2026": [ ... ] } }
 *   localStorage         —— 你自己浏览器里的「喜欢」，结构同上
 *
 * 设计说明（纯静态站没有后端）：
 *   点 ♥ 只能写进浏览器 localStorage，别的访客看不到。
 *   想让年度清单公开，就用页面上的「导出」按钮生成 JSON，替换 source/anime/likes.json 后提交。
 */
(function () {
  'use strict';

  var LIKES_KEY = 'anime_likes_v1';
  var WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  /* ---------------- 工具 ---------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function currentYear() {
    return String(new Date().getFullYear());
  }

  function readLocal() {
    try {
      var raw = JSON.parse(localStorage.getItem(LIKES_KEY) || '{}');
      if (!raw || typeof raw !== 'object') return { years: {} };
      if (!raw.years || typeof raw.years !== 'object') return { years: {} };
      return raw;
    } catch (e) {
      return { years: {} };
    }
  }

  function writeLocal(data) {
    try {
      localStorage.setItem(LIKES_KEY, JSON.stringify(data));
    } catch (e) {
      /* 隐私模式下可能写不进去，静默失败 */
    }
  }

  function isLiked(id) {
    var data = readLocal();
    var years = data.years || {};
    for (var y in years) {
      if (!Object.prototype.hasOwnProperty.call(years, y)) continue;
      if (years[y].some(function (it) { return it.id === id; })) return true;
    }
    return false;
  }

  function toggleLike(item) {
    var data = readLocal();
    data.years = data.years || {};
    var found = null;
    var foundYear = null;
    Object.keys(data.years).forEach(function (y) {
      var idx = data.years[y].findIndex(function (it) { return it.id === item.id; });
      if (idx >= 0) {
        found = data.years[y];
        foundYear = y;
        found.splice(idx, 1);
      }
    });
    if (found) {
      if (!found.length) delete data.years[foundYear];
    } else {
      var year = String(new Date().getFullYear());
      data.years[year] = data.years[year] || [];
      data.years[year].push({
        id: item.id,
        title: item.title,
        romaji: item.romaji || '',
        cover: item.cover || '',
        score: item.score || 0,
        episodes: item.episodes || 0,
        siteUrl: item.siteUrl || ('https://anilist.co/anime/' + item.id),
        likedAt: new Date().toISOString(),
      });
    }
    writeLocal(data);
    return !found;
  }

  /* ---------------- 卡片 ---------------- */

  function cardHTML(item, opts) {
    opts = opts || {};
    var liked = opts.liked;
    var meta = [];
    if (item.nextEpisode) meta.push('<span class="anime-ep">第 ' + item.nextEpisode + ' 话</span>');
    if (item.dateText) meta.push('<span class="anime-time">' + esc(item.dateText) + ' ' + esc(item.timeText) + '</span>');
    var score = item.score ? '<span class="anime-score">' + item.score + '</span>' : '';
    var studio = item.studio ? '<span class="anime-studio">' + esc(item.studio) + '</span>' : '';
    var likeBtn = opts.hideLike
      ? ''
      : '<button class="anime-like' + (liked ? ' is-liked' : '') + '" data-id="' + item.id + '" type="button" ' +
        'aria-label="' + (liked ? '取消喜欢' : '喜欢') + '" title="' + (liked ? '取消喜欢' : '喜欢') + '">' +
        '<i class="fas fa-heart"></i></button>';

    return '' +
      '<article class="anime-card" data-id="' + item.id + '">' +
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
          '<div class="anime-foot">' + studio + likeBtn + '</div>' +
        '</div>' +
      '</article>';
  }

  function bindLikeButtons(root) {
    root.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('.anime-like') : null;
      if (!btn) return;
      ev.preventDefault();
      var card = btn.closest('.anime-card');
      if (!card) return;
      var id = Number(btn.getAttribute('data-id'));
      var payload = card.__animeItem || { id: id };
      var nowLiked = toggleLike(payload);
      btn.classList.toggle('is-liked', nowLiked);
      btn.setAttribute('title', nowLiked ? '取消喜欢' : '喜欢');
      btn.setAttribute('aria-label', nowLiked ? '取消喜欢' : '喜欢');
      var tip = document.getElementById('anime-tip');
      if (tip) {
        tip.textContent = nowLiked
          ? '已加入「我的年度动画清单」（只存在这台设备的浏览器里，可在追番清单页导出）'
          : '已从年度动画清单移除';
        tip.classList.add('is-on');
        clearTimeout(tip.__timer);
        tip.__timer = setTimeout(function () { tip.classList.remove('is-on'); }, 3600);
      }
    });
  }

  /* ---------------- 本季新番表 ---------------- */

  function renderSeason(root) {
    if (root.getAttribute('data-ready') === '1') return;
    root.innerHTML = '<p class="anime-loading">正在加载本季新番…</p>';
    fetch('/anime/season.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var items = (data.items || []).slice();
        var groups = { '-1': [] };
        WEEKDAYS.forEach(function (_, i) { groups[String(i)] = []; });
        items.forEach(function (it) {
          var k = typeof it.weekdayIndex === 'number' ? String(it.weekdayIndex) : '-1';
          (groups[k] = groups[k] || []).push(it);
        });

        var html = '<div class="anime-head">' +
          '<span class="anime-season-label">' + esc((data.season && data.season.label) || '') + '</span>' +
          '<span class="anime-count">共 ' + (data.total || items.length) + ' 部</span>' +
          '<span class="anime-updated">数据更新：' + esc(String(data.generatedAt || '').slice(0, 10)) + '</span>' +
          '</div>' +
          '<p class="anime-hint">时间均为北京时间。点 ♥ 收藏到「我的年度动画清单」。</p>' +
          '<div id="anime-tip" class="anime-tip"></div>';

        // 周一到周日（weekdayIndex: 1..6 周一到周六，0 周日）
        var order = ['1', '2', '3', '4', '5', '6', '0'];
        var labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        order.forEach(function (key, i) {
          var list = groups[key] || [];
          if (!list.length) return;
          html += '<section class="anime-day"><h3 class="anime-day-title">' + labels[i] +
            '<span class="anime-day-num">' + list.length + '</span></h3><div class="anime-grid">';
          list.forEach(function (it) { html += cardHTML(it, { liked: isLiked(it.id) }); });
          html += '</div></section>';
        });

        var rest = groups['-1'] || [];
        if (rest.length) {
          html += '<section class="anime-day"><h3 class="anime-day-title">已完结 / 待定档' +
            '<span class="anime-day-num">' + rest.length + '</span></h3><div class="anime-grid">';
          rest.forEach(function (it) { html += cardHTML(it, { liked: isLiked(it.id) }); });
          html += '</div></section>';
        }

        html += '<p class="anime-source">数据来源：<a href="https://anilist.co" target="_blank" rel="noopener nofollow">AniList</a>，' +
          '本站仅展示标题、封面与放送时间，观看请支持正版。</p>';

        root.innerHTML = html;
        root.setAttribute('data-ready', '1');
        // 把条目挂到卡片上，供 ♥ 使用
        var map = {};
        items.forEach(function (it) { map[it.id] = it; });
        Array.prototype.forEach.call(root.querySelectorAll('.anime-card'), function (c) {
          c.__animeItem = map[Number(c.getAttribute('data-id'))];
        });
        bindLikeButtons(root);
      })
      .catch(function (err) {
        root.innerHTML = '<p class="anime-error">新番数据加载失败（' + esc(err.message) +
          '）。数据文件是构建时生成的静态 JSON，如果持续失败请检查 /anime/season.json 是否存在。</p>';
      });
  }

  /* ---------------- 我的年度动画清单 ---------------- */

  function renderLikes(root) {
    if (root.getAttribute('data-ready') === '1') return;
    root.innerHTML = '<p class="anime-loading">正在读取清单…</p>';
    var local = readLocal();

    fetch('/anime/likes.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : { years: {} }; })
      .catch(function () { return { years: {} }; })
      .then(function (pub) {
        pub = pub && pub.years ? pub.years : {};
        var localYears = local.years || {};
        var years = {};
        Object.keys(pub).concat(Object.keys(localYears)).forEach(function (y) {
          years[y] = years[y] || {};
          (pub[y] || []).forEach(function (it) { years[y][it.id] = { item: it, local: false }; });
          (localYears[y] || []).forEach(function (it) {
            years[y][it.id] = years[y][it.id] || { item: it, local: true };
          });
        });

        var yearKeys = Object.keys(years).sort().reverse();
        var total = 0;
        yearKeys.forEach(function (y) { total += Object.keys(years[y]).length; });

        if (!total) {
          root.innerHTML = '<p class="anime-empty">还没有收藏。去 <a href="/box/bangumi/">本季新番表</a> ' +
            '点卡片右下角的 ♥，就会出现在这里。</p>';
          return;
        }

        var html = '<div class="anime-head">' +
          '<span class="anime-season-label">我的年度动画清单</span>' +
          '<span class="anime-count">共 ' + total + ' 部</span>' +
          '<button id="anime-export" class="anime-export" type="button">导出 likes.json</button>' +
          '</div>' +
          '<p class="anime-hint">♥ 只存在这台设备的浏览器里。想让别人也看到，点「导出」替换仓库里的 ' +
          '<code>source/anime/likes.json</code> 后提交。</p>' +
          '<div id="anime-tip" class="anime-tip"></div>';

        yearKeys.forEach(function (y) {
          var list = Object.keys(years[y]).map(function (k) { return years[y][k]; });
          list.sort(function (a, b) {
            return (b.item.score || 0) - (a.item.score || 0);
          });
          html += '<section class="anime-day"><h3 class="anime-day-title">' + esc(y) + ' 年' +
            '<span class="anime-day-num">' + list.length + '</span></h3><div class="anime-grid">';
          list.forEach(function (rec) {
            var it = Object.assign({}, rec.item, { nextEpisode: 0, dateText: '', timeText: '' });
            html += cardHTML(it, { liked: true });
          });
          html += '</div></section>';
        });

        root.innerHTML = html;
        root.setAttribute('data-ready', '1');

        var map = {};
        Object.keys(years).forEach(function (y) {
          Object.keys(years[y]).forEach(function (id) { map[id] = years[y][id].item; });
        });
        Array.prototype.forEach.call(root.querySelectorAll('.anime-card'), function (c) {
          var it = map[c.getAttribute('data-id')];
          if (it) c.__animeItem = Object.assign({}, it, { nextEpisode: 0, dateText: '', timeText: '' });
        });
        bindLikeButtons(root);

        var exp = document.getElementById('anime-export');
        if (exp) {
          exp.addEventListener('click', function () {
            var data = readLocal();
            var text = JSON.stringify({ years: data.years || {} }, null, 2) + '\n';
            var done = function () {
              exp.textContent = '已复制 ✓';
              setTimeout(function () { exp.textContent = '导出 likes.json'; }, 2500);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text).then(done, function () { window.prompt('复制下面内容：', text); });
            } else {
              window.prompt('复制下面内容：', text);
            }
          });
        }
      });
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    var season = document.getElementById('anime-season');
    if (season) renderSeason(season);
    var likes = document.getElementById('anime-likes');
    if (likes) renderLikes(likes);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // 主题用 pjax 换页，换页后重新初始化
  document.addEventListener('pjax:complete', init);
})();
