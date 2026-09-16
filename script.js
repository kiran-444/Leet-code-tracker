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
   PROFILE SYSTEM
   Each named profile owns its own isolated slice of localStorage, so
   importing someone else's backup — or adding a second person on the
   same device — never mixes into the currently active person's data.
   ===================================================================== */
const PROFILES_KEY = 'leetcode-profiles';
const ACTIVE_PROFILE_KEY = 'leetcode-active-profile';
const dataKey = (id) => `leetcode-data-${id}`;

let profiles = [];
let activeProfileId = null;
let problems = [];
let currentSort = 'due';
let pendingImportData = null;

function slugify(name){
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  return base || ('profile-' + Date.now());
}

function loadProfilesList(){
  try{
    const raw = localStorage.getItem(PROFILES_KEY);
    profiles = raw ? JSON.parse(raw) : [];
  }catch(e){ profiles = []; }
}
function saveProfilesList(){
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  if(typeof cloudEnabled !== 'undefined' && cloudEnabled && currentUser){ pushToCloud().catch(()=>{}); }
}

function isNameTaken(name, excludeId = null){
  const n = name.trim().toLowerCase();
  if(!n) return false;
  return profiles.some(p => p.id !== excludeId && p.name.trim().toLowerCase() === n);
}
function showFieldError(errorId, inputId){
  $(errorId).classList.add('show');
  $(inputId).classList.add('input-error');
}
function clearFieldError(errorId, inputId){
  $(errorId).classList.remove('show');
  $(inputId).classList.remove('input-error');
}

function createProfile(name){
  name = name.trim();
  if(!name) return null;
  let id = slugify(name);
  let base = id, n = 2;
  while(profiles.find(p => p.id === id)){ id = base + '-' + (n++); }
  profiles.push({ id, name });
  saveProfilesList();
  return id;
}

function migrateLegacyIfNeeded(){
  loadProfilesList();
  if(profiles.length > 0) return;
  const legacyProblems = localStorage.getItem('leetcode-problems');
  if(!legacyProblems) return;
  const legacyName = localStorage.getItem('leetcode-owner-name');
  const name = (legacyName && legacyName.trim()) ? legacyName.trim() : 'My Sheet';
  const id = slugify(name);
  profiles = [{ id, name }];
  localStorage.setItem(dataKey(id), legacyProblems);
  localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  saveProfilesList();
}

function renderProfileBadge(){
  const p = profiles.find(x => x.id === activeProfileId);
  const name = p ? p.name : '';
  $('ownerName').textContent = name;
  $('ownerTag').textContent = name ? `// ${name}'s personal problem log` : '// personal problem log';
  $('openProfileBtn').textContent = name ? `⇄ ${name}` : '⇄ switch profile';
}

function switchProfile(id){
  activeProfileId = id;
  localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  renderProfileBadge();
  loadProblems();
  $('profileOverlay').classList.remove('open');
}

function renderProfileList(){
  const wrap = $('profileList');
  if(profiles.length === 0){
    wrap.innerHTML = `<div class="empty" style="padding:26px 10px;">No profiles yet — add one below.</div>`;
    return;
  }
  wrap.innerHTML = profiles.map(p => `
    <div class="profile-row ${p.id === activeProfileId ? 'active' : ''}">
      <span class="profile-dot" style="background:${colorFor(p.id)}"></span>
      <span class="profile-name" data-action="switch" data-id="${p.id}">${escapeHtml(p.name)}</span>
      ${p.id === activeProfileId ? '<span class="chip">current</span>' : ''}
      <span class="iconbtn" data-action="rename" data-id="${p.id}" title="rename">✎</span>
      <span class="iconbtn" data-action="delete" data-id="${p.id}" title="delete profile">🗑</span>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.dataset.id;
      const action = el.dataset.action;
      const p = profiles.find(x => x.id === id);
      if(action === 'switch'){
        switchProfile(id);
        return;
      }
      if(action === 'rename'){
        const val = await showPromptDialog({
          title: 'Rename profile', placeholder: 'Profile name', defaultValue: p.name,
          validate: (v) => isNameTaken(v, p.id) ? 'taken' : null
        });
        if(val !== null && val.trim()){
          p.name = val.trim();
          saveProfilesList();
          renderProfileList();
          if(id === activeProfileId) renderProfileBadge();
        }
        return;
      }
      if(action === 'delete'){
        const ok = await showConfirmDialog({
          title: 'Delete profile',
          message: `Delete "${p.name}" and everything in it? This can't be undone.`,
          confirmText: 'Delete', danger: true
        });
        if(!ok) return;
        localStorage.removeItem(dataKey(id));
        profiles = profiles.filter(x => x.id !== id);
        saveProfilesList();
        if(id === activeProfileId){
          if(profiles.length){
            switchProfile(profiles[0].id);
          } else {
            activeProfileId = null;
            localStorage.removeItem(ACTIVE_PROFILE_KEY);
            $('profileOverlay').classList.remove('open');
            $('onboardOverlay').classList.add('open');
          }
        }
        renderProfileList();
        toast(`Deleted "${p.name}".`, 'info');
      }
    });
  });
}

$('openProfileBtn').addEventListener('click', () => {
  clearFieldError('newProfileNameError', 'newProfileName');
  renderProfileList();
  $('backendUrlInput').value = getStoredBackendUrl();
  $('profileOverlay').classList.add('open');
});
$('closeProfile').addEventListener('click', () => $('profileOverlay').classList.remove('open'));
$('profileOverlay').addEventListener('click', (e) => { if(e.target.id === 'profileOverlay') e.currentTarget.classList.remove('open'); });
$('addProfileBtn').addEventListener('click', () => {
  const name = $('newProfileName').value.trim();
  if(!name) return;
  if(isNameTaken(name)){ showFieldError('newProfileNameError', 'newProfileName'); return; }
  clearFieldError('newProfileNameError', 'newProfileName');
  const id = createProfile(name);
  $('newProfileName').value = '';
  switchProfile(id);
  renderProfileList();
});
$('newProfileName').addEventListener('input', () => clearFieldError('newProfileNameError', 'newProfileName'));
$('newProfileName').addEventListener('keydown', (e) => { if(e.key === 'Enter') $('addProfileBtn').click(); });

/* =====================================================================
   MANAGE PATTERNS (create / rename / delete)
   ===================================================================== */
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
   ONBOARDING (first run)
   ===================================================================== */
$('onboardContinue').addEventListener('click', () => {
  const name = $('onboardName').value.trim();
  if(!name){ $('onboardName').focus(); return; }
  if(isNameTaken(name)){ showFieldError('onboardNameError', 'onboardName'); return; }
  clearFieldError('onboardNameError', 'onboardName');
  const id = createProfile(name);
  activeProfileId = id;
  localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  $('onboardOverlay').classList.remove('open');
  initApp();
});
$('onboardName').addEventListener('keydown', (e) => { if(e.key === 'Enter') $('onboardContinue').click(); });
$('onboardName').addEventListener('input', () => clearFieldError('onboardNameError', 'onboardName'));

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

/* =====================================================================
   PROBLEM DATA (scoped to the active profile)
   ===================================================================== */
async function loadProblems(){
  try{
    const raw = localStorage.getItem(dataKey(activeProfileId));
    problems = raw ? JSON.parse(raw) : [];
  }catch(e){
    console.error('Load error', e);
    problems = [];
  }
  render();
}

async function saveProblems(){
  try{
    localStorage.setItem(dataKey(activeProfileId), JSON.stringify(problems));
  }catch(e){
    console.error('Storage error', e);
    toast('Could not save — your browser storage may be full or disabled.', 'error');
  }
  if(typeof cloudEnabled !== 'undefined' && cloudEnabled && currentUser){ pushToCloud().catch(()=>{}); }
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

function patternsKey(){ return `leetcode-patterns-${activeProfileId}`; }
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
}

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

function escapeHtml(str){
  return (str||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeAttr(str){ return escapeHtml(str); }

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
  toast(id ? 'Problem updated.' : 'Problem logged.', 'success');
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
  const p = profiles.find(x => x.id === activeProfileId);
  const name = p ? p.name : '';
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
    const guessedName = file.name
      .replace(/\.json$/i, '')
      .replace(/-?leetcode-log-backup.*/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    $('importProfileName').value = guessedName || '';
    document.querySelector('input[name="importMode"][value="newProfile"]').checked = true;
    clearFieldError('importProfileNameError', 'importProfileName');
    toggleImportNameField();
    $('importOverlay').classList.add('open');
  }catch(err){
    toast('Could not read that file — make sure it is a valid backup.', 'error');
  }
});

function toggleImportNameField(){
  const mode = document.querySelector('input[name="importMode"]:checked').value;
  $('importNameField').style.display = mode === 'newProfile' ? 'block' : 'none';
}
document.querySelectorAll('input[name="importMode"]').forEach(r => r.addEventListener('change', () => {
  toggleImportNameField();
  clearFieldError('importProfileNameError', 'importProfileName');
}));
$('importProfileName').addEventListener('input', () => clearFieldError('importProfileNameError', 'importProfileName'));

$('closeImport').addEventListener('click', () => { $('importOverlay').classList.remove('open'); pendingImportData = null; });
$('importCancelBtn').addEventListener('click', () => { $('importOverlay').classList.remove('open'); pendingImportData = null; });
$('importOverlay').addEventListener('click', (e) => { if(e.target.id === 'importOverlay'){ e.currentTarget.classList.remove('open'); pendingImportData = null; } });

$('importConfirmBtn').addEventListener('click', async () => {
  if(!pendingImportData) return;
  const mode = document.querySelector('input[name="importMode"]:checked').value;

  if(mode === 'newProfile'){
    const name = $('importProfileName').value.trim();
    if(!name){ $('importProfileName').focus(); return; }
    if(isNameTaken(name)){ showFieldError('importProfileNameError', 'importProfileName'); return; }
    clearFieldError('importProfileNameError', 'importProfileName');
    const id = createProfile(name);
    localStorage.setItem(dataKey(id), JSON.stringify(pendingImportData));
    switchProfile(id);
    toast(`Imported into new profile "${name}".`, 'success');
  } else if(mode === 'merge'){
    const existingIds = new Set(problems.map(p => p.id));
    let added = 0;
    pendingImportData.forEach(p => { if(!existingIds.has(p.id)){ problems.push(p); added++; } });
    await saveProblems();
    render();
    toast(`Merged — added ${added} new problem(s).`, 'success');
  } else if(mode === 'replace'){
    const ok = await showConfirmDialog({
      title: 'Replace current profile?',
      message: "This permanently overwrites the current profile's data with the imported file.",
      confirmText: 'Replace', danger: true
    });
    if(!ok) return;
    problems = pendingImportData;
    await saveProblems();
    render();
    toast('Profile data replaced.', 'success');
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
    $('profileOverlay').classList.remove('open');
    $('importOverlay').classList.remove('open');
  }
});

/* =====================================================================
   CLOUD SYNC (your own backend + MongoDB Atlas) — OPTIONAL
   The backend URL is stored in THIS BROWSER's local storage (set via the
   "Backend URL" field in the profile switcher), not hardcoded here. That
   way, future updates to this file never wipe out your configured URL —
   set it once in the browser and it sticks even if script.js changes.
   ===================================================================== */
const BACKEND_URL_KEY = 'leetcode-backend-url';
const PLACEHOLDER_BACKEND_URL = 'https://YOUR-BACKEND-URL.onrender.com';

function getStoredBackendUrl(){
  return localStorage.getItem(BACKEND_URL_KEY) || '';
}
function isValidBackendUrl(url){
  return !!url && /^https?:\/\/.+/.test(url) && !url.includes('YOUR-BACKEND-URL');
}

let API_BASE_URL = getStoredBackendUrl();
let cloudEnabled = isValidBackendUrl(API_BASE_URL);
let authToken = localStorage.getItem('leetcode-auth-token') || null;
let currentUser = null;

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

function updateCloudBanner(){
  $('cloudBanner').style.display = cloudEnabled ? 'none' : 'flex';
}

function updateSyncUI(){
  const bar = $('syncBar');
  updateCloudBanner();
  if(!cloudEnabled){
    $('syncStatus').textContent = '☁ Cloud sync not set up — enter your backend URL below';
    $('cloudAuthToggle').style.display = 'none';
    $('signOutBtn').style.display = 'none';
    $('cloudAuthForm').style.display = 'none';
    bar.classList.remove('synced');
    return;
  }
  if(currentUser){
    $('syncStatus').textContent = `☁ Synced as ${currentUser.email}`;
    $('cloudAuthToggle').style.display = 'none';
    $('signOutBtn').style.display = 'inline-block';
    $('cloudAuthForm').style.display = 'none';
    bar.classList.add('synced');
  } else {
    $('syncStatus').textContent = '☁ Sign in to sync this profile across devices';
    $('cloudAuthToggle').style.display = 'inline-block';
    $('signOutBtn').style.display = 'none';
    bar.classList.remove('synced');
  }
}

function setCloudAuthError(msg){
  const el = $('cloudAuthError');
  el.textContent = msg;
  el.classList.add('show');
}
function clearCloudAuthError(){
  $('cloudAuthError').classList.remove('show');
}

async function onCloudAuthSuccess(result){
  authToken = result.token;
  currentUser = result.user;
  localStorage.setItem('leetcode-auth-token', authToken);
  localStorage.setItem('leetcode-auth-user', JSON.stringify(currentUser));
  $('cloudAuthForm').style.display = 'none';
  $('cloudAuthPassword').value = '';
  updateSyncUI();
  await loadFromCloud();
}

async function cloudSignup(){
  clearCloudAuthError();
  if(!cloudEnabled){ setCloudAuthError('Save a valid backend URL above first.'); return; }
  const name = $('cloudAuthName').value.trim();
  const email = $('cloudAuthEmail').value.trim();
  const password = $('cloudAuthPassword').value;
  if(!name || !email || !password){ setCloudAuthError('Fill in name, email, and password.'); return; }
  try{
    const result = await apiRequest('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    await onCloudAuthSuccess(result);
    toast(`Welcome, ${result.user.name}!`, 'success');
  }catch(e){ setCloudAuthError(e.message); }
}

async function cloudLogin(){
  clearCloudAuthError();
  if(!cloudEnabled){ setCloudAuthError('Save a valid backend URL above first.'); return; }
  const email = $('cloudAuthEmail').value.trim();
  const password = $('cloudAuthPassword').value;
  if(!email || !password){ setCloudAuthError('Enter your email and password.'); return; }
  try{
    const result = await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    await onCloudAuthSuccess(result);
    toast(`Welcome back, ${result.user.name}!`, 'success');
  }catch(e){ setCloudAuthError(e.message); }
}

function cloudSignOut(){
  authToken = null;
  currentUser = null;
  localStorage.removeItem('leetcode-auth-token');
  localStorage.removeItem('leetcode-auth-user');
  updateSyncUI();
}

async function pushToCloud(){
  if(!cloudEnabled || !currentUser) return;
  const data = {};
  profiles.forEach(p => {
    try{ data[p.id] = JSON.parse(localStorage.getItem(dataKey(p.id)) || '[]'); }
    catch(e){ data[p.id] = []; }
  });
  try{
    await apiRequest('/api/data', { method: 'PUT', body: JSON.stringify({ profiles, data }) });
  }catch(e){
    console.error('Cloud sync failed', e);
    toast('Could not sync to the cloud — check your connection.', 'error');
  }
}

async function loadFromCloud(){
  let result;
  try{ result = await apiRequest('/api/data'); }
  catch(e){
    if(e.status === 401){ cloudSignOut(); toast('Session expired — please log in again.', 'info'); }
    else toast('Could not reach the cloud — showing local data.', 'error');
    return;
  }

  const cloudProfiles = result.profiles || [];
  if(cloudProfiles.length){
    if(profiles.length){
      const ok = await showConfirmDialog({
        title: 'Cloud data found',
        message: `This account has ${cloudProfiles.length} synced profile(s). Load them here? (Your local-only data stays on this device either way — export it first if unsure.)`,
        confirmText: 'Load cloud data'
      });
      if(!ok) return;
    }
    profiles = cloudProfiles;
    saveProfilesListLocalOnly();
    Object.keys(result.data || {}).forEach(pid => {
      localStorage.setItem(dataKey(pid), JSON.stringify(result.data[pid]));
    });
    activeProfileId = profiles[0] ? profiles[0].id : null;
    if(activeProfileId){
      localStorage.setItem(ACTIVE_PROFILE_KEY, activeProfileId);
      initApp();
    } else {
      $('onboardOverlay').classList.add('open');
    }
    toast('Cloud data loaded.', 'success');
  } else if(profiles.length){
    const ok = await showConfirmDialog({
      title: 'Back up to the cloud?',
      message: 'No cloud data yet for this account. Upload your current profile(s) so they sync across devices?',
      confirmText: 'Upload'
    });
    if(ok){ await pushToCloud(); toast('Uploaded to the cloud.', 'success'); }
  }
}

// Used only while pulling cloud data down, to avoid re-triggering an upload mid-load.
function saveProfilesListLocalOnly(){
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

// These listeners are always attached — cloud sync can go from disabled to
// enabled at runtime (the moment a valid backend URL is saved), so the
// buttons need to work immediately once that happens, with no page reload.
$('cloudAuthToggle').addEventListener('click', () => {
  const form = $('cloudAuthForm');
  form.style.display = (form.style.display === 'none' || !form.style.display) ? 'flex' : 'none';
});
$('cloudLoginBtn').addEventListener('click', cloudLogin);
$('cloudSignupBtn').addEventListener('click', cloudSignup);
$('signOutBtn').addEventListener('click', cloudSignOut);
[$('cloudAuthEmail'), $('cloudAuthPassword'), $('cloudAuthName')].forEach(el => {
  el.addEventListener('input', clearCloudAuthError);
});
$('cloudAuthPassword').addEventListener('keydown', (e) => { if(e.key === 'Enter') cloudLogin(); });

$('saveBackendUrlBtn').addEventListener('click', () => {
  const raw = $('backendUrlInput').value.trim().replace(/\/+$/, '');
  if(!isValidBackendUrl(raw)){
    toast('Enter a valid backend URL starting with http:// or https://', 'error');
    return;
  }
  localStorage.setItem(BACKEND_URL_KEY, raw);
  API_BASE_URL = raw;
  cloudEnabled = true;
  updateSyncUI();
  toast('Backend URL saved — cloud sync is now enabled.', 'success');
});

$('cloudBannerBtn').addEventListener('click', () => {
  $('openProfileBtn').click();
  setTimeout(() => $('backendUrlInput').focus(), 150);
});

updateSyncUI();
if(cloudEnabled && authToken){
  try{ currentUser = JSON.parse(localStorage.getItem('leetcode-auth-user') || 'null'); }
  catch(e){ currentUser = null; }
  updateSyncUI();
  if(currentUser) loadFromCloud();
}

/* =====================================================================
   BOOT
   ===================================================================== */
function initApp(){
  renderProfileBadge();
  loadProblems();
}

migrateLegacyIfNeeded();
activeProfileId = localStorage.getItem(ACTIVE_PROFILE_KEY);
if(activeProfileId && !profiles.find(p => p.id === activeProfileId)) activeProfileId = null;
if(!activeProfileId && profiles.length){
  activeProfileId = profiles[0].id;
  localStorage.setItem(ACTIVE_PROFILE_KEY, activeProfileId);
}

if(activeProfileId){
  initApp();
} else {
  $('onboardOverlay').classList.add('open');
}
