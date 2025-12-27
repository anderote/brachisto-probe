/**
 * Probe System
 * 
 * Probe operations: mining, building, replication
 * All rates in kg/day
 */

class ProbeSystem {
    constructor(productionCalculator) {
        this.productionCalculator = productionCalculator;
        
        // Probe mass (kg)
        this.PROBE_MASS = 100;  // kg per probe
    }
    
    /**
     * Process probe operations for a zone
     * @param {Object} state - Game state
     * @param {string} zoneId - Zone identifier
     * @param {number} deltaTime - Time delta in days
     * @param {Object} skills - Current skills
     * @param {Object} buildings - Building definitions
     * @param {number} energyThrottle - Energy throttle factor (0-1)
     * @returns {Object} Updated state
     */
    processProbeOperations(state, zoneId, deltaTime, skills, buildings, energyThrottle = 1.0) {
        const profiler = typeof self !== 'undefined' && self.performanceProfiler 
            ? self.performanceProfiler 
            : (typeof window !== 'undefined' && window.performanceProfiler ? window.performanceProfiler : null);
        const cloneStart = profiler ? performance.now() : null;
        const newState = JSON.parse(JSON.stringify(state));  // Deep clone
        if (profiler && cloneStart !== null) {
            profiler.recordStateCloneTime(performance.now() - cloneStart);
        }
        
        const probesByZone = newState.probes_by_zone || {};
        const probeAllocationsByZone = newState.probe_allocations_by_zone || {};
        const constructionProgress = newState.construction_progress || {};
        
        const zoneProbes = probesByZone[zoneId] || {};
        const probeCountStart = profiler ? performance.now() : null;
        const totalProbes = Object.values(zoneProbes).reduce((sum, count) => sum + (count || 0), 0);
        if (profiler && probeCountStart !== null) {
            const probeCountTime = performance.now() - probeCountStart;
            if (probeCountTime > 0.1) {
                profiler.recordProbeIterationTime(probeCountTime);
            }
        }
        
        if (totalProbes === 0) return newState;
        
        const allocations = probeAllocationsByZone[zoneId] || {};
        const replicateAllocation = allocations.replicate || 0;
        
        // Get mass limits for this zone
        const zoneMassLimits = newState.zone_mass_limits?.[zoneId] || {};
        const replicateLimit = zoneMassLimits.replicate || 0;
        
        // Process replication
        // Replicating probes = total probes * replication allocation
        if (replicateAllocation > 0) {
            // Check mass limit: if probe_mass >= replicateLimit % of total zone mass, skip replication
            let massThrottle = 1.0;
            if (replicateLimit > 0) {
                const zone = newState.zones?.[zoneId];
                if (zone) {
                    // Calculate total zone mass
                    const massRemaining = zone.mass_remaining || 0;
                    const storedMetal = zone.stored_metal || 0;
                    const probeMass = zone.probe_mass || 0;
                    const structureMass = zone.structure_mass || 0;
                    const slagMass = zone.slag_mass || 0;
                    const totalZoneMass = massRemaining + storedMetal + probeMass + structureMass + slagMass;
                    
                    if (totalZoneMass > 0) {
                        const currentProbeRatio = probeMass / totalZoneMass;
                        if (currentProbeRatio >= replicateLimit) {
                            // At or above limit - stop replication
                            massThrottle = 0;
                        } else {
                            // Approaching limit - calculate how much room we have
                            // Smoothly reduce rate as we approach the limit
                            const headroom = replicateLimit - currentProbeRatio;
                            // If within 10% of limit, start throttling
                            const throttleThreshold = replicateLimit * 0.1;
                            if (headroom < throttleThreshold && throttleThreshold > 0) {
                                massThrottle = headroom / throttleThreshold;
                            }
                        }
                    }
                }
            }
            
            if (massThrottle > 0) {
                const replicatingProbes = totalProbes * replicateAllocation;
                // Calculate building rate from probes allocated to replication
                // Uses pre-calculated upgrade factors from state
                // Applies zone crowding penalty and probe count scaling penalty
                const replicationRate = this.productionCalculator.calculateBuildingRate(replicatingProbes, newState, zoneId, totalProbes);
                // Apply energy throttle and mass throttle to replication rate
                const throttledReplicationRate = replicationRate * energyThrottle * massThrottle;
                this.processReplication(newState, zoneId, throttledReplicationRate, deltaTime);
            }
        }
        
        return newState;
    }
    
    /**
     * Process probe replication
     * Uses zone's stored_metal for construction - if no stored_metal, replication halts
     * @param {Object} state - Game state (mutated)
     * @param {string} zoneId - Zone identifier
     * @param {number} replicationRate - Replication rate in kg/day
     * @param {number} deltaTime - Time delta in days
     */
    processReplication(state, zoneId, replicationRate, deltaTime) {
        // Ensure state objects exist
        if (!state.construction_progress) {
            state.construction_progress = {};
        }
        if (!state.probes_by_zone) {
            state.probes_by_zone = {};
        }
        if (!state.zones) {
            state.zones = {};
        }
        
        const constructionProgress = state.construction_progress;
        const probesByZone = state.probes_by_zone;
        const zones = state.zones;
        
        // Ensure zone exists
        if (!zones[zoneId]) {
            zones[zoneId] = {
                mass_remaining: 0,
                stored_metal: 0,
                probe_mass: 0,
                structure_mass: 0,
                slag_mass: 0,
                depleted: false
            };
        }
        
        const zone = zones[zoneId];
        const storedMetal = zone.stored_metal || 0;
        
        // Initialize probe construction progress if needed
        if (!constructionProgress.probes) {
            constructionProgress.probes = {};
        }
        
        // Initialize zone-specific construction progress
        if (!constructionProgress.probes_by_zone) {
            constructionProgress.probes_by_zone = {};
        }
        if (!constructionProgress.probes_by_zone[zoneId]) {
            constructionProgress.probes_by_zone[zoneId] = {};
        }
        
        // For now, assume single probe type 'probe'
        const probeType = 'probe';
        const currentProgress = constructionProgress.probes_by_zone[zoneId][probeType] || 0;
        
        // Calculate how much metal we need for the work being done
        const progressAdded = replicationRate * deltaTime;
        
        // Check if we have enough stored metal for this progress
        // Metal is consumed as progress is made (proportionally)
        const metalNeeded = progressAdded;
        const metalAvailable = storedMetal;
        
        // Throttle progress based on available metal
        const metalThrottle = metalAvailable > 0 ? Math.min(1.0, metalAvailable / metalNeeded) : 0;
        const actualProgress = progressAdded * metalThrottle;
        const metalConsumed = actualProgress; // 1:1 ratio - 1 kg metal = 1 kg progress
        
        // Consume metal as progress is made
        zone.stored_metal = Math.max(0, storedMetal - metalConsumed);
        
        const newProgress = currentProgress + actualProgress;
        
        // Check if probe completed
        if (newProgress >= this.PROBE_MASS) {
            // Complete probe(s)
            const probesToAdd = Math.floor(newProgress / this.PROBE_MASS);
            const remainingProgress = newProgress % this.PROBE_MASS;
            
            // Add probes to zone
            if (!probesByZone[zoneId]) {
                probesByZone[zoneId] = {};
            }
            if (!probesByZone[zoneId][probeType]) {
                probesByZone[zoneId][probeType] = 0;
            }
            probesByZone[zoneId][probeType] += probesToAdd;
            
            // Update zone probe_mass
            zone.probe_mass = (zone.probe_mass || 0) + (probesToAdd * this.PROBE_MASS);
            
            constructionProgress.probes_by_zone[zoneId][probeType] = remainingProgress;
        } else {
            constructionProgress.probes_by_zone[zoneId][probeType] = newProgress;
        }
        
        state.zones = zones;
        state.construction_progress = constructionProgress;
        state.probes_by_zone = probesByZone;
    }
    
    /**
     * Calculate total dexterity across all zones
     * @param {Object} state - Game state
     * @param {Object} skills - Current skills
     * @returns {number} Total dexterity
     */
    calculateTotalDexterity(state, skills) {
        return this.productionCalculator.calculateTotalDexterity(state.probes_by_zone || {}, skills);
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProbeSystem;
}

