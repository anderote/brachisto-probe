/**
 * Energy Calculator
 * 
 * Energy production and consumption calculations
 * All in watts (instantaneous power)
 */

class EnergyCalculator {
    constructor(orbitalMechanics) {
        this.orbitalMechanics = orbitalMechanics;
        this.economicRules = null;
        
        // Default values (fallbacks if economic rules not loaded)
        // These will be overwritten by initializeEconomicRules()
        this.BASE_ENERGY_COST_MINING = 500000;           // 500 kW per mining probe
        this.BASE_ENERGY_COST_RECYCLE_SLAG = 300000;     // 300 kW per slag recycling probe
        this.BASE_STRUCTURE_ENERGY_COST = 250000;        // 250 kW base for structure energy multipliers
        this.BASE_ENERGY_PRODUCTION_PROBE = 100000;      // 100 kW per probe
        this.GEOMETRIC_SCALING_EXPONENT = Config.STRUCTURE_GEOMETRIC_SCALING_EXPONENT || 3.2;
    }
    
    /**
     * Initialize with economic rules (for skill coefficients and base values)
     * @param {Object} economicRules - Economic rules from data loader
     */
    initializeEconomicRules(economicRules) {
        this.economicRules = economicRules;
        
        // Load base values from economic rules (with fallbacks to defaults)
        if (economicRules?.probe) {
            this.BASE_ENERGY_PRODUCTION_PROBE = economicRules.probe.base_energy_production_w ?? this.BASE_ENERGY_PRODUCTION_PROBE;
            this.BASE_ENERGY_COST_MINING = economicRules.probe.base_energy_cost_mining_w ?? this.BASE_ENERGY_COST_MINING;
            this.BASE_ENERGY_COST_RECYCLE_SLAG = economicRules.probe.base_energy_cost_recycle_slag_w ?? this.BASE_ENERGY_COST_RECYCLE_SLAG;
        }
        
        if (economicRules?.structures) {
            this.BASE_STRUCTURE_ENERGY_COST = economicRules.structures.base_energy_cost_w ?? this.BASE_STRUCTURE_ENERGY_COST;
            this.GEOMETRIC_SCALING_EXPONENT = economicRules.structures.geometric_scaling_exponent ?? this.GEOMETRIC_SCALING_EXPONENT;
        }
    }
    
    /**
     * Resolve skill name aliases from economic_rules.json to canonical skill names
     * @param {string} skillName - Skill name from economic rules
     * @returns {string} Canonical skill name
     */
    resolveSkillAlias(skillName) {
        // Map economic_rules skill names to SKILL_DEFINITIONS skill names
        const aliasMap = {
            'energy_storage': 'battery_density',
            'thermal_management': 'radiator',
            'robotics': 'manipulation',
            'robotic': 'manipulation',
            'energy': 'solar_pv',
            'energy_collection': 'solar_pv',
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
     * @returns {number} Upgrade factor
     */
    calculateTechTreeUpgradeFactor(skillInfo) {
        if (!skillInfo || skillInfo.length === 0) return 1.0;
        
        let bonus = 0;
        
        for (const { value, weight } of skillInfo) {
            // Skip invalid values
            if (value <= 0 || !isFinite(value)) continue;
            
            // Calculate contribution: weight * (skillValue - 1)
            // This gives 0 when skill = 1.0, and scales linearly
            bonus += weight * (value - 1.0);
        }
        
        return 1.0 + bonus;
    }
    
    /**
     * Calculate upgrade factor from skill coefficients
     * @param {string} category - Category name (e.g., 'probe_energy_production')
     * @param {Object} skills - Current skills
     * @returns {number} Upgrade factor
     */
    calculateUpgradeFactorFromCoefficients(category, skills) {
        if (!this.economicRules || !this.economicRules.skill_coefficients) {
            return 1.0;
        }
        
        const coefficients = this.economicRules.skill_coefficients[category];
        if (!coefficients) {
            return 1.0;
        }
        
        const skillInfo = this.buildSkillValues(coefficients, skills);
        return this.calculateTechTreeUpgradeFactor(skillInfo);
    }
    
    /**
     * Calculate effective energy cost for an activity, reduced by skills
     * Uses config-driven skill coefficients for probe energy consumption reduction
     * @param {number} baseCost - Base energy cost in watts
     * @param {Object} skills - Current skills object
     * @param {string} activityType - Type of activity (mining, recycle_slag)
     * @returns {number} Effective energy cost in watts
     */
    getEffectiveEnergyCost(baseCost, skills, activityType) {
        // Start with base cost
        let effectiveCost = baseCost;
        
        // Apply general probe energy consumption reduction from config
        const consumptionReductionFactor = this.calculateUpgradeFactorFromCoefficients('probe_energy_consumption', skills);
        effectiveCost /= consumptionReductionFactor;
        
        // Apply activity-specific modifiers (legacy support, can be removed if not needed)
        // Only mining and slag recycling have energy costs
        switch (activityType) {
            case 'mining':
                // Mining efficiency also reduces mining energy cost
                effectiveCost /= (skills.production || 1.0);
                break;
                
            case 'recycle_slag':
                // Slag recycling also uses recycling and materials skills
                effectiveCost /= (skills.recycling || 1.0);
                effectiveCost /= (skills.materials || 1.0);
                break;
        }
        
        return effectiveCost;
    }
    
    /**
     * Calculate energy production from probes
     * Each probe generates base energy production, multiplied by skill-based upgrade factors
     * @param {Object} probesByZone - Probes by zone
     * @param {Object} skills - Current skills (for potential upgrades)
     * @returns {number} Total energy production from probes in watts
     */
    calculateProbeEnergyProduction(probesByZone, skills) {
        let totalProduction = 0;
        
        // Use config-driven skill coefficients for probe energy production
        const productionUpgradeFactor = this.calculateUpgradeFactorFromCoefficients('probe_energy_production', skills);
        
        for (const zoneId in probesByZone) {
            const zoneProbes = probesByZone[zoneId] || {};
            const totalProbes = zoneProbes['probe'] || 0;
            
            if (totalProbes > 0) {
                // Each probe produces base energy, multiplied by skill-based upgrade factor
                const probeProduction = totalProbes * this.BASE_ENERGY_PRODUCTION_PROBE * productionUpgradeFactor;
                totalProduction += probeProduction;
            }
        }
        
        return totalProduction;
    }
    
    /**
     * Calculate energy production from structures
     * Uses new multiplier-based system with structure upgrade factors
     * Solar buildings scale with zone's solar_irradiance_factor (inverse square of orbital radius)
     * @param {Object} structuresByZone - Structures by zone
     * @param {Object} buildings - Building definitions
     * @param {Object} state - Game state (to get pre-calculated upgrade factors)
     * @returns {number} Total energy production in watts
     */
    calculateStructureEnergyProduction(structuresByZone, buildings, state) {
        let totalProduction = 0;
        
        // Check all building types for energy production capability
        // Handle both formats: buildings.buildings (nested) or buildings (direct)
        const allBuildings = buildings?.buildings || buildings || {};
        
        if (!allBuildings || Object.keys(allBuildings).length === 0) {
            console.warn('[EnergyCalculator] No buildings provided to calculateStructureEnergyProduction');
            return 0;
        }
        
        for (const zoneId in structuresByZone) {
            const zoneStructures = structuresByZone[zoneId] || {};
            
            // Get zone's solar irradiance factor (1.0 at Earth, scales with 1/r²)
            const zoneData = this.orbitalMechanics?.getZone?.(zoneId);
            const solarIrradianceFactor = zoneData?.solar_irradiance_factor || 1.0;
            
            for (const [buildingId, building] of Object.entries(allBuildings)) {
                const count = zoneStructures[buildingId] || 0;
                if (count === 0) continue;
                
                // Check if building has power output
                if (building.power_output_mw) {
                    // New multiplier-based system
                    const basePowerMW = building.power_output_mw;
                    const basePowerW = basePowerMW * 1e6; // Convert MW to watts
                    
                    // Apply structure performance upgrade factor
                    const perfFactor = state.upgrade_factors?.structure?.energy?.performance || 1.0;
                    
                    // Apply solar irradiance scaling for solar-powered buildings
                    // Solar power scales with 1/r² (encoded in solar_irradiance_factor)
                    const solarScaling = building.uses_solar ? solarIrradianceFactor : 1.0;
                    
                    // Apply geometric scaling to benefits (same exponent as cost scaling)
                    const geometricFactor = Math.pow(count, this.GEOMETRIC_SCALING_EXPONENT);
                    const effectiveProduction = basePowerW * geometricFactor * solarScaling * perfFactor;
                    totalProduction += effectiveProduction;
                } else if (building.effects?.energy_production_per_second) {
                    // Legacy system fallback
                    const baseProduction = building.effects.energy_production_per_second;
                    const upgradeFactor = state.tech_upgrade_factors?.energy_generation || 1.0;
                    const zoneEfficiency = building.orbital_efficiency?.[zoneId] || 1.0;
                    // Apply geometric scaling to benefits (same exponent as cost scaling)
                    const geometricFactor = Math.pow(count, this.GEOMETRIC_SCALING_EXPONENT);
                    const effectiveProduction = baseProduction * geometricFactor * zoneEfficiency * upgradeFactor;
                    totalProduction += effectiveProduction;
                }
            }
        }
        
        // Dyson sphere energy production
        // Dyson power = mass * power_per_kg * energy_collection_skill
        // This will be calculated separately in DysonSystem
        
        return totalProduction;
    }
    
    /**
     * Calculate energy consumption from probes (activity-based)
     * Only mining and slag recycling consume energy - other activities are "free"
     * Energy costs are reduced by relevant skills and research upgrades
     * @param {Object} probesByZone - Probes by zone
     * @param {Object} probeAllocationsByZone - Probe allocations
     * @param {Object} skills - Current skills
     * @param {Object} state - Game state (unused, kept for API compatibility)
     * @returns {number} Total energy consumption in watts
     */
    calculateProbeEnergyConsumption(probesByZone, probeAllocationsByZone, skills, state = null) {
        let totalConsumption = 0;
        
        // Calculate effective energy costs based on current skills
        // Only mining and slag recycling consume energy
        const miningCost = this.getEffectiveEnergyCost(this.BASE_ENERGY_COST_MINING, skills, 'mining');
        const recycleSlagCost = this.getEffectiveEnergyCost(this.BASE_ENERGY_COST_RECYCLE_SLAG, skills, 'recycle_slag');
        
        for (const zoneId in probesByZone) {
            const zoneProbes = probesByZone[zoneId] || {};
            const totalProbes = zoneProbes['probe'] || 0;
            
            if (totalProbes === 0) continue;
            
            // Get allocations for this zone
            const allocations = probeAllocationsByZone[zoneId] || {};
            const harvestAllocation = allocations.harvest || 0;
            const recycleAllocation = allocations.recycle || 0;  // Slag recycling
            
            // Calculate probes doing each activity that costs energy
            const miningProbes = totalProbes * harvestAllocation;
            const recycleSlagProbes = totalProbes * recycleAllocation;
            
            // Calculate consumption by activity type (using skill-adjusted costs)
            // Only mining and slag recycling have energy costs
            let zoneConsumption = 0;
            zoneConsumption += miningProbes * miningCost;
            zoneConsumption += recycleSlagProbes * recycleSlagCost;
            
            totalConsumption += zoneConsumption;
        }
        
        return totalConsumption;
    }
    
    /**
     * Calculate energy consumption from structures
     * Supports both multiplier-based and fixed MW consumption systems
     * @param {Object} structuresByZone - Structures by zone
     * @param {Object} buildings - Building definitions
     * @param {Object} state - Game state (for research upgrades)
     * @returns {number} Total energy consumption in watts
     */
    calculateStructureEnergyConsumption(structuresByZone, buildings, state = null) {
        let totalConsumption = 0;
        
        // Check all building types for energy consumption
        // Handle both formats: buildings.buildings (nested) or buildings (direct)
        const allBuildings = buildings?.buildings || buildings || {};
        
        for (const zoneId in structuresByZone) {
            const zoneStructures = structuresByZone[zoneId] || {};
            
            for (const [buildingId, building] of Object.entries(allBuildings)) {
                const count = zoneStructures[buildingId] || 0;
                if (count === 0) continue;
                
                // Check for fixed base power consumption (e.g., data centers)
                // This is a fixed MW value that doesn't scale with solar
                if (building.base_power_consumption_mw !== undefined && building.base_power_consumption_mw > 0) {
                    const baseCostMW = building.base_power_consumption_mw;
                    const baseCostW = baseCostMW * 1e6; // Convert MW to watts
                    
                    // Get cost upgrade factor (energy costs decrease with research)
                    const costFactor = state?.upgrade_factors?.structure?.building?.cost || 1.0;
                    
                    // Apply geometric scaling (same exponent as cost scaling)
                    const geometricFactor = Math.pow(count, this.GEOMETRIC_SCALING_EXPONENT);
                    
                    // Energy cost decreases with research
                    const effectiveCost = (baseCostW * geometricFactor) / costFactor;
                    totalConsumption += effectiveCost;
                }
                // Check if building has energy cost multiplier (legacy system)
                else if (building.energy_cost_multiplier !== undefined) {
                    // New multiplier-based system
                    if (building.energy_cost_multiplier === 0) continue;
                    
                    // Buildings use base structure energy cost (250kW), multiplied by their multiplier
                    const baseCost = this.BASE_STRUCTURE_ENERGY_COST * building.energy_cost_multiplier;
                    
                    // Get cost upgrade factor (energy costs decrease with research, so divide by cost factor)
                    const costFactor = state?.upgrade_factors?.structure?.building?.cost || 1.0;
                    
                    // Energy cost decreases with research
                    let effectiveCost = baseCost / costFactor;
                    
                    // Apply transport research upgrades to mass driver operational power
                    if (buildingId === 'mass_driver' && state?.skills) {
                        const transportSkill = state.skills.energy_transport || 1.0;
                        effectiveCost = effectiveCost / transportSkill;
                    }
                    
                    totalConsumption += effectiveCost * count;
                } else {
                    // Legacy system fallback
                    const baseConsumption = building.effects?.energy_consumption_per_second || 0;
                    if (baseConsumption > 0) {
                        totalConsumption += baseConsumption * count;
                    }
                }
            }
        }
        
        return totalConsumption;
    }
    
    /**
     * Calculate net energy (production - consumption)
     * @param {Object} state - Game state
     * @param {Object} buildings - Building definitions
     * @param {Object} skills - Current skills (still needed for energy consumption calculations)
     * @param {number} dysonEnergyProduction - Energy from Dyson sphere (watts)
     * @returns {Object} Energy balance
     */
    calculateEnergyBalance(state, buildings, skills, dysonEnergyProduction = 0) {
        const structuresByZone = state.structures_by_zone || {};
        const probesByZone = state.probes_by_zone || {};
        const probeAllocationsByZone = state.probe_allocations_by_zone || {};
        
        // Base energy production (player starts with this)
        const baseProduction = state.base_energy_production || 0;
        
        // Calculate production from probes + structures + Dyson + base production
        const probeProduction = this.calculateProbeEnergyProduction(probesByZone, skills);
        const structureProduction = this.calculateStructureEnergyProduction(structuresByZone, buildings, state);
        const production = baseProduction + probeProduction + structureProduction + dysonEnergyProduction;
        
        // Calculate consumption from probes (activity-based) + structures
        const probeConsumption = this.calculateProbeEnergyConsumption(probesByZone, probeAllocationsByZone, skills, state);
        const structureConsumption = this.calculateStructureEnergyConsumption(structuresByZone, buildings, state);
        
        const totalConsumption = probeConsumption + structureConsumption;
        const netEnergy = production - totalConsumption;
        
        // Calculate throttle factor using exponential decay for energy deficits
        // When production >= consumption: throttle = 1.0 (no penalty)
        // When production < consumption: exponential decay to 5% over 10 orders of magnitude
        // Formula: throttle = 0.05^(deficit_orders / 10) where deficit_orders = log10(consumption / production)
        // This gives a smooth exponential penalty that bottoms out at 5% efficiency
        let throttle;
        if (totalConsumption <= 0) {
            // No consumption, no throttle
            throttle = 1.0;
        } else if (production <= 0) {
            // No production but consumption exists - minimum performance (5%)
            throttle = 0.05;
        } else if (production >= totalConsumption) {
            // Surplus or balanced - no throttle
            throttle = 1.0;
        } else {
            // Deficit - apply exponential decay
            // deficit_orders = log10(consumption / production)
            // At deficit_orders = 10 (production is 10 billion times less), throttle = 5%
            const deficitRatio = totalConsumption / production;
            const deficitOrders = Math.log10(deficitRatio);
            // throttle = 0.05^(deficitOrders / 10), clamped to minimum 5%
            throttle = Math.max(0.05, Math.pow(0.05, deficitOrders / 10));
        }
        
        return {
            production,
            consumption: totalConsumption,
            probeProduction,
            probeConsumption,
            structureConsumption,
            baseProduction,
            net: netEnergy,
            throttle: throttle
        };
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnergyCalculator;
}

