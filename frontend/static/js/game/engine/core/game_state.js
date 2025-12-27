/**
 * Game State - Single source of truth structure
 * 
 * Immutable snapshot of game state at a point in time
 * All calculations read from and write to this structure
 */

/**
 * Create initial game state
 * @param {Object} config - Initial configuration
 * @returns {Object} Initial game state
 */
function createInitialGameState(config = {}) {
    // Extract skill bonuses from config
    const skillBonuses = config.skill_bonuses || {};
    
    return {
        // Time
        time: 0.0,              // Days elapsed
        tick: 0,                // Tick count
        
        // Resources (global)
        metal: config.initial_metal || 0,        // kg (start with 0 metal)
        slag: 0.0,                                 // kg
        intelligence: 0.0,                         // FLOPS (instantaneous production rate)
        
        // Base energy production (player starts with this - like a small solar array)
        base_energy_production: config.base_energy_production || 100000,  // 100 kW base production
        
        // Starting skill bonuses (from skill point allocation at game start)
        // These provide permanent bonuses on top of base values
        skill_bonuses: {
            mass_driver_dv_bonus: skillBonuses.mass_driver_dv_bonus || 0,    // km/s added to mass driver velocity
            probe_dv_bonus: skillBonuses.probe_dv_bonus || 0,                // km/s added to probe delta-v
            mining_rate_bonus: skillBonuses.mining_rate_bonus || 0,          // kg/day added to base mining rate
            replication_rate_bonus: skillBonuses.replication_rate_bonus || 0, // kg/day added to base build rate
            compute_bonus: skillBonuses.compute_bonus || 1.0,                // Multiplier for intelligence skills
            energy_bonus: skillBonuses.energy_bonus || 1.0,                  // Multiplier for energy skills
            dexterity_bonus: skillBonuses.dexterity_bonus || 1.0             // Multiplier for dexterity skills
        },
        
        // Tech Tree - New unified research/skills system
        tech_tree: {
            // Research state: treeId -> { tierId -> { tranches_completed, progress, enabled, ... } }
            research_state: {},
            // Cached skill values (updated when research changes)
            skills_cache: {},
            // Cached category factors (geometric mean of trees in each category)
            category_factors: {
                dexterity: 1.0,
                intelligence: 1.0,
                energy: 1.0
            }
        },
        
        // Core Skills (computed from tech_tree, kept for backward compatibility)
        skills: {
            propulsion: 1.0,        // ISP multiplier
            thrust: 1.0,            // Thrust power
            locomotion: 1.0,        // Movement efficiency
            manipulation: 1.0,      // Robotic manipulation
            robotic: 1.0,           // Dexterity multiplier (alias for manipulation)
            strength: 1.0,          // Actuator strength
            materials: 1.0,         // Materials science
            production: 1.0,        // Mining/building efficiency
            recycling: 0.75,        // Slag-to-metal conversion (75% base)
            dyson_construction: 1.0,
            
            // Energy skills
            solar_pv: 1.0,
            radiator: 1.0,
            heat_pump: 1.0,
            battery_density: 1.0,
            energy_converter: 1.0,
            energy_collection: 1.0, // Alias for solar_pv
            energy_storage: 1.0,    // Alias for battery_density
            energy_transport: 1.0,
            
            // Intelligence skills
            cpu: 1.0,
            gpu: 1.0,
            interconnect: 1.0,
            io_bandwidth: 1.0,
            sensors: 1.0,
            learning: 1.0,
            research_rate: 1.0,
            
            // ACDS (Autonomous Control and Decision Systems)
            acds: 1.0,
            
            computer: {
                processing: 1.0,
                gpu: 1.0,
                memory: 1.0,
                interface: 1.0,
                interconnect: 1.0,
                transmission: 1.0,
                total: 1.0          // Geometric mean
            }
        },
        
        // Probes by zone and type
        probes_by_zone: {},
        
        // Probe allocations by zone (fractions 0-1)
        probe_allocations_by_zone: {},
        
        // Zone mass limits (slider values as fractions 0-1)
        // Controls max probe/structure mass ratio for replication/construction
        // Format: { zoneId: { replicate: 0-1, construct: 0-1, recycle_probes: 0-1 } }
        zone_mass_limits: {},
        
        // Structures by zone
        structures_by_zone: {},
        
        // Structure construction queue (enabled buildings per zone)
        // Format: ["zoneId::buildingId", ...]
        enabled_construction: [],
        
        // Structure construction progress (kg built so far)
        // Format: { "zoneId::buildingId": progress_kg }
        structure_construction_progress: {},
        
        // Structure construction target costs (fixed when construction starts)
        // Format: { "zoneId::buildingId": target_cost_kg }
        structure_construction_targets: {},
        
        // Structure construction start times (for minimum build time tracking)
        // Format: { "zoneId::buildingId": start_time_days }
        structure_construction_start_times: {},
        
        // Zone resources
        // zones[zoneId] = {
        //   mass_remaining: number,    // Un-mined mass (decreases as mining happens)
        //   stored_metal: number,      // Metal stored locally in this zone (for construction)
        //   probe_mass: number,        // Mass of all probes in zone
        //   structure_mass: number,    // Mass of all structures in zone
        //   slag_mass: number,         // Mass of slag in zone
        //   methalox: number,          // Mass of methalox fuel in zone
        //   depleted: boolean          // True when mass_remaining <= 0
        // }
        zones: {},
        
        // Research progress
        research: {},
        
        // Dyson sphere
        dyson_sphere: {
            target_mass: config.dyson_target_mass || 20e22,  // kg
            mass: 0,  // kg - Start at 0% complete
            progress: 0           // 0-1 - Start at 0% complete
        },
        
        // Active transfers
        active_transfers: [],
        
        // Tech tree upgrade factors (calculated once per tick)
        tech_upgrade_factors: {
            probe_mining: 1.0,        // Upgrade factor for probe mining
            probe_build: 1.0,         // Upgrade factor for probe building/construction
            probe_replicate: 1.0,     // Upgrade factor for probe replication
            factory_replicate: 1.0,   // Upgrade factor for factory probe production
            refinery_mine: 1.0,       // Upgrade factor for refinery/mining structure metal production
            energy_generation: 1.0,    // Upgrade factor for energy structure generation
            dyson_build: 1.0          // Upgrade factor for dyson construction 
        },
        
        // Production rates (for UI display)
        rates: {
            metal_mining: 0,          // kg/day
            metal_refining: 0,        // kg/day
            energy_production: 0,     // watts
            energy_consumption: 0,    // watts
            intelligence_production: 0, // FLOPS
            probe_production: 0,      // probes/day
            dyson_construction: 0,    // kg/day
            structure_construction: {} // kg/day by structure
        },
        
        // Construction progress (legacy - kept for backward compatibility)
        construction_progress: {
            probes: {},               // {probeType: kg}
            structures: {}           // {zoneId: {structureId: kg}}
        },
        
        // Derived values (pre-calculated per zone, then summed to totals)
        derived: {
            zones: {},              // {zoneId: {probe_count, probe_mass, structure_count, ...}}
            totals: {                // Sums of all zone values
                probe_count: 0,
                probe_mass: 0,
                structure_count: 0,
                structure_mass: 0,
                metal_mined_rate: 0,
                metal_refined_rate: 0,
                slag_produced_rate: 0,
                metal_consumed_rate: 0,
                methalox_production_rate: 0,
                energy_produced: 0,
                energy_consumed: 0,
                energy_net: 0,
                intelligence_produced: 0,
                probes_mining: 0,
                probes_replicating: 0,
                probes_constructing: 0,
                probes_dyson: 0,
                probes_transit: 0,
                dyson_mass_rate: 0
            }
        },
        
        // Cumulative statistics (running totals since game start)
        cumulative_stats: {
            metal_spent: 0,           // Total kg metal consumed (probes, structures, dyson)
            energy_spent: 0,          // Total J energy consumed
            flops_spent: 0,           // Total FLOPS spent on research
            probes_built: 0,          // Total probes constructed
            structures_built: 0,      // Total structures constructed
            dyson_mass_added: 0       // Total kg added to Dyson sphere
        },
        
        // Historical data points for plotting (sampled periodically)
        // Each entry: { time, metal_spent, energy_spent, flops_spent, probes_built }
        stats_history: [],
        stats_history_last_sample: 0  // Last time a sample was recorded (in days)
    };
}

/**
 * Create a deep copy of game state (for immutability)
 * @param {Object} state - Game state to copy
 * @returns {Object} Deep copy of state
 */
function cloneGameState(state) {
    return JSON.parse(JSON.stringify(state));
}

/**
 * Freeze game state to make it immutable
 * @param {Object} state - Game state to freeze
 * @returns {Object} Frozen state
 */
function freezeGameState(state) {
    return Object.freeze(cloneGameState(state));
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        createInitialGameState,
        cloneGameState,
        freezeGameState
    };
}

