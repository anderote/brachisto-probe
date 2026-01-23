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

        // Loading screen state
        this.loadingScreenStartTime = Date.now();
        this.minLoadingScreenDuration = 3000; // 3 seconds maximum

        // Skill allocation state
        this.selectedDifficulty = 'medium';
        this.selectedPlanet = 'earth';
        this.skillPoints = {
            mass_driver: 0,
            probe_dv: 0,
            mining: 0,
            replication: 0,
            compute: 0,
            energy: 0,
            dexterity: 0
        };
        this.totalSkillPoints = 10;

        this.init();
    }

    /**
     * Fade out the loading screen with minimum display time
     * @param {boolean} immediate - Skip minimum time requirement
     */
    async fadeOutLoadingScreen(immediate = false) {
        const loadingScreen = document.getElementById('loading-screen');
        if (!loadingScreen) return;

        // Wait for minimum display time unless immediate
        if (!immediate) {
            const elapsed = Date.now() - this.loadingScreenStartTime;
            const remaining = this.minLoadingScreenDuration - elapsed;
            if (remaining > 0) {
                await new Promise(resolve => setTimeout(resolve, remaining));
            }
        }

        // Add fade-out class
        loadingScreen.classList.add('fade-out');

        // Destroy galaxy animation
        if (window.loadingGalaxy) {
            window.loadingGalaxy.destroy();
            window.loadingGalaxy = null;
        }

        // Wait for fade animation to complete, then hide
        await new Promise(resolve => setTimeout(resolve, 1500));
        loadingScreen.style.display = 'none';
    }

    /**
     * Show loading screen (reset for new loading)
     */
    showLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('fade-out');
            loadingScreen.style.display = 'flex';
            this.loadingScreenStartTime = Date.now();
        }
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
                    const scene = this.sceneManager.getScene();
                    if (!scene) {
                        console.error('[App] SceneManager.getScene() returned null/undefined');
                    }

                    if (typeof Starfield !== 'undefined' && scene) {
                        try {
                            this.starfield = new Starfield(scene);
                        } catch (e) {
                            console.error('[App] Failed to create Starfield:', e);
                        }
                    }

                    if (typeof SolarSystem !== 'undefined' && scene) {
                        try {
                            this.solarSystem = new SolarSystem(scene);
                            // Set solar system reference in scene manager for comet tracking
                            this.sceneManager.setSolarSystem(this.solarSystem);
                        } catch (e) {
                            console.error('[App] Failed to create SolarSystem:', e);
                        }
                    }
                    if (typeof StructuresVisualization !== 'undefined' && scene) {
                        try {
                            this.structuresViz = new StructuresVisualization(scene, this.solarSystem);
                        } catch (e) {
                            console.error('[App] Failed to create StructuresVisualization:', e);
                        }
                    }
                    // Note: probeViz and dysonViz need solarSystem for scaling, but it may not be ready yet
                    // They will handle the null case with fallback scaling
                    // Probe visualization removed - focusing on mechanics first
                    // if (typeof ProbeVisualization !== 'undefined') {
                    //     // Pass solarSystem reference for orbit scaling (may be null initially)
                    //     this.probeViz = new ProbeVisualization(scene, this.solarSystem);
                    // }
                    if (typeof DysonSphereVisualization !== 'undefined' && scene) {
                        try {
                            // Pass solarSystem reference for orbit scaling (may be null initially)
                            this.dysonViz = new DysonSphereVisualization(scene, this.solarSystem);
                        } catch (e) {
                            console.error('[App] Failed to create DysonSphereVisualization:', e);
                        }
                    }
                    if (typeof TransferVisualization !== 'undefined' && scene) {
                        try {
                            // Pass solarSystem and structuresViz references
                            this.transferViz = new TransferVisualization(scene, this.solarSystem, this.structuresViz);
                            // Set transfer viz reference in scene manager for line toggling
                            this.sceneManager.setTransferViz(this.transferViz);
                        
                        // Wire up transfer arrival callback to spawn resource particles
                        // Uses the same particle system as mining for consistent mass-proportional sizing
                        const solarSystemRef = this.solarSystem;
                        this.transferViz.setArrivalCallback((arrivalInfo) => {
                            if (!solarSystemRef) return;

                            const { zoneId, resourceType, arrivals } = arrivalInfo;

                            // Only handle resource types (metal, slag, methalox)
                            // Probes use different handling
                            if (resourceType === 'probe') return;

                            // Determine target zone for particles - for moon zones, use parent planet
                            let targetZoneId = zoneId;
                            if (!solarSystemRef.resourceParticles[zoneId]) {
                                // Check if this is a moon zone and use parent
                                const zoneData = window.gameDataLoader?.getZoneById?.(zoneId);
                                if (zoneData?.is_moon && zoneData.parent_zone) {
                                    targetZoneId = zoneData.parent_zone;
                                }
                            }

                            // Ensure particle data arrays exist for this zone
                            if (!solarSystemRef.resourceParticleData[targetZoneId]) {
                                solarSystemRef.resourceParticleData[targetZoneId] = {
                                    metal: [],
                                    slag: [],
                                    methalox: [],
                                    probe: []
                                };
                            }

                            // Track total mass arriving to prevent double-counting with mining spawn
                            let totalArrivalMass = 0;

                            // Spawn a particle for each arrival
                            for (const arrival of arrivals || []) {
                                const { position, massKg, velocityDir } = arrival;

                                // Skip if no mass (shouldn't happen, but safety check)
                                if (!massKg || massKg <= 0) continue;

                                totalArrivalMass += massKg;

                                // Calculate visual size from mass (same as mining particles)
                                const visualSize = solarSystemRef.massToVisualSize(massKg);

                                // Spawn particle at arrival position with velocity direction
                                const particle = solarSystemRef.spawnResourceParticleAtPosition(
                                    targetZoneId,
                                    resourceType,
                                    massKg,
                                    visualSize,
                                    position,
                                    velocityDir
                                );

                                // Add to particle data array for tracking
                                if (particle) {
                                    const particleData = solarSystemRef.resourceParticleData[targetZoneId];
                                    if (particleData && particleData[resourceType]) {
                                        particleData[resourceType].push(particle);
                                    }
                                }
                            }

                            // Subtract arrival mass from pending to prevent double-spawning
                            // The mining system would otherwise spawn particles for this mass increase
                            if (totalArrivalMass > 0 && solarSystemRef.pendingMass[targetZoneId]) {
                                const pending = solarSystemRef.pendingMass[targetZoneId];
                                if (pending[resourceType] !== undefined) {
                                    pending[resourceType] = Math.max(0, pending[resourceType] - totalArrivalMass);
                                }
                            }
                        });
                        } catch (e) {
                            console.error('[App] Failed to create TransferVisualization:', e);
                        }
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
                const probesTab = sidebar ? sidebar.getTabContainer('probes') : document.getElementById('right-tab-probes');
                if (probesTab) {
                    let probeStatsPanelContent = document.getElementById('probe-stats-panel-content');
                    if (!probeStatsPanelContent) {
                        probesTab.innerHTML = '<div id="probe-stats-panel-content"></div>';
                        probeStatsPanelContent = document.getElementById('probe-stats-panel-content');
                    }
                    this.probePanel = new ProbePanel('probe-stats-panel-content');
                    // Expose globally for onclick handlers
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
            
            // Set up debug panel with visualization references
            try {
                if (window.debugPanel) {
                    window.debugPanel.setReferences(
                        this.solarSystem,
                        this.dysonViz,
                        this.sceneManager,
                        this.starfield
                    );
                }
            } catch (e) {
                console.error('Failed to set up debug panel:', e);
            }
            
            // Initialize summary plot panel
            try {
                this.summaryPlotPanel = typeof SummaryPlotPanel !== 'undefined' ? 
                    new SummaryPlotPanel('summary-plot-panel') : null;
            } catch (e) {
                console.error('Failed to initialize SummaryPlotPanel:', e);
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

            // Initialize interstellar navigation (Galaxy Mode)
            try {
                this.interstellarNav = typeof InterstellarNav !== 'undefined' ?
                    new InterstellarNav('interstellar-nav-panel') : null;
                if (this.interstellarNav) {
                    window.interstellarNav = this.interstellarNav;

                    // Set up callbacks for interstellar transfers
                    this.interstellarNav.onTransferInitiated = (targetSystemId, probeCount) => {
                        console.log(`[InterstellarNav] Transfer initiated to ${targetSystemId} with ${probeCount} probes`);
                        // TODO: Wire to engine for actual transfer
                        if (window.toast) {
                            window.toast.success(`Colony ship dispatched to ${targetSystemId}!`);
                        }
                    };

                    this.interstellarNav.onSystemSelected = (systemId) => {
                        console.log(`[InterstellarNav] System selected: ${systemId}`);
                        // TODO: Wire to engine for system switching
                    };
                }
            } catch (e) {
                console.error('Failed to initialize InterstellarNav:', e);
            }

            // Initialize 3D Star Map Visualization (full-screen Milky Way view)
            try {
                console.log('[App] StarMapVisualization class available:', typeof StarMapVisualization !== 'undefined');
                this.starMapVisualization = typeof StarMapVisualization !== 'undefined' ?
                    new StarMapVisualization() : null;
                if (this.starMapVisualization) {
                    window.starMapVisualization = this.starMapVisualization;
                    // Initialize asynchronously after loading star data (don't await - let it load in background)
                    this.initializeStarMap().catch(e => {
                        console.error('[App] Star map initialization failed:', e);
                    });
                } else {
                    console.warn('[App] StarMapVisualization not created');
                }
            } catch (e) {
                console.error('[App] Failed to initialize StarMapVisualization:', e);
            }

            // Initialize Universe Map Visualization (Phase 3 - cosmic web)
            try {
                console.log('[App] UniverseMapVisualization class available:', typeof UniverseMapVisualization !== 'undefined');
                this.universeMapVisualization = typeof UniverseMapVisualization !== 'undefined' ?
                    new UniverseMapVisualization() : null;
                this.universeSystem = typeof UniverseSystem !== 'undefined' ?
                    new UniverseSystem() : null;
                this.universeUnlocked = false; // Unlock at 99% galaxy completion

                if (this.universeMapVisualization) {
                    window.universeMapVisualization = this.universeMapVisualization;
                    // Initialize asynchronously
                    this.initializeUniverseMap().catch(e => {
                        console.error('[App] Universe map initialization failed:', e);
                    });
                }
            } catch (e) {
                console.error('[App] Failed to initialize UniverseMapVisualization:', e);
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

            // View switching: Ctrl/Cmd/Alt + 1/2 for Solar System / Galaxy
            // Alt works better since browsers capture Ctrl+number for tab switching
            const modifierKey = e.ctrlKey || e.metaKey || e.altKey;
            if (modifierKey && /^[1-2]$/.test(e.key) && !isInputFocused) {
                e.preventDefault();
                e.stopPropagation();

                if (e.key === '1') {
                    // Solar System view
                    console.log('[App] View switch: Solar System');
                    if (this.starMapVisualization?.isActive) {
                        this.starMapVisualization.hide();
                    }
                } else if (e.key === '2') {
                    // Galaxy view
                    console.log('[App] View switch: Galaxy, starMap exists:', !!this.starMapVisualization, 'isActive:', this.starMapVisualization?.isActive);
                    if (this.starMapVisualization) {
                        if (!this.starMapVisualization.isActive) {
                            this.starMapVisualization.show();
                        }
                    } else {
                        console.warn('[App] starMapVisualization not initialized!');
                    }
                }
                return;
            }

            // Star system focus keys (when in star map view, without modifiers)
            // 1 = Sol, 2-9 = major systems, 0 = Galactic Center
            if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !isInputFocused) {
                if (this.starMapVisualization && this.starMapVisualization.isActive) {
                    if (e.key === '1') {
                        this.starMapVisualization.focusOnSol();
                    } else {
                        // Focus on major star system by key
                        this.starMapVisualization.focusOnSystem(e.key);
                    }
                }
            }

            // Star map keyboard shortcuts are handled in star_map.js setupKeyboardShortcuts()
            // O = Strategy, K = Drive Research, L = Stellar Census, F = Fleet View
            // WASD = Fly camera, H = Home (Sol), P = Debug panel
        });

        // Game menu button
        this.setupGameMenuButton();
    }

    /**
     * Setup the game menu button (wrench icon at bottom left)
     */
    setupGameMenuButton() {
        const menuTrigger = document.getElementById('game-menu-trigger');
        const menuDropdown = document.getElementById('game-menu-dropdown');
        const saveGameOption = document.getElementById('menu-save-game');
        const newGameOption = document.getElementById('menu-new-game');

        if (menuTrigger && menuDropdown) {
            // Toggle dropdown on button click
            menuTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = menuDropdown.style.display !== 'none';
                menuDropdown.style.display = isVisible ? 'none' : 'block';
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!menuDropdown.contains(e.target) && e.target !== menuTrigger) {
                    menuDropdown.style.display = 'none';
                }
            });
        }

        // Save Game option
        if (saveGameOption) {
            saveGameOption.addEventListener('click', async () => {
                menuDropdown.style.display = 'none';
                await this.saveCurrentGame();
            });
        }

        // New Game option
        if (newGameOption) {
            newGameOption.addEventListener('click', () => {
                menuDropdown.style.display = 'none';
                this.showGameMenu();
            });
        }
    }

    /**
     * Save the current game
     */
    async saveCurrentGame() {
        try {
            if (window.toast) {
                window.toast.info('Saving game...');
            }

            const result = await window.gameEngine.saveGame();

            if (result && result.success) {
                if (window.toast) {
                    window.toast.success('Game saved successfully!');
                }
            } else {
                throw new Error(result?.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Failed to save game:', error);
            if (window.toast) {
                window.toast.error('Failed to save game: ' + error.message);
            }
        }
    }

    /**
     * Initialize the 3D star map visualization
     * Loads nearby stars data (POAs) for the galaxy map
     * NOTE: GalaxySystem is deprecated - StarMapVisualization manages all galaxy state
     */
    async initializeStarMap() {
        if (!this.starMapVisualization) {
            console.log('[App] No starMapVisualization instance');
            return;
        }

        try {
            console.log('[App] Loading nearby stars data (POAs)...');
            // Load nearby stars data (used as Points of Attraction in galaxy)
            const response = await fetch('/game_data/nearby_stars.json');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const starData = await response.json();
            console.log('[App] Loaded', starData?.stars?.length || 0, 'POA stars');

            // NOTE: GalaxySystem is deprecated
            // StarMapVisualization now manages all galaxy state internally via POAs
            // The galaxySystem parameter is kept for backwards compatibility but ignored

            // Initialize the star map with data (no galaxySystem)
            this.starMapVisualization.init(starData);
            console.log('[App] Star map visualization initialized successfully');

            // Load starship drives data for relativistic travel calculations
            try {
                const drivesResponse = await fetch('/game_data/starship_drives.json');
                if (drivesResponse.ok) {
                    const drivesData = await drivesResponse.json();
                    this.starMapVisualization.setStarshipDrives(drivesData);
                    console.log('[App] Starship drives loaded for relativistic travel');
                }
            } catch (driveErr) {
                console.warn('[App] Could not load starship drives:', driveErr);
            }

        } catch (error) {
            console.error('[App] Failed to initialize star map:', error);
        }
    }

    /**
     * Initialize the 3D universe map visualization (Phase 3)
     * Loads universe data and creates the UniverseSystem
     */
    async initializeUniverseMap() {
        if (!this.universeMapVisualization) {
            console.log('[App] No universeMapVisualization instance');
            return;
        }

        try {
            console.log('[App] Loading universe data...');
            const response = await fetch('/game_data/universe_data.json');
            if (!response.ok) {
                console.warn('[App] universe_data.json not found, universe view disabled');
                return;
            }
            const universeData = await response.json();
            console.log('[App] Loaded universe data with', universeData?.superclusters?.length || 0, 'superclusters');

            // Initialize universe system
            // NOTE: GalaxySystem deprecated - pass null, universe system will check starMap for completion
            if (this.universeSystem) {
                this.universeSystem.init(universeData, null);
                console.log('[App] UniverseSystem initialized');
            }

            // Initialize the universe map visualization
            await this.universeMapVisualization.init(universeData);

            // Link systems
            if (this.universeSystem && this.universeMapVisualization) {
                this.universeMapVisualization.universeSystem = this.universeSystem;
                this.universeSystem.visualization = this.universeMapVisualization;
            }

            // Initialize universe panel UI
            if (typeof UniversePanel !== 'undefined' && this.universeSystem && this.universeMapVisualization) {
                this.universePanel = new UniversePanel(this.universeSystem, this.universeMapVisualization);
                this.universePanel.init();
            }

            console.log('[App] Universe map visualization initialized successfully');

        } catch (error) {
            console.error('[App] Failed to initialize universe map:', error);
        }
    }

    /**
     * Check and update universe unlock status
     * Called periodically to check galaxy completion
     * NOTE: GalaxySystem is deprecated - check StarMapVisualization for completion
     */
    checkUniverseUnlock() {
        if (this.universeUnlocked) return true;

        // Check galaxy completion via StarMapVisualization
        // Universe unlocks at 99% galaxy colonization
        const starMap = this.starMapVisualization;
        if (starMap && starMap.getGalaxyCompletionPercent) {
            const completion = starMap.getGalaxyCompletionPercent();
            if (completion >= 0.99) {
                this.universeUnlocked = true;
                console.log('[App] Universe view unlocked! Galaxy at 99% completion.');

                // Show notification
                if (typeof showToast === 'function') {
                    showToast('Universe View Unlocked! Press U in Galaxy view.', 'success');
                }

                // Dispatch event
                window.dispatchEvent(new CustomEvent('universe-unlocked'));

                return true;
            }
        }

        return false;
    }

    /**
     * Force unlock universe view for testing
     * Use in browser console: app.unlockUniverse()
     */
    unlockUniverse() {
        this.universeUnlocked = true;
        console.log('[App] Universe view force unlocked for testing');
        console.log('[App] Press I to enter galaxy view, then U to enter universe view');
        if (typeof showToast === 'function') {
            showToast('Universe View Unlocked (Debug Mode)', 'success');
        }
        return 'Universe unlocked! Press I for galaxy, then U for universe.';
    }

    /**
     * Directly show universe view for testing
     * Use in browser console: app.showUniverse()
     */
    showUniverse() {
        this.universeUnlocked = true;
        if (this.universeMapVisualization && this.universeMapVisualization.isInitialized) {
            this.universeMapVisualization.show();
            return 'Universe view activated!';
        } else {
            return 'Universe map not yet initialized. Wait a moment and try again.';
        }
    }

    async checkAuth() {
        // Skip authentication for now - show game menu
        this.isAuthenticated = true;
        this.hideAuthModal();

        // DEV MODE: Skip saved game check, start fresh in interstellar mode
        console.log('[App] Starting fresh game in interstellar mode');
        try {
            await this.startNewGame('interstellar', 'earth', null);
            return;
        } catch (e) {
            console.error('Failed to start interstellar game:', e);
        }

        // Fallback: show game menu if auto-start fails
        setTimeout(() => {
            this.showGameMenu();
        }, 100);
    }

    /**
     * Resume from a saved game state (for auto-resume)
     */
    async resumeSavedGame(sessionId, gameState) {
        try {
            const menuModal = document.getElementById('game-menu-modal');

            // Hide menu if shown
            if (menuModal) {
                menuModal.style.display = 'none';
            }

            // Show loading screen
            this.showLoadingScreen();

            // Resume using the engine client
            await window.gameEngine.resumeGame(sessionId, gameState);

            // Get restored state and restore galaxy before showing
            const restoredState = window.gameEngine.getGameState();
            if (restoredState) {
                // Restore galaxy state if available
                if (restoredState.galaxy && this.starMapVisualization) {
                    this.starMapVisualization.restoreGalaxyState(restoredState.galaxy);
                }
            }

            // Show galaxy view WHILE loading screen is still visible
            console.log('[App] Resuming in galaxy view');
            window.startInInterstellarMode = true;

            const showStarMap = async () => {
                for (let i = 0; i < 50; i++) {
                    if (this.starMapVisualization?.isInitialized) {
                        this.starMapVisualization.show();
                        console.log('[App] Galaxy view activated behind loading screen');
                        return true;
                    }
                    await new Promise(r => setTimeout(r, 100));
                }
                return false;
            };

            await showStarMap();

            // Now fade out loading screen - galaxy view is already visible underneath
            await this.fadeOutLoadingScreen();

            if (restoredState) {
                this.updateUIPanels(restoredState);
                this.updateVisualization(restoredState);
            }

            console.log('Game resumed successfully');
        } catch (error) {
            console.error('Failed to resume game:', error);
            // Fall back to showing menu
            this.showGameMenu();
        }
    }
    
    async showGameMenu() {
        const menuModal = document.getElementById('game-menu-modal');
        const savedGamesList = document.getElementById('saved-games-list');

        // Fade out loading screen when showing menu
        await this.fadeOutLoadingScreen();
        
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
                                    window.toast?.error('Failed to delete game: ' + error.message);
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
        // Difficulty buttons - now open skill allocation modal
        const interstellarBtn = document.getElementById('interstellar-game-btn');
        const easyBtn = document.getElementById('easy-game-btn');
        const mediumBtn = document.getElementById('medium-game-btn');
        const hardBtn = document.getElementById('hard-game-btn');

        if (interstellarBtn) {
            interstellarBtn.onclick = null;
            interstellarBtn.addEventListener('click', () => this.showSkillAllocationModal('interstellar'));
        }
        if (easyBtn) {
            easyBtn.onclick = null;
            easyBtn.addEventListener('click', () => this.showSkillAllocationModal('easy'));
        }
        if (mediumBtn) {
            mediumBtn.onclick = null;
            mediumBtn.addEventListener('click', () => this.showSkillAllocationModal('medium'));
        }
        if (hardBtn) {
            hardBtn.onclick = null;
            hardBtn.addEventListener('click', () => this.showSkillAllocationModal('hard'));
        }

        // Close button for game menu
        const closeBtn = document.getElementById('game-menu-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                const gameMenu = document.getElementById('game-menu-modal');
                if (gameMenu) gameMenu.style.display = 'none';
            });
        }
    }
    
    /**
     * Show skill allocation modal after difficulty selection
     */
    showSkillAllocationModal(difficulty) {
        this.selectedDifficulty = difficulty;
        this.selectedPlanet = 'earth';
        this.skillPoints = {
            mass_driver: 0,
            probe_dv: 0,
            mining: 0,
            replication: 0,
            compute: 0,
            energy: 0,
            dexterity: 0
        };
        
        // Hide game menu, show skill allocation
        const gameMenu = document.getElementById('game-menu-modal');
        const skillModal = document.getElementById('skill-allocation-modal');
        
        if (gameMenu) gameMenu.style.display = 'none';
        if (skillModal) skillModal.style.display = 'flex';
        
        // Update difficulty label
        const difficultyLabel = document.getElementById('difficulty-label');
        if (difficultyLabel) {
            const labels = { interstellar: 'Interstellar', easy: 'Easy', medium: 'Medium', hard: 'Hard' };
            difficultyLabel.textContent = `${labels[difficulty]} Mode`;
        }
        
        // Reset planet selection
        this.updatePlanetSelection('earth');
        
        // Reset sliders
        this.resetSkillSliders();
        
        // Set up event listeners
        this.setupSkillAllocationListeners();
    }
    
    /**
     * Set up skill allocation modal event listeners
     */
    setupSkillAllocationListeners() {
        // Planet buttons
        const planetBtns = document.querySelectorAll('.planet-btn');
        planetBtns.forEach(btn => {
            btn.onclick = () => {
                const planet = btn.dataset.planet;
                this.updatePlanetSelection(planet);
            };
        });
        
        // Skill sliders
        const sliderIds = ['mass-driver', 'probe-dv', 'mining', 'replication', 'compute', 'energy', 'dexterity'];
        sliderIds.forEach(id => {
            const slider = document.getElementById(`skill-${id}`);
            if (slider) {
                slider.oninput = () => this.updateSkillValue(id, parseInt(slider.value));
            }
        });
        
        // Back button
        const backBtn = document.getElementById('skill-back-btn');
        if (backBtn) {
            backBtn.onclick = () => {
                const gameMenu = document.getElementById('game-menu-modal');
                const skillModal = document.getElementById('skill-allocation-modal');
                if (skillModal) skillModal.style.display = 'none';
                if (gameMenu) gameMenu.style.display = 'flex';
            };
        }
        
        // Start button
        const startBtn = document.getElementById('skill-start-btn');
        if (startBtn) {
            startBtn.onclick = () => {
                const skillModal = document.getElementById('skill-allocation-modal');
                if (skillModal) skillModal.style.display = 'none';
                this.startNewGameWithSkills();
            };
        }
    }
    
    /**
     * Update planet selection
     */
    updatePlanetSelection(planet) {
        this.selectedPlanet = planet;
        
        const planetBtns = document.querySelectorAll('.planet-btn');
        planetBtns.forEach(btn => {
            if (btn.dataset.planet === planet) {
                btn.classList.add('selected');
                btn.style.borderColor = '#4a9eff';
            } else {
                btn.classList.remove('selected');
                btn.style.borderColor = 'transparent';
            }
        });
    }
    
    /**
     * Reset skill sliders to 0
     */
    resetSkillSliders() {
        const sliderConfigs = [
            { id: 'mass-driver', key: 'mass_driver' },
            { id: 'probe-dv', key: 'probe_dv' },
            { id: 'mining', key: 'mining' },
            { id: 'replication', key: 'replication' },
            { id: 'compute', key: 'compute' },
            { id: 'energy', key: 'energy' },
            { id: 'dexterity', key: 'dexterity' }
        ];
        
        sliderConfigs.forEach(config => {
            const slider = document.getElementById(`skill-${config.id}`);
            if (slider) {
                slider.value = 0;
                slider.disabled = false;
            }
            this.skillPoints[config.key] = 0;
            this.updateSkillValueDisplay(config.id, 0);
        });
        
        this.updatePointsRemaining();
    }
    
    /**
     * Update skill value when slider changes
     */
    updateSkillValue(sliderId, value) {
        // Map slider ID to skill key
        const keyMap = {
            'mass-driver': 'mass_driver',
            'probe-dv': 'probe_dv',
            'mining': 'mining',
            'replication': 'replication',
            'compute': 'compute',
            'energy': 'energy',
            'dexterity': 'dexterity'
        };
        
        const key = keyMap[sliderId];
        const currentUsed = Object.values(this.skillPoints).reduce((a, b) => a + b, 0);
        const currentValue = this.skillPoints[key];
        const maxAllowed = this.totalSkillPoints - (currentUsed - currentValue);
        
        // Clamp value to max allowed
        const clampedValue = Math.min(value, maxAllowed);
        
        this.skillPoints[key] = clampedValue;
        
        // Update slider if clamped
        const slider = document.getElementById(`skill-${sliderId}`);
        if (slider && slider.value !== String(clampedValue)) {
            slider.value = clampedValue;
        }
        
        this.updateSkillValueDisplay(sliderId, clampedValue);
        this.updatePointsRemaining();
    }
    
    /**
     * Update skill value display text
     */
    updateSkillValueDisplay(sliderId, value) {
        const valueEl = document.getElementById(`skill-${sliderId}-value`);
        if (!valueEl) return;
        
        switch (sliderId) {
            case 'mass-driver':
                valueEl.textContent = `+${value} km/s`;
                break;
            case 'probe-dv':
                valueEl.textContent = `+${value} km/s, +${value * 100}s ISP`;
                break;
            case 'mining':
                valueEl.textContent = `+${value * 10} kg/day`;
                break;
            case 'replication':
                valueEl.textContent = `+${value * 5} kg/day`;
                break;
            case 'compute':
            case 'energy':
            case 'dexterity':
                valueEl.textContent = `+${value * 10}%`;
                break;
        }
    }
    
    /**
     * Update points remaining display
     */
    updatePointsRemaining() {
        const used = Object.values(this.skillPoints).reduce((a, b) => a + b, 0);
        const remaining = this.totalSkillPoints - used;
        
        const pointsEl = document.getElementById('points-remaining');
        if (pointsEl) {
            pointsEl.textContent = `${remaining} point${remaining !== 1 ? 's' : ''} remaining`;
            
            // Update styling
            pointsEl.classList.remove('warning', 'depleted');
            if (remaining === 0) {
                pointsEl.classList.add('depleted');
            } else if (remaining <= 2) {
                pointsEl.classList.add('warning');
            }
        }
        
        // Disable sliders at max if remaining is 0
        const sliderIds = ['mass-driver', 'probe-dv', 'mining', 'replication', 'compute', 'energy', 'dexterity'];
        sliderIds.forEach(id => {
            const slider = document.getElementById(`skill-${id}`);
            if (slider) {
                // Calculate max this slider can go
                const keyMap = {
                    'mass-driver': 'mass_driver',
                    'probe-dv': 'probe_dv',
                    'mining': 'mining',
                    'replication': 'replication',
                    'compute': 'compute',
                    'energy': 'energy',
                    'dexterity': 'dexterity'
                };
                const currentValue = this.skillPoints[keyMap[id]];
                slider.max = Math.min(10, currentValue + remaining);
            }
        });
    }
    
    /**
     * Start game with skill allocations
     */
    async startNewGameWithSkills() {
        // Calculate skill bonuses
        const skillBonuses = {
            mass_driver_dv_bonus: this.skillPoints.mass_driver * 1.0,   // km/s (1 km/s per skill point)
            probe_dv_bonus: this.skillPoints.probe_dv * 1.0,            // km/s (1 km/s per skill point)
            propulsion_isp_bonus: this.skillPoints.probe_dv * 100,      // seconds (100s ISP per skill point)
            mining_rate_bonus: this.skillPoints.mining * 10,           // kg/day bonus (base is 100 kg/day)
            replication_rate_bonus: this.skillPoints.replication * 5,  // kg/day bonus (base is 20 kg/day)
            compute_bonus: 1 + (this.skillPoints.compute * 0.1),       // Multiplier (1.0 + 10% per point)
            energy_bonus: 1 + (this.skillPoints.energy * 0.1),         // Multiplier
            dexterity_bonus: 1 + (this.skillPoints.dexterity * 0.1)    // Multiplier
        };
        
        await this.startNewGame(this.selectedDifficulty, this.selectedPlanet, skillBonuses);
    }
    
    hideGameMenu() {
        const menuModal = document.getElementById('game-menu-modal');
        if (menuModal) {
            menuModal.style.display = 'none';
        }
    }
    
    async loadGame(sessionId) {
        try {
            console.log('Loading game:', sessionId);

            // Show loading screen with loading message
            this.showLoadingScreen();
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) {
                const loadingText = loadingScreen.querySelector('.loading-status');
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

            // Get state and restore galaxy before showing
            const initialState = window.gameEngine.getGameState();
            if (initialState) {
                // Restore galaxy state if available
                if (initialState.galaxy && this.starMapVisualization) {
                    this.starMapVisualization.restoreGalaxyState(initialState.galaxy);
                }
            }

            // Show galaxy view WHILE loading screen is still visible
            console.log('[App] Loading in galaxy view');
            window.startInInterstellarMode = true;

            const showStarMap = async () => {
                for (let i = 0; i < 50; i++) {
                    if (this.starMapVisualization?.isInitialized) {
                        this.starMapVisualization.show();
                        console.log('[App] Galaxy view activated behind loading screen');
                        return true;
                    }
                    await new Promise(r => setTimeout(r, 100));
                }
                return false;
            };

            await showStarMap();

            // Now fade out loading screen - galaxy view is already visible underneath
            await this.fadeOutLoadingScreen(true);

            if (initialState) {
                this.updateUIPanels(initialState);
                this.updateVisualization(initialState);

                // Populate initial resource particles from saved state
                if (this.solarSystem && this.solarSystem.populateInitialParticles) {
                    this.solarSystem.populateInitialParticles(initialState);
                }
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
            window.toast?.error('Login failed: ' + error.message);
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
            window.toast?.error('Registration failed: ' + error.message);
        }
    }

    async startNewGame(difficulty = 'medium', startingPlanet = 'earth', skillBonuses = null) {
        const loadingScreen = document.getElementById('loading-screen');
        
        // Define difficulty configurations
        const difficultyConfigs = {
            interstellar: {
                initial_probes: 1e12,  // Trillion probes - ready for interstellar
                initial_metal: 1e12,
                initial_energy: 1e18,
                initial_structures: {
                    power_station: 10000,
                    data_center: 10000,
                    mass_driver: 1000,
                    factory: 1000
                },
                initial_zone_resources: {
                    methalox: 1e9
                },
                // Dyson sphere complete!
                initial_dyson_mass: 2e27,  // 100% complete Dyson sphere
                // Propulsion tier 14 = 1g Torch Drive (Antimatter-Catalyzed Fusion)
                propulsion_tier: 14,
                // All research trees at tier 14 (first 14 tiers completed with all 10 tranches each)
                initial_research_state: {
                    propulsion: {
                        raptor_3_engines: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        vacuum_rated_nozzles: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        ssto_propulsion: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        aerospike_engines: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        expander_cycle: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        dual_mode_propulsion: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    robotics: {
                        basic_manipulators: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        servo_actuators: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        hydraulic_systems: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        pneumatic_actuators: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        electric_motors: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        brushless_motors: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    materials: {
                        basic_alloys: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        steel_alloys: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        titanium_alloys: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        aluminum_alloys: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        carbon_composites: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        ceramic_composites: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    structures: {
                        basic_construction: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        modular_design: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        prefabrication: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        automated_assembly: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        additive_manufacturing: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        laser_sintering: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    generation: {
                        photovoltaic_cells: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        multi_junction_cells: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        concentrated_solar: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        solar_tracking: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        quantum_dot_solar: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        orbital_solar_arrays: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    storage_density: {
                        battery_banks: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        lithium_ion: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        supercapacitors: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        thermal_storage: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        compressed_air: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        flywheels: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    conversion: {
                        basic_generators: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        turbine_generators: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        thermoelectric: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        heat_pipes: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        radiators: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        vapor_chambers: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    transmission: {
                        microwave_beams: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        laser_beams: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        optical_resonance: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        plasma_conduits: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        superconducting_lines: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        quantum_entanglement: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    architecture: {
                        von_neumann_architecture: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        harvard_architecture: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        systolic_arrays: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        dataflow_architecture: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        neuromorphic_mesh: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        cellular_automata_fabric: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    processor: {
                        edge_compute: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        fpga_arrays: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        asic_interconnect: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        parallel_processors: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        vector_processors: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        neural_processors: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    memory: {
                        serial_data_bus: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        parallel_interconnect: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        dram_memory: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        sram_memory: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        flash_memory: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        optical_neural_interface: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    sensors: {
                        basic_sensors: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        enhanced_sensors: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        multi_spectral: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        radio_frequency_link: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        laser_communication: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        quantum_sensors: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    }
                }
            },
            easy: {
                initial_probes: 1000,
                initial_metal: 100,
                initial_energy: 100000,
                initial_structures: {
                    power_station: 10,
                    data_center: 10,
                    mass_driver: 2
                },
                initial_zone_resources: {
                    methalox: 1000
                },
                // All research trees at tier 5 (first 5 tiers completed with all 10 tranches each)
                initial_research_state: {
                    propulsion: {
                        raptor_3_engines: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        vacuum_rated_nozzles: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        ssto_propulsion: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        aerospike_engines: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        expander_cycle: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        dual_mode_propulsion: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    robotics: {
                        basic_manipulators: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        servo_actuators: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        hydraulic_systems: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        pneumatic_actuators: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        electric_motors: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        brushless_motors: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    materials: {
                        basic_alloys: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        steel_alloys: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        titanium_alloys: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        aluminum_alloys: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        carbon_composites: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        ceramic_composites: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    structures: {
                        basic_construction: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        modular_design: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        prefabrication: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        automated_assembly: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        additive_manufacturing: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        laser_sintering: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    generation: {
                        photovoltaic_cells: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        multi_junction_cells: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        concentrated_solar: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        solar_tracking: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        quantum_dot_solar: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        orbital_solar_arrays: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    storage_density: {
                        battery_banks: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        lithium_ion: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        supercapacitors: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        thermal_storage: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        compressed_air: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        flywheels: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    conversion: {
                        basic_generators: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        turbine_generators: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        thermoelectric: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        heat_pipes: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        radiators: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        vapor_chambers: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    transmission: {
                        microwave_beams: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        laser_beams: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        optical_resonance: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        plasma_conduits: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        superconducting_lines: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        quantum_entanglement: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    architecture: {
                        von_neumann_architecture: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        harvard_architecture: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        systolic_arrays: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        dataflow_architecture: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        neuromorphic_mesh: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        cellular_automata_fabric: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    processor: {
                        edge_compute: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        fpga_arrays: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        asic_interconnect: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        parallel_processors: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        vector_processors: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        neural_processors: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    memory: {
                        serial_data_bus: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        parallel_interconnect: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        dram_memory: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        sram_memory: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        flash_memory: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        optical_neural_interface: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    },
                    sensors: {
                        basic_sensors: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        enhanced_sensors: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        multi_spectral: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        radio_frequency_link: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        laser_communication: { tranches_completed: 10, progress: 0, enabled: false, completed: true },
                        quantum_sensors: { tranches_completed: 0, progress: 0, enabled: true, completed: false }
                    }
                }
            },
            medium: {
                initial_probes: 10,
                initial_metal: 100,
                initial_energy: 100000,
                initial_structures: {
                    power_station: 2,
                    data_center: 2
                },
                initial_zone_resources: {
                    methalox: 200
                }
            },
            hard: {
                initial_probes: 1,
                initial_metal: 100,
                initial_energy: 100000,
                initial_structures: {}
            }
        };
        
        const baseConfig = difficultyConfigs[difficulty] || difficultyConfigs.medium;
        
        // Apply starting planet
        const config = {
            ...baseConfig,
            default_zone: startingPlanet,
            initial_structures: {
                [startingPlanet]: baseConfig.initial_structures
            }
        };
        
        // Apply skill bonuses if provided
        if (skillBonuses) {
            config.skill_bonuses = skillBonuses;
        }
        
        try {
            console.log(`Starting new game (${difficulty} mode)...`);
            
            // Stop any existing game engine first
            if (window.gameEngine && window.gameEngine.isRunning) {
                console.log('Stopping existing game engine...');
                window.gameEngine.stop();
                // Wait a moment for cleanup
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Reset galaxy view state for new game
            if (this.starMapVisualization && this.starMapVisualization.resetToNewGame) {
                console.log('Resetting galaxy view for new game...');
                this.starMapVisualization.resetToNewGame();
            }
            
            // Hide game menu and show loading screen
            this.hideGameMenu();
            this.showLoadingScreen();
            if (loadingScreen) {
                const loadingText = loadingScreen.querySelector('.loading-status');
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
                const response = await api.startGame({ difficulty, ...config });
                if (response && response.session_id) {
                    sessionId = response.session_id;
                    console.log('Backend session created:', sessionId);
                }
            } catch (apiError) {
                console.warn('Failed to create backend session (game will run locally):', apiError);
                // Use the generated local session ID
                sessionId = newSessionId;
            }
            
            // Start local game engine with unique session ID and difficulty config
            await window.gameEngine.start(sessionId, config);
            
            // Update loading message
            if (loadingScreen) {
                const loadingText = loadingScreen.querySelector('.loading-status');
                if (loadingText) loadingText.textContent = 'Loading galaxy...';
            }

            // IMPORTANT: Show galaxy view WHILE loading screen is still visible as overlay
            // This ensures galaxy view is ready before loading screen fades out
            console.log('[App] Starting in galaxy view');
            window.startInInterstellarMode = true;

            // Wait for star map to be ready and show it (behind the loading screen)
            const showStarMap = async () => {
                // Wait up to 5 seconds for star map to initialize
                for (let i = 0; i < 50; i++) {
                    if (this.starMapVisualization?.isInitialized) {
                        this.starMapVisualization.show();
                        console.log('[App] Galaxy view activated behind loading screen');
                        return true;
                    }
                    await new Promise(r => setTimeout(r, 100));
                }
                console.warn('[App] Star map failed to initialize');
                return false;
            };

            await showStarMap();

            // Now fade out loading screen - galaxy view is already visible underneath
            await this.fadeOutLoadingScreen(true);

            // Display initial game state
            const initialState = window.gameEngine.getGameState();
            if (initialState) {
                this.updateUIPanels(initialState);
                this.updateVisualization(initialState);

                // Populate initial resource particles from starting state
                // This is especially useful for endgame difficulty which has pre-existing resources
                if (this.solarSystem && this.solarSystem.populateInitialParticles) {
                    this.solarSystem.populateInitialParticles(initialState);
                }
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
                
                // Check for game completion (only trigger once)
                if (gameState.dyson_sphere?.progress >= 1.0 && !this._gameCompleted) {
                    this._gameCompleted = true;
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
        // Expose probePanel globally for onclick handlers
        if (this.probePanel) {
            window.probePanel = this.probePanel;
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
        if (this.summaryPlotPanel) {
            this.summaryPlotPanel.update(gameState);
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

        // Ensure loading screen is hidden (in case it was shown during error)
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('fade-out');
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

        // Skip Sol system animation when galaxy view is active
        if (this.starMapVisualization?.isActive) {
            return;
        }

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

        // Update Dyson sphere visualization orbital positions
        if (this.dysonViz) {
            this.dysonViz.update(deltaTime);
        }

        // Update structures visualization
        if (this.structuresViz) {
            const gameState = window.gameEngine?.getGameState();
            this.structuresViz.update(baseDeltaTime, gameState); // Pass gameState for depletion checking
        }

        // Animate transfer dots smoothly every frame (60fps)
        // This provides smooth motion between game state updates
        if (this.transferViz) {
            this.transferViz.animate(baseDeltaTime);
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});

