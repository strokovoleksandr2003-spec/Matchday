// Shared helpers for every public page. Pages import this first, then
// run their own render code.

const LEAGUE = 'upl';

const NAV_ITEMS = [
  { href: 'index.html', label: 'Головна' },
  { href: 'table.html', label: 'Таблиця' },
  { href: 'matches.html', label: 'Матчі' },
  { href: 'teams.html', label: 'Команди' },
];

// --- api -------------------------------------------------------------

async function getJSON(path) {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

function api(path) {
  return getJSON(`/api/leagues/${LEAGUE}${path}`);
}

// --- header ----------------------------------------------------------

// Renders the shared header + nav into <div id="header"></div>, marking
// the current page active based on the filename.
function renderHeader() {
  const current = location.pathname.split('/').pop() || 'index.html';
  const el = document.getElementById('header');
  if (!el) return;

  el.innerHTML = `
    <header class="site-header">
      <div class="shell">
        <a class="brand" href="index.html">
          <span class="logo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5F4EF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3.5 2"></path></svg>
          </span>
          <span class="name">Matchday</span>
        </a>
        <span class="league-pill">УПЛ</span>
      </div>
      <nav class="site-nav">
        ${NAV_ITEMS.map(item => `
          <a href="${item.href}" class="${item.href === current ? 'active' : ''}">${item.label}</a>
        `).join('')}
      </nav>
    </header>`;
}

// --- formatting ------------------------------------------------------

function initials(name) {
  return (name || '').trim().slice(0, 3).toUpperCase();
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('uk-UA', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function positionLabel(pos) {
  return { GK: 'ВР', DF: 'ЗХ', MF: 'ПЗ', FW: 'НП' }[pos] || pos || '';
}

function statusLabel(status) {
  return { available: 'Готовий', injured: 'Травма', suspended: 'Дискваліфікація' }[status] || status;
}

// Shows an error message inside a target element instead of leaving it
// stuck on "Завантаження…".
function showError(elementId, err) {
  const el = document.getElementById(elementId);
  if (el) el.innerHTML = `<p class="error">${err.message}</p>`;
}

renderHeader();
