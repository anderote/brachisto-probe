/** Orbital Zone Selector - Clickable bars for selecting harvest location */
class OrbitalZoneSelector {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.gameState = null;
        this.orbitalZones = null;
        this.selectedZone = null; // No zone selected by default
        this.transferSourceZone = null; // First zone selected for transfer (after spacebar)
        this.waitingForTransferDestination = false; // True when spacebar pressed, waiting for destination zone
        this.currentTransferDialog = null; // Reference to open transfer dialog
        this.transferArcs = []; // Active transfer arcs: [{from, to, type, count, rate, ...}]
        
        // Performance optimization: Throttle probe visualization updates
        this.probeUpdateFrameCount = 0; // Frame counter for probe UI updates
        this.lastProbeCounts = null; // Cache last probe counts to detect changes
        
        // Tooltip update interval
        this.tooltipUpdateInterval = null; // Interval for updating tooltip every second
        
        // Transfer arc animation interval (10 times per second = 100ms)
        this.transferArcAnimationInterval = null;
        this.transferArcUpdateRate = 100; // milliseconds (10 times per second)
        
        this.init();
        this.loadData();
        this.setupKeyboardShortcuts();
    }

    async loadData() {
        try {
            const zonesResponse = await fetch('/game_data/orbital_mechanics.json');
            const zonesData = await zonesResponse.json();
            this.orbitalZones = zonesData.orbital_zones;
            
            // Pre-calculate delta-v for each zone relative to Dyson sphere
            this.precalculateDeltaV();
            
            this.render();
            // Notify command panel that zones are loaded
            if (window.commandPanel && window.commandPanel.selectedZone) {
                window.commandPanel.setSelectedZone(window.commandPanel.selectedZone);
            }
        } catch (error) {
            console.error('Failed to load orbital zones:', error);
        }
    }
    
    precalculateDeltaV() {
        // Calculate delta-v for each zone relative to Dyson sphere and store as property
        if (!this.orbitalZones) return;
        
        // Find Dyson sphere zone
        const dysonZone = this.orbitalZones.find(z => z.id === 'dyson_sphere');
        if (!dysonZone) return;
        
        const dysonRadiusAU = dysonZone.radius_au || 0.2;
        
        // Calculate and store delta-v for each zone
        this.orbitalZones.forEach(zone => {
            if (zone.id === 'dyson_sphere') {
                // Dyson sphere has 0 delta-v relative to itself
                zone.delta_v_from_dyson_ms = 0;
            } else {
                // Calculate Hohmann transfer delta-v from Dyson sphere to this zone
                const zoneRadiusAU = zone.radius_au || 1.0;
                zone.delta_v_from_dyson_ms = this.calculateHohmannDeltaV(dysonRadiusAU, zoneRadiusAU);
            }
        });
    }

    init() {
        if (!this.container) return;
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Only handle if not typing in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            // Handle spacebar to open transfer dialog
            // Only handle if a zone is selected (otherwise let pause/resume handle it)
            if ((e.key === ' ' || e.key === 'Spacebar') && this.selectedZone) {
                e.preventDefault();
                e.stopPropagation();
                // If transfer dialog is already open, close it
                if (this.currentTransferDialog) {
                    this.closeTransferDialog();
                } else {
                    // Open transfer dialog with selected zone as source
                    // Destination will be set when user selects another zone
                    this.showTransferDialog(this.selectedZone, null);
                }
                return;
            }
            
            // Handle number keys 1-9, 0, and - (minus)
            const key = e.key;
            if (key >= '1' && key <= '9') {
                const zoneIndex = parseInt(key) - 1;
                if (this.orbitalZones && zoneIndex < this.orbitalZones.length) {
                    const zoneId = this.orbitalZones[zoneIndex].id;
                    this.selectZone(zoneId);
                }
            } else if (key === '0') {
                // 0 = neptune
                const neptuneZone = this.orbitalZones?.find(z => z.id === 'neptune');
                if (neptuneZone) {
                    this.selectZone('neptune');
                }
            } else if (key === '-' || key === '_') {
                // - = kuiper belt
                const kuiperZone = this.orbitalZones?.find(z => z.id === 'kuiper');
                if (kuiperZone) {
                    this.selectZone('kuiper');
                }
            }
        });
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
        // Calculate delta-v in m/s relative to Dyson sphere
        // Dyson sphere is at 0.2 AU, so it has 0 m/s delta-v
        // Other zones show delta-v needed to reach them from Dyson sphere
        
        // Find Dyson sphere zone
        const dysonZone = this.orbitalZones?.find(z => z.id === 'dyson_sphere');
        if (!dysonZone) {
            // Fallback: use 0.2 AU as Dyson sphere radius
            const dysonRadiusAU = 0.2;
            const zoneRadiusAU = zone.radius_au || 1.0;
            
            // If this is the Dyson sphere, return 0
            if (zone.id === 'dyson_sphere' || Math.abs(zoneRadiusAU - dysonRadiusAU) < 0.01) {
                return 0;
            }
            
            // Calculate Hohmann transfer delta-v from Dyson sphere to this zone
            return this.calculateHohmannDeltaV(dysonRadiusAU, zoneRadiusAU);
        }
        
        // If this is the Dyson sphere, return 0
        if (zone.id === 'dyson_sphere') {
            return 0;
        }
        
        // Calculate Hohmann transfer delta-v from Dyson sphere to this zone
        const dysonRadiusAU = dysonZone.radius_au || 0.2;
        const zoneRadiusAU = zone.radius_au || 1.0;
        return this.calculateHohmannDeltaV(dysonRadiusAU, zoneRadiusAU);
    }
    
    calculateHohmannDeltaV(r1AU, r2AU) {
        // Calculate Hohmann transfer delta-v between two circular orbits
        // r1AU: inner orbit radius in AU
        // r2AU: outer orbit radius in AU
        // Returns delta-v in m/s
        
        // Standard gravitational parameter for the Sun: GM = 1.327e20 m³/s²
        const GM = 1.327e20; // m³/s²
        
        // Convert AU to meters: 1 AU = 1.496e11 m
        const AU_TO_M = 1.496e11;
        const r1 = r1AU * AU_TO_M; // meters
        const r2 = r2AU * AU_TO_M; // meters
        
        // Orbital velocity at inner orbit: v1 = sqrt(GM/r1)
        const v1 = Math.sqrt(GM / r1);
        
        // Orbital velocity at outer orbit: v2 = sqrt(GM/r2)
        const v2 = Math.sqrt(GM / r2);
        
        // Semi-major axis of transfer ellipse: a = (r1 + r2) / 2
        const a = (r1 + r2) / 2;
        
        // Velocity at periapsis of transfer orbit (at r1): v_peri = sqrt(GM * (2/r1 - 1/a))
        const v_peri = Math.sqrt(GM * (2/r1 - 1/a));
        
        // Velocity at apoapsis of transfer orbit (at r2): v_apo = sqrt(GM * (2/r2 - 1/a))
        const v_apo = Math.sqrt(GM * (2/r2 - 1/a));
        
        // First burn: from circular orbit at r1 to transfer orbit
        const deltaV1 = Math.abs(v_peri - v1);
        
        // Second burn: from transfer orbit to circular orbit at r2
        const deltaV2 = Math.abs(v2 - v_apo);
        
        // Total delta-v
        return deltaV1 + deltaV2;
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
        
        // Calculate dynamic spacing to fit window width
        // Get available width (accounting for padding/margins)
        const containerPadding = 40; // Total padding on both sides
        const availableWidth = window.innerWidth - containerPadding;
        const numZones = this.orbitalZones.length;
        const tileWidth = 110; // Reduced from 120px
        const minGap = 10; // Minimum gap between tiles
        const maxGap = 20; // Maximum gap between tiles
        
        // Calculate optimal gap to fit all tiles in window
        const totalTilesWidth = numZones * tileWidth;
        const totalGapWidth = availableWidth - totalTilesWidth;
        const gapPerSpace = Math.max(minGap, Math.min(maxGap, totalGapWidth / Math.max(1, numZones - 1)));
        const tileGap = gapPerSpace;
        const totalTilesWidthWithGaps = totalTilesWidth + (numZones - 1) * tileGap;
        
        // Render floating planet squares above the menu
        html += `<div class="orbital-zone-planet-squares" style="width: ${totalTilesWidthWithGaps}px;">`;
        
        // Check if transfer dialog is open - if so, calculate travel times
        const isTransferDialogOpen = this.currentTransferDialog !== null;
        const transferSourceZone = this.transferSourceZone;
        let transferSourceZoneData = null;
        if (isTransferDialogOpen && transferSourceZone) {
            transferSourceZoneData = this.orbitalZones.find(z => z.id === transferSourceZone);
        }
        
        // Check for mass driver boost if transfer dialog is open
        let massDriverCount = 0;
        let hasMassDriver = false;
        if (isTransferDialogOpen && transferSourceZone && this.gameState) {
            const structuresByZone = this.gameState.structures_by_zone || {};
            const zoneStructures = structuresByZone[transferSourceZone] || {};
            massDriverCount = zoneStructures['mass_driver'] || 0;
            hasMassDriver = massDriverCount > 0;
        }
        
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
            const tileLeft = tileCenter - (totalTilesWidthWithGaps / 2);
            
            // Calculate travel time if transfer dialog is open
            let travelTimeDisplay = '';
            if (isTransferDialogOpen && transferSourceZoneData && transferSourceZone !== zone.id) {
                let transferTime = this.calculateTransferTime(transferSourceZoneData, zone);
                
                // Apply mass driver speed multiplier if available
                if (hasMassDriver && window.gameEngine && window.gameEngine.transferSystem) {
                    const speedMultiplier = window.gameEngine.transferSystem.calculateMassDriverSpeedMultiplier(massDriverCount);
                    transferTime = transferTime * speedMultiplier;
                }
                
                travelTimeDisplay = this.formatTransferTime(transferTime);
            }
            
            html += `<div class="orbital-zone-planet-square-wrapper" style="left: calc(50% + ${tileLeft}px);">`;
            
            html += `<div class="orbital-zone-planet-square-float" 
                         data-zone="${zone.id}"
                         style="width: ${squareSizePx}px; 
                                height: ${squareSizePx}px; 
                                background-color: ${zone.color || '#4a9eff'};
                                border: 2px solid rgba(255, 255, 255, 0.3);">
                         <!-- Probe dots container removed for performance -->
                     </div>`;
            
            // Display travel time below square if transfer dialog is open
            if (travelTimeDisplay) {
                html += `<div class="orbital-zone-travel-time" data-zone="${zone.id}">${travelTimeDisplay}</div>`;
            }
            
            html += `</div>`;
        });
        html += '</div>';
        
        // Render zone tiles (uniform size, no planet square inside)
        this.orbitalZones.forEach((zone, tileIndex) => {
            // Remove "Orbit" from zone name
            const zoneName = zone.name.replace(/\s+Orbit\s*$/i, '');
            
            // Get fixed zone properties (don't change, so no need to update)
            // Use pre-calculated delta-v (calculated once when zones are loaded)
            const deltaVms = zone.delta_v_from_dyson_ms ?? 0;
            const metalPercent = zone.metal_percentage || 0;
            const radiusAu = zone.radius_au || 1.0;
            // Solar flux follows inverse square law: flux = 1 / radius_au^2 (normalized to Earth = 1.0)
            const solarFlux = radiusAu > 0 ? (1.0 / (radiusAu * radiusAu)).toFixed(2) : '0.00';
            
            // Format delta-v: show in km/s if >= 1 km/s, otherwise m/s
            let deltaVDisplay;
            if (deltaVms >= 1000) {
                deltaVDisplay = `${(deltaVms / 1000).toFixed(1)} km/s`;
            } else {
                deltaVDisplay = `${Math.round(deltaVms)} m/s`;
            }
            
            const isSelected = this.selectedZone === zone.id;
            const isTransferSource = this.transferSourceZone === zone.id && this.transferSourceZone !== this.selectedZone;
            const isTransferDestination = this.waitingForTransferDestination && this.selectedZone === zone.id && this.transferSourceZone !== zone.id;
            let tileClass = '';
            if (isTransferDestination) {
                tileClass = 'selected transfer-destination';
            } else if (isSelected && isTransferSource) {
                tileClass = 'selected transfer-source';
            } else if (isSelected) {
                tileClass = 'selected';
            } else if (isTransferSource) {
                tileClass = 'transfer-source';
            }
            
            // Get keyboard hotkey for this zone
            let hotkey = '';
            if (zone.id === 'neptune') {
                hotkey = '0';
            } else if (zone.id === 'kuiper') {
                hotkey = '-';
            } else if (tileIndex < 9) {
                hotkey = String(tileIndex + 1);
            }
            
            // Apply dynamic spacing: first tile has no left margin, others have gap
            const tileMarginLeft = tileIndex === 0 ? 0 : tileGap;
            html += `<div class="orbital-zone-tile ${tileClass}" data-zone="${zone.id}" style="margin-left: ${tileMarginLeft}px; width: ${tileWidth}px;">`;
            html += `<div class="orbital-zone-tile-label">${zoneName}</div>`;
            html += `<div class="orbital-zone-tile-stats">`;
            html += `<div class="orbital-zone-stat">Δv: ${deltaVDisplay}</div>`;
            html += `<div class="orbital-zone-stat">Metal: ${(metalPercent * 100).toFixed(0)}%</div>`;
            html += `<div class="orbital-zone-stat">Solar: ${solarFlux}x</div>`;
            html += `</div>`;
            if (hotkey) {
                html += `<div class="orbital-zone-hotkey">${hotkey}</div>`;
            }
            html += `</div>`;
        });

        html += '</div>';
        html += '</div>';
        
        this.container.innerHTML = html;

        // Set up event listeners
        this.setupTooltips();
        this.setupClickHandlers();
        
        // Set up window resize handler to recalculate spacing
        if (!this.resizeHandler) {
            this.resizeHandler = () => {
                // Re-render to recalculate dynamic spacing
                if (this.orbitalZones && this.orbitalZones.length > 0) {
                    this.render();
                    if (this.gameState) {
                        this.updateTransferArcs();
                    }
                }
            };
            window.addEventListener('resize', this.resizeHandler);
        }
        
        // Update transfer arcs after render
        if (this.gameState) {
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
        
        // Clear any existing tooltip update interval
        const clearTooltipInterval = () => {
            if (this.tooltipUpdateInterval) {
                clearInterval(this.tooltipUpdateInterval);
                this.tooltipUpdateInterval = null;
            }
        };
        
        // Start tooltip update interval (updates every second while tooltip is open)
        const startTooltipInterval = (zoneId) => {
            clearTooltipInterval(); // Clear any existing interval
            
            // Update immediately
            const planetSquare = this.container.querySelector(`.orbital-zone-planet-square-float[data-zone="${zoneId}"]`);
            if (planetSquare) {
                this.showZoneInfoTooltip(zoneId, planetSquare);
            }
            
            // Then update every second
            this.tooltipUpdateInterval = setInterval(() => {
                if (hoveredZoneId === zoneId) {
                    const planetSquare = this.container.querySelector(`.orbital-zone-planet-square-float[data-zone="${zoneId}"]`);
                    if (planetSquare) {
                        this.showZoneInfoTooltip(zoneId, planetSquare);
                    }
                } else {
                    // Zone changed, clear interval
                    clearTooltipInterval();
                }
            }, 1000); // Update every second
        };
        
        const showTooltip = (zoneId) => {
            if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
            }
            hoveredZoneId = zoneId;
            startTooltipInterval(zoneId);
        };
        
        const hideTooltip = () => {
            hoveredZoneId = null;
            clearTooltipInterval();
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
                     relatedTarget.closest('#zone-hover-tooltip'))) {
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
                     relatedTarget.closest('#zone-hover-tooltip'))) {
                    return;
                }
                scheduleHide();
            });
        });
        
        // Hide tooltip when mouse leaves the tooltip itself
        const hoverTooltip = document.getElementById('zone-hover-tooltip');
        if (hoverTooltip) {
            hoverTooltip.addEventListener('mouseenter', () => {
                if (hideTimeout) {
                    clearTimeout(hideTimeout);
                    hideTimeout = null;
                }
            });
            
            hoverTooltip.addEventListener('mouseleave', (e) => {
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
    
    calculateZoneEnergy(zoneId) {
        // Calculate energy production and consumption for a specific zone
        if (!this.gameState) return { production: 0, consumption: 0 };
        
        const zone = this.orbitalZones.find(z => z.id === zoneId);
        if (!zone) return { production: 0, consumption: 0 };
        
        const isDysonZone = zone.is_dyson_zone || false;
        let production = 0;
        let consumption = 0;
        
        // Energy production
        if (isDysonZone) {
            // Dyson zone: energy from Dyson sphere itself
            const dysonMass = this.gameState.dyson_sphere_mass || 0;
            const dysonTargetMass = this.gameState.dyson_sphere_target_mass || 5e21;
            const dysonPowerAllocation = this.gameState.dyson_power_allocation || 0; // 0 = all economy, 100 = all compute
            const economyFraction = (100 - dysonPowerAllocation) / 100.0;
            
            if (dysonMass >= dysonTargetMass) {
                // Complete: all star's power
                const sunTotalPower = 3.8e26; // watts
                production += sunTotalPower * economyFraction;
            } else {
                // During construction: 5 kW per kg
                const dysonPower = dysonMass * 5000; // 5000W = 5 kW per kg
                production += dysonPower * economyFraction;
            }
        }
        
        // Energy from structures in this zone
        const structuresByZone = this.gameState.structures_by_zone || {};
        const zoneStructures = structuresByZone[zoneId] || {};
        
        // Load buildings data if available (would need to be passed in or loaded)
        // For now, we'll need to access it from gameDataLoader if available
        if (typeof gameDataLoader !== 'undefined') {
            for (const [buildingId, count] of Object.entries(zoneStructures)) {
                const building = gameDataLoader.getBuildingById(buildingId);
                if (building) {
                    const effects = building.effects || {};
                    const energyOutput = effects.energy_production_per_second || 0;
                    const energyCost = effects.energy_consumption_per_second || 0;
                    
                    // Apply orbital efficiency if available
                    let orbitalEfficiency = 1.0;
                    if (building.orbital_efficiency && building.orbital_efficiency[zoneId]) {
                        orbitalEfficiency = building.orbital_efficiency[zoneId];
                    }
                    
                    // Apply solar distance modifier (inverse square law) for energy structures
                    let solarDistanceModifier = 1.0;
                    // Check if this is an energy building by checking its category
                    const buildingCategory = this._getBuildingCategory(buildingId);
                    if (buildingCategory === 'energy' && zone && zone.radius_au) {
                        const radiusAu = zone.radius_au;
                        if (radiusAu > 0) {
                            // Inverse square law: power at distance d = power_at_earth * (1.0 / d)²
                            solarDistanceModifier = Math.pow(1.0 / radiusAu, 2);
                        }
                    }
                    
                    production += energyOutput * count * orbitalEfficiency * solarDistanceModifier;
                    consumption += energyCost * count;
                }
            }
        }
        
        // Energy consumption from probes in this zone
        // Read from derived.zones (pre-calculated in worker)
        const derived = this.gameState.derived || {};
        const zones = derived.zones || {};
        const zoneData = zones[zoneId] || {};
        consumption += zoneData.energy_consumed || 0;
        
        // Energy consumption from activities in this zone
        const probeAllocationsByZone = this.gameState.probe_allocations_by_zone || {};
        const zoneAllocations = probeAllocationsByZone[zoneId] || {};
        
        // Harvesting energy cost - allocation is a number (0-1 fraction)
        const harvestAllocation = typeof zoneAllocations.harvest === 'number' ? zoneAllocations.harvest : 0;
        const zoneProbes = this.gameState.probes_by_zone?.[zoneId] || {};
        const totalZoneProbes = Object.values(zoneProbes).reduce((sum, count) => sum + (count || 0), 0);
        const harvestProbes = totalZoneProbes * harvestAllocation;
        if (harvestProbes > 0 && !isDysonZone) {
            const deltaVPenalty = zone.delta_v_penalty || 0.1;
            const miningEnergyCostMultiplier = zone.mining_energy_cost_multiplier || 1.0;
            const baseEnergyCost = 453515; // watts per kg/s at Earth baseline
            const energyCostPerKgS = baseEnergyCost * Math.pow(1.0 + deltaVPenalty, 2) * miningEnergyCostMultiplier;
            const harvestRatePerProbePerDay = Config.PROBE_HARVEST_RATE; // kg/day per probe (100 kg/day base)
            const SECONDS_PER_DAY = Config.SECONDS_PER_DAY || 86400;
            // Convert from kg/day to kg/s for energy cost calculation
            const harvestRatePerProbePerSecond = harvestRatePerProbePerDay / SECONDS_PER_DAY;
            consumption += energyCostPerKgS * harvestRatePerProbePerSecond * harvestProbes;
        }
        
        // Probe construction energy cost (from replicate allocation)
        // replicateAllocation is a number (0-1 fraction)
        const replicateAllocation = typeof zoneAllocations.replicate === 'number' ? zoneAllocations.replicate : 0;
        const replicateProbes = totalZoneProbes * replicateAllocation;
        if (replicateProbes > 0) {
            const PROBE_BUILD_RATE = Config.PROBE_BUILD_RATE; // kg/day per probe
            const SECONDS_PER_DAY = Config.SECONDS_PER_DAY || 86400;
            const probeConstructionRateKgS = (replicateProbes * PROBE_BUILD_RATE) / SECONDS_PER_DAY;
            const probeConstructionEnergyCost = probeConstructionRateKgS * 250000; // 250kW per kg/s
            consumption += probeConstructionEnergyCost;
        }
        
        // Structure construction energy cost (from construct allocation)
        // constructAllocation is a number (0-1 fraction)
        const constructAllocation = typeof zoneAllocations.construct === 'number' ? zoneAllocations.construct : 0;
        const constructProbes = totalZoneProbes * constructAllocation;
        if (constructProbes > 0) {
            const buildAllocation = this.gameState.build_allocation || 100; // 0 = all structures, 100 = all probes
            const structureFraction = (100 - buildAllocation) / 100.0;
            const structureBuildingProbes = constructProbes * structureFraction;
            if (structureBuildingProbes > 0) {
                const PROBE_BUILD_RATE = Config.PROBE_BUILD_RATE; // kg/day per probe
                const SECONDS_PER_DAY = Config.SECONDS_PER_DAY || 86400;
                const structureConstructionRateKgS = (structureBuildingProbes * PROBE_BUILD_RATE) / SECONDS_PER_DAY;
                const structureConstructionEnergyCost = structureConstructionRateKgS * 250000; // 250kW per kg/s
                consumption += structureConstructionEnergyCost;
            }
        }
        
        // Dyson construction energy cost (for dyson zone)
        if (isDysonZone) {
            const dysonAllocation = zoneAllocations.construct || {}; // Dyson uses construct allocation
            const dysonProbes = Object.values(dysonAllocation).reduce((a, b) => a + b, 0);
            if (dysonProbes > 0) {
                const PROBE_BUILD_RATE = Config.PROBE_BUILD_RATE; // kg/day per probe
                const dysonConstructionRateKgS = dysonProbes * PROBE_BUILD_RATE;
                const dysonConstructionEnergyCost = dysonConstructionRateKgS * 250000; // 250kW per kg/s
                consumption += dysonConstructionEnergyCost;
            }
        }
        
        return { production, consumption };
    }
    
    showZoneInfoTooltip(zoneId, planetSquareElement) {
        const panel = document.getElementById('zone-hover-tooltip');
        if (!panel) return;
        
        const zone = this.orbitalZones.find(z => z.id === zoneId);
        if (!zone) return;
        
        const isDysonZone = zone.is_dyson_zone || false;
        
        // Calculate zone-specific stats
        const deltaVPenalty = zone.delta_v_penalty || 0.1;
        const miningEnergyCostMultiplier = zone.mining_energy_cost_multiplier || 1.0;
        const miningRateMultiplier = zone.mining_rate_multiplier || 1.0;
        const metalPercentage = zone.metal_percentage || 0.32;
        
        // Get stats from game state
        let miningRate = 0; // kg/s total material
        let metalMiningRate = 0; // kg/s metal
        let slagMiningRate = 0; // kg/s slag
        let numProbes = 0;
        let totalProbeMass = 0;
        let probesPerDay = 0;
        let dysonBuildRate = 0; // kg/day for dyson zone
        let probeProductionRate = 0; // probes/day from structures in dyson zone
        let storedMetal = 0;
        let massRemaining = 0;
        let slagProduced = 0;
        let buildingCounts = {};
        let structuresCount = 0;
        let zoneEnergy = { production: 0, consumption: 0 };
        
        if (this.gameState) {
            // Read from derived.zones (pre-calculated in worker)
            const derived = this.gameState.derived || {};
            const zones = derived.zones || {};
            const zoneData = zones[zoneId] || {};
            numProbes += zoneData.probe_count || 0;
            totalProbeMass += zoneData.probe_mass || 0;
            
            // Get probe allocations for this zone
            const probeAllocationsByZone = this.gameState.probe_allocations_by_zone || {};
            const zoneAllocations = probeAllocationsByZone[zoneId] || {};
            
            if (isDysonZone) {
                // Dyson zone: calculate construction rate - single probe type: direct access
                const constructAllocation = zoneAllocations.construct || {};
                const dysonProbes = constructAllocation.probe || 0;
                if (dysonProbes > 0) {
                    const PROBE_BUILD_RATE = Config.PROBE_BUILD_RATE; // kg/day per probe
                    dysonBuildRate = dysonProbes * PROBE_BUILD_RATE;
                }
                
                // Calculate probe production from structures (factories) in dyson zone
                const structuresByZone = this.gameState.structures_by_zone || {};
                const zoneStructures = structuresByZone[zoneId] || {};
                const factoryProductionByZone = this.gameState.factory_production_by_zone || {};
                const zoneFactoryProduction = factoryProductionByZone[zoneId] || {};
                
                if (zoneFactoryProduction.rate) {
                    probeProductionRate = zoneFactoryProduction.rate; // probes/s
                }
            } else {
                // Regular zone: read mining rates from derived values (single source of truth)
                // These values already account for extraction efficiency, tech upgrades, and probe counts
                metalMiningRate = zoneData.metal_mined_rate || 0; // kg/day (already accounts for extraction efficiency)
                slagMiningRate = zoneData.slag_produced_rate || 0; // kg/day
                // Total mass mining rate = metal + slag
                miningRate = metalMiningRate + slagMiningRate; // kg/day
            }
            
            // Get probe production rate from derived values (single source of truth)
            // This is calculated in the worker thread based on replicate allocation and tech upgrades
            // For now, calculate from replicate allocation (will be moved to derived values later)
            // replicateAllocation is a number (0-1 fraction)
            const replicateAllocation = typeof zoneAllocations.replicate === 'number' ? zoneAllocations.replicate : 0;
            const zoneProbes = this.gameState.probes_by_zone?.[zoneId] || {};
            const totalZoneProbes = Object.values(zoneProbes).reduce((sum, count) => sum + (count || 0), 0);
            const replicatingProbes = totalZoneProbes * replicateAllocation;
            
            // Get upgrade factor for probe building (replication uses same upgrades as building)
            const upgradeFactor = this.gameState.upgrade_factors?.probe?.building?.performance || 
                                 this.gameState.tech_upgrade_factors?.probe_build || 1.0;
            
            // Base probe production: 20.0 kg/day per probe (Config.PROBE_BUILD_RATE)
            // Probe mass: 100 kg (Config.PROBE_MASS)
            // Production rate: (20.0 kg/day) / (100 kg/probe) = 0.2 probes/day per probe
            const baseProbesPerDayPerProbe = Config.PROBE_BUILD_RATE / Config.PROBE_MASS;
            const zoneProbeProductionRate = replicatingProbes * baseProbesPerDayPerProbe * upgradeFactor;
            probesPerDay = zoneProbeProductionRate;
            
            // Get remaining resources from derived values (single source of truth)
            // These are pre-calculated in the worker thread
            storedMetal = zoneData.stored_metal || 0; // Metal stored locally for construction
            massRemaining = zoneData.mass_remaining || 0; // Un-mined mass (decreases as mining happens)
            slagProduced = zoneData.slag_mass || 0; // Accumulated slag mass in this zone
            
            // Get building counts from derived values (single source of truth)
            structuresCount = zoneData.structure_count || 0; // Pre-calculated in worker thread
            
            // Also get building counts dict for detailed breakdown if needed
            const structuresByZone = this.gameState.structures_by_zone || {};
            buildingCounts = structuresByZone[zoneId] || {};
            
            // Get zone energy from derived values (single source of truth)
            zoneEnergy = {
                production: zoneData.energy_produced || 0,
                consumption: zoneData.energy_consumed || 0,
                net: zoneData.energy_net || 0
            };
        }
        
        // Format values - use FormatUtils for rates with time units
        const formatRate = (rate, unit = '') => {
            return FormatUtils.formatRate(rate, unit);
        };
        
        // Format with 6 significant figures
        const formatMassWithSigFigs = (mass) => {
            if (mass === 0) return '0';
            // Use toPrecision for 6 significant figures
            const formatted = parseFloat(mass.toPrecision(6));
            // Format with appropriate units while preserving 6 sig figs
            if (formatted < 1000) {
                // For numbers < 1000, show as-is with appropriate decimal places
                return formatted.toString();
            }
            if (formatted < 1e6) {
                // For k units, divide and format to preserve 6 sig figs
                const kValue = formatted / 1000;
                return parseFloat(kValue.toPrecision(6)).toString() + 'k';
            }
            if (formatted < 1e9) {
                // For M units
                const mValue = formatted / 1e6;
                return parseFloat(mValue.toPrecision(6)).toString() + 'M';
            }
            if (formatted < 1e12) {
                // For G units
                const gValue = formatted / 1e9;
                return parseFloat(gValue.toPrecision(6)).toString() + 'G';
            }
            // For very large numbers, use exponential notation with 6 sig figs
            return mass.toExponential(5); // 6 sig figs: 1.23456e+12
        };
        
        const formatMass = (mass) => {
            if (mass === 0) return '0';
            if (mass < 1000) return mass.toFixed(1);
            if (mass < 1e6) return (mass / 1000).toFixed(1) + 'k';
            if (mass < 1e9) return (mass / 1e6).toFixed(1) + 'M';
            return mass.toExponential(2);
        };
        
        const formatEnergy = (energy) => {
            if (energy === 0) return '0 W';
            if (energy >= 1e15) return (energy / 1e15).toFixed(2) + ' PW';
            if (energy >= 1e12) return (energy / 1e12).toFixed(2) + ' TW';
            if (energy >= 1e9) return (energy / 1e9).toFixed(2) + ' GW';
            if (energy >= 1e6) return (energy / 1e6).toFixed(2) + ' MW';
            if (energy >= 1e3) return (energy / 1e3).toFixed(2) + ' kW';
            return energy.toFixed(2) + ' W';
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
        
        // Change detection: Cache tooltip content to avoid unnecessary regeneration
        const tooltipData = {
            zoneId: zone.id,
            storedMetal: storedMetal,
            massRemaining: massRemaining,
            numProbes: numProbes,
            structures: structuresCount,
            zoneEnergy: zoneEnergy,
            dysonBuildRate: dysonBuildRate,
            probeProductionRate: probeProductionRate,
            probesPerDay: probesPerDay,
            metalMiningRate: metalMiningRate,
            slagMiningRate: slagMiningRate
        };
        const tooltipHash = JSON.stringify(tooltipData);
        const tooltipCacheKey = `tooltip_${zone.id}_cache`;
        
        // Only regenerate tooltip if data changed
        let tooltipContent = '';
        if (tooltipHash === this[tooltipCacheKey] && this[tooltipCacheKey] !== null) {
            // Use cached content if available
            const cachedPanel = document.getElementById('zone-hover-tooltip');
            if (cachedPanel && cachedPanel.innerHTML && cachedPanel.style.display !== 'none') {
                return; // Tooltip already up to date, skip regeneration
            }
        }
        this[tooltipCacheKey] = tooltipHash;
        
        if (isDysonZone) {
            // Dyson zone tooltip
            // Calculate solar flux per m² (inverse square law)
            // Earth gets ~1361 W/m² at 1 AU
            const SOLAR_FLUX_EARTH = 1361; // W/m² at 1 AU
            const radiusAU = zone.radius_au || 0.2; // Dyson sphere is at ~0.2 AU
            const solarFluxPerM2 = SOLAR_FLUX_EARTH / (radiusAU * radiusAU);
            
            tooltipContent = `
                <div class="probe-summary-title">${zone.name}</div>
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Solar Flux</div>
                    <div class="probe-summary-value">${solarFluxPerM2.toFixed(1)} W/m²</div>
                </div>
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Probes</div>
                    <div class="probe-summary-value">${this.formatNumber(Math.floor(numProbes))}</div>
                </div>
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Dyson Construction Rate</div>
                    <div class="probe-summary-value">${formatRate(dysonBuildRate, 'kg')}</div>
                </div>
                ${probeProductionRate > 0 ? `
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Probe Production</div>
                    <div class="probe-summary-value">${formatRate(probeProductionRate, 'probes')}</div>
                </div>
                ` : ''}
                ${probesPerDay > 0 ? `
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Probe Production Rate</div>
                    <div class="probe-summary-value">${formatRate(probesPerDay, 'probes')}</div>
                </div>
                ` : ''}
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Energy Produced</div>
                    <div class="probe-summary-value">${formatEnergy(zoneEnergy.production)}</div>
                </div>
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Energy Consumed</div>
                    <div class="probe-summary-value">${formatEnergy(zoneEnergy.consumption)}</div>
                </div>
            `;
        } else {
            // Regular zone tooltip
            // Calculate solar flux per m² (inverse square law)
            // Earth gets ~1361 W/m² at 1 AU
            const SOLAR_FLUX_EARTH = 1361; // W/m² at 1 AU
            const radiusAU = zone.radius_au || 1.0;
            const solarFluxPerM2 = SOLAR_FLUX_EARTH / (radiusAU * radiusAU);
            
            // Calculate mining energy cost per kg/day
            // Base: 453515 / 86400 W per kg/day at Earth baseline
            // Formula: energy_cost_per_kg_day = base * (1.0 + delta_v_penalty)^2
            const BASE_MINING_ENERGY_COST = 453515 / 86400; // W per kg/day at Earth baseline
            const miningEnergyCostPerKgDay = BASE_MINING_ENERGY_COST * Math.pow(1.0 + deltaVPenalty, 2);
            
            // Format mining cost
            const formatMiningCost = (cost) => {
                if (cost < 1) return cost.toFixed(3) + ' W·d/kg';
                if (cost < 1000) return cost.toFixed(2) + ' W·d/kg';
                return (cost / 1000).toFixed(2) + ' kW·d/kg';
            };
            
            tooltipContent = `
                <div class="probe-summary-title">${zone.name}</div>
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Solar Flux</div>
                    <div class="probe-summary-value">${solarFluxPerM2.toFixed(1)} W/m²</div>
                </div>
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Metal Fraction</div>
                    <div class="probe-summary-value">${(metalPercentage * 100).toFixed(1)}%</div>
                </div>
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Mining Cost</div>
                    <div class="probe-summary-value">${formatMiningCost(miningEnergyCostPerKgDay)}</div>
                </div>
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Probes</div>
                    <div class="probe-summary-value">${this.formatNumber(Math.floor(numProbes))}</div>
                </div>
                ${probesPerDay > 0 ? `
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Probe Production Rate</div>
                    <div class="probe-summary-value">${formatRate(probesPerDay, 'probes')}</div>
                </div>
                ` : ''}
                ${miningRate > 0 ? `
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Mass Mining Rate</div>
                    <div class="probe-summary-value">${formatRate(miningRate, 'kg')}</div>
                </div>
                ` : ''}
                ${metalMiningRate > 0 ? `
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Metal Production</div>
                    <div class="probe-summary-value">${formatRate(metalMiningRate, 'kg')}</div>
                </div>
                ` : ''}
                ${slagMiningRate > 0 ? `
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Slag Production</div>
                    <div class="probe-summary-value">${formatRate(slagMiningRate, 'kg')}</div>
                </div>
                ` : ''}
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Stored Metal</div>
                    <div class="probe-summary-value">${formatMassWithSigFigs(storedMetal)} kg</div>
                </div>
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Energy Produced</div>
                    <div class="probe-summary-value">${formatEnergy(zoneEnergy.production)}</div>
                </div>
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Energy Consumed</div>
                    <div class="probe-summary-value">${formatEnergy(zoneEnergy.consumption)}</div>
                </div>
            `;
        }
        
        panel.style.bottom = 'auto';
        panel.style.position = 'fixed';
        panel.className = 'zone-hover-tooltip probe-summary-panel';
        panel.innerHTML = tooltipContent;
    }
    
    hideZoneInfoTooltip() {
        const panel = document.getElementById('zone-hover-tooltip');
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
        
        // Zones only deselect when clicking the same zone tile again (toggle behavior)
        // Clicking anywhere else keeps the zone selected
    }

    async selectZone(zoneId) {
        // If a transfer dialog is open and a different zone is selected, send the transfer
        if (this.currentTransferDialog && this.transferSourceZone && this.transferSourceZone !== zoneId) {
            // Update dialog with destination zone first
            if (this.currentTransferDialog.updateDestination) {
                this.currentTransferDialog.updateDestination(zoneId);
            }
            // This is the destination zone - send the transfer
            const destinationZoneId = zoneId;
            this.selectedZone = destinationZoneId;
            this.startCameraTracking(destinationZoneId); // Track the destination zone
            this.sendTransferFromDialog(destinationZoneId);
            this.closeTransferDialog();
            this.render(); // Re-render to show destination highlight
            return;
        }
        
        // If a transfer dialog is open and same zone is selected, just close it
        if (this.currentTransferDialog) {
            this.closeTransferDialog();
        }
        
        // If clicking the same zone, deselect it (toggle behavior)
        if (this.selectedZone === zoneId) {
            this.deselectZone();
            return;
        }
        
        // Select the new zone (normal selection)
        this.selectedZone = zoneId;
        // Don't automatically set as transfer source - wait for spacebar
        this.render(); // Re-render to show selection
        
        // Start camera tracking for the selected zone
        this.startCameraTracking(zoneId);
        
        // Notify panels of selection change
        if (window.purchasePanel) {
            window.purchasePanel.setSelectedZone(zoneId);
        }
        if (window.commandPanel) {
            window.commandPanel.setSelectedZone(zoneId);
        }
        if (window.zoneInfoPanel) {
            window.zoneInfoPanel.setSelectedZone(zoneId);
        }
        
        // Update backend with selected harvest zone
        try {
            await gameEngine.performAction('set_harvest_zone', { zone_id: zoneId });
        } catch (error) {
            console.error('Failed to set harvest zone:', error);
        }
    }
    
    /**
     * Start camera tracking for a zone
     */
    startCameraTracking(zoneId) {
        if (window.app && window.app.sceneManager && window.app.solarSystem) {
            const solarSystem = window.app.solarSystem;
            // Create a function that returns the current position of the zone's planet
            const getPositionFn = () => solarSystem.getZonePosition(zoneId);
            window.app.sceneManager.startTracking(getPositionFn);
        }
    }
    
    /**
     * Stop camera tracking
     */
    stopCameraTracking() {
        if (window.app && window.app.sceneManager) {
            window.app.sceneManager.stopTracking();
        }
    }
    
    closeTransferDialog() {
        // Close any open transfer dialog
        if (this.currentTransferDialog && this.currentTransferDialog.parentNode) {
            document.body.removeChild(this.currentTransferDialog);
            this.currentTransferDialog = null;
        }
        // Clear transfer source and waiting state
        this.transferSourceZone = null;
        this.waitingForTransferDestination = false;
        this.render();
    }
    
    deselectZone() {
        this.selectedZone = null;
        this.closeTransferDialog();
        
        // Stop camera tracking
        this.stopCameraTracking();
        
        // Notify panels of deselection
        if (window.purchasePanel) {
            window.purchasePanel.setSelectedZone(null);
        }
        if (window.commandPanel) {
            window.commandPanel.setSelectedZone(null);
        }
        if (window.zoneInfoPanel) {
            window.zoneInfoPanel.setSelectedZone(null);
        }
    }
    
    showTransferDialog(fromZoneId, toZoneId) {
        // Get zone data
        const fromZone = this.orbitalZones.find(z => z.id === fromZoneId);
        if (!fromZone) return;
        
        // Store source zone for later use
        this.transferSourceZone = fromZoneId;
        
        // Calculate delta-v difference (for display purposes) - use a default if no destination
        let deltaV = 0;
        let toZone = null;
        if (toZoneId) {
            toZone = this.orbitalZones.find(z => z.id === toZoneId);
            if (toZone) {
                deltaV = this.calculateTransferDeltaV(fromZone, toZone);
            }
        }
        
        // Transfers don't consume energy - probes use their own propulsion drives
        
        // Get probe count in source zone
        let availableProbes = 0;
        if (this.gameState && this.gameState.probes_by_zone) {
            const zoneProbes = this.gameState.probes_by_zone[fromZoneId] || {};
            // Single probe type only: directly access 'probe' key
            availableProbes += zoneProbes['probe'] || 0;
        }
        
        // Check if zone has mass driver (for metal transfers)
        const structuresByZone = this.gameState?.structures_by_zone || {};
        const zoneStructures = structuresByZone[fromZoneId] || {};
        const hasMassDriver = (zoneStructures['mass_driver'] || 0) > 0;
        const massDriverCount = zoneStructures['mass_driver'] || 0;
        
        // Get available metal in source zone
        let availableMetal = 0;
        if (this.gameState && this.gameState.zones) {
            const sourceZone = this.gameState.zones[fromZoneId] || {};
            availableMetal = sourceZone.stored_metal || 0;
        }
        
        // Calculate metal transfer capacity (if mass driver exists)
        let metalCapacity = 0;
        if (hasMassDriver && window.gameEngine) {
            // Get transfer system from engine
            const transferSystem = window.gameEngine.transferSystem;
            if (transferSystem && transferSystem.calculateMetalTransferCapacity) {
                metalCapacity = transferSystem.calculateMetalTransferCapacity(this.gameState, fromZoneId);
            }
        }
        
        // Create dialog with tabs
        const dialog = document.createElement('div');
        dialog.className = 'transfer-dialog';
        dialog.innerHTML = `
            <div class="transfer-dialog-content">
                <div class="transfer-dialog-header">
                    <h3>Transfer</h3>
                    <button class="transfer-dialog-close">&times;</button>
                </div>
                <div class="transfer-tabs">
                    <button class="transfer-tab active" data-tab="probes">Send Probes</button>
                    <button class="transfer-tab ${hasMassDriver ? '' : 'disabled'}" data-tab="metal" ${hasMassDriver ? '' : 'disabled'}>
                        Send Metal ${hasMassDriver ? '' : '(Requires Mass Driver)'}
                    </button>
                </div>
                <div class="transfer-dialog-body">
                    <div class="transfer-route">
                        <span class="transfer-zone">${fromZone.name.replace(/\s+Orbit\s*$/i, '')}</span>
                        <span class="transfer-arrow">→</span>
                        <span class="transfer-zone">${toZone ? toZone.name.replace(/\s+Orbit\s*$/i, '') : 'Select destination zone'}</span>
                    </div>
                    <div class="transfer-info">
                        <div class="transfer-info-item">
                            <span class="transfer-label">Delta-V:</span>
                            <span class="transfer-value">${toZone ? deltaV.toFixed(2) + ' km/s' : '—'}</span>
                        </div>
                        <div class="transfer-info-item">
                            <span class="transfer-label">Transfer Time:</span>
                            <span class="transfer-value" id="transfer-time">${toZone ? '—' : 'Select destination zone'}</span>
                        </div>
                        <div class="transfer-info-item" id="transfer-probe-info">
                            <span class="transfer-label">Available Probes:</span>
                            <span class="transfer-value">${this.formatNumber(availableProbes)}</span>
                        </div>
                        <div class="transfer-info-item" id="transfer-metal-info" style="display: none;">
                            <span class="transfer-label">Available Metal:</span>
                            <span class="transfer-value">${this.formatNumber(availableMetal)} kg</span>
                        </div>
                        <div class="transfer-info-item" id="transfer-capacity-info" style="display: none;">
                            <span class="transfer-label">Transfer Capacity:</span>
                            <span class="transfer-value">${this.formatNumber(metalCapacity)} kg/day</span>
                        </div>
                    </div>
                    <!-- Probe Transfer Tab -->
                    <div class="transfer-tab-content active" id="transfer-tab-probes">
                        <div class="transfer-options">
                            <div class="transfer-option">
                                <label>
                                    <input type="radio" name="transfer-type-probes" value="continuous">
                                    Continuous Transfer
                                </label>
                                <input type="number" id="transfer-rate-probes" min="0.01" max="100" step="0.1" value="10" 
                                       placeholder="% of probe production">
                            </div>
                            <div class="transfer-option">
                                <label>
                                    <input type="radio" name="transfer-type-probes" value="one-time" checked>
                                    One-Time Transfer
                                </label>
                                <div class="transfer-slider-container">
                                    <input type="range" id="transfer-count-slider" min="0" max="100" value="0" step="1">
                                    <div class="transfer-slider-labels">
                                        <span>1</span>
                                        <span id="transfer-count-display">1</span>
                                        <span>${availableProbes}</span>
                                    </div>
                                    <input type="hidden" id="transfer-count" value="1">
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- Metal Transfer Tab -->
                    <div class="transfer-tab-content" id="transfer-tab-metal">
                        ${hasMassDriver ? `
                        <div class="transfer-options">
                            <div class="transfer-option">
                                <label>
                                    <input type="radio" name="transfer-type-metal" value="continuous" checked>
                                    Continuous Transfer
                                </label>
                                <input type="number" id="transfer-rate-metal" min="0" step="1e9" value="${metalCapacity > 0 ? Math.min(metalCapacity, availableMetal) : 100e12}" 
                                       placeholder="kg/day">
                                <span class="transfer-hint">Default: ${this.formatNumber(100e12)} kg/day (100 GT/day)</span>
                            </div>
                            <div class="transfer-option">
                                <label>
                                    <input type="radio" name="transfer-type-metal" value="one-time">
                                    One-Time Transfer
                                </label>
                                <input type="number" id="transfer-metal-count" min="0" step="1e9" value="0" 
                                       placeholder="kg">
                                <span class="transfer-hint">Max: ${this.formatNumber(availableMetal)} kg</span>
                            </div>
                        </div>
                        ` : `
                        <div class="transfer-error">
                            <p>Mass driver required for metal transfers.</p>
                            <p>Build a mass driver in the source zone to enable metal transfers.</p>
                        </div>
                        `}
                    </div>
                    <div class="transfer-actions">
                        <button class="transfer-cancel">Cancel</button>
                        <button class="transfer-confirm">Confirm Transfer</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // Calculate transfer time only if destination is set
        let probeTransferTime = null;
        if (toZone) {
            // Calculate base transfer time (without mass driver boost)
            let baseTransferTime = this.calculateTransferTime(fromZone, toZone);
            
            // Calculate transfer time with mass driver boost (for probe transfers)
            probeTransferTime = baseTransferTime;
            if (hasMassDriver && window.gameEngine && window.gameEngine.transferSystem) {
                const speedMultiplier = window.gameEngine.transferSystem.calculateMassDriverSpeedMultiplier(massDriverCount);
                probeTransferTime = baseTransferTime * speedMultiplier;
            }
        }
        
        // Display transfer time with appropriate formatting
        // Show probe transfer time (with mass driver boost if available)
        const timeEl = dialog.querySelector('#transfer-time');
        if (timeEl && toZone) {
            // Update time display when switching tabs
            const updateTransferTime = () => {
                const activeTab = dialog.querySelector('.transfer-tab.active');
                const tabName = activeTab ? activeTab.dataset.tab : 'probes';
                if (tabName === 'probes' && probeTransferTime !== null) {
                    timeEl.textContent = this.formatTransferTime(probeTransferTime);
                    if (hasMassDriver) {
                        timeEl.textContent += ` (${massDriverCount} mass driver${massDriverCount > 1 ? 's' : ''})`;
                    }
                } else if (tabName === 'metal' && probeTransferTime !== null) {
                    // Metal transfers use same time as probes (with mass driver boost)
                    timeEl.textContent = this.formatTransferTime(probeTransferTime);
                }
            };
            updateTransferTime();
            
            // Update when tabs change
            const tabs = dialog.querySelectorAll('.transfer-tab');
            tabs.forEach(tab => {
                tab.addEventListener('click', updateTransferTime);
            });
        }
        
        // Store dialog reference for updating destination
        dialog.updateDestination = (newToZoneId) => {
            const newToZone = this.orbitalZones.find(z => z.id === newToZoneId);
            if (!newToZone) return;
            
            // Update route display
            const routeEl = dialog.querySelector('.transfer-route');
            const toZoneSpan = routeEl.querySelector('.transfer-zone:last-child');
            if (toZoneSpan) {
                toZoneSpan.textContent = newToZone.name.replace(/\s+Orbit\s*$/i, '');
            }
            
            // Update delta-v (first transfer-info-item contains delta-v)
            const newDeltaV = this.calculateTransferDeltaV(fromZone, newToZone);
            const deltaVItem = dialog.querySelector('.transfer-info-item');
            const deltaVEl = deltaVItem ? deltaVItem.querySelector('.transfer-value') : null;
            if (deltaVEl) {
                deltaVEl.textContent = newDeltaV.toFixed(2) + ' km/s';
            }
            
            // Update transfer time
            let baseTransferTime = this.calculateTransferTime(fromZone, newToZone);
            let newProbeTransferTime = baseTransferTime;
            if (hasMassDriver && window.gameEngine && window.gameEngine.transferSystem) {
                const speedMultiplier = window.gameEngine.transferSystem.calculateMassDriverSpeedMultiplier(massDriverCount);
                newProbeTransferTime = baseTransferTime * speedMultiplier;
            }
            if (timeEl) {
                const activeTab = dialog.querySelector('.transfer-tab.active');
                const tabName = activeTab ? activeTab.dataset.tab : 'probes';
                if (tabName === 'probes') {
                    timeEl.textContent = this.formatTransferTime(newProbeTransferTime);
                    if (hasMassDriver) {
                        timeEl.textContent += ` (${massDriverCount} mass driver${massDriverCount > 1 ? 's' : ''})`;
                    }
                } else {
                    timeEl.textContent = this.formatTransferTime(newProbeTransferTime);
                }
            }
            
            probeTransferTime = newProbeTransferTime;
        };
        
        // Transfers don't consume energy - probes use their own propulsion drives
        
        // Set up logarithmic slider for one-time transfer count
        const countSlider = dialog.querySelector('#transfer-count-slider');
        const countDisplay = dialog.querySelector('#transfer-count-display');
        const countHidden = dialog.querySelector('#transfer-count');
        
        // Convert slider value (0-100) to probe count (1 to availableProbes) with log sensitivity
        const sliderToProbeCount = (sliderValue) => {
            if (sliderValue === 0) return 1;
            if (sliderValue === 100) return availableProbes;
            // Logarithmic scaling: log10(1) = 0, log10(availableProbes) = log10(availableProbes)
            const minLog = Math.log10(1);
            const maxLog = Math.log10(Math.max(1, availableProbes));
            const logValue = minLog + (sliderValue / 100) * (maxLog - minLog);
            return Math.max(1, Math.floor(Math.pow(10, logValue)));
        };
        
        // Convert probe count to slider value (1 to availableProbes) with log sensitivity
        const probeCountToSlider = (probeCount) => {
            if (probeCount <= 1) return 0;
            if (probeCount >= availableProbes) return 100;
            const minLog = Math.log10(1);
            const maxLog = Math.log10(Math.max(1, availableProbes));
            const logValue = Math.log10(probeCount);
            return Math.round(((logValue - minLog) / (maxLog - minLog)) * 100);
        };
        
        // Initialize slider value for default count of 1
        const defaultCount = 1;
        const defaultSliderValue = probeCountToSlider(defaultCount);
        if (countSlider) {
            countSlider.value = defaultSliderValue;
            countHidden.value = defaultCount;
            if (countDisplay) {
                countDisplay.textContent = defaultCount;
            }
        }
        
        // Update probe count when slider changes
        if (countSlider) {
            countSlider.addEventListener('input', (e) => {
                const sliderValue = parseInt(e.target.value);
                const probeCount = sliderToProbeCount(sliderValue);
                countHidden.value = probeCount;
                if (countDisplay) {
                    countDisplay.textContent = probeCount;
                }
                // Transfers don't consume energy - no need to update energy costs
            });
        }
        
        // Transfers don't consume energy - no need to update energy costs
        
        // Store dialog reference for closing from outside
        this.currentTransferDialog = dialog;
        
        // Re-render to show travel times above zones
        this.render();
        
        // Event handlers
        const closeDialog = () => {
            if (dialog.parentNode) {
                document.body.removeChild(dialog);
            }
            // Clear transfer source and waiting state when dialog closes
            this.transferSourceZone = null;
            this.waitingForTransferDestination = false;
            this.currentTransferDialog = null;
            this.render();
        };
        
        dialog.querySelector('.transfer-dialog-close').addEventListener('click', closeDialog);
        
        dialog.querySelector('.transfer-cancel').addEventListener('click', closeDialog);
        
        // Tab switching
        const tabs = dialog.querySelectorAll('.transfer-tab');
        const tabContents = dialog.querySelectorAll('.transfer-tab-content');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                if (tab.classList.contains('disabled')) return;
                
                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Update active content
                const tabName = tab.dataset.tab;
                tabContents.forEach(content => {
                    content.classList.remove('active');
                    if (content.id === `transfer-tab-${tabName}`) {
                        content.classList.add('active');
                    }
                });
                
                // Update info display
                const probeInfo = dialog.querySelector('#transfer-probe-info');
                const metalInfo = dialog.querySelector('#transfer-metal-info');
                const capacityInfo = dialog.querySelector('#transfer-capacity-info');
                if (tabName === 'probes') {
                    if (probeInfo) probeInfo.style.display = '';
                    if (metalInfo) metalInfo.style.display = 'none';
                    if (capacityInfo) capacityInfo.style.display = 'none';
                } else {
                    if (probeInfo) probeInfo.style.display = 'none';
                    if (metalInfo) metalInfo.style.display = '';
                    if (capacityInfo) capacityInfo.style.display = '';
                }
            });
        });
        
        // Confirm button is now optional - selecting a zone will send the transfer
        // But keep it for manual confirmation if needed
        dialog.querySelector('.transfer-confirm').addEventListener('click', () => {
            if (!toZoneId) {
                // No destination selected yet
                return;
            }
            this.sendTransferFromDialog(toZoneId);
            closeDialog();
        });
        
        // Click outside to close
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                closeDialog();
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
    
    calculateTransferDistance(fromZone, toZone) {
        // Calculate distance between zones in km
        // Use semi-major axis of Hohmann transfer orbit
        const r1 = (fromZone.radius_km || fromZone.radius_au * 149597870.7) || 149597870.7; // km
        const r2 = (toZone.radius_km || toZone.radius_au * 149597870.7) || 149597870.7; // km
        
        // Hohmann transfer semi-major axis
        const a = (r1 + r2) / 2;
        
        // Transfer distance is approximately half the ellipse perimeter
        // Simplified: use average of r1 and r2 as approximation
        const distance = Math.PI * Math.sqrt((r1 + r2) / 2 * a);
        
        return distance;
    }
    
    getProbeMovementSpeed() {
        // Get probe movement speed with research upgrades
        // Base speed from config
        const baseSpeed = 30.0; // km/s (PROBE_BASE_MOVEMENT_SPEED)
        
        // Get research bonuses for propulsion
        let speedMultiplier = 1.0;
        if (typeof gameEngine !== 'undefined' && gameEngine.engine && typeof gameEngine.engine._getResearchBonus === 'function') {
            // Check for propulsion speed bonuses
            const specificImpulseBonus = gameEngine.engine._getResearchBonus('propulsion_systems', 'specific_impulse_improvement', 0.0);
            const propulsionEfficiency = gameEngine.engine._getResearchBonus('propulsion_systems', 'ultimate_propulsion_efficiency', 0.0);
            
            // Speed scales with specific impulse improvement
            speedMultiplier = 1.0 + specificImpulseBonus + propulsionEfficiency;
        }
        
        return baseSpeed * speedMultiplier;
    }
    
    calculateTransferTime(fromZone, toZone) {
        // Calculate realistic transfer time based on distance and probe speed
        const distance = this.calculateTransferDistance(fromZone, toZone); // km
        const speed = this.getProbeMovementSpeed(); // km/s
        
        // Transfer time = distance / speed (calculated in days, converted to seconds for animation)
        const transferTimeSeconds = distance / speed;
        
        // Convert to days (fundamental time unit)
        const SECONDS_PER_DAY = 86400;
        const transferTimeDays = transferTimeSeconds / SECONDS_PER_DAY;
        
        return transferTimeDays;
    }
    
    calculateTransferEnergyCost(fromZone, toZone, probeCount = 1) {
        // Transfers don't consume energy - probes use their own propulsion drives
        return 0;
    }
    
    calculateProbePropulsionStats() {
        // Base specific impulse (Isp) in seconds - typical chemical rocket
        const baseIsp = 300; // seconds
        
        // Get research bonuses
        let specificImpulseBonus = 0.0;
        let propulsionEfficiency = 0.0;
        if (window.gameEngine && window.gameEngine.engine && typeof window.gameEngine.engine._getResearchBonus === 'function') {
            specificImpulseBonus = window.gameEngine.engine._getResearchBonus('propulsion_systems', 'specific_impulse_improvement', 0.0);
            propulsionEfficiency = window.gameEngine.engine._getResearchBonus('propulsion_systems', 'ultimate_propulsion_efficiency', 0.0);
        }
        
        // Calculate effective specific impulse (Isp scales with bonuses)
        // Bonus is a multiplier: 0.30 = 30% improvement
        const specificImpulse = baseIsp * (1.0 + specificImpulseBonus + propulsionEfficiency);
        
        // Calculate total thrust
        // Thrust = Isp * g0 * mass flow rate
        // For a probe: assume mass flow rate based on probe mass and delta-v capability
        // Simplified: Thrust ≈ (probe mass * delta-v) / burn_time
        // For display purposes, use: Thrust = Isp * g0 * (probe_mass / typical_burn_time)
        const g0 = 9.80665; // m/s² (standard gravity)
        const probeMass = Config.PROBE_MASS; // kg
        const typicalBurnTime = 100; // seconds (typical burn duration)
        const massFlowRate = probeMass / typicalBurnTime; // kg/s
        const totalThrust = specificImpulse * g0 * massFlowRate; // Newtons
        
        return {
            specificImpulse: specificImpulse,
            totalThrust: totalThrust
        };
    }
    
    formatTransferTime(days) {
        // Use FormatUtils for consistent time formatting
        return FormatUtils.formatTime(days);
    }
    
    sendTransferFromDialog(toZoneId) {
        // Extract transfer data from the open dialog and send it
        if (!this.currentTransferDialog || !this.transferSourceZone) {
            return;
        }
        
        const dialog = this.currentTransferDialog;
        const fromZoneId = this.transferSourceZone;
        
        // Get structures to check for mass driver
        const structuresByZone = this.gameState?.structures_by_zone || {};
        const zoneStructures = structuresByZone[fromZoneId] || {};
        const hasMassDriver = (zoneStructures['mass_driver'] || 0) > 0;
        
        // Determine which tab is active
        const activeTab = dialog.querySelector('.transfer-tab.active');
        const tabName = activeTab ? activeTab.dataset.tab : 'probes';
        
        if (tabName === 'probes') {
            // Probe transfer
            const transferType = dialog.querySelector('input[name="transfer-type-probes"]:checked')?.value;
            if (transferType === 'one-time') {
                const count = parseInt(dialog.querySelector('#transfer-count').value) || 1;
                this.createTransfer(fromZoneId, toZoneId, 'probe', 'one-time', count, 0);
            } else {
                const rate = parseFloat(dialog.querySelector('#transfer-rate-probes').value) || 1;
                this.createTransfer(fromZoneId, toZoneId, 'probe', 'continuous', 0, rate);
            }
        } else if (tabName === 'metal' && hasMassDriver) {
            // Metal transfer
            const transferType = dialog.querySelector('input[name="transfer-type-metal"]:checked')?.value;
            if (transferType === 'one-time') {
                const metalKg = parseFloat(dialog.querySelector('#transfer-metal-count').value) || 0;
                this.createTransfer(fromZoneId, toZoneId, 'metal', 'one-time', metalKg, 0);
            } else {
                const rateKgPerDay = parseFloat(dialog.querySelector('#transfer-rate-metal').value) || 100e12;
                this.createTransfer(fromZoneId, toZoneId, 'metal', 'continuous', 0, rateKgPerDay);
            }
        }
    }
    
    createTransfer(fromZoneId, toZoneId, resourceType, type, count, rate) {
        // Execute transfer via game engine (arcs will be synced from game state)
        if (window.gameEngine) {
            const actionData = {
                from_zone: fromZoneId,
                to_zone: toZoneId,
                resource_type: resourceType, // 'probe' or 'metal'
                transfer_type: type, // 'one-time' or 'continuous'
            };
            
            if (type === 'one-time') {
                if (resourceType === 'probe') {
                    actionData.probe_count = count;
                } else {
                    actionData.metal_kg = count;
                }
            } else {
                if (resourceType === 'probe') {
                    actionData.rate = rate; // Percentage for probes
                } else {
                    actionData.rate = rate; // kg/day for metal
                }
            }
            
            window.gameEngine.performAction('create_transfer', actionData).then(result => {
                if (!result.success && result.error) {
                    // Show error message to user
                    alert(`Transfer failed: ${result.error}`);
                }
            }).catch(error => {
                console.error('Failed to create transfer:', error);
                alert(`Transfer failed: ${error.message || error}`);
            });
        }
        
        // Transfer arcs will be updated from game state in updateTransferArcs()
        // No need to manually add to transferArcs array
    }

    update(gameState) {
        if (!gameState) return;
        
        // Change detection: Only re-render if zone selection or STRUCTURE changed
        // Don't include zone_metal_remaining - it changes every tick and doesn't need full re-render
        // Use efficient hash instead of JSON.stringify to avoid memory issues
        let hash = 0;
        if (this.selectedZone) {
            for (let i = 0; i < this.selectedZone.length; i++) {
                hash = ((hash << 5) - hash) + this.selectedZone.charCodeAt(i);
            }
        }
        if (this.transferSourceZone) {
            for (let i = 0; i < this.transferSourceZone.length; i++) {
                hash = ((hash << 5) - hash) + this.transferSourceZone.charCodeAt(i);
            }
        }
        hash = ((hash << 5) - hash) + (this.waitingForTransferDestination ? 1 : 0);
        
        // Hash probe counts and structures (these change infrequently)
        // Read from derived.zones (pre-calculated in worker)
        const derived = gameState.derived || {};
        const zones = derived.zones || {};
        for (const [zoneId, zoneData] of Object.entries(zones)) {
            hash = ((hash << 5) - hash) + zoneId.charCodeAt(0);
            hash = ((hash << 5) - hash) + (zoneData.probe_count || 0);
        }
        
        // Hash structures by zone (only structure types, not counts - counts change frequently)
        const structuresByZone = gameState.structures_by_zone || {};
        for (const [zoneId, structures] of Object.entries(structuresByZone)) {
            hash = ((hash << 5) - hash) + zoneId.charCodeAt(0);
            // Only hash structure types present, not counts (counts change frequently)
            hash = ((hash << 5) - hash) + Object.keys(structures).length;
        }
        
        const currentHash = hash.toString();
        
        // Always update gameState, but only render if structure/selection changed
        const needsRender = currentHash !== this.lastRenderHash || this.lastRenderHash === null;
        if (needsRender) {
            this.render();
            this.lastRenderHash = currentHash;
        } else {
            // Incremental update: only update stats that change frequently (metal remaining, probe counts)
            this.updateZoneStats(gameState);
        }
        
        this.gameState = gameState;
        
        // Probe visualization disabled for performance - kept for future use
        // Uncomment below to enable probe dot visualization:
        // if (this.probeUpdateFrameCount % 30 === 0) {
        //     this.updateProbeDots();
        // }
        
        this.updateTransferArcs();
    }
    
    /**
     * Incremental update of zone stats without full re-render
     * Updates dynamic values like probe counts, metal remaining, etc.
     */
    updateZoneStats(gameState) {
        if (!gameState || !this.orbitalZones) return;
        
        // Read derived values from game state
        const derived = gameState.derived || {};
        const zones = derived.zones || {};
        
        // Update each zone's displayed stats
        for (const zone of this.orbitalZones) {
            const zoneData = zones[zone.id] || {};
            const probeCount = zoneData.probe_count || 0;
            
            // Update probe count display if element exists
            const probeCountEl = document.querySelector(`[data-zone-probes="${zone.id}"]`);
            if (probeCountEl) {
                probeCountEl.textContent = probeCount.toLocaleString();
            }
        }
    }
    
    updateProbeDots() {
        if (!this.gameState || !this.orbitalZones) return;
        
        // Read from derived (pre-calculated in worker)
        const derived = this.gameState.derived || {};
        const totals = derived.totals || {};
        const zones = derived.zones || {};
        const totalProbes = totals.probe_count || 0;
        const zoneProbeCounts = {};
        for (const [zoneId, zoneData] of Object.entries(zones)) {
            zoneProbeCounts[zoneId] = zoneData.probe_count || 0;
        }
        
        // Change detection: Only update if probe counts have changed
        // Use efficient hash instead of JSON.stringify to avoid memory issues
        let countsHash = 0;
        for (const [zoneId, count] of Object.entries(zoneProbeCounts)) {
            countsHash = ((countsHash << 5) - countsHash) + zoneId.charCodeAt(0);
            countsHash = ((countsHash << 5) - countsHash) + (count || 0);
        }
        const countsKey = countsHash.toString();
        if (countsKey === this.lastProbeCounts) {
            return; // No changes, skip DOM manipulation
        }
        this.lastProbeCounts = countsKey;
        
            // Maximum dots to show per zone (reduced to prevent DOM overload)
            const MAX_DOTS_PER_ZONE = 50; // Reduced from 200 to prevent crashes
            
            // Distribute dots proportionally across zones
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
                
                // Calculate probe count for this zone
                const probeCount = zoneProbeCounts[zone.id] || 0;
                
                // Clear existing dots efficiently
                while (container.firstChild) {
                    container.removeChild(container.firstChild);
                }
                
                // If no probes in zone, don't draw any
                if (probeCount === 0) return;
                
                // Calculate number of probe dots to draw for this zone
                // Use logarithmic scaling to prevent too many dots
                let totalDots = 0;
                
                if (totalProbes < 100) {
                    // Low population: draw exact count (capped)
                    totalDots = Math.min(Math.floor(probeCount), MAX_DOTS_PER_ZONE);
                } else if (totalProbes < 10000) {
                    // Medium population: logarithmic scaling
                    // Base dots + log scale
                    const baseDots = Math.min(10, Math.floor(probeCount));
                    const logScale = Math.floor(Math.log10(Math.max(1, probeCount / 10)) * 5);
                    totalDots = Math.min(baseDots + logScale, MAX_DOTS_PER_ZONE);
                } else {
                    // High population: very limited dots
                    // Use square root scaling to keep dots manageable
                    const sqrtScale = Math.floor(Math.sqrt(probeCount / 100));
                    totalDots = Math.min(Math.max(1, sqrtScale), MAX_DOTS_PER_ZONE);
                }
                
                if (totalDots === 0) return;
            
            // Create floating dots around the planet square
            // Multiple concentric circles that fill up sequentially
            const squareSize = parseInt(planetSquare.style.width) || 35;
            const baseRadius = squareSize / 2 + 8; // Base distance from center for inner circle
            
            // Define circle layers: [radiusOffset, maxDots]
            // Circle 2 is closer to circle 1, then constant spacing for 3 and 4
            const circles = [
                { radius: baseRadius, maxDots: 15 },      // Circle 1: inner
                { radius: baseRadius + 8, maxDots: 20 }, // Circle 2: closer to circle 1
                { radius: baseRadius + 16, maxDots: 25 }, // Circle 3: constant spacing
                { radius: baseRadius + 24, maxDots: 30 }  // Circle 4: constant spacing
            ];
            
            // Use DocumentFragment for efficient batch DOM insertion
            const fragment = document.createDocumentFragment();
            
            // Distribute dots across circles, filling each circle before moving to the next
            let dotsRemaining = totalDots;
            let circleIndex = 0;
            
            while (dotsRemaining > 0 && circleIndex < circles.length) {
                const circle = circles[circleIndex];
                const dotsInThisCircle = Math.min(dotsRemaining, circle.maxDots);
                
                for (let i = 0; i < dotsInThisCircle; i++) {
                    const dot = document.createElement('div');
                    dot.className = 'orbital-zone-probe-dot probe-dot';
                    
                    // Position dots in this circle
                    const angle = (i / dotsInThisCircle) * Math.PI * 2;
                    const x = Math.cos(angle) * circle.radius;
                    const y = Math.sin(angle) * circle.radius;
                    
                    // Add animation delay for floating effect (offset by circle index)
                    const animationDelay = (i / dotsInThisCircle) * 2 + (circleIndex * 0.5);
                    
                    dot.style.left = `calc(50% + ${x}px)`;
                    dot.style.top = `calc(50% + ${y}px)`;
                    dot.style.animationDelay = `${animationDelay}s`;
                    
                    fragment.appendChild(dot);
                }
                
                dotsRemaining -= dotsInThisCircle;
                circleIndex++;
            }
            
            // Single DOM operation to add all dots
            container.appendChild(fragment);
        });
    }
    
    updateTransferArcs() {
        // Get active transfers from game state
        if (!this.gameState || !this.gameState.active_transfers) {
            // Clear arcs if no transfers
            const svgContainer = this.container.querySelector('.transfer-arc-svg-container');
            if (svgContainer && this.transferArcs && this.transferArcs.length > 0) {
                svgContainer.innerHTML = '';
                this.transferArcs = [];
            }
            return;
        }
        
        const currentTime = this.gameState.time || 0;
        // Filter out completed one-time transfers and convert to visualization format
        const newTransferArcs = this.gameState.active_transfers
            .filter(transfer => {
                // Keep continuous transfers and incomplete one-time transfers
                if (transfer.type === 'continuous') {
                    // Show if not paused or has probes in transit
                    return !transfer.paused || (transfer.in_transit && transfer.in_transit.length > 0);
                }
                // For one-time transfers, check if they've arrived
                if (transfer.type === 'one-time' || !transfer.type) {
                    // Check status - only show if traveling
                    if (transfer.status === 'completed' || transfer.status === 'cancelled') {
                        return false;
                    }
                    // Check arrival time - show if it's in the future
                    if (transfer.arrival_time !== undefined && transfer.arrival_time !== null) {
                        return transfer.arrival_time > currentTime;
                    }
                    // Fallback: if status is traveling and arrival_time is not set, show it (might be just created)
                    return transfer.status === 'traveling' || transfer.status === 'paused';
                }
                return true;
            })
            .map(transfer => ({
                id: transfer.id,
                from: transfer.from_zone || transfer.from,
                to: transfer.to_zone || transfer.to,
                type: transfer.type || 'one-time',
                count: transfer.probe_count || 0,
                rate: transfer.rate || 0,
                ratePercentage: transfer.rate_percentage || 0,
                transferTime: transfer.transfer_time || (transfer.arrival_time && transfer.departure_time ? transfer.arrival_time - transfer.departure_time : 90.0),
                startTime: transfer.departure_time || transfer.startTime || currentTime,
                departureTime: transfer.departure_time,
                arrivalTime: transfer.arrival_time,
                inTransit: transfer.in_transit || [],
                in_transit: transfer.in_transit || [], // Support both formats
                status: transfer.status,
                paused: transfer.paused || false
            }));
        
        // Change detection: Only update if transfers have changed
        // Use efficient hash instead of JSON.stringify to avoid memory issues
        let hash = 0;
        for (const transfer of newTransferArcs) {
            hash = ((hash << 5) - hash) + (transfer.id || 0);
            const from = transfer.from || '';
            const to = transfer.to || '';
            for (let i = 0; i < from.length; i++) {
                hash = ((hash << 5) - hash) + from.charCodeAt(i);
            }
            for (let i = 0; i < to.length; i++) {
                hash = ((hash << 5) - hash) + to.charCodeAt(i);
            }
            // Include in-transit count in hash for continuous transfers
            if (transfer.type === 'continuous') {
                const inTransit = transfer.in_transit || transfer.inTransit || [];
                hash = ((hash << 5) - hash) + inTransit.length;
            }
        }
        const transfersHash = hash.toString();
        const structureChanged = transfersHash !== this.lastTransferArcsHash;
        
        // Update transfer arcs data
        this.transferArcs = newTransferArcs;
        
        if (structureChanged) {
            // Structure changed - update arcs
            this.lastTransferArcsHash = transfersHash;
            
            // Clear existing transfer arcs
            const svgContainer = this.container.querySelector('.transfer-arc-svg-container');
            if (svgContainer) {
                svgContainer.innerHTML = '';
            }
        }
        
        // Always ensure arcs are drawn for all active transfers (even if structure didn't change)
        // This handles cases where arcs might have been removed or SVG container was cleared
        const svgContainer = this.container.querySelector('.transfer-arc-svg-container');
        if (svgContainer) {
            // Draw/update arcs for all active transfers
            this.transferArcs.forEach(transfer => {
                const transferId = `transfer-${transfer.id || `${transfer.from}-${transfer.to}-${transfer.type}`}`;
                const existingSvg = svgContainer.querySelector(`svg[data-transfer-id="${transferId}"]`);
                
                if (!existingSvg) {
                    // Arc doesn't exist, draw it
                    this.drawTransferArc(transfer);
                }
                // If arc exists, animation will update positions via updateTransferArcAnimations()
            });
        }
        
        // Always start/ensure animation interval is running
        this.startTransferArcAnimation();
    }
    
    /**
     * Start transfer arc animation interval (10 times per second)
     */
    startTransferArcAnimation() {
        // Clear existing interval if any
        if (this.transferArcAnimationInterval) {
            clearInterval(this.transferArcAnimationInterval);
        }
        
        // Update animations 10 times per second
        this.transferArcAnimationInterval = setInterval(() => {
            if (this.gameState && this.transferArcs && this.transferArcs.length > 0) {
                this.updateTransferArcAnimations();
            }
        }, this.transferArcUpdateRate);
    }
    
    /**
     * Update transfer arc animations without recreating DOM
     * Called 10 times per second to update probe dot positions
     */
    updateTransferArcAnimations() {
        if (!this.gameState || !this.transferArcs) return;
        
        const currentTime = this.gameState.time || 0;
        const animationSvgContainer = this.container.querySelector('.transfer-arc-svg-container');
        if (!animationSvgContainer) return;
        
        // Update each transfer arc's animation
        this.transferArcs.forEach(transfer => {
            const transferId = `transfer-${transfer.id || `${transfer.from}-${transfer.to}-${transfer.type}`}`;
            const svg = animationSvgContainer.querySelector(`svg[data-transfer-id="${transferId}"]`);
            if (!svg) return;
            
            const path = svg.querySelector('path');
            if (!path) return;
            const pathLength = path.getTotalLength();
            
            // Update probe dot positions for this transfer
            const probeIcons = svg.querySelectorAll('circle[data-departure-time]');
            probeIcons.forEach(probeIcon => {
                const batchDepartureTime = parseFloat(probeIcon.getAttribute('data-departure-time') || 0);
                const batchArrivalTime = parseFloat(probeIcon.getAttribute('data-arrival-time') || 0);
                const transferTime = parseFloat(probeIcon.getAttribute('data-transfer-time') || (batchArrivalTime - batchDepartureTime));
                
                // Check if transfer is still active
                const isTransferActive = this.gameState && 
                    this.gameState.active_transfers && 
                    this.gameState.active_transfers.some(t => 
                        t.id === transfer.id || 
                        (t.from_zone === transfer.from && t.to_zone === transfer.to && t.type === transfer.type)
                    );
                
                if (!isTransferActive) {
                    // Transfer cancelled or completed - remove dot but keep arc until cleanup
                    probeIcon.remove();
                    return;
                }
                
                if (batchArrivalTime <= currentTime) {
                    // Batch has arrived, remove dot
                    probeIcon.remove();
                    return;
                }
                
                if (batchDepartureTime > currentTime) {
                    // Batch hasn't departed yet, hide dot
                    probeIcon.style.opacity = '0';
                    return;
                }
                
                // Calculate progress (0 = at origin, 1 = at destination)
                const elapsed = currentTime - batchDepartureTime;
                const progress = Math.max(0, Math.min(1, elapsed / transferTime));
                
                // Update dot position along path
                const point = path.getPointAtLength(pathLength * progress);
                probeIcon.setAttribute('cx', point.x);
                probeIcon.setAttribute('cy', point.y);
                probeIcon.style.opacity = '1';
            });
            
            // For continuous transfers, also add new dots for batches that have departed
            if (transfer.type === 'continuous') {
                const inTransit = transfer.in_transit || transfer.inTransit || [];
                inTransit.forEach(batch => {
                    const batchDepartureTime = batch.departure_time || batch.departureTime || 0;
                    const batchArrivalTime = batch.arrival_time || batch.arrivalTime || 0;
                    
                    // Only show dots for batches that have departed but not arrived
                    if (batchDepartureTime <= currentTime && batchArrivalTime > currentTime) {
                        // Check if dot already exists for this batch (use a more specific selector)
                        const existingDot = svg.querySelector(`circle[data-departure-time="${batchDepartureTime}"][data-arrival-time="${batchArrivalTime}"]`);
                        if (!existingDot) {
                            // Create new dot for this batch
                            const probeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                            probeIcon.setAttribute('r', '4');
                            probeIcon.setAttribute('fill', '#ffffff');
                            probeIcon.setAttribute('opacity', '0.85');
                            probeIcon.setAttribute('data-departure-time', batchDepartureTime.toString());
                            probeIcon.setAttribute('data-arrival-time', batchArrivalTime.toString());
                            probeIcon.setAttribute('data-transfer-time', (batchArrivalTime - batchDepartureTime).toString());
                            svg.appendChild(probeIcon);
                        }
                    }
                });
            }
            
            // Don't remove arcs here - let updateTransferArcs() handle removal based on active_transfers
            // This ensures arcs persist as long as transfers are active
        });
        
        // Clean up arcs for transfers that are no longer active
        if (animationSvgContainer) {
            const allSvgs = animationSvgContainer.querySelectorAll('svg[data-transfer-id]');
            allSvgs.forEach(svg => {
                const transferIdAttr = svg.getAttribute('data-transfer-id');
                // Extract transfer ID from attribute (format: "transfer-{id}")
                const transferId = transferIdAttr ? transferIdAttr.replace('transfer-', '') : null;
                
                // Check if this transfer is still active
                const isTransferActive = this.gameState && 
                    this.gameState.active_transfers && 
                    this.gameState.active_transfers.some(t => {
                        const tId = t.id || `${t.from_zone || t.from}-${t.to_zone || t.to}-${t.type || 'one-time'}`;
                        return tId === transferId || transferIdAttr === `transfer-${tId}`;
                    });
                
                if (!isTransferActive) {
                    // Transfer is no longer active - remove arc
                    svg.remove();
                }
            });
        }
    }
    
    drawTransferArc(transfer) {
        // Find source and destination planet squares (the colored squares, not zone selector tiles)
        const fromSquare = this.container.querySelector(`.orbital-zone-planet-square-float[data-zone="${transfer.from}"]`);
        const toSquare = this.container.querySelector(`.orbital-zone-planet-square-float[data-zone="${transfer.to}"]`);
        if (!fromSquare || !toSquare) return;
        
        // Get positions relative to the planet squares container
        const planetSquaresContainer = this.container.querySelector('.orbital-zone-planet-squares');
        if (!planetSquaresContainer) return;
        
        // Create SVG overlay for transfer arc - position it relative to planet squares container
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
            // Append to planet squares container so coordinates are relative to it
            planetSquaresContainer.appendChild(svgContainer);
        }
        
        // Get positions relative to planet squares container
        // Use offsetLeft/offsetTop for more reliable positioning
        const containerRect = planetSquaresContainer.getBoundingClientRect();
        const fromRect = fromSquare.getBoundingClientRect();
        const toRect = toSquare.getBoundingClientRect();
        
        // Calculate center positions of planet squares relative to container
        // The planet squares are already positioned above the zone selectors
        const fromX = fromRect.left + fromRect.width / 2 - containerRect.left;
        const fromY = fromRect.top + fromRect.height / 2 - containerRect.top;
        const toX = toRect.left + toRect.width / 2 - containerRect.left;
        const toY = toRect.top + toRect.height / 2 - containerRect.top;
        
        // Create SVG path for Hohmann transfer (elliptical arc)
        const transferId = `transfer-${transfer.id || `${transfer.from}-${transfer.to}-${transfer.type}`}`;
        let svg = svgContainer.querySelector(`svg[data-transfer-id="${transferId}"]`);
        
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'transfer-arc');
            svg.setAttribute('width', containerRect.width.toString());
            svg.setAttribute('height', containerRect.height.toString());
            svg.style.position = 'absolute';
            svg.style.top = '0';
            svg.style.left = '0';
            svg.setAttribute('data-transfer-id', transferId);
            svgContainer.appendChild(svg);
        } else {
            // Clear existing content but keep SVG
            svg.innerHTML = '';
        }
        
        // Calculate elliptical arc for Hohmann transfer
        const dx = toX - fromX;
        const dy = toY - fromY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Create elliptical arc path (Hohmann transfer is an elliptical orbit)
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const largeArc = distance > 50 ? 1 : 0; // Large arc if distance is significant
        const sweep = dy > 0 ? 1 : 0; // Sweep direction based on vertical direction
        
        // Create upward-bending arc (always bend upward)
        // Use a quadratic bezier curve that bends upward
        const controlX = (fromX + toX) / 2;
        const controlY = Math.min(fromY, toY) - 30; // Bend upward by 30px
        
        // Use quadratic bezier: M start, Q control, end
        path.setAttribute('d', `M ${fromX} ${fromY} Q ${controlX} ${controlY} ${toX} ${toY}`);
        path.setAttribute('fill', 'none');
        
        // White arc for all transfers
        path.setAttribute('stroke', '#ffffff');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('opacity', '0.8');
        
        // Dotted line for continuous transfers, solid for one-time
        if (transfer.type === 'continuous') {
            path.setAttribute('stroke-dasharray', '5,5');
        }
        
        svg.appendChild(path);
        
        // Add probe dots traveling along the arc
        if (transfer.type === 'one-time') {
            this.animateTransferProbe(transfer, fromX, fromY, toX, toY, path, svg);
        } else {
            // For continuous transfers, show multiple dots traveling along dotted line
            this.animateContinuousTransfer(transfer, fromX, fromY, toX, toY, path, svg);
        }
    }
    
    animateTransferProbe(transfer, fromX, fromY, toX, toY, path, svg) {
        // For one-time transfers, show a single probe icon traveling along the path
        const pathLength = path.getTotalLength();
        const transferTime = transfer.transferTime || 90.0; // days (default: 3 months = 90 days)
        const gameTime = (this.gameState && this.gameState.time) ? this.gameState.time : 0;
        // Use departureTime (in days), not startTime (which might be in milliseconds)
        const departureTime = transfer.departureTime || transfer.departure_time || gameTime;
        
        // Calculate overall progress of the transfer
        // Both gameTime and departureTime are in days
        const elapsed = gameTime - departureTime;
        const progress = Math.max(0, Math.min(1, elapsed / transferTime));
        
        // Create probe icon (small circle with a slight glow)
        const probeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        probeIcon.setAttribute('r', '5');
        probeIcon.setAttribute('fill', '#ffffff');
        probeIcon.setAttribute('opacity', '0.9');
        probeIcon.setAttribute('data-transfer-id', transfer.id || 'one-time');
        
        // Add a subtle glow effect
        // Sanitize transfer ID for use in CSS selector (replace dots and invalid chars)
        const sanitizedId = String(transfer.id || 'one-time').replace(/[^a-zA-Z0-9_-]/g, '_');
        const filterId = `glow-${sanitizedId}`;
        
        const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.setAttribute('id', filterId);
        const feGaussianBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
        feGaussianBlur.setAttribute('stdDeviation', '2');
        feGaussianBlur.setAttribute('result', 'coloredBlur');
        const feMerge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
        const feMergeNode1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
        feMergeNode1.setAttribute('in', 'coloredBlur');
        const feMergeNode2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
        feMergeNode2.setAttribute('in', 'SourceGraphic');
        feMerge.appendChild(feMergeNode1);
        feMerge.appendChild(feMergeNode2);
        filter.appendChild(feGaussianBlur);
        filter.appendChild(feMerge);
        
        // Check if filter already exists
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.appendChild(defs);
        }
        if (!defs.querySelector(`#${filterId}`)) {
            defs.appendChild(filter);
        }
        
        probeIcon.setAttribute('filter', `url(#${filterId})`);
        svg.appendChild(probeIcon);
        
        // Store references for animation updates
        probeIcon.setAttribute('data-departure-time', departureTime.toString());
        probeIcon.setAttribute('data-arrival-time', (departureTime + transferTime).toString());
        probeIcon.setAttribute('data-transfer-time', transferTime.toString());
        
        // Set initial position
        const initialPoint = path.getPointAtLength(pathLength * progress);
        probeIcon.setAttribute('cx', initialPoint.x);
        probeIcon.setAttribute('cy', initialPoint.y);
        
        // Animation will be handled by updateTransferArcAnimations() interval
    }
    
    animateContinuousTransfer(transfer, fromX, fromY, toX, toY, path, svg) {
        const pathLength = path.getTotalLength();
        const transferTime = transfer.transferTime || 90.0; // days (default: 3 months = 90 days)
        const gameTime = (this.gameState && this.gameState.time) ? this.gameState.time : 0;
        
        // Probe icon size
        const probeRadius = 4;
        const probeWidth = probeRadius * 2;
        
        // Transfer time is in days, convert to seconds for animation
        const SECONDS_PER_DAY = 86400;
        const transferTimeSeconds = transferTime * SECONDS_PER_DAY;
        
        // Constant speed: probes move at pathLength / transferTime pixels per second
        const constantSpeed = pathLength / transferTimeSeconds; // pixels per second
        
        // Get transfer rate (probes per day, convert to per second for visualization)
        const transferRatePerDay = transfer.rate || 0; // probes per day
        const transferRate = transferRatePerDay / SECONDS_PER_DAY; // probes per second (for visualization)
        
        // Calculate spacing along path based on transfer rate
        // Make dots much less dense - use larger minimum spacing
        // Minimum spacing: at least 3 probe widths (12px) for better performance
        // Maximum spacing: proportional to transfer rate, but cap at reasonable density
        let pathSpacing = probeWidth * 3; // Default minimum spacing (3x probe width = 24px)
        if (transferRate > 0 && transferTimeSeconds > 0) {
            // Calculate ideal spacing: pathLength / (transferRate * transferTimeSeconds)
            // But ensure it's at least 3 probe widths, and cap maximum density
            const idealSpacing = pathLength / (transferRate * transferTimeSeconds);
            // Use larger spacing - at least 3 probe widths, and don't go below 20px spacing
            pathSpacing = Math.max(probeWidth * 3, Math.max(20, idealSpacing));
        }
        
        // Limit maximum number of dots to show (for performance)
        const maxDotsToShow = 10;
        
        // Get probes currently in transit (use in_transit from game state)
        const inTransit = transfer.inTransit || transfer.in_transit || [];
        if (inTransit.length === 0) {
            return; // No probes in transit yet
        }
        
        // Process all probes in transit
        // All times are in days (game time units)
        const transitProbes = inTransit
            .map(transit => {
                const arrivalTime = transit.arrival_time !== undefined ? transit.arrival_time : 
                                   (transit.arrivalTime !== undefined ? transit.arrivalTime : 
                                    (gameTime + transferTime));
                const departureTime = transit.departure_time !== undefined ? transit.departure_time : 
                                     (transit.departureTime !== undefined ? transit.departureTime : 
                                      (arrivalTime - transferTime));
                return {
                    arrivalTime: arrivalTime,
                    departureTime: departureTime,
                    count: transit.count || 1
                };
            })
            .filter(transit => transit.arrivalTime > gameTime) // Only show probes that haven't arrived yet
            .sort((a, b) => a.departureTime - b.departureTime); // Sort by departure time
        
        if (transitProbes.length === 0) {
            return; // All probes have arrived
        }
        
        // Filter probes to show based on spacing along the path
        // We want to show probes that are spaced at least pathSpacing apart
        // Limit total number of dots for performance
        const probesToShow = [];
        
        for (const transit of transitProbes) {
            // Stop if we've reached the maximum number of dots
            if (probesToShow.length >= maxDotsToShow) {
                break;
            }
            
            const elapsed = gameTime - transit.departureTime;
            const currentProgress = Math.max(0, Math.min(1, elapsed / transferTime));
            const currentPathPosition = pathLength * currentProgress;
            
            // Check if this probe is far enough from the last shown probe
            if (probesToShow.length === 0) {
                // Always show the first probe
                probesToShow.push({
                    ...transit,
                    progress: currentProgress,
                    pathPosition: currentPathPosition
                });
            } else {
                const lastProbe = probesToShow[probesToShow.length - 1];
                const distanceFromLast = Math.abs(currentPathPosition - lastProbe.pathPosition);
                
                // Only add if spacing is sufficient
                if (distanceFromLast >= pathSpacing) {
                    probesToShow.push({
                        ...transit,
                        progress: currentProgress,
                        pathPosition: currentPathPosition
                    });
                }
            }
        }
        
        // Create and animate probe icons
        probesToShow.forEach((transit, index) => {
            // Create probe icon
            const probeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            probeIcon.setAttribute('r', probeRadius.toString());
            probeIcon.setAttribute('fill', '#ffffff');
            probeIcon.setAttribute('opacity', '0.85');
            probeIcon.setAttribute('data-transit-id', `${transfer.id || 'continuous'}-${transit.departureTime}`);
            
            // Add subtle glow for first probe
            if (index === 0) {
                const sanitizedId = String(transfer.id || 'continuous').replace(/[^a-zA-Z0-9_-]/g, '_');
                const filterId = `glow-continuous-${sanitizedId}`;
                
                const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
                filter.setAttribute('id', filterId);
                const feGaussianBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
                feGaussianBlur.setAttribute('stdDeviation', '1.5');
                feGaussianBlur.setAttribute('result', 'coloredBlur');
                const feMerge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
                const feMergeNode1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
                feMergeNode1.setAttribute('in', 'coloredBlur');
                const feMergeNode2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
                feMergeNode2.setAttribute('in', 'SourceGraphic');
                feMerge.appendChild(feMergeNode1);
                feMerge.appendChild(feMergeNode2);
                filter.appendChild(feGaussianBlur);
                filter.appendChild(feMerge);
                
                let defs = svg.querySelector('defs');
                if (!defs) {
                    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                    svg.appendChild(defs);
                }
                if (!defs.querySelector(`#${filterId}`)) {
                    defs.appendChild(filter);
                }
                probeIcon.setAttribute('filter', `url(#${filterId})`);
            }
            
            svg.appendChild(probeIcon);
            
            // Store references for animation updates
            probeIcon.setAttribute('data-departure-time', transit.departureTime.toString());
            probeIcon.setAttribute('data-arrival-time', transit.arrivalTime.toString());
            probeIcon.setAttribute('data-transfer-time', transferTime.toString());
            
            // Set initial position
            const initialPoint = path.getPointAtLength(transit.pathPosition);
            probeIcon.setAttribute('cx', initialPoint.x.toString());
            probeIcon.setAttribute('cy', initialPoint.y.toString());
            
            // Animation will be handled by updateTransferArcAnimations() interval
        });
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
}
