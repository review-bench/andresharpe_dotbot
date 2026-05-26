/* DOTBOT Dashboard - Hash-based section router
 * Drives which .dash-section is active. Sections listen for ROUTE events.
 * Attaches: window.Router
 */
(function () {
    'use strict';

    const SECTIONS = ['overview', 'workflows', 'agents', 'processes', 'tasks', 'config'];
    const listeners = new Set();

    function currentSection() {
        const h = (location.hash || '').replace(/^#/, '').split('/')[0].toLowerCase();
        return SECTIONS.indexOf(h) >= 0 ? h : 'overview';
    }

    function go(section, subroute) {
        if (SECTIONS.indexOf(section) < 0) section = 'overview';
        const newHash = subroute ? '#' + section + '/' + subroute : '#' + section;
        if (location.hash !== newHash) location.hash = newHash;
        else applyRoute();
    }

    function applyRoute() {
        const section = currentSection();
        // Update tab UI
        document.querySelectorAll('.section-tab').forEach((tab) => {
            tab.classList.toggle('active', tab.getAttribute('data-section') === section);
        });
        // Update section visibility
        document.querySelectorAll('.dash-section').forEach((sec) => {
            sec.classList.toggle('active', sec.id === 'section-' + section);
        });
        if (window.Store) window.Store.set('section', section);
        for (const fn of listeners) {
            try { fn(section); } catch (e) { console.error(e); }
        }
    }

    function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

    function init() {
        window.addEventListener('hashchange', applyRoute);
        document.querySelectorAll('.section-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                go(tab.getAttribute('data-section'));
            });
        });
        applyRoute();
    }

    window.Router = { init, go, onChange, currentSection, SECTIONS };
})();
