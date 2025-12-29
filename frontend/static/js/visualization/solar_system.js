/** Solar system visualization - planets, orbits, asteroid belt */
class SolarSystem {
    constructor(scene) {
        this.scene = scene;
        this.planets = {};
        this.orbits = {};
        this.moons = {}; // Store moons by planet zone ID
        this.asteroidBelt = null;
        this.kuiperBelt = null;
        this.oortCloud = null;
        this.orbitalData = null;
        this.sun = null;
        this.sunLight = null;
        this.sunRays = null;
        this.comets = [];
        this.cometOrbits = {};
        this.time = 0;
        this.gameTime = 0; // Game time in days (from gameState.time) - used for particle animations
        this.zoneClouds = null; // ZoneClouds instance
        this.initialZoneMasses = {}; // Store initial mass for each zone
        
        // Resource particle visualization
        // Stored metal, slag, and methalox appear as particles orbiting around the planet
        // Particles spawn near planet and orbit at 80% speed, forming trailing cloud
        // When resources are consumed, particles are removed
        this.resourceParticles = {}; // {zoneId: THREE.Points}
        this.resourceParticleData = {}; // {zoneId: {metal: [...], slag: [...], methalox: [...]}}
        this.previousResources = {}; // {zoneId: {metal: 0, slag: 0, methalox: 0, probe: 0}} - track changes
        this.pendingMass = {}; // {zoneId: {metal: 0, slag: 0, methalox: 0, probe: 0}} - accumulated mass waiting to become particles
        this.lastUpdateTime = {}; // {zoneId: timestamp} - track last update time per zone
        this.lastSpawnTime = {}; // {zoneId_resourceType: timestamp} - track last spawn time for rate limiting
        this.maxResourceParticles = 50000; // Max particles per planet (metal + slag combined)
        
        // Resource size tiers with progressive filling limits (separate for metal and slag)
        // Scaled so Jupiter (1.8982e27 kg) converts to ~800,000 particles
        this.resourceSizes = {
            small:  { mass: 1e9,  size: 0.15 },    // 1 Gkg (gigakilogram)
            medium: { mass: 1e12,  size: 0.275 },  // 1 Tkg (terakilogram)
            large:  { mass: 1e15, size: 0.4 },     // 1 Pkg (petakilogram)
            xlarge: { mass: 1e18, size: 0.5 },     // 1 Ekg (exakilogram)
            huge:   { mass: 2.5e21, size: 0.65 }   // 2.5 Zkg (zettakilogram) - for gas giant scale
        };
        // Separate max particles per resource type
        // Huge tier sized for gas giants (~800k total particles for Jupiter)
        this.maxParticlesByType = {
            metal: {
                small: 50000,
                medium: 20000,
                large: 8000,
                xlarge: 2000,
                huge: 800000
            },
            slag: {
                small: 20000,
                medium: 10000,
                large: 5000,
                xlarge: 2000,
                huge: 200000
            },
            methalox: {
                small: 20000,
                medium: 10000,
                large: 5000,
                xlarge: 2000,
                huge: 200000
            }
        };
        this.maxDotsPerZone = 15000; // Maximum dots per zone (metal + slag combined) - kept for compatibility
        
        // Legacy resource scaling (kept for backward compatibility, will be replaced)
        this.resourceKgPerDot = 1000; // 1000kg of slag/metal = 1 dot
        this.resourceLinearMaxDots = 100; // First 100 dots are linear (100,000 kg)
        this.resourceLogMaxMass = 1e24; // Reference mass for max dots - full planet mass scale
        
        // Resource colors (metal = silver, slag = brown-grey, methalox = pale blue, probe = cyan)
        this.resourceColors = {
            metal: new THREE.Color(0xC0C0C0),    // Silver
            slag: new THREE.Color(0x5C4033),     // Brown-grey
            methalox: new THREE.Color(0x7EC8E3), // Pale blue
            probe: new THREE.Color(0x00FFFF)    // Cyan
        };
        
        // Particle drift settings (in game days)
        this.particleDriftDuration = 0.2; // Game days for particle to drift from spawn to orbit
        this.particleSpawnRadius = 0.1; // Initial spawn offset from planet center
        
        // UNIFIED particle size distribution config
        // Loaded from game_data/economic_rules.json (particle_visualization section)
        // Uses power-law (Pareto) distribution: many small particles, few large ones
        // Consistent scaling across ALL particle types: metal, slag, methalox, probes
        // These are defaults - will be overwritten by loadParticleConfig()
        this.particleDistribution = null;
        this.probeParticleConfig = null;
        this.particleDriftConfig = null;
        this.probeSwarmConfig = null;
        
        // Apply default config (will be updated from JSON when loaded)
        this.applyDefaultParticleConfig();
        
        // Probe particle data tracking (per zone)
        this.probeParticles = {};        // {zoneId: [...particle objects]}
        this.previousProbeCount = {};    // {zoneId: count} - track changes
        this.pendingProbeMass = {};      // {zoneId: mass} - accumulated mass waiting to become particles
        this.individualProbes = {};      // {zoneId: [...individual probe positions]}

        // Real-world planet data (radii in km, orbital distances in km, mass in kg)
        // 1 AU = 149,600,000 km
        this.AU_KM = 149600000;
        this.planetData = {
            sun: { radius_km: 696000, mass_kg: 1.989e30 },
            mercury: { radius_km: 2440, orbit_km: 0.39 * 149600000, mass_kg: 3.30e23 },     // 0.055 Earth masses
            venus: { radius_km: 6052, orbit_km: 0.72 * 149600000, mass_kg: 4.87e24 },      // 0.815 Earth masses
            earth: { radius_km: 6371, orbit_km: 1.0 * 149600000, mass_kg: 5.97e24 },       // 1.0 Earth masses
            mars: { radius_km: 3390, orbit_km: 1.52 * 149600000, mass_kg: 6.42e23 },       // 0.107 Earth masses
            jupiter: { radius_km: 69911, orbit_km: 5.2 * 149600000, mass_kg: 1.90e27 },    // 318 Earth masses
            saturn: { radius_km: 58232, orbit_km: 9.5 * 149600000, mass_kg: 5.68e26 },     // 95 Earth masses
            uranus: { radius_km: 25362, orbit_km: 19.2 * 149600000, mass_kg: 8.68e25 },    // 14.5 Earth masses
            neptune: { radius_km: 24622, orbit_km: 30.1 * 149600000, mass_kg: 1.02e26 },   // 17.1 Earth masses
            // Ceres - dwarf planet and main body of the Asteroid Belt zone
            ceres: { radius_km: 473, orbit_km: 2.77 * 149600000, mass_kg: 9.39e20 },       // 0.00016 Earth masses
            // Pluto - dwarf planet and main body of the Kuiper Belt zone  
            kuiper: { radius_km: 1188, orbit_km: 40.0 * 149600000, mass_kg: 1.31e22 },     // 0.0022 Earth masses
            oort: { orbit_km: 140.0 * 149600000 },                            // 140 AU (inner Oort cloud)
            oort_outer: { orbit_km: 140.0 * 149600000 }                      // 140 AU (outer boundary)
        };

        // Load orbital data (will calculate scaling and create sun)
        this.loadOrbitalData();
    }

    calculateScalingFactors() {
        // Find min/max for radius scaling (planet sizes)
        const radii = Object.values(this.planetData).filter(p => p.radius_km).map(p => p.radius_km);
        this.minRadius = Math.min(...radii);
        this.maxRadius = Math.max(...radii);

        // Log ranges for planet radius scaling
        this.logMinRadius = Math.log10(this.minRadius);
        this.logMaxRadius = Math.log10(this.maxRadius);

        // Scale factors for visualization (target sizes in 3D units)
        this.radiusScale = 0.5; // Max planet radius will be 0.5 units
        this.orbitScale = 800.0;  // Max orbit distance in view units - increase to spread planets further apart, decrease to bring them closer
        this.sunScale = 1.0;     // Sun will be 1.0 units
        
        // Hybrid orbital scaling constants
        // Inner solar system: linear scaling from Sun to Mars (1.52 AU = 10% of visual range)
        // Outer solar system: logarithmic scaling from Mars to Oort cloud (140 AU = 100% of visual range)
        this.MARS_AU = 1.52;           // Inner/outer boundary (real AU)
        this.OUTER_BOUNDARY_AU = 140.0; // Oort cloud outer edge (real AU)
        this.INNER_VISUAL_FRACTION = 0.1;  // Mars at 10% of visual range
        
        // Rocky planets list (for reference, but scaling is now unified)
        this.rockyPlanets = ['mercury', 'venus', 'earth', 'mars'];
        
        // Gas giants list - for resource particle placement near planet instead of zone-wide
        this.gasGiants = ['jupiter', 'saturn', 'uranus', 'neptune'];
    }

    /**
     * Apply default particle configuration (fallback values)
     * These match the JSON config and are used until loadParticleConfig() completes
     */
    applyDefaultParticleConfig() {
        // Default mass distribution (Pareto)
        this.particleDistribution = {
            minMass: 1e6,               // 1 megakilogram - smallest visible particle
            maxMass: 1e22,              // 10 zettakilograms - largest particle
            shapeParameter: 1.15,       // Pareto alpha - heavy tail
            minVisualSize: 0.05,        // Tiny dot for min mass
            maxVisualSize: 3.5,         // Huge asteroid for max mass
            sizeExponent: 0.4,          // Power transform: t^exponent. < 1 shifts toward larger sizes
            minSpawnRate: 0.5,          // Min particles per game day
            maxSpawnRate: 15,           // Max particles per game day
            jupiterMass: 1.898e27       // Calibration reference
        };
        
        // Default probe config
        this.probeParticleConfig = {
            probeMassKg: 100,
            maxIndividualProbes: 300,
            color: new THREE.Color(0x88FFFF),
            individualProbeSize: 0.16,
            transferSize: 0.16
        };
        
        // Default drift animation config
        this.particleDriftConfig = {
            resourceBaseDurationDays: 90,
            resourceDistanceScalingDays: 50,
            probeIndividualDurationDays: 5,
            probeMassDurationDays: 30,
            massDriverDurationDays: 36
        };
        
        // Default resource colors
        this.resourceColors = {
            metal: new THREE.Color(0xC0C0C0),    // Silver
            slag: new THREE.Color(0x5C4033),     // Brown-grey
            methalox: new THREE.Color(0x7EC8E3), // Pale blue
            probe: new THREE.Color(0x00FFFF)     // Cyan
        };
    }
    
    /**
     * Load particle configuration from economic_rules.json via gameDataLoader
     * Called during initialization; updates config from centralized JSON
     */
    async loadParticleConfig() {
        try {
            // Use gameDataLoader if available (preferred)
            if (typeof gameDataLoader !== 'undefined') {
                await gameDataLoader.loadEconomicRules();
                const config = gameDataLoader.getParticleVisualization();
                
                if (config) {
                    this.applyParticleConfig(config);
                    console.log('Loaded particle visualization config from economic_rules.json');
                    return;
                }
            }
            
            // Fallback: direct fetch
            const response = await fetch('/game_data/economic_rules.json');
            const rules = await response.json();
            
            if (rules.particle_visualization) {
                this.applyParticleConfig(rules.particle_visualization);
                console.log('Loaded particle visualization config (direct fetch)');
            }
        } catch (error) {
            console.warn('Failed to load particle config, using defaults:', error);
            // Defaults already applied in constructor
        }
    }
    
    /**
     * Apply particle configuration from JSON structure
     * @param {Object} config - particle_visualization section from economic_rules.json
     */
    applyParticleConfig(config) {
        // Mass distribution
        if (config.mass_distribution) {
            const md = config.mass_distribution;
            this.particleDistribution.minMass = md.min_mass_kg || this.particleDistribution.minMass;
            this.particleDistribution.maxMass = md.max_mass_kg || this.particleDistribution.maxMass;
            this.particleDistribution.shapeParameter = md.shape_parameter || this.particleDistribution.shapeParameter;
        }
        
        // Visual size scaling
        if (config.visual_size) {
            const vs = config.visual_size;
            this.particleDistribution.minVisualSize = vs.min_size || this.particleDistribution.minVisualSize;
            this.particleDistribution.maxVisualSize = vs.max_size || this.particleDistribution.maxVisualSize;
            // Size exponent: power transform applied to normalized log position
            // Values < 1 shift distribution toward larger visual sizes
            if (vs.size_exponent !== undefined) {
                this.particleDistribution.sizeExponent = vs.size_exponent;
            }
        }
        
        // Spawn rate control
        if (config.spawn_rate) {
            const sr = config.spawn_rate;
            this.particleDistribution.minSpawnRate = sr.min_rate_per_day || this.particleDistribution.minSpawnRate;
            this.particleDistribution.maxSpawnRate = sr.max_rate_per_day || this.particleDistribution.maxSpawnRate;
        }
        
        // Calibration reference
        if (config.calibration) {
            this.particleDistribution.jupiterMass = config.calibration.jupiter_mass_kg || this.particleDistribution.jupiterMass;
        }
        
        // Resource colors
        if (config.colors) {
            const c = config.colors;
            if (c.metal) this.resourceColors.metal = new THREE.Color(c.metal);
            if (c.slag) this.resourceColors.slag = new THREE.Color(c.slag);
            if (c.methalox) this.resourceColors.methalox = new THREE.Color(c.methalox);
            if (c.probe) {
                this.resourceColors.probe = new THREE.Color(c.probe);
                this.probeParticleConfig.color = new THREE.Color(c.probe);
            }
        }
        
        // Probe individual settings
        if (config.probe_individual) {
            const pi = config.probe_individual;
            this.probeParticleConfig.maxIndividualProbes = pi.max_individual_count || this.probeParticleConfig.maxIndividualProbes;
            this.probeParticleConfig.individualProbeSize = pi.individual_size || this.probeParticleConfig.individualProbeSize;
            this.probeParticleConfig.transferSize = pi.transfer_size || this.probeParticleConfig.transferSize;
        }
        
        // Drift animation timing
        if (config.drift_animation) {
            const da = config.drift_animation;
            this.particleDriftConfig.resourceBaseDurationDays = da.resource_base_duration_days || this.particleDriftConfig.resourceBaseDurationDays;
            this.particleDriftConfig.resourceDistanceScalingDays = da.resource_distance_scaling_days || this.particleDriftConfig.resourceDistanceScalingDays;
            this.particleDriftConfig.probeIndividualDurationDays = da.probe_individual_duration_days || this.particleDriftConfig.probeIndividualDurationDays;
            this.particleDriftConfig.probeMassDurationDays = da.probe_mass_duration_days || this.particleDriftConfig.probeMassDurationDays;
            this.particleDriftConfig.massDriverDurationDays = da.mass_driver_duration_days || this.particleDriftConfig.massDriverDurationDays;
        }
        
        // Probe swarm configuration
        if (config.probe_swarm) {
            this.probeSwarmConfig = {
                ringCount: config.probe_swarm.ring_count || 6,
                maxDotsPerRing: config.probe_swarm.max_dots_per_ring || 20,
                maxTotalDots: config.probe_swarm.max_total_dots || 120,
                overflowThreshold: config.probe_swarm.overflow_threshold || 100000000,
                ringRadiusMultipliers: config.probe_swarm.ring_radius_multipliers || [1.2, 1.35, 1.5, 1.65, 1.8, 1.95]
            };
        } else {
            // Default probe swarm config
            this.probeSwarmConfig = {
                ringCount: 6,
                maxDotsPerRing: 20,
                maxTotalDots: 120,
                overflowThreshold: 100000000,
                ringRadiusMultipliers: [1.2, 1.35, 1.5, 1.65, 1.8, 1.95]
            };
        }
    }

    logScaleRadius(radiusKm) {
        const logRadius = Math.log10(radiusKm);
        const normalized = (logRadius - this.logMinRadius) / (this.logMaxRadius - this.logMinRadius);
        return normalized * this.radiusScale;
    }

    /**
     * Scale visual radius based on mass relative to Earth
     * Bodies with Earth-like mass appear Earth-like in size
     * Uses square root scaling for dramatic gas giant sizing (~20x Earth for Jupiter)
     * @param {number} massKg - Mass in kilograms
     * @param {boolean} isMoon - If true, apply moon size boost for visibility
     * @returns {number} Visual radius in 3D units
     */
    massScaleRadius(massKg, isMoon = false) {
        const EARTH_MASS = 5.97e24; // kg
        const EARTH_VISUAL_SIZE = 0.15; // Visual size for Earth-mass body
        
        // Use square root of mass ratio for more dramatic scaling
        // This makes Jupiter (~318 Earth masses) appear ~18x Earth's size
        // Saturn (~95 Earth masses) appears ~10x Earth's size
        const massRatio = massKg / EARTH_MASS;
        const sizeMultiplier = Math.pow(massRatio, 0.5); // Square root for ~20x Jupiter
        
        // Apply scaling with reasonable min/max bounds
        let rawSize = EARTH_VISUAL_SIZE * sizeMultiplier;
        
        // Boost moon sizes significantly for better visibility
        // Use a higher exponent (0.35 power) to make large moons more Earth-comparable
        // Ganymede (0.025 Earth masses) should appear roughly 40% of Earth's size
        if (isMoon) {
            // Recalculate with gentler exponent for moons (0.35 instead of 0.5)
            // This gives: Ganymede ≈ 0.29 × Earth, boosted to ~0.10 visual
            const moonSizeMultiplier = Math.pow(massRatio, 0.35);
            rawSize = EARTH_VISUAL_SIZE * moonSizeMultiplier * 4.0; // 4x boost
            // Moons get a higher minimum size to remain visible
            return Math.max(0.08, Math.min(0.5, rawSize));
        }
        
        // Clamp to reasonable visual bounds:
        // - Minimum 0.02 so small bodies remain visible
        // - Maximum 3.0 for impressive gas giants (Jupiter will be ~2.7)
        return Math.max(0.02, Math.min(3.0, rawSize));
    }

    /**
     * Unified orbital scaling: linear for inner solar system, logarithmic for outer
     * @param {number} au - Orbital distance in AU
     * @returns {number} Visual orbit radius in 3D units
     */
    scaleAUToVisual(au) {
        if (au <= this.MARS_AU) {
            // Linear scaling: 0 to 10% of visual range
            // Earth (1 AU) maps to (1/1.52) * 10% = 6.58% of visual range
            return (au / this.MARS_AU) * this.INNER_VISUAL_FRACTION * this.orbitScale;
        } else {
            // Logarithmic scaling: 10% to 100% of visual range
            const logNorm = (Math.log(au) - Math.log(this.MARS_AU)) / 
                            (Math.log(this.OUTER_BOUNDARY_AU) - Math.log(this.MARS_AU));
            return (this.INNER_VISUAL_FRACTION + (1 - this.INNER_VISUAL_FRACTION) * logNorm) * this.orbitScale;
        }
    }
    
    /**
     * Legacy method: Convert orbit_km to visual units (converts km to AU first)
     * @param {number} orbitKm - Orbital distance in km
     * @returns {number} Visual orbit radius in 3D units
     * @deprecated Use scaleAUToVisual() directly with AU values
     */
    logScaleOrbit(orbitKm) {
        const au = orbitKm / this.AU_KM;
        return this.scaleAUToVisual(au);
    }
    
    /**
     * Legacy method: Scale rocky planet orbit (now uses unified scaling)
     * @param {number} orbitKm - Orbital distance in km
     * @returns {number} Visual orbit radius in 3D units
     * @deprecated Use scaleAUToVisual() directly with AU values
     */
    scaleRockyPlanetOrbit(orbitKm) {
        const au = orbitKm / this.AU_KM;
        return this.scaleAUToVisual(au);
    }

    logScaleSunRadius(radiusKm) {
        const logRadius = Math.log10(radiusKm);
        const normalized = (logRadius - this.logMinRadius) / (this.logMaxRadius - this.logMinRadius);
        return normalized * this.sunScale;
    }

    createSun() {
        // Calculate log-scaled sun radius
        const sunRadius = this.logScaleSunRadius(this.planetData.sun.radius_km);
        this.sunRadius = sunRadius; // Store for orbit calculations
        
        // Core sun sphere - brighter and more saturated
        const sunGeometry = new THREE.SphereGeometry(sunRadius, 64, 64);
        const sunMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            emissive: 0xffffff,  // Changed to white for maximum brightness
            emissiveIntensity: 12.0
        });
        this.sun = new THREE.Mesh(sunGeometry, sunMaterial);
        this.scene.add(this.sun);

        // Multiple glow layers for dramatic visual brightness
        const glowLayers = [
            { radius: 1.08, opacity: 0.6, color: 0xffffaa },
            { radius: 1.15, opacity: 0.4, color: 0xffff88 },
            { radius: 1.25, opacity: 0.25, color: 0xffaa44 },
            { radius: 1.4, opacity: 0.15, color: 0xff8844 }
        ];
        
        glowLayers.forEach(layer => {
            const glowGeometry = new THREE.SphereGeometry(sunRadius * layer.radius, 32, 32);
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: layer.color,
                transparent: true,
                opacity: layer.opacity,
                blending: THREE.AdditiveBlending,
                side: THREE.BackSide,
                depthWrite: false
            });
            const glow = new THREE.Mesh(glowGeometry, glowMaterial);
            this.scene.add(glow);
        });

        // Sun light source (enhanced) - significantly increased intensity
        this.sunLight = new THREE.PointLight(0xffffaa, 12, 2000);  // Increased intensity from 3 to 8, range from 1000 to 2000
        this.sunLight.position.set(0, 0, 0);
        
        // Configure sun light for shadows - enhanced for dramatic effect
        this.sunLight.castShadow = true;
        // Increased shadow map resolution for better quality
        this.sunLight.shadow.mapSize.width = 4096;
        this.sunLight.shadow.mapSize.height = 4096;
        // Expanded shadow camera bounds to cover entire solar system
        this.sunLight.shadow.camera.near = 0.1;
        this.sunLight.shadow.camera.far = 2000;
        this.sunLight.shadow.camera.left = -200;
        this.sunLight.shadow.camera.right = 200;
        this.sunLight.shadow.camera.top = 200;
        this.sunLight.shadow.camera.bottom = -200;
        // Reduced bias to minimize shadow acne
        this.sunLight.shadow.bias = -0.0001;
        // Increased shadow radius for softer, more visible shadows
        this.sunLight.shadow.radius = 8;
        
        this.scene.add(this.sunLight);

        // Add lensflare to sun
        if (typeof THREE.Lensflare !== 'undefined') {
            this.createLensflare();
        }

        // Create sun rays using point sprites
        this.createSunRays(sunRadius);
    }

    createLensflare() {
        const lensflare = new THREE.Lensflare();
        
        // Generate procedural flare textures
        const flareTexture = this.generateFlareTexture(256, 0xffffcc, 1.0);
        const hexTexture = this.generateFlareTexture(64, 0xffaa44, 0.5);
        const ringTexture = this.generateRingTexture(128, 0xffffff);
        
        // Main sun flare
        lensflare.addElement(new THREE.LensflareElement(flareTexture, 700, 0, new THREE.Color(0xffffee)));
        
        // Secondary flares at various distances
        lensflare.addElement(new THREE.LensflareElement(hexTexture, 60, 0.6, new THREE.Color(0xffaa44)));
        lensflare.addElement(new THREE.LensflareElement(hexTexture, 70, 0.7, new THREE.Color(0x88ccff)));
        lensflare.addElement(new THREE.LensflareElement(ringTexture, 120, 0.9, new THREE.Color(0xffffff)));
        lensflare.addElement(new THREE.LensflareElement(hexTexture, 70, 1.0, new THREE.Color(0xffddaa)));
        
        this.sunLight.add(lensflare);
        this.lensflare = lensflare;
    }

    generateFlareTexture(size, color, intensity) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createRadialGradient(
            size / 2, size / 2, 0,
            size / 2, size / 2, size / 2
        );
        
        const col = new THREE.Color(color);
        gradient.addColorStop(0, `rgba(${Math.floor(col.r*255)}, ${Math.floor(col.g*255)}, ${Math.floor(col.b*255)}, ${intensity})`);
        gradient.addColorStop(0.2, `rgba(${Math.floor(col.r*255)}, ${Math.floor(col.g*255)}, ${Math.floor(col.b*255)}, ${intensity * 0.5})`);
        gradient.addColorStop(0.4, `rgba(${Math.floor(col.r*255)}, ${Math.floor(col.g*255)}, ${Math.floor(col.b*255)}, ${intensity * 0.1})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    generateRingTexture(size, color) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        const col = new THREE.Color(color);
        ctx.strokeStyle = `rgba(${Math.floor(col.r*255)}, ${Math.floor(col.g*255)}, ${Math.floor(col.b*255)}, 0.4)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
        ctx.stroke();
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    createSunRays(sunRadius = 1.0) {
        // Create point sprites for sparkle effect
        const sparkleCount = 32;
        const sparkleGeometry = new THREE.BufferGeometry();
        const sparklePositions = new Float32Array(sparkleCount * 3);
        const sparkleSizes = new Float32Array(sparkleCount);
        const sparkleOpacities = new Float32Array(sparkleCount);

        for (let i = 0; i < sparkleCount; i++) {
            const angle = (i / sparkleCount) * Math.PI * 2;
            const distance = sunRadius * 1.5 + Math.random() * sunRadius * 0.5;
            
            sparklePositions[i * 3] = Math.cos(angle) * distance;
            sparklePositions[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
            sparklePositions[i * 3 + 2] = Math.sin(angle) * distance;
            
            sparkleSizes[i] = 0.05 + Math.random() * 0.05;
            sparkleOpacities[i] = 0.6 + Math.random() * 0.4;
        }

        sparkleGeometry.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));
        sparkleGeometry.setAttribute('size', new THREE.BufferAttribute(sparkleSizes, 1));
        sparkleGeometry.setAttribute('opacity', new THREE.BufferAttribute(sparkleOpacities, 1));

        const sparkleMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 }
            },
            vertexShader: `
                attribute float size;
                attribute float opacity;
                varying float vOpacity;
                
                void main() {
                    vOpacity = opacity;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform float time;
                varying float vOpacity;
                
                void main() {
                    float dist = length(gl_PointCoord - vec2(0.5));
                    float alpha = vOpacity * (1.0 - smoothstep(0.0, 0.5, dist));
                    float pulse = sin(time * 2.0) * 0.2 + 0.8;
                    gl_FragColor = vec4(1.0, 0.9, 0.5, alpha * pulse);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.sunRays = new THREE.Points(sparkleGeometry, sparkleMaterial);
        this.scene.add(this.sunRays);
    }

    async loadOrbitalData() {
        try {
            const response = await fetch('/game_data/orbital_mechanics.json');
            this.orbitalData = await response.json();
            
            // Load particle visualization config from economic_rules.json
            await this.loadParticleConfig();
            
            // Calculate scaling factors after loading data
            this.calculateScalingFactors();
            
            // Create sun after scaling is calculated
            this.createSun();
            
            // Store initial masses for depletion calculations
            this.orbitalData.orbital_zones.forEach(zone => {
                if (zone.total_mass_kg) {
                    this.initialZoneMasses[zone.id] = zone.total_mass_kg;
                }
            });
            
            // Initialize planets and orbits
            this.init();
            
            // Initialize zone clouds AFTER planets are created
            if (typeof ZoneClouds !== 'undefined') {
                this.zoneClouds = new ZoneClouds(this.scene, this);
                this.zoneClouds.init(this.orbitalData);
            }
        } catch (error) {
            console.error('Failed to load orbital data:', error);
            // Use default data if file not available
            this.orbitalData = {
                orbital_zones: [
                    { id: 'mercury', name: 'Mercury', radius_au: 1.17, color: '#8C7853' },
                    { id: 'venus', name: 'Venus', radius_au: 2.16, color: '#FFC649' },
                    { id: 'earth', name: 'Earth', radius_au: 3.0, color: '#6B93D6' },
                    { id: 'mars', name: 'Mars', radius_au: 4.56, color: '#CD5C5C' },
                    { id: 'asteroid_belt', name: 'Asteroid Belt', radius_au: 7.5, color: '#9E9E9E' },
                    { id: 'jupiter', name: 'Jupiter', radius_au: 15.6, color: '#D8CA9D' },
                    { id: 'saturn', name: 'Saturn', radius_au: 9.5, color: '#FAD5A5' },
                    { id: 'uranus', name: 'Uranus', radius_au: 19.2, color: '#4FD0E7' },
                    { id: 'neptune', name: 'Neptune', radius_au: 30.1, color: '#4166F5' },
                    { id: 'kuiper', name: 'Kuiper Belt', radius_au: 30.0, color: '#4B0082' },
                    { id: 'oort_cloud', name: 'Oort Cloud', radius_au: 2000.0, color: '#1A1A2E' }
                ]
            };
            
            // Calculate scaling factors
            this.calculateScalingFactors();
            
            // Create sun
            this.createSun();
            
            // Store initial masses for depletion calculations
            this.orbitalData.orbital_zones.forEach(zone => {
                if (zone.total_mass_kg) {
                    this.initialZoneMasses[zone.id] = zone.total_mass_kg;
                }
            });
            
            // Initialize
            this.init();
            
            // Initialize zone clouds AFTER planets are created
            if (typeof ZoneClouds !== 'undefined') {
                this.zoneClouds = new ZoneClouds(this.scene, this);
                this.zoneClouds.init(this.orbitalData);
            }
        }
    }

    init() {
        if (!this.orbitalData) return;

        const zones = this.orbitalData.orbital_zones || [];

        zones.forEach(zone => {
            if (zone.id === 'asteroid_belt') {
                this.createAsteroidBelt(zone);
                // Create Ceres as the main planet of the Asteroid Belt zone
                this.createCeresPlanet(zone);
                this.createCeresOrbit(zone);
            } else if (zone.id === 'kuiper' || zone.id === 'kuiper_belt') {
                this.createKuiperBelt(zone);
                // Create Pluto as the main planet of the Kuiper belt zone
                this.createPlanet(zone);
                this.createOrbit(zone);
                this.createMoons(zone);
            } else if (zone.id === 'oort_cloud') {
                this.createOortCloud(zone);
            } else if (zone.id === 'dyson_sphere') {
                // Dyson sphere zone - create orbital ring for transfer trajectories
                // No physical planet body, but we need the orbit for visualization
                this.createDysonOrbit(zone);
            } else {
                this.createPlanet(zone);
                this.createOrbit(zone);
                // Add moons for planets that have them
                this.createMoons(zone);
            }
        });
        
        // Also create Kuiper belt if not in zones (between Neptune and Oort cloud)
        if (!zones.find(z => z.id === 'kuiper' || z.id === 'kuiper_belt')) {
            const neptuneZone = zones.find(z => z.id === 'neptune');
            if (neptuneZone) {
                const kuiperZone = {
                    id: 'kuiper_belt',
                    name: 'Kuiper Belt',
                    radius_au: neptuneZone.radius_au * 1.3, // Just beyond Neptune
                    color: '#4B0082'
                };
                this.createKuiperBelt(kuiperZone);
            }
        }
        
        // Also create Oort cloud if not in zones (further out)
        if (!zones.find(z => z.id === 'oort_cloud')) {
            const neptuneZone = zones.find(z => z.id === 'neptune');
            if (neptuneZone) {
                // Create Oort cloud at 2.5x Neptune's distance
                const oortZone = {
                    id: 'oort_cloud',
                    name: 'Oort Cloud',
                    radius_au: neptuneZone.radius_au * 2.5,
                    color: '#1A1A2E'
                };
                this.createOortCloud(oortZone);
            }
        }
        
        // Create comets after planets
        this.createComets();
        
        // Initialize resource particle visualization for all planets
        // Metal and slag particles spawn from planet position and drift into orbit
        this.initResourceParticles();
    }
    
    createComets() {
        // Create random number of comets between 4-8 with highly elliptical orbits
        const cometCount = 4 + Math.floor(Math.random() * 5); // 4 to 8 comets
        const cometColors = [0xE0E0E0, 0xD0D0D0, 0xF0F0F0, 0xC8C8C8, 0xE8E8E8, 0xD8D8D8];
        
        // Get Kuiper and Oort belt distances for reference
        const kuiperOrbitKm = this.planetData.kuiper?.orbit_km || 135 * this.AU_KM;
        const oortOrbitKm = this.planetData.oort?.orbit_km || 300 * this.AU_KM;
        const oortOuterKm = this.planetData.oort_outer?.orbit_km || 420 * this.AU_KM;
        
        for (let i = 0; i < cometCount; i++) {
            // Generate orbital elements for highly elliptical orbit
            // Eccentricity: 0.7 to 0.95 (highly elliptical)
            const eccentricity = 0.7 + Math.random() * 0.25;
            
            // Target orbital period: 10-30 years for visible movement
            const targetPeriodYears = 10 + Math.random() * 20; // 10 to 30 years
            
            // Calculate required semi-major axis from period using Kepler's law: T^2 ∝ a^3
            // T (years) = sqrt(a^3), so a = (T^2)^(1/3) in AU
            // Then convert to km
            const targetSemiMajorAxisAU = Math.pow(targetPeriodYears * targetPeriodYears, 1/3);
            const targetSemiMajorAxisKm = targetSemiMajorAxisAU * this.AU_KM;
            
            // Perihelion: close to inner planets (Mercury to Mars range)
            const desiredPerihelionKm = this.planetData.mercury.orbit_km + Math.random() * (this.planetData.mars.orbit_km - this.planetData.mercury.orbit_km);
            
            // Calculate semi-major axis needed for this perihelion: perihelion = a * (1 - e)
            const perihelionBasedSemiMajorAxisKm = desiredPerihelionKm / (1 - eccentricity);
            
            // Use the larger of the two to ensure we get the desired period while keeping perihelion close
            // This ensures comets have visible movement (10-30 year periods) while still passing close to sun
            const finalSemiMajorAxisKm = Math.max(targetSemiMajorAxisKm, perihelionBasedSemiMajorAxisKm);
            
            // Calculate actual perihelion and aphelion from final semi-major axis
            const perihelionKm = finalSemiMajorAxisKm * (1 - eccentricity);
            const aphelionKm = finalSemiMajorAxisKm * (1 + eccentricity);
            
            // Inclination: vary widely including polar orbits (0 to 180 degrees, but avoid retrograde)
            // Use 0 to 90 degrees for prograde, with emphasis on high inclinations for polar orbits
            const inclination = Math.random() < 0.5 
                ? Math.random() * Math.PI / 2  // 0 to 90 degrees (some low inclination)
                : Math.PI / 2 - Math.random() * Math.PI / 4; // 45 to 90 degrees (more polar orbits)
            
            // Longitude of ascending node: evenly distributed right ascension angles (0 to 2π)
            // Each comet gets a different right ascension angle, evenly spaced around the circle
            const longitudeOfAscendingNode = (i / cometCount) * Math.PI * 2;
            
            // Argument of periapsis: where the closest approach occurs
            const argumentOfPeriapsis = Math.random() * Math.PI * 2;
            
            // Mean anomaly: starting position in orbit
            const meanAnomaly = Math.random() * Math.PI * 2;
            
            // Convert to visual scale
            const perihelionAU = perihelionKm / this.AU_KM;
            const aphelionAU = aphelionKm / this.AU_KM;
            const perihelionVisual = this.scaleAUToVisual(perihelionAU);
            const aphelionVisual = this.scaleAUToVisual(aphelionAU);
            const semiMajorAxisVisual = (perihelionVisual + aphelionVisual) / 2;
            
            // Create comet sphere (small moon-sized)
            const cometRadius = 0.015 + Math.random() * 0.005; // 0.015 to 0.02
            const cometGeometry = new THREE.SphereGeometry(cometRadius, 16, 16);
            const cometColor = cometColors[Math.floor(Math.random() * cometColors.length)];
            const cometMaterial = new THREE.MeshStandardMaterial({
                color: cometColor,
                metalness: 0.1,
                roughness: 0.9,
                emissive: 0x222222,
                emissiveIntensity: 0.2
            });
            
            const comet = new THREE.Mesh(cometGeometry, cometMaterial);
            
            // Calculate initial position using Kepler's equation
            const initialPosition = this.calculateCometPosition(
                semiMajorAxisVisual,
                eccentricity,
                inclination,
                argumentOfPeriapsis,
                meanAnomaly,
                longitudeOfAscendingNode
            );
            comet.position.copy(initialPosition);
            
            // Calculate actual orbital period using Kepler's law: T^2 ∝ a^3
            // T (days) = sqrt((a/AU)^3) * 365.25
            const finalSemiMajorAxisAU = finalSemiMajorAxisKm / this.AU_KM;
            const orbitalPeriodDays = Math.sqrt(Math.pow(finalSemiMajorAxisAU, 3)) * 365.25;
            
            // Calculate orbital speed similar to planets (radians per second)
            // Use Kepler's law approximation: speed ∝ 1/sqrt(period)
            const orbitalSpeed = 0.01 / Math.sqrt(orbitalPeriodDays / 365.25);
            
            // Store orbital data
            comet.userData = {
                semiMajorAxis: semiMajorAxisVisual,
                eccentricity: eccentricity,
                inclination: inclination,
                longitudeOfAscendingNode: longitudeOfAscendingNode,
                argumentOfPeriapsis: argumentOfPeriapsis,
                meanAnomaly: meanAnomaly,
                perihelion: perihelionVisual,
                aphelion: aphelionVisual,
                orbitalPeriod: orbitalPeriodDays,
                orbitalSpeed: orbitalSpeed, // Radians per second for animation
                targetPeriodYears: targetPeriodYears // Store target period for reference (10-30 years)
            };
            
            this.comets.push(comet);
            this.scene.add(comet);
            
            // Create dotted orbital path
            this.createCometOrbit(comet.userData, i);
        }
    }
    
    createCometOrbit(orbitalData, cometIndex) {
        // Create dotted line for comet orbit
        const points = [];
        const segments = 2056; // Increased segments for smoother ellipse
        const dashSize = 0.1;
        const gapSize = 0.05;
        
        for (let i = 0; i <= segments; i++) {
            const t = (i / segments) * Math.PI * 2;
            const meanAnomaly = t;
            const position = this.calculateCometPosition(
                orbitalData.semiMajorAxis,
                orbitalData.eccentricity,
                orbitalData.inclination,
                orbitalData.argumentOfPeriapsis,
                meanAnomaly,
                orbitalData.longitudeOfAscendingNode || 0
            );
            points.push(position);
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        // Use LineDashedMaterial for dotted effect
        // Darkened to prevent bloom
        const material = new THREE.LineDashedMaterial({
            color: 0x444444,
            dashSize: dashSize,
            gapSize: gapSize,
            opacity: 0.35,
            transparent: true
        });
        
        const orbit = new THREE.Line(geometry, material);
        orbit.computeLineDistances(); // Required for LineDashedMaterial
        
        this.cometOrbits[cometIndex] = orbit;
        this.scene.add(orbit);
    }
    
    calculateCometPosition(semiMajorAxis, eccentricity, inclination, argumentOfPeriapsis, meanAnomaly, longitudeOfAscendingNode = 0) {
        // Solve Kepler's equation: M = E - e*sin(E) for eccentric anomaly E
        let eccentricAnomaly = meanAnomaly;
        for (let i = 0; i < 10; i++) {
            eccentricAnomaly = meanAnomaly + eccentricity * Math.sin(eccentricAnomaly);
        }
        
        // Calculate true anomaly
        const trueAnomaly = 2 * Math.atan2(
            Math.sqrt(1 + eccentricity) * Math.sin(eccentricAnomaly / 2),
            Math.sqrt(1 - eccentricity) * Math.cos(eccentricAnomaly / 2)
        );
        
        // Calculate distance from focus (sun)
        const distance = semiMajorAxis * (1 - eccentricity * eccentricity) / (1 + eccentricity * Math.cos(trueAnomaly));
        
        // Calculate position in orbital plane (perifocal coordinates)
        const xPeri = distance * Math.cos(trueAnomaly);
        const yPeri = distance * Math.sin(trueAnomaly);
        const zPeri = 0;
        
        // Apply orbital rotations:
        // 1. Rotate around z-axis by argument of periapsis
        // 2. Rotate around x-axis by inclination
        // 3. Rotate around z-axis by longitude of ascending node
        const cosArg = Math.cos(argumentOfPeriapsis);
        const sinArg = Math.sin(argumentOfPeriapsis);
        const cosInc = Math.cos(inclination);
        const sinInc = Math.sin(inclination);
        const cosLan = Math.cos(longitudeOfAscendingNode);
        const sinLan = Math.sin(longitudeOfAscendingNode);
        
        // Step 1: Rotate by argument of periapsis
        const x1 = xPeri * cosArg - yPeri * sinArg;
        const y1 = xPeri * sinArg + yPeri * cosArg;
        const z1 = zPeri;
        
        // Step 2: Rotate by inclination
        const x2 = x1;
        const y2 = y1 * cosInc - z1 * sinInc;
        const z2 = y1 * sinInc + z1 * cosInc;
        
        // Step 3: Rotate by longitude of ascending node
        const xRot = x2 * cosLan - y2 * sinLan;
        const yRot = x2 * sinLan + y2 * cosLan;
        const zRot = z2;
        
        return new THREE.Vector3(xRot, yRot, zRot);
    }

    /**
     * Create solid color material for planets (no textures)
     * Each planet type gets an appropriate solid color
     * @param {string} planetId - The planet identifier
     * @param {string} baseColor - The base color from orbital_mechanics.json
     * @returns {THREE.Material} The planet material
     */
    createPlanetMaterial(planetId, baseColor) {
        // Planet color mappings - using appropriate solid colors
        const planetColors = {
            'jupiter': 0xD4A574,      // Tan/orange
            'saturn': 0xF5E8D0,       // Pale yellow/cream
            'uranus': 0x72D0D8,       // Cyan
            'neptune': 0x4466EE,      // Deep blue
            'earth': 0x1E5799,        // Blue (ocean)
            'mars': 0xC1440E,         // Rusty red
            'venus': 0xE8C87A,        // Yellow-orange
            'mercury': 0x8C8C8C       // Grey
        };
        
        // Use planet-specific color if available, otherwise use baseColor
        const colorHex = planetColors[planetId] || baseColor;
        const color = typeof colorHex === 'number' ? colorHex : new THREE.Color(colorHex).getHex();
        
        // Create simple MeshStandardMaterial with solid color
        return new THREE.MeshStandardMaterial({
            color: color,
            metalness: 0.1,
            roughness: 0.9,
            emissive: 0x000000,
            transparent: false
        });
    }

    createPlanet(zone) {
        // Use the color from orbital_mechanics.json
        const color = zone.color || '#888888';
        
        // Get planet data for radius
        const planetInfo = this.planetData[zone.id];
        let planetRadius;
        let orbitRadius;
        
        if (planetInfo) {
            // Use unified scaling (converts km to AU first)
            const orbitAU = planetInfo.orbit_km / this.AU_KM;
            orbitRadius = this.scaleAUToVisual(orbitAU);
            
            // Use mass-based scaling for gas giants to make them proportionally larger
            // This makes their moons appear more appropriately sized relative to Earth
            if (this.gasGiants && this.gasGiants.includes(zone.id) && planetInfo.mass_kg) {
                planetRadius = this.massScaleRadius(planetInfo.mass_kg);
            } else {
                // Use log-scaled real radius for rocky planets
                planetRadius = this.logScaleRadius(planetInfo.radius_km);
            }
        } else {
            // Fallback for zones without planet data (use AU-based scaling)
            planetRadius = this.logScaleRadius(6371); // Default to Earth size
            orbitRadius = zone.radius_au * 2.0; // Fallback scaling
        }
        
        // Ensure minimum visible size - rocky planets get larger minimum to be visually distinct
        // Mercury was appearing as just a dot due to log scaling compressing its size too much
        if (this.rockyPlanets && this.rockyPlanets.includes(zone.id)) {
            // Rocky planets get a larger minimum size (0.12) to appear as proper planets
            planetRadius = Math.max(0.12, planetRadius * 1.5);
        } else if (!this.gasGiants || !this.gasGiants.includes(zone.id)) {
            // Non-gas-giants get minimum size (gas giants already handled by mass scaling)
            planetRadius = Math.max(0.08, planetRadius);
        }
        
        // Create 3D planet sphere with higher detail for gas giants
        const segments = this.gasGiants && this.gasGiants.includes(zone.id) ? 64 : 32;
        const planetGeometry = new THREE.SphereGeometry(planetRadius, segments, segments);
        
        // Create procedural textured material for specific planets, or standard material for others
        const planetMaterial = this.createPlanetMaterial(zone.id, color);
        
        const planet = new THREE.Mesh(planetGeometry, planetMaterial);
        
        // Enable shadows for planets
        planet.castShadow = true;
        planet.receiveShadow = true;
        
        // Position on positive X axis (will orbit)
        planet.position.set(orbitRadius, 0, 0);
        
        // Orbital speed based on real orbital period (simplified)
        const orbitalPeriodDays = this.getOrbitalPeriod(zone.id);
        const orbitalSpeed = 0.01 / Math.sqrt(orbitalPeriodDays / 365.25); // Kepler's law approximation
        
        planet.userData = {
            zoneId: zone.id,
            radius: orbitRadius,
            orbitalAngle: 0,
            orbitalSpeed: orbitalSpeed,
            originalColor: color,
            originalRadius: planetRadius // Store original radius for scaling
        };

        this.planets[zone.id] = planet;
        this.scene.add(planet);
        
        // Add Fresnel atmosphere for Earth-like planets
        const atmospherePlanets = ['earth', 'venus', 'jupiter', 'saturn', 'uranus', 'neptune'];
        if (atmospherePlanets.includes(zone.id)) {
            this.createPlanetAtmosphere(zone, planet, planetRadius);
        }
        
        // Create rings for Jupiter, Saturn and Uranus
        if (zone.id === 'jupiter' || zone.id === 'saturn' || zone.id === 'uranus') {
            this.createPlanetRings(zone, planet, planetRadius, orbitRadius);
        }
    }

    createPlanetAtmosphere(zone, planet, planetRadius) {
        // Atmosphere colors based on planet type
        const atmosphereColors = {
            earth: new THREE.Color(0.3, 0.6, 1.0),    // Blue
            venus: new THREE.Color(1.0, 0.8, 0.5),     // Yellow-orange haze
            jupiter: new THREE.Color(0.8, 0.6, 0.4),   // Brown-orange bands
            saturn: new THREE.Color(0.9, 0.8, 0.6),    // Pale yellow
            uranus: new THREE.Color(0.4, 0.8, 0.9),    // Cyan
            neptune: new THREE.Color(0.2, 0.4, 1.0)    // Deep blue
        };
        
        const atmosphereColor = atmosphereColors[zone.id] || new THREE.Color(0.5, 0.7, 1.0);
        const atmosphereScale = zone.id === 'venus' ? 1.15 : 1.08; // Venus has thicker atmosphere
        
        const atmosphereGeometry = new THREE.SphereGeometry(planetRadius * atmosphereScale, 32, 32);
        const atmosphereMaterial = new THREE.ShaderMaterial({
            uniforms: {
                atmosphereColor: { value: atmosphereColor },
                sunPosition: { value: new THREE.Vector3(0, 0, 0) },
                intensity: { value: zone.id === 'venus' ? 0.8 : 0.6 }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying vec3 vWorldPosition;
                
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    vPosition = position;
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 atmosphereColor;
                uniform vec3 sunPosition;
                uniform float intensity;
                
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying vec3 vWorldPosition;
                
                void main() {
                    // Calculate view direction
                    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
                    
                    // Fresnel effect - edges glow more than center
                    float fresnel = pow(1.0 - abs(dot(viewDirection, vNormal)), 3.0);
                    
                    // Sun-facing side is brighter
                    vec3 sunDirection = normalize(sunPosition - vWorldPosition);
                    float sunFacing = max(0.0, dot(vNormal, sunDirection)) * 0.3 + 0.7;
                    
                    // Combine effects
                    float alpha = fresnel * intensity * sunFacing;
                    
                    // Add subtle color variation based on view angle
                    vec3 finalColor = atmosphereColor * (1.0 + fresnel * 0.3);
                    
                    gl_FragColor = vec4(finalColor, alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            depthWrite: false
        });
        
        const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
        planet.add(atmosphere);
        
        // Store reference for updates
        planet.userData.atmosphere = atmosphere;
    }

    createPlanetRings(zone, planet, planetRadius, orbitRadius) {
        // Ring configurations for each planet
        const ringConfigs = {
            jupiter: {
                // Jupiter's ring system - very faint, mostly dust
                // Main ring: 122,500 - 129,000 km (1.72x - 1.81x Jupiter radius)
                // Halo ring: 92,000 - 122,500 km (1.29x - 1.72x)
                // Gossamer rings extend to ~3.2x Jupiter radius
                innerRadius: planetRadius * 1.29,
                outerRadius: planetRadius * 2.5,
                tilt: 3.13 * Math.PI / 180, // Jupiter's small axial tilt
                rings: [
                    // Halo ring (inner torus, very faint)
                    { start: 0.0, end: 0.25, opacity: 0.08, color: [0.45, 0.35, 0.28] },
                    // Main ring (brightest part, but still faint)
                    { start: 0.25, end: 0.35, opacity: 0.18, color: [0.5, 0.4, 0.32] },
                    // Amalthea gossamer ring
                    { start: 0.35, end: 0.55, opacity: 0.06, color: [0.42, 0.33, 0.26] },
                    // Thebe gossamer ring (outermost, extremely faint)
                    { start: 0.55, end: 1.0, opacity: 0.03, color: [0.38, 0.30, 0.24] }
                ],
                particleCount: 15000,
                brightness: 0.25  // Very dim compared to Saturn, reduced to prevent bloom
            },
            saturn: {
                // Saturn's rings extend from ~1.2x to ~2.3x the planet radius
                innerRadius: planetRadius * 1.2,
                outerRadius: planetRadius * 2.3,
                tilt: 26.73 * Math.PI / 180, // Saturn's axial tilt
                rings: [
                    // D Ring (innermost, very faint)
                    { start: 0.0, end: 0.06, opacity: 0.15, color: [0.82, 0.75, 0.65] },
                    // C Ring (crepe ring, dim)
                    { start: 0.06, end: 0.22, opacity: 0.35, color: [0.75, 0.68, 0.55] },
                    // B Ring (brightest, densest)
                    { start: 0.22, end: 0.50, opacity: 0.85, color: [0.95, 0.88, 0.75] },
                    // Cassini Division (gap)
                    { start: 0.50, end: 0.54, opacity: 0.08, color: [0.3, 0.25, 0.2] },
                    // A Ring (outer bright ring)
                    { start: 0.54, end: 0.78, opacity: 0.7, color: [0.88, 0.82, 0.68] },
                    // Encke Gap (thin gap in A ring)
                    { start: 0.70, end: 0.72, opacity: 0.1, color: [0.3, 0.25, 0.2] },
                    // F Ring (narrow outer ring)
                    { start: 0.82, end: 0.86, opacity: 0.5, color: [0.85, 0.78, 0.65] },
                    // G Ring (faint)
                    { start: 0.88, end: 0.93, opacity: 0.2, color: [0.7, 0.65, 0.55] },
                    // E Ring (outermost, very faint)
                    { start: 0.95, end: 1.0, opacity: 0.1, color: [0.65, 0.62, 0.55] }
                ],
                particleCount: 50000,
                brightness: 0.7  // Reduced from 1.2 to prevent bloom
            },
            uranus: {
                // Uranus rings are narrower and fainter
                innerRadius: planetRadius * 1.5,
                outerRadius: planetRadius * 2.0,
                tilt: 97.77 * Math.PI / 180, // Uranus is tilted on its side!
                rings: [
                    // Zeta Ring (innermost)
                    { start: 0.0, end: 0.08, opacity: 0.15, color: [0.35, 0.4, 0.45] },
                    // 6, 5, 4 Rings
                    { start: 0.10, end: 0.14, opacity: 0.3, color: [0.3, 0.35, 0.42] },
                    { start: 0.16, end: 0.19, opacity: 0.25, color: [0.32, 0.37, 0.43] },
                    { start: 0.21, end: 0.24, opacity: 0.28, color: [0.3, 0.36, 0.42] },
                    // Alpha Ring
                    { start: 0.28, end: 0.34, opacity: 0.35, color: [0.33, 0.38, 0.45] },
                    // Beta Ring
                    { start: 0.38, end: 0.44, opacity: 0.38, color: [0.35, 0.4, 0.47] },
                    // Eta Ring
                    { start: 0.48, end: 0.52, opacity: 0.3, color: [0.32, 0.38, 0.44] },
                    // Gamma Ring
                    { start: 0.56, end: 0.60, opacity: 0.32, color: [0.34, 0.39, 0.46] },
                    // Delta Ring
                    { start: 0.64, end: 0.70, opacity: 0.35, color: [0.36, 0.41, 0.48] },
                    // Lambda Ring
                    { start: 0.74, end: 0.77, opacity: 0.22, color: [0.3, 0.35, 0.42] },
                    // Epsilon Ring (brightest of Uranus' rings)
                    { start: 0.82, end: 0.92, opacity: 0.55, color: [0.4, 0.45, 0.52] },
                    // Nu and Mu Rings (outer, very faint)
                    { start: 0.95, end: 1.0, opacity: 0.12, color: [0.28, 0.33, 0.4] }
                ],
                particleCount: 25000,
                brightness: 0.4  // Reduced from 0.7 to prevent bloom
            }
        };
        
        const config = ringConfigs[zone.id];
        if (!config) return;
        
        // Create ring using custom shader for realistic appearance
        const ringGroup = new THREE.Group();
        
        // Create ring geometry with radial segments for structure
        const ringGeometry = new THREE.RingGeometry(
            config.innerRadius,
            config.outerRadius,
            256,  // theta segments (around the ring)
            64    // phi segments (radial)
        );
        
        // Create shader material for detailed ring structure
        const ringMaterial = new THREE.ShaderMaterial({
            uniforms: {
                innerRadius: { value: config.innerRadius },
                outerRadius: { value: config.outerRadius },
                ringData: { value: this.createRingDataTexture(config.rings) },
                brightness: { value: config.brightness },
                time: { value: 0 }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vPosition;
                varying float vDistFromCenter;
                
                void main() {
                    vUv = uv;
                    vPosition = position;
                    vDistFromCenter = length(position.xy);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float innerRadius;
                uniform float outerRadius;
                uniform sampler2D ringData;
                uniform float brightness;
                uniform float time;
                
                varying vec2 vUv;
                varying vec3 vPosition;
                varying float vDistFromCenter;
                
                // Noise function for ring texture variation
                float noise(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                }
                
                void main() {
                    // Calculate radial position (0 = inner edge, 1 = outer edge)
                    float radialPos = (vDistFromCenter - innerRadius) / (outerRadius - innerRadius);
                    radialPos = clamp(radialPos, 0.0, 1.0);
                    
                    // Sample ring data texture for color and opacity
                    vec4 ringInfo = texture2D(ringData, vec2(radialPos, 0.5));
                    
                    // Add subtle noise for particle-like texture
                    float angle = atan(vPosition.y, vPosition.x);
                    float noiseVal = noise(vec2(angle * 100.0, radialPos * 50.0 + time * 0.01));
                    float noiseVal2 = noise(vec2(angle * 200.0 + 1.0, radialPos * 100.0));
                    
                    // Create fine structure with multiple noise scales
                    float fineStructure = 0.85 + 0.15 * noiseVal;
                    float microStructure = 0.9 + 0.1 * noiseVal2;
                    
                    // Apply radial streaking effect
                    float streak = 0.95 + 0.05 * sin(angle * 500.0);
                    
                    // Combine for final color with brightness adjustment
                    vec3 color = ringInfo.rgb * brightness * fineStructure * microStructure * streak;
                    
                    // Calculate final opacity with structure
                    float alpha = ringInfo.a * fineStructure * microStructure;
                    
                    // Edge softening
                    float edgeFade = smoothstep(0.0, 0.02, radialPos) * smoothstep(1.0, 0.98, radialPos);
                    alpha *= edgeFade;
                    
                    // Discard very transparent pixels
                    if (alpha < 0.01) discard;
                    
                    gl_FragColor = vec4(color, alpha);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.NormalBlending
        });
        
        const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
        
        // Rotate ring to planet's equatorial plane
        ringMesh.rotation.x = Math.PI / 2; // Lay flat first
        
        ringGroup.add(ringMesh);
        
        // Apply planet's axial tilt to the ring group
        ringGroup.rotation.x = config.tilt;
        
        // Random rotation around Y for visual variety
        ringGroup.rotation.y = Math.random() * Math.PI * 2;
        
        // Store ring reference for updates
        if (!this.planetRings) this.planetRings = {};
        this.planetRings[zone.id] = {
            group: ringGroup,
            mesh: ringMesh,
            config: config
        };
        
        // Add ring group to planet so it moves with the planet
        planet.add(ringGroup);
        
        // Add particle-based ring for extra detail (Saturn only, for performance)
        if (zone.id === 'saturn') {
            this.createRingParticles(zone, planet, config);
        }
    }
    
    createRingDataTexture(rings) {
        // Create a 1D texture (256 pixels wide) encoding ring color and opacity
        const width = 256;
        const data = new Uint8Array(width * 4);
        
        for (let i = 0; i < width; i++) {
            const radialPos = i / width;
            
            // Find which ring section this pixel belongs to
            let color = [0, 0, 0];
            let opacity = 0;
            
            for (const ring of rings) {
                if (radialPos >= ring.start && radialPos <= ring.end) {
                    color = ring.color;
                    
                    // Add smooth transitions at ring edges
                    const ringWidth = ring.end - ring.start;
                    const posInRing = (radialPos - ring.start) / ringWidth;
                    const edgeFade = smoothstep(0, 0.1, posInRing) * smoothstep(1, 0.9, posInRing);
                    
                    opacity = ring.opacity * edgeFade;
                    break;
                }
            }
            
            data[i * 4] = Math.floor(color[0] * 255);
            data[i * 4 + 1] = Math.floor(color[1] * 255);
            data[i * 4 + 2] = Math.floor(color[2] * 255);
            data[i * 4 + 3] = Math.floor(opacity * 255);
        }
        
        const texture = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
        texture.needsUpdate = true;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        
        return texture;
        
        // Helper function for smooth interpolation
        function smoothstep(edge0, edge1, x) {
            const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
            return t * t * (3 - 2 * t);
        }
    }
    
    createRingParticles(zone, planet, config) {
        // Create particle system for extra ring detail
        const particleCount = config.particleCount;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        
        for (let i = 0; i < particleCount; i++) {
            // Random angle
            const angle = Math.random() * Math.PI * 2;
            
            // Random radius within ring bounds, weighted by ring density
            let radius, ringOpacity;
            let attempts = 0;
            do {
                radius = config.innerRadius + Math.random() * (config.outerRadius - config.innerRadius);
                const radialPos = (radius - config.innerRadius) / (config.outerRadius - config.innerRadius);
                
                // Find ring opacity at this position
                ringOpacity = 0;
                for (const ring of config.rings) {
                    if (radialPos >= ring.start && radialPos <= ring.end) {
                        ringOpacity = ring.opacity;
                        break;
                    }
                }
                attempts++;
            } while (Math.random() > ringOpacity && attempts < 10);
            
            positions[i * 3] = Math.cos(angle) * radius;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 0.02 * config.innerRadius; // Thin ring
            positions[i * 3 + 2] = Math.sin(angle) * radius;
            
            // Color matches ring
            const radialPos = (radius - config.innerRadius) / (config.outerRadius - config.innerRadius);
            let particleColor = [0.85, 0.78, 0.65]; // Default Saturn gold
            for (const ring of config.rings) {
                if (radialPos >= ring.start && radialPos <= ring.end) {
                    particleColor = ring.color;
                    break;
                }
            }
            
            colors[i * 3] = particleColor[0] * (0.9 + Math.random() * 0.2);
            colors[i * 3 + 1] = particleColor[1] * (0.9 + Math.random() * 0.2);
            colors[i * 3 + 2] = particleColor[2] * (0.9 + Math.random() * 0.2);
            
            sizes[i] = 0.002 + Math.random() * 0.004;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        const material = new THREE.PointsMaterial({
            size: 0.003,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        const particles = new THREE.Points(geometry, material);
        
        // Apply same rotation as ring mesh
        particles.rotation.x = config.tilt;
        particles.rotation.y = this.planetRings[zone.id].group.rotation.y;
        
        planet.add(particles);
        this.planetRings[zone.id].particles = particles;
    }

    createMoons(zone) {
        // Moon data for planets that have significant moons
        // Real orbital data used where available:
        // - orbit_km: actual orbital semi-major axis in km
        // - radius_km: actual moon radius in km
        // - period_days: orbital period in days (for speed calculation)
        // - inclination: orbital inclination in degrees (relative to planet's equator)
        // Moon data with mass in kg for mass-proportional sizing
        // Mass values from NASA planetary fact sheets
        const moonData = {
            earth: [
                // Earth's Moon - 0.0123 Earth masses
                { name: 'Moon', orbit_km: 384400, radius_km: 1737, mass_kg: 7.35e22, color: '#A8A8A0', period_days: 27.32, inclination: 5.14 }
            ],
            mars: [
                // Mars's tiny captured asteroid moons
                { name: 'Phobos', orbit_km: 9376, radius_km: 11.3, mass_kg: 1.07e16, color: '#4A4A48', period_days: 0.319, inclination: 1.08 },
                { name: 'Deimos', orbit_km: 23460, radius_km: 6.2, mass_kg: 1.48e15, color: '#525250', period_days: 1.263, inclination: 1.79 }
            ],
            jupiter: [
                // Jupiter's moons - ordered by orbital distance
                // Inner moons (tiny ring shepherds)
                { name: 'Metis', orbit_km: 128000, radius_km: 22, mass_kg: 3.6e16, color: '#8B8B83', period_days: 0.29, inclination: 0.02 },
                { name: 'Adrastea', orbit_km: 129000, radius_km: 8, mass_kg: 2.0e15, color: '#8B8378', period_days: 0.30, inclination: 0.03 },
                { name: 'Amalthea', orbit_km: 181366, radius_km: 84, mass_kg: 2.1e18, color: '#CD5C5C', period_days: 0.50, inclination: 0.37 },
                { name: 'Thebe', orbit_km: 221889, radius_km: 50, mass_kg: 4.3e17, color: '#B0B0B0', period_days: 0.67, inclination: 1.08 },
                // Galilean moons (the big four) - Io and Europa are roughly Moon-mass, Ganymede is larger
                { name: 'Io', orbit_km: 421700, radius_km: 1822, mass_kg: 8.93e22, color: '#FFCC00', period_days: 1.77, inclination: 0.04 },           // 0.015 Earth masses
                { name: 'Europa', orbit_km: 671034, radius_km: 1561, mass_kg: 4.80e22, color: '#B8D4E8', period_days: 3.55, inclination: 0.47 },       // 0.008 Earth masses
                { name: 'Ganymede', orbit_km: 1070412, radius_km: 2634, mass_kg: 1.48e23, color: '#8B8878', period_days: 7.15, inclination: 0.18 },    // 0.025 Earth masses - largest moon!
                { name: 'Callisto', orbit_km: 1882709, radius_km: 2410, mass_kg: 1.08e23, color: '#5D5D5D', period_days: 16.69, inclination: 0.19 }    // 0.018 Earth masses
            ],
            saturn: [
                // Saturn's major moons
                { name: 'Mimas', orbit_km: 185520, radius_km: 198, mass_kg: 3.75e19, color: '#C0C0C0', period_days: 0.94, inclination: 1.5 },
                { name: 'Enceladus', orbit_km: 237948, radius_km: 252, mass_kg: 1.08e20, color: '#F0F8FF', period_days: 1.37, inclination: 0.02 },
                { name: 'Tethys', orbit_km: 294619, radius_km: 531, mass_kg: 6.17e20, color: '#F5F5F5', period_days: 1.89, inclination: 1.1 },
                { name: 'Dione', orbit_km: 377396, radius_km: 561, mass_kg: 1.10e21, color: '#E8E8E8', period_days: 2.74, inclination: 0.02 },
                { name: 'Rhea', orbit_km: 527108, radius_km: 764, mass_kg: 2.31e21, color: '#D3D3D3', period_days: 4.52, inclination: 0.35 },
                { name: 'Titan', orbit_km: 1221870, radius_km: 2575, mass_kg: 1.35e23, color: '#FFA500', period_days: 15.95, inclination: 0.33 },      // 0.023 Earth masses - 2nd largest moon
                { name: 'Hyperion', orbit_km: 1481010, radius_km: 135, mass_kg: 5.6e18, color: '#A89078', period_days: 21.28, inclination: 0.43 },
                { name: 'Iapetus', orbit_km: 3560820, radius_km: 735, mass_kg: 1.81e21, color: '#8B4513', period_days: 79.32, inclination: 15.47 }
            ],
            uranus: [
                // Uranus moons - orbit in Uranus's equatorial plane (tilted ~98°)
                { name: 'Miranda', orbit_km: 129390, radius_km: 236, mass_kg: 6.59e19, color: '#A9A9A9', period_days: 1.41, inclination: 4.2 },
                { name: 'Ariel', orbit_km: 190900, radius_km: 579, mass_kg: 1.35e21, color: '#D3D3D3', period_days: 2.52, inclination: 0.04 },
                { name: 'Umbriel', orbit_km: 266000, radius_km: 585, mass_kg: 1.17e21, color: '#696969', period_days: 4.14, inclination: 0.13 },
                { name: 'Titania', orbit_km: 435910, radius_km: 789, mass_kg: 3.53e21, color: '#B0C4DE', period_days: 8.71, inclination: 0.08 },
                { name: 'Oberon', orbit_km: 583520, radius_km: 761, mass_kg: 3.01e21, color: '#778899', period_days: 13.46, inclination: 0.07 }
            ],
            neptune: [
                { name: 'Triton', orbit_km: 354760, radius_km: 1353, mass_kg: 2.14e22, color: '#E0E0E0', period_days: 5.88, inclination: 156.9 },      // 0.0036 Earth masses
                { name: 'Proteus', orbit_km: 117647, radius_km: 210, mass_kg: 4.4e19, color: '#808080', period_days: 1.12, inclination: 0.08 }
            ],
            kuiper: [
                // Pluto's moons
                { name: 'Charon', orbit_km: 19591, radius_km: 606, mass_kg: 1.59e21, color: '#A0A0A0', period_days: 6.387, inclination: 0.08 },
                { name: 'Nix', orbit_km: 48694, radius_km: 25, mass_kg: 4.5e16, color: '#C8C8C8', period_days: 24.85, inclination: 0.13 },
                { name: 'Hydra', orbit_km: 64738, radius_km: 33, mass_kg: 4.8e16, color: '#D0D0D0', period_days: 38.2, inclination: 0.24 },
                { name: 'Kerberos', orbit_km: 57783, radius_km: 12, mass_kg: 1.65e16, color: '#B8B8B8', period_days: 32.17, inclination: 0.39 },
                { name: 'Styx', orbit_km: 42656, radius_km: 8, mass_kg: 7.5e15, color: '#C0C0C0', period_days: 20.16, inclination: 0.81 }
            ]
        };
        
        // Planet axial tilts for moon orbital planes
        const planetTilts = {
            earth: 23.44 * Math.PI / 180,
            mars: 25.19 * Math.PI / 180,
            jupiter: 3.13 * Math.PI / 180,
            saturn: 26.73 * Math.PI / 180,  // Same as ring tilt
            uranus: 97.77 * Math.PI / 180,  // Same as ring tilt
            neptune: 28.32 * Math.PI / 180,
            kuiper: 122.53 * Math.PI / 180  // Pluto's extreme axial tilt (rotates on its side like Uranus)
        };

        const planet = this.planets[zone.id];
        if (!planet || !moonData[zone.id]) return;

        const planetInfo = this.planetData[zone.id];
        if (!planetInfo) return;

        // Use mass-based scaling for gas giants for consistent sizing with planets
        let planetRadius;
        if (this.gasGiants && this.gasGiants.includes(zone.id) && planetInfo.mass_kg) {
            planetRadius = this.massScaleRadius(planetInfo.mass_kg);
        } else {
            planetRadius = this.logScaleRadius(planetInfo.radius_km);
        }
        const planetRadiusKm = planetInfo.radius_km;
        
        // Get planet's axial tilt
        const planetTilt = planetTilts[zone.id] || 0;
        
        this.moons[zone.id] = [];
        
        const moons = moonData[zone.id];
        const moonCount = moons.length;

        moons.forEach((moon, index) => {
            // Calculate orbit distance using log scaling of actual orbital distance
            // Scale relative to planet's visual radius
            const orbitRatioReal = moon.orbit_km / planetRadiusKm;
            
            // Use a compressed log scale for moon orbits to keep them visible
            // but maintain relative ordering and spacing
            // Earth and Mars get larger orbit multipliers since their moons need more separation
            let minOrbitMultiplier, maxOrbitMultiplier;
            if (zone.id === 'earth') {
                // Earth's Moon needs to be clearly separated from Earth
                minOrbitMultiplier = 12.0; // 3x increase: 4.0 * 3
                maxOrbitMultiplier = 18.0; // 3x increase: 6.0 * 3
            } else if (zone.id === 'mars') {
                // Mars's tiny moons need to be visible away from the planet
                minOrbitMultiplier = 10.5; // 3x increase: 3.5 * 3
                maxOrbitMultiplier = 24.0; // 3x increase: 8.0 * 3
            } else {
                // Default for gas giants and other planets
                minOrbitMultiplier = 1.8;
                maxOrbitMultiplier = 8.0;
            }
            
            // Find min/max orbit ratios for this planet's moons
            const orbitRatios = moons.map(m => m.orbit_km / planetRadiusKm);
            const minRatio = Math.min(...orbitRatios);
            const maxRatio = Math.max(...orbitRatios);
            
            // Log-scale the orbit ratio to compress large distances
            const logMin = Math.log10(minRatio);
            const logMax = Math.log10(maxRatio);
            const logCurrent = Math.log10(orbitRatioReal);
            
            // Normalize to 0-1 range
            const normalized = logMax > logMin ? (logCurrent - logMin) / (logMax - logMin) : 0.5;
            
            // Map to visual multiplier range
            const orbitMultiplier = minOrbitMultiplier + normalized * (maxOrbitMultiplier - minOrbitMultiplier);
            const moonOrbitDistance = planetRadius * orbitMultiplier;
            
            // Mass-proportional moon radius - moons with Earth-like mass appear Earth-like in size
            // This makes the Galilean moons of Jupiter appear appropriately substantial
            // Pass isMoon=true for boosted visibility
            let moonRadius;
            if (moon.mass_kg) {
                moonRadius = this.massScaleRadius(moon.mass_kg, true);
            } else {
                // Fallback to log-scaled radius if no mass data (with boost)
                moonRadius = Math.max(0.06, this.logScaleRadius(moon.radius_km) * 2.0);
            }
            
            const moonGeometry = new THREE.SphereGeometry(moonRadius, 16, 16);
            const moonMaterial = new THREE.MeshStandardMaterial({
                color: new THREE.Color(moon.color).multiplyScalar(0.6),
                metalness: 0.1,
                roughness: 0.9,
                transparent: true,
                opacity: 1.0
            });
            
            const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
            
            // Enable shadows for moons
            moonMesh.castShadow = true;
            moonMesh.receiveShadow = true;
            
            // Space out initial positions evenly around the orbit
            // Use golden angle for optimal visual distribution
            const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~137.5 degrees
            const initialAngle = index * goldenAngle + (zone.id === 'saturn' ? Math.PI / 4 : 0);
            
            // Moon orbital inclination (combine planet tilt with moon's own inclination)
            const moonInclination = moon.inclination * Math.PI / 180;
            
            // Calculate position in tilted orbital plane
            // First calculate position in the moon's orbital plane
            const x = Math.cos(initialAngle) * moonOrbitDistance;
            const z = Math.sin(initialAngle) * moonOrbitDistance;
            
            // Apply moon's own inclination (small perturbation)
            const y = Math.sin(initialAngle) * moonOrbitDistance * Math.sin(moonInclination);
            
            // For Saturn and Uranus, moons orbit in the equatorial plane (same as rings)
            // We'll handle the transformation in the update loop
            moonMesh.position.set(x, y, z);
            
            // Calculate orbital speed using same Kepler's law formula as planets
            // This ensures moons orbit at realistic relative speeds
            // Earth's Moon will complete ~13 orbits per Earth year (matching real 27.32 day period)
            const orbitalSpeed = 0.01 / Math.sqrt(moon.period_days / 365.25);
            
            moonMesh.userData = {
                planetZoneId: zone.id,
                moonName: moon.name,
                moonOrbitDistance: moonOrbitDistance,
                orbitalAngle: initialAngle,
                orbitalSpeed: orbitalSpeed,
                planetTilt: planetTilt,
                moonInclination: moonInclination,
                orbitInEquatorialPlane: ['mars', 'jupiter', 'saturn', 'uranus', 'kuiper'].includes(zone.id),
                // Store moon data for info display
                moonData: {
                    name: moon.name,
                    orbit_km: moon.orbit_km,
                    radius_km: moon.radius_km,
                    mass_kg: moon.mass_kg,
                    period_days: moon.period_days,
                    color: moon.color
                }
            };
            
            this.moons[zone.id].push(moonMesh);
            this.scene.add(moonMesh);
        });
    }

    getOrbitalPeriod(zoneId) {
        // Approximate orbital periods in days
        const periods = {
            mercury: 88,
            venus: 225,
            earth: 365,
            mars: 687,
            jupiter: 4333,
            saturn: 10759,
            uranus: 30688,
            neptune: 60182,
            kuiper: 90560  // Pluto's orbital period: ~248 Earth years
        };
        return periods[zoneId] || 365;
    }

    createOrbit(zone) {
        const color = zone.color || '#555555';
        
        // Get orbit radius (true distance for rocky planets, log-scaled for others)
        const planetInfo = this.planetData[zone.id];
        let orbitRadius;
        
        if (planetInfo && planetInfo.orbit_km) {
            // Use unified scaling (converts km to AU first)
            const orbitAU = planetInfo.orbit_km / this.AU_KM;
            orbitRadius = this.scaleAUToVisual(orbitAU);
        } else {
            // Fallback: use AU-based scaling
            orbitRadius = this.scaleAUToVisual(zone.radius_au);
        }
        
        // Create orbit ring manually (circle)
        const points = [];
        const segments = 512;
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push(new THREE.Vector3(
                Math.cos(angle) * orbitRadius,
                0,
                Math.sin(angle) * orbitRadius
            ));
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        const material = new THREE.LineBasicMaterial({
            color: new THREE.Color(color).multiplyScalar(0.3),
            opacity: 0.25,
            transparent: true
        });
        
        const orbit = new THREE.Line(geometry, material);
        this.orbits[zone.id] = orbit;
        this.scene.add(orbit);
    }

    createDysonOrbit(zone) {
        // Dyson sphere orbit - golden color, positioned just inside Mercury
        const color = zone.color || '#FFD700';
        
        // Dyson orbit is 0.29 AU (real value)
        // Position it just inside Mercury's visual orbit (Mercury is at 0.39 AU)
        const dysonAU = 0.29;
        const dysonOrbitRadius = this.scaleAUToVisual(dysonAU);
        
        // Store dyson orbit radius for other systems to use
        this.dysonOrbitRadius = dysonOrbitRadius;
        
        // Create orbit ring manually (circle) - use dashed line for distinctive look
        const points = [];
        const segments = 512;
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push(new THREE.Vector3(
                Math.cos(angle) * dysonOrbitRadius,
                0,
                Math.sin(angle) * dysonOrbitRadius
            ));
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        // Use dashed material for Dyson orbit to distinguish from planet orbits
        // Darkened to prevent bloom
        const material = new THREE.LineDashedMaterial({
            color: new THREE.Color(color).multiplyScalar(0.3),
            opacity: 0.4,
            transparent: true,
            dashSize: 0.3,
            gapSize: 0.15
        });
        
        const orbit = new THREE.Line(geometry, material);
        orbit.computeLineDistances(); // Required for dashed material
        this.orbits[zone.id] = orbit;
        this.scene.add(orbit);
    }

    createAsteroidBelt(zone) {
        // Asteroid belt is between Mars (1.52 AU) and Jupiter (5.2 AU)
        const marsAU = this.planetData.mars.orbit_km / this.AU_KM;
        const jupiterAU = this.planetData.jupiter.orbit_km / this.AU_KM;
        const marsOrbit = this.scaleAUToVisual(marsAU);
        const jupiterOrbit = this.scaleAUToVisual(jupiterAU);
        const innerRadius = marsOrbit * 1.1;
        const outerRadius = jupiterOrbit * 0.9;
        const color = zone.color || '#666666';
        
        // Create particle system for asteroid belt - increased count
        const particleCount = 10000; // Significantly increased for more visible asteroids
        const particles = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        
        // Store orbital data for each asteroid
        const asteroidData = [];
        
        // Calculate orbital speed for asteroid belt (at ~2.5 AU)
        // Using Kepler's law: T^2 ∝ r^3, so orbital speed ∝ 1/sqrt(r)
        // Asteroid belt at 2.5 AU: period ≈ 365.25 * (2.5)^(3/2) ≈ 1442 days
        const asteroidBeltPeriodDays = 1442; // Approximate period for 2.5 AU
        const baseOrbitalSpeed = 0.01 / Math.sqrt(asteroidBeltPeriodDays / 365.25);
        
        const colorObj = new THREE.Color(color);
        
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = innerRadius + Math.random() * (outerRadius - innerRadius);
            
            // Store orbital data for this asteroid
            // Vary orbital speed slightly based on distance (inner asteroids orbit faster)
            const normalizedDistance = (distance - innerRadius) / (outerRadius - innerRadius);
            const orbitalSpeed = baseOrbitalSpeed * (1.0 + normalizedDistance * 0.2); // 20% variation
            
            asteroidData.push({
                angle: angle,
                distance: distance,
                orbitalSpeed: orbitalSpeed,
                yOffset: (Math.random() - 0.5) * 0.8 // Vertical spread
            });
            
            positions[i * 3] = Math.cos(angle) * distance;
            positions[i * 3 + 1] = asteroidData[i].yOffset;
            positions[i * 3 + 2] = Math.sin(angle) * distance;
            
            // Vary colors slightly for more realism
            const colorVariation = 0.2;
            colors[i * 3] = Math.max(0, Math.min(1, colorObj.r + (Math.random() - 0.5) * colorVariation));
            colors[i * 3 + 1] = Math.max(0, Math.min(1, colorObj.g + (Math.random() - 0.5) * colorVariation));
            colors[i * 3 + 2] = Math.max(0, Math.min(1, colorObj.b + (Math.random() - 0.5) * colorVariation));
            
            // Use Pareto mass sampling for asteroid sizes (many small, few large)
            const sampledMass = this.sampleParticleMassExponential(0);
            // Scale visual size for asteroid belt (smaller scale factor for dots)
            const visualSize = this.massToVisualSize(sampledMass);
            // Apply belt-specific scaling to keep dots appropriately sized
            sizes[i] = 0.01 + visualSize * 0.015;
        }
        
        particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        particles.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        const particleMaterial = new THREE.PointsMaterial({
            size: 0.02,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.7
        });
        
        this.asteroidBelt = new THREE.Points(particles, particleMaterial);
        this.asteroidBelt.userData = {
            asteroidData: asteroidData,
            positions: positions,
            totalParticles: particleCount
        };
        this.scene.add(this.asteroidBelt);
        
        // Create the largest asteroids as distinct 3D objects
        this.createMajorAsteroids(innerRadius, outerRadius, baseOrbitalSpeed);
    }
    
    createMajorAsteroids(innerRadius, outerRadius, baseOrbitalSpeed) {
        // Major asteroids data - real orbital and physical data
        // Semi-major axis in AU, diameter in km
        // Asteroid belt spans roughly 2.0 AU to 3.3 AU (scaled 3x: 6.0 to 9.9 AU)
        const majorAsteroids = [
            // Ceres is now created as a proper planet in createCeresPlanet() with orbital ring
            // Large asteroids (the "big four" after Ceres)
            { name: 'Vesta', semiMajorAxisAU: 2.36, diameter_km: 525, color: '#C0C0B0', period_days: 1325, inclination: 7.1 },
            { name: 'Pallas', semiMajorAxisAU: 2.77, diameter_km: 512, color: '#606058', period_days: 1686, inclination: 34.8 },
            { name: 'Hygiea', semiMajorAxisAU: 3.14, diameter_km: 434, color: '#4A4A42', period_days: 2030, inclination: 3.8 },
            // Other notable asteroids
            { name: 'Interamnia', semiMajorAxisAU: 3.06, diameter_km: 326, color: '#5A5A52', period_days: 1950, inclination: 17.3 },
            { name: 'Davida', semiMajorAxisAU: 3.17, diameter_km: 289, color: '#484840', period_days: 2060, inclination: 15.9 },
            { name: 'Eunomia', semiMajorAxisAU: 2.64, diameter_km: 268, color: '#787870', period_days: 1570, inclination: 11.8 },
            { name: 'Juno', semiMajorAxisAU: 2.67, diameter_km: 234, color: '#6E6E66', period_days: 1594, inclination: 13.0 },
            { name: 'Psyche', semiMajorAxisAU: 2.92, diameter_km: 226, color: '#A0A098', period_days: 1823, inclination: 3.1 },
            { name: 'Europa', semiMajorAxisAU: 3.10, diameter_km: 315, color: '#525248', period_days: 1993, inclination: 7.5 }
        ];
        
        // Store major asteroids for animation and focusing
        this.majorAsteroids = {};
        
        // Calculate belt midpoint for scaling reference
        const beltMidpoint = (innerRadius + outerRadius) / 2;
        const beltWidth = outerRadius - innerRadius;
        
        majorAsteroids.forEach((asteroid, index) => {
            // Scale orbital distance - map AU to visual belt position
            // Belt spans 2.0-3.3 AU, center at ~2.7 AU
            const minAU = 2.0;
            const maxAU = 3.3;
            const normalizedAU = (asteroid.semiMajorAxisAU - minAU) / (maxAU - minAU);
            const orbitDistance = innerRadius + normalizedAU * beltWidth;
            
            // Scale asteroid size - smaller log scale for better proportions
            // Ceres (939 km) should be visible but not dominant
            const logDiameter = Math.log10(asteroid.diameter_km);
            const logMin = Math.log10(200); // Minimum reference
            const logMax = Math.log10(1000); // Maximum reference (Ceres)
            const normalizedSize = Math.max(0, Math.min(1, (logDiameter - logMin) / (logMax - logMin)));
            const asteroidRadius = 0.015 + normalizedSize * 0.035; // 0.015 to 0.05 visual units (much smaller)
            
            // Create asteroid mesh - darkened to prevent bloom
            const geometry = new THREE.SphereGeometry(asteroidRadius, 12, 12);
            const material = new THREE.MeshStandardMaterial({
                color: new THREE.Color(asteroid.color).multiplyScalar(0.5),
                metalness: 0.2,
                roughness: 0.85,
                emissive: 0x000000
            });
            
            const asteroidMesh = new THREE.Mesh(geometry, material);
            asteroidMesh.castShadow = true;
            asteroidMesh.receiveShadow = true;
            
            // Distribute initial positions using golden angle
            const goldenAngle = Math.PI * (3 - Math.sqrt(5));
            const initialAngle = index * goldenAngle * 3; // Multiply for wider spread
            
            // Calculate initial position with inclination
            const inclRad = asteroid.inclination * Math.PI / 180;
            const x = Math.cos(initialAngle) * orbitDistance;
            const z = Math.sin(initialAngle) * orbitDistance;
            const y = Math.sin(initialAngle) * orbitDistance * Math.sin(inclRad) * 0.3; // Reduced Y for visibility
            
            asteroidMesh.position.set(x, y, z);
            
            // Calculate orbital speed using same formula as planets (Kepler's law approximation)
            const orbitalSpeed = 0.01 / Math.sqrt(asteroid.period_days / 365.25);
            
            // Random rotation axis and speed for tumbling effect
            // Real asteroids have varied rotation periods from hours to days
            const rotationSpeed = 0.5 + Math.random() * 2.0; // Varied rotation speeds
            const rotationAxis = new THREE.Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5,
                Math.random() - 0.5
            ).normalize();
            
            // Give each asteroid a random initial rotation
            asteroidMesh.rotation.x = Math.random() * Math.PI * 2;
            asteroidMesh.rotation.y = Math.random() * Math.PI * 2;
            asteroidMesh.rotation.z = Math.random() * Math.PI * 2;
            
            asteroidMesh.userData = {
                name: asteroid.name,
                orbitDistance: orbitDistance,
                orbitalAngle: initialAngle,
                orbitalSpeed: orbitalSpeed,
                inclination: inclRad,
                diameter_km: asteroid.diameter_km,
                isCeres: asteroid.name === 'Ceres',
                rotationSpeed: rotationSpeed,
                rotationAxis: rotationAxis
            };
            
            this.majorAsteroids[asteroid.name.toLowerCase()] = asteroidMesh;
            this.scene.add(asteroidMesh);
        });
        
        // Note: Ceres reference is now set in createCeresPlanet() as planets['asteroid_belt']
    }

    /**
     * Create Ceres as the main "planet" for the asteroid belt zone
     * This places Ceres directly in the orbital plane (y=0) like other planets
     * and registers it as planets['asteroid_belt'] so structures can be built there
     */
    createCeresPlanet(zone) {
        // Ceres data from planetData
        const ceresInfo = this.planetData.ceres;
        if (!ceresInfo) {
            console.warn('No Ceres data in planetData');
            return;
        }
        
        // Use log-scaled real radius
        let planetRadius = this.logScaleRadius(ceresInfo.radius_km);
        
        // Ensure minimum visible size - Ceres is a rocky dwarf planet
        planetRadius = Math.max(0.12, planetRadius * 1.5);
        
        // Calculate orbital radius
        const orbitAU = ceresInfo.orbit_km / this.AU_KM;
        const orbitRadius = this.scaleAUToVisual(orbitAU);
        
        // Use the zone color for Ceres
        const color = zone.color || '#8B8B7A';
        
        // Create 3D planet sphere with proper lighting
        const planetGeometry = new THREE.SphereGeometry(planetRadius, 32, 32);
        const planetMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color).multiplyScalar(0.6),
            metalness: 0.1,
            roughness: 0.9,
            emissive: 0x000000,
            transparent: true,
            opacity: 1.0
        });
        
        const planet = new THREE.Mesh(planetGeometry, planetMaterial);
        
        // Enable shadows
        planet.castShadow = true;
        planet.receiveShadow = true;
        
        // Position on positive X axis (will orbit) - directly in orbital plane (y=0)
        planet.position.set(orbitRadius, 0, 0);
        
        // Orbital speed based on Ceres orbital period (~4.6 years / 1682 days)
        const orbitalPeriodDays = 1682;
        const orbitalSpeed = 0.01 / Math.sqrt(orbitalPeriodDays / 365.25);
        
        planet.userData = {
            zoneId: 'asteroid_belt',
            radius: orbitRadius,
            orbitalAngle: 0,
            orbitalSpeed: orbitalSpeed,
            originalColor: color,
            originalRadius: planetRadius,
            isCeres: true
        };
        
        // Register as the main planet for asteroid_belt zone (for structures)
        this.planets['asteroid_belt'] = planet;
        // Also set this.ceres reference for backward compatibility with zone focusing
        this.ceres = planet;
        this.scene.add(planet);
    }
    
    /**
     * Create orbital ring for Ceres (asteroid belt)
     * This displays the orbital path like other planets
     */
    createCeresOrbit(zone) {
        const color = zone.color || '#8B8B7A';
        
        // Get orbit radius from Ceres data
        const ceresInfo = this.planetData.ceres;
        if (!ceresInfo) return;
        
        const orbitAU = ceresInfo.orbit_km / this.AU_KM;
        const orbitRadius = this.scaleAUToVisual(orbitAU);
        
        // Create orbit ring manually (circle)
        const points = [];
        const segments = 512;
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push(new THREE.Vector3(
                Math.cos(angle) * orbitRadius,
                0,
                Math.sin(angle) * orbitRadius
            ));
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        const material = new THREE.LineBasicMaterial({
            color: new THREE.Color(color).multiplyScalar(0.3),
            opacity: 0.25,
            transparent: true
        });
        
        const orbit = new THREE.Line(geometry, material);
        this.orbits['asteroid_belt'] = orbit;
        this.scene.add(orbit);
    }

    createKuiperBelt(zone) {
        // Kuiper belt spans from ~30 AU to ~50 AU, centered at ~40 AU
        const kuiperAU = this.planetData.kuiper.orbit_km / this.AU_KM; // ~40 AU
        const orbitRadius = this.scaleAUToVisual(kuiperAU);
        
        // Kuiper belt is a disk - use scaled inner/outer edges
        const innerRadius = this.scaleAUToVisual(30.0);  // 30 AU inner edge
        const outerRadius = this.scaleAUToVisual(50.0);  // 50 AU outer edge
        
        // Create particle system for Kuiper belt
        const particleCount = 8000; // Significantly increased for more visible objects
        const particles = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        
        // Store orbital data for animation
        const kuiperData = [];
        
        // Very slow orbital speed for Kuiper belt objects
        const baseOrbitalSpeed = 0.001; // Very slow
        
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = innerRadius + Math.random() * (outerRadius - innerRadius);
            const yOffset = (Math.random() - 0.5) * 0.5; // Vertical spread (thinner disk)
            
            // Vary orbital speed slightly
            const normalizedDistance = (distance - innerRadius) / (outerRadius - innerRadius);
            const orbitalSpeed = baseOrbitalSpeed * (1.0 - normalizedDistance * 0.3);
            
            kuiperData.push({
                angle: angle,
                distance: distance,
                orbitalSpeed: orbitalSpeed,
                yOffset: yOffset
            });
            
            positions[i * 3] = Math.cos(angle) * distance;
            positions[i * 3 + 1] = yOffset;
            positions[i * 3 + 2] = Math.sin(angle) * distance;
            
            // Grey to white colors for icy Kuiper belt objects
            const brightness = 0.5 + Math.random() * 0.5; // 0.5 to 1.0 (grey to white)
            colors[i * 3] = brightness;
            colors[i * 3 + 1] = brightness;
            colors[i * 3 + 2] = brightness;
            
            // Use Pareto mass sampling for Kuiper belt sizes (many small, few large)
            const sampledMass = this.sampleParticleMassExponential(0);
            // Scale visual size for Kuiper belt (slightly larger scale factor than asteroid belt)
            const visualSize = this.massToVisualSize(sampledMass);
            // Apply belt-specific scaling to keep dots appropriately sized
            sizes[i] = 0.012 + visualSize * 0.018;
        }
        
        particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        particles.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        const particleMaterial = new THREE.PointsMaterial({
            size: 0.025,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.7
        });
        
        this.kuiperBelt = new THREE.Points(particles, particleMaterial);
        this.kuiperBelt.userData = {
            kuiperData: kuiperData,
            positions: positions,
            totalParticles: particleCount
        };
        this.scene.add(this.kuiperBelt);
    }

    createOortCloud(zone) {
        // Oort cloud centered at ~140 AU (outer boundary)
        const oortAU = this.planetData.oort.orbit_km / this.AU_KM; // ~140 AU
        const orbitRadius = this.scaleAUToVisual(oortAU);
        
        // Oort cloud spans from ~70 AU to 140 AU
        const innerRadius = this.scaleAUToVisual(70.0);   // 70 AU inner edge
        const outerRadius = this.scaleAUToVisual(140.0);   // 140 AU outer edge (matches OUTER_BOUNDARY_AU)
        
        // Create particle system for Oort cloud - more particles but sparser
        const particleCount = 15000; // Significantly increased for more visible comets
        const particles = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        
        for (let i = 0; i < particleCount; i++) {
            // Random spherical distribution (not just in a plane)
            const theta = Math.random() * Math.PI * 2; // Azimuth
            const phi = Math.acos(2 * Math.random() - 1); // Polar angle (spherical distribution)
            const distance = innerRadius + Math.random() * (outerRadius - innerRadius);
            
            // Convert spherical to cartesian
            positions[i * 3] = distance * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = distance * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = distance * Math.cos(phi);
            
            // Grey to white colors for icy comets (slightly dimmer than Kuiper)
            const brightness = 0.4 + Math.random() * 0.4; // 0.4 to 0.8 (darker grey to light grey)
            colors[i * 3] = brightness;
            colors[i * 3 + 1] = brightness;
            colors[i * 3 + 2] = brightness;
            
            // Smaller, dimmer particles
            sizes[i] = 0.01 + Math.random() * 0.02;
        }
        
        particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        particles.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        const particleMaterial = new THREE.PointsMaterial({
            size: 0.015,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.5
        });
        
        this.oortCloud = new THREE.Points(particles, particleMaterial);
        this.oortCloud.userData = {
            totalParticles: particleCount
        };
        this.scene.add(this.oortCloud);
    }
    
    
    /**
     * Initialize resource particle visualization for all mining zones
     * Creates a single particle system per zone for metal and slag
     * All zones form a continuous flat accretion disc
     */
    initResourceParticles() {
        // All zones that can have mined resources (exclude dyson_sphere)
        const miningZones = ['mercury', 'venus', 'earth', 'mars', 'asteroid_belt', 
                            'jupiter', 'saturn', 'uranus', 'neptune', 'kuiper', 'oort_cloud'];
        
        // Build zone bounds from orbital data config
        const zoneBounds = {};
        if (this.orbitalData && this.orbitalData.orbital_zones) {
            this.orbitalData.orbital_zones.forEach(zone => {
                if (zone.radius_au_start !== undefined && zone.radius_au_end !== undefined) {
                    zoneBounds[zone.id] = {
                        inner: this.scaleAUToVisual(zone.radius_au_start),
                        outer: this.scaleAUToVisual(zone.radius_au_end),
                        innerAU: zone.radius_au_start,
                        outerAU: zone.radius_au_end
                    };
                }
            });
        }
        
        // Store zone bounds for reference
        this.zoneBounds = zoneBounds;
        
        miningZones.forEach(zoneId => {
            // Get zone config from orbital data
            const zoneConfig = this.orbitalData?.orbital_zones?.find(z => z.id === zoneId);
            if (!zoneConfig) return;
            
            // Get planet/body for this zone (may not exist for belts)
            const planet = this.planets[zoneId];
            const planetInfo = this.planetData[zoneId];
            
            // Calculate orbit radius based on zone type
            const isRocky = this.rockyPlanets?.includes(zoneId);
            let orbitRadius;
            let planetRadius;
            
            if (planetInfo && planetInfo.orbit_km) {
                // Use unified scaling (converts km to AU first)
                const orbitAU = planetInfo.orbit_km / this.AU_KM;
                orbitRadius = this.scaleAUToVisual(orbitAU);
                planetRadius = this.logScaleRadius(planetInfo.radius_km);
            } else {
                // For belts without planets, use zone center
                orbitRadius = this.scaleAUToVisual(zoneConfig.radius_au);
                planetRadius = 0.05; // Default small radius for belt zones
            }
            
            // Get zone bounds for this zone (all zones now use accretion disc mode)
            const bounds = zoneBounds[zoneId];
            
            // Create resource particle system - all zones use accretion disc mode
            const particleSystem = this.createResourceParticleSystem(
                zoneId, 
                planetRadius, 
                true, // All zones use accretion disc mode
                orbitRadius,
                bounds || null
            );
            
            // Store reference
            this.resourceParticles[zoneId] = particleSystem;
            
            // Initialize particle data arrays
            this.resourceParticleData[zoneId] = {
                metal: [],     // Active metal particles
                slag: [],      // Active slag particles
                methalox: [],  // Active methalox particles
                probe: []      // Active probe particles (overflow >100M)
            };
            
            // Initialize previous resource tracking
            this.previousResources[zoneId] = {
                metal: 0,
                slag: 0,
                methalox: 0,
                probe: 0
            };
            
            // Add to scene
            this.scene.add(particleSystem);
        });
        
        console.log(`SolarSystem: Created resource particles for ${Object.keys(this.resourceParticles).length} zones`);
    }
    
    /**
     * Create resource particle system for a planet
     * All zones use accretion disc mode (flat disc orbiting sun) - unified appearance for all planet types
     * @param {string} zoneId - Planet zone ID
     * @param {number} planetRadius - Visual radius of the planet
     * @param {boolean} isAccretionDisc - Always true (all zones use flat disc mode)
     * @param {number} orbitRadius - Planet's orbital radius
     * @param {Object} ringBounds - {inner, outer} for accretion disc mode
     * @returns {THREE.Points} Particle system
     */
    createResourceParticleSystem(zoneId, planetRadius, isAccretionDisc, orbitRadius, ringBounds) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxResourceParticles * 3);
        const colors = new Float32Array(this.maxResourceParticles * 3);
        const sizes = new Float32Array(this.maxResourceParticles); // Size per vertex
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setDrawRange(0, 0); // Start with no visible particles
        
        // Use ShaderMaterial for variable size per vertex
        const material = new THREE.ShaderMaterial({
            uniforms: {
                pointTexture: { value: null } // Can add texture later if needed
            },
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                varying vec3 vColor;
                varying float vSize;
                
                void main() {
                    vColor = color;
                    vSize = size;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D pointTexture;
                varying vec3 vColor;
                varying float vSize;
                
                void main() {
                    vec2 coord = gl_PointCoord - vec2(0.5);
                    float dist = length(coord);
                    if (dist > 0.5) discard;
                    
                    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
                    gl_FragColor = vec4(vColor, alpha * 0.85);
                }
            `,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            blending: THREE.NormalBlending
        });
        
        const points = new THREE.Points(geometry, material);
        points.renderOrder = isAccretionDisc ? 85 : 90; // Accretion disc behind planet clouds
        points.frustumCulled = false;
        
        // Store orbital parameters and size array reference
        if (isAccretionDisc && ringBounds) {
            // Accretion disc mode: particles orbit sun in a flat ring
            points.userData = {
                zoneId: zoneId,
                planetRadius: planetRadius,
                isAccretionDisc: true,
                orbitRadius: orbitRadius,
                ringInner: ringBounds.inner,
                ringOuter: ringBounds.outer,
                verticalSpread: 0.15, // Very thin disc
                sizes: sizes // Store reference to size array
            };
        } else {
            // Spherical cloud mode: particles orbit planet (shouldn't be used, but kept for safety)
            points.userData = {
                zoneId: zoneId,
                planetRadius: planetRadius,
                isAccretionDisc: false,
                minRadius: planetRadius * 1.5,
                maxRadius: planetRadius * 7.0,
                sizes: sizes // Store reference to size array
            };
        }
        
        return points;
    }
    
    /**
     * Determine particle size class based on mining rate
     * Higher mining rates produce larger particles
     * @param {number} miningRateKgPerDay - Mining/production rate in kg/day
     * @returns {string} Size class: 'small', 'medium', 'large', 'xlarge', or 'huge'
     */
    determineParticleSizeFromRate(miningRateKgPerDay) {
        if (!miningRateKgPerDay || miningRateKgPerDay <= 0) {
            return 'small'; // Default to small for very low/no rates
        }
        
        // Use logarithmic scaling to determine size based on rate
        // Thresholds: small < 1e9, medium < 1e12, large < 1e15, xlarge < 1e18, huge >= 1e18 kg/day
        const logRate = Math.log10(miningRateKgPerDay);
        
        if (logRate >= 18) {
            // Extreme rate (gas giant scale): mostly huge, some xlarge
            return Math.random() < 0.7 ? 'huge' : 'xlarge';
        } else if (logRate >= 15) {
            // Very high rate: mostly xlarge, some large
            return Math.random() < 0.7 ? 'xlarge' : 'large';
        } else if (logRate >= 12) {
            // High rate: mix of large and medium
            return Math.random() < 0.6 ? 'large' : 'medium';
        } else if (logRate >= 9) {
            // Medium rate: mix of medium and small
            return Math.random() < 0.5 ? 'medium' : 'small';
        } else {
            // Low rate: mostly small
            return 'small';
        }
    }
    
    /**
     * Get the expected (mean) particle mass from the Pareto distribution
     * For Pareto: E[X] = α * minMass / (α - 1) when α > 1
     * This is calibrated so Jupiter → 800,000 particles
     * @returns {number} Expected particle mass in kg
     */
    getExpectedParticleMass() {
        const config = this.particleDistribution;
        const alpha = config.shapeParameter;
        // E[X] = α * minMass / (α - 1)
        return alpha * config.minMass / (alpha - 1);
    }
    
    /**
     * Calculate expected particle count for a given total mass
     * @param {number} totalMass - Total mass in kg
     * @returns {number} Expected number of particles
     */
    getExpectedParticleCount(totalMass) {
        return totalMass / this.getExpectedParticleMass();
    }
    
    /**
     * Sample a particle mass from Pareto distribution
     * Produces natural "many small, few large" distribution like real asteroids
     * Distribution is calibrated so Jupiter's mass → 800,000 particles on average
     * @param {number} miningRate - Mining rate in kg/day (unused, kept for API compatibility)
     * @returns {number} Sampled particle mass in kg
     */
    sampleParticleMassExponential(miningRate) {
        const config = this.particleDistribution;
        const alpha = config.shapeParameter;
        
        // Sample from Pareto distribution using inverse transform:
        // If U ~ Uniform(0,1), then X = minMass / U^(1/α) ~ Pareto(minMass, α)
        const u = Math.random();
        
        // Avoid division by zero and extreme values
        const clampedU = Math.max(0.0001, u);
        const sampledMass = config.minMass / Math.pow(clampedU, 1 / alpha);
        
        // Clamp to valid range (Pareto can produce very large values)
        return Math.min(config.maxMass, sampledMass);
    }
    
    /**
     * Calculate visual size from particle mass using logarithmic/exponential scaling
     * size = minSize * (maxSize/minSize)^(t^exponent) where t is normalized log position
     * Power exponent < 1 shifts distribution toward larger visual sizes
     * This gives strong visual differentiation across 16 orders of magnitude
     * @param {number} mass - Particle mass in kg
     * @returns {number} Visual size for THREE.js rendering
     */
    massToVisualSize(mass) {
        const config = this.particleDistribution;
        const logMass = Math.log10(Math.max(config.minMass, Math.min(config.maxMass, mass)));
        const logMin = Math.log10(config.minMass);  // 6
        const logMax = Math.log10(config.maxMass);  // 22
        
        // Normalize to [0, 1] in log-space
        let t = (logMass - logMin) / (logMax - logMin);
        
        // Apply power transform to shift size distribution
        // exponent < 1: pushes small masses toward larger visual sizes
        // exponent = 0.4: most particles appear medium-sized instead of tiny
        // exponent = 1.0: linear (original behavior)
        const exponent = config.sizeExponent || 1.0;
        t = Math.pow(t, exponent);
        
        // Exponential scaling: size = minSize * (maxSize/minSize)^t
        // This gives logarithmic relationship: equal mass ratios → equal size ratios
        const sizeRatio = config.maxVisualSize / config.minVisualSize; // 3.5 / 0.05 = 70
        const size = config.minVisualSize * Math.pow(sizeRatio, t);
        
        return size;
    }
    
    /**
     * Calculate target spawn rate based on mining rate
     * Uses the analytical expected value from the Pareto distribution
     * @param {number} miningRate - Mining rate in kg/day
     * @returns {number} Particles per game day to spawn
     */
    calculateParticleSpawnRate(miningRate) {
        const config = this.particleDistribution;
        
        // Use the analytical expected mass from Pareto distribution
        const expectedMass = this.getExpectedParticleMass();
        
        // Calculate ideal spawn rate: particles/day = miningRate / expectedMass
        // This ensures that over time, spawned particles represent the mined mass correctly
        const idealRate = miningRate / expectedMass;
        
        // Apply logarithmic scaling to prevent visual overload at extreme rates
        // while maintaining proportionality at reasonable rates
        let scaledRate;
        if (idealRate <= 0) {
            scaledRate = 0;
        } else if (idealRate <= config.maxSpawnRate) {
            // Linear scaling for reasonable rates
            scaledRate = Math.max(config.minSpawnRate, idealRate);
        } else {
            // Logarithmic compression for very high rates
            const excess = idealRate / config.maxSpawnRate;
            const logCompression = 1 + Math.log10(excess) * 0.3;
            scaledRate = config.maxSpawnRate * Math.min(1.5, logCompression);
        }
        
        return Math.min(config.maxSpawnRate * 1.5, Math.max(0, scaledRate));
    }
    
    // ============== PROBE PARTICLE METHODS ==============
    
    /**
     * Get expected probe particle mass - uses unified distribution
     * @returns {number} Expected particle mass in kg
     */
    getExpectedProbeParticleMass() {
        // Use same distribution as resources for consistency
        return this.getExpectedParticleMass();
    }
    
    /**
     * Sample probe particle mass - uses unified distribution
     * @returns {number} Sampled mass in kg
     */
    sampleProbeParticleMass() {
        // Use same distribution as resources for consistency
        return this.sampleParticleMassExponential();
    }
    
    /**
     * Calculate visual size for probe particle - uses unified scaling
     * @param {number} mass - Particle mass in kg
     * @returns {number} Visual size
     */
    probeParticleMassToVisualSize(mass) {
        // Use same logarithmic scaling as resources for consistency
        return this.massToVisualSize(mass);
    }
    
    /**
     * Spawn an individual probe dot at a zone (for first 100 probes)
     * @param {string} zoneId - Zone ID
     * @param {number} index - Probe index (0-99)
     * @returns {Object} Probe position data
     */
    spawnIndividualProbe(zoneId, index) {
        const particleSystem = this.resourceParticles[zoneId];
        if (!particleSystem) return null;
        
        const userData = particleSystem.userData;
        const planet = this.planets[zoneId];
        
        const planetAngle = planet?.userData?.orbitalAngle || 0;
        const planetOrbitalSpeed = planet?.userData?.orbitalSpeed || 0.008;
        
        // Distribute probes evenly around the planet
        const angleOffset = (index / this.probeParticleConfig.maxIndividualProbes) * Math.PI * 2;
        const targetAngle = planetAngle + angleOffset;
        
        // Position close to planet (within ~1.5-2.5 planet radii)
        const planetRadius = userData.planetRadius || 0.1;
        const orbitDistance = userData.orbitRadius + planetRadius * (1.5 + Math.random());
        
        // Small vertical offset
        const yOffset = (Math.random() - 0.5) * 0.08;
        
        // Calculate orbital speed (slightly slower than planet for trailing effect)
        const earthAU = this.planetData.earth.orbit_km / this.AU_KM;
        const earthOrbitRadius = this.scaleAUToVisual(earthAU);
        const keplerSpeed = 0.008 * Math.sqrt(earthOrbitRadius / orbitDistance);
        const orbitalSpeed = keplerSpeed * 0.95;
        
        return {
            type: 'individual_probe',
            index: index,
            targetAngle: targetAngle,
            targetDistance: orbitDistance,
            yOffset: yOffset,
            orbitalSpeed: orbitalSpeed,
            planetOrbitalSpeed: planetOrbitalSpeed,
            spawnAngle: planetAngle,
            spawnDistance: userData.orbitRadius,
            spawnTime: this.gameTime,
            drifting: true,
            driftDuration: this.particleDriftConfig.probeIndividualDurationDays,  // Quick drift for individual probes
            visualSize: this.probeParticleConfig.individualProbeSize,  // Fixed size for individual probes
            mass: this.probeParticleConfig.probeMassKg
        };
    }
    
    /**
     * Spawn a probe mass particle (for probes beyond first 100)
     * Uses same Pareto distribution as resources
     * @param {string} zoneId - Zone ID
     * @param {number} mass - Particle mass in kg
     * @param {number} visualSize - Visual size
     * @returns {Object} Particle data
     */
    spawnProbeParticle(zoneId, mass, visualSize) {
        const particleSystem = this.resourceParticles[zoneId];
        if (!particleSystem) return null;
        
        const userData = particleSystem.userData;
        const planet = this.planets[zoneId];
        
        const planetAngle = planet?.userData?.orbitalAngle || (Math.random() * Math.PI * 2);
        const planetRadius = userData.planetRadius || 0.1;
        const planetOrbitalSpeed = planet?.userData?.orbitalSpeed || 0.008;
        
        const spawnDistance = userData.orbitRadius;
        const spawnAngle = planetAngle;
        
        // Target in orbital band (similar to resources but tighter grouping)
        const ringInner = userData.ringInner || (userData.orbitRadius * 0.9);
        const ringOuter = userData.ringOuter || (userData.orbitRadius * 1.1);
        const targetDistance = ringInner + Math.random() * (ringOuter - ringInner);
        
        const angularSpread = (3 * planetRadius) / targetDistance;
        const targetAngle = planetAngle + (Math.random() - 0.5) * 2 * angularSpread;
        
        const yOffset = (Math.random() - 0.5) * 0.1;
        
        const earthAU = this.planetData.earth.orbit_km / this.AU_KM;
        const earthOrbitRadius = this.scaleAUToVisual(earthAU);
        const keplerSpeed = 0.008 * Math.sqrt(earthOrbitRadius / targetDistance);
        const orbitalSpeed = keplerSpeed * 0.85 * (0.97 + Math.random() * 0.06);
        
        const distanceRatio = Math.abs(targetDistance - spawnDistance) / earthOrbitRadius;
        const baseDrift = this.particleDriftConfig.probeMassDurationDays;
        const driftDuration = baseDrift + distanceRatio * (baseDrift * 0.5);
        
        return {
            type: 'probe_particle',
            mass: mass,
            visualSize: visualSize * (0.85 + Math.random() * 0.30),
            sizeClass: 'continuous',
            spawnAngle: spawnAngle,
            spawnDistance: spawnDistance,
            targetAngle: targetAngle,
            targetDistance: targetDistance,
            yOffset: yOffset,
            orbitalSpeed: orbitalSpeed,
            planetOrbitalSpeed: planetOrbitalSpeed,
            spawnTime: this.gameTime,
            drifting: true,
            driftDuration: driftDuration
        };
    }
    
    /**
     * Update probe particles for all zones
     * Shows up to 100 individual probes, rest as mass particles
     * @param {Object} gameState - Current game state
     */
    updateProbeParticles(gameState) {
        if (!gameState || !gameState.zones) return;
        
        const zones = gameState.zones;
        const probeAllocations = gameState.probe_allocations || {};
        const currentTime = gameState.time || 0;
        const config = this.probeParticleConfig;
        
        Object.keys(this.resourceParticles).forEach(zoneId => {
            const particleData = this.resourceParticleData[zoneId];
            if (!particleData) return;
            
            // Initialize probe tracking for this zone
            if (!this.probeParticles[zoneId]) {
                this.probeParticles[zoneId] = [];
            }
            if (!this.individualProbes[zoneId]) {
                this.individualProbes[zoneId] = [];
            }
            if (!this.pendingProbeMass[zoneId]) {
                this.pendingProbeMass[zoneId] = 0;
            }
            
            // Get current probe count for this zone
            const currentProbeCount = probeAllocations[zoneId] || 0;
            const prevProbeCount = this.previousProbeCount[zoneId] || 0;
            
            // Calculate how many individual probes to show (up to 100)
            const individualCount = Math.min(currentProbeCount, config.maxIndividualProbes);
            const excessProbes = Math.max(0, currentProbeCount - config.maxIndividualProbes);
            const excessMass = excessProbes * config.probeMassKg;
            
            // Handle individual probes (first 100)
            const currentIndividualProbes = this.individualProbes[zoneId];
            
            // Add new individual probes if count increased
            while (currentIndividualProbes.length < individualCount) {
                const newProbe = this.spawnIndividualProbe(zoneId, currentIndividualProbes.length);
                if (newProbe) {
                    currentIndividualProbes.push(newProbe);
                }
            }
            
            // Remove individual probes if count decreased
            while (currentIndividualProbes.length > individualCount) {
                currentIndividualProbes.pop();
            }
            
            // Handle excess probes as mass particles
            const probeParticles = this.probeParticles[zoneId];
            const prevExcessProbes = Math.max(0, prevProbeCount - config.maxIndividualProbes);
            const prevExcessMass = prevExcessProbes * config.probeMassKg;
            const massChange = excessMass - prevExcessMass;
            
            if (massChange > 0) {
                // Probes increased - add to pending mass
                this.pendingProbeMass[zoneId] += massChange;
            } else if (massChange < 0) {
                // Probes decreased - remove particles
                const toRemoveMass = Math.abs(massChange);
                let remaining = toRemoveMass;
                
                // Remove largest particles first
                probeParticles.sort((a, b) => (b.mass || 0) - (a.mass || 0));
                while (remaining > 0 && probeParticles.length > 0) {
                    const removed = probeParticles.shift();
                    remaining -= removed.mass || config.minMass;
                }
            }
            
            // Spawn probe particles from pending mass
            const pendingMass = this.pendingProbeMass[zoneId];
            if (pendingMass >= config.minMass) {
                // Calculate spawn rate
                const expectedMass = this.getExpectedProbeParticleMass();
                const probeProductionRate = (massChange > 0 ? massChange : 0) / Math.max(0.01, currentTime - (this.lastUpdateTime[zoneId] || 0));
                
                // Limit spawning to prevent bursts
                const maxParticlesPerUpdate = 3;
                let spawned = 0;
                let remainingMass = pendingMass;
                
                while (remainingMass >= config.minMass && spawned < maxParticlesPerUpdate) {
                    const particleMass = this.sampleProbeParticleMass();
                    
                    if (remainingMass >= particleMass) {
                        const visualSize = this.probeParticleMassToVisualSize(particleMass);
                        const particle = this.spawnProbeParticle(zoneId, particleMass, visualSize);
                        
                        if (particle) {
                            probeParticles.push(particle);
                            remainingMass -= particleMass;
                            spawned++;
                        }
                    } else {
                        break;
                    }
                }
                
                this.pendingProbeMass[zoneId] = remainingMass;
            }
            
            // Update previous count
            this.previousProbeCount[zoneId] = currentProbeCount;
        });
    }
    
    // ============== END PROBE PARTICLE METHODS ==============
    
    /**
     * Calculate target particle count based on mass and limits
     * Particles are spawned with sizes determined by mining rate
     * @param {number} massKg - Mass in kg (slag or metal)
     * @param {string} resourceType - 'metal' or 'slag' to determine limits
     * @param {number} maxDotsPerZone - Ignored, kept for API compatibility
     * @returns {Object} {small: n, medium: n, large: n, xlarge: n, huge: n} dot counts
     */
    calculateDotDistribution(massKg, resourceType = 'metal', maxDotsPerZone = null) {
        if (massKg <= 0) {
            return { small: 0, medium: 0, large: 0, xlarge: 0, huge: 0 };
        }
        
        // Get max particles for this resource type
        const maxParticles = this.maxParticlesByType[resourceType] || this.maxParticlesByType.metal;
        
        // Calculate how many particles we need based on mass
        // Use a weighted average approach: calculate ideal particle count if all were small
        // Then distribute across sizes respecting limits
        const idealSmallCount = massKg / this.resourceSizes.small.mass;
        
        // If we can represent everything with small particles under limit, do that
        if (idealSmallCount <= maxParticles.small) {
            return {
                small: Math.floor(idealSmallCount),
                medium: 0,
                large: 0,
                xlarge: 0,
                huge: 0
            };
        }
        
        // Otherwise, fill up to limits starting with small, then larger sizes
        let remaining = massKg;
        let small = 0;
        let medium = 0;
        let large = 0;
        let xlarge = 0;
        let huge = 0;
        
        // Fill small up to limit
        const maxSmall = maxParticles.small;
        const smallMass = maxSmall * this.resourceSizes.small.mass;
        if (remaining >= smallMass) {
            small = maxSmall;
            remaining -= smallMass;
        } else {
            small = Math.floor(remaining / this.resourceSizes.small.mass);
            return { small, medium: 0, large: 0, xlarge: 0, huge: 0 };
        }
        
        // Fill medium up to limit
        const maxMedium = maxParticles.medium;
        const mediumMass = maxMedium * this.resourceSizes.medium.mass;
        if (remaining >= mediumMass) {
            medium = maxMedium;
            remaining -= mediumMass;
        } else {
            medium = Math.floor(remaining / this.resourceSizes.medium.mass);
            return { small, medium, large: 0, xlarge: 0, huge: 0 };
        }
        
        // Fill large up to limit
        const maxLarge = maxParticles.large;
        const largeMass = maxLarge * this.resourceSizes.large.mass;
        if (remaining >= largeMass) {
            large = maxLarge;
            remaining -= largeMass;
        } else {
            large = Math.floor(remaining / this.resourceSizes.large.mass);
            return { small, medium, large, xlarge: 0, huge: 0 };
        }
        
        // Fill xlarge up to limit
        const maxXlarge = maxParticles.xlarge;
        const xlargeMass = maxXlarge * this.resourceSizes.xlarge.mass;
        if (remaining >= xlargeMass) {
            xlarge = maxXlarge;
            remaining -= xlargeMass;
        } else {
            xlarge = Math.floor(remaining / this.resourceSizes.xlarge.mass);
            return { small, medium, large, xlarge, huge: 0 };
        }
        
        // Fill huge up to limit (for gas giant scale masses)
        const maxHuge = maxParticles.huge || 0;
        const hugeMass = maxHuge * this.resourceSizes.huge.mass;
        if (remaining >= hugeMass) {
            huge = maxHuge;
        } else {
            huge = Math.floor(remaining / this.resourceSizes.huge.mass);
        }
        
        return { small, medium, large, xlarge, huge };
    }
    
    /**
     * Calculate the number of resource dots from mass using multi-scale formula:
     * - 0 to 100 dots: linear at 1000kg per dot
     * - 100+ dots: logarithmic scaling up to maxDots
     * @param {number} massKg - Mass in kg (slag or metal)
     * @param {number} maxDots - Maximum number of dots for this resource type
     * @returns {number} Number of dots to display
     * @deprecated Use calculateDotDistribution() instead
     */
    calculateResourceDots(massKg, maxDots) {
        if (massKg <= 0) return 0;
        
        const linearMassMax = this.resourceLinearMaxDots * this.resourceKgPerDot; // 100,000 kg
        
        if (massKg <= linearMassMax) {
            // Linear range: 1 dot per 1000kg
            return Math.floor(massKg / this.resourceKgPerDot);
        }
        
        // Logarithmic range: 100 dots at 100,000kg, maxDots at resourceLogMaxMass
        const logMassRange = Math.log10(this.resourceLogMaxMass) - Math.log10(linearMassMax);
        const logProgress = (Math.log10(massKg) - Math.log10(linearMassMax)) / logMassRange;
        const logDots = this.resourceLinearMaxDots + (maxDots - this.resourceLinearMaxDots) * logProgress;
        
        return Math.min(maxDots, Math.max(this.resourceLinearMaxDots, Math.floor(logDots)));
    }
    
    /**
     * Spawn a new resource particle from mining
     * Particles spawn at the planet position and drift outward to their target orbital position
     * in the zone's orbital band near the planet, forming a trailing debris cloud
     * @param {string} zoneId - Planet zone ID
     * @param {string} type - 'metal' or 'slag'
     * @param {string} sizeClass - 'small', 'medium', 'large', 'xlarge', or 'huge'
     * @returns {Object} New particle data
     */
    spawnResourceParticle(zoneId, type, sizeClass = 'small') {
        const particleSystem = this.resourceParticles[zoneId];
        if (!particleSystem) return null;
        
        const userData = particleSystem.userData;
        const planet = this.planets[zoneId];
        
        // Get planet's current orbital angle (or random for belt zones)
        const planetAngle = planet?.userData?.orbitalAngle || (Math.random() * Math.PI * 2);
        const planetRadius = userData.planetRadius;
        
        // Get planet's orbital speed (particles inherit this initially)
        const planetOrbitalSpeed = planet?.userData?.orbitalSpeed || 0.008;
        
        // Start position: at the planet/body location
        const spawnDistance = userData.orbitRadius;
        const spawnAngle = planetAngle;
        
        // Check if this is a gas giant - particles should deposit within a few planetary radii
        const isGasGiant = this.gasGiants?.includes(zoneId);
        
        let targetDistance, targetAngle;
        
        if (isGasGiant) {
            // Gas giants: particles deposit within a few planetary radii of the planet
            // Random distance within 2-5 planetary radii of the planet's orbital radius
            const radiusSpread = planetRadius * (2 + Math.random() * 3); // 2-5 planetary radii
            const sign = Math.random() < 0.5 ? -1 : 1;
            targetDistance = userData.orbitRadius + sign * radiusSpread;
            
            // Angular spread based on a few planetary radii worth of arc length
            const angularSpread = (4 * planetRadius) / targetDistance;
            targetAngle = planetAngle + (Math.random() - 0.5) * 2 * angularSpread;
        } else {
            // Rocky planets and belts: evenly distributed within zone's orbital band
            // Random orbital radius within zone bounds
            const ringInner = userData.ringInner || (userData.orbitRadius * 0.8);
            const ringOuter = userData.ringOuter || (userData.orbitRadius * 1.2);
            targetDistance = ringInner + Math.random() * (ringOuter - ringInner);
            
            // Target angle: near the planet with variance of ~5 planetary radii
            // Calculate angular spread: arc length = angle * radius, so angle = arc / radius
            // Spread = 5 * planetRadius as arc length at the target orbital distance
            const angularSpread = (5 * planetRadius) / targetDistance;
            // Random angle within +/- angularSpread of the planet's current position
            targetAngle = planetAngle + (Math.random() - 0.5) * 2 * angularSpread;
        }
        
        // Small vertical offset for disc thickness
        const yOffset = (Math.random() - 0.5) * 0.15;
        
        // Orbital speed based on Kepler's law at target distance
        const earthAU = this.planetData.earth.orbit_km / this.AU_KM;
        const earthOrbitRadius = this.scaleAUToVisual(earthAU);
        const keplerSpeed = 0.008 * Math.sqrt(earthOrbitRadius / targetDistance);
        // Reduce to 80% of Kepler speed + small random variation
        // This makes particles orbit slower than the planet, leaving a trailing cloud
        const orbitalSpeed = keplerSpeed * 0.80 * (0.97 + Math.random() * 0.06);
        
        // Drift duration scales with distance traveled (further = longer drift)
        // Duration is in game days for a slow, gentle drift into orbit
        const distanceRatio = Math.abs(targetDistance - spawnDistance) / earthOrbitRadius;
        const baseDrift = this.particleDriftConfig.resourceBaseDurationDays;
        const scalingDrift = this.particleDriftConfig.resourceDistanceScalingDays;
        const driftDuration = baseDrift + distanceRatio * scalingDrift;
        
        // Generate size variance for visual variety while maintaining mass accuracy
        // Smaller tiers get more variance for visual interest; larger tiers stay more consistent
        // Use a distribution that favors the base size but allows for occasional outliers
        let sizeVariance;
        switch (sizeClass) {
            case 'small':
                // Wide variance for small particles: 0.4 to 2.0 (lots of dust to small rocks)
                sizeVariance = 0.4 + Math.pow(Math.random(), 0.7) * 1.6;
                break;
            case 'medium':
                // Moderate variance: 0.6 to 1.6
                sizeVariance = 0.6 + Math.pow(Math.random(), 0.8) * 1.0;
                break;
            case 'large':
                // Less variance: 0.75 to 1.35
                sizeVariance = 0.75 + Math.random() * 0.6;
                break;
            case 'xlarge':
                // Minimal variance for massive objects: 0.85 to 1.15
                sizeVariance = 0.85 + Math.random() * 0.3;
                break;
            case 'huge':
                // Very minimal variance for gas giant scale objects: 0.9 to 1.1
                sizeVariance = 0.9 + Math.random() * 0.2;
                break;
            default:
                sizeVariance = 1.0;
        }
        
        return {
            type: type,
            sizeClass: sizeClass, // 'small', 'medium', 'large', 'xlarge', or 'huge'
            sizeVariance: sizeVariance, // Visual size multiplier (doesn't affect mass accounting)
            // Spawn position (at planet)
            spawnAngle: spawnAngle,
            spawnDistance: spawnDistance,
            // Target position (in zone's orbital band, near planet)
            targetAngle: targetAngle,
            targetDistance: targetDistance,
            yOffset: yOffset,
            orbitalSpeed: orbitalSpeed,
            // Planet's orbital speed at spawn time (particles inherit this and blend to their own speed)
            planetOrbitalSpeed: planetOrbitalSpeed,
            // Animation state (times in game days)
            spawnTime: this.gameTime,
            drifting: true,
            driftDuration: driftDuration
        };
    }
    
    /**
     * Spawn a resource particle with explicit mass and visual size (exponential distribution mode)
     * This is the new preferred method using continuous size distribution
     * @param {string} zoneId - Planet zone ID
     * @param {string} type - 'metal', 'slag', 'methalox', or 'probe'
     * @param {number} mass - Particle mass in kg
     * @param {number} visualSize - Visual size for rendering
     * @returns {Object} New particle data with mass and size
     */
    spawnResourceParticleWithMass(zoneId, type, mass, visualSize) {
        const particleSystem = this.resourceParticles[zoneId];
        if (!particleSystem) return null;
        
        const userData = particleSystem.userData;
        const planet = this.planets[zoneId];
        
        // Get planet's current orbital angle (or random for belt zones)
        const planetAngle = planet?.userData?.orbitalAngle || (Math.random() * Math.PI * 2);
        const planetRadius = userData.planetRadius;
        
        // Get planet's orbital speed (particles inherit this initially)
        const planetOrbitalSpeed = planet?.userData?.orbitalSpeed || 0.008;
        
        // Start position: at the planet/body location
        const spawnDistance = userData.orbitRadius;
        const spawnAngle = planetAngle;
        
        // Check if this is a gas giant
        const isGasGiant = this.gasGiants?.includes(zoneId);
        
        let targetDistance, targetAngle;
        
        if (isGasGiant) {
            const radiusSpread = planetRadius * (2 + Math.random() * 3);
            const sign = Math.random() < 0.5 ? -1 : 1;
            targetDistance = userData.orbitRadius + sign * radiusSpread;
            const angularSpread = (4 * planetRadius) / targetDistance;
            targetAngle = planetAngle + (Math.random() - 0.5) * 2 * angularSpread;
        } else {
            const ringInner = userData.ringInner || (userData.orbitRadius * 0.8);
            const ringOuter = userData.ringOuter || (userData.orbitRadius * 1.2);
            targetDistance = ringInner + Math.random() * (ringOuter - ringInner);
            const angularSpread = (5 * planetRadius) / targetDistance;
            targetAngle = planetAngle + (Math.random() - 0.5) * 2 * angularSpread;
        }
        
        // Small vertical offset for disc thickness
        const yOffset = (Math.random() - 0.5) * 0.15;
        
        // Orbital speed based on Kepler's law at target distance
        const earthAU = this.planetData.earth.orbit_km / this.AU_KM;
        const earthOrbitRadius = this.scaleAUToVisual(earthAU);
        const keplerSpeed = 0.008 * Math.sqrt(earthOrbitRadius / targetDistance);
        const orbitalSpeed = keplerSpeed * 0.80 * (0.97 + Math.random() * 0.06);
        
        // Drift duration scales with distance traveled
        const distanceRatio = Math.abs(targetDistance - spawnDistance) / earthOrbitRadius;
        const baseDrift = this.particleDriftConfig.resourceBaseDurationDays;
        const scalingDrift = this.particleDriftConfig.resourceDistanceScalingDays;
        const driftDuration = baseDrift + distanceRatio * scalingDrift;
        
        // Add small visual size variance for natural look (±15%)
        const sizeVariance = 0.85 + Math.random() * 0.30;
        
        return {
            type: type,
            mass: mass,                    // Actual mass in kg
            visualSize: visualSize * sizeVariance,  // Visual size for rendering
            // For backwards compatibility with discrete tier system
            sizeClass: 'continuous',
            sizeVariance: 1.0,
            // Spawn position (at planet)
            spawnAngle: spawnAngle,
            spawnDistance: spawnDistance,
            // Target position
            targetAngle: targetAngle,
            targetDistance: targetDistance,
            yOffset: yOffset,
            orbitalSpeed: orbitalSpeed,
            planetOrbitalSpeed: planetOrbitalSpeed,
            // Animation state (times in game days)
            spawnTime: this.gameTime,
            drifting: true,
            driftDuration: driftDuration
        };
    }
    
    /**
     * Spawn a resource particle at a specific world position with incoming velocity direction.
     * Used for transfer arrivals - the particle drifts from its arrival position into the
     * destination zone's orbital cloud, carrying forward some of its transfer momentum.
     * @param {string} zoneId - Destination zone ID
     * @param {string} type - 'metal', 'slag', or 'methalox'
     * @param {number} mass - Particle mass in kg
     * @param {number} visualSize - Visual size for rendering
     * @param {THREE.Vector3} position - Arrival position in world coordinates
     * @param {THREE.Vector3} velocityDir - Normalized velocity direction (optional, for momentum)
     * @returns {Object} New particle data with position and drift animation
     */
    spawnResourceParticleAtPosition(zoneId, type, mass, visualSize, position, velocityDir = null) {
        const particleSystem = this.resourceParticles[zoneId];
        if (!particleSystem) return null;
        
        const userData = particleSystem.userData;
        const planet = this.planets[zoneId];
        const planetRadius = userData.planetRadius || 0.1;
        
        // Convert world position to polar coordinates (angle, distance from origin)
        const spawnDistance = Math.sqrt(position.x * position.x + position.z * position.z);
        const spawnAngle = Math.atan2(position.z, position.x);
        
        // Get zone's orbital properties for calculating target position
        const orbitRadius = userData.orbitRadius;
        const ringInner = userData.ringInner || (orbitRadius * 0.8);
        const ringOuter = userData.ringOuter || (orbitRadius * 1.2);
        
        // Calculate target position - spread particles into the orbital ring
        // If we have a velocity direction, bias the target angle in that direction
        // to simulate forward momentum carrying the particle into orbit
        let targetAngle;
        if (velocityDir) {
            // Calculate the angle of the velocity direction
            const velAngle = Math.atan2(velocityDir.z, velocityDir.x);
            // Bias target angle in the velocity direction (forward momentum)
            // The particle will drift "ahead" in the direction it was traveling
            const momentumBias = 0.2 + Math.random() * 0.3; // 0.2 to 0.5 radians ahead
            targetAngle = spawnAngle + momentumBias * Math.sign(Math.sin(velAngle - spawnAngle));
            // Add some random spread
            targetAngle += (Math.random() - 0.5) * 0.3;
        } else {
            // Random spread around spawn position
            const angularSpread = (5 * planetRadius) / orbitRadius;
            targetAngle = spawnAngle + (Math.random() - 0.5) * 2 * angularSpread;
        }
        
        // Target distance within the orbital ring
        const targetDistance = ringInner + Math.random() * (ringOuter - ringInner);
        
        // Small vertical offset for disc thickness
        const yOffset = position.y + (Math.random() - 0.5) * 0.05;
        
        // Orbital speed based on Kepler's law at target distance
        const earthAU = this.planetData.earth.orbit_km / this.AU_KM;
        const earthOrbitRadius = this.scaleAUToVisual(earthAU);
        const keplerSpeed = 0.008 * Math.sqrt(earthOrbitRadius / targetDistance);
        const orbitalSpeed = keplerSpeed * 0.80 * (0.97 + Math.random() * 0.06);
        
        // Initial speed: blend of orbital and incoming velocity direction
        // Faster initial drift to simulate deceleration from transfer orbit
        const planet_speed = planet?.userData?.orbitalSpeed || orbitalSpeed;
        
        // Longer drift duration for transfer arrivals (particles slow down gradually)
        // Distance ratio affects drift time - further drift takes longer
        const distanceRatio = Math.abs(targetDistance - spawnDistance) / earthOrbitRadius;
        const baseDrift = (this.particleDriftConfig?.resourceBaseDurationDays || 5) * 2; // Slower for arrivals
        const scalingDrift = this.particleDriftConfig?.resourceDistanceScalingDays || 20;
        const driftDuration = baseDrift + distanceRatio * scalingDrift;
        
        // Add small visual size variance for natural look (±15%)
        const sizeVariance = 0.85 + Math.random() * 0.30;
        
        return {
            type: type,
            mass: mass,
            visualSize: visualSize * sizeVariance,
            sizeClass: 'continuous',
            sizeVariance: 1.0,
            // Spawn position (where transfer arrived)
            spawnAngle: spawnAngle,
            spawnDistance: spawnDistance,
            // Target position (in orbital cloud)
            targetAngle: targetAngle,
            targetDistance: targetDistance,
            yOffset: yOffset,
            orbitalSpeed: orbitalSpeed,
            planetOrbitalSpeed: planet_speed,
            // Animation state (times in game days)
            spawnTime: this.gameTime,
            drifting: true,
            driftDuration: driftDuration,
            // Mark as transfer arrival for potential special handling
            fromTransfer: true
        };
    }
    
    /**
     * Create a "mass driver" particle that shoots out from a planet along a Hohmann transfer
     * This animation is used for launching material to the Dyson sphere
     * Particle shoots out from planet position and decelerates into target orbit
     * Uses unified Pareto distribution for mass/size (same as mining/recycling)
     * @param {string} fromZoneId - Source planet zone ID
     * @param {number} targetOrbitRadius - Target orbital radius (e.g., Dyson sphere)
     * @param {string} type - 'metal' or 'slag'
     * @param {number} massKg - Optional specific mass in kg (uses sampled if not provided)
     * @returns {Object} New particle data with Hohmann transfer parameters
     */
    spawnMassDriverParticle(fromZoneId, targetOrbitRadius, type, massKg = null) {
        const particleSystem = this.resourceParticles[fromZoneId];
        if (!particleSystem) return null;
        
        const userData = particleSystem.userData;
        const planet = this.planets[fromZoneId];
        
        // Get planet's current orbital angle for spawn position (or random for belt zones)
        const planetAngle = planet?.userData?.orbitalAngle || (Math.random() * Math.PI * 2);
        const planetOrbitRadius = userData.orbitRadius;
        
        // Random target angle in the target orbit
        const targetAngle = Math.random() * Math.PI * 2;
        
        // Small vertical offset
        const yOffset = (Math.random() - 0.5) * 0.1;
        
        // Orbital speed at target (Kepler's law)
        const earthAU = this.planetData.earth.orbit_km / this.AU_KM;
        const earthOrbitRadius = this.scaleAUToVisual(earthAU);
        const keplerSpeed = 0.008 * Math.sqrt(earthOrbitRadius / targetOrbitRadius);
        const orbitalSpeed = keplerSpeed * (0.95 + Math.random() * 0.1);
        
        // Use unified Pareto distribution for mass and visual size (same as mining/recycling)
        const mass = massKg !== null ? massKg : this.sampleParticleMassExponential();
        const visualSize = this.massToVisualSize(mass);
        // Add small variance for visual variety (±15%)
        const sizeVariance = 0.85 + Math.random() * 0.30;
        
        return {
            type: type,
            mass: mass,                        // Actual mass in kg (for mass conservation)
            visualSize: visualSize * sizeVariance,  // Visual size for rendering
            sizeClass: 'continuous',           // Uses continuous distribution (not discrete tiers)
            sizeVariance: 1.0,                 // Already applied above
            // Target orbital parameters (at Dyson sphere)
            targetAngle: targetAngle,
            targetDistance: targetOrbitRadius,
            yOffset: yOffset,
            orbitalSpeed: orbitalSpeed,
            // Spawn state: starts at planet position (times in game days)
            spawnTime: this.gameTime,
            spawnAngle: planetAngle,
            spawnDistance: planetOrbitRadius,
            drifting: true, // Uses drift animation to simulate Hohmann transfer
            driftDuration: this.particleDriftConfig.massDriverDurationDays
        };
    }
    
    /**
     * Count particles by size class in an array
     * @param {Array} particles - Array of particle objects
     * @returns {Object} {small: n, medium: n, large: n, xlarge: n, huge: n}
     */
    countParticlesBySize(particles) {
        const counts = { small: 0, medium: 0, large: 0, xlarge: 0, huge: 0 };
        particles.forEach(p => {
            const sizeClass = p.sizeClass || 'small';
            if (counts.hasOwnProperty(sizeClass)) {
                counts[sizeClass]++;
            }
        });
        return counts;
    }
    
    /**
     * Update resource particle visualization based on game state
     * Gradually spawns particles over time based on mining rate (not all at once)
     * Particles correspond to actual mass - each particle represents a specific mass
     * @param {Object} gameState - Current game state with zone data
     */
    updateResourceParticles(gameState) {
        if (!gameState || !gameState.zones) return;
        
        const zones = gameState.zones;
        const derived = gameState.derived || {};
        const zoneDerived = derived.zones || {};
        const currentTime = gameState.time || 0; // Game time in days
        
        Object.keys(this.resourceParticles).forEach(zoneId => {
            const particleSystem = this.resourceParticles[zoneId];
            const particleData = this.resourceParticleData[zoneId];
            const zone = zones[zoneId];
            const zoneData = zoneDerived[zoneId] || {};
            
            if (!particleSystem || !particleData || !zone) return;
            
            // Get current resource amounts
            const currentMetal = zone.stored_metal || 0;
            const currentSlag = zone.slag_mass || 0;
            const currentMethalox = zone.methalox || 0;
            
            // Get probe count and calculate overflow mass (>100M threshold)
            const probesByZone = gameState.probes_by_zone || {};
            const zoneProbes = probesByZone[zoneId] || {};
            const probeCount = zoneProbes['probe'] || 0;
            const probeMassKg = this.probeParticleConfig.probeMassKg || 100;
            const totalProbeMass = probeCount * probeMassKg;
            const overflowThreshold = this.probeSwarmConfig?.overflowThreshold || 100000000;
            const overflowProbeMass = Math.max(0, (probeCount - overflowThreshold) * probeMassKg);
            
            // Get previous resource amounts
            const prev = this.previousResources[zoneId] || { metal: 0, slag: 0, methalox: 0, probe: 0 };
            const prevMetal = prev.metal || 0;
            const prevSlag = prev.slag || 0;
            const prevMethalox = prev.methalox || 0;
            const prevProbeMass = prev.probe || 0;
            
            // Get production rates for this zone (kg/day)
            const metalMiningRate = zoneData.metal_mined_rate || 0;
            const slagMiningRate = zoneData.slag_produced_rate || 0;
            const methaloxProductionRate = zoneData.methalox_production_rate || 0;
            
            // Initialize pending mass tracking
            if (!this.pendingMass[zoneId]) {
                this.pendingMass[zoneId] = { metal: 0, slag: 0, methalox: 0, probe: 0 };
            }
            if (!this.lastUpdateTime[zoneId]) {
                this.lastUpdateTime[zoneId] = currentTime;
            }
            
            const pending = this.pendingMass[zoneId];
            const lastTime = this.lastUpdateTime[zoneId];
            const deltaTime = Math.max(0, currentTime - lastTime); // Days elapsed
            
            // Calculate mass changes since last update
            const metalIncrease = currentMetal - prevMetal;
            const slagIncrease = currentSlag - prevSlag;
            const methaloxIncrease = currentMethalox - prevMethalox;
            const probeMassIncrease = overflowProbeMass - prevProbeMass;
            
            // Add new mass to pending (mass that needs to become particles)
            // Only add if resources actually increased
            if (metalIncrease > 0) {
                pending.metal += metalIncrease;
            }
            if (slagIncrease > 0) {
                pending.slag += slagIncrease;
            }
            if (methaloxIncrease > 0) {
                pending.methalox += methaloxIncrease;
            }
            // Only add overflow probe mass (>100M threshold)
            if (probeMassIncrease > 0) {
                pending.probe += probeMassIncrease;
            }
            
            // Get max particles for this resource type
            const maxMetalParticles = this.maxParticlesByType.metal;
            const maxSlagParticles = this.maxParticlesByType.slag;
            const maxMethaloxParticles = this.maxParticlesByType.methalox;
            // Probe particles use same max as metal (they're similar in nature)
            const maxProbeParticles = this.maxParticlesByType.metal;
            
            // Helper function to gradually spawn particles using exponential distribution
            // Produces natural "many small, few large" particle sizes
            // Spawn rate is controlled to prevent visual overload
            const spawnParticlesGradually = (particles, pendingMass, miningRate, resourceType, maxParticles) => {
                if (pendingMass <= 0) return pendingMass;
                
                const config = this.particleDistribution;
                
                // Calculate target spawn rate based on mining rate
                const spawnRate = this.calculateParticleSpawnRate(miningRate);
                const spawnInterval = 1.0 / spawnRate; // Days between spawns
                
                // Check if enough time has passed since last spawn
                const lastSpawnKey = `${zoneId}_${resourceType}_lastSpawn`;
                if (!this.lastSpawnTime) this.lastSpawnTime = {};
                const lastSpawn = this.lastSpawnTime[lastSpawnKey] || 0;
                const timeSinceSpawn = currentTime - lastSpawn;
                
                // Only spawn if enough time has passed (rate limiting)
                if (timeSinceSpawn < spawnInterval && lastSpawn > 0) {
                    return pendingMass; // Not time to spawn yet
                }
                
                // Check total particle count limit
                if (particles.length >= this.maxResourceParticles) {
                    return pendingMass;
                }
                
                // Calculate how many particles to spawn this update
                // Allow catching up if we're behind, but cap to prevent bursts
                const catchUpParticles = Math.floor(timeSinceSpawn / spawnInterval);
                const maxParticlesPerUpdate = 3; // Cap to prevent sudden bursts
                const particlesToSpawn = Math.min(maxParticlesPerUpdate, Math.max(1, catchUpParticles));
                
                let spawned = 0;
                for (let i = 0; i < particlesToSpawn && pendingMass > config.minMass; i++) {
                    // Sample mass from exponential distribution
                    const particleMass = this.sampleParticleMassExponential(miningRate);
                    
                    // Only spawn if we have enough pending mass
                    if (pendingMass >= particleMass) {
                        // Calculate visual size from mass
                        const visualSize = this.massToVisualSize(particleMass);
                        
                        // Spawn particle with sampled mass and size
                        const particle = this.spawnResourceParticleWithMass(zoneId, resourceType, particleMass, visualSize);
                        
                        if (particle) {
                            particles.push(particle);
                            pendingMass -= particleMass;
                            spawned++;
                        }
                    }
                }
                
                if (spawned > 0) {
                    this.lastSpawnTime[lastSpawnKey] = currentTime;
                }
                
                return pendingMass;
            };
            
            // Helper function to remove particles when mass decreases
            // Handles both continuous mass particles and legacy discrete tier particles
            const removeParticlesForDecrease = (particles, massDecrease) => {
                if (massDecrease >= 0) return;
                
                const toRemoveMass = Math.abs(massDecrease);
                let remainingToRemove = toRemoveMass;
                
                // Sort all particles by mass (largest first) for efficient removal
                // For continuous particles, use actual mass; for discrete, use tier mass
                const particlesWithMass = particles.map((p, idx) => ({
                    particle: p,
                    index: idx,
                    mass: p.mass !== undefined ? p.mass : 
                          (this.resourceSizes[p.sizeClass || 'small']?.mass || this.resourceSizes.small.mass),
                    spawnTime: p.spawnTime || 0
                }));
                
                // Sort by mass descending, then by spawn time ascending (oldest first within same mass)
                particlesWithMass.sort((a, b) => {
                    if (b.mass !== a.mass) return b.mass - a.mass;
                    return a.spawnTime - b.spawnTime;
                });
                
                // Remove particles until we've accounted for the mass decrease
                const indicesToRemove = [];
                for (const item of particlesWithMass) {
                    if (remainingToRemove <= 0) break;
                    indicesToRemove.push(item.index);
                    remainingToRemove -= item.mass;
                }
                
                // Remove in reverse index order to avoid shifting issues
                indicesToRemove.sort((a, b) => b - a);
                for (const idx of indicesToRemove) {
                    particles.splice(idx, 1);
                }
            };
            
            // Gradually spawn metal particles from pending mass
            pending.metal = spawnParticlesGradually(
                particleData.metal, 
                pending.metal, 
                metalMiningRate, 
                'metal', 
                maxMetalParticles
            );
            
            // Gradually spawn slag particles from pending mass
            pending.slag = spawnParticlesGradually(
                particleData.slag, 
                pending.slag, 
                slagMiningRate, 
                'slag', 
                maxSlagParticles
            );
            
            // Gradually spawn methalox particles from pending mass
            pending.methalox = spawnParticlesGradually(
                particleData.methalox, 
                pending.methalox, 
                methaloxProductionRate, 
                'methalox', 
                maxMethaloxParticles
            );
            
            // Gradually spawn probe particles from pending overflow mass (>100M threshold)
            // Use probe production rate for spawn rate calculation
            const probeProductionRate = probeMassIncrease > 0 ? probeMassIncrease / Math.max(0.01, deltaTime) : 0;
            pending.probe = spawnParticlesGradually(
                particleData.probe, 
                pending.probe, 
                probeProductionRate, 
                'probe', 
                maxProbeParticles
            );
            
            // Handle resource decreases (consumption)
            if (metalIncrease < 0) {
                removeParticlesForDecrease(particleData.metal, metalIncrease);
                // Also reduce pending if we consumed more than we had in particles
                const totalParticleMass = particleData.metal.reduce((sum, p) => {
                    const sizeClass = p.sizeClass || 'small';
                    return sum + this.resourceSizes[sizeClass].mass;
                }, 0);
                if (totalParticleMass < currentMetal) {
                    // We consumed more than particles represent, reduce pending
                    pending.metal = Math.max(0, pending.metal + metalIncrease);
                }
            }
            
            if (slagIncrease < 0) {
                removeParticlesForDecrease(particleData.slag, slagIncrease);
                // Also reduce pending if we consumed more than we had in particles
                const totalParticleMass = particleData.slag.reduce((sum, p) => {
                    const sizeClass = p.sizeClass || 'small';
                    return sum + this.resourceSizes[sizeClass].mass;
                }, 0);
                if (totalParticleMass < currentSlag) {
                    // We consumed more than particles represent, reduce pending
                    pending.slag = Math.max(0, pending.slag + slagIncrease);
                }
            }
            
            if (methaloxIncrease < 0) {
                removeParticlesForDecrease(particleData.methalox, methaloxIncrease);
                // Also reduce pending if we consumed more than we had in particles
                const totalParticleMass = particleData.methalox.reduce((sum, p) => {
                    const sizeClass = p.sizeClass || 'small';
                    return sum + this.resourceSizes[sizeClass].mass;
                }, 0);
                if (totalParticleMass < currentMethalox) {
                    // We consumed more than particles represent, reduce pending
                    pending.methalox = Math.max(0, pending.methalox + methaloxIncrease);
                }
            }
            
            // Handle probe mass decreases (consumption/transfer)
            if (probeMassIncrease < 0) {
                removeParticlesForDecrease(particleData.probe, probeMassIncrease);
                // Also reduce pending if we consumed more than we had in particles
                const totalParticleMass = particleData.probe.reduce((sum, p) => {
                    return sum + (p.mass || this.particleDistribution.minMass);
                }, 0);
                if (totalParticleMass < overflowProbeMass) {
                    // We consumed more than particles represent, reduce pending
                    pending.probe = Math.max(0, pending.probe + probeMassIncrease);
                }
            }
            
            // Update previous tracking
            this.previousResources[zoneId] = {
                metal: currentMetal,
                slag: currentSlag,
                methalox: currentMethalox,
                probe: overflowProbeMass
            };
            this.lastUpdateTime[zoneId] = currentTime;
            
            // Rebuild the particle buffer with all active particles
            this.rebuildResourceParticleBuffer(zoneId);
        });
    }
    
    /**
     * Rebuild the particle buffer for a zone with current active particles
     * All zones now use accretion disc mode for a continuous disc effect
     * Particles drift from their spawn position (at planet/body) to their target orbital position
     * @param {string} zoneId - Zone ID
     */
    rebuildResourceParticleBuffer(zoneId) {
        const particleSystem = this.resourceParticles[zoneId];
        const particleData = this.resourceParticleData[zoneId];
        
        if (!particleSystem || !particleData) return;
        
        // Combine all particle types: resources + individual probes + probe particles
        const probeParticles = this.probeParticles[zoneId] || [];
        const individualProbes = this.individualProbes[zoneId] || [];
        const allParticles = [
            ...particleData.metal, 
            ...particleData.slag, 
            ...particleData.methalox,
            ...particleData.probe,  // Overflow probe particles (>100M)
            ...individualProbes,
            ...probeParticles
        ];
        const positions = particleSystem.geometry.attributes.position.array;
        const colors = particleSystem.geometry.attributes.color.array;
        const sizeAttr = particleSystem.geometry.attributes.size;
        const sizes = sizeAttr ? sizeAttr.array : null;
        
        for (let i = 0; i < allParticles.length && i < this.maxResourceParticles; i++) {
            const p = allParticles[i];
            const timeSinceSpawn = this.gameTime - p.spawnTime;
            let currentAngle, currentDistance;
            
            if (p.drifting) {
                // Particle is drifting from spawn position (at planet) to target orbital position
                const driftDuration = p.driftDuration || this.particleDriftDuration;
                const driftProgress = Math.min(1, timeSinceSpawn / driftDuration);
                // Ease-out cubic for smooth deceleration into orbit
                const eased = 1 - Math.pow(1 - driftProgress, 3);
                
                // Interpolate angle and distance from spawn to target
                // Use shortest angular path
                let angleDiff = p.targetAngle - p.spawnAngle;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                
                const baseAngle = p.spawnAngle + angleDiff * eased;
                // Blend orbital speed from planet's speed to particle's target speed
                // This makes particles inherit planet velocity and gradually slow down
                const planetSpeed = p.planetOrbitalSpeed || p.orbitalSpeed;
                const blendedSpeed = planetSpeed * (1 - eased) + p.orbitalSpeed * eased;
                const orbitalOffset = timeSinceSpawn * blendedSpeed;
                currentAngle = baseAngle + orbitalOffset;
                currentDistance = p.spawnDistance + (p.targetDistance - p.spawnDistance) * eased;
                
                if (driftProgress >= 1) {
                    p.drifting = false;
                    // Store final position for orbiting and the time when drift ended
                    p.orbitAngle = currentAngle;
                    p.orbitDistance = p.targetDistance;
                    p.driftEndTime = this.gameTime; // Track when drift ended for continuous orbital motion
                }
            } else {
                // Particle has settled into orbit - continues orbiting at target distance
                // Only add orbital motion for time AFTER drift ended (avoid double-counting)
                const timeSinceDriftEnd = this.gameTime - (p.driftEndTime || p.spawnTime);
                const orbitalOffset = Math.max(0, timeSinceDriftEnd) * p.orbitalSpeed;
                currentAngle = (p.orbitAngle || p.targetAngle) + orbitalOffset;
                currentDistance = p.orbitDistance || p.targetDistance;
            }
            
            // Calculate position in ecliptic plane (orbiting sun at origin)
            const x = Math.cos(currentAngle) * currentDistance;
            const y = p.yOffset; // Small vertical offset for disc thickness
            const z = Math.sin(currentAngle) * currentDistance;
            
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
            
            // Set color based on type
            let color;
            if (p.type === 'metal') {
                color = this.resourceColors.metal;
            } else if (p.type === 'methalox') {
                color = this.resourceColors.methalox;
            } else if (p.type === 'probe') {
                color = this.resourceColors.probe;
            } else if (p.type === 'individual_probe' || p.type === 'probe_particle') {
                color = this.probeParticleConfig.color;
            } else {
                color = this.resourceColors.slag;
            }
            // Add slight variation based on index
            const variation = 0.12;
            const varSeed = (i * 0.618) % 1;
            colors[i * 3] = Math.max(0, Math.min(1, color.r + (varSeed - 0.5) * variation));
            colors[i * 3 + 1] = Math.max(0, Math.min(1, color.g + (varSeed - 0.5) * variation));
            colors[i * 3 + 2] = Math.max(0, Math.min(1, color.b + (varSeed - 0.5) * variation));
            
            // Set size: use visualSize for continuous distribution, or sizeClass for discrete tiers
            if (sizes) {
                if (p.visualSize !== undefined) {
                    // New continuous distribution mode
                    sizes[i] = p.visualSize;
                } else {
                    // Legacy discrete tier mode
                    const sizeClass = p.sizeClass || 'small';
                    const baseSize = this.resourceSizes[sizeClass]?.size || this.resourceSizes.small.size;
                    const variance = p.sizeVariance || 1.0;
                    sizes[i] = baseSize * variance;
                }
            }
        }
        
        particleSystem.geometry.attributes.position.needsUpdate = true;
        particleSystem.geometry.attributes.color.needsUpdate = true;
        if (particleSystem.geometry.attributes.size) {
            particleSystem.geometry.attributes.size.needsUpdate = true;
        }
        particleSystem.geometry.setDrawRange(0, Math.min(allParticles.length, this.maxResourceParticles));
    }

    update(deltaTime) {
        this.time += deltaTime;
        
        // Interpolate game time for smooth particle animation between game state updates
        // deltaTime is in render seconds (0.016 * timeSpeed), game time is in days
        // At 1x speed: 60 ticks = 1 day = ~1 real second, so 1 day ≈ 0.96 render seconds
        // Convert: gameTimeDelta = deltaTime / 0.96 ≈ deltaTime * 1.04
        this.gameTime += deltaTime * 1.04;

        // Update sun rays animation
        if (this.sunRays && this.sunRays.material.uniforms) {
            this.sunRays.material.uniforms.time.value = this.time;
        }

        // Update sun light intensity (subtle pulsing) - maintain high base intensity
        if (this.sunLight) {
            this.sunLight.intensity = 8 + Math.sin(this.time * 0.5) * 0.5;  // Increased base from 3 to 8, pulse from 0.2 to 0.5
        }

        // Update planet positions (simple orbital animation)
        Object.values(this.planets).forEach(planet => {
            if (planet.userData) {
                planet.userData.orbitalAngle += planet.userData.orbitalSpeed * deltaTime;
                const radius = planet.userData.radius;
                planet.position.x = Math.cos(planet.userData.orbitalAngle) * radius;
                planet.position.z = Math.sin(planet.userData.orbitalAngle) * radius;
            }
            
            // Planet materials are now simple solid colors, no uniform updates needed
            
            // Update atmosphere shaders with sun position
            if (planet.userData && planet.userData.atmosphere) {
                const atmo = planet.userData.atmosphere;
                if (atmo.material.uniforms && atmo.material.uniforms.sunPosition) {
                    atmo.material.uniforms.sunPosition.value.set(0, 0, 0);
                }
            }
        });

        // Update moon positions - moons orbit around their planets
        Object.entries(this.moons).forEach(([zoneId, moonList]) => {
            const planet = this.planets[zoneId];
            if (!planet) return;
            
            moonList.forEach(moon => {
                if (moon.userData) {
                    // Update moon's orbital angle
                    moon.userData.orbitalAngle += moon.userData.orbitalSpeed * deltaTime;
                    
                    const orbitDist = moon.userData.moonOrbitDistance;
                    const angle = moon.userData.orbitalAngle;
                    const planetTilt = moon.userData.planetTilt || 0;
                    const moonInclination = moon.userData.moonInclination || 0;
                    
                    // Calculate position in the moon's orbital plane (before tilt)
                    // x-z plane is the orbital plane
                    let localX = Math.cos(angle) * orbitDist;
                    let localY = Math.sin(angle) * orbitDist * Math.sin(moonInclination);
                    let localZ = Math.sin(angle) * orbitDist * Math.cos(moonInclination);
                    
                    // For planets with tilted equatorial planes (Saturn, Uranus),
                    // rotate the moon's orbit to match the planet's equatorial tilt
                    if (moon.userData.orbitInEquatorialPlane && planetTilt !== 0) {
                        // Rotate around X axis by planet's axial tilt
                        const cosTilt = Math.cos(planetTilt);
                        const sinTilt = Math.sin(planetTilt);
                        
                        const rotatedY = localY * cosTilt - localZ * sinTilt;
                        const rotatedZ = localY * sinTilt + localZ * cosTilt;
                        
                        localY = rotatedY;
                        localZ = rotatedZ;
                    }
                    
                    // Position moon relative to planet's current position
                    moon.position.x = planet.position.x + localX;
                    moon.position.y = planet.position.y + localY;
                    moon.position.z = planet.position.z + localZ;
                }
            });
        });
        
        // Update asteroid belt orbital motion
        if (this.asteroidBelt && this.asteroidBelt.userData && this.asteroidBelt.userData.asteroidData) {
            const asteroidData = this.asteroidBelt.userData.asteroidData;
            const positions = this.asteroidBelt.userData.positions;
            const geometry = this.asteroidBelt.geometry;
            
            for (let i = 0; i < asteroidData.length; i++) {
                const asteroid = asteroidData[i];
                // Update orbital angle
                asteroid.angle += asteroid.orbitalSpeed * deltaTime;
                
                // Update position
                positions[i * 3] = Math.cos(asteroid.angle) * asteroid.distance;
                positions[i * 3 + 1] = asteroid.yOffset; // Keep vertical offset constant
                positions[i * 3 + 2] = Math.sin(asteroid.angle) * asteroid.distance;
            }
            
            // Update geometry attribute
            geometry.attributes.position.needsUpdate = true;
        }
        
        // Update major asteroids (Ceres, Vesta, etc.)
        if (this.majorAsteroids) {
            Object.values(this.majorAsteroids).forEach(asteroid => {
                if (asteroid.userData) {
                    // Update orbital angle
                    asteroid.userData.orbitalAngle += asteroid.userData.orbitalSpeed * deltaTime;
                    
                    const angle = asteroid.userData.orbitalAngle;
                    const orbitDist = asteroid.userData.orbitDistance;
                    const inclination = asteroid.userData.inclination || 0;
                    
                    // Calculate position with inclination
                    asteroid.position.x = Math.cos(angle) * orbitDist;
                    asteroid.position.z = Math.sin(angle) * orbitDist;
                    asteroid.position.y = Math.sin(angle) * orbitDist * Math.sin(inclination) * 0.3;
                    
                    // Rotate asteroid on its axis (tumbling effect)
                    if (asteroid.userData.rotationSpeed && asteroid.userData.rotationAxis) {
                        const rotSpeed = asteroid.userData.rotationSpeed * deltaTime;
                        const axis = asteroid.userData.rotationAxis;
                        
                        // Apply rotation around the random axis
                        asteroid.rotateOnAxis(axis, rotSpeed);
                    }
                }
            });
        }

        // Update Kuiper belt orbital motion
        if (this.kuiperBelt && this.kuiperBelt.userData && this.kuiperBelt.userData.kuiperData) {
            const kuiperData = this.kuiperBelt.userData.kuiperData;
            const positions = this.kuiperBelt.userData.positions;
            const geometry = this.kuiperBelt.geometry;
            
            for (let i = 0; i < kuiperData.length; i++) {
                const obj = kuiperData[i];
                // Update orbital angle (very slow)
                obj.angle += obj.orbitalSpeed * deltaTime;
                
                // Update position
                positions[i * 3] = Math.cos(obj.angle) * obj.distance;
                positions[i * 3 + 1] = obj.yOffset;
                positions[i * 3 + 2] = Math.sin(obj.angle) * obj.distance;
            }
            
            // Update geometry attribute
            geometry.attributes.position.needsUpdate = true;
        }
        
        // Update zone clouds
        if (this.zoneClouds) {
            this.zoneClouds.update(deltaTime);
        }
        
        // Update planet ring shaders
        if (this.planetRings) {
            Object.values(this.planetRings).forEach(ringData => {
                if (ringData.mesh && ringData.mesh.material && ringData.mesh.material.uniforms) {
                    ringData.mesh.material.uniforms.time.value = this.time;
                }
            });
        }
        
        // Update comet positions
        this.comets.forEach(comet => {
            if (comet.userData) {
                const orbitalData = comet.userData;
                
                // Update mean anomaly using orbital speed (radians per second)
                // Similar to how planets are animated
                orbitalData.meanAnomaly += orbitalData.orbitalSpeed * deltaTime;
                
                // Normalize mean anomaly to [0, 2π]
                while (orbitalData.meanAnomaly > Math.PI * 2) {
                    orbitalData.meanAnomaly -= Math.PI * 2;
                }
                while (orbitalData.meanAnomaly < 0) {
                    orbitalData.meanAnomaly += Math.PI * 2;
                }
                
                // Calculate new position
                const newPosition = this.calculateCometPosition(
                    orbitalData.semiMajorAxis,
                    orbitalData.eccentricity,
                    orbitalData.inclination,
                    orbitalData.argumentOfPeriapsis,
                    orbitalData.meanAnomaly,
                    orbitalData.longitudeOfAscendingNode || 0
                );
                
                comet.position.copy(newPosition);
            }
        });
        
        // Update resource particle positions (metal/slag orbiting planets)
        this.updateResourceParticlePositions(deltaTime);
    }
    
    /**
     * Update resource particle positions each frame for smooth animation
     * Called from update() to animate resource particles drifting and orbiting
     * @param {number} deltaTime - Time delta in seconds
     */
    updateResourceParticlePositions(deltaTime) {
        Object.keys(this.resourceParticles).forEach(zoneId => {
            // Rebuild particle buffer updates positions based on current time
            // This handles both orbital motion and drift animation
            this.rebuildResourceParticleBuffer(zoneId);
        });
    }

    /**
     * Get the current 3D position of a planet/zone
     * @param {string} zoneId - The zone ID
     * @returns {THREE.Vector3|null} The position or null if not found
     */
    getZonePosition(zoneId) {
        // Dyson zone centers on the sun (origin)
        if (zoneId === 'dyson_sphere' || zoneId === 'dyson') {
            return new THREE.Vector3(0, 0, 0);
        }
        
        // Asteroid belt focuses on Ceres as the de facto center (home planet)
        if (zoneId === 'asteroid_belt' && this.ceres) {
            return this.ceres.position.clone();
        }
        
        // Kuiper belt uses Pluto as its home planet (stored as 'kuiper' in planets)
        // This handles both 'kuiper' and 'kuiper_belt' zone IDs
        if ((zoneId === 'kuiper' || zoneId === 'kuiper_belt') && this.planets['kuiper']) {
            return this.planets['kuiper'].position.clone();
        }
        
        const planet = this.planets[zoneId];
        if (planet) {
            return planet.position.clone();
        }
        return null;
    }
    
    /**
     * Get the orbit radius for a zone (for camera distance calculation)
     * @param {string} zoneId - The zone ID
     * @returns {number} The orbit radius or 0 if not found
     */
    getZoneOrbitRadius(zoneId) {
        // Special handling for Dyson zone
        if (zoneId === 'dyson_sphere' || zoneId === 'dyson') {
            return this.dysonOrbitRadius || 0;
        }
        
        const planet = this.planets[zoneId];
        if (planet && planet.userData) {
            return planet.userData.radius;
        }
        return 0;
    }

    updateZoneDepletion(gameState) {
        if (!gameState || !gameState.zones) return;

        // Update game time for particle animations (proportional to in-game ticks)
        this.gameTime = gameState.time || 0;

        const zones = gameState.zones || {};
        
        // Update zone clouds
        if (this.zoneClouds) {
            this.zoneClouds.updateClouds(gameState);
        }
        
        // Update belt/cloud visualizations based on mining
        this.updateBeltDepletion(gameState);
        
        // Update resource particles (metal and slag orbiting planets)
        // Spawns new particles when resources increase, removes when consumed
        this.updateResourceParticles(gameState);
        
        // Update probe particles (individual probes up to 100, then mass particles)
        // Uses same Pareto distribution as resources for visual consistency
        this.updateProbeParticles(gameState);

        // Update visual appearance based on mass remaining
        Object.keys(this.planets).forEach(zoneId => {
            const planet = this.planets[zoneId];
            const orbit = this.orbits[zoneId];
            const zone = zones[zoneId];
            
            if (!planet || !zone) return;
            
            const initialMass = this.initialZoneMasses[zoneId];
            const massRemaining = zone.mass_remaining || 0;
            const isDepleted = zone.depleted || false;
            
            if (!initialMass || initialMass <= 0) {
                // No mass data, use simple depleted flag
                if (isDepleted) {
                    if (planet.material) {
                        if (planet.material.color) {
                            planet.material.color.setHex(0x333333);
                        }
                        if (planet.material.emissive) {
                            planet.material.emissive.setHex(0x000000);
                        }
                    }
                    if (orbit && orbit.material) {
                        orbit.material.opacity = 0.1;
                        if (orbit.material.color) {
                            orbit.material.color.setHex(0x333333);
                        }
                    }
                }
                return;
            }
            
            const massPercentage = massRemaining / initialMass;
            
            // Phase 1: Moons disappear (75%-100% mass remaining)
            if (massPercentage > 0.75 && massPercentage <= 1.0) {
                const moonFadeStart = 0.75;
                const moonFadeEnd = 1.0;
                const moonFadeProgress = (massPercentage - moonFadeStart) / (moonFadeEnd - moonFadeStart);
                
                const moonList = this.moons[zoneId] || [];
                if (moonList.length > 0) {
                    // Sort moons by size (smallest first)
                    const sortedMoons = [...moonList].sort((a, b) => {
                        const aRadius = a.geometry?.parameters?.radius || 0;
                        const bRadius = b.geometry?.parameters?.radius || 0;
                        return aRadius - bRadius;
                    });
                    
                    // Fade out moons starting with smallest
                    const moonsToHide = Math.floor((1 - moonFadeProgress) * sortedMoons.length);
                    sortedMoons.forEach((moon, index) => {
                        if (index < moonsToHide) {
                            moon.visible = false;
                        } else {
                            const fadeAmount = Math.max(0, 1 - (moonsToHide + 1 - index));
                            moon.visible = true;
                            if (moon.material) {
                                moon.material.opacity = fadeAmount;
                            }
                        }
                    });
                }
            } else if (massPercentage <= 0.75) {
                // Hide all moons below 75%
                const moonList = this.moons[zoneId] || [];
                moonList.forEach(moon => {
                    moon.visible = false;
                });
            } else {
                // Show all moons above 100% (shouldn't happen, but handle it)
                const moonList = this.moons[zoneId] || [];
                moonList.forEach(moon => {
                    moon.visible = true;
                    if (moon.material) {
                        moon.material.opacity = 1.0;
                    }
                });
            }
            
            // Phase 2: Planet shrinks and desaturates (25%-75% mass remaining)
            if (massPercentage > 0.25 && massPercentage <= 0.75) {
                const shrinkStart = 0.25;
                const shrinkEnd = 0.75;
                const shrinkProgress = (massPercentage - shrinkStart) / (shrinkEnd - shrinkStart);
                
                // Scale planet size (from 100% at 75% mass to 30% at 25% mass)
                const minScale = 0.3;
                const scale = minScale + (1.0 - minScale) * shrinkProgress;
                
                if (planet.userData && planet.userData.originalRadius) {
                    const originalRadius = planet.userData.originalRadius;
                    planet.scale.set(scale, scale, scale);
                } else {
                    // Store original radius if not stored
                    const planetInfo = this.planetData[zoneId];
                    if (planetInfo) {
                        const originalRadius = this.logScaleRadius(planetInfo.radius_km);
                        planet.userData.originalRadius = originalRadius;
                        planet.scale.set(scale, scale, scale);
                    }
                }
                
                // Desaturate color toward grey
                if (planet.material && planet.material.color && this.orbitalData) {
                    const zone = this.orbitalData.orbital_zones.find(z => z.id === zoneId);
                    if (zone) {
                        const originalColor = new THREE.Color(zone.color || '#888888');
                        const greyColor = new THREE.Color(0x666666);
                        const desaturatedColor = originalColor.clone().lerp(greyColor, 1 - shrinkProgress);
                        planet.material.color.copy(desaturatedColor);
                    }
                }
                
                // Keep orbit visible but fade it
                if (orbit && orbit.material) {
                    orbit.material.opacity = 0.2 * shrinkProgress;
                }
            }
            
            // Phase 3: Planet disappears (0%-25% mass remaining)
            if (massPercentage <= 0.25) {
                const fadeStart = 0.25;
                const fadeEnd = 0.0;
                const fadeProgress = massPercentage > 0 ? (massPercentage - fadeEnd) / (fadeStart - fadeEnd) : 0;
                
                // Fade out planet
                planet.visible = fadeProgress > 0.05; // Hide when very small
                if (planet.material) {
                    planet.material.opacity = fadeProgress;
                    if (planet.material.color) {
                        planet.material.color.setHex(0x333333); // Grey when fading
                    }
                }
                
                // Scale down further
                const minScale = 0.05;
                const scale = minScale + (0.3 - minScale) * fadeProgress;
                if (planet.userData && planet.userData.originalRadius) {
                    planet.scale.set(scale, scale, scale);
                }
                
                // Fade orbit line
                if (orbit && orbit.material) {
                    orbit.material.opacity = 0.1 * fadeProgress;
                    orbit.material.color.setHex(0x333333);
                }
            }
            
            // Restore normal appearance if mass is above thresholds
            if (massPercentage > 0.75) {
                // Restore planet size and color
                if (planet.userData && planet.userData.originalRadius) {
                    planet.scale.set(1, 1, 1);
                }
                if (planet.material && this.orbitalData) {
                    const zone = this.orbitalData.orbital_zones.find(z => z.id === zoneId);
                    if (zone && planet.userData) {
                        if (planet.material.color) {
                            planet.material.color.setStyle(zone.color || '#888888');
                        }
                        planet.material.opacity = 1.0;
                        if (planet.material.emissive) {
                            planet.material.emissive.setHex(0x000000);
                        }
                    }
                }
                planet.visible = true;
                
                // Restore moons
                const moonList = this.moons[zoneId] || [];
                moonList.forEach(moon => {
                    moon.visible = true;
                    if (moon.material) {
                        moon.material.opacity = 1.0;
                    }
                });
                
                // Restore orbit
                if (orbit && orbit.material && this.orbitalData) {
                    const zone = this.orbitalData.orbital_zones.find(z => z.id === zoneId);
                    if (zone) {
                        orbit.material.opacity = 0.3;
                        orbit.material.color.setStyle(zone.color || '#555555');
                    }
                }
            }
        });
    }
    
    /**
     * Update belt/cloud visualizations (asteroid belt, Kuiper belt, Oort cloud)
     * Remove particles as mass is mined from these zones
     */
    updateBeltDepletion(gameState) {
        if (!gameState || !gameState.zones) return;
        
        const zones = gameState.zones || {};
        
        // Update asteroid belt
        if (this.asteroidBelt && zones['asteroid_belt']) {
            const zone = zones['asteroid_belt'];
            const originalMass = this.initialZoneMasses['asteroid_belt'] || zone.total_mass_kg || 3.0e21;
            const massRemaining = zone.mass_remaining || 0;
            const massRatio = originalMass > 0 ? Math.max(0, Math.min(1, massRemaining / originalMass)) : 1;
            
            // Update draw range based on mass ratio
            const totalParticles = this.asteroidBelt.userData.totalParticles || 10000;
            const visibleParticles = Math.floor(totalParticles * massRatio);
            this.asteroidBelt.geometry.setDrawRange(0, visibleParticles);
            this.asteroidBelt.visible = visibleParticles > 0;
        }
        
        // Update Kuiper belt
        if (this.kuiperBelt && zones['kuiper']) {
            const zone = zones['kuiper'];
            const originalMass = this.initialZoneMasses['kuiper'] || zone.total_mass_kg || 5.97e23;
            const massRemaining = zone.mass_remaining || 0;
            const massRatio = originalMass > 0 ? Math.max(0, Math.min(1, massRemaining / originalMass)) : 1;
            
            // Update draw range based on mass ratio
            const totalParticles = this.kuiperBelt.userData.totalParticles || 8000;
            const visibleParticles = Math.floor(totalParticles * massRatio);
            this.kuiperBelt.geometry.setDrawRange(0, visibleParticles);
            this.kuiperBelt.visible = visibleParticles > 0;
        }
        
        // Update Oort cloud
        if (this.oortCloud && zones['oort_cloud']) {
            const zone = zones['oort_cloud'];
            const originalMass = this.initialZoneMasses['oort_cloud'] || zone.total_mass_kg || 5.97e25;
            const massRemaining = zone.mass_remaining || 0;
            const massRatio = originalMass > 0 ? Math.max(0, Math.min(1, massRemaining / originalMass)) : 1;
            
            // Update draw range based on mass ratio
            const totalParticles = 15000; // Oort cloud particle count
            const visibleParticles = Math.floor(totalParticles * massRatio);
            this.oortCloud.geometry.setDrawRange(0, visibleParticles);
            this.oortCloud.visible = visibleParticles > 0;
        }
    }
    
    /**
     * Toggle visibility of orbital lines (planet orbits, comet orbits)
     * @param {boolean} [visible] - Optional explicit visibility. If not provided, toggles current state.
     * @returns {boolean} New visibility state
     */
    toggleOrbitalLines(visible) {
        // Determine new visibility state
        if (visible === undefined) {
            // Toggle based on current state of first orbit
            const firstOrbitId = Object.keys(this.orbits)[0];
            visible = firstOrbitId ? !this.orbits[firstOrbitId].visible : true;
        }
        
        // Toggle planet orbits
        for (const orbitId in this.orbits) {
            if (this.orbits[orbitId]) {
                this.orbits[orbitId].visible = visible;
            }
        }
        
        // Toggle comet orbits
        for (const cometIndex in this.cometOrbits) {
            if (this.cometOrbits[cometIndex]) {
                this.cometOrbits[cometIndex].visible = visible;
            }
        }
        
        return visible;
    }
    
    /**
     * Get current visibility state of orbital lines
     * @returns {boolean} Current visibility state
     */
    getOrbitalLinesVisible() {
        const firstOrbitId = Object.keys(this.orbits)[0];
        return firstOrbitId ? this.orbits[firstOrbitId].visible : true;
    }
}

