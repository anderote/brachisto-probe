/**
 * Research Calculator
 * 
 * Research progress and intelligence (FLOPS) calculations
 * 
 * NOTE: Research progression is now primarily handled by TechTree.
 * This class provides backward compatibility and intelligence calculation.
 */

class ResearchCalculator {
    constructor(dataLoader) {
        this.dataLoader = dataLoader;
        this.researchTrees = null;
        this.techTree = null; // Reference to TechTree if available
        this.GEOMETRIC_SCALING_EXPONENT = Config.STRUCTURE_GEOMETRIC_SCALING_EXPONENT || 3.2;
    }
    
    /**
     * Initialize with research trees
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
     * Calculate intelligence production (FLOPS) from structures and probes
     * @param {Object} state - Game state
     * @param {Object} buildings - Building definitions
     * @param {Object} skills - Current skills
     * @returns {number} Intelligence production in FLOPS
     */
    calculateIntelligenceProduction(state, buildings, skills) {
        let totalFLOPS = 0;
        
        // Intelligence comes from compute structures
        const structuresByZone = state.structures_by_zone || {};
        // Handle both formats: buildings.buildings (nested) or buildings (direct)
        const allBuildings = buildings?.buildings || buildings || {};
        
        for (const zoneId in structuresByZone) {
            const zoneStructures = structuresByZone[zoneId] || {};
            
            for (const [buildingId, building] of Object.entries(allBuildings)) {
                const count = zoneStructures[buildingId] || 0;
                if (count === 0) continue;
                
                // Check if building has compute output
                if (building.compute_eflops) {
                    // New multiplier-based system
                    const baseComputeEFLOPS = building.compute_eflops;
                    const baseComputeFLOPS = baseComputeEFLOPS * 1e18; // Convert EFLOPS to FLOPS
                    
                    // Apply structure performance upgrade factor
                    const perfFactor = state.upgrade_factors?.structure?.compute?.performance || 1.0;
                    
                    // Apply computer skill (geometric mean of sub-skills)
                    const computerSkill = skills.computer?.total || 1.0;
                    
                    // Apply geometric scaling to benefits (same exponent as cost scaling)
                    const geometricFactor = Math.pow(count, this.GEOMETRIC_SCALING_EXPONENT);
                    const effectiveFLOPS = baseComputeFLOPS * geometricFactor * perfFactor * computerSkill;
                    totalFLOPS += effectiveFLOPS;
                } else if (building.effects?.intelligence_flops || building.effects?.intelligence_production_per_second) {
                    // Legacy system fallback
                    const baseFLOPS = building.effects?.intelligence_flops || 
                                     building.effects?.intelligence_production_per_second || 0;
                    const computerSkill = skills.computer?.total || 1.0;
                    // Apply geometric scaling to benefits (same exponent as cost scaling)
                    const geometricFactor = Math.pow(count, this.GEOMETRIC_SCALING_EXPONENT);
                    const effectiveFLOPS = baseFLOPS * geometricFactor * computerSkill;
                    totalFLOPS += effectiveFLOPS;
                }
            }
        }
        
        // Dyson sphere can also produce intelligence (if allocated)
        // This will be calculated in DysonSystem
        
        return totalFLOPS;
    }
    
    /**
     * Update research progress
     * @param {Object} state - Game state
     * @param {number} deltaTime - Time delta in days
     * @param {Object} skills - Current skills
     * @returns {Object} Updated state
     * 
     * NOTE: If TechTree is available, this should be called via the engine's
     * updateResearchWithTechTree method instead. This legacy method is kept
     * for backward compatibility.
     */
    updateResearch(state, deltaTime, skills) {
        // If TechTree is available, delegate to it
        if (this.techTree) {
            const intelligenceRate = this.calculateIntelligenceProduction(state, null, skills);
            if (intelligenceRate <= 0) return state;
            
            const enabledProjects = this.techTree.getEnabledResearchProjects();
            if (enabledProjects.length === 0) return state;
            
            const flopsPerProject = (intelligenceRate * deltaTime) / enabledProjects.length;
            
            for (const project of enabledProjects) {
                this.techTree.addResearchProgress(project.treeId, project.tierId, flopsPerProject, state.time);
            }
            
            // Update state with new research state
            const newState = JSON.parse(JSON.stringify(state));
            newState.tech_tree = this.techTree.exportToState();
            newState.research = this.techTree.researchState;
            return newState;
        }
        
        // Legacy calculation
        const newState = JSON.parse(JSON.stringify(state));  // Deep clone
        const researchState = newState.research || {};
        const intelligenceRate = this.calculateIntelligenceProduction(newState, null, skills);
        
        // Allocate intelligence to enabled research
        if (intelligenceRate <= 0) {
            return newState;  // No intelligence, no research progress
        }
        
        // Find all enabled research projects
        const enabledProjects = [];
        for (const treeId in researchState) {
            const treeState = researchState[treeId];
            for (const tierId in treeState) {
                const tierState = treeState[tierId];
                if (tierState.enabled && tierState.tranches_completed < this.getMaxTranches(treeId, tierId)) {
                    enabledProjects.push({ treeId, tierId, tierState });
                }
            }
        }
        
        if (enabledProjects.length === 0) {
            return newState;  // No enabled research
        }
        
        // Distribute intelligence equally among enabled projects
        const intelligencePerProject = intelligenceRate / enabledProjects.length;
        const flopsPerProject = intelligencePerProject * deltaTime;  // FLOPS * days = total FLOPS
        
        for (const project of enabledProjects) {
            const { treeId, tierId, tierState } = project;
            const tierDef = this.getTierDefinition(treeId, tierId);
            if (!tierDef) continue;
            
            // Calculate FLOPS needed for next tranche
            const tranchesCompleted = tierState.tranches_completed || 0;
            const maxTranches = tierDef.tranches || 10;
            
            if (tranchesCompleted >= maxTranches) continue;  // Already completed
            
            // FLOPS cost per tranche - use intelligence cost only
            // Fallback to old format if new format not available (for migration)
            const flopsPerTranche = tierDef.tranche_cost_intelligence || 
                                   (tierDef.max_research_rate_energy || 1000) * 1000;
            
            // Track research start time if not set
            if (!tierState.research_start_time) {
                tierState.research_start_time = newState.time || 0;
            }
            
            // Add progress
            const currentProgress = tierState.progress || 0;
            const newProgress = currentProgress + flopsPerProject;
            
            // Check if tranche completed
            if (newProgress >= flopsPerTranche) {
                // Complete tranche
                const newTranchesCompleted = Math.min(tranchesCompleted + 1, maxTranches);
                const remainingProgress = newProgress - flopsPerTranche;
                
                researchState[treeId][tierId].tranches_completed = newTranchesCompleted;
                researchState[treeId][tierId].progress = remainingProgress;
                
                // If tier is complete, set completion time for 2x jump calculation
                if (newTranchesCompleted >= maxTranches) {
                    researchState[treeId][tierId].completed = true;
                    researchState[treeId][tierId].completion_time = newState.time || 0;
                }
            } else {
                // Just update progress
                researchState[treeId][tierId].progress = newProgress;
            }
        }
        
        newState.research = researchState;
        return newState;
    }
    
    /**
     * Get tier definition from research trees
     * @param {string} treeId - Research tree ID
     * @param {string} tierId - Tier ID
     * @returns {Object|null} Tier definition
     */
    getTierDefinition(treeId, tierId) {
        if (!this.researchTrees) return null;
        const tree = this.researchTrees[treeId];
        if (!tree || !tree.tiers) return null;
        return tree.tiers.find(t => t.id === tierId) || null;
    }
    
    /**
     * Get maximum tranches for a tier
     * @param {string} treeId - Research tree ID
     * @param {string} tierId - Tier ID
     * @returns {number} Maximum tranches
     */
    getMaxTranches(treeId, tierId) {
        const tierDef = this.getTierDefinition(treeId, tierId);
        return tierDef?.tranches || 10;
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResearchCalculator;
}

