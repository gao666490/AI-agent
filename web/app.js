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

viewRenderers.model = async () => {
  const data = await api(`/api/models?agentId=${encodeURIComponent(state.agentId || '')}`);
  const cn = data.models.filter((m) => m.region === 'cn');
  const global = data.models.filter((m) => m.region === 'global');
  const badgeCls = { native: 'ok', 'anthropic-compatible': 'ok', 'openai-compatible': 'ok', router: 'warn', unsupported: 'err' };
  const card = (m) => {
    const disabled = m.compat === 'unsupported';
    return `
    <div class="agent-card model-card ${state.modelId === m.id ? 'selected' : ''} ${disabled ? 'disabled-card' : ''}" data-model="${esc(m.id)}" ${disabled ? 'data-disabled="1"' : ''}>
      <h3>${esc(m.name)}</h3>
      <div class="meta">
        <span class="badge ${badgeCls[m.compat] || ''}">${t(`model.compat.${m.compat}`)}</span>
        ${m.verified ? '' : ' <span class="badge warn">unverified</span>'}
      </div>
      <div class="launch">${esc((m.models || []).join(' · ') || '—')}</div>
    </div>`;
  };
  const geminiNotice = state.agentId === 'gemini' ? `<div class="notice" style="margin-bottom:14px">${t('gemini.notice')}</div>` : '';
  return `
  <div class="card">
    <h2 data-i18n="model.title">${t('model.title')}</h2>
    <p class="subtitle" data-i18n="model.subtitle">${t('model.subtitle')}</p>
  </div>
  ${geminiNotice}
  <h3 class="group-title" data-i18n="model.group.cn">${t('model.group.cn')}</h3>
  <div class="grid">${cn.map(card).join('')}</div>
  <h3 class="group-title" data-i18n="model.group.global">${t('model.group.global')}</h3>
  <div class="grid">${global.map(card).join('')}</div>
  <div class="actions">
    <button class="btn" data-goto="install" data-i18n="common.back">${t('common.back')}</button>
    <button class="btn primary" id="btn-next" data-i18n="common.next">${t('common.next')}</button>
  </div>`;
};

viewRenderers.apikey = async () => {
  // Google Gemini model → Google account login (no API key).
  // CN providers → normal API key flow; the server routes through GCR.
  if (state.agentId === 'gemini' && (!state.modelId || state.modelId === 'google')) {
    return `
    <div class="card">
      <h2 data-i18n="gemini.title">${t('gemini.title')}</h2>
      <p class="subtitle" data-i18n="gemini.body">${t('gemini.body')}</p>
      <div class="code-block">$ gemini auth login</div>
      <p class="subtitle" style="margin-top:10px" data-i18n="gemini.after">${t('gemini.after')}</p>
      <div class="actions">
        <button class="btn" data-goto="model" data-i18n="common.back">${t('common.back')}</button>
        <button class="btn primary" data-goto="finish" data-i18n="common.continue">${t('common.continue')}</button>
      </div>
    </div>`;
  }
  const data = await api(`/api/models?agentId=${encodeURIComponent(state.agentId || '')}`);
  const model = data.models.find((m) => m.id === state.modelId);
  if (!model) {
    return `
    <div class="card">
      <h2 data-i18n="apikey.title">${t('apikey.title')}</h2>
      <p class="subtitle" data-i18n="apikey.noModel">${t('apikey.noModel')}</p>
      <div class="actions"><button class="btn" data-goto="model" data-i18n="common.back">${t('common.back')}</button></div>
    </div>`;
  }
  const endpoint = model.compat === 'anthropic-compatible'
    ? (model.api?.anthropicCompatible || model.api?.openaiCompatible || '')
    : (model.api?.openaiCompatible || '');
  return `
  <div class="card">
    <h2 data-i18n="apikey.title">${t('apikey.title')}</h2>
    <p class="subtitle" data-i18n="apikey.subtitle">${t('apikey.subtitle')}</p>
    <p><label data-i18n="apikey.model">${t('apikey.model')}</label><div class="code-block">${esc(model.name)}</div></p>
    <p><label data-i18n="apikey.endpoint">${t('apikey.endpoint')}</label><div class="code-block">${esc(endpoint || '—')}</div></p>
    <label for="apikey1" data-i18n="apikey.key">${t('apikey.key')}</label>
    <input type="password" id="apikey1" autocomplete="off" placeholder="sk-..." />
    <label for="apikey2" style="margin-top:10px" data-i18n="apikey.key2">${t('apikey.key2')}</label>
    <input type="password" id="apikey2" autocomplete="off" placeholder="sk-..." />
    <div id="key-status" style="margin-top:10px"></div>
    <div class="actions" style="flex-wrap:wrap">
      <button class="btn" data-goto="model" data-i18n="common.back">${t('common.back')}</button>
      <button class="btn" id="btn-verify" data-i18n="apikey.verify">${t('apikey.verify')}</button>
      <button class="btn primary" id="btn-write" data-i18n="apikey.write">${t('apikey.write')}</button>
      <button class="btn" id="btn-skip" data-i18n="apikey.skip">${t('apikey.skip')}</button>
    </div>
  </div>`;
};

viewRenderers.placeholder = () => `
  <div class="card">
    <h2 data-i18n="m2.title">${t('m2.title')}</h2>
    <p class="subtitle" data-i18n="m2.body">${t('m2.body')}</p>
    <div class="actions">
      <button class="btn" data-goto="${STEPS[Math.max(0, STEPS.indexOf(state.step) - 1)]}" data-i18n="common.back">${t('common.back')}</button>
    </div>
  </div>`;

viewRenderers.finish = () => {
  const agent = (state.agentsList || []).find((a) => a.id === state.agentId);
  const launch = state.lastRouter === 'gcr' ? 'gemini-local' : (agent?.launchCommand || state.agentId);
  const routerHint = state.lastRouter === 'gcr' ? `<div class="notice" style="margin-top:8px">${t('finish.gcrHint')}</div>` : '';
  return `
  <div class="card">
    <h2 data-i18n="finish.title">${t('finish.title')}</h2>
    <p class="subtitle" data-i18n="finish.subtitle">${t('finish.subtitle')}</p>
    <p><label data-i18n="finish.launch">${t('finish.launch')}</label><div class="code-block">$ ${esc(launch)}</div>${routerHint}</p>
    <p><label data-i18n="finish.configWritten">${t('finish.configWritten')}</label><div class="code-block">${esc((state.lastConfigFiles || []).join('\n') || '—')}</div></p>
    <p><label data-i18n="finish.doctor">${t('finish.doctor')}</label><div class="code-block">$ agent-guide doctor</div></p>
    <div class="actions"><button class="btn" data-goto="apikey" data-i18n="common.back">${t('common.back')}</button></div>
  </div>`;
};

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
  const rows = data.items.map((r) => {
    let action = '';
    if (!r.present) {
      if (r.installable === 'user') action = `<button class="btn" data-install="${esc(r.name)}">${t('prereqs.install')}</button>`;
      else if (r.installable === 'admin') action = `<button class="btn" data-copy="${esc(r.installCommand || '')}">${t('prereqs.copy')}</button>`;
      else action = `<span class="badge warn" data-i18n="prereqs.manual">${t('prereqs.manual')}</span>`;
    }
    return `
    <tr>
      <td>${esc(r.name)}</td>
      <td><span class="badge ${r.present ? 'ok' : 'err'}">${r.present ? '✓' : '✗'}</span> ${esc(r.version || '—')}</td>
      <td>${r.present ? '' : `<span class="badge warn">${esc(r.hint)}</span>`}</td>
      <td style="white-space:nowrap">${action}</td>
    </tr>`;
  }).join('');
  return `
  <div class="card">
    <h2 data-i18n="prereqs.title">${t('prereqs.title')}</h2>
    <p class="subtitle" data-i18n="prereqs.subtitle">${t('prereqs.subtitle')}</p>
    <table class="detect-table">
      <tr><td>${t('common.status')}</td><td>${t('detect.os')}</td><td></td><td></td></tr>
      ${rows}
    </table>
    ${data.ok ? '' : `<div class="notice">${t('prereqs.warn')}</div>`}
    <h3>${t('install.log')}</h3>
    <pre class="exec-log" id="prereq-log"></pre>
    <div class="actions">
      <button class="btn" data-goto="folder" data-i18n="common.back">${t('common.back')}</button>
      <button class="btn" id="btn-redetect-prereq" data-i18n="prereqs.redetect">${t('prereqs.redetect')}</button>
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
    body: JSON.stringify({
      step,
      agentId: state.agentId,
      platform: state.platform,
      mode: state.mode,
      workDir: state.workDir,
      modelId: state.modelId, // persist the chosen model (was lost before)
    }),
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
    const order = { welcome: 'platform', platform: 'agent', agent: 'permission', model: 'apikey' };
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

  document.querySelectorAll('.model-card[data-model]').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.dataset.disabled) return; // unsupported combos are not selectable
      state.modelId = el.dataset.model;
      document.querySelectorAll('.model-card').forEach((c) => c.classList.remove('selected'));
      el.classList.add('selected');
    });
  });

  const verifyBtn = document.getElementById('btn-verify');
  if (verifyBtn) {
    verifyBtn.addEventListener('click', async () => {
      const key = document.getElementById('apikey1')?.value?.trim();
      const key2 = document.getElementById('apikey2')?.value?.trim();
      const statusEl = document.getElementById('key-status');
      if (!key || !key2) { statusEl.innerHTML = `<span class="badge err">${t('apikey.verify.fail')} (empty)</span>`; return; }
      if (key !== key2) { statusEl.innerHTML = `<span class="badge err">${t('apikey.mismatch')}</span>`; return; }
      verifyBtn.disabled = true;
      verifyBtn.textContent = t('apikey.verify.running');
      try {
        const data = await api(`/api/models?agentId=${encodeURIComponent(state.agentId || '')}`);
        const model = data.models.find((m) => m.id === state.modelId);
        const mode = model?.compat === 'anthropic-compatible' ? 'anthropic' : 'openai';
        const baseUrl = mode === 'anthropic'
          ? (model?.api?.anthropicCompatible || model?.api?.openaiCompatible)
          : model?.api?.openaiCompatible;
        const r = await api('/api/keys/verify', { method: 'POST', body: JSON.stringify({ baseUrl, apiKey: key, mode }) });
        statusEl.innerHTML = `<span class="badge ok">${t('apikey.verify.ok')}</span>`;
      } catch (err) {
        statusEl.innerHTML = `<span class="badge err">${t('apikey.verify.fail')}${esc(err.message)}</span>`;
      }
      verifyBtn.disabled = false;
      verifyBtn.textContent = t('apikey.verify');
    });
  }

  const writeBtn = document.getElementById('btn-write');
  if (writeBtn) {
    writeBtn.addEventListener('click', async () => {
      const key = document.getElementById('apikey1')?.value?.trim();
      const key2 = document.getElementById('apikey2')?.value?.trim();
      const statusEl = document.getElementById('key-status');
      if (!key || key !== key2) {
        statusEl.innerHTML = `<span class="badge err">${key ? t('apikey.mismatch') : t('apikey.verify.fail') + ' (empty)'}</span>`;
        return;
      }
      writeBtn.disabled = true;
      writeBtn.textContent = '…';
      try {
        const r = await api('/api/config', {
          method: 'POST',
          body: JSON.stringify({ agentId: state.agentId, modelId: state.modelId, apiKey: key }),
        });
        state.lastConfigFiles = r.result?.files || [];
        state.lastRouter = r.result?.router || null;
        if (r.result?.notes?.length) state.lastRouterNotes = r.result.notes;
        statusEl.innerHTML = `<span class="badge ok">${t('apikey.written')}</span>`;
        await goto('finish');
      } catch (err) {
        statusEl.innerHTML = `<span class="badge err">${esc(err.message)}</span>`;
        writeBtn.disabled = false;
        writeBtn.textContent = t('apikey.write');
      }
    });
  }

  const skipBtn = document.getElementById('btn-skip');
  if (skipBtn) skipBtn.addEventListener('click', () => goto('finish'));

  const prereqLog = () => document.getElementById('prereq-log');
  document.querySelectorAll('[data-install]').forEach((el) => {
    el.addEventListener('click', async () => {
      const name = el.dataset.install;
      el.disabled = true;
      el.textContent = t('prereqs.running');
      const logEl = prereqLog();
      if (logEl) logEl.textContent = '';
      const append = (line) => { if (logEl) { logEl.textContent += line + '\n'; logEl.scrollTop = logEl.scrollHeight; } };
      try {
        const res = await fetch(`/api/prereqs/${encodeURIComponent(name)}/install`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Agent-Guide-Token': state.token },
          body: '{}',
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          if (e.error === 'requires-manual-install') {
            append(`[${name}] ${t('prereqs.manual')}: ${e.hint || ''}`);
            if (e.command) { try { await navigator.clipboard.writeText(e.command); append(`[${name}] ${t('prereqs.copied')}: ${e.command}`); } catch { /* clipboard blocked */ } }
          } else {
            append(`[error] ${e.error || res.status}`);
          }
          el.disabled = false;
          el.textContent = t('prereqs.install');
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
            for (const line of frame.split('\n')) {
              if (line.startsWith('data:')) {
                const obj = JSON.parse(line.slice(5).trim());
                if (obj.line) append(obj.line);
                if (obj.error) append(`[error] ${obj.error}`);
              }
            }
          }
        }
        append(`[${name}] ${t('prereqs.installed')}`);
      } catch (err) {
        append(`[error] ${err.message}`);
      }
      await render(); // re-detect & re-render the prerequisite table
    });
  });

  document.querySelectorAll('[data-copy]').forEach((el) => {
    el.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(el.dataset.copy);
        const old = el.textContent;
        el.textContent = t('prereqs.copied');
        setTimeout(() => { el.textContent = old; }, 1500);
      } catch { /* clipboard blocked */ }
    });
  });

  const redetectBtn = document.getElementById('btn-redetect-prereq');
  if (redetectBtn) redetectBtn.addEventListener('click', () => render());

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
  try {
    const ag = await api('/api/agents');
    state.agentsList = ag.agents;
  } catch { /* non-fatal */ }

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
