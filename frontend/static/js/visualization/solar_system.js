/** Solar system visualization - planets, orbits, asteroid belt */
class SolarSystem {
    constructor(scene) {
        this.scene = scene;
        this.planets = {};
        this.orbits = {};
        this.moons = {}; // Store moons by planet zone ID
        this.asteroidBelt = null;
        this.oortCloud = null;
        this.orbitalData = null;
        this.sun = null;
        this.sunLight = null;
        this.sunRays = null;
        this.time = 0;

        // Real-world planet data (radii in km, orbital distances in km)
        this.planetData = {
            sun: { radius_km: 696000 },
            mercury: { radius_km: 2440, orbit_km: 57900000 },
            venus: { radius_km: 6052, orbit_km: 108200000 },
            earth: { radius_km: 6371, orbit_km: 149600000 },
            mars: { radius_km: 3390, orbit_km: 227900000 },
            jupiter: { radius_km: 69911, orbit_km: 778500000 },
            saturn: { radius_km: 58232, orbit_km: 1430000000 },
            uranus: { radius_km: 25362, orbit_km: 2870000000 },
            neptune: { radius_km: 24622, orbit_km: 4500000000 }
        };

        // Load orbital data (will calculate scaling and create sun)
        this.loadOrbitalData();
    }

    calculateScalingFactors() {
        // Find min/max for log scaling
        const radii = Object.values(this.planetData).map(p => p.radius_km);
        const orbits = Object.values(this.planetData)
            .filter(p => p.orbit_km)
            .map(p => p.orbit_km);

        this.minRadius = Math.min(...radii);
        this.maxRadius = Math.max(...radii);
        this.minOrbit = Math.min(...orbits);
        this.maxOrbit = Math.max(...orbits);

        // Log ranges for scaling
        this.logMinRadius = Math.log10(this.minRadius);
        this.logMaxRadius = Math.log10(this.maxRadius);
        this.logMinOrbit = Math.log10(this.minOrbit);
        this.logMaxOrbit = Math.log10(this.maxOrbit);

        // Scale factors for visualization (target sizes in 3D units)
        this.radiusScale = 0.5; // Max planet radius will be 0.5 units
        this.orbitScale = 10.0;  // Max orbit will be 10 units
        this.sunScale = 1.0;     // Sun will be 1.0 units
        
        // Store Mercury's orbit for reference (will be set to 2 solar radii)
        this.mercuryOrbitKm = this.planetData.mercury.orbit_km;
    }

    logScaleRadius(radiusKm) {
        const logRadius = Math.log10(radiusKm);
        const normalized = (logRadius - this.logMinRadius) / (this.logMaxRadius - this.logMinRadius);
        return normalized * this.radiusScale;
    }

    logScaleOrbit(orbitKm) {
        // Get sun radius (must be calculated first)
        const sunRadius = this.logScaleSunRadius(this.planetData.sun.radius_km);
        
        // Mercury should be at 2 solar radii
        const mercuryBaseRadius = 2 * sunRadius;
        
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

        // Glow effect - larger transparent sphere (1.2x radius)
        const glowGeometry = new THREE.SphereGeometry(sunRadius * 1.2, 32, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff88,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.scene.add(glow);

        // Sun light source (enhanced)
        this.sunLight = new THREE.PointLight(0xffffaa, 3, 1000);
        this.sunLight.position.set(0, 0, 0);
        this.scene.add(this.sunLight);

        // Create sun rays using point sprites
        this.createSunRays(sunRadius);
    }

    createSunRays(sunRadius = 1.0) {
        const rayCount = 24;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(rayCount * 3);
        const sizes = new Float32Array(rayCount);
        const opacities = new Float32Array(rayCount);

        for (let i = 0; i < rayCount; i++) {
            const angle = (i / rayCount) * Math.PI * 2;
            const distance = sunRadius * 1.5 + Math.random() * sunRadius * 0.5;
            
            positions[i * 3] = Math.cos(angle) * distance;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
            positions[i * 3 + 2] = Math.sin(angle) * distance;
            
            sizes[i] = 0.05 + Math.random() * 0.05;
            opacities[i] = 0.6 + Math.random() * 0.4;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));

        const material = new THREE.ShaderMaterial({
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

        this.sunRays = new THREE.Points(geometry, material);
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
            
            // Initialize planets and orbits
            this.init();
        } catch (error) {
            console.error('Failed to load orbital data:', error);
            // Use default data if file not available
            this.orbitalData = {
                orbital_zones: [
                    { id: 'mercury', name: 'Mercury', radius_au: 0.39, color: '#8C7853' },
                    { id: 'venus', name: 'Venus', radius_au: 0.72, color: '#FFC649' },
                    { id: 'earth', name: 'Earth', radius_au: 1.0, color: '#6B93D6' },
                    { id: 'mars', name: 'Mars', radius_au: 1.52, color: '#CD5C5C' },
                    { id: 'asteroid_belt', name: 'Asteroid Belt', radius_au: 2.5, color: '#9E9E9E' },
                    { id: 'jupiter', name: 'Jupiter', radius_au: 5.2, color: '#D8CA9D' },
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
            
            // Initialize
            this.init();
        }
    }

    init() {
        if (!this.orbitalData) return;

        const zones = this.orbitalData.orbital_zones || [];

        zones.forEach(zone => {
            if (zone.id === 'asteroid_belt') {
                this.createAsteroidBelt(zone);
            } else if (zone.id === 'oort_cloud') {
                this.createOortCloud(zone);
            } else {
                this.createPlanet(zone);
                this.createOrbit(zone);
                // Add moons for planets that have them
                this.createMoons(zone);
            }
        });
        
        // Also create Oort cloud at 2x Neptune distance if not in zones
        if (!zones.find(z => z.id === 'oort_cloud')) {
            const neptuneZone = zones.find(z => z.id === 'neptune');
            if (neptuneZone) {
                // Create Oort cloud at twice Neptune's distance
                const oortZone = {
                    id: 'oort_cloud',
                    name: 'Oort Cloud',
                    radius_au: neptuneZone.radius_au * 2, // Twice Neptune's orbit
                    color: '#1A1A2E'
                };
                this.createOortCloud(oortZone);
            }
        }
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
            orbitRadius = this.logScaleOrbit(planetInfo.orbit_km);
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
            emissive: 0x000000
        });
        
        const planet = new THREE.Mesh(planetGeometry, planetMaterial);
        
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
            originalColor: color
        };

        this.planets[zone.id] = planet;
        this.scene.add(planet);
    }

    createMoons(zone) {
        // Moon data for planets that have significant moons
        const moonData = {
            earth: [{ name: 'Moon', distance: 0.00257, radius: 0.27, color: '#C0C0C0' }], // AU, relative to Earth radius, gray
            mars: [
                { name: 'Phobos', distance: 0.00006, radius: 0.01, color: '#8B7355' },
                { name: 'Deimos', distance: 0.00015, radius: 0.006, color: '#8B7355' }
            ],
            jupiter: [
                { name: 'Io', distance: 0.00282, radius: 0.29, color: '#FFD700' },
                { name: 'Europa', distance: 0.00448, radius: 0.25, color: '#87CEEB' },
                { name: 'Ganymede', distance: 0.00716, radius: 0.41, color: '#708090' },
                { name: 'Callisto', distance: 0.01259, radius: 0.38, color: '#2F4F4F' }
            ],
            saturn: [
                { name: 'Titan', distance: 0.00817, radius: 0.40, color: '#FFA500' },
                { name: 'Enceladus', distance: 0.00194, radius: 0.06, color: '#F0F8FF' }
            ],
            uranus: [
                { name: 'Titania', distance: 0.00359, radius: 0.12, color: '#B0C4DE' },
                { name: 'Oberon', distance: 0.00484, radius: 0.11, color: '#778899' }
            ],
            neptune: [
                { name: 'Triton', distance: 0.00237, radius: 0.21, color: '#E0E0E0' }
            ]
        };

        const planet = this.planets[zone.id];
        if (!planet || !moonData[zone.id]) return;

        const planetInfo = this.planetData[zone.id];
        if (!planetInfo) return;

        const planetRadius = this.logScaleRadius(planetInfo.radius_km);
        const orbitRadius = planet.userData.radius;
        
        this.moons[zone.id] = [];

        moonData[zone.id].forEach(moon => {
            // Convert moon distance from AU to scaled units
            const moonOrbitRadius = orbitRadius + (moon.distance * 149600000 * this.logScaleOrbit(1) / 10); // Scale appropriately
            const moonRadius = Math.max(0.01, planetRadius * moon.radius);
            
            const moonGeometry = new THREE.SphereGeometry(moonRadius, 16, 16);
            const moonMaterial = new THREE.MeshStandardMaterial({
                color: new THREE.Color(moon.color),
                metalness: 0.1,
                roughness: 0.9
            });
            
            const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
            
            // Position moon relative to planet
            moonMesh.position.set(moonOrbitRadius, 0, 0);
            
            // Moon orbital speed (faster than planet)
            const moonOrbitalSpeed = planet.userData.orbitalSpeed * (1 + Math.random() * 0.5 + 0.5);
            
            moonMesh.userData = {
                planetZoneId: zone.id,
                orbitRadius: moonOrbitRadius,
                orbitalAngle: Math.random() * Math.PI * 2,
                orbitalSpeed: moonOrbitalSpeed,
                planetOrbitRadius: orbitRadius
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
        
        // Get log-scaled orbit radius
        const planetInfo = this.planetData[zone.id];
        let orbitRadius;
        
        if (planetInfo && planetInfo.orbit_km) {
            orbitRadius = this.logScaleOrbit(planetInfo.orbit_km);
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
        const marsOrbit = this.logScaleOrbit(this.planetData.mars.orbit_km);
        const jupiterOrbit = this.logScaleOrbit(this.planetData.jupiter.orbit_km);
        const innerRadius = marsOrbit * 1.1;
        const outerRadius = jupiterOrbit * 0.9;
        const color = zone.color || '#666666';
        
        // Create particle system for asteroid belt - increased count
        const particleCount = 2000; // Increased from 500
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
            positions: positions
        };
        this.scene.add(this.asteroidBelt);
    }

    createOortCloud(zone) {
        // Oort cloud is at twice Neptune's orbit distance (or specified distance)
        const neptuneOrbit = this.logScaleOrbit(this.planetData.neptune.orbit_km);
        const oortRadiusAU = zone.radius_au || (this.planetData.neptune.orbit_km / 149600000 * 2); // 2x Neptune if not specified
        const oortOrbitKm = oortRadiusAU * 149600000;
        const orbitRadius = this.logScaleOrbit(oortOrbitKm);
        
        // Oort cloud is much more spread out and sparse than asteroid belt
        const innerRadius = orbitRadius * 0.8;
        const outerRadius = orbitRadius * 1.2;
        const color = zone.color || '#1A1A2E';
        
        // Create particle system for Oort cloud - more particles but sparser
        const particleCount = 3000; // More particles for larger volume
        const particles = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        
        const colorObj = new THREE.Color(color);
        
        for (let i = 0; i < particleCount; i++) {
            // Random spherical distribution (not just in a plane)
            const theta = Math.random() * Math.PI * 2; // Azimuth
            const phi = Math.acos(2 * Math.random() - 1); // Polar angle (spherical distribution)
            const distance = innerRadius + Math.random() * (outerRadius - innerRadius);
            
            // Convert spherical to cartesian
            positions[i * 3] = distance * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = distance * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = distance * Math.cos(phi);
            
            // Darker colors for Oort cloud
            const colorVariation = 0.15;
            colors[i * 3] = Math.max(0, Math.min(1, colorObj.r + (Math.random() - 0.5) * colorVariation));
            colors[i * 3 + 1] = Math.max(0, Math.min(1, colorObj.g + (Math.random() - 0.5) * colorVariation));
            colors[i * 3 + 2] = Math.max(0, Math.min(1, colorObj.b + (Math.random() - 0.5) * colorVariation));
            
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
            opacity: 0.4 // Dimmer than asteroid belt
        });
        
        this.oortCloud = new THREE.Points(particles, particleMaterial);
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

        // Update moon positions
        Object.entries(this.moons).forEach(([zoneId, moonList]) => {
            const planet = this.planets[zoneId];
            if (!planet) return;
            
            moonList.forEach(moon => {
                if (moon.userData) {
                    moon.userData.orbitalAngle += moon.userData.orbitalSpeed * deltaTime;
                    
                    // Moon orbits around planet, which orbits around sun
                    const planetX = planet.position.x;
                    const planetZ = planet.position.z;
                    const moonOrbitRadius = moon.userData.orbitRadius - moon.userData.planetOrbitRadius;
                    
                    moon.position.x = planetX + Math.cos(moon.userData.orbitalAngle) * moonOrbitRadius;
                    moon.position.z = planetZ + Math.sin(moon.userData.orbitalAngle) * moonOrbitRadius;
                    moon.position.y = planet.position.y + (Math.random() - 0.5) * 0.1; // Slight vertical offset
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
    }

    updateZoneDepletion(gameState) {
        if (!gameState || !gameState.zone_depleted) return;

        // Update visual appearance of depleted zones
        Object.entries(gameState.zone_depleted).forEach(([zoneId, isDepleted]) => {
            const planet = this.planets[zoneId];
            const orbit = this.orbits[zoneId];

            if (isDepleted) {
                // Gray out depleted zones
                if (planet && planet.material) {
                    planet.material.color.setHex(0x333333);
                    planet.material.emissive.setHex(0x000000);
                }
                if (orbit && orbit.material) {
                    orbit.material.opacity = 0.1;
                    orbit.material.color.setHex(0x333333);
                }
            } else {
                // Restore normal appearance
                if (planet && planet.material && this.orbitalData) {
                    const zone = this.orbitalData.orbital_zones.find(z => z.id === zoneId);
                    if (zone && planet.userData) {
                        planet.material.color.setStyle(zone.color || '#888888');
                        planet.material.emissive.setHex(0x000000);
                    }
                }
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
}

