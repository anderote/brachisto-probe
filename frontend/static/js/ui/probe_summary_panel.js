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

        // Calculate total probes
        const totalProbes = Object.values(gameState.probes || {}).reduce((sum, count) => sum + (count || 0), 0);
        const totalEl = document.getElementById('probe-summary-total');
        if (totalEl) {
            totalEl.textContent = this.formatNumberWithCommas(totalProbes);
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

        // Allocations breakdown - changed to: dyson, replicate, construction, harvest
        const allocationsEl = document.getElementById('probe-summary-allocations');
        if (allocationsEl) {
            let allocationsHtml = '';
            
            // Dyson allocation
            const dysonProbes = Object.values(allocations.dyson || {}).reduce((sum, count) => sum + (count || 0), 0);
            if (dysonProbes > 0) {
                allocationsHtml += `<div class="probe-summary-breakdown-item">
                    <span class="probe-summary-breakdown-label">Dyson:</span>
                    <span class="probe-summary-breakdown-value">${this.formatNumberWithCommas(dysonProbes)}</span>
                </div>`;
            }

            // Replicate allocation (probes building other probes)
            // This is the construct allocation with build_allocation > 0
            const replicateProbes = probeBuildingProbes;
            if (replicateProbes > 0) {
                allocationsHtml += `<div class="probe-summary-breakdown-item">
                    <span class="probe-summary-breakdown-label">Replicate:</span>
                    <span class="probe-summary-breakdown-value">${this.formatNumberWithCommas(Math.floor(replicateProbes))}</span>
                </div>`;
            }

            // Construction allocation (probes building structures)
            // This is the construct allocation with build_allocation < 100
            const structureBuildingFraction = 1.0 - probeBuildingFraction;
            const constructionProbes = constructingProbes * structureBuildingFraction;
            if (constructionProbes > 0) {
                allocationsHtml += `<div class="probe-summary-breakdown-item">
                    <span class="probe-summary-breakdown-label">Construction:</span>
                    <span class="probe-summary-breakdown-value">${this.formatNumberWithCommas(Math.floor(constructionProbes))}</span>
                </div>`;
            }

            // Harvest allocation
            const harvestProbes = Object.values(allocations.harvest || {}).reduce((sum, count) => sum + (count || 0), 0);
            if (harvestProbes > 0) {
                allocationsHtml += `<div class="probe-summary-breakdown-item">
                    <span class="probe-summary-breakdown-label">Harvest:</span>
                    <span class="probe-summary-breakdown-value">${this.formatNumberWithCommas(harvestProbes)}</span>
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

