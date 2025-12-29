/**
 * Trajectory Planner Panel
 * 
 * A 2D graphical display showing transfer trajectories overlaid on the solar system.
 * Shows conventional Hohmann transfer and optimized Lambert trajectories.
 */
class TrajectoryPlanner {
    constructor() {
        this.panel = null;
        this.canvas = null;
        this.ctx = null;
        this.isVisible = false;
        
        // Current transfer data
        this.fromZone = null;
        this.toZone = null;
        this.orbitalZones = null;
        this.resourceType = 'probe'; // 'probe', 'metal', or 'methalox'
        
        // Trajectory data
        this.hohmannTrajectory = null;
        this.optimizedTrajectory = null;  // Backend-computed trajectory for probe mode
        this.isFetchingTrajectory = false;
        
        // Animation loop
        this.animationFrameId = null;
        
        // Colors (neon theme matching delta-v chart)
        this.colors = {
            background: '#000000',
            grid: 'rgba(255, 255, 255, 0.1)',
            gridLabel: 'rgba(255, 255, 255, 0.5)',
            sun: '#ffcc00',
            sunGlow: 'rgba(255, 200, 0, 0.3)',
            hohmann: '#00ffff',        // Cyan for Hohmann
            optimized: '#ff00ff',      // Magenta for optimized
            gravityAssist: '#ff8800',  // Orange for gravity assist
            planets: {
                mercury: '#8c7853',
                venus: '#ffc649',
                earth: '#6b93d6',
                mars: '#cd5c5c',
                asteroid_belt: '#9e9e9e',
                jupiter: '#d8ca9d',
                saturn: '#fad5a5',
                uranus: '#4fd0e7',
                neptune: '#4166f5',
                kuiper: '#4b0082',
                oort_cloud: '#1a1a2e',
                dyson_sphere: '#ffd700'
            },
            sourceZone: '#00ff00',     // Green for source
            destZone: '#ff4444'        // Red for destination
        };
        
        // Canvas dimensions (narrowed by 40px from original 350)
        this.width = 310;
        this.height = 280;  // Reduced for delta-v chart below
        this.deltaVChartHeight = 120;  // Height of the relative delta-v chart
        this.padding = 20;
    }
    
    /**
     * Initialize the trajectory planner panel
     */
    init() {
        this.createPanel();
        this.loadOrbitalZones();
    }
    
    /**
     * Load orbital zones data
     */
    async loadOrbitalZones() {
        try {
            const response = await fetch('/game_data/orbital_mechanics.json');
            const data = await response.json();
            this.orbitalZones = data.orbital_zones || [];
        } catch (error) {
            console.error('Failed to load orbital zones for trajectory planner:', error);
        }
    }
    
    /**
     * Create the panel DOM structure with delta-v overlay styling
     */
    createPanel() {
        // Create panel container with inline styles matching delta-v overlay
        this.panel = document.createElement('div');
        this.panel.className = 'trajectory-planner-panel';
        this.panel.id = 'trajectory-planner-panel';
        
        // Apply inline styles for positioning (left edge, below compact resources bar)
        this.panel.style.cssText = `
            position: fixed;
            top: 60px;
            left: 10px;
            width: ${this.width}px;
            background: rgba(0, 0, 0, 0.9);
            backdrop-filter: blur(5px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
            z-index: 1001;
            display: flex;
            flex-direction: column;
            pointer-events: auto;
            opacity: 0;
            visibility: hidden;
            transform: translateX(-20px);
            transition: all 0.3s ease;
        `;
        
        // Create header with bold color title bar (matching delta-v overlay style)
        const header = document.createElement('div');
        header.id = 'trajectory-planner-header';
        header.style.cssText = `
            padding: 10px 16px;
            display: flex;
            justify-content: center;
            align-items: center;
            background: #00ffff;
            border-radius: 4px 4px 0 0;
            position: relative;
        `;
        
        const title = document.createElement('div');
        title.id = 'trajectory-planner-title';
        title.textContent = 'TRAJECTORY PLANNER';
        title.style.cssText = `
            font-family: monospace;
            font-size: 12px;
            font-weight: bold;
            color: #000;
            text-transform: uppercase;
            letter-spacing: 1px;
            text-align: center;
        `;
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            background: transparent;
            border: none;
            color: rgba(0, 0, 0, 0.6);
            font-size: 18px;
            cursor: pointer;
            padding: 0;
            width: 20px;
            height: 20px;
            line-height: 1;
            transition: color 0.2s;
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
        `;
        closeBtn.onmouseover = () => closeBtn.style.color = 'rgba(0, 0, 0, 1)';
        closeBtn.onmouseout = () => closeBtn.style.color = 'rgba(0, 0, 0, 0.6)';
        closeBtn.onclick = () => this.hide();
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        
        // Create body container
        const body = document.createElement('div');
        body.className = 'trajectory-planner-body';
        body.style.cssText = `
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        
        // Create canvas for orbital visualization
        const canvas = document.createElement('canvas');
        canvas.id = 'trajectory-planner-canvas';
        canvas.width = this.width - 24; // Account for padding
        canvas.height = this.height;
        canvas.style.cssText = `
            display: block;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            background: #000000;
            width: 100%;
        `;
        
        // Create canvas for delta-v chart
        const deltaVCanvas = document.createElement('canvas');
        deltaVCanvas.id = 'trajectory-deltav-canvas';
        deltaVCanvas.width = this.width - 24;
        deltaVCanvas.height = this.deltaVChartHeight;
        deltaVCanvas.style.cssText = `
            display: block;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            background: #000000;
            width: 100%;
        `;
        
        // Create info section
        const infoDiv = document.createElement('div');
        infoDiv.className = 'trajectory-planner-info';
        infoDiv.style.cssText = `
            padding: 10px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 4px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;
        infoDiv.innerHTML = `
            <div class="trajectory-info-row" style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 11px; font-family: monospace;">
                <span class="trajectory-label" style="color: rgba(255,255,255,0.7);">delta-vee:</span>
                <span class="trajectory-value" id="trajectory-delta-v" style="color: #fff; font-weight: 600;">--</span>
            </div>
            <div class="trajectory-info-row" style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 11px; font-family: monospace; border-top: 1px solid rgba(255,255,255,0.05); margin-top: 4px;">
                <span class="trajectory-label" style="color: rgba(255,255,255,0.7);">fuel cost:</span>
                <span class="trajectory-value" id="trajectory-fuel-cost" style="color: #fff; font-weight: 600;">--</span>
            </div>
            <div class="trajectory-info-row" style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 11px; font-family: monospace; border-top: 1px solid rgba(255,255,255,0.05); margin-top: 4px;">
                <span class="trajectory-label" style="color: rgba(255,255,255,0.7);">estimated time:</span>
                <span class="trajectory-value" id="trajectory-time" style="color: #fff; font-weight: 600;">--</span>
            </div>
            <div class="trajectory-info-row" id="trajectory-time-savings-row" style="display: none; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 11px; font-family: monospace; border-top: 1px solid rgba(255,255,255,0.05); margin-top: 4px;">
                <span class="trajectory-label" style="color: rgba(255,255,255,0.7);">time savings:</span>
                <span class="trajectory-value" id="trajectory-time-savings" style="color: #4aff4a; font-weight: 600;">--</span>
            </div>
        `;
        
        // Assemble the panel
        body.appendChild(canvas);
        body.appendChild(deltaVCanvas);
        body.appendChild(infoDiv);
        
        this.panel.appendChild(header);
        this.panel.appendChild(body);
        
        // Add to document but keep hidden
        document.body.appendChild(this.panel);
        
        // Get canvas references
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.deltaVCanvas = deltaVCanvas;
        this.deltaVCtx = deltaVCanvas.getContext('2d');
        
        // Update canvas dimensions to match actual element
        this.width = canvas.width;
    }
    
    /**
     * Show the trajectory planner panel
     * @param {string} fromZoneId - Source zone ID
     * @param {string} toZoneId - Destination zone ID (optional)
     * @param {string} resourceType - Resource type: 'probe', 'metal', or 'methalox'
     */
    show(fromZoneId, toZoneId = null, resourceType = 'probe') {
        this.fromZone = fromZoneId;
        this.toZone = toZoneId;
        this.resourceType = resourceType;
        this.hohmannTrajectory = null;
        this.optimizedTrajectory = null;
        
        // Reset info display
        const deltaVEl = document.getElementById('trajectory-delta-v');
        const fuelCostEl = document.getElementById('trajectory-fuel-cost');
        const timeEl = document.getElementById('trajectory-time');
        const timeSavingsEl = document.getElementById('trajectory-time-savings');
        const timeSavingsRow = document.getElementById('trajectory-time-savings-row');
        
        if (deltaVEl) deltaVEl.textContent = '--';
        if (fuelCostEl) fuelCostEl.textContent = '--';
        if (timeEl) timeEl.textContent = '--';
        if (timeSavingsEl) timeSavingsEl.textContent = '--';
        if (timeSavingsRow) timeSavingsRow.style.display = 'none';
        
        // Position panel at the left edge of the screen, below the compact resources bar
        // Get the compact resources bar offset if it exists
        const compactBar = document.querySelector('.compact-resources-bar');
        const topOffset = compactBar ? compactBar.offsetHeight + compactBar.offsetTop + 10 : 60;
        
        this.panel.style.top = `${topOffset}px`;
        this.panel.style.left = '10px';
        
        // Show the panel with animation
        this.panel.style.opacity = '1';
        this.panel.style.visibility = 'visible';
        this.panel.style.transform = 'translateX(0)';
        this.isVisible = true;
        
        // Draw initial state
        this.draw();
        
        // Calculate Hohmann trajectory immediately
        if (fromZoneId && toZoneId) {
            this.calculateHohmannTrajectory();
        }
        
        // Start animation loop to update planet positions in real-time
        this.startAnimationLoop();
    }
    
    /**
     * Start the animation loop to update planet positions
     */
    startAnimationLoop() {
        // Cancel any existing animation
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        const animate = () => {
            if (!this.isVisible) return;
            
            // Redraw the visualization with updated planet positions
            this.draw();
            
            // Recalculate trajectory if we have both zones
            if (this.fromZone && this.toZone && this.hohmannTrajectory) {
                // Regenerate trajectory points with current positions
                const fromZoneData = this.orbitalZones?.find(z => z.id === this.fromZone);
                const toZoneData = this.orbitalZones?.find(z => z.id === this.toZone);
                
                if (fromZoneData && toZoneData) {
                    const fromAngle = this.getZoneOrbitalAngle(this.fromZone);
                    const toAngle = this.getZoneOrbitalAngle(this.toZone);
                    
                    this.hohmannTrajectory.points = this.generateHohmannPoints(
                        fromZoneData.radius_au,
                        toZoneData.radius_au,
                        fromAngle,
                        toAngle,
                        50
                    );
                }
            }
            
            this.animationFrameId = requestAnimationFrame(animate);
        };
        
        this.animationFrameId = requestAnimationFrame(animate);
    }
    
    /**
     * Stop the animation loop
     */
    stopAnimationLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    
    /**
     * Hide the trajectory planner panel
     */
    hide() {
        // Stop animation loop
        this.stopAnimationLoop();
        
        if (this.panel) {
            this.panel.style.opacity = '0';
            this.panel.style.visibility = 'hidden';
            this.panel.style.transform = 'translateX(-20px)';
        }
        this.isVisible = false;
        this.fromZone = null;
        this.toZone = null;
        this.hohmannTrajectory = null;
        this.optimizedTrajectory = null;
    }
    
    /**
     * Update the destination zone
     * @param {string} toZoneId - New destination zone ID
     * @param {string} resourceType - Optional resource type update
     */
    updateDestination(toZoneId, resourceType = null) {
        this.toZone = toZoneId;
        this.optimizedTrajectory = null;
        if (resourceType) {
            this.resourceType = resourceType;
        }
        
        // Reset optimized display (if elements exist)
        const optimizedInfo = document.querySelector('.optimized-info');
        const savingsInfo = document.querySelector('.savings-info');
        if (optimizedInfo) optimizedInfo.style.display = 'none';
        if (savingsInfo) savingsInfo.style.display = 'none';
        
        // Recalculate trajectory based on destination type
        if (this.fromZone && toZoneId) {
            // Check if destination requires Hohmann (dyson, asteroid, kuiper)
            const useHohmann = this.shouldUseHohmann(toZoneId);
            
            if (useHohmann) {
                // Use Hohmann for dyson/asteroid/kuiper
                this.calculateHohmannTrajectory();
                this.optimizedTrajectory = null;
            } else {
                // For other destinations, calculate Hohmann first, then fetch backend trajectory
                this.calculateHohmannTrajectory();
                
                // For probe mode, automatically fetch backend trajectory
                if (this.resourceType === 'probe') {
                    this.fetchBackendTrajectory();
                }
            }
        }
        
        this.draw();
    }
    
    /**
     * Check if destination should use Hohmann transfer (instead of backend trajectory)
     * Belt zones (Dyson/Asteroid/Kuiper/Oort) use Hohmann since there's no specific planet to rendezvous with
     * @param {string} toZoneId - Destination zone ID
     * @returns {boolean} True if should use Hohmann
     */
    shouldUseHohmann(toZoneId) {
        return toZoneId === 'dyson_sphere' || 
               toZoneId === 'dyson' ||
               toZoneId === 'asteroid_belt' || 
               toZoneId === 'kuiper' ||
               toZoneId === 'oort_cloud';
    }
    
    /**
     * Update the resource type
     * @param {string} resourceType - 'probe', 'metal', or 'methalox'
     */
    updateResourceType(resourceType) {
        this.resourceType = resourceType;
        this.optimizedTrajectory = null;
        
        // For probe mode, fetch backend trajectory if destination is set and not Hohmann-only
        if (resourceType === 'probe' && this.fromZone && this.toZone) {
            if (!this.shouldUseHohmann(this.toZone)) {
                this.fetchBackendTrajectory();
            }
        }
        
        this.draw();
    }
    
    /**
     * Fetch the computed trajectory from the backend
     */
    async fetchBackendTrajectory() {
        if (!this.fromZone || !this.toZone || this.isFetchingTrajectory) return;
        
        console.log(`[TrajectoryPlanner] Fetching backend trajectory: ${this.fromZone} → ${this.toZone}`);
        this.isFetchingTrajectory = true;
        
        try {
            const gameTime = window.gameEngine?.getState?.()?.time || 0;
            const planetPositions = this.getAllPlanetPositions();
            
            // Verify destination position is included
            if (planetPositions[this.toZone]) {
                const destPos = planetPositions[this.toZone];
                console.log(`[TrajectoryPlanner] Destination ${this.toZone} position: [${destPos[0].toFixed(4)}, ${destPos[1].toFixed(4)}] AU`);
            } else {
                console.warn(`[TrajectoryPlanner] WARNING: Destination ${this.toZone} position not found in planetPositions!`);
            }
            
            console.log('[TrajectoryPlanner] Calling API with positions:', Object.keys(planetPositions));
            
            // Fetch single trajectory for the selected destination
            const response = await api.computeTrajectory(
                this.fromZone,
                this.toZone,
                gameTime,
                60,  // num_points
                planetPositions
            );
            
            console.log('[TrajectoryPlanner] API response:', response);
            
            // Handle nested response format: {success, trajectory: {...}}
            const trajectoryData = response.trajectory || response;
            const trajectoryPoints = trajectoryData.trajectory_points_au;
            
            if (trajectoryPoints && trajectoryPoints.length > 0) {
                // Convert trajectory points to our format
                const points = trajectoryPoints.map(([x, y]) => ({
                    x: x,
                    y: y,
                    r_au: Math.sqrt(x * x + y * y)
                }));
                
                console.log(`[TrajectoryPlanner] Received ${points.length} trajectory points, deltaV: ${trajectoryData.delta_v_km_s}`);
                
                // Get base transfer time from backend solver
                let baseTransferTime = trajectoryData.transfer_time_days || 0;
                
                // Apply speed bonuses from excess delta-v if orbital mechanics available
                let improvedTransferTime = baseTransferTime;
                if (window.orbitalZoneSelector?.orbitalMechanics && this.fromZone && this.toZone) {
                    const gameState = window.gameEngine?.getState?.() || {};
                    const skills = gameState?.skills || {};
                    const probeDvBonus = gameState?.skill_bonuses?.probe_dv_bonus || 0;
                    
                    // Get required delta-v (from backend solver result)
                    const requiredDeltaV = trajectoryData.delta_v_km_s || 0;
                    
                    // Get mass driver muzzle velocity if available
                    let massDriverMuzzleVelocity = 0;
                    if (this.resourceType === 'probe' && window.orbitalZoneSelector?.transferSystem) {
                        const structuresByZone = gameState?.structures_by_zone || {};
                        const zoneStructures = structuresByZone[this.fromZone] || {};
                        const massDriverCount = zoneStructures['mass_driver'] || 0;
                        if (massDriverCount > 0) {
                            massDriverMuzzleVelocity = window.orbitalZoneSelector.transferSystem.getMassDriverMuzzleVelocity(
                                gameState, this.fromZone
                            );
                        }
                    }
                    
                    // Get zone mass for escape velocity calculation
                    const zones = gameState?.zones || {};
                    const fromZoneData = zones[this.fromZone] || {};
                    const fromZoneMass = fromZoneData.mass_remaining !== undefined && fromZoneData.mass_remaining !== null
                        ? fromZoneData.mass_remaining
                        : (this.orbitalZones?.find(z => z.id === this.fromZone)?.total_mass_kg || 0);
                    
                    // Apply speed bonus to backend transfer time
                    improvedTransferTime = window.orbitalZoneSelector.orbitalMechanics.applySpeedBonusToBackendTime(
                        baseTransferTime,
                        requiredDeltaV,
                        skills,
                        massDriverMuzzleVelocity,
                        fromZoneMass,
                        probeDvBonus,
                        this.fromZone,
                        this.toZone
                    );
                    
                    if (improvedTransferTime < baseTransferTime) {
                        const improvement = ((baseTransferTime - improvedTransferTime) / baseTransferTime * 100).toFixed(1);
                        console.log(`[TrajectoryPlanner] Applied speed bonus: ${baseTransferTime.toFixed(2)} days -> ${improvedTransferTime.toFixed(2)} days (${improvement}% faster)`);
                    }
                }
                
                this.optimizedTrajectory = {
                    points: points,
                    deltaV: trajectoryData.delta_v_km_s || 0,
                    transferTime: improvedTransferTime, // Use improved time with speed bonuses
                    baseTransferTime: baseTransferTime, // Store base time for savings calculation
                    arrivalPosition: trajectoryData.arrival_position_au
                };
                
                // Update display with trajectory info
                this.updateTrajectoryInfo();
                
                this.draw();
            }
        } catch (error) {
            console.error('[TrajectoryPlanner] Failed to fetch backend trajectory:', error);
        } finally {
            this.isFetchingTrajectory = false;
        }
    }
    
    /**
     * Calculate the Hohmann transfer trajectory (client-side approximation)
     * Uses actual planet positions to determine optimal launch window
     */
    calculateHohmannTrajectory() {
        if (!this.fromZone || !this.toZone || !this.orbitalZones) return;
        
        const fromZoneData = this.orbitalZones.find(z => z.id === this.fromZone);
        const toZoneData = this.orbitalZones.find(z => z.id === this.toZone);
        
        if (!fromZoneData || !toZoneData) return;
        
        const r1 = fromZoneData.radius_au || 1.0;
        const r2 = toZoneData.radius_au || 1.0;
        
        // Get actual planet orbital angles
        const fromAngle = this.getZoneOrbitalAngle(this.fromZone);
        const toAngle = this.getZoneOrbitalAngle(this.toZone);
        
        // Calculate Hohmann transfer delta-v using orbital mechanics (if available)
        let totalDv = 0;
        const rInner = Math.min(r1, r2);
        const rOuter = Math.max(r1, r2);
        const a = (rInner + rOuter) / 2;
        
        if (window.orbitalZoneSelector?.orbitalMechanics) {
            // Use orbital mechanics method for accurate Hohmann delta-v
            totalDv = window.orbitalZoneSelector.orbitalMechanics.getHohmannDeltaVKmS(this.fromZone, this.toZone);
        } else {
            // Fallback: simplified calculation
            const v1_circ = 29.78 / Math.sqrt(r1); // Circular velocity at r1 (Earth = 29.78 km/s)
            const v2_circ = 29.78 / Math.sqrt(r2);
            
            const v1_transfer = v1_circ * Math.sqrt(2 * r2 / (r1 + r2));
            const v2_transfer = v2_circ * Math.sqrt(2 * r1 / (r1 + r2));
            
            const dv1 = Math.abs(v1_transfer - v1_circ);
            const dv2 = Math.abs(v2_circ - v2_transfer);
            totalDv = dv1 + dv2;
        }
        
        // Generate trajectory points using actual planet positions
        const points = this.generateHohmannPoints(r1, r2, fromAngle, toAngle, 50);
        
        // Calculate transfer time using orbital mechanics (with speed bonus if applicable)
        let transferTime = 0.5 * Math.sqrt(Math.pow(a, 3)) * 365.25; // Base Hohmann transfer time in days
        
        // If we have orbital mechanics available, use the proper calculation with speed bonus
        if (window.orbitalZoneSelector?.orbitalMechanics && this.fromZone && this.toZone) {
            const gameState = window.gameEngine?.getState?.() || {};
            const skills = gameState?.skills || {};
            const probeDvBonus = gameState?.skill_bonuses?.probe_dv_bonus || 0;
            
            // Get mass driver muzzle velocity if available
            let massDriverMuzzleVelocity = 0;
            if (this.resourceType === 'probe' && window.orbitalZoneSelector?.transferSystem) {
                const structuresByZone = gameState?.structures_by_zone || {};
                const zoneStructures = structuresByZone[this.fromZone] || {};
                const massDriverCount = zoneStructures['mass_driver'] || 0;
                if (massDriverCount > 0) {
                    massDriverMuzzleVelocity = window.orbitalZoneSelector.transferSystem.getMassDriverMuzzleVelocity(
                        gameState, this.fromZone
                    );
                }
            }
            
            // Get zone mass for escape velocity calculation
            const zones = gameState?.zones || {};
            const fromZoneData = zones[this.fromZone] || {};
            const fromZoneMass = fromZoneData.mass_remaining !== undefined && fromZoneData.mass_remaining !== null
                ? fromZoneData.mass_remaining
                : (this.orbitalZones?.find(z => z.id === this.fromZone)?.total_mass_kg || 0);
            
            // Use orbital mechanics calculation (includes speed bonus from excess delta-v)
            transferTime = window.orbitalZoneSelector.orbitalMechanics.calculateTransferTimeWithBoost(
                this.fromZone, this.toZone, skills, massDriverMuzzleVelocity, fromZoneMass, probeDvBonus
            );
        }
        
        this.hohmannTrajectory = {
            points: points,
            deltaV: totalDv,
            transferTime: transferTime
        };
        
        // Update display with trajectory info
        this.updateTrajectoryInfo();
        
        this.draw();
    }
    
    /**
     * Update trajectory info display (delta-v, fuel cost, estimated time, time savings)
     */
    updateTrajectoryInfo() {
        const deltaVEl = document.getElementById('trajectory-delta-v');
        const fuelCostEl = document.getElementById('trajectory-fuel-cost');
        const timeEl = document.getElementById('trajectory-time');
        const timeSavingsEl = document.getElementById('trajectory-time-savings');
        const timeSavingsRow = document.getElementById('trajectory-time-savings-row');
        
        if (!deltaVEl || !fuelCostEl || !timeEl) return;
        
        // Determine which trajectory to use
        const useHohmann = this.toZone && this.shouldUseHohmann(this.toZone);
        const trajectory = useHohmann ? this.hohmannTrajectory : (this.optimizedTrajectory || this.hohmannTrajectory);
        
        if (!trajectory) {
            deltaVEl.textContent = '--';
            fuelCostEl.textContent = '--';
            timeEl.textContent = '--';
            if (timeSavingsEl) timeSavingsEl.textContent = '--';
            if (timeSavingsRow) timeSavingsRow.style.display = 'none';
            return;
        }
        
        // Display delta-v
        deltaVEl.textContent = `${trajectory.deltaV.toFixed(2)} km/s`;
        
        // Calculate fuel cost (for probe transfers)
        if (this.resourceType === 'probe' && this.fromZone && this.toZone) {
            const gameState = window.gameEngine?.getState?.() || {};
            const skills = gameState?.skills || {};
            const transferSystem = window.orbitalZoneSelector?.transferSystem;
            
            if (transferSystem) {
                const probeMass = transferSystem.getProbeMass();
                const fuelRequired = transferSystem.calculateFuelRequired(
                    this.fromZone, 
                    this.toZone, 
                    probeMass, 
                    skills, 
                    gameState
                );
                fuelCostEl.textContent = `${fuelRequired.toFixed(2)} kg`;
            } else {
                fuelCostEl.textContent = '--';
            }
        } else {
            fuelCostEl.textContent = 'N/A';
        }
        
        // Display estimated time and calculate time savings from delta-v bonus
        let baseTransferTime = null;
        let improvedTransferTime = trajectory.transferTime;
        
        // For optimized trajectories, compare base backend time to improved time
        if (this.optimizedTrajectory && !useHohmann && this.optimizedTrajectory.baseTransferTime) {
            baseTransferTime = this.optimizedTrajectory.baseTransferTime;
            improvedTransferTime = this.optimizedTrajectory.transferTime;
        }
        
        if (trajectory.transferTime) {
            const days = trajectory.transferTime;
            if (days < 1) {
                timeEl.textContent = `${(days * 24).toFixed(1)} hours`;
            } else if (days < 365.25) {
                timeEl.textContent = `${days.toFixed(1)} days`;
            } else {
                const years = days / 365.25;
                timeEl.textContent = `${years.toFixed(2)} years`;
            }
            
            // Show time savings if we have a base time to compare
            if (baseTransferTime && baseTransferTime > improvedTransferTime && timeSavingsEl && timeSavingsRow) {
                const savings = baseTransferTime - improvedTransferTime;
                const savingsPercent = ((savings / baseTransferTime) * 100).toFixed(1);
                
                if (savings < 1) {
                    timeSavingsEl.textContent = `${(savings * 24).toFixed(1)} hours (${savingsPercent}%)`;
                } else if (savings < 365.25) {
                    timeSavingsEl.textContent = `${savings.toFixed(1)} days (${savingsPercent}%)`;
                } else {
                    const savingsYears = savings / 365.25;
                    timeSavingsEl.textContent = `${savingsYears.toFixed(2)} years (${savingsPercent}%)`;
                }
                timeSavingsRow.style.display = 'flex';
            } else if (timeSavingsRow) {
                timeSavingsRow.style.display = 'none';
            }
        } else {
            timeEl.textContent = '--';
            if (timeSavingsRow) timeSavingsRow.style.display = 'none';
        }
    }
    
    /**
     * Generate points along a Hohmann transfer ellipse using actual planet positions
     * @param {number} r1_au - Source orbit radius in AU
     * @param {number} r2_au - Destination orbit radius in AU
     * @param {number} fromAngle - Source planet's current orbital angle (radians)
     * @param {number} toAngle - Destination planet's current orbital angle (radians)
     * @param {number} numPoints - Number of points to generate
     */
    generateHohmannPoints(r1_au, r2_au, fromAngle, toAngle, numPoints) {
        const points = [];
        const isOutbound = r2_au > r1_au;
        
        // Calculate Hohmann transfer semi-major axis
        const rInner = Math.min(r1_au, r2_au);
        const rOuter = Math.max(r1_au, r2_au);
        const a = (rInner + rOuter) / 2;
        const e = (rOuter - rInner) / (rOuter + rInner);
        
        // The transfer starts at the source planet's current position
        // For Hohmann, the transfer arc spans π radians (half the ellipse)
        const startAngle = fromAngle;
        
        // Determine the direction of the transfer arc
        // For outbound (going to larger orbit): periapsis at start, apoapsis at end
        // For inbound (going to smaller orbit): apoapsis at start, periapsis at end
        
        for (let i = 0; i <= numPoints; i++) {
            const t = i / numPoints;
            
            // True anomaly along the transfer ellipse
            // For Hohmann: 0 → π for outbound, π → 0 for inbound
            let trueAnomaly;
            if (isOutbound) {
                trueAnomaly = t * Math.PI; // 0 to π (periapsis to apoapsis)
            } else {
                trueAnomaly = Math.PI - t * Math.PI; // π to 0 (apoapsis to periapsis)
            }
            
            // Radius from ellipse equation: r = a(1-e²)/(1 + e*cos(ν))
            const r = a * (1 - e * e) / (1 + e * Math.cos(trueAnomaly));
            
            // Calculate the position angle in space
            // The transfer arc rotates around the sun, starting from the source position
            // For outbound: arc goes in the direction of orbital motion (counterclockwise)
            // For inbound: arc also goes counterclockwise (prograde transfer)
            const theta = startAngle + t * Math.PI;
            
            points.push({
                x: r * Math.cos(theta),
                y: r * Math.sin(theta),
                r_au: r
            });
        }
        
        return points;
    }
    
    /**
     * Get all current planet positions from the solar system visualization
     * @returns {Object} Dictionary of zone positions {zoneId: [x, y]}
     */
    getAllPlanetPositions() {
        const positions = {};
        
        if (!this.orbitalZones) return positions;
        
        const solarSystem = window.app?.solarSystem;
        
        // Include ALL zones - planets, belts, and dyson sphere
        for (const zone of this.orbitalZones) {
            const angle = this.getZoneOrbitalAngle(zone.id);
            const x = zone.radius_au * Math.cos(angle);
            const y = zone.radius_au * Math.sin(angle);
            positions[zone.id] = [x, y];
        }
        
        console.log('[Trajectory Planner] Current planet positions:', Object.keys(positions));
        return positions;
    }
    
    /**
     * Convert AU to canvas coordinates
     */
    auToCanvas(x_au, y_au) {
        // Find the maximum radius we need to display
        const maxRadius = Math.max(
            ...(this.orbitalZones || []).map(z => z.radius_au || 1)
        ) * 1.1;
        
        // Use logarithmic scaling for outer solar system
        const MARS_AU = 1.52;
        const scaleRadius = (r_au) => {
            if (r_au <= MARS_AU) {
                // Linear for inner solar system
                return (r_au / MARS_AU) * 0.3;
            } else {
                // Logarithmic for outer solar system
                const logNorm = (Math.log(r_au) - Math.log(MARS_AU)) / 
                                (Math.log(maxRadius) - Math.log(MARS_AU));
                return 0.3 + 0.7 * logNorm;
            }
        };
        
        const r_au = Math.sqrt(x_au * x_au + y_au * y_au);
        const theta = Math.atan2(y_au, x_au);
        
        const scaledR = scaleRadius(r_au);
        
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const maxVisualR = Math.min(this.width, this.height) / 2 - this.padding;
        
        const visualR = scaledR * maxVisualR;
        
        return {
            x: centerX + visualR * Math.cos(theta),
            y: centerY - visualR * Math.sin(theta)  // Flip Y for canvas
        };
    }
    
    /**
     * Draw the trajectory planner visualization
     */
    draw() {
        const ctx = this.ctx;
        if (!ctx) return;
        
        // Clear canvas
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw grid (concentric circles for orbital distances)
        this.drawGrid();
        
        // Draw sun
        this.drawSun();
        
        // Draw planetary orbits
        this.drawOrbits();
        
        // Draw trajectories based on resource type and destination
        const useHohmann = this.toZone && this.shouldUseHohmann(this.toZone);
        
        if (this.resourceType === 'probe' && !useHohmann) {
            // Probe mode (non-Hohmann destinations): only show computed trajectory, no Hohmann fallback
            if (this.optimizedTrajectory) {
                // Determine if transfer is possible
                const isReachable = this.isTransferPossible();
                const trajectoryColor = isReachable ? '#00ff00' : '#ff4444'; // Green if possible, red if not
                // Draw computed trajectory
                this.drawTrajectory(this.optimizedTrajectory.points, trajectoryColor, 3);
            }
            // Don't show Hohmann trajectory in probe mode for non-Hohmann destinations
        } else {
            // Hohmann-only mode (dyson/asteroid/kuiper) or Metal/Methalox mode: only show Hohmann trajectory
            if (this.hohmannTrajectory) {
                this.drawTrajectory(this.hohmannTrajectory.points, this.colors.hohmann, 2);
            }
        }
        
        // Draw planets (on top of trajectories)
        this.drawPlanets();
        
        // Draw source and destination markers
        this.drawZoneMarkers();
        
        // Draw the relative delta-v chart
        this.drawRelativeDeltaVChart();
    }
    
    /**
     * Draw grid lines
     */
    drawGrid() {
        const ctx = this.ctx;
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const maxR = Math.min(this.width, this.height) / 2 - this.padding;
        
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 1;
        
        // Draw radial grid lines
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
                centerX + maxR * Math.cos(angle),
                centerY + maxR * Math.sin(angle)
            );
            ctx.stroke();
        }
    }
    
    /**
     * Draw the sun at center
     */
    drawSun() {
        const ctx = this.ctx;
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        
        // Sun glow
        const gradient = ctx.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, 20
        );
        gradient.addColorStop(0, this.colors.sun);
        gradient.addColorStop(0.5, this.colors.sunGlow);
        gradient.addColorStop(1, 'transparent');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 20, 0, Math.PI * 2);
        ctx.fill();
        
        // Sun core
        ctx.fillStyle = this.colors.sun;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
        ctx.fill();
    }
    
    /**
     * Draw orbital circles for all zones
     */
    drawOrbits() {
        if (!this.orbitalZones) return;
        
        const ctx = this.ctx;
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        
        for (const zone of this.orbitalZones) {
            if (zone.id === 'dyson_sphere') continue;
            
            const pos = this.auToCanvas(zone.radius_au, 0);
            const radius = pos.x - centerX;
            
            // Draw orbit circle
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(centerX, centerY, Math.abs(radius), 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    
    /**
     * Get the current orbital angle for a zone from the solar system visualization
     * @param {string} zoneId - Zone ID
     * @returns {number} Orbital angle in radians
     */
    getZoneOrbitalAngle(zoneId) {
        // Try to get from solar system visualization (accessed via window.app.solarSystem)
        const solarSystem = window.app?.solarSystem;
        if (solarSystem && solarSystem.planets) {
            const planet = solarSystem.planets[zoneId];
            if (planet && planet.userData && planet.userData.orbitalAngle !== undefined) {
                return planet.userData.orbitalAngle;
            }
        }
        
        // Fallback: calculate based on orbital period and game time
        if (this.orbitalZones) {
            const zone = this.orbitalZones.find(z => z.id === zoneId);
            if (zone && zone.orbital_period_days) {
                const gameTime = window.gameEngine?.getState?.()?.time || 0;
                // Convert game time (days) to angle
                const orbitsCompleted = gameTime / zone.orbital_period_days;
                return (orbitsCompleted * 2 * Math.PI) % (2 * Math.PI);
            }
        }
        
        return 0;
    }
    
    /**
     * Draw planet positions
     */
    drawPlanets() {
        if (!this.orbitalZones) return;
        
        const ctx = this.ctx;
        
        for (const zone of this.orbitalZones) {
            if (zone.id === 'dyson_sphere') continue;
            
            // Get current planet orbital angle from visualization
            const angle = this.getZoneOrbitalAngle(zone.id);
            const x_au = zone.radius_au * Math.cos(angle);
            const y_au = zone.radius_au * Math.sin(angle);
            
            const pos = this.auToCanvas(x_au, y_au);
            
            // Draw planet dot
            const color = this.colors.planets[zone.id] || '#ffffff';
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    /**
     * Check if the current transfer is possible based on delta-v capacity
     * @returns {boolean} True if transfer is possible, false otherwise
     */
    isTransferPossible() {
        if (!this.fromZone || !this.toZone) return false;
        
        const gameState = window.gameEngine?.getState?.() || {};
        const skills = gameState?.skills || gameState?.research?.skills || {};
        const probeDvBonus = gameState?.skill_bonuses?.probe_dv_bonus || 0;
        
        // Get probe delta-v capacity
        let probeCapacity = 1.0;
        if (window.orbitalZoneSelector?.orbitalMechanics) {
            probeCapacity = window.orbitalZoneSelector.orbitalMechanics.getProbeDeltaVCapacity(skills, probeDvBonus);
        } else if (window.orbitalZoneSelector?.economicRules?.probe_transfer) {
            const baseCapacity = window.orbitalZoneSelector.economicRules.probe_transfer.base_delta_v_km_s || 1.0;
            probeCapacity = baseCapacity + probeDvBonus;
        }
        
        // Get mass driver capacity if available
        let massDriverCapacity = 0;
        if (window.orbitalZoneSelector?.transferSystem) {
            massDriverCapacity = window.orbitalZoneSelector.transferSystem.getMassDriverMuzzleVelocity(gameState, this.fromZone);
        }
        
        // Get escape velocity at source zone
        let escapeDeltaV = 0;
        if (window.orbitalZoneSelector) {
            const zones = gameState?.zones || {};
            const sourceZone = this.orbitalZones?.find(z => z.id === this.fromZone);
            const fromZoneData = zones[this.fromZone] || {};
            const fromZoneMass = fromZoneData.mass_remaining !== undefined 
                ? fromZoneData.mass_remaining 
                : (sourceZone?.total_mass_kg || 0);
            
            if (window.orbitalZoneSelector.orbitalMechanics) {
                escapeDeltaV = window.orbitalZoneSelector.orbitalMechanics.calculateEscapeDeltaV(this.fromZone, fromZoneMass);
            } else if (window.orbitalZoneSelector.calculateEscapeDeltaV) {
                escapeDeltaV = window.orbitalZoneSelector.calculateEscapeDeltaV(this.fromZone, fromZoneMass);
            }
        }
        
        // Calculate net delta-v
        const totalCapacity = probeCapacity + massDriverCapacity;
        const netDeltaV = totalCapacity - escapeDeltaV;
        
        // Get required delta-v
        let requiredDeltaV = 0;
        if (this.optimizedTrajectory) {
            requiredDeltaV = this.optimizedTrajectory.deltaV || 0;
        } else if (this.hohmannTrajectory) {
            requiredDeltaV = this.hohmannTrajectory.deltaV || 0;
        }
        
        return netDeltaV >= requiredDeltaV;
    }
    
    /**
     * Draw source and destination zone markers
     */
    drawZoneMarkers() {
        if (!this.orbitalZones) return;
        
        const ctx = this.ctx;
        
        // Check if we're in probe mode and destination is not Hohmann-only
        const isProbeMode = this.resourceType === 'probe';
        const useHohmann = this.toZone && this.shouldUseHohmann(this.toZone);
        const showProbeModeMarkers = isProbeMode && !useHohmann && this.optimizedTrajectory;
        
        // Determine if transfer is possible (for color coding)
        const isReachable = this.isTransferPossible();
        const markerColor = isReachable ? '#00ff00' : '#ff4444'; // Green if possible, red if not
        
        // Draw source marker at actual planet position
        if (this.fromZone) {
            const fromZoneData = this.orbitalZones.find(z => z.id === this.fromZone);
            if (fromZoneData) {
                const fromAngle = this.getZoneOrbitalAngle(this.fromZone);
                const x_au = fromZoneData.radius_au * Math.cos(fromAngle);
                const y_au = fromZoneData.radius_au * Math.sin(fromAngle);
                const pos = this.auToCanvas(x_au, y_au);
                
                // Ring for source (green if possible, red if not)
                ctx.strokeStyle = markerColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
                ctx.stroke();
                
                // Label
                ctx.fillStyle = markerColor;
                ctx.font = '10px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('FROM', pos.x, pos.y - 12);
            }
        }
        
        // Draw destination marker at actual planet position
        if (this.toZone) {
            const toZoneData = this.orbitalZones.find(z => z.id === this.toZone);
            if (toZoneData) {
                // Get actual destination planet position
                const toAngle = this.getZoneOrbitalAngle(this.toZone);
                const x_au = toZoneData.radius_au * Math.cos(toAngle);
                const y_au = toZoneData.radius_au * Math.sin(toAngle);
                const pos = this.auToCanvas(x_au, y_au);
                
                // For probe mode (non-Hohmann), draw unfilled circle and "TARGET" label
                if (showProbeModeMarkers) {
                    // Unfilled circle over target planet (green if possible, red if not)
                    ctx.strokeStyle = markerColor;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
                    ctx.stroke();
                    
                    // "TARGET" label (green if possible, red if not)
                    ctx.fillStyle = markerColor;
                    ctx.font = 'bold 10px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText('TARGET', pos.x, pos.y - 14);
                    
                    // Draw white arc connecting target planet to arrival position
                    if (this.optimizedTrajectory && this.optimizedTrajectory.arrivalPosition) {
                        const arrivalPos = this.auToCanvas(
                            this.optimizedTrajectory.arrivalPosition[0],
                            this.optimizedTrajectory.arrivalPosition[1]
                        );
                        
                        // Calculate arc parameters
                        // Use target planet's orbital radius for the arc
                        const arcRadius = Math.sqrt(x_au * x_au + y_au * y_au);
                        
                        // Calculate angles
                        const targetAngle = Math.atan2(y_au, x_au);
                        const arrivalAngle = Math.atan2(
                            this.optimizedTrajectory.arrivalPosition[1],
                            this.optimizedTrajectory.arrivalPosition[0]
                        );
                        
                        // Draw arc (green if possible, red if not)
                        ctx.strokeStyle = markerColor;
                        ctx.lineWidth = 2;
                        ctx.setLineDash([5, 3]); // Dashed line
                        ctx.beginPath();
                        
                        // Draw arc along the orbital circle connecting target to arrival
                        const centerX = this.width / 2;
                        const centerY = this.height / 2;
                        const maxVisualR = Math.min(this.width, this.height) / 2 - this.padding;
                        
                        // Scale the arc radius to canvas coordinates (same as auToCanvas)
                        const MARS_AU = 1.52;
                        const maxRadius = Math.max(
                            ...(this.orbitalZones || []).map(z => z.radius_au || 1)
                        ) * 1.1;
                        
                        const scaleRadius = (r_au) => {
                            if (r_au <= MARS_AU) {
                                return (r_au / MARS_AU) * 0.3;
                            } else {
                                const logNorm = (Math.log(r_au) - Math.log(MARS_AU)) / 
                                                (Math.log(maxRadius) - Math.log(MARS_AU));
                                return 0.3 + 0.7 * logNorm;
                            }
                        };
                        
                        const scaledR = scaleRadius(arcRadius);
                        const visualR = scaledR * maxVisualR;
                        
                        // Calculate angles (accounting for canvas Y flip)
                        let startAngle = -targetAngle; // Flip Y
                        let endAngle = -arrivalAngle; // Flip Y
                        let angleDiff = endAngle - startAngle;
                        
                        // Normalize to [-π, π] and take shorter path
                        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                        
                        // Draw arc (counterclockwise from start to end)
                        ctx.arc(centerX, centerY, visualR, startAngle, startAngle + angleDiff, angleDiff < 0);
                        ctx.stroke();
                        ctx.setLineDash([]); // Reset dash
                        
                        // Draw "ARRIVAL" label at arrival position (green if possible, red if not)
                        ctx.fillStyle = markerColor;
                        ctx.font = 'bold 10px monospace';
                        ctx.textAlign = 'center';
                        ctx.fillText('ARRIVAL', arrivalPos.x, arrivalPos.y - 14);
                    }
                } else {
                    // Standard mode: ring and "TO" label (green if possible, red if not)
                    ctx.strokeStyle = markerColor;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
                    ctx.stroke();
                    
                    // Label
                    ctx.fillStyle = markerColor;
                    ctx.font = '10px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText('TO', pos.x, pos.y - 12);
                }
            }
        }
    }
    
    /**
     * Draw a trajectory path
     */
    drawTrajectory(points, color, lineWidth) {
        if (!points || points.length < 2) return;
        
        const ctx = this.ctx;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Add glow effect
        ctx.shadowBlur = 8;
        ctx.shadowColor = color;
        
        ctx.beginPath();
        
        for (let i = 0; i < points.length; i++) {
            const pos = this.auToCanvas(points[i].x, points[i].y);
            
            if (i === 0) {
                ctx.moveTo(pos.x, pos.y);
            } else {
                ctx.lineTo(pos.x, pos.y);
            }
        }
        
        ctx.stroke();
        
        // Reset shadow
        ctx.shadowBlur = 0;
    }
    
    /**
     * Draw relative delta-v chart showing all planets relative to the source planet
     * The source planet is at 0 delta-v, other planets show their transfer cost
     */
    drawRelativeDeltaVChart() {
        const ctx = this.deltaVCtx;
        if (!ctx || !this.orbitalZones) return;
        
        const width = this.deltaVCanvas.width;
        const height = this.deltaVChartHeight;
        
        // Clear canvas
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, width, height);
        
        // Get game state for probe delta-v capacity
        const gameState = window.gameEngine?.getState?.() || {};
        const skills = gameState?.skills || gameState?.research?.skills || {};
        const probeDvBonus = gameState?.skill_bonuses?.probe_dv_bonus || 0;
        
        // Get probe delta-v capacity - use same method as transfer window
        let probeCapacity = 1.0; // Default
        if (window.orbitalZoneSelector?.orbitalMechanics) {
            probeCapacity = window.orbitalZoneSelector.orbitalMechanics.getProbeDeltaVCapacity(skills, probeDvBonus);
        } else if (window.orbitalZoneSelector?.economicRules?.probe_transfer) {
            const baseCapacity = window.orbitalZoneSelector.economicRules.probe_transfer.base_delta_v_km_s || 1.0;
            probeCapacity = baseCapacity + probeDvBonus;
        }
        
        // Get mass driver capacity if available at source zone - use same method as transfer window
        let massDriverCapacity = 0;
        const structuresByZone = gameState?.structures_by_zone || {};
        const zoneStructures = structuresByZone[this.fromZone] || {};
        const hasMassDriver = (zoneStructures['mass_driver'] || 0) > 0;
        
        if (this.fromZone && hasMassDriver) {
            if (window.orbitalZoneSelector?.transferSystem) {
                massDriverCapacity = window.orbitalZoneSelector.transferSystem.getMassDriverMuzzleVelocity(gameState, this.fromZone);
            } else if (window.orbitalZoneSelector?.getMassDriverMuzzleVelocity) {
                massDriverCapacity = window.orbitalZoneSelector.getMassDriverMuzzleVelocity(this.fromZone);
            }
        }
        
        // Get escape velocity at source zone - use same method as transfer window
        let escapeDeltaV = 0;
        if (this.fromZone) {
            const zones = gameState?.zones || {};
            const sourceZone = this.orbitalZones.find(z => z.id === this.fromZone);
            const fromZoneData = zones[this.fromZone] || {};
            const fromZoneMass = fromZoneData.mass_remaining !== undefined && fromZoneData.mass_remaining !== null
                ? fromZoneData.mass_remaining 
                : (sourceZone?.total_mass_kg || 0);
            
            if (window.orbitalZoneSelector?.orbitalMechanics) {
                escapeDeltaV = window.orbitalZoneSelector.orbitalMechanics.calculateEscapeDeltaV(this.fromZone, fromZoneMass);
            } else if (window.orbitalZoneSelector?.calculateEscapeDeltaV) {
                escapeDeltaV = window.orbitalZoneSelector.calculateEscapeDeltaV(this.fromZone, fromZoneMass);
            }
        }
        
        // Total available delta-v capacity (probe + mass driver) - same as transfer window
        // For probe mode: probeCapacity + massDriverCapacity
        // For other modes: massDriverCapacity only (but trajectory planner is probe-only)
        const totalCapacity = this.resourceType === 'probe' 
            ? (probeCapacity + massDriverCapacity)
            : massDriverCapacity;
        
        // Net delta-v after escaping the source zone - same calculation as transfer window
        const netDeltaV = totalCapacity - escapeDeltaV;
        
        // Calculate delta-v for all zones relative to source
        // PROBE TRANSFERS: Use Python backend computed delta-v for planets (real-time launch windows)
        //                 Use Hohmann for Dyson/Asteroid/Kuiper (no specific planet to rendezvous)
        // MASS TRANSFERS: Always use Hohmann transfer calcs (pre-set trajectories)
        const beltZones = ['dyson_sphere', 'dyson', 'asteroid_belt', 'kuiper', 'oort_cloud'];
        const zoneDeltas = [];
        for (const zone of this.orbitalZones) {
            if (zone.id === 'dyson_sphere') continue;
            
            let transferDeltaV = 0;
            if (this.fromZone && zone.id !== this.fromZone) {
                if (this.resourceType === 'probe') {
                    // Probe transfers: use backend computed delta-v for planets, Hohmann for belts
                    const isBeltZone = beltZones.includes(zone.id);
                    if (!isBeltZone && zone.id === this.toZone && this.optimizedTrajectory) {
                        // Use computed delta-v from backend for selected destination (real-time)
                        transferDeltaV = this.optimizedTrajectory.deltaV || 0;
                    } else {
                        // Use Hohmann for belt zones or non-destination planets
                        if (window.orbitalZoneSelector?.orbitalMechanics) {
                            transferDeltaV = window.orbitalZoneSelector.orbitalMechanics.getHohmannDeltaVKmS(this.fromZone, zone.id);
                        } else if (window.orbitalZoneSelector?.getHohmannDeltaVKmS) {
                            transferDeltaV = window.orbitalZoneSelector.getHohmannDeltaVKmS(this.fromZone, zone.id);
                        }
                    }
                } else {
                    // Mass transfers: always use Hohmann (pre-set trajectories)
                    if (window.orbitalZoneSelector?.orbitalMechanics) {
                        transferDeltaV = window.orbitalZoneSelector.orbitalMechanics.getHohmannDeltaVKmS(this.fromZone, zone.id);
                    } else if (window.orbitalZoneSelector?.getHohmannDeltaVKmS) {
                        transferDeltaV = window.orbitalZoneSelector.getHohmannDeltaVKmS(this.fromZone, zone.id);
                    }
                }
            }
            
            zoneDeltas.push({
                zone: zone,
                deltaV: transferDeltaV,
                isSource: zone.id === this.fromZone,
                isDestination: zone.id === this.toZone,
                isReachable: netDeltaV >= transferDeltaV
            });
        }
        
        // Sort by orbital radius to match visual order
        zoneDeltas.sort((a, b) => (a.zone.radius_au || 0) - (b.zone.radius_au || 0));
        
        // Find max delta-v for scaling (at least show net capacity)
        const maxDeltaV = Math.max(
            netDeltaV * 1.2,
            ...zoneDeltas.map(z => z.deltaV),
            10 // Minimum scale
        );
        
        // Chart dimensions
        const padding = { top: 20, right: 15, bottom: 30, left: 45 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        // Draw title
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('RELATIVE Δv (km/s)', padding.left, 12);
        
        // Draw Y-axis (delta-v scale)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, height - padding.bottom);
        ctx.stroke();
        
        // Draw X-axis at y=0 (source planet position)
        const zeroY = height - padding.bottom;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, zeroY);
        ctx.lineTo(width - padding.right, zeroY);
        ctx.stroke();
        
        // Draw Y-axis labels
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        
        const numTicks = 4;
        for (let i = 0; i <= numTicks; i++) {
            const value = (i / numTicks) * maxDeltaV;
            const y = zeroY - (i / numTicks) * chartHeight;
            
            ctx.fillText(value.toFixed(1), padding.left - 5, y + 3);
            
            // Grid line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
        }
        
        // Draw bars for each zone
        const barWidth = chartWidth / zoneDeltas.length * 0.7;
        const barGap = chartWidth / zoneDeltas.length;
        
        for (let i = 0; i < zoneDeltas.length; i++) {
            const data = zoneDeltas[i];
            const x = padding.left + i * barGap + (barGap - barWidth) / 2;
            const barHeight = (data.deltaV / maxDeltaV) * chartHeight;
            const barTop = zeroY - barHeight;
            
            // Determine bar color based on state
            let barColor;
            if (data.isSource) {
                barColor = 'rgba(74, 158, 255, 0.8)'; // Blue for source (0 delta-v)
            } else if (data.isDestination) {
                barColor = data.isReachable ? 'rgba(74, 255, 74, 0.9)' : 'rgba(255, 68, 68, 0.9)';
            } else if (data.isReachable) {
                barColor = 'rgba(74, 255, 74, 0.5)'; // Dimmer green for reachable
            } else {
                barColor = 'rgba(255, 68, 68, 0.4)'; // Dimmer red for unreachable
            }
            
            // Draw bar (only if not source - source is at 0)
            if (!data.isSource && data.deltaV > 0) {
                ctx.fillStyle = barColor;
                ctx.fillRect(x, barTop, barWidth, barHeight);
                
                // Draw border for destination
                if (data.isDestination) {
                    ctx.strokeStyle = data.isReachable ? '#4aff4a' : '#ff4444';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, barTop, barWidth, barHeight);
                }
            }
            
            // Draw source indicator (dot at 0)
            if (data.isSource) {
                ctx.fillStyle = '#4a9eff';
                ctx.beginPath();
                ctx.arc(x + barWidth / 2, zeroY, 5, 0, Math.PI * 2);
                ctx.fill();
                
                // Glow effect
                ctx.shadowBlur = 8;
                ctx.shadowColor = '#4a9eff';
                ctx.beginPath();
                ctx.arc(x + barWidth / 2, zeroY, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            
            // Draw zone label (abbreviated)
            const zoneName = data.zone.name.replace(/\s+Orbit\s*$/i, '').substring(0, 3).toUpperCase();
            ctx.fillStyle = data.isSource ? '#4a9eff' : 
                           (data.isDestination ? (data.isReachable ? '#4aff4a' : '#ff4444') : 'rgba(255, 255, 255, 0.6)');
            ctx.font = data.isDestination ? 'bold 8px monospace' : '8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(zoneName, x + barWidth / 2, height - padding.bottom + 12);
        }
        
        // Draw net delta-v capacity line (horizontal line showing how far probes can go)
        if (netDeltaV > 0) {
            const capacityY = zeroY - (netDeltaV / maxDeltaV) * chartHeight;
            
            // Dashed line for capacity
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
            ctx.beginPath();
            ctx.moveTo(padding.left, capacityY);
            ctx.lineTo(width - padding.right, capacityY);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Label for capacity
            ctx.fillStyle = '#00ffff';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`NET Δv: ${netDeltaV.toFixed(1)}`, width - padding.right, capacityY - 4);
            
            // Small indicator at the end of the line
            ctx.beginPath();
            ctx.arc(width - padding.right, capacityY, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Draw escape velocity indicator (if significant)
        if (escapeDeltaV > 0.1) {
            ctx.fillStyle = 'rgba(255, 68, 68, 0.8)';
            ctx.font = '8px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`Escape: ${escapeDeltaV.toFixed(1)} km/s`, padding.left + 5, height - padding.bottom + 22);
        }
    }
}

// Create singleton instance
const trajectoryPlanner = new TrajectoryPlanner();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => trajectoryPlanner.init());
} else {
    trajectoryPlanner.init();
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TrajectoryPlanner;
}

