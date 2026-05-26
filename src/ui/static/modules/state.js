/* DOTBOT Dashboard - Central state store
 * Simple pub/sub. Sections subscribe by key and re-render on changes.
 * Attaches: window.Store
 */
(function () {
    'use strict';

    const data = {
        info: null,            // /api/info payload
        state: null,           // /api/state payload (polled)
        workflows: [],         // /api/workflows/installed.workflows
        processes: [],         // /api/processes.processes
        agents: [],            // /api/agents/list -> normalized
        settings: null,
        providers: null,
        theme: null,
        editors: null,
        git: null,
        actionRequired: null,
        runtimes: [],          // known runtimes (managed by runtime-manager)
        currentRuntimeId: null,
        section: 'overview',
        lastUpdate: null,
    };

    const subscribers = new Map(); // key -> Set<fn>

    function get(key) { return data[key]; }
    function getAll() { return data; }

    function set(key, value) {
        if (data[key] === value) {
            // For arrays/objects, still notify (reference may have mutated)
        }
        data[key] = value;
        data.lastUpdate = new Date().toISOString();
        notify(key);
        notify('*');
    }

    function update(patch) {
        Object.assign(data, patch);
        data.lastUpdate = new Date().toISOString();
        for (const k of Object.keys(patch)) notify(k);
        notify('*');
    }

    function subscribe(key, fn) {
        if (!subscribers.has(key)) subscribers.set(key, new Set());
        subscribers.get(key).add(fn);
        return () => subscribers.get(key).delete(fn);
    }

    function notify(key) {
        const subs = subscribers.get(key);
        if (subs) for (const fn of subs) {
            try { fn(data[key], data); } catch (e) { console.error('subscriber error', e); }
        }
    }

    window.Store = { get, getAll, set, update, subscribe };
})();
