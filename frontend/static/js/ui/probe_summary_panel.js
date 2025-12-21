/** Probe summary panel - left side overlay showing probe statistics */
class ProbeSummaryPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.gameState = null;
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
        if (value === 0) return '0';
        // Use scientific notation for large numbers
        if (value >= 1e6) {
            return value.toExponential(2);
        }
        // Use float notation for small numbers
        if (value < 1 && value > 0) {
            return value.toFixed(2);
        }
        // Regular notation
        return value.toFixed(1);
    }

    formatNumberWithCommas(value) {
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
            html += '<div class="probe-summary-title">Probe Summary</div>';
            
            // Total Probes
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Total Probes</div>';
            html += '<div class="probe-summary-value" id="probe-summary-total">0</div>';
            html += '</div>';

            // Probe Production Rate
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Production Rate</div>';
            html += '<div class="probe-summary-value" id="probe-summary-rate">0.00 /s</div>';
            html += '</div>';

            // Doubling Time
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Doubling Time</div>';
            html += '<div class="probe-summary-value" id="probe-summary-doubling">—</div>';
            html += '</div>';

            // Allocations section
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Allocations</div>';
            html += '<div class="probe-summary-breakdown" id="probe-summary-allocations">';
            html += '<div class="probe-summary-breakdown-item">None</div>';
            html += '</div>';
            html += '</div>';

            html += '</div>';

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

        // Calculate total probes - sum across all zones
        let totalProbes = 0;
        // Legacy: global probe counts
        totalProbes += Object.values(gameState.probes || {}).reduce((sum, count) => sum + (count || 0), 0);
        // Zone-based probe counts
        const probesByZone = gameState.probes_by_zone || {};
        for (const [zoneId, zoneProbes] of Object.entries(probesByZone)) {
            if (zoneProbes && typeof zoneProbes === 'object') {
                totalProbes += Object.values(zoneProbes).reduce((sum, count) => sum + (count || 0), 0);
            }
        }
        const totalEl = document.getElementById('probe-summary-total');
        if (totalEl) {
            totalEl.textContent = this.formatNumberWithCommas(Math.floor(totalProbes));
        }

        // Probe production rate (includes both factory production and manual probe building)
        const totalProbeProductionRate = gameState.probe_production_rate !== undefined 
            ? gameState.probe_production_rate 
            : 0;
        const rateEl = document.getElementById('probe-summary-rate');
        if (rateEl) {
            rateEl.textContent = `${totalProbeProductionRate.toFixed(2)} /s`;
        }
        
        // Calculate doubling time
        // Doubling time = current_probe_count / production_rate_per_second
        let doublingTime = Infinity;
        if (totalProbeProductionRate > 0 && totalProbes > 0) {
            doublingTime = totalProbes / totalProbeProductionRate;
        }
        const doublingEl = document.getElementById('probe-summary-doubling');
        if (doublingEl) {
            if (doublingTime === Infinity || doublingTime <= 0 || !isFinite(doublingTime)) {
                doublingEl.textContent = '—';
            } else {
                doublingEl.textContent = `${Math.floor(doublingTime).toLocaleString('en-US')}s`;
            }
        }

        // Allocations breakdown - use zone-based allocations
        const allocationsEl = document.getElementById('probe-summary-allocations');
        if (allocationsEl) {
            let allocationsHtml = '';
            
            // Get allocations from game state
            const allocations = gameState.probe_allocations || {};
            const allocationsByZone = gameState.probe_allocations_by_zone || {};
            
            // Sum up allocations across all zones
            let totalDyson = 0;
            let totalReplicate = 0;
            let totalConstruct = 0;
            let totalHarvest = 0;
            
            // Legacy allocations (for backward compatibility)
            totalDyson += Object.values(allocations.dyson || {}).reduce((sum, count) => sum + (count || 0), 0);
            totalHarvest += Object.values(allocations.harvest || {}).reduce((sum, count) => sum + (count || 0), 0);
            totalConstruct += Object.values(allocations.construct || {}).reduce((sum, count) => sum + (count || 0), 0);
            
            // Zone-based allocations
            for (const [zoneId, zoneAllocs] of Object.entries(allocationsByZone)) {
                totalDyson += Object.values(zoneAllocs.dyson || {}).reduce((sum, count) => sum + (count || 0), 0);
                totalHarvest += Object.values(zoneAllocs.harvest || {}).reduce((sum, count) => sum + (count || 0), 0);
                totalReplicate += Object.values(zoneAllocs.replicate || {}).reduce((sum, count) => sum + (count || 0), 0);
                totalConstruct += Object.values(zoneAllocs.construct || {}).reduce((sum, count) => sum + (count || 0), 0);
            }
            
            if (totalDyson > 0) {
                allocationsHtml += `<div class="probe-summary-breakdown-item">
                    <span class="probe-summary-breakdown-label">Dyson:</span>
                    <span class="probe-summary-breakdown-value">${this.formatNumberWithCommas(Math.floor(totalDyson))}</span>
                </div>`;
            }
            
            if (totalReplicate > 0) {
                allocationsHtml += `<div class="probe-summary-breakdown-item">
                    <span class="probe-summary-breakdown-label">Replicate:</span>
                    <span class="probe-summary-breakdown-value">${this.formatNumberWithCommas(Math.floor(totalReplicate))}</span>
                </div>`;
            }
            
            if (totalConstruct > 0) {
                allocationsHtml += `<div class="probe-summary-breakdown-item">
                    <span class="probe-summary-breakdown-label">Construct:</span>
                    <span class="probe-summary-breakdown-value">${this.formatNumberWithCommas(Math.floor(totalConstruct))}</span>
                </div>`;
            }
            
            if (totalHarvest > 0) {
                allocationsHtml += `<div class="probe-summary-breakdown-item">
                    <span class="probe-summary-breakdown-label">Harvest:</span>
                    <span class="probe-summary-breakdown-value">${this.formatNumberWithCommas(Math.floor(totalHarvest))}</span>
                </div>`;
            }

            // Show "None" if no allocations
            if (allocationsHtml === '') {
                allocationsHtml = '<div class="probe-summary-breakdown-item">None</div>';
            }

            allocationsEl.innerHTML = allocationsHtml;
        }
    }
}

