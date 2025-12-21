/** Structure visualization - grey dots representing probes, factories, and structures */
class StructuresVisualization {
    constructor(scene) {
        this.scene = scene;
        this.structurePoints = null;
        this.activeStructures = null; // For twinkling effect
        this.geometry = null;
        this.material = null;
        this.time = 0;
        this.orbitalData = null;
        this.init();
    }

    async init() {
        // Load orbital data for zone positions
        try {
            const response = await fetch('/game_data/orbital_mechanics.json');
            this.orbitalData = await response.json();
        } catch (error) {
            console.error('Failed to load orbital data:', error);
            this.orbitalData = { orbital_zones: [] };
        }

        // Create geometry and material for structure points
        this.geometry = new THREE.BufferGeometry();
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 }
            },
            vertexShader: `
                attribute float size;
                attribute float isActive;
                attribute vec3 color;
                varying float vIsActive;
                varying vec3 vColor;
                
                void main() {
                    vIsActive = isActive;
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform float time;
                varying float vIsActive;
                varying vec3 vColor;
                
                void main() {
                    float dist = length(gl_PointCoord - vec2(0.5));
                    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
                    
                    vec3 finalColor = vColor;
                    
                    // Twinkling effect for active structures (welding)
                    if (vIsActive > 0.5) {
                        float twinkle = sin(time * 5.0 + gl_FragCoord.x * 0.1) * 0.5 + 0.5;
                        finalColor = mix(vColor, vec3(1.0, 1.0, 1.0), twinkle * 0.8);
                        alpha *= 0.8 + twinkle * 0.2;
                    }
                    
                    gl_FragColor = vec4(finalColor, alpha);
                }
            `,
            transparent: true,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.structurePoints = new THREE.Points(this.geometry, this.material);
        this.scene.add(this.structurePoints);

        // Initialize with dummy vertex to avoid WebGL errors
        // We'll update with real data or hide when empty
        const dummyPositions = new Float32Array([0, 0, 0]);
        const dummyColors = new Float32Array([0.5, 0.5, 0.5]);
        const dummySizes = new Float32Array([0.03]);
        const dummyIsActive = new Float32Array([0]);
        this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(dummyPositions, 3));
        this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(dummyColors, 3));
        this.geometry.setAttribute('size', new THREE.Float32BufferAttribute(dummySizes, 1));
        this.geometry.setAttribute('isActive', new THREE.Float32BufferAttribute(dummyIsActive, 1));
        this.geometry.setDrawRange(0, 0); // Don't draw initially
        this.structurePoints.visible = false; // Hide until we have data
        
        // Initialize with empty arrays
        this.updateStructures({}, {}, {});
    }

    getZonePosition(zoneId) {
        if (!this.orbitalData || !this.orbitalData.orbital_zones) {
            return { x: 0, z: 0, radius: 2.0 };
        }

        const zone = this.orbitalData.orbital_zones.find(z => z.id === zoneId);
        if (!zone) {
            return { x: 0, z: 0, radius: 2.0 };
        }

        // Use same log scaling as solar system (Mercury at 2 solar radii)
        const planetData = {
            sun: { radius_km: 696000 },
            mercury: { orbit_km: 57900000 },
            venus: { orbit_km: 108200000 },
            earth: { orbit_km: 149600000 },
            mars: { orbit_km: 227900000 },
            jupiter: { orbit_km: 778500000 },
            saturn: { orbit_km: 1430000000 },
            uranus: { orbit_km: 2870000000 },
            neptune: { orbit_km: 4500000000 }
        };

        // Calculate sun radius (same as solar system)
        const sunRadiusKm = planetData.sun.radius_km;
        const minRadius = 2440; // Mercury radius
        const maxRadius = 69911; // Jupiter radius
        const logMinRadius = Math.log10(minRadius);
        const logMaxRadius = Math.log10(maxRadius);
        const sunScale = 1.0;
        const logSunRadius = Math.log10(sunRadiusKm);
        const normalizedSun = (logSunRadius - logMinRadius) / (logMaxRadius - logMinRadius);
        const sunRadius = normalizedSun * sunScale;

        const planetInfo = planetData[zoneId];
        let radius;
        
        if (planetInfo && planetInfo.orbit_km) {
            // Mercury should be at 2 solar radii
            const mercuryBaseRadius = 2 * sunRadius;
            const mercuryOrbitKm = planetData.mercury.orbit_km;
            const logMercuryOrbit = Math.log10(mercuryOrbitKm);
            const logCurrentOrbit = Math.log10(planetInfo.orbit_km);
            const logDiff = logCurrentOrbit - logMercuryOrbit;
            
            // Calculate the log range from Mercury to Neptune
            const maxOrbit = 4500000000;
            const logMaxOrbit = Math.log10(maxOrbit);
            const logRange = logMaxOrbit - logMercuryOrbit;
            
            // Map the log difference to visual space
            const maxVisualDistance = 10.0; // Max orbit scale
            const normalizedLogDiff = logRange > 0 ? logDiff / logRange : 0;
            radius = mercuryBaseRadius + (normalizedLogDiff * (maxVisualDistance - mercuryBaseRadius));
        } else {
            // Fallback: use AU-based scaling converted to log scale
            const orbitKm = zone.radius_au * 149600000;
            const mercuryBaseRadius = 2 * sunRadius;
            const mercuryOrbitKm = planetData.mercury.orbit_km;
            const logMercuryOrbit = Math.log10(mercuryOrbitKm);
            const logCurrentOrbit = Math.log10(orbitKm);
            const logDiff = logCurrentOrbit - logMercuryOrbit;
            
            const maxOrbit = 4500000000;
            const logMaxOrbit = Math.log10(maxOrbit);
            const logRange = logMaxOrbit - logMercuryOrbit;
            const maxVisualDistance = 10.0;
            const normalizedLogDiff = logRange > 0 ? logDiff / logRange : 0;
            radius = mercuryBaseRadius + (normalizedLogDiff * (maxVisualDistance - mercuryBaseRadius));
        }
        
        // Distribute structures around the orbit (random angle per structure)
        return { x: 0, z: 0, radius: radius };
    }

    updateStructures(gameState, probeAllocations, factoryProduction) {
        if (!this.geometry || !gameState) return;

        const structures = gameState.structures || {};
        const probes = gameState.probes || {};
        const positions = [];
        const colors = [];
        const sizes = [];
        const isActive = [];
        const activeStructures = new Set();

        // Track which structures are actively building
        const activeBuildingProbes = (probeAllocations?.construct || {}) || {};
        const activeDysonProbes = (probeAllocations?.dyson || {}) || {};
        const totalActiveBuilding = Object.values(activeBuildingProbes).reduce((a, b) => a + b, 0);
        const totalActiveDyson = Object.values(activeDysonProbes).reduce((a, b) => a + b, 0);

        // Add probe structures
        Object.entries(probes).forEach(([probeType, count]) => {
            if (count > 0) {
                // Distribute probes across zones (for now, use earth zone)
                const zonePos = this.getZonePosition('earth');
                const probeCount = Math.floor(count);
                
                for (let i = 0; i < probeCount; i++) {
                    // Random angle around orbit
                    const angle = (i / probeCount) * Math.PI * 2 + Math.random() * 0.1;
                    const offsetRadius = zonePos.radius + (Math.random() - 0.5) * 0.2;
                    
                    positions.push(
                        Math.cos(angle) * offsetRadius,
                        (Math.random() - 0.5) * 0.1, // Slight vertical spread
                        Math.sin(angle) * offsetRadius
                    );

                    // Check if this probe is active
                    const isProbeActive = (
                        (probeType === 'probe' && (activeBuildingProbes.probe > 0 || activeDysonProbes.probe > 0)) ||
                        (probeType === 'construction_probe' && (activeBuildingProbes.construction_probe > 0 || activeDysonProbes.construction_probe > 0))
                    );
                    
                    colors.push(0.5, 0.5, 0.5); // Grey
                    sizes.push(0.03);
                    isActive.push(isProbeActive ? 1.0 : 0.0);
                    
                    if (isProbeActive) {
                        activeStructures.add(`probe-${probeType}-${i}`);
                    }
                }
            }
        });

        // Add building structures - all at 0.5 AU in random orbital planes
        // Structures format is now {building_id: count} (no longer zone-specific)
        const buildingOrbitRadius = 1.0; // 0.5 AU scaled (using same scaling as solar system)
        Object.entries(structures).forEach(([buildingId, count]) => {
            if (count > 0) {
                const buildingCount = Math.floor(count);
                
                for (let i = 0; i < buildingCount; i++) {
                    // Random orbital plane (random angle around sun)
                    const angle = Math.random() * Math.PI * 2;
                    const inclination = (Math.random() - 0.5) * Math.PI * 0.3; // Random tilt
                    const radius = buildingOrbitRadius + (Math.random() - 0.5) * 0.1;
                    
                    // Position in random orbital plane
                    positions.push(
                        Math.cos(angle) * radius,
                        Math.sin(inclination) * radius * 0.5, // Vertical spread
                        Math.sin(angle) * radius
                    );

                    // Check if factory is active (production > 0)
                    const factoryProd = factoryProduction?.[buildingId] || 0;
                    const isFactoryActive = factoryProd > 0;
                    
                    colors.push(0.5, 0.5, 0.5); // Grey for all buildings
                    sizes.push(0.04);
                    isActive.push(isFactoryActive ? 1.0 : 0.0);
                    
                    if (isFactoryActive) {
                        activeStructures.add(`building-${buildingId}-${i}`);
                    }
                }
            }
        });

        this.activeStructures = activeStructures;

        // Update geometry - convert arrays to TypedArrays
        if (positions.length > 0) {
            this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
            this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(colors), 3));
            this.geometry.setAttribute('size', new THREE.Float32BufferAttribute(new Float32Array(sizes), 1));
            this.geometry.setAttribute('isActive', new THREE.Float32BufferAttribute(new Float32Array(isActive), 1));
            this.geometry.setDrawRange(0, positions.length / 3);
            this.structurePoints.visible = true;
        } else {
            // Empty geometry - keep dummy vertex but don't draw
            // This prevents WebGL shader errors from empty geometry
            this.geometry.setDrawRange(0, 0);
            this.structurePoints.visible = false;
        }
    }

    update(deltaTime) {
        this.time += deltaTime;
        if (this.material && this.material.uniforms) {
            this.material.uniforms.time.value = this.time;
        }
    }

    destroy() {
        if (this.structurePoints) {
            this.scene.remove(this.structurePoints);
            this.geometry.dispose();
            this.material.dispose();
        }
    }
}

