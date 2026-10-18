/*!
 * wow-pjax-rehook.js —— 站点级脚本（不改 themes/ 与 node_modules/）
 * ---------------------------------------------------------------------------
 * 症状：站内 pjax 从文章页点回首页（或首页 → 分类页 → 首页）后，所有卡片"唰"一下就
 *      在那儿了，没有出场动画；而直接刷新首页时动画正常。
 *
 * 原因链（全部实测确认）：
 *  1) 卡片身上的 .wow / animate__fadeIn / data-wow-* 不是主题写的，是 hexo-butterfly-wowjs
 *     插件在 body_end 注入的 <script async> 干的活：
 *     node_modules/hexo-butterfly-wowjs/lib/html.pug 为 _config.fomalhaut.yml 里每个
 *     wowjs.animateitem 生成一段 getElementsByClassName(...) → classList.add('wow')
 *     → setAttribute('data-wow-duration' / 'data-wow-delay' / 'data-wow-offset' /
 *     'data-wow-iteration') 的小脚本，整块包在 <div class="js-pjax"> 里，且【没有 data-pjax】。
 *  2) themes/fomalhaut/layout/includes/third-party/pjax.pug 的 pjax:complete 里只重放
 *     document.querySelectorAll('script[data-pjax]')（用新 script 节点替换旧的才会执行），
 *     没带 data-pjax 的脚本一律不跑 —— wow 的加类脚本正好属于后者。
 *  3) pjax 换页时 .js-pjax 也在 pjaxSelectors 里，它的 innerHTML 被整块换成新页面的同款
 *     脚本；但"新插入 DOM 的 <script>"浏览器不会执行，于是这些脚本哑火。
 *  4) 结果：换页后首页卡片身上根本没有 .wow 类，wow.js 的 live MutationObserver 也就没有
 *     对象可接管 → 不隐藏、不揭示、无动画。wow 实例本身（wow_init.js）一直都在，没坏。
 *
 * 修法：pjax:complete 之后，把 .js-pjax 里这批哑火的加类脚本原样重放一次（换成新 script
 *      节点强制执行）。刻意复用插件自己的脚本，而不是在本文件里再抄一份 700ms/0/0/fadeIn，
 *      这样动画参数永远跟着 _config.fomalhaut.yml 的 wowjs.animateitem 走，换页后与首屏一致；
 *      然后把新插入的卡片重新登记进 wow 的待揭示队列（wow.doSync(document.body)）：
 *      只重放加类脚本是不够的——wow.js v1.3.0 的 live MutationObserver 只在"节点插入那一刻"
 *      扫一次，而我们的 .wow 类是插入之后才加上的，且 doSync 会跳过自己父节点下的"新增自身"
 *      这一层，于是卡片会带着 .wow 却永远不进 boxes（可见但没有动画）。显式 doSync 一次，
 *      wow 就会 applyStyle 隐藏 + 50ms 内揭示，效果与首屏完全一致。
 *      同时清掉 wow.boxes 里已经被 pjax 换掉的旧节点，避免列表越滚越长。
 *
 * 卸载：删除本文件即可，不产生任何其它构建产物依赖。
 */
'use strict';

const WOW_PJAX_REHOOK_SCRIPT = `<script id="wow-pjax-rehook">
(function () {
  if (window.__wowPjaxRehook) return;
  window.__wowPjaxRehook = true;

  // 插件生成的加类脚本特征：调 classList.add 又写 data-wow-duration 的，就是它
  function isWowInjector(code) {
    return !!code && code.indexOf('classList.add') > -1 && code.indexOf('data-wow-duration') > -1;
  }

  // 把 .js-pjax 里哑火的加类脚本重放一遍（照抄 pjax.pug 的重放手法：换新节点才会执行）
  function replayInjectors() {
    var scripts = document.querySelectorAll('.js-pjax script');
    for (var i = 0; i < scripts.length; i++) {
      var old = scripts[i];
      if (old.getAttribute('data-pjax') !== null) continue; // 主题自己会重放，别跑两遍
      var code = old.text || old.textContent || old.innerHTML || '';
      if (!isWowInjector(code)) continue;
      var neu = document.createElement('script');
      neu.setAttribute('data-wow-pjax-replay', '');
      neu.appendChild(document.createTextNode(code));
      old.parentNode.replaceChild(neu, old);
    }
  }

  // wow 实例兜底 + 清理被 pjax 换掉的旧节点（否则 wow.boxes 会一直 accumulate）
  function resyncBoxes() {
    var wow = window.wow;
    if (!wow && typeof window.WOW === 'function') {
      // 等价于 node_modules/hexo-butterfly-wowjs/lib/wow_init.js
      window.wow = new window.WOW({
        boxClass: 'wow',
        animateClass: 'animate__animated',
        offset: 0,
        mobile: false,
        live: true
      });
      window.wow.init();
      return;
    }
    if (!wow) return;
    try {
      if (wow.boxes && wow.boxes.length) {
        wow.boxes = wow.boxes.filter(function (el) { return el && document.contains(el); });
      }
      // 关键一步：让 wow 自己把新插入的 .wow 卡片登记进 boxes（会顺手隐藏 + 置 scrolled）
      if (typeof wow.doSync === 'function') {
        wow.doSync(document.body);
      } else if (wow.boxes && wow.applyStyle) {
        // 老版本 wow.js 没有 doSync，手动补：从没被 wow 摸过的块（没有 inline visibility）收进来
        var nodes = document.querySelectorAll('.wow');
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          if (el.style.visibility) continue;
          if (wow.all && wow.all.indexOf(el) > -1) continue;
          wow.boxes.push(el);
          if (wow.all) wow.all.push(el);
          wow.applyStyle(el, true);
        }
        wow.scrolled = true;
      }
      // 再补一次 scroll 事件，保证 50ms 轮询这一拍立刻跑
      window.dispatchEvent(new Event('scroll'));
    } catch (e) {}
  }

  function run() {
    try { replayInjectors(); } catch (e) {}
    try { resyncBoxes(); } catch (e) {}
  }

  document.addEventListener('pjax:complete', function () {
    // 主题的 pjax:complete 监听器（pjax.pug）先重放 script[data-pjax]（轮播/磁贴注入脚本在里面），
    // 所以这里延后一拍，保证重放顺序在它之后；300ms 那次兜底给异步补内容的场景。
    setTimeout(run, 0);
    setTimeout(run, 300);
  });

  // 调试用：控制台里 window.__wowPjaxRehookNow() 可手动触发一次
  window.__wowPjaxRehookNow = run;
})();
</script>`;

hexo.extend.injector.register('body_end', WOW_PJAX_REHOOK_SCRIPT, 'default');
