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

            // Initialize metrics panel
            try {
                this.metricsPanel = typeof MetricsPanel !== 'undefined' ? 
                    new MetricsPanel('metrics-panel') : null;
            } catch (e) {
                console.error('Failed to initialize MetricsPanel:', e);
            }

            // Initialize probe summary panel
            try {
                this.probeSummaryPanel = typeof ProbeSummaryPanel !== 'undefined' ? 
                    new ProbeSummaryPanel('probe-summary-panel') : null;
            } catch (e) {
                console.error('Failed to initialize ProbeSummaryPanel:', e);
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
                    }
                    if (typeof StructuresVisualization !== 'undefined') {
                        this.structuresViz = new StructuresVisualization(this.sceneManager.getScene());
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
                }
            } catch (e) {
                console.error('Failed to initialize visualization:', e);
            }
            
            // Initialize UI components with sidebar tab containers
            try {
                const buildTab = sidebar ? sidebar.getTabContainer('build') : document.getElementById('tab-build');
                if (buildTab) {
                    // Create a wrapper div for purchase panel content
                    buildTab.innerHTML = '<div id="purchase-panel-content"></div>';
                    this.purchasePanel = new PurchasePanel('purchase-panel-content');
                    // Expose globally for onclick handlers
                    window.purchasePanel = this.purchasePanel;
                }
            } catch (e) {
                console.error('Failed to initialize PurchasePanel:', e);
            }
            
            try {
                const researchTab = sidebar ? sidebar.getTabContainer('research') : document.getElementById('tab-research');
                if (researchTab) {
                    researchTab.innerHTML = '<div id="research-panel-content"></div>';
                    this.researchPanel = new ResearchPanel('research-panel-content');
                    // Expose globally for onclick handlers
                    window.researchPanel = this.researchPanel;
                }
            } catch (e) {
                console.error('Failed to initialize ResearchPanel:', e);
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
                const transfersTab = sidebar ? sidebar.getTabContainer('transfers') : document.getElementById('tab-transfers');
                if (transfersTab) {
                    transfersTab.innerHTML = '<div id="transfer-panel-content"></div>';
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

            // Check authentication (skip for now)
            await this.checkAuth();

            // Start animation loop
            this.animate();
            
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

        // Game state updates
        window.addEventListener('gameStateUpdate', (e) => {
            this.onGameStateUpdate(e.detail);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            const activeElement = document.activeElement;
            const isInputFocused = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';
            
            // Pause/Resume: Spacebar
            if (e.key === ' ' && !isInputFocused) {
                e.preventDefault();
                if (this.timeControls) {
                    this.timeControls.togglePause();
                }
            }
            
            // Leaderboard: 'L' key
            if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey && !isInputFocused) {
                this.leaderboard.show();
            }
        });
    }

    async checkAuth() {
        // Skip authentication for now - start game directly
        this.isAuthenticated = true;
        this.hideAuthModal();
        
        // Small delay to ensure UI is ready
        setTimeout(() => {
            this.startNewGame();
        }, 100);
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
            
            // Update loading message
            if (loadingScreen) {
                const loadingText = loadingScreen.querySelector('p');
                if (loadingText) loadingText.textContent = 'Initializing game engine...';
            }
            
            if (typeof gameEngine === 'undefined') {
                throw new Error('Game engine not loaded');
            }
            
            // Optionally create backend session for saving/leaderboards (non-blocking)
            let sessionId = null;
            try {
                const response = await api.startGame({});
                if (response && response.session_id) {
                    sessionId = response.session_id;
                    console.log('Backend session created:', sessionId);
                }
            } catch (apiError) {
                console.warn('Failed to create backend session (game will run locally):', apiError);
                // Continue without backend session - game runs entirely locally
            }
            
            // Start local game engine
            await gameEngine.start(sessionId || 'local', {});
            
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
            const initialState = gameEngine.getGameState();
            if (initialState) {
                this.onGameStateUpdate(initialState);
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

    onGameStateUpdate(gameState) {
        // Update all UI components
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
        if (this.managePanel) {
            this.managePanel.update(gameState);
        }
        // Probe visualization removed - focusing on mechanics first
        // if (this.probeViz) {
        //     this.probeViz.updateProbes(gameState);
        // }
        if (this.dysonViz) {
            this.dysonViz.update(gameState);
            // Dyson progress bar removed - displayed in resource display instead
        }
        if (this.solarSystem) {
            this.solarSystem.updateZoneDepletion(gameState);
        }
        if (this.structuresViz) {
            // Get probe allocations and factory production from game state
            const probeAllocations = gameState.probe_allocations || {};
            const factoryProduction = gameState.factory_production || {};
            this.structuresViz.updateStructures(gameState, probeAllocations, factoryProduction);
        }
        if (this.metricsPanel) {
            this.metricsPanel.update(gameState);
        }
        if (this.probeSummaryPanel) {
            this.probeSummaryPanel.update(gameState);
            
            if (this.transferPanel) {
                this.transferPanel.update(gameState);
            }
        }
        if (this.orbitalZoneSelector) {
            this.orbitalZoneSelector.update(gameState);
        }
        if (this.timeControls) {
            this.timeControls.update(gameState);
        }
        
        // Energy display removed

        // Check for game completion
        if (gameState.dyson_sphere_progress >= 1.0) {
            this.onGameComplete();
        }
    }

    // updateDysonProgress removed - Dyson progress is displayed in resource display panel

    async onGameComplete() {
        // Show completion message
        const gameState = gameEngine.getGameState();
        const time = gameState.time || 0;
        const metal = gameState.zone_metal_remaining ? 
            Object.values(gameState.zone_metal_remaining).reduce((a, b) => a + b, 0) : 0;

        alert(`Game Complete!\nTime: ${this.formatTime(time)}\nMetal Remaining: ${this.formatNumber(metal)} kg`);

        // Complete game session
        try {
            await api.request('/api/game/complete', {
                method: 'POST',
                body: JSON.stringify({ session_id: gameEngine.sessionId })
            });
            // Refresh leaderboard if available
            if (this.leaderboard) {
                await this.leaderboard.loadLeaderboard();
            }
        } catch (error) {
            console.error('Failed to complete game:', error);
        }
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

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const baseDeltaTime = 0.016; // ~60fps base
        
        // Get time speed from game engine to make planets move faster
        const timeSpeed = (typeof gameEngine !== 'undefined' && gameEngine.timeSpeed) ? gameEngine.timeSpeed : 1;
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

