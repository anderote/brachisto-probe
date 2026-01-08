/**
 * Star Map Queue & POA Interaction Mixin
 *
 * Target queue management, POA info panels, conquest notifications,
 * and sector management.
 *
 * This file must be loaded AFTER star_map.js
 */

Object.assign(StarMapVisualization.prototype, {

    /**
     * Queue a conquest notification (rate limited)
     * Notifications are queued and shown with a minimum delay between them
     */
    showConquestNotification(poa) {
        // Initialize notification queue and timing
        if (!this._notificationQueue) this._notificationQueue = [];
        if (!this._lastNotificationTime) this._lastNotificationTime = 0;

        // Rate limiting: minimum 2 seconds between notifications
        const MIN_NOTIFICATION_INTERVAL = 2000;
        // Maximum 3 active notifications at once
        const MAX_ACTIVE_NOTIFICATIONS = 3;

        // Add to queue
        this._notificationQueue.push(poa);

        // Process queue if not already processing
        if (!this._processingNotifications) {
            this._processNotificationQueue();
        }
    },

    /**
     * Process the notification queue with rate limiting
     */
    _processNotificationQueue() {
        if (!this._notificationQueue || this._notificationQueue.length === 0) {
            this._processingNotifications = false;
            return;
        }

        this._processingNotifications = true;
        const MIN_NOTIFICATION_INTERVAL = 2000;
        const MAX_ACTIVE_NOTIFICATIONS = 3;

        // Check if we can show a notification now
        const now = Date.now();
        const timeSinceLast = now - (this._lastNotificationTime || 0);

        // Wait if too many active or too soon
        if (!this._activeNotifications) this._activeNotifications = [];
        if (this._activeNotifications.length >= MAX_ACTIVE_NOTIFICATIONS || timeSinceLast < MIN_NOTIFICATION_INTERVAL) {
            setTimeout(() => this._processNotificationQueue(), MIN_NOTIFICATION_INTERVAL - timeSinceLast + 100);
            return;
        }

        // Show next notification
        const poa = this._notificationQueue.shift();
        this._lastNotificationTime = now;
        this._displayNotification(poa);

        // Continue processing queue
        if (this._notificationQueue.length > 0) {
            setTimeout(() => this._processNotificationQueue(), MIN_NOTIFICATION_INTERVAL);
        } else {
            this._processingNotifications = false;
        }
    },

    /**
     * Actually display a notification (called by queue processor)
     */
    _displayNotification(poa) {
        if (!this._activeNotifications) this._activeNotifications = [];

        const notification = document.createElement('div');
        notification.className = 'conquest-notification';
        notification.innerHTML = `
            <div class="conquest-header">
                <span class="conquest-icon">★</span>
                <span class="conquest-title">COLONIZED</span>
            </div>
            <div class="conquest-name">${poa.name}</div>
            <div class="conquest-bonus">${poa.bonusDescription}</div>
            <div class="conquest-hint">Click to view</div>
        `;

        // Stack notifications - each one goes higher
        const stackOffset = this._activeNotifications.length * 70;
        notification.style.bottom = `${20 + stackOffset}px`;

        // Add click handler to navigate camera to this location
        notification.style.cursor = 'pointer';
        notification.addEventListener('click', () => {
            // Navigate to POA position (calculate from POA data)
            const localX = poa.position.x - this.solPosition.x;
            const localY = poa.position.y - this.solPosition.y;
            const localZ = poa.position.z - this.solPosition.z;
            const worldPos = new THREE.Vector3(localX, localY, localZ);
            if (this.colonizationGroup) {
                worldPos.applyMatrix4(this.colonizationGroup.matrixWorld);
            }
            this.goToPosition(worldPos, 5);
            // Dismiss notification on click
            notification.classList.remove('visible');
            setTimeout(() => notification.remove(), 300);
        });

        document.body.appendChild(notification);
        this._activeNotifications.push(notification);

        // Animate in
        setTimeout(() => notification.classList.add('visible'), 10);

        // Remove after 5 seconds (longer since user might want to click)
        const removeTimer = setTimeout(() => {
            notification.classList.remove('visible');
            setTimeout(() => {
                notification.remove();
                // Remove from tracking array
                const idx = this._activeNotifications.indexOf(notification);
                if (idx > -1) this._activeNotifications.splice(idx, 1);
                // Reposition remaining notifications
                this._activeNotifications.forEach((n, i) => {
                    n.style.bottom = `${20 + i * 70}px`;
                });
            }, 300);
        }, 5000);

        // Store timer on element so we can cancel it if clicked
        notification._removeTimer = removeTimer;
    },

    /**
     * Show a special notification for new sector establishment
     */
    showSectorNotification(poa, distanceLY) {
        const notification = document.createElement('div');
        notification.className = 'sector-notification';
        notification.innerHTML = `
            <div class="sector-header">
                <span class="sector-icon">◆</span>
                <span class="sector-title">NEW SECTOR ESTABLISHED</span>
            </div>
            <div class="sector-name">${poa.name}</div>
            <div class="sector-distance">${(distanceLY / 1000).toFixed(1)} kly from nearest colony</div>
            <div class="sector-bonus">${poa.bonusDescription}</div>
        `;

        // Click to navigate
        notification.style.cursor = 'pointer';
        notification.addEventListener('click', () => {
            // Navigate to POA position (calculate from POA data)
            const localX = poa.position.x - this.solPosition.x;
            const localY = poa.position.y - this.solPosition.y;
            const localZ = poa.position.z - this.solPosition.z;
            const worldPos = new THREE.Vector3(localX, localY, localZ);
            if (this.colonizationGroup) {
                worldPos.applyMatrix4(this.colonizationGroup.matrixWorld);
            }
            this.goToPosition(worldPos, 5);
            notification.classList.remove('visible');
            setTimeout(() => notification.remove(), 300);
        });

        document.body.appendChild(notification);
        setTimeout(() => notification.classList.add('visible'), 10);
        setTimeout(() => {
            notification.classList.remove('visible');
            setTimeout(() => notification.remove(), 300);
        }, 8000);  // Longer display for sector events
    },

    /**
     * Smoothly navigate camera to a target position, preserving current zoom
     */
    navigateCameraTo(x, y, z, duration = 1000) {
        const target = new THREE.Vector3(x, y, z);
        const startTarget = this.controls.target.clone();
        const startPos = this.camera.position.clone();

        // Preserve current camera offset (zoom level) from target
        const currentOffset = startPos.clone().sub(startTarget);
        const endPos = target.clone().add(currentOffset);

        const startTime = Date.now();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const t = Math.min(1, elapsed / duration);
            // Smooth easing
            const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            this.controls.target.lerpVectors(startTarget, target, ease);
            this.camera.position.lerpVectors(startPos, endPos, ease);
            this.controls.update();

            if (t < 1) {
                requestAnimationFrame(animate);
            }
        };

        animate();
    },

    /**
     * Apply bonus from a colonized POA
     */
    applyPOABonus(poa) {
        switch (poa.bonusType) {
            // === STANDARD BONUSES ===
            case 'production':
                this.empireBonuses.production += poa.bonusValue;
                break;
            case 'dyson_efficiency':
                this.empireBonuses.dyson_efficiency += poa.bonusValue;
                break;
            case 'launch_efficiency':
                this.empireBonuses.launch_efficiency = Math.max(0.1, this.empireBonuses.launch_efficiency - poa.bonusValue);
                break;
            case 'development_speed':
                this.empireBonuses.development_speed += poa.bonusValue;
                break;
            case 'research':
                this.empireBonuses.research += poa.bonusValue;
                break;
            case 'frontier_beacon':
                // Generate new POAs (to be implemented)
                console.log(`[StarMap] Frontier beacon reveals ${poa.bonusValue} new POAs`);
                break;
            case 'habitable':
                // Track habitable worlds (to be implemented)
                console.log(`[StarMap] Habitable world discovered!`);
                break;

            // === EXOTIC BONUSES (far halo objects) ===
            case 'probe_velocity':
                // Increase probe travel speed
                this.empireBonuses.probe_velocity += poa.bonusValue;
                console.log(`[StarMap] EXOTIC: Probe velocity +${(poa.bonusValue * 100).toFixed(0)}%`);
                break;
            case 'expansion_radius':
                // Increase maximum probe range
                this.empireBonuses.expansion_radius += poa.bonusValue;
                console.log(`[StarMap] EXOTIC: Expansion radius +${(poa.bonusValue * 100).toFixed(0)}%`);
                break;
            case 'auto_develop':
                // Chance for new colonies to auto-develop
                this.empireBonuses.auto_develop_chance = Math.min(1.0, this.empireBonuses.auto_develop_chance + poa.bonusValue);
                console.log(`[StarMap] EXOTIC: Auto-develop chance now ${(this.empireBonuses.auto_develop_chance * 100).toFixed(0)}%`);
                break;
            case 'stellar_forge':
                // Multiplier for ALL bonuses (meta-bonus)
                this.empireBonuses.stellar_forge_mult += poa.bonusValue;
                console.log(`[StarMap] EXOTIC: Stellar Forge multiplier now ${this.empireBonuses.stellar_forge_mult.toFixed(2)}x`);
                break;
            case 'dark_energy_tap':
                // Flat energy bonus per tick
                this.empireBonuses.dark_energy_tap += poa.bonusValue;
                console.log(`[StarMap] EXOTIC: Dark Energy Tap +${poa.bonusValue} energy/tick`);
                break;
            case 'wormhole_network':
                // Unlock wormhole connections
                this.empireBonuses.wormhole_network += poa.bonusValue;
                console.log(`[StarMap] EXOTIC: Wormhole Network +${poa.bonusValue} connections`);
                break;
            case 'time_dilation':
                // Speed up time locally
                this.empireBonuses.time_dilation += poa.bonusValue;
                console.log(`[StarMap] EXOTIC: Time Dilation now ${this.empireBonuses.time_dilation.toFixed(2)}x`);
                break;
            case 'exotic_matter':
                // Exotic matter for special builds
                this.empireBonuses.exotic_matter += poa.bonusValue;
                console.log(`[StarMap] EXOTIC: Exotic Matter +${poa.bonusValue} units`);
                break;
            case 'all_bonuses':
                // Boost ALL empire bonuses by percentage
                const mult = 1 + poa.bonusValue;
                this.empireBonuses.production *= mult;
                this.empireBonuses.dyson_efficiency *= mult;
                this.empireBonuses.development_speed *= mult;
                this.empireBonuses.probe_velocity *= mult;
                this.empireBonuses.expansion_radius *= mult;
                console.log(`[StarMap] EXOTIC: ALL BONUSES +${(poa.bonusValue * 100).toFixed(0)}%`);
                break;
        }

        console.log('[StarMap] Empire bonuses updated:', this.empireBonuses);
    },

    /**
     * Check if a newly colonized star is pioneering a new region
     * If it's far from all other colonies, it becomes a dynamic POA
     * Rate limited to prevent too many POA discoveries at once
     */
    checkPioneerColony(newStar, targetPosition) {
        // Need at least 5 colonies before considering pioneers
        if (this.colonizedStars.length < 5) return;

        // Rate limiting: minimum 2 seconds (real time) between pioneer discoveries
        const MIN_PIONEER_INTERVAL = 2000;
        const now = Date.now();
        if (this._lastPioneerTime && now - this._lastPioneerTime < MIN_PIONEER_INTERVAL) {
            return;  // Too soon since last pioneer
        }

        // Limit total dynamic POAs to prevent clutter
        const MAX_DYNAMIC_POAS = 50;
        const dynamicPOACount = this.pointsOfAttraction.filter(p => p.isDynamic).length;
        if (dynamicPOACount >= MAX_DYNAMIC_POAS) {
            return;  // Already have enough dynamic POAs
        }

        // Sector size for determining which sector a star belongs to
        // ~25,000 ly per sector (matching countColonizedSectors)
        const SECTOR_SIZE = 25000 / 326;

        // Determine new star's sector
        const newSectorX = Math.floor(newStar.position.x / SECTOR_SIZE);
        const newSectorY = Math.floor(newStar.position.y / SECTOR_SIZE);
        const newSectorZ = Math.floor(newStar.position.z / SECTOR_SIZE);
        const newSectorKey = `${newSectorX},${newSectorY},${newSectorZ}`;

        // Find distance to nearest star in a DIFFERENT sector
        let nearestDist = Infinity;
        for (const star of this.colonizedStars) {
            if (star === newStar) continue;

            // Check if star is in a different sector
            const starSectorX = Math.floor(star.position.x / SECTOR_SIZE);
            const starSectorY = Math.floor(star.position.y / SECTOR_SIZE);
            const starSectorZ = Math.floor(star.position.z / SECTOR_SIZE);
            const starSectorKey = `${starSectorX},${starSectorY},${starSectorZ}`;

            if (starSectorKey !== newSectorKey) {
                const dist = newStar.position.distanceTo(star.position);
                if (dist < nearestDist) {
                    nearestDist = dist;
                }
            }
        }

        // Pioneer threshold: ~15,000 ly from nearest star in different sector
        // 15,000 ly / 326 = ~46 units
        const pioneerThreshold = 15000 / 326;

        if (nearestDist > pioneerThreshold) {
            // This is a pioneer colony! Create a new sector
            this._lastPioneerTime = now;
            this.createNewSector(newStar, targetPosition, nearestDist);
        }
    },

    /**
     * Create a new sector when a colony is established far from others
     */
    createNewSector(star, targetPosition, distanceFromNearest) {
        // Generate a unique POA-style sector name
        const sectorNames = [
            // Greek letter + location
            'Arcturus Reach', 'Sigma Expanse', 'Tau Frontier', 'Omega Terminus',
            'Alpha Traverse', 'Delta Rim', 'Gamma Void', 'Epsilon Gate',
            'Zeta Drift', 'Theta Boundary', 'Lambda March', 'Kappa Verge',
            // Evocative sci-fi names
            'The Shoals', 'Terminus Gate', 'Far Horizon', 'The Barrens',
            'Void\'s Edge', 'Starfall Reach', 'Luminous Drift', 'Silent Expanse',
            'Darkwater Rim', 'Sunless Deep', 'The Periphery', 'Frostlight Zone',
            'Ember Drift', 'Crystalline Reach', 'The Hollow', 'Shatterpoint',
            // Mythological
            'Elysium Gate', 'Styx Crossing', 'Tartarus Rim', 'Hyperion Reach',
            'Acheron Drift', 'Lethe Expanse', 'Cocytus Void', 'Phlegethon Edge',
            // Directional/Positional
            'Coreward Marches', 'Rimward Frontier', 'Spinward Reach', 'Trailing Edge',
            'Galactic North', 'Southern Drift', 'Eastern Traverse', 'Western Void',
            // Discovery themed
            'New Horizons', 'Pioneer\'s Rest', 'Pathfinder Gate', 'Vanguard Station',
            'Waypoint Sigma', 'Haven Reach', 'Sanctuary Drift', 'Refuge Point',
            // Mysterious
            'The Anomaly', 'Null Space', 'The Fracture', 'Temporal Drift',
            'Quantum Reach', 'The Singularity', 'Event Horizon', 'Phase Gate',
            // Material/Element
            'Iron Reach', 'Cobalt Drift', 'Chromium Gate', 'Platinum Expanse',
            'Obsidian Rim', 'Adamantine Frontier', 'Orichalcum Deep', 'Neutronium Point'
        ];

        // Pick a random name, ensuring uniqueness
        let name;
        const usedNames = this.pointsOfAttraction.filter(p => p.isSector).map(p => p.name);
        const availableNames = sectorNames.filter(n => !usedNames.includes(n));

        if (availableNames.length > 0) {
            name = availableNames[Math.floor(Math.random() * availableNames.length)];
        } else {
            // Fallback: generate unique name with number
            const baseNames = ['Sector', 'Reach', 'Expanse', 'Drift', 'Gate'];
            const base = baseNames[Math.floor(Math.random() * baseNames.length)];
            name = `${base} ${this.colonizedStars.length}`;
        }

        // Distance-based bonus scaling (farther = better bonus)
        const distanceLY = Math.round(distanceFromNearest * 326);
        const bonusScale = Math.min(2, distanceFromNearest / 10);  // Up to 2x bonus for very distant

        // Random bonus type
        const bonusTypes = [
            { type: 'production', value: 0.05 * bonusScale, desc: `Frontier Hub: +${Math.round(5 * bonusScale)}% Production` },
            { type: 'development_speed', value: 0.05 * bonusScale, desc: `Pioneer Spirit: +${Math.round(5 * bonusScale)}% Development Speed` },
            { type: 'launch_efficiency', value: 0.05 * bonusScale, desc: `Staging Point: -${Math.round(5 * bonusScale)}% Launch Cooldown` },
            { type: 'dyson_efficiency', value: 0.03 * bonusScale, desc: `Energy Node: +${Math.round(3 * bonusScale)}% Dyson Efficiency` }
        ];
        const bonus = bonusTypes[Math.floor(Math.random() * bonusTypes.length)];

        // Create the POA
        const poa = {
            id: `sector_${Date.now()}`,
            name: name,
            distance: distanceLY,
            spectralType: 'Sector',
            bonusType: bonus.type,
            bonusValue: bonus.value,
            bonusDescription: bonus.desc,
            colonized: true,
            status: 'colonized',
            isDynamic: true,
            isSector: true,
            position: {
                x: targetPosition.x,
                y: targetPosition.y,
                z: targetPosition.z
            }
        };

        // Add to POA list
        this.pointsOfAttraction.push(poa);

        // Apply the bonus
        this.applyPOABonus(poa);

        // Create visual marker
        this.createPOAMarkerForPioneer(poa, star.position);

        // Show sector established notification
        this.showSectorNotification(poa, distanceLY);

        // Recreate POA labels to include new sector
        this.createPOALabels();

        console.log(`[StarMap] NEW SECTOR ESTABLISHED: ${name} (${distanceLY} ly from nearest colony)`);
    },

    /**
     * Create POA marker for a pioneer colony
     */
    createPOAMarkerForPioneer(poa, position) {
        // Create a distinctive marker for pioneer POAs - diamond shape
        const geometry = new THREE.OctahedronGeometry(0.4, 0);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff8800,  // Orange for pioneer
            transparent: true,
            opacity: 0.8,
            wireframe: true
        });
        const marker = new THREE.Mesh(geometry, material);
        marker.position.copy(position);
        marker.userData.poaId = poa.id;
        marker.userData.isPioneer = true;

        this.colonizationGroup.add(marker);
        this.poaMarkers.push(marker);
    },

    /**
     * Handle POA colonization when a probe arrives
     */
    onPOAColonized(poa) {
        poa.colonized = true;
        poa.status = 'colonized';

        // Apply the bonus
        this.applyPOABonus(poa);

        // Show notification
        this.showConquestNotification(poa);

        // Update the POA marker to show colonized state
        const marker = this.poaMarkers.find(m => m.userData.poaId === poa.id);
        if (marker) {
            marker.material.color.setHex(0x00ff88);  // Green for colonized
            marker.material.opacity = 1.0;
        }

        // Remove from target queue / corridor if it was queued
        this.removeCorridorByPOA(poa);
    },

    /**
     * Remove a corridor when its target POA is colonized
     */
    removeCorridorByPOA(poa) {
        // Find matching queue entry by position or ID
        const idx = this.targetQueue.findIndex(entry => {
            // Match by ID if available
            if (entry.id === poa.id) return true;
            // Match by position (close enough)
            if (poa.position) {
                const dx = Math.abs(entry.x - poa.position.x);
                const dy = Math.abs(entry.y - poa.position.y);
                const dz = Math.abs(entry.z - poa.position.z);
                return dx < 0.1 && dy < 0.1 && dz < 0.1;
            }
            return false;
        });

        if (idx >= 0) {
            const entry = this.targetQueue[idx];
            console.log(`[StarMap] Corridor to ${entry.name} completed - removing from queue`);

            // Remove queue marker
            this.removeQueueMarker(entry.id);

            // Remove from queue
            this.targetQueue.splice(idx, 1);

            // Renumber remaining entries
            this.targetQueue.forEach((t, i) => {
                t.queuePosition = i + 1;
            });

            // Refresh UI
            this.refreshQueueMarkers();
            this.updateTargetQueueDisplay();
        }
    },

    // ==========================================
    // TARGET QUEUE SYSTEM
    // ==========================================

    /**
     * Add a star to the target queue / colonization corridor (max 10 targets)
     * Each queued target creates a "corridor" - nearby colonies will bias their
     * probe directions towards stars along this corridor until the target is reached.
     */
    addToTargetQueue(starId) {
        const MAX_QUEUE = 20;  // Up to 20 colonization corridors

        // Find the star data
        const star = this.starData?.stars?.find(s => s.id === starId);
        if (!star) return false;

        // Check if already in queue
        if (this.targetQueue.some(t => t.id === starId)) {
            console.log('[StarMap] Target already in queue:', star.name);
            return false;
        }

        // Check queue full
        if (this.targetQueue.length >= MAX_QUEUE) {
            console.log('[StarMap] Target queue full');
            return false;
        }

        // Find or create a colonization target for this star
        let target = this.colonizationTargets.find(t =>
            Math.abs(t.x - star.galactic_x) < 0.01 &&
            Math.abs(t.y - star.galactic_y) < 0.01 &&
            Math.abs(t.z - star.galactic_z) < 0.01
        );

        if (!target) {
            // Create new target entry
            target = {
                x: star.galactic_x,
                y: star.galactic_y,
                z: star.galactic_z,
                colonized: false,
                dysonProgress: 0,
                name: star.name,
                starId: star.id,
                isQueued: true
            };
            this.colonizationTargets.push(target);
        }

        // Add to queue
        const queueEntry = {
            id: starId,
            name: star.name,
            x: star.galactic_x,
            y: star.galactic_y,
            z: star.galactic_z,
            target: target,
            queuePosition: this.targetQueue.length + 1
        };
        this.targetQueue.push(queueEntry);
        target.isQueued = true;

        // Create visual marker
        this.createQueueMarker(queueEntry);

        // Update queue display
        this.updateTargetQueueDisplay();

        // Update star info panel
        this.updateQueueButton(starId);

        console.log(`[StarMap] Added ${star.name} to target queue (position ${queueEntry.queuePosition})`);

        // Immediately intercept a probe and send it to this target
        this.interceptProbeForTarget(queueEntry);

        return true;
    },

    /**
     * Intercept the next available probe and send it to a queued target.
     * Finds the closest colonized star to the target and launches from there.
     */
    interceptProbeForTarget(queueEntry) {
        if (!queueEntry || queueEntry.probeSent) return false;

        const targetX = queueEntry.x;
        const targetY = queueEntry.y;
        const targetZ = queueEntry.z;

        // Find the closest colonized star to the target
        let closestStar = null;
        let closestDist = Infinity;

        for (const star of this.colonizedStars) {
            // Calculate distance from this colony to the target (in galaxy coords)
            const starGalaxyX = this.solPosition.x + star.position.x;
            const starGalaxyY = this.solPosition.y + star.position.y;
            const starGalaxyZ = this.solPosition.z + star.position.z;

            const dx = targetX - starGalaxyX;
            const dy = targetY - starGalaxyY;
            const dz = targetZ - starGalaxyZ;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < closestDist) {
                closestDist = dist;
                closestStar = star;
            }
        }

        if (!closestStar) {
            console.log('[StarMap] No colonized star found to intercept probe from');
            return false;
        }

        // Launch probe from closest star to the target
        const launchX = this.solPosition.x + closestStar.position.x;
        const launchY = this.solPosition.y + closestStar.position.y;
        const launchZ = this.solPosition.z + closestStar.position.z;

        // Target position relative to Sol (for launchProbeFleet)
        const relTargetX = targetX - this.solPosition.x;
        const relTargetY = targetY - this.solPosition.y;
        const relTargetZ = targetZ - this.solPosition.z;

        // Find or create the colonization target
        let target = queueEntry.target;
        if (!target) {
            target = this.colonizationTargets.find(t =>
                Math.abs(t.x - targetX) < 0.01 &&
                Math.abs(t.y - targetY) < 0.01 &&
                Math.abs(t.z - targetZ) < 0.01
            );
        }

        // Launch the probe with forceQueue=true to bypass hop range check
        const fleet = this.launchProbeFleet(relTargetX, relTargetY, relTargetZ, target, true);
        if (fleet) {
            queueEntry.probeSent = true;
            if (target) {
                target.status = 'fleet_sent';
            }
            closestStar.probesLaunched = (closestStar.probesLaunched || 0) + 1;
            this.recordProbeLaunch();

            const distLY = (closestDist * 326).toFixed(0);
            console.log(`[StarMap] Intercepted probe from colony #${closestStar.index} -> ${queueEntry.name} (${distLY} ly)`);
            return true;
        }

        return false;
    },

    /**
     * Remove a star from the target queue
     */
    removeFromTargetQueue(starId) {
        const idx = this.targetQueue.findIndex(t => t.id === starId);
        if (idx < 0) return false;

        const entry = this.targetQueue[idx];

        // Remove queue marker
        this.removeQueueMarker(starId);

        // Update target
        if (entry.target) {
            entry.target.isQueued = false;
        }

        // Remove from queue
        this.targetQueue.splice(idx, 1);

        // Renumber remaining entries
        this.targetQueue.forEach((t, i) => {
            t.queuePosition = i + 1;
        });

        // Refresh markers
        this.refreshQueueMarkers();

        // Update display
        this.updateTargetQueueDisplay();

        // Update star info panel if this star is selected
        if (this.selectedStar === starId) {
            this.updateQueueButton(starId);
        }

        console.log(`[StarMap] Removed from target queue (was position ${idx + 1})`);
        return true;
    },

    /**
     * Create visual marker for queued target
     */
    createQueueMarker(queueEntry) {
        const colors = [0xff8800, 0xffaa00, 0xffcc00, 0xffdd00, 0xffee00];  // Orange gradient
        const color = colors[Math.min(queueEntry.queuePosition - 1, colors.length - 1)];

        // Create ring around target
        const geometry = new THREE.RingGeometry(0.5, 0.65, 32);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthTest: false
        });
        const marker = new THREE.Mesh(geometry, material);

        // Position relative to Sol
        marker.position.set(
            queueEntry.x - this.solPosition.x,
            queueEntry.y - this.solPosition.y,
            queueEntry.z - this.solPosition.z
        );
        marker.userData.queueId = queueEntry.id;
        marker.userData.queuePosition = queueEntry.queuePosition;

        this.colonizationGroup.add(marker);
        this.queueMarkers.push(marker);
    },

    /**
     * Remove queue marker for a star
     */
    removeQueueMarker(starId) {
        const idx = this.queueMarkers.findIndex(m => m.userData.queueId === starId);
        if (idx >= 0) {
            const marker = this.queueMarkers[idx];
            this.colonizationGroup.remove(marker);
            marker.geometry.dispose();
            marker.material.dispose();
            this.queueMarkers.splice(idx, 1);
        }
    },

    /**
     * Refresh all queue markers (after reordering)
     */
    refreshQueueMarkers() {
        // Remove all markers
        for (const marker of this.queueMarkers) {
            this.colonizationGroup.remove(marker);
            marker.geometry.dispose();
            marker.material.dispose();
        }
        this.queueMarkers = [];

        // Recreate for current queue
        for (const entry of this.targetQueue) {
            this.createQueueMarker(entry);
        }
    },

    /**
     * Update the queue button state in star info panel
     */
    updateQueueButton(starId) {
        const btn = document.getElementById('btn-add-to-queue');
        if (!btn) return;

        const isQueued = this.targetQueue.some(t => t.id === starId);
        const isFull = this.targetQueue.length >= 5;

        if (isQueued) {
            btn.textContent = 'In Queue';
            btn.disabled = true;
            btn.classList.add('queued');
        } else if (isFull) {
            btn.textContent = 'Queue Full';
            btn.disabled = true;
            btn.classList.remove('queued');
        } else {
            btn.textContent = 'Add to Queue';
            btn.disabled = false;
            btn.classList.remove('queued');
        }
    },

    /**
     * Update the target queue display as bottom tile bar with bonuses
     */
    updateTargetQueueDisplay() {
        let panel = document.getElementById('target-queue-panel');

        // Create panel if doesn't exist
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'target-queue-panel';
            panel.className = 'target-queue-bottom-bar';
            panel.innerHTML = '<div class="queue-tiles"></div>';
            this.container.appendChild(panel);
        }

        const tilesContainer = panel.querySelector('.queue-tiles');
        if (!tilesContainer) return;

        if (this.targetQueue.length === 0) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'flex';

        // Scale down tiles when queue is large
        const queueSize = this.targetQueue.length;
        const isCompact = queueSize > 8;
        const isVeryCompact = queueSize > 14;
        tilesContainer.className = 'queue-tiles' +
            (isVeryCompact ? ' very-compact' : isCompact ? ' compact' : '');

        tilesContainer.innerHTML = this.targetQueue.map((t, i) => {
            // Find the POA data for bonus info
            const poa = this.pointsOfAttraction?.find(p => p.id === t.id);
            const bonusText = poa?.bonusDescription || t.bonusDescription || '';
            const shortBonus = bonusText.split(':')[0] || 'Target';  // Just the title part

            // For compact mode, just show number and abbreviated name
            const displayName = isVeryCompact ? (t.name?.substring(0, 3) || '?') :
                               isCompact ? (t.name?.substring(0, 6) || t.name) : t.name;

            return `
                <div class="queue-tile" data-target-id="${t.id}" onclick="window.starMapVisualization?.navigateAndShowPOA('${t.id}')" title="${t.name}: ${shortBonus}">
                    <div class="tile-number">${i + 1}</div>
                    ${isVeryCompact ? '' : `<div class="tile-name">${displayName}</div>`}
                    ${isCompact ? '' : `<div class="tile-bonus">${shortBonus}</div>`}
                    <button class="tile-remove" onclick="event.stopPropagation(); window.starMapVisualization?.removeFromTargetQueue('${t.id}')">×</button>
                </div>
            `;
        }).join('');
    },

    /**
     * Navigate to a POA and show its info panel (if not colonized)
     * Called when clicking queue tiles or POA labels
     */
    navigateAndShowPOA(poaId) {
        console.log('[StarMap] navigateAndShowPOA called for:', poaId);

        const poa = this.pointsOfAttraction?.find(p => p.id === poaId);

        // Navigate to the POA
        this.navigateToPOA(poaId);

        // Only show info panel if POA is not colonized
        // Colonized POAs just get camera focus, no dialog
        if (poa && !poa.colonized) {
            this.showPOAInfo(poaId);
        }
    },

    /**
     * Show POA info panel for a given POA ID
     * Redesigned for better UX and cleaner code
     */
    showPOAInfo(poaId) {
        console.log('[StarMap] showPOAInfo called for:', poaId);
        const poa = this.pointsOfAttraction?.find(p => p.id === poaId);
        if (!poa) {
            console.log('[StarMap] POA not found:', poaId);
            return;
        }

        // Remove existing panel if any
        this.closePOAInfo();

        // Calculate distance from Sol
        const dx = poa.position.x - this.solPosition.x;
        const dy = poa.position.y - this.solPosition.y;
        const dz = poa.position.z - this.solPosition.z;
        const distUnits = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const distLY = Math.round(distUnits * 326);

        // Format distance nicely
        let distStr;
        if (distLY < 100) {
            distStr = `${distLY} ly`;
        } else if (distLY < 10000) {
            distStr = `${(distLY / 1000).toFixed(2)} kly`;
        } else {
            distStr = `${(distLY / 1000).toFixed(0)} kly`;
        }

        // Check queue status
        const isQueued = this.targetQueue.some(t => t.id === poaId);
        const queueFull = this.targetQueue.length >= 20;
        const hasFleetEnRoute = poa.status === 'fleet_sent';

        // Determine status display
        let statusText, statusClass;
        if (poa.colonized) {
            statusText = 'Colonized';
            statusClass = 'status-colonized';
        } else if (hasFleetEnRoute) {
            statusText = 'Fleet En Route';
            statusClass = 'status-enroute';
        } else if (isQueued) {
            statusText = 'Queued';
            statusClass = 'status-queued';
        } else {
            statusText = 'Unexplored';
            statusClass = 'status-unexplored';
        }

        // Create panel
        const panel = document.createElement('div');
        panel.id = 'poa-info-panel';
        panel.className = 'poa-info-panel';

        panel.innerHTML = `
            <div class="poa-header">
                <div class="poa-title">
                    <span class="poa-name">${poa.name}</span>
                    <span class="poa-type">${poa.spectralType || poa.type || ''}</span>
                </div>
                <button class="poa-close" tabindex="-1" onclick="window.starMapVisualization?.closePOAInfo()">×</button>
            </div>
            <div class="poa-body">
                <div class="poa-stats">
                    <div class="poa-stat">
                        <span class="stat-label">Distance</span>
                        <span class="stat-value">${distStr}</span>
                    </div>
                    <div class="poa-stat">
                        <span class="stat-label">Status</span>
                        <span class="stat-value ${statusClass}">${statusText}</span>
                    </div>
                </div>
                ${poa.bonusDescription ? `
                    <div class="poa-bonus">
                        <div class="bonus-icon">★</div>
                        <div class="bonus-text">${poa.bonusDescription}</div>
                    </div>
                ` : ''}
                ${poa.lore ? `<div class="poa-lore">${poa.lore}</div>` : ''}
            </div>
            <div class="poa-actions">
                ${!poa.colonized ? `
                    <button class="poa-btn target-btn" onclick="window.starMapVisualization?.addPOAToQueueAndRefresh('${poaId}')"
                            tabindex="-1"
                            ${isQueued || queueFull || hasFleetEnRoute ? 'disabled' : ''}>
                        ${isQueued ? 'In Queue' : queueFull ? 'Queue Full' : hasFleetEnRoute ? 'Fleet Sent' : 'Set as Colony Target [Space]'}
                    </button>
                ` : `
                    <span class="colonized-badge">Colonized</span>
                `}
            </div>
        `;

        // Append to body for proper z-index
        document.body.appendChild(panel);
        this.selectedPOA = poaId;

        // Animate in
        requestAnimationFrame(() => panel.classList.add('visible'));

        console.log(`[StarMap] Showing POA info: ${poa.name} at ${distStr}`);
    },

    /**
     * Close the POA info panel
     */
    closePOAInfo() {
        console.log('[StarMap] closePOAInfo called');
        const panel = document.getElementById('poa-info-panel');
        if (panel) {
            panel.classList.remove('visible');
            setTimeout(() => panel.remove(), 200);
        }
        this.selectedPOA = null;
    },

    /**
     * Add POA to queue and close the info panel
     */
    addPOAToQueueAndRefresh(poaId) {
        if (this.addPOAToTargetQueue(poaId)) {
            this.closePOAInfo();  // Close panel after setting target
        }
    },

    /**
     * Add a POA to the target queue
     */
    addPOAToTargetQueue(poaId) {
        const poa = this.pointsOfAttraction?.find(p => p.id === poaId);
        if (!poa || poa.colonized) return false;

        const MAX_QUEUE = 20;

        // Check if already in queue
        if (this.targetQueue.some(t => t.id === poaId)) {
            console.log('[StarMap] POA already in queue:', poa.name);
            return false;
        }

        // Check queue full
        if (this.targetQueue.length >= MAX_QUEUE) {
            console.log('[StarMap] Target queue full');
            return false;
        }

        // Create queue entry
        const queueEntry = {
            id: poaId,
            name: poa.name,
            x: poa.position.x,
            y: poa.position.y,
            z: poa.position.z,
            bonusDescription: poa.bonusDescription,
            target: poa,
            queuePosition: this.targetQueue.length + 1
        };

        this.targetQueue.push(queueEntry);
        poa.isQueued = true;

        // Create visual marker
        this.createQueueMarker(queueEntry);

        // Update displays
        this.updateTargetQueueDisplay();

        console.log(`[StarMap] Added ${poa.name} to target queue (position ${queueEntry.queuePosition})`);

        // Immediately intercept a probe and send it to this target
        this.interceptProbeForTarget(queueEntry);

        return true;
    },

    /**
     * Navigate camera to a POA
     */
    navigateToPOA(poaId) {
        const poa = this.pointsOfAttraction?.find(p => p.id === poaId);
        if (!poa) {
            console.warn('[StarMap] POA not found:', poaId);
            return;
        }

        console.log(`[StarMap] navigateToPOA: ${poa.name}, position:`, poa.position);

        // Find the POA marker mesh if it exists
        const poaMarker = this.poaMarkers?.find(m => m.userData?.poaId === poaId);
        console.log('[StarMap] POA marker found:', !!poaMarker, 'total markers:', this.poaMarkers?.length);

        if (poaMarker) {
            // Navigate to the marker mesh and follow it
            const worldPos = new THREE.Vector3();
            poaMarker.getWorldPosition(worldPos);
            console.log('[StarMap] Marker world position:', worldPos);

            // Use a fixed close zoom for POAs
            this.goToPositionAndFollow(worldPos, poaMarker, 3);
        } else {
            // No marker - calculate position from POA data
            // POA position is in galaxy coordinates, need to convert to local (Sol at origin)
            const localX = poa.position.x - this.solPosition.x;
            const localY = poa.position.y - this.solPosition.y;
            const localZ = poa.position.z - this.solPosition.z;
            const localPos = new THREE.Vector3(localX, localY, localZ);
            console.log('[StarMap] Calculated local position:', localPos);

            // Transform to world coords through colonizationGroup
            const worldPos = localPos.clone();
            if (this.colonizationGroup) {
                worldPos.applyMatrix4(this.colonizationGroup.matrixWorld);
            }
            console.log('[StarMap] Transformed world position:', worldPos);

            this.goToPosition(worldPos, 3);
        }

        console.log(`[StarMap] Navigating to POA: ${poa.name}`);
    },

    /**
     * Move camera to target with specific zoom distance
     */
    moveCameraToTargetWithZoom(newTarget, zoomDistance, animate = true) {
        if (!this.camera || !this.controls) return;

        // Calculate camera offset direction (from current position, pointing at new target)
        // Use a sensible default direction if camera is at target
        let direction = this.camera.position.clone().sub(this.controls.target);
        if (direction.length() < 0.01) {
            direction = new THREE.Vector3(0, 0.3, 1);  // Default: slightly above, looking down
        }
        direction.normalize();

        // New camera position: target + offset at specified distance
        const newCameraPos = newTarget.clone().add(direction.multiplyScalar(zoomDistance));

        if (animate) {
            const startPos = this.camera.position.clone();
            const startTarget = this.controls.target.clone();
            let progress = 0;

            const animateCamera = () => {
                progress += 0.05;  // Smooth animation
                if (progress >= 1) {
                    this.camera.position.copy(newCameraPos);
                    this.controls.target.copy(newTarget);
                    this.controls.update();
                    return;
                }
                const t = 1 - Math.pow(1 - progress, 3);  // Ease out cubic
                this.camera.position.lerpVectors(startPos, newCameraPos, t);
                this.controls.target.lerpVectors(startTarget, newTarget, t);
                this.controls.update();
                requestAnimationFrame(animateCamera);
            };
            animateCamera();
        } else {
            this.camera.position.copy(newCameraPos);
            this.controls.target.copy(newTarget);
            this.controls.update();
        }
    },

    /**
     * Check if there's a queued target in range
     */
    getQueuedTargetInRange(fromX, fromY, fromZ, maxDistance) {
        // Only return queued targets that are ACTUALLY within hop range
        // Distant queued targets act as "beacons" - the corridor system guides
        // expansion toward them through intermediate hop-sized jumps
        for (const entry of this.targetQueue) {
            if (entry.target?.colonized) continue;
            if (entry.target?.status === 'fleet_sent') continue;  // Skip targets with probes en route

            const dx = entry.x - fromX;
            const dy = entry.y - fromY;
            const dz = entry.z - fromZ;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // Only direct-target queued POAs within normal hop range
            // Distant queued targets guide expansion via corridor bonus, not direct jumps
            if (dist <= maxDistance) {
                // Return a compatible object with both flat x/y/z and the original POA reference
                return {
                    id: entry.id,  // CRITICAL: Include ID for queue removal
                    x: entry.x,
                    y: entry.y,
                    z: entry.z,
                    colonized: entry.target?.colonized || false,
                    status: entry.target?.status,
                    targetData: entry.target,  // Original POA for bonuses etc
                    isQueuedTarget: true,
                    name: entry.name
                };
            }
        }
        return null;
    }
});
