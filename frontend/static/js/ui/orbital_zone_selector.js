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
        this.probeDots = {}; // Track probe dots per zone: {zoneId: [dots]}
        this.transferArcs = []; // Active transfer arcs: [{from, to, type, count, rate, ...}]
        this.init();
        this.loadData();
        this.setupKeyboardShortcuts();
    }

    async loadData() {
        try {
            const zonesResponse = await fetch('/game_data/orbital_mechanics.json');
            const zonesData = await zonesResponse.json();
            this.orbitalZones = zonesData.orbital_zones;
            this.render();
            // Notify command panel that zones are loaded
            if (window.commandPanel && window.commandPanel.selectedZone) {
                window.commandPanel.setSelectedZone(window.commandPanel.selectedZone);
            }
        } catch (error) {
            console.error('Failed to load orbital zones:', error);
        }
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
            
            // Handle spacebar for transfer source selection
            // Only handle if a zone is selected (otherwise let pause/resume handle it)
            if ((e.key === ' ' || e.key === 'Spacebar') && this.selectedZone) {
                e.preventDefault();
                e.stopPropagation();
                // Mark selected zone as transfer source
                this.transferSourceZone = this.selectedZone;
                this.waitingForTransferDestination = true;
                this.render(); // Re-render to show transfer source highlight
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
        this.orbitalZones.forEach((zone, tileIndex) => {
            const remainingMetal = (this.gameState && this.gameState.zone_metal_remaining) ? 
                (this.gameState.zone_metal_remaining[zone.id] || 0) : 0;
            
            // Calculate probe count and mass in this zone
            let probeCount = 0;
            let probeMass = 0;
            const PROBE_MASS = 10; // kg per probe
            const probesByZone = (this.gameState && this.gameState.probes_by_zone) ? 
                this.gameState.probes_by_zone[zone.id] || {} : {};
            for (const [probeType, count] of Object.entries(probesByZone)) {
                probeCount += count;
                probeMass += (count || 0) * PROBE_MASS;
            }
            
            // Calculate structures count in this zone
            let structuresCount = 0;
            const structuresByZone = (this.gameState && this.gameState.structures_by_zone) ? 
                this.gameState.structures_by_zone[zone.id] || {} : {};
            for (const count of Object.values(structuresByZone)) {
                structuresCount += (count || 0);
            }
            
            // Remove "Orbit" from zone name
            const zoneName = zone.name.replace(/\s+Orbit\s*$/i, '');
            
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
            
            // Apply dynamic spacing: first tile has no left margin, others have gap
            const tileMarginLeft = tileIndex === 0 ? 0 : tileGap;
            html += `<div class="orbital-zone-tile ${tileClass}" data-zone="${zone.id}" style="margin-left: ${tileMarginLeft}px; width: ${tileWidth}px;">`;
            html += `<div class="orbital-zone-tile-label">${zoneName}</div>`;
            html += `<div class="orbital-zone-tile-stats">`;
            html += `<div class="orbital-zone-stat">Probe mass: ${this.formatMass(probeMass)}</div>`;
            html += `<div class="orbital-zone-stat">Metal mass: ${this.formatMass(remainingMetal)}</div>`;
            html += `<div class="orbital-zone-stat">Structures: ${this.formatNumber(structuresCount)}</div>`;
            html += `</div>`;
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
                        this.updateProbeDots();
                        this.updateTransferArcs();
                    }
                }
            };
            window.addEventListener('resize', this.resizeHandler);
        }
        
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
        const probesByZone = this.gameState.probes_by_zone || {};
        const zoneProbes = probesByZone[zoneId] || {};
        const PROBE_ENERGY_CONSUMPTION = 100000; // 100kW per probe
        let probeCount = 0;
        for (const count of Object.values(zoneProbes)) {
            probeCount += (count || 0);
        }
        consumption += probeCount * PROBE_ENERGY_CONSUMPTION;
        
        // Energy consumption from activities in this zone
        const probeAllocationsByZone = this.gameState.probe_allocations_by_zone || {};
        const zoneAllocations = probeAllocationsByZone[zoneId] || {};
        
        // Harvesting energy cost
        const harvestAllocation = zoneAllocations.harvest || {};
        const harvestProbes = Object.values(harvestAllocation).reduce((a, b) => a + b, 0);
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
        const replicateAllocation = zoneAllocations.replicate || {};
        const replicateProbes = Object.values(replicateAllocation).reduce((a, b) => a + b, 0);
        if (replicateProbes > 0) {
            const PROBE_BUILD_RATE = Config.PROBE_BUILD_RATE; // kg/day per probe
            const PROBE_MASS = 100; // kg per probe
            const probeConstructionRateKgS = replicateProbes * PROBE_BUILD_RATE;
            const probeConstructionEnergyCost = probeConstructionRateKgS * 250000; // 250kW per kg/s
            consumption += probeConstructionEnergyCost;
        }
        
        // Structure construction energy cost (from construct allocation)
        const constructAllocation = zoneAllocations.construct || {};
        const constructProbes = Object.values(constructAllocation).reduce((a, b) => a + b, 0);
        if (constructProbes > 0) {
            const buildAllocation = this.gameState.build_allocation || 100; // 0 = all structures, 100 = all probes
            const structureFraction = (100 - buildAllocation) / 100.0;
            const structureBuildingProbes = constructProbes * structureFraction;
            if (structureBuildingProbes > 0) {
                const PROBE_BUILD_RATE = Config.PROBE_BUILD_RATE; // kg/day per probe
                const structureConstructionRateKgS = structureBuildingProbes * PROBE_BUILD_RATE;
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
        const panel = document.getElementById('zone-info-panel');
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
        let droneProductionRate = 0; // probes/day from structures in dyson zone
        let metalRemaining = 0;
        let massRemaining = 0;
        let slagProduced = 0;
        let buildingCounts = {};
        let zoneEnergy = { production: 0, consumption: 0 };
        
        if (this.gameState) {
            // Get probes in this zone
            const probesByZone = this.gameState.probes_by_zone || {};
            const zoneProbes = probesByZone[zoneId] || {};
            for (const [probeType, count] of Object.entries(zoneProbes)) {
                numProbes += (count || 0);
                totalProbeMass += (count || 0) * Config.PROBE_MASS; // Config.PROBE_MASS = 100 kg
            }
            
            // Get probe allocations for this zone
            const probeAllocationsByZone = this.gameState.probe_allocations_by_zone || {};
            const zoneAllocations = probeAllocationsByZone[zoneId] || {};
            
            if (isDysonZone) {
                // Dyson zone: calculate construction rate
                const constructAllocation = zoneAllocations.construct || {};
                const dysonProbes = Object.values(constructAllocation).reduce((a, b) => a + b, 0);
                if (dysonProbes > 0) {
                    const PROBE_BUILD_RATE = Config.PROBE_BUILD_RATE; // kg/day per probe
                    dysonBuildRate = dysonProbes * PROBE_BUILD_RATE;
                }
                
                // Calculate drone production from structures (factories) in dyson zone
                const structuresByZone = this.gameState.structures_by_zone || {};
                const zoneStructures = structuresByZone[zoneId] || {};
                const factoryProductionByZone = this.gameState.factory_production_by_zone || {};
                const zoneFactoryProduction = factoryProductionByZone[zoneId] || {};
                
                if (zoneFactoryProduction.rate) {
                    droneProductionRate = zoneFactoryProduction.rate; // probes/s
                }
            } else {
                // Regular zone: calculate mining rate
                const harvestAllocation = zoneAllocations.harvest || {};
                const baseHarvestRate = Config.PROBE_HARVEST_RATE; // kg/day per probe (100 kg/day base)
                const SECONDS_PER_DAY = Config.SECONDS_PER_DAY || 86400;
                for (const [probeType, count] of Object.entries(harvestAllocation)) {
                    if (count > 0) {
                        const probeHarvestRatePerDay = baseHarvestRate * miningRateMultiplier * count;
                        // Convert from kg/day to kg/s for display (formatRate expects per-second)
                        const probeHarvestRatePerSecond = probeHarvestRatePerDay / SECONDS_PER_DAY;
                        miningRate += probeHarvestRatePerSecond;
                    }
                }
                
                // Split into metal and slag based on zone's metal percentage
                metalMiningRate = miningRate * metalPercentage;
                slagMiningRate = miningRate * (1.0 - metalPercentage);
            }
            
            // Get probe production rate for this zone (probes per second)
            // Calculate from replicate allocation in this zone
            const replicateAllocation = zoneAllocations.replicate || {};
            let zoneProbeProductionRate = 0;
            for (const [probeType, count] of Object.entries(replicateAllocation)) {
                if (count > 0) {
                    // Base probe production: 100.0 kg/day per probe (Config.PROBE_BUILD_RATE)
                    // Probe mass: 10 kg (Config.PROBE_MASS)
                    // Production rate: (100.0 kg/day) / (10 kg/probe) = 10 probes/day per probe
                    const probesPerDayPerProbe = Config.PROBE_BUILD_RATE / Config.PROBE_MASS;
                    zoneProbeProductionRate += count * probesPerDayPerProbe;
                }
            }
            probesPerDay = zoneProbeProductionRate;
            
            // Get remaining resources
            metalRemaining = (this.gameState.zone_metal_remaining && this.gameState.zone_metal_remaining[zoneId]) || 0;
            massRemaining = (this.gameState.zone_mass_remaining && this.gameState.zone_mass_remaining[zoneId]) || 0;
            slagProduced = (this.gameState.zone_slag_produced && this.gameState.zone_slag_produced[zoneId]) || 0;
            
            // Get building counts for this zone
            const structuresByZone = this.gameState.structures_by_zone || {};
            buildingCounts = structuresByZone[zoneId] || {};
            
            // Calculate zone energy
            zoneEnergy = this.calculateZoneEnergy(zoneId);
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
        
        // Build tooltip content based on zone type
        let tooltipContent = '';
        
        if (isDysonZone) {
            // Dyson zone tooltip
            tooltipContent = `
                <div class="probe-summary-title">${zone.name}</div>
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Probes</div>
                    <div class="probe-summary-value">${this.formatNumber(Math.floor(numProbes))}</div>
                </div>
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Dyson Construction Rate</div>
                    <div class="probe-summary-value">${formatRate(dysonBuildRate, 'kg')}</div>
                </div>
                ${droneProductionRate > 0 ? `
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Drone Production</div>
                    <div class="probe-summary-value">${formatRate(droneProductionRate, 'probes')}</div>
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
            tooltipContent = `
                <div class="probe-summary-title">${zone.name}</div>
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
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Mining Rate</div>
                    <div class="probe-summary-value">${formatRate(metalMiningRate, 'kg')} metal</div>
                </div>
                ${slagMiningRate > 0 ? `
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Slag Production</div>
                    <div class="probe-summary-value">${formatRate(slagMiningRate, 'kg')}</div>
                </div>
                ` : ''}
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Metal Remaining</div>
                    <div class="probe-summary-value">${formatMassWithSigFigs(metalRemaining)}</div>
                </div>
                ${massRemaining > 0 ? `
                <div class="probe-summary-item">
                    <div class="probe-summary-label">Mass Remaining</div>
                    <div class="probe-summary-value">${formatMassWithSigFigs(massRemaining)}</div>
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
        }
        
        panel.style.bottom = 'auto';
        panel.className = 'zone-info-panel probe-summary-panel';
        panel.innerHTML = tooltipContent;
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
        
        // Zones only deselect when clicking the same zone tile again (toggle behavior)
        // Clicking anywhere else keeps the zone selected
    }

    async selectZone(zoneId) {
        // If waiting for transfer destination and a different zone is selected
        if (this.waitingForTransferDestination && this.transferSourceZone && this.transferSourceZone !== zoneId) {
            // This is the destination zone - show transfer dialog
            this.selectedZone = zoneId;
            this.showTransferDialog(this.transferSourceZone, zoneId);
            this.waitingForTransferDestination = false;
            this.render(); // Re-render to show destination highlight
            return;
        }
        
        // If a transfer dialog is open, close it first
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
        
        // Notify panels of selection change
        if (window.purchasePanel) {
            window.purchasePanel.setSelectedZone(zoneId);
        }
        if (window.commandPanel) {
            window.commandPanel.setSelectedZone(zoneId);
        }
        
        // Update backend with selected harvest zone
        try {
            await gameEngine.performAction('set_harvest_zone', { zone_id: zoneId });
        } catch (error) {
            console.error('Failed to set harvest zone:', error);
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
        
        // Notify panels of deselection
        if (window.purchasePanel) {
            window.purchasePanel.setSelectedZone(null);
        }
        if (window.commandPanel) {
            window.commandPanel.setSelectedZone(null);
        }
    }
    
    showTransferDialog(fromZoneId, toZoneId) {
        // Get zone data
        const fromZone = this.orbitalZones.find(z => z.id === fromZoneId);
        const toZone = this.orbitalZones.find(z => z.id === toZoneId);
        if (!fromZone || !toZone) return;
        
        // Calculate delta-v difference (for display purposes)
        const deltaV = this.calculateTransferDeltaV(fromZone, toZone);
        
        // Transfers don't consume energy - probes use their own propulsion drives
        
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
                        <span class="transfer-label">Specific Impulse (Isp):</span>
                        <span class="transfer-value" id="transfer-isp">—</span>
                    </div>
                    <div class="transfer-info-item">
                        <span class="transfer-label">Total Thrust:</span>
                        <span class="transfer-value" id="transfer-thrust">—</span>
                    </div>
                    <div class="transfer-info-item">
                        <span class="transfer-label">Transfer Time:</span>
                        <span class="transfer-value" id="transfer-time">—</span>
                    </div>
                        <div class="transfer-info-item">
                            <span class="transfer-label">Available Probes:</span>
                            <span class="transfer-value">${this.formatNumber(availableProbes)}</span>
                        </div>
                    </div>
                    <div class="transfer-options">
                        <div class="transfer-option">
                            <label>
                                <input type="radio" name="transfer-type" value="continuous" checked>
                                Continuous Transfer
                            </label>
                            <input type="number" id="transfer-rate" min="0.01" max="100" step="0.1" value="10" 
                                   placeholder="% of probe production">
                        </div>
                        <div class="transfer-option">
                            <label>
                                <input type="radio" name="transfer-type" value="one-time">
                                One-Time Transfer
                            </label>
                            <div class="transfer-slider-container">
                                <input type="range" id="transfer-count-slider" min="0" max="100" value="0" step="1">
                                <div class="transfer-slider-labels">
                                    <span>1</span>
                                    <span id="transfer-count-display">10</span>
                                    <span>${availableProbes}</span>
                                </div>
                                <input type="hidden" id="transfer-count" value="10">
                            </div>
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
        
        // Calculate transfer time
        const transferTime = this.calculateTransferTime(fromZone, toZone);
        
        // Calculate probe propulsion stats
        const probeStats = this.calculateProbePropulsionStats();
        
        // Display specific impulse
        const ispEl = dialog.querySelector('#transfer-isp');
        if (ispEl) {
            ispEl.textContent = `${probeStats.specificImpulse.toFixed(0)} s`;
        }
        
        // Display total thrust
        const thrustEl = dialog.querySelector('#transfer-thrust');
        if (thrustEl) {
            const thrustN = probeStats.totalThrust;
            let thrustDisplay = '';
            if (thrustN >= 1e6) {
                thrustDisplay = `${(thrustN / 1e6).toFixed(2)} MN`;
            } else if (thrustN >= 1e3) {
                thrustDisplay = `${(thrustN / 1e3).toFixed(2)} kN`;
            } else {
                thrustDisplay = `${thrustN.toFixed(2)} N`;
            }
            thrustEl.textContent = thrustDisplay;
        }
        
        // Display transfer time with appropriate formatting
        const timeEl = dialog.querySelector('#transfer-time');
        if (timeEl) {
            timeEl.textContent = this.formatTransferTime(transferTime);
        }
        
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
        
        // Initialize slider value for default count of 10
        const defaultCount = Math.min(10, availableProbes);
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
        
        dialog.querySelector('.transfer-confirm').addEventListener('click', () => {
            const transferType = dialog.querySelector('input[name="transfer-type"]:checked').value;
            if (transferType === 'one-time') {
                const count = parseInt(dialog.querySelector('#transfer-count').value) || 1;
                this.createTransfer(fromZoneId, toZoneId, 'one-time', count, 0);
            } else {
                const rate = parseFloat(dialog.querySelector('#transfer-rate').value) || 1;
                this.createTransfer(fromZoneId, toZoneId, 'continuous', 0, rate);
            }
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
        this.updateProbeDots();
        this.updateTransferArcs();
    }
    
    updateProbeDots() {
        if (!this.gameState || !this.orbitalZones) return;
        
        // First, calculate total probes across all zones
        let totalProbes = 0;
        const probesByZone = this.gameState.probes_by_zone || {};
        const zoneProbeCounts = {};
        
        this.orbitalZones.forEach(zone => {
            const zoneProbes = probesByZone[zone.id] || {};
            let zoneProbeCount = 0;
            for (const count of Object.values(zoneProbes)) {
                zoneProbeCount += count || 0;
            }
            zoneProbeCounts[zone.id] = zoneProbeCount;
            totalProbes += zoneProbeCount;
        });
        
        // Maximum dots to show across all zones
        const MAX_TOTAL_DOTS = 200;
        
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
            
            // Clear existing dots
            container.innerHTML = '';
            
            // If no probes in zone, don't draw any
            if (probeCount === 0) return;
            
            // Calculate number of probe dots to draw for this zone
            let totalDots = 0;
            
            if (totalProbes < 100) {
                // Low population: draw exact count for each zone (accurate representation)
                totalDots = Math.floor(probeCount);
            } else {
                // High population: proportional representation
                // Always draw at least 1 probe if zone has probes
                totalDots = 1;
                
                // Draw up to 9 more probes if zone has 2-10 probes
                // This ensures zones with 1-10 probes get 1-10 dots accurately
                if (probeCount >= 2 && probeCount <= 10) {
                    const additionalDots = Math.min(9, Math.floor(probeCount) - 1);
                    totalDots += additionalDots;
                } else if (probeCount > 10) {
                    // For zones with more than 10 probes, draw the base 10 dots
                    totalDots = 10;
                    
                    // Then for every 1% of total probes, draw 1 more probe
                    // This provides proportional representation for larger populations
                    const zonePercentage = (probeCount / totalProbes) * 100;
                    const percentageBasedDots = Math.floor(zonePercentage);
                    totalDots += percentageBasedDots;
                }
                
                // Cap at 100-200 probes per planet (use 200 as max)
                totalDots = Math.min(totalDots, 200);
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
                    
                    container.appendChild(dot);
                }
                
                dotsRemaining -= dotsInThisCircle;
                circleIndex++;
            }
        });
    }
    
    updateTransferArcs() {
        // Get active transfers from game state
        if (this.gameState && this.gameState.active_transfers) {
            const currentTime = this.gameState.time || 0;
            // Filter out completed one-time transfers
            this.transferArcs = this.gameState.active_transfers.filter(transfer => {
                // Keep continuous transfers and incomplete one-time transfers
                if (transfer.type === 'continuous') {
                    return true;
                }
                // For one-time transfers, check if they've arrived
                if (transfer.type === 'one-time') {
                    // If arrivalTime is set and hasn't been reached yet, transfer is still active
                    if (transfer.arrivalTime !== undefined) {
                        return transfer.arrivalTime > currentTime;
                    }
                    // Fallback: check progress (for backward compatibility)
                    const progress = transfer.progress || 0;
                    const totalCount = transfer.totalCount || transfer.count || 0;
                    return progress < totalCount;
                }
                return true;
            });
        }
        
        // Clear existing transfer arcs
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
        const startTime = transfer.startTime || transfer.departureTime || gameTime;
        
        // Calculate overall progress of the transfer
        const elapsed = gameTime - startTime;
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
        
        // Animate along path - update only once per second for performance
        let lastUpdateTime = Date.now();
        const updateInterval = 1000; // Update every second (1000ms)
        
        const animate = () => {
            const now = Date.now();
            const timeSinceLastUpdate = now - lastUpdateTime;
            
            // Only update if at least 1 second has passed
            if (timeSinceLastUpdate >= updateInterval) {
                lastUpdateTime = now;
                
                const currentGameTime = (this.gameState && this.gameState.time) ? this.gameState.time : gameTime;
                const currentElapsed = currentGameTime - startTime;
                const currentProgress = Math.max(0, Math.min(1, currentElapsed / transferTime));
                
                if (currentProgress < 1 && this.transferArcs && this.transferArcs.includes(transfer)) {
                    const point = path.getPointAtLength(pathLength * currentProgress);
                    probeIcon.setAttribute('cx', point.x);
                    probeIcon.setAttribute('cy', point.y);
                    setTimeout(animate, updateInterval);
                } else {
                    // Transfer complete or transfer removed
                    probeIcon.remove();
                    return;
                }
            } else {
                // Wait until it's time to update
                setTimeout(animate, updateInterval - timeSinceLastUpdate);
            }
        };
        
        // Set initial position
        const initialPoint = path.getPointAtLength(pathLength * progress);
        probeIcon.setAttribute('cx', initialPoint.x);
        probeIcon.setAttribute('cy', initialPoint.y);
        
        animate();
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
        
        // Get probes currently in transit
        if (!transfer.inTransit || transfer.inTransit.length === 0) {
            return; // No probes in transit yet
        }
        
        // Process all probes in transit
        const transitProbes = transfer.inTransit
            .map(transit => ({
                arrivalTime: transit.arrivalTime || (gameTime + transferTime),
                departureTime: transit.departureTime !== undefined ? transit.departureTime : (transit.arrivalTime - transferTime),
                count: transit.count || 1
            }))
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
            
            // Animation loop: move probe at constant speed - update only once per second
            let lastUpdateTime = Date.now();
            const updateInterval = 1000; // Update every second (1000ms)
            
            const animate = () => {
                const now = Date.now();
                const timeSinceLastUpdate = now - lastUpdateTime;
                
                // Only update if at least 1 second has passed
                if (timeSinceLastUpdate >= updateInterval) {
                    lastUpdateTime = now;
                    
                    const currentGameTime = (this.gameState && this.gameState.time) ? this.gameState.time : gameTime;
                    
                    // Calculate elapsed time since departure
                    const elapsed = currentGameTime - transit.departureTime;
                    
                    // Calculate progress (0 to 1) - this gives constant speed automatically
                    // Speed = pathLength / transferTime, so position = speed * elapsed = pathLength * (elapsed / transferTime)
                    const progress = Math.max(0, Math.min(1, elapsed / transferTime));
                    
                    // Calculate position along path (constant speed movement)
                    const pathPosition = pathLength * progress;
                    const currentPoint = path.getPointAtLength(pathPosition);
                    
                    // Check if transfer is still active
                    const isTransferActive = this.gameState && 
                        this.gameState.active_transfers && 
                        this.gameState.active_transfers.some(t => 
                            t.id === transfer.id || 
                            (t.from === transfer.from && t.to === transfer.to && t.type === transfer.type)
                        );
                    
                    // Check if this specific probe is still in transit
                    const probeStillInTransit = isTransferActive && 
                        transfer.inTransit && 
                        transfer.inTransit.some(t => 
                            Math.abs(t.departureTime - transit.departureTime) < 0.01 && 
                            t.arrivalTime > currentGameTime
                        );
                    
                    if (progress < 1 && probeStillInTransit) {
                        probeIcon.setAttribute('cx', currentPoint.x.toString());
                        probeIcon.setAttribute('cy', currentPoint.y.toString());
                        setTimeout(animate, updateInterval);
                    } else {
                        // Probe arrived or transfer removed
                        probeIcon.remove();
                        return;
                    }
                } else {
                    // Wait until it's time to update
                    setTimeout(animate, updateInterval - timeSinceLastUpdate);
                }
            };
            
            // Set initial position
            const initialPoint = path.getPointAtLength(transit.pathPosition);
            probeIcon.setAttribute('cx', initialPoint.x.toString());
            probeIcon.setAttribute('cy', initialPoint.y.toString());
            
            // Start animation
            animate();
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
