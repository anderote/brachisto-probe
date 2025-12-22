/** Purchase panel UI component */
class PurchasePanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.buildings = null;
        this.orbitalZones = null;
        this.hotkeys = {};
        this.selectedZone = null; // No zone selected by default
        this.collapsedCategories = new Set(); // Track collapsed categories
        this.init();
        this.loadData();
    }
    
    setSelectedZone(zoneId) {
        this.selectedZone = zoneId;
        this.render(); // Re-render to show zone-specific info
    }

    async loadData() {
        try {
            // Load buildings
            const buildingsResponse = await fetch('/game_data/buildings.json');
            const buildingsData = await buildingsResponse.json();
            this.buildings = buildingsData.buildings || buildingsData;
            
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
                            const checkbox = element.querySelector('.construction-toggle-checkbox');
                            if (checkbox) {
                                checkbox.checked = !checkbox.checked;
                                this.toggleConstruction(item.category, item.buildingId, checkbox.checked);
                            }
                        }
                    }
                }
        });
    }

    render() {
        if (!this.buildings || !this.orbitalZones) {
            this.container.innerHTML = '<div>Loading buildings...</div>';
            return;
        }

        let html = '';
        
        // Show zone selection status
        if (this.selectedZone) {
            const zone = this.orbitalZones.find(z => z.id === this.selectedZone);
            const zoneName = zone ? zone.name.replace(/\s+Orbit\s*$/i, '') : this.selectedZone;
            html += `<div class="zone-selection-header" style="padding: 10px; background: rgba(74, 158, 255, 0.2); border-bottom: 1px solid rgba(74, 158, 255, 0.3); margin-bottom: 10px;">`;
            html += `<strong>Selected Zone: ${zoneName}</strong>`;
            html += `<div style="font-size: 12px; color: rgba(255, 255, 255, 0.7); margin-top: 5px;">Buildings shown are for this zone</div>`;
            html += `</div>`;
        } else {
            html += `<div class="zone-selection-header" style="padding: 10px; background: rgba(255, 255, 255, 0.1); border-bottom: 1px solid rgba(255, 255, 255, 0.2); margin-bottom: 10px;">`;
            html += `<div style="font-size: 12px; color: rgba(255, 255, 255, 0.7);">Click an orbital zone to view and manage its buildings</div>`;
            html += `</div>`;
        }

        // Energy section (first)
        const energy = this.buildings.energy || [];
        if (energy.length > 0) {
            const isCollapsed = this.collapsedCategories.has('energy');
            html += '<div class="purchase-section">';
            html += `<div class="section-title ${isCollapsed ? 'collapsed' : ''}" onclick="purchasePanel.toggleCategory('energy')">`;
            html += '<span class="collapse-icon">▼</span>Energy</div>';
            html += `<div class="section-content ${isCollapsed ? 'collapsed' : ''}">`;
            html += this.renderBuildings(energy, 'energy');
            html += '</div></div>';
        }

        // Mining section (second)
        const mining = this.buildings.mining || [];
        if (mining.length > 0) {
            const isCollapsed = this.collapsedCategories.has('mining');
            html += '<div class="purchase-section">';
            html += `<div class="section-title ${isCollapsed ? 'collapsed' : ''}" onclick="purchasePanel.toggleCategory('mining')">`;
            html += '<span class="collapse-icon">▼</span>Mining</div>';
            html += `<div class="section-content ${isCollapsed ? 'collapsed' : ''}">`;
            html += this.renderBuildings(mining, 'mining');
            html += '</div></div>';
        }

        // Factories section (third)
        const factories = this.buildings.factories || [];
        if (factories.length > 0) {
            const isCollapsed = this.collapsedCategories.has('factories');
            html += '<div class="purchase-section">';
            html += `<div class="section-title ${isCollapsed ? 'collapsed' : ''}" onclick="purchasePanel.toggleCategory('factories')">`;
            html += '<span class="collapse-icon">▼</span>Factories</div>';
            html += `<div class="section-content ${isCollapsed ? 'collapsed' : ''}">`;
            html += this.renderBuildings(factories, 'factories');
            html += '</div></div>';
        }
        
        // Computing section
        const computing = this.buildings.computing || [];
        if (computing.length > 0) {
            const isCollapsed = this.collapsedCategories.has('computing');
            html += '<div class="purchase-section">';
            html += `<div class="section-title ${isCollapsed ? 'collapsed' : ''}" onclick="purchasePanel.toggleCategory('computing')">`;
            html += '<span class="collapse-icon">▼</span>Computing</div>';
            html += `<div class="section-content ${isCollapsed ? 'collapsed' : ''}">`;
            html += this.renderBuildings(computing, 'computing');
            html += '</div></div>';
        }

        // Transportation section
        const transportation = this.buildings.transportation || [];
        if (transportation.length > 0) {
            const isCollapsed = this.collapsedCategories.has('transportation');
            html += '<div class="purchase-section">';
            html += `<div class="section-title ${isCollapsed ? 'collapsed' : ''}" onclick="purchasePanel.toggleCategory('transportation')">`;
            html += '<span class="collapse-icon">▼</span>Transportation</div>';
            html += `<div class="section-content ${isCollapsed ? 'collapsed' : ''}">`;
            html += this.renderBuildings(transportation, 'transportation');
            html += '</div></div>';
        }

        // Specialized Units section
        if (this.buildings.specialized_units && this.buildings.specialized_units.probes) {
            const isCollapsed = this.collapsedCategories.has('probes');
            html += '<div class="purchase-section">';
            html += `<div class="section-title ${isCollapsed ? 'collapsed' : ''}" onclick="purchasePanel.toggleCategory('probes')">`;
            html += '<span class="collapse-icon">▼</span>Probes</div>';
            html += `<div class="section-content ${isCollapsed ? 'collapsed' : ''}">`;
            html += this.renderUnits(this.buildings.specialized_units.probes);
            html += '</div></div>';
        }

        // Factory recycling section (for depleted zones)
        html += '<div class="purchase-section" id="recycling-section" style="display: none;">';
        html += '<div class="section-title">Factory Recycling</div>';
        html += '<div id="recycling-list"></div>';
        html += '</div>';

        if (html === '') {
            html = '<div>No buildings available. Check console for errors.</div>';
        }

        this.container.innerHTML = html;

        // Attach event listeners for construction toggles (better than inline onclick)
        this.attachConstructionToggleHandlers();

        // Zone selector removed - all buildings at 0.5 AU
    }
    
    attachConstructionToggleHandlers() {
        // Add event listeners to all construction toggle checkboxes
        const checkboxes = this.container.querySelectorAll('.construction-toggle-checkbox');
        checkboxes.forEach(checkbox => {
            // Remove existing listeners to avoid duplicates
            const newCheckbox = checkbox.cloneNode(true);
            checkbox.parentNode.replaceChild(newCheckbox, checkbox);
            
            // Add new listener
            newCheckbox.addEventListener('change', (e) => {
                const category = e.target.getAttribute('data-category');
                const buildingId = e.target.getAttribute('data-building-id');
                const enabled = e.target.checked;
                this.toggleConstruction(category, buildingId, enabled);
            });
        });
    }

    toggleCategory(category) {
        if (this.collapsedCategories.has(category)) {
            this.collapsedCategories.delete(category);
        } else {
            this.collapsedCategories.add(category);
        }
        this.render();
    }

    renderBuildings(buildings, category) {
        let html = '';
        const hotkeys = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
        let hotkeyIndex = 0;

        buildings.forEach((building, index) => {
            const buildingId = building.id;
            const hotkey = hotkeys[hotkeyIndex % hotkeys.length];
            hotkeyIndex++;

            // Store hotkey mapping
            this.hotkeys[hotkey] = {
                category: category,
                buildingId: buildingId
            };
            
            // Format building stats for display (one stat per line)
            let statsHtml = '';
            const effects = building.effects || {};
            
            // Factory stats
            if (effects.probe_production_per_day !== undefined) {
                const probesPerDay = effects.probe_production_per_day;
                const metalPerProbe = effects.metal_per_probe || 10;
                // Use energy_per_probe_kw if available, otherwise calculate from total energy / probes per day
                let energyPerProbeKw = effects.energy_per_probe_kw;
                if (energyPerProbeKw === undefined && effects.energy_consumption_per_second !== undefined && probesPerDay > 0) {
                    energyPerProbeKw = effects.energy_consumption_per_second / probesPerDay;
                }
                
                const probesDisplay = probesPerDay >= 1e6 ? `${(probesPerDay/1e6).toFixed(1)}M` : 
                                      probesPerDay >= 1e3 ? `${(probesPerDay/1e3).toFixed(1)}k` : 
                                      probesPerDay.toFixed(2);
                
                statsHtml = '<div class="building-stats">';
                statsHtml += `<div class="building-stat-line">${probesDisplay} probes/s</div>`;
                statsHtml += `<div class="building-stat-line">${metalPerProbe.toFixed(1)} kg/probe</div>`;
                if (energyPerProbeKw !== undefined) {
                    const energyDisplay = energyPerProbeKw >= 1e3 ? `${(energyPerProbeKw/1e3).toFixed(1)} MW/probe/s` : 
                                         `${energyPerProbeKw.toFixed(0)} kW/probe/s`;
                    statsHtml += `<div class="building-stat-line">${energyDisplay}</div>`;
                }
                statsHtml += '</div>';
            } else if (effects.metal_production_per_day !== undefined) {
                // Mining building
                const metalRate = effects.metal_production_per_day;
                const powerKw = effects.energy_consumption_per_second || 0;
                const metalDisplay = metalRate >= 1e6 ? `${(metalRate/1e6).toFixed(1)}M` : 
                                     metalRate >= 1e3 ? `${(metalRate/1e3).toFixed(1)}k` : 
                                     metalRate.toFixed(1);
                const powerDisplay = powerKw >= 1e3 ? `${(powerKw/1e3).toFixed(1)}MW` : `${powerKw.toFixed(0)}kW`;
                statsHtml = '<div class="building-stats">';
                statsHtml += `<div class="building-stat-line">${metalDisplay} kg/s metal</div>`;
                statsHtml += `<div class="building-stat-line">${powerDisplay}</div>`;
                statsHtml += '</div>';
            } else if (effects.energy_production_per_second !== undefined) {
                // Energy building
                const energyRate = effects.energy_production_per_second;
                const energyDisplay = energyRate >= 1e6 ? `${(energyRate/1e6).toFixed(1)}MW` : 
                                      energyRate >= 1e3 ? `${(energyRate/1e3).toFixed(1)}kW` : 
                                      energyRate.toFixed(0) + 'W';
                statsHtml = '<div class="building-stats">';
                statsHtml += `<div class="building-stat-line">${energyDisplay}/s</div>`;
                statsHtml += '</div>';
            } else if (effects.intelligence_flops !== undefined) {
                // Computing building (orbital data center)
                const flops = effects.intelligence_flops;
                const powerKw = effects.energy_consumption_per_second || 0;
                let flopsDisplay = '';
                if (flops >= 1e21) {
                    flopsDisplay = `${(flops/1e21).toFixed(2)} ZFLOPS`;
                } else if (flops >= 1e18) {
                    flopsDisplay = `${(flops/1e18).toFixed(2)} EFLOPS`;
                } else if (flops >= 1e15) {
                    flopsDisplay = `${(flops/1e15).toFixed(2)} PFLOPS`;
                } else if (flops >= 1e12) {
                    flopsDisplay = `${(flops/1e12).toFixed(2)} TFLOPS`;
                } else {
                    flopsDisplay = flops.toExponential(2) + ' FLOPS';
                }
                const powerDisplay = powerKw >= 1e6 ? `${(powerKw/1e6).toFixed(1)}MW` : 
                                     powerKw >= 1e3 ? `${(powerKw/1e3).toFixed(1)}kW` : 
                                     `${powerKw.toFixed(0)}W`;
                statsHtml = '<div class="building-stats">';
                statsHtml += `<div class="building-stat-line">${flopsDisplay}</div>`;
                statsHtml += `<div class="building-stat-line">${powerDisplay}</div>`;
                statsHtml += '</div>';
            } else if (effects.energy_consumption_per_second !== undefined) {
                // Other building with power draw
                const powerKw = effects.energy_consumption_per_second;
                const powerDisplay = powerKw >= 1e3 ? `${(powerKw/1e3).toFixed(1)}MW` : `${powerKw.toFixed(0)}kW`;
                statsHtml = '<div class="building-stats">';
                statsHtml += `<div class="building-stat-line">Power draw: ${powerDisplay}</div>`;
                statsHtml += '</div>';
            }
            
            // Check if building is allowed in selected zone (if zone is selected)
            let isAllowed = true;
            if (this.selectedZone) {
                // Check if this is the Dyson zone
                const zone = this.orbitalZones.find(z => z.id === this.selectedZone);
                const isDysonZone = zone && zone.is_dyson_zone;
                
                // Get building category
                const buildingCategory = category;
                
                // Mining buildings cannot be built in Dyson zone (no minerals to mine)
                if (isDysonZone && buildingCategory === 'mining') {
                    isAllowed = false;
                } else if (isDysonZone) {
                    // Non-mining buildings can be built in Dyson zone even if not in allowed_orbital_zones
                    isAllowed = true;
                } else {
                    // For other zones, check allowed_orbital_zones
                    const allowedZones = building.allowed_orbital_zones || [];
                    isAllowed = allowedZones.includes(this.selectedZone);
                }
            }
            
            const disabledClass = (!this.selectedZone || !isAllowed) ? 'disabled' : '';
            
            html += `
                <div class="purchase-item ${disabledClass}" id="building-${buildingId}" data-building-id="${buildingId}" data-category="${category}">
                    <div class="purchase-item-name">
                        ${building.name}
                        <span class="purchase-hotkey">[${hotkey.toUpperCase()}]</span>
                    </div>
                    <div class="purchase-item-description">${building.description || ''}</div>
                    ${statsHtml}
                    <div class="purchase-item-cost">
                        <div class="cost-item">
                            <span class="cost-label">Metal Cost:</span>
                            <span class="cost-value">${this.formatNumber(building.base_cost_metal)}</span>
                        </div>
                    </div>
                    <div class="purchase-item-count" id="count-${buildingId}">Count: 0</div>
                    <div class="building-progress-container" id="progress-${buildingId}">
                        <div class="building-progress-label">Building Progress:</div>
                        <div class="building-progress-info">
                            <div class="building-progress-percentage" id="progress-percent-${buildingId}">0%</div>
                            <div class="building-progress-time" id="progress-time-${buildingId}">—</div>
                        </div>
                    </div>
                    <label class="construction-toggle">
                        <input type="checkbox" class="construction-toggle-checkbox" data-category="${category}" data-building-id="${buildingId}" ${!this.selectedZone || !isAllowed ? 'disabled' : ''}>
                        <span class="construction-toggle-label">Enable Construction</span>
                    </label>
                    ${!this.selectedZone ? '<div style="font-size: 11px; color: rgba(255, 255, 255, 0.5); margin-top: 5px;">Select a zone to enable</div>' : ''}
                    ${this.selectedZone && !isAllowed ? `<div style="font-size: 11px; color: rgba(255, 100, 100, 0.8); margin-top: 5px;">Not allowed in ${this.selectedZone}</div>` : ''}
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

    async purchaseItem(category, buildingId) {
        // Legacy method - now redirects to toggleConstruction
        await this.toggleConstruction(category, buildingId, true);
    }
    
    async toggleConstruction(category, buildingId, enabled) {
        try {
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
                    alert('Please select an orbital zone first by clicking on it in the zone selector.');
                    // Revert checkbox
                    const checkbox = document.querySelector(`.construction-toggle-checkbox[data-building-id="${buildingId}"]`);
                    if (checkbox) {
                        checkbox.checked = !enabled;
                    }
                    return;
                }
                
                // Buildings use toggle construction
                const response = await gameEngine.performAction('purchase_structure', {
                    building_id: buildingId,
                    zone_id: this.selectedZone,
                    enabled: enabled
                });
                
                // Update checkbox state if action succeeded
                if (response.success) {
                    const checkbox = document.querySelector(`.construction-toggle-checkbox[data-building-id="${buildingId}"]`);
                    if (checkbox) {
                        checkbox.checked = enabled;
                    }
                }
            }
        } catch (error) {
            console.error('Toggle construction failed:', error);
            alert(error.message || 'Toggle construction failed');
            // Revert checkbox on error
            const checkbox = document.querySelector(`.construction-toggle-checkbox[data-building-id="${buildingId}"]`);
            if (checkbox) {
                checkbox.checked = !enabled;
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

        // Update counts for buildings - zone-specific if zone is selected
        if (this.selectedZone) {
            const structuresByZone = gameState.structures_by_zone || {};
            const zoneStructures = structuresByZone[this.selectedZone] || {};
            Object.entries(zoneStructures).forEach(([buildingId, count]) => {
                const countElement = document.getElementById(`count-${buildingId}`);
                if (countElement) {
                    countElement.textContent = `Count: ${count}`;
                }
            });
            // Set count to 0 for buildings not in this zone
            document.querySelectorAll('.purchase-item[data-building-id]').forEach(item => {
                const buildingId = item.getAttribute('data-building-id');
                if (buildingId && !(buildingId in zoneStructures)) {
                    const countElement = document.getElementById(`count-${buildingId}`);
                    if (countElement) {
                        countElement.textContent = `Count: 0`;
                    }
                }
            });
        } else {
            // No zone selected - show global counts (legacy)
            Object.entries(gameState.structures || {}).forEach(([buildingId, count]) => {
                const countElement = document.getElementById(`count-${buildingId}`);
                if (countElement) {
                    countElement.textContent = `Count: ${count}`;
                }
            });
        }
        
        // Update enabled construction checkboxes - zone-specific
        const enabledConstruction = gameState.enabled_construction || [];
        document.querySelectorAll('.construction-toggle-checkbox').forEach(checkbox => {
            const buildingId = checkbox.getAttribute('data-building-id');
            if (buildingId && this.selectedZone) {
                // Check if this building is enabled for the selected zone
                const enabledKey = `${this.selectedZone}::${buildingId}`;
                checkbox.checked = enabledConstruction.includes(enabledKey);
            } else if (buildingId) {
                // No zone selected - check if enabled in any zone (for legacy compatibility)
                checkbox.checked = enabledConstruction.some(key => key.endsWith(`::${buildingId}`));
            }
        });
        
        // Update building progress - zone-specific if zone is selected
        const structureProgress = gameState.structure_construction_progress || {};
        const enabledConstruction = gameState.enabled_construction || [];
        
        // Calculate structure building dexterity per zone
        const probeAllocationsByZone = gameState.probe_allocations_by_zone || {};
        const zonePolicies = gameState.zone_policies || {};
        const buildAllocation = gameState.build_allocation || 100; // 0 = all structures, 100 = all probes
        const structureFraction = (100 - buildAllocation) / 100.0;
        
        // Get research multiplier for build rate
        const breakdown = gameState.resource_breakdowns?.dexterity;
        const roboticBonus = breakdown?.probes?.upgrades?.find(u => u.name === 'Robotic Systems')?.bonus || 0;
        const totalMultiplier = 1.0 + (roboticBonus || 0);
        
        // Base build rate: 10 kg/day per probe (from Config.PROBE_BUILD_RATE)
        const PROBE_BUILD_RATE = 10.0; // kg/day per probe
        
        // Calculate build rate per zone
        const buildRateByZone = {};
        for (const [zoneId, zoneAllocations] of Object.entries(probeAllocationsByZone)) {
            const constructAllocation = zoneAllocations.construct || {};
            const constructingProbes = Object.values(constructAllocation).reduce((sum, count) => sum + (count || 0), 0);
            const structureBuildingProbes = constructingProbes * structureFraction;
            const zoneBuildRateKgPerDay = structureBuildingProbes * PROBE_BUILD_RATE * totalMultiplier;
            buildRateByZone[zoneId] = zoneBuildRateKgPerDay;
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
        
        document.querySelectorAll('.building-progress-container').forEach(container => {
            const buildingId = container.id.replace('progress-', '');
            const building = this.getBuildingById(buildingId);
            if (!building) return;
            
            const costMetal = building.base_cost_metal || 0;
            let progress = 0;
            let buildRatePerBuilding = 0;
            let timeToComplete = Infinity;
            
            if (this.selectedZone) {
                // Show progress for selected zone
                const enabledKey = `${this.selectedZone}::${buildingId}`;
                progress = structureProgress[enabledKey] || 0;
                
                // Calculate build rate per building in this zone
                const zoneBuildRate = buildRateByZone[this.selectedZone] || 0;
                const numEnabledInZone = (enabledBuildingsByZone[this.selectedZone] || []).length;
                if (numEnabledInZone > 0) {
                    buildRatePerBuilding = zoneBuildRate / numEnabledInZone; // kg/day per building
                }
                
                // Calculate time to complete
                const remainingToBuild = costMetal - progress;
                if (buildRatePerBuilding > 0 && remainingToBuild > 0) {
                    timeToComplete = remainingToBuild / buildRatePerBuilding; // days
                } else if (remainingToBuild <= 0) {
                    timeToComplete = 0; // Already complete
                }
            } else {
                // No zone selected - show total progress across all zones
                progress = Object.entries(structureProgress)
                    .filter(([key]) => key.endsWith(`::${buildingId}`))
                    .reduce((sum, [, val]) => sum + val, 0);
                
                // Calculate total build rate across all zones for this building
                let totalBuildRate = 0;
                let totalEnabled = 0;
                for (const [zoneId, enabledKeys] of Object.entries(enabledBuildingsByZone)) {
                    if (enabledKeys.some(key => key.endsWith(`::${buildingId}`))) {
                        const zoneBuildRate = buildRateByZone[zoneId] || 0;
                        const numEnabledInZone = enabledKeys.length;
                        if (numEnabledInZone > 0) {
                            totalBuildRate += zoneBuildRate / numEnabledInZone;
                            totalEnabled++;
                        }
                    }
                }
                buildRatePerBuilding = totalBuildRate;
                
                // Calculate time to complete
                const remainingToBuild = costMetal - progress;
                if (buildRatePerBuilding > 0 && remainingToBuild > 0) {
                    timeToComplete = remainingToBuild / buildRatePerBuilding; // days
                } else if (remainingToBuild <= 0) {
                    timeToComplete = 0; // Already complete
                }
            }
            
            const progressPercent = costMetal > 0 ? (progress / costMetal) * 100 : 0;
            
            const progressPercentEl = document.getElementById(`progress-percent-${buildingId}`);
            const progressTimeEl = document.getElementById(`progress-time-${buildingId}`);
            
            // Always show the container
            container.style.display = 'block';
            
            if (progressPercentEl) {
                progressPercentEl.textContent = `${progressPercent.toFixed(1)}%`;
            }
            if (progressTimeEl) {
                if (timeToComplete === 0) {
                    progressTimeEl.textContent = 'Complete';
                } else if (timeToComplete === Infinity || !isFinite(timeToComplete)) {
                    progressTimeEl.textContent = '—';
                } else {
                    progressTimeEl.textContent = FormatUtils.formatTime(timeToComplete);
                }
            }
        });

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

        document.querySelectorAll('.purchase-item').forEach(item => {
            const buildingId = item.dataset.buildingId || item.dataset.unitId;
            if (!buildingId) return;

            const building = this.getBuildingById(buildingId);
            if (!building) return;

            const costMetal = building.base_cost_metal || 0;

            if (metal < costMetal) {
                item.classList.add('disabled');
            } else {
                item.classList.remove('disabled');
            }
        });

        // Update recycling section
        this.updateRecyclingSection(gameState);
    }

    getBuildingById(buildingId) {
        if (!this.buildings) return null;

        // Search through all categories
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
                    const metalReturn = building.base_cost_metal * recyclingEfficiency;
                    
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
            alert(error.message || 'Recycling failed');
        }
    }
}

