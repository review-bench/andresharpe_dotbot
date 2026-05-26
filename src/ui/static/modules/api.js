/* DOTBOT Dashboard - API wrapper
 * Talks to the runtime serving this page. Designed so the URL prefix
 * can be swapped later if cross-runtime fetch is enabled.
 * Attaches: window.API
 */
(function () {
    'use strict';

    // Default base = same origin (the runtime serving us).
    let baseUrl = '';

    function setBase(url) { baseUrl = url || ''; }

    function url(path) {
        if (!path.startsWith('/')) path = '/' + path;
        return baseUrl + path;
    }

    async function req(method, path, body, opts) {
        opts = opts || {};
        const headers = { 'Accept': 'application/json' };
        if (method !== 'GET' && method !== 'HEAD') {
            headers['Content-Type'] = 'application/json';
            // CSRF protection (server.ps1 requires this on state-changing requests)
            headers['X-Dotbot-Request'] = '1';
        }
        const init = { method, headers, credentials: 'same-origin' };
        if (body !== undefined && body !== null) {
            init.body = typeof body === 'string' ? body : JSON.stringify(body);
        }
        if (opts.signal) init.signal = opts.signal;

        const res = await fetch(url(path), init);
        const ct = res.headers.get('content-type') || '';
        let data = null;
        if (ct.indexOf('application/json') >= 0) {
            data = await res.json().catch(() => null);
        } else {
            data = await res.text().catch(() => null);
        }

        if (!res.ok) {
            const msg = (data && data.error) || (data && data.message) || res.statusText || 'request_failed';
            const err = new Error(msg);
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    const get = (p, opts) => req('GET', p, null, opts);
    const post = (p, body, opts) => req('POST', p, body, opts);
    const put = (p, body, opts) => req('PUT', p, body, opts);
    const del = (p, opts) => req('DELETE', p, null, opts);

    /* ---------- Domain helpers ---------- */
    const info        = ()             => get('/api/info');
    const state       = ()             => get('/api/state');
    const statePoll   = (since, signal) => get('/api/state/poll' + (since ? '?since=' + encodeURIComponent(since) : ''), { signal });

    const workflowsInstalled = () => get('/api/workflows/installed');
    const workflowForm       = (name) => get('/api/workflows/' + encodeURIComponent(name) + '/form');
    const workflowRun        = (name, payload) => post('/api/workflows/' + encodeURIComponent(name) + '/run', payload);
    const workflowStop       = (name) => post('/api/workflows/' + encodeURIComponent(name) + '/stop', {});

    const processList   = () => get('/api/processes');
    const processGet    = (id) => get('/api/process/' + encodeURIComponent(id));
    const processOutput = (id, offset) => get('/api/process/' + encodeURIComponent(id) + '/output' + (offset ? '?position=' + offset : ''));
    const processStop   = (id) => post('/api/process/' + encodeURIComponent(id) + '/stop', {});
    const processKill   = (id) => post('/api/process/' + encodeURIComponent(id) + '/kill', {});

    const taskCreate = (payload) => post('/api/task/create', payload);
    const taskEdit   = (payload) => post('/api/task/edit', payload);
    const taskDelete = (id) => post('/api/task/delete', { task_id: id });
    const tasksActionRequired = () => get('/api/tasks/action-required');

    const agentsList = () => get('/api/agents/list');

    const settingsGet  = () => get('/api/settings');
    const settingsPost = (payload) => post('/api/settings', payload);
    const providers    = () => get('/api/providers');
    const themeGet     = () => get('/api/theme');
    const themeSet     = (preset) => post('/api/theme', { preset });
    const editors      = () => get('/api/editors');
    const editorOpen   = () => post('/api/open-editor', {});

    const gitStatus   = () => get('/api/git-status');
    const gitCommit   = () => post('/api/git/commit-and-push', {});

    const configAnalysis     = () => get('/api/config/analysis');
    const configAnalysisSet  = (p) => post('/api/config/analysis', p);
    const configCosts        = () => get('/api/config/costs');
    const configCostsSet     = (p) => post('/api/config/costs', p);
    const configEditor       = () => get('/api/config/editor');
    const configEditorSet    = (p) => post('/api/config/editor', p);
    const configMothership   = () => get('/api/config/mothership');
    const configMothershipSet = (p) => post('/api/config/mothership', p);

    window.API = {
        setBase, url,
        get, post, put, del, req,
        info, state, statePoll,
        workflowsInstalled, workflowForm, workflowRun, workflowStop,
        processList, processGet, processOutput, processStop, processKill,
        taskCreate, taskEdit, taskDelete, tasksActionRequired,
        agentsList,
        settingsGet, settingsPost, providers, themeGet, themeSet, editors, editorOpen,
        gitStatus, gitCommit,
        configAnalysis, configAnalysisSet,
        configCosts, configCostsSet,
        configEditor, configEditorSet,
        configMothership, configMothershipSet,
    };
})();
