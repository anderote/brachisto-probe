/** Zone Clouds Visualization - Probes, Metal, and Slag clouds around each planet */
class ZoneClouds {
    constructor(scene, solarSystem) {
        this.scene = scene;
        this.solarSystem = solarSystem;
        this.clouds = {}; // {zoneId: {probes: THREE.Points, metal: THREE.Points, slag: THREE.Points}}
        this.cloudData = {}; // {zoneId: {probes: [...], metal: [...], slag: [...]}}
        this.beltClouds = {}; // {zoneId: {probes: THREE.Points, metal: THREE.Points, slag: THREE.Points}} for belt zones
        this.maxParticlesPerCloud = 4000; // Max particles per cloud type (for buffer allocation)
        
        // Maximum dot counts for each cloud type
        this.maxDots = {
            probes: 120,   // Polar rings: 6 rings × 20 dots = 120 max
            metal: 1200,
            slag: 1200
        };
        
        // Minimum thresholds before dots appear
        this.minThresholds = {
            probes: 0,      // Probes show immediately
            metal: 100000,   // 100,000kg minimum for metal (1 dot)
            slag: 100000     // 100,000kg minimum for slag (1 dot)
        };
        
        // Transit visualization (resources in transit between zones)
        this.transitParticles = null; // THREE.Points for transit visualization
        this.maxTransitParticles = 200; // Maximum transit particles to show
        
        // Cloud colors
        this.colors = {
            probes: new THREE.Color(0x00BFFF),    // Cyan
            metal: new THREE.Color(0xC0C0C0),     // Silver
            slag: new THREE.Color(0x5C4033)       // Brown-grey
        };
        
        // Transit colors (slightly brighter for visibility)
        this.transitColors = {
            probe: new THREE.Color(0x00FFFF),    // Bright cyan for probes
            metal: new THREE.Color(0xFFFFFF)     // White for metal
        };
        
        // Minimum radius multiplier - all particles start at least 1 planet radius from center
        this.minRadiusMultiplier = 1.0;
        
        // Exponential decay scale multipliers (relative to planet radius)
        // Controls how quickly density falls off from the surface
        // Smaller = tighter cloud near surface, larger = more spread out
        this.decayScaleMultipliers = {
            probes: 1.2,  // Inner cloud - tighter around planet surface
            metal: 1.8,   // Middle cloud - moderate spread
            slag: 3.5     // Outer cloud - widest spread
        };
        
        // Belt zone IDs
        this.beltZoneIds = ['asteroid_belt', 'kuiper', 'kuiper_belt', 'oort_cloud'];
        
        // Create glow texture for probes
        this.probeGlowTexture = this.createGlowTexture(64, 0x00FFFF);
    }
    
    /**
     * Create a procedural glow texture for glowing particles
     * @param {number} size - Texture size in pixels
     * @param {number} color - Base color for the glow
     * @returns {THREE.CanvasTexture} Glow texture
     */
    createGlowTexture(size, color) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        const center = size / 2;
        const col = new THREE.Color(color);
        
        // Create radial gradient for soft glow effect
        const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
        
        // Bright core that fades to transparent
        gradient.addColorStop(0, `rgba(255, 255, 255, 1.0)`); // White hot center
        gradient.addColorStop(0.1, `rgba(${Math.floor(col.r * 255)}, ${Math.floor(col.g * 255)}, ${Math.floor(col.b * 255)}, 0.9)`);
        gradient.addColorStop(0.3, `rgba(${Math.floor(col.r * 255)}, ${Math.floor(col.g * 255)}, ${Math.floor(col.b * 255)}, 0.5)`);
        gradient.addColorStop(0.6, `rgba(${Math.floor(col.r * 255)}, ${Math.floor(col.g * 255)}, ${Math.floor(col.b * 255)}, 0.2)`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }
    
    /**
     * Calculate visible probe count for planetary swarm:
     * - Linear 1:1 for 1-10 probes (accurate representation)
     * - Logarithmic scaling from 10 probes to 100M probes (10 dots to 120 dots max)
     * - Capped at 120 dots (overflow goes to orbital cloud)
     * @param {number} probeCount - Number of probes
     * @returns {number} Visible particle count (max 120)
     */
    calculateProbeVisibleCount(probeCount) {
        if (probeCount <= 0) {
            return 0;
        }
        
        // Get probe swarm config from solar system
        const swarmConfig = this.solarSystem?.probeSwarmConfig || {
            maxTotalDots: 120,
            overflowThreshold: 100000000
        };
        const maxDots = swarmConfig.maxTotalDots || 120;
        const overflowThreshold = swarmConfig.overflowThreshold || 100000000;
        
        // Cap at overflow threshold for swarm visualization
        const swarmProbeCount = Math.min(probeCount, overflowThreshold);
        
        // Linear 1:1 for low counts (1-10 probes)
        if (swarmProbeCount <= 10) {
            return swarmProbeCount;
        }
        
        // Logarithmic scaling from 10 probes to overflow threshold (10 dots to maxDots)
        // Formula: dots = 10 + (maxDots - 10) * (log10(probes) - 1) / (log10(overflowThreshold) - 1)
        const log10 = Math.log10;
        const logMin = log10(10);
        const logMax = log10(overflowThreshold);
        const logProbe = log10(swarmProbeCount);
        const t = (logProbe - logMin) / (logMax - logMin);
        const particles = 10 + (maxDots - 10) * t;
        
        return Math.min(maxDots, Math.max(10, Math.floor(particles)));
    }
    
    /**
     * Calculate visible metal dot count:
     * - No dots below 100,000kg threshold
     * - Linear scaling: 1 dot = 100,000 kg, 10 dots = 1e9 kg
     * @param {number} massKg - Metal mass in kg
     * @returns {number} Visible particle count
     */
    calculateMetalVisibleCount(massKg) {
        const threshold = this.minThresholds.metal; // 100,000 kg minimum for 1 dot
        if (massKg < threshold) {
            return 0;
        }
        
        // Linear scaling: 1 dot at 100,000 kg, 10 dots at 1e9 kg
        // Formula: 1 + (mass - threshold) * 9 / (1e9 - threshold)
        const particles = 1 + (massKg - threshold) * 9 / (1e9 - threshold);
        return Math.min(this.maxDots.metal, Math.max(1, Math.floor(particles)));
    }
    
    /**
     * Calculate visible slag dot count:
     * - No dots below 100,000kg threshold
     * - Linear scaling: 1 dot = 100,000 kg, 10 dots = 1e9 kg
     * @param {number} massKg - Slag mass in kg
     * @returns {number} Visible particle count
     */
    calculateSlagVisibleCount(massKg) {
        const threshold = this.minThresholds.slag; // 100,000 kg minimum for 1 dot
        if (massKg < threshold) {
            return 0;
        }
        
        // Linear scaling: 1 dot at 100,000 kg, 10 dots at 1e9 kg
        // Formula: 1 + (mass - threshold) * 9 / (1e9 - threshold)
        const particles = 1 + (massKg - threshold) * 9 / (1e9 - threshold);
        return Math.min(this.maxDots.slag, Math.max(1, Math.floor(particles)));
    }
    
    /**
     * Generate a random value from an exponential distribution
     * Used for outward-decaying particle placement
     * @param {number} scale - Scale parameter (mean of the distribution)
     * @returns {number} Random value >= 0 from exponential distribution
     */
    exponentialRandom(scale) {
        // Inverse transform sampling: -scale * ln(1 - U) where U is uniform(0,1)
        // This produces values from 0 to infinity, with most values near 0
        let u;
        do {
            u = Math.random();
        } while (u === 0 || u === 1); // Avoid log(0) and log(1) edge cases
        
        return -scale * Math.log(u);
    }
    
    /**
     * Create cloud particle system for a zone
     * @param {string} zoneId - Zone ID
     * @param {string} cloudType - 'probes', 'metal', or 'slag'
     * @param {number} planetRadius - Visual radius of the planet
     * @returns {THREE.Points} Particle system
     */
    createCloud(zoneId, cloudType, planetRadius) {
        // Minimum radius - always at least 1 planet radius from center (outside surface)
        const minRadius = planetRadius * this.minRadiusMultiplier;
        // Decay scale - controls how quickly density falls off from surface
        const decayScale = planetRadius * this.decayScaleMultipliers[cloudType];
        const color = this.colors[cloudType];
        
        // Create geometry with max particles
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxParticlesPerCloud * 3);
        const colors = new Float32Array(this.maxParticlesPerCloud * 3);
        
        // Initialize with zero particles
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setDrawRange(0, 0);
        
        // Create material - probes get glow effect with additive blending
        const isProbe = cloudType === 'probes';
        const material = new THREE.PointsMaterial({
            size: isProbe ? 0.016 : (cloudType === 'slag' ? 0.025 : 0.02),
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: isProbe ? 1.0 : (cloudType === 'slag' ? 0.8 : 0.9),
            depthWrite: false, // Prevent depth conflicts
            depthTest: true, // Still test depth but don't write
            // Glow effect for probes
            map: isProbe ? this.probeGlowTexture : null,
            blending: isProbe ? THREE.AdditiveBlending : THREE.NormalBlending
        });
        
        const points = new THREE.Points(geometry, material);
        
        // Configure rendering properties to prevent disappearing when zoomed in
        points.renderOrder = 100; // Render after planets
        points.frustumCulled = false; // Don't cull when camera is close
        
        // Store cloud particle data
        const cloudData = [];
        
        if (cloudType === 'probes') {
            // PROBE SWARM: Create polar orbital rings (organized, not chaotic)
            const swarmConfig = this.solarSystem?.probeSwarmConfig || {
                ringCount: 6,
                maxDotsPerRing: 20,
                maxTotalDots: 120,
                ringRadiusMultipliers: [1.2, 1.35, 1.5, 1.65, 1.8, 1.95]
            };
            
            const ringCount = swarmConfig.ringCount || 6;
            const maxDotsPerRing = swarmConfig.maxDotsPerRing || 20;
            const ringRadiusMultipliers = swarmConfig.ringRadiusMultipliers || [1.2, 1.35, 1.5, 1.65, 1.8, 1.95];
            
            // Create 6 polar orbital rings with evenly distributed inclinations
            // Inclinations: 0, 30, 60, 90, 120, 150 degrees (polar orbits)
            for (let ringIndex = 0; ringIndex < ringCount; ringIndex++) {
                const inclinationDeg = (ringIndex / ringCount) * 180; // 0, 30, 60, 90, 120, 150
                const inclination = (inclinationDeg * Math.PI) / 180;
                
                // Ring radius multiplier (layered outward)
                const radiusMultiplier = ringRadiusMultipliers[ringIndex] || (1.2 + ringIndex * 0.15);
                const orbitalRadius = minRadius * radiusMultiplier;
                
                // Evenly distribute dots around each ring
                for (let dotIndex = 0; dotIndex < maxDotsPerRing; dotIndex++) {
                    // Evenly spaced around the ring
                    const orbitalPhase = (dotIndex / maxDotsPerRing) * Math.PI * 2;
                    
                    // Ascending node rotates the orbital plane (for variety)
                    const ascendingNode = (ringIndex * Math.PI) / 3; // Rotate each ring by 60 degrees
                    
                    // Orbital speed - faster for closer orbits (Kepler's law: v ∝ 1/√r)
                    const baseOrbitalSpeed = 0.15;
                    const orbitalSpeed = baseOrbitalSpeed / Math.sqrt(orbitalRadius / minRadius);
                    // Small variation for natural look (±5%)
                    const speedVariation = 0.95 + Math.random() * 0.1;
                    
                    cloudData.push({
                        orbitalRadius: orbitalRadius,
                        inclination: inclination,
                        ascendingNode: ascendingNode,
                        orbitalPhase: orbitalPhase,
                        orbitalSpeed: orbitalSpeed * speedVariation,
                        ringIndex: ringIndex,
                        dotIndex: dotIndex
                    });
                }
            }
        } else {
            // METAL/SLAG: Create chaotic ball of intersecting orbits (original behavior)
            for (let i = 0; i < this.maxParticlesPerCloud; i++) {
                // Orbital radius with exponential decay from minimum radius outward
                const orbitalRadius = minRadius + this.exponentialRandom(decayScale);
                
                // Random orbital inclination (0 to 180 degrees for full coverage)
                const inclination = Math.acos(2 * Math.random() - 1); // Uniform on sphere
                
                // Random longitude of ascending node (0 to 360 degrees)
                const ascendingNode = Math.random() * Math.PI * 2;
                
                // Random starting phase in orbit (0 to 360 degrees)
                const orbitalPhase = Math.random() * Math.PI * 2;
                
                // Orbital speed - faster for closer orbits (Kepler's law: v ∝ 1/√r)
                const baseOrbitalSpeed = 0.08;
                const orbitalSpeed = baseOrbitalSpeed / Math.sqrt(orbitalRadius / minRadius);
                const speedVariation = 0.8 + Math.random() * 0.4; // 80% to 120%
                
                cloudData.push({
                    orbitalRadius: orbitalRadius,
                    inclination: inclination,
                    ascendingNode: ascendingNode,
                    orbitalPhase: orbitalPhase,
                    orbitalSpeed: orbitalSpeed * speedVariation
                });
            }
        }
        
        points.userData = {
            zoneId: zoneId,
            cloudType: cloudType,
            cloudData: cloudData,
            positions: positions,
            colors: colors,
            planetRadius: planetRadius,
            minRadius: minRadius,
            decayScale: decayScale
        };
        
        return points;
    }
    
    /**
     * Create cloud particle system for a belt zone (asteroid belt, kuiper, oort cloud)
     * @param {string} zoneId - Zone ID
     * @param {string} cloudType - 'probes', 'metal', or 'slag'
     * @param {Object} beltConfig - Configuration for the belt (innerRadius, outerRadius, isSpherical)
     * @returns {THREE.Points} Particle system
     */
    createBeltCloud(zoneId, cloudType, beltConfig) {
        const { innerRadius, outerRadius, isSpherical, verticalSpread } = beltConfig;
        const color = this.colors[cloudType];
        
        // Create geometry with max particles
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxParticlesPerCloud * 3);
        const colors = new Float32Array(this.maxParticlesPerCloud * 3);
        
        // Initialize with zero particles
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setDrawRange(0, 0);
        
        // Create material - probes get glow effect, slightly larger for belt visibility
        const isProbe = cloudType === 'probes';
        const material = new THREE.PointsMaterial({
            size: isProbe ? 0.024 : (cloudType === 'slag' ? 0.035 : 0.03),
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: isProbe ? 1.0 : (cloudType === 'slag' ? 0.8 : 0.9),
            depthWrite: false,
            depthTest: true,
            // Glow effect for probes
            map: isProbe ? this.probeGlowTexture : null,
            blending: isProbe ? THREE.AdditiveBlending : THREE.NormalBlending
        });
        
        const points = new THREE.Points(geometry, material);
        
        // Configure rendering properties
        points.renderOrder = 100;
        points.frustumCulled = false;
        
        // Store cloud particle data for belt distribution
        const cloudData = [];
        for (let i = 0; i < this.maxParticlesPerCloud; i++) {
            if (isSpherical) {
                // Oort cloud: spherical distribution
                const theta = Math.random() * Math.PI * 2; // Azimuth
                const phi = Math.acos(2 * Math.random() - 1); // Polar angle
                const distance = innerRadius + Math.random() * (outerRadius - innerRadius);
                
                cloudData.push({
                    theta: theta,
                    phi: phi,
                    distance: distance,
                    isSpherical: true,
                    orbitalSpeed: 0.0001 + Math.random() * 0.0002 // Very slow drift
                });
            } else {
                // Ring distribution (asteroid belt, kuiper)
                const angle = Math.random() * Math.PI * 2;
                const distance = innerRadius + Math.random() * (outerRadius - innerRadius);
                const yOffset = (Math.random() - 0.5) * verticalSpread;
                
                cloudData.push({
                    angle: angle,
                    distance: distance,
                    yOffset: yOffset,
                    isSpherical: false,
                    orbitalSpeed: 0.0005 + Math.random() * 0.001 // Slow orbital drift
                });
            }
        }
        
        points.userData = {
            zoneId: zoneId,
            cloudType: cloudType,
            cloudData: cloudData,
            positions: positions,
            colors: colors,
            beltConfig: beltConfig
        };
        
        return points;
    }
    
    /**
     * Initialize clouds for all zones
     * @param {Object} orbitalData - Orbital zones data
     */
    init(orbitalData) {
        if (!orbitalData || !orbitalData.orbital_zones) {
            console.warn('ZoneClouds.init: No orbital data provided');
            return;
        }
        
        let cloudsCreated = 0;
        let beltCloudsCreated = 0;
        
        orbitalData.orbital_zones.forEach(zone => {
            // Handle Dyson sphere and belt zones separately (ring-based clouds)
            if (zone.id === 'dyson_sphere' || this.beltZoneIds.includes(zone.id)) {
                this.initBeltClouds(zone);
                beltCloudsCreated++;
                return;
            }
            
            // Get planet radius from solar system
            const planet = this.solarSystem.planets[zone.id];
            if (!planet) {
                console.warn(`ZoneClouds.init: Planet not found for zone ${zone.id}`);
                return;
            }
            
            const planetInfo = this.solarSystem.planetData[zone.id];
            if (!planetInfo) {
                console.warn(`ZoneClouds.init: Planet data not found for zone ${zone.id}`);
                return;
            }
            
            // Use the planet's actual visual radius (stored in userData.originalRadius after scaling)
            // This ensures probe clouds are sized correctly relative to the visible planet
            let planetRadius;
            if (planet.userData && planet.userData.originalRadius) {
                planetRadius = planet.userData.originalRadius;
            } else {
                // Fallback: calculate with same scaling as createPlanet does
                planetRadius = this.solarSystem.logScaleRadius(planetInfo.radius_km);
                // Apply the same rocky planet scaling as createPlanet()
                if (this.solarSystem.rockyPlanets && this.solarSystem.rockyPlanets.includes(zone.id)) {
                    planetRadius = Math.max(0.12, planetRadius * 1.5);
                } else {
                    planetRadius = Math.max(0.08, planetRadius);
                }
            }
            
            // Create three clouds per zone
            this.clouds[zone.id] = {
                probes: this.createCloud(zone.id, 'probes', planetRadius),
                metal: this.createCloud(zone.id, 'metal', planetRadius),
                slag: this.createCloud(zone.id, 'slag', planetRadius)
            };
            
            // Add to scene with proper render order
            Object.values(this.clouds[zone.id]).forEach(cloud => {
                cloud.renderOrder = 100; // Render after planets
                cloud.frustumCulled = false; // Don't cull when zoomed in
                this.scene.add(cloud);
            });
            
            cloudsCreated++;
            
            // Initialize cloud data
            this.cloudData[zone.id] = {
                probes: [],
                metal: [],
                slag: []
            };
        });
        
        console.log(`ZoneClouds: Created clouds for ${cloudsCreated} planet zones and ${beltCloudsCreated} belt zones (planets: ${Object.keys(this.clouds).join(', ')}, belts: ${Object.keys(this.beltClouds).join(', ')})`);
        
        // Initialize transit particle system
        this.initTransitParticles();
    }
    
    /**
     * Initialize clouds for belt zones (asteroid belt, kuiper, oort cloud)
     * @param {Object} zone - Zone data from orbital mechanics
     */
    initBeltClouds(zone) {
        // Skip if already initialized
        if (this.beltClouds[zone.id]) {
            return;
        }
        
        const AU_KM = this.solarSystem.AU_KM;
        let beltConfig;
        
        if (zone.id === 'asteroid_belt') {
            // Asteroid belt between Mars (1.52 AU) and Jupiter (5.2 AU)
            const marsAU = this.solarSystem.planetData.mars.orbit_km / AU_KM;
            const jupiterAU = this.solarSystem.planetData.jupiter.orbit_km / AU_KM;
            const marsOrbit = this.solarSystem.scaleAUToVisual(marsAU);
            const jupiterOrbit = this.solarSystem.scaleAUToVisual(jupiterAU);
            beltConfig = {
                innerRadius: marsOrbit * 1.1,
                outerRadius: jupiterOrbit * 0.9,
                isSpherical: false,
                verticalSpread: 0.8
            };
        } else if (zone.id === 'kuiper' || zone.id === 'kuiper_belt') {
            // Kuiper belt beyond Neptune (30-50 AU)
            beltConfig = {
                innerRadius: this.solarSystem.scaleAUToVisual(30.0),
                outerRadius: this.solarSystem.scaleAUToVisual(50.0),
                isSpherical: false,
                verticalSpread: 0.5
            };
        } else if (zone.id === 'oort_cloud') {
            // Oort cloud - spherical distribution (70-140 AU)
            beltConfig = {
                innerRadius: this.solarSystem.scaleAUToVisual(70.0),
                outerRadius: this.solarSystem.scaleAUToVisual(140.0),
                isSpherical: true,
                verticalSpread: 0 // Not used for spherical
            };
        } else if (zone.id === 'dyson_sphere') {
            // Dyson sphere at 0.29 AU
            const dysonOrbit = this.solarSystem.dysonOrbitRadius || 
                this.solarSystem.scaleAUToVisual(0.29);
            // Create a thin ring around the Dyson orbit
            beltConfig = {
                innerRadius: dysonOrbit * 0.9,
                outerRadius: dysonOrbit * 1.1,
                isSpherical: false,
                verticalSpread: 0.3 // Thin disk for Dyson swarm
            };
        } else {
            console.warn(`ZoneClouds: Unknown belt zone ${zone.id}`);
            return;
        }
        
        // Create three clouds per belt zone
        this.beltClouds[zone.id] = {
            probes: this.createBeltCloud(zone.id, 'probes', beltConfig),
            metal: this.createBeltCloud(zone.id, 'metal', beltConfig),
            slag: this.createBeltCloud(zone.id, 'slag', beltConfig)
        };
        
        // Add to scene with proper render order (higher than belt particles)
        Object.values(this.beltClouds[zone.id]).forEach(cloud => {
            cloud.renderOrder = 110; // Render after belt particles
            cloud.frustumCulled = false;
            this.scene.add(cloud);
        });
        
        // Initialize cloud data
        this.cloudData[zone.id] = {
            probes: [],
            metal: [],
            slag: []
        };
    }
    
    /**
     * Initialize transit particle system for showing resources in transit
     */
    initTransitParticles() {
        // Create geometry with max particles
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxTransitParticles * 3);
        const colors = new Float32Array(this.maxTransitParticles * 3);
        
        // Initialize with zero particles
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setDrawRange(0, 0);
        
        // Create material - smaller size to match reduced cloud particle sizes
        const material = new THREE.PointsMaterial({
            size: 0.03,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            depthTest: true
        });
        
        this.transitParticles = new THREE.Points(geometry, material);
        this.transitParticles.renderOrder = 150; // Render after zone clouds
        this.transitParticles.frustumCulled = false;
        
        // Store data
        this.transitParticles.userData = {
            positions: positions,
            colors: colors
        };
        
        this.scene.add(this.transitParticles);
    }
    
    /**
     * Ensure clouds exist for a zone (create if missing)
     * @param {string} zoneId - Zone ID
     */
    ensureCloudsForZone(zoneId) {
        if (this.clouds[zoneId]) {
            return; // Already exists
        }
        
        // Get planet radius from solar system
        const planet = this.solarSystem.planets[zoneId];
        if (!planet) {
            console.warn(`ZoneClouds: Cannot create clouds for zone ${zoneId} - planet not found`);
            return;
        }
        
        const planetInfo = this.solarSystem.planetData[zoneId];
        if (!planetInfo) {
            console.warn(`ZoneClouds: Cannot create clouds for zone ${zoneId} - planet data not found`);
            return;
        }
        
        // Use the planet's actual visual radius (stored in userData.originalRadius after scaling)
        // This ensures probe clouds are sized correctly relative to the visible planet
        let planetRadius;
        if (planet.userData && planet.userData.originalRadius) {
            planetRadius = planet.userData.originalRadius;
        } else {
            // Fallback: calculate with same scaling as createPlanet does
            planetRadius = this.solarSystem.logScaleRadius(planetInfo.radius_km);
            // Apply the same rocky planet scaling as createPlanet()
            if (this.solarSystem.rockyPlanets && this.solarSystem.rockyPlanets.includes(zoneId)) {
                planetRadius = Math.max(0.12, planetRadius * 1.5);
            } else {
                planetRadius = Math.max(0.08, planetRadius);
            }
        }
        
        // Create three clouds per zone
        this.clouds[zoneId] = {
            probes: this.createCloud(zoneId, 'probes', planetRadius),
            metal: this.createCloud(zoneId, 'metal', planetRadius),
            slag: this.createCloud(zoneId, 'slag', planetRadius)
        };
        
        // Add to scene with proper render order
        Object.values(this.clouds[zoneId]).forEach(cloud => {
            cloud.renderOrder = 100; // Render after planets
            cloud.frustumCulled = false; // Don't cull when camera is close
            this.scene.add(cloud);
        });
        
        // Initialize cloud data
        this.cloudData[zoneId] = {
            probes: [],
            metal: [],
            slag: []
        };
    }
    
    /**
     * Update cloud particle counts and positions based on game state
     * @param {Object} gameState - Current game state
     */
    updateClouds(gameState) {
        if (!gameState) return;
        
        const probesByZone = gameState.probes_by_zone || {};
        const zones = gameState.zones || {};
        
        // Initialize clouds if they don't exist yet (lazy initialization)
        if (Object.keys(this.clouds).length === 0 && Object.keys(this.beltClouds).length === 0 && this.solarSystem.orbitalData) {
            console.log('ZoneClouds: Lazy initializing clouds');
            this.init(this.solarSystem.orbitalData);
        }
        
        // Ensure clouds exist for any zone that has probes (lazy creation for zones missed during init)
        Object.keys(probesByZone).forEach(zoneId => {
            const probeCounts = probesByZone[zoneId] || {};
            const totalProbes = Object.values(probeCounts).reduce((sum, count) => sum + (count || 0), 0);
            if (totalProbes > 0 && !this.clouds[zoneId] && !this.beltClouds[zoneId]) {
                // Check if this is a belt zone
                if (this.beltZoneIds.includes(zoneId)) {
                    // Belt zones need to be initialized through initBeltClouds
                    const orbitalZone = this.solarSystem.orbitalData?.orbital_zones?.find(z => z.id === zoneId);
                    if (orbitalZone) {
                        console.log(`ZoneClouds: Lazy creating belt clouds for ${zoneId}`);
                        this.initBeltClouds(orbitalZone);
                    }
                } else {
                    // Planet zone - use ensureCloudsForZone
                    console.log(`ZoneClouds: Lazy creating clouds for ${zoneId}`);
                    this.ensureCloudsForZone(zoneId);
                }
            }
        });
        
        // Update each planet zone's clouds
        // NOTE: Metal and slag are now handled by the dynamic particle system in solar_system.js
        // which spawns particles from the planet position and animates them into orbit
        Object.keys(this.clouds).forEach(zoneId => {
            const zoneClouds = this.clouds[zoneId];
            if (!zoneClouds) return;
            
            // Get probe count
            const probeCounts = probesByZone[zoneId] || {};
            const totalProbes = Object.values(probeCounts).reduce((sum, count) => sum + (count || 0), 0);
            
            // Check if planet is depleted
            const zone = zones[zoneId];
            const isDepleted = zone?.depleted || false;
            
            // Get probe swarm config
            const swarmConfig = this.solarSystem?.probeSwarmConfig || {
                overflowThreshold: 100000000,
                maxTotalDots: 120
            };
            const overflowThreshold = swarmConfig.overflowThreshold || 100000000;
            
            // If planet is depleted, transfer all swarm probes to orbital cloud (swarm = 0)
            // Otherwise, only show swarm up to overflow threshold
            let swarmProbeCount = 0;
            if (!isDepleted) {
                swarmProbeCount = Math.min(totalProbes, overflowThreshold);
            }
            
            // Calculate visible counts for swarm (capped at overflow threshold)
            const probeCount = this.calculateProbeVisibleCount(swarmProbeCount);
            
            // Update only probe clouds - metal/slag handled by solar_system.js resource particles
            this.updateCloudParticles(zoneClouds.probes, 'probes', probeCount, zoneId);
            
            // Hide metal and slag clouds (handled by dynamic particle system)
            if (zoneClouds.metal) zoneClouds.metal.geometry.setDrawRange(0, 0);
            if (zoneClouds.slag) zoneClouds.slag.geometry.setDrawRange(0, 0);
        });
        
        // Update each belt zone's clouds
        // NOTE: Metal and slag are now handled by the dynamic particle system in solar_system.js
        Object.keys(this.beltClouds).forEach(zoneId => {
            const zoneClouds = this.beltClouds[zoneId];
            if (!zoneClouds) return;
            
            // Get probe count
            const probeCounts = probesByZone[zoneId] || {};
            const totalProbes = Object.values(probeCounts).reduce((sum, count) => sum + (count || 0), 0);
            
            // Calculate visible counts using type-specific scaling
            const probeCount = this.calculateProbeVisibleCount(totalProbes);
            
            // Update only probe clouds - metal/slag handled by solar_system.js resource particles
            this.updateBeltCloudParticles(zoneClouds.probes, 'probes', probeCount, zoneId);
            
            // Hide metal and slag clouds (handled by dynamic particle system)
            if (zoneClouds.metal) zoneClouds.metal.geometry.setDrawRange(0, 0);
            if (zoneClouds.slag) zoneClouds.slag.geometry.setDrawRange(0, 0);
        });
        
        // Update transit particles (resources in transit between zones)
        this.updateTransitParticles(gameState);
    }
    
    /**
     * Update transit particles showing resources moving between zones
     * @param {Object} gameState - Current game state
     */
    updateTransitParticles(gameState) {
        if (!this.transitParticles || !gameState) {
            return;
        }
        
        // Get transfer system from game engine
        let transitPositions = [];
        if (window.gameEngine && window.gameEngine.transferSystem) {
            try {
                transitPositions = window.gameEngine.transferSystem.calculateInTransitProbePositions(gameState);
            } catch (error) {
                console.warn('Failed to calculate transit positions:', error);
            }
        }
        
        // Also get active transfers to calculate proper positions along transfer arcs
        const activeTransfers = gameState.active_transfers || [];
        const currentTime = gameState.time || 0;
        
        // Build a map of transfer_id to transfer info for positioning
        const transferMap = {};
        activeTransfers.forEach(transfer => {
            transferMap[transfer.id] = transfer;
        });
        
        // Limit to max particles
        const visibleCount = Math.min(transitPositions.length, this.maxTransitParticles);
        
        const { positions, colors } = this.transitParticles.userData;
        const geometry = this.transitParticles.geometry;
        
        // Convert AU positions to 3D coordinates and update particles
        for (let i = 0; i < visibleCount; i++) {
            const transit = transitPositions[i];
            const au = transit.au || 0;
            const transfer = transferMap[transit.transfer_id];
            
            // Convert AU to 3D position (circular orbit in XZ plane)
            // Use solar system's unified scaling for orbit radius
            const orbitRadius = this.solarSystem.scaleAUToVisual(au);
            
            // Calculate angle along transfer path
            let angle = 0;
            if (transfer) {
                // Get origin and destination zone positions
                const fromZone = this.solarSystem.orbitalData?.orbital_zones?.find(z => z.id === transfer.from_zone);
                const toZone = this.solarSystem.orbitalData?.orbital_zones?.find(z => z.id === transfer.to_zone);
                
                if (fromZone && toZone) {
                    // Calculate angle based on progress along transfer
                    const fromAU = fromZone.radius_au || 0;
                    const toAU = toZone.radius_au || 0;
                    const progress = fromAU > 0 ? (au - fromAU) / (toAU - fromAU) : 0;
                    
                    // Get angles for origin and destination zones
                    const fromOrbitRadius = this.solarSystem.scaleAUToVisual(fromAU);
                    const toOrbitRadius = this.solarSystem.scaleAUToVisual(toAU);
                    
                    // Use a consistent angle based on transfer direction
                    // For simplicity, use the average angle between zones
                    const fromAngle = Math.atan2(
                        this.solarSystem.planets[transfer.from_zone]?.position.z || 0,
                        this.solarSystem.planets[transfer.from_zone]?.position.x || 1
                    );
                    const toAngle = Math.atan2(
                        this.solarSystem.planets[transfer.to_zone]?.position.z || 0,
                        this.solarSystem.planets[transfer.to_zone]?.position.x || 1
                    );
                    
                    // Interpolate angle based on progress
                    angle = fromAngle + (toAngle - fromAngle) * progress;
                } else {
                    // Fallback: use transfer_id for consistent angle
                    const angleSeed = (transit.transfer_id || '').split('_').pop() || '0';
                    angle = (parseInt(angleSeed, 36) % 360) * (Math.PI / 180);
                }
            } else {
                // Fallback: use transfer_id for consistent angle
                const angleSeed = (transit.transfer_id || '').split('_').pop() || '0';
                angle = (parseInt(angleSeed, 36) % 360) * (Math.PI / 180);
            }
            
            const x = Math.cos(angle) * orbitRadius;
            const y = 0; // Keep in orbital plane (can add slight variation later)
            const z = Math.sin(angle) * orbitRadius;
            
            const idx = i * 3;
            positions[idx] = x;
            positions[idx + 1] = y;
            positions[idx + 2] = z;
            
            // Determine color based on resource type (probe or metal)
            // Mass > 1000 kg suggests metal, otherwise probe
            const isMetal = transit.mass_kg > 1000;
            const color = isMetal ? this.transitColors.metal : this.transitColors.probe;
            
            colors[idx] = color.r;
            colors[idx + 1] = color.g;
            colors[idx + 2] = color.b;
        }
        
        // Update geometry attributes
        const positionAttr = geometry.getAttribute('position');
        const colorAttr = geometry.getAttribute('color');
        
        if (positionAttr) {
            positionAttr.array.set(positions);
            positionAttr.needsUpdate = true;
        } else {
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        }
        
        if (colorAttr) {
            colorAttr.array.set(colors);
            colorAttr.needsUpdate = true;
        } else {
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
        
        geometry.setDrawRange(0, visibleCount);
        this.transitParticles.visible = visibleCount > 0;
    }
    
    /**
     * Update particles for a specific cloud
     * @param {THREE.Points} cloud - Cloud particle system
     * @param {string} cloudType - Cloud type
     * @param {number} visibleCount - Number of visible particles
     * @param {string} zoneId - Zone ID
     */
    updateCloudParticles(cloud, cloudType, visibleCount, zoneId) {
        if (!cloud || !cloud.userData) return;
        
        // Cap visible count to max particles
        visibleCount = Math.min(visibleCount, this.maxParticlesPerCloud);
        
        const { cloudData, positions, colors } = cloud.userData;
        const color = this.colors[cloudType];
        const geometry = cloud.geometry;
        
        // Get planet position - cloud will orbit sun with planet
        const planet = this.solarSystem.planets[zoneId];
        const planetX = planet ? planet.position.x : 0;
        const planetY = planet ? planet.position.y : 0;
        const planetZ = planet ? planet.position.z : 0;
        
        // Update positions and colors for visible particles
        for (let i = 0; i < visibleCount; i++) {
            const data = cloudData[i];
            const idx = i * 3;
            
            // Calculate position using orbital mechanics
            const orbitalPos = this.calculateOrbitalPosition(data);
            
            // Position relative to planet's current position (probe orbits planet, planet orbits sun)
            positions[idx] = planetX + orbitalPos.x;
            positions[idx + 1] = planetY + orbitalPos.y;
            positions[idx + 2] = planetZ + orbitalPos.z;
            
            // Set color with slight variation
            const colorVariation = cloudType === 'metal' ? 0.1 : 0.2;
            colors[idx] = Math.max(0, Math.min(1, color.r + (Math.random() - 0.5) * colorVariation));
            colors[idx + 1] = Math.max(0, Math.min(1, color.g + (Math.random() - 0.5) * colorVariation));
            colors[idx + 2] = Math.max(0, Math.min(1, color.b + (Math.random() - 0.5) * colorVariation));
        }
        
        // Update geometry attributes
        const positionAttr = geometry.getAttribute('position');
        const colorAttr = geometry.getAttribute('color');
        
        if (positionAttr) {
            positionAttr.array.set(positions);
            positionAttr.needsUpdate = true;
        } else {
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        }
        
        if (colorAttr) {
            colorAttr.array.set(colors);
            colorAttr.needsUpdate = true;
        } else {
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
        
        geometry.setDrawRange(0, visibleCount);
        
        // Show/hide cloud based on particle count
        cloud.visible = visibleCount > 0;
    }
    
    /**
     * Update particles for a belt cloud (asteroid belt, kuiper, oort)
     * @param {THREE.Points} cloud - Cloud particle system
     * @param {string} cloudType - Cloud type
     * @param {number} visibleCount - Number of visible particles
     * @param {string} zoneId - Zone ID
     */
    updateBeltCloudParticles(cloud, cloudType, visibleCount, zoneId) {
        if (!cloud || !cloud.userData) return;
        
        // Cap visible count to max particles
        visibleCount = Math.min(visibleCount, this.maxParticlesPerCloud);
        
        const { cloudData, positions, colors, beltConfig } = cloud.userData;
        const color = this.colors[cloudType];
        const geometry = cloud.geometry;
        
        // Update positions and colors for visible particles
        for (let i = 0; i < visibleCount; i++) {
            const data = cloudData[i];
            const idx = i * 3;
            
            if (data.isSpherical) {
                // Oort cloud - spherical distribution
                const x = data.distance * Math.sin(data.phi) * Math.cos(data.theta);
                const y = data.distance * Math.sin(data.phi) * Math.sin(data.theta);
                const z = data.distance * Math.cos(data.phi);
                
                positions[idx] = x;
                positions[idx + 1] = y;
                positions[idx + 2] = z;
            } else {
                // Ring distribution (asteroid belt, kuiper)
                positions[idx] = Math.cos(data.angle) * data.distance;
                positions[idx + 1] = data.yOffset;
                positions[idx + 2] = Math.sin(data.angle) * data.distance;
            }
            
            // Set color with slight variation
            const colorVariation = cloudType === 'metal' ? 0.1 : 0.2;
            colors[idx] = Math.max(0, Math.min(1, color.r + (Math.random() - 0.5) * colorVariation));
            colors[idx + 1] = Math.max(0, Math.min(1, color.g + (Math.random() - 0.5) * colorVariation));
            colors[idx + 2] = Math.max(0, Math.min(1, color.b + (Math.random() - 0.5) * colorVariation));
        }
        
        // Update geometry attributes
        const positionAttr = geometry.getAttribute('position');
        const colorAttr = geometry.getAttribute('color');
        
        if (positionAttr) {
            positionAttr.array.set(positions);
            positionAttr.needsUpdate = true;
        } else {
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        }
        
        if (colorAttr) {
            colorAttr.array.set(colors);
            colorAttr.needsUpdate = true;
        } else {
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
        
        geometry.setDrawRange(0, visibleCount);
        
        // Show/hide cloud based on particle count
        cloud.visible = visibleCount > 0;
    }
    
    /**
     * Calculate probe position from orbital parameters
     * Creates a 3D position for a probe orbiting in an inclined elliptical orbit
     * @param {Object} data - Orbital data (orbitalRadius, inclination, ascendingNode, orbitalPhase)
     * @returns {Object} {x, y, z} position relative to planet center
     */
    calculateOrbitalPosition(data) {
        const { orbitalRadius, inclination, ascendingNode, orbitalPhase } = data;
        
        // Start with a circular orbit in the XZ plane (y = 0)
        const x0 = orbitalRadius * Math.cos(orbitalPhase);
        const z0 = orbitalRadius * Math.sin(orbitalPhase);
        const y0 = 0;
        
        // Rotate around X axis by inclination
        const cosI = Math.cos(inclination);
        const sinI = Math.sin(inclination);
        const x1 = x0;
        const y1 = y0 * cosI - z0 * sinI;
        const z1 = y0 * sinI + z0 * cosI;
        
        // Rotate around Y axis by ascending node (longitude of ascending node)
        const cosN = Math.cos(ascendingNode);
        const sinN = Math.sin(ascendingNode);
        const x = x1 * cosN - z1 * sinN;
        const y = y1;
        const z = x1 * sinN + z1 * cosN;
        
        return { x, y, z };
    }
    
    /**
     * Update cloud positions - clouds orbit sun with their planets
     * Probes now orbit around their planet in individual orbits
     * @param {number} deltaTime - Time delta
     */
    update(deltaTime) {
        // Update planet clouds (orbit with their planets)
        Object.keys(this.clouds).forEach(zoneId => {
            const planet = this.solarSystem.planets[zoneId];
            if (!planet) return;
            
            const zoneClouds = this.clouds[zoneId];
            if (!zoneClouds) return;
            
            // Update each cloud type
            Object.values(zoneClouds).forEach(cloud => {
                if (!cloud.visible || !cloud.userData) return;
                
                const { cloudData, positions } = cloud.userData;
                const geometry = cloud.geometry;
                const visibleCount = geometry.drawRange.count;
                
                // Update particle positions - each probe orbits the planet individually
                for (let i = 0; i < visibleCount; i++) {
                    const data = cloudData[i];
                    const idx = i * 3;
                    
                    // Advance orbital phase (probe moves along its orbit)
                    data.orbitalPhase += data.orbitalSpeed * deltaTime;
                    if (data.orbitalPhase > Math.PI * 2) {
                        data.orbitalPhase -= Math.PI * 2;
                    }
                    
                    // Calculate position in orbit using orbital mechanics
                    const orbitalPos = this.calculateOrbitalPosition(data);
                    
                    // Position relative to planet's current position (probe orbits planet, planet orbits sun)
                    positions[idx] = planet.position.x + orbitalPos.x;
                    positions[idx + 1] = planet.position.y + orbitalPos.y;
                    positions[idx + 2] = planet.position.z + orbitalPos.z;
                }
                
                // Update geometry
                geometry.attributes.position.needsUpdate = true;
            });
        });
        
        // Update belt clouds (slowly orbit around sun)
        Object.keys(this.beltClouds).forEach(zoneId => {
            const zoneClouds = this.beltClouds[zoneId];
            if (!zoneClouds) return;
            
            Object.values(zoneClouds).forEach(cloud => {
                if (!cloud.visible || !cloud.userData) return;
                
                const { cloudData, positions } = cloud.userData;
                const geometry = cloud.geometry;
                const visibleCount = geometry.drawRange.count;
                
                // Update particle positions with slow orbital drift
                for (let i = 0; i < visibleCount; i++) {
                    const data = cloudData[i];
                    const idx = i * 3;
                    
                    if (data.isSpherical) {
                        // Oort cloud - slow drift in theta
                        data.theta += data.orbitalSpeed * deltaTime;
                        if (data.theta > Math.PI * 2) data.theta -= Math.PI * 2;
                        
                        positions[idx] = data.distance * Math.sin(data.phi) * Math.cos(data.theta);
                        positions[idx + 1] = data.distance * Math.sin(data.phi) * Math.sin(data.theta);
                        positions[idx + 2] = data.distance * Math.cos(data.phi);
                    } else {
                        // Ring distribution - slow orbital motion
                        data.angle += data.orbitalSpeed * deltaTime;
                        if (data.angle > Math.PI * 2) data.angle -= Math.PI * 2;
                        
                        positions[idx] = Math.cos(data.angle) * data.distance;
                        positions[idx + 1] = data.yOffset;
                        positions[idx + 2] = Math.sin(data.angle) * data.distance;
                    }
                }
                
                // Update geometry
                geometry.attributes.position.needsUpdate = true;
            });
        });
    }
    
    /**
     * Add an arriving particle to a zone's cloud at a specific position
     * Called when a transfer arrives at a zone to visually integrate the dot into the orbiting cloud
     * @param {string} zoneId - Zone ID where the particle arrives
     * @param {string} resourceType - 'probe' or 'metal' 
     * @param {THREE.Vector3} arrivalPosition - World position where the transfer arrived
     * @returns {boolean} True if particle was added, false if zone is full or invalid
     */
    addArrivingParticle(zoneId, resourceType, arrivalPosition) {
        // Map resource type to cloud type
        const cloudType = resourceType === 'metal' ? 'metal' : 'probes';
        
        // Check if this is a belt zone or planet zone
        const isBeltZone = this.beltZoneIds.includes(zoneId) || zoneId === 'dyson_sphere';
        const zoneClouds = isBeltZone ? this.beltClouds[zoneId] : this.clouds[zoneId];
        
        console.log('[ZoneClouds] addArrivingParticle:', {
            zoneId,
            cloudType,
            isBeltZone,
            hasZoneClouds: !!zoneClouds,
            availableZones: isBeltZone ? Object.keys(this.beltClouds || {}) : Object.keys(this.clouds || {})
        });
        
        if (!zoneClouds) {
            console.warn('[ZoneClouds] No zone clouds found for:', zoneId);
            return false;
        }
        
        const cloud = zoneClouds[cloudType];
        if (!cloud || !cloud.userData) {
            console.warn('[ZoneClouds] No cloud or userData for:', zoneId, cloudType);
            return false;
        }
        
        const { cloudData, positions, colors } = cloud.userData;
        const geometry = cloud.geometry;
        const currentCount = geometry.drawRange.count;
        const maxCount = this.maxDots[cloudType];
        
        // Check if zone is already at max capacity
        if (currentCount >= maxCount) {
            return false;
        }
        
        // Check if we're at the buffer limit
        if (currentCount >= this.maxParticlesPerCloud) {
            return false;
        }
        
        // Get planet/zone position to calculate relative arrival position
        let zonePosition = new THREE.Vector3(0, 0, 0);
        if (!isBeltZone) {
            const planet = this.solarSystem.planets[zoneId];
            if (planet) {
                zonePosition = planet.position.clone();
            }
        }
        
        // Calculate arrival position relative to the zone center
        const relativePos = arrivalPosition.clone().sub(zonePosition);
        
        // Calculate orbital parameters from arrival position
        const orbitalRadius = relativePos.length();
        
        // Calculate the phase (angle) from the arrival position
        // atan2(z, x) gives angle in XZ plane (y is up)
        const orbitalPhase = Math.atan2(relativePos.z, relativePos.x);
        
        // Calculate inclination from the Y offset
        // inclination = acos(y / radius) but we want angle from XZ plane
        const inclination = orbitalRadius > 0 ? Math.acos(Math.abs(relativePos.y) / orbitalRadius) : Math.PI / 2;
        
        // Ascending node - random for variety, but could be calculated from direction
        const ascendingNode = Math.random() * Math.PI * 2;
        
        // Orbital speed - faster for closer orbits (Kepler's law)
        const baseOrbitalSpeed = cloudType === 'probes' ? 0.15 : 0.08;
        const minRadius = cloud.userData.minRadius || 0.5;
        const orbitalSpeed = baseOrbitalSpeed / Math.sqrt(Math.max(orbitalRadius / minRadius, 0.5));
        const speedVariation = 0.8 + Math.random() * 0.4;
        
        // Update cloudData with the new particle's orbital parameters
        if (isBeltZone) {
            // Belt zones use different data structure
            const beltConfig = cloud.userData.beltConfig;
            if (beltConfig && beltConfig.isSpherical) {
                // Oort cloud - spherical
                cloudData[currentCount] = {
                    theta: Math.atan2(relativePos.z, relativePos.x),
                    phi: orbitalRadius > 0 ? Math.acos(relativePos.y / orbitalRadius) : Math.PI / 2,
                    distance: orbitalRadius,
                    isSpherical: true,
                    orbitalSpeed: 0.0001 + Math.random() * 0.0002
                };
            } else {
                // Ring distribution
                cloudData[currentCount] = {
                    angle: Math.atan2(relativePos.z, relativePos.x),
                    distance: Math.sqrt(relativePos.x * relativePos.x + relativePos.z * relativePos.z),
                    yOffset: relativePos.y,
                    isSpherical: false,
                    orbitalSpeed: 0.0005 + Math.random() * 0.001
                };
            }
        } else {
            // Planet zones use orbital mechanics data
            cloudData[currentCount] = {
                orbitalRadius: orbitalRadius,
                inclination: inclination,
                ascendingNode: ascendingNode,
                orbitalPhase: orbitalPhase,
                orbitalSpeed: orbitalSpeed * speedVariation
            };
        }
        
        // Set initial position
        const idx = currentCount * 3;
        positions[idx] = arrivalPosition.x;
        positions[idx + 1] = arrivalPosition.y;
        positions[idx + 2] = arrivalPosition.z;
        
        // Set color
        const color = this.colors[cloudType];
        const colorVariation = cloudType === 'metal' ? 0.1 : 0.2;
        colors[idx] = Math.max(0, Math.min(1, color.r + (Math.random() - 0.5) * colorVariation));
        colors[idx + 1] = Math.max(0, Math.min(1, color.g + (Math.random() - 0.5) * colorVariation));
        colors[idx + 2] = Math.max(0, Math.min(1, color.b + (Math.random() - 0.5) * colorVariation));
        
        // Update geometry
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
        geometry.setDrawRange(0, currentCount + 1);
        
        // Ensure cloud is visible
        cloud.visible = true;
        
        return true;
    }
    
    /**
     * Handle transfer arrival event - adds multiple particles at their arrival positions
     * Called by TransferVisualization when a transfer completes
     * Creates multiple particles proportional to mass (since zone clouds use fixed-size points)
     * @param {Object} arrivalInfo - {zoneId, resourceType, arrivals: [{position, massKg, velocityDir}], dotCount}
     */
    handleTransferArrival(arrivalInfo) {
        const { zoneId, resourceType, arrivals, dotCount } = arrivalInfo;
        
        console.log('[ZoneClouds] handleTransferArrival:', { zoneId, resourceType, arrivalCount: arrivals?.length });
        
        if (!arrivals || arrivals.length === 0) {
            console.warn('[ZoneClouds] No arrivals provided');
            return;
        }
        
        // Reference mass for a single particle (adjust based on typical mass values)
        // Metal: 1 megatonne (1e6 kg) per particle
        // Probes: 100 kg per particle (probe mass)
        const massPerParticle = resourceType === 'metal' ? 1e6 : 100;
        const maxParticlesPerArrival = 50; // Cap to avoid creating too many
        
        // Add particles for each arriving cargo, scaling count by mass
        let addedCount = 0;
        let totalParticlesCreated = 0;
        
        for (const arrival of arrivals) {
            const position = arrival.position;
            const massKg = arrival.massKg || 0;
            if (!position) continue;
            
            // Calculate how many particles to create based on mass
            // At minimum, create 1 particle; scale up for larger masses
            let particleCount = 1;
            if (massKg > 0 && massKg >= massPerParticle) {
                particleCount = Math.min(
                    Math.ceil(massKg / massPerParticle),
                    maxParticlesPerArrival
                );
            }
            
            // Create particles with slight position offsets for visual spread
            for (let i = 0; i < particleCount; i++) {
                // Add small random offset for visual variety (except first particle)
                let particlePos = position;
                if (i > 0) {
                    const offset = 0.02; // Small offset in visual units
                    particlePos = position.clone().add(new THREE.Vector3(
                        (Math.random() - 0.5) * offset,
                        (Math.random() - 0.5) * offset,
                        (Math.random() - 0.5) * offset
                    ));
                }
                
                const result = this.addArrivingParticle(zoneId, resourceType, particlePos);
                if (result) {
                    totalParticlesCreated++;
                }
            }
            addedCount++;
        }
        
        console.log(`[ZoneClouds] Added ${totalParticlesCreated} particles for ${addedCount} ${resourceType} arrivals to ${zoneId}`);
    }
}
