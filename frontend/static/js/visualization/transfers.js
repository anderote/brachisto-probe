/**
 * Transfer Visualization
 * 
 * Draws Hohmann transfer orbits between orbital zones and animates cargo dots along them.
 * Each active transfer gets one ellipse arc and one animated dot.
 */

class TransferVisualization {
    constructor(scene, solarSystem) {
        this.scene = scene;
        this.solarSystem = solarSystem;
        
        // Store transfer objects: {transferId: {ellipse, dot, ...}} for one-time transfers
        // For continuous transfers: {batchId: {ellipse, dot, ...}} for periodic visualizations
        this.transfers = new Map();
        this.continuousBatches = new Map(); // Track continuous transfer periodic visualizations
        
        // Track last visualization creation time for each continuous transfer
        // {transferId: lastCreationTime}
        this.continuousTransferLastCreation = new Map();
        
        // Interval for creating new visualizations (30 days)
        this.CONTINUOUS_VISUALIZATION_INTERVAL = 120.0; // days
        
        // Colors for different resource types
        this.colors = {
            probe: new THREE.Color(0x00ffff), // Cyan
            metal: new THREE.Color(0xC0C0C0)  // Silver
        };
        
        // Interval for metal transfers (monthly = 30 days)
        this.METAL_VISUALIZATION_INTERVAL = 30.0; // days
        
        // Geometry cache for ellipse arcs (keyed by zone pair)
        this.ellipseCache = new Map();
    }
    
    /**
     * Generate batch ID for continuous transfer periodic visualizations
     * Batches are grouped into chunks (30 days for metal, 120 days for probes)
     */
    getBatchId(transferId, chunkStartTime) {
        return `${transferId}_${chunkStartTime}`;
    }
    
    /**
     * Calculate the start time of the chunk containing the given time
     * Metal transfers use monthly (30 day) chunks, others use the default interval
     */
    getChunkStartTime(time, resourceType) {
        const interval = resourceType === 'metal' ? 
            this.METAL_VISUALIZATION_INTERVAL : 
            this.CONTINUOUS_VISUALIZATION_INTERVAL;
        return Math.floor(time / interval) * interval;
    }
    
    /**
     * Generate cache key for zone pair
     */
    getCacheKey(fromZoneId, toZoneId) {
        return `${fromZoneId}_${toZoneId}`;
    }
    
    /**
     * Get the visual orbit radius for a zone (matching Dyson sphere visualization)
     * For Dyson sphere, uses mercuryOrbit * 0.8 to match the visualization
     * @param {string} zoneId - Zone ID
     * @returns {number} Visual orbit radius in visualization units
     */
    getVisualOrbitRadius(zoneId) {
        if (!this.solarSystem) {
            return null;
        }
        
        // Dyson sphere uses special visual radius: 0.8x Mercury's orbit
        // Check this FIRST because getZonePosition returns (0,0,0) for Dyson sphere
        if (zoneId === 'dyson_sphere' || zoneId === 'dyson') {
            try {
                const mercuryOrbitKm = this.solarSystem.planetData?.mercury?.orbit_km || 173700000;
                if (this.solarSystem.logScaleOrbit) {
                    const mercuryOrbit = this.solarSystem.logScaleOrbit(mercuryOrbitKm);
                    return mercuryOrbit * 0.8; // Match Dyson sphere visualization
                }
            } catch (e) {
                return null;
            }
        }
        
        // For other zones, try to get the actual planet position and calculate radius from it
        const planetPos = this.solarSystem.getZonePosition(zoneId);
        if (planetPos) {
            const radius = Math.sqrt(planetPos.x * planetPos.x + planetPos.z * planetPos.z);
            // Only use if radius is non-zero (avoid issues with zones at origin)
            if (radius > 0) {
                return radius;
            }
        }
        
        // For other zones, use the same scaling as planets
        const zone = this.solarSystem?.orbitalData?.orbital_zones?.find(z => z.id === zoneId);
        if (!zone) {
            return null;
        }
        
        const planetInfo = this.solarSystem.planetData?.[zoneId];
        if (planetInfo && planetInfo.orbit_km) {
            // Use the same scaling function as planets (rocky planets use different scaling)
            if (this.solarSystem.rockyPlanets && this.solarSystem.rockyPlanets.includes(zoneId)) {
                return this.solarSystem.scaleRockyPlanetOrbit(planetInfo.orbit_km);
            } else {
                return this.solarSystem.logScaleOrbit(planetInfo.orbit_km);
            }
        }
        
        // Fallback: use radius_au converted to km then log-scaled
        const orbitKm = (zone.radius_au || 0) * 149600000;
        if (orbitKm === 0) {
            return null;
        }
        if (this.solarSystem.logScaleOrbit) {
            return this.solarSystem.logScaleOrbit(orbitKm);
        }
        return null;
    }
    
    /**
     * Calculate Hohmann transfer ellipse parameters
     * @param {string} fromZoneId - Source zone ID
     * @param {string} toZoneId - Destination zone ID
     * @returns {Object} Ellipse parameters {a, e, rInner, rOuter}
     */
    calculateEllipseParams(fromZoneId, toZoneId) {
        const fromZone = this.solarSystem?.orbitalData?.orbital_zones?.find(z => z.id === fromZoneId);
        const toZone = this.solarSystem?.orbitalData?.orbital_zones?.find(z => z.id === toZoneId);
        
        if (!fromZone || !toZone) {
            return null;
        }
        
        // Get radii in AU
        const r1AU = fromZone.radius_au || 0;
        const r2AU = toZone.radius_au || 0;
        
        if (r1AU === 0 || r2AU === 0) {
            return null;
        }
        
        // Convert to km for calculations
        const AU_KM = 149600000;
        const r1 = r1AU * AU_KM;
        const r2 = r2AU * AU_KM;
        
        // Determine inner and outer radii
        const rInner = Math.min(r1, r2);
        const rOuter = Math.max(r1, r2);
        
        // Semi-major axis
        const a = (rInner + rOuter) / 2;
        
        // Eccentricity
        const e = (rOuter - rInner) / (rOuter + rInner);
        
        return {
            a,           // Semi-major axis in km
            e,           // Eccentricity
            rInner,      // Inner radius in km
            rOuter,      // Outer radius in km
            rInnerAU: Math.min(r1AU, r2AU),
            rOuterAU: Math.max(r1AU, r2AU),
            fromAU: r1AU,
            toAU: r2AU
        };
    }
    
    /**
     * Create ellipse arc geometry for transfer orbit
     * @param {Object} params - Ellipse parameters
     * @param {number} fromAngle - Angle of origin planet at launch time
     * @param {number} toAngle - Angle of destination planet at arrival time
     * @param {number} transferAngle - Angular span of transfer (can be > 180° for wrap-around)
     * @param {number} fromRadiusAU - Origin radius in AU
     * @param {number} toRadiusAU - Destination radius in AU
     * @param {number} segments - Number of segments for the arc
     * @param {string} fromZoneId - Origin zone ID (for getting visual position)
     * @param {string} toZoneId - Destination zone ID (for getting visual position)
     * @returns {THREE.BufferGeometry} Ellipse arc geometry
     */
    createEllipseArc(params, fromAngle, toAngle, transferAngle, fromRadiusAU, toRadiusAU, segments = 64, fromZoneId = null, toZoneId = null) {
        // Get origin orbital radius (use getVisualOrbitRadius which handles Dyson sphere specially)
        const fromVisualRadius = this.getVisualOrbitRadius(fromZoneId);
        
        // Get origin position - prefer actual planet position, but fall back to calculated position
        let fromVisualPos = null;
        const isDysonOrigin = fromZoneId === 'dyson_sphere' || fromZoneId === 'dyson';
        
        if (!isDysonOrigin && fromZoneId && this.solarSystem) {
            fromVisualPos = this.solarSystem.getZonePosition(fromZoneId);
        }
        
        // If no position or position is at origin, calculate from angle and radius
        if (!fromVisualPos || (fromVisualPos.x === 0 && fromVisualPos.z === 0)) {
            if (fromVisualRadius !== null) {
                fromVisualPos = new THREE.Vector3(
                    Math.cos(fromAngle) * fromVisualRadius,
                    0,
                    Math.sin(fromAngle) * fromVisualRadius
                );
            }
        }
        
        // Get destination orbital ring radius (visual space)
        const toVisualRadius = this.getVisualOrbitRadius(toZoneId);
        
        if (!fromVisualPos || fromVisualRadius === null || toVisualRadius === null) {
            return new THREE.BufferGeometry();
        }
        
        // Origin planet distance and angle from sun
        const r1 = Math.sqrt(fromVisualPos.x * fromVisualPos.x + fromVisualPos.z * fromVisualPos.z);
        const theta1 = Math.atan2(fromVisualPos.z, fromVisualPos.x);
        const r2 = toVisualRadius;
        
        // Hohmann transfer: semi-major axis lies on line from origin through sun
        // Origin is at one vertex, destination intersection at the opposite vertex (180° away)
        
        // Determine if transfer is outward or inward
        const isOutward = r2 > r1;
        
        // For Hohmann transfer:
        // - Periapsis at the inner orbit radius
        // - Apoapsis at the outer orbit radius
        // - Semi-major axis a = (r_inner + r_outer) / 2
        // - Eccentricity e = (r_outer - r_inner) / (r_outer + r_inner)
        const rInner = Math.min(r1, r2);
        const rOuter = Math.max(r1, r2);
        const a = (rInner + rOuter) / 2;
        const e = (rOuter - rInner) / (rOuter + rInner);
        
        // True anomaly at origin and destination
        // For outward: origin at periapsis (ν=0), destination at apoapsis (ν=π)
        // For inward: origin at apoapsis (ν=π), destination at periapsis (ν=0 or 2π)
        let nuFrom, nuTo;
        if (isOutward) {
            nuFrom = 0;      // Periapsis (closest to sun)
            nuTo = Math.PI;  // Apoapsis (farthest from sun, 180° away)
        } else {
            nuFrom = Math.PI; // Apoapsis
            nuTo = 2 * Math.PI; // Back to periapsis (going the other way)
        }
        
        // Argument of periapsis (ω): places periapsis in space
        // For outward: periapsis at theta1, so ω = theta1
        // For inward: apoapsis at theta1, so ω + π = theta1, thus ω = theta1 - π
        const omega = isOutward ? theta1 : theta1 - Math.PI;
        
        // Destination angle is 180° opposite from origin
        const destAngle = theta1 + Math.PI;
        
        // Semi-latus rectum
        const p = a * (1 - e * e);
        
        // Create points along the ellipse arc (half orbit from origin to opposite side)
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            
            // Interpolate true anomaly from nuFrom to nuTo
            const nu = nuFrom + (nuTo - nuFrom) * t;
            
            // Calculate radius using ellipse equation: r = p / (1 + e * cos(ν))
            const r = p / (1 + e * Math.cos(nu));
            
            // Calculate angle in space: angle = ω + ν
            const angle = omega + nu;
            
            // Create point at this position
            let point;
            if (i === 0) {
                // Start exactly at origin planet
                point = fromVisualPos.clone();
            } else if (i === segments) {
                // End exactly on destination orbital ring at 180° opposite
                point = new THREE.Vector3(
                    Math.cos(destAngle) * r2,
                    0,
                    Math.sin(destAngle) * r2
                );
            } else {
                // Intermediate points follow the ellipse
                point = new THREE.Vector3(
                    Math.cos(angle) * r,
                    0,
                    Math.sin(angle) * r
                );
            }
            
            points.push(point);
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        return geometry;
    }
    
    /**
     * Calculate position along ellipse based on transfer progress
     * @param {Object} params - Ellipse parameters
     * @param {number} fromAngle - Angle of origin planet at launch time
     * @param {number} toAngle - Angle of destination planet at arrival time
     * @param {number} transferAngle - Angular span of transfer
     * @param {number} fromRadiusAU - Origin radius in AU
     * @param {number} toRadiusAU - Destination radius in AU
     * @param {number} progress - Progress from 0.0 (origin) to 1.0 (destination)
     * @param {string} fromZoneId - Origin zone ID (optional, for exact visual position)
     * @param {string} toZoneId - Destination zone ID (optional, for exact visual position)
     * @returns {THREE.Vector3} Position in 3D space
     */
    calculatePositionOnEllipse(params, fromAngle, toAngle, transferAngle, fromRadiusAU, toRadiusAU, progress, fromZoneId = null, toZoneId = null) {
        // Get orbital radii (these are fixed, don't depend on planet rotation)
        let fromVisualRadius = null;
        let toVisualRadius = null;
        
        if (fromZoneId && this.solarSystem) {
            fromVisualRadius = this.getVisualOrbitRadius(fromZoneId);
        }
        if (toZoneId && this.solarSystem) {
            toVisualRadius = this.getVisualOrbitRadius(toZoneId);
        }
        
        if (fromVisualRadius === null || toVisualRadius === null) {
            return new THREE.Vector3(0, 0, 0);
        }
        
        // Use the FIXED angle from launch time (fromAngle), not the current planet position
        // This ensures the cargo follows the trajectory, not the rotating planet
        const r1 = fromVisualRadius;
        const theta1 = fromAngle; // Fixed angle from when transfer was created
        const r2 = toVisualRadius;
        
        // Use exact start position (at fixed angle, not rotating planet)
        if (progress <= 0.001) {
            return new THREE.Vector3(
                Math.cos(theta1) * r1,
                0,
                Math.sin(theta1) * r1
            );
        }
        
        // Hohmann transfer (same logic as createEllipseArc)
        const isOutward = r2 > r1;
        const rInner = Math.min(r1, r2);
        const rOuter = Math.max(r1, r2);
        const a = (rInner + rOuter) / 2;
        const e = (rOuter - rInner) / (rOuter + rInner);
        
        // True anomaly at origin and destination
        let nuFrom, nuTo;
        if (isOutward) {
            nuFrom = 0;
            nuTo = Math.PI;
        } else {
            nuFrom = Math.PI;
            nuTo = 2 * Math.PI;
        }
        
        // Argument of periapsis
        const omega = isOutward ? theta1 : theta1 - Math.PI;
        
        // Destination angle is 180° opposite from origin
        const destAngle = theta1 + Math.PI;
        
        // Use exact position at end
        if (progress >= 0.999) {
            return new THREE.Vector3(
                Math.cos(destAngle) * r2,
                0,
                Math.sin(destAngle) * r2
            );
        }
        
        // Semi-latus rectum
        const p = a * (1 - e * e);
        
        // Interpolate true anomaly
        const nu = nuFrom + (nuTo - nuFrom) * progress;
        
        // Calculate radius using ellipse equation
        const r = p / (1 + e * Math.cos(nu));
        
        // Calculate angle in space
        const angle = omega + nu;
        
        return new THREE.Vector3(
            Math.cos(angle) * r,
            0,
            Math.sin(angle) * r
        );
    }
    
    /**
     * Calculate launch angles for ellipse orientation
     * @param {string} fromZoneId - Source zone ID
     * @param {string} toZoneId - Destination zone ID
     * @returns {Object} {fromAngle, toAngle, transferAngle} - Angles in radians
     */
    calculateLaunchAngles(fromZoneId, toZoneId) {
        // Get actual zone positions at launch time
        const fromPos = this.solarSystem?.getZonePosition(fromZoneId);
        const toPos = this.solarSystem?.getZonePosition(toZoneId);
        
        // Special handling: Dyson sphere is at origin (0,0,0), but we want to connect to its orbital ring
        const isDysonDestination = toZoneId === 'dyson_sphere' || toZoneId === 'dyson';
        
        if (!fromPos || (fromPos.x === 0 && fromPos.z === 0)) {
            // Fallback: if fromPos is at origin or null, use default
            return { fromAngle: 0, toAngle: Math.PI, transferAngle: Math.PI };
        }
        
        // Calculate angle from sun to origin planet
        const fromAngle = Math.atan2(fromPos.z, fromPos.x);
        
        let toAngle;
        let transferAngle;
        
        if (isDysonDestination) {
            // For Dyson sphere, use opposite side from origin planet
            toAngle = fromAngle + Math.PI;
            transferAngle = Math.PI;
        } else if (toPos && (toPos.x !== 0 || toPos.z !== 0)) {
            // Get actual destination planet position
            toAngle = Math.atan2(toPos.z, toPos.x);
            
            // Calculate angular separation (normalized to [-π, π])
            let deltaAngle = toAngle - fromAngle;
            // Normalize to [-π, π]
            while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
            while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
            
            // Smart logic: If planets are on same side (|deltaAngle| < π), 
            // choose longer path that wraps behind sun if it makes orbital sense
            const absDeltaAngle = Math.abs(deltaAngle);
            
            if (absDeltaAngle < Math.PI) {
                // Same side - check if wrap-around would be more efficient
                // For small angles, direct path is usually better
                // For larger angles (> 90°), wrap-around can be more interesting
                // Use wrap-around if angle > 90° (π/2) for visual interest
                if (absDeltaAngle > Math.PI / 2) {
                    // Use longer path that wraps behind sun
                    transferAngle = 2 * Math.PI - absDeltaAngle;
                    // Adjust toAngle to be on the longer path
                    if (deltaAngle > 0) {
                        toAngle = fromAngle - (2 * Math.PI - deltaAngle);
                    } else {
                        toAngle = fromAngle + (2 * Math.PI + deltaAngle);
                    }
                } else {
                    // Use shorter direct path
                    transferAngle = absDeltaAngle;
                    toAngle = fromAngle + deltaAngle;
                }
            } else {
                // Opposite sides - use shorter path
                transferAngle = absDeltaAngle;
                toAngle = fromAngle + deltaAngle;
            }
        } else {
            // Fallback: destination position not available, use opposite side
            toAngle = fromAngle + Math.PI;
            transferAngle = Math.PI;
        }
        
        // Normalize toAngle to [0, 2π]
        while (toAngle < 0) toAngle += 2 * Math.PI;
        while (toAngle >= 2 * Math.PI) toAngle -= 2 * Math.PI;
        
        return { fromAngle, toAngle, transferAngle };
    }
    
    /**
     * Create ellipse line for a transfer (fixed at launch time)
     */
    createEllipseLine(fromZoneId, toZoneId, resourceType) {
        const params = this.calculateEllipseParams(fromZoneId, toZoneId);
        if (!params) {
            return null;
        }
        
        // Calculate launch angles at launch time (fixed)
        const { fromAngle, toAngle, transferAngle } = this.calculateLaunchAngles(fromZoneId, toZoneId);
        
        // Create geometry once with fixed orientation, passing zone IDs for visual position matching
        const geometry = this.createEllipseArc(params, fromAngle, toAngle, transferAngle, params.fromAU, params.toAU, 64, fromZoneId, toZoneId);
        const color = this.colors[resourceType] || this.colors.probe;
        
        // Create dashed line material
        // Metal transfers use silver dotted lines, others use regular dashed lines
        const dashSize = resourceType === 'metal' ? 0.05 : 0.1;
        const gapSize = resourceType === 'metal' ? 0.03 : 0.05;
        const material = new THREE.LineDashedMaterial({
            color: color,
            dashSize: dashSize,
            gapSize: gapSize,
            opacity: 0.6,
            transparent: true
        });
        
        const line = new THREE.Line(geometry, material);
        line.computeLineDistances(); // Required for dashed lines
        
        return { line, params, fromAngle, toAngle, transferAngle, fromAU: params.fromAU, toAU: params.toAU };
    }
    
    /**
     * Create cargo icon for a transfer
     * Metal transfers use silver squares, probes use spheres
     */
    createCargoDot(resourceType) {
        const color = this.colors[resourceType] || this.colors.probe;
        
        let geometry;
        if (resourceType === 'metal') {
            // Create a square for metal transfers
            const size = 0.06;
            geometry = new THREE.BoxGeometry(size, size, size);
        } else {
            // Create a sphere for probe transfers
            geometry = new THREE.SphereGeometry(0.05, 8, 8);
        }
        
        const material = new THREE.MeshBasicMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.5
        });
        
        const icon = new THREE.Mesh(geometry, material);
        return icon;
    }
    
    /**
     * Calculate batch progress (0.0 to 1.0)
     */
    calculateBatchProgress(batch, currentTime) {
        const departureTime = batch.departure_time || 0;
        const arrivalTime = batch.arrival_time || currentTime;
        
        if (arrivalTime <= currentTime) {
            return 1.0; // Arrived
        }
        if (departureTime > currentTime) {
            return 0.0; // Not departed yet
        }
        
        const transferTime = arrivalTime - departureTime;
        if (transferTime <= 0) return 0.0;
        
        const elapsed = currentTime - departureTime;
        return Math.max(0.0, Math.min(1.0, elapsed / transferTime));
    }
    
    /**
     * Calculate transfer progress (0.0 to 1.0) for one-time transfers
     */
    calculateProgress(transfer, currentTime) {
        const departureTime = transfer.departure_time || 0;
        const arrivalTime = transfer.arrival_time || currentTime;
        
        if (arrivalTime <= currentTime) {
            return 1.0; // Arrived
        }
        if (departureTime > currentTime) {
            return 0.0; // Not departed yet
        }
        
        const transferTime = arrivalTime - departureTime;
        if (transferTime <= 0) return 0.0;
        
        const elapsed = currentTime - departureTime;
        return Math.max(0.0, Math.min(1.0, elapsed / transferTime));
    }
    
    /**
     * Create periodic visualization for continuous transfer
     * Creates a new ellipse and dot every 7 days
     */
    createPeriodicVisualization(transfer, fromZoneId, toZoneId, resourceType, departureTime, transferTime) {
        const batchId = this.getBatchId(transfer.id, departureTime);
        
        // Check if visualization already exists
        if (this.continuousBatches.has(batchId)) {
            return this.continuousBatches.get(batchId);
        }
        
        // Create ellipse using current zone positions (captured at creation time)
        // This fixes the trajectory for this specific visualization
        const ellipseData = this.createEllipseLine(fromZoneId, toZoneId, resourceType);
        if (!ellipseData) {
            return null;
        }
        
        const dot = this.createCargoDot(resourceType);
        
        this.scene.add(ellipseData.line);
        this.scene.add(dot);
        
        const arrivalTime = departureTime + transferTime;
        
        const batchViz = {
            ellipse: ellipseData.line,
            params: ellipseData.params,
            fromAngle: ellipseData.fromAngle, // Fixed at launch time
            toAngle: ellipseData.toAngle, // Fixed at launch time
            transferAngle: ellipseData.transferAngle, // Fixed at launch time
            fromAU: ellipseData.fromAU,
            toAU: ellipseData.toAU,
            fromZoneId: fromZoneId, // Store for visual position calculation
            toZoneId: toZoneId, // Store for visual radius calculation
            dot: dot,
            batchId: batchId,
            transferId: transfer.id,
            departureTime: departureTime,
            arrivalTime: arrivalTime
        };
        
        this.continuousBatches.set(batchId, batchViz);
        return batchViz;
    }
    
    /**
     * Remove batch visualization
     */
    removeBatch(batchId) {
        const batchViz = this.continuousBatches.get(batchId);
        if (!batchViz) return;
        
        if (batchViz.ellipse) {
            this.scene.remove(batchViz.ellipse);
            batchViz.ellipse.geometry.dispose();
            batchViz.ellipse.material.dispose();
        }
        
        if (batchViz.dot) {
            this.scene.remove(batchViz.dot);
            batchViz.dot.geometry.dispose();
            batchViz.dot.material.dispose();
        }
        
        this.continuousBatches.delete(batchId);
    }
    
    /**
     * Update transfer visualization based on game state
     */
    update(gameState) {
        if (!gameState || !this.solarSystem) return;
        
        const activeTransfers = gameState.active_transfers || [];
        const currentTime = gameState.time || 0;
        
        // Track which transfers and batches we've seen
        const seenTransferIds = new Set();
        const seenBatchIds = new Set();
        
        // Process all transfers
        for (const transfer of activeTransfers) {
            const transferId = transfer.id;
            seenTransferIds.add(transferId);
            
            const resourceType = transfer.resource_type || 'probe';
            const fromZoneId = transfer.from_zone;
            const toZoneId = transfer.to_zone;
            
            if (transfer.type === 'continuous') {
                // Continuous transfer: create visualizations periodically, accumulating batches
                // Metal: monthly (30 days), Probes: every 120 days
                if (!transfer.paused) {
                    // Get transfer time (in days)
                    const transferTime = transfer.transfer_time || 0;
                    if (transferTime > 0) {
                        // Process batches in transit and group them into chunks
                        if (transfer.in_transit && transfer.in_transit.length > 0) {
                            // Track which chunks we've seen
                            const seenChunks = new Set();
                            
                            for (const batch of transfer.in_transit) {
                                const batchDepartureTime = batch.departure_time || 0;
                                const chunkStartTime = this.getChunkStartTime(batchDepartureTime, resourceType);
                                const chunkId = this.getBatchId(transferId, chunkStartTime);
                                
                                seenChunks.add(chunkId);
                                
                                // Create visualization for this chunk if it doesn't exist
                                if (!this.continuousBatches.has(chunkId)) {
                                    // Create visualization for this chunk (monthly for metal, 120 days for probes)
                                    // Use chunk start time as departure time
                                    const batchViz = this.createPeriodicVisualization(
                                        transfer,
                                        fromZoneId,
                                        toZoneId,
                                        resourceType,
                                        chunkStartTime,
                                        transferTime
                                    );
                                    
                                    if (batchViz) {
                                        // Track that we've created a visualization for this chunk
                                        const lastCreationTime = this.continuousTransferLastCreation.get(transferId) || 0;
                                        if (chunkStartTime > lastCreationTime) {
                                            this.continuousTransferLastCreation.set(transferId, chunkStartTime);
                                        }
                                    }
                                }
                                
                                // Mark this chunk as seen
                                seenBatchIds.add(chunkId);
                            }
                        }
                    }
                }
                
                // Update all existing visualizations for this continuous transfer
                for (const [batchId, batchViz] of this.continuousBatches.entries()) {
                    if (batchViz.transferId === transferId) {
                        seenBatchIds.add(batchId);
                        
                        // Calculate progress for this visualization
                        const progress = this.calculateBatchProgress({
                            departure_time: batchViz.departureTime,
                            arrival_time: batchViz.arrivalTime
                        }, currentTime);
                        
                        if (progress >= 1.0) {
                            // Visualization completed, remove it
                            this.removeBatch(batchId);
                        } else {
                            // Update dot position along fixed trajectory
                            const position = this.calculatePositionOnEllipse(
                                batchViz.params,
                                batchViz.fromAngle,
                                batchViz.toAngle,
                                batchViz.transferAngle,
                                batchViz.fromAU,
                                batchViz.toAU,
                                progress,
                                batchViz.fromZoneId,
                                batchViz.toZoneId
                            );
                            batchViz.dot.position.copy(position);
                            batchViz.dot.visible = true;
                        }
                    }
                }
            } else {
                // One-time transfer: single visualization
                const hasResources = transfer.status === 'traveling' || transfer.status === 'paused';
                
                if (!hasResources) {
                    // Remove if exists but no resources
                    this.removeTransfer(transferId);
                    continue;
                }
                
                // Get or create transfer visualization
                let transferViz = this.transfers.get(transferId);
                
                if (!transferViz) {
                    // Create new transfer visualization (fixed trajectory at launch time)
                    const ellipseData = this.createEllipseLine(fromZoneId, toZoneId, resourceType);
                    if (!ellipseData) {
                        continue; // Skip if can't create ellipse
                    }
                    
                    const dot = this.createCargoDot(resourceType);
                    
                    this.scene.add(ellipseData.line);
                    this.scene.add(dot);
                    
                    transferViz = {
                        ellipse: ellipseData.line,
                        params: ellipseData.params,
                        fromAngle: ellipseData.fromAngle,
                        toAngle: ellipseData.toAngle,
                        transferAngle: ellipseData.transferAngle,
                        fromAU: ellipseData.fromAU,
                        toAU: ellipseData.toAU,
                        fromZoneId: fromZoneId, // Store for visual position calculation
                        toZoneId: toZoneId, // Store for visual radius calculation
                        dot: dot,
                        transferId: transferId
                    };
                    
                    this.transfers.set(transferId, transferViz);
                }
                
                // Calculate progress
                const progress = this.calculateProgress(transfer, currentTime);
                
                // Update dot position along fixed trajectory
                const position = this.calculatePositionOnEllipse(
                    transferViz.params,
                    transferViz.fromAngle,
                    transferViz.toAngle,
                    transferViz.transferAngle,
                    transferViz.fromAU,
                    transferViz.toAU,
                    progress,
                    transferViz.fromZoneId,
                    transferViz.toZoneId
                );
                transferViz.dot.position.copy(position);
                
                // Remove visualization when transfer completes
                if (progress >= 1.0) {
                    this.removeTransfer(transferId);
                } else {
                    transferViz.dot.visible = true;
                }
            }
        }
        
        // Remove transfers that are no longer active
        for (const [transferId, transferViz] of this.transfers.entries()) {
            if (!seenTransferIds.has(transferId)) {
                this.removeTransfer(transferId);
            }
        }
        
        // Remove continuous transfer tracking if transfer is no longer active
        for (const transferId of this.continuousTransferLastCreation.keys()) {
            if (!seenTransferIds.has(transferId)) {
                this.continuousTransferLastCreation.delete(transferId);
            }
        }
        
        // Remove batches that are no longer associated with active transfers
        for (const [batchId, batchViz] of this.continuousBatches.entries()) {
            if (!seenBatchIds.has(batchId)) {
                this.removeBatch(batchId);
            }
        }
    }
    
    /**
     * Remove transfer visualization
     */
    removeTransfer(transferId) {
        const transferViz = this.transfers.get(transferId);
        if (!transferViz) return;
        
        if (transferViz.ellipse) {
            this.scene.remove(transferViz.ellipse);
            transferViz.ellipse.geometry.dispose();
            transferViz.ellipse.material.dispose();
        }
        
        if (transferViz.dot) {
            this.scene.remove(transferViz.dot);
            transferViz.dot.geometry.dispose();
            transferViz.dot.material.dispose();
        }
        
        this.transfers.delete(transferId);
    }
    
    /**
     * Clean up all transfers
     */
    dispose() {
        for (const transferId of this.transfers.keys()) {
            this.removeTransfer(transferId);
        }
        this.transfers.clear();
        
        for (const batchId of this.continuousBatches.keys()) {
            this.removeBatch(batchId);
        }
        this.continuousBatches.clear();
        
        this.continuousTransferLastCreation.clear();
        this.ellipseCache.clear();
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TransferVisualization;
}

