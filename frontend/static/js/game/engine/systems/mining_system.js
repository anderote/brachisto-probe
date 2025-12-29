/**
 * Mining System
 * 
 * Zone mining and depletion
 * All rates in kg/day
 */

class MiningSystem {
    constructor(productionCalculator, orbitalMechanics) {
        this.productionCalculator = productionCalculator;
        this.orbitalMechanics = orbitalMechanics;
    }
    
    /**
     * Process mining for all zones
     * @param {Object} state - Game state
     * @param {number} deltaTime - Time delta in days
     * @param {Object} skills - Current skills
     * @param {Object} buildings - Building definitions
     * @param {number} energyThrottle - Energy throttle factor (0-1)
     * @returns {Object} Updated state
     */
    processMining(state, deltaTime, skills, buildings, energyThrottle = 1.0) {
        const profiler = typeof self !== 'undefined' && self.performanceProfiler 
            ? self.performanceProfiler 
            : (typeof window !== 'undefined' && window.performanceProfiler ? window.performanceProfiler : null);
        const cloneStart = profiler ? performance.now() : null;
        const newState = JSON.parse(JSON.stringify(state));  // Deep clone
        if (profiler && cloneStart !== null) {
            profiler.recordStateCloneTime(performance.now() - cloneStart);
        }
        
        const zones = newState.zones || {};
        const probesByZone = newState.probes_by_zone || {};
        const probeAllocationsByZone = newState.probe_allocations_by_zone || {};
        const structuresByZone = newState.structures_by_zone || {};
        
        
        // Iterate over all zones that have probes OR are in zones list
        // Ensure zones with probes are processed even if not in zones list
        const zonesToProcess = new Set(Object.keys(zones));
        for (const zoneId in probesByZone) {
            zonesToProcess.add(zoneId);
        }
        
        for (const zoneId of zonesToProcess) {
            // Ensure zone exists in zones object
            if (!zones[zoneId]) {
                // Get zone data from orbital mechanics
                const zoneData = this.orbitalMechanics.getZone(zoneId);
                
                if (!zoneData) {
                    // Zone not found in orbital mechanics data - skip
                    continue;
                }
                
                // New zone structure: track mass, not metal directly
                zones[zoneId] = {
                    mass_remaining: zoneData.total_mass_kg || 0,  // Un-mined mass
                    stored_metal: 0,                               // Metal stored locally (for construction)
                    probe_mass: 0,                                 // Mass of all probes in zone
                    structure_mass: 0,                             // Mass of all structures in zone
                    slag_mass: 0,                                  // Mass of slag in zone
                    depleted: false                                // True when mass_remaining <= 0
                };
            }
            
            const zone = zones[zoneId];
            
            // Skip Dyson zone (no mining)
            if (this.orbitalMechanics.isDysonZone(zoneId)) {
                continue;
            }
            
            // Skip if depleted
            if (zone.depleted) {
                continue;
            }
            
            // Skip if no remaining mass (early exit for efficiency)
            const massRemaining = zone.mass_remaining || 0;
            if (massRemaining <= 0) {
                zone.depleted = true;
                continue;
            }
            
            // Calculate mining rate
            const zoneProbes = probesByZone[zoneId] || {};
            // Direct access to probe count (single probe type 'probe')
            const totalProbes = zoneProbes['probe'] || 0;
            const allocations = probeAllocationsByZone[zoneId] || {};
            const harvestAllocation = allocations.harvest || 0;
            
            // Probe mining - use fractional probe count
            const miningProbes = totalProbes * harvestAllocation;
            // Mining rate is MASS extraction rate (kg/day), not metal
            // Uses pre-calculated upgrade factors from state
            // Pass totalProbes for probe count scaling penalty
            const probeMassMiningRate = this.productionCalculator.calculateMiningRate(miningProbes, zoneId, newState, totalProbes);
            
            // Structure mining (also returns mass rate)
            // Uses pre-calculated upgrade factors from state
            const structureMassMiningRate = this.productionCalculator.calculateStructureMiningRate(
                structuresByZone, zoneId, buildings, newState
            );
            
            const totalMassMiningRate = probeMassMiningRate + structureMassMiningRate;
            
            // Apply energy throttle
            const effectiveMassMiningRate = totalMassMiningRate * energyThrottle;
            
            // Extract MASS (not metal directly)
            const massExtracted = effectiveMassMiningRate * deltaTime;
            const actualMassExtracted = Math.min(massExtracted, massRemaining);
            
            // Skip if no actual extraction possible (e.g., no mining rate)
            if (actualMassExtracted <= 0) {
                continue;
            }
            
            // Calculate metal extraction efficiency (based on research and refineries)
            const extractionEfficiency = this.productionCalculator.calculateMetalExtractionEfficiency(
                zoneId, skills, structuresByZone, buildings
            );
            
            // Extract metal from mined mass
            const metalExtracted = actualMassExtracted * extractionEfficiency;
            
            // Slag is the non-metal portion of extracted mass
            const slagProduced = actualMassExtracted - metalExtracted;
            
            // Update zone state
            zone.mass_remaining = Math.max(0, massRemaining - actualMassExtracted);
            zone.slag_mass = (zone.slag_mass || 0) + slagProduced;
            
            // Add metal to zone's local storage (not global pool)
            zone.stored_metal = (zone.stored_metal || 0) + metalExtracted;
            
            // Check if depleted
            if (zone.mass_remaining <= 0) {
                zone.depleted = true;
            }
            
            // Add slag to global pool (for global tracking, but also stored per-zone)
            newState.slag = (newState.slag || 0) + slagProduced;
        }
        
        newState.zones = zones;
        return newState;
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MiningSystem;
}

