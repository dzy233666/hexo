#!/usr/bin/env node
/**
 * 抓取酷狗「我的年度歌单」（2021-2025），生成静态 JSON + 本地封面。
 *
 * 用法：
 *   node tools/fetch-kugou.js
 *
 * 产出：
 *   source/life/music/playlists.json         页面数据
 *   source/life/music/covers/<listid>.jpg    歌单封面（400px）
 *
 * 原理（逆向自 KugouMusic.NET，MIT）：
 *   1. 酷狗播放器把登录态加密存在 %APPDATA%\kugou\kugou-player.db 的 kv_store 表，
 *      值是 "KGSESSION:v1:" + Windows DPAPI 密文（绑定当前 Windows 账户）。
 *   2. 用 PowerShell 5.1 调 DPAPI 解出 userid / token / dfid。
 *   3. 按播放器的算法签名：md5(salt + 排序后的 "k=v" 拼接 + body + salt)，
 *      请求 https://gateway.kugou.com/v7/get_all_list（x-router 指向 cloudlist 服务）。
 *   4. 每个歌单用 /v4/get_list_all_file 取曲目。
 *
 * 前提：酷狗播放器已登录过（登录态未过期）。过期时重新登录播放器再跑。
 * 隐私：会话只在临时缓存里停留几秒，读完立刻删除；不进仓库（.gitignore 已排除）。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

/* ---------- 配置 ---------- */
const APPID = '3116';
const CLIENTVER = '11440';
const SALT = 'LnT6xpN3khm36zse0QzvmgTZ3waWdRSA';
const USER_AGENT = 'Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi';
const GATEWAY = 'https://gateway.kugou.com';
const ROUTER_CLOUDLIST = 'cloudlist.service.kugou.com';

/** 只要这几年的年度歌单 */
const YEARS = [2021, 2022, 2023, 2024, 2025];

const ROOT = path.join(__dirname, '..');
const OUT_JSON = path.join(ROOT, 'source', 'life', 'music', 'playlists.json');
const COVER_DIR = path.join(ROOT, 'source', 'life', 'music', 'covers');
const CACHE_DIR = path.join(__dirname, '.cache');

/* ---------- 工具 ---------- */
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

function dbPath() {
  const appData = process.env.APPDATA;
  if (!appData) throw new Error('读不到 %APPDATA%，这个脚本只能在 Windows 上跑');
  return path.join(appData, 'kugou', 'kugou-player.db');
}

/** 从播放器的 SQLite 里读出 DPAPI 密文，再用 PowerShell 解密成 JSON 对象 */
function loadSession() {
  const db = dbPath();
  if (!fs.existsSync(db)) {
    throw new Error(`找不到酷狗播放器数据库：${db}\n请先打开并登录一次酷狗音乐播放器。`);
  }

  // 1. 读 kv_store（node:sqlite，Node 22+ 内置，无需额外依赖）
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch (e) {
    throw new Error('当前 Node 缺少 node:sqlite（需要 Node 22+），请升级 Node 后重试。');
  }
  const conn = new DatabaseSync(`file:${db.replace(/\\/g, '/')}?mode=ro`, { readOnly: true });
  let value = '';
  try {
    const row = conn.prepare("SELECT value FROM kv_store WHERE key='default' AND scope='session'").get();
    value = row ? String(row.value) : '';
  } finally {
    conn.close();
  }
  if (!value) throw new Error('数据库里没有登录态。请在酷狗播放器里登录后重试。');

  // 2. 落临时文件 → PowerShell DPAPI 解密 → 读回 → 删掉
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const encFile = path.join(CACHE_DIR, 'session.b64');
  const decFile = path.join(CACHE_DIR, 'session.json');
  const psFile = path.join(CACHE_DIR, 'decrypt.ps1');
  fs.writeFileSync(encFile, value.replace(/^KGSESSION:v1:/, ''), 'utf8');

  const ps = [
    'Add-Type -AssemblyName System.Security',
    `$b64 = (Get-Content '${encFile.replace(/'/g, "''")}' -Raw).Trim()`,
    '$bytes = [Convert]::FromBase64String($b64)',
    "$plain = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, 'CurrentUser')",
    `[System.IO.File]::WriteAllText('${decFile.replace(/'/g, "''")}', [System.Text.Encoding]::UTF8.GetString($plain))`,
  ].join('\r\n');
  fs.writeFileSync(psFile, ps, 'utf8');

  const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile], {
    stdio: 'inherit',
  });

  let session = null;
  try {
    if (r.status === 0 && fs.existsSync(decFile)) {
      session = JSON.parse(fs.readFileSync(decFile, 'utf8'));
    }
  } finally {
    for (const f of [encFile, decFile, psFile]) {
      try {
        fs.unlinkSync(f);
      } catch (e) {
        /* 忽略 */
      }
    }
  }
  if (!session) throw new Error('DPAPI 解密失败（可能换了 Windows 账户，或播放器用别的账户登录过）。');
  if (!session.UserId || !session.Token) throw new Error('登录态里缺 userid / token，请重新登录播放器。');
  return session;
}

/** 按播放器的算法签名并请求（默认发到 gateway，用 x-router 指定真实服务） */
async function kgCall(session, apiPath, body, router, extraParams) {
  const dmid = BigInt('0x' + md5(session.Dfid)).toString();
  const uuid = md5(session.Dfid + dmid);
  const clienttime = Math.floor(Date.now() / 1000).toString();

  const params = Object.assign(
    {
      appid: APPID,
      clientver: CLIENTVER,
      dfid: session.Dfid,
      mid: dmid,
      uuid,
      userid: session.UserId,
      token: session.Token,
      clienttime,
    },
    extraParams || {}
  );

  const jsonBody = JSON.stringify(body);
  const keys = Object.keys(params).sort();
  params.signature = md5(SALT + keys.map((k) => `${k}=${params[k]}`).join('') + jsonBody + SALT);

  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  const res = await fetch(`${GATEWAY}${apiPath}?${qs}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      'x-router': router,
      dfid: session.Dfid,
      mid: dmid,
      clienttime,
      'kg-rc': '1',
      'kg-thash': '5d816a0',
      'kg-rec': '1',
      'kg-rf': 'B9EDA08A64250DEFFBCADDEE00F8F25F',
    },
    body: jsonBody,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${apiPath}`);
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`返回不是 JSON：${text.slice(0, 120)}`);
  }
  if (json.status !== 1) {
    throw new Error(
      `酷狗接口返回 status=${json.status} errcode=${json.error_code}（多半是登录态过期，请在播放器里重新登录后重跑）`
    );
  }
  return json;
}

/** 图床 URL 里的 {size} 占位符换成 400 */
function coverUrl(pic) {
  if (!pic) return '';
  return pic.replace('{size}', '400').replace(/^http:/, 'https:');
}

async function downloadCover(listid, pic) {
  const url = coverUrl(pic);
  if (!url) return '';
  const file = path.join(COVER_DIR, `${listid}.jpg`);
  if (fs.existsSync(file) && fs.statSync(file).size > 1024) return `/life/music/covers/${listid}.jpg`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1024) throw new Error('文件过小');
    fs.writeFileSync(file, buf);
    return `/life/music/covers/${listid}.jpg`;
  } catch (e) {
    console.warn(`  ! 封面失败 ${listid}: ${e.message}`);
    return '';
  }
}

/** 曲目字段归一化 */
function normalizeSong(s, idx) {
  const singer = Array.isArray(s.singerinfo)
    ? s.singerinfo.map((x) => x && x.name).filter(Boolean).join('、')
    : '';
  return {
    index: idx + 1,
    name: cleanTitle(s.name, singer),
    singer,
    album: (s.albuminfo && s.albuminfo.name) || '',
    duration: s.timelen ? Math.round(s.timelen / 1000) : 0, // 秒
  };
}

/**
 * 酷狗返回的 name 常常是文件名，例如「HoneyComeBear - ニライカナイ.mp3」。
 * 去掉扩展名；若前缀正好是歌手名，把前缀也去掉（歌手另有字段）。
 */
function cleanTitle(raw, singer) {
  let t = String(raw || '').replace(/\.(mp3|flac|m4a|wav|ogg|ape|aac)$/i, '').trim();
  const m = /^(.+?)\s+-\s+(.+)$/.exec(t);
  if (m && singer) {
    const head = m[1].trim();
    const firstSinger = singer.split('、')[0];
    if (head === singer || head === firstSinger || singer.includes(head)) {
      return m[2].trim();
    }
  }
  return t;
}

const fmtDuration = (sec) => {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

async function main() {
  console.log('[kugou] 读取本地登录态…');
  const session = loadSession();
  console.log(`[kugou] 已登录，userid 长度 ${String(session.UserId).length}`);

  console.log('[kugou] 拉取我的歌单列表…');
  const listResp = await kgCall(
    session,
    '/v7/get_all_list',
    { userid: session.UserId, token: session.Token, total_ver: 979, type: 2, page: 1, pagesize: 100 },
    ROUTER_CLOUDLIST,
    { plat: '1' }
  );
  const all = (listResp.data && listResp.data.info) || [];
  console.log(`[kugou] 共 ${all.length} 个歌单`);

  // 只留「我的YYYY年度歌单」，年份限定在 YEARS 内
  const picked = [];
  for (const p of all) {
    const m = /我的(\d{4})年度歌单/.exec(p.name || '');
    if (!m) continue;
    const year = Number(m[1]);
    if (!YEARS.includes(year)) continue;
    picked.push({ year, listid: String(p.listid), name: p.name, count: Number(p.count) || 0, pic: p.pic });
  }
  picked.sort((a, b) => b.year - a.year); // 新的年份在前
  if (!picked.length) {
    throw new Error(`没找到年度歌单（期望名字形如「我的2021年度歌单」，年份 ${YEARS.join('/')}）`);
  }
  console.log(`[kugou] 命中年度歌单 ${picked.length} 个：${picked.map((x) => x.year).join(' / ')}`);

  // 逐个抓曲目（每年 10 首，一页足够）
  fs.mkdirSync(COVER_DIR, { recursive: true });
  const out = [];
  for (const p of picked) {
    process.stdout.write(`[kugou] ${p.year} 年度歌单（listid ${p.listid}）… `);
    const resp = await kgCall(
      session,
      '/v4/get_list_all_file',
      {
        listid: p.listid,
        userid: session.UserId,
        area_code: 1,
        show_relate_goods: 0,
        pagesize: 50,
        allplatform: 1,
        show_cover: 1,
        type: 0,
        token: session.Token,
        page: 1,
      },
      ROUTER_CLOUDLIST
    );
    const songs = ((resp.data && resp.data.info) || []).map(normalizeSong);
    const localCover = await downloadCover(p.listid, p.pic);
    out.push({
      year: p.year,
      listid: p.listid,
      name: p.name,
      count: songs.length || p.count,
      cover: localCover,
      songs: songs.map((s) => ({ ...s, durationText: fmtDuration(s.duration) })),
    });
    console.log(`${songs.length} 首${localCover ? '，封面已存' : ''}`);
    await new Promise((r) => setTimeout(r, 400)); // 礼貌限速
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'kugou cloudlist (/v7/get_all_list + /v4/get_list_all_file)',
    years: out,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  const total = out.reduce((n, y) => n + y.songs.length, 0);
  console.log(`[kugou] 完成：${out.length} 个歌单 / ${total} 首歌`);
  console.log(`[kugou] 写入 ${path.relative(ROOT, OUT_JSON)}`);
}

main().catch((err) => {
  console.error('[kugou] 失败:', err.message);
  process.exit(1);
});
