/* DOTBOT Dashboard - Theme application + picker
 * Reads /api/theme on boot, applies CSS custom properties.
 * Provides a theme picker modal triggered by the THEME header button.
 * Attaches: window.Theme
 */
(function () {
    'use strict';

    let config = null;

    async function load() {
        try {
            config = await window.API.themeGet();
            apply(config);
        } catch (e) {
            console.warn('Theme load failed:', e);
        } finally {
            document.body.classList.add('theme-loaded');
        }
    }

    function apply(cfg) {
        if (!cfg || !cfg.mappings) return;
        const root = document.documentElement;
        for (const [name, rgb] of Object.entries(cfg.mappings)) {
            if (rgb && typeof rgb === 'object') {
                root.style.setProperty('--color-' + name + '-rgb', rgb.r + ' ' + rgb.g + ' ' + rgb.b);
            }
        }
    }

    async function setPreset(name) {
        try {
            const res = await window.API.themeSet(name);
            config = res;
            apply(res);
            window.UI && window.UI.toast('Theme: ' + (res.name || name), 'success', 1800);
            renderThemeGrid();
        } catch (e) {
            window.UI && window.UI.toast('Theme switch failed: ' + e.message, 'error');
        }
    }

    function swatch(rgbObj) {
        if (!rgbObj) return '#222';
        return 'rgb(' + rgbObj.r + ',' + rgbObj.g + ',' + rgbObj.b + ')';
    }

    function presetTile(preset, currentName) {
        const tile = document.createElement('button');
        tile.className = 'theme-tile' + (preset.name === currentName ? ' active' : '');
        tile.addEventListener('click', () => setPreset(preset.id || preset.key || preset.name));

        const swatches = document.createElement('div');
        swatches.className = 'theme-tile-swatches';
        const colors = ['primary', 'secondary', 'success', 'error', 'bg-deep'];
        colors.forEach((k) => {
            const sw = document.createElement('span');
            sw.className = 'theme-tile-swatch';
            sw.style.background = swatch(preset.mappings && preset.mappings[k]);
            swatches.appendChild(sw);
        });
        tile.appendChild(swatches);

        const name = document.createElement('div');
        name.className = 'theme-tile-name';
        name.textContent = preset.name || preset.id || 'Theme';
        tile.appendChild(name);

        return tile;
    }

    function openPicker() {
        if (!window.UI || !config) return;
        const body = document.createElement('div');
        const grid = document.createElement('div');
        grid.className = 'theme-grid';
        body.appendChild(grid);

        const presets = config.presets || {};
        const list = Object.values(presets);
        if (list.length === 0) {
            body.innerHTML = '<div class="empty-state">No theme presets available.</div>';
        } else {
            list.forEach((p) => {
                const preset = Object.assign({}, p);
                if (!preset.id && p.key) preset.id = p.key;
                grid.appendChild(presetTile(preset, config.name));
            });
        }

        window.UI.modal({ title: 'SELECT THEME', body });
    }

    function renderThemeGrid() {
        const host = document.getElementById('config-panels');
        if (!host) return;
        const grid = host.querySelector('.theme-grid[data-managed="true"]');
        if (!grid || !config) return;
        grid.innerHTML = '';
        Object.values(config.presets || {}).forEach((p) => {
            const preset = Object.assign({}, p);
            if (!preset.id && p.key) preset.id = p.key;
            grid.appendChild(presetTile(preset, config.name));
        });
    }

    function init() {
        const btn = document.getElementById('action-theme');
        if (btn) btn.addEventListener('click', openPicker);
    }

    window.Theme = { load, setPreset, getConfig: () => config, openPicker, init };
})();
