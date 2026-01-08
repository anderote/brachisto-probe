/**
 * Interstellar Star Map Visualization
 *
 * A separate 3D view showing the 10 nearby star systems
 * with a volumetric Milky Way background.
 */

class StarMapVisualization {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.container = null;

        // Star objects
        this.stars = {};
        this.starLabels = {};
        this.starData = null;
        this.selectedStar = null;

        // Milky Way background
        this.milkyWayParticles = null;
        this.dustClouds = [];
        this.backgroundStars = null;

        // Animation
        this.animationId = null;
        this.time = 0;

        // State
        this.isActive = false;
        this.isInitialized = false;  // True after init() completes
        this.initPromise = null;     // Promise that resolves when init completes
        this.galaxySystem = null;
        this.focusedOnSol = false;   // True when camera is focused on Sol

        // COLONIZATION SYSTEM - jagged frontier with individual stars
        this.colonizedStars = [];           // Array of colonized star data objects
        this.colonizedStarsPositions = [];  // Float array for Points positions
        this.colonizedStarsColors = [];     // Float array for Points colors
        this.colonizedStarsPoints = null;   // THREE.Points for rendering all colonized stars
        this.colonizedConnections = [];     // Lines between colonized stars
        this.probeFleets = [];              // Active probe fleet animations
        this.trailRemnants = [];            // Fading trail remnants from completed probes
        this.outposts = [];                 // Auto-generated strategic outposts
        this.outpostCapacities = {};        // outpostId -> accumulated launch capacity

        // Fleet View Mode
        this.fleetViewMode = false;         // Whether fleet view is active
        this.trackedFleet = null;           // Currently tracked fleet
        this.trackedFleetIndex = 0;         // Index in probeFleets array
        this.lastArrivedStar = null;        // Star to stay focused on after fleet arrives

        // SIMPLE Camera System - just follow a mesh or stay put
        this.followTarget = null;           // THREE.Object3D to follow (e.g., solMesh)
        this.cameraOffset = new THREE.Vector3(0, 5, 15);  // Offset from target
        this.cameraAnimating = false;

        // WASD Flying System
        this.keysPressed = new Set();       // Currently held keys
        this.flySpeed = 2.0;                // Base flying speed (units per frame)

        // Reusable raycaster for click detection (avoid per-click allocations)
        this.raycaster = new THREE.Raycaster();
        this.raycasterMouse = new THREE.Vector2();

        // Reusable vectors for WASD flying (avoid per-frame allocations)
        this._flyForward = new THREE.Vector3();
        this._flyRight = new THREE.Vector3();
        this._flyMovement = new THREE.Vector3();
        this._flyTemp = new THREE.Vector3();

        // POA (Points of Attraction) System
        this.pointsOfAttraction = [];       // Named stars with bonuses
        this.selectedPOA = null;            // Currently selected POA (for spacebar shortcut)
        this.empireBonuses = {              // Empire-wide bonuses from colonized POAs
            production: 1.0,                // Multiplier for production rate
            dyson_efficiency: 1.0,          // Multiplier for Dyson energy
            launch_efficiency: 1.0,         // Multiplier for launch cooldown (lower = faster)
            development_speed: 1.0,         // Multiplier for star development
            research: 0,                    // Accumulated research points
            // === EXOTIC BONUSES (from far halo objects) ===
            probe_velocity: 1.0,            // Multiplier for probe travel speed
            expansion_radius: 1.0,          // Multiplier for max probe range
            auto_develop_chance: 0,         // Chance new colonies auto-develop (0-1)
            stellar_forge_mult: 1.0,        // Multiplier applied to ALL other bonuses
            dark_energy_tap: 0,             // Flat energy bonus per tick
            wormhole_network: 0,            // Number of wormhole connections unlocked
            time_dilation: 1.0,             // Local time speed multiplier
            exotic_matter: 0                // Exotic matter reserves for special builds
        };
        this.targetQueue = [];              // Queue of up to 5 priority targets
        this.queueMarkers = [];             // Visual markers for queued targets

        // Strategy Panel policies (hierarchical)
        this.buildExpandBalance = 65;      // 0=all build, 100=all expand (default favors expansion)
        this.buildPolicy = 50;             // 0=all Dyson, 100=all Production
        this.expandPolicy = 50;            // 0=Exploit (nearest star), 100=Explore (step-distance away)
        this.hopDistancePolicy = 58;       // 0=Short hops (10 ly), 100=Long hops (100k ly) - log scale, 58 ≈ 2 kly
        this.strategyPanelVisible = false; // Strategy panel visibility

        // Historical data for metrics graphs (time-series)
        this.metricsHistory = {
            timestamps: [],           // Game time values
            colonizedCount: [],       // Number of colonies
            frontierRadius: [],       // Max distance from Sol
            productionTotal: [],      // Total production units
            dysonTotal: [],           // Total Dyson units
            launchRate: [],           // Probes launched per time period
            poaCount: []              // POAs colonized
        };
        this.lastMetricsUpdate = 0;
        this.metricsUpdateInterval = 100;  // Update every 100 game time units (~27 years)
        this.maxHistoryLength = 200;       // Keep last 200 data points

        // Legacy - keep for backward compatibility
        this.expansionAllocation = 50;      // Will be derived from buildExpandBalance + buildPolicy

        // Time progression: 1 week per 1 real second at 1x speed
        // 7 days / 60 frames = 0.1167 days per frame
        this.daysPerFrame = 7 / 60;  // Exactly 1 week per second at 60fps
        this.timeSpeedMultiplier = 1;  // User-controlled speed (1x, 10x, 100x, 1000x)

        // GALAXY SCALE RATIO: 120,000 dots represent 400 billion stars
        this.GALAXY_TOTAL_STARS = 400e9;    // 400 billion stars in Milky Way
        this.GALAXY_DRAWN_DOTS = 120000;    // Number of dots we actually draw
        this.STARS_PER_DOT = this.GALAXY_TOTAL_STARS / this.GALAXY_DRAWN_DOTS;  // ~3.33 million stars per dot

        // Spectral type distribution and average luminosity (in solar luminosities)
        // Based on realistic main sequence population
        this.SPECTRAL_DATA = {
            O: { fraction: 0.000003, avgLuminosity: 10000 },  // Extremely rare, brilliant
            B: { fraction: 0.0013,   avgLuminosity: 25 },     // Very rare, very bright
            A: { fraction: 0.006,    avgLuminosity: 5 },      // Uncommon, bright
            F: { fraction: 0.03,     avgLuminosity: 1.5 },    // Fairly common
            G: { fraction: 0.076,    avgLuminosity: 0.8 },    // Sun-like
            K: { fraction: 0.121,    avgLuminosity: 0.15 },   // Common, dimmer
            M: { fraction: 0.7657,   avgLuminosity: 0.005 }   // Most common, very dim (red dwarfs)
        };

        // Real Milky Way luminosity: ~2.5 × 10^10 L☉
        // This accounts for the fact that most stars are dim M-dwarfs
        this.GALAXY_TOTAL_LUMINOSITY = 2.5e10;  // Solar luminosities

        // Total galaxy power in watts
        this.GALAXY_TOTAL_POWER = this.GALAXY_TOTAL_LUMINOSITY * 3.828e26;  // ~9.6e36 W

        // Average luminosity per star (weighted by population)
        // 2.5e10 L☉ / 4e11 stars = 0.0625 L☉ average
        this.AVG_STAR_LUMINOSITY = this.GALAXY_TOTAL_LUMINOSITY / this.GALAXY_TOTAL_STARS;

        this.dotsColonized = 1;             // Actual dots (meshes) colonized
        this.starsInfluenced = this.STARS_PER_DOT; // Real star count (starts with Sol's dot worth)
        this.dysonConversionRate = 0;       // % of stars with Dyson spheres
        this.dotsWithDyson = 0;             // Dots that have Dyson complete
        this.starsWithDyson = 0;            // Real star count with Dyson

        // Camera tracking
        this.cameraOffset = { x: 5, y: 30, z: 40 };  // Offset from Sol

        // Star colors by spectral type (realistic)
        this.spectralColors = {
            'O': 0x9bb0ff,  // Blue
            'B': 0xaabfff,  // Blue-white
            'A': 0xcad7ff,  // White
            'F': 0xf8f7ff,  // Yellow-white
            'G': 0xfff4ea,  // Yellow (like our Sun)
            'K': 0xffd2a1,  // Orange
            'M': 0xffcc6f,  // Red-orange
            'D': 0xaaaaff,  // White dwarf (pale blue-white)
            'N': 0xff6b35   // Nebula/dust cloud (orange-red)
        };

        // Drive System - constant velocity probes (optimized for gameplay)
        // Tier 1: 10 min to cross galaxy, Tier 10: 30 sec to cross galaxy
        this.starshipDrives = null;           // Loaded from starship_drives.json

        // Star size multipliers by spectral type (visual, not to scale)
        this.spectralSizes = {
            'O': 2.5,
            'B': 2.0,
            'A': 1.8,
            'F': 1.4,
            'G': 1.2,
            'K': 1.0,
            'M': 0.7,
            'D': 0.5,  // White dwarf (small, dense)
            'N': 1.5   // Nebula/dust cloud
        };

        // Cumulative distribution for random spectral type assignment
        // Based on SPECTRAL_DATA fractions
        this.spectralCDF = [
            { type: 'O', cumulative: 0.000003 },
            { type: 'B', cumulative: 0.001303 },
            { type: 'A', cumulative: 0.007303 },
            { type: 'F', cumulative: 0.037303 },
            { type: 'G', cumulative: 0.113303 },
            { type: 'K', cumulative: 0.234303 },
            { type: 'M', cumulative: 1.0 }
        ];

        // EVA-styled strategy panels
        this.driveResearchPanel = null;
        this.stellarCensusPanel = null;
        this.panelContainers = {};
        this.activePanelId = null;  // Currently open panel ('drive', 'census', null)
    }

    /**
     * Initialize the star map view
     * @param {Object} starData - nearby_stars.json data
     * @param {GalaxySystem} galaxySystem - Galaxy system manager
     */
    init(starData, galaxySystem) {
        console.log('[StarMap] Initializing with', starData?.stars?.length || 0, 'stars');

        try {
            this.starData = starData;
            this.galaxySystem = galaxySystem;

            // Check for app container
            const appContainer = document.getElementById('app');
            if (!appContainer) {
                console.error('[StarMap] Could not find #app container');
                return;
            }

            // Create container
            this.container = document.createElement('div');
            this.container.id = 'star-map-container';
            this.container.className = 'star-map-container';
            this.container.style.display = 'none';
            appContainer.appendChild(this.container);
            console.log('[StarMap] Container created and appended');

            // Check for THREE.js
            if (typeof THREE === 'undefined') {
                console.error('[StarMap] THREE.js not loaded');
                return;
            }

            // Create Three.js scene
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x000008);

            // Camera - needs large far plane for galaxy scale
            this.camera = new THREE.PerspectiveCamera(
                60,
                window.innerWidth / window.innerHeight,
                0.01,
                5000  // Far enough to see entire galaxy and halo
            );

            // Start camera looking at the local cluster from a good viewing angle
            // We'll position it after creating the Milky Way so we know Sol's position
            this.initialCameraDistance = 30;  // Start zoomed into local cluster

            // Renderer
            this.renderer = new THREE.WebGLRenderer({ antialias: true });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.container.appendChild(this.renderer.domElement);

            // Create the IMMERSIVE galaxy - you are inside it
            console.log('[StarMap] Creating immersive galaxy...');
            this.createMilkyWayBackground();
            this.createDistantGalaxies();  // Extragalactic background

            // Camera starts near Sol, looking at the galactic center
            // This gives an immersive "inside the galaxy" feeling
            const solPos = this.solPosition || { x: 50, y: 0, z: 50 };
            this.camera.position.set(
                solPos.x + 5,
                solPos.y + 30,  // Above the galactic plane for overview
                solPos.z + 40
            );
            this.camera.lookAt(0, 0, 0);  // Look toward galactic center

            // Controls - can orbit anywhere in the galaxy
            if (typeof THREE.OrbitControls !== 'undefined') {
                this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
                this.controls.enableDamping = true;
                this.controls.dampingFactor = 0.05;
                this.controls.zoomSpeed = 4.0;       // Fast zoom
                this.controls.minDistance = 2;       // Close to individual stars
                this.controls.maxDistance = 1200;    // See full galaxy and halo
                this.controls.target.set(solPos.x, solPos.y, solPos.z);  // Start orbiting Sol
                this.controls.update();
                console.log('[StarMap] Galaxy view initialized, Sol at', solPos);
            } else {
                console.warn('[StarMap] OrbitControls not available');
            }

            // Create UI elements for the galaxy view
            console.log('[StarMap] Creating galaxy UI...');
            this.createKardashevResourceBar();
            this.createGalaxyStatsPanel();
            this.createGalacticCoordinatesDisplay();

            // Load saved strategy settings
            this.loadStrategySettings();

            // Handle resize
            window.addEventListener('resize', () => this.onResize());

            // Click handler for selecting POAs and stars
            this.renderer.domElement.addEventListener('click', (e) => this.onStarClick(e));

            // Keyboard shortcuts for galaxy view
            this.setupKeyboardShortcuts();

            // Initialize line visibility toggle
            this.linesVisible = true;

            console.log('[StarMap] Galaxy view initialized - press I to toggle, Tab to toggle lines');

            // Mark as initialized
            this.isInitialized = true;

            // Check if we should start in interstellar mode
            if (window.startInInterstellarMode) {
                console.log('[StarMap] Starting in interstellar mode');
                window.startInInterstellarMode = false;  // Reset flag
                this.show();
            }
        } catch (error) {
            console.error('[StarMap] Error during initialization:', error);
            // Reset container if init failed partway through
            this.container = null;
            this.isInitialized = false;
        }
    }

    // ========================================================================
    // GALAXY VISUALS METHODS - See star_map_galaxy.js
    // Methods: createMilkyWayBackground, createGalacticCore, createSpiralArms,
    //          createSpiralArmStars, createArmDustLanes, addArmNebulae,
    //          createGalacticBulge, createGalacticHalo, createGalacticDisk,
    //          createDustLanes, createHIIRegions, createDarkMatterNebulae
    // ========================================================================


    /**
     * Initialize the colonization frontier system
     * Shows individual colonized stars with connections
     */
    initColonizationSystem() {
        // Initialize colonization targets array if not already done
        if (!this.colonizationTargets) {
            this.colonizationTargets = [];
        }

        // Group for all colonization visuals
        this.colonizationGroup = new THREE.Group();
        this.colonizationGroup.position.copy(this.solMesh.position);
        this.galaxyGroup.add(this.colonizationGroup);

        // Sol is the first colonized star - starts with 1 stellar mass (100 units)
        const solStar = this.addColonizedStar(0, 0, 0, 100, 'G');  // Sol at origin, G-type star

        // Initialize Sol with 1 stellar mass (100 units total)
        // Start production-heavy for active early game: 30 dyson + 70 production
        if (solStar) {
            solStar.dysonUnits = 30;       // Some for Dyson/research
            solStar.productionUnits = 70;  // Most for probe production
            // Sol is special: always 1/year launch rate regardless of production
            solStar.nextLaunchTime = this.time + this.getExponentialDelay(70, true);  // isSol=true

            // Update Sol's color to match its G-type star
            const colorHex = this.getStarColor(100, 50, 'G');
            const colorObj = new THREE.Color(colorHex);
            this.colonizedStarsColors[0] = colorObj.r;
            this.colonizedStarsColors[1] = colorObj.g;
            this.colonizedStarsColors[2] = colorObj.b;
            this.rebuildColonizedStarsGeometry();

            console.log('[StarMap] Sol initialized with 1 stellar mass: 30 dyson, 70 production units');
        }

        // Add Sol to colonization targets and mark it colonized
        const solTarget = {
            x: this.solPosition.x,
            y: this.solPosition.y,
            z: this.solPosition.z,
            colonized: true,
            starData: solStar
        };
        this.colonizationTargets.unshift(solTarget);  // Add at beginning
        if (solStar) {
            solStar.targetData = solTarget;  // Link star data to target
        }

        // Store current policy (will be updated by UI)
        this.expansionPolicy = { exploit: 50, explore: 30, consolidate: 20 };

        // Sol starts fully developed (100 units), so count it
        this.starsWithDyson = 1;
        this.dotsWithDyson = 1;

        // Initialize nearby POAs (Points of Attraction)
        this.initializeNearbyPOAs();

        // DEBUG: Log initialization state
        console.log('[StarMap] initColonizationSystem complete:',
            '\n  colonizedStars:', this.colonizedStars.length,
            '\n  Sol production:', this.colonizedStars[0]?.productionUnits,
            '\n  Sol dyson:', this.colonizedStars[0]?.dysonUnits,
            '\n  colonizationTargets:', this.colonizationTargets?.length,
            '\n  POAs:', this.pointsOfAttraction?.length,
            '\n  solPosition:', this.solPosition?.x?.toFixed(2), this.solPosition?.y?.toFixed(2), this.solPosition?.z?.toFixed(2));

        // Probe launches are now entirely probabilistic based on production units
        // No forced initial launch - Sol's production will naturally trigger launches
    }

    // ========================================================================
    // POA SYSTEM METHODS - See star_map_poa.js
    // Methods: initializeNearbyPOAs, initializeDeepSkyPOAs, initializeHaloObjects,
    //          createFranchiseCluster, discoverFranchise, showFranchiseDiscoveryNotification,
    //          checkFranchiseDiscovery, hashStringToAngle, createPOAMarkers, createPOALabels,
    //          refreshPOAMarkers, updatePOALabels, createDeepSkyMarker, launchInitialProbe
    // ========================================================================


    // ========================================================================
    // QUEUE & POA INTERACTION METHODS - See star_map_queue.js
    // Methods: showConquestNotification, showSectorNotification, navigateCameraTo,
    //          applyPOABonus, checkPioneerColony, createNewSector, createPOAMarkerForPioneer,
    //          onPOAColonized, removeCorridorByPOA, addToTargetQueue, interceptProbeForTarget,
    //          removeFromTargetQueue, createQueueMarker, removeQueueMarker, refreshQueueMarkers,
    //          updateQueueButton, updateTargetQueueDisplay, navigateAndShowPOA, showPOAInfo,
    //          closePOAInfo, addPOAToQueueAndRefresh, addPOAToTargetQueue, navigateToPOA,
    //          moveCameraToTargetWithZoom, getQueuedTargetInRange
    // ========================================================================


    /**
     * Add a colonized star to the frontier
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} z - Z position
     * @param {number} initialUnits - Initial development 0-100
     * @param {string} spectralClass - Spectral type (O/B/A/F/G/K/M)
     */
    addColonizedStar(x, y, z, initialUnits = 0, spectralClass = null) {
        // 100-UNIT STAR MODEL:
        // Each star has max 100 units total, split between Dyson and Production
        // dysonUnits: Power generation capability
        // productionUnits: Probe manufacturing capability
        // Units are allocated based on the expansion slider when the star develops

        // Assign spectral class if not provided (random based on distribution)
        const starSpectralClass = spectralClass || this.getRandomSpectralType();

        // For backward compatibility, initialUnits represents total development
        // Split based on current policy
        const expansionRate = (this.expansionAllocation || 50) / 100;
        const initialDyson = Math.round(initialUnits * (1 - expansionRate));
        const initialProduction = Math.round(initialUnits * expansionRate);

        // Get color based on spectral class (different green shades)
        const totalUnits = initialDyson + initialProduction;
        const colorHex = this.getStarColor(totalUnits, initialDyson, starSpectralClass);
        const colorObj = new THREE.Color(colorHex);

        // Add position to arrays
        this.colonizedStarsPositions.push(x, y, z);

        // Add color to arrays (RGB normalized 0-1)
        this.colonizedStarsColors.push(colorObj.r, colorObj.g, colorObj.b);

        // Store star data object for tracking
        const starData = {
            index: (this.colonizedStarsPositions.length / 3) - 1,
            position: new THREE.Vector3(x, y, z),
            spectralClass: starSpectralClass,    // Store spectral type
            dysonUnits: initialDyson,        // 0-100: Power generation units
            productionUnits: initialProduction, // 0-100: Probe production units
            addedTime: this.time,
            lastLaunchTime: this.time - 10,  // Slight head start on cooldown - ready to launch soon
            probesLaunched: 0,  // Total probes launched from this star
            nextLaunchTime: this.time + this.getExponentialDelay(initialProduction)  // When next probe launches
        };

        this.colonizedStars.push(starData);

        // Rebuild Points geometry
        this.rebuildColonizedStarsGeometry();

        // Connect to nearest colonized star
        if (this.colonizedStars.length > 1) {
            this.connectToNearestStar(starData);
        }

        // Check if this colonization discovers any new franchises
        if (this.checkFranchiseDiscovery) {
            this.checkFranchiseDiscovery(starData.position);
        }

        return starData;
    }

    /**
     * Rebuild the colonized stars Points geometry
     * Called after adding stars or updating colors
     */
    rebuildColonizedStarsGeometry() {
        // Remove old Points if exists
        if (this.colonizedStarsPoints) {
            this.colonizationGroup.remove(this.colonizedStarsPoints);
            this.colonizedStarsPoints.geometry.dispose();
            this.colonizedStarsPoints.material.dispose();
        }

        if (this.colonizedStarsPositions.length === 0) return;

        // Create new geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position',
            new THREE.Float32BufferAttribute(this.colonizedStarsPositions, 3));
        geometry.setAttribute('color',
            new THREE.Float32BufferAttribute(this.colonizedStarsColors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.6,              // Larger than galaxy stars (0.4) to dominate
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 1.0,
            depthTest: false        // Always render on top of galaxy stars (fixes flickering)
        });

        this.colonizedStarsPoints = new THREE.Points(geometry, material);
        this.colonizedStarsPoints.renderOrder = 10;  // Render after galaxy stars
        if (this.colonizationGroup) {
            this.colonizationGroup.add(this.colonizedStarsPoints);
        }
    }

    /**
     * Get color based on star spectral type
     * Different spectral classes get different green shades
     * Red dwarfs (M) are dim green, hot stars (O/B/A) are bright green
     */
    getStarColor(totalUnits, dysonUnits = 0, spectralClass = 'G') {
        // Different green shades by spectral class - ALL colonized objects show as green
        // Hot/rare stars are bright cyan-green, common red dwarfs are dim green
        // White dwarfs and nebulae also green when colonized
        const spectralGreens = {
            O: 0x44ffcc,  // Bright cyan-green (very rare, very luminous)
            B: 0x33ffaa,  // Bright cyan-green
            A: 0x22ff88,  // Bright green
            F: 0x11ee77,  // Medium-bright green
            G: 0x00dd66,  // Medium green (sun-like)
            K: 0x00bb55,  // Slightly dimmer green (orange dwarfs)
            M: 0x008844,  // Dim/faint green (red dwarfs - most common)
            D: 0x004422,  // Dark green (white dwarfs - faint/compact)
            N: 0x66ff88   // Bright mint green (nebulae - gas clouds)
        };
        return spectralGreens[spectralClass] || spectralGreens.G;
    }

    /**
     * Backward compatibility wrapper
     */
    getDysonColor(progress) {
        return this.getStarColor(progress, progress);
    }

    /**
     * Develop a star by adding units based on current policy
     * @param {Object} star - Star data object
     * @param {number} unitsToAdd - How many units to develop
     */
    developStar(star, unitsToAdd = 1) {
        const currentTotal = (star.dysonUnits || 0) + (star.productionUnits || 0);
        if (currentTotal >= 100) return; // Already fully developed

        // Explore/Exploit policy controls BOTH:
        // 1. Development priority: Dyson (exploit) vs Production (explore)
        // 2. Target selection: nearest star (exploit) vs step-distance away (explore)
        const exploreFactor = (this.expandPolicy || 50) / 100;
        const actualUnits = Math.min(unitsToAdd, 100 - currentTotal);

        // Allocate to dyson and production based on explore/exploit policy
        const newProduction = actualUnits * exploreFactor;
        const newDyson = actualUnits * (1 - exploreFactor);

        star.productionUnits = (star.productionUnits || 0) + newProduction;
        star.dysonUnits = (star.dysonUnits || 0) + newDyson;

        // Update color based on spectral type
        const totalUnits = star.dysonUnits + star.productionUnits;
        const colorHex = this.getStarColor(totalUnits, star.dysonUnits, star.spectralClass);
        const colorObj = new THREE.Color(colorHex);

        // Update color at the star's index position
        const colorIndex = star.index * 3;
        this.colonizedStarsColors[colorIndex] = colorObj.r;
        this.colonizedStarsColors[colorIndex + 1] = colorObj.g;
        this.colonizedStarsColors[colorIndex + 2] = colorObj.b;

        // Update the Points geometry color attribute
        if (this.colonizedStarsPoints && this.colonizedStarsPoints.geometry) {
            const colorAttr = this.colonizedStarsPoints.geometry.getAttribute('color');
            if (colorAttr) {
                colorAttr.setXYZ(star.index, colorObj.r, colorObj.g, colorObj.b);
                colorAttr.needsUpdate = true;
            }
        }

        return actualUnits;
    }

    /**
     * Backward compatibility wrapper for updateStarDyson
     */
    updateStarDyson(star, newProgress) {
        // Convert old dysonProgress to new unit system
        const currentTotal = (star.dysonUnits || 0) + (star.productionUnits || 0);
        const targetTotal = newProgress;
        if (targetTotal > currentTotal) {
            this.developStar(star, targetTotal - currentTotal);
        }
    }

    /**
     * Get histogram data of stars by total development
     */
    getDysonHistogram() {
        // 10 buckets: 0-10%, 10-20%, ... 90-100% (100% inclusive in last bucket)
        const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

        for (const star of this.colonizedStars) {
            // Use total units (dyson + production) for development level
            const totalUnits = (star.dysonUnits || 0) + (star.productionUnits || 0);
            // Bucket 0: 0-9, Bucket 1: 10-19, ... Bucket 9: 90-100 (inclusive)
            const bucket = Math.min(9, Math.floor(totalUnits / 10));
            buckets[bucket]++;
        }

        // Debug: log histogram on first call and periodically
        if (!this._histogramLogCount) this._histogramLogCount = 0;
        this._histogramLogCount++;
        if (this._histogramLogCount <= 3 || this._histogramLogCount % 60 === 0) {
            console.log('[StarMap] Histogram:', buckets.join(', '), 'Total stars:', this.colonizedStars.length);
        }

        return buckets;
    }

    /**
     * Get total star units across all stars
     */
    getTotalStarUnits() {
        let totalDyson = 0;
        let totalProduction = 0;

        for (const star of this.colonizedStars) {
            totalDyson += star.dysonUnits || 0;
            totalProduction += star.productionUnits || 0;
        }

        return { dyson: totalDyson, production: totalProduction, total: totalDyson + totalProduction };
    }

    /**
     * Connect a new star to its nearest colonized neighbor
     * Lines fade out over time to reduce visual clutter
     */
    connectToNearestStar(newStar) {
        let nearestDist = Infinity;
        let nearestStar = null;

        for (const star of this.colonizedStars) {
            if (star === newStar) continue;
            const dist = newStar.position.distanceTo(star.position);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestStar = star;
            }
        }

        if (nearestStar) {
            const lineGeometry = new THREE.BufferGeometry().setFromPoints([
                newStar.position.clone(),
                nearestStar.position.clone()
            ]);
            const lineMaterial = new THREE.LineBasicMaterial({
                color: 0x00ff88,
                transparent: true,
                opacity: 0.6        // Brighter lines (was 0.4)
            });
            const line = new THREE.Line(lineGeometry, lineMaterial);

            // Track creation time for fading
            // 1 time unit ≈ 1 day, so 36500 = ~100 years
            line.userData = {
                createdTime: this.time,
                fadeStartTime: 18250,   // Start fading after ~50 years
                fadeDuration: 18250,    // Fully faded over ~50 more years (100 years total)
                initialOpacity: 0.6     // Match material opacity
            };

            // Respect current lines visibility setting
            line.visible = this.linesVisible !== false;

            this.colonizedConnections.push(line);
            this.colonizationGroup.add(line);
        }
    }

    /**
     * Create an outpost at a colonized star
     * Outposts serve as strategic launch points for colonization waves
     */
    createOutpost(star) {
        const outpostId = `outpost_${this.outposts.length + 1}`;

        // Create visual marker - larger, distinct from regular stars
        const markerGeometry = new THREE.OctahedronGeometry(0.4, 0);
        const markerMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.9
        });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.copy(star.position);

        // Add rotating ring around outpost
        const ringGeometry = new THREE.RingGeometry(0.5, 0.55, 16);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        marker.add(ring);

        // Add glow halo
        const glowGeometry = new THREE.SphereGeometry(0.7, 8, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        marker.add(glow);

        this.colonizationGroup.add(marker);

        const outpost = {
            id: outpostId,
            position: star.position.clone(),
            starMesh: star,
            marker: marker,
            createdAt: this.time,
            waveRadius: 80,  // Range for wave colonization
            isActive: true,
            lastWaveTime: this.time
        };

        this.outposts.push(outpost);
        console.log(`[StarMap] Created ${outpostId} at star #${this.colonizedStars.indexOf(star)} - Total outposts: ${this.outposts.length}`);

        return outpost;
    }

    /**
     * Check if a new outpost should be created at a milestone
     * Creates outpost every 100 colonized stars
     */
    checkOutpostMilestone() {
        const colonizedCount = this.colonizedStars.length;
        const milestonesReached = Math.floor(colonizedCount / 100);
        const currentOutposts = this.outposts.length;

        if (milestonesReached > currentOutposts) {
            // Find the best star for an outpost - closest to galactic center
            // among recently colonized stars (frontier)
            const recentStars = this.colonizedStars.slice(-50);  // Last 50 colonized
            let bestStar = null;
            let bestScore = -Infinity;

            for (const star of recentStars) {
                // Score: prefer stars closer to center, away from existing outposts
                const distFromCenter = star.position.length();
                const centerScore = 100 - distFromCenter;  // Closer to center = higher score

                // Penalty for being too close to existing outposts
                let outpostPenalty = 0;
                for (const outpost of this.outposts) {
                    const distToOutpost = star.position.distanceTo(outpost.position);
                    if (distToOutpost < 30) {
                        outpostPenalty += (30 - distToOutpost);
                    }
                }

                const score = centerScore - outpostPenalty;
                if (score > bestScore) {
                    bestScore = score;
                    bestStar = star;
                }
            }

            if (bestStar) {
                this.createOutpost(bestStar);
            }
        }
    }

    /**
     * Update colonization waves from outposts
     * Uses capacity-based system: outposts accumulate launch capacity based on expansion allocation
     */
    updateOutpostWaves() {
        // Capacity rate based on expansion allocation (0-100)
        // Higher expansion = faster capacity accumulation
        const expansionRate = this.expansionAllocation / 100;
        const capacityPerTick = 10 * expansionRate;  // 0-10 per tick
        const waveLaunchCost = 100;  // Capacity required to launch a wave

        // Use hop distance policy for wave radius (respects player's hop setting)
        // Convert target hop distance (ly) to units
        const targetHopLY = this.getAverageHopDistanceLY();
        const hopRangeUnits = targetHopLY / 326;
        // Use 2x hop distance as max wave range (gives some flexibility)
        const maxWaveRadius = Math.max(hopRangeUnits * 2, 10);  // Min 10 units

        for (const outpost of this.outposts) {
            if (!outpost.isActive) continue;

            // Initialize capacity if not exists
            if (this.outpostCapacities[outpost.id] === undefined) {
                this.outpostCapacities[outpost.id] = 0;
            }

            // Accumulate capacity (more outposts = parallel accumulation benefit)
            this.outpostCapacities[outpost.id] += capacityPerTick;

            // Check if we have enough capacity to launch a wave
            if (this.outpostCapacities[outpost.id] >= waveLaunchCost) {
                // Find nearby uncolonized targets within hop range
                const nearbyTargets = this.findUncolonizedInRadius(
                    outpost.position.x,
                    outpost.position.y,
                    outpost.position.z,
                    Math.min(outpost.waveRadius, maxWaveRadius)  // Respect hop policy
                );

                if (nearbyTargets.length > 0) {
                    // Consume capacity
                    this.outpostCapacities[outpost.id] -= waveLaunchCost;

                    // Launch wave to nearest 1-3 targets based on remaining capacity
                    const maxTargets = Math.min(
                        3,
                        nearbyTargets.length,
                        1 + Math.floor(this.outpostCapacities[outpost.id] / waveLaunchCost)
                    );

                    for (let i = 0; i < maxTargets; i++) {
                        const target = nearbyTargets[i];
                        this.launchProbeFleet(target.x, target.y, target.z, target.targetData);
                    }

                    outpost.lastWaveTime = this.time;

                    // Animate outpost ring pulse to show wave launched
                    if (outpost.marker && outpost.marker.children[0]) {
                        outpost.marker.children[0].scale.setScalar(1.5);
                        setTimeout(() => {
                            if (outpost.marker && outpost.marker.children[0]) {
                                outpost.marker.children[0].scale.setScalar(1);
                            }
                        }, 500);
                    }
                }
            }
        }
    }

    /**
     * Find uncolonized stars within a radius of a position
     */
    findUncolonizedInRadius(x, y, z, radius) {
        const center = new THREE.Vector3(x, y, z);
        const targets = [];

        // Check against colonization targets pool
        if (this.colonizationTargets) {
            for (const target of this.colonizationTargets) {
                if (target.colonized) continue;
                if (target.status === 'fleet_sent') continue;

                const dist = center.distanceTo(new THREE.Vector3(target.x, target.y, target.z));
                if (dist < radius) {
                    targets.push({ ...target, distance: dist, targetData: target });
                }
            }
        }

        // Sort by distance
        targets.sort((a, b) => a.distance - b.distance);

        return targets;
    }

    // ========================================================================
    // FLEET MANAGEMENT METHODS - See star_map_fleets.js
    // Methods: launchProbeFleet, updateProbeFleets, addTrailRemnant,
    //          updateTrailRemnants, simulateExpansion
    // ========================================================================

    /**
     * Calculate the frontier threshold distance
     * Stars beyond this distance are considered "frontier" and get animated probes
     * Stars within this distance at high star counts get instant colonization
     */
    calculateFrontierThreshold() {
        // Early game: always animate (threshold = infinity)
        if (this.colonizedStars.length < 20) return Infinity;

        // Calculate average distance from Sol to all colonized stars
        let totalDist = 0;
        for (const star of this.colonizedStars) {
            const dist = star.position.length();
            totalDist += dist;
        }
        const avgDist = totalDist / this.colonizedStars.length;

        // Frontier is 1.5x the average distance
        // This means probes going to the "edge" get animated
        // Probes filling in the middle are instant
        return avgDist * 1.5;
    }

    /**
     * Add a star as instantly colonized (no animation)
     * Used for nearby targets when we have many animated probes
     */
    addInstantColonization(localX, localY, localZ, targetData) {
        // Get spectral class from target data
        const spectralClass = targetData?.spectralClass || this.getRandomSpectralType();

        // Add to colonized stars with initial development
        const newStar = {
            position: new THREE.Vector3(localX, localY, localZ),
            colonized: true,
            colonizedTime: this.time,
            spectralClass: spectralClass,
            dysonUnits: 0,
            productionUnits: 5,  // Start with some production capability
            targetData: targetData
        };
        this.colonizedStars.push(newStar);
        this.colonizedCount++;

        // Update stats
        this.dotsWithColonization++;
        this.starsWithColonization += this.STARS_PER_DOT;

        // Add the visual dot immediately with spectral-based color
        this.addColonizedStar(localX, localY, localZ, 5, spectralClass);
    }
    // ========================================================================
    // EXTERNAL OBJECTS METHODS - See star_map_objects.js
    // Methods: createDistantGalaxies, createMagellanicClouds, createMagellanicCloud,
    //          createMagellanicStream, updateMagellanicOrbits, addGalaxyLabel,
    //          createAndromedaGalaxy, createMessierObjects, createDeepSkyPOAs,
    //          findNearestMessierDot, colonizeMessierDot, createSmokyNebula,
    //          createDistantCluster, createDarkNebula, createMajorStarSystems,
    //          createSystemLabel, updateSystemLabels, focusOnSystem,
    //          showSystemNotification, createSolMarker, createSolLabel,
    //          updateSolLabel, createSphereOfInfluence, updateSphereOfInfluence,
    //          createBackgroundDustClouds, createBackgroundStars,
    //          createBackgroundGalaxies, createDistantSpiral,
    //          createDistantElliptical, createDistantIrregular
    // ========================================================================


    /**
     * Create the 10 nearby star systems - THE FOCUS OF THIS VIEW
     *
     * These are the stars you can actually visit and colonize.
     * They are centered at origin with the galaxy as distant backdrop.
     */
    createNearbyStars() {
        if (!this.starData || !this.starData.stars) return;

        // Create a group for our local star cluster - CENTERED AT ORIGIN
        this.localCluster = new THREE.Group();

        // Position scale: 1 unit = 1 light year
        // Our 25 ly neighborhood spans 25 units - good viewing scale
        const positionScale = 1.0;

        // Stars are visible and interactive - this is the gameplay focus
        // Size scaled by luminosity for visual interest
        const starSizeScale = 0.12;

        for (const star of this.starData.stars) {
            // Star color based on spectral class
            const spectralClass = star.spectral_class || 'G';
            const starColor = this.spectralColors[spectralClass] || 0xffffff;

            // Star size - visible and scaled by luminosity
            const baseSize = this.spectralSizes[spectralClass] || 1.0;
            const luminosityFactor = Math.pow(star.luminosity_solar || 1, 0.25);
            const starSize = baseSize * luminosityFactor * starSizeScale;

            // Create star mesh (glowing sphere)
            const starGeometry = new THREE.SphereGeometry(starSize, 16, 16);
            const starMaterial = new THREE.MeshBasicMaterial({
                color: starColor,
                transparent: true,
                opacity: 1.0
            });

            const starMesh = new THREE.Mesh(starGeometry, starMaterial);

            // Position relative to Sol (which is at origin of local cluster)
            const pos = star.position_ly;
            starMesh.position.set(
                pos.x * positionScale,
                pos.y * positionScale,
                pos.z * positionScale
            );

            // Add glow effect
            const glowGeometry = new THREE.SphereGeometry(starSize * 2, 12, 12);
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: starColor,
                transparent: true,
                opacity: 0.4,
                side: THREE.BackSide
            });
            const glow = new THREE.Mesh(glowGeometry, glowMaterial);
            starMesh.add(glow);

            // Add outer glow halo
            const outerGlowGeometry = new THREE.SphereGeometry(starSize * 4, 8, 8);
            const outerGlowMaterial = new THREE.MeshBasicMaterial({
                color: starColor,
                transparent: true,
                opacity: 0.15,
                side: THREE.BackSide
            });
            const outerGlow = new THREE.Mesh(outerGlowGeometry, outerGlowMaterial);
            starMesh.add(outerGlow);

            // Store star data
            starMesh.userData = {
                starId: star.id,
                starData: star,
                baseSize: starSize,
                isColonized: star.id === 'sol' || (this.galaxySystem && this.galaxySystem.isColonized(star.id))
            };

            this.stars[star.id] = starMesh;
            this.localCluster.add(starMesh);

            // Create label
            this.createStarLabel(star, starMesh);
        }

        // Highlight Sol with a special marker
        if (this.stars['sol']) {
            const solSize = this.stars['sol'].userData.baseSize || 0.15;
            const solMarker = new THREE.Mesh(
                new THREE.RingGeometry(solSize * 5, solSize * 6, 32),
                new THREE.MeshBasicMaterial({
                    color: 0x00ff00,
                    transparent: true,
                    opacity: 0.5,
                    side: THREE.DoubleSide
                })
            );
            solMarker.rotation.x = Math.PI / 2;
            this.stars['sol'].add(solMarker);
        }

        // Local cluster is at ORIGIN - galaxy backdrop surrounds us
        // No positioning needed - stars are already at their correct relative positions

        // Add "LOCAL CLUSTER" label
        this.createLocalClusterLabel();

        this.scene.add(this.localCluster);

        // Create dust cloud objects
        this.createDustClouds(positionScale);
    }

    /**
     * Create harvestable dust cloud nebulae
     * These are visible targets in the local neighborhood
     */
    createDustClouds(positionScale) {
        if (!this.starData || !this.starData.dust_clouds) return;
        if (!this.localCluster) return;

        for (const cloud of this.starData.dust_clouds) {
            // Dust cloud color - reddish-brown nebula
            const cloudColor = 0x8b4513;
            const glowColor = 0xff6b35;

            // Size scaled to be visible with the local stars
            const cloudSize = 0.6;

            // Main cloud body (multiple overlapping spheres for fuzzy look)
            const cloudGroup = new THREE.Group();

            // Core
            const coreGeometry = new THREE.SphereGeometry(cloudSize * 0.5, 16, 16);
            const coreMaterial = new THREE.MeshBasicMaterial({
                color: 0xffaa55,
                transparent: true,
                opacity: 0.7
            });
            const core = new THREE.Mesh(coreGeometry, coreMaterial);
            cloudGroup.add(core);

            // Inner dust layer
            const innerGeometry = new THREE.SphereGeometry(cloudSize, 16, 16);
            const innerMaterial = new THREE.MeshBasicMaterial({
                color: cloudColor,
                transparent: true,
                opacity: 0.4
            });
            const inner = new THREE.Mesh(innerGeometry, innerMaterial);
            cloudGroup.add(inner);

            // Outer dust halo
            const outerGeometry = new THREE.SphereGeometry(cloudSize * 2.5, 16, 16);
            const outerMaterial = new THREE.MeshBasicMaterial({
                color: glowColor,
                transparent: true,
                opacity: 0.25,
                side: THREE.BackSide
            });
            const outer = new THREE.Mesh(outerGeometry, outerMaterial);
            cloudGroup.add(outer);

            // Wispy outer shell
            const shellGeometry = new THREE.SphereGeometry(cloudSize * 4, 8, 8);
            const shellMaterial = new THREE.MeshBasicMaterial({
                color: 0x553322,
                transparent: true,
                opacity: 0.12,
                side: THREE.BackSide
            });
            const shell = new THREE.Mesh(shellGeometry, shellMaterial);
            cloudGroup.add(shell);

            // Position within local cluster
            const pos = cloud.position_ly;
            cloudGroup.position.set(
                pos.x * positionScale,
                pos.y * positionScale,
                pos.z * positionScale
            );

            // Store cloud data
            cloudGroup.userData = {
                starId: cloud.id,
                starData: cloud,
                isDustCloud: true,
                baseSize: cloudSize,
                isColonized: this.galaxySystem && this.galaxySystem.isColonized(cloud.id)
            };

            this.stars[cloud.id] = cloudGroup;
            this.localCluster.add(cloudGroup);  // Add to local cluster, not scene

            // Create label
            this.createStarLabel(cloud, cloudGroup);
        }
    }

    /**
     * Create text label for a star
     */
    createStarLabel(star, starMesh) {
        const labelDiv = document.createElement('div');
        labelDiv.className = 'star-label';
        labelDiv.innerHTML = `
            <span class="star-name">${star.name}</span>
            <span class="star-distance">${star.distance_ly.toFixed(2)} ly</span>
        `;
        labelDiv.style.display = 'none';
        this.container.appendChild(labelDiv);

        this.starLabels[star.id] = {
            element: labelDiv,
            star: star,
            mesh: starMesh
        };
    }

    /**
     * Create a label for the local star cluster
     */
    createLocalClusterLabel() {
        const labelDiv = document.createElement('div');
        labelDiv.className = 'cluster-label';
        labelDiv.innerHTML = `
            <span class="cluster-title">INTERSTELLAR NEIGHBORHOOD</span>
            <span class="cluster-subtitle">10 Nearby Stars • ~25 Light Years</span>
        `;
        this.container.appendChild(labelDiv);
        this.localClusterLabel = labelDiv;
    }

    /**
     * Create connection lines between colonized systems
     */
    createStarConnections() {
        // Will be updated when colonization status changes
        this.updateStarConnections();
    }

    /**
     * Update connection lines based on colonization
     */
    updateStarConnections() {
        // Remove existing connections
        if (this.connectionLines) {
            this.connectionLines.forEach(line => this.scene.remove(line));
        }
        this.connectionLines = [];

        if (!this.galaxySystem) return;

        const colonized = this.galaxySystem.getColonizedSystems();
        if (colonized.length < 2) return;

        // Create lines between colonized systems
        const material = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.4
        });

        for (let i = 0; i < colonized.length; i++) {
            for (let j = i + 1; j < colonized.length; j++) {
                const star1 = this.stars[colonized[i]];
                const star2 = this.stars[colonized[j]];

                if (star1 && star2) {
                    const geometry = new THREE.BufferGeometry().setFromPoints([
                        star1.position.clone(),
                        star2.position.clone()
                    ]);
                    const line = new THREE.Line(geometry, material);
                    this.connectionLines.push(line);
                    this.scene.add(line);
                }
            }
        }
    }

    /**
     * Create the star info panel UI
     */
    createStarInfoPanel() {
        const panel = document.createElement('div');
        panel.id = 'star-info-panel';
        panel.className = 'star-info-panel';
        panel.style.display = 'none';
        panel.innerHTML = `
            <div class="star-info-header">
                <span class="star-info-name"></span>
                <span class="star-info-type"></span>
            </div>
            <div class="star-info-body">
                <div class="star-info-row">
                    <span class="label">Distance:</span>
                    <span class="value star-info-distance"></span>
                </div>
                <div class="star-info-row">
                    <span class="label">Luminosity:</span>
                    <span class="value star-info-luminosity"></span>
                </div>
                <div class="star-info-row">
                    <span class="label">Temperature:</span>
                    <span class="value star-info-temp"></span>
                </div>
                <div class="star-info-row dyson-power-row">
                    <span class="label">Dyson Potential:</span>
                    <span class="value star-info-dyson-power"></span>
                </div>
                <div class="star-info-row">
                    <span class="label">Status:</span>
                    <span class="value star-info-status"></span>
                </div>
                <div class="star-info-description"></div>
            </div>
            <div class="star-info-actions">
                <button class="star-action-btn" id="btn-plan-transit">Plan Transit</button>
                <button class="star-action-btn queue-btn" id="btn-add-to-queue">Add to Queue</button>
            </div>
        `;
        this.container.appendChild(panel);

        // Event listener for transit button
        document.getElementById('btn-plan-transit').addEventListener('click', () => {
            if (this.selectedStar) {
                this.showTransitMenu(this.selectedStar);
            }
        });

        // Event listener for queue button
        document.getElementById('btn-add-to-queue').addEventListener('click', () => {
            if (this.selectedStar) {
                this.addToTargetQueue(this.selectedStar);
            }
        });
    }

    /**
     * Create the transit planning menu
     */
    createTransitMenu() {
        const menu = document.createElement('div');
        menu.id = 'transit-menu';
        menu.className = 'transit-menu';
        menu.style.display = 'none';
        menu.innerHTML = `
            <div class="transit-menu-header">
                <h3>Plan Interstellar Transit</h3>
                <button class="transit-close-btn">&times;</button>
            </div>
            <div class="transit-menu-body">
                <div class="transit-route">
                    <span class="transit-from">Sol</span>
                    <span class="transit-arrow">→</span>
                    <span class="transit-to"></span>
                </div>
                <div class="transit-details">
                    <div class="transit-row">
                        <span class="label">Distance:</span>
                        <span class="value transit-distance"></span>
                    </div>
                    <div class="transit-row">
                        <span class="label">Travel Time:</span>
                        <span class="value transit-time"></span>
                    </div>
                    <div class="transit-row">
                        <span class="label">Propulsion:</span>
                        <span class="value transit-propulsion"></span>
                    </div>
                </div>
                <div class="transit-probes">
                    <label>Probes to send:</label>
                    <input type="number" id="transit-probe-count" value="10000" min="10000" step="10000">
                    <span class="transit-probe-info">Minimum: 10,000 probes</span>
                </div>
            </div>
            <div class="transit-menu-actions">
                <button class="transit-btn cancel" id="btn-cancel-transit">Cancel</button>
                <button class="transit-btn confirm" id="btn-confirm-transit">Launch Colony Ship</button>
            </div>
        `;
        this.container.appendChild(menu);

        // Event listeners
        menu.querySelector('.transit-close-btn').addEventListener('click', () => this.hideTransitMenu());
        document.getElementById('btn-cancel-transit').addEventListener('click', () => this.hideTransitMenu());
        document.getElementById('btn-confirm-transit').addEventListener('click', () => this.confirmTransit());
    }

    // ========================================================================
    // UI PANEL METHODS - See star_map_ui.js
    // Methods: createKardashevResourceBar, createGalaxyStatsPanel, updateKardashevBar,
    //          initStrategyPanels, createStrategyPanel, createHRDiagramPanel,
    //          updateHRDiagram, getSpectralClassInfo, getStarTemperature,
    //          getStarDescription, calculateTotalDysonPower, formatPowerValue,
    //          calculateKardashevLevel, updateGalaxyStatsPanel, createGalacticMapPanel,
    //          updateExpeditionPanel, createExpansionStatsPanel, updateExpansionStats,
    //          updateSystemListDisplay, formatExpansionNumber, createMissionLogPanel,
    //          addMissionLogEntry, createFleetStatusPanel, updateFleetStatus, formatETA,
    //          showStarInfoPanel, createStarInfoPanel, hideStarInfoPanel,
    //          showDriveUnlockNotification, createStarDataPanel, updateStarDataPanel,
    //          closeStarDataPanel, formatLightYears, formatTemperature, formatLuminosity
    // ========================================================================


    /**
     * Show the galaxy view - IMMERSIVE EXPERIENCE
     */
    show() {
        if (!this.container) {
            console.warn('[StarMap] show() called but container not initialized');
            return;
        }

        try {
            this.isActive = true;
            this.container.style.display = 'block';

            // Hide main solar system UI
            this.hideMainUI();

            // Initialize strategy panels
            this.initStrategyPanels();

            // Initialize camera target to Sol (ensures no drift on startup)
            if (this.solMesh && this.camera && this.controls) {
                this.cameraTarget = {
                    type: 'sol',
                    localPosition: null,
                    extragalactic: false,
                    id: null,
                    zoomDistance: this.getCameraZoomDistance(),
                    locked: true
                };
            }

            // Start the cosmic animation
            this.animate();

            console.log('[StarMap] Galaxy view activated - you are at Sol, 8.35 kpc from galactic center');
            console.log('[StarMap] Press D for Drive Research, C for Stellar Census');
        } catch (error) {
            console.error('[StarMap] Error in show():', error);
            throw error;
        }
    }

    /**
     * Hide the galaxy view
     */
    hide() {
        if (!this.container) return;

        this.isActive = false;
        this.container.style.display = 'none';

        // Hide all strategy panels
        Object.keys(this.panelContainers).forEach(id => {
            if (this.panelContainers[id]) {
                this.panelContainers[id].style.display = 'none';
            }
        });
        this.activePanelId = null;

        // Show main solar system UI
        this.showMainUI();

        // Stop animation
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        console.log('[StarMap] Returning to solar system view');
    }

    /**
     * Toggle the star map view
     */
    toggle() {
        console.log('[StarMap] Toggle called, isActive:', this.isActive, 'container:', !!this.container);

        if (!this.container) {
            console.warn('[StarMap] Container not initialized - star map is still loading or init() failed');
            console.warn('[StarMap] Check console for [StarMap] prefixed messages to debug');
            return;
        }

        if (this.isActive) {
            this.hide();
        } else {
            this.show();
        }
    }

    // ========================================================================
    // CAMERA & FLEET VIEW METHODS - See star_map_camera.js
    // Methods: focusOnSol, toggleFleetView, enterFleetView, exitFleetView,
    //          getCameraZoomDistance, followMesh, goToPosition, updateCameraFollow,
    //          goToSol, showSolSystemPrompt, hideSolSystemPrompt, enterSolSystem,
    //          goToPositionAndFollow, moveCameraToTarget, nextFleet, prevFleet,
    //          updateFleetViewCamera, onFleetArrived, showFleetViewIndicator,
    //          hideFleetViewIndicator, updateFleetViewIndicator, formatDistance
    // ========================================================================


    /**
     * Hide main game UI elements
     */
    hideMainUI() {
        const elementsToHide = [
            '#command-panel',
            '#tech-panel-container',
            '#resource-bar-container',
            '.zone-info-panel',
            '#dyson-interstellar-prompt'
        ];

        elementsToHide.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) el.style.display = 'none';
        });

        // Keep time controls visible but modify
        const timeControls = document.getElementById('time-controls');
        if (timeControls) {
            timeControls.classList.add('star-map-mode');
        }
    }

    /**
     * Show main game UI elements
     */
    showMainUI() {
        const elementsToShow = [
            { selector: '#command-panel', display: 'block' },
            { selector: '#tech-panel-container', display: 'flex' },
            { selector: '#resource-bar-container', display: 'block' },
            { selector: '.zone-info-panel', display: 'flex' }
        ];

        elementsToShow.forEach(({ selector, display }) => {
            const el = document.querySelector(selector);
            if (el) el.style.display = display;
        });

        const timeControls = document.getElementById('time-controls');
        if (timeControls) {
            timeControls.classList.remove('star-map-mode');
        }
    }

    /**
     * Show star selector (repurposed orbital zone selector area)
     */
    showStarSelector() {
        const selectorArea = document.getElementById('orbital-zone-selector');
        if (!selectorArea) return;

        // Save current content
        this._savedSelectorContent = selectorArea.innerHTML;

        // Replace with star selector
        let starsHtml = '<div class="star-selector-header">Stars</div>';
        starsHtml += '<div class="star-selector-list">';

        if (this.starData && this.starData.stars) {
            for (const star of this.starData.stars) {
                const isColonized = this.galaxySystem?.isColonized(star.id);
                const statusClass = isColonized ? 'colonized' : 'discovered';
                const spectralClass = star.spectral_class || 'G';
                const colorHex = (this.spectralColors[spectralClass] || 0xffffff).toString(16).padStart(6, '0');

                starsHtml += `
                    <div class="star-selector-item ${statusClass}" data-star-id="${star.id}">
                        <span class="star-dot" style="background-color: #${colorHex}"></span>
                        <span class="star-selector-name">${star.name}</span>
                        <span class="star-selector-distance">${star.distance_ly.toFixed(1)} ly</span>
                        ${isColonized ? '<span class="star-colonized-badge">●</span>' : ''}
                    </div>
                `;
            }
        }

        starsHtml += '</div>';

        // Add dust clouds section
        if (this.starData && this.starData.dust_clouds && this.starData.dust_clouds.length > 0) {
            starsHtml += '<div class="star-selector-header dust-cloud-header">Harvestable Nebulae</div>';
            starsHtml += '<div class="star-selector-list">';

            for (const cloud of this.starData.dust_clouds) {
                const isColonized = this.galaxySystem?.isColonized(cloud.id);
                const statusClass = isColonized ? 'colonized' : 'discovered';

                starsHtml += `
                    <div class="star-selector-item dust-cloud ${statusClass}" data-star-id="${cloud.id}">
                        <span class="star-dot dust-cloud-dot"></span>
                        <span class="star-selector-name">${cloud.name}</span>
                        <span class="star-selector-distance">${cloud.distance_ly.toFixed(1)} ly</span>
                        ${isColonized ? '<span class="star-colonized-badge">●</span>' : ''}
                    </div>
                `;
            }

            starsHtml += '</div>';
        }

        starsHtml += '<div class="star-selector-footer">Press <kbd>I</kbd> to return to solar system</div>';

        selectorArea.innerHTML = starsHtml;
        selectorArea.classList.add('star-map-mode');

        // Add click handlers
        selectorArea.querySelectorAll('.star-selector-item').forEach(item => {
            item.addEventListener('click', () => {
                const starId = item.dataset.starId;
                this.selectStar(starId);
            });
        });
    }

    /**
     * Hide star selector and restore orbital zone selector
     */
    hideStarSelector() {
        const selectorArea = document.getElementById('orbital-zone-selector');
        if (!selectorArea) return;

        if (this._savedSelectorContent) {
            selectorArea.innerHTML = this._savedSelectorContent;
        }
        selectorArea.classList.remove('star-map-mode');
    }

    /**
     * Select a star system
     * @param {string} starId - Star ID to select
     */
    selectStar(starId) {
        // Deselect previous
        if (this.selectedStar && this.stars[this.selectedStar]) {
            // Remove selection highlight
        }

        this.selectedStar = starId;
        const starMesh = this.stars[starId];

        // Find in stars or dust clouds
        let star = this.starData?.stars?.find(s => s.id === starId);
        if (!star) {
            star = this.starData?.dust_clouds?.find(c => c.id === starId);
        }

        if (!star || !starMesh) return;

        // Focus camera on star using simple camera system
        this.goToPositionAndFollow(
            new THREE.Vector3().copy(starMesh.position).applyMatrix4(starMesh.parent?.matrixWorld || new THREE.Matrix4()),
            starMesh,
            15
        );

        // Update info panel
        this.updateStarInfoPanel(star);

        // Highlight in selector
        document.querySelectorAll('.star-selector-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.starId === starId);
        });
    }

    /**
     * Update star info panel with selected star data
     */
    updateStarInfoPanel(star) {
        const panel = document.getElementById('star-info-panel');
        if (!panel) return;

        panel.style.display = 'block';

        panel.querySelector('.star-info-name').textContent = star.name;
        panel.querySelector('.star-info-type').textContent = star.type;
        panel.querySelector('.star-info-distance').textContent = `${star.distance_ly.toFixed(2)} light-years`;
        panel.querySelector('.star-info-luminosity').textContent = `${star.luminosity_solar.toFixed(4)} L☉`;
        panel.querySelector('.star-info-temp').textContent = `${star.temperature_k.toLocaleString()} K`;

        // Calculate and display Dyson sphere power potential
        const dysonPower = star.luminosity_solar * StarMapVisualization.SOLAR_LUMINOSITY_WATTS;
        panel.querySelector('.star-info-dyson-power').textContent = this.formatPower(dysonPower);

        panel.querySelector('.star-info-description').textContent = star.description || '';

        const isColonized = this.galaxySystem?.isColonized(star.id);
        const statusEl = panel.querySelector('.star-info-status');
        if (star.id === 'sol') {
            statusEl.textContent = 'Home System';
            statusEl.className = 'value star-info-status home';
        } else if (isColonized) {
            statusEl.textContent = 'Colonized';
            statusEl.className = 'value star-info-status colonized';
        } else {
            statusEl.textContent = 'Unexplored';
            statusEl.className = 'value star-info-status unexplored';
        }

        // Show/hide transit button
        const transitBtn = document.getElementById('btn-plan-transit');
        transitBtn.style.display = (star.id !== 'sol' && !isColonized) ? 'block' : 'none';

        // Show/hide and update queue button
        const queueBtn = document.getElementById('btn-add-to-queue');
        if (queueBtn) {
            queueBtn.style.display = (star.id !== 'sol' && !isColonized) ? 'block' : 'none';
            if (star.id !== 'sol' && !isColonized) {
                this.updateQueueButton(star.id);
            }
        }
    }

    /**
     * Show the transit planning menu
     */
    showTransitMenu(starId) {
        const menu = document.getElementById('transit-menu');
        const star = this.starData?.stars?.find(s => s.id === starId);
        if (!menu || !star) return;

        menu.style.display = 'block';
        menu.querySelector('.transit-to').textContent = star.name;
        menu.querySelector('.transit-distance').textContent = `${star.distance_ly.toFixed(2)} light-years`;

        // Calculate travel time (placeholder - needs propulsion tier)
        const effectiveVelocity = 0.01; // 1% c for tier 17
        const travelYears = star.distance_ly / effectiveVelocity;
        menu.querySelector('.transit-time').textContent = `${travelYears.toFixed(1)} years at ${(effectiveVelocity * 100).toFixed(1)}% c`;
        menu.querySelector('.transit-propulsion').textContent = 'Tier 17: Pais Effect Drive';
    }

    /**
     * Hide the transit menu
     */
    hideTransitMenu() {
        const menu = document.getElementById('transit-menu');
        if (menu) menu.style.display = 'none';
    }

    /**
     * Confirm and execute transit
     */
    confirmTransit() {
        if (!this.selectedStar || !this.galaxySystem) return;

        const probeCount = parseInt(document.getElementById('transit-probe-count').value) || 10000;
        const effectiveVelocity = 0.01; // Will get from propulsion tier
        const currentTime = window.gameEngine?.state?.time || 0;

        // Initiate transfer
        const transfer = this.galaxySystem.initiateTransfer(
            'sol',
            this.selectedStar,
            probeCount,
            effectiveVelocity,
            currentTime
        );

        console.log('Colony ship launched:', transfer);

        this.hideTransitMenu();

        // Show notification
        this.showTransitNotification(transfer);
    }

    /**
     * Show transit notification
     */
    showTransitNotification(transfer) {
        const notification = document.createElement('div');
        notification.className = 'transit-notification';
        notification.innerHTML = `
            <span class="transit-icon">🚀</span>
            Colony ship launched to ${this.starData?.stars?.find(s => s.id === transfer.to_system)?.name}!
            <br>Arrival in ${(transfer.arrival_time - transfer.departure_time).toFixed(0)} days
        `;
        this.container.appendChild(notification);

        setTimeout(() => notification.remove(), 5000);
    }

    /**
     * Handle star and POA clicks
     */
    onStarClick(event) {
        console.log('[StarMap] Click detected');
        // Reuse class-level raycaster to avoid per-click allocations
        this.raycasterMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.raycasterMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.raycasterMouse, this.camera);

        // Increase raycaster threshold for better hit detection on small objects
        this.raycaster.params.Line = { threshold: 0.5 };
        this.raycaster.params.Points = { threshold: 0.5 };

        // POA clicks are handled by floating labels only (not 3D markers)
        // Click label to focus camera and show colonization menu

        // Check regular star clicks
        const starMeshes = Object.values(this.stars);
        const intersects = this.raycaster.intersectObjects(starMeshes, true);

        if (intersects.length > 0) {
            let obj = intersects[0].object;
            while (obj.parent && !obj.userData?.starId) {
                obj = obj.parent;
            }
            if (obj.userData?.starId) {
                this.selectStar(obj.userData.starId);
            }
        }
    }

    /**
     * Update star labels positions
     */
    updateLabels() {
        if (!this.isActive) return;

        for (const [starId, labelData] of Object.entries(this.starLabels)) {
            const { element, mesh } = labelData;

            // Project 3D position to 2D screen
            const pos = mesh.position.clone();
            pos.project(this.camera);

            const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;

            // Check if in front of camera
            if (pos.z < 1) {
                element.style.display = 'block';
                element.style.left = `${x}px`;
                element.style.top = `${y - 30}px`;
            } else {
                element.style.display = 'none';
            }
        }
    }

    /**
     * Animation loop - IMMERSIVE galaxy experience
     * Camera follows Sol as the galaxy rotates around
     */
    animate() {
        if (!this.isActive) return;

        this.animationId = requestAnimationFrame(() => this.animate());

        // Time increment: 1 week (7 days) per 1 real second at 1x speed
        // User speed multiplier allows 1x, 10x, 100x, 1000x acceleration
        this.time += this.daysPerFrame * (this.timeSpeedMultiplier || 1);
        this.frameCount = (this.frameCount || 0) + 1;

        // The galaxy rotates - we're inside it!
        // Rotation speed: ~0.0001 rad/frame = visible but majestic rotation
        const galaxyRotationSpeed = 0.0001;

        if (this.galaxyGroup) {
            this.galaxyGroup.rotation.y += galaxyRotationSpeed;

            // UNIFIED CAMERA SYSTEM: Fleet view takes priority, then cameraTarget system
            if (this.controls) {
                if (this.fleetViewMode) {
                    // Fleet view mode - follow tracked fleet
                    this.updateFleetViewCamera();
                } else {
                    // Use unified camera follow system (handles Sol, POA, any position)
                    this.updateCameraFollow();
                }
            }

            // Sol marker - subtle pulse
            if (this.solMesh) {
                const solPulse = 1 + Math.sin(this.time * 2) * 0.1;
                this.solMesh.scale.setScalar(solPulse);

                // Update Sol label position
                this.updateSolLabel();
            }
        }

        // Update POA floating labels (only label system now)
        this.updatePOALabels();

        // Animate nebulae - gentle pulsing glow
        if (this.nebulae) {
            for (const nebula of this.nebulae) {
                const pulse = Math.sin(this.time * nebula.userData.pulseSpeed + nebula.userData.pulsePhase);
                nebula.material.opacity = nebula.userData.baseOpacity + pulse * 0.1;
            }
        }

        // Animate distant galaxies - rotate spirals slowly
        if (this.distantGalaxies) {
            for (const galaxy of this.distantGalaxies) {
                if (galaxy.userData.isSpiral && galaxy.userData.rotationSpeed) {
                    galaxy.rotation.z += galaxy.userData.rotationSpeed;
                }
            }
        }

        // Animate outposts - rotate marker and ring
        if (this.outposts) {
            for (const outpost of this.outposts) {
                if (outpost.marker) {
                    outpost.marker.rotation.y += 0.01;  // Slow spin
                    // Ring rotates faster
                    if (outpost.marker.children[0]) {
                        outpost.marker.children[0].rotation.z += 0.02;
                    }
                }
            }
        }

        // Animate probe fleets - show them traveling to new stars
        this.updateProbeFleets();

        // Simulate expansion based on game state (throttled)
        if (this.frameCount % 60 === 0) {
            this.simulateExpansion();
        }

        // Fade and remove old connection lines
        for (let i = this.colonizedConnections.length - 1; i >= 0; i--) {
            const line = this.colonizedConnections[i];
            if (!line.userData) continue;

            const age = this.time - line.userData.createdTime;

            if (age > line.userData.fadeStartTime) {
                const fadeProgress = (age - line.userData.fadeStartTime) / line.userData.fadeDuration;
                line.material.opacity = Math.max(0, line.userData.initialOpacity * (1 - fadeProgress));

                // Remove fully faded lines
                if (fadeProgress >= 1) {
                    this.colonizationGroup.remove(line);
                    line.geometry.dispose();
                    line.material.dispose();
                    this.colonizedConnections.splice(i, 1);
                }
            }
        }

        // Update WASD flying movement
        this.updateWASDFlying();

        // Update controls
        if (this.controls) {
            this.controls.update();
        }

        // Update UI stats (throttled - every 30 frames)
        if (this.frameCount % 30 === 0) {
            this.updateKardashevBar();
            this.updateGalaxyStats();
            this.updateColonizationStats();
            this.updateScaleBar();
            this.updateGalacticCoordinates();
        }

        // Render
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Update colonization-specific stats in the UI
     */
    updateColonizationStats() {
        const actualColonizedCount = this.colonizedStars ? this.colonizedStars.length : 1;

        // Update drive acceleration (in g's)
        const driveAccelEl = document.getElementById('stat-drive-accel');
        if (driveAccelEl) {
            const accel = this.getDriveAcceleration();
            if (accel < 1) {
                driveAccelEl.textContent = `${accel.toFixed(2)} g`;
            } else if (accel < 100) {
                driveAccelEl.textContent = `${accel.toFixed(1)} g`;
            } else {
                driveAccelEl.textContent = `${accel.toFixed(0)} g`;
            }
        }

        // Update fleets in transit
        const fleetsEl = document.getElementById('stat-fleets-transit');
        if (fleetsEl) {
            fleetsEl.textContent = this.probeFleets.length.toString();
        }

        // Update hop distance (from strategy slider)
        const hopEl = document.getElementById('stat-hop-distance');
        if (hopEl) {
            hopEl.textContent = `${this.getAverageHopDistanceDisplay()} ly`;
        }

        // Update stars count
        const starsEl = document.getElementById('stat-stars-count');
        if (starsEl) {
            starsEl.textContent = actualColonizedCount.toLocaleString();
        }

        // Update sectors (colonized regions/clusters)
        const sectorsEl = document.getElementById('stat-sectors');
        if (sectorsEl) {
            // Count unique sectors based on spatial clustering
            const sectors = this.countColonizedSectors();
            sectorsEl.textContent = sectors.toString();
        }

        // Update total mass in solar masses
        const massEl = document.getElementById('stat-total-mass');
        if (massEl) {
            const totals = this.getTotalStarUnits ? this.getTotalStarUnits() : { total: actualColonizedCount * 100 };
            const totalSolarMasses = totals.total / 100;
            massEl.textContent = this.formatSolarMasses(totalSolarMasses);
        }

        // Update total power in solar luminosity
        const powerEl = document.getElementById('stat-total-power');
        if (powerEl) {
            const totalPower = this.starsWithDyson * this.AVG_STAR_LUMINOSITY * 3.828e26;
            powerEl.textContent = this.formatPowerSolar(totalPower);
        }

        // Update weighted Dyson completion across all stars
        const dysonEl = document.getElementById('stat-dyson-avg');
        if (dysonEl) {
            let totalDyson = 0;
            let totalWeight = 0;
            for (const star of this.colonizedStars) {
                const dysonProg = star.dysonUnits || 0;
                const weight = star.totalUnits || 100;
                totalDyson += dysonProg * weight;
                totalWeight += weight;
            }
            const avgDyson = totalWeight > 0 ? (totalDyson / totalWeight) : 0;
            dysonEl.textContent = `${avgDyson.toFixed(1)}%`;
        }

        // Update top bar clock
        const galacticTimeEl = document.getElementById('galactic-time');
        if (galacticTimeEl) {
            const years = Math.floor(this.time / 365);
            const months = Math.floor((this.time % 365) / 30);
            if (years >= 1000000) {
                galacticTimeEl.textContent = `Year ${(years / 1000000).toFixed(2)}M`;
            } else if (years >= 1000) {
                galacticTimeEl.textContent = `Year ${(years / 1000).toFixed(1)}k`;
            } else if (years > 0) {
                galacticTimeEl.textContent = `Year ${years}, Month ${months + 1}`;
            } else {
                galacticTimeEl.textContent = `Month ${months + 1}`;
            }
        }
    }

    /**
     * Get drive acceleration in g's based on current tech tier
     */
    getDriveAcceleration() {
        // Base acceleration scales with tier
        // Tier 1: 0.1g, Tier 5: 1g, Tier 10: 100g+
        const tier = this.getDriveResearchTier();
        if (tier <= 1) return 0.1;
        if (tier <= 3) return 0.1 * Math.pow(2, tier - 1);  // 0.1, 0.2, 0.4
        if (tier <= 6) return 0.4 * Math.pow(2, tier - 3);  // 0.8, 1.6, 3.2
        if (tier <= 9) return 3.2 * Math.pow(3, tier - 6);  // 9.6, 28.8, 86.4
        return 100 + (tier - 10) * 50;  // 100g+
    }

    /**
     * Count colonized sectors (spatial clusters)
     * ~20 sectors total across the galaxy (~100,000 ly diameter)
     * Using ~25,000 ly per sector = roughly 4x5 grid across galactic disk
     */
    countColonizedSectors() {
        if (!this.colonizedStars || this.colonizedStars.length === 0) return 1;

        // Sector size: ~25,000 ly for ~20 sectors across galaxy
        // 1 unit = 326 ly, so 25,000 ly ≈ 76.7 units
        const SECTOR_SIZE = 25000 / 326;  // ~76.7 units per sector
        const sectors = new Set();

        for (const star of this.colonizedStars) {
            const sectorX = Math.floor(star.position.x / SECTOR_SIZE);
            const sectorY = Math.floor(star.position.y / SECTOR_SIZE);
            const sectorZ = Math.floor(star.position.z / SECTOR_SIZE);
            sectors.add(`${sectorX},${sectorY},${sectorZ}`);
        }

        return sectors.size;
    }

    /**
     * Get current drive research tier (1-10)
     */
    getDriveResearchTier() {
        // Try to get from drive research panel if available
        if (window.driveResearchPanel && window.driveResearchPanel.currentTier) {
            return window.driveResearchPanel.currentTier;
        }
        // Default to tier 1
        return 1;
    }

    /**
     * Set starship drives data (loaded from starship_drives.json)
     * @param {Object} drivesData - The starship drives configuration
     */
    setStarshipDrives(drivesData) {
        this.starshipDrives = drivesData;
        console.log('[StarMap] Starship drives loaded:', drivesData?.drives?.length || 0, 'drive types');
    }

    /**
     * Get starship drive by tier
     * @param {number} tier - Drive tier (1-10)
     * @returns {Object} Drive configuration
     */
    getStarshipDrive(tier) {
        if (this.starshipDrives?.drives) {
            const drive = this.starshipDrives.drives.find(d => d.tier === tier);
            if (drive) return drive;
        }
        // Fallback: exponential velocity scaling for gameplay
        // Tier 1: 8,700 ly/yr (10 min real time to cross galaxy)
        // Tier 10: 173,000 ly/yr (30 sec real time to cross galaxy)
        // 20x speedup across 10 tiers
        const baseVelocity = 8700;  // ly/year at tier 1
        const fallbackVelocity = baseVelocity * Math.pow(20, (tier - 1) / 9);
        return {
            tier: tier,
            effective_velocity_ly_per_year: fallbackVelocity
        };
    }

    /**
     * Calculate fleet travel time using simple constant velocity
     * Optimized for gameplay - no relativistic complexity
     *
     * @param {number} distanceLY - Distance in light-years
     * @param {number} driveTier - Drive tier (1-10)
     * @returns {Object} Travel data with travelTime and visualSpeedLYperYr
     */
    calculateFleetTravel(distanceLY, driveTier) {
        // Speed formula: Tier 1 = 100kly in 60 real minutes at 1x game speed
        // At 1x speed: 60 real min = 3600 sec × 7 days/sec = 25,200 game days = 69.04 years
        // Tier 1 speed = 100,000 ly / 69.04 years ≈ 1,449 ly/year
        // Each tier doubles the speed
        const tier1SpeedLYperYear = 100000 / 69.04;  // ~1,449 ly/year
        const velocityLYperYear = tier1SpeedLYperYear * Math.pow(2, driveTier - 1);

        // Simple: time = distance / velocity
        const travelTime = distanceLY / velocityLYperYear;

        return {
            travelTime: travelTime,
            visualSpeedLYperYr: velocityLYperYear
        };
    }

    /**
     * Calculate exponential random delay for probe launch (in game days)
     * Rate depends on production/dyson split:
     * - 100% production (productionUnits=100) → rate = 1 probe/year
     * - 100% dyson (productionUnits=0) → rate = 0.01 probe/year (1 per 100 years)
     * @param {number} productionUnits - Production units (0-100)
     * @param {boolean} isSol - Whether this is Sol (always 1/year rate)
     * @returns {number} Delay in game days until next launch
     */
    getExponentialDelay(productionUnits, isSol = false) {
        // Sol is special: always 1 probe/year regardless of development
        let ratePerYear;
        if (isSol) {
            ratePerYear = 1.0;
        } else {
            // Rate = lerp(0.01, 1, productionUnits/100)
            // 100% production = 1/year, 100% dyson = 0.01/year
            ratePerYear = 0.01 + (productionUnits / 100) * 0.99;
        }

        // Exponential random: delay = -ln(random) / rate
        // This gives memoryless inter-arrival times
        const delayYears = -Math.log(Math.random()) / ratePerYear;
        const delayDays = delayYears * 365;

        return delayDays;
    }

    /**
     * Format time for interstellar display (years/months)
     */
    formatInterstellarTime(days) {
        const years = Math.floor(days / 365);
        const months = Math.floor((days % 365) / 30);
        if (years >= 1000) {
            return `${(years / 1000).toFixed(1)}ky`;
        }
        if (years > 0) {
            return `${years}y`;
        }
        return `${months}m`;
    }

    /**
     * Setup keyboard shortcuts for galaxy view
     */
    setupKeyboardShortcuts() {
        // Track key presses for WASD flying
        window.addEventListener('keydown', (e) => {
            // Track WASD keys for flying (always, even when not in galaxy view)
            const key = e.key.toLowerCase();
            if (['w', 'a', 's', 'd'].includes(key)) {
                this.keysPressed.add(key);
                // Break camera focus when WASD is pressed - detach from any followed target
                if (this.isActive) {
                    this.focusedOnSol = false;
                    this.followTarget = null;  // Stop following any mesh
                    this.cameraAnimating = false;  // Cancel any camera animation
                }
            }

            // Spacebar - colonize selected POA (only when galaxy view is active)
            // This needs to work even when buttons are focused in the POA panel
            if (e.key === ' ' && this.isActive && this.selectedPOA) {
                e.preventDefault();
                e.stopPropagation();
                console.log('[StarMap] Spacebar: adding POA to queue:', this.selectedPOA);
                this.addPOAToQueueAndRefresh(this.selectedPOA);
                return;
            }

            // Only handle shortcuts when galaxy view is active
            if (!this.isActive) return;

            // Don't intercept if typing in an input
            if (document.activeElement.tagName === 'INPUT' ||
                document.activeElement.tagName === 'TEXTAREA') return;

            // Tab key - toggle lines visibility
            if (e.key === 'Tab') {
                e.preventDefault();
                this.toggleLinesVisibility();
            }

            // Enter key - enter Sol System when focused on Sol
            if (e.key === 'Enter' && this.focusedOnSol) {
                e.preventDefault();
                this.enterSolSystem();
            }

            // F key - toggle fleet view
            if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                this.toggleFleetView();
            }

            // O key - Strategy panel (with H-R diagram and histogram)
            if (e.key === 'o' || e.key === 'O') {
                e.preventDefault();
                this.toggleStrategyPanel();
            }

            // L key - Stellar Census panel
            if (e.key === 'l' || e.key === 'L') {
                e.preventDefault();
                this.togglePanel('stellar-census');
            }

            // K key - Drive Research panel
            if (e.key === 'k' || e.key === 'K') {
                e.preventDefault();
                this.togglePanel('drive-research');
            }

            // 1 key - go to Sol (home)
            if (e.key === '1') {
                e.preventDefault();
                this.goToSol();
            }

            // Left/Right arrows - cycle through fleets in fleet view
            if (this.fleetViewMode) {
                if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    this.nextFleet();
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    this.prevFleet();
                }
            }
        });

        // Track key releases for WASD flying
        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (['w', 'a', 's', 'd'].includes(key)) {
                this.keysPressed.delete(key);
            }
        });

        // Clear keys when window loses focus
        window.addEventListener('blur', () => {
            this.keysPressed.clear();
        });
    }

    /**
     * Update WASD flying movement - called each frame
     * W/S = forward/backward in camera direction
     * A/D = strafe left/right
     */
    updateWASDFlying() {
        if (!this.isActive || !this.camera || !this.controls) return;
        if (this.keysPressed.size === 0) return;

        // Calculate speed based on zoom distance (faster when zoomed out)
        const zoomDistance = this.camera.position.distanceTo(this.controls.target);
        const speed = this.flySpeed * Math.max(0.5, zoomDistance * 0.05);

        // Get camera's forward direction (from camera to target) - reuse vectors
        this._flyForward.subVectors(this.controls.target, this.camera.position).normalize();

        // Get right direction (perpendicular to forward, in XZ plane)
        this._flyRight.crossVectors(this._flyForward, this.camera.up).normalize();

        // Calculate movement vector - reset to zero
        this._flyMovement.set(0, 0, 0);

        if (this.keysPressed.has('w')) {
            this._flyTemp.copy(this._flyForward).multiplyScalar(speed);
            this._flyMovement.add(this._flyTemp);
        }
        if (this.keysPressed.has('s')) {
            this._flyTemp.copy(this._flyForward).multiplyScalar(-speed);
            this._flyMovement.add(this._flyTemp);
        }
        if (this.keysPressed.has('a')) {
            this._flyTemp.copy(this._flyRight).multiplyScalar(-speed);
            this._flyMovement.add(this._flyTemp);
        }
        if (this.keysPressed.has('d')) {
            this._flyTemp.copy(this._flyRight).multiplyScalar(speed);
            this._flyMovement.add(this._flyTemp);
        }

        // Move both camera and target together (maintains orbit distance)
        this.camera.position.add(this._flyMovement);
        this.controls.target.add(this._flyMovement);
    }

    /**
     * Toggle visibility of colonization lines, trails, and remnants
     */
    toggleLinesVisibility() {
        this.linesVisible = !this.linesVisible;

        // Toggle colonized star connections
        if (this.colonizedConnections) {
            for (const line of this.colonizedConnections) {
                if (line) line.visible = this.linesVisible;
            }
        }

        // Toggle active probe trails
        if (this.probeFleets) {
            for (const fleet of this.probeFleets) {
                if (fleet.trail) fleet.trail.visible = this.linesVisible;
            }
        }

        // Toggle trail remnants
        if (this.trailRemnants) {
            for (const remnant of this.trailRemnants) {
                if (remnant.line) remnant.line.visible = this.linesVisible;
            }
        }

        console.log(`[StarMap] Lines visibility: ${this.linesVisible ? 'ON' : 'OFF'}`);
    }

    /**
     * Handle window resize
     */
    onResize() {
        if (!this.camera || !this.renderer) return;

        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /**
     * Get the current galaxy state for saving
     * @returns {Object} Galaxy state including colonized stars
     */
    getGalaxyState() {
        const colonizedStarsData = [];

        // Save each colonized star's position, units, spectral type, and launch data
        for (const star of this.colonizedStars) {
            colonizedStarsData.push({
                x: star.position.x,
                y: star.position.y,
                z: star.position.z,
                spectralClass: star.spectralClass || 'G',
                dysonUnits: star.dysonUnits || 0,
                productionUnits: star.productionUnits || 0,
                addedTime: star.addedTime || 0,
                lastLaunchTime: star.lastLaunchTime || 0,
                probesLaunched: star.probesLaunched || 0
            });
        }

        // Save outposts data
        const outpostsData = [];
        for (const outpost of this.outposts) {
            outpostsData.push({
                id: outpost.id,
                x: outpost.position.x,
                y: outpost.position.y,
                z: outpost.position.z,
                createdAt: outpost.createdAt,
                waveRadius: outpost.waveRadius,
                isActive: outpost.isActive,
                lastWaveTime: outpost.lastWaveTime
            });
        }

        return {
            colonizedStars: colonizedStarsData,
            outposts: outpostsData,
            starsInfluenced: this.starsInfluenced || 1,
            dotsColonized: this.dotsColonized || 1,
            starsWithDyson: this.starsWithDyson || 0,
            influenceRadius: this.influenceRadius || 0,
            time: this.time || 0,
            expansionAllocation: this.expansionAllocation || 50,
            outpostCapacities: this.outpostCapacities || {}
        };
    }

    /**
     * Restore galaxy state from saved data
     * @param {Object} galaxyState - Saved galaxy state
     */
    restoreGalaxyState(galaxyState) {
        if (!galaxyState) return;

        console.log('[StarMap] Restoring galaxy state:', galaxyState);

        // Clear existing colonized stars (using Points-based system)
        // Keep Sol (first entry), clear the rest
        if (this.colonizedStars && this.colonizedStars.length > 1) {
            // Keep only Sol's data
            const solData = this.colonizedStars[0];
            this.colonizedStars = [solData];

            // Reset arrays to just Sol
            this.colonizedStarsPositions = [solData.position.x, solData.position.y, solData.position.z];
            const solColor = new THREE.Color(this.getDysonColor(solData.dysonProgress || 0));
            this.colonizedStarsColors = [solColor.r, solColor.g, solColor.b];

            // Rebuild Points geometry
            this.rebuildColonizedStarsGeometry();
        }

        // Clear connections
        if (this.colonizedConnections) {
            for (const conn of this.colonizedConnections) {
                if (conn && this.colonizationGroup) {
                    this.colonizationGroup.remove(conn);
                    conn.geometry.dispose();
                    conn.material.dispose();
                }
            }
            this.colonizedConnections = [];
        }

        // Restore colonized stars from saved data (skip first which is Sol)
        if (galaxyState.colonizedStars && galaxyState.colonizedStars.length > 1) {
            for (let i = 1; i < galaxyState.colonizedStars.length; i++) {
                const savedData = galaxyState.colonizedStars[i];

                // Calculate initial units for addColonizedStar
                // Support both old (dysonProgress) and new (dysonUnits/productionUnits) formats
                const dysonUnits = savedData.dysonUnits ?? (savedData.dysonProgress || 0);
                const productionUnits = savedData.productionUnits ?? 0;
                const totalUnits = dysonUnits + productionUnits;

                const star = this.addColonizedStar(
                    savedData.x,
                    savedData.y,
                    savedData.z,
                    totalUnits,
                    savedData.spectralClass  // Restore spectral type
                );

                // Restore exact unit distribution from saved state
                if (star) {
                    star.dysonUnits = dysonUnits;
                    star.productionUnits = productionUnits;
                    star.spectralClass = savedData.spectralClass || star.spectralClass;
                    star.lastLaunchTime = savedData.lastLaunchTime || 0;
                    star.probesLaunched = savedData.probesLaunched || 0;
                    star.addedTime = savedData.addedTime || 0;

                    // Update color to match restored units and spectral type
                    const colorHex = this.getStarColor(totalUnits, dysonUnits, star.spectralClass);
                    const colorObj = new THREE.Color(colorHex);
                    const colorIndex = star.index * 3;
                    this.colonizedStarsColors[colorIndex] = colorObj.r;
                    this.colonizedStarsColors[colorIndex + 1] = colorObj.g;
                    this.colonizedStarsColors[colorIndex + 2] = colorObj.b;
                }
            }
            // Rebuild geometry after restoring all stars
            this.rebuildColonizedStarsGeometry();
        }

        // Restore Sol's saved properties if available
        if (galaxyState.colonizedStars && galaxyState.colonizedStars.length > 0 && this.colonizedStars.length > 0) {
            const solSaved = galaxyState.colonizedStars[0];
            const sol = this.colonizedStars[0];
            if (sol && solSaved) {
                // Only restore if saved values look valid (both have values and sum to ~100)
                const savedDyson = solSaved.dysonUnits ?? 0;
                const savedProd = solSaved.productionUnits ?? 0;
                const savedTotal = savedDyson + savedProd;

                if (savedTotal >= 50 && savedTotal <= 150 && savedProd > 0) {
                    // Valid saved state - use it
                    sol.dysonUnits = savedDyson;
                    sol.productionUnits = savedProd;
                } else {
                    // Invalid or old save format - use default 50/50
                    sol.dysonUnits = 50;
                    sol.productionUnits = 50;
                    console.log('[StarMap] Reset Sol to default 50/50 split (invalid saved state)');
                }
                sol.lastLaunchTime = solSaved.lastLaunchTime || 0;
                sol.probesLaunched = solSaved.probesLaunched || 0;
            }
        }

        // Restore stats
        this.starsInfluenced = galaxyState.starsInfluenced || 1;
        this.dotsColonized = galaxyState.dotsColonized || 1;
        this.starsWithDyson = galaxyState.starsWithDyson || 0;
        this.influenceRadius = galaxyState.influenceRadius || 0;
        this.time = galaxyState.time || 0;

        // Clear existing outposts
        if (this.outposts) {
            for (const outpost of this.outposts) {
                if (outpost.marker && this.colonizationGroup) {
                    this.colonizationGroup.remove(outpost.marker);
                }
            }
            this.outposts = [];
        }

        // Restore outposts from saved data
        if (galaxyState.outposts && galaxyState.outposts.length > 0) {
            for (const outpostData of galaxyState.outposts) {
                // Find the corresponding colonized star near the outpost position
                let nearestStar = null;
                let nearestDist = Infinity;
                const outpostPos = new THREE.Vector3(outpostData.x, outpostData.y, outpostData.z);

                for (const star of this.colonizedStars) {
                    const dist = star.position.distanceTo(outpostPos);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestStar = star;
                    }
                }

                if (nearestStar && nearestDist < 1) {
                    // Recreate the outpost
                    const outpost = this.createOutpost(nearestStar);
                    // Restore saved properties
                    outpost.id = outpostData.id;
                    outpost.createdAt = outpostData.createdAt;
                    outpost.waveRadius = outpostData.waveRadius;
                    outpost.isActive = outpostData.isActive;
                    outpost.lastWaveTime = outpostData.lastWaveTime;
                }
            }
            console.log(`[StarMap] Restored ${this.outposts.length} outposts`);
        }

        // Restore expansion allocation
        if (galaxyState.expansionAllocation !== undefined) {
            this.expansionAllocation = galaxyState.expansionAllocation;
            const slider = document.getElementById('expansion-slider');
            if (slider) {
                slider.value = this.expansionAllocation;
                this.updateExpansionDisplay(this.expansionAllocation);
            }
        }

        // Restore outpost capacities
        if (galaxyState.outpostCapacities) {
            this.outpostCapacities = galaxyState.outpostCapacities;
        }

        // Update display
        this.updateGalaxyStats();
    }

    /**
     * Reset galaxy view for a new game
     * Clears all colonization state and reinitializes from scratch
     */
    resetToNewGame() {
        console.log('[StarMap] Resetting galaxy view for new game');

        // Safety check - if star map hasn't been initialized yet, skip reset
        if (!this.colonizationGroup) {
            console.log('[StarMap] Star map not yet initialized, skipping reset');
            return;
        }

        // Reset time
        this.time = 0;
        this.frameCount = 0;

        // Clear probe fleets
        if (this.probeFleets) {
            for (const fleet of this.probeFleets) {
                if (fleet.mesh) {
                    this.colonizationGroup.remove(fleet.mesh);
                    fleet.mesh.geometry?.dispose();
                    fleet.mesh.material?.dispose();
                }
                if (fleet.trail) {
                    this.colonizationGroup.remove(fleet.trail);
                    fleet.trail.geometry?.dispose();
                    fleet.trail.material?.dispose();
                }
            }
            this.probeFleets = [];
        }

        // Clear trail remnants
        if (this.trailRemnants) {
            for (const remnant of this.trailRemnants) {
                if (remnant.line) {
                    this.colonizationGroup.remove(remnant.line);
                    remnant.line.geometry?.dispose();
                    remnant.line.material?.dispose();
                }
            }
            this.trailRemnants = [];
        }

        // Clear connection lines
        if (this.colonizedConnections) {
            for (const conn of this.colonizedConnections) {
                if (conn) {
                    this.colonizationGroup.remove(conn);
                    conn.geometry?.dispose();
                    conn.material?.dispose();
                }
            }
            this.colonizedConnections = [];
        }

        // Clear colonized stars (will reinitialize Sol below)
        if (this.colonizedStars) {
            this.colonizedStars = [];
            this.colonizedStarsPositions = [];
            this.colonizedStarsColors = [];
            this.rebuildColonizedStarsGeometry();
        }

        // Clear outposts
        if (this.outposts) {
            for (const outpost of this.outposts) {
                if (outpost.ring) {
                    this.colonizationGroup.remove(outpost.ring);
                    outpost.ring.geometry?.dispose();
                    outpost.ring.material?.dispose();
                }
            }
            this.outposts = [];
        }

        // Reset POAs - mark all as not colonized
        if (this.pointsOfAttraction) {
            for (const poa of this.pointsOfAttraction) {
                poa.colonized = false;
                poa.status = undefined;
            }
        }

        // Reset colonization targets
        if (this.colonizationTargets) {
            for (const target of this.colonizationTargets) {
                target.colonized = false;
                target.status = undefined;
            }
        }

        // Reset empire bonuses
        this.empireBonuses = {
            production: 1.0,
            dyson_efficiency: 1.0,
            launch_efficiency: 1.0,
            development_speed: 1.0,
            research: 0,
            // Exotic bonuses
            probe_velocity: 1.0,
            expansion_radius: 1.0,
            auto_develop_chance: 0,
            stellar_forge_mult: 1.0,
            dark_energy_tap: 0,
            wormhole_network: 0,
            time_dilation: 1.0,
            exotic_matter: 0
        };

        // Reset build queue state
        this.probeBuildProgress = 0;
        this.currentBuildTarget = null;

        // Reset metrics history
        this.metricsHistory = {
            timestamps: [],
            colonizedCount: [],
            frontierRadius: [],
            productionTotal: [],
            dysonTotal: [],
            launchRate: [],
            poaCount: []
        };
        this.lastMetricsUpdate = 0;

        // Reset exploration radius
        this.explorationRadius = 0;

        // Reset stats
        this.starsInfluenced = 1;
        this.starsWithDyson = 1;
        this.dotsWithDyson = 1;

        // Reinitialize Sol as the only colonized star (G-type)
        const solStar = this.addColonizedStar(0, 0, 0, 100, 'G');
        if (solStar) {
            solStar.dysonUnits = 50;
            solStar.productionUnits = 50;

            const colorHex = this.getStarColor(100, 50, 'G');
            const colorObj = new THREE.Color(colorHex);
            this.colonizedStarsColors[0] = colorObj.r;
            this.colonizedStarsColors[1] = colorObj.g;
            this.colonizedStarsColors[2] = colorObj.b;
            this.rebuildColonizedStarsGeometry();
        }

        // Re-add Sol to colonization targets
        const solTarget = {
            x: this.solPosition.x,
            y: this.solPosition.y,
            z: this.solPosition.z,
            colonized: true,
            starData: solStar
        };
        if (this.colonizationTargets) {
            // Remove any existing Sol target
            this.colonizationTargets = this.colonizationTargets.filter(t =>
                Math.abs(t.x - this.solPosition.x) > 0.01 ||
                Math.abs(t.y - this.solPosition.y) > 0.01 ||
                Math.abs(t.z - this.solPosition.z) > 0.01
            );
            this.colonizationTargets.unshift(solTarget);
        }
        if (solStar) {
            solStar.targetData = solTarget;
        }

        // Clear notification queue
        this._notificationQueue = [];
        this._processingNotifications = false;

        // Clear target queue and markers
        if (this.queueMarkers) {
            for (const marker of this.queueMarkers) {
                if (marker && this.colonizationGroup) {
                    this.colonizationGroup.remove(marker);
                    marker.geometry?.dispose();
                    marker.material?.dispose();
                }
            }
            this.queueMarkers = [];
        }
        this.targetQueue = [];

        // Hide POA info panel
        const poaPanel = document.getElementById('poa-info-panel');
        if (poaPanel) {
            poaPanel.style.display = 'none';
        }

        // Hide target queue display
        const queuePanel = document.getElementById('target-queue-panel');
        if (queuePanel) {
            queuePanel.style.display = 'none';
        }

        // Update displays
        this.updateGalaxyStats();

        console.log('[StarMap] Galaxy view reset complete');
    }

    /**
     * Get accurate count of colonized stars
     * @returns {number} Number of colonized stars
     */
    getColonizedStarsCount() {
        return this.colonizedStars ? this.colonizedStars.length : 1;
    }

    /**
     * Dispose resources
     */
    dispose() {
        this.hide();

        if (this.renderer) {
            this.renderer.dispose();
        }

        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StarMapVisualization;
}

if (typeof window !== 'undefined') {
    window.StarMapVisualization = StarMapVisualization;
}
