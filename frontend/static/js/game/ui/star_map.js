/**
 * Star Map UI
 *
 * Displays nearby stars and allows interstellar travel
 * Phase A: 10 nearby stars with transfer initiation
 */

class StarMap {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.galaxySystem = null;
        this.canvas = null;
        this.ctx = null;
        this.width = 600;
        this.height = 400;

        // View settings
        this.scale = 25; // pixels per light-year
        this.centerX = this.width / 2;
        this.centerY = this.height / 2;

        // Selected star
        this.selectedStar = null;
        this.hoveredStar = null;

        // Current propulsion tier info
        this.propulsionTier = 1;
        this.effectiveVelocityC = 0;

        // Star colors by spectral type
        this.starColors = {
            O: '#9bb0ff',
            B: '#aabfff',
            A: '#cad7ff',
            F: '#f8f7ff',
            G: '#fff4e8',
            K: '#ffd2a1',
            M: '#ffcc6f'
        };

        // Callbacks
        this.onTransferInitiated = null;
        this.onSystemSelected = null;
    }

    /**
     * Initialize the star map
     * @param {GalaxySystem} galaxySystem - Galaxy system manager
     */
    initialize(galaxySystem) {
        this.galaxySystem = galaxySystem;
        this.createCanvas();
        this.setupEventListeners();
        this.render();
    }

    /**
     * Create the canvas element
     */
    createCanvas() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="star-map-header">
                <h3>Nearby Stars</h3>
                <div class="star-map-legend">
                    <span class="legend-item"><span class="legend-dot colonized"></span> Colonized</span>
                    <span class="legend-item"><span class="legend-dot discovered"></span> Discovered</span>
                    <span class="legend-item"><span class="legend-dot transit"></span> In Transit</span>
                </div>
            </div>
            <canvas id="star-map-canvas" width="${this.width}" height="${this.height}"></canvas>
            <div id="star-map-info" class="star-map-info"></div>
            <div id="star-map-actions" class="star-map-actions" style="display:none;">
                <button id="btn-travel" class="btn-travel" disabled>Send Colony Ship</button>
                <button id="btn-view" class="btn-view" disabled>View System</button>
            </div>
        `;

        this.canvas = document.getElementById('star-map-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.infoPanel = document.getElementById('star-map-info');
        this.actionsPanel = document.getElementById('star-map-actions');
    }

    /**
     * Setup mouse event listeners
     */
    setupEventListeners() {
        if (!this.canvas) return;

        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('click', (e) => this.handleClick(e));

        const btnTravel = document.getElementById('btn-travel');
        const btnView = document.getElementById('btn-view');

        if (btnTravel) {
            btnTravel.addEventListener('click', () => this.initiateTransfer());
        }

        if (btnView) {
            btnView.addEventListener('click', () => this.viewSystem());
        }
    }

    /**
     * Handle mouse move for hover effects
     */
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const star = this.getStarAtPosition(x, y);

        if (star !== this.hoveredStar) {
            this.hoveredStar = star;
            this.render();

            if (star) {
                this.showStarInfo(star);
            } else {
                this.hideStarInfo();
            }
        }
    }

    /**
     * Handle click to select star
     */
    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const star = this.getStarAtPosition(x, y);

        if (star) {
            this.selectedStar = star;
            this.render();
            this.showStarActions(star);
        } else {
            this.selectedStar = null;
            this.hideStarActions();
        }
    }

    /**
     * Get star at canvas position
     */
    getStarAtPosition(x, y) {
        const stars = this.galaxySystem?.getAllStars() || [];

        for (const star of stars) {
            const screenPos = this.starToScreen(star);
            const dx = x - screenPos.x;
            const dy = y - screenPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.getStarRadius(star) + 5) {
                return star;
            }
        }

        return null;
    }

    /**
     * Convert star position to screen coordinates
     */
    starToScreen(star) {
        return {
            x: this.centerX + star.position_ly.x * this.scale,
            y: this.centerY - star.position_ly.y * this.scale
        };
    }

    /**
     * Get star radius for rendering
     */
    getStarRadius(star) {
        // Scale by luminosity (log scale)
        const baseRadius = 5;
        const luminosityFactor = Math.log10(star.luminosity_solar + 1) + 1;
        return baseRadius * luminosityFactor;
    }

    /**
     * Render the star map
     */
    render() {
        if (!this.ctx || !this.galaxySystem) return;

        const ctx = this.ctx;

        // Clear canvas
        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(0, 0, this.width, this.height);

        // Draw grid
        this.drawGrid();

        // Draw transit lines
        this.drawTransitLines();

        // Draw stars
        this.drawStars();

        // Draw selection
        if (this.selectedStar) {
            this.drawSelection(this.selectedStar);
        }
    }

    /**
     * Draw coordinate grid
     */
    drawGrid() {
        const ctx = this.ctx;
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 1;

        // Draw concentric circles for distance reference
        const distances = [5, 10, 15, 20]; // light-years
        ctx.setLineDash([2, 4]);

        for (const dist of distances) {
            ctx.beginPath();
            ctx.arc(this.centerX, this.centerY, dist * this.scale, 0, Math.PI * 2);
            ctx.stroke();

            // Label
            ctx.fillStyle = '#333';
            ctx.font = '10px monospace';
            ctx.fillText(`${dist} ly`, this.centerX + dist * this.scale + 3, this.centerY - 3);
        }

        ctx.setLineDash([]);
    }

    /**
     * Draw transit lines for in-progress transfers
     */
    drawTransitLines() {
        const transfers = this.galaxySystem?.getPendingTransfers() || [];
        const ctx = this.ctx;

        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);

        for (const transfer of transfers) {
            const fromStar = this.galaxySystem.getStarInfo(transfer.from_system);
            const toStar = this.galaxySystem.getStarInfo(transfer.to_system);

            if (fromStar && toStar) {
                const from = this.starToScreen(fromStar);
                const to = this.starToScreen(toStar);

                ctx.beginPath();
                ctx.moveTo(from.x, from.y);
                ctx.lineTo(to.x, to.y);
                ctx.stroke();

                // Draw ship indicator along path
                // (Progress based on time would be calculated here)
            }
        }

        ctx.setLineDash([]);
    }

    /**
     * Draw all stars
     */
    drawStars() {
        const stars = this.galaxySystem?.getAllStars() || [];
        const ctx = this.ctx;

        for (const star of stars) {
            const pos = this.starToScreen(star);
            const radius = this.getStarRadius(star);
            const isColonized = this.galaxySystem.isColonized(star.id);
            const isActive = star.id === this.galaxySystem.activeSystemId;

            // Draw glow for colonized systems
            if (isColonized) {
                const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius * 3);
                gradient.addColorStop(0, 'rgba(100, 255, 100, 0.3)');
                gradient.addColorStop(1, 'rgba(100, 255, 100, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius * 3, 0, Math.PI * 2);
                ctx.fill();
            }

            // Draw star
            const color = this.starColors[star.spectral_class] || '#ffffff';
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
            ctx.fill();

            // Draw ring for active system
            if (isActive) {
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius + 4, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Draw hover highlight
            if (star === this.hoveredStar) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius + 2, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Draw name
            ctx.fillStyle = '#888';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(star.name, pos.x, pos.y + radius + 12);
        }
    }

    /**
     * Draw selection indicator
     */
    drawSelection(star) {
        const ctx = this.ctx;
        const pos = this.starToScreen(star);
        const radius = this.getStarRadius(star);

        ctx.strokeStyle = '#00aaff';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    /**
     * Show star info panel
     */
    showStarInfo(star) {
        if (!this.infoPanel) return;

        const isColonized = this.galaxySystem.isColonized(star.id);
        const transferTime = this.effectiveVelocityC > 0
            ? this.galaxySystem.calculateTransferTime(this.galaxySystem.activeSystemId, star.id, this.effectiveVelocityC)
            : null;

        let html = `
            <div class="star-info-name">${star.name}</div>
            <div class="star-info-type">${star.type} (${star.spectral_class}-class)</div>
            <div class="star-info-distance">${star.distance_ly.toFixed(2)} light-years</div>
            <div class="star-info-luminosity">Luminosity: ${star.luminosity_solar.toFixed(4)} L☉</div>
        `;

        if (isColonized) {
            html += `<div class="star-info-status colonized">Colonized</div>`;
        } else if (transferTime && transferTime.time_days < Infinity) {
            const timeStr = transferTime.time_years < 1
                ? `${Math.round(transferTime.time_days)} days`
                : `${transferTime.time_years.toFixed(1)} years`;
            html += `<div class="star-info-travel">Travel time: ${timeStr}</div>`;
        }

        this.infoPanel.innerHTML = html;
        this.infoPanel.style.display = 'block';
    }

    /**
     * Hide star info panel
     */
    hideStarInfo() {
        if (this.infoPanel) {
            this.infoPanel.style.display = 'none';
        }
    }

    /**
     * Show action buttons for selected star
     */
    showStarActions(star) {
        if (!this.actionsPanel) return;

        const btnTravel = document.getElementById('btn-travel');
        const btnView = document.getElementById('btn-view');
        const isColonized = this.galaxySystem.isColonized(star.id);
        const isActive = star.id === this.galaxySystem.activeSystemId;

        this.actionsPanel.style.display = 'flex';

        if (btnTravel) {
            btnTravel.disabled = isColonized || this.effectiveVelocityC <= 0 || isActive;
            btnTravel.textContent = isColonized ? 'Already Colonized' : 'Send Colony Ship';
        }

        if (btnView) {
            btnView.disabled = !isColonized || isActive;
            btnView.textContent = isActive ? 'Current System' : 'View System';
        }
    }

    /**
     * Hide action buttons
     */
    hideStarActions() {
        if (this.actionsPanel) {
            this.actionsPanel.style.display = 'none';
        }
    }

    /**
     * Initiate transfer to selected star
     */
    initiateTransfer() {
        if (!this.selectedStar || !this.galaxySystem) return;

        // Callback to main game to handle transfer
        if (this.onTransferInitiated) {
            this.onTransferInitiated(this.selectedStar.id, this.effectiveVelocityC);
        }
    }

    /**
     * View selected system
     */
    viewSystem() {
        if (!this.selectedStar || !this.galaxySystem) return;

        if (this.onSystemSelected) {
            this.onSystemSelected(this.selectedStar.id);
        }
    }

    /**
     * Update propulsion info
     */
    updatePropulsion(tier, effectiveVelocityC) {
        this.propulsionTier = tier;
        this.effectiveVelocityC = effectiveVelocityC;
        this.render();
    }

    /**
     * Refresh the display
     */
    refresh() {
        this.render();
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StarMap;
}

// Global for browser
if (typeof window !== 'undefined') {
    window.StarMap = StarMap;
}
