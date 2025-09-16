class CornellDiningApp {
    constructor() {
        this.diningHalls = [];
        this.originalEateries = []; // Store original eateries data for time filtering
        this.user = null;
        this.userHearts = { diningHalls: [], menuItems: [] };
        this.userDetailedHearts = { diningHallHearts: [], menuItemHearts: [] };
        this.recommendations = [];
        this.serverTime = null; // Store server time for synchronization
        this.deviceId = this.getOrCreateDeviceId();
        // Use EST timezone for selected date
        const estDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        this.selectedDate = estDate; // Default to today in EST
        this.availableDates = []; // Will be populated from API data
        this.selectedTime = 'now'; // Default to current time
        this.pendingHeartRequests = new Set(); // Track ongoing heart requests to prevent race conditions
        
        // Double-click detection
        this.clickTimers = new Map(); // Store click timers for double-click detection
        this.DOUBLE_CLICK_DELAY = 300; // milliseconds

        this.init();
    }

    async init() {
        console.log('[Frontend] Initializing Cornell Dining App...');
        
        // Add a small delay to ensure DOM is fully ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        this.bindEvents();
        
        // Add network status monitoring
        this.setupNetworkMonitoring();
        
        // Add global error handler to catch any issues on Fly.io
        window.addEventListener('error', (e) => {
            console.error('[Frontend] [GLOBAL ERROR]:', e.error, e.message, e.filename, e.lineno);
        });
        
        window.addEventListener('unhandledrejection', (e) => {
            console.error('[Frontend] [UNHANDLED REJECTION]:', e.reason);
        });
        
        await this.checkAuth();
        await this.loadDiningData();
        await this.loadRecommendations();
        this.initializeDateSelector(); // Initialize after data is loaded
        this.renderDiningHalls();
        this.initializeChatbot(); // Initialize chatbot
        
        // Add manual check for search functionality after everything is loaded
        setTimeout(() => {
            this.debugSearchFunctionality();
        }, 1000);
        
        console.log('[Frontend] Initialization complete');
    }

    debugSearchFunctionality() {
        console.log('[Frontend] [DEBUG] ===== DEBUGGING SEARCH FUNCTIONALITY =====');
        
        const searchInput = document.getElementById('searchInput');
        const heartsManagerBtn = document.getElementById('heartsManagerBtn');
        
        if (searchInput) {
            // Test programmatic interaction
            try {
                const originalValue = searchInput.value;
                searchInput.value = 'TEST';
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                searchInput.value = originalValue;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('[Frontend] [DEBUG] Programmatic test successful');
            } catch (error) {
                console.error('[Frontend] [DEBUG] Programmatic test failed:', error);
            }
        }

        if (heartsManagerBtn) {
            // Test button availability
            try {
                heartsManagerBtn.focus();
            } catch (error) {
                console.error('[Frontend] [DEBUG] Programmatic button test failed:', error);
            }
        }
        
        console.log('[Frontend] [DEBUG] ===== END DEBUG SEARCH FUNCTIONALITY =====');
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
        const dateSelector = document.getElementById('dateSelector');
        if (dateSelector) {
            dateSelector.addEventListener('change', (e) => {
                this.selectedDate = e.target.value;
                this.onDateChange();
            });
        }

        // Time selector change event
        const timeSelector = document.getElementById('timeSelector');
        if (timeSelector) {
            timeSelector.addEventListener('change', (e) => {
                this.selectedTime = e.target.value;
                this.onTimeChange();
            });
        }
        
        // Search input event with retry logic
        this.bindSearchEvents();
        
        // Try binding search events again after a delay
        setTimeout(() => {
            this.bindSearchEvents();
        }, 1000);
        
        // Profile dropdown
        const profileBtn = document.getElementById('profileBtn');
        if (profileBtn) {
            profileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const dropdown = document.getElementById('profileDropdown');
                if (dropdown) {
                    dropdown.classList.toggle('hidden');
                }
            });
        }        // Close dropdown when clicking outside
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

        // Hearts modal events
        document.getElementById('heartsModalCloseBtn').addEventListener('click', () => {
            document.getElementById('heartsModal').classList.add('hidden');
        });

        // Hearts modal tab switching
        document.querySelectorAll('.hearts-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchHeartsTab(tabName);
            });
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

    bindSearchEvents() {
        // Search input event
        const searchInput = document.getElementById('searchInput');
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        
        if (searchInput) {
        if (!searchInput) {
            return;
        }
        
        // Check if already bound to avoid double-binding
        if (searchInput.hasAttribute('data-search-bound')) {
            return;
        }
        
        // Bind search input event
        
        const handleSearchChange = (value) => {
            console.log('[Frontend] [SEARCH] ===== SEARCH EVENT TRIGGERED =====');
            console.log('[Frontend] [SEARCH] Search input event triggered with value:', `"${value}"`);
            console.log('[Frontend] [SEARCH] Value type:', typeof value);
            console.log('[Frontend] [SEARCH] Value length:', value.length);
            
            // Show/hide clear button
            if (clearSearchBtn) {
                if (value.trim()) {
                    clearSearchBtn.classList.remove('hidden');
                    console.log('[Frontend] [SEARCH] Clear button shown');
                } else {
                    clearSearchBtn.classList.add('hidden');
                    console.log('[Frontend] [SEARCH] Clear button hidden');
                }
            } else {
                console.warn('[Frontend] [SEARCH] Clear button not found when trying to toggle');
            }
            
            this.onSearchChange(value);
            console.log('[Frontend] [SEARCH] ===== SEARCH EVENT COMPLETE =====');
        };
        
        // Test search input directly
        console.log('[Frontend] [SEARCH] [DEBUG] Testing search input focus...');
        
        // Add multiple event listeners for better coverage
        const events = ['input', 'keyup', 'change', 'paste'];
        events.forEach(eventType => {
            searchInput.addEventListener(eventType, (e) => {
                console.log(`[Frontend] [SEARCH] [DEBUG] ${eventType.toUpperCase()} event triggered with value:`, e.target.value);
                handleSearchChange(e.target.value);
            });
            console.log(`[Frontend] [SEARCH] [DEBUG] Added ${eventType} listener`);
        });
        
        searchInput.addEventListener('focus', () => {
            console.log('[Frontend] [SEARCH] [DEBUG] Search input focused!');
        });
        
        searchInput.addEventListener('blur', () => {
            console.log('[Frontend] [SEARCH] [DEBUG] Search input blurred!');
        });
        
        // Add click event for testing
        searchInput.addEventListener('click', () => {
            console.log('[Frontend] [SEARCH] [DEBUG] Search input clicked!');
        });
        
        // Mark as bound to prevent double-binding
        searchInput.setAttribute('data-search-bound', 'true');
        console.log('[Frontend] [SEARCH] [DEBUG] Search input marked as bound');
        
        // Test immediate focus to verify the element is interactive
        setTimeout(() => {
            console.log('[Frontend] [SEARCH] [DEBUG] Attempting test focus...');
            try {
                searchInput.focus();
                searchInput.blur();
                console.log('[Frontend] [SEARCH] [DEBUG] Test focus/blur successful');
            } catch (error) {
                console.error('[Frontend] [SEARCH] [DEBUG] Test focus/blur failed:', error);
            }
        }, 100);

        // Clear button functionality
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                console.log('[Frontend] [SEARCH] Clear button clicked');
                searchInput.value = '';
                clearSearchBtn.classList.add('hidden');
                this.onSearchChange('');
                searchInput.focus();
            });
            console.log('[Frontend] [SEARCH] Clear button event bound');
        } else {
            console.warn('[Frontend] [SEARCH] Clear search button not found');
        }
        
        // Hearts management button
        const heartsManagerBtn = document.getElementById('heartsManagerBtn');
        if (heartsManagerBtn) {
            heartsManagerBtn.addEventListener('click', () => {
                console.log('[Frontend] [HEARTS] Hearts manager button clicked');
                this.showHeartsModal();
            });
            console.log('[Frontend] [HEARTS] Hearts manager button event bound');
        } else {
            console.warn('[Frontend] [HEARTS] Hearts manager button not found');
        }
        
        console.log('[Frontend] [SEARCH] All search events bound successfully');
    }
    }

    setupNetworkMonitoring() {
        // Monitor network status
        window.addEventListener('online', () => {
            console.log('[Frontend] Network connection restored');
            this.clearErrorMessage();
            
            // If we have no dining data, try to reload it
            if (!this.diningHalls || this.diningHalls.length === 0) {
                console.log('[Frontend] Attempting to reload dining data after network restoration');
                this.loadDiningData();
            }
        });
        
        window.addEventListener('offline', () => {
            console.log('[Frontend] Network connection lost');
            this.showNetworkError();
        });
        
        // Check initial network status
        if (!navigator.onLine) {
            this.showNetworkError();
        }
    }

    showNetworkError() {
        this.clearErrorMessage();
        
        const errorBanner = document.createElement('div');
        errorBanner.className = 'error-banner persistent-error';
        errorBanner.innerHTML = `
            <div class="error-content">
                <span>No internet connection. Please check your network and try again.</span>
                <button onclick="window.location.reload()" class="retry-button">Retry</button>
            </div>
        `;
        document.body.appendChild(errorBanner);
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
        // Also reload recommendations with new time
        this.loadRecommendations();
    }

    onSearchChange(searchTerm) {
        // Trim the search term first
        const trimmedSearchTerm = searchTerm.trim();
        this.applySearchFilter(trimmedSearchTerm);
    }

    // Clear all search filters and show everything in alphabetical order
    clearAllSearchFilters() {
        const diningHallCards = document.querySelectorAll('.dining-hall-card');
        
        // Apply default ordering: Open first, then Closed (both alphabetical)
        this.applyCardOrdering(diningHallCards, null);
        
        // Remove all search filtering
        diningHallCards.forEach((card) => {
            card.classList.remove('search-filtered');
            const menuItems = card.querySelectorAll('.menu-item');
            menuItems.forEach((item) => {
                item.classList.remove('search-filtered');
            });
        });
    }

    /**
     * Apply card ordering based on current conditions
     * STANDARD ORDER: Open first, Closed second (both alphabetical)
     * 
     * SPECIAL CONDITIONS (like search): 
     * 1. Open & match condition first
     * 2. Closed & match condition second  
     * 3. Open & !match condition third
     * 4. Closed & !match condition fourth
     * 
     * @param {NodeList|Array} cards - The dining hall cards to order
     * @param {Object|null} specialCondition - Special condition object with:
     *   - matchesFn: function(card) => boolean - determines if card matches condition
     *   - scoreFn: function(card) => number - assigns relevance score within matching cards
     *   - name: string - condition name for logging
     * 
     * NOTE: Any future special conditions should follow this same 4-tier pattern:
     * Open+Match, Closed+Match, Open+NoMatch, Closed+NoMatch
     */
    applyCardOrdering(cards, specialCondition = null) {
        const container = document.getElementById('diningHallsList');
        if (!container) {
            console.error('[Frontend] [ORDERING] Could not find dining halls list container');
            return;
        }

        const cardArray = Array.from(cards);
        
        if (!specialCondition) {
            // STANDARD ORDER: Open first, Closed second (both alphabetical)
            console.log('[Frontend] [ORDERING] Applying standard order: Open first, Closed second');
            
            const openCards = [];
            const closedCards = [];
            
            cardArray.forEach((card) => {
                const isOpen = this.isCardOpen(card);
                card.dataset.diningHallName = this.getCardName(card);
                
                if (isOpen) {
                    openCards.push(card);
                } else {
                    closedCards.push(card);
                }
            });
            
            // Sort both groups alphabetically
            const sortedOpen = this.sortCardsAlphabetically(openCards);
            const sortedClosed = this.sortCardsAlphabetically(closedCards);
            
            // Apply to DOM: Open first, then Closed
            sortedOpen.forEach(card => container.appendChild(card));
            sortedClosed.forEach(card => container.appendChild(card));
            return;
        }

        // SPECIAL CONDITION ORDER: 4-tier hierarchy        
        const openMatching = [];
        const closedMatching = [];
        const openNonMatching = [];
        const closedNonMatching = [];
        
        cardArray.forEach((card, cardIndex) => {
            const isOpen = this.isCardOpen(card);
            const matches = specialCondition.matchesFn(card);
            const cardName = this.getCardName(card);
            
            // Store metadata for sorting
            card.dataset.diningHallName = cardName;
            card.dataset.isOpen = isOpen;
            if (matches && specialCondition.scoreFn) {
                card.dataset.searchScore = specialCondition.scoreFn(card);
            }
            
            // Categorize into 4-tier hierarchy
            if (isOpen && matches) {
                openMatching.push(card);
            } else if (!isOpen && matches) {
                closedMatching.push(card);
            } else if (isOpen && !matches) {
                openNonMatching.push(card);
            } else {
                closedNonMatching.push(card);
            }
        });
        
        // Sort each tier (matching cards by relevance score, non-matching alphabetically)
        const sortedOpenMatching = this.sortCardsByRelevance(openMatching);
        const sortedClosedMatching = this.sortCardsByRelevance(closedMatching);
        const sortedOpenNonMatching = this.sortCardsAlphabetically(openNonMatching);
        const sortedClosedNonMatching = this.sortCardsAlphabetically(closedNonMatching);
        
        // Apply to DOM in 4-tier order
        sortedOpenMatching.forEach(card => container.appendChild(card));
        sortedClosedMatching.forEach(card => container.appendChild(card));
        sortedOpenNonMatching.forEach(card => container.appendChild(card));
        sortedClosedNonMatching.forEach(card => container.appendChild(card));
    }

    // Helper function to determine if a card is open
    // This checks the CSS classes that were set during renderDiningHalls
    isCardOpen(card) {
        // Check if the card has the 'closed-hall' class or closed status
        const isClosedHall = card.classList.contains('closed-hall');
        const statusElement = card.querySelector('.dining-hall-status');
        const hasClosedStatus = statusElement && statusElement.classList.contains('closed');
        
        return !isClosedHall && !hasClosedStatus;
    }

    // Helper function to get card name
    getCardName(card) {
        const nameElement = card.querySelector('.dining-hall-name');
        return nameElement ? nameElement.textContent.toLowerCase() : '';
    }

    // Sort cards by relevance score, then alphabetically
    sortCardsByRelevance(cards) {
        return cards.sort((a, b) => {
            const scoreA = parseInt(a.dataset.searchScore) || 0;
            const scoreB = parseInt(b.dataset.searchScore) || 0;
            
            // First sort by relevance score (higher is better)
            if (scoreA !== scoreB) {
                return scoreB - scoreA;
            }
            
            // Then sort alphabetically
            const nameA = a.dataset.diningHallName || '';
            const nameB = b.dataset.diningHallName || '';
            return nameA.localeCompare(nameB);
        });
    }

    // Sort cards alphabetically by name
    sortCardsAlphabetically(cards) {
        return cards.sort((a, b) => {
            const nameA = a.dataset.diningHallName || '';
            const nameB = b.dataset.diningHallName || '';
            return nameA.localeCompare(nameB);
        });
    }

    // Normalize text for comparison by removing spaces and replacing special characters
    normalizeForSearch(text) {
        return text
            .toLowerCase()
            .trim()
            // Remove all spaces
            .replace(/\s+/g, '')
            // Replace accented characters with their base equivalents
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            // Replace common special characters
            .replace(/['']/g, "'")  // Smart quotes to regular apostrophe
            .replace(/[""]/g, '"')  // Smart quotes to regular quotes
            .replace(/[–—]/g, '-')  // En dash and em dash to hyphen
            .replace(/[àáâãäå]/g, 'a')
            .replace(/[èéêë]/g, 'e')
            .replace(/[ìíîï]/g, 'i')
            .replace(/[òóôõö]/g, 'o')
            .replace(/[ùúûü]/g, 'u')
            .replace(/[ýÿ]/g, 'y')
            .replace(/[ñ]/g, 'n')
            .replace(/[ç]/g, 'c')
            .replace(/[ß]/g, 'ss')
            .replace(/[æ]/g, 'ae')
            .replace(/[œ]/g, 'oe')
            .replace(/[ø]/g, 'o')
            .replace(/[þ]/g, 'th')
            .replace(/[ð]/g, 'd');
    }

    applySearchFilter(searchTerm) {
        // Early check for empty or whitespace-only strings
        if (!searchTerm || !searchTerm.trim()) {
            this.clearAllSearchFilters();
            return;
        }
        
        const normalizedSearch = this.normalizeForSearch(searchTerm);
        
        // Double-check after normalization (in case special characters result in empty string)
        if (!normalizedSearch) {
            this.clearAllSearchFilters();
            return;
        }
        
        const diningHallCards = document.querySelectorAll('.dining-hall-card');
        
        // Process each card to determine matches and apply menu item filtering
        Array.from(diningHallCards).forEach((card, cardIndex) => {
            const diningHallNameElement = card.querySelector('.dining-hall-name');
            if (!diningHallNameElement) {
                card.classList.add('search-filtered');
                return;
            }
            
            const diningHallName = diningHallNameElement.textContent.toLowerCase();
            const normalizedDiningHallName = this.normalizeForSearch(diningHallNameElement.textContent);
            
            const menuItems = card.querySelectorAll('.menu-item');
            
            let diningHallMatches = normalizedDiningHallName.includes(normalizedSearch);
            
            let hasMatchingMenuItems = false;
            let matchingMenuItemsCount = 0;

            // Check menu items and apply filtering
            menuItems.forEach((menuItem, menuIndex) => {
                const menuItemNameElement = menuItem.querySelector('.menu-item-name');
                if (!menuItemNameElement) {
                    menuItem.classList.add('search-filtered');
                    return;
                }
                
                const menuItemName = menuItemNameElement.textContent.toLowerCase();
                const normalizedMenuItemName = this.normalizeForSearch(menuItemNameElement.textContent);
                const menuItemMatches = normalizedMenuItemName.includes(normalizedSearch);
                
                if (menuItemMatches) {
                    hasMatchingMenuItems = true;
                    matchingMenuItemsCount++;
                    menuItem.classList.remove('search-filtered');
                } else {
                    menuItem.classList.add('search-filtered');
                }
            });

            // Determine if this card has any matches and set filtering
            const cardHasMatches = diningHallMatches || hasMatchingMenuItems;
            
            if (cardHasMatches) {
                card.classList.remove('search-filtered');
            } else {
                card.classList.add('search-filtered');
            }
        });

        // Apply search-based ordering using the new ordering system
        const searchCondition = {
            name: 'Search',
            matchesFn: (card) => {
                // A card matches if it has search matches (not filtered out)
                return !card.classList.contains('search-filtered');
            },
            scoreFn: (card) => {
                // Calculate relevance score for matching cards
                const diningHallNameElement = card.querySelector('.dining-hall-name');
                if (!diningHallNameElement) return 0;
                
                const normalizedDiningHallName = this.normalizeForSearch(diningHallNameElement.textContent);
                const diningHallMatches = normalizedDiningHallName.includes(normalizedSearch);
                
                if (diningHallMatches) {
                    // Dining hall name matches get highest priority (1000+)
                    return 1000;
                }
                
                // Count matching menu items for relevance score
                const menuItems = card.querySelectorAll('.menu-item:not(.search-filtered)');
                return menuItems.length; // Number of matching menu items
            }
        };

        this.applyCardOrdering(diningHallCards, searchCondition);
    }

    updateDayOfWeek() {
        const dayOfWeekElement = document.getElementById('dayOfWeek');
        if (this.selectedDate) {
            // Use EST timezone for day calculation
            const date = new Date(this.selectedDate + 'T12:00:00'); // Use noon to avoid timezone issues
            const dayName = date.toLocaleDateString('en-US', { 
                weekday: 'long',
                timeZone: 'America/New_York'
            });
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
        console.log('[Frontend] [AUTH] Starting auth check for deviceId:', this.deviceId);
        
        try {
            console.log('[Frontend] [AUTH] Making auth check request...');
            const response = await fetch(`/api/auth/check/${this.deviceId}`);
            console.log('[Frontend] [AUTH] Auth check response status:', response.status);
            
            if (response.status === 502 || response.status === 503 || response.status === 504) {
                console.log('[Frontend] [AUTH] Cold start detected during auth check, retrying...');
                // Wait a bit and retry multiple times for cold start
                for (let retryAttempt = 1; retryAttempt <= 3; retryAttempt++) {
                    console.log(`[Frontend] [AUTH] Retry attempt ${retryAttempt}/3`);
                    await new Promise(resolve => setTimeout(resolve, retryAttempt * 2000)); // 2s, 4s, 6s
                    
                    const retryResponse = await fetch(`/api/auth/check/${this.deviceId}`);
                    console.log(`[Frontend] [AUTH] Auth retry ${retryAttempt} response status:`, retryResponse.status);
                    
                    if (retryResponse.ok) {
                        const retryData = await retryResponse.json();
                        console.log('[Frontend] [AUTH] Auth retry data:', retryData);
                        
                        if (retryData.signedIn) {
                            this.user = retryData.user;
                            console.log('[Frontend] [AUTH] User authenticated after retry:', this.user);
                            this.updateUIForSignedInUser();
                            await this.loadUserHearts();
                            return;
                        }
                    }
                    
                    if (retryAttempt === 3) {
                        console.log('[Frontend] [AUTH] All auth retries failed');
                        break;
                    }
                }
                
                console.log('[Frontend] [AUTH] Auth retry failed or user not signed in');
                this.updateUIForSignedOutUser();
                return;
            }
            
            if (!response.ok) {
                console.log('[Frontend] [AUTH] Auth check failed with status:', response.status);
                this.updateUIForSignedOutUser();
                return;
            }
            
            const data = await response.json();
            console.log('[Frontend] [AUTH] Auth check data:', data);
            
            if (data.signedIn) {
                this.user = data.user;
                console.log('[Frontend] [AUTH] User authenticated:', this.user);
                this.updateUIForSignedInUser();
                await this.loadUserHearts();
            } else {
                console.log('[Frontend] [AUTH] User not signed in');
                this.updateUIForSignedOutUser();
            }
        } catch (error) {
            console.error('[Frontend] [AUTH] Error checking auth:', error);
            console.log('[Frontend] [AUTH] Setting signed out state due to error');
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
                await this.loadRecommendations();
                this.renderDiningHalls(); // Re-render to show hearts and recommendations
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
            this.userDetailedHearts = { diningHallHearts: [], menuItemHearts: [] };
            this.updateUIForSignedOutUser();
            document.getElementById('profileDropdown').classList.add('hidden');
            this.renderDiningHalls(); // Re-render to hide hearts
        } catch (error) {
            console.error('Error signing out:', error);
        }
    }

    updateUIForSignedInUser() {
        console.log('[Frontend] [AUTH] Updating UI for signed in user:', this.user.name);
        console.log('[Frontend] [AUTH] User object:', this.user);
        document.getElementById('profileName').textContent = this.user.name;
        document.getElementById('signInForm').classList.add('hidden');
        document.getElementById('userInfo').classList.remove('hidden');
        document.getElementById('userName').textContent = this.user.name;
    }

    updateUIForSignedOutUser() {
        console.log('[Frontend] [AUTH] Updating UI for signed out state');
        document.getElementById('profileName').textContent = 'Sign In';
        document.getElementById('signInForm').classList.remove('hidden');
        document.getElementById('userInfo').classList.add('hidden');
        // Clear the name input when signing out
        document.getElementById('nameInput').value = '';
    }

    async loadUserHearts() {
        if (!this.user) {
            console.log('[Frontend] [AUTH] No user found, skipping heart loading');
            return;
        }

        console.log('[Frontend] [AUTH] Loading hearts for user:', this.user.userId);
        
        try {
            // Load both simple hearts (for compatibility) and detailed hearts
            const [simpleResponse, detailedResponse] = await Promise.all([
                fetch(`/api/hearts/${this.user.userId}`),
                fetch(`/api/hearts/${this.user.userId}/detailed`)
            ]);
            
            console.log('[Frontend] [AUTH] Hearts response statuses:', {
                simple: simpleResponse.status,
                detailed: detailedResponse.status
            });
            
            const simpleData = await simpleResponse.json();
            const detailedData = await detailedResponse.json();
            
            this.userHearts = simpleData;
            this.userDetailedHearts = detailedData;
            
            console.log('[Frontend] [AUTH] Loaded simple hearts:', simpleData);
            console.log('[Frontend] [AUTH] Loaded detailed hearts:', detailedData);
        } catch (error) {
            console.error('Error loading user hearts:', error);
        }
    }

    // Get hearts that should be displayed (only today's hearts)
    getVisibleHearts() {
        if (!this.userDetailedHearts || !this.userDetailedHearts.diningHallHearts) {
            return [];
        }

        // Only show hearts created today - no time-based filtering needed anymore
        const today = new Date().toISOString().split('T')[0];
        
        return this.userDetailedHearts.diningHallHearts.filter(heart => {
            // Only show hearts created today
            return heart.dateCreated === today;
        }).map(heart => heart.diningHallId);
    }

    getCurrentViewingTime() {
        if (this.selectedTime === 'now') {
            // For 'now', use stored server time if available, otherwise current EST time
            if (this.serverTime) {
                const estTimeString = this.serverTime.toLocaleString("en-US", {
                    timeZone: "America/New_York",
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit'
                });
                return estTimeString;
            } else {
                // Use EST timezone for current time
                const now = new Date();
                const estTimeString = now.toLocaleString("en-US", {
                    timeZone: "America/New_York",
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit'
                });
                return estTimeString;
            }
        }
        return this.selectedTime;
    }

    // This function is no longer needed with the new daily heart system, but keeping for compatibility
    isHeartVisibleAtTime(heart, viewingTime, viewingDay) {
        // With the new system, hearts are only visible on the day they were created
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        return heart.dateCreated === today;
    }

    async loadRecommendations() {
        
        if (!this.user) {
            this.recommendations = [];
            return;
        }
        
        try {
            // Get server time for synchronization
            const timeResponse = await fetch('/api/time');
            let serverTime;
            
            if (timeResponse.ok) {
                const timeData = await timeResponse.json();
                serverTime = new Date(timeData.currentTime);
                this.serverTime = serverTime; // Store for UI rendering
                
                // Check if there's a date mismatch that could cause issues
                const serverDate = serverTime.toISOString().split('T')[0];
                if (this.selectedDate !== serverDate && this.selectedTime === 'now') {
                    console.log('[RECOMMENDATIONS] WARNING: Date mismatch detected!');
                    console.log('[RECOMMENDATIONS] Selected date:', this.selectedDate);
                    console.log('[RECOMMENDATIONS] Server date:', serverDate);
                }
            } else {
                console.log('[RECOMMENDATIONS] Failed to get server time, using local EST time');
                // Create EST time as fallback
                const now = new Date();
                serverTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
                this.serverTime = serverTime;
            }
            
            let time, day;
            
            if (this.selectedTime === 'now') {
                // Use server EST time for current time and day
                time = `${serverTime.getHours().toString().padStart(2, '0')}:${serverTime.getMinutes().toString().padStart(2, '0')}`;
                day = serverTime.getDay(); // 0 = Sunday, 1 = Monday, etc.
            } else {
                // Use selected time but server's current day (in EST)
                time = this.selectedTime;
                day = serverTime.getDay();
            }
            
            const response = await fetch(`/api/recommendations/${this.user.userId}?time=${time}&day=${day}`);
            
            const data = await response.json();
            
            if (data.success) {
                this.recommendations = data.recommendations;
                // Sort recommendations by priority (open status + confidence)
                this.sortRecommendationsByPriority(serverTime);
            } else {
                console.log('[RECOMMENDATIONS] Request unsuccessful:', data);
                this.recommendations = [];
            }
        } catch (error) {
            console.error('[RECOMMENDATIONS] Error loading recommendations:', error);
            this.recommendations = [];
        }
    }

    sortRecommendationsByPriority(serverTime = null) {
        
        if (!this.recommendations || this.recommendations.length === 0) {
            return;
        }
        
        this.recommendations.sort((a, b) => {
            
            // Find the dining halls for comparison
            let hallA = this.diningHalls.find(h => String(h.id) === String(a.diningHallId));
            let hallB = this.diningHalls.find(h => String(h.id) === String(b.diningHallId));
            
            // Add original operating hours (same as main cards)
            if (hallA) {
                const operatingHoursA = this.getOriginalOperatingHours(hallA.id);
                hallA = { ...hallA, operatingHours: operatingHoursA };
            }
            if (hallB) {
                const operatingHoursB = this.getOriginalOperatingHours(hallB.id);
                hallB = { ...hallB, operatingHours: operatingHoursB };
            }
            
            if (!hallA || !hallB) {
                return b.confidence - a.confidence;
            }
            
            // Check if halls are open using the user's selected time setting
            const isOpenA = this.isDiningHallOpenAtTime(hallA);  // Don't pass server time - let it use selectedTime
            const isOpenB = this.isDiningHallOpenAtTime(hallB);  // Don't pass server time - let it use selectedTime
            
            // Weight constants for priority calculation
            const OPEN_WEIGHT = 2.0;        // Open halls get 2x weight
            const CONFIDENCE_WEIGHT = 1.0;   // Base confidence weight
            
            // Calculate priority scores
            const priorityA = (isOpenA ? OPEN_WEIGHT : 0.3) * CONFIDENCE_WEIGHT * a.confidence;
            const priorityB = (isOpenB ? OPEN_WEIGHT : 0.3) * CONFIDENCE_WEIGHT * b.confidence;
            
            // Sort by priority (higher priority first)
            const result = priorityB - priorityA;
            return result;
        });
        
        console.log(`[Frontend] [PRIORITY] Final sorted recommendations:`, this.recommendations.map((r, idx) => {
            const hall = this.diningHalls.find(h => String(h.id) === String(r.diningHallId));
            const isOpen = hall ? this.isDiningHallOpenAtTime(hall) : false;  // Don't pass server time
            return {
                rank: idx + 1,
                name: hall?.name || `Hall ${r.diningHallId}`,
                confidence: r.confidence,
                isOpen: isOpen,
                priority: (isOpen ? 2.0 : 0.3) * r.confidence
            };
        }));
        console.log('[Frontend] [PRIORITY] ===== END PRIORITY SORTING =====');
    }

    async loadDiningData(retryCount = 0) {
        const maxRetries = 10; // Increased for cold starts
        const loadingScreen = document.getElementById('loadingScreen');
        console.log(`[Frontend] [UI] Loading screen element found: ${!!loadingScreen}`);
        if (loadingScreen) {
            loadingScreen.classList.remove('hidden');
            loadingScreen.style.display = 'flex';
            loadingScreen.style.visibility = 'visible';
            console.log(`[Frontend] [UI] Loading screen shown for attempt ${retryCount + 1}`);
            console.log(`[Frontend] [UI] Loading screen classes:`, loadingScreen.className);
        }

        try {
            // For cold start scenarios, ping the backend first to wake it up
            if (retryCount === 0) {
                console.log('[Frontend] Performing backend health check...');
                try {
                    const healthController = new AbortController();
                    setTimeout(() => healthController.abort(), 5000); // Short timeout for health check
                    
                    const healthCheck = await fetch('/api/health', { 
                        method: 'GET',
                        signal: healthController.signal,
                        headers: { 'Cache-Control': 'no-cache' }
                    });
                    console.log('[Frontend] Health check status:', healthCheck.status);
                } catch (healthError) {
                    console.log('[Frontend] Health check failed (expected during cold start):', healthError.message);
                    // Give backend a moment to start up after the health check attempt
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            // For initial load, get data without a specific date to get the full range
            // For subsequent loads, use the selected date
            const isInitialLoad = this.availableDates.length === 0;
            const url = isInitialLoad ? '/api/dining' : `/api/dining/${this.selectedDate}`;
            
            console.log(`[Frontend] Fetching dining data from backend for date: ${isInitialLoad ? 'all dates' : this.selectedDate} (attempt ${retryCount + 1}/${maxRetries + 1})`);
            
            // Progressive timeout for cold starts - longer timeout for first attempts
            const baseTimeout = retryCount === 0 ? 30000 : (retryCount === 1 ? 25000 : 20000); // 30s, 25s, then 20s
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), baseTimeout);
            
            // Add a timestamp to prevent browser caching of failed requests
            const urlWithTimestamp = url + (url.includes('?') ? '&' : '?') + `_t=${Date.now()}`;
            
            const response = await fetch(urlWithTimestamp, { 
                signal: controller.signal,
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            
            clearTimeout(timeoutId);
            console.log('[Frontend] Response status:', response.status);
            
            // Handle specific status codes that indicate cold start issues
            if (response.status === 502 || response.status === 503 || response.status === 504) {
                throw new Error(`Cold start backend error! status: ${response.status} - Backend is starting up`);
            }
            
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
                    menus: this.processMenus(eatery.operatingHours),
                    operatingHours: eatery.operatingHours,
                    campusArea: eatery.campusArea || 'Unknown',
                };
                console.log(`[Frontend] Processed dining hall:`, processed.name, 'with', Object.keys(processed.menus).length, 'meal types');
                return processed;
            });

            console.log('[Frontend] Final processed dining halls:', this.diningHalls.length);
            
            // Hide loading screen and clear any retry messages
            if (loadingScreen) {
                loadingScreen.classList.add('hidden');
                loadingScreen.style.display = 'none';
                console.log('[Frontend] [UI] Loading screen hidden after successful data load');
            }
            
            // Clear any existing error messages
            this.clearErrorMessage();
            
        } catch (error) {
            console.error(`[Frontend] Error loading dining data (attempt ${retryCount + 1}):`, error);
            console.error('[Frontend] Error stack:', error.stack);
            console.error('[Frontend] Error name:', error.name);
            console.error('[Frontend] Error message:', error.message);
            
            // Determine if this looks like a cold start issue
            const isColdStartError = error.message.includes('Cold start') || 
                                   error.message.includes('backend error') ||
                                   error.message.includes('502') || 
                                   error.message.includes('503') || 
                                   error.message.includes('504') ||
                                   error.name === 'AbortError' ||
                                   error.message.includes('Failed to fetch');
            
            console.log(`[Frontend] Is cold start error: ${isColdStartError}`);
            
            // Retry logic with longer delays for cold starts
            if (retryCount < maxRetries) {
                // Cold start errors get longer delays, especially early attempts
                let retryDelay;
                if (isColdStartError) {
                    // For cold starts: 3s, 5s, 8s, 12s, 15s
                    retryDelay = Math.min(3000 + (retryCount * 2000) + (retryCount * retryCount * 1000), 15000);
                } else {
                    // For other errors: 1s, 2s, 4s, 8s, 10s
                    retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
                }
                
                console.log(`[Frontend] ${isColdStartError ? 'Cold start detected.' : 'Network error.'} Retrying in ${retryDelay}ms...`);
                
                // Only show retry message on first attempt to avoid updating the banner repeatedly
                if (retryCount === 0) {
                    this.showRetryMessage(retryCount + 1, maxRetries + 1, isColdStartError);
                    
                    // Force a reflow to ensure the banner appears immediately
                    document.body.offsetHeight;
                    
                    console.log('🎯 UI feedback shown, starting retry delay...');
                } else {
                    console.log('🎯 Continuing with existing UI feedback, starting retry delay...');
                }
                
                // Use Promise-based delay instead of setTimeout to properly block
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                
                console.log('🎯 Retry delay complete, attempting next retry...');
                return await this.loadDiningData(retryCount + 1);
            }
            
            // All retries exhausted
            if (loadingScreen) {
                loadingScreen.classList.add('hidden');
                loadingScreen.style.display = 'none';
                console.log('[Frontend] [UI] Loading screen hidden after all retries exhausted');
            }
            this.showPersistentError(isColdStartError);
        }
    }

    clearErrorMessage() {
        const existingError = document.querySelector('.error-banner');
        if (existingError) {
            existingError.remove();
        }
    }

    showRetryMessage(currentAttempt, maxAttempts, isColdStart = false) {
        console.log(`[Frontend] [UI] Showing retry message: attempt ${currentAttempt}/${maxAttempts}, coldStart: ${isColdStart}`);
        this.clearErrorMessage();
        
        const errorBanner = document.createElement('div');
        errorBanner.className = 'error-banner retry-banner';
        
        // Force position and visibility styles
        errorBanner.style.position = 'fixed';
        errorBanner.style.top = '0';
        errorBanner.style.left = '0';
        errorBanner.style.right = '0';
        errorBanner.style.zIndex = '99999';
        errorBanner.style.display = 'block';
        errorBanner.style.visibility = 'visible';
        
        const message = isColdStart 
            ? `Waiting for backend to start up...`
            : `Loading dining data...`;
            
        console.log(`[Frontend] [UI] Retry message text: ${message} (Attempt ${currentAttempt}/${maxAttempts})`);
            
        errorBanner.innerHTML = `
            <div class="error-content">
                <span>${message}</span>
                <div class="loading-spinner"></div>
            </div>
        `;
        
        document.body.appendChild(errorBanner);
        console.log(`[Frontend] [UI] Retry banner added to page`);
        
        // Force immediate visibility
        errorBanner.offsetHeight;
        
        // Double check the banner is visible
        setTimeout(() => {
            const bannerInDom = document.querySelector('.retry-banner');
            console.log(`[Frontend] [UI] Banner still in DOM after 100ms:`, !!bannerInDom);
            if (bannerInDom) {
                const styles = window.getComputedStyle(bannerInDom);
                console.log(`[Frontend] [UI] Banner computed styles:`, {
                    display: styles.display,
                    visibility: styles.visibility,
                    zIndex: styles.zIndex,
                    position: styles.position
                });
            }
        }, 100);
    }

    showPersistentError(isColdStart = false) {
        this.clearErrorMessage();
        
        const errorBanner = document.createElement('div');
        errorBanner.className = 'error-banner persistent-error';
        
        const message = isColdStart
            ? 'Server startup is taking longer than expected. Please wait a moment and try again.'
            : 'Failed to load dining data. Please check your connection and try again.';
        
        errorBanner.innerHTML = `
            <div class="error-content">
                <span>${message}</span>
                <button onclick="eateries.forceReload()" class="retry-button">Retry</button>
            </div>
        `;
        document.body.appendChild(errorBanner);
    }

    // Force a hard reload that clears browser cache and state
    forceReload() {
        console.log('[Frontend] Forcing hard reload to clear cached error state');
        
        // Clear any stored data
        this.diningHalls = [];
        this.availableDates = [];
        this.originalEateries = [];
        this.recommendations = [];
        
        // Clear any cached responses
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => {
                    caches.delete(name);
                });
            });
        }
        
        // Force reload with cache bypass
        window.location.reload(true);
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

        // Add empty spacer row at the top
        const spacerRow = document.createElement('div');
        spacerRow.className = 'dining-hall-spacer';
        spacerRow.innerHTML = this.createRecommendationContent();
        
        // Add click handlers for recommendation cards
        spacerRow.addEventListener('click', (e) => {
            console.log('[Frontend] [RECOMMENDATION_CLICK] ===== RECOMMENDATION CARD CLICKED =====');
            console.log('[Frontend] [RECOMMENDATION_CLICK] Click event target:', e.target);
            console.log('[Frontend] [RECOMMENDATION_CLICK] Target tag:', e.target.tagName);
            console.log('[Frontend] [RECOMMENDATION_CLICK] Target classes:', e.target.className);
            console.log('[Frontend] [RECOMMENDATION_CLICK] Target text content:', e.target.textContent);
            
            const recommendationCard = e.target.closest('.recommendation-card');
            console.log('[Frontend] [RECOMMENDATION_CLICK] Found recommendation card:', !!recommendationCard);
            
            if (recommendationCard) {
                console.log('[Frontend] [RECOMMENDATION_CLICK] Recommendation card details:');
                console.log('[Frontend] [RECOMMENDATION_CLICK] - Card classes:', recommendationCard.className);
                console.log('[Frontend] [RECOMMENDATION_CLICK] - Card dataset:', recommendationCard.dataset);
                console.log('[Frontend] [RECOMMENDATION_CLICK] - Is empty card:', recommendationCard.classList.contains('empty'));
                
                if (!recommendationCard.classList.contains('empty')) {
                    const hallId = recommendationCard.dataset.hallId;
                    console.log('[Frontend] [RECOMMENDATION_CLICK] Hall ID from dataset:', hallId);
                    console.log('[Frontend] [RECOMMENDATION_CLICK] Hall ID type:', typeof hallId);
                    
                    if (hallId) {
                        console.log('[Frontend] [RECOMMENDATION_CLICK] Attempting to scroll to hall ID:', hallId);
                        this.scrollToHall(hallId);
                    } else {
                        console.error('[Frontend] [RECOMMENDATION_CLICK] No hall ID found in recommendation card dataset');
                    }
                } else {
                    console.log('[Frontend] [RECOMMENDATION_CLICK] Clicked on empty recommendation card, ignoring');
                }
            } else {
                console.log('[Frontend] [RECOMMENDATION_CLICK] Click was not on a recommendation card');
            }
            console.log('[Frontend] [RECOMMENDATION_CLICK] ===== END RECOMMENDATION CLICK =====');
        });
        
        list.appendChild(spacerRow);

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

        // Sort open halls: those with menus first, then those without menus
        openHalls.sort((a, b) => {
            const aHasMenu = this.hasMenuContent(a);
            const bHasMenu = this.hasMenuContent(b);
            
            if (aHasMenu && !bHasMenu) return -1; // a comes first
            if (!aHasMenu && bHasMenu) return 1;  // b comes first
            return 0; // keep original order if both have same menu status
        });

        // Create cards for open dining halls first (with menus first, then without)
        console.log(`[RENDER_DEBUG] About to create ${openHalls.length} open hall cards`);
        openHalls.forEach((hall, index) => {
            console.log(`[RENDER_DEBUG] Creating open card for ${hall.name} at index ${index}`);
            try {
                const card = this.createDiningHallCard(hall, index, false);
                list.appendChild(card);
                console.log(`[RENDER_DEBUG] Successfully created and appended card for ${hall.name}`);
            } catch (error) {
                console.error(`[RENDER_DEBUG] Error creating card for ${hall.name}:`, error);
            }
        });
        
        // Create cards for closed dining halls (greyed out)
        console.log(`[RENDER_DEBUG] About to create ${closedHalls.length} closed hall cards`);
        closedHalls.forEach((hall, index) => {
            console.log(`[RENDER_DEBUG] Creating closed card for ${hall.name} at index ${openHalls.length + index}`);
            try {
                const card = this.createDiningHallCard(hall, openHalls.length + index, true);
                list.appendChild(card);
                console.log(`[RENDER_DEBUG] Successfully created and appended card for ${hall.name}`);
            } catch (error) {
                console.error(`[RENDER_DEBUG] Error creating card for ${hall.name}:`, error);
            }
        });

        // Apply current search filter after rendering
        const searchInput = document.getElementById('searchInput');
        if (searchInput && searchInput.value.trim()) {
            console.log('[Frontend] [SEARCH] Re-applying search filter after render with term:', `"${searchInput.value}"`);
            this.applySearchFilter(searchInput.value);
        } else {
            console.log('[Frontend] [SEARCH] No search term to re-apply after render');
        }
    }

    createRecommendationContent() {
        
        if (!this.user) {
            return `
                <div class="recommendation-header">
                    <h3>Sign in to see personalized recommendations</h3>
                </div>
            `;
        }

        if (this.recommendations.length === 0) {
            return `
                <div class="recommendation-header">
                    <h3>Recommended for you</h3>
                    <p class="recommendation-subtitle">Start liking dining halls and meals to get personalized recommendations!</p>
                </div>
            `;
        }

        const recommendationColumns = this.recommendations.map((rec, recIndex) => {
            
            let hall = this.diningHalls.find(h => {
                const match = String(h.id) === String(rec.diningHallId);
                return match;
            });
            
            if (!hall) {
                console.log(`[REC_STATUS] ERROR: Could not find hall for ID ${rec.diningHallId}`);
            } else {
                // Get original operating hours for this dining hall (same as main cards)
                const operatingHours = this.getOriginalOperatingHours(hall.id);
                hall = { ...hall, operatingHours };
            }
            
            const hallName = hall ? hall.name : `Dining Hall ${rec.diningHallId}`;
            
            // Check if dining hall is open using user's selected time setting
            let isOpen = false;
            if (hall) {
                isOpen = this.isDiningHallOpenAtTime(hall);  // Don't pass server time - use selectedTime
            }
            
            const statusClass = isOpen ? 'open' : 'closed';
            let statusText = 'Closed';
            if (isOpen) {
                const endTime = this.getDiningHallEndTime(hall);
                if (endTime) {
                    statusText = `Open until ${endTime}`;
                } else {
                    statusText = 'Open';
                }
            } else {
                const nextOpenTime = this.getDiningHallNextOpenTime(hall);
                if (nextOpenTime) {
                    statusText = `Closed until ${nextOpenTime}`;
                } else {
                    statusText = 'Closed';
                }
            }
            const statusIcon = isOpen ? '🟢' : '🔴';
            
            return `
                <div class="recommendation-column">
                    <div class="recommendation-card ${statusClass}" data-hall-id="${rec.diningHallId}">
                        <div class="recommendation-status">
                            <span class="status-badge ${statusClass}">${statusIcon} ${statusText}</span>
                        </div>
                        <div class="recommendation-name">${hallName}</div>
                        <div class="recommendation-confidence">${Math.round(rec.confidence * 100)}% match</div>
                        <div class="recommendation-reason">${rec.reason}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Fill remaining columns if less than 3 recommendations
        const emptyColumns = Math.max(0, 3 - this.recommendations.length);
        const emptyColumnHTML = Array(emptyColumns).fill(`
            <div class="recommendation-column">
                <div class="recommendation-card empty">
                    <div class="recommendation-name">More recommendations coming soon...</div>
                </div>
            </div>
        `).join('');

        return `
            <div class="recommendation-header">
                <h3>Recommended for you</h3>
                <p class="recommendation-subtitle">Based on your dining preferences</p>
            </div>
            <div class="recommendation-columns">
                ${recommendationColumns}${emptyColumnHTML}
            </div>
        `;
    }

    bindRecommendationClickEvents() {
        // Find the spacer row and bind click events for recommendation cards
        const spacerRow = document.querySelector('.dining-hall-spacer');
        if (!spacerRow) {
            console.error('[Frontend] bindRecommendationClickEvents: Could not find spacer row');
            return;
        }

        // Remove existing event listeners to avoid duplicates
        const existingHandler = spacerRow.querySelector('.recommendation-click-handler');
        if (existingHandler) {
            spacerRow.removeEventListener('click', existingHandler);
        }

        // Add click handlers for recommendation cards
        const clickHandler = (e) => {
            console.log('[Frontend] [RECOMMENDATION_CLICK] ===== RECOMMENDATION CARD CLICKED =====');
            console.log('[Frontend] [RECOMMENDATION_CLICK] Click event target:', e.target);
            
            const recommendationCard = e.target.closest('.recommendation-card');
            console.log('[Frontend] [RECOMMENDATION_CLICK] Found recommendation card:', !!recommendationCard);
            
            if (recommendationCard) {
                console.log('[Frontend] [RECOMMENDATION_CLICK] - Is empty card:', recommendationCard.classList.contains('empty'));
                
                if (!recommendationCard.classList.contains('empty')) {
                    const hallId = recommendationCard.dataset.hallId;
                    console.log('[Frontend] [RECOMMENDATION_CLICK] Hall ID from dataset:', hallId);
                    
                    if (hallId) {
                        console.log('[Frontend] [RECOMMENDATION_CLICK] Attempting to scroll to hall ID:', hallId);
                        this.scrollToHall(hallId);
                    } else {
                        console.error('[Frontend] [RECOMMENDATION_CLICK] No hall ID found in recommendation card dataset');
                    }
                } else {
                    console.log('[Frontend] [RECOMMENDATION_CLICK] Clicked on empty recommendation card, ignoring');
                }
            } else {
                console.log('[Frontend] [RECOMMENDATION_CLICK] Click was not on a recommendation card');
            }
            console.log('[Frontend] [RECOMMENDATION_CLICK] ===== END RECOMMENDATION CLICK =====');
        };

        spacerRow.addEventListener('click', clickHandler);
        
        // Mark the handler for potential removal later
        clickHandler.className = 'recommendation-click-handler';
    }

    scrollToHall(hallId) {
        console.log('[Frontend] [SCROLL_TO_HALL] ===== ATTEMPTING TO SCROLL TO HALL =====');
        console.log('[Frontend] [SCROLL_TO_HALL] Target hall ID:', hallId);
        console.log('[Frontend] [SCROLL_TO_HALL] Target hall ID type:', typeof hallId);
        
        // Find the target dining hall card
        let hallCard = document.querySelector(`[data-hall-id="${hallId}"]`);
        console.log('[Frontend] [SCROLL_TO_HALL] Dining hall card found:', !!hallCard);
        
        if (hallCard) {
            console.log('[Frontend] [SCROLL_TO_HALL] Hall card details:');
            console.log('[Frontend] [SCROLL_TO_HALL] - Card classes:', hallCard.className);
            console.log('[Frontend] [SCROLL_TO_HALL] - Card dataset hall ID:', hallCard.dataset.hallId);
            console.log('[Frontend] [SCROLL_TO_HALL] - Is recommendation card:', hallCard.classList.contains('recommendation-card'));
            console.log('[Frontend] [SCROLL_TO_HALL] - Card position in viewport:', hallCard.getBoundingClientRect());
            
            // Check if this is a recommendation card (we want to scroll to the actual dining hall, not the recommendation)
            if (hallCard.classList.contains('recommendation-card')) {
                console.log('[Frontend] [SCROLL_TO_HALL] Found recommendation card, looking for actual dining hall card');
                
                // Find all cards with the same hall ID
                const allCards = document.querySelectorAll(`[data-hall-id="${hallId}"]`);
                console.log('[Frontend] [SCROLL_TO_HALL] All cards with hall ID:', allCards.length);
                
                let actualHallCard = null;
                allCards.forEach((card, index) => {
                    const isRecommendation = card.classList.contains('recommendation-card');
                    console.log(`[Frontend] [SCROLL_TO_HALL] Card ${index + 1}: is recommendation = ${isRecommendation}`);
                    if (!isRecommendation) {
                        actualHallCard = card;
                    }
                });
                
                if (actualHallCard) {
                    console.log('[Frontend] [SCROLL_TO_HALL] Found actual dining hall card, using it for scroll');
                    hallCard = actualHallCard;
                } else {
                    console.error('[Frontend] [SCROLL_TO_HALL] Could not find actual dining hall card, using recommendation card');
                }
            } else {
                console.log('[Frontend] [SCROLL_TO_HALL] Found actual dining hall card directly');
            }
            
            // Perform the scroll
            console.log('[Frontend] [SCROLL_TO_HALL] Scrolling to hall card...');
            console.log('[Frontend] [SCROLL_TO_HALL] Scroll target position:', hallCard.getBoundingClientRect());
            
            hallCard.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
            
            // Add a brief highlight effect
            console.log('[Frontend] [SCROLL_TO_HALL] Adding highlight effect...');
            const originalBorderColor = hallCard.style.borderColor || 'transparent';
            const originalBorderWidth = hallCard.style.borderWidth || '2px';
            
            hallCard.style.borderColor = '#667eea';
            hallCard.style.borderWidth = '3px';
            
            setTimeout(() => {
                console.log('[Frontend] [SCROLL_TO_HALL] Removing highlight effect...');
                hallCard.style.borderColor = originalBorderColor;
                hallCard.style.borderWidth = originalBorderWidth;
            }, 2000);
            
            console.log('[Frontend] [SCROLL_TO_HALL] Scroll and highlight complete');
        } else {
            console.error('[Frontend] [SCROLL_TO_HALL] Could not find dining hall card for ID:', hallId);
            
            // Debug: List all available hall IDs
            const allHallCards = document.querySelectorAll('[data-hall-id]');
            console.log('[Frontend] [SCROLL_TO_HALL] Available hall IDs in DOM:');
            allHallCards.forEach((card, index) => {
                console.log(`[Frontend] [SCROLL_TO_HALL] ${index + 1}. ID: "${card.dataset.hallId}" (type: ${typeof card.dataset.hallId}), classes: ${card.className}`);
            });
        }
        
        console.log('[Frontend] [SCROLL_TO_HALL] ===== END SCROLL TO HALL =====');
    }

    hasMenuContent(hall) {
        return hall.menus && Object.keys(hall.menus).length > 0;
    }

    createDiningHallCard(hall, index, isClosed = false) {
        console.log(`[CARD_CREATION_DEBUG] Creating card for ${hall.name}, index=${index}, isClosed=${isClosed}`);
        const card = document.createElement('div');
        card.className = `dining-hall-card ${isClosed ? 'closed-hall' : ''}`;
        card.dataset.index = index;
        card.dataset.hallId = hall.id;

        // Use time-filtered hearts instead of all hearts
        const visibleHearts = this.getVisibleHearts();
        const isHallLiked = this.user && visibleHearts.includes(hall.id);
        
        // Determine if dining hall is open or closed
        // When time filtering is active (selectedTime is set), use time-specific logic
        console.log(`[CARD_CREATION_DEBUG] About to check isOpen for ${hall.name}`);
        const isOpen = this.isDiningHallOpenAtTime(hall);
        console.log(`[CARD_CREATION_DEBUG] isOpen result for ${hall.name}: ${isOpen}`);
        const statusClass = isOpen ? 'open' : 'closed';
        
        let statusText = 'Closed';
        console.log(`[STATUS_DEBUG] ${hall.name}: isOpen=${isOpen}`);
        if (isOpen) {
            console.log(`[STATUS_DEBUG] ${hall.name}: Hall is open, getting end time...`);
            const endTime = this.getDiningHallEndTime(hall);
            console.log(`[STATUS_DEBUG] ${hall.name}: endTime=${endTime}`);
            if (endTime) {
                statusText = `Open until ${endTime}`;
            } else {
                statusText = 'Open';
            }
        } else {
            console.log(`[STATUS_DEBUG] ${hall.name}: Hall is closed, getting next open time...`);
            const nextOpenTime = this.getDiningHallNextOpenTime(hall);
            console.log(`[STATUS_DEBUG] ${hall.name}: nextOpenTime=${nextOpenTime}`);
            if (nextOpenTime) {
                statusText = `Closed until ${nextOpenTime}`;
            } else {
                statusText = 'Closed';
            }
        }
        console.log(`[STATUS_DEBUG] ${hall.name}: Final statusText="${statusText}"`);
        

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

        // Add double-click handler for smart hearting using custom double-click detection
        card.addEventListener('click', (e) => {
            // Only handle double-click logic if clicking on the card itself, not on hearts or other elements
            if (e.target.closest('.heart-icon') || e.target.closest('.menu-item-heart')) {
                return; // Let the heart-specific handlers deal with this
            }
            
            const cardId = `card-${hall.id}`;
            this.handleCardDoubleClick(e, cardId, () => {
                console.log('[Frontend] [DOUBLE_CLICK] Card double-click detected for hall:', hall.id);
                this.handleSmartDoubleClick(e, card, hall);
            });
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

        // Add double-click handlers for menu items themselves using custom double-click detection
        const menuItems = card.querySelectorAll('.menu-item');
        menuItems.forEach((menuItem, index) => {
            menuItem.addEventListener('click', (e) => {
                // Only handle double-click if not clicking on the heart icon specifically
                if (e.target.closest('.menu-item-heart')) {
                    return; // Let the heart-specific handler deal with this
                }
                
                const menuItemId = `menu-${hall.id}-${index}`;
                this.handleCardDoubleClick(e, menuItemId, () => {
                    console.log('[Frontend] [DOUBLE_CLICK] Menu item double-click detected for item:', menuItem.dataset.itemId);
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleMenuItemHeart(e, menuItem);
                });
            });
        });

        return card;
    }

    // STANDARDIZED method to check if dining hall is open
    // This is the ONLY method that should be used throughout the app
    isDiningHallOpenAtTime(hall, checkTime = null) {
        const caller = checkTime ? 'RECOMMENDATION' : 'MAIN_CARD';
        console.log(`[Frontend] [${caller}] ===== CHECKING OPEN STATUS =====`);
        console.log(`[Frontend] [${caller}] Hall:`, hall?.name || 'unknown');
        console.log(`[Frontend] [${caller}] Check time provided:`, !!checkTime);
        console.log(`[Frontend] [${caller}] Selected date:`, this.selectedDate);
        console.log(`[Frontend] [${caller}] Selected time:`, this.selectedTime);
        
        // Check if the dining hall is open at the specified time
        if (!hall || !hall.operatingHours || !Array.isArray(hall.operatingHours)) {
            console.log(`[Frontend] [${caller}] RESULT: FALSE - No operating hours`);
            console.log(`[Frontend] [${caller}] - Hall exists:`, !!hall);
            console.log(`[Frontend] [${caller}] - Operating hours exists:`, !!hall?.operatingHours);
            console.log(`[Frontend] [${caller}] - Is array:`, Array.isArray(hall?.operatingHours));
            return false;
        }
        
        // Look for selected date's schedule
        const selectedDateSchedule = hall.operatingHours.find(schedule => schedule.date === this.selectedDate);
        
        if (!selectedDateSchedule || !selectedDateSchedule.events) {
            console.log(`[Frontend] [${caller}] RESULT: FALSE - No schedule for selected date`);
            console.log(`[Frontend] [${caller}] - Schedule found:`, !!selectedDateSchedule);
            console.log(`[Frontend] [${caller}] - Events exist:`, !!selectedDateSchedule?.events);
            console.log(`[Frontend] [${caller}] - Available dates:`, hall.operatingHours.map(s => s.date));
            return false;
        }
        
        console.log(`[Frontend] [${caller}] Found schedule for ${this.selectedDate}:`, selectedDateSchedule);
        console.log(`[Frontend] [${caller}] Events count:`, selectedDateSchedule.events.length);
        
        // Convert time to check to minutes for easier comparison
        let timeToCheck = this.selectedTime;
        
        if (checkTime) {
            // Use provided time (Date object) - ensure we're using EST timezone
            const estTimeString = checkTime.toLocaleString("en-US", {
                timeZone: "America/New_York",
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });
            timeToCheck = estTimeString;
            console.log(`[Frontend] [${caller}] Using provided EST time:`, timeToCheck);
        } else if (timeToCheck === 'now') {
            // For 'now', we should use the current EST time or stored server time
            if (this.serverTime) {
                const estTimeString = this.serverTime.toLocaleString("en-US", {
                    timeZone: "America/New_York",
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit'
                });
                timeToCheck = estTimeString;
                console.log(`[Frontend] [${caller}] Using stored server EST time for "now":`, timeToCheck);
            } else {
                const now = new Date();
                const estTimeString = now.toLocaleString("en-US", {
                    timeZone: "America/New_York",
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit'
                });
                timeToCheck = estTimeString;
                console.log(`[Frontend] [${caller}] Using current EST time for "now":`, timeToCheck);
            }
        } else {
            console.log(`[Frontend] [${caller}] Using selected time:`, timeToCheck);
        }
        
        const selectedMinutes = this.timeToMinutes(timeToCheck);
        console.log(`[Frontend] [${caller}] Time in minutes:`, selectedMinutes);
        
        // Check if any event contains the specified time
        const isOpen = selectedDateSchedule.events.some((event, eventIndex) => {
            console.log(`[Frontend] [${caller}] Checking event ${eventIndex + 1}:`, event);
            
            if (!event.start || !event.end) {
                console.log(`[Frontend] [${caller}] Event ${eventIndex + 1}: SKIP - Missing start/end times`);
                return false;
            }
            
            // Parse event times (format like "8:00am" or "11:00pm")
            const eventStartMinutes = this.parseEventTime(event.start);
            const eventEndMinutes = this.parseEventTime(event.end);
            
            if (eventStartMinutes === null || eventEndMinutes === null) {
                console.log(`[Frontend] [${caller}] Event ${eventIndex + 1}: SKIP - Could not parse times`);
                console.log(`[Frontend] [${caller}] - Start: "${event.start}" -> ${eventStartMinutes}`);
                console.log(`[Frontend] [${caller}] - End: "${event.end}" -> ${eventEndMinutes}`);
                return false;
            }
            
            console.log(`[Frontend] [${caller}] Event ${eventIndex + 1} parsed times:`);
            console.log(`[Frontend] [${caller}] - Start: "${event.start}" -> ${eventStartMinutes} minutes`);
            console.log(`[Frontend] [${caller}] - End: "${event.end}" -> ${eventEndMinutes} minutes`);
            console.log(`[Frontend] [${caller}] - Check time: "${timeToCheck}" -> ${selectedMinutes} minutes`);
            
            // Handle times that span across midnight (e.g., 8:00am to 2:00am next day)
            if (eventEndMinutes < eventStartMinutes) {
                // Time spans across midnight
                const isInRange = selectedMinutes >= eventStartMinutes || selectedMinutes <= eventEndMinutes;
                console.log(`[Frontend] [${caller}] Event ${eventIndex + 1}: MIDNIGHT-SPANNING - In range: ${isInRange}`);
                console.log(`[Frontend] [${caller}] - Logic: ${selectedMinutes} >= ${eventStartMinutes} OR ${selectedMinutes} <= ${eventEndMinutes}`);
                console.log(`[Frontend] [${caller}] - Result: ${selectedMinutes >= eventStartMinutes} OR ${selectedMinutes <= eventEndMinutes} = ${isInRange}`);
                return isInRange;
            } else {
                // Normal time range (no midnight crossing)
                const isInRange = selectedMinutes >= eventStartMinutes && selectedMinutes <= eventEndMinutes;
                console.log(`[Frontend] [${caller}] Event ${eventIndex + 1}: NORMAL - In range: ${isInRange}`);
                console.log(`[Frontend] [${caller}] - Logic: ${selectedMinutes} >= ${eventStartMinutes} AND ${selectedMinutes} <= ${eventEndMinutes}`);
                console.log(`[Frontend] [${caller}] - Result: ${selectedMinutes >= eventStartMinutes} AND ${selectedMinutes <= eventEndMinutes} = ${isInRange}`);
                return isInRange;
            }
        });
        
        console.log(`[Frontend] [${caller}] FINAL RESULT for ${hall.name}: ${isOpen}`);
        console.log(`[Frontend] [${caller}] ===== END OPEN STATUS CHECK =====`);
        return isOpen;
    }

    // DEPRECATED - DO NOT USE - kept for backward compatibility only
    // Use isDiningHallOpenAtTime instead
    isDiningHallOpen(hall) {
        return this.isDiningHallOpenAtTime(hall);
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
        console.log(`[END_TIME_DEBUG] Getting end time for ${hall.name}`);
        if (!hall.operatingHours || !Array.isArray(hall.operatingHours)) {
            console.log(`[END_TIME_DEBUG] ${hall.name}: No operating hours`);
            return null;
        }
        
        // Look for selected date's schedule
        const selectedDateSchedule = hall.operatingHours.find(schedule => schedule.date === this.selectedDate);
        console.log(`[END_TIME_DEBUG] ${hall.name}: selectedDate=${this.selectedDate}, schedule found=${!!selectedDateSchedule}`);
        
        if (!selectedDateSchedule || !selectedDateSchedule.events) {
            console.log(`[END_TIME_DEBUG] ${hall.name}: No schedule or events for selected date`);
            return null;
        }
        
        // Convert selected time to minutes for easier comparison
        const currentTime = this.getCurrentViewingTime();
        const selectedMinutes = this.timeToMinutes(currentTime);
        console.log(`[END_TIME_DEBUG] ${hall.name}: selectedTime=${this.selectedTime}, currentTime=${currentTime}, selectedMinutes=${selectedMinutes}`);
        
        
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

    getDiningHallNextOpenTime(hall) {
        // Get the next opening time for a closed dining hall
        console.log(`[NEXT_OPEN_DEBUG] Getting next open time for ${hall.name}`);
        if (!hall.operatingHours || !Array.isArray(hall.operatingHours)) {
            console.log(`[NEXT_OPEN_DEBUG] ${hall.name}: No operating hours`);
            return null;
        }
        
        // Look for selected date's schedule
        const selectedDateSchedule = hall.operatingHours.find(schedule => schedule.date === this.selectedDate);
        console.log(`[NEXT_OPEN_DEBUG] ${hall.name}: selectedDate=${this.selectedDate}, schedule found=${!!selectedDateSchedule}`);
        
        if (!selectedDateSchedule || !selectedDateSchedule.events) {
            console.log(`[NEXT_OPEN_DEBUG] ${hall.name}: No schedule or events for selected date`);
            return null;
        }
        
        // Convert selected time to minutes for easier comparison
        let timeToCheck = this.getCurrentViewingTime();
        console.log(`[NEXT_OPEN_DEBUG] ${hall.name}: timeToCheck=${timeToCheck}`);
        
        const selectedMinutes = this.timeToMinutes(timeToCheck);
        
        // Find the next event that starts after the current time
        const futureEvents = selectedDateSchedule.events.filter(event => {
            if (!event.start || !event.end) return false;
            
            const eventStartMinutes = this.parseEventTime(event.start);
            if (eventStartMinutes === null) return false;
            
            return eventStartMinutes > selectedMinutes;
        });
        
        // Sort by start time and get the earliest one
        futureEvents.sort((a, b) => {
            const aStart = this.parseEventTime(a.start);
            const bStart = this.parseEventTime(b.start);
            return aStart - bStart;
        });
        
        return futureEvents.length > 0 ? futureEvents[0].start : null;
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

    // Custom double-click detection to handle timing conflicts
    handleCardDoubleClick(e, elementId, doubleClickCallback) {
        const now = Date.now();
        const lastClick = this.clickTimers.get(elementId);
        
        if (lastClick && (now - lastClick < this.DOUBLE_CLICK_DELAY)) {
            // This is a double-click
            console.log('[Frontend] [DOUBLE_CLICK] Double-click detected for element:', elementId);
            this.clickTimers.delete(elementId); // Clear the timer
            e.preventDefault();
            e.stopPropagation();
            doubleClickCallback();
        } else {
            // This is a single click - store the timestamp
            this.clickTimers.set(elementId, now);
            
            // Clear the timer after the double-click delay
            setTimeout(() => {
                if (this.clickTimers.get(elementId) === now) {
                    // This was indeed a single click (no double-click followed)
                    this.clickTimers.delete(elementId);
                    console.log('[Frontend] [DOUBLE_CLICK] Single click confirmed for element:', elementId);
                }
            }, this.DOUBLE_CLICK_DELAY);
        }
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
        console.log('[Frontend] [DOUBLE_CLICK] handleSmartDoubleClick called!', e.target);
        e.stopPropagation();
        
        if (!this.user) {
            console.log('[Frontend] [DOUBLE_CLICK] No user, showing auth modal');
            this.showAuthModal();
            return;
        }

        // Check if the double-click target is a menu item or within a menu item
        const menuItem = e.target.closest('.menu-item');
        
        if (menuItem) {
            console.log('[Frontend] [DOUBLE_CLICK] Double-clicked on menu item, hearting item');
            // Double-clicked on a menu item - heart the menu item
            await this.handleMenuItemHeart(e, menuItem);
        } else {
            console.log('[Frontend] [DOUBLE_CLICK] Double-clicked on dining hall, hearting hall');
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
        
        // Prevent multiple simultaneous requests for the same menu item
        const requestKey = `menu-item-${itemId}`;
        if (this.pendingHeartRequests.has(requestKey)) {
            console.log(`[Frontend] [DEBOUNCE] Ignoring duplicate heart request for menu item ${itemId}`);
            return;
        }
        
        this.pendingHeartRequests.add(requestKey);
        
        const heartIcon = menuItem.querySelector('.menu-item-heart');
        const heartImage = heartIcon.querySelector('.heart-image-small');
        const isLiked = heartIcon.classList.contains('liked');

        // Get the dining hall ID from the card
        const diningHallCard = menuItem.closest('.dining-hall-card');
        const diningHallId = diningHallCard ? diningHallCard.dataset.hallId : 'unknown';

        console.log(`[Frontend] Toggling menu item heart for item ${itemId} at dining hall ${diningHallId}, currently ${isLiked ? 'liked' : 'not liked'}`);

        try {
            const response = await fetch('/api/hearts/menu-item', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.user.userId,
                    menuItemId: itemId,
                    diningHallId: diningHallId,
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

                // Update local state - sync with backend response
                if (result.isLiked) {
                    if (!this.userHearts.menuItems.includes(itemId)) {
                        this.userHearts.menuItems.push(itemId);
                    }
                } else {
                    this.userHearts.menuItems = this.userHearts.menuItems.filter(id => id !== itemId);
                }
                
                console.log(`[Frontend] Menu item heart ${result.isLiked ? 'added' : 'removed'}`);
                
                // Refresh recommendations immediately after hearting
                console.log('[Frontend] Refreshing recommendations after menu item heart change');
                await this.loadRecommendations();
                
                // Refresh user hearts state to ensure consistency
                await this.loadUserHearts();
                
                // Re-render only the recommendations section to avoid closing menus
                const spacerRow = document.querySelector('.dining-hall-spacer');
                if (spacerRow) {
                    spacerRow.innerHTML = this.createRecommendationContent();
                    this.bindRecommendationClickEvents();
                }
                
                // Refresh hearts modal if it's currently open
                this.refreshHeartsModalIfOpen();
            }
        } catch (error) {
            console.error('Error toggling menu item heart:', error);
        } finally {
            // Always remove the request lock
            this.pendingHeartRequests.delete(requestKey);
        }
    }

    async toggleDiningHallHeart(hallId, card) {
        // Prevent multiple simultaneous requests for the same dining hall
        const requestKey = `dining-hall-${hallId}`;
        if (this.pendingHeartRequests.has(requestKey)) {
            console.log(`[Frontend] [DEBOUNCE] Ignoring duplicate heart request for dining hall ${hallId}`);
            return;
        }
        
        this.pendingHeartRequests.add(requestKey);
        
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

                // Update local state - sync with backend response
                if (result.isLiked) {
                    if (!this.userHearts.diningHalls.includes(hallId)) {
                        this.userHearts.diningHalls.push(hallId);
                    }
                } else {
                    this.userHearts.diningHalls = this.userHearts.diningHalls.filter(id => id !== hallId);
                }
                
                console.log(`[Frontend] Dining hall heart ${result.isLiked ? 'added' : 'removed'}`);
                
                // Refresh recommendations immediately after hearting
                console.log('[Frontend] Refreshing recommendations after dining hall heart change');
                await this.loadRecommendations();
                
                // Refresh user hearts state to ensure consistency
                await this.loadUserHearts();
                
                // Re-render only the recommendations section to avoid closing menus
                const spacerRow = document.querySelector('.dining-hall-spacer');
                if (spacerRow) {
                    spacerRow.innerHTML = this.createRecommendationContent();
                    this.bindRecommendationClickEvents();
                }
                
                // Refresh hearts modal if it's currently open
                this.refreshHeartsModalIfOpen();
            }
        } catch (error) {
            console.error('Error toggling dining hall heart:', error);
        } finally {
            // Always remove the request lock
            this.pendingHeartRequests.delete(requestKey);
        }
    }

    showAuthModal() {
        document.getElementById('authModal').classList.remove('hidden');
    }

    // Hearts Management Methods
    async showHeartsModal() {
        console.log('[Frontend] [HEARTS] Showing hearts modal');
        
        if (!this.user) {
            this.showAuthModal();
            return;
        }
        
        // Show the modal
        document.getElementById('heartsModal').classList.remove('hidden');
        
        // Load hearts data
        await this.loadHeartsData();
    }

    async loadHeartsData() {
        console.log('[Frontend] [HEARTS] Loading hearts data');
        
        try {
            // Get both daily and saved favorites from backend
            const [dailyResponse, knnResponse] = await Promise.all([
                fetch(`/api/hearts/daily/${this.user.userId}`),
                fetch(`/api/hearts/knn/${this.user.userId}`)
            ]);

            const dailyHearts = await dailyResponse.json();
            const knnHearts = await knnResponse.json();

            console.log('[Frontend] [HEARTS] Daily hearts:', dailyHearts);
            console.log('[Frontend] [HEARTS] Saved favorites:', knnHearts);

            // Update stats
            this.updateHeartsStats(dailyHearts, knnHearts);
            
            // Populate tabs
            this.populateDailyHearts(dailyHearts);
            this.populateKNNHearts(knnHearts);
            
        } catch (error) {
            console.error('[Frontend] [HEARTS] Error loading hearts data:', error);
        }
    }

    async refreshHeartsModalIfOpen() {
        // Check if hearts modal is currently visible and refresh it
        const heartsModal = document.getElementById('heartsModal');
        if (heartsModal && !heartsModal.classList.contains('hidden')) {
            console.log('[Frontend] [HEARTS] Refreshing hearts modal since it is currently open');
            await this.loadHeartsData();
        }
    }

    updateHeartsStats(dailyHearts, knnHearts) {
        const dailyCount = (dailyHearts.diningHallHearts || []).length + (dailyHearts.menuItemHearts || []).length;
        const knnCount = (knnHearts.diningHallHearts || []).length + (knnHearts.menuItemHearts || []).length;
        const totalCount = dailyCount + knnCount;

        document.getElementById('dailyHeartsCount').textContent = dailyCount;
        document.getElementById('knnHeartsCount').textContent = knnCount;
        document.getElementById('totalHeartsCount').textContent = totalCount;
    }

    populateDailyHearts(dailyHearts) {
        const container = document.getElementById('dailyHeartsList');
        container.innerHTML = '';

        const allHearts = [
            ...(dailyHearts.diningHallHearts || []).map(heart => ({...heart, type: 'dining-hall'})),
            ...(dailyHearts.menuItemHearts || []).map(heart => ({...heart, type: 'menu-item'}))
        ];

        if (allHearts.length === 0) {
            container.innerHTML = `
                <div class="hearts-empty">
                    <div class="hearts-empty-icon">💔</div>
                    <p>No hearts today</p>
                    <small>Like some dining halls or menu items to see them here!</small>
                </div>
            `;
            return;
        }

        // Sort by timestamp (newest first)
        allHearts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        allHearts.forEach(heart => {
            const heartElement = this.createHeartElement(heart, 'daily');
            container.appendChild(heartElement);
        });
    }

    populateKNNHearts(knnHearts) {
        const container = document.getElementById('knnHeartsList');
        container.innerHTML = '';

        const allHearts = [
            ...(knnHearts.diningHallHearts || []).map(heart => ({...heart, type: 'dining-hall'})),
            ...(knnHearts.menuItemHearts || []).map(heart => ({...heart, type: 'menu-item'}))
        ];

        if (allHearts.length === 0) {
            container.innerHTML = `
                <div class="hearts-empty">
                    <div class="hearts-empty-icon">🧠</div>
                    <p>No historical hearts</p>
                    <small>Hearts from previous days will appear here</small>
                </div>
            `;
            return;
        }

        // Sort by timestamp (newest first)
        allHearts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        allHearts.forEach(heart => {
            const heartElement = this.createHeartElement(heart, 'knn');
            container.appendChild(heartElement);
        });
    }

    createHeartElement(heart, storage) {
        const heartDiv = document.createElement('div');
        heartDiv.className = 'heart-item';
        
        const date = new Date(heart.timestamp);
        const dateStr = date.toLocaleDateString();
        const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });

        // Find dining hall name if this is a menu item
        let displayName = heart.name || 'Unknown';
        let hallName = '';
        
        if (heart.type === 'menu-item' && heart.diningHallId) {
            const hall = this.diningHalls.find(h => h.id === heart.diningHallId);
            hallName = hall ? hall.name : 'Unknown Hall';
        }

        heartDiv.innerHTML = `
            <div class="heart-item-info">
                <div class="heart-item-name">${displayName}</div>
                <div class="heart-item-details">
                    <span class="heart-item-type">${heart.type === 'dining-hall' ? '🏢 Dining Hall' : '🍽️ Menu Item'}</span>
                    ${hallName ? `<span class="heart-item-hall">at ${hallName}</span>` : ''}
                    <div class="heart-item-date">${dayName}, ${dateStr} at ${timeStr}</div>
                </div>
            </div>
            <div class="heart-item-actions">
                <button class="heart-remove-btn" data-heart-id="${heart.id || heart.diningHallId || heart.menuItemId}" data-storage="${storage}" data-type="${heart.type}">
                    Remove ❤️
                </button>
            </div>
        `;

        // Add remove event listener
        const removeBtn = heartDiv.querySelector('.heart-remove-btn');
        removeBtn.addEventListener('click', () => {
            this.removeHeart(heart, storage);
        });

        return heartDiv;
    }

    async removeHeart(heart, storage) {
        console.log('[Frontend] [HEARTS] Removing heart:', heart, 'from', storage);
        
        try {
            const endpoint = storage === 'daily' ? 'daily' : 'knn';
            const heartType = heart.type === 'dining-hall' ? 'dining-hall' : 'menu-item';
            const heartId = heart.id || heart.diningHallId || heart.menuItemId;
            
            const response = await fetch(`/api/hearts/${endpoint}/${this.user.userId}/${heartType}/${heartId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                console.log('[Frontend] [HEARTS] Heart removed successfully');
                
                // Reload hearts manager data
                await this.loadHeartsData();
                
                // Reload main UI heart data to update heart states
                await this.loadUserHearts();
                
                // Refresh the main UI to reflect the changes
                this.renderDiningHalls();
                
                console.log('[Frontend] [HEARTS] Main UI updated after heart removal');
            } else {
                console.error('[Frontend] [HEARTS] Failed to remove heart');
            }
        } catch (error) {
            console.error('[Frontend] [HEARTS] Error removing heart:', error);
        }
    }

    switchHeartsTab(tabName) {
        console.log('[Frontend] [HEARTS] Switching to tab:', tabName);
        
        // Update tab buttons
        document.querySelectorAll('.hearts-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.hearts-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}HeartsTab`);
        });
    }

    // Chatbot functionality
    initializeChatbot() {
        const chatbotToggle = document.getElementById('chatbot-toggle');
        const chatbotWindow = document.getElementById('chatbot-window');
        const chatbotClose = document.getElementById('chatbot-close');
        const chatbotInput = document.getElementById('chatbot-input');
        const chatbotSend = document.getElementById('chatbot-send');
        const messagesContainer = document.getElementById('chatbot-messages');

        // Toggle chatbot window
        chatbotToggle.addEventListener('click', () => {
            chatbotWindow.classList.toggle('active');
            if (chatbotWindow.classList.contains('active')) {
                chatbotInput.focus();
            }
        });

        // Close chatbot
        chatbotClose.addEventListener('click', () => {
            chatbotWindow.classList.remove('active');
        });

        // Send message on button click
        chatbotSend.addEventListener('click', () => {
            this.sendChatMessage();
        });

        // Send message on Enter key
        chatbotInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendChatMessage();
            }
        });
    }

    async sendChatMessage() {
        const input = document.getElementById('chatbot-input');
        const messagesContainer = document.getElementById('chatbot-messages');
        const sendButton = document.getElementById('chatbot-send');
        
        const message = input.value.trim();
        if (!message) return;

        // Clear input and disable send button
        input.value = '';
        sendButton.disabled = true;

        // Add user message to chat
        this.addChatMessage(message, 'user');

        // Show typing indicator
        const typingMessage = this.addChatMessage('Thinking...', 'bot', true);

        try {            
            // Prepare dining data for context
            const diningData = this.diningHalls.map(hall => {
                const isOpen = this.isDiningHallOpenAtTime(hall);
                console.log(`[Frontend] [CHATBOT] Hall ${hall.name}: isOpen = ${isOpen}`);
                console.log(`[Frontend] [CHATBOT] Hall ${hall.name}: id = ${hall.id}, operatingHours length = ${hall.operatingHours?.length || 0}`);
                return {
                    id: hall.id,
                    name: hall.name,
                    isOpen: isOpen,
                    description: hall.description || '',
                    operatingHours: hall.operatingHours,
                    campusArea: hall.campusArea,
                    hours: hall.hours,
                    menus: hall.menus,
                };
            });

            console.log(`[Frontend] [CHATBOT] Sending ${diningData.length} dining halls to chatbot`);
            const openHalls = diningData.filter(h => h.isOpen);
            console.log(`[Frontend] [CHATBOT] ${openHalls.length} halls are open: ${openHalls.map(h => h.name).join(', ')}`);

            const response = await fetch('/api/chatbot', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    selectedDate: this.selectedDate,
                    selectedTime: this.selectedTime,
                    diningData: diningData
                })
            });

            const data = await response.json();

            // Remove typing indicator
            messagesContainer.removeChild(typingMessage);

            if (response.ok) {
                this.addChatMessage(data.reply, 'bot');
            } else {
                this.addChatMessage('Sorry, I encountered an error. Please try again.', 'bot');
            }
        } catch (error) {
            console.error('Chatbot error:', error);
            // Remove typing indicator
            if (typingMessage && typingMessage.parentNode) {
                messagesContainer.removeChild(typingMessage);
            }
            this.addChatMessage('Sorry, I\'m having trouble connecting. Please try again later.', 'bot');
        } finally {
            sendButton.disabled = false;
            input.focus();
        }
    }

    addChatMessage(content, sender, isTyping = false) {
        const messagesContainer = document.getElementById('chatbot-messages');
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message${isTyping ? ' typing' : ''}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;
        
        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        return messageDiv;
    }

}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.eateries = new CornellDiningApp();
});