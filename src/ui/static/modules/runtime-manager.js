/* DOTBOT Dashboard - Runtime registry
 * Tracks the runtimes the dashboard knows about. The current one is the
 * runtime serving this page; others are remembered in localStorage and
 * selected via redirect.
 *
 * Storage key: dotbot:dashboard:knownRuntimes -> [{ id, url, label, addedAt }]
 *
 * Attaches: window.RuntimeManager
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'dotbot:dashboard:knownRuntimes';
    let currentId = null;

    function ownUrl() {
        return location.origin;
    }

    function makeId(url) {
        try {
            const u = new URL(url);
            return (u.hostname + ':' + u.port).replace(/[^a-z0-9:.-]/gi, '_');
        } catch (e) {
            return ('rt-' + Math.random().toString(36).slice(2, 8));
        }
    }

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function save(list) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
    }

    function list() { return load(); }

    function add(runtime) {
        if (!runtime || !runtime.url) return null;
        const url = runtime.url.replace(/\/$/, '');
        const id = runtime.id || makeId(url);
        let arr = load();
        if (arr.some((r) => r.url === url || r.id === id)) return arr;
        arr.push({
            id,
            url,
            label: runtime.label || id,
            addedAt: new Date().toISOString(),
        });
        save(arr);
        return arr;
    }

    function remove(id) {
        let arr = load();
        arr = arr.filter((r) => r.id !== id);
        save(arr);
        return arr;
    }

    function self() {
        const url = ownUrl();
        return { id: makeId(url), url, label: 'LOCAL', addedAt: new Date().toISOString(), self: true };
    }

    /** Combined list = self + known, deduped by URL. self is always first. */
    function combined(info) {
        const me = self();
        if (info && info.project_name) me.label = String(info.project_name).toUpperCase();
        const arr = load().filter((r) => r.url !== me.url);
        return [me].concat(arr);
    }

    function current() { return currentId; }
    function setCurrent(id) { currentId = id; }

    function switchTo(runtime) {
        if (!runtime || !runtime.url) return;
        if (runtime.url === ownUrl() || runtime.self) {
            // Already here — just refocus to overview
            window.Router && window.Router.go('overview');
            return;
        }
        // Redirect to the other runtime's UI, preserving the section
        const hash = location.hash || '#overview';
        window.location.href = runtime.url + '/' + hash;
    }

    /** Render runtime chips into the header runtime-bar */
    function renderBar() {
        const bar = document.getElementById('runtime-bar');
        if (!bar) return;
        const info = window.Store ? window.Store.get('info') : null;
        const rts = combined(info);
        currentId = rts[0] ? rts[0].id : null;

        bar.innerHTML = '';
        rts.forEach((rt) => {
            const chip = document.createElement('button');
            chip.className = 'runtime-chip' + (rt.self ? ' active' : '');
            chip.setAttribute('data-rt-id', rt.id);
            chip.title = rt.url;
            const led = document.createElement('span');
            led.className = 'runtime-chip-led';
            led.setAttribute('data-state', rt.self ? 'online' : 'connecting');
            const name = document.createElement('span');
            name.className = 'runtime-chip-name';
            name.textContent = rt.label;
            chip.appendChild(led);
            chip.appendChild(name);
            if (!rt.self) {
                const close = document.createElement('button');
                close.className = 'runtime-chip-close';
                close.textContent = '×';
                close.title = 'Remove from list';
                close.addEventListener('click', (e) => {
                    e.stopPropagation();
                    remove(rt.id);
                    renderBar();
                });
                chip.appendChild(close);
            }
            chip.addEventListener('click', () => switchTo(rt));
            bar.appendChild(chip);
        });

        // Probe non-self runtimes for online status (best-effort)
        rts.filter((r) => !r.self).forEach((r) => probeRuntime(r));
    }

    function probeRuntime(rt) {
        const chip = document.querySelector('.runtime-chip[data-rt-id="' + rt.id + '"]');
        if (!chip) return;
        const led = chip.querySelector('.runtime-chip-led');
        if (!led) return;
        led.setAttribute('data-state', 'connecting');
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        fetch(rt.url + '/api/info', { signal: ctrl.signal })
            .then((res) => {
                clearTimeout(timer);
                led.setAttribute('data-state', res.ok ? 'online' : 'offline');
            })
            .catch(() => {
                clearTimeout(timer);
                led.setAttribute('data-state', 'offline');
            });
    }

    function openAddRuntimeDialog() {
        if (!window.UI) return;
        window.UI.promptDialog({
            title: 'CONNECT TO RUNTIME',
            label: 'RUNTIME URL',
            placeholder: 'http://localhost:54321',
            hint: 'Enter the URL where the other dotbot runtime serves its dashboard. Each runtime serves the same dashboard on a random port (.bot/.control/ui-port).',
            confirmLabel: 'CONNECT',
        }, (val) => {
            if (!val) return;
            const url = val.trim().replace(/\/$/, '');
            if (!url.match(/^https?:\/\//)) {
                window.UI.toast('URL must start with http:// or https://', 'error');
                return;
            }
            // Try fetching /api/info to confirm and get a friendly label
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), 4000);
            fetch(url + '/api/info', { signal: ctrl.signal })
                .then((r) => r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)))
                .then((info) => {
                    const label = (info && info.project_name) ? String(info.project_name).toUpperCase() : url;
                    add({ url, label });
                    window.UI.toast('Runtime added: ' + label, 'success');
                    renderBar();
                })
                .catch((err) => {
                    // Still add the runtime — user may want to connect later
                    add({ url, label: url.replace(/^https?:\/\//, '') });
                    window.UI.toast('Added (could not verify: ' + (err.message || 'offline') + ')', 'warning');
                    renderBar();
                });
        });
    }

    function init() {
        renderBar();
        const btn = document.getElementById('action-add-runtime');
        if (btn) btn.addEventListener('click', openAddRuntimeDialog);

        // Re-probe known runtimes periodically
        setInterval(() => {
            const rts = combined(window.Store && window.Store.get('info'));
            rts.filter((r) => !r.self).forEach(probeRuntime);
        }, 20000);
    }

    window.RuntimeManager = {
        init, list, add, remove, combined, current, setCurrent, switchTo,
        renderBar, openAddRuntimeDialog, ownUrl,
    };
})();
