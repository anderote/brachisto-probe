/**
 * Game Engine V2 - Core Engine
 * 
 * Orchestrates all systems and calculations
 * Runs in worker thread
 */

// Import dependencies (will be loaded via importScripts in worker)
// In main thread, these should be available globally

class GameEngine {
    constructor(initialState, dataLoader, config = {}) {
        this.state = initialState;
        this.dataLoader = dataLoader;
        this.config = {
            ...config,
            tech_growth_scale_factor: config.tech_growth_scale_factor || 1.0  // Default alpha = 1.0
        };
        
        // Initialize time manager
        this.timeManager = new TimeManager(initialState.time || 0);
        this.timeManager.setTimeSpeed(config.timeSpeed || 1.0);
        
        // Initialize TechTree (new unified research/skills system)
        const TechTreeClass = typeof TechTree !== 'undefined' ? TechTree : 
            (typeof self !== 'undefined' && self.TechTree ? self.TechTree : null);
        this.techTree = TechTreeClass ? new TechTreeClass() : null;
        
        // Initialize calculators
        this.orbitalMechanics = new OrbitalMechanics(dataLoader);
        this.skillsCalculator = new SkillsCalculator(dataLoader);
        this.compositeSkillsCalculator = null; // Will be initialized after orbitalMechanics
        this.productionCalculator = new ProductionCalculator(this.orbitalMechanics);
        this.energyCalculator = new EnergyCalculator(this.orbitalMechanics);
        this.researchCalculator = new ResearchCalculator(dataLoader);
        
        // Initialize systems
        this.probeSystem = new ProbeSystem(this.productionCalculator);
        this.structureSystem = new StructureSystem(this.productionCalculator);
        this.miningSystem = new MiningSystem(this.productionCalculator, this.orbitalMechanics);
        this.dysonSystem = new DysonSystem(this.productionCalculator, this.orbitalMechanics);
        this.transferSystem = new TransferSystem(this.orbitalMechanics);
        this.recyclingSystem = null; // Will be initialized after compositeSkillsCalculator
        
        // Initialize data (will be loaded asynchronously)
        this.orbitalZones = null;
        this.buildings = null;
        this.researchTrees = null;
        this.researchCategories = null; // Categories structure for TechTree
        
        // Initialize state
        this.initialized = false;
    }
    
    /**
     * Initialize engine with game data
     */
    async initialize() {
        if (this.initialized) return;
        
        // Load game data
        this.orbitalZones = await this.dataLoader.loadOrbitalMechanics();
        this.buildings = await this.dataLoader.loadBuildings();
        
        // Load research trees (get both flat and categories format)
        const researchData = await this.loadResearchData();
        this.researchTrees = researchData.trees;
        this.researchCategories = researchData.categories;
        
        // Initialize calculators with data
        this.orbitalMechanics.initialize(this.orbitalZones);
        this.skillsCalculator.initialize(this.researchTrees);
        this.researchCalculator.initialize(this.researchTrees);
        
        // Initialize TechTree with categories data
        if (this.techTree) {
            if (this.researchCategories) {
                this.techTree.initialize(this.researchCategories);
            } else if (this.researchTrees) {
                // Fall back to flat format
                this.techTree.initializeFromFlat(this.researchTrees);
            }
            
            // Load existing research state from game state
            this.techTree.loadFromState(this.state);
        }
        
        // Initialize composite skills calculator (needs orbitalMechanics)
        // Check both global scope and self scope for worker context
        const CompositeSkillsCalc = typeof CompositeSkillsCalculator !== 'undefined' ? 
            CompositeSkillsCalculator : 
            (typeof self !== 'undefined' && self.CompositeSkillsCalculator ? self.CompositeSkillsCalculator : null);
        if (CompositeSkillsCalc) {
            this.compositeSkillsCalculator = new CompositeSkillsCalc(this.orbitalMechanics);
        }
        
        // Initialize recycling system (needs compositeSkillsCalculator)
        const RecyclingSys = typeof RecyclingSystem !== 'undefined' ? 
            RecyclingSystem : 
            (typeof self !== 'undefined' && self.RecyclingSystem ? self.RecyclingSystem : null);
        if (RecyclingSys && this.compositeSkillsCalculator) {
            this.recyclingSystem = new RecyclingSys(this.compositeSkillsCalculator);
        }
        
        // Initialize zones in state if not already done
        this.initializeZones();
        
        // Initialize probes if not already done
        this.initializeProbes();
        
        this.initialized = true;
    }
    
    /**
     * Load research data (both flat trees and categories format)
     * @returns {Object} { trees, categories }
     */
    async loadResearchData() {
        try {
            const response = await fetch('/game_data/research_trees.json');
            const data = await response.json();
            
            return {
                trees: data.research_trees || {},
                categories: data.categories || null
            };
        } catch (error) {
            console.error('Failed to load research data:', error);
            return { trees: {}, categories: null };
        }
    }
    
    /**
     * Initialize zones in state
     * Calculates metal_remaining from metal_percentage * total_mass_kg if metal_stores_kg is not provided
     */
    initializeZones() {
        if (!this.orbitalZones) return;
        
        const zones = this.state.zones || {};
        
        for (const zone of this.orbitalZones) {
            const zoneId = zone.id;
            
            // Skip Dyson zone (no mining, no resources)
            if (zone.is_dyson_zone) {
                continue;
            }
            
            if (!zones[zoneId]) {
                // New zone structure: track mass, not metal directly
                // metal_remaining is DERIVED: mass_remaining * metal_percentage
                zones[zoneId] = {
                    mass_remaining: zone.total_mass_kg || 0,  // Un-mined mass
                    stored_metal: 0,                         // Metal stored locally (for construction)
                    probe_mass: 0,                           // Mass of all probes in zone
                    structure_mass: 0,                       // Mass of all structures in zone
                    slag_mass: 0,                            // Mass of slag in zone
                    depleted: false                          // True when mass_remaining <= 0
                };
            } else {
                // Ensure existing zones have proper mass_remaining if it's 0 or missing
                if (!zones[zoneId].mass_remaining || zones[zoneId].mass_remaining === 0) {
                    zones[zoneId].mass_remaining = zone.total_mass_kg || 0;
                }
            }
        }
        
        this.state.zones = zones;
    }
    
    /**
     * Ensure a zone is properly initialized with correct mass
     * @param {string} zoneId - Zone identifier
     */
    ensureZoneInitialized(zoneId) {
        const zones = this.state.zones || {};
        
        // Skip Dyson zone
        if (this.orbitalMechanics.isDysonZone(zoneId)) {
            return;
        }
        
        // If zone doesn't exist or has 0 mass, initialize it properly
        if (!zones[zoneId] || !zones[zoneId].mass_remaining || zones[zoneId].mass_remaining === 0) {
            const zoneData = this.orbitalMechanics.getZone(zoneId);
            if (zoneData) {
                zones[zoneId] = zones[zoneId] || {
                    stored_metal: 0,
                    probe_mass: 0,
                    structure_mass: 0,
                    slag_mass: 0,
                    depleted: false
                };
                zones[zoneId].mass_remaining = zoneData.total_mass_kg || 0;
                // Ensure stored_metal exists
                if (zones[zoneId].stored_metal === undefined) {
                    zones[zoneId].stored_metal = 0;
                }
                this.state.zones = zones;
            }
        }
    }
    
    /**
     * Initialize probes in state
     */
    initializeProbes() {
        const probesByZone = this.state.probes_by_zone || {};
        const probeAllocationsByZone = this.state.probe_allocations_by_zone || {};
        
        // Initialize default zone (Earth) with initial probes
        const defaultZoneId = this.config.default_zone || 'earth';
        const initialProbes = this.config.initial_probes || 1;
        
        // Ensure default zone has initial probes (only if not already set or is 0)
        if (!probesByZone[defaultZoneId]) {
            probesByZone[defaultZoneId] = { 'probe': initialProbes };
        } else {
            const currentProbeCount = probesByZone[defaultZoneId]['probe'] || 0;
            // Only set if not already initialized (0 or undefined means not initialized)
            if (currentProbeCount === 0) {
                probesByZone[defaultZoneId]['probe'] = initialProbes;
            }
        }
        
        // Put initial metal in starting zone (metal is now stored locally per zone)
        // Only do this if the zone doesn't already have stored_metal (to support saved games)
        this.ensureZoneInitialized(defaultZoneId);
        const zones = this.state.zones || {};
        if (zones[defaultZoneId] && (zones[defaultZoneId].stored_metal === undefined || zones[defaultZoneId].stored_metal === 0)) {
            // Transfer the initial global metal to the starting zone
            const initialMetal = this.state.metal || 0;
            zones[defaultZoneId].stored_metal = initialMetal;
            this.state.metal = 0; // Clear global metal pool (all metal is now zone-based)
            this.state.zones = zones;
        }
        
        // Initialize Dyson zone with 0 probes and 0 metal (player must build them)
        const dysonZoneId = 'dyson_sphere';
        if (!probesByZone[dysonZoneId]) {
            probesByZone[dysonZoneId] = { 'probe': 0 };
        }
        // Initialize Dyson zone stored_metal
        if (!zones[dysonZoneId]) {
            zones[dysonZoneId] = {
                stored_metal: 0,
                mass_remaining: 0,
                probe_mass: 0,
                structure_mass: 0,
                slag_mass: 0,
                depleted: false
            };
        } else if (zones[dysonZoneId].stored_metal === undefined) {
            zones[dysonZoneId].stored_metal = 0;
        }
        this.state.zones = zones;
        
        // Initialize probe allocations
        for (const zone of this.orbitalZones || []) {
            const zoneId = zone.id;
            
            if (!probeAllocationsByZone[zoneId]) {
                if (zone.is_dyson_zone) {
                    probeAllocationsByZone[zoneId] = {
                        harvest: 0,
                        construct: 0,
                        replicate: 0,
                        recycle: 0,
                        dyson: 1.0
                    };
                } else {
                    probeAllocationsByZone[zoneId] = {
                        harvest: 0.5625,     // Slider 75 (sqrt(0.5625)*100 = 75)
                        replicate: 1.0,      // Slider 100 (sqrt(1.0)*100 = 100)
                        construct: 0.01,     // Slider 10 (sqrt(0.01)*100 = 10)
                        recycle: 0.01,       // Slider 10 (sqrt(0.01)*100 = 10)
                        recycle_probes: 0,   // 0% recycle probes
                        dyson: 0
                    };
                }
            }
        }
        
        this.state.probes_by_zone = probesByZone;
        this.state.probe_allocations_by_zone = probeAllocationsByZone;
    }
    
    /**
     * Main tick function - processes one game tick
     */
    tick() {
        if (!this.initialized) {
            console.warn('Engine not initialized, skipping tick');
            return;
        }
        
        const profiler = typeof self !== 'undefined' && self.performanceProfiler 
            ? self.performanceProfiler 
            : (typeof window !== 'undefined' && window.performanceProfiler ? window.performanceProfiler : null);
        const tickStart = profiler ? profiler.startTiming('tick') : null;
        
        const deltaTime = this.timeManager.getDeltaTime();
        this.timeManager.tick();
        
        // Update state time
        this.state.time = this.timeManager.getTime();
        this.state.tick = this.timeManager.getTick();
        
        // 1. Load TechTree from state to ensure it has the latest research state
        if (this.techTree) {
            this.techTree.loadFromState(this.state);
        }
        
        // 2. Calculate current skills from TechTree (primary) or fallback to SkillsCalculator
        let skills;
        if (this.techTree) {
            // Use TechTree for skills calculation (now using latest research state)
            skills = this.techTree.getLegacySkills();
            
            // Update tech_tree state
            this.state.tech_tree = this.techTree.exportToState();
        } else {
            // Fallback to old SkillsCalculator
            skills = this.skillsCalculator.calculateSkills(this.state.research || {}, this.state.time);
        }
        this.state.skills = skills;
        
        // 2. Get alpha factors from config (will be used after research update)
        const ALPHA_STRUCTURE_FACTOR = Config.ALPHA_STRUCTURE_FACTOR || 0.8;
        const ALPHA_PROBE_FACTOR = Config.ALPHA_PROBE_FACTOR || 0.75;
        const ALPHA_DYSON_FACTOR = Config.ALPHA_DYSON_FACTOR || 0.55;
        const ALPHA_COST_FACTOR = Config.ALPHA_COST_FACTOR || 0.25;
        
        // 3. Update research progress (consumes intelligence)
        // Use TechTree if available, otherwise fall back to ResearchCalculator
        if (this.techTree) {
            this.updateResearchWithTechTree(deltaTime, skills);
            // Recalculate skills after research update to ensure they reflect latest research state
            skills = this.techTree.getLegacySkills();
            this.state.skills = skills;
            this.state.tech_tree = this.techTree.exportToState();
        } else {
            this.state = this.researchCalculator.updateResearch(this.state, deltaTime, skills);
            // Recalculate skills after research update
            skills = this.skillsCalculator.calculateSkills(this.state.research || {}, this.state.time);
            this.state.skills = skills;
        }
        
        // Recalculate upgrade factors with updated skills
        const updatedMiningSkills = [
            skills.robotic || skills.manipulation || 1.0,
            skills.locomotion || 1.0,
            skills.strength || 1.0,
            skills.materials || 1.0
        ];
        const updatedBuildingSkills = [
            skills.robotic || skills.manipulation || 1.0,
            skills.production || 1.0,
            skills.materials || 1.0
        ];
        const updatedEnergySkills = [
            skills.solar_pv || skills.energy_collection || 1.0,
            skills.energy_converter || 1.0,
            skills.radiator || 1.0
        ];
        const updatedComputeSkills = [
            skills.cpu || 1.0,
            skills.gpu || 1.0,
            skills.interconnect || 1.0,
            skills.io_bandwidth || 1.0
        ];
        
        this.state.upgrade_factors = {
            structure: {
                mining: this.productionCalculator.calculateUpgradeFactors(
                    updatedMiningSkills,
                    ALPHA_STRUCTURE_FACTOR,
                    (ALPHA_COST_FACTOR + ALPHA_STRUCTURE_FACTOR) / 2
                ),
                building: this.productionCalculator.calculateUpgradeFactors(
                    updatedBuildingSkills,
                    ALPHA_STRUCTURE_FACTOR,
                    (ALPHA_COST_FACTOR + ALPHA_STRUCTURE_FACTOR) / 2
                ),
                energy: this.productionCalculator.calculateUpgradeFactors(
                    updatedEnergySkills,
                    ALPHA_STRUCTURE_FACTOR,
                    (ALPHA_COST_FACTOR + ALPHA_STRUCTURE_FACTOR) / 2
                ),
                compute: this.productionCalculator.calculateUpgradeFactors(
                    updatedComputeSkills,
                    ALPHA_STRUCTURE_FACTOR,
                    (ALPHA_COST_FACTOR + ALPHA_STRUCTURE_FACTOR) / 2
                )
            },
            probe: {
                mining: this.productionCalculator.calculateUpgradeFactors(
                    updatedMiningSkills,
                    ALPHA_PROBE_FACTOR,
                    (ALPHA_COST_FACTOR + ALPHA_PROBE_FACTOR) / 2
                ),
                building: this.productionCalculator.calculateUpgradeFactors(
                    updatedBuildingSkills,
                    ALPHA_PROBE_FACTOR,
                    (ALPHA_COST_FACTOR + ALPHA_PROBE_FACTOR) / 2
                )
            },
            dyson: {
                construction: this.productionCalculator.calculateUpgradeFactors(
                    updatedBuildingSkills,
                    ALPHA_DYSON_FACTOR,
                    (ALPHA_COST_FACTOR + ALPHA_DYSON_FACTOR) / 2
                ),
                energy: this.productionCalculator.calculateUpgradeFactors(
                    updatedEnergySkills,
                    ALPHA_DYSON_FACTOR,
                    (ALPHA_COST_FACTOR + ALPHA_DYSON_FACTOR) / 2
                )
            }
        };
        
        // Keep legacy tech_upgrade_factors for backward compatibility (using probe factors)
        const legacyAlpha = this.config.tech_growth_scale_factor || 1.0;
        this.state.tech_upgrade_factors = this.productionCalculator.calculateAllUpgradeFactors(skills, legacyAlpha);
        
        // 4. Calculate energy balance
        const dysonPower = this.dysonSystem.calculateDysonEnergyProduction(
            this.state, 
            skills, 
            this.config.dyson_power_allocation || 0.5
        );
        const energyBalance = this.energyCalculator.calculateEnergyBalance(
            this.state, 
            this.buildings, 
            skills, 
            dysonPower.economy
        );
        
        // Update energy and intelligence in state
        this.state.energy = energyBalance.net;
        this.state.intelligence = dysonPower.intelligence + 
            this.researchCalculator.calculateIntelligenceProduction(this.state, this.buildings, skills);
        
        // Energy throttle (if negative energy, throttle production)
        const energyThrottle = energyBalance.throttle;
        
        // 5. Process mining (extract metal, produce slag)
        this.state = this.miningSystem.processMining(
            this.state, 
            deltaTime, 
            skills, 
            this.buildings, 
            energyThrottle
        );
        
        // 6. Process structure construction
        this.state = this.structureSystem.processStructureConstruction(
            this.state, 
            deltaTime, 
            skills, 
            this.buildings, 
            energyThrottle
        );
        
        // 7. Process probe operations (mining, building, replication)
        const probeIterationStart = profiler ? profiler.startTiming('probe_iteration') : null;
        for (const zoneId in this.state.probes_by_zone || {}) {
            this.state = this.probeSystem.processProbeOperations(
                this.state, 
                zoneId, 
                deltaTime, 
                skills, 
                this.buildings,
                energyThrottle
            );
        }
        if (profiler && probeIterationStart !== null) {
            profiler.endTiming('probe_iteration', probeIterationStart);
            profiler.recordProbeIterationTime(performance.now() - probeIterationStart);
        }
        
        // 8. Process Dyson construction
        this.state = this.dysonSystem.processDysonConstruction(
            this.state, 
            deltaTime, 
            skills, 
            energyThrottle
        );
        
        // 9. Process transfers
        this.state = this.transferSystem.processTransfers(this.state, deltaTime);
        
        // 10. Process probe recycling (slag → metal)
        if (this.recyclingSystem) {
            this.state = this.recyclingSystem.processRecycling(this.state, deltaTime, skills);
        }
        
        // 11. Process probe self-recycling (probes → metal + slag)
        if (this.recyclingSystem) {
            this.state = this.recyclingSystem.processProbeRecycling(this.state, deltaTime, skills);
        }
        
        // 12. Calculate and update rates (for UI display)
        this.updateRates(skills, dysonPower, energyBalance);
        
        // 13. Calculate derived values (per-zone economics, then totals)
        this.calculateDerivedValues(skills, dysonPower, energyBalance);
        
        if (profiler && tickStart !== null) {
            profiler.endTiming('tick', tickStart);
            profiler.recordTickTime(performance.now() - tickStart);
        }
    }
    
    /**
     * Update research progress using TechTree
     * @param {number} deltaTime - Time delta in days
     * @param {Object} skills - Current skills
     */
    updateResearchWithTechTree(deltaTime, skills) {
        if (!this.techTree) return;
        
        // Calculate total intelligence production
        const intelligenceRate = this.state.intelligence || 0;
        if (intelligenceRate <= 0) return;
        
        // Get all enabled research projects
        const enabledProjects = this.techTree.getEnabledResearchProjects();
        if (enabledProjects.length === 0) return;
        
        // Distribute intelligence equally among enabled projects
        const flopsPerProject = (intelligenceRate * deltaTime) / enabledProjects.length;
        
        // Calculate research allocation info for UI display
        const researchAllocationInfo = {};
        
        for (const project of enabledProjects) {
            const { treeId, tierId, tierDef } = project;
            
            // Calculate tier cost in EFLOPS-days (same logic as TechTree)
            const EFLOPS_TO_FLOPS = 1e18;
            const SECONDS_PER_DAY = 86400;
            const totalTranches = tierDef.tranches || 10;
            
            let tierCostEFLOPSDays;
            if (tierDef.tier_cost_eflops_days !== undefined) {
                tierCostEFLOPSDays = tierDef.tier_cost_eflops_days;
            } else if (tierDef.tranche_cost_intelligence !== undefined) {
                // Legacy: convert per-tranche cost to total tier cost
                const legacyCost = tierDef.tranche_cost_intelligence;
                const legacyCostEFLOPSDays = legacyCost / (EFLOPS_TO_FLOPS * SECONDS_PER_DAY);
                if (legacyCostEFLOPSDays < 1000) {
                    tierCostEFLOPSDays = legacyCostEFLOPSDays * totalTranches;
                } else {
                    tierCostEFLOPSDays = legacyCostEFLOPSDays;
                }
            } else {
                // Default: tier 1 costs 10,000 EFLOPS-days, scale exponentially
                const tree = this.techTree.getTree(treeId);
                let tierIndex = 0;
                if (tree && tree.tiers) {
                    const foundIndex = tree.tiers.findIndex(t => t.id === tierId);
                    if (foundIndex >= 0) {
                        tierIndex = foundIndex;
                    }
                } else if (tree && tree.subcategories && tierId.includes('_')) {
                    // Handle subcategory tiers (format: "subcatId_tierId")
                    const parts = tierId.split('_');
                    if (parts.length >= 2) {
                        const subcatId = parts[0];
                        const actualTierId = parts.slice(1).join('_');
                        const subcatData = tree.subcategories[subcatId];
                        if (subcatData && subcatData.tiers) {
                            const foundIndex = subcatData.tiers.findIndex(t => t.id === actualTierId);
                            if (foundIndex >= 0) {
                                tierIndex = foundIndex;
                            }
                        }
                    }
                }
                const baseCostEFLOPSDays = 10000; // Tier 1 base cost
                tierCostEFLOPSDays = baseCostEFLOPSDays * Math.pow(10, tierIndex);
            }
            
            // Apply tier-based throttling: max research rate scales with tier cost
            // Higher tiers have exponentially higher costs, so they can research faster proportionally
            // Formula: maxEFLOPSDaysPerDay = baseRate * (cost / baseCost)^0.4
            // This means a tier that costs 100x more can research at ~6.3x the rate
            const baseCostEFLOPSDays = 10000; // Base cost for tier 1
            const costRatio = tierCostEFLOPSDays / baseCostEFLOPSDays;
            
            // Max EFLOPS-days per day multiplier: cost ratio to the 0.4 power (so higher tiers research faster)
            // Cap at 100x to prevent extreme values
            const maxRateMultiplier = Math.min(100, Math.pow(costRatio, 0.4));
            
            // Base max rate: can complete tier 1 (10,000 EFLOPS-days) in 1 day = 10,000 EFLOPS-days/day
            // Higher tiers can complete proportionally faster
            const maxEFLOPSDaysPerDay = baseCostEFLOPSDays * maxRateMultiplier;
            const maxFlopsPerDay = maxEFLOPSDaysPerDay * EFLOPS_TO_FLOPS * SECONDS_PER_DAY;
            
            // Throttle the allocated FLOPS to not exceed max rate
            const maxFlopsThisTick = (maxFlopsPerDay * deltaTime);
            const throttledFlops = Math.min(flopsPerProject, maxFlopsThisTick);
            
            // Store allocation info for UI
            if (!researchAllocationInfo[treeId]) {
                researchAllocationInfo[treeId] = {};
            }
            researchAllocationInfo[treeId][tierId] = throttledFlops / deltaTime; // FLOPS per second
            
            this.techTree.addResearchProgress(treeId, tierId, throttledFlops, this.state.time);
        }
        
        // Store research allocation info in state for UI
        this.state.research_allocation_info = researchAllocationInfo;
        
        // Update state with new research state from TechTree
        this.state.tech_tree = this.techTree.exportToState();
        
        // Also update legacy research state for backward compatibility
        this.state.research = this.techTree.researchState;
    }
    
    /**
     * Allocate research (enable/disable a research tier)
     * @param {Object} actionData - Action data with tree_id, tier_id, enabled
     * @returns {Object} Result
     */
    allocateResearch(actionData) {
        const { tree_id, tier_id, enabled } = actionData;
        
        if (!tree_id || tier_id === undefined) {
            return { success: false, error: 'tree_id and tier_id required' };
        }
        
        if (!this.techTree) {
            return { success: false, error: 'TechTree not initialized' };
        }
        
        // Enable or disable the tier
        if (enabled) {
            this.techTree.enableTier(tree_id, tier_id);
        } else {
            this.techTree.disableTier(tree_id, tier_id);
        }
        
        // Update state
        this.state.tech_tree = this.techTree.exportToState();
        this.state.research = this.techTree.researchState;
        
        return { success: true };
    }
    
    /**
     * Toggle all research in a category (enable/disable all tiers in all trees of a category)
     * @param {Object} actionData - Action data with category, enabled
     * @returns {Object} Result
     */
    toggleResearchCategory(actionData) {
        const { category, enabled } = actionData;
        
        if (!category) {
            return { success: false, error: 'category required' };
        }
        
        if (!this.techTree) {
            return { success: false, error: 'TechTree not initialized' };
        }
        
        // Get all trees in this category
        const treesInCategory = this.techTree.getTreesInCategory(category);
        
        for (const tree of treesInCategory) {
            if (!tree.tiers) continue;
            
            // For each tree, enable/disable the first incomplete tier
            for (const tier of tree.tiers) {
                const tierProgress = this.techTree.getTierProgress(tree.id, tier.id);
                
                // Only toggle incomplete tiers
                if (!tierProgress.completed) {
                    if (enabled) {
                        // Only enable if previous tier is complete (or this is the first tier)
                        const tierIndex = tree.tiers.findIndex(t => t.id === tier.id);
                        let canEnable = true;
                        
                        if (tierIndex > 0) {
                            const prevTier = tree.tiers[tierIndex - 1];
                            const prevProgress = this.techTree.getTierProgress(tree.id, prevTier.id);
                            if (!prevProgress.completed) {
                                canEnable = false;
                            }
                        }
                        
                        if (canEnable) {
                            this.techTree.enableTier(tree.id, tier.id);
                            break; // Only enable one tier per tree
                        }
                    } else {
                        this.techTree.disableTier(tree.id, tier.id);
                    }
                }
            }
        }
        
        // Handle computer_systems subcategories
        if (category === 'intelligence' && this.researchTrees) {
            const computerSystems = this.researchTrees['computer_systems'];
            if (computerSystems && computerSystems.subcategories) {
                for (const [subcatId, subcatData] of Object.entries(computerSystems.subcategories)) {
                    if (!subcatData.tiers) continue;
                    
                    for (const tier of subcatData.tiers) {
                        const tierKey = subcatId + '_' + tier.id;
                        const tierProgress = this.techTree.getTierProgress('computer_systems', tierKey);
                        
                        if (!tierProgress.completed) {
                            if (enabled) {
                                const tierIndex = subcatData.tiers.findIndex(t => t.id === tier.id);
                                let canEnable = true;
                                
                                if (tierIndex > 0) {
                                    const prevTier = subcatData.tiers[tierIndex - 1];
                                    const prevTierKey = subcatId + '_' + prevTier.id;
                                    const prevProgress = this.techTree.getTierProgress('computer_systems', prevTierKey);
                                    if (!prevProgress.completed) {
                                        canEnable = false;
                                    }
                                }
                                
                                if (canEnable) {
                                    this.techTree.enableTier('computer_systems', tierKey);
                                    break;
                                }
                            } else {
                                this.techTree.disableTier('computer_systems', tierKey);
                            }
                        }
                    }
                }
            }
        }
        
        // Update state
        this.state.tech_tree = this.techTree.exportToState();
        this.state.research = this.techTree.researchState;
        
        return { success: true };
    }
    
    /**
     * Update production rates in state (for UI display)
     */
    updateRates(skills, dysonPower, energyBalance) {
        const profiler = typeof self !== 'undefined' && self.performanceProfiler 
            ? self.performanceProfiler 
            : (typeof window !== 'undefined' && window.performanceProfiler ? window.performanceProfiler : null);
        const ratesStart = profiler ? profiler.startTiming('rate_calculation') : null;
        
        const rates = {
            metal_mining: 0,
            metal_refining: 0,
            energy_production: energyBalance.production,
            energy_consumption: energyBalance.consumption,
            intelligence_production: this.state.intelligence || 0,
            probe_production: 0,
            dyson_construction: this.state.rates?.dyson_construction || 0,
            structure_construction: {}
        };
        
        // Calculate mining rates per zone
        // zoneRates.mining is MASS mining rate, need to convert to metal production rate
        const zoneCalcStart = profiler ? profiler.startTiming('zone_calculation') : null;
        const structuresByZone = this.state.structures_by_zone || {};
        for (const zoneId in this.state.probes_by_zone || {}) {
            if (this.orbitalMechanics.isDysonZone(zoneId)) continue;
            
            const perZoneStart = profiler ? performance.now() : null;
            // Uses pre-calculated upgrade factors from state
            const zoneRates = this.productionCalculator.calculateZoneRates(
                this.state, 
                zoneId, 
                this.buildings
            );
            if (profiler && perZoneStart !== null) {
                profiler.recordZoneCalculationTimeDetailed(performance.now() - perZoneStart);
            }
            
            // Convert mass mining rate to metal production rate using extraction efficiency
            const massMiningRate = zoneRates.mining; // This is mass extraction rate
            const metalProductionRate = this.productionCalculator.calculateMetalProductionRate(
                massMiningRate,
                zoneId,
                skills,
                structuresByZone,
                this.buildings
            );
            
            // Debug logging (remove after verification)
            if (massMiningRate > 0) {
                const zoneProbes = this.state.probes_by_zone[zoneId] || {};
                const probeCount = zoneProbes['probe'] || 0;
            }
            
            rates.metal_mining += metalProductionRate;
        }
        if (profiler && zoneCalcStart !== null) {
            profiler.endTiming('zone_calculation', zoneCalcStart);
        }
        
        // Calculate probe production rate
        const probeProdStart = profiler ? profiler.startTiming('probe_production_calc') : null;
        for (const zoneId in this.state.probes_by_zone || {}) {
            const allocations = this.state.probe_allocations_by_zone?.[zoneId] || {};
            const replicateAllocation = allocations.replicate || 0;
            const zoneProbes = this.state.probes_by_zone[zoneId] || {};
            
            // Instrument probe count calculation
            const probeCountStart = profiler ? performance.now() : null;
            const totalProbes = Object.values(zoneProbes).reduce((sum, count) => sum + (count || 0), 0);
            if (profiler && probeCountStart !== null) {
                // This is part of probe iteration overhead
                const probeCountTime = performance.now() - probeCountStart;
                if (probeCountTime > 0.1) { // Only record if significant
                    profiler.recordProbeIterationTime(probeCountTime);
                }
            }
            
            if (totalProbes > 0 && replicateAllocation > 0) {
                // Uses pre-calculated upgrade factors from state
                const buildingRate = this.productionCalculator.calculateBuildingRate(
                    totalProbes * replicateAllocation, 
                    this.state
                );
                rates.probe_production += buildingRate / 100;  // Convert kg/day to probes/day (100kg per probe)
            }
        }
        if (profiler && probeProdStart !== null) {
            profiler.endTiming('probe_production_calc', probeProdStart);
        }
        
        this.state.rates = rates;
        
        if (profiler && ratesStart !== null) {
            profiler.endTiming('rate_calculation', ratesStart);
        }
    }
    
    /**
     * Calculate derived values (per-zone economics, then totals)
     * Called after each tick to pre-calculate all UI-displayed values
     */
    calculateDerivedValues(skills, dysonPower, energyBalance) {
        // Store dysonPower for use within this method
        const dysonEconomyPower = dysonPower?.economy || 0;
        const dysonTotalPower = dysonPower?.total || 0;
        const PROBE_MASS = 100; // kg per probe
        const derived = {
            zones: {},
            totals: {
                probe_count: 0,
                probe_mass: 0,
                structure_count: 0,
                structure_mass: 0,
                metal_mined_rate: 0,
                metal_refined_rate: 0,
                slag_produced_rate: 0,
                metal_consumed_rate: 0,
                energy_produced: 0,
                energy_consumed: 0,
                energy_net: 0,
                intelligence_produced: 0,
                probes_mining: 0,
                probes_replicating: 0,
                probes_constructing: 0,
                probes_dyson: 0,
                probes_recycling_probes: 0,
                probes_transit: 0,
                dyson_mass_rate: 0
            }
        };
        
        const probesByZone = this.state.probes_by_zone || {};
        const structuresByZone = this.state.structures_by_zone || {};
        const probeAllocationsByZone = this.state.probe_allocations_by_zone || {};
        const activeTransfers = this.state.active_transfers || [];
        
        // Get global energy throttle
        const energyThrottle = energyBalance.throttle || 1.0;
        
        // Get all zone IDs from orbitalZones
        const zoneIds = this.orbitalZones ? this.orbitalZones.map(z => z.id) : Object.keys(probesByZone);
        
        // Calculate per-zone metrics
        for (const zoneId of zoneIds) {
            const zoneProbes = probesByZone[zoneId] || {};
            const zoneStructures = structuresByZone[zoneId] || {};
            const allocations = probeAllocationsByZone[zoneId] || {};
            const zone = this.state.zones?.[zoneId] || {};
            
            // Probe counts (single probe type 'probe')
            const probeCount = zoneProbes['probe'] || 0;
            
            // Debug logging (remove after verification)
            
            // Read mass values from zone state (they're tracked there)
            const probeMass = zone.probe_mass || 0;
            const structureMass = zone.structure_mass || 0;
            const slagMass = zone.slag_mass || 0;
            const massRemaining = zone.mass_remaining || 0;
            const storedMetal = zone.stored_metal || 0;
            
            // Calculate metal_remaining from mass_remaining * metal_percentage
            const zoneData = this.orbitalMechanics.getZone(zoneId);
            const metalPercentage = zoneData?.metal_percentage || 0;
            const metalRemaining = massRemaining * metalPercentage;
            
            // Structure counts
            let structureCount = 0;
            for (const [buildingId, count] of Object.entries(zoneStructures)) {
                structureCount += count || 0;
            }
            
            // Production rates (kg/day)
            // Mining rate is MASS mining rate, not metal
            // Uses pre-calculated upgrade factors from state
            const zoneRates = this.productionCalculator.calculateZoneRates(
                this.state,
                zoneId,
                this.buildings
            );
            const massMiningRate = zoneRates.mining; // This is mass extraction rate
            
            // Calculate metal production rate using extraction efficiency
            const metalProductionRate = this.productionCalculator.calculateMetalProductionRate(
                massMiningRate,
                zoneId,
                skills,
                structuresByZone,
                this.buildings
            );
            
            // Slag production rate = mass mined - metal extracted
            const slagProducedRate = massMiningRate - metalProductionRate;
            
            // Metal refining rate (from recycling - calculated per zone if needed)
            // For now, refining happens globally, so per-zone is 0
            const metalRefinedRate = 0;
            
            // Metal consumed rate (by construction in this zone)
            const metalConsumedRate = zoneRates.building;
            
            // Energy production (from structures + Dyson sphere for Dyson zone)
            const zoneStructureProduction = this.energyCalculator.calculateStructureEnergyProduction(
                { [zoneId]: zoneStructures },
                this.buildings,
                skills
            );
            // Add Dyson sphere power to the Dyson zone
            const isDysonZone = this.orbitalMechanics.isDysonZone(zoneId);
            const zoneDysonPower = isDysonZone ? dysonEconomyPower : 0;
            const zoneEnergyProduction = zoneStructureProduction + zoneDysonPower;
            
            // Energy consumption (from probes + structures)
            const zoneProbeConsumption = this.energyCalculator.calculateProbeEnergyConsumption(
                { [zoneId]: zoneProbes },
                { [zoneId]: allocations },
                skills,
                this.state
            );
            const zoneStructureConsumption = this.energyCalculator.calculateStructureEnergyConsumption(
                { [zoneId]: zoneStructures },
                this.buildings,
                this.state
            );
            const energyConsumed = zoneProbeConsumption + zoneStructureConsumption;
            const energyNet = zoneEnergyProduction - energyConsumed;
            
            // Intelligence production (from structures in this zone)
            // Intelligence is calculated globally, so per-zone is 0 for now
            const intelligenceProduced = 0;
            
            // Probe activity counts (use fractional values for accurate display)
            const harvestAllocation = allocations.harvest || 0;
            const replicateAllocation = allocations.replicate || 0;
            const constructAllocation = allocations.construct || 0;
            const dysonAllocation = allocations.dyson || 0;
            const recycleProbesAllocation = allocations.recycle_probes || 0;
            
            // Use fractional probe counts for accurate display (don't floor to 0)
            const probesMining = probeCount * harvestAllocation;
            const probesReplicating = probeCount * replicateAllocation;
            const probesConstructing = probeCount * constructAllocation;
            const probesDyson = probeCount * dysonAllocation;
            const probesRecyclingProbes = probeCount * recycleProbesAllocation;
            
            // Dyson mass rate (only for Dyson zone)
            let dysonMassRate = 0;
            if (this.orbitalMechanics.isDysonZone(zoneId)) {
                dysonMassRate = this.state.rates?.dyson_construction || 0;
            }
            
            // Calculate probe production rate for this zone (probes/day)
            let zoneProbeProductionRate = 0;
            if (probesReplicating > 0) {
                // Uses pre-calculated upgrade factors from state
                const buildingRate = this.productionCalculator.calculateBuildingRate(
                    probesReplicating, 
                    this.state
                );
                zoneProbeProductionRate = buildingRate / 100;  // Convert kg/day to probes/day (100kg per probe)
            }
            
            // Calculate zone metal throttle
            const zoneMetalThrottle = this.productionCalculator.calculateZoneMetalThrottle(
                this.state,
                zoneId,
                this.buildings
            );
            
            // Store per-zone data
            const zoneDataEntry = {
                probe_count: probeCount,
                probe_mass: probeMass,
                structure_count: structureCount,
                structure_mass: structureMass,
                slag_mass: slagMass,
                mass_remaining: massRemaining,
                stored_metal: storedMetal, // Metal stored locally for construction
                metal_remaining: metalRemaining, // Derived: mass_remaining * metal_percentage (potential metal)
                metal_mined_rate: metalProductionRate, // Metal production rate (after extraction efficiency)
                metal_refined_rate: metalRefinedRate,
                slag_produced_rate: slagProducedRate,
                metal_consumed_rate: metalConsumedRate,
                energy_produced: zoneEnergyProduction,
                energy_consumed: energyConsumed,
                energy_net: energyNet,
                intelligence_produced: intelligenceProduced,
                probes_mining: probesMining,
                probes_replicating: probesReplicating,
                probes_constructing: probesConstructing,
                probes_dyson: probesDyson,
                probes_recycling_probes: probesRecyclingProbes,
                dyson_mass_rate: dysonMassRate,
                probe_production_rate: zoneProbeProductionRate, // probes/day for this zone
                energy_throttle: energyThrottle,           // Global energy throttle
                metal_throttle: zoneMetalThrottle,         // Zone-specific metal throttle
                effective_throttle: Math.min(energyThrottle, zoneMetalThrottle)
            };
            
            // Add Dyson-specific stats for Dyson zone
            if (isDysonZone) {
                const dysonSphere = this.state.dyson_sphere || {};
                const dysonMass = dysonSphere.mass || 0;
                const targetMass = dysonSphere.target_mass || Config.DYSON_SPHERE_TARGET_MASS;
                const progress = dysonSphere.progress || (dysonMass / targetMass);
                
                // Calculate areal density (1 kg/m² is the base, so area = mass / areal_density)
                const arealDensity = Config.DYSON_MASS_PER_SQ_M || 1.0;
                const dysonArea = dysonMass / arealDensity;  // m²
                
                // Calculate solar flux at Dyson sphere (at ~0.1 AU for typical Dyson zone)
                const dysonRadiusAU = zoneData?.radius_au || 0.1;
                const SOLAR_FLUX_EARTH = 1361;  // W/m² at 1 AU
                const solarFlux = SOLAR_FLUX_EARTH / (dysonRadiusAU * dysonRadiusAU);
                
                // Solar effectiveness (how much of the solar energy we actually capture)
                // Based on the DYSON_POWER_PER_SQ_M vs actual solar flux
                const powerPerSqM = Config.DYSON_POWER_PER_SQ_M || 5000;
                const solarEffectiveness = powerPerSqM / solarFlux;
                
                // Dyson power output
                const dysonPowerOutput = dysonTotalPower;
                const dysonEconomyOutput = dysonEconomyPower;
                const dysonComputeOutput = dysonPower?.compute || 0;
                
                // Build rate (kg/day)
                const dysonBuildRate = this.state.rates?.dyson_construction || 0;
                
                // Add Dyson-specific data
                zoneDataEntry.dyson = {
                    mass: dysonMass,
                    target_mass: targetMass,
                    progress: progress,
                    area: dysonArea,
                    areal_density: arealDensity,
                    solar_flux: solarFlux,
                    solar_effectiveness: solarEffectiveness,
                    power_per_sq_m: powerPerSqM,
                    power_output_total: dysonPowerOutput,
                    power_output_economy: dysonEconomyOutput,
                    power_output_compute: dysonComputeOutput,
                    build_rate: dysonBuildRate
                };
            }
            
            derived.zones[zoneId] = zoneDataEntry;
            
            // Sum to totals
            derived.totals.probe_count += probeCount;
            derived.totals.probe_mass += probeMass;
            derived.totals.structure_count += structureCount;
            derived.totals.structure_mass += structureMass;
            derived.totals.metal_mined_rate += metalProductionRate;
            derived.totals.metal_refined_rate += metalRefinedRate;
            derived.totals.slag_produced_rate += slagProducedRate;
            derived.totals.metal_consumed_rate += metalConsumedRate;
            derived.totals.energy_produced += zoneEnergyProduction;
            derived.totals.energy_consumed += energyConsumed;
            derived.totals.probes_mining += probesMining;
            derived.totals.probes_replicating += probesReplicating;
            derived.totals.probes_constructing += probesConstructing;
            derived.totals.probes_dyson += probesDyson;
            derived.totals.probes_recycling_probes += probesRecyclingProbes;
            derived.totals.dyson_mass_rate += dysonMassRate;
        }
        
        // Add global values to totals
        // Include base energy production in totals
        const baseEnergyProduction = this.state.base_energy_production || 0;
        derived.totals.energy_produced += baseEnergyProduction;
        derived.totals.energy_net = derived.totals.energy_produced - derived.totals.energy_consumed;
        derived.totals.intelligence_produced = this.state.intelligence || 0;
        derived.totals.energy_throttle = energyThrottle;
        
        // Count probes in transit using TransferSystem method
        derived.totals.probes_transit = this.transferSystem.calculateTransitProbes(this.state);
        
        // Store in state
        this.state.derived = derived;
    }
    
    /**
     * Perform a game action
     * @param {string} actionType - Action type
     * @param {Object} actionData - Action data
     * @returns {Object} Result
     */
    performAction(actionType, actionData) {
        switch (actionType) {
            case 'purchase_structure':
                return this.purchaseStructure(actionData);
            case 'purchase_probe':
                return this.purchaseProbe(actionData);
            case 'allocate_probes':
                return this.allocateProbes(actionData);
            case 'create_transfer':
                return this.createTransfer(actionData);
            case 'update_transfer':
                return this.updateTransfer(actionData);
            case 'pause_transfer':
                return this.pauseTransfer(actionData);
            case 'delete_transfer':
                return this.deleteTransfer(actionData);
            case 'allocate_research':
                return this.allocateResearch(actionData);
            case 'toggle_research_category':
                return this.toggleResearchCategory(actionData);
            case 'set_time_speed':
                this.timeManager.setTimeSpeed(actionData.speed || 1.0);
                return { success: true };
            default:
                console.warn('Unknown action type:', actionType);
                return { success: false, error: 'Unknown action type' };
        }
    }
    
    /**
     * Toggle structure construction enabled/disabled
     * Uses zone's stored_metal for construction (consumed during construction progress)
     */
    purchaseStructure(actionData) {
        console.log('[Engine] purchaseStructure:', { building_id: actionData.building_id, zone_id: actionData.zone_id, enabled: actionData.enabled });
        
        const { building_id, zone_id, enabled } = actionData;
        
        // Accept both building_id (from UI) and structure_id (legacy) for compatibility
        const structureId = building_id || actionData.structure_id;
        
        if (!structureId || !zone_id) {
            return { success: false, error: 'building_id and zone_id required' };
        }
        
        const building = this.buildings && this.findBuilding(structureId);
        if (!building) {
            // Debug: log available building IDs
            const availableIds = this.buildings ? Object.keys(this.buildings).slice(0, 10) : [];
            console.error('[Engine] Building not found:', structureId, 'Available IDs (first 10):', availableIds);
            return { success: false, error: `Building not found: ${structureId}` };
        }
        
        // Ensure zone is properly initialized
        this.ensureZoneInitialized(zone_id);
        
        // Check if building is allowed in the zone
        const zone = this.orbitalMechanics.getZone(zone_id);
        if (zone) {
            const isDysonZone = zone.is_dyson_zone || false;
            const buildingCategory = this.getBuildingCategory(building);
            
            // Mining buildings cannot be built in Dyson zone
            if (isDysonZone && buildingCategory === 'mining') {
                return { success: false, error: 'Mining buildings cannot be built in Dyson zone' };
            }
            
            // For non-Dyson zones, check allowed_orbital_zones
            if (!isDysonZone) {
                const allowedZones = building.allowed_orbital_zones || [];
                if (allowedZones.length > 0 && !allowedZones.includes(zone_id)) {
                    return { success: false, error: `Building ${structureId} is not allowed in zone ${zone_id}` };
                }
            }
        }
        
        // Initialize state if needed
        if (!this.state.enabled_construction) {
            this.state.enabled_construction = [];
        }
        if (!this.state.structure_construction_progress) {
            this.state.structure_construction_progress = {};
        }
        if (!this.state.structure_construction_targets) {
            this.state.structure_construction_targets = {};
        }
        
        // Create the enabled key (zone::building format)
        const enabledKey = `${zone_id}::${structureId}`;
        
        // Toggle enabled state - NO RESOURCE CHECK - buildings start consuming immediately
        if (enabled === undefined || enabled === null) {
            // Toggle if not specified
            const isEnabled = this.state.enabled_construction.includes(enabledKey);
            if (isEnabled) {
                // Disable
                this.state.enabled_construction = this.state.enabled_construction.filter(k => k !== enabledKey);
                // Clear target cost so it recalculates if re-enabled
                if (this.state.structure_construction_targets) {
                    delete this.state.structure_construction_targets[enabledKey];
                }
            } else {
                // Enable - start immediately, no resource check
                this.state.enabled_construction.push(enabledKey);
                // Initialize progress if not already started
                if (!(enabledKey in this.state.structure_construction_progress)) {
                    this.state.structure_construction_progress[enabledKey] = 0.0;
                }
            }
        } else if (enabled) {
            // Enable construction - start immediately, no resource check
            if (!this.state.enabled_construction.includes(enabledKey)) {
                this.state.enabled_construction.push(enabledKey);
            }
            // Initialize progress if not already started
            if (!(enabledKey in this.state.structure_construction_progress)) {
                this.state.structure_construction_progress[enabledKey] = 0.0;
            }
            } else {
                // Disable construction
                this.state.enabled_construction = this.state.enabled_construction.filter(k => k !== enabledKey);
                // Clear target cost so it recalculates if re-enabled
                if (this.state.structure_construction_targets) {
                    delete this.state.structure_construction_targets[enabledKey];
                }
                // Note: Don't remove progress - let it finish if in progress
            }
        
        const finalEnabled = this.state.enabled_construction.includes(enabledKey);
        console.log('[Engine] ✓ Toggle complete:', { enabledKey, enabled: finalEnabled });
        
        return { success: true, building_id: structureId, enabled: finalEnabled };
    }
    
    /**
     * Get building category for zone validation
     */
    getBuildingCategory(building) {
        if (building.power_output_mw) {
            return 'energy';
        } else if (building.mining_rate_multiplier && !building.build_rate_multiplier) {
            return 'mining';
        } else if (building.build_rate_multiplier) {
            return 'factories';
        } else if (building.compute_eflops) {
            return 'computing';
        } else if (building.efficiency !== undefined && building.efficiency < 1.0) {
            return 'omni';
        } else if (building.base_capacity_kg || building.base_delta_v) {
            return 'transport';
        }
        return 'structures';
    }
    
    /**
     * Purchase probe (instant)
     * Uses zone's stored_metal for construction
     */
    purchaseProbe(actionData) {
        const { zone_id, probe_type = 'probe', count = 1 } = actionData;
        const cost = 100;  // 100 kg per probe
        const totalCost = cost * count;
        
        // Ensure zone is properly initialized before checking metal
        this.ensureZoneInitialized(zone_id);
        
        // Check zone's stored_metal (not global metal)
        const zones = this.state.zones || {};
        const zone = zones[zone_id] || {};
        const storedMetal = zone.stored_metal || 0;
        
        if (storedMetal < totalCost) {
            return { success: false, error: 'Insufficient stored metal in zone' };
        }
        
        // Deduct metal from zone's stored_metal
        zones[zone_id].stored_metal = storedMetal - totalCost;
        
        // Add probes
        const probesByZone = this.state.probes_by_zone || {};
        if (!probesByZone[zone_id]) {
            probesByZone[zone_id] = {};
        }
        if (!probesByZone[zone_id][probe_type]) {
            probesByZone[zone_id][probe_type] = 0;
        }
        probesByZone[zone_id][probe_type] += count;
        this.state.probes_by_zone = probesByZone;
        
        // Update zone probe_mass
        const PROBE_MASS = 100; // kg per probe
        zones[zone_id].probe_mass = (zones[zone_id].probe_mass || 0) + (PROBE_MASS * count);
        this.state.zones = zones;
        
        return { success: true };
    }
    
    /**
     * Allocate probes
     */
    allocateProbes(actionData) {
        const { zone_id, allocations } = actionData;
        
        if (!this.state.probe_allocations_by_zone) {
            this.state.probe_allocations_by_zone = {};
        }
        if (!this.state.probe_allocations_by_zone[zone_id]) {
            this.state.probe_allocations_by_zone[zone_id] = {};
        }
        
        // Update allocations (normalize to 0-1)
        for (const key in allocations) {
            this.state.probe_allocations_by_zone[zone_id][key] = Math.max(0, Math.min(1, allocations[key]));
        }
        
        return { success: true };
    }
    
    /**
     * Create transfer
     */
    createTransfer(actionData) {
        const { from_zone, to_zone, resource_type = 'probe', probe_type = 'probe', 
                probe_count, metal_kg, transfer_type = 'one-time', rate } = actionData;
        
        // Handle one-time vs continuous
        if (transfer_type === 'one-time') {
            if (resource_type === 'probe') {
                // Probe transfer
                // Check if enough probes available
                const probesByZone = this.state.probes_by_zone || {};
                const zoneProbes = probesByZone[from_zone] || {};
                const available = zoneProbes[probe_type] || 0;
                
                if (available < probe_count) {
                    return { success: false, error: 'Insufficient probes' };
                }
                
                // Create transfer with current propulsion skill (now returns {success, transfer, error})
                const transferResult = this.transferSystem.createTransfer(
                    this.state, 
                    from_zone, 
                    to_zone, 
                    'probe',
                    probe_type, 
                    probe_count, 
                    this.state.skills,
                    'one-time'
                );
                
                if (!transferResult.success) {
                    return { success: false, error: transferResult.error };
                }
                
                const transfer = transferResult.transfer;
                
                // Remove probes from source zone immediately (at departure)
                zoneProbes[probe_type] = Math.max(0, zoneProbes[probe_type] - probe_count);
                
                // Update zone probe_mass
                const PROBE_MASS = 100; // kg per probe
                const zones = this.state.zones || {};
                if (!zones[from_zone]) {
                    this.ensureZoneInitialized(from_zone);
                }
                zones[from_zone].probe_mass = Math.max(0, (zones[from_zone].probe_mass || 0) - (probe_count * PROBE_MASS));
                
                this.state.probes_by_zone = probesByZone;
                this.state.zones = zones;
                
                // Add transfer to state
                this.state = this.transferSystem.addTransfer(this.state, transfer);
                
                return { success: true, transfer };
            } else if (resource_type === 'metal') {
                // Metal transfer - use source zone's stored_metal
                this.ensureZoneInitialized(from_zone);
                const zones = this.state.zones || {};
                const sourceZone = zones[from_zone] || {};
                const availableMetal = sourceZone.stored_metal || 0;
                
                if (availableMetal < metal_kg) {
                    return { success: false, error: 'Insufficient stored metal in zone' };
                }
                
                // Create transfer with current propulsion skill
                const transferResult = this.transferSystem.createTransfer(
                    this.state, 
                    from_zone, 
                    to_zone, 
                    'metal',
                    'probe', // probe_type not used for metal
                    metal_kg, 
                    this.state.skills,
                    'one-time'
                );
                
                if (!transferResult.success) {
                    return { success: false, error: transferResult.error };
                }
                
                const transfer = transferResult.transfer;
                
                // Remove metal from source zone's stored_metal immediately (at departure)
                zones[from_zone].stored_metal = Math.max(0, availableMetal - metal_kg);
                this.state.zones = zones;
                
                // Add transfer to state
                this.state = this.transferSystem.addTransfer(this.state, transfer);
                
                return { success: true, transfer };
            } else {
                return { success: false, error: 'Invalid resource type' };
            }
        } else {
            // Continuous transfer
            if (resource_type === 'probe') {
                // Rate is percentage of production rate
                const ratePercentage = rate || 0;
                
                if (ratePercentage <= 0 || ratePercentage > 100) {
                    return { success: false, error: 'Invalid rate percentage' };
                }
                
                // Create continuous transfer with current propulsion skill
                const transferResult = this.transferSystem.createTransfer(
                    this.state, 
                    from_zone, 
                    to_zone, 
                    'probe',
                    probe_type, 
                    0, // resource_count not used for continuous
                    this.state.skills,
                    'continuous',
                    ratePercentage
                );
                
                if (!transferResult.success) {
                    return { success: false, error: transferResult.error };
                }
                
                const transfer = transferResult.transfer;
                
                // Add transfer to state
                this.state = this.transferSystem.addTransfer(this.state, transfer);
                
                return { success: true, transfer };
            } else if (resource_type === 'metal') {
                // Rate is kg/day
                const rateKgPerDay = rate || 100e12; // Default 100 GT/day
                
                if (rateKgPerDay <= 0) {
                    return { success: false, error: 'Invalid transfer rate' };
                }
                
                // Create continuous transfer with current propulsion skill
                const transferResult = this.transferSystem.createTransfer(
                    this.state, 
                    from_zone, 
                    to_zone, 
                    'metal',
                    'probe', // probe_type not used for metal
                    0, // resource_count not used for continuous
                    this.state.skills,
                    'continuous',
                    rateKgPerDay
                );
                
                if (!transferResult.success) {
                    return { success: false, error: transferResult.error };
                }
                
                const transfer = transferResult.transfer;
                
                // Add transfer to state
                this.state = this.transferSystem.addTransfer(this.state, transfer);
                
                return { success: true, transfer };
            } else {
                return { success: false, error: 'Invalid resource type' };
            }
        }
    }
    
    /**
     * Update transfer rate (continuous only)
     */
    updateTransfer(actionData) {
        const { transfer_id, rate_percentage } = actionData;
        
        if (this.transferSystem.updateTransferRate(this.state, transfer_id, rate_percentage)) {
            return { success: true };
        }
        
        return { success: false, error: 'Transfer not found or not continuous' };
    }
    
    /**
     * Pause/unpause transfer
     */
    pauseTransfer(actionData) {
        const { transfer_id, paused } = actionData;
        
        if (this.transferSystem.pauseTransfer(this.state, transfer_id, paused)) {
            return { success: true };
        }
        
        return { success: false, error: 'Transfer not found' };
    }
    
    /**
     * Delete transfer
     */
    deleteTransfer(actionData) {
        const { transfer_id } = actionData;
        
        if (this.transferSystem.deleteTransfer(this.state, transfer_id)) {
            return { success: true };
        }
        
        return { success: false, error: 'Transfer not found' };
    }
    
    /**
     * Find building by ID
     */
    findBuilding(buildingId) {
        if (!this.buildings) return null;
        
        // Check direct format first (buildings is object with building IDs as keys)
        // This is what dataLoader.loadBuildings() returns: { "refinery": {...}, "factory": {...}, ... }
        if (this.buildings[buildingId] && typeof this.buildings[buildingId] === 'object') {
            const building = this.buildings[buildingId];
            // Ensure it has an 'id' field
            if (!building.id) {
                building.id = buildingId;
            }
            return building;
        }
        
        // Check nested format (buildings.buildings object)
        if (this.buildings.buildings && this.buildings.buildings[buildingId]) {
            return this.buildings.buildings[buildingId];
        }
        
        // Fallback to old format (search all categories)
        for (const category in this.buildings) {
            const items = this.buildings[category];
            if (Array.isArray(items)) {
                const building = items.find(b => b.id === buildingId);
                if (building) return building;
            }
        }
        
        return null;
    }
    
    /**
     * Get current game state (immutable snapshot)
     * @returns {Object} Game state
     */
    getState() {
        const profiler = typeof self !== 'undefined' && self.performanceProfiler 
            ? self.performanceProfiler 
            : (typeof window !== 'undefined' && window.performanceProfiler ? window.performanceProfiler : null);
        const cloneStart = profiler ? performance.now() : null;
        
        // Return deep copy (immutable)
        const clonedState = JSON.parse(JSON.stringify(this.state));
        
        if (profiler && cloneStart !== null) {
            const cloneTime = performance.now() - cloneStart;
            profiler.recordStateCloneTime(cloneTime);
        }
        
        return clonedState;
    }
    
    /**
     * Load from state
     */
    static async loadFromState(initialState, dataLoader, config) {
        const engine = new GameEngine(initialState, dataLoader, config);
        await engine.initialize();
        return engine;
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameEngine;
}

