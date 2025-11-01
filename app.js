// (no change to this line, it's just a constant, real drawing logic is elsewhere)
const WEEEK_API_BASE = 'https://api.weeek.net/v1';
const WEEEK_TOKEN = 'b06bcb7d-1a9d-4f2b-bdcc-12e9dedc5ceb';

/**
 * Opens the WEEEK web planner in a new tab.
 */
function openWeeekPlanner() {
  window.open('https://weeek.net/app', '_blank');
}

/**
 * Show Kanban in a modal, dynamically pulling tasks/boards from Weeek API
 * @param {string} zoneId - Which "board" (area) to show or create in WEEEK
 */
async function showKanbanModal(zoneId) {
  // Fetch or create board corresponding to this zone
  let zone = App.getZoneById(zoneId);
  if (!zone) return;

  let board = await findOrCreateWeeekBoard(zone.name);
  let tasks = board ? await fetchWeeekTasks(board.id) : [];
  showKanbanPopup(board, tasks, zone);
}

/**
 * Finds a WEEEK board by name, or creates it if not exists.
 * @param {string} name
 */
async function findOrCreateWeeekBoard(name) {
  // Get all boards (workspaces)
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
  // Get all tasks in the workspace
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
  // task: { name, description, ... }
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

/**
 * Pop up modal for Kanban, fetched from Weeek API
 */
function showKanbanPopup(board, tasks, zone) {
  let modal = document.createElement('div');
  modal.id = 'kanban-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40';
  modal.innerHTML = `
    <div class="bg-white max-w-2xl w-full p-6 rounded shadow-lg relative">
      <button class="absolute top-2 right-2 text-xl" onclick="document.body.removeChild(document.getElementById('kanban-modal'))">&times;</button>
      <h2 class="mb-4 text-xl font-bold">Канбан: ${zone.name}</h2>
      <div class="mb-2">
        <button class="btn" onclick="App.openWeeekPlanner()">Открыть WEEEK планировщик задач</button>
        <button class="btn ml-2" onclick="App.promptAddWeeekTask('${board.id}')">Добавить задачу</button>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full mt-2 table-auto border">
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

/**
 * Prompts user to add new Weeek task for this board
 */
function promptAddWeeekTask(workspaceId) {
  const taskName = prompt('Название задачи:');
  if (taskName) {
    createWeeekTask(workspaceId, { name: taskName }).then(() => {
      alert('Задача добавлена!');
      document.body.removeChild(document.getElementById('kanban-modal'));
      // Re-open the modal to refresh the board
      setTimeout(() => App.showKanbanModalByWorkspaceId(workspaceId), 500);
    });
  }
}

// Helper to get zone by id
function getZoneById(zoneId) {
  return state.zones.find(z => z.id === zoneId);
}
// Helper: re-show Kanban modal by workspace id
async function showKanbanModalByWorkspaceId(workspaceId) {
  // Find the zone name by linked board/workspace
  const boards = await fetchWeeekBoards();
  const board = boards.find(x => x.id === workspaceId);
  if (!board) return;
  let zone = state.zones.find(z => z.name === board.name);
  if (!zone) return;
  showKanbanModal(zone.id);
}

// ====================== //
//   Новый Блок Рисования
// ====================== //

// Проблема задвоения: в коде был конфликт между "setTool('draw')" и mode 'draw-zone';
// Я избавлюсь от двойных режимов и переделаю логику так, чтобы был только один механизм активного инструмента Рисования.
// Добавлю нормальные кнопки, явное отображение состояния, более дружелюбный UX для завершения и отмены, отключу pointer-events ненужно.

// Простая глобальная подсказка:
function showMessage(msg) {
  let el = document.getElementById('zoneHint');
  if (el) {
    el.innerHTML = `<span class="text-blue-700">${msg}</span>`;
  }
}

function renderToolbar() {
  document.getElementById('toolbar').innerHTML = `
    <button class="btn" onclick="App.uploadImage()">Загрузить план</button>
    <button class="btn" onclick="App.saveProject()">Сохранить проект</button>
    <button class="btn" onclick="App.showKanban()">Открыть канбан</button>
    <button class="btn" onclick="App.exportJSON()">Скачать JSON</button>
    <button class="btn" onclick="App.importJSON()">Загрузить JSON</button>
    <button class="btn ml-2 ${currentTool==='draw'?'bg-blue-300':''}" id="drawZoneBtn"
      onclick="App.toggleDrawMode()"
    >${currentTool==='draw'?'[Режим рисования активен]':'Рисовать зону'}</button>
    <button class="btn ml-2" onclick="App.openWeeekPlanner()">WEEEK планнер</button>
    <input id="fileInput" type="file" accept="image/*" style="display:none" />
    <input id="jsonInput" type="file" accept=".json" style="display:none" />
  `;
}

// Новый удобный переключатель режима рисования
function toggleDrawMode() {
  if (currentTool === 'draw') {
    cancelDrawingZone();
  } else {
    startDrawingZone();
  }
}

// Запуск режима рисования
function startDrawingZone() {
  currentTool = 'draw';
  drawingZone = { pts: [], mode: 'poly' };
  showMessage('Кликните по изображению для точек полигона. Двойной клик — завершить. Esc — отменить.');
  renderZones();
}

// Отмена режима рисования
function cancelDrawingZone() {
  currentTool = null;
  drawingZone = null;
  showMessage('Режим рисования зоны отменён.');
  renderZones();
}

// Для генерации id и цвета
function generateId() {
  return 'z'+Math.random().toString(36).substr(2,5);
}
function randomColor(i=0) {
  const arr = ['#38bdf8','#64748b','#22d3ee','#34d399','#a3e635','#fde047','#fb7185','#c084fc'];
  return arr[Math.floor(Math.random()*arr.length)];
}

// Основная установка событий для SVG-рисования
function setupSVGLayer() {
  const svg = document.getElementById('zoneLayer');
  const img = document.getElementById('planImg');
  if (!svg || !img) return;

  // Размеры и позиция
  svg.setAttribute('width', img.width);
  svg.setAttribute('height', img.height);
  svg.style.left = img.offsetLeft + 'px';
  svg.style.top = img.offsetTop + 'px';
  svg.style.position = 'absolute';
  svg.style.pointerEvents = (currentTool === 'draw') ? 'auto' : 'none';

  // Сброс event-ов (чтобы не добалять их много при каждом render)
  svg.onmousedown = null;
  svg.onmousemove = null;
  svg.ondblclick = null;

  // Только если режим рисования!
  if (currentTool === 'draw') {
    svg.onmousedown = (e) => {
      if (e.button !== 0) return; // только ЛКМ
      const pt = relCoords(svg, e);
      if (!drawingZone) drawingZone = {pts: [], mode: 'poly'};
      drawingZone.pts.push([pt.x, pt.y]);
      renderZones();
    };
    svg.onmousemove = (e) => {
      if (drawingZone && drawingZone.pts.length) {
        const pt = relCoords(svg, e);
        let tempZone = {...drawingZone};
        // Для превью
        if (tempZone.mode === 'poly') {
          // текущий невидимый сегмент
          tempZone._preview = [pt.x, pt.y];
        }
        renderZones(tempZone);
      }
    };
    svg.ondblclick = (e) => {
      // Завершить рисование полигона
      if (drawingZone && drawingZone.pts.length >= 3) {
        finishZoneDraw();
      }
    };
    svg.oncontextmenu = (e) => {
      // Позволять переключаться на прямоугольник правым кликом
      e.preventDefault();
      if (drawingZone && drawingZone.pts.length === 1) {
        drawingZone.mode = 'rect';
        showMessage('Перетащите мышь и отпустите — будет прямоугольник. Esc — отменить.');
      }
      return false;
    };
  }

  // ESC дает отмену
  window.onkeydown = function(e) {
    if (e.key === "Escape" && currentTool === 'draw') {
      cancelDrawingZone();
    }
  }
}

// Координаты мыши для SVG
function relCoords(svg, e) {
  const rect = svg.getBoundingClientRect();
  return {
    x: Math.round(e.clientX - rect.left),
    y: Math.round(e.clientY - rect.top)
  };
}

// Новый отрисовщик слоя, теперь с превью
function renderZones(tempPreviewZone = null) {
  const svg = document.getElementById('zoneLayer');
  const img = document.getElementById('planImg');
  if (!svg || !img) return;
  svg.setAttribute('width', img.width);
  svg.setAttribute('height', img.height);

  svg.innerHTML = `
    ${state.zones.map(zone => zoneSVG(zone)).join('')}
    ${(drawingZone||tempPreviewZone) ? drawPreviewSVG((drawingZone||tempPreviewZone)) : ''}
  `;

  // Наведение для зон (только когда не draw)
  if (currentTool !== 'draw') {
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

// Превью рисования
function drawPreviewSVG(draw) {
  // Для полигона — последняя точка наводки мышью как _preview
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
  // polyline "preview"
  return `<polyline points="${pts.map(pt=>pt.join(',')).join(' ')}" fill="none" stroke="#3b82f6" stroke-width="2" />`;
}

// Рисует готовую зону (старый способ)
function zoneSVG(zone) {
  const color = zone.color || '#38bdf8';
  if (zone.points.length === 2) {
    // Rectangle
    const [a,b] = zone.points;
    const x = Math.min(a[0],b[0]), y = Math.min(a[1],b[1]);
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

// Финализация рисования
function finishZoneDraw() {
  if (!drawingZone || drawingZone.pts.length < (drawingZone.mode === 'rect' ? 2 : 3)) return;
  let pts = drawingZone.pts;
  if (drawingZone.mode === 'rect' && pts.length > 2) pts = pts.slice(0,2);
  const name = prompt('Название зоны?', 'Зона '+(state.zones.length+1));
  if (!name) {
    cancelDrawingZone();
    return;
  }
  const color = prompt('Цвет (hex)?', randomColor(state.zones.length));
  const id = generateId();
  state.zones.push({id, name, color, points: pts,});
  // создаём связанный WEEEK board без ожидания
  findOrCreateWeeekBoard(name);
  drawingZone = null;
  currentTool = null;
  saveProject();
  renderZones();
  renderZoneList();
  showMessage('Зона добавлена!');
}

function renderZoneList() {
  // List, edit, delete zones
  const el = document.getElementById('zoneList');
  if (!el) return;
  el.innerHTML = `<div class="mt-4">
    <h3 class="font-bold mb-2">Зоны:</h3>
    <div>
      ${state.zones.map(zone => `
        <div class="flex items-center mb-1" style="background:${zone.color}22;border-radius:4px;">
          <div class="px-2 py-1 mr-2 text-xs" style="background:${zone.color};color:white;border-radius:3px;">${zone.name}</div>
          <button onclick="App.editZone('${zone.id}')">✎</button>
          <button onclick="App.deleteZone('${zone.id}')">🗑️</button>
        </div>
      `).join('')}
    </div>
  </div>`;
}

// ========= Экспорт в App API
App.openWeeekPlanner = openWeeekPlanner;
App.showKanbanModal = showKanbanModal;
App.getZoneById = getZoneById;
App.promptAddWeeekTask = promptAddWeeekTask;
App.showKanbanModalByWorkspaceId = showKanbanModalByWorkspaceId;
App.startDrawingZone = startDrawingZone;
App.cancelDrawingZone = cancelDrawingZone;
App.toggleDrawMode = toggleDrawMode;

// Переопределить публичный App.renderZones (если есть) и setupSVGLayer:
App.renderZones = renderZones;
App.setupSVGLayer = setupSVGLayer;

// Старые функции редактирования/удаления зоны должны быть определены в основном App

// --- End нового UX режима рисования ---

/**
 * Simple SPA for construction site planning & kanban (vanilla JS, single-file, uses CDN for libs and TailwindCSS)
 * Features: upload image, draw zones (SVG), zone CRUD, Kanban, drag-drop, localStorage, import/export JSON
 */

const App = (() => {
  let state = {
    image: null,
    zones: [],
    tasks: [],
  };
  let selectedZoneId = null;
  let kanbanVisible = false;
  // Делаем currentTool и drawingZone глобальными чтоб сохранялись между рендерами
  window.currentTool = null;
  window.drawingZone = null;

  // ==== LocalStorage Storage ====
  const LS_KEY = 'site-planner-project';

  function saveProject() {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }
  function loadProject() {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      state = JSON.parse(raw);
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

  // ==== UI Render ====
  function render() {
    renderToolbar();
    renderMain();
  }

  function renderMain() {
    const main = document.getElementById('main');
    if (!state.image) {
      main.innerHTML = `<div class="p-8 text-center text-gray-500">Для начала загрузите изображение плана</div>`;
      return;
    }
    main.innerHTML = `
      <div class="relative">
        <img id="planImg" src="${state.image}" class="max-w-full border border-gray-300" />
        <svg id="zoneLayer" class="absolute left-0 top-0" style="z-index:1;"></svg>
      </div>
      <div id="zoneHint" class="text-gray-500 mt-2"></div>
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

  // Остальные функции: saveProject, uploadImage, etc — импортируются из selection выше, так что не дублирую.

  // ==== Public API ====
  return {
    render,
    uploadImage,
    saveProject,
    showKanban,
    hideKanban: function() { kanbanVisible = false; },
    addTask: null,
    editTask: null,
    deleteTask: null,
    changeTaskStatus: null,
    editZone: null,
    deleteZone: null,
    exportJSON: null,
    importJSON: null,
    loadProject,
    setTool: null, // deprecated, use toggleDrawMode
    toggleDrawMode,
    startDrawingZone,
    cancelDrawingZone,
    renderZones,
    setupSVGLayer,
    getZoneById
  };
})();

// On page load
window.App = App;
window.onload = () => {
  if (!document.getElementById('toolbar')) {
    document.body.innerHTML = `
      <div class="p-4 bg-slate-100 border-b" id="toolbar"></div>
      <div class="p-4" id="main"></div>
      <div id="modals"></div>
    `;
  }
  App.loadProject();
  App.render();
};
