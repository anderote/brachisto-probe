/**
 * Production Calculator
 * 
 * All rates measured in kg/day
 * - Mining rates
 * - Building rates
 * - Refining rates
 * - Probe production rates
 */

class ProductionCalculator {
    constructor(orbitalMechanics) {
        this.orbitalMechanics = orbitalMechanics;
        
        // Base rates (per probe, per day)
        this.BASE_MINING_RATE = 100.0;      // kg/day per probe
        this.BASE_BUILDING_RATE = 20.0;    // kg/day per probe
    }
    
    /**
     * Calculate tech tree upgrade factor using geometric mean and exponential scaling
     * Formula: F = exp(alpha * log(G)) where G is geometric mean of skill values
     * @param {Array<number>} skillValues - Array of (skill * coefficient) values
     * @param {number} alpha - Tech growth scale factor (from config)
     * @returns {number} Tech tree upgrade factor
     */
    calculateTechTreeUpgradeFactor(skillValues, alpha) {
        if (!skillValues || skillValues.length === 0) return 1.0;
        
        // Filter out zero/negative values (safety check)
        const validValues = skillValues.filter(v => v > 0);
        if (validValues.length === 0) return 1.0;
        
        // Calculate geometric mean: G = (v1 * v2 * ... * vn)^(1/n)
        const product = validValues.reduce((prod, val) => prod * val, 1.0);
        const geometricMean = Math.pow(product, 1.0 / validValues.length);
        
        // Calculate log(G)
        const logG = Math.log(geometricMean);
        
        // F = exp(alpha * log(G)) = G^alpha
        const factor = Math.exp(alpha * logG);
        
        return factor;
    }
    
    /**
     * Calculate upgrade factors for performance and cost using alpha factors
     * @param {Array<number>} skillValues - Array of skill values
     * @param {number} alphaPerf - Performance alpha factor (e.g., ALPHA_STRUCTURE_FACTOR)
     * @param {number} alphaCost - Cost alpha factor (average of ALPHA_COST_FACTOR and performance alpha)
     * @returns {Object} {performance: factor, cost: factor}
     */
    calculateUpgradeFactors(skillValues, alphaPerf, alphaCost) {
        const performanceFactor = this.calculateTechTreeUpgradeFactor(skillValues, alphaPerf);
        const costFactor = this.calculateTechTreeUpgradeFactor(skillValues, alphaCost);
        return {
            performance: performanceFactor,
            cost: costFactor
        };
    }
    
    /**
     * Calculate all tech tree upgrade factors once per tick
     * @param {Object} skills - Current skills from research
     * @param {number} alpha - Tech growth scale factor (from config)
     * @returns {Object} All upgrade factors
     */
    calculateAllUpgradeFactors(skills, alpha) {
        const roboticSkill = skills.robotic || skills.manipulation || 1.0;
        const computerSkill = skills.computer?.total || 1.0;
        const locomotionSkill = skills.locomotion || 1.0;
        const energyTransportSkill = skills.energy_transport || 1.0;
        const acdsSkill = skills.acds || 1.0; // ACDS skill (defaults to 1.0 if not present)
        const productionSkill = skills.production || 1.0;
        const energyCollectionSkill = skills.energy_collection || skills.solar_pv || 1.0;
        
        // Probe mining: 0.5*acds, 1.0*robotic, 0.2*computer, 0.5*locomotion, 0.2*energy_transport
        const probeMiningValues = [
            0.5 * acdsSkill,
            1.0 * roboticSkill,
            0.2 * computerSkill,
            0.5 * locomotionSkill,
            0.2 * energyTransportSkill
        ];
        const probeMiningFactor = this.calculateTechTreeUpgradeFactor(probeMiningValues, alpha);
        
        // Probe build: 0.3*acds, 1.0*robotic, 0.35*computer, 1.0*production, 0.2*energy_transport
        const probeBuildValues = [
            0.3 * acdsSkill,
            1.0 * roboticSkill,
            0.35 * computerSkill,
            1.0 * productionSkill,
            0.2 * energyTransportSkill
        ];
        const probeBuildFactor = this.calculateTechTreeUpgradeFactor(probeBuildValues, alpha);
        
        // Probe replicate: same as probe build (replication is a form of building)
        const probeReplicateFactor = probeBuildFactor;
        
        // Factory replicate: same as probe replicate (factories replicate probes)
        const factoryReplicateFactor = probeBuildFactor;
        
        // Refinery mine: same as probe mining (refineries mine metal)
        const refineryMineFactor = probeMiningFactor;
        
        // Energy generation: depends on energy collection and transport
        const energyGenerationValues = [
            1.0 * energyCollectionSkill,
            0.5 * energyTransportSkill,
            0.3 * computerSkill  // Computer systems help optimize energy collection
        ];
        const energyGenerationFactor = this.calculateTechTreeUpgradeFactor(energyGenerationValues, alpha);
        
        return {
            probe_mining: probeMiningFactor,
            probe_build: probeBuildFactor,
            probe_replicate: probeReplicateFactor,
            factory_replicate: factoryReplicateFactor,
            refinery_mine: refineryMineFactor,
            energy_generation: energyGenerationFactor
        };
    }
    
    /**
     * Calculate mining rate for a zone (returns MASS mining rate, not metal)
     * Uses pre-calculated upgrade factor from state
     * @param {number} probeCount - Number of probes allocated to mining
     * @param {string} zoneId - Zone identifier
     * @param {Object} state - Game state (to get pre-calculated upgrade factors)
     * @returns {number} Mass mining rate in kg/day
     */
    calculateMiningRate(probeCount, zoneId, state) {
        if (probeCount <= 0) return 0;
        
        // Base rate per probe (mass extraction rate)
        const baseRatePerProbe = this.BASE_MINING_RATE;
        
        // Get upgrade factor from state (prefer new system, fallback to legacy)
        const upgradeFactor = state.upgrade_factors?.probe?.mining?.performance || 
                             state.tech_upgrade_factors?.probe_mining || 1.0;
        
        // Apply upgrade factor
        const ratePerProbe = baseRatePerProbe * upgradeFactor;
        
        // Apply zone multiplier
        const zoneMultiplier = this.orbitalMechanics.getZoneMiningMultiplier(zoneId);
        
        // Total rate = probes * rate_per_probe * zone_multiplier
        return probeCount * ratePerProbe * zoneMultiplier;
    }
    
    /**
     * Calculate metal extraction efficiency for a zone
     * Base efficiency = zone's metal_percentage
     * Improved by research (recycling skill) and refinery structures
     * @param {string} zoneId - Zone identifier
     * @param {Object} skills - Current skills
     * @param {Object} structuresByZone - Structures by zone
     * @param {Object} buildings - Building definitions
     * @returns {number} Extraction efficiency (0-1), metal extracted per kg of mass mined
     */
    calculateMetalExtractionEfficiency(zoneId, skills, structuresByZone, buildings) {
        // Base efficiency = zone's natural metallicity
        const zone = this.orbitalMechanics.getZone(zoneId);
        const baseEfficiency = zone?.metal_percentage || 0;
        
        // Research bonus: recycling skill improves extraction efficiency
        // recycling skill of 0.75 means 75% base, can improve up to 1.0 (100%)
        const researchBonus = Math.max(0, (skills.recycling || 0.75) - 0.75) * 0.5; // Up to 12.5% bonus
        
        // Refinery structures bonus
        let refineryBonus = 0;
        const zoneStructures = structuresByZone?.[zoneId] || {};
        const allBuildings = [
            ...(buildings?.mining || []),
            ...(buildings?.factories || []),
            ...(buildings?.recycling || []),
            ...(buildings?.omni || [])
        ];
        
        for (const building of allBuildings) {
            const count = zoneStructures[building.id] || 0;
            if (count === 0) continue;
            
            // Check for metal extraction bonus effect
            const extractionBonus = building.effects?.metal_extraction_bonus || 0;
            if (extractionBonus > 0) {
                refineryBonus += extractionBonus * count;
            }
        }
        
        // Total efficiency capped at 1.0 (100%)
        const totalEfficiency = Math.min(1.0, baseEfficiency + researchBonus + refineryBonus);
        
        return totalEfficiency;
    }
    
    /**
     * Calculate metal production rate from mass mining rate
     * Applies extraction efficiency to convert mass mining rate to metal production rate
     * @param {number} massMiningRate - Mass mining rate in kg/day
     * @param {string} zoneId - Zone identifier
     * @param {Object} skills - Current skills
     * @param {Object} structuresByZone - Structures by zone
     * @param {Object} buildings - Building definitions
     * @returns {number} Metal production rate in kg/day
     */
    calculateMetalProductionRate(massMiningRate, zoneId, skills, structuresByZone, buildings) {
        if (massMiningRate <= 0) return 0;
        
        const extractionEfficiency = this.calculateMetalExtractionEfficiency(
            zoneId, skills, structuresByZone, buildings
        );
        
        return massMiningRate * extractionEfficiency;
    }
    
    /**
     * Calculate building rate (for structures and probes)
     * Uses pre-calculated upgrade factor from state
     * @param {number} probeCount - Number of probes allocated to building
     * @param {Object} state - Game state (to get pre-calculated upgrade factors)
     * @returns {number} Building rate in kg/day
     */
    calculateBuildingRate(probeCount, state) {
        if (probeCount <= 0) return 0;
        
        // Base rate per probe
        const baseRatePerProbe = this.BASE_BUILDING_RATE;
        
        // Get upgrade factor from state (prefer new system, fallback to legacy)
        const upgradeFactor = state.upgrade_factors?.probe?.building?.performance || 
                             state.tech_upgrade_factors?.probe_build || 1.0;
        
        // Total rate = probes * base_rate * upgrade_factor
        return probeCount * baseRatePerProbe * upgradeFactor;
    }
    
    /**
     * Calculate total dexterity (for display purposes)
     * @param {Object} probesByZone - Probes by zone
     * @param {Object} skills - Current skills
     * @returns {number} Total dexterity
     */
    calculateTotalDexterity(probesByZone, skills) {
        const profiler = typeof self !== 'undefined' && self.performanceProfiler 
            ? self.performanceProfiler 
            : (typeof window !== 'undefined' && window.performanceProfiler ? window.performanceProfiler : null);
        const iterationStart = profiler ? performance.now() : null;
        
        let totalProbes = 0;
        for (const zoneId in probesByZone) {
            for (const probeType in probesByZone[zoneId]) {
                totalProbes += probesByZone[zoneId][probeType] || 0;
            }
        }
        
        if (profiler && iterationStart !== null) {
            const iterationTime = performance.now() - iterationStart;
            if (iterationTime > 0.1) {
                profiler.recordProbeIterationTime(iterationTime);
            }
        }
        
        // Dexterity = probe_count * base_dexterity * robotic_skill
        const baseDexterity = 1.0;
        return totalProbes * baseDexterity * skills.robotic;
    }
    
    /**
     * Calculate structure mining rate (from mining structures)
     * Uses new multiplier-based system with structure upgrade factors
     * @param {Object} structuresByZone - Structures by zone
     * @param {string} zoneId - Zone identifier
     * @param {Object} buildings - Building definitions
     * @param {Object} state - Game state (to get pre-calculated upgrade factors)
     * @returns {number} Mining rate in kg/day
     */
    calculateStructureMiningRate(structuresByZone, zoneId, buildings, state) {
        const zoneStructures = structuresByZone[zoneId] || {};
        let totalRate = 0;
        
        // Check all building types for mining capability
        // Handle both formats: buildings.buildings (nested) or buildings (direct)
        const allBuildings = buildings?.buildings || buildings || {};
        
        for (const [buildingId, building] of Object.entries(allBuildings)) {
            const count = zoneStructures[buildingId] || 0;
            if (count === 0) continue;
            
            // Check if building has mining capability
            if (building.mining_rate_multiplier) {
                // New multiplier-based system
                const baseProbeMiningRate = Config.PROBE_HARVEST_RATE || 100;
                const baseRate = baseProbeMiningRate * building.mining_rate_multiplier;
                
                // Apply structure performance upgrade factor
                const perfFactor = state.upgrade_factors?.structure?.mining?.performance || 1.0;
                
                // Apply zone efficiency
                const zoneEfficiency = building.orbital_efficiency?.[zoneId] || 1.0;
                
                // Apply geometric scaling to benefits (same as cost scaling: count^2.1)
                const geometricFactor = Math.pow(count, 2.1);
                const effectiveRate = baseRate * geometricFactor * zoneEfficiency * perfFactor;
                totalRate += effectiveRate;
            } else if (building.effects?.metal_production_per_day) {
                // Legacy system fallback
                const baseRate = building.effects.metal_production_per_day;
                const upgradeFactor = state.tech_upgrade_factors?.refinery_mine || 1.0;
                const zoneEfficiency = building.orbital_efficiency?.[zoneId] || 1.0;
                // Apply geometric scaling to benefits (same as cost scaling: count^2.1)
                const geometricFactor = Math.pow(count, 2.1);
                const effectiveRate = baseRate * geometricFactor * zoneEfficiency * upgradeFactor;
                totalRate += effectiveRate;
            }
        }
        
        return totalRate;
    }
    
    /**
     * Calculate structure building rate (from factory structures)
     * Uses new multiplier-based system with structure upgrade factors
     * @param {Object} structuresByZone - Structures by zone
     * @param {string} zoneId - Zone identifier
     * @param {Object} buildings - Building definitions
     * @param {Object} state - Game state (to get pre-calculated upgrade factors)
     * @returns {number} Building rate in kg/day
     */
    calculateStructureBuildingRate(structuresByZone, zoneId, buildings, state) {
        const zoneStructures = structuresByZone[zoneId] || {};
        let totalRate = 0;
        
        // Check all building types for building/replication capability
        // Handle both formats: buildings.buildings (nested) or buildings (direct)
        const allBuildings = buildings?.buildings || buildings || {};
        
        for (const [buildingId, building] of Object.entries(allBuildings)) {
            const count = zoneStructures[buildingId] || 0;
            if (count === 0) continue;
            
            // Check if building has build/replication capability
            if (building.build_rate_multiplier) {
                // New multiplier-based system
                const baseProbeBuildRate = Config.PROBE_BUILD_RATE || 20;
                const baseRate = baseProbeBuildRate * building.build_rate_multiplier;
                
                // Apply structure performance upgrade factor
                const perfFactor = state.upgrade_factors?.structure?.building?.performance || 1.0;
                
                // Apply zone efficiency
                const zoneEfficiency = building.orbital_efficiency?.[zoneId] || 1.0;
                
                // Apply geometric scaling to benefits (same as cost scaling: count^2.1)
                const geometricFactor = Math.pow(count, 2.1);
                const effectiveRate = baseRate * geometricFactor * zoneEfficiency * perfFactor;
                totalRate += effectiveRate;
            } else if (building.effects?.probe_production_per_day || building.effects?.structure_production_per_day) {
                // Legacy system fallback
                const baseRate = building.effects?.probe_production_per_day || 
                               building.effects?.structure_production_per_day || 0;
                const upgradeFactor = state.tech_upgrade_factors?.factory_replicate || 1.0;
                const zoneEfficiency = building.orbital_efficiency?.[zoneId] || 1.0;
                // Apply geometric scaling to benefits (same as cost scaling: count^2.1)
                const geometricFactor = Math.pow(count, 2.1);
                const effectiveRate = baseRate * geometricFactor * zoneEfficiency * upgradeFactor;
                totalRate += effectiveRate;
            }
        }
        
        return totalRate;
    }
    
    /**
     * Calculate zone-level metal throttle factor
     * Metal throttle represents what fraction of daily demand can be met with current storage
     * Throttle = min(1.0, stored_metal / daily_demand)
     * @param {Object} state - Game state
     * @param {string} zoneId - Zone identifier
     * @param {Object} buildings - Building definitions
     * @returns {number} Metal throttle factor (0-1)
     */
    calculateZoneMetalThrottle(state, zoneId, buildings) {
        const zone = state.zones?.[zoneId] || {};
        const storedMetal = zone.stored_metal || 0;
        
        // Calculate metal demand from: replication + construction (kg/day)
        const rates = this.calculateZoneRates(state, zoneId, buildings);
        const metalDemandPerDay = rates.building; // kg/day of metal consumption
        
        // Throttle = min(1.0, stored_metal / daily_demand)
        // This represents: "what fraction of today's demand can we meet with current storage?"
        // If demand is 0, throttle is 1.0 (no throttling needed)
        // Note: This is a display metric. Actual throttling happens per-tick in processReplication
        return metalDemandPerDay > 0 ? Math.min(1.0, storedMetal / metalDemandPerDay) : 1.0;
    }
    
    /**
     * Calculate all production rates for a zone
     * Uses pre-calculated upgrade factors from state
     * @param {Object} state - Game state
     * @param {string} zoneId - Zone identifier
     * @param {Object} buildings - Building definitions
     * @returns {Object} Production rates
     */
    calculateZoneRates(state, zoneId, buildings) {
        const probesByZone = state.probes_by_zone || {};
        const structuresByZone = state.structures_by_zone || {};
        const probeAllocationsByZone = state.probe_allocations_by_zone || {};
        
        const zoneProbes = probesByZone[zoneId] || {};
        const profiler = typeof self !== 'undefined' && self.performanceProfiler 
            ? self.performanceProfiler 
            : (typeof window !== 'undefined' && window.performanceProfiler ? window.performanceProfiler : null);
        const probeCountStart = profiler ? performance.now() : null;
        const totalProbes = Object.values(zoneProbes).reduce((sum, count) => sum + (count || 0), 0);
        if (profiler && probeCountStart !== null) {
            const probeCountTime = performance.now() - probeCountStart;
            if (probeCountTime > 0.1) {
                profiler.recordProbeIterationTime(probeCountTime);
            }
        }
        
        const allocations = probeAllocationsByZone[zoneId] || {};
        const harvestAllocation = allocations.harvest || 0;
        const constructAllocation = allocations.construct || 0;
        
        // Probe-based rates (use state for upgrade factors)
        const miningProbes = totalProbes * harvestAllocation;
        const buildingProbes = totalProbes * constructAllocation;
        
        const probeMiningRate = this.calculateMiningRate(miningProbes, zoneId, state);
        const probeBuildingRate = this.calculateBuildingRate(buildingProbes, state);
        
        // Structure-based rates (use state for upgrade factors)
        const structureMiningRate = this.calculateStructureMiningRate(structuresByZone, zoneId, buildings, state);
        const structureBuildingRate = this.calculateStructureBuildingRate(structuresByZone, zoneId, buildings, state);
        
        return {
            mining: probeMiningRate + structureMiningRate,
            building: probeBuildingRate + structureBuildingRate,
            probeMining: probeMiningRate,
            probeBuilding: probeBuildingRate,
            structureMining: structureMiningRate,
            structureBuilding: structureBuildingRate
        };
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProductionCalculator;
}

