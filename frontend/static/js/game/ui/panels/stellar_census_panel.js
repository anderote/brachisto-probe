/**
 * Stellar Census Panel
 *
 * EVA-styled panel showing galactic statistics:
 * - Stars by spectral type (O, B, A, F, G, K, M)
 * - Colonization progress per type
 * - Dyson sphere completion stats
 * - Total empire statistics
 */

class StellarCensusPanel {
    constructor(container) {
        this.container = container;

        // Spectral type data
        this.spectralTypes = [
            { type: 'O', name: 'Blue Giant', color: '#9bb0ff', tempRange: '30,000-50,000K' },
            { type: 'B', name: 'Blue', color: '#aabfff', tempRange: '10,000-30,000K' },
            { type: 'A', name: 'White', color: '#cad7ff', tempRange: '7,500-10,000K' },
            { type: 'F', name: 'Yellow-White', color: '#f8f7ff', tempRange: '6,000-7,500K' },
            { type: 'G', name: 'Yellow (Sun-like)', color: '#fff4ea', tempRange: '5,200-6,000K' },
            { type: 'K', name: 'Orange', color: '#ffd2a1', tempRange: '3,700-5,200K' },
            { type: 'M', name: 'Red Dwarf', color: '#ffcc6f', tempRange: '2,400-3,700K' }
        ];

        // Default census data (will be updated)
        this.censusData = {
            O: { total: 3, colonized: 0, dyson: 0 },
            B: { total: 45, colonized: 0, dyson: 0 },
            A: { total: 312, colonized: 0, dyson: 0 },
            F: { total: 1240, colonized: 0, dyson: 0 },
            G: { total: 3400, colonized: 1, dyson: 1 },  // Sol is G-type with Dyson
            K: { total: 5100, colonized: 0, dyson: 0 },
            M: { total: 32000, colonized: 0, dyson: 0 }
        };

        // Accurate stellar data for H-R diagram (main sequence stars)
        this.stellarData = {
            O: { temp: 40000, luminosity: 100000, color: '#9bb0ff' },
            B: { temp: 20000, luminosity: 1000, color: '#aabfff' },
            A: { temp: 8500, luminosity: 20, color: '#cad7ff' },
            F: { temp: 6500, luminosity: 3, color: '#f8f7ff' },
            G: { temp: 5500, luminosity: 1, color: '#fff4ea' },
            K: { temp: 4500, luminosity: 0.3, color: '#ffd2a1' },
            M: { temp: 3000, luminosity: 0.01, color: '#ffcc6f' }
        };

        this.totalStats = {
            totalSystems: 42100,
            colonizedSystems: 1,
            dysonSpheres: 1,
            totalPower: 3.8e26,  // One sun's worth
            totalProbes: 1e15,
            computeRate: 1e12
        };

        this.init();
    }

    init() {
        this.render();
    }

    render() {
        const totalColonized = Object.values(this.censusData).reduce((sum, d) => sum + d.colonized, 0);
        const totalDyson = Object.values(this.censusData).reduce((sum, d) => sum + d.dyson, 0);
        const colonizationPercent = (totalColonized / this.totalStats.totalSystems * 100);

        this.container.innerHTML = `
            <div class="eva-panel eva-bracket eva-strategy-panel" id="stellar-census-panel">
                <div class="eva-header">
                    <span class="eva-header-title">STELLAR CENSUS</span>
                    <div class="eva-header-status">
                        <span class="eva-timestamp">${this.formatNumber(totalColonized)} / ${this.formatNumber(this.totalStats.totalSystems)}</span>
                    </div>
                </div>

                <!-- Empire Overview -->
                <div class="eva-grid eva-grid-4" style="margin-bottom: 15px;">
                    <div class="eva-stat-card">
                        <div class="eva-stat-value">${this.formatNumber(totalColonized)}</div>
                        <div class="eva-stat-label">Systems</div>
                    </div>
                    <div class="eva-stat-card">
                        <div class="eva-stat-value">${totalDyson}</div>
                        <div class="eva-stat-label">Dysons</div>
                    </div>
                    <div class="eva-stat-card">
                        <div class="eva-stat-value">${this.formatPower(this.totalStats.totalPower)}</div>
                        <div class="eva-stat-label">Power</div>
                    </div>
                    <div class="eva-stat-card">
                        <div class="eva-stat-value">${colonizationPercent.toFixed(2)}%</div>
                        <div class="eva-stat-label">Galaxy</div>
                    </div>
                </div>

                <!-- Colonization Progress Bar -->
                <div class="eva-section">
                    <span class="eva-section-label">GALACTIC COLONIZATION</span>
                    <div class="eva-progress-blocks" style="margin-bottom: 10px;">
                        ${this.renderProgressBlocks(colonizationPercent)}
                    </div>
                    <div class="eva-readout">
                        <span class="eva-label">Progress</span>
                        <span class="eva-value">${colonizationPercent.toFixed(3)}%</span>
                        <span class="eva-unit">of known galaxy</span>
                    </div>
                </div>

                <!-- Spectral Type Breakdown -->
                <div class="eva-section">
                    <span class="eva-section-label">BY SPECTRAL TYPE</span>
                    ${this.renderSpectralList()}
                </div>

                <!-- H-R Diagram Mini -->
                <div class="eva-section">
                    <span class="eva-section-label">HERTZSPRUNG-RUSSELL</span>
                    <div class="eva-chart" style="height: 150px; position: relative;">
                        <canvas id="hr-diagram-canvas" width="340" height="130"></canvas>
                    </div>
                </div>

                <!-- Dyson Sphere Stats -->
                <div class="eva-section">
                    <span class="eva-section-label">DYSON SPHERE DISTRIBUTION</span>
                    ${this.renderDysonStats()}
                </div>

                <!-- Empire Resources -->
                <div class="eva-section">
                    <span class="eva-section-label">EMPIRE RESOURCES</span>
                    <div class="eva-readout">
                        <span class="eva-label">Total Probes</span>
                        <span class="eva-value">${this.formatNumber(this.totalStats.totalProbes)}</span>
                    </div>
                    <div class="eva-readout">
                        <span class="eva-label">Compute Rate</span>
                        <span class="eva-value">${this.formatNumber(this.totalStats.computeRate)}</span>
                        <span class="eva-unit">/year</span>
                    </div>
                    <div class="eva-readout">
                        <span class="eva-label">Total Power</span>
                        <span class="eva-value">${this.formatPower(this.totalStats.totalPower)}</span>
                    </div>
                </div>
            </div>
        `;

        this.drawHRDiagram();
    }

    renderProgressBlocks(percent) {
        const totalBlocks = 20;
        const filledBlocks = Math.floor((percent / 100) * totalBlocks);

        let html = '';
        for (let i = 0; i < totalBlocks; i++) {
            const filled = i < filledBlocks ? 'filled' : '';
            html += `<div class="eva-progress-block ${filled}"></div>`;
        }
        return html;
    }

    renderSpectralList() {
        return this.spectralTypes.map(spec => {
            const data = this.censusData[spec.type];
            const colonizedPercent = data.total > 0 ? (data.colonized / data.total * 100) : 0;

            return `
                <div class="census-row">
                    <div class="census-type ${spec.type}" style="background: ${spec.color};">${spec.type}</div>
                    <div class="census-info">
                        <div class="census-name">${spec.name}</div>
                        <div class="census-count">${this.formatNumber(data.colonized)} / ${this.formatNumber(data.total)}</div>
                    </div>
                    <div class="census-bar">
                        <div class="census-bar-fill" style="width: ${colonizedPercent}%; background: ${spec.color};"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderDysonStats() {
        const dysonTypes = this.spectralTypes.filter(spec => this.censusData[spec.type].dyson > 0);

        if (dysonTypes.length === 0) {
            return `
                <div class="eva-alert">
                    <span class="eva-alert-icon">○</span>
                    <span class="eva-alert-text">No Dyson spheres completed yet</span>
                </div>
            `;
        }

        return `
            <div class="eva-grid eva-grid-3">
                ${dysonTypes.map(spec => `
                    <div class="eva-stat-card" style="border-left: 3px solid ${spec.color};">
                        <div class="eva-stat-value" style="color: ${spec.color};">${this.censusData[spec.type].dyson}</div>
                        <div class="eva-stat-label">${spec.type}-type</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Convert temperature and luminosity to plot coordinates using log scales
    toPlotCoords(temp, lum, plotWidth, plotHeight, padding) {
        // Temperature range: 2500K to 50000K (log scale, inverted - hot on left)
        const logTempMin = Math.log10(2500);   // ~3.4
        const logTempMax = Math.log10(50000);  // ~4.7
        const logTemp = Math.log10(temp);
        const x = padding.left + (1 - (logTemp - logTempMin) / (logTempMax - logTempMin)) * plotWidth;

        // Luminosity range: 0.0001 to 1000000 L☉ (log scale)
        const logLumMin = Math.log10(0.0001);  // -4
        const logLumMax = Math.log10(1000000); // 6
        const logLum = Math.log10(Math.max(lum, 0.0001));
        const y = padding.top + (1 - (logLum - logLumMin) / (logLumMax - logLumMin)) * plotHeight;

        return { x, y };
    }

    drawHRDiagram() {
        const canvas = document.getElementById('hr-diagram-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const padding = { top: 15, right: 15, bottom: 25, left: 40 };
        const plotWidth = width - padding.left - padding.right;
        const plotHeight = height - padding.top - padding.bottom;

        // Clear
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, width, height);

        // Draw grid lines
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 0.5;

        // Horizontal grid (luminosity)
        const lumGridValues = [0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000, 100000];
        lumGridValues.forEach(lum => {
            const pos = this.toPlotCoords(10000, lum, plotWidth, plotHeight, padding);
            if (pos.y >= padding.top && pos.y <= height - padding.bottom) {
                ctx.beginPath();
                ctx.moveTo(padding.left, pos.y);
                ctx.lineTo(width - padding.right, pos.y);
                ctx.stroke();
            }
        });

        // Vertical grid (temperature)
        const tempGridValues = [3000, 5000, 7000, 10000, 20000, 40000];
        tempGridValues.forEach(temp => {
            const pos = this.toPlotCoords(temp, 1, plotWidth, plotHeight, padding);
            if (pos.x >= padding.left && pos.x <= width - padding.right) {
                ctx.beginPath();
                ctx.moveTo(pos.x, padding.top);
                ctx.lineTo(pos.x, height - padding.bottom);
                ctx.stroke();
            }
        });

        // Draw main sequence band (curved, from O to M)
        // Main sequence follows approximately L ∝ M^3.5 and T ∝ M^0.5
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.beginPath();

        // Upper edge of main sequence band
        const msPoints = [];
        for (let temp = 45000; temp >= 2800; temp -= 500) {
            // Approximate main sequence luminosity for temperature
            // L/L☉ ≈ (T/5778)^4 * (R/R☉)^2, with R roughly scaling with T
            const tRatio = temp / 5778;
            const lum = Math.pow(tRatio, 5.5) * 1.5;  // Upper bound
            const pos = this.toPlotCoords(temp, lum, plotWidth, plotHeight, padding);
            msPoints.push(pos);
        }

        ctx.moveTo(msPoints[0].x, msPoints[0].y);
        for (let i = 1; i < msPoints.length; i++) {
            ctx.lineTo(msPoints[i].x, msPoints[i].y);
        }

        // Lower edge of main sequence band (return path)
        for (let temp = 2800; temp <= 45000; temp += 500) {
            const tRatio = temp / 5778;
            const lum = Math.pow(tRatio, 5.5) * 0.5;  // Lower bound
            const pos = this.toPlotCoords(temp, lum, plotWidth, plotHeight, padding);
            ctx.lineTo(pos.x, pos.y);
        }

        ctx.closePath();

        // Gradient fill for main sequence
        const gradient = ctx.createLinearGradient(padding.left, 0, width - padding.right, 0);
        gradient.addColorStop(0, '#9bb0ff');
        gradient.addColorStop(0.3, '#cad7ff');
        gradient.addColorStop(0.5, '#fff4ea');
        gradient.addColorStop(0.7, '#ffd2a1');
        gradient.addColorStop(1, '#ffcc6f');
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.restore();

        // Draw main sequence center line
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        let firstPoint = true;
        for (let temp = 45000; temp >= 2800; temp -= 1000) {
            const tRatio = temp / 5778;
            const lum = Math.pow(tRatio, 5.5);  // Center of main sequence
            const pos = this.toPlotCoords(temp, lum, plotWidth, plotHeight, padding);
            if (firstPoint) {
                ctx.moveTo(pos.x, pos.y);
                firstPoint = false;
            } else {
                ctx.lineTo(pos.x, pos.y);
            }
        }
        ctx.stroke();

        // Plot stars by spectral type using accurate positions
        this.spectralTypes.forEach(spec => {
            const stellar = this.stellarData[spec.type];
            const data = this.censusData[spec.type];
            const pos = this.toPlotCoords(stellar.temp, stellar.luminosity, plotWidth, plotHeight, padding);

            // Size based on number of stars (log scale)
            const baseRadius = 3 + Math.log10(Math.max(data.total, 1)) * 1.5;

            // Uncolonized stars (dimmer halo)
            ctx.fillStyle = stellar.color + '30';
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, baseRadius + 4, 0, Math.PI * 2);
            ctx.fill();

            // Star point
            ctx.fillStyle = stellar.color;
            ctx.shadowColor = stellar.color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, baseRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Colonized indicator (bright core)
            if (data.colonized > 0) {
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
                ctx.fill();
            }

            // Dyson indicators (green ring)
            if (data.dyson > 0) {
                ctx.strokeStyle = '#00ff66';
                ctx.lineWidth = 2;
                ctx.shadowColor = '#00ff66';
                ctx.shadowBlur = 5;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, baseRadius + 6, 0, Math.PI * 2);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        });

        // Axis labels
        ctx.font = '8px JetBrains Mono, monospace';
        ctx.textAlign = 'center';

        // Temperature labels (bottom) - spectral types
        ['O', 'B', 'A', 'F', 'G', 'K', 'M'].forEach(type => {
            const stellar = this.stellarData[type];
            const pos = this.toPlotCoords(stellar.temp, stellar.luminosity, plotWidth, plotHeight, padding);
            ctx.fillStyle = stellar.color;
            ctx.fillText(type, pos.x, height - 5);
        });

        // Temperature scale (bottom)
        ctx.fillStyle = '#444444';
        ctx.font = '7px JetBrains Mono, monospace';
        [40000, 10000, 5000, 3000].forEach(temp => {
            const pos = this.toPlotCoords(temp, 1, plotWidth, plotHeight, padding);
            const label = temp >= 10000 ? `${temp/1000}k` : `${temp}`;
            ctx.fillText(label, pos.x, height - 15);
        });

        // Luminosity labels (left)
        ctx.textAlign = 'right';
        ctx.fillStyle = '#444444';
        [100000, 1000, 10, 1, 0.01, 0.0001].forEach(lum => {
            const pos = this.toPlotCoords(10000, lum, plotWidth, plotHeight, padding);
            if (pos.y >= padding.top + 5 && pos.y <= height - padding.bottom - 5) {
                let label;
                if (lum >= 1000) label = `${lum/1000}k`;
                else if (lum >= 1) label = `${lum}`;
                else if (lum >= 0.01) label = lum.toFixed(2);
                else label = lum.toExponential(0);
                ctx.fillText(label, padding.left - 3, pos.y + 3);
            }
        });

        // Axis titles
        ctx.fillStyle = '#555555';
        ctx.font = '8px JetBrains Mono, monospace';

        // Y-axis label
        ctx.save();
        ctx.translate(8, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText('L/L☉', 0, 0);
        ctx.restore();

        // X-axis label
        ctx.textAlign = 'center';
        ctx.fillText('← Hot    Temperature (K)    Cool →', width / 2, height - 15);

        // Legend
        ctx.textAlign = 'left';
        ctx.font = '7px JetBrains Mono, monospace';
        ctx.fillStyle = '#00ff66';
        ctx.fillText('○ Dyson', width - 45, padding.top + 8);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('● Colonized', width - 45, padding.top + 18);
    }

    formatNumber(num) {
        if (num === undefined || num === null) return '0';
        if (num >= 1e18) return `${(num / 1e18).toFixed(1)}E`;
        if (num >= 1e15) return `${(num / 1e15).toFixed(1)}P`;
        if (num >= 1e12) return `${(num / 1e12).toFixed(1)}T`;
        if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
        if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
        if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
        return num.toFixed(0);
    }

    formatPower(watts) {
        if (watts >= 1e36) return `${(watts / 1e36).toFixed(1)}×10³⁶ W`;
        if (watts >= 1e33) return `${(watts / 1e33).toFixed(1)}×10³³ W`;
        if (watts >= 1e30) return `${(watts / 1e30).toFixed(1)}×10³⁰ W`;
        if (watts >= 1e27) return `${(watts / 1e27).toFixed(1)}×10²⁷ W`;
        if (watts >= 1e26) return `${(watts / 1e26).toFixed(1)} L☉`;  // Solar luminosity
        if (watts >= 1e24) return `${(watts / 1e24).toFixed(1)}×10²⁴ W`;
        return `${watts.toExponential(1)} W`;
    }

    // Public API
    update(state) {
        if (state.censusData) this.censusData = state.censusData;
        if (state.totalStats) this.totalStats = { ...this.totalStats, ...state.totalStats };
        this.render();
    }

    // Update colonization for a specific star type
    colonizeStar(spectralType) {
        if (this.censusData[spectralType]) {
            this.censusData[spectralType].colonized++;
            this.totalStats.colonizedSystems++;
            this.render();
        }
    }

    // Mark Dyson complete for a star
    completeDyson(spectralType) {
        if (this.censusData[spectralType]) {
            this.censusData[spectralType].dyson++;
            this.totalStats.dysonSpheres++;
            this.render();
        }
    }

    show() {
        this.container.style.display = 'block';
    }

    hide() {
        this.container.style.display = 'none';
    }

    toggle() {
        if (this.container.style.display === 'none') {
            this.show();
        } else {
            this.hide();
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StellarCensusPanel;
}

if (typeof window !== 'undefined') {
    window.StellarCensusPanel = StellarCensusPanel;
}
