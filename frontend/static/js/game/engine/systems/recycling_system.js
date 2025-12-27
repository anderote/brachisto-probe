/**
 * Recycling System
 * 
 * Probe recycling of slag into metal
 * 75% efficiency: 1 kg slag → 0.75 kg metal + 0.25 kg slag
 * 
 * Probe self-recycling (recycle_probes allocation)
 * Probes dismantle themselves at base rate of 5 kg/day per probe
 * Output: metal and slag according to salvage efficiency
 */

class RecyclingSystem {
    constructor(compositeSkillsCalculator) {
        this.compositeSkillsCalculator = compositeSkillsCalculator;
        
        // Probe mass constant
        this.PROBE_MASS = 100; // kg per probe
    }
    
    /**
     * Process probe recycling for all zones
     * @param {Object} state - Game state
     * @param {number} deltaTime - Time delta in days
     * @param {Object} skills - Current skills
     * @returns {Object} Updated state
     */
    processRecycling(state, deltaTime, skills) {
        const newState = JSON.parse(JSON.stringify(state));  // Deep clone
        
        const zones = newState.zones || {};
        const probesByZone = newState.probes_by_zone || {};
        const probeAllocationsByZone = newState.probe_allocations_by_zone || {};
        
        for (const zoneId in zones) {
            const zone = zones[zoneId];
            const zoneProbes = probesByZone[zoneId] || {};
            const totalProbes = Object.values(zoneProbes).reduce((sum, count) => sum + (count || 0), 0);
            
            if (totalProbes === 0) continue;
            
            const allocations = probeAllocationsByZone[zoneId] || {};
            const recycleAllocation = allocations.recycle || 0;
            
            if (recycleAllocation === 0) continue;
            
            // Calculate recycling rate
            const recyclingProbes = totalProbes * recycleAllocation;
            const recycleSpeed = this.compositeSkillsCalculator.calculateProbeRecycleSpeed(skills);
            const totalRecycleRate = recycleSpeed * recyclingProbes;
            
            // Get available slag from zone's slag_mass
            const slagAvailable = zone.slag_mass || 0;
            const slagRecycled = Math.min(
                totalRecycleRate * deltaTime,
                slagAvailable
            );
            
            if (slagRecycled <= 0) continue;
            
            // Calculate salvage efficiency (metal recovery fraction)
            const salvageEfficiency = this.compositeSkillsCalculator.calculateSalvageEfficiency(skills);
            
            // Convert slag to metal (efficiency determines metal recovery)
            const metalProduced = slagRecycled * salvageEfficiency;
            const slagRemaining = slagRecycled - metalProduced;
            
            // Update zone: reduce slag_mass, add remaining slag back
            zone.slag_mass = Math.max(0, slagAvailable - slagRecycled + slagRemaining);
            
            // Add metal to zone's stored_metal (zone-based metal system)
            zone.stored_metal = (zone.stored_metal || 0) + metalProduced;
        }
        
        newState.zones = zones;
        return newState;
    }
    
    /**
     * Process probe self-recycling for all zones
     * Probes allocated to recycle_probes dismantle probes in their zone
     * Base rate: 5 kg/day per probe assigned to self-recycling
     * Output: metal and slag based on salvage efficiency
     * 
     * Mass limit behavior:
     * - If slider is at X%, recycle until probes are no more than (100-X)% of zone mass
     * - At 100%, recycle all probes (target 0% probe mass)
     * - At 0%, don't recycle any probes
     * 
     * @param {Object} state - Game state
     * @param {number} deltaTime - Time delta in days
     * @param {Object} skills - Current skills
     * @returns {Object} Updated state
     */
    processProbeRecycling(state, deltaTime, skills) {
        const newState = JSON.parse(JSON.stringify(state));  // Deep clone
        
        const zones = newState.zones || {};
        const probesByZone = newState.probes_by_zone || {};
        const probeAllocationsByZone = newState.probe_allocations_by_zone || {};
        const zoneMassLimits = newState.zone_mass_limits || {};
        
        for (const zoneId in probesByZone) {
            const zoneProbes = probesByZone[zoneId] || {};
            const probeCount = zoneProbes['probe'] || 0;
            
            if (probeCount <= 0) continue;
            
            const allocations = probeAllocationsByZone[zoneId] || {};
            const recycleProbesAllocation = allocations.recycle_probes || 0;
            
            if (recycleProbesAllocation <= 0) continue;
            
            // Check mass limit for probe recycling
            // recycle_probes limit: recycle until probes are <= (1 - limit) % of zone mass
            const recycleProbesLimit = zoneMassLimits[zoneId]?.recycle_probes || 0;
            let massThrottle = 1.0;
            
            if (recycleProbesLimit > 0) {
                // Ensure zone exists for mass calculation
                const zone = zones[zoneId] || {};
                const massRemaining = zone.mass_remaining || 0;
                const storedMetal = zone.stored_metal || 0;
                const probeMass = zone.probe_mass || (probeCount * this.PROBE_MASS);
                const structureMass = zone.structure_mass || 0;
                const slagMass = zone.slag_mass || 0;
                const totalZoneMass = massRemaining + storedMetal + probeMass + structureMass + slagMass;
                
                if (totalZoneMass > 0) {
                    const currentProbeRatio = probeMass / totalZoneMass;
                    // Target probe ratio = 1 - recycle_probes_limit
                    // e.g., if limit=0.2 (20%), target is 0.8 (80% probes)
                    // If limit=1.0 (100%), target is 0 (0% probes - recycle all)
                    const targetProbeRatio = 1 - recycleProbesLimit;
                    
                    if (currentProbeRatio <= targetProbeRatio) {
                        // Already at or below target - stop recycling
                        massThrottle = 0;
                    } else {
                        // Above target - recycle to get to target
                        // Throttle as we approach the target
                        const excess = currentProbeRatio - targetProbeRatio;
                        // If within 10% of the gap, start throttling smoothly
                        const throttleThreshold = recycleProbesLimit * 0.1;
                        if (excess < throttleThreshold && throttleThreshold > 0) {
                            massThrottle = excess / throttleThreshold;
                        }
                    }
                }
            }
            
            if (massThrottle === 0) continue;
            
            // Number of probes assigned to self-recycling
            const recyclingProbes = probeCount * recycleProbesAllocation;
            
            // Calculate self-recycling rate (kg/day)
            // Base rate is 5 kg/day per probe, scaled by skills
            const selfRecycleSpeed = this.compositeSkillsCalculator.calculateProbeSelfRecycleSpeed(skills);
            const totalRecycleRate = selfRecycleSpeed * recyclingProbes * massThrottle;
            
            // Calculate mass to recycle this tick
            const currentProbeMass = probeCount * this.PROBE_MASS;
            const massToRecycle = Math.min(
                totalRecycleRate * deltaTime,
                currentProbeMass  // Can't recycle more than available probe mass
            );
            
            if (massToRecycle <= 0) continue;
            
            // Calculate salvage efficiency (metal recovery fraction)
            const salvageEfficiency = this.compositeSkillsCalculator.calculateSalvageEfficiency(skills);
            
            // Convert probe mass to metal and slag
            const metalProduced = massToRecycle * salvageEfficiency;
            const slagProduced = massToRecycle * (1 - salvageEfficiency);
            
            // Calculate new probe count (reduce by mass recycled)
            // Probes are fractional - allow partial probes
            const massRemaining = currentProbeMass - massToRecycle;
            const newProbeCount = massRemaining / this.PROBE_MASS;
            
            // Update probes in zone
            probesByZone[zoneId]['probe'] = Math.max(0, newProbeCount);
            
            // Ensure zone exists
            if (!zones[zoneId]) {
                zones[zoneId] = {
                    mass_remaining: 0,
                    stored_metal: 0,
                    probe_mass: 0,
                    structure_mass: 0,
                    slag_mass: 0,
                    methalox: 0,
                    depleted: false
                };
            }
            
            // Update zone: add metal and slag, reduce probe_mass
            zones[zoneId].stored_metal = (zones[zoneId].stored_metal || 0) + metalProduced;
            zones[zoneId].slag_mass = (zones[zoneId].slag_mass || 0) + slagProduced;
            zones[zoneId].probe_mass = Math.max(0, massRemaining);
        }
        
        newState.zones = zones;
        newState.probes_by_zone = probesByZone;
        return newState;
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RecyclingSystem;
}

