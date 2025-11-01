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
    #kanban-modal { position:fixed; top:0;left:0;right:0;bottom:0; background:rgba(0,0,0,0.25); z-index:1005; display:flex;align-items:center;justify-content:center;}
    #kanban-modal .modal-window { background: #fff; max-width:540px; width:100%; border-radius:8px; padding:24px 18px; position:relative;}
    #zoneLayer { pointer-events: none; }
  `;
  document.head.appendChild(style);
})();

// State is declared later inside App, but we need a stub here for certain helpers
// so we place an early stub, will be overwritten by App
let state = { zones: [], image: null };

// --- WEEEK Functions (do not change) ---
function openWeeekPlanner() {
  window.open('https://weeek.net/app', '_blank');
}

async function showKanbanModal(zoneId) {
  let zone = App.getZoneById(zoneId);
  if (!zone) return;
  let board = await findOrCreateWeeekBoard(zone.name);
  let tasks = board ? await fetchWeeekTasks(board.id) : [];
  showKanbanPopup(board, tasks, zone);
}

async function findOrCreateWeeekBoard(name) {
  const boards = await fetchWeeekBoards();
  let board = boards.find(x => x.name === name);
  if (!board) {
    board = await createWeeekBoard(name);
  }
  return board;
}

async function fetchWeeekBoards() {
  const res = await fetch(`${WEEEK_API_BASE}/workspace`, {
    headers: { 'Authorization': WEEEK_TOKEN }
  });
  if (res.ok) {
    const data = await res.json();
    return data?.result?.items || [];
  }
  return [];
}

async function createWeeekBoard(name) {
  const res = await fetch(`${WEEEK_API_BASE}/workspace`, {
    method: 'POST',
    headers: {
      'Authorization': WEEEK_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name })
  });
  if (res.ok) {
    const data = await res.json();
    return data?.result;
  }
  return null;
}

async function fetchWeeekTasks(workspaceId) {
  const res = await fetch(`${WEEEK_API_BASE}/workspace/${workspaceId}/task`, {
    headers: { 'Authorization': WEEEK_TOKEN }
  });
  if (res.ok) {
    const data = await res.json();
    return data?.result?.items || [];
  }
  return [];
}

async function createWeeekTask(workspaceId, task) {
  const res = await fetch(`${WEEEK_API_BASE}/workspace/${workspaceId}/task`, {
    method: 'POST',
    headers: {
      'Authorization': WEEEK_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(task)
  });
  if (res.ok) {
    const data = await res.json();
    return data?.result;
  }
  return null;
}

function showKanbanPopup(board, tasks, zone) {
  let modal = document.createElement('div');
  modal.id = 'kanban-modal';
  modal.innerHTML = `
    <div class="modal-window">
      <button style="position:absolute;top:8px;right:12px;font-size:18px;background:transparent;border:none;cursor:pointer;" onclick="document.body.removeChild(document.getElementById('kanban-modal'))">&times;</button>
      <h2 style="margin-bottom:14px;font-size:1.3em;">Канбан: ${zone.name}</h2>
      <div style="margin-bottom:10px;">
        <button class="btn" onclick="App.openWeeekPlanner()">Открыть WEEEK планировщик задач</button>
        <button class="btn ml-2" onclick="App.promptAddWeeekTask('${board.id}')">Добавить задачу</button>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;margin-top:8px;">
          <thead>
            <tr><th>Имя</th><th>Статус</th><th>Ответственный</th><th>Дедлайн</th></tr>
          </thead>
          <tbody>
            ${tasks.map(task => `
              <tr>
                <td>${task.name}</td>
                <td>${task.status || ''}</td>
                <td>${task.assignee?.name || ''}</td>
                <td>${task.deadline ? new Date(task.deadline).toLocaleDateString() : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function promptAddWeeekTask(workspaceId) {
  const taskName = prompt('Название задачи:');
  if (taskName) {
    createWeeekTask(workspaceId, { name: taskName }).then(() => {
      alert('Задача добавлена!');
      document.body.removeChild(document.getElementById('kanban-modal'));
      setTimeout(() => App.showKanbanModalByWorkspaceId(workspaceId), 500);
    });
  }
}
function getZoneById(zoneId) {
  return state.zones.find(z => z.id === zoneId);
}
async function showKanbanModalByWorkspaceId(workspaceId) {
  const boards = await fetchWeeekBoards();
  const board = boards.find(x => x.id === workspaceId);
  if (!board) return;
  let zone = state.zones.find(z => z.name === board.name);
  if (!zone) return;
  showKanbanModal(zone.id);
}

// --- Drawing Section ---

function showMessage(msg) {
  let el = document.getElementById('zoneHint');
  if (el) {
    el.innerHTML = `<span style="color:#2563eb;">${msg}</span>`;
  }
}

// Всегда назначаем функцию renderToolbar,
// даже если ее еще не было, чтобы меню отрисовывалось при любом раскладе
function renderToolbar() {
  // Если toolbar не существует -- создаем его в DOM
  let toolbar = document.getElementById('toolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = 'toolbar';
    toolbar.className = 'p-4 bg-slate-100 border-b';
    // По умолчанию вставляем в начало body
    document.body.insertBefore(toolbar, document.body.firstChild);
  }
  // Рисуем сам тулбар
  toolbar.innerHTML = `
    <button class="toolbar-btn" onclick="App.uploadImage()">Загрузить план</button>
    <button class="toolbar-btn" onclick="App.saveProject()">Сохранить проект</button>
    <button class="toolbar-btn" onclick="App.showKanban()">Открыть канбан</button>
    <button class="toolbar-btn" onclick="App.exportJSON()">Скачать JSON</button>
    <button class="toolbar-btn" onclick="App.importJSON()">Загрузить JSON</button>
    <button class="toolbar-btn${window.currentTool==='draw'?' active':''}" id="drawZoneBtn"
      onclick="App.toggleDrawMode()"
    >${window.currentTool==='draw'?'[Режим рисования]':'Рисовать зону'}</button>
    <button class="toolbar-btn" onclick="App.openWeeekPlanner()">WEEEK планнер</button>
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
  window.drawingZone = { pts: [], mode: 'poly' };
  showMessage('Кликните по плану, чтобы создать точки полигона. Двойной клик — завершить. Esc — отменить рисование.');
  renderZones();
  setupSVGLayer();
}

function cancelDrawingZone() {
  window.currentTool = null;
  window.drawingZone = null;
  showMessage('Режим рисования зоны отменён.');
  renderZones();
  setupSVGLayer();
}

function generateId() {
  return 'z' + Math.random().toString(36).substr(2, 5);
}
function randomColor(i = 0) {
  const arr = ['#38bdf8', '#64748b', '#22d3ee', '#34d399', '#a3e635', '#fde047', '#fb7185', '#c084fc'];
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

  // Remove previous ESC handler
  if (window._draw_keydown_listener) window.removeEventListener('keydown', window._draw_keydown_listener);

  // Drawing interactions
  if (window.currentTool === 'draw') {
    svg.onmousedown = (e) => {
      if (e.button !== 0) return;
      const pt = relCoords(svg, e);
      if (!window.drawingZone) window.drawingZone = { pts: [], mode: 'poly'};
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
    svg.ondblclick = (e) => {
      if (window.drawingZone && window.drawingZone.pts.length >= 3) {
        finishZoneDraw();
      }
    };
    svg.oncontextmenu = (e) => {
      e.preventDefault();
      if (window.drawingZone && window.drawingZone.pts.length === 1) {
        window.drawingZone.mode = 'rect';
        showMessage('Перетащите мышь и отпустите — будет прямоугольник. Esc — отменить.');
      }
      return false;
    };

    // ESC handler for cancel
    window._draw_keydown_listener = function(e) {
      if (e.key === "Escape" && window.currentTool === 'draw') {
        cancelDrawingZone();
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
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        App.showKanbanModal(state.zones[idx].id);
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
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#3b82f6" opacity="0.2" stroke="#222" stroke-width="2" />`;
  }
  if (pts.length === 1)
    return `<circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="6" fill="#3b82f6" />`;
  return `<polyline points="${pts.map(pt=>pt.join(',')).join(' ')}" fill="none" stroke="#3b82f6" stroke-width="2" />`;
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

function finishZoneDraw() {
  if (!window.drawingZone || window.drawingZone.pts.length < (window.drawingZone.mode === 'rect' ? 2 : 3)) return;
  let pts = window.drawingZone.pts;
  if (window.drawingZone.mode === 'rect' && pts.length > 2) pts = pts.slice(0,2);
  const name = prompt('Название зоны?', 'Зона ' + (state.zones.length + 1));
  if (!name) {
    cancelDrawingZone();
    return;
  }
  const color = prompt('Цвет (hex)?', randomColor(state.zones.length));
  const id = generateId();
  state.zones.push({ id, name, color, points: pts, });
  // Optionally create WEEEK board in background
  findOrCreateWeeekBoard(name);
  window.drawingZone = null;
  window.currentTool = null;
  if (App && App.saveProject) App.saveProject();
  renderZones();
  renderZoneList();
  showMessage('Зона добавлена!');
}

function renderZoneList() {
  const el = document.getElementById('zoneList');
  if (!el) return;
  el.innerHTML = `<div style="margin-top:18px;">
    <h3 style="font-weight:bold;margin-bottom:8px;">Зоны:</h3>
    <div>
      ${(state.zones||[]).map(zone => `
        <div class="zone-list-item" style="background:${zone.color}22;border-radius:4px;">
          <span class="zone-color-box" style="background:${zone.color};"></span>
          <span>${zone.name}</span>
          <button class="btn" onclick="App.editZone && App.editZone('${zone.id}')">✎</button>
          <button class="btn" onclick="App.deleteZone && App.deleteZone('${zone.id}')">🗑️</button>
        </div>
      `).join('')}
    </div>
  </div>`;
}

// Draw/kanban API for App
App = window.App || {};
App.openWeeekPlanner = openWeeekPlanner;
App.showKanbanModal = showKanbanModal;
App.getZoneById = getZoneById;
App.promptAddWeeekTask = promptAddWeeekTask;
App.showKanbanModalByWorkspaceId = showKanbanModalByWorkspaceId;
App.startDrawingZone = startDrawingZone;
App.cancelDrawingZone = cancelDrawingZone;
App.toggleDrawMode = toggleDrawMode;
App.renderZones = renderZones;
App.setupSVGLayer = setupSVGLayer;

// ===================== SPA =========================

const App2 = (() => {
  state = {
    image: null,
    zones: [],
    tasks: [],
  };
  let selectedZoneId = null;
  let kanbanVisible = false;

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
    // Если main не существует, создаем и вставляем его в DOM
    let main = document.getElementById('main');
    if (!main) {
      main = document.createElement('div');
      main.id = 'main';
      main.style.padding = '16px';
      // Вставим после тулбара если он есть, иначе просто в конец body
      let tb = document.getElementById('toolbar');
      if (tb && tb.nextSibling) {
        tb.parentNode.insertBefore(main, tb.nextSibling);
      } else {
        document.body.appendChild(main);
      }
    }
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

  // Stub: these would be replaced by above injected/"external" (Weeek, drawing) functions

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
    showKanban: function() {
      alert('Открытие канбана реализовано только для зон, двойной клик по зоне на плане.');
    },
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
    // The rest are handled above and injected.
    setTool: null, // deprecated
    toggleDrawMode,
    startDrawingZone,
    cancelDrawingZone,
    renderZones,
    setupSVGLayer,
    getZoneById
  };
})();

// Final export, overwrite window.App for compatibility
window.App = App2;

// Минимальная инициализация HTML для SPA, создаем динамически всё что нужно (toolbar/main), если оно ещё не создано
window.onload = () => {
  // Если тулбар не существует, создаём его
  if (!document.getElementById('toolbar')) {
    let toolbar = document.createElement('div');
    toolbar.id = 'toolbar';
    toolbar.className = 'p-4 bg-slate-100 border-b';
    document.body.appendChild(toolbar);
  }

  // Если main не существует, создаём его
  if (!document.getElementById('main')) {
    let main = document.createElement('div');
    main.id = 'main';
    main.style.padding = '16px';
    document.body.appendChild(main);
  }

  // Если modals не существует, создаём его
  if (!document.getElementById('modals')) {
    let modals = document.createElement('div');
    modals.id = 'modals';
    document.body.appendChild(modals);
  }

  // Теперь UI должен отрисоваться корректно в любом случае
  App.loadProject();
  App.render();
};