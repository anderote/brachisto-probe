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
            
            // Energy probes
            const energyProbes = this.gameState.probes?.energy_probe || 0;
            if (energyProbes > 0) {
                const probeEnergy = energyProbes * 2000; // 2000W per probe
                html += `<div class="energy-tooltip-item">Energy Probes (${energyProbes}): ${this.formatEnergy(probeEnergy)}</div>`;
            }
            
            // Structures
            if (this.gameState.structures) {
                let structureEnergy = 0;
                const structureDetails = [];
                for (const [buildingId, count] of Object.entries(this.gameState.structures)) {
                    // We'd need building data to get exact energy, but we can show count
                    if (count > 0) {
                        structureDetails.push(`${buildingId}: ${count}`);
                    }
                }
                if (structureDetails.length > 0) {
                    html += `<div class="energy-tooltip-item">Structures: ${structureDetails.join(', ')}</div>`;
                }
            }
            
            // Base production from breakdown
            const baseProduction = breakdown.production.base || 0; // Backend in watts
            if (baseProduction > 0) {
                html += `<div class="energy-tooltip-item">Base: ${this.formatEnergy(baseProduction)}</div>`;
            }
            
            // Upgrades
            if (breakdown.production.upgrades && breakdown.production.upgrades.length > 0) {
                breakdown.production.upgrades.forEach(upgrade => {
                    if (upgrade.researched) {
                        html += `<div class="energy-tooltip-upgrade">${upgrade.name}: +${(upgrade.bonus * 100).toFixed(1)}%</div>`;
                    }
                });
            }
            
            const totalProduction = breakdown.production.total || 0; // Backend in watts
            html += `<div class="energy-tooltip-total">Total: ${this.formatEnergy(totalProduction)}</div>`;
            html += '</div>';
        }
        
        // Consumption breakdown
        if (breakdown.consumption) {
            html += '<div class="energy-tooltip-section" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.2);">';
            html += '<div class="energy-tooltip-title">Consumption:</div>';
            
            // Probes
            const totalProbes = this.gameState.probes?.probe || 0;
            const minerProbes = this.gameState.probes?.miner_probe || 0;
            const computeProbes = this.gameState.probes?.compute_probe || 0;
            const constructionProbes = this.gameState.probes?.construction_probe || 0;
            
            if (totalProbes > 0) {
                html += `<div class="energy-tooltip-item">Probes (${totalProbes}): Base consumption</div>`;
            }
            if (minerProbes > 0) {
                html += `<div class="energy-tooltip-item">Miner Probes (${minerProbes})</div>`;
            }
            if (computeProbes > 0) {
                html += `<div class="energy-tooltip-item">Compute Probes (${computeProbes})</div>`;
            }
            if (constructionProbes > 0) {
                html += `<div class="energy-tooltip-item">Construction Probes (${constructionProbes})</div>`;
            }
            
            // Structures
            if (this.gameState.structures) {
                const structureCount = Object.values(this.gameState.structures).reduce((a, b) => a + b, 0);
                if (structureCount > 0) {
                    html += `<div class="energy-tooltip-item">Structures (${structureCount}): Base consumption</div>`;
                }
            }
            
            // Harvesting energy cost
            const harvestAllocation = this.gameState.probe_allocations?.harvest || {};
            const totalHarvestProbes = Object.values(harvestAllocation).reduce((a, b) => a + (b || 0), 0);
            if (totalHarvestProbes > 0) {
                html += `<div class="energy-tooltip-item">Harvesting (${Math.floor(totalHarvestProbes)} probes): Delta-V cost</div>`;
            }
            
            // Base consumption from breakdown
            const baseConsumption = breakdown.consumption.base || 0; // Backend in watts
            if (baseConsumption > 0) {
                html += `<div class="energy-tooltip-item">Base: ${this.formatEnergy(baseConsumption)}</div>`;
            }
            
            // Upgrades
            if (breakdown.consumption.upgrades && breakdown.consumption.upgrades.length > 0) {
                breakdown.consumption.upgrades.forEach(upgrade => {
                    if (upgrade.researched) {
                        html += `<div class="energy-tooltip-upgrade">${upgrade.name}: -${(upgrade.bonus * 100).toFixed(1)}%</div>`;
                    }
                });
            }
            
            const totalConsumption = breakdown.consumption.total || 0; // Backend in watts
            html += `<div class="energy-tooltip-total">Total: ${this.formatEnergy(totalConsumption)}</div>`;
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

