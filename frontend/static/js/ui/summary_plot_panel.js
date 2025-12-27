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
        
        // Keyboard shortcut (H key to toggle)
        document.addEventListener('keydown', (e) => {
            const activeElement = document.activeElement;
            const isInputFocused = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';
            
            if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey && !isInputFocused) {
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
        
        // Chart area padding
        const padding = { top: 40, right: 20, bottom: 50, left: 80 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        // Find data ranges
        const timeMin = history[0].time;
        const timeMax = history[history.length - 1].time;
        const timeRange = timeMax - timeMin || 1;
        
        // Calculate max values for each series
        const maxValues = {
            metal: 0,
            energy: 0,
            flops: 0,
            probes: 0
        };
        
        for (const point of history) {
            maxValues.metal = Math.max(maxValues.metal, point.metal_spent || 0);
            maxValues.energy = Math.max(maxValues.energy, point.energy_spent || 0);
            maxValues.flops = Math.max(maxValues.flops, point.flops_spent || 0);
            maxValues.probes = Math.max(maxValues.probes, point.probes_built || 0);
        }
        
        // Find overall max for normalization (only for enabled series)
        let overallMax = 0;
        if (this.seriesEnabled.metal) overallMax = Math.max(overallMax, maxValues.metal);
        if (this.seriesEnabled.energy) overallMax = Math.max(overallMax, maxValues.energy);
        if (this.seriesEnabled.flops) overallMax = Math.max(overallMax, maxValues.flops);
        if (this.seriesEnabled.probes) overallMax = Math.max(overallMax, maxValues.probes);
        
        if (overallMax === 0) overallMax = 1;
        
        // Draw grid
        this.drawGrid(ctx, padding, chartWidth, chartHeight, timeMin, timeMax, overallMax);
        
        // Draw each series
        const series = [
            { key: 'metal', field: 'metal_spent', color: this.chartColors.metal },
            { key: 'energy', field: 'energy_spent', color: this.chartColors.energy },
            { key: 'flops', field: 'flops_spent', color: this.chartColors.flops },
            { key: 'probes', field: 'probes_built', color: this.chartColors.probes }
        ];
        
        for (const s of series) {
            if (this.seriesEnabled[s.key]) {
                this.drawSeries(ctx, history, s.field, s.color, padding, chartWidth, chartHeight, timeMin, timeRange, overallMax);
            }
        }
        
        // Draw title
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Cumulative Statistics Over Time', width / 2, 20);
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
    
    drawGrid(ctx, padding, chartWidth, chartHeight, timeMin, timeMax, maxValue) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        
        // Horizontal grid lines (5 lines)
        const ySteps = 5;
        for (let i = 0; i <= ySteps; i++) {
            const y = padding.top + (chartHeight * i / ySteps);
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartWidth, y);
            ctx.stroke();
            
            // Y-axis labels
            const value = maxValue * (1 - i / ySteps);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = '10px "Courier New", monospace';
            ctx.textAlign = 'right';
            ctx.fillText(this.formatNumber(value), padding.left - 10, y + 4);
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
        
        // Y-axis label (rotated)
        ctx.save();
        ctx.translate(15, padding.top + chartHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Value (normalized)', 0, 0);
        ctx.restore();
    }
    
    drawSeries(ctx, history, field, color, padding, chartWidth, chartHeight, timeMin, timeRange, maxValue) {
        if (history.length < 2) return;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        let started = false;
        for (const point of history) {
            const x = padding.left + ((point.time - timeMin) / timeRange) * chartWidth;
            const value = point[field] || 0;
            const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
            
            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // Draw fill (semi-transparent)
        ctx.fillStyle = color.replace(')', ', 0.1)').replace('rgb', 'rgba');
        ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
        ctx.lineTo(padding.left, padding.top + chartHeight);
        ctx.closePath();
        ctx.fill();
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

