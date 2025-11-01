// (no change to this line, it's just a constant, real drawing logic is elsewhere)
const WEEEK_API_BASE = 'https://api.weeek.net/v1';
const WEEEK_TOKEN = 'b06bcb7d-1a9d-4f2b-bdcc-12e9dedc5ceb';

// =====================
// Minimal CSS injection for vanilla experience (for github pages / static hosting)
(function injectBaseStyles() {
  if (document.getElementById('___siteplanner_css')) return;
  const style = document.createElement('style');
  style.id = '___siteplanner_css';
  style.innerHTML = `
    body { font-family: system-ui, sans-serif; margin: 0; background: #f7fafc; }
    .toolbar-btn, .btn {
      background: #e0e7ef; border: none; padding: 0.5em 1em; margin: 3px; border-radius:3px; cursor:pointer;
      transition: background 0.15s;
    }
    .toolbar-btn:hover, .btn:hover { background: #bae6fd; }
    .toolbar-btn.active, .btn.active { background: #38bdf8; color: #fff; }
    .zone-list-item { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
    .zone-color-box { width: 1.5em; height: 1.5em; border-radius: 3px; display:inline-block;}
    #drawFinishMsg { color: #166534; font-size: 0.95em; margin: 3px 0 10px 0; }
    #colorPalette {margin:6px 0 4px 0;display:flex;gap:8px;}
    #colorPalette .palette-color {width: 28px; height: 28px; cursor:pointer; border:2px solid #fff;border-radius:5px;}
    #colorPalette .palette-color.selected {border:2px solid #222;}
    .zone-edit-row{display:flex;align-items:center;gap:7px;}
    .zone-edit-input{padding:0.25em 0.4em;border-radius:3px;border:1px solid #d1d5db;}
    .zone-edit-save {background:#22c55e; color:#fff;}
    .zone-edit-cancel {background:#fca5a5;}
    #zoneLayer { pointer-events: none; }
  `;
  document.head.appendChild(style);
})();

let state = { zones: [], image: null };

// --- Drawing Section ---

function showMessage(msg) {
  let el = document.getElementById('zoneHint');
  if (el) {
    el.innerHTML = `<span style="color:#2563eb;">${msg}</span>`;
  }
}

function renderToolbar() {
  document.getElementById('toolbar').innerHTML = `
    <button class="toolbar-btn" onclick="App.uploadImage()">Загрузить план</button>
    <button class="toolbar-btn" onclick="App.saveProject()">Сохранить проект</button>
    <button class="toolbar-btn" onclick="App.exportJSON()">Скачать JSON</button>
    <button class="toolbar-btn" onclick="App.importJSON()">Загрузить JSON</button>
    <button class="toolbar-btn${window.currentTool==='draw'?' active':''}" id="drawZoneBtn"
      onclick="App.toggleDrawMode()"
    >${window.currentTool==='draw'?'[Режим рисования]':'Рисовать зону'}</button>
    <input id="fileInput" type="file" accept="image/*" style="display:none" />
    <input id="jsonInput" type="file" accept=".json" style="display:none" />
  `;
}

// Drawing mode toggle
function toggleDrawMode() {
  if (window.currentTool === 'draw') {
    cancelDrawingZone();
  } else {
    startDrawingZone();
  }
}

function startDrawingZone() {
  window.currentTool = 'draw';
  window.drawingZone = { pts: [], mode: 'poly', color: randomColor(), name: "" };
  showCustomDrawingUI();
  renderZones();
  setupSVGLayer();
}

function cancelDrawingZone() {
  window.currentTool = null;
  window.drawingZone = null;
  removeCustomDrawingUI();
  showMessage('Режим рисования зоны отменён.');
  renderZones();
  setupSVGLayer();
}

function finishZoneDraw() {
  if (!window.drawingZone || window.drawingZone.pts.length < (window.drawingZone.mode === 'rect' ? 2 : 3)) return;
  let pts = window.drawingZone.pts;
  if (window.drawingZone.mode === 'rect' && pts.length > 2) pts = pts.slice(0,2);
  const name = (window.drawingZone.name || '').trim() || ('Зона ' + (state.zones.length + 1));
  const color = window.drawingZone.color || randomColor(state.zones.length);
  const id = generateId();
  state.zones.push({ id, name, color, points: pts });
  window.drawingZone = null;
  window.currentTool = null;
  App.saveProject && App.saveProject();
  removeCustomDrawingUI();
  renderZones();
  renderZoneList();
  showMessage('Зона добавлена!');
}

function generateId() {
  return 'z' + Math.random().toString(36).substr(2, 5);
}
function randomColor() {
  const arr = ['#38bdf8', '#64748b', '#22d3ee', '#34d399', '#a3e635', '#fde047', '#fb7185', '#c084fc',
               '#facc15', '#f87171', '#eab308', '#6366f1', '#14b8a6', '#059669', '#c026d3', '#57534e'];
  return arr[Math.floor(Math.random() * arr.length)];
}

function setupSVGLayer() {
  const svg = document.getElementById('zoneLayer');
  const img = document.getElementById('planImg');
  if (!svg || !img) return;

  svg.setAttribute('width', img.width);
  svg.setAttribute('height', img.height);
  svg.style.left = img.offsetLeft + 'px';
  svg.style.top = img.offsetTop + 'px';
  svg.style.position = 'absolute';
  svg.style.pointerEvents = (window.currentTool === 'draw') ? 'auto' : 'none';

  svg.onmousedown = null;
  svg.onmousemove = null;
  svg.ondblclick = null;
  svg.oncontextmenu = null;

  if (window._draw_keydown_listener) window.removeEventListener('keydown', window._draw_keydown_listener);

  // Drawing interactions
  if (window.currentTool === 'draw') {
    svg.onmousedown = (e) => {
      if (e.button !== 0) return;
      const pt = relCoords(svg, e);
      if (!window.drawingZone) window.drawingZone = { pts: [], mode: 'poly', color: randomColor(), name: "" };
      window.drawingZone.pts.push([pt.x, pt.y]);
      renderZones();
    };
    svg.onmousemove = (e) => {
      if (window.drawingZone && window.drawingZone.pts.length) {
        const pt = relCoords(svg, e);
        let tempZone = {...window.drawingZone};
        if (tempZone.mode === 'poly') {
          tempZone._preview = [pt.x, pt.y];
        }
        renderZones(tempZone);
      }
    };
    svg.oncontextmenu = (e) => {
      e.preventDefault();
      if (window.drawingZone && window.drawingZone.pts.length === 1) {
        window.drawingZone.mode = 'rect';
        showCustomDrawingUI('rect');
        showMessage('Перетащите мышь и отпустите — будет прямоугольник. Enter — завершить, Esc — отменить.');
      }
      return false;
    };

    window._draw_keydown_listener = function(e) {
      if (e.key === "Escape" && window.currentTool === 'draw') {
        cancelDrawingZone();
      }
      // Enter: accept, only active in drawing
      if ((e.key === "Enter" || e.key === "NumpadEnter") && window.currentTool === 'draw') {
        finishZoneDraw();
      }
      // Delete/remove last point, if needed: Backspace
      if (e.key === "Backspace" && window.currentTool === 'draw' && window.drawingZone && window.drawingZone.pts.length > 0) {
        window.drawingZone.pts.pop();
        renderZones();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', window._draw_keydown_listener);
  }
}

function relCoords(svg, e) {
  const rect = svg.getBoundingClientRect();
  return {
    x: Math.round(e.clientX - rect.left),
    y: Math.round(e.clientY - rect.top)
  };
}

function renderZones(tempPreviewZone = null) {
  const svg = document.getElementById('zoneLayer');
  const img = document.getElementById('planImg');
  if (!svg || !img) return;
  svg.setAttribute('width', img.width);
  svg.setAttribute('height', img.height);

  svg.innerHTML = `
    ${(state.zones||[]).map(zone => zoneSVG(zone)).join('')}
    ${(window.drawingZone || tempPreviewZone) ? drawPreviewSVG((window.drawingZone||tempPreviewZone)) : ''}
  `;

  // Hover/click for ready zones
  if (window.currentTool !== 'draw') {
    [...svg.querySelectorAll('polygon,rect')].forEach((el, idx) => {
      el.addEventListener('mouseenter', () => {
        el.setAttribute('opacity', 0.6);
        showZoneHint(state.zones[idx]);
      });
      el.addEventListener('mouseleave', () => {
        el.setAttribute('opacity', 0.3);
        hideZoneHint();
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });
  }
}

function drawPreviewSVG(draw) {
  let pts = draw.pts ? draw.pts.slice() : [];
  if (draw._preview) {
    pts = pts.concat([draw._preview]);
  }
  if (!pts.length) return '';
  if (draw.mode === 'rect' && pts.length >= 2) {
    const [a, b] = pts;
    const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
    const w = Math.abs(a[0] - b[0]), h = Math.abs(a[1] - b[1]);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${window.drawingZone ? window.drawingZone.color : '#3b82f6'}" opacity="0.25" stroke="#222" stroke-width="2" />`;
  }
  if (pts.length === 1)
    return `<circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="6" fill="${window.drawingZone ? window.drawingZone.color : '#3b82f6'}" />`;
  return `<polyline points="${pts.map(pt=>pt.join(',')).join(' ')}" fill="none" stroke="${window.drawingZone ? window.drawingZone.color : '#3b82f6'}" stroke-width="2" />`;
}

function zoneSVG(zone) {
  const color = zone.color || '#38bdf8';
  if (zone.points.length === 2) {
    const [a, b] = zone.points;
    const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
    const w = Math.abs(a[0]-b[0]), h = Math.abs(a[1]-b[1]);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" opacity="0.3" stroke="#222" stroke-width="2" />`
  }
  if (zone.points.length > 2) {
    const pts = zone.points.map(pt => pt.join(',')).join(' ');
    return `<polygon points="${pts}" fill="${color}" opacity="0.3" stroke="#222" stroke-width="2" />`
  }
  return '';
}

function showZoneHint(zone) {
  document.getElementById('zoneHint').innerHTML =
    `<b style="color:${zone.color};">${zone.name}</b>`;
}
function hideZoneHint() {
  document.getElementById('zoneHint').innerHTML = '';
}

function removeCustomDrawingUI() {
  const finish = document.getElementById('drawFinishMsg');
  if (finish) finish.remove();
  const pal = document.getElementById('colorPalette');
  if (pal) pal.remove();
  const n = document.getElementById('zoneNameInput');
  if (n) n.remove();
}

function showCustomDrawingUI(forceMode) {
  // Remove existing elements just in case
  removeCustomDrawingUI();

  const main = document.getElementById('main');
  if (!main) return;

  // Finish instructions
  const msg = document.createElement('div');
  msg.id = 'drawFinishMsg';
  msg.textContent = `Рисование зоны: Назначьте имя и выберите цвет. Нажмите Enter для завершения, Esc — отменить${forceMode === 'rect' ? ', либо отпустите мышь для прямоугольника' : ''}. Backspace — удалить последнюю точку.`;
  main.prepend(msg);

  // Color palette
  const colorArr = ['#38bdf8', '#64748b', '#22d3ee', '#34d399', '#a3e635', '#fde047', '#fb7185', '#c084fc',
                    '#facc15', '#f87171', '#eab308', '#6366f1', '#14b8a6', '#059669', '#c026d3', '#57534e'];
  const palette = document.createElement('div');
  palette.id = 'colorPalette';

  colorArr.forEach(color => {
    const node = document.createElement('div');
    node.className = 'palette-color' + (window.drawingZone && window.drawingZone.color === color ? " selected" : "");
    node.style.background = color;
    node.tabIndex = 0;
    node.title = color;
    node.onclick = () => {
      if (window.drawingZone) window.drawingZone.color = color;
      [...palette.children].forEach(e => e.classList.remove('selected'));
      node.classList.add('selected');
      renderZones();
    };
    palette.appendChild(node);
  });
  main.prepend(palette);

  // Input for name
  const namInput = document.createElement('input');
  namInput.id = 'zoneNameInput';
  namInput.className = 'zone-edit-input';
  namInput.type = 'text';
  namInput.maxLength = 64;
  namInput.placeholder = 'Название зоны';
  namInput.value = window.drawingZone && window.drawingZone.name ? window.drawingZone.name : '';
  namInput.style.margin = "0 7px 0 0";
  namInput.oninput = function() {
    if (window.drawingZone) window.drawingZone.name = this.value;
  };
  main.prepend(namInput);
  setTimeout(()=>namInput.focus(), 70);
}

// ============= ZONE EDIT/DELETE =============

function renderZoneList() {
  const el = document.getElementById('zoneList');
  if (!el) return;
  let editingId = window.zoneEditId || null;

  el.innerHTML = `<div style="margin-top:18px;">
    <h3 style="font-weight:bold;margin-bottom:8px;">Зоны:</h3>
    <div>
      ${(state.zones||[]).map(zone => {
        if (editingId === zone.id) {
          // Editing
          return `
            <form class="zone-list-item" style="background:${zone.color}22;border-radius:4px;" onsubmit="App.saveEditedZone && App.saveEditedZone('${zone.id}');return false;">
              <span class="zone-color-box" style="background:${zone.color};"></span>
              <input type="text" class="zone-edit-input" id="editName_${zone.id}" style="width:8em;" maxlength="64" value="${zone.name}" />
              <span id="editPalette_${zone.id}" style="display:flex;gap:3px;"></span>
              <button type="submit" class="btn zone-edit-save">💾</button>
              <button type="button" class="btn zone-edit-cancel" onclick="App.cancelEditZone && App.cancelEditZone('${zone.id}')">✕</button>
            </form>
          `;
        }
        // Normal
        return `
          <div class="zone-list-item" style="background:${zone.color}22;border-radius:4px;">
            <span class="zone-color-box" style="background:${zone.color};"></span>
            <span>${zone.name}</span>
            <button class="btn" onclick="App.editZone && App.editZone('${zone.id}')">✎</button>
            <button class="btn" onclick="App.deleteZone && App.deleteZone('${zone.id}')">🗑️</button>
          </div>
        `;
      }).join('')}
    </div>
  </div>`;

  // Render in-place palette for edit row
  if (editingId) {
    const paletteCont = document.getElementById(`editPalette_${editingId}`);
    if (paletteCont) {
      const currZone = state.zones.find(z => z.id === editingId);
      const colorArr = ['#38bdf8', '#64748b', '#22d3ee', '#34d399', '#a3e635', '#fde047', '#fb7185', '#c084fc',
                        '#facc15', '#f87171', '#eab308', '#6366f1', '#14b8a6', '#059669', '#c026d3', '#57534e'];
      colorArr.forEach(color => {
        const node = document.createElement('div');
        node.className = 'palette-color' + (currZone.color === color ? " selected" : "");
        node.style.background = color;
        node.tabIndex = 0;
        node.title = color;
        node.onclick = () => {
          currZone.color = color;
          renderZoneList();
          renderZones();
        };
        paletteCont.appendChild(node);
      });
    }
  }
}

// Draw/kanban API for App
App = window.App || {};
App.toggleDrawMode = toggleDrawMode;
App.startDrawingZone = startDrawingZone;
App.cancelDrawingZone = cancelDrawingZone;
App.renderZones = renderZones;
App.setupSVGLayer = setupSVGLayer;

// Zone list edit/delete logic
App.editZone = function(id) {
  window.zoneEditId = id;
  renderZoneList();
  setTimeout(() => {
    const inp = document.getElementById('editName_' + id);
    if (inp) inp.focus();
  }, 30);
};
App.cancelEditZone = function(id) {
  window.zoneEditId = null;
  renderZoneList();
};
App.saveEditedZone = function(id) {
  const inp = document.getElementById('editName_' + id);
  if (inp) {
    const val = inp.value.trim();
    if (!val) return;
    const z = state.zones.find(z=>z.id===id);
    if (z) z.name = val;
    window.zoneEditId = null;
    App.saveProject && App.saveProject();
    renderZoneList();
    renderZones();
  }
};
App.deleteZone = function(id) {
  if (!confirm('Удалить зону?')) return;
  state.zones = state.zones.filter(z => z.id !== id);
  window.zoneEditId = null;
  App.saveProject && App.saveProject();
  renderZoneList();
  renderZones();
};
App.getZoneById = function(zoneId) {
  return state.zones.find(z => z.id === zoneId);
};

// ===================== SPA =========================

const App2 = (() => {
  state = {
    image: null,
    zones: [],
    tasks: [],
  };

  // ========== Storage ===========
  const LS_KEY = 'site-planner-project';

  function saveProject() {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }
  function loadProject() {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      try {
        state = JSON.parse(raw);
      } catch (e) {
        alert('Ошибка загрузки сохранения, будет начат новый проект.');
        state = { image: null, zones: [], tasks: [] };
      }
      render();
    }
  }
  function newProject() {
    state = {
      image: null,
      zones: [],
      tasks: [],
    };
    saveProject();
    render();
  }

  // ========== Main UI ===========
  function render() {
    renderToolbar();
    renderMain();
  }

  function renderMain() {
    const main = document.getElementById('main');
    if (!main) return;
    if (!state.image) {
      main.innerHTML = `<div style="padding:36px;text-align:center;color:#6b7280;">Для начала загрузите изображение плана</div>`;
      return;
    }
    main.innerHTML = `
      <div style="position:relative;display:inline-block;max-width:98vw;">
        <img id="planImg" src="${state.image}" style="max-width:100%;display:block;border:1px solid #d1d5db;" />
        <svg id="zoneLayer" style="position:absolute;top:0;left:0;z-index:1;pointer-events:none;"></svg>
      </div>
      <div id="zoneHint" style="color:#64748b;margin-top:10px;"></div>
      <div id="zoneList"></div>
    `;

    const img = document.getElementById('planImg');
    img.onload = () => {
      renderZones();
      setupSVGLayer();
    };
    if (img.complete) {
      renderZones();
      setupSVGLayer();
    }
    renderZoneList();
  }

  return {
    render,
    uploadImage: function() {
      const inp = document.getElementById('fileInput');
      inp.onchange = function(e) {
        const file = inp.files[0];
        if (!file) return;
        const fr = new FileReader();
        fr.onload = function(evt) {
          state.image = evt.target.result;
          saveProject();
          render();
        };
        fr.readAsDataURL(file);
      };
      inp.value = ''; // Clear previous
      inp.click();
    },
    saveProject,
    exportJSON: function() {
      const link = document.createElement('a');
      link.download = 'site-planner-data.json';
      link.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
      link.click();
    },
    importJSON: function() {
      const inp = document.getElementById('jsonInput');
      inp.onchange = function(e) {
        const file = inp.files[0];
        if (!file) return;
        const fr = new FileReader();
        fr.onload = function(evt) {
          try {
            state = JSON.parse(evt.target.result);
            saveProject();
            render();
          } catch (e) {
            alert('Ошибка импорта JSON!');
          }
        };
        fr.readAsText(file);
      };
      inp.value = ''; // Clear previous
      inp.click();
    },
    loadProject,
    toggleDrawMode,
    startDrawingZone,
    cancelDrawingZone,
    renderZones,
    setupSVGLayer,
    getZoneById,
    editZone: App.editZone,
    saveEditedZone: App.saveEditedZone,
    deleteZone: App.deleteZone,
    cancelEditZone: App.cancelEditZone,
  };
})();

window.App = App2;

window.onload = () => {
  if (!document.getElementById('toolbar')) {
    document.body.innerHTML = `
      <div id="toolbar" style="padding:10px 16px;background:#e9ecf4;border-bottom:1px solid #cbd5e1;"></div>
      <div id="main" style="padding:16px;"></div>
      <div id="modals"></div>
    `;
  }
  App.loadProject();
  App.render();
};