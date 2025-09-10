class CornellDiningApp {
    constructor() {
        this.diningHalls = [];
        this.user = null;
        this.userHearts = { diningHalls: [], menuItems: [] };
        this.deviceId = this.getOrCreateDeviceId();

        this.init();
    }

    async init() {
        console.log('[Frontend] Initializing Cornell Dining App...');
        this.bindEvents();
        console.log('[Frontend] Events bound');
        await this.checkAuth();
        console.log('[Frontend] Auth checked');
        await this.loadDiningData();
        console.log('[Frontend] Dining data loaded');
        this.renderFlashcards();
        console.log('[Frontend] Flashcards rendered');
        console.log('[Frontend] Initialization complete');
    }

    getOrCreateDeviceId() {
        let deviceId = localStorage.getItem('cornell_dining_device_id');
        if (!deviceId) {
            deviceId = 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
            localStorage.setItem('cornell_dining_device_id', deviceId);
        }
        return deviceId;
    }

    bindEvents() {
        // Profile dropdown
        document.getElementById('profileBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = document.getElementById('profileDropdown');
            dropdown.classList.toggle('hidden');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('profileDropdown');
            const profileBtn = document.getElementById('profileBtn');
            
            // Don't close if clicking on the dropdown content or profile button
            if (!dropdown.contains(e.target) && !profileBtn.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });

        // Sign in
        document.getElementById('signInBtn').addEventListener('click', () => {
            this.signIn();
        });

        document.getElementById('modalSignInBtn').addEventListener('click', () => {
            document.getElementById('authModal').classList.add('hidden');
            document.getElementById('profileBtn').click();
        });

        document.getElementById('modalCloseBtn').addEventListener('click', () => {
            document.getElementById('authModal').classList.add('hidden');
        });

        // Sign out
        document.getElementById('signOutBtn').addEventListener('click', () => {
            this.signOut();
        });

        // Enter key for sign in
        document.getElementById('nameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.signIn();
            }
        });
    }

    async checkAuth() {
        try {
            const response = await fetch(`/api/auth/check/${this.deviceId}`);
            const data = await response.json();
            
            if (data.signedIn) {
                this.user = data.user;
                this.updateUIForSignedInUser();
                await this.loadUserHearts();
            } else {
                // Explicitly set UI for signed out state
                this.updateUIForSignedOutUser();
            }
        } catch (error) {
            console.error('Error checking auth:', error);
            // If there's an error, assume signed out
            this.updateUIForSignedOutUser();
        }
    }

    async signIn() {
        const name = document.getElementById('nameInput').value.trim();
        if (!name) {
            alert('Please enter your name');
            return;
        }

        try {
            const response = await fetch('/api/auth/signin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: name,
                    deviceId: this.deviceId
                })
            });

            const data = await response.json();
            if (data.success) {
                this.user = data.user;
                this.updateUIForSignedInUser();
                document.getElementById('profileDropdown').classList.add('hidden');
                document.getElementById('nameInput').value = '';
                await this.loadUserHearts();
                this.renderFlashcards(); // Re-render to show hearts
            }
        } catch (error) {
            console.error('Error signing in:', error);
            alert('Failed to sign in. Please try again.');
        }
    }

    async signOut() {
        try {
            await fetch(`/api/auth/signout/${this.deviceId}`, {
                method: 'DELETE'
            });

            this.user = null;
            this.userHearts = { diningHalls: [], menuItems: [] };
            this.updateUIForSignedOutUser();
            document.getElementById('profileDropdown').classList.add('hidden');
            this.renderFlashcards(); // Re-render to hide hearts
        } catch (error) {
            console.error('Error signing out:', error);
        }
    }

    updateUIForSignedInUser() {
        console.log('[Frontend] Updating UI for signed in user:', this.user.name);
        document.getElementById('profileName').textContent = this.user.name;
        document.getElementById('signInForm').classList.add('hidden');
        document.getElementById('userInfo').classList.remove('hidden');
        document.getElementById('userName').textContent = this.user.name;
    }

    updateUIForSignedOutUser() {
        console.log('[Frontend] Updating UI for signed out state');
        document.getElementById('profileName').textContent = 'Sign In';
        document.getElementById('signInForm').classList.remove('hidden');
        document.getElementById('userInfo').classList.add('hidden');
        // Clear the name input when signing out
        document.getElementById('nameInput').value = '';
    }

    async loadUserHearts() {
        if (!this.user) return;

        try {
            const response = await fetch(`/api/hearts/${this.user.userId}`);
            const data = await response.json();
            this.userHearts = data;
        } catch (error) {
            console.error('Error loading user hearts:', error);
        }
    }

    async loadDiningData() {
        const loadingScreen = document.getElementById('loadingScreen');
        loadingScreen.classList.remove('hidden');

        try {
            console.log('[Frontend] Fetching dining data from backend...');
            const response = await fetch('/api/dining');
            console.log('[Frontend] Response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('[Frontend] Received data:', data);
            console.log('[Frontend] Data structure keys:', Object.keys(data));
            
            // Check if data has the expected structure
            let eateries = [];
            if (data && data.data && data.data.eateries) {
                eateries = data.data.eateries;
                console.log('[Frontend] Found eateries in data.data.eateries:', eateries.length);
            } else if (data && data.eateries) {
                eateries = data.eateries;
                console.log('[Frontend] Found eateries in data.eateries:', eateries.length);
            } else {
                console.error('[Frontend] Unexpected data structure:', data);
                throw new Error('Unexpected data structure from API');
            }
            
            // Process and filter dining halls
            this.diningHalls = eateries.filter(eatery => {
                const hasHours = eatery.operatingHours && eatery.operatingHours.length > 0;
                console.log(`[Frontend] Processing ${eatery.name}: hasHours=${hasHours}`);
                return hasHours;
            }).map(eatery => {
                const processed = {
                    id: eatery.id,
                    name: eatery.name,
                    description: eatery.about || 'A dining location at Cornell University',
                    hours: this.formatHours(eatery.operatingHours),
                    menus: this.processMenus(eatery.operatingHours)
                };
                console.log(`[Frontend] Processed dining hall:`, processed.name, 'with', Object.keys(processed.menus).length, 'meal types');
                return processed;
            });

            console.log('[Frontend] Final processed dining halls:', this.diningHalls.length);
            loadingScreen.classList.add('hidden');
        } catch (error) {
            console.error('[Frontend] Error loading dining data:', error);
            console.error('[Frontend] Error stack:', error.stack);
            loadingScreen.classList.add('hidden');
            alert('Failed to load dining data. Please refresh the page.');
        }
    }

    formatHours(operatingHours) {
        if (!operatingHours || operatingHours.length === 0) {
            return 'Hours not available';
        }

        return operatingHours.map(period => {
            // Handle different timestamp formats
            let start, end;
            
            if (period.startTimestamp && period.endTimestamp) {
                // Unix timestamp (seconds)
                start = new Date(period.startTimestamp * 1000);
                end = new Date(period.endTimestamp * 1000);
            } else if (period.start && period.end) {
                // ISO string format
                start = new Date(period.start);
                end = new Date(period.end);
            } else {
                // Fallback - just show the summary without day if no date info
                return `${period.summary || 'Open'}`;
            }
            
            // Check if dates are valid
            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                // If dates are invalid, just show summary without day
                return `${period.summary || 'Open'}`;
            }
            
            // Get day of the week from the actual date
            const dayOfWeek = start.toLocaleDateString('en-US', { weekday: 'long' });
            const startTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const endTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            return `${dayOfWeek}: ${period.summary || 'Open'} ${startTime} - ${endTime}`;
        }).join(' | ');
    }

    processMenus(operatingHours) {
        const menus = {};
        
        if (!operatingHours || !Array.isArray(operatingHours)) {
            return menus;
        }
        
        operatingHours.forEach(period => {
            if (period.events && Array.isArray(period.events)) {
                period.events.forEach(event => {
                    if (event.menu && Array.isArray(event.menu) && event.menu.length > 0) {
                        const mealType = (event.descr || 'meal').toLowerCase();
                        
                        if (!menus[mealType]) {
                            menus[mealType] = [];
                        }
                        
                        // Add all categories from this event's menu
                        event.menu.forEach(category => {
                            menus[mealType].push({
                                category: category.category || 'Unknown',
                                items: (category.items || []).map(item => ({
                                    id: `${event.descr || 'meal'}_${category.category || 'unknown'}_${item.item || 'item'}`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, ''),
                                    name: item.item || 'Unknown Item',
                                    healthy: item.healthy || false
                                }))
                            });
                        });
                    }
                });
            }
        });

        return menus;
    }

    renderFlashcards() {
        const list = document.getElementById('diningHallsList');
        
        if (!list) {
            console.error('[Frontend] Could not find dining halls list element');
            return;
        }
        
        list.innerHTML = '';

        if (this.diningHalls.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666;">No dining halls available</div>';
            return;
        }

        // Create all dining hall cards
        this.diningHalls.forEach((hall, index) => {
            const card = this.createFlashcard(hall, index);
            list.appendChild(card);
        });
    }

    createFlashcard(hall, index) {
        const card = document.createElement('div');
        card.className = 'dining-hall-card';
        card.dataset.index = index;
        card.dataset.hallId = hall.id;

        const isHallLiked = this.user && this.userHearts.diningHalls.includes(hall.id);
        
        // Determine if dining hall is open or closed
        const isOpen = this.isDiningHallOpen(hall);
        const statusClass = isOpen ? 'open' : 'closed';
        const statusText = isOpen ? 'Open' : 'Closed';

        card.innerHTML = `
            <div class="dining-hall-header">
                <div class="dining-hall-info">
                    <h2 class="dining-hall-name">${hall.name}</h2>
                    <div class="dining-hall-status ${statusClass}">${statusText}</div>
                    <p class="dining-hall-hours">${hall.hours}</p>
                    <p class="dining-hall-description">${hall.description}</p>
                </div>
                <div class="heart-icon ${isHallLiked ? 'liked' : ''}">
                    <img src="${isHallLiked ? 'heart.png' : 'heart-transparent.png'}" alt="Heart" class="heart-image">
                </div>
            </div>
            <div class="menu-content">
                ${this.createMenuContent(hall)}
            </div>
        `;

        // Add double-click handler for heart
        card.addEventListener('dblclick', (e) => {
            e.preventDefault();
            this.handleDoubleTab(e, card, hall);
        });

        return card;
    }

    isDiningHallOpen(hall) {
        // Check if the dining hall has any events today that indicate it's open
        if (!hall.operatingHours || !Array.isArray(hall.operatingHours)) {
            return false;
        }
        
        // Look for today's schedule
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        const todaySchedule = hall.operatingHours.find(schedule => schedule.date === today);
        
        if (!todaySchedule) {
            return false;
        }
        
        // If status is "EVENTS", it's likely open
        return todaySchedule.status === 'EVENTS' && todaySchedule.events && todaySchedule.events.length > 0;
    }

    createMenuContent(hall) {
        if (!hall.menus || Object.keys(hall.menus).length === 0) {
            return `
                <div class="menu-content">
                    <h3 class="menu-title">Menu for ${hall.name}</h3>
                    <p style="text-align: center; color: #666; margin-top: 2rem;">
                        No menu available for today
                    </p>
                </div>
            `;
        }

        let menuHTML = `<div class="menu-content">`;

        // Organize meals by common meal types
        const mealOrder = ['breakfast', 'brunch', 'lunch', 'dinner', 'late night'];
        const organizedMeals = {};
        
        // Group menus by meal type
        Object.entries(hall.menus).forEach(([mealType, categories]) => {
            const normalizedType = mealType.toLowerCase();
            organizedMeals[normalizedType] = categories;
        });

        // Display meals in order
        mealOrder.forEach(mealType => {
            if (organizedMeals[mealType]) {
                menuHTML += `
                    <div class="meal-section">
                        <div class="meal-header" onclick="this.parentElement.classList.toggle('expanded')">
                            <h4 class="meal-title">${mealType.charAt(0).toUpperCase() + mealType.slice(1)}</h4>
                            <span class="expand-icon">▼</span>
                        </div>
                        <div class="meal-items">
                `;

                organizedMeals[mealType].forEach(category => {
                    if (category.items && category.items.length > 0) {
                        menuHTML += `<h5 class="category-title">${category.category}</h5>`;
                        category.items.forEach(item => {
                            const isItemLiked = this.user && this.userHearts.menuItems.includes(item.id);
                            menuHTML += `
                                <div class="menu-item" data-item-id="${item.id}">
                                    <span class="menu-item-name">${item.name}</span>
                                    <span class="menu-item-heart ${isItemLiked ? 'liked' : ''}">
                                        <img src="${isItemLiked ? 'heart.png' : 'heart-transparent.png'}" alt="Heart" class="heart-image-small">
                                    </span>
                                </div>
                            `;
                        });
                    }
                });

                menuHTML += `
                        </div>
                    </div>
                `;
            }
        });

        // Display any remaining meal types that weren't in the standard order
        Object.entries(organizedMeals).forEach(([mealType, categories]) => {
            if (!mealOrder.includes(mealType)) {
                menuHTML += `
                    <div class="meal-section">
                        <div class="meal-header" onclick="this.parentElement.classList.toggle('expanded')">
                            <h4 class="meal-title">${mealType.charAt(0).toUpperCase() + mealType.slice(1)}</h4>
                            <span class="expand-icon">▼</span>
                        </div>
                        <div class="meal-items">
                `;

                categories.forEach(category => {
                    if (category.items && category.items.length > 0) {
                        menuHTML += `<h5 class="category-title">${category.category}</h5>`;
                        category.items.forEach(item => {
                            const isItemLiked = this.user && this.userHearts.menuItems.includes(item.id);
                            menuHTML += `
                                <div class="menu-item" data-item-id="${item.id}">
                                    <span class="menu-item-name">${item.name}</span>
                                    <span class="menu-item-heart ${isItemLiked ? 'liked' : ''}">
                                        <img src="${isItemLiked ? 'heart.png' : 'heart-transparent.png'}" alt="Heart" class="heart-image-small">
                                    </span>
                                </div>
                            `;
                        });
                    }
                });

                menuHTML += `
                        </div>
                    </div>
                `;
            }
        });

        menuHTML += `</div>`;
        return menuHTML;
    }

    flipCard(card) {
        console.log('[Frontend] Starting card flip animation');
        this.isFlipping = true;
        
        const isCurrentlyFlipped = card.classList.contains('flipped');
        console.log(`[Frontend] Card is currently ${isCurrentlyFlipped ? 'flipped (showing back)' : 'unflipped (showing front)'}`);
        
        card.classList.toggle('flipped');
        
        const newState = card.classList.contains('flipped') ? 'back (menu)' : 'front (info)';
        console.log(`[Frontend] Card flipped to show ${newState}`);
        
        // Add event listeners for menu items after flip
        setTimeout(() => {
            const menuItems = card.querySelectorAll('.menu-item');
            console.log(`[Frontend] Adding event listeners to ${menuItems.length} menu items`);
            menuItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('[Frontend] Menu item clicked:', item.textContent);
                    this.handleMenuItemHeart(e, item);
                });
            });
            this.isFlipping = false;
            console.log('[Frontend] Card flip animation complete');
        }, 300);
    }

    async handleDoubleTab(e, card, hall) {
        e.stopPropagation();
        
        if (!this.user) {
            this.showAuthModal();
            return;
        }

        const isFlipped = card.classList.contains('flipped');
        if (!isFlipped) {
            // Heart the dining hall
            await this.toggleDiningHallHeart(hall.id, card);
        }
    }

    async handleMenuItemHeart(e, menuItem) {
        e.stopPropagation();
        
        if (!this.user) {
            this.showAuthModal();
            return;
        }

        const itemId = menuItem.dataset.itemId;
        const heartIcon = menuItem.querySelector('.menu-item-heart');
        const heartImage = heartIcon.querySelector('.heart-image-small');
        const isLiked = heartIcon.classList.contains('liked');

        console.log(`[Frontend] Toggling menu item heart for item ${itemId}, currently ${isLiked ? 'liked' : 'not liked'}`);

        try {
            const response = await fetch('/api/hearts/menu-item', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.user.userId,
                    menuItemId: itemId,
                    action: isLiked ? 'unlike' : 'like'
                })
            });

            const result = await response.json();
            if (result.success) {
                heartIcon.classList.toggle('liked');
                heartIcon.classList.add('animate');
                
                // Update the heart image source
                heartImage.src = result.isLiked ? 'heart.png' : 'heart-transparent.png';
                console.log(`[Frontend] Menu item heart image updated to: ${heartImage.src}`);
                
                setTimeout(() => heartIcon.classList.remove('animate'), 600);

                // Update local state
                if (result.isLiked) {
                    this.userHearts.menuItems.push(itemId);
                } else {
                    this.userHearts.menuItems = this.userHearts.menuItems.filter(id => id !== itemId);
                }
                
                console.log(`[Frontend] Menu item heart ${result.isLiked ? 'added' : 'removed'}`);
            }
        } catch (error) {
            console.error('Error toggling menu item heart:', error);
        }
    }

    async toggleDiningHallHeart(hallId, card) {
        const heartIcon = card.querySelector('.heart-icon');
        const heartImage = heartIcon.querySelector('.heart-image');
        const isLiked = heartIcon.classList.contains('liked');

        console.log(`[Frontend] Toggling dining hall heart for hall ${hallId}, currently ${isLiked ? 'liked' : 'not liked'}`);

        try {
            const response = await fetch('/api/hearts/dining-hall', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.user.userId,
                    diningHallId: hallId,
                    action: isLiked ? 'unlike' : 'like'
                })
            });

            const result = await response.json();
            if (result.success) {
                heartIcon.classList.toggle('liked');
                heartIcon.classList.add('animate');
                
                // Update the heart image source
                heartImage.src = result.isLiked ? 'heart.png' : 'heart-transparent.png';
                console.log(`[Frontend] Heart image updated to: ${heartImage.src}`);
                
                setTimeout(() => heartIcon.classList.remove('animate'), 600);

                // Update local state
                if (result.isLiked) {
                    this.userHearts.diningHalls.push(hallId);
                } else {
                    this.userHearts.diningHalls = this.userHearts.diningHalls.filter(id => id !== hallId);
                }
                
                console.log(`[Frontend] Dining hall heart ${result.isLiked ? 'added' : 'removed'}`);
            }
        } catch (error) {
            console.error('Error toggling dining hall heart:', error);
        }
    }

    showAuthModal() {
        document.getElementById('authModal').classList.remove('hidden');
    }

}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new CornellDiningApp();
});