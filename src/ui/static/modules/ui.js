/* DOTBOT Dashboard - UI helpers (toast, modal, formatters)
 * Attaches a single namespace: window.UI
 */
(function () {
    'use strict';

    const TOAST_DEFAULT_MS = 4000;

    function $(sel, root) { return (root || document).querySelector(sel); }
    function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

    function el(tag, attrs, children) {
        const node = document.createElement(tag);
        if (attrs) {
            for (const k in attrs) {
                if (k === 'class') node.className = attrs[k];
                else if (k === 'style' && typeof attrs[k] === 'object') Object.assign(node.style, attrs[k]);
                else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
                else if (k === 'html') node.innerHTML = attrs[k];
                else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
            }
        }
        if (children !== undefined) {
            const items = Array.isArray(children) ? children : [children];
            for (const c of items) {
                if (c == null) continue;
                if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
                else if (c instanceof Node) node.appendChild(c);
            }
        }
        return node;
    }

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /* ---------- Toast ---------- */
    function toast(message, type, ms) {
        type = type || 'info';
        ms = ms || TOAST_DEFAULT_MS;
        const host = document.getElementById('toast-host') || document.body;
        const node = el('div', { class: 'toast', 'data-type': type }, [
            el('span', { class: 'toast-icon' }, glyphForType(type)),
            el('span', { class: 'toast-message' }, message),
            el('button', { class: 'toast-close', onclick: () => dismiss(node) }, '×')
        ]);
        host.appendChild(node);
        // Force reflow then add visible
        // eslint-disable-next-line no-unused-expressions
        node.offsetHeight;
        node.classList.add('visible');
        const timer = setTimeout(() => dismiss(node), ms);
        node._toastTimer = timer;
        return node;
    }

    function dismiss(node) {
        if (!node || !node.parentNode) return;
        if (node._toastTimer) clearTimeout(node._toastTimer);
        node.classList.add('dismissing');
        setTimeout(() => { if (node.parentNode) node.parentNode.removeChild(node); }, 300);
    }

    function glyphForType(type) {
        const map = { info: '◆', success: '✓', warning: '⚠', error: '✗' };
        return map[type] || '◆';
    }

    /* ---------- Modal ---------- */
    function modal(opts) {
        opts = opts || {};
        const host = document.getElementById('modal-host') || document.body;
        const overlay = el('div', { class: 'modal-overlay', style: { display: 'flex' } });
        overlay.classList.add('open');

        const m = el('div', { class: 'modal' + (opts.wide ? ' modal-wide' : '') });
        const header = el('div', { class: 'modal-header' }, [
            el('span', { class: 'modal-title' }, opts.title || ''),
            el('button', { class: 'modal-close', onclick: close }, '✕')
        ]);
        const body = el('div', { class: 'modal-body' });
        if (opts.body instanceof Node) body.appendChild(opts.body);
        else if (typeof opts.body === 'string') body.innerHTML = opts.body;

        const footer = el('div', { class: 'modal-footer' });
        const footerNodes = opts.footer || [];
        for (const node of footerNodes) {
            if (node instanceof Node) footer.appendChild(node);
        }

        m.appendChild(header);
        m.appendChild(body);
        if (footerNodes.length) m.appendChild(footer);
        overlay.appendChild(m);
        host.appendChild(overlay);

        function close() {
            overlay.classList.remove('open');
            setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
            if (typeof opts.onClose === 'function') opts.onClose();
        }

        // Close on overlay click (not modal click)
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        // Esc to close
        const escHandler = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); } };
        document.addEventListener('keydown', escHandler);

        return { overlay, modal: m, body, footer, close };
    }

    /* ---------- Confirm ---------- */
    function confirmDialog(message, onConfirm, opts) {
        opts = opts || {};
        const yesBtn = el('button', { class: 'ctrl-btn ' + (opts.danger ? 'danger' : 'primary') }, opts.confirmLabel || 'CONFIRM');
        const noBtn = el('button', { class: 'ctrl-btn' }, opts.cancelLabel || 'CANCEL');
        const m = modal({
            title: opts.title || 'CONFIRM',
            body: el('div', { class: 'confirm-text', style: { fontSize: '12px', lineHeight: '1.5' } }, message),
            footer: [noBtn, yesBtn],
        });
        yesBtn.addEventListener('click', () => { m.close(); if (onConfirm) onConfirm(); });
        noBtn.addEventListener('click', () => m.close());
    }

    /* ---------- Prompt ---------- */
    function promptDialog(opts, onSubmit) {
        opts = opts || {};
        const input = el('input', { class: 'input', type: 'text', value: opts.value || '', placeholder: opts.placeholder || '' });
        const okBtn = el('button', { class: 'ctrl-btn primary' }, opts.confirmLabel || 'OK');
        const cancel = el('button', { class: 'ctrl-btn' }, 'CANCEL');
        const body = el('div', null, [
            opts.hint ? el('div', { class: 'hint', style: { marginBottom: '10px' } }, opts.hint) : null,
            el('label', { class: 'label' }, opts.label || 'VALUE'),
            input
        ]);
        const m = modal({ title: opts.title || 'INPUT', body, footer: [cancel, okBtn] });
        setTimeout(() => input.focus(), 50);
        okBtn.addEventListener('click', () => { const v = input.value; m.close(); onSubmit && onSubmit(v); });
        cancel.addEventListener('click', () => m.close());
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') okBtn.click(); });
    }

    /* ---------- Formatters ---------- */
    function fmtRelative(iso) {
        if (!iso) return '--';
        const t = new Date(iso).getTime();
        if (isNaN(t)) return iso;
        const diff = Date.now() - t;
        const s = Math.round(diff / 1000);
        if (s < 60) return s + 's ago';
        const m = Math.round(s / 60);
        if (m < 60) return m + 'm ago';
        const h = Math.round(m / 60);
        if (h < 48) return h + 'h ago';
        const d = Math.round(h / 24);
        if (d < 30) return d + 'd ago';
        return new Date(iso).toLocaleDateString();
    }

    function fmtDuration(ms) {
        if (ms == null || ms < 0) return '--';
        const s = Math.round(ms / 1000);
        if (s < 60) return s + 's';
        const m = Math.floor(s / 60);
        const rem = s % 60;
        if (m < 60) return m + 'm' + (rem ? ' ' + rem + 's' : '');
        const h = Math.floor(m / 60);
        return h + 'h ' + (m % 60) + 'm';
    }

    function fmtTime() {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    function truncate(s, n) {
        if (!s) return '';
        return s.length > n ? s.slice(0, n - 1) + '…' : s;
    }

    function setText(id, val) {
        const e = document.getElementById(id);
        if (e) e.textContent = (val == null || val === '') ? '--' : String(val);
    }

    function setBadgeCount(id, n) {
        const e = document.getElementById(id);
        if (!e) return;
        e.textContent = String(n || 0);
    }

    function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

    window.UI = {
        $, $$, el, escapeHtml,
        toast, modal, confirmDialog, promptDialog,
        fmtRelative, fmtDuration, fmtTime, truncate,
        setText, setBadgeCount, clear,
    };
})();
