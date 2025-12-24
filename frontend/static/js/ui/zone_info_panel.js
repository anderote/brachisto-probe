/** Zone Info Panel - Right side overlay showing selected zone information */
class ZoneInfoPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.gameState = null;
        this.selectedZone = null;
        this.buildings = null;
        
        if (!this.container) {
            console.error('ZoneInfoPanel: Container not found:', containerId);
        } else {
            console.log('ZoneInfoPanel: Container found, initializing');
            this.init();
            this.loadBuildingsData();
        }
    }

    async loadBuildingsData() {
        try {
            const response = await fetch('/game_data/buildings.json');
            const data = await response.json();
            // New format: buildings.buildings object
            if (data.buildings && typeof data.buildings === 'object' && !Array.isArray(data.buildings)) {
                this.buildings = data.buildings;
            } else {
                // Legacy format: use as is
                this.buildings = data.buildings || data;
            }
        } catch (error) {
            console.error('Failed to load buildings data:', error);
            this.buildings = {};
        }
    }

    init() {
        if (this.container) {
            this.render();
        } else {
            console.warn('ZoneInfoPanel: Cannot init, container not found');
        }
    }

    formatNumber(value) {
        if (value === null || value === undefined || isNaN(value)) return '0';
        if (value === 0) return '0';
        // Use scientific notation for numbers >= 10
        if (value >= 10) {
            return value.toExponential(2);
        }
        // Use float notation for numbers < 1
        if (value < 1 && value > 0) {
            return value.toFixed(4);
        }
        // Regular notation for 1 <= value < 10
        return value.toFixed(2);
    }

    formatNumberWithCommas(value) {
        if (value === null || value === undefined || isNaN(value)) return '0';
        if (value >= 1e6) {
            return value.toExponential(2);
        }
        return Math.floor(value).toLocaleString('en-US');
    }

    formatMassWithSigFigs(mass) {
        if (mass === 0) return '0';
        // Use toPrecision for 6 significant figures
        const formatted = parseFloat(mass.toPrecision(6));
        // Format with appropriate units while preserving 6 sig figs
        if (formatted < 1000) {
            return formatted.toString();
        }
        if (formatted < 1e6) {
            const kValue = formatted / 1000;
            return parseFloat(kValue.toPrecision(6)).toString() + 'k';
        }
        if (formatted < 1e9) {
            const mValue = formatted / 1e6;
            return parseFloat(mValue.toPrecision(6)).toString() + 'M';
        }
        if (formatted < 1e12) {
            const gValue = formatted / 1e9;
            return parseFloat(gValue.toPrecision(6)).toString() + 'G';
        }
        return formatted.toExponential(2);
    }

    formatEnergy(value) {
        if (value === 0) return '0 W';
        return `${value.toExponential(2)} W`;
    }

    formatFlops(value) {
        if (value === 0) return '0 FLOPS';
        // Use SI prefixes for FLOPS
        if (value >= 1e18) {
            return `${(value / 1e18).toFixed(2)} EFLOPS`;
        }
        if (value >= 1e15) {
            return `${(value / 1e15).toFixed(2)} PFLOPS`;
        }
        if (value >= 1e12) {
            return `${(value / 1e12).toFixed(2)} TFLOPS`;
        }
        if (value >= 1e9) {
            return `${(value / 1e9).toFixed(2)} GFLOPS`;
        }
        if (value >= 1e6) {
            return `${(value / 1e6).toFixed(2)} MFLOPS`;
        }
        if (value >= 1e3) {
            return `${(value / 1e3).toFixed(2)} KFLOPS`;
        }
        return `${value.toFixed(2)} FLOPS`;
    }

    getBuildingCost(building) {
        // New format: calculate from mass_multiplier
        if (building.mass_multiplier !== undefined) {
            const baseProbeMass = Config.PROBE_MASS || 100; // kg
            return baseProbeMass * building.mass_multiplier;
        }
        // Legacy format: use base_cost_metal
        return building.base_cost_metal || 0;
    }
    
    calculateStructureMass(zoneId) {
        if (!this.gameState || !this.buildings) return 0;
        
        const structuresByZone = this.gameState.structures_by_zone || {};
        const zoneStructures = structuresByZone[zoneId] || {};
        let totalMass = 0;
        
        // Search through buildings (new format: buildings.buildings object)
        for (const [buildingId, count] of Object.entries(zoneStructures)) {
            if (count <= 0) continue;
            
            let building = null;
            // New format: buildings.buildings object
            if (this.buildings[buildingId]) {
                building = this.buildings[buildingId];
            } else {
                // Legacy format: search through categories
                for (const category in this.buildings) {
                    if (Array.isArray(this.buildings[category])) {
                        building = this.buildings[category].find(b => b.id === buildingId);
                        if (building) break;
                    }
                }
            }
            
            if (building) {
                const costMetal = this.getBuildingCost(building);
                totalMass += costMetal * count;
            }
        }
        
        return totalMass;
    }

    render() {
        if (!this.container) {
            console.warn('ZoneInfoPanel: Cannot render, container not found');
            return;
        }

        try {
            let html = '<div class="zone-info-panel">';
            html += '<div class="probe-summary-title">Zone Info</div>';
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">No zone selected</div>';
            html += '<div class="probe-summary-value" style="font-size: 10px; color: rgba(255, 255, 255, 0.5);">Click a zone to view details</div>';
            html += '</div>';
            html += '</div>';
            
            this.container.innerHTML = html;
        } catch (error) {
            console.error('ZoneInfoPanel: Error rendering panel:', error);
        }
    }

    updateZoneInfo(zoneId, zoneData, zone) {
        if (!this.container || !zoneId) {
            this.render();
            return;
        }

        const isDysonZone = zone && zone.is_dyson_zone;
        const structuresByZone = this.gameState.structures_by_zone || {};
        const zoneStructures = structuresByZone[zoneId] || {};
        const zoneAllocations = (this.gameState.probe_allocations_by_zone || {})[zoneId] || {};
        
        // Calculate values
        const numProbes = (this.gameState.probes_by_zone?.[zoneId]?.probe) || 0;
        const storedMetal = zoneData.stored_metal || 0;
        const metalPercentage = zone.metal_percentage || 0;
        const radiusAU = zone.radius_au || 1.0;
        
        // Calculate structure mass
        const structureMass = this.calculateStructureMass(zoneId);
        
        // Calculate rates
        let dysonBuildRate = 0;
        let probeProductionRate = 0;
        let probesPerDay = 0;
        let miningRate = 0;
        let metalMiningRate = 0;
        let slagMiningRate = 0;
        
        // Get factory production (for all zones)
        const factoryProductionByZone = this.gameState.factory_production_by_zone || {};
        const zoneFactoryProduction = factoryProductionByZone[zoneId] || {};
        const factoryProductionRate = zoneFactoryProduction.rate || 0;
        
        if (isDysonZone) {
            // constructAllocation is a number (0-1 fraction) for Dyson construction
            const constructAllocation = typeof zoneAllocations.construct === 'number' ? zoneAllocations.construct : 0;
            const dysonProbes = numProbes * constructAllocation;
            if (dysonProbes > 0) {
                const PROBE_BUILD_RATE = Config.PROBE_BUILD_RATE;
                dysonBuildRate = dysonProbes * PROBE_BUILD_RATE;
            }
            
            probeProductionRate = factoryProductionRate;
        } else {
            metalMiningRate = zoneData.metal_mined_rate || 0;
            slagMiningRate = zoneData.slag_produced_rate || 0;
            miningRate = metalMiningRate + slagMiningRate;
        }
        
        // Calculate probe production rate (includes both replication and factory production)
        // replicateAllocation is a number (0-1 fraction), not an object
        const replicateAllocation = typeof zoneAllocations.replicate === 'number' ? zoneAllocations.replicate : 0;
        
        // Get upgrade factor for probe building (replication uses same upgrades as building)
        const upgradeFactor = this.gameState.upgrade_factors?.probe?.building?.performance || 
                             this.gameState.tech_upgrade_factors?.probe_build || 1.0;
        
        // Calculate replicating probes and production rate
        const replicatingProbes = numProbes * replicateAllocation;
        const baseProbesPerDayPerProbe = Config.PROBE_BUILD_RATE / Config.PROBE_MASS; // probes/day per probe
        const zoneProbeProductionRate = replicatingProbes * baseProbesPerDayPerProbe * upgradeFactor;
        
        // Add factory production to total probe production rate
        probesPerDay = zoneProbeProductionRate + factoryProductionRate;
        
        // For Dyson zones, update probeProductionRate to match total (for consistency)
        if (isDysonZone) {
            probeProductionRate = probesPerDay;
        }
        
        // Calculate build capacity (kg/day from probes allocated to construct)
        const constructAllocationFraction = zoneAllocations.construct || 0;
        const probesConstructing = numProbes * constructAllocationFraction;
        const buildCapacity = probesConstructing * (Config.PROBE_BUILD_RATE || 10);
        
        // Calculate metal consumption rate (probe replication + structure building)
        // Probe replication consumes metal at the same rate as probe production (in kg/day)
        const probeReplicationMetalConsumption = zoneProbeProductionRate * Config.PROBE_MASS;
        
        // Structure building consumes metal from build capacity (split between probes and structures based on build_allocation)
        const buildAllocation = this.gameState.build_allocation || 100; // 0 = all structures, 100 = all probes
        const structureBuildingFraction = (100 - buildAllocation) / 100.0;
        const structureBuildingMetalConsumption = buildCapacity * structureBuildingFraction;
        
        const metalConsumptionRate = probeReplicationMetalConsumption + structureBuildingMetalConsumption;
        
        // Get zone energy
        const zoneEnergy = {
            production: zoneData.energy_produced || 0,
            consumption: zoneData.energy_consumed || 0,
            net: zoneData.energy_net || 0
        };
        
        // Calculate solar flux
        const SOLAR_FLUX_EARTH = 1361;
        const solarFluxPerM2 = SOLAR_FLUX_EARTH / (radiusAU * radiusAU);
        
        let html = '<div class="zone-info-panel">';
        html += `<div class="probe-summary-title">${zone.name}</div>`;
        
        // Solar Flux
        html += '<div class="probe-summary-item">';
        html += '<div class="probe-summary-label">Solar Flux</div>';
        html += `<div class="probe-summary-value">${solarFluxPerM2.toFixed(1)} W/m²</div>`;
        html += '</div>';
        
        if (!isDysonZone) {
            // Metal Fraction
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Metal Fraction</div>';
            html += `<div class="probe-summary-value">${(metalPercentage * 100).toFixed(1)}%</div>`;
            html += '</div>';
            
            // Mass Remaining (un-mined mass in zone)
            const massRemaining = zoneData.mass_remaining || 0;
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Mass Remaining</div>';
            html += `<div class="probe-summary-value">${this.formatMassWithSigFigs(massRemaining)} kg</div>`;
            html += '</div>';
        }
        
        // Probes
        html += '<div class="probe-summary-item">';
        html += '<div class="probe-summary-label">Probes</div>';
        html += `<div class="probe-summary-value">${this.formatNumberWithCommas(Math.floor(numProbes))}</div>`;
        html += '</div>';
        
        // Structure Mass
        html += '<div class="probe-summary-item">';
        html += '<div class="probe-summary-label">Structure Mass</div>';
        html += `<div class="probe-summary-value">${this.formatMassWithSigFigs(structureMass)} kg</div>`;
        html += '</div>';
        
        // Build Capacity (kg/day from probes constructing)
        html += '<div class="probe-summary-item">';
        html += '<div class="probe-summary-label">Build Capacity</div>';
        html += `<div class="probe-summary-value">${FormatUtils.formatRate(buildCapacity, 'kg')}</div>`;
        html += '</div>';
        
        if (isDysonZone) {
            // Get Dyson sphere data
            const dysonData = zoneData.dyson || {};
            const dysonMass = dysonData.mass || 0;
            const dysonTargetMass = dysonData.target_mass || 5e24;
            const dysonProgress = dysonData.progress || 0;
            const dysonArea = dysonData.area || 0;
            const arealDensity = dysonData.areal_density || 1.0;
            const solarEffectiveness = dysonData.solar_effectiveness || 0;
            const dysonPowerTotal = dysonData.power_output_total || 0;
            const dysonPowerEconomy = dysonData.power_output_economy || 0;
            const dysonPowerCompute = dysonData.power_output_compute || 0;
            const dysonActualBuildRate = dysonData.build_rate || 0;
            
            // Stored Metal
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Stored Metal</div>';
            html += `<div class="probe-summary-value">${this.formatMassWithSigFigs(storedMetal)} kg</div>`;
            html += '</div>';
            
            // Stored Slag
            const dysonSlagMass = zoneData.slag_mass || 0;
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Stored Slag</div>';
            html += `<div class="probe-summary-value">${this.formatMassWithSigFigs(dysonSlagMass)} kg</div>`;
            html += '</div>';
            
            // Dyson Sphere section header
            html += '<div class="probe-summary-item" style="margin-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 8px;">';
            html += '<div class="probe-summary-label" style="color: #ffd700; font-weight: bold;">Dyson Sphere</div>';
            html += '</div>';
            
            // Total Mass
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Total Mass</div>';
            html += `<div class="probe-summary-value">${this.formatMassWithSigFigs(dysonMass)} kg</div>`;
            html += '</div>';
            
            // Progress
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Progress</div>';
            html += `<div class="probe-summary-value">${(dysonProgress * 100).toFixed(4)}%</div>`;
            html += '</div>';
            
            // Area (m²)
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Collection Area</div>';
            html += `<div class="probe-summary-value">${this.formatMassWithSigFigs(dysonArea)} m²</div>`;
            html += '</div>';
            
            // Areal Density
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Areal Density</div>';
            html += `<div class="probe-summary-value">${arealDensity.toFixed(2)} kg/m²</div>`;
            html += '</div>';
            
            // Build Rate
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Build Rate</div>';
            html += `<div class="probe-summary-value">${FormatUtils.formatRate(dysonActualBuildRate, 'kg')}</div>`;
            html += '</div>';
            
            // Solar Effectiveness
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Solar Effectiveness</div>';
            html += `<div class="probe-summary-value">${(solarEffectiveness * 100).toFixed(2)}%</div>`;
            html += '</div>';
            
            // Power Output section header
            html += '<div class="probe-summary-item" style="margin-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 8px;">';
            html += '<div class="probe-summary-label" style="color: #ffd700; font-weight: bold;">Power Output</div>';
            html += '</div>';
            
            // Total Power
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Total Power</div>';
            html += `<div class="probe-summary-value">${this.formatEnergy(dysonPowerTotal)}</div>`;
            html += '</div>';
            
            // Economy Power
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Economy Power</div>';
            html += `<div class="probe-summary-value">${this.formatEnergy(dysonPowerEconomy)}</div>`;
            html += '</div>';
            
            // Compute Power
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Compute Power</div>';
            html += `<div class="probe-summary-value">${this.formatEnergy(dysonPowerCompute)}</div>`;
            html += '</div>';
            
            // Probe Production
            if (probeProductionRate > 0) {
                html += '<div class="probe-summary-item" style="margin-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 8px;">';
                html += '<div class="probe-summary-label">Probe Production</div>';
                html += `<div class="probe-summary-value">${FormatUtils.formatRate(probeProductionRate, 'probes')}</div>`;
                html += '</div>';
            }
        } else {
            // Probe Production Rate (always show)
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Probe Production Rate</div>';
            html += `<div class="probe-summary-value">${FormatUtils.formatRate(probesPerDay, 'probes')}</div>`;
            html += '</div>';
            
            // Metal Consumption Rate
            if (metalConsumptionRate > 0) {
                html += '<div class="probe-summary-item">';
                html += '<div class="probe-summary-label">Metal Consumption Rate</div>';
                html += `<div class="probe-summary-value">${FormatUtils.formatRate(metalConsumptionRate, 'kg')}</div>`;
                html += '</div>';
            }
            
            // Metal Production (fixed: removed extra /day)
            if (metalMiningRate > 0) {
                html += '<div class="probe-summary-item">';
                html += '<div class="probe-summary-label">Metal Production</div>';
                html += `<div class="probe-summary-value">${FormatUtils.formatRate(metalMiningRate, 'kg')}</div>`;
                html += '</div>';
            }
            
            // Slag Production (fixed: removed extra /day)
            if (slagMiningRate > 0) {
                html += '<div class="probe-summary-item">';
                html += '<div class="probe-summary-label">Slag Production</div>';
                html += `<div class="probe-summary-value">${FormatUtils.formatRate(slagMiningRate, 'kg')}</div>`;
                html += '</div>';
            }
            
            // Stored Metal
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Stored Metal</div>';
            html += `<div class="probe-summary-value">${this.formatMassWithSigFigs(storedMetal)} kg</div>`;
            html += '</div>';
            
            // Slag Stores
            const slagStores = zoneData.slag_mass || 0;
            html += '<div class="probe-summary-item">';
            html += '<div class="probe-summary-label">Slag Stores</div>';
            html += `<div class="probe-summary-value">${this.formatMassWithSigFigs(slagStores)} kg</div>`;
            html += '</div>';
        }
        
        // Energy Produced
        html += '<div class="probe-summary-item">';
        html += '<div class="probe-summary-label">Energy Produced</div>';
        html += `<div class="probe-summary-value">${this.formatEnergy(zoneEnergy.production)}</div>`;
        html += '</div>';
        
        // Energy Consumed
        html += '<div class="probe-summary-item">';
        html += '<div class="probe-summary-label">Energy Consumed</div>';
        html += `<div class="probe-summary-value">${this.formatEnergy(zoneEnergy.consumption)}</div>`;
        html += '</div>';
        
        // FLOPS (Intelligence - global rate shown for context)
        const globalFlops = this.gameState.intelligence || 0;
        html += '<div class="probe-summary-item">';
        html += '<div class="probe-summary-label">FLOPS</div>';
        html += `<div class="probe-summary-value">${this.formatFlops(globalFlops)}</div>`;
        html += '</div>';
        
        html += '</div>';
        
        this.container.innerHTML = html;
    }

    update(gameState) {
        if (!gameState) return;
        
        this.gameState = gameState;
        
        // If a zone is selected, update the info
        if (this.selectedZone) {
            const derivedZones = gameState.derived?.zones || {};
            const zoneData = derivedZones[this.selectedZone];
            
            if (zoneData) {
                // Get zone info from orbital zone selector
                let zone = null;
                if (window.orbitalZoneSelector && window.orbitalZoneSelector.orbitalZones) {
                    zone = window.orbitalZoneSelector.orbitalZones.find(z => z.id === this.selectedZone);
                }
                
                if (zone) {
                    this.updateZoneInfo(this.selectedZone, zoneData, zone);
                } else {
                    // Still show basic info even without zone metadata
                    this.updateZoneInfo(this.selectedZone, zoneData, { 
                        name: this.selectedZone.charAt(0).toUpperCase() + this.selectedZone.slice(1).replace(/_/g, ' '), 
                        is_dyson_zone: this.selectedZone === 'dyson_sphere',
                        radius_au: 1.0,
                        metal_percentage: 0
                    });
                }
            }
        } else {
            this.render();
        }
    }

    setSelectedZone(zoneId) {
        this.selectedZone = zoneId;
        if (this.gameState) {
            this.update(this.gameState);
        } else {
            this.render();
        }
    }
}

