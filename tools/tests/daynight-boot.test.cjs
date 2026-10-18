'use strict';
// Dependency-free: node --test tools/tests/daynight-boot.test.cjs
// 覆盖 source/js/inject/daynight-boot.js 的站点旋钮（enabled / latLng / themeKey 与运行期 setConfig）、
// 手动选择优先与过期清理，以及 source/js/modules/settings.js 那段「8 小时自动切换」是否听总开关。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const bootSource = fs.readFileSync(path.join(root, 'source/js/inject/daynight-boot.js'), 'utf8');
const calendarSource = fs.readFileSync(path.join(root, 'source/js/aside-calendar.js'), 'utf8');
const settingsSource = fs.readFileSync(path.join(root, 'source/js/modules/settings.js'), 'utf8');
const configText = fs.readFileSync(path.join(root, '_config.fomalhaut.yml'), 'utf8');

function section(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, 'real source section exists: ' + start);
  return source.slice(from, to);
}

// 固定「现在」：脚本内部到处 new Date()，不钉住就没法定日 / 夜
function fakeDate(iso) {
  const fixed = new Date(iso).getTime();
  return class FixedDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(fixed); }
    static now() { return fixed; }
  };
}

// vm 里造出来的数组/对象跨 realm，deepStrictEqual 会因原型不同而失败 —— 先拉回本 realm 再比
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function mkBody(classes) {
  return {
    classList: {
      add: (n) => classes.add(n),
      remove: (n) => classes.delete(n),
      contains: (n) => classes.has(n)
    }
  };
}

function boot(options) {
  options = options || {};
  const store = new Map();
  Object.keys(options.storage || {}).forEach((k) => store.set(k, String(options.storage[k])));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); }
  };
  const attributes = {};
  const classes = new Set();
  const icons = [];
  const calls = [];
  const listeners = {};
  const doc = {
    readyState: 'loading',
    documentElement: {
      setAttribute: (n, v) => { attributes[n] = String(v); },
      getAttribute: (n) => (n in attributes ? attributes[n] : null)
    },
    body: options.bodyInitiallyNull ? null : mkBody(classes),
    // 真实页面里 #modeicon 在 <body> 里，head 阶段摸不到它
    getElementById: (id) => ((id === 'modeicon' && doc.body)
      ? { setAttribute: (n, v) => { if (n === 'xlink:href') icons.push(v); } }
      : null),
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); }
  };
  const win = {
    document: doc,
    localStorage,
    Date: fakeDate(options.now || '2026-10-14T23:00:00'),
    activateDarkMode: () => { calls.push('dark'); attributes['data-theme'] = 'dark'; },
    activateLightMode: () => { calls.push('light'); attributes['data-theme'] = 'light'; }
  };
  if ('fomalNightConfig' in options) win.fomalNightConfig = options.fomalNightConfig;
  win.window = win;
  vm.createContext(win);
  vm.runInContext(bootSource, win, { filename: 'daynight-boot.js' });
  return {
    win, doc, store, attributes, classes, icons, calls, api: win.fomalDayNight,
    theme: () => (('data-theme' in attributes) ? attributes['data-theme'] : null),
    fire: (ev) => (listeners[ev] || []).forEach((fn) => fn()),
    attachBody: () => { doc.body = mkBody(classes); }
  };
}

const CHOICE_LIGHT = JSON.stringify({ value: 'light', expiry: Date.now() + 86400000 });

/* ---------- 首屏：有选择听选择，没选择按日出日落 ---------- */

test('夜里没手动选择 → 首屏写 dark，DOM 就绪后补 body.DarkMode 与图标', () => {
  const h = boot({ now: '2026-10-14T23:00:00', bodyInitiallyNull: true });
  assert.equal(h.theme(), 'dark');
  assert.deepEqual(h.calls, ['dark']);
  assert.deepEqual(h.icons, [], 'head 阶段还没有 body，#modeicon 摸不到');
  h.attachBody();
  h.fire('DOMContentLoaded');
  assert.equal(h.classes.has('DarkMode'), true);
  assert.deepEqual(h.icons, ['#icon-sun']);
});

test('白天没手动选择 → light，且不给 body 留 DarkMode', () => {
  const h = boot({ now: '2026-10-14T12:00:00' });
  assert.equal(h.theme(), 'light');
  assert.deepEqual(h.calls, ['light']);
  assert.equal(h.classes.has('DarkMode'), false);
});

test('未过期的手动选择优先：自动模式一个属性都不写', () => {
  const h = boot({ now: '2026-10-14T23:00:00', storage: { theme: CHOICE_LIGHT } });
  assert.equal(h.api.hasChoice(), true);
  assert.equal(h.api.apply(), null);
  assert.equal(h.theme(), null);
  assert.deepEqual(h.calls, []);
  assert.equal(h.store.get('theme'), CHOICE_LIGHT, '手动选择原样保留');
});

test('手动选择过期 → 键被清掉，自动模式重新接管', () => {
  const stale = JSON.stringify({ value: 'dark', expiry: 1 });
  const h = boot({ now: '2026-10-14T23:00:00', storage: { theme: stale } });
  assert.equal(h.api.hasChoice(), false);
  assert.equal(h.store.has('theme'), false);
  assert.equal(h.theme(), 'dark');
});

/* ---------- 旋钮：enabled / latLng / themeKey ---------- */

test('地理兜底：没写坐标时用访客时区推的经度', () => {
  const h = boot({ now: '2026-10-14T12:00:00' });
  const g = h.api.geo();
  assert.equal(g.src, 'tz');
  assert.equal(g.lat, 22.5319);
  assert.equal(g.lng, -new Date().getTimezoneOffset() / 4);
});

test('enabled:false 关掉自动模式：日夜都不动手，重复执行也不动手', () => {
  const h = boot({ now: '2026-10-14T23:00:00', fomalNightConfig: { enabled: false } });
  assert.equal(h.api.config.enabled, false);
  assert.equal(h.api.apply(), null);
  assert.equal(h.theme(), null);
  assert.deepEqual(h.calls, []);
  assert.equal(h.classes.has('DarkMode'), false);
  h.fire('DOMContentLoaded');
  assert.equal(h.theme(), null);
});

test('latLng 写死坐标：geo() 用它，日出日落按站点算而不是按访客', () => {
  const h = boot({ now: '2026-10-14T12:00:00', fomalNightConfig: { latLng: [43.8, 87.6] } });
  assert.deepEqual(plain(h.api.geo()), { lat: 43.8, lng: 87.6, src: 'config' });
  const d = new Date(2026, 9, 14, 12, 0, 0);
  const site = h.api.sunTimes(d, 43.8, 87.6);
  const fallback = h.api.sunTimes(d, 22.5319, 120);
  const lenSite = (site.set - site.rise) / 3600000;
  const lenFallback = (fallback.set - fallback.rise) / 3600000;
  // 独立参照：10-14 北纬 43.8° 白昼约 11.1h，北纬 22.5° 约 11.7h（纬度越高秋天白昼越短）
  assert.ok(lenSite > 10.5 && lenSite < 11.7, '站点坐标白昼 ' + lenSite.toFixed(2) + 'h 应在 11.1h 附近');
  assert.ok(lenFallback > 11.0 && lenFallback < 12.4, '兜底坐标白昼 ' + lenFallback.toFixed(2) + 'h 应在 11.7h 附近');
  assert.ok(lenSite < lenFallback, '同一时刻、两套坐标必须给出不同的白天长度');
});

test('latLng 非法 / 越界 / 字符串一律按没写处理（坏配置不该毁掉页面）', () => {
  const bad = boot({ now: '2026-10-14T12:00:00', fomalNightConfig: { latLng: 'nonsense' } });
  assert.equal(bad.api.config.latLng, null);
  assert.equal(bad.api.geo().src, 'tz');
  const range = boot({ now: '2026-10-14T12:00:00', fomalNightConfig: { latLng: [999, 0] } });
  assert.equal(range.api.config.latLng, null);
  const ok = boot({ now: '2026-10-14T12:00:00', fomalNightConfig: { latLng: '[22.5, 114.06]' } });
  assert.deepEqual(plain(ok.api.config.latLng), [22.5, 114.06], '写成一整条 JSON 字符串也认');
});

test('themeKey 可改：手动选择存在别的键里也认，默认键里的残留不会误判', () => {
  const cfg = { themeKey: 'themeX' };
  const custom = boot({ now: '2026-10-14T23:00:00', fomalNightConfig: cfg, storage: { themeX: CHOICE_LIGHT } });
  assert.equal(custom.api.themeKey, 'themeX');
  assert.equal(custom.api.hasChoice(), true);
  assert.equal(custom.api.apply(), null);
  assert.equal(custom.theme(), null);
  const legacyKeyOnly = boot({ now: '2026-10-14T23:00:00', fomalNightConfig: cfg, storage: { theme: CHOICE_LIGHT } });
  assert.equal(legacyKeyOnly.api.hasChoice(), false);
  assert.equal(legacyKeyOnly.theme(), 'dark', '换了键名，旧键里的内容就不算「访客选过」');
});

test('setConfig：运行期改旋钮立刻重算，非法值保持原值', () => {
  const h = boot({ now: '2026-10-14T23:00:00' });
  assert.equal(h.theme(), 'dark');
  assert.deepEqual(plain(h.api.setConfig({ latLng: [22.5, 114.06] }).latLng), [22.5, 114.06]);
  assert.deepEqual(plain(h.api.setConfig({ latLng: [999, 0] }).latLng), [22.5, 114.06], '越界坐标不覆盖已有值');
  assert.deepEqual(h.api.setConfig({ latLng: null }).latLng, null, '显式写 null 才清掉坐标');
  assert.equal(h.api.setConfig({ enabled: false }).enabled, false);
  assert.equal(h.api.setConfig({ themeKey: 'other' }).themeKey, 'other');
});

test('极昼极夜算不出日出日落 → 什么都不做', () => {
  const h = boot({ now: '2026-06-21T12:00:00', fomalNightConfig: { latLng: [89.9, 0] } });
  assert.equal(h.api.sunTimes(new Date(2026, 5, 21, 12, 0, 0), 89.9, 0), null);
  assert.equal(h.api.apply(), null);
  assert.equal(h.theme(), null);
});

/* ---------- 接线：_config、aside-calendar.js、settings.js ---------- */

test('_config.fomalhaut.yml：旋钮脚本排在 daynight-boot.js 之前，且是原样 HTML', () => {
  const iCfg = configText.indexOf('window.fomalNightConfig=window.fomalNightConfig||');
  // 上面注释里也提到了 daynight-boot.js，所以要认准真正的注入行
  const iBoot = configText.indexOf('<script src="/js/inject/daynight-boot.js');
  assert.ok(iCfg > 0 && iBoot > 0 && iCfg < iBoot, '配置那行必须在 daynight-boot.js 之前执行');
  assert.match(configText, /daynight-boot\.js\?v=20261014-nightboot2/);
  assert.match(configText, /\{enabled:true,latLng:null,themeKey:'theme'\}/);
  assert.ok(!configText.includes('&lt;script'), '注入内容不该被转义成实体');
});

test('aside-calendar.js：启动时把旧旋钮报给共享实现，且地理判定交给它', () => {
  const iDef = calendarSource.indexOf('function syncSharedConfig()');
  const iCall = calendarSource.indexOf('\n  syncSharedConfig();');
  const iInit = calendarSource.lastIndexOf('applyDayNight();');
  assert.ok(iDef > 0 && iCall > iDef, 'syncSharedConfig 先定义后调用');
  assert.ok(iCall < iInit, '汇报必须排在解析期那次 applyDayNight() 之前');
  assert.match(calendarSource, /if \(fdn\) return fdn\.geo\(\);/);
  assert.match(calendarSource, /patch\.latLng = \[\+c\[0\], \+c\[1\]\]/);
});

// settings.js 那段「8 小时自动切换」是顶层代码，抽出来在 vm 里跑 —— 只用它自己的依赖项打桩
const scheduleBlock = section(settingsSource, '// 每12小时强制切换一次夜间模式', '// 切换自定义颜色');

function runSchedule(opts) {
  const writes = [];
  const calls = [];
  const attrs = { 'data-theme': opts.mode || 'light' };
  const classes = new Set(opts.darkClass ? ['DarkMode'] : []);
  const store = new Map([['lastTime', String(Date.now() - (opts.hoursAgo || 0) * 3600000)]]);
  const win = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); writes.push([k, String(v)]); }
    },
    document: {
      getElementsByTagName: () => [{ getAttribute: (n) => (n in attrs ? attrs[n] : null) }],
      getElementById: (id) => ({ setAttribute: (n, v) => { calls.push([id, n, v]); } }),
      querySelector: () => ({
        classList: {
          add: (n) => classes.add(n),
          remove: (n) => classes.delete(n),
          contains: (n) => classes.has(n)
        }
      })
    },
    activateDarkMode: () => { calls.push(['dark']); attrs['data-theme'] = 'dark'; },
    activateLightMode: () => { calls.push(['light']); attrs['data-theme'] = 'light'; },
    saveToLocal: { set: (k, v, ttl) => writes.push([k, String(v), ttl]) },
    Date
  };
  if (opts.fomalDayNight !== undefined) win.fomalDayNight = opts.fomalDayNight;
  if (opts.fomalAsideCalendar !== undefined) win.fomalAsideCalendar = opts.fomalAsideCalendar;
  win.window = win;
  vm.createContext(win);
  vm.runInContext(scheduleBlock, win, { filename: 'settings-schedule.js' });
  return { writes, calls, attrs, classes, store };
}

test('8 小时自动切换：模式不对时会切，并且按共享实现给的日夜判断走', () => {
  const night = runSchedule({
    mode: 'light', hoursAgo: 9,
    fomalDayNight: { config: { enabled: true }, isDayNow: () => false },
    fomalAsideCalendar: { isDayNow: () => true }   // 故意打架：必须听 fomalDayNight
  });
  assert.equal(night.attrs['data-theme'], 'dark');
  assert.ok(night.writes.some(([k, v, ttl]) => k === 'theme' && v === 'dark' && ttl === 2));
  assert.ok(night.calls.some((c) => c[0] === 'dark'));

  const day = runSchedule({
    mode: 'dark', hoursAgo: 9, darkClass: true,
    fomalDayNight: { config: { enabled: true }, isDayNow: () => true }
  });
  assert.equal(day.attrs['data-theme'], 'light');
  assert.equal(day.classes.has('DarkMode'), false, '切到白天要摘掉 body.DarkMode（原来写成了 add）');
  assert.ok(day.writes.some(([k, v, ttl]) => k === 'theme' && v === 'light' && ttl === 2));
});

test('8 小时自动切换：enabled:false 时这一段也不许动手', () => {
  const off = runSchedule({
    mode: 'light', hoursAgo: 9,
    fomalDayNight: { config: { enabled: false }, isDayNow: () => false }
  });
  assert.deepEqual(off.writes, []);
  assert.deepEqual(off.calls, []);
  assert.equal(off.attrs['data-theme'], 'light');
});

test('8 小时自动切换：8 小时内不动手', () => {
  const fresh = runSchedule({
    mode: 'light', hoursAgo: 1,
    fomalDayNight: { config: { enabled: true }, isDayNow: () => false }
  });
  assert.deepEqual(fresh.writes, []);
  assert.deepEqual(fresh.calls, []);
});
