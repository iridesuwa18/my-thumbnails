/* ═══════════════════════════════════════════════════════════════
   THUMBCRAFT CORE ENGINE
   Shared by desktop.js and mobile.js. Owns: canvas rendering, layer
   data model, coordinate math, history, autosave, and GitHub-backed
   per-file preset storage. UI-specific code (panels, drawers, DOM
   layout) lives in desktop.js / mobile.js and talks to this file
   only through the TC.* API + TC.on(event, cb) subscriptions.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const W = 1280, H = 720;

  // ── STATE ─────────────────────────────────────────────────────
  let layers = [];
  let selected = null;
  let nextId = 1;

  let bg = {
    color: '#1a1a2e',
    imageSrc: '', imageName: '',
    zoom: 1, offsetX: 0, offsetY: 0, rotation: 0,
    overlayColor: '#000000', overlayOpacity: 0,
    blur: 0, brightness: 100, contrast: 100, saturate: 100
  };
  let bgImageObj = null;
  // Bumped every time a new bg-image load starts (preset load, manual upload,
  // or clear). Each in-flight Image.onload checks its own captured token
  // against this before applying — so a slow-loading image from a preset you
  // switched away from can no longer overwrite the one you switched to.
  let bgLoadToken = 0;

  let zoomLevel = 0.5, panX = 0, panY = 0;
  let isPanning = false, spaceDown = false;
  let viewLocked = false;
  let snapEnabled = true;

  let dragging = false, dragOffX = 0, dragOffY = 0, dragMoved = false;

  let history = [], historyIdx = -1;
  const MAX_HISTORY = 60;

  let presets = [];
  let ghConfig = { token: '', repo: '', folder: 'presets', legacyPath: 'presets.json' };

  // transform widget state
  let transformMode = 'resize'; // 'resize' | 'rotate'
  let transformBaseline = null;

  let canvasEl, ctx, wrapperEl, viewportEl;

  const listeners = {};
  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
  function emit(evt, data) { (listeners[evt] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

  // ── UTIL ──────────────────────────────────────────────────────
  function uid() { return nextId++; }
  function esc(s) { return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function toHex(c) {
    if (!c) return '#000000';
    if (c[0] === '#') return c.length === 7 ? c : '#000000';
    const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    if (!m) return '#000000';
    return '#' + [1, 2, 3].map(i => (+m[i]).toString(16).padStart(2, '0')).join('');
  }
  function getAlpha(c) {
    if (!c) return 1;
    const m = c.match(/rgba\([\d.]+,\s*[\d.]+,\s*[\d.]+,\s*([\d.]+)\)/);
    return m ? +m[1] : 1;
  }
  function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  // ── INIT ──────────────────────────────────────────────────────
  function init(opts) {
    canvasEl = opts.canvas; wrapperEl = opts.wrapper; viewportEl = opts.viewport;
    ctx = canvasEl.getContext('2d');
    loadLocalProject();
    loadGhConfigLocal();
    applyZoom();
    render();
    captureState();
    emit('ready');
  }

  // ── HISTORY ───────────────────────────────────────────────────
  function captureState() {
    const state = serializeProject();
    state.selectedId = selected ? selected.id : null;
    history = history.slice(0, historyIdx + 1);
    history.push(state);
    if (history.length > MAX_HISTORY) history.shift(); else historyIdx++;
    emit('history', { canUndo: canUndo(), canRedo: canRedo() });
  }
  function canUndo() { return historyIdx > 0; }
  function canRedo() { return historyIdx < history.length - 1; }
  function undo() { if (!canUndo()) return; historyIdx--; restoreState(history[historyIdx]); emit('history', { canUndo: canUndo(), canRedo: canRedo() }); emit('toast', { msg: 'Undone', type: 'info' }); }
  function redo() { if (!canRedo()) return; historyIdx++; restoreState(history[historyIdx]); emit('history', { canUndo: canUndo(), canRedo: canRedo() }); emit('toast', { msg: 'Redone', type: 'info' }); }

  function restoreState(state) {
    loadProjectData(state, { keepHistory: true });
    selected = state.selectedId ? (layers.find(l => l.id === state.selectedId) || null) : null;
    recalcTransformBaseline();
    syncAll();
  }

  function syncAll() { render(); emit('change'); scheduleAutosave(); }

  // ── SERIALIZE / LOAD PROJECT ──────────────────────────────────
  function serializeProject() {
    return {
      bg: { ...bg },
      layers: layers.map(stripRuntime),
      canvas: { w: W, h: H }
    };
  }
  function stripRuntime(l) {
    const { imgObj, ...rest } = l;
    return JSON.parse(JSON.stringify(rest));
  }
  function loadProjectData(data, opts) {
    opts = opts || {};
    const token = ++bgLoadToken;
    bg = { ...bg, ...(data.bg || {}) };
    if (bg.imageSrc) {
      const img = new Image();
      img.onload = () => { if (token !== bgLoadToken) return; bgImageObj = img; render(); };
      img.src = bg.imageSrc;
    } else { bgImageObj = null; }
    layers = (data.layers || []).map(l => {
      const layer = { ...l };
      if (layer.type === 'image' && layer.src) {
        const img = new Image();
        img.onload = () => { layer.imgObj = img; render(); };
        img.src = layer.src;
      }
      return layer;
    });
    nextId = layers.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
    if (!opts.keepHistory) { selected = null; captureState(); }
    render();
    emit('change');
  }
  function newCanvas() {
    layers = []; selected = null;
    bg = { color: '#1a1a2e', imageSrc: '', imageName: '', zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, overlayColor: '#000000', overlayOpacity: 0, blur: 0, brightness: 100, contrast: 100, saturate: 100 };
    bgImageObj = null;
    captureState(); syncAll();
  }

  // ── LOCAL AUTOSAVE ────────────────────────────────────────────
  const scheduleAutosave = debounce(saveLocalProject, 400);
  function saveLocalProject() {
    try {
      localStorage.setItem('tc_project_v2', JSON.stringify(serializeProject()));
      localStorage.setItem('tc_presets_v2', JSON.stringify(presets));
      emit('autosaved', { at: Date.now() });
    } catch (e) { console.error('autosave failed', e); }
  }
  function loadLocalProject() {
    try {
      const raw = localStorage.getItem('tc_project_v2');
      if (raw) { loadProjectData(JSON.parse(raw), { keepHistory: true }); }
      const p = localStorage.getItem('tc_presets_v2');
      if (p) presets = JSON.parse(p);
      else {
        // migrate from the old pre-rewrite localStorage keys if present
        const legacyPresets = localStorage.getItem('tc_presets');
        if (legacyPresets) { try { presets = JSON.parse(legacyPresets); } catch (e) {} }
        const legacyLayers = localStorage.getItem('tc_layers');
        if (!raw && legacyLayers) {
          try {
            const oldLayers = JSON.parse(legacyLayers);
            const oldBgColor = localStorage.getItem('tc_bgcolor');
            const oldBgImg = localStorage.getItem('tc_bgimage');
            const oldBgState = localStorage.getItem('tc_bgstate');
            const bgs = oldBgState ? JSON.parse(oldBgState) : {};
            loadProjectData({
              layers: oldLayers,
              bg: { color: oldBgColor || '#1a1a2e', imageSrc: oldBgImg || '', ...bgs }
            }, { keepHistory: true });
          } catch (e) {}
        }
      }
    } catch (e) { console.error('load local failed', e); }
  }

  // ── ZOOM / PAN ────────────────────────────────────────────────
  function applyZoom() {
    if (!wrapperEl) return;
    wrapperEl.style.width = (W * zoomLevel) + 'px';
    wrapperEl.style.height = (H * zoomLevel) + 'px';
    canvasEl.style.width = (W * zoomLevel) + 'px';
    canvasEl.style.height = (H * zoomLevel) + 'px';
    applyPan();
    emit('zoom', { zoom: zoomLevel });
  }
  function applyPan() {
    if (!viewportEl || !wrapperEl) return;
    wrapperEl.style.position = 'absolute';
    wrapperEl.style.left = (viewportEl.clientWidth / 2 - (W * zoomLevel) / 2 + panX) + 'px';
    wrapperEl.style.top = (viewportEl.clientHeight / 2 - (H * zoomLevel) / 2 + panY) + 'px';
  }
  function zoomIn() { const prev = zoomLevel; zoomLevel = clamp(+(zoomLevel + 0.15).toFixed(2), 0.1, 3); panX *= zoomLevel / prev; panY *= zoomLevel / prev; applyZoom(); }
  function zoomOut() { const prev = zoomLevel; zoomLevel = clamp(+(zoomLevel - 0.15).toFixed(2), 0.1, 3); panX *= zoomLevel / prev; panY *= zoomLevel / prev; applyZoom(); }
  function setZoom(z) { const prev = zoomLevel; zoomLevel = clamp(+z.toFixed(2), 0.1, 3); panX *= zoomLevel / prev; panY *= zoomLevel / prev; applyZoom(); }
  function zoomFit() {
    if (!viewportEl) return;
    zoomLevel = +Math.min((viewportEl.clientWidth - 40) / W, (viewportEl.clientHeight - 40) / H, 1).toFixed(2);
    panX = 0; panY = 0; applyZoom();
  }
  function pan(dx, dy) { panX += dx; panY += dy; applyPan(); }
  function getZoom() { return zoomLevel; }
  function toggleSnap() { snapEnabled = !snapEnabled; emit('snap', { enabled: snapEnabled }); }
  function getSnap() { return snapEnabled; }
  function setViewLock(v) { viewLocked = v; emit('viewlock', { locked: v }); }
  function getViewLock() { return viewLocked; }

  // ── COORD MATH ────────────────────────────────────────────────
  function screenToCanvas(clientX, clientY) {
    const r = canvasEl.getBoundingClientRect();
    return { x: (clientX - r.left) / zoomLevel, y: (clientY - r.top) / zoomLevel };
  }
  function canvasToScreen(pt) {
    const r = canvasEl.getBoundingClientRect();
    return { x: r.left + pt.x * zoomLevel, y: r.top + pt.y * zoomLevel };
  }

  // ── RENDER ────────────────────────────────────────────────────
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    const filt = `blur(${bg.blur || 0}px) brightness(${bg.brightness ?? 100}%) contrast(${bg.contrast ?? 100}%) saturate(${bg.saturate ?? 100}%)`;
    if (bgImageObj) {
      ctx.filter = filt;
      ctx.save();
      ctx.translate(W / 2 + bg.offsetX, H / 2 + bg.offsetY);
      ctx.rotate(bg.rotation * Math.PI / 180);
      ctx.scale(bg.zoom, bg.zoom);
      const iw = bgImageObj.naturalWidth || bgImageObj.width, ih = bgImageObj.naturalHeight || bgImageObj.height;
      const scale = Math.max(W / iw, H / ih);
      const dw = iw * scale, dh = ih * scale;
      ctx.drawImage(bgImageObj, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
      ctx.filter = 'none';
    } else {
      ctx.fillStyle = bg.color; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    if (bg.overlayOpacity > 0) {
      ctx.save(); ctx.globalAlpha = bg.overlayOpacity / 100;
      ctx.fillStyle = bg.overlayColor; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    [...layers].reverse().forEach(l => {
      if (!l.visible) return;
      ctx.save();
      ctx.globalAlpha = (l.opacity ?? 100) / 100;
      const rot = (l.rotation || 0) * Math.PI / 180;
      const b = getBoundsRaw(l);
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      ctx.translate(cx, cy); ctx.rotate(rot); ctx.translate(-cx, -cy);
      if (l.type === 'rect') drawRect(l);
      else if (l.type === 'ellipse') drawEllipse(l);
      else if (l.type === 'triangle') drawTriangle(l);
      else if (l.type === 'line') drawLine(l);
      else if (l.type === 'text') drawText(l);
      else if (l.type === 'image' && l.imgObj) ctx.drawImage(l.imgObj, l.x, l.y, l.w, l.h);
      if (selected && selected.id === l.id) drawSelectionOutline(l, b);
      ctx.restore();
    });
    emit('rendered');
  }

  function drawRect(l) {
    if (l.fill) { ctx.fillStyle = l.fill; roundRect(l.x, l.y, l.w, l.h, l.radius || 0); ctx.fill(); }
    if (l.stroke && l.strokeW > 0) { ctx.strokeStyle = l.stroke; ctx.lineWidth = l.strokeW; roundRect(l.x, l.y, l.w, l.h, l.radius || 0); ctx.stroke(); }
  }
  function roundRect(x, y, w, h, r) {
    if (!r) { ctx.beginPath(); ctx.rect(x, y, w, h); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }
  function drawEllipse(l) {
    ctx.beginPath(); ctx.ellipse(l.x + l.w / 2, l.y + l.h / 2, Math.abs(l.w) / 2, Math.abs(l.h) / 2, 0, 0, Math.PI * 2);
    if (l.fill) { ctx.fillStyle = l.fill; ctx.fill(); }
    if (l.stroke && l.strokeW > 0) { ctx.strokeStyle = l.stroke; ctx.lineWidth = l.strokeW; ctx.stroke(); }
  }
  function drawTriangle(l) {
    ctx.beginPath(); ctx.moveTo(l.x + l.w / 2, l.y); ctx.lineTo(l.x + l.w, l.y + l.h); ctx.lineTo(l.x, l.y + l.h); ctx.closePath();
    if (l.fill) { ctx.fillStyle = l.fill; ctx.fill(); }
    if (l.stroke && l.strokeW > 0) { ctx.strokeStyle = l.stroke; ctx.lineWidth = l.strokeW; ctx.stroke(); }
  }
  function drawLine(l) {
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x2, l.y2);
    ctx.strokeStyle = l.stroke || '#ffffff'; ctx.lineWidth = l.strokeW || 4; ctx.stroke();
  }
  function fontString(l) {
    const sz = l.fontSize || 72;
    const fw = l.fontWeight || (l.bold ? '700' : '400');
    return `${fw} ${sz}px "${l.fontFamily || 'Bebas Neue'}",Impact,sans-serif`;
  }
  function drawText(l) {
    ctx.font = fontString(l);
    try { ctx.letterSpacing = (l.letterSpacing || 0) + 'px'; } catch (e) {}
    const sz = l.fontSize || 72;
    const lineH = sz * (l.lineHeight || 1.2);
    const lines = (l.text || 'Text').split('\n');
    const hAlign = l.textAlign || 'left';
    const maxW = Math.max(...lines.map(ln => ctx.measureText(ln).width));
    const totalH = lineH * lines.length;
    let drawX = l.x;
    ctx.textAlign = hAlign;
    if (hAlign === 'center') drawX = l.x + maxW / 2;
    else if (hAlign === 'right') drawX = l.x + maxW;
    let drawY = l.y;
    ctx.textBaseline = 'top';
    if (l.textStyle === 'outline') {
      ctx.strokeStyle = l.color || '#ffffff'; ctx.lineWidth = l.outlineW || 6;
      lines.forEach((ln, i) => ctx.strokeText(ln, drawX, drawY + i * lineH));
    } else if (l.textStyle === 'badge') {
      const bw = Math.max(...lines.map(ln => ctx.measureText(ln).width));
      const pad = 14;
      ctx.fillStyle = l.bgFill || '#f5c518';
      roundRect(l.x - pad, l.y - pad / 2, bw + pad * 2, totalH + pad, 6); ctx.fill();
      ctx.fillStyle = l.color || '#000000';
      lines.forEach((ln, i) => ctx.fillText(ln, drawX, drawY + i * lineH));
    } else {
      if (l.shadow) {
        ctx.shadowColor = l.shadowColor || 'rgba(0,0,0,0.9)'; ctx.shadowBlur = l.shadowBlur || 12;
        ctx.shadowOffsetX = l.shadowX || 3; ctx.shadowOffsetY = l.shadowY || 3;
      }
      lines.forEach((ln, i) => {
        if ((l.outlineW || 0) > 0) { ctx.strokeStyle = l.outlineColor || '#000000'; ctx.lineWidth = l.outlineW; ctx.strokeText(ln, drawX, drawY + i * lineH); }
        ctx.fillStyle = l.color || '#ffffff'; ctx.fillText(ln, drawX, drawY + i * lineH);
      });
      ctx.shadowColor = 'transparent';
    }
    ctx.textAlign = 'left';
    try { ctx.letterSpacing = '0px'; } catch (e) {}
  }
  function drawSelectionOutline(l, b) {
    const p = 6;
    ctx.strokeStyle = '#f5c518'; ctx.lineWidth = 1.5 / zoomLevel > 3 ? 1.5 : 1.5; ctx.setLineDash([4, 3]);
    ctx.strokeRect(b.x - p, b.y - p, b.w + p * 2, b.h + p * 2);
    ctx.setLineDash([]);
  }

  // ── BOUNDS / HIT TEST ─────────────────────────────────────────
  function getBoundsRaw(l) {
    if (l.type === 'text') {
      ctx.font = fontString(l);
      const sz = l.fontSize || 72;
      const lines = (l.text || 'Text').split('\n');
      const maxW = Math.max(...lines.map(ln => ctx.measureText(ln).width));
      return { x: l.x, y: l.y, w: maxW || 10, h: sz * (l.lineHeight || 1.2) * lines.length };
    }
    if (l.type === 'line') {
      return { x: Math.min(l.x, l.x2), y: Math.min(l.y, l.y2), w: Math.abs(l.x2 - l.x) || 1, h: Math.abs(l.y2 - l.y) || 1 };
    }
    return { x: l.x, y: l.y, w: l.w || 100, h: l.h || 100 };
  }
  function toLocalPos(pos, l) {
    const b = getBoundsRaw(l), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const rot = -(l.rotation || 0) * Math.PI / 180;
    const dx = pos.x - cx, dy = pos.y - cy;
    return { x: dx * Math.cos(rot) - dy * Math.sin(rot) + cx, y: dx * Math.sin(rot) + dy * Math.cos(rot) + cy };
  }
  function hitTest(l, p) {
    const lp = toLocalPos(p, l), b = getBoundsRaw(l);
    if (l.type === 'line') {
      const dist = distToSegment(lp, { x: l.x, y: l.y }, { x: l.x2, y: l.y2 });
      return dist < Math.max(8, (l.strokeW || 4));
    }
    return lp.x >= b.x && lp.x <= b.x + b.w && lp.y >= b.y && lp.y <= b.y + b.h;
  }
  function distToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = clamp(t, 0, 1);
    const px = a.x + t * dx, py = a.y + t * dy;
    return Math.hypot(p.x - px, p.y - py);
  }
  function hitTestTopmost(p) {
    for (const l of layers) { if (l.visible && hitTest(l, p)) return l; }
    return null;
  }

  // ── LAYER CRUD ────────────────────────────────────────────────
  function viewCenter() {
    if (!viewportEl) return { x: W / 2, y: H / 2 };
    const cx = (viewportEl.clientWidth / 2 - (viewportEl.clientWidth / 2 - (W * zoomLevel) / 2 + panX)) / zoomLevel;
    const cy = (viewportEl.clientHeight / 2 - (viewportEl.clientHeight / 2 - (H * zoomLevel) / 2 + panY)) / zoomLevel;
    return { x: clamp(cx, 60, W - 60), y: clamp(cy, 60, H - 60) };
  }
  function addLayer(partial) {
    const l = { id: uid(), visible: true, locked: false, opacity: 100, rotation: 0, ...partial };
    layers.unshift(l);
    selectLayer(l.id);
    captureState(); syncAll();
    return l;
  }
  function addText() {
    const { x, y } = viewCenter();
    return addLayer({ type: 'text', name: 'Text', text: 'NEW TEXT', x: x - 100, y: y - 40, fontSize: 80, fontFamily: 'Bebas Neue', fontWeight: '400', color: '#ffffff', letterSpacing: 0, outlineW: 4, outlineColor: '#000000', shadow: true, shadowColor: 'rgba(0,0,0,0.85)', shadowBlur: 10, shadowX: 3, shadowY: 3, textStyle: 'normal', lineHeight: 1.2, textAlign: 'left', bgFill: '#f5c518' });
  }
  function addRect() { const { x, y } = viewCenter(); return addLayer({ type: 'rect', name: 'Rectangle', x: x - 160, y: y - 65, w: 320, h: 130, fill: 'rgba(245,197,24,0.85)', stroke: '#000000', strokeW: 0, radius: 0 }); }
  function addEllipse() { const { x, y } = viewCenter(); return addLayer({ type: 'ellipse', name: 'Ellipse', x: x - 150, y: y - 100, w: 300, h: 200, fill: 'rgba(232,67,147,0.75)', stroke: '#ffffff', strokeW: 0 }); }
  function addTriangle() { const { x, y } = viewCenter(); return addLayer({ type: 'triangle', name: 'Triangle', x: x - 100, y: y - 90, w: 200, h: 180, fill: 'rgba(255,71,87,0.85)', stroke: '#000', strokeW: 0 }); }
  function addLine() { const { x, y } = viewCenter(); return addLayer({ type: 'line', name: 'Line', x: x - 200, y: y, x2: x + 200, y2: y, stroke: '#f5c518', strokeW: 6 }); }
  function addImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 460;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = img.width * scale, h = img.height * scale;
          const { x, y } = viewCenter();
          const l = addLayer({ type: 'image', name: file.name.replace(/\.[^.]+$/, ''), x: x - w / 2, y: y - h / 2, w, h, src: e.target.result });
          l.imgObj = img;
          render();
          resolve(l);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  function selectLayer(id) {
    selected = id == null ? null : (layers.find(l => l.id === id) || null);
    transformMode = 'resize';
    recalcTransformBaseline();
    render(); emit('select', selected);
  }
  function getSelected() { return selected; }
  function getLayers() { return layers; }
  function deleteLayer(id) {
    layers = layers.filter(l => l.id !== id);
    if (selected && selected.id === id) selected = null;
    captureState(); syncAll();
  }
  function deleteSelected() { if (selected) deleteLayer(selected.id); }
  function toggleVisibility(id) { const l = layers.find(x => x.id === id); if (l) { l.visible = !l.visible; captureState(); syncAll(); } }
  function toggleLock(id) {
    const l = layers.find(x => x.id === id);
    if (l) { l.locked = !l.locked; captureState(); syncAll(); emit('toast', { msg: l.locked ? '🔒 Layer locked' : '🔓 Layer unlocked', type: 'info' }); }
  }
  function renameLayer(id, name) { const l = layers.find(x => x.id === id); if (l) { l.name = name; captureState(); syncAll(); } }
  function duplicateLayer(id) {
    const l = layers.find(x => x.id === id);
    if (!l) return;
    const clone = JSON.parse(JSON.stringify(stripRuntime(l)));
    clone.id = uid();
    clone.name = (l.name || 'Layer') + ' copy';
    const offset = 24;
    clone.x = (clone.x || 0) + offset;
    clone.y = (clone.y || 0) + offset;
    if (clone.type === 'line') { clone.x2 = (clone.x2 || 0) + offset; clone.y2 = (clone.y2 || 0) + offset; }
    const idx = layers.findIndex(x => x.id === id);
    layers.splice(idx, 0, clone);
    if (clone.type === 'image' && clone.src) {
      const img = new Image();
      img.onload = () => { clone.imgObj = img; render(); };
      img.src = clone.src;
    }
    selectLayer(clone.id);
    captureState(); syncAll();
    emit('toast', { msg: `✓ Duplicated "${l.name}"`, type: 'success' });
    return clone;
  }
  function moveLayerUp(id) { const i = layers.findIndex(l => l.id === id); if (i > 0) { [layers[i - 1], layers[i]] = [layers[i], layers[i - 1]]; captureState(); syncAll(); } }
  function moveLayerDown(id) { const i = layers.findIndex(l => l.id === id); if (i < layers.length - 1 && i !== -1) { [layers[i + 1], layers[i]] = [layers[i], layers[i + 1]]; captureState(); syncAll(); } }
  function alignLayer(dir) {
    if (!selected) return;
    const b = getBoundsRaw(selected);
    if (dir === 'center-h') selected.x = W / 2 - b.w / 2 + (selected.x - b.x);
    else if (dir === 'center-v') selected.y = H / 2 - b.h / 2 + (selected.y - b.y);
    else if (dir === 'left') selected.x = 0 + (selected.x - b.x);
    else if (dir === 'right') selected.x = W - b.w + (selected.x - b.x);
    else if (dir === 'top') selected.y = 0 + (selected.y - b.y);
    else if (dir === 'bottom') selected.y = H - b.h + (selected.y - b.y);
    if (selected.type === 'line') {
      // shift x2/y2 by same delta already applied through x/y since bounds used min(x,x2)
    }
    captureState(); syncAll();
  }

  // property update used by property panels (text/shape/common fields)
  function updateLayerProp(key, value, opts) {
    opts = opts || {};
    if (!selected) return;
    selected[key] = value;
    render(); emit('change');
    if (!opts.live) { captureState(); scheduleAutosave(); }
    else scheduleAutosave();
  }
  function commitLayerProp() { captureState(); scheduleAutosave(); emit('change'); }

  // ── BACKGROUND ────────────────────────────────────────────────
  function setBgProp(key, value, opts) {
    opts = opts || {};
    bg[key] = value;
    render(); emit('bgchange');
    if (!opts.live) { captureState(); scheduleAutosave(); }
    else scheduleAutosave();
  }
  function commitBgProp() { captureState(); scheduleAutosave(); emit('bgchange'); }
  function loadBgImage(file) {
    const reader = new FileReader();
    reader.onload = e => {
      bg.imageSrc = e.target.result; bg.imageName = file.name;
      const token = ++bgLoadToken;
      const img = new Image();
      img.onload = () => { if (token !== bgLoadToken) return; bgImageObj = img; render(); captureState(); scheduleAutosave(); emit('bgchange'); };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
  function clearBgImage() {
    bgLoadToken++; // invalidate any bg image load still in flight
    bgImageObj = null; bg.imageSrc = ''; bg.imageName = '';
    render(); captureState(); scheduleAutosave(); emit('bgchange');
    emit('toast', { msg: 'BG image removed', type: 'info' });
  }
  function getBg() { return bg; }

  // ── DRAG (move only — resize/rotate now handled by the transform widget) ──
  function pointerDown(clientX, clientY) {
    const p = screenToCanvas(clientX, clientY);
    const hit = hitTestTopmost(p);
    if (hit) {
      selectLayer(hit.id);
      if (!hit.locked) {
        dragging = true; dragMoved = false;
        dragOffX = p.x - hit.x; dragOffY = p.y - hit.y;
      }
      return { hit: true, layer: hit };
    }
    selectLayer(null);
    return { hit: false };
  }
  function pointerMove(clientX, clientY) {
    if (!dragging || !selected || selected.locked) return;
    const p = screenToCanvas(clientX, clientY);
    let nx = p.x - dragOffX, ny = p.y - dragOffY;
    if (snapEnabled) {
      const b = getBoundsRaw(selected);
      const cx = nx + b.w / 2, cy = ny + b.h / 2;
      if (Math.abs(cx - W / 2) < 8) nx = W / 2 - b.w / 2;
      if (Math.abs(cy - H / 2) < 8) ny = H / 2 - b.h / 2;
    }
    if (selected.type === 'line') {
      const dx = nx - selected.x, dy = ny - selected.y;
      selected.x2 += dx; selected.y2 += dy;
    }
    selected.x = nx; selected.y = ny;
    dragMoved = true;
    render(); emit('change');
  }
  function pointerUp() {
    if (dragging && dragMoved) { captureState(); scheduleAutosave(); }
    dragging = false; dragMoved = false;
  }

  // ── TRANSFORM WIDGET (slider-driven resize / rotate) ──────────
  function recalcTransformBaseline() {
    if (!selected) { transformBaseline = null; return; }
    const b = getBoundsRaw(selected);
    transformBaseline = {
      rotation: selected.rotation || 0,
      w: selected.w, h: selected.h,
      fontSize: selected.fontSize,
      cx: b.x + b.w / 2, cy: b.y + b.h / 2,
      x: selected.x, y: selected.y,
      x2: selected.x2, y2: selected.y2,
      len: (selected.type === 'line') ? Math.hypot(selected.x2 - selected.x, selected.y2 - selected.y) : null,
      midX: (selected.type === 'line') ? (selected.x + selected.x2) / 2 : null,
      midY: (selected.type === 'line') ? (selected.y + selected.y2) / 2 : null
    };
  }
  function setTransformMode(mode) {
    transformMode = mode;
    recalcTransformBaseline();
    emit('transformmode', { mode });
  }
  function getTransformMode() { return transformMode; }
  function getTransformSliderConfig() {
    if (transformMode === 'rotate') return { min: -360, max: 360, step: 1, value: 0, unit: '°', uncapped: false };
    return { min: 10, max: 300, step: 1, value: 100, unit: '%', uncapped: true };
  }
  // value: percent (resize) or degrees-delta (rotate)
  function applyTransformValue(value, opts) {
    opts = opts || {};
    if (!selected || !transformBaseline || selected.locked) return;
    if (transformMode === 'rotate') {
      let rot = transformBaseline.rotation + value;
      rot = ((rot + 180) % 360 + 360) % 360 - 180;
      selected.rotation = Math.round(rot * 10) / 10;
    } else {
      const scale = Math.max(0.01, value / 100);
      if (selected.type === 'text') {
        selected.fontSize = Math.max(4, Math.round(transformBaseline.fontSize * scale));
      } else if (selected.type === 'line') {
        const newLen = transformBaseline.len * scale;
        const dx = (transformBaseline.x2 - transformBaseline.x) / (transformBaseline.len || 1);
        const dy = (transformBaseline.y2 - transformBaseline.y) / (transformBaseline.len || 1);
        selected.x = transformBaseline.midX - dx * newLen / 2;
        selected.y = transformBaseline.midY - dy * newLen / 2;
        selected.x2 = transformBaseline.midX + dx * newLen / 2;
        selected.y2 = transformBaseline.midY + dy * newLen / 2;
      } else {
        const newW = Math.max(4, transformBaseline.w * scale);
        const newH = Math.max(4, transformBaseline.h * scale);
        selected.x = transformBaseline.cx - newW / 2;
        selected.y = transformBaseline.cy - newH / 2;
        selected.w = newW; selected.h = newH;
      }
    }
    render(); emit('change');
    if (opts.commit) { captureState(); scheduleAutosave(); recalcTransformBaseline(); }
    else scheduleAutosave();
  }
  function commitTransform() { captureState(); scheduleAutosave(); recalcTransformBaseline(); }

  // screen-space anchor point (top-center of selection, rotation-aware) for positioning the floating widget
  function getWidgetAnchorScreen() {
    if (!selected) return null;
    const b = getBoundsRaw(selected);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const rot = (selected.rotation || 0) * Math.PI / 180;
    const localTop = { x: cx, y: b.y - 34 };
    const dx = localTop.x - cx, dy = localTop.y - cy;
    const rx = cx + dx * Math.cos(rot) - dy * Math.sin(rot);
    const ry = cy + dx * Math.sin(rot) + dy * Math.cos(rot);
    return canvasToScreen({ x: rx, y: ry });
  }

  // ── EXPORT ────────────────────────────────────────────────────
  function exportPNG(filename) {
    const prevSel = selected; selected = null; render();
    const a = document.createElement('a');
    a.download = filename || ('thumbnail-' + Date.now() + '.png');
    a.href = canvasEl.toDataURL('image/png');
    a.click();
    selected = prevSel; render();
    emit('toast', { msg: '✓ Exported PNG (1280×720)', type: 'success' });
  }
  function generateThumb() {
    const prevSel = selected; selected = null; render();
    const t = document.createElement('canvas'); t.width = 320; t.height = 180;
    t.getContext('2d').drawImage(canvasEl, 0, 0, 320, 180);
    const dataUrl = t.toDataURL('image/jpeg', 0.72);
    selected = prevSel; render();
    return dataUrl;
  }

  // ── PRESETS (local list; GitHub is the durable per-file store) ─
  function savePresetNew(name) {
    const preset = { id: 'p' + Date.now() + Math.random().toString(36).slice(2, 7), name, data: serializeProject(), thumb: generateThumb(), updatedAt: Date.now() };
    presets.unshift(preset);
    scheduleAutosave(); localStorage.setItem('tc_presets_v2', JSON.stringify(presets));
    emit('presets');
    if (ghConnected()) gh.savePresetFile(preset);
    return preset;
  }
  function updatePreset(id) {
    const p = presets.find(x => x.id === id); if (!p) return;
    p.data = serializeProject(); p.thumb = generateThumb(); p.updatedAt = Date.now();
    localStorage.setItem('tc_presets_v2', JSON.stringify(presets));
    emit('presets');
    if (ghConnected()) gh.savePresetFile(p);
    emit('toast', { msg: `✓ "${p.name}" updated`, type: 'success' });
  }
  function renamePreset(id, name) {
    const p = presets.find(x => x.id === id); if (!p) return;
    const before = { ...p }; // snapshot with old name/_path/_sha/_slug, for locating the old file
    p.name = name; p.updatedAt = Date.now();
    localStorage.setItem('tc_presets_v2', JSON.stringify(presets));
    emit('presets');
    if (ghConnected()) {
      const oldPath = before._path || presetFilePath(before);
      const newPath = presetFilePath(p);
      if (oldPath !== newPath) {
        // Name changed enough to change the filename: delete the old file
        // and save a fresh one under the new name so GitHub stays in sync.
        gh.deletePresetFile(before).then(() => {
          p._sha = null; p._path = null;
          gh.savePresetFile(p);
        });
      } else {
        gh.savePresetFile(p);
      }
    }
  }
  function loadPreset(id) {
    const p = presets.find(x => x.id === id); if (!p) return;
    loadProjectData(p.data);
    emit('toast', { msg: `Loaded "${p.name}"`, type: 'success' });
  }
  function deletePresetLocal(id) {
    const p = presets.find(x => x.id === id);
    presets = presets.filter(x => x.id !== id);
    localStorage.setItem('tc_presets_v2', JSON.stringify(presets));
    emit('presets');
    if (p && ghConnected()) gh.deletePresetFile(p);
  }
  function getPresets() { return presets; }

  // ── GITHUB (one JSON file per preset, stored in a folder) ──────
  function loadGhConfigLocal() {
    try { const c = localStorage.getItem('tc_gh_v2') || localStorage.getItem('tc_gh'); if (c) ghConfig = { ...ghConfig, ...JSON.parse(c) }; } catch (e) {}
  }
  function saveGhConfigLocal() { localStorage.setItem('tc_gh_v2', JSON.stringify(ghConfig)); }
  function ghConnected() { return !!(ghConfig.token && ghConfig.repo); }
  function getGhConfig() { return ghConfig; }

  function ghHeaders() { return { Authorization: `token ${ghConfig.token}`, 'Content-Type': 'application/json' }; }
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = ''; const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(b64.replace(/\n/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function ghTestAndConnect(token, repo, folder) {
    const r = await fetch(`https://api.github.com/repos/${repo}`, { headers: { Authorization: `token ${token}` } });
    if (!r.ok) throw new Error('Auth failed — check token/repo');
    ghConfig = { token, repo, folder: folder || 'presets', legacyPath: ghConfig.legacyPath || 'presets.json' };
    saveGhConfigLocal();
    return true;
  }
  function ghDisconnect() { ghConfig = { token: '', repo: '', folder: 'presets', legacyPath: 'presets.json' }; localStorage.removeItem('tc_gh_v2'); localStorage.removeItem('tc_gh'); emit('ghstatus'); }

  async function ghListFolder() {
    const url = `https://api.github.com/repos/${ghConfig.repo}/contents/${ghConfig.folder}`;
    const r = await fetch(url, { headers: ghHeaders() });
    if (r.status === 404) return [];
    if (!r.ok) throw new Error('Could not list ' + ghConfig.folder);
    const items = await r.json();
    return items.filter(i => i.type === 'file' && i.name.endsWith('.json'));
  }

  async function ghLoadAll() {
    if (!ghConnected()) throw new Error('Configure GitHub first');
    const files = await ghListFolder();
    if (!files.length) {
      const legacy = await ghTryLoadLegacy();
      if (legacy && legacy.length) {
        emit('toast', { msg: `Found ${legacy.length} preset(s) in the old presets.json — migrating to individual files…`, type: 'info' });
        await ghMigrateLegacy(legacy);
        return legacy.length;
      }
      emit('toast', { msg: 'No presets found in GitHub folder', type: 'error' });
      return 0;
    }
    const loaded = [];
    for (const f of files) {
      try {
        const r = await fetch(f.url, { headers: ghHeaders() });
        const json = await r.json();
        const content = JSON.parse(b64decode(json.content));
        loaded.push({ ...content, _sha: json.sha, _path: f.path, _slug: f.name.replace(/\.json$/, '') });
      } catch (e) { console.error('failed to load preset file', f.name, e); }
    }
    loaded.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    presets = loaded;
    localStorage.setItem('tc_presets_v2', JSON.stringify(presets));
    emit('presets');
    emit('toast', { msg: `✓ Loaded ${presets.length} preset(s) from GitHub`, type: 'success' });
    return presets.length;
  }

  async function ghTryLoadLegacy() {
    try {
      const url = `https://api.github.com/repos/${ghConfig.repo}/contents/${ghConfig.legacyPath}`;
      const r = await fetch(url, { headers: ghHeaders() });
      if (!r.ok) return null;
      const json = await r.json();
      return JSON.parse(b64decode(json.content));
    } catch (e) { return null; }
  }

  async function ghMigrateLegacy(list) {
    presets = list.map(p => ({ id: p.id || ('p' + Date.now() + Math.random().toString(36).slice(2, 7)), name: p.name || 'Untitled', data: p.data || p, thumb: p.thumb || '', updatedAt: p.updatedAt || Date.now() }));
    localStorage.setItem('tc_presets_v2', JSON.stringify(presets));
    emit('presets');
    for (const p of presets) { await gh.savePresetFile(p); }
    emit('toast', { msg: `✓ Migrated ${presets.length} preset(s) to ${ghConfig.folder}/`, type: 'success' });
  }

  function slugify(str) {
    return (str || '').toString().trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'preset';
  }
  // Computes a filename slug for a preset, appending -2, -3, ... if another
  // preset already resolves to the same slug (so files never collide).
  function uniqueFileSlug(p) {
    const base = slugify(p.name);
    let slug = base, n = 2;
    while (presets.some(x => x.id !== p.id && (x._slug || slugify(x.name)) === slug)) {
      slug = `${base}-${n++}`;
    }
    p._slug = slug;
    return slug;
  }
  function presetFilePath(p) { return `${ghConfig.folder}/${uniqueFileSlug(p)}.json`; }

  async function ghGetFileSha(path) {
    try {
      const r = await fetch(`https://api.github.com/repos/${ghConfig.repo}/contents/${path}`, { headers: ghHeaders() });
      if (!r.ok) return null;
      const j = await r.json();
      return j.sha;
    } catch (e) { return null; }
  }

  async function ghSavePresetFile(p) {
    if (!ghConnected()) return;
    try {
      const path = presetFilePath(p);
      const sha = p._sha || await ghGetFileSha(path);
      const { _sha, _path, _slug, ...clean } = p;
      const body = { message: `ThumbCraft: save preset "${p.name}"`, content: b64encode(JSON.stringify(clean, null, 2)) };
      if (sha) body.sha = sha;
      const url = `https://api.github.com/repos/${ghConfig.repo}/contents/${path}`;
      const put = await fetch(url, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
      if (put.ok) { const j = await put.json(); p._sha = j.content && j.content.sha; p._path = path; emit('toast', { msg: `✓ Synced "${p.name}" to GitHub`, type: 'success' }); }
      else { const err = await put.json().catch(() => ({})); emit('toast', { msg: 'GitHub save failed: ' + (err.message || put.status), type: 'error' }); }
    } catch (e) { emit('toast', { msg: 'GitHub save error: ' + e.message, type: 'error' }); }
  }

  async function ghDeletePresetFile(p) {
    if (!ghConnected()) return;
    try {
      const path = p._path || presetFilePath(p);
      const sha = p._sha || await ghGetFileSha(path);
      if (!sha) return;
      const url = `https://api.github.com/repos/${ghConfig.repo}/contents/${path}`;
      await fetch(url, { method: 'DELETE', headers: ghHeaders(), body: JSON.stringify({ message: `ThumbCraft: delete preset "${p.name}"`, sha }) });
    } catch (e) { console.error('gh delete failed', e); }
  }

  async function ghSaveAllPresets() {
    if (!ghConnected()) throw new Error('Configure GitHub first');
    for (const p of presets) await ghSavePresetFile(p);
    emit('toast', { msg: `✓ Saved ${presets.length} preset(s) to GitHub`, type: 'success' });
  }

  // One-time cleanup: renames any preset files still sitting under their old
  // random-id names (e.g. p1719...xy.json) to name-based slugs. Safe to run
  // repeatedly — presets already on the new scheme are skipped.
  async function ghRenameToNames() {
    if (!ghConnected()) throw new Error('Configure GitHub first');
    let renamed = 0;
    for (const p of presets) {
      const oldPath = p._path;
      const newPath = presetFilePath(p);
      if (oldPath && oldPath !== newPath) {
        const oldSha = p._sha;
        try {
          await fetch(`https://api.github.com/repos/${ghConfig.repo}/contents/${oldPath}`, {
            method: 'DELETE', headers: ghHeaders(),
            body: JSON.stringify({ message: `ThumbCraft: rename preset file for "${p.name}"`, sha: oldSha })
          });
          p._sha = null; p._path = null;
          await ghSavePresetFile(p);
          renamed++;
        } catch (e) { console.error('rename failed for', p.name, e); }
      }
    }
    emit('toast', { msg: renamed ? `✓ Renamed ${renamed} preset file(s) to match names` : 'All preset files already match their names', type: 'success' });
    return renamed;
  }

  const gh = {
    connect: ghTestAndConnect, disconnect: ghDisconnect, connected: ghConnected,
    loadAll: ghLoadAll, saveAll: ghSaveAllPresets,
    savePresetFile: ghSavePresetFile, deletePresetFile: ghDeletePresetFile,
    renameToNames: ghRenameToNames,
    getConfig: getGhConfig
  };

  // ── PUBLIC API ────────────────────────────────────────────────
  global.TC = {
    W, H, on, init,
    // layers
    addText, addRect, addEllipse, addTriangle, addLine, addImage,
    selectLayer, getSelected, getLayers, deleteLayer, deleteSelected,
    toggleVisibility, toggleLock, renameLayer, duplicateLayer, moveLayerUp, moveLayerDown, alignLayer,
    updateLayerProp, commitLayerProp,
    // background
    setBgProp, commitBgProp, loadBgImage, clearBgImage, getBg,
    // canvas interaction
    pointerDown, pointerMove, pointerUp, screenToCanvas, canvasToScreen,
    getBoundsRaw, hitTestTopmost,
    // transform widget
    setTransformMode, getTransformMode, getTransformSliderConfig, applyTransformValue, commitTransform,
    getWidgetAnchorScreen, recalcTransformBaseline,
    // view
    zoomIn, zoomOut, setZoom, zoomFit, getZoom, pan, toggleSnap, getSnap, setViewLock, getViewLock,
    // history
    undo, redo, canUndo, canRedo, captureState,
    // project
    serializeProject, loadProjectData, newCanvas, saveLocalProject,
    // presets
    savePresetNew, updatePreset, renamePreset, loadPreset, deletePresetLocal, getPresets,
    // export
    exportPNG, generateThumb,
    // github
    gh,
    // utils exposed for UI templating
    util: { esc, toHex, getAlpha, hexToRgba, clamp }
  };
})(window);
