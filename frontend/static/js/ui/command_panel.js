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
        this.update(this.gameState); // Refresh display with new zone
    }

    init() {
        this.render();
    }

    render() {
        if (!this.container) return;

        let html = '<div class="command-section-simple">';
        
        // Zone selection header
        if (!this.selectedZone) {
            html += '<div style="padding: 10px; text-align: center; color: rgba(255, 255, 255, 0.6);">Select an orbital zone to configure</div>';
        } else {
            const zones = window.orbitalZoneSelector?.orbitalZones || [];
            const zone = zones.find(z => z.id === this.selectedZone);
            const zoneName = zone ? zone.name.replace(/\s+Orbit\s*$/i, '') : this.selectedZone;
            html += `<div style="padding: 10px; text-align: center; background: rgba(74, 158, 255, 0.2); border-bottom: 1px solid rgba(74, 158, 255, 0.3); margin-bottom: 10px;">`;
            html += `<strong>Zone: ${zoneName}</strong>`;
            html += `</div>`;
        }
        
        // Create a flex container for sliders
        html += '<div class="command-bars-container">';
        
        if (this.selectedZone) {
            const zones = window.orbitalZoneSelector?.orbitalZones || [];
            const zone = zones.find(z => z.id === this.selectedZone);
            const isDysonZone = zone && zone.is_dyson_zone;
            
            if (isDysonZone) {
                // Dyson zone: Replicate vs Construct, and Compute vs Economy
                html += '<div class="command-bar-group">';
                html += '<div class="command-bar-label-top">Replicate</div>';
                html += '<div class="command-bar-track" id="dyson-replicate-construct-bar-track">';
                html += '<div class="command-bar-fill" id="dyson-replicate-construct-bar-fill" style="height: 50%;"></div>';
                html += '<div class="command-bar-line" id="dyson-replicate-construct-bar-line" style="bottom: 50%;"></div>';
                html += '<input type="range" id="dyson-replicate-construct-slider" class="command-bar-slider" min="0" max="100" value="50" step="1" orient="vertical">';
                html += '<div class="command-bar-tooltip" id="dyson-replicate-construct-tooltip"></div>';
                html += '</div>';
                html += '<div class="command-bar-label-bottom">Construct</div>';
                html += '</div>';
                
                html += '<div class="command-bar-group">';
                html += '<div class="command-bar-label-top">Compute</div>';
                html += '<div class="command-bar-track" id="dyson-compute-economy-bar-track">';
                html += '<div class="command-bar-fill" id="dyson-compute-economy-bar-fill" style="height: 0%;"></div>';
                html += '<div class="command-bar-line" id="dyson-compute-economy-bar-line" style="bottom: 0%;"></div>';
                html += '<input type="range" id="dyson-compute-economy-slider" class="command-bar-slider" min="0" max="100" value="0" step="1" orient="vertical">';
                html += '<div class="command-bar-tooltip" id="dyson-compute-economy-tooltip"></div>';
                html += '</div>';
                html += '<div class="command-bar-label-bottom">Economy</div>';
                html += '</div>';
            } else {
                // Regular zones: Harvest vs Build, and Construct vs Replicate
                html += '<div class="command-bar-group">';
                html += '<div class="command-bar-label-top">Harvest</div>';
                html += '<div class="command-bar-track" id="harvest-build-bar-track">';
                html += '<div class="command-bar-fill" id="harvest-build-bar-fill" style="height: 0%;"></div>';
                html += '<div class="command-bar-line" id="harvest-build-bar-line" style="bottom: 0%;"></div>';
                html += '<input type="range" id="harvest-build-slider" class="command-bar-slider" min="0" max="100" value="0" step="1" orient="vertical">';
                html += '<div class="command-bar-tooltip" id="harvest-build-tooltip"></div>';
                html += '</div>';
                html += '<div class="command-bar-label-bottom">Build</div>';
                html += '</div>';
                
                html += '<div class="command-bar-group">';
                html += '<div class="command-bar-label-top">Construct</div>';
                html += '<div class="command-bar-track" id="construct-replicate-bar-track">';
                html += '<div class="command-bar-fill" id="construct-replicate-bar-fill" style="height: 0%;"></div>';
                html += '<div class="command-bar-line" id="construct-replicate-bar-line" style="bottom: 0%;"></div>';
                html += '<input type="range" id="construct-replicate-slider" class="command-bar-slider" min="0" max="100" value="0" step="1" orient="vertical">';
                html += '<div class="command-bar-tooltip" id="construct-replicate-tooltip"></div>';
                html += '</div>';
                html += '<div class="command-bar-label-bottom">Replicate</div>';
                html += '</div>';
            }
        }

        html += '</div>'; // End bars container
        html += '</div>'; // End command section

        this.container.innerHTML = html;

        // Set up event listeners
        this.setupEventListeners();
        
        // Set up tooltip event listeners
        this.setupTooltips();
    }

    setupTooltips() {
        const bars = [
            { id: 'dyson-bar-track', tooltipId: 'dyson-tooltip', type: 'dyson' },
            { id: 'economy-bar-track', tooltipId: 'economy-tooltip', type: 'economy' },
            { id: 'build-bar-track', tooltipId: 'build-tooltip', type: 'build' }
        ];

        bars.forEach(({ id, tooltipId, type }) => {
            const bar = document.getElementById(id);
            const tooltip = document.getElementById(tooltipId);
            if (bar && tooltip) {
                bar.addEventListener('mouseenter', () => {
                    this.showBarTooltip(type, tooltip, bar);
                });
                bar.addEventListener('mouseleave', () => {
                    tooltip.style.display = 'none';
                });
            }
        });
    }

    showBarTooltip(type, tooltipEl, barEl) {
        if (!this.gameState) return;

        const rect = barEl.getBoundingClientRect();
        const totalProbes = this.gameState.probes?.probe || 0;
        
        let html = '<div class="command-tooltip-content">';
        
        if (type === 'dyson') {
            const dysonSlider = document.getElementById('dyson-slider');
            const dysonPercent = dysonSlider ? parseInt(dysonSlider.value) : 0;
            const dysonProbes = Math.floor((totalProbes * dysonPercent) / 100);
            const economyProbes = totalProbes - dysonProbes;
            html += `<div>Dyson: ${dysonProbes}</div>`;
            html += `<div>Economy: ${economyProbes}</div>`;
        } else if (type === 'economy') {
            const dysonSlider = document.getElementById('dyson-slider');
            const economyActivitySlider = document.getElementById('economy-activity-slider');
            const dysonPercent = dysonSlider ? parseInt(dysonSlider.value) : 0;
            const economyActivityPercent = economyActivitySlider ? parseInt(economyActivitySlider.value) : 0;
            const economyProbes = totalProbes - Math.floor((totalProbes * dysonPercent) / 100);
            const harvestPercent = 100 - economyActivityPercent;
            const buildPercent = economyActivityPercent;
            const harvestProbes = Math.floor((economyProbes * harvestPercent) / 100);
            const buildProbes = economyProbes - harvestProbes;
            html += `<div>Build: ${buildProbes}</div>`;
            html += `<div>Mine: ${harvestProbes}</div>`;
        } else if (type === 'build') {
            const dysonSlider = document.getElementById('dyson-slider');
            const economyActivitySlider = document.getElementById('economy-activity-slider');
            const buildAllocationSlider = document.getElementById('build-allocation-slider');
            const dysonPercent = dysonSlider ? parseInt(dysonSlider.value) : 0;
            const economyActivityPercent = economyActivitySlider ? parseInt(economyActivitySlider.value) : 0;
            const buildAllocationPercent = buildAllocationSlider ? parseInt(buildAllocationSlider.value) : 50;
            const economyProbes = totalProbes - Math.floor((totalProbes * dysonPercent) / 100);
            const harvestPercent = 100 - economyActivityPercent;
            const buildProbes = economyProbes - Math.floor((economyProbes * harvestPercent) / 100);
            const structureProbes = Math.floor((buildProbes * (100 - buildAllocationPercent)) / 100);
            const probeProbes = buildProbes - structureProbes;
            html += `<div>Probe: ${probeProbes}</div>`;
            html += `<div>Structure: ${structureProbes}</div>`;
        } else if (type === 'dyson-power') {
            const dysonPowerSlider = document.getElementById('dyson-power-slider');
            const dysonPowerPercent = dysonPowerSlider ? parseInt(dysonPowerSlider.value) : 0;
            const computePercent = dysonPowerPercent;
            const economyPercent = 100 - dysonPowerPercent;
            html += `<div>Compute: ${computePercent}%</div>`;
            html += `<div>Economy: ${economyPercent}%</div>`;
        }
        
        html += '</div>';
        tooltipEl.innerHTML = html;
        tooltipEl.style.display = 'block';
        
        // Position tooltip to the left of the bar
        tooltipEl.style.left = `${rect.left - tooltipEl.offsetWidth - 10}px`;
        tooltipEl.style.top = `${rect.top + (rect.height / 2) - (tooltipEl.offsetHeight / 2)}px`;
        tooltipEl.style.right = 'auto';
    }

    setupEventListeners() {
        if (!this.selectedZone) return;
        
        const zones = window.orbitalZoneSelector?.orbitalZones || [];
        const zone = zones.find(z => z.id === this.selectedZone);
        const isDysonZone = zone && zone.is_dyson_zone;
        
        if (isDysonZone) {
            // Dyson zone: Replicate vs Construct slider
            const replicateConstructSlider = document.getElementById('dyson-replicate-construct-slider');
            if (replicateConstructSlider) {
                replicateConstructSlider.addEventListener('mousedown', () => { this.isUserInteracting = true; });
                replicateConstructSlider.addEventListener('mouseup', () => { this.isUserInteracting = false; });
                replicateConstructSlider.addEventListener('input', (e) => {
                    const value = parseInt(e.target.value);
                    // Invert: slider value is replicate %, but we store construct %
                    const constructValue = 100 - value;
                    const fillEl = document.getElementById('dyson-replicate-construct-bar-fill');
                    const lineEl = document.getElementById('dyson-replicate-construct-bar-line');
                    if (fillEl) fillEl.style.height = `${value}%`;
                    if (lineEl) lineEl.style.bottom = `${value}%`;
                    this.updateZonePolicy('construct_slider', constructValue);
                });
            }
            
            // Dyson zone: Compute vs Economy slider
            const computeEconomySlider = document.getElementById('dyson-compute-economy-slider');
            if (computeEconomySlider) {
                computeEconomySlider.addEventListener('mousedown', () => { this.isUserInteracting = true; });
                computeEconomySlider.addEventListener('mouseup', () => { this.isUserInteracting = false; });
                computeEconomySlider.addEventListener('input', (e) => {
                    const value = parseInt(e.target.value);
                    const fillEl = document.getElementById('dyson-compute-economy-bar-fill');
                    const lineEl = document.getElementById('dyson-compute-economy-bar-line');
                    if (fillEl) fillEl.style.height = `${value}%`;
                    if (lineEl) lineEl.style.bottom = `${value}%`;
                    // Update Dyson power allocation (0 = all economy, 100 = all compute)
                    this.updateDysonPowerAllocation(value);
                });
            }
        } else {
            // Regular zones: Harvest vs Build slider
            const harvestBuildSlider = document.getElementById('harvest-build-slider');
            if (harvestBuildSlider) {
                harvestBuildSlider.addEventListener('mousedown', () => { this.isUserInteracting = true; });
                harvestBuildSlider.addEventListener('mouseup', () => { this.isUserInteracting = false; });
                harvestBuildSlider.addEventListener('input', (e) => {
                    const value = parseInt(e.target.value);
                    // mining_slider: 0 = all build, 100 = all mine, so value is harvest %
                    const fillEl = document.getElementById('harvest-build-bar-fill');
                    const lineEl = document.getElementById('harvest-build-bar-line');
                    if (fillEl) fillEl.style.height = `${value}%`;
                    if (lineEl) lineEl.style.bottom = `${value}%`;
                    this.updateZonePolicy('mining_slider', value);
                });
            }
            
            // Regular zones: Construct vs Replicate slider
            const constructReplicateSlider = document.getElementById('construct-replicate-slider');
            if (constructReplicateSlider) {
                constructReplicateSlider.addEventListener('mousedown', () => { this.isUserInteracting = true; });
                constructReplicateSlider.addEventListener('mouseup', () => { this.isUserInteracting = false; });
                constructReplicateSlider.addEventListener('input', (e) => {
                    const value = parseInt(e.target.value);
                    // Invert: slider value is construct %, but we store replication_slider (0 = all construct, 100 = all replicate)
                    const replicationValue = 100 - value;
                    const fillEl = document.getElementById('construct-replicate-bar-fill');
                    const lineEl = document.getElementById('construct-replicate-bar-line');
                    if (fillEl) fillEl.style.height = `${value}%`;
                    if (lineEl) lineEl.style.bottom = `${value}%`;
                    this.updateZonePolicy('replication_slider', replicationValue);
                });
            }
        }
    }

    updateCapacityLabels() {
        // Capacity labels removed - simplified UI
        // This method kept for compatibility but no longer updates UI
    }

    async updateZonePolicy(policyKey, value) {
        if (!this.selectedZone) return;
        try {
            if (typeof gameEngine !== 'undefined' && gameEngine.setZonePolicy) {
                await gameEngine.setZonePolicy(this.selectedZone, policyKey, value);
            } else {
                // Fallback: update directly in game state
                if (!gameEngine.zonePolicies) gameEngine.zonePolicies = {};
                if (!gameEngine.zonePolicies[this.selectedZone]) {
                    gameEngine.zonePolicies[this.selectedZone] = {};
                }
                gameEngine.zonePolicies[this.selectedZone][policyKey] = value;
            }
        } catch (error) {
            console.error('Failed to update zone policy:', error);
        }
    }

    async updateBuildAllocation(value) {
        try {
            await gameEngine.performAction('set_build_allocation', { value: value });
        } catch (error) {
            console.error('Failed to update build allocation:', error);
        }
    }

    async updateDysonPowerAllocation(value) {
        try {
            if (typeof gameEngine !== 'undefined' && gameEngine.engine) {
                gameEngine.engine.dysonPowerAllocation = value;
            } else if (typeof gameEngine !== 'undefined' && gameEngine.dysonPowerAllocation !== undefined) {
                gameEngine.dysonPowerAllocation = value;
            }
        } catch (error) {
            console.error('Failed to update Dyson power allocation:', error);
        }
    }

    async updateProbeAllocations() {
        if (!this.gameState) return;

        const dysonSlider = document.getElementById('dyson-slider');
        const economyActivitySlider = document.getElementById('economy-activity-slider');

        if (!dysonSlider || !economyActivitySlider) return;

        const dysonPercent = parseInt(dysonSlider.value);
        const economyActivityPercent = parseInt(economyActivitySlider.value); // 0 = all Harvest, 100 = all Build

        const totalProbes = this.gameState.probes?.probe || 0;
        
        // Level 1: Split between Dyson and Economy (use floats)
        const dysonProbes = (totalProbes * dysonPercent) / 100;
        const economyProbes = totalProbes - dysonProbes;
        
        // Level 2: Split Economy between Harvest and Build (use floats)
        const harvestPercent = 100 - economyActivityPercent; // Invert: 0% slider = 100% harvest
        const buildPercent = economyActivityPercent;
        const harvestCount = (economyProbes * harvestPercent) / 100;
        const buildCount = economyProbes - harvestCount;

        try {
            await gameEngine.allocateProbes({
                construct: { probe: Math.max(0, buildCount) },
                harvest: { probe: harvestCount },
                dyson: { probe: dysonProbes }
            });
        } catch (error) {
            console.error('Failed to update probe allocations:', error);
        }
    }

    update(gameState) {
        this.gameState = gameState;

        if (!this.container) return;
        
        // Re-render if zone selection changed or if sliders don't exist
        const zones = window.orbitalZoneSelector?.orbitalZones || [];
        const zone = this.selectedZone ? zones.find(z => z.id === this.selectedZone) : null;
        const zoneName = zone ? zone.name.replace(/\s+Orbit\s*$/i, '') : null;
        const currentZoneHeader = this.container.querySelector('.command-section-simple > div:first-child');
        const needsRerender = !currentZoneHeader || 
            (this.selectedZone && !currentZoneHeader.textContent.includes(zoneName)) ||
            (this.selectedZone && !document.getElementById('dyson-replicate-construct-slider') && 
             !document.getElementById('harvest-build-slider'));
        
        if (needsRerender) {
            this.render();
            this.setupEventListeners();
        }

        if (!this.selectedZone) return;

        // Don't update slider VALUES if user is actively interacting
        const wasInteracting = this.isUserInteracting;
        
        const isDysonZone = zone && zone.is_dyson_zone;
        const zonePolicies = gameState.zone_policies || {};
        const zonePolicy = zonePolicies[this.selectedZone] || {};
        
        if (isDysonZone) {
            // Dyson zone: Update replicate vs construct slider (invert: store construct, display replicate)
            const replicateConstructSlider = document.getElementById('dyson-replicate-construct-slider');
            const constructValue = zonePolicy.construct_slider !== undefined ? zonePolicy.construct_slider : 50;
            const replicateValue = 100 - constructValue; // Display replicate %
            if (replicateConstructSlider && !wasInteracting && parseInt(replicateConstructSlider.value) != replicateValue) {
                replicateConstructSlider.value = replicateValue;
                const fillEl = document.getElementById('dyson-replicate-construct-bar-fill');
                const lineEl = document.getElementById('dyson-replicate-construct-bar-line');
                if (fillEl) fillEl.style.height = `${replicateValue}%`;
                if (lineEl) lineEl.style.bottom = `${replicateValue}%`;
            }
            
            // Dyson zone: Update compute vs economy slider
            const computeEconomySlider = document.getElementById('dyson-compute-economy-slider');
            const computeValue = gameState.dyson_power_allocation !== undefined ? gameState.dyson_power_allocation : 0;
            if (computeEconomySlider && !wasInteracting && parseInt(computeEconomySlider.value) != computeValue) {
                computeEconomySlider.value = computeValue;
                const fillEl = document.getElementById('dyson-compute-economy-bar-fill');
                const lineEl = document.getElementById('dyson-compute-economy-bar-line');
                if (fillEl) fillEl.style.height = `${computeValue}%`;
                if (lineEl) lineEl.style.bottom = `${computeValue}%`;
            }
        } else {
            // Regular zones: Update harvest vs build slider
            const harvestBuildSlider = document.getElementById('harvest-build-slider');
            const miningValue = zonePolicy.mining_slider !== undefined ? zonePolicy.mining_slider : 50;
            // mining_slider: 0 = all build, 100 = all mine, so display as harvest %
            if (harvestBuildSlider && !wasInteracting && parseInt(harvestBuildSlider.value) != miningValue) {
                harvestBuildSlider.value = miningValue;
                const fillEl = document.getElementById('harvest-build-bar-fill');
                const lineEl = document.getElementById('harvest-build-bar-line');
                if (fillEl) fillEl.style.height = `${miningValue}%`;
                if (lineEl) lineEl.style.bottom = `${miningValue}%`;
            }
            
            // Regular zones: Update construct vs replicate slider (invert: store replication, display construct)
            const constructReplicateSlider = document.getElementById('construct-replicate-slider');
            const replicationValue = zonePolicy.replication_slider !== undefined ? zonePolicy.replication_slider : 50;
            const constructValue = 100 - replicationValue; // Display construct %
            if (constructReplicateSlider && !wasInteracting && parseInt(constructReplicateSlider.value) != constructValue) {
                constructReplicateSlider.value = constructValue;
                const fillEl = document.getElementById('construct-replicate-bar-fill');
                const lineEl = document.getElementById('construct-replicate-bar-line');
                if (fillEl) fillEl.style.height = `${constructValue}%`;
                if (lineEl) lineEl.style.bottom = `${constructValue}%`;
            }
        }
    }

    updateTooltips() {
        // Update tooltip content if tooltips are currently visible
        const bars = [
            { id: 'dyson-bar-track', tooltipId: 'dyson-tooltip', type: 'dyson' },
            { id: 'economy-bar-track', tooltipId: 'economy-tooltip', type: 'economy' },
            { id: 'build-bar-track', tooltipId: 'build-tooltip', type: 'build' },
            { id: 'dyson-power-bar-track', tooltipId: 'dyson-power-tooltip', type: 'dyson-power' }
        ];

        bars.forEach(({ tooltipId, type }) => {
            const tooltip = document.getElementById(tooltipId);
            if (tooltip && tooltip.style.display === 'block') {
                const bar = document.getElementById(tooltipId.replace('-tooltip', '-track'));
                if (bar) {
                    this.showBarTooltip(type, tooltip, bar);
                }
            }
        });
    }
}
