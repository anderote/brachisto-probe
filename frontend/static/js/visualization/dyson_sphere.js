/** Dyson Swarm Visualization - Simplified with evenly distributed orbital rings */
class DysonSphereVisualization {
    constructor(scene, solarSystem) {
        this.scene = scene;
        this.solarSystem = solarSystem;
        this.dysonGroup = new THREE.Group();
        if (this.scene) {
            this.scene.add(this.dysonGroup);
        } else {
            console.warn('[DysonSphere] Scene not provided to constructor');
        }

        // Simplified orbital configuration
        // More rings with better distribution for fuller complete sphere
        this.numOrbitalRings = 96;
        this.maxParticlesPerRing = 256;
        this.maxTotalParticles = this.numOrbitalRings * this.maxParticlesPerRing; // 24,576 max (3x original)

        // 3 different orbital altitudes (as multipliers of base radius)
        this.numAltitudes = 3;
        this.altitudeMultipliers = [0.96, 1.0, 1.04];

        // Even distribution weights (all rings get equal weight)
        this.ringWeights = [];
        this.totalWeight = 0;
        for (let i = 0; i < this.numOrbitalRings; i++) {
            this.ringWeights.push(1.0);
            this.totalWeight += 1.0;
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
            this.sizes[i] = 0.48; // 4x larger dots for complete sphere
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
                    
                    // Dark grey color
                    gl_FragColor = vec4(0.25, 0.25, 0.25, 1.0);
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
            this.sizes2[i] = 0.12; // 3x larger dots
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
            this.sizes3[i] = 0.12; // 3x larger dots
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
        // Create a DOM element for the interstellar prompt (above time controls)
        this.completionSign = document.createElement('div');
        this.completionSign.className = 'dyson-interstellar-prompt';
        this.completionSign.innerHTML = '<span class="prompt-icon">🌟</span> Dyson complete! Press <kbd>I</kbd> to see interstellar map';
        this.completionSign.style.display = 'none';

        // Insert above time controls
        const timeControls = document.getElementById('time-controls');
        if (timeControls && timeControls.parentNode) {
            timeControls.parentNode.insertBefore(this.completionSign, timeControls);
        } else {
            document.getElementById('app').appendChild(this.completionSign);
        }
    }
    
    // Get Dyson orbit radius - just inside Mercury's orbit
    getDysonOrbitRadius() {
        if (!this.solarSystem) {
            return 2.0; // Fallback
        }
        try {
            // Use the stored dyson orbit radius from solar system (set in createDysonOrbit)
            if (this.solarSystem.dysonOrbitRadius) {
                return this.solarSystem.dysonOrbitRadius;
            }
            // Fallback: Dyson sphere at 0.29 AU
            if (this.solarSystem.scaleAUToVisual) {
                return this.solarSystem.scaleAUToVisual(0.29);
            }
            return 2.0;
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
     * Calculate visible particle count using linear interpolation
     * Particle count is linearly proportional to completion percentage
     * - 0% complete → 0 particles
     * - 100% complete → maxTotalParticles
     */
    calculateVisibleCount(currentMass) {
        if (currentMass <= 0) {
            return 0;
        }
        
        // Linear interpolation: particles = (currentMass / targetMass) * maxParticles
        const completion = Math.min(1.0, currentMass / this.targetMass);
        const particleCount = Math.floor(completion * this.maxTotalParticles);
        
        return particleCount;
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
        
        // Golden angle for even spherical distribution (avoids polar clustering)
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));

        for (let ringIndex = 0; ringIndex < this.numOrbitalRings; ringIndex++) {
            const particleCount = this.ringParticleCounts[ringIndex];
            if (particleCount === 0) continue;

            // Use golden angle distribution for even coverage
            // phi ranges from 0 to π (equator to poles, evenly distributed)
            const t = ringIndex / this.numOrbitalRings;
            const phi = Math.acos(1 - 2 * t);  // Even distribution on sphere

            // Golden angle offset for ring azimuth (prevents alignment)
            const ringAzimuthOffset = ringIndex * goldenAngle;

            // Assign this ring to one of the altitudes using a pattern
            const altitudeIndex = ringIndex % this.numAltitudes;
            const altitudeMultiplier = this.altitudeMultipliers[altitudeIndex];
            const ringRadius = orbitRadius * altitudeMultiplier;
            
            for (let i = 0; i < particleCount; i++) {
                // Distribute particles evenly around the ring with golden angle offset
                const angle = (i / particleCount) * Math.PI * 2 + ringAzimuthOffset;
                
                // Slight speed variation for visual interest
                const speedVariation = 0.9 + Math.random() * 0.2;
                const orbitalSpeed = baseOrbitalSpeed * speedVariation;
                
                const particleData = {
                    ringIndex: ringIndex,
                    phi: phi,
                    angle: angle,
                    orbitalSpeed: orbitalSpeed,
                    size: 0.105 + Math.random() * 0.045, // 3x larger dots (was 0.035 + 0.015)
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
