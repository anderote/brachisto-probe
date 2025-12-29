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
        
        // Track visibility state for transfer lines (respects Tab toggle)
        this.linesVisible = true;
        
        // Interval for creating new visualizations (30 days)
        this.CONTINUOUS_VISUALIZATION_INTERVAL = 120.0; // days
        
        // Colors for different resource types
        this.colors = {
            probe: new THREE.Color(0x00ffff), // Cyan
            metal: new THREE.Color(0xC0C0C0)   // Silver
        };
        
        // Interval for metal transfers (weekly = 7 days)
        this.METAL_VISUALIZATION_INTERVAL = 7.0; // days
        
        // Geometry cache for ellipse arcs (keyed by zone pair)
        this.ellipseCache = new Map();
        
        // Callback for when transfers arrive at destination
        // Called with: {zoneId, resourceType, arrivals: [{position, massKg, velocityDir}], dotCount}
        this.onTransferArrival = null;
        
        // Animation state for smooth interpolation
        this.lastGameTime = 0;
        this.lastRealTime = 0;
        this.timeSpeed = 1;
        this.isPaused = false;
    }
    
    /**
     * Set callback for transfer arrivals
     * @param {Function} callback - Called with arrival info when transfers complete
     */
    setArrivalCallback(callback) {
        this.onTransferArrival = callback;
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
        
        // Dyson sphere uses 0.29 AU (real value)
        // Check this FIRST because getZonePosition returns (0,0,0) for Dyson sphere
        if (zoneId === 'dyson_sphere' || zoneId === 'dyson') {
            try {
                if (this.solarSystem.scaleAUToVisual) {
                    return this.solarSystem.scaleAUToVisual(0.29); // Dyson sphere at 0.29 AU
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
            // Use unified scaling (converts km to AU first)
            const orbitAU = planetInfo.orbit_km / this.solarSystem.AU_KM;
            if (this.solarSystem.scaleAUToVisual) {
                return this.solarSystem.scaleAUToVisual(orbitAU);
            }
        }
        
        // Fallback: use radius_au directly
        if (zone.radius_au && this.solarSystem.scaleAUToVisual) {
            return this.solarSystem.scaleAUToVisual(zone.radius_au);
        }
        return null;
    }
    
    /**
     * Get orbital velocity for a zone (visual linear velocity)
     * 
     * UNITS: Returns visual units per game day.
     * 
     * The animation system uses orbitalSpeed in rad/animation-sec, where:
     *   orbitalSpeed = 0.01 / sqrt(period_days / 365.25)
     * 
     * For a planet with period T days:
     *   - Completes 2π radians in 2π / orbitalSpeed animation-seconds
     *   - That equals 2π * sqrt(T/365.25) / 0.01 animation-seconds
     *   - This represents T game days
     * 
     * The animation-sec to game-day conversion factor for each zone is:
     *   animSecsPerOrbit = 2π / orbitalSpeed = 2π * sqrt(T/365.25) / 0.01
     *   gameDaysPerOrbit = T
     *   animSecsPerDay = animSecsPerOrbit / gameDaysPerOrbit = (2π/0.01) * sqrt(T/365.25) / T
     *                  = 628.32 * sqrt(1/(T * 365.25))
     * 
     * So to convert linear velocity from visual-units/anim-sec to visual-units/game-day:
     *   velocity_per_day = velocity_per_anim_sec * animSecsPerDay
     * 
     * @param {string} zoneId - Zone ID
     * @returns {number} Linear velocity in visual units/day (game time)
     */
    getOrbitalVelocity(zoneId) {
        // Get orbital period for this zone to calculate time conversion factor
        const orbitalPeriodDays = this.solarSystem?.getOrbitalPeriod?.(zoneId) || 365.25;
        
        // Animation seconds per game day for this zone
        // Formula: (2π / 0.01) * sqrt(1 / (period * 365.25))
        const animSecsPerDay = (2 * Math.PI / 0.01) * Math.sqrt(1 / (orbitalPeriodDays * 365.25));
        
        // Get visual orbital radius and angular speed from planet
        const planet = this.solarSystem?.planets?.[zoneId];
        if (planet && planet.userData) {
            const radius = planet.userData.radius;
            const angularSpeed = planet.userData.orbitalSpeed; // radians/animation-sec
            if (radius && angularSpeed) {
                const velocityPerAnimSec = radius * angularSpeed; // visual units/animation-sec
                return velocityPerAnimSec * animSecsPerDay; // visual units/game-day
            }
        }
        
        // Fallback: calculate from visual radius using Kepler's law approximation
        const radius = this.getVisualOrbitRadius(zoneId);
        if (!radius || radius === 0) return 0.01 * animSecsPerDay;
        
        // Approximate angular speed: 0.01 / sqrt(period/365.25) rad/animation-sec
        const approximateAngularSpeed = 0.01 / Math.sqrt(orbitalPeriodDays / 365.25);
        const velocityPerAnimSec = radius * approximateAngularSpeed;
        return velocityPerAnimSec * animSecsPerDay; // visual units/game-day
    }
    
    /**
     * Get physical orbital velocity in km/s for a zone
     * Uses vis-viva equation: v = sqrt(μ/r) for circular orbit
     * @param {string} zoneId - Zone ID
     * @returns {number} Orbital velocity in km/s
     */
    getPhysicalOrbitalVelocityKmS(zoneId) {
        const zone = this.solarSystem?.orbitalData?.orbital_zones?.find(z => z.id === zoneId);
        if (!zone) return 0;
        
        // Standard gravitational parameter for Sun (m³/s²)
        const SUN_MU = 1.32712440018e20; // G * M_sun
        
        // Get orbital radius in meters
        const r = zone.radius_km * 1000; // Convert km to m
        
        if (r <= 0) return 0;
        
        // For circular orbit: v = sqrt(μ/r)
        const velocityMS = Math.sqrt(SUN_MU / r);
        
        // Convert m/s to km/s
        return velocityMS / 1000;
    }
    
    /**
     * Calculate probe delta-v capacity from skills (simplified version)
     * This matches the logic in orbital_mechanics.js but doesn't require economic rules
     * @param {Object} skills - Current skills from research
     * @returns {number} Probe delta-v capacity in km/s
     */
    calculateProbeDeltaVCapacity(skills) {
        // Default base capacity (matches orbital_mechanics.js default)
        const baseDeltaV = 1.0; // km/s
        
        // Simplified calculation: if we have propulsion skill, use it
        // Otherwise, return base capacity
        // Note: Full calculation requires economic rules, but this is sufficient for visualization
        if (skills && skills.propulsion) {
            // Simple multiplier: propulsion skill increases capacity linearly
            // This is a simplified version - full version uses skill coefficients from config
            return baseDeltaV * skills.propulsion;
        }
        
        return baseDeltaV;
    }
    
    /**
     * Get transfer velocity with probe capacity boost (visual linear velocity)
     * Uses logarithmic scaling for excess delta-v (matches game physics)
     * @param {string} zoneId - Zone ID
     * @param {number} probeDeltaVCapacity - Probe's delta-v capacity in km/s (optional)
     * @returns {number} Linear velocity in visual units/day (game time)
     */
    getTransferVelocity(zoneId, probeDeltaVCapacity = null) {
        const baseVelocity = this.getOrbitalVelocity(zoneId);
        
        // If no probe capacity provided, return base velocity
        if (probeDeltaVCapacity === null || probeDeltaVCapacity === undefined) {
            return baseVelocity;
        }
        
        // Get zone data for escape velocity
        const zone = this.solarSystem?.orbitalData?.orbital_zones?.find(z => z.id === zoneId);
        if (!zone) return baseVelocity;
        
        const escapeVelocity = zone.escape_delta_v_km_s || 0;
        
        // Calculate excess delta-v (beyond what's needed for escape)
        const excessDeltaV = Math.max(0, probeDeltaVCapacity - escapeVelocity);
        
        // Calculate speed multiplier using logarithmic scaling
        // This matches the game physics in orbital_mechanics.js
        // With 0 excess: multiplier = 1.0
        // With 7.5 km/s excess: multiplier ≈ 1.7
        // With 15 km/s excess: multiplier ≈ 2.1
        const EXCESS_DV_SCALE = 7.5; // km/s that gives ~2x speed bonus
        let speedMultiplier = 1.0;
        if (excessDeltaV > 0) {
            speedMultiplier = 1.0 + Math.log(1 + excessDeltaV / EXCESS_DV_SCALE);
        }
        
        return baseVelocity * speedMultiplier;
    }
    
    /**
     * Calculate Hohmann transfer ellipse velocity with detailed info
     * 
     * Uses the vis-viva equation for elliptical orbits:
     * - At periapsis (inner): v = v_circular × sqrt(2 × r_outer / (r_inner + r_outer))
     * - At apoapsis (outer): v = v_circular × sqrt(2 × r_inner / (r_inner + r_outer))
     * 
     * For outbound transfers (inner to outer): probe starts FASTER than circular velocity
     * For inbound transfers (outer to inner): probe starts SLOWER than circular velocity
     * 
     * Excess delta-v is used to:
     * - At origin: Speed up departure (logarithmic scaling)
     * - At destination: Blend toward circular orbital velocity (exponential approach)
     * 
     * @param {string} fromZoneId - Origin zone ID
     * @param {string} toZoneId - Destination zone ID
     * @param {boolean} atOrigin - True to get velocity at origin, false for destination
     * @param {number} probeDeltaVCapacity - Probe's delta-v capacity in km/s (optional, for speed bonus)
     * @returns {Object} Velocity info with fields:
     *   - velocity: Final velocity in visual units/day
     *   - circularVelocity: Circular orbital velocity at this position
     *   - hohmannMultiplier: Raw Hohmann velocity ratio (before bonuses)
     *   - finalMultiplier: Final velocity ratio after all bonuses
     *   - excessDeltaV: Excess delta-v available (km/s)
     *   - speedMultiplier: Speed bonus multiplier (origin only)
     *   - blendFactor: Blend toward circular (destination only, 0-1)
     *   - isOutbound: Whether transfer is going outward
     */
    getHohmannTransferVelocityInfo(fromZoneId, toZoneId, atOrigin, probeDeltaVCapacity = null) {
        // Get visual radii for both zones
        const fromRadius = this.getVisualOrbitRadius(fromZoneId);
        const toRadius = this.getVisualOrbitRadius(toZoneId);
        
        // Default result for fallback cases
        const defaultResult = {
            velocity: 0,
            circularVelocity: 0,
            hohmannMultiplier: 1.0,
            finalMultiplier: 1.0,
            excessDeltaV: 0,
            speedMultiplier: 1.0,
            blendFactor: 0,
            isOutbound: toRadius > fromRadius
        };
        
        if (!fromRadius || !toRadius || fromRadius === 0 || toRadius === 0) {
            // Fallback to circular orbital velocity
            const zoneId = atOrigin ? fromZoneId : toZoneId;
            const velocity = this.getTransferVelocity(zoneId, atOrigin ? probeDeltaVCapacity : null);
            return { ...defaultResult, velocity, circularVelocity: velocity };
        }
        
        // Determine inner and outer radii
        const rInner = Math.min(fromRadius, toRadius);
        const rOuter = Math.max(fromRadius, toRadius);
        const isOutbound = toRadius > fromRadius;
        
        // Determine if we're at periapsis (inner) or apoapsis (outer) of the transfer ellipse
        const currentRadius = atOrigin ? fromRadius : toRadius;
        const isAtPeriapsis = currentRadius <= rInner * 1.001; // Small tolerance for floating point
        
        // Get circular orbital velocity at the current position
        const zoneId = atOrigin ? fromZoneId : toZoneId;
        const circularVelocity = this.getOrbitalVelocity(zoneId);
        
        // Calculate raw Hohmann velocity multiplier using vis-viva equation
        // At periapsis: v/v_circ = sqrt(2 × r_outer / (r_inner + r_outer))
        // At apoapsis: v/v_circ = sqrt(2 × r_inner / (r_inner + r_outer))
        let hohmannMultiplier;
        if (isAtPeriapsis) {
            // At inner orbit (periapsis): faster than circular
            hohmannMultiplier = Math.sqrt(2 * rOuter / (rInner + rOuter));
        } else {
            // At outer orbit (apoapsis): slower than circular
            hohmannMultiplier = Math.sqrt(2 * rInner / (rInner + rOuter));
        }
        
        // Calculate excess delta-v
        let excessDeltaV = 0;
        let speedMultiplier = 1.0;
        let blendFactor = 0;
        let finalMultiplier = hohmannMultiplier;
        
        if (probeDeltaVCapacity !== null && probeDeltaVCapacity !== undefined) {
            // Get escape velocity from origin zone
            const originZone = this.solarSystem?.orbitalData?.orbital_zones?.find(z => z.id === fromZoneId);
            const escapeVelocity = originZone?.escape_delta_v_km_s || 0;
            
            // Get Hohmann transfer delta-v (approximate from zone radii)
            // This is a simplified estimate; actual value comes from transfer_delta_v.json
            const fromZoneData = this.solarSystem?.orbitalData?.orbital_zones?.find(z => z.id === fromZoneId);
            const toZoneData = this.solarSystem?.orbitalData?.orbital_zones?.find(z => z.id === toZoneId);
            let hohmannDeltaV = 5.0; // Default estimate
            if (fromZoneData && toZoneData) {
                // Rough estimate: delta-v scales with orbit ratio
                const orbitRatio = Math.max(fromZoneData.radius_au, toZoneData.radius_au) / 
                                   Math.min(fromZoneData.radius_au, toZoneData.radius_au);
                hohmannDeltaV = Math.log(orbitRatio) * 5; // Rough approximation
            }
            
            const requiredDeltaV = escapeVelocity + hohmannDeltaV;
            excessDeltaV = Math.max(0, probeDeltaVCapacity - requiredDeltaV);
        }
        
        if (atOrigin) {
            // Origin: Apply speed boost from excess delta-v (logarithmic scaling)
            const EXCESS_DV_SCALE = 7.5; // km/s for ~2x speed bonus
            if (excessDeltaV > 0) {
                speedMultiplier = 1.0 + Math.log(1 + excessDeltaV / EXCESS_DV_SCALE);
            }
            finalMultiplier = hohmannMultiplier * speedMultiplier;
        } else {
            // Destination: Blend toward circular velocity based on excess delta-v
            // This represents using excess delta-v for circularization burn
            const BLEND_SCALE = 5.0; // km/s for ~63% blend toward circular
            if (excessDeltaV > 0) {
                blendFactor = 1 - Math.exp(-excessDeltaV / BLEND_SCALE);
            }
            // Blend from Hohmann multiplier toward 1.0 (circular)
            finalMultiplier = hohmannMultiplier + (1.0 - hohmannMultiplier) * blendFactor;
        }
        
        const velocity = circularVelocity * finalMultiplier;
        
        return {
            velocity,
            circularVelocity,
            hohmannMultiplier,
            finalMultiplier,
            excessDeltaV,
            speedMultiplier,
            blendFactor,
            isOutbound
        };
    }
    
    /**
     * Calculate Hohmann transfer ellipse velocity at origin or destination
     * Simple wrapper that returns just the velocity value
     * 
     * @param {string} fromZoneId - Origin zone ID
     * @param {string} toZoneId - Destination zone ID
     * @param {boolean} atOrigin - True to get velocity at origin, false for destination
     * @param {number} probeDeltaVCapacity - Probe's delta-v capacity in km/s (optional, for speed bonus)
     * @returns {number} Linear velocity in visual units/day (game time)
     */
    getHohmannTransferVelocity(fromZoneId, toZoneId, atOrigin, probeDeltaVCapacity = null) {
        return this.getHohmannTransferVelocityInfo(fromZoneId, toZoneId, atOrigin, probeDeltaVCapacity).velocity;
    }
    
    /**
     * Calculate approximate arc length of Hohmann transfer ellipse (in visual units)
     * Uses numerical integration along the ellipse path
     * @param {Object} params - Ellipse parameters {a, e, rInner, rOuter}
     * @param {number} fromVisualRadius - Origin visual radius
     * @param {number} toVisualRadius - Destination visual radius
     * @returns {number} Arc length in visual units
     */
    calculateArcLength(params, fromVisualRadius, toVisualRadius) {
        if (!params || !fromVisualRadius || !toVisualRadius) return 0;
        
        const rInner = Math.min(fromVisualRadius, toVisualRadius);
        const rOuter = Math.max(fromVisualRadius, toVisualRadius);
        const a = (rInner + rOuter) / 2;
        const e = (rOuter - rInner) / (rOuter + rInner);
        const p = a * (1 - e * e);
        
        // Numerically integrate arc length along half ellipse (Hohmann transfer)
        // Use more segments for accuracy
        const segments = 200;
        let arcLength = 0;
        let prevX = null;
        let prevZ = null;
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const nu = t * Math.PI; // True anomaly from 0 to π (half ellipse)
            
            // Calculate radius using ellipse equation: r = p / (1 + e*cos(ν))
            const r = p / (1 + e * Math.cos(nu));
            
            // Calculate position (angle doesn't matter for length, just relative positions)
            const x = Math.cos(nu) * r;
            const z = Math.sin(nu) * r;
            
            if (prevX !== null) {
                const dx = x - prevX;
                const dz = z - prevZ;
                const segmentLength = Math.sqrt(dx * dx + dz * dz);
                arcLength += segmentLength;
            }
            
            prevX = x;
            prevZ = z;
        }
        
        return arcLength;
    }
    
    /**
     * Calculate visual transfer time based on arc length and average velocity
     * @param {number} arcLength - Arc length in visual units
     * @param {number} vStart - Starting velocity (visual units/day)
     * @param {number} vEnd - Ending velocity (visual units/day)
     * @param {number} gameTransferTimeDays - Game's transfer time in days (for fallback)
     * @returns {number} Visual transfer time in days (game time)
     */
    calculateVisualTransferTime(arcLength, vStart, vEnd, gameTransferTimeDays) {
        const vAvg = (vStart + vEnd) / 2;
        if (vAvg <= 0 || arcLength <= 0) {
            // Fallback to game time
            return gameTransferTimeDays;
        }
        
        // Visual transfer time = arc_length / avg_velocity
        // Units: visual units / (visual units/day) = days
        const visualTimeDays = arcLength / vAvg;
        
        return visualTimeDays;
    }
    
    /**
     * Calculate current velocity at a given point in the transfer
     * Uses linear interpolation: v = v0 + delta_v * (elapsed_time / trip_time)
     * @param {number} v0 - Starting velocity in visual units/day
     * @param {number} vEnd - Ending velocity in visual units/day
     * @param {number} elapsedTime - Time elapsed since departure (in days)
     * @param {number} tripTime - Total trip time (in days)
     * @returns {number} Current velocity in visual units/day
     */
    calculateCurrentVelocity(v0, vEnd, elapsedTime, tripTime) {
        if (tripTime <= 0) return v0;
        
        const deltaV = vEnd - v0;
        const progressRatio = Math.max(0.0, Math.min(1.0, elapsedTime / tripTime));
        
        return v0 + deltaV * progressRatio;
    }
    
    /**
     * Calculate progress using velocity-integrated approach
     * 
     * Key principle: Visual speed should match current velocity at each point
     * Visual speed = (dprogress/dt) * arcLength
     * We want: visual_speed = current_velocity
     * So: dprogress/dt = current_velocity / arcLength
     * Progress = (1/arcLength) * integral(current_velocity) dt
     * 
     * For linear velocity: v(t) = v0 + deltaV * t/T
     * Progress = (1/arcLength) * (v0*t + 0.5*deltaV*t^2/T)
     * 
     * To ensure progress goes from 0 to 1: arcLength = vAvg * T
     * So we use visual trip time: T_visual = arcLength / vAvg (if arcLength available)
     * Otherwise use game's trip time
     * 
     * UNITS: All velocities are in visual units/day, times are in days.
     * This ensures dimensional consistency: position = v*t has units of visual units.
     * 
     * @param {number} v0 - Starting velocity in visual units/day
     * @param {number} vEnd - Ending velocity in visual units/day  
     * @param {number} elapsedTime - Time elapsed since departure (in days)
     * @param {number} tripTime - Total trip time (in days)
     * @param {number} arcLength - Arc length of the transfer (visual units)
     * @returns {number} Progress from 0.0 to 1.0
     */
    calculateVelocityIntegratedProgress(v0, vEnd, elapsedTime, tripTime, arcLength) {
        if (tripTime <= 0) {
            return Math.max(0.0, Math.min(1.0, elapsedTime / tripTime));
        }
        
        const t = Math.max(0, Math.min(elapsedTime, tripTime));
        const T = tripTime; // This is already visualTransferTimeDays when passed from update()
        const deltaV = vEnd - v0;
        const vAvg = (v0 + vEnd) / 2;
        
        // Use the passed-in tripTime directly (it's already visualTransferTimeDays)
        // This accounts for starting velocity differences between outbound and inbound transfers
        // For outbound transfers: visualTransferTimeDays < game's tripTime (faster start)
        // For inbound transfers: visualTransferTimeDays >= game's tripTime (slower start)
        const visualTripTime = T;
        
        // For linear velocity: v(t) = v0 + deltaV * t/T
        // Position = integral of velocity: s(t) = v0*t + 0.5*deltaV*t^2/T
        const position = v0 * t + 0.5 * deltaV * t * t / visualTripTime;
        
        // Total distance: use arcLength if available, otherwise vAvg * visualTripTime
        // Note: if visualTripTime was calculated correctly, arcLength should equal vAvg * visualTripTime
        const totalDistance = arcLength > 0 ? arcLength : (vAvg * visualTripTime);
        
        // Normalized progress (0 to 1)
        const progress = totalDistance > 0 ? position / totalDistance : (t / visualTripTime);
        
        return Math.max(0.0, Math.min(1.0, progress));
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
    createEllipseArc(params, fromAngle, toAngle, transferAngle, fromRadiusAU, toRadiusAU, segments = 256, fromZoneId = null, toZoneId = null) {
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
    /**
     * Create probe transfer visualization from trajectory points in transfer object
     * @param {string} transferId - Transfer ID
     * @param {Object} transfer - Transfer object from game state (with trajectory_points_au)
     * @param {string} fromZoneId - Origin zone ID
     * @param {string} toZoneId - Destination zone ID
     * @param {Object} gameState - Game state
     * @returns {Object} Transfer visualization object
     */
    createProbeTransferFromPoints(transferId, transfer, fromZoneId, toZoneId, gameState) {
        try {
            const trajectoryPointsAU = transfer.trajectory_points_au;
            
            if (!trajectoryPointsAU || trajectoryPointsAU.length < 2) {
                console.error('[TransferViz] Invalid trajectory points in transfer object');
                return null;
            }
            
            // Create trajectory curve
            const trajectoryCurve = this.createTrajectoryCurve(trajectoryPointsAU);
            if (!trajectoryCurve) {
                console.error('[TransferViz] Failed to create trajectory curve');
                return null;
            }
            
            // Calculate arc length along trajectory
            const arcLength = this.calculateTrajectoryArcLength(trajectoryCurve);
            
            // Create trajectory line visualization
            const curvePoints = trajectoryCurve.getPoints(100);
            const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
            const material = new THREE.LineDashedMaterial({
                color: this.colors.probe,
                dashSize: 0.1,
                gapSize: 0.05,
                opacity: 0.6,
                transparent: true
            });
            const line = new THREE.Line(geometry, material);
            line.computeLineDistances();
            this.scene.add(line);
            line.visible = this.linesVisible;
            
            // Create probe dot
            const dot = this.createCargoDot('probe', null);
            this.scene.add(dot);
            
            // Calculate velocities based on trajectory
            const departureTime = transfer.departure_time || 0;
            const transferTimeDays = transfer.transfer_time || 0;
            const avgVelocity = arcLength > 0 && transferTimeDays > 0 ? arcLength / transferTimeDays : 0.01;
            
            // Estimate velocities at start and end (simplified - could be improved with actual velocity vectors)
            const fromVelocity = avgVelocity * 1.2; // Start faster
            const toVelocity = avgVelocity * 0.8;   // End slower
            
            const transferViz = {
                ellipse: line, // Store line in ellipse field for compatibility
                trajectoryCurve: trajectoryCurve,
                trajectoryPointsAU: trajectoryPointsAU,
                fromZoneId: fromZoneId,
                toZoneId: toZoneId,
                dot: dot,
                transferId: transferId,
                resourceType: 'probe',
                fromVelocity: fromVelocity,
                toVelocity: toVelocity,
                avgVelocity: avgVelocity,
                arcLength: arcLength,
                visualTransferTimeDays: transferTimeDays,
                departureTime: departureTime,
                arrivalTime: departureTime + transferTimeDays,
                // Fallback ellipse params (not used but kept for compatibility)
                params: null,
                fromAngle: 0,
                toAngle: 0,
                transferAngle: 0,
                fromAU: 0,
                toAU: 0
            };
            
            return transferViz;
        } catch (error) {
            console.error(`[TransferViz] Error creating probe transfer from points:`, error);
            return null;
        }
    }
    
    /**
     * Create fallback transfer visualization using Hohmann ellipse (for metal transfers or when trajectory fetch fails)
     * @param {string} transferId - Transfer ID
     * @param {Object} transfer - Transfer object
     * @param {string} fromZoneId - Origin zone ID
     * @param {string} toZoneId - Destination zone ID
     * @param {string} resourceType - Resource type
     * @param {Object} gameState - Game state
     */
    createFallbackTransfer(transferId, transfer, fromZoneId, toZoneId, resourceType, gameState) {
        const ellipseData = this.createEllipseLine(fromZoneId, toZoneId, resourceType);
        if (!ellipseData) {
            return; // Skip if can't create ellipse
        }
        
        // Get mass for one-time transfers (metal_kg for metal, probe mass for probes)
        const transferMassKg = resourceType === 'metal' ? (transfer.metal_kg || 0) : null;
        const dot = this.createCargoDot(resourceType, transferMassKg);
        
        this.scene.add(ellipseData.line);
        // Add dot(s) to scene - handle both single dot and array of dots
        if (this.isMultiDot(dot)) {
            for (const d of dot) {
                this.scene.add(d);
            }
        } else {
            this.scene.add(dot);
        }
        
        // Get probe delta-v capacity from skills
        let probeDeltaVCapacity = null;
        if (gameState && gameState.skills) {
            probeDeltaVCapacity = this.calculateProbeDeltaVCapacity(gameState.skills);
        }
        
        // Calculate Hohmann transfer velocities with detailed info
        const fromVelocityInfo = this.getHohmannTransferVelocityInfo(fromZoneId, toZoneId, true, probeDeltaVCapacity);
        const toVelocityInfo = this.getHohmannTransferVelocityInfo(fromZoneId, toZoneId, false, probeDeltaVCapacity);
        
        // Check if mass driver exists at origin zone
        let hasMassDriver = false;
        if (gameState && gameState.structures_by_zone) {
            const zoneStructures = gameState.structures_by_zone[fromZoneId] || {};
            hasMassDriver = (zoneStructures['mass_driver'] || 0) > 0;
        }
        
        // Apply mass driver boost: 1.5x origin velocity if mass driver exists
        const massDriverMultiplier = hasMassDriver ? 1.5 : 1.0;
        const fromVelocity = fromVelocityInfo.velocity * massDriverMultiplier;
        const toVelocity = toVelocityInfo.velocity;
        const avgVelocity = (fromVelocity + toVelocity) / 2;
        
        // Calculate visual arc length and visual transfer time
        const fromVisualRadius = this.getVisualOrbitRadius(fromZoneId);
        const toVisualRadius = this.getVisualOrbitRadius(toZoneId);
        let arcLength = 0;
        const gameTransferTime = transfer.transfer_time || 0;
        let visualTransferTimeDays = gameTransferTime; // Fallback to game time
        
        if (fromVisualRadius && toVisualRadius && ellipseData.params) {
            arcLength = this.calculateArcLength(ellipseData.params, fromVisualRadius, toVisualRadius);
            if (arcLength > 0 && avgVelocity > 0) {
                visualTransferTimeDays = arcLength / avgVelocity;
            }
        }
        
        const transferViz = {
            ellipse: ellipseData.line,
            params: ellipseData.params,
            fromAngle: ellipseData.fromAngle,
            toAngle: ellipseData.toAngle,
            transferAngle: ellipseData.transferAngle,
            fromAU: ellipseData.fromAU,
            toAU: ellipseData.toAU,
            fromZoneId: fromZoneId,
            toZoneId: toZoneId,
            dot: dot,
            transferId: transferId,
            resourceType: resourceType,
            fromVelocity: fromVelocity,
            toVelocity: toVelocity,
            avgVelocity: avgVelocity,
            hasMassDriver: hasMassDriver,
            massDriverMultiplier: massDriverMultiplier,
            arcLength: arcLength,
            visualTransferTimeDays: visualTransferTimeDays,
            probeDeltaVCapacity: probeDeltaVCapacity,
            excessDeltaV: fromVelocityInfo.excessDeltaV,
            isOutbound: fromVelocityInfo.isOutbound,
            fromCircularVelocity: fromVelocityInfo.circularVelocity,
            fromHohmannMultiplier: fromVelocityInfo.hohmannMultiplier,
            fromSpeedMultiplier: fromVelocityInfo.speedMultiplier,
            toCircularVelocity: toVelocityInfo.circularVelocity,
            toHohmannMultiplier: toVelocityInfo.hohmannMultiplier,
            toBlendFactor: toVelocityInfo.blendFactor
        };
        
        // Respect current visibility state (Tab toggle)
        ellipseData.line.visible = this.linesVisible;
        
        this.transfers.set(transferId, transferViz);
    }
    
    /**
     * Inverse scale function to convert visual units back to AU (approximate)
     * @param {number} visualR - Visual radius
     * @returns {number} Radius in AU
     */
    inverseScaleAUToVisual(visualR) {
        if (!this.solarSystem) return visualR / 80;
        
        // This is approximate - for exact conversion we'd need to invert the hybrid scaling
        // For now, use a simple approximation
        const MARS_AU = 1.52;
        const OUTER_BOUNDARY_AU = 140.0;
        const INNER_VISUAL_FRACTION = 0.1;
        const orbitScale = this.solarSystem.orbitScale || 800.0;
        
        const visualFraction = visualR / orbitScale;
        
        if (visualFraction <= INNER_VISUAL_FRACTION) {
            // Linear scaling region
            return (visualFraction / INNER_VISUAL_FRACTION) * MARS_AU;
        } else {
            // Logarithmic scaling region
            const logNorm = (visualFraction - INNER_VISUAL_FRACTION) / (1 - INNER_VISUAL_FRACTION);
            return Math.exp(Math.log(MARS_AU) + logNorm * (Math.log(OUTER_BOUNDARY_AU) - Math.log(MARS_AU)));
        }
    }
    
    /**
     * Calculate position along trajectory curve at given progress (0.0 to 1.0)
     * Uses trajectory points if available, otherwise falls back to ellipse calculation
     * @param {Object} viz - Transfer visualization object (may contain trajectoryCurve)
     * @param {number} progress - Progress along transfer (0.0 to 1.0)
     * @returns {THREE.Vector3} Position in visual space
     */
    calculatePositionOnTrajectory(viz, progress) {
        // If trajectory curve is available, use it
        if (viz.trajectoryCurve) {
            const point = viz.trajectoryCurve.getPoint(Math.max(0, Math.min(1, progress)));
            return point;
        }
        
        // Fall back to ellipse calculation
        return this.calculatePositionOnEllipse(
            viz.params,
            viz.fromAngle,
            viz.toAngle,
            viz.transferAngle,
            viz.fromAU,
            viz.toAU,
            progress,
            viz.fromZoneId,
            viz.toZoneId
        );
    }
    
    /**
     * Calculate arc length along trajectory curve
     * @param {THREE.Curve} curve - Trajectory curve
     * @param {number} segments - Number of segments for integration (default 100)
     * @returns {number} Arc length in visual units
     */
    calculateTrajectoryArcLength(curve, segments = 100) {
        let length = 0;
        const prevPoint = curve.getPoint(0);
        
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const point = curve.getPoint(t);
            length += prevPoint.distanceTo(point);
            prevPoint.copy(point);
        }
        
        return length;
    }
    
    /**
     * Create trajectory curve from backend points
     * @param {Array<Array<number>>} trajectoryPointsAU - Array of [x, y] positions in AU
     * @returns {THREE.Curve} Catmull-Rom spline curve
     */
    createTrajectoryCurve(trajectoryPointsAU) {
        // Convert AU coordinates to visual coordinates
        const visualPoints = this.convertAUPointsToVisual(trajectoryPointsAU);
        
        if (visualPoints.length < 2) {
            return null;
        }
        
        // Create smooth curve through the points using Catmull-Rom spline
        const curve = new THREE.CatmullRomCurve3(visualPoints, false, 'catmullrom', 0.5);
        return curve;
    }
    
    /**
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
        const geometry = this.createEllipseArc(params, fromAngle, toAngle, transferAngle, params.fromAU, params.toAU, 128, fromZoneId, toZoneId);
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
     * Create cargo icon(s) for a transfer
     * Metal transfers use a single cube sized proportionally to mass
     * Probes use a single dot (Points) matching the probe particle system
     * @param {string} resourceType - Type of resource being transferred
     * @param {number} massKg - Optional mass in kg for mass-proportional sizing
     */
    createCargoDot(resourceType, massKg = null) {
        const color = this.colors[resourceType] || this.colors.probe;
        
        if (resourceType === 'metal') {
            // Calculate size from mass using the same distribution as resource particles
            let size;
            if (massKg && massKg > 0) {
                size = this.calculateMassVisualSize(massKg);
            } else {
                // Fallback to minimum visible size if no mass provided
                size = 0.02;
            }
            
            const geometry = new THREE.BoxGeometry(size, size, size);
            const material = new THREE.MeshBasicMaterial({
                color: color
            });
            
            const icon = new THREE.Mesh(geometry, material);
            icon.userData.massKg = massKg || 0;
            return icon;
        } else {
            // Create a single dot (Points) for probe transfers
            // Uses same dot style as probe particles in the solar system
            const transferSize = this.getProbeTransferSize();
            
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
            
            const material = new THREE.PointsMaterial({
                color: color,
                size: transferSize,
                sizeAttenuation: true,
                transparent: true,
                opacity: 1.0,
                depthWrite: false
            });
            
            const icon = new THREE.Points(geometry, material);
            return icon;
        }
    }
    
    /**
     * Get probe transfer dot size from config
     * Falls back to default if solarSystem config not available
     */
    getProbeTransferSize() {
        // Try to get from solarSystem's loaded config
        if (this.solarSystem && 
            this.solarSystem.probeParticleConfig && 
            this.solarSystem.probeParticleConfig.transferSize !== undefined) {
            return this.solarSystem.probeParticleConfig.transferSize;
        }
        // Fallback default
        return 0.16;
    }
    
    /**
     * Check if cargo is an array of dots (metal) or single dot (probe)
     */
    isMultiDot(dot) {
        return Array.isArray(dot);
    }
    
    /**
     * Calculate visual size for a mass using the same distribution as resource particles.
     * Uses solarSystem's massToVisualSize for consistency.
     * @param {number} massKg - Mass in kg
     * @returns {number} Visual size for THREE.js rendering
     */
    calculateMassVisualSize(massKg) {
        // Use solarSystem's unified particle sizing if available
        if (this.solarSystem && this.solarSystem.massToVisualSize) {
            return this.solarSystem.massToVisualSize(massKg);
        }
        
        // Fallback: use same algorithm as solarSystem.massToVisualSize
        // Config defaults from applyDefaultParticleConfig
        const minMass = 1e6;        // 1 megakilogram
        const maxMass = 1e22;       // 10 zettakilograms
        const minVisualSize = 0.05; // Tiny dot
        const maxVisualSize = 3.5;  // Huge asteroid
        const sizeExponent = 0.4;   // Power transform
        
        const logMass = Math.log10(Math.max(minMass, Math.min(maxMass, massKg)));
        const logMin = Math.log10(minMass);  // 6
        const logMax = Math.log10(maxMass);  // 22
        
        // Normalize to [0, 1] in log-space
        let t = (logMass - logMin) / (logMax - logMin);
        
        // Apply power transform to shift size distribution
        t = Math.pow(t, sizeExponent);
        
        // Exponential scaling: size = minSize * (maxSize/minSize)^t
        const sizeRatio = maxVisualSize / minVisualSize;
        const size = minVisualSize * Math.pow(sizeRatio, t);
        
        return size;
    }
    
    /**
     * Create mass dots for a transfer, split by mass driver count.
     * Multiple mass drivers create multiple dots launched at staggered times within 1 day.
     * @param {number} massKg - Total mass in kg
     * @param {number} arcLength - Arc length of the transfer path
     * @param {number} massDriverCount - Number of mass drivers (1-20, saturates at 20)
     * @returns {Array<THREE.Mesh>} Array of dot meshes
     */
    createMassStream(massKg, arcLength, massDriverCount = 1) {
        const color = this.colors.metal;
        const dots = [];
        
        // Minimum mass threshold for visibility
        const MIN_MASS_KG = 10000; // 10 tons minimum
        if (massKg < MIN_MASS_KG) {
            return dots;
        }
        
        // Determine number of dots based on mass driver count
        // - Saturates at 20 mass drivers
        // - Only split if mass >= 1e6 kg (1 megatonne)
        const MAX_DOTS = 20;
        const MIN_MASS_FOR_SPLIT = 1e6; // 1 megatonne
        
        let numDots = 1;
        if (massKg >= MIN_MASS_FOR_SPLIT && massDriverCount > 1) {
            numDots = Math.min(massDriverCount, MAX_DOTS);
        }
        
        // Calculate mass per dot
        const massPerDot = massKg / numDots;
        const visualSize = this.calculateMassVisualSize(massPerDot);
        
        // Create dots with staggered launch times
        // All shots happen within 1 game day, evenly spaced
        for (let i = 0; i < numDots; i++) {
            const geometry = new THREE.BoxGeometry(visualSize, visualSize, visualSize);
            const material = new THREE.MeshBasicMaterial({
                color: color
            });
            
            const dot = new THREE.Mesh(geometry, material);
            
            // Launch offset in days (0 to just under 1 day, evenly spaced)
            // First dot launches at t=0, last dot launches at t = (numDots-1)/numDots days
            const launchOffset = numDots > 1 ? (i / numDots) : 0;
            
            dot.userData.launchOffset = launchOffset;
            dot.userData.massKg = massPerDot;
            dot.userData.dotIndex = i;
            dot.visible = false; // Start hidden until launched
            
            dots.push(dot);
        }
        
        return dots;
    }
    
    /**
     * Update the mass and visual size of an existing chunk visualization
     * Called when new batches are added to an existing 7-day chunk
     * @param {Object} batchViz - The existing batch visualization object
     * @param {number} newTotalMassKg - The new total mass for this chunk
     */
    updateChunkVisualizationMass(batchViz, newTotalMassKg) {
        if (!batchViz || !batchViz.dot) return;
        
        const oldMass = batchViz.totalMassKg || 0;
        batchViz.totalMassKg = newTotalMassKg;
        
        // Update dot(s) - handle both single dot and array of dots
        if (this.isMultiDot(batchViz.dot)) {
            // Multi-dot: divide mass among all dots
            const numDots = batchViz.dot.length;
            const massPerDot = newTotalMassKg / numDots;
            const newVisualSize = this.calculateMassVisualSize(massPerDot);
            
            for (const d of batchViz.dot) {
                // Update geometry size
                if (d.geometry) {
                    d.geometry.dispose();
                    d.geometry = new THREE.BoxGeometry(newVisualSize, newVisualSize, newVisualSize);
                }
                d.userData.massKg = massPerDot;
            }
        } else if (batchViz.dot.geometry) {
            // Single dot - update its geometry with full mass
            const newVisualSize = this.calculateMassVisualSize(newTotalMassKg);
            batchViz.dot.geometry.dispose();
            batchViz.dot.geometry = new THREE.BoxGeometry(newVisualSize, newVisualSize, newVisualSize);
            batchViz.dot.userData.massKg = newTotalMassKg;
        }
        
        // Log the update for debugging
        if (newTotalMassKg > oldMass * 1.1) { // Only log if significant increase (>10%)
            console.log(`[TransferViz] Updated chunk ${batchViz.batchId} mass: ${(oldMass/1e6).toFixed(2)}Mt -> ${(newTotalMassKg/1e6).toFixed(2)}Mt`);
        }
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
     * Creates a new ellipse and dot every 7 days (metal) or 120 days (probes)
     * @param {Object} transfer - Transfer object
     * @param {string} fromZoneId - Origin zone ID
     * @param {string} toZoneId - Destination zone ID
     * @param {string} resourceType - 'probe' or 'metal'
     * @param {number} departureTime - Departure time (chunk start time)
     * @param {number} transferTime - Transfer time in days
     * @param {Object} gameState - Game state (optional)
     * @param {number} batchMassKg - Total mass for this chunk (optional, for metal transfers)
     */
    createPeriodicVisualization(transfer, fromZoneId, toZoneId, resourceType, departureTime, transferTime, gameState = null, batchMassKg = null) {
        const batchId = this.getBatchId(transfer.id, departureTime);
        
        // Check if visualization already exists
        if (this.continuousBatches.has(batchId)) {
            return this.continuousBatches.get(batchId);
        }
        
        // Create ellipse using current zone positions (captured at creation time)
        // This fixes the trajectory for this specific visualization
        const ellipseData = this.createEllipseLine(fromZoneId, toZoneId, resourceType);
        if (!ellipseData) {
            console.warn(`[TransferViz] Failed to create ellipse for ${fromZoneId} -> ${toZoneId}`);
            return null;
        }
        
        // Calculate visual arc length for mass stream creation
        const fromVisualRadius = this.getVisualOrbitRadius(fromZoneId);
        const toVisualRadius = this.getVisualOrbitRadius(toZoneId);
        let arcLength = 0;
        if (fromVisualRadius && toVisualRadius && ellipseData.params) {
            arcLength = this.calculateArcLength(ellipseData.params, fromVisualRadius, toVisualRadius);
        }
        
        // For metal transfers, create mass-proportioned dot(s); for probes, use single dot
        // Multiple mass drivers create multiple staggered dots
        let dot;
        const willCreateMassStream = resourceType === 'metal' && batchMassKg !== null && batchMassKg > 0 && arcLength > 0;
        
        if (willCreateMassStream) {
            // Get mass driver count from game state for multi-shot visualization
            let massDriverCount = 1;
            if (gameState && gameState.structures_by_zone) {
                const zoneStructures = gameState.structures_by_zone[fromZoneId] || {};
                massDriverCount = zoneStructures['mass_driver'] || 1;
            }
            dot = this.createMassStream(batchMassKg, arcLength, massDriverCount);
        } else {
            // Pass mass for proper sizing (metal transfers)
            dot = this.createCargoDot(resourceType, batchMassKg);
        }
        
        this.scene.add(ellipseData.line);
        // Add dot(s) to scene - handle both single dot and array of dots
        if (this.isMultiDot(dot)) {
            for (const d of dot) {
                this.scene.add(d);
            }
        } else {
            this.scene.add(dot);
        }
        
        // Get probe delta-v capacity from skills
        let probeDeltaVCapacity = null;
        if (gameState && gameState.skills) {
            probeDeltaVCapacity = this.calculateProbeDeltaVCapacity(gameState.skills);
        }
        
        // Calculate Hohmann transfer velocities with detailed info
        // At periapsis (inner): faster than circular, at apoapsis (outer): slower than circular
        // Excess delta-v provides speed bonus at origin and blend toward circular at destination
        const fromVelocityInfo = this.getHohmannTransferVelocityInfo(fromZoneId, toZoneId, true, probeDeltaVCapacity);
        const toVelocityInfo = this.getHohmannTransferVelocityInfo(fromZoneId, toZoneId, false, probeDeltaVCapacity);
        
        // Check if mass driver exists at origin zone
        let hasMassDriver = false;
        if (gameState && gameState.structures_by_zone) {
            const zoneStructures = gameState.structures_by_zone[fromZoneId] || {};
            hasMassDriver = (zoneStructures['mass_driver'] || 0) > 0;
        }
        
        // Apply mass driver boost: 1.5x origin velocity if mass driver exists
        const massDriverMultiplier = hasMassDriver ? 1.5 : 1.0;
        const fromVelocity = fromVelocityInfo.velocity * massDriverMultiplier;
        const toVelocity = toVelocityInfo.velocity;
        const avgVelocity = (fromVelocity + toVelocity) / 2;
        
        // Calculate visual transfer time (arcLength already calculated above)
        let visualTransferTimeDays = transferTime; // Fallback to game time
        if (arcLength > 0 && avgVelocity > 0) {
            // Calculate visual transfer time using average velocity
            // Units: arcLength (visual units) / avgVelocity (visual units/day) = days
            // This ensures progress reaches exactly 1.0 at completion
            // Visual speed varies linearly from fromVelocity to toVelocity
            visualTransferTimeDays = arcLength / avgVelocity;
        }
        
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
            arrivalTime: arrivalTime,
            resourceType: resourceType,
            totalMassKg: batchMassKg || 0, // Track total mass for this chunk (for updates)
            fromVelocity: fromVelocity,
            toVelocity: toVelocity,
            avgVelocity: avgVelocity,
            hasMassDriver: hasMassDriver,
            massDriverMultiplier: massDriverMultiplier,
            arcLength: arcLength,
            visualTransferTimeDays: visualTransferTimeDays,
            // Velocity detail info
            probeDeltaVCapacity: probeDeltaVCapacity,
            excessDeltaV: fromVelocityInfo.excessDeltaV,
            isOutbound: fromVelocityInfo.isOutbound,
            // Origin velocity breakdown
            fromCircularVelocity: fromVelocityInfo.circularVelocity,
            fromHohmannMultiplier: fromVelocityInfo.hohmannMultiplier,
            fromSpeedMultiplier: fromVelocityInfo.speedMultiplier,
            // Destination velocity breakdown
            toCircularVelocity: toVelocityInfo.circularVelocity,
            toHohmannMultiplier: toVelocityInfo.hohmannMultiplier,
            toBlendFactor: toVelocityInfo.blendFactor
        };
        
        // Respect current visibility state (Tab toggle)
        ellipseData.line.visible = this.linesVisible;
        
        this.continuousBatches.set(batchId, batchViz);
        return batchViz;
    }
    
    /**
     * Remove batch visualization
     */
    removeBatch(batchId) {
        const batchViz = this.continuousBatches.get(batchId);
        if (!batchViz) return;
        
        // Remove ellipse line trajectory
        if (batchViz.ellipse) {
            // Ensure it's removed from scene even if already removed
            if (batchViz.ellipse.parent) {
                batchViz.ellipse.parent.remove(batchViz.ellipse);
            }
            this.scene.remove(batchViz.ellipse);
            if (batchViz.ellipse.geometry) batchViz.ellipse.geometry.dispose();
            if (batchViz.ellipse.material) {
                if (Array.isArray(batchViz.ellipse.material)) {
                    batchViz.ellipse.material.forEach(mat => mat.dispose());
                } else {
                    batchViz.ellipse.material.dispose();
                }
            }
        }
        
        // Remove dot(s)
        if (batchViz.dot) {
            // Handle both single dot and array of dots (for backwards compatibility)
            if (this.isMultiDot(batchViz.dot)) {
                for (const d of batchViz.dot) {
                    if (d.parent) d.parent.remove(d);
                    this.scene.remove(d);
                    if (d.geometry) d.geometry.dispose();
                    if (d.material) d.material.dispose();
                }
            } else {
                if (batchViz.dot.parent) batchViz.dot.parent.remove(batchViz.dot);
                this.scene.remove(batchViz.dot);
                if (batchViz.dot.geometry) batchViz.dot.geometry.dispose();
                if (batchViz.dot.material) batchViz.dot.material.dispose();
            }
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
        
        // Update animation timing state from game engine
        this.lastGameTime = currentTime;
        this.timeSpeed = window.gameEngine?.timeSpeed || 1;
        // Game is paused when engine is not running
        this.isPaused = !(window.gameEngine?.isRunning ?? true);
        
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
                // Metal: weekly (7 days), Probes: every 120 days
                if (!transfer.paused) {
                    // Get transfer time (in days)
                    const transferTime = transfer.transfer_time || 0;
                    if (transferTime > 0) {
                        // Process batches in transit and group them into chunks
                        if (transfer.in_transit && transfer.in_transit.length > 0) {
                            // Track which chunks we've seen and accumulate mass per chunk
                            const seenChunks = new Set();
                            const chunkMasses = new Map(); // {chunkId: totalMassKg}
                            
                            // First pass: accumulate masses per chunk
                            for (const batch of transfer.in_transit) {
                                const batchDepartureTime = batch.departure_time || 0;
                                const chunkStartTime = this.getChunkStartTime(batchDepartureTime, resourceType);
                                const chunkId = this.getBatchId(transferId, chunkStartTime);
                                
                                // Accumulate mass for metal transfers
                                if (resourceType === 'metal' && batch.mass_kg) {
                                    const currentMass = chunkMasses.get(chunkId) || 0;
                                    chunkMasses.set(chunkId, currentMass + batch.mass_kg);
                                }
                            }
                            
                            
                            // Second pass: create visualizations
                            for (const batch of transfer.in_transit) {
                                const batchDepartureTime = batch.departure_time || 0;
                                const chunkStartTime = this.getChunkStartTime(batchDepartureTime, resourceType);
                                const chunkId = this.getBatchId(transferId, chunkStartTime);
                                
                                seenChunks.add(chunkId);
                                
                                // Create visualization for this chunk if it doesn't exist
                                // Also recreate if existing visualization has 0 dots (creation failed)
                                // Also update mass if new batches were added to existing chunk
                                let needsCreation = !this.continuousBatches.has(chunkId);
                                const currentChunkMass = resourceType === 'metal' ? (chunkMasses.get(chunkId) || 0) : 0;
                                
                                if (!needsCreation) {
                                    const existingViz = this.continuousBatches.get(chunkId);
                                    if (existingViz && existingViz.dot) {
                                        const dotCount = Array.isArray(existingViz.dot) ? existingViz.dot.length : 1;
                                        if (dotCount === 0) {
                                            // Recreate visualizations that failed to create dots
                                            this.removeBatch(chunkId);
                                            needsCreation = true;
                                        } else if (resourceType === 'metal' && existingViz.totalMassKg !== undefined) {
                                            // Check if mass has increased - update visualization size if so
                                            if (currentChunkMass > existingViz.totalMassKg) {
                                                this.updateChunkVisualizationMass(existingViz, currentChunkMass);
                                            }
                                        }
                                    }
                                }
                                
                                if (needsCreation) {
                                    // Get accumulated mass for this chunk (metal transfers only)
                                    const batchMassKg = resourceType === 'metal' ? currentChunkMass : null;
                                    
                                    // Create visualization for this chunk (weekly for metal, 120 days for probes)
                                    // Use chunk start time as departure time
                                    const batchViz = this.createPeriodicVisualization(
                                        transfer,
                                        fromZoneId,
                                        toZoneId,
                                        resourceType,
                                        chunkStartTime,
                                        transferTime,
                                        gameState,
                                        batchMassKg
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
                // Collect batches to remove after iteration (avoid modifying Map while iterating)
                const batchesToRemove = [];
                
                for (const [batchId, batchViz] of this.continuousBatches.entries()) {
                    if (batchViz.transferId === transferId) {
                        seenBatchIds.add(batchId);
                        
                        // Calculate progress by integrating velocity over time
                        const tripTime = batchViz.arrivalTime - batchViz.departureTime;
                        const elapsed = currentTime - batchViz.departureTime;
                        
                        // Use visual transfer time if available (accounts for starting velocity)
                        const visualTripTime = batchViz.visualTransferTimeDays || tripTime;
                        
                        // Sync animation state for smooth interpolation between updates
                        // (Dot positioning is handled by animate() for smooth 60fps updates)
                        const scaledElapsed = tripTime > 0 ? (elapsed / tripTime) * visualTripTime : elapsed;
                        this.syncAnimationState(batchViz, scaledElapsed);
                        
                        // Calculate progress to check for completion
                        const v0 = batchViz.fromVelocity || 0.01;
                        const vEnd = batchViz.toVelocity || 0.01;
                        const arcLength = batchViz.arcLength || 0;
                        
                        // For multi-dot batches with staggered launches, check each dot individually
                        if (this.isMultiDot(batchViz.dot)) {
                            let allDotsComplete = true;
                            const arrivedDots = [];
                            
                            for (const dot of batchViz.dot) {
                                const launchOffset = dot.userData.launchOffset || 0;
                                const effectiveElapsed = elapsed - launchOffset;
                                
                                // Check if this specific dot has completed
                                const dotProgress = effectiveElapsed >= 0 
                                    ? this.calculateVelocityIntegratedProgress(v0, vEnd, effectiveElapsed, visualTripTime, arcLength)
                                    : 0;
                                const dotHasArrived = dotProgress >= 1.0;
                                
                                if (!dotHasArrived) {
                                    allDotsComplete = false;
                                } else if (!dot.userData.arrivalEmitted) {
                                    // This dot just arrived - collect for arrival event
                                    dot.userData.arrivalEmitted = true;
                                    dot.visible = false;
                                    arrivedDots.push(dot);
                                }
                            }
                            
                            // Emit arrival events for newly arrived dots
                            if (arrivedDots.length > 0) {
                                this.emitDotArrivals(batchViz, arrivedDots);
                            }
                            
                            // Only remove batch when ALL dots have completed
                            if (allDotsComplete) {
                                batchesToRemove.push(batchId);
                            }
                        } else {
                            // Single dot - use original logic
                            const progress = this.calculateVelocityIntegratedProgress(v0, vEnd, elapsed, visualTripTime, arcLength);
                            const hasArrived = currentTime >= batchViz.arrivalTime;
                            const isComplete = progress >= 1.0 || hasArrived;
                            
                            if (isComplete) {
                                // Emit arrival event before removing
                                this.emitArrivalEvent(batchViz);
                                
                                // Hide dot
                                if (batchViz.dot) {
                                    batchViz.dot.visible = false;
                                }
                                
                                // Mark for removal
                                batchesToRemove.push(batchId);
                            }
                        }
                        // Note: Dot positioning is now handled by animate() method for smooth 60fps updates
                    }
                }
                
                // Remove completed batch visualizations
                for (const batchId of batchesToRemove) {
                    this.removeBatch(batchId);
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
                    // For probe transfers, use trajectory points if available in transfer object
                    // Otherwise fall back to Hohmann ellipse
                    if (resourceType === 'probe' && transfer.trajectory_points_au && transfer.trajectory_points_au.length > 0) {
                        // Use trajectory points from transfer object
                        transferViz = this.createProbeTransferFromPoints(transferId, transfer, fromZoneId, toZoneId, gameState);
                        if (transferViz) {
                            this.transfers.set(transferId, transferViz);
                        } else {
                            // Fall back to Hohmann if creation failed
                            this.createFallbackTransfer(transferId, transfer, fromZoneId, toZoneId, resourceType, gameState);
                            transferViz = this.transfers.get(transferId);
                        }
                    } else {
                        // Metal transfers or probe transfers without trajectory points use Hohmann ellipse
                        this.createFallbackTransfer(transferId, transfer, fromZoneId, toZoneId, resourceType, gameState);
                        // Get the newly created transferViz
                        transferViz = this.transfers.get(transferId);
                    }
                }
                
                // Skip if transferViz still doesn't exist (async creation in progress)
                if (!transferViz) {
                    continue;
                }
                
                // Calculate progress by integrating velocity over time
                const departureTime = transfer.departure_time || 0;
                const arrivalTime = transfer.arrival_time || currentTime;
                const tripTime = arrivalTime - departureTime;
                const elapsed = currentTime - departureTime;
                
                // Use visual transfer time if available (accounts for starting velocity)
                // For outbound transfers (high v0), visualTransferTimeDays is shorter than tripTime
                // This makes them appear faster, matching the higher initial velocity
                const visualTripTime = transferViz.visualTransferTimeDays || tripTime;
                
                // Sync animation state for smooth interpolation between updates
                // Scale elapsed to match visual trip time proportion
                const scaledElapsed = tripTime > 0 ? (elapsed / tripTime) * visualTripTime : elapsed;
                this.syncAnimationState(transferViz, scaledElapsed);
                
                // Calculate progress to check for completion
                // (Dot positioning is handled by animate() for smooth 60fps updates)
                const v0 = transferViz.fromVelocity || 0.01;
                const vEnd = transferViz.toVelocity || 0.01;
                const arcLength = transferViz.arcLength || 0;
                const progress = this.calculateVelocityIntegratedProgress(v0, vEnd, elapsed, visualTripTime, arcLength);
                
                // Check if transfer has completed: both visual progress and actual arrival time
                const hasArrived = currentTime >= arrivalTime;
                const isComplete = progress >= 1.0 || hasArrived;
                
                // Remove visualization when transfer completes
                if (isComplete) {
                    // Collect dot position BEFORE hiding (for arrival event)
                    // Emit arrival event before removing
                    this.emitArrivalEvent(transferViz);
                    
                    // Hide dot after collecting position
                    if (transferViz.dot) {
                        if (this.isMultiDot(transferViz.dot)) {
                            transferViz.dot.forEach(d => d.visible = false);
                        } else {
                            transferViz.dot.visible = false;
                        }
                    }
                    
                    this.removeTransfer(transferId);
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
     * Emit arrival event when a transfer completes
     * @param {Object} viz - Transfer or batch visualization object
     */
    emitArrivalEvent(viz) {
        if (!this.onTransferArrival) {
            return;
        }
        
        const toZoneId = viz.toZoneId;
        const resourceType = viz.resourceType || 'probe';
        
        // Collect dot positions and masses at destination
        const arrivals = [];
        
        // Calculate velocity direction at destination (tangent to transfer orbit)
        // This is used to give arriving particles forward momentum
        const velocityDir = this.calculateArrivalVelocityDirection(viz);
        
        if (viz.dot) {
            if (this.isMultiDot(viz.dot)) {
                // Mass stream: collect mass and position for each dot
                for (const d of viz.dot) {
                    const massKg = d.userData.massKg || 0;
                    const destPos = this.calculatePositionOnTrajectory(viz, 1.0); // At destination
                    arrivals.push({
                        position: destPos,
                        massKg: massKg,
                        velocityDir: velocityDir
                    });
                }
            } else {
                // Single dot with mass
                const massKg = viz.dot.userData?.massKg || 0;
                let destPos;
                if (viz.dot.visible && viz.dot.position) {
                    destPos = viz.dot.position.clone();
                } else {
                    destPos = this.calculatePositionOnTrajectory(viz, 1.0);
                }
                arrivals.push({
                    position: destPos,
                    massKg: massKg,
                    velocityDir: velocityDir
                });
            }
        }
        
        // If no arrivals collected, calculate destination position
        if (arrivals.length === 0) {
            const destPos = this.calculatePositionOnTrajectory(viz, 1.0);
            arrivals.push({
                position: destPos,
                massKg: 0,
                velocityDir: velocityDir
            });
        }
        
        // Emit the callback with full arrival information
        this.onTransferArrival({
            zoneId: toZoneId,
            resourceType: resourceType,
            arrivals: arrivals,
            dotCount: arrivals.length
        });
    }
    
    /**
     * Emit arrival events for specific dots that have just completed their journey
     * Used for staggered multi-dot batches where dots arrive at different times
     * @param {Object} batchViz - The batch visualization object
     * @param {Array<THREE.Mesh>} arrivedDots - Array of dots that just arrived
     */
    emitDotArrivals(batchViz, arrivedDots) {
        if (!this.onTransferArrival || arrivedDots.length === 0) {
            return;
        }
        
        const toZoneId = batchViz.toZoneId;
        const resourceType = batchViz.resourceType || 'metal';
        
        // Calculate velocity direction at destination
        const velocityDir = this.calculateArrivalVelocityDirection(batchViz);
        
        // Collect arrivals for just the specified dots
        const arrivals = [];
        for (const dot of arrivedDots) {
            const massKg = dot.userData.massKg || 0;
            const destPos = this.calculatePositionOnTrajectory(batchViz, 1.0); // At destination
            arrivals.push({
                position: destPos,
                massKg: massKg,
                velocityDir: velocityDir
            });
        }
        
        // Emit the callback
        this.onTransferArrival({
            zoneId: toZoneId,
            resourceType: resourceType,
            arrivals: arrivals,
            dotCount: arrivals.length
        });
    }
    
    /**
     * Calculate the velocity direction at arrival (tangent to transfer orbit)
     * This represents the forward momentum of the cargo arriving at destination
     * @param {Object} viz - Transfer visualization object
     * @returns {THREE.Vector3} Normalized velocity direction vector
     */
    calculateArrivalVelocityDirection(viz) {
        // Calculate positions at 99% and 100% progress to get tangent direction
        const pos99 = this.calculatePositionOnEllipse(
            viz.params,
            viz.fromAngle,
            viz.toAngle,
            viz.transferAngle,
            viz.fromAU,
            viz.toAU,
            0.99,
            viz.fromZoneId,
            viz.toZoneId
        );
        const pos100 = this.calculatePositionOnEllipse(
            viz.params,
            viz.fromAngle,
            viz.toAngle,
            viz.transferAngle,
            viz.fromAU,
            viz.toAU,
            1.0,
            viz.fromZoneId,
            viz.toZoneId
        );
        
        // Velocity direction is the difference, normalized
        const velocityDir = new THREE.Vector3().subVectors(pos100, pos99).normalize();
        return velocityDir;
    }
    
    /**
     * Remove transfer visualization
     */
    removeTransfer(transferId) {
        const transferViz = this.transfers.get(transferId);
        if (!transferViz) return;
        
        // Remove ellipse line trajectory
        if (transferViz.ellipse) {
            // Ensure it's removed from scene even if already removed
            if (transferViz.ellipse.parent) {
                transferViz.ellipse.parent.remove(transferViz.ellipse);
            }
            this.scene.remove(transferViz.ellipse);
            if (transferViz.ellipse.geometry) transferViz.ellipse.geometry.dispose();
            if (transferViz.ellipse.material) {
                if (Array.isArray(transferViz.ellipse.material)) {
                    transferViz.ellipse.material.forEach(mat => mat.dispose());
                } else {
                    transferViz.ellipse.material.dispose();
                }
            }
        }
        
        // Remove dot(s)
        if (transferViz.dot) {
            // Handle both single dot and array of dots (for backwards compatibility)
            if (this.isMultiDot(transferViz.dot)) {
                for (const d of transferViz.dot) {
                    if (d.parent) d.parent.remove(d);
                    this.scene.remove(d);
                    if (d.geometry) d.geometry.dispose();
                    if (d.material) d.material.dispose();
                }
            } else {
                if (transferViz.dot.parent) transferViz.dot.parent.remove(transferViz.dot);
                this.scene.remove(transferViz.dot);
                if (transferViz.dot.geometry) transferViz.dot.geometry.dispose();
                if (transferViz.dot.material) transferViz.dot.material.dispose();
            }
        }
        
        this.transfers.delete(transferId);
    }
    
    /**
     * Animate transfer dots smoothly between game state updates.
     * Called every frame (~60fps) for smooth motion.
     * @param {number} deltaTime - Time since last frame in seconds (real time)
     */
    animate(deltaTime) {
        if (this.isPaused || !deltaTime) return;
        
        // Calculate interpolated game time based on real elapsed time and game speed
        const realNow = performance.now() / 1000;
        const realDelta = Math.min(deltaTime, 0.1); // Cap at 100ms to prevent large jumps
        
        // Estimate current game time by interpolating from last known state
        // Game time advances by (real_delta * timeSpeed) days per second
        // But the update() function provides game time in days directly
        // So we interpolate: currentTime = lastGameTime + realDelta * timeSpeed / 86400
        // However, game time is typically in days, and timeSpeed is multiplier
        // The game runs timeSpeed * 86400 game-seconds per real-second
        // Which is timeSpeed days per real-day, or timeSpeed/86400 days per real-second
        // Actually the game engine uses days directly, so:
        // interpolatedTime = lastGameTime + (realDelta * timeSpeed * daysPerSecond)
        // Where daysPerSecond depends on the base tick rate
        
        // Simpler approach: just advance based on the last known velocity
        // Each transfer knows its position from last update, just lerp toward where it should be
        
        // For each transfer, calculate target position and smoothly interpolate
        this.animateTransfers(this.transfers, deltaTime);
        this.animateTransfers(this.continuousBatches, deltaTime);
    }
    
    /**
     * Animate a collection of transfers with smooth interpolation
     * @param {Map} transferMap - Map of transfers (either this.transfers or this.continuousBatches)
     * @param {number} deltaTime - Time since last frame in seconds
     */
    animateTransfers(transferMap, deltaTime) {
        for (const [id, viz] of transferMap.entries()) {
            if (!viz.dot) continue;
            // Note: viz.visible might not be set yet, so default to true if undefined
            if (viz.visible === false) continue;
            
            // Calculate how much game time has passed based on time speed
            // timeSpeed is game-days per second at 1x, so:
            // gameDelta = deltaTime * timeSpeed (in days)
            const gameDelta = deltaTime * this.timeSpeed;
            
            // Update the internal elapsed tracker
            if (viz.animElapsed === undefined) {
                viz.animElapsed = 0;
            }
            viz.animElapsed += gameDelta;
            
            // Cap animElapsed to not exceed the trip time
            const tripTime = viz.visualTransferTimeDays || (viz.arrivalTime - viz.departureTime);
            if (tripTime <= 0) continue;
            
            // Clamp elapsed time
            viz.animElapsed = Math.min(viz.animElapsed, tripTime);
            
            // Calculate velocities
            const v0 = viz.fromVelocity || 0.01;
            const vEnd = viz.toVelocity || 0.01;
            const arcLength = viz.arcLength || 0;
            
            // Calculate progress using velocity integration
            const progress = this.calculateVelocityIntegratedProgress(v0, vEnd, viz.animElapsed, tripTime, arcLength);
            
            // Update dot position(s)
            if (this.isMultiDot(viz.dot)) {
                // Mass stream: multiple dots with staggered launch times
                // Each dot has a launchOffset stored in userData (time offset in days)
                for (let i = 0; i < viz.dot.length; i++) {
                    const dot = viz.dot[i];
                    const launchOffset = dot.userData.launchOffset || 0;
                    
                    // Calculate effective elapsed time for this dot
                    // Each dot starts its journey at (departureTime + launchOffset)
                    const effectiveElapsed = viz.animElapsed - launchOffset;
                    
                    // Dot hasn't launched yet
                    if (effectiveElapsed < 0) {
                        dot.visible = false;
                        continue;
                    }
                    
                    // Calculate progress for this dot based on its effective elapsed time
                    const dotProgress = this.calculateVelocityIntegratedProgress(
                        v0, vEnd, effectiveElapsed, tripTime, arcLength
                    );
                    
                    if (dotProgress >= 0 && dotProgress <= 1) {
                        const position = this.calculatePositionOnTrajectory(viz, dotProgress);
                        dot.position.copy(position);
                        dot.visible = true;
                    } else {
                        dot.visible = false;
                    }
                }
            } else {
                if (progress >= 0 && progress <= 1) {
                    const position = this.calculatePositionOnTrajectory(viz, progress);
                    viz.dot.position.copy(position);
                    viz.dot.visible = true;
                }
            }
        }
    }
    
    /**
     * Sync animation state with game state (called from update())
     * Resets the animation elapsed time to match the authoritative game time
     * @param {Object} viz - Transfer visualization object
     * @param {number} gameElapsed - Elapsed time from game state (in game days)
     */
    syncAnimationState(viz, gameElapsed) {
        viz.animElapsed = gameElapsed;
        viz.visible = true;
    }
    
    // ========================================================================
    // LAMBERT TRAJECTORY VISUALIZATION (Backend-computed accurate trajectories)
    // ========================================================================
    
    /**
     * Store for Lambert-computed trajectories
     * Map of transferId -> {curve, line, points, metadata}
     */
    lambertTrajectories = new Map();
    
    /**
     * Create a visualization for a Lambert-computed trajectory
     * 
     * @param {string} transferId - Unique ID for this trajectory
     * @param {Array<Array<number>>} trajectoryPointsAU - Array of [x, y] positions in AU
     * @param {Object} options - Visualization options
     * @param {number} options.color - Line color (default: cyan)
     * @param {number} options.opacity - Line opacity (default: 0.8)
     * @param {boolean} options.dashed - Whether to use dashed line (default: false)
     * @param {boolean} options.isGravityAssist - Whether this is a gravity assist trajectory
     * @returns {THREE.Line} The created line object
     */
    createLambertTrajectory(transferId, trajectoryPointsAU, options = {}) {
        // Remove existing trajectory with same ID
        if (this.lambertTrajectories.has(transferId)) {
            this.removeLambertTrajectory(transferId);
        }
        
        const color = options.color || 0x00ffff;
        const opacity = options.opacity || 0.8;
        const dashed = options.dashed || false;
        const isGravityAssist = options.isGravityAssist || false;
        
        // Convert AU coordinates to visual coordinates
        const visualPoints = this.convertAUPointsToVisual(trajectoryPointsAU);
        
        if (visualPoints.length < 2) {
            console.warn('Not enough points for trajectory:', transferId);
            return null;
        }
        
        // Create a smooth curve through the points
        const curve = new THREE.CatmullRomCurve3(visualPoints, false, 'catmullrom', 0.5);
        
        // Generate points along the curve for the line geometry
        const curvePoints = curve.getPoints(100);
        const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
        
        // Create material
        let material;
        if (dashed) {
            material = new THREE.LineDashedMaterial({
                color: color,
                opacity: opacity,
                transparent: true,
                dashSize: 3,
                gapSize: 1,
                linewidth: 2
            });
        } else {
            material = new THREE.LineBasicMaterial({
                color: color,
                opacity: opacity,
                transparent: true,
                linewidth: 2
            });
        }
        
        const line = new THREE.Line(geometry, material);
        
        // For dashed lines, compute line distances
        if (dashed) {
            line.computeLineDistances();
        }
        
        // Add to scene
        this.scene.add(line);
        
        // Store metadata
        this.lambertTrajectories.set(transferId, {
            line: line,
            curve: curve,
            pointsAU: trajectoryPointsAU,
            visualPoints: visualPoints,
            isGravityAssist: isGravityAssist,
            options: options
        });
        
        return line;
    }
    
    /**
     * Convert AU coordinates to visual coordinates using the solar system's scaling
     * 
     * @param {Array<Array<number>>} pointsAU - Array of [x, y] positions in AU
     * @returns {Array<THREE.Vector3>} Array of visual positions
     */
    convertAUPointsToVisual(pointsAU) {
        const visualPoints = [];
        
        for (const [x, y] of pointsAU) {
            // Calculate radial distance in AU
            const r_au = Math.sqrt(x * x + y * y);
            const theta = Math.atan2(y, x);
            
            // Convert radial distance to visual units using the solar system's scaling
            let visualR;
            if (this.solarSystem && this.solarSystem.scaleAUToVisual) {
                visualR = this.solarSystem.scaleAUToVisual(r_au);
            } else {
                // Fallback: simple linear scaling
                visualR = r_au * 80;
            }
            
            // Convert back to Cartesian (note: Three.js uses Y as up, so we use X-Z plane)
            const visualX = visualR * Math.cos(theta);
            const visualZ = visualR * Math.sin(theta);
            
            visualPoints.push(new THREE.Vector3(visualX, 0, visualZ));
        }
        
        return visualPoints;
    }
    
    /**
     * Remove a Lambert trajectory visualization
     * 
     * @param {string} transferId - ID of the trajectory to remove
     */
    removeLambertTrajectory(transferId) {
        const traj = this.lambertTrajectories.get(transferId);
        if (!traj) return;
        
        if (traj.line) {
            this.scene.remove(traj.line);
            if (traj.line.geometry) traj.line.geometry.dispose();
            if (traj.line.material) traj.line.material.dispose();
        }
        
        this.lambertTrajectories.delete(transferId);
    }
    
    /**
     * Fetch and create a Lambert trajectory from the backend
     * 
     * @param {string} fromZone - Departure zone ID
     * @param {string} toZone - Arrival zone ID
     * @param {number} gameTimeDays - Current game time in days
     * @param {Object} options - Visualization options (color, opacity, etc.)
     * @returns {Promise<Object>} The trajectory data and visualization
     */
    async fetchAndCreateLambertTrajectory(fromZone, toZone, gameTimeDays = 0, options = {}) {
        try {
            // Call the backend API
            const response = await api.computeTrajectory(fromZone, toZone, gameTimeDays, 50);
            
            if (!response.success || !response.trajectory) {
                console.error('Failed to compute trajectory:', response.error);
                return null;
            }
            
            const trajectory = response.trajectory;
            const transferId = `lambert_${fromZone}_${toZone}_${Date.now()}`;
            
            // Create the visualization
            const line = this.createLambertTrajectory(
                transferId,
                trajectory.trajectory_points_au,
                options
            );
            
            return {
                transferId: transferId,
                line: line,
                trajectory: trajectory
            };
            
        } catch (error) {
            console.error('Error fetching Lambert trajectory:', error);
            return null;
        }
    }
    
    /**
     * Fetch and create a gravity assist trajectory from the backend
     * 
     * @param {string} fromZone - Departure zone ID
     * @param {string} toZone - Final destination zone ID
     * @param {string} viaZone - Flyby zone ID
     * @param {number} gameTimeDays - Current game time in days
     * @param {Object} options - Visualization options
     * @returns {Promise<Object>} The trajectory data and visualization
     */
    async fetchAndCreateGravityAssistTrajectory(fromZone, toZone, viaZone, gameTimeDays = 0, options = {}) {
        try {
            // Call the backend API
            const response = await api.computeGravityAssistTrajectory(
                fromZone, toZone, viaZone, gameTimeDays, 60
            );
            
            if (!response.success || !response.trajectory) {
                console.error('Failed to compute gravity assist trajectory:', response.error);
                return null;
            }
            
            const trajectory = response.trajectory;
            const transferId = `lambert_ga_${fromZone}_${viaZone}_${toZone}_${Date.now()}`;
            
            // Create the visualization with gravity assist styling
            const defaultOptions = {
                color: 0xff8800, // Orange for gravity assists
                opacity: 0.9,
                dashed: false,
                isGravityAssist: true,
                ...options
            };
            
            const line = this.createLambertTrajectory(
                transferId,
                trajectory.trajectory_points_au,
                defaultOptions
            );
            
            // Add a marker at the flyby point
            if (trajectory.leg1 && trajectory.leg1.arrival_position_au) {
                this.addFlybyMarker(transferId, trajectory.leg1.arrival_position_au, viaZone);
            }
            
            return {
                transferId: transferId,
                line: line,
                trajectory: trajectory
            };
            
        } catch (error) {
            console.error('Error fetching gravity assist trajectory:', error);
            return null;
        }
    }
    
    /**
     * Add a marker at a flyby point
     * 
     * @param {string} transferId - Parent trajectory ID
     * @param {Array<number>} positionAU - [x, y] position in AU
     * @param {string} bodyName - Name of the flyby body
     */
    addFlybyMarker(transferId, positionAU, bodyName) {
        const [x, y] = positionAU;
        const r_au = Math.sqrt(x * x + y * y);
        const theta = Math.atan2(y, x);
        
        let visualR;
        if (this.solarSystem && this.solarSystem.scaleAUToVisual) {
            visualR = this.solarSystem.scaleAUToVisual(r_au);
        } else {
            visualR = r_au * 80;
        }
        
        const visualX = visualR * Math.cos(theta);
        const visualZ = visualR * Math.sin(theta);
        
        // Create a small ring to mark the flyby
        const geometry = new THREE.RingGeometry(0.3, 0.5, 16);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        const marker = new THREE.Mesh(geometry, material);
        marker.position.set(visualX, 0.1, visualZ);
        marker.rotation.x = -Math.PI / 2;
        
        this.scene.add(marker);
        
        // Store the marker with the trajectory
        const traj = this.lambertTrajectories.get(transferId);
        if (traj) {
            traj.flybyMarker = marker;
        }
    }
    
    /**
     * Clear all Lambert trajectories
     */
    clearAllLambertTrajectories() {
        for (const transferId of this.lambertTrajectories.keys()) {
            this.removeLambertTrajectory(transferId);
        }
        this.lambertTrajectories.clear();
    }
    
    /**
     * Toggle visibility of Lambert trajectories
     * 
     * @param {boolean} visible - Whether trajectories should be visible
     */
    toggleLambertTrajectories(visible) {
        for (const [transferId, traj] of this.lambertTrajectories.entries()) {
            if (traj.line) {
                traj.line.visible = visible;
            }
            if (traj.flybyMarker) {
                traj.flybyMarker.visible = visible;
            }
        }
    }
    
    // ========================================================================
    // END LAMBERT TRAJECTORY VISUALIZATION
    // ========================================================================
    
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
        
        // Clean up Lambert trajectories
        this.clearAllLambertTrajectories();
        
        this.continuousTransferLastCreation.clear();
        this.ellipseCache.clear();
    }
    
    /**
     * Toggle visibility of all transfer trajectory lines
     * @param {boolean} visible - Whether lines should be visible
     */
    toggleTransferLines(visible) {
        // Save visibility state so new transfers respect it
        this.linesVisible = visible;
        
        // Toggle one-time transfer ellipse lines
        for (const [transferId, transferViz] of this.transfers.entries()) {
            if (transferViz.ellipse) {
                transferViz.ellipse.visible = visible;
            }
        }
        
        // Toggle continuous transfer ellipse lines
        for (const [batchId, batchViz] of this.continuousBatches.entries()) {
            if (batchViz.ellipse) {
                batchViz.ellipse.visible = visible;
            }
        }
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TransferVisualization;
}

