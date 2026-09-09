// Procurement extension for the Celica engineering dashboard.
// Source data remains in each project's optional purchases.csv.

state.purchases = [];

function normalizePurchaseRow(row, project, entry) {
  const p = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
  return {
    ...p,
    project_id: project.id,
    project_name: project.name,
    repository: entry.repository,
    branch: entry.branch,
    qty_number: /^\d+(?:\.\d+)?$/.test(p.qty || '') ? Number(p.qty) : null,
    price_usd: p.price_usd === '' ? null : Number(p.price_usd),
    track_price: String(p.track_price).toLowerCase() === 'true'
  };
}

function safePurchaseUrl(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? url : '';
}

function purchasesForTask(task) {
  return state.purchases.filter(p => p.task_id === task.id);
}

const procurementBaseLoadProject = loadProject;
loadProject = async function(entry, cacheBust = '') {
  const base = await procurementBaseLoadProject(entry, cacheBust);
  let purchases = [];
  try {
    const res = await fetch(rawUrl(entry.repository, entry.branch, 'purchases.csv', cacheBust), { cache: 'no-store' });
    if (res.ok) purchases = parseCSV(await res.text()).map(row => normalizePurchaseRow(row, base.project, entry));
  } catch (_) {
    // purchases.csv is optional; ordinary project/task loading must remain usable.
  }
  return { ...base, purchases };
};

const procurementBaseValidateTaskData = validateTaskData;
validateTaskData = function(tasks, purchases = state.purchases) {
  const warnings = procurementBaseValidateTaskData(tasks);
  const taskIds = new Set(tasks.map(t => t.id));
  const purchaseCounts = new Map();

  purchases.forEach(p => {
    purchaseCounts.set(p.id, (purchaseCounts.get(p.id) || 0) + 1);
    if (!p.id) warnings.push(`Purchase row for ${p.task_id || 'unknown task'} is missing an ID`);
    if (!p.task_id || !taskIds.has(p.task_id)) warnings.push(`${p.id || 'Purchase row'}: missing task ${p.task_id || '(blank)'}`);
    if (p.track_price && (!safePurchaseUrl(p.url) || p.price_usd === null || !Number.isFinite(p.price_usd))) {
      warnings.push(`${p.id}: price tracking requires a valid URL and numeric price`);
    }
  });

  purchaseCounts.forEach((count, id) => { if (id && count > 1) warnings.push(`Duplicate purchase ID: ${id}`); });

  tasks.filter(t => t.action === 'buy').forEach(t => {
    const linked = purchases.filter(p => p.task_id === t.id && safePurchaseUrl(p.url));
    if (!linked.length) warnings.push(`${t.id}: buy task has no purchase link`);
  });

  return [...new Set(warnings)];
};

// Replace the base loader so procurement rows participate in validation and rendering.
loadData = async function(force = false) {
  const cacheBust = force ? `${Date.now()}-${Math.random().toString(36).slice(2)}` : '';
  const registryUrl = cacheBust ? `projects.json?refresh=${encodeURIComponent(cacheBust)}` : 'projects.json';
  const registryRes = await fetch(registryUrl, { cache: 'no-store' });
  if (!registryRes.ok) throw new Error('Could not load project registry.');
  const registry = await registryRes.json();
  const loaded = await Promise.allSettled(registry.projects.map(entry => loadProject(entry, cacheBust)));
  const failures = loaded.filter(x => x.status === 'rejected');
  const successes = loaded.filter(x => x.status === 'fulfilled').map(x => x.value);

  state.projects = successes.map(x => x.project);
  state.tasks = successes.flatMap(x => x.tasks);
  state.purchases = successes.flatMap(x => x.purchases || []);
  state.validationWarnings = validateTaskData(state.tasks, state.purchases);

  if (state.filters.project !== 'all' && !state.projects.some(p => p.id === state.filters.project)) {
    state.filters.project = 'all';
  }
  return failures.length;
};

function ensurePurchaseStyles() {
  if (document.querySelector('link[data-procurement-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'purchases.css';
  link.dataset.procurementStyle = 'true';
  document.head.appendChild(link);
}

function ensurePurchaseSection() {
  ensurePurchaseStyles();
  if (document.getElementById('purchaseSection')) return;
  const section = document.createElement('section');
  section.id = 'purchaseSection';
  section.className = 'projects-section purchase-section';
  section.innerHTML = `
    <div class="results-head">
      <div>
        <p class="eyebrow">PROCUREMENT</p>
        <h2>Purchase list</h2>
        <p class="purchase-lede">Task-linked sources grouped by build stage. Price snapshots are dated; only stable retail SKUs are marked for tracking.</p>
      </div>
      <span id="purchaseCount" class="result-count"></span>
    </div>
    <div id="purchaseList" class="purchase-list"></div>`;
  const projects = document.querySelector('.projects-section');
  if (projects) projects.parentNode.insertBefore(section, projects);
  else document.querySelector('.shell').appendChild(section);
}

function purchaseDisplayPrice(p) {
  if (p.price_usd === null || !Number.isFinite(p.price_usd)) return '';
  const unit = `$${p.price_usd.toFixed(2)}`;
  if (p.qty_number && p.qty_number > 1) return `${unit} ea · $${(p.price_usd * p.qty_number).toFixed(2)} qty ${p.qty_number}`;
  return unit;
}

function purchaseCard(p) {
  const task = state.tasks.find(t => t.id === p.task_id);
  const url = safePurchaseUrl(p.url);
  const article = document.createElement('article');
  article.className = `purchase-card purchase-state-${escapeHtml(p.state || 'unknown')}`;
  article.innerHTML = `
    <div class="purchase-card-top">
      <div>
        <span class="task-id">${escapeHtml(p.task_id)}${task ? ` · ${escapeHtml(task.title)}` : ''}</span>
        <h4>${escapeHtml(p.item || p.part_number || p.id)}</h4>
      </div>
      <span class="badge">${pretty(p.state || 'unknown')}</span>
    </div>
    <div class="purchase-meta">
      ${p.system ? `<span>${escapeHtml(p.system)}</span>` : ''}
      ${p.part_number ? `<span>${escapeHtml(p.part_number)}</span>` : ''}
      ${p.qty ? `<span>Qty ${escapeHtml(p.qty)}</span>` : ''}
      ${p.vendor ? `<span>${escapeHtml(p.vendor)}</span>` : ''}
    </div>
    ${purchaseDisplayPrice(p) ? `<div class="purchase-price"><strong>${escapeHtml(purchaseDisplayPrice(p))}</strong>${p.price_checked_at ? `<span>checked ${escapeHtml(p.price_checked_at)}</span>` : ''}${p.track_price ? '<span class="badge price-track">Price tracked</span>' : ''}</div>` : ''}
    ${p.notes ? `<p>${escapeHtml(p.notes)}</p>` : ''}
    <div class="purchase-actions">
      ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${p.state === 'source' ? 'Open source / search ↗' : 'Open purchase link ↗'}</a>` : '<span>Link pending verification</span>'}
      ${task ? `<button type="button" data-purchase-task="${escapeHtml(task.id)}">Open task</button>` : ''}
    </div>`;
  article.querySelector('[data-purchase-task]')?.addEventListener('click', () => openTask(task));
  return article;
}

function renderPurchases() {
  ensurePurchaseSection();
  const list = document.getElementById('purchaseList');
  const count = document.getElementById('purchaseCount');
  if (!list || !count) return;

  let purchases = state.purchases.slice();
  if (state.filters.project !== 'all') purchases = purchases.filter(p => p.project_id === state.filters.project);
  purchases.sort((a, b) => `${a.stage}|${a.project_name}|${a.system}|${a.item}`.localeCompare(`${b.stage}|${b.project_name}|${b.system}|${b.item}`));
  count.textContent = `${purchases.length} item${purchases.length === 1 ? '' : 's'}`;
  list.replaceChildren();

  if (!purchases.length) {
    const empty = document.createElement('div');
    empty.className = 'message';
    empty.textContent = 'No procurement rows are defined for this project yet.';
    list.appendChild(empty);
    return;
  }

  const groups = new Map();
  purchases.forEach(p => {
    const key = `${p.stage || p.project_name}|||${p.project_name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });

  [...groups.entries()].forEach(([key, rows]) => {
    const [stage, projectName] = key.split('|||');
    const group = document.createElement('section');
    group.className = 'purchase-stage';
    group.innerHTML = `<header><div><span class="eyebrow">${escapeHtml(projectName)}</span><h3>${escapeHtml(stage)}</h3></div><span class="result-count">${rows.length}</span></header><div class="purchase-grid"></div>`;
    const grid = group.querySelector('.purchase-grid');
    rows.forEach(p => grid.appendChild(purchaseCard(p)));
    list.appendChild(group);
  });
}

const procurementBaseRender = render;
render = function() {
  procurementBaseRender();
  renderPurchases();
};

const procurementBaseBindUI = bindUI;
bindUI = function() {
  procurementBaseBindUI();
  document.getElementById('projectFilters')?.addEventListener('click', () => queueMicrotask(renderPurchases));
};

const procurementBaseTaskCard = taskCard;
taskCard = function(t) {
  const card = procurementBaseTaskCard(t);
  if (t.action === 'buy') {
    const linked = purchasesForTask(t).filter(p => safePurchaseUrl(p.url)).length;
    const badges = card.querySelector('.badges');
    if (badges) {
      const badge = document.createElement('span');
      badge.className = `badge ${linked ? 'purchase-linked' : 'purchase-missing'}`;
      badge.textContent = linked ? `${linked} purchase link${linked === 1 ? '' : 's'}` : 'Missing purchase link';
      badges.appendChild(badge);
    }
  }
  return card;
};

function taskPurchaseHtml(t) {
  const rows = purchasesForTask(t);
  if (!rows.length) return '';
  return `
    <section class="task-purchases">
      <h4>Purchase links</h4>
      ${rows.map(p => {
        const url = safePurchaseUrl(p.url);
        return `<div class="task-purchase-row">
          <div><strong>${escapeHtml(p.item || p.part_number || p.id)}</strong><span>${escapeHtml([p.part_number, p.vendor, purchaseDisplayPrice(p)].filter(Boolean).join(' · '))}</span></div>
          <span class="badge">${pretty(p.state || 'unknown')}</span>
          ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Open ↗</a>` : '<span>Link pending</span>'}
        </div>`;
      }).join('')}
    </section>`;
}

const procurementBaseOpenTask = openTask;
openTask = function(t) {
  procurementBaseOpenTask(t);
  const content = document.getElementById('taskDialogContent');
  const html = taskPurchaseHtml(t);
  if (content && html) content.insertAdjacentHTML('beforeend', html);
};
