(() => {
    'use strict';

    const ICONS = {
        star: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.5l2.92 5.92 6.53.95-4.72 4.6 1.11 6.5L12 17.4l-5.84 3.07 1.11-6.5-4.72-4.6 6.53-.95L12 2.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
        lock: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="15.5" r="1.3" fill="currentColor"/></svg>',
        book: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 19a2 2 0 0 0 2 2h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
        heart: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
        grid: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/></svg>',
        sun: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
    };

    const $ = (id) => document.getElementById(id);
    const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const iconHtml = (name) => ICONS[name] || ICONS.star;

    let data = null;
    let categoryBySlug = new Map();

    function load() {
        try {
            if (!window.FAQ_DATA || !Array.isArray(window.FAQ_DATA.categories)) {
                throw new Error('FAQ_DATA missing or malformed — check data/faqs.js loaded before js/faqs.js');
            }
            data = window.FAQ_DATA;
            categoryBySlug = new Map(data.categories.map((c) => [c.slug, c]));
            $('view-loading').hidden = true;
            route();
        } catch (err) {
            console.error('Failed to load FAQs:', err);
            $('view-loading').hidden = true;
            $('view-error').hidden = false;
        }
    }

    /* ---------- Routing ---------- */

    function parseHash() {
        const raw = (location.hash || '').replace(/^#\/?/, '');
        if (!raw) return { view: 'home' };
        const [cat, q] = raw.split('/').filter(Boolean);
        if (cat && q) return { view: 'article', cat, q };
        if (cat) return { view: 'category', cat };
        return { view: 'home' };
    }

    function route() {
        if (!data) return;
        const r = parseHash();

        const searchInput = $('search-input');
        if (searchInput.value.trim()) {
            renderSearch(searchInput.value.trim());
            return;
        }

        if (r.view === 'home') return renderHome();
        if (r.view === 'category') {
            const cat = categoryBySlug.get(r.cat);
            if (!cat) { console.warn('Unknown category', r.cat); location.hash = '#/'; return; }
            return renderCategory(cat);
        }
        if (r.view === 'article') {
            const cat = categoryBySlug.get(r.cat);
            const q = cat?.questions.find((x) => x.slug === r.q);
            if (!cat || !q) { console.warn('Unknown article', r.cat, r.q); location.hash = '#/'; return; }
            return renderArticle(cat, q);
        }
    }

    function showOnly(viewId) {
        ['view-categories', 'view-category', 'view-article', 'view-search'].forEach((id) => {
            $(id).hidden = id !== viewId;
        });
    }

    /* ---------- Renderers ---------- */

    function renderBreadcrumb(parts) {
        const el = $('breadcrumb');
        if (!parts || parts.length === 0) { el.hidden = true; el.innerHTML = ''; return; }
        const frags = parts.map((p, i) => {
            const last = i === parts.length - 1;
            const sep = i > 0 ? '<span class="breadcrumb__sep">›</span>' : '';
            if (last) return `${sep}<span class="breadcrumb__current">${escapeHtml(p.label)}</span>`;
            return `${sep}<a href="${p.href}">${escapeHtml(p.label)}</a>`;
        });
        el.innerHTML = frags.join(' ');
        el.hidden = false;
    }

    function renderHome() {
        document.title = 'FAQs - Gratitude App';
        renderBreadcrumb(null);
        const grid = $('categories-grid');
        grid.innerHTML = data.categories.map((c) => `
            <a class="category-card" href="#/${encodeURIComponent(c.slug)}">
                <span class="category-card__icon">${iconHtml(c.icon)}</span>
                <div class="category-card__title">${escapeHtml(c.title)}</div>
                <div class="category-card__subtitle">${escapeHtml(c.subtitle || '')}</div>
                <div class="category-card__count">${c.questions.length} ${c.questions.length === 1 ? 'article' : 'articles'}</div>
            </a>
        `).join('');
        showOnly('view-categories');
        window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    }

    function renderCategory(cat) {
        document.title = `${cat.title} - Gratitude FAQs`;
        renderBreadcrumb([
            { label: 'Home', href: '#/' },
            { label: cat.title }
        ]);
        $('category-icon').innerHTML = iconHtml(cat.icon);
        $('category-title').textContent = cat.title;
        $('category-subtitle').textContent = cat.subtitle || '';
        $('question-list').innerHTML = cat.questions.map((q) => `
            <li class="question-list__item">
                <a href="#/${encodeURIComponent(cat.slug)}/${encodeURIComponent(q.slug)}">${escapeHtml(q.title)}</a>
            </li>
        `).join('');
        showOnly('view-category');
        window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    }

    function renderArticle(cat, q) {
        document.title = `${q.title} - Gratitude FAQs`;
        renderBreadcrumb([
            { label: 'Home', href: '#/' },
            { label: cat.title, href: `#/${encodeURIComponent(cat.slug)}` },
            { label: q.title }
        ]);
        $('article-title').textContent = q.title;
        $('article-body').innerHTML = q.answer || '';
        showOnly('view-article');
        window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    }

    /* ---------- Search ---------- */

    function renderSearch(query) {
        const lower = query.toLowerCase();
        const groups = data.categories.map((c) => ({
            cat: c,
            matches: c.questions.filter((q) =>
                q.title.toLowerCase().includes(lower) ||
                (q.answer || '').toLowerCase().includes(lower)
            )
        })).filter((g) => g.matches.length > 0);

        const total = groups.reduce((n, g) => n + g.matches.length, 0);
        $('search-title').textContent = total
            ? `${total} result${total === 1 ? '' : 's'} for "${query}"`
            : `No results for "${query}"`;

        const results = $('search-results');
        if (total === 0) {
            results.innerHTML = '<div class="search-empty">Try a different keyword, or <a href="mailto:team@gratefulness.me">email us</a>.</div>';
        } else {
            results.innerHTML = groups.map((g) => `
                <div class="search-group">
                    <div class="search-group__label">${escapeHtml(g.cat.title)}</div>
                    <ul class="question-list">
                        ${g.matches.map((q) => `
                            <li class="question-list__item">
                                <a href="#/${encodeURIComponent(g.cat.slug)}/${encodeURIComponent(q.slug)}">${escapeHtml(q.title)}</a>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `).join('');
        }
        renderBreadcrumb([{ label: 'Home', href: '#/' }, { label: 'Search' }]);
        showOnly('view-search');
    }

    /* ---------- Init ---------- */

    function debounce(fn, ms) {
        let t;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    }

    window.addEventListener('hashchange', route);
    document.addEventListener('DOMContentLoaded', () => {
        const input = $('search-input');
        input.addEventListener('input', debounce(() => route(), 120));
        load();
    });
})();
