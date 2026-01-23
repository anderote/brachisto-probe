/**
 * Summary Plot Panel - Displays cumulative statistics over time
 * Shows metal spent, energy spent, FLOPS spent, and probes built vs time
 */
class SummaryPlotPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.visible = false;
        this.canvas = null;
        this.ctx = null;
        this.gameState = null;
        
        // Chart configuration
        this.chartColors = {
            metal: '#ff9944',      // Orange for metal
            energy: '#ffdd44',     // Yellow for energy
            flops: '#44aaff',      // Blue for FLOPS/intelligence
            probes: '#88ff88'      // Green for probes
        };
        
        // Which series are currently enabled
        this.seriesEnabled = {
            metal: true,
            energy: true,
            flops: true,
            probes: true
        };
        
        if (this.container) {
            this.init();
        }
    }
    
    init() {
        this.render();
        this.setupEventListeners();
    }
    
    render() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="summary-plot-panel" style="display: none;">
                <div class="summary-plot-header">
                    <h3>Cumulative Statistics</h3>
                    <button class="summary-plot-close">&times;</button>
                </div>
                <div class="summary-plot-controls">
                    <label class="series-toggle" style="color: ${this.chartColors.metal}">
                        <input type="checkbox" data-series="metal" checked> Metal Spent
                    </label>
                    <label class="series-toggle" style="color: ${this.chartColors.energy}">
                        <input type="checkbox" data-series="energy" checked> Energy Spent
                    </label>
                    <label class="series-toggle" style="color: ${this.chartColors.flops}">
                        <input type="checkbox" data-series="flops" checked> FLOPS Spent
                    </label>
                    <label class="series-toggle" style="color: ${this.chartColors.probes}">
                        <input type="checkbox" data-series="probes" checked> Probes Built
                    </label>
                </div>
                <div class="summary-plot-canvas-container">
                    <canvas id="summary-plot-canvas" width="600" height="350"></canvas>
                </div>
                <div class="summary-plot-legend" id="summary-plot-legend"></div>
            </div>
        `;
        
        this.canvas = document.getElementById('summary-plot-canvas');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
        }
    }
    
    setupEventListeners() {
        // Close button
        const closeBtn = this.container.querySelector('.summary-plot-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }
        
        // Series toggles
        const toggles = this.container.querySelectorAll('.series-toggle input');
        toggles.forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const series = e.target.dataset.series;
                this.seriesEnabled[series] = e.target.checked;
                this.drawChart();
            });
        });
        
        // Keyboard shortcut (G key to toggle - G for Graph)
        document.addEventListener('keydown', (e) => {
            const activeElement = document.activeElement;
            const isInputFocused = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';

            if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey && !isInputFocused) {
                this.toggle();
            }
        });
    }
    
    show() {
        const panel = this.container.querySelector('.summary-plot-panel');
        if (panel) {
            panel.style.display = 'block';
            this.visible = true;
            this.drawChart();
        }
    }
    
    hide() {
        const panel = this.container.querySelector('.summary-plot-panel');
        if (panel) {
            panel.style.display = 'none';
            this.visible = false;
        }
    }
    
    toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }
    
    update(gameState) {
        this.gameState = gameState;
        
        // Only redraw if visible
        if (this.visible) {
            this.drawChart();
            this.updateLegend();
        }
    }
    
    drawChart() {
        if (!this.ctx || !this.canvas || !this.gameState) return;

        const history = this.gameState.stats_history || [];
        if (history.length < 2) {
            this.drawEmptyState();
            return;
        }

        const width = this.canvas.width;
        const height = this.canvas.height;
        const ctx = this.ctx;

        // Clear canvas
        ctx.fillStyle = 'rgba(10, 10, 15, 0.95)';
        ctx.fillRect(0, 0, width, height);

        // Chart area padding - extra space on right for Y-axis labels
        const padding = { top: 40, right: 100, bottom: 50, left: 80 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        // Find data ranges
        const timeMin = history[0].time;
        const timeMax = history[history.length - 1].time;
        const timeRange = timeMax - timeMin || 1;

        // Calculate max values for each series (for independent Y-axes)
        const maxValues = {
            metal: 1,
            energy: 1,
            flops: 1,
            probes: 1
        };

        for (const point of history) {
            maxValues.metal = Math.max(maxValues.metal, point.metal_spent || 1);
            maxValues.energy = Math.max(maxValues.energy, point.energy_spent || 1);
            maxValues.flops = Math.max(maxValues.flops, point.flops_spent || 1);
            maxValues.probes = Math.max(maxValues.probes, point.probes_built || 1);
        }

        // Draw grid (log scale)
        this.drawLogGrid(ctx, padding, chartWidth, chartHeight, timeMin, timeMax);

        // Draw each series with its own scale (log scale, normalized 0-1)
        const series = [
            { key: 'metal', field: 'metal_spent', color: this.chartColors.metal, max: maxValues.metal },
            { key: 'energy', field: 'energy_spent', color: this.chartColors.energy, max: maxValues.energy },
            { key: 'flops', field: 'flops_spent', color: this.chartColors.flops, max: maxValues.flops },
            { key: 'probes', field: 'probes_built', color: this.chartColors.probes, max: maxValues.probes }
        ];

        for (const s of series) {
            if (this.seriesEnabled[s.key]) {
                this.drawLogSeries(ctx, history, s.field, s.color, padding, chartWidth, chartHeight, timeMin, timeRange, s.max);
            }
        }

        // Draw Y-axis labels for enabled series (on right side)
        this.drawMultiAxisLabels(ctx, padding, chartWidth, chartHeight, maxValues);

        // Draw title
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Cumulative Statistics (Log Scale)', width / 2, 20);
    }
    
    drawEmptyState() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        ctx.fillStyle = 'rgba(10, 10, 15, 0.95)';
        ctx.fillRect(0, 0, width, height);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '14px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Collecting data... (need at least 2 data points)', width / 2, height / 2);
    }
    
    drawLogGrid(ctx, padding, chartWidth, chartHeight, timeMin, timeMax) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;

        // Horizontal grid lines - log scale divisions (0%, 25%, 50%, 75%, 100% of log range)
        const ySteps = 4;
        for (let i = 0; i <= ySteps; i++) {
            const y = padding.top + (chartHeight * i / ySteps);
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartWidth, y);
            ctx.stroke();

            // Left axis label (percentage of range)
            const pct = 100 - (i * 100 / ySteps);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '9px "Courier New", monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`${pct}%`, padding.left - 10, y + 4);
        }

        // Vertical grid lines (time axis, 5 lines)
        const xSteps = 5;
        const timeRange = timeMax - timeMin;
        for (let i = 0; i <= xSteps; i++) {
            const x = padding.left + (chartWidth * i / xSteps);
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, padding.top + chartHeight);
            ctx.stroke();

            // X-axis labels (time in days)
            const time = timeMin + (timeRange * i / xSteps);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = '10px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(this.formatTime(time), x, padding.top + chartHeight + 20);
        }

        // Axis labels
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '11px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Time (days)', padding.left + chartWidth / 2, padding.top + chartHeight + 40);

        // Left Y-axis label (rotated)
        ctx.save();
        ctx.translate(15, padding.top + chartHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Log Scale (% of max)', 0, 0);
        ctx.restore();
    }

    drawLogSeries(ctx, history, field, color, padding, chartWidth, chartHeight, timeMin, timeRange, maxValue) {
        if (history.length < 2 || maxValue <= 1) return;

        // Use log scale: map value to 0-1 range using log
        const logMax = Math.log10(maxValue);
        const logMin = 0; // log10(1) = 0

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        let started = false;
        for (const point of history) {
            const x = padding.left + ((point.time - timeMin) / timeRange) * chartWidth;
            const value = Math.max(1, point[field] || 1); // Minimum 1 to avoid log(0)
            const logValue = Math.log10(value);
            const normalizedY = logMax > logMin ? (logValue - logMin) / (logMax - logMin) : 0;
            const y = padding.top + chartHeight - (normalizedY * chartHeight);

            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();

        // Draw subtle fill (semi-transparent)
        const lastPoint = history[history.length - 1];
        const lastX = padding.left + ((lastPoint.time - timeMin) / timeRange) * chartWidth;
        ctx.lineTo(lastX, padding.top + chartHeight);
        ctx.lineTo(padding.left, padding.top + chartHeight);
        ctx.closePath();
        ctx.fillStyle = color + '15'; // 15 = ~8% opacity in hex
        ctx.fill();
    }

    drawMultiAxisLabels(ctx, padding, chartWidth, chartHeight, maxValues) {
        // Draw max value labels on the right side for each enabled series
        const enabledSeries = [];
        if (this.seriesEnabled.metal) enabledSeries.push({ key: 'metal', color: this.chartColors.metal, max: maxValues.metal, label: 'Metal' });
        if (this.seriesEnabled.energy) enabledSeries.push({ key: 'energy', color: this.chartColors.energy, max: maxValues.energy, label: 'Energy' });
        if (this.seriesEnabled.flops) enabledSeries.push({ key: 'flops', color: this.chartColors.flops, max: maxValues.flops, label: 'FLOPS' });
        if (this.seriesEnabled.probes) enabledSeries.push({ key: 'probes', color: this.chartColors.probes, max: maxValues.probes, label: 'Probes' });

        const rightX = padding.left + chartWidth + 10;
        const spacing = chartHeight / Math.max(enabledSeries.length, 1);

        enabledSeries.forEach((series, index) => {
            const y = padding.top + spacing * (index + 0.5);

            // Draw colored indicator
            ctx.fillStyle = series.color;
            ctx.fillRect(rightX, y - 4, 8, 8);

            // Draw label and max value
            ctx.fillStyle = series.color;
            ctx.font = '9px "Courier New", monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`${series.label}`, rightX + 12, y);
            ctx.fillText(`max: ${this.formatNumber(series.max)}`, rightX + 12, y + 10);
        });
    }
    
    updateLegend() {
        const legend = document.getElementById('summary-plot-legend');
        if (!legend || !this.gameState) return;
        
        const stats = this.gameState.cumulative_stats || {};
        
        legend.innerHTML = `
            <div class="legend-item" style="color: ${this.chartColors.metal}">
                <span class="legend-color" style="background: ${this.chartColors.metal}"></span>
                Metal Spent: ${this.formatNumber(stats.metal_spent || 0)} kg
            </div>
            <div class="legend-item" style="color: ${this.chartColors.energy}">
                <span class="legend-color" style="background: ${this.chartColors.energy}"></span>
                Energy Spent: ${this.formatNumber(stats.energy_spent || 0)} J
            </div>
            <div class="legend-item" style="color: ${this.chartColors.flops}">
                <span class="legend-color" style="background: ${this.chartColors.flops}"></span>
                FLOPS Spent: ${this.formatNumber(stats.flops_spent || 0)}
            </div>
            <div class="legend-item" style="color: ${this.chartColors.probes}">
                <span class="legend-color" style="background: ${this.chartColors.probes}"></span>
                Probes Built: ${this.formatNumber(stats.probes_built || 0)}
            </div>
        `;
    }
    
    formatNumber(value) {
        if (value === 0) return '0';
        if (value >= 1e24) return (value / 1e24).toFixed(2) + 'Y';
        if (value >= 1e21) return (value / 1e21).toFixed(2) + 'Z';
        if (value >= 1e18) return (value / 1e18).toFixed(2) + 'E';
        if (value >= 1e15) return (value / 1e15).toFixed(2) + 'P';
        if (value >= 1e12) return (value / 1e12).toFixed(2) + 'T';
        if (value >= 1e9) return (value / 1e9).toFixed(2) + 'G';
        if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
        if (value >= 1e3) return (value / 1e3).toFixed(2) + 'k';
        return value.toFixed(2);
    }
    
    formatTime(days) {
        if (days < 1) {
            return (days * 24).toFixed(1) + 'h';
        } else if (days < 365) {
            return days.toFixed(1) + 'd';
        } else {
            return (days / 365).toFixed(2) + 'y';
        }
    }
}

