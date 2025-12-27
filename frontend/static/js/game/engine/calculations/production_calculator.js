/**
 * Production Calculator
 * 
 * All rates measured in kg/day
 * - Mining rates
 * - Building rates
 * - Refining rates
 * - Probe production rates
 * 
 * Economic rules are loaded from game_data/economic_rules.json
 */

class ProductionCalculator {
    constructor(orbitalMechanics) {
        this.orbitalMechanics = orbitalMechanics;
        
        // Default values (will be overwritten by economic rules)
        this.BASE_MINING_RATE = 100.0;      // kg/day per probe
        this.BASE_BUILDING_RATE = 20.0;     // kg/day per probe
        this.BASE_PROBE_MASS = 100.0;       // kg per probe
        this.BASE_ISP = 500;                // seconds (base specific impulse)
        this.CROWDING_THRESHOLD = 0.01;     // 1% - penalty starts after this ratio
        this.CROWDING_DECAY_RATE = 4.395;   // Exponential decay constant
        this.GEOMETRIC_SCALING_EXPONENT = Config.STRUCTURE_GEOMETRIC_SCALING_EXPONENT || 3.2;
        
        // Probe count scaling penalty parameters (diminishing returns for probe count)
        this.PROBE_COUNT_BASE_PENALTY = 0.0;     // No penalty per doubling (disabled)
        this.PROBE_COUNT_MIN_PENALTY = 0.0;      // No penalty per doubling (disabled)
        this.PROBE_COUNT_COMPUTE_THRESHOLD = 3.18; // Compute skill level for min penalty
        
        // Global replication scaling penalty parameters (diminishing returns for total probe count)
        this.GLOBAL_REPLICATION_THRESHOLD = 1e12;  // Penalty starts after this many probes
        this.GLOBAL_REPLICATION_HALVING_FACTOR = 0.5;  // Rate halves for each order of magnitude above threshold
        
        // Skill coefficients (loaded from economic rules)
        this.skillCoefficients = null;
        this.economicRules = null;
    }
    
    /**
     * Initialize with economic rules
     * @param {Object} economicRules - Economic rules from data loader
     */
    initializeEconomicRules(economicRules) {
        if (!economicRules) return;
        
        this.economicRules = economicRules;
        
        // Load probe base rates
        if (economicRules.probe) {
            this.BASE_MINING_RATE = economicRules.probe.base_mining_rate_kg_per_day || 100.0;
            this.BASE_BUILDING_RATE = economicRules.probe.base_build_rate_kg_per_day || 20.0;
            this.BASE_PROBE_MASS = economicRules.probe.mass_kg || 100.0;
        }
        
        // Load propulsion parameters
        if (economicRules.propulsion) {
            this.BASE_ISP = economicRules.propulsion.base_isp_seconds || 500;
        }
        
        // Load crowding parameters
        if (economicRules.crowding) {
            this.CROWDING_THRESHOLD = economicRules.crowding.threshold_ratio || 0.01;
            this.CROWDING_DECAY_RATE = economicRules.crowding.decay_rate || 4.395;
        }
        
        // Load structure parameters
        if (economicRules.structures) {
            this.GEOMETRIC_SCALING_EXPONENT = economicRules.structures.geometric_scaling_exponent ?? this.GEOMETRIC_SCALING_EXPONENT;
        }
        
        // Load probe count scaling penalty parameters
        if (economicRules.probe_count_scaling) {
            this.PROBE_COUNT_BASE_PENALTY = economicRules.probe_count_scaling.base_penalty_per_doubling || 0.40;
            this.PROBE_COUNT_MIN_PENALTY = economicRules.probe_count_scaling.min_penalty_per_doubling || 0.01;
            this.PROBE_COUNT_COMPUTE_THRESHOLD = economicRules.probe_count_scaling.compute_skill_threshold || 3.18;
        }
        
        // Load global replication scaling penalty parameters
        if (economicRules.global_replication_scaling) {
            this.GLOBAL_REPLICATION_THRESHOLD = economicRules.global_replication_scaling.threshold || 1e12;
            this.GLOBAL_REPLICATION_HALVING_FACTOR = economicRules.global_replication_scaling.halving_factor || 0.5;
        }
        
        // Load skill coefficients
        this.skillCoefficients = economicRules.skill_coefficients || null;
    }
    
    /**
     * Get skill coefficient for a category
     * @param {string} category - Category name (e.g., 'probe_mining', 'probe_building')
     * @returns {Object|null} Skill coefficients for the category
     */
    getSkillCoefficients(category) {
        if (!this.skillCoefficients) return null;
        return this.skillCoefficients[category] || null;
    }
    
    /**
     * Get probe mass in kg (base value, no upgrades currently affect this)
     * @returns {number} Probe mass in kg
     */
    getProbeMass() {
        return this.BASE_PROBE_MASS;
    }
    
    /**
     * Get base specific impulse (ISP) in seconds
     * @returns {number} Base ISP in seconds
     */
    getBaseIsp() {
        return this.BASE_ISP;
    }
    
    /**
     * Get effective specific impulse with propulsion skill applied
     * @param {Object} skills - Current skills (for propulsion modifier)
     * @returns {number} Effective ISP in seconds
     */
    getEffectiveIsp(skills) {
        const propulsionSkill = skills?.propulsion || 1.0;
        return this.BASE_ISP * propulsionSkill;
    }
    
    /**
     * Get exhaust velocity in m/s based on current propulsion skill
     * @param {Object} skills - Current skills (for propulsion modifier)
     * @returns {number} Exhaust velocity in m/s
     */
    getExhaustVelocity(skills) {
        const g0 = 9.80665; // Standard gravity m/s²
        return this.getEffectiveIsp(skills) * g0;
    }
    
    /**
     * Calculate zone crowding efficiency penalty
     * When probe mass exceeds 1% of original planetary mass, efficiency decreases exponentially.
     * At 1% probe mass: 100% efficiency (no penalty)
     * At 90% probe mass: 2% efficiency (98% reduction)
     * 
     * @param {string} zoneId - Zone identifier
     * @param {Object} state - Game state containing zones data
     * @returns {number} Efficiency factor (0-1), where 1 = no penalty
     */
    calculateZoneCrowdingPenalty(zoneId, state) {
        // Dyson zone is exempt from crowding penalty
        if (this.orbitalMechanics.isDysonZone(zoneId)) {
            return 1.0;
        }
        
        // Get zone data from orbital mechanics (for original mass)
        const zoneData = this.orbitalMechanics.getZone(zoneId);
        if (!zoneData || !zoneData.total_mass_kg || zoneData.total_mass_kg <= 0) {
            return 1.0; // No penalty if zone has no mass data
        }
        
        const originalMass = zoneData.total_mass_kg;
        
        // Get current probe mass in this zone
        const zoneState = state.zones?.[zoneId];
        const probeMass = zoneState?.probe_mass || 0;
        
        // Calculate probe mass ratio
        const probeRatio = probeMass / originalMass;
        
        // No penalty if below threshold
        if (probeRatio <= this.CROWDING_THRESHOLD) {
            return 1.0;
        }
        
        // Exponential decay: efficiency = exp(-k * (ratio - threshold))
        const excessRatio = probeRatio - this.CROWDING_THRESHOLD;
        const efficiency = Math.exp(-this.CROWDING_DECAY_RATE * excessRatio);
        
        // Clamp to reasonable minimum (0.1% efficiency minimum)
        return Math.max(0.001, efficiency);
    }
    
    /**
     * Calculate probe count scaling penalty (diminishing returns for probe count within a zone)
     * Each doubling of probe count reduces efficiency.
     * Formula: efficiency = (1 - penalty_per_doubling)^log2(probe_count)
     * 
     * The penalty_per_doubling is interpolated based on compute skill:
     * - At base compute (1.0): 40% penalty per doubling (so doubling only gives 20% more output)
     * - At max compute (3.18x): 1% penalty per doubling (so doubling gives ~98% more output)
     * 
     * @param {number} probeCount - Total number of probes in the zone
     * @param {Object} skills - Current skills (for compute level)
     * @returns {number} Efficiency factor (0-1), where 1 = no penalty
     */
    calculateProbeCountScalingPenalty(probeCount, skills) {
        // No penalty for 0 or 1 probe
        if (probeCount <= 1) {
            return 1.0;
        }
        
        // Get compute skill (geometric mean of cpu, gpu, interconnect, io_bandwidth)
        const computeSkill = skills?.computer?.total || 1.0;
        
        // Interpolate penalty per doubling based on compute skill
        // At compute 1.0: use base penalty (40%)
        // At compute >= threshold: use min penalty (1%)
        // Linear interpolation between them
        const normalizedCompute = Math.min(1.0, Math.max(0, (computeSkill - 1.0) / (this.PROBE_COUNT_COMPUTE_THRESHOLD - 1.0)));
        const penaltyPerDoubling = this.PROBE_COUNT_BASE_PENALTY - (this.PROBE_COUNT_BASE_PENALTY - this.PROBE_COUNT_MIN_PENALTY) * normalizedCompute;
        
        // Calculate number of doublings: log2(probeCount)
        const doublings = Math.log2(probeCount);
        
        // Efficiency = (1 - penalty)^doublings
        // For example, with 40% penalty and 2 probes (1 doubling): 0.6^1 = 0.6 efficiency
        // With 4 probes (2 doublings): 0.6^2 = 0.36 efficiency
        const efficiencyPerDoubling = 1.0 - penaltyPerDoubling;
        const efficiency = Math.pow(efficiencyPerDoubling, doublings);
        
        // Clamp to reasonable minimum (0.1% efficiency minimum)
        return Math.max(0.001, efficiency);
    }
    
    /**
     * Calculate global replication scaling penalty (diminishing returns for total probe count)
     * After threshold, each order of magnitude (10x) growth halves replication rate.
     * Formula: efficiency = halving_factor^max(0, log10(totalProbes) - log10(threshold))
     * 
     * At 1e12 threshold:
     * - At 1e12: efficiency = 1.0 (no penalty)
     * - At 1e13: efficiency = 0.5 (50% rate)
     * - At 1e14: efficiency = 0.25 (25% rate)
     * - At 5e12: efficiency ≈ 0.62 (smooth interpolation)
     * 
     * @param {number} totalProbes - Total number of probes globally (across all zones)
     * @returns {number} Efficiency factor (0-1), where 1 = no penalty
     */
    calculateGlobalReplicationScalingPenalty(totalProbes) {
        // No penalty if below threshold
        if (totalProbes <= this.GLOBAL_REPLICATION_THRESHOLD) {
            return 1.0;
        }
        
        // Calculate orders of magnitude above threshold
        // log10(totalProbes) - log10(threshold) = log10(totalProbes / threshold)
        const thresholdLog = Math.log10(this.GLOBAL_REPLICATION_THRESHOLD);
        const currentLog = Math.log10(totalProbes);
        const ordersAboveThreshold = currentLog - thresholdLog;
        
        // Efficiency = halving_factor^ordersAboveThreshold
        // e.g., 0.5^1 = 0.5, 0.5^2 = 0.25
        const efficiency = Math.pow(this.GLOBAL_REPLICATION_HALVING_FACTOR, ordersAboveThreshold);
        
        // Clamp to reasonable minimum (0.01% efficiency minimum)
        return Math.max(0.0001, efficiency);
    }
    
    /**
     * Calculate upgrade factor using weighted sum
     * Formula: factor = 1 + Σ(weight_i * (skill_i - 1))
     * @param {Array<{name: string, value: number, weight: number}>|Array<number>} skillInfo - Array of skill info, or legacy array format
     * @param {number} alpha - DEPRECATED: Alpha factor (ignored, kept for API compatibility)
     * @returns {number} Upgrade factor
     */
    calculateTechTreeUpgradeFactor(skillInfo, alpha) {
        if (!skillInfo || skillInfo.length === 0) return 1.0;
        
        // Handle legacy array format (for backward compatibility with fallback code)
        if (Array.isArray(skillInfo) && typeof skillInfo[0] === 'number') {
            // Legacy: array of (coefficient * skill) values
            // Convert to weighted sum approximation
            let bonus = 0;
            for (const val of skillInfo) {
                if (val > 0 && isFinite(val)) {
                    // Approximate: treat as weight * skill, contribution ≈ (val - 1) * normalized_weight
                    bonus += (val - 1.0) * 0.4; // Rough approximation for legacy code
                }
            }
            return 1.0 + bonus;
        }
        
        // New format: array of {name, value, weight} objects
        let bonus = 0;
        for (const { value, weight } of skillInfo) {
            // Skip invalid values
            if (value <= 0 || !isFinite(value)) continue;
            
            // Calculate contribution: weight * (skillValue - 1)
            bonus += weight * (value - 1.0);
        }
        
        return 1.0 + bonus;
    }
    
    /**
     * Calculate upgrade factors for performance and cost (alpha factors deprecated)
     * @param {Array<{name: string, value: number, weight: number}>|Array<number>} skillInfo - Array of skill info
     * @param {number} alphaPerf - DEPRECATED: Performance alpha factor (ignored)
     * @param {number} alphaCost - DEPRECATED: Cost alpha factor (ignored)
     * @returns {Object} {performance: factor, cost: factor}
     */
    calculateUpgradeFactors(skillInfo, alphaPerf, alphaCost) {
        // Both use same weighted sum now (alpha factors deprecated)
        const factor = this.calculateTechTreeUpgradeFactor(skillInfo);
        const performanceFactor = factor;
        const costFactor = factor;
        return {
            performance: performanceFactor,
            cost: costFactor
        };
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
     * Calculate all tech tree upgrade factors once per tick
     * Uses skill coefficients from economic rules if available
     * @param {Object} skills - Current skills from research
     * @param {number} alpha - Tech growth scale factor (from config)
     * @returns {Object} All upgrade factors
     */
    calculateAllUpgradeFactors(skills, alpha) {
        // Use economic rules if available, otherwise fall back to hardcoded values
        if (this.skillCoefficients) {
            const probeMiningCoeffs = this.skillCoefficients.probe_mining;
            const probeBuildingCoeffs = this.skillCoefficients.probe_building;
            const energyGenCoeffs = this.skillCoefficients.energy_generation;
            
            const probeMiningValues = this.buildSkillValues(probeMiningCoeffs, skills);
            const probeBuildValues = this.buildSkillValues(probeBuildingCoeffs, skills);
            const energyGenerationValues = this.buildSkillValues(energyGenCoeffs, skills);
            
            const probeMiningFactor = this.calculateTechTreeUpgradeFactor(probeMiningValues);
            const probeBuildFactor = this.calculateTechTreeUpgradeFactor(probeBuildValues);
            const energyGenerationFactor = this.calculateTechTreeUpgradeFactor(energyGenerationValues);
            
            return {
                probe_mining: probeMiningFactor,
                probe_build: probeBuildFactor,
                probe_replicate: probeBuildFactor,
                factory_replicate: probeBuildFactor,
                refinery_mine: probeMiningFactor,
                energy_generation: energyGenerationFactor
            };
        }
        
        // Fallback to hardcoded values for backward compatibility
        const roboticSkill = skills.robotic || skills.manipulation || 1.0;
        const computerSkill = skills.computer?.total || 1.0;
        const locomotionSkill = skills.locomotion || 1.0;
        const energyTransportSkill = skills.energy_transport || 1.0;
        const acdsSkill = skills.acds || 1.0;
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
        const probeMiningFactor = this.calculateTechTreeUpgradeFactor(probeMiningValues);
        
        // Probe build: 0.3*acds, 1.0*robotic, 0.35*computer, 1.0*production, 0.2*energy_transport
        const probeBuildValues = [
            0.3 * acdsSkill,
            1.0 * roboticSkill,
            0.35 * computerSkill,
            1.0 * productionSkill,
            0.2 * energyTransportSkill
        ];
        const probeBuildFactor = this.calculateTechTreeUpgradeFactor(probeBuildValues);
        
        // Energy generation
        const energyGenerationValues = [
            1.0 * energyCollectionSkill,
            0.5 * energyTransportSkill,
            0.3 * computerSkill
        ];
        const energyGenerationFactor = this.calculateTechTreeUpgradeFactor(energyGenerationValues);
        
        return {
            probe_mining: probeMiningFactor,
            probe_build: probeBuildFactor,
            probe_replicate: probeBuildFactor,
            factory_replicate: probeBuildFactor,
            refinery_mine: probeMiningFactor,
            energy_generation: energyGenerationFactor
        };
    }
    
    /**
     * Calculate mining rate for a zone (returns MASS mining rate, not metal)
     * Uses pre-calculated upgrade factor from state
     * Applies zone crowding penalty based on probe mass vs original planetary mass
     * Applies probe count scaling penalty (diminishing returns for probe count)
     * @param {number} probeCount - Number of probes allocated to mining
     * @param {string} zoneId - Zone identifier
     * @param {Object} state - Game state (to get pre-calculated upgrade factors)
     * @param {number} totalZoneProbes - Total probes in the zone (optional, for probe count scaling)
     * @returns {number} Mass mining rate in kg/day
     */
    calculateMiningRate(probeCount, zoneId, state, totalZoneProbes = null) {
        if (probeCount <= 0) return 0;
        
        // Base rate per probe (mass extraction rate)
        // Apply mining rate bonus from starting skill points
        const miningRateBonus = state.skill_bonuses?.mining_rate_bonus || 0;
        const baseRatePerProbe = this.BASE_MINING_RATE + miningRateBonus;
        
        // Get upgrade factor from state (prefer new system, fallback to legacy)
        const upgradeFactor = state.upgrade_factors?.probe?.mining?.performance || 
                             state.tech_upgrade_factors?.probe_mining || 1.0;
        
        // Apply upgrade factor
        const ratePerProbe = baseRatePerProbe * upgradeFactor;
        
        // Apply zone multiplier
        const zoneMultiplier = this.orbitalMechanics.getZoneMiningMultiplier(zoneId);
        
        // Apply crowding penalty (diminishing returns based on probe mass vs planetary mass)
        const crowdingEfficiency = this.calculateZoneCrowdingPenalty(zoneId, state);
        
        // Apply probe count scaling penalty (diminishing returns based on probe count in zone)
        // Use total zone probes if provided, otherwise calculate from state
        const zoneProbeCount = totalZoneProbes ?? this.getZoneProbeCount(zoneId, state);
        const skills = state.skills || {};
        const probeCountEfficiency = this.calculateProbeCountScalingPenalty(zoneProbeCount, skills);
        
        // Total rate = probes * rate_per_probe * zone_multiplier * crowding_efficiency * probe_count_efficiency
        return probeCount * ratePerProbe * zoneMultiplier * crowdingEfficiency * probeCountEfficiency;
    }
    
    /**
     * Get total probe count in a zone from state
     * @param {string} zoneId - Zone identifier
     * @param {Object} state - Game state
     * @returns {number} Total probe count in zone
     */
    getZoneProbeCount(zoneId, state) {
        const zoneProbes = state.probes_by_zone?.[zoneId] || {};
        let total = 0;
        for (const probeType in zoneProbes) {
            total += zoneProbes[probeType] || 0;
        }
        return total;
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
     * Applies zone crowding penalty based on probe mass vs original planetary mass
     * Applies probe count scaling penalty (diminishing returns for probe count)
     * @param {number} probeCount - Number of probes allocated to building
     * @param {Object} state - Game state (to get pre-calculated upgrade factors)
     * @param {string} zoneId - Zone identifier (optional, for crowding penalty)
     * @param {number} totalZoneProbes - Total probes in the zone (optional, for probe count scaling)
     * @returns {number} Building rate in kg/day
     */
    calculateBuildingRate(probeCount, state, zoneId = null, totalZoneProbes = null) {
        if (probeCount <= 0) return 0;
        
        // Base rate per probe
        // Apply replication rate bonus from starting skill points
        const replicationRateBonus = state.skill_bonuses?.replication_rate_bonus || 0;
        const baseRatePerProbe = this.BASE_BUILDING_RATE + replicationRateBonus;
        
        // Get upgrade factor from state (prefer new system, fallback to legacy)
        const upgradeFactor = state.upgrade_factors?.probe?.building?.performance || 
                             state.tech_upgrade_factors?.probe_build || 1.0;
        
        // Apply crowding penalty if zone is specified
        let crowdingEfficiency = 1.0;
        if (zoneId) {
            crowdingEfficiency = this.calculateZoneCrowdingPenalty(zoneId, state);
        }
        
        // Apply probe count scaling penalty (diminishing returns based on probe count in zone)
        let probeCountEfficiency = 1.0;
        if (zoneId) {
            const zoneProbeCount = totalZoneProbes ?? this.getZoneProbeCount(zoneId, state);
            const skills = state.skills || {};
            probeCountEfficiency = this.calculateProbeCountScalingPenalty(zoneProbeCount, skills);
        }
        
        // Total rate = probes * base_rate * upgrade_factor * crowding_efficiency * probe_count_efficiency
        return probeCount * baseRatePerProbe * upgradeFactor * crowdingEfficiency * probeCountEfficiency;
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
     * Applies zone crowding penalty based on probe mass vs original planetary mass
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
                
                // Apply geometric scaling to benefits (same exponent as cost scaling)
                const geometricFactor = Math.pow(count, this.GEOMETRIC_SCALING_EXPONENT);
                const effectiveRate = baseRate * geometricFactor * zoneEfficiency * perfFactor;
                totalRate += effectiveRate;
            } else if (building.effects?.metal_production_per_day) {
                // Legacy system fallback
                const baseRate = building.effects.metal_production_per_day;
                const upgradeFactor = state.tech_upgrade_factors?.refinery_mine || 1.0;
                const zoneEfficiency = building.orbital_efficiency?.[zoneId] || 1.0;
                // Apply geometric scaling to benefits (same exponent as cost scaling)
                const geometricFactor = Math.pow(count, this.GEOMETRIC_SCALING_EXPONENT);
                const effectiveRate = baseRate * geometricFactor * zoneEfficiency * upgradeFactor;
                totalRate += effectiveRate;
            }
        }
        
        // Apply crowding penalty (diminishing returns based on probe mass vs planetary mass)
        const crowdingEfficiency = this.calculateZoneCrowdingPenalty(zoneId, state);
        
        return totalRate * crowdingEfficiency;
    }
    
    /**
     * Calculate structure building rate (from factory structures)
     * Uses new multiplier-based system with structure upgrade factors
     * Applies zone crowding penalty based on probe mass vs original planetary mass
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
                
                // Apply geometric scaling to benefits (same exponent as cost scaling)
                const geometricFactor = Math.pow(count, this.GEOMETRIC_SCALING_EXPONENT);
                const effectiveRate = baseRate * geometricFactor * zoneEfficiency * perfFactor;
                totalRate += effectiveRate;
            } else if (building.effects?.probe_production_per_day || building.effects?.structure_production_per_day) {
                // Legacy system fallback
                const baseRate = building.effects?.probe_production_per_day || 
                               building.effects?.structure_production_per_day || 0;
                const upgradeFactor = state.tech_upgrade_factors?.factory_replicate || 1.0;
                const zoneEfficiency = building.orbital_efficiency?.[zoneId] || 1.0;
                // Apply geometric scaling to benefits (same exponent as cost scaling)
                const geometricFactor = Math.pow(count, this.GEOMETRIC_SCALING_EXPONENT);
                const effectiveRate = baseRate * geometricFactor * zoneEfficiency * upgradeFactor;
                totalRate += effectiveRate;
            }
        }
        
        // Apply crowding penalty (diminishing returns based on probe mass vs planetary mass)
        const crowdingEfficiency = this.calculateZoneCrowdingPenalty(zoneId, state);
        
        return totalRate * crowdingEfficiency;
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
        
        // Pass totalProbes to rate calculations for probe count scaling penalty
        const probeMiningRate = this.calculateMiningRate(miningProbes, zoneId, state, totalProbes);
        const probeBuildingRate = this.calculateBuildingRate(buildingProbes, state, zoneId, totalProbes);
        
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
    
    /**
     * Calculate methalox production from refineries in a zone
     * @param {Object} structuresByZone - Structures by zone {zoneId: {buildingId: count}}
     * @param {string} zoneId - Zone identifier
     * @param {Object} buildings - Building definitions
     * @param {Object} state - Game state with skills and upgrade factors
     * @returns {number} Methalox production rate in kg/day
     */
    calculateMethaloxProduction(structuresByZone, zoneId, buildings, state) {
        const zoneStructures = structuresByZone[zoneId] || {};
        const allBuildings = buildings?.buildings || buildings || {};
        const building = allBuildings['methalox_refinery'];
        
        if (!building) return 0;
        
        const count = zoneStructures['methalox_refinery'] || 0;
        if (count === 0) return 0;
        
        // Base production rate per refinery
        const baseRate = building.production_rate_kg_per_day || 100;
        
        // Simple linear scaling: no exponential performance or skill modifiers
        // Total production = base rate * count
        const totalProduction = baseRate * count;
        
        return totalProduction;
    }
    
    /**
     * Calculate upgrade factor from skill coefficients
     * @param {string} category - Category name (e.g., 'methalox_production')
     * @param {Object} skills - Current skills
     * @returns {number} Upgrade factor
     */
    calculateUpgradeFactorFromCoefficients(category, skills) {
        if (!this.skillCoefficients) return 1.0;
        
        const coefficients = this.skillCoefficients[category];
        if (!coefficients) return 1.0;
        
        let bonus = 0;
        for (const [skillName, weight] of Object.entries(coefficients)) {
            if (skillName === 'description') continue;
            
            const skillValue = skills[skillName] || 1.0;
            if (skillValue > 0 && isFinite(skillValue)) {
                bonus += weight * (skillValue - 1.0);
            }
        }
        
        return 1.0 + bonus;
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProductionCalculator;
}

