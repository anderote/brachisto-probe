/** Resource display UI component */
class ResourceDisplay {
    constructor(containerId, compactMode = false) {
        this.container = document.getElementById(containerId);
        this.compactMode = compactMode;
        this.previousState = null;
        this.gameState = null;
        this.buildings = null; // Will store buildings data for structure mass calculation
        this.init();
        this.loadBuildingsData();
    }
    
    async loadBuildingsData() {
        try {
            const response = await fetch('/game_data/buildings.json');
            const data = await response.json();
            this.buildings = data.buildings || data;
        } catch (error) {
            console.error('Failed to load buildings data:', error);
            this.buildings = {};
        }
    }

    init() {
        if (this.compactMode) {
            this.initCompact();
        } else {
            this.initFull();
        }
    }

    initCompact() {
        this.container.innerHTML = `
            <div class="compact-resource-item" id="resource-energy-container" data-resource="energy">
                <div class="compact-resource-header">Energy</div>
                <div class="compact-resource-line">
                    <span class="compact-resource-label-small">Net:</span>
                    <span class="compact-resource-value" id="resource-energy-net">0 kW</span>
                </div>
                <div class="compact-resource-line">
                    <span class="compact-resource-label-small">Produced:</span>
                    <span class="compact-resource-value" id="resource-energy-produced">0 kW</span>
                </div>
                <div class="compact-resource-line">
                    <span class="compact-resource-label-small">Consumed:</span>
                    <span class="compact-resource-value" id="resource-energy-consumed">0 kW</span>
                </div>
                <div class="resource-tooltip" id="tooltip-energy"></div>
            </div>
            <div class="compact-resource-divider"></div>
            <div class="compact-resource-item" id="resource-intelligence-container" data-resource="intelligence">
                <div class="compact-resource-header">Intelligence</div>
                <div class="compact-resource-line">
                    <span class="compact-resource-label-small">Net:</span>
                    <span class="compact-resource-value" id="resource-intelligence-net">0</span>
                </div>
                <div class="compact-resource-line">
                    <span class="compact-resource-label-small">Produced:</span>
                    <span class="compact-resource-value" id="resource-intelligence-produced">0</span>
                </div>
                <div class="compact-resource-line">
                    <span class="compact-resource-label-small">Consumed:</span>
                    <span class="compact-resource-value" id="resource-intelligence-consumed">0</span>
                </div>
                <div class="resource-tooltip" id="tooltip-intelligence"></div>
            </div>
            <div class="compact-resource-divider"></div>
            <div class="compact-resource-item" id="resource-dexterity-container" data-resource="dexterity">
                <div class="compact-resource-header">Dexterity</div>
                <div class="compact-resource-line">
                    <span class="compact-resource-label-small">Net:</span>
                    <span class="compact-resource-value" id="resource-dexterity-net">0 kg/s</span>
                </div>
                <div class="compact-resource-line">
                    <span class="compact-resource-label-small">Mining Rate:</span>
                    <span class="compact-resource-value" id="resource-dexterity-mining">0 kg/s</span>
                </div>
                <div class="compact-resource-line">
                    <span class="compact-resource-label-small">Consumption Rate:</span>
                    <span class="compact-resource-value" id="resource-dexterity-consumption">0 kg/s</span>
                </div>
                <div class="resource-tooltip" id="tooltip-dexterity"></div>
            </div>
            <div id="resource-warnings" class="resource-warnings"></div>
            <div class="compact-resource-divider"></div>
            <div class="compact-resource-item">
                <div class="compact-resource-header">Dyson</div>
                <div class="compact-resource-line">
                    <span class="compact-resource-label-small">Progress:</span>
                    <span class="compact-resource-value" id="resource-dyson-progress">0%</span>
                </div>
                <div class="compact-resource-line">
                    <span class="compact-resource-label-small">Mass:</span>
                    <span class="compact-resource-value" id="resource-dyson-mass">0 kg</span>
                </div>
                <div class="compact-resource-line">
                    <span class="compact-resource-label-small">Probe Mass:</span>
                    <span class="compact-resource-value" id="resource-probe-mass">0 kg</span>
                </div>
                <div class="compact-resource-line">
                    <span class="compact-resource-label-small">Structure Mass:</span>
                    <span class="compact-resource-value" id="resource-structure-mass">0 kg</span>
                </div>
            </div>
        `;
        
        // Set up tooltip event listeners
        this.setupTooltips();
    }

    initFull() {
        this.container.innerHTML = `
            <div class="resource-item" id="resource-energy-container" data-resource="energy">
                <div class="resource-label">Energy</div>
                <div class="resource-value" id="resource-energy">0</div>
                <div class="resource-rate" id="resource-energy-rate">+0 W/s</div>
                <div class="resource-tooltip" id="tooltip-energy"></div>
            </div>
            <div class="resource-item" id="resource-intelligence-container" data-resource="intelligence">
                <div class="resource-label">Intelligence</div>
                <div class="resource-value" id="resource-intelligence">0</div>
                <div class="resource-rate" id="resource-intelligence-rate">+0 /s</div>
                <div class="resource-tooltip" id="tooltip-intelligence"></div>
            </div>
            <div class="resource-item" id="resource-dexterity-container" data-resource="dexterity">
                <div class="resource-label">Dexterity</div>
                <div class="resource-value" id="resource-dexterity">0</div>
                <div class="resource-tooltip" id="tooltip-dexterity"></div>
            </div>
            <div class="resource-item">
                <div class="resource-label">Dyson Sphere</div>
                <div class="resource-value" id="resource-dyson-progress">0%</div>
                <div class="resource-rate" id="resource-dyson-mass">0 / 0 kg</div>
                <div class="resource-rate" id="resource-probe-mass-full">Probe Mass: 0 kg</div>
                <div class="resource-rate" id="resource-structure-mass-full">Structure Mass: 0 kg</div>
            </div>
            <div class="zone-metal-section" id="zone-metal-section">
                <div class="section-title">Zone Metal Remaining</div>
                <div id="zone-metal-list"></div>
            </div>
        `;
        
        // Set up tooltip event listeners
        this.setupTooltips();
    }

    formatNumber(value) {
        // Use scientific notation for all numbers
        if (value === 0) return '0';
        // Always use scientific notation for energy and large numbers
        if (value >= 1e3 || (value < 1 && value > 0)) {
            return value.toExponential(2);
        }
        return value.toFixed(2);
    }
    
    formatEnergy(value) {
        // Format energy values in watts with scientific notation
        if (value === 0) return '0 W';
        return `${value.toExponential(2)} W`;
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

    setupTooltips() {
        // Set up mouseenter and mouseleave for each resource container
        const resources = ['energy', 'intelligence', 'dexterity'];
        resources.forEach(resource => {
            const container = document.getElementById(`resource-${resource}-container`);
            const tooltip = document.getElementById(`tooltip-${resource}`);
            if (container && tooltip) {
                container.addEventListener('mouseenter', () => {
                    // Update tooltip content if breakdown is available
                    if (this.gameState && this.gameState.resource_breakdowns) {
                        const breakdown = this.gameState.resource_breakdowns[resource];
                        if (breakdown) {
                            this.updateTooltip(resource, breakdown);
                        }
                    }
                    this.showTooltip(resource, tooltip, container);
                });
                container.addEventListener('mouseleave', () => {
                    tooltip.style.display = 'none';
                });
            }
        });
    }

    showTooltip(resource, tooltipEl, containerEl) {
        const rect = containerEl.getBoundingClientRect();
        tooltipEl.style.display = 'block';
        
        // Position tooltip - further to the left and further down
        const tooltipWidth = 300; // Approximate tooltip width
        const centerX = window.innerWidth / 2;
        const farLeftX = rect.left - tooltipWidth - 10;
        // Position at 1/6 of the way from far left to center (much more to the left)
        const newX = farLeftX + (centerX - farLeftX) * 0.16;
        
        tooltipEl.style.left = `${newX}px`;
        tooltipEl.style.right = 'auto';
        // Position further down - below the container instead of centered
        tooltipEl.style.top = `${rect.bottom + 15}px`;
        tooltipEl.style.transform = 'none';
    }

    updateTooltip(resource, breakdown) {
        const tooltipEl = document.getElementById(`tooltip-${resource}`);
        if (!tooltipEl) return;
        
        // For dexterity, we don't need breakdown - we calculate from gameState
        if (resource === 'dexterity' && !this.gameState) return;
        if (resource !== 'dexterity' && !breakdown) return;

        let html = '<div class="tooltip-content">';
        
        if (resource === 'dexterity') {
            // Get game state for breakdown
            const gameState = this.gameState || {};
            const metal = gameState.metal || 0;
            const metalProductionRate = gameState.metal_production_rate || 0;
            const dysonConstructionRate = gameState.dyson_construction_rate || 0;
            const probeProductionRate = gameState.probe_production_rate || 0;
            const allocations = gameState.probe_allocations || {};
            const constructAllocation = allocations.construct || {};
            const harvestAllocation = allocations.harvest || {};
            const constructProbes = (constructAllocation.probe || 0) + (constructAllocation.construction_probe || 0);
            const buildAllocation = gameState.build_allocation || 50;
            const structureFraction = (100 - buildAllocation) / 100.0;
            const structureProbes = constructProbes * structureFraction;
            
            // Calculate production breakdown
            const totalHarvestProbes = (harvestAllocation.probe || 0) + (harvestAllocation.miner_probe || 0) + (harvestAllocation.energy_probe || 0);
            // metal_production_rate is in kg/day from backend
            const harvestProduction = gameState.metal_production_rate || 0; // kg/day
            
            // Calculate consumption rates (all in kg/day)
            const dysonMetalConsumption = (dysonConstructionRate || 0) * 0.5; // 50% efficiency, kg/day
            const probeMetalConsumption = (probeProductionRate || 0) * Config.PROBE_MASS; // kg/day
            const structureMetalConsumption = structureProbes * Config.PROBE_BUILD_RATE; // kg/day per probe
            const totalConsumption = dysonMetalConsumption + probeMetalConsumption + structureMetalConsumption; // kg/day
            
            html += `<div class="tooltip-description" style="margin-bottom: 12px; color: rgba(255, 255, 255, 0.7); font-size: 11px; font-style: italic;">
                Dexterity shows metal storage, production, and consumption. Net = Production - Consumption.
            </div>`;
            
            // Metal stored - make it prominent
            html += `<div class="tooltip-section" style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(74, 158, 255, 0.3);">
                <div class="tooltip-title" style="font-size: 13px; margin-bottom: 4px;">Metal Stored:</div>
                <div class="tooltip-value" style="font-size: 16px; color: #4a9eff; font-weight: bold;">${this.formatNumber(metal)} kg</div>
            </div>`;
            
            // Dexterity breakdown from probes (if available)
            if (breakdown && breakdown.probes && breakdown.probes.breakdown) {
                const zoneBreakdown = breakdown.probes.breakdown;
                if (Object.keys(zoneBreakdown).length > 0) {
                    html += `<div class="tooltip-section" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                        <div class="tooltip-title">Dexterity by Zone (from Probes):</div>`;
                    
                    const zoneEntries = Object.entries(zoneBreakdown)
                        .sort((a, b) => b[1].baseDexterity - a[1].baseDexterity); // Sort by dexterity descending
                    
                    zoneEntries.forEach(([zoneId, data]) => {
                        const zoneName = zoneId === 'global' ? 'Global' : zoneId.charAt(0).toUpperCase() + zoneId.slice(1).replace(/_/g, ' ');
                        html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                            <span style="color: rgba(255, 255, 255, 0.8);">${zoneName} (${data.probeCount} probes):</span>
                            <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${FormatUtils.formatRate(data.baseDexterity, 'kg')}</span>
                        </div>`;
                    });
                    
                    html += `</div>`;
                }
            }
            
            // Production breakdown
            html += `<div class="tooltip-section" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                <div class="tooltip-title">Production Rate Breakdown:</div>`;
            
            if (harvestProduction > 0) {
                html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                    <span style="color: rgba(255, 255, 255, 0.8);">Harvesting Probes:</span>
                    <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${FormatUtils.formatRate(harvestProduction, 'kg')}</span>
                </div>`;
            }
            
            // Check for mining structures
            const structures = gameState.structures || {};
            const structuresByZone = gameState.structures_by_zone || {};
            let structureProduction = 0;
            const structureBreakdown = {}; // {buildingId: {name: string, count: number, production: number}}
            
            // Calculate mining structure contributions
            if (this.buildings) {
                for (const [zoneId, zoneStructures] of Object.entries(structuresByZone)) {
                    for (const [buildingId, count] of Object.entries(zoneStructures)) {
                        if (count <= 0) continue;
                        
                        let building = null;
                        for (const category in this.buildings) {
                            if (Array.isArray(this.buildings[category])) {
                                building = this.buildings[category].find(b => b.id === buildingId);
                                if (building) break;
                            }
                        }
                        
                        if (building) {
                            const effects = building.effects || {};
                            const metalProduction = effects.metal_production_per_day || 0; // kg/day
                            if (metalProduction > 0) {
                                const totalProduction = metalProduction * count; // kg/day
                                structureProduction += totalProduction;
                                
                                if (!structureBreakdown[buildingId]) {
                                    structureBreakdown[buildingId] = {
                                        name: building.name || buildingId,
                                        count: 0,
                                        production: 0
                                    };
                                }
                                structureBreakdown[buildingId].count += count;
                                structureBreakdown[buildingId].production += totalProduction;
                            }
                        }
                    }
                }
            }
            
            // Show mining structure breakdown if available
            if (Object.keys(structureBreakdown).length > 0) {
                const structureEntries = Object.entries(structureBreakdown)
                    .sort((a, b) => b[1].production - a[1].production); // Sort by production descending
                
                structureEntries.forEach(([buildingId, data]) => {
                    html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                        <span style="color: rgba(255, 255, 255, 0.8);">${data.name} (×${data.count}):</span>
                        <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${FormatUtils.formatRate(data.production, 'kg')}</span>
                    </div>`;
                });
            }
            
            html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                <span style="color: rgba(255, 255, 255, 0.95); font-weight: bold;">Total Production:</span>
                <span style="color: #4a9eff; font-weight: bold; margin-left: 8px; font-size: 13px;">${FormatUtils.formatRate(harvestProduction, 'kg')}</span>
            </div>`;
            
            html += `</div>`;
            
            // Consumption breakdown
            html += `<div class="tooltip-section" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                <div class="tooltip-title">Consumption Rate Breakdown:</div>`;
            
            if (dysonMetalConsumption > 0) {
                html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                    <span style="color: rgba(255, 255, 255, 0.8);">Dyson Construction:</span>
                    <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${FormatUtils.formatRate(dysonMetalConsumption, 'kg')}</span>
                </div>`;
            }
            
            if (probeMetalConsumption > 0) {
                html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                    <span style="color: rgba(255, 255, 255, 0.8);">Building Probes:</span>
                    <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${FormatUtils.formatRate(probeMetalConsumption, 'kg')}</span>
                </div>`;
            }
            
            if (structureMetalConsumption > 0) {
                html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                    <span style="color: rgba(255, 255, 255, 0.8);">Building Structures:</span>
                    <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${FormatUtils.formatRate(structureMetalConsumption, 'kg')}</span>
                </div>`;
            }
            
            html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                <span style="color: rgba(255, 255, 255, 0.95); font-weight: bold;">Total Consumption:</span>
                <span style="color: #4a9eff; font-weight: bold; margin-left: 8px; font-size: 13px;">${FormatUtils.formatRate(totalConsumption, 'kg')}</span>
            </div>`;
            
            html += `</div>`;
            
            // Net (all rates are in kg/day)
            const metalNet = harvestProduction - totalConsumption;
            const netColor = metalNet < 0 ? '#8b0000' : (metalNet > 0 ? '#228B22' : '#4a9eff');
            html += `<div class="tooltip-section" style="margin-top: 12px; padding-top: 12px; border-top: 2px solid rgba(74, 158, 255, 0.4);">
                <div class="tooltip-title">Net Metal:</div>
                <div class="tooltip-value" style="color: ${netColor}; font-size: 14px;">${FormatUtils.formatRate(metalNet, 'kg')}</div>
            </div>`;
        } else if (resource === 'energy') {
            html += `<div class="tooltip-description" style="margin-bottom: 12px; color: rgba(255, 255, 255, 0.7); font-size: 11px; font-style: italic;">
                Energy is measured in watts. Net energy = Production - Consumption. Positive net energy allows your probes and structures to operate.
            </div>`;
            if (breakdown.production) {
                html += `<div class="tooltip-section">
                    <div class="tooltip-title">Production:</div>`;
                if (breakdown.production.breakdown) {
                    if (breakdown.production.breakdown.base_supply > 0) {
                        html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                            <span style="color: rgba(255, 255, 255, 0.8);">Base Supply:</span>
                            <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(breakdown.production.breakdown.base_supply)}</span>
                        </div>`;
                    }
                    if (breakdown.production.breakdown.energy_probes > 0) {
                        html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                            <span style="color: rgba(255, 255, 255, 0.8);">Energy Probes:</span>
                            <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(breakdown.production.breakdown.energy_probes)}</span>
                        </div>`;
                    }
                    if (breakdown.production.breakdown.structures > 0) {
                        html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                            <span style="color: rgba(255, 255, 255, 0.8);">Structures:</span>
                            <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(breakdown.production.breakdown.structures)}</span>
                        </div>`;
                    }
                    if (breakdown.production.breakdown.dyson_sphere > 0) {
                        html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                            <span style="color: rgba(255, 255, 255, 0.8);">Dyson Sphere:</span>
                            <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(breakdown.production.breakdown.dyson_sphere)}</span>
                        </div>`;
                    }
                }
                if (breakdown.production.upgrades && breakdown.production.upgrades.length > 0) {
                    html += `<div class="tooltip-section" style="margin-top: 8px;">
                        <div class="tooltip-title">Production Modifiers:</div>`;
                    breakdown.production.upgrades.forEach(upgrade => {
                        if (upgrade.researched) {
                            html += `<div class="tooltip-upgrade">${upgrade.name}: +${(upgrade.bonus * 100).toFixed(1)}%</div>`;
                        }
                    });
                    html += `</div>`;
                }
                html += `<div class="tooltip-value" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                    <span style="color: rgba(255, 255, 255, 0.95); font-weight: bold;">Total Production:</span>
                    <span style="color: #4a9eff; font-weight: bold; margin-left: 8px; font-size: 13px;">${this.formatEnergy(breakdown.production.total || 0)}</span>
                </div>`;
                html += `</div>`;
            }
            if (breakdown.consumption) {
                html += `<div class="tooltip-section" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                    <div class="tooltip-title">Consumption Breakdown:</div>`;
                if (breakdown.consumption.breakdown) {
                    if (breakdown.consumption.breakdown.probes > 0) {
                        html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                            <span style="color: rgba(255, 255, 255, 0.8);">Probes:</span>
                            <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(breakdown.consumption.breakdown.probes)}</span>
                        </div>`;
                    }
                    if (breakdown.consumption.breakdown.structures > 0) {
                        html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                            <span style="color: rgba(255, 255, 255, 0.8);">Structures:</span>
                            <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(breakdown.consumption.breakdown.structures)}</span>
                        </div>`;
                    }
                    if (breakdown.consumption.breakdown.harvesting > 0) {
                        html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                            <span style="color: rgba(255, 255, 255, 0.8);">Harvesting:</span>
                            <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(breakdown.consumption.breakdown.harvesting)}</span>
                        </div>`;
                    }
                    if (breakdown.consumption.breakdown.probe_construction > 0) {
                        html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                            <span style="color: rgba(255, 255, 255, 0.8);">Probe Construction:</span>
                            <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(breakdown.consumption.breakdown.probe_construction)}</span>
                        </div>`;
                    }
                    if (breakdown.consumption.breakdown.dyson_construction > 0) {
                        html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                            <span style="color: rgba(255, 255, 255, 0.8);">Dyson Construction:</span>
                            <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(breakdown.consumption.breakdown.dyson_construction)}</span>
                        </div>`;
                    }
                }
                if (breakdown.consumption.upgrades && breakdown.consumption.upgrades.length > 0) {
                    html += `<div class="tooltip-section" style="margin-top: 8px;">
                        <div class="tooltip-title">Consumption Modifiers:</div>`;
                    breakdown.consumption.upgrades.forEach(upgrade => {
                        if (upgrade.researched) {
                            html += `<div class="tooltip-upgrade">${upgrade.name}: -${(upgrade.bonus * 100).toFixed(1)}%</div>`;
                        }
                    });
                    html += `</div>`;
                }
                html += `<div class="tooltip-value" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                    <span style="color: rgba(255, 255, 255, 0.95); font-weight: bold;">Total Consumption:</span>
                    <span style="color: #4a9eff; font-weight: bold; margin-left: 8px; font-size: 13px;">${this.formatEnergy(breakdown.consumption.total || 0)}</span>
                </div>`;
                html += `</div>`;
            }
            const netEnergy = (breakdown.production?.total || 0) - (breakdown.consumption?.total || 0);
            const netEnergyColor = netEnergy < 0 ? '#8b0000' : (netEnergy > 0 ? '#228B22' : '#4a9eff');
            html += `<div class="tooltip-section" style="margin-top: 12px; padding-top: 12px; border-top: 2px solid rgba(74, 158, 255, 0.4);">
                <div class="tooltip-title">Net Energy:</div>
                <div class="tooltip-value" style="color: ${netEnergyColor}; font-size: 14px;">${this.formatEnergy(netEnergy)}</div>
            </div>`;
        } else if (resource === 'intelligence') {
            html += `<div class="tooltip-description" style="margin-bottom: 12px; color: rgba(255, 255, 255, 0.7); font-size: 11px; font-style: italic;">
                Intelligence measures computational power in PFLOPS (PetaFLOPS). Used for research and advanced calculations.
            </div>`;
            html += `<div class="tooltip-section">
                <div class="tooltip-title">Dyson Sphere:</div>
                <div class="tooltip-value">${this.formatFLOPS(breakdown.probes?.base || 0)}</div>
                <div style="font-size: 10px; color: rgba(255, 255, 255, 0.6); margin-top: 4px;">1 PFLOPS/s per kg of Dyson sphere mass</div>
            </div>`;
            if (breakdown.probes?.upgrades && breakdown.probes.upgrades.length > 0) {
                html += `<div class="tooltip-section" style="margin-top: 8px;">
                    <div class="tooltip-title">Modifiers:</div>`;
                breakdown.probes.upgrades.forEach(upgrade => {
                    if (upgrade.researched) {
                        html += `<div class="tooltip-upgrade">${upgrade.name}: +${(upgrade.bonus * 100).toFixed(1)}%</div>`;
                    }
                });
                html += `</div>`;
            }
            if (breakdown.structures && breakdown.structures.total > 0) {
                html += `<div class="tooltip-section" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                    <div class="tooltip-title">Research Structures:</div>`;
                
                // Show breakdown by structure type if available
                if (breakdown.structures.breakdown && Object.keys(breakdown.structures.breakdown).length > 0) {
                    const structureEntries = Object.entries(breakdown.structures.breakdown)
                        .sort((a, b) => b[1].flops - a[1].flops); // Sort by FLOPS descending
                    
                    structureEntries.forEach(([buildingId, data]) => {
                        html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                            <span style="color: rgba(255, 255, 255, 0.8);">${data.name} (×${data.count}):</span>
                            <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatFLOPS(data.flops)}</span>
                        </div>`;
                    });
                } else {
                    html += `<div class="tooltip-value">${this.formatFLOPS(breakdown.structures.total || 0)}</div>`;
                }
                html += `</div>`;
            }
            html += `<div class="tooltip-section" style="margin-top: 12px; padding-top: 12px; border-top: 2px solid rgba(74, 158, 255, 0.4);">
                <div class="tooltip-title">Total Intelligence:</div>
                <div class="tooltip-value" style="font-size: 14px;">${this.formatFLOPS(breakdown.total || 0)}</div>
            </div>`;
        }
        
        html += '</div>';
        tooltipEl.innerHTML = html;
    }

    update(gameState) {
        if (!gameState) return;
        
        // Store game state for tooltip calculations
        this.gameState = gameState;

        // Update values directly from game state
        const energy = gameState.energy || 0;
        const intelligence = gameState.intelligence || 0;
        const dexterity = gameState.dexterity || 0;
        const dysonProgress = gameState.dyson_sphere_progress || 0;

        const energyEl = document.getElementById('resource-energy');
        const intelligenceEl = document.getElementById('resource-intelligence');
        const dexterityEl = document.getElementById('resource-dexterity');
        const dysonProgressEl = document.getElementById('resource-dyson-progress');

        // Update energy display (Net, Produced, Consumed)
        // Backend stores energy in watts
        const energyProduction = gameState.energy_production_rate || 0;
        const energyConsumption = gameState.energy_consumption_rate || 0;
        const energyNet = energyProduction - energyConsumption;
        const energyNetEl = document.getElementById('resource-energy-net');
        const energyProducedEl = document.getElementById('resource-energy-produced');
        const energyConsumedEl = document.getElementById('resource-energy-consumed');
        if (energyNetEl) {
            energyNetEl.textContent = this.formatEnergy(energyNet);
            energyNetEl.style.color = energyNet < 0 ? '#8b0000' : (energyNet > 0 ? '#228B22' : 'inherit');
        }
        if (energyProducedEl) energyProducedEl.textContent = this.formatEnergy(energyProduction);
        if (energyConsumedEl) energyConsumedEl.textContent = this.formatEnergy(energyConsumption);

        // Update intelligence display (Net, Produced, Consumed)
        const intelligenceProduction = gameState.intelligence_production_rate || 0;
        const intelligenceConsumption = 0; // Intelligence is not consumed, only produced
        const intelligenceNet = intelligenceProduction - intelligenceConsumption;
        const intelligenceNetEl = document.getElementById('resource-intelligence-net');
        const intelligenceProducedEl = document.getElementById('resource-intelligence-produced');
        const intelligenceConsumedEl = document.getElementById('resource-intelligence-consumed');
        if (intelligenceNetEl) {
            intelligenceNetEl.textContent = this.formatFLOPS(intelligenceNet);
            intelligenceNetEl.style.color = intelligenceNet < 0 ? '#8b0000' : (intelligenceNet > 0 ? '#228B22' : 'inherit');
        }
        if (intelligenceProducedEl) intelligenceProducedEl.textContent = this.formatFLOPS(intelligenceProduction);
        if (intelligenceConsumedEl) intelligenceConsumedEl.textContent = this.formatFLOPS(intelligenceConsumption);

        // Update dexterity display (Net, Mining Rate, Consumption Rate)
        const metal = gameState.metal || 0;
        const metalProductionRate = gameState.metal_production_rate || 0; // kg/day from backend
        
        // Use actual metal consumption rate from backend (only counts metal actually consumed)
        const totalMetalConsumption = gameState.metal_consumption_rate || 0; // kg/day from backend
        const metalNet = metalProductionRate - totalMetalConsumption;
        
        const dexterityNetEl = document.getElementById('resource-dexterity-net');
        const dexterityMiningEl = document.getElementById('resource-dexterity-mining');
        const dexterityConsumptionEl = document.getElementById('resource-dexterity-consumption');
        if (dexterityNetEl) {
            dexterityNetEl.textContent = FormatUtils.formatRate(metalNet, 'kg');
            dexterityNetEl.style.color = metalNet < 0 ? '#8b0000' : (metalNet > 0 ? '#228B22' : 'inherit');
        }
        if (dexterityMiningEl) {
            dexterityMiningEl.textContent = FormatUtils.formatRate(metalProductionRate, 'kg');
        }
        if (dexterityConsumptionEl) {
            dexterityConsumptionEl.textContent = FormatUtils.formatRate(totalMetalConsumption, 'kg');
        }

        const dysonMass = gameState.dyson_sphere_mass || 0;
        const dysonTarget = gameState.dyson_sphere_target_mass || 1;
        const dysonMassEl = document.getElementById('resource-dyson-mass');
        if (dysonProgressEl) dysonProgressEl.textContent = `${(dysonProgress * 100).toFixed(5)}%`;
        if (dysonMassEl) dysonMassEl.textContent = `${this.formatNumber(dysonMass)} kg`;
        
        // Calculate probe mass (sum across all zones * 100 kg per probe)
        const PROBE_MASS = Config.PROBE_MASS; // kg per probe (from Config.PROBE_MASS = 100 kg)
        let totalProbeMass = 0;
        
        // Legacy: global probe counts
        const probes = gameState.probes || {};
        Object.values(probes).forEach(count => {
            totalProbeMass += (count || 0) * PROBE_MASS;
        });
        
        // Zone-based probe counts (sum across all zones)
        const probesByZone = gameState.probes_by_zone || {};
        for (const [zoneId, zoneProbes] of Object.entries(probesByZone)) {
            if (zoneProbes && typeof zoneProbes === 'object') {
                for (const count of Object.values(zoneProbes)) {
                    totalProbeMass += (count || 0) * PROBE_MASS;
                }
            }
        }
        
        const probeMassEl = document.getElementById('resource-probe-mass');
        if (probeMassEl) probeMassEl.textContent = `${this.formatNumber(totalProbeMass)} kg`;
        
        // Calculate structure mass (sum across all zones * base_cost_metal for each structure)
        let totalStructureMass = 0;
        if (this.buildings) {
            // Legacy: global structures
            const structures = gameState.structures || {};
            Object.keys(structures).forEach(buildingId => {
                const count = structures[buildingId] || 0;
                if (count > 0) {
                    // Find building in buildings data
                    let building = null;
                    for (const category in this.buildings) {
                        if (Array.isArray(this.buildings[category])) {
                            building = this.buildings[category].find(b => b.id === buildingId);
                            if (building) break;
                        }
                    }
                    if (building && building.base_cost_metal) {
                        totalStructureMass += count * building.base_cost_metal;
                    }
                }
            });
            
            // Zone-based structures (sum across all zones)
            const structuresByZone = gameState.structures_by_zone || {};
            for (const [zoneId, zoneStructures] of Object.entries(structuresByZone)) {
                if (zoneStructures && typeof zoneStructures === 'object') {
                    Object.keys(zoneStructures).forEach(buildingId => {
                        const count = zoneStructures[buildingId] || 0;
                        if (count > 0) {
                            // Find building in buildings data
                            let building = null;
                            for (const category in this.buildings) {
                                if (Array.isArray(this.buildings[category])) {
                                    building = this.buildings[category].find(b => b.id === buildingId);
                                    if (building) break;
                                }
                            }
                            if (building && building.base_cost_metal) {
                                totalStructureMass += count * building.base_cost_metal;
                            }
                        }
                    });
                }
            }
        }
        const structureMassEl = document.getElementById('resource-structure-mass');
        if (structureMassEl) structureMassEl.textContent = `${this.formatNumber(totalStructureMass)} kg`;
        
        // Update full mode displays if they exist
        const probeMassFullEl = document.getElementById('resource-probe-mass-full');
        if (probeMassFullEl) probeMassFullEl.textContent = `Probe Mass: ${this.formatNumber(totalProbeMass)} kg`;
        const structureMassFullEl = document.getElementById('resource-structure-mass-full');
        if (structureMassFullEl) structureMassFullEl.textContent = `Structure Mass: ${this.formatNumber(totalStructureMass)} kg`;
        
        // Update tooltips if breakdown data is available
        if (gameState.resource_breakdowns) {
            if (gameState.resource_breakdowns.energy) {
                this.updateTooltip('energy', gameState.resource_breakdowns.energy);
            }
            if (gameState.resource_breakdowns.intelligence) {
                this.updateTooltip('intelligence', gameState.resource_breakdowns.intelligence);
            }
            if (gameState.resource_breakdowns.dexterity) {
                this.updateTooltip('dexterity', gameState.resource_breakdowns.dexterity);
            }
        }

        // Handle slag and dyson mass (only in full mode) - removed, using compact mode only

        // Rate displays removed - now showing Net/Produced/Consumed separately

        // Update zone metal remaining
        this.updateZoneMetal(gameState);

        // Update warning messages
        this.updateWarnings(gameState);

        // Store current state for next rate calculation
        this.previousState = {
            energy,
            intelligence,
            dexterity
        };
    }
    
    updateWarnings(gameState) {
        if (!this.compactMode) return;
        
        const warningsEl = document.getElementById('resource-warnings');
        if (!warningsEl) return;
        
        const isEnergyLimited = gameState.is_energy_limited || false;
        const isMetalLimited = gameState.is_metal_limited || false;
        
        let warnings = [];
        if (isEnergyLimited) {
            warnings.push('<span class="resource-warning">ENERGY RATE LIMITED</span>');
        }
        if (isMetalLimited) {
            warnings.push('<span class="resource-warning">METAL RATE LIMITED</span>');
        }
        
        if (warnings.length > 0) {
            warningsEl.innerHTML = warnings.join(' • ');
            warningsEl.style.display = 'block';
        } else {
            warningsEl.style.display = 'none';
        }
    }

    updateZoneMetal(gameState) {
        const zoneMetalList = document.getElementById('zone-metal-list');
        if (!zoneMetalList || !gameState.zone_metal_remaining) return;

        let html = '';
        Object.entries(gameState.zone_metal_remaining || {}).forEach(([zoneId, metalRemaining]) => {
            const isDepleted = gameState.zone_depleted?.[zoneId] || false;
            const zoneClass = isDepleted ? 'zone-depleted' : '';
            html += `
                <div class="zone-metal-item ${zoneClass}">
                    <span class="zone-metal-name">${zoneId}:</span>
                    <span class="zone-metal-value">${this.formatNumber(metalRemaining)} kg</span>
                    ${isDepleted ? '<span class="zone-depleted-badge">Depleted</span>' : ''}
                </div>
            `;
        });

        zoneMetalList.innerHTML = html;
    }
}

