#!/usr/bin/env node
/**
 * 从 Bangumi 抓「本季新番表」（每日放送），下载封面，生成静态 JSON。
 *
 * 用法：
 *   node tools/fetch-bangumi-season.js
 *
 * 产出：
 *   source/anime/season.json               # 新番表数据（与本文件同名的 AniList 版共用页面）
 *   source/anime/covers/<subjectId>.jpg    # 封面（与追番清单共用目录，已存在则跳过）
 *
 * 与 AniList 版的差异（为什么换）：
 *   Bangumi 有中文名（94/110 覆盖）、评分、追番人数；但**没有具体放送时刻和下一话编号**，
 *   只有「周几」和「首播日期」。所以卡片从「第 N 话 · 22:00」变成「周几 · 首播 MM-DD」。
 *
 * 网络：api.bgm.tv 与 lain.bgm.tv 在国内均不可直连，脚本会自动通过本机 127.0.0.1:7890 出网。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');

const PROXY = 'http://127.0.0.1:7890';
const API = 'https://api.bgm.tv';
const UA = '171031-blog-season-sync/1.0 (+https://171031.me)';

const ROOT = path.join(__dirname, '..');
const OUT_JSON = path.join(ROOT, 'source', 'anime', 'season.json');
const COVER_DIR = path.join(ROOT, 'source', 'anime', 'covers');

const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function proxyAlive() {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port: 7890 });
    const done = (ok) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(800);
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    s.once('timeout', () => done(false));
  });
}

/** 补全协议；并借助 Bangumi 的 /r/{宽}/ 缩放接口把大图压到卡片够用的尺寸 */
function sizedUrl(url, width) {
  const u = String(url || '').replace(/^http:\/\//, 'https://');
  if (!/lain\.bgm\.tv\/pic\//.test(u)) return u;
  return u.replace('lain.bgm.tv/pic/', `lain.bgm.tv/r/${width}/pic/`);
}

/**
 * 选图策略（2026-10-23 修正）：原来用 small 只有 78×44，高分屏下糊得厉害。
 * Bangumi 除 large 外的档位都很小（common 150 / medium 100 / small 78 / grid 48），
 * 唯一可用的是 large（原图），所以统一取 large 再走 /r/600/ 缩放（约 600px、26KB）。
 */
function pickImage(images) {
  if (!images) return '';
  const base = images.large || images.common || images.small || images.grid || '';
  return sizedUrl(base, 600);
}

async function downloadCover(id, url) {
  const file = path.join(COVER_DIR, `${id}.jpg`);
  const force = process.env.BGM_FORCE_COVER === '1'; // 换清晰度后重下：BGM_FORCE_COVER=1
  if (!force && fs.existsSync(file) && fs.statSync(file).size > 1024) {
    return { path: `/anime/covers/${id}.jpg`, bytes: 0 };
  }
  if (!url) return { path: '', bytes: 0 };
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) throw new Error('文件过小');
    fs.writeFileSync(file, buf);
    return { path: `/anime/covers/${id}.jpg`, bytes: buf.length };
  } catch (e) {
    console.warn(`  ! 封面失败 ${id}: ${e.message}`);
    return { path: '', bytes: 0 };
  }
}

/** 当前季度标签，例如「2026 年秋季新番」 */
function seasonLabel(now) {
  const cn = { 1: '冬', 4: '春', 7: '夏', 10: '秋' };
  const m = now.getMonth() + 1;
  const start = Math.floor((m - 1) / 3) * 3 + 1;
  return `${now.getFullYear()} 年${cn[start]}季新番`;
}

async function main() {
  // 1. 无代理环境变量则带代理重启
  if (!process.env.BANGUMI_FETCH_CHILD) {
    if (!(await proxyAlive())) {
      console.error('[bgm-season] 检测不到 127.0.0.1:7890 的代理，api.bgm.tv 国内直连不通。');
      console.error('[bgm-season] 请先开启代理后重跑。');
      process.exit(1);
    }
    console.log('[bgm-season] 检测到本地代理，带代理重启脚本…');
    const r = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: {
        ...process.env,
        BANGUMI_FETCH_CHILD: '1',
        NODE_USE_ENV_PROXY: '1',
        HTTPS_PROXY: PROXY,
        HTTP_PROXY: PROXY,
      },
    });
    process.exit(r.status === null ? 1 : r.status);
  }

  // 2. 拉每日放送
  console.log('[bgm-season] 拉取 /calendar …');
  const res = await fetch(`${API}/calendar`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`/calendar HTTP ${res.status}`);
  const days = await res.json();
  if (!Array.isArray(days)) throw new Error('/calendar 返回格式异常');

  // 3. 展平成条目
  const items = [];
  days.forEach((day) => {
    const wd = (day.weekday && day.weekday.id) || 0; // 1..7，7=周日
    (day.items || []).forEach((it) => {
      if (it.type !== 2) return; // 2 = 动画，过滤掉三次元/书籍
      const idx = wd % 7; // 1..6 -> 1..6，7 -> 0
      const rating = it.rating || {};
      items.push({
        id: it.id,
        name: it.name || '',
        nameCN: it.name_cn || '',
        airDate: it.air_date || '',
        weekdayIndex: idx,
        weekday: WEEKDAY_CN[idx],
        score: rating.score || 0,
        rank: rating.rank || 0,
        ratingTotal: rating.total || 0,
        // collection.doing = 当前在追人数
        doing: (it.collection && it.collection.doing) || 0,
        url: (it.url || `https://bgm.tv/subject/${it.id}`).replace(/^http:\/\//, 'https://'),
        img: pickImage(it.images),
      });
    });
  });

  // 按「周几 -> 评分 -> 追番人数」排序，前端会再按 weekdayIndex 分组
  items.sort((a, b) => a.weekdayIndex - b.weekdayIndex || b.score - a.score || b.doing - a.doing);

  // 4. 下载封面（并发 4，礼貌限速）
  fs.mkdirSync(COVER_DIR, { recursive: true });
  const missing = items.filter((it) => !fs.existsSync(path.join(COVER_DIR, `${it.id}.jpg`)));
  console.log(`[bgm-season] 封面：${items.length} 部，需下载 ${missing.length} 张…`);
  let downloadedBytes = 0;
  const CONCURRENCY = 4;
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((it) => downloadCover(it.id, it.img)));
    batch.forEach((it, k) => {
      it.localCover = results[k].path;
      downloadedBytes += results[k].bytes;
    });
    await sleep(100);
  }

  // 5. 落盘
  const payload = {
    // 保持与旧版（AniList）相同的顶层结构，前端只需改卡片字段
    season: {
      label: seasonLabel(new Date()),
      source: 'bangumi',
    },
    generatedAt: new Date().toISOString(),
    total: items.length,
    source: 'Bangumi API v0 (/calendar 每日放送)',
    items,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  const withCover = items.filter((i) => i.localCover).length;
  const withCN = items.filter((i) => i.nameCN).length;
  console.log(`[bgm-season] 完成：${items.length} 部（中文名 ${withCN} 部，封面 ${withCover} 张）`);
  console.log(`[bgm-season] 本次下载 ${(downloadedBytes / 1048576).toFixed(1)} MB`);
  console.log(`[bgm-season] 写入 ${path.relative(ROOT, OUT_JSON)}`);
}

main().catch((err) => {
  console.error('[bgm-season] 抓取失败:', err.message);
  if (/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|fetch failed/i.test(err.message)) {
    console.error('[bgm-season] 看起来是网络问题：确认代理开着（127.0.0.1:7890）。');
  }
  process.exit(1);
});
