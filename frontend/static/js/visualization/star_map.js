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

        // POA (Points of Attraction) System
        this.pointsOfAttraction = [];       // Named stars with bonuses
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

    /**
     * Create an IMMERSIVE Milky Way galaxy view
     *
     * You are INSIDE the galaxy. Sol is one star among hundreds of billions.
     * Accurate barred spiral structure based on astronomical data.
     *
     * References:
     * - https://www.astronomy.com/science/astronomers-update-our-galaxys-structure/
     * - https://galaxymap.org/drupal/node/171
     * - Sun at 8.35 kpc from center, rotation ~240 km/s
     * - 2 major arms (Scutum-Centaurus, Perseus) + 2 minor (Norma, Sagittarius)
     * - Central bar: 5 kpc × 1.5 kpc, inclined ~30°
     */
    createMilkyWayBackground() {
        // Scale: 1 unit = 100 parsecs = 326 light years
        // Milky Way disk radius: ~25-30 kpc, we use 25 kpc = 250 units
        // Full halo extends to ~100 kpc = 1000 units
        // Sun at 8.35 kpc = 83.5 units from center
        this.galaxyRadius = 400;      // 40 kpc - larger disk for more dramatic scale
        this.solDistance = 83.5;      // 8.35 kpc - unchanged (accurate)
        this.barLength = 60;          // 6 kpc - slightly larger bar
        this.barWidth = 18;           // 1.8 kpc - scaled bar

        // Sol's position in the Orion Spur (between Sagittarius and Perseus arms)
        // Angle from galactic center toward anticenter
        this.solAngle = Math.PI * 0.6;  // Roughly toward constellation Cygnus
        this.solPosition = {
            x: Math.cos(this.solAngle) * this.solDistance,
            y: 0,
            z: Math.sin(this.solAngle) * this.solDistance
        };

        // Create main galaxy group that will rotate
        this.galaxyGroup = new THREE.Group();

        // Build galaxy components - order matters for rendering
        this.createCentralBar();
        this.createCentralBulge();
        this.createSpiralArms();
        this.createDustLanes();           // Dark dust lanes in spiral arms
        this.createVolumetricNebulae();   // Glowing emission nebulae
        this.createInterarmStars();
        this.createOuterHalo();

        // Mark Sol's position - YOUR location in this vast galaxy
        this.createSolMarker();

        // Start camera following Sol
        if (this.solMesh) {
            this.followTarget = this.solMesh;
            this.cameraOffset = new THREE.Vector3(5, 10, 25);
        }

        // Initialize the colonization frontier system
        this.initColonizationSystem();

        this.scene.add(this.galaxyGroup);
    }

    /**
     * Create the central bar of the barred spiral
     */
    createCentralBar() {
        const barStars = 25000;  // Increased for larger galaxy
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(barStars * 3);
        const colors = new Float32Array(barStars * 3);

        const barAngle = Math.PI / 6;  // 30 degree inclination
        const color = new THREE.Color();

        for (let i = 0; i < barStars; i++) {
            // Elongated ellipsoid distribution
            const u = (Math.random() - 0.5) * 2;
            const v = (Math.random() - 0.5) * 2;
            const w = (Math.random() - 0.5) * 2;

            // Bar shape: long in one axis
            let x = u * this.barLength * 0.5;
            let z = v * this.barWidth * 0.5;
            let y = w * this.barWidth * 0.3;

            // Rotate by bar angle
            const rotX = x * Math.cos(barAngle) - z * Math.sin(barAngle);
            const rotZ = x * Math.sin(barAngle) + z * Math.cos(barAngle);

            // Density falls off from center
            const r = Math.sqrt(x*x + z*z + y*y);
            if (Math.random() > Math.exp(-r / 20)) continue;

            positions[i * 3] = rotX;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = rotZ;

            // Old stars in bar - subtle warm cream/pale yellow, not saturated
            color.setHSL(0.1 + Math.random() * 0.05, 0.15 + Math.random() * 0.15, 0.45 + Math.random() * 0.35);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.6,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending
        });

        const bar = new THREE.Points(geometry, material);
        this.galaxyGroup.add(bar);
    }

    /**
     * Create the central bulge using oblate Gaussian distribution
     * Stars density falls off gracefully using Gaussian function
     */
    createCentralBulge() {
        const bulgeStars = 8000;  // Reduced significantly for performance
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(bulgeStars * 3);
        const colors = new Float32Array(bulgeStars * 3);

        const color = new THREE.Color();

        // Oblate Gaussian parameters
        // σ_radial = 12 units (1.2 kpc scale length in disk plane)
        // σ_vertical = 6 units (0.6 kpc scale height - flattened)
        const sigmaRadial = 12;
        const sigmaVertical = 6;

        let starIndex = 0;
        let attempts = 0;
        const maxAttempts = bulgeStars * 3;

        while (starIndex < bulgeStars && attempts < maxAttempts) {
            attempts++;

            // Box-Muller transform for Gaussian random numbers
            const u1 = Math.random();
            const u2 = Math.random();
            const u3 = Math.random();
            const u4 = Math.random();

            // Generate Gaussian-distributed coordinates
            const gx = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigmaRadial;
            const gz = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2) * sigmaRadial;
            const gy = Math.sqrt(-2 * Math.log(u3)) * Math.cos(2 * Math.PI * u4) * sigmaVertical;

            // Calculate effective radius for color/brightness
            const r = Math.sqrt(gx * gx + gz * gz + gy * gy);

            // Soft cutoff - reject stars too far out (but allows gradual fade)
            if (r > 40) continue;

            positions[starIndex * 3] = gx;
            positions[starIndex * 3 + 1] = gy;
            positions[starIndex * 3 + 2] = gz;

            // Core stars - warm white/cream, brightness falls off with Gaussian profile
            const gaussianFalloff = Math.exp(-r * r / (2 * sigmaRadial * sigmaRadial));
            const brightness = 0.35 + gaussianFalloff * 0.5;
            color.setHSL(0.1 + Math.random() * 0.04, 0.1 + Math.random() * 0.08, brightness);
            colors[starIndex * 3] = color.r;
            colors[starIndex * 3 + 1] = color.g;
            colors[starIndex * 3 + 2] = color.b;

            starIndex++;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.4,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending
        });

        const bulge = new THREE.Points(geometry, material);
        this.galaxyGroup.add(bulge);

        // Add dramatic dust clouds around the core
        this.createCoreDustClouds();
    }

    /**
     * Create dramatic dust clouds around the galactic core
     * These obscure parts of the bulge for a more realistic look
     */
    createCoreDustClouds() {
        const dustCount = 15000;  // Reduced for clarity
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(dustCount * 3);
        const colors = new Float32Array(dustCount * 3);

        const color = new THREE.Color();

        for (let i = 0; i < dustCount; i++) {
            // Dust concentrated in a torus around the core
            const theta = Math.random() * Math.PI * 2;

            // Ring-like distribution at 8-25 units from center
            const ringRadius = 8 + Math.random() * 17;
            const spread = 5 + Math.random() * 8;

            // Add some randomness to create cloud structures
            const cloudOffset = Math.sin(theta * 3 + i * 0.01) * 3;

            const r = ringRadius + (Math.random() - 0.5) * spread + cloudOffset;
            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);

            // Very thin in vertical - dust settles to disk plane
            const y = (Math.random() - 0.5) * (Math.random() - 0.5) * 4;

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            // Dark dust - near black with very slight warm tint
            color.setHSL(0.08, 0.15, 0.02 + Math.random() * 0.03);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 2.0,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.7,
            blending: THREE.NormalBlending,
            depthWrite: false
        });

        const coreDust = new THREE.Points(geometry, material);
        this.galaxyGroup.add(coreDust);

        // Add additional dust layers at different radii
        this.createDustLayer(5, 15, 20000, 0.6);   // Inner dust ring
        this.createDustLayer(15, 30, 25000, 0.5);  // Middle dust ring
        this.createDustLayer(30, 50, 20000, 0.4);  // Outer dust ring
    }

    /**
     * Create a dust layer at specified radius range
     */
    createDustLayer(innerRadius, outerRadius, particleCount, opacity) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const color = new THREE.Color();

        for (let i = 0; i < particleCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const r = innerRadius + Math.random() * (outerRadius - innerRadius);

            // Add some structure with spiral influence
            const spiralOffset = Math.sin(theta * 2 + r * 0.1) * 3;
            const finalR = r + spiralOffset;

            const x = finalR * Math.cos(theta);
            const z = finalR * Math.sin(theta);
            const y = (Math.random() - 0.5) * (Math.random() - 0.5) * 3;

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            // Dark reddish-brown dust
            color.setHSL(0.05 + Math.random() * 0.05, 0.2, 0.02 + Math.random() * 0.02);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.5,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: opacity,
            blending: THREE.NormalBlending,
            depthWrite: false
        });

        const dustLayer = new THREE.Points(geometry, material);
        this.galaxyGroup.add(dustLayer);
    }

    /**
     * Create the spiral arms with proper structure
     * 2 major arms + 2 minor arms
     */
    createSpiralArms() {
        // Arm definitions: [startAngle, pitchAngle (degrees), strength, name]
        const arms = [
            { start: 0, pitch: 12, strength: 1.0, name: 'Scutum-Centaurus' },      // Major
            { start: Math.PI, pitch: 12, strength: 1.0, name: 'Perseus' },          // Major
            { start: Math.PI / 2, pitch: 14, strength: 0.6, name: 'Sagittarius' },  // Minor
            { start: -Math.PI / 2, pitch: 14, strength: 0.6, name: 'Norma' },       // Minor
        ];

        const starsPerArm = 100000;  // ~400k total dots spread across 4 arms - larger galaxy
        const totalStars = starsPerArm * arms.length;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(totalStars * 3);
        const colors = new Float32Array(totalStars * 3);

        const color = new THREE.Color();
        let starIndex = 0;

        for (const arm of arms) {
            const pitchRad = arm.pitch * Math.PI / 180;
            const tanPitch = Math.tan(pitchRad);

            for (let i = 0; i < starsPerArm * arm.strength; i++) {
                // Distance from center (arms start at end of bar)
                // Use exponential falloff for diffuse edges - no hard boundary
                const t = Math.random();
                const baseR = this.barLength * 0.4 + Math.pow(t, 0.5) * (this.galaxyRadius * 0.8 - this.barLength * 0.4);
                // Add scatter that increases toward edge for diffuse boundary
                const edgeScatter = (baseR / this.galaxyRadius) * Math.random() * this.galaxyRadius * 0.4;
                const r = baseR + edgeScatter * Math.pow(Math.random(), 2);

                // Logarithmic spiral: θ = ln(r/a) / tan(pitch)
                const spiralTheta = Math.log(r / (this.barLength * 0.4) + 0.1) / tanPitch;
                const baseAngle = arm.start + spiralTheta;

                // Arm width increases with radius - much more diffuse for realism
                // Real spiral arms are fuzzy, not sharp lines
                const armWidth = 0.25 + 0.2 * (r / this.galaxyRadius);
                const spread = (Math.random() + Math.random() + Math.random() - 1.5) * armWidth * 1.5;

                const angle = baseAngle + spread;
                const x = r * Math.cos(angle);
                const z = r * Math.sin(angle);

                // Disc with realistic thickness - thicker in center, thins at edge
                const discHeight = 4 + 3 * Math.exp(-r / 120);
                const y = (Math.random() - 0.5) * (Math.random() - 0.5) * discHeight;  // Gaussian-like

                positions[starIndex * 3] = x;
                positions[starIndex * 3 + 1] = y;
                positions[starIndex * 3 + 2] = z;

                // Realistic galaxy colors: mostly white/grey with subtle warmth
                // Real galaxies appear white/cream colored, not colorful
                const starType = Math.random();
                if (starType < 0.7) {
                    // Majority: white/grey stars (low saturation)
                    color.setHSL(0.1, 0.05 + Math.random() * 0.1, 0.4 + Math.random() * 0.4);
                } else if (starType < 0.9) {
                    // Some: warm cream/pale yellow
                    color.setHSL(0.12 + Math.random() * 0.05, 0.15 + Math.random() * 0.1, 0.5 + Math.random() * 0.3);
                } else {
                    // Few: slightly blue-white (hot stars)
                    color.setHSL(0.6, 0.1 + Math.random() * 0.1, 0.6 + Math.random() * 0.3);
                }

                colors[starIndex * 3] = color.r;
                colors[starIndex * 3 + 1] = color.g;
                colors[starIndex * 3 + 2] = color.b;

                starIndex++;
            }
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.4,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending
        });

        const spiralArms = new THREE.Points(geometry, material);
        this.galaxyGroup.add(spiralArms);

        // Store a sample of star positions as colonization targets
        this.buildColonizationTargets(positions, starIndex);
    }

    /**
     * Build array of colonizable star positions from spiral arm geometry
     * These are the actual galaxy stars that can be colonized
     */
    buildColonizationTargets(positions, totalStars) {
        this.colonizationTargets = [];
        this.allStarPositions = positions;
        this.totalStars = totalStars;
        this.explorationRadius = 0;

        console.log(`[StarMap] buildColonizationTargets: ${totalStars} stars from galaxy`);

        // Minimum distance from Sol (10 ly = 10/326 units)
        const minDistFromSol = 10 / 326;
        const solX = this.solPosition?.x || 0;
        const solY = this.solPosition?.y || 0;
        const solZ = this.solPosition?.z || 0;

        // EVERY dot is a colonizable star - no sampling
        let nanCount = 0;
        let zeroCount = 0;
        let tooCloseCount = 0;

        for (let i = 0; i < totalStars; i++) {
            const x = positions[i * 3];
            const y = positions[i * 3 + 1];
            const z = positions[i * 3 + 2];

            // Skip invalid positions
            if (isNaN(x) || isNaN(y) || isNaN(z)) {
                nanCount++;
                continue;
            }
            if (x === 0 && y === 0 && z === 0) {
                zeroCount++;
                continue;
            }

            // Skip stars too close to Sol (within 10 ly)
            const dx = x - solX;
            const dy = y - solY;
            const dz = z - solZ;
            const distFromSol = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (distFromSol < minDistFromSol) {
                tooCloseCount++;
                continue;
            }

            this.colonizationTargets.push({
                x: x,
                y: y,
                z: z,
                colonized: false,
                dysonProgress: 0,
                spectralClass: this.getRandomSpectralType()
            });
        }

        console.log(`[StarMap] ${this.colonizationTargets.length} colonizable stars (skipped ${nanCount} NaN, ${zeroCount} zero, ${tooCloseCount} too close to Sol)`);
    }

    /**
     * Add additional colonization targets (nebulae, white dwarfs, etc.)
     * Called after creating additional galaxy features
     */
    addColonizationTargets(positions, count, spectralClass = 'M') {
        if (!this.colonizationTargets) {
            this.colonizationTargets = [];
        }

        let added = 0;
        for (let i = 0; i < count; i++) {
            const x = positions[i * 3];
            const y = positions[i * 3 + 1];
            const z = positions[i * 3 + 2];

            // Skip invalid positions
            if (isNaN(x) || isNaN(y) || isNaN(z)) continue;
            if (x === 0 && y === 0 && z === 0) continue;

            this.colonizationTargets.push({
                x: x,
                y: y,
                z: z,
                colonized: false,
                dysonProgress: 0,
                spectralClass: spectralClass
            });
            added++;
        }

        console.log(`[StarMap] Added ${added} ${spectralClass}-type colonization targets`);
    }

    /**
     * Update exploration radius based on furthest colonized star
     */
    updateExplorationRadius() {
        let maxDist = 0;
        const solPos = this.solPosition || new THREE.Vector3(0, 0, 0);

        for (const star of this.colonizedStars) {
            const dist = star.position.distanceTo(solPos);
            if (dist > maxDist) maxDist = dist;
        }

        this.explorationRadius = maxDist;
        return maxDist;
    }

    /**
     * Generate new POAs near the exploration frontier
     * Called periodically as empire expands
     */
    generateFrontierPOAs() {
        if (!this.allStarPositions || !this.solPosition) return;

        // Remove colonized targets from the list
        this.colonizationTargets = this.colonizationTargets.filter(t => !t.colonized);

        // Count how many we need to add
        const spotsAvailable = this.maxVisiblePOAs - this.colonizationTargets.length;
        if (spotsAvailable <= 0) return;

        // Find stars near the frontier (1.2x to 2x exploration radius)
        const frontierMin = this.explorationRadius * 1.2;
        const frontierMax = this.explorationRadius * 2.0;
        const solPos = this.solPosition;

        // Get all existing POA positions for distance checking
        // This ensures new POAs fill gaps rather than clustering
        const existingPOAPositions = [
            ...this.pointsOfAttraction.map(p => p.position),
            ...this.colonizationTargets.map(t => ({ x: t.x, y: t.y, z: t.z }))
        ];

        // Minimum distance from any existing POA (in units, ~5 units = 1600 ly)
        const minPOADistance = 5;

        // Sample random stars near frontier
        const newTargets = [];
        const maxAttempts = spotsAvailable * 20;  // Try 20x the needed count

        for (let attempt = 0; attempt < maxAttempts && newTargets.length < Math.min(spotsAvailable, 20); attempt++) {
            // Random star index
            const i = Math.floor(Math.random() * this.totalStars);

            const x = this.allStarPositions[i * 3];
            const y = this.allStarPositions[i * 3 + 1];
            const z = this.allStarPositions[i * 3 + 2];

            // Skip invalid positions
            if (isNaN(x) || (x === 0 && y === 0 && z === 0)) continue;

            // Check distance from Sol
            const dx = x - solPos.x;
            const dy = y - solPos.y;
            const dz = z - solPos.z;
            const distFromSol = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // Only add if in frontier zone (from Sol's perspective)
            if (distFromSol >= frontierMin && distFromSol <= frontierMax) {
                // Check distance to nearest existing POA - fills gaps in coverage
                let minDistToPOA = Infinity;
                for (const pos of existingPOAPositions) {
                    const pdx = x - pos.x;
                    const pdy = y - pos.y;
                    const pdz = z - pos.z;
                    const distToPOA = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);
                    if (distToPOA < minDistToPOA) {
                        minDistToPOA = distToPOA;
                    }
                }

                // Also check distance to already-selected new targets
                for (const t of newTargets) {
                    const tdx = x - t.x;
                    const tdy = y - t.y;
                    const tdz = z - t.z;
                    const distToNew = Math.sqrt(tdx * tdx + tdy * tdy + tdz * tdz);
                    if (distToNew < minDistToPOA) {
                        minDistToPOA = distToNew;
                    }
                }

                // Only add if sufficiently far from other POAs (prevents clustering)
                if (minDistToPOA >= minPOADistance) {
                    // Check not already in targets (exact duplicate)
                    const alreadyExists = this.colonizationTargets.some(t =>
                        Math.abs(t.x - x) < 0.1 && Math.abs(t.y - y) < 0.1 && Math.abs(t.z - z) < 0.1
                    );

                    if (!alreadyExists) {
                        newTargets.push({
                            x: x,
                            y: y,
                            z: z,
                            colonized: false,
                            dysonProgress: 0,
                            spectralClass: this.getRandomSpectralType(),
                            frontierGenerated: true  // Mark as dynamically generated
                        });

                        // Add to existing positions for next iteration's distance check
                        existingPOAPositions.push({ x, y, z });
                    }
                }
            }
        }

        // Add new targets
        for (const target of newTargets) {
            this.colonizationTargets.push(target);
        }

        if (newTargets.length > 0) {
            console.log(`[StarMap] Generated ${newTargets.length} new frontier POAs (total: ${this.colonizationTargets.length})`);
        }
    }

    /**
     * Find nearest uncolonized star within hop distance.
     * Simple algorithm: find closest available target within range.
     */
    findNearestUncolonizedStar(fromX, fromY, fromZ, maxDistance = 200) {
        // Hop distance from slider (0-100) -> 100 ly to 10,000 ly
        const hopFactor = (this.hopDistancePolicy || 50) / 100;
        const hopDistanceLY = 100 + hopFactor * 9900;  // 100 ly to 10,000 ly
        const hopDistanceUnits = hopDistanceLY / 326;  // Convert to coordinate units

        // Search radius: 2x hop distance, minimum 5 units (~1600 ly)
        const searchRadius = Math.max(hopDistanceUnits * 2, 5);

        // Exploit/Explore slider (0=Exploit nearest, 100=Explore at step distance)
        const exploreChance = (this.expandPolicy || 50) / 100;
        const isExploring = Math.random() < exploreChance;

        let bestTarget = null;
        let bestDist = Infinity;
        let exploreTarget = null;
        let exploreBestDiff = Infinity;

        // Target distance for explore mode: hop distance ± 10%
        const exploreMinDist = hopDistanceUnits * 0.9;
        const exploreMaxDist = hopDistanceUnits * 1.1;

        for (const target of this.colonizationTargets) {
            if (target.colonized || target.status === 'fleet_sent') continue;

            const dx = target.x - fromX;
            const dy = target.y - fromY;
            const dz = target.z - fromZ;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // Skip targets too close (same star) or too far
            if (dist < 0.001 || dist > searchRadius) continue;

            // Track nearest for exploit mode (always)
            if (dist < bestDist) {
                bestDist = dist;
                bestTarget = target;
            }

            // Track best explore target (closest to ideal hop distance)
            if (dist >= exploreMinDist && dist <= exploreMaxDist) {
                const diff = Math.abs(dist - hopDistanceUnits);
                if (diff < exploreBestDiff) {
                    exploreBestDiff = diff;
                    exploreTarget = target;
                }
            }
        }

        // Return explore target if exploring and found one, otherwise nearest
        if (isExploring && exploreTarget) {
            return exploreTarget;
        }
        return bestTarget;
    }

    /**
     * Get active colonization corridors from a launch position
     * Returns normalized direction vectors towards each queued target
     */
    getActiveCorridors(fromX, fromY, fromZ) {
        const corridors = [];

        for (let i = 0; i < this.targetQueue.length; i++) {
            const entry = this.targetQueue[i];
            if (!entry || entry.target?.colonized) continue;

            const dx = entry.x - fromX;
            const dy = entry.y - fromY;
            const dz = entry.z - fromZ;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist > 0.1) {  // Avoid division by zero
                corridors.push({
                    id: entry.id,
                    name: entry.name,
                    dirX: dx / dist,
                    dirY: dy / dist,
                    dirZ: dz / dist,
                    distance: dist,
                    // Higher priority for earlier queue positions
                    priority: 1 - (i / Math.max(1, this.targetQueue.length)) * 0.5
                });
            }
        }

        return corridors;
    }

    /**
     * Get current average hop distance in kly (for display)
     */
    getAverageHopDistanceLY() {
        const hopFactor = (this.hopDistancePolicy || 58) / 100;
        // Log scale: 10 ly to 100k ly
        const minLogHop = 1;   // log10(10 ly)
        const maxLogHop = 5;   // log10(100000 ly)
        const logHop = minLogHop + (maxLogHop - minLogHop) * hopFactor;
        return Math.pow(10, logHop);
    }

    getAverageHopDistanceDisplay() {
        const ly = this.getAverageHopDistanceLY();
        if (ly >= 1000) {
            return `${(ly / 1000).toFixed(1)}k`;
        } else {
            return Math.round(ly).toString();
        }
    }

    /**
     * Create the inter-arm stellar population
     */
    createInterarmStars() {
        const interarmStars = 300000;  // Large inter-arm population for bigger galaxy
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(interarmStars * 3);
        const colors = new Float32Array(interarmStars * 3);

        const color = new THREE.Color();

        for (let i = 0; i < interarmStars; i++) {
            // Exponential disc distribution
            const r = 20 + Math.pow(Math.random(), 0.7) * (this.galaxyRadius - 20);
            const theta = Math.random() * Math.PI * 2;

            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);

            // Disc thickness - more spread vertically
            const discHeight = 3 + 2 * Math.exp(-r / 120);
            const y = (Math.random() - 0.5) * (Math.random() - 0.5) * discHeight;

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            // Dimmer stars between arms - grey/white, very low saturation
            color.setHSL(0.1, 0.05 + Math.random() * 0.08, 0.2 + Math.random() * 0.2);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.25,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending
        });

        const interarm = new THREE.Points(geometry, material);
        this.galaxyGroup.add(interarm);

        // Add interarm stars as white dwarf colonization targets
        this.addColonizationTargets(positions, interarmStars, 'D');  // D = white Dwarf
    }

    /**
     * Create the outer stellar halo
     */
    createOuterHalo() {
        // The stellar halo extends to ~100 kpc (1000 units) in reality
        // Contains old Population II stars, globular clusters
        const haloStars = 60000;  // Large halo for bigger galaxy
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(haloStars * 3);
        const colors = new Float32Array(haloStars * 3);

        const color = new THREE.Color();

        for (let i = 0; i < haloStars; i++) {
            // Spherical halo - extends far beyond disk
            // Density falls off as r^-3.5 in real halo
            const r = 50 + Math.pow(Math.random(), 0.25) * 600;  // Extends to ~650 units (65 kpc)
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);

            // Old, metal-poor halo stars - very dim grey/white
            color.setHSL(0.1, 0.03 + Math.random() * 0.05, 0.12 + Math.random() * 0.12);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.2,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });

        const halo = new THREE.Points(geometry, material);
        this.galaxyGroup.add(halo);
    }

    /**
     * Create dust lanes and nebulae throughout the galaxy
     * These add depth and realism to the spiral arms
     */
    createDustLanes() {
        const dustCount = 120000;  // Large dust lanes for bigger galaxy
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(dustCount * 3);
        const colors = new Float32Array(dustCount * 3);
        const sizes = new Float32Array(dustCount);

        const color = new THREE.Color();

        for (let i = 0; i < dustCount; i++) {
            // Follow spiral arm structure but offset
            const t = Math.random();
            const r = this.barLength * 0.5 + Math.pow(t, 0.6) * (this.galaxyRadius * 0.8);

            // Random arm
            const armIndex = Math.floor(Math.random() * 4);
            const armStart = [0, Math.PI, Math.PI / 2, -Math.PI / 2][armIndex];
            const pitch = [12, 12, 14, 14][armIndex] * Math.PI / 180;
            const tanPitch = Math.tan(pitch);

            const spiralTheta = Math.log(r / (this.barLength * 0.4) + 0.1) / tanPitch;
            const baseAngle = armStart + spiralTheta;

            // Dust sits in lanes along arms
            const laneOffset = (Math.random() - 0.5) * 0.08;
            const angle = baseAngle + laneOffset;

            const x = r * Math.cos(angle);
            const z = r * Math.sin(angle);
            const y = (Math.random() - 0.5) * 2 * Math.exp(-r / 180);

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            // Dark dust - near black, very subtle warmth
            color.setHSL(0.08, 0.1 + Math.random() * 0.1, 0.03 + Math.random() * 0.05);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;

            sizes[i] = 1 + Math.random() * 2;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            size: 1.5,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.4,
            blending: THREE.NormalBlending,
            depthWrite: false
        });

        const dustLanes = new THREE.Points(geometry, material);
        this.galaxyGroup.add(dustLanes);
    }

    /**
     * Create volumetric emission nebulae - glowing gas clouds
     * These are the colorful star-forming regions like Orion, Carina, etc.
     */
    createVolumetricNebulae() {
        // Major nebulae scattered through spiral arms
        const nebulaCount = 200;  // More nebulae for bigger galaxy
        this.nebulae = [];

        // Collect nebula center positions for colonization targets
        const nebulaCenters = new Float32Array(nebulaCount * 3);

        for (let i = 0; i < nebulaCount; i++) {
            // Position in spiral arms
            const t = Math.random();
            const r = 20 + Math.pow(t, 0.5) * (this.galaxyRadius - 20);

            // Random arm
            const armIndex = Math.floor(Math.random() * 4);
            const armStart = [0, Math.PI, Math.PI / 2, -Math.PI / 2][armIndex];
            const pitch = [12, 12, 14, 14][armIndex] * Math.PI / 180;
            const tanPitch = Math.tan(pitch);

            const spiralTheta = Math.log(r / (this.barLength * 0.4) + 0.1) / tanPitch;
            const baseAngle = armStart + spiralTheta + (Math.random() - 0.5) * 0.3;

            const x = r * Math.cos(baseAngle);
            const z = r * Math.sin(baseAngle);
            const y = (Math.random() - 0.5) * 3;

            // Store nebula center for colonization targets
            nebulaCenters[i * 3] = x;
            nebulaCenters[i * 3 + 1] = y;
            nebulaCenters[i * 3 + 2] = z;

            // Create nebula as a cluster of glowing particles
            const nebulaSize = 3 + Math.random() * 8;
            const particleCount = 200 + Math.floor(Math.random() * 300);
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(particleCount * 3);
            const colors = new Float32Array(particleCount * 3);

            // Realistic nebula colors - mostly dark grey/black dust clouds
            // Real nebulae appear as dark patches against star field, not glowing
            const nebulaTypes = [
                { h: 0.1, s: 0.05, l: 0.08 },  // Dark grey dust
                { h: 0.1, s: 0.08, l: 0.1 },   // Slightly lighter grey
                { h: 0.08, s: 0.1, l: 0.12 },  // Warm grey (faint)
                { h: 0.0, s: 0.05, l: 0.06 },  // Near black
                { h: 0.12, s: 0.12, l: 0.15 }  // Very faint warm tint
            ];
            const nebulaType = nebulaTypes[Math.floor(Math.random() * nebulaTypes.length)];
            const color = new THREE.Color();

            for (let j = 0; j < particleCount; j++) {
                // Irregular cloud shape
                const pr = Math.pow(Math.random(), 0.5) * nebulaSize;
                const ptheta = Math.random() * Math.PI * 2;
                const pphi = Math.acos(2 * Math.random() - 1);

                // Add some turbulence
                const turbulence = Math.sin(ptheta * 3) * Math.cos(pphi * 2) * 0.3;

                positions[j * 3] = x + pr * Math.sin(pphi) * Math.cos(ptheta) * (1 + turbulence);
                positions[j * 3 + 1] = y + pr * Math.sin(pphi) * Math.sin(ptheta) * 0.4;  // Flatten
                positions[j * 3 + 2] = z + pr * Math.cos(pphi) * (1 + turbulence);

                // Vary color slightly within nebula
                color.setHSL(
                    nebulaType.h + (Math.random() - 0.5) * 0.1,
                    nebulaType.s + (Math.random() - 0.5) * 0.2,
                    nebulaType.l + (Math.random() - 0.5) * 0.15
                );
                colors[j * 3] = color.r;
                colors[j * 3 + 1] = color.g;
                colors[j * 3 + 2] = color.b;
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

            const material = new THREE.PointsMaterial({
                size: 1.5,
                sizeAttenuation: true,
                vertexColors: true,
                transparent: true,
                opacity: 0.5,
                blending: THREE.NormalBlending,  // Normal blend for dark dust clouds
                depthWrite: false
            });

            const nebula = new THREE.Points(geometry, material);
            nebula.userData = {
                baseOpacity: 0.5,
                pulseSpeed: 0,  // No pulsing for realistic dust
                pulsePhase: 0
            };
            this.nebulae.push(nebula);
            this.galaxyGroup.add(nebula);
        }

        // Add nebula centers as colonization targets
        this.addColonizationTargets(nebulaCenters, nebulaCount, 'N');  // N = Nebula
    }

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

    /**
     * Initialize the nearby star POAs (Points of Attraction) around Sol
     * These are real stars with bonuses when colonized
     */
    initializeNearbyPOAs() {
        // Minimum distance from Sol - Sol should be isolated
        const minDistanceLY = 10;

        // Nearby stars - only those beyond 10 ly from Sol
        const nearbyStars = [
            {
                id: 'tau_ceti',
                name: 'Tau Ceti',
                distance: 11.9,
                spectralType: 'G8V',
                bonusType: 'habitable',
                bonusValue: 1,
                bonusDescription: 'Habitable Paradise: +1 Habitable World Discovered',
                lore: 'A Sun-like star long targeted by SETI. Multiple rocky planets orbit within its habitable zone.'
            },
            {
                id: 'epsilon_eridani',
                name: 'Epsilon Eridani',
                distance: 10.5,
                spectralType: 'K2V',
                bonusType: 'production',
                bonusValue: 0.10,
                bonusDescription: 'Young Star System: +10% Production Empire-wide',
                lore: 'A young star with a dusty debris disk. A gas giant orbits in its outer reaches.'
            }
        ].filter(star => star.distance >= minDistanceLY);

        // Convert distances to our coordinate system and place stars
        // Use random angles to distribute around Sol
        this.pointsOfAttraction = nearbyStars.map((star, index) => {
            // Convert light-years to our units (1 unit ≈ 326 ly)
            const distanceUnits = star.distance / 326;

            // Distribute around Sol at different angles
            const theta = (index / nearbyStars.length) * Math.PI * 2 + Math.random() * 0.5;
            const phi = Math.PI / 2 + (Math.random() - 0.5) * 0.3;  // Mostly in galactic plane

            const x = this.solPosition.x + distanceUnits * Math.sin(phi) * Math.cos(theta);
            const y = this.solPosition.y + distanceUnits * Math.cos(phi);
            const z = this.solPosition.z + distanceUnits * Math.sin(phi) * Math.sin(theta);

            return {
                ...star,
                position: { x, y, z },
                distanceUnits: distanceUnits,
                colonized: false,
                status: null  // null, 'fleet_sent', 'colonized'
            };
        });

        // Add Messier objects and deep sky POAs
        this.initializeDeepSkyPOAs();

        // Add halo globular clusters and sci-fi franchise POAs
        this.initializeHaloObjects();

        // Add POAs to colonization targets
        for (const poa of this.pointsOfAttraction) {
            this.colonizationTargets.push({
                x: poa.position.x,
                y: poa.position.y,
                z: poa.position.z,
                colonized: false,
                isPOA: true,
                poaData: poa
            });
        }

        // Create visual markers for POAs
        this.createPOAMarkers();

        console.log(`[StarMap] Initialized ${this.pointsOfAttraction.length} POAs (nearby stars + deep sky objects)`);
    }

    /**
     * Initialize Messier objects and other deep sky objects as POAs
     * These are nebulae, star clusters, and other interesting targets
     */
    initializeDeepSkyPOAs() {
        // POAs spread across the galaxy - distant targets for colony corridors
        // Distance in light years, converted to units (1 unit ≈ 326 ly)
        const deepSkyObjects = [
            // === NEARBY TARGETS (500-2000 ly) - First expansion goals ===
            { id: 'm45_pleiades', name: 'M45 Pleiades', type: 'cluster', distance: 444,
              bonusType: 'launch_efficiency', bonusValue: 0.0015, bonusDescription: 'Seven Sisters: -0.15% Launch CD', icon: '✦' },
            { id: 'm44_beehive', name: 'M44 Beehive', type: 'cluster', distance: 577,
              bonusType: 'production', bonusValue: 0.0008, bonusDescription: 'Stellar Swarm: +0.08% Production', icon: '✦' },
            { id: 'hyades', name: 'Hyades Cluster', type: 'cluster', distance: 153,
              bonusType: 'development_speed', bonusValue: 0.0010, bonusDescription: 'Nearby Bounty: +0.1% Dev Speed', icon: '✦' },
            { id: 'm42_orion', name: 'M42 Orion Nebula', type: 'nebula', distance: 1344,
              bonusType: 'production', bonusValue: 0.0015, bonusDescription: 'Stellar Nursery: +0.15% Production', icon: '☁' },
            { id: 'm27_dumbbell', name: 'M27 Dumbbell', type: 'nebula', distance: 1360,
              bonusType: 'dyson_efficiency', bonusValue: 0.0012, bonusDescription: 'White Dwarf Core: +0.12% Dyson', icon: '☁' },

            // === MID-RANGE TARGETS (2000-8000 ly) - Major expansion ===
            { id: 'm57_ring', name: 'M57 Ring Nebula', type: 'nebula', distance: 2300,
              bonusType: 'dyson_efficiency', bonusValue: 0.0010, bonusDescription: 'Stellar Remnant: +0.1% Dyson', icon: '☁' },
            { id: 'm8_lagoon', name: 'M8 Lagoon Nebula', type: 'nebula', distance: 4100,
              bonusType: 'production', bonusValue: 0.0012, bonusDescription: 'Resource Clouds: +0.12% Production', icon: '☁' },
            { id: 'm20_trifid', name: 'M20 Trifid Nebula', type: 'nebula', distance: 5200,
              bonusType: 'research', bonusValue: 0.08, bonusDescription: 'Triple Division: +0.08 Research', icon: '☁' },
            { id: 'm17_omega', name: 'M17 Omega Nebula', type: 'nebula', distance: 5500,
              bonusType: 'production', bonusValue: 0.0018, bonusDescription: 'Swan Nebula: +0.18% Production', icon: '☁' },
            { id: 'm1_crab', name: 'M1 Crab Nebula', type: 'nebula', distance: 6500,
              bonusType: 'research', bonusValue: 0.10, bonusDescription: 'Pulsar Core: +0.1 Research', icon: '☁' },
            { id: 'm16_eagle', name: 'M16 Eagle Nebula', type: 'nebula', distance: 7000,
              bonusType: 'production', bonusValue: 0.0020, bonusDescription: 'Pillars of Creation: +0.2% Production', icon: '☁' },
            { id: 'carina_nebula', name: 'Carina Nebula', type: 'nebula', distance: 7500,
              bonusType: 'production', bonusValue: 0.0025, bonusDescription: 'Massive Star Factory: +0.25% Production', icon: '☁' },
            { id: 'm4', name: 'M4 Cluster', type: 'cluster', distance: 7200,
              bonusType: 'development_speed', bonusValue: 0.0014, bonusDescription: 'Nearest Globular: +0.14% Dev Speed', icon: '✸' },

            // === DISTANT TARGETS (8000-20000 ly) - Deep space expansion ===
            { id: 'm22_sagittarius', name: 'M22 Cluster', type: 'cluster', distance: 10400,
              bonusType: 'dyson_efficiency', bonusValue: 0.0020, bonusDescription: 'Core Proximity: +0.2% Dyson', icon: '✸' },
            { id: '47_tucanae', name: '47 Tucanae', type: 'cluster', distance: 13400,
              bonusType: 'production', bonusValue: 0.0035, bonusDescription: 'Southern Jewel: +0.35% Production', icon: '✸' },
            { id: 'omega_centauri', name: 'Omega Centauri', type: 'cluster', distance: 17000,
              bonusType: 'production', bonusValue: 0.0050, bonusDescription: 'Largest Globular: +0.5% Production', icon: '✸' },
            { id: 'm13_hercules', name: 'M13 Hercules', type: 'cluster', distance: 22200,
              bonusType: 'production', bonusValue: 0.0030, bonusDescription: 'Ancient Nexus: +0.3% Production', icon: '✸' },
            { id: 'm5', name: 'M5 Cluster', type: 'cluster', distance: 24500,
              bonusType: 'production', bonusValue: 0.0024, bonusDescription: 'Rose Cluster: +0.24% Production', icon: '✸' },
            { id: 'm3', name: 'M3 Cluster', type: 'cluster', distance: 34000,
              bonusType: 'research', bonusValue: 0.12, bonusDescription: 'Variable Star Lab: +0.12 Research', icon: '✸' },
            { id: 'm15', name: 'M15 Cluster', type: 'cluster', distance: 33600,
              bonusType: 'research', bonusValue: 0.15, bonusDescription: 'Core Collapse: +0.15 Research', icon: '✸' },
            { id: 'm2', name: 'M2 Cluster', type: 'cluster', distance: 33000,
              bonusType: 'production', bonusValue: 0.0022, bonusDescription: 'Aquarius Ancient: +0.22% Production', icon: '✸' },

            // === GALACTIC CENTER (26000 ly) ===
            { id: 'sgr_a_star', name: 'Sagittarius A*', type: 'black_hole', distance: 26000,
              bonusType: 'dyson_efficiency', bonusValue: 0.0050, bonusDescription: 'Galactic Core: +0.5% Dyson', icon: '⊛' },

            // === FAR HALO TARGETS (40000-90000 ly) - Extreme expansion ===
            { id: 'm53', name: 'M53 Cluster', type: 'cluster', distance: 58000,
              bonusType: 'production', bonusValue: 0.0028, bonusDescription: 'Outer Halo: +0.28% Production', icon: '✸' },
            { id: 'm75', name: 'M75 Cluster', type: 'cluster', distance: 67500,
              bonusType: 'dyson_efficiency', bonusValue: 0.0024, bonusDescription: 'Dense Core: +0.24% Dyson', icon: '✸' },
            { id: 'sgr_dwarf', name: 'Sagittarius Dwarf', type: 'galaxy', distance: 70000,
              bonusType: 'research', bonusValue: 0.30, bonusDescription: 'Merging Galaxy: +0.3 Research', icon: '◎' },
            { id: 'm54', name: 'M54 Cluster', type: 'cluster', distance: 87400,
              bonusType: 'frontier_beacon', bonusValue: 30, bonusDescription: 'Dwarf Galaxy Core: Reveals 30 POAs', icon: '✸' },

            // === SPIRAL ARM WAYPOINTS - Corridor targets ===
            { id: 'orion_arm_inner', name: 'Orion Arm (Coreward)', type: 'arm', distance: 5000,
              bonusType: 'production', bonusValue: 0.0020, bonusDescription: 'Inner Orion: +0.2% Production', icon: '⌇' },
            { id: 'orion_arm_outer', name: 'Orion Arm (Rimward)', type: 'arm', distance: 8000,
              bonusType: 'production', bonusValue: 0.0018, bonusDescription: 'Outer Orion: +0.18% Production', icon: '⌇' },
            { id: 'perseus_arm', name: 'Perseus Arm', type: 'arm', distance: 6400,
              bonusType: 'production', bonusValue: 0.0035, bonusDescription: 'Major Arm: +0.35% Production', icon: '⌇' },
            { id: 'sagittarius_arm', name: 'Sagittarius Arm', type: 'arm', distance: 6500,
              bonusType: 'production', bonusValue: 0.0030, bonusDescription: 'Inner Arm: +0.3% Production', icon: '⌇' },
            { id: 'scutum_centaurus', name: 'Scutum-Centaurus Arm', type: 'arm', distance: 15000,
              bonusType: 'production', bonusValue: 0.0045, bonusDescription: 'Core Arm: +0.45% Production', icon: '⌇' },
            { id: 'norma_arm', name: 'Norma Arm', type: 'arm', distance: 12000,
              bonusType: 'production', bonusValue: 0.0040, bonusDescription: 'Near-Core: +0.4% Production', icon: '⌇' },
            { id: 'outer_arm', name: 'Outer Arm', type: 'arm', distance: 18000,
              bonusType: 'frontier_beacon', bonusValue: 40, bonusDescription: 'Galactic Frontier: Reveals 40 POAs', icon: '⌇' },

            // === EXTRAGALACTIC - Ultimate goals ===
            { id: 'lmc', name: 'Large Magellanic Cloud', type: 'galaxy', distance: 160000,
              bonusType: 'frontier_beacon', bonusValue: 100, bonusDescription: 'LMC: Reveals 100 POAs', icon: '◎' },
            { id: 'smc', name: 'Small Magellanic Cloud', type: 'galaxy', distance: 200000,
              bonusType: 'frontier_beacon', bonusValue: 75, bonusDescription: 'SMC: Reveals 75 POAs', icon: '◎' },

            // === HALO NEBULAE (above/below galactic disc) ===
            { id: 'halo_nebula_north', name: 'Boreal Nebula', type: 'halo_nebula', distance: 25000,
              bonusType: 'research', bonusValue: 0.20, bonusDescription: 'Halo Gas Cloud: +0.2 Research', icon: '☁',
              yOffset: 15000 },  // 15,000 ly above disc
            { id: 'halo_nebula_south', name: 'Austral Nebula', type: 'halo_nebula', distance: 28000,
              bonusType: 'research', bonusValue: 0.22, bonusDescription: 'Southern Halo: +0.22 Research', icon: '☁',
              yOffset: -18000 },  // 18,000 ly below disc
            { id: 'polar_cloud', name: 'Polar Cloud', type: 'halo_nebula', distance: 35000,
              bonusType: 'dyson_efficiency', bonusValue: 0.0015, bonusDescription: 'Pristine Gas: +0.15% Dyson', icon: '☁',
              yOffset: 25000 },
            { id: 'deep_halo_dust', name: 'Abyssal Dust', type: 'halo_nebula', distance: 45000,
              bonusType: 'production', bonusValue: 0.0020, bonusDescription: 'Metal-Rich Dust: +0.2% Production', icon: '☁',
              yOffset: -30000 },
            { id: 'zenith_cloud', name: 'Zenith Cloud', type: 'halo_nebula', distance: 55000,
              bonusType: 'frontier_beacon', bonusValue: 25, bonusDescription: 'High Vantage: Reveals 25 POAs', icon: '☁',
              yOffset: 40000 },
            { id: 'nadir_nebula', name: 'Nadir Nebula', type: 'halo_nebula', distance: 60000,
              bonusType: 'research', bonusValue: 0.30, bonusDescription: 'Deep South: +0.3 Research', icon: '☁',
              yOffset: -45000 },

            // === DWARF GALAXIES (small cute halo objects) ===
            { id: 'ursa_minor_dwarf', name: 'Ursa Minor Dwarf', type: 'dwarf_galaxy', distance: 225000,
              bonusType: 'research', bonusValue: 0.40, bonusDescription: 'Ancient Relic: +0.4 Research', icon: '✧',
              yOffset: 35000 },
            { id: 'draco_dwarf', name: 'Draco Dwarf', type: 'dwarf_galaxy', distance: 260000,
              bonusType: 'frontier_beacon', bonusValue: 50, bonusDescription: 'Dragon Galaxy: Reveals 50 POAs', icon: '✧',
              yOffset: 28000 },
            { id: 'carina_dwarf', name: 'Carina Dwarf', type: 'dwarf_galaxy', distance: 330000,
              bonusType: 'production', bonusValue: 0.0035, bonusDescription: 'Keel Galaxy: +0.35% Production', icon: '✧',
              yOffset: -20000 },
            { id: 'sculptor_dwarf', name: 'Sculptor Dwarf', type: 'dwarf_galaxy', distance: 290000,
              bonusType: 'research', bonusValue: 0.45, bonusDescription: 'Ancient Stars: +0.45 Research', icon: '✧',
              yOffset: -35000 },
            { id: 'fornax_dwarf', name: 'Fornax Dwarf', type: 'dwarf_galaxy', distance: 460000,
              bonusType: 'frontier_beacon', bonusValue: 60, bonusDescription: 'Furnace Galaxy: Reveals 60 POAs', icon: '✧',
              yOffset: -25000 },
            { id: 'sextans_dwarf', name: 'Sextans Dwarf', type: 'dwarf_galaxy', distance: 290000,
              bonusType: 'production', bonusValue: 0.0030, bonusDescription: 'Sextant Galaxy: +0.3% Production', icon: '✧',
              yOffset: 15000 },
            { id: 'leo_i', name: 'Leo I Dwarf', type: 'dwarf_galaxy', distance: 820000,
              bonusType: 'research', bonusValue: 0.60, bonusDescription: 'Lion Galaxy: +0.6 Research', icon: '✧',
              yOffset: 40000 },
            { id: 'leo_ii', name: 'Leo II Dwarf', type: 'dwarf_galaxy', distance: 690000,
              bonusType: 'frontier_beacon', bonusValue: 70, bonusDescription: 'Lesser Lion: Reveals 70 POAs', icon: '✧',
              yOffset: 30000 },

            // === FAR SIDE OF GALAXY (opposite from Sol) ===
            { id: 'far_cygnus', name: 'Far Cygnus Reach', type: 'arm', distance: 60000,
              bonusType: 'production', bonusValue: 0.0040, bonusDescription: 'Distant Arm: +0.4% Production', icon: '⌇',
              farSide: true },
            { id: 'antipodal_arm', name: 'Antipodal Arm', type: 'arm', distance: 75000,
              bonusType: 'production', bonusValue: 0.0050, bonusDescription: 'Opposite Reach: +0.5% Production', icon: '⌇',
              farSide: true },
            { id: 'far_norma', name: 'Far Norma Region', type: 'arm', distance: 55000,
              bonusType: 'dyson_efficiency', bonusValue: 0.0030, bonusDescription: 'Far Norma: +0.3% Dyson', icon: '⌇',
              farSide: true },
            { id: 'trans_core_nebula', name: 'Trans-Core Nebula', type: 'nebula', distance: 52000,
              bonusType: 'production', bonusValue: 0.0035, bonusDescription: 'Beyond Core: +0.35% Production', icon: '☁',
              farSide: true },
            { id: 'outer_perseus_far', name: 'Outer Perseus (Far)', type: 'arm', distance: 70000,
              bonusType: 'frontier_beacon', bonusValue: 45, bonusDescription: 'Far Perseus: Reveals 45 POAs', icon: '⌇',
              farSide: true },
            { id: 'galaxy_edge_far', name: 'Far Rim', type: 'arm', distance: 85000,
              bonusType: 'frontier_beacon', bonusValue: 55, bonusDescription: 'Galaxy Edge: Reveals 55 POAs', icon: '⌇',
              farSide: true },
            { id: 'dark_sector', name: 'Dark Sector', type: 'dark_region', distance: 65000,
              bonusType: 'research', bonusValue: 0.35, bonusDescription: 'Hidden Stars: +0.35 Research', icon: '◌',
              farSide: true },
            { id: 'far_halo_cluster', name: 'Palomar 14', type: 'cluster', distance: 240000,
              bonusType: 'production', bonusValue: 0.0045, bonusDescription: 'Distant Globular: +0.45% Production', icon: '✸',
              farSide: true, yOffset: 50000 },

            // === HALO GLOBULAR CLUSTERS (real NGC/Palomar objects - EXOTIC BONUSES) ===
            { id: 'ngc_2419', name: 'NGC 2419 (Intergalactic Wanderer)', type: 'globular_cluster', distance: 275000,
              bonusType: 'wormhole_network', bonusValue: 3, bonusDescription: 'Intergalactic Wanderer: +3 Wormhole Connections', icon: '⬡',
              yOffset: 50000 },
            { id: 'ngc_5466', name: 'NGC 5466', type: 'globular_cluster', distance: 51800,
              bonusType: 'probe_velocity', bonusValue: 0.15, bonusDescription: 'Tidal Streamers: +15% Probe Speed', icon: '⚡',
              yOffset: 42000 },
            { id: 'ngc_6229', name: 'NGC 6229', type: 'globular_cluster', distance: 99400,
              bonusType: 'stellar_forge', bonusValue: 0.08, bonusDescription: 'Ancient Forge: +8% All Bonuses Multiplier', icon: '⚙',
              yOffset: 35000 },
            { id: 'ngc_7006', name: 'NGC 7006', type: 'globular_cluster', distance: 135000,
              bonusType: 'expansion_radius', bonusValue: 0.20, bonusDescription: 'Outer Sentinel: +20% Probe Range', icon: '◎',
              yOffset: -38000 },
            { id: 'pal_3', name: 'Palomar 3', type: 'globular_cluster', distance: 302000,
              bonusType: 'time_dilation', bonusValue: 0.10, bonusDescription: 'Temporal Anomaly: +10% Time Flow', icon: '⏱',
              yOffset: -52000 },
            { id: 'pal_4', name: 'Palomar 4', type: 'globular_cluster', distance: 357000,
              bonusType: 'exotic_matter', bonusValue: 100, bonusDescription: 'Exotic Matter Cache: +100 Exotic Matter', icon: '✧',
              yOffset: 60000 },
            { id: 'pal_15', name: 'Palomar 15', type: 'globular_cluster', distance: 145000,
              bonusType: 'auto_develop', bonusValue: 0.05, bonusDescription: 'Self-Replicators: +5% Auto-Develop Chance', icon: '∞',
              yOffset: -45000 },
            { id: 'am_1', name: 'AM 1 (Madore\'s Object)', type: 'globular_cluster', distance: 398000,
              bonusType: 'all_bonuses', bonusValue: 0.15, bonusDescription: 'ULTIMATE: +15% ALL Empire Bonuses!', icon: '★',
              yOffset: -70000 },
            { id: 'eridanus_cluster', name: 'Eridanus Cluster', type: 'globular_cluster', distance: 295000,
              bonusType: 'dark_energy_tap', bonusValue: 50, bonusDescription: 'Dark Energy Nexus: +50 Energy/tick', icon: '◈',
              yOffset: 55000 },
            { id: 'pyxis_globular', name: 'Pyxis Globular', type: 'globular_cluster', distance: 130000,
              bonusType: 'wormhole_network', bonusValue: 2, bonusDescription: 'Navigation Beacon: +2 Wormhole Links', icon: '⬡',
              yOffset: -30000 },
            { id: 'ko_1', name: 'Ko 1 (Koposov 1)', type: 'globular_cluster', distance: 160000,
              bonusType: 'probe_velocity', bonusValue: 0.12, bonusDescription: 'Velocity Amplifier: +12% Probe Speed', icon: '⚡',
              yOffset: 48000 },
            { id: 'ko_2', name: 'Ko 2 (Koposov 2)', type: 'globular_cluster', distance: 115000,
              bonusType: 'auto_develop', bonusValue: 0.03, bonusDescription: 'Tidal Nursery: +3% Auto-Develop', icon: '∞',
              yOffset: -40000 },

            // === NORTHERN HALO NEBULAE (exotic bonuses for distant objects) ===
            { id: 'northern_crown_nebula', name: 'Northern Crown Nebula', type: 'halo_nebula', distance: 32000,
              bonusType: 'probe_velocity', bonusValue: 0.08, bonusDescription: 'Crown Boost: +8% Probe Speed', icon: '⚡',
              yOffset: 20000 },
            { id: 'apex_cloud', name: 'Apex Cloud', type: 'halo_nebula', distance: 42000,
              bonusType: 'expansion_radius', bonusValue: 0.10, bonusDescription: 'Zenith View: +10% Probe Range', icon: '◎',
              yOffset: 28000 },
            { id: 'high_chimneys', name: 'High Chimneys', type: 'halo_nebula', distance: 38000,
              bonusType: 'dark_energy_tap', bonusValue: 20, bonusDescription: 'Energy Vents: +20 Energy/tick', icon: '◈',
              yOffset: 22000 },
            { id: 'boreal_drift', name: 'Boreal Drift', type: 'halo_nebula', distance: 48000,
              bonusType: 'time_dilation', bonusValue: 0.05, bonusDescription: 'Temporal Current: +5% Time Flow', icon: '⏱',
              yOffset: 35000 },
            { id: 'celestial_fountain', name: 'Celestial Fountain', type: 'halo_nebula', distance: 52000,
              bonusType: 'exotic_matter', bonusValue: 30, bonusDescription: 'Exotic Springs: +30 Exotic Matter', icon: '✧',
              yOffset: 38000 },
            { id: 'circumpolar_veil', name: 'Circumpolar Veil', type: 'halo_nebula', distance: 58000,
              bonusType: 'stellar_forge', bonusValue: 0.05, bonusDescription: 'Polar Forge: +5% All Bonuses', icon: '⚙',
              yOffset: 45000 },
            { id: 'hyperboreal_mist', name: 'Hyperboreal Mist', type: 'halo_nebula', distance: 65000,
              bonusType: 'wormhole_network', bonusValue: 1, bonusDescription: 'Hyperspace Rift: +1 Wormhole Link', icon: '⬡',
              yOffset: 52000 },
            { id: 'north_galactic_plume', name: 'North Galactic Plume', type: 'halo_nebula', distance: 72000,
              bonusType: 'auto_develop', bonusValue: 0.04, bonusDescription: 'Genesis Plume: +4% Auto-Develop', icon: '∞',
              yOffset: 58000 },
            { id: 'aurora_superior', name: 'Aurora Superior', type: 'halo_nebula', distance: 80000,
              bonusType: 'all_bonuses', bonusValue: 0.08, bonusDescription: 'Superior Light: +8% ALL Bonuses!', icon: '★',
              yOffset: 65000 },

            // === SOUTHERN HALO NEBULAE (exotic bonuses) ===
            { id: 'southern_abyss', name: 'Southern Abyss', type: 'halo_nebula', distance: 30000,
              bonusType: 'dark_energy_tap', bonusValue: 25, bonusDescription: 'Void Energy: +25 Energy/tick', icon: '◈',
              yOffset: -18000 },
            { id: 'keel_cloud', name: 'Keel Cloud', type: 'halo_nebula', distance: 36000,
              bonusType: 'probe_velocity', bonusValue: 0.10, bonusDescription: 'Keel Winds: +10% Probe Speed', icon: '⚡',
              yOffset: -22000 },
            { id: 'antipodal_drift', name: 'Antipodal Drift', type: 'halo_nebula', distance: 44000,
              bonusType: 'expansion_radius', bonusValue: 0.12, bonusDescription: 'Far Reach: +12% Probe Range', icon: '◎',
              yOffset: -28000 },
            { id: 'austral_veil', name: 'Austral Veil', type: 'halo_nebula', distance: 50000,
              bonusType: 'time_dilation', bonusValue: 0.06, bonusDescription: 'Southern Flux: +6% Time Flow', icon: '⏱',
              yOffset: -35000 },
            { id: 'sub_galactic_plume', name: 'Sub-Galactic Plume', type: 'halo_nebula', distance: 56000,
              bonusType: 'exotic_matter', bonusValue: 40, bonusDescription: 'Exotic Depths: +40 Exotic Matter', icon: '✧',
              yOffset: -42000 },
            { id: 'magellanic_bridge_remnant', name: 'Magellanic Bridge Remnant', type: 'halo_nebula', distance: 62000,
              bonusType: 'wormhole_network', bonusValue: 2, bonusDescription: 'Bridge Fragment: +2 Wormhole Links', icon: '⬡',
              yOffset: -48000 },
            { id: 'southern_chimney', name: 'Southern Chimney', type: 'halo_nebula', distance: 68000,
              bonusType: 'stellar_forge', bonusValue: 0.06, bonusDescription: 'Deep Forge: +6% All Bonuses', icon: '⚙',
              yOffset: -55000 },
            { id: 'deep_south_fog', name: 'Deep South Fog', type: 'halo_nebula', distance: 75000,
              bonusType: 'auto_develop', bonusValue: 0.05, bonusDescription: 'Genesis Fog: +5% Auto-Develop', icon: '∞',
              yOffset: -62000 },
            { id: 'aurora_inferior', name: 'Aurora Inferior', type: 'halo_nebula', distance: 82000,
              bonusType: 'all_bonuses', bonusValue: 0.10, bonusDescription: 'Inferior Light: +10% ALL Bonuses!', icon: '★',
              yOffset: -68000 },

            // === SCATTERED HALO OBJECTS (special exotic bonuses) ===
            { id: 'galactic_corona_east', name: 'Galactic Corona East', type: 'halo_nebula', distance: 40000,
              bonusType: 'expansion_radius', bonusValue: 0.08, bonusDescription: 'Eastern Reach: +8% Probe Range', icon: '◎',
              yOffset: 18000 },
            { id: 'galactic_corona_west', name: 'Galactic Corona West', type: 'halo_nebula', distance: 42000,
              bonusType: 'probe_velocity', bonusValue: 0.08, bonusDescription: 'Western Winds: +8% Probe Speed', icon: '⚡',
              yOffset: -16000 },
            { id: 'tidal_stream_alpha', name: 'Tidal Stream Alpha', type: 'halo_nebula', distance: 55000,
              bonusType: 'time_dilation', bonusValue: 0.07, bonusDescription: 'Time Stream A: +7% Time Flow', icon: '⏱',
              yOffset: 30000 },
            { id: 'tidal_stream_beta', name: 'Tidal Stream Beta', type: 'halo_nebula', distance: 58000,
              bonusType: 'time_dilation', bonusValue: 0.07, bonusDescription: 'Time Stream B: +7% Time Flow', icon: '⏱',
              yOffset: -32000 },
            { id: 'hvc_complex_a', name: 'High Velocity Cloud A', type: 'halo_nebula', distance: 45000,
              bonusType: 'probe_velocity', bonusValue: 0.15, bonusDescription: 'HVC Boost A: +15% Probe Speed', icon: '⚡',
              yOffset: 25000 },
            { id: 'hvc_complex_c', name: 'High Velocity Cloud C', type: 'halo_nebula', distance: 48000,
              bonusType: 'probe_velocity', bonusValue: 0.15, bonusDescription: 'HVC Boost C: +15% Probe Speed', icon: '⚡',
              yOffset: -27000 },
            { id: 'smith_cloud', name: 'Smith Cloud', type: 'halo_nebula', distance: 40000,
              bonusType: 'exotic_matter', bonusValue: 50, bonusDescription: 'Exotic Infall: +50 Exotic Matter', icon: '✧',
              yOffset: -8000 },
            { id: 'fermi_bubbles_north', name: 'Fermi Bubble North', type: 'halo_nebula', distance: 25000,
              bonusType: 'dark_energy_tap', bonusValue: 75, bonusDescription: 'Core Energy N: +75 Energy/tick', icon: '◈',
              yOffset: 25000 },
            { id: 'fermi_bubbles_south', name: 'Fermi Bubble South', type: 'halo_nebula', distance: 25000,
              bonusType: 'dark_energy_tap', bonusValue: 75, bonusDescription: 'Core Energy S: +75 Energy/tick', icon: '◈',
              yOffset: -25000 }
        ];

        // Position deep sky objects in the galaxy
        for (const obj of deepSkyObjects) {
            const distanceUnits = obj.distance / 326;

            // Position based on object type and distance
            // Spread them around the galaxy realistically
            let angle = this.hashStringToAngle(obj.id);

            // Far side objects: add PI to place them opposite Sol
            if (obj.farSide) {
                angle += Math.PI;
            }

            const heightVar = (Math.random() - 0.5) * 0.2;  // Slight vertical spread

            // Objects closer to galactic center vs in disk
            let r, theta, yPos;
            if (obj.id === 'sgr_a_star') {
                // Galactic center
                r = 0;
                theta = 0;
            } else if (obj.type === 'globular_cluster') {
                // Globular clusters in halo - more spherical distribution
                r = distanceUnits * 0.8;
                theta = angle;
            } else {
                // Disk objects - follow spiral structure loosely
                r = Math.min(distanceUnits, this.galaxyRadius * 0.9);
                theta = angle;
            }

            const x = this.solPosition.x + r * Math.cos(theta);

            // Handle vertical offset for halo objects (yOffset in light years)
            if (obj.yOffset) {
                yPos = this.solPosition.y + (obj.yOffset / 326);  // Convert ly to units
            } else {
                yPos = this.solPosition.y + distanceUnits * heightVar;
            }

            const z = this.solPosition.z + r * Math.sin(theta);

            this.pointsOfAttraction.push({
                ...obj,
                spectralType: obj.type,  // Use type for color coding
                position: { x, y: yPos, z },
                distanceUnits: distanceUnits,
                colonized: false,
                status: null,
                isDeepSky: true,
                isHalo: !!obj.yOffset,  // Mark halo objects
                isFarSide: !!obj.farSide  // Mark far-side objects
            });
        }
    }

    /**
     * Initialize halo globular clusters and sci-fi franchise POAs
     * These are above/below the galactic disc in the stellar halo
     * Franchises are discovered as probes explore outward
     */
    initializeHaloObjects() {
        // Franchise clusters - each is a mini "galaxy" in the halo
        // All franchises start visible with stars at their locations
        this.franchises = {};
        this.discoveredFranchises = new Set(['hyperion', 'relay', 'zones', 'federation', 'empire', 'citadel', 'imperium']);

        const franchiseData = {
            // === THE RELAY - Special far north beacon ===
            relay: {
                name: 'The Relay',
                description: 'An ancient communications array of unknown origin',
                color: 0x00ffff,
                icon: '◈',
                baseY: 400,  // Very far north of disc
                baseRadius: 50,
                systems: [
                    { id: 'relay_prime', name: 'Relay Prime', bonus: 'research', value: 100, desc: 'Central Hub: +100 Research' },
                    { id: 'relay_alpha', name: 'Relay Alpha', bonus: 'frontier_beacon', value: 50, desc: 'Reveals 50 POAs' },
                    { id: 'relay_beta', name: 'Relay Beta', bonus: 'production', value: 0.5, desc: '+50% Production' }
                ]
            },

            // === HYPERION CANTOS - Hegemony WorldWeb (visible from start) ===
            hyperion: {
                name: 'Hegemony WorldWeb',
                description: 'The farcaster-linked worlds of the Hegemony of Man',
                color: 0xffaa44,
                icon: '✦',
                baseY: 0,              // Within galactic disc
                baseRadius: 260,       // Outer rim ~85,000 ly from center (85000/326)
                outerRim: true,        // Spawn on outer rim (90-100% of radius)
                spreadY: 5,            // Slight vertical spread within disc thickness
                systems: [
                    // Core Worlds
                    { id: 'hyperion_world', name: 'Hyperion', bonus: 'research', value: 50, desc: 'Time Tombs: +50 Research' },
                    { id: 'tau_ceti_center', name: 'Tau Ceti Center', bonus: 'production', value: 0.5, desc: 'WorldWeb Capital: +50% Production' },
                    { id: 'pacem', name: 'Pacem', bonus: 'dyson_efficiency', value: 0.35, desc: 'Pax Vatican: +35% Dyson' },
                    { id: 'lusus', name: 'Lusus', bonus: 'production', value: 0.4, desc: 'Hive World: +40% Production' },
                    // Templar & Nature Worlds
                    { id: 'gods_grove', name: "God's Grove", bonus: 'research', value: 30, desc: 'Templar Homeworld: +30 Research' },
                    { id: 'maui_covenant', name: 'Maui-Covenant', bonus: 'research', value: 25, desc: 'Motile Isles: +25 Research' },
                    { id: 'mare_infinitus', name: 'Mare Infinitus', bonus: 'production', value: 0.3, desc: 'Ocean World: +30% Production' },
                    { id: 'garden', name: 'Garden', bonus: 'research', value: 20, desc: 'Forest World: +20 Research' },
                    // Industrial & Mining
                    { id: 'heavens_gate', name: "Heaven's Gate", bonus: 'production', value: 0.35, desc: 'Vega Mining: +35% Production' },
                    { id: 'bressia', name: 'Bressia', bonus: 'production', value: 0.45, desc: 'Military World: +45% Production' },
                    { id: 'fuji', name: 'Fuji', bonus: 'production', value: 0.25, desc: 'Industrial Hub: +25% Production' },
                    { id: 'nordholm', name: 'Nordholm', bonus: 'production', value: 0.3, desc: 'Mining Colony: +30% Production' },
                    // Cultural & Research
                    { id: 'renaissance_v', name: 'Renaissance Vector', bonus: 'research', value: 35, desc: 'Art World: +35 Research' },
                    { id: 'asquith', name: 'Asquith', bonus: 'research', value: 25, desc: 'Sad King Billy: +25 Research' },
                    { id: 'esperance', name: 'Esperance', bonus: 'research', value: 20, desc: 'Hope World: +20 Research' },
                    { id: 'metaxas', name: 'Metaxas', bonus: 'research', value: 15, desc: 'Academic World: +15 Research' },
                    // Old Neighborhood (Near Sol)
                    { id: 'barnards_world', name: "Barnard's World", bonus: 'frontier_beacon', value: 25, desc: 'Reveals 25 POAs' },
                    { id: 'sol_draconi', name: 'Sol Draconi Septem', bonus: 'research', value: 30, desc: 'Ancient Colony: +30 Research' },
                    { id: 'ngc_2629', name: 'NGC 2629-4BIV', bonus: 'production', value: 0.2, desc: 'Wolf 359: +20% Production' },
                    // Religious Worlds
                    { id: 'new_mecca', name: 'New Mecca', bonus: 'research', value: 20, desc: 'Islamic World: +20 Research' },
                    { id: 'qom_riyadh', name: 'Qom-Riyadh', bonus: 'research', value: 15, desc: 'Desert Faith: +15 Research' },
                    { id: 'hebron', name: 'Hebron', bonus: 'research', value: 15, desc: 'Holy Land: +15 Research' },
                    // Deneb Systems
                    { id: 'deneb_drei', name: 'Deneb Drei', bonus: 'production', value: 0.35, desc: 'Deneb III: +35% Production' },
                    { id: 'deneb_vier', name: 'Deneb Vier', bonus: 'production', value: 0.3, desc: 'Deneb IV: +30% Production' },
                    // Labyrinthine Worlds
                    { id: 'armaghast', name: 'Armaghast', bonus: 'research', value: 40, desc: 'Labyrinth World: +40 Research' },
                    { id: 'svoboda', name: 'Svoboda', bonus: 'research', value: 35, desc: 'Labyrinth World: +35 Research' },
                    // Outback & Frontier
                    { id: 'ixion', name: 'Ixion', bonus: 'frontier_beacon', value: 15, desc: 'Reveals 15 POAs' },
                    { id: 'madhya', name: 'Madhya', bonus: 'production', value: 0.2, desc: 'Outback World: +20% Production' },
                    { id: 'nuevo_madrid', name: 'Nuevo Madrid', bonus: 'production', value: 0.25, desc: 'Spanish Colony: +25% Production' },
                    // Asian Worlds
                    { id: 'tien_shan', name: "T'ien Shan", bonus: 'research', value: 25, desc: 'Mountain World: +25 Research' },
                    { id: 'tsingtao', name: 'Tsingtao-Hsishuang Panna', bonus: 'production', value: 0.3, desc: 'Trade Hub: +30% Production' },
                    // Exotic Worlds
                    { id: 'nevermore', name: 'Nevermore', bonus: 'research', value: 20, desc: 'Mystery World: +20 Research' },
                    { id: 'grass', name: 'Grass', bonus: 'research', value: 15, desc: 'Prairie World: +15 Research' },
                    { id: 'whirl', name: 'Whirl', bonus: 'dyson_efficiency', value: 0.2, desc: 'Storm World: +20% Dyson' },
                    { id: 'vitus_gray', name: 'Vitus-Gray-Balianus B', bonus: 'production', value: 0.25, desc: 'Binary World: +25% Production' }
                ]
            },

            // === ZONES OF THOUGHT - Fire Upon the Deep ===
            zones: {
                name: 'Zones of Thought',
                description: 'Where physics changes with galactic position',
                color: 0x8844ff,
                icon: '◎',
                baseY: 0,
                baseRadius: 130,
                spreadY: 5,
                systems: [
                    // Human Civilizations
                    { id: 'straumli_realm', name: 'Straumli Realm', bonus: 'research', value: 100, desc: 'Archive World: +100 Research' },
                    { id: 'nyjora', name: 'Nyjora', bonus: 'production', value: 0.4, desc: 'Human Origin: +40% Production' },
                    { id: 'sjandra_kei', name: 'Sjandra Kei', bonus: 'research', value: 60, desc: "Ravna's World: +60 Research" },
                    // The Tines
                    { id: 'tines_world', name: "Tines' World", bonus: 'research', value: 50, desc: 'Pack Minds: +50 Research' },
                    { id: 'woodcarvers_domain', name: "Woodcarver's Domain", bonus: 'production', value: 0.35, desc: 'Tines Kingdom: +35% Production' },
                    { id: 'flenser_realm', name: "Flenser's Realm", bonus: 'production', value: 0.3, desc: 'Dark Kingdom: +30% Production' },
                    // Net Infrastructure
                    { id: 'relay_station', name: 'Relay', bonus: 'frontier_beacon', value: 50, desc: 'Net Hub: Reveals 50 POAs' },
                    { id: 'harmonious_repose', name: 'Harmonious Repose', bonus: 'research', value: 45, desc: 'Alien Refuge: +45 Research' },
                    { id: 'net_of_lies', name: 'Net of a Million Lies', bonus: 'research', value: 35, desc: 'Information Hub: +35 Research' },
                    // Zone Boundaries
                    { id: 'slow_zone_edge', name: 'Slow Zone Edge', bonus: 'dyson_efficiency', value: 0.3, desc: 'Physics Boundary: +30% Dyson' },
                    { id: 'beyond_gateway', name: 'The Beyond', bonus: 'frontier_beacon', value: 40, desc: 'FTL Zone: Reveals 40 POAs' },
                    { id: 'transcend_boundary', name: 'The Transcend', bonus: 'research', value: 120, desc: 'Power Realm: +120 Research' },
                    { id: 'unthinking_depths', name: 'Unthinking Depths', bonus: 'production', value: 0.5, desc: 'Core Region: +50% Production' },
                    // The Blight & Powers
                    { id: 'blight_origin', name: 'Blight Origin', bonus: 'research', value: 80, desc: 'Fallen Archive: +80 Research' },
                    { id: 'old_one_realm', name: "Old One's Realm", bonus: 'research', value: 70, desc: 'Transcendent: +70 Research' },
                    { id: 'countermeasure_zone', name: 'Countermeasure Zone', bonus: 'dyson_efficiency', value: 0.4, desc: 'Zone Shift: +40% Dyson' },
                    // Alien Civilizations
                    { id: 'skroderider_groves', name: 'Skroderider Groves', bonus: 'research', value: 40, desc: 'Plant Minds: +40 Research' },
                    { id: 'aprahanti_space', name: 'Aprahanti Space', bonus: 'production', value: 0.35, desc: 'Traders: +35% Production' },
                    { id: 'vrinimi_org', name: 'Vrinimi Organization', bonus: 'frontier_beacon', value: 30, desc: 'Reveals 30 POAs' },
                    { id: 'butterflies_realm', name: 'Butterflies of Realm', bonus: 'research', value: 25, desc: 'Exotic Minds: +25 Research' }
                ]
            },

            // === STAR TREK - United Federation of Planets ===
            federation: {
                name: 'United Federation',
                description: 'Infinite diversity in infinite combinations',
                color: 0x4488ff,
                icon: '✧',
                baseY: 5,
                baseRadius: 90,
                spreadY: 5,
                systems: [
                    { id: 'vulcan', name: 'Vulcan', bonus: 'research', value: 60, desc: 'Logic World: +60 Research' },
                    { id: 'qonos', name: "Qo'noS", bonus: 'production', value: 0.45, desc: 'Warrior World: +45% Production' },
                    { id: 'romulus', name: 'Romulus', bonus: 'dyson_efficiency', value: 0.35, desc: 'Romulan Star: +35% Dyson' },
                    { id: 'andoria', name: 'Andoria', bonus: 'production', value: 0.3, desc: 'Ice Moon: +30% Production' },
                    { id: 'bajor', name: 'Bajor', bonus: 'research', value: 35, desc: 'Prophets: +35 Research' },
                    { id: 'cardassia', name: 'Cardassia Prime', bonus: 'production', value: 0.35, desc: 'Order World: +35% Production' },
                    { id: 'betazed', name: 'Betazed', bonus: 'research', value: 25, desc: 'Telepaths: +25 Research' },
                    { id: 'ferenginar', name: 'Ferenginar', bonus: 'production', value: 0.5, desc: 'Profit: +50% Production' },
                    { id: 'risa', name: 'Risa', bonus: 'research', value: 15, desc: 'Pleasure World: +15 Research' }
                ]
            },

            // === STAR WARS - Galactic Empire ===
            empire: {
                name: 'Galactic Empire',
                description: 'A long time ago in a galaxy far, far away',
                color: 0xff4444,
                icon: '⬡',
                baseY: -5,
                baseRadius: 110,
                spreadY: 5,
                systems: [
                    { id: 'coruscant', name: 'Coruscant', bonus: 'production', value: 0.6, desc: 'Ecumenopolis: +60% Production' },
                    { id: 'alderaan', name: 'Alderaan', bonus: 'research', value: 45, desc: 'Culture World: +45 Research' },
                    { id: 'tatooine', name: 'Tatooine', bonus: 'frontier_beacon', value: 25, desc: 'Outer Rim: Reveals 25 POAs' },
                    { id: 'mandalore', name: 'Mandalore', bonus: 'production', value: 0.4, desc: 'Warriors: +40% Production' },
                    { id: 'kashyyyk', name: 'Kashyyyk', bonus: 'production', value: 0.35, desc: 'Wookiee World: +35% Production' },
                    { id: 'naboo', name: 'Naboo', bonus: 'research', value: 30, desc: 'Queen World: +30 Research' },
                    { id: 'corellia', name: 'Corellia', bonus: 'production', value: 0.45, desc: 'Shipyards: +45% Production' },
                    { id: 'bespin', name: 'Bespin', bonus: 'production', value: 0.3, desc: 'Cloud City: +30% Production' },
                    { id: 'mustafar', name: 'Mustafar', bonus: 'dyson_efficiency', value: 0.4, desc: 'Lava World: +40% Dyson' }
                ]
            },

            // === MASS EFFECT - Citadel Council ===
            citadel: {
                name: 'Citadel Council',
                description: 'The galactic community united',
                color: 0x44ff88,
                icon: '◇',
                baseY: 3,
                baseRadius: 70,
                spreadY: 5,
                systems: [
                    { id: 'citadel_station', name: 'Citadel', bonus: 'research', value: 70, desc: 'Council Hub: +70 Research' },
                    { id: 'thessia', name: 'Thessia', bonus: 'research', value: 50, desc: 'Asari World: +50 Research' },
                    { id: 'palaven', name: 'Palaven', bonus: 'production', value: 0.4, desc: 'Turian World: +40% Production' },
                    { id: 'tuchanka', name: 'Tuchanka', bonus: 'production', value: 0.35, desc: 'Krogan World: +35% Production' },
                    { id: 'sur_kesh', name: "Sur'Kesh", bonus: 'research', value: 40, desc: 'Salarian World: +40 Research' },
                    { id: 'omega', name: 'Omega', bonus: 'frontier_beacon', value: 30, desc: 'Terminus: Reveals 30 POAs' },
                    { id: 'illium', name: 'Illium', bonus: 'production', value: 0.3, desc: 'Trade Hub: +30% Production' }
                ]
            },

            // === DUNE - Imperium ===
            imperium: {
                name: 'Landsraad Imperium',
                description: 'The spice must flow',
                color: 0xffcc00,
                icon: '◈',
                baseY: -3,
                baseRadius: 85,
                spreadY: 5,
                systems: [
                    { id: 'arrakis', name: 'Arrakis', bonus: 'production', value: 0.8, desc: 'Spice World: +80% Production' },
                    { id: 'caladan', name: 'Caladan', bonus: 'research', value: 35, desc: 'Atreides Home: +35 Research' },
                    { id: 'giedi_prime', name: 'Giedi Prime', bonus: 'production', value: 0.5, desc: 'Harkonnen: +50% Production' },
                    { id: 'kaitain', name: 'Kaitain', bonus: 'research', value: 45, desc: 'Imperial Seat: +45 Research' },
                    { id: 'salusa_secundus', name: 'Salusa Secundus', bonus: 'production', value: 0.45, desc: 'Sardaukar: +45% Production' },
                    { id: 'ix', name: 'Ix', bonus: 'research', value: 60, desc: 'Machine World: +60 Research' },
                    { id: 'tleilax', name: 'Tleilax', bonus: 'research', value: 40, desc: 'Bene Tleilax: +40 Research' }
                ]
            }
        };

        // Create POAs for each franchise
        for (const [franchiseId, franchise] of Object.entries(franchiseData)) {
            this.franchises[franchiseId] = {
                ...franchise,
                id: franchiseId,
                discovered: this.discoveredFranchises.has(franchiseId),
                systemIds: []
            };

            // Position systems in a cluster
            const baseAngle = this.hashStringToAngle(franchiseId);
            const baseX = Math.cos(baseAngle) * franchise.baseRadius;
            const baseZ = Math.sin(baseAngle) * franchise.baseRadius;

            franchise.systems.forEach((system, idx) => {
                // Spread systems across the franchise region
                // Use golden angle for even distribution, with radius variation
                const goldenAngle = idx * 2.399963;  // Golden angle in radians
                // For outer rim franchises, use 90-100% of radius; otherwise 20-100%
                const minFraction = franchise.outerRim ? 0.9 : 0.2;
                const radiusFraction = minFraction + (idx / franchise.systems.length) * (1.0 - minFraction);
                const clusterRadius = franchise.baseRadius * radiusFraction * (0.95 + Math.random() * 0.1);
                const x = this.solPosition.x + Math.cos(goldenAngle) * clusterRadius;
                const spreadY = franchise.spreadY || 30;  // Use franchise spreadY or default
                const y = this.solPosition.y + franchise.baseY + (Math.random() - 0.5) * spreadY * 2;
                const z = this.solPosition.z + Math.sin(goldenAngle) * clusterRadius;

                const isVisible = this.discoveredFranchises.has(franchiseId);

                const poaData = {
                    id: system.id,
                    name: system.name,
                    type: 'franchise_system',
                    franchiseId: franchiseId,
                    franchiseName: franchise.name,
                    spectralType: 'franchise_system',
                    distance: Math.sqrt(x*x + y*y + z*z) * 326,
                    bonusType: system.bonus,
                    bonusValue: system.value,
                    bonusDescription: system.desc,
                    icon: franchise.icon,
                    color: franchise.color,
                    position: { x, y, z },
                    colonized: false,
                    status: null,
                    isDeepSky: true,
                    isFranchise: true,
                    visible: isVisible,
                    hidden: !isVisible  // Hidden until franchise discovered
                };
                this.pointsOfAttraction.push(poaData);

                // Create a colonization target (star) at this franchise location
                // This ensures franchise systems are always colonizable
                if (this.colonizationTargets) {
                    this.colonizationTargets.push({
                        x: x,
                        y: y,
                        z: z,
                        spectralClass: 'G',  // Sun-like star for franchise worlds
                        colonized: false,
                        isFranchise: true,
                        franchisePoaId: system.id
                    });
                }

                this.franchises[franchiseId].systemIds.push(system.id);
            });

            // Create visual cluster for this franchise (100-300 stars)
            // Skip visual cluster for spread-out franchises (baseRadius > 100 units)
            if (this.discoveredFranchises.has(franchiseId) && franchise.baseRadius <= 100) {
                this.createFranchiseCluster(franchiseId, franchise, baseX, franchise.baseY, baseZ);
            }
        }

        console.log(`[StarMap] Initialized ${Object.keys(this.franchises).length} franchise clusters`);
    }

    /**
     * Create visual star cluster for a franchise (100-300 stars)
     */
    createFranchiseCluster(franchiseId, franchise, baseX, baseY, baseZ) {
        const starCount = 150 + Math.floor(Math.random() * 150);  // 150-300 stars
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        const color = new THREE.Color(franchise.color);

        for (let i = 0; i < starCount; i++) {
            // Spherical cluster distribution
            const r = Math.pow(Math.random(), 0.5) * 20;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = this.solPosition.x + baseX + r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = this.solPosition.y + baseY + r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = this.solPosition.z + baseZ + r * Math.cos(phi);

            // Vary brightness slightly
            const brightness = 0.3 + Math.random() * 0.4;
            const variedColor = new THREE.Color(franchise.color);
            variedColor.multiplyScalar(brightness);
            colors[i * 3] = variedColor.r;
            colors[i * 3 + 1] = variedColor.g;
            colors[i * 3 + 2] = variedColor.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.6,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending
        });

        const cluster = new THREE.Points(geometry, material);
        cluster.userData = { franchiseId, type: 'franchise_cluster' };
        this.galaxyGroup.add(cluster);

        // Store reference for later reveal
        if (!this.franchiseClusters) this.franchiseClusters = {};
        this.franchiseClusters[franchiseId] = cluster;
    }

    /**
     * Discover a new franchise when probes reach its area
     * Shows notification and reveals all systems in that franchise
     */
    discoverFranchise(franchiseId) {
        if (this.discoveredFranchises.has(franchiseId)) return;

        const franchise = this.franchises[franchiseId];
        if (!franchise) return;

        this.discoveredFranchises.add(franchiseId);
        franchise.discovered = true;

        // Reveal all POAs in this franchise
        for (const poa of this.pointsOfAttraction) {
            if (poa.franchiseId === franchiseId) {
                poa.hidden = false;
                poa.visible = true;
            }
        }

        // Create the visual cluster (skip for spread-out franchises)
        if (franchise.baseRadius <= 100) {
            const baseAngle = this.hashStringToAngle(franchiseId);
            const baseX = Math.cos(baseAngle) * franchise.baseRadius;
            const baseZ = Math.sin(baseAngle) * franchise.baseRadius;
            this.createFranchiseCluster(franchiseId, franchise, baseX, franchise.baseY, baseZ);
        }

        // Refresh POA markers
        this.refreshPOAMarkers();

        // Show discovery notification
        this.showFranchiseDiscoveryNotification(franchise);

        console.log(`[StarMap] Discovered franchise: ${franchise.name}`);
    }

    /**
     * Show notification when a new franchise is discovered
     */
    showFranchiseDiscoveryNotification(franchise) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'franchise-discovery-notification';
        notification.innerHTML = `
            <div class="franchise-discovery-icon">${franchise.icon}</div>
            <div class="franchise-discovery-content">
                <div class="franchise-discovery-title">NEW FRANCHISE DISCOVERED</div>
                <div class="franchise-discovery-name" style="color: #${franchise.color.toString(16).padStart(6, '0')}">${franchise.name}</div>
                <div class="franchise-discovery-desc">${franchise.description}</div>
                <div class="franchise-discovery-systems">${franchise.systems.length} systems revealed</div>
            </div>
        `;

        // Add to container
        if (this.container) {
            this.container.appendChild(notification);

            // Animate in
            setTimeout(() => notification.classList.add('show'), 100);

            // Remove after delay
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 500);
            }, 5000);
        }
    }

    /**
     * Check if any franchise should be discovered based on colonization
     * Called when new stars are colonized
     */
    checkFranchiseDiscovery(colonizedPosition) {
        if (!this.franchises) return;
        for (const [franchiseId, franchise] of Object.entries(this.franchises)) {
            if (franchise.discovered) continue;

            // Check if any colonized star is within discovery range of franchise
            const baseAngle = this.hashStringToAngle(franchiseId);
            const baseX = this.solPosition.x + Math.cos(baseAngle) * franchise.baseRadius;
            const baseY = this.solPosition.y + franchise.baseY;
            const baseZ = this.solPosition.z + Math.sin(baseAngle) * franchise.baseRadius;

            const dx = colonizedPosition.x - baseX;
            const dy = colonizedPosition.y - baseY;
            const dz = colonizedPosition.z - baseZ;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

            // Discover if within 50 units
            if (dist < 50) {
                this.discoverFranchise(franchiseId);
            }
        }
    }

    /**
     * Hash a string to an angle (for consistent positioning)
     */
    hashStringToAngle(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return (Math.abs(hash) % 1000) / 1000 * Math.PI * 2;
    }

    /**
     * Create visual markers for POAs (distinct from regular stars)
     */
    createPOAMarkers() {
        // Safety check - ensure colonizationGroup exists
        if (!this.colonizationGroup) {
            console.warn('[StarMap] createPOAMarkers called before colonizationGroup initialized');
            return;
        }

        this.poaMarkers = [];

        // Color mapping for different object types
        const typeColors = {
            // Nearby stars use spectral colors
            'G2V': 0xfff4ea, 'M4V': 0xffcc6f, 'M6V': 0xffaa44,
            'A1V': 0xcad7ff, 'K2V': 0xffd2a1, 'F5V': 0xf8f7ff, 'G8V': 0xfff4ea,
            // Deep sky objects - Nebulae
            'nebula': 0xff66aa,             // Pink/magenta for nebulae
            'supernova_remnant': 0x66ffff,  // Cyan for remnants
            'planetary_nebula': 0x00ffaa,   // Teal for planetary nebulae
            'halo_nebula': 0xaa88ff,        // Lavender for halo nebulae
            // Star clusters
            'open_cluster': 0xffffaa,       // Yellow for open clusters
            'globular_cluster': 0xffaa66,   // Orange for globular clusters
            'cluster': 0xffcc66,            // Golden for generic clusters
            // Compact objects
            'black_hole': 0x8844ff,         // Purple for black holes
            'pulsar': 0x00ffff,             // Bright cyan for pulsars
            'magnetar': 0xff00ff,           // Magenta for magnetars
            // Stars
            'supergiant': 0xff6644,         // Red-orange for supergiants
            'hypergiant': 0xff4488,         // Pink for hypergiants
            'giant': 0xffaa44,              // Orange for giants
            'star': 0xffffff,               // White default
            // Satellite galaxies and dwarfs
            'satellite_galaxy': 0xaaddff,   // Light blue for dwarf galaxies
            'dwarf_galaxy': 0x88ccff,       // Pale blue for dwarf galaxies
            'galaxy': 0x99ddff,             // Light cyan for galaxies
            // Galactic structures
            'arm': 0x66ff99,                // Green for spiral arms
            'dark_region': 0x666688,        // Dim grey-blue for dark regions
            'gas_stream': 0x88ccff,         // Pale blue for gas streams
            'high_velocity_cloud': 0x66aaff, // Blue for HVCs
            'gamma_structure': 0xff8800,    // Orange for Fermi bubbles
            'cavity': 0x444488,             // Dark blue for voids/bubbles
            'spiral_arm': 0xccccff,         // Pale violet for spiral arms
            'bar_structure': 0xffcc88,      // Golden for galactic bar
            // Franchise systems (use POA's color property)
            'franchise_system': 0x00ffff    // Default cyan, overridden by POA color
        };

        for (const poa of this.pointsOfAttraction) {
            // Skip hidden franchise POAs (not yet discovered)
            if (poa.hidden) continue;

            // Use franchise color if available, otherwise type color
            const color = poa.color || typeColors[poa.spectralType] || typeColors[poa.spectralType?.[0]] || 0xffffff;
            const isDeepSky = poa.isDeepSky;

            // Position relative to Sol
            const posX = poa.position.x - this.solPosition.x;
            const posY = poa.position.y - this.solPosition.y;
            const posZ = poa.position.z - this.solPosition.z;

            if (isDeepSky) {
                // Deep sky objects get special markers based on type
                this.createDeepSkyMarker(poa, color, posX, posY, posZ);
            } else {
                // Nearby stars get clickable sphere markers (much easier to click)
                const sphereGeometry = new THREE.SphereGeometry(0.08, 12, 12);
                const sphereMaterial = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.6
                });
                const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
                sphere.position.set(posX, posY, posZ);
                sphere.userData = { poaId: poa.id, poa: poa };
                this.colonizationGroup.add(sphere);
                this.poaMarkers.push(sphere);

                // Ring around it for visibility
                const ringGeometry = new THREE.RingGeometry(0.1, 0.12, 32);
                const ringMaterial = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.5,
                    side: THREE.DoubleSide
                });
                const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                ring.position.set(posX, posY, posZ);
                ring.userData = { poaId: poa.id, poa: poa };
                this.colonizationGroup.add(ring);
                this.poaMarkers.push(ring);
            }
        }

        // Create floating labels for all POAs
        this.createPOALabels();
    }

    /**
     * Create floating labels for all POAs
     */
    createPOALabels() {
        // Create container for POA labels if it doesn't exist
        if (!this.poaLabelsContainer) {
            this.poaLabelsContainer = document.createElement('div');
            this.poaLabelsContainer.className = 'poa-labels-container';
            this.container.appendChild(this.poaLabelsContainer);
        }

        // Clear existing labels
        this.poaLabelsContainer.innerHTML = '';
        this.poaLabels = [];

        for (const poa of this.pointsOfAttraction) {
            // Calculate local position (relative to Sol)
            const localX = poa.position.x - this.solPosition.x;
            const localY = poa.position.y - this.solPosition.y;
            const localZ = poa.position.z - this.solPosition.z;
            const localPos = new THREE.Vector3(localX, localY, localZ);

            // Format distance
            const distLY = poa.distance || (poa.distanceUnits * 326);
            let distStr;
            if (distLY < 100) {
                distStr = `${distLY.toFixed(1)} ly`;
            } else if (distLY < 10000) {
                distStr = `${(distLY / 1000).toFixed(1)} kly`;
            } else {
                distStr = `${(distLY / 1000).toFixed(0)} kly`;
            }

            // Create label element
            const label = document.createElement('div');
            label.className = 'poa-label';
            label.innerHTML = `
                <span class="poa-label-name">${poa.name}</span>
                <span class="poa-label-dist">${distStr}</span>
            `;

            // Click handler - navigate and show colonization menu
            label.addEventListener('click', (e) => {
                e.stopPropagation();
                this.navigateAndShowPOA(poa.id);
            });

            label.dataset.poaId = poa.id;
            this.poaLabelsContainer.appendChild(label);

            // Store for position updates
            this.poaLabels.push({
                element: label,
                poa: poa,
                localPosition: localPos
            });
        }

        console.log(`[StarMap] Created ${this.poaLabels.length} POA labels`);
    }

    /**
     * Refresh POA markers (rebuild after franchise discovery)
     */
    refreshPOAMarkers() {
        // Remove existing markers
        if (this.poaMarkers) {
            for (const marker of this.poaMarkers) {
                if (marker.parent) marker.parent.remove(marker);
                if (marker.geometry) marker.geometry.dispose();
                if (marker.material) marker.material.dispose();
            }
        }

        // Remove existing labels
        if (this.poaLabels) {
            for (const labelData of this.poaLabels) {
                if (labelData.element && labelData.element.parentNode) {
                    labelData.element.parentNode.removeChild(labelData.element);
                }
            }
        }

        // Recreate markers and labels
        this.createPOAMarkers();
        this.createPOALabels();
    }

    /**
     * Update POA label positions - fixed to markers like Sol label
     */
    updatePOALabels() {
        if (!this.poaLabels || !this.camera) return;

        for (const labelData of this.poaLabels) {
            const { element, poa } = labelData;

            // Get world position directly from marker (like Sol label does)
            const marker = this.poaMarkers?.find(m => m.userData?.poaId === poa.id);
            if (!marker) {
                element.style.display = 'none';
                continue;
            }

            const worldPos = new THREE.Vector3();
            marker.getWorldPosition(worldPos);

            // Project to screen coordinates
            const screenPos = worldPos.clone().project(this.camera);

            // Convert to CSS coordinates
            const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

            // Check if visible (z < 1 means in front of camera)
            if (screenPos.z < 1 && screenPos.z > -1) {
                element.style.display = 'block';
                element.style.left = `${x}px`;
                element.style.top = `${y}px`;

                // Fade based on distance
                const dist = this.camera.position.distanceTo(worldPos);
                const opacity = Math.max(0.3, Math.min(1, 1 - dist / 500));
                element.style.opacity = opacity.toString();

                // Update colonized/queued status
                if (poa.colonized) {
                    element.classList.add('colonized');
                    element.classList.remove('queued');
                } else {
                    element.classList.remove('colonized');
                    const isQueued = this.targetQueue?.some(t => t.id === poa.id);
                    element.classList.toggle('queued', isQueued);
                }
            } else {
                element.style.display = 'none';
            }
        }
    }

    /**
     * Create specialized marker for deep sky objects
     */
    createDeepSkyMarker(poa, color, x, y, z) {
        // Safety check - ensure colonizationGroup exists
        if (!this.colonizationGroup) {
            console.warn('[StarMap] colonizationGroup not initialized, skipping deep sky marker for', poa.name);
            return;
        }

        const type = poa.spectralType || poa.type;
        let marker;

        // Scale based on distance - farther objects slightly larger for visibility
        const distScale = Math.min(1.5, 0.8 + poa.distanceUnits / 50);

        switch (type) {
            case 'nebula':
            case 'supernova_remnant':
            case 'planetary_nebula':
                // Nebulae: soft fuzzy sphere
                const nebulaGeo = new THREE.SphereGeometry(0.15 * distScale, 16, 16);
                const nebulaMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.25,
                    depthWrite: false
                });
                marker = new THREE.Mesh(nebulaGeo, nebulaMat);
                break;

            case 'open_cluster':
                // Open clusters: small scattered points
                const clusterGeo = new THREE.BufferGeometry();
                const clusterPoints = [];
                for (let i = 0; i < 8; i++) {
                    const offset = 0.08 * distScale;
                    clusterPoints.push(
                        (Math.random() - 0.5) * offset,
                        (Math.random() - 0.5) * offset,
                        (Math.random() - 0.5) * offset
                    );
                }
                clusterGeo.setAttribute('position', new THREE.Float32BufferAttribute(clusterPoints, 3));
                const clusterMat = new THREE.PointsMaterial({
                    color: color,
                    size: 0.03 * distScale,
                    transparent: true,
                    opacity: 0.9
                });
                marker = new THREE.Points(clusterGeo, clusterMat);
                break;

            case 'globular_cluster':
                // Globular clusters: dense cluster of dots
                const globGeo = new THREE.BufferGeometry();
                const globPoints = [];
                for (let i = 0; i < 25; i++) {
                    const r = Math.random() * 0.12 * distScale;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(2 * Math.random() - 1);
                    globPoints.push(
                        r * Math.sin(phi) * Math.cos(theta),
                        r * Math.sin(phi) * Math.sin(theta),
                        r * Math.cos(phi)
                    );
                }
                globGeo.setAttribute('position', new THREE.Float32BufferAttribute(globPoints, 3));
                const globMat = new THREE.PointsMaterial({
                    color: color,
                    size: 0.025 * distScale,
                    transparent: true,
                    opacity: 0.9
                });
                marker = new THREE.Points(globGeo, globMat);
                break;

            case 'halo_nebula':
                // Halo nebulae: spread out cluster of dots
                const haloGeo = new THREE.BufferGeometry();
                const haloPoints = [];
                for (let i = 0; i < 20; i++) {
                    const spread = 0.15 * distScale;
                    haloPoints.push(
                        (Math.random() - 0.5) * spread,
                        (Math.random() - 0.5) * spread,
                        (Math.random() - 0.5) * spread
                    );
                }
                haloGeo.setAttribute('position', new THREE.Float32BufferAttribute(haloPoints, 3));
                const haloMat = new THREE.PointsMaterial({
                    color: color,
                    size: 0.03 * distScale,
                    transparent: true,
                    opacity: 0.8
                });
                marker = new THREE.Points(haloGeo, haloMat);
                break;

            case 'black_hole':
                // Black holes: ring with dark center
                const bhRingGeo = new THREE.TorusGeometry(0.1 * distScale, 0.02 * distScale, 8, 24);
                const bhRingMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.8
                });
                marker = new THREE.Mesh(bhRingGeo, bhRingMat);
                break;

            case 'pulsar':
                // Pulsars: small bright point with rays
                const pulsarGeo = new THREE.OctahedronGeometry(0.05 * distScale, 0);
                const pulsarMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.9
                });
                marker = new THREE.Mesh(pulsarGeo, pulsarMat);
                break;

            case 'supergiant':
            case 'hypergiant':
                // Giant stars: larger glowing sphere
                const giantGeo = new THREE.SphereGeometry(0.08 * distScale, 12, 12);
                const giantMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.7
                });
                marker = new THREE.Mesh(giantGeo, giantMat);
                break;

            case 'franchise_system':
                // Franchise systems: bright visible star with glow
                const franchiseStarGeo = new THREE.SphereGeometry(0.15 * distScale, 16, 16);
                const franchiseStarMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.9
                });
                marker = new THREE.Mesh(franchiseStarGeo, franchiseStarMat);

                // Add glow effect around the star
                const glowGeo = new THREE.SphereGeometry(0.25 * distScale, 16, 16);
                const glowMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.2,
                    depthWrite: false
                });
                const glow = new THREE.Mesh(glowGeo, glowMat);
                glow.position.set(x, y, z);
                this.colonizationGroup.add(glow);
                break;

            default:
                // Default: simple diamond
                const defaultGeo = new THREE.OctahedronGeometry(0.04 * distScale, 0);
                const defaultMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.8
                });
                marker = new THREE.Mesh(defaultGeo, defaultMat);
        }

        marker.position.set(x, y, z);
        marker.userData = { poaId: poa.id, poa: poa, isDeepSky: true };
        this.colonizationGroup.add(marker);
        this.poaMarkers.push(marker);

        // === ALWAYS ADD A CENTRAL STAR AT EXACT POA POSITION ===
        const starSize = Math.max(0.04, 0.06 * distScale);
        const starGeo = new THREE.SphereGeometry(starSize, 8, 8);
        const starMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.95
        });
        const centralStar = new THREE.Mesh(starGeo, starMat);
        centralStar.position.set(x, y, z);
        centralStar.userData = { poaId: poa.id, poa: poa, isDeepSky: true, isCentralStar: true };
        this.colonizationGroup.add(centralStar);
        this.poaMarkers.push(centralStar);

        // Add a subtle label ring around the marker
        const labelRingGeo = new THREE.RingGeometry(0.18 * distScale, 0.2 * distScale, 32);
        const labelRingMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const labelRing = new THREE.Mesh(labelRingGeo, labelRingMat);
        labelRing.position.set(x, y, z);
        this.colonizationGroup.add(labelRing);
    }

    /**
     * Launch initial probe to nearest POA (Alpha Centauri)
     */
    launchInitialProbe() {
        console.log('[StarMap] launchInitialProbe called, POAs:', this.pointsOfAttraction?.length);
        if (this.pointsOfAttraction.length === 0) {
            console.warn('[StarMap] No POAs available for initial probe!');
            return;
        }

        // Find nearest uncolonized POA
        const nearestPOA = this.pointsOfAttraction
            .filter(p => !p.colonized && p.status !== 'fleet_sent')
            .sort((a, b) => a.distance - b.distance)[0];

        if (!nearestPOA) {
            console.warn('[StarMap] No uncolonized POA found for initial probe!');
            return;
        }

        // Mark as fleet sent
        nearestPOA.status = 'fleet_sent';

        // Find the colonization target for this POA
        const target = this.colonizationTargets.find(t => t.isPOA && t.poaData?.id === nearestPOA.id);
        if (target) {
            target.colonized = true;  // Reserve it
        }

        // Launch visual probe from Sol to the POA
        const targetX = nearestPOA.position.x - this.solPosition.x;
        const targetY = nearestPOA.position.y - this.solPosition.y;
        const targetZ = nearestPOA.position.z - this.solPosition.z;

        this.launchProbeFleet(targetX, targetY, targetZ, target || nearestPOA);
        console.log(`[StarMap] Launched initial probe to ${nearestPOA.name} (${nearestPOA.distance} ly)`);
    }

    /**
     * Queue a conquest notification (rate limited)
     * Notifications are queued and shown with a minimum delay between them
     */
    showConquestNotification(poa) {
        // Initialize notification queue and timing
        if (!this._notificationQueue) this._notificationQueue = [];
        if (!this._lastNotificationTime) this._lastNotificationTime = 0;

        // Rate limiting: minimum 2 seconds between notifications
        const MIN_NOTIFICATION_INTERVAL = 2000;
        // Maximum 3 active notifications at once
        const MAX_ACTIVE_NOTIFICATIONS = 3;

        // Add to queue
        this._notificationQueue.push(poa);

        // Process queue if not already processing
        if (!this._processingNotifications) {
            this._processNotificationQueue();
        }
    }

    /**
     * Process the notification queue with rate limiting
     */
    _processNotificationQueue() {
        if (!this._notificationQueue || this._notificationQueue.length === 0) {
            this._processingNotifications = false;
            return;
        }

        this._processingNotifications = true;
        const MIN_NOTIFICATION_INTERVAL = 2000;
        const MAX_ACTIVE_NOTIFICATIONS = 3;

        // Check if we can show a notification now
        const now = Date.now();
        const timeSinceLast = now - (this._lastNotificationTime || 0);

        // Wait if too many active or too soon
        if (!this._activeNotifications) this._activeNotifications = [];
        if (this._activeNotifications.length >= MAX_ACTIVE_NOTIFICATIONS || timeSinceLast < MIN_NOTIFICATION_INTERVAL) {
            setTimeout(() => this._processNotificationQueue(), MIN_NOTIFICATION_INTERVAL - timeSinceLast + 100);
            return;
        }

        // Show next notification
        const poa = this._notificationQueue.shift();
        this._lastNotificationTime = now;
        this._displayNotification(poa);

        // Continue processing queue
        if (this._notificationQueue.length > 0) {
            setTimeout(() => this._processNotificationQueue(), MIN_NOTIFICATION_INTERVAL);
        } else {
            this._processingNotifications = false;
        }
    }

    /**
     * Actually display a notification (called by queue processor)
     */
    _displayNotification(poa) {
        if (!this._activeNotifications) this._activeNotifications = [];

        const notification = document.createElement('div');
        notification.className = 'conquest-notification';
        notification.innerHTML = `
            <div class="conquest-header">
                <span class="conquest-icon">★</span>
                <span class="conquest-title">COLONIZED</span>
            </div>
            <div class="conquest-name">${poa.name}</div>
            <div class="conquest-bonus">${poa.bonusDescription}</div>
            <div class="conquest-hint">Click to view</div>
        `;

        // Stack notifications - each one goes higher
        const stackOffset = this._activeNotifications.length * 70;
        notification.style.bottom = `${20 + stackOffset}px`;

        // Add click handler to navigate camera to this location
        notification.style.cursor = 'pointer';
        notification.addEventListener('click', () => {
            // Find the POA marker and navigate to it
            const marker = this.poaMarkers?.find(m => m.userData?.poaId === poa.id);
            if (marker) {
                const worldPos = new THREE.Vector3();
                marker.getWorldPosition(worldPos);
                this.goToPositionAndFollow(worldPos, marker, 5);
            }
            // Dismiss notification on click
            notification.classList.remove('visible');
            setTimeout(() => notification.remove(), 300);
        });

        document.body.appendChild(notification);
        this._activeNotifications.push(notification);

        // Animate in
        setTimeout(() => notification.classList.add('visible'), 10);

        // Remove after 5 seconds (longer since user might want to click)
        const removeTimer = setTimeout(() => {
            notification.classList.remove('visible');
            setTimeout(() => {
                notification.remove();
                // Remove from tracking array
                const idx = this._activeNotifications.indexOf(notification);
                if (idx > -1) this._activeNotifications.splice(idx, 1);
                // Reposition remaining notifications
                this._activeNotifications.forEach((n, i) => {
                    n.style.bottom = `${20 + i * 70}px`;
                });
            }, 300);
        }, 5000);

        // Store timer on element so we can cancel it if clicked
        notification._removeTimer = removeTimer;
    }

    /**
     * Show a special notification for new sector establishment
     */
    showSectorNotification(poa, distanceLY) {
        const notification = document.createElement('div');
        notification.className = 'sector-notification';
        notification.innerHTML = `
            <div class="sector-header">
                <span class="sector-icon">◆</span>
                <span class="sector-title">NEW SECTOR ESTABLISHED</span>
            </div>
            <div class="sector-name">${poa.name}</div>
            <div class="sector-distance">${(distanceLY / 1000).toFixed(1)} kly from nearest colony</div>
            <div class="sector-bonus">${poa.bonusDescription}</div>
        `;

        // Click to navigate
        notification.style.cursor = 'pointer';
        notification.addEventListener('click', () => {
            const marker = this.poaMarkers?.find(m => m.userData?.poaId === poa.id);
            if (marker) {
                const worldPos = new THREE.Vector3();
                marker.getWorldPosition(worldPos);
                this.goToPositionAndFollow(worldPos, marker, 5);
            }
            notification.classList.remove('visible');
            setTimeout(() => notification.remove(), 300);
        });

        document.body.appendChild(notification);
        setTimeout(() => notification.classList.add('visible'), 10);
        setTimeout(() => {
            notification.classList.remove('visible');
            setTimeout(() => notification.remove(), 300);
        }, 8000);  // Longer display for sector events
    }

    /**
     * Smoothly navigate camera to a target position, preserving current zoom
     */
    navigateCameraTo(x, y, z, duration = 1000) {
        const target = new THREE.Vector3(x, y, z);
        const startTarget = this.controls.target.clone();
        const startPos = this.camera.position.clone();

        // Preserve current camera offset (zoom level) from target
        const currentOffset = startPos.clone().sub(startTarget);
        const endPos = target.clone().add(currentOffset);

        const startTime = Date.now();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const t = Math.min(1, elapsed / duration);
            // Smooth easing
            const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            this.controls.target.lerpVectors(startTarget, target, ease);
            this.camera.position.lerpVectors(startPos, endPos, ease);
            this.controls.update();

            if (t < 1) {
                requestAnimationFrame(animate);
            }
        };

        animate();
    }

    /**
     * Apply bonus from a colonized POA
     */
    applyPOABonus(poa) {
        switch (poa.bonusType) {
            // === STANDARD BONUSES ===
            case 'production':
                this.empireBonuses.production += poa.bonusValue;
                break;
            case 'dyson_efficiency':
                this.empireBonuses.dyson_efficiency += poa.bonusValue;
                break;
            case 'launch_efficiency':
                this.empireBonuses.launch_efficiency = Math.max(0.1, this.empireBonuses.launch_efficiency - poa.bonusValue);
                break;
            case 'development_speed':
                this.empireBonuses.development_speed += poa.bonusValue;
                break;
            case 'research':
                this.empireBonuses.research += poa.bonusValue;
                break;
            case 'frontier_beacon':
                // Generate new POAs (to be implemented)
                console.log(`[StarMap] Frontier beacon reveals ${poa.bonusValue} new POAs`);
                break;
            case 'habitable':
                // Track habitable worlds (to be implemented)
                console.log(`[StarMap] Habitable world discovered!`);
                break;

            // === EXOTIC BONUSES (far halo objects) ===
            case 'probe_velocity':
                // Increase probe travel speed
                this.empireBonuses.probe_velocity += poa.bonusValue;
                console.log(`[StarMap] EXOTIC: Probe velocity +${(poa.bonusValue * 100).toFixed(0)}%`);
                break;
            case 'expansion_radius':
                // Increase maximum probe range
                this.empireBonuses.expansion_radius += poa.bonusValue;
                console.log(`[StarMap] EXOTIC: Expansion radius +${(poa.bonusValue * 100).toFixed(0)}%`);
                break;
            case 'auto_develop':
                // Chance for new colonies to auto-develop
                this.empireBonuses.auto_develop_chance = Math.min(1.0, this.empireBonuses.auto_develop_chance + poa.bonusValue);
                console.log(`[StarMap] EXOTIC: Auto-develop chance now ${(this.empireBonuses.auto_develop_chance * 100).toFixed(0)}%`);
                break;
            case 'stellar_forge':
                // Multiplier for ALL bonuses (meta-bonus)
                this.empireBonuses.stellar_forge_mult += poa.bonusValue;
                console.log(`[StarMap] EXOTIC: Stellar Forge multiplier now ${this.empireBonuses.stellar_forge_mult.toFixed(2)}x`);
                break;
            case 'dark_energy_tap':
                // Flat energy bonus per tick
                this.empireBonuses.dark_energy_tap += poa.bonusValue;
                console.log(`[StarMap] EXOTIC: Dark Energy Tap +${poa.bonusValue} energy/tick`);
                break;
            case 'wormhole_network':
                // Unlock wormhole connections
                this.empireBonuses.wormhole_network += poa.bonusValue;
                console.log(`[StarMap] EXOTIC: Wormhole Network +${poa.bonusValue} connections`);
                break;
            case 'time_dilation':
                // Speed up time locally
                this.empireBonuses.time_dilation += poa.bonusValue;
                console.log(`[StarMap] EXOTIC: Time Dilation now ${this.empireBonuses.time_dilation.toFixed(2)}x`);
                break;
            case 'exotic_matter':
                // Exotic matter for special builds
                this.empireBonuses.exotic_matter += poa.bonusValue;
                console.log(`[StarMap] EXOTIC: Exotic Matter +${poa.bonusValue} units`);
                break;
            case 'all_bonuses':
                // Boost ALL empire bonuses by percentage
                const mult = 1 + poa.bonusValue;
                this.empireBonuses.production *= mult;
                this.empireBonuses.dyson_efficiency *= mult;
                this.empireBonuses.development_speed *= mult;
                this.empireBonuses.probe_velocity *= mult;
                this.empireBonuses.expansion_radius *= mult;
                console.log(`[StarMap] EXOTIC: ALL BONUSES +${(poa.bonusValue * 100).toFixed(0)}%`);
                break;
        }

        console.log('[StarMap] Empire bonuses updated:', this.empireBonuses);
    }

    /**
     * Check if a newly colonized star is pioneering a new region
     * If it's far from all other colonies, it becomes a dynamic POA
     * Rate limited to prevent too many POA discoveries at once
     */
    checkPioneerColony(newStar, targetPosition) {
        // Need at least 5 colonies before considering pioneers
        if (this.colonizedStars.length < 5) return;

        // Rate limiting: minimum 2 seconds (real time) between pioneer discoveries
        const MIN_PIONEER_INTERVAL = 2000;
        const now = Date.now();
        if (this._lastPioneerTime && now - this._lastPioneerTime < MIN_PIONEER_INTERVAL) {
            return;  // Too soon since last pioneer
        }

        // Limit total dynamic POAs to prevent clutter
        const MAX_DYNAMIC_POAS = 50;
        const dynamicPOACount = this.pointsOfAttraction.filter(p => p.isDynamic).length;
        if (dynamicPOACount >= MAX_DYNAMIC_POAS) {
            return;  // Already have enough dynamic POAs
        }

        // Sector size for determining which sector a star belongs to
        // ~25,000 ly per sector (matching countColonizedSectors)
        const SECTOR_SIZE = 25000 / 326;

        // Determine new star's sector
        const newSectorX = Math.floor(newStar.position.x / SECTOR_SIZE);
        const newSectorY = Math.floor(newStar.position.y / SECTOR_SIZE);
        const newSectorZ = Math.floor(newStar.position.z / SECTOR_SIZE);
        const newSectorKey = `${newSectorX},${newSectorY},${newSectorZ}`;

        // Find distance to nearest star in a DIFFERENT sector
        let nearestDist = Infinity;
        for (const star of this.colonizedStars) {
            if (star === newStar) continue;

            // Check if star is in a different sector
            const starSectorX = Math.floor(star.position.x / SECTOR_SIZE);
            const starSectorY = Math.floor(star.position.y / SECTOR_SIZE);
            const starSectorZ = Math.floor(star.position.z / SECTOR_SIZE);
            const starSectorKey = `${starSectorX},${starSectorY},${starSectorZ}`;

            if (starSectorKey !== newSectorKey) {
                const dist = newStar.position.distanceTo(star.position);
                if (dist < nearestDist) {
                    nearestDist = dist;
                }
            }
        }

        // Pioneer threshold: ~15,000 ly from nearest star in different sector
        // 15,000 ly / 326 = ~46 units
        const pioneerThreshold = 15000 / 326;

        if (nearestDist > pioneerThreshold) {
            // This is a pioneer colony! Create a new sector
            this._lastPioneerTime = now;
            this.createNewSector(newStar, targetPosition, nearestDist);
        }
    }

    /**
     * Create a new sector when a colony is established far from others
     */
    createNewSector(star, targetPosition, distanceFromNearest) {
        // Generate a unique POA-style sector name
        const sectorNames = [
            // Greek letter + location
            'Arcturus Reach', 'Sigma Expanse', 'Tau Frontier', 'Omega Terminus',
            'Alpha Traverse', 'Delta Rim', 'Gamma Void', 'Epsilon Gate',
            'Zeta Drift', 'Theta Boundary', 'Lambda March', 'Kappa Verge',
            // Evocative sci-fi names
            'The Shoals', 'Terminus Gate', 'Far Horizon', 'The Barrens',
            'Void\'s Edge', 'Starfall Reach', 'Luminous Drift', 'Silent Expanse',
            'Darkwater Rim', 'Sunless Deep', 'The Periphery', 'Frostlight Zone',
            'Ember Drift', 'Crystalline Reach', 'The Hollow', 'Shatterpoint',
            // Mythological
            'Elysium Gate', 'Styx Crossing', 'Tartarus Rim', 'Hyperion Reach',
            'Acheron Drift', 'Lethe Expanse', 'Cocytus Void', 'Phlegethon Edge',
            // Directional/Positional
            'Coreward Marches', 'Rimward Frontier', 'Spinward Reach', 'Trailing Edge',
            'Galactic North', 'Southern Drift', 'Eastern Traverse', 'Western Void',
            // Discovery themed
            'New Horizons', 'Pioneer\'s Rest', 'Pathfinder Gate', 'Vanguard Station',
            'Waypoint Sigma', 'Haven Reach', 'Sanctuary Drift', 'Refuge Point',
            // Mysterious
            'The Anomaly', 'Null Space', 'The Fracture', 'Temporal Drift',
            'Quantum Reach', 'The Singularity', 'Event Horizon', 'Phase Gate',
            // Material/Element
            'Iron Reach', 'Cobalt Drift', 'Chromium Gate', 'Platinum Expanse',
            'Obsidian Rim', 'Adamantine Frontier', 'Orichalcum Deep', 'Neutronium Point'
        ];

        // Pick a random name, ensuring uniqueness
        let name;
        const usedNames = this.pointsOfAttraction.filter(p => p.isSector).map(p => p.name);
        const availableNames = sectorNames.filter(n => !usedNames.includes(n));

        if (availableNames.length > 0) {
            name = availableNames[Math.floor(Math.random() * availableNames.length)];
        } else {
            // Fallback: generate unique name with number
            const baseNames = ['Sector', 'Reach', 'Expanse', 'Drift', 'Gate'];
            const base = baseNames[Math.floor(Math.random() * baseNames.length)];
            name = `${base} ${this.colonizedStars.length}`;
        }

        // Distance-based bonus scaling (farther = better bonus)
        const distanceLY = Math.round(distanceFromNearest * 326);
        const bonusScale = Math.min(2, distanceFromNearest / 10);  // Up to 2x bonus for very distant

        // Random bonus type
        const bonusTypes = [
            { type: 'production', value: 0.05 * bonusScale, desc: `Frontier Hub: +${Math.round(5 * bonusScale)}% Production` },
            { type: 'development_speed', value: 0.05 * bonusScale, desc: `Pioneer Spirit: +${Math.round(5 * bonusScale)}% Development Speed` },
            { type: 'launch_efficiency', value: 0.05 * bonusScale, desc: `Staging Point: -${Math.round(5 * bonusScale)}% Launch Cooldown` },
            { type: 'dyson_efficiency', value: 0.03 * bonusScale, desc: `Energy Node: +${Math.round(3 * bonusScale)}% Dyson Efficiency` }
        ];
        const bonus = bonusTypes[Math.floor(Math.random() * bonusTypes.length)];

        // Create the POA
        const poa = {
            id: `sector_${Date.now()}`,
            name: name,
            distance: distanceLY,
            spectralType: 'Sector',
            bonusType: bonus.type,
            bonusValue: bonus.value,
            bonusDescription: bonus.desc,
            colonized: true,
            status: 'colonized',
            isDynamic: true,
            isSector: true,
            position: {
                x: targetPosition.x,
                y: targetPosition.y,
                z: targetPosition.z
            }
        };

        // Add to POA list
        this.pointsOfAttraction.push(poa);

        // Apply the bonus
        this.applyPOABonus(poa);

        // Create visual marker
        this.createPOAMarkerForPioneer(poa, star.position);

        // Show sector established notification
        this.showSectorNotification(poa, distanceLY);

        // Recreate POA labels to include new sector
        this.createPOALabels();

        console.log(`[StarMap] NEW SECTOR ESTABLISHED: ${name} (${distanceLY} ly from nearest colony)`);
    }

    /**
     * Create POA marker for a pioneer colony
     */
    createPOAMarkerForPioneer(poa, position) {
        // Create a distinctive marker for pioneer POAs - diamond shape
        const geometry = new THREE.OctahedronGeometry(0.4, 0);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff8800,  // Orange for pioneer
            transparent: true,
            opacity: 0.8,
            wireframe: true
        });
        const marker = new THREE.Mesh(geometry, material);
        marker.position.copy(position);
        marker.userData.poaId = poa.id;
        marker.userData.isPioneer = true;

        this.colonizationGroup.add(marker);
        this.poaMarkers.push(marker);
    }

    /**
     * Handle POA colonization when a probe arrives
     */
    onPOAColonized(poa) {
        poa.colonized = true;
        poa.status = 'colonized';

        // Apply the bonus
        this.applyPOABonus(poa);

        // Show notification
        this.showConquestNotification(poa);

        // Update the POA marker to show colonized state
        const marker = this.poaMarkers.find(m => m.userData.poaId === poa.id);
        if (marker) {
            marker.material.color.setHex(0x00ff88);  // Green for colonized
            marker.material.opacity = 1.0;
        }

        // Remove from target queue / corridor if it was queued
        this.removeCorridorByPOA(poa);
    }

    /**
     * Remove a corridor when its target POA is colonized
     */
    removeCorridorByPOA(poa) {
        // Find matching queue entry by position or ID
        const idx = this.targetQueue.findIndex(entry => {
            // Match by ID if available
            if (entry.id === poa.id) return true;
            // Match by position (close enough)
            if (poa.position) {
                const dx = Math.abs(entry.x - poa.position.x);
                const dy = Math.abs(entry.y - poa.position.y);
                const dz = Math.abs(entry.z - poa.position.z);
                return dx < 0.1 && dy < 0.1 && dz < 0.1;
            }
            return false;
        });

        if (idx >= 0) {
            const entry = this.targetQueue[idx];
            console.log(`[StarMap] Corridor to ${entry.name} completed - removing from queue`);

            // Remove queue marker
            this.removeQueueMarker(entry.id);

            // Remove from queue
            this.targetQueue.splice(idx, 1);

            // Renumber remaining entries
            this.targetQueue.forEach((t, i) => {
                t.queuePosition = i + 1;
            });

            // Refresh UI
            this.refreshQueueMarkers();
            this.updateTargetQueueDisplay();
        }
    }

    // ==========================================
    // TARGET QUEUE SYSTEM
    // ==========================================

    /**
     * Add a star to the target queue / colonization corridor (max 10 targets)
     * Each queued target creates a "corridor" - nearby colonies will bias their
     * probe directions towards stars along this corridor until the target is reached.
     */
    addToTargetQueue(starId) {
        const MAX_QUEUE = 20;  // Up to 20 colonization corridors

        // Find the star data
        const star = this.starData?.stars?.find(s => s.id === starId);
        if (!star) return false;

        // Check if already in queue
        if (this.targetQueue.some(t => t.id === starId)) {
            console.log('[StarMap] Target already in queue:', star.name);
            return false;
        }

        // Check queue full
        if (this.targetQueue.length >= MAX_QUEUE) {
            console.log('[StarMap] Target queue full');
            return false;
        }

        // Find or create a colonization target for this star
        let target = this.colonizationTargets.find(t =>
            Math.abs(t.x - star.galactic_x) < 0.01 &&
            Math.abs(t.y - star.galactic_y) < 0.01 &&
            Math.abs(t.z - star.galactic_z) < 0.01
        );

        if (!target) {
            // Create new target entry
            target = {
                x: star.galactic_x,
                y: star.galactic_y,
                z: star.galactic_z,
                colonized: false,
                dysonProgress: 0,
                name: star.name,
                starId: star.id,
                isQueued: true
            };
            this.colonizationTargets.push(target);
        }

        // Add to queue
        const queueEntry = {
            id: starId,
            name: star.name,
            x: star.galactic_x,
            y: star.galactic_y,
            z: star.galactic_z,
            target: target,
            queuePosition: this.targetQueue.length + 1
        };
        this.targetQueue.push(queueEntry);
        target.isQueued = true;

        // Create visual marker
        this.createQueueMarker(queueEntry);

        // Update queue display
        this.updateTargetQueueDisplay();

        // Update star info panel
        this.updateQueueButton(starId);

        console.log(`[StarMap] Added ${star.name} to target queue (position ${queueEntry.queuePosition})`);

        // Immediately intercept a probe and send it to this target
        this.interceptProbeForTarget(queueEntry);

        return true;
    }

    /**
     * Intercept the next available probe and send it to a queued target.
     * Finds the closest colonized star to the target and launches from there.
     */
    interceptProbeForTarget(queueEntry) {
        if (!queueEntry || queueEntry.probeSent) return false;

        const targetX = queueEntry.x;
        const targetY = queueEntry.y;
        const targetZ = queueEntry.z;

        // Find the closest colonized star to the target
        let closestStar = null;
        let closestDist = Infinity;

        for (const star of this.colonizedStars) {
            // Calculate distance from this colony to the target (in galaxy coords)
            const starGalaxyX = this.solPosition.x + star.position.x;
            const starGalaxyY = this.solPosition.y + star.position.y;
            const starGalaxyZ = this.solPosition.z + star.position.z;

            const dx = targetX - starGalaxyX;
            const dy = targetY - starGalaxyY;
            const dz = targetZ - starGalaxyZ;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < closestDist) {
                closestDist = dist;
                closestStar = star;
            }
        }

        if (!closestStar) {
            console.log('[StarMap] No colonized star found to intercept probe from');
            return false;
        }

        // Launch probe from closest star to the target
        const launchX = this.solPosition.x + closestStar.position.x;
        const launchY = this.solPosition.y + closestStar.position.y;
        const launchZ = this.solPosition.z + closestStar.position.z;

        // Target position relative to Sol (for launchProbeFleet)
        const relTargetX = targetX - this.solPosition.x;
        const relTargetY = targetY - this.solPosition.y;
        const relTargetZ = targetZ - this.solPosition.z;

        // Find or create the colonization target
        let target = queueEntry.target;
        if (!target) {
            target = this.colonizationTargets.find(t =>
                Math.abs(t.x - targetX) < 0.01 &&
                Math.abs(t.y - targetY) < 0.01 &&
                Math.abs(t.z - targetZ) < 0.01
            );
        }

        // Launch the probe with forceQueue=true to bypass hop range check
        const fleet = this.launchProbeFleet(relTargetX, relTargetY, relTargetZ, target, true);
        if (fleet) {
            queueEntry.probeSent = true;
            if (target) {
                target.status = 'fleet_sent';
            }
            closestStar.probesLaunched = (closestStar.probesLaunched || 0) + 1;
            this.recordProbeLaunch();

            const distLY = (closestDist * 326).toFixed(0);
            console.log(`[StarMap] Intercepted probe from colony #${closestStar.index} -> ${queueEntry.name} (${distLY} ly)`);
            return true;
        }

        return false;
    }

    /**
     * Remove a star from the target queue
     */
    removeFromTargetQueue(starId) {
        const idx = this.targetQueue.findIndex(t => t.id === starId);
        if (idx < 0) return false;

        const entry = this.targetQueue[idx];

        // Remove queue marker
        this.removeQueueMarker(starId);

        // Update target
        if (entry.target) {
            entry.target.isQueued = false;
        }

        // Remove from queue
        this.targetQueue.splice(idx, 1);

        // Renumber remaining entries
        this.targetQueue.forEach((t, i) => {
            t.queuePosition = i + 1;
        });

        // Refresh markers
        this.refreshQueueMarkers();

        // Update display
        this.updateTargetQueueDisplay();

        // Update star info panel if this star is selected
        if (this.selectedStar === starId) {
            this.updateQueueButton(starId);
        }

        console.log(`[StarMap] Removed from target queue (was position ${idx + 1})`);
        return true;
    }

    /**
     * Create visual marker for queued target
     */
    createQueueMarker(queueEntry) {
        const colors = [0xff8800, 0xffaa00, 0xffcc00, 0xffdd00, 0xffee00];  // Orange gradient
        const color = colors[Math.min(queueEntry.queuePosition - 1, colors.length - 1)];

        // Create ring around target
        const geometry = new THREE.RingGeometry(0.5, 0.65, 32);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthTest: false
        });
        const marker = new THREE.Mesh(geometry, material);

        // Position relative to Sol
        marker.position.set(
            queueEntry.x - this.solPosition.x,
            queueEntry.y - this.solPosition.y,
            queueEntry.z - this.solPosition.z
        );
        marker.userData.queueId = queueEntry.id;
        marker.userData.queuePosition = queueEntry.queuePosition;

        this.colonizationGroup.add(marker);
        this.queueMarkers.push(marker);
    }

    /**
     * Remove queue marker for a star
     */
    removeQueueMarker(starId) {
        const idx = this.queueMarkers.findIndex(m => m.userData.queueId === starId);
        if (idx >= 0) {
            const marker = this.queueMarkers[idx];
            this.colonizationGroup.remove(marker);
            marker.geometry.dispose();
            marker.material.dispose();
            this.queueMarkers.splice(idx, 1);
        }
    }

    /**
     * Refresh all queue markers (after reordering)
     */
    refreshQueueMarkers() {
        // Remove all markers
        for (const marker of this.queueMarkers) {
            this.colonizationGroup.remove(marker);
            marker.geometry.dispose();
            marker.material.dispose();
        }
        this.queueMarkers = [];

        // Recreate for current queue
        for (const entry of this.targetQueue) {
            this.createQueueMarker(entry);
        }
    }

    /**
     * Update the queue button state in star info panel
     */
    updateQueueButton(starId) {
        const btn = document.getElementById('btn-add-to-queue');
        if (!btn) return;

        const isQueued = this.targetQueue.some(t => t.id === starId);
        const isFull = this.targetQueue.length >= 5;

        if (isQueued) {
            btn.textContent = 'In Queue';
            btn.disabled = true;
            btn.classList.add('queued');
        } else if (isFull) {
            btn.textContent = 'Queue Full';
            btn.disabled = true;
            btn.classList.remove('queued');
        } else {
            btn.textContent = 'Add to Queue';
            btn.disabled = false;
            btn.classList.remove('queued');
        }
    }

    /**
     * Update the target queue display as bottom tile bar with bonuses
     */
    updateTargetQueueDisplay() {
        let panel = document.getElementById('target-queue-panel');

        // Create panel if doesn't exist
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'target-queue-panel';
            panel.className = 'target-queue-bottom-bar';
            panel.innerHTML = '<div class="queue-tiles"></div>';
            this.container.appendChild(panel);
        }

        const tilesContainer = panel.querySelector('.queue-tiles');
        if (!tilesContainer) return;

        if (this.targetQueue.length === 0) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'flex';

        // Scale down tiles when queue is large
        const queueSize = this.targetQueue.length;
        const isCompact = queueSize > 8;
        const isVeryCompact = queueSize > 14;
        tilesContainer.className = 'queue-tiles' +
            (isVeryCompact ? ' very-compact' : isCompact ? ' compact' : '');

        tilesContainer.innerHTML = this.targetQueue.map((t, i) => {
            // Find the POA data for bonus info
            const poa = this.pointsOfAttraction?.find(p => p.id === t.id);
            const bonusText = poa?.bonusDescription || t.bonusDescription || '';
            const shortBonus = bonusText.split(':')[0] || 'Target';  // Just the title part

            // For compact mode, just show number and abbreviated name
            const displayName = isVeryCompact ? (t.name?.substring(0, 3) || '?') :
                               isCompact ? (t.name?.substring(0, 6) || t.name) : t.name;

            return `
                <div class="queue-tile" data-target-id="${t.id}" onclick="window.starMapVisualization?.navigateAndShowPOA('${t.id}')" title="${t.name}: ${shortBonus}">
                    <div class="tile-number">${i + 1}</div>
                    ${isVeryCompact ? '' : `<div class="tile-name">${displayName}</div>`}
                    ${isCompact ? '' : `<div class="tile-bonus">${shortBonus}</div>`}
                    <button class="tile-remove" onclick="event.stopPropagation(); window.starMapVisualization?.removeFromTargetQueue('${t.id}')">×</button>
                </div>
            `;
        }).join('');
    }

    /**
     * Navigate to a POA and show its info panel (if not colonized)
     * Called when clicking queue tiles or POA labels
     */
    navigateAndShowPOA(poaId) {
        console.log('[StarMap] navigateAndShowPOA called for:', poaId);

        const poa = this.pointsOfAttraction?.find(p => p.id === poaId);

        // Navigate to the POA
        this.navigateToPOA(poaId);

        // Only show info panel if POA is not colonized
        // Colonized POAs just get camera focus, no dialog
        if (poa && !poa.colonized) {
            this.showPOAInfo(poaId);
        }
    }

    /**
     * Show POA info panel for a given POA ID
     * Redesigned for better UX and cleaner code
     */
    showPOAInfo(poaId) {
        console.log('[StarMap] showPOAInfo called for:', poaId);
        const poa = this.pointsOfAttraction?.find(p => p.id === poaId);
        if (!poa) {
            console.log('[StarMap] POA not found:', poaId);
            return;
        }

        // Remove existing panel if any
        this.closePOAInfo();

        // Calculate distance from Sol
        const dx = poa.position.x - this.solPosition.x;
        const dy = poa.position.y - this.solPosition.y;
        const dz = poa.position.z - this.solPosition.z;
        const distUnits = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const distLY = Math.round(distUnits * 326);

        // Format distance nicely
        let distStr;
        if (distLY < 100) {
            distStr = `${distLY} ly`;
        } else if (distLY < 10000) {
            distStr = `${(distLY / 1000).toFixed(2)} kly`;
        } else {
            distStr = `${(distLY / 1000).toFixed(0)} kly`;
        }

        // Check queue status
        const isQueued = this.targetQueue.some(t => t.id === poaId);
        const queueFull = this.targetQueue.length >= 20;
        const hasFleetEnRoute = poa.status === 'fleet_sent';

        // Determine status display
        let statusText, statusClass;
        if (poa.colonized) {
            statusText = 'Colonized';
            statusClass = 'status-colonized';
        } else if (hasFleetEnRoute) {
            statusText = 'Fleet En Route';
            statusClass = 'status-enroute';
        } else if (isQueued) {
            statusText = 'Queued';
            statusClass = 'status-queued';
        } else {
            statusText = 'Unexplored';
            statusClass = 'status-unexplored';
        }

        // Create panel
        const panel = document.createElement('div');
        panel.id = 'poa-info-panel';
        panel.className = 'poa-info-panel';

        panel.innerHTML = `
            <div class="poa-header">
                <div class="poa-title">
                    <span class="poa-name">${poa.name}</span>
                    <span class="poa-type">${poa.spectralType || poa.type || ''}</span>
                </div>
                <button class="poa-close" onclick="window.starMapVisualization?.closePOAInfo()">×</button>
            </div>
            <div class="poa-body">
                <div class="poa-stats">
                    <div class="poa-stat">
                        <span class="stat-label">Distance</span>
                        <span class="stat-value">${distStr}</span>
                    </div>
                    <div class="poa-stat">
                        <span class="stat-label">Status</span>
                        <span class="stat-value ${statusClass}">${statusText}</span>
                    </div>
                </div>
                ${poa.bonusDescription ? `
                    <div class="poa-bonus">
                        <div class="bonus-icon">★</div>
                        <div class="bonus-text">${poa.bonusDescription}</div>
                    </div>
                ` : ''}
                ${poa.lore ? `<div class="poa-lore">${poa.lore}</div>` : ''}
            </div>
            <div class="poa-actions">
                ${!poa.colonized ? `
                    <button class="poa-btn target-btn" onclick="window.starMapVisualization?.addPOAToQueueAndRefresh('${poaId}')"
                            tabindex="-1"
                            ${isQueued || queueFull || hasFleetEnRoute ? 'disabled' : ''}>
                        ${isQueued ? 'In Queue' : queueFull ? 'Queue Full' : hasFleetEnRoute ? 'Fleet Sent' : 'Set as Colony Target [Space]'}
                    </button>
                ` : `
                    <span class="colonized-badge">Colonized</span>
                `}
            </div>
        `;

        // Append to body for proper z-index
        document.body.appendChild(panel);
        this.selectedPOA = poaId;

        // Animate in
        requestAnimationFrame(() => panel.classList.add('visible'));

        console.log(`[StarMap] Showing POA info: ${poa.name} at ${distStr}`);
    }

    /**
     * Close the POA info panel
     */
    closePOAInfo() {
        console.log('[StarMap] closePOAInfo called');
        const panel = document.getElementById('poa-info-panel');
        if (panel) {
            panel.classList.remove('visible');
            setTimeout(() => panel.remove(), 200);
        }
        this.selectedPOA = null;
    }

    /**
     * Add POA to queue and close the info panel
     */
    addPOAToQueueAndRefresh(poaId) {
        if (this.addPOAToTargetQueue(poaId)) {
            this.closePOAInfo();  // Close panel after setting target
        }
    }

    /**
     * Add a POA to the target queue
     */
    addPOAToTargetQueue(poaId) {
        const poa = this.pointsOfAttraction?.find(p => p.id === poaId);
        if (!poa || poa.colonized) return false;

        const MAX_QUEUE = 20;

        // Check if already in queue
        if (this.targetQueue.some(t => t.id === poaId)) {
            console.log('[StarMap] POA already in queue:', poa.name);
            return false;
        }

        // Check queue full
        if (this.targetQueue.length >= MAX_QUEUE) {
            console.log('[StarMap] Target queue full');
            return false;
        }

        // Create queue entry
        const queueEntry = {
            id: poaId,
            name: poa.name,
            x: poa.position.x,
            y: poa.position.y,
            z: poa.position.z,
            bonusDescription: poa.bonusDescription,
            target: poa,
            queuePosition: this.targetQueue.length + 1
        };

        this.targetQueue.push(queueEntry);
        poa.isQueued = true;

        // Create visual marker
        this.createQueueMarker(queueEntry);

        // Update displays
        this.updateTargetQueueDisplay();

        console.log(`[StarMap] Added ${poa.name} to target queue (position ${queueEntry.queuePosition})`);

        // Immediately intercept a probe and send it to this target
        this.interceptProbeForTarget(queueEntry);

        return true;
    }

    /**
     * Navigate camera to a POA
     */
    navigateToPOA(poaId) {
        const poa = this.pointsOfAttraction?.find(p => p.id === poaId);
        if (!poa) {
            console.warn('[StarMap] POA not found:', poaId);
            return;
        }

        console.log(`[StarMap] navigateToPOA: ${poa.name}, position:`, poa.position);

        // Find the POA marker mesh if it exists
        const poaMarker = this.poaMarkers?.find(m => m.userData?.poaId === poaId);
        console.log('[StarMap] POA marker found:', !!poaMarker, 'total markers:', this.poaMarkers?.length);

        if (poaMarker) {
            // Navigate to the marker mesh and follow it
            const worldPos = new THREE.Vector3();
            poaMarker.getWorldPosition(worldPos);
            console.log('[StarMap] Marker world position:', worldPos);

            // Use a fixed close zoom for POAs
            this.goToPositionAndFollow(worldPos, poaMarker, 3);
        } else {
            // No marker - calculate position from POA data
            // POA position is in galaxy coordinates, need to convert to local (Sol at origin)
            const localX = poa.position.x - this.solPosition.x;
            const localY = poa.position.y - this.solPosition.y;
            const localZ = poa.position.z - this.solPosition.z;
            const localPos = new THREE.Vector3(localX, localY, localZ);
            console.log('[StarMap] Calculated local position:', localPos);

            // Transform to world coords through colonizationGroup
            const worldPos = localPos.clone();
            if (this.colonizationGroup) {
                worldPos.applyMatrix4(this.colonizationGroup.matrixWorld);
            }
            console.log('[StarMap] Transformed world position:', worldPos);

            this.goToPosition(worldPos, 3);
        }

        console.log(`[StarMap] Navigating to POA: ${poa.name}`);
    }

    /**
     * Move camera to target with specific zoom distance
     */
    moveCameraToTargetWithZoom(newTarget, zoomDistance, animate = true) {
        if (!this.camera || !this.controls) return;

        // Calculate camera offset direction (from current position, pointing at new target)
        // Use a sensible default direction if camera is at target
        let direction = this.camera.position.clone().sub(this.controls.target);
        if (direction.length() < 0.01) {
            direction = new THREE.Vector3(0, 0.3, 1);  // Default: slightly above, looking down
        }
        direction.normalize();

        // New camera position: target + offset at specified distance
        const newCameraPos = newTarget.clone().add(direction.multiplyScalar(zoomDistance));

        if (animate) {
            const startPos = this.camera.position.clone();
            const startTarget = this.controls.target.clone();
            let progress = 0;

            const animateCamera = () => {
                progress += 0.05;  // Smooth animation
                if (progress >= 1) {
                    this.camera.position.copy(newCameraPos);
                    this.controls.target.copy(newTarget);
                    this.controls.update();
                    return;
                }
                const t = 1 - Math.pow(1 - progress, 3);  // Ease out cubic
                this.camera.position.lerpVectors(startPos, newCameraPos, t);
                this.controls.target.lerpVectors(startTarget, newTarget, t);
                this.controls.update();
                requestAnimationFrame(animateCamera);
            };
            animateCamera();
        } else {
            this.camera.position.copy(newCameraPos);
            this.controls.target.copy(newTarget);
            this.controls.update();
        }
    }

    /**
     * Check if there's a queued target in range
     */
    getQueuedTargetInRange(fromX, fromY, fromZ, maxDistance) {
        // Only return queued targets that are ACTUALLY within hop range
        // Distant queued targets act as "beacons" - the corridor system guides
        // expansion toward them through intermediate hop-sized jumps
        for (const entry of this.targetQueue) {
            if (entry.target?.colonized) continue;
            if (entry.target?.status === 'fleet_sent') continue;  // Skip targets with probes en route

            const dx = entry.x - fromX;
            const dy = entry.y - fromY;
            const dz = entry.z - fromZ;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // Only direct-target queued POAs within normal hop range
            // Distant queued targets guide expansion via corridor bonus, not direct jumps
            if (dist <= maxDistance) {
                // Return a compatible object with both flat x/y/z and the original POA reference
                return {
                    id: entry.id,  // CRITICAL: Include ID for queue removal
                    x: entry.x,
                    y: entry.y,
                    z: entry.z,
                    colonized: entry.target?.colonized || false,
                    status: entry.target?.status,
                    targetData: entry.target,  // Original POA for bonuses etc
                    isQueuedTarget: true,
                    name: entry.name
                };
            }
        }
        return null;
    }

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
            probesLaunched: 0   // Total probes launched from this star
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

    /**
     * Launch a probe fleet to colonize a new star
     * @param {number} targetX - Target X position (in colonization group local coords)
     * @param {number} targetY - Target Y position
     * @param {number} targetZ - Target Z position
     * @param {Object} targetData - Optional reference to colonization target object
     */
    launchProbeFleet(targetX, targetY, targetZ, targetData = null, forceQueue = false) {
        const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
        console.log('[StarMap] launchProbeFleet called: target=', targetX?.toFixed(2), targetY?.toFixed(2), targetZ?.toFixed(2),
            'targetData=', targetData?.poaData?.name || targetData?.isPOA || 'regular', 'force=', forceQueue);

        // Check if there's already a fleet heading to this target (prevent duplicates)
        // Use very small threshold (0.001 units = 0.3 ly) since nearby POAs are only a few ly apart
        for (const fleet of this.probeFleets) {
            const dist = fleet.target.distanceTo(targetPos);
            if (dist < 0.001) {  // Within 0.001 units = ~0.3 ly = same target
                console.log('[StarMap] Fleet already heading to this target, skipping');
                return null;  // Already have a fleet going there
            }
        }

        // Get hop range limit (use 3x target hop for flexibility, matching findNearestUncolonizedStar)
        const targetHopLY = this.getAverageHopDistanceLY();
        const maxHopUnits = (targetHopLY / 326) * 3;  // 3x target hop distance

        // Find launch point (nearest colonized star)
        let launchStar = this.colonizedStars[0];  // Default to Sol
        let nearestDist = Infinity;

        for (const star of this.colonizedStars) {
            const dist = star.position.distanceTo(targetPos);
            if (dist < nearestDist) {
                nearestDist = dist;
                launchStar = star;
            }
        }

        // Check if target is within hop range of launch star
        // Queued targets (forceQueue=true) bypass this check - player explicitly chose them
        if (!forceQueue && nearestDist > maxHopUnits) {
            // Target is too far from any colonized star - don't launch
            // Expansion toward distant targets happens through intermediate colonies
            console.log('[StarMap] Target too far:', nearestDist.toFixed(2), '> maxHop', maxHopUnits.toFixed(2));
            return null;
        }

        // Create probe fleet visual - bright neon green cone pointing in travel direction
        const probeGeometry = new THREE.ConeGeometry(0.2, 0.6, 6);
        const probeMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: false
        });
        const probe = new THREE.Mesh(probeGeometry, probeMaterial);
        probe.position.copy(launchStar.position);

        // Orient cone to point toward target
        // ConeGeometry points along +Y by default, rotate it to point along +Z first
        probe.geometry.rotateX(Math.PI / 2);
        // Now make it look at the target
        probe.lookAt(targetPos);

        // Trail effect - green line from origin to probe
        const trailGeometry = new THREE.BufferGeometry();
        const trailMaterial = new THREE.LineBasicMaterial({
            color: 0x00ff44,
            transparent: true,
            opacity: 0.5
        });
        const trail = new THREE.Line(trailGeometry, trailMaterial);

        // Calculate travel time using simple constant velocity
        const distanceUnits = launchStar.position.distanceTo(targetPos);
        const distanceLY = distanceUnits * 326;  // 1 unit = 326 light-years
        const driveTier = this.getDriveResearchTier();

        // Simple velocity-based travel (no relativistic complexity)
        const travel = this.calculateFleetTravel(distanceLY, driveTier);

        // Travel time is in years, convert to days (this.time is in days)
        const travelTimeYears = travel.travelTime;
        const travelTimeDays = travelTimeYears * 365.25;

        const fleet = {
            probe,
            trail,
            start: launchStar.position.clone(),
            target: targetPos,
            targetData: targetData,

            // Distance data
            distanceUnits: distanceUnits,
            distanceLY: distanceLY,

            // Time tracking (in days)
            launchTime: this.time,
            travelTimeDays: travelTimeDays,
            travelTimeYears: travelTimeYears,
            arrivalTime: this.time + travelTimeDays,

            // Drive info
            driveTier: driveTier,
            visualSpeedLYperYr: travel.visualSpeedLYperYr,

            // Legacy compatibility
            distance: distanceUnits,
            progress: 0
        };

        this.probeFleets.push(fleet);
        this.colonizationGroup.add(probe);
        this.colonizationGroup.add(trail);

        console.log(`[StarMap] Fleet launched: ${distanceLY.toFixed(1)} ly, ${travelTimeYears.toFixed(2)} yr, ${travel.visualSpeedLYperYr.toFixed(0)} ly/yr`);
        return fleet;
    }

    /**
     * Update probe fleets animation
     * Progress is calculated from elapsed game time
     */
    updateProbeFleets() {
        const completedFleets = [];

        for (const fleet of this.probeFleets) {
            // Calculate progress from elapsed game time
            // Support both new (launchTime/travelTimeDays) and legacy (startTime/travelTime) field names
            const launchTime = fleet.launchTime ?? fleet.startTime ?? 0;
            const travelTime = fleet.travelTimeDays ?? fleet.travelTime ?? 0;
            const elapsed = this.time - launchTime;
            const progress = travelTime > 0
                ? Math.min(1, elapsed / travelTime)
                : 1;  // Instant arrival if travelTime is 0
            fleet.progress = progress;

            if (progress >= 1) {
                // Arrived - colonize the star!
                completedFleets.push(fleet);

                // IMMEDIATE REPLICATION: Probe arrives and immediately starts working
                // Initial 15 units = probe starts with basic infrastructure
                // - Production portion: Can immediately start building new probes
                // - Dyson portion: Begins capturing stellar energy
                // System develops to full 100 units over time
                const initialUnits = 15;

                const newStar = this.addColonizedStar(
                    fleet.target.x,
                    fleet.target.y,
                    fleet.target.z,
                    initialUnits,
                    fleet.target.spectralClass || fleet.targetData?.spectralClass
                );

                // Link the colonized star data to the target data for tracking
                if (fleet.targetData && newStar) {
                    newStar.targetData = fleet.targetData;
                    fleet.targetData.starData = newStar;
                }

                // Check if this was a POA (Point of Attraction) and trigger bonus
                if (fleet.targetData?.isPOA && fleet.targetData?.poaData) {
                    this.onPOAColonized(fleet.targetData.poaData);
                } else if (newStar) {
                    // Check if this colony is pioneering a new region (far from others)
                    this.checkPioneerColony(newStar, fleet.target);
                }

                // Remove from target queue if this was a queued target
                if (fleet.targetData?.isQueuedTarget || fleet.targetData?.id) {
                    const queueId = fleet.targetData?.id || fleet.targetData?.targetData?.id;
                    if (queueId) {
                        this.removeFromTargetQueue(queueId);
                    }
                }

                // Notify fleet view if we were tracking this fleet
                if (newStar) {
                    this.onFleetArrived(fleet, newStar);
                }

                // Each dot represents ~3.33 million actual stars
                this.dotsColonized++;
                this.starsInfluenced += this.STARS_PER_DOT;

                // Check if we've hit an outpost milestone (every 100 stars)
                this.checkOutpostMilestone();

                // Remove probe but keep trail as a fading remnant
                this.colonizationGroup.remove(fleet.probe);

                // Convert trail to a fading remnant
                if (fleet.trail) {
                    this.addTrailRemnant(fleet.trail, fleet.start, fleet.target);
                }
            } else {
                // Animate probe position
                fleet.probe.position.lerpVectors(fleet.start, fleet.target, fleet.progress);

                // Update trail
                if (fleet.trail) {
                    const trailGeom = new THREE.BufferGeometry().setFromPoints([
                        fleet.start.clone(),
                        fleet.probe.position.clone()
                    ]);
                    fleet.trail.geometry.dispose();
                    fleet.trail.geometry = trailGeom;
                }
            }
        }

        // Remove completed fleets
        for (const fleet of completedFleets) {
            const idx = this.probeFleets.indexOf(fleet);
            if (idx > -1) {
                this.probeFleets.splice(idx, 1);
            }
        }

        // Update fading trail remnants
        this.updateTrailRemnants();
    }

    /**
     * Add a completed probe's trail as a fading remnant
     * Creates a permanent line from start to target that slowly fades
     */
    addTrailRemnant(trail, start, target) {
        // Create a new line from start to target (complete path)
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([
            start.clone(),
            target.clone()
        ]);
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x00aa88,  // Slightly different color for remnants
            transparent: true,
            opacity: 0.4
        });
        const remnantLine = new THREE.Line(lineGeometry, lineMaterial);

        const remnant = {
            line: remnantLine,
            createdTime: this.time,
            fadeStartTime: 9000,   // Start fading after ~25 years
            fadeDuration: 9000,    // Fully gone after ~25 more years (50 years total)
            initialOpacity: 0.4
        };

        // Remove the original trail
        this.colonizationGroup.remove(trail);

        // Add remnant line
        this.colonizationGroup.add(remnantLine);
        this.trailRemnants.push(remnant);

        // Limit total remnants to avoid memory issues
        if (this.trailRemnants.length > 300) {
            const oldRemnant = this.trailRemnants.shift();
            this.colonizationGroup.remove(oldRemnant.line);
            oldRemnant.line.geometry.dispose();
            oldRemnant.line.material.dispose();
        }
    }

    /**
     * Update fading trail remnants
     */
    updateTrailRemnants() {
        const toRemove = [];

        for (const remnant of this.trailRemnants) {
            const age = this.time - remnant.createdTime;

            if (age > remnant.fadeStartTime + remnant.fadeDuration) {
                // Fully faded - remove
                toRemove.push(remnant);
            } else if (age > remnant.fadeStartTime) {
                // Fading
                const fadeProgress = (age - remnant.fadeStartTime) / remnant.fadeDuration;
                remnant.line.material.opacity = remnant.initialOpacity * (1 - fadeProgress);
            }
        }

        // Remove fully faded remnants
        for (const remnant of toRemove) {
            const idx = this.trailRemnants.indexOf(remnant);
            if (idx > -1) {
                this.trailRemnants.splice(idx, 1);
                this.colonizationGroup.remove(remnant.line);
                remnant.line.geometry.dispose();
                remnant.line.material.dispose();
            }
        }
    }

    /**
     * Simulate expansion - called periodically to grow the frontier
     * Uses expansion policy to determine behavior
     */
    simulateExpansion() {
        // DEBUG: Log on every call for first 5 calls
        if (!this._expansionCallCount) this._expansionCallCount = 0;
        this._expansionCallCount++;

        const gameYearsNow = this.time / 365;

        // Log every call for first 5, then periodically
        if (this._expansionCallCount <= 5) {
            const uncolonized = this.colonizationTargets?.filter(t => !t.colonized && t.status !== 'fleet_sent').length || 0;
            console.log('[StarMap] === EXPANSION TICK #' + this._expansionCallCount + ' ===',
                '\n  year:', gameYearsNow.toFixed(2),
                '\n  colonies:', this.colonizedStars?.length,
                '\n  uncolonized:', uncolonized,
                '\n  fleets:', this.probeFleets?.length,
                '\n  timeSpeed:', this.timeSpeedMultiplier,
                '\n  buildExpandBalance:', this.buildExpandBalance);
        } else if (this._expansionCallCount % 120 === 0) {
            const uncolonized = this.colonizationTargets?.filter(t => !t.colonized && t.status !== 'fleet_sent').length || 0;
            console.log('[StarMap] Expansion #' + this._expansionCallCount,
                'year:', gameYearsNow.toFixed(1),
                'colonies:', this.colonizedStars?.length,
                'uncolonized:', uncolonized,
                'fleets:', this.probeFleets?.length);
        }

        // Get game state if available (optional - we can run without it)
        const gameState = window.gameEngine?.getGameState?.();

        const dysonProgress = gameState?.dyson_sphere?.progress || 0;
        const probes = gameState?.derived?.totals?.total_probes || 0;

        // Use expansion allocation slider (0-100)
        // 0 = all resources to Dyson, 100 = all resources to expansion
        const expansionRate = Math.max(0.1, this.buildExpandBalance / 100);  // Use buildExpandBalance directly, min 10%
        const dysonRate = 1 - expansionRate;

        // Base expansion rate - always allow some development even early game
        let baseRate = 0.01;  // Base rate for early game
        if (probes > 1e6) baseRate = 0.02;
        if (probes > 1e9) baseRate = 0.05;
        if (probes > 1e12) baseRate = 0.12;
        if (dysonProgress > 0.1) baseRate += dysonProgress * 0.15;

        // DEVELOPMENT: Develop ALL incomplete stars each tick
        // Rate: 100% build = 50 years to complete, 50% build = 100 years
        // Formula: unitsPerYear = 2 * buildRate (so 2 units/yr at full build, 1 unit/yr at 50%)
        const buildRate = Math.max(0.1, 1 - this.buildExpandBalance / 100);  // 1.0 at full build, 0.1 at full expand
        const unitsPerYear = 2 * buildRate;  // 2 units/yr at full build = 50 years for 100 units

        // Calculate game time per tick (simulateExpansion called every 60 frames = once per real second)
        // Each frame advances daysPerFrame * speedMultiplier, so 60 frames = 7 * speedMultiplier days
        const speedMultiplier = (this.timeSpeedMultiplier || 1);
        const gameDaysPerTick = 60 * (this.daysPerFrame || 7/60) * speedMultiplier;
        const gameYearsPerTick = gameDaysPerTick / 365;

        const actualDevelopment = unitsPerYear * gameYearsPerTick;

        for (const star of this.colonizedStars) {
            const oldTotal = (star.dysonUnits || 0) + (star.productionUnits || 0);
            if (oldTotal >= 100) continue;  // Already fully developed

            // Add development with some randomness (±20%)
            const variance = 0.8 + Math.random() * 0.4;
            this.developStar(star, actualDevelopment * variance);

            const newTotal = (star.dysonUnits || 0) + (star.productionUnits || 0);

            // Update counts when star reaches 100 units (fully developed)
            if (newTotal >= 100 && oldTotal < 100) {
                this.dotsWithDyson++;
                this.starsWithDyson += this.STARS_PER_DOT;
            }
        }

        // EXPANSION: Launch probes from all colonized stars
        // Simple formula based on star development:
        // - 100% production (100 units) = 4 probes/year
        // - 50/50 split = 2 probes/year
        // - 100% dyson (100 units) = 0.01 probes/year
        if (this.probeFleets.length < 100) {
            const speedMultiplier = (this.timeSpeedMultiplier || 1);
            const gameYears = this.time / 365;

            // simulateExpansion is called every 60 frames (once per real second)
            // Each frame advances daysPerFrame * speedMultiplier game days
            // So 60 frames = 60 * daysPerFrame * speedMultiplier = 7 * speedMultiplier days (1 week at 1x)
            const gameDaysPerCall = 60 * (this.daysPerFrame || 7/60) * speedMultiplier;
            const gameYearsPerCall = gameDaysPerCall / 365;

            // Empire bonuses from conquered POAs
            const productionBonus = this.empireBonuses?.production || 1.0;
            const launchBonus = this.empireBonuses?.launch_efficiency || 1.0;

            // Expansion rate from slider (0-100, default 50)
            const expansionRate = Math.max(0.1, this.buildExpandBalance / 100);

            // DEBUG: Log expansion state periodically
            if (!this._expansionDebugCount) this._expansionDebugCount = 0;
            this._expansionDebugCount++;
            if (this._expansionDebugCount <= 5 || this._expansionDebugCount % 120 === 0) {
                const availableTargets = this.colonizationTargets?.filter(t => !t.colonized && t.status !== 'fleet_sent').length || 0;
                console.log('[EXPANSION] year=' + gameYears.toFixed(2) +
                    ' speed=' + speedMultiplier +
                    ' colonies=' + this.colonizedStars?.length +
                    ' targets=' + availableTargets +
                    ' fleets=' + this.probeFleets?.length);
            }

            // Pure probabilistic launch system (exponential random variable)
            // Each star has independent probability of launching each tick
            // This spreads launches naturally and prevents bunching
            for (const star of this.colonizedStars) {
                const productionUnits = star.productionUnits || 0;
                const dysonUnits = star.dysonUnits || 0;
                const totalUnits = productionUnits + dysonUnits;

                // Skip undeveloped stars
                if (totalUnits < 5) continue;

                // Probes per year based on development:
                // Production: 100 units = 1.5 probes/year (Sol at 70 units ≈ 1 probe/year)
                // Dyson: 100 units = 0.1 probes/year (minimal contribution)
                const probesPerYear = (productionUnits / 100) * 1.5 * productionBonus +
                                      (dysonUnits / 100) * 0.1 * launchBonus;

                // Probability of launching this tick (exponential random variable)
                // P(launch) = λ * dt where λ = probesPerYear, dt = gameYearsPerCall
                const launchProbability = probesPerYear * gameYearsPerCall * expansionRate;

                // DEBUG: Log Sol's launch probability on first few calls
                if (star.index === 0 && this._expansionDebugCount <= 5) {
                    console.log('[EXPANSION] Sol: prod=' + productionUnits + ' dyson=' + dysonUnits +
                        ' probesPerYear=' + probesPerYear.toFixed(2) +
                        ' launchProb=' + launchProbability.toFixed(4) +
                        ' expansionRate=' + expansionRate.toFixed(2));
                }

                // Roll for launch (pure probability, no accumulation)
                if (Math.random() < launchProbability && this.probeFleets.length < 100) {
                    const launchGalaxyX = this.solPosition.x + star.position.x;
                    const launchGalaxyY = this.solPosition.y + star.position.y;
                    const launchGalaxyZ = this.solPosition.z + star.position.z;

                    const target = this.findNearestUncolonizedStar(launchGalaxyX, launchGalaxyY, launchGalaxyZ, 200);

                    if (target) {
                        const targetX = target.x - this.solPosition.x;
                        const targetY = target.y - this.solPosition.y;
                        const targetZ = target.z - this.solPosition.z;

                        const fleet = this.launchProbeFleet(targetX, targetY, targetZ, target);
                        if (fleet) {
                            target.status = 'fleet_sent';
                            target.colonized = true;
                            if (target.targetData) {
                                target.targetData.status = 'fleet_sent';
                                target.targetData.colonized = true;
                            }
                            star.lastLaunchTime = this.time;
                            star.probesLaunched = (star.probesLaunched || 0) + 1;
                            this.recordProbeLaunch();
                        } else {
                            // Mark target to skip it
                            target.status = 'fleet_sent';
                            target.colonized = true;
                        }
                    }
                }
            }
        }

        // Sol is already fully developed - no need to sync from game state
        // Its dysonUnits/productionUnits are set at initialization

        // NOTE: Outpost wave system disabled - all probe launches now come from
        // regular star-based production above, spread evenly across all colonies
        // this.updateOutpostWaves();

        // Dynamic POA generation - refresh frontier targets as empire expands
        // Check every 5 new colonies
        if (this.colonizedStars.length % 5 === 0 && this.colonizedStars.length !== this._lastPOARefreshCount) {
            this._lastPOARefreshCount = this.colonizedStars.length;
            this.updateExplorationRadius();
            this.generateFrontierPOAs();
        }

        // Update metrics history for graphs
        this.updateMetricsHistory();
    }

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

    /**
     * Create distant galaxies as extragalactic background
     * These are far away and give depth to the universe
     */
    createDistantGalaxies() {
        // Distant point-like galaxies
        const galaxyCount = 500;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(galaxyCount * 3);
        const colors = new Float32Array(galaxyCount * 3);

        const color = new THREE.Color();

        for (let i = 0; i < galaxyCount; i++) {
            // Spherical distribution very far away
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 800 + Math.random() * 800;  // Much further out for larger galaxy scale

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);

            // Distant galaxies appear as faint fuzzy points
            const galaxyType = Math.random();
            if (galaxyType < 0.3) {
                // Elliptical - yellowish
                color.setHSL(0.12, 0.4, 0.15 + Math.random() * 0.1);
            } else if (galaxyType < 0.8) {
                // Spiral - bluish white
                color.setHSL(0.6, 0.3, 0.12 + Math.random() * 0.1);
            } else {
                // Irregular/starburst - pinkish
                color.setHSL(0.9, 0.5, 0.15 + Math.random() * 0.1);
            }

            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 3,
            sizeAttenuation: false,
            vertexColors: true,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending
        });

        const distantGalaxies = new THREE.Points(geometry, material);
        this.scene.add(distantGalaxies);  // Add to scene, not galaxyGroup (doesn't rotate with our galaxy)

        // Add Magellanic Clouds - satellite galaxies of the Milky Way
        this.createMagellanicClouds();

        // Add Andromeda Galaxy (M31) - visible as a small spiral
        this.createAndromedaGalaxy();

        // Add Messier objects (clusters and nebulae visible from Earth)
        this.createMessierObjects();

        // Major star systems disabled - using POA labels instead
        // this.createMajorStarSystems();
    }

    /**
     * Create the Magellanic Clouds - satellite dwarf galaxies of the Milky Way
     * These are real irregular galaxies that orbit our galaxy
     * LMC: ~160,000 ly away, ~30 billion stars, has a bar structure
     * SMC: ~200,000 ly away, ~3 billion stars, more irregular
     */
    createMagellanicClouds() {
        // Store for orbital animation
        this.magellanicClouds = [];

        // Large Magellanic Cloud (LMC) - largest satellite galaxy
        const lmc = this.createMagellanicCloud({
            name: 'LMC',
            fullName: 'Large Magellanic Cloud',
            distance: 160,
            angle: Math.PI * 1.3,
            inclination: -0.55,
            starCount: 8000,      // More stars for detail
            dustCount: 2000,      // Dust lanes
            size: 25,
            hasBar: true,         // LMC has a prominent bar
            orbitalPeriod: 1500,  // Orbital period in Myr (scaled for animation)
            tilt: 0.6             // Inclination of the galaxy plane
        });
        this.magellanicClouds.push(lmc);

        // Small Magellanic Cloud (SMC)
        const smc = this.createMagellanicCloud({
            name: 'SMC',
            fullName: 'Small Magellanic Cloud',
            distance: 200,
            angle: Math.PI * 1.5,
            inclination: -0.65,
            starCount: 4000,
            dustCount: 800,
            size: 15,
            hasBar: false,        // SMC is more irregular
            orbitalPeriod: 2000,
            tilt: 0.8
        });
        this.magellanicClouds.push(smc);

        // Create the Magellanic Stream - gas bridge between LMC, SMC and Milky Way
        this.createMagellanicStream(lmc, smc);
    }

    /**
     * Create a single Magellanic Cloud with accurate structure
     */
    createMagellanicCloud(config) {
        const cloudGroup = new THREE.Group();
        cloudGroup.userData = {
            name: config.name,
            fullName: config.fullName,
            distance: config.distance,
            baseAngle: config.angle,
            orbitalPeriod: config.orbitalPeriod,
            inclination: config.inclination
        };

        // Initial position
        cloudGroup.position.set(
            Math.cos(config.angle) * config.distance,
            Math.sin(config.inclination) * config.distance * 0.3,
            Math.sin(config.angle) * config.distance
        );

        // Tilt the galaxy plane
        cloudGroup.rotation.x = config.tilt;
        cloudGroup.rotation.z = Math.random() * 0.3;

        // === STELLAR COMPONENT ===
        const starGeometry = new THREE.BufferGeometry();
        const starPositions = new Float32Array(config.starCount * 3);
        const starColors = new Float32Array(config.starCount * 3);
        const color = new THREE.Color();

        for (let i = 0; i < config.starCount; i++) {
            // Irregular galaxy distribution with optional bar
            const t = Math.random();
            let r = Math.pow(t, 0.5) * config.size;

            const theta = Math.random() * Math.PI * 2;

            // Bar structure for LMC
            let barStretch = 1;
            if (config.hasBar) {
                barStretch = 1 + Math.cos(theta * 2) * 0.4 * (1 - t);  // Bar stronger in center
            }

            // Add clumpiness - stars form in clusters
            const clumpFactor = Math.random() < 0.3 ? 0.7 + Math.random() * 0.6 : 1;
            r *= clumpFactor;

            const x = r * Math.cos(theta) * barStretch;
            const z = r * Math.sin(theta);
            // Thicker disk with Gaussian-like vertical distribution
            const y = (Math.random() + Math.random() - 1) * config.size * 0.15;

            starPositions[i * 3] = x;
            starPositions[i * 3 + 1] = y;
            starPositions[i * 3 + 2] = z;

            // Realistic star colors - mostly old (red/yellow) with young blue regions
            const starType = Math.random();
            const distFromCenter = r / config.size;

            if (starType < 0.15 && distFromCenter > 0.3) {
                // Young blue stars in outer regions (star forming)
                color.setHSL(0.6, 0.3, 0.5 + Math.random() * 0.2);
            } else if (starType < 0.7) {
                // Old yellow/orange stars (majority)
                color.setHSL(0.1 + Math.random() * 0.05, 0.2, 0.35 + Math.random() * 0.15);
            } else {
                // White/grey stars
                color.setHSL(0.1, 0.05, 0.4 + Math.random() * 0.2);
            }

            starColors[i * 3] = color.r;
            starColors[i * 3 + 1] = color.g;
            starColors[i * 3 + 2] = color.b;
        }

        starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

        const starMaterial = new THREE.PointsMaterial({
            size: 0.8,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending
        });

        const stars = new THREE.Points(starGeometry, starMaterial);
        cloudGroup.add(stars);

        // === DUST/GAS COMPONENT ===
        const dustGeometry = new THREE.BufferGeometry();
        const dustPositions = new Float32Array(config.dustCount * 3);
        const dustColors = new Float32Array(config.dustCount * 3);

        for (let i = 0; i < config.dustCount; i++) {
            const t = Math.random();
            const r = Math.pow(t, 0.4) * config.size * 0.8;
            const theta = Math.random() * Math.PI * 2;

            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);
            const y = (Math.random() - 0.5) * config.size * 0.1;

            dustPositions[i * 3] = x;
            dustPositions[i * 3 + 1] = y;
            dustPositions[i * 3 + 2] = z;

            // Dark dust - blocks light
            color.setHSL(0.08, 0.1, 0.08 + Math.random() * 0.05);
            dustColors[i * 3] = color.r;
            dustColors[i * 3 + 1] = color.g;
            dustColors[i * 3 + 2] = color.b;
        }

        dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
        dustGeometry.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));

        const dustMaterial = new THREE.PointsMaterial({
            size: 2.0,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.3
        });

        const dust = new THREE.Points(dustGeometry, dustMaterial);
        cloudGroup.add(dust);

        // Add to galaxy group (will orbit with animation)
        this.galaxyGroup.add(cloudGroup);

        return cloudGroup;
    }

    /**
     * Create the Magellanic Stream - tidal gas stripped from the clouds
     */
    createMagellanicStream(lmc, smc) {
        // The stream is a trail of gas connecting LMC, SMC, and trailing behind
        const streamPoints = 500;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(streamPoints * 3);
        const colors = new Float32Array(streamPoints * 3);
        const color = new THREE.Color();

        const lmcPos = lmc.position;
        const smcPos = smc.position;

        for (let i = 0; i < streamPoints; i++) {
            const t = i / streamPoints;

            // Stream curves from SMC through LMC and trails behind
            let x, y, z;
            if (t < 0.3) {
                // SMC to LMC segment
                const st = t / 0.3;
                x = smcPos.x + (lmcPos.x - smcPos.x) * st;
                y = smcPos.y + (lmcPos.y - smcPos.y) * st;
                z = smcPos.z + (lmcPos.z - smcPos.z) * st;
            } else {
                // Trailing stream behind LMC
                const st = (t - 0.3) / 0.7;
                const trailAngle = lmc.userData.baseAngle - st * Math.PI * 0.8;
                const trailDist = lmc.userData.distance * (1 + st * 0.5);
                x = Math.cos(trailAngle) * trailDist;
                y = lmcPos.y * (1 - st * 0.5);
                z = Math.sin(trailAngle) * trailDist;
            }

            // Add some scatter
            x += (Math.random() - 0.5) * 10;
            y += (Math.random() - 0.5) * 5;
            z += (Math.random() - 0.5) * 10;

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            // Faint gas color
            color.setHSL(0.55, 0.15, 0.15 + Math.random() * 0.05);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.0,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending
        });

        const stream = new THREE.Points(geometry, material);
        this.galaxyGroup.add(stream);
        this.magellanicStream = stream;
    }

    /**
     * Update Magellanic Cloud orbital positions (call in animate loop)
     */
    updateMagellanicOrbits() {
        if (!this.magellanicClouds) return;

        // Very slow orbital motion - these take billions of years to orbit
        const orbitSpeed = 0.00001;  // Radians per frame

        for (const cloud of this.magellanicClouds) {
            const data = cloud.userData;
            const newAngle = data.baseAngle + this.time * orbitSpeed * (1500 / data.orbitalPeriod);

            cloud.position.set(
                Math.cos(newAngle) * data.distance,
                Math.sin(data.inclination) * data.distance * 0.3,
                Math.sin(newAngle) * data.distance
            );
        }
    }

    /**
     * Add a text label to a galaxy/object
     */
    addGalaxyLabel(group, name, offset) {
        // We'll create a sprite or just store the data for UI labels
        group.userData = {
            name: name,
            labelOffset: offset
        };
    }

    /**
     * Create Andromeda Galaxy (M31) as a mini spiral in the distance
     * Real distance: 2.5 million light years = ~770 kpc
     * We place it at ~600 units = 60,000 parsecs (compressed for visibility)
     */
    createAndromedaGalaxy() {
        const andromedaGroup = new THREE.Group();

        // Position - Andromeda is in a specific direction from Milky Way
        // We place it roughly where it would appear in the night sky
        const distance = 1000;  // Further out for larger galaxy scale
        const angle = Math.PI * 0.3;  // Direction
        const inclination = 0.4;  // Tilted relative to us

        andromedaGroup.position.set(
            Math.cos(angle) * distance,
            Math.sin(inclination) * distance * 0.3,
            Math.sin(angle) * distance
        );

        // Create mini spiral structure
        const armCount = 2;
        const starsPerArm = 800;
        const totalStars = armCount * starsPerArm + 500;  // Arms + bulge
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(totalStars * 3);
        const colors = new Float32Array(totalStars * 3);
        const color = new THREE.Color();

        let idx = 0;

        // Central bulge
        for (let i = 0; i < 500; i++) {
            const r = Math.pow(Math.random(), 0.5) * 8;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[idx * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[idx * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.3;
            positions[idx * 3 + 2] = r * Math.cos(phi);

            color.setHSL(0.1, 0.5, 0.4 + Math.random() * 0.2);
            colors[idx * 3] = color.r;
            colors[idx * 3 + 1] = color.g;
            colors[idx * 3 + 2] = color.b;
            idx++;
        }

        // Spiral arms
        for (let arm = 0; arm < armCount; arm++) {
            const armStart = (arm / armCount) * Math.PI * 2;
            for (let i = 0; i < starsPerArm; i++) {
                const t = i / starsPerArm;
                const r = 5 + t * 25;
                const spiralAngle = armStart + t * Math.PI * 2;
                const spread = (Math.random() - 0.5) * 3;

                positions[idx * 3] = r * Math.cos(spiralAngle + spread * 0.1);
                positions[idx * 3 + 1] = (Math.random() - 0.5) * 1;
                positions[idx * 3 + 2] = r * Math.sin(spiralAngle + spread * 0.1);

                const isBlue = Math.random() < 0.3;
                if (isBlue) {
                    color.setHSL(0.6, 0.5, 0.35 + Math.random() * 0.2);
                } else {
                    color.setHSL(0.1, 0.4, 0.3 + Math.random() * 0.15);
                }
                colors[idx * 3] = color.r;
                colors[idx * 3 + 1] = color.g;
                colors[idx * 3 + 2] = color.b;
                idx++;
            }
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.5,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });

        const andromeda = new THREE.Points(geometry, material);

        // Tilt to show it's a spiral viewed at an angle
        andromeda.rotation.x = 0.5;
        andromeda.rotation.z = 0.3;

        andromedaGroup.add(andromeda);

        // Add a subtle glow around it
        const glowGeometry = new THREE.SphereGeometry(35, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x8899cc,
            transparent: true,
            opacity: 0.08,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        andromedaGroup.add(glow);

        this.scene.add(andromedaGroup);
    }

    /**
     * Create Messier objects and deep sky objects as simple point POAs
     * All 110 Messier objects plus notable NGC objects
     */
    createMessierObjects() {
        const klyToUnits = 3;

        // Complete Messier catalog + notable deep sky objects - all as POA points
        const deepSkyObjects = [
            // === MESSIER NEBULAE ===
            { name: 'M1 Crab', type: 'remnant', dist: 6.5, angle: 1.25, color: 0xffaa44 },
            { name: 'M8 Lagoon', type: 'nebula', dist: 5.2, angle: 2.98, color: 0xff7799 },
            { name: 'M16 Eagle', type: 'nebula', dist: 7.0, angle: 2.2, color: 0xff8866 },
            { name: 'M17 Omega', type: 'nebula', dist: 6.0, angle: 2.68, color: 0xff8877 },
            { name: 'M20 Trifid', type: 'nebula', dist: 5.5, angle: 2.84, color: 0xdd6699 },
            { name: 'M27 Dumbbell', type: 'planetary', dist: 1.36, angle: 1.4, color: 0x66ddaa },
            { name: 'M42 Orion', type: 'nebula', dist: 1.34, angle: 1.3, color: 0xff99bb },
            { name: 'M43', type: 'nebula', dist: 1.6, angle: 1.32, color: 0xff88aa },
            { name: 'M57 Ring', type: 'planetary', dist: 2.3, angle: 1.5, color: 0x66aaff },
            { name: 'M76 Little Dumbbell', type: 'planetary', dist: 2.5, angle: 0.3, color: 0x55cc99 },
            { name: 'M78', type: 'nebula', dist: 1.6, angle: 1.28, color: 0x8899ff },
            { name: 'M97 Owl', type: 'planetary', dist: 2.6, angle: 2.1, color: 0x77ddcc },

            // === MESSIER GLOBULAR CLUSTERS ===
            { name: 'M2', type: 'globular', dist: 37, angle: 4.2, color: 0xffffcc },
            { name: 'M3', type: 'globular', dist: 33, angle: 1.2, color: 0xffeebb },
            { name: 'M4', type: 'globular', dist: 7.2, angle: 3.6, color: 0xffeeaa },
            { name: 'M5', type: 'globular', dist: 24, angle: 2.8, color: 0xffffdd },
            { name: 'M9', type: 'globular', dist: 25, angle: 3.3, color: 0xffeebb },
            { name: 'M10', type: 'globular', dist: 14, angle: 3.1, color: 0xffffcc },
            { name: 'M12', type: 'globular', dist: 16, angle: 3.0, color: 0xffeecc },
            { name: 'M13 Hercules', type: 'globular', dist: 25, angle: 0.5, color: 0xffeeaa },
            { name: 'M14', type: 'globular', dist: 30, angle: 3.2, color: 0xffeebb },
            { name: 'M15', type: 'globular', dist: 33, angle: 4.5, color: 0xffffcc },
            { name: 'M19', type: 'globular', dist: 28, angle: 3.35, color: 0xffeeaa },
            { name: 'M22', type: 'globular', dist: 10, angle: 3.4, color: 0xffffdd },
            { name: 'M28', type: 'globular', dist: 18, angle: 3.38, color: 0xffeebb },
            { name: 'M30', type: 'globular', dist: 26, angle: 4.6, color: 0xffffcc },
            { name: 'M53', type: 'globular', dist: 58, angle: 1.8, color: 0xffeeaa },
            { name: 'M54', type: 'globular', dist: 87, angle: 3.42, color: 0xffeebb },
            { name: 'M55', type: 'globular', dist: 17, angle: 3.5, color: 0xffffdd },
            { name: 'M56', type: 'globular', dist: 32, angle: 1.55, color: 0xffeecc },
            { name: 'M62', type: 'globular', dist: 22, angle: 3.25, color: 0xffffcc },
            { name: 'M68', type: 'globular', dist: 33, angle: 2.4, color: 0xffeebb },
            { name: 'M69', type: 'globular', dist: 29, angle: 3.36, color: 0xffffaa },
            { name: 'M70', type: 'globular', dist: 29, angle: 3.37, color: 0xffeecc },
            { name: 'M71', type: 'globular', dist: 13, angle: 1.6, color: 0xffffdd },
            { name: 'M72', type: 'globular', dist: 55, angle: 4.3, color: 0xffeebb },
            { name: 'M75', type: 'globular', dist: 67, angle: 4.0, color: 0xffffcc },
            { name: 'M79', type: 'globular', dist: 41, angle: 5.8, color: 0xffeeaa },
            { name: 'M80', type: 'globular', dist: 32, angle: 3.55, color: 0xffeebb },
            { name: 'M92', type: 'globular', dist: 26, angle: 0.45, color: 0xffffdd },
            { name: 'M107', type: 'globular', dist: 21, angle: 3.15, color: 0xffeecc },

            // === MESSIER OPEN CLUSTERS ===
            { name: 'M6 Butterfly', type: 'open', dist: 1.6, angle: 3.45, color: 0xaaddff },
            { name: 'M7 Ptolemy', type: 'open', dist: 0.98, angle: 3.48, color: 0xbbddff },
            { name: 'M11 Wild Duck', type: 'open', dist: 6.2, angle: 2.9, color: 0xccddff },
            { name: 'M18', type: 'open', dist: 4.9, angle: 2.76, color: 0xaaccff },
            { name: 'M21', type: 'open', dist: 4.25, angle: 2.86, color: 0xbbccff },
            { name: 'M23', type: 'open', dist: 2.15, angle: 3.2, color: 0xaaddff },
            { name: 'M25', type: 'open', dist: 2.0, angle: 3.25, color: 0xccddff },
            { name: 'M26', type: 'open', dist: 5.0, angle: 2.95, color: 0xbbccff },
            { name: 'M29', type: 'open', dist: 4.0, angle: 1.7, color: 0xaaddff },
            { name: 'M34', type: 'open', dist: 1.5, angle: 0.4, color: 0xccddff },
            { name: 'M35', type: 'open', dist: 2.8, angle: 0.9, color: 0xbbddff },
            { name: 'M36', type: 'open', dist: 4.1, angle: 0.7, color: 0xaaccff },
            { name: 'M37', type: 'open', dist: 4.5, angle: 0.75, color: 0xccccff },
            { name: 'M38', type: 'open', dist: 4.2, angle: 0.68, color: 0xbbddff },
            { name: 'M39', type: 'open', dist: 0.82, angle: 1.75, color: 0xddddff },
            { name: 'M41', type: 'open', dist: 2.3, angle: 5.2, color: 0xaaddff },
            { name: 'M44 Beehive', type: 'open', dist: 0.58, angle: 2.2, color: 0xeeddff },
            { name: 'M45 Pleiades', type: 'open', dist: 0.44, angle: 0.6, color: 0x99bbff },
            { name: 'M46', type: 'open', dist: 5.4, angle: 5.5, color: 0xbbccff },
            { name: 'M47', type: 'open', dist: 1.6, angle: 5.45, color: 0xccddff },
            { name: 'M48', type: 'open', dist: 1.5, angle: 2.5, color: 0xaaddff },
            { name: 'M50', type: 'open', dist: 3.0, angle: 5.35, color: 0xbbddff },
            { name: 'M52', type: 'open', dist: 5.0, angle: 0.2, color: 0xaaccff },
            { name: 'M67', type: 'open', dist: 2.6, angle: 2.3, color: 0xddccaa },
            { name: 'M93', type: 'open', dist: 3.6, angle: 5.6, color: 0xbbddff },
            { name: 'M103', type: 'open', dist: 10, angle: 0.15, color: 0xaaccff },

            // === FAMOUS NON-MESSIER OBJECTS ===
            { name: 'Carina Nebula', type: 'nebula', dist: 7.5, angle: 2.8, color: 0xff6688 },
            { name: 'Helix Nebula', type: 'planetary', dist: 0.7, angle: 4.5, color: 0x88ddff },
            { name: 'Cat\'s Eye', type: 'planetary', dist: 3.3, angle: 0.8, color: 0x55ccaa },
            { name: 'Omega Centauri', type: 'globular', dist: 17, angle: 3.2, color: 0xffffcc },
            { name: '47 Tucanae', type: 'globular', dist: 15, angle: 4.8, color: 0xffffdd },
            { name: 'Veil Nebula', type: 'remnant', dist: 2.4, angle: 1.65, color: 0x6688ff },
            { name: 'North America', type: 'nebula', dist: 2.2, angle: 1.72, color: 0xff7788 },
            { name: 'Rosette Nebula', type: 'nebula', dist: 5.2, angle: 5.1, color: 0xff6699 },
            { name: 'Cone Nebula', type: 'nebula', dist: 2.5, angle: 5.15, color: 0xff8899 },
            { name: 'Flame Nebula', type: 'nebula', dist: 1.35, angle: 1.31, color: 0xff9966 },
            { name: 'IC 1396', type: 'nebula', dist: 2.4, angle: 1.68, color: 0xff7777 },
            { name: 'Soul Nebula', type: 'nebula', dist: 6.5, angle: 0.25, color: 0xff6688 },
            { name: 'Heart Nebula', type: 'nebula', dist: 7.5, angle: 0.22, color: 0xff5577 },
            { name: 'California', type: 'nebula', dist: 1.0, angle: 0.55, color: 0xff8888 },
            { name: 'Tarantula', type: 'nebula', dist: 160, angle: 4.9, color: 0xff99aa },
            { name: 'Eta Carinae', type: 'nebula', dist: 7.5, angle: 2.75, color: 0xffaa77 },

            // === DARK NEBULAE ===
            { name: 'Coal Sack', type: 'dark', dist: 0.6, angle: 3.5, color: 0x442222 },
            { name: 'Horsehead', type: 'dark', dist: 1.5, angle: 1.35, color: 0x553322 },
            { name: 'Pipe Nebula', type: 'dark', dist: 0.45, angle: 3.28, color: 0x443322 },
            { name: 'Snake Nebula', type: 'dark', dist: 0.65, angle: 3.3, color: 0x442233 },

            // === GALACTIC CENTER REGION ===
            { name: 'Sgr A*', type: 'core', dist: 26, angle: Math.PI, color: 0xffdd00 },
            { name: 'Sgr B2', type: 'nebula', dist: 26, angle: Math.PI * 1.01, color: 0xff5533 },
            { name: 'Arches Cluster', type: 'open', dist: 25, angle: Math.PI * 1.02, color: 0xffddaa },
            { name: 'Quintuplet', type: 'open', dist: 26, angle: Math.PI * 0.99, color: 0xffccaa },
        ];

        // Create all as simple POA points
        this.messierObjects = [];
        this.createDeepSkyPOAs(deepSkyObjects, klyToUnits);
    }

    /**
     * Create deep sky objects as colonizable dot clusters with bonuses
     * Each Messier object = cluster of 5-30 dots, each colonizable
     * Messier bonuses ~100x better than normal stars
     */
    createDeepSkyPOAs(objects, klyToUnits) {
        const positions = [];
        const colors = [];

        // Messier cluster tracking
        this.messierClusters = [];
        this.messierDots = [];

        // Bonus config by type (normal star ~0.0001%, Messier dot ~0.05%)
        const bonusCfg = {
            'nebula':     { bonus: 'production', perDot: 0.0005, dots: [15, 25] },
            'planetary':  { bonus: 'dyson_efficiency', perDot: 0.001, dots: [8, 12] },
            'remnant':    { bonus: 'research', perDot: 5, dots: [10, 15] },
            'globular':   { bonus: 'production', perDot: 0.0003, dots: [20, 35] },
            'open':       { bonus: 'launch_efficiency', perDot: 0.0002, dots: [12, 20] },
            'dark':       { bonus: 'development_speed', perDot: 0.0008, dots: [8, 15] },
            'core':       { bonus: 'dyson_efficiency', perDot: 0.002, dots: [25, 40] }
        };

        for (const obj of objects) {
            const r = obj.dist * klyToUnits;
            const cx = this.solPosition.x + Math.cos(obj.angle) * r;
            const cz = this.solPosition.z + Math.sin(obj.angle) * r;
            let cy = this.solPosition.y;
            if (obj.type === 'globular') cy += (Math.random() - 0.5) * 40;
            else if (obj.type !== 'core') cy += (Math.random() - 0.5) * 3;

            const cfg = bonusCfg[obj.type] || { bonus: 'production', perDot: 0.0003, dots: [10, 20] };
            const dotCount = cfg.dots[0] + Math.floor(Math.random() * (cfg.dots[1] - cfg.dots[0]));
            const spread = obj.type === 'globular' ? 2.5 : (obj.type === 'nebula' ? 4 : 2);

            const cluster = {
                id: obj.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                name: obj.name, type: obj.type,
                centerPosition: new THREE.Vector3(cx, cy, cz),
                distance_kly: obj.dist, dotCount, dotsColonized: 0,
                bonusType: cfg.bonus, bonusPerDot: cfg.perDot,
                totalBonus: dotCount * cfg.perDot, dots: []
            };

            const baseColor = new THREE.Color(obj.color);

            for (let i = 0; i < dotCount; i++) {
                const u = Math.random() || 0.001;
                const d = Math.sqrt(-2 * Math.log(u)) * spread * 0.4;
                const th = Math.random() * Math.PI * 2;
                const ph = Math.acos(2 * Math.random() - 1);
                const dx = d * Math.sin(ph) * Math.cos(th);
                const dy = d * Math.sin(ph) * Math.sin(th) * 0.3;
                const dz = d * Math.cos(ph);

                positions.push(cx + dx, cy + dy, cz + dz);
                const b = 0.7 + Math.random() * 0.3;
                colors.push(baseColor.r * b, baseColor.g * b, baseColor.b * b);

                const dot = {
                    clusterId: cluster.id, clusterName: cluster.name, index: i,
                    position: new THREE.Vector3(cx + dx, cy + dy, cz + dz),
                    colonized: false, bonusType: cfg.bonus, bonusValue: cfg.perDot
                };
                cluster.dots.push(dot);
                this.messierDots.push(dot);
            }

            this.messierClusters.push(cluster);
            this.messierObjects.push(cluster);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const material = new THREE.PointsMaterial({
            size: 0.4, sizeAttenuation: true, vertexColors: true,
            transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending
        });
        this.deepSkyPOAs = new THREE.Points(geometry, material);
        this.galaxyGroup.add(this.deepSkyPOAs);

        console.log(`[StarMap] ${this.messierClusters.length} Messier clusters, ${this.messierDots.length} colonizable dots`);
    }

    /**
     * Find nearest uncolonized Messier dot
     */
    findNearestMessierDot(fromX, fromY, fromZ, maxDist = 100) {
        let nearest = null, nearestD = maxDist;
        for (const dot of this.messierDots) {
            if (dot.colonized) continue;
            const dx = dot.position.x - fromX, dy = dot.position.y - fromY, dz = dot.position.z - fromZ;
            const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (d < nearestD) { nearestD = d; nearest = dot; }
        }
        return nearest;
    }

    /**
     * Colonize a Messier dot and apply bonus
     */
    colonizeMessierDot(dot) {
        if (dot.colonized) return null;
        dot.colonized = true;

        const cluster = this.messierClusters.find(c => c.id === dot.clusterId);
        if (cluster) {
            cluster.dotsColonized++;
            const pct = Math.round((cluster.dotsColonized / cluster.dotCount) * 100);
            console.log(`[StarMap] ${cluster.name}: ${cluster.dotsColonized}/${cluster.dotCount} (${pct}%)`);
        }

        // Apply bonus
        switch (dot.bonusType) {
            case 'production': this.empireBonuses.production += dot.bonusValue; break;
            case 'dyson_efficiency': this.empireBonuses.dyson_efficiency += dot.bonusValue; break;
            case 'launch_efficiency': this.empireBonuses.launch_efficiency = Math.max(0.1, this.empireBonuses.launch_efficiency - dot.bonusValue); break;
            case 'development_speed': this.empireBonuses.development_speed += dot.bonusValue; break;
            case 'research': this.empireBonuses.research += dot.bonusValue; break;
        }
        return cluster;
    }

    /**
     * Create a distant, subtle smoky nebula
     */
    createSmokyNebula(x, y, z, color, size, name, type) {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        const colorObj = new THREE.Color(color);
        const particleCount = type === 'planetary' ? 30 : 60;

        // Soft glowing particles
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);

        for (let i = 0; i < particleCount; i++) {
            // Gaussian-ish distribution for smoky look
            const r = size * Math.pow(Math.random(), 0.7);
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.3; // Flatten
            positions[i * 3 + 2] = r * Math.cos(phi);

            // Vary color slightly
            const brightness = 0.6 + Math.random() * 0.4;
            colors[i * 3] = colorObj.r * brightness;
            colors[i * 3 + 1] = colorObj.g * brightness;
            colors[i * 3 + 2] = colorObj.b * brightness;

            sizes[i] = (0.3 + Math.random() * 0.5) * size;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            size: 0.4,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.25,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const nebula = new THREE.Points(geometry, material);
        nebula.userData.name = name;
        group.add(nebula);

        this.galaxyGroup.add(group);
    }

    /**
     * Create a distant globular/open cluster
     */
    createDistantCluster(x, y, z, color, size, name) {
        const starCount = 40;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colorObj = new THREE.Color(color);
        const colors = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount; i++) {
            // Concentrated toward center
            const r = Math.pow(Math.random(), 2) * size;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = x + r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = y + r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = z + r * Math.cos(phi);

            const brightness = 0.7 + Math.random() * 0.3;
            colors[i * 3] = colorObj.r * brightness;
            colors[i * 3 + 1] = colorObj.g * brightness;
            colors[i * 3 + 2] = colorObj.b * brightness;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.2,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });

        const cluster = new THREE.Points(geometry, material);
        cluster.userData.name = name;
        this.galaxyGroup.add(cluster);
    }

    /**
     * Create a dark nebula (absorption cloud)
     */
    createDarkNebula(x, y, z, size, name) {
        const particleCount = 25;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            const r = size * Math.pow(Math.random(), 0.5);
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = x + r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = y + r * Math.sin(phi) * Math.sin(theta) * 0.2;
            positions[i * 3 + 2] = z + r * Math.cos(phi);
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            size: 0.6,
            color: 0x110808,
            transparent: true,
            opacity: 0.4,
            blending: THREE.NormalBlending,
            depthWrite: false
        });

        const cloud = new THREE.Points(geometry, material);
        cloud.userData.name = name;
        this.galaxyGroup.add(cloud);
    }

    /**
     * Create major star systems as focusable landmarks throughout the galaxy
     * These are notable stars with simple text labels and hotkeys
     */
    createMajorStarSystems() {
        // Store focusable systems for keyboard navigation
        this.majorSystems = [];
        this.systemLabels = [];

        // Create container for all system labels
        this.systemLabelsContainer = document.createElement('div');
        this.systemLabelsContainer.className = 'system-labels-container';
        this.container.appendChild(this.systemLabelsContainer);

        // Define major landmarks distributed throughout the galaxy
        // Distances in kly, angles in radians from Sol's position
        // Note: Only objects > 5 kly from Sol are labeled to avoid clutter
        const majorStars = [
            // === SOL - hotkey 1 (return home) ===
            { id: 'sol', name: 'Sol', dist: 0, angle: 0, key: '1', isSol: true },

            // === DISTANT LANDMARKS (5+ kly) - hotkeys 2-9 ===
            { id: 'cygnus_region', name: 'Cygnus Region', dist: 6.0, angle: 1.6, key: '2' },      // 6000 ly
            { id: 'perseus_arm', name: 'Perseus Arm', dist: 6.4, angle: 0.4, key: '3' },          // 6400 ly
            { id: 'carina_region', name: 'Carina Region', dist: 7.5, angle: 2.85, key: '4' },     // 7500 ly
            { id: 'scutum_cloud', name: 'Scutum Cloud', dist: 18, angle: Math.PI * 0.85, key: '5' }, // 18000 ly
            { id: 'galactic_bar_near', name: 'Near Bar End', dist: 22, angle: Math.PI * 0.7, key: '6' },
            { id: 'galactic_bar_far', name: 'Far Bar End', dist: 22, angle: Math.PI * 1.3, key: '7' },
            { id: 'far_perseus', name: 'Far Perseus', dist: 52, angle: 0.15, key: '8' },
            { id: 'outer_rim', name: 'Outer Rim', dist: 62, angle: 0.8, key: '9' },

            // === GALACTIC CENTER - hotkey 0 ===
            { id: 'sagittarius_a', name: 'Sgr A*', dist: 26, angle: Math.PI, key: '0' },

            // === SPIRAL ARM FEATURES (5+ kly, click only) ===
            { id: 'cygnus_x1', name: 'Cygnus X-1', dist: 6.1, angle: 1.65, key: null },
            { id: 'eta_carinae', name: 'η Carinae', dist: 7.5, angle: 2.9, key: null },
            { id: 'heart_nebula', name: 'Heart Nebula', dist: 7.5, angle: 0.6, key: null },

            // === SAGITTARIUS ARM - along Galactic center direction ===
            { id: 'sag_arm_near', name: 'Sagittarius Proximal', dist: 4, angle: Math.PI * 0.85, key: null },
            { id: 'sag_arm_mid', name: 'Sagittarius Median', dist: 12, angle: Math.PI * 0.9, key: null },
            { id: 'sag_arm_far', name: 'Sagittarius Deep', dist: 24, angle: Math.PI * 0.95, key: null },

            // === PERSEUS ARM - outward from Sol ===
            { id: 'perseus_near', name: 'Perseus Inner', dist: 5, angle: 0.2, key: null },
            { id: 'perseus_mid', name: 'Perseus Transit', dist: 15, angle: 0.25, key: null },
            { id: 'perseus_outer', name: 'Perseus Reaches', dist: 35, angle: 0.3, key: null },

            // === SCUTUM-CENTAURUS ARM ===
            { id: 'scutum_near', name: 'Scutum Inner', dist: 10, angle: Math.PI * 0.75, key: null },
            { id: 'centaurus_mid', name: 'Centaurus Sector', dist: 20, angle: Math.PI * 0.6, key: null },
            { id: 'crux_transit', name: 'Crux-Scutum Transit', dist: 32, angle: Math.PI * 0.5, key: null },

            // === NORMA ARM ===
            { id: 'norma_sector', name: 'Norma Sector', dist: 16, angle: Math.PI * 1.4, key: null },
            { id: 'norma_deep', name: 'Norma Deep Field', dist: 28, angle: Math.PI * 1.5, key: null },

            // === ORION SPUR (local arm) ===
            { id: 'orion_trailing', name: 'Orion Trailing Edge', dist: 3, angle: Math.PI * 0.65, key: null },
            { id: 'orion_leading', name: 'Orion Leading Edge', dist: 3, angle: Math.PI * 0.35, key: null },

            // === OUTER ARM (beyond Perseus) ===
            { id: 'outer_arm_entry', name: 'Outer Arm Entry', dist: 45, angle: 0.35, key: null },
            { id: 'outer_arm_deep', name: 'Outer Arm Deep', dist: 55, angle: 0.4, key: null },

            // === FAR SIDE OF GALAXY (opposite Sol) ===
            { id: 'far_carina', name: 'Far Carina Arm', dist: 48, angle: 0.5, key: null },
            { id: 'far_crux', name: 'Crux-Scutum Far', dist: 55, angle: Math.PI * 0.4, key: null },
            { id: 'far_norma', name: 'Far Norma Arm', dist: 50, angle: Math.PI * 1.6, key: null },
            { id: 'far_sagittarius', name: 'Far Sagittarius', dist: 58, angle: Math.PI * 1.2, key: null },
            { id: 'outer_rim_2', name: 'Outer Rim β', dist: 60, angle: 2.2, key: null },
            { id: 'outer_rim_3', name: 'Outer Rim γ', dist: 65, angle: 4.0, key: null },
            { id: 'outer_rim_4', name: 'Outer Rim δ', dist: 58, angle: 5.2, key: null },

            // === GALACTIC CORE REGION ===
            { id: '3kpc_arm', name: '3-kpc Arm', dist: 35, angle: Math.PI * 0.95, key: null },
            { id: 'molecular_ring', name: 'Molecular Ring', dist: 30, angle: Math.PI * 1.1, key: null },

            // === DISTANT HALO GLOBULAR CLUSTERS ===
            { id: 'ngc_2419', name: 'NGC 2419', dist: 90, angle: 1.8, yOffset: 25, key: null },
            { id: 'pal_3', name: 'Palomar 3', dist: 95, angle: 4.5, yOffset: -20, key: null },
            { id: 'pal_4', name: 'Palomar 4', dist: 110, angle: 2.5, yOffset: 30, key: null },
            { id: 'am_1', name: 'AM 1', dist: 125, angle: 5.0, yOffset: -25, key: null },

            // === EXTRAGALACTIC - positions match 3D objects (absolute, not relative to Sol) ===
            // These use absolute positions to match their 3D counterparts
            { id: 'lmc', name: 'LMC', dist: 160, angle: 3.8, yOffset: -30, key: null, extragalactic: true },
            { id: 'smc', name: 'SMC', dist: 200, angle: 4.1, yOffset: -35, key: null, extragalactic: true },
            // Andromeda: matches createAndromedaGalaxy position
            { id: 'andromeda', name: 'Andromeda (M31)', absolutePos: { x: Math.cos(Math.PI * 0.3) * 1000, y: Math.sin(0.4) * 1000 * 0.3, z: Math.sin(Math.PI * 0.3) * 1000 }, key: null, extragalactic: true, dist: 2500 },
        ];

        // Scale factor for converting kly to scene units
        const klyToUnits = 3;

        for (const star of majorStars) {
            let localPosition;

            if (star.absolutePos) {
                // Extragalactic objects with absolute world position (don't rotate with galaxy)
                localPosition = new THREE.Vector3(star.absolutePos.x, star.absolutePos.y, star.absolutePos.z);
            } else {
                // Calculate position relative to Sol (local to galaxy group)
                const r = star.dist * klyToUnits;
                const x = this.solPosition.x + Math.cos(star.angle) * r;
                const z = this.solPosition.z + Math.sin(star.angle) * r;
                // Handle halo objects with vertical offset
                const y = this.solPosition.y + (star.yOffset || 0);
                localPosition = new THREE.Vector3(x, y, z);
            }

            // Create HTML label
            const label = this.createSystemLabel(star, localPosition);

            // Store for focusing and updates
            this.majorSystems.push({
                id: star.id,
                name: star.name,
                key: star.key,
                localPosition: localPosition,  // Local to galaxy group
                distance_kly: star.dist,
                extragalactic: star.extragalactic || false,
                label: label
            });
        }

        // Also add labels for Messier objects (created earlier)
        // Only label objects > 5 kly to avoid clutter near Sol
        if (this.messierObjects) {
            for (const obj of this.messierObjects) {
                // Skip objects too close to Sol (< 5000 ly)
                if (obj.distance_kly < 5) continue;

                const label = this.createSystemLabel({
                    id: obj.id,
                    name: obj.name,
                    dist: obj.distance_kly,
                    key: null
                }, obj.localPosition);

                this.majorSystems.push({
                    id: obj.id,
                    name: obj.name,
                    key: null,
                    localPosition: obj.localPosition,
                    distance_kly: obj.distance_kly,
                    isMessier: true,
                    messierType: obj.type,
                    label: label
                });
            }
        }

        console.log(`[StarMap] Created ${this.majorSystems.length} POI labels (stars + Messier objects)`);
    }

    /**
     * Create an HTML label for a star system
     */
    createSystemLabel(star, position) {
        const label = document.createElement('div');
        label.className = 'poi-label';
        label.innerHTML = `
            <span class="poi-key">${star.key || ''}</span>
            <span class="poi-name">${star.name}</span>
            <span class="poi-dist">${star.dist < 1 ? `${(star.dist * 1000).toFixed(0)} ly` : `${star.dist.toFixed(1)} kly`}</span>
        `;

        // Click to focus
        label.addEventListener('click', () => {
            this.focusOnSystem(star.id);
        });

        label.dataset.systemId = star.id;
        this.systemLabelsContainer.appendChild(label);

        return {
            element: label,
            position: position
        };
    }

    /**
     * Update all system label positions based on camera
     * Applies galaxy rotation to keep labels attached to their stars
     */
    updateSystemLabels() {
        if (!this.majorSystems || !this.camera) return;

        // Get galaxy rotation matrix to transform local positions to world
        const galaxyMatrix = this.galaxyGroup.matrixWorld;

        for (const system of this.majorSystems) {
            if (!system.label) continue;

            const label = system.label;
            // Skip if localPosition is missing
            if (!system.localPosition) {
                if (label?.element) label.element.style.display = 'none';
                continue;
            }
            // Extragalactic objects have absolute positions, others rotate with galaxy
            let worldPos;
            if (system.extragalactic && system.localPosition) {
                // Absolute position - doesn't rotate with galaxy
                worldPos = system.localPosition.clone();
            } else {
                // Apply galaxy rotation to the local position
                worldPos = system.localPosition.clone().applyMatrix4(galaxyMatrix);
            }

            // Check if in front of camera
            const cameraDir = new THREE.Vector3();
            this.camera.getWorldDirection(cameraDir);
            const toPoint = worldPos.clone().sub(this.camera.position).normalize();
            const dot = cameraDir.dot(toPoint);

            if (dot < 0) {
                // Behind camera
                label.element.style.display = 'none';
                continue;
            }

            // Project to screen
            const screenPos = worldPos.clone().project(this.camera);
            const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

            // Check if on screen
            if (x < -100 || x > window.innerWidth + 100 || y < -50 || y > window.innerHeight + 50) {
                label.element.style.display = 'none';
                continue;
            }

            // Calculate distance for opacity fade
            const dist = this.camera.position.distanceTo(worldPos);
            const opacity = Math.min(1, Math.max(0.3, 1 - (dist / 500)));

            label.element.style.display = 'block';
            label.element.style.left = `${x}px`;
            label.element.style.top = `${y}px`;
            label.element.style.opacity = opacity;
        }
    }

    /**
     * Focus camera on a major star system
     * @param {string} systemId - ID of system to focus on (or number key)
     */
    focusOnSystem(systemId) {
        if (!this.isActive || !this.majorSystems) return;

        // Find by ID or key
        const system = this.majorSystems.find(s =>
            s.id === systemId || s.key === systemId
        );

        if (!system) {
            console.log(`[StarMap] System not found: ${systemId}`);
            return;
        }

        console.log(`[StarMap] Focusing on ${system.name}`);

        // If focusing on Sol, use goToSol
        if (system.isSol) {
            this.goToSol();
            return;
        }

        // Scale distance based on how far the target is
        let targetDistance;
        if (system.extragalactic) {
            targetDistance = Math.max(50, Math.min(500, 50 + (system.distance_kly * 0.05)));
        } else {
            targetDistance = Math.max(15, Math.min(200, 15 + (system.distance_kly * 0.3)));
        }

        // Transform local position to world using galaxyGroup (not colonizationGroup)
        const worldPos = system.localPosition.clone();
        if (!system.extragalactic && this.galaxyGroup) {
            worldPos.applyMatrix4(this.galaxyGroup.matrixWorld);
        }

        console.log('[StarMap] focusOnSystem worldPos:', worldPos, 'distance:', targetDistance);

        // Simple camera navigation
        this.goToPosition(worldPos, targetDistance);

        // Show notification
        this.showSystemNotification(system);
    }

    /**
     * Show notification when focusing on a system
     */
    showSystemNotification(system) {
        // Remove existing notification
        const existing = document.querySelector('.system-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = 'system-notification';
        notification.innerHTML = `
            <div class="system-name">${system.name}</div>
            <div class="system-info">
                <span>Distance: ${system.distance_kly < 1
                    ? `${(system.distance_kly * 1000).toFixed(0)} ly`
                    : `${system.distance_kly.toFixed(1)} kly`}</span>
                <span>Type: ${system.spectral === 'X' ? 'Exotic' : `Class ${system.spectral}`}</span>
            </div>
            ${system.key ? `<div class="system-key">Press ${system.key} to return</div>` : ''}
        `;

        this.container.appendChild(notification);

        // Auto-hide after 4 seconds
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 500);
        }, 4000);
    }

    /**
     * Create Sol marker - our starting point
     * Sol is unremarkable - just one star among billions, marked with a subtle indicator
     */
    createSolMarker() {
        // Sol is just a tiny point - same as any other star in the galaxy
        // We only mark it so the player can find it
        const solGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        const solMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffee,  // Slightly warm white, like a G-type star
            transparent: true,
            opacity: 0.9
        });
        this.solMesh = new THREE.Mesh(solGeometry, solMaterial);
        this.solMesh.position.set(this.solPosition.x, this.solPosition.y, this.solPosition.z);

        // No glow - Sol is unremarkable, same as any other star
        // The label is the only thing that distinguishes it

        this.galaxyGroup.add(this.solMesh);

        // Create HTML label for Sol
        this.createSolLabel();
    }

    /**
     * Create HTML label that tracks Sol's position
     */
    createSolLabel() {
        this.solLabel = document.createElement('div');
        this.solLabel.id = 'sol-label';
        this.solLabel.className = 'star-label sol-label';
        this.solLabel.innerHTML = `
            <span class="star-name">Sol <span class="hotkey">[1]</span></span>
            <span class="star-distance">Home</span>
        `;
        this.container.appendChild(this.solLabel);
    }

    /**
     * Update Sol label position to track Sol in 3D space
     */
    updateSolLabel() {
        if (!this.solLabel || !this.solMesh || !this.camera) return;

        // Get Sol's world position
        const solWorldPos = new THREE.Vector3();
        this.solMesh.getWorldPosition(solWorldPos);

        // Project to screen coordinates
        const screenPos = solWorldPos.clone().project(this.camera);

        // Convert to CSS coordinates
        const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

        // Check if Sol is in front of camera (z < 1 means visible)
        if (screenPos.z < 1 && screenPos.z > -1) {
            this.solLabel.style.display = 'block';
            this.solLabel.style.left = `${x}px`;
            this.solLabel.style.top = `${y}px`;

            // Fade based on distance to camera
            const dist = this.camera.position.distanceTo(solWorldPos);
            const opacity = Math.max(0.3, Math.min(1, 1 - dist / 500));
            this.solLabel.style.opacity = opacity.toString();
        } else {
            this.solLabel.style.display = 'none';
        }
    }

    /**
     * Create the sphere of influence visualization
     * This shows how far your civilization has spread
     */
    createSphereOfInfluence() {
        // Start with a small sphere around Sol
        this.influenceRadius = 0.5;  // Start at ~50 parsecs

        // Inner colonized region (solid)
        const innerGeometry = new THREE.SphereGeometry(1, 32, 32);
        const innerMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide
        });
        this.influenceSphere = new THREE.Mesh(innerGeometry, innerMaterial);
        this.influenceSphere.position.copy(this.solMesh.position);
        this.influenceSphere.scale.setScalar(this.influenceRadius);
        this.galaxyGroup.add(this.influenceSphere);

        // Outer expansion front (wireframe ring)
        const ringGeometry = new THREE.RingGeometry(0.95, 1.05, 64);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffaa,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        this.influenceRing = new THREE.Mesh(ringGeometry, ringMaterial);
        this.influenceRing.position.copy(this.solMesh.position);
        this.influenceRing.scale.setScalar(this.influenceRadius);
        this.galaxyGroup.add(this.influenceRing);
    }

    /**
     * Update sphere of influence based on game state
     */
    updateSphereOfInfluence(radius) {
        this.influenceRadius = radius;
        if (this.influenceSphere) {
            this.influenceSphere.scale.setScalar(radius);
        }
        if (this.influenceRing) {
            this.influenceRing.scale.setScalar(radius);
        }
    }

    /**
     * Create animated dust clouds in the galactic plane (background effect)
     * Scattered throughout the galaxy for depth
     */
    createBackgroundDustClouds() {
        const cloudCount = 50;  // More clouds for larger galaxy

        for (let i = 0; i < cloudCount; i++) {
            const cloudGeometry = new THREE.BufferGeometry();
            const cloudParticles = 800;
            const positions = new Float32Array(cloudParticles * 3);

            // Cloud center position - spread across the galaxy
            const distance = 50 + Math.random() * (this.galaxyRadius - 50);
            const angle = Math.random() * Math.PI * 2;
            const centerX = Math.cos(angle) * distance;
            const centerZ = Math.sin(angle) * distance;
            const centerY = (Math.random() - 0.5) * 5 * Math.exp(-distance / 300);

            // Cloud extent scales with distance from center
            const cloudSize = 15 + Math.random() * 40;

            for (let j = 0; j < cloudParticles; j++) {
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                const r = cloudSize * Math.cbrt(Math.random());

                positions[j * 3] = centerX + r * Math.sin(phi) * Math.cos(theta);
                positions[j * 3 + 1] = centerY + r * Math.sin(phi) * Math.sin(theta) * 0.2;
                positions[j * 3 + 2] = centerZ + r * Math.cos(phi);
            }

            cloudGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            // Vary cloud colors - some reddish, some bluish
            const hue = Math.random() < 0.3 ? 0.0 + Math.random() * 0.1 : 0.6 + Math.random() * 0.1;
            const cloudMaterial = new THREE.PointsMaterial({
                size: 3,
                color: new THREE.Color().setHSL(hue, 0.4, 0.15),
                transparent: true,
                opacity: 0.1,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            const cloud = new THREE.Points(cloudGeometry, cloudMaterial);
            cloud.userData = {
                rotationSpeed: (Math.random() - 0.5) * 0.0001,
                driftX: (Math.random() - 0.5) * 0.002,
                driftZ: (Math.random() - 0.5) * 0.002
            };

            this.dustClouds.push(cloud);
            this.scene.add(cloud);
        }
    }

    /**
     * Create distant background stars (extragalactic / skybox effect)
     */
    createBackgroundStars() {
        const starCount = 15000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        const color = new THREE.Color();

        for (let i = 0; i < starCount; i++) {
            // Spherical distribution at very large radius (like a skybox)
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 800 + Math.random() * 400;  // Far beyond the galaxy

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);

            // Random star colors - dimmer, more distant
            const colorType = Math.random();
            if (colorType < 0.7) {
                color.setHex(0xaaaaaa); // Dim white
            } else if (colorType < 0.85) {
                color.setHex(0xccaa88); // Dim orange
            } else if (colorType < 0.95) {
                color.setHex(0x8899cc); // Dim blue
            } else {
                color.setHex(0xccaa77); // Dim yellow
            }

            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.8,
            sizeAttenuation: false,  // Fixed size regardless of distance
            vertexColors: true,
            transparent: true,
            opacity: 0.5
        });

        this.backgroundStars = new THREE.Points(geometry, material);
        this.scene.add(this.backgroundStars);

        // Add distant background galaxies for visual interest
        this.createBackgroundGalaxies();
    }

    /**
     * Create distant background galaxies as simple POA points
     * ~500 galaxies including named Local Group members
     */
    createBackgroundGalaxies() {
        const galaxyCount = 500;
        const positions = [];
        const colors = [];
        const color = new THREE.Color();

        // Named background galaxies (Local Group and nearby)
        const namedGalaxies = [
            { name: 'Andromeda (M31)', theta: 0.8, phi: 1.2, color: 0xaabbdd },
            { name: 'Triangulum (M33)', theta: 0.9, phi: 1.3, color: 0x99aacc },
            { name: 'LMC', theta: 4.8, phi: 2.1, color: 0xbbccdd },
            { name: 'SMC', theta: 4.9, phi: 2.0, color: 0xaabbcc },
            { name: 'M81', theta: 2.0, phi: 0.8, color: 0x99aadd },
            { name: 'M82 Cigar', theta: 2.05, phi: 0.82, color: 0xddaa88 },
            { name: 'Centaurus A', theta: 3.4, phi: 1.8, color: 0xccbb99 },
            { name: 'M87', theta: 1.5, phi: 1.4, color: 0xddcc99 },
            { name: 'Sombrero', theta: 1.6, phi: 1.6, color: 0xccbbaa },
            { name: 'Whirlpool', theta: 1.8, phi: 1.0, color: 0x99aadd },
            { name: 'Pinwheel', theta: 2.2, phi: 0.9, color: 0xaabbee },
            { name: 'NGC 1300', theta: 0.5, phi: 1.7, color: 0xbbaacc },
            { name: 'Needle', theta: 1.7, phi: 1.3, color: 0xccccdd },
            { name: 'IC 1101', theta: 2.5, phi: 1.1, color: 0xeeddaa },
        ];

        // Add named galaxies as brighter points
        this.backgroundGalaxyData = [];
        for (const g of namedGalaxies) {
            const r = 1600;
            const x = r * Math.sin(g.phi) * Math.cos(g.theta);
            const y = r * Math.sin(g.phi) * Math.sin(g.theta);
            const z = r * Math.cos(g.phi);
            positions.push(x, y, z);
            color.set(g.color);
            colors.push(color.r, color.g, color.b);
            this.backgroundGalaxyData.push({ name: g.name, position: new THREE.Vector3(x, y, z) });
        }

        // Add random background galaxies
        for (let i = 0; i < galaxyCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 1200 + Math.random() * 800;
            positions.push(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
            const type = Math.random();
            if (type < 0.4) color.setHSL(0.6, 0.3, 0.15 + Math.random() * 0.1);
            else if (type < 0.7) color.setHSL(0.1, 0.25, 0.12 + Math.random() * 0.08);
            else color.setHSL(0.5, 0.2, 0.1 + Math.random() * 0.1);
            colors.push(color.r, color.g, color.b);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const material = new THREE.PointsMaterial({
            size: 1.2, sizeAttenuation: false, vertexColors: true,
            transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending
        });
        this.backgroundGalaxiesPOA = new THREE.Points(geometry, material);
        this.scene.add(this.backgroundGalaxiesPOA);
    }

    /**
     * Create a distant spiral galaxy (enhanced with more stars, glow, rotation)
     */
    createDistantSpiral(x, y, z) {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        // Random orientation
        group.rotation.x = Math.random() * Math.PI;
        group.rotation.y = Math.random() * Math.PI;
        group.rotation.z = Math.random() * Math.PI;

        const size = 5 + Math.random() * 15;
        const starCount = 150 + Math.floor(Math.random() * 250);  // Triple star count
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        const color = new THREE.Color();
        const arms = 2 + Math.floor(Math.random() * 2);

        for (let i = 0; i < starCount; i++) {
            const arm = i % arms;
            const t = Math.random();
            const r = t * size;
            const armAngle = (arm / arms) * Math.PI * 2;
            const spiralAngle = armAngle + t * 2 + (Math.random() - 0.5) * 0.5;

            positions[i * 3] = r * Math.cos(spiralAngle);
            positions[i * 3 + 1] = (Math.random() - 0.5) * size * 0.1;
            positions[i * 3 + 2] = r * Math.sin(spiralAngle);

            // Mix of blue-white (young stars in arms) and yellow (old stars)
            const isYoungStar = Math.random() < 0.3;
            if (isYoungStar) {
                color.setHSL(0.6, 0.3, 0.2 + Math.random() * 0.15);  // Blue-white
            } else {
                color.setHSL(0.1 + Math.random() * 0.1, 0.15, 0.18 + Math.random() * 0.12);  // Warm
            }
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.5,
            sizeAttenuation: false,
            vertexColors: true,
            transparent: true,
            opacity: 0.5,  // Increased opacity
            blending: THREE.AdditiveBlending
        });

        const stars = new THREE.Points(geometry, material);
        group.add(stars);

        // Add subtle glow halo
        const glowGeometry = new THREE.SphereGeometry(size * 0.8, 8, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x8899cc,
            transparent: true,
            opacity: 0.06,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        group.add(glow);

        // Store rotation speed for animation
        group.userData.rotationSpeed = 0.00005 + Math.random() * 0.0001;
        group.userData.isSpiral = true;

        this.scene.add(group);

        // Track for animation
        if (!this.distantGalaxies) this.distantGalaxies = [];
        this.distantGalaxies.push(group);
    }

    /**
     * Create a distant elliptical galaxy (enhanced with more stars and glow)
     */
    createDistantElliptical(x, y, z) {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        group.rotation.x = Math.random() * Math.PI;
        group.rotation.y = Math.random() * Math.PI;

        const size = 4 + Math.random() * 12;
        const ellipticity = 0.3 + Math.random() * 0.7;  // How elongated
        const starCount = 80 + Math.floor(Math.random() * 120);  // Increased star count
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        const color = new THREE.Color();

        for (let i = 0; i < starCount; i++) {
            // Gaussian-ish distribution
            const u1 = Math.random() || 0.001;
            const u2 = Math.random();
            const r = Math.sqrt(-2 * Math.log(u1)) * size * 0.3;

            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * ellipticity;
            positions[i * 3 + 2] = r * Math.cos(phi);

            // Warm, old star colors (ellipticals are mostly old stars)
            color.setHSL(0.08 + Math.random() * 0.05, 0.18, 0.15 + Math.random() * 0.1);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.2,
            sizeAttenuation: false,
            vertexColors: true,
            transparent: true,
            opacity: 0.45,  // Increased opacity
            blending: THREE.AdditiveBlending
        });

        const stars = new THREE.Points(geometry, material);
        group.add(stars);

        // Add warm glow halo (ellipticals have yellow/orange halos)
        const glowGeometry = new THREE.SphereGeometry(size * 0.6, 8, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xccaa77,
            transparent: true,
            opacity: 0.05,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        group.add(glow);

        this.scene.add(group);
    }

    /**
     * Create a distant irregular galaxy
     */
    createDistantIrregular(x, y, z) {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        group.rotation.x = Math.random() * Math.PI;
        group.rotation.y = Math.random() * Math.PI;

        const size = 3 + Math.random() * 8;
        const starCount = 20 + Math.floor(Math.random() * 40);
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        const color = new THREE.Color();

        // Create a few random "blobs"
        const blobs = 2 + Math.floor(Math.random() * 3);
        const blobCenters = [];
        for (let b = 0; b < blobs; b++) {
            blobCenters.push({
                x: (Math.random() - 0.5) * size,
                y: (Math.random() - 0.5) * size * 0.3,
                z: (Math.random() - 0.5) * size
            });
        }

        for (let i = 0; i < starCount; i++) {
            const blob = blobCenters[i % blobs];
            const scatter = size * 0.3;

            positions[i * 3] = blob.x + (Math.random() - 0.5) * scatter;
            positions[i * 3 + 1] = blob.y + (Math.random() - 0.5) * scatter * 0.5;
            positions[i * 3 + 2] = blob.z + (Math.random() - 0.5) * scatter;

            // Mix of colors (irregulars have active star formation)
            const isYoung = Math.random() < 0.3;
            if (isYoung) {
                color.setHSL(0.55 + Math.random() * 0.1, 0.2, 0.18 + Math.random() * 0.1);
            } else {
                color.setHSL(0.1, 0.1, 0.12 + Math.random() * 0.08);
            }
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.0,
            sizeAttenuation: false,
            vertexColors: true,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });

        group.add(new THREE.Points(geometry, material));
        this.scene.add(group);
    }

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

    /**
     * Create the Kardashev scale resource bar
     * Full-width top bar showing civilization power level and key stats
     */
    createKardashevResourceBar() {
        const bar = document.createElement('div');
        bar.id = 'kardashev-resource-bar';
        bar.className = 'kardashev-resource-bar';
        bar.innerHTML = `
            <div class="kardashev-left">
                <div class="kardashev-scale-display">
                    <span class="kardashev-label">KARDASHEV</span>
                    <span class="kardashev-value" id="kardashev-value">K 0.00</span>
                </div>
                <span class="kardashev-type" id="kardashev-type">Pre-Type I</span>
            </div>
            <div class="kardashev-center">
                <div class="kardashev-power-bar">
                    <div class="power-bar-fill" id="power-bar-fill"></div>
                    <div class="power-bar-markers">
                        <span class="marker marker-0">0</span>
                        <span class="marker marker-1">I</span>
                        <span class="marker marker-2">II</span>
                        <span class="marker marker-3">III</span>
                    </div>
                </div>
            </div>
        `;
        this.container.appendChild(bar);

        // Default time speed (1x = 1 week per second)
        this.setTimeSpeed(1);
    }

    /**
     * Set time speed multiplier
     */
    setTimeSpeed(speed) {
        this.timeSpeedMultiplier = speed;
        this.timeSpeed = speed;  // Also update this for compatibility
    }

    /**
     * Calculate stellar mass converted to probes/compute
     * Based on metallicity (heavier elements available for construction)
     * Average star: ~2% metals, ~0.1% usable for construction
     */
    calculateMassConverted() {
        // Solar mass in kg
        const SOLAR_MASS = 1.989e30;

        // Average metallicity (fraction of star mass that's metals)
        // Sun is ~1.4% metals (Z=0.014)
        const AVG_METALLICITY = 0.014;

        // Fraction of metals actually extractable/usable
        // Assumes Dyson sphere + asteroid mining + some stellar lifting
        const EXTRACTION_EFFICIENCY = 0.1;  // 10% of metals are harvested

        // Each colonized dot represents STARS_PER_DOT stars
        // Mass converted scales with: stars × dyson progress × metallicity × efficiency

        let totalMassConverted = 0;

        for (const star of this.colonizedStars) {
            const dysonProg = (star.dysonUnits || 0) / 100;
            // Each dot's mass contribution
            const dotMass = this.STARS_PER_DOT * SOLAR_MASS * AVG_METALLICITY * EXTRACTION_EFFICIENCY * dysonProg;
            totalMassConverted += dotMass;
        }

        // Convert to solar masses for display
        return totalMassConverted / SOLAR_MASS;
    }

    /**
     * Format mass in solar masses
     */
    formatSolarMasses(solarMasses) {
        if (solarMasses >= 1e9) return `${(solarMasses / 1e9).toFixed(2)}B M☉`;
        if (solarMasses >= 1e6) return `${(solarMasses / 1e6).toFixed(2)}M M☉`;
        if (solarMasses >= 1e3) return `${(solarMasses / 1e3).toFixed(2)}k M☉`;
        if (solarMasses >= 1) return `${solarMasses.toFixed(2)} M☉`;
        if (solarMasses >= 0.001) return `${(solarMasses * 1000).toFixed(2)} mM☉`;
        return `${(solarMasses * 1e6).toFixed(2)} μM☉`;
    }

    /**
     * Create the galaxy stats bar - horizontal layout beneath Kardashev scale
     */
    createGalaxyStatsPanel() {
        const bar = document.createElement('div');
        bar.id = 'galaxy-stats-bar';
        bar.className = 'galaxy-stats-bar';
        bar.innerHTML = `
            <div class="galaxy-stat-chip">
                <span class="chip-label">DRIVE</span>
                <span class="chip-value" id="stat-drive-accel">0.1 g</span>
            </div>
            <div class="galaxy-stat-chip">
                <span class="chip-label">FLEETS</span>
                <span class="chip-value" id="stat-fleets-transit">0</span>
            </div>
            <div class="galaxy-stat-chip">
                <span class="chip-label">HOP</span>
                <span class="chip-value" id="stat-hop-distance">10 ly</span>
            </div>
            <div class="galaxy-stat-chip">
                <span class="chip-label">STARS</span>
                <span class="chip-value" id="stat-stars-count">1</span>
            </div>
            <div class="galaxy-stat-chip">
                <span class="chip-label">SECTORS</span>
                <span class="chip-value" id="stat-sectors">1</span>
            </div>
            <div class="galaxy-stat-chip">
                <span class="chip-label">MASS</span>
                <span class="chip-value" id="stat-total-mass">0 M☉</span>
            </div>
            <div class="galaxy-stat-chip">
                <span class="chip-label">POWER</span>
                <span class="chip-value" id="stat-total-power">0 L☉</span>
            </div>
            <div class="galaxy-stat-chip">
                <span class="chip-label">DYSON</span>
                <span class="chip-value" id="stat-dyson-avg">0%</span>
            </div>
        `;
        this.container.appendChild(bar);

        // Create hotkeys bar at bottom center
        const hotkeysBar = document.createElement('div');
        hotkeysBar.id = 'galaxy-hotkeys-bar';
        hotkeysBar.className = 'galaxy-hotkeys-bar';
        hotkeysBar.innerHTML = `
            <span class="hotkey"><kbd>WASD</kbd> Fly</span>
            <span class="hotkey"><kbd>F</kbd> Fleet</span>
            <span class="hotkey"><kbd>H</kbd> Home</span>
            <span class="hotkey"><kbd>O</kbd> Strategy</span>
            <span class="hotkey"><kbd>P</kbd> Debug</span>
            <span class="hotkey"><kbd>L</kbd> Census</span>
            <span class="hotkey"><kbd>K</kbd> Drives</span>
            <span class="hotkey"><kbd>Tab</kbd> Lines</span>
            <span class="hotkey"><kbd>Space</kbd> Colonize</span>
        `;
        this.container.appendChild(hotkeysBar);

        // Create centered scale bar (appears when zooming)
        const scaleBar = document.createElement('div');
        scaleBar.id = 'galaxy-scale-bar';
        scaleBar.className = 'galaxy-scale-bar';
        scaleBar.innerHTML = `
            <div class="scale-bar-line"></div>
            <span class="scale-bar-label" id="scale-bar-label">1 kly</span>
        `;
        this.container.appendChild(scaleBar);

        // Track zoom to show/hide scale bar
        this.lastZoomDistance = null;
        this.scaleBarTimeout = null;

        // Listen for wheel events to detect zooming
        this.renderer.domElement.addEventListener('wheel', () => {
            this.showScaleBarOnZoom();
        });

        // Also update on any controls change for smooth updates
        if (this.controls) {
            this.controls.addEventListener('change', () => {
                if (document.getElementById('galaxy-scale-bar')?.classList.contains('visible')) {
                    this.updateScaleBar();
                }
            });
        }
    }

    /**
     * Create the galactic coordinates display (top right)
     */
    createGalacticCoordinatesDisplay() {
        const coordsDiv = document.createElement('div');
        coordsDiv.id = 'galactic-coordinates';
        coordsDiv.className = 'galactic-coordinates';
        coordsDiv.innerHTML = `
            <div class="coord-label">GALACTIC COORDINATES</div>
            <div class="coord-value">
                <span id="coord-x">X: 0</span> ly<br>
                <span id="coord-y">Y: 0</span> ly<br>
                <span id="coord-z">Z: 0</span> ly
            </div>
        `;
        this.container.appendChild(coordsDiv);
    }

    /**
     * Update galactic coordinates display based on camera target position
     */
    updateGalacticCoordinates() {
        if (!this.controls) return;

        const coordX = document.getElementById('coord-x');
        const coordY = document.getElementById('coord-y');
        const coordZ = document.getElementById('coord-z');

        if (!coordX || !coordY || !coordZ) return;

        // Convert from scene units to light-years (1 unit = 326 ly)
        // Sol is at approximately (50, 0, 50) in scene units
        const solX = this.solPosition?.x || 50;
        const solY = this.solPosition?.y || 0;
        const solZ = this.solPosition?.z || 50;

        const target = this.controls.target;
        const lyPerUnit = 326;

        // Calculate position relative to galactic center (0,0,0)
        const x = Math.round(target.x * lyPerUnit);
        const y = Math.round(target.y * lyPerUnit);
        const z = Math.round(target.z * lyPerUnit);

        // Format with thousands separators
        const formatCoord = (val) => {
            const sign = val >= 0 ? '+' : '';
            return sign + val.toLocaleString();
        };

        coordX.textContent = `X: ${formatCoord(x)}`;
        coordY.textContent = `Y: ${formatCoord(y)}`;
        coordZ.textContent = `Z: ${formatCoord(z)}`;
    }

    /**
     * Show scale bar when zooming, then fade it out
     */
    showScaleBarOnZoom() {
        const scaleBar = document.getElementById('galaxy-scale-bar');
        if (!scaleBar) return;

        // Show the scale bar and update immediately
        scaleBar.classList.add('visible');
        this.updateScaleBar();

        // Clear existing timeout
        if (this.scaleBarTimeout) {
            clearTimeout(this.scaleBarTimeout);
        }

        // Hide after 2 seconds of no zooming
        this.scaleBarTimeout = setTimeout(() => {
            scaleBar.classList.remove('visible');
        }, 2000);
    }

    /**
     * Set up time speed control buttons
     */
    setupSpeedControls() {
        const buttons = document.querySelectorAll('.speed-btn');
        if (!buttons.length) return;

        // Load saved speed from localStorage
        const savedSpeed = localStorage.getItem('galaxyTimeSpeed');
        if (savedSpeed) {
            this.setTimeSpeed(parseInt(savedSpeed));  // Use setTimeSpeed to update both variables
            // Update active button
            buttons.forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.speed) === this.timeSpeedMultiplier);
            });
        }

        // Handle button clicks
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const speed = parseInt(e.target.dataset.speed);
                this.setTimeSpeed(speed);  // Use setTimeSpeed to update both variables
                localStorage.setItem('galaxyTimeSpeed', speed.toString());

                // Update active state
                buttons.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                console.log('[StarMap] Time speed set to:', speed + 'x');
            });
        });
    }

    /**
     * Set up the expansion slider event handlers
     */
    setupExpansionSlider() {
        const slider = document.getElementById('expansion-slider');
        if (!slider) return;

        // Load saved value from localStorage
        const saved = localStorage.getItem('expansionAllocation');
        if (saved) {
            const value = parseInt(saved);
            slider.value = value;
            this.expansionAllocation = value;
            this.updateExpansionDisplay(value);
        }

        // Handle slider input
        slider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.expansionAllocation = value;
            this.updateExpansionDisplay(value);
            localStorage.setItem('expansionAllocation', value.toString());
        });
    }

    /**
     * Update the expansion slider display values
     */
    updateExpansionDisplay(value) {
        const dysonPercent = document.getElementById('dyson-percent');
        const expandPercent = document.getElementById('expand-percent');

        if (dysonPercent) dysonPercent.textContent = `${100 - value}%`;
        if (expandPercent) expandPercent.textContent = `${value}%`;
    }

    /**
     * Update the galaxy stats panel with current values
     */
    updateGalaxyStatsDisplay() {
        // Calculate values based on influence radius
        const radiusLy = this.influenceRadius * 326;  // Convert units to light years
        const radiusParsecs = this.influenceRadius * 100;

        // Estimate stars in range (very rough: ~0.14 stars per cubic parsec in solar neighborhood)
        const volume = (4/3) * Math.PI * Math.pow(radiusParsecs, 3);
        const starsInRange = Math.floor(volume * 0.14);

        // Distance to galactic center from Sol
        const distanceToCenter = 27200;  // ly (8.35 kpc)

        // Galactic coverage (galaxy radius ~50,000 ly)
        const galaxyRadius = 50000;
        const coverage = (radiusLy / galaxyRadius) * 100;

        // Update display
        const influenceEl = document.getElementById('stat-influence-radius');
        const starsEl = document.getElementById('stat-stars-in-range');
        const distanceEl = document.getElementById('stat-distance-center');
        const coverageEl = document.getElementById('stat-coverage');

        if (influenceEl) {
            if (radiusLy < 1000) {
                influenceEl.textContent = `${radiusLy.toFixed(0)} ly`;
            } else {
                influenceEl.textContent = `${(radiusLy / 1000).toFixed(2)} kly`;
            }
        }

        if (starsEl) {
            starsEl.textContent = this.formatStarCount(starsInRange);
        }

        if (distanceEl) {
            distanceEl.textContent = `${(distanceToCenter / 1000).toFixed(1)} kly`;
        }

        if (coverageEl) {
            if (coverage < 0.01) {
                coverageEl.textContent = `${(coverage * 10000).toFixed(2)} ppm`;
            } else if (coverage < 1) {
                coverageEl.textContent = `${coverage.toFixed(4)}%`;
            } else {
                coverageEl.textContent = `${coverage.toFixed(2)}%`;
            }
        }
    }

    /**
     * Format star count for display
     */
    formatStarCount(count) {
        if (count >= 1e9) return `~${(count / 1e9).toFixed(1)} billion`;
        if (count >= 1e6) return `~${(count / 1e6).toFixed(1)} million`;
        if (count >= 1e3) return `~${(count / 1e3).toFixed(1)} thousand`;
        return `~${count}`;
    }

    /**
     * Calculate Kardashev scale from power in watts
     * Calibrated to our galaxy's actual luminosity based on spectral distribution
     *
     * K = 0: 10^6 W (1 MW - minimal civilization)
     * K = 1: ~10^13.4 W (Type I - planetary, ~Earth's solar input)
     * K = 2: ~10^26.9 W (Type II - stellar, ~1 Sun)
     * K = 3: GALAXY_TOTAL_POWER (~1e37 W - full galaxy based on star population)
     */
    calculateKardashevScale(powerWatts) {
        if (powerWatts <= 0) return { scale: 0, type: 'Pre-Type I', progress: 0 };

        // Use pre-calculated galaxy power from spectral distribution
        const LOG_GALAXY = Math.log10(this.GALAXY_TOTAL_POWER); // ~37.0
        const LOG_BASE = 6; // 10^6 W = K0

        // Scale so K3 = full galaxy power
        const logPower = Math.log10(powerWatts);
        const scale = (logPower - LOG_BASE) * 3 / (LOG_GALAXY - LOG_BASE);

        let type;
        if (scale < 1) {
            type = 'Pre-Type I';
        } else if (scale < 2) {
            type = 'Type I';
        } else if (scale < 3) {
            type = 'Type II';
        } else {
            type = 'Type III';
        }

        // Progress bar: spans K 0 to K 3
        const progress = Math.min(scale / 3, 1);

        return { scale, type, progress };
    }

    /**
     * Solar luminosity in watts (L☉)
     */
    static SOLAR_LUMINOSITY_WATTS = 3.828e26;

    /**
     * Calculate total power from all Dyson spheres across colonized systems
     * A complete Dyson sphere captures all energy output of the star/cloud
     */
    calculateTotalDysonPower() {
        if (!this.starData) return 0;

        let totalPower = 0;

        // Get current system's Dyson progress
        const gameState = window.gameEngine?.getGameState?.();
        const currentDysonProgress = gameState?.dyson_sphere?.progress || 0;

        // Find current system (Sol by default)
        const currentSystemId = this.galaxySystem?.activeSystemId || 'sol';

        // Helper to calculate power for a stellar object
        const calculateObjectPower = (obj) => {
            let dysonProgress = 0;

            if (obj.id === currentSystemId) {
                // Current system - use game state
                dysonProgress = currentDysonProgress;
            } else if (this.galaxySystem?.isColonized?.(obj.id)) {
                // Other colonized systems - check their Dyson progress
                const systemState = this.galaxySystem?.getSystemState?.(obj.id);
                dysonProgress = systemState?.dyson_sphere?.progress || 0;
            }

            if (dysonProgress > 0) {
                // Power = luminosity_solar × L☉ × dyson_progress
                return obj.luminosity_solar * StarMapVisualization.SOLAR_LUMINOSITY_WATTS * dysonProgress;
            }
            return 0;
        };

        // Calculate power from stars
        if (this.starData.stars) {
            for (const star of this.starData.stars) {
                totalPower += calculateObjectPower(star);
            }
        }

        // Calculate power from dust clouds
        if (this.starData.dust_clouds) {
            for (const cloud of this.starData.dust_clouds) {
                totalPower += calculateObjectPower(cloud);
            }
        }

        return totalPower;
    }

    /**
     * Update the Kardashev resource bar with colonization metrics
     */
    updateKardashevBar() {
        if (!this.isActive) return;

        // Get game state
        const gameState = window.gameEngine?.getGameState?.();
        const derived = gameState?.derived || {};
        const totals = derived.totals || {};

        // Get Sol's Dyson progress from game state
        const solDysonProgress = gameState?.dyson_sphere?.progress || 0;

        // Get base power from current system (non-Dyson sources)
        const basePower = totals.power_produced || 1e6;  // Minimum 1 MW civilization

        // Calculate total Dyson power across ALL colonized stars
        // Each colonized dot = 1 star system for Kardashev purposes
        // (not STARS_PER_DOT - that's for galaxy visualization scale, not power calc)
        const SOLAR_LUMINOSITY = 3.828e26;  // Watts
        let totalDysonPower = 0;

        // Calculate power from each colonized star system
        // Each system contributes: luminosity × dyson completion percentage
        for (const star of this.colonizedStars) {
            const dysonPercent = (star.dysonUnits || 0) / 100;
            // Use spectral class to determine luminosity, default to 1 L☉ for G-type
            const starLuminosity = this.getSpectralLuminosity(star.spectralClass || 'G');
            totalDysonPower += starLuminosity * SOLAR_LUMINOSITY * dysonPercent;
        }

        // Total civilization power
        const totalPower = basePower + totalDysonPower;

        // Calculate Kardashev scale from total power
        const { scale, type, progress } = this.calculateKardashevScale(totalPower);

        // Calculate Dyson conversion rate (% of stars with COMPLETE Dysons)
        const dysonRate = this.dotsColonized > 0
            ? ((this.dotsWithDyson / this.dotsColonized) * 100).toFixed(0)
            : 0;

        // Calculate average Dyson progress across all colonized stars
        let avgDysonProgress = 0;
        if (this.colonizedStars.length > 0) {
            const totalProgress = this.colonizedStars.reduce((sum, s) =>
                sum + (s.dysonUnits || 0), 0);
            avgDysonProgress = totalProgress / this.colonizedStars.length;
        }

        // Calculate mass converted to compute
        const massConverted = this.calculateMassConverted();

        // Update display
        const valueEl = document.getElementById('kardashev-value');
        const typeEl = document.getElementById('kardashev-type');
        const powerBarEl = document.getElementById('power-bar-fill');

        if (valueEl) {
            valueEl.textContent = `K ${scale.toFixed(2)}`;
            valueEl.title = `K ${scale.toFixed(10)}`;
        }
        if (typeEl) typeEl.textContent = type;

        // Non-linear bar fill: 0→1 = 5%, 1→2 = 10%, 2→3 = 85% of bar width
        // This makes the 2→3 range (galactic era) dominate the visual
        let barPercent = 0;
        if (scale < 1) {
            // 0 to 1: maps to 0-5% of bar
            barPercent = scale * 5;
        } else if (scale < 2) {
            // 1 to 2: maps to 5-15% of bar
            barPercent = 5 + (scale - 1) * 10;
        } else {
            // 2 to 3: maps to 15-100% of bar
            barPercent = 15 + (scale - 2) * 85;
        }
        if (powerBarEl) powerBarEl.style.width = `${Math.min(barPercent, 100)}%`;
    }

    /**
     * Get luminosity in solar luminosities for a spectral class
     * Based on main sequence averages
     */
    getSpectralLuminosity(spectralClass) {
        const luminosities = {
            O: 30000,   // O-type: 30,000 L☉ (blue giants)
            B: 1000,    // B-type: 1,000 L☉ (blue-white)
            A: 20,      // A-type: 20 L☉ (white)
            F: 3,       // F-type: 3 L☉ (yellow-white)
            G: 1,       // G-type: 1 L☉ (Sun-like)
            K: 0.4,     // K-type: 0.4 L☉ (orange)
            M: 0.04,    // M-type: 0.04 L☉ (red dwarfs)
            D: 0.001,   // White dwarf: 0.001 L☉ (small but hot)
            N: 100      // Nebula: Contains young stars, high luminosity
        };
        return luminosities[spectralClass] || 1;
    }

    /**
     * Format power value with appropriate unit
     */
    formatPower(watts) {
        if (watts >= 1e36) return `${(watts / 1e36).toFixed(2)} TW×10²⁴`;
        if (watts >= 1e33) return `${(watts / 1e33).toFixed(2)} QW`;
        if (watts >= 1e30) return `${(watts / 1e30).toFixed(2)} RW`;
        if (watts >= 1e27) return `${(watts / 1e27).toFixed(2)} YW`;
        if (watts >= 1e24) return `${(watts / 1e24).toFixed(2)} ZW`;
        if (watts >= 1e21) return `${(watts / 1e21).toFixed(2)} EW`;
        if (watts >= 1e18) return `${(watts / 1e18).toFixed(2)} PW`;
        if (watts >= 1e15) return `${(watts / 1e15).toFixed(2)} TW`;
        if (watts >= 1e12) return `${(watts / 1e12).toFixed(2)} GW`;
        if (watts >= 1e9) return `${(watts / 1e9).toFixed(2)} MW`;
        if (watts >= 1e6) return `${(watts / 1e6).toFixed(2)} kW`;
        return `${watts.toFixed(2)} W`;
    }

    /**
     * Format power in solar luminosity units (L☉)
     * Solar luminosity = 3.828 × 10^26 W
     */
    formatPowerSolar(watts) {
        const SOLAR_LUMINOSITY = 3.828e26;
        const solarLum = watts / SOLAR_LUMINOSITY;

        if (solarLum >= 1e12) return `${(solarLum / 1e12).toFixed(2)}T L☉`;
        if (solarLum >= 1e9) return `${(solarLum / 1e9).toFixed(2)}B L☉`;
        if (solarLum >= 1e6) return `${(solarLum / 1e6).toFixed(2)}M L☉`;
        if (solarLum >= 1e3) return `${(solarLum / 1e3).toFixed(2)}k L☉`;
        if (solarLum >= 1) return `${solarLum.toFixed(2)} L☉`;
        if (solarLum >= 0.001) return `${(solarLum * 1000).toFixed(2)} mL☉`;
        if (solarLum >= 1e-6) return `${(solarLum * 1e6).toFixed(2)} μL☉`;
        return `${(solarLum * 1e9).toFixed(2)} nL☉`;
    }

    /**
     * Format large numbers
     */
    formatNumber(value) {
        if (value >= 1e24) return `${(value / 1e24).toFixed(2)}Y`;
        if (value >= 1e21) return `${(value / 1e21).toFixed(2)}Z`;
        if (value >= 1e18) return `${(value / 1e18).toFixed(2)}E`;
        if (value >= 1e15) return `${(value / 1e15).toFixed(2)}P`;
        if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
        if (value >= 1e9) return `${(value / 1e9).toFixed(2)}G`;
        if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
        if (value >= 1e3) return `${(value / 1e3).toFixed(2)}k`;
        return value.toFixed(0);
    }

    /**
     * Update galaxy stats and sphere of influence
     * Based on game state (probes, Dyson progress, etc.)
     */
    updateGalaxyStats() {
        const gameState = window.gameEngine?.getGameState?.();
        if (!gameState) return;

        const derived = gameState.derived || {};
        const totals = derived.totals || {};
        const dysonProgress = gameState.dyson_sphere?.progress || 0;

        // Sphere of influence grows based on:
        // 1. Dyson progress (primary driver of interstellar capability)
        // 2. Total probes (population/industrial capacity)
        // 3. Research level

        // Calculate influence radius in units (1 unit = 100 parsecs = 326 ly)
        // Start at Sol's neighborhood (~0.5 unit = 50 parsecs = 163 ly)
        // Max could be galactic scale (150 units = 15 kpc = 48,900 ly)

        let baseInfluence = 0.5;  // Local neighborhood

        // Dyson sphere completion dramatically increases influence
        if (dysonProgress > 0) {
            // Each 10% Dyson adds ~1 unit of influence radius
            baseInfluence += dysonProgress * 10;
        }

        // Probe count adds logarithmic influence
        const probes = totals.total_probes || 0;
        if (probes > 1e6) {
            // Each order of magnitude above 1M adds ~0.5 units
            baseInfluence += Math.max(0, (Math.log10(probes) - 6) * 0.5);
        }

        // Cap at reasonable galactic scale
        const maxInfluence = 50;  // 5 kpc - significant galactic presence
        const newRadius = Math.min(baseInfluence, maxInfluence);

        // Smoothly animate the sphere growth
        if (Math.abs(this.influenceRadius - newRadius) > 0.01) {
            this.influenceRadius += (newRadius - this.influenceRadius) * 0.05;
            this.updateSphereOfInfluence(this.influenceRadius);
        }

        // Update the stats display
        this.updateGalaxyStatsDisplay();

        // Update probe activity indicator if panel is visible
        if (this.strategyPanel && this.strategyPanel.style.display !== 'none') {
            this.updateProbeActivityIndicator();
        }
    }

    /**
     * Update the scale bar based on current camera zoom level
     * Scale: 1 unit = 100 pc = ~326 ly, so 10 units = 1 kpc
     * The bar is fixed at 100px width, and we calculate what distance it represents
     */
    updateScaleBar() {
        const labelEl = document.getElementById('scale-bar-label');
        if (!labelEl || !this.camera || !this.controls) return;

        // Get camera distance from target (zoom level)
        const cameraDistance = this.camera.position.distanceTo(this.controls.target);

        // Screen width corresponds to roughly 2x camera distance in world units at typical FOV
        // 100px bar width, screen is ~1000px, so bar is 10% of view
        // View width in world units ≈ cameraDistance * 2 * tan(FOV/2) ≈ cameraDistance * 1.15 (at 60° FOV)
        // 10% of that is the bar's world units
        const viewWidth = cameraDistance * 1.15;
        const barWorldUnits = viewWidth * 0.1;  // 100px / ~1000px screen

        // Convert units to light years: 1 unit = 100 pc = 326 ly
        const barLightYears = barWorldUnits * 326;

        // Choose a nice round number and format label
        let displayValue, displayUnit;

        if (barLightYears >= 50000) {
            // Round to nearest 10 kly
            displayValue = Math.round(barLightYears / 10000) * 10;
            displayUnit = 'kly';
        } else if (barLightYears >= 5000) {
            // Round to nearest kly
            displayValue = Math.round(barLightYears / 1000);
            displayUnit = 'kly';
        } else if (barLightYears >= 500) {
            // Round to nearest 100 ly
            displayValue = Math.round(barLightYears / 100) * 100;
            displayUnit = 'ly';
        } else if (barLightYears >= 50) {
            // Round to nearest 10 ly
            displayValue = Math.round(barLightYears / 10) * 10;
            displayUnit = 'ly';
        } else {
            // Round to nearest ly
            displayValue = Math.round(barLightYears);
            displayUnit = 'ly';
        }

        // Avoid 0
        if (displayValue === 0) displayValue = 1;

        labelEl.textContent = `${displayValue} ${displayUnit}`;
    }

    /**
     * Initialize strategy panels (EVA-styled)
     */
    initStrategyPanels() {
        // Safety check - ensure container exists and is a valid DOM element
        if (!this.container || !this.container.appendChild) {
            console.warn('[StarMap] initStrategyPanels called but container not valid');
            return;
        }

        // Create panel containers if they don't exist
        if (!this.panelContainers.drive) {
            const driveContainer = document.createElement('div');
            driveContainer.id = 'drive-panel-container';
            driveContainer.style.display = 'none';
            this.container.appendChild(driveContainer);
            this.panelContainers.drive = driveContainer;
        }

        if (!this.panelContainers.census) {
            const censusContainer = document.createElement('div');
            censusContainer.id = 'census-panel-container';
            censusContainer.style.display = 'none';
            this.container.appendChild(censusContainer);
            this.panelContainers.census = censusContainer;
        }

        // Policy panel (P key) - expansion slider info and stats
        if (!this.panelContainers.policy) {
            const policyContainer = document.createElement('div');
            policyContainer.id = 'policy-panel-container';
            policyContainer.className = 'strategy-panel';
            policyContainer.style.display = 'none';
            policyContainer.innerHTML = this.createPolicyPanelHTML();
            this.container.appendChild(policyContainer);
            this.panelContainers.policy = policyContainer;
        }

        // Research panel (R key) - tech/research overview
        if (!this.panelContainers.research) {
            const researchContainer = document.createElement('div');
            researchContainer.id = 'research-panel-container';
            researchContainer.className = 'strategy-panel';
            researchContainer.style.display = 'none';
            researchContainer.innerHTML = this.createResearchPanelHTML();
            this.container.appendChild(researchContainer);
            this.panelContainers.research = researchContainer;
        }

        // Initialize panels if classes are available
        if (typeof DriveResearchPanel !== 'undefined' && !this.driveResearchPanel) {
            this.driveResearchPanel = new DriveResearchPanel(this.panelContainers.drive);
            console.log('[StarMap] Drive Research Panel initialized');
        }

        if (typeof StellarCensusPanel !== 'undefined' && !this.stellarCensusPanel) {
            this.stellarCensusPanel = new StellarCensusPanel(this.panelContainers.census);
            console.log('[StarMap] Stellar Census Panel initialized');
        }
    }

    /**
     * Create Policy Panel HTML content
     */
    createPolicyPanelHTML() {
        return `
            <div class="eva-panel policy-panel">
                <div class="eva-panel-header">
                    <span class="eva-panel-title">EXPANSION POLICY</span>
                    <span class="eva-panel-hint">P to close</span>
                </div>
                <div class="eva-panel-content">
                    <div class="policy-section">
                        <div class="policy-label">Resource Allocation</div>
                        <div class="policy-description">
                            Control how newly developed star systems allocate their infrastructure.
                        </div>
                    </div>
                    <div class="policy-section">
                        <div class="policy-stat">
                            <span class="stat-label">Dyson Units</span>
                            <span class="stat-value dyson-color" id="policy-dyson-total">0</span>
                        </div>
                        <div class="policy-stat">
                            <span class="stat-label">Production Units</span>
                            <span class="stat-value production-color" id="policy-production-total">0</span>
                        </div>
                    </div>
                    <div class="policy-info">
                        <p><strong>Dyson</strong>: Power generation for energy output</p>
                        <p><strong>Production</strong>: Probe manufacturing for expansion</p>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Create Research Panel HTML content
     */
    createResearchPanelHTML() {
        return `
            <div class="eva-panel research-panel">
                <div class="eva-panel-header">
                    <span class="eva-panel-title">RESEARCH</span>
                    <span class="eva-panel-hint">R to close</span>
                </div>
                <div class="eva-panel-content">
                    <div class="research-section">
                        <div class="research-label">Current Research</div>
                        <div class="research-item">
                            <span class="research-name">Drive Technology</span>
                            <span class="research-tier" id="research-drive-tier">Tier 1</span>
                        </div>
                    </div>
                    <div class="research-section">
                        <div class="research-label">Compute Accumulated</div>
                        <div class="research-value" id="research-compute">0 FLOP</div>
                    </div>
                    <div class="research-info">
                        <p>Press <strong>D</strong> for detailed Drive Research</p>
                        <p>Press <strong>C</strong> for Stellar Census</p>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Create Strategy Panel (left-side, hierarchical sliders)
     */
    createStrategyPanel() {
        if (this.strategyPanel) return;  // Already exists

        const panel = document.createElement('div');
        panel.id = 'strategy-panel';
        panel.className = 'strategy-panel-left';
        panel.innerHTML = `
            <div class="strategy-panel-header">
                <span class="strategy-title">STRATEGY</span>
                <button class="strategy-close" id="strategy-close-btn">×</button>
            </div>
            <div class="strategy-panel-content">
                <div class="strategy-section main-slider">
                    <div class="slider-row">
                        <span class="slider-label left">BUILD</span>
                        <input type="range" id="build-expand-slider" min="0" max="100" value="${this.buildExpandBalance}" class="strategy-slider build-expand">
                        <span class="slider-label right">EXPAND</span>
                    </div>
                    <div class="slider-values">
                        <span id="build-percent">${100 - this.buildExpandBalance}%</span>
                        <span id="expand-percent">${this.buildExpandBalance}%</span>
                    </div>
                </div>

                <div class="strategy-subsection" id="build-options">
                    <div class="subsection-header">BUILD OPTIONS</div>
                    <div class="slider-row small">
                        <span class="slider-label left">DYSON</span>
                        <input type="range" id="build-policy-slider" min="0" max="100" value="${this.buildPolicy}" class="strategy-slider dyson-prod">
                        <span class="slider-label right">PRODUCTION</span>
                    </div>
                    <div class="slider-desc">Power ← → Manufacturing</div>
                </div>

                <div class="strategy-subsection" id="expand-options">
                    <div class="subsection-header">EXPAND OPTIONS</div>
                    <div class="slider-row small">
                        <span class="slider-label left">EXPLOIT</span>
                        <input type="range" id="expand-policy-slider" min="0" max="100" value="${this.expandPolicy}" class="strategy-slider exploit-explore">
                        <span class="slider-label right">EXPLORE</span>
                    </div>
                    <div class="slider-desc">Consolidate (Dyson) ← → Expand (Prod)</div>
                    <div class="slider-row small" style="margin-top: 8px;">
                        <span class="slider-label left">LOCAL</span>
                        <input type="range" id="hop-distance-slider" min="0" max="100" value="${this.hopDistancePolicy}" class="strategy-slider hop-distance">
                        <span class="slider-label right">FAR</span>
                    </div>
                    <div class="slider-desc">
                        Avg hop: <span id="hop-distance-display">${this.getAverageHopDistanceDisplay()}</span> ly
                    </div>
                </div>

                <div class="strategy-stats">
                    <div class="stat-row highlight">
                        <span class="stat-label">Total Assets</span>
                        <span class="stat-value solar-mass" id="strat-total-mass">0 M☉</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Systems Colonized</span>
                        <span class="stat-value expand" id="strat-stars">0</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Dyson Mass</span>
                        <span class="stat-value dyson" id="strat-dyson-units">0 M☉</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Production Mass</span>
                        <span class="stat-value production" id="strat-prod-units">0 M☉</span>
                    </div>
                </div>

                <div class="probe-activity">
                    <div class="probe-activity-header">
                        <span class="probe-activity-label">Launch Rate</span>
                        <span class="probe-activity-count" id="probe-launch-rate">0/yr</span>
                    </div>
                    <div class="stat-row small">
                        <span class="stat-label">λ (Poisson rate)</span>
                        <span class="stat-value" id="probe-lambda">0.000</span>
                    </div>
                    <div class="probe-eta">
                        <div class="probe-eta-label">Expected Next Launch</div>
                        <div class="probe-eta-bar">
                            <div class="probe-eta-fill" id="probe-eta-fill" style="width: 0%"></div>
                        </div>
                        <div class="probe-eta-time" id="probe-eta-time">--</div>
                    </div>
                    <div class="probe-activity-header" style="margin-top: 12px;">
                        <span class="probe-activity-label">Active Probes</span>
                        <span class="probe-activity-count" id="probe-fleet-count">0</span>
                    </div>
                    <div class="probe-activity-bar">
                        <div class="probe-activity-fill" id="probe-activity-fill" style="width: 0%"></div>
                    </div>
                </div>

                <div class="empire-stats">
                    <div class="empire-stats-header">Empire Overview</div>
                    <div class="stat-row">
                        <span class="stat-label">Frontier Radius</span>
                        <span class="stat-value frontier" id="strat-frontier-radius">0 ly</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">POAs Colonized</span>
                        <span class="stat-value poa" id="strat-poas-colonized">0 / 0</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Production Bonus</span>
                        <span class="stat-value bonus" id="strat-prod-bonus">+0%</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Dyson Efficiency</span>
                        <span class="stat-value bonus" id="strat-dyson-bonus">+0%</span>
                    </div>
                </div>

                <div class="metrics-graph-section">
                    <div class="metrics-graph-header">
                        <span>Metrics</span>
                        <select id="metrics-graph-selector" class="metrics-selector">
                            <option value="colonizedCount">Colonies</option>
                            <option value="frontierRadius">Frontier</option>
                            <option value="productionTotal">Production</option>
                            <option value="dysonTotal">Dyson</option>
                            <option value="launchRate">Launch Rate</option>
                            <option value="poaCount">POAs</option>
                        </select>
                    </div>
                    <canvas id="metrics-graph-canvas" width="240" height="80"></canvas>
                </div>
            </div>
        `;
        panel.style.display = 'none';
        this.container.appendChild(panel);
        this.strategyPanel = panel;

        // Set up event listeners
        this.setupStrategyPanelListeners();
    }

    /**
     * Set up strategy panel event listeners
     */
    setupStrategyPanelListeners() {
        // Close button
        const closeBtn = document.getElementById('strategy-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.toggleStrategyPanel());
        }

        // Build/Expand slider
        const buildExpandSlider = document.getElementById('build-expand-slider');
        if (buildExpandSlider) {
            buildExpandSlider.addEventListener('input', (e) => {
                this.buildExpandBalance = parseInt(e.target.value);
                this.updateStrategyDisplays();
                this.saveStrategySettings();
            });
        }

        // Build policy slider (Dyson/Production)
        const buildPolicySlider = document.getElementById('build-policy-slider');
        if (buildPolicySlider) {
            buildPolicySlider.addEventListener('input', (e) => {
                this.buildPolicy = parseInt(e.target.value);
                this.updateStrategyDisplays();
                this.saveStrategySettings();
            });
        }

        // Expand policy slider (Exploit/Explore - development priority)
        const expandPolicySlider = document.getElementById('expand-policy-slider');
        if (expandPolicySlider) {
            expandPolicySlider.addEventListener('input', (e) => {
                this.expandPolicy = parseInt(e.target.value);
                this.updateStrategyDisplays();
                this.saveStrategySettings();
            });
        }

        // Hop distance slider (Local/Far)
        const hopDistanceSlider = document.getElementById('hop-distance-slider');
        if (hopDistanceSlider) {
            hopDistanceSlider.addEventListener('input', (e) => {
                this.hopDistancePolicy = parseInt(e.target.value);
                this.updateStrategyDisplays();
                this.saveStrategySettings();
            });
        }

        // Metrics graph selector
        const metricsSelector = document.getElementById('metrics-graph-selector');
        if (metricsSelector) {
            metricsSelector.addEventListener('change', () => {
                this.updateMetricsGraphs();
            });
        }

        // Create development histogram bar
        this.createDevelopmentHistogramBar();
    }

    /**
     * Create the development histogram bar (centered at bottom when strategy open)
     */
    createDevelopmentHistogramBar() {
        if (this.developmentHistogramBar) return;

        const bar = document.createElement('div');
        bar.id = 'development-histogram-bar';
        bar.className = 'development-histogram-bar';
        bar.innerHTML = `
            <div class="histogram-title">SYSTEM DEVELOPMENT</div>
            <div class="histogram-container">
                <div class="histogram-bars-row" id="dev-histogram-bars">
                    ${[...Array(10)].map((_, i) => `
                        <div class="dev-histogram-bar" data-bucket="${i}">
                            <div class="bar-fill" id="dev-bar-${i}"></div>
                            <div class="bar-label">${i * 10}-${i === 9 ? '100' : (i + 1) * 10}%</div>
                        </div>
                    `).join('')}
                </div>
                <div class="histogram-legend">
                    <span class="legend-item"><span class="legend-color undeveloped"></span>Undeveloped</span>
                    <span class="legend-item"><span class="legend-color developing"></span>Developing</span>
                    <span class="legend-item"><span class="legend-color complete"></span>Complete</span>
                </div>
            </div>
        `;
        bar.style.display = 'none';  // Hidden by default
        this.container.appendChild(bar);
        this.developmentHistogramBar = bar;
    }

    /**
     * Update the development histogram display
     */
    updateDevelopmentHistogramDisplay() {
        if (!this.developmentHistogramBar) {
            console.log('[StarMap] Histogram: No bar element');
            return;
        }

        const buckets = this.getDysonHistogram();
        const maxCount = Math.max(1, ...buckets);
        const maxBarHeight = 100;  // Max height in pixels (fits in 110px bar container)

        // Debug: log on first few updates
        if (!this._histDisplayCount) this._histDisplayCount = 0;
        this._histDisplayCount++;
        if (this._histDisplayCount <= 5) {
            console.log('[StarMap] Histogram display update:',
                '\n  buckets:', buckets.join(', '),
                '\n  maxCount:', maxCount,
                '\n  colonizedStars:', this.colonizedStars.length,
                '\n  Sol units:', this.colonizedStars[0]?.dysonUnits, '+', this.colonizedStars[0]?.productionUnits);
        }

        let foundElements = 0;
        for (let i = 0; i < 10; i++) {
            const barEl = document.getElementById(`dev-bar-${i}`);
            if (barEl) {
                foundElements++;
                // Height based on count - empty buckets show no bar
                const heightPx = buckets[i] > 0 ? Math.max(4, (buckets[i] / maxCount) * maxBarHeight) : 0;
                barEl.style.height = `${heightPx}px`;

                // Debug: log bucket 9 (90-100%) since that's where Sol should be
                if (i === 9 && this._histDisplayCount <= 5) {
                    console.log('[StarMap] Bucket 9 (90-100%): count=', buckets[i], 'height=', heightPx + 'px',
                        'element:', barEl, 'computedHeight:', window.getComputedStyle(barEl).height);
                }

                // Color based on development level
                if (i < 3) {
                    barEl.style.backgroundColor = '#ff6644';  // Undeveloped (red-orange)
                } else if (i < 7) {
                    barEl.style.backgroundColor = '#ffaa00';  // Developing (orange-yellow)
                } else {
                    barEl.style.backgroundColor = '#00ff88';  // Complete (green)
                }

                // Add count tooltip - last bucket is 90-100% inclusive
                const rangeEnd = i === 9 ? '100' : `${(i + 1) * 10}`;
                barEl.title = `${buckets[i]} stars at ${i * 10}-${rangeEnd}% development`;
            }
        }

        // Debug: verify elements were found
        if (this._histDisplayCount <= 5) {
            console.log('[StarMap] Histogram: found', foundElements, '/10 bar elements');
        }
    }

    /**
     * Create the Hertzsprung-Russell diagram panel (right side)
     */
    createHRDiagramPanel() {
        if (this.hrPanel) return;

        // Initialize star type targeting preferences (all enabled by default)
        if (!this.starTypeTargets) {
            this.starTypeTargets = {
                O: true,   // Blue giants - rare, massive
                B: true,   // Blue-white - hot, luminous
                A: true,   // White - bright
                F: true,   // Yellow-white - Sun-like
                G: true,   // Yellow - Sun-like (our sun)
                K: true,   // Orange - common, stable
                M: false,   // Red dwarfs - most common, off by default
                giants: true,      // Red/orange giants
                supergiants: false, // Too unstable for colonization
                whiteDwarfs: false  // Too small, dying stars
            };
        }

        const panel = document.createElement('div');
        panel.id = 'hr-diagram-panel';
        panel.className = 'hr-panel-right';
        panel.innerHTML = `
            <div class="hr-panel-header">
                <span class="hr-title">H-R DIAGRAM</span>
                <span class="hr-subtitle">Target Selection</span>
            </div>
            <div class="hr-panel-content">
                <div class="hr-diagram-container">
                    <svg id="hr-diagram-svg" viewBox="0 0 300 220" class="hr-diagram-svg">
                        <!-- Axes -->
                        <line x1="40" y1="10" x2="40" y2="180" stroke="rgba(100,150,255,0.3)" stroke-width="1"/>
                        <line x1="40" y1="180" x2="290" y2="180" stroke="rgba(100,150,255,0.3)" stroke-width="1"/>

                        <!-- Y-axis labels (Luminosity) -->
                        <text x="8" y="20" fill="rgba(255,255,255,0.5)" font-size="8">10⁶</text>
                        <text x="8" y="55" fill="rgba(255,255,255,0.5)" font-size="8">10⁴</text>
                        <text x="8" y="90" fill="rgba(255,255,255,0.5)" font-size="8">10²</text>
                        <text x="8" y="125" fill="rgba(255,255,255,0.5)" font-size="8">1 L☉</text>
                        <text x="8" y="160" fill="rgba(255,255,255,0.5)" font-size="8">10⁻²</text>
                        <text x="3" y="100" fill="rgba(150,200,255,0.6)" font-size="7" transform="rotate(-90, 10, 100)">LUMINOSITY</text>

                        <!-- X-axis labels (Temperature/Spectral Type) -->
                        <text x="55" y="195" fill="#9bb0ff" font-size="9" font-weight="bold">O</text>
                        <text x="90" y="195" fill="#aabfff" font-size="9" font-weight="bold">B</text>
                        <text x="125" y="195" fill="#cad7ff" font-size="9" font-weight="bold">A</text>
                        <text x="155" y="195" fill="#f8f7ff" font-size="9" font-weight="bold">F</text>
                        <text x="185" y="195" fill="#fff4ea" font-size="9" font-weight="bold">G</text>
                        <text x="215" y="195" fill="#ffd2a1" font-size="9" font-weight="bold">K</text>
                        <text x="250" y="195" fill="#ffb56c" font-size="9" font-weight="bold">M</text>
                        <text x="155" y="210" fill="rgba(150,200,255,0.6)" font-size="7">SPECTRAL TYPE ← TEMPERATURE</text>

                        <!-- Supergiants region (top) -->
                        <path d="M 50 20 Q 100 25, 150 30 Q 200 35, 260 50"
                              stroke="rgba(255,100,100,0.4)" stroke-width="12" fill="none"
                              class="hr-region" data-region="supergiants"/>

                        <!-- Giants region -->
                        <path d="M 160 60 Q 200 70, 230 85 Q 250 95, 270 110"
                              stroke="rgba(255,180,100,0.4)" stroke-width="14" fill="none"
                              class="hr-region" data-region="giants"/>

                        <!-- Main sequence (diagonal band) -->
                        <path d="M 50 40 Q 80 55, 110 75 Q 140 95, 165 115 Q 190 135, 220 155 Q 250 168, 275 175"
                              stroke="rgba(100,200,255,0.5)" stroke-width="16" fill="none"
                              class="hr-region main-sequence"/>

                        <!-- White dwarfs region (bottom left) -->
                        <ellipse cx="80" cy="165" rx="25" ry="10"
                                 fill="rgba(200,200,255,0.3)" stroke="rgba(200,200,255,0.4)"
                                 class="hr-region" data-region="whiteDwarfs"/>

                        <!-- Sun marker -->
                        <circle cx="185" cy="125" r="5" fill="#fff4ea" stroke="#ffd700" stroke-width="1.5"/>
                        <text x="192" y="122" fill="#ffd700" font-size="7">☉</text>

                        <!-- Star type dots on main sequence -->
                        <circle cx="55" cy="42" r="6" fill="#9bb0ff" class="hr-star-type" data-type="O"/>
                        <circle cx="90" cy="60" r="6" fill="#aabfff" class="hr-star-type" data-type="B"/>
                        <circle cx="120" cy="80" r="5" fill="#cad7ff" class="hr-star-type" data-type="A"/>
                        <circle cx="150" cy="100" r="5" fill="#f8f7ff" class="hr-star-type" data-type="F"/>
                        <circle cx="185" cy="125" r="5" fill="#fff4ea" class="hr-star-type" data-type="G"/>
                        <circle cx="220" cy="150" r="5" fill="#ffd2a1" class="hr-star-type" data-type="K"/>
                        <circle cx="260" cy="170" r="5" fill="#ffb56c" class="hr-star-type" data-type="M"/>

                        <!-- Region labels -->
                        <text x="100" y="18" fill="rgba(255,100,100,0.7)" font-size="7" font-style="italic">Supergiants</text>
                        <text x="230" y="75" fill="rgba(255,180,100,0.7)" font-size="7" font-style="italic">Giants</text>
                        <text x="130" y="145" fill="rgba(100,200,255,0.7)" font-size="7" font-style="italic">Main Sequence</text>
                        <text x="55" y="178" fill="rgba(200,200,255,0.7)" font-size="6" font-style="italic">White Dwarfs</text>
                    </svg>
                </div>

                <div class="hr-target-controls">
                    <div class="hr-section-header">Main Sequence Targets</div>
                    <div class="hr-target-grid">
                        ${['O', 'B', 'A', 'F', 'G', 'K', 'M'].map(type => `
                            <label class="hr-target-toggle" data-type="${type}">
                                <input type="checkbox" ${this.starTypeTargets[type] ? 'checked' : ''} class="hr-checkbox" data-star-type="${type}">
                                <span class="hr-type-label" style="color: ${this.getSpectralColor(type)}">${type}</span>
                                <span class="hr-type-desc">${this.getSpectralDesc(type)}</span>
                            </label>
                        `).join('')}
                    </div>

                    <div class="hr-section-header">Special Regions</div>
                    <div class="hr-special-targets">
                        <label class="hr-target-toggle wide">
                            <input type="checkbox" ${this.starTypeTargets.giants ? 'checked' : ''} class="hr-checkbox" data-star-type="giants">
                            <span class="hr-type-label" style="color: #ffd2a1">Giants</span>
                            <span class="hr-type-desc">Evolved, resource-rich</span>
                        </label>
                        <label class="hr-target-toggle wide">
                            <input type="checkbox" ${this.starTypeTargets.supergiants ? 'checked' : ''} class="hr-checkbox" data-star-type="supergiants">
                            <span class="hr-type-label" style="color: #ff6666">Supergiants</span>
                            <span class="hr-type-desc">Unstable, short-lived</span>
                        </label>
                        <label class="hr-target-toggle wide">
                            <input type="checkbox" ${this.starTypeTargets.whiteDwarfs ? 'checked' : ''} class="hr-checkbox" data-star-type="whiteDwarfs">
                            <span class="hr-type-label" style="color: #aaaaff">White Dwarfs</span>
                            <span class="hr-type-desc">Dying, exotic matter</span>
                        </label>
                    </div>
                </div>

                <div class="hr-stats">
                    <div class="hr-stat-row">
                        <span>Target Coverage</span>
                        <span id="hr-target-coverage">100%</span>
                    </div>
                    <div class="hr-stat-row">
                        <span>Avg Star Mass</span>
                        <span id="hr-avg-mass">1.0 M☉</span>
                    </div>
                    <div class="hr-stat-row">
                        <span>Habitable Zone Chance</span>
                        <span id="hr-habitable">42%</span>
                    </div>
                </div>

                <div class="colonization-histogram">
                    <div class="histogram-header">Stars Colonized by Type</div>
                    <div class="histogram-bars" id="colonization-histogram-bars">
                        <div class="histogram-row">
                            <span class="histogram-label" style="color: #9bb0ff">O</span>
                            <div class="histogram-bar-bg"><div class="histogram-bar" id="hist-bar-O" style="width: 0%"></div></div>
                            <span class="histogram-count" id="hist-count-O">0</span>
                        </div>
                        <div class="histogram-row">
                            <span class="histogram-label" style="color: #aabfff">B</span>
                            <div class="histogram-bar-bg"><div class="histogram-bar" id="hist-bar-B" style="width: 0%"></div></div>
                            <span class="histogram-count" id="hist-count-B">0</span>
                        </div>
                        <div class="histogram-row">
                            <span class="histogram-label" style="color: #cad7ff">A</span>
                            <div class="histogram-bar-bg"><div class="histogram-bar" id="hist-bar-A" style="width: 0%"></div></div>
                            <span class="histogram-count" id="hist-count-A">0</span>
                        </div>
                        <div class="histogram-row">
                            <span class="histogram-label" style="color: #f8f7ff">F</span>
                            <div class="histogram-bar-bg"><div class="histogram-bar" id="hist-bar-F" style="width: 0%"></div></div>
                            <span class="histogram-count" id="hist-count-F">0</span>
                        </div>
                        <div class="histogram-row">
                            <span class="histogram-label" style="color: #fff4ea">G</span>
                            <div class="histogram-bar-bg"><div class="histogram-bar" id="hist-bar-G" style="width: 0%"></div></div>
                            <span class="histogram-count" id="hist-count-G">0</span>
                        </div>
                        <div class="histogram-row">
                            <span class="histogram-label" style="color: #ffd2a1">K</span>
                            <div class="histogram-bar-bg"><div class="histogram-bar" id="hist-bar-K" style="width: 0%"></div></div>
                            <span class="histogram-count" id="hist-count-K">0</span>
                        </div>
                        <div class="histogram-row">
                            <span class="histogram-label" style="color: #ffb56c">M</span>
                            <div class="histogram-bar-bg"><div class="histogram-bar" id="hist-bar-M" style="width: 0%"></div></div>
                            <span class="histogram-count" id="hist-count-M">0</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        panel.style.display = 'none';
        this.container.appendChild(panel);
        this.hrPanel = panel;

        // Set up event listeners
        this.setupHRPanelListeners();
    }

    /**
     * Get spectral type color
     */
    getSpectralColor(type) {
        const colors = {
            O: '#9bb0ff', B: '#aabfff', A: '#cad7ff', F: '#f8f7ff',
            G: '#fff4ea', K: '#ffd2a1', M: '#ffb56c'
        };
        return colors[type] || '#ffffff';
    }

    /**
     * Get a random spectral type based on realistic stellar population distribution
     * 76.6% M (red dwarfs), 12.1% K, 7.6% G, 3% F, 0.6% A, 0.13% B, 0.0003% O
     */
    getRandomSpectralType() {
        const r = Math.random();
        for (const entry of this.spectralCDF) {
            if (r <= entry.cumulative) {
                return entry.type;
            }
        }
        return 'M';  // Default to most common
    }

    /**
     * Get spectral type description
     */
    getSpectralDesc(type) {
        const descs = {
            O: 'Blue, 30k K+',
            B: 'Blue-white, 10-30k K',
            A: 'White, 7.5-10k K',
            F: 'Yellow-white, 6-7.5k K',
            G: 'Yellow (Sun), 5-6k K',
            K: 'Orange, 3.5-5k K',
            M: 'Red dwarf, <3.5k K'
        };
        return descs[type] || '';
    }

    /**
     * Set up HR panel event listeners
     */
    setupHRPanelListeners() {
        const checkboxes = document.querySelectorAll('.hr-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const starType = e.target.dataset.starType;
                this.starTypeTargets[starType] = e.target.checked;
                this.updateHRDiagramDisplay();
                this.saveStrategySettings();
            });
        });
    }

    /**
     * Update HR diagram visual state
     */
    updateHRDiagramDisplay() {
        // Update checkmark visual states
        const checkboxes = document.querySelectorAll('.hr-checkbox');
        checkboxes.forEach(checkbox => {
            const type = checkbox.dataset.starType;
            checkbox.checked = this.starTypeTargets[type];
        });

        // Calculate target coverage (weighted by star frequency)
        // M stars are most common (~76%), then K (~12%), G (~7.5%), etc.
        const weights = { O: 0.00003, B: 0.13, A: 0.6, F: 3, G: 7.5, K: 12, M: 76, giants: 0.5, supergiants: 0.01, whiteDwarfs: 0.4 };
        let coverage = 0;
        for (const [type, enabled] of Object.entries(this.starTypeTargets)) {
            if (enabled && weights[type]) coverage += weights[type];
        }
        const coverageEl = document.getElementById('hr-target-coverage');
        if (coverageEl) coverageEl.textContent = `${coverage.toFixed(1)}%`;

        // Calculate average target mass
        const masses = { O: 40, B: 8, A: 2.5, F: 1.3, G: 1.0, K: 0.7, M: 0.3, giants: 2, supergiants: 20, whiteDwarfs: 0.6 };
        let totalMass = 0, totalWeight = 0;
        for (const [type, enabled] of Object.entries(this.starTypeTargets)) {
            if (enabled && weights[type] && masses[type]) {
                totalMass += masses[type] * weights[type];
                totalWeight += weights[type];
            }
        }
        const avgMass = totalWeight > 0 ? totalMass / totalWeight : 0;
        const massEl = document.getElementById('hr-avg-mass');
        if (massEl) massEl.textContent = `${avgMass.toFixed(2)} M☉`;

        // Calculate habitable zone probability
        // F, G, K stars have good habitable zones
        const habWeights = { F: 3, G: 7.5, K: 12 };
        let habCoverage = 0;
        for (const [type, enabled] of Object.entries(this.starTypeTargets)) {
            if (enabled && habWeights[type]) habCoverage += habWeights[type];
        }
        const habPct = coverage > 0 ? (habCoverage / coverage) * 100 : 0;
        const habEl = document.getElementById('hr-habitable');
        if (habEl) habEl.textContent = `${habPct.toFixed(0)}%`;

        // Visual feedback on SVG
        const svgTypes = document.querySelectorAll('.hr-star-type');
        svgTypes.forEach(circle => {
            const type = circle.dataset.type;
            if (this.starTypeTargets[type]) {
                circle.setAttribute('opacity', '1');
                circle.setAttribute('stroke', '#00ff88');
                circle.setAttribute('stroke-width', '2');
            } else {
                circle.setAttribute('opacity', '0.3');
                circle.removeAttribute('stroke');
            }
        });
    }

    /**
     * Update strategy panel displays
     */
    updateStrategyDisplays() {
        // Validate Sol's units on first call (fix corrupted saves)
        if (this.colonizedStars && this.colonizedStars.length > 0 && !this._solValidated) {
            const sol = this.colonizedStars[0];
            const solTotal = (sol.dysonUnits || 0) + (sol.productionUnits || 0);
            // Fix if Sol's units are wrong (should be 100 total, with production > 0)
            if (solTotal !== 100 || (sol.productionUnits || 0) === 0) {
                console.log('[StarMap] Fixing Sol units - was:', sol.dysonUnits, '/', sol.productionUnits);
                sol.dysonUnits = 50;
                sol.productionUnits = 50;
                console.log('[StarMap] Fixed Sol to 50/50 split');
            }
            this._solValidated = true;
        }

        // Main balance
        const buildPct = document.getElementById('build-percent');
        const expandPct = document.getElementById('expand-percent');
        if (buildPct) buildPct.textContent = `${100 - this.buildExpandBalance}%`;
        if (expandPct) expandPct.textContent = `${this.buildExpandBalance}%`;

        // Update legacy expansionAllocation for backward compatibility
        // This combines build/expand balance with build policy
        const buildFraction = (100 - this.buildExpandBalance) / 100;
        const productionFraction = this.buildPolicy / 100;
        // Production units come from build allocation AND production policy
        this.expansionAllocation = Math.round(this.buildExpandBalance + (buildFraction * productionFraction * 50));

        // Stats
        const totals = this.getTotalStarUnits();
        const dysonEl = document.getElementById('strat-dyson-units');
        const prodEl = document.getElementById('strat-prod-units');
        const starsEl = document.getElementById('strat-stars');
        const totalMassEl = document.getElementById('strat-total-mass');

        // Calculate solar masses (100 units = 1 solar mass)
        const totalSolarMasses = totals.total / 100;
        const dysonSolarMasses = totals.dyson / 100;
        const prodSolarMasses = totals.production / 100;

        // Format solar mass display
        const formatMass = (mass) => {
            if (mass < 1000) {
                return `${mass.toFixed(1)} M☉`;
            } else if (mass < 1000000) {
                return `${(mass / 1000).toFixed(2)}k M☉`;
            } else {
                return `${(mass / 1000000).toFixed(2)}M M☉`;
            }
        };

        if (totalMassEl) totalMassEl.textContent = formatMass(totalSolarMasses);
        if (dysonEl) dysonEl.textContent = formatMass(dysonSolarMasses);
        if (prodEl) prodEl.textContent = formatMass(prodSolarMasses);
        if (starsEl) starsEl.textContent = this.colonizedStars.length.toLocaleString();

        // Update hop distance display
        const hopDistEl = document.getElementById('hop-distance-display');
        if (hopDistEl) hopDistEl.textContent = this.getAverageHopDistanceDisplay();

        // Update probe activity indicator
        this.updateProbeActivityIndicator();

        // Update development histogram
        this.updateDevelopmentHistogram();
        this.updateDevelopmentHistogramDisplay();
    }

    /**
     * Update the empire stats in the strategy panel
     */
    updateDevelopmentHistogram() {
        if (!this.strategyPanel || this.strategyPanel.style.display === 'none') return;

        // Update frontier radius
        const frontierEl = document.getElementById('strat-frontier-radius');
        if (frontierEl) {
            const radiusUnits = this.explorationRadius || 0;
            const radiusLY = Math.round(radiusUnits * 326);  // 1 unit ≈ 326 ly
            if (radiusLY < 1000) {
                frontierEl.textContent = `${radiusLY} ly`;
            } else {
                frontierEl.textContent = `${(radiusLY / 1000).toFixed(1)} kly`;
            }
        }

        // Update POA stats
        const poaEl = document.getElementById('strat-poas-colonized');
        if (poaEl) {
            const colonized = this.pointsOfAttraction.filter(p => p.colonized).length;
            const total = this.pointsOfAttraction.length;
            poaEl.textContent = `${colonized} / ${total}`;
        }

        // Update empire bonuses
        const prodBonusEl = document.getElementById('strat-prod-bonus');
        if (prodBonusEl) {
            const bonus = Math.round((this.empireBonuses.production - 1) * 100);
            prodBonusEl.textContent = bonus > 0 ? `+${bonus}%` : `${bonus}%`;
        }

        const dysonBonusEl = document.getElementById('strat-dyson-bonus');
        if (dysonBonusEl) {
            const bonus = Math.round((this.empireBonuses.dyson_efficiency - 1) * 100);
            dysonBonusEl.textContent = bonus > 0 ? `+${bonus}%` : `${bonus}%`;
        }

        // Update star type distribution
        this.updateStarTypeDistribution();
    }

    /**
     * Update the star type distribution bars
     */
    updateStarTypeDistribution() {
        // Count colonized stars by spectral type (simulated based on position)
        const typeCounts = { O: 0, B: 0, A: 0, F: 0, G: 0, K: 0, M: 0 };
        const total = this.colonizedStars.length;

        // Simulate spectral type distribution based on realistic ratios
        // M: 76%, K: 12%, G: 7.5%, F: 3%, A: 0.6%, B: 0.13%, O: 0.00003%
        for (const star of this.colonizedStars) {
            // Use position hash for consistent "random" type assignment
            const hash = Math.abs(star.position.x * 1000 + star.position.z * 100) % 1000;
            if (hash < 760) typeCounts.M++;
            else if (hash < 880) typeCounts.K++;
            else if (hash < 955) typeCounts.G++;
            else if (hash < 985) typeCounts.F++;
            else if (hash < 991) typeCounts.A++;
            else if (hash < 999) typeCounts.B++;
            else typeCounts.O++;
        }

        // Update bars
        const maxCount = Math.max(1, ...Object.values(typeCounts));
        const typeColors = {
            O: '#9bb0ff', B: '#aabfff', A: '#cad7ff',
            F: '#f8f7ff', G: '#fff4ea', K: '#ffd2a1', M: '#ffcc6f'
        };

        for (const type of Object.keys(typeCounts)) {
            const barEl = document.getElementById(`hist-bar-${type}`);
            const countEl = document.getElementById(`hist-count-${type}`);

            if (barEl) {
                const widthPercent = (typeCounts[type] / maxCount) * 100;
                barEl.style.width = `${widthPercent}%`;
                barEl.style.backgroundColor = typeColors[type];
            }

            if (countEl) {
                countEl.textContent = typeCounts[type];
            }
        }
    }

    /**
     * Update metrics history for time-series graphs
     * Called periodically during expansion simulation
     */
    updateMetricsHistory() {
        // Only update at intervals
        if (this.time - this.lastMetricsUpdate < this.metricsUpdateInterval) return;
        this.lastMetricsUpdate = this.time;

        // Calculate current metrics
        const colonizedCount = this.colonizedStars.length;
        const frontierRadius = this.explorationRadius || 0;

        let productionTotal = 0;
        let dysonTotal = 0;
        for (const star of this.colonizedStars) {
            productionTotal += star.productionUnits || 0;
            dysonTotal += star.dysonUnits || 0;
        }

        const poaCount = this.pointsOfAttraction.filter(p => p.colonized).length;

        // Calculate launch rate (probes per interval)
        const launchRate = this._probeLaunchCount || 0;
        this._probeLaunchCount = 0;  // Reset counter

        // Add to history
        this.metricsHistory.timestamps.push(this.time);
        this.metricsHistory.colonizedCount.push(colonizedCount);
        this.metricsHistory.frontierRadius.push(frontierRadius);
        this.metricsHistory.productionTotal.push(productionTotal);
        this.metricsHistory.dysonTotal.push(dysonTotal);
        this.metricsHistory.launchRate.push(launchRate);
        this.metricsHistory.poaCount.push(poaCount);

        // Trim to max length
        if (this.metricsHistory.timestamps.length > this.maxHistoryLength) {
            for (const key of Object.keys(this.metricsHistory)) {
                this.metricsHistory[key].shift();
            }
        }

        // Update graph display
        this.updateMetricsGraphs();
    }

    /**
     * Track probe launches for metrics
     */
    recordProbeLaunchCount() {
        // Old method - just increment counter (renamed to avoid duplicate)
        this._probeLaunchCount = (this._probeLaunchCount || 0) + 1;
    }

    /**
     * Update the metrics graphs in the strategy panel
     */
    updateMetricsGraphs() {
        const canvas = document.getElementById('metrics-graph-canvas');
        if (!canvas || this.metricsHistory.timestamps.length < 2) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.fillStyle = 'rgba(0, 10, 20, 0.9)';
        ctx.fillRect(0, 0, width, height);

        // Get selected metric from dropdown
        const selector = document.getElementById('metrics-graph-selector');
        const selectedMetric = selector?.value || 'colonizedCount';

        // Draw graph based on selection
        const data = this.metricsHistory[selectedMetric];
        if (!data || data.length < 2) return;

        // Find data range
        const minVal = Math.min(...data);
        const maxVal = Math.max(...data);
        const range = maxVal - minVal || 1;

        // Graph colors by metric
        const colors = {
            colonizedCount: '#00ff88',
            frontierRadius: '#00aaff',
            productionTotal: '#ffaa00',
            dysonTotal: '#ff6600',
            launchRate: '#00ffff',
            poaCount: '#ff00ff'
        };
        const color = colors[selectedMetric] || '#00ff88';

        // Draw grid lines
        ctx.strokeStyle = 'rgba(100, 150, 255, 0.1)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Draw data line
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        const padding = 5;
        const graphWidth = width - padding * 2;
        const graphHeight = height - padding * 2;

        for (let i = 0; i < data.length; i++) {
            const x = padding + (i / (data.length - 1)) * graphWidth;
            const y = height - padding - ((data[i] - minVal) / range) * graphHeight;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        // Draw current value
        ctx.fillStyle = color;
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        const currentVal = data[data.length - 1];
        const displayVal = currentVal > 1000 ?
            `${(currentVal / 1000).toFixed(1)}k` :
            currentVal.toFixed(0);
        ctx.fillText(displayVal, width - 5, 12);

        // Draw label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.textAlign = 'left';
        const labels = {
            colonizedCount: 'Colonies',
            frontierRadius: 'Frontier',
            productionTotal: 'Production',
            dysonTotal: 'Dyson',
            launchRate: 'Launch Rate',
            poaCount: 'POAs'
        };
        ctx.fillText(labels[selectedMetric] || selectedMetric, 5, 12);
    }

    /**
     * Update the probe activity indicator in the strategy panel
     */
    updateProbeActivityIndicator() {
        const fleetCount = this.probeFleets?.length || 0;
        const maxFleets = 20;
        const activityPercent = Math.min(100, (fleetCount / maxFleets) * 100);

        // Update fleet count
        const countEl = document.getElementById('probe-fleet-count');
        if (countEl) {
            countEl.textContent = fleetCount.toString();
        }

        // Update activity bar
        const fillEl = document.getElementById('probe-activity-fill');
        if (fillEl) {
            fillEl.style.width = `${activityPercent}%`;
        }

        // Calculate Poisson rate (λ) - sum of all individual launch probabilities
        const { lambda, productionSystems } = this.calculateLaunchRate();


        // Update lambda display
        const lambdaEl = document.getElementById('probe-lambda');
        if (lambdaEl) {
            lambdaEl.textContent = lambda.toFixed(4) + '/tick';
        }

        // Calculate launches per year (λ per tick * ticks per day * 365 days)
        // At 60fps with timeMultiplier, each frame advances ~0.016 * 380 * timeSpeed days
        const ticksPerDay = 1 / (this.daysPerFrame * (this.timeSpeed || 1));
        const launchesPerYear = lambda * ticksPerDay * 365;

        const rateEl = document.getElementById('probe-launch-rate');
        if (rateEl) {
            if (launchesPerYear < 1) {
                rateEl.textContent = (launchesPerYear * 365).toFixed(1) + '/century';
            } else if (launchesPerYear < 100) {
                rateEl.textContent = launchesPerYear.toFixed(1) + '/yr';
            } else {
                rateEl.textContent = (launchesPerYear / 1000).toFixed(1) + 'k/yr';
            }
        }

        // Expected time to next launch: E[T] = 1/λ ticks
        // Convert to game time
        const expectedTicks = lambda > 0 ? 1 / lambda : Infinity;
        const expectedDays = expectedTicks * this.daysPerFrame * (this.timeSpeed || 1);

        const etaTimeEl = document.getElementById('probe-eta-time');
        if (etaTimeEl) {
            if (lambda === 0) {
                etaTimeEl.textContent = 'No production capability';
            } else if (expectedDays < 1) {
                etaTimeEl.textContent = `~${(expectedDays * 24).toFixed(1)} hours`;
            } else if (expectedDays < 365) {
                etaTimeEl.textContent = `~${expectedDays.toFixed(0)} days`;
            } else {
                etaTimeEl.textContent = `~${(expectedDays / 365).toFixed(1)} years`;
            }
        }

        // Animate ETA bar - progress toward expected launch
        // Use time since last launch vs expected interval
        const etaFillEl = document.getElementById('probe-eta-fill');
        if (etaFillEl && lambda > 0) {
            // Track time since any launch occurred
            if (!this._lastLaunchTime) this._lastLaunchTime = this.time;
            const timeSinceLaunch = this.time - this._lastLaunchTime;
            const progress = Math.min(100, (timeSinceLaunch / expectedDays) * 100);
            etaFillEl.style.width = `${progress}%`;
        }
    }

    /**
     * Calculate combined Poisson launch rate (λ) across all production systems
     * Includes both production-based and Dyson-powered launches
     */
    calculateLaunchRate() {
        const baseLaunchProbability = 0.006;
        const dysonLaunchProbability = 0.003;
        const cooldownTime = 30;
        const expansionRate = Math.max(0.2, this.buildExpandBalance / 100);
        const speedMultiplier = (this.timeSpeedMultiplier || 1);

        // Empire bonuses
        const productionBonus = this.empireBonuses?.production || 1.0;
        const launchBonus = 1 / (this.empireBonuses?.launch_efficiency || 1.0);

        let lambda = 0;
        let productionSystems = 0;

        for (const star of this.colonizedStars) {
            const productionUnits = star.productionUnits || 0;
            const dysonUnits = star.dysonUnits || 0;
            const totalUnits = productionUnits + dysonUnits;

            if (totalUnits < 10) continue;

            productionSystems++;

            const timeSinceLastLaunch = this.time - (star.lastLaunchTime || 0);
            const readiness = 1 - Math.exp(-timeSinceLastLaunch / cooldownTime);

            // Production-based rate
            let prob = 0;
            if (productionUnits > 0) {
                prob = baseLaunchProbability * (productionUnits / 100) * productionBonus;
            }

            // Dyson-powered rate
            if (dysonUnits >= 50) {
                prob += dysonLaunchProbability * (dysonUnits / 100) * launchBonus;
            }

            prob *= readiness * speedMultiplier * expansionRate;
            lambda += prob;
        }

        return { lambda, productionSystems };
    }

    /**
     * Record a probe launch for ETA tracking and metrics
     */
    recordProbeLaunch() {
        // Increment launch counter for metrics
        this._probeLaunchCount = (this._probeLaunchCount || 0) + 1;
        this._lastLaunchTime = this.time;
        // Trigger visual pulse on ETA bar
        const etaFillEl = document.getElementById('probe-eta-fill');
        if (etaFillEl) {
            etaFillEl.classList.add('launching');
            setTimeout(() => etaFillEl.classList.remove('launching'), 300);
        }
    }

    /**
     * Save strategy settings to localStorage
     */
    saveStrategySettings() {
        localStorage.setItem('strategySettings', JSON.stringify({
            buildExpandBalance: this.buildExpandBalance,
            buildPolicy: this.buildPolicy,
            expandPolicy: this.expandPolicy,
            hopDistancePolicy: this.hopDistancePolicy,
            starTypeTargets: this.starTypeTargets
        }));
    }

    /**
     * Load strategy settings from localStorage
     */
    loadStrategySettings() {
        // Initialize defaults first
        if (!this.starTypeTargets) {
            this.starTypeTargets = {
                O: true, B: true, A: true, F: true, G: true, K: true, M: false,  // M-class (red dwarfs) off by default
                giants: true, supergiants: false, whiteDwarfs: false
            };
        }

        try {
            const saved = localStorage.getItem('strategySettings');
            if (saved) {
                const settings = JSON.parse(saved);
                this.buildExpandBalance = settings.buildExpandBalance ?? 65;
                this.buildPolicy = settings.buildPolicy ?? 50;
                this.expandPolicy = settings.expandPolicy ?? 50;
                this.hopDistancePolicy = settings.hopDistancePolicy ?? 58;
                if (settings.starTypeTargets) {
                    this.starTypeTargets = { ...this.starTypeTargets, ...settings.starTypeTargets };
                }
            }
        } catch (e) {
            console.warn('Failed to load strategy settings:', e);
        }
    }

    /**
     * Toggle strategy panel visibility
     */
    toggleStrategyPanel() {
        if (!this.strategyPanel) {
            this.createStrategyPanel();
        }
        if (!this.hrPanel) {
            this.createHRDiagramPanel();
        }

        this.strategyPanelVisible = !this.strategyPanelVisible;
        this.strategyPanel.style.display = this.strategyPanelVisible ? 'block' : 'none';
        this.hrPanel.style.display = this.strategyPanelVisible ? 'block' : 'none';

        // Show/hide development histogram bar
        if (this.developmentHistogramBar) {
            this.developmentHistogramBar.style.display = this.strategyPanelVisible ? 'flex' : 'none';
            console.log('[StarMap] Histogram bar display:', this.developmentHistogramBar.style.display,
                'parent container visible:', this.container?.style?.display);
        } else {
            console.log('[StarMap] Warning: developmentHistogramBar is null when toggling strategy panel');
        }

        if (this.strategyPanelVisible) {
            this.updateStrategyDisplays();
            this.updateHRDiagramDisplay();
            this.updateDevelopmentHistogramDisplay();
        }

        console.log('[StarMap] Strategy panel:', this.strategyPanelVisible ? 'opened' : 'closed');
    }

    /**
     * Toggle a strategy panel
     * @param {string} panelId - 'drive-research', 'stellar-census', 'strategy', 'policy', or 'research'
     */
    togglePanel(panelId) {
        // Map panel IDs to their DOM element IDs
        const panelDomIds = {
            'drive-research': 'drive-research-panel',
            'stellar-census': 'stellar-census-panel',
            'strategy': 'strategy-panel',
            'policy': 'policy-panel',
            'research': 'research-panel'
        };

        // Get DOM element for this panel
        const domId = panelDomIds[panelId] || panelId;
        const panelElement = document.getElementById(domId);

        // Also check legacy panelContainers
        const legacyPanel = this.panelContainers[panelId];

        // Hide all known panels first
        Object.values(panelDomIds).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        Object.values(this.panelContainers).forEach(container => {
            if (container) container.style.display = 'none';
        });

        // If same panel was active, just close it
        if (this.activePanelId === panelId) {
            this.activePanelId = null;
            console.log('[StarMap] Closed panel:', panelId);
            return;
        }

        // Show the requested panel
        if (panelElement) {
            panelElement.style.display = 'block';
            this.activePanelId = panelId;
            console.log('[StarMap] Opened panel:', panelId, 'element:', domId);
        } else if (legacyPanel) {
            legacyPanel.style.display = 'block';
            this.activePanelId = panelId;
            console.log('[StarMap] Opened legacy panel:', panelId);
        } else {
            console.warn('[StarMap] Panel not found:', panelId);
        }

        // Update panel content when opening
        if (panelId === 'policy') {
            this.updatePolicyPanel();
        } else if (panelId === 'research') {
            this.updateResearchPanel();
        }
    }

    /**
     * Update Policy panel with current stats
     */
    updatePolicyPanel() {
        const totals = this.getTotalStarUnits();
        const dysonEl = document.getElementById('policy-dyson-total');
        const prodEl = document.getElementById('policy-production-total');

        if (dysonEl) dysonEl.textContent = Math.round(totals.dyson).toLocaleString();
        if (prodEl) prodEl.textContent = Math.round(totals.production).toLocaleString();
    }

    /**
     * Update Research panel with current stats
     */
    updateResearchPanel() {
        const tierEl = document.getElementById('research-drive-tier');
        const computeEl = document.getElementById('research-compute');

        if (tierEl) {
            const tier = this.getDriveResearchTier();
            tierEl.textContent = `Tier ${tier}`;
        }

        if (computeEl) {
            const gameState = window.gameEngine?.getGameState?.();
            const compute = gameState?.computeAccumulated || 0;
            computeEl.textContent = this.formatCompute(compute);
        }
    }

    /**
     * Format compute value for display
     */
    formatCompute(value) {
        if (value >= 1e36) return `${(value / 1e36).toFixed(1)}×10³⁶ FLOP`;
        if (value >= 1e33) return `${(value / 1e33).toFixed(1)}×10³³ FLOP`;
        if (value >= 1e30) return `${(value / 1e30).toFixed(1)}×10³⁰ FLOP`;
        if (value >= 1e27) return `${(value / 1e27).toFixed(1)}×10²⁷ FLOP`;
        if (value >= 1e24) return `${(value / 1e24).toFixed(1)}×10²⁴ FLOP`;
        if (value >= 1e21) return `${(value / 1e21).toFixed(1)}×10²¹ FLOP`;
        if (value >= 1e18) return `${(value / 1e18).toFixed(1)}×10¹⁸ FLOP`;
        if (value >= 1e15) return `${(value / 1e15).toFixed(1)}×10¹⁵ FLOP`;
        if (value >= 1e12) return `${(value / 1e12).toFixed(1)}×10¹² FLOP`;
        return `${value.toFixed(0)} FLOP`;
    }

    /**
     * Update strategy panels with current game state
     * @param {Object} gameState - Current game state
     */
    updatePanels(gameState) {
        if (this.driveResearchPanel && gameState) {
            // Update drive research panel with compute stats
            this.driveResearchPanel.update({
                currentTier: gameState.driveTier || 1,
                computeAccumulated: gameState.computeAccumulated || 0,
                computeRate: gameState.computeRate || 0
            });
        }

        if (this.stellarCensusPanel && gameState) {
            // Update census panel with colonization stats
            const censusData = this.calculateCensusData();
            this.stellarCensusPanel.update({
                censusData: censusData,
                totalStats: {
                    totalSystems: this.GALAXY_TOTAL_STARS,
                    colonizedSystems: this.starsInfluenced,
                    dysonSpheres: this.starsWithDyson,
                    totalPower: gameState.totalPower || (this.starsWithDyson * this.AVG_STAR_LUMINOSITY * 3.828e26),
                    totalProbes: gameState.totalProbes || 1e15,
                    computeRate: gameState.computeRate || 1e12
                }
            });
        }
    }

    /**
     * Calculate census data from colonized stars
     */
    calculateCensusData() {
        // Default distribution matching realistic galactic proportions
        const baseDistribution = {
            O: { total: Math.round(this.GALAXY_TOTAL_STARS * 0.00003), colonized: 0, dyson: 0 },
            B: { total: Math.round(this.GALAXY_TOTAL_STARS * 0.001), colonized: 0, dyson: 0 },
            A: { total: Math.round(this.GALAXY_TOTAL_STARS * 0.006), colonized: 0, dyson: 0 },
            F: { total: Math.round(this.GALAXY_TOTAL_STARS * 0.03), colonized: 0, dyson: 0 },
            G: { total: Math.round(this.GALAXY_TOTAL_STARS * 0.08), colonized: 1, dyson: 0 }, // Sol
            K: { total: Math.round(this.GALAXY_TOTAL_STARS * 0.12), colonized: 0, dyson: 0 },
            M: { total: Math.round(this.GALAXY_TOTAL_STARS * 0.76), colonized: 0, dyson: 0 }
        };

        // Distribute colonized stars proportionally by spectral type
        // Assuming expansion follows natural star distribution
        if (this.starsInfluenced > 1) {
            const colonizedCount = this.starsInfluenced - 1; // Minus Sol
            baseDistribution.M.colonized += Math.round(colonizedCount * 0.76);
            baseDistribution.K.colonized += Math.round(colonizedCount * 0.12);
            baseDistribution.G.colonized += Math.round(colonizedCount * 0.08);
            baseDistribution.F.colonized += Math.round(colonizedCount * 0.03);
            baseDistribution.A.colonized += Math.round(colonizedCount * 0.006);
            baseDistribution.B.colonized += Math.round(colonizedCount * 0.001);
            baseDistribution.O.colonized += Math.round(colonizedCount * 0.00003);
        }

        // Distribute Dyson spheres similarly
        if (this.starsWithDyson > 0) {
            baseDistribution.M.dyson += Math.round(this.starsWithDyson * 0.76);
            baseDistribution.K.dyson += Math.round(this.starsWithDyson * 0.12);
            baseDistribution.G.dyson += Math.round(this.starsWithDyson * 0.08);
            baseDistribution.F.dyson += Math.round(this.starsWithDyson * 0.03);
            baseDistribution.A.dyson += Math.round(this.starsWithDyson * 0.006);
            baseDistribution.B.dyson += Math.round(this.starsWithDyson * 0.001);
            baseDistribution.O.dyson += Math.round(this.starsWithDyson * 0.00003);
        }

        return baseDistribution;
    }

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

    /**
     * Focus camera on Sol system - hotkey "1"
     * Smoothly animates camera to Sol's position
     */
    focusOnSol() {
        if (!this.isActive || !this.solMesh || !this.controls) return;

        // Use simple camera system - go to Sol and follow it
        this.goToSol();
        console.log('[StarMap] Focused on Sol');
    }

    /**
     * Toggle fleet view mode - follow a probe fleet
     */
    toggleFleetView() {
        if (this.fleetViewMode) {
            this.exitFleetView();
        } else {
            this.enterFleetView();
        }
    }

    /**
     * Enter fleet view mode - track the first available fleet
     */
    enterFleetView() {
        if (this.probeFleets.length === 0) {
            console.log('[StarMap] No fleets in transit to track');
            return;
        }

        this.fleetViewMode = true;
        this.trackedFleetIndex = 0;
        this.trackedFleet = this.probeFleets[0];
        this.lastArrivedStar = null;

        // Show fleet view indicator
        this.showFleetViewIndicator();

        console.log('[StarMap] Fleet view active - tracking fleet', this.trackedFleetIndex + 1, 'of', this.probeFleets.length);
    }

    /**
     * Exit fleet view mode
     */
    exitFleetView() {
        this.fleetViewMode = false;
        this.trackedFleet = null;

        // Hide fleet view indicator
        this.hideFleetViewIndicator();

        console.log('[StarMap] Fleet view exited');
    }

    /**
     * Get the current camera zoom distance (distance from camera to target)
     */
    getCameraZoomDistance() {
        if (!this.camera || !this.controls) return 15;  // Default fallback
        return this.camera.position.distanceTo(this.controls.target);
    }

    /**
     * SIMPLE CAMERA SYSTEM
     *
     * Follow a mesh (like solMesh) and maintain offset as galaxy rotates.
     * No complex state, no locks, just follow the target.
     */

    /**
     * Set camera to follow a specific mesh
     * @param {THREE.Object3D} mesh - The mesh to follow
     * @param {number} zoom - Distance from target (optional)
     */
    followMesh(mesh, zoom = null) {
        if (!mesh) return;

        this.followTarget = mesh;

        // Store current camera offset direction if we have one
        if (this.camera && this.controls) {
            const offset = this.camera.position.clone().sub(this.controls.target);
            if (offset.length() > 0.1) {
                offset.normalize();
                if (zoom !== null) {
                    offset.multiplyScalar(zoom);
                } else {
                    offset.multiplyScalar(this.getCameraZoomDistance());
                }
                this.cameraOffset = offset;
            }
        }

        console.log('[Camera] Now following:', mesh.name || 'mesh');
    }

    /**
     * Animate camera to a world position
     * @param {THREE.Vector3} worldPos - Target position in world coordinates
     * @param {number} zoom - Distance from target (optional, keeps current if null)
     */
    goToPosition(worldPos, zoom = null) {
        if (!this.camera || !this.controls) return;
        if (this.cameraAnimating) return;

        // Exit fleet view if active
        if (this.fleetViewMode) {
            this.exitFleetView();
        }

        // Stop following any mesh
        this.followTarget = null;

        const finalZoom = zoom !== null ? zoom : this.getCameraZoomDistance();

        // Keep camera in same direction relative to target
        let direction = this.camera.position.clone().sub(this.controls.target);
        if (direction.length() < 0.1) {
            direction = new THREE.Vector3(0, 3, 10);
        }
        direction.normalize().multiplyScalar(finalZoom);

        const targetCamPos = worldPos.clone().add(direction);

        // Animate
        this.cameraAnimating = true;
        const startPos = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        let t = 0;

        const animate = () => {
            t += 0.05;
            if (t >= 1) {
                this.camera.position.copy(targetCamPos);
                this.controls.target.copy(worldPos);
                this.controls.update();
                this.cameraAnimating = false;
                return;
            }

            const ease = 1 - Math.pow(1 - t, 3);
            this.camera.position.lerpVectors(startPos, targetCamPos, ease);
            this.controls.target.lerpVectors(startTarget, worldPos, ease);
            this.controls.update();
            requestAnimationFrame(animate);
        };
        animate();
    }

    /**
     * Update camera each frame - keeps controls.target on the followed mesh
     * IMPORTANT: Only update target, NOT camera position - let OrbitControls handle rotation/zoom
     */
    updateCameraFollow() {
        if (this.cameraAnimating) return;
        if (this.fleetViewMode) return;

        if (!this.followTarget) return;
        if (!this.camera || !this.controls) return;

        // Get world position of target mesh
        const targetWorldPos = new THREE.Vector3();
        this.followTarget.getWorldPosition(targetWorldPos);

        // Calculate how much the target moved since last frame
        const oldTarget = this.controls.target.clone();
        const delta = targetWorldPos.clone().sub(oldTarget);

        // Move both target AND camera by the same delta
        // This keeps the camera in the same relative position while allowing OrbitControls to work
        this.controls.target.copy(targetWorldPos);
        this.camera.position.add(delta);
    }

    /**
     * Navigate to Sol
     */
    goToSol() {
        if (this.solMesh) {
            this.followMesh(this.solMesh);
            // Also animate to it
            const worldPos = new THREE.Vector3();
            this.solMesh.getWorldPosition(worldPos);
            this.goToPositionAndFollow(worldPos, this.solMesh, 15);

            // Track that we're focused on Sol
            this.focusedOnSol = true;
            this.showSolSystemPrompt();
        }
    }

    /**
     * Show "Sol System [Enter]" prompt when focused on Sol
     */
    showSolSystemPrompt() {
        if (!this.container) return;

        // Remove existing prompt if any
        this.hideSolSystemPrompt();

        const prompt = document.createElement('div');
        prompt.id = 'sol-system-prompt';
        prompt.className = 'sol-system-prompt';
        prompt.innerHTML = 'Sol System <span class="prompt-key">[Enter]</span>';
        this.container.appendChild(prompt);

        // Fade in
        setTimeout(() => prompt.classList.add('visible'), 10);
    }

    /**
     * Hide the Sol System prompt
     */
    hideSolSystemPrompt() {
        this.focusedOnSol = false;
        const prompt = document.getElementById('sol-system-prompt');
        if (prompt) {
            prompt.remove();
        }
    }

    /**
     * Enter Sol System view (hide galaxy, show solar system)
     */
    enterSolSystem() {
        console.log('[StarMap] Entering Sol System view');
        this.hideSolSystemPrompt();
        this.hide();
        // Solar system view will be shown automatically when galaxy is hidden
    }

    /**
     * Go to position and then follow a mesh
     */
    goToPositionAndFollow(worldPos, mesh, zoom = null) {
        if (!this.camera || !this.controls) return;
        if (this.cameraAnimating) return;

        // Hide Sol prompt when navigating elsewhere (unless we're going to Sol)
        if (mesh !== this.solMesh) {
            this.hideSolSystemPrompt();
        }

        if (this.fleetViewMode) {
            this.exitFleetView();
        }

        const finalZoom = zoom !== null ? zoom : this.getCameraZoomDistance();

        let direction = this.camera.position.clone().sub(this.controls.target);
        if (direction.length() < 0.1) {
            direction = new THREE.Vector3(0, 3, 10);
        }
        direction.normalize().multiplyScalar(finalZoom);

        // Store this as the offset we'll use when following
        this.cameraOffset = direction.clone();
        this.followTarget = mesh;

        const targetCamPos = worldPos.clone().add(direction);

        this.cameraAnimating = true;
        const startPos = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        let t = 0;

        const animate = () => {
            t += 0.05;

            // Recalculate target position (mesh may rotate with galaxy)
            const currentWorldPos = new THREE.Vector3();
            if (mesh) {
                mesh.getWorldPosition(currentWorldPos);
            } else {
                currentWorldPos.copy(worldPos);
            }
            const currentCamPos = currentWorldPos.clone().add(this.cameraOffset);

            if (t >= 1) {
                this.camera.position.copy(currentCamPos);
                this.controls.target.copy(currentWorldPos);
                this.controls.update();
                this.cameraAnimating = false;
                return;
            }

            const ease = 1 - Math.pow(1 - t, 3);
            this.camera.position.lerpVectors(startPos, currentCamPos, ease);
            this.controls.target.lerpVectors(startTarget, currentWorldPos, ease);
            this.controls.update();
            requestAnimationFrame(animate);
        };
        animate();
    }

    /**
     * Move camera to new target (for fleet switching etc)
     */
    moveCameraToTarget(newTarget, animate = true) {
        if (!this.camera || !this.controls) return;

        const zoomDistance = this.getCameraZoomDistance();
        const direction = this.camera.position.clone().sub(this.controls.target).normalize();
        const newCameraPos = newTarget.clone().add(direction.multiplyScalar(zoomDistance));

        if (animate) {
            const startPos = this.camera.position.clone();
            const startTarget = this.controls.target.clone();
            let progress = 0;

            const animateCamera = () => {
                progress += 0.08;
                if (progress >= 1) {
                    this.camera.position.copy(newCameraPos);
                    this.controls.target.copy(newTarget);
                    this.controls.update();
                    return;
                }
                const t = 1 - Math.pow(1 - progress, 3);
                this.camera.position.lerpVectors(startPos, newCameraPos, t);
                this.controls.target.lerpVectors(startTarget, newTarget, t);
                this.controls.update();
                requestAnimationFrame(animateCamera);
            };
            animateCamera();
        } else {
            this.camera.position.copy(newCameraPos);
            this.controls.target.copy(newTarget);
            this.controls.update();
        }
    }

    /**
     * Switch to next fleet in transit
     */
    nextFleet() {
        if (!this.fleetViewMode || this.probeFleets.length === 0) return;

        this.trackedFleetIndex = (this.trackedFleetIndex + 1) % this.probeFleets.length;
        this.trackedFleet = this.probeFleets[this.trackedFleetIndex];
        this.lastArrivedStar = null;

        // Move camera to new fleet position while preserving zoom
        if (this.trackedFleet && this.trackedFleet.probe) {
            const targetPos = this.trackedFleet.probe.position.clone();
            if (this.colonizationGroup) {
                targetPos.applyMatrix4(this.colonizationGroup.matrixWorld);
            }
            this.moveCameraToTarget(targetPos);
        }

        this.updateFleetViewIndicator();
        console.log('[StarMap] Now tracking fleet', this.trackedFleetIndex + 1, 'of', this.probeFleets.length);
    }

    /**
     * Switch to previous fleet in transit
     */
    prevFleet() {
        if (!this.fleetViewMode || this.probeFleets.length === 0) return;

        this.trackedFleetIndex = (this.trackedFleetIndex - 1 + this.probeFleets.length) % this.probeFleets.length;
        this.trackedFleet = this.probeFleets[this.trackedFleetIndex];
        this.lastArrivedStar = null;

        // Move camera to new fleet position while preserving zoom
        if (this.trackedFleet && this.trackedFleet.probe) {
            const targetPos = this.trackedFleet.probe.position.clone();
            if (this.colonizationGroup) {
                targetPos.applyMatrix4(this.colonizationGroup.matrixWorld);
            }
            this.moveCameraToTarget(targetPos);
        }

        this.updateFleetViewIndicator();
        console.log('[StarMap] Now tracking fleet', this.trackedFleetIndex + 1, 'of', this.probeFleets.length);
    }

    /**
     * Update camera to follow tracked fleet
     * Called from animate loop when in fleet view mode
     */
    updateFleetViewCamera() {
        if (!this.fleetViewMode) return;

        let targetPos;

        // Check if our tracked fleet is still valid
        if (this.trackedFleet && this.probeFleets.includes(this.trackedFleet)) {
            // Fleet still in transit - follow its current position
            targetPos = this.trackedFleet.probe.position.clone();
            this._fleetViewExitDelay = null;  // Reset exit delay when tracking valid fleet

            // Convert to world coordinates
            if (this.colonizationGroup) {
                targetPos.applyMatrix4(this.colonizationGroup.matrixWorld);
            }
        } else if (this.lastArrivedStar) {
            // Fleet arrived - stay at the colonized star
            targetPos = this.lastArrivedStar.position.clone();
            this._fleetViewExitDelay = null;  // Reset exit delay when at arrived star
            if (this.colonizationGroup) {
                targetPos.applyMatrix4(this.colonizationGroup.matrixWorld);
            }
        } else {
            // Fleet completed but no arrived star tracked - try to find a new fleet
            if (this.probeFleets.length > 0) {
                this.trackedFleetIndex = Math.min(this.trackedFleetIndex, this.probeFleets.length - 1);
                this.trackedFleet = this.probeFleets[this.trackedFleetIndex];
                this.updateFleetViewIndicator();
                return;
            } else {
                // No more fleets - wait a moment for new ones before exiting
                // This prevents immediate exit if there's a brief gap between fleets
                if (!this._fleetViewExitDelay) {
                    this._fleetViewExitDelay = Date.now();
                    return;  // Wait before exiting
                }
                // Exit after 2 seconds with no fleets
                if (Date.now() - this._fleetViewExitDelay > 2000) {
                    this._fleetViewExitDelay = null;
                    this.exitFleetView();
                }
                return;
            }
        }

        // Smoothly follow the target - update both target AND camera position
        if (targetPos && this.controls) {
            // Calculate current offset from target to camera
            const currentOffset = this.camera.position.clone().sub(this.controls.target);

            // Smoothly move the target
            this.controls.target.lerp(targetPos, 0.05);

            // Move camera to maintain the same relative offset
            const newCameraPos = this.controls.target.clone().add(currentOffset);
            this.camera.position.lerp(newCameraPos, 0.05);
        }
    }

    /**
     * Called when a fleet arrives - update tracking if we were following it
     */
    onFleetArrived(fleet, newStar) {
        if (this.fleetViewMode && fleet === this.trackedFleet) {
            // The fleet we were tracking has arrived
            this.lastArrivedStar = newStar;
            this.trackedFleet = null;

            // Update indicator to show we're at the new colony
            this.updateFleetViewIndicator();
        }
    }

    /**
     * Show the fleet view indicator UI
     */
    showFleetViewIndicator() {
        let indicator = document.getElementById('fleet-view-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'fleet-view-indicator';
            indicator.className = 'fleet-view-indicator';
            this.container.appendChild(indicator);
        }
        indicator.style.display = 'block';
        this.updateFleetViewIndicator();
    }

    /**
     * Hide the fleet view indicator UI
     */
    hideFleetViewIndicator() {
        const indicator = document.getElementById('fleet-view-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    /**
     * Update the fleet view indicator content
     */
    updateFleetViewIndicator() {
        const indicator = document.getElementById('fleet-view-indicator');
        if (!indicator) return;

        let content = '<div class="fleet-indicator-header">FLEET VIEW</div>';

        if (this.lastArrivedStar) {
            // At a newly colonized star
            const distLY = Math.round(this.lastArrivedStar.position.length() * 326);
            content += `<div class="fleet-indicator-status arrived">COLONY ESTABLISHED</div>`;
            content += `<div class="fleet-indicator-distance">${this.formatDistance(distLY)} from Sol</div>`;
        } else if (this.trackedFleet) {
            // Tracking an in-transit fleet
            const progress = Math.round(this.trackedFleet.progress * 100);
            const distLY = Math.round(this.trackedFleet.distance * 326);
            content += `<div class="fleet-indicator-status transit">IN TRANSIT</div>`;
            content += `<div class="fleet-indicator-progress">${progress}% complete</div>`;
            content += `<div class="fleet-indicator-distance">Target: ${this.formatDistance(distLY)}</div>`;
        }

        content += `<div class="fleet-indicator-nav">`;
        content += `<span class="fleet-count">${this.trackedFleetIndex + 1}/${this.probeFleets.length}</span>`;
        content += `<span class="fleet-hint">← → Switch fleets</span>`;
        content += `</div>`;
        content += `<div class="fleet-indicator-exit">Press F or 1 to exit</div>`;

        indicator.innerHTML = content;
    }

    /**
     * Format distance for display
     */
    formatDistance(ly) {
        if (ly >= 1000) {
            return `${(ly / 1000).toFixed(1)} kly`;
        }
        return `${ly} ly`;
    }

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
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, this.camera);

        // Increase raycaster threshold for better hit detection on small objects
        raycaster.params.Line = { threshold: 0.5 };
        raycaster.params.Points = { threshold: 0.5 };

        // POA clicks are handled by floating labels only (not 3D markers)
        // Click label to focus camera and show colonization menu

        // Check regular star clicks
        const starMeshes = Object.values(this.stars);
        const intersects = raycaster.intersectObjects(starMeshes, true);

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
        const drive = this.getStarshipDrive(driveTier);

        // Get effective velocity (ly/year) - reduced by 90% for better visual pacing
        const baseVelocity = drive.effective_velocity_ly_per_year || 8700;
        const velocityLYperYear = baseVelocity * 0.10;  // 10% of base speed

        // Simple: time = distance / velocity
        const travelTime = distanceLY / velocityLYperYear;

        return {
            travelTime: travelTime,
            visualSpeedLYperYr: velocityLYperYear
        };
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

            // O key - Strategy panel
            if (e.key === 'o' || e.key === 'O') {
                e.preventDefault();
                this.togglePanel('strategy');
            }

            // P key - Debug panel
            if (e.key === 'p' || e.key === 'P') {
                e.preventDefault();
                if (window.debugPanel) {
                    window.debugPanel.toggle();
                }
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

            // H key - go to Sol (home)
            if (e.key === 'h' || e.key === 'H') {
                e.preventDefault();
                this.goToSol();
            }

            // Spacebar - colonize selected POA (addPOAToQueueAndRefresh also closes panel)
            if (e.key === ' ' && this.selectedPOA) {
                e.preventDefault();
                this.addPOAToQueueAndRefresh(this.selectedPOA);
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

        // Get camera's forward direction (from camera to target)
        const forward = new THREE.Vector3();
        forward.subVectors(this.controls.target, this.camera.position).normalize();

        // Get right direction (perpendicular to forward, in XZ plane)
        const right = new THREE.Vector3();
        right.crossVectors(forward, this.camera.up).normalize();

        // Calculate movement vector
        const movement = new THREE.Vector3(0, 0, 0);

        if (this.keysPressed.has('w')) {
            movement.add(forward.clone().multiplyScalar(speed));
        }
        if (this.keysPressed.has('s')) {
            movement.add(forward.clone().multiplyScalar(-speed));
        }
        if (this.keysPressed.has('a')) {
            movement.add(right.clone().multiplyScalar(-speed));
        }
        if (this.keysPressed.has('d')) {
            movement.add(right.clone().multiplyScalar(speed));
        }

        // Move both camera and target together (maintains orbit distance)
        this.camera.position.add(movement);
        this.controls.target.add(movement);
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
