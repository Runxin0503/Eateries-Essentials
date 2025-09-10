class CornellDiningApp {
    constructor() {
        this.diningHalls = [];
        this.originalEateries = []; // Store original eateries data for time filtering
        this.user = null;
        this.userHearts = { diningHalls: [], menuItems: [] };
        this.deviceId = this.getOrCreateDeviceId();
        this.selectedDate = new Date().toISOString().split('T')[0]; // Default to today
        this.availableDates = []; // Will be populated from API data
        this.selectedTime = '08:00'; // Default time

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
        this.initializeDateSelector(); // Initialize after data is loaded
        console.log('[Frontend] Date selector initialized');
        this.renderDiningHalls();
        console.log('[Frontend] Dining halls rendered');
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
        // Date selector change event (don't initialize here - do it after data loads)
        document.getElementById('dateSelector').addEventListener('change', (e) => {
            this.selectedDate = e.target.value;
            this.onDateChange();
        });
        
        // Time selector change event
        document.getElementById('timeSelector').addEventListener('change', (e) => {
            this.selectedTime = e.target.value;
            this.onTimeChange();
        });
        
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

    initializeDateSelector() {
        const dateSelector = document.getElementById('dateSelector');
        // Set default value to today (or first available date if today is not available)
        dateSelector.value = this.selectedDate;
        
        // Set min and max dates based on available dates from API data
        if (this.availableDates.length > 0) {
            const sortedDates = [...this.availableDates].sort();
            dateSelector.min = sortedDates[0];
            dateSelector.max = sortedDates[sortedDates.length - 1];
            
            // If current selected date is not in available dates, use the first available date
            if (!this.availableDates.includes(this.selectedDate)) {
                this.selectedDate = sortedDates[0];
                dateSelector.value = this.selectedDate;
            }
        }
        
        // Initialize time selector
        document.getElementById('timeSelector').value = this.selectedTime;
        
        // Update day of week display
        this.updateDayOfWeek();
    }

    onTimeChange() {
        console.log('[Frontend] Time filter changed to:', this.selectedTime);
        // Re-render dining halls with time filtering
        this.renderDiningHalls();
    }

    updateDayOfWeek() {
        const dayOfWeekElement = document.getElementById('dayOfWeek');
        if (this.selectedDate) {
            const date = new Date(this.selectedDate + 'T00:00:00');
            const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
            dayOfWeekElement.textContent = dayName;
        }
    }

    extractAvailableDates(eateries) {
        const dates = new Set();
        
        eateries.forEach(eatery => {
            if (eatery.operatingHours && Array.isArray(eatery.operatingHours)) {
                eatery.operatingHours.forEach(hours => {
                    if (hours.date) {
                        // Extract YYYY-MM-DD from date string
                        const dateOnly = hours.date.split('T')[0];
                        dates.add(dateOnly);
                    }
                });
            }
        });
        
        this.availableDates = Array.from(dates).sort();
        console.log('[Frontend] Available dates:', this.availableDates);
    }

    async onDateChange() {
        console.log('[Frontend] Date changed to:', this.selectedDate);
        
        // Update day of week display
        this.updateDayOfWeek();
        
        // Show loading screen
        const loadingScreen = document.getElementById('loadingScreen');
        loadingScreen.classList.remove('hidden');
        
        try {
            // Reload dining data for the new date
            await this.loadDiningData();
            // Re-render the dining halls
            this.renderDiningHalls();
        } catch (error) {
            console.error('[Frontend] Error loading data for new date:', error);
        } finally {
            // Hide loading screen
            loadingScreen.classList.add('hidden');
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
                this.renderDiningHalls(); // Re-render to show hearts
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
            this.renderDiningHalls(); // Re-render to hide hearts
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
            // For initial load, get data without a specific date to get the full range
            // For subsequent loads, use the selected date
            const isInitialLoad = this.availableDates.length === 0;
            const url = isInitialLoad ? '/api/dining' : `/api/dining/${this.selectedDate}`;
            
            console.log('[Frontend] Fetching dining data from backend for date:', isInitialLoad ? 'all dates' : this.selectedDate);
            const response = await fetch(url);
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
            
            // Extract available dates from the data
            this.extractAvailableDates(eateries);
            
            // Store original eateries data for time filtering
            this.originalEateries = eateries.filter(eatery => {
                const hasHours = eatery.operatingHours && eatery.operatingHours.length > 0;
                return hasHours;
            });
            
            // Process and filter dining halls
            this.diningHalls = this.originalEateries.map(eatery => {
                const processed = {
                    id: eatery.id,
                    name: eatery.name,
                    description: this.cleanDescription(eatery.about) || 'A dining location at Cornell University',
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

    cleanDescription(aboutText) {
        if (!aboutText) return '';
        
        // Remove HTML tags and decode HTML entities
        let cleaned = aboutText
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/\\r\\n/g, ' ')
            .replace(/\\n/g, ' ')
            .replace(/\s+/g, ' ') // Replace multiple spaces with single space
            .trim();
        
        // Remove "More Info:" section and everything after it
        const moreInfoIndex = cleaned.indexOf('More Info:');
        if (moreInfoIndex !== -1) {
            cleaned = cleaned.substring(0, moreInfoIndex).trim();
        }
        
        return cleaned;
    }

    formatHours(operatingHours) {
        if (!operatingHours || operatingHours.length === 0) {
            return 'Hours not available';
        }

        // Filter for selected date only
        const selectedDateHours = operatingHours.filter(period => {
            if (period.date) {
                const periodDate = period.date.split('T')[0]; // Extract YYYY-MM-DD from date string
                return periodDate === this.selectedDate;
            }
            return false;
        });

        if (selectedDateHours.length === 0) {
            return 'Closed today';
        }

        return selectedDateHours.map(period => {
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
        
        // Use the selected date instead of hardcoded today
        console.log('[Frontend] Processing menus for date:', this.selectedDate);
        
        // Find selected date's operating hours only
        const selectedDateHours = operatingHours.find(period => period.date === this.selectedDate);
        
        if (!selectedDateHours || !selectedDateHours.events || !Array.isArray(selectedDateHours.events)) {
            console.log('[Frontend] No operating hours found for selected date:', this.selectedDate);
            return menus;
        }
        
        console.log('[Frontend] Found', selectedDateHours.events.length, 'events for selected date');
        
        selectedDateHours.events.forEach(event => {
            if (event.menu && Array.isArray(event.menu) && event.menu.length > 0) {
                const mealType = (event.descr || 'meal').toLowerCase();
                console.log('[Frontend] Processing meal type:', mealType, 'with', event.menu.length, 'categories');
                
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

        console.log('[Frontend] Processed menus:', Object.keys(menus));
        return menus;
    }

    renderDiningHalls() {
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

        // Separate dining halls into open and closed
        const openHalls = [];
        const closedHalls = [];
        
        this.diningHalls.forEach(hall => {
            // Get original operating hours for this dining hall
            const operatingHours = this.getOriginalOperatingHours(hall.id);
            const hallWithHours = { ...hall, operatingHours };
            
            if (this.isDiningHallOpenAtTime(hallWithHours)) {
                openHalls.push(hallWithHours);
            } else {
                closedHalls.push(hallWithHours);
            }
        });

        // Create cards for open dining halls first
        openHalls.forEach((hall, index) => {
            const card = this.createDiningHallCard(hall, index, false);
            list.appendChild(card);
        });
        
        // Create cards for closed dining halls (greyed out)
        closedHalls.forEach((hall, index) => {
            const card = this.createDiningHallCard(hall, openHalls.length + index, true);
            list.appendChild(card);
        });
    }

    createDiningHallCard(hall, index, isClosed = false) {
        const card = document.createElement('div');
        card.className = `dining-hall-card ${isClosed ? 'closed-hall' : ''}`;
        card.dataset.index = index;
        card.dataset.hallId = hall.id;

        const isHallLiked = this.user && this.userHearts.diningHalls.includes(hall.id);
        
        // Determine if dining hall is open or closed
        // When time filtering is active (selectedTime is set), use time-specific logic
        const isOpen = this.isDiningHallOpenAtTime(hall);
        const statusClass = isOpen ? 'open' : 'closed';
        
        let statusText = 'Closed';
        if (isOpen) {
            const endTime = this.getDiningHallEndTime(hall);
            if (endTime) {
                statusText = `Open until ${endTime}`;
            } else {
                statusText = 'Open';
            }
        }

        card.innerHTML = `
            <div class="dining-hall-header">
                <div class="dining-hall-info">
                    <h2 class="dining-hall-name">${hall.name}</h2>
                    <div class="dining-hall-status ${statusClass}">${statusText}</div>
                    <p class="dining-hall-description">${hall.description}</p>
                </div>
                <div class="heart-icon ${isHallLiked ? 'liked' : ''}">
                    <img src="${isHallLiked ? 'heart.png' : 'heart-transparent.png'}" alt="Heart" class="heart-image">
                </div>
            </div>
            ${this.createMenuContent(hall)}
        `;

        // Add click handler for heart icon
        const heartIcon = card.querySelector('.heart-icon');
        heartIcon.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleHeartClick(e, card, hall);
        });

        // Add double-click handler for smart hearting
        card.addEventListener('dblclick', (e) => {
            e.preventDefault();
            this.handleSmartDoubleClick(e, card, hall);
        });

        // Add single-click handlers for menu item hearts
        const menuItemHearts = card.querySelectorAll('.menu-item-heart');
        menuItemHearts.forEach(heartElement => {
            heartElement.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const menuItem = e.target.closest('.menu-item');
                if (menuItem) {
                    this.handleMenuItemHeart(e, menuItem);
                }
            });
        });

        return card;
    }

    isDiningHallOpen(hall) {
        // Check if the dining hall has any events on the selected date that indicate it's open
        if (!hall.operatingHours || !Array.isArray(hall.operatingHours)) {
            return false;
        }
        
        // Look for selected date's schedule
        const selectedDateSchedule = hall.operatingHours.find(schedule => schedule.date === this.selectedDate);
        
        if (!selectedDateSchedule) {
            return false;
        }
        
        // If status is "EVENTS", it's likely open
        return selectedDateSchedule.status === 'EVENTS' && selectedDateSchedule.events && selectedDateSchedule.events.length > 0;
    }

    isDiningHallOpenAtTime(hall) {
        // Check if the dining hall is open at the specified time
        if (!hall.operatingHours || !Array.isArray(hall.operatingHours)) {
            return false;
        }
        
        // Look for selected date's schedule
        const selectedDateSchedule = hall.operatingHours.find(schedule => schedule.date === this.selectedDate);
        
        if (!selectedDateSchedule || !selectedDateSchedule.events) {
            return false;
        }
        
        // Convert selected time to minutes for easier comparison
        const selectedMinutes = this.timeToMinutes(this.selectedTime);
        
        // Check if any event contains the specified time
        return selectedDateSchedule.events.some(event => {
            if (!event.start || !event.end) return false;
            
            // Parse event times (format like "8:00am" or "11:00pm")
            const eventStartMinutes = this.parseEventTime(event.start);
            const eventEndMinutes = this.parseEventTime(event.end);
            
            if (eventStartMinutes === null || eventEndMinutes === null) return false;
            
            // Handle times that span across midnight (e.g., 8:00am to 2:00am next day)
            if (eventEndMinutes < eventStartMinutes) {
                // Time spans across midnight
                // Check if selected time is either:
                // 1. After start time (same day), OR
                // 2. Before end time (next day)
                return selectedMinutes >= eventStartMinutes || selectedMinutes <= eventEndMinutes;
            } else {
                // Normal time range (no midnight crossing)
                return selectedMinutes >= eventStartMinutes && selectedMinutes <= eventEndMinutes;
            }
        });
    }

    timeToMinutes(timeString) {
        // Convert "HH:MM" format to minutes since midnight
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
    }

    formatTimeForDisplay(timeString) {
        // Convert "HH:MM" format to 12-hour format for display
        const [hours, minutes] = timeString.split(':').map(Number);
        let displayHours = hours;
        let period = 'AM';
        
        if (hours === 0) {
            displayHours = 12;
            period = 'AM';
        } else if (hours === 12) {
            displayHours = 12;
            period = 'PM';
        } else if (hours > 12) {
            displayHours = hours - 12;
            period = 'PM';
        }
        
        const minuteStr = minutes === 0 ? '' : `:${minutes.toString().padStart(2, '0')}`;
        return `${displayHours}${minuteStr} ${period}`;
    }

    getOriginalOperatingHours(eateryId) {
        const originalEatery = this.originalEateries.find(eatery => eatery.id === eateryId);
        return originalEatery ? originalEatery.operatingHours : [];
    }

    parseEventTime(timeString) {
        // Parse times like "8:00am", "11:00pm", "12:30pm" to minutes since midnight
        const match = timeString.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
        if (!match) return null;
        
        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const period = match[3].toLowerCase();
        
        // Convert to 24-hour format
        if (period === 'pm' && hours !== 12) {
            hours += 12;
        } else if (period === 'am' && hours === 12) {
            hours = 0;
        }
        
        return hours * 60 + minutes;
    }

    getDiningHallEndTime(hall) {
        // Get the end time of the current event for the dining hall at the selected time
        if (!hall.operatingHours || !Array.isArray(hall.operatingHours)) {
            return null;
        }
        
        // Look for selected date's schedule
        const selectedDateSchedule = hall.operatingHours.find(schedule => schedule.date === this.selectedDate);
        
        if (!selectedDateSchedule || !selectedDateSchedule.events) {
            return null;
        }
        
        // Convert selected time to minutes for easier comparison
        const selectedMinutes = this.timeToMinutes(this.selectedTime);
        
        // Find the event that contains the specified time
        const currentEvent = selectedDateSchedule.events.find(event => {
            if (!event.start || !event.end) return false;
            
            // Parse event times (format like "8:00am" or "11:00pm")
            const eventStartMinutes = this.parseEventTime(event.start);
            const eventEndMinutes = this.parseEventTime(event.end);
            
            if (eventStartMinutes === null || eventEndMinutes === null) return false;
            
            // Handle times that span across midnight (e.g., 8:00am to 2:00am next day)
            if (eventEndMinutes < eventStartMinutes) {
                // Time spans across midnight
                return selectedMinutes >= eventStartMinutes || selectedMinutes <= eventEndMinutes;
            } else {
                // Normal time range (no midnight crossing)
                return selectedMinutes >= eventStartMinutes && selectedMinutes <= eventEndMinutes;
            }
        });
        
        return currentEvent ? currentEvent.end : null;
    }

    createMenuContent(hall) {
        if (!hall.menus || Object.keys(hall.menus).length === 0) {
            return `
                <div class="menu-content">
                    <h3 class="menu-title">Menu for ${hall.name}</h3>
                    <p style="text-align: center; color: #666; margin-top: 2rem;">
                        No menu available for selected date
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

    async handleHeartClick(e, card, hall) {
        e.stopPropagation();
        
        if (!this.user) {
            this.showAuthModal();
            return;
        }

        // Heart the dining hall
        await this.toggleDiningHallHeart(hall.id, card);
    }

    async handleSmartDoubleClick(e, card, hall) {
        e.stopPropagation();
        
        if (!this.user) {
            this.showAuthModal();
            return;
        }

        // Check if the double-click target is a menu item or within a menu item
        const menuItem = e.target.closest('.menu-item');
        
        if (menuItem) {
            // Double-clicked on a menu item - heart the menu item
            await this.handleMenuItemHeart(e, menuItem);
        } else {
            // Double-clicked elsewhere - heart the dining hall
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