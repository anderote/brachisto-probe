/** Main application entry point */
class App {
    constructor() {
        this.sceneManager = null;
        this.solarSystem = null;
        this.probeViz = null;
        this.dysonViz = null;
        this.resourceDisplay = null;
        this.purchasePanel = null;
        this.researchPanel = null;
        this.scriptingWindow = null;
        this.leaderboard = null;
        this.isAuthenticated = false;
        this.currentUser = null;
        this.init();
    }

    async init() {
        try {
            console.log('Initializing app...');
            
            // Initialize sidebar first
            try {
                // Sidebar is initialized automatically via DOMContentLoaded
                // Wait a moment for it to be ready
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (e) {
                console.error('Failed to initialize Sidebar:', e);
            }

            // Initialize compact resource display
            try {
                this.resourceDisplay = new ResourceDisplay('compact-resources', true);
            } catch (e) {
                console.error('Failed to initialize ResourceDisplay:', e);
            }

            // Metrics panel merged into probe summary panel - hide the metrics panel container
            try {
                const metricsContainer = document.getElementById('metrics-panel');
                if (metricsContainer) {
                    metricsContainer.style.display = 'none';
                }
            } catch (e) {
                console.error('Failed to hide MetricsPanel:', e);
            }

            // Initialize probe summary panel
            try {
                this.probeSummaryPanel = typeof ProbeSummaryPanel !== 'undefined' ? 
                    new ProbeSummaryPanel('probe-summary-panel') : null;
            } catch (e) {
                console.error('Failed to initialize ProbeSummaryPanel:', e);
            }
            
            try {
                this.zoneInfoPanel = typeof ZoneInfoPanel !== 'undefined' ? 
                    new ZoneInfoPanel('zone-info-panel') : null;
                if (this.zoneInfoPanel) {
                    window.zoneInfoPanel = this.zoneInfoPanel;
                }
            } catch (e) {
                console.error('Failed to initialize ZoneInfoPanel:', e);
            }
            
            // Initialize Three.js visualization first (needed for starfield)
            try {
                const canvas = document.getElementById('game-canvas');
                if (canvas && typeof SceneManager !== 'undefined') {
                    this.sceneManager = new SceneManager(canvas);
                    this.sceneManager.init();

                    // Initialize starfield
                    if (typeof Starfield !== 'undefined') {
                        this.starfield = new Starfield(this.sceneManager.getScene());
                    }

                    if (typeof SolarSystem !== 'undefined') {
                        this.solarSystem = new SolarSystem(this.sceneManager.getScene());
                        // Set solar system reference in scene manager for comet tracking
                        this.sceneManager.setSolarSystem(this.solarSystem);
                    }
                    if (typeof StructuresVisualization !== 'undefined') {
                        this.structuresViz = new StructuresVisualization(this.sceneManager.getScene(), this.solarSystem);
                    }
                    // Note: probeViz and dysonViz need solarSystem for scaling, but it may not be ready yet
                    // They will handle the null case with fallback scaling
                    // Probe visualization removed - focusing on mechanics first
                    // if (typeof ProbeVisualization !== 'undefined') {
                    //     // Pass solarSystem reference for orbit scaling (may be null initially)
                    //     this.probeViz = new ProbeVisualization(this.sceneManager.getScene(), this.solarSystem);
                    // }
                    if (typeof DysonSphereVisualization !== 'undefined') {
                        // Pass solarSystem reference for orbit scaling (may be null initially)
                        this.dysonViz = new DysonSphereVisualization(this.sceneManager.getScene(), this.solarSystem);
                    }
                    if (typeof TransferVisualization !== 'undefined') {
                        // Pass solarSystem reference for orbit scaling (may be null initially)
                        this.transferViz = new TransferVisualization(this.sceneManager.getScene(), this.solarSystem);
                    }
                }
            } catch (e) {
                console.error('Failed to initialize visualization:', e);
            }
            
            // Initialize UI components with new right panel tab containers
            try {
                const structuresTab = sidebar ? sidebar.getTabContainer('structures') : document.getElementById('right-tab-structures');
                if (structuresTab) {
                    let purchasePanelContent = document.getElementById('purchase-panel-content');
                    if (!purchasePanelContent) {
                        structuresTab.innerHTML = '<div id="purchase-panel-content"></div>';
                        purchasePanelContent = document.getElementById('purchase-panel-content');
                    }
                    this.purchasePanel = new PurchasePanel('purchase-panel-content');
                    // Expose globally for onclick handlers
                    window.purchasePanel = this.purchasePanel;
                }
            } catch (e) {
                console.error('Failed to initialize PurchasePanel:', e);
            }
            
            try {
                const researchTab = sidebar ? sidebar.getTabContainer('research') : document.getElementById('right-tab-research');
                if (researchTab) {
                    let researchPanelContent = document.getElementById('research-panel-content');
                    if (!researchPanelContent) {
                        researchTab.innerHTML = '<div id="research-panel-content"></div>';
                        researchPanelContent = document.getElementById('research-panel-content');
                    }
                    this.researchPanel = new ResearchPanel('research-panel-content');
                    // Expose globally for onclick handlers
                    window.researchPanel = this.researchPanel;
                }
            } catch (e) {
                console.error('Failed to initialize ResearchPanel:', e);
            }
            
            try {
                const probeTab = sidebar ? sidebar.getTabContainer('probe') : document.getElementById('tab-probe');
                if (probeTab) {
                    probeTab.innerHTML = '<div id="probe-panel-content"></div>';
                    this.probePanel = new ProbePanel('probe-panel-content');
                    // Expose globally
                    window.probePanel = this.probePanel;
                }
            } catch (e) {
                console.error('Failed to initialize ProbePanel:', e);
            }
            
            try {
                const manageTab = sidebar ? sidebar.getTabContainer('manage') : document.getElementById('tab-manage');
                if (manageTab) {
                    manageTab.innerHTML = '<div id="manage-panel-content"></div>';
                    this.managePanel = new ManagePanel('manage-panel-content');
                    // Expose globally
                    window.managePanel = this.managePanel;
                }
            } catch (e) {
                console.error('Failed to initialize ManagePanel:', e);
            }
            
            try {
                const commandContainer = document.getElementById('command-panel-content');
                if (commandContainer) {
                    this.commandPanel = typeof CommandPanel !== 'undefined' ? 
                        new CommandPanel('command-panel-content') : null;
                    // Make command panel accessible globally for zone selection
                    if (this.commandPanel) {
                        window.commandPanel = this.commandPanel;
                    }
                }
            } catch (e) {
                console.error('Failed to initialize CommandPanel:', e);
            }
            
            // Initialize performance panel
            try {
                this.performancePanel = typeof PerformancePanel !== 'undefined' ? 
                    new PerformancePanel('performance-panel') : null;
            } catch (e) {
                console.error('Failed to initialize PerformancePanel:', e);
            }
            
            // Initialize visual effects debug panel
            try {
                this.visualEffectsPanel = typeof VisualEffectsPanel !== 'undefined' ? 
                    new VisualEffectsPanel('visual-effects-panel') : null;
            } catch (e) {
                console.error('Failed to initialize VisualEffectsPanel:', e);
            }

            try {
                const productionTab = sidebar ? sidebar.getTabContainer('production') : document.getElementById('tab-production');
                if (productionTab) {
                    productionTab.innerHTML = '<div id="production-panel-content"></div>';
                    this.productionPanel = typeof ProductionPanel !== 'undefined' ? 
                        new ProductionPanel('production-panel-content') : null;
                }
            } catch (e) {
                console.error('Failed to initialize ProductionPanel:', e);
            }

            try {
                const transfersTab = sidebar ? sidebar.getTabContainer('transfers') : document.getElementById('right-tab-transfers');
                if (transfersTab) {
                    let transferPanelContent = document.getElementById('transfer-panel-content');
                    if (!transferPanelContent) {
                        transfersTab.innerHTML = '<div id="transfer-panel-content"></div>';
                        transferPanelContent = document.getElementById('transfer-panel-content');
                    }
                    this.transferPanel = typeof TransferPanel !== 'undefined' ? 
                        new TransferPanel('transfer-panel-content') : null;
                    // Expose globally for onclick handlers
                    window.transferPanel = this.transferPanel;
                }
            } catch (e) {
                console.error('Failed to initialize TransferPanel:', e);
            }
            
            try {
                this.scriptingWindow = typeof ScriptingWindow !== 'undefined' ? new ScriptingWindow() : null;
            } catch (e) {
                console.error('Failed to initialize ScriptingWindow:', e);
            }
            
            try {
                this.leaderboard = typeof Leaderboard !== 'undefined' ? new Leaderboard() : null;
            } catch (e) {
                console.error('Failed to initialize Leaderboard:', e);
            }
            
            try {
                this.orbitalZoneSelector = typeof OrbitalZoneSelector !== 'undefined' ? 
                    new OrbitalZoneSelector('orbital-zone-selector') : null;
                // Expose globally for access from other components
                if (this.orbitalZoneSelector) {
                    window.orbitalZoneSelector = this.orbitalZoneSelector;
                }
            } catch (e) {
                console.error('Failed to initialize OrbitalZoneSelector:', e);
            }

            try {
                this.timeControls = typeof TimeControls !== 'undefined' ? 
                    new TimeControls('time-controls') : null;
            } catch (e) {
                console.error('Failed to initialize TimeControls:', e);
            }
            
            // Energy display removed - now shown in top resource bar

            // Set up event listeners
            this.setupEventListeners();
            
            // Set up main menu button
            const mainMenuBtn = document.getElementById('main-menu-btn');
            if (mainMenuBtn) {
                mainMenuBtn.addEventListener('click', () => {
                    if (confirm('Return to main menu? Your current game will be saved automatically.')) {
                        this.returnToMenu();
                    }
                });
            }

            // Check authentication (skip for now)
            await this.checkAuth();

            // Start animation loop
            this.animate();
            
            // Start UI update loop (independent from worker messages)
            this.startUIUpdateLoop();
            
            console.log('App initialized successfully');
        } catch (error) {
            console.error('Failed to initialize app:', error);
            // Show error message to user
            document.body.innerHTML = `
                <div style="padding: 20px; color: white; background: #1a1a1a;">
                    <h1>Error Initializing Game</h1>
                    <p>${error.message}</p>
                    <p>Check the browser console for more details.</p>
                </div>
            `;
        }
    }

    setupEventListeners() {
        // Authentication
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        const showRegister = document.getElementById('show-register');
        const showLogin = document.getElementById('show-login');

        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.handleLogin());
        }
        if (registerBtn) {
            registerBtn.addEventListener('click', () => this.handleRegister());
        }
        if (showRegister) {
            showRegister.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('login-form').style.display = 'none';
                document.getElementById('register-form').style.display = 'block';
            });
        }
        if (showLogin) {
            showLogin.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('register-form').style.display = 'none';
                document.getElementById('login-form').style.display = 'block';
            });
        }

        // UI updates now handled by requestAnimationFrame loop (startUIUpdateLoop)
        // No event listeners - UI polls state at its own interval

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            const activeElement = document.activeElement;
            const isInputFocused = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';
            
            // Spacebar is now used for transfer workflow (handled in orbital_zone_selector.js)
            // Pause/Resume functionality removed from spacebar
            
            // Leaderboard: 'L' key
            if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey && !isInputFocused) {
                this.leaderboard.show();
            }
        });
    }

    async checkAuth() {
        // Skip authentication for now - show game menu
        this.isAuthenticated = true;
        this.hideAuthModal();
        
        // Small delay to ensure UI is ready, then show game menu
        setTimeout(() => {
            this.showGameMenu();
        }, 100);
    }
    
    async showGameMenu() {
        const menuModal = document.getElementById('game-menu-modal');
        const savedGamesList = document.getElementById('saved-games-list');
        const loadingScreen = document.getElementById('loading-screen');
        
        // Hide loading screen when showing menu
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        
        if (!menuModal) {
            // If menu doesn't exist, just start new game
            await this.startNewGame();
            return;
        }
        
        // Show menu
        menuModal.style.display = 'flex';
        
        // Load saved games
        try {
            if (typeof gameStorage !== 'undefined') {
                await gameStorage.init();
                const savedGames = await gameStorage.listSavedGames();
                
                if (savedGames.length === 0) {
                    savedGamesList.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">No saved games found</p>';
                } else {
                    savedGamesList.innerHTML = '';
                    savedGames.forEach(game => {
                        const gameItem = document.createElement('div');
                        gameItem.className = 'saved-game-item';
                        gameItem.style.cssText = 'padding: 15px; margin-bottom: 10px; background: rgba(74, 158, 255, 0.1); border: 1px solid rgba(74, 158, 255, 0.3); border-radius: 5px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;';
                        
                        const gameInfo = document.createElement('div');
                        const date = new Date(game.timestamp);
                        const timeStr = this.formatTime(game.time || 0);
                        gameInfo.innerHTML = `
                            <div style="font-weight: bold; color: #4a9eff; margin-bottom: 5px;">Game ${game.sessionId}</div>
                            <div style="font-size: 12px; color: #888;">Time: ${timeStr} | Saved: ${date.toLocaleString()}</div>
                        `;
                        
                        const loadBtn = document.createElement('button');
                        loadBtn.textContent = 'Load';
                        loadBtn.style.cssText = 'padding: 8px 16px; background: #4a9eff; color: white; border: none; border-radius: 3px; cursor: pointer;';
                        loadBtn.onclick = (e) => {
                            e.stopPropagation();
                            this.loadGame(game.sessionId);
                        };
                        
                        const deleteBtn = document.createElement('button');
                        deleteBtn.textContent = 'Delete';
                        deleteBtn.style.cssText = 'padding: 8px 16px; background: #ff4444; color: white; border: none; border-radius: 3px; cursor: pointer; margin-left: 10px;';
                        deleteBtn.onclick = async (e) => {
                            e.stopPropagation();
                            if (confirm('Are you sure you want to delete this saved game?')) {
                                try {
                                    await gameStorage.deleteGameState(game.sessionId);
                                    this.showGameMenu(); // Refresh the list
                                } catch (error) {
                                    alert('Failed to delete game: ' + error.message);
                                }
                            }
                        };
                        
                        gameItem.appendChild(gameInfo);
                        const buttonContainer = document.createElement('div');
                        buttonContainer.appendChild(loadBtn);
                        buttonContainer.appendChild(deleteBtn);
                        gameItem.appendChild(buttonContainer);
                        
                        // Also allow clicking the item to load
                        gameItem.onclick = () => this.loadGame(game.sessionId);
                        
                        savedGamesList.appendChild(gameItem);
                    });
                }
            } else {
                savedGamesList.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">Game storage not available</p>';
            }
        } catch (error) {
            console.error('Failed to load saved games:', error);
            savedGamesList.innerHTML = '<p style="text-align: center; color: #ff4444; padding: 20px;">Failed to load saved games</p>';
        }
        
        // Set up new game button
        const newGameBtn = document.getElementById('new-game-btn');
        if (newGameBtn) {
            // Remove any existing handlers and add new one
            newGameBtn.onclick = null;
            newGameBtn.addEventListener('click', () => {
                this.startNewGame();
            });
        }
    }
    
    hideGameMenu() {
        const menuModal = document.getElementById('game-menu-modal');
        if (menuModal) {
            menuModal.style.display = 'none';
        }
    }
    
    async loadGame(sessionId) {
        const loadingScreen = document.getElementById('loading-screen');
        
        try {
            console.log('Loading game:', sessionId);
            
            // Show loading screen
            if (loadingScreen) {
                loadingScreen.style.display = 'flex';
                const loadingText = loadingScreen.querySelector('p');
                if (loadingText) loadingText.textContent = 'Loading game...';
            }
            
            this.hideGameMenu();
            
            // Wait for gameEngine to be available
            let attempts = 0;
            while ((typeof window.gameEngine === 'undefined') && attempts < 50) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            
            if (typeof window.gameEngine === 'undefined') {
                throw new Error('Game engine not loaded - ensure engine.js is loaded before main.js');
            }
            
            // Load game state from storage
            let gameState = null;
            if (typeof gameStorage !== 'undefined') {
                await gameStorage.init();
                gameState = await gameStorage.loadGameState(sessionId);
            }
            
            if (!gameState) {
                throw new Error('Saved game not found');
            }
            
            // Load game from state
            await window.gameEngine.loadFromState(sessionId, {}, gameState);
            
            // Hide loading screen
            if (loadingScreen) {
                loadingScreen.style.display = 'none';
            }
            
            // Display game state
            const initialState = window.gameEngine.getGameState();
            if (initialState) {
                this.updateUIPanels(initialState);
                this.updateVisualization(initialState);
            }
        } catch (error) {
            console.error('Failed to load game:', error);
            console.error('Error details:', error.stack);
            
            if (loadingScreen) {
                loadingScreen.innerHTML = `
                    <div style="text-align: center; color: #ff4444; padding: 20px;">
                        <h1 style="color: #ff4444;">Error Loading Game</h1>
                        <p style="margin: 10px 0;">${error.message}</p>
                        <p style="margin: 10px 0; font-size: 12px; color: #888;">Check browser console (F12) for details</p>
                        <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #4a9eff; color: white; border: none; border-radius: 5px; cursor: pointer;">Return to Menu</button>
                    </div>
                `;
            }
        }
    }

    showAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    hideAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async handleLogin() {
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        try {
            await api.login(username, password);
            this.isAuthenticated = true;
            this.hideAuthModal();
            await this.startNewGame();
        } catch (error) {
            alert('Login failed: ' + error.message);
        }
    }

    async handleRegister() {
        const username = document.getElementById('register-username').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;

        try {
            await api.register(username, email, password);
            this.isAuthenticated = true;
            this.hideAuthModal();
            await this.startNewGame();
        } catch (error) {
            alert('Registration failed: ' + error.message);
        }
    }

    async startNewGame() {
        const loadingScreen = document.getElementById('loading-screen');
        
        try {
            console.log('Starting new game...');
            
            // Stop any existing game engine first
            if (window.gameEngine && window.gameEngine.isRunning) {
                console.log('Stopping existing game engine...');
                window.gameEngine.stop();
                // Wait a moment for cleanup
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Hide game menu and show loading screen
            this.hideGameMenu();
            if (loadingScreen) {
                loadingScreen.style.display = 'flex';
                const loadingText = loadingScreen.querySelector('p');
                if (loadingText) loadingText.textContent = 'Initializing game engine...';
            }
            
            // Wait for gameEngine to be available (in case scripts are still loading)
            let attempts = 0;
            while ((typeof window.gameEngine === 'undefined') && attempts < 50) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            
            if (typeof window.gameEngine === 'undefined') {
                throw new Error('Game engine not loaded - ensure engine.js is loaded before main.js');
            }
            
            // Generate a unique session ID for this new game
            // This ensures we don't load old saved state
            const newSessionId = 'new_game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // Optionally create backend session for saving/leaderboards (non-blocking)
            let sessionId = newSessionId;
            try {
                const response = await api.startGame({});
                if (response && response.session_id) {
                    sessionId = response.session_id;
                    console.log('Backend session created:', sessionId);
                }
            } catch (apiError) {
                console.warn('Failed to create backend session (game will run locally):', apiError);
                // Use the generated local session ID
                sessionId = newSessionId;
            }
            
            // Start local game engine with unique session ID and fresh config
            // Pass config to ensure we get proper initial state
            await window.gameEngine.start(sessionId, {
                initial_probes: 1,
                initial_metal: 1000,
                initial_energy: 100000,  // 100kW initial energy supply
                default_zone: 'earth'     // Start probes at Earth
            });
            
            // Update loading message
            if (loadingScreen) {
                const loadingText = loadingScreen.querySelector('p');
                if (loadingText) loadingText.textContent = 'Loading game...';
            }
            
            // Hide loading screen
            if (loadingScreen) {
                loadingScreen.style.display = 'none';
            }
            
            // Display initial game state
            const initialState = window.gameEngine.getGameState();
            if (initialState) {
                this.updateUIPanels(initialState);
                this.updateVisualization(initialState);
            }
        } catch (error) {
            console.error('Failed to start game:', error);
            console.error('Error details:', error.stack);
            
            if (loadingScreen) {
                loadingScreen.innerHTML = `
                    <div style="text-align: center; color: #ff4444; padding: 20px;">
                        <h1 style="color: #ff4444;">Error Starting Game</h1>
                        <p style="margin: 10px 0;">${error.message}</p>
                        <p style="margin: 10px 0; font-size: 12px; color: #888;">Check browser console (F12) for details</p>
                        <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #4a9eff; color: white; border: none; border-radius: 5px; cursor: pointer;">Retry</button>
                    </div>
                `;
            }
        }
    }

    /**
     * Start independent UI update loop using requestAnimationFrame
     * Polls game state at fixed intervals:
     *   - Visualization: 30fps (every 2 frames)
     *   - UI panels: 5fps (every 12 frames)
     *   - Time display: 60fps (every frame)
     */
    startUIUpdateLoop() {
        if (!this.uiUpdateFrameCount) {
            this.uiUpdateFrameCount = 0;
        }
        
        const updateUI = () => {
            this.uiUpdateFrameCount++;
            
            // Get current game state (polled, not event-driven)
            const gameState = window.gameEngine?.getGameState();
            if (!gameState) {
                requestAnimationFrame(updateUI);
                return;
            }
            
            const profiler = window.performanceProfiler;
            const uiUpdateStart = profiler ? profiler.startTiming('ui_update') : null;
            
            // Record memory usage
            if (profiler) {
                profiler.recordMemoryUsage(gameState);
            }
            
            // Critical: time display every frame (60fps)
            if (this.timeControls) {
                this.timeControls.update(gameState);
            }
            
            // Visualization every 2 frames (~30fps) - smooth planet orbits
            if (this.uiUpdateFrameCount % 2 === 0) {
                this.updateVisualization(gameState);
            }
            
            // UI panels every 12 frames (~5fps) - numbers/text don't need high refresh
            if (this.uiUpdateFrameCount % 12 === 0) {
                const probeUIStart = profiler ? performance.now() : null;
                this.updateUIPanels(gameState);
                
                // Record probe UI update time
                if (profiler && probeUIStart !== null) {
                    const probeUITime = performance.now() - probeUIStart;
                    profiler.recordUIProbeUpdateTime(probeUITime);
                }
                
                // Check for game completion
                if (gameState.dyson_sphere?.progress >= 1.0) {
                    this.onGameComplete();
                }
            }
            
            // End profiling UI update
            if (profiler && uiUpdateStart !== null) {
                profiler.endTiming('ui_update', uiUpdateStart);
            }
            
            requestAnimationFrame(updateUI);
        };
        
        requestAnimationFrame(updateUI);
    }
    
    /**
     * Update visualization components (3D rendering)
     */
    updateVisualization(gameState) {
        if (this.dysonViz) {
            this.dysonViz.update(gameState);
        }
        if (this.solarSystem) {
            this.solarSystem.updateZoneDepletion(gameState);
        }
        if (this.structuresViz) {
            const probeAllocations = gameState.probe_allocations || {};
            const factoryProduction = gameState.factory_production || {};
            this.structuresViz.updateStructures(gameState, probeAllocations, factoryProduction);
        }
        if (this.transferViz) {
            this.transferViz.update(gameState);
        }
    }
    
    /**
     * Update UI panels (text, numbers, controls)
     */
    updateUIPanels(gameState) {
        if (this.resourceDisplay) {
            this.resourceDisplay.update(gameState);
        }
        if (this.purchasePanel) {
            this.purchasePanel.update(gameState);
        }
        if (this.researchPanel) {
            this.researchPanel.update(gameState);
            // Expose globally for event handlers
            window.researchPanel = this.researchPanel;
        }
        if (this.commandPanel) {
            this.commandPanel.update(gameState);
        }
        if (this.productionPanel) {
            this.productionPanel.update(gameState);
        }
        if (this.probeAllocationPanel) {
            this.probeAllocationPanel.update(gameState);
        }
        if (this.probePanel) {
            this.probePanel.update(gameState);
        }
        if (this.managePanel) {
            this.managePanel.update(gameState);
        }
        if (this.probeSummaryPanel) {
            this.probeSummaryPanel.update(gameState);
        }
        
        if (this.zoneInfoPanel) {
            this.zoneInfoPanel.update(gameState);
        }
        if (this.transferPanel) {
            this.transferPanel.update(gameState);
        }
        if (this.orbitalZoneSelector) {
            this.orbitalZoneSelector.update(gameState);
        }
    }

    // updateDysonProgress removed - Dyson progress is displayed in resource display panel

    async onGameComplete() {
        // Completion sign is now shown by the dyson sphere visualization
        // No popup menu - just show the green "complete" sign
        
        // Complete game session silently in the background
        try {
            await api.request('/api/game/complete', {
                method: 'POST',
                body: JSON.stringify({ session_id: window.gameEngine.sessionId })
            });
            // Refresh leaderboard if available
            if (this.leaderboard) {
                await this.leaderboard.loadLeaderboard();
            }
        } catch (error) {
            console.error('Failed to complete game:', error);
        }
    }
    
    returnToMenu() {
        // Stop the current game
        if (window.gameEngine) {
            window.gameEngine.stop();
        }
        
        // Hide game UI
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        
        // Show menu
        this.showGameMenu();
    }

    formatNumber(value) {
        if (value >= 1e24) return (value / 1e24).toFixed(2) + 'Y';
        if (value >= 1e21) return (value / 1e21).toFixed(2) + 'Z';
        if (value >= 1e18) return (value / 1e18).toFixed(2) + 'E';
        if (value >= 1e15) return (value / 1e15).toFixed(2) + 'P';
        if (value >= 1e12) return (value / 1e12).toFixed(2) + 'T';
        if (value >= 1e9) return (value / 1e9).toFixed(2) + 'G';
        if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
        if (value >= 1e3) return (value / 1e3).toFixed(2) + 'k';
        return value.toFixed(2);
    }

    formatTime(days) {
        // Game time is now in days, use FormatUtils for consistent formatting
        return FormatUtils.formatTime(days);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const baseDeltaTime = 0.016; // ~60fps base
        
        // Get time speed from game engine to make planets move faster
        const timeSpeed = (typeof window.gameEngine !== 'undefined' && window.gameEngine.timeSpeed) ? window.gameEngine.timeSpeed : 1;
        const deltaTime = baseDeltaTime * timeSpeed;

        // Update starfield with camera position
        if (this.starfield && this.sceneManager) {
            const cameraPos = this.sceneManager.getCameraPosition();
            this.starfield.update(cameraPos, baseDeltaTime); // Starfield doesn't need to speed up
        }

        // Update solar system animation (planets move faster with time speed)
        if (this.solarSystem) {
            this.solarSystem.update(deltaTime);
        }

        // Probe visualization removed - focusing on mechanics first
        // Probe visualization removed - focusing on mechanics first
        // Update probe visualization orbital positions
        // if (this.probeViz) {
        //     this.probeViz.update(deltaTime);
        // }

        // Update Dyson sphere visualization orbital positions
        if (this.dysonViz) {
            this.dysonViz.update(deltaTime);
        }

        // Update structures visualization
        if (this.structuresViz) {
            this.structuresViz.update(baseDeltaTime); // Structures don't need to speed up
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});

