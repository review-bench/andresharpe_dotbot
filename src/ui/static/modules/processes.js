/* DOTBOT Dashboard - Processes section
 * Lists runtime processes. Each row can expand to show details and live log tail.
 */
(function () {
    'use strict';

    let filter = 'all';
    let expandedId = null;
    let tailInterval = null;
    let tailPosition = 0;

    async function fetchProcesses() {
        try {
            const res = await window.API.processList();
            const list = (res && res.processes) || [];
            window.Store.set('processes', list);
            document.getElementById('badge-processes').textContent = String(list.length);
            return list;
        } catch (err) {
            console.warn('processes load:', err);
            return [];
        }
    }

    function matchesFilter(p) {
        if (filter === 'all') return true;
        const s = (p.status || '').toLowerCase();
        if (filter === 'running') return s === 'running' || s === 'starting' || s === 'stopping';
        if (filter === 'completed') return s === 'completed' || s === 'done' || s === 'finished';
        if (filter === 'failed') return s === 'failed' || s === 'killed' || s === 'error';
        return true;
    }

    function render() {
        const root = document.getElementById('processes-list');
        if (!root) return;

        const all = window.Store.get('processes') || [];
        const list = all.filter(matchesFilter);

        if (list.length === 0) {
            root.innerHTML = '<div class="empty-state">' +
                (all.length === 0 ? 'No processes have run on this runtime yet.' : 'No processes match filter') +
                '</div>';
            return;
        }

        root.innerHTML = '';
        list.forEach((p) => root.appendChild(row(p)));
    }

    function row(p) {
        const r = document.createElement('div');
        r.className = 'process-row';
        r.setAttribute('data-status', p.status || 'unknown');
        r.setAttribute('data-pid', p.id);

        const led = document.createElement('span');
        led.className = 'process-row-led';

        const main = document.createElement('div');
        main.className = 'process-row-main';
        main.innerHTML =
            '<div class="process-row-title">' + window.UI.escapeHtml(p.description || p.type || 'process') + '</div>' +
            '<div class="process-row-sub">' + window.UI.escapeHtml(p.id || '') + (p.workflow_name ? ' · ' + window.UI.escapeHtml(p.workflow_name) : '') + '</div>';

        const meta = document.createElement('div');
        meta.className = 'process-row-meta';
        meta.innerHTML =
            '<span class="badge" data-type="muted">' + window.UI.escapeHtml(p.type || 'process') + '</span>' +
            '<span class="badge" data-status="' + (p.status || 'idle') + '">' + window.UI.escapeHtml(p.status || 'IDLE') + '</span>';

        const pid = document.createElement('span');
        pid.className = 'process-row-pid';
        pid.textContent = p.pid ? 'PID ' + p.pid : '—';

        const actions = document.createElement('div');
        actions.className = 'process-row-actions';
        if (p.status === 'running' || p.status === 'starting') {
            const stopBtn = document.createElement('button');
            stopBtn.className = 'ctrl-btn-xs';
            stopBtn.textContent = 'STOP';
            stopBtn.addEventListener('click', (e) => { e.stopPropagation(); stopProcess(p); });
            actions.appendChild(stopBtn);

            const killBtn = document.createElement('button');
            killBtn.className = 'ctrl-btn-xs danger';
            killBtn.textContent = 'KILL';
            killBtn.addEventListener('click', (e) => { e.stopPropagation(); killProcess(p); });
            actions.appendChild(killBtn);
        }

        r.appendChild(led);
        r.appendChild(main);
        r.appendChild(meta);
        r.appendChild(pid);
        r.appendChild(actions);

        r.addEventListener('click', () => toggleExpand(p, r));

        if (p.id === expandedId) {
            r.classList.add('expanded');
            appendDetail(r, p);
        }

        return r;
    }

    function toggleExpand(p, rowEl) {
        if (expandedId === p.id) {
            stopTail();
            expandedId = null;
            render();
            return;
        }
        expandedId = p.id;
        render();
        if (p.status === 'running' || p.status === 'starting') startTail(p);
    }

    function appendDetail(rowEl, p) {
        const detail = document.createElement('div');
        detail.className = 'process-row-detail';

        const meta = document.createElement('div');
        meta.className = 'kv-grid';
        meta.style.cssText = 'grid-template-columns: 100px 1fr; gap: 4px 12px; font-size: 10px;';
        const pairs = [
            ['ID', p.id],
            ['TYPE', p.type],
            ['STATUS', p.status],
            ['PID', p.pid],
            ['STARTED', window.UI.fmtRelative(p.started_at)],
            ['SLOT', p.slot != null ? p.slot : '--'],
            ['MODEL', p.model || '--'],
            ['TASK ID', p.task_id || '--'],
            ['WORKFLOW', p.workflow_name || '--'],
        ];
        for (const [k, v] of pairs) {
            const kd = document.createElement('div');
            kd.className = 'kv-key';
            kd.textContent = k;
            const vd = document.createElement('div');
            vd.className = 'kv-val';
            vd.textContent = (v == null || v === '') ? '--' : String(v);
            meta.appendChild(kd);
            meta.appendChild(vd);
        }

        const logBox = document.createElement('div');
        logBox.className = 'process-row-log';
        logBox.id = 'log-' + p.id;
        logBox.textContent = 'Loading recent activity...';

        detail.appendChild(meta);
        detail.appendChild(logBox);
        rowEl.appendChild(detail);

        tailPosition = 0;
        window.API.processOutput(p.id, 0)
            .then((res) => {
                const lines = (res && res.lines) || (res && res.events) || [];
                tailPosition = (res && res.position) || lines.length;
                logBox.textContent = formatLogLines(lines) || '(no output yet)';
                logBox.scrollTop = logBox.scrollHeight;
            })
            .catch(() => {
                logBox.textContent = '(log unavailable)';
            });
    }

    function formatLogLines(lines) {
        if (!Array.isArray(lines)) return '';
        return lines.map((entry) => {
            if (typeof entry === 'string') return entry;
            if (entry && entry.message) return '[' + (entry.timestamp || '') + '] ' + (entry.level || 'INFO') + ' ' + entry.message;
            if (entry && entry.text) return entry.text;
            try { return JSON.stringify(entry); } catch (e) { return String(entry); }
        }).join('\n');
    }

    function startTail(p) {
        stopTail();
        tailInterval = setInterval(() => {
            window.API.processOutput(p.id, tailPosition)
                .then((res) => {
                    const lines = (res && res.lines) || (res && res.events) || [];
                    if (lines.length === 0) return;
                    tailPosition = (res && res.position) || (tailPosition + lines.length);
                    const box = document.getElementById('log-' + p.id);
                    if (!box) return;
                    const newText = formatLogLines(lines);
                    if (box.textContent === '(no output yet)') box.textContent = '';
                    box.textContent += (box.textContent ? '\n' : '') + newText;
                    box.scrollTop = box.scrollHeight;
                })
                .catch(() => {});
        }, 1500);
    }

    function stopTail() {
        if (tailInterval) clearInterval(tailInterval);
        tailInterval = null;
    }

    async function stopProcess(p) {
        try {
            await window.API.processStop(p.id);
            window.UI.toast('Stop signal sent to ' + p.id, 'success');
            setTimeout(fetchProcesses, 500);
        } catch (err) {
            window.UI.toast('Stop failed: ' + err.message, 'error');
        }
    }

    async function killProcess(p) {
        window.UI.confirmDialog('Force kill process ' + p.id + '?', async () => {
            try {
                await window.API.processKill(p.id);
                window.UI.toast('Kill signal sent', 'success');
                setTimeout(fetchProcesses, 500);
            } catch (err) {
                window.UI.toast('Kill failed: ' + err.message, 'error');
            }
        }, { danger: true, confirmLabel: 'KILL' });
    }

    function wireFilters() {
        document.querySelectorAll('[data-pfilter]').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-pfilter]').forEach((b) => b.classList.toggle('active', b === btn));
                filter = btn.getAttribute('data-pfilter');
                render();
            });
        });
    }

    function init() {
        wireFilters();
        window.Store.subscribe('processes', render);
        fetchProcesses().then(render);
    }

    window.Processes = { init, render, fetch: fetchProcesses };
})();
