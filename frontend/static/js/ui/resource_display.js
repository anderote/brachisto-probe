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

    /**
     * Format research bonus as percentage
     * @param {number} bonus - Bonus value (0.1 = 10%)
     * @param {boolean} isReduction - If true, shows as reduction (negative)
     * @returns {string} Formatted bonus string
     */
    formatResearchBonus(bonus, isReduction = false) {
        if (bonus === 0) return '0%';
        const percentage = bonus * 100;
        const sign = isReduction ? '-' : '+';
        return `${sign}${percentage.toFixed(1)}%`;
    }

    /**
     * Get structure breakdown by type from gameState
     * @param {Object} gameState - Current game state
     * @param {string} effectType - Type of effect to look for (e.g., 'energy_production_per_second', 'metal_production_per_day')
     * @returns {Object} Structure breakdown {buildingId: {name, count, value, total}}
     */
    getStructureBreakdown(gameState, effectType) {
        const breakdown = {};
        const structuresByZone = gameState.structures_by_zone || {};
        const allBuildings = this.buildings?.buildings || this.buildings || {};
        
        for (const [zoneId, zoneStructures] of Object.entries(structuresByZone)) {
            for (const [buildingId, count] of Object.entries(zoneStructures)) {
                if (count <= 0) continue;
                
                let building = null;
                // Search through all building categories
                for (const category in allBuildings) {
                    if (Array.isArray(allBuildings[category])) {
                        building = allBuildings[category].find(b => b.id === buildingId);
                        if (building) break;
                    } else if (allBuildings[category] && typeof allBuildings[category] === 'object') {
                        // Handle nested structure
                        building = allBuildings[category][buildingId];
                        if (building) break;
                    }
                }
                
                if (building) {
                    const effects = building.effects || {};
                    const value = effects[effectType] || 0;
                    
                    if (value > 0) {
                        if (!breakdown[buildingId]) {
                            breakdown[buildingId] = {
                                name: building.name || buildingId,
                                count: 0,
                                value: value,
                                total: 0
                            };
                        }
                        breakdown[buildingId].count += count;
                        breakdown[buildingId].total += value * count;
                    }
                }
            }
        }
        
        return breakdown;
    }

    /**
     * Get research bonuses from gameState
     * @param {Object} gameState - Current game state
     * @param {string} resourceType - Resource type ('energy', 'intelligence', 'metal')
     * @param {string} bonusType - Type of bonus ('production' or 'consumption')
     * @returns {Array} Array of research bonus objects
     */
    getResearchBonuses(gameState, resourceType, bonusType) {
        const bonuses = [];
        const resourceBreakdowns = gameState.resource_breakdowns || {};
        const breakdown = resourceBreakdowns[resourceType];
        
        if (!breakdown) return bonuses;
        
        const section = breakdown[bonusType];
        if (section && section.upgrades) {
            return section.upgrades.filter(u => u.researched);
        }
        
        return bonuses;
    }

    setupTooltips() {
        // Set up mouseenter and mouseleave for each resource container
        const resources = ['energy', 'intelligence', 'dexterity'];
        resources.forEach(resource => {
            const container = document.getElementById(`resource-${resource}-container`);
            const tooltip = document.getElementById(`tooltip-${resource}`);
            if (container && tooltip) {
                container.addEventListener('mouseenter', (e) => {
                    // Update tooltip content if breakdown is available
                    if (this.gameState && this.gameState.resource_breakdowns) {
                        const breakdown = this.gameState.resource_breakdowns[resource];
                        if (breakdown) {
                            this.updateTooltip(resource, breakdown);
                        } else {
                            // Show basic tooltip even without breakdown
                            this.showBasicTooltip(resource, tooltip);
                        }
                    } else {
                        // Show basic tooltip even without breakdown
                        this.showBasicTooltip(resource, tooltip);
                    }
                    this.showTooltip(resource, tooltip, container);
                });
                container.addEventListener('mouseleave', () => {
                    tooltip.style.display = 'none';
                });
            }
        });
    }

    showBasicTooltip(resource, tooltipEl) {
        // Show a basic tooltip even when breakdown data isn't available
        const descriptions = {
            energy: 'Energy is measured in watts. Net energy = Production - Consumption. Positive net energy allows your probes and structures to operate.',
            intelligence: 'Intelligence measures computational power in PFLOPS (PetaFLOPS). Used for research and advanced calculations.',
            dexterity: 'Dexterity shows metal storage, production, and consumption. Net = Production - Consumption.'
        };
        
        let html = '<div class="tooltip-content">';
        html += `<div class="tooltip-description" style="margin-bottom: 12px; color: rgba(255, 255, 255, 0.7); font-size: 11px; font-style: italic;">`;
        html += descriptions[resource] || 'Resource information will be displayed here.';
        html += '</div>';
        html += '</div>';
        tooltipEl.innerHTML = html;
    }

    showTooltip(resource, tooltipEl, containerEl) {
        const rect = containerEl.getBoundingClientRect();
        
        // Ensure tooltip has content
        if (!tooltipEl.innerHTML || tooltipEl.innerHTML.trim() === '') {
            this.showBasicTooltip(resource, tooltipEl);
        }
        
        tooltipEl.style.display = 'block';
        
        // Position tooltip to the left of the container, below it
        const tooltipWidth = 300; // Approximate tooltip width
        const spacing = 10; // Space between container and tooltip
        
        // Position to the left of the container
        let leftPos = rect.left - tooltipWidth - spacing;
        
        // If tooltip would go off-screen to the left, position it to the right instead
        if (leftPos < 10) {
            leftPos = rect.right + spacing;
        }
        
        // Ensure tooltip doesn't go off-screen to the right
        if (leftPos + tooltipWidth > window.innerWidth - 10) {
            leftPos = window.innerWidth - tooltipWidth - 10;
        }
        
        tooltipEl.style.left = `${leftPos}px`;
        tooltipEl.style.right = 'auto';
        // Position below the container
        tooltipEl.style.top = `${rect.bottom + spacing}px`;
        tooltipEl.style.transform = 'none';
        tooltipEl.style.zIndex = '10000';
    }

    updateTooltip(resource, breakdown) {
        const tooltipEl = document.getElementById(`tooltip-${resource}`);
        if (!tooltipEl) return;
        
        // For dexterity, we don't need breakdown - we calculate from gameState
        if (resource === 'dexterity' && !this.gameState) return;
        if (resource !== 'dexterity' && !breakdown) return;

        // Change detection: Cache tooltip content to avoid unnecessary regeneration
        const tooltipData = resource === 'dexterity' ? {
            resource: resource,
            gameState: {
                metal: this.gameState.metal,
                metal_production_rate: this.gameState.metal_production_rate,
                dyson_construction_rate: this.gameState.dyson_construction_rate,
                probe_production_rate: this.gameState.probe_production_rate,
                probe_allocations: this.gameState.probe_allocations,
                build_allocation: this.gameState.build_allocation,
                resource_breakdowns: this.gameState.resource_breakdowns
            }
        } : {
            resource: resource,
            breakdown: breakdown
        };
        
        const tooltipHash = JSON.stringify(tooltipData);
        const cacheKey = `tooltip_${resource}_cache`;
        
        if (tooltipHash === this[cacheKey] && this[cacheKey] !== null) {
            return; // No changes, skip tooltip update
        }
        this[cacheKey] = tooltipHash;

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
            
            // Mining probes by zone
            const probesByZone = gameState.probes_by_zone || {};
            const probeAllocationsByZone = gameState.probe_allocations_by_zone || {};
            let totalProbeProduction = 0;
            const zoneProductionBreakdown = {};
            
            // Calculate production by zone from probes
            for (const [zoneId, zoneProbes] of Object.entries(probesByZone)) {
                const probeCount = zoneProbes.probe || 0;
                if (probeCount <= 0) continue;
                
                const allocations = probeAllocationsByZone[zoneId] || {};
                const harvestAlloc = allocations.harvest || 0;
                const miningProbes = probeCount * harvestAlloc;
                
                if (miningProbes > 0) {
                    // Get base mining rate (would need to calculate from upgrade factors)
                    // For now, use a simplified calculation
                    const baseRate = Config.PROBE_HARVEST_RATE || 100; // kg/day per probe
                    const zoneProduction = miningProbes * baseRate;
                    totalProbeProduction += zoneProduction;
                    
                    zoneProductionBreakdown[zoneId] = {
                        probeCount: miningProbes,
                        production: zoneProduction
                    };
                }
            }
            
            // Show mining probes by zone if we have zone breakdown
            if (Object.keys(zoneProductionBreakdown).length > 0) {
                html += `<div style="margin-left: 8px; margin-top: 6px;">
                    <div style="color: rgba(255, 255, 255, 0.9); font-size: 11px; margin-bottom: 4px;">Mining Probes:</div>`;
                const zoneEntries = Object.entries(zoneProductionBreakdown)
                    .sort((a, b) => b[1].production - a[1].production);
                zoneEntries.forEach(([zoneId, data]) => {
                    const zoneName = zoneId === 'global' ? 'Global' : zoneId.charAt(0).toUpperCase() + zoneId.slice(1).replace(/_/g, ' ');
                    html += `<div class="tooltip-item" style="margin-left: 16px; margin-top: 2px;">
                        <span style="color: rgba(255, 255, 255, 0.75);">${zoneName} (${Math.round(data.probeCount)} probes):</span>
                        <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${FormatUtils.formatRate(data.production, 'kg')}</span>
                    </div>`;
                });
                html += `</div>`;
            } else if (harvestProduction > 0) {
                // Fallback: show total if zone breakdown not available
                html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                    <span style="color: rgba(255, 255, 255, 0.8);">Harvesting Probes:</span>
                    <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${FormatUtils.formatRate(harvestProduction, 'kg')}</span>
                </div>`;
            }
            
            // Mining structures (detailed breakdown by type)
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
                html += `<div style="margin-left: 8px; margin-top: 6px;">
                    <div style="color: rgba(255, 255, 255, 0.9); font-size: 11px; margin-bottom: 4px;">Mining Structures:</div>`;
                const structureEntries = Object.entries(structureBreakdown)
                    .sort((a, b) => b[1].production - a[1].production); // Sort by production descending
                
                structureEntries.forEach(([buildingId, data]) => {
                    html += `<div class="tooltip-item" style="margin-left: 16px; margin-top: 2px;">
                        <span style="color: rgba(255, 255, 255, 0.75);">${data.name} (×${data.count}):</span>
                        <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${FormatUtils.formatRate(data.production, 'kg')}</span>
                    </div>`;
                });
                html += `</div>`;
            }
            
            // Production Research Bonuses
            const skills = gameState.skills || {};
            const upgradeFactors = gameState.upgrade_factors || {};
            const productionBonuses = [];
            
            // Mining efficiency from upgrade factors
            const miningFactor = upgradeFactors.probe?.mining?.performance || 1.0;
            if (miningFactor > 1.0) {
                productionBonuses.push({
                    name: 'Mining Efficiency',
                    bonus: miningFactor - 1.0
                });
            }
            
            // Extraction efficiency from recycling skill
            const recyclingSkill = skills.recycling || 0.75;
            if (recyclingSkill > 0.75) {
                const extractionBonus = (recyclingSkill - 0.75) * 0.5; // Up to 12.5% bonus
                if (extractionBonus > 0) {
                    productionBonuses.push({
                        name: 'Extraction Efficiency',
                        bonus: extractionBonus
                    });
                }
            }
            
            if (productionBonuses.length > 0) {
                html += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                    <div class="tooltip-title" style="font-size: 11px; margin-bottom: 4px;">Production Modifiers:</div>`;
                productionBonuses.forEach(bonus => {
                    html += `<div class="tooltip-upgrade" style="margin-left: 8px;">${bonus.name}: ${this.formatResearchBonus(bonus.bonus)}</div>`;
                });
                html += `</div>`;
            }
            
            // Total production (probe + structure)
            const totalProduction = harvestProduction + structureProduction;
            html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                <span style="color: rgba(255, 255, 255, 0.95); font-weight: bold;">Total Production:</span>
                <span style="color: #4a9eff; font-weight: bold; margin-left: 8px; font-size: 13px;">${FormatUtils.formatRate(totalProduction, 'kg')}</span>
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
            const totalProduction = harvestProduction + structureProduction;
            const metalNet = totalProduction - totalConsumption;
            const netColor = metalNet < 0 ? '#8b0000' : (metalNet > 0 ? '#228B22' : '#4a9eff');
            html += `<div class="tooltip-section" style="margin-top: 12px; padding-top: 12px; border-top: 2px solid rgba(74, 158, 255, 0.4);">
                <div class="tooltip-title">Net Metal:</div>
                <div class="tooltip-value" style="color: ${netColor}; font-size: 14px;">${FormatUtils.formatRate(metalNet, 'kg')}</div>
            </div>`;
        } else if (resource === 'energy') {
            const gameState = this.gameState || {};
            html += `<div class="tooltip-description" style="margin-bottom: 12px; color: rgba(255, 255, 255, 0.7); font-size: 11px; font-style: italic;">
                Energy is measured in watts. Net energy = Production - Consumption. Positive net energy allows your probes and structures to operate.
            </div>`;
            
            // Production Breakdown
            if (breakdown.production) {
                html += `<div class="tooltip-section">
                    <div class="tooltip-title">Production Breakdown:</div>`;
                
                if (breakdown.production.breakdown) {
                    // Base Supply
                    if (breakdown.production.breakdown.base_supply > 0) {
                        html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                            <span style="color: rgba(255, 255, 255, 0.8);">Base Supply:</span>
                            <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(breakdown.production.breakdown.base_supply)}</span>
                        </div>`;
                    }
                    
                    // Energy-producing structures (detailed breakdown by type)
                    if (breakdown.production.breakdown.structures > 0) {
                        const energyStructures = this.getStructureBreakdown(gameState, 'energy_production_per_second');
                        if (Object.keys(energyStructures).length > 0) {
                            html += `<div style="margin-left: 8px; margin-top: 6px;">
                                <div style="color: rgba(255, 255, 255, 0.9); font-size: 11px; margin-bottom: 4px;">Structures:</div>`;
                            const structureEntries = Object.entries(energyStructures)
                                .sort((a, b) => b[1].total - a[1].total);
                            structureEntries.forEach(([buildingId, data]) => {
                                html += `<div class="tooltip-item" style="margin-left: 16px; margin-top: 2px;">
                                    <span style="color: rgba(255, 255, 255, 0.75);">${data.name} (×${data.count}):</span>
                                    <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(data.total)}</span>
                                </div>`;
                            });
                            html += `</div>`;
                        } else {
                            html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                                <span style="color: rgba(255, 255, 255, 0.8);">Structures:</span>
                                <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(breakdown.production.breakdown.structures)}</span>
                            </div>`;
                        }
                    }
                    
                    // Dyson Sphere (with power allocation info)
                    if (breakdown.production.breakdown.dyson_sphere > 0) {
                        const dysonPowerAllocation = gameState.dyson_power_allocation || 0;
                        const economyFraction = (100 - dysonPowerAllocation) / 100.0;
                        html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                            <span style="color: rgba(255, 255, 255, 0.8);">Dyson Sphere (${(economyFraction * 100).toFixed(1)}% to economy):</span>
                            <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(breakdown.production.breakdown.dyson_sphere)}</span>
                        </div>`;
                    }
                }
                
                // Production Research Bonuses
                const productionBonuses = this.getResearchBonuses(gameState, 'energy', 'production');
                if (productionBonuses.length > 0) {
                    html += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                        <div class="tooltip-title" style="font-size: 11px; margin-bottom: 4px;">Production Modifiers:</div>`;
                    productionBonuses.forEach(upgrade => {
                        html += `<div class="tooltip-upgrade" style="margin-left: 8px;">${upgrade.name}: ${this.formatResearchBonus(upgrade.bonus)}</div>`;
                    });
                    html += `</div>`;
                }
                
                html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                    <span style="color: rgba(255, 255, 255, 0.95); font-weight: bold;">Total Production:</span>
                    <span style="color: #4a9eff; font-weight: bold; margin-left: 8px; font-size: 13px;">${this.formatEnergy(breakdown.production.total || 0)}</span>
                </div>`;
                html += `</div>`;
            }
            
            // Consumption Breakdown
            if (breakdown.consumption) {
                html += `<div class="tooltip-section" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                    <div class="tooltip-title">Consumption Breakdown:</div>`;
                
                if (breakdown.consumption.breakdown) {
                    // Probe consumption (with probe count)
                    if (breakdown.consumption.breakdown.probes > 0) {
                        const totalProbes = gameState.probes?.probe || 0;
                        html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                            <span style="color: rgba(255, 255, 255, 0.8);">Probes (${totalProbes} probes):</span>
                            <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(breakdown.consumption.breakdown.probes)}</span>
                        </div>`;
                    }
                    
                    // Structure consumption (detailed breakdown by type)
                    if (breakdown.consumption.breakdown.structures > 0) {
                        const energyConsumingStructures = this.getStructureBreakdown(gameState, 'energy_consumption_per_second');
                        if (Object.keys(energyConsumingStructures).length > 0) {
                            html += `<div style="margin-left: 8px; margin-top: 6px;">
                                <div style="color: rgba(255, 255, 255, 0.9); font-size: 11px; margin-bottom: 4px;">Structures:</div>`;
                            const structureEntries = Object.entries(energyConsumingStructures)
                                .sort((a, b) => b[1].total - a[1].total);
                            structureEntries.forEach(([buildingId, data]) => {
                                html += `<div class="tooltip-item" style="margin-left: 16px; margin-top: 2px;">
                                    <span style="color: rgba(255, 255, 255, 0.75);">${data.name} (×${data.count}):</span>
                                    <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(data.total)}</span>
                                </div>`;
                            });
                            html += `</div>`;
                        } else {
                            html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                                <span style="color: rgba(255, 255, 255, 0.8);">Structures:</span>
                                <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(breakdown.consumption.breakdown.structures)}</span>
                            </div>`;
                        }
                    }
                    
                    // Harvesting energy cost (with zone info if available)
                    if (breakdown.consumption.breakdown.harvesting > 0) {
                        const harvestZone = gameState.harvest_zone || 'unknown';
                        html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                            <span style="color: rgba(255, 255, 255, 0.8);">Harvesting (${harvestZone}):</span>
                            <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(breakdown.consumption.breakdown.harvesting)}</span>
                        </div>`;
                    }
                    
                    // Probe construction energy cost
                    if (breakdown.consumption.breakdown.probe_construction > 0) {
                        html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                            <span style="color: rgba(255, 255, 255, 0.8);">Probe Construction:</span>
                            <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(breakdown.consumption.breakdown.probe_construction)}</span>
                        </div>`;
                    }
                    
                    // Dyson construction energy cost
                    if (breakdown.consumption.breakdown.dyson_construction > 0) {
                        html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                            <span style="color: rgba(255, 255, 255, 0.8);">Dyson Construction:</span>
                            <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatEnergy(breakdown.consumption.breakdown.dyson_construction)}</span>
                        </div>`;
                    }
                }
                
                // Consumption Research Bonuses
                const consumptionBonuses = this.getResearchBonuses(gameState, 'energy', 'consumption');
                if (consumptionBonuses.length > 0) {
                    html += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                        <div class="tooltip-title" style="font-size: 11px; margin-bottom: 4px;">Consumption Modifiers:</div>`;
                    consumptionBonuses.forEach(upgrade => {
                        html += `<div class="tooltip-upgrade" style="margin-left: 8px;">${upgrade.name}: ${this.formatResearchBonus(upgrade.bonus, true)}</div>`;
                    });
                    html += `</div>`;
                }
                
                html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                    <span style="color: rgba(255, 255, 255, 0.95); font-weight: bold;">Total Consumption:</span>
                    <span style="color: #4a9eff; font-weight: bold; margin-left: 8px; font-size: 13px;">${this.formatEnergy(breakdown.consumption.total || 0)}</span>
                </div>`;
                html += `</div>`;
            }
            
            // Net Energy
            const netEnergy = (breakdown.production?.total || 0) - (breakdown.consumption?.total || 0);
            const netEnergyColor = netEnergy < 0 ? '#8b0000' : (netEnergy > 0 ? '#228B22' : '#4a9eff');
            html += `<div class="tooltip-section" style="margin-top: 12px; padding-top: 12px; border-top: 2px solid rgba(74, 158, 255, 0.4);">
                <div class="tooltip-title">Net Energy:</div>
                <div class="tooltip-value" style="color: ${netEnergyColor}; font-size: 14px;">${this.formatEnergy(netEnergy)}</div>
            </div>`;
        } else if (resource === 'intelligence') {
            const gameState = this.gameState || {};
            html += `<div class="tooltip-description" style="margin-bottom: 12px; color: rgba(255, 255, 255, 0.7); font-size: 11px; font-style: italic;">
                Intelligence measures computational power in PFLOPS (PetaFLOPS). Used for research and advanced calculations. Intelligence is not consumed, only produced.
            </div>`;
            
            // Production Breakdown
            html += `<div class="tooltip-section">
                <div class="tooltip-title">Production Breakdown:</div>`;
            
            // Dyson Sphere intelligence production
            const dysonIntelligence = breakdown.probes?.base || 0;
            if (dysonIntelligence > 0) {
                const dysonPowerAllocation = gameState.dyson_power_allocation || 0;
                const computeFraction = dysonPowerAllocation / 100.0;
                const dysonMass = gameState.dyson_sphere?.mass || 0;
                html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                    <span style="color: rgba(255, 255, 255, 0.8);">Dyson Sphere (${(computeFraction * 100).toFixed(1)}% to compute, ${this.formatNumber(dysonMass)} kg):</span>
                    <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatFLOPS(dysonIntelligence)}</span>
                </div>`;
                html += `<div style="font-size: 10px; color: rgba(255, 255, 255, 0.6); margin-left: 8px; margin-top: 2px;">1 PFLOPS/s per kg of Dyson sphere mass</div>`;
            }
            
            // Dyson Sphere research bonuses
            if (breakdown.probes?.upgrades && breakdown.probes.upgrades.length > 0) {
                html += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                    <div class="tooltip-title" style="font-size: 11px; margin-bottom: 4px;">Dyson Sphere Modifiers:</div>`;
                breakdown.probes.upgrades.forEach(upgrade => {
                    if (upgrade.researched) {
                        html += `<div class="tooltip-upgrade" style="margin-left: 8px;">${upgrade.name}: ${this.formatResearchBonus(upgrade.bonus)}</div>`;
                    }
                });
                html += `</div>`;
            }
            
            // Research Structures (detailed breakdown by type)
            if (breakdown.structures && breakdown.structures.total > 0) {
                html += `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                    <div class="tooltip-title" style="margin-bottom: 6px;">Research Structures:</div>`;
                
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
                    html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 4px;">
                        <span style="color: rgba(255, 255, 255, 0.8);">Structures:</span>
                        <span style="color: #4a9eff; font-weight: bold; margin-left: 8px;">${this.formatFLOPS(breakdown.structures.total || 0)}</span>
                    </div>`;
                }
                html += `</div>`;
            }
            
            // Research bonuses for structures (from upgrade_factors or skills)
            const skills = gameState.skills || {};
            const computerSkill = skills.computer?.total || 1.0;
            if (computerSkill > 1.0) {
                html += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                    <div class="tooltip-title" style="font-size: 11px; margin-bottom: 4px;">Structure Modifiers:</div>`;
                html += `<div class="tooltip-upgrade" style="margin-left: 8px;">Computer Systems: ${this.formatResearchBonus(computerSkill - 1.0)}</div>`;
                html += `</div>`;
            }
            
            html += `<div class="tooltip-item" style="margin-left: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(74, 158, 255, 0.2);">
                <span style="color: rgba(255, 255, 255, 0.95); font-weight: bold;">Total Intelligence:</span>
                <span style="color: #4a9eff; font-weight: bold; margin-left: 8px; font-size: 13px;">${this.formatFLOPS(breakdown.total || 0)}</span>
            </div>`;
            html += `</div>`;
            
            // Note about consumption
            html += `<div class="tooltip-section" style="margin-top: 12px; padding-top: 12px; border-top: 2px solid rgba(74, 158, 255, 0.4);">
                <div style="font-size: 10px; color: rgba(255, 255, 255, 0.6); font-style: italic;">Note: Intelligence is not consumed, only produced.</div>
            </div>`;
        }
        
        html += '</div>';
        tooltipEl.innerHTML = html;
    }

    update(gameState) {
        if (!gameState) return;
        
        // Change detection: Only update if relevant data has changed
        // Use efficient hash instead of JSON.stringify to avoid memory issues
        let hash = 0;
        hash = ((hash << 5) - hash) + (gameState.energy || 0);
        hash = ((hash << 5) - hash) + (gameState.intelligence || 0);
        hash = ((hash << 5) - hash) + (gameState.dexterity || 0);
        hash = ((hash << 5) - hash) + (gameState.dyson_sphere_progress || 0);
        hash = ((hash << 5) - hash) + (gameState.energy_production_rate || 0);
        hash = ((hash << 5) - hash) + (gameState.energy_consumption_rate || 0);
        
        // Hash probe counts efficiently - single probe type only
        const probesByZone = gameState.probes_by_zone || {};
        for (const [zoneId, zoneProbes] of Object.entries(probesByZone)) {
            if (zoneProbes && typeof zoneProbes === 'object') {
                // Single probe type: directly access 'probe' key
                const zoneCount = zoneProbes['probe'] || 0;
                hash = ((hash << 5) - hash) + zoneId.charCodeAt(0);
                hash = ((hash << 5) - hash) + zoneCount;
            }
        }
        
        const currentHash = hash.toString();
        
        if (currentHash === this.lastUpdateHash && this.lastUpdateHash !== null) {
            return; // No changes, skip update
        }
        this.lastUpdateHash = currentHash;
        
        // Store game state for tooltip calculations
        this.gameState = gameState;

        // Update values directly from game state
        const energy = gameState.energy || 0;
        const intelligence = gameState.intelligence || 0;
        const dexterity = gameState.dexterity || 0;
        const dysonProgress = gameState.dyson_sphere?.progress || 0;

        const energyEl = document.getElementById('resource-energy');
        const intelligenceEl = document.getElementById('resource-intelligence');
        const dexterityEl = document.getElementById('resource-dexterity');
        const dysonProgressEl = document.getElementById('resource-dyson-progress');

        // Update energy display (Net, Produced, Consumed)
        // Read from derived.totals (pre-calculated in worker)
        const derived = gameState.derived || {};
        const totals = derived.totals || {};
        const energyProduction = totals.energy_produced || 0;
        const energyConsumption = totals.energy_consumed || 0;
        const energyNet = totals.energy_net || 0;
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
        const intelligenceProduction = totals.intelligence_produced || 0;
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
        const metalProductionRate = totals.metal_mined_rate || 0; // kg/day from derived
        
        // Use actual metal consumption rate from derived (only counts metal actually consumed)
        const totalMetalConsumption = totals.metal_consumed_rate || 0; // kg/day from derived
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

        const dysonMass = gameState.dyson_sphere?.mass || 0;
        const dysonTarget = gameState.dyson_sphere?.target_mass || 1;
        const dysonMassEl = document.getElementById('resource-dyson-mass');
        if (dysonProgressEl) dysonProgressEl.textContent = `${(dysonProgress * 100).toFixed(5)}%`;
        if (dysonMassEl) dysonMassEl.textContent = `${this.formatNumber(dysonMass)} kg`;
        
        // Read probe mass from derived.totals (pre-calculated in worker)
        const totalProbeMass = totals.probe_mass || 0;
        const probeMassEl = document.getElementById('resource-probe-mass');
        if (probeMassEl) probeMassEl.textContent = `${this.formatNumber(totalProbeMass)} kg`;
        
        // Read structure mass from derived.totals (pre-calculated in worker)
        const totalStructureMass = totals.structure_mass || 0;
        const structureMassEl = document.getElementById('resource-structure-mass');
        if (structureMassEl) structureMassEl.textContent = `${this.formatNumber(totalStructureMass)} kg`;
        
        // Update full mode displays if they exist
        const probeMassFullEl = document.getElementById('resource-probe-mass-full');
        if (probeMassFullEl) {
            const derived = gameState.derived || {};
            const totals = derived.totals || {};
            const totalProbeMass = totals.probe_mass || 0;
            probeMassFullEl.textContent = `Probe Mass: ${this.formatNumber(totalProbeMass)} kg`;
        }
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
        if (!zoneMetalList) return;

        const derivedZones = gameState.derived?.zones || {};
        const zones = gameState.zones || {};
        
        if (Object.keys(derivedZones).length === 0 && Object.keys(zones).length === 0) return;

        let html = '';
        // Use derived zones if available, otherwise calculate from zone state
        const zonesToDisplay = Object.keys(derivedZones).length > 0 ? derivedZones : zones;
        
        Object.entries(zonesToDisplay).forEach(([zoneId, zoneData]) => {
            let metalRemaining = 0;
            let isDepleted = false;
            
            if (derivedZones[zoneId]) {
                // Use derived metal_remaining
                metalRemaining = derivedZones[zoneId].metal_remaining || 0;
                isDepleted = zones[zoneId]?.depleted || false;
            } else if (zones[zoneId]) {
                // Calculate from mass_remaining * metal_percentage
                const zoneState = zones[zoneId];
                const zoneInfo = this.orbitalMechanics?.getZone?.(zoneId);
                const metalPercentage = zoneInfo?.metal_percentage || 0;
                metalRemaining = (zoneState.mass_remaining || 0) * metalPercentage;
                isDepleted = zoneState.depleted || false;
            }
            
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

