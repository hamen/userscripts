// ==UserScript==
// @name         GitHub Issues Kanban (read-only)
// @namespace    https://github.com/hamen/gh-kanban
// @version      0.3.0
// @description  Read-only Kanban view of GitHub Issues, driven by labels. No API keys. Cards are links — edit labels on GitHub itself.
// @author       you
// @match        https://github.com/*/*/issues*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

/*
  HOW IT WORKS
  ------------
  Read-only. Reads the issues GitHub already rendered and lays them out as a
  Kanban board. Click any card to open the issue — change labels there.

  REQUIRED LABELS (create once per repo — see in-app onboarding dialog)
  --------------------------------------------
    status:backlog      color ededed   Triaged, not scheduled
    status:ready        color 0e8a16   Ready to pick up
    status:in-progress  color fbca04   Actively being worked on
    status:review       color 5319e7   PR open, awaiting review
    status:blocked      color b60205   Blocked, needs unsticking

  Closed issues form the Done column automatically. We also recognize
  "Status: X", "state:x", and bare "backlog/ready/in progress/review/blocked".
*/

(function () {
  'use strict';

  // ---------- config ----------
  const COLUMNS = [
    { key: 'backlog',     label: 'Backlog',     color: '#8b949e', match: ['backlog'] },
    { key: 'ready',       label: 'Ready',       color: '#2ea043', match: ['ready', 'todo', 'to do'] },
    { key: 'in-progress', label: 'In Progress', color: '#d4a72c', match: ['in-progress', 'in progress', 'doing', 'wip'] },
    { key: 'review',      label: 'Review',      color: '#8957e5', match: ['review', 'in review'] },
    { key: 'blocked',     label: 'Blocked',     color: '#da3633', match: ['blocked', 'on hold'] },
    { key: 'done',        label: 'Done',        color: '#6e7681', match: ['done', 'closed', 'complete', 'completed'] }
  ];

  const LABEL_SETUP = [
    { name: 'status:backlog',     color: 'ededed', desc: 'Triaged, not scheduled' },
    { name: 'status:ready',       color: '0e8a16', desc: 'Ready to pick up' },
    { name: 'status:in-progress', color: 'fbca04', desc: 'Actively being worked on' },
    { name: 'status:review',      color: '5319e7', desc: 'PR open, awaiting review' },
    { name: 'status:blocked',     color: 'b60205', desc: 'Blocked, needs unsticking' }
  ];

  // ---------- repo detection ----------
  function getRepo() {
    const m = location.pathname.match(/^\/([^/]+)\/([^/]+)\/issues/);
    return m ? { owner: m[1], repo: m[2], slug: `${m[1]}/${m[2]}` } : null;
  }

  // ---------- label classification ----------
  function classifyLabel(name) {
    const n = (name || '').toLowerCase().trim();
    const stripped = n.replace(/^(status|state)\s*:\s*/, '').trim();
    for (const col of COLUMNS) {
      if (col.match.some(m => stripped === m)) return col.key;
    }
    return null;
  }

  // ---------- DOM scraping ----------
  function scrapeIssues() {
    const ul = document.querySelector('ul[data-listview-component="items-list"]');
    if (!ul) return [];
    return [...ul.querySelectorAll('li[role="listitem"]')].map(li => {
      const titleEl = li.querySelector('a[data-testid="issue-pr-title-link"]');
      if (!titleEl) return null;
      const href = titleEl.getAttribute('href');
      const title = titleEl.textContent.trim();
      const aria = li.getAttribute('aria-label') || '';
      const numMatch = aria.match(/#(\d+)/);
      const number = numMatch ? numMatch[1] : '';
      const isClosed = /status:\s*closed/i.test(aria);
      const labelAnchors = li.querySelectorAll('a[href*="labels%5B%5D="], a[href*="label%3A"]');
      const labels = [...labelAnchors].map(a => a.textContent.trim()).filter(Boolean);
      const assignees = [...li.querySelectorAll('img[alt]')]
        .map(img => ({ alt: img.alt, src: img.src }))
        .filter(a => a.alt && !a.alt.includes(' '));
      const commentsMatch = (li.textContent.match(/(\d+)\s+comments?/) || [])[1];
      return {
        number, title, href, labels, assignees,
        comments: commentsMatch ? parseInt(commentsMatch, 10) : 0,
        closed: isClosed
      };
    }).filter(Boolean);
  }

  function bucketIssue(issue) {
    if (issue.closed) return 'done';
    for (const lbl of issue.labels) {
      const col = classifyLabel(lbl);
      if (col) return col;
    }
    return 'backlog';
  }

  function detectMissingLabels(issues) {
    const seen = new Set();
    for (const iss of issues) for (const lbl of iss.labels) seen.add(lbl.toLowerCase());
    return LABEL_SETUP.filter(l => !seen.has(l.name.toLowerCase()));
  }

  // ---------- state ----------
  let hostEl = null;
  let inBoardMode = true; // session-only toggle
  let toolbarBtn = null;

  // ---------- list hiding via persistent CSS ----------
  const HIDE_STYLE_ID = 'ghk-hide-list';
  function installHideStyle() {
    if (document.getElementById(HIDE_STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = HIDE_STYLE_ID;
    s.textContent = `
      html[data-ghk-board="1"] ul[data-listview-component="items-list"],
      html[data-ghk-board="1"] [data-listview-component="items-list-header"],
      html[data-ghk-board="1"] [class*="Pagination"] {
        display: none !important;
      }
    `;
    document.head.appendChild(s);
  }
  function hideNativeList() {
    installHideStyle();
    document.documentElement.setAttribute('data-ghk-board', '1');
  }
  function showNativeList() {
    document.documentElement.removeAttribute('data-ghk-board');
  }

  // ---------- host (board container) ----------
  function ensureHost() {
    if (hostEl && document.body.contains(hostEl)) return hostEl;
    hostEl = document.createElement('div');
    hostEl.id = 'ghk-host';
    hostEl.style.cssText = 'position:relative;z-index:5;margin:16px 0;';
    const shadow = hostEl.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; }
        .wrap { font: 13px -apple-system, "Segoe UI", system-ui, sans-serif; color: #e6edf3; }
        .bar { display:flex; align-items:center; gap:8px; padding:8px 12px; background:#161b22;
               border:1px solid #30363d; border-radius:6px 6px 0 0; }
        .bar h2 { margin:0; font-size:14px; font-weight:600; flex:1; }
        .btn { background:#21262d; color:#e6edf3; border:1px solid #30363d; border-radius:6px;
               padding:5px 12px; font:inherit; cursor:pointer; }
        .btn:hover { background:#30363d; }
        .btn.primary { background:#238636; border-color:#2ea043; }
        .btn.primary:hover { background:#2ea043; }
        .banner { background:#1f2d3d; border:1px solid #30363d; border-top:0;
                  padding:8px 12px; font-size:12px; color:#c9d1d9; }
        .banner a { color:#58a6ff; cursor:pointer; text-decoration:underline; }

        /* --- Viewport breakout for the board only --- */
        /* The board escapes its parent's width constraint and uses the full viewport.
           The 17px fudge accounts for the vertical scrollbar on most desktop browsers
           to prevent a page-level horizontal scrollbar from appearing. */
        .board-wrap {
          width: calc(100vw - 17px);
          position: relative;
          left: 50%;
          right: 50%;
          margin-left: calc(-50vw + 8px);
          margin-right: calc(-50vw + 8px);
          padding: 0 16px;
          box-sizing: border-box;
        }
        .board { display:grid; grid-template-columns: repeat(6, minmax(200px, 1fr));
                 gap:8px; padding:10px; background:#0d1117;
                 border:1px solid #30363d; border-top:0; border-radius:0 0 6px 6px;
                 overflow-x:auto; }
        .col { background:#161b22; border:1px solid #30363d; border-radius:6px;
               display:flex; flex-direction:column; min-height:180px; }
        .colhead { display:flex; align-items:center; gap:8px; padding:8px 10px;
                   border-bottom:1px solid #30363d; font-weight:600; font-size:12px;
                   text-transform:uppercase; letter-spacing:.04em; }
        .dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
        .count { margin-left:auto; background:#30363d; color:#c9d1d9; border-radius:20px;
                 padding:1px 8px; font-size:11px; font-weight:500; }
        .cards { padding:8px; display:flex; flex-direction:column; gap:8px; }
        .card { display:block; text-decoration:none; color:inherit;
                background:#0d1117; border:1px solid #30363d; border-radius:6px;
                padding:10px; transition:border-color .1s, transform .1s; }
        .card:hover { border-color:#58a6ff; transform:translateY(-1px); }
        .card .t { font-weight:500; line-height:1.35; margin-bottom:6px; word-break:break-word; }
        .card .meta { display:flex; align-items:center; gap:8px; font-size:11px; color:#8b949e; }
        .card .labels { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
        .chip { font-size:10px; padding:1px 6px; border-radius:20px;
                background:#21262d; border:1px solid #30363d; color:#c9d1d9; }
        .av { width:18px; height:18px; border-radius:50%; border:1px solid #30363d; }
        .empty { padding:16px 10px; text-align:center; color:#484f58; font-size:11px; font-style:italic; }
        .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:9999;
                    display:flex; align-items:center; justify-content:center; padding:20px; }
        .modal { background:#161b22; border:1px solid #30363d; border-radius:8px;
                 max-width:560px; width:100%; max-height:90vh; overflow:auto; }
        .modal h3 { margin:0; padding:16px 20px; border-bottom:1px solid #30363d; font-size:16px; }
        .modal .body { padding:16px 20px; line-height:1.55; }
        .modal .body p { margin:0 0 12px; }
        .modal .labels-preview { display:flex; flex-direction:column; gap:6px; margin:12px 0; }
        .modal .lrow { display:flex; align-items:center; gap:10px; }
        .modal .lchip { font-size:11px; padding:2px 8px; border-radius:20px; font-weight:500;
                        border:1px solid rgba(255,255,255,.1); }
        .modal .ldesc { color:#8b949e; font-size:12px; }
        .modal .actions { display:flex; gap:8px; padding:12px 20px;
                          border-top:1px solid #30363d; align-items:center; flex-wrap:wrap; }
        .modal .dismiss { margin-left:auto; font-size:12px; color:#8b949e; display:flex;
                          align-items:center; gap:6px; cursor:pointer; }
        .toast { position:absolute; bottom:20px; left:50%; transform:translateX(-50%);
                 background:#238636; color:#fff; padding:8px 14px; border-radius:6px;
                 font-size:12px; opacity:0; transition:opacity .2s; pointer-events:none; }
        .toast.show { opacity:1; }
      </style>
      <div class="wrap">
        <div class="bar">
          <h2>📋 Kanban board</h2>
          <button class="btn" data-act="refresh">Refresh</button>
          <button class="btn" data-act="list">List view</button>
        </div>
        <div class="banner" data-role="banner" style="display:none"></div>
        <div class="board-wrap">
          <div class="board" data-role="board"></div>
        </div>
        <div class="toast" data-role="toast"></div>
      </div>
    `;
    return hostEl;
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function cardHtml(iss) {
    const labels = (iss.labels || []).map(l => `<span class="chip">${escapeHtml(l)}</span>`).join('');
    const avatars = (iss.assignees || []).slice(0, 3).map(a =>
      `<img class="av" src="${escapeHtml(a.src)}" alt="${escapeHtml(a.alt)}" title="${escapeHtml(a.alt)}">`
    ).join('');
    return `
      <a class="card" href="${escapeHtml(iss.href)}">
        <div class="t">${escapeHtml(iss.title)}</div>
        <div class="meta">
          <span>#${escapeHtml(iss.number)}</span>
          ${iss.comments ? `<span>💬 ${iss.comments}</span>` : ''}
          <span style="margin-left:auto;display:flex;gap:2px">${avatars}</span>
        </div>
        ${labels ? `<div class="labels">${labels}</div>` : ''}
      </a>
    `;
  }

  function renderBoard(issues, missingLabels) {
    const host = ensureHost();
    const root = host.shadowRoot;
    const board = root.querySelector('[data-role="board"]');
    const banner = root.querySelector('[data-role="banner"]');

    if (missingLabels && missingLabels.length > 0 && missingLabels.length < LABEL_SETUP.length) {
      banner.style.display = 'block';
      banner.innerHTML = `${LABEL_SETUP.length - missingLabels.length} of ${LABEL_SETUP.length} status labels detected. Missing: <strong>${missingLabels.map(l => l.name).join(', ')}</strong>. <a data-act="onboard">Show setup instructions</a>`;
    } else {
      banner.style.display = 'none';
    }

    const buckets = Object.fromEntries(COLUMNS.map(c => [c.key, []]));
    for (const iss of issues) buckets[bucketIssue(iss)].push(iss);

    board.innerHTML = COLUMNS.map(col => `
      <div class="col">
        <div class="colhead">
          <span class="dot" style="background:${col.color}"></span>
          ${col.label}
          <span class="count">${buckets[col.key].length}</span>
        </div>
        <div class="cards">
          ${buckets[col.key].length === 0
            ? '<div class="empty">no issues</div>'
            : buckets[col.key].map(cardHtml).join('')}
        </div>
      </div>
    `).join('');
  }

  // ---------- onboarding modal ----------
  function showOnboardingModal(repo, missing) {
    const existing = document.getElementById('ghk-modal');
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.id = 'ghk-modal';
    const shadow = wrap.attachShadow({ mode: 'open' });
    const styles = hostEl?.shadowRoot?.querySelector('style')?.textContent || '';

    const labelsHtml = LABEL_SETUP.map(l => {
      const isMissing = missing.some(m => m.name === l.name);
      return `
        <div class="lrow">
          <span class="lchip" style="background:#${l.color};color:${parseInt(l.color,16) > 0xaaaaaa ? '#000' : '#fff'}">${l.name}</span>
          <span class="ldesc">${l.desc}</span>
          ${isMissing ? '<span style="color:#da3633;font-size:11px;margin-left:auto">missing</span>' : '<span style="color:#2ea043;font-size:11px;margin-left:auto">✓ exists</span>'}
        </div>
      `;
    }).join('');

    shadow.innerHTML = `
      <style>${styles}</style>
      <div class="backdrop" data-role="backdrop">
        <div class="modal" role="dialog" aria-label="Kanban setup">
          <h3>Set up your Kanban board</h3>
          <div class="body">
            <p><strong>This extension is read-only.</strong> It reorganizes your existing GitHub issues into a board based on labels. You still edit issues on GitHub itself — click any card to open its issue page.</p>
            <p>For this repo to work, please create these labels:</p>
            <div class="labels-preview">${labelsHtml}</div>
            <p>Closed issues form the <strong>Done</strong> column automatically.</p>
          </div>
          <div class="actions">
            <button class="btn primary" data-act="copy-gh">Copy gh CLI commands</button>
            <button class="btn" data-act="open-labels">Open labels page</button>
            <button class="btn" data-act="refresh-check">I've created them — refresh</button>
            <label class="dismiss"><input type="checkbox" data-act="dismiss-check"> Don't show again for this repo</label>
          </div>
          <div class="toast" data-role="toast"></div>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    const toast = (msg) => {
      const t = shadow.querySelector('[data-role="toast"]');
      t.textContent = msg; t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 1800);
    };

    shadow.querySelector('[data-role="backdrop"]').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) wrap.remove();
    });

    shadow.addEventListener('click', async (e) => {
      const act = e.target.getAttribute('data-act');
      if (act === 'copy-gh') {
        const cmds = LABEL_SETUP.map(l =>
          `gh label create "${l.name}" --color ${l.color} --description "${l.desc}" --repo ${repo.slug}`
        ).join('\n');
        try { await navigator.clipboard.writeText(cmds); toast('Copied 5 commands to clipboard'); }
        catch { toast('Clipboard blocked — select the text manually'); }
      } else if (act === 'open-labels') {
        window.open(`https://github.com/${repo.slug}/labels`, '_blank');
      } else if (act === 'refresh-check') {
        wrap.remove();
        scheduleRun();
      } else if (act === 'dismiss-check') {
        GM_setValue(`ghk:dismissed:${repo.slug}`, !!e.target.checked);
      }
    });
  }

  // ---------- persistent toolbar toggle button ----------
  function ensureToolbarButton() {
    // Anchor: the "New issue" link, which is stable across GH redesigns.
    const newIssueLink = document.querySelector('a[href$="/issues/new/choose"], a[href$="/issues/new"]');
    if (!newIssueLink) return;

    // If we already have a button in the DOM, reuse it.
    const existing = document.getElementById('ghk-toggle-btn');
    if (existing && newIssueLink.parentElement.contains(existing)) {
      toolbarBtn = existing;
      updateToolbarButton();
      return;
    }

    const btn = document.createElement('button');
    btn.id = 'ghk-toggle-btn';
    btn.type = 'button';
    btn.style.cssText = `
      margin-right:8px; padding:5px 12px; font:inherit; font-size:14px; cursor:pointer;
      background:#21262d; color:#e6edf3; border:1px solid #30363d; border-radius:6px;
      display:inline-flex; align-items:center; gap:6px;
    `;
    btn.addEventListener('click', () => {
      inBoardMode = !inBoardMode;
      scheduleRun();
    });
    newIssueLink.parentElement.insertBefore(btn, newIssueLink);
    toolbarBtn = btn;
    updateToolbarButton();
  }

  function updateToolbarButton() {
    if (!toolbarBtn) return;
    toolbarBtn.textContent = inBoardMode ? '📋 List view' : '📋 Board view';
    toolbarBtn.title = inBoardMode ? 'Switch to native list' : 'Switch to Kanban board';
  }

  // ---------- mount ----------
  function mountHost() {
    const list = document.querySelector('ul[data-listview-component="items-list"]');
    if (!list) return false;
    const anchor = list.closest('[data-listview-component="items-list-container"]')
                || list.parentElement.parentElement;
    if (!anchor || !anchor.parentElement) return false;
    const host = ensureHost();
    if (!anchor.parentElement.contains(host)) {
      anchor.parentElement.insertBefore(host, anchor);
    }
    return true;
  }

  // ---------- main run (idempotent) ----------
  let runScheduled = false;
  let emptyRetries = 0;
  function scheduleRun() {
    if (runScheduled) return;
    runScheduled = true;
    requestAnimationFrame(() => {
      runScheduled = false;
      run();
    });
  }

  function run() {
    const repo = getRepo();
    if (!repo) { showNativeList(); return; }

    // Always try to add the toolbar button (even in list mode, so user can recover)
    ensureToolbarButton();
    updateToolbarButton();

    if (!mountHost()) {
      // List not in DOM yet — observer will retry
      return;
    }

    if (!inBoardMode) {
      showNativeList();
      if (hostEl) hostEl.style.display = 'none';
      return;
    }

    // Board mode
    hideNativeList();
    if (hostEl) hostEl.style.display = '';

    const issues = scrapeIssues();

    // If the scraper returned nothing but the list element exists, the list
    // likely hasn't hydrated yet. Retry a few times before giving up.
    if (issues.length === 0 && emptyRetries < 5) {
      emptyRetries++;
      setTimeout(scheduleRun, 200);
      return;
    }
    emptyRetries = 0;

    const missing = detectMissingLabels(issues);
    renderBoard(issues, missing);

    if (!hostEl.__wired) {
      hostEl.__wired = true;
      hostEl.shadowRoot.addEventListener('click', (e) => {
        const act = e.target.getAttribute('data-act');
        if (act === 'refresh') scheduleRun();
        else if (act === 'list') {
          inBoardMode = false;
          scheduleRun();
        }
        else if (act === 'onboard') showOnboardingModal(repo, detectMissingLabels(scrapeIssues()));
      });
    }

    const dismissed = GM_getValue(`ghk:dismissed:${repo.slug}`, false);
    const seenOnce = GM_getValue(`ghk:seen:${repo.slug}`, false);
    if (!dismissed && !seenOnce && missing.length === LABEL_SETUP.length && issues.length > 0) {
      showOnboardingModal(repo, missing);
      GM_setValue(`ghk:seen:${repo.slug}`, true);
    }
  }

  // ---------- menu commands ----------
  GM_registerMenuCommand('Kanban: Toggle Board / List', () => {
    inBoardMode = !inBoardMode;
    scheduleRun();
  });
  GM_registerMenuCommand('Kanban: Show setup instructions', () => {
    const repo = getRepo();
    if (!repo) { alert('Navigate to a repo issues page first.'); return; }
    const issues = scrapeIssues();
    const missing = detectMissingLabels(issues);
    showOnboardingModal(repo, missing);
  });
  GM_registerMenuCommand('Kanban: Diagnose', () => {
    const repo = getRepo();
    const info = {
      version: '0.3.0',
      url: location.href,
      repo: repo ? repo.slug : null,
      inBoardMode,
      hasHostInDOM: !!(hostEl && document.body.contains(hostEl)),
      hostDisplay: hostEl ? hostEl.style.display : null,
      htmlBoardAttr: document.documentElement.getAttribute('data-ghk-board'),
      hideStyleInstalled: !!document.getElementById(HIDE_STYLE_ID),
      toolbarBtnInDOM: !!(toolbarBtn && document.body.contains(toolbarBtn)),
      listElementPresent: !!document.querySelector('ul[data-listview-component="items-list"]'),
      issuesScraped: scrapeIssues().length
    };
    console.log('[GH Kanban] diagnose', info);
    alert('Kanban diagnose:\n\n' + JSON.stringify(info, null, 2));
  });
  GM_registerMenuCommand('Kanban: Reset onboarding for this repo', () => {
    const repo = getRepo();
    if (!repo) return;
    GM_setValue(`ghk:seen:${repo.slug}`, false);
    GM_setValue(`ghk:dismissed:${repo.slug}`, false);
    alert(`Onboarding reset for ${repo.slug}. Refresh the page.`);
  });

  // ---------- triggers ----------
  scheduleRun();
  document.addEventListener('turbo:load', scheduleRun);
  document.addEventListener('turbo:render', scheduleRun);
  document.addEventListener('turbo:frame-load', scheduleRun);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleRun();
  });
  window.addEventListener('pageshow', scheduleRun);
  window.addEventListener('focus', scheduleRun);

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scheduleRun();
    }
  }, 500);

  // React hydration / list re-renders
  const obs = new MutationObserver(() => {
    if (!/\/issues/.test(location.pathname)) return;
    const list = document.querySelector('ul[data-listview-component="items-list"]');
    const hostMissing = !hostEl || !document.body.contains(hostEl);
    const btnMissing = !toolbarBtn || !document.body.contains(toolbarBtn);
    if (list && (hostMissing || btnMissing)) scheduleRun();
  });
  obs.observe(document.body, { subtree: true, childList: true });
})();
