// デフォルトの習慣分野定義
const DEFAULT_CATEGORIES = [
  { id: '運動', name: '運動', color: '#10b981', target: 50, defaultMin: 50 },
  { id: '基本情報技術者試験', name: '基本情報技術者試験', color: '#ef4444', target: 45, defaultMin: 30 },
  { id: 'プログラミング', name: 'プログラミング', color: '#3b82f6', target: 60, defaultMin: 60 },
  { id: '英語', name: '英語', color: '#8b5cf6', target: 30, defaultMin: 30 },
  { id: '読書', name: '読書', color: '#f59e0b', target: 30, defaultMin: 30 }
];

// 状態管理
let categories = loadCategories();
let logs = [];
let reflections = {};
let selectedDate = getTodayStr();
let selectedCategory = categories[0].name;
let selectedMinutes = categories[0].defaultMin;
let selectedSwatchColor = '#e11d48';
let calViewYear = new Date().getFullYear();
let calViewMonth = new Date().getMonth(); // 0-indexed

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('gasUrl').value = localStorage.getItem('habit_gas_url') || '';
  document.getElementById('gasToken').value = localStorage.getItem('habit_gas_token') || '';
  updateDateBadge();
  renderAll();
  fetchData();
});

// =========================================
// ローカルストレージ（分野定義・API設定）
// =========================================
function loadCategories() {
  try {
    const saved = localStorage.getItem('habit_categories_v1');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error(e);
  }
  return [...DEFAULT_CATEGORIES];
}

function saveCategories() {
  localStorage.setItem('habit_categories_v1', JSON.stringify(categories));
}

function toggleSettings() {
  document.getElementById('settingsPanel').classList.toggle('open');
}

function saveSettings() {
  localStorage.setItem('habit_gas_url', document.getElementById('gasUrl').value.trim());
  localStorage.setItem('habit_gas_token', document.getElementById('gasToken').value.trim());
  toggleSettings();
  fetchData();
}

function getConfig() {
  const url = localStorage.getItem('habit_gas_url');
  const token = localStorage.getItem('habit_gas_token');
  if (!url || !token) {
    document.getElementById('settingsPanel').classList.add('open');
    setStatus('API設定からGASのURLと合言葉を入力してください');
    return null;
  }
  return { url, token };
}

function setStatus(msg) {
  document.getElementById('statusText').textContent = msg;
}

// =========================================
// GAS通信（GET / POST）
// =========================================
async function fetchData() {
  const config = getConfig();
  if (!config) return;

  setStatus('スプレッドシートと同期中...');
  try {
    const res = await fetch(`${config.url}?token=${encodeURIComponent(config.token)}`);
    const json = await res.json();
    if (json.status === 'success') {
      logs = (json.logs || []).map(item => ({
        id: item.id,
        date: normalizeDateStr(item.date),
        category: String(item.category),
        minutes: Number(item.minutes) || 0,
        memo: item.memo || '',
        time: item.time || ''
      }));
      reflections = json.reflections || {};

      // スプレッドシート側に未知のカテゴリがあれば自動補完
      logs.forEach(l => {
        if (l.category && !categories.some(c => c.name === l.category)) {
          categories.push({
            id: l.category,
            name: l.category,
            color: '#6366f1',
            target: 30,
            defaultMin: 30
          });
          saveCategories();
        }
      });

      renderAll();
      setStatus(`同期完了（全${logs.length}セッション）`);
    } else {
      setStatus(`エラー: ${json.message}`);
    }
  } catch (e) {
    setStatus('通信エラーが発生しました');
    console.error(e);
  }
}

async function addSession() {
  const config = getConfig();
  if (!config) return;

  const btn = document.getElementById('submitSessionBtn');
  btn.disabled = true;

  const memo = document.getElementById('sessionMemo').value.trim();
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 楽観的UI更新（通信完了を待たず即座に画面反映）
  const tempId = 'temp-' + Date.now();
  const newItem = {
    id: tempId,
    date: selectedDate,
    category: selectedCategory,
    minutes: selectedMinutes,
    memo: memo,
    time: timeStr
  };
  logs.push(newItem);
  document.getElementById('sessionMemo').value = '';
  renderAll();
  showToast(`✓ ${selectedCategory} +${selectedMinutes}分 を加算しました`);
  setStatus('保存中...');

  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token: config.token,
        action: 'add',
        date: newItem.date,
        category: newItem.category,
        minutes: newItem.minutes,
        memo: newItem.memo,
        time: newItem.time
      })
    });
    const json = await res.json();
    if (json.status === 'success') {
      newItem.id = json.id;
      renderSessionList();
      setStatus(`同期完了（全${logs.length}セッション）`);
    } else {
      setStatus(`保存エラー: ${json.message}`);
    }
  } catch (e) {
    setStatus('送信エラーが発生しました');
    console.error(e);
  } finally {
    btn.disabled = false;
  }
}

async function deleteSession(id) {
  if (!confirm('このセッションを削除しますか？')) return;
  const config = getConfig();
  if (!config) return;

  logs = logs.filter(l => String(l.id) !== String(id));
  renderAll();
  setStatus('削除中...');

  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: config.token, action: 'delete', id: id })
    });
    const json = await res.json();
    if (json.status === 'success') {
      setStatus(`同期完了（全${logs.length}セッション）`);
      showToast('削除しました');
    }
  } catch (e) {
    setStatus('削除エラーが発生しました');
    console.error(e);
  }
}

async function saveReflection() {
  const config = getConfig();
  if (!config) return;

  const comment = document.getElementById('reflectionInput').value.trim();
  const btn = document.getElementById('saveReflectionBtn');
  btn.disabled = true;

  if (comment) {
    reflections[selectedDate] = comment;
  } else {
    delete reflections[selectedDate];
  }
  renderCalendar();
  showToast('振り返りを保存しました');
  setStatus('振り返りを同期中...');

  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token: config.token,
        action: 'saveReflection',
        date: selectedDate,
        comment: comment
      })
    });
    const json = await res.json();
    if (json.status === 'success') {
      setStatus(`同期完了（全${logs.length}セッション）`);
    }
  } catch (e) {
    setStatus('振り返り保存エラー');
    console.error(e);
  } finally {
    btn.disabled = false;
  }
}

// =========================================
// 描画ロジック一式
// =========================================
function renderAll() {
  renderCatKpis();
  renderBarChart();
  renderCategoryTiles();
  renderSessionList();
  renderWeekly();
  renderCalendar();
  renderReflection();
}

// 分野別の連続継続日数（今日または昨日から遡って連続している日数）
function calcCategoryStreak(catName) {
  const activeDates = new Set(
    logs.filter(l => l.category === catName && l.minutes > 0).map(l => l.date)
  );
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  if (!activeDates.has(formatDateObj(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (activeDates.has(formatDateObj(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// 1. 分野別KPIカード描画
function renderCatKpis() {
  const todayStr = getTodayStr();
  const grid = document.getElementById('catKpiGrid');

  grid.innerHTML = categories.map(cat => {
    const catLogs = logs.filter(l => l.category === cat.name);
    const totalMin = catLogs.reduce((s, l) => s + l.minutes, 0);
    const dayMin = catLogs.filter(l => l.date === selectedDate).reduce((s, l) => s + l.minutes, 0);
    const streak = calcCategoryStreak(cat.name);
    const pct = Math.min(100, Math.round((dayMin / cat.target) * 100));
    const dateLabel = selectedDate === todayStr ? '本日' : selectedDate.slice(5);

    return `
      <article class="kpi-card" style="--cat-color: ${cat.color};">
        <div class="kpi-top">
          <span class="kpi-name" title="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</span>
          <span class="streak-tag ${streak > 0 ? 'on' : ''}">${streak}日連続</span>
        </div>
        <div class="kpi-numbers">
          <div class="kpi-day-val">${dayMin}<small>分 / ${dateLabel}</small></div>
          <div class="kpi-cum-val">累計 ${(totalMin / 60).toFixed(1)}h</div>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${pct}%;"></div>
        </div>
      </article>
    `;
  }).join('');
}

// 2. 直近14日間積み上げグラフ描画
function renderBarChart() {
  document.getElementById('chartLegend').innerHTML = categories.map(c => `
    <span class="legend-chip">
      <span class="legend-dot" style="background:${c.color};"></span>
      <span>${escapeHtml(c.name)}</span>
    </span>
  `).join('');

  const days = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    days.push(formatDateObj(d));
  }

  const maxTotal = Math.max(150, ...days.map(dt =>
    logs.filter(l => l.date === dt).reduce((s, l) => s + l.minutes, 0)
  ));

  document.getElementById('barChart').innerHTML = days.map(dt => {
    const dayLogs = logs.filter(l => l.date === dt);
    const total = dayLogs.reduce((s, l) => s + l.minutes, 0);

    const segs = categories.map(cat => {
      const m = dayLogs.filter(l => l.category === cat.name).reduce((s, l) => s + l.minutes, 0);
      if (m <= 0) return '';
      const hPct = (m / maxTotal) * 100;
      return `<div class="bar-seg" style="height:${hPct}%; background:${cat.color};" title="${escapeHtml(cat.name)}: ${m}分"></div>`;
    }).join('');

    return `
      <div class="bar-col ${dt === selectedDate ? 'selected' : ''}" onclick="selectDate('${dt}')">
        <span class="bar-val">${total > 0 ? total : ''}</span>
        <div class="bar-stack">${segs}</div>
        <span class="bar-date">${Number(dt.slice(8))}</span>
      </div>
    `;
  }).join('');
}

// 3. 分野選択タイル描画
function renderCategoryTiles() {
  document.getElementById('catSelectGrid').innerHTML = categories.map(cat => {
    const dayAcc = logs
      .filter(l => l.date === selectedDate && l.category === cat.name)
      .reduce((s, l) => s + l.minutes, 0);
    const isSel = cat.name === selectedCategory;

    return `
      <button type="button" class="cat-tile ${isSel ? 'selected' : ''}" style="--cat-color:${cat.color};" onclick="selectCategory('${escapeAttr(cat.name)}')">
        <div class="cat-tile-left">
          <span class="cat-dot" style="background:${cat.color};"></span>
          <span class="cat-tile-title">${escapeHtml(cat.name)}</span>
        </div>
        <span class="cat-tile-acc">${dayAcc}m</span>
      </button>
    `;
  }).join('');

  updateSubmitBtnLabel();
}

function selectCategory(catName) {
  selectedCategory = catName;
  const found = categories.find(c => c.name === catName);
  if (found) {
    selectTime(found.defaultMin);
  }
  renderCategoryTiles();
}

function selectTime(min) {
  selectedMinutes = min;
  document.querySelectorAll('.time-chip').forEach(btn => {
    btn.classList.toggle('selected', Number(btn.dataset.min) === min);
  });
  updateSubmitBtnLabel();
}

function updateSubmitBtnLabel() {
  document.getElementById('submitSessionBtn').textContent =
    `＋「${selectedCategory} ${selectedMinutes}分」を累積に加算する`;
}

// 4. セッション履歴描画
function renderSessionList() {
  const dayLogs = logs.filter(l => l.date === selectedDate);
  const dayTotal = dayLogs.reduce((s, l) => s + l.minutes, 0);

  document.getElementById('sessionListTitle').textContent = `${selectedDate} のセッション内訳`;
  document.getElementById('dayTotalLabel').textContent = `日計 ${dayTotal}分`;

  const container = document.getElementById('sessionList');
  if (dayLogs.length === 0) {
    container.innerHTML = '<p style="font-size:0.8rem; color:#a1a1aa; padding:6px 0;">記録されたセッションはまだありません</p>';
    return;
  }

  container.innerHTML = dayLogs.slice().reverse().map(item => {
    const catObj = categories.find(c => c.name === item.category) || { color: '#71717a' };
    return `
      <div class="session-item">
        <div class="session-meta">
          <span class="session-time">${escapeHtml(item.time || '--:--')}</span>
          <span class="session-pill" style="background:${catObj.color};">${escapeHtml(item.category)}</span>
          <strong>+${item.minutes}分</strong>
          <span class="session-memo-text">${escapeHtml(item.memo)}</span>
        </div>
        <button type="button" class="del-link" onclick="deleteSession('${escapeAttr(item.id)}')">削除</button>
      </div>
    `;
  }).join('');
}

// 5. 週ごとの合計時間描画（月曜始まり〜日曜終わり）
function renderWeekly() {
  const weekOffset = Number(document.getElementById('weekSelector').value);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dayOfWeek = (now.getDay() + 6) % 7; // 月曜=0, 日曜=6
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek - weekOffset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const startStr = formatDateObj(monday);
  const endStr = formatDateObj(sunday);

  document.getElementById('weekRangeLabel').textContent = `${startStr.slice(5)} 〜 ${endStr.slice(5)}`;

  const weekLogs = logs.filter(l => l.date >= startStr && l.date <= endStr);
  const totalMin = weekLogs.reduce((s, l) => s + l.minutes, 0);
  document.getElementById('weekTotalTime').textContent = `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;

  document.getElementById('weeklyBreakdown').innerHTML = categories.map(cat => {
    const m = weekLogs.filter(l => l.category === cat.name).reduce((s, l) => s + l.minutes, 0);
    const targetWeek = cat.target * 7;
    const pct = Math.min(100, Math.round((m / targetWeek) * 100));

    return `
      <div class="weekly-row">
        <div class="weekly-row-head">
          <span>${escapeHtml(cat.name)}</span>
          <span>${m}分 / ${targetWeek}分</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct}%; background:${cat.color};"></div>
        </div>
      </div>
    `;
  }).join('');
}

// 6. 月間カレンダー描画
function shiftMonth(delta) {
  calViewMonth += delta;
  if (calViewMonth < 0) {
    calViewMonth = 11;
    calViewYear--;
  } else if (calViewMonth > 11) {
    calViewMonth = 0;
    calViewYear++;
  }
  renderCalendar();
}

function renderCalendar() {
  document.getElementById('calMonthTitle').textContent = `${calViewYear}年 ${calViewMonth + 1}月`;

  const firstDay = new Date(calViewYear, calViewMonth, 1);
  const lastDate = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  const startPad = (firstDay.getDay() + 6) % 7; // 月曜始まり

  let html = '';
  for (let i = 0; i < startPad; i++) {
    html += '<div class="cal-cell empty"></div>';
  }

  for (let d = 1; d <= lastDate; d++) {
    const dt = `${calViewYear}-${String(calViewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const total = logs.filter(l => l.date === dt).reduce((s, l) => s + l.minutes, 0);

    let lv = '';
    if (total >= 150) lv = 'lv4';
    else if (total >= 100) lv = 'lv3';
    else if (total >= 50) lv = 'lv2';
    else if (total > 0) lv = 'lv1';

    const hasNote = Boolean(reflections[dt]);
    const isSel = dt === selectedDate;

    html += `
      <button type="button" class="cal-cell ${lv} ${isSel ? 'selected' : ''}" onclick="selectDate('${dt}')" title="${dt}: ${total}分">
        <span>${d}</span>
        ${hasNote ? '<span class="note-dot"></span>' : ''}
      </button>
    `;
  }
  document.getElementById('calGrid').innerHTML = html;
}

// 7. 日付選択＆振り返り描画
function selectDate(dt) {
  selectedDate = dt;
  const parts = dt.split('-');
  calViewYear = Number(parts[0]);
  calViewMonth = Number(parts[1]) - 1;
  updateDateBadge();
  renderAll();
}

function jumpToToday() {
  selectDate(getTodayStr());
}

function updateDateBadge() {
  const todayStr = getTodayStr();
  document.getElementById('selectedDateBadge').textContent =
    selectedDate === todayStr ? `今日 (${selectedDate})` : selectedDate;
}

function renderReflection() {
  document.getElementById('reflectionTitle').textContent = `${selectedDate} の一言振り返り`;
  document.getElementById('reflectionInput').value = reflections[selectedDate] || '';
}

// 8. ブラウザ上での項目追加モーダル
function openCatModal() {
  document.getElementById('catModal').classList.add('open');
  document.getElementById('newCatName').focus();
}

function closeCatModal() {
  document.getElementById('catModal').classList.remove('open');
}

function selectSwatch(el) {
  document.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  selectedSwatchColor = el.dataset.color;
}

function createNewCategory() {
  const name = document.getElementById('newCatName').value.trim();
  const target = Number(document.getElementById('newCatTarget').value) || 30;
  if (!name) return;

  if (categories.some(c => c.name === name)) {
    alert('同じ名前の項目がすでに存在します');
    return;
  }

  categories.push({
    id: name,
    name: name,
    color: selectedSwatchColor,
    target: target,
    defaultMin: target
  });
  saveCategories();

  document.getElementById('newCatName').value = '';
  selectedCategory = name;
  selectedMinutes = target;
  closeCatModal();
  renderAll();
  showToast(`「${name}」を追加しました`);
}

// =========================================
// ユーティリティ
// =========================================
function getTodayStr() {
  return formatDateObj(new Date());
}

function formatDateObj(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeDateStr(val) {
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return formatDateObj(d);
  return s.slice(0, 10);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}