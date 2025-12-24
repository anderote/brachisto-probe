/** Dyson Swarm Visualization - Black dots in polar orbital rings with exponential waterfall distribution */
class DysonSphereVisualization {
    constructor(scene, solarSystem) {
        this.scene = scene;
        this.solarSystem = solarSystem;
        this.dysonGroup = new THREE.Group();
        this.scene.add(this.dysonGroup);
        
        // Orbital configuration
        // 360 polar orbital rings, 1 degree apart (0°, 1°, 2°, ... 359°)
        this.numOrbitalRings = 720;
        this.maxParticlesPerRing = 420;
        this.maxTotalParticles = this.numOrbitalRings * this.maxParticlesPerRing; // 360,000 max
        
        // 10 different orbital altitudes (as multipliers of base radius)
        // Pattern: distributed from 0.95x to 1.05x in a wave pattern
        this.numAltitudes = 10;
        this.altitudeMultipliers = [];
        for (let i = 0; i < this.numAltitudes; i++) {
            // Create a wave pattern: 0.95 to 1.05 with smooth distribution
            const t = i / (this.numAltitudes - 1); // 0 to 1
            // Use sine wave for smooth distribution: 0.95 + 0.1 * sin(π * t)
            const multiplier = 0.95 + 0.1 * Math.sin(Math.PI * t);
            this.altitudeMultipliers.push(multiplier);
        }
        
        // Exponential waterfall distribution weights
        // Ring i gets weight 1/e^i
        this.E = Math.E;
        this.ringWeights = [];
        this.totalWeight = 0;
        for (let i = 1; i <= this.numOrbitalRings; i++) {
            const weight = 1 / Math.pow(this.E, i);
            this.ringWeights.push(weight);
            this.totalWeight += weight;
        }
        
        // Particle system (first shell)
        this.particleSystem = null;
        this.particleGeometry = null;
        this.particleMaterial = null;
        this.particleData = []; // Array of {ringIndex, angle, orbitalSpeed}
        this.positions = null;
        this.sizes = null;
        
        // Particle system (second shell, rotated 90 degrees)
        this.particleSystem2 = null;
        this.particleGeometry2 = null;
        this.particleMaterial2 = null;
        this.particleData2 = []; // Array of {ringIndex, angle, orbitalSpeed}
        this.positions2 = null;
        this.sizes2 = null;
        
        // Particle system (third shell, rotated 90 degrees along different axis)
        this.particleSystem3 = null;
        this.particleGeometry3 = null;
        this.particleMaterial3 = null;
        this.particleData3 = []; // Array of {ringIndex, angle, orbitalSpeed}
        this.positions3 = null;
        this.sizes3 = null;
        
        this.time = 0;
        
        // State
        this.currentMass = 0;
        this.targetMass = 5e24;
        this.completion = 0;
        this.currentParticleCount = 0;
        this.earthMass = 5.9724e24;
        
        // Ring particle counts for distribution
        this.ringParticleCounts = new Array(this.numOrbitalRings).fill(0);
        
        // Completion sign element
        this.completionSign = null;
        
        this.init();
    }

    init() {
        // Create particle system geometry
        this.particleGeometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.maxTotalParticles * 3);
        this.sizes = new Float32Array(this.maxTotalParticles);
        
        // Initialize arrays
        for (let i = 0; i < this.maxTotalParticles; i++) {
            this.positions[i * 3] = 0;
            this.positions[i * 3 + 1] = 0;
            this.positions[i * 3 + 2] = 0;
            this.sizes[i] = 0.025;
        }
        
        this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.particleGeometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
        this.particleGeometry.setDrawRange(0, 0);
        
        // Create simple black dot material
        this.particleMaterial = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: `
                attribute float size;
                
                void main() {
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                void main() {
                    // Calculate distance from center of point
                    vec2 center = gl_PointCoord - vec2(0.5);
                    float dist = length(center);
                    
                    // Create solid circular dot
                    if (dist > 0.5) {
                        discard;
                    }
                    
                    // White color
                    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
                }
            `,
            transparent: false,
            depthWrite: true
        });
        
        // Create first particle system
        this.particleSystem = new THREE.Points(this.particleGeometry, this.particleMaterial);
        this.particleSystem.renderOrder = 50;
        this.particleSystem.frustumCulled = false;
        this.dysonGroup.add(this.particleSystem);
        
        // Create second particle system (duplicate with rotated coordinates)
        this.particleGeometry2 = new THREE.BufferGeometry();
        this.positions2 = new Float32Array(this.maxTotalParticles * 3);
        this.sizes2 = new Float32Array(this.maxTotalParticles);
        
        // Initialize arrays for second system
        for (let i = 0; i < this.maxTotalParticles; i++) {
            this.positions2[i * 3] = 0;
            this.positions2[i * 3 + 1] = 0;
            this.positions2[i * 3 + 2] = 0;
            this.sizes2[i] = 0.025;
        }
        
        this.particleGeometry2.setAttribute('position', new THREE.BufferAttribute(this.positions2, 3));
        this.particleGeometry2.setAttribute('size', new THREE.BufferAttribute(this.sizes2, 1));
        this.particleGeometry2.setDrawRange(0, 0);
        
        // Reuse the same material for second system
        this.particleMaterial2 = this.particleMaterial.clone();
        
        // Create second particle system
        this.particleSystem2 = new THREE.Points(this.particleGeometry2, this.particleMaterial2);
        this.particleSystem2.renderOrder = 50;
        this.particleSystem2.frustumCulled = false;
        this.dysonGroup.add(this.particleSystem2);
        
        // Create third particle system (duplicate with rotated coordinates)
        this.particleGeometry3 = new THREE.BufferGeometry();
        this.positions3 = new Float32Array(this.maxTotalParticles * 3);
        this.sizes3 = new Float32Array(this.maxTotalParticles);
        
        // Initialize arrays for third system
        for (let i = 0; i < this.maxTotalParticles; i++) {
            this.positions3[i * 3] = 0;
            this.positions3[i * 3 + 1] = 0;
            this.positions3[i * 3 + 2] = 0;
            this.sizes3[i] = 0.025;
        }
        
        this.particleGeometry3.setAttribute('position', new THREE.BufferAttribute(this.positions3, 3));
        this.particleGeometry3.setAttribute('size', new THREE.BufferAttribute(this.sizes3, 1));
        this.particleGeometry3.setDrawRange(0, 0);
        
        // Reuse the same material for third system
        this.particleMaterial3 = this.particleMaterial.clone();
        
        // Create third particle system
        this.particleSystem3 = new THREE.Points(this.particleGeometry3, this.particleMaterial3);
        this.particleSystem3.renderOrder = 50;
        this.particleSystem3.frustumCulled = false;
        this.dysonGroup.add(this.particleSystem3);
        
        // Create completion sign element
        this.createCompletionSign();
    }
    
    createCompletionSign() {
        // Create a DOM element for the completion sign
        this.completionSign = document.createElement('div');
        this.completionSign.className = 'dyson-completion-sign';
        this.completionSign.textContent = 'COMPLETE';
        this.completionSign.style.display = 'none';
        document.getElementById('app').appendChild(this.completionSign);
    }
    
    // Get Dyson orbit radius at 4x Mercury's orbital radius
    getDysonOrbitRadius() {
        if (!this.solarSystem || !this.solarSystem.logScaleOrbit || !this.solarSystem.planetData) {
            return 2.0; // Fallback
        }
        try {
            const mercuryOrbitKm = this.solarSystem.planetData.mercury?.orbit_km || 173700000;
            const mercuryOrbit = this.solarSystem.logScaleOrbit(mercuryOrbitKm);
            return mercuryOrbit * 2.5; // 2.5 times Mercury's orbit
        } catch (e) {
            return 2.0;
        }
    }
    
    // Calculate orbital speed based on Kepler's law
    getBaseOrbitalSpeed() {
        const earthOrbitSpeed = 0.01;
        // Faster orbit since closer to sun
        return earthOrbitSpeed * 2.0;
    }
    
    /**
     * Calculate visible particle count using sigmoidal interpolation
     * - 1000 dots at 100,000 kg
     * - 180,000 dots (50% of rings) at 50% of target mass
     * - 360,000 dots (all rings full) at target mass
     */
    calculateVisibleCount(currentMass) {
        if (currentMass <= 0) {
            return 0;
        }
        
        const minMass = 100000; // 100,000 kg → 1000 dots
        const minDots = 1000;
        const maxDots = this.maxTotalParticles; // 360,000 dots (all rings full)
        const halfRingsDots = 180000; // 50% of rings = 180 rings * 1000 = 180,000 dots
        
        // If below minimum threshold, use linear scaling
        if (currentMass < minMass) {
            return Math.floor((currentMass / minMass) * minDots);
        }
        
        // Calculate 50% mass point (where we want 50% of rings full)
        const halfMass = this.targetMass * 0.5;
        
        // Normalize mass to 0-1 range for sigmoid
        // Map: minMass → 0, targetMass → 1
        const normalizedMass = (currentMass - minMass) / (this.targetMass - minMass);
        
        // Use sigmoid function: f(x) = L / (1 + e^(-k(x - x0)))
        // We want:
        // - At normalizedMass = 0: ~minDots (1000)
        // - At normalizedMass = 0.5 (halfMass): halfRingsDots (360,000)
        // - At normalizedMass = 1: maxDots (720,000)
        
        // Adjust sigmoid to map [0,1] to [minDots, maxDots]
        // Using a sigmoid centered at 0.5 with appropriate scaling
        const k = 8.0; // Steepness parameter (higher = steeper curve)
        const sigmoidValue = 1 / (1 + Math.exp(-k * (normalizedMass - 0.5)));
        
        // Map sigmoid output [0,1] to [minDots, maxDots]
        // But we want it to start closer to minDots and reach halfRingsDots at midpoint
        let particleCount;
        if (normalizedMass <= 0.5) {
            // First half: interpolate from minDots to halfRingsDots
            const t = normalizedMass * 2; // Scale to 0-1 for first half
            const sigmoidT = 1 / (1 + Math.exp(-k * (t - 0.5)));
            particleCount = minDots + (halfRingsDots - minDots) * sigmoidT;
        } else {
            // Second half: interpolate from halfRingsDots to maxDots
            const t = (normalizedMass - 0.5) * 2; // Scale to 0-1 for second half
            const sigmoidT = 1 / (1 + Math.exp(-k * (t - 0.5)));
            particleCount = halfRingsDots + (maxDots - halfRingsDots) * sigmoidT;
        }
        
        return Math.min(maxDots, Math.floor(particleCount));
    }
    
    /**
     * Distribute particles across rings using exponential waterfall
     * Ring 1 gets 1/e, ring 2 gets 1/e², etc.
     * Each ring capped at 1000 particles (maxParticlesPerRing)
     */
    distributeParticlesToRings(totalParticles) {
        const ringCounts = new Array(this.numOrbitalRings).fill(0);
        let remainingParticles = totalParticles;
        
        // First pass: distribute according to weights
        for (let i = 0; i < this.numOrbitalRings && remainingParticles > 0; i++) {
            // Calculate proportional allocation for this ring
            const proportion = this.ringWeights[i] / this.totalWeight;
            let ringAllocation = Math.floor(totalParticles * proportion);
            
            // Cap at max per ring
            ringAllocation = Math.min(ringAllocation, this.maxParticlesPerRing);
            ringAllocation = Math.min(ringAllocation, remainingParticles);
            
            ringCounts[i] = ringAllocation;
            remainingParticles -= ringAllocation;
        }
        
        // Second pass: distribute any remaining particles to rings that aren't full
        // (waterfall overflow)
        for (let i = 0; i < this.numOrbitalRings && remainingParticles > 0; i++) {
            const spaceInRing = this.maxParticlesPerRing - ringCounts[i];
            const toAdd = Math.min(spaceInRing, remainingParticles);
            ringCounts[i] += toAdd;
            remainingParticles -= toAdd;
        }
        
        return ringCounts;
    }
    
    /**
     * Update method - handles both game state updates and animation
     * Called with gameState (object) for state updates, or deltaTime (number) for animation
     */
    update(arg) {
        // Detect if called with gameState (object) or deltaTime (number)
        if (typeof arg === 'object' && arg !== null) {
            this.updateFromGameState(arg);
        } else if (typeof arg === 'number') {
            this.updateAnimation(arg);
        }
    }
    
    // Update based on game state
    updateFromGameState(gameState) {
        if (!gameState) {
            if (this.particleGeometry) {
                this.particleGeometry.setDrawRange(0, 0);
            }
            if (this.particleGeometry2) {
                this.particleGeometry2.setDrawRange(0, 0);
            }
            if (this.particleGeometry3) {
                this.particleGeometry3.setDrawRange(0, 0);
            }
            return;
        }
        
        const dysonSphere = gameState.dyson_sphere || {};
        this.currentMass = dysonSphere.mass || 0;
        this.targetMass = dysonSphere.target_mass || gameState.dyson_sphere_target_mass || 5e24;
        this.completion = Math.min(1.0, this.currentMass / this.targetMass);
        
        const targetParticleCount = this.calculateVisibleCount(this.currentMass);
        
        if (targetParticleCount !== this.currentParticleCount) {
            this.ringParticleCounts = this.distributeParticlesToRings(targetParticleCount);
            this.updateParticleData();
            this.currentParticleCount = targetParticleCount;
        }
        
        if (this.particleGeometry) {
            this.particleGeometry.setDrawRange(0, this.currentParticleCount);
        }
        if (this.particleGeometry2) {
            this.particleGeometry2.setDrawRange(0, this.currentParticleCount);
        }
        if (this.particleGeometry3) {
            this.particleGeometry3.setDrawRange(0, this.currentParticleCount);
        }
        
        if (this.particleSystem) {
            this.particleSystem.visible = this.currentMass > 0;
        }
        if (this.particleSystem2) {
            this.particleSystem2.visible = this.currentMass > 0;
        }
        if (this.particleSystem3) {
            this.particleSystem3.visible = this.currentMass > 0;
        }
        
        // Show/hide completion sign
        if (this.completionSign) {
            if (this.completion >= 1.0) {
                this.completionSign.style.display = 'block';
            } else {
                this.completionSign.style.display = 'none';
            }
        }
    }
    
    // Build particle data array from ring distribution
    updateParticleData() {
        this.particleData = [];
        this.particleData2 = []; // Second shell data
        this.particleData3 = []; // Third shell data
        const orbitRadius = this.getDysonOrbitRadius();
        const baseOrbitalSpeed = this.getBaseOrbitalSpeed();
        
        for (let ringIndex = 0; ringIndex < this.numOrbitalRings; ringIndex++) {
            const particleCount = this.ringParticleCounts[ringIndex];
            if (particleCount === 0) continue;
            
            // Ring polar angle: 0°, 1°, 2°, ... 359° (converted to radians)
            // Map to phi: 0 to π for full sphere coverage
            // Ring 0 at 0° (north pole), ring 180 at 180° (south pole), etc.
            const polarAngleDegrees = ringIndex * 1;
            const phi = (polarAngleDegrees / 180) * Math.PI; // Convert to radians, 0 to ~2π
            
            // Assign this ring to one of the 10 altitudes using a pattern
            // Use ringIndex to cycle through altitudes in a repeating pattern
            const altitudeIndex = ringIndex % this.numAltitudes;
            const altitudeMultiplier = this.altitudeMultipliers[altitudeIndex];
            const ringRadius = orbitRadius * altitudeMultiplier;
            
            for (let i = 0; i < particleCount; i++) {
                // Distribute particles evenly around the ring
                const angle = (i / particleCount) * Math.PI * 2;
                
                // Slight speed variation for visual interest
                const speedVariation = 0.9 + Math.random() * 0.2;
                const orbitalSpeed = baseOrbitalSpeed * speedVariation;
                
                const particleData = {
                    ringIndex: ringIndex,
                    phi: phi,
                    angle: angle,
                    orbitalSpeed: orbitalSpeed,
                    size: 0.020 + Math.random() * 0.010,
                    altitudeMultiplier: altitudeMultiplier // Store altitude for this ring
                };
                
                // Add to first shell
                this.particleData.push(particleData);
                
                // Add to second shell (same data, will be rotated in position calculation)
                this.particleData2.push({...particleData});
                
                // Add to third shell (same data, will be rotated in position calculation)
                this.particleData3.push({...particleData});
            }
        }
    }
    
    // Update particle positions each frame (animation)
    updateAnimation(deltaTime) {
        if (!this.particleSystem || !this.particleGeometry || this.particleData.length === 0) {
            return;
        }
        
        this.time += deltaTime;
        const orbitRadius = this.getDysonOrbitRadius();
        
        // Update each particle's position for first shell
        for (let i = 0; i < this.particleData.length && i < this.maxTotalParticles; i++) {
            const particle = this.particleData[i];
            
            // Update orbital angle
            particle.angle += particle.orbitalSpeed * deltaTime;
            if (particle.angle > Math.PI * 2) {
                particle.angle -= Math.PI * 2;
            }
            
            // Convert spherical to cartesian
            // phi is the polar angle from the ring distribution
            // For rings at different polar angles, create great circles
            const theta = particle.angle;
            const phi = particle.phi;
            
            // Calculate rotation axis for this ring (perpendicular to orbital plane)
            // Each ring orbits around an axis tilted by its polar angle
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);
            
            // Position on a circle at angle theta, then rotate the circle by phi
            // This creates orbital rings at different polar inclinations
            // Use the altitude multiplier for this ring to create layered altitudes
            const ringRadius = orbitRadius * particle.altitudeMultiplier;
            const x = ringRadius * Math.cos(theta);
            const y = ringRadius * Math.sin(theta) * cosPhi;
            const z = ringRadius * Math.sin(theta) * sinPhi;
            
            const idx = i * 3;
            this.positions[idx] = x;
            this.positions[idx + 1] = y;
            this.positions[idx + 2] = z;
            
            this.sizes[i] = particle.size;
        }
        
        // Update each particle's position for second shell (rotated 90 degrees)
        for (let i = 0; i < this.particleData2.length && i < this.maxTotalParticles; i++) {
            const particle = this.particleData2[i];
            
            // Update orbital angle (same as first shell)
            particle.angle += particle.orbitalSpeed * deltaTime;
            if (particle.angle > Math.PI * 2) {
                particle.angle -= Math.PI * 2;
            }
            
            // Convert spherical to cartesian (same calculation)
            const theta = particle.angle;
            const phi = particle.phi;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);
            
            // Calculate position in original coordinate system
            const ringRadius = orbitRadius * particle.altitudeMultiplier;
            const x = ringRadius * Math.cos(theta);
            const y = ringRadius * Math.sin(theta) * cosPhi;
            const z = ringRadius * Math.sin(theta) * sinPhi;
            
            // Rotate 90 degrees around Y axis: (x, y, z) -> (z, y, -x)
            // This rotates the polar axis from X to Z, creating perpendicular orientation
            const idx = i * 3;
            this.positions2[idx] = z;   // X becomes Z
            this.positions2[idx + 1] = y;  // Y stays Y
            this.positions2[idx + 2] = -x; // Z becomes -X
            
            this.sizes2[i] = particle.size;
        }
        
        // Update each particle's position for third shell (rotated 90 degrees around Z axis)
        for (let i = 0; i < this.particleData3.length && i < this.maxTotalParticles; i++) {
            const particle = this.particleData3[i];
            
            // Update orbital angle (same as first shell)
            particle.angle += particle.orbitalSpeed * deltaTime;
            if (particle.angle > Math.PI * 2) {
                particle.angle -= Math.PI * 2;
            }
            
            // Convert spherical to cartesian (same calculation)
            const theta = particle.angle;
            const phi = particle.phi;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);
            
            // Calculate position in original coordinate system
            const ringRadius = orbitRadius * particle.altitudeMultiplier;
            const x = ringRadius * Math.cos(theta);
            const y = ringRadius * Math.sin(theta) * cosPhi;
            const z = ringRadius * Math.sin(theta) * sinPhi;
            
            // Rotate 90 degrees around Z axis: (x, y, z) -> (-y, x, z)
            // This rotates the polar axis from X to Y, creating perpendicular orientation
            const idx = i * 3;
            this.positions3[idx] = -y;  // X becomes -Y
            this.positions3[idx + 1] = x;  // Y becomes X
            this.positions3[idx + 2] = z;   // Z stays Z
            
            this.sizes3[i] = particle.size;
        }
        
        // Update geometry for first shell
        const positionAttr = this.particleGeometry.getAttribute('position');
        const sizeAttr = this.particleGeometry.getAttribute('size');
        
        if (positionAttr) {
            positionAttr.array.set(this.positions);
            positionAttr.needsUpdate = true;
        }
        if (sizeAttr) {
            sizeAttr.array.set(this.sizes);
            sizeAttr.needsUpdate = true;
        }
        
        // Update geometry for second shell
        const positionAttr2 = this.particleGeometry2.getAttribute('position');
        const sizeAttr2 = this.particleGeometry2.getAttribute('size');
        
        if (positionAttr2) {
            positionAttr2.array.set(this.positions2);
            positionAttr2.needsUpdate = true;
        }
        if (sizeAttr2) {
            sizeAttr2.array.set(this.sizes2);
            sizeAttr2.needsUpdate = true;
        }
        
        // Update geometry for third shell
        const positionAttr3 = this.particleGeometry3.getAttribute('position');
        const sizeAttr3 = this.particleGeometry3.getAttribute('size');
        
        if (positionAttr3) {
            positionAttr3.array.set(this.positions3);
            positionAttr3.needsUpdate = true;
        }
        if (sizeAttr3) {
            sizeAttr3.array.set(this.sizes3);
            sizeAttr3.needsUpdate = true;
        }
    }
    
    getCollectedPower() {
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
