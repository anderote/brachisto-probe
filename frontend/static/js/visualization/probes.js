/** Probe visualization - multiple orbital shells with 100 planes × 200 positions = 20,000 per shell */
class ProbeVisualization {
    constructor(scene, solarSystem) {
        this.scene = scene;
        this.solarSystem = solarSystem; // Reference to solar system for scaling
        this.probeGroup = new THREE.Group();
        this.scene.add(this.probeGroup);
        
        // Orbital shell configuration
        this.numOrbitalPlanes = 100; // 100 unique polar orbits per shell
        this.numPositionsPerPlane = 200; // 200 positions per orbital plane
        this.positionsPerShell = this.numOrbitalPlanes * this.numPositionsPerPlane; // 20,000 positions per shell
        
        // Define orbital shells with different radii (innermost first)
        // Shell 0: 0.4 AU (innermost), Shell 1: 0.45 AU, Shell 2: 0.5 AU (outermost)
        this.shells = [
            { radiusAU: 0.4, startProbeIndex: 0 },
            { radiusAU: 0.45, startProbeIndex: 20000 },
            { radiusAU: 0.5, startProbeIndex: 40000 }
        ];
        
        // Track which slots are filled (shellIndex, planeIndex, positionIndex)
        this.filledSlots = []; // Array of {shellIndex, planeIndex, positionIndex, orbitalAngle}
        this.filledSlotIndices = new Set(); // Track filled slots to avoid duplicates (format: "shell-plane-position")
        this.totalProbeCount = 0; // Actual number of built probes
        
        // Use same visual object as asteroids: THREE.Points with BufferGeometry
        this.pointsGeometry = new THREE.BufferGeometry();
        
        // Initialize with at least one vertex to avoid WebGL errors
        // We'll use a dummy vertex that we'll update when we have real data
        const dummyPositions = new Float32Array([0, 0, 0]);
        const dummyColors = new Float32Array([0.5, 0.5, 0.5]);
        this.pointsGeometry.setAttribute('position', new THREE.BufferAttribute(dummyPositions, 3));
        this.pointsGeometry.setAttribute('color', new THREE.BufferAttribute(dummyColors, 3));
        this.pointsGeometry.setDrawRange(0, 0); // Don't draw anything initially
        
        this.pointsMaterial = new THREE.PointsMaterial({
            size: 0.008,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.7
        });
        this.pointsMesh = new THREE.Points(this.pointsGeometry, this.pointsMaterial);
        this.probeGroup.add(this.pointsMesh);
        
        // Initialize arrays for positions and colors
        // Note: PointsMaterial doesn't support per-vertex sizes, only the material's size property
        // We'll use max visible probes based on logarithmic function
        // For very large probe counts, visible count grows slowly: 1000 probes → ~24 dots, 10000 → ~31 dots
        this.maxVisibleProbes = 50; // Reasonable upper limit for visible probes (covers up to ~10^6 probes)
        this.positions = new Float32Array(this.maxVisibleProbes * 3);
        this.colors = new Float32Array(this.maxVisibleProbes * 3);
        
        // Gray color for probes (same as asteroids but gray)
        this.grayColor = new THREE.Color(0x808080); // Gray color
        
        // Orbital speed for probes
        const baseOrbitalSpeed = 0.01 / Math.sqrt(this.probeOrbitRadiusAU); // ~0.013 rad/s
        
        this.init();
    }

    init() {
        // Probe group is already created in constructor
    }
    
    // Convert AU to visualization units using solar system's scaling
    getProbeOrbitRadius(radiusAU) {
        if (!this.solarSystem || !this.solarSystem.logScaleOrbit) {
            // Fallback: Earth is at 1 AU = 2 units (approximate)
            return radiusAU * 2.0;
        }
        try {
            // Use unified scaling directly with AU
            if (this.solarSystem.scaleAUToVisual) {
                return this.solarSystem.scaleAUToVisual(radiusAU);
            }
            // Fallback if scaling not ready yet
            return radiusAU * 2.0;
        } catch (e) {
            // Fallback if scaling not ready yet
            return radiusAU * 2.0;
        }
    }
    
    // Calculate orbital period for probes (Kepler's law)
    getOrbitalPeriod(radiusAU) {
        // T^2 ∝ r^3, so T ∝ r^(3/2)
        // Earth: 1 AU, 1 year = 365.25 days
        // Probe at 0.6 AU: T = 365.25 * (0.6)^(3/2) ≈ 365.25 * 0.464 ≈ 169.6 days
        return 365.25 * Math.pow(radiusAU, 1.5);
    }
    
    // Calculate visible probe count using logarithmic function
    // 10 probes → 10 dots, 100 probes → 17 dots
    // Formula: y = 7 * log10(x) + 3
    calculateVisibleProbeCount(totalProbes) {
        if (totalProbes <= 0) return 0;
        if (totalProbes <= 10) return Math.floor(totalProbes);
        // For x > 10: y = 7 * log10(x) + 3
        const visible = Math.floor(7 * Math.log10(totalProbes) + 3);
        // Cap at maxVisibleProbes to prevent array overflow
        return Math.max(10, Math.min(visible, this.maxVisibleProbes));
    }

    updateProbes(gameState) {
        // Disabled: probes are now shown as 2D dots around orbital zone icons
        // Hide the 3D visualization
        if (this.pointsMesh) {
            this.pointsMesh.visible = false;
        }
        return;
        
        // OLD CODE BELOW - DISABLED
        if (!gameState || !gameState.probes) return;

        // Calculate total probe count (actual built probes)
        const totalProbes = Object.values(gameState.probes).reduce((sum, count) => sum + (count || 0), 0);
        
        // Calculate visible probe count using logarithmic function
        const visibleProbeCount = this.calculateVisibleProbeCount(totalProbes);
        
        // If no change in total count and visible count matches, skip slot regeneration
        // (positions will still be updated in the animation loop)
        const needsSlotRegeneration = totalProbes !== this.totalProbeCount || 
                                     visibleProbeCount !== this.filledSlots.length ||
                                     this.filledSlots.length === 0;
        
        if (!needsSlotRegeneration) {
            // Slots are already correct, just ensure positions are updated
            this.updatePositions();
            return;
        }
        
        this.totalProbeCount = totalProbes;
        
        // Store previous orbital data to preserve animation continuity
        const previousSlotData = new Map();
        this.filledSlots.forEach(slot => {
            const key = `${slot.shellIndex}-${slot.planeIndex}-${slot.positionIndex}`;
            previousSlotData.set(key, {
                orbitalAngle: slot.orbitalAngle,
                orbitalSpeed: slot.orbitalSpeed
            });
        });
        
        // Fill slots sequentially: innermost shell first, plane by plane, position by position
        this.filledSlots = [];
        this.filledSlotIndices.clear();
        
        // Calculate plane offset for even interspersion (same calculation for all planes)
        const positionStep = (Math.PI * 2) / this.numPositionsPerPlane; // Angular step per position
        
        // First, determine which slots should be filled based on actual probe count
        // Then select a visible subset for display
        const allFilledSlots = [];
        
        // Fill all slots sequentially based on actual probe count
        for (let shellIndex = 0; shellIndex < this.shells.length; shellIndex++) {
            const shell = this.shells[shellIndex];
            
            // Only fill slots from shells that should be active based on total probe count
            if (totalProbes > shell.startProbeIndex) {
                const maxProbesInShell = Math.min(totalProbes - shell.startProbeIndex, this.positionsPerShell);
                
                // Fill plane by plane, position by position
                for (let planeIndex = 0; planeIndex < this.numOrbitalPlanes; planeIndex++) {
                    // Calculate plane offset for even interspersion
                    const planeOffset = (planeIndex / this.numOrbitalPlanes) * positionStep;
                    
                    for (let positionIndex = 0; positionIndex < this.numPositionsPerPlane; positionIndex++) {
                        // Check if this slot should be filled based on total probe count
                        const globalSlotIndex = shell.startProbeIndex + planeIndex * this.numPositionsPerPlane + positionIndex;
                        if (globalSlotIndex < shell.startProbeIndex + maxProbesInShell) {
                            // Calculate orbital speed based on shell radius
                            const baseOrbitalSpeed = 0.01 / Math.sqrt(shell.radiusAU);
                            
                            // Starting orbital angle (base angle, offset applied in position calculation)
                            // Try to preserve previous angle and speed if this slot was already filled
                            const slotKey = `${shellIndex}-${planeIndex}-${positionIndex}`;
                            const baseAngle = (positionIndex / this.numPositionsPerPlane) * Math.PI * 2;
                            const previousData = previousSlotData.get(slotKey);
                            
                            // Use preserved data if available, otherwise calculate new values
                            const orbitalAngle = previousData ? previousData.orbitalAngle : baseAngle;
                            const orbitalSpeed = previousData ? previousData.orbitalSpeed : (baseOrbitalSpeed * (0.9 + Math.random() * 0.2));
                            
                            allFilledSlots.push({
                                shellIndex: shellIndex,
                                planeIndex: planeIndex,
                                positionIndex: positionIndex,
                                orbitalAngle: orbitalAngle,
                                planeOffset: planeOffset,
                                orbitalSpeed: orbitalSpeed
                            });
                        }
                    }
                }
            }
        }
        
        // Now select a visible subset evenly distributed across all filled slots
        // This ensures we see probes from all active shells and planes, maintaining rotation
        if (allFilledSlots.length > 0 && visibleProbeCount > 0) {
            // Distribute visible probes evenly across all filled slots
            // This ensures we see probes from different planes and shells
            const step = Math.max(1, Math.floor(allFilledSlots.length / visibleProbeCount));
            for (let i = 0; i < allFilledSlots.length && this.filledSlots.length < visibleProbeCount; i += step) {
                this.filledSlots.push(allFilledSlots[i]);
            }
            
            // If we didn't get enough, fill from the end to ensure we have the right count
            let remainingNeeded = visibleProbeCount - this.filledSlots.length;
            if (remainingNeeded > 0) {
                // Add slots from the end, working backwards
                for (let i = allFilledSlots.length - 1; i >= 0 && remainingNeeded > 0; i--) {
                    // Check if this slot is already in filledSlots
                    const slot = allFilledSlots[i];
                    const isDuplicate = this.filledSlots.some(fs => 
                        fs.shellIndex === slot.shellIndex && 
                        fs.planeIndex === slot.planeIndex && 
                        fs.positionIndex === slot.positionIndex
                    );
                    if (!isDuplicate) {
                        this.filledSlots.push(slot);
                        remainingNeeded--;
                    }
                }
            }
        }
        
        // Update positions array and geometry
        this.updatePositions();
    }
    
    // Update positions array from probe orbits
    updatePositions() {
        for (let i = 0; i < this.filledSlots.length; i++) {
            const slot = this.filledSlots[i];
            const shell = this.shells[slot.shellIndex];
            
            // Get orbit radius for this shell
            const orbitRadius = this.getProbeOrbitRadius(shell.radiusAU);
            
            // Calculate position in polar orbit
            // Polar orbit: orbit is in a plane containing the Y axis (poles)
            // Each orbital plane is rotated around the Y axis by a different angle
            const planeAngle = (slot.planeIndex / this.numOrbitalPlanes) * Math.PI * 2;
            
            // Start with orbit in the X-Y plane (circle in X-Y, Z=0)
            // This is a polar orbit that goes over the poles (Y axis)
            // Apply plane offset for even interspersion between planes
            const angleWithOffset = slot.orbitalAngle + (slot.planeOffset || 0);
            const localX = Math.cos(angleWithOffset) * orbitRadius;
            const localY = Math.sin(angleWithOffset) * orbitRadius;
            const localZ = 0;
            
            // Rotate around Y axis by planeAngle to get different orbital planes
            const x = localX * Math.cos(planeAngle) - localZ * Math.sin(planeAngle);
            const y = localY;
            const z = localX * Math.sin(planeAngle) + localZ * Math.cos(planeAngle);
            
            // Store in positions array
            const idx = i * 3;
            this.positions[idx] = x;
            this.positions[idx + 1] = y;
            this.positions[idx + 2] = z;
            
            // Set gray color (same as asteroids but gray)
            const colorIdx = i * 3;
            this.colors[colorIdx] = this.grayColor.r;
            this.colors[colorIdx + 1] = this.grayColor.g;
            this.colors[colorIdx + 2] = this.grayColor.b;
        }
        
        // Update geometry with new positions and colors
        // PointsMaterial doesn't support per-vertex sizes, only the material's size property
        if (this.filledSlots.length > 0) {
            const numVertices = this.filledSlots.length;
            const numFloats = numVertices * 3;
            
            // Update existing attributes if they exist and have the right size, otherwise create new ones
            const positionAttr = this.pointsGeometry.getAttribute('position');
            const colorAttr = this.pointsGeometry.getAttribute('color');
            
            if (positionAttr && positionAttr.count === numVertices) {
                // Update existing attribute array directly (much faster than recreating)
                // Copy positions directly into the existing array without creating new arrays
                const posArray = positionAttr.array;
                for (let i = 0; i < numFloats; i++) {
                    posArray[i] = this.positions[i];
                }
                positionAttr.needsUpdate = true;
            } else {
                // Create new attribute only when size changes
                const positionArray = new Float32Array(this.positions.buffer, 0, numFloats);
                this.pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
            }
            
            if (colorAttr && colorAttr.count === numVertices) {
                // Colors don't change during animation, but update to be safe
                const colArray = colorAttr.array;
                for (let i = 0; i < numFloats; i++) {
                    colArray[i] = this.colors[i];
                }
                colorAttr.needsUpdate = true;
            } else {
                // Create new attribute only when size changes
                const colorArray = new Float32Array(this.colors.buffer, 0, numFloats);
                this.pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
            }
            
            this.pointsGeometry.setDrawRange(0, numVertices);
            // Ensure the mesh is visible
            this.pointsMesh.visible = true;
        } else {
            // Empty geometry - keep dummy vertex but don't draw anything
            // This prevents WebGL shader errors from empty geometry
            this.pointsGeometry.setDrawRange(0, 0);
            // Hide the mesh when there are no probes
            this.pointsMesh.visible = false;
        }
    }
    
    // Update probe positions based on orbital mechanics
    update(deltaTime) {
        // Only update if we have probes to animate
        if (this.filledSlots.length === 0) {
            return;
        }
        
        // Update orbital angles for all probes
        // Always update positions to ensure smooth animation
        for (let i = 0; i < this.filledSlots.length; i++) {
            const slot = this.filledSlots[i];
            slot.orbitalAngle += slot.orbitalSpeed * deltaTime;
            // Normalize angle to prevent overflow
            if (slot.orbitalAngle > Math.PI * 2) {
                slot.orbitalAngle -= Math.PI * 2;
            } else if (slot.orbitalAngle < 0) {
                slot.orbitalAngle += Math.PI * 2;
            }
        }
        
        // Always update positions after angle updates to ensure smooth animation
        this.updatePositions();
    }

    getProbeSystem() {
        return this.probeGroup;
    }
}
