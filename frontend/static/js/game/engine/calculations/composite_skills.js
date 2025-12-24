/**
 * Composite Skills Calculator
 * 
 * Calculates composite performance metrics from base skills
 * These are used throughout the game for various operations
 */

class CompositeSkillsCalculator {
    constructor(orbitalMechanics) {
        this.orbitalMechanics = orbitalMechanics;
    }
    
    /**
     * Calculate Dyson collector efficiency (solar power per kg)
     * @param {Object} skills - Current skills
     * @param {string} zoneId - Zone identifier
     * @returns {number} Watts per kg of Dyson mass
     */
    calculateDysonCollectorEfficiency(skills, zoneId) {
        const basePowerPerKg = 5000; // watts per kg
        const zoneMultiplier = this.orbitalMechanics.getZoneProductivityModifier(zoneId) || 1.0;
        
        return basePowerPerKg * 
               skills.solar_pv * 
               skills.thermal_efficiency * 
               skills.energy_converter * 
               zoneMultiplier;
    }
    
    /**
     * Calculate Dyson compute efficiency (FLOPS per kg)
     * @param {Object} skills - Current skills
     * @returns {number} FLOPS per kg of Dyson mass
     */
    calculateDysonComputeEfficiency(skills) {
        const baseFLOPSPerKg = 1e12; // 1 TFLOPS per kg base
        
        // Geometric mean of compute sub-skills
        const computeMultiplier = Math.pow(
            skills.cpu * skills.gpu * skills.interconnect * skills.io_bandwidth,
            0.25
        );
        
        return baseFLOPSPerKg * computeMultiplier * skills.learning;
    }
    
    /**
     * Calculate factory efficiency multiplier
     * @param {Object} skills - Current skills
     * @param {string} zoneId - Zone identifier
     * @returns {number} Production rate multiplier
     */
    calculateFactoryEfficiency(skills, zoneId) {
        const zoneMultiplier = this.orbitalMechanics.getZoneProductivityModifier(zoneId) || 1.0;
        
        return skills.manipulation * 
               skills.strength * 
               skills.production * 
               skills.materials * 
               zoneMultiplier;
    }
    
    /**
     * Calculate mining efficiency multiplier
     * @param {Object} skills - Current skills
     * @param {string} zoneId - Zone identifier
     * @returns {number} Mining rate multiplier
     */
    calculateMiningEfficiency(skills, zoneId) {
        const zoneMultiplier = this.orbitalMechanics.getZoneMiningMultiplier(zoneId) || 1.0;
        
        return skills.manipulation * 
               skills.strength * 
               skills.production * 
               skills.sensors * 
               zoneMultiplier;
    }
    
    /**
     * Calculate salvage efficiency (recycling fraction)
     * @param {Object} skills - Current skills
     * @returns {number} Metal recovery fraction (0-1)
     */
    calculateSalvageEfficiency(skills) {
        const baseRecyclingEfficiency = 0.75; // 75% base
        
        return Math.min(1.0, baseRecyclingEfficiency * 
               skills.manipulation * 
               skills.materials * 
               skills.recycling);
    }
    
    /**
     * Calculate replication efficiency multiplier
     * @param {Object} skills - Current skills
     * @returns {number} Replication rate multiplier
     */
    calculateReplicationEfficiency(skills) {
        return skills.manipulation * 
               skills.strength * 
               skills.production * 
               skills.materials;
    }
    
    /**
     * Calculate probe build speed (kg/day per probe)
     * @param {Object} skills - Current skills
     * @returns {number} kg/day per probe
     */
    calculateProbeBuildSpeed(skills) {
        const baseBuildRate = 100; // kg/day per probe
        
        return baseBuildRate * 
               skills.manipulation * 
               skills.strength * 
               skills.production;
    }
    
    /**
     * Calculate probe recycle speed (kg/day per probe) - for recycling slag
     * @param {Object} skills - Current skills
     * @returns {number} kg/day recycling rate per probe
     */
    calculateProbeRecycleSpeed(skills) {
        const baseRecycleRate = 50; // kg/day per probe
        
        return baseRecycleRate * 
               skills.manipulation * 
               skills.materials * 
               skills.recycling;
    }
    
    /**
     * Calculate probe self-recycle speed (kg/day per probe) - for recycling probes
     * Probes allocated to self-recycling dismantle probes at this rate
     * @param {Object} skills - Current skills
     * @returns {number} kg/day self-recycling rate per probe
     */
    calculateProbeSelfRecycleSpeed(skills) {
        const baseSelfRecycleRate = 5; // 5 kg/day per probe (base rate)
        
        return baseSelfRecycleRate * 
               skills.manipulation * 
               skills.materials * 
               skills.recycling;
    }
    
    /**
     * Calculate structure construction efficiency multiplier
     * @param {Object} skills - Current skills
     * @param {string} zoneId - Zone identifier
     * @returns {number} Construction rate multiplier
     */
    calculateStructureConstructionEfficiency(skills, zoneId) {
        const zoneMultiplier = this.orbitalMechanics.getZoneProductivityModifier(zoneId) || 1.0;
        
        return skills.manipulation * 
               skills.strength * 
               skills.production * 
               skills.materials * 
               zoneMultiplier;
    }
    
    /**
     * Calculate transfer efficiency (delta-v multiplier, lower is better)
     * @param {Object} skills - Current skills
     * @param {number} baseDeltaV - Base delta-v cost
     * @returns {number} Effective delta-v multiplier
     */
    calculateTransferEfficiency(skills, baseDeltaV) {
        // Propulsion bonus reduces delta-v requirement
        const propulsionBonus = skills.propulsion - 1.0;
        const thrustBonus = skills.thrust - 1.0;
        const locomotionBonus = skills.locomotion - 1.0;
        
        // Lower is better - divide by improvements
        return 1.0 / (
            (1 + propulsionBonus) * 
            (1 + thrustBonus * 0.3) * 
            (1 + locomotionBonus * 0.2)
        );
    }
    
    /**
     * Calculate energy production efficiency multiplier
     * @param {Object} skills - Current skills
     * @param {string} zoneId - Zone identifier
     * @returns {number} Energy production multiplier
     */
    calculateEnergyProductionEfficiency(skills, zoneId) {
        const zoneMultiplier = this.orbitalMechanics.getZoneProductivityModifier(zoneId) || 1.0;
        
        return skills.solar_pv * 
               skills.thermal_efficiency * 
               skills.energy_converter * 
               skills.radiator * 
               zoneMultiplier;
    }
    
    /**
     * Calculate intelligence production efficiency multiplier
     * @param {Object} skills - Current skills
     * @returns {number} FLOPS production multiplier
     */
    calculateIntelligenceProductionEfficiency(skills) {
        // Geometric mean of compute sub-skills
        const computeMultiplier = Math.pow(
            skills.cpu * skills.gpu * skills.interconnect * skills.io_bandwidth,
            0.25
        );
        
        return computeMultiplier * skills.learning * skills.sensors;
    }
    
    /**
     * Calculate probe deterioration rate (fraction of probe mass per day)
     * @param {Object} skills - Current skills
     * @returns {number} Deterioration rate (0-1)
     */
    calculateProbeDeteriorationRate(skills) {
        const baseDeteriorationRate = 0.001; // 0.1% per day
        const materialsBonus = skills.materials - 1.0;
        
        return baseDeteriorationRate * (1 - materialsBonus * 0.5);
    }
    
    /**
     * Calculate metal recovery from deterioration (fraction)
     * @param {Object} skills - Current skills
     * @returns {number} Metal recovery fraction (0-1)
     */
    calculateMetalRecoveryFromDeterioration(skills) {
        const baseMetalRecovery = 0.5; // 50% base
        const materialsBonus = skills.materials - 1.0;
        
        return Math.min(1.0, baseMetalRecovery * (1 + materialsBonus * 0.4));
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CompositeSkillsCalculator;
}

