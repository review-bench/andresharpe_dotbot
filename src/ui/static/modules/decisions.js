/* DOTBOT Dashboard - Decisions section
 * ADR tracker grouped by status. Create/edit/promote modal.
 * Data: GET /api/decisions, POST /api/decisions, PUT /api/decisions/{id},
 *       POST /api/decisions/{id}/status.
 */
(function () {
    'use strict';

    let filter = 'all';
    const STATUSES = ['proposed', 'accepted', 'deprecated', 'superseded'];

    async function fetchDecisions() {
        try {
            const res = await window.API.get('/api/decisions');
            const arr = (res && res.decisions) || [];
            window.Store.set('decisions', arr);
            const badge = document.getElementById('badge-decisions');
            if (badge) badge.textContent = String(arr.length);
            return arr;
        } catch (err) {
            console.warn('decisions load:', err);
            return [];
        }
    }

    function render() {
        const root = document.getElementById('decisions-list');
        if (!root) return;
        const all = window.Store.get('decisions') || [];
        const list = filter === 'all' ? all : all.filter((d) => (d.status || 'proposed') === filter);

        if (list.length === 0) {
            root.innerHTML = '<div class="empty-state">' +
                (all.length === 0 ? 'No decisions recorded yet. Use + NEW DECISION or run an interview workflow to generate them.' : 'No decisions match filter') +
                '</div>';
            return;
        }

        const groups = {};
        list.forEach((d) => {
            const s = d.status || 'proposed';
            if (!groups[s]) groups[s] = [];
            groups[s].push(d);
        });

        root.innerHTML = '';
        STATUSES.forEach((s) => {
            const items = groups[s];
            if (!items || items.length === 0) return;
            const header = document.createElement('div');
            header.className = 'decision-group-header';
            header.setAttribute('data-status', s);
            header.innerHTML =
                '<span class="decision-group-label">' + s.toUpperCase() + '</span>' +
                '<span class="decision-group-count">' + items.length + '</span>';
            root.appendChild(header);
            items.forEach((d) => root.appendChild(row(d)));
        });
    }

    function row(d) {
        const r = document.createElement('div');
        r.className = 'decision-row';
        r.setAttribute('data-status', d.status || 'proposed');
        r.style.setProperty('--status-color', colorFor(d.status));
        r.style.setProperty('--status-glow', glowFor(d.status));

        const head = document.createElement('div');
        head.className = 'decision-row-head';
        head.innerHTML =
            '<span class="decision-id">' + window.UI.escapeHtml(d.id || '') + '</span>' +
            '<span class="decision-title">' + window.UI.escapeHtml(d.title || '(untitled)') + '</span>' +
            '<span class="decision-meta">' +
                '<span class="badge" data-type="' + impactType(d.impact) + '">' + window.UI.escapeHtml((d.impact || 'medium').toUpperCase()) + '</span>' +
                '<span class="badge" data-type="muted">' + window.UI.escapeHtml(d.type || 'technical') + '</span>' +
                '<span class="badge" data-status="' + (d.status || 'proposed') + '">' + window.UI.escapeHtml((d.status || 'proposed').toUpperCase()) + '</span>' +
            '</span>';

        const body = document.createElement('div');
        body.className = 'decision-row-body';
        body.style.display = 'none';
        body.innerHTML = '<div class="loading-state" style="font-size:10px;padding:8px;">Loading detail...</div>';

        r.appendChild(head);
        r.appendChild(body);

        head.addEventListener('click', async () => {
            if (body.style.display === 'none') {
                body.style.display = 'block';
                r.classList.add('open');
                if (!body.dataset.loaded) {
                    try {
                        const detail = await window.API.get('/api/decisions/' + encodeURIComponent(d.id));
                        body.dataset.loaded = '1';
                        body.innerHTML = detailHtml(detail);
                        wireDetailButtons(body, detail);
                    } catch (err) {
                        body.innerHTML = '<div class="empty-state">Failed: ' + window.UI.escapeHtml(err.message) + '</div>';
                    }
                }
            } else {
                body.style.display = 'none';
                r.classList.remove('open');
            }
        });

        return r;
    }

    function detailHtml(d) {
        const sect = (label, value) => value ? (
            '<div class="decision-section">' +
                '<div class="decision-section-label">' + label + '</div>' +
                '<div class="decision-section-value">' + window.UI.escapeHtml(value) + '</div>' +
            '</div>'
        ) : '';
        const tags = (Array.isArray(d.tags) && d.tags.length)
            ? '<div class="decision-section"><div class="decision-section-label">TAGS</div><div class="tag-list">' +
              d.tags.map((t) => '<span class="tag">' + window.UI.escapeHtml(t) + '</span>').join('') +
              '</div></div>'
            : '';
        const stakeholders = (Array.isArray(d.stakeholders) && d.stakeholders.length)
            ? '<div class="decision-section"><div class="decision-section-label">STAKEHOLDERS</div><div class="decision-section-value">' +
              window.UI.escapeHtml(d.stakeholders.join(', ')) + '</div></div>'
            : '';
        const alternatives = (Array.isArray(d.alternatives_considered) && d.alternatives_considered.length)
            ? '<div class="decision-section"><div class="decision-section-label">ALTERNATIVES CONSIDERED</div>' +
              d.alternatives_considered.map((a) =>
                  '<div class="decision-alt"><strong>' + window.UI.escapeHtml(a.option || '') + ':</strong> ' +
                  window.UI.escapeHtml(a.reason_rejected || '') + '</div>'
              ).join('') +
              '</div>'
            : '';

        const actions =
            '<div class="decision-actions">' +
                '<button class="ctrl-btn-xs" data-action="edit">EDIT</button>' +
                (d.status === 'proposed' ? '<button class="ctrl-btn-xs success" data-action="accept">ACCEPT</button>' : '') +
                (d.status === 'accepted' ? '<button class="ctrl-btn-xs" data-action="deprecate">DEPRECATE</button>' : '') +
            '</div>';

        return (
            sect('CONTEXT', d.context) +
            sect('DECISION', d.decision) +
            sect('CONSEQUENCES', d.consequences) +
            alternatives +
            stakeholders +
            tags +
            sect('DATE', d.date) +
            actions
        );
    }

    function wireDetailButtons(body, detail) {
        body.querySelectorAll('[data-action]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const act = btn.getAttribute('data-action');
                if (act === 'edit') openEditModal(detail);
                else if (act === 'accept') setStatus(detail.id, 'accepted');
                else if (act === 'deprecate') setStatus(detail.id, 'deprecated');
            });
        });
    }

    async function setStatus(id, newStatus) {
        try {
            await window.API.post('/api/decisions/' + encodeURIComponent(id) + '/status', { status: newStatus });
            window.UI.toast('Decision ' + id + ' → ' + newStatus, 'success');
            fetchDecisions().then(render);
        } catch (err) {
            window.UI.toast('Status change failed: ' + err.message, 'error');
        }
    }

    function colorFor(status) {
        return ({
            proposed:   'var(--color-primary)',
            accepted:   'var(--color-success)',
            deprecated: 'var(--color-error)',
            superseded: 'var(--color-muted)',
        }[status] || 'var(--color-primary-dim)');
    }
    function glowFor(status) {
        return ({
            proposed:   'var(--primary-glow)',
            accepted:   'var(--success-glow)',
            deprecated: 'var(--error-glow)',
            superseded: 'transparent',
        }[status] || 'var(--primary-glow)');
    }
    function impactType(impact) {
        return ({ high: 'error', medium: 'warning', low: 'muted' }[impact] || 'muted');
    }

    function openCreateModal() { openForm(null); }
    function openEditModal(decision) { openForm(decision); }

    function openForm(existing) {
        const isEdit = !!existing;
        const titleInp = window.UI.el('input', { class: 'input', type: 'text', value: existing ? existing.title : '' });
        const typeSel = window.UI.el('select', { class: 'select' },
            ['architecture','business','technical','process'].map((t) =>
                window.UI.el('option', { value: t, selected: existing && existing.type === t ? '' : null }, t.toUpperCase())
            )
        );
        const impactSel = window.UI.el('select', { class: 'select' },
            ['high','medium','low'].map((t) =>
                window.UI.el('option', { value: t, selected: existing && existing.impact === t ? '' : null }, t.toUpperCase())
            )
        );
        const statusSel = window.UI.el('select', { class: 'select' },
            ['proposed','accepted'].map((t) =>
                window.UI.el('option', { value: t, selected: (existing && existing.status === t) || (!existing && t === 'proposed') ? '' : null }, t.toUpperCase())
            )
        );
        const contextInp = window.UI.el('textarea', { class: 'textarea', rows: 3 });
        const decisionInp = window.UI.el('textarea', { class: 'textarea', rows: 3 });
        const consequencesInp = window.UI.el('textarea', { class: 'textarea', rows: 3 });
        const stakeholdersInp = window.UI.el('input', { class: 'input', type: 'text', value: existing && Array.isArray(existing.stakeholders) ? existing.stakeholders.join(', ') : '' });
        const tagsInp = window.UI.el('input', { class: 'input', type: 'text', value: existing && Array.isArray(existing.tags) ? existing.tags.join(', ') : '' });
        if (existing) {
            contextInp.value = existing.context || '';
            decisionInp.value = existing.decision || '';
            consequencesInp.value = existing.consequences || '';
        }

        const body = window.UI.el('div', null, [
            window.UI.el('label', { class: 'label' }, 'TITLE'),
            titleInp,
            window.UI.el('div', { style: { display: 'grid', 'grid-template-columns': '1fr 1fr 1fr', gap: '10px', 'margin-top': '12px' } }, [
                window.UI.el('div', null, [window.UI.el('label', { class: 'label' }, 'TYPE'), typeSel]),
                window.UI.el('div', null, [window.UI.el('label', { class: 'label' }, 'IMPACT'), impactSel]),
                window.UI.el('div', null, [window.UI.el('label', { class: 'label' }, 'STATUS'), statusSel]),
            ]),
            window.UI.el('label', { class: 'label', style: { 'margin-top': '12px' } }, 'CONTEXT'),
            window.UI.el('div', { class: 'hint', style: { 'margin-bottom': '4px' } }, 'Why did this decision need to be made?'),
            contextInp,
            window.UI.el('label', { class: 'label', style: { 'margin-top': '12px' } }, 'DECISION'),
            window.UI.el('div', { class: 'hint', style: { 'margin-bottom': '4px' } }, 'What was decided?'),
            decisionInp,
            window.UI.el('label', { class: 'label', style: { 'margin-top': '12px' } }, 'CONSEQUENCES'),
            window.UI.el('div', { class: 'hint', style: { 'margin-bottom': '4px' } }, 'Trade-offs and constraints.'),
            consequencesInp,
            window.UI.el('label', { class: 'label', style: { 'margin-top': '12px' } }, 'STAKEHOLDERS'),
            window.UI.el('div', { class: 'hint', style: { 'margin-bottom': '4px' } }, 'Comma-separated.'),
            stakeholdersInp,
            window.UI.el('label', { class: 'label', style: { 'margin-top': '12px' } }, 'TAGS'),
            window.UI.el('div', { class: 'hint', style: { 'margin-bottom': '4px' } }, 'Comma-separated.'),
            tagsInp,
        ]);

        const cancel = window.UI.el('button', { class: 'ctrl-btn' }, 'CANCEL');
        const save = window.UI.el('button', { class: 'ctrl-btn primary' }, isEdit ? 'SAVE' : 'CREATE');
        const m = window.UI.modal({
            title: isEdit ? 'EDIT DECISION ' + (existing.id || '') : 'NEW DECISION',
            body, wide: true, footer: [cancel, save],
        });
        cancel.addEventListener('click', () => m.close());
        save.addEventListener('click', async () => {
            const payload = {
                title: titleInp.value.trim(),
                type: typeSel.value,
                status: statusSel.value,
                impact: impactSel.value,
                context: contextInp.value.trim(),
                decision: decisionInp.value.trim(),
                consequences: consequencesInp.value.trim(),
                stakeholders: stakeholdersInp.value.split(',').map((s) => s.trim()).filter(Boolean),
                tags: tagsInp.value.split(',').map((s) => s.trim()).filter(Boolean),
            };
            if (!payload.title || !payload.context || !payload.decision) {
                window.UI.toast('Title, context, and decision are required', 'error');
                return;
            }
            save.disabled = true;
            try {
                if (isEdit) await window.API.put('/api/decisions/' + encodeURIComponent(existing.id), payload);
                else        await window.API.post('/api/decisions', payload);
                m.close();
                window.UI.toast(isEdit ? 'Decision updated' : 'Decision created', 'success');
                fetchDecisions().then(render);
            } catch (err) {
                window.UI.toast('Save failed: ' + err.message, 'error');
                save.disabled = false;
            }
        });
    }

    function wireFilters() {
        document.querySelectorAll('[data-dfilter]').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-dfilter]').forEach((b) => b.classList.toggle('active', b === btn));
                filter = btn.getAttribute('data-dfilter');
                render();
            });
        });
        const newBtn = document.getElementById('decision-new-btn');
        if (newBtn) newBtn.addEventListener('click', () => openCreateModal());
    }

    function init() {
        wireFilters();
        window.Store.subscribe('decisions', render);
        fetchDecisions().then(render);
    }

    window.Decisions = { init, render, fetch: fetchDecisions, openCreateModal };
})();
