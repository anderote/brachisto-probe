/** Probe summary panel - left side overlay showing probe statistics */
class ProbeSummaryPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.gameState = null;
        
        // Performance optimization: Cache calculations
        this.cachedCalculations = null;
        this.lastCalculationKey = null;
        
        if (!this.container) {
            console.error('ProbeSummaryPanel: Container not found:', containerId);
        } else {
            console.log('ProbeSummaryPanel: Container found, initializing');
            this.init();
        }
    }

    init() {
        if (this.container) {
            this.render();
        } else {
            console.warn('ProbeSummaryPanel: Cannot init, container not found');
        }
    }

    formatNumber(value) {
        if (value === null || value === undefined || isNaN(value)) return '0';
        if (value === 0) return '0';
        // Use scientific notation for numbers >= 10
        if (value >= 10) {
            return value.toExponential(2);
        }
        // Use float notation for numbers < 1
        if (value < 1 && value > 0) {
            return value.toFixed(4);
        }
        // Regular notation for 1 <= value < 10
        return value.toFixed(2);
    }

    formatNumberWithCommas(value) {
        if (value === null || value === undefined || isNaN(value)) return '0';
        if (value >= 1e6) {
            return value.toExponential(2);
        }
        return Math.floor(value).toLocaleString('en-US');
    }

    render() {
        if (!this.container) {
            console.warn('ProbeSummaryPanel: Cannot render, container not found');
            return;
        }

        try {
            let html = '<div class="probe-summary-panel">';
            
            // Title
            html += '<div class="probe-summary-title">Summary</div>';
            
            // Total Probes
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Total Probes</div>';
            html += '<div class="probe-summary-value" id="probe-summary-total">0</div>';
            html += '</div>';

            // Probe Production Rate
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Production Rate</div>';
            html += '<div class="probe-summary-value" id="probe-summary-rate">0.00 probes/day</div>';
            html += '</div>';

            // Doubling Time
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Doubling Time</div>';
            html += '<div class="probe-summary-value" id="probe-summary-doubling">—</div>';
            html += '</div>';

            // Probe Allocation
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Probe Allocation</div>';
            html += '<div class="probe-summary-breakdown" id="probe-summary-allocation">';
            html += '<div class="probe-summary-breakdown-item">';
            html += '<span class="probe-summary-breakdown-label">Dyson:</span>';
            html += '<span class="probe-summary-breakdown-count" id="probe-alloc-dyson-count">0</span>';
            html += '</div>';
            html += '<div class="probe-summary-breakdown-item">';
            html += '<span class="probe-summary-breakdown-label">Replication:</span>';
            html += '<span class="probe-summary-breakdown-count" id="probe-alloc-replication-count">0</span>';
            html += '</div>';
            html += '<div class="probe-summary-breakdown-item">';
            html += '<span class="probe-summary-breakdown-label">Mining:</span>';
            html += '<span class="probe-summary-breakdown-count" id="probe-alloc-mining-count">0</span>';
            html += '</div>';
            html += '<div class="probe-summary-breakdown-item">';
            html += '<span class="probe-summary-breakdown-label">Construct:</span>';
            html += '<span class="probe-summary-breakdown-count" id="probe-alloc-construct-count">0</span>';
            html += '</div>';
            html += '<div class="probe-summary-breakdown-item">';
            html += '<span class="probe-summary-breakdown-label">Transit:</span>';
            html += '<span class="probe-summary-breakdown-count" id="probe-alloc-transit-count">0</span>';
            html += '</div>';
            html += '</div>';
            html += '</div>';

            // Structure Allocation
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Structures</div>';
            html += '<div class="probe-summary-breakdown" id="structure-summary-allocation">';
            html += '</div>';
            html += '</div>';

            html += '</div>'; // Close probe-summary-panel
            
            // Zone Controls section (rendered by CommandPanel)
            // The command-panel-content div is already in the container, CommandPanel will render into it

            this.container.innerHTML = html;
        } catch (error) {
            console.error('ProbeSummaryPanel: Error rendering panel:', error);
        }
    }

    update(gameState) {
        if (!gameState) return;
        
        // Ensure container exists
        if (!this.container) {
            this.container = document.getElementById('probe-summary-panel');
            if (!this.container) {
                console.warn('ProbeSummaryPanel: container not found, skipping update');
                return;
            }
        }
        
        // Ensure the panel is rendered
        const hasContent = this.container.querySelector('.probe-summary-panel');
        if (!hasContent) {
            console.log('ProbeSummaryPanel: Rendering panel (content missing)');
            this.render();
            if (!this.container.querySelector('.probe-summary-panel')) {
                console.error('ProbeSummaryPanel: Render failed, panel still missing');
                return;
            }
        }

        this.gameState = gameState;

        // Read from derived.totals (pre-calculated in worker)
        // Fallback: calculate from raw state if derived values not available
        const derived = gameState.derived || {};
        const totals = derived.totals || {};
        let totalProbes = totals.probe_count || 0;
        
        // Fallback: if derived values not calculated yet, calculate from raw state
        if (totalProbes === 0 && (!derived.totals || Object.keys(derived.totals).length === 0)) {
            const probesByZone = gameState.probes_by_zone || {};
            for (const [zoneId, zoneProbes] of Object.entries(probesByZone)) {
                if (zoneProbes && typeof zoneProbes === 'object') {
                    totalProbes += zoneProbes['probe'] || 0;
                }
            }
            // Also check legacy probes
            if (totalProbes === 0 && gameState.probes) {
                totalProbes += gameState.probes['probe'] || 0;
            }
        }
        
        const totalEl = document.getElementById('probe-summary-total');
        if (totalEl) {
            totalEl.textContent = this.formatNumberWithCommas(Math.floor(totalProbes));
        }

        // Probe production rate (includes both factory production and manual probe building)
        // Rate is in probes/day (fundamental time unit)
        // Read from rates.probe_production (calculated in worker)
        const totalProbeProductionRate = gameState.rates?.probe_production !== undefined 
            ? gameState.rates.probe_production 
            : 0;
        const rateEl = document.getElementById('probe-summary-rate');
        if (rateEl) {
            // Format in scientific notation for probes per day
            if (!totalProbeProductionRate || totalProbeProductionRate === 0) {
                rateEl.textContent = '0.00 probes/day';
            } else {
                rateEl.textContent = `${totalProbeProductionRate.toExponential(2)} probes/day`;
            }
        }
        
        // Calculate doubling time
        // For exponential growth: if production_rate scales with probe_count,
        // then doubling_time = ln(2) * current_probes / production_rate
        // For linear growth (constant production rate): doubling_time = current_probes / production_rate
        // Since probe production includes replicating probes (which scale with probe count),
        // we use exponential growth formula
        // Note: production_rate is in probes/day, so doubling_time will be in days
        let doublingTime = Infinity;
        if (totalProbeProductionRate > 0 && totalProbes > 0) {
            // Calculate growth rate: production_rate / current_probes (probes per day per probe)
            const growthRate = totalProbeProductionRate / totalProbes;
            
            // For exponential growth: doubling_time = ln(2) / growth_rate (in days)
            // This is equivalent to: ln(2) * current_probes / production_rate
            if (growthRate > 0 && isFinite(growthRate)) {
                doublingTime = Math.log(2) / growthRate; // Result in days
            } else {
                // Fallback to linear growth if growth rate is invalid
                doublingTime = totalProbes / totalProbeProductionRate; // Result in days
            }
        }
        const doublingEl = document.getElementById('probe-summary-doubling');
        if (doublingEl) {
            if (doublingTime === Infinity || doublingTime <= 0 || !isFinite(doublingTime)) {
                doublingEl.textContent = '—';
            } else {
                // doublingTime is in days, use FormatUtils for consistent formatting
                // FormatUtils.formatDoublingTime can show hours/minutes for very short times
                doublingEl.textContent = FormatUtils.formatDoublingTime(doublingTime);
            }
        }

        // Probe Allocation (replaces Dexterity Breakdown)
        // Read from derived.totals (pre-calculated in worker)
        // Fallback: calculate from raw state if derived values not available
        let totalDyson = totals.probes_dyson || 0;
        let totalReplication = totals.probes_replicating || 0;
        let totalMining = totals.probes_mining || 0;
        let totalConstruct = totals.probes_constructing || 0;
        let totalTransit = totals.probes_transit || 0;
        
        // Fallback: if derived values not calculated yet, calculate from raw state
        if ((totalDyson + totalReplication + totalMining + totalConstruct) === 0 && 
            (!derived.totals || Object.keys(derived.totals).length === 0)) {
            const probesByZone = gameState.probes_by_zone || {};
            const probeAllocationsByZone = gameState.probe_allocations_by_zone || {};
            const activeTransfers = gameState.active_transfers || [];
            
            for (const [zoneId, zoneProbes] of Object.entries(probesByZone)) {
                if (zoneId === 'transfer') continue; // Skip transfer zone
                const probeCount = zoneProbes['probe'] || 0;
                const allocations = probeAllocationsByZone[zoneId] || {};
                
                // Use fractional values (don't floor to 0)
                totalMining += probeCount * (allocations.harvest || 0);
                totalConstruct += probeCount * (allocations.construct || 0);
                totalReplication += probeCount * (allocations.replicate || 0);
                totalDyson += probeCount * (allocations.dyson || 0);
            }
            
            // Count transit probes (handles both one-time and continuous)
            for (const transfer of activeTransfers) {
                if (transfer.type === 'continuous') {
                    // Sum all batches in transit
                    if (transfer.in_transit) {
                        for (const batch of transfer.in_transit) {
                            totalTransit += batch.count || 0;
                        }
                    }
                } else {
                    // One-time transfer: count if still traveling
                    if (transfer.status === 'traveling' || transfer.status === 'paused') {
                        totalTransit += transfer.probe_count || 0;
                    }
                }
            }
        }
        
        // Update probe allocation counts
        // Display fractional probe assignments with one decimal place
        const dysonCountEl = document.getElementById('probe-alloc-dyson-count');
        const replicationCountEl = document.getElementById('probe-alloc-replication-count');
        const miningCountEl = document.getElementById('probe-alloc-mining-count');
        const constructCountEl = document.getElementById('probe-alloc-construct-count');
        const transitCountEl = document.getElementById('probe-alloc-transit-count');
        
        // Format function: show one decimal place for fractional probe assignments, scientific notation when > 100
        const formatProbeCount = (count) => {
            if (count === 0) return '0.0';
            // Use scientific notation for values > 100
            if (count > 100) {
                return count.toExponential(2);
            }
            // Always show one decimal place for values <= 100
            return count.toFixed(1);
        };
        
        if (dysonCountEl) dysonCountEl.textContent = formatProbeCount(totalDyson);
        if (replicationCountEl) replicationCountEl.textContent = formatProbeCount(totalReplication);
        if (miningCountEl) miningCountEl.textContent = formatProbeCount(totalMining);
        if (constructCountEl) constructCountEl.textContent = formatProbeCount(totalConstruct);
        if (transitCountEl) transitCountEl.textContent = formatProbeCount(totalTransit);
        
        // Update Structure Allocation
        this.updateStructureAllocation(gameState);
    }
    
    updateStructureAllocation(gameState) {
        const structureContainer = document.getElementById('structure-summary-allocation');
        if (!structureContainer) return;
        
        // Count structures across all zones
        const structuresByZone = gameState.structures_by_zone || {};
        const structureTotals = {};
        
        for (const [zoneId, zoneStructures] of Object.entries(structuresByZone)) {
            for (const [structureId, count] of Object.entries(zoneStructures)) {
                if (count > 0) {
                    structureTotals[structureId] = (structureTotals[structureId] || 0) + count;
                }
            }
        }
        
        // Format structure counts
        const formatCount = (count) => {
            if (count === 0) return '0';
            if (count >= 1000) {
                return count.toExponential(2);
            }
            return Math.floor(count).toLocaleString('en-US');
        };
        
        // Get structure display names
        const getStructureName = (structureId) => {
            if (window.gameDataLoader) {
                const building = window.gameDataLoader.getBuildingById(structureId);
                if (building && building.name) {
                    return building.name;
                }
            }
            // Fallback: format the ID nicely
            return structureId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        };
        
        // Build HTML for structure list
        let html = '';
        const sortedStructures = Object.entries(structureTotals).sort((a, b) => b[1] - a[1]);
        
        if (sortedStructures.length === 0) {
            html = '<div class="probe-summary-breakdown-item" style="color: rgba(255,255,255,0.5);">None</div>';
        } else {
            for (const [structureId, count] of sortedStructures) {
                const name = getStructureName(structureId);
                html += `<div class="probe-summary-breakdown-item">`;
                html += `<span class="probe-summary-breakdown-label">${name}:</span>`;
                html += `<span class="probe-summary-breakdown-count">${formatCount(count)}</span>`;
                html += `</div>`;
            }
        }
        
        structureContainer.innerHTML = html;
    }
}

