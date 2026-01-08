/**
 * Physics Bridge
 *
 * Integrates the new physics-first technology system with the legacy skill system.
 * Provides:
 * 1. Loading and caching of physics-based tech trees
 * 2. Mapping between physics values (ISP, Tesla, W/kg) and legacy multipliers
 * 3. Cross-effect calculations between technology trees
 * 4. UI-ready formatted strings with physics values
 *
 * This is a transitional layer - eventually the physics system will be primary.
 */

class PhysicsBridge {
    constructor() {
        // Unified physics calculator (uses TechPhysics)
        this.techPhysics = null;

        // Physics calculators for each tree (legacy, kept for compatibility)
        this.propulsionPhysics = null;
        this.electromagneticsPhysics = null;
        this.thermalPhysics = null;
        this.materialsPhysics = null;
        this.powerPhysics = null;
        this.autonomyPhysics = null;

        // Loaded tech tree data
        this.techTrees = {};

        // Current research state (tier levels for each tree)
        this.currentTiers = {
            propulsion: 1,
            electromagnetics: 1,
            thermal: 1,
            materials: 1,
            power: 1,
            autonomy: 1
        };

        // Cross-effects cache (recalculated when tiers change)
        this.crossEffects = {};

        // Reference values for legacy compatibility
        this.LEGACY_REFERENCE = {
            propulsion_isp: 300,      // ISP that maps to 1.0 multiplier
            em_b_field: 2,            // Tesla that maps to 1.0
            thermal_rejection: 500,   // W/m² that maps to 1.0
            materials_factor: 1.0,    // Mass factor at 1.0
            power_density: 100,       // W/kg that maps to 1.0
            autonomy_penalty: 0.005   // Crowding penalty at 1.0
        };
    }

    /**
     * Initialize the physics bridge
     * Loads all physics calculators and tech tree data
     */
    async initialize() {
        // Initialize unified physics calculator (preferred)
        if (typeof TechPhysics !== 'undefined') {
            this.techPhysics = new TechPhysics();
            await this.techPhysics.loadAllTrees();
            // Copy loaded trees to local reference
            this.techTrees = this.techPhysics.trees;
        }

        // Initialize legacy propulsion physics if available
        if (typeof PropulsionPhysics !== 'undefined') {
            this.propulsionPhysics = new PropulsionPhysics();
        }

        // Load additional tech tree data if not loaded via TechPhysics
        if (Object.keys(this.techTrees).filter(k => this.techTrees[k]).length === 0) {
            await this.loadTechTrees();
        }

        console.log('PhysicsBridge initialized with', Object.keys(this.techTrees).filter(k => this.techTrees[k]).length, 'tech trees');
    }

    /**
     * Load tech tree JSON files
     */
    async loadTechTrees() {
        const trees = ['propulsion', 'electromagnetics', 'thermal', 'materials', 'power', 'autonomy'];

        for (const tree of trees) {
            try {
                const response = await fetch(`/game_data/tech_trees/${tree}.json`);
                if (response.ok) {
                    this.techTrees[tree] = await response.json();

                    // Pass data to physics calculator if available
                    if (tree === 'propulsion' && this.propulsionPhysics) {
                        this.propulsionPhysics.loadTierData(this.techTrees[tree]);
                    }
                }
            } catch (error) {
                console.warn(`Failed to load ${tree} tech tree:`, error);
            }
        }
    }

    /**
     * Update current tier from research state
     * Maps legacy research progress to physics tier
     *
     * @param {string} treeName - Name of the tech tree
     * @param {Object} researchState - Legacy research state object
     */
    updateTierFromResearch(treeName, researchState) {
        const treeData = this.techTrees[treeName];
        if (!treeData || !treeData.tiers) return;

        const treeState = researchState[treeName] || {};

        // Find highest completed tier
        let highestTier = 1;
        for (const tier of treeData.tiers) {
            const tierState = treeState[tier.id];
            if (tierState && tierState.enabled) {
                const totalTranches = tier.research?.tranches || 10;
                const completed = tierState.tranches_completed || 0;
                if (completed >= totalTranches) {
                    highestTier = Math.max(highestTier, tier.tier);
                } else if (completed > 0) {
                    // Partial progress - interpolate
                    const progress = completed / totalTranches;
                    highestTier = Math.max(highestTier, tier.tier - 1 + progress);
                }
            }
        }

        this.currentTiers[treeName] = highestTier;

        // Also update TechPhysics if available
        if (this.techPhysics) {
            this.techPhysics.setTier(treeName, Math.floor(highestTier));
        }

        this.updateCrossEffects();
    }

    /**
     * Update all tiers from a full game state
     * @param {Object} gameState - Full game state object
     */
    updateFromGameState(gameState) {
        if (!gameState) return;

        const researchState = gameState.tech_tree?.research_state || gameState.research || {};

        // Update each physics tree based on related legacy trees
        const treeMapping = {
            propulsion: ['propulsion', 'propulsion_systems'],
            electromagnetics: ['transmission', 'conversion'],
            thermal: ['radiator', 'heat_pump'],
            materials: ['materials', 'materials_science', 'structures'],
            power: ['generation', 'storage_density', 'energy_collection', 'solar_pv'],
            autonomy: ['architecture', 'processor', 'memory', 'sensors', 'robotics']
        };

        for (const [physicsTree, legacyTrees] of Object.entries(treeMapping)) {
            let totalProgress = 0;
            let treeCount = 0;

            for (const legacyTree of legacyTrees) {
                const treeState = researchState[legacyTree];
                if (treeState) {
                    let completedTiers = 0;
                    for (const [tierId, tierState] of Object.entries(treeState)) {
                        if (tierState.tranches_completed >= 10) {
                            completedTiers++;
                        }
                    }
                    totalProgress += completedTiers;
                    treeCount++;
                }
            }

            const avgTier = treeCount > 0 ? Math.max(1, Math.floor(totalProgress / Math.max(1, treeCount)) + 1) : 1;
            this.currentTiers[physicsTree] = avgTier;

            if (this.techPhysics) {
                this.techPhysics.setTier(physicsTree, avgTier);
            }
        }

        this.updateCrossEffects();
    }

    /**
     * Recalculate cross-effects between all tech trees
     */
    updateCrossEffects() {
        // Use TechPhysics if available for accurate cross-effects
        if (this.techPhysics) {
            this.crossEffects = this.techPhysics.getCrossEffects();
        } else {
            this.crossEffects = {
                // Materials affects mass ratio for propulsion
                materials_factor: this.getMaterialsFactor(),

                // Thermal affects nuclear rocket performance
                thermal_factor: this.getThermalFactor(),

                // Electromagnetics affects electric propulsion efficiency
                em_tier: this.currentTiers.electromagnetics || 1,

                // Power affects electric propulsion thrust
                power_available: this.getPowerFactor()
            };
        }
    }

    /**
     * Get materials mass reduction factor
     * Lower is better (1.0 = baseline, 0.5 = 50% mass reduction)
     */
    getMaterialsFactor() {
        // Use TechPhysics if available
        if (this.techPhysics) {
            return this.techPhysics.getMaterialsMassFactor();
        }

        const tier = this.currentTiers.materials || 1;

        // Approximate from design document
        const factors = {
            1: 1.0,    // Steel
            2: 0.85,   // Aluminum
            3: 0.75,   // Titanium
            4: 0.50,   // CFRP
            5: 0.30,   // CNT
            6: 0.20,   // Graphene
            7: 0.18,   // BNNT
            8: 0.12,   // Diamond nanothreads
            9: 0.10,   // Metallic hydrogen
            10: 0.08,  // APM
            11: 0.05,  // Metamaterials
            12: 0.02,  // Strange matter
            13: 0.01   // Exotic matter
        };

        return factors[Math.floor(tier)] || 1.0;
    }

    /**
     * Get thermal management factor
     * Higher is better (1.0 = baseline)
     */
    getThermalFactor() {
        // Use TechPhysics if available
        if (this.techPhysics) {
            return this.techPhysics.getThermalCapacityFactor();
        }

        const tier = this.currentTiers.thermal || 1;

        // Approximate - each tier roughly doubles heat rejection capability
        return Math.pow(1.5, tier - 1);
    }

    /**
     * Get power availability factor
     * Higher is better (1.0 = baseline)
     */
    getPowerFactor() {
        // Use TechPhysics if available
        if (this.techPhysics) {
            return this.techPhysics.getPowerDensityFactor();
        }

        const tier = this.currentTiers.power || 1;

        // Based on W/kg progression in design doc
        const powerDensities = {
            1: 50,      // Silicon PV
            2: 150,     // GaAs
            3: 300,     // CSP
            4: 500,     // Perovskite
            5: 10,      // RTG (low power density but solar-independent)
            6: 50,      // Kilopower
            7: 100,     // Fission surface
            8: 1000,    // Fission fragment
            9: 500,     // D-T Fusion
            10: 2000,   // D-He3
            11: 5000,   // p-B11
            12: 10000,  // Antimatter
            13: 100000, // ZPE
            14: 1000000 // Kugelblitz
        };

        return (powerDensities[Math.floor(tier)] || 50) / 100;
    }

    /**
     * Get propulsion delta-v capacity for current tier
     * @returns {Object} Delta-v information including physics values
     */
    getPropulsionCapacity() {
        // Use TechPhysics if available
        if (this.techPhysics) {
            return this.techPhysics.getProbeDeltaV();
        }

        if (this.propulsionPhysics) {
            const tier = Math.floor(this.currentTiers.propulsion || 1);
            return this.propulsionPhysics.calculateProbeDeltaV(tier, this.crossEffects);
        }

        return {
            deltaV_km_s: 7.5,
            isp_seconds: 230,
            display: '230s ISP [7.5 km/s probe Δv]'
        };
    }

    /**
     * Get formatted display string for propulsion
     * Format: "380s ISP (3.73 km/s exhaust) [10.8 km/s probe Δv]"
     */
    getPropulsionDisplay() {
        // Use TechPhysics if available
        if (this.techPhysics) {
            return this.techPhysics.formatForDisplay('propulsion');
        }

        if (this.propulsionPhysics) {
            const tier = Math.floor(this.currentTiers.propulsion || 1);
            return this.propulsionPhysics.formatForDisplay(tier, this.crossEffects);
        }

        return '230s ISP [7.5 km/s probe Δv]';
    }

    /**
     * Convert physics values to legacy skill multiplier
     * For backward compatibility with existing game systems
     *
     * @param {string} treeName - Tech tree name
     * @returns {number} Legacy multiplier (1.0 = baseline)
     */
    getLegacyMultiplier(treeName) {
        switch (treeName) {
            case 'propulsion': {
                const capacity = this.getPropulsionCapacity();
                if (capacity.isp_seconds) {
                    return capacity.isp_seconds / this.LEGACY_REFERENCE.propulsion_isp;
                }
                // For exotic drives, use delta-v ratio
                return capacity.deltaV_km_s / 7.5;
            }

            case 'electromagnetics': {
                // B-field progression
                const tier = this.currentTiers.electromagnetics || 1;
                const bFields = [1.5, 2, 10, 20, 15, 25, 30, 40, 40, 50, 100, 1000];
                const bField = bFields[Math.min(tier - 1, bFields.length - 1)];
                return bField / this.LEGACY_REFERENCE.em_b_field;
            }

            case 'thermal': {
                return this.getThermalFactor();
            }

            case 'materials': {
                // Inverted - lower mass factor = higher multiplier
                const factor = this.getMaterialsFactor();
                return 1 / factor;
            }

            case 'power': {
                return this.getPowerFactor();
            }

            case 'autonomy': {
                const tier = this.currentTiers.autonomy || 1;
                const penalties = [0.5, 0.4, 0.3, 0.2, 0.15, 0.10, 0.07, 0.05, 0.03, 0.02, 0.01, 0.005, 0.001];
                const penalty = penalties[Math.min(tier - 1, penalties.length - 1)] / 100;
                return this.LEGACY_REFERENCE.autonomy_penalty / penalty;
            }

            default:
                return 1.0;
        }
    }

    /**
     * Get all physics values for UI display
     * @returns {Object} All current physics values by tree
     */
    getAllPhysicsValues() {
        return {
            propulsion: this.getPropulsionCapacity(),
            electromagnetics: {
                tier: this.currentTiers.electromagnetics,
                legacy_multiplier: this.getLegacyMultiplier('electromagnetics')
            },
            thermal: {
                tier: this.currentTiers.thermal,
                factor: this.getThermalFactor(),
                legacy_multiplier: this.getLegacyMultiplier('thermal')
            },
            materials: {
                tier: this.currentTiers.materials,
                mass_factor: this.getMaterialsFactor(),
                legacy_multiplier: this.getLegacyMultiplier('materials')
            },
            power: {
                tier: this.currentTiers.power,
                factor: this.getPowerFactor(),
                legacy_multiplier: this.getLegacyMultiplier('power')
            },
            autonomy: {
                tier: this.currentTiers.autonomy,
                legacy_multiplier: this.getLegacyMultiplier('autonomy')
            }
        };
    }

    /**
     * Map new 6-tree system to legacy 12-skill system
     * @returns {Object} Legacy skills object
     */
    mapToLegacySkills() {
        // Use TechPhysics if available
        if (this.techPhysics) {
            return this.techPhysics.getLegacySkills();
        }

        const propMult = this.getLegacyMultiplier('propulsion');
        const emMult = this.getLegacyMultiplier('electromagnetics');
        const thermMult = this.getLegacyMultiplier('thermal');
        const matMult = this.getLegacyMultiplier('materials');
        const powMult = this.getLegacyMultiplier('power');
        const autoMult = this.getLegacyMultiplier('autonomy');

        return {
            // Dexterity - maps from propulsion, materials, thermal
            propulsion: propMult,
            robotics: (emMult + matMult) / 2,  // Robotics benefits from EM and materials
            materials: matMult,
            structures: (matMult + thermMult) / 2,  // Structures need materials and thermal

            // Energy - maps from power, thermal
            generation: powMult,
            storage_density: (powMult + emMult) / 2,  // Batteries need power and EM tech
            conversion: (thermMult + powMult) / 2,  // Conversion is thermal + power
            transmission: emMult,  // Transmission is electromagnetic

            // Intelligence - maps from autonomy (mostly)
            architecture: autoMult,
            processor: autoMult,
            memory: autoMult,
            sensors: (autoMult + emMult) / 2  // Sensors use EM tech too
        };
    }

    /**
     * Get tier information for display
     * @param {string} treeName - Tech tree name
     * @param {number} tier - Tier number
     * @returns {Object|null} Tier information
     */
    getTierInfo(treeName, tier) {
        const tree = this.techTrees[treeName];
        if (!tree || !tree.tiers) return null;
        return tree.tiers.find(t => t.tier === tier);
    }

    /**
     * Get current tier name and description
     * @param {string} treeName - Tech tree name
     * @returns {Object} Current tier info
     */
    getCurrentTierInfo(treeName) {
        const tier = Math.floor(this.currentTiers[treeName] || 1);
        const info = this.getTierInfo(treeName, tier);

        if (!info) {
            return {
                tier: tier,
                name: 'Unknown',
                description: ''
            };
        }

        return {
            tier: tier,
            id: info.id,
            name: info.name,
            description: info.description,
            physics: info.physics,
            historical_reference: info.historical_reference
        };
    }

    /**
     * Get research cost for next tier
     * @param {string} treeName - Tech tree name
     * @returns {Object} Cost information
     */
    getNextTierCost(treeName) {
        const currentTier = Math.floor(this.currentTiers[treeName] || 1);
        const nextTierInfo = this.getTierInfo(treeName, currentTier + 1);

        if (!nextTierInfo || !nextTierInfo.research) {
            return { total: Infinity, per_tranche: Infinity, tranches: 0 };
        }

        return {
            total: nextTierInfo.research.base_cost_eflop_days,
            per_tranche: nextTierInfo.research.cost_per_tranche,
            tranches: nextTierInfo.research.tranches
        };
    }

    /**
     * Validate that physics calculations match expected values
     * For testing and debugging
     */
    validatePhysics() {
        const results = [];

        // Test propulsion physics
        if (this.propulsionPhysics) {
            results.push({
                tree: 'propulsion',
                tests: this.propulsionPhysics.validateCalculations()
            });
        }

        return results;
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PhysicsBridge;
}

// Global instance for browser
if (typeof window !== 'undefined') {
    window.PhysicsBridge = PhysicsBridge;
}
