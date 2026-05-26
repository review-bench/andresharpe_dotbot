/* DOTBOT Dashboard - Agents section
 * Lists registered agents (framework + workflow-scoped).
 * Source: /api/agents/list returns { groups: [{ name, items: [{ name, description, path, ... }] }] }
 * If empty, falls back to listing agent names referenced by workflows.
 */
(function () {
    'use strict';

    let filter = '';

    async function fetchAgents() {
        try {
            const res = await window.API.agentsList();
            const groups = (res && res.groups) || [];
            const agents = normalize(groups);
            window.Store.set('agents', agents);
            document.getElementById('badge-agents').textContent = String(agents.length);
            return agents;
        } catch (err) {
            console.warn('agents load:', err);
            return [];
        }
    }

    function normalize(groups) {
        const out = [];
        for (const g of groups) {
            const items = (g && g.items) || [];
            for (const it of items) {
                out.push({
                    name: it.name || it.title || 'agent',
                    description: it.description || it.summary || '',
                    source: g.label || g.name || 'framework',
                    path: it.path || it.file || '',
                    tools: it.tools || [],
                    tags: it.tags || [],
                });
            }
        }
        return out;
    }

    function fallbackFromWorkflows() {
        const seen = new Set();
        const out = [];
        const workflows = window.Store.get('workflows') || [];
        for (const wf of workflows) {
            const names = Array.isArray(wf.agents) ? wf.agents : [];
            for (const name of names) {
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({
                    name,
                    description: 'Referenced by workflow: ' + (wf.name || ''),
                    source: 'workflow:' + (wf.name || ''),
                    tools: [],
                    tags: [],
                });
            }
        }
        return out;
    }

    function render() {
        const root = document.getElementById('agents-grid');
        if (!root) return;
        let agents = window.Store.get('agents') || [];
        if (agents.length === 0) {
            agents = fallbackFromWorkflows();
            if (agents.length > 0) {
                document.getElementById('badge-agents').textContent = String(agents.length);
            }
        }

        const list = filter
            ? agents.filter((a) =>
                (a.name || '').toLowerCase().includes(filter.toLowerCase()) ||
                (a.description || '').toLowerCase().includes(filter.toLowerCase()))
            : agents;

        if (list.length === 0) {
            root.innerHTML = '<div class="empty-state">' +
                'No agents registered for this runtime. Agents are discovered from recipes/agents/{name}/AGENT.md or referenced by workflow manifests.' +
                '</div>';
            return;
        }

        root.innerHTML = '';
        list.forEach((a) => root.appendChild(card(a)));
    }

    function card(a) {
        const c = document.createElement('div');
        c.className = 'agent-card';

        const initials = (a.name || '').split(/[-_\s]/).map((w) => w.charAt(0).toUpperCase()).slice(0, 2).join('') || '◈';

        const head = document.createElement('div');
        head.className = 'agent-card-head';
        head.innerHTML =
            '<span class="agent-card-glyph">' + window.UI.escapeHtml(initials) + '</span>' +
            '<div style="flex:1;min-width:0;">' +
                '<div class="agent-card-name">' + window.UI.escapeHtml(a.name) + '</div>' +
                '<div class="agent-card-source">' + window.UI.escapeHtml(a.source || 'framework') + '</div>' +
            '</div>';
        c.appendChild(head);

        const desc = document.createElement('div');
        desc.className = 'agent-card-desc';
        desc.textContent = a.description || 'No description.';
        c.appendChild(desc);

        if ((a.tools && a.tools.length) || (a.tags && a.tags.length)) {
            const meta = document.createElement('div');
            meta.className = 'agent-card-meta';
            if (a.tools && a.tools.length) {
                a.tools.slice(0, 4).forEach((t) => {
                    const b = document.createElement('span');
                    b.className = 'badge';
                    b.setAttribute('data-type', 'info');
                    b.textContent = t;
                    meta.appendChild(b);
                });
            }
            if (a.tags && a.tags.length) {
                a.tags.slice(0, 3).forEach((t) => {
                    const b = document.createElement('span');
                    b.className = 'tag';
                    b.textContent = t;
                    meta.appendChild(b);
                });
            }
            c.appendChild(meta);
        }

        return c;
    }

    function init() {
        const search = document.getElementById('agents-search');
        if (search) search.addEventListener('input', (e) => {
            filter = e.target.value || '';
            render();
        });
        window.Store.subscribe('agents', render);
        window.Store.subscribe('workflows', render);
        fetchAgents().then(render);
    }

    window.Agents = { init, render, fetch: fetchAgents };
})();
