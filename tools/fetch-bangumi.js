#!/usr/bin/env node
/**
 * 从 Bangumi 抓「追番清单」，下载封面到本地，生成静态 JSON。
 *
 * 用法：
 *   node tools/fetch-bangumi.js            # 抓默认用户（见 BGM_USER）
 *   node tools/fetch-bangumi.js 123456     # 抓指定 UID
 *
 * 产出：
 *   source/anime/watching.json             # 页面渲染用的数据
 *   source/anime/covers/<subjectId>.jpg    # 封面（已存在则跳过）
 *
 * 为什么必须在本地跑、且需要梯子：
 *   api.bgm.tv 在国内被 DNS 污染（解析到假 IP，443 不通），lain.bgm.tv（封面图床）同样。
 *   所以脚本会先探测本机 127.0.0.1:7890，通过它出网；抓完把数据落成文件提交进仓库，
 *   服务器构建时完全不联网。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');

const PROXY = 'http://127.0.0.1:7890';
const BGM_USER = process.argv[2] || '1044188';
const API = 'https://api.bgm.tv';
const UA = '171031-blog-bangumi-sync/1.0 (+https://171031.me)';

const ROOT = path.join(__dirname, '..');
const OUT_JSON = path.join(ROOT, 'source', 'anime', 'watching.json');
const COVER_DIR = path.join(ROOT, 'source', 'anime', 'covers');

/** 抓取哪些收藏状态：3=在看，2=看过（想看=1 / 搁置=4 / 抛弃=5 需要时再加） */
const WANTED_TYPES = [
  { type: 3, key: 'doing', label: '在看' },
  { type: 2, key: 'collect', label: '看过' },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 探测本地代理端口是否有人监听 */
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

/** 带 UA 的 JSON 请求 */
async function getJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

/** 下载一张封面；已存在就跳过，返回相对站点的路径 */
async function downloadCover(subjectId, coverUrl) {
  const file = path.join(COVER_DIR, `${subjectId}.jpg`);
  if (fs.existsSync(file) && fs.statSync(file).size > 1024) {
    return `/anime/covers/${subjectId}.jpg`;
  }
  if (!coverUrl) return '';
  try {
    const res = await fetch(coverUrl, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) throw new Error('文件过小，可能是错误页');
    fs.writeFileSync(file, buf);
    return `/anime/covers/${subjectId}.jpg`;
  } catch (e) {
    console.warn(`  ! 封面下载失败 ${subjectId}: ${e.message}`);
    return '';
  }
}

/** 把 2026-10-23T15:06:16+08:00 取成 2026 */
function yearOf(iso) {
  const m = /^(\d{4})/.exec(String(iso || ''));
  return m ? m[1] : '';
}

async function main() {
  // ---- 1. 没有代理环境变量时，自己带代理重启一次 ----
  if (!process.env.BANGUMI_FETCH_CHILD) {
    const alive = await proxyAlive();
    if (!alive) {
      console.error('[bgm] 检测不到 127.0.0.1:7890 的代理。');
      console.error('[bgm] api.bgm.tv 在国内直连不通，请先开启代理后重跑。');
      process.exit(1);
    }
    console.log('[bgm] 检测到本地代理，带代理重启脚本…');
    const r = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: {
        ...process.env,
        BANGUMI_FETCH_CHILD: '1',
        NODE_USE_ENV_PROXY: '1', // Node 24+：让 fetch 读 HTTPS_PROXY
        HTTPS_PROXY: PROXY,
        HTTP_PROXY: PROXY,
      },
    });
    process.exit(r.status === null ? 1 : r.status);
  }

  // ---- 2. 用户信息 ----
  console.log(`[bgm] 抓取用户 ${BGM_USER} 的收藏…`);
  const user = await getJSON(`${API}/v0/users/${BGM_USER}`).catch(() => null);
  if (user) console.log(`[bgm] 用户：${user.nickname || user.username || BGM_USER}`);

  // ---- 3. 逐类分页抓取 ----
  const items = [];
  const counts = {};
  for (const { type, key, label } of WANTED_TYPES) {
    let offset = 0;
    const limit = 50;
    let total = 0;
    for (;;) {
      const page = await getJSON(
        `${API}/v0/users/${BGM_USER}/collections?subject_type=2&type=${type}&limit=${limit}&offset=${offset}`
      );
      total = page.total || 0;
      for (const it of page.data || []) {
        const s = it.subject || {};
        items.push({
          id: s.id,
          name: s.name || '',
          nameCN: s.name_cn || '',
          date: s.date || '',
          eps: s.eps || 0,
          // 全网评分（Bangumi 用户平均分）与排名
          score: s.score || 0,
          rank: s.rank || 0,
          img: (s.images && s.images.large) || '',
          url: s.url || `https://bgm.tv/subject/${s.id}`,
          // 我的收藏信息
          status: key,
          statusLabel: label,
          myRate: it.rate || 0,
          comment: it.comment || '',
          tags: it.tags || [],
          epStatus: it.ep_status || 0,
          updatedAt: it.updated_at || '',
          year: yearOf(it.updated_at),
        });
      }
      offset += limit;
      if (offset >= total || offset >= 500) break;
      await sleep(350); // 礼貌限速
    }
    counts[key] = total;
    console.log(`[bgm] ${label}: ${total} 条`);
  }

  // ---- 4. 下载封面 ----
  fs.mkdirSync(COVER_DIR, { recursive: true });
  console.log(`[bgm] 下载封面（共 ${items.length} 张，已存在会跳过）…`);
  const CONCURRENCY = 4;
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const paths = await Promise.all(batch.map((it) => downloadCover(it.id, it.img)));
    batch.forEach((it, idx) => {
      it.localCover = paths[idx];
    });
    await sleep(120);
  }

  // ---- 5. 落盘 ----
  const payload = {
    generatedAt: new Date().toISOString(),
    user: {
      id: String(BGM_USER),
      name: (user && (user.nickname || user.username)) || String(BGM_USER),
      url: `https://bgm.tv/user/${BGM_USER}`,
    },
    counts,
    source: 'Bangumi API v0 (/v0/users/{id}/collections)',
    items,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  const withCover = items.filter((i) => i.localCover).length;
  console.log(`[bgm] 完成：${items.length} 条（封面成功 ${withCover} 张）`);
  console.log(`[bgm] 写入 ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`[bgm] 封面目录 ${path.relative(ROOT, COVER_DIR)}`);
}

main().catch((err) => {
  console.error('[bgm] 抓取失败:', err.message);
  if (/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|fetch failed/i.test(err.message)) {
    console.error('[bgm] 看起来是网络问题：确认代理开着（127.0.0.1:7890）。');
  }
  process.exit(1);
});
