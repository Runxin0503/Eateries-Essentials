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
        this.bindEvents();
        await this.checkAuth();
        await this.loadDiningData();
        this.renderFlashcards();
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
        document.addEventListener('click', () => {
            document.getElementById('profileDropdown').classList.add('hidden');
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

        // Touch events for swiping
        document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });

        // Mouse events for desktop
        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));

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
    }

    async checkAuth() {
        try {
            const response = await fetch(`http://localhost:3000/api/auth/check/${this.deviceId}`);
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
            const response = await fetch('http://localhost:3000/api/auth/signin', {
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
            await fetch(`http://localhost:3000/api/auth/signout/${this.deviceId}`, {
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
        document.getElementById('profileName').textContent = this.user.name;
        document.getElementById('signInForm').classList.add('hidden');
        document.getElementById('userInfo').classList.remove('hidden');
        document.getElementById('userName').textContent = this.user.name;
    }

    updateUIForSignedOutUser() {
        document.getElementById('profileName').textContent = 'Sign In';
        document.getElementById('signInForm').classList.remove('hidden');
        document.getElementById('userInfo').classList.add('hidden');
    }

    async loadUserHearts() {
        if (!this.user) return;

        try {
            const response = await fetch(`http://localhost:3000/api/hearts/${this.user.userId}`);
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
            const response = await fetch('http://localhost:3000/api/dining');
            const data = await response.json();
            
            // Process and filter dining halls
            this.diningHalls = data.eateries.filter(eatery => 
                eatery.operatingHours && eatery.operatingHours.length > 0
            ).map(eatery => ({
                id: eatery.id,
                name: eatery.name,
                description: eatery.about || 'A dining location at Cornell University',
                hours: this.formatHours(eatery.operatingHours),
                menus: this.processMenus(eatery.operatingHours)
            }));

            loadingScreen.classList.add('hidden');
        } catch (error) {
            console.error('Error loading dining data:', error);
            loadingScreen.classList.add('hidden');
            alert('Failed to load dining data. Please refresh the page.');
        }
    }

    formatHours(operatingHours) {
        if (!operatingHours || operatingHours.length === 0) {
            return 'Hours not available';
        }

        return operatingHours.map(period => {
            const start = new Date(period.startTimestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const end = new Date(period.endTimestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `${period.summary}: ${start} - ${end}`;
        }).join(' | ');
    }

    processMenus(operatingHours) {
        const menus = {};
        
        operatingHours.forEach(period => {
            if (period.menu && period.menu.length > 0) {
                const mealType = period.summary.toLowerCase();
                menus[mealType] = period.menu.map(category => ({
                    category: category.category,
                    items: category.items.map(item => ({
                        id: `${period.summary}_${category.category}_${item.item}`.replace(/\s+/g, '_'),
                        name: item.item,
                        healthy: item.healthy || false
                    }))
                }));
            }
        });

        return menus;
    }

    renderFlashcards() {
        const stack = document.getElementById('flashcardStack');
        const dots = document.getElementById('navigationDots');
        
        stack.innerHTML = '';
        dots.innerHTML = '';

        this.diningHalls.forEach((hall, index) => {
            // Create flashcard
            const card = this.createFlashcard(hall, index);
            if (index === this.currentCardIndex) {
                card.style.zIndex = 100;
                card.style.transform = 'translateX(0)';
            } else {
                card.style.zIndex = 99 - Math.abs(index - this.currentCardIndex);
                const offset = (index - this.currentCardIndex) * 20;
                card.style.transform = `translateX(${offset}px)`;
            }
            stack.appendChild(card);

            // Create navigation dot
            const dot = document.createElement('div');
            dot.className = `nav-dot ${index === this.currentCardIndex ? 'active' : ''}`;
            dot.addEventListener('click', () => this.goToCard(index));
            dots.appendChild(dot);
        });
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
                <div class="heart-icon ${isHallLiked ? 'liked' : ''}">❤️</div>
            </div>
            <div class="flashcard-back">
                ${this.createMenuContent(hall)}
            </div>
        `;

        // Add event listeners for flip and heart
        card.addEventListener('click', (e) => {
            if (!this.isFlipping) {
                this.flipCard(card);
            }
        });

        // Double-tap for hearts
        let lastTap = 0;
        card.addEventListener('click', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            
            if (tapLength < 500 && tapLength > 0) {
                e.preventDefault();
                this.handleDoubleTab(e, card, hall);
            }
            lastTap = currentTime;
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
                                <span class="menu-item-heart ${isItemLiked ? 'liked' : ''}">❤️</span>
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
        this.isFlipping = true;
        card.classList.toggle('flipped');
        
        // Add event listeners for menu items after flip
        setTimeout(() => {
            const menuItems = card.querySelectorAll('.menu-item');
            menuItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.handleMenuItemHeart(e, item);
                });
            });
            this.isFlipping = false;
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
        const isLiked = heartIcon.classList.contains('liked');

        try {
            const response = await fetch('http://localhost:3000/api/hearts/menu-item', {
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
                setTimeout(() => heartIcon.classList.remove('animate'), 600);

                // Update local state
                if (result.isLiked) {
                    this.userHearts.menuItems.push(itemId);
                } else {
                    this.userHearts.menuItems = this.userHearts.menuItems.filter(id => id !== itemId);
                }
            }
        } catch (error) {
            console.error('Error toggling menu item heart:', error);
        }
    }

    async toggleDiningHallHeart(hallId, card) {
        const heartIcon = card.querySelector('.heart-icon');
        const isLiked = heartIcon.classList.contains('liked');

        try {
            const response = await fetch('http://localhost:3000/api/hearts/dining-hall', {
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
                setTimeout(() => heartIcon.classList.remove('animate'), 600);

                // Update local state
                if (result.isLiked) {
                    this.userHearts.diningHalls.push(hallId);
                } else {
                    this.userHearts.diningHalls = this.userHearts.diningHalls.filter(id => id !== hallId);
                }
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
        this.startX = e.touches[0].clientX;
        this.startY = e.touches[0].clientY;
    }

    handleTouchMove(e) {
        if (!this.startX || !this.startY) return;
        
        const deltaX = Math.abs(e.touches[0].clientX - this.startX);
        const deltaY = Math.abs(e.touches[0].clientY - this.startY);
        
        if (deltaX > deltaY) {
            e.preventDefault(); // Prevent scrolling when swiping horizontally
        }
    }

    handleTouchEnd(e) {
        if (!this.startX || !this.startY) return;

        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const deltaX = endX - this.startX;
        const deltaY = Math.abs(endY - this.startY);

        // Only process horizontal swipes
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
        this.startX = e.clientX;
        this.startY = e.clientY;
    }

    handleMouseMove(e) {
        // Mouse move handling if needed
    }

    handleMouseUp(e) {
        if (!this.startX || !this.startY) return;

        const deltaX = e.clientX - this.startX;
        const deltaY = Math.abs(e.clientY - this.startY);

        // Only process horizontal swipes
        if (Math.abs(deltaX) > 100 && deltaY < 50) {
            if (deltaX > 0) {
                this.previousCard();
            } else {
                this.nextCard();
            }
        }

        this.startX = null;
        this.startY = null;
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
        this.currentCardIndex = index;
        this.updateCardPositions();
        this.updateNavigationDots();
    }

    updateCardPositions() {
        const cards = document.querySelectorAll('.flashcard');
        cards.forEach((card, index) => {
            const cardIndex = parseInt(card.dataset.index);
            if (cardIndex === this.currentCardIndex) {
                card.style.zIndex = 100;
                card.style.transform = 'translateX(0)';
                card.style.opacity = '1';
            } else {
                card.style.zIndex = 99 - Math.abs(cardIndex - this.currentCardIndex);
                const offset = (cardIndex - this.currentCardIndex) * 20;
                card.style.transform = `translateX(${offset}px)`;
                card.style.opacity = Math.abs(cardIndex - this.currentCardIndex) === 1 ? '0.7' : '0.3';
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