// 初期化処理
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('dateInput').valueAsDate = new Date();
  document.getElementById('gasUrl').value = localStorage.getItem('habit_gas_url') || '';
  document.getElementById('gasToken').value = localStorage.getItem('habit_gas_token') || '';
  fetchLogs();
});

function toggleSettings() {
  document.getElementById('settingsPanel').classList.toggle('open');
}

function saveSettings() {
  localStorage.setItem('habit_gas_url', document.getElementById('gasUrl').value.trim());
  localStorage.setItem('habit_gas_token', document.getElementById('gasToken').value.trim());
  toggleSettings();
  fetchLogs();
}

function setMinutes(min) {
  document.getElementById('minutesInput').value = min;
}

function getConfig() {
  const url = localStorage.getItem('habit_gas_url');
  const token = localStorage.getItem('habit_gas_token');
  if (!url || !token) {
    document.getElementById('settingsPanel').classList.add('open');
    setStatus('右上の「API設定」からGASのURLと合言葉を設定してください');
    return null;
  }
  return { url, token };
}

function setStatus(msg) {
  document.getElementById('statusText').textContent = msg;
}

// データ取得（GET）
async function fetchLogs() {
  const config = getConfig();
  if (!config) return;

  setStatus('読み込み中...');
  try {
    const res = await fetch(`${config.url}?token=${encodeURIComponent(config.token)}`);
    const json = await res.json();
    if (json.status === 'success') {
      renderLogs(json.data);
      setStatus(`同期完了（${json.data.length}件）`);
    } else {
      setStatus(`エラー: ${json.message}`);
    }
  } catch (e) {
    setStatus('通信エラーが発生しました');
    console.error(e);
  }
}

// データ追加（POST）
async function addLog() {
  const config = getConfig();
  if (!config) return;

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  setStatus('送信中...');

  const payload = {
    token: config.token,
    action: 'add',
    date: document.getElementById('dateInput').value,
    category: document.getElementById('categoryInput').value,
    minutes: document.getElementById('minutesInput').value,
    memo: document.getElementById('memoInput').value
  };

  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.status === 'success') {
      document.getElementById('memoInput').value = '';
      await fetchLogs();
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

// データ削除（POST）
async function deleteLog(id) {
  if (!confirm('この記録を削除しますか？')) return;
  const config = getConfig();
  if (!config) return;

  setStatus('削除中...');
  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: config.token, action: 'delete', id: id })
    });
    const json = await res.json();
    if (json.status === 'success') {
      await fetchLogs();
    }
  } catch (e) {
    setStatus('削除エラーが発生しました');
    console.error(e);
  }
}

// 画面描画
function renderLogs(logs) {
  const list = document.getElementById('logList');
  if (!logs || logs.length === 0) {
    list.innerHTML = '<p class="empty-msg">記録がありません</p>';
    return;
  }
  list.innerHTML = logs.map(item => {
    const dateStr = String(item.date).slice(0, 10);
    return `
      <div class="log-item">
        <div>
          <span class="log-date">${dateStr}</span>
          <span class="badge">${escapeHtml(item.category)}</span>
          <strong>${item.minutes}分</strong>
          <span class="log-memo">${escapeHtml(item.memo || '')}</span>
        </div>
        <button type="button" class="del-btn" onclick="deleteLog('${item.id}')">削除</button>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}