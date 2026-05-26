/* DOTBOT Dashboard - Tasks section
 * Renders tasks as a 4-column board: TODO / ACTIVE / NEEDS-INPUT / DONE.
 * Supports workflow filter, status filter, and "+ NEW TASK" creation.
 */
(function () {
    'use strict';

    let statusFilter = 'all';
    let workflowFilter = '';

    const COLUMNS = [
        { id: 'todo',        title: 'TODO',        status: 'todo' },
        { id: 'in-progress', title: 'ACTIVE',      status: 'in-progress' },
        { id: 'needs-input', title: 'NEEDS INPUT', status: 'todo' },
        { id: 'done',        title: 'DONE',        status: 'done' },
    ];

    function tasksFromState() {
        const s = (window.Store.get('state') || {}).tasks || {};
        return {
            todo: s.upcoming || [],
            in_progress: combineList(s.current ? [s.current] : [], s.analysing_list || []),
            needs_input: s.needs_input_list || [],
            analysed: s.analysed_list || [],
            done: s.recent_completed || [],
            skipped: s.skipped_list || [],
        };
    }

    function combineList() {
        const out = [];
        for (const arr of arguments) if (Array.isArray(arr)) for (const x of arr) if (x) out.push(x);
        return out;
    }

    function matchWorkflow(t) {
        if (!workflowFilter) return true;
        return (t.workflow || '') === workflowFilter;
    }

    function render() {
        const root = document.getElementById('tasks-board');
        if (!root) return;
        const buckets = tasksFromState();
        const total =
            (buckets.todo.length + buckets.in_progress.length + buckets.needs_input.length + buckets.done.length);
        document.getElementById('badge-tasks').textContent = String(total);

        root.innerHTML = '';
        const map = {
            'todo': buckets.todo.filter(matchWorkflow),
            'in-progress': buckets.in_progress.filter(matchWorkflow),
            'needs-input': buckets.needs_input.filter(matchWorkflow),
            'done': buckets.done.filter(matchWorkflow),
        };
        const showAll = statusFilter === 'all';

        COLUMNS.forEach((col) => {
            if (!showAll && col.id !== statusFilter) return;
            root.appendChild(column(col, map[col.id] || []));
        });

        updateWorkflowOptions();
    }

    function column(col, items) {
        const c = document.createElement('div');
        c.className = 'tasks-column';
        c.setAttribute('data-status', col.status);
        c.style.setProperty('--status-color',
            col.id === 'done' ? 'var(--color-success)' :
            col.id === 'in-progress' ? 'var(--color-secondary)' :
            'var(--color-primary)');
        c.style.setProperty('--status-glow',
            col.id === 'done' ? 'var(--success-glow)' :
            col.id === 'in-progress' ? 'var(--secondary-glow)' :
            'var(--primary-glow)');

        const head = document.createElement('div');
        head.className = 'tasks-column-head';
        head.innerHTML =
            '<span class="tasks-column-title">' + col.title + '</span>' +
            '<span class="tasks-column-count">' + items.length + '</span>';
        c.appendChild(head);

        const body = document.createElement('div');
        body.className = 'tasks-column-body';
        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.style.cssText = 'padding: 16px; font-size: 9px;';
            empty.textContent = '(empty)';
            body.appendChild(empty);
        } else {
            items.forEach((t) => body.appendChild(card(t, col)));
        }
        c.appendChild(body);
        return c;
    }

    function card(t, col) {
        const c = document.createElement('div');
        c.className = 'task-card';
        c.setAttribute('data-status', col.status);
        c.style.setProperty('--status-color',
            col.id === 'done' ? 'var(--color-success)' :
            col.id === 'in-progress' ? 'var(--color-secondary)' :
            col.id === 'needs-input' ? 'var(--color-warning)' :
            'var(--color-primary)');

        const title = document.createElement('div');
        title.className = 'task-card-title';
        title.textContent = t.name || t.title || '(unnamed)';
        c.appendChild(title);

        const id = document.createElement('div');
        id.className = 'task-card-id';
        id.textContent = String(t.id || '').slice(0, 8);
        c.appendChild(id);

        const meta = document.createElement('div');
        meta.className = 'task-card-meta';
        if (t.workflow) meta.innerHTML += '<span class="badge" data-type="tertiary">' + window.UI.escapeHtml(t.workflow) + '</span>';
        else meta.innerHTML += '<span class="badge" data-type="muted">STANDALONE</span>';
        if (t.effort) meta.innerHTML += '<span class="badge" data-type="info">' + window.UI.escapeHtml(String(t.effort)) + '</span>';
        if (t.priority) meta.innerHTML += '<span class="badge" data-type="muted">P' + window.UI.escapeHtml(String(t.priority)) + '</span>';
        c.appendChild(meta);

        c.addEventListener('click', () => openDetail(t));
        return c;
    }

    function openDetail(t) {
        const body = window.UI.el('div', null, [
            window.UI.el('div', { class: 'kv-grid', style: { 'grid-template-columns': '120px 1fr', gap: '6px 14px' } }, [
                window.UI.el('div', { class: 'kv-key' }, 'ID'),
                window.UI.el('div', { class: 'kv-val', 'data-type': 'muted' }, String(t.id || '--')),
                window.UI.el('div', { class: 'kv-key' }, 'STATUS'),
                window.UI.el('div', { class: 'kv-val' }, String(t.status || '--').toUpperCase()),
                window.UI.el('div', { class: 'kv-key' }, 'WORKFLOW'),
                window.UI.el('div', { class: 'kv-val', 'data-type': 'secondary' }, t.workflow || 'standalone'),
                window.UI.el('div', { class: 'kv-key' }, 'EFFORT'),
                window.UI.el('div', { class: 'kv-val' }, t.effort || '--'),
                window.UI.el('div', { class: 'kv-key' }, 'PRIORITY'),
                window.UI.el('div', { class: 'kv-val' }, t.priority != null ? String(t.priority) : '--'),
            ]),
            window.UI.el('div', { style: { 'margin-top': '14px', 'padding-top': '12px', 'border-top': '1px dashed var(--bezel-edge)' } }, [
                window.UI.el('div', { class: 'kv-key', style: { 'margin-bottom': '6px' } }, 'DESCRIPTION'),
                window.UI.el('div', { class: 'kv-val', style: { 'white-space': 'pre-wrap', 'line-height': '1.5' } }, t.description || '(none)'),
            ]),
        ]);

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
            window.UI.el('div', { class: 'hint', style: { marginTop: '4px' } }, 'You can include constraints, acceptance criteria, or specific files to look at.'),
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

    function updateWorkflowOptions() {
        const sel = document.getElementById('tasks-workflow-filter');
        if (!sel) return;
        const wfs = window.Store.get('workflows') || [];
        const names = new Set(wfs.map((w) => w.name));
        // Also include workflows referenced by tasks
        const state = window.Store.get('state') || {};
        for (const list of [state.tasks ? state.tasks.upcoming : [], state.tasks ? state.tasks.recent_completed : []]) {
            (list || []).forEach((t) => { if (t && t.workflow) names.add(t.workflow); });
        }
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

    function wireFilters() {
        document.querySelectorAll('[data-tfilter]').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-tfilter]').forEach((b) => b.classList.toggle('active', b === btn));
                statusFilter = btn.getAttribute('data-tfilter');
                render();
            });
        });
        const sel = document.getElementById('tasks-workflow-filter');
        if (sel) sel.addEventListener('change', (e) => {
            workflowFilter = e.target.value || '';
            render();
        });
        const newBtn = document.getElementById('tasks-new-btn');
        if (newBtn) newBtn.addEventListener('click', openCreateModal);
    }

    function init() {
        wireFilters();
        window.Store.subscribe('state', render);
        window.Store.subscribe('workflows', updateWorkflowOptions);
        render();
    }

    window.Tasks = { init, render, openCreateModal };
})();
