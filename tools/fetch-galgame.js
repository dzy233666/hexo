#!/usr/bin/env node
/**
 * 从 Bangumi 抓「我的 galgame 清单」，下载封面，生成静态 JSON。
 *
 * 用法：
 *   node tools/fetch-galgame.js            # 默认用户（见 BGM_USER）
 *   node tools/fetch-galgame.js 123456     # 指定 UID
 *
 * 产出：
 *   source/galgame/list.json               # 页面数据
 *   source/galgame/covers/<subjectId>.jpg  # 封面（600px，已存在则跳过；BGM_FORCE_COVER=1 强制重下）
 *
 * 说明：
 *   - subject_type=4 是 Bangumi 的「游戏」，galgame 属于其中。
 *   - 收藏接口不返回 nsfw 与 infobox，所以要为每条再请求一次 /v0/subjects/{id}
 *     （限速 350ms，几十条大约十几秒）。
 *   - 开发信息从 infobox 里按优先级取：开发 → 开发商 → 发行 → ブランド。
 *   - api.bgm.tv / lain.bgm.tv 国内不可直连，脚本会自动通过本机 127.0.0.1:7890 出网。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');

const PROXY = 'http://127.0.0.1:7890';
const BGM_USER = process.argv[2] || '1044188';
const API = 'https://api.bgm.tv';
const UA = '171031-blog-galgame-sync/1.0 (+https://171031.me)';

const ROOT = path.join(__dirname, '..');
const OUT_JSON = path.join(ROOT, 'source', 'galgame', 'list.json');
const COVER_DIR = path.join(ROOT, 'source', 'galgame', 'covers');

/** 收藏状态：3=在玩 2=玩过 1=想玩（搁置4 / 抛弃5 暂不展示） */
const WANTED_TYPES = [
  { type: 3, key: 'doing', label: '在玩' },
  { type: 2, key: 'collect', label: '玩过' },
  { type: 1, key: 'wish', label: '想玩' },
];

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

async function getJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

/** Bangumi 的 /r/{宽}/ 缩放接口：原图太大，卡片只要 600px */
function sizedUrl(url) {
  const u = String(url || '').replace(/^http:\/\//, 'https://');
  if (!/lain\.bgm\.tv\/pic\//.test(u)) return u;
  return u.replace('lain.bgm.tv/pic/', 'lain.bgm.tv/r/600/pic/');
}

async function downloadCover(subjectId, coverUrl) {
  const file = path.join(COVER_DIR, `${subjectId}.jpg`);
  const force = process.env.BGM_FORCE_COVER === '1';
  if (!force && fs.existsSync(file) && fs.statSync(file).size > 1024) {
    return `/galgame/covers/${subjectId}.jpg`;
  }
  if (!coverUrl) return '';
  try {
    const res = await fetch(sizedUrl(coverUrl), { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) throw new Error('文件过小');
    fs.writeFileSync(file, buf);
    return `/galgame/covers/${subjectId}.jpg`;
  } catch (e) {
    console.warn(`  ! 封面失败 ${subjectId}: ${e.message}`);
    return '';
  }
}

/** infobox 是 [{key, value}]，value 可能是字符串、[{v}] 或 [{k,v}]，统一拍平成字符串 */
function infoboxGet(infobox, keys) {
  if (!Array.isArray(infobox)) return '';
  for (const key of keys) {
    const hit = infobox.find((x) => x && x.key === key);
    if (!hit) continue;
    const v = hit.value;
    if (typeof v === 'string') return v.trim();
    if (Array.isArray(v)) {
      return v
        .map((x) => (typeof x === 'string' ? x : x && (x.v || x.k)))
        .filter(Boolean)
        .map((x) => String(x).trim())
        .join('、');
    }
    if (v && v.v) return String(v.v).trim();
  }
  return '';
}

function yearOf(str) {
  const m = /^(\d{4})/.exec(String(str || ''));
  return m ? m[1] : '';
}

async function main() {
  // ---- 1. 代理 ----
  if (!process.env.BANGUMI_FETCH_CHILD) {
    if (!(await proxyAlive())) {
      console.error('[galgame] 检测不到 127.0.0.1:7890 的代理，api.bgm.tv 国内直连不通。');
      console.error('[galgame] 请先开启代理后重跑。');
      process.exit(1);
    }
    console.log('[galgame] 检测到本地代理，带代理重启脚本…');
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

  // ---- 2. 用户 ----
  console.log(`[galgame] 抓取用户 ${BGM_USER} 的游戏收藏…`);
  const user = await getJSON(`${API}/v0/users/${BGM_USER}`).catch(() => null);
  if (user) console.log(`[galgame] 用户：${user.nickname || user.username || BGM_USER}`);

  // ---- 3. 收藏列表 ----
  const items = [];
  const counts = {};
  for (const { type, key, label } of WANTED_TYPES) {
    let offset = 0;
    const limit = 50;
    let total = 0;
    for (;;) {
      const page = await getJSON(
        `${API}/v0/users/${BGM_USER}/collections?subject_type=4&type=${type}&limit=${limit}&offset=${offset}`
      );
      total = page.total || 0;
      for (const it of page.data || []) {
        const s = it.subject || {};
        items.push({
          id: s.id,
          name: s.name || '',
          nameCN: s.name_cn || '',
          date: s.date || '',
          releaseYear: yearOf(s.date),
          score: s.score || 0,
          rank: s.rank || 0,
          img: (s.images && s.images.large) || '',
          url: s.url || `https://bgm.tv/subject/${s.id}`,
          status: key,
          statusLabel: label,
          myRate: it.rate || 0,
          comment: it.comment || '',
          tags: it.tags || [],
          updatedAt: it.updated_at || '',
          collectedYear: yearOf(it.updated_at),
        });
      }
      offset += limit;
      if (offset >= total || offset >= 500) break;
      await sleep(350);
    }
    counts[key] = total;
    console.log(`[galgame] ${label}: ${total} 条`);
  }

  if (!items.length) {
    console.log('[galgame] 没有抓到任何游戏收藏。');
    console.log('[galgame] 请先到 https://bgm.tv 把玩过的 galgame 收藏起来（打分/写短评），再重跑本脚本。');
  }

  // ---- 4. 逐条补详情（nsfw + 开发）----
  console.log(`[galgame] 补详情（${items.length} 条，每条间隔 350ms）…`);
  for (const it of items) {
    try {
      const d = await getJSON(`${API}/v0/subjects/${it.id}`);
      it.nsfw = Boolean(d.nsfw);
      it.developer = infoboxGet(d.infobox, ['开发', '开发商', '发行', 'ブランド', 'ブランド/開発']);
      // 中文名有时只写在 infobox 的「别名」里
      if (!it.nameCN) {
        const alias = infoboxGet(d.infobox, ['别名']);
        const first = alias.split('、').map((x) => x.trim()).find((x) => /[\u4e00-\u9fa5]/.test(x));
        if (first) it.nameCN = first;
      }
    } catch (e) {
      it.nsfw = false;
      it.developer = '';
      console.warn(`  ! 详情失败 ${it.id}: ${e.message}`);
    }
    await sleep(350);
  }

  // ---- 5. 封面 ----
  fs.mkdirSync(COVER_DIR, { recursive: true });
  const missing = items.filter((it) => !fs.existsSync(path.join(COVER_DIR, `${it.id}.jpg`))).length;
  console.log(`[galgame] 封面：需下载 ${missing} 张…`);
  for (let i = 0; i < items.length; i += 4) {
    const batch = items.slice(i, i + 4);
    const paths = await Promise.all(batch.map((it) => downloadCover(it.id, it.img)));
    batch.forEach((it, k) => {
      it.localCover = paths[k];
    });
    await sleep(100);
  }

  // ---- 6. 落盘 ----
  const payload = {
    generatedAt: new Date().toISOString(),
    user: {
      id: String(BGM_USER),
      name: (user && (user.nickname || user.username)) || String(BGM_USER),
      url: `https://bgm.tv/user/${BGM_USER}`,
    },
    counts,
    source: 'Bangumi API v0 (/v0/users/{id}/collections?subject_type=4 + /v0/subjects/{id})',
    items,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  const withCover = items.filter((i) => i.localCover).length;
  const nsfw = items.filter((i) => i.nsfw).length;
  console.log(
    `[galgame] 完成：${items.length} 条（封面 ${withCover} 张，其中 R18 标记 ${nsfw} 条）`
  );
  console.log(`[galgame] 写入 ${path.relative(ROOT, OUT_JSON)}`);
}

main().catch((err) => {
  console.error('[galgame] 抓取失败:', err.message);
  if (/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|fetch failed/i.test(err.message)) {
    console.error('[galgame] 看起来是网络问题：确认代理开着（127.0.0.1:7890）。');
  }
  process.exit(1);
});
