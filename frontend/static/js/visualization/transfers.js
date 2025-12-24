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
        
        // First try to get the actual planet position and calculate radius from it
        const planetPos = this.solarSystem.getZonePosition(zoneId);
        if (planetPos) {
            return Math.sqrt(planetPos.x * planetPos.x + planetPos.z * planetPos.z);
        }
        
        // Dyson sphere uses special visual radius: 0.8x Mercury's orbit
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
     * Create ellipse arc geometry for Hohmann transfer
     * @param {Object} params - Ellipse parameters
     * @param {number} fromAngle - Angle of origin planet at launch time
     * @param {number} fromRadiusAU - Origin radius in AU
     * @param {number} toRadiusAU - Destination radius in AU
     * @param {number} segments - Number of segments for the arc
     * @param {string} fromZoneId - Origin zone ID (for getting visual position)
     * @param {string} toZoneId - Destination zone ID (for getting visual position)
     * @returns {THREE.BufferGeometry} Ellipse arc geometry
     */
    createEllipseArc(params, fromAngle, fromRadiusAU, toRadiusAU, segments = 64, fromZoneId = null, toZoneId = null) {
        const { a, e, rInner, rOuter } = params;
        
        // Determine if going outward or inward
        const isOutward = toRadiusAU > fromRadiusAU;
        
        // Calculate semi-minor axis
        const b = a * Math.sqrt(1 - e * e);
        
        // For Hohmann transfer:
        // - If outward: periapsis at inner radius, apoapsis at outer radius
        // - If inward: periapsis at outer radius, apoapsis at inner radius
        // We want to start at origin planet position and end at destination radius on opposite side
        
        // Convert AU to km for calculations
        const AU_KM = 149600000;
        const fromRadiusKm = fromRadiusAU * AU_KM;
        const toRadiusKm = toRadiusAU * AU_KM;
        
        // Find true anomaly where ellipse intersects origin radius
        // r = a(1-e²)/(1+e*cos(ν))
        // Solving for ν: cos(ν) = (a(1-e²)/r - 1)/e
        const rFrom = fromRadiusKm;
        const cosNuFrom = (a * (1 - e * e) / rFrom - 1) / e;
        // Choose the angle that makes sense (0 to π for outward, π to 2π for inward)
        let nuFrom = Math.acos(Math.max(-1, Math.min(1, cosNuFrom)));
        if (!isOutward) {
            // For inward transfer, origin is at apoapsis (ν = π)
            nuFrom = Math.PI;
        }
        
        // Find true anomaly where ellipse intersects destination radius
        // We want it on the opposite side (approximately π away)
        const rTo = toRadiusKm;
        const cosNuTo = (a * (1 - e * e) / rTo - 1) / e;
        // Choose the angle that's approximately π away from nuFrom
        let nuTo = Math.acos(Math.max(-1, Math.min(1, cosNuTo)));
        if (isOutward) {
            // For outward transfer, destination is at apoapsis (ν = π)
            nuTo = Math.PI;
        } else {
            // For inward transfer, destination is at periapsis (ν = 0 or 2π)
            // But we want opposite side, so use 2π
            nuTo = 0;
        }
        
        // Ensure we're going the right direction (from nuFrom to nuTo should span ~π)
        // If going outward: nuFrom = 0, nuTo = π
        // If going inward: nuFrom = π, nuTo = 2π (or 0, wrapping around)
        if (isOutward) {
            nuFrom = 0;
            nuTo = Math.PI;
        } else {
            nuFrom = Math.PI;
            nuTo = 2 * Math.PI; // Wrap around to opposite side
        }
        
        // Get actual visual positions for origin and destination planets
        let fromVisualPos = null;
        let toVisualPos = null;
        let fromVisualRadius = null;
        let toVisualRadius = null;
        
        if (fromZoneId && this.solarSystem) {
            // Use actual planet position (already scaled correctly)
            fromVisualPos = this.solarSystem.getZonePosition(fromZoneId);
            if (fromVisualPos) {
                fromVisualRadius = Math.sqrt(fromVisualPos.x * fromVisualPos.x + fromVisualPos.z * fromVisualPos.z);
            }
        }
        
        if (toZoneId && this.solarSystem) {
            // Get actual destination planet position
            const toPlanetPos = this.solarSystem.getZonePosition(toZoneId);
            if (toPlanetPos) {
                // Use actual planet position, but adjust to opposite side for Hohmann transfer
                toVisualRadius = Math.sqrt(toPlanetPos.x * toPlanetPos.x + toPlanetPos.z * toPlanetPos.z);
                // Calculate angle to destination planet
                const toPlanetAngle = Math.atan2(toPlanetPos.z, toPlanetPos.x);
                // For Hohmann transfer, destination should be on opposite side from origin
                // But use the actual orbit radius of the destination planet
                toVisualPos = new THREE.Vector3(
                    Math.cos(fromAngle + Math.PI) * toVisualRadius,
                    0,
                    Math.sin(fromAngle + Math.PI) * toVisualRadius
                );
            } else {
                // Fallback: use visual orbit radius if planet position not available
                const toVisualRadiusRaw = this.getVisualOrbitRadius(toZoneId);
                if (toVisualRadiusRaw !== null) {
                    toVisualRadius = toVisualRadiusRaw;
                    toVisualPos = new THREE.Vector3(
                        Math.cos(fromAngle + Math.PI) * toVisualRadius,
                        0,
                        Math.sin(fromAngle + Math.PI) * toVisualRadius
                    );
                }
            }
        }
        
        // Create points along the transfer arc
        const points = [];
        for (let i = 0; i <= segments; i++) {
            // Interpolate true anomaly from nuFrom to nuTo
            const t = i / segments;
            const nu = nuFrom + (nuTo - nuFrom) * t;
            
            // Calculate distance from focus at this true anomaly
            const r = a * (1 - e * e) / (1 + e * Math.cos(nu));
            
            // Calculate position on ellipse (in ellipse's local coordinate system)
            const x = r * Math.cos(nu);
            const y = r * Math.sin(nu);
            
            // Rotate ellipse so it starts at fromAngle and ends at fromAngle + π (opposite side)
            // For outward: nuFrom=0 should map to fromAngle, nuTo=π should map to fromAngle+π
            // For inward: nuFrom=π should map to fromAngle, nuTo=2π should map to fromAngle+π
            let angle;
            if (isOutward) {
                // Outward: nu goes from 0 to π, angle goes from fromAngle to fromAngle+π
                angle = fromAngle + nu;
            } else {
                // Inward: nu goes from π to 2π, angle goes from fromAngle to fromAngle+π
                // When nu=π, angle=fromAngle; when nu=2π, angle=fromAngle+π
                angle = fromAngle + (nu - Math.PI);
            }
            
            // Override first point with actual origin visual position
            if (i === 0 && fromVisualPos) {
                points.push(fromVisualPos.clone());
                continue;
            }
            
            // Override last point with actual destination visual position
            if (i === segments && toVisualPos) {
                points.push(toVisualPos.clone());
                continue;
            }
            
            // For intermediate points, interpolate between visual radii
            // This ensures the ellipse uses the same scaling as the planets
            let orbitRadius;
            if (fromVisualRadius !== null && toVisualRadius !== null) {
                // Interpolate visual radius between origin and destination
                // Use the ellipse's true anomaly to determine interpolation factor
                // For outward: nu goes 0->π, radius goes fromVisualRadius->toVisualRadius
                // For inward: nu goes π->2π, radius goes fromVisualRadius->toVisualRadius
                let radiusT;
                if (isOutward) {
                    // nu is 0 to π, map to 0 to 1
                    radiusT = nu / Math.PI;
                } else {
                    // nu is π to 2π, map to 0 to 1
                    radiusT = (nu - Math.PI) / Math.PI;
                }
                // Interpolate visual radius
                orbitRadius = fromVisualRadius + (toVisualRadius - fromVisualRadius) * radiusT;
            } else {
                // Fallback: use log scaling if visual radii not available
                const orbitKm = r;
                orbitRadius = this.solarSystem?.logScaleOrbit ? 
                    this.solarSystem.logScaleOrbit(orbitKm) : orbitKm * 0.00001;
            }
            
            // Position in XZ plane (Y=0 for orbital plane)
            points.push(new THREE.Vector3(
                Math.cos(angle) * orbitRadius,
                0,
                Math.sin(angle) * orbitRadius
            ));
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        return geometry;
    }
    
    /**
     * Calculate position along ellipse based on transfer progress
     * @param {Object} params - Ellipse parameters
     * @param {number} fromAngle - Angle of origin planet at launch time
     * @param {number} fromRadiusAU - Origin radius in AU
     * @param {number} toRadiusAU - Destination radius in AU
     * @param {number} progress - Progress from 0.0 (origin) to 1.0 (destination)
     * @param {string} fromZoneId - Origin zone ID (optional, for exact visual position)
     * @param {string} toZoneId - Destination zone ID (optional, for exact visual position)
     * @returns {THREE.Vector3} Position in 3D space
     */
    calculatePositionOnEllipse(params, fromAngle, fromRadiusAU, toRadiusAU, progress, fromZoneId = null, toZoneId = null) {
        const { a, e } = params;
        
        // Convert AU to km for calculations
        const AU_KM = 149600000;
        const fromRadiusKm = fromRadiusAU * AU_KM;
        const toRadiusKm = toRadiusAU * AU_KM;
        
        // Determine if going outward or inward
        const isOutward = toRadiusAU > fromRadiusAU;
        
        // Find true anomaly where ellipse intersects origin radius
        const rFrom = fromRadiusKm;
        
        // For Hohmann transfer:
        // - Outward: start at periapsis (ν = 0), end at apoapsis (ν = π)
        // - Inward: start at apoapsis (ν = π), end at periapsis (ν = 0, but we want opposite side so use 2π)
        let nuFrom, nuTo;
        if (isOutward) {
            nuFrom = 0; // Periapsis (inner radius)
            nuTo = Math.PI; // Apoapsis (outer radius)
        } else {
            nuFrom = Math.PI; // Apoapsis (outer radius)
            nuTo = 2 * Math.PI; // Periapsis on opposite side (inner radius)
        }
        
        // Use exact visual positions at start and end
        if (progress <= 0.001 && fromZoneId && this.solarSystem) {
            const fromVisualPos = this.solarSystem.getZonePosition(fromZoneId);
            if (fromVisualPos) {
                return fromVisualPos.clone();
            }
        }
        
        if (progress >= 0.999 && toZoneId && this.solarSystem) {
            // Get actual destination planet position
            const toPlanetPos = this.solarSystem.getZonePosition(toZoneId);
            if (toPlanetPos) {
                const toVisualRadius = Math.sqrt(toPlanetPos.x * toPlanetPos.x + toPlanetPos.z * toPlanetPos.z);
                // Position on opposite side for Hohmann transfer
                return new THREE.Vector3(
                    Math.cos(fromAngle + Math.PI) * toVisualRadius,
                    0,
                    Math.sin(fromAngle + Math.PI) * toVisualRadius
                );
            } else {
                // Fallback
                const toVisualRadius = this.getVisualOrbitRadius(toZoneId);
                if (toVisualRadius !== null) {
                    return new THREE.Vector3(
                        Math.cos(fromAngle + Math.PI) * toVisualRadius,
                        0,
                        Math.sin(fromAngle + Math.PI) * toVisualRadius
                    );
                }
            }
        }
        
        // Interpolate true anomaly based on progress
        const nu = nuFrom + (nuTo - nuFrom) * progress;
        
        // Calculate distance from focus at this true anomaly
        const r = a * (1 - e * e) / (1 + e * Math.cos(nu));
        
        // Calculate position on ellipse (in ellipse's local coordinate system)
        const x = r * Math.cos(nu);
        const y = r * Math.sin(nu);
        
        // Rotate ellipse so it starts at fromAngle and ends at fromAngle + π (opposite side)
        // For outward: nu goes from 0 to π, angle goes from fromAngle to fromAngle+π
        // For inward: nu goes from π to 2π, angle goes from fromAngle to fromAngle+π
        let angle;
        if (isOutward) {
            // Outward: nu goes from 0 to π, angle goes from fromAngle to fromAngle+π
            angle = fromAngle + nu;
        } else {
            // Inward: nu goes from π to 2π, angle goes from fromAngle to fromAngle+π
            // When nu=π, angle=fromAngle; when nu=2π, angle=fromAngle+π
            angle = fromAngle + (nu - Math.PI);
        }
        
        // Get visual radii for interpolation
        let fromVisualRadius = null;
        let toVisualRadius = null;
        
        if (fromZoneId && this.solarSystem) {
            const fromPos = this.solarSystem.getZonePosition(fromZoneId);
            if (fromPos) {
                fromVisualRadius = Math.sqrt(fromPos.x * fromPos.x + fromPos.z * fromPos.z);
            }
        }
        
        if (toZoneId && this.solarSystem) {
            const toPos = this.solarSystem.getZonePosition(toZoneId);
            if (toPos) {
                toVisualRadius = Math.sqrt(toPos.x * toPos.x + toPos.z * toPos.z);
            } else {
                toVisualRadius = this.getVisualOrbitRadius(toZoneId);
            }
        }
        
        // Interpolate visual radius between origin and destination
        let orbitRadius;
        if (fromVisualRadius !== null && toVisualRadius !== null) {
            // Use progress to interpolate visual radius
            orbitRadius = fromVisualRadius + (toVisualRadius - fromVisualRadius) * progress;
        } else {
            // Fallback: use log scaling if visual radii not available
            const orbitKm = r;
            orbitRadius = this.solarSystem?.logScaleOrbit ? 
                this.solarSystem.logScaleOrbit(orbitKm) : orbitKm * 0.00001;
        }
        
        return new THREE.Vector3(
            Math.cos(angle) * orbitRadius,
            0,
            Math.sin(angle) * orbitRadius
        );
    }
    
    /**
     * Calculate launch angles for ellipse orientation
     * @param {string} fromZoneId - Source zone ID
     * @param {string} toZoneId - Destination zone ID
     * @returns {Object} {fromAngle, toAngle} - Angles in radians (toAngle is opposite side)
     */
    calculateLaunchAngles(fromZoneId, toZoneId) {
        // Get actual zone positions at launch time
        const fromPos = this.solarSystem?.getZonePosition(fromZoneId);
        
        // Special handling: Dyson sphere is at origin (0,0,0), but we want to connect to its orbital ring
        // on the opposite side from the origin planet
        const isDysonDestination = toZoneId === 'dyson_sphere' || toZoneId === 'dyson';
        
        if (fromPos && (fromPos.x !== 0 || fromPos.z !== 0)) {
            // Calculate angle from origin to origin planet
            const fromAngle = Math.atan2(fromPos.z, fromPos.x);
            // Destination is always on opposite side of sun (wrap around)
            // This works for both regular planets and Dyson sphere orbital ring
            const toAngle = fromAngle + Math.PI;
            
            return { fromAngle, toAngle };
        }
        
        // Fallback: if fromPos is at origin or null, use default
        // This shouldn't happen for normal planets, but handle it gracefully
        return { fromAngle: 0, toAngle: Math.PI };
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
        const { fromAngle, toAngle } = this.calculateLaunchAngles(fromZoneId, toZoneId);
        
        // Create geometry once with fixed orientation, passing zone IDs for visual position matching
        const geometry = this.createEllipseArc(params, fromAngle, params.fromAU, params.toAU, 64, fromZoneId, toZoneId);
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
        
        return { line, params, fromAngle, toAngle, fromAU: params.fromAU, toAU: params.toAU };
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

