var c = Object.defineProperty;
var u = (e, t, r) => t in e ? c(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r;
var o = (e, t, r) => u(e, typeof t != "symbol" ? t + "" : t, r);
import { M as n } from "./chunks/MascotEngine-BegMTn5U.js";
import { A as M, B as _ } from "./chunks/MascotEngine-BegMTn5U.js";
const f = "/mascot_pack";
function l(e) {
  if (e)
    try {
      const t = new URL(e);
      return t.protocol !== "http:" && t.protocol !== "https:" && t.protocol !== "file:" ? void 0 : new URL("./", t).href;
    } catch {
      return;
    }
}
function g(e) {
  const t = l(e);
  return t ? `${t}mascot_pack` : f;
}
const m = g(import.meta.url);
n.configure({ packBaseUrl: m });
let a = !1;
function w(e) {
  a = !0, (e.assets || e.animationConfigUrl || e.ignoreBuiltin !== void 0) && n.configure({
    packBaseUrl: e.assets,
    animationConfigUrl: e.animationConfigUrl,
    ignoreBuiltin: e.ignoreBuiltin
  }), e.runtime && n.setRuntimeOptions(e.runtime);
}
function U() {
  return a;
}
function p() {
  return n.getPackBaseUrl();
}
function y() {
  return n.getRuntimeOptions();
}
class d {
  /** Use `createMascot()` instead of constructing this directly. */
  constructor(t) {
    /** The engine instance, exposed for the browser console and for hosts that
     *  need the simulation state (`snapshot()`, `position()`). */
    o(this, "engine");
    o(this, "destroyed", !1);
    this.engine = t;
  }
  /** Stable identity, also used to name this mascot's log file in dev builds. */
  get label() {
    return this.engine.label;
  }
  /** Remove the mascot from the page. Safe to call more than once. */
  destroy() {
    this.destroyed || (this.destroyed = !0, this.engine.destroy());
  }
}
async function k(e) {
  const { container: t, pack: r } = e;
  if (!t) throw new Error("[web-mascot] createMascot() needs a container element");
  if (!r) throw new Error("[web-mascot] createMascot() needs a pack name");
  const i = new n(t, r);
  try {
    await i.init();
  } catch (s) {
    throw i.destroy(), s;
  }
  return new d(i);
}
export {
  M as AnimationConfig,
  _ as BroadcastManager,
  f as DEFAULT_PACK_BASE_URL,
  d as Mascot,
  n as MascotEngine,
  m as PACK_BASE_URL,
  p as assetBaseUrl,
  w as configure,
  k as createMascot,
  U as isConfigured,
  l as resolveAssetBase,
  y as runtimeOptions
};
//# sourceMappingURL=index.js.map
