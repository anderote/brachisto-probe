/**
 * Dyson System
 * 
 * Dyson sphere construction
 * All rates in kg/day
 */

class DysonSystem {
    constructor(productionCalculator, orbitalMechanics) {
        this.productionCalculator = productionCalculator;
        this.orbitalMechanics = orbitalMechanics;
        
        // Dyson construction constants
        this.DYSON_POWER_PER_KG = 5000;  // watts per kg
        this.METAL_TO_DYSON_RATIO = 2.0;  // 2 kg metal → 1 kg Dyson mass
    }
    
    /**
     * Process Dyson sphere construction
     * @param {Object} state - Game state
     * @param {number} deltaTime - Time delta in days
     * @param {Object} skills - Current skills
     * @param {number} energyThrottle - Energy throttle factor (0-1)
     * @returns {Object} Updated state
     */
    processDysonConstruction(state, deltaTime, skills, energyThrottle = 1.0) {
        const newState = JSON.parse(JSON.stringify(state));  // Deep clone
        
        const dysonZoneId = 'dyson_sphere';  // Dyson zone ID
        const probesByZone = newState.probes_by_zone || {};
        const probeAllocationsByZone = newState.probe_allocations_by_zone || {};
        const dysonSphere = newState.dyson_sphere || {};
        
        // Get probes in Dyson zone
        const zoneProbes = probesByZone[dysonZoneId] || {};
        const totalProbes = Object.values(zoneProbes).reduce((sum, count) => sum + (count || 0), 0);
        
        if (totalProbes === 0) {
            // Update rates to 0
            if (!newState.rates) {
                newState.rates = {};
            }
            newState.rates.dyson_construction = 0;
            return newState;
        }
        
        const allocations = probeAllocationsByZone[dysonZoneId] || {};
        const dysonAllocation = allocations.dyson || 0;
        
        // Calculate building rate
        // Uses pre-calculated upgrade factors from state
        const dysonProbes = totalProbes * dysonAllocation;
        const buildingRate = this.productionCalculator.calculateBuildingRate(dysonProbes, newState);
        
        // Apply Dyson construction upgrade factor (uses ALPHA_DYSON_FACTOR)
        const dysonUpgradeFactor = newState.upgrade_factors?.dyson?.construction?.performance || 1.0;
        const effectiveBuildingRate = buildingRate * dysonUpgradeFactor;
        
        // Apply energy throttle
        const throttledRate = effectiveBuildingRate * energyThrottle;
        
        // Get metal from Dyson zone's stored_metal (must be transferred there via mass drivers)
        const zones = newState.zones || {};
        if (!zones[dysonZoneId]) {
            zones[dysonZoneId] = { 
                stored_metal: 0, 
                mass_remaining: 0, 
                probe_mass: 0, 
                structure_mass: 0, 
                slag_mass: 0 
            };
        }
        const dysonZone = zones[dysonZoneId];
        const metalAvailable = dysonZone.stored_metal || 0;
        
        // Consume metal (2:1 ratio)
        const metalNeeded = throttledRate * this.METAL_TO_DYSON_RATIO * deltaTime;
        const actualMetalConsumed = Math.min(metalNeeded, metalAvailable);
        
        // Consume metal from Dyson zone
        dysonZone.stored_metal = Math.max(0, metalAvailable - actualMetalConsumed);
        newState.zones = zones;
        
        // Convert metal to Dyson mass
        const dysonMassAdded = actualMetalConsumed / this.METAL_TO_DYSON_RATIO;
        
        // Update Dyson sphere
        const currentMass = dysonSphere.mass || 0;
        const targetMass = dysonSphere.target_mass || 5e24;
        const newMass = currentMass + dysonMassAdded;
        
        dysonSphere.mass = newMass;
        dysonSphere.progress = Math.min(1.0, newMass / targetMass);
        
        // Update rates
        if (!newState.rates) {
            newState.rates = {};
        }
        newState.rates.dyson_construction = throttledRate;
        
        newState.dyson_sphere = dysonSphere;
        return newState;
    }
    
    /**
     * Calculate Dyson sphere energy production
     * @param {Object} state - Game state
     * @param {Object} skills - Current skills
     * @param {number} powerAllocation - Power allocation (0 = all economy, 1 = all compute)
     * @returns {Object} Energy production breakdown
     */
    calculateDysonEnergyProduction(state, skills, powerAllocation = 0.5) {
        const dysonSphere = state.dyson_sphere || {};
        const mass = dysonSphere.mass || 0;
        
        // Get Dyson energy upgrade factor (uses ALPHA_DYSON_FACTOR)
        const dysonEnergyFactor = state.upgrade_factors?.dyson?.energy?.performance || 
                                  (skills.energy_collection || skills.solar_pv || 1.0);
        
        // Total power from Dyson sphere
        const totalPower = mass * this.DYSON_POWER_PER_KG * dysonEnergyFactor;
        
        // Split between economy (energy) and compute (intelligence)
        const economyPower = totalPower * (1 - powerAllocation);
        const computePower = totalPower * powerAllocation;
        
        // Convert compute power to FLOPS (simplified: 1 watt ≈ 1 FLOPS for now)
        const intelligenceProduction = computePower;
        
        return {
            total: totalPower,
            economy: economyPower,
            compute: computePower,
            intelligence: intelligenceProduction
        };
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DysonSystem;
}

