/* DOTBOT Dashboard - Boot
 * Wires modules, fetches initial state, starts polling.
 */
(function () {
    'use strict';

    const POLL_INTERVAL_MS = 3000;
    let pollAbort = null;
    let pollLastSeen = null;
    let pollRetryMs = POLL_INTERVAL_MS;

    function setRuntimeSummary(info, gitData) {
        const fw = info && info.framework;
        window.UI.setText('rs-name', (info && info.project_name) ? info.project_name.toUpperCase() : 'UNKNOWN');
        window.UI.setText('rs-url', location.host);
        window.UI.setText('rs-workflow', (info && info.workflow) || 'none');
        window.UI.setText('rs-branch', (gitData && gitData.branch) || '--');
        const inst = (window.Store.get('state') || {}).instance_id;
        window.UI.setText('instance-id', inst ? inst.slice(0, 12) : '--');
        const led = document.getElementById('rs-led');
        if (led) led.setAttribute('data-state', 'online');

        // Footer
        if (fw) {
            const home = fw.dotbot_home || fw.home || '';
            const tail = home ? home.split(/[\\\/]/).filter(Boolean).slice(-1)[0] : '';
            window.UI.setText('footer-home', tail || 'DOTBOT_HOME');
            window.UI.setText('footer-version', fw.version || '--');
        }
        const m = document.getElementById('footer-mission');
        if (m) m.textContent = '◆ ' + (info && info.project_name ? info.project_name : 'control panel');
    }

    function tickFooter() {
        window.UI.setText('footer-updated', window.UI.fmtTime());
    }

    async function loadInfo() {
        try {
            // Prefer the bootstrap payload (injected by server.ps1) so first paint is fast
            let info = null;
            if (window.__DOTBOT_BOOTSTRAP__ && window.__DOTBOT_BOOTSTRAP__.info) {
                info = window.__DOTBOT_BOOTSTRAP__.info;
            } else {
                info = await window.API.info();
            }
            window.Store.set('info', info);
            return info;
        } catch (err) {
            console.error('Failed to load /api/info', err);
            window.UI.toast('Could not load runtime info', 'error');
            return null;
        }
    }

    async function loadGit() {
        try {
            const g = await window.API.gitStatus();
            window.Store.set('git', g);
            return g;
        } catch (err) {
            return null;
        }
    }

    async function loadSettings() {
        try {
            const s = await window.API.settingsGet();
            window.Store.set('settings', s);
            return s;
        } catch (err) {
            return null;
        }
    }

    async function pollLoop() {
        while (true) {
            try {
                if (pollAbort) pollAbort.abort();
                pollAbort = new AbortController();
                const res = await window.API.statePoll(pollLastSeen, pollAbort.signal);
                pollAbort = null;
                if (res) {
                    window.Store.set('state', res);
                    pollLastSeen = res.timestamp || new Date().toISOString();
                    tickFooter();
                    pollRetryMs = POLL_INTERVAL_MS;
                }
            } catch (err) {
                if (err && err.name === 'AbortError') {
                    return;
                }
                // Backoff on failures
                pollRetryMs = Math.min(pollRetryMs * 2, 30000);
                const led = document.getElementById('rs-led');
                if (led) led.setAttribute('data-state', 'offline');
                await sleep(pollRetryMs);
                continue;
            }
            await sleep(POLL_INTERVAL_MS);
        }
    }

    function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

    async function refreshSecondary() {
        if (window.Workflows) await window.Workflows.fetch();
        if (window.Processes) await window.Processes.fetch();
        if (window.Agents) await window.Agents.fetch();
    }

    async function boot() {
        // Foundation
        window.Theme.init();
        await window.Theme.load();   // applies CSS variables, fades body in
        window.Router.init();
        window.RuntimeManager.init();

        // Sections init
        window.Overview.init();
        window.Workflows.init();
        window.Agents.init();
        window.Processes.init();
        window.Roadmap.init();
        if (window.Decisions) window.Decisions.init();
        if (window.Product) window.Product.init();
        window.Config.init();

        // Initial data
        const info = await loadInfo();
        await loadGit();
        await loadSettings();
        // Workflows / processes / agents load in their init()

        // Update header bar (info may now be available)
        window.RuntimeManager.renderBar();

        // First state snapshot
        try {
            const state = await window.API.state();
            window.Store.set('state', state);
            pollLastSeen = state.timestamp || new Date().toISOString();
        } catch (err) {
            console.warn('initial state failed', err);
        }

        setRuntimeSummary(info, window.Store.get('git'));
        tickFooter();

        // React to info/git changes
        window.Store.subscribe('info', () => setRuntimeSummary(window.Store.get('info'), window.Store.get('git')));
        window.Store.subscribe('git', () => setRuntimeSummary(window.Store.get('info'), window.Store.get('git')));
        window.Store.subscribe('state', () => setRuntimeSummary(window.Store.get('info'), window.Store.get('git')));

        // Refresh secondary data periodically
        setInterval(refreshSecondary, 8000);
        setInterval(loadGit, 8000);
        setInterval(tickFooter, 1000);

        // Start polling loop
        pollLoop();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
