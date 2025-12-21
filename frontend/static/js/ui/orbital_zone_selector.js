/** Orbital Zone Selector - Clickable bars for selecting harvest location */
class OrbitalZoneSelector {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.gameState = null;
        this.orbitalZones = null;
        this.selectedZone = 'earth'; // Default to Earth
        this.transferSourceZone = null; // First zone clicked for transfer
        this.probeDots = {}; // Track probe dots per zone: {zoneId: [dots]}
        this.transferArcs = []; // Active transfer arcs: [{from, to, type, count, rate, ...}]
        this.init();
        this.loadData();
    }

    async loadData() {
        try {
            const zonesResponse = await fetch('/game_data/orbital_mechanics.json');
            const zonesData = await zonesResponse.json();
            this.orbitalZones = zonesData.orbital_zones;
            this.render();
        } catch (error) {
            console.error('Failed to load orbital zones:', error);
        }
    }

    init() {
        if (!this.container) return;
    }

    formatScientific(value) {
        if (value === 0) return '0';
        return value.toExponential(2);
    }

    getEquivalentMasses(kg) {
        // Earth mass: ~5.97e24 kg
        const earthMass = 5.97e24;
        return {
            earth: kg / earthMass
        };
    }

    getZoneMass(zoneId) {
        // Get base mass for each zone (in kg)
        const earthMass = 5.97e24;
        const zoneMasses = {
            'mercury': 0.055 * earthMass,      // ~0.055 Earth masses
            'venus': 0.815 * earthMass,        // ~0.815 Earth masses
            'earth': 1.0 * earthMass,          // 1 Earth mass
            'mars': 0.107 * earthMass,           // ~0.107 Earth masses
            'asteroid_belt': 0.04 * earthMass, // ~0.04 Earth masses
            'jupiter': 317.8 * earthMass,      // ~317.8 Earth masses
            'saturn': 95.2 * earthMass,        // ~95.2 Earth masses
            'uranus': 14.5 * earthMass,        // ~14.5 Earth masses
            'neptune': 17.1 * earthMass,       // ~17.1 Earth masses
            'kuiper': 0.1 * earthMass,         // ~0.1 Earth masses
            'oort_cloud': 100.0 * earthMass     // 100 Earth masses (as specified)
        };
        return zoneMasses[zoneId] || 0;
    }

    calculateDeltaV(zone) {
        // Delta-v from sun to zone (simplified - proportional to radius_au)
        // Earth is baseline at 1.0 AU
        const earthRadiusAU = 1.0;
        const zoneRadiusAU = zone.radius_au || 1.0;
        
        // Delta-v scales roughly with sqrt of distance ratio (simplified)
        // Using delta_v_penalty as a multiplier
        const baseDeltaV = 30.0; // km/s baseline for Earth
        const deltaV = baseDeltaV * (1 + (zone.delta_v_penalty || 0.1));
        
        return deltaV;
    }

    calculateEnergyCost(zone) {
        // Energy cost per kg/s: Earth baseline = 100 kW per 1 kg/s
        // Scales with delta-v penalty
        const earthBaseline = 100; // kW per kg/s
        const deltaVPenalty = zone.delta_v_penalty || 0.1;
        const energyCost = earthBaseline * (1 + deltaVPenalty);
        
        return energyCost;
    }

    render() {
        if (!this.container || !this.orbitalZones) return;

        let html = '<div class="orbital-zone-selector-content">';
        html += '<div class="orbital-zone-bars">';

        // Calculate planet square sizes based on mass (for visual representation)
        const zoneMasses = {};
        let minMass = Infinity;
        let maxMass = -Infinity;
        
        this.orbitalZones.forEach(zone => {
            const zoneTotalMass = zone.total_mass_kg || this.getZoneMass(zone.id);
            zoneMasses[zone.id] = zoneTotalMass;
            if (zoneTotalMass > 0) {
                minMass = Math.min(minMass, zoneTotalMass);
                maxMass = Math.max(maxMass, zoneTotalMass);
            }
        });
        
        const massRange = maxMass - minMass || 1;
        const minSquareSize = 20; // Minimum square size in pixels
        const maxSquareSize = 50; // Maximum square size in pixels
        
        // Calculate total width for planet squares container to match tiles
        const tileWidth = 120;
        const tileGap = 15;
        const totalTilesWidth = this.orbitalZones.length * tileWidth + (this.orbitalZones.length - 1) * tileGap;
        
        // Render floating planet squares above the menu
        html += `<div class="orbital-zone-planet-squares" style="width: ${totalTilesWidth}px;">`;
        this.orbitalZones.forEach((zone, index) => {
            const zoneTotalMass = zoneMasses[zone.id] || 0;
            
            // Calculate square size proportional to planet mass
            const squareSize = zoneTotalMass > 0 ? 
                minSquareSize + ((zoneTotalMass - minMass) / massRange) * (maxSquareSize - minSquareSize) : 
                minSquareSize;
            const squareSizePx = Math.max(minSquareSize, Math.min(maxSquareSize, squareSize));
            
            // Position squares above their corresponding tiles
            // Tiles are centered using flexbox, so calculate position from center
            // Position from center: calculate offset for each tile
            // First tile starts at -totalWidth/2 + tileWidth/2
            const tileCenter = (index * (tileWidth + tileGap)) + (tileWidth / 2);
            const tileLeft = tileCenter - (totalTilesWidth / 2);
            
            // Calculate probe count for this zone
            let probeCount = 0;
            const probesByZone = (this.gameState && this.gameState.probes_by_zone) ? 
                this.gameState.probes_by_zone[zone.id] || {} : {};
            for (const [probeType, count] of Object.entries(probesByZone)) {
                probeCount += count;
            }
            
            // Calculate Dyson swarm mass for this zone (if applicable)
            // For now, show Dyson swarm dots around Earth zone only
            const dysonMass = (zone.id === 'earth' && this.gameState) ? 
                (this.gameState.dyson_sphere_mass || 0) : 0;
            const dysonTargetMass = (zone.id === 'earth' && this.gameState) ? 
                (this.gameState.dyson_sphere_target_mass || 5e21) : 0;
            const dysonCompletion = dysonTargetMass > 0 ? dysonMass / dysonTargetMass : 0;
            
            // Calculate number of dots to show (logarithmic scale)
            const maxDots = 20; // Maximum dots to show around each zone
            const probeDots = Math.min(maxDots, Math.max(0, Math.floor(Math.log10(Math.max(1, probeCount)) * 5)));
            const dysonDots = Math.min(maxDots, Math.floor(dysonCompletion * maxDots));
            const totalDots = probeDots + dysonDots;
            
            html += `<div class="orbital-zone-planet-square-float" 
                         data-zone="${zone.id}"
                         style="width: ${squareSizePx}px; 
                                height: ${squareSizePx}px; 
                                background-color: ${zone.color || '#4a9eff'};
                                left: calc(50% + ${tileLeft}px);">
                         <div class="orbital-zone-probe-dots-container" data-zone="${zone.id}"></div>
                     </div>`;
        });
        html += '</div>';
        
        // Render zone tiles (uniform size, no planet square inside)
        this.orbitalZones.forEach(zone => {
            const remainingMetal = (this.gameState && this.gameState.zone_metal_remaining) ? 
                (this.gameState.zone_metal_remaining[zone.id] || 0) : 0;
            
            // Calculate probe count in this zone
            let probeCount = 0;
            const probesByZone = (this.gameState && this.gameState.probes_by_zone) ? 
                this.gameState.probes_by_zone[zone.id] || {} : {};
            for (const [probeType, count] of Object.entries(probesByZone)) {
                probeCount += count;
            }
            
            // Remove "Orbit" from zone name
            const zoneName = zone.name.replace(/\s+Orbit\s*$/i, '');
            
            const isSelected = this.selectedZone === zone.id;
            const isTransferSource = this.transferSourceZone === zone.id && this.transferSourceZone !== this.selectedZone;
            let tileClass = '';
            if (isSelected && isTransferSource) {
                tileClass = 'selected transfer-source';
            } else if (isSelected) {
                tileClass = 'selected';
            } else if (isTransferSource) {
                tileClass = 'transfer-source';
            }
            
            html += `<div class="orbital-zone-tile ${tileClass}" data-zone="${zone.id}">`;
            html += `<div class="orbital-zone-tile-label">${zoneName}</div>`;
            html += `<div class="orbital-zone-tile-stats">`;
            html += `<div class="orbital-zone-stat">Probes: ${this.formatNumber(probeCount)}</div>`;
            html += `<div class="orbital-zone-stat">Metal: ${this.formatMass(remainingMetal)}</div>`;
            html += `</div>`;
            html += `</div>`;
        });

        html += '</div>';
        html += '</div>';

        this.container.innerHTML = html;

        // Set up event listeners
        this.setupTooltips();
        this.setupClickHandlers();
        
        // Update probe dots after render
        if (this.gameState) {
            this.updateProbeDots();
            this.updateTransferArcs();
        }
    }
    
    formatMass(kg) {
        if (!kg || kg === 0) return '0';
        if (kg < 1000) return kg.toFixed(1);
        if (kg < 1e6) return (kg / 1000).toFixed(1) + 'k';
        if (kg < 1e9) return (kg / 1e6).toFixed(1) + 'M';
        if (kg < 1e12) return (kg / 1e9).toFixed(2) + 'B';
        if (kg < 1e15) return (kg / 1e12).toFixed(2) + 'T';
        if (kg < 1e18) return (kg / 1e15).toFixed(2) + 'P';
        if (kg < 1e21) return (kg / 1e18).toFixed(2) + 'E';
        return kg.toExponential(2);
    }
    
    formatNumber(num) {
        if (!num || num === 0) return '0';
        if (num < 1) return num.toFixed(2);
        if (num < 1000) return Math.floor(num).toLocaleString('en-US');
        if (num < 1e6) return (num / 1000).toFixed(1) + 'k';
        if (num < 1e9) return (num / 1e6).toFixed(2) + 'M';
        if (num < 1e12) return (num / 1e9).toFixed(2) + 'B';
        return num.toExponential(2);
    }

    setupTooltips() {
        const tiles = this.container.querySelectorAll('.orbital-zone-tile[data-zone]');
        const planetSquares = this.container.querySelectorAll('.orbital-zone-planet-square-float[data-zone]');
        
        // Track which zone is currently hovered
        let hoveredZoneId = null;
        let hideTimeout = null;
        
        const showTooltip = (zoneId) => {
            if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
            }
            hoveredZoneId = zoneId;
            const planetSquare = this.container.querySelector(`.orbital-zone-planet-square-float[data-zone="${zoneId}"]`);
            if (planetSquare) {
                this.showZoneInfoTooltip(zoneId, planetSquare);
            }
        };
        
        const hideTooltip = () => {
            hoveredZoneId = null;
            this.hideZoneInfoTooltip();
        };
        
        const scheduleHide = () => {
            if (hideTimeout) {
                clearTimeout(hideTimeout);
            }
            hideTimeout = setTimeout(() => {
                hideTooltip();
            }, 100); // Small delay to allow mouse movement between tile and square
        };
        
        // Add handlers to tiles
        tiles.forEach(tile => {
            const zoneId = tile.dataset.zone;
            
            tile.addEventListener('mouseenter', (e) => {
                if (zoneId) {
                    showTooltip(zoneId);
                }
            });

            tile.addEventListener('mouseleave', (e) => {
                const relatedTarget = e.relatedTarget;
                // If moving to planet square or tooltip, keep showing
                if (relatedTarget && 
                    (relatedTarget.closest('.orbital-zone-planet-square-float') || 
                     relatedTarget.closest('#zone-info-panel'))) {
                    return;
                }
                scheduleHide();
            });
        });
        
        // Add handlers to planet squares
        planetSquares.forEach(square => {
            const zoneId = square.dataset.zone;
            
            square.addEventListener('mouseenter', (e) => {
                if (zoneId) {
                    showTooltip(zoneId);
                }
            });

            square.addEventListener('mouseleave', (e) => {
                const relatedTarget = e.relatedTarget;
                // If moving to tile or tooltip, keep showing
                if (relatedTarget && 
                    (relatedTarget.closest('.orbital-zone-tile') || 
                     relatedTarget.closest('#zone-info-panel'))) {
                    return;
                }
                scheduleHide();
            });
        });
        
        // Hide tooltip when mouse leaves the tooltip itself
        const panel = document.getElementById('zone-info-panel');
        if (panel) {
            panel.addEventListener('mouseenter', () => {
                if (hideTimeout) {
                    clearTimeout(hideTimeout);
                    hideTimeout = null;
                }
            });
            
            panel.addEventListener('mouseleave', (e) => {
                const relatedTarget = e.relatedTarget;
                // If moving back to tile or square, keep showing
                if (relatedTarget && 
                    (relatedTarget.closest('.orbital-zone-tile') || 
                     relatedTarget.closest('.orbital-zone-planet-square-float'))) {
                    return;
                }
                hideTooltip();
            });
        }
    }
    
    showZoneInfoTooltip(zoneId, planetSquareElement) {
        const panel = document.getElementById('zone-info-panel');
        if (!panel) return;
        
        const zone = this.orbitalZones.find(z => z.id === zoneId);
        if (!zone) return;
        
        // Calculate zone-specific stats
        const deltaVPenalty = zone.delta_v_penalty || 0.1;
        const miningEnergyCostMultiplier = zone.mining_energy_cost_multiplier || 1.0;
        const miningRateMultiplier = zone.mining_rate_multiplier || 1.0;
        const metalPercentage = zone.metal_percentage || 0.32;
        
        // Delta-v energy cost to mine (watts per kg/s)
        const baseEnergyCost = 453515; // watts per kg/s at Earth baseline
        const deltaVEnergyCost = baseEnergyCost * Math.pow(1.0 + deltaVPenalty, 2) * miningEnergyCostMultiplier;
        
        // Get stats from game state
        let miningRate = 0; // kg/s total material
        let metalMiningRate = 0; // kg/s metal
        let slagMiningRate = 0; // kg/s slag
        let numProbes = 0;
        let totalProbeMass = 0;
        let probesPerSecond = 0;
        let metalRemaining = 0;
        let massRemaining = 0;
        let slagProduced = 0;
        let buildingCounts = {};
        
        if (this.gameState) {
            // Get probes in this zone
            const probesByZone = this.gameState.probes_by_zone || {};
            const zoneProbes = probesByZone[zoneId] || {};
            for (const [probeType, count] of Object.entries(zoneProbes)) {
                numProbes += (count || 0);
                totalProbeMass += (count || 0) * 10; // Config.PROBE_MASS = 10 kg
            }
            
            // Get probe allocations for this zone
            const probeAllocationsByZone = this.gameState.probe_allocations_by_zone || {};
            const zoneAllocations = probeAllocationsByZone[zoneId] || {};
            const harvestAllocation = zoneAllocations.harvest || {};
            
            // Calculate mining rate from probes (use Config.PROBE_BASE_MINING_RATE = 0.5 kg/s per probe)
            const baseHarvestRate = 0.5; // Config.PROBE_BASE_MINING_RATE
            for (const [probeType, count] of Object.entries(harvestAllocation)) {
                if (count > 0) {
                    const probeHarvestRate = baseHarvestRate * miningRateMultiplier * count;
                    miningRate += probeHarvestRate;
                }
            }
            
            // Split into metal and slag based on zone's metal percentage
            metalMiningRate = miningRate * metalPercentage;
            slagMiningRate = miningRate * (1.0 - metalPercentage);
            
            // Get probe production rate for this zone (probes per second)
            // Calculate from replicate allocation in this zone
            const replicateAllocation = zoneAllocations.replicate || {};
            let zoneProbeProductionRate = 0;
            for (const [probeType, count] of Object.entries(replicateAllocation)) {
                if (count > 0) {
                    // Base probe production: 0.1 kg/s per probe (Config.PROBE_BUILD_RATE)
                    // Probe mass: 10 kg (Config.PROBE_MASS)
                    // Production rate: (0.1 kg/s) / (10 kg/probe) = 0.01 probes/s per probe
                    const probesPerSecondPerProbe = 0.1 / 10; // 0.01 probes/s per replicating probe
                    zoneProbeProductionRate += count * probesPerSecondPerProbe;
                }
            }
            probesPerSecond = zoneProbeProductionRate;
            
            // Get remaining resources
            metalRemaining = (this.gameState.zone_metal_remaining && this.gameState.zone_metal_remaining[zoneId]) || 0;
            massRemaining = (this.gameState.zone_mass_remaining && this.gameState.zone_mass_remaining[zoneId]) || 0;
            slagProduced = (this.gameState.zone_slag_produced && this.gameState.zone_slag_produced[zoneId]) || 0;
            
            // Get building counts for this zone
            const structuresByZone = this.gameState.structures_by_zone || {};
            buildingCounts = structuresByZone[zoneId] || {};
        }
        
        // Format values
        const formatRate = (rate) => {
            if (rate === 0) return '0.00';
            if (rate < 0.01) return rate.toFixed(4);
            if (rate < 1) return rate.toFixed(2);
            return rate.toExponential(2);
        };
        
        const formatMass = (mass) => {
            if (mass === 0) return '0';
            if (mass < 1000) return mass.toFixed(1);
            if (mass < 1e6) return (mass / 1000).toFixed(1) + 'k';
            if (mass < 1e9) return (mass / 1e6).toFixed(1) + 'M';
            return mass.toExponential(2);
        };
        
        // Position tooltip above the planet square
        const rect = planetSquareElement.getBoundingClientRect();
        const panelWidth = 250;
        let leftPos = rect.left + (rect.width / 2) - (panelWidth / 2);
        const topPos = rect.top - 380; // Position further above the planet square
        
        // Keep tooltip within viewport
        if (leftPos < 10) leftPos = 10;
        if (leftPos + panelWidth > window.innerWidth - 10) {
            leftPos = window.innerWidth - panelWidth - 10;
        }
        
        // Show panel with probe summary panel styling
        panel.style.display = 'block';
        panel.style.left = `${leftPos}px`;
        panel.style.top = `${topPos}px`;
        // Build building counts display
        let buildingCountsHtml = '';
        const buildingEntries = Object.entries(buildingCounts);
        if (buildingEntries.length > 0) {
            buildingCountsHtml = '<div class="probe-summary-item" style="border-top: 1px solid rgba(255, 255, 255, 0.2); margin-top: 8px; padding-top: 8px;">';
            buildingCountsHtml += '<div class="probe-summary-label">Buildings</div>';
            buildingCountsHtml += '<div class="probe-summary-breakdown">';
            buildingEntries.forEach(([buildingId, count]) => {
                if (count > 0) {
                    // Try to get building name, fallback to ID
                    const buildingName = buildingId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    buildingCountsHtml += `<div class="probe-summary-breakdown-item">
                        <span class="probe-summary-breakdown-label">${buildingName}:</span>
                        <span class="probe-summary-breakdown-value">${count}</span>
                    </div>`;
                }
            });
            buildingCountsHtml += '</div></div>';
        }
        
        panel.style.bottom = 'auto';
        panel.className = 'zone-info-panel probe-summary-panel';
        panel.innerHTML = `
            <div class="probe-summary-title">${zone.name}</div>
            <div class="probe-summary-item">
                <div class="probe-summary-label">Probes</div>
                <div class="probe-summary-value">${this.formatNumber(Math.floor(numProbes))}</div>
            </div>
            <div class="probe-summary-item">
                <div class="probe-summary-label">Probe Production Rate</div>
                <div class="probe-summary-value">${formatRate(probesPerSecond)} /s</div>
            </div>
            <div class="probe-summary-item">
                <div class="probe-summary-label">Mining Rate</div>
                <div class="probe-summary-value">${formatRate(metalMiningRate)} kg/s metal</div>
            </div>
            <div class="probe-summary-item">
                <div class="probe-summary-label">Slag Production</div>
                <div class="probe-summary-value">${formatRate(slagMiningRate)} kg/s</div>
            </div>
            <div class="probe-summary-item">
                <div class="probe-summary-label">Metal Remaining</div>
                <div class="probe-summary-value">${formatMass(metalRemaining)}</div>
            </div>
            <div class="probe-summary-item">
                <div class="probe-summary-label">Mass Remaining</div>
                <div class="probe-summary-value">${formatMass(massRemaining)}</div>
            </div>
            <div class="probe-summary-item">
                <div class="probe-summary-label">Slag Produced</div>
                <div class="probe-summary-value">${formatMass(slagProduced)}</div>
            </div>
            ${buildingCountsHtml}
        `;
    }
    
    hideZoneInfoTooltip() {
        const panel = document.getElementById('zone-info-panel');
        if (panel) {
            panel.style.display = 'none';
        }
    }

    setupClickHandlers() {
        // Click handler for tiles
        const tiles = this.container.querySelectorAll('.orbital-zone-tile[data-zone]');
        tiles.forEach(tile => {
            tile.addEventListener('click', (e) => {
                e.stopPropagation();
                const zoneId = tile.dataset.zone;
                if (zoneId) {
                    this.selectZone(zoneId);
                }
            });
        });
        
        // Click handler for clicking away (on document) to deselect
        document.addEventListener('click', (e) => {
            // Don't deselect if clicking on the zone selector or its children
            if (this.container && this.container.contains(e.target)) {
                return;
            }
            // Don't deselect if clicking on the purchase panel (right sidebar)
            const sidebar = document.getElementById('game-sidebar');
            if (sidebar && sidebar.contains(e.target)) {
                return;
            }
            // Don't deselect if clicking on transfer dialog
            const transferDialog = document.querySelector('.transfer-dialog');
            if (transferDialog && transferDialog.contains(e.target)) {
                return;
            }
            // Deselect if clicking elsewhere
            if (this.selectedZone || this.transferSourceZone) {
                this.deselectZone();
            }
        });
    }

    async selectZone(zoneId) {
        // If we already have a source zone selected for transfer, this is the destination
        if (this.transferSourceZone && this.transferSourceZone !== zoneId) {
            // Show transfer dialog
            this.showTransferDialog(this.transferSourceZone, zoneId);
            // Clear transfer source
            this.transferSourceZone = null;
            // Keep destination selected for purchase panel
            this.selectedZone = zoneId;
            this.render();
            return;
        }
        
        // If clicking the same zone, deselect it
        if (this.selectedZone === zoneId && !this.transferSourceZone) {
            this.deselectZone();
            return;
        }
        
        // First click: set as selected and mark as transfer source
        this.selectedZone = zoneId;
        this.transferSourceZone = zoneId; // Mark as transfer source (will be cleared when second zone clicked)
        this.render(); // Re-render to show selection with transfer-source highlight
        
        // Notify purchase panel of selection change
        if (window.purchasePanel) {
            window.purchasePanel.setSelectedZone(zoneId);
            if (window.commandPanel) {
                window.commandPanel.setSelectedZone(zoneId);
            }
        }
        
        // Update backend with selected harvest zone
        try {
            await gameEngine.performAction('set_harvest_zone', { zone_id: zoneId });
        } catch (error) {
            console.error('Failed to set harvest zone:', error);
        }
    }
    
    deselectZone() {
        this.selectedZone = null;
        this.transferSourceZone = null;
        this.render(); // Re-render to show deselection
        
        // Notify purchase panel of deselection
        if (window.purchasePanel) {
            window.purchasePanel.setSelectedZone(null);
        }
    }
    
    showTransferDialog(fromZoneId, toZoneId) {
        // Get zone data
        const fromZone = this.orbitalZones.find(z => z.id === fromZoneId);
        const toZone = this.orbitalZones.find(z => z.id === toZoneId);
        if (!fromZone || !toZone) return;
        
        // Calculate delta-v difference
        const deltaV = this.calculateTransferDeltaV(fromZone, toZone);
        
        // Calculate energy cost
        const energyCost = this.calculateTransferEnergyCost(fromZone, toZone);
        
        // Get probe count in source zone
        let availableProbes = 0;
        if (this.gameState && this.gameState.probes_by_zone) {
            const zoneProbes = this.gameState.probes_by_zone[fromZoneId] || {};
            for (const count of Object.values(zoneProbes)) {
                availableProbes += count;
            }
        }
        
        // Create dialog
        const dialog = document.createElement('div');
        dialog.className = 'transfer-dialog';
        dialog.innerHTML = `
            <div class="transfer-dialog-content">
                <div class="transfer-dialog-header">
                    <h3>Hohmann Transfer</h3>
                    <button class="transfer-dialog-close">&times;</button>
                </div>
                <div class="transfer-dialog-body">
                    <div class="transfer-route">
                        <span class="transfer-zone">${fromZone.name.replace(/\s+Orbit\s*$/i, '')}</span>
                        <span class="transfer-arrow">→</span>
                        <span class="transfer-zone">${toZone.name.replace(/\s+Orbit\s*$/i, '')}</span>
                    </div>
                    <div class="transfer-info">
                        <div class="transfer-info-item">
                            <span class="transfer-label">Delta-V:</span>
                            <span class="transfer-value">${deltaV.toFixed(2)} km/s</span>
                        </div>
                        <div class="transfer-info-item">
                            <span class="transfer-label">Energy Cost (one-time):</span>
                            <span class="transfer-value" id="transfer-energy-one-time">—</span>
                        </div>
                        <div class="transfer-info-item">
                            <span class="transfer-label">Energy Cost (continuous):</span>
                            <span class="transfer-value" id="transfer-energy-continuous">—</span>
                        </div>
                        <div class="transfer-info-item">
                            <span class="transfer-label">Available Probes:</span>
                            <span class="transfer-value">${this.formatNumber(availableProbes)}</span>
                        </div>
                    </div>
                    <div class="transfer-options">
                        <div class="transfer-option">
                            <label>
                                <input type="radio" name="transfer-type" value="one-time" checked>
                                One-Time Transfer
                            </label>
                            <input type="number" id="transfer-count" min="1" max="${availableProbes}" value="1" 
                                   placeholder="Number of probes">
                        </div>
                        <div class="transfer-option">
                            <label>
                                <input type="radio" name="transfer-type" value="continuous">
                                Continuous Transfer
                            </label>
                            <input type="number" id="transfer-rate" min="0.01" step="0.01" value="1" 
                                   placeholder="Probes per second">
                        </div>
                    </div>
                    <div class="transfer-actions">
                        <button class="transfer-cancel">Cancel</button>
                        <button class="transfer-confirm">Confirm Transfer</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // Calculate energy costs
        const energyCostPerProbe = this.calculateTransferEnergyCost(fromZone, toZone, 1);
        
        // Update energy cost displays
        const updateEnergyCosts = () => {
            const count = parseInt(dialog.querySelector('#transfer-count').value) || 1;
            const rate = parseFloat(dialog.querySelector('#transfer-rate').value) || 1;
            const oneTimeCost = energyCostPerProbe * count;
            const continuousCostPerSecond = energyCostPerProbe * rate;
            
            const oneTimeEl = dialog.querySelector('#transfer-energy-one-time');
            const continuousEl = dialog.querySelector('#transfer-energy-continuous');
            
            if (oneTimeEl) {
                // Show in MJ and kW (assuming 3 second transfer duration)
                const transferDuration = 3; // seconds
                oneTimeEl.textContent = `${(oneTimeCost / 1e6).toFixed(2)} MJ (${(oneTimeCost / transferDuration / 1e3).toFixed(1)} kW avg)`;
            }
            if (continuousEl) {
                continuousEl.textContent = `${(continuousCostPerSecond / 1e3).toFixed(1)} kW`;
            }
        };
        
        // Set up event listeners for energy cost updates
        const countInput = dialog.querySelector('#transfer-count');
        const rateInput = dialog.querySelector('#transfer-rate');
        const typeRadios = dialog.querySelectorAll('input[name="transfer-type"]');
        
        countInput.addEventListener('input', updateEnergyCosts);
        rateInput.addEventListener('input', updateEnergyCosts);
        typeRadios.forEach(radio => radio.addEventListener('change', updateEnergyCosts));
        updateEnergyCosts(); // Initial update
        
        // Event handlers
        dialog.querySelector('.transfer-dialog-close').addEventListener('click', () => {
            document.body.removeChild(dialog);
        });
        
        dialog.querySelector('.transfer-cancel').addEventListener('click', () => {
            document.body.removeChild(dialog);
        });
        
        dialog.querySelector('.transfer-confirm').addEventListener('click', () => {
            const transferType = dialog.querySelector('input[name="transfer-type"]:checked').value;
            if (transferType === 'one-time') {
                const count = parseInt(dialog.querySelector('#transfer-count').value) || 1;
                this.createTransfer(fromZoneId, toZoneId, 'one-time', count, 0);
            } else {
                const rate = parseFloat(dialog.querySelector('#transfer-rate').value) || 1;
                this.createTransfer(fromZoneId, toZoneId, 'continuous', 0, rate);
            }
            document.body.removeChild(dialog);
        });
        
        // Click outside to close
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                document.body.removeChild(dialog);
            }
        });
    }
    
    calculateTransferDeltaV(fromZone, toZone) {
        // Hohmann transfer delta-v calculation
        // Simplified: delta-v ≈ sqrt(GM/r1) * (sqrt(2*r2/(r1+r2)) - 1) + sqrt(GM/r2) * (1 - sqrt(2*r1/(r1+r2)))
        // For simplicity, use radius-based calculation
        const r1 = fromZone.radius_au || 1.0;
        const r2 = toZone.radius_au || 1.0;
        
        // Base delta-v at Earth (1 AU) = 30 km/s
        const baseDeltaV = 30.0;
        
        // Simplified Hohmann transfer: delta-v scales with radius difference
        const radiusRatio = Math.max(r1, r2) / Math.min(r1, r2);
        const deltaV = baseDeltaV * Math.sqrt(radiusRatio) * 0.5; // Simplified formula
        
        return deltaV;
    }
    
    calculateTransferEnergyCost(fromZone, toZone, probeCount = 1) {
        // Energy cost based on delta-v difference
        // Energy = 0.5 * mass * v^2
        const deltaV = this.calculateTransferDeltaV(fromZone, toZone);
        const probeMass = 10.0; // kg per probe (Config.PROBE_MASS)
        
        // Energy cost: E = 0.5 * m * v^2
        // deltaV is in km/s, convert to m/s: v_mps = deltaV * 1000
        // Energy per probe in Joules: E = 0.5 * m * v^2
        const vMps = deltaV * 1000; // m/s
        const energyPerProbeJoules = 0.5 * probeMass * vMps * vMps;
        const totalEnergyJoules = energyPerProbeJoules * probeCount;
        
        // Return in Joules (will be converted to kW in display)
        return totalEnergyJoules;
    }
    
    createTransfer(fromZoneId, toZoneId, type, count, rate) {
        // Create transfer object
        const transfer = {
            from: fromZoneId,
            to: toZoneId,
            type: type, // 'one-time' or 'continuous'
            count: count, // For one-time
            rate: rate, // For continuous (probes per second)
            progress: 0, // For one-time transfers
            startTime: Date.now()
        };
        
        this.transferArcs.push(transfer);
        
        // Dispatch event for transfer panel
        const event = new CustomEvent('transferCreated', { detail: transfer });
        document.dispatchEvent(event);
        
        // Execute transfer via game engine
        if (window.gameEngine) {
            window.gameEngine.performAction('create_transfer', {
                from_zone: fromZoneId,
                to_zone: toZoneId,
                transfer_type: type,
                count: count,
                rate: rate
            }).catch(error => {
                console.error('Failed to create transfer:', error);
            });
        }
        
        this.render(); // Re-render to show transfer arc
    }

    update(gameState) {
        this.gameState = gameState;
        // Don't override selected zone from game state - let user selection persist
        // if (gameState.harvest_zone) {
        //     this.selectedZone = gameState.harvest_zone;
        // }
        this.render();
        // Probe dots removed - focusing on mechanics first
        // this.updateProbeDots();
        this.updateTransferArcs();
    }
    
    updateProbeDots() {
        if (!this.gameState || !this.orbitalZones) return;
        
        this.orbitalZones.forEach(zone => {
            const planetSquare = this.container.querySelector(`.orbital-zone-planet-square-float[data-zone="${zone.id}"]`);
            if (!planetSquare) return;
            
            let container = planetSquare.querySelector('.orbital-zone-probe-dots-container');
            if (!container) {
                // Create container if it doesn't exist
                container = document.createElement('div');
                container.className = 'orbital-zone-probe-dots-container';
                container.setAttribute('data-zone', zone.id);
                planetSquare.appendChild(container);
            }
            
            // Calculate probe count
            let probeCount = 0;
            const probesByZone = this.gameState.probes_by_zone || {};
            const zoneProbes = probesByZone[zone.id] || {};
            for (const count of Object.values(zoneProbes)) {
                probeCount += count;
            }
            
            // Calculate Dyson swarm dots (Earth only)
            const dysonMass = (zone.id === 'earth') ? (this.gameState.dyson_sphere_mass || 0) : 0;
            const dysonTargetMass = (zone.id === 'earth') ? (this.gameState.dyson_sphere_target_mass || 5e21) : 0;
            const dysonCompletion = dysonTargetMass > 0 ? dysonMass / dysonTargetMass : 0;
            
            // Calculate number of dots (logarithmic scale)
            const maxDots = 20;
            const probeDots = Math.min(maxDots, Math.max(0, Math.floor(Math.log10(Math.max(1, probeCount)) * 5)));
            const dysonDots = Math.min(maxDots, Math.floor(dysonCompletion * maxDots));
            const totalDots = probeDots + dysonDots;
            
            // Clear existing dots
            container.innerHTML = '';
            
            // Create floating dots around the planet square
            const squareSize = parseInt(planetSquare.style.width) || 35;
            const orbitRadius = squareSize / 2 + 8; // Distance from center
            
            for (let i = 0; i < totalDots; i++) {
                const dot = document.createElement('div');
                dot.className = 'orbital-zone-probe-dot';
                if (i < probeDots) {
                    dot.classList.add('probe-dot');
                } else {
                    dot.classList.add('dyson-dot');
                }
                
                // Position dots in a circle around the planet square
                const angle = (i / totalDots) * Math.PI * 2;
                const x = Math.cos(angle) * orbitRadius;
                const y = Math.sin(angle) * orbitRadius;
                
                // Add animation delay for floating effect
                const animationDelay = (i / totalDots) * 2; // 2 second cycle
                
                dot.style.left = `calc(50% + ${x}px)`;
                dot.style.top = `calc(50% + ${y}px)`;
                dot.style.animationDelay = `${animationDelay}s`;
                
                container.appendChild(dot);
            }
        });
    }
    
    updateTransferArcs() {
        // Remove existing transfer arcs
        const svgContainer = this.container.querySelector('.transfer-arc-svg-container');
        if (svgContainer) {
            svgContainer.innerHTML = '';
        }
        
        // Draw transfer arcs
        this.transferArcs.forEach(transfer => {
            this.drawTransferArc(transfer);
        });
    }
    
    drawTransferArc(transfer) {
        // Find source and destination planet squares
        const fromSquare = this.container.querySelector(`.orbital-zone-planet-square-float[data-zone="${transfer.from}"]`);
        const toSquare = this.container.querySelector(`.orbital-zone-planet-square-float[data-zone="${transfer.to}"]`);
        if (!fromSquare || !toSquare) return;
        
        // Create SVG overlay for transfer arc
        let svgContainer = this.container.querySelector('.transfer-arc-svg-container');
        if (!svgContainer) {
            svgContainer = document.createElement('div');
            svgContainer.className = 'transfer-arc-svg-container';
            svgContainer.style.position = 'absolute';
            svgContainer.style.top = '0';
            svgContainer.style.left = '0';
            svgContainer.style.width = '100%';
            svgContainer.style.height = '100%';
            svgContainer.style.pointerEvents = 'none';
            svgContainer.style.zIndex = '10';
            const content = this.container.querySelector('.orbital-zone-selector-content');
            if (content) {
                content.appendChild(svgContainer);
            } else {
                return; // Can't draw without container
            }
        }
        
        // Get positions relative to the planet squares container
        const planetSquaresContainer = this.container.querySelector('.orbital-zone-planet-squares');
        if (!planetSquaresContainer) return;
        
        const fromRect = fromSquare.getBoundingClientRect();
        const toRect = toSquare.getBoundingClientRect();
        const containerRect = planetSquaresContainer.getBoundingClientRect();
        
        const fromX = fromRect.left + fromRect.width / 2 - containerRect.left;
        const fromY = fromRect.top + fromRect.height / 2 - containerRect.top;
        const toX = toRect.left + toRect.width / 2 - containerRect.left;
        const toY = toRect.top + toRect.height / 2 - containerRect.top;
        
        // Create SVG path for Hohmann transfer (elliptical arc)
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'transfer-arc');
        svg.setAttribute('width', containerRect.width.toString());
        svg.setAttribute('height', containerRect.height.toString());
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.setAttribute('data-transfer-id', `${transfer.from}-${transfer.to}-${transfer.type}`);
        
        // Calculate elliptical arc for Hohmann transfer
        const dx = toX - fromX;
        const dy = toY - fromY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Create elliptical arc path (Hohmann transfer is an elliptical orbit)
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const largeArc = distance > 50 ? 1 : 0; // Large arc if distance is significant
        const sweep = dy > 0 ? 1 : 0; // Sweep direction based on vertical direction
        
        // Elliptical arc: M start, A rx ry x-axis-rotation large-arc sweep end
        const rx = distance / 2;
        const ry = Math.abs(dy) / 2 + 20; // Vertical stretch for elliptical arc
        path.setAttribute('d', `M ${fromX} ${fromY} A ${rx} ${ry} 0 ${largeArc} ${sweep} ${toX} ${toY}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#4a9eff');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-dasharray', '5,5');
        path.setAttribute('opacity', '0.6');
        
        svg.appendChild(path);
        svgContainer.appendChild(svg);
        
        // Add probe dot traveling along the arc (for one-time transfers)
        if (transfer.type === 'one-time') {
            this.animateTransferProbe(transfer, fromX, fromY, toX, toY, path, svg);
        } else {
            // For continuous transfers, create periodic dots
            this.animateContinuousTransfer(transfer, fromX, fromY, toX, toY, path, svg);
        }
    }
    
    animateTransferProbe(transfer, fromX, fromY, toX, toY, path, svg) {
        const probeDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        probeDot.setAttribute('r', '3');
        probeDot.setAttribute('fill', '#4a9eff');
        probeDot.setAttribute('opacity', '0.9');
        svg.appendChild(probeDot);
        
        // Animate along path
        const pathLength = path.getTotalLength();
        const duration = 3000; // 3 seconds for transfer animation
        const startTime = transfer.startTime || Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(1, elapsed / duration);
            
            if (progress < 1) {
                const point = path.getPointAtLength(pathLength * progress);
                probeDot.setAttribute('cx', point.x);
                probeDot.setAttribute('cy', point.y);
                requestAnimationFrame(animate);
            } else {
                // Transfer complete, remove dot
                probeDot.remove();
                // Remove transfer from list
                const index = this.transferArcs.indexOf(transfer);
                if (index > -1) {
                    this.transferArcs.splice(index, 1);
                }
                this.updateTransferArcs();
            }
        };
        
        animate();
    }
    
    animateContinuousTransfer(transfer, fromX, fromY, toX, toY, path, svg) {
        const pathLength = path.getTotalLength();
        const duration = 3000; // 3 seconds per probe
        const interval = 1000 / transfer.rate; // Time between probes
        
        let probeIndex = 0;
        const createProbe = () => {
            const probeDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            probeDot.setAttribute('r', '3');
            probeDot.setAttribute('fill', '#4a9eff');
            probeDot.setAttribute('opacity', '0.9');
            svg.appendChild(probeDot);
            
            const startTime = Date.now() + (probeIndex * interval);
            
            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(1, elapsed / duration);
                
                if (progress < 1) {
                    const point = path.getPointAtLength(pathLength * progress);
                    probeDot.setAttribute('cx', point.x);
                    probeDot.setAttribute('cy', point.y);
                    requestAnimationFrame(animate);
                } else {
                    probeDot.remove();
                }
            };
            
            setTimeout(() => {
                animate();
                probeIndex++;
                if (this.transferArcs.includes(transfer)) {
                    createProbe();
                }
            }, probeIndex * interval);
        };
        
        createProbe();
    }
}
