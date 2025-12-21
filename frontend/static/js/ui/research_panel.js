/** Research panel UI component - redesigned with horizontal tree buttons */
class ResearchPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.researchData = null;
        this.gameState = null;
        this.activeResearch = {}; // Track which tier is currently active per tree
        this.init();
        this.loadResearch();
    }

    async loadResearch() {
        try {
            // Load additional research trees
            const additionalResponse = await fetch('/game_data/additional_research_trees.json');
            const additionalData = await additionalResponse.json();
            const additionalTrees = additionalData.additional_research_trees || {};
            
            // Try to load main research trees (may not exist)
            let mainTrees = {};
            try {
                const mainResponse = await fetch('/game_data/research_trees.json');
                const mainData = await mainResponse.json();
                mainTrees = mainData.research_trees || {};
            } catch (e) {
                // File doesn't exist, that's okay
            }
            
            // Merge trees
            this.researchData = {
                ...mainTrees,
                ...additionalTrees
            };
            
            this.render();
        } catch (error) {
            console.error('Failed to load research data:', error);
        }
    }

    init() {
        // Research panel initialization
    }

    formatNumber(value) {
        // Use scientific notation for numbers less than 10
        if (value < 10 && value > 0) {
            return value.toExponential(2);
        }
        if (value >= 1e24) return (value / 1e24).toFixed(2) + 'Y';
        if (value >= 1e21) return (value / 1e21).toFixed(2) + 'Z';
        if (value >= 1e18) return (value / 1e18).toFixed(2) + 'E';
        if (value >= 1e15) return (value / 1e15).toFixed(2) + 'P';
        if (value >= 1e12) return (value / 1e12).toFixed(2) + 'T';
        if (value >= 1e9) return (value / 1e9).toFixed(2) + 'G';
        if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
        if (value >= 1e3) return (value / 1e3).toFixed(2) + 'k';
        return value.toFixed(2);
    }

    categorizeResearchTree(treeId, treeData) {
        // Categorize research trees into Energy, Dexterity, or Intelligence
        const category = treeData.category || '';
        const name = (treeData.name || '').toLowerCase();
        
        // Energy category
        if (treeId === 'energy_collection' || name.includes('energy') || category === 'energy') {
            return 'energy';
        }
        
        // Dexterity category (propulsion, locomotion, acds, robotics, dyson swarm, production efficiency, resource recovery)
        if (treeId === 'propulsion_systems' || treeId === 'locomotion_systems' || 
            treeId === 'acds' || treeId === 'robotic_systems' ||
            treeId === 'dyson_swarm_construction' || treeId === 'production_efficiency' ||
            treeId === 'recycling_efficiency' ||
            name.includes('propulsion') || name.includes('locomotion') || 
            name.includes('attitude') || name.includes('robotic') ||
            name.includes('dyson') || name.includes('production') ||
            name.includes('recycling') || name.includes('salvage') ||
            category === 'propulsion' || category === 'locomotion' || 
            category === 'control' || category === 'robotics' ||
            category === 'construction_efficiency' || category === 'manufacturing' ||
            category === 'resource_management') {
            return 'dexterity';
        }
        
        // Intelligence category (computer systems subcategories, research rate)
        if (treeId === 'computer_systems' || treeId === 'research_rate_efficiency' ||
            name.includes('computer') || name.includes('research') || 
            name.includes('compute') || category === 'computing' || category === 'research') {
            return 'intelligence';
        }
        
        // Default to intelligence for anything else
        return 'intelligence';
    }

    render() {
        if (!this.container) return;

        if (!this.researchData) {
            this.container.innerHTML = '<div>Loading research...</div>';
            return;
        }

        let html = '<div class="research-panel-new">';
        html += '<div class="research-header">';
        html += '<div class="research-header-title">Research</div>';
        html += '<div class="research-header-info">Intelligence (FLOPS) automatically allocated equally across all enabled research</div>';
        html += '<label class="research-enable-all-toggle">';
        html += '<input type="checkbox" class="research-enable-all-checkbox" onchange="researchPanel.toggleAllCategories(this.checked)">';
        html += '<span class="research-enable-all-label">Enable All Categories</span>';
        html += '</label>';
        html += '</div>';

        // Organize research trees by category
        const categorizedTrees = {
            energy: [],
            dexterity: [],
            intelligence: []
        };

        Object.entries(this.researchData).forEach(([treeId, treeData]) => {
            const category = this.categorizeResearchTree(treeId, treeData);
            categorizedTrees[category].push([treeId, treeData]);
        });

        // Render Energy section
        if (categorizedTrees.energy.length > 0) {
            html += this.renderCategorySection('energy', 'Energy', categorizedTrees.energy);
        }

        // Render Dexterity section
        if (categorizedTrees.dexterity.length > 0) {
            html += this.renderCategorySection('dexterity', 'Dexterity', categorizedTrees.dexterity);
        }

        // Render Intelligence section - computer systems subcategories go directly here
        if (categorizedTrees.intelligence.length > 0) {
            html += this.renderCategorySection('intelligence', 'Intelligence', categorizedTrees.intelligence);
        }

        html += '</div>';

        this.container.innerHTML = html;
        
        // Add click handlers for tree buttons after rendering
        this.attachTreeButtonHandlers();
    }
    
    attachTreeButtonHandlers() {
        // Add click handlers to all research tree buttons
        const treeButtons = this.container.querySelectorAll('.research-tree-button');
        treeButtons.forEach(button => {
            const treeId = button.getAttribute('data-tree-id');
            if (treeId) {
                // Add click handler (but not on the toggle circle itself)
                button.addEventListener('click', (e) => {
                    // Don't trigger if clicking on the toggle circle, checkbox, or label
                    if (e.target.closest('.research-toggle-circle') || 
                        e.target.closest('.tier-toggle-circle') ||
                        e.target.closest('.toggle-circle') ||
                        e.target.closest('label') ||
                        e.target.tagName === 'INPUT' ||
                        e.target.tagName === 'LABEL') {
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleTreeExpansion(treeId);
                });
            }
        });
        
        // Also ensure toggle circle checkboxes stop propagation
        const toggleCheckboxes = this.container.querySelectorAll('.research-toggle-circle-checkbox, .tier-toggle-circle-checkbox');
        toggleCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering tree button click
            });
        });
    }
    
    toggleTreeExpansion(treeId) {
        // Toggle expansion state
        if (this.activeResearch[treeId] === undefined) {
            this.activeResearch[treeId] = true;
        } else {
            delete this.activeResearch[treeId];
        }
        this.render();
    }
    
    renderCategorySection(categoryId, categoryName, trees) {
        // Check if all items in category are enabled
        let allEnabled = true;
        let anyEnabled = false;
        
        for (const [treeId, treeData] of trees) {
            if (treeId === 'computer_systems' && treeData.subcategories) {
                Object.entries(treeData.subcategories).forEach(([subcatId, subcatData]) => {
                    if (subcatData.tiers) {
                        subcatData.tiers.forEach(tier => {
                            const tierKey = subcatId + '_' + tier.id;
                            const progress = this.getTierProgress('computer_systems', tierKey);
                            if (progress.enabled !== undefined) {
                                if (progress.enabled) anyEnabled = true;
                                else allEnabled = false;
                            }
                        });
                    }
                });
            } else if (treeData.tiers) {
                treeData.tiers.forEach(tier => {
                    const progress = this.getTierProgress(treeId, tier.id);
                    if (progress.enabled !== undefined) {
                        if (progress.enabled) anyEnabled = true;
                        else allEnabled = false;
                    }
                });
            }
        }
        
        const categoryEnabled = allEnabled && anyEnabled; // If all are enabled, category is enabled
        
        let html = '<div class="research-category-section">';
        html += '<div class="research-category-header">';
        html += '<span>' + categoryName + '</span>';
        html += '<label class="category-toggle">';
        html += '<input type="checkbox" class="category-toggle-checkbox" data-category="' + categoryId + '" ';
        html += (categoryEnabled ? 'checked' : '') + ' onchange="researchPanel.toggleCategory(\'' + categoryId + '\', this.checked)">';
        html += '<span class="category-toggle-label">Enable All</span>';
        html += '</label>';
        html += '</div>';
        
        trees.forEach(([treeId, treeData]) => {
            // Handle computer_systems subcategories specially - render each subcategory directly
            if (treeId === 'computer_systems' && treeData.subcategories) {
                Object.entries(treeData.subcategories).forEach(([subcatId, subcatData]) => {
                    html += this.renderIntelligenceSubcategory(subcatId, subcatData, treeId);
                });
            } else {
                html += this.renderResearchTree(treeId, treeData);
            }
        });
        
        html += '</div>';
        return html;
    }
    
    renderIntelligenceSubcategory(subcatId, subcatData, parentTreeId) {
        // Render a computer systems subcategory directly as a research tree (Processing, Memory, Interface, Transmission)
        const treeId = parentTreeId + '_' + subcatId; // Use parentTreeId_subcatId as the key
        const isExpanded = this.activeResearch[treeId] !== undefined;
        
        // Find next tier that can be researched (same logic as renderResearchTree)
        let nextTier = null;
        let nextTierEnabled = false;
        if (subcatData.tiers) {
            const tiers = subcatData.tiers;
            for (let idx = 0; idx < tiers.length; idx++) {
                const tier = tiers[idx];
                const tierKey = subcatId + '_' + tier.id;
                const progress = this.getTierProgress(parentTreeId, tierKey);
                const completed = progress.tranches_completed || 0;
                const maxTranches = tier.tranches || 10;
                if (completed < maxTranches) {
                    // Check if previous tier is complete
                    let canResearch = true;
                    if (idx > 0) {
                        const prevTier = tiers[idx - 1];
                        const prevTierKey = subcatId + '_' + prevTier.id;
                        const prevProgress = this.getTierProgress(parentTreeId, prevTierKey);
                        const prevCompleted = prevProgress.tranches_completed || 0;
                        if (prevCompleted < (prevTier.tranches || 10)) {
                            canResearch = false;
                        }
                    }
                    if (canResearch) {
                        nextTier = tier;
                        nextTierEnabled = progress.enabled || false;
                        break;
                    }
                }
            }
        }
        
        let html = '<div class="research-tree-button intelligence-subcategory-tree" data-tree-id="' + treeId + '">';
        
        // Subcategory header (like a tree header)
        html += '<div class="research-tree-header">';
        html += '<div class="research-tree-name">' + subcatData.name + '</div>';
        
        // Toggle circle (red/green)
        html += '<div class="research-toggle-circle-container">';
        if (nextTier) {
            const tierKey = subcatId + '_' + nextTier.id;
            html += '<label class="research-toggle-circle">';
            html += '<input type="checkbox" class="research-toggle-circle-checkbox" data-tree-id="' + parentTreeId + '" data-tier-id="' + tierKey + '" ';
            html += (nextTierEnabled ? 'checked' : '') + ' ';
            html += 'onchange="researchPanel.toggleResearch(\'' + parentTreeId + '\', \'' + tierKey + '\', this.checked)">';
            html += '<span class="toggle-circle ' + (nextTierEnabled ? 'enabled' : 'disabled') + '"></span>';
            html += '</label>';
            
            if (nextTierEnabled) {
                html += '<div class="research-tree-status">';
                html += '<span class="current-research-label">Researching:</span> ';
                html += '<span class="current-research-name">' + nextTier.name + '</span>';
                html += '</div>';
            }
        } else {
            html += '<span class="toggle-circle complete"></span>';
            html += '<div class="research-tree-status">';
            html += '<span class="current-research-label">Complete</span>';
            html += '</div>';
        }
        html += '</div>';
        html += '</div>';

        // Expanded content shows all tiers
        if (isExpanded && subcatData.tiers) {
            html += '<div class="research-tree-content">';
            subcatData.tiers.forEach(tier => {
                html += this.renderTierDetails(parentTreeId, tier, subcatData, subcatId);
            });
            html += '</div>';
        }

        html += '</div>';
        return html;
    }
    
    getCurrentTierForSubcategory(parentTreeId, subcatId) {
        // Find the current tier in a subcategory
        if (!this.gameState || !this.gameState.research) return null;
        
        const treeState = this.gameState.research[parentTreeId];
        if (!treeState) return null;

        const treeData = this.researchData[parentTreeId];
        if (!treeData || !treeData.subcategories) return null;
        
        const subcatData = treeData.subcategories[subcatId];
        if (!subcatData || !subcatData.tiers) return null;

        // Find the first tier with enabled flag (active research)
        for (const tier of subcatData.tiers) {
            const tierKey = subcatId + '_' + tier.id;
            const tierState = treeState[tierKey] || treeState[tier.id];
            const isEnabled = tierState?.enabled || false;
            
            if (isEnabled) {
                return tier;
            }
        }

        // No active research - find first incomplete tier
        for (const tier of subcatData.tiers) {
            const tierKey = subcatId + '_' + tier.id;
            const tierState = treeState[tierKey] || treeState[tier.id];
            const completed = tierState?.tranches_completed || 0;
            const totalTranches = tier.tranches || 10;
            
            if (completed < totalTranches) {
                return tier;
            }
        }

        return null;
    }
    
    
    getCurrentTier(treeId, tierId = null) {
        // Updated to handle both regular tiers and subcategory tiers
        if (!this.gameState || !this.gameState.research) return null;
        
        const treeState = this.gameState.research[treeId];
        if (!treeState) return null;

        const treeData = this.researchData[treeId];
        if (!treeData) return null;
        
        // If tierId is provided, find that specific tier (for subcategories)
        if (tierId) {
            // Handle subcategories (computer systems)
            if (treeData.subcategories) {
                for (const [subcatId, subcatData] of Object.entries(treeData.subcategories)) {
                    if (subcatData.tiers) {
                        for (const tier of subcatData.tiers) {
                            const tierKey = subcatId + '_' + tier.id;
                            if (tierKey === tierId || tier.id === tierId) {
                                return tier;
                            }
                        }
                    }
                }
            }
            
            // Regular tiers
            if (treeData.tiers) {
                for (const tier of treeData.tiers) {
                    if (tier.id === tierId) {
                        return tier;
                    }
                }
            }
            return null;
        }
        
        // Find the next available tier (first incomplete tier that can be researched)
        // Handle subcategories (computer systems)
        if (treeData.subcategories) {
            for (const [subcatId, subcatData] of Object.entries(treeData.subcategories)) {
                if (subcatData.tiers) {
                    for (let idx = 0; idx < subcatData.tiers.length; idx++) {
                        const tier = subcatData.tiers[idx];
                        const tierKey = subcatId + '_' + tier.id;
                        const tierState = treeState[tierKey] || treeState[tier.id];
                        const completed = tierState?.tranches_completed || 0;
                        const maxTranches = tier.tranches || 10;
                        
                        // Check if this tier is incomplete and can be researched (previous tier complete if not first)
                        if (completed < maxTranches) {
                            let canResearch = true;
                            if (idx > 0) {
                                const prevTier = subcatData.tiers[idx - 1];
                                const prevTierKey = subcatId + '_' + prevTier.id;
                                const prevState = treeState[prevTierKey] || treeState[prevTier.id];
                                const prevCompleted = prevState?.tranches_completed || 0;
                                const prevMax = prevTier.tranches || 10;
                                if (prevCompleted < prevMax) {
                                    canResearch = false;
                                }
                            }
                            if (canResearch) {
                                return tier;
                            }
                        }
                    }
                }
            }
            return null;
        }
        
        // Regular tiers - find first incomplete tier that can be researched
        if (!treeData.tiers) return null;

        for (let idx = 0; idx < treeData.tiers.length; idx++) {
            const tier = treeData.tiers[idx];
            const tierState = treeState[tier.id];
            const completed = tierState?.tranches_completed || 0;
            const maxTranches = tier.tranches || 10;
            
            // Check if this tier is incomplete and can be researched (previous tier complete if not first)
            if (completed < maxTranches) {
                let canResearch = true;
                if (idx > 0) {
                    const prevTier = treeData.tiers[idx - 1];
                    const prevState = treeState[prevTier.id];
                    const prevCompleted = prevState?.tranches_completed || 0;
                    const prevMax = prevTier.tranches || 10;
                    if (prevCompleted < prevMax) {
                        canResearch = false;
                    }
                }
                if (canResearch) {
                    return tier;
                }
            }
        }

        // No active research - find first incomplete tier
        for (const tier of treeData.tiers) {
            const tierState = treeState[tier.id];
            const completed = tierState?.tranches_completed || 0;
            const totalTranches = tier.tranches || 10;
            
            if (completed < totalTranches) {
                return tier;
            }
        }

        return null;
    }

    renderResearchTree(treeId, treeData) {
        const tiers = treeData.tiers || [];
        const currentTier = this.getCurrentTier(treeId, null);
        const isExpanded = this.activeResearch[treeId] !== undefined;
        
        // Find the next tier that can be researched (first incomplete tier)
        let nextTier = currentTier;
        let nextTierEnabled = false;
        if (!nextTier && tiers.length > 0) {
            // Check if first tier is complete
            const firstTier = tiers[0];
            const firstProgress = this.getTierProgress(treeId, firstTier.id);
            const firstCompleted = firstProgress.tranches_completed || 0;
            if (firstCompleted < (firstTier.tranches || 10)) {
                nextTier = firstTier;
                nextTierEnabled = firstProgress.enabled || false;
            } else {
                // Find first incomplete tier
                for (let idx = 0; idx < tiers.length; idx++) {
                    const tier = tiers[idx];
                    const progress = this.getTierProgress(treeId, tier.id);
                    const completed = progress.tranches_completed || 0;
                    const maxTranches = tier.tranches || 10;
                    if (completed < maxTranches) {
                        // Check if previous tier is complete
                        let canResearch = true;
                        if (idx > 0) {
                            const prevTier = tiers[idx - 1];
                            const prevProgress = this.getTierProgress(treeId, prevTier.id);
                            const prevCompleted = prevProgress.tranches_completed || 0;
                            if (prevCompleted < (prevTier.tranches || 10)) {
                                canResearch = false;
                            }
                        }
                        if (canResearch) {
                            nextTier = tier;
                            nextTierEnabled = progress.enabled || false;
                            break;
                        }
                    }
                }
            }
        } else if (nextTier) {
            const progress = this.getTierProgress(treeId, nextTier.id);
            nextTierEnabled = progress.enabled || false;
        }

        let html = '<div class="research-tree-button" data-tree-id="' + treeId + '">';
        
        // Tree header (always visible)
        html += '<div class="research-tree-header">';
        html += '<div class="research-tree-name">' + treeData.name + '</div>';
        
        // Toggle circle (red/green)
        html += '<div class="research-toggle-circle-container">';
        if (nextTier) {
            const tierKey = nextTier.id;
            html += '<label class="research-toggle-circle">';
            html += '<input type="checkbox" class="research-toggle-circle-checkbox" data-tree-id="' + treeId + '" data-tier-id="' + tierKey + '" ';
            html += (nextTierEnabled ? 'checked' : '') + ' ';
            html += 'onchange="researchPanel.toggleResearch(\'' + treeId + '\', \'' + tierKey + '\', this.checked)">';
            html += '<span class="toggle-circle ' + (nextTierEnabled ? 'enabled' : 'disabled') + '"></span>';
            html += '</label>';
            
            if (nextTierEnabled) {
                html += '<div class="research-tree-status">';
                html += '<span class="current-research-label">Researching:</span> ';
                html += '<span class="current-research-name">' + nextTier.name + '</span>';
                html += '</div>';
            }
        } else {
            html += '<span class="toggle-circle complete"></span>';
            html += '<div class="research-tree-status">';
            html += '<span class="current-research-label">Complete</span>';
            html += '</div>';
        }
        html += '</div>';
        html += '</div>';

        // Expanded content (tier details) - show all tiers
        if (isExpanded && tiers.length > 0) {
            html += '<div class="research-tree-content">';
            tiers.forEach(tier => {
                html += this.renderTierDetails(treeId, tier, treeData);
            });
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    renderTierDetails(treeId, tier, treeData, subcatId = null) {
        // If subcatId is provided, use subcatId_tier.id as the tier key
        const tierKey = subcatId ? (subcatId + '_' + tier.id) : tier.id;
        const progress = this.getTierProgress(treeId, tierKey);
        const totalTranches = tier.tranches || 10;
        const completedTranches = progress.tranches_completed || 0;
        const isEnabled = progress.enabled || false;
        const isComplete = completedTranches >= totalTranches;
        
        // Get allocated FLOPS for this tier if enabled
        let allocatedFLOPS = 0;
        if (isEnabled && this.gameState && this.gameState.research_allocation_info) {
            const treeAlloc = this.gameState.research_allocation_info[treeId];
            if (treeAlloc && treeAlloc[tierKey] !== undefined) {
                allocatedFLOPS = treeAlloc[tierKey];
            }
        }
        
        let html = '<div class="tier-details">';
        html += '<div class="tier-header-row">';
        html += '<div class="tier-name">' + tier.name + '</div>';
        // Toggle circle for this tier
        if (!isComplete) {
            html += '<label class="tier-toggle-circle">';
            html += '<input type="checkbox" class="tier-toggle-circle-checkbox" data-tree-id="' + treeId + '" data-tier-id="' + tierKey + '" ';
            html += (isEnabled ? 'checked' : '') + ' ';
            html += 'onchange="researchPanel.toggleResearch(\'' + treeId + '\', \'' + tierKey + '\', this.checked)">';
            html += '<span class="toggle-circle ' + (isEnabled ? 'enabled' : 'disabled') + '"></span>';
            html += '</label>';
        } else {
            html += '<span class="toggle-circle complete"></span>';
        }
        html += '</div>';
        
        if (tier.description) {
            html += '<div class="tier-description">' + tier.description + '</div>';
        }
        
        // Show research cost
        if (tier.tranche_cost_metal !== undefined || tier.tranche_cost_energy !== undefined) {
            html += '<div class="tier-research-cost">';
            html += '<div class="research-cost-label">Research Cost (per tranche):</div>';
            html += '<div class="research-cost-values">';
            if (tier.tranche_cost_metal !== undefined) {
                html += '<div class="cost-item">';
                html += '<span class="cost-label">Metal:</span> ';
                html += '<span class="cost-value">' + this.formatNumber(tier.tranche_cost_metal) + '</span>';
                html += '</div>';
            }
            if (tier.tranche_cost_energy !== undefined) {
                html += '<div class="cost-item">';
                html += '<span class="cost-label">Energy:</span> ';
                html += '<span class="cost-value">' + this.formatNumber(tier.tranche_cost_energy) + '</span>';
                html += '</div>';
            }
            html += '</div>';
            html += '</div>';
        }
        
        // Show allocated FLOPS if enabled
        if (isEnabled && allocatedFLOPS > 0) {
            html += '<div class="tier-allocated-flops">';
            html += '<span class="allocated-flops-label">Allocated FLOPS:</span> ';
            html += '<span class="allocated-flops-value">' + this.formatFLOPS(allocatedFLOPS) + ' /s</span>';
            html += '</div>';
        }
        
        // Show progress percentage if enabled
        if (isEnabled && !isComplete) {
            const progressPercent = (completedTranches / totalTranches) * 100;
            html += '<div class="tier-progress">';
            html += '<span class="progress-label">Progress:</span> ';
            html += '<span class="progress-value">' + progressPercent.toFixed(1) + '%</span>';
            html += '</div>';
        }

        // Tranche progress bars (small squares)
        html += '<div class="tranche-progress-container">';
        html += '<div class="tranche-label">Tranches:</div>';
        html += '<div class="tranche-bars">';
        for (let i = 0; i < totalTranches; i++) {
            const isCompleted = i < completedTranches;
            html += '<div class="tranche-bar ' + (isCompleted ? 'completed' : '') + '" title="Tranche ' + (i + 1) + '"></div>';
        }
        html += '</div>';
        html += '<div class="tranche-count">' + completedTranches + ' / ' + totalTranches + '</div>';
        html += '</div>';

        // Benefits
        if (tier.effects && Object.keys(tier.effects).length > 0) {
            html += '<div class="tier-benefits">';
            html += '<div class="benefits-label">Benefits:</div>';
            html += '<div class="benefits-list">';
            Object.entries(tier.effects).forEach(([key, value]) => {
                html += '<div class="benefit-item">';
                html += '<span class="benefit-key">' + this.formatEffectName(key) + ':</span> ';
                html += '<span class="benefit-value">' + this.formatEffectValue(value) + '</span>';
                html += '</div>';
            });
            html += '</div>';
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    formatEffectName(key) {
        // Convert snake_case to Title Case
        return key.split('_').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    formatEffectValue(value) {
        if (typeof value === 'number') {
            if (value >= 1) {
                return '+' + (value * 100).toFixed(0) + '%';
            } else {
                return '+' + (value * 100).toFixed(1) + '%';
            }
        }
        return String(value);
    }
    
    formatFLOPS(flops) {
        // Format floating point operations per second (FLOPS)
        if (flops === 0) return '0 FLOPS';
        if (flops < 1e3) return flops.toFixed(2) + ' FLOPS';
        if (flops < 1e6) return (flops / 1e3).toFixed(2) + ' kFLOPS';
        if (flops < 1e9) return (flops / 1e6).toFixed(2) + ' MFLOPS';
        if (flops < 1e12) return (flops / 1e9).toFixed(2) + ' GFLOPS';
        if (flops < 1e15) return (flops / 1e12).toFixed(2) + ' TFLOPS';
        if (flops < 1e18) return (flops / 1e15).toFixed(2) + ' PFLOPS';
        if (flops < 1e21) return (flops / 1e18).toFixed(2) + ' EFLOPS';
        return (flops / 1e21).toFixed(2) + ' ZFLOPS';
    }

    getCurrentTier(treeId) {
        if (!this.gameState || !this.gameState.research) return null;
        
        const treeState = this.gameState.research[treeId];
        if (!treeState) return null;

        const treeData = this.researchData[treeId];
        if (!treeData || !treeData.tiers) return null;

        // Find the first tier with intelligence allocated (active research)
        for (const tier of treeData.tiers) {
            const tierState = treeState[tier.id];
            const intelligenceAllocated = tierState?.intelligence_allocated || 0;
            
            if (intelligenceAllocated > 0) {
                return tier; // This is the active research
            }
        }

        // No active research - find first incomplete tier
        for (const tier of treeData.tiers) {
            const tierState = treeState[tier.id];
            const completed = tierState?.tranches_completed || 0;
            const totalTranches = tier.tranches || 10;
            
            if (completed < totalTranches) {
                return tier; // Next available tier
            }
        }

        // All tiers complete
        return null;
    }

    getActiveResearchTier(treeId) {
        // Find tier with intelligence allocated (active research)
        if (!this.gameState || !this.gameState.research) return null;
        
        const treeState = this.gameState.research[treeId];
        if (!treeState) return null;

        const treeData = this.researchData[treeId];
        if (!treeData || !treeData.tiers) return null;

        for (const tier of treeData.tiers) {
            const tierState = treeState[tier.id];
            const isEnabled = tierState?.enabled || false;
            if (isEnabled) {
                return tier;
            }
        }
        return null;
    }

    getTierProgress(treeId, tierId) {
        if (!this.gameState || !this.gameState.research) {
            return { tranches_completed: 0, enabled: false };
        }
        
        const treeState = this.gameState.research[treeId];
        if (!treeState) {
            return { tranches_completed: 0, enabled: false };
        }

        // Check if tierId is a subcategory tier (format: "subcatId_tierId")
        if (tierId.includes('_')) {
            return treeState[tierId] || { tranches_completed: 0, enabled: false };
        }

        return treeState[tierId] || { tranches_completed: 0, enabled: false };
    }

    async toggleResearch(treeId, tierId, enabled) {
        // Toggle research tier enabled/disabled
        try {
            if (typeof gameEngine === 'undefined') {
                console.error('gameEngine not available');
                return;
            }
            
            const response = await gameEngine.performAction('allocate_research', {
                tree_id: treeId,
                tier_id: tierId,
                enabled: enabled
            });
            
            if (response.success) {
                // Update game state if provided
                if (response.game_state) {
                    this.update(response.game_state);
                } else {
                    this.render(); // Re-render to update UI
                }
                
                // If enabling, expand the research item to show details
                if (enabled) {
                    // Determine the tree key (could be a subcategory tree)
                    let treeKey = treeId;
                    
                    if (treeId === 'computer_systems' && tierId.includes('_')) {
                        // This is a subcategory tier (format: "subcatId_tierId")
                        // Extract subcategory from tierId (e.g., "processing_tier1" -> "processing")
                        const parts = tierId.split('_');
                        if (parts.length >= 2) {
                            // The subcategory is everything before the last underscore
                            // But we need to find which subcategory matches
                            const treeData = this.researchData[treeId];
                            if (treeData && treeData.subcategories) {
                                // Try to match by checking if tierId starts with any subcategory name
                                for (const [subcatId, subcatData] of Object.entries(treeData.subcategories)) {
                                    if (tierId.startsWith(subcatId + '_')) {
                                        treeKey = treeId + '_' + subcatId;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    
                    // Expand if not already expanded
                    if (this.activeResearch[treeKey] === undefined) {
                        // Set any value to mark as expanded (the actual value doesn't matter for expansion)
                        this.activeResearch[treeKey] = true;
                    }
                    
                    // Re-render to show expanded state
                    this.render();
                } else {
                    // When disabling, just re-render (don't collapse)
                    this.render();
                }
            }
        } catch (error) {
            console.error('Error toggling research:', error);
            alert('Failed to toggle research: ' + (error.message || 'Unknown error'));
        }
    }
    
    async toggleCategory(category, enabled) {
        // Toggle all research in a category
        try {
            if (typeof gameEngine === 'undefined') {
                console.error('gameEngine not available');
                return;
            }
            
            const response = await gameEngine.performAction('toggle_research_category', {
                category: category,
                enabled: enabled
            });
            
            if (response.success) {
                // Update game state if provided
                if (response.game_state) {
                    this.update(response.game_state);
                } else {
                    this.render(); // Re-render to update UI
                }
                
                // If enabling, expand all research items in the category
                if (enabled) {
                    // Find all trees in this category and expand them
                    const categorizedTrees = {
                        energy: [],
                        dexterity: [],
                        intelligence: []
                    };
                    
                    Object.entries(this.researchData).forEach(([treeId, treeData]) => {
                        const cat = this.categorizeResearchTree(treeId, treeData);
                        categorizedTrees[cat].push([treeId, treeData]);
                    });
                    
                    const trees = categorizedTrees[category] || [];
                    trees.forEach(([treeId, treeData]) => {
                        if (treeId === 'computer_systems' && treeData.subcategories) {
                            // Handle subcategories
                            Object.entries(treeData.subcategories).forEach(([subcatId, subcatData]) => {
                                const treeKey = treeId + '_' + subcatId;
                                if (subcatData.tiers && subcatData.tiers.length > 0) {
                                    // Find first enabled tier or first incomplete tier
                                    const firstTier = subcatData.tiers[0];
                                    if (firstTier) {
                                        this.activeResearch[treeKey] = firstTier.id;
                                    }
                                }
                            });
                        } else if (treeData.tiers && treeData.tiers.length > 0) {
                            // Regular tree
                            const firstTier = treeData.tiers[0];
                            if (firstTier) {
                                this.activeResearch[treeId] = firstTier.id;
                            }
                        }
                    });
                    
                    // Re-render to show expanded state
                    this.render();
                }
            }
        } catch (error) {
            console.error('Error toggling category:', error);
        }
    }
    
    async toggleAllCategories(enabled) {
        // Toggle all research categories
        try {
            if (typeof gameEngine === 'undefined') {
                console.error('gameEngine not available');
                return;
            }
            
            // Toggle all three categories
            const categories = ['energy', 'dexterity', 'intelligence'];
            for (const category of categories) {
                await this.toggleCategory(category, enabled);
            }
        } catch (error) {
            console.error('Error toggling all categories:', error);
        }
    }
    
    async beginResearch(treeId) {
        // Check if this is a subcategory tree (format: computer_systems_processing)
        if (treeId.startsWith('computer_systems_')) {
            const subcatId = treeId.replace('computer_systems_', '');
            // This is an intelligence subcategory
            const currentTier = this.getCurrentTierForSubcategory('computer_systems', subcatId);
            if (!currentTier) {
                alert('All research in this category is complete!');
                return;
            }

            // Expand/collapse the tree content
            if (this.activeResearch[treeId] === currentTier.id) {
                delete this.activeResearch[treeId];
            } else {
                this.activeResearch[treeId] = currentTier.id;
            }
            this.render();
            return;
        }

        const currentTier = this.getCurrentTier(treeId, null);
        if (!currentTier) {
            alert('All research in this tree is complete!');
            return;
        }

        // Expand/collapse the tree content
        if (this.activeResearch[treeId] === currentTier.id) {
            // Already expanded, collapse it
            delete this.activeResearch[treeId];
        } else {
            // Expand to show tier details
            this.activeResearch[treeId] = currentTier.id;
        }
        this.render();
    }

    async allocateIntelligence(treeId, tierId, amount) {
        try {
            await gameEngine.performAction('allocate_research', {
                tree_id: treeId,
                tier_id: tierId,
                intelligence: parseFloat(amount) || 0
            });
        } catch (error) {
            console.error('Research allocation failed:', error);
            alert(error.message || 'Research allocation failed');
        }
    }

    update(gameState) {
        this.gameState = gameState;

        if (!this.researchData) return;

        // Re-render to update all displays
        this.render();
    }
}

// Event listeners are handled inline via onchange handlers for toggle circles
