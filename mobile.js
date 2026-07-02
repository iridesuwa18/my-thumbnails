/* ═══════════════════════════════════════════════════════════════
   THUMBCRAFT — MOBILE UI
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
window.addEventListener('resize', () => TC.zoomFit());

// ── TOAST ─────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show ' + (type || 'info');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
TC.on('toast', ({ msg, type }) => showToast(msg, type));
TC.on('autosaved', () => { const d = document.querySelector('.autosave-dot .status-dot'); if (d) d.style.background = 'var(--success)'; });
TC.on('history', ({ canUndo, canRedo }) => { document.getElementById('undo-btn').disabled = !canUndo; document.getElementById('redo-btn').disabled = !canRedo; });
TC.on('zoom', ({ zoom }) => { document.getElementById('zoom-val').textContent = Math.round(zoom * 100) + '%'; });

// ── DRAWER SYSTEM ─────────────────────────────────────────────
const DRAWERS = {
  elements: { title: 'Elements', tabs: [{ id: 'add', label: 'Add' }, { id: 'layers', label: 'Layers' }] },
  edit: { title: 'Edit', tabs: [{ id: 'props', label: 'Properties' }, { id: 'bg', label: 'Background' }] },
  presets: { title: 'Presets', tabs: [{ id: 'list', label: 'Presets' }] },
  sync: { title: 'GitHub Sync', tabs: [{ id: 'github', label: 'GitHub' }] }
};
let activeDrawer = null, activeDrawerTab = null;

function openDrawer(name, tab) {
  const cfg = DRAWERS[name];
  activeDrawer = name;
  document.getElementById('drawer-title').textContent = cfg.title;
  document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.drawer === name));
  const tabsEl = document.getElementById('drawer-tabs');
  if (cfg.tabs.length > 1) {
    tabsEl.style.display = 'flex';
    tabsEl.innerHTML = cfg.tabs.map(t => `<div class="drawer-tab" data-tab="${t.id}" onclick="switchDrawerTab('${name}','${t.id}')">${t.label}</div>`).join('');
  } else tabsEl.style.display = 'none';
  document.getElementById('drawer-backdrop').classList.add('show');
  document.getElementById('drawer').classList.add('show');
  switchDrawerTab(name, tab || cfg.tabs[0].id);
}
function closeDrawer() {
  document.getElementById('drawer-backdrop').classList.remove('show');
  document.getElementById('drawer').classList.remove('show');
  document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
  activeDrawer = null; activeDrawerTab = null;
}
function switchDrawerTab(name, tabId) {
  activeDrawerTab = tabId;
  document.querySelectorAll('#drawer-tabs .drawer-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.drawer-content').forEach(c => c.classList.remove('active'));
  const el = document.getElementById(`drawer-${name}-${tabId}`);
  if (el) el.classList.add('active');
  refreshDrawerContent(name, tabId);
}
function refreshDrawerContent(name, tabId) {
  if (name === 'elements' && tabId === 'add') renderAddPanel();
  if (name === 'elements' && tabId === 'layers') renderLayersList();
  if (name === 'edit' && tabId === 'props') renderPropsPanel();
  if (name === 'edit' && tabId === 'bg') renderBgPanel();
  if (name === 'presets' && tabId === 'list') renderPresetsGrid();
  if (name === 'sync' && tabId === 'github') renderGithubPanel();
}
function toggleAccordion(el) { el.classList.toggle('open'); }

// ── ADD PANEL (accordion) ────────────────────────────────────
function renderAddPanel() {
  document.getElementById('drawer-elements-add').innerHTML = `
    <div class="accordion-item open">
      <div class="accordion-head" onclick="toggleAccordion(this.parentElement)">Shapes &amp; Text <span class="chev">›</span></div>
      <div class="accordion-panel"><div class="accordion-panel-inner">
        <div class="add-grid">
          <div class="add-btn" onclick="TC.addText();closeDrawer()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5h16M12 5v14"/></svg>Text</div>
          <div class="add-btn" onclick="TC.addRect();closeDrawer()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="6" width="16" height="12" rx="1.5"/></svg>Rectangle</div>
          <div class="add-btn" onclick="TC.addEllipse();closeDrawer()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>Ellipse</div>
          <div class="add-btn" onclick="TC.addTriangle();closeDrawer()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 5l8 14H4z"/></svg>Triangle</div>
          <div class="add-btn" onclick="TC.addLine();closeDrawer()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 19L20 5"/></svg>Line</div>
          <div class="add-btn" onclick="triggerImageUpload()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M3 16l5-5 4 4 3-3 6 6"/></svg>Image</div>
        </div>
      </div></div>
    </div>
    <div class="accordion-item">
      <div class="accordion-head" onclick="toggleAccordion(this.parentElement)">Align To Canvas <span class="chev">›</span></div>
      <div class="accordion-panel"><div class="accordion-panel-inner">
        <div class="align-bar">
          <div class="align-btn" onclick="TC.alignLayer('left')"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2v12M5 5h9M5 8h6M5 11h9"/></svg></div>
          <div class="align-btn" onclick="TC.alignLayer('center-h')"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v12M3 5h10M4 8h8M3 11h10"/></svg></div>
          <div class="align-btn" onclick="TC.alignLayer('right')"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2v12M2 5h9M5 8h6M2 11h9"/></svg></div>
          <div class="align-btn" onclick="TC.alignLayer('top')"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2h12M5 5v9M8 5v6M11 5v9"/></svg></div>
          <div class="align-btn" onclick="TC.alignLayer('center-v')"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8h12M5 3v10M8 4v8M11 3v10"/></svg></div>
          <div class="align-btn" onclick="TC.alignLayer('bottom')"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 14h12M5 2v9M8 5v6M11 2v9"/></svg></div>
        </div>
      </div></div>
    </div>`;
}

// ── LAYERS LIST ───────────────────────────────────────────────
const ICONS = { text: 'T', rect: '▭', ellipse: '◯', triangle: '△', line: '╱', image: '🖼' };
let renamingId = null;
function renderLayersList(force) {
  const el = document.getElementById('drawer-elements-layers');
  const layers = TC.getLayers(), sel = TC.getSelected();
  if (!force && renamingId !== null && layers.some(l => l.id === renamingId)) return;
  if (!layers.length) { el.innerHTML = `<div style="color:var(--muted);font-size:12.5px;text-align:center;padding:30px 0;line-height:1.8">No layers yet.<br>Add elements from the <strong>Add</strong> tab.</div>`; return; }
  el.innerHTML = `<div style="font-size:10px;color:var(--muted);margin-bottom:8px">Long-press a name to rename</div><div class="layers-list">` + layers.map(l => `
    <div class="layer-item${sel && sel.id === l.id ? ' selected' : ''}" data-id="${l.id}" onclick="TC.selectLayer(${l.id});closeDrawer()">
      <span class="layer-icon" style="opacity:${l.visible ? 1 : .35}">${ICONS[l.type] || '◆'}</span>
      ${renamingId === l.id
      ? `<input class="layer-name-edit" id="rename-input" value="${esc(l.name)}" onblur="commitRename(${l.id},this.value)" onkeydown="if(event.key==='Enter')this.blur()" onclick="event.stopPropagation()">`
      : `<span class="layer-name" style="opacity:${l.visible ? 1 : .4}">${esc(l.name)}</span>`}
      <div class="layer-actions">
        <button class="layer-btn" title="Duplicate" onclick="event.stopPropagation();TC.duplicateLayer(${l.id})">📋</button>
        <button class="layer-btn" title="Visibility" onclick="event.stopPropagation();TC.toggleVisibility(${l.id})">${l.visible ? '👁' : '🚫'}</button>
        <button class="layer-btn" title="Lock" onclick="event.stopPropagation();TC.toggleLock(${l.id})">${l.locked ? '🔒' : '🔓'}</button>
        <button class="layer-btn danger" title="Delete" onclick="event.stopPropagation();TC.deleteLayer(${l.id})">✕</button>
      </div>
    </div>`).join('') + `</div>`;
}
function startRename(id) { renamingId = id; renderLayersList(true); setTimeout(() => { const i = document.getElementById('rename-input'); if (i) { i.focus(); i.select(); } }, 10); }
function commitRename(id, val) { renamingId = null; if (val.trim()) TC.renameLayer(id, val.trim()); else renderLayersList(); }

// long-press a layer name to rename it (mobile has no dblclick/F2 fallback)
(function setupLongPressRename() {
  const container = document.getElementById('drawer-elements-layers');
  let lpTimer = null, lpFired = false;
  container.addEventListener('touchstart', e => {
    const nameEl = e.target.closest('.layer-name');
    if (!nameEl) return;
    const item = nameEl.closest('.layer-item');
    lpFired = false;
    lpTimer = setTimeout(() => { lpFired = true; startRename(+item.dataset.id); }, 500);
  }, { passive: true });
  container.addEventListener('touchmove', () => clearTimeout(lpTimer), { passive: true });
  container.addEventListener('touchend', e => {
    clearTimeout(lpTimer);
    if (lpFired) { e.preventDefault(); e.stopPropagation(); }
    lpFired = false;
  });
})();
TC.on('change', () => { if (activeDrawer === 'elements' && activeDrawerTab === 'layers') renderLayersList(); });
TC.on('select', () => { if (activeDrawer === 'elements' && activeDrawerTab === 'layers') renderLayersList(); if (activeDrawer === 'edit' && activeDrawerTab === 'props') renderPropsPanel(); });

// ── PRESETS ───────────────────────────────────────────────────
function renderPresetsGrid() {
  const el = document.getElementById('drawer-presets-list');
  const presets = TC.getPresets();
  const badge = TC.gh.connected() ? 'GitHub synced' : 'local only';
  if (!presets.length) { el.innerHTML = `<div class="panel-label">Saved Presets <span class="sync-badge">${badge}</span></div><div style="color:var(--muted);font-size:12px;text-align:center;padding:30px 0;line-height:1.8">No presets yet.<br>Tap 💾 to save one.</div>`; return; }
  el.innerHTML = `<div class="panel-label">Saved Presets <span class="sync-badge">${badge}</span></div><div class="preset-grid">` + presets.map(p => `
    <div class="preset-card" onclick="TC.loadPreset('${p.id}');closeDrawer()">
      <div class="preset-thumb" style="background-image:url('${p.thumb || ''}')"></div>
      <div class="preset-name">${esc(p.name)}</div>
      <div class="preset-actions">
        <button class="preset-act-btn" onclick="event.stopPropagation();TC.updatePreset('${p.id}')">↻</button>
        <button class="preset-act-btn danger" onclick="event.stopPropagation();confirmDeletePreset('${p.id}')">✕</button>
      </div>
    </div>`).join('') + `</div>`;
}
TC.on('presets', () => { if (activeDrawer === 'presets') renderPresetsGrid(); });

function savePresetModal() { document.getElementById('modal-preset').classList.remove('hidden'); const inp = document.getElementById('preset-name-input'); inp.value = ''; setTimeout(() => inp.focus(), 50); }
function doSavePreset() {
  const name = document.getElementById('preset-name-input').value.trim() || `Preset ${TC.getPresets().length + 1}`;
  TC.savePresetNew(name); closeModal('modal-preset'); showToast(`✓ Saved "${name}"`, 'success');
}
function confirmDeletePreset(id) { showConfirm('Delete preset?', 'This removes it locally and from GitHub if connected.', () => TC.deletePresetLocal(id)); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function showConfirm(title, msg, onOk) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  const btn = document.getElementById('confirm-ok-btn');
  const clone = btn.cloneNode(true); btn.parentNode.replaceChild(clone, btn);
  clone.onclick = () => { onOk(); closeModal('modal-confirm'); };
  document.getElementById('modal-confirm').classList.remove('hidden');
}
function confirmNewCanvas() { showConfirm('Start a new canvas?', 'This clears all layers and background settings. Presets are safe.', () => TC.newCanvas()); }

// ── PROPERTIES PANEL ──────────────────────────────────────────
function renderPropsPanel() {
  const body = document.getElementById('drawer-edit-props');
  const l = TC.getSelected();
  if (!l) { body.innerHTML = `<div class="no-selection"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>Tap an element on the canvas to edit it.</div>`; return; }
  let h = `<div class="prop-row"><div class="prop-label">Name</div><input class="prop-input" value="${esc(l.name)}" oninput="TC.updateLayerProp('name',this.value,{live:true})" onblur="TC.commitLayerProp()"></div>`;
  if (l.type === 'text') h += textPropsHTML(l);
  if (l.type === 'rect' || l.type === 'ellipse' || l.type === 'triangle') h += shapePropsHTML(l);
  if (l.type === 'line') h += linePropsHTML(l);
  h += `
    <div class="props-section-title">Position &amp; Opacity</div>
    <div class="prop-row-2 prop-row">
      <div><div class="prop-label">X</div><input class="prop-input" type="number" value="${Math.round(l.x)}" oninput="TC.updateLayerProp('x',+this.value,{live:true})" onblur="TC.commitLayerProp()" ${l.locked ? 'disabled' : ''}></div>
      <div><div class="prop-label">Y</div><input class="prop-input" type="number" value="${Math.round(l.y)}" oninput="TC.updateLayerProp('y',+this.value,{live:true})" onblur="TC.commitLayerProp()" ${l.locked ? 'disabled' : ''}></div>
    </div>
    <div class="prop-row"><div class="prop-label">Opacity <span class="slider-val">${l.opacity ?? 100}%</span></div>
      <input class="prop-slider" type="range" min="0" max="100" value="${l.opacity ?? 100}" oninput="TC.updateLayerProp('opacity',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'%'" onchange="TC.commitLayerProp()"></div>
    <div style="font-size:10.5px;color:var(--muted);text-align:center;margin-top:6px">Rotation &amp; size are set from the dial on the canvas — tap the element to see it.</div>`;
  body.innerHTML = h;
}

function textPropsHTML(l) {
  const fonts = ['Bebas Neue', 'Impact', 'Arial Black', 'DM Sans', 'Space Mono', 'Georgia', 'Verdana', 'Courier New', 'Tahoma', 'Trebuchet MS'];
  const weights = ['300', '400', '500', '600', '700', '900'];
  return `
    <div class="props-section-title">Character</div>
    <div class="prop-row"><div class="prop-label">Text</div><textarea class="prop-textarea" oninput="TC.updateLayerProp('text',this.value,{live:true})" onblur="TC.commitLayerProp()">${esc(l.text || '')}</textarea></div>
    <div class="prop-row"><div class="prop-label">Font</div><select class="prop-select" onchange="TC.updateLayerProp('fontFamily',this.value)">${fonts.map(f => `<option value="${f}"${l.fontFamily === f ? ' selected' : ''}>${f}</option>`).join('')}</select></div>
    <div class="prop-row-2 prop-row">
      <div><div class="prop-label">Weight</div><select class="prop-select" onchange="TC.updateLayerProp('fontWeight',this.value)">${weights.map(w => `<option value="${w}"${(l.fontWeight || '400') === w ? ' selected' : ''}>${w}</option>`).join('')}</select></div>
      <div><div class="prop-label">Style</div><select class="prop-select" onchange="TC.updateLayerProp('textStyle',this.value)">${['normal', 'badge', 'outline'].map(s => `<option value="${s}"${l.textStyle === s ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="prop-row"><div class="prop-label">Letter Spacing <span class="slider-val">${l.letterSpacing || 0}px</span></div><input class="prop-slider" type="range" min="-5" max="40" value="${l.letterSpacing || 0}" oninput="TC.updateLayerProp('letterSpacing',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'px'" onchange="TC.commitLayerProp()"></div>
    <div class="prop-row"><div class="prop-label">Line Height <span class="slider-val">${(l.lineHeight || 1.2).toFixed(2)}</span></div><input class="prop-slider" type="range" min="0.8" max="3" step="0.05" value="${l.lineHeight || 1.2}" oninput="TC.updateLayerProp('lineHeight',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=(+this.value).toFixed(2)" onchange="TC.commitLayerProp()"></div>
    <div class="prop-row"><div class="prop-label" style="margin-bottom:5px">Alignment</div><div class="pill-toggle">${['left', 'center', 'right'].map(a => `<button class="${(l.textAlign || 'left') === a ? 'active' : ''}" onclick="TC.updateLayerProp('textAlign','${a}')">${a}</button>`).join('')}</div></div>
    <div class="props-section-title">Color &amp; Fill</div>
    <div class="prop-row"><div class="prop-label">Text Color</div><div class="prop-color-row"><input class="prop-color" type="color" value="${toHex(l.color || '#fff')}" oninput="TC.updateLayerProp('color',this.value,{live:true})" onchange="TC.commitLayerProp()"><input class="prop-input" value="${l.color || '#ffffff'}" oninput="TC.updateLayerProp('color',this.value,{live:true})" onblur="TC.commitLayerProp()" style="flex:1"></div></div>
    ${l.textStyle === 'badge' ? `<div class="prop-row"><div class="prop-label">Badge Background</div><input class="prop-color" type="color" value="${toHex(l.bgFill || '#f5c518')}" oninput="TC.updateLayerProp('bgFill',this.value,{live:true})" onchange="TC.commitLayerProp()" style="width:100%;height:36px;padding:2px"></div>` : ''}
    <div class="props-section-title">Outline &amp; Shadow</div>
    <div class="prop-row"><div class="prop-label">Outline Width <span class="slider-val">${l.outlineW || 0}px</span></div><input class="prop-slider" type="range" min="0" max="20" value="${l.outlineW || 0}" oninput="TC.updateLayerProp('outlineW',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'px'" onchange="TC.commitLayerProp()"></div>
    <div class="prop-row"><div class="prop-label">Outline Color</div><input class="prop-color" type="color" value="${toHex(l.outlineColor || '#000')}" oninput="TC.updateLayerProp('outlineColor',this.value,{live:true})" onchange="TC.commitLayerProp()" style="width:100%;height:36px;padding:2px"></div>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text2);margin-bottom:8px"><input type="checkbox" ${l.shadow ? 'checked' : ''} onchange="TC.updateLayerProp('shadow',this.checked)" style="accent-color:var(--accent);width:18px;height:18px"> Drop Shadow</label>
    ${l.shadow ? `
    <div class="prop-row"><div class="prop-label">Shadow Color</div><input class="prop-color" type="color" value="${toHex(l.shadowColor || '#000')}" oninput="TC.updateLayerProp('shadowColor',this.value,{live:true})" onchange="TC.commitLayerProp()" style="width:100%;height:36px;padding:2px"></div>
    <div class="prop-row"><div class="prop-label">Shadow Blur <span class="slider-val">${l.shadowBlur ?? 10}px</span></div><input class="prop-slider" type="range" min="0" max="40" value="${l.shadowBlur ?? 10}" oninput="TC.updateLayerProp('shadowBlur',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'px'" onchange="TC.commitLayerProp()"></div>` : ''}`;
}
function shapePropsHTML(l) {
  const fillAlpha = getAlpha(l.fill);
  return `
    <div class="props-section-title">Fill &amp; Stroke</div>
    <div class="prop-row"><div class="prop-label">Fill Color</div><div class="prop-color-row"><input class="prop-color" type="color" value="${toHex(l.fill || '#f5c518')}" oninput="setShapeFillColor(this.value)"><input class="prop-input" value="${toHex(l.fill || '#f5c518')}" oninput="setShapeFillColor(this.value)" style="flex:1"></div></div>
    <div class="prop-row"><div class="prop-label">Fill Alpha <span class="slider-val">${Math.round(fillAlpha * 100)}%</span></div><input class="prop-slider" type="range" min="0" max="100" value="${Math.round(fillAlpha * 100)}" oninput="setShapeFillAlpha(+this.value/100,true);this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'%'" onchange="setShapeFillAlpha(+this.value/100,false)"></div>
    <div class="prop-row"><div class="prop-label">Stroke Color</div><input class="prop-color" type="color" value="${toHex(l.stroke || '#ffffff')}" oninput="setShapeStrokeColor(this.value)" style="width:100%;height:36px;padding:2px"></div>
    <div class="prop-row"><div class="prop-label">Stroke Width <span class="slider-val">${l.strokeW || 0}px</span></div><input class="prop-slider" type="range" min="0" max="30" value="${l.strokeW || 0}" oninput="TC.updateLayerProp('strokeW',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'px'" onchange="TC.commitLayerProp()"></div>
    ${l.type === 'rect' ? `<div class="prop-row"><div class="prop-label">Corner Radius <span class="slider-val">${l.radius || 0}px</span></div><input class="prop-slider" type="range" min="0" max="80" value="${l.radius || 0}" oninput="TC.updateLayerProp('radius',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'px'" onchange="TC.commitLayerProp()"></div>` : ''}`;
}
function setShapeFillColor(hex) { const l = TC.getSelected(); const a = getAlpha(l.fill); TC.updateLayerProp('fill', TC.util.hexToRgba(hex, a)); }
function setShapeFillAlpha(a, live) { const l = TC.getSelected(); const hex = toHex(l.fill); TC.updateLayerProp('fill', TC.util.hexToRgba(hex, a), { live }); }
function setShapeStrokeColor(hex) { TC.updateLayerProp('stroke', hex); }
function linePropsHTML(l) {
  return `
    <div class="props-section-title">Line</div>
    <div class="prop-row"><div class="prop-label">Color</div><input class="prop-color" type="color" value="${toHex(l.stroke || '#f5c518')}" oninput="setShapeStrokeColor(this.value)" style="width:100%;height:36px;padding:2px"></div>
    <div class="prop-row"><div class="prop-label">Thickness <span class="slider-val">${l.strokeW || 4}px</span></div><input class="prop-slider" type="range" min="1" max="40" value="${l.strokeW || 4}" oninput="TC.updateLayerProp('strokeW',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'px'" onchange="TC.commitLayerProp()"></div>`;
}

// ── BACKGROUND PANEL ──────────────────────────────────────────
function renderBgPanel() {
  const body = document.getElementById('drawer-edit-bg');
  const bg = TC.getBg();
  body.innerHTML = `
    <div class="props-section-title">Fill</div>
    <div class="prop-row"><div class="prop-label">Base Color</div><div class="prop-color-row"><input class="prop-color" type="color" value="${bg.color}" oninput="TC.setBgProp('color',this.value,{live:true})" onchange="TC.commitBgProp()"><input class="prop-input" value="${bg.color}" oninput="TC.setBgProp('color',this.value,{live:true})" onblur="TC.commitBgProp()" style="flex:1"></div></div>
    <div class="props-section-title">Image</div>
    ${bg.imageSrc ? `<div class="bg-image-chip">✓ ${esc(bg.imageName || 'image')} <span style="margin-left:auto" onclick="TC.clearBgImage()">✕</span></div>` : ''}
    <button class="btn btn-ghost" style="width:100%;justify-content:center;margin-bottom:6px" onclick="document.getElementById('bg-upload').click()">${bg.imageSrc ? 'Replace Image' : 'Upload Image'}</button>
    <div class="props-section-title">Size &amp; Position</div>
    <div class="prop-row"><div class="prop-label">Zoom <span class="slider-val">${Math.round(bg.zoom * 100)}%</span></div><input class="prop-slider" type="range" min="0.5" max="3" step="0.01" value="${bg.zoom}" oninput="TC.setBgProp('zoom',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=Math.round(this.value*100)+'%'" onchange="TC.commitBgProp()"></div>
    <div class="prop-row-2 prop-row">
      <div><div class="prop-label">Position X</div><input class="prop-input" type="number" value="${bg.offsetX}" oninput="TC.setBgProp('offsetX',+this.value,{live:true})" onblur="TC.commitBgProp()"></div>
      <div><div class="prop-label">Position Y</div><input class="prop-input" type="number" value="${bg.offsetY}" oninput="TC.setBgProp('offsetY',+this.value,{live:true})" onblur="TC.commitBgProp()"></div>
    </div>
    <div class="prop-row"><div class="prop-label">Rotation <span class="slider-val">${bg.rotation}°</span></div><input class="prop-slider" type="range" min="-180" max="180" value="${bg.rotation}" oninput="TC.setBgProp('rotation',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'°'" onchange="TC.commitBgProp()"></div>
    <div class="props-section-title">Overlay</div>
    <div class="prop-row"><div class="prop-label">Overlay Color</div><input class="prop-color" type="color" value="${bg.overlayColor}" oninput="TC.setBgProp('overlayColor',this.value,{live:true})" onchange="TC.commitBgProp()" style="width:100%;height:36px;padding:2px"></div>
    <div class="prop-row"><div class="prop-label">Overlay Opacity <span class="slider-val">${bg.overlayOpacity}%</span></div><input class="prop-slider" type="range" min="0" max="100" value="${bg.overlayOpacity}" oninput="TC.setBgProp('overlayOpacity',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'%'" onchange="TC.commitBgProp()"></div>
    <div class="props-section-title">Adjustments</div>
    <div class="prop-row"><div class="prop-label">Blur <span class="slider-val">${bg.blur || 0}px</span></div><input class="prop-slider" type="range" min="0" max="20" value="${bg.blur || 0}" oninput="TC.setBgProp('blur',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'px'" onchange="TC.commitBgProp()"></div>
    <div class="prop-row"><div class="prop-label">Brightness <span class="slider-val">${bg.brightness ?? 100}%</span></div><input class="prop-slider" type="range" min="30" max="200" value="${bg.brightness ?? 100}" oninput="TC.setBgProp('brightness',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'%'" onchange="TC.commitBgProp()"></div>
    <div class="prop-row"><div class="prop-label">Contrast <span class="slider-val">${bg.contrast ?? 100}%</span></div><input class="prop-slider" type="range" min="30" max="200" value="${bg.contrast ?? 100}" oninput="TC.setBgProp('contrast',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'%'" onchange="TC.commitBgProp()"></div>
    <div class="prop-row"><div class="prop-label">Saturation <span class="slider-val">${bg.saturate ?? 100}%</span></div><input class="prop-slider" type="range" min="0" max="200" value="${bg.saturate ?? 100}" oninput="TC.setBgProp('saturate',+this.value,{live:true});this.previousElementSibling.querySelector('.slider-val').textContent=this.value+'%'" onchange="TC.commitBgProp()"></div>`;
}
document.getElementById('bg-upload').addEventListener('change', e => { if (e.target.files[0]) TC.loadBgImage(e.target.files[0]); setTimeout(renderBgPanel, 300); e.target.value = ''; });
document.getElementById('img-upload').addEventListener('change', e => { if (e.target.files[0]) TC.addImage(e.target.files[0]); e.target.value = ''; closeDrawer(); });
function triggerImageUpload() { document.getElementById('img-upload').click(); }

// ── GITHUB PANEL ──────────────────────────────────────────────
function renderGithubPanel() {
  const body = document.getElementById('drawer-sync-github');
  const cfg = TC.gh.getConfig();
  if (!TC.gh.connected()) {
    body.innerHTML = `
      <div class="panel-label">🔐 GitHub Sync</div>
      <div style="font-size:11.5px;color:var(--muted);line-height:1.6;margin-bottom:12px">Each preset is stored as its own JSON file in a folder in your repo.</div>
      <div class="prop-row"><div class="prop-label">Personal Access Token</div><input class="prop-input" type="password" id="gh-token" placeholder="ghp_xxxxxxxxxxxx"></div>
      <div class="prop-row"><div class="prop-label">Repository</div><input class="prop-input" id="gh-repo" placeholder="username/my-thumbnails" value="${esc(cfg.repo)}"></div>
      <div class="prop-row"><div class="prop-label">Presets Folder</div><input class="prop-input" id="gh-folder" placeholder="presets" value="${esc(cfg.folder || 'presets')}"></div>
      <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="doGhConnect()">Save &amp; Connect</button>`;
    return;
  }
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px"><div class="status-dot ok"></div><span style="font-size:13px;font-weight:600;color:var(--success)">Connected</span></div>
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:12.5px;margin-bottom:12px">
      <div style="color:var(--muted)">Repository</div><div style="font-weight:600">${esc(cfg.repo)}</div>
      <div style="color:var(--muted);margin-top:8px">Folder</div><div style="font-weight:600">${esc(cfg.folder)}/*.json</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:10px">
      <button class="btn btn-ghost" style="justify-content:center" onclick="doGhLoad()">⬇ Load All</button>
      <button class="btn btn-primary" style="justify-content:center" onclick="doGhSaveAll()">⬆ Save All</button></div>
    <button class="btn btn-ghost" style="width:100%;justify-content:center" onclick="TC.gh.disconnect();renderGithubPanel()">🔓 Change Credentials</button>`;
}
async function doGhConnect() {
  const token = document.getElementById('gh-token').value.trim();
  const repo = document.getElementById('gh-repo').value.trim();
  const folder = document.getElementById('gh-folder').value.trim() || 'presets';
  if (!token || !repo) { showToast('Enter both token and repository', 'error'); return; }
  showToast('Verifying…', 'info');
  try { await TC.gh.connect(token, repo, folder); showToast('✓ GitHub connected', 'success'); renderGithubPanel(); } catch (e) { showToast(e.message, 'error'); }
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
  twEl.style.left = TC.util.clamp(anchor.x, 90, window.innerWidth - 90) + 'px';
  twEl.style.top = Math.max(anchor.y, 60) + 'px';
  twLock.textContent = l.locked ? '🔒' : '🔓';
  twLock.classList.toggle('locked', !!l.locked);
  const mode = TC.getTransformMode();
  twRotate.classList.toggle('active', mode === 'rotate');
  twResize.classList.toggle('active', mode === 'resize');
  const cfg = TC.getTransformSliderConfig();
  twSlider.min = cfg.min; twSlider.max = cfg.max; twSlider.step = cfg.step;
  if (document.activeElement !== twSlider && document.activeElement !== twNum) { twSlider.value = cfg.value; twNum.value = cfg.value; }
  twSlider.disabled = !!l.locked; twNum.disabled = !!l.locked;
}
TC.on('rendered', updateTransformWidget);
TC.on('zoom', updateTransformWidget);
TC.on('transformmode', updateTransformWidget);
twLock.onclick = () => { const l = TC.getSelected(); if (l) { TC.toggleLock(l.id); if (activeDrawer === 'edit') renderPropsPanel(); } };
twRotate.onclick = () => TC.setTransformMode('rotate');
twResize.onclick = () => TC.setTransformMode('resize');
const twDelete = document.getElementById('tw-delete');
twDelete.onclick = () => {
  const l = TC.getSelected(); if (!l) return;
  showConfirm('Delete this element?', `This removes "${l.name}" from the canvas. This can't be undone.`, () => TC.deleteSelected());
};
twSlider.oninput = () => { twNum.value = twSlider.value; TC.applyTransformValue(+twSlider.value, { commit: false }); };
twSlider.onchange = () => TC.applyTransformValue(+twSlider.value, { commit: true });
twNum.addEventListener('input', () => { const v = parseFloat(twNum.value); if (!isNaN(v)) { const cfg = TC.getTransformSliderConfig(); twSlider.value = TC.util.clamp(v, cfg.min, cfg.max); TC.applyTransformValue(v, { commit: false }); } });
twNum.addEventListener('blur', () => { const v = parseFloat(twNum.value); if (!isNaN(v)) TC.applyTransformValue(v, { commit: true }); });

// ── TOUCH CANVAS INTERACTION (drag + pinch-zoom) ─────────────────
const canvasArea = document.getElementById('canvas-area');
let touchMode = null; // 'drag' | 'pinch' | null
let pinchStartDist = 0, pinchStartZoom = 1, textEditor = null;

function dist(t1, t2) { return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY); }

canvasArea.addEventListener('touchstart', e => {
  if (e.target.closest('.transform-widget')) return;
  if (e.touches.length === 2) {
    touchMode = 'pinch';
    pinchStartDist = dist(e.touches[0], e.touches[1]);
    pinchStartZoom = TC.getZoom();
    e.preventDefault();
  } else if (e.touches.length === 1) {
    touchMode = 'drag';
    const t = e.touches[0];
    TC.pointerDown(t.clientX, t.clientY);
    e.preventDefault();
  }
}, { passive: false });

canvasArea.addEventListener('touchmove', e => {
  if (touchMode === 'pinch' && e.touches.length === 2) {
    const d = dist(e.touches[0], e.touches[1]);
    TC.setZoom(pinchStartZoom * (d / pinchStartDist));
    e.preventDefault();
  } else if (touchMode === 'drag' && e.touches.length === 1) {
    const t = e.touches[0];
    TC.pointerMove(t.clientX, t.clientY);
    e.preventDefault();
  }
}, { passive: false });

canvasArea.addEventListener('touchend', e => {
  if (touchMode === 'drag') TC.pointerUp();
  if (e.touches.length === 0) touchMode = null;
});

// double-tap to edit text
let lastTap = 0;
canvasArea.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTap < 320 && e.changedTouches.length === 1) {
    const t = e.changedTouches[0];
    const pos = TC.screenToCanvas(t.clientX, t.clientY);
    const l = TC.hitTestTopmost(pos);
    if (l && l.type === 'text' && !l.locked) openInlineTextEditor(l);
  }
  lastTap = now;
});

function openInlineTextEditor(l) {
  closeInlineTextEditor();
  const b = TC.getBoundsRaw(l);
  const topLeft = TC.canvasToScreen({ x: b.x, y: b.y });
  const ta = document.createElement('textarea');
  ta.value = l.text || '';
  Object.assign(ta.style, {
    position: 'fixed', left: Math.max(6, topLeft.x) + 'px', top: topLeft.y + 'px',
    minWidth: Math.min(b.w * TC.getZoom() + 20, window.innerWidth - 20) + 'px', minHeight: (b.h * TC.getZoom() + 10) + 'px',
    font: `${Math.max(12, l.fontSize * TC.getZoom())}px "${l.fontFamily || 'Bebas Neue'}"`, color: l.color || '#fff',
    background: 'rgba(20,20,28,.95)', border: '1px dashed var(--accent)', borderRadius: '4px', padding: '4px', zIndex: 600, outline: 'none'
  });
  document.body.appendChild(ta);
  ta.focus();
  ta.addEventListener('input', () => TC.updateLayerProp('text', ta.value, { live: true }));
  ta.addEventListener('blur', () => { TC.commitLayerProp(); closeInlineTextEditor(); });
  textEditor = ta;
}
function closeInlineTextEditor() { if (textEditor) { textEditor.remove(); textEditor = null; } }
// tapping anywhere outside the editor commits the text and closes it
document.addEventListener('touchstart', e => { if (textEditor && !textEditor.contains(e.target)) textEditor.blur(); }, true);
document.addEventListener('mousedown', e => { if (textEditor && !textEditor.contains(e.target)) textEditor.blur(); }, true);

// keyboard support for external keyboards / iPad
document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { if (TC.getSelected()) { TC.deleteSelected(); e.preventDefault(); } }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.shiftKey ? TC.redo() : TC.undo(); e.preventDefault(); }
});
