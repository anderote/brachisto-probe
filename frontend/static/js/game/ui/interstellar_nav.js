/**
 * Interstellar Navigation System
 *
 * NGE-style 3D star map with relativistic travel calculations.
 * Replaces the transfer window when viewing interstellar destinations.
 *
 * Visual style: Neon Genesis Evangelion
 * - Orange/amber primary text
 * - Green accent lines and highlights
 * - Black backgrounds with scan lines
 * - Angular UI elements with technical readouts
 * - Scrolling data displays
 */

class InterstellarNav {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.canvas = null;
        this.ctx = null;
        this.width = 800;
        this.height = 500;

        // Systems
        this.relativisticTravel = new RelativisticTravel();
        // NOTE: galaxySystem is deprecated - use window.starMapVisualization for star data
        this.galaxySystem = null;

        // View state
        this.rotationX = 0.3;
        this.rotationY = 0;
        this.zoom = 30;  // pixels per light-year
        this.autoRotate = true;

        // Selection
        this.selectedStar = null;
        this.hoveredStar = null;
        this.currentSystem = 'sol';

        // Drive settings
        this.driveTier = 5;  // Default 1g
        this.accel_g = 1.0;

        // Animation
        this.animationFrame = null;
        this.scanLineOffset = 0;
        this.dataScrollOffset = 0;

        // Visibility state
        this.isVisible = false;

        // Colors (NGE palette)
        this.colors = {
            primary: '#ff6b00',      // Orange
            secondary: '#00ff41',    // Green
            tertiary: '#00b4ff',     // Cyan
            warning: '#ff0040',      // Red
            background: '#0a0a0a',
            grid: '#1a2a1a',
            text: '#ff8c00',
            dimText: '#804600',
            scanLine: 'rgba(0, 255, 65, 0.03)'
        };

        // Callbacks
        this.onTransferInitiated = null;
        this.onSystemSelected = null;
    }

    /**
     * Initialize the navigation system
     * @param {Object} galaxySystem - DEPRECATED: ignored, uses window.starMapVisualization
     */
    initialize(galaxySystem = null) {
        // NOTE: galaxySystem parameter is deprecated
        // Star data now comes from window.starMapVisualization
        this.galaxySystem = galaxySystem; // Keep for backwards compat but prefer starMapVisualization
        this.createUI();
        this.setupEventListeners();
        this.startAnimation();
    }

    // ========================================================================
    // HELPER METHODS - Access star data via starMapVisualization
    // ========================================================================

    /**
     * Get all stars (POAs from starMapVisualization)
     * @returns {Array} Array of star objects
     */
    _getAllStars() {
        const starMap = window.starMapVisualization;
        if (starMap?.starData?.stars) {
            return starMap.starData.stars;
        }
        // Fallback to legacy galaxySystem
        return this.galaxySystem?.getAllStars?.() || [];
    }

    /**
     * Get star info by ID
     * @param {string} starId - Star ID
     * @returns {Object|null} Star data
     */
    _getStarInfo(starId) {
        const starMap = window.starMapVisualization;
        if (starMap?.starData) {
            const star = starMap.starData.stars?.find(s => s.id === starId);
            if (star) return star;
            const cloud = starMap.starData.dust_clouds?.find(c => c.id === starId);
            if (cloud) return cloud;
        }
        // Fallback to legacy galaxySystem
        return this.galaxySystem?.getStarInfo?.(starId) || null;
    }

    /**
     * Check if system is colonized
     * @param {string} systemId - System ID
     * @returns {boolean}
     */
    _isColonized(systemId) {
        const starMap = window.starMapVisualization;
        if (starMap?.isNearbySystemColonized) {
            return starMap.isNearbySystemColonized(systemId);
        }
        // Fallback to legacy galaxySystem
        return this.galaxySystem?.isColonized?.(systemId) || false;
    }

    // ========================================================================
    // END HELPER METHODS
    // ========================================================================

    /**
     * Create the NGE-style UI
     */
    createUI() {
        if (!this.container) return;

        this.container.innerHTML = `
            <button class="nge-close-btn" id="nge-close-btn" title="Close (I)">×</button>
            <div class="nge-nav-container">
                <!-- Header with system status -->
                <div class="nge-header">
                    <div class="nge-header-left">
                        <span class="nge-label">INTERSTELLAR NAVIGATION</span>
                        <span class="nge-sublabel">RELATIVISTIC TRAJECTORY COMPUTER</span>
                    </div>
                    <div class="nge-header-right">
                        <span class="nge-status">STATUS: <span class="nge-status-value">NOMINAL</span></span>
                        <span class="nge-mode">MODE: <span class="nge-mode-value">SURVEY</span></span>
                    </div>
                </div>

                <!-- Main content area -->
                <div class="nge-main">
                    <!-- Left panel: Star map -->
                    <div class="nge-map-panel">
                        <div class="nge-panel-header">
                            <span class="nge-panel-title">3D STELLAR CARTOGRAPHY</span>
                            <span class="nge-panel-status blink">● ACTIVE</span>
                        </div>
                        <canvas id="nge-star-canvas" width="${this.width}" height="${this.height}"></canvas>
                        <div class="nge-map-controls">
                            <button class="nge-btn" id="btn-rotate-toggle">AUTO-ROT: ON</button>
                            <button class="nge-btn" id="btn-zoom-in">ZOOM +</button>
                            <button class="nge-btn" id="btn-zoom-out">ZOOM -</button>
                            <button class="nge-btn" id="btn-reset-view">RESET</button>
                        </div>
                    </div>

                    <!-- Right panel: Data readouts -->
                    <div class="nge-data-panel">
                        <!-- Drive status -->
                        <div class="nge-section">
                            <div class="nge-section-header">PROPULSION SYSTEM</div>
                            <div class="nge-drive-display">
                                <div class="nge-drive-name" id="drive-name">CONVERSION DRIVE</div>
                                <div class="nge-drive-accel">
                                    <span class="nge-big-number" id="drive-accel">1.00</span>
                                    <span class="nge-unit">g CONSTANT</span>
                                </div>
                                <div class="nge-drive-tier">
                                    TIER: <span id="drive-tier">5</span>/10
                                </div>
                            </div>
                        </div>

                        <!-- Target info -->
                        <div class="nge-section">
                            <div class="nge-section-header">TARGET SYSTEM</div>
                            <div class="nge-target-display" id="target-display">
                                <div class="nge-no-target">NO TARGET SELECTED</div>
                            </div>
                        </div>

                        <!-- Travel calculation -->
                        <div class="nge-section">
                            <div class="nge-section-header">TRAJECTORY ANALYSIS</div>
                            <div class="nge-travel-display" id="travel-display">
                                <div class="nge-waiting">AWAITING TARGET...</div>
                            </div>
                        </div>

                        <!-- Time dilation graph -->
                        <div class="nge-section">
                            <div class="nge-section-header">TIME DILATION CURVE</div>
                            <canvas id="nge-dilation-canvas" width="280" height="120"></canvas>
                        </div>

                        <!-- Launch button -->
                        <div class="nge-launch-section">
                            <button class="nge-launch-btn" id="btn-launch" disabled>
                                <span class="nge-launch-text">INITIATE TRANSFER</span>
                                <span class="nge-launch-sub">AWAITING TARGET</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Bottom status bar -->
                <div class="nge-footer">
                    <div class="nge-scroll-text" id="scroll-text">
                        RELATIVISTIC NAVIGATION SYSTEM v2.71 // PROPER TIME CALCULATION ACTIVE //
                        LORENTZ FACTOR COMPENSATION ENABLED // MIDPOINT FLIP MANEUVER STANDARD //
                        TIME DILATION WARNING: SHIP TIME ≠ EARTH TIME AT RELATIVISTIC VELOCITIES //
                    </div>
                </div>
            </div>
        `;

        this.canvas = document.getElementById('nge-star-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.dilationCanvas = document.getElementById('nge-dilation-canvas');
        this.dilationCtx = this.dilationCanvas.getContext('2d');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        if (!this.canvas) return;

        // Canvas mouse events
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));

        // Drag to rotate
        let isDragging = false;
        let lastX, lastY;

        this.canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            this.autoRotate = false;
            this.updateRotateButton();
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const dx = e.clientX - lastX;
                const dy = e.clientY - lastY;
                this.rotationY += dx * 0.005;
                this.rotationX += dy * 0.005;
                this.rotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotationX));
                lastX = e.clientX;
                lastY = e.clientY;
            }
        });

        // Button events
        document.getElementById('btn-rotate-toggle')?.addEventListener('click', () => {
            this.autoRotate = !this.autoRotate;
            this.updateRotateButton();
        });

        document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
            this.zoom = Math.min(100, this.zoom * 1.2);
        });

        document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
            this.zoom = Math.max(10, this.zoom / 1.2);
        });

        document.getElementById('btn-reset-view')?.addEventListener('click', () => {
            this.rotationX = 0.3;
            this.rotationY = 0;
            this.zoom = 30;
        });

        document.getElementById('btn-launch')?.addEventListener('click', () => {
            this.launchTransfer();
        });

        // Close button
        document.getElementById('nge-close-btn')?.addEventListener('click', () => {
            this.hide();
        });

        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
    }

    /**
     * Update auto-rotate button text
     */
    updateRotateButton() {
        const btn = document.getElementById('btn-rotate-toggle');
        if (btn) {
            btn.textContent = `AUTO-ROT: ${this.autoRotate ? 'ON' : 'OFF'}`;
        }
    }

    /**
     * Handle mouse move for hover
     */
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const star = this.getStarAtPosition(x, y);
        if (star !== this.hoveredStar) {
            this.hoveredStar = star;
        }
    }

    /**
     * Handle click to select
     */
    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const star = this.getStarAtPosition(x, y);
        if (star && star.id !== this.currentSystem) {
            this.selectedStar = star;
            this.updateTargetDisplay();
            this.updateTravelDisplay();
            this.updateDilationGraph();
            this.updateLaunchButton();
        }
    }

    /**
     * Handle mouse wheel for zoom
     */
    handleWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoom = Math.max(10, Math.min(100, this.zoom * delta));
    }

    /**
     * Project 3D point to 2D screen
     */
    project3D(x, y, z) {
        // Rotate around Y axis
        const cosY = Math.cos(this.rotationY);
        const sinY = Math.sin(this.rotationY);
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;

        // Rotate around X axis
        const cosX = Math.cos(this.rotationX);
        const sinX = Math.sin(this.rotationX);
        const y1 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;

        // Project to 2D
        const scale = 200 / (200 + z2);
        const screenX = this.width / 2 + x1 * this.zoom * scale;
        const screenY = this.height / 2 - y1 * this.zoom * scale;

        return { x: screenX, y: screenY, z: z2, scale };
    }

    /**
     * Get star at screen position
     */
    getStarAtPosition(screenX, screenY) {
        const stars = this._getAllStars();

        for (const star of stars) {
            const projected = this.project3D(
                star.position_ly.x,
                star.position_ly.y,
                star.position_ly.z
            );

            const dx = screenX - projected.x;
            const dy = screenY - projected.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 15) {
                return star;
            }
        }

        return null;
    }

    /**
     * Start animation loop
     */
    startAnimation() {
        const animate = () => {
            this.update();
            this.render();
            this.animationFrame = requestAnimationFrame(animate);
        };
        animate();
    }

    /**
     * Update animation state
     */
    update() {
        if (this.autoRotate) {
            this.rotationY += 0.002;
        }
        this.scanLineOffset = (this.scanLineOffset + 1) % 4;
        this.dataScrollOffset = (this.dataScrollOffset + 0.5) % 1000;

        // Update scrolling text
        const scrollText = document.getElementById('scroll-text');
        if (scrollText) {
            scrollText.style.transform = `translateX(-${this.dataScrollOffset}px)`;
        }
    }

    /**
     * Main render function
     */
    render() {
        if (!this.ctx) return;

        const ctx = this.ctx;

        // Clear with background
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, this.width, this.height);

        // Draw scan lines
        this.drawScanLines();

        // Draw 3D grid
        this.drawGrid();

        // Draw distance rings
        this.drawDistanceRings();

        // Draw connection lines to selected
        if (this.selectedStar) {
            this.drawConnectionLine();
        }

        // Draw stars
        this.drawStars();

        // Draw UI overlays
        this.drawOverlays();
    }

    /**
     * Draw CRT-style scan lines
     */
    drawScanLines() {
        const ctx = this.ctx;
        ctx.fillStyle = this.colors.scanLine;

        for (let y = this.scanLineOffset; y < this.height; y += 4) {
            ctx.fillRect(0, y, this.width, 1);
        }
    }

    /**
     * Draw 3D coordinate grid
     */
    drawGrid() {
        const ctx = this.ctx;
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 0.5;

        // Draw grid lines on XZ plane (y=0)
        const gridSize = 20;
        const gridSpacing = 5;

        for (let x = -gridSize; x <= gridSize; x += gridSpacing) {
            const p1 = this.project3D(x, 0, -gridSize);
            const p2 = this.project3D(x, 0, gridSize);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }

        for (let z = -gridSize; z <= gridSize; z += gridSpacing) {
            const p1 = this.project3D(-gridSize, 0, z);
            const p2 = this.project3D(gridSize, 0, z);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
    }

    /**
     * Draw distance reference rings
     */
    drawDistanceRings() {
        const ctx = this.ctx;
        const distances = [5, 10, 15];

        ctx.strokeStyle = this.colors.dimText;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);

        for (const dist of distances) {
            ctx.beginPath();
            const segments = 32;
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const x = Math.cos(angle) * dist;
                const z = Math.sin(angle) * dist;
                const p = this.project3D(x, 0, z);

                if (i === 0) {
                    ctx.moveTo(p.x, p.y);
                } else {
                    ctx.lineTo(p.x, p.y);
                }
            }
            ctx.stroke();

            // Label
            const labelPos = this.project3D(dist, 0, 0);
            ctx.fillStyle = this.colors.dimText;
            ctx.font = '10px monospace';
            ctx.fillText(`${dist}ly`, labelPos.x + 5, labelPos.y);
        }

        ctx.setLineDash([]);
    }

    /**
     * Draw line from current to selected system
     */
    drawConnectionLine() {
        if (!this.selectedStar) return;

        const currentStar = this._getStarInfo(this.currentSystem);
        if (!currentStar) return;

        const ctx = this.ctx;
        const p1 = this.project3D(
            currentStar.position_ly.x,
            currentStar.position_ly.y,
            currentStar.position_ly.z
        );
        const p2 = this.project3D(
            this.selectedStar.position_ly.x,
            this.selectedStar.position_ly.y,
            this.selectedStar.position_ly.z
        );

        // Animated dashed line
        ctx.strokeStyle = this.colors.secondary;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        ctx.lineDashOffset = -this.dataScrollOffset * 0.5;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        ctx.setLineDash([]);
    }

    /**
     * Draw all stars
     */
    drawStars() {
        const stars = this._getAllStars();
        const ctx = this.ctx;

        // Sort by Z for proper depth rendering
        const sortedStars = stars.map(star => ({
            star,
            projected: this.project3D(
                star.position_ly.x,
                star.position_ly.y,
                star.position_ly.z
            )
        })).sort((a, b) => b.projected.z - a.projected.z);

        for (const { star, projected } of sortedStars) {
            const isColonized = this._isColonized(star.id);
            const isCurrent = star.id === this.currentSystem;
            const isSelected = star === this.selectedStar;
            const isHovered = star === this.hoveredStar;

            // Base radius scaled by luminosity and depth
            const baseRadius = 4 + Math.log10(star.luminosity_solar + 1) * 3;
            const radius = baseRadius * projected.scale;

            // Draw glow for colonized
            if (isColonized) {
                const gradient = ctx.createRadialGradient(
                    projected.x, projected.y, 0,
                    projected.x, projected.y, radius * 4
                );
                gradient.addColorStop(0, 'rgba(0, 255, 65, 0.4)');
                gradient.addColorStop(1, 'rgba(0, 255, 65, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(projected.x, projected.y, radius * 4, 0, Math.PI * 2);
                ctx.fill();
            }

            // Star color based on spectral type
            const starColor = this.getStarColor(star.spectral_class);
            ctx.fillStyle = starColor;
            ctx.beginPath();
            ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
            ctx.fill();

            // Selection indicator
            if (isSelected) {
                ctx.strokeStyle = this.colors.secondary;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(projected.x, projected.y, radius + 8, 0, Math.PI * 2);
                ctx.stroke();

                // Corner brackets
                this.drawTargetBrackets(projected.x, projected.y, radius + 12);
            }

            // Current system indicator
            if (isCurrent) {
                ctx.strokeStyle = this.colors.tertiary;
                ctx.lineWidth = 2;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.arc(projected.x, projected.y, radius + 5, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Hover highlight
            if (isHovered && !isSelected) {
                ctx.strokeStyle = this.colors.primary;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(projected.x, projected.y, radius + 3, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Name label
            ctx.fillStyle = isHovered || isSelected ? this.colors.text : this.colors.dimText;
            ctx.font = `${isSelected ? '12' : '10'}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(star.name.toUpperCase(), projected.x, projected.y + radius + 15);
        }
    }

    /**
     * Draw NGE-style target brackets
     */
    drawTargetBrackets(x, y, size) {
        const ctx = this.ctx;
        ctx.strokeStyle = this.colors.secondary;
        ctx.lineWidth = 2;

        const len = 8;
        const corners = [
            { x: x - size, y: y - size, dx: len, dy: 0, dx2: 0, dy2: len },
            { x: x + size, y: y - size, dx: -len, dy: 0, dx2: 0, dy2: len },
            { x: x - size, y: y + size, dx: len, dy: 0, dx2: 0, dy2: -len },
            { x: x + size, y: y + size, dx: -len, dy: 0, dx2: 0, dy2: -len }
        ];

        for (const c of corners) {
            ctx.beginPath();
            ctx.moveTo(c.x + c.dx, c.y);
            ctx.lineTo(c.x, c.y);
            ctx.lineTo(c.x, c.y + c.dy2);
            ctx.stroke();
        }
    }

    /**
     * Get star color from spectral class
     */
    getStarColor(spectralClass) {
        const colors = {
            O: '#9bb0ff',
            B: '#aabfff',
            A: '#cad7ff',
            F: '#f8f7ff',
            G: '#fff4e8',
            K: '#ffd2a1',
            M: '#ffcc6f'
        };
        return colors[spectralClass] || '#ffffff';
    }

    /**
     * Draw UI overlays
     */
    drawOverlays() {
        const ctx = this.ctx;

        // Top-left corner info
        ctx.fillStyle = this.colors.primary;
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`ORIGIN: ${this.currentSystem.toUpperCase()}`, 10, 20);
        ctx.fillText(`ZOOM: ${(this.zoom / 30 * 100).toFixed(0)}%`, 10, 35);

        // Corner decorations
        this.drawCornerDecoration(0, 0);
        this.drawCornerDecoration(this.width, 0, true);
        this.drawCornerDecoration(0, this.height, false, true);
        this.drawCornerDecoration(this.width, this.height, true, true);
    }

    /**
     * Draw NGE-style corner decoration
     */
    drawCornerDecoration(x, y, flipX = false, flipY = false) {
        const ctx = this.ctx;
        ctx.strokeStyle = this.colors.primary;
        ctx.lineWidth = 1;

        const dx = flipX ? -1 : 1;
        const dy = flipY ? -1 : 1;

        ctx.beginPath();
        ctx.moveTo(x, y + 20 * dy);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 20 * dx, y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x + 5 * dx, y + 5 * dy);
        ctx.lineTo(x + 5 * dx, y + 15 * dy);
        ctx.stroke();
    }

    /**
     * Update target display panel
     */
    updateTargetDisplay() {
        const display = document.getElementById('target-display');
        if (!display || !this.selectedStar) return;

        const star = this.selectedStar;
        const isColonized = this._isColonized(star.id);

        display.innerHTML = `
            <div class="nge-target-name">${star.name.toUpperCase()}</div>
            <div class="nge-target-row">
                <span class="nge-label-sm">TYPE</span>
                <span class="nge-value">${star.type}</span>
            </div>
            <div class="nge-target-row">
                <span class="nge-label-sm">DISTANCE</span>
                <span class="nge-value">${star.distance_ly.toFixed(2)} LY</span>
            </div>
            <div class="nge-target-row">
                <span class="nge-label-sm">LUMINOSITY</span>
                <span class="nge-value">${star.luminosity_solar.toFixed(4)} L☉</span>
            </div>
            <div class="nge-target-row">
                <span class="nge-label-sm">STATUS</span>
                <span class="nge-value ${isColonized ? 'colonized' : ''}">${isColonized ? 'COLONIZED' : 'UNCHARTED'}</span>
            </div>
        `;
    }

    /**
     * Update travel calculation display
     */
    updateTravelDisplay() {
        const display = document.getElementById('travel-display');
        if (!display || !this.selectedStar) return;

        const travel = this.relativisticTravel.calculateTravel(
            this.selectedStar.distance_ly,
            this.accel_g
        );

        display.innerHTML = `
            <div class="nge-travel-grid">
                <div class="nge-travel-item">
                    <div class="nge-travel-label">SHIP TIME</div>
                    <div class="nge-travel-value primary">${travel.ship_time.formatted}</div>
                </div>
                <div class="nge-travel-item">
                    <div class="nge-travel-label">EARTH TIME</div>
                    <div class="nge-travel-value">${travel.earth_time.formatted}</div>
                </div>
                <div class="nge-travel-item">
                    <div class="nge-travel-label">MAX VELOCITY</div>
                    <div class="nge-travel-value">${(travel.max_velocity.percent_c).toFixed(1)}% c</div>
                </div>
                <div class="nge-travel-item">
                    <div class="nge-travel-label">γ FACTOR</div>
                    <div class="nge-travel-value">${travel.gamma.toFixed(2)}</div>
                </div>
            </div>
            ${travel.relativistic ? '<div class="nge-warning blink">⚠ RELATIVISTIC EFFECTS SIGNIFICANT</div>' : ''}
        `;
    }

    /**
     * Update time dilation graph
     */
    updateDilationGraph() {
        if (!this.dilationCtx || !this.selectedStar) return;

        const ctx = this.dilationCtx;
        const w = 280;
        const h = 120;

        // Clear
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, w, h);

        // Generate curve data
        const maxDist = Math.max(this.selectedStar.distance_ly * 1.5, 15);
        const curve = this.relativisticTravel.generateDilationCurve(maxDist, this.accel_g, 50);

        // Find scales
        const maxShipTime = Math.max(...curve.map(p => p.shipTime));
        const maxEarthTime = Math.max(...curve.map(p => p.earthTime));

        // Draw grid
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 4; i++) {
            const y = 10 + (h - 30) * (i / 4);
            ctx.beginPath();
            ctx.moveTo(30, y);
            ctx.lineTo(w - 10, y);
            ctx.stroke();
        }

        // Draw Earth time curve (dimmer)
        ctx.strokeStyle = this.colors.dimText;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < curve.length; i++) {
            const x = 30 + (curve[i].distance / maxDist) * (w - 40);
            const y = h - 20 - (curve[i].earthTime / maxEarthTime) * (h - 40);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Draw Ship time curve (bright)
        ctx.strokeStyle = this.colors.secondary;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < curve.length; i++) {
            const x = 30 + (curve[i].distance / maxDist) * (w - 40);
            const y = h - 20 - (curve[i].shipTime / maxEarthTime) * (h - 40);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Mark target distance
        const targetX = 30 + (this.selectedStar.distance_ly / maxDist) * (w - 40);
        ctx.strokeStyle = this.colors.primary;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(targetX, 10);
        ctx.lineTo(targetX, h - 20);
        ctx.stroke();
        ctx.setLineDash([]);

        // Labels
        ctx.fillStyle = this.colors.text;
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('τ (ship)', 5, 15);
        ctx.fillStyle = this.colors.dimText;
        ctx.fillText('t (earth)', 5, 25);

        ctx.textAlign = 'center';
        ctx.fillStyle = this.colors.dimText;
        ctx.fillText('DISTANCE (ly)', w / 2, h - 3);
    }

    /**
     * Update launch button state
     */
    updateLaunchButton() {
        const btn = document.getElementById('btn-launch');
        if (!btn) return;

        const sub = btn.querySelector('.nge-launch-sub');
        const isColonized = this.selectedStar && this._isColonized(this.selectedStar.id);

        if (!this.selectedStar) {
            btn.disabled = true;
            if (sub) sub.textContent = 'AWAITING TARGET';
        } else if (isColonized) {
            btn.disabled = true;
            if (sub) sub.textContent = 'ALREADY COLONIZED';
        } else {
            btn.disabled = false;
            const travel = this.relativisticTravel.calculateTravel(
                this.selectedStar.distance_ly,
                this.accel_g
            );
            if (sub) sub.textContent = `ETA: ${travel.ship_time.formatted} (SHIP)`;
        }
    }

    /**
     * Set drive tier
     */
    setDriveTier(tier) {
        const drive = this.relativisticTravel.getDriveTier(tier);
        this.driveTier = tier;
        this.accel_g = drive.accel_g;

        // Update display
        document.getElementById('drive-name').textContent = drive.name.toUpperCase();
        document.getElementById('drive-accel').textContent = drive.accel_g.toFixed(2);
        document.getElementById('drive-tier').textContent = tier;

        // Update calculations if target selected
        if (this.selectedStar) {
            this.updateTravelDisplay();
            this.updateDilationGraph();
            this.updateLaunchButton();
        }
    }

    /**
     * Launch transfer to selected star
     */
    launchTransfer() {
        if (!this.selectedStar) return;

        const travel = this.relativisticTravel.calculateTravel(
            this.selectedStar.distance_ly,
            this.accel_g
        );

        // Callback for main game to handle
        if (this.onTransferInitiated) {
            this.onTransferInitiated(this.selectedStar.id, 1000); // Default 1000 probes
        }

        // Reset selection
        this.selectedStar = null;
        this.updateLaunchButton();
    }

    /**
     * Set current system
     */
    setCurrentSystem(systemId) {
        this.currentSystem = systemId;
    }

    /**
     * Show the interstellar navigation panel
     */
    show() {
        if (this.container) {
            this.container.style.display = 'block';
            this.isVisible = true;

            // Auto-initialize if not done yet
            // Check if starMapVisualization is available as data source
            if (!this._initialized && !window.starMapVisualization?.starData) {
                this.autoInitialize();
            }
            this._initialized = true;

            // Resume animation
            if (!this.animationFrame) {
                this.startAnimation();
            }
        }
    }

    /**
     * Hide the interstellar navigation panel
     */
    hide() {
        if (this.container) {
            this.container.style.display = 'none';
            this.isVisible = false;
        }
    }

    /**
     * Toggle visibility
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Auto-initialize (GalaxySystem deprecated - uses starMapVisualization)
     */
    async autoInitialize() {
        try {
            // NOTE: GalaxySystem is deprecated
            // Star data now comes from window.starMapVisualization
            // If starMapVisualization isn't ready, wait for it
            if (!window.starMapVisualization?.starData) {
                console.log('[InterstellarNav] Waiting for starMapVisualization...');
                // Wait up to 5 seconds for star map to initialize
                for (let i = 0; i < 50; i++) {
                    if (window.starMapVisualization?.starData) break;
                    await new Promise(r => setTimeout(r, 100));
                }
            }

            // Initialize the UI
            this.createUI();
            this.setupEventListeners();

            // Get propulsion tier from game state if available
            const gameState = window.gameEngine?.getGameState?.() || {};
            const propulsionTier = this.getPropulsionTierFromState(gameState);
            const driveTier = this.relativisticTravel.propulsionToDriveTier(propulsionTier);
            this.setDriveTier(driveTier);

            console.log('[InterstellarNav] Initialized with propulsion tier', propulsionTier, '-> drive tier', driveTier);
        } catch (error) {
            console.error('[InterstellarNav] Failed to auto-initialize:', error);
        }
    }

    /**
     * Get propulsion tier from game state
     */
    getPropulsionTierFromState(gameState) {
        // Check research state for highest completed propulsion tier
        const research = gameState.research || {};
        const propulsion = research.propulsion || {};

        // Count completed tiers
        let maxTier = 1;
        for (const [techId, techState] of Object.entries(propulsion)) {
            if (techState.completed) {
                // Estimate tier from tech position (this is approximate)
                // In reality, we'd need to look up the tech tree
                maxTier++;
            }
        }

        // Also check for direct tier indicator if available
        if (gameState.propulsion_tier) {
            maxTier = Math.max(maxTier, gameState.propulsion_tier);
        }

        return Math.min(maxTier, 18);
    }

    /**
     * Update from game state (called by UI update loop)
     */
    updateFromGameState(gameState) {
        if (!gameState) return;

        // Update drive tier based on propulsion research
        const propulsionTier = this.getPropulsionTierFromState(gameState);
        const driveTier = this.relativisticTravel.propulsionToDriveTier(propulsionTier);

        if (driveTier !== this.driveTier) {
            this.setDriveTier(driveTier);
        }
    }

    /**
     * Clean up
     */
    destroy() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InterstellarNav;
}

if (typeof window !== 'undefined') {
    window.InterstellarNav = InterstellarNav;
}
