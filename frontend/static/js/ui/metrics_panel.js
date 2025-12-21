/** Metrics panel - real-time game statistics */
class MetricsPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.gameState = null;
        this.previousState = null;
        if (!this.container) {
            console.error('MetricsPanel: Container not found:', containerId);
            console.log('MetricsPanel: Available elements:', document.querySelectorAll('[id*="metric"]'));
        } else {
            console.log('MetricsPanel: Container found, initializing');
            this.init();
        }
    }

    init() {
        if (this.container) {
            this.render();
        } else {
            console.warn('MetricsPanel: Cannot init, container not found');
        }
    }

    formatNumber(value) {
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
        return Math.floor(value).toLocaleString('en-US');
    }

    render() {
        if (!this.container) {
            console.warn('MetricsPanel: Cannot render, container not found');
            return;
        }

        try {
            let html = '<div class="metrics-panel">';
            
            // Total Probes
            html += '<div class="metric-item">';
            html += '<div class="metric-label">Total Probes</div>';
            html += '<div class="metric-value" id="metric-total-probes">0</div>';
            html += '</div>';

            // Probe Production Rate
            html += '<div class="metric-item">';
            html += '<div class="metric-label">Probe Production Rate</div>';
            html += '<div class="metric-value" id="metric-probe-rate">0.00 /s</div>';
            html += '</div>';

            // Dexterity Breakdown
            html += '<div class="metric-item">';
            html += '<div class="metric-label">Dexterity Breakdown</div>';
            html += '<div class="metric-breakdown">';
            html += '<div class="metric-breakdown-item"><span class="breakdown-label">Dyson:</span> <div class="breakdown-value"><span id="metric-dex-dyson-rate">0 kg/s</span><div class="breakdown-probe-count" id="metric-dex-dyson-count">(0 probes)</div></div></div>';
            html += '<div class="metric-breakdown-item"><span class="breakdown-label">Mining:</span> <div class="breakdown-value"><span id="metric-dex-mining-rate">0 kg/s</span><div class="breakdown-probe-count" id="metric-dex-mining-count">(0 probes)</div></div></div>';
            html += '<div class="metric-breakdown-item"><span class="breakdown-label">Probes:</span> <div class="breakdown-value"><span id="metric-dex-probes-rate">0 kg/s</span><div class="breakdown-probe-count" id="metric-dex-probes-count">(0 probes)</div></div></div>';
            html += '<div class="metric-breakdown-item"><span class="breakdown-label">Structures:</span> <div class="breakdown-value"><span id="metric-dex-structures-rate">0 kg/s</span><div class="breakdown-probe-count" id="metric-dex-structures-count">(0 probes)</div></div></div>';
            html += '</div>';
            html += '</div>';

            // Probe Base Rate Multipliers
            html += '<div class="metric-item">';
            html += '<div class="metric-label">Probe Rate Multipliers</div>';
            html += '<div class="metric-breakdown" id="metric-multipliers">';
            html += '<div class="metric-breakdown-item">None</div>';
            html += '</div>';
            html += '</div>';

            html += '</div>';

            this.container.innerHTML = html;
        } catch (error) {
            console.error('MetricsPanel: Error rendering panel:', error);
        }
    }

    calculateDexterityForProbes(probes, baseDexterity, multiplier = 1.0) {
        return probes * baseDexterity * multiplier;
    }

    update(gameState) {
        if (!gameState) return;
        
        // Ensure container exists - try to find it again if it wasn't found during init
        if (!this.container) {
            this.container = document.getElementById('metrics-panel');
            if (!this.container) {
                console.warn('MetricsPanel: container not found, skipping update');
                return;
            }
        }
        
        // Always ensure the panel is rendered (in case it was cleared or not initialized)
        const hasContent = this.container.querySelector('.metrics-panel');
        if (!hasContent) {
            console.log('MetricsPanel: Rendering panel (content missing)');
            this.render();
            // After rendering, check again to make sure it worked
            if (!this.container.querySelector('.metrics-panel')) {
                console.error('MetricsPanel: Render failed, panel still missing');
                return;
            }
        }

        this.gameState = gameState;

        // Calculate total probes
        const totalProbes = Object.values(gameState.probes || {}).reduce((sum, count) => sum + (count || 0), 0);
        const totalProbesEl = document.getElementById('metric-total-probes');
        if (totalProbesEl) {
            totalProbesEl.textContent = this.formatNumber(totalProbes);
        }

        // Probe production rate (always show 2 decimal places)
        const probeRate = gameState.probe_production_rate !== undefined 
            ? gameState.probe_production_rate 
            : (this.previousState ? (totalProbes - (this.previousState.totalProbes || 0)) / (1.0 / 60.0) : 0);
        const probeRateEl = document.getElementById('metric-probe-rate');
        if (probeRateEl) {
            probeRateEl.textContent = `${probeRate.toFixed(2)} /s`;
        }

        // Dexterity breakdown by activity
        const allocations = gameState.probe_allocations || {};
        const breakdown = gameState.resource_breakdowns?.dexterity;
        
        // Get research multiplier
        const roboticBonus = breakdown?.probes?.upgrades?.find(u => u.name === 'Robotic Systems')?.bonus || 0;
        const totalMultiplier = 1.0 + (roboticBonus || 0);
        
        // Dyson dexterity
        const dysonProbes = (allocations.dyson?.probe || 0) + (allocations.dyson?.construction_probe || 0);
        const dysonDexterity = this.calculateDexterityForProbes(
            (allocations.dyson?.probe || 0), 1.0, totalMultiplier
        ) + this.calculateDexterityForProbes(
            (allocations.dyson?.construction_probe || 0), 1.8, totalMultiplier
        );
        const dysonRateEl = document.getElementById('metric-dex-dyson-rate');
        const dysonCountEl = document.getElementById('metric-dex-dyson-count');
        if (dysonRateEl) dysonRateEl.textContent = `${this.formatNumber(dysonDexterity)} kg/s`;
        if (dysonCountEl) dysonCountEl.textContent = `(${this.formatNumberWithCommas(dysonProbes)} probes)`;

        // Mining dexterity
        const miningProbes = (allocations.harvest?.probe || 0) + (allocations.harvest?.miner_probe || 0);
        const miningDexterity = this.calculateDexterityForProbes(
            (allocations.harvest?.probe || 0), 1.0, totalMultiplier
        ) + this.calculateDexterityForProbes(
            (allocations.harvest?.miner_probe || 0), 1.5, totalMultiplier
        );
        const miningRateEl = document.getElementById('metric-dex-mining-rate');
        const miningCountEl = document.getElementById('metric-dex-mining-count');
        if (miningRateEl) miningRateEl.textContent = `${this.formatNumber(miningDexterity)} kg/s`;
        if (miningCountEl) miningCountEl.textContent = `(${this.formatNumberWithCommas(miningProbes)} probes)`;

        // Probe construction dexterity
        const probeConstructProbes = (allocations.construct?.probe || 0) + (allocations.construct?.construction_probe || 0);
        const probeConstructDexterity = this.calculateDexterityForProbes(
            (allocations.construct?.probe || 0), 1.0, totalMultiplier
        ) + this.calculateDexterityForProbes(
            (allocations.construct?.construction_probe || 0), 1.8, totalMultiplier
        );
        const probeRateEl = document.getElementById('metric-dex-probes-rate');
        const probeCountEl = document.getElementById('metric-dex-probes-count');
        if (probeRateEl) probeRateEl.textContent = `${this.formatNumber(probeConstructDexterity)} kg/s`;
        if (probeCountEl) probeCountEl.textContent = `(${this.formatNumberWithCommas(probeConstructProbes)} probes)`;

        // Structure construction dexterity (from factory production)
        const factoryProduction = gameState.factory_production || {};
        let structureProbes = 0;
        let structureDexterity = 0;
        // Structure construction uses probe allocation for structures
        // This is simplified - actual structure construction might use different mechanics
        const structureRateEl = document.getElementById('metric-dex-structures-rate');
        const structureCountEl = document.getElementById('metric-dex-structures-count');
        if (structureRateEl) structureRateEl.textContent = `${this.formatNumber(structureDexterity)} kg/s`;
        if (structureCountEl) structureCountEl.textContent = `(${this.formatNumberWithCommas(structureProbes)} probes)`;

        // Probe base rate multipliers
        const multipliersEl = document.getElementById('metric-multipliers');
        if (multipliersEl) {
            let multipliersHtml = '';
            const multipliers = [];
            
            if (roboticBonus > 0) {
                multipliers.push(`Robotic Systems: ${((1.0 + roboticBonus) * 100).toFixed(1)}%`);
            }
            
            // Check for computer systems processing bonuses
            if (breakdown?.probes?.upgrades) {
                breakdown.probes.upgrades.forEach(upgrade => {
                    if (upgrade.name !== 'Robotic Systems' && upgrade.bonus > 0) {
                        multipliers.push(`${upgrade.name}: ${((1.0 + upgrade.bonus) * 100).toFixed(1)}%`);
                    }
                });
            }
            
            if (multipliers.length === 0) {
                multipliersHtml = '<div class="metric-breakdown-item">None</div>';
            } else {
                multipliers.forEach(mult => {
                    multipliersHtml += `<div class="metric-breakdown-item">${mult}</div>`;
                });
            }
            multipliersEl.innerHTML = multipliersHtml;
        }

        // Store current state for next rate calculation
        this.previousState = {
            totalProbes: totalProbes,
            metal: gameState.metal || 0,
            energy: gameState.energy || 0,
            intelligence: gameState.intelligence || 0,
            dyson_sphere_mass: gameState.dyson_sphere_mass || 0
        };
    }
}

