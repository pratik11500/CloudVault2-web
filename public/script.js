let posts = [];
let currentFilter = 'all';
let searchQuery = '';
let currentAction = 'create'; // Tracks whether password is for 'create' or 'delete'
let currentPostId = null; // Stores post ID for deletion

// DOM elements
let postsContainer, categoryItems, searchInput, addPostBtn, addPostModal, closeModal, cancelBtn, postForm;
let passwordModal, closePasswordModal, cancelPasswordBtn, passwordForm, passwordAction;
let deletePasswordModal, closeDeletePasswordModal, cancelDeletePasswordBtn, deletePasswordForm, deletePasswordAction;

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
    deletePasswordModal = document.getElementById('deletePasswordModal');
    closeDeletePasswordModal = document.getElementById('closeDeletePasswordModal');
    cancelDeletePasswordBtn = document.getElementById('cancelDeletePasswordBtn');
    deletePasswordForm = document.getElementById('deletePasswordForm');
    deletePasswordAction = document.getElementById('deletePasswordAction');

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
    console.log(`Generated password: ${password} (Time: ${hours}:${minutes})`);
    return password;
}

// Show password modal with action
function showPasswordModal(action, postId = null) {
    currentAction = action;
    currentPostId = postId;
    console.log(`Showing ${action} password modal, postId: ${postId}`);
    if (action === 'create' && passwordModal && passwordAction) {
        passwordAction.textContent = 'Create Post';
        passwordModal.classList.add('show');
        document.body.style.overflow = 'hidden';
        document.getElementById('passwordInput').focus();
    } else if (action === 'delete' && deletePasswordModal && deletePasswordAction) {
        deletePasswordAction.textContent = 'Delete Post';
        deletePasswordModal.classList.add('show');
        document.body.style.overflow = 'hidden';
        document.getElementById('deletePasswordInput').focus();
    } else {
        console.error(`Failed to show ${action} modal: elements not found`);
        showNotification(`Error: Failed to show ${action} modal`, 'error');
    }
}

// Hide password modals
function hidePasswordModal() {
    console.log(`Hiding password modals, currentPostId: ${currentPostId}`);
    if (passwordModal) {
        passwordModal.classList.remove('show');
        if (passwordForm) {
            passwordForm.reset();
        }
    }
    if (deletePasswordModal) {
        deletePasswordModal.classList.remove('show');
        if (deletePasswordForm) {
            deletePasswordForm.reset();
        }
    }
    document.body.style.overflow = 'auto';
    currentAction = 'create'; // Reset to default
    // Do not reset currentPostId here to ensure it persists for deletion
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
                console.log(`Filter changed to: ${currentFilter}`);
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
            console.log(`Search query: ${searchQuery}`);
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

    // Modal controls for create password
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

    // Modal controls for delete password
    if (closeDeletePasswordModal) {
        closeDeletePasswordModal.addEventListener('click', () => hidePasswordModal());
    }
    if (cancelDeletePasswordBtn) {
        cancelDeletePasswordBtn.addEventListener('click', () => hidePasswordModal());
    }
    if (deletePasswordModal) {
        deletePasswordModal.addEventListener('click', function(e) {
            if (e.target === this) hidePasswordModal();
        });
    }
    if (deletePasswordForm) {
        deletePasswordForm.addEventListener('submit', handleDeletePasswordSubmit);
    }

    // Delegated event listener for delete buttons
    if (postsContainer) {
        postsContainer.addEventListener('click', function(e) {
            const deleteBtn = e.target.closest('.delete-btn');
            if (deleteBtn) {
                const postCard = deleteBtn.closest('.post-card');
                const postId = postCard ? postCard.dataset.postId : null;
                console.log(`Delete button clicked, postId: ${postId}`);
                if (postId) {
                    showPasswordModal('delete', postId);
                } else {
                    console.error('No postId found for delete button');
                    showNotification('Error: No post selected for deletion.', 'error');
                }
            }
        });
    }
}

// Handle password form submission for create
async function handlePasswordSubmit(e) {
    e.preventDefault();
    const passwordInput = document.getElementById('passwordInput').value.trim();
    const correctPassword = generatePassword();
    console.log(`Create password submitted: ${passwordInput}, expected: ${correctPassword}`);

    if (passwordInput === correctPassword) {
        hidePasswordModal();
        showModal();
    } else {
        showNotification('Incorrect password. Please try again.', 'error');
    }
}

// Handle password form submission for delete
async function handleDeletePasswordSubmit(e) {
    e.preventDefault();
    const passwordInput = document.getElementById('deletePasswordInput').value.trim();
    const correctPassword = generatePassword();
    console.log(`Delete password submitted: ${passwordInput}, expected: ${correctPassword}, postId: ${currentPostId}`);

    if (passwordInput === correctPassword) {
        if (currentPostId) {
            console.log(`Proceeding to delete post with ID: ${currentPostId}`);
            hidePasswordModal();
            await deletePost(currentPostId);
            currentPostId = null; // Reset after deletion
        } else {
            console.error('No post ID set for deletion');
            showNotification('Error: No post selected for deletion.', 'error');
            hidePasswordModal();
        }
    } else {
        showNotification('Incorrect password. Please try again.', 'error');
    }
}

// Load posts from API
async function loadPosts() {
    try {
        console.log('Fetching posts from /api/messages');
        const response = await fetch('/api/messages');
        if (response.ok) {
            posts = await response.json();
            console.log(`Loaded ${posts.length} posts`);
            renderPosts();
            updateCategoryCounts();
        } else {
            console.error(`Failed to fetch posts: ${response.status} ${response.statusText}`);
            renderPosts();
        }
    } catch (error) {
        console.error('Error loading posts:', error);
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
        console.log(`Loaded ${posts.length} posts from local storage`);
    }
}

// Save to local storage
function saveToLocalStorage() {
    console.log(`Saving ${posts.length} posts to local storage`);
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
    if (!postsContainer) {
        console.error('Posts container not found');
        return;
    }
    const filteredPosts = getFilteredPosts();
    console.log(`Rendering ${filteredPosts.length} filtered posts`);
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
                <button class="delete-btn">
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
    console.log('Category counts updated:', counts);
}

// Modal functions for add post
function showModal() {
    if (addPostModal) {
        addPostModal.classList.add('show');
        document.body.style.overflow = 'hidden';
        console.log('Add post modal shown');
    }
}

function hideModal() {
    if (addPostModal) {
        addPostModal.classList.remove('show');
        document.body.style.overflow = 'auto';
        if (postForm) {
            postForm.reset();
        }
        console.log('Add post modal hidden');
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
        console.log('Form submission failed: missing required fields');
        return;
    }
    try {
        console.log('Submitting post:', formData);
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
            console.log('Post created successfully');
        } else {
            throw new Error(`Failed to create post: ${response.status} ${response.statusText}`);
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
    console.log(`Showing notification: ${message} (${type})`);
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
                    console.log(`Polled ${newPosts.length} new posts`);
                    renderPosts();
                    updateCategoryCounts();
                }
            }
        } catch (error) {
            console.error('Polling error:', error);
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
            console.log(`Local update: ${posts.length} posts`);
            renderPosts();
            updateCategoryCounts();
        }
    }
}

// Delete post function
async function deletePost(postId) {
    try {
        console.log(`Sending DELETE request to /api/delete/${postId}`);
        const response = await fetch(`/api/delete/${postId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (response.ok) {
            console.log(`Post ${postId} deleted successfully from server`);
            posts = posts.filter(post => post.id !== postId);
            saveToLocalStorage();
            renderPosts();
            updateCategoryCounts();
            showNotification('Post deleted successfully!', 'success');
        } else {
            const errorText = await response.text();
            throw new Error(`Failed to delete post: ${response.status} ${response.statusText} - ${errorText}`);
        }
    } catch (error) {
        console.error('Error deleting post:', error);
        showNotification(`Failed to delete post: ${error.message}`, 'error');
    }
}
