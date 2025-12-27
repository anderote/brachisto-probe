/**
 * Skills Calculator
 * 
 * Computes all skill values from research state
 * Skills inform all downstream calculations (probe properties, structure properties, etc.)
 * 
 * NOTE: This class is now a legacy wrapper. The primary skills system is TechTree.
 * This class is kept for backward compatibility and will delegate to TechTree when available.
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
        skills.thrust = this.calculateThrustSkill(researchState, currentTime);
        skills.locomotion = this.calculateLocomotionSkill(researchState, currentTime);
        skills.manipulation = this.calculateManipulationSkill(researchState, currentTime);
        skills.strength = this.calculateStrengthSkill(researchState, currentTime);
        skills.materials = this.calculateMaterialsSkill(researchState, currentTime);
        
        // Energy skills
        skills.solar_pv = this.calculateSolarPVSkill(researchState, currentTime);
        skills.radiator = this.calculateRadiatorSkill(researchState, currentTime);
        skills.heat_pump = this.calculateHeatPumpSkill(researchState, currentTime);
        skills.battery_density = this.calculateBatteryDensitySkill(researchState, currentTime);
        skills.thermal_efficiency = this.calculateThermalEfficiencySkill(researchState, currentTime);
        skills.energy_converter = this.calculateEnergyConverterSkill(researchState, currentTime);
        
        // Intelligence skills
        skills.cpu = this.calculateCPUSkill(researchState, currentTime);
        skills.gpu = this.calculateGPUSkill(researchState, currentTime);
        skills.interconnect = this.calculateInterconnectSkill(researchState, currentTime);
        skills.io_bandwidth = this.calculateIOBandwidthSkill(researchState, currentTime);
        skills.sensors = this.calculateSensorsSkill(researchState, currentTime);
        skills.learning = this.calculateLearningSkill(researchState, currentTime);
        
        // Production skills
        skills.production = this.calculateProductionSkill(researchState, currentTime);
        skills.recycling = this.calculateRecyclingSkill(researchState, currentTime);
        
        // Legacy/Other skills (for backward compatibility)
        skills.energy_collection = skills.solar_pv;  // Map to solar_pv
        skills.energy_storage = skills.battery_density;  // Map to battery_density
        skills.energy_transport = this.calculateEnergyTransportSkill(researchState, currentTime);
        skills.dyson_construction = this.calculateDysonConstructionSkill(researchState, currentTime);
        
        // ACDS (Autonomous Control and Decision Systems) - defaults to 1.0 for now
        // TODO: Add research tree for ACDS if needed
        skills.acds = this.calculateACDSSkill(researchState, currentTime);
        
        // Robotic skill (maps to manipulation for now)
        skills.robotic = skills.manipulation;
        
        // Computer skills (geometric mean of 4 separate trees)
        const computerSkills = this.calculateComputerSkills(researchState, currentTime);
        skills.computer = computerSkills;
        
        return skills;
    }
    
    /**
     * Get base skill values (before any research)
     * @returns {Object}
     */
    getBaseSkills() {
        return {
            // Dexterity skills
            propulsion: 1.0,      // ISP multiplier (base ISP = 500 seconds)
            thrust: 1.0,          // Thrust multiplier (base = 1000 N per probe)
            locomotion: 1.0,      // Maneuverability multiplier
            manipulation: 1.0,    // Robot arms / dexterity multiplier
            strength: 1.0,        // Actuator torque multiplier (base = 100 N-m per probe)
            materials: 1.0,       // Material strength multiplier
            
            // Energy skills
            solar_pv: 1.0,        // Solar PV efficiency
            radiator: 1.0,        // Radiator efficiency
            heat_pump: 1.0,       // Heat pump efficiency
            battery_density: 1.0, // Battery energy density
            thermal_efficiency: 1.0, // Thermal efficiency
            energy_converter: 1.0, // Direct energy converter efficiency
            
            // Intelligence skills
            cpu: 1.0,             // CPU power
            gpu: 1.0,             // GPU power
            interconnect: 1.0,    // Interconnect bandwidth
            io_bandwidth: 1.0,    // I/O bandwidth
            sensors: 1.0,         // Sensor signal-to-noise
            learning: 1.0,        // Learning architecture
            
            // Production skills
            production: 1.0,      // Production efficiency
            recycling: 0.75,       // Recycling efficiency (75% base)
            
            // Other skills
            energy_collection: 1.0,  // Legacy - maps to solar_pv
            energy_storage: 1.0,      // Legacy - maps to battery_density
            energy_transport: 1.0,    // Energy transport efficiency
            dyson_construction: 1.0,  // Dyson construction efficiency
            acds: 1.0,                // Autonomous Control and Decision Systems
            robotic: 1.0,             // Robotic systems (maps to manipulation)
            
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
     * Calculate ACDS skill (Autonomous Control and Decision Systems)
     * For now, defaults to 1.0 - can be connected to research tree later
     */
    calculateACDSSkill(researchState, currentTime) {
        // TODO: Add research tree for ACDS if needed
        // For now, return base value
        return 1.0;
    }
    
    /**
     * Calculate propulsion skill from propulsion_systems research tree
     */
    calculatePropulsionSkill(researchState, currentTime) {
        const tree = this.researchTrees?.propulsion_systems;
        if (!tree) return 1.0;
        
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'propulsion_systems');
    }
    
    /**
     * Calculate locomotion skill from locomotion_systems research tree
     */
    calculateLocomotionSkill(researchState, currentTime) {
        const tree = this.researchTrees?.locomotion_systems;
        if (!tree) return 1.0;
        
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'locomotion_systems');
    }
    
    /**
     * Calculate robotic skill from robotic_systems research tree
     */
    calculateRoboticSkill(researchState, currentTime) {
        const tree = this.researchTrees?.robotic_systems;
        if (!tree) return 1.0;
        
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'robotic_systems');
    }
    
    /**
     * Calculate production skill from production_efficiency research tree
     */
    calculateProductionSkill(researchState, currentTime) {
        const tree = this.researchTrees?.production_efficiency;
        if (!tree) return 1.0;
        
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'production_efficiency');
    }
    
    /**
     * Calculate recycling skill from recycling_efficiency research tree
     */
    calculateRecyclingSkill(researchState, currentTime) {
        const tree = this.researchTrees?.recycling_efficiency;
        if (!tree) return 0.75;  // Base 75%
        
        const multiplier = this.calculateBonusFromTree(researchState, tree, currentTime, 'recycling_efficiency');
        return 0.75 * multiplier;  // Start from 75%, multiply with research
    }
    
    /**
     * Calculate energy collection skill
     */
    calculateEnergyCollectionSkill(researchState, currentTime) {
        const tree = this.researchTrees?.energy_collection;
        if (!tree) return 1.0;
        
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'energy_collection');
    }
    
    /**
     * Calculate energy storage skill
     */
    calculateEnergyStorageSkill(researchState, currentTime) {
        const tree = this.researchTrees?.energy_storage;
        if (!tree) return 1.0;
        
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'energy_storage');
    }
    
    /**
     * Calculate energy transport skill
     */
    calculateEnergyTransportSkill(researchState, currentTime) {
        const tree = this.researchTrees?.energy_transport;
        if (!tree) return 1.0;
        
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'energy_transport');
    }
    
    /**
     * Calculate Dyson construction skill
     */
    calculateDysonConstructionSkill(researchState, currentTime) {
        const tree = this.researchTrees?.dyson_swarm_construction;
        if (!tree) return 1.0;
        
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'dyson_swarm_construction');
    }
    
    /**
     * Calculate computer skills (4 sub-skills + geometric mean)
     */
    calculateComputerSkills(researchState, currentTime) {
        // Computer systems are now separate trees
        const processingTree = this.researchTrees?.computer_processing;
        const gpuTree = this.researchTrees?.computer_gpu;
        const interconnectTree = this.researchTrees?.computer_interconnect;
        const interfaceTree = this.researchTrees?.computer_interface;
        
        const processing = processingTree ? 
            this.calculateSkillFromTree(researchState, processingTree, currentTime, 1.0, 'computer_processing') : 1.0;
        const gpu = gpuTree ? 
            this.calculateSkillFromTree(researchState, gpuTree, currentTime, 1.0, 'computer_gpu') : 1.0;
        const interconnect = interconnectTree ? 
            this.calculateSkillFromTree(researchState, interconnectTree, currentTime, 1.0, 'computer_interconnect') : 1.0;
        const interface_skill = interfaceTree ? 
            this.calculateSkillFromTree(researchState, interfaceTree, currentTime, 1.0, 'computer_interface') : 1.0;
        
        // Geometric mean of all 4 components
        const total = Math.pow(processing * gpu * interconnect * interface_skill, 0.25);
        
        return {
            processing,
            gpu,
            interconnect,
            interface: interface_skill,
            transmission: interconnect, // Legacy alias
            memory: gpu, // Legacy alias (GPU handles parallel/memory operations)
            total
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
     * @returns {number} Total multiplier (1.0 to ~6.19x when fully researched)
     */
    calculateBonusFromTree(researchState, tree, currentTime, treeId = null) {
        if (!tree || !tree.tiers) return 1.0; // Return 1.0 (no change) instead of 0.0
        
        // Use provided treeId, or try to infer from tree.name
        const lookupKey = treeId || tree.name?.toLowerCase().replace(/\s+/g, '_') || '';
        const treeState = researchState[lookupKey] || {};
        let totalMultiplier = 1.0; // Start at 1.0 for multiplicative compounding
        
        // Default tier multiplier: 1.2x (20% per tier)
        const DEFAULT_TIER_MULTIPLIER = 1.2;
        const DEFAULT_TRANCHES_PER_TIER = 10;
        
        for (const tier of tree.tiers) {
            const tierState = treeState[tier.id];
            if (!tierState || !tierState.enabled) continue;
            
            const tranchesCompleted = tierState.tranches_completed || 0;
            if (tranchesCompleted === 0) continue;
            
            const totalTranches = tier.tranches || DEFAULT_TRANCHES_PER_TIER;
            // Get tier multiplier (default 1.2x = 20% per tier)
            const tierMultiplier = tier.tier_multiplier || DEFAULT_TIER_MULTIPLIER;
            
            if (tranchesCompleted >= totalTranches) {
                // Tier completed: full multiplier (1.2x)
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
    
    
    // New skill calculation methods
    
    calculateThrustSkill(researchState, currentTime) {
        const tree = this.researchTrees?.thrust_systems;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'thrust_systems');
    }
    
    calculateManipulationSkill(researchState, currentTime) {
        // Maps to robotic_systems for now
        const tree = this.researchTrees?.robotic_systems;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'robotic_systems');
    }
    
    calculateStrengthSkill(researchState, currentTime) {
        const tree = this.researchTrees?.actuator_systems;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'actuator_systems');
    }
    
    calculateMaterialsSkill(researchState, currentTime) {
        const tree = this.researchTrees?.materials_science;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'materials_science');
    }
    
    calculateSolarPVSkill(researchState, currentTime) {
        const tree = this.researchTrees?.energy_collection;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'energy_collection');
    }
    
    calculateRadiatorSkill(researchState, currentTime) {
        const tree = this.researchTrees?.thermal_management;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'thermal_management');
    }
    
    calculateHeatPumpSkill(researchState, currentTime) {
        const tree = this.researchTrees?.heat_pump_systems;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'heat_pump_systems');
    }
    
    calculateBatteryDensitySkill(researchState, currentTime) {
        const tree = this.researchTrees?.energy_storage;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'energy_storage');
    }
    
    calculateThermalEfficiencySkill(researchState, currentTime) {
        // Can use thermal_management or separate tree
        const tree = this.researchTrees?.thermal_management;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'thermal_management');
    }
    
    calculateEnergyConverterSkill(researchState, currentTime) {
        const tree = this.researchTrees?.energy_conversion;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'energy_conversion');
    }
    
    calculateCPUSkill(researchState, currentTime) {
        const tree = this.researchTrees?.computer_processing;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'computer_processing');
    }
    
    calculateGPUSkill(researchState, currentTime) {
        const tree = this.researchTrees?.computer_gpu;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'computer_gpu');
    }
    
    calculateInterconnectSkill(researchState, currentTime) {
        const tree = this.researchTrees?.computer_interconnect;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'computer_interconnect');
    }
    
    calculateIOBandwidthSkill(researchState, currentTime) {
        const tree = this.researchTrees?.computer_interface;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'computer_interface');
    }
    
    calculateSensorsSkill(researchState, currentTime) {
        const tree = this.researchTrees?.sensor_systems;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'sensor_systems');
    }
    
    calculateLearningSkill(researchState, currentTime) {
        const tree = this.researchTrees?.machine_learning;
        if (!tree) return 1.0;
        return this.calculateSkillFromTree(researchState, tree, currentTime, 1.0, 'machine_learning');
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SkillsCalculator;
}

