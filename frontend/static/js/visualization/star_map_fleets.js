/**
 * Star Map Fleet Management Mixin
 *
 * Probe fleet launching, updating, trail management, and expansion simulation.
 *
 * This file must be loaded AFTER star_map.js
 */

Object.assign(StarMapVisualization.prototype, {

    /**
     * Launch a probe fleet to colonize a new star
     * @param {number} targetX - Target X position (in colonization group local coords)
     * @param {number} targetY - Target Y position
     * @param {number} targetZ - Target Z position
     * @param {Object} targetData - Optional reference to colonization target object
     */
    launchProbeFleet(targetX, targetY, targetZ, targetData = null, forceQueue = false) {
        const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
        console.log('[StarMap] launchProbeFleet called: target=', targetX?.toFixed(2), targetY?.toFixed(2), targetZ?.toFixed(2),
            'targetData=', targetData?.poaData?.name || targetData?.isPOA || 'regular', 'force=', forceQueue);

        // Check if there's already a fleet heading to this target (prevent duplicates)
        // Use very small threshold (0.001 units = 0.3 ly) since nearby POAs are only a few ly apart
        for (const fleet of this.probeFleets) {
            const dist = fleet.target.distanceTo(targetPos);
            if (dist < 0.001) {  // Within 0.001 units = ~0.3 ly = same target
                console.log('[StarMap] Fleet already heading to this target, skipping');
                return null;  // Already have a fleet going there
            }
        }

        // Get hop range limit (use 3x target hop for flexibility, matching findNearestUncolonizedStar)
        const targetHopLY = this.getAverageHopDistanceLY();
        const maxHopUnits = (targetHopLY / 326) * 3;  // 3x target hop distance

        // Find launch point (nearest colonized star)
        let launchStar = this.colonizedStars[0];  // Default to Sol
        let nearestDist = Infinity;

        for (const star of this.colonizedStars) {
            const dist = star.position.distanceTo(targetPos);
            if (dist < nearestDist) {
                nearestDist = dist;
                launchStar = star;
            }
        }

        // Check if target is within hop range of launch star
        // Queued targets (forceQueue=true) bypass this check - player explicitly chose them
        if (!forceQueue && nearestDist > maxHopUnits) {
            // Target is too far from any colonized star - don't launch
            // Expansion toward distant targets happens through intermediate colonies
            console.log('[StarMap] Target too far:', nearestDist.toFixed(2), '> maxHop', maxHopUnits.toFixed(2));
            return null;
        }

        // Create probe fleet visual - bright neon green cone pointing in travel direction
        const probeGeometry = new THREE.ConeGeometry(0.2, 0.6, 6);
        const probeMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: false
        });
        const probe = new THREE.Mesh(probeGeometry, probeMaterial);
        probe.position.copy(launchStar.position);

        // Orient cone to point toward target
        // ConeGeometry points along +Y by default, rotate it to point along +Z first
        probe.geometry.rotateX(Math.PI / 2);
        // Now make it look at the target
        probe.lookAt(targetPos);

        // Trail effect - green line from origin to probe
        // Pre-allocate buffer for 2 points to avoid per-frame allocations
        const trailGeometry = new THREE.BufferGeometry();
        const trailPositions = new Float32Array(6); // 2 points * 3 components (x,y,z)
        trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
        const trailMaterial = new THREE.LineBasicMaterial({
            color: 0x00ff44,
            transparent: true,
            opacity: 0.5
        });
        const trail = new THREE.Line(trailGeometry, trailMaterial);

        // Calculate travel time using simple constant velocity
        const distanceUnits = launchStar.position.distanceTo(targetPos);
        const distanceLY = distanceUnits * 326;  // 1 unit = 326 light-years
        const driveTier = this.getDriveResearchTier();

        // Simple velocity-based travel (no relativistic complexity)
        const travel = this.calculateFleetTravel(distanceLY, driveTier);

        // Travel time is in years, convert to days (this.time is in days)
        const travelTimeYears = travel.travelTime;
        const travelTimeDays = travelTimeYears * 365.25;

        const fleet = {
            probe,
            trail,
            start: launchStar.position.clone(),
            target: targetPos,
            targetData: targetData,

            // Distance data
            distanceUnits: distanceUnits,
            distanceLY: distanceLY,

            // Time tracking (in days)
            launchTime: this.time,
            travelTimeDays: travelTimeDays,
            travelTimeYears: travelTimeYears,
            arrivalTime: this.time + travelTimeDays,

            // Drive info
            driveTier: driveTier,
            visualSpeedLYperYr: travel.visualSpeedLYperYr,

            // Legacy compatibility
            distance: distanceUnits,
            progress: 0
        };

        this.probeFleets.push(fleet);
        this.colonizationGroup.add(probe);
        this.colonizationGroup.add(trail);

        console.log(`[StarMap] Fleet launched: ${distanceLY.toFixed(1)} ly, ${travelTimeYears.toFixed(2)} yr, ${travel.visualSpeedLYperYr.toFixed(0)} ly/yr`);
        return fleet;
    },

    /**
     * Update probe fleets animation
     * Progress is calculated from elapsed game time
     */
    updateProbeFleets() {
        const completedFleets = [];

        for (const fleet of this.probeFleets) {
            // Calculate progress from elapsed game time
            // Support both new (launchTime/travelTimeDays) and legacy (startTime/travelTime) field names
            const launchTime = fleet.launchTime ?? fleet.startTime ?? 0;
            const travelTime = fleet.travelTimeDays ?? fleet.travelTime ?? 0;
            const elapsed = this.time - launchTime;
            const progress = travelTime > 0
                ? Math.min(1, elapsed / travelTime)
                : 1;  // Instant arrival if travelTime is 0
            fleet.progress = progress;

            if (progress >= 1) {
                // Arrived - colonize the star!
                completedFleets.push(fleet);

                // IMMEDIATE REPLICATION: Probe arrives and immediately starts working
                // Initial 15 units = probe starts with basic infrastructure
                // - Production portion: Can immediately start building new probes
                // - Dyson portion: Begins capturing stellar energy
                // System develops to full 100 units over time
                const initialUnits = 15;

                const newStar = this.addColonizedStar(
                    fleet.target.x,
                    fleet.target.y,
                    fleet.target.z,
                    initialUnits,
                    fleet.target.spectralClass || fleet.targetData?.spectralClass
                );

                // Link the colonized star data to the target data for tracking
                if (fleet.targetData && newStar) {
                    newStar.targetData = fleet.targetData;
                    fleet.targetData.starData = newStar;
                }

                // Check if this was a POA (Point of Attraction) and trigger bonus
                if (fleet.targetData?.isPOA && fleet.targetData?.poaData) {
                    this.onPOAColonized(fleet.targetData.poaData);
                } else if (newStar) {
                    // Check if this colony is pioneering a new region (far from others)
                    this.checkPioneerColony(newStar, fleet.target);
                }

                // Remove from target queue if this was a queued target
                if (fleet.targetData?.isQueuedTarget || fleet.targetData?.id) {
                    const queueId = fleet.targetData?.id || fleet.targetData?.targetData?.id;
                    if (queueId) {
                        this.removeFromTargetQueue(queueId);
                    }
                }

                // Notify fleet view if we were tracking this fleet
                if (newStar) {
                    this.onFleetArrived(fleet, newStar);
                }

                // Each dot represents ~3.33 million actual stars
                this.dotsColonized++;
                this.starsInfluenced += this.STARS_PER_DOT;

                // Check if we've hit an outpost milestone (every 100 stars)
                this.checkOutpostMilestone();

                // Remove probe but keep trail as a fading remnant
                this.colonizationGroup.remove(fleet.probe);

                // Convert trail to a fading remnant
                if (fleet.trail) {
                    this.addTrailRemnant(fleet.trail, fleet.start, fleet.target);
                }
            } else {
                // Animate probe position
                fleet.probe.position.lerpVectors(fleet.start, fleet.target, fleet.progress);

                // Update trail - reuse pre-allocated buffer (no allocations)
                if (fleet.trail) {
                    const positions = fleet.trail.geometry.attributes.position.array;
                    positions[0] = fleet.start.x;
                    positions[1] = fleet.start.y;
                    positions[2] = fleet.start.z;
                    positions[3] = fleet.probe.position.x;
                    positions[4] = fleet.probe.position.y;
                    positions[5] = fleet.probe.position.z;
                    fleet.trail.geometry.attributes.position.needsUpdate = true;
                }
            }
        }

        // Remove completed fleets
        for (const fleet of completedFleets) {
            const idx = this.probeFleets.indexOf(fleet);
            if (idx > -1) {
                this.probeFleets.splice(idx, 1);
            }
        }

        // Update fading trail remnants
        this.updateTrailRemnants();
    },

    /**
     * Add a completed probe's trail as a fading remnant
     * Creates a permanent line from start to target that slowly fades
     */
    addTrailRemnant(trail, start, target) {
        // Create a new line from start to target (complete path)
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([
            start.clone(),
            target.clone()
        ]);
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x00aa88,  // Slightly different color for remnants
            transparent: true,
            opacity: 0.4
        });
        const remnantLine = new THREE.Line(lineGeometry, lineMaterial);

        const remnant = {
            line: remnantLine,
            createdTime: this.time,
            fadeStartTime: 9000,   // Start fading after ~25 years
            fadeDuration: 9000,    // Fully gone after ~25 more years (50 years total)
            initialOpacity: 0.4
        };

        // Remove the original trail
        this.colonizationGroup.remove(trail);

        // Add remnant line
        this.colonizationGroup.add(remnantLine);
        this.trailRemnants.push(remnant);

        // Limit total remnants to avoid memory issues (reduced from 300 for better performance)
        if (this.trailRemnants.length > 150) {
            const oldRemnant = this.trailRemnants.shift();
            this.colonizationGroup.remove(oldRemnant.line);
            oldRemnant.line.geometry.dispose();
            oldRemnant.line.material.dispose();
        }
    },

    /**
     * Update fading trail remnants
     */
    updateTrailRemnants() {
        const toRemove = [];

        for (const remnant of this.trailRemnants) {
            const age = this.time - remnant.createdTime;

            if (age > remnant.fadeStartTime + remnant.fadeDuration) {
                // Fully faded - remove
                toRemove.push(remnant);
            } else if (age > remnant.fadeStartTime) {
                // Fading
                const fadeProgress = (age - remnant.fadeStartTime) / remnant.fadeDuration;
                remnant.line.material.opacity = remnant.initialOpacity * (1 - fadeProgress);
            }
        }

        // Remove fully faded remnants
        for (const remnant of toRemove) {
            const idx = this.trailRemnants.indexOf(remnant);
            if (idx > -1) {
                this.trailRemnants.splice(idx, 1);
                this.colonizationGroup.remove(remnant.line);
                remnant.line.geometry.dispose();
                remnant.line.material.dispose();
            }
        }
    },

    /**
     * Simulate expansion - called periodically to grow the frontier
     * Uses expansion policy to determine behavior
     */
    simulateExpansion() {
        // DEBUG: Log on every call for first 5 calls
        if (!this._expansionCallCount) this._expansionCallCount = 0;
        this._expansionCallCount++;

        const gameYearsNow = this.time / 365;

        // Log every call for first 5, then periodically
        if (this._expansionCallCount <= 5) {
            const uncolonized = this.colonizationTargets?.filter(t => !t.colonized && t.status !== 'fleet_sent').length || 0;
            console.log('[StarMap] === EXPANSION TICK #' + this._expansionCallCount + ' ===',
                '\n  year:', gameYearsNow.toFixed(2),
                '\n  colonies:', this.colonizedStars?.length,
                '\n  uncolonized:', uncolonized,
                '\n  fleets:', this.probeFleets?.length,
                '\n  timeSpeed:', this.timeSpeedMultiplier,
                '\n  buildExpandBalance:', this.buildExpandBalance);
        } else if (this._expansionCallCount % 120 === 0) {
            const uncolonized = this.colonizationTargets?.filter(t => !t.colonized && t.status !== 'fleet_sent').length || 0;
            console.log('[StarMap] Expansion #' + this._expansionCallCount,
                'year:', gameYearsNow.toFixed(1),
                'colonies:', this.colonizedStars?.length,
                'uncolonized:', uncolonized,
                'fleets:', this.probeFleets?.length);
        }

        // Get game state if available (optional - we can run without it)
        const gameState = window.gameEngine?.getGameState?.();

        const dysonProgress = gameState?.dyson_sphere?.progress || 0;
        const probes = gameState?.derived?.totals?.total_probes || 0;

        // Use expansion allocation slider (0-100)
        // 0 = all resources to Dyson, 100 = all resources to expansion
        const expansionRate = Math.max(0.1, this.buildExpandBalance / 100);  // Use buildExpandBalance directly, min 10%
        const dysonRate = 1 - expansionRate;

        // Base expansion rate - always allow some development even early game
        let baseRate = 0.01;  // Base rate for early game
        if (probes > 1e6) baseRate = 0.02;
        if (probes > 1e9) baseRate = 0.05;
        if (probes > 1e12) baseRate = 0.12;
        if (dysonProgress > 0.1) baseRate += dysonProgress * 0.15;

        // DEVELOPMENT: Develop ALL incomplete stars each tick
        // Rate: 100% build = 50 years to complete, 50% build = 100 years
        // Formula: unitsPerYear = 2 * buildRate (so 2 units/yr at full build, 1 unit/yr at 50%)
        const buildRate = Math.max(0.1, 1 - this.buildExpandBalance / 100);  // 1.0 at full build, 0.1 at full expand
        const unitsPerYear = 2 * buildRate;  // 2 units/yr at full build = 50 years for 100 units

        // Calculate game time per tick (simulateExpansion called every 60 frames = once per real second)
        // Each frame advances daysPerFrame * speedMultiplier, so 60 frames = 7 * speedMultiplier days
        const speedMultiplier = (this.timeSpeedMultiplier || 1);
        const gameDaysPerTick = 60 * (this.daysPerFrame || 7/60) * speedMultiplier;
        const gameYearsPerTick = gameDaysPerTick / 365;

        const actualDevelopment = unitsPerYear * gameYearsPerTick;

        for (const star of this.colonizedStars) {
            const oldTotal = (star.dysonUnits || 0) + (star.productionUnits || 0);
            if (oldTotal >= 100) continue;  // Already fully developed

            // Add development with some randomness (±20%)
            const variance = 0.8 + Math.random() * 0.4;
            this.developStar(star, actualDevelopment * variance);

            const newTotal = (star.dysonUnits || 0) + (star.productionUnits || 0);

            // Update counts when star reaches 100 units (fully developed)
            if (newTotal >= 100 && oldTotal < 100) {
                this.dotsWithDyson++;
                this.starsWithDyson += this.STARS_PER_DOT;
            }
        }

        // EXPANSION: Launch probes from all colonized stars
        // Simple formula based on star development:
        // - 100% production (100 units) = 4 probes/year
        // - 50/50 split = 2 probes/year
        // - 100% dyson (100 units) = 0.01 probes/year
        if (this.probeFleets.length < 100) {
            const speedMultiplier = (this.timeSpeedMultiplier || 1);
            const gameYears = this.time / 365;

            // simulateExpansion is called every 60 frames (once per real second)
            // Each frame advances daysPerFrame * speedMultiplier game days
            // So 60 frames = 60 * daysPerFrame * speedMultiplier = 7 * speedMultiplier days (1 week at 1x)
            const gameDaysPerCall = 60 * (this.daysPerFrame || 7/60) * speedMultiplier;
            const gameYearsPerCall = gameDaysPerCall / 365;

            // Empire bonuses from conquered POAs
            const productionBonus = this.empireBonuses?.production || 1.0;
            const launchBonus = this.empireBonuses?.launch_efficiency || 1.0;

            // Expansion rate from slider (0-100, default 50)
            const expansionRate = Math.max(0.1, this.buildExpandBalance / 100);

            // DEBUG: Log expansion state periodically
            if (!this._expansionDebugCount) this._expansionDebugCount = 0;
            this._expansionDebugCount++;
            if (this._expansionDebugCount <= 5 || this._expansionDebugCount % 120 === 0) {
                const availableTargets = this.colonizationTargets?.filter(t => !t.colonized && t.status !== 'fleet_sent').length || 0;
                console.log('[EXPANSION] year=' + gameYears.toFixed(2) +
                    ' speed=' + speedMultiplier +
                    ' colonies=' + this.colonizedStars?.length +
                    ' targets=' + availableTargets +
                    ' fleets=' + this.probeFleets?.length);
            }

            // Pure probabilistic launch system (exponential random variable)
            // Each star has independent probability of launching each tick
            // This spreads launches naturally and prevents bunching
            for (const star of this.colonizedStars) {
                const productionUnits = star.productionUnits || 0;
                const dysonUnits = star.dysonUnits || 0;
                const totalUnits = productionUnits + dysonUnits;

                // Skip undeveloped stars
                if (totalUnits < 5) continue;

                // Probes per year based on development:
                // Production: 100 units = 1.5 probes/year (Sol at 70 units ≈ 1 probe/year)
                // Dyson: 100 units = 0.1 probes/year (minimal contribution)
                const probesPerYear = (productionUnits / 100) * 1.5 * productionBonus +
                                      (dysonUnits / 100) * 0.1 * launchBonus;

                // Probability of launching this tick (exponential random variable)
                // P(launch) = λ * dt where λ = probesPerYear, dt = gameYearsPerCall
                const launchProbability = probesPerYear * gameYearsPerCall * expansionRate;

                // DEBUG: Log Sol's launch probability on first few calls
                if (star.index === 0 && this._expansionDebugCount <= 5) {
                    console.log('[EXPANSION] Sol: prod=' + productionUnits + ' dyson=' + dysonUnits +
                        ' probesPerYear=' + probesPerYear.toFixed(2) +
                        ' launchProb=' + launchProbability.toFixed(4) +
                        ' expansionRate=' + expansionRate.toFixed(2));
                }

                // Roll for launch (pure probability, no accumulation)
                if (Math.random() < launchProbability && this.probeFleets.length < 100) {
                    const launchGalaxyX = this.solPosition.x + star.position.x;
                    const launchGalaxyY = this.solPosition.y + star.position.y;
                    const launchGalaxyZ = this.solPosition.z + star.position.z;

                    const target = this.findNearestUncolonizedStar(launchGalaxyX, launchGalaxyY, launchGalaxyZ, 200);

                    if (target) {
                        const targetX = target.x - this.solPosition.x;
                        const targetY = target.y - this.solPosition.y;
                        const targetZ = target.z - this.solPosition.z;

                        const fleet = this.launchProbeFleet(targetX, targetY, targetZ, target);
                        if (fleet) {
                            target.status = 'fleet_sent';
                            target.colonized = true;
                            if (target.targetData) {
                                target.targetData.status = 'fleet_sent';
                                target.targetData.colonized = true;
                            }
                            star.lastLaunchTime = this.time;
                            star.probesLaunched = (star.probesLaunched || 0) + 1;
                            this.recordProbeLaunch();
                        } else {
                            // Mark target to skip it
                            target.status = 'fleet_sent';
                            target.colonized = true;
                        }
                    }
                }
            }
        }

        // Sol is already fully developed - no need to sync from game state
        // Its dysonUnits/productionUnits are set at initialization

        // NOTE: Outpost wave system disabled - all probe launches now come from
        // regular star-based production above, spread evenly across all colonies
        // this.updateOutpostWaves();

        // Dynamic POA generation - refresh frontier targets as empire expands
        // Check every 5 new colonies
        if (this.colonizedStars.length % 5 === 0 && this.colonizedStars.length !== this._lastPOARefreshCount) {
            this._lastPOARefreshCount = this.colonizedStars.length;
            this.updateExplorationRadius();
            this.generateFrontierPOAs();
        }

        // Update metrics history for graphs
        this.updateMetricsHistory();
    }

});
