/**
 * Star Map Galaxy Visuals Mixin
 *
 * Creates the Milky Way galaxy background - spiral arms, central bar,
 * dust lanes, nebulae, and stellar halo.
 *
 * This file must be loaded AFTER star_map.js
 */

Object.assign(StarMapVisualization.prototype, {

    /**
     * Create an IMMERSIVE Milky Way galaxy view
     *
     * You are INSIDE the galaxy. Sol is one star among hundreds of billions.
     * Accurate barred spiral structure based on astronomical data.
     *
     * References:
     * - https://www.astronomy.com/science/astronomers-update-our-galaxys-structure/
     * - https://galaxymap.org/drupal/node/171
     * - Sun at 8.35 kpc from center, rotation ~240 km/s
     * - 2 major arms (Scutum-Centaurus, Perseus) + 2 minor (Norma, Sagittarius)
     * - Central bar: 5 kpc × 1.5 kpc, inclined ~30°
     */
    createMilkyWayBackground() {
        // Scale: 1 unit = 100 parsecs = 326 light years
        // Milky Way disk radius: ~25-30 kpc, we use 25 kpc = 250 units
        // Full halo extends to ~100 kpc = 1000 units
        // Sun at 8.35 kpc = 83.5 units from center
        this.galaxyRadius = 400;      // 40 kpc - larger disk for more dramatic scale
        this.solDistance = 83.5;      // 8.35 kpc - unchanged (accurate)
        this.barLength = 60;          // 6 kpc - slightly larger bar
        this.barWidth = 18;           // 1.8 kpc - scaled bar

        // Sol's position in the Orion Spur (between Sagittarius and Perseus arms)
        // Angle from galactic center toward anticenter
        this.solAngle = Math.PI * 0.6;  // Roughly toward constellation Cygnus
        this.solPosition = {
            x: Math.cos(this.solAngle) * this.solDistance,
            y: 0,
            z: Math.sin(this.solAngle) * this.solDistance
        };

        // Create main galaxy group that will rotate
        this.galaxyGroup = new THREE.Group();

        // Build galaxy components - order matters for rendering
        this.createCentralBar();
        this.createCentralBulge();
        this.createSpiralArms();
        this.createDustLanes();           // Dark dust lanes in spiral arms
        this.createVolumetricNebulae();   // Glowing emission nebulae
        this.createInterarmStars();
        this.createOuterHalo();

        // Mark Sol's position - YOUR location in this vast galaxy
        this.createSolMarker();

        // Start camera following Sol
        if (this.solMesh) {
            this.followTarget = this.solMesh;
            this.cameraOffset = new THREE.Vector3(5, 10, 25);
        }

        // Initialize the colonization frontier system
        this.initColonizationSystem();

        this.scene.add(this.galaxyGroup);
    },

    /**
     * Create the central bar of the barred spiral
     */
    createCentralBar() {
        const barStars = 25000;  // Increased for larger galaxy
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(barStars * 3);
        const colors = new Float32Array(barStars * 3);

        const barAngle = Math.PI / 6;  // 30 degree inclination
        const color = new THREE.Color();

        for (let i = 0; i < barStars; i++) {
            // Elongated ellipsoid distribution
            const u = (Math.random() - 0.5) * 2;
            const v = (Math.random() - 0.5) * 2;
            const w = (Math.random() - 0.5) * 2;

            // Bar shape: long in one axis
            let x = u * this.barLength * 0.5;
            let z = v * this.barWidth * 0.5;
            let y = w * this.barWidth * 0.3;

            // Rotate by bar angle
            const rotX = x * Math.cos(barAngle) - z * Math.sin(barAngle);
            const rotZ = x * Math.sin(barAngle) + z * Math.cos(barAngle);

            // Density falls off from center
            const r = Math.sqrt(x*x + z*z + y*y);
            if (Math.random() > Math.exp(-r / 20)) continue;

            positions[i * 3] = rotX;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = rotZ;

            // Old stars in bar - subtle warm cream/pale yellow, not saturated
            color.setHSL(0.1 + Math.random() * 0.05, 0.15 + Math.random() * 0.15, 0.45 + Math.random() * 0.35);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.6,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending
        });

        const bar = new THREE.Points(geometry, material);
        this.galaxyGroup.add(bar);
    },

    /**
     * Create the central bulge using oblate Gaussian distribution
     * Stars density falls off gracefully using Gaussian function
     */
    createCentralBulge() {
        const bulgeStars = 8000;  // Reduced significantly for performance
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(bulgeStars * 3);
        const colors = new Float32Array(bulgeStars * 3);

        const color = new THREE.Color();

        // Oblate Gaussian parameters
        // σ_radial = 12 units (1.2 kpc scale length in disk plane)
        // σ_vertical = 6 units (0.6 kpc scale height - flattened)
        const sigmaRadial = 12;
        const sigmaVertical = 6;

        let starIndex = 0;
        let attempts = 0;
        const maxAttempts = bulgeStars * 3;

        while (starIndex < bulgeStars && attempts < maxAttempts) {
            attempts++;

            // Box-Muller transform for Gaussian random numbers
            const u1 = Math.random();
            const u2 = Math.random();
            const u3 = Math.random();
            const u4 = Math.random();

            // Generate Gaussian-distributed coordinates
            const gx = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigmaRadial;
            const gz = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2) * sigmaRadial;
            const gy = Math.sqrt(-2 * Math.log(u3)) * Math.cos(2 * Math.PI * u4) * sigmaVertical;

            // Calculate effective radius for color/brightness
            const r = Math.sqrt(gx * gx + gz * gz + gy * gy);

            // Soft cutoff - reject stars too far out (but allows gradual fade)
            if (r > 40) continue;

            positions[starIndex * 3] = gx;
            positions[starIndex * 3 + 1] = gy;
            positions[starIndex * 3 + 2] = gz;

            // Core stars - warm white/cream, brightness falls off with Gaussian profile
            const gaussianFalloff = Math.exp(-r * r / (2 * sigmaRadial * sigmaRadial));
            const brightness = 0.35 + gaussianFalloff * 0.5;
            color.setHSL(0.1 + Math.random() * 0.04, 0.1 + Math.random() * 0.08, brightness);
            colors[starIndex * 3] = color.r;
            colors[starIndex * 3 + 1] = color.g;
            colors[starIndex * 3 + 2] = color.b;

            starIndex++;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.4,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending
        });

        const bulge = new THREE.Points(geometry, material);
        this.galaxyGroup.add(bulge);

        // Add dramatic dust clouds around the core
        this.createCoreDustClouds();
    },

    /**
     * Create dramatic dust clouds around the galactic core
     * These obscure parts of the bulge for a more realistic look
     */
    createCoreDustClouds() {
        const dustCount = 15000;  // Reduced for clarity
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(dustCount * 3);
        const colors = new Float32Array(dustCount * 3);

        const color = new THREE.Color();

        for (let i = 0; i < dustCount; i++) {
            // Dust concentrated in a torus around the core
            const theta = Math.random() * Math.PI * 2;

            // Ring-like distribution at 8-25 units from center
            const ringRadius = 8 + Math.random() * 17;
            const spread = 5 + Math.random() * 8;

            // Add some randomness to create cloud structures
            const cloudOffset = Math.sin(theta * 3 + i * 0.01) * 3;

            const r = ringRadius + (Math.random() - 0.5) * spread + cloudOffset;
            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);

            // Very thin in vertical - dust settles to disk plane
            const y = (Math.random() - 0.5) * (Math.random() - 0.5) * 4;

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            // Dark dust - near black with very slight warm tint
            color.setHSL(0.08, 0.15, 0.02 + Math.random() * 0.03);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 2.0,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.7,
            blending: THREE.NormalBlending,
            depthWrite: false
        });

        const coreDust = new THREE.Points(geometry, material);
        this.galaxyGroup.add(coreDust);

        // Add additional dust layers at different radii
        this.createDustLayer(5, 15, 20000, 0.6);   // Inner dust ring
        this.createDustLayer(15, 30, 25000, 0.5);  // Middle dust ring
        this.createDustLayer(30, 50, 20000, 0.4);  // Outer dust ring
    },

    /**
     * Create a dust layer at specified radius range
     */
    createDustLayer(innerRadius, outerRadius, particleCount, opacity) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const color = new THREE.Color();

        for (let i = 0; i < particleCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const r = innerRadius + Math.random() * (outerRadius - innerRadius);

            // Add some structure with spiral influence
            const spiralOffset = Math.sin(theta * 2 + r * 0.1) * 3;
            const finalR = r + spiralOffset;

            const x = finalR * Math.cos(theta);
            const z = finalR * Math.sin(theta);
            const y = (Math.random() - 0.5) * (Math.random() - 0.5) * 3;

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            // Dark reddish-brown dust
            color.setHSL(0.05 + Math.random() * 0.05, 0.2, 0.02 + Math.random() * 0.02);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.5,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: opacity,
            blending: THREE.NormalBlending,
            depthWrite: false
        });

        const dustLayer = new THREE.Points(geometry, material);
        this.galaxyGroup.add(dustLayer);
    },

    /**
     * Create the spiral arms with proper structure
     * 2 major arms + 2 minor arms
     */
    createSpiralArms() {
        // Arm definitions: [startAngle, pitchAngle (degrees), strength, name]
        const arms = [
            { start: 0, pitch: 12, strength: 1.0, name: 'Scutum-Centaurus' },      // Major
            { start: Math.PI, pitch: 12, strength: 1.0, name: 'Perseus' },          // Major
            { start: Math.PI / 2, pitch: 14, strength: 0.6, name: 'Sagittarius' },  // Minor
            { start: -Math.PI / 2, pitch: 14, strength: 0.6, name: 'Norma' },       // Minor
        ];

        const starsPerArm = 100000;  // ~400k total dots spread across 4 arms - larger galaxy
        const totalStars = starsPerArm * arms.length;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(totalStars * 3);
        const colors = new Float32Array(totalStars * 3);

        const color = new THREE.Color();
        let starIndex = 0;

        for (const arm of arms) {
            const pitchRad = arm.pitch * Math.PI / 180;
            const tanPitch = Math.tan(pitchRad);

            for (let i = 0; i < starsPerArm * arm.strength; i++) {
                // Distance from center (arms start at end of bar)
                // Use exponential falloff for diffuse edges - no hard boundary
                const t = Math.random();
                const baseR = this.barLength * 0.4 + Math.pow(t, 0.5) * (this.galaxyRadius * 0.8 - this.barLength * 0.4);
                // Add scatter that increases toward edge for diffuse boundary
                const edgeScatter = (baseR / this.galaxyRadius) * Math.random() * this.galaxyRadius * 0.4;
                const r = baseR + edgeScatter * Math.pow(Math.random(), 2);

                // Logarithmic spiral: θ = ln(r/a) / tan(pitch)
                const spiralTheta = Math.log(r / (this.barLength * 0.4) + 0.1) / tanPitch;
                const baseAngle = arm.start + spiralTheta;

                // Arm width increases with radius - much more diffuse for realism
                // Real spiral arms are fuzzy, not sharp lines
                const armWidth = 0.25 + 0.2 * (r / this.galaxyRadius);
                const spread = (Math.random() + Math.random() + Math.random() - 1.5) * armWidth * 1.5;

                const angle = baseAngle + spread;
                const x = r * Math.cos(angle);
                const z = r * Math.sin(angle);

                // Disc with realistic thickness - thicker in center, thins at edge
                const discHeight = 4 + 3 * Math.exp(-r / 120);
                const y = (Math.random() - 0.5) * (Math.random() - 0.5) * discHeight;  // Gaussian-like

                positions[starIndex * 3] = x;
                positions[starIndex * 3 + 1] = y;
                positions[starIndex * 3 + 2] = z;

                // Realistic galaxy colors: mostly white/grey with subtle warmth
                // Real galaxies appear white/cream colored, not colorful
                const starType = Math.random();
                if (starType < 0.7) {
                    // Majority: white/grey stars (low saturation)
                    color.setHSL(0.1, 0.05 + Math.random() * 0.1, 0.4 + Math.random() * 0.4);
                } else if (starType < 0.9) {
                    // Some: warm cream/pale yellow
                    color.setHSL(0.12 + Math.random() * 0.05, 0.15 + Math.random() * 0.1, 0.5 + Math.random() * 0.3);
                } else {
                    // Few: slightly blue-white (hot stars)
                    color.setHSL(0.6, 0.1 + Math.random() * 0.1, 0.6 + Math.random() * 0.3);
                }

                colors[starIndex * 3] = color.r;
                colors[starIndex * 3 + 1] = color.g;
                colors[starIndex * 3 + 2] = color.b;

                starIndex++;
            }
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.4,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending
        });

        const spiralArms = new THREE.Points(geometry, material);
        this.galaxyGroup.add(spiralArms);

        // Store a sample of star positions as colonization targets
        this.buildColonizationTargets(positions, starIndex);
    },

    /**
     * Build array of colonizable star positions from spiral arm geometry
     * These are the actual galaxy stars that can be colonized
     */
    buildColonizationTargets(positions, totalStars) {
        this.colonizationTargets = [];
        this.allStarPositions = positions;
        this.totalStars = totalStars;
        this.explorationRadius = 0;

        console.log(`[StarMap] buildColonizationTargets: ${totalStars} stars from galaxy`);

        // Minimum distance from Sol (100 ly = 100/326 units)
        const minDistFromSol = 100 / 326;
        const solX = this.solPosition?.x || 0;
        const solY = this.solPosition?.y || 0;
        const solZ = this.solPosition?.z || 0;

        // EVERY dot is a colonizable star - no sampling
        let nanCount = 0;
        let zeroCount = 0;
        let tooCloseCount = 0;

        for (let i = 0; i < totalStars; i++) {
            const x = positions[i * 3];
            const y = positions[i * 3 + 1];
            const z = positions[i * 3 + 2];

            // Skip invalid positions
            if (isNaN(x) || isNaN(y) || isNaN(z)) {
                nanCount++;
                continue;
            }
            if (x === 0 && y === 0 && z === 0) {
                zeroCount++;
                continue;
            }

            // Skip stars too close to Sol (within 100 ly)
            const dx = x - solX;
            const dy = y - solY;
            const dz = z - solZ;
            const distFromSol = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (distFromSol < minDistFromSol) {
                tooCloseCount++;
                continue;
            }

            this.colonizationTargets.push({
                x: x,
                y: y,
                z: z,
                colonized: false,
                dysonProgress: 0,
                spectralClass: this.getRandomSpectralType()
            });
        }

        console.log(`[StarMap] ${this.colonizationTargets.length} colonizable stars (skipped ${nanCount} NaN, ${zeroCount} zero, ${tooCloseCount} too close to Sol)`);
    },

    /**
     * Add additional colonization targets (nebulae, white dwarfs, etc.)
     * Called after creating additional galaxy features
     */
    addColonizationTargets(positions, count, spectralClass = 'M') {
        if (!this.colonizationTargets) {
            this.colonizationTargets = [];
        }

        let added = 0;
        for (let i = 0; i < count; i++) {
            const x = positions[i * 3];
            const y = positions[i * 3 + 1];
            const z = positions[i * 3 + 2];

            // Skip invalid positions
            if (isNaN(x) || isNaN(y) || isNaN(z)) continue;
            if (x === 0 && y === 0 && z === 0) continue;

            this.colonizationTargets.push({
                x: x,
                y: y,
                z: z,
                colonized: false,
                dysonProgress: 0,
                spectralClass: spectralClass
            });
            added++;
        }

        console.log(`[StarMap] Added ${added} ${spectralClass}-type colonization targets`);
    },

    /**
     * Update exploration radius based on furthest colonized star
     */
    updateExplorationRadius() {
        let maxDist = 0;
        const solPos = this.solPosition || new THREE.Vector3(0, 0, 0);

        for (const star of this.colonizedStars) {
            const dist = star.position.distanceTo(solPos);
            if (dist > maxDist) maxDist = dist;
        }

        this.explorationRadius = maxDist;
        return maxDist;
    },

    /**
     * Generate new POAs near the exploration frontier
     * Called periodically as empire expands
     */
    generateFrontierPOAs() {
        if (!this.allStarPositions || !this.solPosition) return;

        // Remove colonized targets from the list
        this.colonizationTargets = this.colonizationTargets.filter(t => !t.colonized);

        // Count how many we need to add
        const spotsAvailable = this.maxVisiblePOAs - this.colonizationTargets.length;
        if (spotsAvailable <= 0) return;

        // Find stars near the frontier (1.2x to 2x exploration radius)
        const frontierMin = this.explorationRadius * 1.2;
        const frontierMax = this.explorationRadius * 2.0;
        const solPos = this.solPosition;

        // Get all existing POA positions for distance checking
        // This ensures new POAs fill gaps rather than clustering
        const existingPOAPositions = [
            ...this.pointsOfAttraction.map(p => p.position),
            ...this.colonizationTargets.map(t => ({ x: t.x, y: t.y, z: t.z }))
        ];

        // Minimum distance from any existing POA (in units, ~5 units = 1600 ly)
        const minPOADistance = 5;

        // Sample random stars near frontier
        const newTargets = [];
        const maxAttempts = spotsAvailable * 20;  // Try 20x the needed count

        for (let attempt = 0; attempt < maxAttempts && newTargets.length < Math.min(spotsAvailable, 20); attempt++) {
            // Random star index
            const i = Math.floor(Math.random() * this.totalStars);

            const x = this.allStarPositions[i * 3];
            const y = this.allStarPositions[i * 3 + 1];
            const z = this.allStarPositions[i * 3 + 2];

            // Skip invalid positions
            if (isNaN(x) || (x === 0 && y === 0 && z === 0)) continue;

            // Check distance from Sol
            const dx = x - solPos.x;
            const dy = y - solPos.y;
            const dz = z - solPos.z;
            const distFromSol = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // Only add if in frontier zone (from Sol's perspective)
            if (distFromSol >= frontierMin && distFromSol <= frontierMax) {
                // Check distance to nearest existing POA - fills gaps in coverage
                let minDistToPOA = Infinity;
                for (const pos of existingPOAPositions) {
                    const pdx = x - pos.x;
                    const pdy = y - pos.y;
                    const pdz = z - pos.z;
                    const distToPOA = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);
                    if (distToPOA < minDistToPOA) {
                        minDistToPOA = distToPOA;
                    }
                }

                // Also check distance to already-selected new targets
                for (const t of newTargets) {
                    const tdx = x - t.x;
                    const tdy = y - t.y;
                    const tdz = z - t.z;
                    const distToNew = Math.sqrt(tdx * tdx + tdy * tdy + tdz * tdz);
                    if (distToNew < minDistToPOA) {
                        minDistToPOA = distToNew;
                    }
                }

                // Only add if sufficiently far from other POAs (prevents clustering)
                if (minDistToPOA >= minPOADistance) {
                    // Check not already in targets (exact duplicate)
                    const alreadyExists = this.colonizationTargets.some(t =>
                        Math.abs(t.x - x) < 0.1 && Math.abs(t.y - y) < 0.1 && Math.abs(t.z - z) < 0.1
                    );

                    if (!alreadyExists) {
                        newTargets.push({
                            x: x,
                            y: y,
                            z: z,
                            colonized: false,
                            dysonProgress: 0,
                            spectralClass: this.getRandomSpectralType(),
                            frontierGenerated: true  // Mark as dynamically generated
                        });

                        // Add to existing positions for next iteration's distance check
                        existingPOAPositions.push({ x, y, z });
                    }
                }
            }
        }

        // Add new targets
        for (const target of newTargets) {
            this.colonizationTargets.push(target);
        }

        if (newTargets.length > 0) {
            console.log(`[StarMap] Generated ${newTargets.length} new frontier POAs (total: ${this.colonizationTargets.length})`);
        }
    },

    /**
     * Find nearest uncolonized star within hop distance.
     * Simple algorithm: find closest available target within range.
     */
    findNearestUncolonizedStar(fromX, fromY, fromZ, maxDistance = 200) {
        // Hop distance from slider (0-100) -> 100 ly to 10,000 ly
        const hopFactor = (this.hopDistancePolicy || 50) / 100;
        const hopDistanceLY = 100 + hopFactor * 9900;  // 100 ly to 10,000 ly
        const hopDistanceUnits = hopDistanceLY / 326;  // Convert to coordinate units

        // Search radius: 2x hop distance, minimum 5 units (~1600 ly)
        const searchRadius = Math.max(hopDistanceUnits * 2, 5);

        // Exploit/Explore slider (0=Exploit nearest, 100=Explore at step distance)
        const exploreChance = (this.expandPolicy || 50) / 100;
        const isExploring = Math.random() < exploreChance;

        let bestTarget = null;
        let bestDist = Infinity;
        let exploreTarget = null;
        let exploreBestDiff = Infinity;

        // Target distance for explore mode: hop distance ± 10%
        const exploreMinDist = hopDistanceUnits * 0.9;
        const exploreMaxDist = hopDistanceUnits * 1.1;

        for (const target of this.colonizationTargets) {
            if (target.colonized || target.status === 'fleet_sent') continue;

            const dx = target.x - fromX;
            const dy = target.y - fromY;
            const dz = target.z - fromZ;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // Skip targets too close (same star) or too far
            if (dist < 0.001 || dist > searchRadius) continue;

            // Track nearest for exploit mode (always)
            if (dist < bestDist) {
                bestDist = dist;
                bestTarget = target;
            }

            // Track best explore target (closest to ideal hop distance)
            if (dist >= exploreMinDist && dist <= exploreMaxDist) {
                const diff = Math.abs(dist - hopDistanceUnits);
                if (diff < exploreBestDiff) {
                    exploreBestDiff = diff;
                    exploreTarget = target;
                }
            }
        }

        // Return explore target if exploring and found one, otherwise nearest
        if (isExploring && exploreTarget) {
            return exploreTarget;
        }
        return bestTarget;
    },

    /**
     * Get active colonization corridors from a launch position
     * Returns normalized direction vectors towards each queued target
     */
    getActiveCorridors(fromX, fromY, fromZ) {
        const corridors = [];

        for (let i = 0; i < this.targetQueue.length; i++) {
            const entry = this.targetQueue[i];
            if (!entry || entry.target?.colonized) continue;

            const dx = entry.x - fromX;
            const dy = entry.y - fromY;
            const dz = entry.z - fromZ;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist > 0.1) {  // Avoid division by zero
                corridors.push({
                    id: entry.id,
                    name: entry.name,
                    dirX: dx / dist,
                    dirY: dy / dist,
                    dirZ: dz / dist,
                    distance: dist,
                    // Higher priority for earlier queue positions
                    priority: 1 - (i / Math.max(1, this.targetQueue.length)) * 0.5
                });
            }
        }

        return corridors;
    },

    /**
     * Get current average hop distance in kly (for display)
     */
    getAverageHopDistanceLY() {
        const hopFactor = (this.hopDistancePolicy || 58) / 100;
        // Log scale: 10 ly to 100k ly
        const minLogHop = 1;   // log10(10 ly)
        const maxLogHop = 5;   // log10(100000 ly)
        const logHop = minLogHop + (maxLogHop - minLogHop) * hopFactor;
        return Math.pow(10, logHop);
    },

    getAverageHopDistanceDisplay() {
        const ly = this.getAverageHopDistanceLY();
        if (ly >= 1000) {
            return `${(ly / 1000).toFixed(1)}k`;
        } else {
            return Math.round(ly).toString();
        }
    },

    /**
     * Create the inter-arm stellar population
     */
    createInterarmStars() {
        const interarmStars = 300000;  // Large inter-arm population for bigger galaxy
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(interarmStars * 3);
        const colors = new Float32Array(interarmStars * 3);

        const color = new THREE.Color();

        for (let i = 0; i < interarmStars; i++) {
            // Exponential disc distribution
            const r = 20 + Math.pow(Math.random(), 0.7) * (this.galaxyRadius - 20);
            const theta = Math.random() * Math.PI * 2;

            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);

            // Disc thickness - more spread vertically
            const discHeight = 3 + 2 * Math.exp(-r / 120);
            const y = (Math.random() - 0.5) * (Math.random() - 0.5) * discHeight;

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            // Dimmer stars between arms - grey/white, very low saturation
            color.setHSL(0.1, 0.05 + Math.random() * 0.08, 0.2 + Math.random() * 0.2);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.25,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending
        });

        const interarm = new THREE.Points(geometry, material);
        this.galaxyGroup.add(interarm);

        // Add interarm stars as white dwarf colonization targets
        this.addColonizationTargets(positions, interarmStars, 'D');  // D = white Dwarf
    },

    /**
     * Create the outer stellar halo
     */
    createOuterHalo() {
        // The stellar halo extends to ~100 kpc (1000 units) in reality
        // Contains old Population II stars, globular clusters
        const haloStars = 60000;  // Large halo for bigger galaxy
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(haloStars * 3);
        const colors = new Float32Array(haloStars * 3);

        const color = new THREE.Color();

        for (let i = 0; i < haloStars; i++) {
            // Spherical halo - extends far beyond disk
            // Density falls off as r^-3.5 in real halo
            const r = 50 + Math.pow(Math.random(), 0.25) * 600;  // Extends to ~650 units (65 kpc)
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);

            // Old, metal-poor halo stars - very dim grey/white
            color.setHSL(0.1, 0.03 + Math.random() * 0.05, 0.12 + Math.random() * 0.12);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.2,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });

        const halo = new THREE.Points(geometry, material);
        this.galaxyGroup.add(halo);
    },

    /**
     * Create dust lanes and nebulae throughout the galaxy
     * These add depth and realism to the spiral arms
     */
    createDustLanes() {
        const dustCount = 120000;  // Large dust lanes for bigger galaxy
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(dustCount * 3);
        const colors = new Float32Array(dustCount * 3);
        const sizes = new Float32Array(dustCount);

        const color = new THREE.Color();

        for (let i = 0; i < dustCount; i++) {
            // Follow spiral arm structure but offset
            const t = Math.random();
            const r = this.barLength * 0.5 + Math.pow(t, 0.6) * (this.galaxyRadius * 0.8);

            // Random arm
            const armIndex = Math.floor(Math.random() * 4);
            const armStart = [0, Math.PI, Math.PI / 2, -Math.PI / 2][armIndex];
            const pitch = [12, 12, 14, 14][armIndex] * Math.PI / 180;
            const tanPitch = Math.tan(pitch);

            const spiralTheta = Math.log(r / (this.barLength * 0.4) + 0.1) / tanPitch;
            const baseAngle = armStart + spiralTheta;

            // Dust sits in lanes along arms
            const laneOffset = (Math.random() - 0.5) * 0.08;
            const angle = baseAngle + laneOffset;

            const x = r * Math.cos(angle);
            const z = r * Math.sin(angle);
            const y = (Math.random() - 0.5) * 2 * Math.exp(-r / 180);

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            // Dark dust - near black, very subtle warmth
            color.setHSL(0.08, 0.1 + Math.random() * 0.1, 0.03 + Math.random() * 0.05);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;

            sizes[i] = 1 + Math.random() * 2;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            size: 1.5,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.4,
            blending: THREE.NormalBlending,
            depthWrite: false
        });

        const dustLanes = new THREE.Points(geometry, material);
        this.galaxyGroup.add(dustLanes);
    },

    /**
     * Create volumetric emission nebulae - glowing gas clouds
     * These are the colorful star-forming regions like Orion, Carina, etc.
     */
    createVolumetricNebulae() {
        // Major nebulae scattered through spiral arms
        const nebulaCount = 200;  // More nebulae for bigger galaxy
        this.nebulae = [];

        // Collect nebula center positions for colonization targets
        const nebulaCenters = new Float32Array(nebulaCount * 3);

        for (let i = 0; i < nebulaCount; i++) {
            // Position in spiral arms
            const t = Math.random();
            const r = 20 + Math.pow(t, 0.5) * (this.galaxyRadius - 20);

            // Random arm
            const armIndex = Math.floor(Math.random() * 4);
            const armStart = [0, Math.PI, Math.PI / 2, -Math.PI / 2][armIndex];
            const pitch = [12, 12, 14, 14][armIndex] * Math.PI / 180;
            const tanPitch = Math.tan(pitch);

            const spiralTheta = Math.log(r / (this.barLength * 0.4) + 0.1) / tanPitch;
            const baseAngle = armStart + spiralTheta + (Math.random() - 0.5) * 0.3;

            const x = r * Math.cos(baseAngle);
            const z = r * Math.sin(baseAngle);
            const y = (Math.random() - 0.5) * 3;

            // Store nebula center for colonization targets
            nebulaCenters[i * 3] = x;
            nebulaCenters[i * 3 + 1] = y;
            nebulaCenters[i * 3 + 2] = z;

            // Create nebula as a cluster of glowing particles
            const nebulaSize = 3 + Math.random() * 8;
            const particleCount = 200 + Math.floor(Math.random() * 300);
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(particleCount * 3);
            const colors = new Float32Array(particleCount * 3);

            // Realistic nebula colors - mostly dark grey/black dust clouds
            // Real nebulae appear as dark patches against star field, not glowing
            const nebulaTypes = [
                { h: 0.1, s: 0.05, l: 0.08 },  // Dark grey dust
                { h: 0.1, s: 0.08, l: 0.1 },   // Slightly lighter grey
                { h: 0.08, s: 0.1, l: 0.12 },  // Warm grey (faint)
                { h: 0.0, s: 0.05, l: 0.06 },  // Near black
                { h: 0.12, s: 0.12, l: 0.15 }  // Very faint warm tint
            ];
            const nebulaType = nebulaTypes[Math.floor(Math.random() * nebulaTypes.length)];
            const color = new THREE.Color();

            for (let j = 0; j < particleCount; j++) {
                // Irregular cloud shape
                const pr = Math.pow(Math.random(), 0.5) * nebulaSize;
                const ptheta = Math.random() * Math.PI * 2;
                const pphi = Math.acos(2 * Math.random() - 1);

                // Add some turbulence
                const turbulence = Math.sin(ptheta * 3) * Math.cos(pphi * 2) * 0.3;

                positions[j * 3] = x + pr * Math.sin(pphi) * Math.cos(ptheta) * (1 + turbulence);
                positions[j * 3 + 1] = y + pr * Math.sin(pphi) * Math.sin(ptheta) * 0.4;  // Flatten
                positions[j * 3 + 2] = z + pr * Math.cos(pphi) * (1 + turbulence);

                // Vary color slightly within nebula
                color.setHSL(
                    nebulaType.h + (Math.random() - 0.5) * 0.1,
                    nebulaType.s + (Math.random() - 0.5) * 0.2,
                    nebulaType.l + (Math.random() - 0.5) * 0.15
                );
                colors[j * 3] = color.r;
                colors[j * 3 + 1] = color.g;
                colors[j * 3 + 2] = color.b;
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

            const material = new THREE.PointsMaterial({
                size: 1.5,
                sizeAttenuation: true,
                vertexColors: true,
                transparent: true,
                opacity: 0.5,
                blending: THREE.NormalBlending,  // Normal blend for dark dust clouds
                depthWrite: false
            });

            const nebula = new THREE.Points(geometry, material);
            nebula.userData = {
                baseOpacity: 0.5,
                pulseSpeed: 0,  // No pulsing for realistic dust
                pulsePhase: 0
            };
            this.nebulae.push(nebula);
            this.galaxyGroup.add(nebula);
        }

        // Add nebula centers as colonization targets
        this.addColonizationTargets(nebulaCenters, nebulaCount, 'N');  // N = Nebula
    }

});
