const state = {
  projects: [],
  tasks: [],
  filters: { project: 'all', time: 'all', context: 'all', action: 'all', status: 'ready', priority: 'all', cost: 'all', search: '' }
};

const priorityRank = { low: 1, medium: 2, high: 3, critical: 4 };

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else {
      if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch !== '\r') field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.filter(r => r.some(v => v !== '')).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

function parseProjectYaml(text) {
  const get = key => {
    const m = text.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
  };
  const objectiveMatch = text.match(/^objective:\s*>-\s*\n((?:\s{2}.+\n?)+)/m);
  const objective = objectiveMatch ? objectiveMatch[1].split('\n').map(s => s.trim()).join(' ').trim() : '';
  return {
    id: get('id'),
    name: get('name'),
    status: get('status'),
    phase: get('phase'),
    checkpoint: get('checkpoint'),
    objective
  };
}

function rawUrl(repo, branch, path) {
  return `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
}

async function loadProject(entry) {
  const [metaRes, taskRes] = await Promise.all([
    fetch(rawUrl(entry.repository, entry.branch, 'project.yaml'), { cache: 'no-store' }),
    fetch(rawUrl(entry.repository, entry.branch, 'tasks.csv'), { cache: 'no-store' })
  ]);
  if (!metaRes.ok || !taskRes.ok) throw new Error(`Could not load ${entry.repository}`);
  const project = { ...parseProjectYaml(await metaRes.text()), repository: entry.repository, branch: entry.branch };
  const tasks = parseCSV(await taskRes.text()).map(t => ({
    ...t,
    project_id: project.id,
    project_name: project.name,
    repository: entry.repository,
    branch: entry.branch,
    time_min: Number(t.time_min || 0),
    cost: t.cost === '' ? null : Number(t.cost),
    requires_car_down: String(t.requires_car_down).toLowerCase() === 'true',
    requires_parts: String(t.requires_parts).toLowerCase() === 'true'
  }));
  return { project, tasks };
}

async function init() {
  const message = document.getElementById('message');
  try {
    const registryRes = await fetch('projects.json', { cache: 'no-store' });
    if (!registryRes.ok) throw new Error('Could not load project registry.');
    const registry = await registryRes.json();
    const loaded = await Promise.allSettled(registry.projects.map(loadProject));
    const failures = loaded.filter(x => x.status === 'rejected');
    const successes = loaded.filter(x => x.status === 'fulfilled').map(x => x.value);
    state.projects = successes.map(x => x.project);
    state.tasks = successes.flatMap(x => x.tasks);
    if (failures.length) {
      message.hidden = false;
      message.textContent = `${failures.length} project source${failures.length === 1 ? '' : 's'} could not be loaded.`;
    }
    renderProjectFilters();
    bindUI();
    render();
  } catch (err) {
    message.hidden = false;
    message.textContent = `Dashboard data could not be loaded: ${err.message}`;
  }
}

function renderProjectFilters() {
  const group = document.getElementById('projectFilters');
  state.projects.forEach(project => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.dataset.value = project.id;
    button.textContent = project.name;
    group.appendChild(button);
  });
}

function bindUI() {
  document.querySelectorAll('.chips').forEach(group => {
    group.addEventListener('click', event => {
      const button = event.target.closest('.chip');
      if (!button) return;
      group.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      button.classList.add('active');
      state.filters[group.dataset.filter] = button.dataset.value;
      renderTasks();
    });
  });

  const status = document.getElementById('statusFilter');
  const priority = document.getElementById('priorityFilter');
  const cost = document.getElementById('costFilter');
  const search = document.getElementById('searchInput');
  status.addEventListener('change', () => { state.filters.status = status.value; renderTasks(); });
  priority.addEventListener('change', () => { state.filters.priority = priority.value; renderTasks(); });
  cost.addEventListener('change', () => { state.filters.cost = cost.value; renderTasks(); });
  search.addEventListener('input', () => { state.filters.search = search.value.trim().toLowerCase(); renderTasks(); });

  document.getElementById('resetButton').addEventListener('click', resetFilters);
  document.getElementById('pickButton').addEventListener('click', pickTask);
}

function resetFilters() {
  state.filters = { project: 'all', time: 'all', context: 'all', action: 'all', status: 'ready', priority: 'all', cost: 'all', search: '' };
  document.querySelectorAll('.chips').forEach(group => {
    group.querySelectorAll('.chip').forEach((button, i) => button.classList.toggle('active', i === 0));
  });
  document.getElementById('statusFilter').value = 'ready';
  document.getElementById('priorityFilter').value = 'all';
  document.getElementById('costFilter').value = 'all';
  document.getElementById('searchInput').value = '';
  renderTasks();
}

function taskMatches(t) {
  const f = state.filters;
  if (f.project !== 'all' && t.project_id !== f.project) return false;
  if (f.status !== 'all' && t.status !== f.status) return false;
  if (f.time !== 'all' && t.time_min > Number(f.time)) return false;
  if (f.context !== 'all' && t.context !== f.context) return false;
  if (f.action !== 'all' && t.action !== f.action) return false;
  if (f.priority !== 'all' && priorityRank[t.priority] < priorityRank[f.priority]) return false;
  if (f.cost !== 'all') {
    const cost = t.cost ?? 0;
    if (cost > Number(f.cost)) return false;
  }
  if (f.search) {
    const haystack = [t.id, t.title, t.notes, t.action, t.context, t.blocked_by, t.project_name].join(' ').toLowerCase();
    if (!haystack.includes(f.search)) return false;
  }
  return true;
}

function filteredTasks() {
  return state.tasks.filter(taskMatches).sort((a, b) => {
    return (priorityRank[b.priority] - priorityRank[a.priority]) || (a.time_min - b.time_min) || a.id.localeCompare(b.id);
  });
}

function render() {
  renderSummary();
  renderTasks();
  renderProjects();
}

function renderSummary() {
  document.getElementById('projectCount').textContent = state.projects.length;
  document.getElementById('readyCount').textContent = state.tasks.filter(t => t.status === 'ready').length;
  document.getElementById('blockedCount').textContent = state.tasks.filter(t => t.status === 'blocked').length;
  document.getElementById('backlogCount').textContent = state.tasks.filter(t => t.status === 'backlog').length;
}

function pretty(value) {
  return String(value || '').replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function taskDocUrl(t) {
  if (!t.doc_link) return `https://github.com/${t.repository}`;
  const [path, anchor] = t.doc_link.split('#');
  return `https://github.com/${t.repository}/blob/${t.branch}/${path}${anchor ? `#${anchor}` : ''}`;
}

function taskCard(t) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'task-card';
  button.innerHTML = `
    <div class="task-top">
      <div>
        <span class="task-id">${escapeHtml(t.id)} · ${escapeHtml(t.project_name)}</span>
        <h3 class="task-title">${escapeHtml(t.title)}</h3>
      </div>
      <span class="task-time">${t.time_min || '?'} min</span>
    </div>
    <div class="badges">
      <span class="badge status-${escapeHtml(t.status)}">${pretty(t.status)}</span>
      <span class="badge priority-${escapeHtml(t.priority)}">${pretty(t.priority)}</span>
      <span class="badge">${pretty(t.context)}</span>
      <span class="badge">${pretty(t.action)}</span>
      ${t.cost !== null ? `<span class="badge">$${escapeHtml(t.cost)}</span>` : ''}
    </div>
    ${t.notes ? `<p class="task-note">${escapeHtml(t.notes)}</p>` : ''}
    ${t.blocked_by ? `<div class="blocked-line">Blocked by ${escapeHtml(t.blocked_by)}</div>` : ''}
  `;
  button.addEventListener('click', () => openTask(t));
  return button;
}

function renderTasks() {
  const list = document.getElementById('taskList');
  const count = document.getElementById('resultCount');
  const title = document.getElementById('resultTitle');
  const tasks = filteredTasks();
  list.replaceChildren();
  count.textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'}`;

  const project = state.projects.find(p => p.id === state.filters.project);
  const statusTitle = state.filters.status === 'ready' ? 'Ready now' : state.filters.status === 'all' ? 'All work' : pretty(state.filters.status);
  title.textContent = project ? `${project.name} · ${statusTitle}` : statusTitle;

  if (!tasks.length) {
    const empty = document.createElement('div');
    empty.className = 'message';
    empty.textContent = 'Nothing matches those constraints. Widen a filter or reset.';
    list.appendChild(empty);
    return;
  }
  tasks.slice(0, 80).forEach(t => list.appendChild(taskCard(t)));
}

function renderProjects() {
  const list = document.getElementById('projectList');
  list.replaceChildren();
  state.projects.forEach(p => {
    const tasks = state.tasks.filter(t => t.project_id === p.id);
    const ready = tasks.filter(t => t.status === 'ready').length;
    const blocked = tasks.filter(t => t.status === 'blocked').length;
    const card = document.createElement('article');
    card.className = 'project-card';
    card.innerHTML = `
      <h3>${escapeHtml(p.name)}</h3>
      <div class="project-meta">
        <span class="badge">${pretty(p.phase)}</span>
        <span class="badge status-ready">${ready} ready</span>
        <span class="badge status-blocked">${blocked} blocked</span>
        ${p.checkpoint ? `<span class="badge">${escapeHtml(p.checkpoint)}</span>` : ''}
      </div>
      ${p.objective ? `<p class="project-objective">${escapeHtml(p.objective)}</p>` : ''}
      <div class="project-actions">
        <a href="https://github.com/${p.repository}" target="_blank" rel="noreferrer">Open project repo ↗</a>
      </div>
    `;
    list.appendChild(card);
  });
}

function openTask(t) {
  const dialog = document.getElementById('taskDialog');
  const content = document.getElementById('taskDialogContent');
  content.innerHTML = `
    <span class="task-id">${escapeHtml(t.id)} · ${escapeHtml(t.project_name)}</span>
    <h3>${escapeHtml(t.title)}</h3>
    ${t.notes ? `<p>${escapeHtml(t.notes)}</p>` : ''}
    <div class="detail-grid">
      <div><span>Status</span><strong>${pretty(t.status)}</strong></div>
      <div><span>Priority</span><strong>${pretty(t.priority)}</strong></div>
      <div><span>Time</span><strong>${t.time_min || '?'} min</strong></div>
      <div><span>Context</span><strong>${pretty(t.context)}</strong></div>
      <div><span>Action</span><strong>${pretty(t.action)}</strong></div>
      <div><span>Cost</span><strong>${t.cost === null ? 'Not specified' : `$${t.cost}`}</strong></div>
    </div>
    ${t.blocked_by ? `<p><strong>Blocked by:</strong> ${escapeHtml(t.blocked_by)}</p>` : ''}
    ${t.decision_needed ? `<p><strong>Decision:</strong> ${escapeHtml(t.decision_needed)}</p>` : ''}
    <p><a href="${taskDocUrl(t)}" target="_blank" rel="noreferrer">Open engineering context on GitHub ↗</a></p>
  `;
  dialog.showModal();
}

function pickTask() {
  const tasks = filteredTasks();
  if (!tasks.length) return;
  const topRank = priorityRank[tasks[0].priority];
  const candidates = tasks.filter(t => priorityRank[t.priority] === topRank).slice(0, 6);
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  openTask(chosen);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

document.addEventListener('DOMContentLoaded', init);
