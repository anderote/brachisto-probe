/**
 * Composite Skills Calculator
 * 
 * Calculates composite performance metrics from base skills
 * These are used throughout the game for various operations
 */

class CompositeSkillsCalculator {
    constructor(orbitalMechanics) {
        this.orbitalMechanics = orbitalMechanics;
        this.economicRules = null;
    }
    
    /**
     * Initialize with economic rules (for skill coefficients)
     * @param {Object} economicRules - Economic rules from data loader
     */
    initializeEconomicRules(economicRules) {
        this.economicRules = economicRules;
    }
    
    /**
     * Resolve skill name aliases from economic_rules.json to canonical skill names
     * Maps old skill names to new 12-skill system
     * @param {string} skillName - Skill name from economic rules
     * @returns {string} Canonical skill name
     */
    resolveSkillAlias(skillName) {
        // Map economic_rules skill names to new SKILL_DEFINITIONS skill names
        const aliasMap = {
            // Old dexterity -> new
            'manipulation': 'robotics',
            'strength': 'robotics',
            'thrust': 'propulsion',
            'locomotion': 'propulsion',
            'production': 'structures',
            'recycling': 'structures',
            'dyson_construction': 'structures',
            
            // Old energy -> new
            'solar_pv': 'generation',
            'pv_efficiency': 'generation',
            'energy_collection': 'generation',
            'energy': 'generation',
            'battery_density': 'storage_density',
            'energy_storage': 'storage_density',
            'energy_converter': 'conversion',
            'thermal_efficiency': 'conversion',
            'thermal_management': 'conversion',
            'radiator': 'conversion',
            'heat_pump': 'conversion',
            'energy_transport': 'transmission',
            
            // Old intelligence -> new
            'cpu': 'processor',
            'gpu': 'processor',
            'computer_processing': 'processor',
            'computer_gpu': 'processor',
            'interconnect': 'sensors',
            'computer_interconnect': 'sensors',
            'io_bandwidth': 'memory',
            'computer_interface': 'memory',
            'learning': 'architecture',
            'machine_learning': 'architecture',
            'research_rate': 'architecture',
            'research_rate_efficiency': 'architecture',
            'substrate': 'architecture',
            'sensor_systems': 'sensors',
            
            // Legacy aliases
            'robotics': 'robotics',
            'robotic': 'robotics',
            'materials_science': 'materials'
        };
        return aliasMap[skillName] || skillName;
    }

    /**
     * Build skill values with names for breakdown tracking
     * Dynamically reads ALL skills from coefficients and resolves aliases
     * @param {Object} coefficients - Skill coefficients { skillName: coefficient }
     * @param {Object} skills - Current skills from research
     * @returns {Array<{name: string, value: number, weight: number}>} Array of skill info
     */
    buildSkillValues(coefficients, skills) {
        if (!coefficients) return [];
        
        const values = [];
        for (const [rawSkillName, coefficient] of Object.entries(coefficients)) {
            if (rawSkillName === 'description') continue; // Skip description field
            
            // Resolve skill alias to canonical name
            const skillName = this.resolveSkillAlias(rawSkillName);
            
            // Get skill value (with fallbacks for common aliases)
            let skillValue = skills[skillName] || 1.0;
            
            // Additional fallback handling for complex skill types
            if (skillValue === 1.0 && skillName === 'manipulation') {
                skillValue = skills.manipulation || skills.robotic || 1.0;
            }
            if (skillValue === 1.0 && skillName === 'solar_pv') {
                skillValue = skills.solar_pv || skills.energy_collection || 1.0;
            }
            if (skillValue === 1.0 && rawSkillName === 'computer') {
                skillValue = skills.computer?.total || 1.0;
            }
            
            values.push({
                name: rawSkillName, // Keep original name for display
                canonicalName: skillName,
                value: skillValue,
                weight: coefficient
            });
        }
        
        return values;
    }
    
    /**
     * Calculate upgrade factor using weighted sum
     * Formula: factor = 1 + Σ(weight_i * (skill_i - 1))
     * @param {Array<{name: string, value: number, weight: number}>} skillInfo - Array of skill info
     * @returns {{factor: number, breakdown: Object}} Upgrade factor and breakdown by skill
     */
    calculateTechTreeUpgradeFactor(skillInfo) {
        if (!skillInfo || skillInfo.length === 0) {
            return { factor: 1.0, breakdown: {} };
        }
        
        let bonus = 0;
        const breakdown = {};
        
        for (const { name, value, weight } of skillInfo) {
            // Skip invalid values
            if (value <= 0 || !isFinite(value)) continue;
            
            // Calculate contribution: weight * (skillValue - 1)
            // This gives 0 when skill = 1.0, and scales linearly
            const contribution = weight * (value - 1.0);
            bonus += contribution;
            breakdown[name] = contribution;
        }
        
        return {
            factor: 1.0 + bonus,
            breakdown: breakdown
        };
    }
    
    /**
     * Calculate upgrade factor from skill coefficients
     * @param {string} category - Category name (e.g., 'salvage_efficiency')
     * @param {Object} skills - Current skills
     * @returns {{factor: number, breakdown: Object}} Upgrade factor and breakdown
     */
    calculateUpgradeFactorFromCoefficients(category, skills) {
        if (!this.economicRules || !this.economicRules.skill_coefficients) {
            return { factor: 1.0, breakdown: {} };
        }
        
        const coefficients = this.economicRules.skill_coefficients[category];
        if (!coefficients) {
            return { factor: 1.0, breakdown: {} };
        }
        
        const skillInfo = this.buildSkillValues(coefficients, skills);
        return this.calculateTechTreeUpgradeFactor(skillInfo);
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
               (skills.generation || skills.solar_pv || 1.0) * 
               (skills.conversion || skills.thermal_efficiency || skills.energy_converter || 1.0) * 
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
        const processor = skills.processor || skills.cpu || skills.gpu || 1.0;
        const sensors = skills.sensors || skills.interconnect || 1.0;
        const memory = skills.memory || skills.io_bandwidth || 1.0;
        const computeMultiplier = Math.pow(
            processor * processor * sensors * memory,
            0.25
        );
        
        const architecture = skills.architecture || skills.substrate || skills.learning || 1.0;
        return baseFLOPSPerKg * computeMultiplier * architecture;
    }
    
    /**
     * Calculate factory efficiency multiplier
     * @param {Object} skills - Current skills
     * @param {string} zoneId - Zone identifier
     * @returns {number} Production rate multiplier
     */
    calculateFactoryEfficiency(skills, zoneId) {
        const zoneMultiplier = this.orbitalMechanics.getZoneProductivityModifier(zoneId) || 1.0;
        
        return (skills.robotics || skills.manipulation || 1.0) * 
               (skills.structures || skills.production || 1.0) * 
               (skills.materials || 1.0) * 
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
        
        return (skills.robotics || skills.manipulation || 1.0) * 
               (skills.structures || skills.production || 1.0) * 
               (skills.sensors || 1.0) * 
               (skills.materials || 1.0) * 
               zoneMultiplier;
    }
    
    /**
     * Calculate salvage efficiency (recycling fraction)
     * @param {Object} skills - Current skills
     * @returns {number|Object} Metal recovery fraction (0-1), or object with factor and breakdown if detailed
     */
    calculateSalvageEfficiency(skills, detailed = false) {
        const baseRecyclingEfficiency = 0.75; // 75% base
        
        // Use config-driven coefficients if available
        const result = this.calculateUpgradeFactorFromCoefficients('salvage_efficiency', skills);
        
        // Base efficiency can improve up to 100% with research
        const efficiency = Math.min(1.0, baseRecyclingEfficiency * result.factor);
        
        if (detailed) {
            return {
                efficiency: efficiency,
                factor: result.factor,
                breakdown: result.breakdown
            };
        }
        return efficiency;
    }
    
    /**
     * Calculate replication efficiency multiplier
     * @param {Object} skills - Current skills
     * @returns {number} Replication rate multiplier
     */
    calculateReplicationEfficiency(skills) {
        return (skills.robotics || skills.manipulation || 1.0) * 
               (skills.structures || skills.production || 1.0) * 
               (skills.materials || 1.0);
    }
    
    /**
     * Calculate probe build speed (kg/day per probe)
     * @param {Object} skills - Current skills
     * @returns {number} kg/day per probe
     */
    calculateProbeBuildSpeed(skills) {
        const baseBuildRate = 100; // kg/day per probe
        
        return baseBuildRate * 
               (skills.robotics || skills.manipulation || 1.0) * 
               (skills.structures || skills.production || 1.0);
    }
    
    /**
     * Calculate probe recycle speed (kg/day per probe) - for recycling slag
     * @param {Object} skills - Current skills
     * @returns {number} kg/day recycling rate per probe
     */
    calculateProbeRecycleSpeed(skills) {
        const baseRecycleRate = 50; // kg/day per probe
        
        return baseRecycleRate * 
               (skills.robotics || skills.manipulation || 1.0) * 
               (skills.materials || 1.0) * 
               (skills.structures || skills.recycling || 1.0);
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
               (skills.robotics || skills.manipulation || 1.0) * 
               (skills.materials || 1.0) * 
               (skills.structures || skills.recycling || 1.0);
    }
    
    /**
     * Calculate structure construction efficiency multiplier
     * @param {Object} skills - Current skills
     * @param {string} zoneId - Zone identifier
     * @returns {number} Construction rate multiplier
     */
    calculateStructureConstructionEfficiency(skills, zoneId) {
        const zoneMultiplier = this.orbitalMechanics.getZoneProductivityModifier(zoneId) || 1.0;
        
        return (skills.robotics || skills.manipulation || 1.0) * 
               (skills.structures || skills.production || 1.0) * 
               (skills.materials || 1.0) * 
               zoneMultiplier;
    }
    
    /**
     * Calculate transfer efficiency (delta-v multiplier, lower is better)
     * @param {Object} skills - Current skills
     * @param {number} baseDeltaV - Base delta-v cost (unused, kept for API compatibility)
     * @returns {number|Object} Effective delta-v multiplier, or object with factor and breakdown if detailed
     */
    calculateTransferEfficiency(skills, baseDeltaV, detailed = false) {
        // Use config-driven coefficients if available
        const result = this.calculateUpgradeFactorFromCoefficients('delta_v_reduction', skills);
        
        // Delta-v reduction: higher upgrade factor = lower delta-v requirement
        // Return inverse (1 / factor) so that factor > 1 means less delta-v needed
        const multiplier = 1.0 / result.factor;
        
        if (detailed) {
            return {
                multiplier: multiplier,
                factor: result.factor,
                breakdown: result.breakdown
            };
        }
        return multiplier;
    }
    
    /**
     * Calculate energy production efficiency multiplier
     * @param {Object} skills - Current skills
     * @param {string} zoneId - Zone identifier
     * @returns {number} Energy production multiplier
     */
    calculateEnergyProductionEfficiency(skills, zoneId) {
        const zoneMultiplier = this.orbitalMechanics.getZoneProductivityModifier(zoneId) || 1.0;
        
        return (skills.generation || skills.solar_pv || 1.0) * 
               (skills.conversion || skills.thermal_efficiency || skills.energy_converter || skills.radiator || 1.0) * 
               (skills.transmission || skills.energy_transport || 1.0) * 
               zoneMultiplier;
    }
    
    /**
     * Calculate intelligence production efficiency multiplier
     * @param {Object} skills - Current skills
     * @returns {number} FLOPS production multiplier
     */
    calculateIntelligenceProductionEfficiency(skills) {
        // Geometric mean of compute sub-skills
        const processor = skills.processor || skills.cpu || skills.gpu || 1.0;
        const sensors = skills.sensors || skills.interconnect || 1.0;
        const memory = skills.memory || skills.io_bandwidth || 1.0;
        const computeMultiplier = Math.pow(
            processor * processor * sensors * memory,
            0.25
        );
        
        const architecture = skills.architecture || skills.substrate || skills.learning || 1.0;
        return computeMultiplier * architecture * sensors;
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

