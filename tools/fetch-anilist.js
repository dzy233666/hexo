#!/usr/bin/env node
/**
 * 从 AniList 抓「当季新番 + 放送时间」，写成静态 JSON 供前端渲染。
 *
 * 为什么单独一个脚本、不放进 hexo 构建：
 *   hexo generate 必须离线且确定（上次断网导致 public 被清空、站点 403）。
 *   外部抓取是"可能失败"的操作，所以单独跑、结果落地成文件、提交进仓库。
 *
 * 用法：  node tools/fetch-anilist.js
 *         node tools/fetch-anilist.js 2027 1     # 指定年份和季度（1=冬 4=春 7=夏 10=秋）
 *
 * 产出：  source/anime/season.json
 *
 * 数据来源：AniList GraphQL（https://anilist.co）。仅取公开元数据（标题/封面/评分/放送时间），
 * 页面上的跳转链接指回 AniList，本站不镜像任何番剧内容。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const OUT_FILE = path.join(__dirname, '..', 'source', 'anime', 'season.json');

/** 季度起始月 -> AniList 的季节枚举（1月=冬 / 4月=春 / 7月=夏 / 10月=秋） */
const SEASON_OF_MONTH = { 1: 'WINTER', 4: 'SPRING', 7: 'SUMMER', 10: 'FALL' };
const SEASON_CN = { WINTER: '冬', SPRING: '春', SUMMER: '夏', FALL: '秋' };

/**
 * 根据今天推断当季（AniList 的季度划分：1-3 冬 / 4-6 春 / 7-9 夏 / 10-12 秋）。
 * 注意算的是「季度的起始月」（1/4/7/10），不要用季度末月（3/6/9/12），否则映射不到枚举。
 * @param {Date} now
 */
function currentSeason(now) {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const startMonth = Math.floor((month - 1) / 3) * 3 + 1; // 1 4 7 10
  return { year, season: SEASON_OF_MONTH[startMonth] };
}

const QUERY = `
query ($page: Int, $season: MediaSeason, $year: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    media(
      type: ANIME
      season: $season
      seasonYear: $year
      sort: POPULARITY_DESC
      isAdult: false
    ) {
      id
      title { native romaji }
      coverImage { large }
      episodes
      averageScore
      popularity
      format
      status
      studios(isMain: true) { nodes { name } }
      nextAiringEpisode { episode airingAt }
      siteUrl
    }
  }
}
`;

async function graphql(page, season, year) {
  const res = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // 带上 UA 说明来源，便于对方识别流量
      'User-Agent': '171031-blog-anime-sync/1.0 (+https://171031.me)',
    },
    body: JSON.stringify({ query: QUERY, variables: { page, season, year } }),
  });
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`AniList 返回错误: ${JSON.stringify(json.errors)}`);
  return json.data.Page;
}

/** 把 unix 秒转成北京时间（UTC+8）的星期与 HH:mm —— 用固定偏移，避免依赖服务器时区 */
function toBeijing(unixSec) {
  const d = new Date((unixSec + 8 * 3600) * 1000);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return {
    weekday: weekdays[d.getUTCDay()],
    weekdayIndex: d.getUTCDay(), // 0=周日
    dateText: `${mm}-${dd}`,
    timeText: `${hh}:${mi}`,
    fullText: `${mm}-${dd} ${hh}:${mi}`,
  };
}

async function main() {
  const args = process.argv.slice(2);
  let year;
  let season;
  if (args.length >= 2) {
    year = Number(args[0]);
    season = SEASON_OF_MONTH[Number(args[1])];
    if (!year || !season) throw new Error('参数格式：node tools/fetch-anilist.js 2027 1（1=冬 4=春 7=夏 10=秋）');
  } else {
    ({ year, season } = currentSeason(new Date()));
  }

  console.log(`[anime] 抓取 ${year} ${season} …`);
  const items = [];
  for (let page = 1; page <= 4; page++) {
    const p = await graphql(page, season, year);
    for (const m of p.media) {
      const next = m.nextAiringEpisode;
      const beijing = next ? toBeijing(next.airingAt) : null;
      items.push({
        id: m.id,
        title: m.title.native || m.title.romaji,
        romaji: m.title.romaji || '',
        cover: (m.coverImage && m.coverImage.large) || '',
        episodes: m.episodes || 0,
        score: m.averageScore || 0,
        popularity: m.popularity || 0,
        format: m.format || '',
        status: m.status || '',
        studio: (m.studios && m.studios.nodes && m.studios.nodes[0] && m.studios.nodes[0].name) || '',
        // 放送信息（北京时间）；没有下一话时说明已完结或未定档
        nextEpisode: next ? next.episode : 0,
        airingAt: next ? next.airingAt : 0,
        weekday: beijing ? beijing.weekday : '',
        weekdayIndex: beijing ? beijing.weekdayIndex : -1,
        dateText: beijing ? beijing.dateText : '',
        timeText: beijing ? beijing.timeText : '',
        siteUrl: m.siteUrl || `https://anilist.co/anime/${m.id}`,
      });
    }
    if (!p.pageInfo.hasNextPage) break;
    // 礼貌限速：AniList 限制 90 次/分钟，这里每页间隔 800ms
    await new Promise((r) => setTimeout(r, 800));
  }

  // 播放中的排在前面，其次按热度
  items.sort((a, b) => {
    const liveA = a.nextEpisode ? 0 : 1;
    const liveB = b.nextEpisode ? 0 : 1;
    if (liveA !== liveB) return liveA - liveB;
    return b.popularity - a.popularity;
  });

  const payload = {
    season: { season, seasonCN: SEASON_CN[season], year, label: `${year} 年${SEASON_CN[season]}季新番` },
    generatedAt: new Date().toISOString(),
    total: items.length,
    source: 'AniList GraphQL (https://anilist.co)',
    items,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  const live = items.filter((i) => i.nextEpisode).length;
  console.log(`[anime] 完成：${items.length} 部，其中 ${live} 部连载中`);
  console.log(`[anime] 已写入 ${path.relative(process.cwd(), OUT_FILE)}`);
}

main().catch((err) => {
  console.error('[anime] 抓取失败:', err.message);
  process.exit(1);
});
