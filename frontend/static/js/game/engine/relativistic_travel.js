/**
 * Relativistic Travel Calculator
 *
 * Calculates travel times for constant acceleration drives
 * using proper relativistic mechanics with time dilation.
 *
 * Uses the "midpoint flip" maneuver: accelerate to midpoint,
 * flip and decelerate to destination.
 *
 * Key formulas (natural units where c=1, then convert):
 *   Ship time (proper): τ = (2c/a) * acosh(1 + a*d/(2c²))
 *   Earth time: t = (2c/a) * sinh(aτ/(2c))
 *   Max velocity: v_max = c * tanh(aτ/(2c))
 */

class RelativisticTravel {
    constructor() {
        // Physical constants
        this.C = 299792458;           // Speed of light (m/s)
        this.C_KM_S = 299792.458;     // Speed of light (km/s)
        this.G = 9.81;                // Standard gravity (m/s²)
        this.LY_M = 9.461e15;         // Light-year in meters
        this.YEAR_S = 31557600;       // Year in seconds (365.25 days)
        this.DAY_S = 86400;           // Day in seconds

        // Drive tiers - acceleration in g's
        this.driveTiers = [
            { tier: 1, name: "Chemical Torch", accel_g: 0.001, description: "Continuous low thrust" },
            { tier: 2, name: "Ion Drive Array", accel_g: 0.01, description: "Electric propulsion bank" },
            { tier: 3, name: "Fusion Torch", accel_g: 0.1, description: "Direct fusion drive" },
            { tier: 4, name: "Antimatter Drive", accel_g: 0.5, description: "Matter-antimatter annihilation" },
            { tier: 5, name: "Conversion Drive", accel_g: 1.0, description: "1g constant - comfortable" },
            { tier: 6, name: "High-G Torch", accel_g: 2.0, description: "2g sustained acceleration" },
            { tier: 7, name: "Military Drive", accel_g: 5.0, description: "Combat acceleration" },
            { tier: 8, name: "Inertial Damped", accel_g: 10.0, description: "With inertial compensation" },
            { tier: 9, name: "Pais Field Drive", accel_g: 100.0, description: "Mass reduction enabled" },
            { tier: 10, name: "Metric Drive", accel_g: 1000.0, description: "Spacetime manipulation" }
        ];
    }

    /**
     * Calculate ship time (proper time) for a journey
     * Using midpoint flip maneuver
     *
     * @param {number} distance_ly - Distance in light-years
     * @param {number} accel_g - Acceleration in g's
     * @returns {number} Ship time in years
     */
    calculateShipTime(distance_ly, accel_g) {
        const d = distance_ly * this.LY_M;  // Distance in meters
        const a = accel_g * this.G;          // Acceleration in m/s²
        const c = this.C;

        // τ = (2c/a) * acosh(1 + a*d/(2c²))
        const argument = 1 + (a * d) / (2 * c * c);
        const tau_seconds = (2 * c / a) * Math.acosh(argument);

        return tau_seconds / this.YEAR_S;
    }

    /**
     * Calculate Earth time (coordinate time) for a journey
     *
     * @param {number} distance_ly - Distance in light-years
     * @param {number} accel_g - Acceleration in g's
     * @returns {number} Earth time in years
     */
    calculateEarthTime(distance_ly, accel_g) {
        const d = distance_ly * this.LY_M;
        const a = accel_g * this.G;
        const c = this.C;

        // First get ship time
        const tau = this.calculateShipTime(distance_ly, accel_g) * this.YEAR_S;

        // t = (2c/a) * sinh(a*τ/(2c))
        const t_seconds = (2 * c / a) * Math.sinh((a * tau) / (2 * c));

        return t_seconds / this.YEAR_S;
    }

    /**
     * Calculate maximum velocity reached at midpoint
     *
     * @param {number} distance_ly - Distance in light-years
     * @param {number} accel_g - Acceleration in g's
     * @returns {number} Max velocity as fraction of c
     */
    calculateMaxVelocity(distance_ly, accel_g) {
        const tau = this.calculateShipTime(distance_ly, accel_g) * this.YEAR_S;
        const a = accel_g * this.G;
        const c = this.C;

        // v_max = c * tanh(a*τ/(2c))
        const v_max_fraction = Math.tanh((a * tau) / (2 * c));

        return v_max_fraction;
    }

    /**
     * Calculate time dilation factor (gamma) at max velocity
     *
     * @param {number} v_fraction - Velocity as fraction of c
     * @returns {number} Lorentz gamma factor
     */
    calculateGamma(v_fraction) {
        if (v_fraction >= 1) return Infinity;
        return 1 / Math.sqrt(1 - v_fraction * v_fraction);
    }

    /**
     * Get full travel calculation with all details
     *
     * @param {number} distance_ly - Distance in light-years
     * @param {number} accel_g - Acceleration in g's
     * @returns {Object} Complete travel data
     */
    calculateTravel(distance_ly, accel_g) {
        const shipTime_years = this.calculateShipTime(distance_ly, accel_g);
        const earthTime_years = this.calculateEarthTime(distance_ly, accel_g);
        const maxVelocity_c = this.calculateMaxVelocity(distance_ly, accel_g);
        const gamma = this.calculateGamma(maxVelocity_c);

        // Convert to days for game time
        const shipTime_days = shipTime_years * 365.25;
        const earthTime_days = earthTime_years * 365.25;

        // Time saved due to dilation
        const timeDilation = earthTime_years / shipTime_years;

        return {
            distance_ly,
            accel_g,
            ship_time: {
                years: shipTime_years,
                days: shipTime_days,
                formatted: this.formatTime(shipTime_years)
            },
            earth_time: {
                years: earthTime_years,
                days: earthTime_days,
                formatted: this.formatTime(earthTime_years)
            },
            max_velocity: {
                fraction_c: maxVelocity_c,
                percent_c: maxVelocity_c * 100,
                km_s: maxVelocity_c * this.C_KM_S
            },
            gamma: gamma,
            time_dilation: timeDilation,
            relativistic: maxVelocity_c > 0.1  // Significant relativistic effects
        };
    }

    /**
     * Format time nicely for display
     * @param {number} years - Time in years
     * @returns {string} Formatted string
     */
    formatTime(years) {
        if (years < 0.01) {
            const days = years * 365.25;
            if (days < 1) {
                return `${(days * 24).toFixed(1)} hours`;
            }
            return `${days.toFixed(1)} days`;
        } else if (years < 1) {
            const months = years * 12;
            return `${months.toFixed(1)} months`;
        } else if (years < 100) {
            return `${years.toFixed(2)} years`;
        } else if (years < 10000) {
            return `${years.toFixed(0)} years`;
        } else {
            return `${(years / 1000).toFixed(1)}k years`;
        }
    }

    /**
     * Generate data points for time dilation curve
     * Used for the NGE-style visualization
     *
     * @param {number} maxDistance_ly - Max distance to plot
     * @param {number} accel_g - Acceleration to use
     * @param {number} points - Number of data points
     * @returns {Array} Array of {distance, shipTime, earthTime, velocity}
     */
    generateDilationCurve(maxDistance_ly, accel_g, points = 100) {
        const curve = [];

        for (let i = 0; i <= points; i++) {
            const distance = (i / points) * maxDistance_ly;
            if (distance === 0) {
                curve.push({ distance: 0, shipTime: 0, earthTime: 0, velocity: 0 });
                continue;
            }

            const travel = this.calculateTravel(distance, accel_g);
            curve.push({
                distance: distance,
                shipTime: travel.ship_time.years,
                earthTime: travel.earth_time.years,
                velocity: travel.max_velocity.fraction_c
            });
        }

        return curve;
    }

    /**
     * Get drive tier info
     * @param {number} tier - Drive tier (1-10)
     * @returns {Object} Drive info
     */
    getDriveTier(tier) {
        return this.driveTiers.find(d => d.tier === tier) || this.driveTiers[0];
    }

    /**
     * Get all drive tiers
     * @returns {Array} All drive tiers
     */
    getAllDriveTiers() {
        return this.driveTiers;
    }

    /**
     * Map propulsion research tier to drive tier
     * @param {number} propulsionTier - Research propulsion tier (1-18)
     * @returns {number} Drive tier (1-10)
     */
    propulsionToDriveTier(propulsionTier) {
        // Map 18 propulsion tiers to 10 drive tiers
        if (propulsionTier <= 5) return 1;      // Chemical
        if (propulsionTier <= 8) return 2;      // Ion
        if (propulsionTier <= 11) return 3;     // Fusion
        if (propulsionTier <= 13) return 4;     // Antimatter
        if (propulsionTier <= 14) return 5;     // 1g
        if (propulsionTier <= 15) return 6;     // 2g
        if (propulsionTier <= 16) return 7;     // 5g (Military)
        if (propulsionTier === 17) return 8;    // Inertial Damped
        if (propulsionTier >= 18) return 10;    // Metric Drive
        return 1;
    }
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RelativisticTravel;
}

// Global for browser
if (typeof window !== 'undefined') {
    window.RelativisticTravel = RelativisticTravel;
}
