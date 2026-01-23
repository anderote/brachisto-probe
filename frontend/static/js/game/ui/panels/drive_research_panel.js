/**
 * Drive Research Panel
 *
 * EVA-styled panel for starship drive research with:
 * - Current drive tier display
 * - Research progress toward next tier
 * - Relativistic flight diagram (gamma/velocity vs proper time)
 * - Flight calculator
 */

class DriveResearchPanel {
    constructor(container) {
        this.container = container;
        this.driveData = null;
        this.currentTier = 1;
        this.computeAccumulated = 0;
        this.computeRate = 0;
        this.canvas = null;
        this.ctx = null;
        this.selectedAcceleration = 1; // g

        // Physics constants
        this.C = 299792458; // m/s
        this.C_KMS = 299792.458;
        this.YEAR_S = 31557600;
        this.LY_M = 9.461e15;

        this.init();
    }

    async init() {
        await this.loadDriveData();
        this.render();
        this.setupCanvas();
        this.updateDiagram();
    }

    async loadDriveData() {
        try {
            const response = await fetch('/game_data/starship_drives.json');
            this.driveData = await response.json();
        } catch (error) {
            console.error('[DriveResearchPanel] Failed to load drive data:', error);
            this.driveData = { drives: [] };
        }
    }

    render() {
        const currentDrive = this.driveData.drives.find(d => d.tier === this.currentTier);
        const nextDrive = this.driveData.drives.find(d => d.tier === this.currentTier + 1);

        const progress = nextDrive ?
            Math.min(100, (this.computeAccumulated / nextDrive.compute_cost) * 100) : 100;

        this.container.innerHTML = `
            <div class="eva-panel eva-bracket eva-strategy-panel" id="drive-research-panel">
                <div class="eva-header">
                    <span class="eva-header-title">STARSHIP DRIVE RESEARCH</span>
                    <div class="eva-header-status">
                        <div class="eva-status-indicator">
                            <span class="eva-status-dot"></span>
                            <span>ACTIVE</span>
                        </div>
                    </div>
                </div>

                <!-- Current Drive Section -->
                <div class="eva-section">
                    <span class="eva-section-label">CURRENT DRIVE</span>
                    <div class="eva-readout">
                        <span class="eva-label">Tier</span>
                        <span class="eva-value highlight">${this.currentTier}</span>
                        <span class="eva-unit">- ${currentDrive?.name || 'Unknown'}</span>
                    </div>
                    <div class="eva-readout">
                        <span class="eva-label">Max Velocity</span>
                        <span class="eva-value">${this.formatVelocity(currentDrive?.max_velocity_c)}</span>
                    </div>
                    <div class="eva-readout">
                        <span class="eva-label">Acceleration</span>
                        <span class="eva-value">${currentDrive?.acceleration_g || 'N/A'}</span>
                        <span class="eva-unit">g</span>
                    </div>
                </div>

                <!-- Research Progress -->
                ${nextDrive ? `
                <div class="eva-section">
                    <span class="eva-section-label">NEXT TIER: ${nextDrive.name}</span>
                    <div class="eva-progress">
                        <div class="eva-progress-fill" style="width: ${progress}%"></div>
                        <span class="eva-progress-text">${progress.toFixed(1)}%</span>
                    </div>
                    <div class="eva-readout">
                        <span class="eva-label">Compute</span>
                        <span class="eva-value">${this.formatNumber(this.computeAccumulated)}</span>
                        <span class="eva-unit">/ ${this.formatNumber(nextDrive.compute_cost)}</span>
                    </div>
                    <div class="eva-readout">
                        <span class="eva-label">Cost</span>
                        <span class="eva-value">${this.formatSolarMassYears(nextDrive.solar_mass_years)}</span>
                    </div>
                    <div class="eva-readout">
                        <span class="eva-label">Rate</span>
                        <span class="eva-value">${this.formatNumber(this.computeRate)}</span>
                        <span class="eva-unit">/year</span>
                    </div>
                    ${this.computeRate > 0 ? `
                    <div class="eva-readout">
                        <span class="eva-label">ETA</span>
                        <span class="eva-value">${this.formatETA(nextDrive.compute_cost)}</span>
                    </div>
                    ` : ''}
                </div>
                ` : `
                <div class="eva-alert">
                    <span class="eva-alert-icon">★</span>
                    <span class="eva-alert-text">Maximum drive tier reached</span>
                </div>
                `}

                <!-- Distance vs Proper Time Diagram -->
                <div class="eva-section">
                    <span class="eva-section-label">DISTANCE VS SHIP TIME</span>
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <span class="eva-label" style="min-width: auto;">Accel:</span>
                        <select class="eva-select" id="accel-select">
                            <option value="0.01">0.01g</option>
                            <option value="0.1">0.1g</option>
                            <option value="1" selected>1g</option>
                            <option value="5">5g</option>
                            <option value="10">10g</option>
                            <option value="50">50g</option>
                        </select>
                    </div>
                    <div class="eva-chart relativistic-diagram">
                        <canvas id="relativistic-canvas" width="340" height="220"></canvas>
                    </div>
                    <div class="eva-chart-legend" style="flex-wrap: wrap;">
                        <div class="eva-chart-legend-item">
                            <div class="eva-chart-legend-color" style="background: #00ffff;"></div>
                            <span>Distance (ly)</span>
                        </div>
                        <div class="eva-chart-legend-item">
                            <div class="eva-chart-legend-color" style="background: #ff6600; opacity: 0.5;"></div>
                            <span>Destinations</span>
                        </div>
                    </div>
                    <div class="relativistic-stats" id="relativistic-stats">
                        <!-- Updated dynamically -->
                    </div>
                </div>

                <!-- Flight Calculator -->
                <div class="eva-section">
                    <span class="eva-section-label">FLIGHT CALCULATOR</span>
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <span class="eva-label" style="min-width: auto;">Distance:</span>
                        <input type="number" class="eva-input" id="flight-distance" value="10" min="0.1" step="0.1" style="width: 80px;">
                        <span class="eva-unit">ly</span>
                    </div>
                    <div id="flight-results">
                        <!-- Updated dynamically -->
                    </div>
                </div>

                <!-- Drive Tier List -->
                <div class="eva-section">
                    <span class="eva-section-label">ALL DRIVE TIERS</span>
                    <div id="drive-tier-list">
                        ${this.renderDriveTierList()}
                    </div>
                </div>
            </div>
        `;

        this.attachEventListeners();
    }

    renderDriveTierList() {
        return this.driveData.drives.map(drive => {
            const isUnlocked = drive.tier <= this.currentTier;
            const isCurrent = drive.tier === this.currentTier;
            const classes = `drive-tier-row ${isCurrent ? 'current' : ''} ${!isUnlocked ? 'locked' : ''}`;

            // Format cost as Solar Mass-Years for locked tiers
            const costDisplay = drive.solar_mass_years ?
                this.formatSolarMassYears(drive.solar_mass_years) :
                `${this.formatNumber(drive.compute_cost)} compute`;

            return `
                <div class="${classes}">
                    <div class="drive-tier-number">${drive.tier}</div>
                    <div class="drive-tier-info">
                        <div class="drive-tier-name">${drive.name}</div>
                        <div class="drive-tier-stats">
                            <span class="drive-tier-velocity">${this.formatVelocity(drive.max_velocity_c)}</span>
                            ${drive.acceleration_g !== 'N/A' ? ` | ${drive.acceleration_g}g` : ''}
                            ${!isUnlocked && drive.tier > 1 ? ` | ${costDisplay}` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    setupCanvas() {
        this.canvas = document.getElementById('relativistic-canvas');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
        }
    }

    attachEventListeners() {
        const accelSelect = document.getElementById('accel-select');
        if (accelSelect) {
            accelSelect.addEventListener('change', (e) => {
                this.selectedAcceleration = parseFloat(e.target.value);
                this.updateDiagram();
                this.updateFlightCalculator();
            });
        }

        const distanceInput = document.getElementById('flight-distance');
        if (distanceInput) {
            distanceInput.addEventListener('input', () => {
                this.updateFlightCalculator();
            });
        }

        // Initial calculation
        this.updateFlightCalculator();
    }

    // Key destinations for reference lines
    getDestinations() {
        return [
            { name: 'α Cen', distance: 4.37, color: '#ffcc00' },
            { name: '100 ly', distance: 100, color: '#ff6600' },
            { name: '1k ly', distance: 1000, color: '#ff4400' },
            { name: 'Center', distance: 26000, color: '#ff0066' },
            { name: 'Andromeda', distance: 2500000, color: '#cc00ff' }
        ];
    }

    // Calculate distance traveled at given proper time with constant acceleration
    calculateDistance(properTimeYears, accelerationG) {
        const a = accelerationG * 9.81;  // m/s²
        const tau = properTimeYears * this.YEAR_S;  // seconds
        const distance_m = (this.C * this.C / a) * (Math.cosh(a * tau / this.C) - 1);
        return distance_m / this.LY_M;
    }

    // Calculate proper time needed to reach a distance
    calculateProperTime(distanceLY, accelerationG) {
        const a = accelerationG * 9.81;
        const distance_m = distanceLY * this.LY_M;
        // x = (c²/a)(cosh(aτ/c) - 1)
        // cosh(aτ/c) = 1 + ax/c²
        const acoshArg = 1 + (a * distance_m) / (this.C * this.C);
        const tau = (this.C / a) * Math.acosh(acoshArg);
        return tau / this.YEAR_S;
    }

    // Calculate coordinate (Earth) time for given proper time
    calculateCoordTime(properTimeYears, accelerationG) {
        const a = accelerationG * 9.81;
        const tau = properTimeYears * this.YEAR_S;
        const t = (this.C / a) * Math.sinh(a * tau / this.C);
        return t / this.YEAR_S;
    }

    // Calculate velocity at given proper time
    calculateVelocity(properTimeYears, accelerationG) {
        const a = accelerationG * 9.81;
        const tau = properTimeYears * this.YEAR_S;
        return Math.tanh(a * tau / this.C);
    }

    // Calculate Lorentz factor at given proper time
    calculateGamma(properTimeYears, accelerationG) {
        const a = accelerationG * 9.81;
        const tau = properTimeYears * this.YEAR_S;
        return Math.cosh(a * tau / this.C);
    }

    updateDiagram() {
        if (!this.ctx) return;

        const width = this.canvas.width;
        const height = this.canvas.height;
        const padding = { top: 15, right: 55, bottom: 35, left: 50 };
        const plotWidth = width - padding.left - padding.right;
        const plotHeight = height - padding.top - padding.bottom;

        // Clear canvas
        this.ctx.fillStyle = '#0a0a0a';
        this.ctx.fillRect(0, 0, width, height);

        const a_g = this.selectedAcceleration;
        const destinations = this.getDestinations();

        // Determine target distance based on acceleration
        // At high acceleration (≥10g), show trip to Andromeda
        // Otherwise, show trip to Galactic Center
        let targetDistance;
        if (a_g >= 10) {
            targetDistance = 2500000;  // Andromeda
        } else {
            targetDistance = 26000;    // Galactic Center
        }

        // Calculate ship time to reach target distance
        const maxTauYears = this.calculateProperTime(targetDistance, a_g);

        // Use log scale for distance (Y-axis)
        const logDistMin = -1;  // 0.1 ly
        const logDistMax = Math.ceil(Math.log10(targetDistance));

        // Convert distance to Y coordinate (log scale)
        const distToY = (dist) => {
            if (dist <= 0.1) return height - padding.bottom;
            const logDist = Math.log10(dist);
            const normalized = (logDist - logDistMin) / (logDistMax - logDistMin);
            return padding.top + plotHeight * (1 - normalized);
        };

        // Convert time to X coordinate (linear scale)
        const timeToX = (tau) => {
            return padding.left + (tau / maxTauYears) * plotWidth;
        };

        // Draw grid
        this.ctx.strokeStyle = '#1a1a1a';
        this.ctx.lineWidth = 0.5;

        // Horizontal grid (distance - log scale)
        for (let logD = logDistMin; logD <= logDistMax; logD++) {
            const y = distToY(Math.pow(10, logD));
            this.ctx.beginPath();
            this.ctx.moveTo(padding.left, y);
            this.ctx.lineTo(width - padding.right, y);
            this.ctx.stroke();
        }

        // Vertical grid (time - linear)
        // Calculate appropriate time step based on max time range
        let timeStep;
        if (maxTauYears <= 25) {
            timeStep = 5;
        } else if (maxTauYears <= 100) {
            timeStep = 20;
        } else if (maxTauYears <= 500) {
            timeStep = 100;
        } else if (maxTauYears <= 2000) {
            timeStep = 500;
        } else {
            timeStep = Math.pow(10, Math.floor(Math.log10(maxTauYears / 5)));
        }
        for (let t = 0; t <= maxTauYears; t += timeStep) {
            const x = timeToX(t);
            this.ctx.beginPath();
            this.ctx.moveTo(x, padding.top);
            this.ctx.lineTo(x, height - padding.bottom);
            this.ctx.stroke();
        }

        // Draw destination reference lines (horizontal)
        destinations.forEach(dest => {
            if (dest.distance > Math.pow(10, logDistMax)) return;

            const y = distToY(dest.distance);
            if (y < padding.top || y > height - padding.bottom) return;

            // Calculate time to reach this destination
            const tauToReach = this.calculateProperTime(dest.distance, a_g);

            this.ctx.strokeStyle = dest.color + '60';
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([4, 4]);
            this.ctx.beginPath();
            this.ctx.moveTo(padding.left, y);
            this.ctx.lineTo(width - padding.right, y);
            this.ctx.stroke();
            this.ctx.setLineDash([]);

            // Label on right
            this.ctx.fillStyle = dest.color;
            this.ctx.font = '8px JetBrains Mono, monospace';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(dest.name, width - padding.right + 3, y + 3);

            // If reachable within chart, mark the intersection
            if (tauToReach <= maxTauYears) {
                const x = timeToX(tauToReach);
                this.ctx.fillStyle = dest.color;
                this.ctx.beginPath();
                this.ctx.arc(x, y, 4, 0, Math.PI * 2);
                this.ctx.fill();

                // Add time annotation
                this.ctx.fillStyle = dest.color + 'cc';
                this.ctx.font = '7px JetBrains Mono, monospace';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(`${tauToReach.toFixed(1)}yr`, x, y - 8);
            }
        });

        // Draw distance curve
        this.ctx.strokeStyle = '#00ffff';
        this.ctx.lineWidth = 2.5;
        this.ctx.shadowColor = '#00ffff';
        this.ctx.shadowBlur = 8;
        this.ctx.beginPath();

        const points = 100;
        for (let i = 0; i <= points; i++) {
            const tau = (i / points) * maxTauYears;
            const distance = this.calculateDistance(tau, a_g);
            const x = timeToX(tau);
            const y = distToY(Math.max(distance, 0.1));

            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;

        // Axis labels
        this.ctx.font = '9px JetBrains Mono, monospace';

        // X-axis (time)
        this.ctx.fillStyle = '#666666';
        this.ctx.textAlign = 'center';
        for (let t = 0; t <= maxTauYears; t += timeStep) {
            const x = timeToX(t);
            // Format large time values
            let timeLabel;
            if (t >= 1000) {
                timeLabel = `${(t / 1000).toFixed(t >= 10000 ? 0 : 1)}k`;
            } else {
                timeLabel = `${t}`;
            }
            this.ctx.fillText(timeLabel, x, height - padding.bottom + 12);
        }
        this.ctx.fillStyle = '#888888';
        this.ctx.fillText('Ship Time τ (years)', width / 2, height - 5);

        // Y-axis (distance - log scale)
        this.ctx.textAlign = 'right';
        this.ctx.fillStyle = '#00ffff';
        for (let logD = logDistMin; logD <= logDistMax; logD++) {
            const y = distToY(Math.pow(10, logD));
            if (y < padding.top - 5 || y > height - padding.bottom + 5) continue;

            let label;
            if (logD < 0) label = `0.1`;
            else if (logD === 0) label = '1';
            else if (logD === 1) label = '10';
            else if (logD === 2) label = '100';
            else if (logD === 3) label = '1k';
            else if (logD === 4) label = '10k';
            else if (logD === 5) label = '100k';
            else if (logD === 6) label = '1M';
            else if (logD === 7) label = '10M';
            else label = `10^${logD}`;

            this.ctx.fillText(label, padding.left - 5, y + 3);
        }

        // Y-axis title
        this.ctx.save();
        this.ctx.translate(12, height / 2);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#00ffff';
        this.ctx.fillText('Distance (ly)', 0, 0);
        this.ctx.restore();

        // Acceleration indicator
        this.ctx.fillStyle = '#ff6600';
        this.ctx.font = 'bold 10px JetBrains Mono, monospace';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`${a_g}g constant`, padding.left + 5, padding.top + 12);

        // Update stats below chart
        const finalDistance = this.calculateDistance(maxTauYears, a_g);
        const finalVelocity = this.calculateVelocity(maxTauYears, a_g);
        const finalGamma = this.calculateGamma(maxTauYears, a_g);
        const finalEarthTime = this.calculateCoordTime(maxTauYears, a_g);

        const statsContainer = document.getElementById('relativistic-stats');
        if (statsContainer) {
            // Find which destinations are reachable
            const reachable = destinations.filter(d =>
                this.calculateProperTime(d.distance, a_g) <= maxTauYears
            );

            statsContainer.innerHTML = `
                <div class="eva-grid eva-grid-2" style="margin-top: 8px;">
                    <div class="relativistic-stat">
                        <span class="relativistic-stat-label">At ${maxTauYears}yr ship time:</span>
                    </div>
                    <div class="relativistic-stat">
                        <span class="relativistic-stat-label">Earth time:</span>
                        <span class="relativistic-stat-value">${this.formatLargeNumber(finalEarthTime)} yr</span>
                    </div>
                </div>
                <div class="eva-grid eva-grid-3" style="margin-top: 4px;">
                    <div class="relativistic-stat">
                        <span class="relativistic-stat-label">Distance</span>
                        <span class="relativistic-stat-value">${this.formatLargeNumber(finalDistance)} ly</span>
                    </div>
                    <div class="relativistic-stat">
                        <span class="relativistic-stat-label">Velocity</span>
                        <span class="relativistic-stat-value">${finalVelocity.toFixed(4)}c</span>
                    </div>
                    <div class="relativistic-stat">
                        <span class="relativistic-stat-label">γ factor</span>
                        <span class="relativistic-stat-value">${finalGamma.toFixed(1)}</span>
                    </div>
                </div>
            `;
        }
    }

    formatLargeNumber(num) {
        if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
        if (num >= 1e3) return `${(num / 1e3).toFixed(1)}k`;
        if (num >= 100) return num.toFixed(0);
        if (num >= 10) return num.toFixed(1);
        return num.toFixed(2);
    }

    formatSolarMassYears(smyr) {
        if (smyr === undefined || smyr === null) return 'N/A';

        // Format as scientific notation with M☉·yr unit
        const exp = Math.floor(Math.log10(Math.abs(smyr)));
        const mantissa = smyr / Math.pow(10, exp);

        // Use superscript for exponent
        const superscripts = {
            '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
            '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻'
        };

        const expStr = exp.toString().split('').map(c => superscripts[c] || c).join('');
        return `${mantissa.toFixed(1)}×10${expStr} M☉·yr`;
    }

    updateFlightCalculator() {
        const distanceInput = document.getElementById('flight-distance');
        const resultsContainer = document.getElementById('flight-results');

        if (!distanceInput || !resultsContainer) return;

        const distanceLY = parseFloat(distanceInput.value) || 10;
        const currentDrive = this.driveData.drives.find(d => d.tier === this.currentTier);

        if (!currentDrive) return;

        // Calculate based on current drive
        let shipTime, earthTime, maxVelocity;

        if (typeof currentDrive.acceleration_g === 'number') {
            // Use brachistochrone trajectory (accelerate halfway, decelerate halfway)
            const a = currentDrive.acceleration_g * 9.81;
            const distance = distanceLY * this.LY_M;
            const halfDistance = distance / 2;

            // Solve for proper time to reach halfway point
            // x = (c²/a)(cosh(aτ/c) - 1)
            // Rearranging: cosh(aτ/c) = 1 + ax/c²
            // aτ/c = acosh(1 + ax/c²)
            const acoshArg = 1 + (a * halfDistance) / (this.C * this.C);
            const halfTau = (this.C / a) * Math.acosh(acoshArg);
            const totalTau = 2 * halfTau;

            // Coordinate time: t = (c/a) * sinh(aτ/c)
            const halfT = (this.C / a) * Math.sinh(a * halfTau / this.C);
            const totalT = 2 * halfT;

            shipTime = totalTau / this.YEAR_S;
            earthTime = totalT / this.YEAR_S;

            // Peak velocity at midpoint
            maxVelocity = Math.tanh(a * halfTau / this.C);
        } else {
            // Warp or instantaneous - no time dilation
            const effectiveV = currentDrive.effective_velocity_c || currentDrive.max_velocity_c;
            if (effectiveV === 'infinite') {
                shipTime = 0;
                earthTime = 0;
            } else {
                shipTime = distanceLY / effectiveV;
                earthTime = shipTime;
            }
            maxVelocity = effectiveV;
        }

        resultsContainer.innerHTML = `
            <div class="eva-grid eva-grid-2">
                <div class="eva-stat-card">
                    <div class="eva-stat-value">${shipTime < 0.01 ? '~0' : shipTime.toFixed(1)}</div>
                    <div class="eva-stat-label">Ship Time (yr)</div>
                </div>
                <div class="eva-stat-card">
                    <div class="eva-stat-value">${earthTime < 0.01 ? '~0' : earthTime.toFixed(1)}</div>
                    <div class="eva-stat-label">Earth Time (yr)</div>
                </div>
            </div>
            ${shipTime > 0 && earthTime > shipTime ? `
            <div class="eva-alert" style="margin-top: 10px;">
                <span class="eva-alert-icon">⏱</span>
                <span class="eva-alert-text">Time dilation factor</span>
                <span class="eva-alert-value">${(earthTime / shipTime).toFixed(2)}x</span>
            </div>
            ` : ''}
        `;
    }

    formatVelocity(velocity_c) {
        if (velocity_c === 'infinite') return '∞';
        if (typeof velocity_c !== 'number') return velocity_c || 'N/A';

        if (velocity_c >= 1) {
            return `${velocity_c}c`;
        } else if (velocity_c >= 0.01) {
            return `${velocity_c}c`;
        } else {
            return `${(velocity_c * 1000).toFixed(1)}×10⁻³c`;
        }
    }

    formatNumber(num) {
        if (num === undefined || num === null) return '0';
        if (num >= 1e33) return `${(num / 1e33).toFixed(1)}×10³³`;
        if (num >= 1e30) return `${(num / 1e30).toFixed(1)}×10³⁰`;
        if (num >= 1e27) return `${(num / 1e27).toFixed(1)}×10²⁷`;
        if (num >= 1e24) return `${(num / 1e24).toFixed(1)}×10²⁴`;
        if (num >= 1e21) return `${(num / 1e21).toFixed(1)}×10²¹`;
        if (num >= 1e18) return `${(num / 1e18).toFixed(1)}×10¹⁸`;
        if (num >= 1e15) return `${(num / 1e15).toFixed(1)}×10¹⁵`;
        if (num >= 1e12) return `${(num / 1e12).toFixed(1)}×10¹²`;
        if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
        if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
        if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
        return num.toFixed(0);
    }

    formatETA(targetCompute) {
        if (this.computeRate <= 0) return '∞';
        const remaining = targetCompute - this.computeAccumulated;
        const yearsRemaining = remaining / this.computeRate;

        if (yearsRemaining < 1) return `${(yearsRemaining * 12).toFixed(0)} months`;
        if (yearsRemaining < 100) return `${yearsRemaining.toFixed(0)} years`;
        if (yearsRemaining < 1000) return `${(yearsRemaining / 100).toFixed(1)} centuries`;
        return `${(yearsRemaining / 1000).toFixed(1)} millennia`;
    }

    // Public API for updating state
    update(state) {
        if (state.currentTier !== undefined) this.currentTier = state.currentTier;
        if (state.computeAccumulated !== undefined) this.computeAccumulated = state.computeAccumulated;
        if (state.computeRate !== undefined) this.computeRate = state.computeRate;

        this.render();
        this.setupCanvas();
        this.updateDiagram();
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

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DriveResearchPanel;
}

if (typeof window !== 'undefined') {
    window.DriveResearchPanel = DriveResearchPanel;
}
