/**
 * Unified Technology Physics Calculator
 *
 * Implements real physics calculations for all 6 technology trees:
 * 1. Propulsion - ISP, delta-v, rocket equation
 * 2. Electromagnetics - B-fields, mass driver velocity, mining
 * 3. Thermal - Heat rejection, power density limits
 * 4. Materials - Mass reduction, tensile strength
 * 5. Power - W/kg, efficiency, solar limits
 * 6. Autonomy - Crowding penalties, coordination
 *
 * Cross-effects between trees are calculated automatically.
 */

class TechPhysics {
    constructor() {
        // Physical constants
        this.G0 = 9.81;                    // Standard gravity (m/s²)
        this.C = 299792458;                // Speed of light (m/s)
        this.MU_0 = 1.2566370614e-6;       // Permeability of free space (H/m)
        this.STEFAN_BOLTZMANN = 5.67e-8;   // Stefan-Boltzmann constant (W/(m²·K⁴))
        this.SOLAR_FLUX_EARTH = 1361;      // Solar constant at 1 AU (W/m²)

        // Tech tree data (loaded from JSON)
        this.trees = {
            propulsion: null,
            electromagnetics: null,
            thermal: null,
            materials: null,
            power: null,
            autonomy: null
        };

        // Current tier levels
        this.tiers = {
            propulsion: 1,
            electromagnetics: 1,
            thermal: 1,
            materials: 1,
            power: 1,
            autonomy: 1
        };

        // Cached cross-effects
        this._crossEffectsCache = null;
        this._crossEffectsCacheValid = false;
    }

    /**
     * Load all tech tree data
     */
    async loadAllTrees() {
        const treeNames = ['propulsion', 'electromagnetics', 'thermal', 'materials', 'power', 'autonomy'];

        await Promise.all(treeNames.map(async (name) => {
            try {
                const response = await fetch(`/game_data/tech_trees/${name}.json`);
                if (response.ok) {
                    this.trees[name] = await response.json();
                }
            } catch (error) {
                console.warn(`Failed to load ${name} tech tree:`, error);
            }
        }));

        console.log('TechPhysics loaded', Object.keys(this.trees).filter(k => this.trees[k]).length, 'trees');
    }

    /**
     * Set current tier for a tree
     */
    setTier(treeName, tier) {
        if (this.tiers[treeName] !== tier) {
            this.tiers[treeName] = tier;
            this._crossEffectsCacheValid = false;
        }
    }

    /**
     * Get tier info from loaded data
     */
    getTierInfo(treeName, tier) {
        const tree = this.trees[treeName];
        if (!tree || !tree.tiers) return null;
        return tree.tiers.find(t => t.tier === tier);
    }

    /**
     * Get max tier number in a tree
     */
    getMaxTier(treeName) {
        const tree = this.trees[treeName];
        if (!tree || !tree.tiers || tree.tiers.length === 0) return 1;
        return Math.max(...tree.tiers.map(t => t.tier));
    }

    /**
     * Get current tier info
     * If current tier exceeds max tier, return the last (highest) tier info
     */
    getCurrentTierInfo(treeName) {
        const currentTier = Math.floor(this.tiers[treeName] || 1);
        const maxTier = this.getMaxTier(treeName);

        // Clamp to max tier if we've completed all research
        const effectiveTier = Math.min(currentTier, maxTier);

        return this.getTierInfo(treeName, effectiveTier);
    }

    // ========================================
    // CROSS-EFFECTS CALCULATION
    // ========================================

    /**
     * Calculate all cross-effects between trees
     */
    getCrossEffects() {
        if (this._crossEffectsCacheValid) {
            return this._crossEffectsCache;
        }

        this._crossEffectsCache = {
            // Materials effects
            materials_factor: this.getMaterialsMassFactor(),
            materials_strength: this.getMaterialsStrengthFactor(),

            // Thermal effects
            thermal_factor: this.getThermalCapacityFactor(),
            thermal_ntr_boost: this.getThermalNTRBoost(),

            // Electromagnetics effects
            em_tier: this.tiers.electromagnetics,
            em_b_field: this.getEMBFieldTesla(),
            em_efficiency: this.getEMEfficiency(),

            // Power effects
            power_factor: this.getPowerDensityFactor(),
            power_solar_limit_au: this.getSolarLimitAU(),

            // Autonomy effects
            autonomy_crowding_penalty: this.getCrowdingPenaltyPercent(),
            autonomy_efficiency_1e12: this.getEfficiencyAt1e12()
        };

        this._crossEffectsCacheValid = true;
        return this._crossEffectsCache;
    }

    // ========================================
    // PROPULSION PHYSICS
    // ========================================

    /**
     * Get ISP for current propulsion tier
     */
    getPropulsionISP() {
        const tierInfo = this.getCurrentTierInfo('propulsion');
        if (!tierInfo || !tierInfo.physics) return 65; // Cold gas baseline
        return tierInfo.physics.isp_seconds || 65;
    }

    /**
     * Calculate exhaust velocity from ISP
     */
    exhaustVelocity(isp) {
        return isp * this.G0;
    }

    /**
     * Tsiolkovsky rocket equation
     */
    rocketEquation(exhaustVelocity, massRatio) {
        if (massRatio <= 1) return 0;
        return exhaustVelocity * Math.log(massRatio);
    }

    /**
     * Calculate probe delta-v capacity with cross-effects
     */
    getProbeDeltaV() {
        const tierInfo = this.getCurrentTierInfo('propulsion');
        if (!tierInfo) return { deltaV_km_s: 0.7, isp: 65 };

        // Check for non-reaction drives (Pais, Alcubierre)
        if (tierInfo.physics.mechanism === 'inertial_mass_reduction' ||
            tierInfo.physics.mechanism === 'metric_engineering') {
            return {
                deltaV_km_s: tierInfo.physics.effective_delta_v_km_s || tierInfo.derived_effects.delta_v_capacity_km_s,
                isp: null,
                mechanism: tierInfo.physics.mechanism
            };
        }

        let isp = tierInfo.physics.isp_seconds;
        const crossEffects = this.getCrossEffects();

        // Thermal boost for nuclear thermal rockets
        if (tierInfo.id.includes('nuclear_thermal')) {
            isp *= crossEffects.thermal_ntr_boost;
        }

        // EM boost for electric propulsion
        if (['ion_hall_effect', 'vasimr', 'mpd_thruster', 'nuclear_electric'].includes(tierInfo.id)) {
            isp *= (1 + 0.05 * crossEffects.em_tier);
        }

        // Calculate mass ratio with materials bonus
        const baseMassRatio = 3.0;
        const effectiveMassRatio = baseMassRatio / crossEffects.materials_factor;

        // Rocket equation
        const ve = this.exhaustVelocity(isp);
        const deltaV = this.rocketEquation(ve, effectiveMassRatio);

        return {
            deltaV_km_s: deltaV / 1000,
            deltaV_m_s: deltaV,
            isp: isp,
            exhaust_velocity_km_s: ve / 1000,
            mass_ratio: effectiveMassRatio
        };
    }

    // ========================================
    // ELECTROMAGNETICS PHYSICS
    // ========================================

    /**
     * Get maximum B-field for current EM tier
     */
    getEMBFieldTesla() {
        const tierInfo = this.getCurrentTierInfo('electromagnetics');
        if (!tierInfo || !tierInfo.physics) return 1.5;
        return tierInfo.physics.b_max_tesla || 1.5;
    }

    /**
     * Get EM system efficiency
     */
    getEMEfficiency() {
        const tierInfo = this.getCurrentTierInfo('electromagnetics');
        if (!tierInfo || !tierInfo.physics) return 0.35;
        return tierInfo.physics.efficiency || 0.35;
    }

    /**
     * Calculate mass driver muzzle velocity
     * v = √(2 × η × E / m) limited by B-field
     */
    getMassDriverVelocity(energyJoules = 5e9, projectileMassKg = 100) {
        const crossEffects = this.getCrossEffects();
        const B = crossEffects.em_b_field;
        const efficiency = crossEffects.em_efficiency;

        // Energy-limited velocity
        const vEnergy = Math.sqrt(2 * efficiency * energyJoules / projectileMassKg);

        // B-field limited velocity (simplified)
        // F_max = B²A/(2μ₀), assuming 1 m² effective area
        const Fmax = (B * B * 1) / (2 * this.MU_0);
        const barrelLength = 1000; // 1 km barrel
        const aMax = Fmax / projectileMassKg;
        const vMagnetic = Math.sqrt(2 * aMax * barrelLength);

        // Thermal limit from thermal tree
        const thermalLimit = crossEffects.thermal_factor * 100; // km/s

        // Take minimum of limits
        const velocity = Math.min(vEnergy, vMagnetic, thermalLimit * 1000);

        return {
            velocity_m_s: velocity,
            velocity_km_s: velocity / 1000,
            b_field_tesla: B,
            efficiency: efficiency,
            limiting_factor: velocity === vEnergy ? 'energy' :
                            velocity === vMagnetic ? 'magnetic' : 'thermal'
        };
    }

    /**
     * Get mining efficiency bonus from EM
     */
    getMiningBonus() {
        const tierInfo = this.getCurrentTierInfo('electromagnetics');
        if (!tierInfo || !tierInfo.derived_effects) return 1.0;
        return tierInfo.derived_effects.mining_bonus || 1.0;
    }

    // ========================================
    // THERMAL PHYSICS
    // ========================================

    /**
     * Get thermal capacity factor (relative to baseline)
     */
    getThermalCapacityFactor() {
        const tierInfo = this.getCurrentTierInfo('thermal');
        if (!tierInfo || !tierInfo.derived_effects) return 1.0;
        return tierInfo.derived_effects.power_capacity_factor || 1.0;
    }

    /**
     * Get thermal boost for NTR engines
     */
    getThermalNTRBoost() {
        const tierInfo = this.getCurrentTierInfo('thermal');
        if (!tierInfo || !tierInfo.derived_effects) return 1.0;
        return tierInfo.derived_effects.ntr_temp_boost || 1.0;
    }

    /**
     * Get heat rejection power density
     */
    getHeatRejectionPowerDensity() {
        const tierInfo = this.getCurrentTierInfo('thermal');
        if (!tierInfo || !tierInfo.physics) return 400;
        return tierInfo.physics.power_density_w_m2 || 400;
    }

    /**
     * Get mass penalty per kW of heat rejection
     */
    getThermalMassPenalty() {
        const tierInfo = this.getCurrentTierInfo('thermal');
        if (!tierInfo || !tierInfo.physics) return 5.0;
        return tierInfo.physics.mass_penalty_kg_kw || 5.0;
    }

    // ========================================
    // MATERIALS PHYSICS
    // ========================================

    /**
     * Get mass reduction factor (1.0 = baseline, 0.5 = 50% lighter)
     */
    getMaterialsMassFactor() {
        const tierInfo = this.getCurrentTierInfo('materials');
        if (!tierInfo || !tierInfo.derived_effects) return 1.0;
        return tierInfo.derived_effects.mass_factor || 1.0;
    }

    /**
     * Get strength factor relative to steel
     */
    getMaterialsStrengthFactor() {
        const tierInfo = this.getCurrentTierInfo('materials');
        if (!tierInfo || !tierInfo.derived_effects) return 1.0;
        return tierInfo.derived_effects.strength_factor || 1.0;
    }

    /**
     * Get tensile strength in GPa
     */
    getTensileStrengthGPa() {
        const tierInfo = this.getCurrentTierInfo('materials');
        if (!tierInfo || !tierInfo.physics) return 1.0;
        return tierInfo.physics.tensile_strength_gpa || 1.0;
    }

    /**
     * Check if space elevator is viable with current materials
     */
    isSpaceElevatorViable() {
        const tierInfo = this.getCurrentTierInfo('materials');
        if (!tierInfo || !tierInfo.derived_effects) return false;
        return tierInfo.derived_effects.space_elevator_viable === true ||
               tierInfo.derived_effects.space_elevator_optimal === true;
    }

    // ========================================
    // POWER PHYSICS
    // ========================================

    /**
     * Get power density factor relative to baseline
     */
    getPowerDensityFactor() {
        const tierInfo = this.getCurrentTierInfo('power');
        if (!tierInfo || !tierInfo.derived_effects) return 1.0;
        return tierInfo.derived_effects.power_factor || 1.0;
    }

    /**
     * Get power density in W/kg
     */
    getPowerDensityWkg() {
        const tierInfo = this.getCurrentTierInfo('power');
        if (!tierInfo || !tierInfo.physics) return 50;
        return tierInfo.physics.power_density_w_kg || 50;
    }

    /**
     * Get solar limit in AU (Infinity if solar-independent)
     */
    getSolarLimitAU() {
        const tierInfo = this.getCurrentTierInfo('power');
        if (!tierInfo || !tierInfo.physics) return 1.5;
        if (tierInfo.physics.solar_independent) return Infinity;
        if (!tierInfo.derived_effects) return 1.5;
        const limit = tierInfo.derived_effects.solar_limit_au;
        return limit === 'unlimited' ? Infinity : (limit || 1.5);
    }

    /**
     * Check if power source is solar-independent
     */
    isSolarIndependent() {
        const tierInfo = this.getCurrentTierInfo('power');
        if (!tierInfo || !tierInfo.physics) return false;
        return tierInfo.physics.solar_independent === true;
    }

    /**
     * Calculate available power at given distance from Sun
     * @param {number} distanceAU - Distance from Sun in AU
     * @param {number} collectorAreaM2 - Solar collector area in m²
     */
    getAvailablePower(distanceAU, collectorAreaM2 = 100) {
        const tierInfo = this.getCurrentTierInfo('power');
        if (!tierInfo || !tierInfo.physics) {
            // Default silicon PV
            const flux = this.SOLAR_FLUX_EARTH / (distanceAU * distanceAU);
            return flux * collectorAreaM2 * 0.22;
        }

        if (tierInfo.physics.solar_independent) {
            // Non-solar power - use power density
            const powerDensity = tierInfo.physics.power_density_w_kg;
            const massKg = collectorAreaM2 * 2; // Rough estimate
            return powerDensity * massKg;
        }

        // Solar-dependent power
        const flux = this.SOLAR_FLUX_EARTH / (distanceAU * distanceAU);
        const efficiency = tierInfo.physics.efficiency_percent / 100;
        return flux * collectorAreaM2 * efficiency;
    }

    // ========================================
    // AUTONOMY PHYSICS
    // ========================================

    /**
     * Get crowding penalty percent per doubling of probe count
     */
    getCrowdingPenaltyPercent() {
        const tierInfo = this.getCurrentTierInfo('autonomy');
        if (!tierInfo || !tierInfo.physics) return 0.5;
        return tierInfo.physics.crowding_penalty_percent || 0.5;
    }

    /**
     * Calculate efficiency at given probe count
     */
    getEfficiencyAtProbeCount(probeCount) {
        const penalty = this.getCrowdingPenaltyPercent() / 100;
        const doublings = Math.log2(Math.max(1, probeCount));
        return Math.pow(1 - penalty, doublings) * 100;
    }

    /**
     * Get efficiency at 10^12 probes (common benchmark)
     */
    getEfficiencyAt1e12() {
        return this.getEfficiencyAtProbeCount(1e12);
    }

    /**
     * Get latency tolerance
     */
    getLatencyTolerance() {
        const tierInfo = this.getCurrentTierInfo('autonomy');
        if (!tierInfo || !tierInfo.physics) return '10 seconds';

        const p = tierInfo.physics;
        if (p.latency_tolerance_seconds) return `${p.latency_tolerance_seconds} seconds`;
        if (p.latency_tolerance_hours) return `${p.latency_tolerance_hours} hours`;
        if (p.latency_tolerance_days) return `${p.latency_tolerance_days} days`;
        if (p.latency_tolerance === 'unlimited') return 'unlimited';
        return 'unknown';
    }

    // ========================================
    // DISPLAY FORMATTING
    // ========================================

    /**
     * Format physics values for UI display
     */
    formatForDisplay(treeName) {
        const tierInfo = this.getCurrentTierInfo(treeName);
        if (!tierInfo) return 'Unknown tier';

        const crossEffects = this.getCrossEffects();

        switch (treeName) {
            case 'propulsion': {
                const dv = this.getProbeDeltaV();
                if (dv.mechanism) {
                    return `${tierInfo.name} [${dv.deltaV_km_s.toExponential(1)} km/s effective Δv]`;
                }
                const ispStr = Math.round(dv.isp);
                const veStr = dv.exhaust_velocity_km_s.toFixed(1);
                const dvStr = dv.deltaV_km_s >= 1000 ?
                    dv.deltaV_km_s.toExponential(1) :
                    dv.deltaV_km_s.toFixed(1);
                return `${ispStr}s ISP (${veStr} km/s exhaust) [${dvStr} km/s probe Δv]`;
            }

            case 'electromagnetics': {
                const B = crossEffects.em_b_field;
                const eff = (crossEffects.em_efficiency * 100).toFixed(0);
                const mv = this.getMassDriverVelocity();
                return `${B}T max field (${eff}% eff) [${mv.velocity_km_s.toFixed(0)} km/s mass driver]`;
            }

            case 'thermal': {
                const density = this.getHeatRejectionPowerDensity() / 1000; // kW/m²
                const mass = this.getThermalMassPenalty();
                const factor = crossEffects.thermal_factor;
                return `${density.toFixed(0)} kW/m² (${mass} kg/kW) [${factor.toFixed(0)}× power capacity]`;
            }

            case 'materials': {
                const strength = this.getTensileStrengthGPa();
                const massFactor = crossEffects.materials_factor;
                const strengthFactor = crossEffects.materials_strength;
                return `${strength} GPa (${massFactor}× mass) [${strengthFactor}× strength]`;
            }

            case 'power': {
                const density = this.getPowerDensityWkg();
                const tierPhysics = tierInfo.physics;
                const eff = tierPhysics.efficiency_percent || 'N/A';
                const limit = this.isSolarIndependent() ? 'unlimited' :
                    tierInfo.derived_effects?.solar_limit_zone || 'Mars';
                return `${density} W/kg (${eff}% eff) [${limit} range]`;
            }

            case 'autonomy': {
                const penalty = crossEffects.autonomy_crowding_penalty;
                const latency = this.getLatencyTolerance();
                const eff = crossEffects.autonomy_efficiency_1e12.toFixed(1);
                return `${penalty}% penalty/2× (${latency}) [${eff}% @ 10¹² probes]`;
            }

            default:
                return tierInfo.name;
        }
    }

    /**
     * Get complete physics summary for all trees
     */
    getFullSummary() {
        return {
            propulsion: {
                tier: this.tiers.propulsion,
                info: this.getCurrentTierInfo('propulsion'),
                deltaV: this.getProbeDeltaV(),
                display: this.formatForDisplay('propulsion')
            },
            electromagnetics: {
                tier: this.tiers.electromagnetics,
                info: this.getCurrentTierInfo('electromagnetics'),
                massDriver: this.getMassDriverVelocity(),
                miningBonus: this.getMiningBonus(),
                display: this.formatForDisplay('electromagnetics')
            },
            thermal: {
                tier: this.tiers.thermal,
                info: this.getCurrentTierInfo('thermal'),
                capacityFactor: this.getThermalCapacityFactor(),
                display: this.formatForDisplay('thermal')
            },
            materials: {
                tier: this.tiers.materials,
                info: this.getCurrentTierInfo('materials'),
                massFactor: this.getMaterialsMassFactor(),
                strengthFactor: this.getMaterialsStrengthFactor(),
                spaceElevator: this.isSpaceElevatorViable(),
                display: this.formatForDisplay('materials')
            },
            power: {
                tier: this.tiers.power,
                info: this.getCurrentTierInfo('power'),
                powerDensity: this.getPowerDensityWkg(),
                solarIndependent: this.isSolarIndependent(),
                display: this.formatForDisplay('power')
            },
            autonomy: {
                tier: this.tiers.autonomy,
                info: this.getCurrentTierInfo('autonomy'),
                crowdingPenalty: this.getCrowdingPenaltyPercent(),
                efficiencyAt1e12: this.getEfficiencyAt1e12(),
                display: this.formatForDisplay('autonomy')
            },
            crossEffects: this.getCrossEffects()
        };
    }

    /**
     * Map to legacy 12-skill system for backward compatibility
     */
    getLegacySkills() {
        const ce = this.getCrossEffects();
        const dv = this.getProbeDeltaV();

        // Propulsion -> legacy propulsion multiplier (ISP ratio)
        const propMult = dv.isp ? dv.isp / 300 : dv.deltaV_km_s / 10;

        // EM -> legacy transmission/conversion
        const emMult = ce.em_b_field / 2;

        // Thermal -> legacy conversion
        const thermMult = ce.thermal_factor;

        // Materials -> legacy materials/structures
        const matMult = 1 / ce.materials_factor;

        // Power -> legacy generation/storage
        const powMult = this.getPowerDensityWkg() / 50;

        // Autonomy -> legacy intelligence skills
        const autoMult = 0.5 / (ce.autonomy_crowding_penalty / 100);

        return {
            // Dexterity
            propulsion: propMult,
            robotics: (emMult + matMult) / 2,
            materials: matMult,
            structures: (matMult + thermMult) / 2,

            // Energy
            generation: powMult,
            storage_density: (powMult + emMult) / 2,
            conversion: (thermMult + powMult) / 2,
            transmission: emMult,

            // Intelligence
            architecture: autoMult,
            processor: autoMult,
            memory: autoMult,
            sensors: (autoMult + emMult) / 2
        };
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TechPhysics;
}

// Global instance for browser
if (typeof window !== 'undefined') {
    window.TechPhysics = TechPhysics;
}
