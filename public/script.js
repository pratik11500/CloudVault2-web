let posts = [];
let currentFilter = 'all';
let searchQuery = '';
let currentAction = 'create'; // Tracks whether password is for 'create' or 'delete'
let currentPostId = null; // Stores post ID for deletion

// DOM elements
let postsContainer, categoryItems, searchInput, addPostBtn, addPostModal, closeModal, cancelBtn, postForm;
let passwordModal, closePasswordModal, cancelPasswordBtn, passwordForm, passwordAction;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Get DOM elements
    postsContainer = document.getElementById('postsContainer');
    categoryItems = document.querySelectorAll('.category-item');
    searchInput = document.getElementById('searchInput');
    addPostBtn = document.getElementById('addPostBtn');
    addPostModal = document.getElementById('addPostModal');
    closeModal = document.getElementById('closeModal');
    cancelBtn = document.getElementById('cancelBtn');
    postForm = document.getElementById('postForm');
    passwordModal = document.getElementById('passwordModal');
    closePasswordModal = document.getElementById('closePasswordModal');
    cancelPasswordBtn = document.getElementById('cancelPasswordBtn');
    passwordForm = document.getElementById('passwordForm');
    passwordAction = document.getElementById('passwordAction');

    setupEventListeners();
    loadPosts();
    startPolling();
    setupMobileToggle();
});

// Setup mobile sidebar toggle
function setupMobileToggle() {
    const mobileToggle = document.querySelector('.mobile-toggle');
    if (mobileToggle) {
        mobileToggle.addEventListener('click', function() {
            const sidebar = document.querySelector('.sidebar');
            const body = document.body;
            if (sidebar.classList.contains('mobile-open')) {
                sidebar.classList.remove('mobile-open');
                body.classList.remove('sidebar-open');
            } else {
                sidebar.classList.add('mobile-open');
                body.classList.add('sidebar-open');
            }
        });
    }

    document.addEventListener('click', function(e) {
        const sidebar = document.querySelector('.sidebar');
        const mobileToggle = document.querySelector('.mobile-toggle');
        if (window.innerWidth <= 768 && 
            sidebar.classList.contains('mobile-open') && 
            !sidebar.contains(e.target) && 
            !mobileToggle.contains(e.target)) {
            sidebar.classList.remove('mobile-open');
            document.body.classList.remove('sidebar-open');
        }
    });
}

// Generate password based on current time (HHMM + 11)
function generatePassword() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const timeNumber = parseInt(`${hours}${minutes}`, 10);
    const password = (timeNumber + 11).toString().padStart(4, '0');
    return password;
}

// Show password modal with action
function showPasswordModal(action, postId = null) {
    if (passwordModal && passwordAction) {
        currentAction = action;
        currentPostId = postId;
        passwordAction.textContent = action === 'create' ? 'Create Post' : 'Delete Post';
        passwordModal.classList.add('show');
        document.body.style.overflow = 'hidden';
        document.getElementById('passwordInput').focus();
    }
}

// Hide password modal
function hidePasswordModal() {
    if (passwordModal) {
        passwordModal.classList.remove('show');
        document.body.style.overflow = 'auto';
        if (passwordForm) {
            passwordForm.reset();
        }
        currentAction = 'create'; // Reset to default
        currentPostId = null;
    }
}

// Setup all event listeners
function setupEventListeners() {
    // Category filtering
    if (categoryItems) {
        categoryItems.forEach(item => {
            item.addEventListener('click', function() {
                categoryItems.forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                currentFilter = this.dataset.filter;
                renderPosts();
                if (window.innerWidth <= 768) {
                    const sidebar = document.querySelector('.sidebar');
                    sidebar.classList.remove('mobile-open');
                    document.body.classList.remove('sidebar-open');
                }
            });
        });
    }

    // Search functionality
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            searchQuery = this.value.toLowerCase();
            renderPosts();
        });
    }

    // Modal controls for add post
    if (addPostBtn) {
        addPostBtn.addEventListener('click', () => showPasswordModal('create'));
    }
    if (closeModal) {
        closeModal.addEventListener('click', () => hideModal());
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => hideModal());
    }
    if (addPostModal) {
        addPostModal.addEventListener('click', function(e) {
            if (e.target === this) hideModal();
        });
    }
    if (postForm) {
        postForm.addEventListener('submit', handleFormSubmit);
    }

    // Modal controls for password
    if (closePasswordModal) {
        closePasswordModal.addEventListener('click', () => hidePasswordModal());
    }
    if (cancelPasswordBtn) {
        cancelPasswordBtn.addEventListener('click', () => hidePasswordModal());
    }
    if (passwordModal) {
        passwordModal.addEventListener('click', function(e) {
            if (e.target === this) hidePasswordModal();
        });
    }
    if (passwordForm) {
        passwordForm.addEventListener('submit', handlePasswordSubmit);
    }
}

// Handle password form submission
async function handlePasswordSubmit(e) {
    e.preventDefault();
    const passwordInput = document.getElementById('passwordInput').value.trim();
    const correctPassword = generatePassword();

    if (passwordInput === correctPassword) {
        hidePasswordModal();
        if (currentAction === 'create') {
            showModal();
        } else if (currentAction === 'delete' && currentPostId) {
            await deletePost(currentPostId);
        }
    } else {
        showNotification('Incorrect password. Please try again.', 'error');
    }
}

// Load posts from API
async function loadPosts() {
    try {
        const response = await fetch('/api/messages');
        if (response.ok) {
            posts = await response.json();
            renderPosts();
            updateCategoryCounts();
        } else {
            console.log('No posts yet or API not ready');
            renderPosts();
        }
    } catch (error) {
        console.log('Loading from local storage...');
        loadFromLocalStorage();
        renderPosts();
        updateCategoryCounts();
    }
}

// Load from local storage as fallback
function loadFromLocalStorage() {
    const stored = localStorage.getItem('discordMessages');
    if (stored) {
        posts = JSON.parse(stored);
    }
}

// Save to local storage
function saveToLocalStorage() {
    localStorage.setItem('discordMessages', JSON.stringify(posts));
}

// Filter and search posts
function getFilteredPosts() {
    let filtered = posts;
    if (currentFilter !== 'all') {
        filtered = filtered.filter(post => post.tag === currentFilter);
    }
    if (searchQuery) {
        filtered = filtered.filter(post => 
            (post.topic && post.topic.toLowerCase().includes(searchQuery)) ||
            (post.description && post.description.toLowerCase().includes(searchQuery)) ||
            (post.message && post.message.toLowerCase().includes(searchQuery)) ||
            (post.tag && post.tag.toLowerCase().includes(searchQuery))
        );
    }
    return filtered;
}

// Render posts based on current filter and search
function renderPosts() {
    if (!postsContainer) return;
    const filteredPosts = getFilteredPosts();
    if (filteredPosts.length === 0) {
        const emptyMessage = searchQuery 
            ? `No posts found for "${searchQuery}"` 
            : currentFilter === 'all' 
                ? 'No posts yet. Create your first post or send a message in Discord!' 
                : `No ${currentFilter} posts yet.`;
        postsContainer.innerHTML = `
            <div class="no-posts">
                <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: 16px; opacity: 0.5;"></i>
                <p>${emptyMessage}</p>
            </div>
        `;
        return;
    }
    filteredPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    postsContainer.innerHTML = filteredPosts.map(post => `
        <div class="post-card" data-post-id="${post.id}">
            <div class="post-header-actions">
                <button class="delete-btn" onclick="showPasswordModal('delete', '${post.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            ${post.topic ? `<div class="post-topic">${escapeHtml(post.topic)}</div>` : ''}
            <div class="post-description">
                ${escapeHtml(post.description || post.message || 'No description')}
            </div>
            ${post.link ? `
                <a href="${escapeHtml(post.link)}" class="post-link" target="_blank" rel="noopener noreferrer">
                    <i class="fas fa-link"></i>
                    <span class="link-text">${escapeHtml(post.link)}</span>
                </a>
            ` : ''}
            <div class="post-footer">
                <div class="post-tag tag-${post.tag}">${post.tag}</div>
                <div class="post-time">${formatTime(post.timestamp)}</div>
            </div>
        </div>
    `).join('');
}

// Update category counts
function updateCategoryCounts() {
    const counts = {
        all: posts.length,
        Entertainment: posts.filter(p => p.tag === 'Entertainment').length,
        Education: posts.filter(p => p.tag === 'Education').length,
        Website: posts.filter(p => p.tag === 'Website').length,
        Hack: posts.filter(p => p.tag === 'Hack').length,
        Others: posts.filter(p => p.tag === 'Others').length
    };
    Object.keys(counts).forEach(category => {
        const countElement = document.getElementById(`count-${category}`);
        if (countElement) {
            countElement.textContent = counts[category];
        }
    });
}

// Modal functions for add post
function showModal() {
    if (addPostModal) {
        addPostModal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function hideModal() {
    if (addPostModal) {
        addPostModal.classList.remove('show');
        document.body.style.overflow = 'auto';
        if (postForm) {
            postForm.reset();
        }
    }
}

// Handle post form submission
async function handleFormSubmit(e) {
    e.preventDefault();
    const formData = {
        topic: document.getElementById('postTopic').value.trim(),
        description: document.getElementById('postDescription').value.trim(),
        link: document.getElementById('postLink').value.trim(),
        tag: document.getElementById('postTag').value,
        source: 'website'
    };
    if (!formData.topic || !formData.description || !formData.tag) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        if (response.ok) {
            hideModal();
            await loadPosts();
            showNotification('Post created successfully!', 'success');
        } else {
            throw new Error('Failed to create post');
        }
    } catch (error) {
        console.error('Error creating post:', error);
        showNotification('Failed to create post. Please try again.', 'error');
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        ${message}
    `;
    if (!document.querySelector('#notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                background: var(--bg-secondary);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 16px 20px;
                color: var(--text-primary);
                display: flex;
                align-items: center;
                gap: 12px;
                z-index: 2000;
                animation: slideInRight 0.3s ease;
                box-shadow: 0 8px 32px var(--shadow);
            }
            .notification.success { border-left: 4px solid var(--accent-green); }
            .notification.error { border-left: 4px solid #ff6b6b; }
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Format timestamp
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

// Poll for new posts every 3 seconds
function startPolling() {
    setInterval(async () => {
        try {
            const response = await fetch('/api/messages');
            if (response.ok) {
                const newPosts = await response.json();
                if (newPosts.length !== posts.length) {
                    posts = newPosts;
                    renderPosts();
                    updateCategoryCounts();
                }
            }
        } catch (error) {
            checkForLocalUpdates();
        }
    }, 3000);
}

// Check for local updates (fallback)
function checkForLocalUpdates() {
    const stored = localStorage.getItem('discordMessages');
    if (stored) {
        const storedPosts = JSON.parse(stored);
        if (storedPosts.length !== posts.length) {
            posts = storedPosts;
            renderPosts();
            updateCategoryCounts();
        }
    }
}

// Delete post function
async function deletePost(postId) {
    try {
        const response = await fetch(`/api/delete/${postId}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            posts = posts.filter(post => post.id != postId);
            renderPosts();
            updateCategoryCounts();
            showNotification('Post deleted successfully!', 'success');
        } else {
            throw new Error('Failed to delete post');
        }
    } catch (error) {
        console.error('Error deleting post:', error);
        showNotification('Failed to delete post. Please try again.', 'error');
    }
}
