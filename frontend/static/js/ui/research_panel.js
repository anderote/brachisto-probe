/** Research panel UI component - redesigned with horizontal tree buttons */
class ResearchPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.researchData = null;
        this.researchMetadata = null; // Metadata with tier descriptions
        this.gameState = null;
        this.expandedTrees = new Set(); // Track which trees are expanded
        this.collapsedCategories = new Set(['energy', 'dexterity', 'intelligence']); // Start all collapsed
        this.physicsDisplay = null; // Physics display integration
        this.init();
        this.loadResearch();
        this.initPhysicsDisplay();
    }

    async initPhysicsDisplay() {
        // Initialize physics display when available
        if (typeof ResearchPhysicsDisplay !== 'undefined') {
            this.physicsDisplay = new ResearchPhysicsDisplay();
            await this.physicsDisplay.initialize();
        }
    }

    async loadResearch() {
        try {
            // Load consolidated research trees (all trees are now in one file)
            const [treesResponse, metadataResponse] = await Promise.all([
                fetch('/game_data/research_trees.json'),
                fetch('/game_data/research_trees_metadata.json')
            ]);
            
            const treesData = await treesResponse.json();
            const metadataData = await metadataResponse.json();
            
            this.researchData = treesData.research_trees || {};
            this.researchMetadata = metadataData.categories || {};
            
            this.render();
        } catch (error) {
            console.error('Failed to load research data:', error);
        }
    }

    init() {
        // Research panel initialization
    }
    
    /**
     * Get tier description from metadata
     */
    getTierDescription(treeId, tierId) {
        if (!this.researchMetadata) return null;
        
        // Search through all categories for the tree
        for (const [catId, catData] of Object.entries(this.researchMetadata)) {
            if (catData.trees) {
                for (const tree of catData.trees) {
                    if (tree.id === treeId && tree.tiers) {
                        const tier = tree.tiers.find(t => t.id === tierId);
                        if (tier) return tier.description;
                    }
                }
            }
        }
        return null;
    }
    
    /**
     * Get tree description from metadata
     */
    getTreeDescription(treeId) {
        if (!this.researchMetadata) return null;
        
        for (const [catId, catData] of Object.entries(this.researchMetadata)) {
            if (catData.trees) {
                const tree = catData.trees.find(t => t.id === treeId);
                if (tree) return tree.description;
            }
        }
        return null;
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
        
        // Dexterity category (propulsion, thrust, locomotion, acds, robotics, materials, dyson swarm, production efficiency, resource recovery)
        if (treeId === 'propulsion_systems' || treeId === 'thrust_systems' ||
            treeId === 'locomotion_systems' || treeId === 'materials_science' ||
            treeId === 'acds' || treeId === 'robotic_systems' ||
            treeId === 'dyson_swarm_construction' || treeId === 'production_efficiency' ||
            treeId === 'recycling_efficiency' ||
            name.includes('propulsion') || name.includes('thrust') ||
            name.includes('locomotion') || name.includes('materials') ||
            name.includes('attitude') || name.includes('robotic') ||
            name.includes('dyson') || name.includes('production') ||
            name.includes('recycling') || name.includes('salvage') ||
            category === 'propulsion' || category === 'thrust' ||
            category === 'locomotion' || category === 'materials' ||
            category === 'control' || category === 'robotics' ||
            category === 'construction_efficiency' || category === 'manufacturing' ||
            category === 'resource_management' || category === 'dexterity') {
            return 'dexterity';
        }
        
        // Intelligence category (computer systems trees, research rate, sensors)
        // Computer trees are now top-level: computer_processing, computer_gpu, computer_interconnect, computer_interface
        if (treeId.startsWith('computer_') || treeId === 'research_rate_efficiency' ||
            treeId === 'sensor_systems' ||
            name.includes('computer') || name.includes('research') || 
            name.includes('compute') || name.includes('sensor') ||
            category === 'computing' || category === 'research' || category === 'intelligence') {
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

        let html = '<div class="probe-summary-panel">';
        html += '<div class="probe-summary-title">Research</div>';
        
        // Brief info
        html += '<div style="font-size: 9px; color: rgba(255, 255, 255, 0.5); padding: 6px 8px; margin-bottom: 4px;">Click any research item to toggle. FLOPS split evenly across all active research.</div>';

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
        
        // Add click handlers for research cards after rendering
        this.attachResearchCardHandlers();
    }
    
    attachResearchCardHandlers() {
        // Use event delegation on the container to handle clicks on research cards
        // This avoids issues with cloning and ensures handlers persist after re-renders
        // Remove any existing listener first to avoid duplicates
        if (this._researchCardHandler) {
            this.container.removeEventListener('click', this._researchCardHandler);
        }
        
        this._researchCardHandler = (e) => {
            // Find the closest research card element (works with both old and new styles)
            const researchCard = e.target.closest('.research-card, .structure-card-enhanced.research-card');
            if (!researchCard) {
                return;
            }
            
            // Don't trigger if clicking on disabled cards
            if (researchCard.classList.contains('disabled')) {
                return;
            }
            
            // Don't trigger if clicking on links, buttons, checkboxes, labels, or toggle circles
            if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON' || 
                e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL' ||
                e.target.closest('label') || e.target.closest('.toggle-circle') ||
                e.target.closest('.research-toggle-circle')) {
                return;
            }
            
            const treeId = researchCard.getAttribute('data-tree-id');
            const subcatId = researchCard.getAttribute('data-subcat-id');
            const tierId = researchCard.getAttribute('data-tier-id');
            
            if (!treeId || !tierId) {
                // No tier available (complete), just toggle expansion
                const treeKey = subcatId ? `${treeId}_${subcatId}` : treeId;
                this.toggleTreeExpansion(treeKey);
                return;
            }
            
            // Clicking on the card both toggles research AND expands/collapses
            this.toggleResearchAndExpand(treeId, tierId, subcatId);
        };
        
        this.container.addEventListener('click', this._researchCardHandler);
        
        // Also ensure toggle circle checkboxes stop propagation
        const toggleCheckboxes = this.container.querySelectorAll('.research-toggle-circle-checkbox, .tier-toggle-circle-checkbox');
        toggleCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering card click
            });
        });
    }
    
    toggleTreeExpansion(treeId) {
        // Toggle expansion state
        if (this.expandedTrees.has(treeId)) {
            this.expandedTrees.delete(treeId);
        } else {
            this.expandedTrees.add(treeId);
        }
        this.render();
    }
    
    /**
     * Toggle research and expand tree in one action
     * When clicking a tree name, both expand it and toggle research on/off
     */
    async toggleResearchAndExpand(treeId, tierId, subcatId = null) {
        // Check current enabled state
        const actualTreeId = subcatId ? treeId : treeId;
        const progress = this.getTierProgress(actualTreeId, tierId);
        const isCurrentlyEnabled = progress.enabled || false;
        const newEnabledState = !isCurrentlyEnabled;
        
        // Always expand when enabling
        const treeKey = subcatId ? `${treeId}_${subcatId}` : treeId;
        if (newEnabledState) {
            this.expandedTrees.add(treeKey);
        }
        
        // Toggle research
        await this.toggleResearch(actualTreeId, tierId, newEnabledState);
    }
    
    renderCategorySection(categoryId, categoryName, trees) {
        // Check if all items in category are enabled
        let allEnabled = true;
        let anyEnabled = false;
        
        for (const [treeId, treeData] of trees) {
            if (treeData.tiers) {
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
        const isCollapsed = this.collapsedCategories.has(categoryId);
        
        let html = '<div class="collapsible-category">';
        html += '<div class="collapsible-category-header' + (isCollapsed ? ' collapsed' : '') + '" onclick="researchPanel.toggleCategoryCollapse(\'' + categoryId + '\')">';
        html += '<span class="collapsible-category-title">' + categoryName + '</span>';
        html += '<div style="display: flex; align-items: center; gap: 8px;">';
        html += '<button class="category-toggle-btn enable-btn" onclick="event.stopPropagation(); researchPanel.toggleCategory(\'' + categoryId + '\', true);" style="font-size: 9px; padding: 2px 6px; cursor: pointer; background: rgba(74, 158, 255, 0.2); border: 1px solid rgba(74, 158, 255, 0.4); color: rgba(74, 158, 255, 0.9); border-radius: 3px;">Enable All</button>';
        html += '<button class="category-toggle-btn disable-btn" onclick="event.stopPropagation(); researchPanel.toggleCategory(\'' + categoryId + '\', false);" style="font-size: 9px; padding: 2px 6px; cursor: pointer; background: rgba(255, 100, 100, 0.2); border: 1px solid rgba(255, 100, 100, 0.4); color: rgba(255, 100, 100, 0.9); border-radius: 3px;">Disable All</button>';
        html += '<span class="collapsible-category-toggle">' + (isCollapsed ? '▶' : '▼') + '</span>';
        html += '</div>';
        html += '</div>';
        html += '<div class="collapsible-category-content' + (isCollapsed ? ' collapsed' : '') + '">';
        
        trees.forEach(([treeId, treeData]) => {
            // All trees are now top-level (no more subcategory handling needed)
            html += this.renderResearchTree(treeId, treeData);
        });
        
        html += '</div></div>';
        return html;
    }

    toggleCategoryCollapse(categoryId) {
        if (this.collapsedCategories.has(categoryId)) {
            this.collapsedCategories.delete(categoryId);
        } else {
            this.collapsedCategories.add(categoryId);
        }
        this.render();
    }
    
    getCurrentTier(treeId, tierId = null) {
        // Updated to handle both regular tiers and subcategory tiers
        const researchState = this.gameState?.tech_tree?.research_state || this.gameState?.research;
        if (!this.gameState || !researchState) return null;
        
        const treeState = researchState[treeId];
        if (!treeState) return null;

        const treeData = this.researchData[treeId];
        if (!treeData) return null;
        
        // If tierId is provided, find that specific tier
        if (tierId) {
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
        const isExpanded = this.expandedTrees.has(treeId);
        
        // Find the next tier that can be researched (first incomplete tier)
        let nextTier = null;
        let nextTierIndex = 0;
        let nextTierEnabled = false;
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
                    nextTierIndex = idx;
                    nextTierEnabled = progress.enabled || false;
                    break;
                }
            }
        }

        // Calculate overall progress for the tree
        let totalTranches = 0;
        let completedTranches = 0;
        tiers.forEach(tier => {
            const progress = this.getTierProgress(treeId, tier.id);
            const maxTranches = tier.tranches || 10;
            totalTranches += maxTranches;
            completedTranches += (progress.tranches_completed || 0);
        });
        const progressPercent = totalTranches > 0 ? (completedTranches / totalTranches) * 100 : 0;
        const isComplete = completedTranches >= totalTranches;

        // Get current tier progress for display
        let currentTierProgressPercent = 0;
        let allocatedFLOPS = 0;
        let timeToComplete = Infinity;
        
        if (nextTier && nextTierEnabled) {
            const tierProgress = this.getTierProgress(treeId, nextTier.id);
            const maxTranches = nextTier.tranches || 10;
            
            // Use smooth progress calculation for sub-tranche granularity
            currentTierProgressPercent = this.calculateSmoothProgressPercent(tierProgress, nextTier, nextTierIndex);
            
            // Get allocated FLOPS
            if (this.gameState && this.gameState.research_allocation_info) {
                const treeAlloc = this.gameState.research_allocation_info[treeId];
                if (treeAlloc && treeAlloc[nextTier.id] !== undefined) {
                    allocatedFLOPS = treeAlloc[nextTier.id];
                }
            }
            
            // Calculate time to complete using smooth progress
            if (allocatedFLOPS > 0) {
                const totalCost = this.calculateTierCostFLOPS(nextTier, nextTierIndex);
                const currentProgress = tierProgress.progress || 0;
                const remainingFLOPS = totalCost - currentProgress;
                // allocatedFLOPS is FLOPS/day, remainingFLOPS is FLOPS (accumulated as FLOPS * days)
                if (remainingFLOPS > 0) {
                    timeToComplete = remainingFLOPS / allocatedFLOPS;
                } else {
                    timeToComplete = 0;
                }
            }
        }

        const enabledClass = nextTierEnabled ? 'research-enabled' : '';
        const expandedClass = isExpanded || nextTierEnabled ? 'research-expanded' : '';
        
        // Get tier description from metadata
        const tierDescription = nextTier ? this.getTierDescription(treeId, nextTier.id) : null;
        
        // Build status badge content
        let statusBadgeContent = '';
        if (isComplete) {
            statusBadgeContent = '✓ COMPLETE';
        } else if (nextTierEnabled) {
            statusBadgeContent = '<span class="pulse-dot"></span> ACTIVE';
        } else {
            statusBadgeContent = `${progressPercent.toFixed(0)}%`;
        }
        
        // Build stats for the research
        let statsHtml = '';
        if (nextTier && nextTierEnabled && allocatedFLOPS > 0) {
            statsHtml = `
                <div class="structure-stats-grid" style="grid-template-columns: 1fr;">
                    <div class="structure-stat-block output">
                        <div class="structure-stat-label">Compute Allocation</div>
                        <div class="structure-stat-value positive">${this.formatFLOPS(allocatedFLOPS)}<span class="structure-stat-unit">/s</span></div>
                    </div>
                </div>`;
        }
        
        let html = `
            <div class="structure-card-enhanced research-card ${enabledClass} ${expandedClass}" 
                 id="research-${treeId}" 
                 data-tree-id="${treeId}"
                 data-tier-id="${nextTier ? nextTier.id : ''}"
                 style="cursor: ${nextTier ? 'pointer' : 'default'};">
                <div class="structure-card-header header-research">
                    <span>${treeData.name}</span>
                    <div class="status-badge ${nextTierEnabled ? 'active' : ''}">
                        ${statusBadgeContent}
                    </div>
                </div>
                <div class="structure-card-body">`;
        
        // Show expanded content when researching or manually expanded
        if (isExpanded || nextTierEnabled) {
            // Current tier info
            if (nextTier) {
                html += `<div style="font-size: 10px; color: rgba(255, 255, 255, 0.8); margin-bottom: 6px; font-weight: 600;">
                    Tier ${nextTierIndex + 1}: ${nextTier.name}
                </div>`;

                // Show tier description from metadata
                if (tierDescription) {
                    html += `<div class="structure-card-description">${tierDescription}</div>`;
                }

                // Show physics values if available
                const physicsHtml = this.physicsDisplay ? this.physicsDisplay.createPhysicsHTML(treeId) : '';
                if (physicsHtml) {
                    html += physicsHtml;
                }
            } else {
                html += `<div style="font-size: 10px; color: rgba(100, 220, 100, 0.9); margin-bottom: 6px;">All tiers complete!</div>`;

                // Show physics values for completed trees too
                const physicsHtml = this.physicsDisplay ? this.physicsDisplay.createPhysicsHTML(treeId) : '';
                if (physicsHtml) {
                    html += physicsHtml;
                }
            }
            
            // Add stats HTML
            html += statsHtml;
            
            // Progress info row
            html += `
                <div class="structure-cost-row">
                    <div class="structure-cost-item">
                        <div class="structure-cost-icon" style="background: linear-gradient(135deg, #90ee90, #60c060);">T</div>
                        <div>
                            <div class="structure-cost-label">Tranches</div>
                            <div class="structure-cost-value" id="tranches-${treeId}">${completedTranches} / ${totalTranches}</div>
                        </div>
                    </div>
                    <div class="structure-count-badge" style="background: rgba(100, 220, 100, 0.2); border-color: rgba(100, 220, 100, 0.4); color: rgba(100, 220, 100, 0.95);">
                        ${nextTierEnabled ? 'Active' : (isComplete ? 'Done' : 'Inactive')}
                    </div>
                </div>`;
            
            // Progress bar for current tier
            if (nextTier) {
                html += `
                    <div class="structure-progress-section" id="progress-${treeId}">
                        <div class="structure-progress-header">
                            <span class="structure-progress-title">Tier Progress</span>
                            <span class="structure-progress-time" id="progress-time-${treeId}">${timeToComplete === Infinity ? '—' : FormatUtils.formatTime(timeToComplete)}</span>
                        </div>
                        <div class="structure-progress-bar-container">
                            <div class="structure-progress-bar" id="progress-bar-${treeId}" style="width: ${Math.min(100, Math.max(0, currentTierProgressPercent))}%; ${nextTierEnabled ? 'background: linear-gradient(90deg, rgba(100, 220, 100, 0.8), rgba(100, 220, 100, 1));' : ''}"></div>
                        </div>
                        <div class="structure-progress-percent" id="progress-percent-${treeId}">${currentTierProgressPercent.toFixed(1)}%</div>
                    </div>`;
            }
            
            // Action hint
            if (nextTier) {
                html += `<div class="structure-action-hint" style="${nextTierEnabled ? 'color: rgba(255, 130, 130, 0.7);' : ''}">${nextTierEnabled ? 'Click to pause research' : 'Click to start research'}</div>`;
            }
        } else {
            // Collapsed state - show minimal info with physics badge
            const physicsBadge = this.physicsDisplay ? this.physicsDisplay.createPhysicsBadge(treeId) : '';
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
                    <span style="font-size: 10px; color: rgba(255, 255, 255, 0.6);">${completedTranches}/${totalTranches} tranches${physicsBadge}</span>
                    <span style="font-size: 9px; color: rgba(74, 158, 255, 0.7);">Click to expand</span>
                </div>`;
        }

        html += `
                </div>
            </div>`;
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
        const researchState = this.gameState?.tech_tree?.research_state || this.gameState?.research;
        if (!this.gameState || !researchState) return null;
        
        const treeState = researchState[treeId];
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
        const researchState = this.gameState?.tech_tree?.research_state || this.gameState?.research;
        if (!this.gameState || !researchState) return null;
        
        const treeState = researchState[treeId];
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
        // Check both tech_tree.research_state (new format) and research (legacy format)
        const researchState = this.gameState?.tech_tree?.research_state || this.gameState?.research;
        
        if (!this.gameState || !researchState) {
            return { tranches_completed: 0, enabled: false, progress: 0 };
        }
        
        const treeState = researchState[treeId];
        if (!treeState) {
            return { tranches_completed: 0, enabled: false, progress: 0 };
        }

        return treeState[tierId] || { tranches_completed: 0, enabled: false, progress: 0 };
    }
    
    /**
     * Calculate tier cost in FLOPS (matching TechTree.addResearchProgress logic)
     * @param {Object} tierDef - Tier definition from research data
     * @param {number} tierIndex - Index of the tier in its tree/subcategory
     * @returns {number} Total tier cost in FLOPS
     */
    calculateTierCostFLOPS(tierDef, tierIndex = 0) {
        const EFLOPS_TO_FLOPS = 1e18;
        const totalTranches = tierDef.tranches || 10;
        
        let tierCostEFLOPSDays;
        if (tierDef.tier_cost_eflops_days !== undefined) {
            tierCostEFLOPSDays = tierDef.tier_cost_eflops_days;
        } else if (tierDef.tranche_cost_intelligence !== undefined) {
            // Legacy: convert per-tranche cost to total tier cost
            const legacyCost = tierDef.tranche_cost_intelligence;
            const legacyCostEFLOPSDays = legacyCost / (EFLOPS_TO_FLOPS * 86400);
            // If it's less than 50 EFLOPS-days, it's probably per-tranche
            if (legacyCostEFLOPSDays < 50) {
                tierCostEFLOPSDays = legacyCostEFLOPSDays * totalTranches;
            } else {
                tierCostEFLOPSDays = legacyCostEFLOPSDays;
            }
        } else {
            // Default: tier 1 costs 100 EFLOPS-days, each subsequent tier costs 3x more
            // Must match tech_tree.js addResearchProgress logic!
            const baseCostEFLOPSDays = 100;
            // Each tier costs 3x more than the previous tier (gentler progression)
            tierCostEFLOPSDays = baseCostEFLOPSDays * Math.pow(3, tierIndex);
        }
        
        // Convert to FLOPS (same units as progress: FLOPS * days)
        return tierCostEFLOPSDays * EFLOPS_TO_FLOPS;
    }
    
    /**
     * Calculate smooth progress percentage using the progress field
     * This provides sub-tranche granularity for smooth progress bar updates
     * @param {Object} tierProgress - Tier progress from getTierProgress
     * @param {Object} tierDef - Tier definition
     * @param {number} tierIndex - Index of the tier in its tree/subcategory
     * @returns {number} Progress percentage (0-100)
     */
    calculateSmoothProgressPercent(tierProgress, tierDef, tierIndex = 0) {
        const totalTranches = tierDef.tranches || 10;
        const tranchesCompleted = tierProgress.tranches_completed || 0;
        
        // If tier is complete, return 100%
        if (tranchesCompleted >= totalTranches) {
            return 100;
        }
        
        // If we have the continuous progress field, use it for smooth percentage
        const progress = tierProgress.progress || 0;
        if (progress > 0) {
            const totalCost = this.calculateTierCostFLOPS(tierDef, tierIndex);
            if (totalCost > 0) {
                return Math.min(100, (progress / totalCost) * 100);
            }
        }
        
        // Fallback to tranche-based calculation
        return (tranchesCompleted / totalTranches) * 100;
    }
    
    /**
     * Check if research state has changed in a way that requires full re-render
     * (e.g., tier completed and next tier auto-enabled)
     * @param {Object} prevState - Previous game state
     * @param {Object} newState - New game state
     * @returns {boolean} True if full re-render needed
     */
    hasResearchStateChanged(prevState, newState) {
        if (!prevState || !newState || !this.researchData) return false;
        
        const prevResearch = prevState?.tech_tree?.research_state || prevState?.research || {};
        const newResearch = newState?.tech_tree?.research_state || newState?.research || {};
        
        // Check each research tree for significant changes
        for (const [treeId, treeData] of Object.entries(this.researchData)) {
            const prevTree = prevResearch[treeId] || {};
            const newTree = newResearch[treeId] || {};
            
            // All trees are now regular (no subcategory handling needed)
            if (treeData.tiers) {
                for (const tier of treeData.tiers) {
                    const prevTier = prevTree[tier.id] || {};
                    const newTier = newTree[tier.id] || {};
                    
                    // Check if enabled state changed
                    if ((prevTier.enabled || false) !== (newTier.enabled || false)) {
                        return true;
                    }
                    
                    // Check if tier just completed
                    const maxTranches = tier.tranches || 10;
                    const prevComplete = (prevTier.tranches_completed || 0) >= maxTranches;
                    const newComplete = (newTier.tranches_completed || 0) >= maxTranches;
                    if (!prevComplete && newComplete) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    async toggleResearch(treeId, tierId, enabled) {
        // Toggle research tier enabled/disabled
        try {
            if (typeof gameEngine === 'undefined') {
                return;
            }
            
            if (!this.researchData) {
                return;
            }
            
            // Tree key is just the treeId (no more subcategory handling needed)
            const treeKey = treeId;
            
            // Find the card element
            const cardId = `research-${treeKey}`;
            const card = document.getElementById(cardId);
            const statusIndicator = document.getElementById(`status-${treeKey}`);
            
            // Immediately update the card state for instant feedback
            if (card) {
                if (enabled) {
                    card.classList.add('research-enabled');
                    if (statusIndicator) {
                        statusIndicator.textContent = '● Researching';
                        statusIndicator.style.color = 'rgba(74, 158, 255, 0.9)';
                    }
                } else {
                    card.classList.remove('research-enabled');
                    if (statusIndicator) {
                        statusIndicator.textContent = '';
                    }
                }
            }
            
            const response = await gameEngine.performAction('allocate_research', {
                tree_id: treeId,
                tier_id: tierId,
                enabled: enabled
            });
            
            if (response.success) {
                // Get the latest game state from the engine
                const latestState = gameEngine.getGameState ? gameEngine.getGameState() : null;
                if (latestState) {
                    this.gameState = latestState;
                }
                
                // If enabling, expand the research item to show details
                if (enabled) {
                    this.expandedTrees.add(treeKey);
                }
                
                // Re-render with updated state
                this.render();
            } else {
                // Revert card state on failure
                if (card) {
                    if (enabled) {
                        card.classList.remove('research-enabled');
                        if (statusIndicator) {
                            statusIndicator.textContent = '';
                        }
                    } else {
                        card.classList.add('research-enabled');
                        if (statusIndicator) {
                            statusIndicator.textContent = '● Researching';
                            statusIndicator.style.color = 'rgba(74, 158, 255, 0.9)';
                        }
                    }
                }
                const errorMsg = response.error || 'Unknown error';
                window.toast?.error(`Failed to toggle research: ${errorMsg}`);
            }
        } catch (error) {
            console.error('Error toggling research:', error);
            window.toast?.error('Failed to toggle research: ' + (error.message || 'Unknown error'));
            
            // Revert card state on error
            const cardId = `research-${treeId}`;
            const card = document.getElementById(cardId);
            const statusIndicator = document.getElementById(`status-${treeId}`);
            if (card) {
                if (!enabled) {
                    card.classList.add('research-enabled');
                    if (statusIndicator) {
                        statusIndicator.textContent = '● Researching';
                        statusIndicator.style.color = 'rgba(74, 158, 255, 0.9)';
                    }
                } else {
                    card.classList.remove('research-enabled');
                    if (statusIndicator) {
                        statusIndicator.textContent = '';
                    }
                }
            }
        }
    }
    
    async toggleCategory(category, enabled) {
        // Toggle all research in a category
        try {
            if (typeof gameEngine === 'undefined') {
                return;
            }
            
            const response = await gameEngine.performAction('toggle_research_category', {
                category: category,
                enabled: enabled
            });
            
            if (response.success) {
                // Get the latest game state from the engine
                const latestState = gameEngine.getGameState ? gameEngine.getGameState() : null;
                if (latestState) {
                    this.gameState = latestState;
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
                        // All trees are now top-level
                        this.expandedTrees.add(treeId);
                    });
                }
                
                // Re-render with updated state
                this.render();
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
        const currentTier = this.getCurrentTier(treeId, null);
        if (!currentTier) {
            window.toast?.success('All research in this tree is complete!');
            return;
        }

        // Expand/collapse the tree content
        this.toggleTreeExpansion(treeId);
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
            window.toast?.error(error.message || 'Research allocation failed');
        }
    }

    update(gameState) {
        const previousGameState = this.gameState;
        this.gameState = gameState;

        // Update physics display from game state
        if (this.physicsDisplay && gameState) {
            this.physicsDisplay.updateFromGameState(gameState);
        }

        if (!this.researchData) return;

        // If container is empty or doesn't have research cards rendered, render first
        if (!this.container.querySelector('.research-card, .structure-card-enhanced.research-card')) {
            this.render();
            return;
        }
        
        // Check if any tier has completed and triggered auto-enable of next tier
        // This requires a full re-render to show the new active research
        if (this.hasResearchStateChanged(previousGameState, gameState)) {
            this.render();
            return;
        }
        
        // Update enabled research state on cards
        // Check both tech_tree.research_state (new format) and research (legacy format)
        const researchState = gameState.tech_tree?.research_state || gameState.research || {};
        
        // Cache research cards to avoid repeated queries (works with both old and new styles)
        const researchCards = Array.from(this.container.querySelectorAll('.research-card, .structure-card-enhanced.research-card'));
        researchCards.forEach(card => {
            const treeId = card.getAttribute('data-tree-id');
            const tierId = card.getAttribute('data-tier-id');
            const subcatId = card.getAttribute('data-subcat-id');
            
            if (!treeId || !tierId) return;
            
            // Check if this tier is enabled
            const treeState = researchState[treeId];
            if (!treeState) return;
            
            const tierState = treeState[tierId] || {};
            const shouldBeEnabled = tierState.enabled || false;
            const statusIndicator = document.getElementById(`status-${card.id.replace('research-', '')}`);
            const currentlyEnabled = card.classList.contains('research-enabled');
            
            // Only update if state changed to avoid unnecessary DOM writes
            if (shouldBeEnabled !== currentlyEnabled) {
                if (shouldBeEnabled) {
                    card.classList.add('research-enabled');
                    if (statusIndicator) {
                        statusIndicator.textContent = '● Researching';
                        statusIndicator.style.color = 'rgba(74, 158, 255, 0.9)';
                    }
                } else {
                    card.classList.remove('research-enabled');
                    if (statusIndicator) {
                        statusIndicator.textContent = '';
                    }
                }
            }
            
            // Update progress bars and tranche counts
            if (shouldBeEnabled && tierState.tranches_completed !== undefined) {
                const tierDefAndIndex = this.getTierDefinitionWithIndex(treeId, tierId, subcatId);
                if (tierDefAndIndex) {
                    const { tierDef, tierIndex } = tierDefAndIndex;
                    
                    // Use smooth progress calculation for sub-tranche granularity
                    const progressPercent = this.calculateSmoothProgressPercent(tierState, tierDef, tierIndex);
                    
                    const progressBar = document.getElementById(`progress-bar-${card.id.replace('research-', '')}`);
                    const progressPercentEl = document.getElementById(`progress-percent-${card.id.replace('research-', '')}`);
                    
                    if (progressBar) {
                        progressBar.style.width = `${Math.min(100, Math.max(0, progressPercent))}%`;
                    }
                    if (progressPercentEl) {
                        progressPercentEl.textContent = `${progressPercent.toFixed(1)}%`;
                    }
                    
                    // Update total tranche count across all tiers
                    const tranchesEl = document.getElementById(`tranches-${treeId}`);
                    if (tranchesEl) {
                        const treeData = this.researchData[treeId];
                        if (treeData && treeData.tiers) {
                            let totalTranches = 0;
                            let completedTranches = 0;
                            treeData.tiers.forEach(tier => {
                                const maxTranches = tier.tranches || 10;
                                totalTranches += maxTranches;
                                const tierProgress = treeState[tier.id];
                                completedTranches += (tierProgress?.tranches_completed || 0);
                            });
                            tranchesEl.textContent = `${completedTranches} / ${totalTranches} tranches`;
                        }
                    }
                    
                    // Update time estimate using smooth progress
                    if (gameState.research_allocation_info) {
                        const treeAlloc = gameState.research_allocation_info[treeId];
                        if (treeAlloc && treeAlloc[tierId] !== undefined) {
                            const allocatedFLOPS = treeAlloc[tierId];
                            if (allocatedFLOPS > 0) {
                                const totalCost = this.calculateTierCostFLOPS(tierDef, tierIndex);
                                const currentProgress = tierState.progress || 0;
                                const remainingFLOPS = totalCost - currentProgress;
                                let timeToComplete = Infinity;
                                
                                if (remainingFLOPS > 0) {
                                    timeToComplete = remainingFLOPS / allocatedFLOPS;
                                } else {
                                    timeToComplete = 0;
                                }
                                
                                const progressTimeEl = document.getElementById(`progress-time-${card.id.replace('research-', '')}`);
                                if (progressTimeEl) {
                                    if (timeToComplete === 0 || remainingFLOPS <= 0) {
                                        progressTimeEl.textContent = 'Complete';
                                    } else if (timeToComplete === Infinity || !isFinite(timeToComplete)) {
                                        progressTimeEl.textContent = '—';
                                    } else {
                                        progressTimeEl.textContent = FormatUtils.formatTime(timeToComplete);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
    }
    
    getTierDefinition(treeId, tierId, subcatId) {
        const result = this.getTierDefinitionWithIndex(treeId, tierId, subcatId);
        return result ? result.tierDef : null;
    }
    
    /**
     * Get tier definition along with its index (for cost calculations)
     * @param {string} treeId - Tree ID
     * @param {string} tierId - Tier ID
     * @param {string} subcatId - Unused, kept for compatibility
     * @returns {Object|null} { tierDef, tierIndex } or null
     */
    getTierDefinitionWithIndex(treeId, tierId, subcatId) {
        if (!this.researchData) return null;
        
        const treeData = this.researchData[treeId];
        if (!treeData) return null;
        
        // All trees are now regular (no subcategory handling needed)
        if (treeData.tiers) {
            const tierIndex = treeData.tiers.findIndex(t => t.id === tierId);
            if (tierIndex >= 0) {
                return { tierDef: treeData.tiers[tierIndex], tierIndex };
            }
        }
        
        return null;
    }
}

// Event listeners are handled inline via onchange handlers for toggle circles
