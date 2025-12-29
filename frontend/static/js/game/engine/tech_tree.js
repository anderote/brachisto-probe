/**
 * TechTree - Central Research and Skills System
 * 
 * Manages all research trees organized under three categories:
 * - Dexterity (9 trees)
 * - Intelligence (7 trees)
 * - Energy (7 trees)
 * 
 * Each tree has 10 tiers with tranche-based progression.
 * Category factors are calculated as geometric means of tree upgrade factors.
 */

class TechTree {
    constructor() {
        // Category data from research_trees.json
        this.categories = {
            dexterity: { name: 'Dexterity', trees: [] },
            intelligence: { name: 'Intelligence', trees: [] },
            energy: { name: 'Energy', trees: [] }
        };
        
        // Research state: treeId -> { tierId -> { tranches_completed, progress, enabled, ... } }
        this.researchState = {};
        
        // Cached skill values (updated when research changes)
        this.skillsCache = {};
        
        // Cached category factors
        this.categoryFactors = {
            dexterity: 1.0,
            intelligence: 1.0,
            energy: 1.0
        };
        
        // Tree lookup by ID for fast access
        this.treeLookup = {};
        
        // Skill definitions reference
        this.skillDefinitions = typeof SKILL_DEFINITIONS !== 'undefined' ? SKILL_DEFINITIONS : {};
        this.treeToSkill = typeof TREE_TO_SKILL !== 'undefined' ? TREE_TO_SKILL : {};
        
        // Default tier multiplier: 1.1228x per tier (~12.3% increase, compounding across 10 tranches)
        // Per-tranche: 1.1228^(1/10) ≈ 1.01162, full tier: 1.1228x
        // Full tree (10 tiers): 1.1228^10 ≈ 3.18x
        // At 8/10 tiers with all skills maxed: mass driver muzzle velocity ≈ 45 km/s
        this.DEFAULT_TIER_MULTIPLIER = 1.1228;
        
        // Number of tranches per tier
        this.TRANCHES_PER_TIER = 10;
        
        // Research exponential decay factor: each tier's benefit is multiplied by this
        // At tier 9 (index 8): 0.857^8 ≈ 0.30 (30% of tier 1's benefit)
        // This creates diminishing returns for deep research in a single tree
        // Default value - can be overridden by economic_rules.json
        this.RESEARCH_EXPONENTIAL_DECAY_FACTOR = 0.857;
    }
    
    /**
     * Initialize with economic rules
     * @param {Object} economicRules - Economic rules from game_data/economic_rules.json
     */
    initializeEconomicRules(economicRules) {
        if (!economicRules) return;
        
        // Load research exponential decay factor
        if (economicRules.research?.exponential_decay_factor !== undefined) {
            this.RESEARCH_EXPONENTIAL_DECAY_FACTOR = economicRules.research.exponential_decay_factor;
        }
    }
    
    /**
     * Initialize from research_trees.json categories data
     * @param {Object} categoriesData - The 'categories' object from research_trees.json
     */
    initialize(categoriesData) {
        if (!categoriesData) {
            console.warn('TechTree.initialize: No categories data provided');
            return;
        }
        
        // Load each category
        for (const [categoryId, categoryData] of Object.entries(categoriesData)) {
            if (!this.categories[categoryId]) {
                console.warn(`TechTree.initialize: Unknown category ${categoryId}`);
                continue;
            }
            
            this.categories[categoryId].name = categoryData.name || categoryId;
            this.categories[categoryId].trees = categoryData.trees || [];
            
            // Build tree lookup and initialize research state
            for (const tree of this.categories[categoryId].trees) {
                this.treeLookup[tree.id] = {
                    ...tree,
                    category: categoryId
                };
                
                // Initialize research state for this tree if not exists
                if (!this.researchState[tree.id]) {
                    this.researchState[tree.id] = {};
                    
                    // Initialize each tier
                    for (let i = 0; i < tree.tiers.length; i++) {
                        const tier = tree.tiers[i];
                        this.researchState[tree.id][tier.id] = {
                            tranches_completed: 0,
                            progress: 0,
                            enabled: i === 0, // First tier is enabled by default
                            completed: false,
                            research_start_time: null,
                            completion_time: null
                        };
                    }
                }
            }
        }
        
        // Update caches
        this.updateSkillsCache();
        this.updateCategoryFactors();
    }
    
    /**
     * Initialize from flat research_trees data (legacy format)
     * @param {Object} researchTreesData - The flat 'research_trees' object
     */
    initializeFromFlat(researchTreesData) {
        if (!researchTreesData) return;
        
        // Map trees to categories using skill definitions
        for (const [treeId, treeData] of Object.entries(researchTreesData)) {
            const skillName = this.treeToSkill[treeId];
            const skillDef = skillName ? this.skillDefinitions[skillName] : null;
            const category = skillDef?.category || 'dexterity';
            
            const treeWithId = { id: treeId, ...treeData };
            this.treeLookup[treeId] = { ...treeWithId, category };
            
            // Add to category if not already there
            if (!this.categories[category].trees.find(t => t.id === treeId)) {
                this.categories[category].trees.push(treeWithId);
            }
            
            // Initialize research state
            if (!this.researchState[treeId]) {
                this.researchState[treeId] = {};
                for (let i = 0; i < (treeData.tiers?.length || 0); i++) {
                    const tier = treeData.tiers[i];
                    this.researchState[treeId][tier.id] = {
                        tranches_completed: 0,
                        progress: 0,
                        enabled: i === 0,
                        completed: false,
                        research_start_time: null,
                        completion_time: null
                    };
                }
            }
        }
        
        this.updateSkillsCache();
        this.updateCategoryFactors();
    }
    
    // ========================================
    // SKILL QUERYING
    // ========================================
    
    /**
     * Get single skill value
     * @param {string} skillName - Skill name
     * @returns {number} Skill value (upgrade factor)
     */
    getSkillValue(skillName) {
        // Check cache first
        if (this.skillsCache[skillName] !== undefined) {
            return this.skillsCache[skillName];
        }
        
        // Calculate from tree
        const skillDef = this.skillDefinitions[skillName];
        if (!skillDef) {
            // Check for alias
            const alias = typeof SKILL_ALIASES !== 'undefined' ? SKILL_ALIASES[skillName] : null;
            if (alias) {
                return this.getSkillValue(alias);
            }
            return 1.0;
        }
        
        const treeId = skillDef.treeId;
        const baseValue = skillDef.baseValue || 1.0;
        const factor = this.getTreeUpgradeFactor(treeId);
        
        return baseValue * factor;
    }
    
    /**
     * Get multiple skills with metadata
     * @param {Array<string>} skillNames - Array of skill names
     * @returns {Object} { skillName: { name, displayName, value, treeId, category } }
     */
    getSkills(skillNames) {
        const result = {};
        
        for (const skillName of skillNames) {
            const skillDef = this.skillDefinitions[skillName];
            if (!skillDef) continue;
            
            result[skillName] = {
                name: skillName,
                displayName: skillDef.displayName,
                value: this.getSkillValue(skillName),
                treeId: skillDef.treeId,
                category: skillDef.category,
                description: skillDef.description,
                unit: skillDef.unit
            };
        }
        
        return result;
    }
    
    /**
     * Get all skills
     * @returns {Object} All skills with metadata
     */
    getAllSkills() {
        const allNames = typeof ALL_SKILL_NAMES !== 'undefined' ? ALL_SKILL_NAMES : Object.keys(this.skillDefinitions);
        return this.getSkills(allNames);
    }
    
    /**
     * Get skills by category
     * @param {string} category - Category name ('dexterity', 'intelligence', 'energy')
     * @returns {Object} Skills in that category with metadata
     */
    getSkillsByCategory(category) {
        const skillsInCategory = typeof SKILLS_BY_CATEGORY !== 'undefined' 
            ? SKILLS_BY_CATEGORY[category] 
            : Object.entries(this.skillDefinitions)
                .filter(([_, def]) => def.category === category)
                .map(([name, _]) => name);
        
        return this.getSkills(skillsInCategory);
    }
    
    // ========================================
    // CATEGORY FACTORS
    // ========================================
    
    /**
     * Calculate category factor (geometric mean of all tree factors in category)
     * @param {string} category - Category name
     * @returns {number} Category factor
     */
    getCategoryFactor(category) {
        const trees = this.categories[category]?.trees || [];
        if (trees.length === 0) return 1.0;
        
        const factors = trees.map(tree => this.getTreeUpgradeFactor(tree.id));
        
        // Geometric mean: (f1 * f2 * ... * fn)^(1/n)
        const product = factors.reduce((p, f) => p * f, 1.0);
        return Math.pow(product, 1.0 / factors.length);
    }
    
    /**
     * Get all category factors
     * @returns {Object} { dexterity, intelligence, energy }
     */
    getAllCategoryFactors() {
        return {
            dexterity: this.getCategoryFactor('dexterity'),
            intelligence: this.getCategoryFactor('intelligence'),
            energy: this.getCategoryFactor('energy')
        };
    }
    
    /**
     * Update cached category factors
     */
    updateCategoryFactors() {
        this.categoryFactors = this.getAllCategoryFactors();
    }
    
    // ========================================
    // TREE OPERATIONS
    // ========================================
    
    /**
     * Get upgrade factor for a single tree
     * @param {string} treeId - Research tree ID
     * @returns {number} Upgrade factor (1.0 to ~3.18x when fully researched)
     */
    getTreeUpgradeFactor(treeId) {
        const tree = this.treeLookup[treeId];
        if (!tree || !tree.tiers) return 1.0;
        
        const treeState = this.researchState[treeId] || {};
        let factor = 1.0;
        
        for (let tierIndex = 0; tierIndex < tree.tiers.length; tierIndex++) {
            const tier = tree.tiers[tierIndex];
            const tierState = treeState[tier.id];
            if (!tierState) continue;
            
            const tranchesCompleted = tierState.tranches_completed || 0;
            const totalTranches = tier.tranches || this.TRANCHES_PER_TIER;
            
            // Get tier multiplier (default 1.1228x = ~12.3% per tier)
            const baseTierMultiplier = tier.tier_multiplier || this.DEFAULT_TIER_MULTIPLIER;
            
            // Apply exponential decay: higher tiers give less benefit
            // Tier 1 (index 0): full benefit, Tier 9 (index 8): ~30% benefit
            const decayFactor = Math.pow(this.RESEARCH_EXPONENTIAL_DECAY_FACTOR, tierIndex);
            
            // The benefit portion (multiplier - 1) is decayed, then added back to 1
            // e.g., if baseTierMultiplier = 1.1228, benefit = 0.1228
            // At tier 1: decayedBenefit = 0.1228 * 1.0 = 0.1228, tierMultiplier = 1.1228
            // At tier 9: decayedBenefit = 0.1228 * 0.30 = 0.0368, tierMultiplier = 1.0368
            const baseBenefit = baseTierMultiplier - 1.0;
            const decayedBenefit = baseBenefit * decayFactor;
            const tierMultiplier = 1.0 + decayedBenefit;
            
            if (tranchesCompleted >= totalTranches) {
                // Tier complete: full multiplier
                factor *= tierMultiplier;
            } else if (tranchesCompleted > 0) {
                // Tier in progress: compound per tranche
                // Each tranche gives: tierMultiplier^(1/totalTranches)
                // So N tranches give: tierMultiplier^(N/totalTranches)
                const perTrancheMultiplier = Math.pow(tierMultiplier, 1.0 / totalTranches);
                const partialMultiplier = Math.pow(perTrancheMultiplier, tranchesCompleted);
                factor *= partialMultiplier;
            }
            // If 0 tranches completed, factor stays 1.0 for this tier
        }
        
        return factor;
    }
    
    /**
     * Get tree info
     * @param {string} treeId - Tree ID
     * @returns {Object|null} Tree definition with category
     */
    getTree(treeId) {
        return this.treeLookup[treeId] || null;
    }
    
    /**
     * Get all trees in a category
     * @param {string} category - Category name
     * @returns {Array} Array of tree definitions
     */
    getTreesInCategory(category) {
        return this.categories[category]?.trees || [];
    }
    
    /**
     * Get tier progress
     * @param {string} treeId - Tree ID
     * @param {string} tierId - Tier ID
     * @returns {Object} { tranches_completed, total_tranches, progress_pct, enabled, completed }
     */
    getTierProgress(treeId, tierId) {
        const tree = this.treeLookup[treeId];
        const tierDef = tree?.tiers?.find(t => t.id === tierId);
        const tierState = this.researchState[treeId]?.[tierId];
        
        if (!tierDef || !tierState) {
            return {
                tranches_completed: 0,
                total_tranches: this.TRANCHES_PER_TIER,
                progress_pct: 0,
                enabled: false,
                completed: false
            };
        }
        
        const totalTranches = tierDef.tranches || this.TRANCHES_PER_TIER;
        const tranchesCompleted = tierState.tranches_completed || 0;
        
        return {
            tranches_completed: tranchesCompleted,
            total_tranches: totalTranches,
            progress_pct: (tranchesCompleted / totalTranches) * 100,
            enabled: tierState.enabled || false,
            completed: tranchesCompleted >= totalTranches
        };
    }
    
    /**
     * Get all tiers for a tree with their progress
     * @param {string} treeId - Tree ID
     * @returns {Array} Array of tier progress objects
     */
    getTreeProgress(treeId) {
        const tree = this.treeLookup[treeId];
        if (!tree || !tree.tiers) return [];
        
        return tree.tiers.map(tier => ({
            id: tier.id,
            name: tier.name,
            description: tier.description,
            ...this.getTierProgress(treeId, tier.id)
        }));
    }
    
    // ========================================
    // RESEARCH PROGRESSION
    // ========================================
    
    /**
     * Enable a tier for research
     * @param {string} treeId - Tree ID
     * @param {string} tierId - Tier ID
     */
    enableTier(treeId, tierId) {
        if (!this.researchState[treeId]) {
            this.researchState[treeId] = {};
        }
        if (!this.researchState[treeId][tierId]) {
            this.researchState[treeId][tierId] = {
                tranches_completed: 0,
                progress: 0,
                enabled: false,
                completed: false
            };
        }
        this.researchState[treeId][tierId].enabled = true;
    }
    
    /**
     * Disable a tier for research
     * @param {string} treeId - Tree ID
     * @param {string} tierId - Tier ID
     */
    disableTier(treeId, tierId) {
        if (this.researchState[treeId]?.[tierId]) {
            this.researchState[treeId][tierId].enabled = false;
        }
    }
    
    /**
     * Add research progress to a tier
     * @param {string} treeId - Tree ID
     * @param {string} tierId - Tier ID
     * @param {number} flopsAdded - FLOPS of intelligence added
     * @param {number} currentTime - Current game time in days
     * @returns {Object} { tranche_completed: boolean, tier_completed: boolean }
     */
    addResearchProgress(treeId, tierId, flopsAdded, currentTime) {
        const tree = this.treeLookup[treeId];
        const tierDef = tree?.tiers?.find(t => t.id === tierId);
        
        if (!tierDef) {
            return { tranche_completed: false, tier_completed: false };
        }
        
        // Ensure state exists
        if (!this.researchState[treeId]) {
            this.researchState[treeId] = {};
        }
        if (!this.researchState[treeId][tierId]) {
            this.researchState[treeId][tierId] = {
                tranches_completed: 0,
                progress: 0,
                enabled: false,
                completed: false
            };
        }
        
        const tierState = this.researchState[treeId][tierId];
        const totalTranches = tierDef.tranches || this.TRANCHES_PER_TIER;
        
        // Already completed
        if (tierState.tranches_completed >= totalTranches) {
            return { tranche_completed: false, tier_completed: true };
        }
        
        // Track start time
        if (!tierState.research_start_time && flopsAdded > 0) {
            tierState.research_start_time = currentTime;
        }
        
        // Calculate cost for the tier in FLOP-days (same unit as progress)
        // Cost is specified as EFLOPS-days: 100 EFLOPS-days for tier 1, doubling each tier
        // Progress is added as (intelligenceRate * deltaTime) where intelligenceRate is FLOPS, deltaTime is days
        // So both cost and progress are in FLOP-days units
        const EFLOPS_TO_FLOPS = 1e18;
        const SECONDS_PER_DAY = 86400; // Used for legacy tranche_cost_intelligence conversion
        
        // Get tier cost in EFLOPS-days (default: 100 for tier 1, 2x scaling)
        // If tranche_cost_intelligence exists, convert it (it's per-tranche, so multiply by tranches)
        // Otherwise use tier_cost_eflops_days if specified, or default to 100 for tier 1
        let tierCostEFLOPSDays;
        if (tierDef.tier_cost_eflops_days !== undefined) {
            tierCostEFLOPSDays = tierDef.tier_cost_eflops_days;
        } else if (tierDef.tranche_cost_intelligence !== undefined) {
            // Legacy: convert per-tranche cost to total tier cost
            // Assume it was meant to be total cost, so use as-is
            // But if it's clearly per-tranche (very small), multiply by tranches
            const legacyCost = tierDef.tranche_cost_intelligence;
            const legacyCostEFLOPSDays = legacyCost / (EFLOPS_TO_FLOPS * SECONDS_PER_DAY);
            // If it's less than 50 EFLOPS-days, it's probably per-tranche
            if (legacyCostEFLOPSDays < 50) {
                tierCostEFLOPSDays = legacyCostEFLOPSDays * totalTranches;
            } else {
                tierCostEFLOPSDays = legacyCostEFLOPSDays;
            }
        } else {
            // Default: tier 1 costs 1000 EFLOPS-days, tier 10 costs 1e21x more
            // Find tier index to determine scaling
            let tierIndex = 0;
            if (tree && tree.tiers) {
                const foundIndex = tree.tiers.findIndex(t => t.id === tierId);
                if (foundIndex >= 0) {
                    tierIndex = foundIndex;
                }
            }
            const baseCostEFLOPSDays = 1000; // Tier 1 base cost: 1000 EFLOPS-days
            // Each tier costs 150x more than the previous tier
            tierCostEFLOPSDays = baseCostEFLOPSDays * Math.pow(150, tierIndex);
        }
        
        // Convert to FLOP-days cost (same units as progress: FLOPS * days)
        // Progress is added as (intelligenceRate * deltaTime) where intelligenceRate is FLOPS and deltaTime is days
        // So cost should be in FLOP-days, not total FLOP operations
        const totalFlopsCost = tierCostEFLOPSDays * EFLOPS_TO_FLOPS;
        
        // FLOPS per tranche (for display purposes - divide total cost evenly across tranches)
        const flopsPerTranche = totalFlopsCost / totalTranches;
        
        // Add progress
        const oldProgress = tierState.progress || 0;
        const newProgress = oldProgress + flopsAdded;
        
        let trancheCompleted = false;
        let tierCompleted = false;
        
        // Check if tranche completed (progress accumulates across all tranches)
        const currentTranche = Math.floor(oldProgress / flopsPerTranche);
        const newTranche = Math.floor(newProgress / flopsPerTranche);
        
        if (newTranche > currentTranche && newTranche < totalTranches) {
            trancheCompleted = true;
            tierState.tranches_completed = Math.min(newTranche, totalTranches);
        }
        
        // Check if tier completed
        if (newProgress >= totalFlopsCost) {
            tierState.tranches_completed = totalTranches;
            tierState.progress = totalFlopsCost; // Cap at total cost
            tierState.completed = true;
            tierState.completion_time = currentTime;
            tierCompleted = true;
            trancheCompleted = true; // Final tranche completed
            
            // Auto-enable next tier
            this.autoEnableNextTier(treeId, tierId);
            
            // Update caches
            this.updateSkillsCache();
            this.updateCategoryFactors();
        } else {
            tierState.progress = newProgress;
            tierState.tranches_completed = Math.min(Math.floor(newProgress / flopsPerTranche), totalTranches);
            
            if (trancheCompleted) {
                // Update caches when tranche completes
                this.updateSkillsCache();
                this.updateCategoryFactors();
            }
        }
        
        return { tranche_completed: trancheCompleted, tier_completed: tierCompleted };
    }
    
    /**
     * Auto-enable the next tier when current tier completes
     * @param {string} treeId - Tree ID
     * @param {string} completedTierId - Completed tier ID
     */
    autoEnableNextTier(treeId, completedTierId) {
        const tree = this.treeLookup[treeId];
        if (!tree) return;
        
        // All trees now have direct tiers (no subcategory handling needed)
        if (!tree.tiers) return;
        
        const currentIndex = tree.tiers.findIndex(t => t.id === completedTierId);
        if (currentIndex >= 0 && currentIndex < tree.tiers.length - 1) {
            const nextTier = tree.tiers[currentIndex + 1];
            this.enableTier(treeId, nextTier.id);
        }
    }
    
    /**
     * Check if tier is complete
     * @param {string} treeId - Tree ID
     * @param {string} tierId - Tier ID
     * @returns {boolean}
     */
    isTierComplete(treeId, tierId) {
        return this.researchState[treeId]?.[tierId]?.completed || false;
    }
    
    /**
     * Get next available (enabled, not complete) tier for a tree
     * @param {string} treeId - Tree ID
     * @returns {string|null} Tier ID or null
     */
    getNextUnlockedTier(treeId) {
        const tree = this.treeLookup[treeId];
        if (!tree || !tree.tiers) return null;
        
        const treeState = this.researchState[treeId] || {};
        
        for (const tier of tree.tiers) {
            const tierState = treeState[tier.id];
            if (tierState?.enabled && !tierState?.completed) {
                return tier.id;
            }
        }
        
        return null;
    }
    
    /**
     * Get all enabled research projects (for intelligence distribution)
     * @returns {Array} Array of { treeId, tierId, tierState, tierDef }
     */
    getEnabledResearchProjects() {
        const projects = [];
        
        for (const [treeId, treeState] of Object.entries(this.researchState)) {
            const tree = this.treeLookup[treeId];
            if (!tree) continue;
            
            for (const [tierId, tierState] of Object.entries(treeState)) {
                if (!tierState.enabled || tierState.completed) continue;
                
                // All trees now have direct tiers (no subcategory handling needed)
                let tierDef = tree.tiers?.find(t => t.id === tierId) || null;
                
                if (tierDef) {
                    projects.push({ treeId, tierId, tierState, tierDef });
                }
            }
        }
        
        return projects;
    }
    
    // ========================================
    // CACHE MANAGEMENT
    // ========================================
    
    /**
     * Update the skills cache
     */
    updateSkillsCache() {
        for (const skillName of Object.keys(this.skillDefinitions)) {
            const skillDef = this.skillDefinitions[skillName];
            const treeId = skillDef.treeId;
            const baseValue = skillDef.baseValue || 1.0;
            const factor = this.getTreeUpgradeFactor(treeId);
            this.skillsCache[skillName] = baseValue * factor;
        }
    }
    
    // ========================================
    // STATE MANAGEMENT
    // ========================================
    
    /**
     * Load research state from game state
     * @param {Object} state - Game state object
     */
    loadFromState(state, isInitialLoad = false) {
        // Load from new tech_tree format if available
        if (state.tech_tree?.research_state) {
            this.researchState = JSON.parse(JSON.stringify(state.tech_tree.research_state));
        }
        // Fall back to legacy research format
        else if (state.research) {
            this.researchState = JSON.parse(JSON.stringify(state.research));
        }
        
        // Only auto-enable on initial load, not during gameplay
        // During gameplay, user controls what's enabled via toggles
        // The autoEnableNextTier() method handles tier completion -> next tier
        if (isInitialLoad) {
            this.ensureFirstIncompleteTiersEnabled();
        }
        
        this.updateSkillsCache();
        this.updateCategoryFactors();
    }
    
    /**
     * Ensure the first incomplete tier in each tree is enabled
     * This allows research to continue automatically after tier completion
     */
    ensureFirstIncompleteTiersEnabled() {
        for (const [treeId, tree] of Object.entries(this.treeLookup)) {
            // All trees now have direct tiers (no subcategory handling needed)
            if (tree.tiers) {
                this.ensureFirstIncompleteTierEnabled(treeId, tree.tiers);
            }
        }
    }
    
    /**
     * Ensure the first incomplete tier in a tier list is enabled
     * @param {string} treeId - Tree ID
     * @param {Array} tiers - Array of tier definitions
     */
    ensureFirstIncompleteTierEnabled(treeId, tiers) {
        if (!this.researchState[treeId]) {
            this.researchState[treeId] = {};
        }
        
        for (let i = 0; i < tiers.length; i++) {
            const tier = tiers[i];
            const tierKey = tier.id;
            const tierState = this.researchState[treeId][tierKey];
            
            // Initialize tier state if not exists
            if (!tierState) {
                this.researchState[treeId][tierKey] = {
                    tranches_completed: 0,
                    progress: 0,
                    enabled: i === 0, // Only enable first tier by default
                    completed: false,
                    research_start_time: null,
                    completion_time: null
                };
                continue;
            }
            
            const totalTranches = tier.tranches || this.TRANCHES_PER_TIER;
            const isComplete = (tierState.tranches_completed || 0) >= totalTranches;
            
            // Mark as completed if fully tranched
            if (isComplete && !tierState.completed) {
                tierState.completed = true;
            }
            
            // If this tier is incomplete, check if it should be enabled
            if (!isComplete) {
                // Check if previous tier is complete (or this is the first tier)
                let prevTierComplete = true;
                if (i > 0) {
                    const prevTier = tiers[i - 1];
                    const prevTierKey = prevTier.id;
                    const prevTierState = this.researchState[treeId][prevTierKey];
                    const prevTotalTranches = prevTier.tranches || this.TRANCHES_PER_TIER;
                    prevTierComplete = (prevTierState?.tranches_completed || 0) >= prevTotalTranches;
                }
                
                // If previous tier is complete and this tier is not enabled, enable it
                if (prevTierComplete && !tierState.enabled) {
                    tierState.enabled = true;
                }
                
                // Found the first incomplete tier - stop checking this tree
                break;
            }
        }
    }
    
    /**
     * Export research state for game state
     * @returns {Object} Research state object
     */
    exportToState() {
        return {
            research_state: JSON.parse(JSON.stringify(this.researchState)),
            skills_cache: { ...this.skillsCache },
            category_factors: { ...this.categoryFactors }
        };
    }
    
    /**
     * Get legacy skills object for backward compatibility
     * Maps new 12-skill system to old skill names
     * @returns {Object} Skills object in legacy format
     */
    getLegacySkills() {
        // Get new core skills
        const propulsion = this.getSkillValue('propulsion');
        const robotics = this.getSkillValue('robotics');
        const materials = this.getSkillValue('materials');
        const structures = this.getSkillValue('structures');
        const generation = this.getSkillValue('generation');
        const storage_density = this.getSkillValue('storage_density');
        const conversion = this.getSkillValue('conversion');
        const transmission = this.getSkillValue('transmission');
        const architecture = this.getSkillValue('architecture');
        const processor = this.getSkillValue('processor');
        const memory = this.getSkillValue('memory');
        const sensors = this.getSkillValue('sensors');
        
        return {
            // Dexterity skills (mapped from new skills)
            propulsion: propulsion,
            thrust: propulsion, // Maps to propulsion
            locomotion: propulsion, // Maps to propulsion
            manipulation: robotics, // Maps to robotics
            strength: robotics, // Maps to robotics
            materials: materials,
            production: structures, // Maps to structures
            recycling: structures, // Maps to structures
            dyson_construction: structures, // Maps to structures
            
            // Energy skills (mapped from new skills)
            solar_pv: generation, // Maps to generation
            radiator: conversion, // Maps to conversion
            heat_pump: conversion, // Maps to conversion
            battery_density: storage_density,
            thermal_efficiency: conversion, // Maps to conversion
            energy_converter: conversion, // Maps to conversion
            energy_collection: generation, // Maps to generation
            energy_storage: storage_density,
            energy_transport: transmission,
            
            // Intelligence skills (mapped from new skills)
            cpu: processor,
            gpu: processor, // Maps to processor
            interconnect: sensors, // Maps to sensors
            io_bandwidth: memory,
            sensors: sensors,
            learning: architecture, // Maps to architecture
            research_rate: architecture, // Maps to architecture
            substrate: architecture, // Legacy alias
            
            // Legacy computed skill
            robotic: robotics, // Maps to robotics
            acds: 1.0, // ACDS is still a constant for now
            
            // Computer skills object (geometric mean of processor, sensors, memory)
            computer: {
                processing: processor,
                gpu: processor,
                interconnect: sensors,
                interface: memory,
                transmission: sensors,
                memory: memory,
                total: Math.pow(
                    processor *
                    processor *
                    sensors *
                    memory,
                    0.25
                )
            }
        };
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TechTree;
}

