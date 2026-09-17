const PATTERN_PALETTE = [
  '#e0a83e','#5aa9e6','#c77dff','#4fb477','#e0616b','#4bc0c0','#f2a65a','#9fb8ad','#c9b458','#7f9cf5'
];
function colorFor(str){
  if(!str) return '#8b90a0';
  let h = 0;
  for(let i=0;i<str.length;i++) h = str.charCodeAt(i) + ((h<<5)-h);
  return PATTERN_PALETTE[Math.abs(h) % PATTERN_PALETTE.length];
}

const DEFAULT_CATEGORIES = ['Array','String','Linked List','Tree','Graph','Stack','Queue','Heap','Matrix','Math / Numbers','Hash Map','Trie'];
const DEFAULT_PATTERNS = ['Two Pointers','Sliding Window','Binary Search','Hashing','Backtracking','Dynamic Programming','Greedy','BFS/DFS','Recursion','Bit Manipulation','Sorting','Prefix Sum','Union Find','Fast & Slow Pointers','Monotonic Stack'];

const $ = (id) => document.getElementById(id);

/* =====================================================================
   CLOUD BACKEND CONFIG
   The backend URL is baked in below as DEFAULT_BACKEND_URL — this is the
   ONLY backend every visitor ever talks to. Set it once to your real
   Render URL (no trailing slash).
   ===================================================================== */
const PLACEHOLDER_BACKEND_URL = 'https://YOUR-BACKEND-URL.onrender.com';

// ↓↓↓ Set this to your real Render backend URL, once. ↓↓↓
const DEFAULT_BACKEND_URL = 'https://leet-code-tracker-backend.onrender.com';

function isValidBackendUrl(url){
  return !!url && /^https?:\/\/.+/.test(url) && !url.includes('YOUR-BACKEND-URL');
}

const API_BASE_URL = DEFAULT_BACKEND_URL;
const cloudEnabled = isValidBackendUrl(API_BASE_URL);

async function apiRequest(path, options = {}){
  const res = await fetch(API_BASE_URL + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers || {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if(!res.ok){
    const err = new Error(body.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return body;
}

/* =====================================================================
   ACCOUNT / AUTH STATE
   There is no local-only mode and no local profile switcher anymore.
   Every visitor must sign up or log in before they can see or log any
   problems — the moment they're authenticated, every read and write
   goes straight to the cloud, scoped to their account.
   ===================================================================== */
const AUTH_TOKEN_KEY = 'leetcode-auth-token';
const AUTH_USER_KEY = 'leetcode-auth-user';

let authToken = localStorage.getItem(AUTH_TOKEN_KEY) || null;
let currentUser = null;
try{ currentUser = JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null'); }
catch(e){ currentUser = null; }

let problems = [];
let currentSort = 'due';
let pendingImportData = null;

function dataKey(userId){ return `leetcode-data-${userId}`; }
function patternsKey(){ return `leetcode-patterns-${currentUser.id}`; }

function showFieldError(errorId, inputId){
  $(errorId).classList.add('show');
  $(inputId).classList.add('input-error');
}
function clearFieldError(errorId, inputId){
  $(errorId).classList.remove('show');
  $(inputId).classList.remove('input-error');
}

function toast(message, type = 'info'){
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  $('toastContainer').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function escapeHtml(str){
  return (str||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeAttr(str){ return escapeHtml(str); }

/* =====================================================================
   AUTH GATE (mandatory — sign up / log in screen)
   ===================================================================== */
let authMode = 'login';

function showAuthGate(){
  $('mainApp').style.display = 'none';
  $('authOverlay').classList.add('open');
}
function hideAuthGate(){
  $('authOverlay').classList.remove('open');
  $('mainApp').style.display = '';
}

function setAuthMode(mode){
  authMode = mode;
  $('tabLogin').classList.toggle('active', mode === 'login');
  $('tabSignup').classList.toggle('active', mode === 'signup');
  $('authNameField').style.display = mode === 'signup' ? 'block' : 'none';
  $('authSubmitBtn').textContent = mode === 'signup' ? 'Sign up' : 'Log in';
  $('authPassword').setAttribute('autocomplete', mode === 'signup' ? 'new-password' : 'current-password');
  clearAuthError();
}
$('tabLogin').addEventListener('click', () => setAuthMode('login'));
$('tabSignup').addEventListener('click', () => setAuthMode('signup'));

function setAuthError(msg){
  $('authError').textContent = msg;
  $('authError').classList.add('show');
}
function clearAuthError(){ $('authError').classList.remove('show'); }
[$('authName'), $('authEmail'), $('authPassword')].forEach(el => {
  el.addEventListener('input', clearAuthError);
});

$('authSubmitBtn').addEventListener('click', async () => {
  clearAuthError();
  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  if(!email || !password){ setAuthError('Enter your email and password.'); return; }

  if(authMode === 'signup'){
    const name = $('authName').value.trim();
    if(!name){ setAuthError('Enter your name.'); return; }
    if(password.length < 6){ setAuthError('Password must be at least 6 characters.'); return; }
    try{
      const result = await apiRequest('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) });
      await onAuthSuccess(result);
      toast(`Welcome, ${result.user.name}!`, 'success');
    }catch(e){ setAuthError(e.message); }
  } else {
    try{
      const result = await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      await onAuthSuccess(result);
      toast(`Welcome back, ${result.user.name}!`, 'success');
    }catch(e){ setAuthError(e.message); }
  }
});
$('authPassword').addEventListener('keydown', (e) => { if(e.key === 'Enter') $('authSubmitBtn').click(); });

async function onAuthSuccess(result){
  authToken = result.token;
  currentUser = result.user;
  localStorage.setItem(AUTH_TOKEN_KEY, authToken);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentUser));
  $('authPassword').value = '';
  $('authName').value = '';
  hideAuthGate();
  await bootAppAfterAuth();
}

function signOut(){
  authToken = null;
  currentUser = null;
  problems = [];
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  $('authEmail').value = '';
  $('authPassword').value = '';
  setAuthMode('login');
  showAuthGate();
}
$('signOutBtn').addEventListener('click', () => signOut());

/* =====================================================================
   MANAGE PATTERNS (create / rename / delete)
   ===================================================================== */
function getPatternsList(){
  const key = patternsKey();
  let raw = localStorage.getItem(key);
  if(raw === null){
    localStorage.setItem(key, JSON.stringify(DEFAULT_PATTERNS));
    raw = localStorage.getItem(key);
  }
  try{ const list = JSON.parse(raw); return Array.isArray(list) ? list : [...DEFAULT_PATTERNS]; }
  catch(e){ return [...DEFAULT_PATTERNS]; }
}
function savePatternsList(list){
  localStorage.setItem(patternsKey(), JSON.stringify(list));
  syncToCloud().catch(()=>{});
}

function renderPatternsList(){
  const list = getPatternsList();
  const wrap = $('patternsList');
  if(list.length === 0){
    wrap.innerHTML = `<div class="empty" style="padding:26px 10px;">No patterns yet — add one below.</div>`;
    return;
  }
  wrap.innerHTML = [...list].sort((a,b)=>a.localeCompare(b)).map(name => `
    <div class="profile-row">
      <span class="profile-dot" style="background:${colorFor(name)}"></span>
      <span class="profile-name" style="cursor:default;">${escapeHtml(name)}</span>
      <span class="iconbtn" data-action="rename-pattern" data-name="${escapeAttr(name)}" title="rename">✎</span>
      <span class="iconbtn" data-action="delete-pattern" data-name="${escapeAttr(name)}" title="delete">🗑</span>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async () => {
      const name = el.dataset.name;
      const action = el.dataset.action;

      if(action === 'rename-pattern'){
        const val = await showPromptDialog({ title: 'Rename pattern', placeholder: 'Pattern name', defaultValue: name });
        if(val === null) return;
        const newName = val.trim();
        if(!newName || newName === name) return;
        let list = getPatternsList();
        if(list.some(p => p.toLowerCase() === newName.toLowerCase() && p !== name)){
          toast('That pattern name already exists.', 'error');
          return;
        }
        savePatternsList(list.map(p => p === name ? newName : p));
        let changed = 0;
        problems.forEach(p => { if(p.pattern === name){ p.pattern = newName; changed++; } });
        if(changed) await saveProblems();
        renderPatternsList();
        render();
        toast(`Renamed to "${newName}"${changed ? ` — updated ${changed} problem(s)` : ''}.`, 'success');
        return;
      }

      if(action === 'delete-pattern'){
        const inUse = problems.filter(p => p.pattern === name).length;
        const ok = await showConfirmDialog({
          title: 'Delete pattern',
          message: inUse
            ? `"${name}" is used by ${inUse} problem(s). Deleting it will clear the pattern on those problems.`
            : `Delete "${name}" from your pattern list?`,
          confirmText: 'Delete', danger: true
        });
        if(!ok) return;
        savePatternsList(getPatternsList().filter(p => p !== name));
        if(inUse){
          problems.forEach(p => { if(p.pattern === name) p.pattern = ''; });
          await saveProblems();
        }
        renderPatternsList();
        render();
        toast(`Deleted "${name}".`, 'info');
      }
    });
  });
}

$('openPatternsBtn').addEventListener('click', () => {
  renderPatternsList();
  $('patternsOverlay').classList.add('open');
});
$('closePatterns').addEventListener('click', () => $('patternsOverlay').classList.remove('open'));
$('patternsOverlay').addEventListener('click', (e) => { if(e.target.id === 'patternsOverlay') e.currentTarget.classList.remove('open'); });

$('addPatternBtn').addEventListener('click', () => {
  const name = $('newPatternName').value.trim();
  if(!name) return;
  const list = getPatternsList();
  if(list.some(p => p.toLowerCase() === name.toLowerCase())){
    toast('That pattern already exists.', 'error');
    return;
  }
  list.push(name);
  savePatternsList(list);
  $('newPatternName').value = '';
  renderPatternsList();
  render();
  toast(`Added "${name}".`, 'success');
});
$('newPatternName').addEventListener('keydown', (e) => { if(e.key === 'Enter') $('addPatternBtn').click(); });

/* =====================================================================
   GENERIC MODAL DIALOGS (replace native confirm/prompt/alert)
   ===================================================================== */
function showConfirmDialog({ title, message = '', confirmText = 'OK', cancelText = 'Cancel', danger = false }){
  return new Promise((resolve) => {
    $('dialogTitle').textContent = title;
    $('dialogMessage').textContent = message;
    $('dialogMessage').style.display = message ? 'block' : 'none';
    $('dialogInputWrap').style.display = 'none';
    $('dialogConfirm').textContent = confirmText;
    $('dialogConfirm').className = 'btn ' + (danger ? 'danger' : 'primary');
    $('dialogCancel').style.display = 'inline-block';
    $('dialogOverlay').classList.add('open');

    const cleanup = () => {
      $('dialogOverlay').classList.remove('open');
      $('dialogConfirm').removeEventListener('click', onConfirm);
      $('dialogCancel').removeEventListener('click', onCancel);
    };
    const onConfirm = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    $('dialogConfirm').addEventListener('click', onConfirm);
    $('dialogCancel').addEventListener('click', onCancel);
  });
}

function showPromptDialog({ title, message = '', placeholder = '', defaultValue = '', validate = null }){
  return new Promise((resolve) => {
    $('dialogTitle').textContent = title;
    $('dialogMessage').textContent = message;
    $('dialogMessage').style.display = message ? 'block' : 'none';
    $('dialogInputWrap').style.display = 'block';
    $('dialogInput').placeholder = placeholder;
    $('dialogInput').value = defaultValue;
    $('dialogConfirm').textContent = 'Save';
    $('dialogConfirm').className = 'btn primary';
    $('dialogCancel').style.display = 'inline-block';
    clearFieldError('dialogInputError', 'dialogInput');
    $('dialogOverlay').classList.add('open');
    setTimeout(() => { $('dialogInput').focus(); $('dialogInput').select(); }, 50);

    const cleanup = () => {
      $('dialogOverlay').classList.remove('open');
      $('dialogConfirm').removeEventListener('click', onConfirm);
      $('dialogCancel').removeEventListener('click', onCancel);
      $('dialogInput').removeEventListener('keydown', onKey);
      $('dialogInput').removeEventListener('input', onInput);
    };
    const onConfirm = () => {
      const v = $('dialogInput').value;
      if(validate){
        const err = validate(v);
        if(err){ showFieldError('dialogInputError', 'dialogInput'); return; }
      }
      cleanup(); resolve(v);
    };
    const onCancel = () => { cleanup(); resolve(null); };
    const onKey = (e) => { if(e.key === 'Enter'){ onConfirm(); } if(e.key === 'Escape'){ onCancel(); } };
    const onInput = () => clearFieldError('dialogInputError', 'dialogInput');
    $('dialogConfirm').addEventListener('click', onConfirm);
    $('dialogCancel').addEventListener('click', onCancel);
    $('dialogInput').addEventListener('keydown', onKey);
    $('dialogInput').addEventListener('input', onInput);
  });
}
$('dialogOverlay').addEventListener('click', (e) => { if(e.target.id === 'dialogOverlay') e.currentTarget.classList.remove('open'); });

/* =====================================================================
   PROBLEM DATA (scoped to the signed-in account)
   Every save writes a local cache (so the UI stays snappy and survives a
   flaky connection) and immediately pushes to the cloud — logging a
   problem while signed in always ends up stored under your account.
   ===================================================================== */
async function syncToCloud(){
  if(!cloudEnabled || !currentUser) return;
  try{
    await apiRequest('/api/data', { method: 'PUT', body: JSON.stringify({ problems, patterns: getPatternsList() }) });
  }catch(e){
    console.error('Cloud sync failed', e);
    toast('Saved locally, but could not sync to the cloud — check your connection.', 'error');
  }
}

async function saveProblems(){
  try{
    localStorage.setItem(dataKey(currentUser.id), JSON.stringify(problems));
  }catch(e){
    console.error('Storage error', e);
  }
  await syncToCloud();
}

function daysSince(dateStr){
  if(!dateStr) return Infinity;
  const then = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  return Math.floor((now - then) / (1000*60*60*24));
}

function revisionBucket(dateStr){
  const d = daysSince(dateStr);
  if(!dateStr) return { key:'never', label:'never revised', color:'var(--hard)', d: Infinity };
  if(d <= 3)  return { key:'fresh',   label:`${d}d ago`, color:'var(--easy)',   d };
  if(d <= 7)  return { key:'upcoming',label:`${d}d ago`, color:'var(--easy)',   d };
  if(d <= 14) return { key:'due',     label:`${d}d ago — due`, color:'var(--medium)', d };
  return        { key:'overdue', label:`${d}d ago — overdue`, color:'var(--hard)', d };
}
function revisionInfo(dateStr){ return revisionBucket(dateStr); }
const REVISION_STATUS_LABELS = { never:'Never revised', fresh:'Fresh (0-3d)', upcoming:'Upcoming (4-7d)', due:'Due (8-14d)', overdue:'Overdue (15d+)' };

function populateFilterOptions(){
  const cats = new Set(DEFAULT_CATEGORIES);
  const pats = new Set(getPatternsList());
  problems.forEach(p => { if(p.category) cats.add(p.category); if(p.pattern) pats.add(p.pattern); });

  const fillSelect = (sel, values, keepFirst) => {
    const current = sel.value;
    sel.innerHTML = '';
    if(keepFirst) sel.appendChild(keepFirst);
    [...values].sort().forEach(v => {
      const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o);
    });
    sel.value = current;
  };

  const catFirst = document.createElement('option'); catFirst.value=''; catFirst.textContent='All categories';
  const patFirst = document.createElement('option'); patFirst.value=''; patFirst.textContent='All patterns';
  fillSelect($('filterCategory'), cats, catFirst);
  fillSelect($('filterPattern'), pats, patFirst);

  $('categoryList').innerHTML = [...cats].sort().map(c=>`<option value="${escapeAttr(c)}">`).join('');
  $('patternList').innerHTML = [...pats].sort().map(p=>`<option value="${escapeAttr(p)}">`).join('');
}

function hljsLang(language){
  const map = { 'Python':'python', 'Java':'java', 'C++':'cpp', 'JavaScript':'javascript', 'C':'cpp', 'Go':'go' };
  return map[language] || 'plaintext';
}

function renderStats(){
  const total = problems.length;
  const due = problems.filter(p => { const k = revisionBucket(p.lastRevision).key; return k==='due' || k==='overdue' || k==='never'; }).length;
  const easy = problems.filter(p=>p.difficulty==='Easy').length;
  const med = problems.filter(p=>p.difficulty==='Medium').length;
  const hard = problems.filter(p=>p.difficulty==='Hard').length;
  $('statRow').innerHTML = `
    <div class="stat"><b>${total}</b><span>logged</span></div>
    <div class="stat due"><b>${due}</b><span>due to revise</span></div>
    <div class="stat"><b>${easy}/${med}/${hard}</b><span>easy/med/hard</span></div>
  `;
}

function getFiltered(){
  const q = $('searchInput').value.trim().toLowerCase();
  const diff = $('filterDifficulty').value;
  const cat = $('filterCategory').value;
  const pat = $('filterPattern').value;
  const revStatus = $('filterRevision').value;

  let list = problems.filter(p => {
    if(diff && p.difficulty !== diff) return false;
    if(cat && p.category !== cat) return false;
    if(pat && p.pattern !== pat) return false;
    if(revStatus && revisionBucket(p.lastRevision).key !== revStatus) return false;
    if(q){
      const hay = (p.title + ' ' + (p.tags||[]).join(' ')).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });

  if(currentSort === 'due'){
    list.sort((a,b) => daysSince(b.lastRevision) - daysSince(a.lastRevision));
  } else {
    list.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  }
  return list;
}

function render(){
  populateFilterOptions();
  renderStats();
  const list = getFiltered();
  const grid = $('grid');

  if(list.length === 0){
    let emptyMsg = "No problems logged yet. Start with today's solve.";
    if(problems.length > 0){
      const revLabel = REVISION_STATUS_LABELS[$('filterRevision').value];
      if(revLabel){
        emptyMsg = `No problems are "${revLabel}" right now — that's a good thing. Try a different filter.`;
      } else {
        emptyMsg = 'Nothing matches these filters. Try clearing one.';
      }
    }
    grid.innerHTML = `<div class="empty"><div class="big">◌</div>${emptyMsg}</div>`;
    return;
  }

  grid.innerHTML = list.map(p => {
    const rev = revisionInfo(p.lastRevision);
    const catColor = colorFor(p.category);
    const patColor = colorFor(p.pattern);
    return `
    <div class="card" data-id="${p.id}">
      <div class="row1">
        <h3>${escapeHtml(p.title)}</h3>
        <div class="row1-right">
          <span class="badge ${p.difficulty}">${p.difficulty}</span>
          <div class="card-actions">
            <span class="iconbtn" data-action="view" data-id="${p.id}" title="view">👁</span>
            <span class="iconbtn" data-action="edit" data-id="${p.id}" title="edit">✎</span>
          </div>
        </div>
      </div>
      <div class="tagrow">
        ${p.category ? `<span class="chip" style="--chip-color:${catColor}">${escapeHtml(p.category)}</span>` : ''}
        ${p.pattern ? `<span class="chip" style="--chip-color:${patColor}">${escapeHtml(p.pattern)}</span>` : ''}
        ${p.language ? `<span class="chip">${escapeHtml(p.language)}</span>` : ''}
      </div>
      <div class="revline">
        <span class="revdot" style="background:${rev.color}"></span>
        <span class="revtext">revised <b>${p.revisionCount||0}×</b> · last <b>${rev.label}</b></span>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', (e) => {
      if(e.target.closest('[data-action="edit"]')){
        openForm(card.dataset.id);
        e.stopPropagation();
        return;
      }
      if(e.target.closest('[data-action="view"]')){
        openDetail(card.dataset.id);
        e.stopPropagation();
        return;
      }
      openDetail(card.dataset.id);
    });
  });
}

/* ---------- form modal ---------- */
function openForm(id){
  const isEdit = !!id;
  $('modalTitle').textContent = isEdit ? 'Edit problem' : 'Log a problem';
  $('deleteBtn').style.display = isEdit ? 'inline-block' : 'none';
  $('problemForm').reset();
  $('problemId').value = '';

  if(isEdit){
    const p = problems.find(x => x.id === id);
    $('problemId').value = p.id;
    $('f_title').value = p.title || '';
    $('f_url').value = p.url || '';
    $('f_difficulty').value = p.difficulty || 'Medium';
    $('f_category').value = p.category || '';
    $('f_pattern').value = p.pattern || '';
    $('f_description').value = p.description || '';
    $('f_example').value = p.example || '';
    $('f_approach').value = p.approach || '';
    $('f_optimization').value = p.optimization || '';
    $('f_language').value = p.language || 'Python';
    $('f_lastRevision').value = p.lastRevision || '';
    $('f_code').value = p.code || '';
    $('f_tags').value = (p.tags||[]).join(', ');
  } else {
    $('f_lastRevision').value = new Date().toISOString().slice(0,10);
  }
  $('overlay').classList.add('open');
  $('f_title').focus();
}

function closeForm(){ $('overlay').classList.remove('open'); }

$('addBtn').addEventListener('click', () => openForm(null));
$('closeModal').addEventListener('click', closeForm);
$('cancelBtn').addEventListener('click', closeForm);
$('overlay').addEventListener('click', (e) => { if(e.target.id === 'overlay') closeForm(); });

$('problemForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('problemId').value;
  const data = {
    id: id || ('p_' + Date.now()),
    title: $('f_title').value.trim(),
    url: $('f_url').value.trim(),
    difficulty: $('f_difficulty').value,
    category: $('f_category').value.trim(),
    pattern: $('f_pattern').value.trim(),
    description: $('f_description').value,
    example: $('f_example').value,
    approach: $('f_approach').value,
    optimization: $('f_optimization').value,
    language: $('f_language').value,
    lastRevision: $('f_lastRevision').value,
    code: $('f_code').value,
    tags: $('f_tags').value.split(',').map(t=>t.trim()).filter(Boolean),
    createdAt: id ? (problems.find(x=>x.id===id)||{}).createdAt || Date.now() : Date.now(),
    revisionCount: id ? ((problems.find(x=>x.id===id)||{}).revisionCount || 0) : 0
  };

  if(id){
    const idx = problems.findIndex(x => x.id === id);
    problems[idx] = data;
  } else {
    problems.push(data);
  }
  await saveProblems();
  closeForm();
  render();
  toast(id ? 'Problem updated.' : 'Problem logged — synced to your account.', 'success');
});

$('deleteBtn').addEventListener('click', async () => {
  const id = $('problemId').value;
  if(!id) return;
  const ok = await showConfirmDialog({
    title: 'Delete problem',
    message: "Delete this problem from your log? This can't be undone.",
    confirmText: 'Delete', danger: true
  });
  if(!ok) return;
  problems = problems.filter(p => p.id !== id);
  await saveProblems();
  closeForm();
  render();
  toast('Problem deleted.', 'info');
});

/* ---------- detail modal ---------- */
function openDetail(id){
  const p = problems.find(x => x.id === id);
  if(!p) return;
  const rev = revisionInfo(p.lastRevision);
  $('detailContent').innerHTML = `
    <h2>${escapeHtml(p.title)} <span class="close" id="closeDetail">&times;</span></h2>
    <div class="meta">
      <span class="badge ${p.difficulty}">${p.difficulty}</span>
      ${p.category ? `<span class="chip" style="--chip-color:${colorFor(p.category)}">${escapeHtml(p.category)}</span>` : ''}
      ${p.pattern ? `<span class="chip" style="--chip-color:${colorFor(p.pattern)}">${escapeHtml(p.pattern)}</span>` : ''}
      ${p.language ? `<span class="chip">${escapeHtml(p.language)}</span>` : ''}
      <span class="chip" style="color:${rev.color}">revised ${rev.label} · ${p.revisionCount||0}×</span>
    </div>
    ${p.url ? `<a class="leet-link" href="${escapeAttr(p.url)}" target="_blank" rel="noopener">↗ open on LeetCode</a>` : ''}
    ${p.description ? `<div class="section"><h4>📝 Description</h4><p>${escapeHtml(p.description)}</p></div>` : ''}
    ${p.example ? `<div class="section"><h4>🧪 Example</h4><pre>${escapeHtml(p.example)}</pre></div>` : ''}
    ${p.approach ? `<div class="section"><h4>🧠 My Approach</h4><p>${escapeHtml(p.approach)}</p></div>` : ''}
    ${p.optimization ? `<div class="section"><h4>⚡ Optimization</h4><p>${escapeHtml(p.optimization)}</p></div>` : ''}
    ${p.code ? `<div class="section"><h4>💻 Code (${escapeHtml(p.language||'')})</h4><pre><code class="language-${hljsLang(p.language)}">${escapeHtml(p.code)}</code></pre></div>` : ''}
    ${(p.tags&&p.tags.length) ? `<div class="section"><h4>🏷 Tags</h4><div class="tagrow">${p.tags.map(t=>`<span class="chip">${escapeHtml(t)}</span>`).join('')}</div></div>` : ''}
    <div class="modal-footer">
      <button type="button" class="btn ghost" id="editFromDetail">Edit</button>
      <button type="button" class="btn primary" id="markRevisedBtn">✓ Mark revised now</button>
    </div>
  `;
  $('detailOverlay').classList.add('open');
  if(window.hljs){
    $('detailContent').querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
  }
  $('closeDetail').addEventListener('click', () => $('detailOverlay').classList.remove('open'));
  $('editFromDetail').addEventListener('click', () => { $('detailOverlay').classList.remove('open'); openForm(id); });
  $('markRevisedBtn').addEventListener('click', async () => {
    p.lastRevision = new Date().toISOString().slice(0,10);
    p.revisionCount = (p.revisionCount || 0) + 1;
    await saveProblems();
    $('detailOverlay').classList.remove('open');
    openDetail(id);
    render();
    toast('Marked as revised.', 'success');
  });
}
$('detailOverlay').addEventListener('click', (e) => { if(e.target.id==='detailOverlay') e.currentTarget.classList.remove('open'); });

/* ---------- export / import ---------- */
$('exportBtn').addEventListener('click', () => {
  const name = currentUser ? currentUser.name : '';
  const blob = new Blob([JSON.stringify(problems, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,10);
  const namePart = name ? name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g,'') + '-' : '';
  a.href = url;
  a.download = `${namePart}leetcode-log-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Backup downloaded.', 'success');
});

$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  try{
    const text = await file.text();
    const incoming = JSON.parse(text);
    if(!Array.isArray(incoming)) throw new Error('not an array');
    pendingImportData = incoming;
    $('importSummary').textContent = `This file contains ${incoming.length} problem(s).`;
    document.querySelector('input[name="importMode"][value="merge"]').checked = true;
    $('importOverlay').classList.add('open');
  }catch(err){
    toast('Could not read that file — make sure it is a valid backup.', 'error');
  }
});

$('closeImport').addEventListener('click', () => { $('importOverlay').classList.remove('open'); pendingImportData = null; });
$('importCancelBtn').addEventListener('click', () => { $('importOverlay').classList.remove('open'); pendingImportData = null; });
$('importOverlay').addEventListener('click', (e) => { if(e.target.id === 'importOverlay'){ e.currentTarget.classList.remove('open'); pendingImportData = null; } });

$('importConfirmBtn').addEventListener('click', async () => {
  if(!pendingImportData) return;
  const mode = document.querySelector('input[name="importMode"]:checked').value;

  if(mode === 'merge'){
    const existingIds = new Set(problems.map(p => p.id));
    let added = 0;
    pendingImportData.forEach(p => { if(!existingIds.has(p.id)){ problems.push(p); added++; } });
    await saveProblems();
    render();
    toast(`Merged — added ${added} new problem(s).`, 'success');
  } else if(mode === 'replace'){
    const ok = await showConfirmDialog({
      title: 'Replace your log?',
      message: "This permanently overwrites your current log with the imported file.",
      confirmText: 'Replace', danger: true
    });
    if(!ok) return;
    problems = pendingImportData;
    await saveProblems();
    render();
    toast('Log replaced.', 'success');
  }
  pendingImportData = null;
  $('importOverlay').classList.remove('open');
});

/* ---------- filters/search/sort ---------- */
['searchInput','filterDifficulty','filterCategory','filterPattern','filterRevision'].forEach(id => {
  $(id).addEventListener('input', render);
  $(id).addEventListener('change', render);
});
document.querySelectorAll('.sort-toggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sort-toggle button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentSort = btn.dataset.sort;
    render();
  });
});

document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape'){
    closeForm();
    $('detailOverlay').classList.remove('open');
    $('importOverlay').classList.remove('open');
  }
});

/* =====================================================================
   BOOT
   ===================================================================== */
function renderOwnerBadge(){
  const name = currentUser ? currentUser.name : '';
  $('ownerName').textContent = name;
  $('ownerTag').textContent = name ? `// ${name}'s personal problem log` : '// personal problem log';
}

async function bootAppAfterAuth(){
  renderOwnerBadge();
  try{
    const result = await apiRequest('/api/data');
    problems = result.problems || [];
    const cloudPatterns = (result.patterns && result.patterns.length) ? result.patterns : [...DEFAULT_PATTERNS];
    localStorage.setItem(dataKey(currentUser.id), JSON.stringify(problems));
    localStorage.setItem(patternsKey(), JSON.stringify(cloudPatterns));
  }catch(e){
    if(e.status === 401){
      toast('Session expired — please log in again.', 'info');
      signOut();
      return;
    }
    toast('Could not reach the cloud — showing your last saved copy.', 'error');
    try{ problems = JSON.parse(localStorage.getItem(dataKey(currentUser.id)) || '[]'); }
    catch(_){ problems = []; }
  }
  render();
}

if(!cloudEnabled){
  // Backend URL was never configured — nobody can sign in or store data.
  $('cloudUnavailableOverlay').classList.add('open');
} else if(authToken && currentUser){
  // Cached session: show the app right away, data loads from bootAppAfterAuth.
  hideAuthGate();
  bootAppAfterAuth();
} else {
  showAuthGate();
}
