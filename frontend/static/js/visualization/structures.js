/** Structure visualization - 3D meshes representing structures orbiting planets */
class StructuresVisualization {
    constructor(scene, solarSystem) {
        this.scene = scene;
        this.solarSystem = solarSystem;
        this.structureGroups = {}; // {zoneId: {buildingId: [mesh1, mesh2, ...]}}
        this.orbitalData = null;
        this.time = 0;
        this.buildingsData = null;
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

        // Load buildings data for structure types
        try {
            const response = await fetch('/game_data/buildings.json');
            const data = await response.json();
            this.buildingsData = data.buildings || {};
        } catch (error) {
            console.error('Failed to load buildings data:', error);
            this.buildingsData = {};
        }
    }

    /**
     * Calculate visible count: 100 real structures = 1 visual structure
     * 100 → 1, 200 → 2, 300 → 3, etc.
     */
    calculateVisibleCount(count) {
        if (count <= 0) return 0;
        // Each visual structure represents 100 real structures
        return Math.floor(count / 100);
    }

    /**
     * Create ODC mesh - small satellite with small radiator fins, pointing towards sun
     */
    createODCMesh() {
        const group = new THREE.Group();
        
        // Central body - smaller box
        const bodyGeometry = new THREE.BoxGeometry(0.02, 0.02, 0.02);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0xCCCCCC,
            metalness: 0.7,
            roughness: 0.3
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        group.add(body);

        // Create 4 smaller flat panels (radiator fins) extending outward
        const panelGeometry = new THREE.PlaneGeometry(0.04, 0.08); // Smaller: 0.04 x 0.08 (was 0.1 x 0.2)
        const panelMaterial = new THREE.MeshStandardMaterial({
            color: 0xDDDDDD,
            metalness: 0.5,
            roughness: 0.4,
            side: THREE.DoubleSide
        });

        // Panel positions: front, back, left, right (smaller distances)
        const panelPositions = [
            { x: 0, y: 0, z: 0.06, rotY: 0 },      // Front
            { x: 0, y: 0, z: -0.06, rotY: Math.PI }, // Back
            { x: 0.06, y: 0, z: 0, rotY: Math.PI / 2 }, // Right
            { x: -0.06, y: 0, z: 0, rotY: -Math.PI / 2 } // Left
        ];

        panelPositions.forEach(pos => {
            const panel = new THREE.Mesh(panelGeometry, panelMaterial);
            panel.position.set(pos.x, pos.y, pos.z);
            panel.rotation.y = pos.rotY;
            group.add(panel);
        });

        // Orientation will be set in updateStructurePosition to point 90 degrees from sun direction

        return group;
    }

    /**
     * Create power station mesh - tall rectangular strip that faces the sun
     */
    createPowerStationMesh() {
        const width = 0.15; // Width of the panel
        const height = 0.45; // Height (3X the width)
        const geometry = new THREE.PlaneGeometry(width, height);
        const material = new THREE.MeshStandardMaterial({
            color: 0xCCCCCC,
            metalness: 0.3,
            roughness: 0.7,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        // Will be oriented to face sun in updateStructurePosition
        return mesh;
    }

    // /**
    //  * Create factory mesh - large cyan square
    //  */
    // createFactoryMesh() {
    //     const geometry = new THREE.PlaneGeometry(0.15, 0.15);
    //     const material = new THREE.MeshStandardMaterial({
    //         color: 0x00FFFF,
    //         metalness: 0.3,
    //         roughness: 0.7,
    //         side: THREE.DoubleSide
    //     });
    //     const mesh = new THREE.Mesh(geometry, material);
    //     mesh.rotation.x = -Math.PI / 2;
    //     return mesh;
    // }

    // /**
    //  * Create refinery mesh - large brown square
    //  */
    // createRefineryMesh() {
    //     const geometry = new THREE.PlaneGeometry(0.15, 0.15);
    //     const material = new THREE.MeshStandardMaterial({
    //         color: 0x8B4513,
    //         metalness: 0.3,
    //         roughness: 0.7,
    //         side: THREE.DoubleSide
    //     });
    //     const mesh = new THREE.Mesh(geometry, material);
    //     mesh.rotation.x = -Math.PI / 2;
    //     return mesh;
    // }

    /**
     * Create mass driver mesh - long thin cylinder (tangent to orbital circle)
     */
    createMassDriverMesh() {
        const geometry = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 16); // Longer: 0.8 units
        const material = new THREE.MeshStandardMaterial({
            color: 0x888888,
            metalness: 0.8,
            roughness: 0.2
        });
        const mesh = new THREE.Mesh(geometry, material);
        // Rotate to horizontal
        mesh.rotation.z = Math.PI / 2;
        return mesh;
    }

    /**
     * Create mesh for a building type
     */
    createStructureMesh(buildingId) {
        switch (buildingId) {
            case 'data_center':
                return this.createODCMesh();
            case 'power_station':
                return this.createPowerStationMesh();
            // case 'factory':
            //     return this.createFactoryMesh();
            // case 'refinery':
            //     return this.createRefineryMesh();
            // case 'omni_fab':
            //     return this.createFactoryMesh(); // Use factory mesh for omni_fab
            case 'mass_driver':
                return this.createMassDriverMesh();
            default:
                // Default: small grey box
                const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
                const material = new THREE.MeshStandardMaterial({
                    color: 0x888888,
                    metalness: 0.5,
                    roughness: 0.5
                });
                return new THREE.Mesh(geometry, material);
        }
    }

    /**
     * Calculate orbital speed based on distance from planet
     * Uses simplified Kepler's law: v ∝ 1/√r
     */
    calculateOrbitalSpeed(orbitalRadius) {
        // Base speed for structures at 1 unit distance
        const baseSpeed = 0.5; // radians per second (adjust for visual appeal)
        // Inverse square root relationship
        return baseSpeed / Math.sqrt(orbitalRadius);
    }

    /**
     * Get planet position and radius for a zone
     */
    getPlanetData(zoneId) {
        if (!this.solarSystem || !this.solarSystem.planets) {
            return null;
        }
        const planet = this.solarSystem.planets[zoneId];
        if (!planet) {
            return null;
        }
        // Get planet radius from userData
        const planetRadius = planet.userData?.originalRadius || 0.1;
        return {
            planet: planet,
            planetRadius: planetRadius,
            planetPosition: planet.position.clone()
        };
    }

    /**
     * Update structures based on game state
     */
    updateStructures(gameState, probeAllocations, factoryProduction) {
        if (!gameState || !gameState.structures_by_zone) return;

        const structuresByZone = gameState.structures_by_zone || {};

        // Iterate through all zones
        Object.entries(structuresByZone).forEach(([zoneId, zoneStructures]) => {
            // Initialize zone in structureGroups if needed
            if (!this.structureGroups[zoneId]) {
                this.structureGroups[zoneId] = {};
            }

            const zoneGroup = this.structureGroups[zoneId];

            // Iterate through all building types in this zone
            Object.entries(zoneStructures).forEach(([buildingId, count]) => {
                if (count <= 0) {
                    // Remove all meshes for this building type
                    if (zoneGroup[buildingId]) {
                        zoneGroup[buildingId].forEach(mesh => {
                            this.scene.remove(mesh);
                            // Clean up geometry and materials
                            if (mesh.geometry) mesh.geometry.dispose();
                            if (mesh.material) {
                                if (Array.isArray(mesh.material)) {
                                    mesh.material.forEach(mat => mat.dispose());
                                } else {
                                    mesh.material.dispose();
                                }
                            }
                            // If it's a group, dispose children
                            if (mesh.children) {
                                mesh.children.forEach(child => {
                                    if (child.geometry) child.geometry.dispose();
                                    if (child.material) {
                                        if (Array.isArray(child.material)) {
                                            child.material.forEach(mat => mat.dispose());
                                        } else {
                                            child.material.dispose();
                                        }
                                    }
                                });
                            }
                        });
                        delete zoneGroup[buildingId];
                    }
                    return;
                }

                // Calculate required mesh count
                // Each visual structure represents 100 real structures
                // 100 → 1, 200 → 2, 300 → 3, etc.
                const requiredCount = this.calculateVisibleCount(count);

                // Get or create mesh array for this building type
                if (!zoneGroup[buildingId]) {
                    zoneGroup[buildingId] = [];
                }

                const meshArray = zoneGroup[buildingId];
                const currentCount = meshArray.length;

                // Add or remove meshes to match required count
                if (requiredCount > currentCount) {
                    // Add meshes
                    const planetData = this.getPlanetData(zoneId);
                    if (!planetData) {
                        console.warn(`No planet data for zone ${zoneId}, skipping structures`);
                        return;
                    }

                    for (let i = currentCount; i < requiredCount; i++) {
                        const mesh = this.createStructureMesh(buildingId);
                        
                        // Set up positioning based on structure type
                        if (buildingId === 'mass_driver') {
                            // Mass driver: positioned tangent to orbital circle with slight deviations
                            const planet = planetData.planet;
                            const orbitalRadius = planet.userData?.radius || 2.0;
                            
                            // Distance along tangent from planet (small fraction of orbital radius)
                            const distanceFromPlanet = orbitalRadius * 0.1; // 10% of orbital radius
                            
                            // Deviation angle from perfect tangent (slight variations)
                            const deviationAngle = (Math.random() - 0.5) * 0.2; // ±0.1 radians deviation
                            
                            // Slight elevation variation
                            const elevation = (Math.random() - 0.5) * 0.2;
                            
                            mesh.userData = {
                                zoneId: zoneId,
                                buildingId: buildingId,
                                isMassDriver: true,
                                distanceFromPlanet: distanceFromPlanet,
                                deviationAngle: deviationAngle,
                                elevation: elevation
                            };
                            
                            // Initial position (will be updated in update())
                            this.updateStructurePosition(mesh, planetData);
                        } else if (buildingId === 'power_station') {
                            // Power stations: positioned along planet's orbital path, facing sun
                            // When orbital ring fills up, start new ring at slight inclination
                            const planet = planetData.planet;
                            const orbitalRadius = planet.userData?.radius || 2.0; // Same orbit as planet
                            const planetRadius = planetData.planetRadius; // Visual size of the planet
                            const panelWidth = 0.15; // Width of each panel
                            const spacing = 3 * panelWidth; // Spacing is 3X the width (0.45 units)
                            
                            // Calculate angle spacing: panels are spaced 3X their width along the orbit
                            // angle spacing = spacing / orbitalRadius (in radians)
                            const anglePerPanel = spacing / orbitalRadius;
                            
                            // Offset starting position from planet to avoid overlap
                            // Start building structures 4 planetary radii ahead of the planet
                            // Convert distance to angle: angle = distance / orbitalRadius
                            const startOffsetAngle = (4 * planetRadius) / orbitalRadius;
                            
                            // Calculate how many panels fit in one full ring (2π radians)
                            const panelsPerRing = Math.floor((2 * Math.PI) / anglePerPanel);
                            
                            // Determine which ring this panel is in (0 = first ring, 1 = second ring, etc.)
                            const ringIndex = Math.floor(i / panelsPerRing);
                            
                            // Calculate panel index within this ring
                            const panelIndexInRing = i % panelsPerRing;
                            
                            // Each new ring has a slight inclination (tilt) relative to the first ring
                            const inclinationPerRing = 0.1; // radians of inclination per ring
                            const ringInclination = ringIndex * inclinationPerRing;
                            
                            // Determine which side of the orbit (alternating)
                            // Even indices on one side, odd indices on the other
                            const sideMultiplier = (panelIndexInRing % 2 === 0) ? 1 : -1;
                            const verticalOffset = 0.1 * sideMultiplier; // Small offset above/below orbital plane
                            
                            mesh.userData = {
                                zoneId: zoneId,
                                buildingId: buildingId,
                                isPowerStation: true,
                                orbitalRadius: orbitalRadius,
                                panelIndex: panelIndexInRing,
                                ringIndex: ringIndex,
                                anglePerPanel: anglePerPanel,
                                verticalOffset: verticalOffset,
                                ringInclination: ringInclination,
                                startOffsetAngle: startOffsetAngle
                            };
                            
                            // Initial position (will be updated in update())
                            this.updateStructurePosition(mesh, planetData);
                        } else if (buildingId === 'data_center') {
                            // ODCs: positioned above and below power stations in the same orbital ring
                            // They share the same orbital ring structure as power stations
                            const planet = planetData.planet;
                            const orbitalRadius = planet.userData?.radius || 2.0; // Same orbit as planet
                            const planetRadius = planetData.planetRadius; // Visual size of the planet
                            const panelWidth = 0.15; // Width of each panel (same as power stations)
                            const spacing = 3 * panelWidth; // Spacing is 3X the width (0.45 units)
                            
                            // Calculate angle spacing (same as power stations)
                            const anglePerPanel = spacing / orbitalRadius;
                            
                            // Offset starting position from planet to avoid overlap (same as power stations)
                            // Start building structures 4 planetary radii ahead of the planet
                            const startOffsetAngle = (4 * planetRadius) / orbitalRadius;
                            
                            // Calculate how many panels fit in one full ring
                            const panelsPerRing = Math.floor((2 * Math.PI) / anglePerPanel);
                            
                            // Determine which ring this ODC is in (same ring structure as power stations)
                            const ringIndex = Math.floor(i / panelsPerRing);
                            const panelIndexInRing = i % panelsPerRing;
                            
                            // Each new ring has a slight inclination (same as power stations)
                            const inclinationPerRing = 0.1; // radians of inclination per ring
                            const ringInclination = ringIndex * inclinationPerRing;
                            
                            // ODCs are positioned above and below power stations
                            // Alternate: even indices above, odd indices below
                            const verticalMultiplier = (panelIndexInRing % 2 === 0) ? 1 : -1;
                            const verticalOffset = 0.2 * verticalMultiplier; // Higher/lower than power stations
                            
                            mesh.userData = {
                                zoneId: zoneId,
                                buildingId: buildingId,
                                isMassDriver: false,
                                isPowerStation: false,
                                isODC: true,
                                orbitalRadius: orbitalRadius,
                                panelIndex: panelIndexInRing,
                                ringIndex: ringIndex,
                                anglePerPanel: anglePerPanel,
                                verticalOffset: verticalOffset,
                                ringInclination: ringInclination,
                                startOffsetAngle: startOffsetAngle
                            };
                            
                            // Initial position (will be updated in update())
                            this.updateStructurePosition(mesh, planetData);
                        } else {
                            // Other structures: orbit around planet
                            const planetRadius = planetData.planetRadius;
                            const minOrbitalRadius = planetRadius * 3; // Minimum 3 planetary radii
                            const orbitalRadius = minOrbitalRadius + Math.random() * 0.5; // 3-3.5 planetary radii
                            const orbitalAngle = Math.random() * Math.PI * 2;
                            const inclination = (Math.random() - 0.5) * Math.PI * 0.2; // Slight tilt
                            const orbitalSpeed = this.calculateOrbitalSpeed(orbitalRadius);
                            
                            mesh.userData = {
                                zoneId: zoneId,
                                buildingId: buildingId,
                                isMassDriver: false,
                                isPowerStation: false,
                                isODC: false,
                                orbitalRadius: orbitalRadius,
                                orbitalAngle: orbitalAngle,
                                orbitalSpeed: orbitalSpeed,
                                inclination: inclination
                            };
                            
                            // Initial position (will be updated in update())
                            this.updateStructurePosition(mesh, planetData);
                        }
                        
                        this.scene.add(mesh);
                        meshArray.push(mesh);
                    }
                } else if (requiredCount < currentCount) {
                    // Remove excess meshes
                    const toRemove = meshArray.splice(requiredCount);
                    toRemove.forEach(mesh => {
                        this.scene.remove(mesh);
                        // Clean up geometry and materials
                        if (mesh.geometry) mesh.geometry.dispose();
                        if (mesh.material) {
                            if (Array.isArray(mesh.material)) {
                                mesh.material.forEach(mat => mat.dispose());
                            } else {
                                mesh.material.dispose();
                            }
                        }
                        // If it's a group, dispose children
                        if (mesh.children) {
                            mesh.children.forEach(child => {
                                if (child.geometry) child.geometry.dispose();
                                if (child.material) {
                                    if (Array.isArray(child.material)) {
                                        child.material.forEach(mat => mat.dispose());
                                    } else {
                                        child.material.dispose();
                                    }
                                }
                            });
                        }
                    });
                }
            });

            // Clean up building types that no longer exist
            Object.keys(zoneGroup).forEach(buildingId => {
                if (!zoneStructures[buildingId] || zoneStructures[buildingId] <= 0) {
                    if (zoneGroup[buildingId]) {
                        zoneGroup[buildingId].forEach(mesh => {
                            this.scene.remove(mesh);
                            // Clean up
                            if (mesh.geometry) mesh.geometry.dispose();
                            if (mesh.material) {
                                if (Array.isArray(mesh.material)) {
                                    mesh.material.forEach(mat => mat.dispose());
                                } else {
                                    mesh.material.dispose();
                                }
                            }
                            if (mesh.children) {
                                mesh.children.forEach(child => {
                                    if (child.geometry) child.geometry.dispose();
                                    if (child.material) {
                                        if (Array.isArray(child.material)) {
                                            child.material.forEach(mat => mat.dispose());
                                        } else {
                                            child.material.dispose();
                                        }
                                    }
                                });
                            }
                        });
                        delete zoneGroup[buildingId];
                    }
                }
            });
        });

        // Clean up zones that no longer have structures
        Object.keys(this.structureGroups).forEach(zoneId => {
            if (!structuresByZone[zoneId] || Object.keys(structuresByZone[zoneId]).length === 0) {
                const zoneGroup = this.structureGroups[zoneId];
                Object.values(zoneGroup).forEach(meshArray => {
                    meshArray.forEach(mesh => {
                        this.scene.remove(mesh);
                        // Clean up
                        if (mesh.geometry) mesh.geometry.dispose();
                        if (mesh.material) {
                            if (Array.isArray(mesh.material)) {
                                mesh.material.forEach(mat => mat.dispose());
                            } else {
                                mesh.material.dispose();
                            }
                        }
                        if (mesh.children) {
                            mesh.children.forEach(child => {
                                if (child.geometry) child.geometry.dispose();
                                if (child.material) {
                                    if (Array.isArray(child.material)) {
                                        child.material.forEach(mat => mat.dispose());
                                    } else {
                                        child.material.dispose();
                                    }
                                }
                            });
                        }
                    });
                });
                delete this.structureGroups[zoneId];
            }
        });
    }

    /**
     * Update structure position based on planet position and orbital mechanics
     */
    updateStructurePosition(mesh, planetData) {
        const userData = mesh.userData;
        if (!userData) return;

        if (userData.isMassDriver) {
            // Mass driver: positioned tangent to orbital circle with slight deviations
            const planet = planetData.planet;
            const planetPos = planetData.planetPosition;
            const orbitalRadius = planet.userData?.radius || 2.0;
            const planetOrbitalAngle = planet.userData?.orbitalAngle || 0;
            
            // Calculate tangent direction (perpendicular to radius from sun to planet)
            const radiusDirX = Math.cos(planetOrbitalAngle);
            const radiusDirZ = Math.sin(planetOrbitalAngle);
            const tangentX = -radiusDirZ; // Perpendicular to radius
            const tangentZ = radiusDirX;
            
            // Position along tangent with slight deviation
            const deviationAngle = userData.deviationAngle || 0;
            const deviation = Math.sin(deviationAngle) * 0.1; // Small deviation from tangent
            
            // Calculate position: start from planet, move along tangent
            const distanceFromPlanet = userData.distanceFromPlanet || (orbitalRadius * 0.1);
            const tangentOffsetX = tangentX * distanceFromPlanet;
            const tangentOffsetZ = tangentZ * distanceFromPlanet;
            
            // Add perpendicular deviation
            const perpX = radiusDirX * deviation;
            const perpZ = radiusDirZ * deviation;
            
            mesh.position.copy(planetPos);
            mesh.position.add(new THREE.Vector3(
                tangentOffsetX + perpX,
                userData.elevation || 0,
                tangentOffsetZ + perpZ
            ));
            
            // Orient along tangent direction (with slight deviation)
            const lookDirection = new THREE.Vector3(tangentX, 0, tangentZ).normalize();
            const lookPoint = mesh.position.clone().add(lookDirection);
            mesh.lookAt(lookPoint);
            mesh.rotateX(Math.PI / 2); // Adjust for cylinder orientation
        } else if (userData.isPowerStation) {
            // Power stations: positioned along planet's orbital path, facing sun
            // Multiple rings with slight inclination when ring fills up
            const planet = planetData.planet;
            const orbitalRadius = userData.orbitalRadius;
            const planetOrbitalAngle = planet.userData?.orbitalAngle || 0;
            const ringInclination = userData.ringInclination || 0;
            const startOffsetAngle = userData.startOffsetAngle || 0;
            
            // Calculate angle along orbit starting from planet's current position + offset
            const panelAngle = planetOrbitalAngle + startOffsetAngle + (userData.panelIndex * userData.anglePerPanel);
            
            // Position along orbital ring (same orbit as planet)
            // Apply ring inclination (tilt the ring)
            const baseX = Math.cos(panelAngle) * orbitalRadius;
            const baseZ = Math.sin(panelAngle) * orbitalRadius;
            const baseY = userData.verticalOffset || 0;
            
            // Apply ring inclination rotation around the orbital direction
            // Rotate the position around the tangent to the orbit
            const tangentX = -Math.sin(planetOrbitalAngle);
            const tangentZ = Math.cos(planetOrbitalAngle);
            
            // Rotate base position around tangent axis by ringInclination
            const cosInc = Math.cos(ringInclination);
            const sinInc = Math.sin(ringInclination);
            const x = baseX * cosInc + baseY * sinInc * tangentX;
            const y = baseY * cosInc - baseX * sinInc;
            const z = baseZ * cosInc + baseY * sinInc * tangentZ;
            
            mesh.position.set(x, y, z);
            
            // Face the sun (at origin)
            mesh.lookAt(0, 0, 0);
        } else if (userData.isODC) {
            // ODCs: positioned above and below power stations in the same orbital ring
            // Positioned 0.25 units further out than power stations
            const planet = planetData.planet;
            const orbitalRadius = userData.orbitalRadius;
            const odcRadiusOffset = 0.25; // ODCs are 0.25 units further out
            const effectiveRadius = orbitalRadius + odcRadiusOffset;
            const planetOrbitalAngle = planet.userData?.orbitalAngle || 0;
            const ringInclination = userData.ringInclination || 0;
            const startOffsetAngle = userData.startOffsetAngle || 0;
            
            // Calculate angle along orbit (same as power stations, with offset)
            const panelAngle = planetOrbitalAngle + startOffsetAngle + (userData.panelIndex * userData.anglePerPanel);
            
            // Position along orbital ring (further out than power stations)
            // Apply ring inclination (same as power stations)
            const baseX = Math.cos(panelAngle) * effectiveRadius;
            const baseZ = Math.sin(panelAngle) * effectiveRadius;
            const baseY = userData.verticalOffset || 0; // Higher/lower than power stations
            
            // Apply ring inclination rotation around the orbital direction
            const tangentX = -Math.sin(planetOrbitalAngle);
            const tangentZ = Math.cos(planetOrbitalAngle);
            
            // Rotate base position around tangent axis by ringInclination
            const cosInc = Math.cos(ringInclination);
            const sinInc = Math.sin(ringInclination);
            const x = baseX * cosInc + baseY * sinInc * tangentX;
            const y = baseY * cosInc - baseX * sinInc;
            const z = baseZ * cosInc + baseY * sinInc * tangentZ;
            
            mesh.position.set(x, y, z);
            
            // Point towards the sun (at origin) - rotated 90 degrees
            // Calculate direction to sun
            const directionToSun = new THREE.Vector3(0, 0, 0).sub(mesh.position).normalize();
            // Rotate 90 degrees around the up axis (Y) so it points along the orbit tangent
            const up = new THREE.Vector3(0, 1, 0);
            const tangent = new THREE.Vector3().crossVectors(directionToSun, up).normalize();
            // Point along tangent direction (90 degrees rotated from sun direction)
            const lookPoint = mesh.position.clone().add(tangent);
            mesh.lookAt(lookPoint);
        } else {
            // Orbiting structure: calculate position in orbit around planet
            const orbitalRadius = userData.orbitalRadius;
            const angle = userData.orbitalAngle;
            const inclination = userData.inclination;

            // Calculate position in orbital plane
            const x = Math.cos(angle) * orbitalRadius;
            const z = Math.sin(angle) * orbitalRadius;
            const y = Math.sin(inclination) * orbitalRadius * 0.3; // Vertical offset

            // Position relative to planet
            mesh.position.copy(planetData.planetPosition);
            mesh.position.add(new THREE.Vector3(x, y, z));
        }
    }

    /**
     * Update animation
     */
    update(deltaTime) {
        this.time += deltaTime;

        // Update all structure positions
        Object.values(this.structureGroups).forEach(zoneGroup => {
            Object.values(zoneGroup).forEach(meshArray => {
                meshArray.forEach(mesh => {
                    const userData = mesh.userData;
                    if (!userData) return;

                    const planetData = this.getPlanetData(userData.zoneId);
                    if (!planetData) return;

                    // Power stations and ODCs follow planet's orbit (no angle update needed)
                    // Mass drivers are static relative to planet (no angle update needed)
                    if (!userData.isMassDriver && !userData.isPowerStation && !userData.isODC) {
                        // Update orbital angle for structures orbiting around planet
                        userData.orbitalAngle += userData.orbitalSpeed * deltaTime;
                        // Keep angle in [0, 2π] range
                        if (userData.orbitalAngle > Math.PI * 2) {
                            userData.orbitalAngle -= Math.PI * 2;
                        }
                    }
                    // Power stations, ODCs, and mass drivers don't need orbital angle update

                    // Update position relative to planet
                    this.updateStructurePosition(mesh, planetData);
                });
            });
        });
    }

    /**
     * Clean up and destroy
     */
    destroy() {
        // Remove all structures
        Object.values(this.structureGroups).forEach(zoneGroup => {
            Object.values(zoneGroup).forEach(meshArray => {
                meshArray.forEach(mesh => {
                    this.scene.remove(mesh);
                    // Clean up geometry and materials
                    if (mesh.geometry) mesh.geometry.dispose();
                    if (mesh.material) {
                        if (Array.isArray(mesh.material)) {
                            mesh.material.forEach(mat => mat.dispose());
                        } else {
                            mesh.material.dispose();
                        }
                    }
                    if (mesh.children) {
                        mesh.children.forEach(child => {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(mat => mat.dispose());
                                } else {
                                    child.material.dispose();
                                }
                            }
                        });
                    }
                });
            });
        });
        this.structureGroups = {};
    }
}
