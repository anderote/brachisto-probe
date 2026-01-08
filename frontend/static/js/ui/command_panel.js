/** Command panel for probe activity allocation - Zone-specific system */
class CommandPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.gameState = null;
        this.isUserInteracting = false; // Track if user is actively dragging sliders
        this.selectedZone = null; // Currently selected orbital zone
        this.zonePolicies = {}; // Cache slider values per zone
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

        // Zone selection indicator with default policy button
        html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); position: relative;">';
        html += '<div class="command-zone-indicator" id="command-zone-indicator">No zone selected</div>';
        html += '<div style="position: relative;">';
        html += '<button id="default-policy-btn" class="command-policy-btn" title="Apply policy to all zones">Apply to All</button>';
        // Default policy dropdown (hidden by default)
        html += '<div id="default-policy-dropdown" class="command-policy-dropdown" style="display: none;">';
        html += '<div class="command-policy-option" id="policy-apply-current">Apply current zone settings to all zones</div>';
        html += '<div class="command-policy-option" id="policy-set-idle">Set all zones to Idle (no activity)</div>';
        html += '<div class="command-policy-option" id="policy-set-mining">Set all zones to Mining only</div>';
        html += '</div>';
        html += '</div>'; // End button wrapper
        html += '</div>';

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
        this.setupPolicyListeners();
    }

    setupEventListeners() {
        // Event listeners will be set up when sliders are rendered
    }

    setupPolicyListeners() {
        const policyBtn = document.getElementById('default-policy-btn');
        const dropdown = document.getElementById('default-policy-dropdown');

        if (policyBtn && dropdown) {
            // Toggle dropdown on button click
            policyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!dropdown.contains(e.target) && e.target !== policyBtn) {
                    dropdown.style.display = 'none';
                }
            });

            // Apply current zone settings to all zones
            const applyCurrentBtn = document.getElementById('policy-apply-current');
            if (applyCurrentBtn) {
                applyCurrentBtn.addEventListener('click', () => {
                    this.applyPolicyToAllZones('current');
                    dropdown.style.display = 'none';
                });
            }

            // Set all zones to idle
            const setIdleBtn = document.getElementById('policy-set-idle');
            if (setIdleBtn) {
                setIdleBtn.addEventListener('click', () => {
                    this.applyPolicyToAllZones('idle');
                    dropdown.style.display = 'none';
                });
            }

            // Set all zones to mining only
            const setMiningBtn = document.getElementById('policy-set-mining');
            if (setMiningBtn) {
                setMiningBtn.addEventListener('click', () => {
                    this.applyPolicyToAllZones('mining');
                    dropdown.style.display = 'none';
                });
            }
        }
    }

    /**
     * Apply a policy to all zones
     * @param {string} policyType - 'current', 'idle', or 'mining'
     */
    async applyPolicyToAllZones(policyType) {
        // Get all zones
        const zones = window.orbitalZoneSelector?.orbitalZones || [];
        if (zones.length === 0) {
            console.warn('No zones available to apply policy');
            return;
        }

        let allocations;

        if (policyType === 'current') {
            // Use current zone's slider values
            if (!this.selectedZone) {
                if (window.toast) {
                    window.toast.error('Select a zone first to copy its settings');
                }
                return;
            }
            const policy = this.zonePolicies[this.selectedZone] || {};
            // Convert cached slider values back to allocations
            const zones = window.orbitalZoneSelector?.orbitalZones || [];
            const zone = zones.find(z => z.id === this.selectedZone);
            const isDysonZone = zone && zone.is_dyson_zone;

            // Get slider values (0-100), convert to 0-1
            let v1 = (policy[isDysonZone ? 'dyson_priority' : 'mine_priority'] || 0) / 100;
            let v2 = (policy.replicate_priority || 0) / 100;
            let v3 = (policy.construct_priority || 0) / 100;
            let v4 = (policy.recycle_priority || 0) / 100;
            let v5 = (policy.recycle_probes_priority || 0) / 100;
            let v6 = (policy.idle_priority || 0) / 100;

            // Apply deadzone
            if (v1 <= 0.05) v1 = 0;
            if (v2 <= 0.05) v2 = 0;
            if (v3 <= 0.05) v3 = 0;
            if (v4 <= 0.05) v4 = 0;
            if (v5 <= 0.05) v5 = 0;
            if (v6 <= 0.05) v6 = 0;

            // Calculate allocations using v^2 / sum formula
            const v1Sq = v1 * v1;
            const v2Sq = v2 * v2;
            const v3Sq = v3 * v3;
            const v4Sq = v4 * v4;
            const v5Sq = v5 * v5;
            const v6Sq = v6 * v6;
            const sum = v1 + v2 + v3 + v4 + v5 + v6;

            if (sum > 0) {
                allocations = {
                    harvest: isDysonZone ? 0 : v1Sq / sum,
                    dyson: isDysonZone ? v1Sq / sum : 0,
                    replicate: v2Sq / sum,
                    construct: v3Sq / sum,
                    recycle: v4Sq / sum,
                    recycle_probes: v5Sq / sum,
                    idle: v6Sq / sum
                };
            } else {
                allocations = { harvest: 0, dyson: 0, replicate: 0, construct: 0, recycle: 0, recycle_probes: 0, idle: 1 };
            }
        } else if (policyType === 'idle') {
            // All probes idle
            allocations = { harvest: 0, dyson: 0, replicate: 0, construct: 0, recycle: 0, recycle_probes: 0, idle: 1 };
        } else if (policyType === 'mining') {
            // All probes mining
            allocations = { harvest: 1, dyson: 0, replicate: 0, construct: 0, recycle: 0, recycle_probes: 0, idle: 0 };
        }

        // Apply to all zones
        for (const zone of zones) {
            const zoneId = zone.id;

            // Adjust for Dyson zone (swap harvest/dyson)
            let zoneAllocations = { ...allocations };
            if (zone.is_dyson_zone) {
                if (policyType === 'mining') {
                    // For Dyson zone, "mining" means Dyson construction
                    zoneAllocations = { harvest: 0, dyson: 1, replicate: 0, construct: 0, recycle: 0, recycle_probes: 0, idle: 0 };
                }
            }

            // Update cached zone policies (for slider sync)
            this.zonePolicies[zoneId] = {
                mine_priority: Math.sqrt(zoneAllocations.harvest) * 100,
                dyson_priority: Math.sqrt(zoneAllocations.dyson) * 100,
                replicate_priority: Math.sqrt(zoneAllocations.replicate) * 100,
                construct_priority: Math.sqrt(zoneAllocations.construct) * 100,
                recycle_priority: Math.sqrt(zoneAllocations.recycle) * 100,
                recycle_probes_priority: Math.sqrt(zoneAllocations.recycle_probes) * 100,
                idle_priority: Math.sqrt(zoneAllocations.idle) * 100
            };

            // Send to game engine
            try {
                if (window.gameEngine) {
                    await window.gameEngine.performAction('allocate_probes', {
                        zone_id: zoneId,
                        allocations: zoneAllocations,
                        mass_limits: {
                            replicate: Math.sqrt(zoneAllocations.replicate),
                            construct: Math.sqrt(zoneAllocations.construct),
                            recycle_probes: Math.sqrt(zoneAllocations.recycle_probes)
                        }
                    });
                }
            } catch (error) {
                console.error(`Failed to apply policy to zone ${zoneId}:`, error);
            }
        }

        // Update current zone's slider display if selected
        if (this.selectedZone) {
            const zone = zones.find(z => z.id === this.selectedZone);
            if (zone) {
                this.syncSlidersWithPolicy(this.selectedZone, zone.is_dyson_zone);
            }
        }

        // Show success message
        if (window.toast) {
            const policyName = policyType === 'current' ? 'current settings' :
                              policyType === 'idle' ? 'Idle' : 'Mining';
            window.toast.success(`Applied "${policyName}" policy to all ${zones.length} zones`);
        }
    }

    renderSlidersForZone(zoneId, zone) {
        const isDysonZone = zone && zone.is_dyson_zone;
        const sliderContainer = document.getElementById('command-sliders-container');
        if (!sliderContainer) return;
        
        let html = '';
        
        // Helper to create a horizontal priority slider with right-justified label above
        const createPrioritySlider = (id, label) => {
            return `<div class="command-priority-slider-row">
                <div class="command-priority-label">${label}</div>
                <div class="command-priority-track" id="${id}-bar-track">
                    <div class="command-priority-fill" id="${id}-bar-fill" style="width: 0%;"></div>
                    <input type="range" id="${id}-slider" class="command-priority-input" min="0" max="100" value="0" step="1">
                </div>
            </div>`;
        };
        
        if (isDysonZone) {
            // Dyson zone: 6 independent priority sliders (Dyson replaces Mine)
            html += createPrioritySlider('dyson', 'Dyson');
            html += createPrioritySlider('replicate', 'Replicate');
            html += createPrioritySlider('construct', 'Construct');
            html += createPrioritySlider('recycle', 'Recycle Slag');
            html += createPrioritySlider('recycle_probes', 'Recycle Probes');
            html += createPrioritySlider('idle', 'Idle');
        } else {
            // Regular zones: 6 independent priority sliders
            html += createPrioritySlider('mine', 'Mine');
            html += createPrioritySlider('replicate', 'Replicate');
            html += createPrioritySlider('construct', 'Construct');
            html += createPrioritySlider('recycle', 'Recycle Slag');
            html += createPrioritySlider('recycle_probes', 'Recycle Probes');
            html += createPrioritySlider('idle', 'Idle');
        }
        
        sliderContainer.innerHTML = html;
        
        // Set up event listeners for sliders
        this.setupSliderListeners(isDysonZone);
        
        // Sync slider values with current policy values
        this.syncSlidersWithPolicy(zoneId, isDysonZone);
    }
    
    syncSlidersWithPolicy(zoneId, isDysonZone) {
        // Check if we have cached policy values first (user has set sliders)
        // Only read from game state if we don't have cached values
        let policy = this.zonePolicies[zoneId];
        
        if (!policy || Object.keys(policy).length === 0) {
            // No cached values, read from game state and convert to slider values
            const probeAllocationsByZone = this.gameState?.probe_allocations_by_zone || {};
            const allocations = probeAllocationsByZone[zoneId] || {};
            
            // The allocations are 0-1 fractions calculated from p = v^2 / sum
            // To reverse this, we need to find the original slider values
            // Since p_i = v_i^2 / sum(v_j^2), and we store fractions,
            // we can approximate by taking sqrt of the allocation values
            // This isn't exact but gives reasonable visual feedback
            
            const harvest = allocations.harvest || 0;
            const dyson = allocations.dyson || 0;
            const construct = allocations.construct || 0;
            const replicate = allocations.replicate || 0;
            const recycle = allocations.recycle || 0;
            const recycle_probes = allocations.recycle_probes || 0;
            
            // Convert back to slider values (0-100)
            // Using sqrt to reverse the v^2 in the formula
            let mineSlider = Math.sqrt(harvest) * 100;
            let dysonSlider = Math.sqrt(dyson) * 100;
            let replicateSlider = Math.sqrt(replicate) * 100;
            let constructSlider = Math.sqrt(construct) * 100;
            let recycleSlider = Math.sqrt(recycle) * 100;
            let recycleProbesSlider = Math.sqrt(recycle_probes) * 100;
            
            // Store in zonePolicies cache
            if (!this.zonePolicies[zoneId]) {
                this.zonePolicies[zoneId] = {};
            }
            this.zonePolicies[zoneId].mine_priority = mineSlider;
            this.zonePolicies[zoneId].dyson_priority = dysonSlider;
            this.zonePolicies[zoneId].replicate_priority = replicateSlider;
            this.zonePolicies[zoneId].construct_priority = constructSlider;
            this.zonePolicies[zoneId].recycle_priority = recycleSlider;
            this.zonePolicies[zoneId].recycle_probes_priority = recycleProbesSlider;
            
            policy = this.zonePolicies[zoneId];
        }
        
        // Helper to sync a slider (horizontal - uses width)
        const syncSlider = (sliderId, value) => {
            const slider = document.getElementById(`${sliderId}-slider`);
            if (slider) {
                slider.value = value;
                const fillEl = document.getElementById(`${sliderId}-bar-fill`);
                if (fillEl) fillEl.style.width = `${value}%`;
            }
        };
        
        if (isDysonZone) {
            // Dyson zone: sync all 6 priority sliders (includes idle)
            syncSlider('dyson', policy.dyson_priority || 0);
            syncSlider('replicate', policy.replicate_priority || 0);
            syncSlider('construct', policy.construct_priority || 0);
            syncSlider('recycle', policy.recycle_priority || 0);
            syncSlider('recycle_probes', policy.recycle_probes_priority || 0);
            syncSlider('idle', policy.idle_priority || 0);
        } else {
            // Regular zones: sync all 6 priority sliders (includes idle)
            syncSlider('mine', policy.mine_priority || 0);
            syncSlider('replicate', policy.replicate_priority || 0);
            syncSlider('construct', policy.construct_priority || 0);
            syncSlider('recycle', policy.recycle_priority || 0);
            syncSlider('recycle_probes', policy.recycle_probes_priority || 0);
            syncSlider('idle', policy.idle_priority || 0);
        }
    }

    // Apply deadzone: if slider is in bottom 5% (0-5 on 0-100 scale), set to zero
    applyDeadzone(value) {
        if (value <= 5) {
            return 0;
        }
        return value;
    }

    setupSliderListeners(isDysonZone) {
        // Define the slider IDs based on zone type (includes idle slider)
        const sliderIds = isDysonZone 
            ? ['dyson', 'replicate', 'construct', 'recycle', 'recycle_probes', 'idle']
            : ['mine', 'replicate', 'construct', 'recycle', 'recycle_probes', 'idle'];
        
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
        
        // Set up listeners for each priority slider
        for (const sliderId of sliderIds) {
            const slider = removeOldListeners(`${sliderId}-slider`) || 
                document.getElementById(`${sliderId}-slider`);
            
            if (slider) {
                slider.addEventListener('mousedown', () => { 
                    this.isUserInteracting = true; 
                });
                slider.addEventListener('mouseup', () => { 
                    this.isUserInteracting = false; 
                });
                slider.addEventListener('touchstart', () => { 
                    this.isUserInteracting = true; 
                });
                slider.addEventListener('touchend', () => { 
                    this.isUserInteracting = false; 
                });
                
                const handleSliderUpdate = (e) => {
                    let value = parseInt(e.target.value);
                    // Apply deadzone: if in bottom 5%, set to 0
                    value = this.applyDeadzone(value);
                    
                    // Update slider value if deadzone was applied
                    if (value !== parseInt(e.target.value)) {
                        e.target.value = value;
                    }
                    
                    // Update visual fill (horizontal - uses width)
                    const fillEl = document.getElementById(`${sliderId}-bar-fill`);
                    if (fillEl) fillEl.style.width = `${value}%`;
                    
                    // Store in zonePolicies and trigger allocation update
                    this.updateZonePolicy(`${sliderId}_priority`, value);
                };
                
                slider.addEventListener('input', handleSliderUpdate);
                slider.addEventListener('change', (e) => {
                    this.isUserInteracting = false;
                    handleSliderUpdate(e);
                });
            }
        }
        
    }
    
    renderAllocations(zoneId) {
        const allocationsContainer = document.getElementById('command-allocations-container');
        if (!allocationsContainer || !this.gameState) return;
        
        const probeAllocationsByZone = this.gameState.probe_allocations_by_zone || {};
        const zoneAllocations = probeAllocationsByZone[zoneId] || {};
        
        // Get actual probe count for this zone
        const probesByZone = this.gameState.probes_by_zone || {};
        const zoneProbes = probesByZone[zoneId] || {};
        const totalProbes = zoneProbes['probe'] || 0;
        
        // Format function: show float with one decimal, or scientific notation when > 100
        const formatProbeCount = (count) => {
            if (count === 0) return '0.0';
            // Use scientific notation for values > 100
            if (count > 100) {
                return count.toExponential(2);
            }
            // Show one decimal place for values <= 100
            return count.toFixed(1);
        };
        
        let html = '<div class="probe-summary-label" style="margin-top: 12px; margin-bottom: 8px;">Allocations</div>';
        html += '<div class="probe-summary-breakdown">';
        
        // Get allocation percentages (0-1 values) - these are now simple numbers
        const harvestPercent = typeof zoneAllocations.harvest === 'number' ? zoneAllocations.harvest : 0;
        const constructPercent = typeof zoneAllocations.construct === 'number' ? zoneAllocations.construct : 0;
        const replicatePercent = typeof zoneAllocations.replicate === 'number' ? zoneAllocations.replicate : 0;
        const dysonPercent = typeof zoneAllocations.dyson === 'number' ? zoneAllocations.dyson : 0;
        const recyclePercent = typeof zoneAllocations.recycle === 'number' ? zoneAllocations.recycle : 0;
        const recycleProbesPercent = typeof zoneAllocations.recycle_probes === 'number' ? zoneAllocations.recycle_probes : 0;
        
        // Calculate actual probe counts (probe count * allocation percentage)
        const harvestCount = totalProbes * harvestPercent;
        const constructCount = totalProbes * constructPercent;
        const replicateCount = totalProbes * replicatePercent;
        const dysonCount = totalProbes * dysonPercent;
        const recycleCount = totalProbes * recyclePercent;
        const recycleProbesCount = totalProbes * recycleProbesPercent;
        
        // Calculate idle probes (unassigned to any activity)
        const assignedCount = harvestCount + constructCount + replicateCount + dysonCount + recycleCount + recycleProbesCount;
        const idleCount = Math.max(0, totalProbes - assignedCount);
        
        // Show allocations based on zone type
        const zones = window.orbitalZoneSelector?.orbitalZones || [];
        const zone = zones.find(z => z.id === zoneId);
        const isDysonZone = zone && zone.is_dyson_zone;
        
        if (isDysonZone) {
            if (dysonCount > 0) {
                html += `<div class="probe-summary-breakdown-item"><span class="probe-summary-breakdown-label">Dyson:</span><span class="probe-summary-breakdown-value">${formatProbeCount(dysonCount)}</span></div>`;
            }
            if (constructCount > 0) {
                html += `<div class="probe-summary-breakdown-item"><span class="probe-summary-breakdown-label">Construct:</span><span class="probe-summary-breakdown-value">${formatProbeCount(constructCount)}</span></div>`;
            }
            if (replicateCount > 0) {
                html += `<div class="probe-summary-breakdown-item"><span class="probe-summary-breakdown-label">Replicate:</span><span class="probe-summary-breakdown-value">${formatProbeCount(replicateCount)}</span></div>`;
            }
            if (recycleCount > 0) {
                html += `<div class="probe-summary-breakdown-item"><span class="probe-summary-breakdown-label">Recycle Slag:</span><span class="probe-summary-breakdown-value">${formatProbeCount(recycleCount)}</span></div>`;
            }
            if (recycleProbesCount > 0) {
                html += `<div class="probe-summary-breakdown-item"><span class="probe-summary-breakdown-label">Recycle Probes:</span><span class="probe-summary-breakdown-value">${formatProbeCount(recycleProbesCount)}</span></div>`;
            }
        } else {
            if (harvestCount > 0) {
                html += `<div class="probe-summary-breakdown-item"><span class="probe-summary-breakdown-label">Mine:</span><span class="probe-summary-breakdown-value">${formatProbeCount(harvestCount)}</span></div>`;
            }
            if (constructCount > 0) {
                html += `<div class="probe-summary-breakdown-item"><span class="probe-summary-breakdown-label">Construct:</span><span class="probe-summary-breakdown-value">${formatProbeCount(constructCount)}</span></div>`;
            }
            if (replicateCount > 0) {
                html += `<div class="probe-summary-breakdown-item"><span class="probe-summary-breakdown-label">Replicate:</span><span class="probe-summary-breakdown-value">${formatProbeCount(replicateCount)}</span></div>`;
            }
            if (recycleCount > 0) {
                html += `<div class="probe-summary-breakdown-item"><span class="probe-summary-breakdown-label">Recycle Slag:</span><span class="probe-summary-breakdown-value">${formatProbeCount(recycleCount)}</span></div>`;
            }
            if (recycleProbesCount > 0) {
                html += `<div class="probe-summary-breakdown-item"><span class="probe-summary-breakdown-label">Recycle Probes:</span><span class="probe-summary-breakdown-value">${formatProbeCount(recycleProbesCount)}</span></div>`;
            }
        }
        
        // Show idle probes if any
        if (idleCount > 0.001) {
            html += `<div class="probe-summary-breakdown-item" style="color: rgba(255,150,100,0.7);"><span class="probe-summary-breakdown-label">Idle:</span><span class="probe-summary-breakdown-value">${formatProbeCount(idleCount)}</span></div>`;
        }
        
        if (totalProbes === 0) {
            html += '<div class="probe-summary-breakdown-item">No probes in zone</div>';
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
            // Store policy value locally for slider sync
            if (!this.zonePolicies) {
                this.zonePolicies = {};
            }
            if (!this.zonePolicies[this.selectedZone]) {
                this.zonePolicies[this.selectedZone] = {};
            }
            this.zonePolicies[this.selectedZone][policyKey] = value;
            
            // Convert slider values to probe allocations and send to worker
            await this.updateProbeAllocationsFromSliders();
        } catch (error) {
            console.error('Failed to update zone policy:', error);
        }
    }
    
    /**
     * Convert slider priority values to probe allocations using formula:
     * p = v^2 / (v1 + v2 + v3 + v4 + v5 + v6)
     * where v1-v6 are the slider values (0-1), including idle
     * Idle probes do not consume energy or perform tasks
     */
    async updateProbeAllocationsFromSliders() {
        if (!this.selectedZone || typeof window.gameEngine === 'undefined' || !window.gameEngine) {
            return;
        }
        
        try {
            // Get zone info
            const zones = window.orbitalZoneSelector?.orbitalZones || [];
            const zone = zones.find(z => z.id === this.selectedZone);
            const isDysonZone = zone && zone.is_dyson_zone;
            
            // Read current slider values directly from DOM (most up-to-date)
            // Slider values are 0-100, convert to 0-1 for calculation
            let v1, v2, v3, v4, v5, v6;
            
            if (isDysonZone) {
                // Dyson zone: v1 = dyson priority (replaces mine)
                const dysonSlider = document.getElementById('dyson-slider');
                const replicateSlider = document.getElementById('replicate-slider');
                const constructSlider = document.getElementById('construct-slider');
                const recycleSlider = document.getElementById('recycle-slider');
                const recycleProbesSlider = document.getElementById('recycle_probes-slider');
                const idleSlider = document.getElementById('idle-slider');
                
                v1 = (parseInt(dysonSlider?.value) || 0) / 100;
                v2 = (parseInt(replicateSlider?.value) || 0) / 100;
                v3 = (parseInt(constructSlider?.value) || 0) / 100;
                v4 = (parseInt(recycleSlider?.value) || 0) / 100;
                v5 = (parseInt(recycleProbesSlider?.value) || 0) / 100;
                v6 = (parseInt(idleSlider?.value) || 0) / 100;
            } else {
                // Regular zone: v1 = mine priority
                const mineSlider = document.getElementById('mine-slider');
                const replicateSlider = document.getElementById('replicate-slider');
                const constructSlider = document.getElementById('construct-slider');
                const recycleSlider = document.getElementById('recycle-slider');
                const recycleProbesSlider = document.getElementById('recycle_probes-slider');
                const idleSlider = document.getElementById('idle-slider');
                
                v1 = (parseInt(mineSlider?.value) || 0) / 100;
                v2 = (parseInt(replicateSlider?.value) || 0) / 100;
                v3 = (parseInt(constructSlider?.value) || 0) / 100;
                v4 = (parseInt(recycleSlider?.value) || 0) / 100;
                v5 = (parseInt(recycleProbesSlider?.value) || 0) / 100;
                v6 = (parseInt(idleSlider?.value) || 0) / 100;
            }
            
            // Apply deadzone: values <= 0.05 become 0
            if (v1 <= 0.05) v1 = 0;
            if (v2 <= 0.05) v2 = 0;
            if (v3 <= 0.05) v3 = 0;
            if (v4 <= 0.05) v4 = 0;
            if (v5 <= 0.05) v5 = 0;
            if (v6 <= 0.05) v6 = 0;
            
            // Update zonePolicies cache
            if (!this.zonePolicies[this.selectedZone]) {
                this.zonePolicies[this.selectedZone] = {};
            }
            if (isDysonZone) {
                this.zonePolicies[this.selectedZone].dyson_priority = v1 * 100;
            } else {
                this.zonePolicies[this.selectedZone].mine_priority = v1 * 100;
            }
            this.zonePolicies[this.selectedZone].replicate_priority = v2 * 100;
            this.zonePolicies[this.selectedZone].construct_priority = v3 * 100;
            this.zonePolicies[this.selectedZone].recycle_priority = v4 * 100;
            this.zonePolicies[this.selectedZone].recycle_probes_priority = v5 * 100;
            this.zonePolicies[this.selectedZone].idle_priority = v6 * 100;
            
            // Calculate allocations using formula: p = v^2 / (v1 + v2 + v3 + v4 + v5 + v6)
            const v1Sq = v1 * v1;
            const v2Sq = v2 * v2;
            const v3Sq = v3 * v3;
            const v4Sq = v4 * v4;
            const v5Sq = v5 * v5;
            const v6Sq = v6 * v6;
            const sum = v1 + v2 + v3 + v4 + v5 + v6;
            
            let allocations = {};
            
            if (sum > 0) {
                if (isDysonZone) {
                    allocations = {
                        dyson: v1Sq / sum,
                        replicate: v2Sq / sum,
                        construct: v3Sq / sum,
                        recycle: v4Sq / sum,
                        recycle_probes: v5Sq / sum,
                        idle: v6Sq / sum,
                        harvest: 0
                    };
                } else {
                    allocations = {
                        harvest: v1Sq / sum,
                        replicate: v2Sq / sum,
                        construct: v3Sq / sum,
                        recycle: v4Sq / sum,
                        recycle_probes: v5Sq / sum,
                        idle: v6Sq / sum,
                        dyson: 0
                    };
                }
            } else {
                // All sliders at 0, set default allocation (all idle)
                allocations = { dyson: 0, harvest: 0, replicate: 0, construct: 0, recycle: 0, recycle_probes: 0, idle: 1 };
            }
            
            // Calculate mass limits from slider values (0-1)
            // These limits define the maximum percentage of zone mass for each activity
            // For recycle_probes: the limit means probes should not exceed (1 - limit) of zone mass
            const massLimits = {
                replicate: v2,      // Max probe mass = replicate slider % of zone mass
                construct: v3,      // Max structure mass = construct slider % of zone mass
                recycle_probes: v5  // Recycle until probes are <= (1 - slider%) of zone mass
            };
            
            // Send to worker via performAction
            await window.gameEngine.performAction('allocate_probes', {
                zone_id: this.selectedZone,
                allocations: allocations,
                mass_limits: massLimits
            });
        } catch (error) {
            console.error('Failed to update probe allocations:', error);
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
        if (!gameState) return;
        
        // Change detection: Only update if relevant data has changed
        // Use efficient hash instead of JSON.stringify to avoid memory issues
        let hash = 0;
        if (this.selectedZone) {
            for (let i = 0; i < this.selectedZone.length; i++) {
                hash = ((hash << 5) - hash) + this.selectedZone.charCodeAt(i);
            }
        }
        
        // Hash allocations efficiently - single probe type: direct access
        const allocationsByZone = gameState.probe_allocations_by_zone || {};
        for (const [zoneId, allocations] of Object.entries(allocationsByZone)) {
            hash = ((hash << 5) - hash) + zoneId.charCodeAt(0);
            if (allocations && typeof allocations === 'object') {
                // Single probe type: directly access 'probe' key instead of iterating
                hash = ((hash << 5) - hash) + (allocations.dyson?.probe || 0);
                hash = ((hash << 5) - hash) + (allocations.replicate?.probe || 0);
                hash = ((hash << 5) - hash) + (allocations.harvest?.probe || 0);
                hash = ((hash << 5) - hash) + (allocations.construct?.probe || 0);
            }
        }
        
        const currentHash = hash.toString();
        
        if (currentHash === this.lastUpdateHash && this.lastUpdateHash !== null && this.selectedZone === this.lastSelectedZone) {
            return; // No changes, skip update
        }
        this.lastUpdateHash = currentHash;
        this.lastSelectedZone = this.selectedZone;
        
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
        
        // Render sliders for selected zone (only if zone changed)
        if (this.selectedZone) {
            // Only re-render sliders if zone selection changed
            if (this.selectedZone !== this.lastRenderedZone) {
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
                this.lastRenderedZone = this.selectedZone;
            } else {
                // Zone hasn't changed, just update slider values and allocations
                // Don't sync sliders if user is actively interacting with them
                // This prevents overwriting user's slider settings
                if (!this.isUserInteracting) {
                    // Try multiple ways to get zones
                    let zones = [];
                    if (window.orbitalZoneSelector && window.orbitalZoneSelector.orbitalZones) {
                        zones = window.orbitalZoneSelector.orbitalZones;
                    } else if (window.app && window.app.orbitalZoneSelector && window.app.orbitalZoneSelector.orbitalZones) {
                        zones = window.app.orbitalZoneSelector.orbitalZones;
                    }
                    
                    const zone = zones.find(z => z.id === this.selectedZone);
                    if (zone) {
                        const isDysonZone = zone.is_dyson_zone;
                        // Only sync if we don't have cached values (preserve user settings)
                        const hasCachedValues = this.zonePolicies[this.selectedZone] && 
                            Object.keys(this.zonePolicies[this.selectedZone]).length > 0;
                        if (!hasCachedValues) {
                            this.syncSlidersWithPolicy(this.selectedZone, isDysonZone);
                        }
                    }
                }
                // Always update allocations and buildings (these reflect game state)
                this.renderAllocations(this.selectedZone);
                this.renderBuildings(this.selectedZone);
            }
        } else {
            if (this.lastRenderedZone !== null) {
                // Zone deselected, clear UI
                this.lastRenderedZone = null;
            }
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
        
        // Slider updates are now handled via syncSlidersWithPolicy which is called above
        // The new priority-based sliders sync from probe_allocations_by_zone
        
        // Update allocations display
        if (this.selectedZone) {
            this.renderAllocations(this.selectedZone);
        }
    }
}
