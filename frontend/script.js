class CornellDiningApp {
    constructor() {
        this.currentCardIndex = 0;
        this.diningHalls = [];
        this.user = null;
        this.userHearts = { diningHalls: [], menuItems: [] };
        this.deviceId = this.getOrCreateDeviceId();
        this.startX = null;
        this.startY = null;
        this.isFlipping = false;

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
            const nameInput = document.getElementById('nameInput');
            
            // Don't close if clicking on the dropdown itself, profile button, or name input
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

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                this.previousCard();
            } else if (e.key === 'ArrowRight') {
                this.nextCard();
            } else if (e.key === ' ') {
                e.preventDefault();
                this.flipCurrentCard();
            }
        });

        // Setup touch and mouse events after DOM is ready
        setTimeout(() => {
            this.setupSwipeEvents();
        }, 100);
    }

    setupSwipeEvents() {
        // Touch events for swiping on the container
        const container = document.querySelector('.flashcard-container');
        if (container) {
            container.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
            container.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
            container.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
            
            // Mouse events for desktop on container
            container.addEventListener('mousedown', this.handleMouseDown.bind(this));
            container.addEventListener('mousemove', this.handleMouseMove.bind(this));
            container.addEventListener('mouseup', this.handleMouseUp.bind(this));
        }
    }

    async checkAuth() {
        try {
            const response = await fetch(`/api/auth/check/${this.deviceId}`);
            const data = await response.json();
            
            if (data.signedIn) {
                this.user = data.user;
                this.updateUIForSignedInUser();
                await this.loadUserHearts();
            }
        } catch (error) {
            console.error('Error checking auth:', error);
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
                // Fallback
                return `${period.summary || 'Open'}`;
            }
            
            // Check if dates are valid
            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return `${period.summary || 'Open'}`;
            }
            
            // Get day of the week
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
            if (period.menu && Array.isArray(period.menu) && period.menu.length > 0) {
                const mealType = (period.summary || 'meal').toLowerCase();
                menus[mealType] = period.menu.map(category => ({
                    category: category.category || 'Unknown',
                    items: (category.items || []).map(item => ({
                        id: `${period.summary || 'meal'}_${category.category || 'unknown'}_${item.item || 'item'}`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, ''),
                        name: item.item || 'Unknown Item',
                        healthy: item.healthy || false
                    }))
                }));
            }
        });

        return menus;
    }

    renderFlashcards() {
        console.log('[Frontend] Rendering flashcards for', this.diningHalls.length, 'dining halls');
        const stack = document.getElementById('flashcardStack');
        const dots = document.getElementById('navigationDots');
        
        if (!stack || !dots) {
            console.error('[Frontend] Could not find flashcard stack or navigation dots elements');
            return;
        }
        
        stack.innerHTML = '';
        dots.innerHTML = '';

        if (this.diningHalls.length === 0) {
            console.log('[Frontend] No dining halls to render');
            stack.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666;">No dining halls available</div>';
            return;
        }

        // Create all flashcards but only show the current one
        this.diningHalls.forEach((hall, index) => {
            console.log(`[Frontend] Creating flashcard ${index + 1}/${this.diningHalls.length}: ${hall.name}`);
            const card = this.createFlashcard(hall, index);
            
            // Only show the current card, hide others
            if (index === this.currentCardIndex) {
                card.style.display = 'block';
                card.style.zIndex = '100';
                card.style.transform = 'translateX(0) scale(1)';
                card.style.opacity = '1';
            } else {
                card.style.display = 'none';
            }
            
            stack.appendChild(card);

            // Create navigation dot
            const dot = document.createElement('div');
            dot.className = `nav-dot ${index === this.currentCardIndex ? 'active' : ''}`;
            dot.addEventListener('click', () => this.goToCard(index));
            dots.appendChild(dot);
        });
        
        console.log('[Frontend] Flashcards rendered successfully');
    }

    createFlashcard(hall, index) {
        const card = document.createElement('div');
        card.className = 'flashcard';
        card.dataset.index = index;
        card.dataset.hallId = hall.id;

        const isHallLiked = this.user && this.userHearts.diningHalls.includes(hall.id);

        card.innerHTML = `
            <div class="flashcard-front">
                <div class="dining-hall-image">🍽️</div>
                <div class="dining-hall-info">
                    <h2 class="dining-hall-name">${hall.name}</h2>
                    <p class="dining-hall-hours">${hall.hours}</p>
                    <p class="dining-hall-description">${hall.description}</p>
                </div>
                <div class="heart-icon ${isHallLiked ? 'liked' : ''}">
                    <img src="${isHallLiked ? 'heart.png' : 'heart-transparent.png'}" alt="Heart" class="heart-image">
                </div>
            </div>
            <div class="flashcard-back">
                ${this.createMenuContent(hall)}
            </div>
        `;

        // Handle clicks with proper single/double tap detection
        let clickCount = 0;
        let clickTimer = null;
        
        card.addEventListener('click', (e) => {
            clickCount++;
            
            if (clickCount === 1) {
                clickTimer = setTimeout(() => {
                    // Single click - flip card
                    if (!this.isFlipping) {
                        this.flipCard(card);
                    }
                    clickCount = 0;
                }, 250);
            } else if (clickCount === 2) {
                // Double click - handle heart
                clearTimeout(clickTimer);
                clickCount = 0;
                e.preventDefault();
                e.stopPropagation();
                this.handleDoubleTab(e, card, hall);
            }
        });

        return card;
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

        let menuHTML = `
            <div class="menu-content">
                <h3 class="menu-title">Menu for ${hall.name}</h3>
        `;

        Object.entries(hall.menus).forEach(([mealType, categories]) => {
            menuHTML += `
                <div class="meal-section">
                    <h4 class="meal-title">${mealType.charAt(0).toUpperCase() + mealType.slice(1)}</h4>
            `;

            categories.forEach(category => {
                if (category.items && category.items.length > 0) {
                    menuHTML += `<h5 style="font-weight: 500; color: #555; margin: 0.5rem 0;">${category.category}</h5>`;
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

            menuHTML += `</div>`;
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

    flipCurrentCard() {
        const currentCard = document.querySelector(`.flashcard[data-index="${this.currentCardIndex}"]`);
        if (currentCard) {
            this.flipCard(currentCard);
        }
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

    // Touch and mouse event handlers for swiping
    handleTouchStart(e) {
        // Only handle if we're not inside a flashcard (to avoid interfering with flip)
        if (e.target.closest('.flashcard')) {
            return;
        }
        this.startX = e.touches[0].clientX;
        this.startY = e.touches[0].clientY;
    }

    handleTouchMove(e) {
        if (!this.startX || !this.startY) return;
        
        const deltaX = Math.abs(e.touches[0].clientX - this.startX);
        const deltaY = Math.abs(e.touches[0].clientY - this.startY);
        
        if (deltaX > deltaY && deltaX > 10) {
            e.preventDefault(); // Prevent scrolling when swiping horizontally
        }
    }

    handleTouchEnd(e) {
        if (!this.startX || !this.startY) return;

        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const deltaX = endX - this.startX;
        const deltaY = Math.abs(endY - this.startY);

        // Only process horizontal swipes with sufficient distance
        if (Math.abs(deltaX) > 50 && deltaY < 100) {
            if (deltaX > 0) {
                this.previousCard();
            } else {
                this.nextCard();
            }
        }

        this.startX = null;
        this.startY = null;
    }

    handleMouseDown(e) {
        // Only handle left click on container or its children
        if (e.button !== 0) return;
        
        // Check if we're clicking on the container or a child element
        const container = document.querySelector('.flashcard-container');
        if (!container || (!container.contains(e.target) && e.target !== container)) return;
        
        this.isMouseDown = true;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.startTime = Date.now();
        e.preventDefault();
    }

    handleMouseMove(e) {
        if (!this.isMouseDown) return;
        
        this.currentX = e.clientX;
        this.currentY = e.clientY;
        e.preventDefault();
    }

    handleMouseUp(e) {
        if (!this.isMouseDown) return;
        
        this.isMouseDown = false;
        const endTime = Date.now();
        const deltaX = this.currentX - this.startX;
        const deltaY = this.currentY - this.startY;
        const deltaTime = endTime - this.startTime;
        
        // Check for swipe gesture vs click
        if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) && deltaTime < 500) {
            if (deltaX > 0) {
                this.previousCard();
            } else {
                this.nextCard();
            }
        } else if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && deltaTime < 300) {
            this.flipCurrentCard();
        }
        
        e.preventDefault();
    }

    nextCard() {
        if (this.currentCardIndex < this.diningHalls.length - 1) {
            this.currentCardIndex++;
            this.updateCardPositions();
            this.updateNavigationDots();
        }
    }

    previousCard() {
        if (this.currentCardIndex > 0) {
            this.currentCardIndex--;
            this.updateCardPositions();
            this.updateNavigationDots();
        }
    }

    goToCard(index) {
        if (index >= 0 && index < this.diningHalls.length) {
            this.currentCardIndex = index;
            this.updateCardPositions();
            this.updateNavigationDots();
        }
    }

    updateCardPositions() {
        const cards = document.querySelectorAll('.flashcard');
        cards.forEach((card, index) => {
            const cardIndex = parseInt(card.dataset.index);
            if (cardIndex === this.currentCardIndex) {
                card.style.display = 'block';
                card.style.zIndex = '100';
                card.style.transform = 'translateX(0) scale(1)';
                card.style.opacity = '1';
            } else {
                card.style.display = 'none';
            }
        });
    }

    updateNavigationDots() {
        const dots = document.querySelectorAll('.nav-dot');
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === this.currentCardIndex);
        });
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new CornellDiningApp();
});