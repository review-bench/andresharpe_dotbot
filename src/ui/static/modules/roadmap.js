/* DOTBOT Dashboard - Roadmap section
 * Kanban pipeline TODO → WORKING → NEEDS-INPUT → DONE with flow arrows.
 * Filterable by workflow, with deleted-archive and new-task actions.
 *
 * Data source: /api/state (tasks.upcoming / tasks.analysing_list / tasks.current /
 *                          tasks.needs_input_list / tasks.recent_completed).
 */
(function () {
    'use strict';

    let workflowFilter = '';

    const STAGES = [
        { id: 'todo',        label: '◇ TODO',          status: 'todo',        getList: keepTodo },
        { id: 'working',     label: '◈ WORKING',       status: 'in-progress', getList: keepWorking, highlight: true },
        { id: 'needs-input', label: '⚡ NEEDS INPUT',  status: 'needs-input', getList: keepNeedsInput },
        { id: 'done',        label: '✓ DONE',          status: 'done',        getList: keepDone },
    ];

    function buckets() {
        const s = (window.Store.get('state') || {}).tasks || {};
        return {
            upcoming:    s.upcoming || [],
            analysing:   s.analysing_list || [],
            current:     s.current,
            needs_input: s.needs_input_list || [],
            recent_done: s.recent_completed || [],
        };
    }

    function keepTodo() {
        return buckets().upcoming;
    }

    function keepWorking() {
        const b = buckets();
        const out = [];
        if (b.current) out.push(b.current);
        for (const t of b.analysing) if (t) out.push(t);
        return out;
    }

    function keepNeedsInput() {
        return buckets().needs_input;
    }

    function keepDone() {
        return buckets().recent_done;
    }

    function applyFilter(items) {
        if (!workflowFilter) return items;
        return items.filter((t) => (t && (t.workflow || '')) === workflowFilter);
    }

    function render() {
        const root = document.getElementById('roadmap-pipeline');
        if (!root) return;

        const allStages = STAGES.map((stage) => ({
            stage,
            items: applyFilter(stage.getList()),
        }));

        const total = allStages.reduce((acc, s) => acc + s.items.length, 0);
        const badge = document.getElementById('badge-roadmap');
        if (badge) badge.textContent = String(total);

        root.innerHTML = '';
        allStages.forEach(({ stage, items }, i) => {
            root.appendChild(column(stage, items));
            if (i < allStages.length - 1) {
                const arrow = document.createElement('div');
                arrow.className = 'flow-arrow';
                arrow.textContent = '→';
                root.appendChild(arrow);
            }
        });

        refreshWorkflowOptions();
    }

    function column(stage, items) {
        const c = document.createElement('div');
        c.className = 'pipeline-column' + (stage.highlight ? ' highlight' : '');
        c.setAttribute('data-status', stage.status);
        c.style.setProperty('--status-color',
            stage.id === 'done' ? 'var(--color-success)' :
            stage.id === 'working' ? 'var(--color-secondary)' :
            stage.id === 'needs-input' ? 'var(--color-warning)' :
            'var(--color-primary)');
        c.style.setProperty('--status-glow',
            stage.id === 'done' ? 'var(--success-glow)' :
            stage.id === 'working' ? 'var(--secondary-glow)' :
            'var(--primary-glow)');

        const head = document.createElement('div');
        head.className = 'column-header';
        head.innerHTML =
            '<span class="column-label">' + stage.label + '</span>' +
            '<span class="column-count">' + items.length + '</span>';
        c.appendChild(head);

        const body = document.createElement('div');
        body.className = 'column-items';
        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.style.cssText = 'padding: 14px 8px; font-size: 9px;';
            empty.textContent = '(empty)';
            body.appendChild(empty);
        } else {
            items.forEach((t) => body.appendChild(taskCard(t, stage)));
        }
        c.appendChild(body);
        return c;
    }

    function taskCard(t, stage) {
        const c = document.createElement('div');
        c.className = 'pipeline-task';
        if (t.priority != null) {
            if (Number(t.priority) <= 3) c.classList.add('priority-high');
            else if (Number(t.priority) <= 6) c.classList.add('priority-med');
            else c.classList.add('priority-low');
        }
        if (stage.id === 'working') c.classList.add('active');

        // ID line
        const idLine = document.createElement('div');
        idLine.className = 'task-id';
        idLine.textContent = String(t.id || '').slice(0, 12);
        c.appendChild(idLine);

        // Title
        const title = document.createElement('div');
        title.className = 'task-title';
        title.textContent = t.name || t.title || '(unnamed task)';
        c.appendChild(title);

        // Tags
        const tags = document.createElement('div');
        tags.className = 'task-tags';
        if (t.workflow) tags.innerHTML += '<span class="task-tag">' + window.UI.escapeHtml(t.workflow) + '</span>';
        if (t.category) tags.innerHTML += '<span class="task-tag">' + window.UI.escapeHtml(String(t.category)) + '</span>';
        if (t.effort) tags.innerHTML += '<span class="task-tag">' + window.UI.escapeHtml(String(t.effort)) + '</span>';
        if (t.priority != null) tags.innerHTML += '<span class="task-tag">P' + window.UI.escapeHtml(String(t.priority)) + '</span>';
        if (Array.isArray(t.dependencies) && t.dependencies.length) {
            tags.innerHTML += '<span class="task-tag" title="' + window.UI.escapeHtml(t.dependencies.join(', ')) + '">' + t.dependencies.length + ' dep' + (t.dependencies.length === 1 ? '' : 's') + '</span>';
        }
        if (tags.children.length) c.appendChild(tags);

        // Completion date for done stage
        if (stage.id === 'done' && t.completed_at) {
            const ts = document.createElement('span');
            ts.className = 'completed-date';
            ts.textContent = window.UI.fmtRelative(t.completed_at);
            c.appendChild(ts);
        }

        c.addEventListener('click', () => openTaskModal(t));
        return c;
    }

    function openTaskModal(t) {
        const body = window.UI.el('div', null, [
            window.UI.el('div', { class: 'kv-grid', style: { 'grid-template-columns': '130px 1fr', gap: '6px 14px' } }, [
                window.UI.el('div', { class: 'kv-key' }, 'ID'),
                window.UI.el('div', { class: 'kv-val', 'data-type': 'muted' }, String(t.id || '--')),
                window.UI.el('div', { class: 'kv-key' }, 'STATUS'),
                window.UI.el('div', { class: 'kv-val' }, String(t.status || '--').toUpperCase()),
                window.UI.el('div', { class: 'kv-key' }, 'WORKFLOW'),
                window.UI.el('div', { class: 'kv-val', 'data-type': 'secondary' }, t.workflow || 'standalone'),
                window.UI.el('div', { class: 'kv-key' }, 'CATEGORY'),
                window.UI.el('div', { class: 'kv-val' }, t.category || '--'),
                window.UI.el('div', { class: 'kv-key' }, 'EFFORT'),
                window.UI.el('div', { class: 'kv-val' }, t.effort || '--'),
                window.UI.el('div', { class: 'kv-key' }, 'PRIORITY'),
                window.UI.el('div', { class: 'kv-val' }, t.priority != null ? String(t.priority) : '--'),
                window.UI.el('div', { class: 'kv-key' }, 'DEPENDENCIES'),
                window.UI.el('div', { class: 'kv-val' }, Array.isArray(t.dependencies) && t.dependencies.length ? t.dependencies.join(', ') : '--'),
                window.UI.el('div', { class: 'kv-key' }, 'CREATED'),
                window.UI.el('div', { class: 'kv-val', 'data-type': 'muted' }, window.UI.fmtRelative(t.created_at)),
                t.completed_at ? window.UI.el('div', { class: 'kv-key' }, 'COMPLETED') : null,
                t.completed_at ? window.UI.el('div', { class: 'kv-val', 'data-type': 'success' }, window.UI.fmtRelative(t.completed_at)) : null,
            ].filter(Boolean)),
            window.UI.el('div', { style: { 'margin-top': '14px', 'padding-top': '12px', 'border-top': '1px dashed var(--bezel-edge)' } }, [
                window.UI.el('div', { class: 'kv-key', style: { 'margin-bottom': '6px' } }, 'DESCRIPTION'),
                window.UI.el('div', { class: 'kv-val', style: { 'white-space': 'pre-wrap', 'line-height': '1.5' } }, t.description || '(none)'),
            ]),
            Array.isArray(t.steps) && t.steps.length ? window.UI.el('div', { style: { 'margin-top': '14px', 'padding-top': '12px', 'border-top': '1px dashed var(--bezel-edge)' } }, [
                window.UI.el('div', { class: 'kv-key', style: { 'margin-bottom': '6px' } }, 'STEPS'),
                window.UI.el('ol', { style: { 'padding-left': '20px', 'font-size': '11px', 'line-height': '1.55' } },
                    t.steps.map((s) => window.UI.el('li', { style: { 'margin-bottom': '4px' } }, String(s)))
                ),
            ]) : null,
        ].filter(Boolean));

        const close = window.UI.el('button', { class: 'ctrl-btn' }, 'CLOSE');
        const m = window.UI.modal({
            title: 'TASK ' + (t.name || t.id || ''),
            body,
            wide: true,
            footer: [close],
        });
        close.addEventListener('click', () => m.close());
    }

    function openCreateModal() {
        const textarea = window.UI.el('textarea', {
            class: 'textarea',
            rows: 6,
            placeholder: 'Describe what you want to accomplish. Dotbot will analyse it and create a structured task.',
        });
        const interview = window.UI.el('input', { type: 'checkbox' });

        const body = window.UI.el('div', null, [
            window.UI.el('label', { class: 'label' }, 'PROMPT'),
            textarea,
            window.UI.el('div', { class: 'hint', style: { marginTop: '4px' } }, 'Include constraints, acceptance criteria, or specific files to look at.'),
            window.UI.el('label', { class: 'label', style: { display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer', marginTop: '12px' } }, [
                interview,
                window.UI.el('span', null, 'Interview me to clarify requirements'),
            ]),
        ]);

        const cancel = window.UI.el('button', { class: 'ctrl-btn' }, 'CANCEL');
        const create = window.UI.el('button', { class: 'ctrl-btn primary' }, 'CREATE TASK');
        const m = window.UI.modal({
            title: 'CREATE NEW TASK',
            body,
            wide: true,
            footer: [cancel, create],
        });
        cancel.addEventListener('click', () => m.close());
        create.addEventListener('click', async () => {
            create.disabled = true;
            create.textContent = 'CREATING...';
            try {
                await window.API.taskCreate({
                    prompt: textarea.value,
                    interview: interview.checked,
                });
                m.close();
                window.UI.toast('Task creation started', 'success');
            } catch (err) {
                window.UI.toast('Create failed: ' + err.message, 'error');
                create.disabled = false;
                create.textContent = 'CREATE TASK';
            }
        });
    }

    function openDeletedModal() {
        const body = window.UI.el('div', null, [
            window.UI.el('div', { class: 'loading-state' }, 'Loading deleted tasks...'),
        ]);
        const close = window.UI.el('button', { class: 'ctrl-btn' }, 'CLOSE');
        const m = window.UI.modal({
            title: 'DELETED TASK ARCHIVE',
            body,
            wide: true,
            footer: [close],
        });
        close.addEventListener('click', () => m.close());

        window.API.get('/api/task/deleted')
            .then((res) => {
                const items = (res && res.items) || (res && res.tasks) || [];
                body.innerHTML = '';
                if (items.length === 0) {
                    body.innerHTML = '<div class="empty-state">No deleted tasks.</div>';
                    return;
                }
                items.forEach((t) => {
                    const row = document.createElement('div');
                    row.className = 'data-row';
                    row.style.setProperty('--status-color', 'var(--color-muted)');
                    row.innerHTML =
                        '<span class="data-row-id">' + window.UI.escapeHtml(String(t.id || '').slice(0, 8)) + '</span>' +
                        '<span class="data-row-title">' + window.UI.escapeHtml(t.name || t.title || '(unnamed)') + '</span>' +
                        '<span class="data-row-meta">' +
                            '<span class="badge" data-type="muted">' + window.UI.fmtRelative(t.deleted_at || t.updated_at) + '</span>' +
                        '</span>';
                    body.appendChild(row);
                });
            })
            .catch((err) => {
                body.innerHTML = '<div class="empty-state">Failed to load: ' + window.UI.escapeHtml(err.message) + '</div>';
            });
    }

    function refreshWorkflowOptions() {
        const sel = document.getElementById('roadmap-workflow-filter');
        if (!sel) return;
        const names = new Set();
        const wfs = window.Store.get('workflows') || [];
        wfs.forEach((w) => names.add(w.name));
        const state = window.Store.get('state') || {};
        const tasks = state.tasks || {};
        ['upcoming', 'analysing_list', 'needs_input_list', 'recent_completed'].forEach((bucket) => {
            (tasks[bucket] || []).forEach((t) => { if (t && t.workflow) names.add(t.workflow); });
        });
        if (tasks.current && tasks.current.workflow) names.add(tasks.current.workflow);

        const current = sel.value;
        sel.innerHTML = '<option value="">ALL WORKFLOWS</option>';
        Array.from(names).sort().forEach((n) => {
            const opt = document.createElement('option');
            opt.value = n;
            opt.textContent = n.toUpperCase();
            sel.appendChild(opt);
        });
        sel.value = current || '';
    }

    function wireControls() {
        const sel = document.getElementById('roadmap-workflow-filter');
        if (sel) sel.addEventListener('change', (e) => {
            workflowFilter = e.target.value || '';
            render();
        });
        const newBtn = document.getElementById('roadmap-new-btn');
        if (newBtn) newBtn.addEventListener('click', openCreateModal);
        const delBtn = document.getElementById('roadmap-deleted-btn');
        if (delBtn) delBtn.addEventListener('click', openDeletedModal);
    }

    function init() {
        wireControls();
        window.Store.subscribe('state', render);
        window.Store.subscribe('workflows', refreshWorkflowOptions);
        render();
    }

    window.Roadmap = { init, render, openCreateModal };
})();
