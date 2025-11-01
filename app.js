



/**
 * Simple SPA for construction site planning & kanban (vanilla JS, single-file, uses CDN for libs and TailwindCSS)
 * Features: upload image, draw zones (SVG), zone CRUD, Kanban, drag-drop, localStorage, import/export JSON
 */

const App = (() => {
  let state = {
    image: null, // dataURL
    zones: [],   // [{id, name, color, points: [[x,y],...]}]
    tasks: [],   // [{id, zoneId, name, due, assignee, status}]
  };
  let currentTool = null;
  let selectedZoneId = null;
  let drawingZone = null; // {pts: []}

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

  function renderToolbar() {
    document.getElementById('toolbar').innerHTML = `
      <button class="btn" onclick="App.uploadImage()">Загрузить план</button>
      <button class="btn" onclick="App.setTool('draw')">Рисовать зону</button>
      <button class="btn" onclick="App.saveProject()">Сохранить проект</button>
      <button class="btn" onclick="App.showKanban()">Открыть канбан</button>
      <button class="btn" onclick="App.exportJSON()">Скачать JSON</button>
      <button class="btn" onclick="App.importJSON()">Загрузить JSON</button>
      <input id="fileInput" type="file" accept="image/*" style="display:none" />
      <input id="jsonInput" type="file" accept=".json" style="display:none" />
    `;
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
        <svg id="zoneLayer" class="absolute left-0 top-0 pointer-events-none" style="z-index:1"></svg>
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

  function renderZones() {
    const svg = document.getElementById('zoneLayer');
    const img = document.getElementById('planImg');
    if (!svg || !img) return;
    svg.setAttribute('width', img.width);
    svg.setAttribute('height', img.height);

    svg.innerHTML = `
      ${
        state.zones.map(zone => zoneSVG(zone)).join('')
      }
      ${
        drawingZone ? drawPreviewSVG(drawingZone) : ''
      }
    `;

    // hover handlers
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
        if (currentTool !== 'draw') {
          e.stopPropagation();
          selectZone(state.zones[idx].id);
        }
      });
    });
  }

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

  function drawPreviewSVG(draw) {
    if (!draw.pts.length) return '';
    if (draw.pts.length === 1)
      return `<circle cx="${draw.pts[0][0]}" cy="${draw.pts[0][1]}" r="6" fill="red" />`;
    const pts = draw.pts.map(pt => pt.join(',')).join(' ');
    if (draw.mode === 'rect' && draw.pts.length === 2) {
      const [a,b]=draw.pts;
      const x=Math.min(a[0],b[0]), y=Math.min(a[1],b[1]);
      const w=Math.abs(a[0]-b[0]), h=Math.abs(a[1]-b[1]);
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="blue" opacity="0.15" stroke="#222" stroke-width="1" />`;
    }
    return `<polyline points="${pts}" fill="none" stroke="blue" stroke-width="2" />`;
  }

  function showZoneHint(zone) {
    document.getElementById('zoneHint').innerHTML =
      `<b style="color:${zone.color};">${zone.name}</b>`;
  }
  function hideZoneHint() {
    document.getElementById('zoneHint').innerHTML = '';
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

  function setupSVGLayer() {
    const svg = document.getElementById('zoneLayer');
    const img = document.getElementById('planImg');
    if (!svg || !img) return;
    svg.style.left = img.offsetLeft + 'px';
    svg.style.top = img.offsetTop + 'px';
    svg.style.position = 'absolute';
    svg.style.pointerEvents = (currentTool === 'draw') ? 'auto' : 'none';

    svg.onmousedown = (e) => {
      if (currentTool !== 'draw') return;
      const pt = relCoords(svg, e);
      if (!drawingZone) drawingZone = {pts: [], mode: 'poly'};
      drawingZone.pts.push([pt.x, pt.y]);
      if (drawingZone.mode === 'rect' && drawingZone.pts.length==2) finishZoneDraw();
      renderZones();
    };
    svg.onmousemove = (e) => {
      if (drawingZone && drawingZone.pts.length) {
        // preview
        const pt = relCoords(svg,e);
        if (drawingZone.mode === 'rect') {
          if (drawingZone.pts.length === 1) {
            drawingZone.pts[1] = [pt.x, pt.y];
          }
        }
        renderZones();
      }
    };
    svg.ondblclick = (e) => {
      // finish polygon
      if (drawingZone && drawingZone.mode==='poly' && drawingZone.pts.length>=3) {
        finishZoneDraw();
      }
    };
  }

  function relCoords(svg, e) {
    const rect = svg.getBoundingClientRect();
    return {
      x: Math.round(e.clientX - rect.left),
      y: Math.round(e.clientY - rect.top)
    };
  }

  function setTool(tool) {
    currentTool = tool;
    if (tool==='draw') {
      drawingZone = {pts: [], mode: 'poly'};
      alert('Кликните по изображению для рисования полигона. Двойной клик — завершить.\nПравый клик или Ctrl — рисовать прямоугольник.');
      // For rect mode, user should click twice
      document.getElementById('zoneLayer').addEventListener('contextmenu', (e) => {
        e.preventDefault();
        drawingZone = {pts: [], mode: 'rect'};
        return false;
      });
    } else {
      drawingZone = null;
    }
    renderZones();
  }

  function finishZoneDraw() {
    if (!drawingZone || drawingZone.pts.length < 2) return;
    const pts = drawingZone.pts.slice();
    drawingZone = null;
    setTimeout(() => {
      const name = prompt('Название зоны?', 'Зона '+(state.zones.length+1));
      if (!name) return;
      const color = prompt('Цвет (hex)?', randomColor(state.zones.length));
      const id = 'z'+Math.random().toString(36).substr(2,5);
      state.zones.push({id, name, color, points: pts });
      saveProject();
      render();
    });
  }

  function randomColor(i=0) {
    // Just a set of colors
    const arr = ['#38bdf8','#64748b','#22d3ee','#34d399','#a3e635','#fde047','#fb7185','#c084fc'];
    return arr[i%arr.length];
  }

  function selectZone(id) {
    selectedZoneId = id;
    // Optionally, highlight
  }

  function editZone(zoneId) {
    const zone = state.zones.find(z=>z.id===zoneId);
    if (!zone) return;
    const name = prompt('Новое имя зоны:', zone.name);
    if (!name) return;
    const color = prompt('Цвет (hex):', zone.color);
    if (!color) return;
    zone.name = name;
    zone.color = color;
    saveProject();
    render();
  }
  function deleteZone(zoneId) {
    if (!confirm('Удалить зону и все её задачи?')) return;
    state.zones = state.zones.filter(z=>z.id!==zoneId);
    state.tasks = state.tasks.filter(t=>t.zoneId!==zoneId);
    saveProject();
    render();
  }

  // ==== File Upload/Download ====
  function uploadImage() {
    const fileInput = document.getElementById('fileInput');
    fileInput.value = '';
    fileInput.onchange = (e) => {
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        state.image = ev.target.result;
        saveProject();
        render();
      };
      reader.readAsDataURL(file);
    };
    fileInput.click();
  }

  function exportJSON() {
    const str = JSON.stringify(state, null, 2);
    const blob = new Blob([str], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'project.json';
    a.click();
  }
  function importJSON() {
    const input = document.getElementById('jsonInput');
    input.value = '';
    input.onchange = () => {
      const file = input.files[0];
      const rdr = new FileReader();
      rdr.onload = e => {
        try {
          state = JSON.parse(e.target.result);
          saveProject();
          render();
        } catch(e) {alert('Ошибка формата файла.');}
      };
      rdr.readAsText(file);
    };
    input.click();
  }

  // ==== Kanban Board ====
  let kanbanVisible = false;
  function showKanban() {
    kanbanVisible = true;
    document.body.style.overflow = 'hidden';
    if (!document.getElementById('kanbanModal')) {
      const modal = document.createElement('div');
      modal.id = 'kanbanModal';
      modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-6xl mx-auto p-6 rounded relative shadow-xl">
          <button class="absolute top-2 right-2 text-xl" onclick="App.hideKanban()">✕</button>
          <h2 class="text-xl mb-4 font-bold">Канбан-доска</h2>
          <div id="kanbanBoard" class="flex overflow-x-auto gap-4"></div>
        </div>`;
      document.body.appendChild(modal);
    }
    renderKanban();
  }
  function hideKanban() {
    kanbanVisible = false;
    document.body.style.overflow = '';
    const modal = document.getElementById('kanbanModal');
    if (modal) modal.remove();
  }

  function renderKanban() {
    const el = document.getElementById('kanbanBoard');
    if (!el) return;
    el.innerHTML = state.zones.map(zone => `
      <div class="bg-slate-100 rounded w-80 min-w-80 flex-shrink-0 p-3">
        <div class="flex justify-between items-center mb-2">
          <b style="color:${zone.color};">${zone.name}</b>
          <button title="Создать задачу" onclick="App.addTask('${zone.id}')">＋</button>
        </div>
        <div class="zone-tasks" id="zone-${zone.id}">
          ${zoneTasks(zone.id).map(t=> taskCardHTML(t)).join('')}
        </div>
      </div>
    `).join('');
    // enable drag & drop
    setTimeout(bindDragula, 10);
  }

  function zoneTasks(zoneId) {
    return state.tasks.filter(t=>t.zoneId===zoneId);
  }

  function taskCardHTML(t) {
    const color = statusColor(t);
    return `
      <div class="task-card p-2 mb-2 rounded shadow bg-white border-l-4" 
           style="border-color:${color}" data-taskid="${t.id}">
        <div class="flex justify-between">
          <div>
            <div class="font-semibold">${t.name}</div>
            <div class="text-xs text-gray-500">${t.due || ''} ${t.assignee?('&bull; '+t.assignee):''}</div>
          </div>
          <button onclick="App.editTask('${t.id}')">✎</button>
          <button onclick="App.deleteTask('${t.id}')">🗑️</button>
        </div>
        <div class="mt-2">
          <select onchange="App.changeTaskStatus('${t.id}',this.value)">
            <option value="new" ${t.status==='new'?'selected':''}>Не начато</option>
            <option value="wip" ${t.status==='wip'?'selected':''}>В работе</option>
            <option value="done" ${t.status==='done'?'selected':''}>Завершено</option>
            <option value="late" ${t.status==='late'?'selected':''}>Просрочено</option>
          </select>
        </div>
      </div>
    `;
  }
  function statusColor(t) {
    switch(t.status) {
      case 'wip': return '#fde047'; // yellow
      case 'done': return '#22c55e';
      case 'late': return '#f43f5e';
      case 'new': default: return '#94a3b8';
    }
  }
  function addTask(zoneId) {
    const name = prompt('Название задачи?');
    if (!name) return;
    const due = prompt('Срок (дд.мм.гггг)?');
    const assignee = prompt('Ответственный?');
    const id = 't'+Math.random().toString(36).substr(2,5);
    state.tasks.push({
      id, zoneId, name, due, assignee, status:'new'
    });
    saveProject();
    renderKanban();
  }
  function editTask(taskId) {
    const t = state.tasks.find(t=>t.id===taskId);
    if (!t) return;
    const name = prompt('Название задачи:', t.name);
    if (!name) return;
    const due = prompt('Срок:', t.due);
    const assignee = prompt('Ответственный:', t.assignee);
    t.name = name;
    t.due = due;
    t.assignee = assignee;
    saveProject();
    renderKanban();
  }
  function deleteTask(taskId) {
    if (!confirm('Удалить задачу?')) return;
    state.tasks = state.tasks.filter(t=>t.id!==taskId);
    saveProject();
    renderKanban();
  }
  function changeTaskStatus(taskId, st) {
    const t = state.tasks.find(t=>t.id===taskId);
    if (t) {
      t.status = st;
      saveProject();
      renderKanban();
    }
  }
  function moveTask(taskId, newZoneId, newOrder) {
    const t = state.tasks.find(t=>t.id===taskId);
    if (t) {
      t.zoneId = newZoneId;
      // Optionally reorder in state.tasks
      saveProject();
      renderKanban();
    }
  }
  // ==== Dragula.js setup ====
  function bindDragula() {
    // Dragula library is assumed included via CDN in index.html:
    // <script src="https://unpkg.com/dragula/dist/dragula.min.js"></script>
    if (typeof dragula === 'undefined') return;
    const containers = [];
    state.zones.forEach(z => {
      const el = document.getElementById('zone-'+z.id);
      if (el) containers.push(el);
    });
    if (window._dragulaIns) window._dragulaIns.destroy();
    window._dragulaIns = dragula(containers)
      .on('drop', function (el, target, src, sibling) {
        const taskId = el.dataset.taskid;
        const newZoneId = target.id.replace('zone-','');
        moveTask(taskId, newZoneId);
      });
  }

  // ==== Public API ====
  return {
    render,
    uploadImage,
    setTool,
    saveProject,
    showKanban,
    hideKanban,
    addTask,
    editTask,
    deleteTask,
    changeTaskStatus,
    editZone,
    deleteZone,
    exportJSON,
    importJSON,
    loadProject,
  };
})();

// On page load: assumes there's #toolbar and #main in HTML
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


