/* DOTBOT Dashboard - Workflows section
 * Renders registered workflows as cards. Each card shows task counts, status,
 * agents, and offers a RUN action that hits POST /api/workflows/{name}/run.
 */
(function () {
    'use strict';

    let filter = '';

    function fetchWorkflows() {
        return window.API.workflowsInstalled()
            .then((res) => {
                const arr = (res && res.workflows) || [];
                window.Store.set('workflows', arr);
                document.getElementById('badge-workflows').textContent = String(arr.length);
                return arr;
            })
            .catch((err) => {
                console.warn('workflows load:', err);
                return [];
            });
    }

    function render() {
        const root = document.getElementById('workflows-grid');
        if (!root) return;
        const all = window.Store.get('workflows') || [];
        const list = filter
            ? all.filter((w) => (w.name || '').toLowerCase().includes(filter.toLowerCase()) ||
                                (w.description || '').toLowerCase().includes(filter.toLowerCase()))
            : all;

        if (list.length === 0) {
            root.innerHTML = '<div class="empty-state">' +
                (all.length === 0 ? 'No workflows registered. Add one with: <code>dotbot workflow add &lt;name&gt;</code>' : 'No workflows match filter') +
                '</div>';
            return;
        }

        root.innerHTML = '';
        list.forEach((wf) => root.appendChild(card(wf)));
    }

    function card(wf) {
        const c = document.createElement('div');
        c.className = 'workflow-card';

        // Head
        const head = document.createElement('div');
        head.className = 'workflow-card-head';
        head.innerHTML =
            '<span class="workflow-card-glyph">' + (wf.icon ? glyphFor(wf.icon) : '◆') + '</span>' +
            '<span class="workflow-card-name">' + window.UI.escapeHtml(wf.name || '--') + '</span>' +
            (wf.has_running_process
                ? '<span class="badge" data-status="running">RUNNING</span>'
                : '<span class="badge" data-status="idle">' + window.UI.escapeHtml(wf.status || 'IDLE') + '</span>');
        c.appendChild(head);

        // Body
        const body = document.createElement('div');
        body.className = 'workflow-card-body';

        const desc = document.createElement('div');
        desc.className = 'workflow-card-desc';
        desc.textContent = wf.description || '';
        body.appendChild(desc);

        const meta = document.createElement('div');
        meta.className = 'workflow-card-meta';
        meta.innerHTML =
            '<span class="badge" data-type="info">' + window.UI.escapeHtml(wf.source || 'framework') + '</span>' +
            (Array.isArray(wf.agents) && wf.agents.length
                ? '<span class="badge" data-type="tertiary">' + wf.agents.length + ' agent' + (wf.agents.length === 1 ? '' : 's') + '</span>'
                : '') +
            (Array.isArray(wf.tools) && wf.tools.length
                ? '<span class="badge" data-type="muted">' + wf.tools.length + ' tool' + (wf.tools.length === 1 ? '' : 's') + '</span>'
                : '') +
            (Array.isArray(wf.tags) && wf.tags.length
                ? wf.tags.slice(0, 3).map((t) => '<span class="tag">' + window.UI.escapeHtml(t) + '</span>').join('')
                : '');
        body.appendChild(meta);

        // Stats
        const stats = wf.tasks || { total: 0, done: 0, in_progress: 0, todo: 0 };
        const sg = document.createElement('div');
        sg.className = 'workflow-card-stats';
        sg.innerHTML =
            '<div class="workflow-card-stat" data-status="todo"><span class="workflow-card-stat-value">' + (stats.todo || 0) + '</span><span class="workflow-card-stat-label">TODO</span></div>' +
            '<div class="workflow-card-stat" data-status="in-progress"><span class="workflow-card-stat-value">' + (stats.in_progress || 0) + '</span><span class="workflow-card-stat-label">ACTIVE</span></div>' +
            '<div class="workflow-card-stat" data-status="done"><span class="workflow-card-stat-value">' + (stats.done || 0) + '</span><span class="workflow-card-stat-label">DONE</span></div>' +
            '<div class="workflow-card-stat"><span class="workflow-card-stat-value">' + (stats.total || 0) + '</span><span class="workflow-card-stat-label">TOTAL</span></div>';
        body.appendChild(sg);

        c.appendChild(body);

        // Foot
        const foot = document.createElement('div');
        foot.className = 'workflow-card-foot';
        foot.innerHTML =
            '<span class="workflow-card-version">v' + window.UI.escapeHtml(wf.version || '?') + '</span>' +
            '<div class="workflow-card-actions"></div>';
        const actions = foot.querySelector('.workflow-card-actions');

        const detailBtn = document.createElement('button');
        detailBtn.className = 'ctrl-btn-xs';
        detailBtn.textContent = 'DETAIL';
        detailBtn.addEventListener('click', () => showDetail(wf));
        actions.appendChild(detailBtn);

        if (wf.has_running_process) {
            const stopBtn = document.createElement('button');
            stopBtn.className = 'ctrl-btn-xs danger';
            stopBtn.textContent = 'STOP';
            stopBtn.addEventListener('click', () => stopWorkflow(wf));
            actions.appendChild(stopBtn);
        } else {
            const runBtn = document.createElement('button');
            runBtn.className = 'ctrl-btn-xs primary';
            runBtn.textContent = '▶ RUN';
            runBtn.addEventListener('click', () => runWorkflow(wf));
            actions.appendChild(runBtn);
        }
        c.appendChild(foot);

        return c;
    }

    function glyphFor(icon) {
        const map = {
            'search': '◎',
            'pull-request': '⎇',
            'document': '◫',
            'code': '◆',
            'test': '◇',
            'rocket': '▲',
        };
        return map[icon] || '◆';
    }

    function showDetail(wf) {
        const body = document.createElement('div');
        const grid = document.createElement('div');
        grid.className = 'kv-grid';
        grid.style.cssText = 'grid-template-columns: 130px 1fr; gap: 6px 16px;';
        const pairs = [
            ['NAME', wf.name],
            ['VERSION', wf.version],
            ['SOURCE', wf.source],
            ['DESCRIPTION', wf.description],
            ['AGENTS', Array.isArray(wf.agents) ? wf.agents.join(', ') : '--'],
            ['SKILLS', Array.isArray(wf.skills) ? wf.skills.join(', ') : '--'],
            ['TOOLS', Array.isArray(wf.tools) ? wf.tools.join(', ') : '--'],
            ['TAGS', Array.isArray(wf.tags) ? wf.tags.join(', ') : '--'],
            ['CATEGORIES', Array.isArray(wf.categories) ? wf.categories.join(', ') : '--'],
            ['LICENSE', wf.license || '--'],
            ['HOMEPAGE', wf.homepage || '--'],
            ['REPOSITORY', wf.repository || '--'],
            ['RERUN MODE', wf.rerun || '--'],
            ['TASK TOTAL', String((wf.tasks && wf.tasks.total) || 0)],
        ];
        for (const [k, v] of pairs) {
            const dt = document.createElement('div');
            dt.className = 'kv-key';
            dt.textContent = k;
            const dd = document.createElement('div');
            dd.className = 'kv-val';
            dd.textContent = v || '--';
            grid.appendChild(dt);
            grid.appendChild(dd);
        }
        body.appendChild(grid);

        const runBtn = window.UI.el('button', { class: 'ctrl-btn primary' }, '▶ RUN WORKFLOW');
        const closeBtn = window.UI.el('button', { class: 'ctrl-btn' }, 'CLOSE');
        const m = window.UI.modal({
            title: 'WORKFLOW DETAIL ' + (wf.name || ''),
            body,
            wide: true,
            footer: [closeBtn, runBtn],
        });
        runBtn.addEventListener('click', () => { m.close(); runWorkflow(wf); });
        closeBtn.addEventListener('click', () => m.close());
    }

    function runWorkflow(wf) {
        // Build a launch dialog
        const textarea = window.UI.el('textarea', {
            class: 'textarea',
            placeholder: 'Describe what this run should do, attach context, prompts, etc.',
            rows: 5,
        });
        const interview = window.UI.el('input', { type: 'checkbox' });
        const autoExec = window.UI.el('input', { type: 'checkbox', checked: 'checked' });

        const body = window.UI.el('div', null, [
            window.UI.el('label', { class: 'label' }, 'WORKFLOW: ' + (wf.name || '--')),
            window.UI.el('div', { class: 'hint', style: { marginBottom: '12px' } }, wf.description || ''),
            window.UI.el('label', { class: 'label' }, 'PROMPT'),
            textarea,
            window.UI.el('div', { class: 'hint', style: { marginTop: '4px', marginBottom: '12px' } }, 'Optional — the workflow may ignore this if not used.'),
            window.UI.el('label', { class: 'label', style: { display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' } }, [
                interview,
                window.UI.el('span', null, 'Interview me to clarify requirements'),
            ]),
            window.UI.el('label', { class: 'label', style: { display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer', marginTop: '6px' } }, [
                autoExec,
                window.UI.el('span', null, 'Auto-execute generated tasks'),
            ]),
        ]);

        const cancel = window.UI.el('button', { class: 'ctrl-btn' }, 'CANCEL');
        const launch = window.UI.el('button', { class: 'ctrl-btn primary' }, '▶ LAUNCH');

        const m = window.UI.modal({
            title: 'RUN WORKFLOW: ' + (wf.name || ''),
            body,
            wide: true,
            footer: [cancel, launch],
        });
        cancel.addEventListener('click', () => m.close());
        launch.addEventListener('click', async () => {
            launch.disabled = true;
            launch.textContent = 'LAUNCHING...';
            try {
                await window.API.workflowRun(wf.name, {
                    prompt: textarea.value,
                    interview: interview.checked,
                    auto_workflow: autoExec.checked,
                });
                m.close();
                window.UI.toast('Workflow ' + wf.name + ' launched', 'success');
                fetchWorkflows();
                if (window.Processes && window.Processes.fetch) window.Processes.fetch();
            } catch (err) {
                window.UI.toast('Launch failed: ' + err.message, 'error');
                launch.disabled = false;
                launch.textContent = '▶ LAUNCH';
            }
        });
    }

    async function stopWorkflow(wf) {
        window.UI.confirmDialog('Stop running processes for workflow ' + wf.name + '?', async () => {
            try {
                await window.API.workflowStop(wf.name);
                window.UI.toast('Stop signal sent', 'success');
                fetchWorkflows();
                if (window.Processes && window.Processes.fetch) window.Processes.fetch();
            } catch (err) {
                window.UI.toast('Stop failed: ' + err.message, 'error');
            }
        }, { danger: true, confirmLabel: 'STOP' });
    }

    function init() {
        const search = document.getElementById('workflows-search');
        if (search) search.addEventListener('input', (e) => {
            filter = e.target.value || '';
            render();
        });
        window.Store.subscribe('workflows', render);
        fetchWorkflows().then(render);
    }

    window.Workflows = { init, render, fetch: fetchWorkflows };
})();
