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
        this.zoneClouds = null; // ZoneClouds instance
        this.initialZoneMasses = {}; // Store initial mass for each zone
        
        // Resource particle visualization
        // Stored metal, slag, and methalox appear as particles orbiting around the planet
        // Particles spawn near planet and orbit at 80% speed, forming trailing cloud
        // When resources are consumed, particles are removed
        this.resourceParticles = {}; // {zoneId: THREE.Points}
        this.resourceParticleData = {}; // {zoneId: {metal: [...], slag: [...], methalox: [...]}}
        this.previousResources = {}; // {zoneId: {metal: 0, slag: 0, methalox: 0}} - track changes
        this.pendingMass = {}; // {zoneId: {metal: 0, slag: 0, methalox: 0}} - accumulated mass waiting to become particles
        this.lastUpdateTime = {}; // {zoneId: timestamp} - track last update time per zone
        this.lastSpawnTime = {}; // {zoneId_resourceType: timestamp} - track last spawn time for rate limiting
        this.maxResourceParticles = 50000; // Max particles per planet (metal + slag combined)
        
        // Resource size tiers with progressive filling limits (separate for metal and slag)
        this.resourceSizes = {
            small:  { mass: 1e9,  size: 0.15 },
            medium: { mass: 1e12,  size: 0.275 },
            large:  { mass: 1e15, size: 0.4 },
            xlarge: { mass: 1e22, size: 0.45 }
        };
        // Separate max particles per resource type
        this.maxParticlesByType = {
            metal: {
                small: 50000,
                medium: 20000,
                large: 8000,
                xlarge: 2000
            },
            slag: {
                small: 20000,
                medium: 10000,
                large: 5000,
                xlarge: 2000
            },
            methalox: {
                small: 20000,
                medium: 10000,
                large: 5000,
                xlarge: 2000
            }
        };
        this.maxDotsPerZone = 15000; // Maximum dots per zone (metal + slag combined) - kept for compatibility
        
        // Legacy resource scaling (kept for backward compatibility, will be replaced)
        this.resourceKgPerDot = 1000; // 1000kg of slag/metal = 1 dot
        this.resourceLinearMaxDots = 100; // First 100 dots are linear (100,000 kg)
        this.resourceLogMaxMass = 1e24; // Reference mass for max dots - full planet mass scale
        
        // Resource colors (metal = silver, slag = brown-grey, methalox = pale blue)
        this.resourceColors = {
            metal: new THREE.Color(0xC0C0C0),    // Silver
            slag: new THREE.Color(0x5C4033),     // Brown-grey
            methalox: new THREE.Color(0x7EC8E3) // Pale blue
        };
        
        // Particle drift settings
        this.particleDriftDuration = 3.0; // Seconds for particle to drift from spawn to orbit
        this.particleSpawnRadius = 0.1; // Initial spawn offset from planet center

        // Real-world planet data (radii in km, orbital distances in km)
        // 1 AU = 149,600,000 km
        this.AU_KM = 149600000;
        this.planetData = {
            sun: { radius_km: 696000 },
            mercury: { radius_km: 2440, orbit_km: 0.39 * 149600000 },         // 0.39 AU
            venus: { radius_km: 6052, orbit_km: 0.72 * 149600000 },          // 0.72 AU
            earth: { radius_km: 6371, orbit_km: 1.0 * 149600000 },           // 1.0 AU
            mars: { radius_km: 3390, orbit_km: 1.52 * 149600000 },            // 1.52 AU
            jupiter: { radius_km: 69911, orbit_km: 5.2 * 149600000 },        // 5.2 AU
            saturn: { radius_km: 58232, orbit_km: 9.5 * 149600000 },         // 9.5 AU
            uranus: { radius_km: 25362, orbit_km: 19.2 * 149600000 },        // 19.2 AU
            neptune: { radius_km: 24622, orbit_km: 30.1 * 149600000 },        // 30.1 AU
            // Pluto - dwarf planet and main body of the Kuiper Belt zone
            // Real orbit: ~40 AU average (Kuiper belt center)
            kuiper: { radius_km: 1188, orbit_km: 40.0 * 149600000 },         // 40 AU
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

    logScaleRadius(radiusKm) {
        const logRadius = Math.log10(radiusKm);
        const normalized = (logRadius - this.logMinRadius) / (this.logMaxRadius - this.logMinRadius);
        return normalized * this.radiusScale;
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

    createPlanet(zone) {
        // Use the color from orbital_mechanics.json
        const color = zone.color || '#888888';
        
        // Get planet data for radius
        const planetInfo = this.planetData[zone.id];
        let planetRadius;
        let orbitRadius;
        
        if (planetInfo) {
            // Use log-scaled real radius
            planetRadius = this.logScaleRadius(planetInfo.radius_km);
            
            // Use unified scaling (converts km to AU first)
            const orbitAU = planetInfo.orbit_km / this.AU_KM;
            orbitRadius = this.scaleAUToVisual(orbitAU);
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
        } else {
            planetRadius = Math.max(0.08, planetRadius);
        }
        
        // Create 3D planet sphere with proper lighting
        const planetGeometry = new THREE.SphereGeometry(planetRadius, 32, 32);
        
        // Use MeshStandardMaterial for realistic lighting with proper color
        // Reduced metalness and increased roughness for better shadow visibility
        // Colors darkened to prevent bloom from washing out details
        const planetMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color).multiplyScalar(0.6),
            metalness: 0.1,
            roughness: 0.9,
            emissive: 0x000000,
            transparent: true,
            opacity: 1.0
        });
        
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
        const moonData = {
            earth: [
                // Earth's Moon - the only natural satellite
                // Earth radius = 6,371 km, Moon orbits at ~60 Earth radii
                // The Moon has a subtle brownish-grey color from iron and titanium oxides
                { name: 'Moon', orbit_km: 384400, radius_km: 1737, color: '#A8A8A0', period_days: 27.32, inclination: 5.14 }
            ],
            mars: [
                // Mars's two small, captured asteroid moons
                // Mars radius = 3,390 km
                // Both moons are very dark (albedo ~0.07), irregular shaped, and heavily cratered
                // Phobos: Larger, closer, orbits faster than Mars rotates (will crash in ~50 million years)
                { name: 'Phobos', orbit_km: 9376, radius_km: 11.3, color: '#4A4A48', period_days: 0.319, inclination: 1.08 },
                // Deimos: Smaller, farther, smoother surface covered in regolith
                { name: 'Deimos', orbit_km: 23460, radius_km: 6.2, color: '#525250', period_days: 1.263, inclination: 1.79 }
            ],
            jupiter: [
                // Jupiter's moons - ordered by orbital distance
                // Jupiter radius = 69,911 km
                // Inner moons (ring shepherds)
                { name: 'Metis', orbit_km: 128000, radius_km: 22, color: '#8B8B83', period_days: 0.29, inclination: 0.02 },
                { name: 'Adrastea', orbit_km: 129000, radius_km: 8, color: '#8B8378', period_days: 0.30, inclination: 0.03 },
                { name: 'Amalthea', orbit_km: 181366, radius_km: 84, color: '#CD5C5C', period_days: 0.50, inclination: 0.37 },
                { name: 'Thebe', orbit_km: 221889, radius_km: 50, color: '#B0B0B0', period_days: 0.67, inclination: 1.08 },
                // Galilean moons (the big four, in order from Jupiter)
                { name: 'Io', orbit_km: 421700, radius_km: 1822, color: '#FFCC00', period_days: 1.77, inclination: 0.04 },
                { name: 'Europa', orbit_km: 671034, radius_km: 1561, color: '#B8D4E8', period_days: 3.55, inclination: 0.47 },
                { name: 'Ganymede', orbit_km: 1070412, radius_km: 2634, color: '#8B8878', period_days: 7.15, inclination: 0.18 },
                { name: 'Callisto', orbit_km: 1882709, radius_km: 2410, color: '#5D5D5D', period_days: 16.69, inclination: 0.19 }
            ],
            saturn: [
                // Saturn's major moons - ordered by orbital distance
                // Real orbital distances from Saturn (Saturn radius = 58,232 km)
                // All major moons orbit in Saturn's equatorial plane (same as rings)
                { name: 'Mimas', orbit_km: 185520, radius_km: 198, color: '#C0C0C0', period_days: 0.94, inclination: 1.5 },
                { name: 'Enceladus', orbit_km: 237948, radius_km: 252, color: '#F0F8FF', period_days: 1.37, inclination: 0.02 },
                { name: 'Tethys', orbit_km: 294619, radius_km: 531, color: '#F5F5F5', period_days: 1.89, inclination: 1.1 },
                { name: 'Dione', orbit_km: 377396, radius_km: 561, color: '#E8E8E8', period_days: 2.74, inclination: 0.02 },
                { name: 'Rhea', orbit_km: 527108, radius_km: 764, color: '#D3D3D3', period_days: 4.52, inclination: 0.35 },
                { name: 'Titan', orbit_km: 1221870, radius_km: 2575, color: '#FFA500', period_days: 15.95, inclination: 0.33 },
                { name: 'Hyperion', orbit_km: 1481010, radius_km: 135, color: '#A89078', period_days: 21.28, inclination: 0.43 },
                { name: 'Iapetus', orbit_km: 3560820, radius_km: 735, color: '#8B4513', period_days: 79.32, inclination: 15.47 }
            ],
            uranus: [
                // Uranus moons - orbit in Uranus's equatorial plane (tilted ~98°)
                { name: 'Miranda', orbit_km: 129390, radius_km: 236, color: '#A9A9A9', period_days: 1.41, inclination: 4.2 },
                { name: 'Ariel', orbit_km: 190900, radius_km: 579, color: '#D3D3D3', period_days: 2.52, inclination: 0.04 },
                { name: 'Umbriel', orbit_km: 266000, radius_km: 585, color: '#696969', period_days: 4.14, inclination: 0.13 },
                { name: 'Titania', orbit_km: 435910, radius_km: 789, color: '#B0C4DE', period_days: 8.71, inclination: 0.08 },
                { name: 'Oberon', orbit_km: 583520, radius_km: 761, color: '#778899', period_days: 13.46, inclination: 0.07 }
            ],
            neptune: [
                { name: 'Triton', orbit_km: 354760, radius_km: 1353, color: '#E0E0E0', period_days: 5.88, inclination: 156.9 }, // Retrograde!
                { name: 'Proteus', orbit_km: 117647, radius_km: 210, color: '#808080', period_days: 1.12, inclination: 0.08 }
            ],
            kuiper: [
                // Pluto's moons - the Pluto-Charon system is unique (barycenter outside Pluto)
                // Pluto radius = 1,188 km
                // Charon is so large relative to Pluto that they're sometimes called a binary dwarf planet
                { name: 'Charon', orbit_km: 19591, radius_km: 606, color: '#A0A0A0', period_days: 6.387, inclination: 0.08 },
                // Small irregular moons discovered by Hubble
                { name: 'Nix', orbit_km: 48694, radius_km: 25, color: '#C8C8C8', period_days: 24.85, inclination: 0.13 },
                { name: 'Hydra', orbit_km: 64738, radius_km: 33, color: '#D0D0D0', period_days: 38.2, inclination: 0.24 },
                { name: 'Kerberos', orbit_km: 57783, radius_km: 12, color: '#B8B8B8', period_days: 32.17, inclination: 0.39 },
                { name: 'Styx', orbit_km: 42656, radius_km: 8, color: '#C0C0C0', period_days: 20.16, inclination: 0.81 }
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

        const planetRadius = this.logScaleRadius(planetInfo.radius_km);
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
            const minOrbitMultiplier = 1.8;  // Minimum visual distance from planet
            const maxOrbitMultiplier = 8.0;  // Maximum visual distance
            
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
            
            // Log-proportional moon radius based on actual moon size
            const moonRadius = Math.max(0.015, this.logScaleRadius(moon.radius_km) * 0.8);
            
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
                orbitInEquatorialPlane: ['mars', 'jupiter', 'saturn', 'uranus', 'kuiper'].includes(zone.id)
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
        const segments = 128;
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
        const segments = 128;
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
            
            // Vary sizes
            sizes[i] = 0.015 + Math.random() * 0.025;
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
            // Dwarf planet Ceres - largest object in asteroid belt
            { name: 'Ceres', semiMajorAxisAU: 2.77, diameter_km: 939, color: '#8B8B7A', period_days: 1682, inclination: 10.6 },
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
        
        // Store reference to Ceres specifically for zone focusing
        this.ceres = this.majorAsteroids['ceres'];
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
            
            // Vary sizes - larger objects than asteroid belt
            sizes[i] = 0.02 + Math.random() * 0.03;
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
                methalox: []   // Active methalox particles
            };
            
            // Initialize previous resource tracking
            this.previousResources[zoneId] = {
                metal: 0,
                slag: 0,
                methalox: 0
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
     * @returns {string} Size class: 'small', 'medium', 'large', or 'xlarge'
     */
    determineParticleSizeFromRate(miningRateKgPerDay) {
        if (!miningRateKgPerDay || miningRateKgPerDay <= 0) {
            return 'small'; // Default to small for very low/no rates
        }
        
        // Use logarithmic scaling to determine size based on rate
        // Thresholds: small < 1e9, medium < 1e12, large < 1e15, xlarge >= 1e15 kg/day
        const logRate = Math.log10(miningRateKgPerDay);
        
        if (logRate >= 15) {
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
     * Calculate target particle count based on mass and limits
     * Particles are spawned with sizes determined by mining rate
     * @param {number} massKg - Mass in kg (slag or metal)
     * @param {string} resourceType - 'metal' or 'slag' to determine limits
     * @param {number} maxDotsPerZone - Ignored, kept for API compatibility
     * @returns {Object} {small: n, medium: n, large: n, xlarge: n} dot counts
     */
    calculateDotDistribution(massKg, resourceType = 'metal', maxDotsPerZone = null) {
        if (massKg <= 0) {
            return { small: 0, medium: 0, large: 0, xlarge: 0 };
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
                xlarge: 0
            };
        }
        
        // Otherwise, fill up to limits starting with small, then larger sizes
        let remaining = massKg;
        let small = 0;
        let medium = 0;
        let large = 0;
        let xlarge = 0;
        
        // Fill small up to limit
        const maxSmall = maxParticles.small;
        const smallMass = maxSmall * this.resourceSizes.small.mass;
        if (remaining >= smallMass) {
            small = maxSmall;
            remaining -= smallMass;
        } else {
            small = Math.floor(remaining / this.resourceSizes.small.mass);
            return { small, medium: 0, large: 0, xlarge: 0 };
        }
        
        // Fill medium up to limit
        const maxMedium = maxParticles.medium;
        const mediumMass = maxMedium * this.resourceSizes.medium.mass;
        if (remaining >= mediumMass) {
            medium = maxMedium;
            remaining -= mediumMass;
        } else {
            medium = Math.floor(remaining / this.resourceSizes.medium.mass);
            return { small, medium, large: 0, xlarge: 0 };
        }
        
        // Fill large up to limit
        const maxLarge = maxParticles.large;
        const largeMass = maxLarge * this.resourceSizes.large.mass;
        if (remaining >= largeMass) {
            large = maxLarge;
            remaining -= largeMass;
        } else {
            large = Math.floor(remaining / this.resourceSizes.large.mass);
            return { small, medium, large, xlarge: 0 };
        }
        
        // Fill xlarge up to limit
        const maxXlarge = maxParticles.xlarge;
        const xlargeMass = maxXlarge * this.resourceSizes.xlarge.mass;
        if (remaining >= xlargeMass) {
            xlarge = maxXlarge;
        } else {
            xlarge = Math.floor(remaining / this.resourceSizes.xlarge.mass);
        }
        
        return { small, medium, large, xlarge };
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
     * @param {string} sizeClass - 'small', 'medium', 'large', or 'xlarge'
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
        // Base duration is longer for a slow, gentle drift into orbit
        const distanceRatio = Math.abs(targetDistance - spawnDistance) / earthOrbitRadius;
        const driftDuration = 60.0 + distanceRatio * 60.0; // 45-69+ seconds for very slow drift
        
        return {
            type: type,
            sizeClass: sizeClass, // 'small', 'medium', 'large', or 'xlarge'
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
            // Animation state
            spawnTime: this.time,
            drifting: true,
            driftDuration: driftDuration
        };
    }
    
    /**
     * Create a "mass driver" particle that shoots out from a planet along a Hohmann transfer
     * This animation is used for launching material to the Dyson sphere
     * Particle shoots out from planet position and decelerates into target orbit
     * @param {string} fromZoneId - Source planet zone ID
     * @param {number} targetOrbitRadius - Target orbital radius (e.g., Dyson sphere)
     * @param {string} type - 'metal' or 'slag'
     * @returns {Object} New particle data with Hohmann transfer parameters
     */
    spawnMassDriverParticle(fromZoneId, targetOrbitRadius, type) {
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
        
        return {
            type: type,
            sizeClass: 'medium', // Mass driver particles use medium size by default
            // Target orbital parameters (at Dyson sphere)
            targetAngle: targetAngle,
            targetDistance: targetOrbitRadius,
            yOffset: yOffset,
            orbitalSpeed: orbitalSpeed,
            // Spawn state: starts at planet position
            spawnTime: this.time,
            spawnAngle: planetAngle,
            spawnDistance: planetOrbitRadius,
            drifting: true, // Uses drift animation to simulate Hohmann transfer
            driftDuration: 5.0 // Longer duration for dramatic effect
        };
    }
    
    /**
     * Count particles by size class in an array
     * @param {Array} particles - Array of particle objects
     * @returns {Object} {small: n, medium: n, large: n, xlarge: n}
     */
    countParticlesBySize(particles) {
        const counts = { small: 0, medium: 0, large: 0, xlarge: 0 };
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
            
            // Get previous resource amounts
            const prev = this.previousResources[zoneId] || { metal: 0, slag: 0, methalox: 0 };
            const prevMetal = prev.metal || 0;
            const prevSlag = prev.slag || 0;
            const prevMethalox = prev.methalox || 0;
            
            // Get production rates for this zone (kg/day)
            const metalMiningRate = zoneData.metal_mined_rate || 0;
            const slagMiningRate = zoneData.slag_produced_rate || 0;
            const methaloxProductionRate = zoneData.methalox_production_rate || 0;
            
            // Initialize pending mass tracking
            if (!this.pendingMass[zoneId]) {
                this.pendingMass[zoneId] = { metal: 0, slag: 0, methalox: 0 };
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
            
            // Get max particles for this resource type
            const maxMetalParticles = this.maxParticlesByType.metal;
            const maxSlagParticles = this.maxParticlesByType.slag;
            const maxMethaloxParticles = this.maxParticlesByType.methalox;
            
            // Helper function to gradually spawn particles from pending mass
            // Uses time-based rate limiting to prevent bursts
            const spawnParticlesGradually = (particles, pendingMass, miningRate, resourceType, maxParticles) => {
                if (pendingMass <= 0) return pendingMass;
                
                // Determine particle size based on mining rate
                const sizeClass = this.determineParticleSizeFromRate(miningRate);
                const particleMass = this.resourceSizes[sizeClass].mass;
                
                // Calculate spawn rate: at low mining rates, spawn less frequently
                // Base spawn interval: how often to check for spawning (in days)
                // Higher mining rate = more frequent spawns, but still gradual
                const minSpawnInterval = 0.001; // Minimum 0.001 days (~1.4 minutes) between spawn checks
                const maxSpawnInterval = 0.1;   // Maximum 0.1 days (~2.4 hours) between spawn checks
                
                // Scale spawn interval inversely with mining rate (higher rate = shorter interval)
                // Use log scale to handle wide range of rates
                let spawnInterval = maxSpawnInterval;
                if (miningRate > 0) {
                    const logRate = Math.log10(Math.max(1, miningRate));
                    // Map logRate (0-20+) to interval (maxSpawnInterval to minSpawnInterval)
                    const normalizedRate = Math.min(1, logRate / 15); // Normalize to 0-1
                    spawnInterval = maxSpawnInterval - (maxSpawnInterval - minSpawnInterval) * normalizedRate;
                }
                
                // Check if enough time has passed since last spawn
                const lastSpawnKey = `${zoneId}_${resourceType}_lastSpawn`;
                if (!this.lastSpawnTime) this.lastSpawnTime = {};
                const lastSpawn = this.lastSpawnTime[lastSpawnKey] || 0;
                
                // Only spawn if enough time has passed (rate limiting)
                if (deltaTime < spawnInterval && lastSpawn > 0) {
                    return pendingMass; // Not time to spawn yet
                }
                
                // Calculate how many particles we can spawn based on pending mass
                const currentCounts = this.countParticlesBySize(particles);
                const currentOfSize = currentCounts[sizeClass] || 0;
                const maxOfSize = maxParticles[sizeClass] || 0;
                
                // Check if we can spawn particles of this size
                if (currentOfSize >= maxOfSize) {
                    // At max for this size, try smaller sizes
                    const sizeOrder = ['small', 'medium', 'large', 'xlarge'];
                    const sizeIndex = sizeOrder.indexOf(sizeClass);
                    for (let i = sizeIndex - 1; i >= 0; i--) {
                        const trySize = sizeOrder[i];
                        const tryMax = maxParticles[trySize] || 0;
                        const tryCurrent = currentCounts[trySize] || 0;
                        const tryMass = this.resourceSizes[trySize].mass;
                        
                        if (tryCurrent < tryMax && pendingMass >= tryMass) {
                            // Spawn one particle of this smaller size
                            const particle = this.spawnResourceParticle(zoneId, resourceType, trySize);
                            if (particle) {
                                particles.push(particle);
                                this.lastSpawnTime[lastSpawnKey] = currentTime;
                                return pendingMass - tryMass; // Return remaining pending mass
                            }
                        }
                    }
                    // Can't spawn any particles (all sizes at max)
                    return pendingMass;
                }
                
                // Spawn particles if we have enough pending mass
                // Limit to 1-3 particles per spawn to keep it gradual
                const maxParticlesPerSpawn = Math.min(3, Math.ceil(miningRate / 1e9)); // More at higher rates, but capped
                if (pendingMass >= particleMass) {
                    const numParticles = Math.min(
                        Math.floor(pendingMass / particleMass),
                        maxOfSize - currentOfSize,
                        maxParticlesPerSpawn // Rate limit per spawn
                    );
                    
                    for (let i = 0; i < numParticles; i++) {
                        const particle = this.spawnResourceParticle(zoneId, resourceType, sizeClass);
                        if (particle) {
                            particles.push(particle);
                            pendingMass -= particleMass;
                        }
                    }
                    
                    if (numParticles > 0) {
                        this.lastSpawnTime[lastSpawnKey] = currentTime;
                    }
                }
                
                return pendingMass;
            };
            
            // Helper function to remove particles when mass decreases
            const removeParticlesForDecrease = (particles, massDecrease) => {
                if (massDecrease >= 0) return;
                
                const toRemoveMass = Math.abs(massDecrease);
                let remainingToRemove = toRemoveMass;
                
                // Remove largest particles first: xlarge -> large -> medium -> small
                const sizeOrder = ['xlarge', 'large', 'medium', 'small'];
                
                for (const sizeClass of sizeOrder) {
                    if (remainingToRemove <= 0) break;
                    
                    const particleMass = this.resourceSizes[sizeClass].mass;
                    const particlesOfSize = particles.filter(p => (p.sizeClass || 'small') === sizeClass);
                    
                    if (particlesOfSize.length === 0) continue;
                    
                    // Sort by spawn time (oldest first)
                    particlesOfSize.sort((a, b) => a.spawnTime - b.spawnTime);
                    
                    // Remove particles until we've accounted for the mass decrease
                    while (remainingToRemove > 0 && particlesOfSize.length > 0) {
                        const index = particles.indexOf(particlesOfSize[0]);
                        if (index >= 0) {
                            particles.splice(index, 1);
                            particlesOfSize.shift();
                            remainingToRemove -= particleMass;
                        } else {
                            break;
                        }
                    }
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
            
            // Update previous tracking
            this.previousResources[zoneId] = {
                metal: currentMetal,
                slag: currentSlag,
                methalox: currentMethalox
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
        
        const allParticles = [...particleData.metal, ...particleData.slag, ...particleData.methalox];
        const positions = particleSystem.geometry.attributes.position.array;
        const colors = particleSystem.geometry.attributes.color.array;
        const sizeAttr = particleSystem.geometry.attributes.size;
        const sizes = sizeAttr ? sizeAttr.array : null;
        
        for (let i = 0; i < allParticles.length && i < this.maxResourceParticles; i++) {
            const p = allParticles[i];
            const timeSinceSpawn = this.time - p.spawnTime;
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
                    p.driftEndTime = this.time; // Track when drift ended for continuous orbital motion
                }
            } else {
                // Particle has settled into orbit - continues orbiting at target distance
                // Only add orbital motion for time AFTER drift ended (avoid double-counting)
                const timeSinceDriftEnd = this.time - (p.driftEndTime || p.spawnTime);
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
            } else {
                color = this.resourceColors.slag;
            }
            // Add slight variation based on index
            const variation = 0.12;
            const varSeed = (i * 0.618) % 1;
            colors[i * 3] = Math.max(0, Math.min(1, color.r + (varSeed - 0.5) * variation));
            colors[i * 3 + 1] = Math.max(0, Math.min(1, color.g + (varSeed - 0.5) * variation));
            colors[i * 3 + 2] = Math.max(0, Math.min(1, color.b + (varSeed - 0.5) * variation));
            
            // Set size based on sizeClass
            if (sizes) {
                const sizeClass = p.sizeClass || 'small';
                sizes[i] = this.resourceSizes[sizeClass]?.size || this.resourceSizes.small.size;
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
        
        // Asteroid belt focuses on Ceres as the de facto center
        if (zoneId === 'asteroid_belt' && this.ceres) {
            return this.ceres.position.clone();
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
                        planet.material.color.setHex(0x333333);
                        planet.material.emissive.setHex(0x000000);
                    }
                    if (orbit && orbit.material) {
                        orbit.material.opacity = 0.1;
                        orbit.material.color.setHex(0x333333);
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
                if (planet.material && this.orbitalData) {
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
                    planet.material.color.setHex(0x333333); // Grey when fading
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
                        planet.material.color.setStyle(zone.color || '#888888');
                        planet.material.opacity = 1.0;
                        planet.material.emissive.setHex(0x000000);
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

