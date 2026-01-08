/**
 * Star Map External Objects Mixin
 *
 * Contains methods for creating distant galaxies, Messier objects,
 * deep sky POAs, Sol marker, sphere of influence, and background visuals.
 *
 * This file must be loaded AFTER star_map.js
 */
Object.assign(StarMapVisualization.prototype, {
    /**
     * Create distant galaxies as extragalactic background
     * These are far away and give depth to the universe
     */
    createDistantGalaxies() {
        // Distant point-like galaxies
        const galaxyCount = 500;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(galaxyCount * 3);
        const colors = new Float32Array(galaxyCount * 3);

        const color = new THREE.Color();

        for (let i = 0; i < galaxyCount; i++) {
            // Spherical distribution very far away
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 800 + Math.random() * 800;  // Much further out for larger galaxy scale

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);

            // Distant galaxies appear as faint fuzzy points
            const galaxyType = Math.random();
            if (galaxyType < 0.3) {
                // Elliptical - yellowish
                color.setHSL(0.12, 0.4, 0.15 + Math.random() * 0.1);
            } else if (galaxyType < 0.8) {
                // Spiral - bluish white
                color.setHSL(0.6, 0.3, 0.12 + Math.random() * 0.1);
            } else {
                // Irregular/starburst - pinkish
                color.setHSL(0.9, 0.5, 0.15 + Math.random() * 0.1);
            }

            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 3,
            sizeAttenuation: false,
            vertexColors: true,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending
        });

        const distantGalaxies = new THREE.Points(geometry, material);
        this.scene.add(distantGalaxies);  // Add to scene, not galaxyGroup (doesn't rotate with our galaxy)

        // Add Magellanic Clouds - satellite galaxies of the Milky Way
        this.createMagellanicClouds();

        // Add Andromeda Galaxy (M31) - visible as a small spiral
        this.createAndromedaGalaxy();

        // Add Messier objects (clusters and nebulae visible from Earth)
        this.createMessierObjects();

        // Major star systems disabled - using POA labels instead
        // this.createMajorStarSystems();
    },

    /**
     * Create the Magellanic Clouds - satellite dwarf galaxies of the Milky Way
     * These are real irregular galaxies that orbit our galaxy
     * LMC: ~160,000 ly away, ~30 billion stars, has a bar structure
     * SMC: ~200,000 ly away, ~3 billion stars, more irregular
     */
    createMagellanicClouds() {
        // Store for orbital animation
        this.magellanicClouds = [];

        // Large Magellanic Cloud (LMC) - largest satellite galaxy
        const lmc = this.createMagellanicCloud({
            name: 'LMC',
            fullName: 'Large Magellanic Cloud',
            distance: 160,
            angle: Math.PI * 1.3,
            inclination: -0.55,
            starCount: 8000,      // More stars for detail
            dustCount: 2000,      // Dust lanes
            size: 25,
            hasBar: true,         // LMC has a prominent bar
            orbitalPeriod: 1500,  // Orbital period in Myr (scaled for animation)
            tilt: 0.6             // Inclination of the galaxy plane
        });
        this.magellanicClouds.push(lmc);

        // Small Magellanic Cloud (SMC)
        const smc = this.createMagellanicCloud({
            name: 'SMC',
            fullName: 'Small Magellanic Cloud',
            distance: 200,
            angle: Math.PI * 1.5,
            inclination: -0.65,
            starCount: 4000,
            dustCount: 800,
            size: 15,
            hasBar: false,        // SMC is more irregular
            orbitalPeriod: 2000,
            tilt: 0.8
        });
        this.magellanicClouds.push(smc);

        // Create the Magellanic Stream - gas bridge between LMC, SMC and Milky Way
        this.createMagellanicStream(lmc, smc);
    },

    /**
     * Create a single Magellanic Cloud with accurate structure
     */
    createMagellanicCloud(config) {
        const cloudGroup = new THREE.Group();
        cloudGroup.userData = {
            name: config.name,
            fullName: config.fullName,
            distance: config.distance,
            baseAngle: config.angle,
            orbitalPeriod: config.orbitalPeriod,
            inclination: config.inclination
        };

        // Initial position
        cloudGroup.position.set(
            Math.cos(config.angle) * config.distance,
            Math.sin(config.inclination) * config.distance * 0.3,
            Math.sin(config.angle) * config.distance
        );

        // Tilt the galaxy plane
        cloudGroup.rotation.x = config.tilt;
        cloudGroup.rotation.z = Math.random() * 0.3;

        // === STELLAR COMPONENT ===
        const starGeometry = new THREE.BufferGeometry();
        const starPositions = new Float32Array(config.starCount * 3);
        const starColors = new Float32Array(config.starCount * 3);
        const color = new THREE.Color();

        for (let i = 0; i < config.starCount; i++) {
            // Irregular galaxy distribution with optional bar
            const t = Math.random();
            let r = Math.pow(t, 0.5) * config.size;

            const theta = Math.random() * Math.PI * 2;

            // Bar structure for LMC
            let barStretch = 1;
            if (config.hasBar) {
                barStretch = 1 + Math.cos(theta * 2) * 0.4 * (1 - t);  // Bar stronger in center
            }

            // Add clumpiness - stars form in clusters
            const clumpFactor = Math.random() < 0.3 ? 0.7 + Math.random() * 0.6 : 1;
            r *= clumpFactor;

            const x = r * Math.cos(theta) * barStretch;
            const z = r * Math.sin(theta);
            // Thicker disk with Gaussian-like vertical distribution
            const y = (Math.random() + Math.random() - 1) * config.size * 0.15;

            starPositions[i * 3] = x;
            starPositions[i * 3 + 1] = y;
            starPositions[i * 3 + 2] = z;

            // Realistic star colors - mostly old (red/yellow) with young blue regions
            const starType = Math.random();
            const distFromCenter = r / config.size;

            if (starType < 0.15 && distFromCenter > 0.3) {
                // Young blue stars in outer regions (star forming)
                color.setHSL(0.6, 0.3, 0.5 + Math.random() * 0.2);
            } else if (starType < 0.7) {
                // Old yellow/orange stars (majority)
                color.setHSL(0.1 + Math.random() * 0.05, 0.2, 0.35 + Math.random() * 0.15);
            } else {
                // White/grey stars
                color.setHSL(0.1, 0.05, 0.4 + Math.random() * 0.2);
            }

            starColors[i * 3] = color.r;
            starColors[i * 3 + 1] = color.g;
            starColors[i * 3 + 2] = color.b;
        }

        starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

        const starMaterial = new THREE.PointsMaterial({
            size: 0.8,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending
        });

        const stars = new THREE.Points(starGeometry, starMaterial);
        cloudGroup.add(stars);

        // === DUST/GAS COMPONENT ===
        const dustGeometry = new THREE.BufferGeometry();
        const dustPositions = new Float32Array(config.dustCount * 3);
        const dustColors = new Float32Array(config.dustCount * 3);

        for (let i = 0; i < config.dustCount; i++) {
            const t = Math.random();
            const r = Math.pow(t, 0.4) * config.size * 0.8;
            const theta = Math.random() * Math.PI * 2;

            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);
            const y = (Math.random() - 0.5) * config.size * 0.1;

            dustPositions[i * 3] = x;
            dustPositions[i * 3 + 1] = y;
            dustPositions[i * 3 + 2] = z;

            // Dark dust - blocks light
            color.setHSL(0.08, 0.1, 0.08 + Math.random() * 0.05);
            dustColors[i * 3] = color.r;
            dustColors[i * 3 + 1] = color.g;
            dustColors[i * 3 + 2] = color.b;
        }

        dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
        dustGeometry.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));

        const dustMaterial = new THREE.PointsMaterial({
            size: 2.0,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.3
        });

        const dust = new THREE.Points(dustGeometry, dustMaterial);
        cloudGroup.add(dust);

        // Add to galaxy group (will orbit with animation)
        this.galaxyGroup.add(cloudGroup);

        return cloudGroup;
    },

    /**
     * Create the Magellanic Stream - tidal gas stripped from the clouds
     */
    createMagellanicStream(lmc, smc) {
        // The stream is a trail of gas connecting LMC, SMC, and trailing behind
        const streamPoints = 500;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(streamPoints * 3);
        const colors = new Float32Array(streamPoints * 3);
        const color = new THREE.Color();

        const lmcPos = lmc.position;
        const smcPos = smc.position;

        for (let i = 0; i < streamPoints; i++) {
            const t = i / streamPoints;

            // Stream curves from SMC through LMC and trails behind
            let x, y, z;
            if (t < 0.3) {
                // SMC to LMC segment
                const st = t / 0.3;
                x = smcPos.x + (lmcPos.x - smcPos.x) * st;
                y = smcPos.y + (lmcPos.y - smcPos.y) * st;
                z = smcPos.z + (lmcPos.z - smcPos.z) * st;
            } else {
                // Trailing stream behind LMC
                const st = (t - 0.3) / 0.7;
                const trailAngle = lmc.userData.baseAngle - st * Math.PI * 0.8;
                const trailDist = lmc.userData.distance * (1 + st * 0.5);
                x = Math.cos(trailAngle) * trailDist;
                y = lmcPos.y * (1 - st * 0.5);
                z = Math.sin(trailAngle) * trailDist;
            }

            // Add some scatter
            x += (Math.random() - 0.5) * 10;
            y += (Math.random() - 0.5) * 5;
            z += (Math.random() - 0.5) * 10;

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            // Faint gas color
            color.setHSL(0.55, 0.15, 0.15 + Math.random() * 0.05);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.0,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending
        });

        const stream = new THREE.Points(geometry, material);
        this.galaxyGroup.add(stream);
        this.magellanicStream = stream;
    },

    /**
     * Update Magellanic Cloud orbital positions (call in animate loop)
     */
    updateMagellanicOrbits() {
        if (!this.magellanicClouds) return;

        // Very slow orbital motion - these take billions of years to orbit
        const orbitSpeed = 0.00001;  // Radians per frame

        for (const cloud of this.magellanicClouds) {
            const data = cloud.userData;
            const newAngle = data.baseAngle + this.time * orbitSpeed * (1500 / data.orbitalPeriod);

            cloud.position.set(
                Math.cos(newAngle) * data.distance,
                Math.sin(data.inclination) * data.distance * 0.3,
                Math.sin(newAngle) * data.distance
            );
        }
    },

    /**
     * Add a text label to a galaxy/object
     */
    addGalaxyLabel(group, name, offset) {
        // We'll create a sprite or just store the data for UI labels
        group.userData = {
            name: name,
            labelOffset: offset
        };
    },

    /**
     * Create Andromeda Galaxy (M31) as a mini spiral in the distance
     * Real distance: 2.5 million light years = ~770 kpc
     * We place it at ~600 units = 60,000 parsecs (compressed for visibility)
     */
    createAndromedaGalaxy() {
        const andromedaGroup = new THREE.Group();

        // Position - Andromeda is in a specific direction from Milky Way
        // We place it roughly where it would appear in the night sky
        const distance = 1000;  // Further out for larger galaxy scale
        const angle = Math.PI * 0.3;  // Direction
        const inclination = 0.4;  // Tilted relative to us

        andromedaGroup.position.set(
            Math.cos(angle) * distance,
            Math.sin(inclination) * distance * 0.3,
            Math.sin(angle) * distance
        );

        // Create mini spiral structure
        const armCount = 2;
        const starsPerArm = 800;
        const totalStars = armCount * starsPerArm + 500;  // Arms + bulge
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(totalStars * 3);
        const colors = new Float32Array(totalStars * 3);
        const color = new THREE.Color();

        let idx = 0;

        // Central bulge
        for (let i = 0; i < 500; i++) {
            const r = Math.pow(Math.random(), 0.5) * 8;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[idx * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[idx * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.3;
            positions[idx * 3 + 2] = r * Math.cos(phi);

            color.setHSL(0.1, 0.5, 0.4 + Math.random() * 0.2);
            colors[idx * 3] = color.r;
            colors[idx * 3 + 1] = color.g;
            colors[idx * 3 + 2] = color.b;
            idx++;
        }

        // Spiral arms
        for (let arm = 0; arm < armCount; arm++) {
            const armStart = (arm / armCount) * Math.PI * 2;
            for (let i = 0; i < starsPerArm; i++) {
                const t = i / starsPerArm;
                const r = 5 + t * 25;
                const spiralAngle = armStart + t * Math.PI * 2;
                const spread = (Math.random() - 0.5) * 3;

                positions[idx * 3] = r * Math.cos(spiralAngle + spread * 0.1);
                positions[idx * 3 + 1] = (Math.random() - 0.5) * 1;
                positions[idx * 3 + 2] = r * Math.sin(spiralAngle + spread * 0.1);

                const isBlue = Math.random() < 0.3;
                if (isBlue) {
                    color.setHSL(0.6, 0.5, 0.35 + Math.random() * 0.2);
                } else {
                    color.setHSL(0.1, 0.4, 0.3 + Math.random() * 0.15);
                }
                colors[idx * 3] = color.r;
                colors[idx * 3 + 1] = color.g;
                colors[idx * 3 + 2] = color.b;
                idx++;
            }
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.5,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });

        const andromeda = new THREE.Points(geometry, material);

        // Tilt to show it's a spiral viewed at an angle
        andromeda.rotation.x = 0.5;
        andromeda.rotation.z = 0.3;

        andromedaGroup.add(andromeda);

        // Add a subtle glow around it
        const glowGeometry = new THREE.SphereGeometry(35, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x8899cc,
            transparent: true,
            opacity: 0.08,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        andromedaGroup.add(glow);

        this.scene.add(andromedaGroup);
    },

    /**
     * Create Messier objects and deep sky objects as simple point POAs
     * All 110 Messier objects plus notable NGC objects
     */
    createMessierObjects() {
        const klyToUnits = 3;

        // Complete Messier catalog + notable deep sky objects - all as POA points
        const deepSkyObjects = [
            // === MESSIER NEBULAE ===
            { name: 'M1 Crab', type: 'remnant', dist: 6.5, angle: 1.25, color: 0xffaa44 },
            { name: 'M8 Lagoon', type: 'nebula', dist: 5.2, angle: 2.98, color: 0xff7799 },
            { name: 'M16 Eagle', type: 'nebula', dist: 7.0, angle: 2.2, color: 0xff8866 },
            { name: 'M17 Omega', type: 'nebula', dist: 6.0, angle: 2.68, color: 0xff8877 },
            { name: 'M20 Trifid', type: 'nebula', dist: 5.5, angle: 2.84, color: 0xdd6699 },
            { name: 'M27 Dumbbell', type: 'planetary', dist: 1.36, angle: 1.4, color: 0x66ddaa },
            { name: 'M42 Orion', type: 'nebula', dist: 1.34, angle: 1.3, color: 0xff99bb },
            { name: 'M43', type: 'nebula', dist: 1.6, angle: 1.32, color: 0xff88aa },
            { name: 'M57 Ring', type: 'planetary', dist: 2.3, angle: 1.5, color: 0x66aaff },
            { name: 'M76 Little Dumbbell', type: 'planetary', dist: 2.5, angle: 0.3, color: 0x55cc99 },
            { name: 'M78', type: 'nebula', dist: 1.6, angle: 1.28, color: 0x8899ff },
            { name: 'M97 Owl', type: 'planetary', dist: 2.6, angle: 2.1, color: 0x77ddcc },

            // === MESSIER GLOBULAR CLUSTERS ===
            { name: 'M2', type: 'globular', dist: 37, angle: 4.2, color: 0xffffcc },
            { name: 'M3', type: 'globular', dist: 33, angle: 1.2, color: 0xffeebb },
            { name: 'M4', type: 'globular', dist: 7.2, angle: 3.6, color: 0xffeeaa },
            { name: 'M5', type: 'globular', dist: 24, angle: 2.8, color: 0xffffdd },
            { name: 'M9', type: 'globular', dist: 25, angle: 3.3, color: 0xffeebb },
            { name: 'M10', type: 'globular', dist: 14, angle: 3.1, color: 0xffffcc },
            { name: 'M12', type: 'globular', dist: 16, angle: 3.0, color: 0xffeecc },
            { name: 'M13 Hercules', type: 'globular', dist: 25, angle: 0.5, color: 0xffeeaa },
            { name: 'M14', type: 'globular', dist: 30, angle: 3.2, color: 0xffeebb },
            { name: 'M15', type: 'globular', dist: 33, angle: 4.5, color: 0xffffcc },
            { name: 'M19', type: 'globular', dist: 28, angle: 3.35, color: 0xffeeaa },
            { name: 'M22', type: 'globular', dist: 10, angle: 3.4, color: 0xffffdd },
            { name: 'M28', type: 'globular', dist: 18, angle: 3.38, color: 0xffeebb },
            { name: 'M30', type: 'globular', dist: 26, angle: 4.6, color: 0xffffcc },
            { name: 'M53', type: 'globular', dist: 58, angle: 1.8, color: 0xffeeaa },
            { name: 'M54', type: 'globular', dist: 87, angle: 3.42, color: 0xffeebb },
            { name: 'M55', type: 'globular', dist: 17, angle: 3.5, color: 0xffffdd },
            { name: 'M56', type: 'globular', dist: 32, angle: 1.55, color: 0xffeecc },
            { name: 'M62', type: 'globular', dist: 22, angle: 3.25, color: 0xffffcc },
            { name: 'M68', type: 'globular', dist: 33, angle: 2.4, color: 0xffeebb },
            { name: 'M69', type: 'globular', dist: 29, angle: 3.36, color: 0xffffaa },
            { name: 'M70', type: 'globular', dist: 29, angle: 3.37, color: 0xffeecc },
            { name: 'M71', type: 'globular', dist: 13, angle: 1.6, color: 0xffffdd },
            { name: 'M72', type: 'globular', dist: 55, angle: 4.3, color: 0xffeebb },
            { name: 'M75', type: 'globular', dist: 67, angle: 4.0, color: 0xffffcc },
            { name: 'M79', type: 'globular', dist: 41, angle: 5.8, color: 0xffeeaa },
            { name: 'M80', type: 'globular', dist: 32, angle: 3.55, color: 0xffeebb },
            { name: 'M92', type: 'globular', dist: 26, angle: 0.45, color: 0xffffdd },
            { name: 'M107', type: 'globular', dist: 21, angle: 3.15, color: 0xffeecc },

            // === MESSIER OPEN CLUSTERS ===
            { name: 'M6 Butterfly', type: 'open', dist: 1.6, angle: 3.45, color: 0xaaddff },
            { name: 'M7 Ptolemy', type: 'open', dist: 0.98, angle: 3.48, color: 0xbbddff },
            { name: 'M11 Wild Duck', type: 'open', dist: 6.2, angle: 2.9, color: 0xccddff },
            { name: 'M18', type: 'open', dist: 4.9, angle: 2.76, color: 0xaaccff },
            { name: 'M21', type: 'open', dist: 4.25, angle: 2.86, color: 0xbbccff },
            { name: 'M23', type: 'open', dist: 2.15, angle: 3.2, color: 0xaaddff },
            { name: 'M25', type: 'open', dist: 2.0, angle: 3.25, color: 0xccddff },
            { name: 'M26', type: 'open', dist: 5.0, angle: 2.95, color: 0xbbccff },
            { name: 'M29', type: 'open', dist: 4.0, angle: 1.7, color: 0xaaddff },
            { name: 'M34', type: 'open', dist: 1.5, angle: 0.4, color: 0xccddff },
            { name: 'M35', type: 'open', dist: 2.8, angle: 0.9, color: 0xbbddff },
            { name: 'M36', type: 'open', dist: 4.1, angle: 0.7, color: 0xaaccff },
            { name: 'M37', type: 'open', dist: 4.5, angle: 0.75, color: 0xccccff },
            { name: 'M38', type: 'open', dist: 4.2, angle: 0.68, color: 0xbbddff },
            { name: 'M39', type: 'open', dist: 0.82, angle: 1.75, color: 0xddddff },
            { name: 'M41', type: 'open', dist: 2.3, angle: 5.2, color: 0xaaddff },
            { name: 'M44 Beehive', type: 'open', dist: 0.58, angle: 2.2, color: 0xeeddff },
            { name: 'M45 Pleiades', type: 'open', dist: 0.44, angle: 0.6, color: 0x99bbff },
            { name: 'M46', type: 'open', dist: 5.4, angle: 5.5, color: 0xbbccff },
            { name: 'M47', type: 'open', dist: 1.6, angle: 5.45, color: 0xccddff },
            { name: 'M48', type: 'open', dist: 1.5, angle: 2.5, color: 0xaaddff },
            { name: 'M50', type: 'open', dist: 3.0, angle: 5.35, color: 0xbbddff },
            { name: 'M52', type: 'open', dist: 5.0, angle: 0.2, color: 0xaaccff },
            { name: 'M67', type: 'open', dist: 2.6, angle: 2.3, color: 0xddccaa },
            { name: 'M93', type: 'open', dist: 3.6, angle: 5.6, color: 0xbbddff },
            { name: 'M103', type: 'open', dist: 10, angle: 0.15, color: 0xaaccff },

            // === FAMOUS NON-MESSIER OBJECTS ===
            { name: 'Carina Nebula', type: 'nebula', dist: 7.5, angle: 2.8, color: 0xff6688 },
            { name: 'Helix Nebula', type: 'planetary', dist: 0.7, angle: 4.5, color: 0x88ddff },
            { name: 'Cat\'s Eye', type: 'planetary', dist: 3.3, angle: 0.8, color: 0x55ccaa },
            { name: 'Omega Centauri', type: 'globular', dist: 17, angle: 3.2, color: 0xffffcc },
            { name: '47 Tucanae', type: 'globular', dist: 15, angle: 4.8, color: 0xffffdd },
            { name: 'Veil Nebula', type: 'remnant', dist: 2.4, angle: 1.65, color: 0x6688ff },
            { name: 'North America', type: 'nebula', dist: 2.2, angle: 1.72, color: 0xff7788 },
            { name: 'Rosette Nebula', type: 'nebula', dist: 5.2, angle: 5.1, color: 0xff6699 },
            { name: 'Cone Nebula', type: 'nebula', dist: 2.5, angle: 5.15, color: 0xff8899 },
            { name: 'Flame Nebula', type: 'nebula', dist: 1.35, angle: 1.31, color: 0xff9966 },
            { name: 'IC 1396', type: 'nebula', dist: 2.4, angle: 1.68, color: 0xff7777 },
            { name: 'Soul Nebula', type: 'nebula', dist: 6.5, angle: 0.25, color: 0xff6688 },
            { name: 'Heart Nebula', type: 'nebula', dist: 7.5, angle: 0.22, color: 0xff5577 },
            { name: 'California', type: 'nebula', dist: 1.0, angle: 0.55, color: 0xff8888 },
            { name: 'Tarantula', type: 'nebula', dist: 160, angle: 4.9, color: 0xff99aa },
            { name: 'Eta Carinae', type: 'nebula', dist: 7.5, angle: 2.75, color: 0xffaa77 },

            // === DARK NEBULAE ===
            { name: 'Coal Sack', type: 'dark', dist: 0.6, angle: 3.5, color: 0x442222 },
            { name: 'Horsehead', type: 'dark', dist: 1.5, angle: 1.35, color: 0x553322 },
            { name: 'Pipe Nebula', type: 'dark', dist: 0.45, angle: 3.28, color: 0x443322 },
            { name: 'Snake Nebula', type: 'dark', dist: 0.65, angle: 3.3, color: 0x442233 },

            // === GALACTIC CENTER REGION ===
            { name: 'Sgr A*', type: 'core', dist: 26, angle: Math.PI, color: 0xffdd00 },
            { name: 'Sgr B2', type: 'nebula', dist: 26, angle: Math.PI * 1.01, color: 0xff5533 },
            { name: 'Arches Cluster', type: 'open', dist: 25, angle: Math.PI * 1.02, color: 0xffddaa },
            { name: 'Quintuplet', type: 'open', dist: 26, angle: Math.PI * 0.99, color: 0xffccaa },
        ];

        // Create all as simple POA points
        this.messierObjects = [];
        this.createDeepSkyPOAs(deepSkyObjects, klyToUnits);
    },

    /**
     * Create deep sky objects as colonizable dot clusters with bonuses
     * Each Messier object = cluster of 5-30 dots, each colonizable
     * Messier bonuses ~100x better than normal stars
     */
    createDeepSkyPOAs(objects, klyToUnits) {
        const positions = [];
        const colors = [];

        // Messier cluster tracking
        this.messierClusters = [];
        this.messierDots = [];

        // Bonus config by type (normal star ~0.0001%, Messier dot ~0.05%)
        const bonusCfg = {
            'nebula':     { bonus: 'production', perDot: 0.0005, dots: [15, 25] },
            'planetary':  { bonus: 'dyson_efficiency', perDot: 0.001, dots: [8, 12] },
            'remnant':    { bonus: 'research', perDot: 5, dots: [10, 15] },
            'globular':   { bonus: 'production', perDot: 0.0003, dots: [20, 35] },
            'open':       { bonus: 'launch_efficiency', perDot: 0.0002, dots: [12, 20] },
            'dark':       { bonus: 'development_speed', perDot: 0.0008, dots: [8, 15] },
            'core':       { bonus: 'dyson_efficiency', perDot: 0.002, dots: [25, 40] }
        };

        for (const obj of objects) {
            const r = obj.dist * klyToUnits;
            const cx = this.solPosition.x + Math.cos(obj.angle) * r;
            const cz = this.solPosition.z + Math.sin(obj.angle) * r;
            let cy = this.solPosition.y;
            if (obj.type === 'globular') cy += (Math.random() - 0.5) * 40;
            else if (obj.type !== 'core') cy += (Math.random() - 0.5) * 3;

            const cfg = bonusCfg[obj.type] || { bonus: 'production', perDot: 0.0003, dots: [10, 20] };
            const dotCount = cfg.dots[0] + Math.floor(Math.random() * (cfg.dots[1] - cfg.dots[0]));
            const spread = obj.type === 'globular' ? 2.5 : (obj.type === 'nebula' ? 4 : 2);

            const cluster = {
                id: obj.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                name: obj.name, type: obj.type,
                centerPosition: new THREE.Vector3(cx, cy, cz),
                distance_kly: obj.dist, dotCount, dotsColonized: 0,
                bonusType: cfg.bonus, bonusPerDot: cfg.perDot,
                totalBonus: dotCount * cfg.perDot, dots: []
            };

            const baseColor = new THREE.Color(obj.color);

            for (let i = 0; i < dotCount; i++) {
                const u = Math.random() || 0.001;
                const d = Math.sqrt(-2 * Math.log(u)) * spread * 0.4;
                const th = Math.random() * Math.PI * 2;
                const ph = Math.acos(2 * Math.random() - 1);
                const dx = d * Math.sin(ph) * Math.cos(th);
                const dy = d * Math.sin(ph) * Math.sin(th) * 0.3;
                const dz = d * Math.cos(ph);

                positions.push(cx + dx, cy + dy, cz + dz);
                const b = 0.7 + Math.random() * 0.3;
                colors.push(baseColor.r * b, baseColor.g * b, baseColor.b * b);

                const dot = {
                    clusterId: cluster.id, clusterName: cluster.name, index: i,
                    position: new THREE.Vector3(cx + dx, cy + dy, cz + dz),
                    colonized: false, bonusType: cfg.bonus, bonusValue: cfg.perDot
                };
                cluster.dots.push(dot);
                this.messierDots.push(dot);
            }

            this.messierClusters.push(cluster);
            this.messierObjects.push(cluster);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const material = new THREE.PointsMaterial({
            size: 0.4, sizeAttenuation: true, vertexColors: true,
            transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending
        });
        this.deepSkyPOAs = new THREE.Points(geometry, material);
        this.galaxyGroup.add(this.deepSkyPOAs);

        console.log(`[StarMap] ${this.messierClusters.length} Messier clusters, ${this.messierDots.length} colonizable dots`);
    },

    /**
     * Find nearest uncolonized Messier dot
     */
    findNearestMessierDot(fromX, fromY, fromZ, maxDist = 100) {
        let nearest = null, nearestD = maxDist;
        for (const dot of this.messierDots) {
            if (dot.colonized) continue;
            const dx = dot.position.x - fromX, dy = dot.position.y - fromY, dz = dot.position.z - fromZ;
            const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (d < nearestD) { nearestD = d; nearest = dot; }
        }
        return nearest;
    },

    /**
     * Colonize a Messier dot and apply bonus
     */
    colonizeMessierDot(dot) {
        if (dot.colonized) return null;
        dot.colonized = true;

        const cluster = this.messierClusters.find(c => c.id === dot.clusterId);
        if (cluster) {
            cluster.dotsColonized++;
            const pct = Math.round((cluster.dotsColonized / cluster.dotCount) * 100);
            console.log(`[StarMap] ${cluster.name}: ${cluster.dotsColonized}/${cluster.dotCount} (${pct}%)`);
        }

        // Apply bonus
        switch (dot.bonusType) {
            case 'production': this.empireBonuses.production += dot.bonusValue; break;
            case 'dyson_efficiency': this.empireBonuses.dyson_efficiency += dot.bonusValue; break;
            case 'launch_efficiency': this.empireBonuses.launch_efficiency = Math.max(0.1, this.empireBonuses.launch_efficiency - dot.bonusValue); break;
            case 'development_speed': this.empireBonuses.development_speed += dot.bonusValue; break;
            case 'research': this.empireBonuses.research += dot.bonusValue; break;
        }
        return cluster;
    },

    /**
     * Create a distant, subtle smoky nebula
     */
    createSmokyNebula(x, y, z, color, size, name, type) {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        const colorObj = new THREE.Color(color);
        const particleCount = type === 'planetary' ? 30 : 60;

        // Soft glowing particles
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);

        for (let i = 0; i < particleCount; i++) {
            // Gaussian-ish distribution for smoky look
            const r = size * Math.pow(Math.random(), 0.7);
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.3; // Flatten
            positions[i * 3 + 2] = r * Math.cos(phi);

            // Vary color slightly
            const brightness = 0.6 + Math.random() * 0.4;
            colors[i * 3] = colorObj.r * brightness;
            colors[i * 3 + 1] = colorObj.g * brightness;
            colors[i * 3 + 2] = colorObj.b * brightness;

            sizes[i] = (0.3 + Math.random() * 0.5) * size;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            size: 0.4,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.25,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const nebula = new THREE.Points(geometry, material);
        nebula.userData.name = name;
        group.add(nebula);

        this.galaxyGroup.add(group);
    },

    /**
     * Create a distant globular/open cluster
     */
    createDistantCluster(x, y, z, color, size, name) {
        const starCount = 40;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colorObj = new THREE.Color(color);
        const colors = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount; i++) {
            // Concentrated toward center
            const r = Math.pow(Math.random(), 2) * size;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = x + r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = y + r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = z + r * Math.cos(phi);

            const brightness = 0.7 + Math.random() * 0.3;
            colors[i * 3] = colorObj.r * brightness;
            colors[i * 3 + 1] = colorObj.g * brightness;
            colors[i * 3 + 2] = colorObj.b * brightness;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.2,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });

        const cluster = new THREE.Points(geometry, material);
        cluster.userData.name = name;
        this.galaxyGroup.add(cluster);
    },

    /**
     * Create a dark nebula (absorption cloud)
     */
    createDarkNebula(x, y, z, size, name) {
        const particleCount = 25;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            const r = size * Math.pow(Math.random(), 0.5);
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = x + r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = y + r * Math.sin(phi) * Math.sin(theta) * 0.2;
            positions[i * 3 + 2] = z + r * Math.cos(phi);
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            size: 0.6,
            color: 0x110808,
            transparent: true,
            opacity: 0.4,
            blending: THREE.NormalBlending,
            depthWrite: false
        });

        const cloud = new THREE.Points(geometry, material);
        cloud.userData.name = name;
        this.galaxyGroup.add(cloud);
    },

    /**
     * Create major star systems as focusable landmarks throughout the galaxy
     * These are notable stars with simple text labels and hotkeys
     */
    createMajorStarSystems() {
        // Store focusable systems for keyboard navigation
        this.majorSystems = [];
        this.systemLabels = [];

        // Create container for all system labels
        this.systemLabelsContainer = document.createElement('div');
        this.systemLabelsContainer.className = 'system-labels-container';
        this.container.appendChild(this.systemLabelsContainer);

        // Define major landmarks distributed throughout the galaxy
        // Distances in kly, angles in radians from Sol's position
        // Note: Only objects > 5 kly from Sol are labeled to avoid clutter
        const majorStars = [
            // === SOL - hotkey 1 (return home) ===
            { id: 'sol', name: 'Sol', dist: 0, angle: 0, key: '1', isSol: true },

            // === DISTANT LANDMARKS (5+ kly) - hotkeys 2-9 ===
            { id: 'cygnus_region', name: 'Cygnus Region', dist: 6.0, angle: 1.6, key: '2' },      // 6000 ly
            { id: 'perseus_arm', name: 'Perseus Arm', dist: 6.4, angle: 0.4, key: '3' },          // 6400 ly
            { id: 'carina_region', name: 'Carina Region', dist: 7.5, angle: 2.85, key: '4' },     // 7500 ly
            { id: 'scutum_cloud', name: 'Scutum Cloud', dist: 18, angle: Math.PI * 0.85, key: '5' }, // 18000 ly
            { id: 'galactic_bar_near', name: 'Near Bar End', dist: 22, angle: Math.PI * 0.7, key: '6' },
            { id: 'galactic_bar_far', name: 'Far Bar End', dist: 22, angle: Math.PI * 1.3, key: '7' },
            { id: 'far_perseus', name: 'Far Perseus', dist: 52, angle: 0.15, key: '8' },
            { id: 'outer_rim', name: 'Outer Rim', dist: 62, angle: 0.8, key: '9' },

            // === GALACTIC CENTER - hotkey 0 ===
            { id: 'sagittarius_a', name: 'Sgr A*', dist: 26, angle: Math.PI, key: '0' },

            // === SPIRAL ARM FEATURES (5+ kly, click only) ===
            { id: 'cygnus_x1', name: 'Cygnus X-1', dist: 6.1, angle: 1.65, key: null },
            { id: 'eta_carinae', name: 'η Carinae', dist: 7.5, angle: 2.9, key: null },
            { id: 'heart_nebula', name: 'Heart Nebula', dist: 7.5, angle: 0.6, key: null },

            // === SAGITTARIUS ARM - along Galactic center direction ===
            { id: 'sag_arm_near', name: 'Sagittarius Proximal', dist: 4, angle: Math.PI * 0.85, key: null },
            { id: 'sag_arm_mid', name: 'Sagittarius Median', dist: 12, angle: Math.PI * 0.9, key: null },
            { id: 'sag_arm_far', name: 'Sagittarius Deep', dist: 24, angle: Math.PI * 0.95, key: null },

            // === PERSEUS ARM - outward from Sol ===
            { id: 'perseus_near', name: 'Perseus Inner', dist: 5, angle: 0.2, key: null },
            { id: 'perseus_mid', name: 'Perseus Transit', dist: 15, angle: 0.25, key: null },
            { id: 'perseus_outer', name: 'Perseus Reaches', dist: 35, angle: 0.3, key: null },

            // === SCUTUM-CENTAURUS ARM ===
            { id: 'scutum_near', name: 'Scutum Inner', dist: 10, angle: Math.PI * 0.75, key: null },
            { id: 'centaurus_mid', name: 'Centaurus Sector', dist: 20, angle: Math.PI * 0.6, key: null },
            { id: 'crux_transit', name: 'Crux-Scutum Transit', dist: 32, angle: Math.PI * 0.5, key: null },

            // === NORMA ARM ===
            { id: 'norma_sector', name: 'Norma Sector', dist: 16, angle: Math.PI * 1.4, key: null },
            { id: 'norma_deep', name: 'Norma Deep Field', dist: 28, angle: Math.PI * 1.5, key: null },

            // === ORION SPUR (local arm) ===
            { id: 'orion_trailing', name: 'Orion Trailing Edge', dist: 3, angle: Math.PI * 0.65, key: null },
            { id: 'orion_leading', name: 'Orion Leading Edge', dist: 3, angle: Math.PI * 0.35, key: null },

            // === OUTER ARM (beyond Perseus) ===
            { id: 'outer_arm_entry', name: 'Outer Arm Entry', dist: 45, angle: 0.35, key: null },
            { id: 'outer_arm_deep', name: 'Outer Arm Deep', dist: 55, angle: 0.4, key: null },

            // === FAR SIDE OF GALAXY (opposite Sol) ===
            { id: 'far_carina', name: 'Far Carina Arm', dist: 48, angle: 0.5, key: null },
            { id: 'far_crux', name: 'Crux-Scutum Far', dist: 55, angle: Math.PI * 0.4, key: null },
            { id: 'far_norma', name: 'Far Norma Arm', dist: 50, angle: Math.PI * 1.6, key: null },
            { id: 'far_sagittarius', name: 'Far Sagittarius', dist: 58, angle: Math.PI * 1.2, key: null },
            { id: 'outer_rim_2', name: 'Outer Rim β', dist: 60, angle: 2.2, key: null },
            { id: 'outer_rim_3', name: 'Outer Rim γ', dist: 65, angle: 4.0, key: null },
            { id: 'outer_rim_4', name: 'Outer Rim δ', dist: 58, angle: 5.2, key: null },

            // === GALACTIC CORE REGION ===
            { id: '3kpc_arm', name: '3-kpc Arm', dist: 35, angle: Math.PI * 0.95, key: null },
            { id: 'molecular_ring', name: 'Molecular Ring', dist: 30, angle: Math.PI * 1.1, key: null },

            // === DISTANT HALO GLOBULAR CLUSTERS ===
            { id: 'ngc_2419', name: 'NGC 2419', dist: 90, angle: 1.8, yOffset: 25, key: null },
            { id: 'pal_3', name: 'Palomar 3', dist: 95, angle: 4.5, yOffset: -20, key: null },
            { id: 'pal_4', name: 'Palomar 4', dist: 110, angle: 2.5, yOffset: 30, key: null },
            { id: 'am_1', name: 'AM 1', dist: 125, angle: 5.0, yOffset: -25, key: null },

            // === EXTRAGALACTIC - positions match 3D objects (absolute, not relative to Sol) ===
            // These use absolute positions to match their 3D counterparts
            { id: 'lmc', name: 'LMC', dist: 160, angle: 3.8, yOffset: -30, key: null, extragalactic: true },
            { id: 'smc', name: 'SMC', dist: 200, angle: 4.1, yOffset: -35, key: null, extragalactic: true },
            // Andromeda: matches createAndromedaGalaxy position
            { id: 'andromeda', name: 'Andromeda (M31)', absolutePos: { x: Math.cos(Math.PI * 0.3) * 1000, y: Math.sin(0.4) * 1000 * 0.3, z: Math.sin(Math.PI * 0.3) * 1000 }, key: null, extragalactic: true, dist: 2500 },
        ];

        // Scale factor for converting kly to scene units
        const klyToUnits = 3;

        for (const star of majorStars) {
            let localPosition;

            if (star.absolutePos) {
                // Extragalactic objects with absolute world position (don't rotate with galaxy)
                localPosition = new THREE.Vector3(star.absolutePos.x, star.absolutePos.y, star.absolutePos.z);
            } else {
                // Calculate position relative to Sol (local to galaxy group)
                const r = star.dist * klyToUnits;
                const x = this.solPosition.x + Math.cos(star.angle) * r;
                const z = this.solPosition.z + Math.sin(star.angle) * r;
                // Handle halo objects with vertical offset
                const y = this.solPosition.y + (star.yOffset || 0);
                localPosition = new THREE.Vector3(x, y, z);
            }

            // Create HTML label
            const label = this.createSystemLabel(star, localPosition);

            // Store for focusing and updates
            this.majorSystems.push({
                id: star.id,
                name: star.name,
                key: star.key,
                localPosition: localPosition,  // Local to galaxy group
                distance_kly: star.dist,
                extragalactic: star.extragalactic || false,
                label: label
            });
        }

        // Also add labels for Messier objects (created earlier)
        // Only label objects > 5 kly to avoid clutter near Sol
        if (this.messierObjects) {
            for (const obj of this.messierObjects) {
                // Skip objects too close to Sol (< 5000 ly)
                if (obj.distance_kly < 5) continue;

                const label = this.createSystemLabel({
                    id: obj.id,
                    name: obj.name,
                    dist: obj.distance_kly,
                    key: null
                }, obj.localPosition);

                this.majorSystems.push({
                    id: obj.id,
                    name: obj.name,
                    key: null,
                    localPosition: obj.localPosition,
                    distance_kly: obj.distance_kly,
                    isMessier: true,
                    messierType: obj.type,
                    label: label
                });
            }
        }

        console.log(`[StarMap] Created ${this.majorSystems.length} POI labels (stars + Messier objects)`);
    },

    /**
     * Create an HTML label for a star system
     */
    createSystemLabel(star, position) {
        const label = document.createElement('div');
        label.className = 'poi-label';
        label.innerHTML = `
            <span class="poi-key">${star.key || ''}</span>
            <span class="poi-name">${star.name}</span>
            <span class="poi-dist">${star.dist < 1 ? `${(star.dist * 1000).toFixed(0)} ly` : `${star.dist.toFixed(1)} kly`}</span>
        `;

        // Click to focus
        label.addEventListener('click', () => {
            this.focusOnSystem(star.id);
        });

        label.dataset.systemId = star.id;
        this.systemLabelsContainer.appendChild(label);

        return {
            element: label,
            position: position
        };
    },

    /**
     * Update all system label positions based on camera
     * Applies galaxy rotation to keep labels attached to their stars
     */
    updateSystemLabels() {
        if (!this.majorSystems || !this.camera) return;

        // Get galaxy rotation matrix to transform local positions to world
        const galaxyMatrix = this.galaxyGroup.matrixWorld;

        for (const system of this.majorSystems) {
            if (!system.label) continue;

            const label = system.label;
            // Skip if localPosition is missing
            if (!system.localPosition) {
                if (label?.element) label.element.style.display = 'none';
                continue;
            }
            // Extragalactic objects have absolute positions, others rotate with galaxy
            let worldPos;
            if (system.extragalactic && system.localPosition) {
                // Absolute position - doesn't rotate with galaxy
                worldPos = system.localPosition.clone();
            } else {
                // Apply galaxy rotation to the local position
                worldPos = system.localPosition.clone().applyMatrix4(galaxyMatrix);
            }

            // Check if in front of camera
            const cameraDir = new THREE.Vector3();
            this.camera.getWorldDirection(cameraDir);
            const toPoint = worldPos.clone().sub(this.camera.position).normalize();
            const dot = cameraDir.dot(toPoint);

            if (dot < 0) {
                // Behind camera
                label.element.style.display = 'none';
                continue;
            }

            // Project to screen
            const screenPos = worldPos.clone().project(this.camera);
            const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

            // Check if on screen
            if (x < -100 || x > window.innerWidth + 100 || y < -50 || y > window.innerHeight + 50) {
                label.element.style.display = 'none';
                continue;
            }

            // Calculate distance for opacity fade
            const dist = this.camera.position.distanceTo(worldPos);
            const opacity = Math.min(1, Math.max(0.3, 1 - (dist / 500)));

            label.element.style.display = 'block';
            label.element.style.left = `${x}px`;
            label.element.style.top = `${y}px`;
            label.element.style.opacity = opacity;
        }
    },

    /**
     * Focus camera on a major star system
     * @param {string} systemId - ID of system to focus on (or number key)
     */
    focusOnSystem(systemId) {
        if (!this.isActive || !this.majorSystems) return;

        // Find by ID or key
        const system = this.majorSystems.find(s =>
            s.id === systemId || s.key === systemId
        );

        if (!system) {
            console.log(`[StarMap] System not found: ${systemId}`);
            return;
        }

        console.log(`[StarMap] Focusing on ${system.name}`);

        // If focusing on Sol, use goToSol
        if (system.isSol) {
            this.goToSol();
            return;
        }

        // Scale distance based on how far the target is
        let targetDistance;
        if (system.extragalactic) {
            targetDistance = Math.max(50, Math.min(500, 50 + (system.distance_kly * 0.05)));
        } else {
            targetDistance = Math.max(15, Math.min(200, 15 + (system.distance_kly * 0.3)));
        }

        // Transform local position to world using galaxyGroup (not colonizationGroup)
        const worldPos = system.localPosition.clone();
        if (!system.extragalactic && this.galaxyGroup) {
            worldPos.applyMatrix4(this.galaxyGroup.matrixWorld);
        }

        console.log('[StarMap] focusOnSystem worldPos:', worldPos, 'distance:', targetDistance);

        // Simple camera navigation
        this.goToPosition(worldPos, targetDistance);

        // Show notification
        this.showSystemNotification(system);
    },

    /**
     * Show notification when focusing on a system
     */
    showSystemNotification(system) {
        // Remove existing notification
        const existing = document.querySelector('.system-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = 'system-notification';
        notification.innerHTML = `
            <div class="system-name">${system.name}</div>
            <div class="system-info">
                <span>Distance: ${system.distance_kly < 1
                    ? `${(system.distance_kly * 1000).toFixed(0)} ly`
                    : `${system.distance_kly.toFixed(1)} kly`}</span>
                <span>Type: ${system.spectral === 'X' ? 'Exotic' : `Class ${system.spectral}`}</span>
            </div>
            ${system.key ? `<div class="system-key">Press ${system.key} to return</div>` : ''}
        `;

        this.container.appendChild(notification);

        // Auto-hide after 4 seconds
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 500);
        }, 4000);
    },

    /**
     * Create Sol marker - our starting point
     * Sol is unremarkable - just one star among billions, marked with a subtle indicator
     */
    createSolMarker() {
        // Sol is just a tiny point - same as any other star in the galaxy
        // We only mark it so the player can find it
        const solGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        const solMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffee,  // Slightly warm white, like a G-type star
            transparent: true,
            opacity: 0.9
        });
        this.solMesh = new THREE.Mesh(solGeometry, solMaterial);
        this.solMesh.position.set(this.solPosition.x, this.solPosition.y, this.solPosition.z);

        // No glow - Sol is unremarkable, same as any other star
        // The label is the only thing that distinguishes it

        this.galaxyGroup.add(this.solMesh);

        // Create HTML label for Sol
        this.createSolLabel();
    },

    /**
     * Create HTML label that tracks Sol's position
     */
    createSolLabel() {
        this.solLabel = document.createElement('div');
        this.solLabel.id = 'sol-label';
        this.solLabel.className = 'star-label sol-label';
        this.solLabel.innerHTML = `
            <span class="star-name">Sol <span class="hotkey">[1]</span></span>
            <span class="star-distance">Home</span>
        `;
        this.container.appendChild(this.solLabel);
    },

    /**
     * Update Sol label position to track Sol in 3D space
     */
    updateSolLabel() {
        if (!this.solLabel || !this.solMesh || !this.camera) return;

        // Get Sol's world position
        const solWorldPos = new THREE.Vector3();
        this.solMesh.getWorldPosition(solWorldPos);

        // Project to screen coordinates
        const screenPos = solWorldPos.clone().project(this.camera);

        // Convert to CSS coordinates
        const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

        // Check if Sol is in front of camera (z < 1 means visible)
        if (screenPos.z < 1 && screenPos.z > -1) {
            this.solLabel.style.display = 'block';
            this.solLabel.style.left = `${x}px`;
            this.solLabel.style.top = `${y}px`;

            // Fade based on distance to camera
            const dist = this.camera.position.distanceTo(solWorldPos);
            const opacity = Math.max(0.3, Math.min(1, 1 - dist / 500));
            this.solLabel.style.opacity = opacity.toString();
        } else {
            this.solLabel.style.display = 'none';
        }
    },

    /**
     * Create the sphere of influence visualization
     * This shows how far your civilization has spread
     */
    createSphereOfInfluence() {
        // Start with a small sphere around Sol
        this.influenceRadius = 0.5;  // Start at ~50 parsecs

        // Inner colonized region (solid)
        const innerGeometry = new THREE.SphereGeometry(1, 32, 32);
        const innerMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide
        });
        this.influenceSphere = new THREE.Mesh(innerGeometry, innerMaterial);
        this.influenceSphere.position.copy(this.solMesh.position);
        this.influenceSphere.scale.setScalar(this.influenceRadius);
        this.galaxyGroup.add(this.influenceSphere);

        // Outer expansion front (wireframe ring)
        const ringGeometry = new THREE.RingGeometry(0.95, 1.05, 64);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffaa,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        this.influenceRing = new THREE.Mesh(ringGeometry, ringMaterial);
        this.influenceRing.position.copy(this.solMesh.position);
        this.influenceRing.scale.setScalar(this.influenceRadius);
        this.galaxyGroup.add(this.influenceRing);
    },

    /**
     * Update sphere of influence based on game state
     */
    updateSphereOfInfluence(radius) {
        this.influenceRadius = radius;
        if (this.influenceSphere) {
            this.influenceSphere.scale.setScalar(radius);
        }
        if (this.influenceRing) {
            this.influenceRing.scale.setScalar(radius);
        }
    },

    /**
     * Create animated dust clouds in the galactic plane (background effect)
     * Scattered throughout the galaxy for depth
     */
    createBackgroundDustClouds() {
        const cloudCount = 50;  // More clouds for larger galaxy

        for (let i = 0; i < cloudCount; i++) {
            const cloudGeometry = new THREE.BufferGeometry();
            const cloudParticles = 800;
            const positions = new Float32Array(cloudParticles * 3);

            // Cloud center position - spread across the galaxy
            const distance = 50 + Math.random() * (this.galaxyRadius - 50);
            const angle = Math.random() * Math.PI * 2;
            const centerX = Math.cos(angle) * distance;
            const centerZ = Math.sin(angle) * distance;
            const centerY = (Math.random() - 0.5) * 5 * Math.exp(-distance / 300);

            // Cloud extent scales with distance from center
            const cloudSize = 15 + Math.random() * 40;

            for (let j = 0; j < cloudParticles; j++) {
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                const r = cloudSize * Math.cbrt(Math.random());

                positions[j * 3] = centerX + r * Math.sin(phi) * Math.cos(theta);
                positions[j * 3 + 1] = centerY + r * Math.sin(phi) * Math.sin(theta) * 0.2;
                positions[j * 3 + 2] = centerZ + r * Math.cos(phi);
            }

            cloudGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            // Vary cloud colors - some reddish, some bluish
            const hue = Math.random() < 0.3 ? 0.0 + Math.random() * 0.1 : 0.6 + Math.random() * 0.1;
            const cloudMaterial = new THREE.PointsMaterial({
                size: 3,
                color: new THREE.Color().setHSL(hue, 0.4, 0.15),
                transparent: true,
                opacity: 0.1,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            const cloud = new THREE.Points(cloudGeometry, cloudMaterial);
            cloud.userData = {
                rotationSpeed: (Math.random() - 0.5) * 0.0001,
                driftX: (Math.random() - 0.5) * 0.002,
                driftZ: (Math.random() - 0.5) * 0.002
            };

            this.dustClouds.push(cloud);
            this.scene.add(cloud);
        }
    },

    /**
     * Create distant background stars (extragalactic / skybox effect)
     */
    createBackgroundStars() {
        const starCount = 15000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        const color = new THREE.Color();

        for (let i = 0; i < starCount; i++) {
            // Spherical distribution at very large radius (like a skybox)
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 800 + Math.random() * 400;  // Far beyond the galaxy

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);

            // Random star colors - dimmer, more distant
            const colorType = Math.random();
            if (colorType < 0.7) {
                color.setHex(0xaaaaaa); // Dim white
            } else if (colorType < 0.85) {
                color.setHex(0xccaa88); // Dim orange
            } else if (colorType < 0.95) {
                color.setHex(0x8899cc); // Dim blue
            } else {
                color.setHex(0xccaa77); // Dim yellow
            }

            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.8,
            sizeAttenuation: false,  // Fixed size regardless of distance
            vertexColors: true,
            transparent: true,
            opacity: 0.5
        });

        this.backgroundStars = new THREE.Points(geometry, material);
        this.scene.add(this.backgroundStars);

        // Add distant background galaxies for visual interest
        this.createBackgroundGalaxies();
    },

    /**
     * Create distant background galaxies as simple POA points
     * ~500 galaxies including named Local Group members
     */
    createBackgroundGalaxies() {
        const galaxyCount = 500;
        const positions = [];
        const colors = [];
        const color = new THREE.Color();

        // Named background galaxies (Local Group and nearby)
        const namedGalaxies = [
            { name: 'Andromeda (M31)', theta: 0.8, phi: 1.2, color: 0xaabbdd },
            { name: 'Triangulum (M33)', theta: 0.9, phi: 1.3, color: 0x99aacc },
            { name: 'LMC', theta: 4.8, phi: 2.1, color: 0xbbccdd },
            { name: 'SMC', theta: 4.9, phi: 2.0, color: 0xaabbcc },
            { name: 'M81', theta: 2.0, phi: 0.8, color: 0x99aadd },
            { name: 'M82 Cigar', theta: 2.05, phi: 0.82, color: 0xddaa88 },
            { name: 'Centaurus A', theta: 3.4, phi: 1.8, color: 0xccbb99 },
            { name: 'M87', theta: 1.5, phi: 1.4, color: 0xddcc99 },
            { name: 'Sombrero', theta: 1.6, phi: 1.6, color: 0xccbbaa },
            { name: 'Whirlpool', theta: 1.8, phi: 1.0, color: 0x99aadd },
            { name: 'Pinwheel', theta: 2.2, phi: 0.9, color: 0xaabbee },
            { name: 'NGC 1300', theta: 0.5, phi: 1.7, color: 0xbbaacc },
            { name: 'Needle', theta: 1.7, phi: 1.3, color: 0xccccdd },
            { name: 'IC 1101', theta: 2.5, phi: 1.1, color: 0xeeddaa },
        ];

        // Add named galaxies as brighter points
        this.backgroundGalaxyData = [];
        for (const g of namedGalaxies) {
            const r = 1600;
            const x = r * Math.sin(g.phi) * Math.cos(g.theta);
            const y = r * Math.sin(g.phi) * Math.sin(g.theta);
            const z = r * Math.cos(g.phi);
            positions.push(x, y, z);
            color.set(g.color);
            colors.push(color.r, color.g, color.b);
            this.backgroundGalaxyData.push({ name: g.name, position: new THREE.Vector3(x, y, z) });
        }

        // Add random background galaxies
        for (let i = 0; i < galaxyCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 1200 + Math.random() * 800;
            positions.push(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
            const type = Math.random();
            if (type < 0.4) color.setHSL(0.6, 0.3, 0.15 + Math.random() * 0.1);
            else if (type < 0.7) color.setHSL(0.1, 0.25, 0.12 + Math.random() * 0.08);
            else color.setHSL(0.5, 0.2, 0.1 + Math.random() * 0.1);
            colors.push(color.r, color.g, color.b);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const material = new THREE.PointsMaterial({
            size: 1.2, sizeAttenuation: false, vertexColors: true,
            transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending
        });
        this.backgroundGalaxiesPOA = new THREE.Points(geometry, material);
        this.scene.add(this.backgroundGalaxiesPOA);
    },

    /**
     * Create a distant spiral galaxy (enhanced with more stars, glow, rotation)
     */
    createDistantSpiral(x, y, z) {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        // Random orientation
        group.rotation.x = Math.random() * Math.PI;
        group.rotation.y = Math.random() * Math.PI;
        group.rotation.z = Math.random() * Math.PI;

        const size = 5 + Math.random() * 15;
        const starCount = 150 + Math.floor(Math.random() * 250);  // Triple star count
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        const color = new THREE.Color();
        const arms = 2 + Math.floor(Math.random() * 2);

        for (let i = 0; i < starCount; i++) {
            const arm = i % arms;
            const t = Math.random();
            const r = t * size;
            const armAngle = (arm / arms) * Math.PI * 2;
            const spiralAngle = armAngle + t * 2 + (Math.random() - 0.5) * 0.5;

            positions[i * 3] = r * Math.cos(spiralAngle);
            positions[i * 3 + 1] = (Math.random() - 0.5) * size * 0.1;
            positions[i * 3 + 2] = r * Math.sin(spiralAngle);

            // Mix of blue-white (young stars in arms) and yellow (old stars)
            const isYoungStar = Math.random() < 0.3;
            if (isYoungStar) {
                color.setHSL(0.6, 0.3, 0.2 + Math.random() * 0.15);  // Blue-white
            } else {
                color.setHSL(0.1 + Math.random() * 0.1, 0.15, 0.18 + Math.random() * 0.12);  // Warm
            }
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.5,
            sizeAttenuation: false,
            vertexColors: true,
            transparent: true,
            opacity: 0.5,  // Increased opacity
            blending: THREE.AdditiveBlending
        });

        const stars = new THREE.Points(geometry, material);
        group.add(stars);

        // Add subtle glow halo
        const glowGeometry = new THREE.SphereGeometry(size * 0.8, 8, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x8899cc,
            transparent: true,
            opacity: 0.06,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        group.add(glow);

        // Store rotation speed for animation
        group.userData.rotationSpeed = 0.00005 + Math.random() * 0.0001;
        group.userData.isSpiral = true;

        this.scene.add(group);

        // Track for animation
        if (!this.distantGalaxies) this.distantGalaxies = [];
        this.distantGalaxies.push(group);
    },

    /**
     * Create a distant elliptical galaxy (enhanced with more stars and glow)
     */
    createDistantElliptical(x, y, z) {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        group.rotation.x = Math.random() * Math.PI;
        group.rotation.y = Math.random() * Math.PI;

        const size = 4 + Math.random() * 12;
        const ellipticity = 0.3 + Math.random() * 0.7;  // How elongated
        const starCount = 80 + Math.floor(Math.random() * 120);  // Increased star count
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        const color = new THREE.Color();

        for (let i = 0; i < starCount; i++) {
            // Gaussian-ish distribution
            const u1 = Math.random() || 0.001;
            const u2 = Math.random();
            const r = Math.sqrt(-2 * Math.log(u1)) * size * 0.3;

            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * ellipticity;
            positions[i * 3 + 2] = r * Math.cos(phi);

            // Warm, old star colors (ellipticals are mostly old stars)
            color.setHSL(0.08 + Math.random() * 0.05, 0.18, 0.15 + Math.random() * 0.1);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.2,
            sizeAttenuation: false,
            vertexColors: true,
            transparent: true,
            opacity: 0.45,  // Increased opacity
            blending: THREE.AdditiveBlending
        });

        const stars = new THREE.Points(geometry, material);
        group.add(stars);

        // Add warm glow halo (ellipticals have yellow/orange halos)
        const glowGeometry = new THREE.SphereGeometry(size * 0.6, 8, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xccaa77,
            transparent: true,
            opacity: 0.05,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        group.add(glow);

        this.scene.add(group);
    },

    /**
     * Create a distant irregular galaxy
     */
    createDistantIrregular(x, y, z) {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        group.rotation.x = Math.random() * Math.PI;
        group.rotation.y = Math.random() * Math.PI;

        const size = 3 + Math.random() * 8;
        const starCount = 20 + Math.floor(Math.random() * 40);
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        const color = new THREE.Color();

        // Create a few random "blobs"
        const blobs = 2 + Math.floor(Math.random() * 3);
        const blobCenters = [];
        for (let b = 0; b < blobs; b++) {
            blobCenters.push({
                x: (Math.random() - 0.5) * size,
                y: (Math.random() - 0.5) * size * 0.3,
                z: (Math.random() - 0.5) * size
            });
        }

        for (let i = 0; i < starCount; i++) {
            const blob = blobCenters[i % blobs];
            const scatter = size * 0.3;

            positions[i * 3] = blob.x + (Math.random() - 0.5) * scatter;
            positions[i * 3 + 1] = blob.y + (Math.random() - 0.5) * scatter * 0.5;
            positions[i * 3 + 2] = blob.z + (Math.random() - 0.5) * scatter;

            // Mix of colors (irregulars have active star formation)
            const isYoung = Math.random() < 0.3;
            if (isYoung) {
                color.setHSL(0.55 + Math.random() * 0.1, 0.2, 0.18 + Math.random() * 0.1);
            } else {
                color.setHSL(0.1, 0.1, 0.12 + Math.random() * 0.08);
            }
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.0,
            sizeAttenuation: false,
            vertexColors: true,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });

        group.add(new THREE.Points(geometry, material));
        this.scene.add(group);
    }
});
