const state = {
  projects: [],
  tasks: [],
  purchases: [],
  validationWarnings: [],
  filters: {
    project: 'all', time: 'all', context: 'all', action: 'all',
    carDown: 'all', parts: 'all', status: 'ready', priority: 'all', cost: 'all', search: ''
  }
};

const priorityRank = { low: 1, medium: 2, high: 3, critical: 4 };
const validStatuses = new Set(['backlog', 'ready', 'doing', 'blocked', 'verify', 'done']);
const validActions = new Set(['research', 'measure', 'buy', 'cad', 'mockup', 'bench-test', 'vehicle-test', 'code', 'fabricate', 'install', 'document', 'verify']);
const validContexts = new Set(['desk', 'phone', 'garage', 'car', 'bench', 'cad', 'computer']);

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

function foldedYamlValue(text, key) {
  const m = text.match(new RegExp(`^${key}:\\s*>-\\s*\\n((?:\\s{2}.+\\n?)+)`, 'm'));
  return m ? m[1].split('\n').map(s => s.trim()).filter(Boolean).join(' ').trim() : '';
}

function parsePurchaseIndex(text) {
  const raw = foldedYamlValue(text, 'purchase_index');
  if (!raw) return [];
  return raw.split(';').map(x => x.trim()).filter(Boolean).map(entry => {
    const [task_id = '', stage = '', item = '', url = '', price_usd = '', price_checked_at = '', mode = ''] = entry.split('|').map(x => x.trim());
    return {
      task_id,
      stage,
      item,
      url,
      price_usd: price_usd === '' ? null : Number(price_usd),
      price_checked_at,
      track_price: mode === 'track',
      mode
    };
  });
}

function parseProjectYaml(text) {
  const get = key => {
    const m = text.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
  };
  const objective = foldedYamlValue(text, 'objective');
  return {
    id: get('id'),
    name: get('name'),
    status: get('status'),
    phase: get('phase'),
    checkpoint: get('checkpoint'),
    objective
  };
}

function rawUrl(repo, branch, path, cacheBust = '') {
  const base = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
  return cacheBust ? `${base}?refresh=${encodeURIComponent(cacheBust)}` : base;
}

async function loadProject(entry, cacheBust = '') {
  const [metaRes, taskRes] = await Promise.all([
    fetch(rawUrl(entry.repository, entry.branch, 'project.yaml', cacheBust), { cache: 'no-store' }),
    fetch(rawUrl(entry.repository, entry.branch, 'tasks.csv', cacheBust), { cache: 'no-store' })
  ]);
  if (!metaRes.ok || !taskRes.ok) throw new Error(`Could not load ${entry.repository}`);
  const metaText = await metaRes.text();
  const project = { ...parseProjectYaml(metaText), repository: entry.repository, branch: entry.branch };
  const purchases = parsePurchaseIndex(metaText).map(p => ({
    ...p,
    project_id: project.id,
    project_name: project.name,
    repository: entry.repository,
    branch: entry.branch
  }));
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
  return { project, tasks, purchases };
}

function validateTaskData(tasks, purchases) {
  const warnings = [];
  const counts = new Map();
  tasks.forEach(t => counts.set(t.id, (counts.get(t.id) || 0) + 1));
  counts.forEach((count, id) => { if (count > 1) warnings.push(`Duplicate task ID: ${id}`); });

  const ids = new Set(tasks.map(t => t.id));
  tasks.forEach(t => {
    if (!validStatuses.has(t.status)) warnings.push(`${t.id}: invalid status '${t.status}'`);
    if (!validActions.has(t.action)) warnings.push(`${t.id}: invalid action '${t.action}'`);
    if (!validContexts.has(t.context)) warnings.push(`${t.id}: invalid context '${t.context}'`);
    if (t.action === 'buy' && t.status !== 'done') {
      const links = purchases.filter(p => p.task_id === t.id && p.url);
      if (!links.length) warnings.push(`${t.id}: buy task has no purchase link`);
    }
    if (t.blocked_by) {
      t.blocked_by.split(';').map(x => x.trim()).filter(Boolean).forEach(dep => {
        if (!ids.has(dep)) warnings.push(`${t.id}: missing dependency ${dep}`);
      });
    }
  });
  purchases.forEach(p => {
    if (!ids.has(p.task_id)) warnings.push(`Purchase entry references missing task ${p.task_id}`);
    if (p.url && !/^https?:\/\//i.test(p.url)) warnings.push(`${p.task_id}: malformed purchase URL for ${p.item}`);
  });
  return [...new Set(warnings)];
}

async function loadData(force = false) {
  const cacheBust = force ? `${Date.now()}-${Math.random().toString(36).slice(2)}` : '';
  const registryUrl = cacheBust ? `projects.json?refresh=${encodeURIComponent(cacheBust)}` : 'projects.json';
  const registryRes = await fetch(registryUrl, { cache: 'no-store' });
  if (!registryRes.ok) throw new Error('Could not load project registry.');
  const registry = await registryRes.json();
  const loaded = await Promise.allSettled(registry.projects.map(entry => loadProject(entry, cacheBust)));
  const failures = loaded.filter(x => x.status === 'rejected');
  const successes = loaded.filter(x => x.status === 'fulfilled').map(x => x.value);
  state.projects = successes.map(x => x.project);
  state.purchases = successes.flatMap(x => x.purchases);
  state.tasks = successes.flatMap(x => x.tasks).map(t => ({
    ...t,
    purchases: state.purchases.filter(p => p.task_id === t.id)
  }));
  state.validationWarnings = validateTaskData(state.tasks, state.purchases);

  if (state.filters.project !== 'all' && !state.projects.some(p => p.id === state.filters.project)) {
    state.filters.project = 'all';
  }

  return failures.length;
}

async function refreshData(force = false) {
  const message = document.getElementById('message');
  const button = document.getElementById('refreshButton');
  if (button) {
    button.disabled = true;
    button.textContent = force ? 'Refreshing…' : 'Loading…';
  }
  try {
    const failureCount = await loadData(force);
    renderProjectFilters();
    render();
    message.hidden = false;
    if (failureCount) {
      message.textContent = `${failureCount} project source${failureCount === 1 ? '' : 's'} could not be loaded.`;
    } else if (state.validationWarnings.length) {
      const preview = state.validationWarnings.slice(0, 3).join(' · ');
      message.textContent = `${state.validationWarnings.length} task-data warning${state.validationWarnings.length === 1 ? '' : 's'}: ${preview}${state.validationWarnings.length > 3 ? ' …' : ''}`;
    } else if (force) {
      message.textContent = `Fresh data loaded from GitHub at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}.`;
    } else {
      message.hidden = true;
      message.textContent = '';
    }
  } catch (err) {
    message.hidden = false;
    message.textContent = `Dashboard data could not be loaded: ${err.message}`;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Refresh data';
    }
  }
}

async function init() {
  bindUI();
  await refreshData(false);
}

function renderProjectFilters() {
  const group = document.getElementById('projectFilters');
  group.replaceChildren();

  const allButton = document.createElement('button');
  allButton.type = 'button';
  allButton.className = `chip${state.filters.project === 'all' ? ' active' : ''}`;
  allButton.dataset.value = 'all';
  allButton.textContent = 'All projects';
  group.appendChild(allButton);

  state.projects.forEach(project => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `chip${state.filters.project === project.id ? ' active' : ''}`;
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
  document.getElementById('refreshButton').addEventListener('click', () => refreshData(true));
}

function resetFilters() {
  state.filters = {
    project: 'all', time: 'all', context: 'all', action: 'all',
    carDown: 'all', parts: 'all', status: 'ready', priority: 'all', cost: 'all', search: ''
  };
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
  if (f.carDown !== 'all' && String(t.requires_car_down) !== f.carDown) return false;
  if (f.parts !== 'all' && String(t.requires_parts) !== f.parts) return false;
  if (f.priority !== 'all' && priorityRank[t.priority] < priorityRank[f.priority]) return false;
  if (f.cost !== 'all') {
    const cost = t.cost ?? 0;
    if (cost > Number(f.cost)) return false;
  }
  if (f.search) {
    const purchaseText = (t.purchases || []).map(p => `${p.stage} ${p.item}`).join(' ');
    const haystack = [t.id, t.title, t.notes, t.action, t.context, t.blocked_by, t.project_name, purchaseText].join(' ').toLowerCase();
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
      ${t.requires_car_down ? '<span class="badge">Car down</span>' : ''}
      ${t.requires_parts ? '<span class="badge">Needs parts</span>' : ''}
      ${t.cost !== null ? `<span class="badge">$${escapeHtml(t.cost)}</span>` : ''}
      ${(t.purchases || []).length ? `<span class="badge">${t.purchases.length} purchase link${t.purchases.length === 1 ? '' : 's'}</span>` : ''}
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
    const purchaseCount = state.purchases.filter(x => x.project_id === p.id && x.url).length;
    const card = document.createElement('article');
    card.className = 'project-card';
    card.innerHTML = `
      <h3>${escapeHtml(p.name)}</h3>
      <div class="project-meta">
        <span class="badge">${pretty(p.phase)}</span>
        <span class="badge status-ready">${ready} ready</span>
        <span class="badge status-blocked">${blocked} blocked</span>
        ${purchaseCount ? `<span class="badge">${purchaseCount} purchase link${purchaseCount === 1 ? '' : 's'}</span>` : ''}
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

function purchaseMarkup(t) {
  const purchases = (t.purchases || []).filter(p => p.url);
  if (!purchases.length) return '';
  const rows = purchases.map(p => {
    const price = p.price_usd === null ? '' : ` · $${p.price_usd.toFixed(2)}`;
    const checked = p.price_checked_at ? ` · checked ${escapeHtml(p.price_checked_at)}` : '';
    const tracking = p.track_price ? ' · price-trackable' : '';
    return `<li><a href="${escapeHtml(p.url)}" target="_blank" rel="noreferrer">${escapeHtml(p.item)} ↗</a><span>${escapeHtml(p.stage)}${price}${checked}${tracking}</span></li>`;
  }).join('');
  return `<div class="purchase-links"><h4>Purchase links</h4><ul>${rows}</ul></div>`;
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
      <div><span>Car down</span><strong>${t.requires_car_down ? 'Yes' : 'No'}</strong></div>
      <div><span>Parts needed</span><strong>${t.requires_parts ? 'Yes' : 'No'}</strong></div>
    </div>
    ${purchaseMarkup(t)}
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