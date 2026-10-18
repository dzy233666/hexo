---
title: 旧时光
date: 2022-08-31 20:00:00
comments: false
---

{% timeline 主题功能里程碑 %}

<!-- timeline 2022-08 -->

1. 站点从 Butterfly 4.3.1 起步，开始第一轮美化：自定义字体、加载动画、右键菜单、鼠标指针特效

<!-- endtimeline -->

<!-- timeline 2022-10 -->

1. 首页卡片改版：文章卡片、分类磁贴、轮播图三件套成型
2. 新增友人帐、朋友圈、画廊、八音盒等独立页面

<!-- endtimeline -->

<!-- timeline 2023-03 -->

1. 主题正式从 butterfly 改名为 fomalhaut，配置文件同步为 `_config.fomalhaut.yml`

<!-- endtimeline -->

<!-- timeline 2026-10-03 -->

1. **屎山重构**：`fomal.js` 从 2973 行拆成 105 行主引导 + 10 个模块/数据文件；配置里的内联样式与脚本抽成 `site-inject.css` 与 6 个注入脚本；`custom.css` 删掉 341 行死代码并加上文件头地图

<!-- endtimeline -->

<!-- timeline 2026-10-04 -->

1. 关于页重做：顶部 Hero + 线路卡片 + 实测参数对照表，卡片右下角挂「实时延迟」徽标，可单条重测或一键重测全部
2. 配色全量改为「主题色派生」（`color-mix`），换主题色整页跟着走，不再有写死的绿色
3. 部署链路新增一键脚本 `npm run deploy:vercel`；AI 助手前端脚本带上内容版本号，改完访客不会拿到旧缓存
4. 手机端抽屉重做（独立样式表，13 个小节）：面板、字标、签名、头像、统计胶囊、菜单与二级菜单、遮罩、入场动效、深色与无障碍

<!-- endtimeline -->

<!-- timeline 2026-10-05 -->

1. 首屏关键链：给默认正文字体补 `preload`（浏览器不用再等 CSS 解析完才发现字体）；夜间默认壁纸统一到与 JS 逐字一致的地址，避免同一张图下两份
2. 动画生命周期：雪花 / 星空从「不可见就跳过绘制」升级为「不可见即退出 rAF」，恢复交给失效回调；帧率监测改成「面板开着才起循环」，采样封装成带 generation 的闭包
3. 滚动监听：修掉 `window.scroll = () => btf.throttle(fn, 200)()` 这种「工厂 + 当场调用」的假节流；`btf.throttle` 补 `cancel()`；pjax 清理里统一解绑
4. 指针与滚动读写分离：小猫咪的指针输入只记最新值、下一帧先读几何再增量写；手机端自绘滚动条把测量放在读阶段、创建与写入放在写阶段
5. 评论区重做：三张独立白卡浮在压灰一档的面板上，配整块焦点环（`source/css/twikoo.css`）
6. 侧栏作者卡加回形针装饰（新增 `source/css/paperclip.css`，白天细长蓝白款 / 夜间冰蓝夜光）
7. 新增 4 个 `node:test` 回归脚本（光标效果、帧率生命周期、手机滚动条、滚动监听），可用环境变量指向 `bak/` 里的基线做前后对比（`tools/tests/`）
8. 清理 13 个死文件（`leaves.js` / `bibi.js` / `love.js`、tag-map 的 proj4 两条、`local-search.js`、`tw_cn.js`、旧 gulp 素材等）
9. 排查「同一页面线上比本地卡」：先证明不是部署问题 —— 线上 `js/modules/` 与本地 `public/js/modules/` 下的同名模块脚本过一遍同版本 terser 后逐字节一致，`css/index.css` 也只是 clean-css 的等价改写，规则级 diff 没有语义丢失；同一浏览器全新加载，线上 85fps、本地 84fps。真正的分叉在 DevTools Performance 里：线上单帧 75ms 有 64ms 花在「重新计算样式」，本地同帧只有 26ms 渲染 + 26ms 绘制。无痕窗口（禁用全部扩展）打开即与本地一样流畅，单独关掉广告拦截器立刻恢复 —— 拦截器的隐藏规则按域名下发，`localhost` 与 `127.0.0.1` 天然被排除，所以只有线上受影响。结论在浏览器侧，站点代码一行没改
10. 顺带修掉 `themes/fomalhaut/source/sw.js` 的两个真缺陷：① 缓存失效只认 index.html 内容的 djb2 哈希，其余资源走 cache-first + 24 小时 TTL，某次发版只改 JS 与 CSS 却忘了改 `?v=` 缓存戳时 URL 与 HTML 都没变，回访者会继续跑旧代码最长 24 小时；现在文本资源（html/js/mjs/css/json/xml/txt/map/webmanifest/manifest/svg）的 TTL 压到 10 分钟、图片与字体与音视频仍按 24 小时，`CACHE_NAME` 提到 `ICDNCache-v3`，老访客 activate 时整体丢掉 v2 残片。② `getFileType()` 白名单只列到 ttf，其余一律 text/plain，站内会走 SW 的 `.cur` 自定义光标与 `atom.xml` / `sitemap.xml` / `search.xml` 都被猜错类型；补齐 cur/avif/bmp/apng/otf/eot/xml/txt/map/webmanifest/manifest/mp3/m4a/mp4/webm/pdf/wasm
11. 新增 `tools/tests/sw-cache.test.cjs`：纯 VM 跑 Service Worker 源码（caches / fetch / Response 全打桩，不联网、不起服务），断言覆盖域名白名单、回源到对象存储、二次请求吃缓存，以及「js 11 分钟旧 → 触发一次后台校验，5 分钟新 → 不动，webp 25 小时旧 → 才校验」的 TTL 分流
12. 线路探测不再污染 SW 缓存：`source/js/inject/ping-route.js` 每次探测都用「站点自身域名 + 新的随机串」请求 `/?__pr=xxx-N`，在线上会被 sw.js 接住走 HTML 分支（改写回源、下载整份 index.html 约 98KB、写进 ICDNCache）；缓存键含查询串而随机串每次都不同，这些条目以后永远读不到，而加载、每次 pjax、每 5 分钟各来一轮，逛得越久堆得越多。现在带 `__pr=` 的请求只做「改写 + 回源」不落地缓存，徽标量到的仍是到源站的往返、数字不变；回归测试同步加到 9 项
13. AI 助手「吐字」卡顿：先证伪了最像元凶的一条 —— 把 `esc()` 与 `md()` 从 `source/js/ai-chat.js` 按行号切出来做 Node 微基准，8000 字全量重解析 2667 次累计只有 195ms（单次 `md(4000)` 只有 0.06ms），O(n²) 是真的但常数可忽略；真凶在每个分片都 `bub.innerHTML = md(acc)` 整块重建气泡，加上 `scrollBottom()` 里先读 `scrollHeight` 与 `clientHeight` 再写 `scrollTop` 的读写交错，探针在真机上量出 28 秒里有 8.1 秒花在强制同步布局上（3816 次读取）、面板 innerHTML 写了 955 次
14. 流式渲染改成「分片只累积文本、DOM 提交合并到一帧（rAF + 100ms 兜底）+ 滚动只写不读（stick 标记：手动往上滚不再跟随、滚回底部自动恢复）」：三条 20 秒突发流的帧率 63.7/67.6 → 89.7/89.9/90.0 fps，超过 50ms 的卡顿帧 94/73 → 0，长任务 99 个合计 7.5s → 0，强制布局累计 5925/7015ms → 82/106/107ms，面板写入 944/994 次 → 96/102 次
15. AI 助手再往下两步：只重建「尾巴」（`tailCut` 只在代码围栏外、非有序列表中间、行内 `**` 与 `[ ]` 成对的行尾定稿，已定稿部分一次性追加，最大尾块 111 字，Node 按 1/3/11/17 字四种分片步长验证 0 处不一致）与面板空闲时提前建好（点开最差帧 288.9 → 177.8ms、热开 11.2ms）；想让剩下那 180ms 也提前付掉，试过把关闭态改成 `visibility:visible` + `opacity:0`，Chromium 不绘制全透明内容，没收益已回滚

<!-- endtimeline -->

<!-- timeline 2026-10-10 -->

1. 美化面板分区：原来的滑条堆拆成「氛围特效 / 互动挂件 / 布局与部件」三块 `bf-panel`，两列网格、面板变窄时自动单列
2. 关掉即真正停下：猫咪挂件（`nekoOn`）与听话鼠标（`cursorOn`）各一个开关、默认开启；关闭时清掉时钟定时器与 `requestAnimationFrame`、断开 `MutationObserver`、指针热路径提前返回，不再「关了还在算」
3. 主题色支持自定义（`settings.js`）：面板新增原生取色圈（视觉直径 24px、热区 44px、环宽 3px），值以严格校验的六位 HEX 存进 `themeCustomColor`，首帧校验不合法就回落默认青绿
4. 预设色板整理为十一色：删掉紫 / 灰 / 黑三个旧选项、补上抹茶绿；旧键自动迁移（`purple → purepurple`、`gray` / `black → darkblue`），375px 宽自动 6+5 换行
5. 字体设置预览化（新增 `source/js/modules/appearance-fonts.js`）：阅读 5 / 个性 3 / 代码 4 三组，正文与代码各一块实时预览；只对合法 key 请求 `document.fonts.load`、12 秒超时、最新请求胜、失败不写偏好可重试；「恢复默认」只重置两个字体键
6. 背景设置预览化（新增 `source/js/modules/appearance-backgrounds.js`）：32 张壁纸 + 8 个渐变 + 7 个纯色 + 8 个 API 图全保留；图库 / 色彩 / 自定义一级，图库再分四类，打开分类才给 `<img>` 赋 `src`；切换走 `Image` 预加载 + 12 秒超时 + token 取消，失败保留旧图
7. 萤火虫微光（新增 `fireflies.js`，默认关闭）：纯 CSS 呼吸与慢漂，不起 canvas / rAF / 定时器轮询；桌面 14 只、≤600px 8 只，待在底部 44vh、负层级在正文卡片之后，暂停靠 `data-paused`
8. 雪花重写（新增 `snow.js`）：删掉 `effects.js` 里的 canvas 圆点循环，改用两张预渲染雪片图按大小 / 透明度 / 速度分层下落，dt 上限 50ms、epoch 防过期回调；只有真落到底部才抬高宽度有界的高度图，最高厚度随视口 14–30px，深色 / 后台 / 手机 / 减少动态都暂停

<!-- endtimeline -->

<!-- timeline 2026-10-11 -->

1. 导航条改版（新增 `source/css/navigation.css`）：桌面工具区 44×44px 触控区、间距 8px、两侧留白 24px；≤800px 改 4px / 12px，≤480px 站名 20px；站名容器不再裁掉主题的霓虹光晕，只有 ≤360px 才退回省略号
2. 导航磨砂按能力降级：稳定态默认关 `backdrop-filter`、只留 alpha 0.96 的底色，仅在 ≥1200px + 精细指针 + 支持 `hover:hover` 时开 6px 轻磨砂 —— 滚动时不再为合成层买单
3. 按钮 hover 对齐：首页与「回到顶部」的伪元素宽度改成跟随链接 100%、高度收紧 40px，图标用 flex 居中（原来继承整块尺寸加固定 `line-height`，视觉总偏上）
4. 搜索模块四修（`search-lazy.js`）：「正在加载搜索…」提示改成脚本自持节点、插在命中容器之前（旧写法把提示写进容器并用属性记插没插过，容器被 instantsearch 换掉后属性还在、清理分支进不去）；`onerror` 不再被当成功吞掉，库就绪后 300ms 检查搜索框、缺失就回退
5. 目录连点互相打架 → `scroll-gap-fix.js` 升到 v4：加世代号 `seq`，让过期的滚动校正链立刻退出（v3 每次点击各起一条最多 3 轮的链、互不知情，轮流把页面拉回自己那边）
6. 夜间切换改成三拍小剧场（`shell.js`，默认「标准」档）：日落 / 日出 450ms + 暮色与第一批星 450ms + 星夜铺满 600ms + 从点击位置圆形揭幕 350ms，原来 3000ms 的整屏遮挡压到约 900ms；面板给四档（关闭 / 轻 / 标准 / 华丽）
7. 修夜间遮罩残留：连续点击时遮罩改由本次切换自持（不再用「取第一个 `.Cuteen_DarkSky`」的写法），第二次点击先清掉遮罩再瞬时切换；夜间壁纸用 `requestIdleCallback` 空闲预热
8. 数字框被主题限宽 50px：用 `:is(...)` 提特异性 + `max-width:none` + `min-width / flex: 0 0 76px`，三位数不再裁切；透明度数字并进同一套规则（实测输入框 76×44 CSS px，桌面与 390×844 一致）
9. 帧率状态条四轮打磨：紧凑状态条（桌面高 30px / 手机 28px、左下 12px + 安全区）+ `data-state` 着色，小字对比度从 3.21 提到 4.91；随后按反馈回退配色，再把「琥珀」与「红」的 Lab ΔE 从 43.2 拉到 63.5，两档一眼能分
10. 主题色前景统一：新增 `themeOnColorInk()`，按 WCAG 相对亮度算 `--on-theme` / `--on-theme-away`，按钮、选中项、目录当前项与 `::selection` 都改读它
11. 点击涟漪（新增 `ripple.js`，第 4 个互动挂件、默认关闭）：按下那刻才建 1 个爆发节点 + 两圈同心水纹，700ms 后连节点回收、同时最多 6 枚；关闭时连 `pointerdown` 监听都不挂
12. 回归脚本从 5 个加到 13 个：新增 `beauty-switches` / `theme-color` / `appearance-fonts` / `appearance-backgrounds` / `fireflies` / `snow` / `ripple` / `navigation`，`fomal.js` 的模块地图同步补上 `ripple.js`

13. 主题版本升到 v1.0.4：根 README 顶部标题与徽章、`package.json`、`package-lock.json` 根 version，连同 `themes/fomalhaut/` 下的 `package.json` / `README` / `welcome.js` / `footer.pug` 一起从 1.0.3 提到 1.0.4；README 更新日志补 v1.0.4 一节，文件地图补 `navigation.css` 与 `appearance-fonts` / `appearance-backgrounds` / `fireflies` / `snow` / `ripple` 五个模块，回归脚本从 5 个加到 13 个

<!-- endtimeline -->

<!-- timeline 2026-10-18 -->

1. 全站日夜首屏预置（新增 `source/js/inject/daynight-boot.js`）：访客没手动选过深浅色时，按当天真实日出日落定模式；坐标四级兜底（站点配置 → 位置服务 → 上次日历定位 → 按时区推经度），极昼极夜不切
2. 日夜判断收成一份共享实现：侧栏日历与美化面板的 `isDayNow` / `setMode` / `applyDayNight` 改为一律优先委托 `window.fomalDayNight`，取不到才用自带实现兜底；修「夜间点『随便逛逛』整页跳转后闪回白天」
3. 手动选择优先（带过期清理），「8 小时自动切换」听站点总开关 `window.fomalNightConfig.enabled`；顺手修掉切回白天时 `body` 误用 `classList.add('DarkMode')` 的老 bug
4. 首页卡片入场动画从 `animate__zoomIn` / 2s / 延迟 200ms / offset 30 改成 `animate__fadeIn` / 700ms / 无延迟 / offset 0，并删掉两组被注释掉的重复配置
5. 修 pjax 换页后入场动画哑火（新增 `scripts/wow-pjax-rehook.js`）：`pjax:complete` 后重放 `.js-pjax` 里失效的加类脚本，补 `wow.doSync(document.body)` 并清掉失效 boxes
6. 归档页年份胶囊居中改用 `track.scrollBy`（不再把整页顶下 61px、顶栏跟着抖）并新增 `--ar-bar-h`；`#page-header` 监听 `nav-fixed`、pjax 往返复用（`archive-page.js` / `archive-page.css`）
7. 评论区楼中楼表情面板被后一条评论压住点不动：`.twikoo .tk-comment:has(.OwO-open)` 提到 `z-index: 3`（`twikoo.css`）

<!-- endtimeline -->

<!-- timeline 2026-10 -->

1. 全站图片与字体外链改走公共 CDN（jsDelivr），不再依赖作者自建对象存储
2. 主题整理为 v1.0.0 并开源：站点配置与主题代码彻底分离，克隆即可搭建自己的站点

<!-- endtimeline -->

{% endtimeline %}

{% note info flat %}
这一页是「时间线插件」的示例：正文用 `{% raw %}{% timeline 标题 %}{% endraw %}` 包起来，每段用 `<!-- timeline 日期 -->` 与 `<!-- endtimeline -->` 括住即可。改内容不用碰主题源码。
{% endnote %}
