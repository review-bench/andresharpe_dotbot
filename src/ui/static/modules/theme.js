/* DOTBOT Dashboard - Theme (light / dark)
 * The palette lives entirely in theme.css. This module only chooses between
 * the "Studio Light" and "Studio Dark" variants via html[data-theme], and
 * persists the choice. It no longer applies /api/theme presets (those were
 * the legacy CRT palettes and would clobber the editorial design).
 * Attaches: window.Theme
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'dotbot:dashboard:theme';
    const VARIANTS = {
        light: { id: 'light', name: 'Studio Light', swatches: ['#1d6b64', '#c2643a', '#4f7a3f', '#b23a28', '#f1ebdf'] },
        dark:  { id: 'dark',  name: 'Studio Dark',  swatches: ['#5ab2a7', '#d88a5c', '#84b26e', '#de6e58', '#17140f'] },
    };

    function current() {
        return document.documentElement.getAttribute('data-theme') || 'light';
    }

    function applyVariant(id) {
        if (id === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        else document.documentElement.removeAttribute('data-theme');
        try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* ignore */ }
    }

    async function load() {
        let stored = 'light';
        try { stored = localStorage.getItem(STORAGE_KEY) || 'light'; } catch (e) { /* ignore */ }
        applyVariant(stored);
        document.body.classList.add('theme-loaded');
    }

    function setVariant(id) {
        applyVariant(id);
        renderGrid();
        window.UI && window.UI.toast('Theme: ' + (VARIANTS[id] ? VARIANTS[id].name : id), 'success', 1600);
    }

    function tile(variant) {
        const t = document.createElement('button');
        t.className = 'theme-tile' + (variant.id === current() ? ' active' : '');
        t.addEventListener('click', () => setVariant(variant.id));

        const sw = document.createElement('div');
        sw.className = 'theme-tile-swatches';
        variant.swatches.forEach((c) => {
            const s = document.createElement('span');
            s.className = 'theme-tile-swatch';
            s.style.background = c;
            sw.appendChild(s);
        });
        const name = document.createElement('div');
        name.className = 'theme-tile-name';
        name.textContent = variant.name;
        t.appendChild(sw);
        t.appendChild(name);
        return t;
    }

    function openPicker() {
        if (!window.UI) return;
        const body = document.createElement('div');
        const grid = document.createElement('div');
        grid.className = 'theme-grid';
        Object.values(VARIANTS).forEach((v) => grid.appendChild(tile(v)));
        body.appendChild(grid);
        window.UI.modal({ title: 'Appearance', body });
    }

    function renderGrid() {
        const grid = document.querySelector('.theme-grid[data-managed="true"]');
        if (!grid) return;
        grid.innerHTML = '';
        Object.values(VARIANTS).forEach((v) => grid.appendChild(tile(v)));
    }

    function toggle() {
        setVariant(current() === 'dark' ? 'light' : 'dark');
    }

    function init() {
        const btn = document.getElementById('action-theme');
        if (btn) btn.addEventListener('click', openPicker);
    }

    // Back-compat: config.js calls Theme.getConfig() for the theme panel.
    function getConfig() {
        return { name: VARIANTS[current()].name, variants: VARIANTS };
    }

    window.Theme = { load, init, openPicker, toggle, setVariant, current, getConfig, renderGrid, VARIANTS };
})();
