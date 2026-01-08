/**
 * Propulsion Physics Calculator
 *
 * Implements real physics calculations for propulsion systems:
 * - Tsiolkovsky rocket equation for delta-v
 * - Exhaust velocity from ISP
 * - Cross-effects from materials, thermal, and power research
 *
 * All values use SI units internally, converted for display.
 */

class PropulsionPhysics {
    constructor() {
        // Physical constants
        this.G0 = 9.81;  // Standard gravity (m/s²)
        this.C = 299792458;  // Speed of light (m/s)

        // Base values (without any research)
        this.BASE_ISP = 65;  // Cold gas thrusters (seconds)
        this.BASE_MASS_RATIO = 3.0;  // Typical probe wet/dry mass ratio

        // Reference ISP for legacy multiplier calculation
        this.REFERENCE_ISP = 300;  // seconds

        // Propulsion tier data (loaded from JSON)
        this.tierData = null;
    }

    /**
     * Load propulsion tier data from JSON
     * @param {Object} data - Propulsion tech tree data
     */
    loadTierData(data) {
        this.tierData = data;
    }

    /**
     * Calculate exhaust velocity from ISP
     * v_e = ISP × g₀
     *
     * @param {number} isp - Specific impulse in seconds
     * @returns {number} Exhaust velocity in m/s
     */
    exhaustVelocityFromISP(isp) {
        return isp * this.G0;
    }

    /**
     * Calculate ISP from exhaust velocity
     * ISP = v_e / g₀
     *
     * @param {number} exhaustVelocity - Exhaust velocity in m/s
     * @returns {number} Specific impulse in seconds
     */
    ispFromExhaustVelocity(exhaustVelocity) {
        return exhaustVelocity / this.G0;
    }

    /**
     * Tsiolkovsky rocket equation
     * Δv = v_e × ln(m_0 / m_f)
     *
     * @param {number} exhaustVelocity - Exhaust velocity in m/s
     * @param {number} massRatio - Initial mass / final mass (wet/dry)
     * @returns {number} Delta-v in m/s
     */
    rocketEquation(exhaustVelocity, massRatio) {
        if (massRatio <= 1) return 0;
        return exhaustVelocity * Math.log(massRatio);
    }

    /**
     * Calculate delta-v from ISP and mass ratio
     * Δv = ISP × g₀ × ln(mass_ratio)
     *
     * @param {number} isp - Specific impulse in seconds
     * @param {number} massRatio - Wet/dry mass ratio
     * @returns {number} Delta-v in m/s
     */
    deltaVFromISP(isp, massRatio = null) {
        const mr = massRatio || this.BASE_MASS_RATIO;
        const ve = this.exhaustVelocityFromISP(isp);
        return this.rocketEquation(ve, mr);
    }

    /**
     * Calculate delta-v in km/s (for display)
     * @param {number} isp - Specific impulse in seconds
     * @param {number} massRatio - Wet/dry mass ratio
     * @returns {number} Delta-v in km/s
     */
    deltaVKmS(isp, massRatio = null) {
        return this.deltaVFromISP(isp, massRatio) / 1000;
    }

    /**
     * Calculate required mass ratio for given delta-v
     * m_0/m_f = e^(Δv/v_e)
     *
     * @param {number} deltaV - Required delta-v in m/s
     * @param {number} exhaustVelocity - Exhaust velocity in m/s
     * @returns {number} Required mass ratio
     */
    requiredMassRatio(deltaV, exhaustVelocity) {
        return Math.exp(deltaV / exhaustVelocity);
    }

    /**
     * Calculate propellant mass fraction
     * f = 1 - 1/mass_ratio = (m_0 - m_f)/m_0
     *
     * @param {number} massRatio - Wet/dry mass ratio
     * @returns {number} Propellant mass fraction (0-1)
     */
    propellantFraction(massRatio) {
        return 1 - (1 / massRatio);
    }

    /**
     * Get effective mass ratio with materials research bonus
     * Better materials reduce dry mass, improving the ratio
     *
     * @param {number} baseMassRatio - Base wet/dry mass ratio
     * @param {number} materialsFactor - Materials mass reduction (0-1, lower is better)
     * @returns {number} Effective mass ratio
     */
    effectiveMassRatio(baseMassRatio, materialsFactor) {
        // Dry mass is reduced by materials factor
        // If base ratio is 3:1 and materials reduces dry mass by 20%:
        // New ratio = wet_mass / (dry_mass × 0.8) = 3 / 0.8 = 3.75
        if (materialsFactor <= 0 || materialsFactor > 1) return baseMassRatio;
        return baseMassRatio / materialsFactor;
    }

    /**
     * Calculate probe delta-v capacity for a given propulsion tier
     * Includes cross-effects from other technologies
     *
     * @param {number} tier - Propulsion tier (1-18)
     * @param {Object} crossEffects - Effects from other tech trees
     * @returns {Object} Delta-v capacity and breakdown
     */
    calculateProbeDeltaV(tier, crossEffects = {}) {
        // Use clamped tier to get last valid tier if beyond max
        const tierInfo = this.getTierInfoClamped(tier);
        if (!tierInfo) {
            return { deltaV_km_s: 0.7, breakdown: { error: 'Invalid tier' } };
        }

        // Base values from tier
        let isp = tierInfo.physics.isp_seconds;
        const baseExhaustVelocity = this.exhaustVelocityFromISP(isp);

        // Apply thermal bonus for thermal rockets (tiers 6-7)
        let thermalBonus = 1.0;
        if (tierInfo.id.includes('nuclear_thermal') && crossEffects.thermal_factor) {
            // ISP scales with sqrt(temperature) for thermal rockets
            thermalBonus = Math.sqrt(crossEffects.thermal_factor);
            isp *= thermalBonus;
        }

        // Apply EM bonus for electric propulsion (tiers 8-11)
        let emBonus = 1.0;
        if (['ion_hall_effect', 'vasimr', 'mpd_thruster', 'nuclear_electric'].includes(tierInfo.id)) {
            if (crossEffects.em_tier) {
                emBonus = 1 + 0.05 * crossEffects.em_tier;
                // EM improves efficiency, effectively boosting ISP
                isp *= emBonus;
            }
        }

        // Calculate effective mass ratio with materials bonus
        let massRatio = this.BASE_MASS_RATIO;
        let materialsBonus = 1.0;
        if (crossEffects.materials_factor && crossEffects.materials_factor < 1) {
            massRatio = this.effectiveMassRatio(this.BASE_MASS_RATIO, crossEffects.materials_factor);
            materialsBonus = massRatio / this.BASE_MASS_RATIO;
        }

        // Special handling for non-reaction drives (tiers 17-18)
        if (tierInfo.physics.mechanism === 'inertial_mass_reduction' ||
            tierInfo.physics.mechanism === 'metric_engineering') {
            // These bypass rocket equation - use fixed effective delta-v
            const effectiveDeltaV = tierInfo.physics.effective_delta_v_km_s ||
                                    tierInfo.derived_effects.delta_v_capacity_km_s;
            return {
                deltaV_km_s: effectiveDeltaV,
                deltaV_m_s: effectiveDeltaV * 1000,
                isp_seconds: null,
                exhaust_velocity_km_s: null,
                mass_ratio: null,
                mechanism: tierInfo.physics.mechanism,
                breakdown: {
                    base: effectiveDeltaV,
                    mechanism: tierInfo.physics.mechanism,
                    note: 'Non-reaction drive - fixed capability'
                }
            };
        }

        // Calculate final delta-v
        const finalExhaustVelocity = this.exhaustVelocityFromISP(isp);
        const deltaV_m_s = this.rocketEquation(finalExhaustVelocity, massRatio);
        const deltaV_km_s = deltaV_m_s / 1000;

        return {
            deltaV_km_s: deltaV_km_s,
            deltaV_m_s: deltaV_m_s,
            isp_seconds: isp,
            exhaust_velocity_km_s: finalExhaustVelocity / 1000,
            mass_ratio: massRatio,
            breakdown: {
                base_isp: tierInfo.physics.isp_seconds,
                thermal_bonus: thermalBonus,
                em_bonus: emBonus,
                materials_bonus: materialsBonus,
                final_isp: isp,
                final_mass_ratio: massRatio
            }
        };
    }

    /**
     * Get tier info from loaded data
     * @param {number} tier - Tier number (1-18)
     * @returns {Object|null} Tier data or null
     */
    getTierInfo(tier) {
        if (!this.tierData || !this.tierData.tiers) return null;
        return this.tierData.tiers.find(t => t.tier === tier);
    }

    /**
     * Get max tier number available
     * @returns {number} Maximum tier number
     */
    getMaxTier() {
        if (!this.tierData || !this.tierData.tiers || this.tierData.tiers.length === 0) return 1;
        return Math.max(...this.tierData.tiers.map(t => t.tier));
    }

    /**
     * Get tier info, clamped to max available tier
     * Returns last tier if requested tier exceeds max
     * @param {number} tier - Tier number
     * @returns {Object|null} Tier data (returns last tier if beyond max)
     */
    getTierInfoClamped(tier) {
        const maxTier = this.getMaxTier();
        const effectiveTier = Math.min(tier, maxTier);
        return this.getTierInfo(effectiveTier);
    }

    /**
     * Get tier info by ID
     * @param {string} id - Tier ID (e.g., 'methalox_staged_combustion')
     * @returns {Object|null} Tier data or null
     */
    getTierById(id) {
        if (!this.tierData || !this.tierData.tiers) return null;
        return this.tierData.tiers.find(t => t.id === id);
    }

    /**
     * Calculate legacy skill multiplier for backward compatibility
     * Maps ISP to the old multiplier system
     *
     * @param {number} isp - Current ISP in seconds
     * @returns {number} Legacy multiplier (1.0 at 300s ISP)
     */
    legacyMultiplier(isp) {
        return isp / this.REFERENCE_ISP;
    }

    /**
     * Format physics values for UI display
     * Format: "380s ISP (3.73 km/s exhaust) [10.8 km/s probe Δv]"
     *
     * @param {number} tier - Propulsion tier
     * @param {Object} crossEffects - Cross-effects from other trees
     * @returns {string} Formatted display string
     */
    formatForDisplay(tier, crossEffects = {}) {
        const result = this.calculateProbeDeltaV(tier, crossEffects);
        // Use clamped version to get last tier if beyond max
        const tierInfo = this.getTierInfoClamped(tier);

        if (!tierInfo) return 'Unknown tier';

        // Special format for exotic drives
        if (result.mechanism) {
            if (result.mechanism === 'inertial_mass_reduction') {
                return `Inertial mass reduction [${result.deltaV_km_s.toExponential(2)} km/s effective Δv]`;
            }
            if (result.mechanism === 'metric_engineering') {
                return `Warp field (${tierInfo.physics.effective_velocity_c}c) [${result.deltaV_km_s.toExponential(2)} km/s effective Δv]`;
            }
        }

        // Standard format for reaction drives
        const isp = Math.round(result.isp_seconds);
        const exhaust = result.exhaust_velocity_km_s.toFixed(2);
        const deltaV = result.deltaV_km_s >= 1000
            ? result.deltaV_km_s.toExponential(2)
            : result.deltaV_km_s.toFixed(1);

        return `${isp}s ISP (${exhaust} km/s exhaust) [${deltaV} km/s probe Δv]`;
    }

    /**
     * Calculate transfer time factor based on delta-v capacity
     * Higher delta-v = faster transfers (can use more energetic trajectories)
     *
     * @param {number} deltaV_km_s - Available delta-v in km/s
     * @param {number} requiredDeltaV_km_s - Minimum delta-v for Hohmann transfer
     * @returns {number} Time factor (1.0 = Hohmann, <1 = faster)
     */
    transferTimeFactor(deltaV_km_s, requiredDeltaV_km_s) {
        if (deltaV_km_s <= requiredDeltaV_km_s) {
            // Insufficient delta-v - can't even do Hohmann
            return Infinity;
        }

        // Excess delta-v allows faster trajectories
        const excess = deltaV_km_s - requiredDeltaV_km_s;
        const excessFraction = excess / requiredDeltaV_km_s;

        // Logarithmic scaling - diminishing returns
        // Double the required delta-v = ~40% faster
        // 10× the required delta-v = ~70% faster
        const speedup = 1 + Math.log(1 + excessFraction);
        return 1 / speedup;
    }

    /**
     * Get all tiers with calculated values
     * @param {Object} crossEffects - Cross-effects from other trees
     * @returns {Array} Array of tier objects with calculated values
     */
    getAllTiersWithCalculations(crossEffects = {}) {
        if (!this.tierData || !this.tierData.tiers) return [];

        return this.tierData.tiers.map(tier => {
            const calc = this.calculateProbeDeltaV(tier.tier, crossEffects);
            return {
                ...tier,
                calculated: calc,
                display: this.formatForDisplay(tier.tier, crossEffects),
                legacy_multiplier: calc.isp_seconds
                    ? this.legacyMultiplier(calc.isp_seconds)
                    : calc.deltaV_km_s / 10  // Approximate for exotic drives
            };
        });
    }

    /**
     * Calculate research cost for a tier
     * @param {number} tier - Tier number
     * @returns {Object} Cost breakdown
     */
    getResearchCost(tier) {
        const tierInfo = this.getTierInfo(tier);
        if (!tierInfo || !tierInfo.research) {
            return { total: 0, per_tranche: 0, tranches: 0 };
        }

        return {
            total: tierInfo.research.base_cost_eflop_days,
            per_tranche: tierInfo.research.cost_per_tranche,
            tranches: tierInfo.research.tranches
        };
    }

    /**
     * Validate physics calculations against expected values
     * Used for testing and verification
     *
     * @returns {Array} Array of validation results
     */
    validateCalculations() {
        const tests = [
            { isp: 300, expected_ve: 2943, name: 'Reference ISP' },
            { isp: 450, expected_ve: 4415, name: 'Hydrolox' },
            { isp: 900, expected_ve: 8829, name: 'NTR' },
            { isp: 3500, expected_ve: 34335, name: 'Ion' }
        ];

        return tests.map(test => {
            const actual = this.exhaustVelocityFromISP(test.isp);
            const error = Math.abs(actual - test.expected_ve) / test.expected_ve;
            return {
                name: test.name,
                isp: test.isp,
                expected: test.expected_ve,
                actual: Math.round(actual),
                error_pct: (error * 100).toFixed(2),
                pass: error < 0.01
            };
        });
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PropulsionPhysics;
}

// Global instance for browser
if (typeof window !== 'undefined') {
    window.PropulsionPhysics = PropulsionPhysics;
}
