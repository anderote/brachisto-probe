/**
 * Skills Calculator
 * 
 * Computes all skill values from research state
 * Skills inform all downstream calculations (probe properties, structure properties, etc.)
 * 
 * NOTE: This class is now a legacy wrapper. The primary skills system is TechTree.
 * This class is kept for backward compatibility and will delegate to TechTree when available.
 * 
 * Simplified to 12 core skills (4 per category) with 20 tiers each.
 */

class SkillsCalculator {
    constructor(dataLoader) {
        this.dataLoader = dataLoader;
        this.researchTrees = null;
        this.techTree = null; // Reference to TechTree if available
    }
    
    /**
     * Initialize with research trees data
     * @param {Object} researchTrees - Research trees from data loader
     */
    initialize(researchTrees) {
        this.researchTrees = researchTrees;
    }
    
    /**
     * Set TechTree reference for delegation
     * @param {TechTree} techTree - TechTree instance
     */
    setTechTree(techTree) {
        this.techTree = techTree;
    }
    
    /**
     * Calculate all skills from research state
     * @param {Object} researchState - Current research progress state
     * @param {number} currentTime - Current time in days (for compounding)
     * @returns {Object} Complete skills object
     */
    calculateSkills(researchState, currentTime = 0) {
        // If TechTree is available, delegate to it
        if (this.techTree) {
            this.techTree.loadFromState({ research: researchState });
            return this.techTree.getLegacySkills();
        }
        
        // Legacy calculation (kept for backward compatibility)
        if (!this.researchTrees) {
            // Return base skills if research trees not loaded
            return this.getBaseSkills();
        }
        
        const skills = this.getBaseSkills();
        
        // Calculate each skill category from research
        // Dexterity skills
        skills.propulsion = this.calculatePropulsionSkill(researchState, currentTime);
        skills.robotics = this.calculateRoboticsSkill(researchState, currentTime);
        skills.materials = this.calculateMaterialsSkill(researchState, currentTime);
        skills.structures = this.calculateStructuresSkill(researchState, currentTime);
        
        // Energy skills
        skills.generation = this.calculateGenerationSkill(researchState, currentTime);
        skills.storage_density = this.calculateStorageDensitySkill(researchState, currentTime);
        skills.conversion = this.calculateConversionSkill(researchState, currentTime);
        skills.transmission = this.calculateTransmissionSkill(researchState, currentTime);
        
        // Intelligence skills
        skills.architecture = this.calculateArchitectureSkill(researchState, currentTime);
        skills.processor = this.calculateProcessorSkill(researchState, currentTime);
        skills.memory = this.calculateMemorySkill(researchState, currentTime);
        skills.sensors = this.calculateSensorsSkill(researchState, currentTime);
        
        // Legacy aliases for backward compatibility
        skills.thrust = skills.propulsion;
        skills.locomotion = skills.propulsion;
        skills.manipulation = skills.robotics;
        skills.strength = skills.robotics;
        skills.production = skills.structures;
        skills.recycling = skills.structures;
        skills.dyson_construction = skills.structures;
        
        skills.solar_pv = skills.generation;
        skills.pv_efficiency = skills.generation;
        skills.energy_collection = skills.generation;
        skills.battery_density = skills.storage_density;
        skills.energy_storage = skills.storage_density;
        skills.energy_converter = skills.conversion;
        skills.thermal_efficiency = skills.conversion;
        skills.radiator = skills.conversion;
        skills.heat_pump = skills.conversion;
        skills.energy_transport = skills.transmission;
        
        skills.cpu = skills.processor;
        skills.gpu = skills.processor;
        skills.computer_processing = skills.processor;
        skills.computer_gpu = skills.processor;
        skills.interconnect = skills.sensors;
        skills.io_bandwidth = skills.memory;
        skills.computer_interface = skills.memory;
        skills.computer_interconnect = skills.sensors;
        skills.learning = skills.architecture;
        skills.machine_learning = skills.architecture;
        skills.research_rate = skills.architecture;
        skills.research_rate_efficiency = skills.architecture;
        skills.substrate = skills.architecture; // Legacy alias
        skills.sensor_systems = skills.sensors;
        
        skills.robotic = skills.robotics;
        skills.acds = 1.0; // ACDS is computed, not from a tree
        
        // Computer skills object (geometric mean of processor components)
        skills.computer = {
            processing: skills.processor,
            gpu: skills.processor,
            interconnect: skills.sensors,
            interface: skills.memory,
            transmission: skills.sensors,
            memory: skills.memory,
            total: Math.pow(
                skills.processor *
                skills.processor *
                skills.sensors *
                skills.memory,
                0.25
            )
        };
        
        return skills;
    }
    
    /**
     * Get base skill values (before any research)
     * @returns {Object}
     */
    getBaseSkills() {
        return {
            // Dexterity skills
            propulsion: 1.0,
            robotics: 1.0,
            materials: 1.0,
            structures: 1.0,
            
            // Energy skills
            generation: 1.0,
            storage_density: 1.0,
            conversion: 1.0,
            transmission: 1.0,
            
            // Intelligence skills
            architecture: 1.0,
            processor: 1.0,
            memory: 1.0,
            sensors: 1.0,
            
            // Legacy computed skill
            acds: 1.0,
            
            // Computer skills (geometric mean)
            computer: {
                processing: 1.0,
                memory: 1.0,
                interface: 1.0,
                transmission: 1.0,
                total: 1.0
            }
        };
    }
    
    /**
     * Calculate skill value from a research tree
     * @param {Object} researchState - Research state
     * @param {Object} tree - Research tree definition
     * @param {number} currentTime - Current time in days
     * @param {number} baseValue - Base skill value
     * @param {string} treeId - Tree ID (key in research_trees object)
     * @returns {number} Final skill value
     */
    calculateSkillFromTree(researchState, tree, currentTime, baseValue, treeId = null) {
        const multiplier = this.calculateBonusFromTree(researchState, tree, currentTime, treeId);
        return baseValue * multiplier; // Multiplicative instead of additive
    }
    
    /**
     * Calculate bonus from a research tree (compounding per tranche within tiers)
     * @param {Object} researchState - Research state
     * @param {Object} tree - Research tree definition
     * @param {number} currentTime - Current time in days (not used, kept for compatibility)
     * @param {string} treeId - Tree ID (key in research_trees object)
     * @returns {number} Total multiplier (1.0 to ~6.5x when fully researched with 20 tiers)
     */
    calculateBonusFromTree(researchState, tree, currentTime, treeId = null) {
        if (!tree || !tree.tiers) return 1.0; // Return 1.0 (no change) instead of 0.0
        
        // Use provided treeId, or try to infer from tree.name
        const lookupKey = treeId || tree.name?.toLowerCase().replace(/\s+/g, '_') || '';
        const treeState = researchState[lookupKey] || {};
        let totalMultiplier = 1.0; // Start at 1.0 for multiplicative compounding
        
        // Default tier multiplier: 1.1228x per tier (~12.3% per tier)
        // Per-tranche: 1.1228^(1/10) ≈ 1.01162, full tier: 1.1228x
        // Full tree (20 tiers): 1.1228^20 ≈ 10.5x (but with decay, ~6.5x)
        const DEFAULT_TIER_MULTIPLIER = 1.1228;
        const DEFAULT_TRANCHES_PER_TIER = 10;
        
        // Research exponential decay factor: each tier's benefit is multiplied by this
        // At tier 19 (index 18): 0.857^18 ≈ 0.05 (5% of tier 1's benefit)
        const RESEARCH_EXPONENTIAL_DECAY_FACTOR = 0.857;
        
        for (let tierIndex = 0; tierIndex < tree.tiers.length; tierIndex++) {
            const tier = tree.tiers[tierIndex];
            const tierState = treeState[tier.id];
            if (!tierState || !tierState.enabled) continue;
            
            const tranchesCompleted = tierState.tranches_completed || 0;
            if (tranchesCompleted === 0) continue;
            
            const totalTranches = tier.tranches || DEFAULT_TRANCHES_PER_TIER;
            
            // Get base tier multiplier (default 1.1228x = ~12.3% per tier)
            const baseTierMultiplier = tier.tier_multiplier || DEFAULT_TIER_MULTIPLIER;
            
            // Apply exponential decay: higher tiers give less benefit
            // Tier 1 (index 0): full benefit, Tier 19 (index 18): ~5% benefit
            const decayFactor = Math.pow(RESEARCH_EXPONENTIAL_DECAY_FACTOR, tierIndex);
            
            // The benefit portion (multiplier - 1) is decayed, then added back to 1
            const baseBenefit = baseTierMultiplier - 1.0;
            const decayedBenefit = baseBenefit * decayFactor;
            const tierMultiplier = 1.0 + decayedBenefit;
            
            if (tranchesCompleted >= totalTranches) {
                // Tier completed: full multiplier
                totalMultiplier *= tierMultiplier;
            } else {
                // Tier in progress: compound per tranche
                // Each tranche gives: tierMultiplier^(1/totalTranches)
                // So N tranches give: tierMultiplier^(N/totalTranches)
                const perTrancheMultiplier = Math.pow(tierMultiplier, 1.0 / totalTranches);
                const partialMultiplier = Math.pow(perTrancheMultiplier, tranchesCompleted);
                totalMultiplier *= partialMultiplier;
            }
        }
        
        return totalMultiplier;
    }
    
    // ========================================
    // SKILL CALCULATION METHODS (12 skills)
    // ========================================
    
    calculatePropulsionSkill(researchState, currentTime) {
        const tree = this.researchTrees?.propulsion;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'propulsion');
    }
    
    calculateRoboticsSkill(researchState, currentTime) {
        const tree = this.researchTrees?.robotics;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'robotics');
    }
    
    calculateMaterialsSkill(researchState, currentTime) {
        const tree = this.researchTrees?.materials;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'materials');
    }
    
    calculateStructuresSkill(researchState, currentTime) {
        const tree = this.researchTrees?.structures;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'structures');
    }
    
    calculateGenerationSkill(researchState, currentTime) {
        const tree = this.researchTrees?.generation;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'generation');
    }
    
    calculateStorageDensitySkill(researchState, currentTime) {
        const tree = this.researchTrees?.storage_density;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'storage_density');
    }
    
    calculateConversionSkill(researchState, currentTime) {
        const tree = this.researchTrees?.conversion;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'conversion');
    }
    
    calculateTransmissionSkill(researchState, currentTime) {
        const tree = this.researchTrees?.transmission;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'transmission');
    }
    
    calculateArchitectureSkill(researchState, currentTime) {
        const tree = this.researchTrees?.architecture;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'architecture');
    }
    
    calculateProcessorSkill(researchState, currentTime) {
        const tree = this.researchTrees?.processor;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'processor');
    }
    
    calculateMemorySkill(researchState, currentTime) {
        const tree = this.researchTrees?.memory;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'memory');
    }
    
    calculateSensorsSkill(researchState, currentTime) {
        const tree = this.researchTrees?.sensors;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'sensors');
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SkillsCalculator;
}
