/** Game configuration constants */
class Config {
    // Game configuration
    static DYSON_SPHERE_TARGET_MASS = 20e22;  // kg, base value (can be reduced by research)
    static INITIAL_PROBES = 1;
    static INITIAL_METAL = 0;  // kg (start with 0 metal)
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
    static PROBE_MASS = 100;  // kg per probe
    static PROBE_HARVEST_RATE = 100.0;  // kg/day per probe (base mining rate - mines 100kg mass per day)
    static PROBE_BUILD_RATE = 20.0;  // kg/day per probe (base build power)
    static PROBE_ENERGY_CONSUMPTION = 250000;  // watts (250kW) - base rate for buildings (constructing rate)
    
    // Alpha factors for tech tree scaling (performance benefits)
    // Higher alpha = more benefit from research
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

