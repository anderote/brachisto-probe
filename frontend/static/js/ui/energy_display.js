/** Energy Display - Shows energy production and consumption below command bars */
class EnergyDisplay {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.gameState = null;
        this.previousState = null;
        this.init();
    }

    init() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="energy-display-simple">
                <div class="energy-line" id="energy-production-line">
                    <span class="energy-label">Production:</span>
                    <span class="energy-value" id="energy-production">0 kW</span>
                </div>
                <div class="energy-line" id="energy-consumption-line">
                    <span class="energy-label">Consumption:</span>
                    <span class="energy-value" id="energy-consumption">0 kW</span>
                </div>
                <div class="energy-line" id="energy-net-line">
                    <span class="energy-label">Net:</span>
                    <span class="energy-value" id="energy-net">0 kW</span>
                </div>
                <div class="energy-line" id="energy-storage-line">
                    <span class="energy-label">Storage:</span>
                    <span class="energy-value" id="energy-storage">0 / 0 W·d</span>
                </div>
                <div class="energy-tooltip" id="energy-tooltip"></div>
            </div>
        `;
        
        // Set up tooltip
        this.setupTooltip();
    }

    setupTooltip() {
        const container = this.container;
        const tooltip = document.getElementById('energy-tooltip');
        
        if (container && tooltip) {
            container.addEventListener('mouseenter', () => {
                this.showTooltip(tooltip, container);
            });
            container.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
            });
        }
    }

    showTooltip(tooltipEl, containerEl) {
        if (!this.gameState || !this.gameState.resource_breakdowns || !this.gameState.resource_breakdowns.energy) {
            return;
        }

        const breakdown = this.gameState.resource_breakdowns.energy;
        const rect = containerEl.getBoundingClientRect();
        
        let html = '<div class="energy-tooltip-content">';
        
        // Production breakdown
        if (breakdown.production) {
            html += '<div class="energy-tooltip-section">';
            html += '<div class="energy-tooltip-title">Production:</div>';
            
            const productionBreakdown = breakdown.production.breakdown || {};
            
            // Base supply
            const baseSupply = productionBreakdown.base_supply || 0;
            if (baseSupply > 0) {
                html += `<div class="energy-tooltip-item">Base Supply: ${this.formatEnergy(baseSupply)}</div>`;
            }
            
            // --- Structures by Type ---
            html += '<div class="energy-tooltip-subtitle" style="margin-top: 8px; font-weight: bold; font-size: 11px; color: rgba(255, 200, 100, 0.9);">Structures:</div>';
            const structuresByType = productionBreakdown.structures_by_type || {};
            const structureTypeEntries = Object.entries(structuresByType);
            if (structureTypeEntries.length > 0) {
                for (const [buildingId, data] of structureTypeEntries) {
                    html += `<div class="energy-tooltip-item" style="padding-left: 8px;">${data.name} (${data.count}): ${this.formatEnergy(data.production)}</div>`;
                }
            } else {
                const structuresTotal = productionBreakdown.structures || 0;
                if (structuresTotal > 0) {
                    html += `<div class="energy-tooltip-item" style="padding-left: 8px;">Total: ${this.formatEnergy(structuresTotal)}</div>`;
                } else {
                    html += `<div class="energy-tooltip-item" style="padding-left: 8px; opacity: 0.6;">None</div>`;
                }
            }
            
            // Dyson sphere
            const dysonProduction = productionBreakdown.dyson_sphere || 0;
            if (dysonProduction > 0) {
                html += `<div class="energy-tooltip-item" style="margin-top: 4px;">Dyson Sphere: ${this.formatEnergy(dysonProduction)}</div>`;
            }
            
            // Upgrades
            if (breakdown.production.upgrades && breakdown.production.upgrades.length > 0) {
                html += '<div class="energy-tooltip-subtitle" style="margin-top: 8px; font-weight: bold; font-size: 11px; color: rgba(100, 255, 100, 0.9);">Efficiency Bonuses:</div>';
                breakdown.production.upgrades.forEach(upgrade => {
                    if (upgrade.researched) {
                        html += `<div class="energy-tooltip-upgrade" style="padding-left: 8px;">${upgrade.name}: +${(upgrade.bonus * 100).toFixed(1)}%</div>`;
                    }
                });
            }
            
            const totalProduction = breakdown.production.total || 0; // Backend in watts
            html += `<div class="energy-tooltip-total" style="margin-top: 8px;">Total: ${this.formatEnergy(totalProduction)}</div>`;
            html += '</div>';
        }
        
        // Consumption breakdown
        if (breakdown.consumption) {
            html += '<div class="energy-tooltip-section" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.2);">';
            html += '<div class="energy-tooltip-title">Consumption:</div>';
            
            const consumptionBreakdown = breakdown.consumption.breakdown || {};
            
            // --- Structures by Type ---
            html += '<div class="energy-tooltip-subtitle" style="margin-top: 8px; font-weight: bold; font-size: 11px; color: rgba(255, 200, 100, 0.9);">Structures:</div>';
            const structuresByType = consumptionBreakdown.structures_by_type || {};
            const structureTypeEntries = Object.entries(structuresByType);
            if (structureTypeEntries.length > 0) {
                for (const [buildingId, data] of structureTypeEntries) {
                    html += `<div class="energy-tooltip-item" style="padding-left: 8px;">${data.name} (${data.count}): ${this.formatEnergy(data.consumption)}</div>`;
                }
            } else {
                const structuresTotal = consumptionBreakdown.structures || 0;
                if (structuresTotal > 0) {
                    html += `<div class="energy-tooltip-item" style="padding-left: 8px;">Total: ${this.formatEnergy(structuresTotal)}</div>`;
                } else {
                    html += `<div class="energy-tooltip-item" style="padding-left: 8px; opacity: 0.6;">None</div>`;
                }
            }
            
            // --- Drone Activities ---
            html += '<div class="energy-tooltip-subtitle" style="margin-top: 8px; font-weight: bold; font-size: 11px; color: rgba(100, 200, 255, 0.9);">Drone Activities:</div>';
            
            // Probe base consumption
            const probesConsumption = consumptionBreakdown.probes || 0;
            const totalProbes = this.gameState.probes?.probe || 0;
            if (probesConsumption > 0 || totalProbes > 0) {
                html += `<div class="energy-tooltip-item" style="padding-left: 8px;">Base (${totalProbes} probes): ${this.formatEnergy(probesConsumption)}</div>`;
            }
            
            // Harvesting/Mining
            const harvestingConsumption = consumptionBreakdown.harvesting || 0;
            if (harvestingConsumption > 0) {
                const harvestAllocation = this.gameState.probe_allocations?.harvest || {};
                const totalHarvestProbes = Object.values(harvestAllocation).reduce((a, b) => a + (b || 0), 0);
                html += `<div class="energy-tooltip-item" style="padding-left: 8px;">Mining (${Math.floor(totalHarvestProbes)} probes): ${this.formatEnergy(harvestingConsumption)}</div>`;
            }
            
            // Probe construction
            const probeConstructionConsumption = consumptionBreakdown.probe_construction || 0;
            if (probeConstructionConsumption > 0) {
                html += `<div class="energy-tooltip-item" style="padding-left: 8px;">Probe Construction: ${this.formatEnergy(probeConstructionConsumption)}</div>`;
            }
            
            // Structure construction
            const structureConstructionConsumption = consumptionBreakdown.structure_construction || 0;
            if (structureConstructionConsumption > 0) {
                html += `<div class="energy-tooltip-item" style="padding-left: 8px;">Structure Construction: ${this.formatEnergy(structureConstructionConsumption)}</div>`;
            }
            
            // Dyson construction
            const dysonConstructionConsumption = consumptionBreakdown.dyson_construction || 0;
            if (dysonConstructionConsumption > 0) {
                html += `<div class="energy-tooltip-item" style="padding-left: 8px;">Dyson Construction: ${this.formatEnergy(dysonConstructionConsumption)}</div>`;
            }
            
            // Show "None" if no drone activities
            if (probesConsumption === 0 && harvestingConsumption === 0 && probeConstructionConsumption === 0 && 
                structureConstructionConsumption === 0 && dysonConstructionConsumption === 0) {
                html += `<div class="energy-tooltip-item" style="padding-left: 8px; opacity: 0.6;">None</div>`;
            }
            
            // --- Upgrades ---
            if (breakdown.consumption.upgrades && breakdown.consumption.upgrades.length > 0) {
                html += '<div class="energy-tooltip-subtitle" style="margin-top: 8px; font-weight: bold; font-size: 11px; color: rgba(100, 255, 100, 0.9);">Efficiency Bonuses:</div>';
                breakdown.consumption.upgrades.forEach(upgrade => {
                    if (upgrade.researched) {
                        html += `<div class="energy-tooltip-upgrade" style="padding-left: 8px;">${upgrade.name}: -${(upgrade.bonus * 100).toFixed(1)}%</div>`;
                    }
                });
            }
            
            const totalConsumption = breakdown.consumption.total || 0; // Backend in watts
            html += `<div class="energy-tooltip-total" style="margin-top: 8px;">Total: ${this.formatEnergy(totalConsumption)}</div>`;
            html += '</div>';
        }
        
        // Storage breakdown
        const energyStored = this.gameState.energy_stored || 0;
        const storageCapacity = this.gameState.energy_storage_capacity || 0;
        if (storageCapacity > 0) {
            html += '<div class="energy-tooltip-section" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.2);">';
            html += '<div class="energy-tooltip-title">Storage:</div>';
            html += `<div class="energy-tooltip-item">Capacity: ${this.formatWattDays(storageCapacity)}</div>`;
            html += `<div class="energy-tooltip-item">Stored: ${this.formatWattDays(energyStored)}</div>`;
            const storagePercent = (energyStored / storageCapacity * 100).toFixed(1);
            html += `<div class="energy-tooltip-item">Fill: ${storagePercent}%</div>`;
            html += '</div>';
        }
        
        html += '</div>';
        tooltipEl.innerHTML = html;
        tooltipEl.style.display = 'block';
        
        // Position tooltip to the left of the container
        tooltipEl.style.left = `${rect.left - tooltipEl.offsetWidth - 10}px`;
        tooltipEl.style.top = `${rect.top + (rect.height / 2)}px`;
        tooltipEl.style.transform = 'translateY(-50%)';
        tooltipEl.style.right = 'auto';
    }

    formatNumber(value) {
        // Use scientific notation for all numbers
        if (value === 0) return '0';
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
    
    formatWattDays(value) {
        // Format watt-days values with appropriate units
        if (value === 0) return '0 W·d';
        if (value >= 1e9) {
            return `${(value / 1e9).toFixed(2)} GW·d`;
        } else if (value >= 1e6) {
            return `${(value / 1e6).toFixed(2)} MW·d`;
        } else if (value >= 1e3) {
            return `${(value / 1e3).toFixed(2)} kW·d`;
        } else {
            return `${value.toFixed(2)} W·d`;
        }
    }

    update(gameState) {
        if (!gameState) return;
        
        this.gameState = gameState;
        
        // Get rates directly from game state (in watts)
        const productionRate = gameState.energy_production_rate || 0;
        const consumptionRate = gameState.energy_consumption_rate || 0;
        const netRate = productionRate - consumptionRate;
        
        const productionEl = document.getElementById('energy-production');
        const consumptionEl = document.getElementById('energy-consumption');
        const netEl = document.getElementById('energy-net');
        const storageEl = document.getElementById('energy-storage');
        
        if (productionEl) {
            productionEl.textContent = this.formatEnergy(productionRate);
        }
        if (consumptionEl) {
            consumptionEl.textContent = this.formatEnergy(consumptionRate);
        }
        if (netEl) {
            netEl.textContent = `${netRate >= 0 ? '+' : ''}${this.formatEnergy(Math.abs(netRate))}`;
        }
        if (storageEl) {
            const energyStored = gameState.energy_stored || 0;
            const storageCapacity = gameState.energy_storage_capacity || 0;
            const storagePercent = storageCapacity > 0 ? (energyStored / storageCapacity * 100).toFixed(1) : '0.0';
            storageEl.textContent = `${this.formatWattDays(energyStored)} / ${this.formatWattDays(storageCapacity)} (${storagePercent}%)`;
        }
        
        // Update tooltip if visible
        const tooltip = document.getElementById('energy-tooltip');
        if (tooltip && tooltip.style.display === 'block') {
            this.showTooltip(tooltip, this.container);
        }
    }
}

