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
     * Calculate log-proportional visible count for ODCs
     * 1 ODC = 1 dot, 1000 ODCs = 10 dots
     */
    calculateODCVisibleCount(count) {
        if (count <= 0) return 0;
        if (count === 1) return 1;
        // log10(1) = 0, log10(1000) = 3
        // We want: count=1 → visible=1, count=1000 → visible=10
        // Formula: visible = Math.max(1, Math.ceil(Math.log10(count) * 10/3))
        // For 1: log10(1) = 0, max(1, 0) = 1 ✓
        // For 1000: log10(1000) = 3, ceil(3 * 10/3) = ceil(10) = 10 ✓
        return Math.max(1, Math.ceil(Math.log10(count) * 10 / 3));
    }

    /**
     * Create ODC mesh - satellite with flat panels
     */
    createODCMesh() {
        const group = new THREE.Group();
        
        // Central body - small box
        const bodyGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0xCCCCCC,
            metalness: 0.7,
            roughness: 0.3
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        group.add(body);

        // Create 4 flat panels extending outward
        const panelGeometry = new THREE.PlaneGeometry(0.1, 0.2);
        const panelMaterial = new THREE.MeshStandardMaterial({
            color: 0xDDDDDD,
            metalness: 0.5,
            roughness: 0.4,
            side: THREE.DoubleSide
        });

        // Panel positions: front, back, left, right
        const panelPositions = [
            { x: 0, y: 0, z: 0.15, rotY: 0 },      // Front
            { x: 0, y: 0, z: -0.15, rotY: Math.PI }, // Back
            { x: 0.15, y: 0, z: 0, rotY: Math.PI / 2 }, // Right
            { x: -0.15, y: 0, z: 0, rotY: -Math.PI / 2 } // Left
        ];

        panelPositions.forEach(pos => {
            const panel = new THREE.Mesh(panelGeometry, panelMaterial);
            panel.position.set(pos.x, pos.y, pos.z);
            panel.rotation.y = pos.rotY;
            group.add(panel);
        });

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

    /**
     * Create factory mesh - large cyan square
     */
    createFactoryMesh() {
        const geometry = new THREE.PlaneGeometry(0.15, 0.15);
        const material = new THREE.MeshStandardMaterial({
            color: 0x00FFFF,
            metalness: 0.3,
            roughness: 0.7,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
    }

    /**
     * Create refinery mesh - large brown square
     */
    createRefineryMesh() {
        const geometry = new THREE.PlaneGeometry(0.15, 0.15);
        const material = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            metalness: 0.3,
            roughness: 0.7,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
    }

    /**
     * Create mass driver mesh - long thin cylinder
     */
    createMassDriverMesh() {
        const geometry = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 16);
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
            case 'factory':
                return this.createFactoryMesh();
            case 'refinery':
                return this.createRefineryMesh();
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
                let requiredCount;
                if (buildingId === 'data_center') {
                    requiredCount = this.calculateODCVisibleCount(count);
                } else {
                    requiredCount = Math.floor(count);
                }

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
                            // Mass driver: position near planet, not orbiting
                            // Still needs to be at least 3 planetary radii away to avoid interference
                            const planetRadius = planetData.planetRadius;
                            const minDistance = planetRadius * 3; // Minimum 3 planetary radii
                            const distanceFromPlanet = minDistance + Math.random() * 0.5; // 3-3.5 planetary radii
                            const angle = Math.random() * Math.PI * 2;
                            const elevation = (Math.random() - 0.5) * 0.3; // Slight vertical variation
                            
                            mesh.userData = {
                                zoneId: zoneId,
                                buildingId: buildingId,
                                isMassDriver: true,
                                distanceFromPlanet: distanceFromPlanet,
                                angle: angle,
                                elevation: elevation
                            };
                            
                            // Position relative to planet (will be updated in update())
                            mesh.position.copy(planetData.planetPosition);
                            const offset = new THREE.Vector3(
                                Math.cos(angle) * distanceFromPlanet,
                                elevation,
                                Math.sin(angle) * distanceFromPlanet
                            );
                            mesh.position.add(offset);
                            
                            // Orient toward planet
                            const direction = new THREE.Vector3().subVectors(planetData.planetPosition, mesh.position).normalize();
                            mesh.lookAt(planetData.planetPosition);
                            mesh.rotateX(Math.PI / 2); // Adjust for cylinder orientation
                        } else if (buildingId === 'power_station') {
                            // Power stations: positioned along planet's orbital path, facing sun
                            // Alternating on either side of the planet, moving outward
                            const planet = planetData.planet;
                            const orbitalRadius = planet.userData?.radius || 2.0; // Same orbit as planet
                            const panelWidth = 0.15; // Width of each panel
                            const spacing = 3 * panelWidth; // Spacing is 3X the width (0.45 units)
                            
                            // Calculate angle spacing: panels are spaced 3X their width along the orbit
                            // angle spacing = spacing / orbitalRadius (in radians)
                            const anglePerPanel = spacing / orbitalRadius;
                            
                            // Determine which side of the orbit (alternating)
                            // Even indices on one side, odd indices on the other
                            const sideMultiplier = (i % 2 === 0) ? 1 : -1;
                            const verticalOffset = 0.1 * sideMultiplier; // Small offset above/below orbital plane
                            
                            mesh.userData = {
                                zoneId: zoneId,
                                buildingId: buildingId,
                                isPowerStation: true,
                                orbitalRadius: orbitalRadius,
                                panelIndex: i,
                                anglePerPanel: anglePerPanel,
                                verticalOffset: verticalOffset
                            };
                            
                            // Initial position (will be updated in update())
                            this.updateStructurePosition(mesh, planetData);
                        } else if (buildingId === 'data_center') {
                            // ODCs: polar orbit around planet (perpendicular to orbital plane)
                            const planetRadius = planetData.planetRadius;
                            const minOrbitalRadius = planetRadius * 3; // Minimum 3 planetary radii
                            const orbitalRadius = minOrbitalRadius + Math.random() * 0.5; // 3-3.5 planetary radii
                            const polarAngle = Math.random() * Math.PI * 2; // Angle in polar plane
                            const orbitalSpeed = this.calculateOrbitalSpeed(orbitalRadius);
                            
                            mesh.userData = {
                                zoneId: zoneId,
                                buildingId: buildingId,
                                isMassDriver: false,
                                isPowerStation: false,
                                isODC: true,
                                orbitalRadius: orbitalRadius,
                                polarAngle: polarAngle,
                                orbitalSpeed: orbitalSpeed
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
            // Mass driver: static position relative to planet
            mesh.position.copy(planetData.planetPosition);
            const offset = new THREE.Vector3(
                Math.cos(userData.angle) * userData.distanceFromPlanet,
                userData.elevation,
                Math.sin(userData.angle) * userData.distanceFromPlanet
            );
            mesh.position.add(offset);
            
            // Orient toward planet
            mesh.lookAt(planetData.planetPosition);
            mesh.rotateX(Math.PI / 2);
        } else if (userData.isPowerStation) {
            // Power stations: positioned along planet's orbital path, facing sun
            // Alternating on either side of the planet, moving outward
            const planet = planetData.planet;
            const orbitalRadius = userData.orbitalRadius;
            const planetOrbitalAngle = planet.userData?.orbitalAngle || 0;
            
            // Calculate angle along orbit starting from planet's current position
            // Moving outward from planet (positive angle direction)
            const panelAngle = planetOrbitalAngle + (userData.panelIndex * userData.anglePerPanel);
            
            // Position along orbital ring (same orbit as planet)
            // Add vertical offset to alternate above/below orbital plane
            const x = Math.cos(panelAngle) * orbitalRadius;
            const z = Math.sin(panelAngle) * orbitalRadius;
            const y = userData.verticalOffset || 0;
            mesh.position.set(x, y, z);
            
            // Face the sun (at origin)
            mesh.lookAt(0, 0, 0);
        } else if (userData.isODC) {
            // ODCs: polar orbit around planet (perpendicular to orbital plane)
            // Orbit goes over the planet's poles (north-south axis)
            const orbitalRadius = userData.orbitalRadius;
            const polarAngle = userData.polarAngle;
            
            // Calculate position in polar orbit plane (perpendicular to orbital plane)
            // The orbit is in the Y-Z plane (vertical plane through planet)
            // X is along the planet's orbital direction, Y is up/down (poles), Z is perpendicular
            const planetPos = planetData.planetPosition;
            
            // Get planet's orbital direction (tangent to its orbit)
            const planetOrbitalAngle = planetData.planet.userData?.orbitalAngle || 0;
            const planetOrbitalRadius = planetData.planet.userData?.radius || 2.0;
            
            // Calculate tangent direction (perpendicular to radius)
            const tangentX = -Math.sin(planetOrbitalAngle);
            const tangentZ = Math.cos(planetOrbitalAngle);
            const tangent = new THREE.Vector3(tangentX, 0, tangentZ).normalize();
            
            // Up vector (Y axis)
            const up = new THREE.Vector3(0, 1, 0);
            
            // Right vector (perpendicular to both tangent and up)
            const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
            
            // Position in polar orbit: circle in plane perpendicular to orbital plane
            // The orbit goes over the poles
            const y = Math.sin(polarAngle) * orbitalRadius; // Vertical component (north-south)
            const horizontalRadius = Math.cos(polarAngle) * orbitalRadius; // Horizontal radius in polar plane
            
            // Position relative to planet
            mesh.position.copy(planetPos);
            // Add offset in the polar plane (combination of up and right vectors)
            const polarOffset = new THREE.Vector3()
                .addScaledVector(up, y)
                .addScaledVector(right, horizontalRadius);
            mesh.position.add(polarOffset);
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

                    if (!userData.isMassDriver && !userData.isPowerStation && !userData.isODC) {
                        // Update orbital angle for structures orbiting around planet
                        userData.orbitalAngle += userData.orbitalSpeed * deltaTime;
                        // Keep angle in [0, 2π] range
                        if (userData.orbitalAngle > Math.PI * 2) {
                            userData.orbitalAngle -= Math.PI * 2;
                        }
                    } else if (userData.isODC) {
                        // Update polar angle for ODCs in polar orbit
                        userData.polarAngle += userData.orbitalSpeed * deltaTime;
                        // Keep angle in [0, 2π] range
                        if (userData.polarAngle > Math.PI * 2) {
                            userData.polarAngle -= Math.PI * 2;
                        }
                    }
                    // Power stations don't need orbital angle update - they follow planet's orbit

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
