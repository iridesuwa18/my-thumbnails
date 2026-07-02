/* ═══════════════════════════════════════════════════════════════
   THUMBCRAFT — DESKTOP UI
   Talks to the shared engine only through window.TC.
   ═══════════════════════════════════════════════════════════════ */
const { esc, toHex, getAlpha } = TC.util;

// ── INIT ──────────────────────────────────────────────────────
TC.init({
  canvas: document.getElementById('mainCanvas'),
  wrapper: document.getElementById('canvas-wrapper'),
  viewport: document.getElementById('canvas-area')
});
setTimeout(() => TC.zoomFit(), 50);

// ── TAB SWITCHING ─────────────────────────────────────────────
function switchLeftTab(name) {
  document.querySelectorAll('.left-panel .panel-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.left-panel .tab-content').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
}
function switchRightTab(name) {
  document.querySelectorAll('.right-panel .panel-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.right-panel .tab-content').forEach(t => t.classList.toggle('active', t.id === 'right-tab-' + name));
  if (name === 'bg') renderBgPanel();
  if (name === 'github') renderGithubPanel();
}

// ── TOAST ─────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show ' + (type || 'info');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
TC.on('toast', ({ msg, type }) => showToast(msg, type));

// ── AUTOSAVE INDICATOR ────────────────────────────────────────
TC.on('autosaved', () => {
  const dot = document.querySelector('#autosave-indicator .status-dot');
  const label = document.getElementById('autosave-indicator');
  dot.style.background = 'var(--success)';
  label.lastChild.textContent = 'Saved';
});

// ── HISTORY BUTTONS ───────────────────────────────────────────
TC.on('history', ({ canUndo, canRedo }) => {
  document.getElementById('undo-btn').disabled = !canUndo;
  document.getElementById('redo-btn').disabled = !canRedo;
});

// ── LAYERS LIST ───────────────────────────────────────────────
const ICONS = { text: 'T', rect: '▭', ellipse: '◯', triangle: '△', line: '╱', image: '🖼' };
let renamingId = null;
function renderLayersList() {
  const list = document.getElementById('layers-list');
  const none = document.getElementById('no-layers');
  const layers = TC.getLayers(), sel = TC.getSelected();
  document.getElementById('layer-count').textContent = layers.length ? `(${layers.length})` : '';
  document.getElementById('del-selected-btn').style.display = sel ? 'inline-flex' : 'none';
  none.style.display = layers.length ? 'none' : 'block';
  if (renamingId !== null && layers.some(l => l.id === renamingId)) return; // don't blow away the active rename input
  list.innerHTML = layers.map(l => `
    <div class="layer-item${sel && sel.id === l.id ? ' selected' : ''}" onclick="TC.selectLayer(${l.id})">
      <span class="layer-icon" style="opacity:${l.visible ? 1 : .35}">${ICONS[l.type] || '◆'}</span>
      ${renamingId === l.id
        ? `<input class="layer-name-edit" id="rename-input" value="${esc(l.name)}" onblur="commitRename(${l.id},this.value)" onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){renamingId=null;renderLayersList();}">`
        : `<span class="layer-name" style="opacity:${l.visible ? 1 : .4}" ondblclick="startRename(${l.id})">${esc(l.name)}</span>`}
      <div class="layer-actions">
        <button class="layer-btn accent" title="Up" onclick="event.stopPropagation();TC.moveLayerUp(${l.id})">▲</button>
        <button class="layer-btn accent" title="Down" onclick="event.stopPropagation();TC.moveLayerDown(${l.id})">▼</button>
        <button class="layer-btn" title="Rename" onclick="event.stopPropagation();startRename(${l.id})">✏️</button>
        <button class="layer-btn" title="Visibility" onclick="event.stopPropagation();TC.toggleVisibility(${l.id})">${l.visible ? '👁' : '🚫'}</button>
        <button class="layer-btn" title="Lock" onclick="event.stopPropagation();TC.toggleLock(${l.id})">${l.locked ? '🔒' : '🔓'}</button>
        <button class="layer-btn danger" title="Delete" onclick="event.stopPropagation();TC.deleteLayer(${l.id})">✕</button>
      </div>
    </div>`).join('');
}
function startRename(id) { renamingId = id; renderLayersList(); setTimeout(() => { const i = document.getElementById('rename-input'); if (i) { i.focus(); i.select(); } }, 10); }
function commitRename(id, val) { renamingId = null; if (val.trim()) TC.renameLayer(id, val.trim()); else renderLayersList(); }
TC.on('change', renderLayersList);
TC.on('select', renderLayersList);

// ── PRESETS GRID ──────────────────────────────────────────────
function renderPresetsGrid() {
  const grid = document.getElementById('preset-grid');
  const none = document.getElementById('no-presets');
  const presets = TC.getPresets();
  document.getElementById('preset-sync-badge').textContent = TC.gh.connected() ? 'GitHub synced' : 'local only';
  none.style.display = presets.length ? 'none' : 'block';
  grid.innerHTML = presets.map(p => `
    <div class="preset-card" onclick="TC.loadPreset('${p.id}')">
      <div class="preset-thumb" style="background-image:url('${p.thumb || ''}')"></div>
      <div class="preset-name">${esc(p.name)}</div>
      <div class="preset-actions">
        <button class="preset-act-btn" title="Update with current canvas" onclick="event.stopPropagation();TC.updatePreset('${p.id}')">↻</button>
        <button class="preset-act-btn danger" title="Delete" onclick="event.stopPropagation();confirmDeletePreset('${p.id}')">✕</button>
      </div>
    </div>`).join('');
}
TC.on('presets', renderPresetsGrid);

function savePresetModal() { document.getElementById('modal-preset').classList.remove('hidden'); const inp = document.getElementById('preset-name-input'); inp.value = ''; setTimeout(() => inp.focus(), 50); }
function doSavePreset() {
  const name = document.getElementById('preset-name-input').value.trim() || `Preset ${TC.getPresets().length + 1}`;
  TC.savePresetNew(name);
  closeModal('modal-preset');
  showToast(`✓ Saved "${name}"`, 'success');
}
function confirmDeletePreset(id) {
  showConfirm('Delete preset?', 'This removes it locally and from GitHub if connected. This cannot be undone.', () => TC.deletePresetLocal(id));
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function showConfirm(title, msg, onOk) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  const btn = document.getElementById('confirm-ok-btn');
  const clone = btn.cloneNode(true); btn.parentNode.replaceChild(clone, btn);
  clone.onclick = () => { onOk(); closeModal('modal-confirm'); };
  document.getElementById('modal-confirm').classList.remove('hidden');
}
function confirmNewCanvas() { showConfirm('Start a new canvas?', 'This clears all layers and background settings. Unsaved work will be lost (presets are safe).', () => TC.newCanvas()); }

// ── PROPERTIES PANEL (Photoshop-style, per layer type) ─────────
function renderPropsPanel() {
  const body = document.getElementById('props-body');
  const l = TC.getSelected();
  if (!l) {
    body.innerHTML = `<div class="no-selection">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>
      Select an element to edit its properties.
      <div class="shortcut-hint">Double-click text to edit · <span class="kb-hint">Del</span> remove · <span class="kb-hint">F2</span> rename</div>
    </div>`;
    return;
  }
  let h = `<div class="prop-row"><div class="prop-label">Name</div>
    <input class="prop-input" value="${esc(l.name)}" oninput="TC.updateLayerProp('name',this.value,{live:true})" onblur="TC.commitLayerProp()"></div>`;

  if (l.type === 'text') h += textPropsHTML(l);
  if (l.type === 'rect' || l.type === 'ellipse' || l.type === 'triangle') h += shapePropsHTML(l);
  if (l.type === 'line') h += linePropsHTML(l);
  if (l.type === 'image') h += `<div class="prop-row"><div class="prop-label">Source</div><div style="font-size:11px;color:var(--muted)">${esc(l.name)}</div></div>`;

  h += `
    <div class="props-section-title">Position &amp; Opacity</div>
    <div class="prop-row-2 prop-row">
      <div><div class="prop-label">X</div><input class="prop-input" type="number" value="${Math.round(l.x)}" oninput="TC.updateLayerProp('x',+this.value,{live:true})" onblur="TC.commitLayerProp()" ${l.locked ? 'disabled' : ''}></div>
      <div><div class="prop-label">Y</div><input class="prop-input" type="number" value="${Math.round(l.y)}" oninput="TC.updateLayerProp('y',+this.value,{live:true})" onblur="TC.commitLayerProp()" ${l.locked ? 'disabled' : ''}></div>
    </div>
    <div class="prop-row">
      <div class="prop-label">Opacity <span class="slider-val">${l.opacity ?? 100}%</span></div>
      <input class="prop-slider" type="range" min="0" max="100" value="${l.opacity ?? 100}" oninput="TC.updateLayerProp('opacity',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'%'" onchange="TC.commitLayerProp()">
    </div>
    <div style="font-size:10.5px;color:var(--muted);text-align:center;margin-top:6px">Rotation &amp; size are set from the floating dial on the canvas.</div>`;
  body.innerHTML = h;
}
TC.on('select', renderPropsPanel);

function textPropsHTML(l) {
  const fonts = ['Bebas Neue', 'Impact', 'Arial Black', 'DM Sans', 'Space Mono', 'Georgia', 'Verdana', 'Courier New', 'Tahoma', 'Trebuchet MS'];
  const weights = ['300', '400', '500', '600', '700', '900'];
  return `
    <div class="props-section-title">Character</div>
    <div class="prop-row"><div class="prop-label">Text</div>
      <textarea class="prop-textarea" oninput="TC.updateLayerProp('text',this.value,{live:true})" onblur="TC.commitLayerProp()">${esc(l.text || '')}</textarea></div>
    <div class="prop-row"><div class="prop-label">Font</div>
      <select class="prop-select" onchange="TC.updateLayerProp('fontFamily',this.value)">${fonts.map(f => `<option value="${f}"${l.fontFamily === f ? ' selected' : ''}>${f}</option>`).join('')}</select></div>
    <div class="prop-row-2 prop-row">
      <div><div class="prop-label">Weight</div><select class="prop-select" onchange="TC.updateLayerProp('fontWeight',this.value)">${weights.map(w => `<option value="${w}"${(l.fontWeight || '400') === w ? ' selected' : ''}>${w}</option>`).join('')}</select></div>
      <div><div class="prop-label">Style</div><select class="prop-select" onchange="TC.updateLayerProp('textStyle',this.value)">${['normal', 'badge', 'outline'].map(s => `<option value="${s}"${l.textStyle === s ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="prop-row"><div class="prop-label">Letter Spacing <span class="slider-val">${l.letterSpacing || 0}px</span></div>
      <input class="prop-slider" type="range" min="-5" max="40" value="${l.letterSpacing || 0}" oninput="TC.updateLayerProp('letterSpacing',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'px'" onchange="TC.commitLayerProp()"></div>
    <div class="prop-row"><div class="prop-label">Line Height <span class="slider-val">${(l.lineHeight || 1.2).toFixed(2)}</span></div>
      <input class="prop-slider" type="range" min="0.8" max="3" step="0.05" value="${l.lineHeight || 1.2}" oninput="TC.updateLayerProp('lineHeight',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=(+this.value).toFixed(2)" onchange="TC.commitLayerProp()"></div>
    <div class="prop-row"><div class="prop-label" style="margin-bottom:5px">Alignment</div>
      <div class="pill-toggle">${['left', 'center', 'right'].map(a => `<button class="${(l.textAlign || 'left') === a ? 'active' : ''}" onclick="TC.updateLayerProp('textAlign','${a}')">${a}</button>`).join('')}</div></div>
    <div class="props-section-title">Color &amp; Fill</div>
    <div class="prop-row"><div class="prop-label">Text Color</div>
      <div class="prop-color-row"><input class="prop-color" type="color" value="${toHex(l.color || '#fff')}" oninput="TC.updateLayerProp('color',this.value,{live:true})" onchange="TC.commitLayerProp()">
      <input class="prop-input" value="${l.color || '#ffffff'}" oninput="TC.updateLayerProp('color',this.value,{live:true})" onblur="TC.commitLayerProp()" style="flex:1"></div></div>
    ${l.textStyle === 'badge' ? `<div class="prop-row"><div class="prop-label">Badge Background</div><input class="prop-color" type="color" value="${toHex(l.bgFill || '#f5c518')}" oninput="TC.updateLayerProp('bgFill',this.value,{live:true})" onchange="TC.commitLayerProp()" style="width:100%;height:32px;padding:2px"></div>` : ''}
    <div class="props-section-title">Outline &amp; Shadow</div>
    <div class="prop-row"><div class="prop-label">Outline Width <span class="slider-val">${l.outlineW || 0}px</span></div>
      <input class="prop-slider" type="range" min="0" max="20" value="${l.outlineW || 0}" oninput="TC.updateLayerProp('outlineW',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'px'" onchange="TC.commitLayerProp()"></div>
    <div class="prop-row"><div class="prop-label">Outline Color</div>
      <input class="prop-color" type="color" value="${toHex(l.outlineColor || '#000')}" oninput="TC.updateLayerProp('outlineColor',this.value,{live:true})" onchange="TC.commitLayerProp()" style="width:100%;height:32px;padding:2px"></div>
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--text2);margin-bottom:8px">
      <input type="checkbox" ${l.shadow ? 'checked' : ''} onchange="TC.updateLayerProp('shadow',this.checked)" style="accent-color:var(--accent)"> Drop Shadow</label>
    ${l.shadow ? `
    <div class="prop-row"><div class="prop-label">Shadow Color</div><input class="prop-color" type="color" value="${toHex(l.shadowColor || '#000')}" oninput="TC.updateLayerProp('shadowColor',this.value,{live:true})" onchange="TC.commitLayerProp()" style="width:100%;height:32px;padding:2px"></div>
    <div class="prop-row"><div class="prop-label">Shadow Blur <span class="slider-val">${l.shadowBlur ?? 10}px</span></div><input class="prop-slider" type="range" min="0" max="40" value="${l.shadowBlur ?? 10}" oninput="TC.updateLayerProp('shadowBlur',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'px'" onchange="TC.commitLayerProp()"></div>
    <div class="prop-row-2 prop-row">
      <div><div class="prop-label">Offset X</div><input class="prop-input" type="number" value="${l.shadowX ?? 3}" oninput="TC.updateLayerProp('shadowX',+this.value,{live:true})" onblur="TC.commitLayerProp()"></div>
      <div><div class="prop-label">Offset Y</div><input class="prop-input" type="number" value="${l.shadowY ?? 3}" oninput="TC.updateLayerProp('shadowY',+this.value,{live:true})" onblur="TC.commitLayerProp()"></div>
    </div>` : ''}`;
}

function shapePropsHTML(l) {
  const fillAlpha = getAlpha(l.fill), strokeAlpha = getAlpha(l.stroke);
  return `
    <div class="props-section-title">Fill &amp; Stroke</div>
    <div class="prop-row"><div class="prop-label">Fill Color</div>
      <div class="prop-color-row"><input class="prop-color" type="color" value="${toHex(l.fill || '#f5c518')}" oninput="setShapeFillColor(this.value)">
      <input class="prop-input" value="${toHex(l.fill || '#f5c518')}" oninput="setShapeFillColor(this.value)" style="flex:1"></div></div>
    <div class="prop-row"><div class="prop-label">Fill Alpha <span class="slider-val">${Math.round(fillAlpha * 100)}%</span></div>
      <input class="prop-slider" type="range" min="0" max="100" value="${Math.round(fillAlpha * 100)}" oninput="setShapeFillAlpha(+this.value/100,true);this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'%'" onchange="setShapeFillAlpha(+this.value/100,false)"></div>
    <div class="prop-row"><div class="prop-label">Stroke Color</div>
      <input class="prop-color" type="color" value="${toHex(l.stroke || '#ffffff')}" oninput="setShapeStrokeColor(this.value)" style="width:100%;height:32px;padding:2px"></div>
    <div class="prop-row"><div class="prop-label">Stroke Width <span class="slider-val">${l.strokeW || 0}px</span></div>
      <input class="prop-slider" type="range" min="0" max="30" value="${l.strokeW || 0}" oninput="TC.updateLayerProp('strokeW',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'px'" onchange="TC.commitLayerProp()"></div>
    ${l.type === 'rect' ? `<div class="prop-row"><div class="prop-label">Corner Radius <span class="slider-val">${l.radius || 0}px</span></div><input class="prop-slider" type="range" min="0" max="80" value="${l.radius || 0}" oninput="TC.updateLayerProp('radius',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'px'" onchange="TC.commitLayerProp()"></div>` : ''}`;
}
function setShapeFillColor(hex) { const l = TC.getSelected(); const a = getAlpha(l.fill); TC.updateLayerProp('fill', TC.util.hexToRgba(hex, a)); }
function setShapeFillAlpha(a, live) { const l = TC.getSelected(); const hex = toHex(l.fill); TC.updateLayerProp('fill', TC.util.hexToRgba(hex, a), { live }); }
function setShapeStrokeColor(hex) { const l = TC.getSelected(); TC.updateLayerProp('stroke', hex); }

function linePropsHTML(l) {
  const strokeAlpha = getAlpha(l.stroke);
  return `
    <div class="props-section-title">Line</div>
    <div class="prop-row"><div class="prop-label">Color</div><input class="prop-color" type="color" value="${toHex(l.stroke || '#f5c518')}" oninput="setShapeStrokeColor(this.value)" style="width:100%;height:32px;padding:2px"></div>
    <div class="prop-row"><div class="prop-label">Thickness <span class="slider-val">${l.strokeW || 4}px</span></div>
      <input class="prop-slider" type="range" min="1" max="40" value="${l.strokeW || 4}" oninput="TC.updateLayerProp('strokeW',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'px'" onchange="TC.commitLayerProp()"></div>`;
}

// ── BACKGROUND PANEL (Photoshop-style) ──────────────────────────
function renderBgPanel() {
  const body = document.getElementById('bg-body');
  const bg = TC.getBg();
  body.innerHTML = `
    <div class="props-section-title">Fill</div>
    <div class="prop-row"><div class="prop-label">Base Color</div>
      <div class="prop-color-row"><input class="prop-color" type="color" id="bg-color" value="${bg.color}" oninput="TC.setBgProp('color',this.value,{live:true})" onchange="TC.commitBgProp()">
      <input class="prop-input" value="${bg.color}" oninput="TC.setBgProp('color',this.value,{live:true})" onblur="TC.commitBgProp()" style="flex:1"></div>
      <div class="shortcut-hint">Shows through when no image is set, and behind transparent image edges.</div></div>

    <div class="props-section-title">Image</div>
    ${bg.imageSrc ? `<div class="bg-image-chip">✓ ${esc(bg.imageName || 'image')} <span style="margin-left:auto;cursor:pointer" onclick="TC.clearBgImage()">✕</span></div>` : ''}
    <button class="btn btn-ghost" style="width:100%;justify-content:center;margin-bottom:6px" onclick="document.getElementById('bg-upload').click()">
      <svg viewBox="0 0 16 16" width="13" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="3" width="14" height="10" rx="1.5"/><circle cx="5.5" cy="7" r="1.5"/><path d="M1 11l4-3 3 3 2-2 5 4"/></svg>
      ${bg.imageSrc ? 'Replace Image' : 'Upload Image'}</button>

    <div class="props-section-title">Size &amp; Position</div>
    <div class="prop-row"><div class="prop-label">Zoom <span class="slider-val">${Math.round(bg.zoom * 100)}%</span></div>
      <input class="prop-slider" type="range" min="0.5" max="3" step="0.01" value="${bg.zoom}" oninput="TC.setBgProp('zoom',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=Math.round(this.value*100)+'%'" onchange="TC.commitBgProp()"></div>
    <div class="prop-row-2 prop-row">
      <div><div class="prop-label">Position X</div><input class="prop-input" type="number" value="${bg.offsetX}" oninput="TC.setBgProp('offsetX',+this.value,{live:true})" onblur="TC.commitBgProp()"></div>
      <div><div class="prop-label">Position Y</div><input class="prop-input" type="number" value="${bg.offsetY}" oninput="TC.setBgProp('offsetY',+this.value,{live:true})" onblur="TC.commitBgProp()"></div>
    </div>
    <div class="prop-row"><div class="prop-label">Rotation <span class="slider-val">${bg.rotation}°</span></div>
      <input class="prop-slider" type="range" min="-180" max="180" value="${bg.rotation}" oninput="TC.setBgProp('rotation',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'°'" onchange="TC.commitBgProp()"></div>

    <div class="props-section-title">Overlay</div>
    <div class="prop-row"><div class="prop-label">Overlay Color</div>
      <input class="prop-color" type="color" value="${bg.overlayColor}" oninput="TC.setBgProp('overlayColor',this.value,{live:true})" onchange="TC.commitBgProp()" style="width:100%;height:32px;padding:2px"></div>
    <div class="prop-row"><div class="prop-label">Overlay Opacity <span class="slider-val">${bg.overlayOpacity}%</span></div>
      <input class="prop-slider" type="range" min="0" max="100" value="${bg.overlayOpacity}" oninput="TC.setBgProp('overlayOpacity',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'%'" onchange="TC.commitBgProp()"></div>

    <div class="props-section-title">Adjustments</div>
    <div class="prop-row"><div class="prop-label">Blur <span class="slider-val">${bg.blur || 0}px</span></div>
      <input class="prop-slider" type="range" min="0" max="20" value="${bg.blur || 0}" oninput="TC.setBgProp('blur',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'px'" onchange="TC.commitBgProp()"></div>
    <div class="prop-row"><div class="prop-label">Brightness <span class="slider-val">${bg.brightness ?? 100}%</span></div>
      <input class="prop-slider" type="range" min="30" max="200" value="${bg.brightness ?? 100}" oninput="TC.setBgProp('brightness',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'%'" onchange="TC.commitBgProp()"></div>
    <div class="prop-row"><div class="prop-label">Contrast <span class="slider-val">${bg.contrast ?? 100}%</span></div>
      <input class="prop-slider" type="range" min="30" max="200" value="${bg.contrast ?? 100}" oninput="TC.setBgProp('contrast',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'%'" onchange="TC.commitBgProp()"></div>
    <div class="prop-row"><div class="prop-label">Saturation <span class="slider-val">${bg.saturate ?? 100}%</span></div>
      <input class="prop-slider" type="range" min="0" max="200" value="${bg.saturate ?? 100}" oninput="TC.setBgProp('saturate',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'%'" onchange="TC.commitBgProp()"></div>
    <button class="btn btn-ghost" style="width:100%;justify-content:center;margin-top:6px" onclick="resetBgAdjustments()">↺ Reset Adjustments</button>`;
}
function resetBgAdjustments() { TC.setBgProp('blur', 0); TC.setBgProp('brightness', 100); TC.setBgProp('contrast', 100); TC.setBgProp('saturate', 100); renderBgPanel(); }
document.getElementById('bg-upload').addEventListener('change', e => { if (e.target.files[0]) TC.loadBgImage(e.target.files[0]); setTimeout(renderBgPanel, 300); e.target.value = ''; });
document.getElementById('img-upload').addEventListener('change', e => { if (e.target.files[0]) TC.addImage(e.target.files[0]); e.target.value = ''; });
function triggerImageUpload() { document.getElementById('img-upload').click(); }

// ── GITHUB PANEL ──────────────────────────────────────────────
function renderGithubPanel() {
  const body = document.getElementById('github-body');
  const cfg = TC.gh.getConfig();
  if (!TC.gh.connected()) {
    body.innerHTML = `
      <div class="panel-label">🔐 GitHub Sync</div>
      <div style="font-size:11px;color:var(--muted);line-height:1.6;margin-bottom:12px">Each preset is stored as its own JSON file inside a folder in your repo — no more one giant file losing everything on a bad write.</div>
      <div class="prop-row"><div class="prop-label">Personal Access Token</div>
        <div style="position:relative"><input class="prop-input" type="password" id="gh-token" placeholder="ghp_xxxxxxxxxxxx" style="padding-right:34px">
        <span onclick="const i=document.getElementById('gh-token');i.type=i.type==='password'?'text':'password'" style="position:absolute;right:9px;top:50%;transform:translateY(-50%);cursor:pointer;font-size:14px;color:var(--muted)">👁</span></div></div>
      <div class="prop-row"><div class="prop-label">Repository</div><input class="prop-input" id="gh-repo" placeholder="username/my-thumbnails" value="${esc(cfg.repo)}"></div>
      <div class="prop-row"><div class="prop-label">Presets Folder</div><input class="prop-input" id="gh-folder" placeholder="presets" value="${esc(cfg.folder || 'presets')}"></div>
      <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="doGhConnect()">Save &amp; Connect</button>
      <div style="font-size:11px;color:var(--muted);line-height:1.8;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
        GitHub → Settings → Developer settings → Personal access tokens → Classic.<br>Check the <code style="color:var(--accent)">repo</code> scope, generate, paste above.</div>`;
    return;
  }
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px"><div class="status-dot ok"></div><span style="font-size:13px;font-weight:600;color:var(--success)">Connected</span></div>
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:12px;margin-bottom:12px">
      <div style="color:var(--muted);margin-bottom:3px">Repository</div><div style="font-weight:600">${esc(cfg.repo)}</div>
      <div style="color:var(--muted);margin-top:8px;margin-bottom:3px">Folder</div><div style="font-weight:600">${esc(cfg.folder)}/*.json</div>
      <div style="color:var(--muted);margin-top:8px;font-size:10.5px">${TC.getPresets().length} preset(s) loaded locally</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:8px">
      <button class="btn btn-ghost" style="justify-content:center" onclick="doGhLoad()">⬇ Load All</button>
      <button class="btn btn-primary" style="justify-content:center" onclick="doGhSaveAll()">⬆ Save All</button>
    </div>
    <div style="font-size:10.5px;color:var(--muted);margin-bottom:12px;text-align:center">Load All replaces the local preset list · Save All pushes every local preset as its own file</div>
    <button class="btn btn-ghost" style="width:100%;justify-content:center" onclick="TC.gh.disconnect();renderGithubPanel();renderPresetsGrid()">🔓 Change Credentials</button>`;
}
async function doGhConnect() {
  const token = document.getElementById('gh-token').value.trim();
  const repo = document.getElementById('gh-repo').value.trim();
  const folder = document.getElementById('gh-folder').value.trim() || 'presets';
  if (!token || !repo) { showToast('Enter both token and repository', 'error'); return; }
  showToast('Verifying…', 'info');
  try { await TC.gh.connect(token, repo, folder); showToast('✓ GitHub connected', 'success'); renderGithubPanel(); renderPresetsGrid(); }
  catch (e) { showToast(e.message, 'error'); }
}
async function doGhLoad() { showToast('Loading from GitHub…', 'info'); try { await TC.gh.loadAll(); renderGithubPanel(); } catch (e) { showToast(e.message, 'error'); } }
async function doGhSaveAll() { showToast('Saving to GitHub…', 'info'); try { await TC.gh.saveAll(); renderGithubPanel(); } catch (e) { showToast(e.message, 'error'); } }

// ── FLOATING TRANSFORM WIDGET ───────────────────────────────────
const twEl = document.getElementById('transform-widget');
const twLock = document.getElementById('tw-lock'), twRotate = document.getElementById('tw-rotate'), twResize = document.getElementById('tw-resize');
const twSlider = document.getElementById('tw-slider'), twNum = document.getElementById('tw-num');

function updateTransformWidget() {
  const l = TC.getSelected();
  if (!l) { twEl.classList.remove('show'); return; }
  const anchor = TC.getWidgetAnchorScreen();
  if (!anchor) { twEl.classList.remove('show'); return; }
  twEl.classList.add('show');
  twEl.style.left = anchor.x + 'px';
  twEl.style.top = anchor.y + 'px';
  twLock.textContent = l.locked ? '🔒' : '🔓';
  twLock.classList.toggle('locked', !!l.locked);
  const mode = TC.getTransformMode();
  twRotate.classList.toggle('active', mode === 'rotate');
  twResize.classList.toggle('active', mode === 'resize');
  const cfg = TC.getTransformSliderConfig();
  twSlider.min = cfg.min; twSlider.max = cfg.max; twSlider.step = cfg.step;
  if (document.activeElement !== twSlider && document.activeElement !== twNum) {
    twSlider.value = cfg.value;
    twNum.value = cfg.value;
  }
  twSlider.disabled = !!l.locked; twNum.disabled = !!l.locked;
}
TC.on('rendered', updateTransformWidget);
TC.on('zoom', updateTransformWidget);
TC.on('transformmode', updateTransformWidget);

twLock.onclick = () => { const l = TC.getSelected(); if (l) { TC.toggleLock(l.id); renderPropsPanel(); } };
twRotate.onclick = () => TC.setTransformMode('rotate');
twResize.onclick = () => TC.setTransformMode('resize');
twSlider.oninput = () => { twNum.value = twSlider.value; TC.applyTransformValue(+twSlider.value, { commit: false }); };
twSlider.onchange = () => TC.applyTransformValue(+twSlider.value, { commit: true });
twNum.addEventListener('input', () => { const v = parseFloat(twNum.value); if (!isNaN(v)) { const cfg = TC.getTransformSliderConfig(); twSlider.value = TC.util.clamp(v, cfg.min, cfg.max); TC.applyTransformValue(v, { commit: false }); } });
twNum.addEventListener('blur', () => { const v = parseFloat(twNum.value); if (!isNaN(v)) TC.applyTransformValue(v, { commit: true }); });
twNum.addEventListener('keydown', e => { if (e.key === 'Enter') twNum.blur(); });

// ── CANVAS POINTER INTERACTION ───────────────────────────────────
const canvasArea = document.getElementById('canvas-area');
let mouseDown = false, panning = false, panStart = null, spaceDown = false, textEditor = null;

document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (e.code === 'Space') { spaceDown = true; canvasArea.style.cursor = 'grab'; e.preventDefault(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { if (TC.getSelected()) { TC.deleteSelected(); e.preventDefault(); } return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.shiftKey ? TC.redo() : TC.undo(); e.preventDefault(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { TC.redo(); e.preventDefault(); return; }
  if (e.key === 'Escape') { TC.selectLayer(null); return; }
  if (e.key === 'F2') { const l = TC.getSelected(); if (l) startRename(l.id); e.preventDefault(); return; }
  const l = TC.getSelected();
  if (l && !l.locked && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp') TC.updateLayerProp('y', l.y - step, { live: true });
    if (e.key === 'ArrowDown') TC.updateLayerProp('y', l.y + step, { live: true });
    if (e.key === 'ArrowLeft') TC.updateLayerProp('x', l.x - step, { live: true });
    if (e.key === 'ArrowRight') TC.updateLayerProp('x', l.x + step, { live: true });
    TC.commitLayerProp();
    e.preventDefault();
  }
});
document.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; canvasArea.style.cursor = 'default'; } });

canvasArea.addEventListener('mousedown', e => {
  if (e.target.closest('.transform-widget')) return;
  if (spaceDown || e.button === 1) { panning = true; panStart = { x: e.clientX, y: e.clientY }; canvasArea.style.cursor = 'grabbing'; e.preventDefault(); return; }
  mouseDown = true;
  TC.pointerDown(e.clientX, e.clientY);
});
window.addEventListener('mousemove', e => {
  if (panning) { TC.pan(e.clientX - panStart.x, e.clientY - panStart.y); panStart = { x: e.clientX, y: e.clientY }; return; }
  if (mouseDown) TC.pointerMove(e.clientX, e.clientY);
});
window.addEventListener('mouseup', () => {
  if (panning) { panning = false; canvasArea.style.cursor = spaceDown ? 'grab' : 'default'; }
  if (mouseDown) { mouseDown = false; TC.pointerUp(); }
});
canvasArea.addEventListener('wheel', e => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  TC.setZoom(TC.getZoom() + delta);
}, { passive: false });
canvasArea.addEventListener('dblclick', e => {
  const pos = TC.screenToCanvas(e.clientX, e.clientY);
  const l = TC.hitTestTopmost(pos);
  if (l && l.type === 'text' && !l.locked) openInlineTextEditor(l);
});
TC.on('zoom', ({ zoom }) => { document.getElementById('zoom-val').textContent = Math.round(zoom * 100) + '%'; });
TC.on('snap', ({ enabled }) => { document.getElementById('snap-btn').style.color = enabled ? 'var(--accent)' : ''; });
setTimeout(() => { if (TC.getSnap()) document.getElementById('snap-btn').style.color = 'var(--accent)'; }, 100);

// inline text editing overlay
function openInlineTextEditor(l) {
  closeInlineTextEditor();
  const b = TC.getBoundsRaw(l);
  const topLeft = TC.canvasToScreen({ x: b.x, y: b.y });
  const ta = document.createElement('textarea');
  ta.value = l.text || '';
  Object.assign(ta.style, {
    position: 'fixed', left: topLeft.x + 'px', top: topLeft.y + 'px',
    minWidth: (b.w * TC.getZoom() + 20) + 'px', minHeight: (b.h * TC.getZoom() + 10) + 'px',
    font: `${l.fontSize * TC.getZoom()}px "${l.fontFamily || 'Bebas Neue'}"`, color: l.color || '#fff',
    background: 'rgba(20,20,28,.92)', border: '1px dashed var(--accent)', borderRadius: '4px',
    padding: '4px', zIndex: 600, resize: 'both', outline: 'none'
  });
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  ta.addEventListener('input', () => TC.updateLayerProp('text', ta.value, { live: true }));
  ta.addEventListener('blur', () => { TC.commitLayerProp(); closeInlineTextEditor(); });
  ta.addEventListener('keydown', e => { if (e.key === 'Escape') ta.blur(); });
  textEditor = ta;
}
function closeInlineTextEditor() { if (textEditor) { textEditor.remove(); textEditor = null; } }
