// Dashboard interaction enhancements: dynamic filters, dependency navigation,
// direct project-state links, and project dependency maps.

const dashboardEnhancements = {
  contextOrder: ['phone', 'desk', 'computer', 'garage', 'car', 'bench', 'cad'],
  actionOrder: ['research', 'document', 'buy', 'measure', 'mockup', 'cad', 'fabricate', 'install', 'bench-test', 'vehicle-test', 'verify', 'code'],
  mapProjectId: null,
  mapMode: 'gates'
};

const baseParseProjectYaml = parseProjectYaml;
parseProjectYaml = function(text) {
  const project = baseParseProjectYaml(text);
  const m = text.match(/^\s*durable_state:\s*(.*)$/m);
  project.durable_state = m ? m[1].trim().replace(/^['"]|['"]$/g, '') : 'PROJECT.md';
  return project;
};

function orderedValues(field, preferred) {
  const values = [...new Set(state.tasks.map(t => t[field]).filter(Boolean))];
  return values.sort((a, b) => {
    const ai = preferred.indexOf(a), bi = preferred.indexOf(b);
    if (ai < 0 && bi < 0) return a.localeCompare(b);
    if (ai < 0) return 1;
    if (bi < 0) return -1;
    return ai - bi;
  });
}

function renderGeneratedChips(id, filterKey, allLabel, values) {
  const group = document.getElementById(id);
  if (!group) return;
  if (state.filters[filterKey] !== 'all' && !values.includes(state.filters[filterKey])) state.filters[filterKey] = 'all';
  group.replaceChildren();
  [['all', allLabel], ...values.map(v => [v, pretty(v)])].forEach(([value, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `chip${state.filters[filterKey] === value ? ' active' : ''}`;
    b.dataset.value = value;
    b.textContent = label;
    group.appendChild(b);
  });
}

function renderGeneratedFilters() {
  renderGeneratedChips('contextFilters', 'context', 'Anywhere', orderedValues('context', dashboardEnhancements.contextOrder));
  renderGeneratedChips('actionFilters', 'action', 'Anything', orderedValues('action', dashboardEnhancements.actionOrder));
}

const baseRenderProjectFilters = renderProjectFilters;
renderProjectFilters = function() {
  baseRenderProjectFilters();
  renderGeneratedFilters();
};

function taskById(id) { return state.tasks.find(t => t.id === id); }
function dependencyIds(t) { return String(t.blocked_by || '').split(';').map(x => x.trim()).filter(Boolean); }
function dependentTasks(t) { return state.tasks.filter(candidate => dependencyIds(candidate).includes(t.id)); }

function dependencyButtons(ids) {
  return ids.map(id => {
    const dep = taskById(id);
    return `<button type="button" class="dependency-link status-${escapeHtml(dep ? dep.status : 'missing')}" data-task-ref="${escapeHtml(id)}">${escapeHtml(id)}</button>`;
  }).join(' ');
}

function wireDependencyButtons(root, beforeOpen) {
  root.querySelectorAll('[data-task-ref]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    const task = taskById(button.dataset.taskRef);
    if (!task) return;
    if (beforeOpen) beforeOpen();
    openTask(task);
  }));
}

function projectStateUrl(project) {
  return `https://github.com/${project.repository}/blob/${project.branch}/${project.durable_state || 'PROJECT.md'}`;
}

taskCard = function(t) {
  const card = document.createElement('article');
  card.className = 'task-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Open ${t.id}: ${t.title}`);
  const deps = dependencyIds(t);
  card.innerHTML = `
    <div class="task-top"><div><span class="task-id">${escapeHtml(t.id)} · ${escapeHtml(t.project_name)}</span><h3 class="task-title">${escapeHtml(t.title)}</h3></div><span class="task-time">${t.time_min || '?'} min</span></div>
    <div class="badges">
      <span class="badge status-${escapeHtml(t.status)}">${pretty(t.status)}</span><span class="badge priority-${escapeHtml(t.priority)}">${pretty(t.priority)}</span>
      <span class="badge">${pretty(t.context)}</span><span class="badge">${pretty(t.action)}</span>
      ${t.requires_car_down ? '<span class="badge">Car down</span>' : ''}${t.requires_parts ? '<span class="badge">Needs parts</span>' : ''}${t.cost !== null ? `<span class="badge">$${escapeHtml(t.cost)}</span>` : ''}
    </div>
    ${t.notes ? `<p class="task-note">${escapeHtml(t.notes)}</p>` : ''}
    ${deps.length ? `<div class="blocked-line"><span>Depends on</span> ${dependencyButtons(deps)}</div>` : ''}`;
  card.addEventListener('click', e => { if (!e.target.closest('.dependency-link')) openTask(t); });
  card.addEventListener('keydown', e => { if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openTask(t); } });
  wireDependencyButtons(card);
  return card;
};

openTask = function(t) {
  const dialog = document.getElementById('taskDialog');
  const content = document.getElementById('taskDialogContent');
  const deps = dependencyIds(t), unlocks = dependentTasks(t);
  content.innerHTML = `
    <span class="task-id">${escapeHtml(t.id)} · ${escapeHtml(t.project_name)}</span><h3>${escapeHtml(t.title)}</h3>${t.notes ? `<p>${escapeHtml(t.notes)}</p>` : ''}
    <div class="detail-grid">
      <div><span>Status</span><strong>${pretty(t.status)}</strong></div><div><span>Priority</span><strong>${pretty(t.priority)}</strong></div>
      <div><span>Time</span><strong>${t.time_min || '?'} min</strong></div><div><span>Context</span><strong>${pretty(t.context)}</strong></div>
      <div><span>Action</span><strong>${pretty(t.action)}</strong></div><div><span>Cost</span><strong>${t.cost === null ? 'Not specified' : `$${t.cost}`}</strong></div>
      <div><span>Car down</span><strong>${t.requires_car_down ? 'Yes' : 'No'}</strong></div><div><span>Parts needed</span><strong>${t.requires_parts ? 'Yes' : 'No'}</strong></div>
    </div>
    ${deps.length ? `<div class="dependency-row"><strong>Depends on:</strong> ${dependencyButtons(deps)}</div>` : ''}
    ${unlocks.length ? `<div class="dependency-row"><strong>Unlocks:</strong> ${dependencyButtons(unlocks.map(x => x.id))}</div>` : ''}
    ${t.decision_needed ? `<p><strong>Decision:</strong> ${escapeHtml(t.decision_needed)}</p>` : ''}
    <p><a href="${taskDocUrl(t)}" target="_blank" rel="noreferrer">Open engineering context on GitHub ↗</a></p>`;
  wireDependencyButtons(content);
  if (!dialog.open) dialog.showModal();
};

function projectTasks(projectId) { return state.tasks.filter(t => t.project_id === projectId); }

function visibleGraphIds(projectId, mode) {
  const tasks = projectTasks(projectId);
  if (mode === 'all') return new Set(tasks.map(t => t.id));
  if (mode === 'active') return new Set(tasks.filter(t => !['done', 'backlog'].includes(t.status)).map(t => t.id));

  const frontier = tasks.filter(t => ['ready', 'doing', 'verify'].includes(t.status));
  if (!frontier.length) return new Set(tasks.filter(t => !['done', 'backlog'].includes(t.status)).map(t => t.id));
  const visible = new Set(frontier.map(t => t.id));
  frontier.forEach(t => dependencyIds(t).forEach(id => { const d = taskById(id); if (d && d.project_id === projectId) visible.add(id); }));
  let wave = new Set(frontier.map(t => t.id));
  for (let generation = 0; generation < 2; generation++) {
    const next = new Set();
    tasks.forEach(t => {
      if (['done', 'backlog'].includes(t.status)) return;
      if (dependencyIds(t).some(id => wave.has(id))) { visible.add(t.id); next.add(t.id); }
    });
    wave = next;
    if (!wave.size || visible.size > 50) break;
  }
  return visible;
}

function graphDepth(task, visible, projectId, memo, stack) {
  if (memo.has(task.id)) return memo.get(task.id);
  if (stack.has(task.id)) return 0;
  stack.add(task.id);
  const deps = dependencyIds(task).map(taskById).filter(d => d && d.project_id === projectId && visible.has(d.id));
  const depth = deps.length ? 1 + Math.max(...deps.map(d => graphDepth(d, visible, projectId, memo, stack))) : 0;
  stack.delete(task.id); memo.set(task.id, depth); return depth;
}

function graphLevels(projectId, mode) {
  const visible = visibleGraphIds(projectId, mode), memo = new Map(), levels = new Map();
  projectTasks(projectId).filter(t => visible.has(t.id)).forEach(t => {
    const depth = graphDepth(t, visible, projectId, memo, new Set());
    if (!levels.has(depth)) levels.set(depth, []);
    levels.get(depth).push(t);
  });
  return [...levels.entries()].sort((a,b) => a[0]-b[0]).map(([depth, items]) => ({ depth, items: items.sort((a,b) => (priorityRank[b.priority]-priorityRank[a.priority]) || a.id.localeCompare(b.id)) }));
}

function mapModeName(mode) { return mode === 'gates' ? 'Current gates' : mode === 'active' ? 'All active' : 'All tasks'; }

function renderDependencyMap() {
  const project = state.projects.find(p => p.id === dashboardEnhancements.mapProjectId);
  if (!project) return;
  const content = document.getElementById('dependencyDialogContent');
  const levels = graphLevels(project.id, dashboardEnhancements.mapMode);
  const shown = levels.reduce((n, x) => n + x.items.length, 0), total = projectTasks(project.id).length;
  content.innerHTML = `
    <div class="dependency-map-head"><div><p class="eyebrow">DEPENDENCY MAP</p><h3>${escapeHtml(project.name)}</h3><p>${dashboardEnhancements.mapMode === 'gates' ? 'Current executable frontier plus the next two downstream gates.' : dashboardEnhancements.mapMode === 'active' ? 'All non-backlog, non-completed work.' : 'Complete task graph including backlog and completed work.'}</p></div><a href="${projectStateUrl(project)}" target="_blank" rel="noreferrer">Open project state ↗</a></div>
    <div class="dependency-toolbar">${['gates','active','all'].map(m => `<button type="button" class="map-mode${dashboardEnhancements.mapMode === m ? ' active' : ''}" data-map-mode="${m}">${mapModeName(m)}</button>`).join('')}<span>${shown} of ${total} tasks shown</span></div>
    <div class="dependency-board">${levels.map((level, i) => `<section class="dependency-level"><header><span>${i === 0 ? 'Start / available' : `Gate ${level.depth}`}</span><strong>${level.items.length}</strong></header><div class="dependency-nodes">${level.items.map(t => {
      const deps = dependencyIds(t).filter(id => { const d = taskById(id); return d && d.project_id === project.id; });
      return `<button type="button" class="dependency-node" data-map-task="${escapeHtml(t.id)}" data-status="${escapeHtml(t.status)}"><span class="node-id">${escapeHtml(t.id)}</span><span class="node-title">${escapeHtml(t.title)}</span><span class="node-meta">${pretty(t.status)} · ${pretty(t.action)}</span>${deps.length ? `<span class="node-deps">← ${deps.map(escapeHtml).join(' · ')}</span>` : ''}</button>`;
    }).join('')}</div></section>`).join('')}</div>`;
  content.querySelectorAll('[data-map-mode]').forEach(b => b.addEventListener('click', () => { dashboardEnhancements.mapMode = b.dataset.mapMode; renderDependencyMap(); }));
  content.querySelectorAll('[data-map-task]').forEach(b => b.addEventListener('click', () => { const t = taskById(b.dataset.mapTask); if (!t) return; document.getElementById('dependencyDialog').close(); openTask(t); }));
}

function openDependencyMap(project) {
  dashboardEnhancements.mapProjectId = project.id;
  dashboardEnhancements.mapMode = 'gates';
  renderDependencyMap();
  const dialog = document.getElementById('dependencyDialog');
  if (!dialog.open) dialog.showModal();
}

renderProjects = function() {
  const list = document.getElementById('projectList');
  list.replaceChildren();
  state.projects.forEach(p => {
    const tasks = projectTasks(p.id), ready = tasks.filter(t => t.status === 'ready').length, blocked = tasks.filter(t => t.status === 'blocked').length;
    const card = document.createElement('article'); card.className = 'project-card';
    card.innerHTML = `<h3>${escapeHtml(p.name)}</h3><div class="project-meta"><span class="badge">${pretty(p.phase)}</span><span class="badge status-ready">${ready} ready</span><span class="badge status-blocked">${blocked} blocked</span>${p.checkpoint ? `<span class="badge">${escapeHtml(p.checkpoint)}</span>` : ''}</div>${p.objective ? `<p class="project-objective">${escapeHtml(p.objective)}</p>` : ''}<div class="project-actions"><a href="${projectStateUrl(p)}" target="_blank" rel="noreferrer">Open project state ↗</a><button type="button" class="project-map-button">Dependency map</button><a href="https://github.com/${p.repository}" target="_blank" rel="noreferrer">Repo ↗</a></div>`;
    card.querySelector('.project-map-button').addEventListener('click', () => openDependencyMap(p));
    list.appendChild(card);
  });
};
