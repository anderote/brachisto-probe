/** Command panel for probe activity allocation - Zone-specific system */
class CommandPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.gameState = null;
        this.isUserInteracting = false; // Track if user is actively dragging sliders
        this.selectedZone = null; // Currently selected orbital zone
        this.init();
    }
    
    setSelectedZone(zoneId) {
        this.selectedZone = zoneId;
        // Force render sliders immediately
        if (zoneId) {
            // Try to get zones from orbital zone selector
            let zones = [];
            if (window.orbitalZoneSelector && window.orbitalZoneSelector.orbitalZones) {
                zones = window.orbitalZoneSelector.orbitalZones;
            } else if (window.app && window.app.orbitalZoneSelector && window.app.orbitalZoneSelector.orbitalZones) {
                zones = window.app.orbitalZoneSelector.orbitalZones;
            }
            
            const zone = zones.find(z => z.id === zoneId);
            if (zone) {
                this.renderSlidersForZone(zoneId, zone);
                if (this.gameState) {
                    this.renderAllocations(zoneId);
                    this.renderBuildings(zoneId);
                }
            } else {
                // Zone not found yet, use basic zone info based on known zone IDs
                // Determine if it's a Dyson zone based on zone ID
                const isDysonZone = zoneId === 'dyson_sphere';
                const basicZone = { id: zoneId, is_dyson_zone: isDysonZone, name: zoneId };
                this.renderSlidersForZone(zoneId, basicZone);
                if (this.gameState) {
                    this.renderAllocations(zoneId);
                    this.renderBuildings(zoneId);
                }
            }
        } else {
            // Clear sliders
            const sliderContainer = document.getElementById('command-sliders-container');
            if (sliderContainer) {
                sliderContainer.innerHTML = '<div class="command-no-zone-message">Select an orbital zone to adjust controls</div>';
            }
            const allocationsContainer = document.getElementById('command-allocations-container');
            if (allocationsContainer) {
                allocationsContainer.innerHTML = '';
            }
            const buildingsContainer = document.getElementById('command-buildings-container');
            const buildingsPanel = document.getElementById('command-buildings-panel');
            if (buildingsContainer) {
                buildingsContainer.innerHTML = '<div class="command-no-zone-message">Select an orbital zone to view buildings</div>';
            }
            if (buildingsPanel) {
                buildingsPanel.style.display = 'none';
            }
        }
        // Also update with current game state if available
        if (this.gameState) {
            this.update(this.gameState);
        }
    }

    init() {
        this.render();
    }

    render() {
        if (!this.container) return;

        // Create layout - standalone panel window with side-by-side layout
        let html = '<div class="command-panel-panel">';
        
        html += '<div class="probe-summary-title">Zone Controls</div>';
        
        // Zone selection indicator
        html += '<div class="command-zone-indicator" id="command-zone-indicator">No zone selected</div>';
        
        // Main content area: sliders on left, buildings on right
        html += '<div class="command-panel-main-content">';
        
        // Left column: Sliders and allocations
        html += '<div class="command-panel-left-column">';
        html += '<div class="command-sliders-container" id="command-sliders-container">';
        html += '<div class="command-no-zone-message">Select an orbital zone to adjust controls</div>';
        html += '</div>';
        html += '<div class="command-allocations-container" id="command-allocations-container">';
        html += '</div>';
        html += '</div>'; // End left column
        
        // Right column: Buildings (only shown if zone has buildings)
        html += '<div class="command-buildings-section" id="command-buildings-panel" style="display: none;">';
        html += '<div class="probe-summary-title">Buildings</div>';
        html += '<div class="command-buildings-container" id="command-buildings-container">';
        html += '<div class="command-no-zone-message">Select an orbital zone to view buildings</div>';
        html += '</div>';
        html += '</div>'; // End buildings section
        
        html += '</div>'; // End main content
        html += '</div>'; // End command-panel-panel

        this.container.innerHTML = html;
        
        // Set up event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Event listeners will be set up when sliders are rendered
    }

    renderSlidersForZone(zoneId, zone) {
        const isDysonZone = zone && zone.is_dyson_zone;
        const sliderContainer = document.getElementById('command-sliders-container');
        if (!sliderContainer) return;
        
        let html = '';
        
        if (isDysonZone) {
            // Dyson zone: Three vertical sliders
            // First slider: Dyson vs Build (0 = all Build, 100 = all Dyson)
            html += '<div class="command-slider-group">';
            html += '<div class="command-slider-label-top">Dyson</div>';
            html += '<div class="command-slider-track-vertical" id="dyson-build-bar-track">';
            html += '<div class="command-slider-fill-vertical" id="dyson-build-bar-fill" style="height: 0%;"></div>';
            html += '<div class="command-slider-line-vertical" id="dyson-build-bar-line" style="bottom: 0%;"></div>';
            html += '<input type="range" id="dyson-build-slider" class="command-slider-vertical" min="0" max="100" value="0" step="1">';
            html += '</div>';
            html += '<div class="command-slider-label-bottom">Build</div>';
            html += '</div>';
            
            // Second slider: Structures vs Replicate
            html += '<div class="command-slider-group">';
            html += '<div class="command-slider-label-top">Structures</div>';
            html += '<div class="command-slider-track-vertical" id="dyson-structures-replicate-bar-track">';
            html += '<div class="command-slider-fill-vertical" id="dyson-structures-replicate-bar-fill" style="height: 0%;"></div>';
            html += '<div class="command-slider-line-vertical" id="dyson-structures-replicate-bar-line" style="bottom: 0%;"></div>';
            html += '<input type="range" id="dyson-structures-replicate-slider" class="command-slider-vertical" min="0" max="100" value="0" step="1">';
            html += '</div>';
            html += '<div class="command-slider-label-bottom">Replicate</div>';
            html += '</div>';
            
            // Third slider: Compute Power
            html += '<div class="command-slider-group">';
            html += '<div class="command-slider-label-top">Compute</div>';
            html += '<div class="command-slider-track-vertical" id="compute-power-bar-track">';
            html += '<div class="command-slider-fill-vertical" id="compute-power-bar-fill" style="height: 50%;"></div>';
            html += '<div class="command-slider-line-vertical" id="compute-power-bar-line" style="bottom: 50%;"></div>';
            html += '<input type="range" id="compute-power-slider" class="command-slider-vertical" min="0" max="100" value="50" step="1">';
            html += '</div>';
            html += '<div class="command-slider-label-bottom">Economy</div>';
            html += '</div>';
        } else {
            // Regular zones: Two vertical sliders
            html += '<div class="command-slider-group">';
            html += '<div class="command-slider-label-top">Mine</div>';
            html += '<div class="command-slider-track-vertical" id="harvest-build-bar-track">';
            html += '<div class="command-slider-fill-vertical" id="harvest-build-bar-fill" style="height: 50%;"></div>';
            html += '<div class="command-slider-line-vertical" id="harvest-build-bar-line" style="bottom: 50%;"></div>';
            html += '<input type="range" id="harvest-build-slider" class="command-slider-vertical" min="0" max="100" value="50" step="1">';
            html += '</div>';
            html += '<div class="command-slider-label-bottom">Build</div>';
            html += '</div>';
            
            html += '<div class="command-slider-group">';
            html += '<div class="command-slider-label-top">Structures</div>';
            html += '<div class="command-slider-track-vertical" id="structures-replicate-bar-track">';
            html += '<div class="command-slider-fill-vertical" id="structures-replicate-bar-fill" style="height: 0%;"></div>';
            html += '<div class="command-slider-line-vertical" id="structures-replicate-bar-line" style="bottom: 0%;"></div>';
            html += '<input type="range" id="structures-replicate-slider" class="command-slider-vertical" min="0" max="100" value="0" step="1">';
            html += '</div>';
            html += '<div class="command-slider-label-bottom">Replicate</div>';
            html += '</div>';
        }
        
        sliderContainer.innerHTML = html;
        
        // Set up event listeners for sliders
        this.setupSliderListeners(isDysonZone);
        
        // Sync slider values with current policy values
        this.syncSlidersWithPolicy(zoneId, isDysonZone);
    }
    
    syncSlidersWithPolicy(zoneId, isDysonZone) {
        // Get current policy values from game state
        const zonePolicies = this.gameState?.zone_policies || {};
        const policy = zonePolicies[zoneId] || {};
        
        if (isDysonZone) {
            // Dyson zone: Sync Dyson/Build slider
            const dysonBuildSlider = document.getElementById('dyson-build-slider');
            if (dysonBuildSlider) {
                // Policy: dyson_allocation_slider (0 = all Build, 100 = all Dyson)
                // Slider: 0 = top (Dyson label), 100 = bottom (Build label)
                // So: slider value = 100 - policy value
                const policyValue = policy.dyson_allocation_slider !== undefined ? policy.dyson_allocation_slider : 100;
                const sliderValue = 100 - policyValue; // Invert: policy 100 (all Dyson) = slider 0 (top)
                dysonBuildSlider.value = sliderValue;
                
                // Update visual fill/line
                const fillEl = document.getElementById('dyson-build-bar-fill');
                const lineEl = document.getElementById('dyson-build-bar-line');
                if (fillEl) fillEl.style.height = `${sliderValue}%`;
                if (lineEl) lineEl.style.bottom = `${sliderValue}%`;
            }
            
            // Sync Structures/Replicate slider
            const structuresReplicateSlider = document.getElementById('dyson-structures-replicate-slider');
            if (structuresReplicateSlider) {
                // Policy: replication_slider (0 = all structures, 100 = all replicate)
                // Slider: 0 = top (Structures label), 100 = bottom (Replicate label)
                // So: slider value = 100 - policy value
                const policyValue = policy.replication_slider !== undefined ? policy.replication_slider : 100;
                const sliderValue = 100 - policyValue; // Invert: policy 100 (all replicate) = slider 0 (top)
                structuresReplicateSlider.value = sliderValue;
                
                // Update visual fill/line
                const fillEl = document.getElementById('dyson-structures-replicate-bar-fill');
                const lineEl = document.getElementById('dyson-structures-replicate-bar-line');
                if (fillEl) fillEl.style.height = `${sliderValue}%`;
                if (lineEl) lineEl.style.bottom = `${sliderValue}%`;
            }
        } else {
            // Regular zones: Sync Mine/Build slider
            const harvestBuildSlider = document.getElementById('harvest-build-slider');
            if (harvestBuildSlider) {
                const policyValue = policy.mining_slider !== undefined ? policy.mining_slider : 50;
                harvestBuildSlider.value = policyValue;
                
                const fillEl = document.getElementById('harvest-build-bar-fill');
                const lineEl = document.getElementById('harvest-build-bar-line');
                if (fillEl) fillEl.style.height = `${policyValue}%`;
                if (lineEl) lineEl.style.bottom = `${policyValue}%`;
            }
            
            // Sync Structures/Replicate slider
            const structuresReplicateSlider = document.getElementById('structures-replicate-slider');
            if (structuresReplicateSlider) {
                const policyValue = policy.replication_slider !== undefined ? policy.replication_slider : 100;
                const sliderValue = 100 - policyValue; // Invert for regular zones too
                structuresReplicateSlider.value = sliderValue;
                
                const fillEl = document.getElementById('structures-replicate-bar-fill');
                const lineEl = document.getElementById('structures-replicate-bar-line');
                if (fillEl) fillEl.style.height = `${sliderValue}%`;
                if (lineEl) lineEl.style.bottom = `${sliderValue}%`;
            }
        }
    }

    // Clip slider value to extremes if within 5% of end
    clipSliderValue(value) {
        if (value <= 5) {
            return 0;
        } else if (value >= 95) {
            return 100;
        }
        return value;
    }

    setupSliderListeners(isDysonZone) {
        // Remove old event listeners by cloning and replacing elements
        const removeOldListeners = (elementId) => {
            const oldEl = document.getElementById(elementId);
            if (oldEl) {
                const newEl = oldEl.cloneNode(true);
                oldEl.parentNode.replaceChild(newEl, oldEl);
                return newEl;
            }
            return null;
        };
        
        if (isDysonZone) {
            // Dyson zone: First slider - Dyson Build vs Other
            const dysonBuildSlider = removeOldListeners('dyson-build-slider') || 
                document.getElementById('dyson-build-slider');
            if (dysonBuildSlider) {
                dysonBuildSlider.addEventListener('mousedown', () => { 
                    this.isUserInteracting = true; 
                });
                dysonBuildSlider.addEventListener('mouseup', () => { 
                    this.isUserInteracting = false; 
                });
                dysonBuildSlider.addEventListener('change', (e) => {
                    this.isUserInteracting = false;
                    let value = parseInt(e.target.value);
                    // Clip to extremes if within 5% of end
                    value = this.clipSliderValue(value);
                    if (value !== parseInt(e.target.value)) {
                        e.target.value = value;
                        const fillEl = document.getElementById('dyson-build-bar-fill');
                        const lineEl = document.getElementById('dyson-build-bar-line');
                        if (fillEl) fillEl.style.height = `${value}%`;
                        if (lineEl) lineEl.style.bottom = `${value}%`;
                    }
                    // Slider: Labels "Dyson" at top, "Build" at bottom
                    // Store as dyson_allocation_slider: 0-100 where 0 = all Build (bottom), 100 = all Dyson (top)
                    // But slider visual: 0 at top (Dyson label), 100 at bottom (Build label)
                    // So we invert: slider value 0 (top) = 100 Dyson allocation, slider value 100 (bottom) = 0 Dyson allocation
                    const dysonAllocationValue = 100 - value; // Invert: top (0) = 100 Dyson, bottom (100) = 0 Dyson
                    this.updateZonePolicy('dyson_allocation_slider', dysonAllocationValue);
                });
                dysonBuildSlider.addEventListener('input', (e) => {
                    let value = parseInt(e.target.value);
                    // Clip to extremes if within 5% of end
                    value = this.clipSliderValue(value);
                    // Update slider value if it was clipped
                    if (value !== parseInt(e.target.value)) {
                        e.target.value = value;
                    }
                    // Slider: Labels "Dyson" at top, "Build" at bottom
                    // Store as dyson_allocation_slider: 0-100 where 0 = all Build (bottom), 100 = all Dyson (top)
                    // But slider visual: 0 at top (Dyson label), 100 at bottom (Build label)
                    // So we invert: slider value 0 (top) = 100 Dyson allocation, slider value 100 (bottom) = 0 Dyson allocation
                    const dysonAllocationValue = 100 - value; // Invert: top (0) = 100 Dyson, bottom (100) = 0 Dyson
                    const fillEl = document.getElementById('dyson-build-bar-fill');
                    const lineEl = document.getElementById('dyson-build-bar-line');
                    if (fillEl) fillEl.style.height = `${value}%`;
                    if (lineEl) lineEl.style.bottom = `${value}%`;
                    this.updateZonePolicy('dyson_allocation_slider', dysonAllocationValue);
                });
            }
            
            // Dyson zone: Second slider - Structures vs Replicate
            const dysonStructuresReplicateSlider = removeOldListeners('dyson-structures-replicate-slider') || 
                document.getElementById('dyson-structures-replicate-slider');
            if (dysonStructuresReplicateSlider) {
                dysonStructuresReplicateSlider.addEventListener('mousedown', () => { 
                    this.isUserInteracting = true; 
                });
                dysonStructuresReplicateSlider.addEventListener('mouseup', () => { 
                    this.isUserInteracting = false; 
                });
                dysonStructuresReplicateSlider.addEventListener('change', (e) => {
                    this.isUserInteracting = false;
                    let value = parseInt(e.target.value);
                    // Clip to extremes if within 5% of end
                    value = this.clipSliderValue(value);
                    if (value !== parseInt(e.target.value)) {
                        e.target.value = value;
                        const replicationValue = 100 - value;
                        const fillEl = document.getElementById('dyson-structures-replicate-bar-fill');
                        const lineEl = document.getElementById('dyson-structures-replicate-bar-line');
                        if (fillEl) fillEl.style.height = `${value}%`;
                        if (lineEl) lineEl.style.bottom = `${value}%`;
                        this.updateZonePolicy('replication_slider', replicationValue);
                    }
                });
                dysonStructuresReplicateSlider.addEventListener('input', (e) => {
                    let value = parseInt(e.target.value);
                    // Clip to extremes if within 5% of end
                    value = this.clipSliderValue(value);
                    // Update slider value if it was clipped
                    if (value !== parseInt(e.target.value)) {
                        e.target.value = value;
                    }
                    // Slider: 0 = all replicate, 100 = all structures
                    // Store as replication_slider: 0 = all structures, 100 = all replicate
                    const replicationValue = 100 - value;
                    const fillEl = document.getElementById('dyson-structures-replicate-bar-fill');
                    const lineEl = document.getElementById('dyson-structures-replicate-bar-line');
                    if (fillEl) fillEl.style.height = `${value}%`;
                    if (lineEl) lineEl.style.bottom = `${value}%`;
                    this.updateZonePolicy('replication_slider', replicationValue);
                });
            }
            
            // Dyson zone: Third slider - Compute Power
            const computePowerSlider = removeOldListeners('compute-power-slider') || 
                document.getElementById('compute-power-slider');
            if (computePowerSlider) {
                computePowerSlider.addEventListener('mousedown', () => { 
                    this.isUserInteracting = true; 
                });
                computePowerSlider.addEventListener('mouseup', () => { 
                    this.isUserInteracting = false; 
                });
                computePowerSlider.addEventListener('change', (e) => {
                    this.isUserInteracting = false;
                    let value = parseInt(e.target.value);
                    // Clip to extremes if within 5% of end
                    value = this.clipSliderValue(value);
                    if (value !== parseInt(e.target.value)) {
                        e.target.value = value;
                        const fillEl = document.getElementById('compute-power-bar-fill');
                        const lineEl = document.getElementById('compute-power-bar-line');
                        if (fillEl) fillEl.style.height = `${value}%`;
                        if (lineEl) lineEl.style.bottom = `${value}%`;
                        this.updateDysonPowerAllocation(value);
                    }
                });
                computePowerSlider.addEventListener('input', (e) => {
                    let value = parseInt(e.target.value);
                    // Clip to extremes if within 5% of end
                    value = this.clipSliderValue(value);
                    // Update slider value if it was clipped
                    if (value !== parseInt(e.target.value)) {
                        e.target.value = value;
                    }
                    const fillEl = document.getElementById('compute-power-bar-fill');
                    const lineEl = document.getElementById('compute-power-bar-line');
                    if (fillEl) fillEl.style.height = `${value}%`;
                    if (lineEl) lineEl.style.bottom = `${value}%`;
                    this.updateDysonPowerAllocation(value);
                });
            }
        } else {
            // Regular zones: Mine vs Build slider
            const harvestBuildSlider = removeOldListeners('harvest-build-slider') || 
                document.getElementById('harvest-build-slider');
            if (harvestBuildSlider) {
                harvestBuildSlider.addEventListener('mousedown', () => { 
                    this.isUserInteracting = true; 
                });
                harvestBuildSlider.addEventListener('mouseup', () => { 
                    this.isUserInteracting = false; 
                });
                harvestBuildSlider.addEventListener('change', (e) => {
                    this.isUserInteracting = false;
                    let value = parseInt(e.target.value);
                    // Clip to extremes if within 5% of end
                    value = this.clipSliderValue(value);
                    if (value !== parseInt(e.target.value)) {
                        e.target.value = value;
                        const fillEl = document.getElementById('harvest-build-bar-fill');
                        const lineEl = document.getElementById('harvest-build-bar-line');
                        if (fillEl) fillEl.style.height = `${value}%`;
                        if (lineEl) lineEl.style.bottom = `${value}%`;
                        this.updateZonePolicy('mining_slider', value);
                    }
                });
                harvestBuildSlider.addEventListener('input', (e) => {
                    let value = parseInt(e.target.value);
                    // Clip to extremes if within 5% of end
                    value = this.clipSliderValue(value);
                    // Update slider value if it was clipped
                    if (value !== parseInt(e.target.value)) {
                        e.target.value = value;
                    }
                    // mining_slider: 0 = all build, 100 = all mine (harvest)
                    const fillEl = document.getElementById('harvest-build-bar-fill');
                    const lineEl = document.getElementById('harvest-build-bar-line');
                    if (fillEl) fillEl.style.height = `${value}%`;
                    if (lineEl) lineEl.style.bottom = `${value}%`;
                    this.updateZonePolicy('mining_slider', value);
                });
            }
            
            // Regular zones: Structures vs Replicate slider
            const structuresReplicateSlider = removeOldListeners('structures-replicate-slider') || 
                document.getElementById('structures-replicate-slider');
            if (structuresReplicateSlider) {
                structuresReplicateSlider.addEventListener('mousedown', () => { 
                    this.isUserInteracting = true; 
                });
                structuresReplicateSlider.addEventListener('mouseup', () => { 
                    this.isUserInteracting = false; 
                });
                structuresReplicateSlider.addEventListener('change', (e) => {
                    this.isUserInteracting = false;
                    let value = parseInt(e.target.value);
                    // Clip to extremes if within 5% of end
                    value = this.clipSliderValue(value);
                    if (value !== parseInt(e.target.value)) {
                        e.target.value = value;
                        const replicationValue = 100 - value;
                        const fillEl = document.getElementById('structures-replicate-bar-fill');
                        const lineEl = document.getElementById('structures-replicate-bar-line');
                        if (fillEl) fillEl.style.height = `${value}%`;
                        if (lineEl) lineEl.style.bottom = `${value}%`;
                        this.updateZonePolicy('replication_slider', replicationValue);
                    }
                });
                structuresReplicateSlider.addEventListener('input', (e) => {
                    let value = parseInt(e.target.value);
                    // Clip to extremes if within 5% of end
                    value = this.clipSliderValue(value);
                    // Update slider value if it was clipped
                    if (value !== parseInt(e.target.value)) {
                        e.target.value = value;
                    }
                    // Slider: 0 = all structures, 100 = all replicate
                    // Store as replication_slider: 0 = all construct, 100 = all replicate
                    const replicationValue = 100 - value;
                    const fillEl = document.getElementById('structures-replicate-bar-fill');
                    const lineEl = document.getElementById('structures-replicate-bar-line');
                    if (fillEl) fillEl.style.height = `${value}%`;
                    if (lineEl) lineEl.style.bottom = `${value}%`;
                    this.updateZonePolicy('replication_slider', replicationValue);
                });
            }
        }
    }

    renderAllocations(zoneId) {
        const allocationsContainer = document.getElementById('command-allocations-container');
        if (!allocationsContainer || !this.gameState) return;
        
        const probeAllocationsByZone = this.gameState.probe_allocations_by_zone || {};
        const zoneAllocations = probeAllocationsByZone[zoneId] || {};
        
        let html = '<div class="probe-summary-label" style="margin-top: 12px; margin-bottom: 8px;">Allocations</div>';
        html += '<div class="probe-summary-breakdown">';
        
        // Calculate totals for each category
        let harvestCount = 0;
        let constructCount = 0;
        let replicateCount = 0;
        let dysonCount = 0;
        
        if (zoneAllocations.harvest) {
            harvestCount = Object.values(zoneAllocations.harvest).reduce((a, b) => a + b, 0);
        }
        if (zoneAllocations.construct) {
            constructCount = Object.values(zoneAllocations.construct).reduce((a, b) => a + b, 0);
        }
        if (zoneAllocations.replicate) {
            replicateCount = Object.values(zoneAllocations.replicate).reduce((a, b) => a + b, 0);
        }
        if (zoneAllocations.dyson) {
            dysonCount = Object.values(zoneAllocations.dyson).reduce((a, b) => a + b, 0);
        }
        
        // Show allocations based on zone type
        const zones = window.orbitalZoneSelector?.orbitalZones || [];
        const zone = zones.find(z => z.id === zoneId);
        const isDysonZone = zone && zone.is_dyson_zone;
        
        if (isDysonZone) {
            if (dysonCount > 0) {
                html += `<div class="probe-summary-breakdown-item"><span class="probe-summary-breakdown-label">Dyson:</span><span class="probe-summary-breakdown-value">${Math.floor(dysonCount)}</span></div>`;
            }
            if (replicateCount > 0) {
                html += `<div class="probe-summary-breakdown-item"><span class="probe-summary-breakdown-label">Replicate:</span><span class="probe-summary-breakdown-value">${Math.floor(replicateCount)}</span></div>`;
            }
        } else {
            if (harvestCount > 0) {
                html += `<div class="probe-summary-breakdown-item"><span class="probe-summary-breakdown-label">Harvest:</span><span class="probe-summary-breakdown-value">${Math.floor(harvestCount)}</span></div>`;
            }
            if (constructCount > 0) {
                html += `<div class="probe-summary-breakdown-item"><span class="probe-summary-breakdown-label">Construct:</span><span class="probe-summary-breakdown-value">${Math.floor(constructCount)}</span></div>`;
            }
            if (replicateCount > 0) {
                html += `<div class="probe-summary-breakdown-item"><span class="probe-summary-breakdown-label">Replicate:</span><span class="probe-summary-breakdown-value">${Math.floor(replicateCount)}</span></div>`;
            }
        }
        
        if (harvestCount === 0 && constructCount === 0 && replicateCount === 0 && dysonCount === 0) {
            html += '<div class="probe-summary-breakdown-item">None</div>';
        }
        
        html += '</div>';
        
        allocationsContainer.innerHTML = html;
    }

    renderBuildings(zoneId) {
        const buildingsContainer = document.getElementById('command-buildings-container');
        const buildingsPanel = document.getElementById('command-buildings-panel');
        if (!buildingsContainer || !this.gameState) {
            // Hide panel if container doesn't exist
            if (buildingsPanel) {
                buildingsPanel.style.display = 'none';
            }
            return;
        }
        
        const structuresByZone = this.gameState.structures_by_zone || {};
        const zoneStructures = structuresByZone[zoneId] || {};
        
        // Get zone data for orbital efficiency calculations
        let zones = [];
        if (window.orbitalZoneSelector && window.orbitalZoneSelector.orbitalZones) {
            zones = window.orbitalZoneSelector.orbitalZones;
        } else if (window.app && window.app.orbitalZoneSelector && window.app.orbitalZoneSelector.orbitalZones) {
            zones = window.app.orbitalZoneSelector.orbitalZones;
        }
        const zone = zones.find(z => z.id === zoneId);
        
        const buildingEntries = Object.entries(zoneStructures).filter(([id, count]) => count > 0);
        
        // Hide/show panel based on whether there are buildings
        if (buildingsPanel) {
            if (buildingEntries.length === 0) {
                buildingsPanel.style.display = 'none';
                return;
            } else {
                buildingsPanel.style.display = 'flex';
            }
        }
        
        if (buildingEntries.length === 0) {
            return;
        }
        
        // Format functions
        const formatEnergy = (energy) => {
            if (energy === 0) return '0 W';
            if (energy >= 1e15) return (energy / 1e15).toFixed(2) + ' PW';
            if (energy >= 1e12) return (energy / 1e12).toFixed(2) + ' TW';
            if (energy >= 1e9) return (energy / 1e9).toFixed(2) + ' GW';
            if (energy >= 1e6) return (energy / 1e6).toFixed(2) + ' MW';
            if (energy >= 1e3) return (energy / 1e3).toFixed(2) + ' kW';
            return energy.toFixed(2) + ' W';
        };
        
        const formatRate = (rate) => {
            if (rate === 0) return '0';
            if (Math.abs(rate) < 0.01) return rate.toFixed(4);
            if (Math.abs(rate) < 1) return rate.toFixed(2);
            return rate.toExponential(2);
        };
        
        let html = '';
        
        // Group buildings by category and calculate production rates
        const buildingsByCategory = {};
        
        for (const [buildingId, count] of buildingEntries) {
            if (!window.gameDataLoader) continue;
            
            const building = window.gameDataLoader.getBuildingById(buildingId);
            if (!building) continue;
            
            const category = this._getBuildingCategory(buildingId) || 'other';
            if (!buildingsByCategory[category]) {
                buildingsByCategory[category] = [];
            }
            
            const effects = building.effects || {};
            
            // Calculate orbital efficiency
            let orbitalEfficiency = 1.0;
            if (building.orbital_efficiency && zone && building.orbital_efficiency[zoneId]) {
                orbitalEfficiency = building.orbital_efficiency[zoneId];
            }
            
            // Calculate solar distance modifier (inverse square law) for energy structures
            let solarDistanceModifier = 1.0;
            if (category === 'energy' && zone && zone.radius_au) {
                const radiusAu = zone.radius_au;
                if (radiusAu > 0) {
                    // Inverse square law: power at distance d = power_at_earth * (1.0 / d)²
                    solarDistanceModifier = Math.pow(1.0 / radiusAu, 2);
                }
            }
            
            // Calculate production/consumption rates
            const energyProduction = (effects.energy_production_per_second || 0) * count * orbitalEfficiency * solarDistanceModifier;
            const energyConsumption = (effects.energy_consumption_per_second || 0) * count;
            const metalProduction = (effects.metal_production_per_day || 0) * count * orbitalEfficiency;
            const probeProduction = (effects.probe_production_per_day || 0) * count * orbitalEfficiency;
            const intelligenceProduction = (effects.intelligence_flops || 0) * count;
            
            // Get building name
            const buildingName = building.name || buildingId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            buildingsByCategory[category].push({
                id: buildingId,
                name: buildingName,
                count: count,
                energyProduction: energyProduction,
                energyConsumption: energyConsumption,
                metalProduction: metalProduction,
                probeProduction: probeProduction,
                intelligenceProduction: intelligenceProduction
            });
        }
        
        // Render buildings grouped by category
        for (const [category, buildings] of Object.entries(buildingsByCategory)) {
            if (buildings.length === 0) continue;
            
            // Category header
            const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
            html += `<div class="probe-summary-item" style="margin-top: ${html ? '12px' : '0'}; padding-top: ${html ? '12px' : '0'}; border-top: ${html ? '1px solid rgba(255, 255, 255, 0.1)' : 'none'};">`;
            html += `<div class="probe-summary-label">${categoryName}</div>`;
            html += '<div class="probe-summary-breakdown">';
            
            // Sort buildings by name
            buildings.sort((a, b) => a.name.localeCompare(b.name));
            
            for (const building of buildings) {
                html += `<div class="probe-summary-breakdown-item" style="margin-bottom: 8px;">`;
                html += `<div style="font-size: 10px; color: rgba(255, 255, 255, 0.9); margin-bottom: 4px;">${building.name} (×${building.count})</div>`;
                
                // Show production rates
                const rates = [];
                if (building.energyProduction > 0) {
                    rates.push(`Energy: +${formatEnergy(building.energyProduction)}`);
                }
                if (building.energyConsumption > 0) {
                    rates.push(`Energy: -${formatEnergy(building.energyConsumption)}`);
                }
                if (building.metalProduction > 0) {
                    rates.push(`Metal: +${formatRate(building.metalProduction)} kg/s`);
                }
                if (building.probeProduction > 0) {
                    rates.push(`Probes: +${formatRate(building.probeProduction)} /s`);
                }
                if (building.intelligenceProduction > 0) {
                    const intelPFLOPS = building.intelligenceProduction / 1e15;
                    rates.push(`Compute: +${formatRate(intelPFLOPS)} PFLOPS`);
                }
                
                if (rates.length > 0) {
                    html += `<div style="font-size: 9px; color: rgba(255, 255, 255, 0.7); margin-left: 8px;">`;
                    html += rates.join('<br>');
                    html += `</div>`;
                } else {
                    html += `<div style="font-size: 9px; color: rgba(255, 255, 255, 0.5); margin-left: 8px;">No production</div>`;
                }
                
                html += `</div>`;
            }
            
            html += '</div></div>';
        }
        
        buildingsContainer.innerHTML = html;
    }
    
    _getBuildingCategory(buildingId) {
        if (!window.gameDataLoader) return 'other';
        const building = window.gameDataLoader.getBuildingById(buildingId);
        if (!building) return 'other';
        
        // Check all building categories
        const categories = ['energy', 'mining', 'factories', 'computing', 'transportation', 'research'];
        const buildings = window.gameDataLoader.buildings || {};
        
        for (const category of categories) {
            if (buildings[category] && Array.isArray(buildings[category])) {
                if (buildings[category].some(b => b.id === buildingId)) {
                    return category;
                }
            }
        }
        
        return 'other';
    }

    async updateZonePolicy(policyKey, value) {
        if (!this.selectedZone) return;
        try {
            if (typeof window.gameEngine !== 'undefined' && window.gameEngine) {
                const gameEngine = window.gameEngine;
                // Try engine.setZonePolicy first (GameEngine instance)
                if (gameEngine.engine && typeof gameEngine.engine.setZonePolicy === 'function') {
                    await gameEngine.engine.setZonePolicy(this.selectedZone, policyKey, value);
                } else if (typeof gameEngine.setZonePolicy === 'function') {
                    await gameEngine.setZonePolicy(this.selectedZone, policyKey, value);
                } else {
                    // Fallback: update directly in game state
                    if (!gameEngine.engine) gameEngine.engine = {};
                    if (!gameEngine.engine.zonePolicies) gameEngine.engine.zonePolicies = {};
                    if (!gameEngine.engine.zonePolicies[this.selectedZone]) {
                        gameEngine.engine.zonePolicies[this.selectedZone] = {};
                    }
                    gameEngine.engine.zonePolicies[this.selectedZone][policyKey] = value;
                }
            }
        } catch (error) {
            console.error('Failed to update zone policy:', error);
        }
    }

    async updateDysonPowerAllocation(value) {
        try {
            if (typeof window.gameEngine !== 'undefined' && window.gameEngine) {
                const gameEngine = window.gameEngine;
                if (gameEngine.engine) {
                    gameEngine.engine.dysonPowerAllocation = value;
                } else if (gameEngine.dysonPowerAllocation !== undefined) {
                    gameEngine.dysonPowerAllocation = value;
                }
            }
        } catch (error) {
            console.error('Failed to update Dyson power allocation:', error);
        }
    }

    update(gameState) {
        this.gameState = gameState;

        if (!this.container) return;
        
        // Ensure panel is rendered
        const panel = this.container.querySelector('.command-panel-panel');
        if (!panel) {
            this.render();
        }
        
        // Update zone indicator
        const zoneIndicator = document.getElementById('command-zone-indicator');
        if (zoneIndicator) {
            if (this.selectedZone) {
                // Try multiple ways to get zones
                let zones = [];
                if (window.orbitalZoneSelector && window.orbitalZoneSelector.orbitalZones) {
                    zones = window.orbitalZoneSelector.orbitalZones;
                } else if (window.app && window.app.orbitalZoneSelector && window.app.orbitalZoneSelector.orbitalZones) {
                    zones = window.app.orbitalZoneSelector.orbitalZones;
                }
                const zone = zones.find(z => z.id === this.selectedZone);
                const zoneName = zone ? zone.name : this.selectedZone;
                zoneIndicator.textContent = zoneName || this.selectedZone;
            } else {
                zoneIndicator.textContent = 'No zone selected';
            }
        }
        
        // Render sliders for selected zone
        if (this.selectedZone) {
            // Try multiple ways to get zones
            let zones = [];
            if (window.orbitalZoneSelector && window.orbitalZoneSelector.orbitalZones) {
                zones = window.orbitalZoneSelector.orbitalZones;
            } else if (window.app && window.app.orbitalZoneSelector && window.app.orbitalZoneSelector.orbitalZones) {
                zones = window.app.orbitalZoneSelector.orbitalZones;
            }
            
            const zone = zones.find(z => z.id === this.selectedZone);
            if (zone) {
                this.renderSlidersForZone(this.selectedZone, zone);
                this.renderAllocations(this.selectedZone);
                this.renderBuildings(this.selectedZone);
            } else {
                // Zone not found in orbitalZones yet, try to render with basic zone info
                // This can happen if orbitalZones haven't loaded yet
                const isDysonZone = this.selectedZone === 'dyson_sphere';
                const basicZone = { id: this.selectedZone, is_dyson_zone: isDysonZone, name: this.selectedZone };
                this.renderSlidersForZone(this.selectedZone, basicZone);
                this.renderAllocations(this.selectedZone);
                this.renderBuildings(this.selectedZone);
            }
        } else {
            // Clear sliders and allocations
            const sliderContainer = document.getElementById('command-sliders-container');
            if (sliderContainer) {
                sliderContainer.innerHTML = '<div class="command-no-zone-message">Select an orbital zone to adjust controls</div>';
            }
            const allocationsContainer = document.getElementById('command-allocations-container');
            if (allocationsContainer) {
                allocationsContainer.innerHTML = '';
            }
            const buildingsContainer = document.getElementById('command-buildings-container');
            const buildingsPanel = document.getElementById('command-buildings-panel');
            if (buildingsContainer) {
                buildingsContainer.innerHTML = '<div class="command-no-zone-message">Select an orbital zone to view buildings</div>';
            }
            if (buildingsPanel) {
                buildingsPanel.style.display = 'none';
            }
        }

        // Don't update slider VALUES if user is actively interacting
        if (this.isUserInteracting) {
            return; // Skip updates while user is dragging
        }
        
        if (!this.selectedZone) return;
        
        const zones = window.orbitalZoneSelector?.orbitalZones || [];
        const zone = zones.find(z => z.id === this.selectedZone);
        const isDysonZone = zone && zone.is_dyson_zone;
        const zonePolicies = gameState.zone_policies || {};
        const zonePolicy = zonePolicies[this.selectedZone] || {};
        
        if (isDysonZone) {
            // Dyson zone: Update dyson allocation slider
            // dyson_build_slider: 0 = all Build, 100 = all Dyson
            // Slider visual: 0 at top (Dyson label), 100 at bottom (Build label)
            // But stored value: 0 = all Build, 100 = all Dyson (so slider 100 = stored 100 = all Dyson)
            const dysonBuildSlider = document.getElementById('dyson-build-slider');
            const dysonBuildValue = zonePolicy.dyson_build_slider !== undefined ? zonePolicy.dyson_build_slider : 90;
            // Slider value matches stored value directly (no inversion needed)
            const sliderVisualValue = dysonBuildValue;
            if (dysonBuildSlider) {
                const currentValue = parseInt(dysonBuildSlider.value);
                if (currentValue != sliderVisualValue) {
                    dysonBuildSlider.value = sliderVisualValue;
                    const fillEl = document.getElementById('dyson-build-bar-fill');
                    const lineEl = document.getElementById('dyson-build-bar-line');
                    if (fillEl) fillEl.style.height = `${sliderVisualValue}%`;
                    if (lineEl) lineEl.style.bottom = `${sliderVisualValue}%`;
                }
            }
            
            // Dyson zone: Update structures vs replicate slider
            const dysonStructuresReplicateSlider = document.getElementById('dyson-structures-replicate-slider');
            const replicationValue = zonePolicy.replication_slider !== undefined ? zonePolicy.replication_slider : 100;
            const structuresValue = 100 - replicationValue; // Display structures %
            if (dysonStructuresReplicateSlider) {
                const currentValue = parseInt(dysonStructuresReplicateSlider.value);
                if (currentValue != structuresValue) {
                    dysonStructuresReplicateSlider.value = structuresValue;
                    const fillEl = document.getElementById('dyson-structures-replicate-bar-fill');
                    const lineEl = document.getElementById('dyson-structures-replicate-bar-line');
                    if (fillEl) fillEl.style.height = `${structuresValue}%`;
                    if (lineEl) lineEl.style.bottom = `${structuresValue}%`;
                }
            }
            
            // Dyson zone: Update compute power slider
            const computePowerSlider = document.getElementById('compute-power-slider');
            const computeValue = gameState.dyson_power_allocation !== undefined ? gameState.dyson_power_allocation : 50;
            if (computePowerSlider) {
                const currentValue = parseInt(computePowerSlider.value);
                if (currentValue != computeValue) {
                    computePowerSlider.value = computeValue;
                    const fillEl = document.getElementById('compute-power-bar-fill');
                    const lineEl = document.getElementById('compute-power-bar-line');
                    if (fillEl) fillEl.style.height = `${computeValue}%`;
                    if (lineEl) lineEl.style.bottom = `${computeValue}%`;
                }
            }
        } else {
            // Regular zones: Update mine vs build slider
            const harvestBuildSlider = document.getElementById('harvest-build-slider');
            // mining_slider: 0 = all build (top), 100 = all mine (bottom)
            const miningValue = zonePolicy.mining_slider !== undefined ? zonePolicy.mining_slider : 50;
            if (harvestBuildSlider) {
                const currentValue = parseInt(harvestBuildSlider.value);
                if (currentValue != miningValue) {
                    harvestBuildSlider.value = miningValue;
                    const fillEl = document.getElementById('harvest-build-bar-fill');
                    const lineEl = document.getElementById('harvest-build-bar-line');
                    if (fillEl) fillEl.style.height = `${miningValue}%`;
                    if (lineEl) lineEl.style.bottom = `${miningValue}%`;
                }
            }
            
            // Regular zones: Update structures vs replicate slider
            const structuresReplicateSlider = document.getElementById('structures-replicate-slider');
            const replicationValue = zonePolicy.replication_slider !== undefined ? zonePolicy.replication_slider : 100;
            const structuresValue = 100 - replicationValue; // Display structures %
            if (structuresReplicateSlider) {
                const currentValue = parseInt(structuresReplicateSlider.value);
                if (currentValue != structuresValue) {
                    structuresReplicateSlider.value = structuresValue;
                    const fillEl = document.getElementById('structures-replicate-bar-fill');
                    const lineEl = document.getElementById('structures-replicate-bar-line');
                    if (fillEl) fillEl.style.height = `${structuresValue}%`;
                    if (lineEl) lineEl.style.bottom = `${structuresValue}%`;
                }
            }
        }
        
        // Update allocations
        if (this.selectedZone) {
            this.renderAllocations(this.selectedZone);
        }
    }
}
