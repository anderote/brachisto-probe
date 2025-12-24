/** Zone Clouds Visualization - Probes, Metal, and Slag clouds around each planet */
class ZoneClouds {
    constructor(scene, solarSystem) {
        this.scene = scene;
        this.solarSystem = solarSystem;
        this.clouds = {}; // {zoneId: {probes: THREE.Points, metal: THREE.Points, slag: THREE.Points}}
        this.cloudData = {}; // {zoneId: {probes: [...], metal: [...], slag: [...]}}
        this.beltClouds = {}; // {zoneId: {probes: THREE.Points, metal: THREE.Points, slag: THREE.Points}} for belt zones
        this.maxParticlesPerCloud = 2000; // Max particles per cloud type (for buffer allocation)
        
        // Maximum dot counts for each cloud type
        this.maxDots = {
            probes: 2000,
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
            probes: 1.2,  // Inner cloud - tightest, closest to surface
            metal: 1.8,   // Middle cloud - moderate spread
            slag: 3.5     // Outer cloud - widest spread
        };
        
        // Belt zone IDs
        this.beltZoneIds = ['asteroid_belt', 'kuiper', 'kuiper_belt', 'oort_cloud'];
    }
    
    /**
     * Calculate visible probe count:
     * - Linear 1:1 for 1-10 probes (accurate representation)
     * - Logarithmic scaling from 10 probes to 1e21 probes (10 dots to 2000 dots)
     * @param {number} probeCount - Number of probes
     * @returns {number} Visible particle count
     */
    calculateProbeVisibleCount(probeCount) {
        if (probeCount <= 0) {
            return 0;
        }
        
        // Linear 1:1 for low counts (1-10 probes)
        if (probeCount <= 10) {
            return probeCount;
        }
        
        // Logarithmic scaling from 10 probes to 1e21 probes
        // Formula derived from: 10 dots at 10 probes, 2000 dots at 1e21 probes
        // dots = -89.5 + 99.5 * log10(probes)
        // At probes=10: -89.5 + 99.5*1 = 10
        // At probes=1e21: -89.5 + 99.5*21 = 2000
        const particles = -89.5 + 99.5 * Math.log10(probeCount);
        return Math.min(this.maxDots.probes, Math.max(10, Math.floor(particles)));
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
        
        // Create material - smaller sizes for better visibility without clutter
        const material = new THREE.PointsMaterial({
            size: cloudType === 'slag' ? 0.025 : (cloudType === 'metal' ? 0.02 : 0.01),
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: cloudType === 'slag' ? 0.8 : 0.9,
            depthWrite: false, // Prevent depth conflicts
            depthTest: true // Still test depth but don't write
        });
        
        const points = new THREE.Points(geometry, material);
        
        // Configure rendering properties to prevent disappearing when zoomed in
        points.renderOrder = 100; // Render after planets
        points.frustumCulled = false; // Don't cull when camera is close
        
        // Store cloud particle data - exponential decay distribution outward from planet surface
        // Particles are densest near the surface and become sparser further out
        const cloudData = [];
        for (let i = 0; i < this.maxParticlesPerCloud; i++) {
            // Random spherical direction (uniform on sphere)
            const theta = Math.random() * Math.PI * 2; // Azimuth angle
            const phi = Math.acos(2 * Math.random() - 1); // Polar angle (uniform distribution)
            
            // Exponential decay from minimum radius outward
            // Most particles will be close to minRadius, fewer further out
            const radius = minRadius + this.exponentialRandom(decayScale);
            
            cloudData.push({
                theta: theta,
                phi: phi,
                radius: radius,
                // Store initial offset for slight drift/movement
                driftSpeed: (Math.random() - 0.5) * 0.001 // Very slow drift for subtle movement
            });
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
        
        // Create material - slightly larger for belt visibility
        const material = new THREE.PointsMaterial({
            size: cloudType === 'slag' ? 0.035 : (cloudType === 'metal' ? 0.03 : 0.025),
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: cloudType === 'slag' ? 0.8 : 0.9,
            depthWrite: false,
            depthTest: true
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
            
            const planetRadius = this.solarSystem.logScaleRadius(planetInfo.radius_km);
            
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
        const AU_KM = this.solarSystem.AU_KM;
        let beltConfig;
        
        if (zone.id === 'asteroid_belt') {
            // Asteroid belt between Mars and Jupiter
            const marsOrbit = this.solarSystem.logScaleOrbit(this.solarSystem.planetData.mars.orbit_km);
            const jupiterOrbit = this.solarSystem.logScaleOrbit(this.solarSystem.planetData.jupiter.orbit_km);
            beltConfig = {
                innerRadius: marsOrbit * 1.1,
                outerRadius: jupiterOrbit * 0.9,
                isSpherical: false,
                verticalSpread: 0.8
            };
        } else if (zone.id === 'kuiper' || zone.id === 'kuiper_belt') {
            // Kuiper belt beyond Neptune
            beltConfig = {
                innerRadius: this.solarSystem.logScaleOrbit(90 * AU_KM),
                outerRadius: this.solarSystem.logScaleOrbit(165 * AU_KM),
                isSpherical: false,
                verticalSpread: 0.5
            };
        } else if (zone.id === 'oort_cloud') {
            // Oort cloud - spherical distribution
            beltConfig = {
                innerRadius: this.solarSystem.logScaleOrbit(180 * AU_KM),
                outerRadius: this.solarSystem.logScaleOrbit(420 * AU_KM),
                isSpherical: true,
                verticalSpread: 0 // Not used for spherical
            };
        } else if (zone.id === 'dyson_sphere') {
            // Dyson sphere - thin ring at 2.5 times Mercury's orbital radius
            const mercuryOrbit = this.solarSystem.logScaleOrbit(this.solarSystem.planetData.mercury.orbit_km);
            const dysonOrbit = mercuryOrbit * 2.5;
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
        
        const planetRadius = this.solarSystem.logScaleRadius(planetInfo.radius_km);
        
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
        
        // Update each planet zone's clouds
        Object.keys(this.clouds).forEach(zoneId => {
            const zoneClouds = this.clouds[zoneId];
            if (!zoneClouds) return;
            
            // Get probe count
            const probeCounts = probesByZone[zoneId] || {};
            const totalProbes = Object.values(probeCounts).reduce((sum, count) => sum + (count || 0), 0);
            
            // Get zone data
            const zone = zones[zoneId] || {};
            const storedMetal = zone.stored_metal || 0;
            const slagMass = zone.slag_mass || 0;
            
            // Calculate visible counts using type-specific scaling
            const probeCount = this.calculateProbeVisibleCount(totalProbes);
            const metalCount = this.calculateMetalVisibleCount(storedMetal);
            const slagCount = this.calculateSlagVisibleCount(slagMass);
            
            // Update each cloud type
            this.updateCloudParticles(zoneClouds.probes, 'probes', probeCount, zoneId);
            this.updateCloudParticles(zoneClouds.metal, 'metal', metalCount, zoneId);
            this.updateCloudParticles(zoneClouds.slag, 'slag', slagCount, zoneId);
        });
        
        // Update each belt zone's clouds
        Object.keys(this.beltClouds).forEach(zoneId => {
            const zoneClouds = this.beltClouds[zoneId];
            if (!zoneClouds) return;
            
            // Get probe count
            const probeCounts = probesByZone[zoneId] || {};
            const totalProbes = Object.values(probeCounts).reduce((sum, count) => sum + (count || 0), 0);
            
            // Get zone data
            const zone = zones[zoneId] || {};
            const storedMetal = zone.stored_metal || 0;
            const slagMass = zone.slag_mass || 0;
            
            // Calculate visible counts using type-specific scaling
            const probeCount = this.calculateProbeVisibleCount(totalProbes);
            const metalCount = this.calculateMetalVisibleCount(storedMetal);
            const slagCount = this.calculateSlagVisibleCount(slagMass);
            
            // Update each belt cloud type
            this.updateBeltCloudParticles(zoneClouds.probes, 'probes', probeCount, zoneId);
            this.updateBeltCloudParticles(zoneClouds.metal, 'metal', metalCount, zoneId);
            this.updateBeltCloudParticles(zoneClouds.slag, 'slag', slagCount, zoneId);
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
            // Use solar system's log scaling for orbit radius
            const orbitKm = au * 149600000; // Convert AU to km
            const orbitRadius = this.solarSystem.logScaleOrbit(orbitKm);
            
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
                    const fromOrbitKm = fromAU * 149600000;
                    const toOrbitKm = toAU * 149600000;
                    const fromOrbitRadius = this.solarSystem.logScaleOrbit(fromOrbitKm);
                    const toOrbitRadius = this.solarSystem.logScaleOrbit(toOrbitKm);
                    
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
            
            // Calculate position in 3D spherical cloud around planet
            // Convert spherical coordinates (theta, phi, radius) to cartesian
            const x = data.radius * Math.sin(data.phi) * Math.cos(data.theta);
            const y = data.radius * Math.sin(data.phi) * Math.sin(data.theta);
            const z = data.radius * Math.cos(data.phi);
            
            // Position relative to planet's current position (cloud orbits sun with planet)
            positions[idx] = planetX + x;
            positions[idx + 1] = planetY + y;
            positions[idx + 2] = planetZ + z;
            
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
     * Update cloud positions - clouds orbit sun with their planets
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
                
                // Update particle positions - clouds move with planet as it orbits sun
                // Add subtle drift for visual interest (very slow)
                for (let i = 0; i < visibleCount; i++) {
                    const data = cloudData[i];
                    const idx = i * 3;
                    
                    // Apply subtle drift to theta for slow rotation
                    data.theta += data.driftSpeed * deltaTime;
                    if (data.theta > Math.PI * 2) {
                        data.theta -= Math.PI * 2;
                    } else if (data.theta < 0) {
                        data.theta += Math.PI * 2;
                    }
                    
                    // Convert spherical coordinates to cartesian
                    const x = data.radius * Math.sin(data.phi) * Math.cos(data.theta);
                    const y = data.radius * Math.sin(data.phi) * Math.sin(data.theta);
                    const z = data.radius * Math.cos(data.phi);
                    
                    // Position relative to planet's current position (cloud orbits sun with planet)
                    positions[idx] = planet.position.x + x;
                    positions[idx + 1] = planet.position.y + y;
                    positions[idx + 2] = planet.position.z + z;
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
}
