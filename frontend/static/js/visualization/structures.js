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
     * Calculate visible count: 10 real structures = 1 visual structure
     * 1-10 → 1, 11-20 → 2, 21-30 → 3, etc.
     */
    calculateVisibleCount(count) {
        if (count <= 0) return 0;
        // Each visual structure represents up to 10 real structures
        // Always show at least 1 visual if any structures exist
        return Math.ceil(count / 10);
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
     * Create Electromagnetic Gas Miner mesh - lines extending into gas giant like hair
     * Group of thin lines radiating downward toward planet center
     */
    createEMGasMinerMesh(planetRadius) {
        const group = new THREE.Group();
        
        // Central hub - small metallic sphere
        const hubGeometry = new THREE.SphereGeometry(0.03, 12, 12);
        const hubMaterial = new THREE.MeshStandardMaterial({
            color: 0x4488FF,
            metalness: 0.9,
            roughness: 0.1,
            emissive: 0x2244AA,
            emissiveIntensity: 0.3
        });
        const hub = new THREE.Mesh(hubGeometry, hubMaterial);
        group.add(hub);
        
        // Create "hair" lines extending toward planet
        // These are thin cylinders radiating downward
        const numLines = 12;
        const lineLength = Math.max(0.3, planetRadius * 0.8); // Scale with planet size
        const lineRadius = 0.005;
        
        const lineMaterial = new THREE.MeshStandardMaterial({
            color: 0x66AAFF,
            metalness: 0.7,
            roughness: 0.3,
            emissive: 0x3366CC,
            emissiveIntensity: 0.4
        });
        
        for (let i = 0; i < numLines; i++) {
            // Random angle spread for hair-like effect
            const spreadAngle = (Math.random() - 0.5) * 0.6; // ±0.3 radians spread
            const rotationAngle = (i / numLines) * Math.PI * 2; // Around the hub
            
            const lineGeometry = new THREE.CylinderGeometry(lineRadius, lineRadius * 0.3, lineLength, 6);
            const line = new THREE.Mesh(lineGeometry, lineMaterial);
            
            // Position at bottom of hub and angle slightly outward
            line.position.y = -lineLength / 2;
            
            // Create a pivot group for each line
            const pivot = new THREE.Group();
            pivot.add(line);
            pivot.rotation.x = spreadAngle;
            pivot.rotation.z = Math.sin(rotationAngle) * spreadAngle * 0.5;
            pivot.rotation.y = rotationAngle;
            
            group.add(pivot);
        }
        
        // Mark this as an EM gas miner for animation
        group.userData.isEMGasMiner = true;
        
        return group;
    }

    /**
     * Create Space Elevator mesh - lines extending into rocky planet like tethers
     * Single main tether with supporting cables
     */
    createSpaceElevatorMesh(planetRadius) {
        const group = new THREE.Group();
        
        // Orbital station - larger metallic platform
        const stationGeometry = new THREE.BoxGeometry(0.08, 0.02, 0.08);
        const stationMaterial = new THREE.MeshStandardMaterial({
            color: 0xCCCCCC,
            metalness: 0.8,
            roughness: 0.2
        });
        const station = new THREE.Mesh(stationGeometry, stationMaterial);
        group.add(station);
        
        // Main tether - thick line extending to planet
        const tetherLength = Math.max(0.5, planetRadius * 1.2);
        const mainTetherRadius = 0.01;
        
        const tetherMaterial = new THREE.MeshStandardMaterial({
            color: 0x888888,
            metalness: 0.6,
            roughness: 0.4
        });
        
        const mainTetherGeometry = new THREE.CylinderGeometry(mainTetherRadius, mainTetherRadius * 0.5, tetherLength, 8);
        const mainTether = new THREE.Mesh(mainTetherGeometry, tetherMaterial);
        mainTether.position.y = -tetherLength / 2;
        group.add(mainTether);
        
        // Supporting cables - thinner lines
        const numCables = 6;
        const cableRadius = 0.003;
        
        const cableMaterial = new THREE.MeshStandardMaterial({
            color: 0x666666,
            metalness: 0.5,
            roughness: 0.5
        });
        
        for (let i = 0; i < numCables; i++) {
            const angle = (i / numCables) * Math.PI * 2;
            const spreadAngle = 0.15; // Slight spread outward
            
            const cableGeometry = new THREE.CylinderGeometry(cableRadius, cableRadius * 0.3, tetherLength * 0.9, 4);
            const cable = new THREE.Mesh(cableGeometry, cableMaterial);
            
            // Position cables around main tether
            const offsetX = Math.cos(angle) * 0.03;
            const offsetZ = Math.sin(angle) * 0.03;
            
            cable.position.set(offsetX, -tetherLength * 0.45, offsetZ);
            
            // Slight angle outward
            cable.rotation.x = Math.cos(angle) * spreadAngle;
            cable.rotation.z = -Math.sin(angle) * spreadAngle;
            
            group.add(cable);
        }
        
        // Mark this as a space elevator for positioning
        group.userData.isSpaceElevator = true;
        
        return group;
    }

    /**
     * Create mesh for a building type
     * @param {string} buildingId - The building type ID
     * @param {number} planetRadius - Optional planet radius for scaled structures
     */
    createStructureMesh(buildingId, planetRadius = 0.1) {
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
            case 'em_gas_miner':
                return this.createEMGasMinerMesh(planetRadius);
            case 'space_elevator':
                return this.createSpaceElevatorMesh(planetRadius);
            // Structures without visuals return null
            case 'robotic_asteroid_factory':
            case 'deep_space_fusion_plant':
            case 'methalox_refinery':
                return null;
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
                // Each visual structure represents up to 10 real structures
                // 1-10 → 1, 11-20 → 2, 21-30 → 3, etc.
                // Exception: mass drivers only ever show 1 visual
                const requiredCount = buildingId === 'mass_driver' ? 
                    (count > 0 ? 1 : 0) : 
                    this.calculateVisibleCount(count);

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
                        const mesh = this.createStructureMesh(buildingId, planetData.planetRadius);
                        
                        // Skip if mesh is null (structures with no visual)
                        if (!mesh) {
                            continue;
                        }
                        
                        // Set up positioning based on structure type
                        if (buildingId === 'mass_driver') {
                            // Mass driver: positioned sunwards from the planet (between planet and sun)
                            const planet = planetData.planet;
                            const orbitalRadius = planet.userData?.radius || 2.0; // Planet's orbital radius
                            const planetRadius = planetData.planetRadius; // Visual size of the planet
                            
                            // Mass drivers are positioned sunwards from the planet
                            // About 3 planet radii towards the sun
                            const sunwardOffset = 3 * planetRadius;
                            
                            // Each additional mass driver is placed further sunward
                            const massDriverLength = 0.8; // Length of the cylinder
                            const spacing = massDriverLength * 0.5; // Space between mass drivers (radially)
                            
                            // Slight elevation variation for multiple mass drivers
                            const elevation = (i % 2 === 0) ? 0.1 : -0.1;
                            
                            mesh.userData = {
                                zoneId: zoneId,
                                buildingId: buildingId,
                                isMassDriver: true,
                                orbitalRadius: orbitalRadius,
                                planetRadius: planetRadius,
                                driverIndex: i,
                                sunwardOffset: sunwardOffset,
                                spacing: spacing,
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
                        } else if (buildingId === 'em_gas_miner') {
                            // EM Gas Miner: positioned in low orbit with tethers extending into gas giant
                            const planet = planetData.planet;
                            const orbitalRadius = planet.userData?.radius || 2.0;
                            const planetRadius = planetData.planetRadius;
                            
                            // Position just above the planet's atmosphere (1.5x planet radius)
                            const minerOrbitalRadius = planetRadius * 1.5;
                            
                            // Distribute miners around the planet
                            const angleOffset = (i / Math.max(1, requiredCount)) * Math.PI * 2;
                            const orbitalSpeed = this.calculateOrbitalSpeed(minerOrbitalRadius);
                            
                            mesh.userData = {
                                zoneId: zoneId,
                                buildingId: buildingId,
                                isEMGasMiner: true,
                                planetOrbitalRadius: orbitalRadius,
                                localOrbitalRadius: minerOrbitalRadius,
                                planetRadius: planetRadius,
                                orbitalAngle: angleOffset,
                                orbitalSpeed: orbitalSpeed,
                                minerIndex: i
                            };
                            
                            // Initial position
                            this.updateStructurePosition(mesh, planetData);
                        } else if (buildingId === 'space_elevator') {
                            // Space Elevator: positioned above planet with tether extending down
                            const planet = planetData.planet;
                            const orbitalRadius = planet.userData?.radius || 2.0;
                            const planetRadius = planetData.planetRadius;
                            
                            // Geostationary-like orbit (2x planet radius)
                            const elevatorOrbitalRadius = planetRadius * 2.0;
                            
                            // Distribute elevators around the planet (equatorial positions)
                            const angleOffset = (i / Math.max(1, requiredCount)) * Math.PI * 2;
                            const orbitalSpeed = this.calculateOrbitalSpeed(elevatorOrbitalRadius);
                            
                            mesh.userData = {
                                zoneId: zoneId,
                                buildingId: buildingId,
                                isSpaceElevator: true,
                                planetOrbitalRadius: orbitalRadius,
                                localOrbitalRadius: elevatorOrbitalRadius,
                                planetRadius: planetRadius,
                                orbitalAngle: angleOffset,
                                orbitalSpeed: orbitalSpeed,
                                elevatorIndex: i
                            };
                            
                            // Initial position
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
            // Mass driver: positioned sunwards from the planet (between planet and sun)
            const planet = planetData.planet;
            const orbitalRadius = userData.orbitalRadius;
            const planetOrbitalAngle = planet.userData?.orbitalAngle || 0;
            
            // Get the planet's current position in its orbit
            const planetX = Math.cos(planetOrbitalAngle) * orbitalRadius;
            const planetZ = Math.sin(planetOrbitalAngle) * orbitalRadius;
            
            // Calculate direction from planet to sun (sun is at origin)
            const toSunX = -planetX;
            const toSunZ = -planetZ;
            const toSunLength = Math.sqrt(toSunX * toSunX + toSunZ * toSunZ);
            const toSunNormX = toSunX / toSunLength;
            const toSunNormZ = toSunZ / toSunLength;
            
            // Position the mass driver sunwards from the planet
            // Base offset is 2 planet radii, plus spacing for additional drivers
            const sunwardOffset = userData.sunwardOffset + (userData.driverIndex * userData.spacing);
            
            const x = planetX + toSunNormX * sunwardOffset;
            const z = planetZ + toSunNormZ * sunwardOffset;
            const y = userData.elevation || 0;
            
            mesh.position.set(x, y, z);
            
            // Calculate tangent direction (prograde - perpendicular to radius, counter-clockwise)
            // Use the planet's orbital angle for tangent calculation
            const tangentX = -Math.sin(planetOrbitalAngle); // Tangent is perpendicular to radius
            const tangentZ = Math.cos(planetOrbitalAngle);
            
            // Orient the cylinder along the tangent direction (prograde)
            const lookPoint = new THREE.Vector3(
                x + tangentX,
                y,
                z + tangentZ
            );
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
        } else if (userData.isEMGasMiner) {
            // EM Gas Miner: orbits around planet in low orbit with tethers pointing toward planet
            const planet = planetData.planet;
            const planetOrbitalRadius = userData.planetOrbitalRadius;
            const localOrbitalRadius = userData.localOrbitalRadius;
            const planetOrbitalAngle = planet.userData?.orbitalAngle || 0;
            const localAngle = userData.orbitalAngle;
            
            // Get planet's position in the solar system
            const planetX = Math.cos(planetOrbitalAngle) * planetOrbitalRadius;
            const planetZ = Math.sin(planetOrbitalAngle) * planetOrbitalRadius;
            
            // Calculate miner's position relative to planet
            const localX = Math.cos(localAngle) * localOrbitalRadius;
            const localZ = Math.sin(localAngle) * localOrbitalRadius;
            
            // Final position = planet position + local offset
            const x = planetX + localX;
            const z = planetZ + localZ;
            const y = 0;
            
            mesh.position.set(x, y, z);
            
            // Orient so "down" (tethers) point toward planet center
            // The mesh group has tethers extending in -Y direction
            // We need to rotate so -Y points toward planet
            const toPlanet = new THREE.Vector3(planetX - x, 0, planetZ - z).normalize();
            const downVec = new THREE.Vector3(0, -1, 0);
            
            // Calculate rotation to align -Y with direction to planet
            mesh.quaternion.setFromUnitVectors(downVec, toPlanet);
        } else if (userData.isSpaceElevator) {
            // Space Elevator: orbits around planet with tether extending toward planet
            const planet = planetData.planet;
            const planetOrbitalRadius = userData.planetOrbitalRadius;
            const localOrbitalRadius = userData.localOrbitalRadius;
            const planetOrbitalAngle = planet.userData?.orbitalAngle || 0;
            const localAngle = userData.orbitalAngle;
            
            // Get planet's position in the solar system
            const planetX = Math.cos(planetOrbitalAngle) * planetOrbitalRadius;
            const planetZ = Math.sin(planetOrbitalAngle) * planetOrbitalRadius;
            
            // Calculate elevator's position relative to planet
            const localX = Math.cos(localAngle) * localOrbitalRadius;
            const localZ = Math.sin(localAngle) * localOrbitalRadius;
            
            // Final position = planet position + local offset
            const x = planetX + localX;
            const z = planetZ + localZ;
            const y = 0;
            
            mesh.position.set(x, y, z);
            
            // Orient so tether (extending in -Y) points toward planet center
            const toPlanet = new THREE.Vector3(planetX - x, 0, planetZ - z).normalize();
            const downVec = new THREE.Vector3(0, -1, 0);
            
            // Calculate rotation to align -Y with direction to planet
            mesh.quaternion.setFromUnitVectors(downVec, toPlanet);
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
     * Get mass driver position and angle for a zone (used by transfer visualization)
     * @param {string} zoneId - The zone ID
     * @returns {Object|null} {position: THREE.Vector3, angle: number, orbitalRadius: number} or null if no mass driver
     */
    getMassDriverData(zoneId) {
        const zoneGroup = this.structureGroups[zoneId];
        if (!zoneGroup || !zoneGroup['mass_driver'] || zoneGroup['mass_driver'].length === 0) {
            return null;
        }
        
        // Get the first mass driver's position and orbital data
        const massDriver = zoneGroup['mass_driver'][0];
        const userData = massDriver.userData;
        
        if (!userData || !userData.isMassDriver) {
            return null;
        }
        
        // Get current planet orbital angle
        const planetData = this.getPlanetData(zoneId);
        if (!planetData) {
            return null;
        }
        
        const planet = planetData.planet;
        const planetOrbitalAngle = planet.userData?.orbitalAngle || 0;
        const orbitalRadius = userData.orbitalRadius;
        
        // Mass driver is positioned sunwards from the planet
        // Calculate its effective orbital radius (planet radius minus sunward offset)
        const sunwardOffset = userData.sunwardOffset + (userData.driverIndex * userData.spacing);
        const effectiveRadius = orbitalRadius - sunwardOffset;
        
        return {
            position: massDriver.position.clone(),
            angle: planetOrbitalAngle, // Same angle as planet since it's radially offset
            orbitalRadius: effectiveRadius
        };
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
