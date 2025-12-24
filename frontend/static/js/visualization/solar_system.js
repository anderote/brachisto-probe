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

        // Real-world planet data (radii in km, orbital distances in km)
        // 1 AU = 149,600,000 km
        this.AU_KM = 149600000;
        this.planetData = {
            sun: { radius_km: 696000 },
            mercury: { radius_km: 2440, orbit_km: 173700000 },         // 1.17 AU (3x: 0.39 -> 1.17)
            venus: { radius_km: 6052, orbit_km: 324600000 },          // 2.16 AU (3x: 0.72 -> 2.16)
            earth: { radius_km: 6371, orbit_km: 448800000 },          // 3.0 AU (3x: 1.0 -> 3.0)
            mars: { radius_km: 3390, orbit_km: 683700000 },           // 4.56 AU (3x: 1.52 -> 4.56)
            jupiter: { radius_km: 69911, orbit_km: 2335500000 },       // 15.6 AU (3x: 5.2 -> 15.6)
            saturn: { radius_km: 58232, orbit_km: 4290000000 },       // 28.5 AU (3x: 9.5 -> 28.5)
            uranus: { radius_km: 25362, orbit_km: 8610000000 },       // 57.6 AU (3x: 19.2 -> 57.6)
            neptune: { radius_km: 24622, orbit_km: 13500000000 },      // 90.3 AU (3x: 30.1 -> 90.3)
            kuiper: { orbit_km: 135 * 149600000 },                     // 135 AU (3x: 45 -> 135)
            oort: { orbit_km: 300 * 149600000 },                      // 300 AU (3x: 100 -> 300)
            oort_outer: { orbit_km: 420 * 149600000 }                 // 420 AU (3x: 140 -> 420)
        };

        // Load orbital data (will calculate scaling and create sun)
        this.loadOrbitalData();
    }

    calculateScalingFactors() {
        // Find min/max for log scaling
        const radii = Object.values(this.planetData).filter(p => p.radius_km).map(p => p.radius_km);
        const orbits = Object.values(this.planetData)
            .filter(p => p.orbit_km)
            .map(p => p.orbit_km);

        this.minRadius = Math.min(...radii);
        this.maxRadius = Math.max(...radii);
        this.minOrbit = Math.min(...orbits);
        // Use Oort cloud outer edge (140 AU) as the max orbit for proper log scaling
        this.maxOrbit = this.planetData.oort_outer.orbit_km;

        // Log ranges for scaling
        this.logMinRadius = Math.log10(this.minRadius);
        this.logMaxRadius = Math.log10(this.maxRadius);
        this.logMinOrbit = Math.log10(this.minOrbit);
        this.logMaxOrbit = Math.log10(this.maxOrbit);

        // Scale factors for visualization (target sizes in 3D units)
        this.radiusScale = 0.5; // Max planet radius will be 0.5 units
        this.orbitScale = 160.0;  // Max orbit distance in view units - increase to spread planets further apart, decrease to bring them closer
        this.sunScale = 1.0;     // Sun will be 1.0 units
        
        // Store Mercury's orbit for reference (will be set to 6 solar radii)
        this.mercuryOrbitKm = this.planetData.mercury.orbit_km;
        
        // Rocky planets: use true distance scaling
        // Define rocky planets list
        this.rockyPlanets = ['mercury', 'venus', 'earth', 'mars'];
        
        // Calculate scale factor for rocky planets: convert km to visual units
        // Use Mercury as reference: set it to 6 solar radii
        const sunRadius = this.logScaleSunRadius(this.planetData.sun.radius_km);
        const mercuryTargetDistance = 6 * sunRadius;
        const mercuryTrueDistanceKm = this.planetData.mercury.orbit_km;
        // Scale factor: visual units per km
        this.rockyPlanetScaleFactor = mercuryTargetDistance / mercuryTrueDistanceKm;
    }

    logScaleRadius(radiusKm) {
        const logRadius = Math.log10(radiusKm);
        const normalized = (logRadius - this.logMinRadius) / (this.logMaxRadius - this.logMinRadius);
        return normalized * this.radiusScale;
    }

    logScaleOrbit(orbitKm) {
        // Get sun radius (must be calculated first)
        const sunRadius = this.logScaleSunRadius(this.planetData.sun.radius_km);
        
        // Mercury should be at 6 solar radii
        const mercuryBaseRadius = 6 * sunRadius;
        
        // Calculate log-proportional spacing from Mercury
        // Use Mercury as the base (log10(mercuryOrbitKm))
        const logMercuryOrbit = Math.log10(this.mercuryOrbitKm);
        const logCurrentOrbit = Math.log10(orbitKm);
        
        // Calculate the log difference from Mercury
        const logDiff = logCurrentOrbit - logMercuryOrbit;
        
        // Scale the log difference proportionally
        // Find the range: from Mercury to Neptune (or max orbit)
        const logMaxOrbit = Math.log10(this.maxOrbit);
        const logRange = logMaxOrbit - logMercuryOrbit;
        
        // Map the log difference to visual space
        // Mercury (logDiff = 0) -> 2 * sunRadius
        // Neptune (logDiff = logRange) -> some max distance
        // We want to maintain log proportionality
        const maxVisualDistance = this.orbitScale; // Keep max at 10 units
        const normalizedLogDiff = logRange > 0 ? logDiff / logRange : 0;
        
        // Scale from Mercury's base radius
        const orbitRadius = mercuryBaseRadius + (normalizedLogDiff * (maxVisualDistance - mercuryBaseRadius));
        
        return orbitRadius;
    }
    
    /**
     * Scale rocky planet orbit using true distance (linear scaling)
     * @param {number} orbitKm - Orbital distance in km
     * @returns {number} Visual orbit radius in 3D units
     */
    scaleRockyPlanetOrbit(orbitKm) {
        // Use linear scaling based on true distances
        // Scale factor calculated in calculateScalingFactors()
        return orbitKm * this.rockyPlanetScaleFactor;
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
        
        // Core sun sphere
        const sunGeometry = new THREE.SphereGeometry(sunRadius, 64, 64);
        const sunMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            emissive: 0xffffaa,
            emissiveIntensity: 2.0
        });
        this.sun = new THREE.Mesh(sunGeometry, sunMaterial);
        this.scene.add(this.sun);

        // Sun light source (enhanced)
        this.sunLight = new THREE.PointLight(0xffffaa, 3, 1000);
        this.sunLight.position.set(0, 0, 0);
        
        // Configure sun light for shadows
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.1;
        this.sunLight.shadow.camera.far = 1000;
        this.sunLight.shadow.camera.left = -50;
        this.sunLight.shadow.camera.right = 50;
        this.sunLight.shadow.camera.top = 50;
        this.sunLight.shadow.camera.bottom = -50;
        this.sunLight.shadow.bias = -0.0001;
        
        this.scene.add(this.sunLight);

        // Create sun rays using point sprites
        this.createSunRays(sunRadius);
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
            } else if (zone.id === 'oort_cloud') {
                this.createOortCloud(zone);
            } else if (zone.id === 'dyson_sphere') {
                // Dyson sphere zone - no physical body, only zone clouds visualization
                // Skip planet/orbit creation
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
            
            // Perihelion: close to inner planets (Mercury to Mars range)
            const perihelionKm = this.planetData.mercury.orbit_km + Math.random() * (this.planetData.mars.orbit_km - this.planetData.mercury.orbit_km);
            
            // Aphelion: extend deep into Kuiper and Oort belts
            // Randomly choose between Kuiper belt (30-55 AU) and Oort cloud (100-140 AU) ranges
            const aphelionChoice = Math.random();
            let aphelionKm;
            if (aphelionChoice < 0.5) {
                // Kuiper belt range: 30-55 AU (scaled 3x: 90-165 AU)
                aphelionKm = (90 + Math.random() * 75) * this.AU_KM;
            } else {
                // Oort cloud range: 100-140 AU (scaled 3x: 300-420 AU)
                aphelionKm = (300 + Math.random() * 120) * this.AU_KM;
            }
            
            // Calculate semi-major axis from perihelion and aphelion
            const semiMajorAxisKm = (perihelionKm + aphelionKm) / 2;
            
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
            const perihelionVisual = this.logScaleOrbit(perihelionKm);
            const aphelionVisual = this.logScaleOrbit(aphelionKm);
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
            
            // Calculate orbital period using Kepler's law: T^2 ∝ a^3
            // T (days) = sqrt((a/AU)^3) * 365.25
            const semiMajorAxisAU = semiMajorAxisKm / this.AU_KM;
            const orbitalPeriodDays = Math.sqrt(Math.pow(semiMajorAxisAU, 3)) * 365.25;
            
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
                orbitalPeriod: orbitalPeriodDays
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
        const material = new THREE.LineDashedMaterial({
            color: 0x888888,
            dashSize: dashSize,
            gapSize: gapSize,
            opacity: 0.4,
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
            
            // Rocky planets use true distance scaling, others use log scaling
            if (this.rockyPlanets && this.rockyPlanets.includes(zone.id)) {
                orbitRadius = this.scaleRockyPlanetOrbit(planetInfo.orbit_km);
            } else {
                orbitRadius = this.logScaleOrbit(planetInfo.orbit_km);
            }
        } else {
            // Fallback for zones without planet data (use AU-based scaling)
            planetRadius = this.logScaleRadius(6371); // Default to Earth size
            orbitRadius = zone.radius_au * 2.0; // Fallback scaling
        }
        
        // Ensure minimum visible size
        planetRadius = Math.max(0.05, planetRadius);
        
        // Create 3D planet sphere with proper lighting
        const planetGeometry = new THREE.SphereGeometry(planetRadius, 32, 32);
        
        // Use MeshStandardMaterial for realistic lighting with proper color
        const planetMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            metalness: 0.2,
            roughness: 0.8,
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
    }

    createMoons(zone) {
        // Moon data for planets that have significant moons
        // distance: multiplier of planet visual radius for moon orbit distance
        // radius_km: actual moon radius in km (for log-proportional scaling)
        const moonData = {
            earth: [
                { name: 'Moon', distance: 3.0, radius_km: 1737, color: '#C0C0C0', speed: 13 }
            ],
            mars: [
                { name: 'Phobos', distance: 2.5, radius_km: 11, color: '#8B7355', speed: 100 },
                { name: 'Deimos', distance: 4.0, radius_km: 6, color: '#8B7355', speed: 50 }
            ],
            jupiter: [
                // Galilean moons
                { name: 'Io', distance: 2.0, radius_km: 1822, color: '#FFD700', speed: 20 },
                { name: 'Europa', distance: 2.5, radius_km: 1561, color: '#87CEEB', speed: 15 },
                { name: 'Ganymede', distance: 3.2, radius_km: 2634, color: '#708090', speed: 10 },
                { name: 'Callisto', distance: 4.0, radius_km: 2410, color: '#2F4F4F', speed: 7 },
                // Additional moons
                { name: 'Amalthea', distance: 1.6, radius_km: 84, color: '#CD5C5C', speed: 40 },
                { name: 'Himalia', distance: 5.5, radius_km: 85, color: '#A0A0A0', speed: 4 },
                { name: 'Thebe', distance: 1.8, radius_km: 50, color: '#B0B0B0', speed: 35 }
            ],
            saturn: [
                { name: 'Titan', distance: 3.5, radius_km: 2575, color: '#FFA500', speed: 8 },
                { name: 'Rhea', distance: 2.8, radius_km: 764, color: '#D3D3D3', speed: 12 },
                { name: 'Iapetus', distance: 4.5, radius_km: 735, color: '#8B4513', speed: 5 },
                { name: 'Dione', distance: 2.4, radius_km: 561, color: '#E8E8E8', speed: 15 },
                { name: 'Tethys', distance: 2.2, radius_km: 531, color: '#F5F5F5', speed: 18 },
                { name: 'Enceladus', distance: 2.0, radius_km: 252, color: '#F0F8FF', speed: 25 },
                { name: 'Mimas', distance: 1.8, radius_km: 198, color: '#C0C0C0', speed: 30 }
            ],
            uranus: [
                { name: 'Titania', distance: 3.0, radius_km: 789, color: '#B0C4DE', speed: 10 },
                { name: 'Oberon', distance: 4.0, radius_km: 761, color: '#778899', speed: 8 },
                { name: 'Umbriel', distance: 2.5, radius_km: 585, color: '#696969', speed: 12 },
                { name: 'Ariel', distance: 2.2, radius_km: 579, color: '#D3D3D3', speed: 14 },
                { name: 'Miranda', distance: 1.8, radius_km: 236, color: '#A9A9A9', speed: 20 }
            ],
            neptune: [
                { name: 'Triton', distance: 3.0, radius_km: 1353, color: '#E0E0E0', speed: 12 },
                { name: 'Proteus', distance: 2.2, radius_km: 210, color: '#808080', speed: 20 }
            ]
        };

        const planet = this.planets[zone.id];
        if (!planet || !moonData[zone.id]) return;

        const planetInfo = this.planetData[zone.id];
        if (!planetInfo) return;

        const planetRadius = this.logScaleRadius(planetInfo.radius_km);
        
        this.moons[zone.id] = [];

        moonData[zone.id].forEach(moon => {
            // Moon orbit distance is relative to planet's visual radius
            const moonOrbitDistance = planetRadius * moon.distance;
            
            // Log-proportional moon radius based on actual moon size
            // Use the same log scale as planets but with a smaller multiplier
            const moonRadius = Math.max(0.015, this.logScaleRadius(moon.radius_km) * 0.8);
            
            const moonGeometry = new THREE.SphereGeometry(moonRadius, 16, 16);
            const moonMaterial = new THREE.MeshStandardMaterial({
                color: new THREE.Color(moon.color),
                metalness: 0.1,
                roughness: 0.9,
                transparent: true,
                opacity: 1.0
            });
            
            const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
            
            // Enable shadows for moons
            moonMesh.castShadow = true;
            moonMesh.receiveShadow = true;
            
            // Initial position (will be updated in animation loop)
            const initialAngle = Math.random() * Math.PI * 2;
            moonMesh.position.set(
                planet.position.x + Math.cos(initialAngle) * moonOrbitDistance,
                0,
                planet.position.z + Math.sin(initialAngle) * moonOrbitDistance
            );
            
            // Moon orbital speed relative to planet's orbital speed
            const moonOrbitalSpeed = planet.userData.orbitalSpeed * moon.speed;
            
            moonMesh.userData = {
                planetZoneId: zone.id,
                moonOrbitDistance: moonOrbitDistance,
                orbitalAngle: initialAngle,
                orbitalSpeed: moonOrbitalSpeed
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
            neptune: 60182
        };
        return periods[zoneId] || 365;
    }

    createOrbit(zone) {
        const color = zone.color || '#555555';
        
        // Get orbit radius (true distance for rocky planets, log-scaled for others)
        const planetInfo = this.planetData[zone.id];
        let orbitRadius;
        
        if (planetInfo && planetInfo.orbit_km) {
            // Rocky planets use true distance scaling, others use log scaling
            if (this.rockyPlanets && this.rockyPlanets.includes(zone.id)) {
                orbitRadius = this.scaleRockyPlanetOrbit(planetInfo.orbit_km);
            } else {
                orbitRadius = this.logScaleOrbit(planetInfo.orbit_km);
            }
        } else {
            // Fallback: use AU-based scaling converted to log scale
            const orbitKm = zone.radius_au * 149600000; // Convert AU to km
            orbitRadius = this.logScaleOrbit(orbitKm);
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
            color: color,
            opacity: 0.3,
            transparent: true
        });
        
        const orbit = new THREE.Line(geometry, material);
        this.orbits[zone.id] = orbit;
        this.scene.add(orbit);
    }

    createAsteroidBelt(zone) {
        // Asteroid belt is between Mars and Jupiter
        // Mars is a rocky planet, so use true distance scaling
        const marsOrbit = this.scaleRockyPlanetOrbit(this.planetData.mars.orbit_km);
        const jupiterOrbit = this.logScaleOrbit(this.planetData.jupiter.orbit_km);
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
    }

    createKuiperBelt(zone) {
        // Kuiper belt spans from ~30 AU to ~55 AU, centered at 45 AU
        const kuiperOrbitKm = this.planetData.kuiper.orbit_km; // 45 AU
        const orbitRadius = this.logScaleOrbit(kuiperOrbitKm);
        
        // Kuiper belt is a disk - use log-scaled inner/outer edges
        const innerRadius = this.logScaleOrbit(90 * this.AU_KM);  // 90 AU inner edge (3x: 30 -> 90)
        const outerRadius = this.logScaleOrbit(165 * this.AU_KM);  // 165 AU outer edge (3x: 55 -> 165)
        
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
        // Oort cloud centered at 100 AU, diameter of 80 AU (60 AU to 140 AU)
        const oortOrbitKm = this.planetData.oort.orbit_km; // 100 AU
        const orbitRadius = this.logScaleOrbit(oortOrbitKm);
        
        // Oort cloud spans 240 AU diameter - use log-scaled inner/outer edges
        const innerRadius = this.logScaleOrbit(180 * this.AU_KM);   // 180 AU inner edge (3x: 60 -> 180)
        const outerRadius = this.logScaleOrbit(420 * this.AU_KM);  // 420 AU outer edge (3x: 140 -> 420)
        
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

    update(deltaTime) {
        this.time += deltaTime;

        // Update sun rays animation
        if (this.sunRays && this.sunRays.material.uniforms) {
            this.sunRays.material.uniforms.time.value = this.time;
        }

        // Update sun light intensity (subtle pulsing)
        if (this.sunLight) {
            this.sunLight.intensity = 3 + Math.sin(this.time * 0.5) * 0.2;
        }

        // Update planet positions (simple orbital animation)
        Object.values(this.planets).forEach(planet => {
            if (planet.userData) {
                planet.userData.orbitalAngle += planet.userData.orbitalSpeed * deltaTime;
                const radius = planet.userData.radius;
                planet.position.x = Math.cos(planet.userData.orbitalAngle) * radius;
                planet.position.z = Math.sin(planet.userData.orbitalAngle) * radius;
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
                    
                    // Position moon relative to planet's current position
                    const orbitDist = moon.userData.moonOrbitDistance;
                    moon.position.x = planet.position.x + Math.cos(moon.userData.orbitalAngle) * orbitDist;
                    moon.position.z = planet.position.z + Math.sin(moon.userData.orbitalAngle) * orbitDist;
                    moon.position.y = planet.position.y;
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
        
        // Update comet positions
        this.comets.forEach(comet => {
            if (comet.userData) {
                const orbitalData = comet.userData;
                
                // Update mean anomaly based on orbital period
                // Mean motion: n = 2π / T (radians per day)
                // Convert deltaTime (seconds) to days: deltaTime / 86400
                const meanMotion = (2 * Math.PI) / orbitalData.orbitalPeriod;
                const deltaDays = deltaTime / 86400;
                orbitalData.meanAnomaly += meanMotion * deltaDays;
                
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
}

