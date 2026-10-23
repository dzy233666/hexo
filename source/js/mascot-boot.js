/**
 * 看板娘启动器（web-mascot）
 *
 * 素材位置：/web-mascot/  （引擎 index.js + chunks/ + mascot_pack/{Neuron,Eviling}）
 * 许可：引擎 GPL-3.0-or-later；宠物包 Neuron / Eviling 为 CC-BY-NC-SA-4.0（非商业）
 *       原文见 source/web-mascot/LICENSE 与 source/web-mascot/NOTICE.txt
 *
 * 四条设计考虑：
 *   1. 用动态 import() 而不是顶层 import —— 手机端/省流量模式下连脚本都不下载（省 2.7 MB）
 *   2. 等 window.load 之后再加载 —— 不阻塞首屏
 *   3. 只创建一次并挂个全局标记 —— 主题是 pjax 换页，避免每次跳转都多出一批
 *   4. 引擎不会自动加载 mascot_pack 下的所有宠物：**每一只都要单独 createMascot()**。
 *      所以下面是 PACKS 数组，想加/减宠物改这个数组即可。
 */
(function () {
  'use strict';

  var FLAG = '__mascotBooted';
  if (window[FLAG]) return;

  /**
   * 要出现的宠物列表（对应 source/web-mascot/mascot_pack/ 下的目录名）。
   * 只留一只就把另一个删掉，例如：var PACKS = ['Neuron'];
   */
  var PACKS = ['Neuron', 'Eviling'];

  function skipReason() {
    if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) return '屏幕较窄（移动端）';
    if (navigator.connection && navigator.connection.saveData) return '浏览器省流量模式';
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return '系统偏好减少动效';
    return '';
  }

  function start() {
    var reason = skipReason();
    if (reason) {
      console.info('[mascot] 已跳过加载：' + reason);
      return;
    }

    window[FLAG] = true;

    import('/web-mascot/index.js')
      .then(function (mod) {
        // 必须在 createMascot 之前指定素材基址，否则精灵图会 404
        mod.configure({ assets: '/web-mascot/mascot_pack' });

        // 每只宠物一个独立引擎实例（容器都用 body，各自 position: fixed）
        return Promise.allSettled(
          PACKS.map(function (name) {
            return mod.createMascot({ container: document.body, pack: name });
          })
        );
      })
      .then(function (results) {
        var ok = 0;
        results.forEach(function (r, i) {
          if (r.status === 'fulfilled') {
            ok++;
          } else {
            console.warn('[mascot] ' + PACKS[i] + ' 启动失败：', r.reason);
          }
        });
        if (ok) console.info('[mascot] 已启动 ' + ok + '/' + PACKS.length + ' 只：' + PACKS.join(', '));
        else window[FLAG] = false;
      })
      .catch(function (err) {
        window[FLAG] = false;
        console.warn('[mascot] 引擎加载失败：', err);
      });
  }

  // 已经加载完（比如从 bfcache 回来）就直接启动，否则等 load
  if (document.readyState === 'complete') {
    start();
  } else {
    window.addEventListener('load', start, { once: true });
  }
})();
