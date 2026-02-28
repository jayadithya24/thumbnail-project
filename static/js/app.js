let isLoginMode = true;
// API base - change if your backend runs elsewhere
    const API_BASE = "http://127.0.0.1:5000";

    // Feature flags (local UI only)
    const featureFlags = {
    analytics: { enabled: false, name: 'Analytics Dashboard', description: 'View stats and insights about your thumbnails' },
    categories: { enabled: false, name: 'Categories & Tags', description: 'Organize thumbnails by category' },
    favorites: { enabled: false, name: 'Favorites System', description: 'Star your best thumbnails' }
};

    // Current state
    let boards = [];
    let currentBoardId = null;
    let currentFilter = 'all';
    let thumbnailsCache = {}; // boardId -> thumbnails array

    // -------------------------
    // API helpers
    // -------------------------
    function getAuthHeaders() {
    const token = localStorage.getItem("token");
    return {
        "Content-Type": "application/json",
        "Authorization": token ? "Bearer " + token : ""
    };
}

async function apiGet(path) {
    const res = await fetch(API_BASE + path, {
        headers: getAuthHeaders()
    });

    if (res.status === 401) {
        alert("Session expired. Please login again.");
        logout();
        return;
    }

    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);

    return res.json();
}

async function apiPost(path, body) {
    const res = await fetch(API_BASE + path, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
    });

    if (res.status === 401) {
        alert("Session expired. Please login again.");
        logout();
        return;
    }

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`POST ${path} failed: ${res.status} ${text}`);
    }

    return res.json();
}

async function apiDelete(path) {
    const res = await fetch(API_BASE + path, {
        method: "DELETE",
        headers: getAuthHeaders()
    });

    if (res.status === 401) {
        alert("Session expired. Please login again.");
        logout();
        return;
    }

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`DELETE ${path} failed: ${res.status} ${text}`);
    }

    return res.json();
}

async function apiPatch(path, body) {
    const res = await fetch(API_BASE + path, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: body ? JSON.stringify(body) : undefined
    });

    if (res.status === 401) {
        alert("Session expired. Please login again.");
        logout();
        return;
    }

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`PATCH ${path} failed: ${res.status} ${text}`);
    }

    return res.json();
}

    // -------------------------
    // Boards
    // -------------------------
    async function loadBoards() {
        try {
            boards = await apiGet("/boards");
            if (boards.length > 0) {
                if (!currentBoardId) currentBoardId = boards[0].id;
            } else {
                currentBoardId = null;
            }
            renderBoards();
            if (currentBoardId) {
                await loadThumbnails(currentBoardId);
            } else {
                document.getElementById('thumbnailGrid').innerHTML = '<div class="empty-state">No boards yet. Create one!</div>';
            }
        } catch (err) {
            console.error(err);
            alert("Failed to load boards: " + err.message);
        }
    }

    function renderBoards() {
        const list = document.getElementById('boardList');
        list.innerHTML = boards.map(board => `
            <div class="board-item ${board.id === currentBoardId ? 'active' : ''}" onclick="switchBoard('${board.id}')">
                <div class="board-info">
                    <div class="board-name">${escapeHtml(board.name)}</div>
                    <div class="board-count">${board.thumbnail_count} thumbnails</div>
                </div>
                <div class="board-actions">
                    <button class="board-action-btn" onclick="event.stopPropagation(); deleteBoard('${board.id}')" title="Delete board">
                        <svg class="small-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
        // Update header
        const header = document.getElementById('currentBoardName');
        const cur = boards.find(b => b.id === currentBoardId);
        header.textContent = cur ? cur.name : 'Pro Creator Hub';
    }

    async function createNewBoard() {
        const name = document.getElementById('newBoardNameInput').value.trim();
        if (!name) return alert("Please enter a board name");
        try {
            const res = await apiPost("/boards", { name });
            await loadBoards();
            closeNewBoardModal();
        } catch (err) {
            console.error(err);
            alert("Failed to create board: " + err.message);
        }
    }

    async function deleteBoard(boardId) {
        if (!confirm("Are you sure you want to delete this board? All thumbnails will be lost.")) return;
        try {
            await apiDelete(`/boards/${boardId}`);
            // Clear cache
            delete thumbnailsCache[boardId];
            await loadBoards();
        } catch (err) {
            console.error(err);
            alert("Failed to delete board: " + err.message);
        }
    }

    function switchBoard(boardId) {
        currentBoardId = boardId;
        currentFilter = 'all';
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        const allBtn = Array.from(document.querySelectorAll('.filter-btn')).find(b => b.textContent.trim() === 'All');
        if (allBtn) allBtn.classList.add('active');
        renderBoards();
        loadThumbnails(currentBoardId);
    }

    // -------------------------
    // Thumbnails
    // -------------------------
    async function loadThumbnails(boardId) {
        try {
            const thumbs = await apiGet(`/boards/${boardId}/thumbnails`);
            thumbnailsCache[boardId] = thumbs;
            renderThumbnails();
            if (featureFlags.analytics.enabled) updateStats();
        } catch (err) {
            console.error(err);
            document.getElementById('thumbnailGrid').innerHTML = '<div class="empty-state">Failed to load thumbnails</div>';
        }
    }

    function renderThumbnails() {
        const grid = document.getElementById('thumbnailGrid');
        const board = boards.find(b => b.id === currentBoardId);
        const all = thumbnailsCache[currentBoardId] || [];
        let filtered = all;

if (currentFilter !== 'all') {
    if (currentFilter === 'favorites') {
        filtered = all.filter(t => t.favorite);
    } else {
        filtered = all.filter(t => t.category === currentFilter);
    }
}

        if (filtered.length === 0) {
            grid.innerHTML = '<div class="empty-state">No thumbnails found. Add one to get started!</div>';
            return;
        }

        grid.innerHTML = filtered.map(thumb => `
            <div class="thumbnail-card" data-id="${thumb.id}">
                <div class="thumbnail-image-wrapper">
                    <img src="${escapeHtml(thumb.thumbnail_url)}" alt="${escapeHtml(thumb.title)}" />
                    <div class="thumbnail-actions">
                        ${featureFlags.favorites.enabled ? `<button class="action-btn" onclick="event.stopPropagation(); toggleFavorite('${thumb.id}')" type="button">${thumb.favorite ? '⭐' : '☆'}</button>` : ''}
                        <button class="action-btn delete" onclick="event.stopPropagation(); removeThumbnail('${thumb.id}')" type="button">
                            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="thumbnail-info">
                    <div class="thumbnail-title">${escapeHtml(thumb.title)}</div>
                    ${featureFlags.categories.enabled ? `<div class="thumbnail-meta"><span class="category-tag">${escapeHtml(thumb.category)}</span></div>` : ''}
                </div>
            </div>
        `).join('');
    }

    async function addThumbnailAPI(videoUrl, title, category) {
        if (!currentBoardId) return alert("Select or create a board first.");
        try {
            await apiPost(`/boards/${currentBoardId}/thumbnails`, {
                video_url: videoUrl,
                title,
                category
            });
            await loadThumbnails(currentBoardId);
            if (featureFlags.analytics.enabled) updateStats();
        } catch (err) {
            console.error(err);
            alert("Failed to add thumbnail: " + err.message);
        }
    }

    async function removeThumbnail(thumbId) {
        if (!confirm("Delete this thumbnail?")) return;
        try {
            await apiDelete(`/thumbnails/${thumbId}`);
            // remove from cache
            const arr = thumbnailsCache[currentBoardId] || [];
            thumbnailsCache[currentBoardId] = arr.filter(t => t.id !== thumbId);
            renderThumbnails();
            if (featureFlags.analytics.enabled) updateStats();
        } catch (err) {
            console.error(err);
            alert("Failed to delete thumbnail: " + err.message);
        }
    }

    async function toggleFavorite(thumbId) {
        try {
            const res = await apiPatch(`/thumbnails/${thumbId}/favorite`);
            // update cache
            const arr = thumbnailsCache[currentBoardId] || [];
            const t = arr.find(x => x.id === thumbId);
            if (t) t.favorite = res.favorite;
            renderThumbnails();
            if (featureFlags.analytics.enabled) updateStats();
        } catch (err) {
            console.error(err);
            alert("Failed to toggle favorite: " + err.message);
        }
    }

    // -------------------------
    // Filter & Stats
    // -------------------------
    function filterThumbnails(filter, event) {
    currentFilter = filter;

    // Remove active class from all buttons
    document.querySelectorAll('.filter-btn').forEach(btn =>
        btn.classList.remove('active')
    );

    // Add active class to clicked button
    if (event) {
        event.target.classList.add('active');
    }

    // Re-render thumbnails
    renderThumbnails();
}

    function updateStats() {
        const board = boards.find(b => b.id === currentBoardId);
        const all = thumbnailsCache[currentBoardId] || [];
        document.getElementById('totalCount').textContent = all.length;
        document.getElementById('monthCount').textContent = all.filter(t => new Date(t.created_at).getMonth() === new Date().getMonth()).length;
        document.getElementById('favCount').textContent = all.filter(t => t.favorite).length;
    }

    // -------------------------
    // Feature Flags UI
    // -------------------------
    function renderFeatureFlags() {
    const list = document.getElementById('featureFlagsList');
    if (!list) return;   // prevent crash

    list.innerHTML = Object.entries(featureFlags).map(([key, flag]) => `
        <div class="feature-flag">
            <div class="feature-info">
                <h3>${flag.name}</h3>
                <p>${flag.description}</p>
            </div>
            <div class="toggle-switch ${flag.enabled ? 'active' : ''}" onclick="toggleFeature('${key}')"></div>
        </div>
    `).join('');
}

    function toggleFeature(key) {
        featureFlags[key].enabled = !featureFlags[key].enabled;
        renderFeatureFlags();
        applyFeatureFlags();
        renderThumbnails();
    }

    function applyFeatureFlags() {
    const stats = document.getElementById('statsBar');
    const titleInput = document.getElementById('titleInput');
    const categorySelect = document.getElementById('categorySelect');

    if (stats) {
        stats.style.display = featureFlags.analytics.enabled ? 'flex' : 'none';
    }

    if (titleInput) {
        titleInput.style.display = featureFlags.categories.enabled ? 'block' : 'none';
    }

    if (categorySelect) {
        categorySelect.style.display = featureFlags.categories.enabled ? 'block' : 'none';
    }

    if (featureFlags.analytics.enabled) {
        updateStats();
    }
}

    // -------------------------
    // Form handling
    // -------------------------
    document.getElementById("linkForm").addEventListener("submit", async function(e){
        e.preventDefault();
        const url = document.getElementById("linkInput").value.trim();
        const title = document.getElementById("titleInput").value.trim() || "New Content";
        const category = document.getElementById("categorySelect").value || "general";
        if (!url) return;

        const addBtn = document.getElementById("addBtn");
        addBtn.disabled = true;
        try {
            await addThumbnailAPI(url, title, category);
            document.getElementById("linkInput").value = "";
            document.getElementById("titleInput").value = "";
        } catch (err) {
            console.error(err);
            alert("Error adding thumbnail");
        } finally {
            addBtn.disabled = false;
        }
    });

    // -------------------------
    // Modals
    // -------------------------
    async function openNewBoardModal() {
    const name = prompt("Enter board name:");
    if (!name) return;

    try {
        await apiPost("/boards", { name });
        await loadBoards();
    } catch (err) {
        console.error(err);
        alert("Failed to create board");
    }
}
    

    // -------------------------
    // Utility
    // -------------------------
    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }



function toggleAuthMode() {
    isLoginMode = !isLoginMode;

    const title = document.getElementById("authTitle");
    const button = document.getElementById("authBtn");
    const switchText = document.getElementById("switchText");
    const switchLink = document.getElementById("switchLink");

    if (isLoginMode) {
        title.innerText = "Login";
        button.innerText = "Login";
        switchText.innerText = "Don't have an account?";
        switchLink.innerText = "Register";
    } else {
        title.innerText = "Register";
        button.innerText = "Register";
        switchText.innerText = "Already have an account?";
        switchLink.innerText = "Login";
    }
}

function handleAuth() {
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    if (isLoginMode) {
        loginUser(email, password);
    } else {
        registerUser(email, password);
    }
}

async function registerUser(email, password) {
    const res = await fetch(API_BASE + "/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok) {
        alert("Registration successful! Please login.");
        toggleAuthMode();
    } else {
        alert(data.error || "Registration failed");
    }
}

async function loginUser(email, password) {
    const res = await fetch(API_BASE + "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (data.token) {
        localStorage.setItem("token", data.token);
        document.getElementById("loginOverlay").style.display = "none";
        loadBoards();
    } else {
        alert("Login failed");
    }
}

function logout() {
    localStorage.removeItem("token");
    location.reload();
}
function openFeatureFlags() {
    const modal = document.getElementById('featureFlagsModal');
    if (modal) modal.classList.add('active');
}

function closeFeatureFlags() {
    const modal = document.getElementById('featureFlagsModal');
    if (modal) modal.classList.remove('active');
}
    // -------------------------
    // Init
    // -------------------------
    document.addEventListener("DOMContentLoaded", function () {

    renderFeatureFlags();
    applyFeatureFlags();

    if (localStorage.getItem("token")) {
        document.getElementById("loginOverlay").style.display = "none";
        loadBoards();
    }

});