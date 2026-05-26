/* DOTBOT Dashboard - Config section
 * Multi-panel settings: theme, provider/models, analysis, execution, costs, editor, mothership, raw
 */
(function () {
    'use strict';

    let active = 'theme';

    function render() {
        const root = document.getElementById('config-panels');
        if (!root) return;
        root.innerHTML = '';
        switch (active) {
            case 'theme':       renderTheme(root); break;
            case 'provider':    renderProvider(root); break;
            case 'analysis':    renderAnalysis(root); break;
            case 'execution':   renderExecution(root); break;
            case 'costs':       renderCosts(root); break;
            case 'editor':      renderEditor(root); break;
            case 'mothership':  renderMothership(root); break;
            case 'raw':         renderRaw(root); break;
            default:            renderTheme(root); break;
        }
    }

    function panel(title, screen) {
        const p = document.createElement('div');
        p.className = 'config-panel';
        const head = document.createElement('div');
        head.className = 'config-panel-head';
        head.innerHTML = '<span class="config-panel-title">◆ ' + title + '</span>';
        const sc = document.createElement('div');
        sc.className = 'config-panel-screen';
        sc.appendChild(screen);
        p.appendChild(head);
        p.appendChild(sc);
        return p;
    }

    function row(label, hint, control) {
        const r = document.createElement('div');
        r.className = 'config-row';
        const info = document.createElement('div');
        info.className = 'config-row-info';
        info.innerHTML =
            '<div class="config-row-label">' + window.UI.escapeHtml(label) + '</div>' +
            (hint ? '<div class="config-row-hint">' + window.UI.escapeHtml(hint) + '</div>' : '');
        const ctrl = document.createElement('div');
        ctrl.className = 'config-row-control';
        if (control instanceof Node) ctrl.appendChild(control);
        r.appendChild(info);
        r.appendChild(ctrl);
        return r;
    }

    /* ---------- THEME ---------- */
    function renderTheme(root) {
        const screen = document.createElement('div');
        const grid = document.createElement('div');
        grid.className = 'theme-grid';
        grid.setAttribute('data-managed', 'true');
        screen.appendChild(grid);

        const cfg = window.Theme.getConfig();
        if (!cfg) {
            grid.innerHTML = '<div class="loading-state">Loading themes...</div>';
        } else {
            const presets = cfg.presets || {};
            Object.values(presets).forEach((p) => {
                const preset = Object.assign({}, p);
                if (!preset.id && p.key) preset.id = p.key;
                grid.appendChild(themeTile(preset, cfg.name));
            });
        }
        root.appendChild(panel('THEME PRESETS', screen));
    }

    function themeTile(preset, currentName) {
        const tile = document.createElement('button');
        tile.className = 'theme-tile' + (preset.name === currentName ? ' active' : '');
        tile.addEventListener('click', () => {
            window.Theme.setPreset(preset.id || preset.key || preset.name).then(() => render());
        });
        const sw = document.createElement('div');
        sw.className = 'theme-tile-swatches';
        ['primary', 'secondary', 'success', 'error', 'bg-deep'].forEach((k) => {
            const s = document.createElement('span');
            s.className = 'theme-tile-swatch';
            const rgb = preset.mappings && preset.mappings[k];
            if (rgb) s.style.background = 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
            sw.appendChild(s);
        });
        const name = document.createElement('div');
        name.className = 'theme-tile-name';
        name.textContent = preset.name || preset.id;
        tile.appendChild(sw);
        tile.appendChild(name);
        return tile;
    }

    /* ---------- PROVIDER ---------- */
    function renderProvider(root) {
        const screen = document.createElement('div');
        screen.innerHTML = '<div class="loading-state">Loading providers...</div>';
        root.appendChild(panel('CODING AGENT & PROVIDERS', screen));

        window.API.providers().then((data) => {
            screen.innerHTML = '';
            const providers = data.providers || [];
            const models = data.models || [];

            if (providers.length > 0) {
                const sub = document.createElement('div');
                sub.style.cssText = 'margin-bottom: 12px;';
                sub.innerHTML = '<div class="config-row-label" style="margin-bottom:8px;">PROVIDERS</div>';
                const grid = document.createElement('div');
                grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;';
                providers.forEach((p) => {
                    const t = document.createElement('button');
                    t.className = 'theme-tile' + (p.active || p.id === data.active_provider ? ' active' : '');
                    t.innerHTML =
                        '<div class="theme-tile-name">' + window.UI.escapeHtml(p.name || p.id) + '</div>' +
                        '<div class="config-row-hint" style="margin-top:4px;">' + window.UI.escapeHtml(p.description || '') + '</div>';
                    t.addEventListener('click', () => {
                        window.API.post('/api/providers', { provider: p.id })
                            .then(() => { window.UI.toast('Provider switched: ' + p.name, 'success'); render(); })
                            .catch((e) => window.UI.toast(e.message, 'error'));
                    });
                    grid.appendChild(t);
                });
                sub.appendChild(grid);
                screen.appendChild(sub);
            }

            if (models.length > 0) {
                const sub2 = document.createElement('div');
                sub2.innerHTML = '<div class="config-row-label" style="margin-bottom:8px;">AVAILABLE MODELS</div>';
                const list = document.createElement('div');
                list.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
                models.forEach((m) => {
                    const span = document.createElement('span');
                    span.className = 'badge' + (m.badge === 'Recommended' ? '' : '');
                    span.setAttribute('data-type', m.badge === 'Recommended' ? 'success' : 'info');
                    span.title = m.description || '';
                    span.textContent = m.name || m.id;
                    list.appendChild(span);
                });
                sub2.appendChild(list);
                screen.appendChild(sub2);
            }
        }).catch((err) => {
            screen.innerHTML = '<div class="empty-state">Failed to load providers: ' + window.UI.escapeHtml(err.message) + '</div>';
        });
    }

    /* ---------- ANALYSIS ---------- */
    function renderAnalysis(root) {
        const screen = document.createElement('div');
        const cur = window.Store.get('settings') || {};
        screen.appendChild(row(
            'Analysis Model',
            'Model used for task analysis (pre-flight).',
            mkBadge(cur.analysisModel || '--', 'secondary')
        ));
        screen.appendChild(row(
            'Execution Model',
            'Model used for task implementation.',
            mkBadge(cur.executionModel || '--', 'secondary')
        ));
        const note = document.createElement('div');
        note.className = 'hint';
        note.style.marginTop = '12px';
        note.textContent = 'Models are selected per provider. Switch the active provider in PROVIDER & MODELS.';
        screen.appendChild(note);
        root.appendChild(panel('ANALYSIS', screen));
    }

    /* ---------- EXECUTION ---------- */
    function renderExecution(root) {
        const screen = document.createElement('div');
        const cur = window.Store.get('settings') || {};
        const debugCheckbox = mkToggle(!!cur.showDebug, async (v) => {
            try { await window.API.settingsPost({ showDebug: v }); await refresh(); }
            catch (e) { window.UI.toast(e.message, 'error'); }
        });
        const verboseCheckbox = mkToggle(!!cur.showVerbose, async (v) => {
            try { await window.API.settingsPost({ showVerbose: v }); await refresh(); }
            catch (e) { window.UI.toast(e.message, 'error'); }
        });
        screen.appendChild(row('Show Debug Output', 'Display raw JSON events and Claude invocation details.', debugCheckbox));
        screen.appendChild(row('Show Verbose Output', 'Display detailed tool results and metadata.', verboseCheckbox));
        screen.appendChild(row('Permission Mode', 'Controls how the coding agent handles permission prompts.', mkBadge(cur.permissionMode || 'bypassPermissions', 'info')));
        root.appendChild(panel('EXECUTION', screen));
    }

    /* ---------- COSTS ---------- */
    function renderCosts(root) {
        const screen = document.createElement('div');
        screen.innerHTML = '<div class="loading-state">Loading costs...</div>';
        root.appendChild(panel('COST ESTIMATES', screen));

        window.API.configCosts().then((c) => {
            const cost = c || {};
            const draft = {
                hourlyRate: cost.hourlyRate || 50,
                aiCostPerTask: cost.aiCostPerTask || 0.5,
                aiSpeedupFactor: cost.aiSpeedupFactor || 10,
                currency: cost.currency || 'USD',
            };
            screen.innerHTML = '';
            const inputs = [
                ['hourlyRate', 'Blended Hourly Rate', 'Average cost per developer hour', 'number'],
                ['aiCostPerTask', 'AI Cost Per Task', 'Estimated AI API cost per task execution', 'number'],
                ['aiSpeedupFactor', 'AI Speedup Factor', 'How many times faster AI completes tasks vs human', 'number'],
                ['currency', 'Currency', 'Currency code for cost displays', 'text'],
            ];
            inputs.forEach(([key, label, hint, type]) => {
                const input = window.UI.el('input', { class: 'input', type, value: draft[key], style: { width: '120px' } });
                input.addEventListener('change', () => {
                    const v = type === 'number' ? Number(input.value) : input.value;
                    window.API.configCostsSet({ [key]: v })
                        .then(() => window.UI.toast('Saved', 'success', 1200))
                        .catch((e) => window.UI.toast(e.message, 'error'));
                });
                screen.appendChild(row(label, hint, input));
            });
        }).catch((e) => {
            screen.innerHTML = '<div class="empty-state">Failed to load costs: ' + window.UI.escapeHtml(e.message) + '</div>';
        });
    }

    /* ---------- EDITOR ---------- */
    function renderEditor(root) {
        const screen = document.createElement('div');
        screen.innerHTML = '<div class="loading-state">Detecting editors...</div>';
        root.appendChild(panel('EDITOR', screen));

        Promise.all([window.API.editors(), window.API.configEditor()]).then(([listRes, current]) => {
            screen.innerHTML = '';
            const editors = (listRes && listRes.editors) || [];
            const activeId = (current && current.editor) || '';
            if (editors.length === 0) {
                screen.innerHTML = '<div class="empty-state">No editors detected.</div>';
                return;
            }
            const grid = document.createElement('div');
            grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;';
            editors.forEach((e) => {
                const t = document.createElement('button');
                t.className = 'theme-tile' + (e.id === activeId ? ' active' : '');
                t.innerHTML =
                    '<div class="theme-tile-name">' + window.UI.escapeHtml(e.name || e.id) + '</div>' +
                    '<div class="config-row-hint" style="margin-top:4px;">' + window.UI.escapeHtml(e.command || '') + '</div>';
                t.addEventListener('click', () => {
                    window.API.configEditorSet({ editor: e.id })
                        .then(() => { window.UI.toast('Editor: ' + (e.name || e.id), 'success'); render(); })
                        .catch((er) => window.UI.toast(er.message, 'error'));
                });
                grid.appendChild(t);
            });
            screen.appendChild(grid);
        }).catch((err) => {
            screen.innerHTML = '<div class="empty-state">Failed: ' + window.UI.escapeHtml(err.message) + '</div>';
        });
    }

    /* ---------- MOTHERSHIP ---------- */
    function renderMothership(root) {
        const screen = document.createElement('div');
        screen.innerHTML = '<div class="loading-state">Loading mothership config...</div>';
        root.appendChild(panel('MOTHERSHIP (DotbotServer sync)', screen));

        window.API.configMothership().then((cfg) => {
            const c = cfg || {};
            screen.innerHTML = '';

            const enabled = mkToggle(!!c.enabled, (v) => save('enabled', v));
            const url = window.UI.el('input', { class: 'input', type: 'text', value: c.serverUrl || '', style: { width: '320px' } });
            const apiKey = window.UI.el('input', { class: 'input', type: 'password', value: c.apiKey || '', style: { width: '320px' } });

            url.addEventListener('change', () => save('serverUrl', url.value));
            apiKey.addEventListener('change', () => save('apiKey', apiKey.value));

            screen.appendChild(row('Enabled', 'Connect to DotbotServer for sync and external delivery.', enabled));
            screen.appendChild(row('Server URL', 'DotbotServer base URL.', url));
            screen.appendChild(row('API Key', 'Stored in .control/settings.json (gitignored).', apiKey));

            function save(field, value) {
                window.API.configMothershipSet({ [field]: value })
                    .then(() => window.UI.toast('Saved', 'success', 1200))
                    .catch((e) => window.UI.toast(e.message, 'error'));
            }
        }).catch((err) => {
            screen.innerHTML = '<div class="empty-state">Failed: ' + window.UI.escapeHtml(err.message) + '</div>';
        });
    }

    /* ---------- RAW ---------- */
    function renderRaw(root) {
        const screen = document.createElement('div');
        screen.innerHTML = '<div class="loading-state">Loading settings...</div>';
        root.appendChild(panel('RAW SETTINGS (merged view)', screen));

        window.API.settingsGet().then((settings) => {
            screen.innerHTML = '';
            const pre = document.createElement('pre');
            pre.className = 'raw-settings';
            try {
                pre.textContent = JSON.stringify(settings, null, 2);
            } catch (e) {
                pre.textContent = String(settings);
            }
            screen.appendChild(pre);
        }).catch((err) => {
            screen.innerHTML = '<div class="empty-state">Failed: ' + window.UI.escapeHtml(err.message) + '</div>';
        });
    }

    /* ---------- helpers ---------- */
    function mkToggle(initial, onChange) {
        const label = document.createElement('label');
        label.className = 'toggle';
        const input = window.UI.el('input', { type: 'checkbox' });
        if (initial) input.checked = true;
        const slider = window.UI.el('span', { class: 'toggle-slider' });
        label.appendChild(input);
        label.appendChild(slider);
        input.addEventListener('change', () => onChange && onChange(input.checked));
        return label;
    }

    function mkBadge(text, type) {
        const b = document.createElement('span');
        b.className = 'badge';
        if (type) b.setAttribute('data-type', type);
        b.textContent = String(text || '--');
        return b;
    }

    function refresh() {
        return window.API.settingsGet().then((s) => window.Store.set('settings', s));
    }

    function wireNav() {
        document.querySelectorAll('.config-nav-item').forEach((b) => {
            b.addEventListener('click', () => {
                document.querySelectorAll('.config-nav-item').forEach((x) => x.classList.toggle('active', x === b));
                active = b.getAttribute('data-config');
                render();
            });
        });
    }

    function init() {
        wireNav();
        window.Store.subscribe('settings', () => {
            if (active === 'analysis' || active === 'execution' || active === 'raw') render();
        });
        // Initial settings load
        refresh().catch(() => {});
        render();
    }

    window.Config = { init, render };
})();
