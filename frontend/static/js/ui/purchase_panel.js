/** Purchase panel UI component */
class PurchasePanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.buildings = null;
        this.orbitalZones = null;
        this.economicRules = null;
        this.hotkeys = {};
        this.selectedZone = null; // No zone selected by default
        this.collapsedCategories = new Set(); // Track collapsed categories
        
        // Cached energy values from economic rules (with fallbacks)
        this.STRUCTURE_BASE_ENERGY_COST = 250000;  // 250 kW, updated from economic rules
        
        // Performance optimization: Cache DOM elements
        this.cachedElements = {
            purchaseItems: null,
            buildingCards: null,
            buildingProgressContainers: null,
            lastCacheTime: 0
        };
        this.cacheValidFor = 1000; // Cache for 1 second
        
        // Throttle updates - only update if values changed
        this.lastUpdateState = {};
        
        this.init();
        this.loadData();
    }
    
    setSelectedZone(zoneId) {
        this.selectedZone = zoneId;
        this.render(); // Re-render to show zone-specific info
    }

    async loadData() {
        try {
            // Load buildings and economic rules in parallel
            const [buildingsResponse, economicRulesResponse] = await Promise.all([
                fetch('/game_data/buildings.json'),
                fetch('/game_data/economic_rules.json')
            ]);
            
            const buildingsData = await buildingsResponse.json();
            const rawBuildings = buildingsData.buildings || buildingsData;
            
            // Load economic rules
            try {
                this.economicRules = await economicRulesResponse.json();
                this.STRUCTURE_BASE_ENERGY_COST = this.economicRules?.structures?.base_energy_cost_w ?? 250000;
            } catch (e) {
                console.warn('Failed to load economic rules:', e);
                this.economicRules = null;
            }
            
            // Convert to flat list with specific ordering
            if (rawBuildings && typeof rawBuildings === 'object' && !Array.isArray(rawBuildings)) {
                // Check if it's the new format (has building IDs as keys)
                const buildingKeys = Object.keys(rawBuildings);
                if (buildingKeys.length > 0 && rawBuildings[buildingKeys[0]] && rawBuildings[buildingKeys[0]].id) {
                    // Define the order: methalox_refinery first, then power_station, data_center, mass_driver
                    const order = ['methalox_refinery', 'power_station', 'data_center', 'mass_driver'];
                    
                    // Store buildings in a flat array with the specified order
                    this.buildings = [];
                    
                    // First, add buildings in the specified order
                    for (const buildingId of order) {
                        if (rawBuildings[buildingId]) {
                            const building = rawBuildings[buildingId];
                            if (!building.id) {
                                building.id = buildingId;
                            }
                            this.buildings.push(building);
                        }
                    }
                    
                    // Then add any other buildings not in the order list (for future extensibility)
                    for (const [buildingId, building] of Object.entries(rawBuildings)) {
                        if (!order.includes(buildingId)) {
                            if (!building.id) {
                                building.id = buildingId;
                            }
                            this.buildings.push(building);
                        }
                    }
                } else {
                    // Old format - convert to flat array
                    this.buildings = Object.values(rawBuildings || {});
                }
            } else {
                // Old format - use as is (should be array)
                this.buildings = Array.isArray(rawBuildings) ? rawBuildings : Object.values(rawBuildings || {});
            }
            
            // Load orbital zones
            const zonesResponse = await fetch('/game_data/orbital_mechanics.json');
            const zonesData = await zonesResponse.json();
            this.orbitalZones = zonesData.orbital_zones || zonesData;
            
            this.render();
        } catch (error) {
            console.error('Failed to load data:', error);
            this.container.innerHTML = `<div>Error loading buildings: ${error.message}</div>`;
        }
    }

    init() {
        // Set up hotkey listeners
        document.addEventListener('keydown', (e) => {
                if (this.hotkeys[e.key.toLowerCase()]) {
                    e.preventDefault();
                    const item = this.hotkeys[e.key.toLowerCase()];
                    const element = document.getElementById(`building-${item.buildingId}`) || document.getElementById(`unit-${item.buildingId}`);
                    if (element && !element.classList.contains('disabled')) {
                        if (item.category === 'units' || item.category === 'probes') {
                            this.purchaseItem(item.category, item.buildingId);
                        } else {
                            // For buildings, toggle construction
                            const card = element.querySelector('.building-card[data-building-id]');
                            if (card && !card.classList.contains('disabled')) {
                                const isCurrentlyEnabled = card.classList.contains('construction-enabled');
                                this.toggleConstruction(item.category, item.buildingId, !isCurrentlyEnabled);
                            }
                        }
                    }
                }
        });
    }

    render() {
        if (!this.buildings || !this.orbitalZones) {
            this.container.innerHTML = '<div class="probe-summary-panel"><div class="probe-summary-title">Structures</div><div class="probe-summary-item"><div class="probe-summary-value">Loading buildings...</div></div></div>';
            return;
        }

        let html = '<div class="probe-summary-panel">';
        html += '<div class="probe-summary-title">Structures</div>';
        
        // Show zone selection status as a summary item
        html += '<div class="probe-summary-item">';
        html += '<div class="probe-summary-label">Zone</div>';
        if (this.selectedZone) {
            const zone = this.orbitalZones.find(z => z.id === this.selectedZone);
            const zoneName = zone ? zone.name.replace(/\s+Orbit\s*$/i, '') : this.selectedZone;
            html += `<div class="probe-summary-value" style="color: rgba(74, 158, 255, 0.9);">${zoneName}</div>`;
        } else {
            html += `<div class="probe-summary-value" style="font-size: 9px; font-weight: normal; color: rgba(255, 255, 255, 0.5);">Click an orbital zone to view and manage its buildings</div>`;
        }
        html += '</div>';

        // Render all structures in flat list (already in correct order from loadData)
        if (Array.isArray(this.buildings) && this.buildings.length > 0) {
            html += this.renderBuildingsFlat(this.buildings);
        } else {
            html += '<div class="probe-summary-item"><div class="probe-summary-value" style="font-size: 10px; color: rgba(255, 255, 255, 0.5);">No buildings available. Check console for errors.</div></div>';
        }
        
        html += '</div>'; // Close probe-summary-panel

        this.container.innerHTML = html;
        
        // Invalidate cache when rendering
        this.cachedElements.purchaseItems = null;
        this.cachedElements.buildingCards = null;
        this.cachedElements.buildingProgressContainers = null;
        this.cachedElements.lastCacheTime = Date.now();

        // Attach event listeners for construction toggles (better than inline onclick)
        this.attachConstructionToggleHandlers();
    }

    renderCollapsibleCategory(categoryId, categoryName, buildings, buildingCategory, isCollapsed) {
        let html = '<div class="collapsible-category">';
        html += `<div class="collapsible-category-header ${isCollapsed ? 'collapsed' : ''}" onclick="purchasePanel.toggleCategory('${categoryId}')">`;
        html += `<span class="collapsible-category-title">${categoryName}</span>`;
        html += `<span class="collapsible-category-toggle">${isCollapsed ? '▶' : '▼'}</span>`;
        html += '</div>';
        html += `<div class="collapsible-category-content ${isCollapsed ? 'collapsed' : ''}">`;
        html += this.renderBuildings(buildings, buildingCategory);
        html += '</div></div>';
        return html;
    }
    
    attachConstructionToggleHandlers() {
        // Use event delegation on the container to handle clicks on building cards
        // This avoids issues with cloning and ensures handlers persist after re-renders
        // Remove any existing listener first to avoid duplicates
        if (this._constructionToggleHandler) {
            this.container.removeEventListener('click', this._constructionToggleHandler);
        }
        
        this._constructionToggleHandler = (e) => {
            // Find the closest building card element (works with both old and new styles)
            const buildingCard = e.target.closest('.building-card, .structure-card-enhanced');
            if (!buildingCard) return;
            
            // Don't trigger if clicking on disabled cards
            if (buildingCard.classList.contains('disabled')) {
                console.log('[PurchasePanel] Card is disabled, cannot toggle');
                return;
            }
            
            // Check if zone is selected before proceeding
            if (!this.selectedZone) {
                console.warn('[PurchasePanel] No zone selected, cannot toggle construction');
                window.toast?.warning('Please select an orbital zone first');
                return;
            }
            
            // Don't trigger if clicking on links or other interactive elements
            if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON' || e.target.closest('a, button')) {
                return;
            }
            
            const category = buildingCard.getAttribute('data-category');
            const buildingId = buildingCard.getAttribute('data-building-id');
            
            if (!buildingId) {
                console.warn('[PurchasePanel] No building ID found on card');
                return;
            }
            
            // Get current enabled state from the card's class
            const isCurrentlyEnabled = buildingCard.classList.contains('construction-enabled');
            const newEnabledState = !isCurrentlyEnabled;
            
            console.log('[PurchasePanel] Building card clicked:', { buildingId, zone: this.selectedZone, enabled: newEnabledState, currentlyEnabled: isCurrentlyEnabled });
            this.toggleConstruction(category, buildingId, newEnabledState);
        };
        
        this.container.addEventListener('click', this._constructionToggleHandler);
    }

    toggleCategory(category) {
        if (this.collapsedCategories.has(category)) {
            this.collapsedCategories.delete(category);
        } else {
            this.collapsedCategories.add(category);
        }
        this.render();
    }

    getBuildingCategory(building) {
        // Determine category based on building properties
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
        return 'structures'; // default
    }

    renderBuildingsFlat(buildings) {
        // Render buildings in flat list, determining category dynamically
        return this.renderBuildings(buildings, null);
    }

    renderBuildings(buildings, category) {
        let html = '';
        const hotkeys = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
        let hotkeyIndex = 0;

        buildings.forEach((building, index) => {
            const buildingId = building.id;
            const hotkey = hotkeys[hotkeyIndex % hotkeys.length];
            hotkeyIndex++;

            // Determine category if not provided
            const buildingCategory = category || this.getBuildingCategory(building);

            // Store hotkey mapping
            this.hotkeys[hotkey] = {
                category: buildingCategory,
                buildingId: buildingId
            };
            
            // Get current structure count in selected zone for geometric scaling
            const structuresByZone = this.gameState?.structures_by_zone || {};
            const zoneStructures = this.selectedZone ? (structuresByZone[this.selectedZone] || {}) : {};
            const currentCount = zoneStructures[buildingId] || 0;
            const geometricScalingExponent = Config.STRUCTURE_GEOMETRIC_SCALING_EXPONENT || 3.2;
            const geometricFactor = Math.pow(currentCount, geometricScalingExponent);
            
            // Get upgrade factors from game state
            const upgradeFactors = this.gameState?.upgrade_factors || {};
            const structureUpgrades = upgradeFactors.structure || {};
            
            // Determine header color class based on building type
            let headerClass = 'header-factory';
            if (building.power_output_mw && !building.compute_eflops) {
                headerClass = 'header-power';
            } else if (building.mining_rate_multiplier && !building.build_rate_multiplier) {
                headerClass = 'header-mining';
            } else if (building.compute_eflops) {
                headerClass = 'header-compute';
            } else if (building.build_rate_multiplier) {
                headerClass = 'header-factory';
            } else if (building.base_delta_v || building.base_capacity_kg) {
                headerClass = 'header-transport';
            } else if (building.production_rate_kg_per_day) {
                headerClass = 'header-fuel';
            }
            
            // Build stats blocks for input/output visualization
            let outputStats = [];
            let inputStats = [];
            
            // Calculate output stats based on building type
            if (building.build_rate_multiplier) {
                // Factory - probes per day
                const baseProbeBuildRate = Config.PROBE_BUILD_RATE || 20;
                const baseRate = baseProbeBuildRate * building.build_rate_multiplier;
                const perfFactor = structureUpgrades.building?.performance || 1.0;
                const scaledRate = baseRate * geometricFactor * perfFactor;
                const probesPerDay = scaledRate / Config.PROBE_MASS;
                outputStats.push({ label: 'Output', value: this.formatScientific(probesPerDay), unit: 'probes/day', positive: true });
            }
            
            if (building.mining_rate_multiplier && !building.build_rate_multiplier) {
                // Mining - kg per day
                const baseProbeMiningRate = Config.PROBE_HARVEST_RATE || 100;
                const baseRate = baseProbeMiningRate * building.mining_rate_multiplier;
                const perfFactor = structureUpgrades.mining?.performance || 1.0;
                const scaledRate = baseRate * geometricFactor * perfFactor;
                outputStats.push({ label: 'Mining Rate', value: this.formatScientific(scaledRate), unit: 'kg/day', positive: true });
            }
            
            if (building.power_output_mw) {
                // Power station
                const basePowerMW = building.power_output_mw;
                const perfFactor = structureUpgrades.energy?.performance || 1.0;
                const buildingExponent = building.geometric_scaling_exponent || geometricScalingExponent;
                const afterUpgradeCount = currentCount + 1;
                const afterUpgradeGeometricFactor = Math.pow(afterUpgradeCount, buildingExponent);
                const scaledPowerMW = basePowerMW * afterUpgradeGeometricFactor * perfFactor;
                const scaledPowerW = scaledPowerMW * 1e6;
                outputStats.push({ label: 'Power Output', value: this.formatScientific(scaledPowerW), unit: 'W', positive: true });
            }
            
            if (building.compute_eflops) {
                // Data center
                const baseComputeEFLOPS = building.compute_eflops;
                const perfFactor = structureUpgrades.compute?.performance || 1.0;
                const buildingExponent = building.geometric_scaling_exponent || geometricScalingExponent;
                const afterUpgradeCount = currentCount + 1;
                const afterUpgradeGeometricFactor = Math.pow(afterUpgradeCount, buildingExponent);
                const scaledComputeEFLOPS = baseComputeEFLOPS * afterUpgradeGeometricFactor * perfFactor;
                const scaledComputeFLOPS = scaledComputeEFLOPS * 1e18;
                outputStats.push({ label: 'Compute', value: this.formatScientific(scaledComputeFLOPS), unit: 'FLOPS', positive: true });
            }
            
            if (building.base_delta_v || building.base_muzzle_velocity_km_s) {
                // Mass driver
                const deltaV = building.base_muzzle_velocity_km_s || (building.base_delta_v / 1000);
                outputStats.push({ label: 'Delta-V', value: deltaV.toFixed(1), unit: 'km/s', positive: true });
            }
            
            if (building.production_rate_kg_per_day) {
                // Methalox refinery
                const baseRate = building.production_rate_kg_per_day;
                const totalRate = baseRate * (currentCount + 1);
                outputStats.push({ label: 'Fuel Output', value: this.formatScientific(totalRate), unit: 'kg/day', positive: true });
            }
            
            // Calculate input stats (energy cost)
            if (building.energy_cost_multiplier && building.energy_cost_multiplier > 0) {
                const energyCost = this.STRUCTURE_BASE_ENERGY_COST * building.energy_cost_multiplier;
                inputStats.push({ label: 'Power Draw', value: this.formatScientific(energyCost), unit: 'W', negative: true });
            }
            
            // Zone limit info for methalox
            let zoneLimitInfo = '';
            if (building.max_per_zone && this.selectedZone) {
                const zoneLimit = building.max_per_zone[this.selectedZone];
                if (zoneLimit !== undefined && zoneLimit > 0) {
                    zoneLimitInfo = `${currentCount}/${zoneLimit} max`;
                }
            }
            
            // Check if building is allowed in selected zone
            let isAllowed = true;
            let atZoneLimit = false;
            let zoneLimitReason = '';
            if (this.selectedZone) {
                const zone = this.orbitalZones.find(z => z.id === this.selectedZone);
                const isDysonZone = zone && zone.is_dyson_zone;
                
                if (isDysonZone && buildingCategory === 'mining') {
                    isAllowed = false;
                } else if (isDysonZone) {
                    isAllowed = true;
                } else {
                    const allowedZones = building.allowed_orbital_zones || [];
                    isAllowed = allowedZones.includes(this.selectedZone);
                }
                
                if (isAllowed && building.max_per_zone) {
                    const zoneLimit = building.max_per_zone[this.selectedZone];
                    if (zoneLimit !== undefined && zoneLimit > 0) {
                        if (currentCount >= zoneLimit) {
                            atZoneLimit = true;
                            zoneLimitReason = `Zone limit reached (${currentCount}/${zoneLimit})`;
                        }
                    }
                }
            }
            
            const disabledClass = (!this.selectedZone || !isAllowed || atZoneLimit) ? 'disabled' : '';
            
            // Build stats grid HTML
            let statsGridHtml = '';
            if (outputStats.length > 0 || inputStats.length > 0) {
                statsGridHtml = '<div class="structure-stats-grid">';
                outputStats.forEach(stat => {
                    statsGridHtml += `
                        <div class="structure-stat-block output">
                            <div class="structure-stat-label">${stat.label}</div>
                            <div class="structure-stat-value positive">${stat.value}<span class="structure-stat-unit">${stat.unit}</span></div>
                        </div>`;
                });
                inputStats.forEach(stat => {
                    statsGridHtml += `
                        <div class="structure-stat-block input">
                            <div class="structure-stat-label">${stat.label}</div>
                            <div class="structure-stat-value negative">${stat.value}<span class="structure-stat-unit">${stat.unit}</span></div>
                        </div>`;
                });
                statsGridHtml += '</div>';
            }
            
            // Build action hint
            let actionHint = '';
            if (!this.selectedZone) {
                actionHint = '<div class="structure-zone-notice">Select a zone to enable construction</div>';
            } else if (!isAllowed) {
                actionHint = `<div class="structure-zone-notice">Not available in ${this.selectedZone}</div>`;
            } else if (atZoneLimit) {
                actionHint = `<div class="structure-zone-notice">${zoneLimitReason}</div>`;
            } else {
                actionHint = '<div class="structure-action-hint">Click to toggle construction</div>';
            }
            
            html += `
                <div class="structure-card-enhanced building-card ${disabledClass}" 
                     id="building-${buildingId}" 
                     data-building-id="${buildingId}" 
                     data-category="${buildingCategory}">
                    <div class="structure-card-header ${headerClass}">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span>${building.name}</span>
                            <span class="hotkey-badge">${hotkey.toUpperCase()}</span>
                        </div>
                        <div class="status-badge" id="status-${buildingId}">
                            ${zoneLimitInfo ? `<span style="opacity: 0.7;">${zoneLimitInfo}</span>` : ''}
                        </div>
                    </div>
                    <div class="structure-card-body">
                        ${building.description ? `<div class="structure-card-description">${building.description}</div>` : ''}
                        ${statsGridHtml}
                        <div class="structure-cost-row">
                            <div class="structure-cost-item">
                                <div class="structure-cost-icon metal">M</div>
                                <div>
                                    <div class="structure-cost-label">Build Cost</div>
                                    <div class="structure-cost-value" id="cost-${buildingId}">${this.formatScientific(this.getBuildingCost(building, buildingId))} kg</div>
                                </div>
                            </div>
                            <div class="structure-count-badge" id="count-${buildingId}">${currentCount} built</div>
                            ${currentCount > 0 ? `
                            <button class="recycle-structure-btn"
                                    id="recycle-btn-${buildingId}"
                                    onclick="event.stopPropagation(); purchasePanel.recycleStructure('${buildingId}')"
                                    title="Recycle 1 structure (75% metal, 25% slag)">
                                Recycle
                            </button>` : ''}
                        </div>
                        <div class="structure-progress-section building-progress-container" id="progress-${buildingId}">
                            <div class="structure-progress-header">
                                <span class="structure-progress-title">Construction Progress</span>
                                <span class="structure-progress-time" id="progress-time-${buildingId}">—</span>
                            </div>
                            <div class="structure-progress-bar-container">
                                <div class="structure-progress-bar" id="progress-bar-${buildingId}" style="width: 0%;"></div>
                            </div>
                            <div class="structure-progress-percent" id="progress-percent-${buildingId}">0%</div>
                        </div>
                        ${actionHint}
                    </div>
                </div>
            `;
        });

        return html;
    }

    renderUnits(units) {
        let html = '';
        const hotkeys = ['a', 's', 'd', 'f', 'g'];
        let hotkeyIndex = 0;

        units.forEach(unit => {
            const unitId = unit.id;
            const hotkey = hotkeys[hotkeyIndex % hotkeys.length];
            hotkeyIndex++;

            this.hotkeys[hotkey] = {
                category: 'units',
                buildingId: unitId
            };

            html += `
                <div class="purchase-item" id="unit-${unitId}" data-unit-id="${unitId}">
                    <div class="purchase-item-name">
                        ${unit.name}
                        <span class="purchase-hotkey">[${hotkey.toUpperCase()}]</span>
                    </div>
                    <div class="purchase-item-description">${unit.description || ''}</div>
                    <div class="purchase-item-cost">
                        <div class="cost-item">
                            <span class="cost-label">Metal:</span>
                            <span class="cost-value">${this.formatNumber(unit.base_cost_metal)}</span>
                        </div>
                        <div class="cost-item">
                            <span class="cost-label">Energy:</span>
                            <span class="cost-value">${this.formatNumber(unit.base_cost_energy)}</span>
                        </div>
                    </div>
                    <div class="purchase-item-count" id="count-${unitId}">Count: 0</div>
                </div>
            `;
        });

        return html;
    }

    formatNumber(value) {
        if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
        if (value >= 1e3) return (value / 1e3).toFixed(1) + 'k';
        return value.toString();
    }
    
    /**
     * Format number in scientific notation for structure stats
     * @param {number} value - Number to format
     * @param {number} precision - Significant figures (default: 2)
     * @returns {string} Formatted number in scientific notation
     */
    formatScientific(value, precision = 2) {
        if (value === 0 || !value || isNaN(value) || !isFinite(value)) {
            return '0';
        }
        // Use exponential notation for all values
        return value.toExponential(precision);
    }
    
    getBuildingCost(building, buildingId = null) {
        let baseCost = 0;
        
        // New format: calculate from mass_multiplier
        if (building.mass_multiplier !== undefined) {
            const baseProbeMass = Config.PROBE_MASS || 100; // kg
            baseCost = baseProbeMass * building.mass_multiplier;
        } else if (building.mass_kg !== undefined) {
            // Direct mass specification fallback
            baseCost = building.mass_kg;
        } else {
            // Legacy format: use base_cost_metal
            baseCost = building.base_cost_metal || 0;
        }
        
        // Methalox refineries use flat cost (no geometric scaling)
        // They have zone limits instead of exponential cost scaling
        // Methalox refineries and mass drivers use flat scaling (no geometric increase)
        if (buildingId === 'methalox_refinery' || buildingId === 'mass_driver') {
            return baseCost;
        }
        
        // Apply exponential scaling if zone and building ID are provided
        if (this.selectedZone && buildingId && this.gameState && baseCost > 0) {
            const structuresByZone = this.gameState.structures_by_zone || {};
            const zoneStructures = structuresByZone[this.selectedZone] || {};
            const currentCount = zoneStructures[buildingId] || 0;
            // Next building will cost baseCost * (currentCount + 1)^exponent
            const geometricScalingExponent = Config.STRUCTURE_GEOMETRIC_SCALING_EXPONENT || 3.2;
            const scalingFactor = Math.pow(currentCount + 1, geometricScalingExponent);
            return baseCost * scalingFactor;
        }
        
        return baseCost;
    }

    async purchaseItem(category, buildingId) {
        // Legacy method - now redirects to toggleConstruction
        await this.toggleConstruction(category, buildingId, true);
    }
    
    async toggleConstruction(category, buildingId, enabled) {
        try {
            console.log('[PurchasePanel] toggleConstruction called:', { category, buildingId, enabled, selectedZone: this.selectedZone });
            
            if (category === 'units' || category === 'probes') {
                // Probes still use purchase_probe
                const zoneId = this.selectedZone || 'mercury'; // Default to mercury if no zone selected
                await gameEngine.performAction('purchase_probe', {
                    probe_type: buildingId,
                    zone_id: zoneId
                });
            } else {
                // Buildings use toggle construction - require zone selection
                if (!this.selectedZone) {
                    window.toast?.warning('Please select an orbital zone first');
                    // Revert card state
                    const card = document.getElementById(`building-${buildingId}`);
                    const statusIndicator = document.getElementById(`status-${buildingId}`);
                    if (card) {
                        if (!enabled) {
                            card.classList.add('construction-enabled');
                            if (statusIndicator) {
                                statusIndicator.innerHTML = '<span class="pulse-dot"></span> BUILDING';
                                statusIndicator.classList.add('active');
                            }
                        } else {
                            card.classList.remove('construction-enabled');
                            if (statusIndicator) {
                                statusIndicator.innerHTML = '';
                                statusIndicator.classList.remove('active');
                            }
                        }
                    }
                    return;
                }
                
                // Buildings use toggle construction
                const actionData = {
                    building_id: buildingId,
                    zone_id: this.selectedZone,
                    enabled: enabled
                };
                console.log('[PurchasePanel] Sending purchase_structure action:', actionData);
                
                const response = await gameEngine.performAction('purchase_structure', actionData);
                
                console.log('[PurchasePanel] Action response:', response);
                
                // Check both response.success (from worker) and response.result.success (from engine)
                const actionSuccess = response.success && response.result && response.result.success !== false;
                
                if (actionSuccess) {
                    console.log('[PurchasePanel] Construction toggled successfully:', { buildingId, enabled, result: response.result });
                    
                    // Immediately update the card state for instant feedback
                    // The update() method will sync it with gameState on next frame
                    const card = document.getElementById(`building-${buildingId}`);
                    const statusIndicator = document.getElementById(`status-${buildingId}`);
                    if (card) {
                        if (enabled) {
                            card.classList.add('construction-enabled');
                            if (statusIndicator) {
                                statusIndicator.innerHTML = '<span class="pulse-dot"></span> BUILDING';
                                statusIndicator.classList.add('active');
                            }
                        } else {
                            card.classList.remove('construction-enabled');
                            if (statusIndicator) {
                                statusIndicator.innerHTML = '';
                                statusIndicator.classList.remove('active');
                            }
                        }
                    }
                } else {
                    console.warn('[PurchasePanel] Action failed:', response);
                    const errorMsg = response.result?.error || response.error || 'Unknown error';
                    window.toast?.error(`Construction failed: ${errorMsg}`);
                    
                    // Revert card state on failure
                    const card = document.getElementById(`building-${buildingId}`);
                    const statusIndicator = document.getElementById(`status-${buildingId}`);
                    if (card) {
                        // Revert to opposite of what we tried to set
                        if (enabled) {
                            // Tried to enable but failed - remove enabled class
                            card.classList.remove('construction-enabled');
                            if (statusIndicator) {
                                statusIndicator.innerHTML = '';
                                statusIndicator.classList.remove('active');
                            }
                        } else {
                            // Tried to disable but failed - keep enabled
                            card.classList.add('construction-enabled');
                            if (statusIndicator) {
                                statusIndicator.innerHTML = '<span class="pulse-dot"></span> BUILDING';
                                statusIndicator.classList.add('active');
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[PurchasePanel] Toggle construction failed:', error);
            window.toast?.error(error.message || 'Construction failed');
            // Revert card state on error
            const card = document.getElementById(`building-${buildingId}`);
            const statusIndicator = document.getElementById(`status-${buildingId}`);
            if (card) {
                if (!enabled) {
                    card.classList.add('construction-enabled');
                    if (statusIndicator) {
                        statusIndicator.innerHTML = '<span class="pulse-dot"></span> BUILDING';
                        statusIndicator.classList.add('active');
                    }
                } else {
                    card.classList.remove('construction-enabled');
                    if (statusIndicator) {
                        statusIndicator.innerHTML = '';
                        statusIndicator.classList.remove('active');
                    }
                }
            }
        }
    }

    updateZoneInfo() {
        // Zone info removed - all buildings at 0.5 AU
    }

    update(gameState) {
        if (!gameState || !this.buildings) return;
        this.gameState = gameState;

        // Update zone info
        this.updateZoneInfo();
        
        // If container is empty or doesn't have buildings rendered, render first
        if (!this.container.querySelector('.structure-card-enhanced[data-building-id], .probe-summary-item[data-building-id]')) {
            this.render();
            return;
        }
        
        // Invalidate cache if it's been too long or if render was called
        const now = Date.now();
        if (now - this.cachedElements.lastCacheTime > this.cacheValidFor) {
            this.cachedElements.purchaseItems = null;
            this.cachedElements.buildingCards = null;
            this.cachedElements.buildingProgressContainers = null;
        }

        // Update counts and costs for buildings - zone-specific if zone is selected
        if (this.selectedZone) {
            const structuresByZone = gameState.structures_by_zone || {};
            const zoneStructures = structuresByZone[this.selectedZone] || {};
            Object.entries(zoneStructures).forEach(([buildingId, count]) => {
                const countElement = document.getElementById(`count-${buildingId}`);
                if (countElement) {
                    // Use new format for enhanced cards
                    countElement.textContent = `${count} built`;
                }
                // Update cost display (cost increases with count)
                const costElement = document.getElementById(`cost-${buildingId}`);
                if (costElement) {
                    const building = this.getBuildingById(buildingId);
                    if (building) {
                        const nextCost = this.getBuildingCost(building, buildingId);
                        costElement.textContent = `${this.formatScientific(nextCost)} kg`;
                    }
                }
            });
            // Set count to 0 and update cost for buildings not in this zone
            // Cache purchase items to avoid repeated queries (updated selector for new cards)
            if (!this.cachedElements.purchaseItems) {
                this.cachedElements.purchaseItems = Array.from(this.container.querySelectorAll('.structure-card-enhanced[data-building-id], .probe-summary-item[data-building-id]'));
                this.cachedElements.lastCacheTime = Date.now();
            }
            this.cachedElements.purchaseItems.forEach(item => {
                const buildingId = item.getAttribute('data-building-id');
                if (buildingId && !(buildingId in zoneStructures)) {
                    const countElement = document.getElementById(`count-${buildingId}`);
                    if (countElement) {
                        countElement.textContent = `0 built`;
                    }
                    // Update cost display (base cost when count is 0)
                    const costElement = document.getElementById(`cost-${buildingId}`);
                    if (costElement) {
                        const building = this.getBuildingById(buildingId);
                        if (building) {
                            const nextCost = this.getBuildingCost(building, buildingId);
                            costElement.textContent = `${this.formatScientific(nextCost)} kg`;
                        }
                    }
                }
            });
        } else {
            // No zone selected - show global counts (legacy)
            Object.entries(gameState.structures || {}).forEach(([buildingId, count]) => {
                const countElement = document.getElementById(`count-${buildingId}`);
                if (countElement) {
                    countElement.textContent = `${count} built`;
                }
            });
        }
        
        // Update enabled construction state on building cards - zone-specific
        const enabledConstruction = gameState.enabled_construction || [];
        
        // Cache building cards to avoid repeated queries (updated selector for new cards)
        if (!this.cachedElements.buildingCards) {
            this.cachedElements.buildingCards = Array.from(this.container.querySelectorAll('.structure-card-enhanced[data-building-id], .building-card[data-building-id]'));
            this.cachedElements.lastCacheTime = Date.now();
        }
        this.cachedElements.buildingCards.forEach(card => {
            const buildingId = card.getAttribute('data-building-id');
            if (buildingId && this.selectedZone) {
                // Check if this building is enabled for the selected zone
                const enabledKey = `${this.selectedZone}::${buildingId}`;
                const shouldBeEnabled = enabledConstruction.includes(enabledKey);
                const statusIndicator = document.getElementById(`status-${buildingId}`);
                const currentlyEnabled = card.classList.contains('construction-enabled');
                
                // Only update if state changed to avoid unnecessary DOM writes
                if (shouldBeEnabled !== currentlyEnabled) {
                    if (shouldBeEnabled) {
                        card.classList.add('construction-enabled');
                        if (statusIndicator) {
                            statusIndicator.innerHTML = '<span class="pulse-dot"></span> BUILDING';
                            statusIndicator.classList.add('active');
                        }
                        console.log(`[PurchasePanel] ✓ Enabled construction for ${buildingId} in ${this.selectedZone}`);
                    } else {
                        card.classList.remove('construction-enabled');
                        if (statusIndicator) {
                            statusIndicator.innerHTML = '';
                            statusIndicator.classList.remove('active');
                        }
                        console.log(`[PurchasePanel] ✗ Disabled construction for ${buildingId} in ${this.selectedZone}`);
                    }
                }
            } else if (buildingId) {
                // No zone selected - check if enabled in any zone (for legacy compatibility)
                const shouldBeEnabled = enabledConstruction.some(key => key.endsWith(`::${buildingId}`));
                const statusIndicator = document.getElementById(`status-${buildingId}`);
                const currentlyEnabled = card.classList.contains('construction-enabled');
                
                if (shouldBeEnabled !== currentlyEnabled) {
                    if (shouldBeEnabled) {
                        card.classList.add('construction-enabled');
                        if (statusIndicator) {
                            statusIndicator.innerHTML = '<span class="pulse-dot"></span> BUILDING';
                            statusIndicator.classList.add('active');
                        }
                    } else {
                        card.classList.remove('construction-enabled');
                        if (statusIndicator) {
                            statusIndicator.innerHTML = '';
                            statusIndicator.classList.remove('active');
                        }
                    }
                }
            }
        });
        
        // Update building progress - zone-specific if zone is selected
        try {
            const structureProgress = gameState.structure_construction_progress || {};
            // enabled_construction comes as an array from gameState (converted from Set in engine)
            const enabledConstruction = Array.isArray(gameState.enabled_construction) 
                ? gameState.enabled_construction 
                : [];
            
            // Get energy throttle from game state (accounts for energy limitations)
            const energyThrottle = gameState.derived?.totals?.energy_throttle || 1.0;
            
            // Cache calculations - only recalculate if relevant values changed
            const progressCacheKey = JSON.stringify({
                probeAllocations: gameState.probe_allocations_by_zone,
                enabledConstruction: enabledConstruction,
                energyThrottle: energyThrottle,
                techUpgradeFactors: gameState.tech_upgrade_factors
            });
            
            // Reuse cached calculations if nothing changed
            if (this.lastProgressCacheKey !== progressCacheKey) {
                // Calculate structure building rate per zone using same method as structure system
                const probeAllocationsByZone = gameState.probe_allocations_by_zone || {};
                const probesByZone = gameState.probes_by_zone || {};
                const techUpgradeFactors = gameState.tech_upgrade_factors || {};
                
                // Get build rate upgrade factor (same as structure system uses)
                const buildRateUpgradeFactor = techUpgradeFactors.probe_build || 1.0;
                
                // Base build rate: 20 kg/day per probe (from ProductionCalculator.BASE_BUILDING_RATE)
                // Include replication rate bonus from starting skill points
                const BASE_BUILDING_RATE = 20.0; // kg/day per probe
                const replicationRateBonus = gameState.skill_bonuses?.replication_rate_bonus || 0;
                const effectiveBuildRate = BASE_BUILDING_RATE + replicationRateBonus;
                
                // Calculate build rate per zone
                const buildRateByZone = {};
                for (const [zoneId, zoneAllocations] of Object.entries(probeAllocationsByZone)) {
                    // Get construct allocation (0-1 fraction) - this is now directly the fraction for structure building
                    let constructAllocation = zoneAllocations.construct || 0;
                    if (typeof constructAllocation === 'object' && constructAllocation !== null) {
                        // Fallback: if it's an object, sum values (legacy format)
                        constructAllocation = Object.values(constructAllocation).reduce((sum, count) => sum + (count || 0), 0);
                    }
                    constructAllocation = typeof constructAllocation === 'number' ? constructAllocation : 0;
                    
                    // Get total probes in this zone
                    const zoneProbes = probesByZone[zoneId] || {};
                    const totalProbes = Object.values(zoneProbes).reduce((sum, count) => sum + (count || 0), 0);
                    
                    // Calculate structure building probes directly from construct allocation
                    const structureBuildingProbes = totalProbes * constructAllocation;
                    
                    // Calculate base build rate with upgrade factors (same as structure system)
                    // Use effectiveBuildRate which includes skill bonus
                    const baseBuildRateKgPerDay = structureBuildingProbes * effectiveBuildRate * buildRateUpgradeFactor;
                    
                    // Apply energy throttle (same as structure system does)
                    const effectiveBuildRateKgPerDay = baseBuildRateKgPerDay * energyThrottle;
                    
                    buildRateByZone[zoneId] = effectiveBuildRateKgPerDay;
                }
                
                // Count enabled buildings per zone
                const enabledBuildingsByZone = {};
                for (const enabledKey of enabledConstruction) {
                    const [zoneId, buildingId] = enabledKey.split('::', 2);
                    if (zoneId && buildingId) {
                        if (!(zoneId in enabledBuildingsByZone)) {
                            enabledBuildingsByZone[zoneId] = [];
                        }
                        enabledBuildingsByZone[zoneId].push(enabledKey);
                    }
                }
                
                // Cache the results
                this.cachedProgressData = {
                    buildRateByZone,
                    enabledBuildingsByZone
                };
                this.lastProgressCacheKey = progressCacheKey;
            }
            
            const { buildRateByZone, enabledBuildingsByZone } = this.cachedProgressData || { buildRateByZone: {}, enabledBuildingsByZone: {} };
            
            // Cache progress containers to avoid repeated queries (works with new and old cards)
            if (!this.cachedElements.buildingProgressContainers) {
                this.cachedElements.buildingProgressContainers = Array.from(this.container.querySelectorAll('.structure-progress-section, .building-progress-container'));
                this.cachedElements.lastCacheTime = Date.now();
            }
            
            this.cachedElements.buildingProgressContainers.forEach(container => {
                const buildingId = container.id.replace('progress-', '');
                const building = this.getBuildingById(buildingId);
                if (!building) return;
                
                const costMetal = this.getBuildingCost(building, buildingId);
                let metalProgress = 0;
                let buildRatePerBuilding = 0;
                let timeToComplete = Infinity;
                
                if (this.selectedZone) {
                    // Show progress for selected zone
                    const enabledKey = `${this.selectedZone}::${buildingId}`;
                    metalProgress = structureProgress[enabledKey] || 0;
                    
                    // Get zone metal availability for throttling calculation
                    const zones = gameState.zones || {};
                    const zone = zones[this.selectedZone];
                    const storedMetal = zone?.stored_metal || 0;
                    
                    // Calculate build rate per building in this zone
                    const zoneBuildRate = buildRateByZone[this.selectedZone] || 0;
                    const numEnabledInZone = (enabledBuildingsByZone[this.selectedZone] || []).length;
                    if (numEnabledInZone > 0) {
                        buildRatePerBuilding = zoneBuildRate / numEnabledInZone; // kg/day per building
                        
                        // Account for metal throttling (same as structure system)
                        // If metal is limited, actual progress rate is reduced
                        const remainingToBuild = costMetal - metalProgress;
                        const metalNeededPerDay = buildRatePerBuilding; // 1:1 ratio
                        if (storedMetal < metalNeededPerDay && metalNeededPerDay > 0) {
                            // Metal throttling: reduce effective rate based on available metal
                            const metalThrottle = storedMetal / metalNeededPerDay;
                            buildRatePerBuilding = buildRatePerBuilding * metalThrottle;
                        }
                    }
                    
                    // Calculate time to complete based on metal progress
                    const remainingToBuild = costMetal - metalProgress;
                    timeToComplete = (buildRatePerBuilding > 0 && remainingToBuild > 0) 
                        ? remainingToBuild / buildRatePerBuilding 
                        : (remainingToBuild <= 0 ? 0 : Infinity);
                } else {
                    // No zone selected - show total progress across all zones
                    metalProgress = Object.entries(structureProgress)
                        .filter(([key]) => key.endsWith(`::${buildingId}`))
                        .reduce((sum, [, val]) => sum + val, 0);
                    
                    // Calculate total build rate across all zones for this building
                    let totalBuildRate = 0;
                    for (const [zoneId, enabledKeys] of Object.entries(enabledBuildingsByZone)) {
                        if (enabledKeys.some(key => key.endsWith(`::${buildingId}`))) {
                            const zoneBuildRate = buildRateByZone[zoneId] || 0;
                            const numEnabledInZone = enabledKeys.length;
                            if (numEnabledInZone > 0) {
                                totalBuildRate += zoneBuildRate / numEnabledInZone;
                            }
                        }
                    }
                    buildRatePerBuilding = totalBuildRate;
                    
                    // Calculate time to complete based on metal progress
                    const remainingToBuild = costMetal - metalProgress;
                    timeToComplete = (buildRatePerBuilding > 0 && remainingToBuild > 0) 
                        ? remainingToBuild / buildRatePerBuilding 
                        : (remainingToBuild <= 0 ? 0 : Infinity);
                }
                
                // Calculate metal progress percentage (this is now the only progress metric)
                const metalProgressPercent = costMetal > 0 ? (metalProgress / costMetal) * 100 : 0;
                const overallProgressPercent = metalProgressPercent;
                
                const progressPercentEl = document.getElementById(`progress-percent-${buildingId}`);
                const progressTimeEl = document.getElementById(`progress-time-${buildingId}`);
                const progressBarEl = document.getElementById(`progress-bar-${buildingId}`);
                
                // Always show the container
                container.style.display = 'block';
                
                // Update progress bar (show overall progress)
                if (progressBarEl) {
                    progressBarEl.style.width = `${Math.min(100, Math.max(0, overallProgressPercent))}%`;
                }
                
                if (progressPercentEl) {
                    progressPercentEl.textContent = `${overallProgressPercent.toFixed(1)}%`;
                }
                if (progressTimeEl) {
                    if (timeToComplete === 0 || metalProgressPercent >= 100) {
                        progressTimeEl.textContent = 'Complete';
                    } else if (timeToComplete === Infinity || !isFinite(timeToComplete)) {
                        progressTimeEl.textContent = '—';
                    } else {
                        progressTimeEl.textContent = FormatUtils.formatTime(timeToComplete);
                    }
                }
            });
        } catch (error) {
            console.error('Error updating building progress:', error);
            // Don't break the entire update if progress calculation fails
        }

        // Update counts for probes
        Object.entries(gameState.probes || {}).forEach(([probeId, count]) => {
            const countElement = document.getElementById(`count-${probeId}`);
            if (countElement) {
                countElement.textContent = `Count: ${Math.floor(count)}`;
            }
        });

        // Update affordability
        const metal = gameState.metal || 0;
        const energy = gameState.energy || 0;

        // Use cached purchase items if available
        const purchaseItems = this.cachedElements.purchaseItems || Array.from(this.container.querySelectorAll('.purchase-item'));
        purchaseItems.forEach(item => {
            const buildingId = item.dataset.buildingId || item.dataset.unitId;
            if (!buildingId) return;

            const building = this.getBuildingById(buildingId);
            if (!building) return;

            const costMetal = building.base_cost_metal || 0;
            const shouldBeDisabled = metal < costMetal;
            
            // Only update if changed to avoid unnecessary DOM writes
            if (shouldBeDisabled && !item.classList.contains('disabled')) {
                item.classList.add('disabled');
            } else if (!shouldBeDisabled && item.classList.contains('disabled')) {
                item.classList.remove('disabled');
            }
        });

        // Update recycling section
        this.updateRecyclingSection(gameState);

        // Update recycling progress (continuous recycling)
        this.updateRecyclingProgress(gameState);
    }

    getBuildingById(buildingId) {
        if (!this.buildings) return null;

        // If buildings is an array (new flat format)
        if (Array.isArray(this.buildings)) {
            return this.buildings.find(b => b.id === buildingId) || null;
        }

        // Legacy: Search through all categories
        for (const category in this.buildings) {
            const items = this.buildings[category];
            if (Array.isArray(items)) {
                const building = items.find(b => b.id === buildingId);
                if (building) return building;
            } else if (items && typeof items === 'object' && items.probes) {
                const probe = items.probes.find(p => p.id === buildingId);
                if (probe) return probe;
            }
        }
        return null;
    }

    updateRecyclingSection(gameState) {
        const recyclingSection = document.getElementById('recycling-section');
        const recyclingList = document.getElementById('recycling-list');
        
        if (!recyclingSection || !recyclingList) return;

        // Find depleted zones with factories
        const depletedZonesWithFactories = [];
        // Recycling removed - no longer zone-specific
        if (recyclingSection) {
            recyclingSection.style.display = 'none';
        }

        if (depletedZonesWithFactories.length > 0) {
            recyclingSection.style.display = 'block';
            let html = '';
            
            depletedZonesWithFactories.forEach(({ zoneId, factories }) => {
                const zone = this.orbitalZones.find(z => z.id === zoneId);
                html += `<div class="recycling-zone"><div class="recycling-zone-name">${zone?.name || zoneId}</div>`;
                
                factories.forEach(({ buildingId, count, building }) => {
                    const recyclingEfficiency = 0.75; // Base, will be updated from research
                    const metalReturn = this.getBuildingCost(building) * recyclingEfficiency;
                    
                    html += `
                        <div class="recycling-item">
                            <div class="recycling-item-name">${building.name} (${count})</div>
                            <div class="recycling-item-return">
                                Returns: ${this.formatNumber(metalReturn)} metal
                            </div>
                            <button class="recycle-button" onclick="purchasePanel.recycleFactory('${buildingId}', '${zoneId}')">
                                Recycle
                            </button>
                        </div>
                    `;
                });
                
                html += '</div>';
            });
            
            recyclingList.innerHTML = html;
        } else {
            recyclingSection.style.display = 'none';
        }
    }

    isFactory(buildingId) {
        if (Array.isArray(this.buildings)) {
            const building = this.buildings.find(b => b.id === buildingId);
            return building && building.build_rate_multiplier !== undefined;
        }
        // Legacy: check factories category
        const factories = this.buildings?.factories || [];
        return factories.some(f => f.id === buildingId);
    }

    async recycleFactory(factoryId, zoneId) {
        try {
            await gameEngine.performAction('recycle_factory', {
                factory_id: factoryId,
                zone_id: zoneId
            });
        } catch (error) {
            console.error('Recycling failed:', error);
            window.toast?.error(error.message || 'Recycling failed');
        }
    }

    /**
     * Toggle structure recycling in the currently selected zone
     * Recycling is now a continuous operation using probe build power
     * @param {string} buildingId - The building type to recycle
     */
    async recycleStructure(buildingId) {
        if (!this.selectedZone) {
            window.toast?.warning('Please select a zone first');
            return;
        }

        try {
            const result = await gameEngine.performAction('recycle_structure', {
                building_id: buildingId,
                zone_id: this.selectedZone
            });

            if (result.success && result.result) {
                const enabled = result.result.enabled;
                if (enabled) {
                    window.toast?.info(`Recycling started for ${buildingId}`);
                } else {
                    window.toast?.info(`Recycling paused for ${buildingId}`);
                }
                // Update button state immediately
                this.updateRecycleButtonState(buildingId, enabled);
            } else {
                window.toast?.error(result.result?.error || result.error || 'Recycling failed');
            }
        } catch (error) {
            console.error('Recycling failed:', error);
            window.toast?.error(error.message || 'Recycling failed');
        }
    }

    /**
     * Update the recycle button visual state
     * @param {string} buildingId - The building ID
     * @param {boolean} enabled - Whether recycling is enabled
     */
    updateRecycleButtonState(buildingId, enabled) {
        const btn = document.getElementById(`recycle-btn-${buildingId}`);
        if (btn) {
            if (enabled) {
                btn.classList.add('recycling-active');
                btn.textContent = 'Stop';
            } else {
                btn.classList.remove('recycling-active');
                btn.textContent = 'Recycle';
            }
        }
    }

    /**
     * Update recycling progress UI for all buildings
     * Called from update() method
     * @param {Object} gameState - Current game state
     */
    updateRecyclingProgress(gameState) {
        if (!this.selectedZone) return;

        const enabledRecycling = gameState.enabled_recycling || [];
        const recyclingProgress = gameState.structure_recycling_progress || {};

        // Update recycle button states
        if (this.buildings) {
            this.buildings.forEach(building => {
                const buildingId = building.id;
                const enabledKey = `${this.selectedZone}::${buildingId}`;
                const isRecycling = enabledRecycling.includes(enabledKey);

                // Update button state
                this.updateRecycleButtonState(buildingId, isRecycling);

                // Update recycling progress display if recycling is active
                const progressSection = document.getElementById(`progress-${buildingId}`);
                const progressBar = document.getElementById(`progress-bar-${buildingId}`);
                const progressPercent = document.getElementById(`progress-percent-${buildingId}`);
                const progressTitle = progressSection?.querySelector('.structure-progress-title');

                if (isRecycling && progressSection) {
                    // Show recycling progress
                    const progress = recyclingProgress[enabledKey] || 0;

                    // Get structure cost (for percentage calculation)
                    const structuresByZone = gameState.structures_by_zone || {};
                    const zoneStructures = structuresByZone[this.selectedZone] || {};
                    const currentCount = zoneStructures[buildingId] || 0;

                    if (currentCount > 0) {
                        const costMetal = this.getBuildingCost(building, buildingId);
                        const percent = costMetal > 0 ? (progress / costMetal) * 100 : 0;

                        if (progressBar) {
                            progressBar.style.width = `${Math.min(100, percent)}%`;
                            progressBar.classList.add('recycling');
                        }
                        if (progressPercent) {
                            progressPercent.textContent = `${percent.toFixed(1)}%`;
                        }
                        if (progressTitle) {
                            progressTitle.textContent = 'Recycling Progress';
                        }
                    }
                } else if (progressBar) {
                    // Reset to construction mode
                    progressBar.classList.remove('recycling');
                    if (progressTitle) {
                        progressTitle.textContent = 'Construction Progress';
                    }
                }
            });
        }
    }
}

