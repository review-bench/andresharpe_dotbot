/* DOTBOT Dashboard - Overview section
 * Aggregates: runtime identity, stats, quick actions, active processes, current/next tasks.
 * Subscribes to: info, state, processes, git.
 */
(function () {
    'use strict';

    const STATS = [
        { key: 'todo',        label: 'TODO',        status: 'todo' },
        { key: 'analysing',   label: 'ANALYSING',   status: 'in-progress' },
        { key: 'needs_input', label: 'INPUT',       status: 'todo',        glyph: '⚡' },
        { key: 'analysed',    label: 'READY',       status: 'todo' },
        { key: 'in_progress', label: 'IN PROGRESS', status: 'in-progress' },
        { key: 'done',        label: 'DONE',        status: 'done' },
    ];

    function renderStats() {
        const root = document.getElementById('ov-stats');
        if (!root) return;
        const s = (window.Store.get('state') || {}).tasks || {};
        root.innerHTML = '';
        STATS.forEach(({ key, label, status }) => {
            const v = s[key];
            const card = document.createElement('div');
            card.className = 'stat-card';
            card.setAttribute('data-status', status);

            const lbl = document.createElement('div');
            lbl.className = 'stat-label';
            lbl.textContent = label;

            const val = document.createElement('div');
            val.className = 'stat-value';
            val.textContent = v == null ? '0' : String(v);

            card.appendChild(lbl);
            card.appendChild(val);
            root.appendChild(card);
        });
    }

    function renderIdentity() {
        const body = document.getElementById('ov-identity-body');
        if (!body) return;
        const info = window.Store.get('info') || {};
        const git = window.Store.get('git') || {};
        const state = window.Store.get('state') || {};
        const fw = info.framework || {};

        body.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'kv-grid';

        const pairs = [
            ['PROJECT', info.project_name || '--', 'warning'],
            ['PATH', info.full_path || info.project_root || '--', 'muted'],
            ['WORKFLOW', info.workflow || '--', 'secondary'],
            ['BRANCH', git.branch || '--', 'secondary'],
            ['COMMIT', git.commit ? git.commit.slice(0, 8) : '--', 'muted'],
            ['INSTANCE', state.instance_id || '--', 'muted'],
            ['FRAMEWORK', (fw.version || '--') + (fw.dirty ? ' (dirty)' : ''), fw.dirty ? 'warning' : 'muted'],
        ];
        for (const [k, v, type] of pairs) {
            const dt = document.createElement('div');
            dt.className = 'kv-key';
            dt.textContent = k;
            const dd = document.createElement('div');
            dd.className = 'kv-val';
            if (type) dd.setAttribute('data-type', type);
            dd.textContent = v;
            grid.appendChild(dt);
            grid.appendChild(dd);
        }
        body.appendChild(grid);
    }

    function renderActive() {
        const body = document.getElementById('ov-activity-body');
        const badge = document.getElementById('ov-active-count');
        if (!body) return;
        const list = (window.Store.get('processes') || []).filter((p) => p && (p.status === 'running' || p.status === 'starting'));
        if (badge) badge.textContent = String(list.length);

        if (list.length === 0) {
            body.innerHTML = '<div class="empty-state">No active processes</div>';
            return;
        }
        body.innerHTML = '';
        list.slice(0, 5).forEach((p) => {
            const row = document.createElement('div');
            row.className = 'data-row';
            row.style.borderLeftColor = 'var(--color-success)';
            row.innerHTML =
                '<span class="data-row-id">' + window.UI.escapeHtml(String(p.id || '').slice(0, 8)) + '</span>' +
                '<span class="data-row-title">' + window.UI.escapeHtml(p.description || p.type || 'process') + '</span>' +
                '<span class="data-row-meta">' +
                    '<span class="badge" data-status="' + (p.status || 'running') + '">' + window.UI.escapeHtml(p.status || 'RUNNING') + '</span>' +
                    '<span class="badge" data-type="muted">' + window.UI.escapeHtml(p.type || '') + '</span>' +
                '</span>';
            row.addEventListener('click', () => window.Router.go('processes'));
            body.appendChild(row);
        });
    }

    function renderTasks() {
        const body = document.getElementById('ov-tasks-body');
        if (!body) return;
        const t = (window.Store.get('state') || {}).tasks || {};
        body.innerHTML = '';

        const current = t.current;
        const upcoming = (t.upcoming || []).slice(0, 5);
        const completed = (t.recent_completed || []).slice(0, 3);

        if (!current && upcoming.length === 0 && completed.length === 0) {
            body.innerHTML = '<div class="empty-state">No tasks yet — run a workflow or create one</div>';
            return;
        }

        const sect = (title, items, status) => {
            if (!items || items.length === 0) return;
            const head = document.createElement('div');
            head.style.cssText = 'font-size:9px;letter-spacing:0.12em;color:var(--color-muted);margin:8px 0 6px;text-transform:uppercase;font-family:var(--font-ui);';
            head.textContent = title;
            body.appendChild(head);
            items.forEach((it) => {
                const row = document.createElement('div');
                row.className = 'data-row';
                row.setAttribute('data-status', status);
                row.style.setProperty('--status-color',
                    status === 'done' ? 'var(--color-success)' :
                    status === 'in-progress' ? 'var(--color-secondary)' :
                    'var(--color-primary)');
                row.innerHTML =
                    '<span class="data-row-id">' + window.UI.escapeHtml(String(it.id || '').slice(0, 8)) + '</span>' +
                    '<span class="data-row-title">' + window.UI.escapeHtml(it.name || it.title || '(unnamed)') + '</span>' +
                    '<span class="data-row-meta">' +
                        (it.workflow ? '<span class="badge" data-type="tertiary">' + window.UI.escapeHtml(it.workflow) + '</span>' : '') +
                    '</span>';
                row.addEventListener('click', () => window.Router.go('roadmap'));
                body.appendChild(row);
            });
        };

        if (current) sect('CURRENT', [current], 'in-progress');
        sect('UPCOMING', upcoming, 'todo');
        sect('RECENTLY COMPLETED', completed, 'done');
    }

    function wireActions() {
        const root = document.getElementById('ov-actions-body');
        if (!root) return;
        root.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const a = btn.getAttribute('data-action');
            if (a === 'run-workflow') {
                window.Router.go('workflows');
            } else if (a === 'new-task') {
                if (window.Roadmap && window.Roadmap.openCreateModal) window.Roadmap.openCreateModal();
                else window.Router.go('roadmap');
            } else if (a === 'commit') {
                try {
                    await window.API.gitCommit();
                    window.UI.toast('Commit & push process launched', 'success');
                } catch (err) {
                    window.UI.toast('Commit failed: ' + err.message, 'error');
                }
            } else if (a === 'open-editor') {
                try {
                    await window.API.editorOpen();
                    window.UI.toast('Editor launching...', 'success');
                } catch (err) {
                    window.UI.toast('Editor failed: ' + err.message, 'error');
                }
            }
        });
    }

    function render() {
        renderStats();
        renderIdentity();
        renderActive();
        renderTasks();
    }

    /* ---------- Activity scope ---------- */
    let scopePosition = 0;
    let scopeTimer = null;
    const scopeBuffer = [];

    function renderScope() {
        const evRoot = document.getElementById('ov-scope-events');
        const textRoot = document.getElementById('ov-scope-text');
        const toolPill = document.getElementById('ov-scope-tool');
        if (!evRoot || !textRoot || !toolPill) return;

        if (scopeBuffer.length === 0) {
            textRoot.textContent = 'Waiting for activity...';
            toolPill.textContent = 'IDLE';
            toolPill.classList.remove('active');
            evRoot.innerHTML = '';
            return;
        }

        const latest = scopeBuffer[0];
        textRoot.textContent = latest.message || latest.text || '(no message)';
        const tool = latest.tool || latest.toolName || latest.type || '';
        if (tool) {
            toolPill.textContent = String(tool).toUpperCase();
            toolPill.classList.add('active');
        } else {
            toolPill.textContent = 'IDLE';
            toolPill.classList.remove('active');
        }

        evRoot.innerHTML = '';
        scopeBuffer.slice(0, 6).forEach((ev) => {
            const row = document.createElement('div');
            row.className = 'ov-scope-event';
            row.innerHTML =
                '<span class="ov-scope-event-time">' + window.UI.escapeHtml(fmtTimeOnly(ev.timestamp || ev.time)) + '</span>' +
                '<span class="ov-scope-event-tool">' + window.UI.escapeHtml(String(ev.tool || ev.type || '--').slice(0, 10)) + '</span>' +
                '<span class="ov-scope-event-msg">' + window.UI.escapeHtml(window.UI.truncate(ev.message || ev.text || '', 120)) + '</span>';
            evRoot.appendChild(row);
        });
    }

    function fmtTimeOnly(ts) {
        if (!ts) return '--:--:--';
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '--:--:--';
        const p = (n) => String(n).padStart(2, '0');
        return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }

    async function tickScope() {
        try {
            const res = await window.API.get('/api/activity/tail' + (scopePosition ? '?position=' + scopePosition : ''));
            const events = (res && res.events) || (res && res.lines) || [];
            if (Array.isArray(events) && events.length) {
                events.forEach((e) => scopeBuffer.unshift(typeof e === 'string' ? { message: e } : e));
                while (scopeBuffer.length > 20) scopeBuffer.pop();
                scopePosition = (res && res.position) || (scopePosition + events.length);
                renderScope();
            }
        } catch (err) {
            // /api/activity/tail may not be available — fall back to idle silently.
        }
    }

    function startScope() {
        if (scopeTimer) clearInterval(scopeTimer);
        tickScope();
        scopeTimer = setInterval(tickScope, 2000);
    }

    function init() {
        wireActions();
        window.Store.subscribe('state', render);
        window.Store.subscribe('info', render);
        window.Store.subscribe('processes', renderActive);
        window.Store.subscribe('git', renderIdentity);
        render();
        startScope();
        renderScope();
    }

    window.Overview = { init, render };
})();
