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
    const ICON_KEYS = Object.keys(ICONS);

    const $ = (id) => document.getElementById(id);

    const slugify = (text) => String(text)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    /* ---------- State ---------- */
    let password = sessionStorage.getItem('editorPassword') || '';
    let data = null;            // mutable working copy
    let savedSnapshot = '';     // JSON string of last-saved state
    let selectedCategoryIdx = -1;
    let selectedQuestionIdx = -1;
    let quill = null;
    let suppressQuillChange = false;

    /* ---------- API ---------- */
    const apiBase = () => {
        const url = window.FAQ_CONFIG?.putFaqsUrl;
        if (!url || url.includes('REPLACE-WITH')) {
            throw new Error('FAQ_CONFIG.putFaqsUrl not configured. Update js/config.js with your Lambda URL.');
        }
        return url;
    };

    const getApi = () => {
        const url = window.FAQ_CONFIG?.getFaqsUrl;
        if (!url || url.includes('REPLACE-WITH')) {
            throw new Error('FAQ_CONFIG.getFaqsUrl not configured. Update js/config.js with your Lambda URL.');
        }
        return url;
    };

    async function apiPost(payload) {
        const res = await fetch(apiBase(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-editor-password': password
            },
            body: JSON.stringify(payload)
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(json.error || `Request failed (${res.status})`);
            err.status = res.status;
            throw err;
        }
        return json;
    }

    async function verifyPassword(pwd) {
        const res = await fetch(apiBase(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-editor-password': pwd
            },
            body: JSON.stringify({ action: 'verify' })
        });
        return res.ok;
    }

    async function fetchContent() {
        const res = await fetch(getApi(), { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Failed to load FAQs (${res.status})`);
        return res.json();
    }

    /* ---------- Login ---------- */
    function showLogin(errMsg) {
        $('login').style.display = '';
        $('app').hidden = true;
        const errEl = $('login-error');
        if (errMsg) { errEl.textContent = errMsg; errEl.hidden = false; }
        else { errEl.hidden = true; }
        $('login-password').focus();
    }
    function hideLogin() {
        $('login').style.display = 'none';
        $('app').hidden = false;
    }

    async function handleLoginSubmit(e) {
        e.preventDefault();
        const pwd = $('login-password').value;
        if (!pwd) return;
        $('login-error').hidden = true;
        try {
            const ok = await verifyPassword(pwd);
            if (!ok) {
                showLogin('Incorrect password.');
                return;
            }
            password = pwd;
            sessionStorage.setItem('editorPassword', pwd);
            await bootApp();
        } catch (err) {
            console.error(err);
            showLogin(err.message || 'Login failed.');
        }
    }

    function logout() {
        sessionStorage.removeItem('editorPassword');
        password = '';
        location.reload();
    }

    /* ---------- Dirty tracking ---------- */
    function currentSnapshot() {
        return JSON.stringify(data);
    }
    function isDirty() {
        return data && currentSnapshot() !== savedSnapshot;
    }
    function refreshStatus() {
        const el = $('save-status');
        if (!data) { el.textContent = ''; el.className = 'editor__status'; return; }
        if (isDirty()) {
            el.textContent = 'Unsaved changes';
            el.className = 'editor__status editor__status--dirty';
        } else {
            el.textContent = 'All changes saved';
            el.className = 'editor__status editor__status--ok';
        }
    }

    /* ---------- Boot ---------- */
    async function bootApp() {
        hideLogin();
        try {
            data = await fetchContent();
            if (!data || !Array.isArray(data.categories)) {
                throw new Error('Loaded data is malformed.');
            }
            savedSnapshot = currentSnapshot();
            initQuill();
            populateIconSelect();
            renderSidebar();
            selectCategory(data.categories.length ? 0 : -1);
            refreshStatus();
        } catch (err) {
            console.error(err);
            alert('Failed to load FAQs: ' + err.message);
        }
    }

    /* ---------- Sidebar ---------- */
    function renderSidebar() {
        const list = $('category-list');
        list.innerHTML = '';
        data.categories.forEach((c, i) => {
            const li = document.createElement('li');
            li.className = 'cat-list__item' + (i === selectedCategoryIdx ? ' cat-list__item--active' : '');
            li.innerHTML = `
                <span class="cat-list__icon">${ICONS[c.icon] || ICONS.star}</span>
                <span class="cat-list__label">${escapeHtml(c.title || '(untitled)')}</span>
                <span class="cat-list__count">${c.questions.length}</span>
            `;
            li.addEventListener('click', () => {
                if (!confirmDiscardIfNeeded()) return;
                selectCategory(i);
            });
            list.appendChild(li);
        });
    }

    function addCategory() {
        const newCat = {
            slug: `new-category-${Date.now().toString(36)}`,
            title: 'New category',
            subtitle: '',
            icon: 'star',
            questions: []
        };
        data.categories.push(newCat);
        renderSidebar();
        selectCategory(data.categories.length - 1);
        refreshStatus();
    }

    /* ---------- Category pane ---------- */
    function selectCategory(idx) {
        selectedCategoryIdx = idx;
        selectedQuestionIdx = -1;
        renderSidebar();
        if (idx < 0) {
            $('empty-state').hidden = false;
            $('category-pane').hidden = true;
            $('question-pane').hidden = true;
            return;
        }
        const cat = data.categories[idx];
        $('empty-state').hidden = true;
        $('question-pane').hidden = true;
        $('category-pane').hidden = false;

        $('cat-title').value = cat.title || '';
        $('cat-slug').value = cat.slug || '';
        $('cat-subtitle').value = cat.subtitle || '';
        $('cat-icon').value = ICONS[cat.icon] ? cat.icon : 'star';
        renderIconPreview(cat.icon);
        renderQuestionList(cat);
    }

    function renderQuestionList(cat) {
        const list = $('question-list');
        list.innerHTML = '';
        cat.questions.forEach((q, i) => {
            const li = document.createElement('li');
            li.className = 'q-list__item';
            li.innerHTML = `
                <span class="q-list__item-label">${escapeHtml(q.title || '(untitled)')}</span>
                <span class="q-list__item-arrow">→</span>
            `;
            li.addEventListener('click', () => {
                if (!confirmDiscardIfNeeded()) return;
                selectQuestion(i);
            });
            list.appendChild(li);
        });
    }

    function bindCategoryFields() {
        $('cat-title').addEventListener('input', (e) => {
            if (selectedCategoryIdx < 0) return;
            data.categories[selectedCategoryIdx].title = e.target.value;
            renderSidebar();
            refreshStatus();
        });
        $('cat-slug').addEventListener('input', (e) => {
            if (selectedCategoryIdx < 0) return;
            data.categories[selectedCategoryIdx].slug = slugify(e.target.value);
            e.target.value = data.categories[selectedCategoryIdx].slug;
            refreshStatus();
        });
        $('cat-subtitle').addEventListener('input', (e) => {
            if (selectedCategoryIdx < 0) return;
            data.categories[selectedCategoryIdx].subtitle = e.target.value;
            refreshStatus();
        });
        $('cat-icon').addEventListener('change', (e) => {
            if (selectedCategoryIdx < 0) return;
            data.categories[selectedCategoryIdx].icon = e.target.value;
            renderIconPreview(e.target.value);
            renderSidebar();
            refreshStatus();
        });
        $('add-category-btn').addEventListener('click', addCategory);
        $('delete-category-btn').addEventListener('click', () => {
            if (selectedCategoryIdx < 0) return;
            const cat = data.categories[selectedCategoryIdx];
            const qCount = cat.questions.length;
            const msg = qCount
                ? `Delete category "${cat.title}" and its ${qCount} question${qCount === 1 ? '' : 's'}? This cannot be undone (until you save, you can refresh to restore).`
                : `Delete category "${cat.title}"?`;
            if (!confirm(msg)) return;
            data.categories.splice(selectedCategoryIdx, 1);
            const newIdx = Math.min(selectedCategoryIdx, data.categories.length - 1);
            renderSidebar();
            selectCategory(newIdx);
            refreshStatus();
        });
        $('add-question-btn').addEventListener('click', addQuestion);
    }

    function populateIconSelect() {
        const sel = $('cat-icon');
        sel.innerHTML = ICON_KEYS.map((k) => `<option value="${k}">${k}</option>`).join('');
    }

    function renderIconPreview(iconKey) {
        $('cat-icon-preview').innerHTML = ICONS[iconKey] || ICONS.star;
    }

    /* ---------- Question pane ---------- */
    function selectQuestion(idx) {
        selectedQuestionIdx = idx;
        const cat = data.categories[selectedCategoryIdx];
        const q = cat.questions[idx];
        $('category-pane').hidden = true;
        $('empty-state').hidden = true;
        $('question-pane').hidden = false;

        $('q-title').value = q.title || '';
        $('q-slug').value = q.slug || '';

        suppressQuillChange = true;
        quill.root.innerHTML = q.answer || '';
        suppressQuillChange = false;
    }

    function addQuestion() {
        if (selectedCategoryIdx < 0) return;
        const cat = data.categories[selectedCategoryIdx];
        const newQ = {
            slug: `new-question-${Date.now().toString(36)}`,
            title: 'New question',
            answer: '<p></p>'
        };
        cat.questions.push(newQ);
        renderQuestionList(cat);
        renderSidebar();
        selectQuestion(cat.questions.length - 1);
        refreshStatus();
    }

    function bindQuestionFields() {
        $('q-title').addEventListener('input', (e) => {
            if (selectedCategoryIdx < 0 || selectedQuestionIdx < 0) return;
            data.categories[selectedCategoryIdx].questions[selectedQuestionIdx].title = e.target.value;
            refreshStatus();
        });
        $('q-slug').addEventListener('input', (e) => {
            if (selectedCategoryIdx < 0 || selectedQuestionIdx < 0) return;
            const slug = slugify(e.target.value);
            data.categories[selectedCategoryIdx].questions[selectedQuestionIdx].slug = slug;
            e.target.value = slug;
            refreshStatus();
        });
        $('back-to-category').addEventListener('click', () => {
            selectCategory(selectedCategoryIdx);
        });
        $('delete-question-btn').addEventListener('click', () => {
            if (selectedCategoryIdx < 0 || selectedQuestionIdx < 0) return;
            const q = data.categories[selectedCategoryIdx].questions[selectedQuestionIdx];
            if (!confirm(`Delete question "${q.title}"?`)) return;
            data.categories[selectedCategoryIdx].questions.splice(selectedQuestionIdx, 1);
            selectCategory(selectedCategoryIdx);
            refreshStatus();
        });
    }

    /* ---------- Quill ---------- */
    function initQuill() {
        if (quill) return;
        quill = new Quill('#quill-editor', {
            theme: 'snow',
            modules: {
                toolbar: {
                    container: [
                        [{ header: [2, 3, false] }],
                        ['bold', 'italic', 'underline'],
                        [{ list: 'ordered' }, { list: 'bullet' }],
                        ['link', 'image'],
                        ['clean']
                    ],
                    handlers: { image: handleImageUpload }
                }
            }
        });
        quill.on('text-change', () => {
            if (suppressQuillChange) return;
            if (selectedCategoryIdx < 0 || selectedQuestionIdx < 0) return;
            const html = quill.root.innerHTML;
            data.categories[selectedCategoryIdx].questions[selectedQuestionIdx].answer = html;
            refreshStatus();
        });
    }

    function handleImageUpload() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml';
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
                alert('Image must be 5 MB or smaller.');
                return;
            }
            const altText = prompt('Describe this image for accessibility (alt text):', '') || '';
            setStatus('Uploading image…', 'saving');
            try {
                const dataBase64 = await fileToBase64(file);
                const res = await apiPost({
                    action: 'upload-image',
                    filename: file.name,
                    dataBase64
                });
                const range = quill.getSelection(true);
                quill.insertEmbed(range.index, 'image', res.url, 'user');
                // Set alt attribute on the inserted image
                setTimeout(() => {
                    const img = quill.root.querySelector(`img[src="${res.url}"]`);
                    if (img && altText) img.setAttribute('alt', altText);
                    // Trigger change so dirty state updates
                    if (selectedCategoryIdx >= 0 && selectedQuestionIdx >= 0) {
                        data.categories[selectedCategoryIdx].questions[selectedQuestionIdx].answer = quill.root.innerHTML;
                        refreshStatus();
                    }
                }, 0);
                quill.setSelection(range.index + 1, 0);
                setStatus('Image uploaded', 'ok');
                setTimeout(refreshStatus, 1500);
            } catch (err) {
                console.error(err);
                setStatus('Upload failed: ' + err.message, 'err');
            }
        });
        input.click();
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result || '';
                const base64 = String(result).split(',')[1] || '';
                resolve(base64);
            };
            reader.onerror = () => reject(new Error('Could not read file.'));
            reader.readAsDataURL(file);
        });
    }

    /* ---------- Saving ---------- */
    function setStatus(text, kind) {
        const el = $('save-status');
        el.textContent = text;
        el.className = 'editor__status' + (kind ? ` editor__status--${kind}` : '');
    }

    function validateBeforeSave() {
        if (!data || !Array.isArray(data.categories)) return 'No data loaded.';
        const seenCatSlugs = new Set();
        for (const c of data.categories) {
            if (!c.slug) return `Category "${c.title || '(untitled)'}" needs a slug.`;
            if (seenCatSlugs.has(c.slug)) return `Duplicate category slug: ${c.slug}`;
            seenCatSlugs.add(c.slug);
            if (!c.title?.trim()) return `Category "${c.slug}" needs a title.`;
            if (!ICONS[c.icon]) return `Category "${c.slug}" has an invalid icon.`;
            const seenQSlugs = new Set();
            for (const q of c.questions) {
                if (!q.slug) return `Question in "${c.slug}" needs a slug.`;
                if (seenQSlugs.has(q.slug)) return `Duplicate question slug "${q.slug}" in ${c.slug}`;
                seenQSlugs.add(q.slug);
                if (!q.title?.trim()) return `Question "${q.slug}" in "${c.slug}" needs a title.`;
            }
        }
        return null;
    }

    async function saveAll() {
        const problem = validateBeforeSave();
        if (problem) {
            setStatus(problem, 'err');
            alert(problem);
            return;
        }
        setStatus('Saving…', 'saving');
        $('save-btn').disabled = true;
        try {
            await apiPost({ action: 'save-content', content: data });
            savedSnapshot = currentSnapshot();
            // Clear public-site cache so editor users see fresh data after switching tabs.
            try { localStorage.removeItem('faq-content-cache-v1'); } catch {}
            setStatus('Saved', 'ok');
            setTimeout(refreshStatus, 1500);
        } catch (err) {
            console.error(err);
            if (err.status === 401) {
                setStatus('Session expired — please log in again', 'err');
                logout();
                return;
            }
            setStatus('Save failed: ' + err.message, 'err');
        } finally {
            $('save-btn').disabled = false;
        }
    }

    /* ---------- Discard guard ---------- */
    function confirmDiscardIfNeeded() {
        // Currently every field is auto-applied to `data` on input, so switching
        // panes doesn't lose anything — only an unsaved Save would. We keep this
        // helper as a hook in case future fields need explicit commit.
        return true;
    }

    /* ---------- Utils ---------- */
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    /* ---------- Init ---------- */
    function init() {
        $('login-form').addEventListener('submit', handleLoginSubmit);
        $('logout-btn').addEventListener('click', logout);
        $('save-btn').addEventListener('click', saveAll);
        $('preview-btn').addEventListener('click', () => window.open('index.html', '_blank'));
        bindCategoryFields();
        bindQuestionFields();

        window.addEventListener('beforeunload', (e) => {
            if (isDirty()) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                saveAll();
            }
        });

        if (password) {
            // Verify silently; if invalid, fall back to login.
            verifyPassword(password).then((ok) => {
                if (ok) bootApp();
                else { password = ''; sessionStorage.removeItem('editorPassword'); showLogin(); }
            }).catch(() => showLogin());
        } else {
            showLogin();
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
