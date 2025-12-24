/** Purchase panel UI component */
class PurchasePanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.buildings = null;
        this.orbitalZones = null;
        this.hotkeys = {};
        this.selectedZone = null; // No zone selected by default
        this.collapsedCategories = new Set(); // Track collapsed categories
        
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
            // Load buildings
            const buildingsResponse = await fetch('/game_data/buildings.json');
            const buildingsData = await buildingsResponse.json();
            const rawBuildings = buildingsData.buildings || buildingsData;
            
            // Convert to flat list with specific ordering
            if (rawBuildings && typeof rawBuildings === 'object' && !Array.isArray(rawBuildings)) {
                // Check if it's the new format (has building IDs as keys)
                const buildingKeys = Object.keys(rawBuildings);
                if (buildingKeys.length > 0 && rawBuildings[buildingKeys[0]] && rawBuildings[buildingKeys[0]].id) {
                    // Define the order: omni_fab, power_station, data_center, refinery, factory, mass_driver
                    const order = ['omni_fab', 'power_station', 'data_center', 'refinery', 'factory', 'mass_driver'];
                    
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
            // Find the closest building card element
            const buildingCard = e.target.closest('.building-card');
            if (!buildingCard) return;
            
            // Don't trigger if clicking on disabled cards
            if (buildingCard.classList.contains('disabled')) {
                console.log('[PurchasePanel] Card is disabled, cannot toggle');
                return;
            }
            
            // Check if zone is selected before proceeding
            if (!this.selectedZone) {
                console.warn('[PurchasePanel] No zone selected, cannot toggle construction');
                alert('Please select an orbital zone first by clicking on it in the zone selector.');
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
            
            // Format building stats for display (one stat per line)
            let statsHtml = '';
            const effects = building.effects || {};
            
            // Get current structure count in selected zone for geometric scaling
            const structuresByZone = this.gameState?.structures_by_zone || {};
            const zoneStructures = this.selectedZone ? (structuresByZone[this.selectedZone] || {}) : {};
            const currentCount = zoneStructures[buildingId] || 0;
            const geometricFactor = Math.pow(currentCount, 2.1);
            
            // Get upgrade factors from game state
            const upgradeFactors = this.gameState?.upgrade_factors || {};
            const structureUpgrades = upgradeFactors.structure || {};
            
            // New format: calculate base values from multipliers
            if (building.build_rate_multiplier) {
                // Factory - show scaled replication rate with upgrade factors
                const baseProbeBuildRate = Config.PROBE_BUILD_RATE || 20; // kg/day per probe
                const baseRate = baseProbeBuildRate * building.build_rate_multiplier;
                const perfFactor = structureUpgrades.building?.performance || 1.0;
                const scaledRate = baseRate * geometricFactor * perfFactor;
                const probesPerDay = scaledRate / Config.PROBE_MASS; // probes per day
                const probesDisplay = probesPerDay >= 1e6 ? `${(probesPerDay/1e6).toFixed(1)}M` : 
                                      probesPerDay >= 1e3 ? `${(probesPerDay/1e3).toFixed(1)}k` : 
                                      probesPerDay.toFixed(2);
                statsHtml = '<div class="building-stats">';
                const countLabel = currentCount > 0 ? ` (${currentCount} built)` : '';
                statsHtml += `<div class="building-stat-line">${probesDisplay} probes/day${countLabel}</div>`;
                if (building.energy_cost_multiplier) {
                    const baseEnergyCost = Config.PROBE_ENERGY_CONSUMPTION || 100000; // W per probe
                    const energyCost = baseEnergyCost * building.energy_cost_multiplier;
                    const energyDisplay = energyCost >= 1e6 ? `${(energyCost/1e6).toFixed(1)} MW` : 
                                         energyCost >= 1e3 ? `${(energyCost/1e3).toFixed(1)} kW` : 
                                         `${energyCost.toFixed(0)} W`;
                    statsHtml += `<div class="building-stat-line">${energyDisplay}</div>`;
                }
                statsHtml += '</div>';
            } else if (building.mining_rate_multiplier && !building.build_rate_multiplier) {
                // Refinery - show scaled mining rate with upgrade factors
                const baseProbeMiningRate = Config.PROBE_HARVEST_RATE || 100; // kg/day per probe
                const baseRate = baseProbeMiningRate * building.mining_rate_multiplier;
                const perfFactor = structureUpgrades.mining?.performance || 1.0;
                const scaledRate = baseRate * geometricFactor * perfFactor;
                const metalDisplay = scaledRate >= 1e6 ? `${(scaledRate/1e6).toFixed(1)}M` : 
                                     scaledRate >= 1e3 ? `${(scaledRate/1e3).toFixed(1)}k` : 
                                     scaledRate.toFixed(1);
                statsHtml = '<div class="building-stats">';
                const countLabel = currentCount > 0 ? ` (${currentCount} built)` : '';
                statsHtml += `<div class="building-stat-line">${metalDisplay} kg/day${countLabel}</div>`;
                if (building.energy_cost_multiplier) {
                    const baseEnergyCost = Config.PROBE_ENERGY_CONSUMPTION || 100000; // W per probe
                    const energyCost = baseEnergyCost * building.energy_cost_multiplier;
                    const energyDisplay = energyCost >= 1e6 ? `${(energyCost/1e6).toFixed(1)} MW` : 
                                         energyCost >= 1e3 ? `${(energyCost/1e3).toFixed(1)} kW` : 
                                         `${energyCost.toFixed(0)} W`;
                    statsHtml += `<div class="building-stat-line">${energyDisplay}</div>`;
                }
                statsHtml += '</div>';
            } else if (building.power_output_mw) {
                // Power station - show scaled power output with upgrade factors
                const basePowerMW = building.power_output_mw;
                const perfFactor = structureUpgrades.energy?.performance || 1.0;
                const scaledPowerMW = basePowerMW * geometricFactor * perfFactor;
                const scaledPowerW = scaledPowerMW * 1e6; // Convert to watts for display
                const powerDisplay = scaledPowerW >= 1e9 ? `${(scaledPowerW/1e9).toFixed(1)} GW` : 
                                    scaledPowerW >= 1e6 ? `${(scaledPowerW/1e6).toFixed(1)} MW` : 
                                    scaledPowerW >= 1e3 ? `${(scaledPowerW/1e3).toFixed(1)} kW` :
                                    `${scaledPowerW.toFixed(0)} W`;
                statsHtml = '<div class="building-stats">';
                const countLabel = currentCount > 0 ? ` (${currentCount} built)` : '';
                statsHtml += `<div class="building-stat-line">${powerDisplay}${countLabel}</div>`;
                statsHtml += '</div>';
            } else if (building.compute_eflops) {
                // Data center - show scaled compute output with upgrade factors
                const baseComputeEFLOPS = building.compute_eflops;
                const perfFactor = structureUpgrades.compute?.performance || 1.0;
                const scaledComputeEFLOPS = baseComputeEFLOPS * geometricFactor * perfFactor;
                const computeDisplay = scaledComputeEFLOPS >= 1e3 ? `${(scaledComputeEFLOPS/1e3).toFixed(2)} ZFLOPS` :
                                      `${scaledComputeEFLOPS.toFixed(2)} EFLOPS`;
                statsHtml = '<div class="building-stats">';
                const countLabel = currentCount > 0 ? ` (${currentCount} built)` : '';
                statsHtml += `<div class="building-stat-line">${computeDisplay}${countLabel}</div>`;
                if (building.energy_cost_multiplier) {
                    const baseEnergyCost = Config.PROBE_ENERGY_CONSUMPTION || 100000; // W per probe
                    const energyCost = baseEnergyCost * building.energy_cost_multiplier;
                    const energyDisplay = energyCost >= 1e6 ? `${(energyCost/1e6).toFixed(1)} MW` : 
                                         energyCost >= 1e3 ? `${(energyCost/1e3).toFixed(1)} kW` : 
                                         `${energyCost.toFixed(0)} W`;
                    statsHtml += `<div class="building-stat-line">${energyDisplay}</div>`;
                }
                statsHtml += '</div>';
            } else if (building.efficiency !== undefined && building.efficiency < 1.0) {
                // Omni-fab - show all capabilities at reduced efficiency
                statsHtml = '<div class="building-stats">';
                statsHtml += `<div class="building-stat-line">50% efficiency (all functions)</div>`;
                if (building.mining_rate_multiplier) {
                    const baseRate = (Config.PROBE_HARVEST_RATE || 100) * building.mining_rate_multiplier;
                    statsHtml += `<div class="building-stat-line">Mining: ${baseRate.toFixed(0)} kg/day</div>`;
                }
                if (building.build_rate_multiplier) {
                    const baseRate = (Config.PROBE_BUILD_RATE || 20) * building.build_rate_multiplier;
                    statsHtml += `<div class="building-stat-line">Build: ${baseRate.toFixed(0)} kg/day</div>`;
                }
                if (building.power_output_mw) {
                    statsHtml += `<div class="building-stat-line">Power: ${building.power_output_mw} MW</div>`;
                }
                if (building.compute_eflops) {
                    statsHtml += `<div class="building-stat-line">Compute: ${building.compute_eflops} EFLOPS</div>`;
                }
                statsHtml += '</div>';
            } else if (building.base_capacity_kg || building.base_delta_v) {
                // Mass driver
                statsHtml = '<div class="building-stats">';
                if (building.base_capacity_kg) {
                    const capacityDisplay = building.base_capacity_kg >= 1e6 ? `${(building.base_capacity_kg/1e6).toFixed(1)}M kg` :
                                           building.base_capacity_kg >= 1e3 ? `${(building.base_capacity_kg/1e3).toFixed(1)}k kg` :
                                           `${building.base_capacity_kg.toFixed(0)} kg`;
                    statsHtml += `<div class="building-stat-line">Capacity: ${capacityDisplay}</div>`;
                }
                if (building.base_delta_v) {
                    statsHtml += `<div class="building-stat-line">Delta-V: ${building.base_delta_v.toFixed(0)} m/s</div>`;
                }
                statsHtml += '</div>';
            }
            
            // Legacy format: Factory stats
            if (statsHtml === '' && effects.probe_production_per_day !== undefined) {
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
            const clickableClass = (!disabledClass) ? 'building-card-clickable' : '';
            
            html += `
                <div class="probe-summary-item building-card ${disabledClass} ${clickableClass}" 
                     id="building-${buildingId}" 
                     data-building-id="${buildingId}" 
                     data-category="${buildingCategory}"
                     ${!disabledClass ? 'style="cursor: pointer;"' : ''}>
                    <div class="probe-summary-label">
                        ${building.name}
                        <span style="color: rgba(255, 255, 255, 0.4); font-weight: normal; margin-left: 4px;">[${hotkey.toUpperCase()}]</span>
                        <span class="construction-status-indicator" id="status-${buildingId}" style="float: right; font-size: 9px; color: rgba(255, 255, 255, 0.4);"></span>
                    </div>
                    ${building.description ? `<div style="font-size: 9px; color: rgba(255, 255, 255, 0.5); margin-bottom: 5px; margin-top: 2px;">${building.description}</div>` : ''}
                    ${statsHtml ? `<div style="font-size: 9px; color: rgba(255, 255, 255, 0.6); margin-bottom: 5px; font-family: 'Courier New', monospace; line-height: 1.4;">${statsHtml}</div>` : ''}
                    <div class="probe-summary-breakdown" style="margin-top: 5px;">
                        <div class="probe-summary-breakdown-item">
                            <span class="probe-summary-breakdown-label">Cost:</span>
                            <span class="probe-summary-breakdown-count" id="cost-${buildingId}">${this.formatNumber(this.getBuildingCost(building, buildingId))}</span>
                        </div>
                        <div class="probe-summary-breakdown-item">
                            <span class="probe-summary-breakdown-label">Count:</span>
                            <span class="probe-summary-breakdown-count" id="count-${buildingId}">0</span>
                        </div>
                    </div>
                    <div class="building-progress-container" id="progress-${buildingId}" style="margin-top: 8px; padding: 6px; background: rgba(0, 0, 0, 0.2); border-radius: 3px;">
                        <div style="font-size: 9px; color: rgba(255, 255, 255, 0.6); margin-bottom: 4px;">Building Progress</div>
                        <div style="width: 100%; height: 4px; background: rgba(255, 255, 255, 0.1); border-radius: 2px; overflow: hidden; margin-bottom: 4px;">
                            <div id="progress-bar-${buildingId}" style="height: 100%; width: 0%; background: linear-gradient(90deg, rgba(74, 158, 255, 0.8), rgba(74, 158, 255, 1)); transition: width 0.3s ease;"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span class="probe-summary-breakdown-count" id="progress-percent-${buildingId}" style="font-size: 10px;">0%</span>
                            <span class="probe-summary-breakdown-count" id="progress-time-${buildingId}" style="font-size: 9px; color: rgba(255, 255, 255, 0.5);">—</span>
                        </div>
                    </div>
                    ${!this.selectedZone ? '<div style="font-size: 9px; color: rgba(255, 255, 255, 0.4); margin-top: 8px;">Select a zone to enable construction</div>' : ''}
                    ${this.selectedZone && !isAllowed ? `<div style="font-size: 9px; color: rgba(255, 100, 100, 0.8); margin-top: 8px;">Not allowed in ${this.selectedZone}</div>` : ''}
                    ${!disabledClass ? '<div style="font-size: 9px; color: rgba(74, 158, 255, 0.7); margin-top: 8px;">Click to toggle construction</div>' : ''}
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
    
    getBuildingCost(building, buildingId = null) {
        // New format: calculate from mass_multiplier
        if (building.mass_multiplier !== undefined) {
            const baseProbeMass = Config.PROBE_MASS || 100; // kg
            const baseCost = baseProbeMass * building.mass_multiplier;
            
            // Apply exponential scaling if zone and building ID are provided
            if (this.selectedZone && buildingId && this.gameState) {
                const structuresByZone = this.gameState.structures_by_zone || {};
                const zoneStructures = structuresByZone[this.selectedZone] || {};
                const currentCount = zoneStructures[buildingId] || 0;
                // Next building will cost baseCost * (currentCount + 1)^2.1
                const scalingFactor = Math.pow(currentCount + 1, 2.1);
                return baseCost * scalingFactor;
            }
            
            return baseCost;
        }
        // Legacy format: use base_cost_metal
        return building.base_cost_metal || 0;
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
                    alert('Please select an orbital zone first by clicking on it in the zone selector.');
                    // Revert card state
                    const card = document.getElementById(`building-${buildingId}`);
                    const statusIndicator = document.getElementById(`status-${buildingId}`);
                    if (card) {
                        if (!enabled) {
                            card.classList.add('construction-enabled');
                            if (statusIndicator) {
                                statusIndicator.textContent = '● Building';
                                statusIndicator.style.color = 'rgba(74, 158, 255, 0.9)';
                            }
                        } else {
                            card.classList.remove('construction-enabled');
                            if (statusIndicator) {
                                statusIndicator.textContent = '';
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
                                statusIndicator.textContent = '● Building';
                                statusIndicator.style.color = 'rgba(74, 158, 255, 0.9)';
                            }
                        } else {
                            card.classList.remove('construction-enabled');
                            if (statusIndicator) {
                                statusIndicator.textContent = '';
                            }
                        }
                    }
                } else {
                    console.warn('[PurchasePanel] Action failed:', response);
                    const errorMsg = response.result?.error || response.error || 'Unknown error';
                    alert(`Failed to toggle construction: ${errorMsg}`);
                    
                    // Revert card state on failure
                    const card = document.getElementById(`building-${buildingId}`);
                    const statusIndicator = document.getElementById(`status-${buildingId}`);
                    if (card) {
                        // Revert to opposite of what we tried to set
                        if (enabled) {
                            // Tried to enable but failed - remove enabled class
                            card.classList.remove('construction-enabled');
                            if (statusIndicator) {
                                statusIndicator.textContent = '';
                            }
                        } else {
                            // Tried to disable but failed - keep enabled
                            card.classList.add('construction-enabled');
                            if (statusIndicator) {
                                statusIndicator.textContent = '● Building';
                                statusIndicator.style.color = 'rgba(74, 158, 255, 0.9)';
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[PurchasePanel] Toggle construction failed:', error);
            alert(error.message || 'Toggle construction failed');
            // Revert card state on error
            const card = document.getElementById(`building-${buildingId}`);
            const statusIndicator = document.getElementById(`status-${buildingId}`);
            if (card) {
                if (!enabled) {
                    card.classList.add('construction-enabled');
                    if (statusIndicator) {
                        statusIndicator.textContent = '● Building';
                        statusIndicator.style.color = 'rgba(74, 158, 255, 0.9)';
                    }
                } else {
                    card.classList.remove('construction-enabled');
                    if (statusIndicator) {
                        statusIndicator.textContent = '';
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
        if (!this.container.querySelector('.probe-summary-item[data-building-id]')) {
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
                    countElement.textContent = `Count: ${count}`;
                }
                // Update cost display (cost increases with count)
                const costElement = document.getElementById(`cost-${buildingId}`);
                if (costElement) {
                    const building = this.getBuildingById(buildingId);
                    if (building) {
                        const nextCost = this.getBuildingCost(building, buildingId);
                        costElement.textContent = this.formatNumber(nextCost);
                    }
                }
            });
            // Set count to 0 and update cost for buildings not in this zone
            // Cache purchase items to avoid repeated queries
            if (!this.cachedElements.purchaseItems) {
                this.cachedElements.purchaseItems = Array.from(this.container.querySelectorAll('.probe-summary-item[data-building-id]'));
                this.cachedElements.lastCacheTime = Date.now();
            }
            this.cachedElements.purchaseItems.forEach(item => {
                const buildingId = item.getAttribute('data-building-id');
                if (buildingId && !(buildingId in zoneStructures)) {
                    const countElement = document.getElementById(`count-${buildingId}`);
                    if (countElement) {
                        countElement.textContent = `Count: 0`;
                    }
                    // Update cost display (base cost when count is 0)
                    const costElement = document.getElementById(`cost-${buildingId}`);
                    if (costElement) {
                        const building = this.getBuildingById(buildingId);
                        if (building) {
                            const nextCost = this.getBuildingCost(building, buildingId);
                            costElement.textContent = this.formatNumber(nextCost);
                        }
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
        
        // Update enabled construction state on building cards - zone-specific
        const enabledConstruction = gameState.enabled_construction || [];
        
        // Cache building cards to avoid repeated queries
        if (!this.cachedElements.buildingCards) {
            this.cachedElements.buildingCards = Array.from(this.container.querySelectorAll('.building-card[data-building-id]'));
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
                            statusIndicator.textContent = '● Building';
                            statusIndicator.style.color = 'rgba(74, 158, 255, 0.9)';
                        }
                        console.log(`[PurchasePanel] ✓ Enabled construction for ${buildingId} in ${this.selectedZone}`);
                    } else {
                        card.classList.remove('construction-enabled');
                        if (statusIndicator) {
                            statusIndicator.textContent = '';
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
                            statusIndicator.textContent = '● Building';
                            statusIndicator.style.color = 'rgba(74, 158, 255, 0.9)';
                        }
                    } else {
                        card.classList.remove('construction-enabled');
                        if (statusIndicator) {
                            statusIndicator.textContent = '';
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
                const BASE_BUILDING_RATE = 20.0; // kg/day per probe
                
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
                    const baseBuildRateKgPerDay = structureBuildingProbes * BASE_BUILDING_RATE * buildRateUpgradeFactor;
                    
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
            
            // Cache progress containers to avoid repeated queries
            if (!this.cachedElements.buildingProgressContainers) {
                this.cachedElements.buildingProgressContainers = Array.from(this.container.querySelectorAll('.building-progress-container'));
                this.cachedElements.lastCacheTime = Date.now();
            }
            this.cachedElements.buildingProgressContainers.forEach(container => {
                const buildingId = container.id.replace('progress-', '');
                const building = this.getBuildingById(buildingId);
                if (!building) return;
                
                const costMetal = this.getBuildingCost(building, buildingId);
                let progress = 0;
                let buildRatePerBuilding = 0;
                let timeToComplete = Infinity;
                
                if (this.selectedZone) {
                    // Show progress for selected zone
                    const enabledKey = `${this.selectedZone}::${buildingId}`;
                    progress = structureProgress[enabledKey] || 0;
                    
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
                        const remainingToBuild = costMetal - progress;
                        const metalNeededPerDay = buildRatePerBuilding; // 1:1 ratio
                        if (storedMetal < metalNeededPerDay && metalNeededPerDay > 0) {
                            // Metal throttling: reduce effective rate based on available metal
                            const metalThrottle = storedMetal / metalNeededPerDay;
                            buildRatePerBuilding = buildRatePerBuilding * metalThrottle;
                        }
                    }
                    
                    // Debug log progress (occasionally)
                    if (progress > 0 && Math.random() < 0.05) { // 5% chance
                        console.log(`[PurchasePanel] ${buildingId} in ${this.selectedZone}: progress=${progress.toFixed(2)}/${costMetal.toFixed(2)} kg, rate=${buildRatePerBuilding.toFixed(2)} kg/day, metal=${storedMetal.toFixed(2)} kg`);
                    }
                    
                    // Calculate time to complete based on effective rate
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
                const progressBarEl = document.getElementById(`progress-bar-${buildingId}`);
                
                // Always show the container
                container.style.display = 'block';
                
                // Update progress bar
                if (progressBarEl) {
                    progressBarEl.style.width = `${Math.min(100, Math.max(0, progressPercent))}%`;
                }
                
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
            alert(error.message || 'Recycling failed');
        }
    }
}

