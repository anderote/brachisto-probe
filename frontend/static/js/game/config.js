/** 
 * Game configuration constants
 * 
 * IMPORTANT: These are FALLBACK values only!
 * The primary source of truth is game_data/economic_rules.json
 * These values are only used if economic_rules.json is not loaded.
 * 
 * See game_data/economic_rules.json for:
 * - Base probe rates (mining, building, energy production/consumption)
 * - Skill coefficients for production calculations
 * - Alpha factors for tech tree scaling
 * - Crowding penalty parameters
 * - Structure base energy costs
 */
class Config {
    // Game configuration
    static DYSON_SPHERE_TARGET_MASS = 20e22;  // kg, base value (can be reduced by research)
    static INITIAL_PROBES = 1;
    static INITIAL_METAL = 100;  // kg
    static INITIAL_ENERGY = 0;  // watts - energy cannot be stored, use constant supply
    static CONSTANT_ENERGY_SUPPLY = 100000;  // watts (100kW) - constant power supply
    static TICKS_PER_SECOND = 60;
    
    // Time system: fundamental unit is 1 day
    // At 60 fps and time speed 1: 1 day per second (86400 seconds per day)
    // At 100x speed: 100 days per second
    static SECONDS_PER_DAY = 86400;  // seconds in one day
    
    // Base skill values (starting values before research)
    // Propulsion: specific impulse in seconds
    static BASE_PROPULSION_ISP = 500;  // seconds (starting specific impulse)
    
    // Dyson sphere energy production constants
    static DYSON_POWER_PER_SQ_M = 5000;  // watts per square meter (5 kW/m²)
    static DYSON_MASS_PER_SQ_M = 2.0;  // kg per square meter
    static DYSON_POWER_PER_KG = 2500;  // watts per kg (5 kW/kg = 5 kW/m² / 1 kg/m²)
    
    // All rates are per-day (fundamental time unit)
    // FALLBACK values - see game_data/economic_rules.json for primary values
    static PROBE_MASS = 100;  // kg per probe
    static PROBE_HARVEST_RATE = 100.0;  // kg/day per probe (base mining rate)
    static PROBE_BUILD_RATE = 20.0;  // kg/day per probe (base build power)
    static PROBE_BASE_COMPUTE_PFLOPS = 100;  // PFLOPs per probe (base onboard compute)
    
    // Probe energy values - FALLBACKS (see economic_rules.json probe section)
    static PROBE_ENERGY_PRODUCTION = 100000;  // 100 kW per probe (base generation)
    static PROBE_ENERGY_COST_MINING = 500000;  // 500 kW per mining probe
    static PROBE_ENERGY_COST_RECYCLE_SLAG = 300000;  // 300 kW per recycling probe
    
    // Structure energy values - FALLBACKS (see economic_rules.json structures section)
    static STRUCTURE_BASE_ENERGY_COST = 250000;  // 250 kW base for structure energy multipliers
    
    // Structure geometric scaling exponent - FALLBACK (see economic_rules.json structures section)
    // Controls how cost and output scale with structure count
    // Cost of building N = baseCost * N^exponent, Output of N structures = baseOutput * N^exponent
    static STRUCTURE_GEOMETRIC_SCALING_EXPONENT = 3.2;
    
    // Alpha factors for tech tree scaling (performance benefits)
    // FALLBACK values - see game_data/economic_rules.json for primary values
    static ALPHA_STRUCTURE_FACTOR = 0.8;   // Structures benefit most
    static ALPHA_PROBE_FACTOR = 0.75;      // Probes benefit slightly less
    static ALPHA_DYSON_FACTOR = 0.55;      // Dyson benefits least per skill
    
    // Base cost factor (costs grow slower than benefits)
    static ALPHA_COST_FACTOR = 0.25;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
}

