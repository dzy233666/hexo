var $t = Object.defineProperty;
var Rt = (n, t, e) => t in n ? $t(n, t, { enumerable: !0, configurable: !0, writable: !0, value: e }) : n[t] = e;
var c = (n, t, e) => Rt(n, typeof t != "symbol" ? t + "" : t, e);
class Dt {
  /**
   * @param packBaseUrl Already-resolved base URL of the pack directory, without a
   *   trailing slash (e.g. `https://cdn.example.com/mascots/Neuron`). The caller
   *   owns URL resolution, so an embedded or hosted build never depends on the
   *   page's root path.
   */
  static async loadConfig(t, e) {
    const i = e.replace(/\/+$/, ""), [s, r] = await Promise.all([
      fetch(`${i}/actions.xml`),
      fetch(`${i}/behaviors.xml`)
    ]);
    if (!s.ok || !r.ok)
      throw new Error(`加载配置失败: ${t}.`);
    const o = await s.text(), a = await r.text();
    if (o.trim().toLowerCase().startsWith("<!doctype html>") || a.trim().toLowerCase().startsWith("<!doctype html>"))
      throw new Error(
        `[XMLParser] 加载 ${t} 的 actions.xml 失败：Vite 返回了 HTML fallback。`
      );
    const l = o.replace(/xmlns=".*?"/g, ""), f = a.replace(/xmlns=".*?"/g, ""), d = new DOMParser(), p = d.parseFromString(l, "text/xml"), v = d.parseFromString(f, "text/xml");
    if (p.getElementsByTagName("parsererror").length > 0)
      throw new Error(`配置 XML 无法解析: ${t}/actions.xml。`);
    if (v.getElementsByTagName("parsererror").length > 0)
      throw new Error(`配置 XML 无法解析: ${t}/behaviors.xml。`);
    return {
      actions: this.parseActions(p),
      behaviors: this.parseBehaviors(v)
    };
  }
  static getTag(t, e) {
    const i = t.getElementsByTagNameNS("*", e);
    return i && i.length > 0 ? Array.from(i) : Array.from(t.getElementsByTagName(e));
  }
  static parseActions(t) {
    const e = {}, i = this.getTag(t, "ActionList");
    for (const s of i)
      for (let r = 0; r < s.children.length; r++) {
        const o = s.children[r], a = o.localName || o.tagName;
        if (a === "Action" || a.endsWith(":Action")) {
          const l = this.parseActionNode(o);
          l.name && (e[l.name] = l);
        }
      }
    return e;
  }
  static parseActionNode(t) {
    var r;
    const e = t.localName || t.tagName;
    if (e === "ActionReference" || e.endsWith(":ActionReference")) {
      const o = {};
      for (let a = 0; a < t.attributes.length; a++) {
        const l = t.attributes.item(a);
        l && (o[l.name] = l.value);
      }
      return {
        type: "ActionReference",
        referenceName: t.getAttribute("Name") || "",
        condition: t.getAttribute("Condition") || void 0,
        duration: t.getAttribute("Duration") || void 0,
        initialVX: t.getAttribute("InitialVX") || void 0,
        initialVY: t.getAttribute("InitialVY") || void 0,
        attributes: o
      };
    }
    const i = t.getAttribute("Type") || "Stay", s = {
      name: t.getAttribute("Name") || void 0,
      type: i,
      className: t.getAttribute("Class") || void 0,
      borderType: t.getAttribute("BorderType") || void 0,
      condition: t.getAttribute("Condition") || void 0,
      // libshijima's sequence reads "Loops"; the shipped packs write "Loop".
      loop: t.getAttribute("Loops") === "true" || t.getAttribute("Loop") === "true",
      // Embedded 物理参数
      initialVX: t.getAttribute("InitialVX") || void 0,
      initialVY: t.getAttribute("InitialVY") || void 0,
      attributes: this.readAttributes(t)
    };
    if (i === "Sequence" || i === "Select") {
      s.children = [];
      for (let o = 0; o < t.children.length; o++) {
        const a = t.children[o], l = a.localName || a.tagName;
        (l === "Action" || l === "ActionReference" || l.endsWith("Action") || l.endsWith("ActionReference")) && s.children.push(this.parseActionNode(a));
      }
    } else {
      const o = Array.from(t.children).filter(
        (a) => (a.localName || a.tagName) === "Animation"
      );
      s.animations = o.map((a) => ({
        condition: a.getAttribute("Condition") || void 0,
        poses: this.parsePoses(a),
        hotspots: this.parseHotspots(a)
      })), s.poses = ((r = s.animations[0]) == null ? void 0 : r.poses) || [];
    }
    return s;
  }
  static readAttributes(t) {
    const e = {};
    for (let i = 0; i < t.attributes.length; i++) {
      const s = t.attributes.item(i);
      s && (e[s.name] = s.value);
    }
    return e;
  }
  static parsePoses(t) {
    const e = [], i = this.getTag(t, "Pose");
    for (let s = 0; s < i.length; s++) {
      const r = i[s], o = (r.getAttribute("ImageAnchor") || "0,0").split(","), a = (r.getAttribute("Velocity") || "0,0").split(","), l = Number(o[0]), f = Number(o[1]), d = Number(a[0]), p = Number(a[1]), v = Number(r.getAttribute("Duration") || "1");
      [l, f, d, p, v].every(Number.isFinite) && e.push({
        image: r.getAttribute("Image") || "",
        imageAnchor: { x: l, y: f },
        velocity: { x: d, y: p },
        duration: Math.max(1, Math.round(v))
      });
    }
    return e;
  }
  /** `<Hotspot Shape Origin Size Behavior>` children of an animation. libshijima's
   *  parser warns and drops a hotspot with an unknown shape or no behaviour, so the
   *  same entries are skipped here rather than guessed at. */
  static parseHotspots(t) {
    const e = [], i = this.getTag(t, "Hotspot");
    for (let s = 0; s < i.length; s++) {
      const r = i[s], o = (r.getAttribute("Shape") || "").trim();
      if (o !== "Ellipse" && o !== "Rectangle") continue;
      const a = (r.getAttribute("Behavior") || "").trim();
      if (!a) continue;
      const l = (r.getAttribute("Origin") || "").split(","), f = (r.getAttribute("Size") || "").split(","), d = parseFloat(l[0]), p = parseFloat(l[1]), v = parseFloat(f[0]), y = parseFloat(f[1]);
      ![d, p, v, y].every((u) => Number.isFinite(u)) || v <= 0 || y <= 0 || e.push({
        shape: o,
        origin: { x: d, y: p },
        size: { x: v, y },
        behavior: a
      });
    }
    return e.length > 0 ? e : void 0;
  }
  static parseBehaviors(t) {
    const e = [], i = this.getTag(t, "Behavior");
    for (let s = 0; s < i.length; s++) {
      const r = i[s], o = r.getAttribute("Name");
      if (!o) continue;
      const a = Number(r.getAttribute("Frequency") || "0"), l = Number.isFinite(a) ? Math.max(0, a) : 0, f = r.getAttribute("Hidden") === "true";
      let d;
      const p = r.parentNode;
      p && (p.localName === "Condition" || p.tagName === "Condition") && (d = p.getAttribute("Condition") || void 0);
      const v = [];
      let y = !0;
      const u = this.getTag(r, "NextBehaviorList")[0];
      if (u) {
        y = u.getAttribute("Add") !== "false";
        const g = this.getTag(u, "BehaviorReference");
        for (let m = 0; m < g.length; m++) {
          const x = Number(g[m].getAttribute("Frequency") || "0");
          v.push({
            name: g[m].getAttribute("Name") || "",
            frequency: Number.isFinite(x) ? Math.max(0, x) : 0,
            condition: g[m].getAttribute("Condition") || void 0
          });
        }
      }
      e.push({ name: o, id: s, frequency: l, hidden: f, condition: d, nextBehaviors: v, addNext: y });
    }
    for (const s of e)
      for (const r of s.nextBehaviors) {
        const o = e.find(
          (a) => a.name === r.name && a.frequency === r.frequency
        );
        o && (r.id = o.id);
      }
    return e;
  }
}
const Et = {
  // Several mascots must not spawn on top of each other: 180 px is comfortably
  // more than the packs' 128 px sprite, so the offsets never overlap.
  spawn: { topOffset: 100, staggerPx: 180 },
  // 200 ticks = 8 s. Long enough to look calm, short enough that a visitor
  // notices the mascot is alive.
  forcedSwitchTicks: 200,
  // ...but the sit-and-dangle sequence is a long *stationary* animation, and the
  // pacer keys off movement rather than behaviour, so without the exemption it is
  // cut off mid-way and never plays through. The pool exit is its partner: the
  // packs chain SitAndFaceMouse with `Add="false"` into a closed loop, so a
  // mascot that sits down would otherwise never leave it again.
  pacerExemptBehaviors: ["SitWhileDanglingLegs"],
  exitToPoolBehaviors: ["SitWhileDanglingLegs"],
  // The pacer only acts on a stationary mascot; this is the cap for everything
  // else. It sits above the dangle sequence so that one still finishes.
  maxBehaviorTicks: 1100,
  // Both packs ship SitWhileDanglingLegs at 50, and it is the most characterful
  // thing they do, so it is worth raising. SitAndFaceMouse is lowered because it
  // is the entry to the closed chain above.
  behaviorWeights: {
    SitWhileDanglingLegs: 150,
    SitAndFaceMouse: 8
  }
}, Lt = 40, Xt = 0.05, Ft = 20, Wt = 0.2, Yt = 4, zt = 3e3, et = 1e6, Ut = 1e5;
function C(n) {
  return typeof n == "object" && n !== null && !Array.isArray(n);
}
function N(n) {
  if (typeof n == "number" && Number.isFinite(n)) return n;
  if (typeof n == "string" && n.trim() !== "" && Number.isFinite(Number(n))) return Number(n);
}
function X(n) {
  if (!Array.isArray(n)) return;
  const t = n.filter((e) => typeof e == "string").map((e) => e.trim()).filter((e) => e.length > 0);
  return t.length > 0 || n.length === 0 ? t : void 0;
}
function P(n, t) {
  const e = N(n);
  if (e !== void 0)
    return Math.round(Math.min(et, Math.max(t, e)));
}
function V(n, t, e = Ut) {
  const i = N(n);
  if (i !== void 0)
    return Math.min(e, Math.max(t, i));
}
function E(n) {
  if (typeof n == "number" && Number.isFinite(n)) return n;
  if (typeof n == "string" && n.trim() !== "") return n.trim();
}
function Vt(n, t) {
  if (typeof n != "string") return;
  const e = n.trim().toLowerCase();
  return t.includes(e) ? e : void 0;
}
function Ht(n) {
  if (!C(n)) return;
  const t = {};
  for (const [e, i] of Object.entries(n)) {
    const s = e.trim(), r = N(i);
    !s || r === void 0 || r < 0 || (t[s] = Math.min(et, r));
  }
  return Object.keys(t).length > 0 ? t : void 0;
}
function jt(n) {
  if (!C(n)) return;
  const t = {};
  for (const [e, i] of Object.entries(n)) {
    const s = e.trim();
    if (s)
      if (Array.isArray(i)) {
        let r = P(i[0], 1), o = P(i[1], 1);
        if (r === void 0) continue;
        o === void 0 && (o = r), o < r && ([r, o] = [o, r]), t[s] = r === o ? r : [r, o];
      } else {
        const r = P(i, 1);
        if (r === void 0) continue;
        t[s] = r;
      }
  }
  return Object.keys(t).length > 0 ? t : void 0;
}
function qt(n) {
  if (!C(n)) return;
  const t = {}, e = E(n.left);
  e !== void 0 && (t.left = e);
  const i = E(n.right);
  i !== void 0 && (t.right = i);
  const s = E(n.top);
  s !== void 0 && (t.top = s);
  const r = E(n.bottom);
  return r !== void 0 && (t.bottom = r), Object.keys(t).length > 0 ? t : void 0;
}
function K(n) {
  const t = N(n);
  if (!(t === void 0 || t < 0))
    return Math.min(et, t);
}
function Gt(n) {
  if (!C(n)) return;
  const t = {}, e = K(n.alone);
  e !== void 0 && (t.alone = e);
  const i = K(n.withPartner);
  i !== void 0 && (t.withPartner = i);
  const s = K(n.reachable);
  return s !== void 0 && (t.reachable = s), Object.keys(t).length > 0 ? t : void 0;
}
function Jt(n) {
  if (!C(n)) return;
  const t = {}, e = Vt(n.vertical, ["top", "floor"]);
  e && (t.vertical = e);
  const i = E(n.x);
  i !== void 0 && (t.x = i);
  const s = V(n.staggerPx, 0);
  s !== void 0 && (t.staggerPx = s);
  const r = V(n.topOffset, 0);
  return r !== void 0 && (t.topOffset = r), Object.keys(t).length > 0 ? t : void 0;
}
function Y(n) {
  if (!C(n)) return {};
  const t = {}, e = X(n.allowBehaviors);
  e && (t.allowBehaviors = e);
  const i = X(n.denyBehaviors);
  i && (t.denyBehaviors = i);
  const s = Ht(n.behaviorWeights);
  s && (t.behaviorWeights = s);
  const r = jt(n.actionDurations);
  r && (t.actionDurations = r);
  const o = N(n.durationScale);
  o !== void 0 && (t.durationScale = Math.min(Ft, Math.max(Xt, o)));
  const a = N(n.scale);
  a !== void 0 && (t.scale = Math.min(Yt, Math.max(Wt, a)));
  const l = P(n.forcedSwitchTicks, 0);
  l !== void 0 && (t.forcedSwitchTicks = l);
  const f = X(n.pacerExemptBehaviors);
  f && (t.pacerExemptBehaviors = f);
  const d = X(n.exitToPoolBehaviors);
  d && (t.exitToPoolBehaviors = d);
  const p = P(n.interactionCooldownTicks, 0);
  p !== void 0 && (t.interactionCooldownTicks = Math.min(zt, p));
  const v = P(n.maxBehaviorTicks, 0);
  v !== void 0 && (t.maxBehaviorTicks = v);
  const y = V(n.maxTravelPx, 0);
  y !== void 0 && (t.maxTravelPx = y);
  const u = Gt(n.partnerWeights);
  u && (t.partnerWeights = u);
  const g = V(n.scanDistancePx, 16, 4096);
  g !== void 0 && (t.scanDistancePx = g);
  const m = qt(n.zone);
  m && (t.zone = m);
  const x = Jt(n.spawn);
  return x && (t.spawn = x), t;
}
function Z(n, t) {
  return {
    allowBehaviors: t.allowBehaviors ?? n.allowBehaviors,
    denyBehaviors: t.denyBehaviors ?? n.denyBehaviors,
    behaviorWeights: { ...n.behaviorWeights, ...t.behaviorWeights },
    actionDurations: { ...n.actionDurations, ...t.actionDurations },
    durationScale: t.durationScale ?? n.durationScale,
    scale: t.scale ?? n.scale,
    forcedSwitchTicks: t.forcedSwitchTicks ?? n.forcedSwitchTicks,
    pacerExemptBehaviors: t.pacerExemptBehaviors ?? n.pacerExemptBehaviors,
    exitToPoolBehaviors: t.exitToPoolBehaviors ?? n.exitToPoolBehaviors,
    interactionCooldownTicks: t.interactionCooldownTicks ?? n.interactionCooldownTicks,
    maxBehaviorTicks: t.maxBehaviorTicks ?? n.maxBehaviorTicks,
    maxTravelPx: t.maxTravelPx ?? n.maxTravelPx,
    partnerWeights: { ...n.partnerWeights, ...t.partnerWeights },
    scanDistancePx: t.scanDistancePx ?? n.scanDistancePx,
    zone: { ...n.zone, ...t.zone },
    spawn: { ...n.spawn, ...t.spawn }
  };
}
function ot(n) {
  return n.allowBehaviors !== void 0 || n.denyBehaviors !== void 0 || n.behaviorWeights !== void 0 && Object.keys(n.behaviorWeights).length > 0 || n.actionDurations !== void 0 && Object.keys(n.actionDurations).length > 0 || n.durationScale !== void 0 || n.scale !== void 0 || n.forcedSwitchTicks !== void 0 || n.pacerExemptBehaviors !== void 0 && n.pacerExemptBehaviors.length > 0 || n.exitToPoolBehaviors !== void 0 && n.exitToPoolBehaviors.length > 0 || n.interactionCooldownTicks !== void 0 || n.maxBehaviorTicks !== void 0 || n.maxTravelPx !== void 0 || n.partnerWeights !== void 0 && Object.keys(n.partnerWeights).length > 0 || n.scanDistancePx !== void 0 || n.zone !== void 0 && Object.keys(n.zone).length > 0 || n.spawn !== void 0 && Object.keys(n.spawn).length > 0;
}
const Kt = Y(Et);
class F {
  constructor(t, e = "(built-in defaults)") {
    c(this, "defaults", {});
    c(this, "perMascot", /* @__PURE__ */ new Map());
    c(this, "reduced", {});
    c(this, "reducedActive", !1);
    c(this, "respectReduced", !0);
    c(this, "respectBuiltin", !0);
    c(this, "resolved", /* @__PURE__ */ new Map());
    /** Where the settings came from, for logs and diagnostics. */
    c(this, "source");
    this.source = e, this.apply(t);
  }
  /** Replace the settings. Invalid input leaves the config empty (= pack default). */
  apply(t) {
    if (this.defaults = {}, this.perMascot = /* @__PURE__ */ new Map(), this.reduced = {}, this.respectReduced = !0, this.respectBuiltin = !0, this.resolved = /* @__PURE__ */ new Map(), !C(t)) return;
    this.respectBuiltin = t.ignoreBuiltin !== !0, this.defaults = Y(t.defaults), this.reduced = Y(t.reducedMotion), this.respectReduced = t.respectReducedMotion !== !1;
    const e = t.mascots;
    if (C(e))
      for (const [i, s] of Object.entries(e)) {
        const r = i.trim();
        r && this.perMascot.set(r, Y(s));
      }
    this.refreshReducedMotion();
  }
  /** Called by the engine when the OS preference changes. */
  setReducedMotion(t) {
    this.reducedActive !== t && (this.reducedActive = t, this.resolved.clear());
  }
  /** Re-read the OS preference (used at load time and on change). */
  refreshReducedMotion() {
    let t = !1;
    if (this.respectReduced && typeof window < "u" && typeof window.matchMedia == "function")
      try {
        t = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch {
        t = !1;
      }
    return this.setReducedMotion(t), t;
  }
  get reducedMotionActive() {
    return this.reducedActive;
  }
  /** True when this configuration cannot affect anything: the built-in preset is
   *  off and the host supplied nothing of its own. */
  get isEmpty() {
    return !this.respectBuiltin && !ot(this.defaults) && this.perMascot.size === 0 && !ot(this.reduced);
  }
  /** Effective options: built-in (if not ignored), then file defaults, then reduced-motion block, then mascot overrides. */
  optionsFor(t) {
    const e = this.resolved.get(t);
    if (e) return D(e);
    let i = this.respectBuiltin ? Kt : {}, s = Z(i, this.defaults);
    return s = Z(s, this.reducedActive ? this.reduced : {}), s = Z(s, this.perMascot.get(t) ?? {}), this.resolved.set(t, s), D(s);
  }
  /** Whether a behaviour may be selected for this mascot. */
  allows(t, e) {
    var s;
    const i = this.optionsFor(t);
    return !((s = i.denyBehaviors) != null && s.includes(e) || i.allowBehaviors && i.allowBehaviors.length > 0 && !i.allowBehaviors.includes(e));
  }
  /** Explicitly forbidden. Unlike `allows()`, this ignores `allowBehaviors`, which
   *  only restricts random selection — a visitor-triggered hotspot is deliberate. */
  denies(t, e) {
    var i;
    return ((i = this.optionsFor(t).denyBehaviors) == null ? void 0 : i.includes(e)) ?? !1;
  }
  /** Weight override for a behaviour, or undefined to keep the pack's Frequency. */
  weightOverride(t, e) {
    var i;
    return (i = this.optionsFor(t).behaviorWeights) == null ? void 0 : i[e];
  }
  /** Effective selection weight, falling back to the pack's Frequency. */
  weight(t, e, i) {
    return this.weightOverride(t, e) ?? i;
  }
  scale(t) {
    return this.optionsFor(t).durationScale ?? 1;
  }
  /** Linear size multiplier for the drawn mascot (virtual unit = one sprite px). */
  mascotScale(t) {
    return this.optionsFor(t).scale ?? 1;
  }
  forcedSwitchTicks(t) {
    return this.optionsFor(t).forcedSwitchTicks ?? 0;
  }
  /** May the pacer interrupt this behaviour? False only for the exempted ones, so a
   *  long stationary animation can finish while a plain idle `Stay` is still nudged. */
  pacerApplies(t, e) {
    var i;
    return e ? !(((i = this.optionsFor(t).pacerExemptBehaviors) == null ? void 0 : i.includes(e)) ?? !1) : !0;
  }
  /** Does this behaviour re-enter the global pool when it ends, bypassing the pack's
   *  `<NextBehaviorList>`? Needed for the packs' closed chains (see the option docs). */
  exitsToPool(t, e) {
    var i;
    return e ? ((i = this.optionsFor(t).exitToPoolBehaviors) == null ? void 0 : i.includes(e)) ?? !1 : !1;
  }
  /** Ticks during which partner behaviours stay out of the pool after an interaction. */
  interactionCooldown(t) {
    return this.optionsFor(t).interactionCooldownTicks ?? 0;
  }
  maxBehaviorTicks(t) {
    return this.optionsFor(t).maxBehaviorTicks ?? 0;
  }
  maxTravelPx(t) {
    return this.optionsFor(t).maxTravelPx ?? 0;
  }
  /** Weight to use for a partner behaviour, or null to keep the pack's Frequency.
   *  `reachable` is the "another mascot is right here and level with me" case. */
  partnerWeight(t, e, i = !1) {
    const s = this.optionsFor(t).partnerWeights;
    if (!s) return null;
    if (i && s.reachable !== void 0) return s.reachable;
    const r = e ? s.withPartner : s.alone;
    return r === void 0 ? null : r;
  }
  /** How far this mascot scans for a partner advertisement. */
  scanDistancePx(t) {
    return this.optionsFor(t).scanDistancePx ?? 256;
  }
  zone(t) {
    return this.optionsFor(t).zone ?? {};
  }
  spawn(t) {
    return this.optionsFor(t).spawn ?? {};
  }
  /**
   * A hold duration in ticks for an action, picked once from its `[min,max]`
   * range, or null when the action is not configured. The caller must call this
   * once per action instance: calling it per tick would re-roll the range.
   */
  durationTicks(t, e) {
    var o;
    if (!e) return null;
    const i = (o = this.optionsFor(t).actionDurations) == null ? void 0 : o[e];
    if (i === void 0) return null;
    if (typeof i == "number") return i;
    const [s, r] = i;
    return r <= s ? s : s + Math.round(Math.random() * (r - s));
  }
  /** True when this action has an explicit duration override. */
  hasDurationOverride(t, e) {
    var i;
    return e ? ((i = this.optionsFor(t).actionDurations) == null ? void 0 : i[e]) !== void 0 : !1;
  }
  /** Round-trip view of the raw file shape, for a settings UI. */
  toJSON() {
    const t = {};
    for (const [i, s] of this.perMascot) t[i] = D(s);
    const e = {
      version: 1,
      defaults: D(this.defaults),
      mascots: t,
      reducedMotion: D(this.reduced),
      respectReducedMotion: this.respectReduced
    };
    return this.respectBuiltin || (e.ignoreBuiltin = !0), e;
  }
  /** One-line summary written into the observation log with every spawn. */
  describe(t) {
    const e = this.optionsFor(t);
    return [
      `source=${this.source}${this.respectBuiltin ? " +builtin" : " no-builtin"}`,
      `durationScale=${e.durationScale ?? 1}`,
      `scale=${e.scale ?? 1}`,
      `cap=${e.maxBehaviorTicks ?? 0}`,
      `pacer=${e.forcedSwitchTicks ?? 0}`,
      `cooldown=${e.interactionCooldownTicks ?? 0}`,
      `travel=${e.maxTravelPx ?? 0}`,
      `partner=${e.partnerWeights ? `${e.partnerWeights.alone ?? "-"}/${e.partnerWeights.withPartner ?? "-"}/${e.partnerWeights.reachable ?? "-"}` : "pack"}`,
      `scan=${e.scanDistancePx ?? 256}`,
      `allow=${e.allowBehaviors ? e.allowBehaviors.length : "all"}`,
      `deny=${e.denyBehaviors ? e.denyBehaviors.length : 0}`,
      `weights=${e.behaviorWeights ? Object.keys(e.behaviorWeights).length : 0}`,
      `durations=${e.actionDurations ? Object.keys(e.actionDurations).length : 0}`,
      `zone=${e.zone && Object.keys(e.zone).length ? JSON.stringify(e.zone) : "full"}`,
      `spawn=${e.spawn && Object.keys(e.spawn).length ? JSON.stringify(e.spawn) : "default"}`,
      `reduced=${this.reducedActive ? "on" : "off"}`
    ].join(" ");
  }
  /** Human-readable list of the effective settings, for logs. */
  details(t) {
    var r, o;
    const e = this.optionsFor(t), i = [], s = (a) => `${(a * Lt / 1e3).toFixed(1)}s`;
    return e.allowBehaviors && i.push(`allowBehaviors: ${e.allowBehaviors.join(", ")}`), e.denyBehaviors && i.push(`denyBehaviors: ${e.denyBehaviors.join(", ")}`), e.behaviorWeights && Object.keys(e.behaviorWeights).length > 0 && i.push(
      `behaviorWeights: ${Object.entries(e.behaviorWeights).map(([a, l]) => `${a}=${l}`).join(", ")}`
    ), e.actionDurations && Object.keys(e.actionDurations).length > 0 && i.push(
      `actionDurations: ${Object.entries(e.actionDurations).map(([a, l]) => `${a}=${Array.isArray(l) ? `[${l[0]},${l[1]}]` : l}ticks`).join(", ")}`
    ), e.durationScale !== void 0 && i.push(`durationScale: ${e.durationScale}`), e.scale !== void 0 && i.push(`scale: ${e.scale}x (1 virtual unit = 1 sprite px, drawn ${e.scale}x)`), e.interactionCooldownTicks && i.push(
      `interactionCooldownTicks: ${e.interactionCooldownTicks} (${s(e.interactionCooldownTicks)})`
    ), e.forcedSwitchTicks && i.push(`forcedSwitchTicks: ${e.forcedSwitchTicks} (${s(e.forcedSwitchTicks)})`), (r = e.pacerExemptBehaviors) != null && r.length && i.push(`pacerExemptBehaviors: ${e.pacerExemptBehaviors.join(", ")}`), (o = e.exitToPoolBehaviors) != null && o.length && i.push(`exitToPoolBehaviors: ${e.exitToPoolBehaviors.join(", ")}`), e.maxBehaviorTicks && i.push(`maxBehaviorTicks: ${e.maxBehaviorTicks} (${s(e.maxBehaviorTicks)})`), e.maxTravelPx && i.push(`maxTravelPx: ${e.maxTravelPx}px`), e.partnerWeights && Object.keys(e.partnerWeights).length > 0 && i.push(
      `partnerWeights: alone=${e.partnerWeights.alone ?? "pack"} withPartner=${e.partnerWeights.withPartner ?? "pack"} reachable=${e.partnerWeights.reachable ?? "pack"}`
    ), e.zone && Object.keys(e.zone).length > 0 && i.push(`zone: ${JSON.stringify(e.zone)}`), e.spawn && Object.keys(e.spawn).length > 0 && i.push(`spawn: ${JSON.stringify(e.spawn)}`), this.reducedActive && i.push("reducedMotion: active (OS preference)"), i;
  }
}
function D(n) {
  return {
    ...n,
    allowBehaviors: n.allowBehaviors ? [...n.allowBehaviors] : void 0,
    denyBehaviors: n.denyBehaviors ? [...n.denyBehaviors] : void 0,
    pacerExemptBehaviors: n.pacerExemptBehaviors ? [...n.pacerExemptBehaviors] : void 0,
    exitToPoolBehaviors: n.exitToPoolBehaviors ? [...n.exitToPoolBehaviors] : void 0,
    behaviorWeights: n.behaviorWeights ? { ...n.behaviorWeights } : void 0,
    actionDurations: n.actionDurations ? Object.fromEntries(Object.entries(n.actionDurations).map(([t, e]) => [t, Array.isArray(e) ? [...e] : e])) : void 0,
    partnerWeights: n.partnerWeights ? { ...n.partnerWeights } : void 0,
    zone: n.zone ? { ...n.zone } : void 0,
    spawn: n.spawn ? { ...n.spawn } : void 0
  };
}
class Zt {
  constructor(t) {
    c(this, "anchor");
    c(this, "clientBehavior", "");
    c(this, "serverBehavior", "");
    c(this, "finalized", !1);
    c(this, "available", !0);
    c(this, "metUp", !1);
    c(this, "shared", null);
    this.anchor = { ...t };
  }
  get active() {
    return !this.finalized;
  }
  get isAvailable() {
    return this.active && this.available;
  }
  /**
   * A scanner has claimed this advertisement and is on its way. libshijima has no
   * such state: the advertising animation ends when it wants to, the claim is
   * finalized with it, and the approaching scanner is dropped on its next tick.
   * The owner of the advertisement needs to be able to see the claim so it can
   * hold its pose until the partner arrives (see BroadcastManager).
   */
  get isClaimed() {
    return this.active && !this.available && !this.metUp;
  }
  get didMeetUp() {
    return this.metUp;
  }
  /** Keep the advertised position in sync with the broadcasting mascot. */
  updateAnchor(t) {
    this.active && (this.anchor = { ...t });
  }
  notifyArrival() {
    this.metUp = !0, this.finalized = !0;
  }
  /** The action that advertised this affordance ended. */
  finalize() {
    this.finalized = !0;
  }
  setAvailable(t) {
    this.available = t;
  }
  interaction() {
    return this.shared || (this.shared = { value: !0 }), new it(this.shared, this.serverBehavior);
  }
  ongoingPoint() {
    return this.shared || (this.shared = { value: !0 }), this.shared;
  }
}
class it {
  constructor(t = null, e = "") {
    c(this, "started", !1);
    c(this, "shared");
    c(this, "name");
    this.shared = t, this.name = e;
  }
  get available() {
    return this.shared !== null;
  }
  get ongoing() {
    return this.shared !== null && this.shared.value;
  }
  get behavior() {
    return this.name;
  }
  /** Ends the interaction for both sides. */
  finalize() {
    this.shared && (this.shared.value = !1), this.shared = null, this.name = "", this.started = !1;
  }
}
class Qt {
  constructor(t = null) {
    c(this, "server");
    this.server = t;
  }
  get connected() {
    return this.server !== null && this.server.active;
  }
  get target() {
    return this.server ? this.server.anchor : null;
  }
  notifyArrival() {
    this.server && this.server.notifyArrival();
  }
  interaction() {
    return new it(this.server ? this.server.ongoingPoint() : null, this.server ? this.server.clientBehavior : "");
  }
  /** Dropping the link frees the broadcast for another scanner. */
  finalize() {
    this.server && this.server.setAvailable(!0), this.server = null;
  }
}
const J = class J {
  constructor() {
    c(this, "servers", /* @__PURE__ */ new Map());
  }
  /** Remove finalized advertisements that can no longer be reached. */
  prune() {
    for (const [t, e] of this.servers) {
      const i = e.filter((s) => s.active);
      i.length === 0 ? this.servers.delete(t) : i.length !== e.length && this.servers.set(t, i);
    }
  }
  startBroadcast(t, e) {
    const i = new Zt(e), s = this.servers.get(t);
    return s ? s.push(i) : this.servers.set(t, [i]), i;
  }
  tryConnect(t, e, i, s, r = J.MAX_SCAN_DISTANCE) {
    const o = this.servers.get(t);
    if (!o || o.length === 0) return null;
    const a = o.filter((d) => d.active);
    this.servers.set(t, a);
    let l = null, f = r;
    for (const d of a) {
      if (!d.isAvailable || Math.abs(e.y - d.anchor.y) > 1) continue;
      const p = Math.abs(e.x - d.anchor.x);
      p > r || (l === null || p < f) && (l = d, f = p);
    }
    return l ? (l.clientBehavior = i, l.serverBehavior = s, l.setAvailable(!1), new Qt(l)) : null;
  }
  /** Diagnostics for the observation log: what a scan would have seen. */
  probe(t, e) {
    const i = (this.servers.get(t) ?? []).filter((r) => r.active);
    let s = null;
    for (const r of i) {
      const o = Math.abs(e.x - r.anchor.x);
      (s === null || o < s) && (s = o);
    }
    return { live: i.length, nearest: s };
  }
  /** Live broadcasts per affordance name, for the observation log. */
  snapshot() {
    this.prune();
    const t = {};
    for (const [e, i] of this.servers) {
      const s = i.filter((r) => r.active).length;
      s > 0 && (t[e] = s);
    }
    return t;
  }
};
/** `broadcast/manager.cc`: ScanMove only claims a mascot that is already near. */
c(J, "MAX_SCAN_DISTANCE", 256);
let _ = J;
function _t(n, t) {
  const { x: e, y: i } = n.origin, { x: s, y: r } = n.size;
  if (s <= 0 || r <= 0) return !1;
  if (n.shape === "Ellipse") {
    const o = (t.x - (e + s / 2)) / s, a = (t.y - (i + r / 2)) / r;
    return o * o + a * a < 1;
  }
  return t.x >= e && t.x <= e + s && t.y >= i && t.y <= i + r;
}
function te(n, t) {
  if (!n) return null;
  let e = null;
  for (const i of n)
    _t(i, t) && (e = i);
  return e;
}
const ee = "neurolingsce-mascot-page-v1", H = "__neurolingsce_mascot_page_v1__:", pt = 1500, mt = pt * 3, M = typeof crypto < "u" && typeof crypto.randomUUID == "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`, z = /* @__PURE__ */ new Set(), k = /* @__PURE__ */ new Map();
let T = null, A = "none", vt = 0, at = 0, st = !1, j = !0, q = !1;
const ct = `${H}${M}`;
function yt(n) {
  if (!n) return null;
  try {
    const t = JSON.parse(n);
    if (!t || typeof t != "object") return null;
    const e = t;
    return typeof e.id != "string" || typeof e.visible != "boolean" || typeof e.focusedAt != "number" || typeof e.sentAt != "number" ? null : e;
  } catch {
    return null;
  }
}
function ht(n) {
  if (j !== n) {
    j = n;
    for (const t of z) t(n);
  }
}
function $() {
  var e;
  if (A === "none") {
    ht(!0);
    return;
  }
  const n = Date.now();
  for (const [i, s] of k)
    n - s.seenAt > mt && k.delete(i);
  const t = Array.from(k.values()).filter((i) => i.visible);
  t.sort((i, s) => s.focusedAt - i.focusedAt || i.id.localeCompare(s.id)), ht(((e = t[0]) == null ? void 0 : e.id) === M);
}
function rt(n, t = Date.now()) {
  if (n.id === M) return;
  const e = k.get(n.id);
  e && e.sentAt >= n.sentAt || (k.set(n.id, { ...n, seenAt: t }), $());
}
function ie(n) {
  n.type === "leave" ? (k.delete(n.id), $()) : rt(n.state);
}
function bt(n) {
  if (A === "broadcast")
    try {
      T == null || T.postMessage(n);
      return;
    } catch {
      A = "none";
    }
  else if (A === "storage")
    try {
      n.type === "leave" ? localStorage.removeItem(ct) : localStorage.setItem(ct, JSON.stringify(n.state));
      return;
    } catch {
      A = "none";
    }
  $();
}
function L() {
  const n = Date.now(), t = !st && document.visibilityState === "visible";
  t && document.hasFocus() && (at = n);
  const e = { id: M, visible: t, focusedAt: at, sentAt: n };
  k.set(M, { ...e, seenAt: n }), bt({ type: "state", state: e }), $();
}
function xt() {
  k.delete(M), bt({ type: "leave", id: M }), $();
}
function kt(n) {
  var i;
  if (!((i = n.key) != null && i.startsWith(H))) return;
  const t = n.key.slice(H.length);
  if (!n.newValue) {
    k.delete(t), $();
    return;
  }
  const e = yt(n.newValue);
  e && rt(e);
}
function wt() {
  L();
}
function St() {
  L();
}
function Tt() {
  st = !0, xt();
}
function At() {
  st = !1, L();
}
function se() {
  q = !0;
  try {
    T = new BroadcastChannel(ee), T.addEventListener("message", (n) => ie(n.data)), A = "broadcast";
  } catch {
    try {
      A = "storage", window.addEventListener("storage", kt);
      for (let n = 0; n < localStorage.length; n++) {
        const t = localStorage.key(n);
        if (!(t != null && t.startsWith(H))) continue;
        const e = yt(localStorage.getItem(t));
        e && Date.now() - e.sentAt <= mt && rt(e, e.sentAt);
      }
    } catch {
      A = "none";
    }
  }
  window.addEventListener("focus", wt), document.addEventListener("visibilitychange", St), window.addEventListener("pagehide", Tt), window.addEventListener("pageshow", At), vt = window.setInterval(L, pt), L();
}
function re() {
  q && (xt(), q = !1, window.clearInterval(vt), window.removeEventListener("focus", wt), document.removeEventListener("visibilitychange", St), window.removeEventListener("pagehide", Tt), window.removeEventListener("pageshow", At), window.removeEventListener("storage", kt), T == null || T.close(), T = null, k.clear(), A = "none", j = !0);
}
function ne(n) {
  return q || se(), z.add(n), n(j), () => {
    z.delete(n), z.size === 0 && re();
  };
}
const oe = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor", "call", "apply", "bind"]);
function ae(n) {
  const t = /* @__PURE__ */ new Map();
  let e = 0;
  for (const i of n) {
    if (i.kind !== "operator") continue;
    if (i.value === "(") {
      e++;
      continue;
    }
    if (i.value === ")") {
      e--;
      continue;
    }
    if (i.value !== "??" && i.value !== "||" && i.value !== "&&") continue;
    const s = t.get(e) ?? { nullish: !1, logical: !1 };
    if (i.value === "??" ? s.nullish = !0 : s.logical = !0, s.nullish && s.logical)
      throw new SyntaxError("cannot mix ?? with || or && without parentheses");
    t.set(e, s);
  }
}
function ce(n) {
  const t = [];
  let e = 0;
  for (; e < n.length; ) {
    const i = n[e];
    if (/\s/.test(i)) {
      e++;
      continue;
    }
    if (/[0-9]/.test(i) || i === "." && /[0-9]/.test(n[e + 1] ?? "")) {
      const r = n.slice(e).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
      if (!r) throw new Error("invalid number");
      const o = Number(r[0]);
      if (!Number.isFinite(o)) throw new Error("invalid number");
      t.push({ kind: "number", value: o }), e += r[0].length;
      continue;
    }
    if (/[A-Za-z_$]/.test(i)) {
      const r = n.slice(e).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
      t.push({ kind: "identifier", value: r[0] }), e += r[0].length;
      continue;
    }
    if (i === "'" || i === '"') {
      const r = i;
      let o = "";
      e++;
      let a = !1;
      for (; e < n.length; ) {
        const l = n[e++];
        if (l === r) {
          a = !0;
          break;
        }
        if (l === "\\") {
          const f = n[e++];
          if (f === void 0) break;
          o += f;
        } else
          o += l;
      }
      if (!a) throw new Error("unterminated string");
      t.push({ kind: "string", value: o });
      continue;
    }
    const s = n.slice(e).match(/^(===|!==|==|!=|<=|>=|&&|\|\||\?\?|[()+\-*/%!?<>=.,:])/);
    if (!s) throw new Error(`unsupported token '${i}'`);
    t.push({ kind: "operator", value: s[0] }), e += s[0].length;
  }
  return t.push({ kind: "eof" }), t;
}
class he {
  constructor(t, e) {
    c(this, "index", 0);
    c(this, "tokens");
    c(this, "scope");
    this.tokens = t, this.scope = e;
  }
  parse() {
    const t = this.conditional();
    if (this.peek().kind !== "eof") throw new Error("unexpected token");
    return t;
  }
  peek() {
    return this.tokens[this.index];
  }
  take(t) {
    const e = this.peek();
    if (t !== void 0 && (e.kind !== "operator" || e.value !== t))
      throw new Error(`expected '${t}'`);
    return this.index++, e;
  }
  conditional(t = !0) {
    const e = this.logicalOr(t);
    if (this.peek().kind !== "operator" || this.peek().value !== "?") return e;
    this.take("?");
    const i = this.conditional(t && !!e);
    this.take(":");
    const s = this.conditional(t && !e);
    return t ? e ? i : s : void 0;
  }
  logicalOr(t = !0) {
    let e = this.logicalAnd(t);
    for (; this.peek().kind === "operator" && this.peek().value === "||"; ) {
      this.take("||");
      const i = t && !!e, s = this.logicalAnd(t && !i);
      e = t ? i ? e : s : void 0;
    }
    for (; this.peek().kind === "operator" && this.peek().value === "??"; ) {
      this.take("??");
      const i = this.logicalAnd(t && e === null);
      e = t ? e ?? i : void 0;
    }
    return e;
  }
  logicalAnd(t = !0) {
    let e = this.equality(t);
    for (; this.peek().kind === "operator" && this.peek().value === "&&"; ) {
      this.take("&&");
      const i = t && !e, s = this.equality(t && !i);
      e = t ? i ? e : s : void 0;
    }
    return e;
  }
  equality(t = !0) {
    let e = this.comparison(t);
    for (; this.peek().kind === "operator" && ["===", "!==", "==", "!="].includes(this.peek().value); ) {
      const i = this.take().value, s = this.comparison(t);
      if (t) {
        const r = i === "===" || i === "!==" ? e === s : e === s || e == null && s == null || String(e) === String(s);
        e = i === "!=" || i === "!==" ? !r : r;
      }
    }
    return e;
  }
  comparison(t = !0) {
    let e = this.additive(t);
    for (; this.peek().kind === "operator" && ["<", "<=", ">", ">="].includes(this.peek().value); ) {
      const i = this.take().value, s = this.additive(t);
      if (t)
        switch (i) {
          case "<":
            e = e < s;
            break;
          case "<=":
            e = e <= s;
            break;
          case ">":
            e = e > s;
            break;
          default:
            e = e >= s;
            break;
        }
    }
    return e;
  }
  additive(t = !0) {
    let e = this.multiplicative(t);
    for (; this.peek().kind === "operator" && ["+", "-"].includes(this.peek().value); ) {
      const i = this.take().value, s = this.multiplicative(t);
      t && (e = i === "+" ? e + s : e - s);
    }
    return e;
  }
  multiplicative(t = !0) {
    let e = this.unary(t);
    for (; this.peek().kind === "operator" && ["*", "/", "%"].includes(this.peek().value); ) {
      const i = this.take().value, s = this.unary(t);
      t && (i === "*" ? e = e * s : i === "/" ? e = e / s : e = e % s);
    }
    return e;
  }
  unary(t = !0) {
    if (this.peek().kind === "operator" && ["!", "+", "-"].includes(this.peek().value)) {
      const e = this.take().value, i = this.unary(t);
      return t ? e === "!" ? !i : e === "+" ? +i : -i : void 0;
    }
    return this.postfix(t).value;
  }
  postfix(t = !0) {
    let e = this.primary(t);
    for (; ; ) {
      if (this.peek().kind === "operator" && this.peek().value === ".") {
        this.take(".");
        const i = this.take();
        if (i.kind !== "identifier") throw new Error("expected property");
        e = { value: t ? this.readProperty(e.value, i.value) : void 0, receiver: e.value };
        continue;
      }
      if (this.peek().kind === "operator" && this.peek().value === "(") {
        this.take("(");
        const i = [];
        if (!(this.peek().kind === "operator" && this.peek().value === ")"))
          do {
            if (i.push(this.conditional(t)), !(this.peek().kind === "operator" && this.peek().value === ",")) break;
            this.take(",");
          } while (!0);
        if (this.take(")"), !t) {
          e = { value: void 0, receiver: void 0 };
          continue;
        }
        if (typeof e.value != "function") throw new Error("value is not callable");
        e = { value: e.value.apply(e.receiver, i), receiver: void 0 };
        continue;
      }
      return e;
    }
  }
  primary(t = !0) {
    const e = this.take();
    if (e.kind === "number" || e.kind === "string") return { value: e.value, receiver: void 0 };
    if (e.kind === "identifier") {
      if (e.value === "true") return { value: !0, receiver: void 0 };
      if (e.value === "false") return { value: !1, receiver: void 0 };
      if (e.value === "null") return { value: null, receiver: void 0 };
      if (e.value === "undefined") return { value: void 0, receiver: void 0 };
      if (e.value === "typeof") {
        const i = this.unary(t);
        return { value: t ? typeof i : void 0, receiver: void 0 };
      }
      if (!t) return { value: void 0, receiver: void 0 };
      if (!(e.value in this.scope)) throw new Error(`unknown identifier '${e.value}'`);
      return { value: t ? this.scope[e.value] : void 0, receiver: void 0 };
    }
    if (e.kind === "operator" && e.value === "(") {
      const i = this.conditional(t);
      return this.take(")"), { value: i, receiver: void 0 };
    }
    throw new Error("expected value");
  }
  /** Only own properties are exposed; prototype members are intentionally sandboxed. */
  readProperty(t, e) {
    if (oe.has(e) || t === null || t === void 0)
      throw new Error("property access denied");
    if (typeof t != "object" && typeof t != "function" || !Object.prototype.hasOwnProperty.call(t, e))
      throw new Error(`unknown property '${e}'`);
    return t[e];
  }
}
function le(n, t) {
  const e = ce(n);
  return ae(e), new he(e, t).parse();
}
const w = { debug: 0, info: 1, warn: 2, error: 3 }, ue = () => typeof performance < "u" && typeof performance.now == "function" ? performance.now() : Date.now();
class Q {
  /** @internal — hosts get handles from `loggerFor()`. */
  constructor(t) {
    c(this, "channel");
    this.channel = t;
  }
  /** True when nothing would be emitted, including the console. Call sites may
   *  use it to skip building an expensive `data` object. */
  get active() {
    return B;
  }
  get level() {
    return Bt;
  }
  debug(t, e) {
    !B || w.debug < U || W("debug", this.channel, t, e);
  }
  info(t, e) {
    !B || w.info < U || W("info", this.channel, t, e);
  }
  warn(t, e) {
    !B || w.warn < U || W("warn", this.channel, t, e);
  }
  error(t, e) {
    B && W("error", this.channel, t, e);
  }
}
const fe = {
  engine: new Q("engine"),
  observe: new Q("observe"),
  logger: new Q("logger")
};
function de(n) {
  return fe[n];
}
let Bt = "info", U = w.info, B = !1, I = !1, G = "[web-mascot]", O = [];
const Ct = (n, t) => t ? `${n} ${ge(t)}` : n;
function ge(n) {
  try {
    return JSON.stringify(n);
  } catch {
    return "[unserialisable]";
  }
}
function pe(n) {
  const t = G;
  if (t == null) return "";
  if (typeof t == "function")
    try {
      return t(n);
    } catch {
      return "[web-mascot]";
    }
  return t;
}
let Mt = w.info;
function W(n, t, e, i) {
  const s = { t: ue(), level: n, channel: t, message: `${pe(t)} ${e}` };
  if (i !== void 0 && (s.data = i), I && w[n] >= Mt) {
    const r = i ? Ct(s.message, i) : s.message, o = n === "debug" ? "debug" : n;
    try {
      (console[o] ?? console.log)(r);
    } catch {
    }
  }
  for (let r = 0; r < O.length; r++) {
    const o = O[r];
    if (!(w[n] < w[o.level]))
      try {
        o.sink(s);
      } catch {
      }
  }
}
function Me(n) {
  n.console === !1 || n.console === void 0 ? I = !1 : (I = !0, Mt = w[n.console === !0 ? "info" : n.console]), n.sinks && (O = n.sinks.slice()), n.level && (Bt = n.level, U = w[n.level]), n.prefix !== void 0 && (G = n.prefix), B = I || O.length > 0;
}
function Pe() {
  B = !1, I = !1, O = [];
}
function Ie() {
  return {
    active: B,
    console: I,
    prefix: typeof G == "function" ? "(function)" : String(G),
    sinks: O.map((n) => `${n.name}>=${n.level}`)
  };
}
function Ne(n = "info") {
  return {
    name: "console",
    level: n,
    sink: (t) => {
      const e = t.data ? Ct(t.message, t.data) : t.message;
      (console[t.level] ?? console.log)(e);
    }
  };
}
const me = de("engine"), lt = /* @__PURE__ */ new Set(), Pt = {
  tickMs: 40,
  gravity: 2,
  resistanceX: 0.05,
  resistanceY: 0.1,
  stayDurationTicks: 250,
  dragResistTicks: 250,
  dragResistAbortPx: 5,
  dragOffsetX: 0,
  dragOffsetY: 120,
  broadcastServeTimeoutTicks: 600,
  suspectStepPx: 24
};
let b = { ...Pt };
function tt(n, t, e) {
  for (const i of n.poses ?? []) i.image && t.add(e(i.image));
  for (const i of n.animations ?? [])
    for (const s of i.poses) s.image && t.add(e(s.image));
  for (const i of n.children ?? []) tt(i, t, e);
}
function ve(n) {
  const t = { ...b }, e = {
    tickMs: [1, 1e3],
    gravity: [-1e3, 1e3],
    resistanceX: [0, 1],
    resistanceY: [0, 1],
    stayDurationTicks: [1, 1e6],
    dragResistTicks: [1, 1e6],
    dragResistAbortPx: [0, 1e5],
    dragOffsetX: [-1e5, 1e5],
    dragOffsetY: [-1e5, 1e5],
    broadcastServeTimeoutTicks: [1, 1e6],
    suspectStepPx: [0, 1e5]
  };
  if (!n) return t;
  for (const i of Object.keys(Pt)) {
    const s = n[i];
    if (typeof s == "number" && Number.isFinite(s)) {
      const [r, o] = e[i];
      t[i] = Math.min(o, Math.max(r, s));
    }
  }
  return t;
}
const ye = 150, S = 128, ut = "*", be = 80, xe = 1.25, ke = 260, ft = 12, we = 6, Se = 400, Te = 20, dt = 200, Ae = 200, h = class h {
  constructor(t, e) {
    /** Stable per-session identity, used to name this mascot's log file. */
    c(this, "id");
    c(this, "label");
    c(this, "container");
    c(this, "mascotName");
    /** This pack's resolved base URL, captured at construction so `configure()`
     *  after the fact cannot leave one mascot reading from another pack. */
    c(this, "packBaseUrl");
    c(this, "config", null);
    c(this, "elRoot");
    c(this, "elImg");
    /** An Interact action with image-less hold frames must hide its old standalone frame. */
    c(this, "interactionVisualActive", !1);
    c(this, "actionStack", []);
    c(this, "currentBehavior", null);
    c(this, "behaviorUsability", /* @__PURE__ */ new Map());
    /** Whether a behaviour's action needs a partner, cached per behaviour name. */
    c(this, "partnerCache", /* @__PURE__ */ new Map());
    /** Whether a behaviour's action can move the mascot, cached per behaviour name. */
    c(this, "travelCache", /* @__PURE__ */ new Map());
    /** The border a behaviour starts on, cached per behaviour name. */
    c(this, "borderStartCache", /* @__PURE__ */ new Map());
    c(this, "tickCount", 0);
    /** Anchor at the previous logic tick, used to interpolate the sub-steps. */
    c(this, "prevX", 0);
    c(this, "prevY", 0);
    c(this, "isDragging", !1);
    /** Ticks the cursor has been motionless while the mascot is held
     *  (libshijima dragged::init's `time_to_resist` timer). */
    c(this, "dragStillTicks", 0);
    /** Timestamp of the last swallowed tick error, so it is reported at most once a
     *  second instead of flooding the observation log. */
    c(this, "lastTickErrorAt", 0);
    c(this, "lastTime", 0);
    c(this, "accumulator", 0);
    c(this, "loopId", 0);
    c(this, "pauseReasons", /* @__PURE__ */ new Set());
    c(this, "unregisterPage", null);
    /** Scroll is an external intent; mascot coordinates remain viewport coordinates. */
    c(this, "lastScrollY", 0);
    c(this, "scrollDirection", 0);
    c(this, "scrollGestureDirection", 0);
    /** Pending page movement, in virtual viewport units, waiting for the next tick. */
    c(this, "pendingScrollShift", 0);
    c(this, "scrollStopPending", !1);
    c(this, "scrollHold", "none");
    c(this, "lastSurface", null);
    c(this, "cursorX", 0);
    c(this, "cursorY", 0);
    /** Cursor movement during the last logic tick, i.e. `environment.cursor.dx/dy`.
     *  libshijima rolls the raw per-subtick deltas over one tick; the packs use this
     *  as the throw velocity (`Thrown`: InitialVX/InitialVY), so it must be a per-tick
     *  delta — a per-mousemove delta makes a synthetic pointer jump launch the mascot
     *  across the screen (caught by the position-jump suspect). */
    c(this, "cursorTickDX", 0);
    c(this, "cursorTickDY", 0);
    c(this, "lastTickCursorX", 0);
    c(this, "lastTickCursorY", 0);
    /** Velocity at the start of the tick, so the jump detector can tell physics from
     *  a bug even when the phase ended and zeroed the velocity during the tick. */
    c(this, "tickStartVX", 0);
    c(this, "tickStartVY", 0);
    /** libshijima dragged::init/subtick(): the smoothed x the held mascot dangles
     *  from. The pack's own Pinched action reads it to choose its pose. */
    c(this, "footX", 0);
    c(this, "footDX", 0);
    /**
     * Qt `state::local_cursor` (see `state::get_raw_cursor()`): while the mascot is
     * held, the cursor the simulation reads is the pointer *plus this drag's grab
     * offset*, seeded when the drag starts so that `anchor = cursor + OffsetX/OffsetY`
     * reproduces the anchor the mascot had when it was picked up. Without it the first
     * held tick snaps the mascot to the pack's fixed hold point — measured 108 px for a
     * grab 12 px above the feet — because the old code kept only the *fixed* offsets.
     * `null` means "no drag in progress, the pointer is the cursor".
     */
    c(this, "dragGrab", null);
    /** Anchor and pointer at mousedown, in virtual units, so the grab offset can be
     *  derived on the first held tick — which is when the action's own OffsetX/OffsetY
     *  (the values Qt seeds the local cursor from) are known. */
    c(this, "dragPressAnchorX", 0);
    c(this, "dragPressAnchorY", 0);
    c(this, "dragPressCursorX", 0);
    c(this, "dragPressCursorY", 0);
    /**
     * Press bookkeeping for the hotspot gesture (HOLD_TRIGGER_MS …). A press is
     * tracked until the button is released, because which gesture it is (hold, click or
     * pickup) is only decided by how long and how far the pointer moved.
     */
    c(this, "pressActive", !1);
    c(this, "pressStartAt", 0);
    c(this, "pressClientX", 0);
    c(this, "pressClientY", 0);
    /** Largest Manhattan distance the pointer travelled during this press. */
    c(this, "pressMaxMovement", 0);
    /** The hotspot the press landed on, while it can still become a hold or a click. */
    c(this, "hotspotHold", null);
    c(this, "hotspotHoldTriggered", !1);
    /** Buttons currently held, as reported by the last pointer event. Qt queries
     *  `QGuiApplication::mouseButtons()` per tick so a release that never arrives
     *  cannot leave a press or a drag stuck; this is the DOM's equivalent. */
    c(this, "cursorButtons", 0);
    /** Offscreen copy of the frame the mascot is showing, for the opaque-pixel hit
     *  test (`ShijimaWidget::pointInside`). Re-read whenever the image changes. */
    c(this, "alphaCanvas", null);
    c(this, "alphaData", null);
    c(this, "alphaSrc", "");
    /** Cached host-CSS offset between this engine's coordinates and the drawn anchor
     *  (see `hostShift()`); refreshed at most once per logic tick. */
    c(this, "hostShiftCache", { x: 0, y: 0, tick: -1 });
    /** Change detection for the observation stream. */
    c(this, "observedPath", "");
    c(this, "observedImage", "");
    c(this, "clampReported", !1);
    c(this, "eventsAbortController", new AbortController());
    c(this, "resizeTimer", 0);
    c(this, "isScrolling", !1);
    c(this, "scrollDebounceTimer", 0);
    /**
     * One-shot timers that are not already covered by `resizeTimer` /
     * `scrollDebounceTimer`. `init()` and `setVisible()` schedule work that can fire
     * after `destroy()`, which used to let a torn-down mascot poke at a detached DOM
     * node (and at `this.visible`, which no longer means anything).
     */
    c(this, "pendingTimers", /* @__PURE__ */ new Set());
    c(this, "destroyed", !1);
    /** Set for the tick on which an Offset action moved the anchor on purpose. */
    c(this, "offsetJumped", !1);
    /** How long the current behaviour has been running, for the hard cap. */
    c(this, "behaviorTicks", 0);
    /** Consecutive ticks the anchor has not moved, for the "standing still" pacer. */
    c(this, "stillTicks", 0);
    /** Same, but only reset by real movement: it is what guarantees a lively page. */
    c(this, "anchorStillTicks", 0);
    /** Set once the mascot has been in the same spot too long: the next pick must travel. */
    c(this, "wantMovement", !1);
    /** Tick until which partner behaviours stay out of the pool (see the config's
     *  `interactionCooldownTicks`); refreshed while an interaction is running. */
    c(this, "interactionCooldownUntil", 0);
    /** Behaviours initialised in the current tick, for the runaway guard. */
    c(this, "behaviorInitsThisTick", 0);
    c(this, "actionExpansionsThisTick", 0);
    /** Affordance state (see Broadcast.ts). Advertisements and scan links belong to
     *  the action instance and live on its frame; the handshake belongs to the
     *  mascot, because its behaviour is what the partner is waiting on. */
    c(this, "interaction", new it());
    /** Tick at which this mascot first noticed that its advertisement had been
     *  claimed, or 0 when it is not holding a pose for anybody (see
     *  runtime.broadcastServeTimeoutTicks). */
    c(this, "servingClaimSince", 0);
    /** Paused while the mascot's container is scrolled out of view. */
    c(this, "visible", !0);
    c(this, "intersectionObserver", null);
    c(this, "x", 0);
    c(this, "y", 0);
    c(this, "vx", 0);
    c(this, "vy", 0);
    c(this, "lookRight", !0);
    this.container = t, this.mascotName = e, this.packBaseUrl = `${h.packBaseUrl}/${e}`, this.id = h.nextId++, this.label = `${this.id}-${e}`, this.elRoot = document.createElement("div"), Object.assign(this.elRoot.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      pointerEvents: "auto",
      cursor: "grab",
      zIndex: "1",
      userSelect: "none",
      visibility: "hidden",
      // A definite box as well: the root carries a transform and nothing else, so
      // without this it has a zero-size hit box and is invisible to hit testing.
      width: `${S}px`,
      height: `${S}px`
    }), this.elImg = document.createElement("img"), this.elImg.style.position = "absolute", this.elImg.style.visibility = "hidden", this.elImg.ondragstart = () => !1, this.elImg.style.maxWidth = "none", this.elImg.style.maxHeight = "none", this.elImg.addEventListener("load", () => {
      this.applySpriteIntrinsicSize(), this.elImg.style.visibility = "visible";
    }), this.elImg.style.width = `${S}px`, this.elImg.style.height = `${S}px`, this.elRoot.appendChild(this.elImg), this.bindEvents(), h.installGlobalEvents();
  }
  static addObserver(t) {
    h.observers.add(t);
  }
  /** One page-level dispatcher handles events for all mascots. */
  static installGlobalEvents() {
    h.globalEventsInstalled || typeof window > "u" || (h.globalEventsInstalled = !0, window.addEventListener("mousemove", (t) => {
      for (const e of h.liveEngines)
        e.cursorX = t.clientX, e.cursorY = t.clientY, e.cursorButtons = t.buttons, e.pressActive && (t.buttons & 1 ? (e.updatePressMovement(), e.isDragging && e.applyDragAnchor()) : e.finishPress(t.clientX, t.clientY)), e.isDragging || (e.elRoot.style.cursor = e.hotspotUnderCursor(t.clientX, t.clientY) ? "pointer" : "grab");
    }), window.addEventListener("mouseup", (t) => {
      for (const e of h.liveEngines)
        e.cursorButtons = t.buttons, e.pressActive && e.finishPress(t.clientX, t.clientY);
    }), document.addEventListener("visibilitychange", () => {
      for (const t of h.liveEngines)
        document.hidden ? (t.isDragging && (t.endDrag(), t.setBehavior("Thrown", "drag-release")), t.cancelPress(), window.clearTimeout(t.scrollDebounceTimer), t.setPauseReason("hidden", !0)) : t.setPauseReason("hidden", !1);
    }), window.addEventListener("resize", () => {
      for (const t of h.liveEngines)
        window.clearTimeout(t.resizeTimer), t.resizeTimer = window.setTimeout(() => {
          var r;
          const e = t.currentBorderAt(void 0);
          t.partnerCache.clear(), t.travelCache.clear(), t.borderStartCache.clear(), t.behaviorUsability.clear(), t.clampToWorkArea();
          const i = t.area();
          for (const o of t.actionStack)
            typeof o.resolved.TargetX == "number" && (o.resolved.TargetX = Math.max(i.left, Math.min(i.right, o.resolved.TargetX))), typeof o.resolved.TargetY == "number" && (o.resolved.TargetY = Math.max(i.top, Math.min(i.bottom, o.resolved.TargetY)));
          const s = t.currentBorderAt(void 0);
          e && !s && !/Jump|Fall|Thrown|Dragged/i.test(((r = t.currentBehavior) == null ? void 0 : r.name) || "") && t.setBehavior("Fall", "resize-border-lost");
        }, 200);
    }), window.addEventListener("scroll", () => {
      for (const t of h.liveEngines) {
        const e = window.scrollY - t.lastScrollY;
        t.lastScrollY = window.scrollY, e !== 0 && (t.isScrolling = !0, t.scrollDirection = e > 0 ? 1 : -1, t.pendingScrollShift += e / t.spriteScale, t.scrollStopPending = !1, window.clearTimeout(t.scrollDebounceTimer), t.scrollDebounceTimer = window.setTimeout(() => {
          t.isScrolling = !1, t.scrollDirection = 0, t.scrollStopPending = !0;
        }, 160));
      }
    }));
  }
  static removeObserver(t) {
    h.observers.delete(t);
  }
  static getInstances() {
    return Array.from(h.liveEngines);
  }
  /** The active animation configuration. */
  static getAnimationConfig() {
    return h.animationConfig;
  }
  /** The shared affordance registry (two mascots use it to find each other). */
  static getBroadcasts() {
    return h.broadcasts;
  }
  /**
   * Point the engine at its assets. Every URL is resolved by the caller, because
   * an embedded or published build cannot assume it is served from the page root.
   *
   * Call this before the first mascot is created: the animation configuration is
   * fetched once and then cached for the page, so a later change is only picked up
   * by `reloadAnimationConfig()`.
   */
  static configure(t) {
    t.packBaseUrl && (h.packBaseUrl = t.packBaseUrl.replace(/\/+$/, "")), t.animationConfigUrl && !h.animationConfigUrl && (h.animationConfigUrl = t.animationConfigUrl), t.ignoreBuiltin !== void 0 && (h.builtinPreference = t.ignoreBuiltin, h.applyBuiltinPreference());
  }
  /**
   * Change how the simulation is tuned. Each field is validated as a finite number
   * and anything else is ignored, so a partially-written settings object is safe.
   *
   * It applies to every mascot, including the ones already on the page: the values
   * are read per tick rather than captured at construction, which is what makes a
   * live settings panel possible. The exceptions are positions already computed
   * from the old values (a mascot mid-fall keeps its velocity), so a change is
   * smooth rather than instantaneous.
   */
  static setRuntimeOptions(t) {
    return b = ve(t), Object.freeze({ ...b });
  }
  /** The tuning currently in effect. */
  static getRuntimeOptions() {
    return Object.freeze({ ...b });
  }
  /** The asset base URL in effect, for diagnostics and for hosts that build their
   *  own sprite URLs (`spriteUrl()` returns the same shape). */
  static getPackBaseUrl() {
    return h.packBaseUrl;
  }
  /**
   * Install a configuration from an object in the same shape as the JSON file.
   * This is the entry point a settings UI would use; it wins over the file until
   * `loadAnimationConfig()` is called again with `force`.
   */
  static setAnimationConfig(t, e = "(programmatic)") {
    const i = t == null ? void 0 : t.ignoreBuiltin;
    return typeof i == "boolean" && (h.builtinPreference = i), h.animationConfig = new F(t, e), h.animationConfigSetExplicitly = !0, h.applyBuiltinPreference(), h.watchReducedMotion(), h.animationConfig;
  }
  /**
   * Re-apply the page-level `ignoreBuiltin` preference to the configuration in
   * effect.
   *
   * `toJSON()` hands back the host's own layer only, so re-seeding it never bakes
   * the built-in preset into anything; a page that never passes the flag keeps
   * whatever the file said.
   */
  static applyBuiltinPreference() {
    const t = h.builtinPreference;
    if (t === null) return;
    const e = h.animationConfig, i = e.toJSON();
    i.ignoreBuiltin === !0 !== t && (h.animationConfig = new F(
      { ...i, ignoreBuiltin: t },
      e.source
    ));
  }
  /**
   * Read the configuration file once and keep it. A missing or invalid file leaves
   * the built-in preset in place (or the packs' own settings, when the page asked
   * for `ignoreBuiltin`), so this never breaks the app.
   *
   * Probing the classic path is the price of the "just drop a file at
   * `/animation.config.json`" workflow: a host that has no file sees one expected
   * 404 per page load, and nothing else.
   */
  static loadAnimationConfig(t) {
    t && (h.animationConfigUrl = t);
    const e = h.animationConfigUrl ?? h.ANIMATION_CONFIG_URL;
    return h.animationConfigLoad || (h.animationConfigLoad = (async () => {
      try {
        const i = new AbortController(), s = window.setTimeout(() => i.abort(), 3e3);
        try {
          const r = await fetch(e, { cache: "no-store", signal: i.signal }), o = r.headers.get("content-type") ?? "";
          if (!r.ok || !o.includes("json")) return;
          const a = await r.json();
          h.animationConfigSetExplicitly || (h.animationConfig = new F(a, e)), h.applyBuiltinPreference();
        } finally {
          window.clearTimeout(s);
        }
      } catch {
      } finally {
        h.watchReducedMotion();
      }
    })()), h.animationConfigLoad;
  }
  /**
   * Follow the OS reduced-motion preference, now and on later changes.
   *
   * The disposer is kept instead of the listener because a bare listener can never
   * be unregistered: `matchMedia` needs the very `MediaQueryList` it came from, so
   * the old code left a page-lifetime listener behind with no way to remove it.
   */
  static watchReducedMotion() {
    if (h.animationConfig.refreshReducedMotion(), !h.reducedMotionWatcher && !(typeof window > "u" || typeof window.matchMedia != "function"))
      try {
        const t = window.matchMedia("(prefers-reduced-motion: reduce)"), e = () => h.animationConfig.setReducedMotion(t.matches);
        t.addEventListener("change", e), h.reducedMotionWatcher = () => {
          t.removeEventListener("change", e), h.reducedMotionWatcher = null;
        };
      } catch {
      }
  }
  /** Re-read the file, discarding both the cache and any programmatic override. */
  static async reloadAnimationConfig(t) {
    return h.animationConfigLoad = null, h.animationConfigSetExplicitly = !1, t && (h.animationConfigUrl = t), await h.loadAnimationConfig(), h.animationConfig;
  }
  async init() {
    await h.loadAnimationConfig(), this.config = await Dt.loadConfig(this.mascotName, this.packBaseUrl), !this.destroyed && (this.applySpawnPosition(), this.resetScrollTracking(), this.prevX = this.x, this.prevY = this.y, h.liveEngines.add(this), this.container.appendChild(this.elRoot), this.watchVisibility(), this.preloadSprites(), await this.warmFirstPose(), !this.destroyed && (this.elRoot.style.visibility = "visible", this.emit({ kind: "spawn", detail: `viewport=${window.innerWidth}x${window.innerHeight}` }), this.setBehavior("Fall", "spawn"), this.lastTime = performance.now(), document.hidden && this.setPauseReason("hidden", !0), this.unregisterPage = ne((t) => this.setPauseReason("background-page", !t)), this.pauseReasons.size === 0 && (this.loopId = requestAnimationFrame((t) => this.loop(t)))));
  }
  /** URL of a pack sprite. */
  spriteUrl(t) {
    return `${this.packBaseUrl}/img${t}`;
  }
  /**
   * Fetch every sprite the pack can show, once per pack. The browser then serves the
   * pose changes from its decoded cache, so swapping poses no longer flashes an empty
   * image. Cheap: these packs are ~100 images of 128 px.
   */
  preloadSprites() {
    var i;
    const t = (i = this.config) == null ? void 0 : i.actions;
    if (!t) return;
    const e = /* @__PURE__ */ new Set();
    for (const s of Object.values(t))
      tt(s, e, (r) => this.spriteUrl(r));
    for (const s of e) {
      if (h.preloaded.has(s)) continue;
      h.preloaded.add(s);
      const r = new Image();
      r.decoding = "async", r.src = s;
    }
  }
  /** Decode the poses the spawn paints, so even the landing sequence has no gap.
   *  Bounded by a timeout: a slow network must never delay the mascot. */
  async warmFirstPose() {
    var l, f;
    const t = this.currentPose() ?? this.firstPose();
    if (!t || !t.image) return;
    const e = this.spriteUrl(t.image), i = /* @__PURE__ */ new Set([e]), s = (f = (l = this.config) == null ? void 0 : l.actions) == null ? void 0 : f.Fall;
    s && tt(s, i, (d) => this.spriteUrl(d));
    const r = /* @__PURE__ */ new Map(), o = [];
    for (const d of i) {
      const p = new Image();
      r.set(d, p), p.src = d, o.push(
        typeof p.decode == "function" ? p.decode().catch(() => {
        }) : Promise.resolve()
      );
    }
    await Promise.race([Promise.all(o), new Promise((d) => window.setTimeout(d, 1500))]);
    const a = r.get(e);
    a && a.naturalWidth > 0 && (this.elImg.style.width = `${a.naturalWidth}px`, this.elImg.style.height = `${a.naturalHeight}px`, this.elRoot.style.width = `${a.naturalWidth}px`, this.elRoot.style.height = `${a.naturalHeight}px`);
  }
  /** The first pose of the action a fresh mascot starts with (Fall/Bouncing). */
  firstPose() {
    var i, s, r, o, a;
    const t = (i = this.config) == null ? void 0 : i.actions.Fall;
    return ((o = (r = (s = t == null ? void 0 : t.animations) == null ? void 0 : s[0]) == null ? void 0 : r.poses) == null ? void 0 : o[0]) ?? ((a = t == null ? void 0 : t.poses) == null ? void 0 : a[0]);
  }
  /**
   * Size the sprite box from the decoded bitmap. Packs may declare anything, and
   * a zero-area box would defeat both painting and hit testing, so the previous
   * value is kept until a real one is known (see the constructor for why the size
   * must be definite at all).
   */
  applySpriteIntrinsicSize() {
    const t = this.elImg, e = t.naturalWidth || S, i = t.naturalHeight || S;
    t.style.width === `${e}px` && t.style.height === `${i}px` || (t.style.width = `${e}px`, t.style.height = `${i}px`, this.elRoot.style.width = `${e}px`, this.elRoot.style.height = `${i}px`);
  }
  /** Pause while the mascot's container is scrolled out of view, so an embedded
   *  mascot costs nothing when the visitor is reading another part of the page. */
  watchVisibility() {
    if (typeof IntersectionObserver != "function") return;
    const t = this.container ?? this.elRoot;
    try {
      this.intersectionObserver = new IntersectionObserver(
        (e) => {
          const i = e[e.length - 1];
          if (!i) return;
          const s = i.boundingClientRect;
          if (s.width <= 0 || s.height <= 0) {
            this.setVisible(!0);
            return;
          }
          this.setVisible(i.isIntersecting);
        },
        { root: null, threshold: 0 }
      ), this.intersectionObserver.observe(t);
    } catch {
      this.intersectionObserver = null;
    }
  }
  resetScrollTracking() {
    this.lastScrollY = window.scrollY, this.scrollDirection = 0, this.scrollGestureDirection = 0, this.pendingScrollShift = 0, this.scrollStopPending = !1, this.isScrolling = !1, this.scrollHold = "none";
  }
  setVisible(t) {
    this.visible !== t && (this.visible = t, this.setPauseReason("viewport", !t), this.later(() => {
      this.destroyed || !this.visible && this.isOnScreen() && this.setVisible(!0);
    }, 2e3));
  }
  /** `setTimeout` that `destroy()` will cancel. */
  later(t, e) {
    const i = window.setTimeout(() => {
      this.pendingTimers.delete(i), t();
    }, e);
    this.pendingTimers.add(i);
  }
  setPauseReason(t, e) {
    const i = this.pauseReasons.size > 0;
    e ? this.pauseReasons.add(t) : this.pauseReasons.delete(t);
    const s = this.pauseReasons.size > 0;
    i !== s && (s ? (cancelAnimationFrame(this.loopId), window.clearTimeout(this.scrollDebounceTimer), this.resetScrollTracking(), this.emit({ kind: "milestone", name: "paused", detail: t, x: this.x, y: this.y, leaf: this.leafLabel() })) : (this.resetScrollTracking(), this.emit({ kind: "milestone", name: "resumed", detail: t, x: this.x, y: this.y, leaf: this.leafLabel() }), this.resumeLoop()));
  }
  isOnScreen() {
    const t = (this.container ?? this.elRoot).getBoundingClientRect();
    return t.bottom > 0 && t.right > 0 && t.top < window.innerHeight && t.left < window.innerWidth;
  }
  resumeLoop() {
    this.destroyed || (cancelAnimationFrame(this.loopId), this.lastTime = performance.now(), this.accumulator = 0, this.loopId = requestAnimationFrame((t) => this.loop(t)));
  }
  destroy() {
    var t, e;
    if (!this.destroyed) {
      this.destroyed = !0, cancelAnimationFrame(this.loopId), (t = this.unregisterPage) == null || t.call(this), this.unregisterPage = null, (e = this.intersectionObserver) == null || e.disconnect(), this.intersectionObserver = null, this.eventsAbortController.abort(), window.clearTimeout(this.resizeTimer), window.clearTimeout(this.scrollDebounceTimer);
      for (const i of this.pendingTimers) window.clearTimeout(i);
      this.pendingTimers.clear(), this.releaseStack(), this.actionStack = [], this.interaction.finalize(), this.emit({ kind: "despawn", detail: "destroy()" }), h.liveEngines.delete(this), this.elRoot.parentNode && this.elRoot.parentNode.removeChild(this.elRoot);
    }
  }
  /** Current observable state, for timers and for poking at the mascot in the
   *  browser console: `__mascotEngines[0].snapshot()`. */
  /** Where the mascot is drawn, in viewport pixels. The engine's own coordinates are
   *  virtual units (1 unit = 1 sprite pixel at `scale`), so anything outside the
   *  engine — logs, host code — should read this instead of `x`/`y`. */
  position() {
    const t = this.spriteScale;
    return { x: this.x * t, y: this.y * t };
  }
  snapshot() {
    var i;
    const t = this.currentLeaf(), e = this.spriteScale;
    return {
      pet: this.label,
      mascot: this.mascotName,
      x: this.x * e,
      y: this.y * e,
      behavior: ((i = this.currentBehavior) == null ? void 0 : i.name) ?? "",
      leaf: this.leafLabel(),
      path: this.stackPath(),
      nodeType: (t == null ? void 0 : t.type) ?? "",
      border: (t == null ? void 0 : t.borderType) ?? "",
      image: this.currentImage(),
      lookRight: this.lookRight,
      stackDepth: this.actionStack.length,
      dragging: this.isDragging,
      tick: this.tickCount
    };
  }
  /** Convert a virtual length or coordinate to viewport pixels (the log's unit). */
  toPage(t) {
    return t * this.spriteScale;
  }
  emit(t) {
    if (!h.observers.size) return;
    const e = this.spriteScale;
    let i = t;
    if (e !== 1) {
      const s = t, r = ["x", "y", "px", "py", "dx", "dy", "step", "targetX", "targetY"];
      let o = null;
      for (const a of r)
        typeof s[a] == "number" && (o ?? (o = { ...s }), o[a] = s[a] * e);
      o && (i = o);
    }
    for (const s of h.observers)
      try {
        s(this, i);
      } catch {
      }
  }
  currentImage() {
    return (this.elImg.getAttribute("src") ?? "").split("/").pop() ?? "";
  }
  leafLabel() {
    const t = this.currentLeaf();
    return t ? `${t.name ?? t.className ?? "?"}|${t.type}` : "-";
  }
  /**
   * A client point in sprite (bitmap) coordinates, matching how the image is drawn
   * and how libshijima computes it:
   *
   *   looking left   left edge = anchor.x - ImageAnchor.x
   *   looking right  left edge = anchor.x - (width - ImageAnchor.x)   (mirrored)
   *
   * Qt hardcodes 128 here ("FIXME: assumes width of 128"); the real bitmap width is
   * used instead, which is the same number for these packs and stays correct for
   * others.
   */
  /**
   * A client point in sprite (bitmap) coordinates — boundary two, screen → virtual.
   *
   * Because the engine works in virtual units and one virtual unit is one sprite
   * pixel, the bitmap's own geometry (ImageAnchor, the 128 px width) *is* the virtual
   * geometry, so the local point is simply the virtual cursor minus the sprite's
   * virtual top-left. The hotspot origins then compare directly, at any drawn size.
   */
  spritePoint(t, e) {
    const i = this.currentPose();
    if (!i) return null;
    const s = this.toVirtual(t, e), r = this.elImg.naturalWidth || S, o = this.hostShift(), a = (this.lookRight ? this.x - (r - i.imageAnchor.x) : this.x - i.imageAnchor.x) + o.x, l = this.y - i.imageAnchor.y + o.y;
    return { x: s.x - a, y: s.y - l };
  }
  /**
   * How far the host's CSS moves the anchor away from the coordinates this engine
   * computes, in virtual units.
   *
   * The engine's own model is `x`/`y`, but nothing stops the host from moving the
   * anchor with CSS — firefly lifts it above its music player
   * (`body.has-global-player #mascot-pet-anchor { transform: translateY(-4.5rem) }`).
   * Pointer mapping has to follow the pixels the visitor sees, or a press lands on
   * whatever the engine *would* have drawn at that spot: measured 56–72 px off in
   * firefly, which made the drawn head unpressable and put the hotspots on the body.
   *
   * The shift is measured from the DOM at most once per logic tick (and forced before
   * a press), because the anchor's border box already carries both this engine's
   * transform and the host's.
   */
  hostShift(t = !1) {
    if (!t && this.hostShiftCache.tick === this.tickCount) return this.hostShiftCache;
    const e = this.spriteScale, i = this.elRoot.getBoundingClientRect();
    return this.hostShiftCache = {
      x: i.left / e - this.x,
      y: i.top / e - this.y,
      tick: this.tickCount
    }, this.hostShiftCache;
  }
  /** The hotspot under a client point, if that behaviour is allowed to run. */
  hotspotUnderCursor(t, e) {
    if (!this.config || !this.actionStack.length) return null;
    const i = this.actionStack[this.actionStack.length - 1], s = i ? this.activeAnimation(i) : void 0;
    if (!(s != null && s.hotspots)) return null;
    const r = this.spritePoint(t, e);
    if (!r) return null;
    const o = te(s.hotspots, r);
    return !o || h.animationConfig.denies(this.mascotName, o.behavior) ? null : o;
  }
  stackPath() {
    return this.actionStack.map((t) => t.node.name ?? t.node.className ?? t.node.type).join(" > ");
  }
  bindEvents() {
    const t = this.eventsAbortController.signal;
    this.elRoot.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || (this.hostShift(!0), !this.isOpaqueAt(e.clientX, e.clientY))) return;
      this.pressActive = !0, this.pressStartAt = performance.now(), this.pressClientX = e.clientX, this.pressClientY = e.clientY, this.pressMaxMovement = 0, this.hotspotHoldTriggered = !1, this.cursorX = e.clientX, this.cursorY = e.clientY, this.cursorButtons = e.buttons;
      const i = this.hotspotUnderCursor(e.clientX, e.clientY);
      if (i) {
        this.hotspotHold = i, this.elRoot.style.cursor = "pointer";
        return;
      }
      this.hotspotHold = null, this.beginDrag(e.clientX, e.clientY);
    }, { signal: t });
  }
  /**
   * Linear size multiplier of the drawn mascot. The engine keeps every coordinate
   * in *virtual* units where one unit is one sprite pixel, exactly like libshijima's
   * `environment::set_scale`, and converts only at the two boundaries: rendering
   * (virtual → screen) and pointer input (screen → virtual). That is what lets the
   * packs' own pixel constants — `workArea.top+64`, `width-128`, pose velocities,
   * `Offset Y=1`, hotspot origins — stay correct at any drawn size, and it keeps the
   * relative motion feel identical (a bigger mascot covers more pixels per tick).
   */
  get spriteScale() {
    return h.animationConfig.mascotScale(this.mascotName);
  }
  /** Viewport extent in virtual units. */
  get virtualWidth() {
    return window.innerWidth / this.spriteScale;
  }
  get virtualHeight() {
    return window.innerHeight / this.spriteScale;
  }
  /** A client (screen) point in virtual units. */
  toVirtual(t, e) {
    const i = this.spriteScale;
    return { x: t / i, y: e / i };
  }
  /**
   * The cursor the *simulation* reads, in virtual units: the pointer, plus this
   * drag's grab offset while the mascot is held. Qt reads the same value here and in
   * the pack's `mascot.environment.cursor` (`state::get_raw_cursor()` →
   * `roll_dcursor()` → `get_cursor()`), so the held pose's `FootX` comparison and the
   * anchor stay in one reference frame.
   */
  simulationCursorVirtual() {
    const t = this.toVirtual(this.cursorX, this.cursorY);
    return this.dragGrab ? { x: t.x + this.dragGrab.x, y: t.y + this.dragGrab.y } : t;
  }
  /** `environment.cursor` for the pack expressions: position and per-tick delta,
   *  both in virtual units. */
  cursorInVirtualUnits() {
    const t = this.simulationCursorVirtual();
    return { x: t.x, y: t.y, dx: this.cursorTickDX, dy: this.cursorTickDY };
  }
  /** Release a held mascot: the grab offset goes away, so the pointer is the cursor
   *  again. The behaviour change (Thrown, resist-escape) is the caller's job. */
  endDrag() {
    this.isDragging = !1, this.dragGrab = null, this.elRoot.style.cursor = "grab";
  }
  /** Pick the mascot up: Qt does this from `beginLeftPress()` when the press is not on
   *  a hotspot, and from `mouseMoveEvent()` when a hotspot candidate leaves the hold
   *  tolerance. */
  beginDrag(t, e) {
    this.isDragging = !0, this.resetScrollTracking(), this.elRoot.style.cursor = "grabbing";
    const i = this.toVirtual(t, e);
    this.dragPressAnchorX = this.x, this.dragPressAnchorY = this.y, this.dragPressCursorX = i.x, this.dragPressCursorY = i.y, this.dragGrab = null, this.cursorX = t, this.cursorY = e, this.footX = this.x, this.footDX = 0, this.dragStillTicks = 0, this.vx = this.vy = 0, this.interaction.finalize(), this.setBehavior("Dragged", "drag-start");
  }
  /**
   * `dragged::subtick()`: pin the anchor to `cursor + OffsetX/OffsetY`.
   *
   * Qt runs this once per *subtick* — every 10 ms, i.e. four times per logic frame —
   * and assigns the anchor directly, with no clamp and no interpolation, so a held
   * mascot can never drift away from the cursor however fast the pointer moves. The
   * web engine ticks every 40 ms, so this is called from the tick *and* from every
   * pointer event, and `render()` skips interpolation while a drag is active.
   */
  applyDragAnchor() {
    const t = this.actionStack[this.actionStack.length - 1];
    if (this.isResistAction(t == null ? void 0 : t.node)) return;
    const e = this.varNumber(t, "OffsetX") ?? b.dragOffsetX, i = this.varNumber(t, "OffsetY") ?? b.dragOffsetY;
    this.dragGrab || (this.dragGrab = {
      x: this.dragPressAnchorX - this.dragPressCursorX - e,
      y: this.dragPressAnchorY - this.dragPressCursorY - i
    }, this.footX = this.dragPressAnchorX);
    const s = this.simulationCursorVirtual();
    this.x = s.x + e, this.y = s.y + i;
  }
  /** Qt `ShijimaWidget::mouseMoveEvent()`: remember how far the pointer has travelled
   *  since the press, and let a hotspot candidate become a pickup once it leaves the
   *  hold tolerance. */
  updatePressMovement() {
    if (!this.pressActive) return;
    const t = Math.abs(this.cursorX - this.pressClientX) + Math.abs(this.cursorY - this.pressClientY);
    this.pressMaxMovement = Math.max(this.pressMaxMovement, t), !(this.isDragging || !this.hotspotHold) && (t <= ft || (this.hotspotHold = null, this.beginDrag(this.cursorX, this.cursorY)));
  }
  /** Qt `ShijimaWidget::maintainHotspotHold()`: a press that has been held inside the
   *  tolerances long enough runs the hotspot's behaviour, and keeps it running. Qt
   *  pins the behaviour's next selection to itself (`prefer_next_behavior`) so the
   *  patpat repeats; re-issuing it whenever the mascot has moved on is the equivalent
   *  here, without touching the behaviour-selection machinery. */
  maintainHotspotHold() {
    var e;
    if (!this.pressActive || !this.hotspotHold || this.isDragging || performance.now() - this.pressStartAt < ke || this.pressMaxMovement > ft) return;
    const t = this.hotspotHold.behavior;
    this.hotspotHoldTriggered = !0, ((e = this.currentBehavior) == null ? void 0 : e.name) !== t && (this.emitHotspot("hold", this.hotspotHold), this.setBehavior(t, "hotspot-hold"));
  }
  /** Qt `ShijimaWidget::mouseReleaseEvent()`: a short, still release counts as a click
   *  and triggers the hotspot under the *release* point (`manager::trigger_hotspot`);
   *  a release after a pickup throws the mascot (`dragged::handle_dragging`). */
  finishPress(t, e) {
    if (!this.pressActive) return;
    const i = performance.now() - this.pressStartAt, s = this.hotspotHoldTriggered, r = this.hotspotHold !== null, o = this.pressMaxMovement;
    if (this.pressActive = !1, this.hotspotHold = null, this.hotspotHoldTriggered = !1, this.isDragging) {
      this.endDrag(), this.setBehavior("Thrown", "drag-release");
      return;
    }
    if (s || !r || i > Se || o > we) return;
    const a = this.hotspotUnderCursor(t, e);
    a && (this.emitHotspot("click", a), this.setBehavior(a.behavior, "hotspot"));
  }
  /** Drop a press without deciding a gesture (the tab went hidden mid-press). */
  cancelPress() {
    this.pressActive = !1, this.hotspotHold = null, this.hotspotHoldTriggered = !1;
  }
  emitHotspot(t, e) {
    const i = this.spritePoint(this.cursorX, this.cursorY);
    this.emit({
      kind: "milestone",
      name: "hotspot",
      detail: `${t} behavior=${e.behavior} shape=${e.shape} local=${i ? `${i.x.toFixed(0)},${i.y.toFixed(0)}` : "?"}(sprite px)`,
      x: this.x,
      y: this.y,
      leaf: this.leafLabel()
    });
  }
  /** `ShijimaWidget::pointInside()`: a press only belongs to the mascot when it lands
   *  on an opaque pixel of the frame it is showing. The bitmap is cached until the
   *  image changes; a canvas that cannot be read (sprites served from another origin)
   *  degrades to the whole box. */
  isOpaqueAt(t, e) {
    const i = this.spritePoint(t, e);
    if (!i) return !1;
    const s = this.elImg, r = s.naturalWidth || S, o = s.naturalHeight || S;
    if (i.x < 0 || i.y < 0 || i.x > r || i.y > o) return !1;
    const a = this.frameAlpha();
    if (!a) return !0;
    const l = Math.min(r - 1, Math.max(0, Math.round(this.lookRight ? r - i.x : i.x))), f = Math.min(o - 1, Math.max(0, Math.round(i.y)));
    return a.data[(f * a.width + l) * 4 + 3] !== 0;
  }
  /** The pixels of the frame the mascot is currently showing, cached per image URL. */
  frameAlpha() {
    const t = this.elImg.getAttribute("src") ?? "";
    if (this.alphaSrc === t) return this.alphaData;
    this.alphaSrc = t, this.alphaData = null;
    const e = this.elImg;
    if (!t || !e.complete || e.naturalWidth === 0) return null;
    const i = this.alphaCanvas ?? (this.alphaCanvas = document.createElement("canvas"));
    i.width = e.naturalWidth, i.height = e.naturalHeight;
    const s = i.getContext("2d", { willReadFrequently: !0 });
    if (!s) return null;
    try {
      s.clearRect(0, 0, i.width, i.height), s.drawImage(e, 0, 0), this.alphaData = s.getImageData(0, 0, i.width, i.height);
    } catch {
      this.alphaData = null;
    }
    return this.alphaData;
  }
  /** Resolve a configuration Metric against one viewport axis. A bare number is a
   *  page pixel value, so it is divided by the sprite scale to reach virtual units;
   *  percentages and `left`/`right`/`top`/`bottom`/`center` follow the viewport. */
  metric(t, e, i) {
    if (t === void 0) return i;
    const s = e === "x" ? this.virtualWidth : this.virtualHeight, r = this.spriteScale;
    if (typeof t == "number") return Number.isFinite(t) ? t / r : i;
    const o = String(t).trim().toLowerCase();
    if (o.endsWith("%")) {
      const l = Number(o.slice(0, -1));
      return Number.isFinite(l) ? s * l / 100 : i;
    }
    if (o === "left" || o === "top") return 0;
    if (o === "right" || o === "bottom") return s;
    if (o === "center") return s / 2;
    const a = Number(o);
    return Number.isFinite(a) ? a / r : i;
  }
  /** The mascot's activity rectangle in viewport coordinates. */
  area() {
    const t = h.animationConfig.zone(this.mascotName), e = this.metric(t.left, "x", 0), i = this.metric(t.right, "x", this.virtualWidth), s = this.metric(t.top, "y", 0), r = this.metric(t.bottom, "y", this.virtualHeight);
    return {
      left: e,
      right: Math.max(e + 1, i),
      top: s,
      bottom: Math.max(s + 1, r)
    };
  }
  /** Start position from the configuration: top or floor, any x, and several
   *  mascots are spread apart instead of stacking on one spot. */
  applySpawnPosition() {
    const t = h.animationConfig.spawn(this.mascotName), e = this.area(), i = this.metric(t.x, "x", (e.left + e.right) / 2), s = h.liveEngines.size, r = (t.staggerPx ?? 0) / this.spriteScale, o = s === 0 || r === 0 ? 0 : (s % 2 === 1 ? 1 : -1) * Math.ceil(s / 2) * r;
    this.x = Math.min(e.right, Math.max(e.left, i + o)), this.y = t.vertical === "floor" ? e.bottom : e.top + (t.topOffset ?? 100) / this.spriteScale;
  }
  /** Is `point` on one of the work-area borders? */
  borderIsOn(t, e, i = this.area()) {
    if (t === "top" || t === "bottom") {
      const o = t === "top" ? i.top : i.bottom, a = t === "bottom" && e.y >= o, l = Math.abs(e.y - o) < 1;
      return (a || l) && e.x >= i.left && e.x <= i.right;
    }
    const r = t === "left" ? i.left : i.right;
    return Math.abs(e.x - r) < 1 && e.y >= i.top && e.y <= i.bottom;
  }
  environment() {
    const t = this.area(), e = (s) => ({ isOn: (r) => this.borderIsOn(s, r, t) }), i = {
      ...t,
      width: t.right - t.left,
      height: t.bottom - t.top,
      topBorder: e("top"),
      rightBorder: e("right"),
      bottomBorder: e("bottom"),
      leftBorder: e("left"),
      isOn: (s) => ["top", "right", "bottom", "left"].some((r) => this.borderIsOn(r, s, t))
    };
    return {
      floor: { isOn: (s) => this.borderIsOn("bottom", s, t) },
      ceiling: { isOn: (s) => this.borderIsOn("top", s, t) },
      wall: { isOn: (s) => this.borderIsOn("left", s, t) || this.borderIsOn("right", s, t) },
      workArea: i,
      screen: { ...i },
      activeIE: {
        visible: !1,
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        width: 0,
        height: 0,
        topBorder: { isOn: () => !1 },
        bottomBorder: { isOn: () => !1 },
        leftBorder: { isOn: () => !1 },
        rightBorder: { isOn: () => !1 },
        isOn: () => !1
      },
      // The cursor is a sprite-unit quantity for the packs: `Pinched` picks its held
      // pose from `#{FootX < mascot.environment.cursor.x-50}`, `ChaseMouse` targets
      // `cursor.x`, `SitAndFaceMouse` compares against `anchor.x` — all virtual. It
      // has to be converted here, otherwise every such comparison mixes units and
      // the mascot is stuck on one variant (which is what a held mascot did at any
      // scale other than 1).
      cursor: this.cursorInVirtualUnits()
    };
  }
  mascotScope(t) {
    const e = {
      anchor: { x: this.x, y: this.y },
      lookRight: this.lookRight,
      environment: this.environment(),
      totalCount: Math.max(1, h.liveEngines.size),
      ...t
    };
    return { finalMascot: e, mascot: e, Math, ...t };
  }
  run(t, e) {
    return le(this.cleanExpression(t), e);
  }
  /**
   * libshijima splits the attributes of an <ActionReference> in two
   * (scripting::variables::add_attr):
   *   ${expr} is "dynamic (once)"       — evaluated when the action starts;
   *   #{expr} is "dynamic (every frame)" — re-evaluated on each tick.
   * Freezing ${...} is what keeps TargetX/TargetY stable for the whole action: a
   * target that is re-rolled every tick makes the mascot jitter around it
   * ("stuck halfway up the wall") instead of travelling to it.
   */
  resolveVars(t, e = {}) {
    const i = { ...e };
    for (let s = 0; s < 2; s++)
      for (const [r, o] of Object.entries(t))
        if (!/^#\{/.test(o))
          if (/^\$\{/.test(o))
            try {
              i[r] = this.run(o, this.mascotScope({ ...t, ...i }));
            } catch {
              r in i || (i[r] = o);
            }
          else o === "true" || o === "false" ? i[r] = o === "true" : o.trim() !== "" && Number.isFinite(Number(o)) ? i[r] = Number(o) : i[r] = o;
    return i;
  }
  /** Every attribute of the frame as a value: frozen for ${...} (evaluated once,
   *  the first time it is needed) and re-evaluated per tick for #{...}. */
  frameVars(t) {
    if (!t) return {};
    const e = t.vars || {};
    for (const [o, a] of Object.entries(e))
      if (!(o in t.resolved || !/^\$\{/.test(a)))
        try {
          t.resolved[o] = this.run(a, this.mascotScope({ ...e, ...t.resolved }));
        } catch {
          t.resolved[o] = a;
        }
    const i = t.resolved;
    if (this.isDragging && (i.FootX = this.footX, i.footX = this.footX, i.FootDX = this.footDX, i.footDX = this.footDX), !Object.values(e).some((o) => /^#\{/.test(o))) return { ...e, ...i };
    if (t.liveTick === this.tickCount) return { ...e, ...t.live };
    const r = { ...i };
    for (let o = 0; o < 2; o++)
      for (const [a, l] of Object.entries(e))
        if (!(a in i))
          if (/^#\{/.test(l))
            try {
              r[a] = this.run(l, this.mascotScope({ ...e, ...r }));
            } catch {
              r[a] = l;
            }
          else l === "true" || l === "false" ? r[a] = l === "true" : l.trim() !== "" && Number.isFinite(Number(l)) ? r[a] = Number(l) : r[a] = l;
    return t.live = r, t.liveTick = this.tickCount, { ...e, ...r };
  }
  varValue(t, e) {
    return this.frameVars(t)[e];
  }
  varString(t, e) {
    const i = this.varValue(t, e);
    return i == null ? "" : typeof i == "string" ? i : String(i);
  }
  varNumber(t, e) {
    const i = this.varValue(t, e);
    return typeof i == "number" && Number.isFinite(i) ? i : null;
  }
  context(t) {
    var i;
    const e = (i = t == null ? void 0 : t.client) == null ? void 0 : i.target;
    return this.mascotScope({
      ...this.frameVars(t),
      target: e ? { anchor: { x: e.x, y: e.y } } : void 0
    });
  }
  cleanExpression(t) {
    return t.replace(/^\$\{|^#\{|\}$/g, "").trim();
  }
  evaluate(t, e) {
    if (t)
      try {
        return this.run(t, this.context(e));
      } catch (i) {
        const s = `${this.mascotName}:${t}`;
        lt.has(s) || (lt.add(s), me.warn("expression evaluation failed", {
          mascot: this.mascotName,
          expression: t,
          error: i instanceof Error ? i.message : String(i)
        }));
        return;
      }
  }
  evaluateCondition(t, e) {
    return t ? !!this.evaluate(t, e) : !0;
  }
  evaluateNumber(t, e) {
    const i = this.evaluate(t, e);
    return typeof i == "number" && Number.isFinite(i) ? i : null;
  }
  newFrame(t, e = {}, i = {}) {
    const s = {
      node: t,
      childIndex: 0,
      // libshijima layers the action's own attributes under the <ActionReference>
      // overlay, so a condition may read either of them.
      vars: { ...t.attributes || {}, ...e },
      resolved: i,
      live: {},
      liveTick: -1,
      durationLimit: null,
      elapsed: 0,
      poseIndex: 0,
      poseTick: 0,
      stallTicks: 0,
      progressX: NaN,
      progressY: NaN,
      server: null,
      client: null,
      animation: void 0,
      bornTick: this.tickCount
    };
    return this.initBroadcast(s), s;
  }
  /** libshijima `base::init()`: an action that advertises an `Affordance` starts a
   *  broadcast as it is created and clears the attribute, so it advertises once.
   *  A ScanMove action is the scanning side: it looks for somebody else's
   *  advertisement instead (`scanmove::init`). */
  initBroadcast(t) {
    const e = t.vars.Affordance;
    if (typeof e != "string" || e.trim() === "") return;
    const i = `${t.node.name ?? t.node.className ?? "?"}|${t.node.type}`;
    if (this.isScanMove(t.node)) {
      const r = e.trim(), o = h.broadcasts.probe(r, { x: this.x, y: this.y });
      t.client = h.broadcasts.tryConnect(
        r,
        { x: this.x, y: this.y },
        this.varString(t, "Behavior"),
        this.varString(t, "TargetBehavior"),
        h.animationConfig.scanDistancePx(this.mascotName)
      ), this.emit({
        kind: "milestone",
        name: t.client ? "broadcast-connect" : "broadcast-scan",
        detail: `affordance=${e} live=${o.live} nearest=${o.nearest === null ? "-" : this.toPage(o.nearest).toFixed(0)}px found=${!!t.client}`,
        affordance: r,
        side: "client",
        behavior: this.varString(t, "Behavior"),
        distance: o.nearest === null ? void 0 : this.toPage(o.nearest),
        x: this.x,
        y: this.y,
        leaf: i
      });
      return;
    }
    t.server = h.broadcasts.startBroadcast(e.trim(), { x: this.x, y: this.y });
    const s = { ...t.vars };
    delete s.Affordance, t.vars = s, this.emit({
      kind: "milestone",
      name: "broadcast-start",
      detail: `affordance=${e}`,
      affordance: e.trim(),
      side: "server",
      behavior: this.varString(t, "Behavior"),
      x: this.x,
      y: this.y,
      leaf: i
    });
  }
  /** libshijima `base::finalize()`: an action instance that ends stops advertising
   *  and hands its scan target back to the pool. */
  releaseFrame(t) {
    var e, i;
    t && ((e = t.server) == null || e.finalize(), t.server = null, (i = t.client) == null || i.finalize(), t.client = null);
  }
  releaseStack() {
    for (const t of this.actionStack) this.releaseFrame(t);
  }
  setBehavior(t, e = "engine", i) {
    var l;
    if (!this.config) return;
    if (this.behaviorInitsThisTick >= Te) {
      if (t === "StandUp") return;
      t = "StandUp", e = "init-limit";
    }
    this.behaviorInitsThisTick++;
    const r = this.config.behaviors.find((f) => f.name === t && (i === void 0 || f.id === i)) || (this.config.actions[t] ? { name: t, frequency: 100, hidden: !1, nextBehaviors: [] } : void 0) || this.config.behaviors.find((f) => f.name === "StandUp") || this.config.behaviors[0];
    if (!r) return;
    const o = this.config.actions[r.name], a = ((l = this.currentBehavior) == null ? void 0 : l.name) ?? "";
    if (this.clampReported = !1, this.behaviorTicks = 0, this.stillTicks = 0, !o) {
      this.interactionVisualActive = !1, this.currentBehavior = r, this.onBehaviorEnd(e);
      return;
    }
    this.interaction.available && !this.interaction.started && this.interaction.behavior === r.name && (this.interaction.started = !0), this.interaction.ongoing && r.name !== this.interaction.behavior && !e.startsWith("interaction-") && this.interaction.finalize(), this.releaseStack(), this.currentBehavior = r, this.interactionVisualActive = !!o && this.actionTreeMatches(o, (f) => this.isInteract(f)), this.interactionVisualActive && (this.elImg.style.visibility = "hidden", this.elImg.removeAttribute("src")), this.actionStack = [this.newFrame(o)], a !== r.name && this.emit({
      kind: "behavior",
      from: a,
      to: r.name,
      reason: e,
      x: this.x,
      y: this.y,
      leaf: this.leafLabel()
    });
  }
  loop(t) {
    if (!this.destroyed) {
      this.accumulator += Math.min(t - this.lastTime, Ae), this.lastTime = t;
      try {
        for (; this.accumulator >= b.tickMs; )
          this.tick(), this.accumulator -= b.tickMs;
        this.render(!this.isDragging);
      } catch (e) {
        this.accumulator = 0;
        const i = performance.now();
        i - this.lastTickErrorAt > 1e3 && (this.lastTickErrorAt = i, this.emit({
          kind: "milestone",
          name: "tick-error",
          detail: `${e instanceof Error ? e.name : "Error"}: ${e instanceof Error ? e.message : String(e)}`,
          x: this.x,
          y: this.y,
          leaf: this.leafLabel()
        }));
      }
      this.destroyed || (this.loopId = requestAnimationFrame((e) => this.loop(e)));
    }
  }
  tick() {
    if (!this.config || !this.actionStack.length) return;
    this.pressActive && (this.cursorButtons & 1 ? (this.updatePressMovement(), this.maintainHotspotHold()) : this.finishPress(this.cursorX, this.cursorY));
    const t = this.x, e = this.y;
    this.prevX = this.x, this.prevY = this.y, this.tickCount++, this.behaviorInitsThisTick = 0, this.actionExpansionsThisTick = 0;
    const i = this.surfaceAt();
    !this.isDragging && this.pendingScrollShift !== 0 && (this.y -= this.pendingScrollShift, this.pendingScrollShift = 0, this.clampToWorkArea()), this.applyScrollIntent(i);
    const s = be / this.spriteScale;
    if (this.cursorTickDX = Math.max(-s, Math.min(s, (this.cursorX - this.lastTickCursorX) / this.spriteScale)), this.cursorTickDY = Math.max(-s, Math.min(s, (this.cursorY - this.lastTickCursorY) / this.spriteScale)), this.lastTickCursorX = this.cursorX, this.lastTickCursorY = this.cursorY, this.isDragging) {
      const o = this.actionStack[this.actionStack.length - 1];
      if (!this.isResistAction(o == null ? void 0 : o.node)) {
        this.applyDragAnchor();
        const a = this.simulationCursorVirtual();
        this.lookRight = !1, this.footDX = (this.footDX + (a.x - this.footX) * 0.1) * 0.8, this.footX += this.footDX;
      }
    }
    this.maintainBroadcasts(), this.tickStartVX = this.vx, this.tickStartVY = this.vy, this.isDragging || this.updatePhysics(), this.advanceActionTree(), this.behaviorTicks++;
    const r = Math.abs(this.x - t) + Math.abs(this.y - e) > 0.05;
    this.stillTicks = r ? 0 : this.stillTicks + 1, this.anchorStillTicks = r ? 0 : this.anchorStillTicks + 1, r && (this.wantMovement = !1), this.isDragging || this.enforceBehaviorSwitch(), this.lastSurface = this.surfaceAt(), this.observeTick(t, e);
  }
  /**
   * libshijima `base::tick()` for every advertisement this mascot currently owns:
   * keep the advertised position current, and when somebody walked up to it, start
   * the behaviour the handshake asked for.
   */
  maintainBroadcasts() {
    var i;
    h.broadcasts.prune();
    let t = null, e = "";
    for (const s of this.actionStack) {
      const r = s.server;
      if (!r || (r.active && r.updateAnchor({ x: this.x, y: this.y }), r.isClaimed && !t && (t = r, e = ((i = s.node.attributes) == null ? void 0 : i.Affordance) ?? s.node.name ?? ""), !r.didMeetUp)) continue;
      this.interaction = r.interaction();
      const o = this.interaction.behavior;
      o && this.setBehavior(o, "interaction-server");
      return;
    }
    if (!t) {
      this.servingClaimSince = 0;
      return;
    }
    this.servingClaimSince === 0 && (this.servingClaimSince = this.tickCount), this.tickCount - this.servingClaimSince >= b.broadcastServeTimeoutTicks && (this.emit({
      kind: "milestone",
      name: "broadcast-serve-timeout",
      detail: `affordance=${e} waited=${this.tickCount - this.servingClaimSince} ticks`,
      affordance: e,
      side: "server",
      x: this.x,
      y: this.y,
      leaf: this.leafLabel()
    }), t.finalize(), this.servingClaimSince = 0);
  }
  /**
   * Is this frame the advertisement of a claim that has not arrived yet, and is the
   * wait still within its bound? While it is true the frame must not end and the
   * pacer must not pull the mascot away, otherwise the scanner loses its partner
   * mid-approach. Everything else (a drag, a scroll, a forced `Fall`) still releases
   * the advertisement the normal way — only the advertisement's *own* animation
   * ending is deferred.
   */
  holdingClaim(t) {
    const e = t == null ? void 0 : t.server;
    return !e || !e.isClaimed ? !1 : this.servingClaimSince === 0 ? !0 : this.tickCount - this.servingClaimSince < b.broadcastServeTimeoutTicks;
  }
  /**
   * Animation configuration, two different limits with two different jobs:
   *
   *   forcedSwitchTicks  how long the mascot may stand still before it is nudged
   *                      into something else, so a page never looks frozen. Travel
   *                      is never cut: it is moving, so the counter is zero.
   *   maxBehaviorTicks   a hard cap on any one behaviour, so a long wall climb or
   *                      a crawl cannot monopolise the mascot. A fall (and a drag)
   *                      is still left alone, since those are engine-driven states.
   */
  enforceBehaviorSwitch() {
    var s, r;
    const t = h.animationConfig;
    if (this.isDragging || this.isFallLike(this.currentLeaf()) || ((s = this.currentBehavior) == null ? void 0 : s.name) === "Dragged" || this.holdingClaim(this.actionStack[this.actionStack.length - 1])) return;
    const e = t.forcedSwitchTicks(this.mascotName);
    if (e > 0 && this.stillTicks >= e && !this.isTravelling() && // A behaviour may opt out of the pacer so a long *stationary* animation can
    // finish. The check is on the behaviour, not on the mascot: a plain idle Stay
    // still gets nudged on time.
    t.pacerApplies(this.mascotName, (r = this.currentBehavior) == null ? void 0 : r.name)) {
      this.anchorStillTicks >= e && (this.wantMovement = !0), this.switchBehavior("forced-switch");
      return;
    }
    const i = t.maxBehaviorTicks(this.mascotName);
    i > 0 && this.behaviorTicks >= i && this.switchBehavior("behavior-cap");
  }
  switchBehavior(t) {
    var e;
    this.emit({
      kind: "milestone",
      name: t,
      detail: `behavior=${((e = this.currentBehavior) == null ? void 0 : e.name) ?? "?"} behaviorTicks=${this.behaviorTicks} anchorStill=${this.anchorStillTicks}${this.wantMovement ? " force-travel" : ""}`,
      x: this.x,
      y: this.y,
      leaf: this.leafLabel()
    }), this.onBehaviorEnd(t);
  }
  /** Is the mascot currently going somewhere? Used so the pacer only interrupts
   *  standing still, never a walk, run, climb or jump in progress. */
  isTravelling() {
    const t = this.currentLeaf(), e = this.actionStack[this.actionStack.length - 1];
    if (!t || !e) return !1;
    if (t.type === "Move" || this.isScanMove(t) || this.varNumber(e, "TargetX") !== null || this.varNumber(e, "TargetY") !== null) return !0;
    const i = this.currentPose();
    return !!i && (i.velocity.x !== 0 || i.velocity.y !== 0);
  }
  /** Feed the observation stream: stack/frame changes and impossible steps.
   *  Runs once per logic tick and does nothing when nobody is listening. */
  observeTick(t, e) {
    if (!h.observers.size) return;
    const i = this.leafLabel(), s = this.currentImage(), r = this.stackPath();
    if (r !== this.observedPath) {
      this.observedPath = r, this.clampReported = !1;
      const d = this.currentLeaf(), p = this.actionStack[this.actionStack.length - 1];
      this.emit({
        kind: "stack",
        path: r,
        leaf: i,
        nodeType: (d == null ? void 0 : d.type) ?? "-",
        className: (d == null ? void 0 : d.className) ?? "",
        border: (d == null ? void 0 : d.borderType) ?? "",
        targetX: this.varNumber(p, "TargetX"),
        targetY: this.varNumber(p, "TargetY"),
        image: s,
        lookRight: this.lookRight,
        x: this.x,
        y: this.y
      });
    }
    s !== this.observedImage && (this.observedImage = s, this.emit({ kind: "image", image: s, leaf: i, x: this.x, y: this.y }));
    const o = Math.hypot(this.x - t, this.y - e), a = this.currentPose(), l = Math.abs(this.vx) + Math.abs(this.vy) + Math.abs(this.tickStartVX) + Math.abs(this.tickStartVY) + (a ? Math.abs(a.velocity.x) + Math.abs(a.velocity.y) : 0), f = this.isDragging || this.offsetJumped || o <= l + b.suspectStepPx;
    this.offsetJumped = !1, o > b.suspectStepPx && !f && this.emit({
      kind: "suspect",
      name: "position-jump",
      detail: `single-tick step=${o.toFixed(1)}`,
      step: o,
      dx: this.x - t,
      dy: this.y - e,
      px: t,
      py: e,
      x: this.x,
      y: this.y,
      leaf: i
    });
  }
  activeAnimation(t) {
    const e = t.node.animations || [];
    return e.find((i) => this.evaluateCondition(i.condition, t)) || e[0];
  }
  advanceActionTree() {
    var o, a, l;
    const t = this.actionStack[this.actionStack.length - 1];
    if (!t || !this.config) return;
    if (++this.actionExpansionsThisTick > dt) {
      this.emit({
        kind: "milestone",
        name: "action-expansion-limit",
        detail: `>${dt} expansions in one tick`,
        x: this.x,
        y: this.y,
        leaf: this.leafLabel()
      }), this.popActionStack();
      return;
    }
    const e = t.node;
    if (e.type === "ActionReference") {
      if (e.condition && !this.evaluateCondition(e.condition, t)) {
        this.popActionStack();
        return;
      }
      if (!e.referenceName) {
        this.popActionStack();
        return;
      }
      const f = this.config.actions[e.referenceName];
      if (!f) {
        this.popActionStack();
        return;
      }
      const d = e.attributes || {}, p = { ...t.vars, ...d }, v = { ...t.resolved, ...this.resolveVars(d, t.resolved) };
      this.clampTravelTarget(v);
      const y = this.newFrame(f, p, v), u = h.animationConfig.durationTicks(this.mascotName, e.referenceName);
      u !== null ? y.durationLimit = u : f.type === "Stay" ? y.durationLimit = this.scaledTicks(this.varNumber(y, "Duration") ?? b.stayDurationTicks) : y.durationLimit = null, this.actionStack[this.actionStack.length - 1] = y;
      const g = this.varNumber(y, "InitialVX"), m = this.varNumber(y, "InitialVY");
      g !== null && (this.vx = g), m !== null && (this.vy = m);
      const x = this.varValue(y, "LookRight");
      return typeof x == "boolean" && (this.lookRight = x), this.advanceActionTree();
    }
    if (e.condition && !this.evaluateCondition(e.condition, t)) {
      this.popActionStack();
      return;
    }
    if ((e.type === "Sequence" || e.type === "Select") && (t.elapsed++, t.durationLimit !== null && t.elapsed >= t.durationLimit)) {
      this.popActionStack();
      return;
    }
    if (e.type === "Select") {
      if (t.childIndex > 0) {
        this.popActionStack();
        return;
      }
      const f = (e.children || []).find((d) => this.evaluateCondition(d.condition, t));
      return t.childIndex = 1, f ? this.actionStack.push(this.newFrame(f, { ...t.vars }, { ...t.resolved })) : this.popActionStack(), this.advanceActionTree();
    }
    if (e.type === "Sequence") {
      const f = e.children || [];
      for (; t.childIndex < f.length; ) {
        const d = f[t.childIndex++];
        if (!(d.condition !== void 0 && !this.evaluateCondition(d.condition, t)))
          return this.actionStack.push(this.newFrame(d, { ...t.vars }, { ...t.resolved })), this.advanceActionTree();
      }
      if (e.loop)
        return t.childIndex = 0, this.advanceActionTree();
      this.popActionStack();
      return;
    }
    if ((o = e.className) != null && o.endsWith(".Look") || e.name === "Look") {
      const f = this.varValue(t, "LookRight");
      this.lookRight = typeof f == "boolean" ? f : !this.lookRight, this.popActionStack();
      return;
    }
    if ((a = e.className) != null && a.endsWith(".Offset") || e.name === "Offset") {
      const f = Math.trunc(this.varNumber(t, "X") ?? 0), d = Math.trunc(this.varNumber(t, "Y") ?? 0);
      this.x += f, this.y += d, this.clampToWorkArea(), (f !== 0 || d !== 0) && (this.offsetJumped = !0, this.emit({
        kind: "milestone",
        name: "offset",
        detail: `d=(${f},${d}) sprite px = (${this.toPage(f).toFixed(1)},${this.toPage(d).toFixed(1)}) page px`,
        x: this.x,
        y: this.y,
        leaf: this.leafLabel()
      })), this.popActionStack();
      return;
    }
    if (this.isScanMove(e) && !(t.client && t.client.connected)) {
      t.client && this.emit({
        kind: "milestone",
        name: "broadcast-abort",
        detail: `affordance=${t.vars.Affordance ?? "-"} partner stopped advertising`,
        affordance: t.vars.Affordance,
        side: "client",
        behavior: this.varString(t, "Behavior"),
        x: this.x,
        y: this.y,
        leaf: this.leafLabel()
      }), this.popActionStack();
      return;
    }
    if (this.isInteract(e) && (!this.interaction.available || !this.interaction.started || !this.interaction.ongoing)) {
      this.popActionStack();
      return;
    }
    if (this.isInteract(e) && (this.interactionCooldownUntil = this.tickCount + h.animationConfig.interactionCooldown(this.mascotName)), this.isDraggedAction(e)) {
      if (!this.isDragging) {
        this.setBehavior("Thrown", "drag-release");
        return;
      }
      if (Math.abs(this.cursorTickDX) >= xe ? this.dragStillTicks = 0 : this.dragStillTicks++, this.dragStillTicks >= b.dragResistTicks) {
        this.emit({
          kind: "milestone",
          name: "drag-resist",
          detail: `held still for ${b.dragResistTicks} ticks`,
          x: this.x,
          y: this.y,
          leaf: this.leafLabel()
        }), this.popActionStack();
        return;
      }
    }
    if (this.isResistAction(e) && Math.abs(this.simulationCursorVirtual().x - this.x) >= b.dragResistAbortPx) {
      this.dragStillTicks = 0, this.setBehavior("Dragged", "resist-abort");
      return;
    }
    if (t.bornTick === this.tickCount) return;
    const i = this.activeAnimation(t);
    i && t.animation !== i && (t.animation = i, t.poseIndex = 0, t.poseTick = 0);
    const s = (i == null ? void 0 : i.poses) || e.poses || [];
    if (!s.length) {
      this.popActionStack();
      return;
    }
    if (t.durationLimit === null) {
      const f = h.animationConfig.durationTicks(this.mascotName, e.name);
      f !== null ? t.durationLimit = f : e.type === "Stay" && (t.durationLimit = this.scaledTicks(this.varNumber(t, "Duration") ?? b.stayDurationTicks));
    }
    if (t.elapsed++, t.poseTick++, t.durationLimit !== null && t.elapsed >= t.durationLimit && !this.holdingClaim(t)) {
      this.popActionStack();
      return;
    }
    const r = s[t.poseIndex] ?? s[0];
    if (!r) {
      this.popActionStack();
      return;
    }
    if (t.poseTick >= Math.max(1, r.duration) && (t.poseTick = 0, t.poseIndex++, t.poseIndex >= s.length)) {
      if (t.poseIndex = 0, this.isResistAction(e)) {
        this.endDrag(), this.emit({
          kind: "milestone",
          name: "resist-escape",
          detail: "struggle finished, mascot broke free",
          x: this.x,
          y: this.y,
          leaf: this.leafLabel()
        }), this.setBehavior("Thrown", "resist-escape");
        return;
      }
      const f = this.isFallLike(e) || this.isJumpLike(e) && this.hasTarget(t), d = this.isScanMove(e) && !!((l = t.client) != null && l.connected);
      if (!e.loop && !this.isDraggedAction(e) && !d && !this.holdingClaim(t) && !this.hasTarget(t) && t.durationLimit === null && !f) {
        const p = this.isInteract(e) ? this.varString(t, "Behavior") : "";
        if (p) {
          this.setBehavior(p, "interact-behavior");
          return;
        }
        this.popActionStack();
      }
    }
  }
  popActionStack() {
    const t = this.actionStack.pop();
    this.releaseFrame(t), this.actionStack.length || (this.interaction.finalize(), this.onBehaviorEnd("behavior-end"));
  }
  currentPose() {
    const t = this.actionStack[this.actionStack.length - 1];
    if (!t) return;
    const e = this.activeAnimation(t), i = (e == null ? void 0 : e.poses) || t.node.poses || [];
    return i[t.poseIndex] || i[0];
  }
  currentLeaf() {
    var t;
    return (t = this.actionStack[this.actionStack.length - 1]) == null ? void 0 : t.node;
  }
  borderTypeSatisfied(t) {
    const e = this.environment(), i = { x: this.x, y: this.y };
    return t ? t === "Floor" ? e.floor.isOn(i) : t === "Wall" ? e.wall.isOn(i) : t === "Ceiling" ? e.ceiling.isOn(i) : !1 : !0;
  }
  /** Actions that end when they touch the floor. `Thrown`/`Fall` are Sequence
   *  behaviours whose Falling child does the physics, so only the fall action
   *  itself (and the embedded Fall class) counts here. */
  isFallLike(t) {
    var e;
    return t ? !!((e = t.className) != null && e.endsWith(".Fall")) || t.name === "Falling" : !1;
  }
  /** Actions that end when they reach their target. */
  isJumpLike(t) {
    var e;
    return t ? !!((e = t.className) != null && e.endsWith(".Jump")) || t.name === "Jumping" : !1;
  }
  /** An action with a usable TargetX/TargetY runs until it arrives there, so its
   *  animation must be allowed to loop instead of ending the action.
   *
   *  The value is what counts, not the presence of the attribute: the packs
   *  contain a broken target expression (`Math.random*100` in ClimbAlongWall)
   *  that evaluates to NaN. Treating "attribute present" as "seeking a target"
   *  while the movement code sees no target made the action impossible to
   *  finish, which left the mascot pressed against a border for ever. */
  hasTarget(t) {
    return this.varNumber(t, "TargetX") !== null || this.varNumber(t, "TargetY") !== null;
  }
  /** libshijima's action classes for the drag: `Pinched` is `...Dragged` (follows
   *  the cursor and times the struggle) and `Resisting` is `...Regist` (breaks free). */
  isDraggedAction(t) {
    var e;
    return !!((e = t == null ? void 0 : t.className) != null && e.endsWith(".Dragged"));
  }
  isResistAction(t) {
    var e;
    return !!((e = t == null ? void 0 : t.className) != null && e.endsWith(".Regist"));
  }
  /** `com.group_finity.mascot.action.Offset` — an instant anchor translation. */
  isOffsetAction(t) {
    var e;
    return !!t && (((e = t.className) == null ? void 0 : e.endsWith(".Offset")) === !0 || t.name === "Offset");
  }
  /** Affordance actions. The scan side (`ScanMove`) walks to somebody else's
   *  advertisement; the interaction side (`Interact`) runs alongside the partner. */
  isScanMove(t) {
    var e;
    return !!((e = t == null ? void 0 : t.className) != null && e.endsWith(".ScanMove"));
  }
  isInteract(t) {
    var e;
    return !!((e = t == null ? void 0 : t.className) != null && e.endsWith(".Interact"));
  }
  /** Actions whose mascot-level feature this port does not implement. */
  isUnsupportedAction(t) {
    var e;
    return !!((e = t == null ? void 0 : t.className) != null && e.endsWith(".Breed"));
  }
  actionTreeMatches(t, e, i = /* @__PURE__ */ new Set()) {
    var s;
    if (i.has(t)) return !1;
    if (i.add(t), e(t)) return !0;
    if (t.type === "ActionReference" && t.referenceName) {
      const r = (s = this.config) == null ? void 0 : s.actions[t.referenceName];
      if (r && this.actionTreeMatches(r, e, i)) return !0;
    }
    for (const r of t.children || [])
      if (this.actionTreeMatches(r, e, i)) return !0;
    return !1;
  }
  /**
   * Which border a behaviour *starts* on: the first `BorderType` its action tree
   * requires, in the order libshijima evaluates them. Returns `FLEXIBLE_BORDER` when
   * an `Offset` comes first (the behaviour can begin anywhere), or `null` when the
   * behaviour needs no border at all.
   */
  firstBorderOf(t) {
    var r;
    const e = this.borderStartCache.get(t);
    if (e !== void 0) return e;
    const i = (r = this.config) == null ? void 0 : r.actions[t], s = i ? this.firstBorderInTree(i, /* @__PURE__ */ new Set()) : null;
    return this.borderStartCache.set(t, s), s;
  }
  firstBorderInTree(t, e) {
    var s, r;
    if (e.has(t)) return null;
    e.add(t);
    const i = (s = t.attributes) == null ? void 0 : s.BorderType;
    if (typeof i == "string" && i.trim() !== "") return i.trim();
    if (this.isOffsetAction(t)) return ut;
    if (t.type === "ActionReference" && t.referenceName) {
      const o = (r = this.config) == null ? void 0 : r.actions[t.referenceName];
      if (o) {
        const a = this.firstBorderInTree(o, e);
        if (a) return a;
      }
    }
    for (const o of t.children || []) {
      const a = this.firstBorderInTree(o, e);
      if (a) return a;
    }
    return null;
  }
  /** A border the mascot is standing on right now, other than the one it just lost. */
  currentBorderAt(t) {
    const e = this.surfaceAt(), i = e === "floor" ? "Floor" : e === "ceiling" ? "Ceiling" : e ? "Wall" : null;
    if (i && i !== t) return i;
    const s = { x: this.x, y: this.y }, r = this.area();
    return t !== "Floor" && this.borderIsOn("bottom", s, r) ? "Floor" : t !== "Wall" && (this.borderIsOn("left", s, r) || this.borderIsOn("right", s, r)) ? "Wall" : t !== "Ceiling" && this.borderIsOn("top", s, r) ? "Ceiling" : null;
  }
  /** The surface currently supporting the anchor, preserving the active side at corners. */
  surfaceAt(t = { x: this.x, y: this.y }, e = this.area()) {
    var l;
    const i = this.borderIsOn("bottom", t, e), s = this.borderIsOn("left", t, e), r = this.borderIsOn("right", t, e), o = this.borderIsOn("top", t, e), a = (l = this.currentLeaf()) == null ? void 0 : l.borderType;
    return a === "Floor" && i ? "floor" : a === "Wall" && (s || r) ? s ? "left-wall" : "right-wall" : a === "Ceiling" && o ? "ceiling" : this.lastSurface === "floor" && i ? "floor" : this.lastSurface === "left-wall" && s ? "left-wall" : this.lastSurface === "right-wall" && r ? "right-wall" : this.lastSurface === "ceiling" && o ? "ceiling" : i ? "floor" : s ? "left-wall" : r ? "right-wall" : o ? "ceiling" : null;
  }
  /** Detach from the current surface before starting Fall; Fall tests contact first. */
  detachAndFall(t, e) {
    const i = this.area(), s = 2;
    t === "floor" && this.y >= i.bottom ? this.y = Math.max(i.top, i.bottom - s) : t === "left-wall" ? this.x = Math.min(i.right, i.left + s) : t === "right-wall" ? this.x = Math.max(i.left, i.right - s) : t === "ceiling" && (this.y = Math.min(i.bottom, i.top + s)), this.vx = 0, this.vy = 0, this.lastSurface = null, this.setBehavior("Fall", e);
  }
  /** Consume one scroll gesture or direction change after applying its page shift. */
  applyScrollIntent(t) {
    var s, r;
    if (this.isDragging) return;
    this.scrollStopPending && (this.scrollStopPending = !1, this.scrollGestureDirection = 0, this.scrollHold === "resting" && (this.scrollHold = "none", ((s = this.currentBehavior) == null ? void 0 : s.name) === "SitDown" && this.surfaceAt() === "floor" && this.setBehavior("StandUp", "scroll-stop")));
    const e = this.scrollDirection;
    if (!this.isScrolling || e === 0 || e === this.scrollGestureDirection) return;
    this.scrollGestureDirection = e;
    const i = t ?? this.lastSurface ?? this.surfaceAt();
    if (e < 0 && i === "floor") {
      this.scrollHold = "resting", ((r = this.currentBehavior) == null ? void 0 : r.name) !== "SitDown" && this.setBehavior("SitDown", "scroll-up-sitdown");
      return;
    }
    this.scrollHold = "none", i && this.detachAndFall(i, e > 0 ? "scroll-down-fall" : "scroll-up-surface-drop");
  }
  /** Can this behaviour actually move the mascot? Used to guarantee that the
   *  mascot goes somewhere after standing still for a while. */
  canTravel(t) {
    const e = this.travelStructure(t);
    return e.moves ? !0 : e.scans ? this.partnerReachable() : !1;
  }
  /** Structural part of `canTravel`: does the tree contain a Move / a ScanMove? */
  travelStructure(t) {
    var r;
    const e = this.travelCache.get(t);
    if (e) return e;
    const i = (r = this.config) == null ? void 0 : r.actions[t], s = {
      moves: i ? this.actionTreeMatches(i, (o) => o.type === "Move") : !1,
      scans: i ? this.actionTreeMatches(i, (o) => this.isScanMove(o)) : !1
    };
    return this.travelCache.set(t, s), s;
  }
  /** Does this behaviour only make sense with a second mascot around? */
  needsPartnerToAct(t) {
    var r;
    const e = this.partnerCache.get(t);
    if (e !== void 0) return e;
    const i = (r = this.config) == null ? void 0 : r.actions[t];
    let s = !1;
    return i && (s = this.actionTreeMatches(
      i,
      (o) => {
        var a;
        return this.isScanMove(o) || this.isInteract(o) || typeof ((a = o.attributes) == null ? void 0 : a.Affordance) == "string" && o.attributes.Affordance !== "";
      }
    )), this.partnerCache.set(t, s), s;
  }
  /**
   * Selection weight after the configuration:
   *   1. an explicit `behaviorWeights` entry for this behaviour wins;
   *   2. a partner behaviour uses `partnerWeights` (alone / with partner), so the
   *      pack's 1000–3000 weights do not turn a lone page mascot into a statue;
   *   3. otherwise the pack's own Frequency.
   */
  effectiveWeight(t, e) {
    const i = h.animationConfig, s = i.weightOverride(this.mascotName, t);
    if (s !== void 0) return s;
    if (this.needsPartnerToAct(t)) {
      if (this.tickCount < this.interactionCooldownUntil) return 0;
      const r = i.partnerWeight(
        this.mascotName,
        h.liveEngines.size > 1,
        this.partnerReachable()
      );
      if (r !== null) return r;
    }
    return e;
  }
  /**
   * Is another mascot somewhere a scan could succeed right now? Mirrors the two
   * positional gates in `BroadcastManager.tryConnect`: the same surface (|Δy| ≤ 1)
   * and within the scan distance. Two mascots both walking the floor are "reachable",
   * one on the floor and one on the ceiling are not — which is what makes
   * `partnerWeights.reachable` boost exactly the hugs that can actually happen.
   */
  partnerReachable() {
    const t = h.animationConfig.scanDistancePx(this.mascotName) / this.spriteScale;
    for (const e of h.liveEngines)
      if (e !== this && !(Math.abs(e.y - this.y) > 1) && !(Math.abs(e.x - this.x) > t))
        return !0;
    return !1;
  }
  /** A behavior can only be offered when its action is present and this engine
   *  can actually carry it out. */
  behaviorUsable(t) {
    var r;
    const e = this.behaviorUsability.get(t.name);
    if (e !== void 0) return e;
    const i = (r = this.config) == null ? void 0 : r.actions[t.name];
    let s = !!i;
    return i && this.actionTreeMatches(i, (o) => this.isUnsupportedAction(o)) && (s = !1), this.behaviorUsability.set(t.name, s), s;
  }
  /** Stop an action that keeps trying to move but never gets anywhere: a target
   *  it can never reach, or a border it is pressed against. */
  guardStall(t) {
    if (t) {
      if (t.progressX === this.x && t.progressY === this.y) {
        t.stallTicks++, t.stallTicks >= ye && this.popActionStack();
        return;
      }
      t.progressX = this.x, t.progressY = this.y, t.stallTicks = 0;
    }
  }
  /** Apply the configuration's duration multiplier to a pack hold time. */
  scaledTicks(t) {
    return Math.max(1, Math.round(t * h.animationConfig.scale(this.mascotName)));
  }
  /**
   * `maxTravelPx`: pull a wander target in so the mascot stays near where it is.
   *
   * Targets that point exactly at a border are left alone — the packs use those to
   * send a mascot to a wall ("walk to the right edge, then climb"), and clamping
   * them would break the sequence that follows. Interior targets are the "wander
   * somewhere" kind, and those are what would otherwise cross the whole page.
   */
  clampTravelTarget(t) {
    const e = h.animationConfig.maxTravelPx(this.mascotName) / this.spriteScale;
    if (e <= 0) return;
    const i = this.area(), s = t.TargetX;
    typeof s != "number" || !Number.isFinite(s) || s <= i.left + 0.5 || s >= i.right - 0.5 || (t.TargetX = Math.max(this.x - e, Math.min(this.x + e, s)));
  }
  updatePhysics() {
    var f, d, p, v, y;
    const t = this.currentLeaf();
    if (!t) return;
    if (t.borderType && !this.borderTypeSatisfied(t.borderType)) {
      this.emit({
        kind: "milestone",
        name: "border-lost",
        detail: `BorderType=${t.borderType} not satisfied`,
        x: this.x,
        y: this.y,
        leaf: this.leafLabel()
      });
      const u = this.currentBorderAt(t.borderType);
      if (u) {
        this.onBehaviorEnd(`border-change:${t.borderType}->${u}`);
        return;
      }
      this.setBehavior("Fall", `border-lost:${t.borderType}`);
      return;
    }
    const e = this.actionStack[this.actionStack.length - 1], i = this.currentPose(), s = this.varNumber(e, "TargetX"), r = this.varNumber(e, "TargetY");
    if (this.isScanMove(t)) {
      const u = e == null ? void 0 : e.client;
      if (!u || !u.connected) return;
      const g = u.target;
      if (!g) return;
      const m = this.x;
      if (i && i.velocity.x !== 0 && (this.lookRight = i.velocity.x > 0 ? g.x < this.x : g.x > this.x, this.x += (this.lookRight ? -1 : 1) * i.velocity.x), this.clampToWorkArea(), m <= g.x && this.x >= g.x || m >= g.x && this.x <= g.x) {
        this.x = g.x, u.notifyArrival(), this.interaction = u.interaction();
        const R = this.interaction.behavior;
        this.emit({
          kind: "milestone",
          name: "interaction-arrived",
          detail: `partner=(${this.toPage(g.x).toFixed(1)},${this.toPage(g.y).toFixed(1)}) behavior=${R || "-"}`,
          behavior: R || void 0,
          target: [this.toPage(g.x), this.toPage(g.y)],
          x: this.x,
          y: this.y,
          leaf: this.leafLabel()
        }), this.setBehavior(R || "StandUp", "interaction-client");
        return;
      }
      this.guardStall(e);
      return;
    }
    if (this.isFallLike(t)) {
      const u = this.environment(), g = { x: this.x, y: this.y }, m = u.floor.isOn(g), x = u.ceiling.isOn(g), R = u.wall.isOn(g), nt = x && ((f = this.currentBehavior) == null ? void 0 : f.name) !== "Fall";
      if (m || R || nt) {
        this.vx = this.vy = 0, m && (this.y = this.area().bottom), this.emit({
          kind: "milestone",
          name: "land",
          detail: `fall ended at ${m ? "floor" : nt ? "ceiling" : "wall"}`,
          x: this.x,
          y: this.y,
          leaf: this.leafLabel()
        }), this.popActionStack();
        return;
      }
      const It = this.evaluateNumber((d = t.attributes) == null ? void 0 : d.RegistanceX, e) ?? b.resistanceX, Nt = this.evaluateNumber((p = t.attributes) == null ? void 0 : p.RegistanceY, e) ?? b.resistanceY, Ot = this.evaluateNumber((v = t.attributes) == null ? void 0 : v.Gravity, e) ?? b.gravity;
      this.vx -= this.vx * It, this.vy += Ot - this.vy * Nt, this.x += this.vx, this.y += this.vy, this.clampToWorkArea();
      return;
    }
    if (this.isJumpLike(t) && s !== null && r !== null) {
      const u = s - this.x, g = r - this.y - Math.abs(u), m = Math.hypot(u, g), x = this.evaluateNumber((y = t.attributes) == null ? void 0 : y.VelocityParam, e) ?? 20;
      if (this.lookRight = u > 0, m <= x) {
        this.x = s, this.y = r, this.emit({
          kind: "milestone",
          name: "jump-arrived",
          detail: `target=(${this.toPage(s).toFixed(1)},${this.toPage(r).toFixed(1)})`,
          x: this.x,
          y: this.y,
          leaf: this.leafLabel()
        }), this.popActionStack();
        return;
      }
      this.x += x * u / m, this.y += x * g / m, this.guardStall(e);
      return;
    }
    const o = !!i && (i.velocity.x !== 0 || i.velocity.y !== 0);
    if (!!i && (t.type === "Move" || t.type === "Animate" || o)) {
      const u = this.x, g = this.y;
      if (s !== null && (i.velocity.x > 0 ? this.lookRight = s < this.x : i.velocity.x < 0 && (this.lookRight = s > this.x)), r !== null && (this.borderIsOn("left", { x: this.x, y: this.y }) && (this.lookRight = !1), this.borderIsOn("right", { x: this.x, y: this.y }) && (this.lookRight = !0)), this.x += (this.lookRight ? -1 : 1) * i.velocity.x, this.y += i.velocity.y, s !== null && (u <= s && this.x >= s || u >= s && this.x <= s)) {
        this.x = s, this.emit({
          kind: "milestone",
          name: "target-x",
          detail: `TargetX=${this.toPage(s).toFixed(1)}`,
          x: this.x,
          y: this.y,
          leaf: this.leafLabel()
        }), this.popActionStack();
        return;
      }
      if (r !== null && (g <= r && this.y >= r || g >= r && this.y <= r)) {
        this.y = r, this.emit({
          kind: "milestone",
          name: "target-y",
          detail: `TargetY=${this.toPage(r).toFixed(1)}`,
          x: this.x,
          y: this.y,
          leaf: this.leafLabel()
        }), this.popActionStack();
        return;
      }
    }
    this.clampToWorkArea();
    const l = this.currentLeaf();
    (l == null ? void 0 : l.borderType) === "Wall" && (this.borderIsOn("left", { x: this.x, y: this.y }) && (this.lookRight = !1), this.borderIsOn("right", { x: this.x, y: this.y }) && (this.lookRight = !0)), (s !== null || r !== null || o || t.type === "Move") && this.guardStall(e);
  }
  /** Clamp the viewport-space anchor into its work area. */
  clampToWorkArea() {
    const t = this.area(), e = this.x, i = this.y;
    this.x = Math.max(t.left, Math.min(t.right, this.x)), this.y = Math.max(t.top, Math.min(t.bottom, this.y)), Math.abs(this.x - e) + Math.abs(this.y - i) > 0.5 && !this.clampReported && (this.clampReported = !0, this.emit({
      kind: "milestone",
      name: "clamp",
      detail: `(${this.toPage(e).toFixed(1)},${this.toPage(i).toFixed(1)}) -> (${this.toPage(this.x).toFixed(1)},${this.toPage(this.y).toFixed(1)})`,
      x: this.x,
      y: this.y,
      leaf: this.leafLabel()
    }));
  }
  onBehaviorEnd(t = "behavior-end") {
    var p, v, y;
    if (!this.config) return;
    if (this.scrollHold === "resting" && this.isScrolling && this.scrollDirection < 0 && this.surfaceAt() === "floor") {
      this.setBehavior("SitDown", "scroll-up-hold");
      return;
    }
    const e = h.animationConfig, i = this.mascotName, s = [], r = ((p = this.currentBehavior) == null ? void 0 : p.nextBehaviors) || [], o = e.exitsToPool(i, (v = this.currentBehavior) == null ? void 0 : v.name);
    for (const u of o ? [] : r) {
      if (!this.evaluateCondition(u.condition) || !e.allows(i, u.name)) continue;
      const g = this.config.behaviors.find((x) => x.name === u.name);
      if (g && !this.behaviorUsable(g)) continue;
      const m = this.effectiveWeight(u.name, u.frequency);
      m <= 0 || s.push({ ...u, frequency: m });
    }
    if (!s.length || ((y = this.currentBehavior) == null ? void 0 : y.addNext) !== !1)
      for (const u of this.config.behaviors) {
        const g = e.weightOverride(i, u.name);
        if ((g !== void 0 ? g <= 0 : u.frequency <= 0) || !e.allows(i, u.name) || !this.evaluateCondition(u.condition) || !this.behaviorUsable(u)) continue;
        const m = this.effectiveWeight(u.name, u.frequency);
        m <= 0 || s.push({ name: u.name, id: u.id, frequency: m });
      }
    if (!s.length) {
      const u = this.config.behaviors.find((g) => g.name === "StandUp") ?? this.config.behaviors[0];
      u && this.setBehavior(u.name, "no-candidates");
      return;
    }
    let a = s;
    if (this.wantMovement) {
      this.wantMovement = !1;
      const u = s.filter((g) => this.canTravel(g.name));
      u.length > 0 && (a = u);
    }
    const l = this.currentBorderAt(void 0);
    if (l) {
      const u = a.filter((g) => {
        const m = this.firstBorderOf(g.name);
        return m === null || m === ut || m === l;
      });
      u.length > 0 && (a = u);
    }
    const f = a.reduce((u, g) => u + Math.max(0, g.frequency), 0);
    if (f <= 0) {
      this.setBehavior(a[0].name, t, a[0].id);
      return;
    }
    let d = Math.random() * f;
    for (const u of a)
      if (d -= u.frequency, d <= 0) {
        this.setBehavior(u.name, t, u.id);
        return;
      }
    this.setBehavior(s[0].name, t, s[0].id);
  }
  render(t = !0) {
    const e = this.currentPose();
    if (!e) return;
    const i = t ? Math.max(0, Math.min(1, this.accumulator / b.tickMs)) : 1, s = this.prevX + (this.x - this.prevX) * i, r = this.prevY + (this.y - this.prevY) * i, o = this.spriteScale;
    if (this.elRoot.style.transform = `translate3d(${s * o}px, ${r * o}px, 0)`, !e.image) {
      this.interactionVisualActive && (this.elImg.style.visibility = "hidden", this.elImg.removeAttribute("src"));
      return;
    }
    const a = this.spriteUrl(e.image);
    this.elImg.getAttribute("src") !== a && (this.elImg.src = a), this.elImg.complete && this.elImg.naturalWidth > 0 && (this.elImg.style.visibility = "visible"), this.elImg.naturalWidth > 0 && this.applySpriteIntrinsicSize();
    const l = e.imageAnchor.x, f = e.imageAnchor.y, d = this.lookRight ? -1 : 1;
    this.elImg.style.transform = `translate(${-d * l * o}px, ${-f * o}px) scaleX(${d * o}) scaleY(${o})`, this.elImg.style.transformOrigin = "0 0";
  }
};
/** Every live mascot, so `mascot.totalCount` means something to the packs. */
c(h, "liveEngines", /* @__PURE__ */ new Set()), /** Sprite URLs already fetched, shared by every mascot of the same pack. */
c(h, "preloaded", /* @__PURE__ */ new Set()), /** Observation points; the log recorder subscribes instead of polling. */
c(h, "observers", /* @__PURE__ */ new Set()), c(h, "nextId", 1), /** Animation customisation, shared by every mascot (see AnimationConfig). */
c(h, "animationConfig", new F()), c(h, "animationConfigLoad", null), c(h, "animationConfigSetExplicitly", !1), /**
 * Host-level answer to "should the built-in preset apply?", set through
 * `configure({ ignoreBuiltin })`. `null` means "whatever the file says", which
 * `AnimationConfig` tracks on its own.
 */
c(h, "builtinPreference", null), /** Affordance registry, shared by every mascot in the page (broadcast/manager). */
c(h, "broadcasts", new _()), c(h, "globalEventsInstalled", !1), /** Removes the reduced-motion listener again; null while none is installed. */
c(h, "reducedMotionWatcher", null), /** Default location of the editable configuration file. */
c(h, "ANIMATION_CONFIG_URL", "/animation.config.json"), /** Default base URL of the mascot packs. A hosted or embedded build overrides
 *  this so sprites never resolve against the host page's root path. */
c(h, "PACK_BASE_URL", "/mascot_pack"), /** Decided on the first load; `reloadAnimationConfig(url)` re-decides it. */
c(h, "animationConfigUrl", null), /** Overridden by the host so a pack can live anywhere; see `configure()`. */
c(h, "packBaseUrl", h.PACK_BASE_URL);
let gt = h;
export {
  F as A,
  _ as B,
  gt as M,
  Ne as a,
  Ie as b,
  Me as c,
  Pe as d,
  de as l
};
//# sourceMappingURL=MascotEngine-BegMTn5U.js.map
