// utils/polyfill.js —— 补齐微信小程序 appservice 缺失的 Web API
// 云 SDK 内部会用到 AbortController / Headers，小程序基础库没有这两个构造器。
// 必须在 require('./cloud') 之前加载本文件（见 app.js 顶部）。

// ---------- AbortSignal / AbortController ----------
if (typeof AbortController === 'undefined') {
  class AbortSignalShim {
    constructor() {
      this.aborted = false
      this.reason = undefined
      this._listeners = []
    }
    addEventListener(type, fn) {
      if (type !== 'abort' || typeof fn !== 'function') return
      if (this._listeners.indexOf(fn) < 0) this._listeners.push(fn)
    }
    removeEventListener(type, fn) {
      if (type !== 'abort') return
      const i = this._listeners.indexOf(fn)
      if (i >= 0) this._listeners.splice(i, 1)
    }
    dispatchEvent() { return true }
    _abort(reason) {
      if (this.aborted) return
      this.aborted = true
      this.reason = reason
      const ev = { type: 'abort', target: this, currentTarget: this }
      // 复制一份再遍历，避免回调里 remove 导致漏调
      this._listeners.slice().forEach(fn => { try { fn.call(this, ev) } catch (e) {} })
      this._listeners = []
    }
    static abort(reason) {
      const s = new AbortSignalShim()
      s._abort(reason)
      return s
    }
    static timeout() {
      // 小程序环境不常用，返回未中断信号即可
      return new AbortSignalShim()
    }
  }
  class AbortControllerShim {
    constructor() { this.signal = new AbortSignalShim() }
    abort(reason) { this.signal._abort(reason) }
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.AbortController = AbortControllerShim
    globalThis.AbortSignal = AbortSignalShim
  }
  // 兼容部分基础库里 globalThis 指向不一致的情况
  try { AbortController = AbortControllerShim; AbortSignal = AbortSignalShim } catch (e) {}
}

// ---------- Headers ----------
if (typeof Headers === 'undefined') {
  class HeadersShim {
    constructor(init) {
      this._map = {}
      if (init instanceof HeadersShim) {
        Object.assign(this._map, init._map)
      } else if (init && typeof init === 'object') {
        if (Array.isArray(init)) {
          init.forEach(pair => { if (pair && pair.length >= 2) this.set(pair[0], pair[1]) })
        } else {
          Object.keys(init).forEach(k => this.set(k, init[k]))
        }
      }
    }
    _key(k) { return String(k).toLowerCase() }
    set(k, v) { this._map[this._key(k)] = String(v) }
    get(k) { const v = this._map[this._key(k)]; return v === undefined ? null : v }
    has(k) { return this._key(k) in this._map }
    delete(k) { delete this._map[this._key(k)] }
    append(k, v) {
      const key = this._key(k)
      const old = this._map[key]
      this._map[key] = old ? old + ', ' + String(v) : String(v)
    }
    forEach(cb) { Object.keys(this._map).forEach(k => cb(this._map[k], k, this)) }
    keys() { return Object.keys(this._map)[Symbol.iterator]() }
    values() { return Object.keys(this._map).map(k => this._map[k])[Symbol.iterator]() }
    entries() { return Object.keys(this._map).map(k => [k, this._map[k]])[Symbol.iterator]() }
    [Symbol.iterator]() { return this.entries() }
  }
  if (typeof globalThis !== 'undefined') globalThis.Headers = HeadersShim
  try { Headers = HeadersShim } catch (e) {}
}

module.exports = {}
