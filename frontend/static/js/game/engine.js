/** Core game engine for simulation - JavaScript port */
class GameEngine {
    constructor(sessionId, config = {}) {
        this.sessionId = sessionId;
        this.config = config;
        this.dataLoader = gameDataLoader;
        
        // Game state
        this.tickCount = 0;
        this.time = 0.0; // seconds
        
        // Resources
        this.energy = config.initial_energy !== undefined ? config.initial_energy : Config.INITIAL_ENERGY;
        this.metal = config.initial_metal !== undefined ? config.initial_metal : Config.INITIAL_METAL;
        this.intelligence = 0.0;
        this.dexterity = 0.0; // Will be calculated after probes are initialized
        this.slag = 0.0;
        
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
        const initialProbes = config.initial_probes !== undefined ? config.initial_probes : Config.INITIAL_PROBES;
        this.probes = {
            'probe': initialProbes  // Single probe type only
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
        this.dysonPowerAllocation = 0; // Default: 0% compute, 100% economy
        
        // Harvest zone selection (which zone to harvest from)
        this.harvestZone = 'earth'; // Default to Earth
        
        // Structures by zone: {zoneId: {building_id: count}}
        this.structuresByZone = {};
        
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
        this.dysonSphereTargetMass = config.dyson_sphere_target_mass !== undefined ? 
            config.dyson_sphere_target_mass : Config.DYSON_SPHERE_TARGET_MASS;
        
        // Probe construction progress tracking: {probe_type: progress_in_kg}
        this.probeConstructionProgress = {};
        for (const probeType of Object.keys(this.probes)) {
            this.probeConstructionProgress[probeType] = 0.0;
        }
        
        // Structure construction progress tracking: {building_id: progress_in_kg}
        this.structureConstructionProgress = {};
        
        // Enabled construction: set of building_ids that are enabled for continuous construction
        this.enabledConstruction = new Set();
        
        // Active transfers: [{id, from, to, rate, energy_cost_per_second, paused}]
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
                this.zonePolicies[zoneId] = {construct_slider: 50}; // Default: 50% construct, 50% replicate
            } else {
                if (zoneId === 'earth') {
                    // Earth default: 100% build (0% mine), 100% replicate (0% construct)
                    this.zonePolicies[zoneId] = {
                        mining_slider: 0,  // 0 = all build, 100 = all mine
                        replication_slider: 100,  // 0 = all construct, 100 = all replicate
                        construction_slider: 0
                    };
                } else {
                    this.zonePolicies[zoneId] = {
                        mining_slider: 50,
                        replication_slider: 50,
                        construction_slider: 50
                    };
                }
            }
            
            // Initialize minimum probe threshold
            this.zoneMinProbes[zoneId] = 0;
            
            // Initialize probes by zone - single probe type only
            if (!(zoneId in this.probesByZone)) {
                this.probesByZone[zoneId] = {
                    'probe': 0
                };
            }
            
            // Earth starts with 1 probe
            if (zoneId === 'earth') {
                const initialProbes = this.config.initial_probes !== undefined ? this.config.initial_probes : Config.INITIAL_PROBES;
                this.probesByZone[zoneId] = {
                    'probe': initialProbes
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
            
            // Earth starts with 1 solar array and 1 mining station
            if (zoneId === 'earth') {
                if (!this.structuresByZone[zoneId]) {
                    this.structuresByZone[zoneId] = {};
                }
                this.structuresByZone[zoneId]['solar_array_basic'] = 1;
                this.structuresByZone[zoneId]['basic_mining_station'] = 1;
                // Also add to legacy global structures
                this.structures['solar_array_basic'] = 1;
                this.structures['basic_mining_station'] = 1;
            }
        }
        
        // Place initial probes in default zone (Earth)
        const initialProbes = this.config.initial_probes !== undefined ? this.config.initial_probes : Config.INITIAL_PROBES;
        if (initialProbes > 0 && this.defaultZone in this.probesByZone) {
            this.probesByZone[this.defaultZone]['probe'] = initialProbes;
        }
        
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
            engine.intelligence = state.intelligence || 0.0;
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
                        'enabled': false
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
                                'enabled': false
                            };
                        }
                    }
                }
            }
        }
    }
    
    getState() {
        // Calculate current rates for display
        const energyProductionRate = this._calculateEnergyProduction() + Config.CONSTANT_ENERGY_SUPPLY;
        const energyConsumptionRate = this._calculateEnergyConsumption();
        const [metalProductionRate] = this._calculateMetalProduction(); // Returns [metalRate, zoneMetalDepletion, slagRate, zoneSlagDepletion]
        const intelligenceProductionRate = this._calculateIntelligenceProduction();
        const [probeProductionRates, , factoryMetalCostPerProbe] = this._calculateProbeProduction();
        const probeProductionRate = Object.values(probeProductionRates).reduce((a, b) => a + b, 0);
        const dysonConstructionRate = this._calculateDysonConstructionRate();
        
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
                structureMetalConsumption = structureBuildingProbes * Config.PROBE_BUILD_RATE;
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
            'intelligence': this.intelligence,
            'dexterity': this.dexterity,
            'slag': this.slag,
            'probes': this.probes, // Legacy: global probe counts
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
            'dyson_sphere_target_mass': this.dysonSphereTargetMass,
            'dyson_sphere_progress': this.dysonSphereTargetMass > 0 ? 
                this.dysonSphereMass / this.dysonSphereTargetMass : 0,
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
        this.tickCount += 1;
        this.time += deltaTime;
        
        // Calculate base production and consumption rates (before energy throttling)
        const energyProduction = this._calculateEnergyProduction();
        const [baseMetalRate, zoneMetalDepletion, baseSlagRate, zoneSlagDepletion] = this._calculateMetalProduction();
        const [baseProbeRate, idleProbesBuild, factoryMetalCostPerProbe] = this._calculateProbeProduction();
        const theoreticalIntelligenceRate = this._calculateIntelligenceProduction();
        const baseDysonConstructionRate = this._calculateDysonConstructionRate();
        
        // Calculate energy consumption for non-compute activities
        const nonComputeEnergyConsumption = this._calculateNonComputeEnergyConsumption();
        
        // Calculate compute demand (what research projects want)
        const computeDemandFlops = this._calculateComputeDemand();
        
        // Energy system: constant supply + production - consumption
        const constantSupply = Config.CONSTANT_ENERGY_SUPPLY;
        const totalEnergyAvailable = constantSupply + energyProduction;
        
        // Calculate effective intelligence production based on available energy
        const availableEnergyForCompute = Math.max(0, totalEnergyAvailable - nonComputeEnergyConsumption);
        
        // Calculate effective compute (limited by energy)
        const intelligenceRate = this._calculateEffectiveIntelligenceProduction(availableEnergyForCompute);
        
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
        const netEnergyAvailable = totalEnergyAvailable - energyConsumption;
        
        // Calculate energy throttle factor if there's a shortfall
        let energyThrottle = 1.0;
        if (netEnergyAvailable < 0) {
            // Energy shortfall - throttle all activities proportionally
            if (energyConsumption > 0) {
                energyThrottle = Math.max(0.0, totalEnergyAvailable / energyConsumption);
            } else {
                energyThrottle = 0.0;
            }
        }
        
        // Store net available energy for display (but it's not accumulated)
        this.energy = Math.max(0, netEnergyAvailable);
        
        // Update research progress with effective intelligence rate (limited by energy)
        this._updateResearch(deltaTime, intelligenceRate);
        
        // Apply energy throttling to all activities first
        const metalRate = baseMetalRate * energyThrottle;
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
                const structureConstructionRateKgS = structureBuildingProbes * Config.PROBE_BUILD_RATE;
                const structureConstructionRateKgSThrottled = structureConstructionRateKgS * energyThrottle;
                structureMetalConsumptionRate = structureConstructionRateKgSThrottled;
            }
        }
        
        // Calculate net metal rate (production - consumption)
        const totalMetalConsumptionRate = probeMetalConsumptionRate + dysonMetalConsumptionRate + structureMetalConsumptionRate;
        const netMetalRate = metalRate - totalMetalConsumptionRate;
        
        // Calculate metal throttle factor if there's a shortfall
        let metalThrottle = 1.0;
        let isMetalLimited = false;
        if (this.metal <= 0 && netMetalRate < 0) {
            // Metal shortfall: no stored metal and consumption > production
            if (totalMetalConsumptionRate > 0) {
                metalThrottle = Math.max(0.0, metalRate / totalMetalConsumptionRate);
                isMetalLimited = true;
            } else {
                metalThrottle = 0.0;
                isMetalLimited = true;
            }
        }
        
        // Apply metal throttling to production activities
        const probeRate = {};
        for (const [pt, rate] of Object.entries(probeRateAfterEnergy)) {
            probeRate[pt] = rate * metalThrottle;
        }
        const dysonConstructionRate = dysonConstructionRateAfterEnergy * metalThrottle;
        
        // Update metal stockpile: add production only
        this.metal += metalRate * energyThrottle * deltaTime;
        this.metal = Math.max(0, this.metal);
        
        // Store throttling info for UI
        this.isEnergyLimited = (energyThrottle < 1.0);
        this.isMetalLimited = isMetalLimited;
        
        // Apply zone metal and slag depletion (throttled by energy)
        for (const [zoneId, metalDepletionAmount] of Object.entries(zoneMetalDepletion)) {
            if (zoneId in this.zoneMetalRemaining) {
                this.zoneMetalRemaining[zoneId] -= metalDepletionAmount * energyThrottle * deltaTime;
                this.zoneMetalRemaining[zoneId] = Math.max(0, this.zoneMetalRemaining[zoneId]);
            }
        }
        // Update zone mass remaining and produce slag from mining
        for (const [zoneId, metalDepletionAmount] of Object.entries(zoneMetalDepletion)) {
            if (zoneId in this.zoneMetalRemaining && zoneId in this.zoneMassRemaining) {
                const actualDepletion = metalDepletionAmount * energyThrottle * deltaTime;
                // Reduce metal remaining
                this.zoneMetalRemaining[zoneId] -= actualDepletion;
                this.zoneMetalRemaining[zoneId] = Math.max(0, this.zoneMetalRemaining[zoneId]);
                
                // Reduce total mass remaining (metal + non-metal)
                this.zoneMassRemaining[zoneId] -= actualDepletion;
                this.zoneMassRemaining[zoneId] = Math.max(0, this.zoneMassRemaining[zoneId]);
                
                // Produce slag proportional to mass mined (non-metal portion)
                const zone = zones.find(z => z.id === zoneId);
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
        const constructAllocation = this.probeAllocations.construct || {};
        const constructingProbes = Object.values(constructAllocation).reduce((a, b) => a + b, 0);
        const probeBuildingFraction = this.buildAllocation / 100.0;
        const probeBuildingProbes = constructingProbes * probeBuildingFraction;
        
        // Base build rate: 0.1 kg/s per probe
        const baseProbeBuildRateKgS = probeBuildingProbes * Config.PROBE_BUILD_RATE;
        
        // Apply energy throttling
        let probeBuildRateKgS = baseProbeBuildRateKgS * energyThrottle;
        
        // Apply metal throttling
        probeBuildRateKgS = probeBuildRateKgS * metalThrottle;
        
        // Distribute building across probe types based on factory production and manual building
        let totalFactoryMetalNeeded = 0.0;
        for (const [probeType, rate] of Object.entries(probeRate)) {
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
                totalFactoryMetalNeeded += rate * metalCostPerProbe;
            }
        }
        
        // Manual probe building (probes building other probes)
        const manualProbeBuildRateKgS = Math.max(0, probeBuildRateKgS - totalFactoryMetalNeeded);
        
        // Update probe construction for factory production
        for (const [probeType, rate] of Object.entries(probeRate)) {
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
                
                // Calculate construction progress in kg/s (rate is in probes/s)
                const constructionRateKgS = rate * metalCostPerProbe;
                
                // Add progress this tick (throttled by energy and metal)
                let progressThisTick = constructionRateKgS * deltaTime;
                
                // Check if we have enough metal for this progress
                if (this.metal < progressThisTick) {
                    progressThisTick = this.metal;
                }
                
                // Add to construction progress
                if (!(probeType in this.probeConstructionProgress)) {
                    this.probeConstructionProgress[probeType] = 0.0;
                }
                
                this.probeConstructionProgress[probeType] += progressThisTick;
                this.metal -= progressThisTick;
                this.metal = Math.max(0, this.metal);
                
                // Check if we've completed a probe
                let probesBuiltThisTick = 0;
                while (this.probeConstructionProgress[probeType] >= metalCostPerProbe) {
                    // Add probe to global count (legacy)
                    this.probes[probeType] = (this.probes[probeType] || 0) + 1;
                    
                    // Add probe to default zone - single probe type only
                    if (!(this.defaultZone in this.probesByZone)) {
                        this.probesByZone[this.defaultZone] = {
                            'probe': 0
                        };
                    }
                    // Only add 'probe' type (ignore any specialized types)
                    if (probeType === 'probe') {
                        this.probesByZone[this.defaultZone]['probe'] = (this.probesByZone[this.defaultZone]['probe'] || 0) + 1;
                    }
                    
                    this.probeConstructionProgress[probeType] -= metalCostPerProbe;
                    probesBuiltThisTick += 1;
                }
                
                if (probesBuiltThisTick > 0) {
                    this._autoAllocateProbes();
                }
            }
        }
        
        // Manual probe building (probes building other probes)
        if (manualProbeBuildRateKgS > 0) {
            // Default to building 'probe' type
            const probeType = 'probe';
            const probeData = this._getProbeData(probeType);
            let metalCostPerProbe = Config.PROBE_MASS;
            if (probeData) {
                metalCostPerProbe = probeData.base_cost_metal || Config.PROBE_MASS;
            }
            
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
            
            // Check if we've completed a probe
            let probesBuiltThisTick = 0;
            while (this.probeConstructionProgress[probeType] >= metalCostPerProbe) {
                this.probes[probeType] = (this.probes[probeType] || 0) + 1;
                this.probeConstructionProgress[probeType] -= metalCostPerProbe;
                probesBuiltThisTick += 1;
            }
            
            if (probesBuiltThisTick > 0) {
                this._autoAllocateProbes();
            }
        }
        
        // Structure building (probes building structures using 0.1 kg/s per probe)
        const structureBuildingFraction = 1.0 - (this.buildAllocation / 100.0);
        const structureBuildingProbes = constructingProbes * structureBuildingFraction;
        
        if (structureBuildingProbes > 0 && this.enabledConstruction.size > 0) {
            // Base build rate: 0.1 kg/s per probe
            const baseStructureBuildRateKgS = structureBuildingProbes * Config.PROBE_BUILD_RATE;
            const structureBuildRateKgS = baseStructureBuildRateKgS * energyThrottle * metalThrottle;
            
            // Get enabled buildings that are in progress or need to be started
            // enabledConstruction keys are in format: "zoneId_buildingId"
            const enabledBuildings = [];
            for (const enabledKey of this.enabledConstruction) {
                const [zoneId, buildingId] = enabledKey.split('_', 2);
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
                // Divide production pool equally across all enabled buildings
                const numEnabled = enabledBuildings.length;
                const buildRatePerBuilding = structureBuildRateKgS / numEnabled;
                
                // Build all enabled buildings simultaneously
                for (const buildingInfo of enabledBuildings) {
                    const enabledKey = buildingInfo.enabled_key;
                    const zoneId = buildingInfo.zone_id;
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
                                if (!(zoneId in this.structuresByZone)) {
                                    this.structuresByZone[zoneId] = {};
                                }
                                if (!(buildingId in this.structuresByZone[zoneId])) {
                                    this.structuresByZone[zoneId][buildingId] = 0;
                                }
                                this.structuresByZone[zoneId][buildingId] += 1;
                                
                                // Legacy: also update global structure count
                                if (!(buildingId in this.structures)) {
                                    this.structures[buildingId] = 0;
                                }
                                this.structures[buildingId] += 1;
                                
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
            
            // Clean up invalid structures from progress
            const structuresToRemove = [];
            for (const enabledKey of Object.keys(this.structureConstructionProgress)) {
                const [zoneId, buildingId] = enabledKey.split('_', 2);
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
        
        this.intelligence += intelligenceRate * deltaTime;
        
        // Recalculate dexterity
        this.dexterity = this._calculateDexterity();
        
        // Update Dyson sphere construction (with energy throttling and metal checks)
        this._updateDysonSphereConstruction(deltaTime, dysonConstructionRate);
        
        // Process continuous transfers
        this._processTransfers(deltaTime);
        
        // Check zone depletion
        this._checkZoneDepletion();
        
        // Recycle slag
        this._recycleSlag(deltaTime);
    }
    
    _processTransfers(deltaTime) {
        if (!this.activeTransfers || this.activeTransfers.length === 0) return;
        
        // Process each active transfer
        for (let i = this.activeTransfers.length - 1; i >= 0; i--) {
            const transfer = this.activeTransfers[i];
            
            // Skip if paused
            if (transfer.paused) {
                continue;
            }
            
            // Calculate probes to transfer this tick
            const probesToTransfer = transfer.rate * deltaTime;
            
            // Get available probes in source zone
            const sourceProbes = this.probesByZone[transfer.from] || {};
            const availableProbes = sourceProbes.probe || 0;
            
            if (availableProbes <= 0) {
                // No probes available, remove transfer
                this.activeTransfers.splice(i, 1);
                continue;
            }
            
            // Limit transfer to available probes
            const actualTransfer = Math.min(probesToTransfer, availableProbes);
            
            // Calculate energy cost for this transfer
            const energyCost = transfer.energy_cost_per_second * deltaTime;
            
            // Check if we have enough energy
            if (this.energy < energyCost) {
                // Not enough energy, skip this tick
                continue;
            }
            
            // Transfer probes
            if (!(transfer.from in this.probesByZone)) {
                this.probesByZone[transfer.from] = {};
            }
            this.probesByZone[transfer.from].probe = Math.max(0, (this.probesByZone[transfer.from].probe || 0) - actualTransfer);
            
            if (!(transfer.to in this.probesByZone)) {
                this.probesByZone[transfer.to] = {
                    'probe': 0
                };
            }
            this.probesByZone[transfer.to].probe = (this.probesByZone[transfer.to].probe || 0) + actualTransfer;
            
            // Consume energy
            this.energy -= energyCost;
            this.energy = Math.max(0, this.energy);
        }
    }
    
    _calculateEnergyProduction() {
        let rate = 0.0;
        
        // All energy comes from Dyson sphere (energy probes removed)
        
        // Dyson sphere power allocation
        const dysonPowerAllocation = this.dysonPowerAllocation || 0; // 0 = all economy, 100 = all compute
        const economyFraction = (100 - dysonPowerAllocation) / 100.0; // Fraction going to economy/energy
        
        if (this.dysonSphereMass >= this.dysonSphereTargetMass) {
            // Complete Dyson sphere: all star's power
            // Sun's total power output: ~3.8e26 W
            const sunTotalPower = 3.8e26; // watts
            // Allocate based on slider
            rate += sunTotalPower * economyFraction;
        } else {
            // During construction: 5 kW per kg at 0.5 AU
            const dysonPower = this.dysonSphereMass * 5000; // 5000W = 5 kW per kg
            // Allocate based on slider
            rate += dysonPower * economyFraction;
        }
        
        // Energy structures (solar arrays, reactors, etc.)
        for (const [buildingId, count] of Object.entries(this.structures)) {
            const building = this.dataLoader.getBuildingById(buildingId);
            if (building) {
                const category = this._getBuildingCategory(buildingId);
                if (category === 'energy') {
                    const effects = building.effects || {};
                    let energyOutput = effects.energy_production_per_second || 0;
                    const baseEnergy = effects.base_energy_at_earth !== undefined ? effects.base_energy_at_earth : energyOutput;
                    
                    // Apply orbital efficiency (for now use default zone, will be zone-specific)
                    const zones = this.dataLoader.orbitalZones || [];
                    const defaultZone = 'earth';
                    let orbitalEfficiency = 1.0;
                    if (building.orbital_efficiency) {
                        orbitalEfficiency = building.orbital_efficiency[defaultZone] || 1.0;
                    }
                    
                    if (baseEnergy !== energyOutput) {
                        energyOutput = baseEnergy * orbitalEfficiency;
                    }
                    
                    rate += energyOutput * count;
                }
            }
        }
        
        return rate;
    }
    _calculateEnergyConsumption() {
        const baseProbeConsumption = Config.PROBE_ENERGY_CONSUMPTION; // 100kW per probe
        
        // Get research bonuses first
        const computerReduction = this._getResearchBonus('computer_systems', 'probe_energy_cost_reduction', 0.0);
        const propulsionReduction = this._getResearchBonus('propulsion_systems', 'dexterity_energy_cost_reduction', 0.0);
        const productionEfficiencyBonus = this._getResearchBonus('production_efficiency', 'energy_efficiency_bonus', 1.0);
        
        let consumption = 0.0;
        
        // Probe energy consumption (in watts) - single probe type only
        const probeCount = this.probes.probe || 0;
        let probeBaseConsumption = probeCount * baseProbeConsumption;
        
        // Apply computer systems reduction to probe base consumption
        probeBaseConsumption *= (1.0 - computerReduction);
        consumption += probeBaseConsumption;
        
        // Structure energy consumption
        for (const [buildingId, count] of Object.entries(this.structures)) {
            const building = this.dataLoader.getBuildingById(buildingId);
            if (building) {
                const effects = building.effects || {};
                const energyCost = effects.energy_consumption_per_second || 0;
                consumption += energyCost * count;
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
        
        // Probe construction energy cost: 250kW per kg/s = 250000W per kg/s
        const [probeProdRates, , factoryMetalCostPerProbe] = this._calculateProbeProduction();
        const totalProbeProductionRate = Object.values(probeProdRates).reduce((a, b) => a + b, 0); // probes/s
        // Use factory metal cost if available, otherwise default
        const metalCostPerProbe = factoryMetalCostPerProbe > 0 ? factoryMetalCostPerProbe : Config.PROBE_MASS;
        const probeConstructionRateKgS = totalProbeProductionRate * metalCostPerProbe;
        const probeConstructionEnergyCost = probeConstructionRateKgS * 250000; // 250000W per kg/s
        consumption += probeConstructionEnergyCost;
        
        // Structure construction energy cost: 250kW per kg/s = 250000W per kg/s
        const constructAllocation = this.probeAllocations.construct || {};
        const constructingProbes = Object.values(constructAllocation).reduce((a, b) => a + b, 0);
        const structureConstructingPower = constructingProbes * (1.0 - this.buildAllocation / 100.0);
        const structureConstructionRateKgS = structureConstructingPower * Config.PROBE_BUILD_RATE; // 0.1 kg/s per probe
        const structureConstructionEnergyCost = structureConstructionRateKgS * 250000; // 250000W per kg/s
        consumption += structureConstructionEnergyCost;
        
        // Dyson construction energy cost: 250kW per kg/s = 250000W per kg/s
        const dysonConstructionRate = this._calculateDysonConstructionRate();
        const dysonConstructionEnergyCost = dysonConstructionRate * 250000; // 250000W per kg/s
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
        const baseProbeConsumption = Config.PROBE_ENERGY_CONSUMPTION; // 100kW per probe
        
        // Get research bonuses
        const computerReduction = this._getResearchBonus('computer_systems', 'probe_energy_cost_reduction', 0.0);
        const propulsionReduction = this._getResearchBonus('propulsion_systems', 'dexterity_energy_cost_reduction', 0.0);
        const productionEfficiencyBonus = this._getResearchBonus('production_efficiency', 'energy_efficiency_bonus', 1.0);
        
        let consumption = 0.0;
        
        // Probe energy consumption
        const probeConsumptionRates = {
            'probe': baseProbeConsumption,
            'miner_probe': baseProbeConsumption * 0.8,
            'compute_probe': baseProbeConsumption * 1.5,
            'energy_probe': -baseProbeConsumption * 0.2, // Negative = generates energy
            'construction_probe': baseProbeConsumption * 1.2
        };
        
        // Probe energy consumption - iterate through zones
        let probeBaseConsumption = 0.0;
        for (const [zoneId, probes] of Object.entries(this.probesByZone)) {
            for (const [probeType, count] of Object.entries(probes)) {
                if (probeType in probeConsumptionRates) {
                    probeBaseConsumption += count * probeConsumptionRates[probeType];
                }
            }
        }
        
        probeBaseConsumption *= (1.0 - computerReduction);
        consumption += probeBaseConsumption;
        
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
        
        // Harvesting energy cost - calculate per zone
        const zones = this.dataLoader.orbitalZones || [];
        for (const zone of zones) {
            const zoneId = zone.id;
            const zoneAllocations = this.probeAllocationsByZone[zoneId] || {};
            const harvestAllocation = zoneAllocations.harvest || {};
            const totalHarvestProbes = Object.values(harvestAllocation).reduce((a, b) => a + b, 0);
            
            if (totalHarvestProbes > 0) {
                const deltaVPenalty = zone.delta_v_penalty || 0.1;
                const miningEnergyCostMultiplier = zone.mining_energy_cost_multiplier || 1.0;
                const miningRateMultiplier = zone.mining_rate_multiplier || 1.0;
                
                const baseEnergyCost = 453515; // watts per kg/s at Earth baseline
                const energyCostPerKgS = baseEnergyCost * Math.pow(1.0 + deltaVPenalty, 2) * miningEnergyCostMultiplier;
                const harvestRatePerProbe = Config.PROBE_HARVEST_RATE * miningRateMultiplier;
                let harvestEnergyCost = energyCostPerKgS * harvestRatePerProbe * totalHarvestProbes;
                harvestEnergyCost *= (1.0 - propulsionReduction);
                consumption += harvestEnergyCost;
            }
        }
        
        // Probe construction energy cost
        const [probeProdRates, , factoryMetalCostPerProbe] = this._calculateProbeProduction();
        const totalProbeProductionRate = Object.values(probeProdRates).reduce((a, b) => a + b, 0);
        const metalCostPerProbe = factoryMetalCostPerProbe > 0 ? factoryMetalCostPerProbe : Config.PROBE_MASS;
        const probeConstructionRateKgS = totalProbeProductionRate * metalCostPerProbe;
        const probeConstructionEnergyCost = probeConstructionRateKgS * 250000;
        consumption += probeConstructionEnergyCost;
        
        // Dyson construction energy cost
        const dysonConstructionRate = this._calculateDysonConstructionRate();
        const dysonConstructionEnergyCost = dysonConstructionRate * 250000;
        consumption += dysonConstructionEnergyCost;
        
        // Apply production efficiency bonus
        if (productionEfficiencyBonus > 1.0) {
            consumption /= productionEfficiencyBonus;
        }
        
        return Math.max(0, consumption);
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
            const metalPercentage = zoneData.metal_percentage || 0.32; // Default to Earth-like
            const slagPercentage = 1.0 - metalPercentage;
            const miningRateMultiplier = zoneData.mining_rate_multiplier || 1.0;
            
            // Skip if zone is depleted or is Dyson zone (no mining)
            if (zoneData.is_dyson_zone || this.zoneDepleted[zoneId] || this.zoneMetalRemaining[zoneId] <= 0) {
                continue;
            }
            
            // Get probes allocated to harvest in this zone
            const zoneAllocations = this.probeAllocationsByZone[zoneId] || {};
            const harvestAllocation = zoneAllocations.harvest || {};
            
            // Calculate mining from probes in this zone
            for (const [probeType, count] of Object.entries(harvestAllocation)) {
                if (count > 0.001) { // Small threshold to handle floating point
                    const probeData = this._getProbeData(probeType);
                    let baseDexterity = 1.0;
                    let harvestMultiplier = 1.0;
                    
                    if (probeData) {
                        baseDexterity = probeData.base_dexterity || 1.0;
                        const effects = probeData.effects || {};
                        harvestMultiplier = effects.harvest_efficiency_multiplier || 1.0;
                    }
                    
                    // Base harvest rate per probe (kg/s total material)
                    const baseHarvestRate = Config.PROBE_HARVEST_RATE; // 1.0 kg/s per probe
                    
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
                        const metalOutput = effects.metal_production_per_second || 0;
                        
                        // Apply zone mining rate multiplier
                        const zoneMetalOutput = metalOutput * miningRateMultiplier;
                        
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
        
        // Factory production (automatic, independent of probe assignments)
        let totalFactoryRate = 0.0;
        let totalFactoryMetalCost = 0.0;
        
        for (const [buildingId, count] of Object.entries(this.structures)) {
            const building = this.dataLoader.getBuildingById(buildingId);
            if (building) {
                const category = this._getBuildingCategory(buildingId);
                if (category === 'factories') {
                    const effects = building.effects || {};
                    const probesPerSecond = effects.probes_per_second || 0.0;
                    const metalPerProbe = effects.metal_per_probe || 10.0;
                    
                    // Each factory produces at its rate
                    const factoryRate = probesPerSecond * count;
                    const factoryMetalNeeded = factoryRate * metalPerProbe;
                    
                    totalFactoryRate += factoryRate;
                    totalFactoryMetalCost += factoryMetalNeeded;
                }
            }
        }
        
        // Calculate weighted average metal cost per probe
        let factoryMetalCostPerProbe = 10.0; // Default if no factories
        if (totalFactoryRate > 0) {
            factoryMetalCostPerProbe = totalFactoryMetalCost / totalFactoryRate;
        }
        
        // Manual probe building (probes building other probes)
        const constructAllocation = this.probeAllocations.construct || {};
        const constructingProbes = Object.values(constructAllocation).reduce((a, b) => a + b, 0);
        const probeBuildingFraction = this.buildAllocation / 100.0; // Fraction of construct probes building probes
        const probeBuildingProbes = constructingProbes * probeBuildingFraction;
        
        // Manual build rate: 0.1 kg/s per probe, converted to probes/s
        const baseManualBuildRateKgS = probeBuildingProbes * Config.PROBE_BUILD_RATE; // 0.1 kg/s per probe
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
        
        // Calculate structure construction power for idle tracking
        const structureConstructingPower = constructingProbes * (1.0 - this.buildAllocation / 100.0);
        
        // Track idle structure-building probes if applicable
        if (structureConstructingPower > 0 && this.metal <= 0 && metalProductionRate <= 0) {
            idleProbes.structures = structureConstructingPower;
        }
        
        return [rates, idleProbes, factoryMetalCostPerProbe];
    }
    _calculateIntelligenceProduction() {
        // Dyson power allocation: 0 = all economy, 100 = all compute
        const dysonPowerAllocation = this.dysonPowerAllocation || 0;
        const computeFraction = dysonPowerAllocation / 100.0; // Fraction going to compute
        
        if (this.dysonSphereMass >= this.dysonSphereTargetMass) {
            // Complete Dyson sphere: all star's power
            const sunTotalPower = 3.8e26; // watts
            // Allocate based on slider and convert to compute: 1 W = 1e9 FLOPS/s
            const computePower = sunTotalPower * computeFraction;
            return computePower * 1e9; // FLOPS/s
        } else {
            // While building: convert Dyson sphere power generation to compute
            const dysonPower = this.dysonSphereMass * 5000; // 5000W = 5 kW per kg
            const computePower = dysonPower * computeFraction;
            // Conversion: 1 W = 1e9 FLOPS/s
            return computePower * 1e9; // FLOPS/s
        }
    }
    
    _calculateEffectiveIntelligenceProduction(availableEnergyForCompute) {
        // Theoretical maximum compute from Dyson sphere (already accounts for slider allocation)
        const theoreticalMax = this._calculateIntelligenceProduction();
        
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
        
        // Calculate compute available from energy
        const computeFromEnergy = availableEnergyForCompute / powerPerFlops;
        
        // Effective production is minimum of theoretical max (from slider) and energy-limited
        return Math.min(theoreticalMax, computeFromEnergy);
    }
    _calculateDexterity() {
        let total = 0.0;
        
        // Calculate dexterity from probes in all zones - single probe type only
        for (const [zoneId, probes] of Object.entries(this.probesByZone)) {
            const probeCount = probes.probe || 0;
            if (probeCount > 0) {
                const probeData = this._getProbeData('probe');
                const baseDexterity = probeData ? (probeData.base_dexterity || 1.0) : 1.0;
                total += probeCount * baseDexterity;
            }
        }
        
        // Research bonuses
        const researchBonus = this._getResearchBonus('robotic_systems', 'dexterity_multiplier', 1.0);
        total *= researchBonus;
        
        return total;
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
        
        // Allocate intelligence equally across enabled projects
        if (enabledProjects.length === 0) {
            return;
        }
        
        const intelligencePerProject = totalIntelligenceFlops / enabledProjects.length;
        
        // Process each enabled project
        for (const [treeId, tierId, tier, tierData] of enabledProjects) {
            let tranchesCompleted = tierData.tranches_completed || 0;
            const maxTranches = tier.tranches || 10;
            
            if (tranchesCompleted >= maxTranches) {
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
            
            // Exponential cost: first tier = 10 PFLOPS, each tier is 2x more expensive
            const baseCostPflops = 10.0; // 10 PFLOPS for first tier
            const tierCostPflops = baseCostPflops * Math.pow(2.0, tierIndex);
            const tierCostFlops = tierCostPflops * 1e15; // Convert to FLOPS
            
            // Progress: FLOPS allocated * time / total cost = fraction complete
            const progressFlops = intelligencePerProject * deltaTime;
            const progressFraction = progressFlops / tierCostFlops;
            
            // Convert to tranches (each tranche is 1/max_tranches of total progress)
            const trancheProgress = progressFraction * maxTranches;
            const newTranches = Math.floor(trancheProgress);
            
            if (newTranches > 0) {
                tierData.tranches_completed = Math.min(
                    tranchesCompleted + newTranches,
                    maxTranches
                );
            }
        }
    }
    _calculateDysonConstructionRate() {
        if (this.dysonSphereMass >= this.dysonSphereTargetMass) {
            return 0.0; // Already complete
        }
        
        // Get probes allocated to Dyson construction
        const dysonAllocation = this.probeAllocations.dyson || {};
        const totalDysonProbes = Object.values(dysonAllocation).reduce((a, b) => a + b, 0);
        
        if (totalDysonProbes <= 0) {
            return 0.0;
        }
        
        // Calculate construction rate
        // Base rate: 0.1 kg/s per probe
        const baseConstructionRate = totalDysonProbes * Config.PROBE_BUILD_RATE; // 0.1 kg/s per probe
        
        // Apply research bonuses
        const researchBonus = this._getResearchBonus('dyson_swarm_construction', 'dyson_construction_rate_multiplier', 1.0);
        let constructionRate = baseConstructionRate * researchBonus;
        
        // Apply zone bonuses (use average for now)
        const zoneBonus = 1.0; // Could calculate based on probe locations
        constructionRate *= zoneBonus;
        
        return constructionRate;
    }
    _updateDysonSphereConstruction(deltaTime, throttledConstructionRate) {
        const idleProbes = {'dyson': 0.0};
        
        if (this.dysonSphereMass >= this.dysonSphereTargetMass) {
            return idleProbes; // Already complete
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
        massToAdd = Math.min(massToAdd, this.dysonSphereTargetMass - this.dysonSphereMass);
        
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
        for (const [zoneId, metalRemaining] of Object.entries(this.zoneMetalRemaining)) {
            const slagRemaining = this.zoneSlagRemaining[zoneId] || 0;
            // Zone is depleted if both metal and slag are exhausted
            if (metalRemaining <= 0 && slagRemaining <= 0 && !this.zoneDepleted[zoneId]) {
                this.zoneDepleted[zoneId] = true;
            } else if ((metalRemaining > 0 || slagRemaining > 0) && this.zoneDepleted[zoneId]) {
                // Zone is no longer depleted if resources are available
                this.zoneDepleted[zoneId] = false;
            }
        }
    }
    _recycleSlag(deltaTime) {
        if (this.slag <= 0) {
            return;
        }
        
        const recyclingEfficiency = this._getRecyclingEfficiency();
        const recycleRate = this.slag * recyclingEfficiency * 0.1; // 10% per second
        
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
        
        // Consumption: Probe base consumption
        const baseProbeConsumption = Config.PROBE_ENERGY_CONSUMPTION;
        const probeConsumption = {
            'probe': baseProbeConsumption,
            'miner_probe': baseProbeConsumption * 0.8,
            'compute_probe': baseProbeConsumption * 1.5,
            'energy_probe': -baseProbeConsumption * 0.2, // Negative = generates
            'construction_probe': baseProbeConsumption * 1.2
        };
        
        let probeBaseConsumption = 0;
        for (const [probeType, count] of Object.entries(this.probes)) {
            if (probeType in probeConsumption) {
                probeBaseConsumption += count * probeConsumption[probeType];
            }
        }
        
        breakdown.consumption.base = probeBaseConsumption;
        breakdown.consumption.breakdown.probes = probeBaseConsumption;
        
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
                const baseEnergyCost = 453515; // watts per kg/s at Earth baseline
                const energyCostPerKgS = baseEnergyCost * Math.pow(1.0 + deltaVPenalty, 2);
                const harvestRatePerProbe = Config.PROBE_HARVEST_RATE;
                harvestEnergyCost = energyCostPerKgS * harvestRatePerProbe * totalHarvestProbes;
                breakdown.consumption.base += harvestEnergyCost;
            }
        }
        breakdown.consumption.breakdown.harvesting = harvestEnergyCost;
        
        // Consumption: Probe construction energy cost
        const [probeProdRates, , factoryMetalCostPerProbe] = this._calculateProbeProduction();
        const totalProbeProductionRate = Object.values(probeProdRates).reduce((a, b) => a + b, 0);
        const metalCostPerProbe = factoryMetalCostPerProbe > 0 ? factoryMetalCostPerProbe : Config.PROBE_MASS;
        const probeConstructionRateKgS = totalProbeProductionRate * metalCostPerProbe;
        const probeConstructionEnergyCost = probeConstructionRateKgS * 250000;
        breakdown.consumption.base += probeConstructionEnergyCost;
        breakdown.consumption.breakdown.probe_construction = probeConstructionEnergyCost;
        
        // Consumption: Dyson construction energy cost
        const dysonConstructionRate = this._calculateDysonConstructionRate();
        const dysonConstructionEnergyCost = dysonConstructionRate * 250000;
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
            'probes': {'base': 0, 'total': 0, 'upgrades': []},
            'factories': {'total': 0}
        };
        
        // Base dexterity from probes - single probe type only
        const probeCount = this.probes.probe || 0;
        const probeData = this._getProbeData('probe');
        const baseDex = probeData ? (probeData.base_dexterity || 1.0) : 1.0;
        const baseDexterity = probeCount * baseDex;
        
        breakdown.probes.base = baseDexterity;
        
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
            'structures': {'base': 0, 'total': 0},
            'total': 0
        };
        
        // FLOPS now come from Dyson sphere only
        const baseIntelligenceFlops = this.dysonSphereMass * 1e15; // 1 PFLOPS/s per kg
        breakdown.probes.base = baseIntelligenceFlops;
        breakdown.probes.total = baseIntelligenceFlops;
        
        // Research structures - in FLOPS
        let structureIntelligenceFlops = 0;
        for (const [buildingId, count] of Object.entries(this.structures)) {
            const building = this.dataLoader.getBuildingById(buildingId);
            if (building) {
                const effects = building.effects || {};
                const intelligenceOutputFlops = effects.intelligence_flops || 0;
                if (intelligenceOutputFlops > 0) {
                    structureIntelligenceFlops += intelligenceOutputFlops * count;
                } else {
                    // Legacy: convert from intelligence_per_second
                    const intelligenceOutput = effects.intelligence_production_per_second || effects.intelligence_per_second || 0;
                    structureIntelligenceFlops += intelligenceOutput * 1e12 * count;
                }
            }
        }
        
        breakdown.structures.base = structureIntelligenceFlops;
        breakdown.structures.total = structureIntelligenceFlops;
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
                const probeData = this._getProbeData(probeType);
                const metalCost = probeData ? (probeData.base_cost_metal || Config.PROBE_MASS) : Config.PROBE_MASS;
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
    _getProbeData(probeType) {
        const probes = this.dataLoader.getProbes();
        for (const probe of probes) {
            if (probe.id === probeType) {
                return probe;
            }
        }
        return null;
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
        const enabledKey = `${zoneId}_${buildingId}`;
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
        
        const probeData = this._getProbeData(probeType);
        if (!probeData) {
            throw new Error(`Probe type not found: ${probeType}`);
        }
        
        // Check prerequisites - check in the zone where probe will be built
        const prerequisites = probeData.prerequisites || [];
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
        const costMetal = probeData.base_cost_metal || 0;
        const costEnergy = probeData.base_cost_energy || 0;
        
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
    
    _autoAllocateProbes() {
        // Get total available 'probe' type probes across all zones
        let totalProbes = 0;
        for (const [zoneId, probes] of Object.entries(this.probesByZone)) {
            totalProbes += probes.probe || 0;
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
            const zoneProbeCount = probes.probe || 0;
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
                // Dyson zone: construct vs replicate
                const constructSlider = (policy.construct_slider || 50) / 100.0;
                if (!this.probeAllocationsByZone[zoneId].construct) this.probeAllocationsByZone[zoneId].construct = {probe: 0};
                if (!this.probeAllocationsByZone[zoneId].replicate) this.probeAllocationsByZone[zoneId].replicate = {probe: 0};
                this.probeAllocationsByZone[zoneId].construct.probe = zoneProbeCount * constructSlider;
                this.probeAllocationsByZone[zoneId].replicate.probe = zoneProbeCount * (1.0 - constructSlider);
                if (this.probeAllocationsByZone[zoneId].harvest) this.probeAllocationsByZone[zoneId].harvest.probe = 0;
            } else {
                // Regular zones: use zone policies (mining_slider and replication_slider)
                const miningSlider = (policy.mining_slider || 50) / 100.0;
                const replicationSlider = (policy.replication_slider || 50) / 100.0;
                
                const miningCount = zoneProbeCount * miningSlider;
                const buildCount = zoneProbeCount * (1.0 - miningSlider);
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
            
            // Calculate energy cost
            const fromZoneData = zones.find(z => z.id === fromZone);
            const toZoneData = zones.find(z => z.id === toZone);
            const energyCost = this._calculateTransferEnergyCost(fromZoneData, toZoneData, count);
            
            // Check energy availability
            if (this.energy < energyCost) {
                throw new Error(`Insufficient energy: need ${(energyCost/1000).toFixed(1)} kW, have ${(this.energy/1000).toFixed(1)} kW`);
            }
            
            // Transfer probes (move from source to destination)
            // For now, transfer 'probe' type only
            const probesToTransfer = Math.min(count, sourceProbes.probe || 0);
            if (probesToTransfer > 0) {
                // Remove from source
                if (!(fromZone in this.probesByZone)) {
                    this.probesByZone[fromZone] = {};
                }
                this.probesByZone[fromZone].probe = Math.max(0, (this.probesByZone[fromZone].probe || 0) - probesToTransfer);
                
                // Add to destination
                if (!(toZone in this.probesByZone)) {
                    this.probesByZone[toZone] = {
                        'probe': 0,
                        'miner_probe': 0,
                        'compute_probe': 0,
                        'energy_probe': 0,
                        'construction_probe': 0
                    };
                }
                this.probesByZone[toZone].probe = (this.probesByZone[toZone].probe || 0) + probesToTransfer;
                
                // Update legacy probe counts
                this.probes.probe = (this.probes.probe || 0) - probesToTransfer + probesToTransfer; // Net zero change globally
            }
            
            // Consume energy
            this.energy -= energyCost;
            this.energy = Math.max(0, this.energy);
            
            return {'success': true, 'transferred': probesToTransfer, 'energy_cost': energyCost};
        } else {
            // Continuous transfer
            if (rate <= 0) {
                throw new Error('Transfer rate must be greater than 0');
            }
            
            // Store continuous transfer (will be processed in tick)
            if (!this.activeTransfers) {
                this.activeTransfers = [];
            }
            
            // Calculate energy cost per second
            const fromZoneData = zones.find(z => z.id === fromZone);
            const toZoneData = zones.find(z => z.id === toZone);
            const energyCostPerProbe = this._calculateTransferEnergyCost(fromZoneData, toZoneData, 1);
            const energyCostPerSecond = energyCostPerProbe * rate;
            
            const transferId = Date.now() + Math.random();
            const transfer = {
                id: transferId,
                from: fromZone,
                to: toZone,
                rate: rate,
                energy_cost_per_second: energyCostPerSecond,
                paused: false
            };
            
            this.activeTransfers.push(transfer);
            
            // Add to history
            this.transferHistory.push({
                id: transferId,
                from: fromZone,
                to: toZone,
                type: 'continuous',
                rate: rate,
                status: 'active',
                startTime: Date.now()
            });
            
            return {'success': true, 'transfer_id': transferId, 'transfer_rate': rate, 'energy_cost_per_second': energyCostPerSecond};
        }
    }
    
    _calculateTransferEnergyCost(fromZone, toZone, probeCount) {
        // Calculate delta-v for Hohmann transfer
        const r1 = fromZone.radius_au || 1.0;
        const r2 = toZone.radius_au || 1.0;
        
        // Simplified Hohmann transfer delta-v
        const radiusRatio = Math.max(r1, r2) / Math.min(r1, r2);
        const deltaV = 30.0 * Math.sqrt(radiusRatio) * 0.5; // km/s
        
        // Energy cost: E = 0.5 * m * v^2
        const probeMass = 10.0; // kg per probe
        const energyPerProbe = 0.5 * probeMass * (deltaV * 1000) * (deltaV * 1000); // Joules (v in m/s)
        const energyCost = energyPerProbe * probeCount; // Total energy in Joules
        
        return energyCost; // Return in Joules (will be converted to kW in UI)
    }
    
    _updateTransfer(actionData) {
        const transferId = actionData.transfer_id;
        const newRate = actionData.rate;
        
        if (!newRate || newRate <= 0) {
            throw new Error('Transfer rate must be greater than 0');
        }
        
        const transfer = this.activeTransfers.find(t => t.id == transferId);
        if (!transfer) {
            throw new Error(`Transfer not found: ${transferId}`);
        }
        
        // Update rate
        const oldRate = transfer.rate;
        transfer.rate = newRate;
        
        // Recalculate energy cost
        const zones = this.dataLoader.orbitalZones || [];
        const fromZoneData = zones.find(z => z.id === transfer.from);
        const toZoneData = zones.find(z => z.id === transfer.to);
        const energyCostPerProbe = this._calculateTransferEnergyCost(fromZoneData, toZoneData, 1);
        transfer.energy_cost_per_second = energyCostPerProbe * newRate;
        
        // Update history
        const historyItem = this.transferHistory.find(t => t.id == transferId);
        if (historyItem) {
            historyItem.rate = newRate;
        }
        
        return {'success': true, 'transfer_id': transferId, 'new_rate': newRate};
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
    recycleFactory(factoryId) {
        if (!(factoryId in this.structures)) {
            throw new Error(`Factory ${factoryId} not found`);
        }
        
        if (this.structures[factoryId] <= 0) {
            throw new Error(`No factories of type ${factoryId} to recycle`);
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
        
        // Remove factory
        this.structures[factoryId] -= 1;
        if (this.structures[factoryId] <= 0) {
            delete this.structures[factoryId];
        }
        
        return {
            'success': true,
            'metal_returned': metalReturned,
            'energy_returned': 0,
            'slag_produced': slagProduced
        };
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
        this.tickRate = 60; // ticks per second - fixed rate
        this.deltaTime = 1 / this.tickRate; // Fixed delta time per tick
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
        
        try {
            // Initialize storage if needed
            if (typeof gameStorage === 'undefined') {
                console.warn('GameStorage not available');
                return;
            }
            
            await gameStorage.init();
            const gameState = this.engine.getState();
            await gameStorage.saveGameState(this.sessionId, gameState);
            console.log('Game state saved locally');
        } catch (error) {
            console.error('Failed to save game state:', error);
            throw error;
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
        if (!this.isRunning || !this.engine) {
            return;
        }

        // Always tick at fixed rate (60 ticks/second)
        // Time speed is applied to delta_time, not tick rate
        const effectiveDeltaTime = this.deltaTime * this.timeSpeed;
        
        // Execute single tick with time-scaled delta_time
        this.engine.tick(effectiveDeltaTime);
        
        // Emit game state update event
        this.updateGameState(this.engine.getState());
    }

    updateGameState(newState) {
        // Emit event for UI updates
        window.dispatchEvent(new CustomEvent('gameStateUpdate', { detail: newState }));
    }

    performAction(actionType, actionData) {
        if (!this.engine) {
            throw new Error('No active game engine');
        }

        try {
            const result = this.engine.performAction(actionType, actionData);
            // Update UI with new state
            this.updateGameState(this.engine.getState());
            return { success: true, game_state: this.engine.getState(), result: result };
        } catch (error) {
            console.error('Action failed:', error);
            throw error;
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
        return this.engine && this.engine.dysonSphereMass >= this.engine.dysonSphereTargetMass;
    }
    
    setTimeSpeed(speed) {
        this.timeSpeed = Math.max(0.1, Math.min(1000, speed)); // Limit between 0.1x and 1000x
    }
}

// Export singleton instance
const gameEngine = new GameEngineClient();
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameEngine, GameEngineClient };
}

