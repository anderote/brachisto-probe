/** Static Probe class for accessing probe properties */
class Probe {
    /**
     * Get probe data by type
     * @param {string} probeType - The probe type ID (e.g., 'probe', 'miner_probe')
     * @returns {Object|null} Probe data object or null if not found
     */
    static getData(probeType) {
        if (!window.gameDataLoader) {
            // Silently return null - default values will be used by getProperty
            return null;
        }
        const probes = window.gameDataLoader.getProbes();
        for (const probe of probes) {
            if (probe.id === probeType) {
                return probe;
            }
        }
        return null;
    }
    
    /**
     * Get a specific property from probe data
     * @param {string} probeType - The probe type ID
     * @param {string} property - The property name (e.g., 'base_cost_metal', 'base_dexterity')
     * @param {*} defaultValue - Default value if property not found
     * @returns {*} The property value or defaultValue
     */
    static getProperty(probeType, property, defaultValue = null) {
        const probeData = Probe.getData(probeType);
        if (!probeData) {
            return defaultValue;
        }
        return probeData[property] !== undefined ? probeData[property] : defaultValue;
    }
    
    /**
     * Get base cost metal for a probe type
     * @param {string} probeType - The probe type ID
     * @returns {number} Metal cost per probe
     */
    static getMetalCost(probeType) {
        return Probe.getProperty(probeType, 'base_cost_metal', Config.PROBE_MASS);
    }
    
    /**
     * Get base dexterity for a probe type
     * @param {string} probeType - The probe type ID
     * @returns {number} Base dexterity value
     */
    static getBaseDexterity(probeType) {
        return Probe.getProperty(probeType, 'base_dexterity', 1.0);
    }
    
    /**
     * Get base energy cost for a probe type
     * @param {string} probeType - The probe type ID
     * @returns {number} Energy cost per probe
     */
    static getEnergyCost(probeType) {
        return Probe.getProperty(probeType, 'base_cost_energy', 0);
    }
    
    /**
     * Get effects for a probe type
     * @param {string} probeType - The probe type ID
     * @returns {Object} Effects object or empty object
     */
    static getEffects(probeType) {
        return Probe.getProperty(probeType, 'effects', {});
    }
    
    /**
     * Get prerequisites for a probe type
     * @param {string} probeType - The probe type ID
     * @returns {Array} Prerequisites array or empty array
     */
    static getPrerequisites(probeType) {
        return Probe.getProperty(probeType, 'prerequisites', []);
    }
}

/** Core game engine for simulation - JavaScript port */
class GameEngine {
    constructor(sessionId, config = {}) {
        this.sessionId = sessionId;
        this.config = config;
        this.dataLoader = gameDataLoader;
        
        // Game state
        this.tickCount = 0;
        this.time = 0.0; // days (fundamental time unit)
        
        // Resources
        this.energy = config.initial_energy !== undefined ? config.initial_energy : Config.INITIAL_ENERGY;
        this.metal = config.initial_metal !== undefined ? config.initial_metal : Config.INITIAL_METAL;
        // Intelligence/FLOPS is a production rate, not accumulated storage
        // We keep this for display purposes only (shows current rate, not accumulated)
        this.intelligence = 0.0; // Will be updated to show current production rate for UI
        this.dexterity = 0.0; // Will be calculated after probes are initialized
        this.slag = 0.0;
        this.energyStored = 0.0; // Energy stored in watt-days
        this.lastDysonConstructionRate = 0.0; // Throttled Dyson construction rate from last tick (for display)
        
        // Throttling flags for UI
        this.isEnergyLimited = false;
        this.isMetalLimited = false;
        
        // Probes by zone and type: {zoneId: {probe_type: count}}
        // Probes are now built at specific orbital zones
        this.probesByZone = {};
        
        // Probe allocations per zone: {zoneId: {harvest: {...}, construct: {...}, dyson: {...}}}
        // Global allocation sliders still apply, but probes are distributed across zones
        this.probeAllocationsByZone = {};
        
        // Legacy: keep global probe counts for backward compatibility during transition
        // Note: This is kept for backward compatibility but should not be used for new games
        // All probes are now tracked in probesByZone
        const initialProbes = config.initial_probes !== undefined ? config.initial_probes : Config.INITIAL_PROBES;
        this.probes = {
            'probe': 0  // Start with 0 - probes are tracked in probesByZone instead
        };
        
        // Legacy probe allocations (will be replaced by zone-specific)
        this.probeAllocations = {
            'harvest': {'probe': 1},
            'construct': {'probe': 1},
            'research': {'probe': 0},
            'dyson': {'probe': 1}
        };
        
        // Default zone for initial probes (Mercury)
        this.defaultZone = 'earth';
        
        // Factory production levels: {building_id: percentage (0-100)}
        this.factoryProduction = {};
        
        // Economy slider: 0 = all Dyson, 100 = all Economy
        this.economySlider = 67; // Default: 67% Economy, 33% Dyson
        
        // Mine/Build slider: 0 = all mine (harvest), 100 = all build (construct) - within economy allocation
        this.mineBuildSlider = 50; // Default: 50% mine, 50% build
        
        // Build allocation: 0 = all structures, 100 = all probes (for probes allocated to construct)
        this.buildAllocation = 100; // Default: 0% structures, 100% probes
        
        // Dyson power allocation: 0 = all economy (energy), 100 = all compute (intelligence)
        this.dysonPowerAllocation = 50; // Default: 50% compute power
        
        // Harvest zone selection (which zone to harvest from)
        this.harvestZone = 'earth'; // Default to Earth
        
        // Activity modifiers: {activity_id: multiplier (0.0-1.0)}
        this.activityModifiers = {
            mining: 1.0,           // Probe mining (harvest)
            replicating: 1.0,       // Probe replication
            dyson_constructing: 1.0, // Dyson sphere construction
            structures: 1.0,        // Structure building
            mining_buildings: 1.0,  // Mining structure production
            factories: 1.0          // Factory production
        };
        
        // Structures by zone: {zoneId: {building_id: count}}
        this.structuresByZone = {};
        
        // Factory production by zone: {zoneId: {rate: probes/s, metalCost: kg/s}}
        this.factoryProductionByZone = {};
        
        // Legacy: keep global structures for backward compatibility
        this.structures = {};
        
        // Zone metal remaining - will be initialized after data loads
        this.zoneMetalRemaining = {};
        this.zoneMassRemaining = {}; // Total mass remaining per zone (metal + non-metal)
        this.zoneSlagProduced = {}; // Slag produced from mining per zone
        this.zoneDepleted = {};
        
        // Zone-specific policies: {zoneId: {mining_slider, replication_slider, construction_slider}}
        // For Dyson zone: {construct_slider}
        this.zonePolicies = {};
        
        
        // Minimum probe threshold per zone: {zoneId: minimum_count}
        this.zoneMinProbes = {};
        
        // Research progress: {research_tree_id: {tier_id: {tranches_completed: int, enabled: bool}}}
        this.research = {};
        
        // Dyson sphere
        this.dysonSphereMass = 0.0;
        // Target mass will be calculated dynamically using getDysonTargetMass() to account for research modifiers
        // Store base value for reference
        this.dysonSphereBaseTargetMass = config.dyson_sphere_target_mass !== undefined ? 
            config.dyson_sphere_target_mass : Config.DYSON_SPHERE_TARGET_MASS;
        // Effective target mass (will be updated when research changes)
        this.dysonSphereTargetMass = this.dysonSphereBaseTargetMass;
        
        // Probe construction progress tracking: {probe_type: progress_in_kg}
        this.probeConstructionProgress = {};
        for (const probeType of Object.keys(this.probes)) {
            this.probeConstructionProgress[probeType] = 0.0;
        }
        
        // Structure construction progress tracking: {building_id: progress_in_kg}
        this.structureConstructionProgress = {};
        
        // Enabled construction: set of building_ids that are enabled for continuous construction
        this.enabledConstruction = new Set();
        
        // Active transfers: [{id, from, to, rate, type, paused, ...}]
        // Note: Transfers don't consume energy - probes use their own propulsion drives
        this.activeTransfers = [];
        
        // Transfer history: all transfers (completed and active)
        this.transferHistory = [];
        
        // Initialize after data loads
        this._initialized = false;
    }
    
    async initialize() {
        if (this._initialized) return;
        
        // Load game data
        await this.dataLoader.loadAll();
        
        // Initialize zone metal remaining and zone-specific data structures
        const zones = await this.dataLoader.loadOrbitalMechanics();
        for (const zone of zones) {
            const zoneId = zone.id;
            const isDysonZone = zone.is_dyson_zone || false;
            
            if (isDysonZone) {
                // Dyson zone has no metal or mass
                this.zoneMetalRemaining[zoneId] = 0;
                this.zoneMassRemaining[zoneId] = 0;
                this.zoneSlagProduced[zoneId] = 0;
            } else {
                // Regular zones have metal and mass
                const metalLimit = this.dataLoader.getZoneMetalLimit(zoneId);
                this.zoneMetalRemaining[zoneId] = metalLimit;
                const metalPercentage = zone.metal_percentage || 0.32;
                const totalMass = zone.total_mass_kg || metalLimit;
                this.zoneMassRemaining[zoneId] = totalMass;
                this.zoneSlagProduced[zoneId] = 0; // Slag starts at 0, produced from mining
            }
            this.zoneDepleted[zoneId] = false;
            
            // Initialize zone policies
            if (isDysonZone) {
                // dyson_allocation_slider: 0 = all Build (bottom label), 100 = all Dyson (top label)
                // This way the variable matches the label: higher value = more of what's labeled at top
                this.zonePolicies[zoneId] = {dyson_allocation_slider: 100, replication_slider: 100}; // Default: 100 = all Dyson (top label), 100% replicate
            } else {
                // All regular zones: 50% harvest, 50% build, 50% replicate, 50% structure
                this.zonePolicies[zoneId] = {
                    mining_slider: 50,  // 50% harvest, 50% build (0 = all harvest, 100 = all build)
                    replication_slider: 100,  // 100% replicate, 0% construct (structure)
                    construction_slider: 50  // Legacy compatibility
                };
            }
            
            // Initialize minimum probe threshold
            this.zoneMinProbes[zoneId] = 0;
            
            // Initialize probes by zone - single probe type only
            if (!(zoneId in this.probesByZone)) {
                this.probesByZone[zoneId] = {
                    'probe': 0
                };
            }
            
            // Initialize probe allocations by zone - single probe type only
            if (!(zoneId in this.probeAllocationsByZone)) {
                if (isDysonZone) {
                    this.probeAllocationsByZone[zoneId] = {
                        'construct': {'probe': 0},
                        'replicate': {'probe': 0}
                    };
                } else {
                    this.probeAllocationsByZone[zoneId] = {
                        'harvest': {'probe': 0},
                        'replicate': {'probe': 0},
                        'construct': {'probe': 0}
                    };
                }
            }
            
            // Initialize structures by zone
            if (!(zoneId in this.structuresByZone)) {
                this.structuresByZone[zoneId] = {};
            }
            
            // Earth starts with 1 probe, no structures
            if (zoneId === 'earth') {
                const initialProbes = this.config.initial_probes !== undefined ? this.config.initial_probes : 1;
                this.probesByZone[zoneId] = {
                    'probe': initialProbes
                };
                if (!this.structuresByZone[zoneId]) {
                    this.structuresByZone[zoneId] = {};
                }
            }
        }
        
        // Note: Initial probes are already placed in Earth zone above (line 177-181)
        // No need to place them again here
        
        // Load initial research trees
        this._initializeResearch();
        
        // Calculate initial dexterity from probes
        this.dexterity = this._calculateDexterity();
        
        // Auto-allocate initial probes based on slider settings
        this._autoAllocateProbes();
        
        this._initialized = true;
    }
    
    static async loadFromState(sessionId, config, state) {
        const engine = new GameEngine(sessionId, config);
        await engine.initialize();
        
        if (state) {
            engine.tickCount = state.tick || 0;
            engine.time = state.time || 0.0;
            engine.energy = state.energy !== undefined ? state.energy : Config.INITIAL_ENERGY;
            engine.metal = state.metal !== undefined ? state.metal : Config.INITIAL_METAL;
            // Intelligence is not persisted - it's a production rate, not accumulated storage
            engine.intelligence = 0.0; // Will be recalculated from current production
            engine.slag = state.slag || 0.0;
            
            // Load probes by zone (new system)
            const savedProbesByZone = state.probes_by_zone;
            if (savedProbesByZone && typeof savedProbesByZone === 'object') {
                engine.probesByZone = savedProbesByZone;
            }
            
            // Load probe allocations by zone (new system)
            const savedAllocationsByZone = state.probe_allocations_by_zone;
            if (savedAllocationsByZone && typeof savedAllocationsByZone === 'object') {
                engine.probeAllocationsByZone = savedAllocationsByZone;
            }
            
            // Legacy: Load global probes for backward compatibility - migrate specialized probes
            const savedProbes = state.probes;
            if (savedProbes && typeof savedProbes === 'object') {
                // Migrate: convert all specialized probes to base 'probe' type
                let totalProbes = savedProbes.probe || 0;
                // Add specialized probes to total (backward compatibility)
                for (const oldType of ['miner_probe', 'compute_probe', 'energy_probe', 'construction_probe']) {
                    if (oldType in savedProbes) {
                        totalProbes += savedProbes[oldType] || 0;
                    }
                }
                engine.probes = { 'probe': totalProbes };
            }
            if (savedProbes && typeof savedProbes === 'object') {
                // Merge saved probes with initialized probes to ensure all types exist
                for (const probeType of Object.keys(engine.probes)) {
                    if (probeType in savedProbes) {
                        engine.probes[probeType] = savedProbes[probeType];
                    }
                }
            }
            
            // Legacy: Load probe allocations for backward compatibility
            const savedAllocations = state.probe_allocations;
            if (savedAllocations && typeof savedAllocations === 'object') {
                engine.probeAllocations = savedAllocations;
            }
            
            // Load probe construction progress
            const savedProgress = state.probe_construction_progress;
            if (savedProgress && typeof savedProgress === 'object') {
                engine.probeConstructionProgress = savedProgress;
            } else {
                // Initialize if not present
                engine.probeConstructionProgress = {};
                for (const probeType of Object.keys(engine.probes)) {
                    engine.probeConstructionProgress[probeType] = 0.0;
                }
            }
            
            // Load structure construction progress
            const savedStructureProgress = state.structure_construction_progress;
            if (savedStructureProgress && typeof savedStructureProgress === 'object') {
                engine.structureConstructionProgress = savedStructureProgress;
            } else {
                engine.structureConstructionProgress = {};
            }
            
            // Load enabled construction
            const savedEnabled = state.enabled_construction;
            if (savedEnabled && Array.isArray(savedEnabled)) {
                engine.enabledConstruction = new Set(savedEnabled);
            } else {
                engine.enabledConstruction = new Set();
            }
            
            // Load structures by zone (new system)
            const savedStructuresByZone = state.structures_by_zone;
            if (savedStructuresByZone && typeof savedStructuresByZone === 'object') {
                engine.structuresByZone = savedStructuresByZone;
            }
            
            // Legacy: Load global structures for backward compatibility
            const savedStructures = state.structures;
            if (savedStructures && typeof savedStructures === 'object') {
                engine.structures = savedStructures;
            }
            
            engine.zoneMetalRemaining = state.zone_metal_remaining || engine.zoneMetalRemaining;
            engine.zoneDepleted = state.zone_depleted || engine.zoneDepleted;
            engine.research = state.research || engine.research;
            engine.dysonSphereMass = state.dyson_sphere_mass || 0.0;
            engine.factoryProduction = state.factory_production || {};
            engine.economySlider = state.economy_slider !== undefined ? state.economy_slider : 67;
            engine.mineBuildSlider = state.mine_build_slider !== undefined ? state.mine_build_slider : 50;
            
            // Load active transfers
            const savedTransfers = state.active_transfers;
            if (savedTransfers && Array.isArray(savedTransfers)) {
                engine.activeTransfers = savedTransfers;
            } else {
                engine.activeTransfers = [];
            }
            engine.buildAllocation = state.build_allocation !== undefined ? state.build_allocation : 100;
            engine.dysonPowerAllocation = state.dyson_power_allocation !== undefined ? state.dyson_power_allocation : 0;
            engine.harvestZone = state.harvest_zone || 'mercury';
            
            // Recalculate dexterity from current probes (don't use saved value)
            engine.dexterity = engine._calculateDexterity();
        }
        
        return engine;
    }
    
    _initializeResearch() {
        const researchTrees = this.dataLoader.getAllResearchTrees();
        for (const [treeId, treeData] of Object.entries(researchTrees)) {
            this.research[treeId] = {};
            if (treeData.tiers) {
                for (const tier of treeData.tiers) {
                    const tierId = tier.id;
                    this.research[treeId][tierId] = {
                        'tranches_completed': 0,
                        'enabled': false,
                        'start_time': null,  // Time when research started (in days)
                        'completion_time': null  // Time when research completed (in days)
                    };
                }
            }
            // Handle subcategories (computer systems)
            if (treeData.subcategories) {
                for (const [subcatId, subcatData] of Object.entries(treeData.subcategories)) {
                    if (subcatData.tiers) {
                        for (const tier of subcatData.tiers) {
                            const tierId = tier.id;
                            // Use subcatId_tierId as the key
                            const tierKey = subcatId + '_' + tierId;
                            this.research[treeId][tierKey] = {
                                'tranches_completed': 0,
                                'enabled': false,
                                'start_time': null,  // Time when research started (in days)
                                'completion_time': null  // Time when research completed (in days)
                            };
                        }
                    }
                }
            }
        }
    }
    
    _getResearchTree(skillCategory) {
        /** Get research tree data for a skill category. */
        return this.dataLoader.getResearchTree(skillCategory);
    }
    
    _calculateResearchBonus(skillCategory, skillName = null) {
        /** Calculate total bonus from research for a skill category.
        
        Uses exponential compounding system:
        - During research: bonus = base_bonus * e^(0.20 * time_in_days)
        - When tier completes: principal doubles, then continues: bonus = (base_bonus * 2) * e^(0.20 * time_since_completion)
        - Each tier compounds independently and continuously
        - Tiers compound multiplicatively: total_bonus = tier1_bonus * tier2_bonus * ...
        
        Args:
            skillCategory: Research tree ID (e.g., 'propulsion_systems')
            skillName: Optional subcategory name (e.g., 'processing' for computer_systems)
        
        Returns:
            Total bonus multiplier (additive bonus = multiplier - 1.0)
        */
        let totalBonusMultiplier = 1.0;  // Start with 1.0 for multiplicative compounding
        const researchTree = this._getResearchTree(skillCategory);
        
        if (!researchTree) {
            return 0.0;  // No bonus if no research tree
        }
        
        // Handle subcategories (e.g., computer_systems has processing, memory, etc.)
        if (skillName && researchTree.subcategories) {
            if (skillName in researchTree.subcategories) {
                const subcatData = researchTree.subcategories[skillName];
                if (subcatData.tiers) {
                    for (const tier of subcatData.tiers) {
                        const tierKey = skillName + '_' + tier.id;
                        const progress = this.research[skillCategory]?.[tierKey] || {};
                        const tranchesCompleted = progress.tranches_completed || 0;
                        const isComplete = tranchesCompleted >= tier.tranches;
                        const startTime = progress.start_time;
                        const completionTime = progress.completion_time;
                        
                        if (startTime !== null && startTime !== undefined) {
                            const baseBonus = tier.total_bonus || 0.0;
                            const timeElapsedDays = this.time - startTime;
                            
                            let tierBonus;
                            if (isComplete && completionTime !== null && completionTime !== undefined) {
                                // Tier completed: principal doubles, then continues compounding
                                const timeSinceCompletionDays = this.time - completionTime;
                                // Base bonus doubles on completion
                                const effectiveBase = baseBonus * 2.0;
                                // Continue compounding from completion time
                                tierBonus = effectiveBase * Math.exp(0.20 * timeSinceCompletionDays);
                            } else {
                                // During research: compound continuously
                                tierBonus = baseBonus * Math.exp(0.20 * timeElapsedDays);
                            }
                            
                            // Multiplicative compounding: multiply by (1 + tierBonus)
                            totalBonusMultiplier *= (1.0 + tierBonus);
                        }
                    }
                }
            }
        } else {
            // Regular tiers
            if (researchTree.tiers) {
                for (const tier of researchTree.tiers) {
                    const tierId = tier.id;
                    const progress = this.research[skillCategory]?.[tierId] || {};
                    const tranchesCompleted = progress.tranches_completed || 0;
                    const isComplete = tranchesCompleted >= tier.tranches;
                    const startTime = progress.start_time;
                    const completionTime = progress.completion_time;
                    
                    if (startTime !== null && startTime !== undefined) {
                        const baseBonus = tier.total_bonus || 0.0;
                        const timeElapsedDays = this.time - startTime;
                        
                        let tierBonus;
                        if (isComplete && completionTime !== null && completionTime !== undefined) {
                            // Tier completed: principal doubles, then continues compounding
                            const timeSinceCompletionDays = this.time - completionTime;
                            // Base bonus doubles on completion
                            const effectiveBase = baseBonus * 2.0;
                            // Continue compounding from completion time
                            tierBonus = effectiveBase * Math.exp(0.20 * timeSinceCompletionDays);
                        } else {
                            // During research: compound continuously
                            tierBonus = baseBonus * Math.exp(0.20 * timeElapsedDays);
                        }
                        
                        // Multiplicative compounding: multiply by (1 + tierBonus)
                        totalBonusMultiplier *= (1.0 + tierBonus);
                    }
                }
            }
        }
        
        // Return the additive bonus (multiplier - 1.0) to match existing API
        return totalBonusMultiplier - 1.0;
    }
    
    getBaseSkillValue(skillCategory, skillName = null) {
        /** Get base skill value before research modifiers.
        
        Args:
            skillCategory: Skill category ID
            skillName: Optional subcategory name
        
        Returns:
            Base skill value
        */
        // Base values for different skill categories
        const baseValues = {
            'propulsion_systems': Config.BASE_PROPULSION_ISP || 500,  // specific impulse in seconds
            'locomotion_systems': 1.0,  // efficiency multiplier
            'acds': 1.0,  // efficiency multiplier
            'robotic_systems': 1.0,  // efficiency multiplier
            'computer_systems': 1.0,  // compute power multiplier (calculated from sub-skills)
            'production_efficiency': 1.0,  // production rate multiplier
            'recycling_efficiency': 0.75,  // base recycling efficiency (75%)
            'energy_collection': 1.0,  // energy collection efficiency multiplier
            'solar_concentrators': 1.0,  // solar concentration multiplier
            'energy_storage': 1.0,  // storage capacity multiplier
            'energy_transport': 1.0,  // transport efficiency multiplier
            'energy_matter_conversion': 0.0,  // conversion rate (starts at 0)
            'dyson_swarm_construction': 1.0,  // construction rate multiplier
        };
        
        // For computer_systems subcategories
        if (skillCategory === 'computer_systems' && skillName) {
            return 1.0;  // Base compute sub-skill value
        }
        
        return baseValues[skillCategory] || 1.0;
    }
    
    getSkillValue(skillCategory, skillName = null) {
        /** Get effective skill value with research bonuses applied.
        
        Args:
            skillCategory: Skill category ID
            skillName: Optional subcategory name
        
        Returns:
            Effective skill value (base * (1 + bonus))
        */
        const baseValue = this.getBaseSkillValue(skillCategory, skillName);
        const researchBonus = this._calculateResearchBonus(skillCategory, skillName);
        return baseValue * (1.0 + researchBonus);
    }
    
    getComputePower() {
        /** Calculate effective compute power from computer_systems subcategories.
        
        Uses geometric mean: compute = (processing × memory × interface × transmission)^0.25
        
        Returns:
            Effective compute power multiplier
        */
        const processing = this.getSkillValue('computer_systems', 'processing');
        const memory = this.getSkillValue('computer_systems', 'memory');
        const interface_skill = this.getSkillValue('computer_systems', 'interface');
        const transmission = this.getSkillValue('computer_systems', 'transmission');
        
        // Geometric mean
        const computePower = Math.pow(processing * memory * interface_skill * transmission, 0.25);
        return computePower;
    }
    
    getDysonTargetMass() {
        /** Calculate effective Dyson sphere target mass with research modifiers.
        
        Base target mass: 5e24 kg
        Research modifiers can reduce the required mass.
        
        Returns:
            Effective target mass in kg
        */
        const baseTargetMass = Config.DYSON_SPHERE_TARGET_MASS;  // 5e24 kg
        
        // Research modifiers can reduce the required mass
        // (e.g., better construction techniques, more efficient materials)
        const dysonConstructionBonus = this._calculateResearchBonus('dyson_swarm_construction');
        
        // Mass reduction: 10% reduction per 100% bonus (example formula)
        // Adjust this formula as needed for game balance
        const massReduction = Math.min(0.5, dysonConstructionBonus * 0.1);  // Cap at 50% reduction
        const effectiveMass = baseTargetMass * (1.0 - massReduction);
        
        return effectiveMass;
    }
    
    getDysonEnergyProduction() {
        /** Calculate energy production from Dyson sphere mass.
        
        Base production: 5 kW per kg of Dyson sphere mass
        From: 5 kW/m² / 1 kg/m² = 5 kW/kg
        
        Returns:
            Energy production in watts
        */
        // Base production: 5 kW per kg of Dyson sphere mass
        const baseEnergyPerKg = Config.DYSON_POWER_PER_KG || 5000;  // 5000 watts per kg
        
        // Calculate base energy production
        const baseProduction = this.dysonSphereMass * baseEnergyPerKg;
        
        // Apply energy collection skill modifiers
        const energyCollectionBonus = this._calculateResearchBonus('energy_collection');
        const solarConcentratorsBonus = this._calculateResearchBonus('solar_concentrators');
        
        // Sum bonuses (they're multipliers, so additive)
        const totalBonus = energyCollectionBonus + solarConcentratorsBonus;
        const effectiveProduction = baseProduction * (1.0 + totalBonus);
        
        return effectiveProduction;
    }
    
    // Legacy method for backward compatibility
    _getResearchBonus(treeId, effectName, defaultValue = 1.0) {
        /** Legacy method: get research bonus for a specific effect.
        
        This method is kept for backward compatibility with existing code.
        New code should use getSkillValue() instead.
        */
        // For now, return the skill value for the tree
        // This is a simplified implementation - may need refinement based on effectName
        return this.getSkillValue(treeId);
    }
    
    getState() {
        // Calculate current rates for display
        const energyProductionRate = this._calculateEnergyProduction() + Config.CONSTANT_ENERGY_SUPPLY;
        const energyConsumptionRate = this._calculateEnergyConsumption();
        const [metalProductionRate] = this._calculateMetalProduction(); // Returns [metalRate, zoneMetalDepletion, slagRate, zoneSlagDepletion]
        const intelligenceProductionRate = this._calculateIntelligenceProduction();
        const [probeProductionRates, , factoryMetalCostPerProbe] = this._calculateProbeProduction();
        const probeProductionRate = Object.values(probeProductionRates).reduce((a, b) => a + b, 0);
        // Use throttled rate from last tick if available, otherwise calculate base rate
        const dysonConstructionRate = this.lastDysonConstructionRate > 0 ? this.lastDysonConstructionRate : this._calculateDysonConstructionRate();
        
        // Calculate actual metal consumption rates
        let probeMetalConsumption = 0.0;
        for (const [probeType, rate] of Object.entries(probeProductionRates)) {
            if (rate > 0) {
                let metalCostPerProbe;
                if (probeType === 'probe' && factoryMetalCostPerProbe > 0) {
                    metalCostPerProbe = factoryMetalCostPerProbe;
                } else {
                    const probeData = this._getProbeData(probeType);
                    metalCostPerProbe = Config.PROBE_MASS;
                    if (probeData) {
                        metalCostPerProbe = probeData.base_cost_metal || Config.PROBE_MASS;
                    }
                }
                probeMetalConsumption += rate * metalCostPerProbe;
            }
        }
        
        const dysonMetalConsumption = dysonConstructionRate * 0.5; // 50% efficiency
        
        // Structure metal consumption
        let structureMetalConsumption = 0.0;
        if (Object.keys(this.structureConstructionProgress).length > 0) {
            const constructAllocation = this.probeAllocations.construct || {};
            const constructingProbes = Object.values(constructAllocation).reduce((a, b) => a + b, 0);
            const structureBuildingFraction = 1.0 - (this.buildAllocation / 100.0);
            const structureBuildingProbes = constructingProbes * structureBuildingFraction;
            if (structureBuildingProbes > 0) {
                // Apply research bonuses for building rate
                const buildingRateBonus = this._getResearchBonus('production_efficiency', 'building_rate_multiplier', 1.0);
                const effectiveBuildRate = Config.PROBE_BUILD_RATE * buildingRateBonus;
                structureMetalConsumption = structureBuildingProbes * effectiveBuildRate;
            }
        }
        
        const totalMetalConsumption = probeMetalConsumption + dysonMetalConsumption + structureMetalConsumption;
        
        // Calculate resource breakdowns for tooltips
        const resourceBreakdowns = this._calculateResourceBreakdowns();
        
        // Calculate research allocation info
        const researchAllocationInfo = this._calculateResearchAllocationInfo();
        
        // Calculate idle probes
        const idleProbesInfo = this._calculateIdleProbes();
        
        return {
            'tick': this.tickCount,
            'time': this.time,
            'energy': this.energy,
            'metal': this.metal,
            'intelligence': this.intelligence, // Current production rate (for display), not accumulated
            'dexterity': this.dexterity,
            'slag': this.slag,
            'energy_stored': this.energyStored,
            'energy_storage_capacity': this._calculateEnergyStorageCapacity(),
            'probes': this._calculateTotalProbes(), // Calculate total probes across all zones
            'probes_by_zone': this.probesByZone, // New: probes per zone
            'probe_allocations': this.probeAllocations, // Legacy: global allocations
            'probe_allocations_by_zone': this.probeAllocationsByZone, // New: allocations per zone
            'probe_construction_progress': this.probeConstructionProgress,
            'structure_construction_progress': this.structureConstructionProgress,
            'enabled_construction': Array.from(this.enabledConstruction),
            'structures': this.structures, // Legacy: global structures
            'structures_by_zone': this.structuresByZone, // New: structures per zone
            'zone_metal_remaining': this.zoneMetalRemaining,
            'zone_mass_remaining': this.zoneMassRemaining,
            'zone_slag_produced': this.zoneSlagProduced,
            'zone_policies': this.zonePolicies,
            'zone_min_probes': this.zoneMinProbes,
            'zone_depleted': this.zoneDepleted,
            'research': this.research,
            'dyson_sphere_mass': this.dysonSphereMass,
            'dyson_sphere_target_mass': this.getDysonTargetMass(),  // Use dynamic target mass with research modifiers
            'dyson_sphere_progress': this.getDysonTargetMass() > 0 ? 
                this.dysonSphereMass / this.getDysonTargetMass() : 0,
            'factory_production': this.factoryProduction,
            'economy_slider': this.economySlider,
            'mine_build_slider': this.mineBuildSlider,
            'build_allocation': this.buildAllocation,
            'dyson_power_allocation': this.dysonPowerAllocation,
            'harvest_zone': this.harvestZone,
            'energy_production_rate': energyProductionRate,
            'energy_consumption_rate': energyConsumptionRate,
            'metal_production_rate': metalProductionRate,
            'metal_consumption_rate': totalMetalConsumption,
            'structure_metal_consumption_rate': structureMetalConsumption,
            'intelligence_production_rate': intelligenceProductionRate,
            'probe_production_rate': probeProductionRate,
            'probe_production_rates': probeProductionRates, // Per-probe-type rates
            'dyson_construction_rate': dysonConstructionRate,
            'resource_breakdowns': resourceBreakdowns,
            'research_allocation_info': researchAllocationInfo,
            'idle_probes': idleProbesInfo,
            'is_energy_limited': this.isEnergyLimited,
            'is_metal_limited': this.isMetalLimited,
            'active_transfers': this.activeTransfers || [], // Active continuous transfers
            'transfer_history': this.transferHistory || [] // All transfers
        };
    }
    
    getTime() {
        return this.time;
    }
    
    getTotalMetalRemaining() {
        return Object.values(this.zoneMetalRemaining).reduce((a, b) => a + b, 0);
    }
    
    tick(deltaTime) {
        // Start profiling tick time
        const profiler = window.performanceProfiler;
        const tickStartTime = profiler ? profiler.startTiming('tick') : null;
        
        // Clear cache invalidated flags at start of tick
        const cache = window.calculationCache;
        if (cache) {
            cache.clearInvalidated();
        }
        
        // Ensure deltaTime is valid
        if (!deltaTime || deltaTime <= 0 || isNaN(deltaTime) || !isFinite(deltaTime)) {
            console.warn('Invalid deltaTime in tick:', deltaTime);
            if (profiler && tickStartTime !== null) {
                profiler.endTiming('tick', tickStartTime);
            }
            return;
        }
        
        this.tickCount += 1;
        const previousTime = this.time;
        this.time += deltaTime;
        
        // Debug: Log time increment every 60 ticks (once per second at 60 ticks/sec)
        if (this.tickCount % 60 === 0) {
            const timeSpeed = typeof window !== 'undefined' && window.gameEngine ? window.gameEngine.timeSpeed : 'unknown';
            console.log(`Tick ${this.tickCount}: time=${this.time.toFixed(2)}s, deltaTime=${deltaTime.toFixed(4)}s, timeSpeed=${timeSpeed}`);
        }
        
        // Ensure time is valid
        if (!isFinite(this.time) || isNaN(this.time)) {
            console.error('Time became invalid:', this.time, 'deltaTime:', deltaTime, 'previousTime:', previousTime);
            this.time = previousTime || 0;
        }
        
        // Calculate base production and consumption rates (before energy throttling)
        const zoneCalcStart = profiler ? profiler.startTiming('zone_calculation') : null;
        const energyProduction = this._calculateEnergyProduction();
        const [baseMetalRate, zoneMetalDepletion, baseSlagRate, zoneSlagDepletion] = this._calculateMetalProduction();
        if (profiler && zoneCalcStart !== null) {
            profiler.endTiming('zone_calculation', zoneCalcStart);
        }
        
        const probeCalcStart = profiler ? profiler.startTiming('probe_calculation') : null;
        const [baseProbeRate, idleProbesBuild, factoryMetalCostPerProbe] = this._calculateProbeProduction();
        if (profiler && probeCalcStart !== null) {
            profiler.endTiming('probe_calculation', probeCalcStart);
        }
        
        const structureCalcStart = profiler ? profiler.startTiming('structure_calculation') : null;
        const theoreticalIntelligenceRate = this._calculateIntelligenceProduction();
        const baseDysonConstructionRate = this._calculateDysonConstructionRate();
        if (profiler && structureCalcStart !== null) {
            profiler.endTiming('structure_calculation', structureCalcStart);
        }
        
        // Calculate energy consumption breakdown (mining vs build)
        const energyConsumptionBreakdown = this._calculateEnergyConsumptionBreakdown();
        const miningEnergyConsumption = energyConsumptionBreakdown.mining;
        const buildEnergyConsumption = energyConsumptionBreakdown.build;
        const nonComputeEnergyConsumption = energyConsumptionBreakdown.total;
        
        // Calculate compute demand (what research projects want)
        const computeDemandFlops = this._calculateComputeDemand();
        
        // Energy system: constant supply + production - consumption
        const constantSupply = Config.CONSTANT_ENERGY_SUPPLY;
        const totalEnergyAvailable = constantSupply + energyProduction;
        
        // Calculate effective intelligence production based on available energy
        const availableEnergyForCompute = Math.max(0, totalEnergyAvailable - nonComputeEnergyConsumption);
        
        // Calculate effective compute production rate (limited by energy)
        // Intelligence/FLOPS is a production rate, not an accumulated resource
        const intelligenceRate = this._calculateEffectiveIntelligenceProduction(availableEnergyForCompute);
        
        // Store current production rate for UI display (not accumulated storage)
        this.intelligence = intelligenceRate;
        
        // Compute energy consumption is based on effective compute
        let computeEnergyConsumption = 0.0;
        if (intelligenceRate > 0) {
            const computePflops = intelligenceRate / 1e15;
            const baseComputePowerDraw = computePflops * 1000; // 1000W = 1 kW per PFLOPS/s
            const computeEfficiency = this._getResearchBonus('computer_systems', 'compute_power_efficiency', 1.0);
            computeEnergyConsumption = computeEfficiency > 0 ? baseComputePowerDraw / computeEfficiency : baseComputePowerDraw;
        }
        
        // Total energy consumption
        const energyConsumption = nonComputeEnergyConsumption + computeEnergyConsumption;
        let netEnergyAvailable = totalEnergyAvailable - energyConsumption;
        
        // Calculate energy throttle factors - prioritize mining over build
        let miningEnergyThrottle = 1.0;
        let buildEnergyThrottle = 1.0;
        
        if (netEnergyAvailable < 0) {
            // Energy shortfall - prioritize mining, throttle build activities
            const energyAfterMining = totalEnergyAvailable - miningEnergyConsumption - computeEnergyConsumption;
            
            if (energyAfterMining < 0) {
                // Not enough energy even for mining - throttle mining proportionally
                const miningAndComputeEnergy = miningEnergyConsumption + computeEnergyConsumption;
                if (miningAndComputeEnergy > 0) {
                    miningEnergyThrottle = Math.max(0.0, (totalEnergyAvailable - computeEnergyConsumption) / miningEnergyConsumption);
                } else {
                    miningEnergyThrottle = 0.0;
                }
                buildEnergyThrottle = 0.0; // No energy left for build
            } else {
                // Mining gets full energy, build gets what's left
                miningEnergyThrottle = 1.0;
                if (buildEnergyConsumption > 0) {
                    buildEnergyThrottle = Math.max(0.0, energyAfterMining / buildEnergyConsumption);
                } else {
                    buildEnergyThrottle = 1.0;
                }
            }
        }
        
        // Calculate energy storage capacity
        const storageCapacity = this._calculateEnergyStorageCapacity();
        
        // Convert net energy (watts) to watt-days for storage
        // netEnergyAvailable is in watts, deltaTime is in days
        // So netWattDays = watts * days = watt-days
        const netWattDays = netEnergyAvailable * deltaTime;
        
        // Handle energy storage
        if (netWattDays > 0) {
            // Excess energy - add to storage (capped at capacity)
            this.energyStored = Math.min(storageCapacity, this.energyStored + netWattDays);
        } else {
            // Energy deficit - draw from storage first
            const energyDeficitWattDays = Math.abs(netWattDays);
            if (this.energyStored >= energyDeficitWattDays) {
                // Storage can cover the deficit
                this.energyStored -= energyDeficitWattDays;
                netEnergyAvailable = 0; // Deficit fully covered
            } else {
                // Storage can only partially cover the deficit
                netEnergyAvailable = -(energyDeficitWattDays - this.energyStored); // Remaining deficit in watts
                this.energyStored = 0;
            }
        }
        
        // Clamp storage to capacity (safety check)
        this.energyStored = Math.max(0.0, Math.min(storageCapacity, this.energyStored));
        
        // For backward compatibility, calculate overall throttle (weighted average)
        const energyThrottle = (miningEnergyConsumption * miningEnergyThrottle + buildEnergyConsumption * buildEnergyThrottle) / 
                              Math.max(1.0, miningEnergyConsumption + buildEnergyConsumption);
        
        // Store net available energy for display (but it's not accumulated)
        this.energy = Math.max(0, netEnergyAvailable);
        
        // Update research progress with effective intelligence rate (limited by energy)
        this._updateResearch(deltaTime, intelligenceRate);
        
        // Apply energy throttling to all activities first
        // Apply mining activity modifier
        const miningModifier = this.activityModifiers.mining || 1.0;
        const metalRate = baseMetalRate * energyThrottle * miningModifier;
        const probeRateAfterEnergy = {};
        for (const [pt, rate] of Object.entries(baseProbeRate)) {
            probeRateAfterEnergy[pt] = rate * energyThrottle;
        }
        const dysonConstructionRateAfterEnergy = baseDysonConstructionRate * energyThrottle;
        
        // Calculate metal consumption rates (before metal throttling)
        let probeMetalConsumptionRate = 0.0;
        for (const [probeType, rate] of Object.entries(probeRateAfterEnergy)) {
            if (rate > 0) {
                let metalCostPerProbe;
                if (probeType === 'probe' && factoryMetalCostPerProbe > 0) {
                    metalCostPerProbe = factoryMetalCostPerProbe;
                } else {
                    const probeData = this._getProbeData(probeType);
                    metalCostPerProbe = Config.PROBE_MASS;
                    if (probeData) {
                        metalCostPerProbe = probeData.base_cost_metal || Config.PROBE_MASS;
                    }
                }
                probeMetalConsumptionRate += rate * metalCostPerProbe;
            }
        }
        
        // Dyson construction metal consumption (50% efficiency)
        const dysonMetalConsumptionRate = dysonConstructionRateAfterEnergy * 0.5;
        
        // Structure construction metal consumption
        let structureMetalConsumptionRate = 0.0;
        if (Object.keys(this.structureConstructionProgress).length > 0) {
            const constructAllocation = this.probeAllocations.construct || {};
            const constructingProbes = Object.values(constructAllocation).reduce((a, b) => a + b, 0);
            const structureBuildingFraction = 1.0 - (this.buildAllocation / 100.0);
                const structureBuildingProbes = constructingProbes * structureBuildingFraction;
                if (structureBuildingProbes > 0) {
                    // Apply research bonuses for building rate
                    const buildingRateBonus = this._getResearchBonus('production_efficiency', 'building_rate_multiplier', 1.0);
                    const effectiveBuildRate = Config.PROBE_BUILD_RATE * buildingRateBonus;
                    const structureConstructionRateKgS = structureBuildingProbes * effectiveBuildRate;
                // Structure construction uses buildEnergyThrottle (not overall energyThrottle)
                // Apply structures activity modifier
                const structuresModifier = this.activityModifiers.structures || 1.0;
                const structureConstructionRateKgSThrottled = structureConstructionRateKgS * buildEnergyThrottle * structuresModifier;
                structureMetalConsumptionRate = structureConstructionRateKgSThrottled;
            }
        }
        
        // Calculate net metal rate (production - consumption)
        const totalMetalConsumptionRate = probeMetalConsumptionRate + dysonMetalConsumptionRate + structureMetalConsumptionRate;
        const netMetalRate = metalRate - totalMetalConsumptionRate;
        
        // Calculate metal throttle factors - prioritize Dyson sphere construction
        let dysonMetalThrottle = 1.0;
        let otherMetalThrottle = 1.0;
        let isMetalLimited = false;
        
        if (this.metal <= 0 && netMetalRate < 0) {
            // Metal shortfall: no stored metal and consumption > production
            isMetalLimited = true;
            
            // Priority: Dyson sphere gets metal first, then others proportionally
            const metalAfterDyson = metalRate - dysonMetalConsumptionRate;
            
            if (metalAfterDyson < 0) {
                // Not enough metal even for Dyson - throttle Dyson proportionally
                if (dysonMetalConsumptionRate > 0) {
                    dysonMetalThrottle = Math.max(0.0, metalRate / dysonMetalConsumptionRate);
                } else {
                    dysonMetalThrottle = 0.0;
                }
                otherMetalThrottle = 0.0; // No metal left for other activities
            } else {
                // Dyson gets full metal, others get what's left
                dysonMetalThrottle = 1.0;
                const otherMetalConsumption = probeMetalConsumptionRate + structureMetalConsumptionRate;
                if (otherMetalConsumption > 0) {
                    otherMetalThrottle = Math.max(0.0, metalAfterDyson / otherMetalConsumption);
                } else {
                    otherMetalThrottle = 1.0;
                }
            }
        }
        
        // Apply metal throttling to production activities
        // Apply replication activity modifier
        const replicatingModifier = this.activityModifiers.replicating || 1.0;
        const probeRate = {};
        for (const [pt, rate] of Object.entries(probeRateAfterEnergy)) {
            probeRate[pt] = rate * otherMetalThrottle * replicatingModifier;
        }
        // Apply Dyson construction activity modifier
        const dysonConstructingModifier = this.activityModifiers.dyson_constructing || 1.0;
        const dysonConstructionRate = dysonConstructionRateAfterEnergy * dysonMetalThrottle * dysonConstructingModifier;
        
        // Store throttled rate for display in getState()
        this.lastDysonConstructionRate = dysonConstructionRate;
        
        // For backward compatibility, calculate overall throttle (weighted average)
        const metalThrottle = (dysonMetalConsumptionRate * dysonMetalThrottle + 
                               (probeMetalConsumptionRate + structureMetalConsumptionRate) * otherMetalThrottle) /
                              Math.max(1.0, totalMetalConsumptionRate);
        
        // Update metal stockpile: add production only (mining uses miningEnergyThrottle)
        // Factories consume metal to produce probes (handled in factory production section above)
        this.metal += metalRate * miningEnergyThrottle * deltaTime;
        this.metal = Math.max(0, this.metal);
        
        // Store throttling info for UI
        this.isEnergyLimited = (energyThrottle < 1.0);
        this.isMetalLimited = isMetalLimited;
        
        // Apply zone metal and slag depletion (throttled by miningEnergyThrottle)
        // Cache zone lookup for efficiency
        const zones = this.dataLoader.orbitalZones || [];
        const zoneCache = {};
        for (const zone of zones) {
            zoneCache[zone.id] = zone;
        }
        
        // Update zone metal remaining, mass remaining, and produce slag from mining (single pass)
        for (const [zoneId, metalDepletionAmount] of Object.entries(zoneMetalDepletion)) {
            if (zoneId in this.zoneMetalRemaining && zoneId in this.zoneMassRemaining) {
                const actualDepletion = metalDepletionAmount * miningEnergyThrottle * deltaTime;
                
                // Reduce metal remaining
                this.zoneMetalRemaining[zoneId] -= actualDepletion;
                this.zoneMetalRemaining[zoneId] = Math.max(0, this.zoneMetalRemaining[zoneId]);
                
                // Reduce total mass remaining (metal + non-metal)
                this.zoneMassRemaining[zoneId] -= actualDepletion;
                this.zoneMassRemaining[zoneId] = Math.max(0, this.zoneMassRemaining[zoneId]);
                
                // Produce slag proportional to mass mined (non-metal portion)
                const zone = zoneCache[zoneId];
                if (zone) {
                    const metalPercentage = zone.metal_percentage || 0.32;
                    const slagProduced = actualDepletion * (1.0 - metalPercentage) / metalPercentage;
                    if (!(zoneId in this.zoneSlagProduced)) {
                        this.zoneSlagProduced[zoneId] = 0;
                    }
                    this.zoneSlagProduced[zoneId] += slagProduced;
                    
                    // Add to global slag pool
                    this.slag += slagProduced;
                }
            }
        }
        
        // Update probe construction with incremental progress tracking
        // For probe replication, combine:
        // 1. Direct replicate allocations from zones
        // 2. Construct allocations that are set to replicate (based on replication_slider)
        let totalReplicatingProbes = 0;
        
        // Ensure probeAllocationsByZone exists
        if (!this.probeAllocationsByZone) {
            this.probeAllocationsByZone = {};
        }
        
        // Ensure zonePolicies exists
        if (!this.zonePolicies) {
            this.zonePolicies = {};
        }
        
        // First, get direct replicate allocations
        for (const [zoneId, zoneAllocations] of Object.entries(this.probeAllocationsByZone)) {
            if (zoneAllocations && zoneAllocations.replicate) {
                const replicateAllocation = zoneAllocations.replicate || {};
                totalReplicatingProbes += Object.values(replicateAllocation).reduce((a, b) => a + b, 0);
            }
        }
        
        // Also add construct allocations that are set to replicate (based on zone replication_slider)
        for (const [zoneId, zoneAllocations] of Object.entries(this.probeAllocationsByZone)) {
            if (zoneAllocations && zoneAllocations.construct) {
                const constructAllocation = zoneAllocations.construct || {};
                const constructingProbes = Object.values(constructAllocation).reduce((a, b) => a + b, 0);
                if (constructingProbes > 0) {
                    const zonePolicy = this.zonePolicies[zoneId] || {};
                    const replicationSlider = zonePolicy.replication_slider !== undefined ? zonePolicy.replication_slider : 100;
                    const replicateFraction = replicationSlider / 100.0; // Fraction going to replicate (0 = all construct, 100 = all replicate)
                    totalReplicatingProbes += constructingProbes * replicateFraction;
                }
            }
        }
        
        // Base build rate: 10.0 kg/day per probe
        // Apply research bonuses for building rate
        const buildingRateBonus = this._getResearchBonus('production_efficiency', 'building_rate_multiplier', 1.0);
        const effectiveBuildRate = Config.PROBE_BUILD_RATE * buildingRateBonus;
        const baseProbeBuildRateKgS = totalReplicatingProbes * effectiveBuildRate;
        
        // Apply energy throttling (build activities use buildEnergyThrottle)
        // Apply replication activity modifier
        const replicatingModifier2 = this.activityModifiers.replicating || 1.0;
        let probeBuildRateKgS = baseProbeBuildRateKgS * buildEnergyThrottle * replicatingModifier2;
        
        // Apply metal throttling (probe replication uses otherMetalThrottle)
        probeBuildRateKgS = probeBuildRateKgS * otherMetalThrottle;
        
        // Process factory production per zone (zone-based factories produce probes)
        const factoryProductionByZone = this.factoryProductionByZone || {};
        let totalFactoryProbeProduction = 0.0;
        let totalFactoryMetalNeededActual = 0.0;
        
        for (const [zoneId, factoryProd] of Object.entries(factoryProductionByZone)) {
            if (factoryProd.rate > 0) {
                // Apply factories activity modifier
                const factoriesModifier = this.activityModifiers.factories || 1.0;
                const probeProductionRate = factoryProd.rate * factoriesModifier; // probes/day
                const metalCostPerProbe = factoryProd.metalCost / factoryProd.rate; // kg per probe
                const metalNeededRate = probeProductionRate * metalCostPerProbe; // kg/s
                
                totalFactoryProbeProduction += probeProductionRate;
                totalFactoryMetalNeededActual += metalNeededRate;
                
                // Calculate construction progress in kg/s
                let progressThisTick = metalNeededRate * deltaTime;
                
                // Check if we have enough metal for this progress
                if (this.metal < progressThisTick) {
                    progressThisTick = this.metal;
                }
                
                // Add to construction progress (use zone-specific progress tracking)
                const progressKey = `probe_${zoneId}`;
                if (!(progressKey in this.probeConstructionProgress)) {
                    this.probeConstructionProgress[progressKey] = 0.0;
                }
                
                this.probeConstructionProgress[progressKey] += progressThisTick;
                this.metal -= progressThisTick;
                this.metal = Math.max(0, this.metal);
                
                // Check if we've completed a probe
                let probesBuiltThisTick = 0;
                if (this.probeConstructionProgress[progressKey] >= metalCostPerProbe) {
                    probesBuiltThisTick = Math.floor(this.probeConstructionProgress[progressKey] / metalCostPerProbe);
                    const remainder = this.probeConstructionProgress[progressKey] % metalCostPerProbe;
                    
                    // Add probes to global count (legacy)
                    this.probes['probe'] = (this.probes['probe'] || 0) + probesBuiltThisTick;
                    
                    // Add probes to the zone where the factory is located
                    if (!(zoneId in this.probesByZone)) {
                        this.probesByZone[zoneId] = {'probe': 0};
                    }
                    const currentProbes = Math.floor(this.probesByZone[zoneId]['probe'] || 0);
                    this.probesByZone[zoneId]['probe'] = currentProbes + Math.floor(probesBuiltThisTick);
                    
                    this.probeConstructionProgress[progressKey] = remainder;
                }
                
                if (probesBuiltThisTick > 0) {
                    this._autoAllocateProbes();
                }
            }
        }
        
        // Manual probe building (probes building other probes) - zone-based replication
        // Use all available build rate for manual building
        const manualProbeBuildRateKgS = probeBuildRateKgS;
        
        // Manual probe building (probes building other probes) - zone-based replication
        if (manualProbeBuildRateKgS > 0) {
            // Default to building 'probe' type
            const probeType = 'probe';
                    const metalCostPerProbe = Probe.getMetalCost(probeType);
            
            let progressThisTick = manualProbeBuildRateKgS * deltaTime;
            
            // Check if we have enough metal
            if (this.metal < progressThisTick) {
                progressThisTick = this.metal;
            }
            
            if (!(probeType in this.probeConstructionProgress)) {
                this.probeConstructionProgress[probeType] = 0.0;
            }
            
            this.probeConstructionProgress[probeType] += progressThisTick;
            this.metal -= progressThisTick;
            this.metal = Math.max(0, this.metal);
            
            // Check if we've completed probes
            // Use division instead of while loop to avoid potential blocking
            let probesBuiltThisTick = 0;
            if (this.probeConstructionProgress[probeType] >= metalCostPerProbe) {
                probesBuiltThisTick = Math.floor(this.probeConstructionProgress[probeType] / metalCostPerProbe);
                const remainder = this.probeConstructionProgress[probeType] % metalCostPerProbe;
                
                // Add probes to global count (legacy)
                this.probes[probeType] = (this.probes[probeType] || 0) + probesBuiltThisTick;
                
                // Distribute new probes to zones proportionally based on replicate allocation
                // Find zones with replicating probes and distribute proportionally
                let totalReplicateAllocation = 0;
                const zoneReplicateAllocations = {};
                for (const [zoneId, zoneAllocations] of Object.entries(this.probeAllocationsByZone)) {
                    const replicateAllocation = zoneAllocations.replicate || {};
                    const replicateCount = Object.values(replicateAllocation).reduce((a, b) => a + b, 0);
                    if (replicateCount > 0) {
                        zoneReplicateAllocations[zoneId] = replicateCount;
                        totalReplicateAllocation += replicateCount;
                    }
                }
                
                // Distribute probes proportionally across zones
                if (totalReplicateAllocation > 0) {
                    // Calculate cumulative weights for proportional distribution
                    const cumulativeWeights = [];
                    let cumulative = 0;
                    for (const [zoneId, count] of Object.entries(zoneReplicateAllocations)) {
                        cumulative += count;
                        cumulativeWeights.push({zoneId, cumulative});
                    }
                    
                    // Distribute each probe proportionally
                    for (let i = 0; i < probesBuiltThisTick; i++) {
                        const random = Math.random() * totalReplicateAllocation;
                        let selectedZone = null;
                        
                        for (const {zoneId, cumulative} of cumulativeWeights) {
                            if (random <= cumulative) {
                                selectedZone = zoneId;
                                break;
                            }
                        }
                        
                        // Fallback to zone with most replicating probes if selection failed
                        if (!selectedZone) {
                            let maxZone = null;
                            let maxCount = 0;
                            for (const [zoneId, count] of Object.entries(zoneReplicateAllocations)) {
                                if (count > maxCount) {
                                    maxCount = count;
                                    maxZone = zoneId;
                                }
                            }
                            selectedZone = maxZone || this.defaultZone;
                        }
                        
                        if (selectedZone) {
                            if (!(selectedZone in this.probesByZone)) {
                                this.probesByZone[selectedZone] = {'probe': 0};
                            }
                            const currentProbes = Math.floor(this.probesByZone[selectedZone]['probe'] || 0);
                            this.probesByZone[selectedZone]['probe'] = currentProbes + 1;
                        } else {
                            // Fallback to default zone
                            if (!(this.defaultZone in this.probesByZone)) {
                                this.probesByZone[this.defaultZone] = {'probe': 0};
                            }
                            const currentProbes = Math.floor(this.probesByZone[this.defaultZone]['probe'] || 0);
                            this.probesByZone[this.defaultZone]['probe'] = currentProbes + 1;
                        }
                    }
                } else {
                    // No zone allocations, add all to default zone
                    if (!(this.defaultZone in this.probesByZone)) {
                        this.probesByZone[this.defaultZone] = {'probe': 0};
                    }
                    const currentProbes = Math.floor(this.probesByZone[this.defaultZone]['probe'] || 0);
                    this.probesByZone[this.defaultZone]['probe'] = currentProbes + Math.floor(probesBuiltThisTick);
                }
                
                this.probeConstructionProgress[probeType] = remainder;
            }
            
            if (probesBuiltThisTick > 0) {
                this._autoAllocateProbes();
            }
        }
        
        // Structure building (probes building structures using 10.0 kg/day per probe)
        // Calculate structure-building probes per zone based on zone-specific replication_slider
        // For each zone, construct allocation is split between structures and replicate based on replication_slider
        // replication_slider: 0 = all structures, 100 = all replicate
        // So structure fraction = 1.0 - (replication_slider / 100.0)
        let totalStructureBuildingProbes = 0;
        const structureBuildingProbesByZone = {};
        
        if (this.probeAllocationsByZone) {
            for (const [zoneId, zoneAllocations] of Object.entries(this.probeAllocationsByZone)) {
                if (zoneAllocations && zoneAllocations.construct) {
                    const constructAllocation = zoneAllocations.construct || {};
                    const constructingProbes = Object.values(constructAllocation).reduce((a, b) => a + b, 0);
                    
                    if (constructingProbes > 0) {
                        // Get zone policy to determine structure vs replicate split
                        const zonePolicy = this.zonePolicies[zoneId] || {};
                        const replicationSlider = zonePolicy.replication_slider !== undefined ? zonePolicy.replication_slider : 100;
                        const structureFraction = 1.0 - (replicationSlider / 100.0); // 0 = all replicate, 100 = all structures
                        
                        const zoneStructureBuildingProbes = constructingProbes * structureFraction;
                        structureBuildingProbesByZone[zoneId] = zoneStructureBuildingProbes;
                        totalStructureBuildingProbes += zoneStructureBuildingProbes;
                    }
                }
            }
        }
        
        if (totalStructureBuildingProbes > 0 && this.enabledConstruction.size > 0) {
            // Get enabled buildings that are in progress or need to be started
            // enabledConstruction keys are in format: "zoneId::buildingId" (using :: to handle underscores in both)
            const enabledBuildings = [];
            for (const enabledKey of this.enabledConstruction) {
                const [zoneId, buildingId] = enabledKey.split('::', 2);
                if (!zoneId || !buildingId) continue;
                
                const building = this.dataLoader.getBuildingById(buildingId);
                if (!building) {
                    continue;
                }
                
                const costMetal = building.base_cost_metal || 0;
                if (costMetal <= 0) {
                    continue;
                }
                
                // Get current progress (0 if not started)
                const progress = this.structureConstructionProgress[enabledKey] || 0.0;
                
                enabledBuildings.push({
                    'enabled_key': enabledKey,
                    'zone_id': zoneId,
                    'building_id': buildingId,
                    'building': building,
                    'cost_metal': costMetal,
                    'progress': progress
                });
            }
            
            if (enabledBuildings.length > 0) {
                // Allocate build power per zone based on structure-building probes in that zone
                // Group enabled buildings by zone
                const buildingsByZone = {};
                for (const buildingInfo of enabledBuildings) {
                    const zoneId = buildingInfo.zone_id;
                    if (!(zoneId in buildingsByZone)) {
                        buildingsByZone[zoneId] = [];
                    }
                    buildingsByZone[zoneId].push(buildingInfo);
                }
                
                // Calculate build rate per zone and distribute to buildings in that zone
                for (const [zoneId, zoneBuildings] of Object.entries(buildingsByZone)) {
                    const zoneStructureBuildingProbes = structureBuildingProbesByZone[zoneId] || 0;
                    if (zoneStructureBuildingProbes <= 0) {
                        continue;
                    }
                    
                    // Base build rate: 10.0 kg/day per probe
                    const baseZoneBuildRateKgS = zoneStructureBuildingProbes * Config.PROBE_BUILD_RATE;
                    
                    // Structure construction uses buildEnergyThrottle and otherMetalThrottle
                    const zoneBuildRateKgS = baseZoneBuildRateKgS * buildEnergyThrottle * otherMetalThrottle;
                    
                    // Note: In Dyson zone, probes allocated to "construct" only build structures (not Dyson)
                    // Dyson construction uses probes allocated to "dyson" activity (calculated separately)
                    
                    // Allocate build power equally to all enabled buildings in this zone
                    const numEnabledInZone = zoneBuildings.length;
                    const buildRatePerBuilding = zoneBuildRateKgS / numEnabledInZone;
                    
                    // Build all enabled buildings in this zone simultaneously
                    for (const buildingInfo of zoneBuildings) {
                        const enabledKey = buildingInfo.enabled_key;
                        const buildingZoneId = buildingInfo.zone_id;
                        const buildingId = buildingInfo.building_id;
                        const building = buildingInfo.building;
                        const costMetal = buildingInfo.cost_metal;
                        const progress = buildingInfo.progress;
                        
                        const remainingToBuild = costMetal - progress;
                        if (remainingToBuild > 0) {
                            let progressThisTick = Math.min(buildRatePerBuilding * deltaTime, remainingToBuild);
                            
                            // Check if we have enough metal
                            if (this.metal < progressThisTick) {
                                progressThisTick = this.metal;
                            }
                            
                            if (progressThisTick > 0) {
                                if (!(enabledKey in this.structureConstructionProgress)) {
                                    this.structureConstructionProgress[enabledKey] = 0.0;
                                }
                                this.structureConstructionProgress[enabledKey] += progressThisTick;
                                this.metal -= progressThisTick;
                                this.metal = Math.max(0, this.metal);
                                
                                // Check if structure is complete
                                if (this.structureConstructionProgress[enabledKey] >= costMetal) {
                                    // Complete the structure - add to zone
                                    if (!(buildingZoneId in this.structuresByZone)) {
                                        this.structuresByZone[buildingZoneId] = {};
                                    }
                                    if (!(buildingId in this.structuresByZone[buildingZoneId])) {
                                        this.structuresByZone[buildingZoneId][buildingId] = 0;
                                    }
                                    this.structuresByZone[buildingZoneId][buildingId] += 1;
                                    
                                    // Legacy: also update global structure count
                                    if (!(buildingId in this.structures)) {
                                        this.structures[buildingId] = 0;
                                    }
                                    this.structures[buildingId] += 1;
                                    
                                    // Invalidate structure cache
                                    const cache = window.calculationCache;
                                    if (cache) {
                                        cache.invalidateStructures();
                                    }
                                    
                                    // If still enabled, start next one immediately
                                    if (this.enabledConstruction.has(enabledKey)) {
                                        this.structureConstructionProgress[enabledKey] = 0.0;
                                    } else {
                                        // Not enabled anymore, remove from progress
                                        delete this.structureConstructionProgress[enabledKey];
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            // Clean up invalid structures from progress
            const structuresToRemove = [];
            for (const enabledKey of Object.keys(this.structureConstructionProgress)) {
                const [zoneId, buildingId] = enabledKey.split('::', 2);
                if (!zoneId || !buildingId) {
                    structuresToRemove.push(enabledKey);
                    continue;
                }
                
                const building = this.dataLoader.getBuildingById(buildingId);
                if (!building) {
                    structuresToRemove.push(enabledKey);
                    continue;
                }
                const costMetal = building.base_cost_metal || 0;
                if (costMetal <= 0) {
                    structuresToRemove.push(enabledKey);
                    continue;
                }
                
                // If disabled and not in progress (progress is 0), remove it
                if (!this.enabledConstruction.has(enabledKey)) {
                    const progress = this.structureConstructionProgress[enabledKey];
                    if (progress <= 0) {
                        structuresToRemove.push(enabledKey);
                    }
                }
            }
            
            for (const enabledKey of structuresToRemove) {
                delete this.structureConstructionProgress[enabledKey];
            }
        }
        
        // Intelligence/FLOPS is a production rate, not an accumulated resource
        // We don't store it - it's consumed directly by research projects
        
        // Recalculate dexterity
        this.dexterity = this._calculateDexterity();
        
        // Update Dyson sphere construction (using probes allocated to "dyson" activity)
        // Get probes allocated to Dyson construction from zone activities
        const dysonZoneId = 'dyson_sphere';
        let dysonConstructionRateKgS = 0.0;
        
        // Calculate zone activities to get Dyson probe allocation
        const zoneActivities = this._calculateZoneActivities();
        const dysonProbes = zoneActivities[dysonZoneId]?.dyson || 0;
        
        if (dysonProbes > 0) {
            // Base rate: 100 kg/day per probe (PROBE_BUILD_RATE)
            const baseDysonRate = dysonProbes * Config.PROBE_BUILD_RATE;
            
            // Apply throttling (use throttles calculated earlier in tick)
            // buildEnergyThrottle and otherMetalThrottle are calculated before this point
            dysonConstructionRateKgS = baseDysonRate * buildEnergyThrottle * otherMetalThrottle;
            
            // Apply research bonuses
            const researchBonus = this._getResearchBonus('dyson_swarm_construction', 'dyson_construction_rate_multiplier', 1.0);
            dysonConstructionRateKgS *= researchBonus;
            
            // Store throttled rate for display in getState()
            this.lastDysonConstructionRate = dysonConstructionRateKgS;
        } else {
            // No Dyson construction this tick
            this.lastDysonConstructionRate = 0.0;
        }
        
        this._updateDysonSphereConstruction(deltaTime, dysonConstructionRateKgS);
        
        // Update probe counts from transfers (ingoing and outgoing)
        this._updateZoneProbeCounts(deltaTime);
        
        // Check zone depletion
        this._checkZoneDepletion();
        
        // Recycle slag
        this._recycleSlag(deltaTime);
    }
    
    _updateZoneProbeCounts(deltaTime) {
        // Centralized method to update probe counts in all zones
        // This handles:
        // 1. Ingoing transfers (probes arriving at zones)
        // 2. Outgoing transfers (probes departing from zones)
        // Note: Probe production from replication and factories is handled in tick() 
        // before this method is called
        
        // Process all transfers (handles both ingoing and outgoing)
        this._processTransfers(deltaTime);
    }
    
    _processTransfers(deltaTime) {
        if (!this.activeTransfers || this.activeTransfers.length === 0) return;
        
        const currentTime = this.time;
        
        // Process each active transfer
        for (let i = this.activeTransfers.length - 1; i >= 0; i--) {
            const transfer = this.activeTransfers[i];
            
            // Skip if paused
            if (transfer.paused) {
                continue;
            }
            
            // Ensure zones exist in probesByZone
            if (!(transfer.from in this.probesByZone)) {
                this.probesByZone[transfer.from] = {'probe': 0};
            }
            if (!(transfer.to in this.probesByZone)) {
                this.probesByZone[transfer.to] = {'probe': 0};
            }
            
            if (transfer.type === 'one-time') {
                // One-time transfer: probes already removed when transfer was created
                // Just check if they've arrived
                if (transfer.arrivalTime && transfer.arrivalTime <= currentTime) {
                    // All probes have arrived - add them to destination
                    const probesToAdd = Math.floor(transfer.totalCount || transfer.count || 0);
                    if (probesToAdd > 0) {
                        const currentTo = Math.floor(this.probesByZone[transfer.to].probe || 0);
                        this.probesByZone[transfer.to].probe = currentTo + probesToAdd;
                    }
                    // Transfer complete - remove it
                    this.activeTransfers.splice(i, 1);
                    continue;
                }
                // Otherwise, probes are still in transit - nothing to do this tick
            } else {
                // Continuous transfer
                // Initialize transit queue if not present
                if (!transfer.inTransit) {
                    transfer.inTransit = [];
                }
                
                // Process arrivals: probes that have reached their arrival time
                let totalArriving = 0;
                transfer.inTransit = transfer.inTransit.filter(transit => {
                    if (transit.arrivalTime <= currentTime) {
                        totalArriving += transit.count || 0;
                        return false; // Remove from transit
                    }
                    return true; // Keep in transit
                });
                
                // Add arriving probes to destination zone
                if (totalArriving > 0) {
                    const currentTo = Math.floor(this.probesByZone[transfer.to].probe || 0);
                    const totalArrivingInt = Math.floor(totalArriving);
                    this.probesByZone[transfer.to].probe = currentTo + totalArrivingInt;
                }
                
                // Constantly recalculate transfer rate based on current probes in the source zone
                // Send a percentage of current probes per day (e.g., 10% of current drones per day)
                const sourceZoneProbes = (this.probesByZone[transfer.from] && this.probesByZone[transfer.from].probe) || 0;
                
                // Calculate sending rate as percentage of current probes (stored in ratePercentage)
                const ratePercentage = transfer.ratePercentage || 0;
                const actualSendingRate = (sourceZoneProbes * ratePercentage) / 100.0; // probes per day
                
                // Update the transfer rate to reflect current production
                transfer.rate = actualSendingRate;
                
                // Transfers don't consume energy - probes use their own propulsion drives
                
                // Calculate probes to send this tick
                const probesToSendThisTick = actualSendingRate * deltaTime;
                
                // Get available probes in source zone
                const availableProbes = this.probesByZone[transfer.from].probe || 0;
                
                if (probesToSendThisTick > 0 && availableProbes > 0) {
                    // Limit to available probes and ensure integer
                    const probesToSend = Math.floor(Math.min(probesToSendThisTick, availableProbes));
                    
                    // Remove probes from source immediately (ensure integer)
                    const currentFrom = Math.floor(this.probesByZone[transfer.from].probe || 0);
                    this.probesByZone[transfer.from].probe = Math.max(0, currentFrom - probesToSend);
                    
                    // Add to transit queue - they'll arrive after transferTime (in days)
                    const transferTime = transfer.transferTime || 90.0; // Default: 3 months = 90 days
                    const arrivalTime = currentTime + transferTime;
                    transfer.inTransit.push({
                        count: probesToSend,
                        departureTime: currentTime,
                        arrivalTime: arrivalTime
                    });
                }
            }
        }
    }
    
    _calculateEnergyProduction() {
        /** Calculate energy production rate.
        
        Includes:
        - Dyson sphere energy production (from mass × 5 kW/kg, modified by energy collection skills)
        - Energy structure production (solar arrays, etc., modified by energy collection skill)
        
        Dyson sphere power is allocated between economy (energy) and compute based on slider.
        Allocation: dyson_power_allocation (0 = all economy, 100 = all compute)
        */
        let rate = 0.0;
        
        // Dyson sphere power allocation
        // Slider 0-50%: linear from 100% economy to 0% economy (0% compute to 100% compute nominal)
        // Slider 50-100%: 0% economy (100% compute nominal + overclocking)
        const computePowerSlider = this.dysonPowerAllocation || 0;
        let economyFraction = 1.0;
        if (computePowerSlider <= 50) {
            // 0-50%: linear from 100% economy to 0% economy
            economyFraction = (50 - computePowerSlider) / 50.0;
        } else {
            // Above 50%: 0% economy (all goes to compute, including overclocking)
            economyFraction = 0.0;
        }
        
        if (this.dysonSphereMass >= this.getDysonTargetMass()) {
            // Complete Dyson sphere: all star's power
            // Sun's total power output: ~3.8e26 W
            const sunTotalPower = 3.8e26; // watts
            // Allocate based on slider
            rate += sunTotalPower * economyFraction;
        } else {
            // During construction: use getDysonEnergyProduction() which applies skill modifiers
            const dysonPower = this.getDysonEnergyProduction();
            // Allocate based on slider
            rate += dysonPower * economyFraction;
        }
        
        // Energy structures (solar arrays, reactors, etc.)
        // Apply energy collection skill modifiers
        const energyCollectionMultiplier = this.getSkillValue('energy_collection');
        
        // Load orbital zones for distance calculations
        const zoneMap = {};
        if (this.dataLoader.orbitalZones) {
            for (const zone of this.dataLoader.orbitalZones) {
                zoneMap[zone.id] = zone;
            }
        }
        
        // Check zone-based structures (new system)
        for (const [zoneId, zoneStructures] of Object.entries(this.structuresByZone)) {
            for (const [buildingId, count] of Object.entries(zoneStructures)) {
                const building = this.dataLoader.getBuildingById(buildingId);
                if (building) {
                    const category = this._getBuildingCategory(buildingId);
                    if (category === 'energy') {
                        const effects = building.effects || {};
                        let energyOutput = effects.energy_production_per_second || 0;
                        
                        // Apply orbital efficiency for this zone
                        let orbitalEfficiency = 1.0;
                        if (building.orbital_efficiency && building.orbital_efficiency[zoneId] !== undefined) {
                            orbitalEfficiency = building.orbital_efficiency[zoneId];
                        }
                        
                        energyOutput *= orbitalEfficiency;
                        
                        // Apply solar distance modifier (inverse square law)
                        // Power is proportional to 1/distance², with Earth (1.0 AU) as baseline
                        let solarDistanceModifier = 1.0;
                        if (zoneId in zoneMap) {
                            const zone = zoneMap[zoneId];
                            const radiusAu = zone.radius_au || 1.0;
                            if (radiusAu > 0) {
                                // Inverse square law: power at distance d = power_at_earth * (1.0 / d)²
                                solarDistanceModifier = Math.pow(1.0 / radiusAu, 2);
                            }
                        }
                        energyOutput *= solarDistanceModifier;
                        
                        // Apply energy collection skill multiplier
                        energyOutput *= energyCollectionMultiplier;
                        
                        rate += energyOutput * count;
                    }
                }
            }
        }
        
        // Also check legacy global structures for backward compatibility
        for (const [buildingId, count] of Object.entries(this.structures)) {
            // Skip if already counted in zone structures
            let alreadyCounted = false;
            for (const zoneStructures of Object.values(this.structuresByZone)) {
                if (zoneStructures[buildingId]) {
                    alreadyCounted = true;
                    break;
                }
            }
            if (alreadyCounted) continue;
            
            const building = this.dataLoader.getBuildingById(buildingId);
            if (building) {
                const category = this._getBuildingCategory(buildingId);
                if (category === 'energy') {
                    const effects = building.effects || {};
                    let energyOutput = effects.energy_production_per_second || 0;
                    
                    // Apply orbital efficiency (for now use default zone)
                    const defaultZone = 'earth';
                    let orbitalEfficiency = 1.0;
                    if (building.orbital_efficiency) {
                        orbitalEfficiency = building.orbital_efficiency[defaultZone] || 1.0;
                    }
                    
                    energyOutput *= orbitalEfficiency;
                    
                    // Legacy structures default to Earth distance (1.0 AU = no modifier)
                    // solarDistanceModifier = 1.0 (Earth baseline)
                    
                    // Apply energy collection skill multiplier
                    energyOutput *= energyCollectionMultiplier;
                    
                    rate += energyOutput * count;
                }
            }
        }
        
        return rate;
    }
    _calculateEnergyStorageCapacity() {
        // Calculate total energy storage capacity from storage buildings.
        // Returns total storage capacity in watt-days
        let capacity = 0.0;
        
        // Get research bonus for storage capacity if applicable
        const storageCapacityMultiplier = this._getResearchBonus('energy_storage', 'energy_storage_capacity_multiplier', 1.0);
        
        // Check structures by zone
        for (const [zoneId, zoneStructures] of Object.entries(this.structuresByZone)) {
            for (const [buildingId, count] of Object.entries(zoneStructures)) {
                const building = this.dataLoader.getBuildingById(buildingId);
                if (building) {
                    const category = this._getBuildingCategory(buildingId);
                    if (category === 'storage') {
                        const effects = building.effects || {};
                        const storageCapacity = effects.energy_storage_capacity || 0.0;
                        capacity += storageCapacity * count;
                    }
                }
            }
        }
        
        // Legacy global structures for backward compatibility
        for (const [buildingId, count] of Object.entries(this.structures)) {
            // Skip if already counted in zone structures
            let alreadyCounted = false;
            for (const zoneStructures of Object.values(this.structuresByZone)) {
                if (zoneStructures[buildingId]) {
                    alreadyCounted = true;
                    break;
                }
            }
            if (alreadyCounted) continue;
            
            const building = this.dataLoader.getBuildingById(buildingId);
            if (building) {
                const category = this._getBuildingCategory(buildingId);
                if (category === 'storage') {
                    const effects = building.effects || {};
                    const storageCapacity = effects.energy_storage_capacity || 0.0;
                    capacity += storageCapacity * count;
                }
            }
        }
        
        // Apply research bonus
        capacity *= storageCapacityMultiplier;
        
        return capacity;
    }
    _calculateEnergyConsumption() {
        // Get research bonuses first
        const computerReduction = this._getResearchBonus('computer_systems', 'probe_energy_cost_reduction', 0.0);
        const propulsionReduction = this._getResearchBonus('propulsion_systems', 'dexterity_energy_cost_reduction', 0.0);
        const productionEfficiencyBonus = this._getResearchBonus('production_efficiency', 'energy_efficiency_bonus', 1.0);
        
        let consumption = 0.0;
        
        // Probe base energy consumption removed - probes only consume energy when actively:
        // - Harvesting (mining)
        // - Building (constructing structures/probes)
        // - Constructing Dyson sphere
        
        // Structure energy consumption - iterate through zones
        for (const [zoneId, structures] of Object.entries(this.structuresByZone)) {
            for (const [buildingId, count] of Object.entries(structures)) {
                const building = this.dataLoader.getBuildingById(buildingId);
                if (building) {
                    const effects = building.effects || {};
                    const energyCost = effects.energy_consumption_per_second || 0;
                    consumption += energyCost * count;
                }
            }
        }
        
        // Harvesting energy cost (based on harvest zone delta-v) - apply propulsion reduction
        const harvestAllocation = this.probeAllocations.harvest || {};
        const totalHarvestProbes = Object.values(harvestAllocation).reduce((a, b) => a + b, 0);
        if (totalHarvestProbes > 0) {
            const zones = this.dataLoader.orbitalZones || [];
            const harvestZoneData = zones.find(z => z.id === this.harvestZone) || null;
            if (harvestZoneData) {
                // Energy cost is quadratic in delta-v penalty
                const deltaVPenalty = harvestZoneData.delta_v_penalty || 0.1;
                const baseEnergyCost = 453515; // watts per kg/s at Earth baseline
                const energyCostPerKgS = baseEnergyCost * Math.pow(1.0 + deltaVPenalty, 2);
                const harvestRatePerProbe = Config.PROBE_HARVEST_RATE; // kg/s per probe
                let harvestEnergyCost = energyCostPerKgS * harvestRatePerProbe * totalHarvestProbes;
                
                // Apply propulsion systems reduction to harvesting costs
                harvestEnergyCost *= (1.0 - propulsionReduction);
                consumption += harvestEnergyCost;
            }
        }
        
        // Probe construction energy cost (converted to per-day)
        // Energy cost: 250000 W / (kg/s) = 250000 / 86400 W / (kg/day) ≈ 2.8935 W per kg/day
        const ENERGY_COST_PER_KG_DAY = 250000 / 86400; // W per kg/day
        const [probeProdRates, , factoryMetalCostPerProbe] = this._calculateProbeProduction();
        const totalProbeProductionRate = Object.values(probeProdRates).reduce((a, b) => a + b, 0); // probes/day
        // Use factory metal cost if available, otherwise default
        const metalCostPerProbe = factoryMetalCostPerProbe > 0 ? factoryMetalCostPerProbe : Config.PROBE_MASS;
        const probeConstructionRateKgDay = totalProbeProductionRate * metalCostPerProbe;
        const probeConstructionEnergyCost = probeConstructionRateKgDay * ENERGY_COST_PER_KG_DAY;
        consumption += probeConstructionEnergyCost;
        
        // Structure construction energy cost
        const constructAllocation = this.probeAllocations.construct || {};
        const constructingProbes = Object.values(constructAllocation).reduce((a, b) => a + b, 0);
        const structureConstructingPower = constructingProbes * (1.0 - this.buildAllocation / 100.0);
        const structureConstructionRateKgDay = structureConstructingPower * Config.PROBE_BUILD_RATE; // kg/day per probe
        const structureConstructionEnergyCost = structureConstructionRateKgDay * ENERGY_COST_PER_KG_DAY;
        consumption += structureConstructionEnergyCost;
        
        // Dyson construction energy cost
        const dysonConstructionRate = this._calculateDysonConstructionRate();
        const dysonConstructionEnergyCost = dysonConstructionRate * ENERGY_COST_PER_KG_DAY;
        consumption += dysonConstructionEnergyCost;
        
        // Compute energy consumption: 1 kW per PFLOPS/s (only if research projects active)
        const computeDemandFlops = this._calculateComputeDemand();
        if (computeDemandFlops > 0) {
            const computeDemandPflops = computeDemandFlops / 1e15;
            const baseComputePowerDraw = computeDemandPflops * 1000; // 1000W = 1 kW per PFLOPS/s
            const computeEfficiency = this._getResearchBonus('computer_systems', 'compute_power_efficiency', 1.0);
            const computePowerDraw = computeEfficiency > 0 ? baseComputePowerDraw / computeEfficiency : baseComputePowerDraw;
            consumption += computePowerDraw;
        }
        
        // Apply production efficiency bonus (multiplicative, divides consumption)
        if (productionEfficiencyBonus > 1.0) {
            consumption /= productionEfficiencyBonus;
        }
        
        return Math.max(0, consumption);
    }
    _calculateNonComputeEnergyConsumption() {
        // Returns total non-compute energy consumption
        const breakdown = this._calculateEnergyConsumptionBreakdown();
        return breakdown.total;
    }
    
    _calculateEnergyConsumptionBreakdown() {
        // Returns breakdown of energy consumption: {mining: W, build: W, total: W}
        // Mining includes: harvest activities
        // Build includes: probe replication, structure construction, Dyson construction
        
        // Get research bonuses
        const computerReduction = this._getResearchBonus('computer_systems', 'probe_energy_cost_reduction', 0.0);
        const propulsionReduction = this._getResearchBonus('propulsion_systems', 'dexterity_energy_cost_reduction', 0.0);
        const productionEfficiencyBonus = this._getResearchBonus('production_efficiency', 'energy_efficiency_bonus', 1.0);
        
        let miningConsumption = 0.0;
        let buildConsumption = 0.0;
        
        // Probe base energy consumption removed - probes only consume energy when actively:
        // - Harvesting (mining)
        // - Building (constructing structures/probes)
        // - Constructing Dyson sphere
        
        // Structure energy consumption - iterate through zones (counts as build)
        for (const [zoneId, structures] of Object.entries(this.structuresByZone)) {
            for (const [buildingId, count] of Object.entries(structures)) {
                const building = this.dataLoader.getBuildingById(buildingId);
                if (building) {
                    const effects = building.effects || {};
                    const energyCost = effects.energy_consumption_per_second || 0;
                    buildConsumption += energyCost * count;
                }
            }
        }
        
        // Harvesting energy cost - calculate per zone (MINING)
        const zones = this.dataLoader.orbitalZones || [];
        for (const zone of zones) {
            const zoneId = zone.id;
            const zoneData = zone;
            
            // Skip Dyson zone - no mining allowed
            if (zoneData.is_dyson_zone) {
                continue;
            }
            
            const zoneAllocations = this.probeAllocationsByZone[zoneId] || {};
            const harvestAllocation = zoneAllocations.harvest || {};
            const totalHarvestProbes = Object.values(harvestAllocation).reduce((a, b) => a + b, 0);
            
            if (totalHarvestProbes > 0) {
                const deltaVPenalty = zone.delta_v_penalty || 0.1;
                const miningEnergyCostMultiplier = zone.mining_energy_cost_multiplier || 1.0;
                const miningRateMultiplier = zone.mining_rate_multiplier || 1.0;
                
                const baseEnergyCost = 453515 / 86400; // watts per kg/day at Earth baseline (converted from per-second)
                const energyCostPerKgDay = baseEnergyCost * Math.pow(1.0 + deltaVPenalty, 2) * miningEnergyCostMultiplier;
                const harvestRatePerProbe = Config.PROBE_HARVEST_RATE * miningRateMultiplier; // kg/day per probe
                let harvestEnergyCost = energyCostPerKgDay * harvestRatePerProbe * totalHarvestProbes;
                harvestEnergyCost *= (1.0 - propulsionReduction);
                miningConsumption += harvestEnergyCost;
            }
        }
        
        // Energy cost constant: 250kW per kg/s = 250000 / 86400 W per kg/day
        const ENERGY_COST_PER_KG_DAY = 250000 / 86400; // W per kg/day
        
        // Probe construction energy cost (BUILD - replication)
        const [probeProdRates, , factoryMetalCostPerProbe] = this._calculateProbeProduction();
        const totalProbeProductionRate = Object.values(probeProdRates).reduce((a, b) => a + b, 0);
        const metalCostPerProbe = factoryMetalCostPerProbe > 0 ? factoryMetalCostPerProbe : Config.PROBE_MASS;
        const probeConstructionRateKgDay = totalProbeProductionRate * metalCostPerProbe;
        const probeConstructionEnergyCost = probeConstructionRateKgDay * ENERGY_COST_PER_KG_DAY;
        buildConsumption += probeConstructionEnergyCost;
        
        // Structure construction energy cost (BUILD - structures)
        // Calculate from construct allocations
        let structureConstructionEnergyCost = 0.0;
        for (const [zoneId, zoneAllocations] of Object.entries(this.probeAllocationsByZone)) {
            const constructAllocation = zoneAllocations.construct || {};
            const constructingProbes = Object.values(constructAllocation).reduce((a, b) => a + b, 0);
            const zonePolicy = this.zonePolicies[zoneId] || {};
            const replicationSlider = zonePolicy.replication_slider !== undefined ? zonePolicy.replication_slider : 50;
            const constructFraction = 1.0 - (replicationSlider / 100.0); // Fraction going to construct (not replicate)
            const structureBuildingProbes = constructingProbes * constructFraction;
            if (structureBuildingProbes > 0) {
                const structureConstructionRateKgDay = structureBuildingProbes * Config.PROBE_BUILD_RATE;
                structureConstructionEnergyCost += structureConstructionRateKgDay * ENERGY_COST_PER_KG_DAY;
            }
        }
        buildConsumption += structureConstructionEnergyCost;
        
        // Dyson construction energy cost (BUILD)
        const dysonConstructionRate = this._calculateDysonConstructionRate();
        const dysonConstructionEnergyCost = dysonConstructionRate * ENERGY_COST_PER_KG_DAY;
        buildConsumption += dysonConstructionEnergyCost;
        
        // No base probe consumption - probes only consume energy when actively working
        // (harvesting, building, or constructing Dyson)
        
        // Apply production efficiency bonus
        if (productionEfficiencyBonus > 1.0) {
            miningConsumption /= productionEfficiencyBonus;
            buildConsumption /= productionEfficiencyBonus;
        }
        
        return {
            mining: Math.max(0, miningConsumption),
            build: Math.max(0, buildConsumption),
            total: Math.max(0, miningConsumption + buildConsumption)
        };
    }
    _calculateMetalProduction() {
        let totalMetalRate = 0.0;
        let totalSlagRate = 0.0;
        const zoneMetalDepletion = {};
        const zoneSlagDepletion = {};
        const zones = this.dataLoader.orbitalZones || [];
        
        // Initialize zone depletion
        for (const zoneId of Object.keys(this.zoneMetalRemaining)) {
            zoneMetalDepletion[zoneId] = 0.0;
            zoneSlagDepletion[zoneId] = 0.0;
        }
        
        // Research bonuses (apply to all zones)
        const researchBonus = this._getResearchBonus('production_efficiency', 'harvest_efficiency_multiplier', 1.0);
        
        // Calculate mining per zone
        for (const zone of zones) {
            const zoneId = zone.id;
            const zoneData = zone;
            
            // Explicitly skip Dyson zone - no mining allowed
            if (zoneData.is_dyson_zone) {
                continue;
            }
            
            const metalPercentage = zoneData.metal_percentage || 0.32; // Default to Earth-like
            const slagPercentage = 1.0 - metalPercentage;
            const miningRateMultiplier = zoneData.mining_rate_multiplier || 1.0;
            
            // Skip if zone is depleted
            if (this.zoneDepleted[zoneId] || this.zoneMetalRemaining[zoneId] <= 0) {
                continue;
            }
            
            // Get probes allocated to harvest in this zone
            const zoneAllocations = this.probeAllocationsByZone[zoneId] || {};
            const harvestAllocation = zoneAllocations.harvest || {};
            
            // Calculate mining from probes in this zone
            for (const [probeType, count] of Object.entries(harvestAllocation)) {
                if (count > 0.001) { // Small threshold to handle floating point
                    const baseDexterity = Probe.getBaseDexterity(probeType);
                    const effects = Probe.getEffects(probeType);
                    const harvestMultiplier = effects.harvest_efficiency_multiplier || 1.0;
                    
                    // Base harvest rate per probe (kg/day total material)
                    let baseHarvestRate = Config.PROBE_HARVEST_RATE; // 100.0 kg/day per probe
                    
                    // Apply research bonuses for mining rate
                    const miningRateBonus = this._getResearchBonus('production_efficiency', 'mining_rate_multiplier', 1.0);
                    baseHarvestRate *= miningRateBonus;
                    
                    // Apply zone-specific mining rate multiplier
                    const zoneHarvestRatePerProbe = baseHarvestRate * baseDexterity * harvestMultiplier * miningRateMultiplier;
                    const totalHarvestRate = zoneHarvestRatePerProbe * count;
                    
                    // Mining extracts metal (slag is produced from the non-metal portion)
                    const metalRate = totalHarvestRate * metalPercentage;
                    
                    // Limit by zone metal remaining
                    const metalRemaining = this.zoneMetalRemaining[zoneId] || 0;
                    const effectiveMetalRate = Math.min(metalRate, metalRemaining);
                    
                    // Slag is produced from mining (calculated when metal is actually mined)
                    // Return slag rate for tracking (but it's produced, not depleted)
                    const slagRate = effectiveMetalRate * (slagPercentage / metalPercentage);
                    
                    zoneMetalDepletion[zoneId] = (zoneMetalDepletion[zoneId] || 0) + effectiveMetalRate;
                    totalMetalRate += effectiveMetalRate;
                    totalSlagRate += slagRate; // Track slag production rate
                }
            }
            
            // Mining structures in this zone
            const zoneStructures = this.structuresByZone[zoneId] || {};
            for (const [buildingId, count] of Object.entries(zoneStructures)) {
                const building = this.dataLoader.getBuildingById(buildingId);
                if (building) {
                    const category = this._getBuildingCategory(buildingId);
                    if (category === 'mining') {
                        const effects = building.effects || {};
                        // New system: mining produces metal per day, convert to per second
                        const metalPerDay = effects.metal_production_per_day || 0;
                        const metalPerSecond = metalPerDay; // At 1x speed, 1 day = 1 second
                        
                        // Apply zone mining rate multiplier
                        const zoneMetalOutput = metalPerSecond * miningRateMultiplier;
                        
                        // Limit by zone metal remaining
                        const zoneMetal = this.zoneMetalRemaining[zoneId] || 0;
                        if (zoneMetal > 0) {
                            const structureRate = zoneMetalOutput * count;
                            const zoneContribution = Math.min(structureRate, zoneMetal);
                            zoneMetalDepletion[zoneId] = (zoneMetalDepletion[zoneId] || 0) + zoneContribution;
                            totalMetalRate += zoneContribution;
                        }
                    }
                }
            }
        }
        
        // Apply research bonus to total rates and zone depletion
        totalMetalRate *= researchBonus;
        totalSlagRate *= researchBonus;
        for (const zoneId of Object.keys(zoneMetalDepletion)) {
            zoneMetalDepletion[zoneId] *= researchBonus;
        }
        
        // Return empty zoneSlagDepletion (slag is produced, not depleted)
        return [totalMetalRate, zoneMetalDepletion, totalSlagRate, {}];
    }
    _calculateProbeProduction() {
        const rates = {'probe': 0.0}; // Single probe type only
        const idleProbes = {'probes': 0.0, 'structures': 0.0};
        
        // Factory production (zone-based) - factories produce probes in their zone
        let totalFactoryRate = 0.0;
        let totalFactoryMetalCost = 0.0;
        const factoryProductionByZone = {}; // Track production per zone
        
        // Check structures by zone (new system)
        for (const [zoneId, zoneStructures] of Object.entries(this.structuresByZone)) {
            for (const [buildingId, count] of Object.entries(zoneStructures)) {
                const building = this.dataLoader.getBuildingById(buildingId);
                if (building) {
                    const category = this._getBuildingCategory(buildingId);
                    if (category === 'factories') {
                        const effects = building.effects || {};
                        // Factories produce probes per day (fundamental time unit)
                        const probeProductionPerDay = effects.probe_production_per_day || 0.0;
                        const metalPerProbe = effects.metal_per_probe || Config.PROBE_MASS;
                        
                        // Each factory produces probes at its rate in this zone
                        const factoryProbeRate = probeProductionPerDay * count; // probes/day
                        const factoryMetalCost = factoryProbeRate * metalPerProbe; // kg/day metal cost
                        
                        totalFactoryRate += factoryProbeRate; // probes/day
                        totalFactoryMetalCost += factoryMetalCost; // kg/day metal cost
                        
                        // Track production per zone (in probes/day and kg/day metal cost)
                        if (!factoryProductionByZone[zoneId]) {
                            factoryProductionByZone[zoneId] = {rate: 0.0, metalCost: 0.0};
                        }
                        factoryProductionByZone[zoneId].rate += factoryProbeRate;
                        factoryProductionByZone[zoneId].metalCost += factoryMetalCost;
                    }
                }
            }
        }
        
        // Also check legacy global structures for backward compatibility
        for (const [buildingId, count] of Object.entries(this.structures)) {
            // Skip if already counted in zone structures
            let alreadyCounted = false;
            for (const zoneStructures of Object.values(this.structuresByZone)) {
                if (zoneStructures[buildingId]) {
                    alreadyCounted = true;
                    break;
                }
            }
            if (alreadyCounted) continue;
            
            const building = this.dataLoader.getBuildingById(buildingId);
            if (building) {
                const category = this._getBuildingCategory(buildingId);
                if (category === 'factories') {
                    const effects = building.effects || {};
                    // Factories produce probes per day, convert to per second
                    const probeProductionPerDay = effects.probe_production_per_day || 0.0;
                    const metalPerProbe = effects.metal_per_probe || Config.PROBE_MASS;
                    
                    const factoryProbeRate = probeProductionPerDay * count; // probes/day
                    const factoryMetalCost = factoryProbeRate * metalPerProbe;
                    
                    totalFactoryRate += factoryProbeRate;
                    totalFactoryMetalCost += factoryMetalCost;
                    
                    // Add to default zone
                    if (!factoryProductionByZone[this.defaultZone]) {
                        factoryProductionByZone[this.defaultZone] = {rate: 0.0, metalCost: 0.0};
                    }
                    factoryProductionByZone[this.defaultZone].rate += factoryProbeRate;
                    factoryProductionByZone[this.defaultZone].metalCost += factoryMetalCost;
                }
            }
        }
        
        // Store factory production by zone for use in tick()
        this.factoryProductionByZone = factoryProductionByZone;
        
        // Calculate weighted average metal cost per probe for factories
        let factoryMetalCostPerProbe = Config.PROBE_MASS; // Default if no factories (use manual probe cost)
        if (totalFactoryRate > 0) {
            factoryMetalCostPerProbe = totalFactoryMetalCost / totalFactoryRate;
        }
        
        // Manual probe building (probes building other probes) - use zone-based replicate allocations
        // Ensure probeAllocationsByZone exists
        if (!this.probeAllocationsByZone) {
            this.probeAllocationsByZone = {};
        }
        
        // Ensure zonePolicies exists
        if (!this.zonePolicies) {
            this.zonePolicies = {};
        }
        
        let totalReplicatingProbes = 0;
        
        // First, get direct replicate allocations
        for (const [zoneId, zoneAllocations] of Object.entries(this.probeAllocationsByZone)) {
            if (zoneAllocations && zoneAllocations.replicate) {
                const replicateAllocation = zoneAllocations.replicate || {};
                totalReplicatingProbes += Object.values(replicateAllocation).reduce((a, b) => a + b, 0);
            }
        }
        
        // Also add construct allocations that are set to replicate (based on zone replication_slider)
        for (const [zoneId, zoneAllocations] of Object.entries(this.probeAllocationsByZone)) {
            if (zoneAllocations && zoneAllocations.construct) {
                const constructAllocation = zoneAllocations.construct || {};
                const constructingProbes = Object.values(constructAllocation).reduce((a, b) => a + b, 0);
                if (constructingProbes > 0) {
                    const zonePolicy = this.zonePolicies[zoneId] || {};
                    const replicationSlider = zonePolicy.replication_slider !== undefined ? zonePolicy.replication_slider : 100;
                    const replicateFraction = replicationSlider / 100.0; // Fraction going to replicate (0 = all construct, 100 = all replicate)
                    totalReplicatingProbes += constructingProbes * replicateFraction;
                }
            }
        }
        
        // Manual build rate: 10.0 kg/day per probe, converted to probes/day
        // Apply research bonuses for building rate
        const buildingRateBonus = this._getResearchBonus('production_efficiency', 'building_rate_multiplier', 1.0);
        const effectiveBuildRate = Config.PROBE_BUILD_RATE * buildingRateBonus;
        const baseManualBuildRateKgS = totalReplicatingProbes * effectiveBuildRate; // kg/s per probe (with bonuses)
        const manualBuildRateProbesS = baseManualBuildRateKgS / factoryMetalCostPerProbe; // probes/s (theoretical)
        
        // Calculate metal production rate for limiting
        const [metalProductionRate] = this._calculateMetalProduction(); // Returns [metalRate, zoneMetalDepletion, slagRate, zoneSlagDepletion]
        
        // Total metal needed for probe production
        const totalProbeMetalNeeded = totalFactoryMetalCost + (manualBuildRateProbesS * factoryMetalCostPerProbe);
        
        // Check metal availability - limit production if no stored metal
        let effectiveFactoryRate = totalFactoryRate;
        let effectiveManualRate = manualBuildRateProbesS;
        
        if (this.metal <= 0 && metalProductionRate < totalProbeMetalNeeded) {
            // No stored metal and production < needed - limit proportionally
            if (totalProbeMetalNeeded > 0) {
                const scaleFactor = metalProductionRate / totalProbeMetalNeeded;
                effectiveFactoryRate = totalFactoryRate * scaleFactor;
                effectiveManualRate = manualBuildRateProbesS * scaleFactor;
                // Track idle production capacity
                idleProbes.probes = (totalFactoryRate + manualBuildRateProbesS) * (1.0 - scaleFactor);
            } else {
                effectiveFactoryRate = 0;
                effectiveManualRate = 0;
                idleProbes.probes = totalFactoryRate + manualBuildRateProbesS;
            }
        }
        
        // Distribute factory production across probe types (default to von neumann)
        rates.probe = effectiveFactoryRate + effectiveManualRate; // Combine factory and manual production
        
        // Calculate structure construction power for idle tracking (use zone-based construct allocations)
        let totalConstructingProbes = 0;
        for (const [zoneId, zoneAllocations] of Object.entries(this.probeAllocationsByZone)) {
            const constructAllocation = zoneAllocations.construct || {};
            totalConstructingProbes += Object.values(constructAllocation).reduce((a, b) => a + b, 0);
        }
        const structureConstructingPower = totalConstructingProbes; // All construct probes build structures (replicate is separate)
        
        // Track idle structure-building probes if applicable
        if (structureConstructingPower > 0 && this.metal <= 0 && metalProductionRate <= 0) {
            idleProbes.structures = structureConstructingPower;
        }
        
        return [rates, idleProbes, factoryMetalCostPerProbe];
    }
    _calculateIntelligenceProduction() {
        // Calculate nominal compute fraction based on slider
        // Slider 0-50%: linear from 0% to 100% compute (nominal)
        // Slider 50-100%: 100% compute (nominal) - overclocking handled in _calculateEffectiveIntelligenceProduction
        const computePowerSlider = this.dysonPowerAllocation || 0;
        let nominalComputeFraction = 0.0;
        if (computePowerSlider <= 50) {
            // 0-50%: linear from 0% to 100%
            nominalComputeFraction = computePowerSlider / 50.0;
        } else {
            // Above 50%: always 100% nominal (overclocking adds extra)
            nominalComputeFraction = 1.0;
        }
        
        let totalIntelligenceFlops = 0.0;
        
        // Dyson sphere compute (at 100% nominal = slider at 50%)
        const fullComputeFraction = 1.0; // Calculate as if at 100% nominal
        if (this.dysonSphereMass >= this.getDysonTargetMass()) {
            // Complete Dyson sphere: all star's power
            const sunTotalPower = 3.8e26; // watts
            // Calculate full compute, then apply nominal fraction
            const computePower = sunTotalPower * fullComputeFraction;
            totalIntelligenceFlops += computePower * 1e9 * nominalComputeFraction; // FLOPS/s
        } else {
            // While building: convert Dyson sphere power generation to compute
            // Use getDysonEnergyProduction() which applies skill modifiers
            const dysonPower = this.getDysonEnergyProduction();
            const computePower = dysonPower * fullComputeFraction;
            // Conversion: 1 W = 1e9 FLOPS/s
            totalIntelligenceFlops += computePower * 1e9 * nominalComputeFraction; // FLOPS/s
        }
        
        // Add compute from orbital data centers and other structures
        // Check zone-based structures (new system)
        for (const [zoneId, zoneStructures] of Object.entries(this.structuresByZone)) {
            for (const [buildingId, count] of Object.entries(zoneStructures)) {
                const building = this.dataLoader.getBuildingById(buildingId);
                if (building) {
                    const effects = building.effects || {};
                    const intelligenceOutputFlops = effects.intelligence_flops || 0;
                    if (intelligenceOutputFlops > 0) {
                        totalIntelligenceFlops += intelligenceOutputFlops * count;
                    } else {
                        // Legacy: convert from intelligence_production_per_second (for backward compatibility with old saves)
                        const intelligenceOutput = effects.intelligence_production_per_second || effects.intelligence_per_second || 0;
                        if (intelligenceOutput > 0) {
                            // Convert from per-second to FLOPS (assuming 1e12 FLOPS per unit)
                            totalIntelligenceFlops += intelligenceOutput * 1e12 * count;
                        }
                    }
                }
            }
        }
        
        // Also check legacy global structures for backward compatibility
        for (const [buildingId, count] of Object.entries(this.structures)) {
            // Skip if already counted in zone structures
            let alreadyCounted = false;
            for (const zoneStructures of Object.values(this.structuresByZone)) {
                if (zoneStructures[buildingId]) {
                    alreadyCounted = true;
                    break;
                }
            }
            if (alreadyCounted) continue;
            
            const building = this.dataLoader.getBuildingById(buildingId);
            if (building) {
                const effects = building.effects || {};
                const intelligenceOutputFlops = effects.intelligence_flops || 0;
                if (intelligenceOutputFlops > 0) {
                    totalIntelligenceFlops += intelligenceOutputFlops * count;
                } else {
                    // Legacy: convert from intelligence_per_second
                    const intelligenceOutput = effects.intelligence_production_per_second || effects.intelligence_per_second || 0;
                    totalIntelligenceFlops += intelligenceOutput * 1e12 * count;
                }
            }
        }
        
        return totalIntelligenceFlops;
    }
    
    _calculateEffectiveIntelligenceProduction(availableEnergyForCompute) {
        // Get the compute power slider value (0-100)
        const computePowerSlider = this.dysonPowerAllocation || 0;
        
        // Calculate nominal compute (at 50% slider = 100% of dyson power)
        // Slider 0-50%: linear from 0% to 100% of dyson power
        // Slider 50%: 100% of dyson power (nominal)
        let nominalComputeFraction = 0.0;
        if (computePowerSlider <= 50) {
            // 0-50%: linear from 0% to 100%
            nominalComputeFraction = computePowerSlider / 50.0;
        } else {
            // Above 50%: always 100% nominal
            nominalComputeFraction = 1.0;
        }
        
        // Calculate theoretical maximum compute from Dyson sphere at 100% nominal (slider at 50%)
        const fullComputeFraction = 1.0; // 100% of dyson power to compute
        
        let theoreticalMax = 0.0;
        if (this.dysonSphereMass >= this.getDysonTargetMass()) {
            // Complete Dyson sphere: all star's power
            const sunTotalPower = 3.8e26; // watts
            const computePower = sunTotalPower * fullComputeFraction;
            theoreticalMax = computePower * 1e9; // FLOPS/s
        } else {
            // While building: convert Dyson sphere power generation to compute
            const dysonPower = this.dysonSphereMass * 5000; // 5000W = 5 kW per kg
            const computePower = dysonPower * fullComputeFraction;
            theoreticalMax = computePower * 1e9; // FLOPS/s
        }
        
        // Apply nominal fraction
        theoreticalMax *= nominalComputeFraction;
        
        // Add compute from orbital data centers
        for (const [zoneId, zoneStructures] of Object.entries(this.structuresByZone)) {
            for (const [buildingId, count] of Object.entries(zoneStructures)) {
                const building = this.dataLoader.getBuildingById(buildingId);
                if (building) {
                    const effects = building.effects || {};
                    const intelligenceOutputFlops = effects.intelligence_flops || 0;
                    if (intelligenceOutputFlops > 0) {
                        theoreticalMax += intelligenceOutputFlops * count;
                    } else {
                        const intelligenceOutput = effects.intelligence_production_per_second || effects.intelligence_per_second || 0;
                        theoreticalMax += intelligenceOutput * 1e12 * count;
                    }
                }
            }
        }
        
        // Also check legacy global structures
        for (const [buildingId, count] of Object.entries(this.structures)) {
            let alreadyCounted = false;
            for (const zoneStructures of Object.values(this.structuresByZone)) {
                if (zoneStructures[buildingId]) {
                    alreadyCounted = true;
                    break;
                }
            }
            if (alreadyCounted) continue;
            
            const building = this.dataLoader.getBuildingById(buildingId);
            if (building) {
                const effects = building.effects || {};
                const intelligenceOutputFlops = effects.intelligence_flops || 0;
                if (intelligenceOutputFlops > 0) {
                    theoreticalMax += intelligenceOutputFlops * count;
                } else {
                    const intelligenceOutput = effects.intelligence_production_per_second || effects.intelligence_per_second || 0;
                    theoreticalMax += intelligenceOutput * 1e12 * count;
                }
            }
        }
        
        // If no theoretical compute, return 0
        if (theoreticalMax <= 0) {
            return 0.0;
        }
        
        // Default: 1 kW per PFLOPS/s = 1000 W per 1e15 FLOPS/s
        // So: 1 W = 1e12 FLOPS/s for energy-to-compute conversion
        const basePowerPerFlops = 1e-12; // watts per FLOPS (1 kW per PFLOPS)
        
        // Research modifiers for compute power efficiency
        const computeEfficiency = this._getResearchBonus('computer_systems', 'compute_power_efficiency', 1.0);
        // Efficiency > 1.0 means less power needed, so more FLOPS per watt
        const powerPerFlops = computeEfficiency > 0 ? basePowerPerFlops / computeEfficiency : basePowerPerFlops;
        
        // Calculate compute available from energy (nominal allocation)
        const computeFromEnergy = availableEnergyForCompute / powerPerFlops;
        
        // Base effective production is minimum of theoretical max and energy-limited
        let effectiveProduction = Math.min(theoreticalMax, computeFromEnergy);
        
        // Overclocking: if slider > 50%, add excess energy with log declining returns
        if (computePowerSlider > 50 && availableEnergyForCompute > 0) {
            // Calculate excess energy percentage: (slider - 50) * 2, capped at 100%
            const excessEnergyPercent = Math.min(100, (computePowerSlider - 50) * 2) / 100.0;
            
            // Find total energy available (need to get this from tick context)
            // For now, use availableEnergyForCompute as excess energy pool
            // In practice, this should be calculated from total energy minus all other consumption
            const excessEnergyPool = availableEnergyForCompute; // This is already excess after other consumption
            
            // Calculate excess energy to use
            const excessEnergyToUse = excessEnergyPool * excessEnergyPercent;
            
            // Convert excess energy to compute with logarithmic declining returns
            // Log returns: efficiency = 1 / (1 + excess_ratio)
            const excessComputeFromEnergy = excessEnergyToUse / powerPerFlops;
            const excessRatio = excessComputeFromEnergy / Math.max(1, theoreticalMax);
            const overclockEfficiency = 1.0 / (1.0 + excessRatio);
            const overclockCompute = excessComputeFromEnergy * overclockEfficiency;
            
            // Add overclock compute to effective production
            effectiveProduction += overclockCompute;
        }
        
        return effectiveProduction;
    }
    _calculateZoneActivities() {
        /**Calculate probe activities per zone based on zone policies.
        
        Returns: {zoneId: {'harvest': count, 'replicate': count, 'construct': count, 'dyson': count}}
        */
        const activities = {};
        const zones = this.dataLoader.orbitalZones || [];
        
        for (const zone of zones) {
            const zoneId = zone.id;
            const zoneProbes = this.probesByZone[zoneId]?.probe || 0;
            const policy = this.zonePolicies[zoneId] || {};
            
            if (zone.is_dyson_zone) {
                // Dyson zone: Two sliders
                // 1. Dyson allocation slider: splits between Dyson construction and Build
                // dyson_allocation_slider: 0 = all Build (bottom), 100 = all Dyson (top)
                // Fallback to dyson_build_slider for backward compatibility (inverted)
                let dysonAllocationSlider = policy.dyson_allocation_slider;
                if (dysonAllocationSlider === undefined) {
                    // Backward compatibility: invert dyson_build_slider
                    const dysonBuildSlider = policy.dyson_build_slider !== undefined ? policy.dyson_build_slider : 90;
                    dysonAllocationSlider = 100 - dysonBuildSlider;
                }
                const dysonFraction = dysonAllocationSlider / 100.0;  // 0 = all Build, 100 = all Dyson
                const dysonBuildCount = zoneProbes * dysonFraction;
                const buildCount = zoneProbes * (1.0 - dysonFraction);  // Remaining goes to Build
                
                // 2. Replication slider: splits Build between structures and replicate
                // replication_slider: 0 = all structures, 100 = all replicate
                const replicationSlider = (policy.replication_slider !== undefined ? policy.replication_slider : 100) / 100.0;
                const replicateCount = buildCount * replicationSlider;
                const constructCount = buildCount * (1.0 - replicationSlider);
                
                activities[zoneId] = {
                    'construct': constructCount,  // Building structures
                    'replicate': replicateCount,  // Replicating probes
                    'harvest': 0,
                    'dyson': dysonBuildCount  // Building Dyson
                };
            } else {
                // Regular zones: mining vs replication/construction
                const miningSlider = (policy.mining_slider !== undefined ? policy.mining_slider : 50) / 100.0;
                const replicationSlider = (policy.replication_slider !== undefined ? policy.replication_slider : 100) / 100.0;
                
                const miningCount = zoneProbes * miningSlider;
                const buildCount = zoneProbes * (1.0 - miningSlider);  // Non-mining = building
                
                const replicateCount = buildCount * replicationSlider;
                const constructCount = buildCount * (1.0 - replicationSlider);
                
                activities[zoneId] = {
                    'harvest': miningCount,
                    'replicate': replicateCount,
                    'construct': constructCount,
                    'dyson': 0
                };
            }
        }
        
        return activities;
    }
    
    _calculateZoneDexterity() {
        // Returns per-zone dexterity capacity in kg/s: {zoneId: kg/s}
        const zoneDexterity = {};
        const zones = this.dataLoader.orbitalZones || [];
        
        // Research bonuses (apply to all zones)
        const researchBonus = this._getResearchBonus('robotic_systems', 'dexterity_multiplier', 1.0);
        
        // Initialize all zones
        for (const zone of zones) {
            zoneDexterity[zone.id] = 0.0;
        }
        
        // Calculate dexterity from probes in each zone - single probe type only
        for (const [zoneId, probes] of Object.entries(this.probesByZone)) {
            const probeCount = probes.probe || 0;
            if (probeCount > 0) {
                const baseDexterity = Probe.getBaseDexterity('probe');
                zoneDexterity[zoneId] = (zoneDexterity[zoneId] || 0) + probeCount * baseDexterity;
            }
        }
        
        // Apply research bonuses to each zone
        for (const zoneId in zoneDexterity) {
            zoneDexterity[zoneId] *= researchBonus;
        }
        
        // Add building contributions (buildings can add dexterity capacity multipliers)
        // For now, buildings don't directly add dexterity, but they can multiply it
        // This can be extended later if needed
        
        return zoneDexterity;
    }
    
    _calculateDexterity() {
        // Returns total dexterity across all zones (for backward compatibility)
        const zoneDexterity = this._calculateZoneDexterity();
        let total = 0.0;
        for (const zoneId in zoneDexterity) {
            total += zoneDexterity[zoneId];
        }
        return total;
    }
    
    _calculateZoneEconomicActivity(zoneId) {
        // Calculate economic activity for a specific zone
        // Returns: {
        //   dexterityCapacity: kg/s,
        //   harvestCapacity: kg/s (for mining),
        //   buildCapacity: kg/s (for replicate + construct),
        //   replicateCapacity: kg/s,
        //   constructCapacity: kg/s,
        //   factoryProduction: {probesPerDay: probes/day, metalCostPerProbe: kg},
        //   buildingEffects: {miningMultiplier: 1.0, energyProduction: W, transportMultiplier: 1.0}
        // }
        const zones = this.dataLoader.orbitalZones || [];
        const zone = zones.find(z => z.id === zoneId);
        if (!zone) {
            return null;
        }
        
        const isDysonZone = zone.is_dyson_zone || false;
        const zoneDexterity = this._calculateZoneDexterity();
        const dexterityCapacity = zoneDexterity[zoneId] || 0.0;
        
        // Get zone policies
        const zonePolicy = this.zonePolicies[zoneId] || {};
        
        // Get building effects for this zone
        const zoneStructures = this.structuresByZone[zoneId] || {};
        let factoryProduction = {probesPerDay: 0.0, metalCostPerProbe: 10.0};
        let miningMultiplier = zone.mining_rate_multiplier || 1.0;
        let energyProduction = 0.0;
        let transportMultiplier = 1.0;
        
        // Calculate building contributions
        for (const [buildingId, count] of Object.entries(zoneStructures)) {
            const building = this.dataLoader.getBuildingById(buildingId);
            if (building) {
                const category = this._getBuildingCategory(buildingId);
                const effects = building.effects || {};
                
                // Factory production
                if (category === 'factories') {
                    const probesPerDay = effects.probe_production_per_day || 0.0;
                    const metalPerProbe = effects.metal_per_probe || 10.0;
                    const orbitalEfficiency = building.orbital_efficiency && building.orbital_efficiency[zoneId] ? 
                        building.orbital_efficiency[zoneId] : 1.0;
                    
                    factoryProduction.probesPerDay += probesPerDay * count * orbitalEfficiency;
                    // Weighted average metal cost
                    if (factoryProduction.probesPerDay > 0) {
                        const totalRate = factoryProduction.probesPerDay;
                        factoryProduction.metalCostPerProbe = 
                            (factoryProduction.metalCostPerProbe * (totalRate - probesPerDay * count * orbitalEfficiency) +
                             metalPerProbe * probesPerDay * count * orbitalEfficiency) / totalRate;
                    }
                }
                
                // Mining multipliers
                if (category === 'mining') {
                    const miningBoost = effects.mining_rate_multiplier || 1.0;
                    miningMultiplier *= miningBoost;
                }
                
                // Energy production
                if (category === 'energy') {
                    let energyOutput = effects.energy_production_per_second || 0;
                    const baseEnergy = effects.base_energy_at_earth !== undefined ? effects.base_energy_at_earth : energyOutput;
                    const orbitalEfficiency = building.orbital_efficiency && building.orbital_efficiency[zoneId] ? 
                        building.orbital_efficiency[zoneId] : 1.0;
                    
                    if (baseEnergy !== energyOutput) {
                        energyOutput = baseEnergy * orbitalEfficiency;
                    }
                    energyProduction += energyOutput * count;
                }
                
                // Transport multipliers (if any)
                if (category === 'transport' || effects.transport_multiplier) {
                    const transportBoost = effects.transport_multiplier || 1.0;
                    transportMultiplier *= transportBoost;
                }
            }
        }
        
        if (isDysonZone) {
            // Dyson zone: dyson_allocation_slider splits between Dyson construction and Build
            // Labels: "Dyson" at top, "Build" at bottom
            // Variable matches labels: higher value = more Dyson (top label)
            // dyson_allocation_slider: 0 = all Build (bottom), 100 = all Dyson (top)
            const dysonAllocationSlider = zonePolicy.dyson_allocation_slider !== undefined ? zonePolicy.dyson_allocation_slider : (zonePolicy.dyson_build_slider !== undefined ? (100 - zonePolicy.dyson_build_slider) : 100);
            const dysonFraction = dysonAllocationSlider / 100.0; // 0 = 0% Dyson (all Build), 100 = 100% Dyson (all Dyson)
            const buildFraction = 1.0 - dysonFraction; // Inverse: 0 = 100% Build, 100 = 0% Build
            
            const replicationSlider = zonePolicy.replication_slider !== undefined ? zonePolicy.replication_slider : 50;
            const replicateFraction = replicationSlider / 100.0;
            const constructFraction = 1.0 - replicateFraction;
            
            // Build capacity is only the Build fraction (not Dyson construction)
            const buildCapacity = dexterityCapacity * buildFraction;
            
            return {
                dexterityCapacity: dexterityCapacity,
                harvestCapacity: 0.0, // No mining in Dyson zone
                buildCapacity: buildCapacity,
                replicateCapacity: buildCapacity * replicateFraction,
                constructCapacity: buildCapacity * constructFraction,
                factoryProduction: factoryProduction,
                buildingEffects: {
                    miningMultiplier: 0.0, // No mining
                    energyProduction: energyProduction,
                    transportMultiplier: transportMultiplier
                }
            };
        } else {
            // Planetary zone: mine vs build, then within build: replicate vs construct
            const miningSlider = zonePolicy.mining_slider !== undefined ? zonePolicy.mining_slider : 50;
            const replicationSlider = zonePolicy.replication_slider !== undefined ? zonePolicy.replication_slider : 50;
            
            // mining_slider: 0 = all build (top), 100 = all mine (bottom)
            const buildFraction = (100 - miningSlider) / 100.0;
            const harvestFraction = miningSlider / 100.0;
            
            // replication_slider: 0 = all construct, 100 = all replicate
            const replicateFraction = replicationSlider / 100.0;
            const constructFraction = 1.0 - replicateFraction;
            
            return {
                dexterityCapacity: dexterityCapacity,
                harvestCapacity: dexterityCapacity * harvestFraction,
                buildCapacity: dexterityCapacity * buildFraction,
                replicateCapacity: dexterityCapacity * buildFraction * replicateFraction,
                constructCapacity: dexterityCapacity * buildFraction * constructFraction,
                factoryProduction: factoryProduction,
                buildingEffects: {
                    miningMultiplier: miningMultiplier,
                    energyProduction: energyProduction,
                    transportMultiplier: transportMultiplier
                }
            };
        }
    }
    
    _calculateComputeDemand() {
        // Count enabled research projects
        const enabledProjects = [];
        const researchTrees = this.dataLoader.getAllResearchTrees();
        
        for (const [treeId, treeData] of Object.entries(researchTrees)) {
            if (!(treeId in this.research)) {
                continue;
            }
            
            // Check if tree has direct tiers
            if (treeData.tiers) {
                const tiersList = treeData.tiers;
                for (let idx = 0; idx < tiersList.length; idx++) {
                    const tier = tiersList[idx];
                    const tierId = tier.id;
                    if (tierId in this.research[treeId]) {
                        const tierData = this.research[treeId][tierId];
                        if (tierData.enabled) {
                            const tranchesCompleted = tierData.tranches_completed || 0;
                            const maxTranches = tier.tranches || 10;
                            if (tranchesCompleted < maxTranches) {
                                // Check prerequisites
                                let canResearch = true;
                                if (idx > 0) {
                                    const prevTier = tiersList[idx - 1];
                                    const prevTierId = prevTier.id;
                                    if (prevTierId in this.research[treeId]) {
                                        const prevCompleted = this.research[treeId][prevTierId].tranches_completed || 0;
                                        const prevMax = prevTier.tranches || 10;
                                        if (prevCompleted < prevMax) {
                                            canResearch = false;
                                        }
                                    } else {
                                        canResearch = false;
                                    }
                                }
                                
                                if (canResearch) {
                                    enabledProjects.push([treeId, tierId, tier, tierData]);
                                }
                            }
                        }
                    }
                }
            }
            
            // Check subcategories
            if (treeData.subcategories) {
                for (const [subcatId, subcatData] of Object.entries(treeData.subcategories)) {
                    if (!subcatData.tiers) {
                        continue;
                    }
                    const tiersList = subcatData.tiers;
                    for (let idx = 0; idx < tiersList.length; idx++) {
                        const tier = tiersList[idx];
                        const tierKey = subcatId + '_' + tier.id;
                        if (tierKey in this.research[treeId]) {
                            const tierData = this.research[treeId][tierKey];
                            if (tierData.enabled) {
                                const tranchesCompleted = tierData.tranches_completed || 0;
                                const maxTranches = tier.tranches || 10;
                                if (tranchesCompleted < maxTranches) {
                                    // Check prerequisites
                                    let canResearch = true;
                                    if (idx > 0) {
                                        const prevTier = tiersList[idx - 1];
                                        const prevTierKey = subcatId + '_' + prevTier.id;
                                        if (prevTierKey in this.research[treeId]) {
                                            const prevCompleted = this.research[treeId][prevTierKey].tranches_completed || 0;
                                            const prevMax = prevTier.tranches || 10;
                                            if (prevCompleted < prevMax) {
                                                canResearch = false;
                                            }
                                        } else {
                                            canResearch = false;
                                        }
                                    }
                                    
                                    if (canResearch) {
                                        enabledProjects.push([treeId, tierKey, tier, tierData]);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // If no research projects active, compute demand is 0
        if (enabledProjects.length === 0) {
            return 0.0;
        }
        
        // Compute demand is the theoretical maximum intelligence production
        const theoreticalComputeAvailable = this._calculateIntelligenceProduction();
        
        // Demand equals theoretical compute (actual usage will be limited by energy)
        return theoreticalComputeAvailable;
    }
    
    _updateResearch(deltaTime, effectiveIntelligenceRate) {
        // Use the effective intelligence rate (already energy-limited)
        const totalIntelligenceFlops = effectiveIntelligenceRate;
        
        // Count enabled research projects
        const enabledProjects = [];
        const researchTrees = this.dataLoader.getAllResearchTrees();
        
        for (const [treeId, treeData] of Object.entries(researchTrees)) {
            if (!(treeId in this.research)) {
                continue;
            }
            
            // Check regular tiers
            if (treeData.tiers) {
                const tiersList = treeData.tiers;
                for (let idx = 0; idx < tiersList.length; idx++) {
                    const tier = tiersList[idx];
                    const tierId = tier.id;
                    if (!(tierId in this.research[treeId])) {
                        continue;
                    }
                    
                    const tierData = this.research[treeId][tierId];
                    if (tierData.enabled) {
                        const tranchesCompleted = tierData.tranches_completed || 0;
                        const maxTranches = tier.tranches || 10;
                        if (tranchesCompleted < maxTranches) {
                            // Check prerequisites
                            let canResearch = true;
                            if (idx > 0) {
                                const prevTier = tiersList[idx - 1];
                                const prevTierId = prevTier.id;
                                if (prevTierId in this.research[treeId]) {
                                    const prevCompleted = this.research[treeId][prevTierId].tranches_completed || 0;
                                    const prevMax = prevTier.tranches || 10;
                                    if (prevCompleted < prevMax) {
                                        canResearch = false;
                                    }
                                } else {
                                    canResearch = false; // Previous tier not initialized
                                }
                            }
                            
                            if (canResearch) {
                                enabledProjects.push([treeId, tierId, tier, tierData]);
                            }
                        }
                    }
                }
            }
            
            // Check subcategories (computer systems)
            if (treeData.subcategories) {
                for (const [subcatId, subcatData] of Object.entries(treeData.subcategories)) {
                    if (subcatData.tiers) {
                        const tiersList = subcatData.tiers;
                        for (let idx = 0; idx < tiersList.length; idx++) {
                            const tier = tiersList[idx];
                            const tierKey = subcatId + '_' + tier.id;
                            if (!(tierKey in this.research[treeId])) {
                                continue;
                            }
                            
                            const tierData = this.research[treeId][tierKey];
                            if (tierData.enabled) {
                                const tranchesCompleted = tierData.tranches_completed || 0;
                                const maxTranches = tier.tranches || 10;
                                if (tranchesCompleted < maxTranches) {
                                    // Check prerequisites
                                    let canResearch = true;
                                    if (idx > 0) {
                                        const prevTier = tiersList[idx - 1];
                                        const prevTierKey = subcatId + '_' + prevTier.id;
                                        if (prevTierKey in this.research[treeId]) {
                                            const prevCompleted = this.research[treeId][prevTierKey].tranches_completed || 0;
                                            const prevMax = prevTier.tranches || 10;
                                            if (prevCompleted < prevMax) {
                                                canResearch = false;
                                            }
                                        } else {
                                            canResearch = false; // Previous tier not initialized
                                        }
                                    }
                                    
                                    if (canResearch) {
                                        enabledProjects.push([treeId, tierKey, tier, tierData]);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // FLOPS are not accumulated - they're a production rate consumed directly by research
        // Allocate available FLOPS production rate across enabled projects
        if (enabledProjects.length === 0) {
            return; // No research projects to consume FLOPS
        }
        
        // Distribute available FLOPS production rate equally among enabled projects
        const flopsPerProject = totalIntelligenceFlops / enabledProjects.length;
        
        // Process each enabled project - each consumes FLOPS from the production rate
        for (const [treeId, tierId, tier, tierData] of enabledProjects) {
            let tranchesCompleted = tierData.tranches_completed || 0;
            const maxTranches = tier.tranches || 10;
            
            // Set start_time when research begins (first time enabled)
            if (tierData.start_time === null || tierData.start_time === undefined) {
                tierData.start_time = this.time;
            }
            
            if (tranchesCompleted >= maxTranches) {
                // Set completion_time when tier completes (first time it reaches max)
                if (tierData.completion_time === null || tierData.completion_time === undefined) {
                    tierData.completion_time = this.time;
                }
                continue; // Tier complete
            }
            
            // Calculate progress based on FLOPS allocated
            // Get the tier index to calculate cost
            let tierIndex = 0;
            const treeDataForCost = researchTrees[treeId] || {};
            if (treeDataForCost.tiers) {
                tierIndex = treeDataForCost.tiers.findIndex(t => t.id === tierId);
                if (tierIndex === -1) tierIndex = 0;
            } else if (treeDataForCost.subcategories) {
                // For subcategories, tierId format is "subcatId_tierId"
                for (const [subcatId, subcatData] of Object.entries(treeDataForCost.subcategories)) {
                    if (tierId.startsWith(subcatId + '_')) {
                        if (subcatData.tiers) {
                            const tierIdOnly = tierId.replace(subcatId + '_', '');
                            tierIndex = subcatData.tiers.findIndex(t => t.id === tierIdOnly);
                            if (tierIndex === -1) tierIndex = 0;
                        }
                        break;
                    }
                }
            }
            
            // Research cost: tier 1 = 100 exaflops for 100 days, each tier is 100x longer
            // At 1x speed: 1 day per second of real time (game time advances 1 day per real second)
            // 100 exaflops = 100 * 1e18 = 1e20 FLOPS
            // Total for tier 1: 1e20 FLOPS * 100 = 1e22 FLOPS
            // Each tier is 100x longer: tier n = 1e22 * 100^(n-1) FLOPS
            const baseCostFlops = 1e22; // 100 exaflops * 100 days = 1e22 FLOPS for tier 1
            const growthFactor = 100.0; // Each tier is 100x longer
            const tierNumber = tierIndex + 1; // Convert 0-indexed to 1-indexed tier number
            // For tier 1 (tierNumber=1): cost = baseCost * 100^(1-1) = baseCost * 1 = 1e22 FLOPS
            // For tier 2 (tierNumber=2): cost = baseCost * 100^(2-1) = baseCost * 100 = 1e24 FLOPS
            // For tier 3 (tierNumber=3): cost = baseCost * 100^(3-1) = baseCost * 10000 = 1e26 FLOPS
            const tierCostFlops = baseCostFlops * Math.pow(growthFactor, tierNumber - 1);
            
            // Calculate FLOPS consumed by this project this tick
            // Each project can consume up to its allocated share of the production rate
            const flopsConsumedThisTick = flopsPerProject * deltaTime; // FLOPS consumed = rate * time
            
            // Calculate progress fraction: FLOPS consumed / total FLOPS needed
            const progressFraction = flopsConsumedThisTick / tierCostFlops;
            
            // Maximum consumption rate: 1% per 100 days = 0.01 per 100 days = 0.0001 per day
            // This limits how fast a research project can progress, even with unlimited FLOPS
            // Maximum consumption rate: 1% per 100 days = 0.01% per day
            const maxProgressRatePerDay = 0.0001; // 1% per 100 days = 0.01% per day
            const maxProgressFraction = maxProgressRatePerDay * deltaTime;
            
            // Cap progress to maximum consumption rate per project
            const cappedProgressFraction = Math.min(progressFraction, maxProgressFraction);
            
            // Convert to tranches (each tranche is 1/max_tranches of total progress)
            const trancheProgress = cappedProgressFraction * maxTranches;
            const newTranches = Math.floor(trancheProgress);
            
            if (newTranches > 0) {
                const oldTranches = tranchesCompleted;
                tierData.tranches_completed = Math.min(
                    tranchesCompleted + newTranches,
                    maxTranches
                );
                // Set completion_time when tier completes
                if (tierData.tranches_completed >= maxTranches && (tierData.completion_time === null || tierData.completion_time === undefined)) {
                    tierData.completion_time = this.time;
                }
            }
            
            // Also track fractional progress for smoother advancement
            // Store the remainder for next tick (if we want continuous progress)
            const remainingProgress = trancheProgress - newTranches;
            if (remainingProgress > 0 && !tierData.fractional_progress) {
                tierData.fractional_progress = 0.0;
            }
            if (remainingProgress > 0) {
                tierData.fractional_progress = (tierData.fractional_progress || 0.0) + remainingProgress;
                // Check if fractional progress accumulates to a full tranche
                if (tierData.fractional_progress >= 1.0) {
                    const additionalTranches = Math.floor(tierData.fractional_progress);
                    tierData.tranches_completed = Math.min(
                        tierData.tranches_completed + additionalTranches,
                        maxTranches
                    );
                    tierData.fractional_progress = tierData.fractional_progress - additionalTranches;
                    // Set completion_time when tier completes
                    if (tierData.tranches_completed >= maxTranches && (tierData.completion_time === null || tierData.completion_time === undefined)) {
                        tierData.completion_time = this.time;
                    }
                }
            }
        }
    }
    _calculateDysonConstructionRate() {
        if (this.dysonSphereMass >= this.getDysonTargetMass()) {
            return 0.0; // Already complete
        }
        
        // Check if there are actually probes in the Dyson zone
        const dysonZoneId = 'dyson_sphere';
        const dysonZoneProbes = Math.floor(this.probesByZone[dysonZoneId]?.probe || 0);
        
        // If no probes in Dyson zone, return 0
        if (dysonZoneProbes <= 0) {
            return 0.0;
        }
        
        // Get probes allocated to Dyson construction from zone activities (current allocation)
        // This uses the same logic as tick() to ensure consistency
        const zoneActivities = this._calculateZoneActivities();
        const dysonProbes = zoneActivities[dysonZoneId]?.dyson || 0;
        
        // Round to integer and check if > 0
        const totalDysonProbesInt = Math.floor(dysonProbes);
        if (totalDysonProbesInt <= 0) {
            return 0.0;
        }
        
        // Calculate construction rate
        // Base rate: 100 kg/day per probe (PROBE_BUILD_RATE)
        const baseConstructionRate = totalDysonProbesInt * Config.PROBE_BUILD_RATE;
        
        // Apply research bonuses
        const researchBonus = this._getResearchBonus('dyson_swarm_construction', 'dyson_construction_rate_multiplier', 1.0);
        let constructionRate = baseConstructionRate * researchBonus;
        
        // Note: Throttling is applied in tick() when actually constructing
        // This function returns the base rate (before throttling) for display
        // The actual throttled rate is calculated in tick() and stored in dysonConstructionRate
        // For accurate throttled rate display, use the rate from getState() which comes from tick()
        
        return constructionRate;
    }
    _updateDysonSphereConstruction(deltaTime, throttledConstructionRate) {
        const idleProbes = {'dyson': 0.0};
        
        if (this.dysonSphereMass >= this.getDysonTargetMass()) {
            return idleProbes; // Already complete
        }
        
        // Check if there are actually probes in the Dyson zone
        const dysonZoneId = 'dyson_sphere';
        const dysonZoneProbes = Math.floor(this.probesByZone[dysonZoneId]?.probe || 0);
        if (dysonZoneProbes <= 0) {
            return idleProbes; // No probes in Dyson zone
        }
        
        if (throttledConstructionRate <= 0) {
            return idleProbes;
        }
        
        // Metal consumption: 0.5 kg metal per 1 kg Dyson mass (50% efficiency)
        const metalConsumptionRateNeeded = throttledConstructionRate * 0.5;
        
        // Calculate metal needed for this tick
        const metalNeededThisTick = metalConsumptionRateNeeded * deltaTime;
        
        // Check if we have enough metal available
        let effectiveConstructionRate = throttledConstructionRate;
        if (this.metal < metalNeededThisTick) {
            // Scale down to available metal
            const scaleFactor = metalNeededThisTick > 0 ? this.metal / metalNeededThisTick : 0;
            effectiveConstructionRate = throttledConstructionRate * scaleFactor;
            
            // Calculate idle probes (proportional to unused construction capacity)
            const dysonAllocation = this.probeAllocations.dyson || {};
            const totalDysonProbes = Object.values(dysonAllocation).reduce((a, b) => a + b, 0);
            idleProbes.dyson = totalDysonProbes * (1.0 - scaleFactor);
        }
        
        // Construct (limited by available metal)
        let massToAdd = effectiveConstructionRate * deltaTime;
        massToAdd = Math.min(massToAdd, this.getDysonTargetMass() - this.dysonSphereMass);
        
        // Consume resources
        const metalConsumed = massToAdd * 0.5; // 50% metal efficiency
        
        // Check if we have enough metal before consuming
        if (this.metal >= metalConsumed) {
            this.dysonSphereMass += massToAdd;
            this.metal -= metalConsumed;
            // Don't allow negative metal
            this.metal = Math.max(0, this.metal);
        }
        
        return idleProbes;
    }
    _checkZoneDepletion() {
        const zones = this.dataLoader.orbitalZones || [];
        for (const [zoneId, metalRemaining] of Object.entries(this.zoneMetalRemaining)) {
            // Skip dyson zones - they don't have metal/slag to deplete
            const zone = zones.find(z => z && z.id === zoneId);
            if (zone && (zone.is_dyson_zone || zone.isDysonZone)) {
                continue;
            }
            
            // For regular zones, check if metal is exhausted
            // Slag is produced from mining, not a remaining resource to check
            if (metalRemaining <= 0 && !this.zoneDepleted[zoneId]) {
                this.zoneDepleted[zoneId] = true;
            } else if (metalRemaining > 0 && this.zoneDepleted[zoneId]) {
                // Zone is no longer depleted if metal is available
                this.zoneDepleted[zoneId] = false;
            }
        }
    }
    _recycleSlag(deltaTime) {
        if (this.slag <= 0) {
            return;
        }
        
        const recyclingEfficiency = this._getRecyclingEfficiency();
        const recycleRate = this.slag * recyclingEfficiency * 0.1; // 10% per day recycling rate
        
        const metalRecovered = Math.min(recycleRate * deltaTime, this.slag);
        
        this.metal += metalRecovered;
        this.slag -= metalRecovered;
    }
    _getRecyclingEfficiency() {
        const baseEfficiency = 0.75;
        
        // Get recycling research bonus
        const researchBonus = this._getResearchBonus('recycling_efficiency', 'recycling_efficiency_bonus', 0.0);
        
        // Calculate total efficiency (max 0.98)
        const totalEfficiency = Math.min(baseEfficiency + researchBonus, 0.98);
        
        return totalEfficiency;
    }
    _getResearchBonus(treeId, bonusKey, defaultValue = 1.0) {
        // Use cache if available
        const cache = window.calculationCache;
        if (cache) {
            return cache.getResearchBonus(treeId, bonusKey, defaultValue, () => {
                return this._calculateResearchBonus(treeId, bonusKey, defaultValue);
            });
        }
        
        return this._calculateResearchBonus(treeId, bonusKey, defaultValue);
    }
    
    _calculateResearchBonus(treeId, bonusKey, defaultValue = 1.0) {
        if (!(treeId in this.research)) {
            return defaultValue;
        }
        
        const treeData = this.dataLoader.getResearchTree(treeId);
        if (!treeData) {
            return defaultValue;
        }
        
        let totalBonus = defaultValue;
        
        // Check regular tiers
        if (treeData.tiers) {
            for (const tier of treeData.tiers) {
                const tierId = tier.id;
                if (tierId in this.research[treeId]) {
                    const tierData = this.research[treeId][tierId];
                    const tranchesCompleted = tierData.tranches_completed || 0;
                    const maxTranches = tier.tranches || 10;
                    
                    if (tranchesCompleted > 0) {
                        // Calculate bonus from this tier
                        const tierBonus = (tier.effects || {})[bonusKey] || 0;
                        if (tierBonus) {
                            // Apply bonus proportionally to completion
                            const completion = tranchesCompleted / maxTranches;
                            totalBonus += tierBonus * completion;
                        }
                    }
                }
            }
        }
        
        // Check subcategories (for computer systems)
        if (treeData.subcategories) {
            for (const [subcatId, subcatData] of Object.entries(treeData.subcategories)) {
                if (subcatData.tiers) {
                    for (const tier of subcatData.tiers) {
                        const tierKey = subcatId + '_' + tier.id;
                        if (tierKey in this.research[treeId]) {
                            const tierData = this.research[treeId][tierKey];
                            const tranchesCompleted = tierData.tranches_completed || 0;
                            const maxTranches = tier.tranches || 10;
                            
                            if (tranchesCompleted > 0) {
                                const tierBonus = (tier.effects || {})[bonusKey] || 0;
                                if (tierBonus) {
                                    const completion = tranchesCompleted / maxTranches;
                                    totalBonus += tierBonus * completion;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        return totalBonus;
    }
    
    _getResearchedUpgrade(treeId, tierId) {
        if (!(treeId in this.research)) {
            return null;
        }
        if (!(tierId in this.research[treeId])) {
            return null;
        }
        
        const treeData = this.dataLoader.getResearchTree(treeId);
        if (!treeData) {
            return null;
        }
        
        // Find the tier
        let tierData = null;
        if (treeData.tiers) {
            for (const tier of treeData.tiers) {
                if (tier.id === tierId) {
                    tierData = tier;
                    break;
                }
            }
        }
        
        // Check subcategories if not found
        if (!tierData && treeData.subcategories) {
            for (const [subcatId, subcatData] of Object.entries(treeData.subcategories)) {
                if (subcatData.tiers) {
                    for (const tier of subcatData.tiers) {
                        const tierKey = subcatId + '_' + tier.id;
                        if (tierKey === tierId) {
                            tierData = tier;
                            break;
                        }
                    }
                }
            }
        }
        
        if (!tierData) {
            return null;
        }
        
        const tierState = this.research[treeId][tierId];
        const tranchesCompleted = tierState.tranches_completed || 0;
        const maxTranches = tierData.tranches || 10;
        
        if (tranchesCompleted <= 0) {
            return null;
        }
        
        const completion = tranchesCompleted / maxTranches;
        return {
            'name': tierData.name || tierId,
            'completion': completion,
            'tranches_completed': tranchesCompleted,
            'max_tranches': maxTranches
        };
    }
    _calculateResourceBreakdowns() {
        return {
            'energy': this._calculateEnergyBreakdown(),
            'dexterity': this._calculateDexterityBreakdown(),
            'intelligence': this._calculateIntelligenceBreakdown()
        };
    }
    
    _calculateEnergyBreakdown() {
        const breakdown = {
            'production': {'base': 0, 'total': 0, 'upgrades': [], 'breakdown': {}},
            'consumption': {'base': 0, 'total': 0, 'upgrades': [], 'breakdown': {}}
        };
        
        // Production: Base constant energy supply
        const baseSupply = Config.CONSTANT_ENERGY_SUPPLY;
        breakdown.production.base = baseSupply;
        breakdown.production.breakdown.base_supply = baseSupply;
        
        // Production: Energy probes
        const energyProbeCount = this.probes.energy_probe || 0;
        const energyProbeBase = energyProbeCount * 2000; // 2000W net per probe
        breakdown.production.base += energyProbeBase;
        breakdown.production.breakdown.energy_probes = energyProbeBase;
        
        // Production: Solar arrays and energy structures
        const solarMultiplier = 4.0; // Buildings at 0.5 AU
        let structureProduction = 0;
        for (const [buildingId, count] of Object.entries(this.structures)) {
            const building = this.dataLoader.getBuildingById(buildingId);
            if (building) {
                const effects = building.effects || {};
                const energyOutput = effects.energy_production_per_second || 0;
                const baseEnergy = effects.base_energy_at_earth || energyOutput;
                structureProduction += baseEnergy * solarMultiplier * count;
            }
        }
        breakdown.production.base += structureProduction;
        breakdown.production.breakdown.structures = structureProduction;
        
        // Production: Dyson sphere energy
        const computePowerSlider = this.dysonPowerAllocation || 0;
        let economyFraction = 1.0;
        if (computePowerSlider <= 50) {
            // 0-50%: linear from 100% economy to 0% economy
            economyFraction = (50 - computePowerSlider) / 50.0;
        } else {
            // Above 50%: 0% economy (all goes to compute, including overclocking)
            economyFraction = 0.0;
        }
        
        let dysonEnergyProduction = 0.0;
        if (this.dysonSphereMass >= this.getDysonTargetMass()) {
            // Complete Dyson sphere: all star's power
            const sunTotalPower = 3.8e26; // watts
            dysonEnergyProduction = sunTotalPower * economyFraction;
        } else {
            // During construction: 5 kW per kg
            const dysonPower = this.dysonSphereMass * 5000; // 5000W = 5 kW per kg
            dysonEnergyProduction = dysonPower * economyFraction;
        }
        
        breakdown.production.base += dysonEnergyProduction;
        breakdown.production.breakdown.dyson_sphere = dysonEnergyProduction;
        
        // Production: Energy Collection Efficiency research
        const energyCollectionBonus = this._getResearchBonus('energy_collection', 'solar_efficiency_multiplier', 1.0);
        if (energyCollectionBonus > 1.0) {
            const upgrade = this._getResearchedUpgrade('energy_collection', 'photovoltaic_optimization');
            if (upgrade) {
                breakdown.production.upgrades.push({
                    'name': 'Energy Collection Efficiency',
                    'bonus': energyCollectionBonus - 1.0,
                    'researched': true
                });
            }
        }
        breakdown.production.total = breakdown.production.base * energyCollectionBonus;
        
        // Consumption: Probe base consumption removed
        // Probes only consume energy when actively: harvesting, building, or constructing Dyson
        breakdown.consumption.base = 0;
        breakdown.consumption.breakdown.probes = 0;
        
        // Consumption: Structures
        let structureConsumption = 0;
        for (const [buildingId, count] of Object.entries(this.structures)) {
            const building = this.dataLoader.getBuildingById(buildingId);
            if (building) {
                const effects = building.effects || {};
                const energyCost = effects.energy_consumption_per_second || 0;
                structureConsumption += energyCost * count;
            }
        }
        breakdown.consumption.base += structureConsumption;
        breakdown.consumption.breakdown.structures = structureConsumption;
        
        // Consumption: Harvesting energy cost
        const harvestAllocation = this.probeAllocations.harvest || {};
        const totalHarvestProbes = Object.values(harvestAllocation).reduce((a, b) => a + b, 0);
        let harvestEnergyCost = 0;
        if (totalHarvestProbes > 0) {
            const zones = this.dataLoader.orbitalZones || [];
            const harvestZoneData = zones.find(z => z.id === this.harvestZone) || null;
            if (harvestZoneData) {
                const deltaVPenalty = harvestZoneData.delta_v_penalty || 0.1;
                const baseEnergyCost = 453515 / 86400; // watts per kg/day at Earth baseline (converted from per-second)
                const energyCostPerKgDay = baseEnergyCost * Math.pow(1.0 + deltaVPenalty, 2);
                const harvestRatePerProbe = Config.PROBE_HARVEST_RATE; // kg/day per probe
                harvestEnergyCost = energyCostPerKgDay * harvestRatePerProbe * totalHarvestProbes;
                breakdown.consumption.base += harvestEnergyCost;
            }
        }
        breakdown.consumption.breakdown.harvesting = harvestEnergyCost;
        
        // Energy cost constant: 250kW per kg/s = 250000 / 86400 W per kg/day
        const ENERGY_COST_PER_KG_DAY = 250000 / 86400; // W per kg/day
        
        // Consumption: Probe construction energy cost
        const [probeProdRates, , factoryMetalCostPerProbe] = this._calculateProbeProduction();
        const totalProbeProductionRate = Object.values(probeProdRates).reduce((a, b) => a + b, 0);
        const metalCostPerProbe = factoryMetalCostPerProbe > 0 ? factoryMetalCostPerProbe : Config.PROBE_MASS;
        const probeConstructionRateKgDay = totalProbeProductionRate * metalCostPerProbe;
        const probeConstructionEnergyCost = probeConstructionRateKgDay * ENERGY_COST_PER_KG_DAY;
        breakdown.consumption.base += probeConstructionEnergyCost;
        breakdown.consumption.breakdown.probe_construction = probeConstructionEnergyCost;
        
        // Consumption: Dyson construction energy cost
        const dysonConstructionRate = this._calculateDysonConstructionRate();
        const dysonConstructionEnergyCost = dysonConstructionRate * ENERGY_COST_PER_KG_DAY;
        breakdown.consumption.base += dysonConstructionEnergyCost;
        breakdown.consumption.breakdown.dyson_construction = dysonConstructionEnergyCost;
        
        // Consumption: Research bonuses that reduce consumption
        const propulsionBonus = this._getResearchBonus('propulsion_systems', 'dexterity_energy_cost_reduction', 0.0);
        if (propulsionBonus > 0) {
            breakdown.consumption.upgrades.push({
                'name': 'Propulsion Systems',
                'bonus': propulsionBonus,
                'researched': true
            });
        }
        
        const locomotionBonus = this._getResearchBonus('locomotion_systems', 'build_energy_cost_reduction', 0.0);
        if (locomotionBonus > 0) {
            breakdown.consumption.upgrades.push({
                'name': 'Locomotion Systems',
                'bonus': locomotionBonus,
                'researched': true
            });
        }
        
        // Computer systems reduce probe energy cost
        if ('computer_systems' in this.research) {
            const compTree = this.dataLoader.getResearchTree('computer_systems');
            if (compTree && compTree.subcategories) {
                for (const [subcatName, subcatData] of Object.entries(compTree.subcategories)) {
                    if (subcatName.toLowerCase().includes('processing')) {
                        for (const tier of (subcatData.tiers || [])) {
                            const tierId = tier.id;
                            const upgrade = this._getResearchedUpgrade('computer_systems', tierId);
                            if (upgrade && (tier.effects || {}).probe_energy_cost_reduction) {
                                const reduction = tier.effects.probe_energy_cost_reduction * upgrade.completion;
                                if (reduction > 0) {
                                    breakdown.consumption.upgrades.push({
                                        'name': upgrade.name,
                                        'bonus': reduction,
                                        'researched': true
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Apply consumption reduction bonuses
        let totalConsumptionReduction = 1.0;
        for (const upgrade of breakdown.consumption.upgrades) {
            totalConsumptionReduction -= upgrade.bonus;
        }
        
        breakdown.consumption.total = breakdown.consumption.base * Math.max(0.1, totalConsumptionReduction);
        
        return breakdown;
    }
    
    _calculateDexterityBreakdown() {
        const breakdown = {
            'probes': {'base': 0, 'total': 0, 'upgrades': [], 'breakdown': {}},
            'factories': {'total': 0}
        };
        
        // Base dexterity from probes - single probe type only
        // Calculate per-zone breakdown
        const zoneBreakdown = {}; // {zoneId: {probeCount: number, baseDexterity: number}}
        const baseDex = Probe.getBaseDexterity('probe');
        let totalProbeCount = 0;
        
        // Zone-based probes (new system)
        for (const [zoneId, probes] of Object.entries(this.probesByZone)) {
            const probeCount = probes.probe || 0;
            if (probeCount > 0) {
                totalProbeCount += probeCount;
                const zoneDexterity = probeCount * baseDex;
                zoneBreakdown[zoneId] = {
                    probeCount: probeCount,
                    baseDexterity: zoneDexterity
                };
            }
        }
        
        // Legacy: global probes
        const legacyProbeCount = this.probes.probe || 0;
        if (legacyProbeCount > 0 && Object.keys(this.probesByZone).length === 0) {
            totalProbeCount += legacyProbeCount;
            zoneBreakdown['global'] = {
                probeCount: legacyProbeCount,
                baseDexterity: legacyProbeCount * baseDex
            };
        }
        
        const baseDexterity = totalProbeCount * baseDex;
        breakdown.probes.base = baseDexterity;
        breakdown.probes.breakdown = zoneBreakdown;
        
        // Robotic Systems research bonus
        const roboticBonus = this._getResearchBonus('robotic_systems', 'dexterity_multiplier', 1.0);
        if (roboticBonus > 1.0) {
            const upgrade = this._getResearchedUpgrade('robotic_systems', 'manipulator_arms');
            if (upgrade) {
                breakdown.probes.upgrades.push({
                    'name': 'Robotic Systems',
                    'bonus': roboticBonus - 1.0,
                    'researched': true
                });
            }
        }
        
        // Computer Systems processing bonus
        if ('computer_systems' in this.research) {
            const compTree = this.dataLoader.getResearchTree('computer_systems');
            if (compTree && compTree.subcategories) {
                const processingTree = compTree.subcategories.processing;
                if (processingTree) {
                    for (const tier of (processingTree.tiers || [])) {
                        const tierId = tier.id;
                        const upgrade = this._getResearchedUpgrade('computer_systems', tierId);
                        if (upgrade && (tier.effects || {}).dexterity_multiplier) {
                            const multiplier = tier.effects.dexterity_multiplier;
                            if (multiplier > 1.0) {
                                const bonus = (multiplier - 1.0) * upgrade.completion;
                                breakdown.probes.upgrades.push({
                                    'name': upgrade.name,
                                    'bonus': bonus,
                                    'researched': true
                                });
                            }
                        }
                    }
                }
            }
        }
        
        // Calculate total with all multipliers
        let totalMultiplier = roboticBonus;
        breakdown.probes.total = baseDexterity * totalMultiplier;
        
        // Factory production
        const [probeProdRates] = this._calculateProbeProduction();
        breakdown.factories.total = Object.values(probeProdRates).reduce((a, b) => a + b, 0);
        
        return breakdown;
    }
    
    _calculateIntelligenceBreakdown() {
        const breakdown = {
            'probes': {'base': 0, 'total': 0, 'upgrades': []},
            'structures': {'base': 0, 'total': 0, 'breakdown': {}},
            'total': 0
        };
        
        // FLOPS now come from Dyson sphere only
        const baseIntelligenceFlops = this.dysonSphereMass * 1e15; // 1 PFLOPS/s per kg
        breakdown.probes.base = baseIntelligenceFlops;
        breakdown.probes.total = baseIntelligenceFlops;
        
        // Research structures - in FLOPS (from zone-based structures)
        let structureIntelligenceFlops = 0;
        const structureBreakdown = {}; // {buildingId: {name: string, count: number, flops: number}}
        
        // Check zone-based structures (new system)
        for (const [zoneId, zoneStructures] of Object.entries(this.structuresByZone)) {
            for (const [buildingId, count] of Object.entries(zoneStructures)) {
                if (count <= 0) continue;
                
                const building = this.dataLoader.getBuildingById(buildingId);
                if (building) {
                    const effects = building.effects || {};
                    const intelligenceOutputFlops = effects.intelligence_flops || 0;
                    let buildingFlops = 0;
                    
                    if (intelligenceOutputFlops > 0) {
                        buildingFlops = intelligenceOutputFlops * count;
                    } else {
                        // Legacy: convert from intelligence_per_second
                        const intelligenceOutput = effects.intelligence_production_per_second || effects.intelligence_per_second || 0;
                        buildingFlops = intelligenceOutput * 1e12 * count;
                    }
                    
                    if (buildingFlops > 0) {
                        structureIntelligenceFlops += buildingFlops;
                        
                        // Add to breakdown
                        if (!structureBreakdown[buildingId]) {
                            structureBreakdown[buildingId] = {
                                name: building.name || buildingId,
                                count: 0,
                                flops: 0
                            };
                        }
                        structureBreakdown[buildingId].count += count;
                        structureBreakdown[buildingId].flops += buildingFlops;
                    }
                }
            }
        }
        
        // Also check legacy global structures for backward compatibility
        for (const [buildingId, count] of Object.entries(this.structures)) {
            if (count <= 0) continue;
            
            // Skip if already counted in zone structures
            let alreadyCounted = false;
            for (const zoneStructures of Object.values(this.structuresByZone)) {
                if (zoneStructures[buildingId]) {
                    alreadyCounted = true;
                    break;
                }
            }
            if (alreadyCounted) continue;
            
            const building = this.dataLoader.getBuildingById(buildingId);
            if (building) {
                const effects = building.effects || {};
                const intelligenceOutputFlops = effects.intelligence_flops || 0;
                let buildingFlops = 0;
                
                if (intelligenceOutputFlops > 0) {
                    buildingFlops = intelligenceOutputFlops * count;
                } else {
                    // Legacy: convert from intelligence_per_second
                    const intelligenceOutput = effects.intelligence_production_per_second || effects.intelligence_per_second || 0;
                    buildingFlops = intelligenceOutput * 1e12 * count;
                }
                
                if (buildingFlops > 0) {
                    structureIntelligenceFlops += buildingFlops;
                    
                    // Add to breakdown
                    if (!structureBreakdown[buildingId]) {
                        structureBreakdown[buildingId] = {
                            name: building.name || buildingId,
                            count: 0,
                            flops: 0
                        };
                    }
                    structureBreakdown[buildingId].count += count;
                    structureBreakdown[buildingId].flops += buildingFlops;
                }
            }
        }
        
        breakdown.structures.base = structureIntelligenceFlops;
        breakdown.structures.total = structureIntelligenceFlops;
        breakdown.structures.breakdown = structureBreakdown;
        breakdown.total = breakdown.probes.total + breakdown.structures.total;
        
        return breakdown;
    }
    
    _calculateIdleProbes() {
        const idleProbes = {'dyson': 0.0, 'probes': 0.0, 'structures': 0.0};
        
        // Calculate metal production rate
        const [metalProductionRate] = this._calculateMetalProduction(); // Returns [metalRate, zoneMetalDepletion, slagRate, zoneSlagDepletion]
        
        // Check if we have stored metal
        const hasStoredMetal = this.metal > 0;
        
        // Get build rates to calculate metal consumption
        const [probeRate] = this._calculateProbeProduction();
        
        // Calculate metal consumption from probe building
        let probeMetalConsumption = 0.0;
        for (const [probeType, rate] of Object.entries(probeRate)) {
            if (rate > 0) {
                const metalCost = Probe.getMetalCost(probeType);
                probeMetalConsumption += rate * metalCost;
            }
        }
        
        // Calculate metal consumption from Dyson construction
        const dysonRate = this._calculateDysonConstructionRate();
        const dysonMetalConsumption = dysonRate * 0.5; // 50% efficiency
        
        const totalMetalConsumption = probeMetalConsumption + dysonMetalConsumption;
        
        // If no stored metal and consumption > production, calculate idle probes
        if (!hasStoredMetal && totalMetalConsumption > metalProductionRate) {
            if (totalMetalConsumption > 0) {
                const metalDeficit = totalMetalConsumption - metalProductionRate;
                
                // Proportionally distribute idle probes
                if (probeMetalConsumption > 0) {
                    const probeFraction = probeMetalConsumption / totalMetalConsumption;
                    const probeDeficit = metalDeficit * probeFraction;
                    const constructAllocation = this.probeAllocations.construct || {};
                    const constructingProbes = Object.values(constructAllocation).reduce((a, b) => a + b, 0);
                    const probeFractionAlloc = this.buildAllocation / 100.0;
                    const probeBuildingProbes = constructingProbes * probeFractionAlloc;
                    if (probeMetalConsumption > 0) {
                        idleProbes.probes = probeBuildingProbes * (probeDeficit / probeMetalConsumption);
                    }
                }
                
                if (dysonMetalConsumption > 0) {
                    const dysonFraction = dysonMetalConsumption / totalMetalConsumption;
                    const dysonDeficit = metalDeficit * dysonFraction;
                    const dysonAllocation = this.probeAllocations.dyson || {};
                    const totalDysonProbes = Object.values(dysonAllocation).reduce((a, b) => a + b, 0);
                    if (dysonMetalConsumption > 0) {
                        idleProbes.dyson = totalDysonProbes * (dysonDeficit / dysonMetalConsumption);
                    }
                }
            }
        } else if (!hasStoredMetal && metalProductionRate <= 0) {
            // No stored metal and no production - all build probes are idle
            const constructAllocation = this.probeAllocations.construct || {};
            const constructingProbes = Object.values(constructAllocation).reduce((a, b) => a + b, 0);
            const probeFraction = this.buildAllocation / 100.0;
            idleProbes.probes = constructingProbes * probeFraction;
            idleProbes.structures = constructingProbes * (1.0 - probeFraction);
            
            const dysonAllocation = this.probeAllocations.dyson || {};
            idleProbes.dyson = Object.values(dysonAllocation).reduce((a, b) => a + b, 0);
        }
        
        return idleProbes;
    }
    
    _calculateResearchAllocationInfo() {
        const totalIntelligenceFlops = this._calculateIntelligenceProduction();
        
        // Count enabled projects (same logic as _updateResearch)
        const enabledProjects = [];
        const researchTrees = this.dataLoader.getAllResearchTrees();
        
        for (const [treeId, treeData] of Object.entries(researchTrees)) {
            if (!(treeId in this.research)) {
                continue;
            }
            
            if (treeData.tiers) {
                const tiersList = treeData.tiers;
                for (let idx = 0; idx < tiersList.length; idx++) {
                    const tier = tiersList[idx];
                    const tierId = tier.id;
                    if (!(tierId in this.research[treeId])) {
                        continue;
                    }
                    
                    const tierData = this.research[treeId][tierId];
                    if (tierData.enabled) {
                        const tranchesCompleted = tierData.tranches_completed || 0;
                        const maxTranches = tier.tranches || 10;
                        if (tranchesCompleted < maxTranches) {
                            let canResearch = true;
                            if (idx > 0) {
                                const prevTier = tiersList[idx - 1];
                                const prevTierId = prevTier.id;
                                if (prevTierId in this.research[treeId]) {
                                    const prevCompleted = this.research[treeId][prevTierId].tranches_completed || 0;
                                    const prevMax = prevTier.tranches || 10;
                                    if (prevCompleted < prevMax) {
                                        canResearch = false;
                                    }
                                } else {
                                    canResearch = false;
                                }
                            }
                            
                            if (canResearch) {
                                enabledProjects.push([treeId, tierId]);
                            }
                        }
                    }
                }
            }
            
            if (treeData.subcategories) {
                for (const [subcatId, subcatData] of Object.entries(treeData.subcategories)) {
                    if (subcatData.tiers) {
                        const tiersList = subcatData.tiers;
                        for (let idx = 0; idx < tiersList.length; idx++) {
                            const tier = tiersList[idx];
                            const tierKey = subcatId + '_' + tier.id;
                            if (!(tierKey in this.research[treeId])) {
                                continue;
                            }
                            
                            const tierData = this.research[treeId][tierKey];
                            if (tierData.enabled) {
                                const tranchesCompleted = tierData.tranches_completed || 0;
                                const maxTranches = tier.tranches || 10;
                                if (tranchesCompleted < maxTranches) {
                                    let canResearch = true;
                                    if (idx > 0) {
                                        const prevTier = tiersList[idx - 1];
                                        const prevTierKey = subcatId + '_' + prevTier.id;
                                        if (prevTierKey in this.research[treeId]) {
                                            const prevCompleted = this.research[treeId][prevTierKey].tranches_completed || 0;
                                            const prevMax = prevTier.tranches || 10;
                                            if (prevCompleted < prevMax) {
                                                canResearch = false;
                                            }
                                        } else {
                                            canResearch = false;
                                        }
                                    }
                                    
                                    if (canResearch) {
                                        enabledProjects.push([treeId, tierKey]);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Calculate FLOPS per project
        const flopsPerProject = enabledProjects.length > 0 ? totalIntelligenceFlops / enabledProjects.length : 0;
        
        // Build allocation info dict
        const allocationInfo = {};
        for (const [treeId, tierId] of enabledProjects) {
            if (!(treeId in allocationInfo)) {
                allocationInfo[treeId] = {};
            }
            allocationInfo[treeId][tierId] = flopsPerProject;
        }
        
        return allocationInfo;
    }
    // Deprecated: Use Probe.getData() instead
    _getProbeData(probeType) {
        return Probe.getData(probeType);
    }
    
    _getBuildingCategory(buildingId) {
        const buildings = this.dataLoader.buildings;
        if (!buildings) return null;
        
        for (const [category, items] of Object.entries(buildings)) {
            if (Array.isArray(items)) {
                for (const building of items) {
                    if (building.id === buildingId) {
                        return category;
                    }
                }
            }
        }
        return null;
    }
    performAction(actionType, actionData) {
        if (actionType === 'purchase_structure') {
            return this._purchaseStructure(actionData);
        } else if (actionType === 'purchase_probe') {
            return this._purchaseProbe(actionData);
        } else if (actionType === 'allocate_probes') {
            return this._allocateProbes(actionData);
        } else if (actionType === 'allocate_research') {
            return this._allocateResearch(actionData);
        } else if (actionType === 'toggle_research_category') {
            return this._toggleResearchCategory(actionData);
        } else if (actionType === 'set_factory_production') {
            return this._setFactoryProduction(actionData);
        } else if (actionType === 'set_economy_slider') {
            return this._setEconomySlider(actionData);
        } else if (actionType === 'set_build_allocation') {
            return this._setBuildAllocation(actionData);
        } else if (actionType === 'set_dyson_power_allocation') {
            return this._setDysonPowerAllocation(actionData);
        } else if (actionType === 'set_mine_build_slider') {
            return this._setMineBuildSlider(actionData);
        } else if (actionType === 'set_harvest_zone') {
            return this._setHarvestZone(actionData);
        } else if (actionType === 'create_transfer') {
            return this._createTransfer(actionData);
        } else if (actionType === 'update_transfer') {
            return this._updateTransfer(actionData);
        } else if (actionType === 'reverse_transfer') {
            return this._reverseTransfer(actionData);
        } else if (actionType === 'pause_transfer') {
            return this._pauseTransfer(actionData);
        } else if (actionType === 'delete_transfer') {
            return this._deleteTransfer(actionData);
        } else if (actionType === 'recycle_factory') {
            return this._recycleFactory(actionData);
        } else if (actionType === 'set_activity_modifier') {
            return this._setActivityModifier(actionData);
        } else {
            throw new Error(`Unknown action type: ${actionType}`);
        }
    }
    _purchaseStructure(actionData) {
        const buildingId = actionData.building_id;
        const zoneId = actionData.zone_id || this.defaultZone; // Default to Mercury
        let enabled = actionData.enabled;
        
        // Validate zone exists
        const zones = this.dataLoader.orbitalZones || [];
        const zoneIds = zones.map(z => z.id);
        if (!zoneIds.includes(zoneId)) {
            throw new Error(`Invalid zone_id: ${zoneId}`);
        }
        
        const building = this.dataLoader.getBuildingById(buildingId);
        if (!building) {
            throw new Error(`Building not found: ${buildingId}`);
        }
        
        // No prerequisites check - prerequisites removed
        // No upfront cost - buildings consume metal during construction
        
        // Toggle enabled state for continuous construction
        // Use '::' as delimiter since zone IDs and building IDs can both contain underscores
        const enabledKey = `${zoneId}::${buildingId}`;
        if (enabled === undefined || enabled === null) {
            // Toggle if not specified
            enabled = !this.enabledConstruction.has(enabledKey);
        }
        
        if (enabled) {
            // Enable construction for this building type in this zone
            this.enabledConstruction.add(enabledKey);
            // Start construction progress if not already in progress
            if (!(enabledKey in this.structureConstructionProgress)) {
                this.structureConstructionProgress[enabledKey] = 0.0;
            }
        } else {
            // Disable construction
            this.enabledConstruction.delete(enabledKey);
            // Note: Don't remove construction progress - let it finish if in progress
        }
        
        // Invalidate structure cache
        const cache = window.calculationCache;
        if (cache) {
            cache.invalidateStructures();
        }
        
        return {'success': true, 'building_id': buildingId, 'zone_id': zoneId, 'enabled': enabled};
    }
    
    _purchaseProbe(actionData) {
        const probeType = actionData.probe_type || 'probe';
        const zoneId = actionData.zone_id || this.defaultZone; // Default to Mercury
        
        // Validate zone exists
        const zones = this.dataLoader.orbitalZones || [];
        const zoneIds = zones.map(z => z.id);
        if (!zoneIds.includes(zoneId)) {
            throw new Error(`Invalid zone_id: ${zoneId}`);
        }
        
        // Check prerequisites - check in the zone where probe will be built
        const prerequisites = Probe.getPrerequisites(probeType);
        if (prerequisites.length === 0 && Probe.getData(probeType) === null) {
            throw new Error(`Probe type not found: ${probeType}`);
        }
        for (const prereq of prerequisites) {
            // Check if prerequisite structure exists in this zone
            let found = false;
            const zoneStructures = this.structuresByZone[zoneId] || {};
            for (const buildingId of Object.keys(zoneStructures)) {
                if (buildingId === prereq) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                throw new Error(`Prerequisite not met: ${prereq} not found in zone ${zoneId}`);
            }
        }
        
        // Check costs
        const costMetal = Probe.getMetalCost(probeType);
        const costEnergy = Probe.getEnergyCost(probeType);
        
        if (this.metal < costMetal) {
            throw new Error(`Insufficient metal: need ${costMetal}, have ${this.metal}`);
        }
        if (this.energy < costEnergy) {
            throw new Error(`Insufficient energy: need ${costEnergy}, have ${this.energy}`);
        }
        
        // Purchase
        this.metal -= costMetal;
        this.energy -= costEnergy;
        
        // Add probe to zone
        if (!(zoneId in this.probesByZone)) {
            this.probesByZone[zoneId] = {
                'probe': 0,
                'miner_probe': 0,
                'compute_probe': 0,
                'energy_probe': 0,
                'construction_probe': 0
            };
        }
        if (!(probeType in this.probesByZone[zoneId])) {
            this.probesByZone[zoneId][probeType] = 0;
        }
        this.probesByZone[zoneId][probeType] += 1;
        
        // Legacy: also update global probe count
        if (!(probeType in this.probes)) {
            this.probes[probeType] = 0;
        }
        this.probes[probeType] += 1;
        
        // Auto-allocate newly purchased probe if it's a 'probe' type
        if (probeType === 'probe') {
            this._autoAllocateProbes();
        }
        
        return {'success': true, 'probe_type': probeType, 'zone_id': zoneId};
    }
    
    _allocateProbes(actionData) {
        const allocations = actionData.allocations || {};
        
        // First, validate that total allocations don't exceed available probes
        const totalRequested = {};
        for (const [task, probeCounts] of Object.entries(allocations)) {
            if (!(task in this.probeAllocations)) {
                continue;
            }
            for (const [probeType, count] of Object.entries(probeCounts)) {
                if (!(probeType in this.probeAllocations[task])) {
                    continue;
                }
                if (!(probeType in totalRequested)) {
                    totalRequested[probeType] = 0.0;
                }
                totalRequested[probeType] += count;
            }
        }
        
        // Validate totals don't exceed available
        for (const [probeType, totalCount] of Object.entries(totalRequested)) {
            const available = this.probes[probeType] || 0;
            if (totalCount > available + 0.001) { // Small tolerance for floating point
                throw new Error(`Not enough ${probeType}: have ${available}, need ${totalCount}`);
            }
        }
        
        // Reset allocations for tasks that are being updated
        const tasksToReset = new Set(Object.keys(allocations));
        for (const task of tasksToReset) {
            if (task in this.probeAllocations) {
                // Reset all probe types for this task
                for (const probeType of Object.keys(this.probeAllocations[task])) {
                    this.probeAllocations[task][probeType] = 0.0;
                }
            }
        }
        
        // Set new allocations
        for (const [task, probeCounts] of Object.entries(allocations)) {
            if (!(task in this.probeAllocations)) {
                continue;
            }
            
            for (const [probeType, count] of Object.entries(probeCounts)) {
                if (!(probeType in this.probeAllocations[task])) {
                    continue;
                }
                
                // Set allocation (count can be fractional)
                this.probeAllocations[task][probeType] = Math.max(0.0, count);
            }
        }
        
        return {'success': true, 'allocations': this.probeAllocations};
    }
    _setFactoryProduction(actionData) {
        const buildingId = actionData.building_id;
        let production = actionData.production || 0; // 0-100
        
        // Validate production is between 0 and 100
        production = Math.max(0, Math.min(100, production));
        this.factoryProduction[buildingId] = production;
        
        return {'success': true, 'production': production};
    }
    
    _setEconomySlider(actionData) {
        let value = actionData.value !== undefined ? actionData.value : 50;
        
        // Validate value is between 0 and 100
        this.economySlider = Math.max(0, Math.min(100, value));
        
        // Re-allocate probes based on new slider setting
        this._autoAllocateProbes();
        
        return {'success': true, 'economy_slider': this.economySlider};
    }
    
    _setBuildAllocation(actionData) {
        let value = actionData.value !== undefined ? actionData.value : 100;
        
        // Validate value is between 0 and 100
        this.buildAllocation = Math.max(0, Math.min(100, value));
        
        // Note: build_allocation affects production, not allocation, so no need to re-allocate
        
        return {'success': true, 'build_allocation': this.buildAllocation};
    }
    
    _setDysonPowerAllocation(actionData) {
        let value = actionData.value !== undefined ? actionData.value : 0;
        
        // Validate value is between 0 and 100
        this.dysonPowerAllocation = Math.max(0, Math.min(100, value));
        
        // This affects energy and intelligence production, no need to re-allocate probes
        
        return {'success': true, 'dyson_power_allocation': this.dysonPowerAllocation};
    }
    
    _setMineBuildSlider(actionData) {
        let value = actionData.value !== undefined ? actionData.value : 50;
        
        // Validate value is between 0 and 100
        this.mineBuildSlider = Math.max(0, Math.min(100, value));
        
        // Re-allocate probes based on new slider setting
        this._autoAllocateProbes();
        
        return {'success': true, 'mine_build_slider': this.mineBuildSlider};
    }
    
    _setActivityModifier(actionData) {
        const activityId = actionData.activity_id;
        let modifier = actionData.modifier !== undefined ? actionData.modifier : 1.0;
        
        // Validate modifier is between 0 and 1
        modifier = Math.max(0.0, Math.min(1.0, modifier));
        
        // Validate activity ID
        if (!(activityId in this.activityModifiers)) {
            throw new Error(`Unknown activity_id: ${activityId}`);
        }
        
        // Set modifier
        this.activityModifiers[activityId] = modifier;
        
        return {'success': true, 'activity_id': activityId, 'modifier': modifier};
    }
    
    _autoAllocateProbes() {
        // Get total available 'probe' type probes across all zones
        let totalProbes = 0;
        for (const [zoneId, probes] of Object.entries(this.probesByZone)) {
            // Ensure probe counts are integers
            const probeCount = Math.floor(probes.probe || 0);
            probes.probe = probeCount; // Update to integer
            totalProbes += probeCount;
        }
        
        if (totalProbes <= 0) {
            // No probes to allocate, reset allocations
            this.probeAllocations.harvest.probe = 0.0;
            this.probeAllocations.construct.probe = 0.0;
            this.probeAllocations.dyson.probe = 0.0;
            
            // Reset zone allocations
            for (const zoneId of Object.keys(this.probeAllocationsByZone)) {
                if (this.probeAllocationsByZone[zoneId]) {
                    if (this.probeAllocationsByZone[zoneId].harvest) this.probeAllocationsByZone[zoneId].harvest.probe = 0.0;
                    if (this.probeAllocationsByZone[zoneId].construct) this.probeAllocationsByZone[zoneId].construct.probe = 0.0;
                    if (this.probeAllocationsByZone[zoneId].dyson) this.probeAllocationsByZone[zoneId].dyson.probe = 0.0;
                    if (this.probeAllocationsByZone[zoneId].replicate) this.probeAllocationsByZone[zoneId].replicate.probe = 0.0;
                }
            }
            return;
        }
        
        // Step 1: Split between Dyson and Economy based on economy_slider
        const economyFraction = this.economySlider / 100.0;
        const dysonFraction = 1.0 - economyFraction;
        
        let dysonProbes = totalProbes * dysonFraction;
        const economyProbes = totalProbes * economyFraction;
        
        // Step 2: Within Economy, split between harvest and construct based on mine_build_slider
        const constructFraction = this.mineBuildSlider / 100.0;
        const harvestFraction = 1.0 - constructFraction;
        
        const harvestProbes = economyProbes * harvestFraction;
        const constructProbes = economyProbes * constructFraction;
        
        // Allocate probes globally (for backward compatibility)
        this.probeAllocations.dyson.probe = dysonProbes;
        this.probeAllocations.harvest.probe = harvestProbes;
        this.probeAllocations.construct.probe = constructProbes;
        
        // Distribute allocations across zones using zone policies
        // Each zone uses its own policy sliders to allocate probes
        for (const [zoneId, probes] of Object.entries(this.probesByZone)) {
            // Ensure probe count is an integer
            const zoneProbeCount = Math.floor(probes.probe || 0);
            probes.probe = zoneProbeCount; // Update to integer
            if (zoneProbeCount <= 0) {
                // No probes in this zone, reset allocations
                if (this.probeAllocationsByZone[zoneId]) {
                    if (this.probeAllocationsByZone[zoneId].harvest) this.probeAllocationsByZone[zoneId].harvest.probe = 0.0;
                    if (this.probeAllocationsByZone[zoneId].construct) this.probeAllocationsByZone[zoneId].construct.probe = 0.0;
                    if (this.probeAllocationsByZone[zoneId].dyson) this.probeAllocationsByZone[zoneId].dyson.probe = 0.0;
                    if (this.probeAllocationsByZone[zoneId].replicate) this.probeAllocationsByZone[zoneId].replicate.probe = 0.0;
                }
                continue;
            }
            
            // Ensure zone allocations structure exists
            if (!this.probeAllocationsByZone[zoneId]) {
                this.probeAllocationsByZone[zoneId] = {
                    harvest: {probe: 0},
                    replicate: {probe: 0},
                    construct: {probe: 0},
                    dyson: {probe: 0}
                };
            }
            
            // Use zone policies to allocate probes
            const policy = this.zonePolicies[zoneId] || {};
            const zones = this.dataLoader.orbitalZones || [];
            const zoneData = zones.find(z => z.id === zoneId);
            const isDysonZone = zoneData && zoneData.is_dyson_zone;
            
            if (isDysonZone) {
                // Dyson zone: dyson_allocation_slider splits between Dyson construction and Build
                // Labels: "Dyson" at top, "Build" at bottom
                // Variable now matches labels: higher value = more Dyson (top label)
                // dyson_allocation_slider: 0 = all Build (bottom), 100 = all Dyson (top)
                const dysonAllocationSlider = policy.dyson_allocation_slider !== undefined ? policy.dyson_allocation_slider : (policy.dyson_build_slider !== undefined ? (100 - policy.dyson_build_slider) : 100);
                // Variable directly represents Dyson fraction (matches top label)
                const dysonFraction = dysonAllocationSlider / 100.0; // 0 = 0% Dyson (all Build), 100 = 100% Dyson (all Dyson)
                const buildFraction = 1.0 - dysonFraction; // Inverse: 0 = 100% Build, 100 = 0% Build
                
                // Within Build, split between construct and replicate using replication_slider
                const replicationSlider = (policy.replication_slider !== undefined ? policy.replication_slider : 100) / 100.0;
                const constructFraction = 1.0 - replicationSlider;
                const replicateFraction = replicationSlider;
                
                if (!this.probeAllocationsByZone[zoneId].dyson) this.probeAllocationsByZone[zoneId].dyson = {probe: 0};
                if (!this.probeAllocationsByZone[zoneId].construct) this.probeAllocationsByZone[zoneId].construct = {probe: 0};
                if (!this.probeAllocationsByZone[zoneId].replicate) this.probeAllocationsByZone[zoneId].replicate = {probe: 0};
                if (!this.probeAllocationsByZone[zoneId].harvest) this.probeAllocationsByZone[zoneId].harvest = {probe: 0};
                
                // Allocate probes to Dyson construction
                this.probeAllocationsByZone[zoneId].dyson.probe = zoneProbeCount * dysonFraction;
                
                // Allocate remaining probes to Build (split between construct and replicate)
                const buildProbes = zoneProbeCount * buildFraction;
                this.probeAllocationsByZone[zoneId].construct.probe = buildProbes * constructFraction;
                this.probeAllocationsByZone[zoneId].replicate.probe = buildProbes * replicateFraction;
                
                // Explicitly set harvest to 0 for Dyson zone - no mining allowed
                this.probeAllocationsByZone[zoneId].harvest.probe = 0;
            } else {
                // Regular zones: use zone policies (mining_slider and replication_slider)
                // mining_slider: 0 = all build (top), 100 = all mine (bottom)
                const miningSliderValue = policy.mining_slider !== undefined ? policy.mining_slider : 50;
                const buildFraction = (100 - miningSliderValue) / 100.0;
                const harvestFraction = miningSliderValue / 100.0;
                const replicationSlider = (policy.replication_slider !== undefined ? policy.replication_slider : 100) / 100.0;
                
                const miningCount = zoneProbeCount * harvestFraction;
                const buildCount = zoneProbeCount * buildFraction;
                const replicateCount = buildCount * replicationSlider;
                const constructCount = buildCount * (1.0 - replicationSlider);
                
                if (!this.probeAllocationsByZone[zoneId].harvest) this.probeAllocationsByZone[zoneId].harvest = {probe: 0};
                if (!this.probeAllocationsByZone[zoneId].replicate) this.probeAllocationsByZone[zoneId].replicate = {probe: 0};
                if (!this.probeAllocationsByZone[zoneId].construct) this.probeAllocationsByZone[zoneId].construct = {probe: 0};
                
                this.probeAllocationsByZone[zoneId].harvest.probe = miningCount;
                this.probeAllocationsByZone[zoneId].replicate.probe = replicateCount;
                this.probeAllocationsByZone[zoneId].construct.probe = constructCount;
                if (this.probeAllocationsByZone[zoneId].dyson) this.probeAllocationsByZone[zoneId].dyson.probe = 0;
            }
        }
        
        // Ensure allocations don't exceed total (due to rounding)
        const totalAllocated = this.probeAllocations.dyson.probe + 
                             this.probeAllocations.harvest.probe + 
                             this.probeAllocations.construct.probe;
        
        if (totalAllocated > totalProbes + 0.001) { // Small tolerance for floating point
            // Scale down proportionally
            const scale = totalAllocated > 0 ? totalProbes / totalAllocated : 0;
            this.probeAllocations.dyson.probe *= scale;
            this.probeAllocations.harvest.probe *= scale;
            this.probeAllocations.construct.probe *= scale;
            
            // Also scale zone allocations
            for (const zoneId of Object.keys(this.probeAllocationsByZone)) {
                this.probeAllocationsByZone[zoneId].dyson.probe *= scale;
                this.probeAllocationsByZone[zoneId].harvest.probe *= scale;
                this.probeAllocationsByZone[zoneId].construct.probe *= scale;
            }
        }
    }
    
    _setHarvestZone(actionData) {
        const zoneId = actionData.zone_id || 'earth';
        
        // Validate zone exists
        const zones = this.dataLoader.orbitalZones || [];
        if (zones.length === 0) {
            throw new Error('Orbital zones not loaded');
        }
        const zoneIds = zones.map(z => z.id);
        if (!zoneIds.includes(zoneId)) {
            throw new Error(`Invalid zone_id: ${zoneId}`);
        }
        
        this.harvestZone = zoneId;
        
        return {'success': true, 'harvest_zone': this.harvestZone};
    }
    
    _createTransfer(actionData) {
        const fromZone = actionData.from_zone;
        const toZone = actionData.to_zone;
        const transferType = actionData.transfer_type || 'one-time';
        const count = actionData.count || 0;
        const rate = actionData.rate || 0;
        
        // Validate zones exist
        const zones = this.dataLoader.orbitalZones || [];
        const zoneIds = zones.map(z => z.id);
        if (!zoneIds.includes(fromZone) || !zoneIds.includes(toZone)) {
            throw new Error(`Invalid zone_id: ${fromZone} or ${toZone}`);
        }
        
        if (fromZone === toZone) {
            throw new Error('Cannot transfer probes to the same zone');
        }
        
        // Get available probes in source zone
        const sourceProbes = this.probesByZone[fromZone] || {};
        let totalAvailable = 0;
        for (const count of Object.values(sourceProbes)) {
            totalAvailable += count;
        }
        
        if (transferType === 'one-time') {
            if (count > totalAvailable) {
                throw new Error(`Insufficient probes: need ${count}, have ${totalAvailable}`);
            }
            
            // Calculate transfer time and rate for one-time transfer
            const fromZoneData = zones.find(z => z.id === fromZone);
            const toZoneData = zones.find(z => z.id === toZone);
            let transferTime = this._calculateTransferTime(fromZoneData, toZoneData);
            
            // Validate transfer time is positive
            if (!transferTime || transferTime <= 0) {
                transferTime = 90.0; // Fallback to default (3 months = 90 days)
                console.warn(`Invalid transfer time calculated for ${fromZone} -> ${toZone}, using default 90 days`);
            }
            
            // For one-time transfers, all probes go at once, but they arrive after transferTime
            // We don't need a rate - probes are removed immediately and added after transferTime
            const transferRate = 0; // Not used for one-time transfers
            
            // Transfers don't consume energy - probes use their own propulsion drives
            
            // Create one-time transfer that will be processed over time
            if (!this.activeTransfers) {
                this.activeTransfers = [];
            }
            
            // For one-time transfers, remove all probes from source immediately
            if (!(fromZone in this.probesByZone)) {
                this.probesByZone[fromZone] = {'probe': 0};
            }
            const currentFrom = Math.floor(this.probesByZone[fromZone].probe || 0);
            const countInt = Math.floor(count);
            if (currentFrom < countInt) {
                throw new Error(`Insufficient probes: need ${countInt}, have ${currentFrom}`);
            }
            this.probesByZone[fromZone].probe = Math.max(0, currentFrom - countInt);
            
            const transferId = Date.now() + Math.random();
            const departureTime = this.time;
            const arrivalTime = this.time + transferTime;
            
            const transfer = {
                id: transferId,
                from: fromZone,
                to: toZone,
                type: 'one-time',
                count: count,
                rate: transferRate,
                progress: 0,
                totalCount: count,
                transferTime: transferTime, // Store transfer time for transit tracking
                paused: false,
                startTime: this.time, // Use game time, not Date.now()
                departureTime: departureTime,
                arrivalTime: arrivalTime,
                inTransit: [{count: count, departureTime: departureTime, arrivalTime: arrivalTime}] // All probes in transit with same arrival time
            };
            
            this.activeTransfers.push(transfer);
            
            // Add to history
            this.transferHistory.push({
                'from': fromZone,
                'to': toZone,
                'type': 'one-time',
                'count': count,
                'time': this.time
            });
            
            return {'success': true, 'transfer_id': transferId, 'transfer_rate': transferRate, 'transfer_time': transferTime};
        } else {
            // Continuous transfer - rate is percentage of probe production rate in source zone
            if (rate <= 0 || rate > 100) {
                throw new Error('Transfer rate must be between 0 and 100 (percentage of probe production)');
            }
            
            // Calculate transfer rate as percentage of current probes in source zone (per day)
            const sourceZoneProbes = (this.probesByZone[fromZone] && this.probesByZone[fromZone].probe) || 0;
            const actualTransferRate = (sourceZoneProbes * rate) / 100.0; // probes per day (percentage of current drones)
            
            // Calculate transfer time to determine arrival rate
            const fromZoneData = zones.find(z => z.id === fromZone);
            const toZoneData = zones.find(z => z.id === toZone);
            let transferTime = this._calculateTransferTime(fromZoneData, toZoneData);
            
            // Validate transfer time is positive
            if (!transferTime || transferTime <= 0) {
                transferTime = 90.0; // Fallback to default (3 months = 90 days)
                console.warn(`Invalid transfer time calculated for ${fromZone} -> ${toZone}, using default 90 days`);
            }
            
            // The rate at which probes are sent is actualTransferRate
            // Probes wait full transferTime before any arrive, then arrive continuously at sending rate
            
            // Store continuous transfer (will be processed in tick)
            if (!this.activeTransfers) {
                this.activeTransfers = [];
            }
            
            // Transfers don't consume energy - probes use their own propulsion drives
            
            const transferId = Date.now() + Math.random();
            const transfer = {
                id: transferId,
                from: fromZone,
                to: toZone,
                type: 'continuous',
                rate: actualTransferRate, // probes per day (actual rate, recalculated each tick)
                ratePercentage: rate, // store original percentage input
                transferTime: transferTime, // time for probes to arrive
                paused: false,
                inTransit: [] // probes currently in transit: [{count, arrivalTime}]
            };
            
            this.activeTransfers.push(transfer);
            
            // Add to history
            this.transferHistory.push({
                id: transferId,
                from: fromZone,
                to: toZone,
                type: 'continuous',
                rate: rate,
                ratePercentage: rate,
                status: 'active',
                startTime: Date.now()
            });
            
            return {'success': true, 'transfer_id': transferId, 'transfer_rate': actualTransferRate};
        }
    }
    
    _calculateTotalProbes() {
        // Calculate total probes across all zones
        let totalProbes = 0;
        for (const zoneId in this.probesByZone) {
            const zoneProbes = this.probesByZone[zoneId] || {};
            for (const probeType in zoneProbes) {
                totalProbes += zoneProbes[probeType] || 0;
            }
        }
        return {'probe': totalProbes};
    }
    
    _calculateTransferTime(fromZone, toZone) {
        // Base transfer time between Mercury and Sun (Dyson Sphere): 3 months = 90 days
        const BASE_TRANSFER_TIME = 90.0; // days (3 months baseline)
        
        // Get zone IDs
        const fromZoneId = fromZone.id || '';
        const toZoneId = toZone.id || '';
        
        // Check if this is dyson to mercury or vice versa
        const isDysonToMercury = (fromZoneId === 'dyson_sphere' && toZoneId === 'mercury') ||
                                 (fromZoneId === 'mercury' && toZoneId === 'dyson_sphere');
        
        if (isDysonToMercury) {
            // Base case: Mercury to Sun (Dyson Sphere) = 90 days (3 months)
            let transferTime = BASE_TRANSFER_TIME;
            
            // Apply research bonuses for propulsion
            const specificImpulseBonus = this._getResearchBonus('propulsion_systems', 'specific_impulse_improvement', 0.0);
            const propulsionEfficiency = this._getResearchBonus('propulsion_systems', 'ultimate_propulsion_efficiency', 0.0);
            const speedMultiplier = 1.0 + specificImpulseBonus + propulsionEfficiency;
            
            // Faster probes = shorter transfer time
            transferTime = transferTime / speedMultiplier;
            
            // Apply transportation structure speed boosts (from source zone)
            transferTime = this._applyTransportSpeedBoosts(fromZoneId, transferTime);
            
            return transferTime;
        }
        
        // For other transfers, scale based on distance and delta-v
        const r1 = (fromZone.radius_km || fromZone.radius_au * 149597870.7) || 149597870.7; // km
        const r2 = (toZone.radius_km || toZone.radius_au * 149597870.7) || 149597870.7; // km
        
        // Calculate distance ratio relative to dyson-mercury distance
        const dysonRadius = 30000000; // km (0.2 AU)
        const mercuryRadius = 58000000; // km (0.39 AU)
        const baseDistance = Math.abs(mercuryRadius - dysonRadius);
        const actualDistance = Math.abs(r2 - r1);
        const distanceRatio = actualDistance / baseDistance;
        
        // Calculate delta-v ratio
        const r1_au = fromZone.radius_au || (r1 / 149597870.7);
        const r2_au = toZone.radius_au || (r2 / 149597870.7);
        const radiusRatio = Math.max(r1_au, r2_au) / Math.min(r1_au, r2_au);
        const deltaV = 30.0 * Math.sqrt(radiusRatio) * 0.5; // km/s
        
        const baseDeltaV = 30.0 * Math.sqrt(mercuryRadius / dysonRadius) * 0.5;
        const deltaVRatio = deltaV / baseDeltaV;
        
        // Scale transfer time: base time * distance ratio * delta-v ratio
        let transferTime = BASE_TRANSFER_TIME * distanceRatio * deltaVRatio;
        
        // Apply research bonuses for propulsion
        const specificImpulseBonus = this._getResearchBonus('propulsion_systems', 'specific_impulse_improvement', 0.0);
        const propulsionEfficiency = this._getResearchBonus('propulsion_systems', 'ultimate_propulsion_efficiency', 0.0);
        const speedMultiplier = 1.0 + specificImpulseBonus + propulsionEfficiency;
        
        // Faster probes = shorter transfer time
        transferTime = transferTime / speedMultiplier;
        
        // Apply transportation structure speed boosts (from source zone)
        transferTime = this._applyTransportSpeedBoosts(fromZoneId, transferTime);
        
        return transferTime;
    }
    
    /**
     * Apply speed boosts from transportation structures in the source zone.
     * Uses exponential decay: effective_reduction = 1 - (1 - base_reduction)^num_structures
     * Minimum transfer time is 5% of original (95% max reduction), except for wormhole network.
     * @param {string} zoneId - The source zone ID
     * @param {number} baseTransferTime - The base transfer time before speed boosts
     * @returns {number} Transfer time after applying speed boosts
     */
    _applyTransportSpeedBoosts(zoneId, baseTransferTime) {
        const originalTransferTime = baseTransferTime;
        let transferTime = baseTransferTime;
        
        // Check for wormhole network first (bypasses all limits)
        const zoneStructures = this.structuresByZone[zoneId] || {};
        let hasWormholeNetwork = false;
        
        // Check for transportation structures with speed boosts
        const transportStructures = {}; // {buildingId: {count: number, speedMultiplier: number, bypassLimit: boolean}}
        
        for (const [buildingId, count] of Object.entries(zoneStructures)) {
            if (count <= 0) continue;
            
            const building = this.dataLoader.getBuildingById(buildingId);
            if (building) {
                const effects = building.effects || {};
                const speedMultiplier = effects.transfer_speed_multiplier || 0;
                const bypassLimit = effects.bypass_speed_limit || false;
                
                if (speedMultiplier > 0) {
                    if (effects.wormhole_network) {
                        hasWormholeNetwork = true;
                    }
                    
                    if (!transportStructures[buildingId]) {
                        transportStructures[buildingId] = {
                            count: 0,
                            speedMultiplier: speedMultiplier,
                            bypassLimit: bypassLimit
                        };
                    }
                    transportStructures[buildingId].count += count;
                }
            }
        }
        
        // If wormhole network exists, apply near-instant transfer (0.1% of original time)
        if (hasWormholeNetwork) {
            return originalTransferTime * 0.001; // 99.9% reduction, effectively instant
        }
        
        // Otherwise, apply exponential decay for each structure type
        // Calculate total reduction from all structure types combined
        let totalReductionFraction = 1.0; // Start with 100% of original time
        
        for (const [buildingId, data] of Object.entries(transportStructures)) {
            const baseReduction = data.speedMultiplier; // e.g., 0.10 = 10% reduction per structure
            const count = data.count;
            
            // Exponential decay per structure type: effective_reduction = 1 - (1 - base_reduction)^count
            // This means each additional structure of the same type provides diminishing returns
            // Example: 10% base reduction
            //   1 structure: 1 - (1-0.10)^1 = 10% reduction
            //   2 structures: 1 - (1-0.10)^2 = 19% reduction (not 20%)
            //   3 structures: 1 - (1-0.10)^3 = 27.1% reduction (not 30%)
            const structureReduction = 1.0 - Math.pow(1.0 - baseReduction, count);
            
            // Apply reduction multiplicatively (each type reduces the remaining time)
            totalReductionFraction *= (1.0 - structureReduction);
        }
        
        // Calculate final transfer time
        transferTime = originalTransferTime * totalReductionFraction;
        
        // Cap at 95% reduction maximum (minimum 5% of original time)
        // This ensures we can't go below 5% of original time, regardless of how many structures
        // Unless wormhole network bypasses this (already handled above)
        const minTransferTime = originalTransferTime * 0.05;
        transferTime = Math.max(transferTime, minTransferTime);
        
        return transferTime;
    }
    
    _calculateTransferEnergyCost(fromZone, toZone, probeCount) {
        // Transfers don't consume energy - probes use their own propulsion drives
        return 0;
    }
    
    /**
     * Calculate the net probe production rate for a specific zone.
     * This includes factory production, replication production, and incoming transfers.
     * @param {string} zoneId - The zone ID to calculate production for
     * @returns {number} Probe production rate in probes per second
     */
    _calculateZoneProbeProductionRate(zoneId) {
        let sourceZoneNetIncreaseRate = 0.0;
        
        // 1. Factory production in source zone
        if (this.factoryProductionByZone && this.factoryProductionByZone[zoneId]) {
            sourceZoneNetIncreaseRate += this.factoryProductionByZone[zoneId].rate || 0;
        }
        
        // 2. Replication production in source zone
        const zoneAllocations = this.probeAllocationsByZone[zoneId] || {};
        const replicateAllocation = zoneAllocations.replicate || {};
        let replicatingProbesInZone = Object.values(replicateAllocation).reduce((a, b) => a + b, 0);
        
        // Also check construct allocations that are set to replicate
        const constructAllocation = zoneAllocations.construct || {};
        const constructingProbesInZone = Object.values(constructAllocation).reduce((a, b) => a + b, 0);
        if (constructingProbesInZone > 0) {
            const zonePolicy = this.zonePolicies[zoneId] || {};
            const replicationSlider = zonePolicy.replication_slider !== undefined ? zonePolicy.replication_slider : 50;
            const replicateFraction = replicationSlider / 100.0;
            replicatingProbesInZone += constructingProbesInZone * replicateFraction;
        }
        
        // Calculate replication rate (probes building other probes)
        const buildingRateBonus = this._getResearchBonus('production_efficiency', 'building_rate_multiplier', 1.0);
        const effectiveBuildRate = Config.PROBE_BUILD_RATE * buildingRateBonus;
        const replicationRate = replicatingProbesInZone * effectiveBuildRate;
        
        // Get metal cost per probe for replication
        const metalCostPerProbe = Probe.getMetalCost('probe');
        
        // Convert replication rate from kg/day to probes/day
        const replicationProbesPerDay = replicationRate / metalCostPerProbe;
        sourceZoneNetIncreaseRate += replicationProbesPerDay;
        
        // 3. Incoming transfers arriving at source zone
        let incomingTransferRate = 0.0;
        if (this.activeTransfers) {
            for (const otherTransfer of this.activeTransfers) {
                if (otherTransfer.paused) continue;
                if (otherTransfer.to === zoneId && otherTransfer.type === 'continuous') {
                    incomingTransferRate += otherTransfer.rate || 0;
                }
            }
        }
        
        sourceZoneNetIncreaseRate += incomingTransferRate;
        
        return sourceZoneNetIncreaseRate;
    }
    
    _updateTransfer(actionData) {
        const transferId = actionData.transfer_id;
        // Accept either rate_percentage (preferred) or rate for backward compatibility
        const newRatePercentage = actionData.rate_percentage !== undefined ? actionData.rate_percentage : actionData.rate;
        
        if (!newRatePercentage || newRatePercentage <= 0 || newRatePercentage > 100) {
            throw new Error('Transfer rate must be between 0 and 100 (percentage of current drones per day)');
        }
        
        const transfer = this.activeTransfers.find(t => t.id == transferId);
        if (!transfer) {
            throw new Error(`Transfer not found: ${transferId}`);
        }
        
        // Update percentage; actual per-day rate will be recalculated each tick
        transfer.ratePercentage = newRatePercentage;
        
        // Transfers don't consume energy - probes use their own propulsion drives
        
        // Update history
        const historyItem = this.transferHistory.find(t => t.id == transferId);
        if (historyItem) {
            historyItem.rate = newRatePercentage;
            historyItem.ratePercentage = newRatePercentage;
        }
        
        return {'success': true, 'transfer_id': transferId, 'new_rate_percentage': newRatePercentage};
    }
    
    _reverseTransfer(actionData) {
        const transferId = actionData.transfer_id;
        
        const transfer = this.activeTransfers.find(t => t.id == transferId);
        if (!transfer) {
            throw new Error(`Transfer not found: ${transferId}`);
        }
        
        // Swap from and to
        const temp = transfer.from;
        transfer.from = transfer.to;
        transfer.to = temp;
        
        // Update history
        const historyItem = this.transferHistory.find(t => t.id == transferId);
        if (historyItem) {
            const temp2 = historyItem.from;
            historyItem.from = historyItem.to;
            historyItem.to = temp2;
        }
        
        return {'success': true, 'transfer_id': transferId};
    }
    
    _pauseTransfer(actionData) {
        const transferId = actionData.transfer_id;
        const paused = actionData.paused !== undefined ? actionData.paused : true;
        
        const transfer = this.activeTransfers.find(t => t.id == transferId);
        if (!transfer) {
            throw new Error(`Transfer not found: ${transferId}`);
        }
        
        transfer.paused = paused;
        
        // Update history
        const historyItem = this.transferHistory.find(t => t.id == transferId);
        if (historyItem) {
            historyItem.status = paused ? 'paused' : 'active';
        }
        
        return {'success': true, 'transfer_id': transferId, 'paused': paused};
    }
    
    _deleteTransfer(actionData) {
        const transferId = actionData.transfer_id;
        
        // Remove from active transfers
        const index = this.activeTransfers.findIndex(t => t.id == transferId);
        if (index > -1) {
            this.activeTransfers.splice(index, 1);
        }
        
        // Update history status
        const historyItem = this.transferHistory.find(t => t.id == transferId);
        if (historyItem) {
            historyItem.status = 'deleted';
        }
        
        return {'success': true, 'transfer_id': transferId};
    }
    
    _allocateResearch(actionData) {
        const treeId = actionData.tree_id;
        const tierId = actionData.tier_id;
        const enabled = actionData.enabled !== undefined ? actionData.enabled : false;
        
        if (!(treeId in this.research)) {
            throw new Error(`Research tree not found: ${treeId}`);
        }
        
        if (!(tierId in this.research[treeId])) {
            throw new Error(`Research tier not found: ${tierId}`);
        }
        
        // Toggle enabled state
        this.research[treeId][tierId].enabled = enabled;
        
        return {'success': true, 'tree_id': treeId, 'tier_id': tierId, 'enabled': enabled};
    }
    
    _toggleResearchCategory(actionData) {
        const category = actionData.category;
        const enabled = actionData.enabled !== undefined ? actionData.enabled : false;
        
        if (!['energy', 'dexterity', 'intelligence'].includes(category)) {
            throw new Error(`Invalid category: ${category}`);
        }
        
        const researchTrees = this.dataLoader.getAllResearchTrees();
        let toggledCount = 0;
        
        // Map category to tree IDs
        const categoryTrees = {
            'energy': ['energy_collection', 'solar_concentrators', 'energy_storage', 'energy_transport', 'energy_matter_conversion'],
            'dexterity': ['propulsion_systems', 'locomotion_systems', 'acds', 'robotic_systems', 
                         'dyson_swarm_construction', 'production_efficiency', 'recycling_efficiency'],
            'intelligence': ['research_rate_efficiency']
        };
        
        // Toggle all tiers in category trees
        for (const treeId of (categoryTrees[category] || [])) {
            if (!(treeId in this.research)) {
                continue;
            }
            
            const treeData = researchTrees[treeId];
            if (!treeData) {
                continue;
            }
            
            // Toggle regular tiers
            if (treeData.tiers) {
                for (const tier of treeData.tiers) {
                    const tierId = tier.id;
                    if (tierId in this.research[treeId]) {
                        this.research[treeId][tierId].enabled = enabled;
                        toggledCount += 1;
                    }
                }
            }
            
            // Toggle subcategories (for computer systems)
            if (treeData.subcategories) {
                for (const [subcatId, subcatData] of Object.entries(treeData.subcategories)) {
                    if (subcatData.tiers) {
                        for (const tier of subcatData.tiers) {
                            const tierKey = subcatId + '_' + tier.id;
                            if (tierKey in this.research[treeId]) {
                                this.research[treeId][tierKey].enabled = enabled;
                                toggledCount += 1;
                            }
                        }
                    }
                }
            }
        }
        
        // Also handle computer_systems subcategories for intelligence category
        if (category === 'intelligence' && 'computer_systems' in researchTrees) {
            const treeId = 'computer_systems';
            if (treeId in this.research) {
                const treeData = researchTrees[treeId];
                if (treeData.subcategories) {
                    for (const [subcatId, subcatData] of Object.entries(treeData.subcategories)) {
                        if (subcatData.tiers) {
                            for (const tier of subcatData.tiers) {
                                const tierKey = subcatId + '_' + tier.id;
                                if (tierKey in this.research[treeId]) {
                                    this.research[treeId][tierKey].enabled = enabled;
                                    toggledCount += 1;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        return {'success': true, 'category': category, 'enabled': enabled, 'toggled_count': toggledCount};
    }
    _recycleFactory(actionData) {
        const factoryId = actionData.factory_id;
        const zoneId = actionData.zone_id;
        
        if (!factoryId) {
            throw new Error('factory_id is required');
        }
        if (!zoneId) {
            throw new Error('zone_id is required');
        }
        
        // Validate zone exists
        const zones = this.dataLoader.orbitalZones || [];
        const zoneIds = zones.map(z => z.id);
        if (!zoneIds.includes(zoneId)) {
            throw new Error(`Invalid zone_id: ${zoneId}`);
        }
        
        // Check if factory exists in zone
        if (!this.structuresByZone[zoneId] || !(factoryId in this.structuresByZone[zoneId])) {
            throw new Error(`Factory ${factoryId} not found in zone ${zoneId}`);
        }
        
        if (this.structuresByZone[zoneId][factoryId] <= 0) {
            throw new Error(`No factories of type ${factoryId} to recycle in zone ${zoneId}`);
        }
        
        // Get factory data
        const building = this.dataLoader.getBuildingById(factoryId);
        if (!building) {
            throw new Error(`Building not found: ${factoryId}`);
        }
        
        // Calculate recycling return
        const recyclingEfficiency = this._getRecyclingEfficiency();
        
        const costMetal = building.base_cost_metal || 0;
        
        const metalReturned = costMetal * recyclingEfficiency;
        const slagProduced = costMetal * (1 - recyclingEfficiency);
        
        // Recycle
        this.metal += metalReturned;
        this.slag += slagProduced;
        
        // Remove factory from zone
        this.structuresByZone[zoneId][factoryId] -= 1;
        if (this.structuresByZone[zoneId][factoryId] <= 0) {
            delete this.structuresByZone[zoneId][factoryId];
        }
        
        // Legacy: also update global structure count if it exists
        if (factoryId in this.structures) {
            this.structures[factoryId] = Math.max(0, (this.structures[factoryId] || 0) - 1);
            if (this.structures[factoryId] <= 0) {
                delete this.structures[factoryId];
            }
        }
        
        return {
            'success': true,
            'metal_returned': metalReturned,
            'energy_returned': 0,
            'slag_produced': slagProduced
        };
    }
    
    // Legacy method - kept for backward compatibility but now calls _recycleFactory
    recycleFactory(factoryId, zoneId) {
        return this._recycleFactory({ factory_id: factoryId, zone_id: zoneId });
    }
    
    async setZonePolicy(zoneId, policyKey, value) {
        // Set a zone policy value
        if (!this.zonePolicies[zoneId]) {
            this.zonePolicies[zoneId] = {};
        }
        this.zonePolicies[zoneId][policyKey] = value;
        // Recalculate zone activities
        this._autoAllocateProbes();
        return { success: true };
    }
}

/** Game engine client-side wrapper - uses local engine instead of API */
class GameEngineClient {
    constructor() {
        this.sessionId = null;
        this.engine = null;
        this.isRunning = false;
        this.lastTickTime = performance.now();
        this.tickInterval = null;
        this.tickRate = 60; // ticks per day - fixed rate
        this.deltaTime = 1 / this.tickRate; // Fixed delta time per tick in days (1/60 day)
        this.timeSpeed = 1; // Speed multiplier (applied to delta_time, not tick rate)
        this.autoSaveInterval = null;
        this.autoSaveIntervalMs = 60000; // Auto-save every 60 seconds
    }

    async start(sessionId, config = {}) {
        this.sessionId = sessionId;
        this.isRunning = true;
        this.lastTickTime = performance.now();
        
        // Initialize local engine
        this.engine = new GameEngine(sessionId, config);
        await this.engine.initialize();
        
        // Use fixed interval: tick at exactly 60 ticks per second (every ~16.67ms)
        const tickIntervalMs = 1000 / this.tickRate; // ~16.67ms for 60 ticks/sec
        console.log('Starting game tick interval:', tickIntervalMs, 'ms, tickRate:', this.tickRate);
        this.tickInterval = setInterval(() => this.tick(), tickIntervalMs);
        
        // Start auto-save
        this.startAutoSave();
    }
    
    startAutoSave() {
        // Clear existing auto-save interval if any
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
        
        // Set up periodic auto-save
        this.autoSaveInterval = setInterval(() => {
            this.saveGameState().catch(err => {
                console.error('Auto-save failed:', err);
            });
        }, this.autoSaveIntervalMs);
    }
    
    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }
    
    async saveGameState() {
        if (!this.engine) {
            return;
        }
        
        const gameState = this.engine.getState();
        
        // Save to IndexedDB (local storage)
        try {
            if (typeof gameStorage !== 'undefined') {
                await gameStorage.init();
                await gameStorage.saveGameState(this.sessionId, gameState);
                console.log('Game state saved locally');
            }
        } catch (error) {
            console.error('Failed to save game state locally:', error);
            // Continue even if local save fails
        }
        
        // Save to backend (cloud sync) - only if sessionId is not 'local'
        if (this.sessionId && this.sessionId !== 'local' && typeof api !== 'undefined') {
            try {
                await api.saveGameState(this.sessionId, gameState);
                console.log('Game state saved to backend');
            } catch (error) {
                // Log warning but don't throw - backend save is optional
                console.warn('Failed to save game state to backend (continuing with local save):', error);
            }
        }
    }
    
    async loadGameState(sessionId) {
        try {
            if (typeof gameStorage === 'undefined') {
                throw new Error('GameStorage not available');
            }
            
            await gameStorage.init();
            const gameState = await gameStorage.loadGameState(sessionId);
            return gameState;
        } catch (error) {
            console.error('Failed to load game state:', error);
            throw error;
        }
    }
    
    async loadFromState(sessionId, config, state) {
        this.sessionId = sessionId;
        this.engine = await GameEngine.loadFromState(sessionId, config, state);
        return this.engine;
    }

    stop() {
        this.isRunning = false;
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
        this.stopAutoSave();
        
        // Save state before stopping
        if (this.engine) {
            this.saveGameState().catch(err => {
                console.error('Failed to save game state on stop:', err);
            });
        }
    }

    tick() {
        if (!this.isRunning) {
            return;
        }
        
        if (!this.engine) {
            console.warn('GameEngineClient.tick(): engine is null');
            return;
        }

        try {
            // Always tick at fixed rate (60 ticks/day)
            // Time system: fundamental unit is 1 day
            // Each tick = 1/60 day (at 1x speed)
            // At 100x speed: 100 days per tick
            // deltaTime is in days (1/60 at 60 ticks/day), apply time speed
            const DAYS_PER_TICK = 1.0 / 60.0; // 1 day / 60 ticks
            const effectiveDeltaTimeDays = DAYS_PER_TICK * this.timeSpeed;
            
            // Ensure effectiveDeltaTimeDays is valid
            if (!effectiveDeltaTimeDays || effectiveDeltaTimeDays <= 0 || isNaN(effectiveDeltaTimeDays) || !isFinite(effectiveDeltaTimeDays)) {
                console.warn('Invalid effectiveDeltaTimeDays:', effectiveDeltaTimeDays, 'timeSpeed:', this.timeSpeed);
                return;
            }
            
            // Execute single tick with time-scaled delta_time in days
            const tickStartTime = performance.now();
            this.engine.tick(effectiveDeltaTimeDays);
            const tickEndTime = performance.now();
            
            // Record tick time
            const profiler = window.performanceProfiler;
            if (profiler) {
                profiler.recordTickTime(tickEndTime - tickStartTime);
            }
            
            // Emit game state update event (batched - only every N ticks)
            // Phase 4: Batch updates - update UI less frequently
            if (!this.uiUpdateCounter) {
                this.uiUpdateCounter = 0;
            }
            this.uiUpdateCounter++;
            
            // Update UI every 2 ticks (30fps instead of 60fps)
            const updateUI = this.uiUpdateCounter >= 2;
            
            if (updateUI) {
                this.uiUpdateCounter = 0;
                const gameState = this.engine.getState();
                if (gameState) {
                    // Record memory usage
                    if (profiler) {
                        profiler.recordMemoryUsage(gameState);
                    }
                    this.updateGameState(gameState);
                } else {
                    console.warn('GameEngineClient.tick(): getState() returned null/undefined');
                }
            }
        } catch (error) {
            console.error('Error in game tick:', error);
            console.error('Error stack:', error.stack);
            // Don't stop the game, but log the error
        }
    }

    updateGameState(newState) {
        // Emit event for UI updates
        window.dispatchEvent(new CustomEvent('gameStateUpdate', { detail: newState }));
    }

    async performAction(actionType, actionData) {
        if (!this.engine) {
            throw new Error('No active game engine');
        }

        try {
            const result = this.engine.performAction(actionType, actionData);
            // Update UI with new state
            this.updateGameState(this.engine.getState());
            return Promise.resolve({ success: true, game_state: this.engine.getState(), result: result });
        } catch (error) {
            console.error('Action failed:', error);
            return Promise.reject(error);
        }
    }

    purchaseStructure(buildingId, zoneId = 'earth') {
        return this.performAction('purchase_structure', {
            building_id: buildingId,
            zone_id: zoneId
        });
    }

    purchaseProbe(probeType = 'probe') {
        return this.performAction('purchase_probe', {
            probe_type: probeType
        });
    }

    allocateProbes(allocations) {
        return this.performAction('allocate_probes', {
            allocations: allocations
        });
    }

    allocateResearch(treeId, tierId, intelligence) {
        return this.performAction('allocate_research', {
            tree_id: treeId,
            tier_id: tierId,
            intelligence: intelligence
        });
    }

    recycleFactory(factoryId, zoneId) {
        return this.performAction('recycle_factory', {
            factory_id: factoryId,
            zone_id: zoneId
        });
    }

    getGameState() {
        return this.engine ? this.engine.getState() : null;
    }

    isComplete() {
        return this.engine && this.engine.dysonSphereMass >= this.engine.getDysonTargetMass();
    }
    
    setTimeSpeed(speed) {
        this.timeSpeed = Math.max(0.1, Math.min(1000, speed)); // Limit between 0.1x and 1000x
    }
}

// Export singleton instance - runs entirely locally in JavaScript
// All time calculations, ticks, and game logic happen client-side
const gameEngine = new GameEngineClient();

// Expose globally for access from other scripts
if (typeof window !== 'undefined') {
    window.gameEngine = gameEngine;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameEngine, GameEngineClient };
}


