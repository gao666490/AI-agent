/* Agent Guide wizard UI — vanilla JS, no build step (design §4). */
'use strict';

const STEPS = [
  'welcome', 'platform', 'agent', 'permission', 'folder',
  'prereqs', 'install', 'model', 'apikey', 'config', 'finish',
];

const state = {
  token: new URLSearchParams(location.search).get('token') || '',
  server: {},
  dict: {},
  lang: 'zh-CN',
  env: null,
  agents: [],
  plan: null,
  step: 'welcome',
  confirmed: [],
  agentId: null,
  workDir: null,
  mode: null,
  platform: null,
};

/* ---------------- api helpers ---------------- */

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers['X-Agent-Guide-Token'] = state.token;
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function t(key) {
  return state.dict[key] || key;
}

/* ---------------- rendering ---------------- */

const view = document.getElementById('view');
const stepsEl = document.getElementById('steps');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderSteps() {
  const currentIdx = STEPS.indexOf(state.step);
  stepsEl.innerHTML = STEPS.map((id, i) => {
    const cls = ['step-item'];
    if (i === currentIdx) cls.push('active');
    else if (i < currentIdx) cls.push('done');
    else cls.push('locked');
    return `<li class="${cls.join(' ')}" data-step="${id}"><span class="step-num">${i + 1}</span><span data-i18n="step.${id}">${t(`step.${id}`)}</span></li>`;
  }).join('');
  document.querySelectorAll('[data-step]').forEach((el) => {
    el.addEventListener('click', () => { /* step nav is driven by flow buttons */ });
  });
}

function translate() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.title = t('app.name');
  document.documentElement.lang = state.lang === 'en' ? 'en' : 'zh-CN';
}

async function render() {
  renderSteps();
  translate();
  const fn = viewRenderers[state.step] || viewRenderers.placeholder;
  view.innerHTML = await fn();
  translate();
  bindActions();
}

/* ---------------- views ---------------- */

const viewRenderers = {};

viewRenderers.welcome = async () => `
  <div class="card">
    <h2 data-i18n="welcome.title">${t('welcome.title')}</h2>
    <p class="subtitle" data-i18n="welcome.subtitle">${t('welcome.subtitle')}</p>
    <h3 data-i18n="welcome.detect.title">${t('welcome.detect.title')}</h3>
    <div id="detect-area"><div class="loading" data-i18n="welcome.detect.running">${t('welcome.detect.running')}</div></div>
    <div class="actions">
      <button class="btn" id="btn-redetect" data-i18n="common.refresh">${t('common.refresh')}</button>
      <button class="btn primary" id="btn-next" data-i18n="common.next">${t('common.next')}</button>
    </div>
  </div>`;

viewRenderers.platform = () => `
  <div class="card">
    <h2 data-i18n="platform.title">${t('platform.title')}</h2>
    <p class="subtitle" data-i18n="platform.subtitle">${t('platform.subtitle')}</p>
    <div class="grid">
      ${['windows', 'macos', 'linux'].map((p) => `
        <div class="agent-card platform-card ${state.platform === p ? 'selected' : ''}" data-platform="${p}">
          <h3>${t(`platform.${p}`)}</h3>
          <div class="meta">${p === recipePlatformNow() ? t('common.status') + ': ' + t('detect.value.missing') + '' : ''}</div>
        </div>`).join('')}
    </div>
    <div class="actions">
      <button class="btn" data-goto="welcome" data-i18n="common.back">${t('common.back')}</button>
      <button class="btn primary" id="btn-next" data-i18n="common.next">${t('common.next')}</button>
    </div>
  </div>`;

viewRenderers.agent = async () => {
  const agents = await api('/api/agents');
  return `
  <div class="card">
    <h2 data-i18n="agent.title">${t('agent.title')}</h2>
    <p class="subtitle" data-i18n="agent.subtitle">${t('agent.subtitle')}</p>
    <div class="grid">
      ${agents.agents.map((a) => `
        <div class="agent-card ${state.agentId === a.id ? 'selected' : ''}" data-agent="${esc(a.id)}">
          <h3>${esc(a.name)}</h3>
          <div class="meta">${esc(a.license)} · ${t(`agent.plan.mode.${a.platforms[state.platform]?.recommended || 'native'}`)}</div>
          <div class="launch">$ ${esc(a.launchCommand)}</div>
        </div>`).join('')}
    </div>
    <div class="actions">
      <button class="btn" data-goto="platform" data-i18n="common.back">${t('common.back')}</button>
      <button class="btn primary" id="btn-next" data-i18n="common.next">${t('common.next')}</button>
    </div>
  </div>`;
};

viewRenderers.permission = () => {
  const p = state.plan;
  if (!p) return `<div class="loading">…</div>`;
  const badge = p.verified ? '<span class="badge ok">verified</span>' : '<span class="badge warn">unverified</span>';
  const stepCards = (p.steps || []).map((s, i) => `
    <div class="card" style="margin-bottom:10px">
      <h3>${i + 1}. ${esc(s.title || s.id)}</h3>
      <div class="plan-command">$ ${esc(s.command)}</div>
    </div>`).join('') || `<div class="notice">${t('agent.plan.notAvailable')}</div>`;
  return `
  <div class="card">
    <h2 data-i18n="permission.title">${t('permission.title')}</h2>
    <p class="subtitle" data-i18n="permission.subtitle">${t('permission.subtitle')}</p>
    ${p.verified ? '' : `<div class="notice" data-i18n="agent.plan.unverifiedNote">${t('agent.plan.unverifiedNote')}</div>`}
    <h3>${t('agent.plan')} ${badge}</h3>
    ${stepCards}
    <p style="margin-top:12px"><label>${t('agent.plan.requires')}</label><span>${esc((p.requires || []).join(', ') || '—')}</span></p>
    <label>${t('agent.plan.workdir')}</label><div class="code-block">${esc(p.defaultWorkDir || '—')}</div>
    <div class="actions">
      <button class="btn" data-goto="agent" data-i18n="common.back">${t('common.back')}</button>
      <button class="btn primary" id="btn-agree" data-i18n="permission.agree">${t('permission.agree')}</button>
    </div>
  </div>`;
};

viewRenderers.folder = () => `
  <div class="card">
    <h2 data-i18n="folder.title">${t('folder.title')}</h2>
    <p class="subtitle" data-i18n="folder.subtitle">${t('folder.subtitle')}</p>
    <label for="workdir" data-i18n="folder.workdirLabel">${t('folder.workdirLabel')}</label>
    <input type="text" id="workdir" value="${esc(state.workDir || state.plan?.defaultWorkDir || '')}" />
    ${state.mode === 'wsl' ? `<p style="margin-top:10px"><label>${t('folder.wslPreview')}</label><div class="code-block" id="wsl-preview">…</div></p>` : ''}
    <div class="actions">
      <button class="btn" data-goto="permission" data-i18n="common.back">${t('common.back')}</button>
      <button class="btn primary" id="btn-folder" data-i18n="common.continue">${t('common.continue')}</button>
    </div>
  </div>`;

viewRenderers.placeholder = () => `
  <div class="card">
    <h2 data-i18n="m2.title">${t('m2.title')}</h2>
    <p class="subtitle" data-i18n="m2.body">${t('m2.body')}</p>
    <div class="actions">
      <button class="btn" data-goto="${STEPS[Math.max(0, STEPS.indexOf(state.step) - 1)]}" data-i18n="common.back">${t('common.back')}</button>
    </div>
  </div>`;

viewRenderers.finish = () => `
  <div class="card">
    <h2 data-i18n="finish.preview.title">${t('finish.preview.title')}</h2>
    <p class="subtitle" data-i18n="finish.preview.body">${t('finish.preview.body')}</p>
    <h3>${t('common.plan')}</h3>
    <div class="code-block">${esc(JSON.stringify({
      platform: state.platform, mode: state.mode, agent: state.agentId,
      workDir: state.workDir, commands: state.plan?.commands || [],
    }, null, 2))}</div>
    <div class="actions">
      <button class="btn" data-goto="folder" data-i18n="common.back">${t('common.back')}</button>
    </div>
  </div>`;

viewRenderers.prereqs = async () => {
  const plan = state.plan;
  if (!plan || plan.requires.length === 0) {
    return `
    <div class="card">
      <h2 data-i18n="prereqs.title">${t('prereqs.title')}</h2>
      <p class="subtitle" data-i18n="prereqs.none">${t('prereqs.none')}</p>
      <div class="actions">
        <button class="btn" data-goto="folder" data-i18n="common.back">${t('common.back')}</button>
        <button class="btn primary" data-goto="install" data-i18n="common.continue">${t('common.continue')}</button>
      </div>
    </div>`;
  }
  const data = await api(`/api/prereqs`);
  const rows = data.items.map((r) => `
    <tr>
      <td>${esc(r.name)}</td>
      <td><span class="badge ${r.present ? 'ok' : 'err'}">${r.present ? '✓' : '✗'}</span> ${esc(r.version || '—')}</td>
      <td>${r.present ? '' : `<span class="badge warn">${esc(r.hint)}</span>`}</td>
    </tr>`).join('');
  return `
  <div class="card">
    <h2 data-i18n="prereqs.title">${t('prereqs.title')}</h2>
    <p class="subtitle" data-i18n="prereqs.subtitle">${t('prereqs.subtitle')}</p>
    <table class="detect-table">
      <tr><td>${t('common.status')}</td><td>${t('detect.os')}</td><td></td></tr>
      ${rows}
    </table>
    ${data.ok ? '' : `<div class="notice">${t('prereqs.warn')}</div>`}
    <div class="actions">
      <button class="btn" data-goto="folder" data-i18n="common.back">${t('common.back')}</button>
      <button class="btn primary" data-goto="install" data-i18n="common.continue">${t('common.continue')}</button>
    </div>
  </div>`;
};

viewRenderers.install = () => {
  const plan = state.plan;
  if (!plan || !plan.steps || plan.steps.length === 0) {
    return `
    <div class="card">
      <h2 data-i18n="m2.title">${t('m2.title')}</h2>
      <p class="subtitle">${t('install.subtitle')}</p>
      <div class="actions"><button class="btn" data-goto="folder" data-i18n="common.back">${t('common.back')}</button></div>
    </div>`;
  }
  const cards = plan.steps.map((s, i) => {
    const confirmed = state.confirmed.some((c) => c.id === s.id);
    return `
    <div class="card" id="step-${esc(s.id)}">
      <h3>${i + 1}. ${esc(s.title || s.id)} <span class="badge ${confirmed ? 'ok' : ''}" id="badge-${esc(s.id)}">${confirmed ? t('install.confirmedBadge') : '—'}</span></h3>
      <div class="plan-command">$ ${esc(s.command)}</div>
      <div class="actions" style="margin-top:10px">
        ${confirmed ? '' : `<button class="btn" data-confirm="${esc(s.id)}">${t('install.confirm')}</button>`}
        <button class="btn primary" data-run="${esc(s.id)}" ${confirmed ? '' : 'disabled'}>${t('install.run')}</button>
      </div>
    </div>`;
  }).join('');
  return `
  <div class="card">
    <h2 data-i18n="install.title">${t('install.title')}</h2>
    <p class="subtitle" data-i18n="install.subtitle">${t('install.subtitle')}</p>
  </div>
  ${cards}
  <div class="card">
    <h3 data-i18n="install.log">${t('install.log')}</h3>
    <pre class="exec-log" id="exec-log"></pre>
  </div>
  <div class="actions">
    <button class="btn" data-goto="folder" data-i18n="common.back">${t('common.back')}</button>
    <button class="btn primary" data-goto="model" data-i18n="common.next">${t('common.next')}</button>
  </div>`;
};

/* ---------------- execution (SSE) ---------------- */

function appendLog(line) {
  const el = document.getElementById('exec-log');
  if (!el) return;
  el.textContent += line + '\n';
  el.scrollTop = el.scrollHeight;
}

function handleSse(frame, stepId, btn) {
  let event = 'message';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!data) return;
  let obj;
  try { obj = JSON.parse(data); } catch { return; }

  if (event === 'log') {
    appendLog(obj.line);
  } else if (event === 'done') {
    appendLog(`[${t('install.exit')} ${obj.code}${obj.dryRun ? ' · ' + t('install.dryrun') : ''}${obj.timedOut ? ' · timeout' : ''}]`);
    if (btn) { btn.disabled = false; btn.textContent = t('install.run'); }
    const badge = document.getElementById(`badge-${stepId}`);
    if (badge) {
      badge.textContent = obj.code === 0 ? '✓ ' + t('install.done') : '✗ ' + t('install.fail');
      badge.className = 'badge ' + (obj.code === 0 ? 'ok' : 'err');
    }
  }
}

async function executeStep(stepId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = t('install.running'); }
  appendLog(`> ${stepId} …`);
  try {
    const res = await fetch(`/api/steps/${encodeURIComponent(stepId)}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Guide-Token': state.token },
      body: '{}',
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      appendLog(`[error] ${e.error || res.status}`);
      if (btn) { btn.disabled = false; btn.textContent = t('install.run'); }
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        handleSse(frame, stepId, btn);
      }
    }
  } catch (err) {
    appendLog(`[error] ${err.message}`);
    if (btn) { btn.disabled = false; btn.textContent = t('install.run'); }
  }
}

/* ---------------- step logic ---------------- */

function recipePlatformNow() {
  return state.server.recipePlatform || 'windows';
}

async function loadDetect(areaEl) {
  try {
    const data = await api('/api/detect');
    state.env = data.env;
    state.server.recipePlatform = data.recipePlatform;
    const env = data.env;
    const wslVal = env.platform === 'win32'
      ? (env.wsl?.wsl2 ? t('detect.value.wslAvailable') : env.wsl?.available ? t('detect.value.wslWsl1') : t('detect.value.wslNone'))
      : '—';
    const rows = [
      ['detect.os', env.platform], ['detect.arch', env.arch], ['detect.osVersion', env.osVersion],
      ['detect.node', env.node || t('detect.value.missing')],
      ['detect.npm', env.npm || t('detect.value.missing')],
      ['detect.git', env.git || t('detect.value.missing')],
      ['detect.python', env.python || t('detect.value.missing')],
      ['detect.wsl', wslVal],
    ];
    areaEl.innerHTML = `<table class="detect-table">${rows.map(([k, v]) => `
      <tr><td data-i18n="${k}">${t(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;
    translate();
  } catch (err) {
    areaEl.innerHTML = `<div class="notice" data-i18n="welcome.detect.failed">${t('welcome.detect.failed')} (${esc(err.message)})</div>`;
    translate();
  }
}

async function selectAgent(id) {
  state.agentId = id;
  const recipePlatform = state.platform || recipePlatformNow();
  const mode = state.mode || null;
  const data = await api(`/api/agents/${encodeURIComponent(id)}/plan?platform=${recipePlatform}${mode ? `&mode=${mode}` : ''}`);
  state.plan = data.plan;
  state.mode = state.plan.mode;
}

async function goto(step) {
  const data = await api('/api/state', {
    method: 'POST',
    body: JSON.stringify({ step, agentId: state.agentId, platform: state.platform, mode: state.mode, workDir: state.workDir }),
  });
  Object.assign(state, data.state);
  state.server = state.server || {};
  await render();
}

/* ---------------- event binding ---------------- */

function bindActions() {
  document.querySelectorAll('[data-goto]').forEach((el) => {
    el.addEventListener('click', () => goto(el.dataset.goto));
  });

  const nextBtn = document.getElementById('btn-next');
  if (nextBtn) nextBtn.addEventListener('click', () => {
    const order = { welcome: 'platform', platform: 'agent', agent: 'permission' };
    goto(order[state.step]);
  });

  const redetect = document.getElementById('btn-redetect');
  if (redetect) redetect.addEventListener('click', () => {
    const area = document.getElementById('detect-area');
    area.innerHTML = `<div class="loading" data-i18n="welcome.detect.running">${t('welcome.detect.running')}</div>`;
    translate();
    loadDetect(area);
  });

  document.querySelectorAll('.platform-card').forEach((el) => {
    el.addEventListener('click', () => {
      state.platform = el.dataset.platform;
      state.mode = null;
      document.querySelectorAll('.platform-card').forEach((c) => c.classList.remove('selected'));
      el.classList.add('selected');
    });
  });

  document.querySelectorAll('.agent-card[data-agent]').forEach((el) => {
    el.addEventListener('click', async () => {
      await selectAgent(el.dataset.agent);
      document.querySelectorAll('.agent-card[data-agent]').forEach((c) => c.classList.remove('selected'));
      el.classList.add('selected');
    });
  });

  const agree = document.getElementById('btn-agree');
  if (agree) agree.addEventListener('click', async () => {
    await api(`/api/steps/permission/confirm`, { method: 'POST', body: '{}' });
    goto('folder');
  });

  const folderBtn = document.getElementById('btn-folder');
  if (folderBtn) {
    folderBtn.addEventListener('click', () => {
      state.workDir = document.getElementById('workdir')?.value?.trim() || null;
      // 前置环境确认页仅当配方声明 requires 时出现（设计 §6 第 6 步）
      goto((state.plan?.requires?.length || 0) > 0 ? 'prereqs' : 'install');
    });
  }

  document.querySelectorAll('[data-confirm]').forEach((el) => {
    el.addEventListener('click', async () => {
      await api(`/api/steps/${encodeURIComponent(el.dataset.confirm)}/confirm`, { method: 'POST', body: '{}' });
      const data = await api('/api/state');
      state.confirmed = data.state.confirmed;
      await render();
    });
  });

  document.querySelectorAll('[data-run]').forEach((el) => {
    el.addEventListener('click', () => executeStep(el.dataset.run, el));
  });

  const workdir = document.getElementById('workdir');
  if (workdir && state.mode === 'wsl') {
    const preview = document.getElementById('wsl-preview');
    const toWsl = (p) => p.replace(/^([A-Za-z]):/, (m, d) => `/mnt/${d.toLowerCase()}`).replace(/\\/g, '/');
    const update = () => { preview.textContent = toWsl(workdir.value.trim() || state.plan?.defaultWorkDir || ''); };
    workdir.addEventListener('input', update);
    update();
  }
}

/* ---------------- boot ---------------- */

async function boot() {
  // language toggle (fixed top-right, design §6 / §10)
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api('/api/state', { method: 'POST', body: JSON.stringify({ lang: btn.dataset.lang }) });
      location.reload();
    });
  });

  const data = await api('/api/state');
  Object.assign(state, data.state);
  state.server = state.server || {};
  if (state.agentId) {
    try { await selectAgent(state.agentId); } catch { /* plan may not exist yet */ }
  }

  const dictData = await api(`/api/i18n?lang=${encodeURIComponent(state.lang)}`);
  state.dict = dictData.dict;
  state.lang = dictData.lang;

  document.getElementById(`lang-${state.lang}`)?.classList.add('active');

  await render();

  if (state.step === 'welcome') {
    loadDetect(document.getElementById('detect-area'));
  }
}

boot().catch((err) => {
  view.innerHTML = `<div class="notice">${esc(err.message)}</div>`;
});
