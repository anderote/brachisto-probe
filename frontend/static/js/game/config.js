/** Game configuration constants */
class Config {
    // Game configuration
    static DYSON_SPHERE_TARGET_MASS = 5e21;  // kg, scaled realistic value
    static INITIAL_PROBES = 1;
    static INITIAL_METAL = 1000;  // kg
    static INITIAL_ENERGY = 0;  // watts - energy cannot be stored, use constant supply
    static CONSTANT_ENERGY_SUPPLY = 1000000;  // watts (1MW) - constant power supply
    static TICKS_PER_SECOND = 60;
    static PROBE_MASS = 10;  // kg per probe
    static PROBE_HARVEST_RATE = 1.0;  // kg/s per probe (total material mined)
    static PROBE_BUILD_RATE = 0.1;  // kg/s per constructing probe (0.1 kg/s base build speed)
    static PROBE_ENERGY_CONSUMPTION = 100000;  // watts (100kW) per probe
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
}

