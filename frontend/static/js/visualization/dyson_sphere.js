/** Dyson sphere visualization - 36x36 grid at 0.5 AU with permanent orbital objects */
class DysonSphereVisualization {
    constructor(scene, solarSystem) {
        this.scene = scene;
        this.solarSystem = solarSystem; // Reference to solar system for scaling
        this.dysonGroup = new THREE.Group();
        this.scene.add(this.dysonGroup);
        
        // Orbital configuration
        this.dysonOrbitRadiusAU = 0.5; // 0.5 AU relative to Earth
        this.numOrbitalPlanes = 36; // 36 unique polar orbits
        this.numPositionsPerPlane = 36; // 36 positions per orbit
        this.totalSlots = this.numOrbitalPlanes * this.numPositionsPerPlane; // 1296 total slots
        
        // Ring structure: array of filled slots, each with orbital position
        this.filledSlots = []; // Array of {planeIndex, positionIndex, orbitalAngle, mesh}
        this.filledSlotIndices = new Set(); // Track which slots are filled (for deterministic selection)
        this.currentMass = 0;
        this.targetMass = 5e21; // 5e21 kg target mass
        this.completion = 0;
        
        this.init();
    }

    init() {
        // Dyson group is already created in constructor
    }
    
    // Convert AU to visualization units using solar system's scaling
    getDysonOrbitRadius() {
        if (!this.solarSystem || !this.solarSystem.logScaleOrbit) {
            // Fallback: Earth is at 1 AU = 2 units (approximate)
            return this.dysonOrbitRadiusAU * 2.0;
        }
        try {
            // Convert AU to km, then use log scale
            const orbitKm = this.dysonOrbitRadiusAU * 149600000; // 1 AU = 149,600,000 km
            return this.solarSystem.logScaleOrbit(orbitKm);
        } catch (e) {
            // Fallback if scaling not ready yet
            return this.dysonOrbitRadiusAU * 2.0;
        }
    }
    
    // Calculate orbital period for Dyson sphere elements (for reference, not used in calculation)
    getOrbitalPeriod(radiusAU) {
        // T^2 ∝ r^3, so T ∝ r^(3/2)
        // Earth: 1 AU, 1 year = 365.25 days
        // Dyson at 0.5 AU: T = 365.25 * (0.5)^(3/2) ≈ 365.25 * 0.354 ≈ 129.2 days
        return 365.25 * Math.pow(radiusAU, 1.5);
    }

    update(gameState) {
        // Disabled: Dyson swarm is now shown as 2D dots around orbital zone icons
        // Hide all Dyson sphere elements
        this.filledSlots.forEach(slot => {
            if (slot.mesh) {
                slot.mesh.visible = false;
            }
        });
        return;
        
        // OLD CODE BELOW - DISABLED
        if (!gameState) return;

        this.currentMass = gameState.dyson_sphere_mass || 0;
        this.targetMass = gameState.dyson_sphere_target_mass || 5e21;
        this.completion = Math.min(1.0, this.currentMass / this.targetMass);
        
        // Calculate how many slots should be filled based on completion
        const targetFilledSlots = Math.floor(this.totalSlots * this.completion);
        
        // Get orbit radius in visualization units
        const orbitRadius = this.getDysonOrbitRadius();
        // Simplified orbital speed: faster orbits for closer objects (Kepler's law approximation)
        // Earth orbit speed reference: ~0.01 rad/s (from solar_system.js)
        // Dyson at 0.5 AU should be faster: speed ∝ 1/√r, so ~1.41x faster
        const baseOrbitalSpeed = 0.01 / Math.sqrt(this.dysonOrbitRadiusAU); // ~0.014 rad/s
        
        // If we need more slots filled, add them
        while (this.filledSlots.length < targetFilledSlots) {
            // Generate all possible slot indices
            const allSlots = [];
            for (let i = 0; i < this.totalSlots; i++) {
                if (!this.filledSlotIndices.has(i)) {
                    allSlots.push(i);
                }
            }
            
            // Pick a random empty slot (deterministic seeding would be better, but random is fine for now)
            const randomIndex = Math.floor(Math.random() * allSlots.length);
            const slotIndex = allSlots[randomIndex];
            this.filledSlotIndices.add(slotIndex);
            
            const planeIndex = Math.floor(slotIndex / this.numPositionsPerPlane);
            const positionIndex = slotIndex % this.numPositionsPerPlane;
            
            // Calculate starting orbital angle for this position
            const orbitalAngle = (positionIndex / this.numPositionsPerPlane) * Math.PI * 2;
            
            // Create Dyson sphere element (small black dot)
            const dotSize = 0.015; // Small black dots
            const dotGeometry = new THREE.SphereGeometry(dotSize, 6, 6);
            const dotMaterial = new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 0.9
            });
            const squareMesh = new THREE.Mesh(dotGeometry, dotMaterial);
            
            // Store slot data
            this.filledSlots.push({
                planeIndex,
                positionIndex,
                orbitalAngle,
                mesh: squareMesh,
                orbitalSpeed: baseOrbitalSpeed * (0.95 + Math.random() * 0.1) // Slight variation
            });
            
            this.dysonGroup.add(squareMesh);
        }
        
        // If we need fewer slots filled (shouldn't happen, but handle it), remove some
        while (this.filledSlots.length > targetFilledSlots) {
            const removed = this.filledSlots.pop();
            const slotIndex = removed.planeIndex * this.numPositionsPerPlane + removed.positionIndex;
            this.filledSlotIndices.delete(slotIndex);
            this.dysonGroup.remove(removed.mesh);
            removed.mesh.geometry.dispose();
            removed.mesh.material.dispose();
        }
    }
    
    // Update Dyson sphere element positions based on orbital mechanics
    update(deltaTime) {
        const orbitRadius = this.getDysonOrbitRadius();
        
        this.filledSlots.forEach(slot => {
            // Update orbital angle
            slot.orbitalAngle += slot.orbitalSpeed * deltaTime;
            
            // Calculate position in polar orbit
            // Polar orbit: orbit is in a plane containing the Y axis (poles)
            // Each orbital plane is rotated around the Y axis by a different angle
            const planeAngle = (slot.planeIndex / this.numOrbitalPlanes) * Math.PI * 2;
            
            // Start with orbit in the X-Y plane (circle in X-Y, Z=0)
            const localX = Math.cos(slot.orbitalAngle) * orbitRadius;
            const localY = Math.sin(slot.orbitalAngle) * orbitRadius;
            const localZ = 0;
            
            // Rotate around Y axis by planeAngle to get different orbital planes
            const x = localX * Math.cos(planeAngle) - localZ * Math.sin(planeAngle);
            const y = localY;
            const z = localX * Math.sin(planeAngle) + localZ * Math.cos(planeAngle);
            
            slot.mesh.position.set(x, y, z);
        });
    }
    
    getCollectedPower() {
        // Sun's total power: ~3.8e26 W
        const sunTotalPower = 3.8e26;
        return sunTotalPower * this.completion;
    }

    getCompletion() {
        return this.completion;
    }

    getParticleSystem() {
        return this.dysonGroup;
    }
}
