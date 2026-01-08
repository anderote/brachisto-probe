/** Resource display UI component */
class ResourceDisplay {
    constructor(containerId, compactMode = false) {
        this.container = document.getElementById(containerId);
        this.compactMode = compactMode;
        this.previousState = null;
        this.gameState = null;
        this.buildings = null; // Will store buildings data for structure mass calculation
        this.economicRules = null; // Will store economic rules for energy calculations
        this.isExpanded = false; // Track dropdown expansion state
        this.init();
        this.loadGameData();
    }
    
    async loadGameData() {
        try {
            // Load buildings and economic rules in parallel
            const [buildingsResponse, economicRulesResponse] = await Promise.all([
                fetch('/game_data/buildings.json'),
                fetch('/game_data/economic_rules.json')
            ]);
            
            const buildingsData = await buildingsResponse.json();
            this.buildings = buildingsData.buildings || buildingsData;
            
            this.economicRules = await economicRulesResponse.json();
        } catch (error) {
            console.error('Failed to load game data:', error);
            this.buildings = {};
            this.economicRules = null;
        }
    }
    
    // Helper to get energy value from economic rules with fallback
    getEnergyValue(path, fallback) {
        if (!this.economicRules) return fallback;
        const parts = path.split('.');
        let value = this.economicRules;
        for (const part of parts) {
            value = value?.[part];
            if (value === undefined) return fallback;
        }
        return value;
    }

    init() {
        if (this.compactMode) {
            this.initCompact();
        } else {
            this.initFull();
        }
    }

    initCompact() {
        this.container.innerHTML = `
            <div class="compact-resources-header" id="economic-bar-toggle">
                <div class="compact-resource-item" id="resource-energy-container" data-resource="energy">
                    <div class="compact-resource-header">Energy</div>
                    <div class="compact-resource-line">
                        <span class="compact-resource-label-small">Net:</span>
                        <span class="compact-resource-value" id="resource-energy-net">0 kW</span>
                    </div>
                    <div class="compact-resource-line">
                        <span class="compact-resource-label-small">Produced:</span>
                        <span class="compact-resource-value" id="resource-energy-produced">0 kW</span>
                    </div>
                    <div class="compact-resource-line">
                        <span class="compact-resource-label-small">Consumed:</span>
                        <span class="compact-resource-value" id="resource-energy-consumed">0 kW</span>
                    </div>
                </div>
                <div class="compact-resource-divider"></div>
                <div class="compact-resource-item" id="resource-intelligence-container" data-resource="intelligence">
                    <div class="compact-resource-header">Intelligence</div>
                    <div class="compact-resource-line">
                        <span class="compact-resource-label-small">Net:</span>
                        <span class="compact-resource-value" id="resource-intelligence-net">0</span>
                    </div>
                    <div class="compact-resource-line">
                        <span class="compact-resource-label-small">Produced:</span>
                        <span class="compact-resource-value" id="resource-intelligence-produced">0</span>
                    </div>
                    <div class="compact-resource-line">
                        <span class="compact-resource-label-small">Consumed:</span>
                        <span class="compact-resource-value" id="resource-intelligence-consumed">0</span>
                    </div>
                </div>
                <div class="compact-resource-divider"></div>
                <div class="compact-resource-item" id="resource-dexterity-container" data-resource="dexterity">
                    <div class="compact-resource-header">Dexterity</div>
                    <div class="compact-resource-line">
                        <span class="compact-resource-label-small">Net:</span>
                        <span class="compact-resource-value" id="resource-dexterity-net">0 kg/s</span>
                    </div>
                    <div class="compact-resource-line">
                        <span class="compact-resource-label-small">Mining Rate:</span>
                        <span class="compact-resource-value" id="resource-dexterity-mining">0 kg/s</span>
                    </div>
                    <div class="compact-resource-line">
                        <span class="compact-resource-label-small">Consumption Rate:</span>
                        <span class="compact-resource-value" id="resource-dexterity-consumption">0 kg/s</span>
                    </div>
                </div>
                <div id="resource-warnings" class="resource-warnings"></div>
                <div class="compact-resource-divider"></div>
                <div class="compact-resource-item">
                    <div class="compact-resource-header">Dyson</div>
                    <div class="compact-resource-line">
                        <span class="compact-resource-label-small">Progress:</span>
                        <span class="compact-resource-value" id="resource-dyson-progress">0%</span>
                    </div>
                    <div class="compact-resource-line">
                        <span class="compact-resource-label-small">Mass:</span>
                        <span class="compact-resource-value" id="resource-dyson-mass">0 kg</span>
                    </div>
                    <div class="compact-resource-line">
                        <span class="compact-resource-label-small">Probe Mass:</span>
                        <span class="compact-resource-value" id="resource-probe-mass">0 kg</span>
                    </div>
                    <div class="compact-resource-line">
                        <span class="compact-resource-label-small">Structure Mass:</span>
                        <span class="compact-resource-value" id="resource-structure-mass">0 kg</span>
                    </div>
                </div>
                <div class="expand-indicator" id="expand-indicator">
                    <span class="expand-icon">▼</span>
                </div>
            </div>
            <div class="economic-dropdown" id="economic-dropdown">
                <div class="economic-dropdown-content">
                    <div class="economic-breakdown-section" id="energy-breakdown-section">
                        <div class="breakdown-header">
                            <span class="breakdown-icon">⚡</span>
                            <span class="breakdown-title">Energy Breakdown</span>
                        </div>
                        <div class="breakdown-content" id="energy-breakdown-content"></div>
                    </div>
                    <div class="economic-breakdown-section" id="intelligence-breakdown-section">
                        <div class="breakdown-header">
                            <span class="breakdown-icon">🧠</span>
                            <span class="breakdown-title">Intelligence Breakdown</span>
                        </div>
                        <div class="breakdown-content" id="intelligence-breakdown-content"></div>
                    </div>
                    <div class="economic-breakdown-section" id="dexterity-breakdown-section">
                        <div class="breakdown-header">
                            <span class="breakdown-icon">⛏</span>
                            <span class="breakdown-title">Dexterity (Metal) Breakdown</span>
                        </div>
                        <div class="breakdown-content" id="dexterity-breakdown-content"></div>
                    </div>
                </div>
            </div>
        `;
        
        // Set up click handler for expansion
        this.setupDropdownToggle();
    }
    
    setupDropdownToggle() {
        const toggle = document.getElementById('economic-bar-toggle');
        const dropdown = document.getElementById('economic-dropdown');
        const expandIcon = document.querySelector('.expand-icon');
        
        if (toggle && dropdown) {
            toggle.addEventListener('click', (e) => {
                this.isExpanded = !this.isExpanded;
                dropdown.classList.toggle('expanded', this.isExpanded);
                toggle.classList.toggle('expanded', this.isExpanded);
                
                if (expandIcon) {
                    expandIcon.textContent = this.isExpanded ? '▲' : '▼';
                }
                
                // Update breakdown content when expanding
                if (this.isExpanded && this.gameState) {
                    this.updateBreakdownPanels();
                }
            });
        }
    }
    
    updateBreakdownPanels() {
        if (!this.gameState) return;
        
        this.updateEnergyBreakdown();
        this.updateIntelligenceBreakdown();
        this.updateDexterityBreakdown();
    }
    
    updateEnergyBreakdown() {
        const container = document.getElementById('energy-breakdown-content');
        if (!container || !this.gameState) return;
        
        const gameState = this.gameState;
        const derived = gameState.derived || {};
        const totals = derived.totals || {};
        const probesByZone = gameState.probes_by_zone || {};
        const probeAllocationsByZone = gameState.probe_allocations_by_zone || {};
        const structuresByZone = gameState.structures_by_zone || {};
        const allBuildings = this.buildings?.buildings || this.buildings || {};
        
        // Get orbital mechanics for solar irradiance
        const orbitalMechanics = window.gameDataLoader?.orbitalMechanics?.zones || {};
        
        let html = '';
        
        // ======= PRODUCTION SECTION =======
        html += '<div class="breakdown-subsection"><div class="subsection-title production-title">⚡ Energy Production</div>';
        
        // Base supply
        const baseSupply = gameState.base_energy_production || 0;
        if (baseSupply > 0) {
            html += `<div class="breakdown-row">
                <span class="row-label">🔋 Base Supply</span>
                <span class="row-value positive">${this.formatEnergy(baseSupply)}</span>
            </div>`;
        }
        
        // Probe energy production by zone
        const BASE_PROBE_ENERGY_PRODUCTION = this.getEnergyValue('probe.base_energy_production_w', 100000);
        let totalProbeEnergy = 0;
        let probeEnergyByZone = {};
        
        for (const [zoneId, zoneProbes] of Object.entries(probesByZone)) {
            const probeCount = zoneProbes['probe'] || 0;
            if (probeCount > 0) {
                const zoneEnergy = probeCount * BASE_PROBE_ENERGY_PRODUCTION;
                totalProbeEnergy += zoneEnergy;
                probeEnergyByZone[zoneId] = { probes: probeCount, energy: zoneEnergy };
            }
        }
        
        if (totalProbeEnergy > 0) {
            html += `<div class="breakdown-category">
                <div class="category-header">🛸 Probes <span class="header-detail">(${this.formatEnergy(BASE_PROBE_ENERGY_PRODUCTION)}/probe)</span></div>`;
            
            const sortedZones = Object.entries(probeEnergyByZone).sort((a, b) => b[1].energy - a[1].energy);
            for (const [zoneId, data] of sortedZones) {
                const zoneName = this.formatZoneName(zoneId);
                html += `<div class="breakdown-row indent">
                    <span class="row-label">${zoneName} <span class="detail">(${this.formatNumber(data.probes)} probes)</span></span>
                    <span class="row-value positive">${this.formatEnergy(data.energy)}</span>
                </div>`;
            }
            html += '</div>';
        }
        
        // ======= STRUCTURE ENERGY PRODUCTION BY TYPE =======
        // Gather all structures that produce energy, grouped by building type
        const geometricScalingExponent = Config.STRUCTURE_GEOMETRIC_SCALING_EXPONENT || 3.2;
        
        // Structure type definitions for grouping
        const structureTypeInfo = {
            'power_station': { icon: '☀️', label: 'Power Stations', isSolar: true },
            'data_center': { icon: '💻', label: 'Data Centers', isSolar: true, note: '(net power after compute)' },
            'deep_space_fusion_plant': { icon: '⚛️', label: 'Fusion Plants', isSolar: false }
        };
        
        // Collect all energy-producing structures by type
        let structuresByType = {};
        
        for (const [zoneId, zoneStructures] of Object.entries(structuresByZone)) {
            const zoneData = orbitalMechanics[zoneId] || {};
            const solarIrradiance = zoneData.solar_irradiance_factor || 1.0;
            
            for (const [buildingId, count] of Object.entries(zoneStructures)) {
                if (count <= 0) continue;
                
                const building = this.findBuilding(buildingId);
                if (!building) continue;
                
                const powerOutputMW = building.power_output_mw || 0;
                if (powerOutputMW <= 0) continue;
                
                // Calculate actual power
                let powerW = powerOutputMW * 1e6 * Math.pow(count, geometricScalingExponent);
                
                // Apply solar irradiance for solar structures
                const usesSolar = building.uses_solar === true;
                if (usesSolar) {
                    powerW *= solarIrradiance;
                }
                
                // For data centers, also track their consumption (net output)
                let netPower = powerW;
                if (buildingId === 'data_center' && building.base_power_consumption_mw) {
                    const consumptionW = building.base_power_consumption_mw * 1e6 * Math.pow(count, geometricScalingExponent);
                    netPower = powerW - consumptionW;
                }
                
                if (!structuresByType[buildingId]) {
                    structuresByType[buildingId] = {
                        building: building,
                        zones: [],
                        totalPower: 0,
                        totalNet: 0,
                        totalCount: 0
                    };
                }
                
                structuresByType[buildingId].zones.push({
                    zoneId,
                    zoneName: this.formatZoneName(zoneId),
                    count,
                    power: powerW,
                    netPower,
                    solarIrradiance: usesSolar ? solarIrradiance : null
                });
                structuresByType[buildingId].totalPower += powerW;
                structuresByType[buildingId].totalNet += netPower;
                structuresByType[buildingId].totalCount += count;
            }
        }
        
        // Render each structure type
        for (const [buildingId, data] of Object.entries(structuresByType)) {
            if (data.totalPower <= 0) continue;
            
            const typeInfo = structureTypeInfo[buildingId] || { icon: '🏭', label: data.building.name || buildingId, isSolar: false };
            const hasNote = typeInfo.note ? ` <span class="header-note">${typeInfo.note}</span>` : '';
            
            html += `<div class="breakdown-category">
                <div class="category-header">${typeInfo.icon} ${typeInfo.label}${hasNote}</div>`;
            
            // Sort zones by power output
            const sortedZones = data.zones.sort((a, b) => b.power - a.power);
            
            for (const zone of sortedZones) {
                const solarNote = zone.solarIrradiance !== null 
                    ? ` <span class="solar-factor">(${(zone.solarIrradiance * 100).toFixed(0)}% solar)</span>` 
                    : '';
                const countLabel = zone.count === 1 ? '' : ` ×${zone.count}`;
                
                // For data centers, show net power
                const displayPower = buildingId === 'data_center' ? zone.netPower : zone.power;
                const valueClass = displayPower >= 0 ? 'positive' : 'negative';
                
                html += `<div class="breakdown-row indent">
                    <span class="row-label">${zone.zoneName}${countLabel}${solarNote}</span>
                    <span class="row-value ${valueClass}">${this.formatEnergy(displayPower)}</span>
                </div>`;
            }
            html += '</div>';
        }
        
        // ======= DYSON SPHERE =======
        const dysonMass = gameState.dyson_sphere?.mass || 0;
        const dysonPowerAllocation = gameState.dyson_power_allocation || 0;
        const economyFraction = (100 - dysonPowerAllocation) / 100.0;
        const computeFraction = dysonPowerAllocation / 100.0;
        
        // Dyson sphere at ~0.29 AU has ~11.9x solar intensity
        const DYSON_POWER_PER_KG_BASE = 5000; // Base watts per kg at 1 AU
        const DYSON_RADIUS_AU = 0.29;
        const SOLAR_INTENSITY_MULT = 1 / (DYSON_RADIUS_AU * DYSON_RADIUS_AU); // ~11.9x
        const DYSON_POWER_PER_KG = DYSON_POWER_PER_KG_BASE * SOLAR_INTENSITY_MULT;
        
        const dysonTotalPower = dysonMass * DYSON_POWER_PER_KG;
        const dysonEnergyOutput = dysonTotalPower * economyFraction;
        const dysonComputeOutput = dysonTotalPower * computeFraction;
        
        if (dysonMass > 0) {
            html += `<div class="breakdown-category">
                <div class="category-header">🌐 Dyson Sphere <span class="header-detail">(${(DYSON_POWER_PER_KG / 1000).toFixed(1)} kW/kg at 0.29 AU)</span></div>
                <div class="breakdown-row indent">
                    <span class="row-label">Total Mass</span>
                    <span class="row-value">${this.formatMass(dysonMass)}</span>
                </div>
                <div class="breakdown-row indent">
                    <span class="row-label">Total Capacity</span>
                    <span class="row-value">${this.formatEnergy(dysonTotalPower)}</span>
                </div>
                <div class="breakdown-row indent">
                    <span class="row-label">→ Economy <span class="detail">(${(economyFraction * 100).toFixed(0)}%)</span></span>
                    <span class="row-value positive">${this.formatEnergy(dysonEnergyOutput)}</span>
                </div>
                <div class="breakdown-row indent">
                    <span class="row-label">→ Compute <span class="detail">(${(computeFraction * 100).toFixed(0)}%)</span></span>
                    <span class="row-value dimmed">${this.formatEnergy(dysonComputeOutput)}</span>
                </div>
            </div>`;
        }
        
        // Production total
        const totalProduction = totals.energy_produced || 0;
        html += `<div class="breakdown-total">
            <span class="total-label">Total Production</span>
            <span class="total-value positive">${this.formatEnergy(totalProduction)}</span>
        </div></div>`;
        
        // ======= CONSUMPTION SECTION =======
        html += '<div class="breakdown-subsection"><div class="subsection-title consumption-title">🔌 Energy Consumption</div>';
        
        // Probe activity consumption by zone
        const BASE_MINING_ENERGY = this.getEnergyValue('probe.base_energy_cost_mining_w', 500000);
        const BASE_RECYCLING_ENERGY = this.getEnergyValue('probe.base_energy_cost_recycle_slag_w', 300000);
        
        let probeConsumptionByZone = {};
        let totalMiningEnergy = 0;
        let totalRecyclingEnergy = 0;
        
        for (const [zoneId, zoneProbes] of Object.entries(probesByZone)) {
            const probeCount = zoneProbes['probe'] || 0;
            if (probeCount <= 0) continue;
            
            const allocations = probeAllocationsByZone[zoneId] || {};
            const harvestAllocation = allocations.harvest || 0;
            const recycleAllocation = allocations.recycle || 0;
            
            const miningProbes = probeCount * harvestAllocation;
            const recyclingProbes = probeCount * recycleAllocation;
            
            const miningEnergy = miningProbes * BASE_MINING_ENERGY;
            const recyclingEnergy = recyclingProbes * BASE_RECYCLING_ENERGY;
            
            if (miningEnergy > 0 || recyclingEnergy > 0) {
                probeConsumptionByZone[zoneId] = {
                    mining: { probes: miningProbes, energy: miningEnergy },
                    recycling: { probes: recyclingProbes, energy: recyclingEnergy }
                };
                totalMiningEnergy += miningEnergy;
                totalRecyclingEnergy += recyclingEnergy;
            }
        }
        
        if (totalMiningEnergy > 0 || totalRecyclingEnergy > 0) {
            html += `<div class="breakdown-category">
                <div class="category-header">🛸 Probe Activities <span class="header-detail">(Mining: ${this.formatEnergy(BASE_MINING_ENERGY)}/probe, Recycling: ${this.formatEnergy(BASE_RECYCLING_ENERGY)}/probe)</span></div>`;
            
            const sortedZones = Object.entries(probeConsumptionByZone).sort((a, b) => 
                (b[1].mining.energy + b[1].recycling.energy) - (a[1].mining.energy + a[1].recycling.energy));
            
            for (const [zoneId, data] of sortedZones) {
                const zoneName = this.formatZoneName(zoneId);
                const zoneTotal = data.mining.energy + data.recycling.energy;
                
                html += `<div class="breakdown-row indent zone-row">
                    <span class="row-label zone-name">${zoneName}</span>
                    <span class="row-value negative">${this.formatEnergy(zoneTotal)}</span>
                </div>`;
                
                if (data.mining.energy > 0) {
                    html += `<div class="breakdown-row indent-2">
                        <span class="row-label">⛏️ Mining <span class="detail">(${this.formatNumber(data.mining.probes)} probes)</span></span>
                        <span class="row-value negative">${this.formatEnergy(data.mining.energy)}</span>
                    </div>`;
                }
                if (data.recycling.energy > 0) {
                    html += `<div class="breakdown-row indent-2">
                        <span class="row-label">♻️ Recycling <span class="detail">(${this.formatNumber(data.recycling.probes)} probes)</span></span>
                        <span class="row-value negative">${this.formatEnergy(data.recycling.energy)}</span>
                    </div>`;
                }
            }
            html += '</div>';
        }
        
        // ======= STRUCTURE CONSUMPTION BY TYPE =======
        // Structure consumption type definitions
        const consumptionTypeInfo = {
            'mass_driver': { icon: '🚀', label: 'Mass Drivers', note: '(offline when deficit)' },
            'em_gas_miner': { icon: '⛽', label: 'EM Gas Miners' },
            'space_elevator': { icon: '🗼', label: 'Space Elevators' },
            'robotic_asteroid_factory': { icon: '🏭', label: 'Asteroid Factories' },
            'methalox_refinery': { icon: '⚗️', label: 'Methalox Refineries' },
            'data_center': { icon: '💻', label: 'Data Centers', note: '(base draw before solar offset)' }
        };
        
        const BASE_STRUCTURE_ENERGY = this.getEnergyValue('structures.base_energy_cost_w', 250000);
        
        // Collect all energy-consuming structures by type
        let consumptionByType = {};
        
        for (const [zoneId, zoneStructures] of Object.entries(structuresByZone)) {
            for (const [buildingId, count] of Object.entries(zoneStructures)) {
                if (count <= 0) continue;
                
                const building = this.findBuilding(buildingId);
                if (!building) continue;
                
                let consumption = 0;
                
                // Check for energy_cost_multiplier (most structures)
                if (building.energy_cost_multiplier !== undefined && building.energy_cost_multiplier > 0) {
                    consumption = BASE_STRUCTURE_ENERGY * building.energy_cost_multiplier * count;
                }
                // Check for base_power_consumption_mw (data centers)
                else if (building.base_power_consumption_mw !== undefined && building.base_power_consumption_mw > 0) {
                    consumption = building.base_power_consumption_mw * 1e6 * Math.pow(count, geometricScalingExponent);
                }
                
                if (consumption <= 0) continue;
                
                if (!consumptionByType[buildingId]) {
                    consumptionByType[buildingId] = {
                        building: building,
                        zones: [],
                        totalConsumption: 0,
                        totalCount: 0
                    };
                }
                
                consumptionByType[buildingId].zones.push({
                    zoneId,
                    zoneName: this.formatZoneName(zoneId),
                    count,
                    consumption
                });
                consumptionByType[buildingId].totalConsumption += consumption;
                consumptionByType[buildingId].totalCount += count;
            }
        }
        
        // Render each structure type that consumes energy
        for (const [buildingId, data] of Object.entries(consumptionByType)) {
            if (data.totalConsumption <= 0) continue;
            
            const typeInfo = consumptionTypeInfo[buildingId] || { icon: '🏭', label: data.building.name || buildingId };
            const hasNote = typeInfo.note ? ` <span class="header-note">${typeInfo.note}</span>` : '';
            
            html += `<div class="breakdown-category">
                <div class="category-header">${typeInfo.icon} ${typeInfo.label}${hasNote}</div>`;
            
            // Sort zones by consumption
            const sortedZones = data.zones.sort((a, b) => b.consumption - a.consumption);
            
            for (const zone of sortedZones) {
                const countLabel = zone.count === 1 ? '' : ` ×${zone.count}`;
                
                html += `<div class="breakdown-row indent">
                    <span class="row-label">${zone.zoneName}${countLabel}</span>
                    <span class="row-value negative">${this.formatEnergy(zone.consumption)}</span>
                </div>`;
            }
            html += '</div>';
        }
        
        // Consumption total
        const totalConsumption = totals.energy_consumed || 0;
        html += `<div class="breakdown-total">
            <span class="total-label">Total Consumption</span>
            <span class="total-value negative">${this.formatEnergy(totalConsumption)}</span>
        </div></div>`;
        
        // ======= NET SECTION =======
        const netEnergy = totals.energy_net || 0;
        const netClass = netEnergy < 0 ? 'negative' : 'positive';
        html += `<div class="breakdown-net ${netClass}">
            <span class="net-label">Net Energy</span>
            <span class="net-value">${this.formatEnergy(netEnergy)}</span>
        </div>`;
        
        if (netEnergy < 0) {
            const throttle = ((totals.energy_produced || 0) / (totals.energy_consumed || 1) * 100);
            html += `<div class="breakdown-warning">
                <span class="warning-icon">⚠</span>
                <span class="warning-text">Energy deficit! Activities throttled to ${throttle.toFixed(1)}%. Mass drivers offline.</span>
            </div>`;
        }
        
        container.innerHTML = html;
    }
    
    updateIntelligenceBreakdown() {
        const container = document.getElementById('intelligence-breakdown-content');
        if (!container || !this.gameState) return;
        
        const gameState = this.gameState;
        const derived = gameState.derived || {};
        const totals = derived.totals || {};
        const probesByZone = gameState.probes_by_zone || {};
        const structuresByZone = gameState.structures_by_zone || {};
        const orbitalMechanics = window.gameDataLoader?.orbitalMechanics?.zones || {};
        
        let html = '';
        
        // ======= PRODUCTION SECTION =======
        html += '<div class="breakdown-subsection"><div class="subsection-title production-title">🧠 Compute Production</div>';
        
        // ======= PROBE COMPUTE =======
        // Each probe has onboard compute (100 PFLOPs base)
        const BASE_PROBE_PFLOPS = this.economicRules?.probe?.base_compute_pflops || Config.PROBE_BASE_COMPUTE_PFLOPS || 100;
        let totalProbeFlops = 0;
        let probeComputeByZone = {};
        
        for (const [zoneId, zoneProbes] of Object.entries(probesByZone)) {
            const probeCount = zoneProbes['probe'] || 0;
            if (probeCount > 0) {
                const zoneFlops = probeCount * BASE_PROBE_PFLOPS * 1e15; // Convert PFLOPS to FLOPS
                totalProbeFlops += zoneFlops;
                probeComputeByZone[zoneId] = { probes: probeCount, flops: zoneFlops };
            }
        }
        
        if (totalProbeFlops > 0) {
            html += `<div class="breakdown-category">
                <div class="category-header">🛸 Probe Onboard Compute <span class="header-detail">(${BASE_PROBE_PFLOPS} PFLOPS/probe)</span></div>`;
            
            const sortedZones = Object.entries(probeComputeByZone).sort((a, b) => b[1].flops - a[1].flops);
            for (const [zoneId, data] of sortedZones) {
                const zoneName = this.formatZoneName(zoneId);
                html += `<div class="breakdown-row indent">
                    <span class="row-label">${zoneName} <span class="detail">(${this.formatNumber(data.probes)} probes)</span></span>
                    <span class="row-value positive">${this.formatFLOPS(data.flops)}</span>
                </div>`;
            }
            html += '</div>';
        }
        
        // ======= DATA CENTERS =======
        // Data centers have compute_eflops (10 EFLOPS each)
        const geometricScalingExponent = Config.STRUCTURE_GEOMETRIC_SCALING_EXPONENT || 3.2;
        let dataCentersByZone = {};
        let totalDataCenterFlops = 0;
        
        for (const [zoneId, zoneStructures] of Object.entries(structuresByZone)) {
            const zoneData = orbitalMechanics[zoneId] || {};
            const solarIrradiance = zoneData.solar_irradiance_factor || 1.0;
            
            for (const [buildingId, count] of Object.entries(zoneStructures)) {
                if (count <= 0 || buildingId !== 'data_center') continue;
                
                const building = this.findBuilding(buildingId);
                if (!building || !building.compute_eflops) continue;
                
                // Calculate compute with geometric scaling
                const baseComputeEFLOPS = building.compute_eflops;
                const baseComputeFLOPS = baseComputeEFLOPS * 1e18; // Convert EFLOPS to FLOPS
                const geometricFactor = Math.pow(count, geometricScalingExponent);
                const effectiveFLOPS = baseComputeFLOPS * geometricFactor;
                
                if (!dataCentersByZone[zoneId]) {
                    dataCentersByZone[zoneId] = {
                        count: 0,
                        flops: 0,
                        solarIrradiance: solarIrradiance
                    };
                }
                
                dataCentersByZone[zoneId].count += count;
                dataCentersByZone[zoneId].flops += effectiveFLOPS;
                totalDataCenterFlops += effectiveFLOPS;
            }
        }
        
        if (totalDataCenterFlops > 0) {
            const dataCenter = this.findBuilding('data_center');
            const baseEFLOPS = dataCenter?.compute_eflops || 10;
            
            html += `<div class="breakdown-category">
                <div class="category-header">💻 Data Centers <span class="header-detail">(${baseEFLOPS} EFLOPS base)</span></div>`;
            
            const sortedZones = Object.entries(dataCentersByZone).sort((a, b) => b[1].flops - a[1].flops);
            for (const [zoneId, data] of sortedZones) {
                const zoneName = this.formatZoneName(zoneId);
                const countLabel = data.count === 1 ? '' : ` ×${data.count}`;
                const solarNote = ` <span class="solar-factor">(${(data.solarIrradiance * 100).toFixed(0)}% solar efficiency)</span>`;
                
                html += `<div class="breakdown-row indent">
                    <span class="row-label">${zoneName}${countLabel}${solarNote}</span>
                    <span class="row-value positive">${this.formatFLOPS(data.flops)}</span>
                </div>`;
            }
            html += '</div>';
        }
        
        // ======= DYSON SPHERE COMPUTE =======
        const dysonMass = gameState.dyson_sphere?.mass || 0;
        const dysonPowerAllocation = gameState.dyson_power_allocation || 0;
        const economyFraction = (100 - dysonPowerAllocation) / 100.0;
        const computeFraction = dysonPowerAllocation / 100.0;
        
        // Dyson sphere compute: 1 PFLOPS per kg of mass
        const DYSON_FLOPS_PER_KG = 1e15; // 1 PFLOPS = 10^15 FLOPS
        const dysonTotalFlops = dysonMass * DYSON_FLOPS_PER_KG;
        const dysonComputeFlops = dysonTotalFlops * computeFraction;
        
        if (dysonMass > 0) {
            html += `<div class="breakdown-category">
                <div class="category-header">🌐 Dyson Sphere <span class="header-detail">(1 PFLOPS/kg)</span></div>
                <div class="breakdown-row indent">
                    <span class="row-label">Total Mass</span>
                    <span class="row-value">${this.formatMass(dysonMass)}</span>
                </div>
                <div class="breakdown-row indent">
                    <span class="row-label">Total Compute Capacity</span>
                    <span class="row-value">${this.formatFLOPS(dysonTotalFlops)}</span>
                </div>
                <div class="breakdown-row indent">
                    <span class="row-label">→ Compute <span class="detail">(${(computeFraction * 100).toFixed(0)}%)</span></span>
                    <span class="row-value positive">${this.formatFLOPS(dysonComputeFlops)}</span>
                </div>
                <div class="breakdown-row indent">
                    <span class="row-label">→ Energy <span class="detail">(${(economyFraction * 100).toFixed(0)}%)</span></span>
                    <span class="row-value dimmed">(see Energy tab)</span>
                </div>
            </div>`;
        }
        
        // ======= LEGACY RESEARCH STRUCTURES =======
        // Check for any other intelligence-producing structures
        let researchByZone = {};
        let totalResearchFlops = 0;
        
        for (const [zoneId, zoneStructures] of Object.entries(structuresByZone)) {
            let zoneFlops = 0;
            let zoneDetails = [];
            
            for (const [buildingId, count] of Object.entries(zoneStructures)) {
                if (count <= 0 || buildingId === 'data_center') continue;
                
                const building = this.findBuilding(buildingId);
                if (!building) continue;
                
                // Check for legacy intelligence production
                const intelligenceFlops = building.effects?.intelligence_flops || 0;
                if (intelligenceFlops > 0) {
                    const geometricFactor = Math.pow(count, geometricScalingExponent);
                    const totalFlops = intelligenceFlops * geometricFactor;
                    zoneFlops += totalFlops;
                    zoneDetails.push({ name: building.name || buildingId, count, flops: totalFlops });
                }
            }
            
            if (zoneFlops > 0) {
                researchByZone[zoneId] = { total: zoneFlops, structures: zoneDetails };
                totalResearchFlops += zoneFlops;
            }
        }
        
        if (totalResearchFlops > 0) {
            html += '<div class="breakdown-category"><div class="category-header">🔬 Research Structures</div>';
            
            const sortedZones = Object.entries(researchByZone).sort((a, b) => b[1].total - a[1].total);
            for (const [zoneId, data] of sortedZones) {
                const zoneName = this.formatZoneName(zoneId);
                html += `<div class="breakdown-row indent zone-row">
                    <span class="row-label zone-name">${zoneName}</span>
                    <span class="row-value positive">${this.formatFLOPS(data.total)}</span>
                </div>`;
                
                for (const struct of data.structures) {
                    html += `<div class="breakdown-row indent-2">
                        <span class="row-label structure-name">${struct.name} <span class="detail">(×${struct.count})</span></span>
                        <span class="row-value positive">${this.formatFLOPS(struct.flops)}</span>
                    </div>`;
                }
            }
            html += '</div>';
        }
        
        // Production total
        const totalProduction = totals.intelligence_produced || 0;
        html += `<div class="breakdown-total">
            <span class="total-label">Total Compute</span>
            <span class="total-value positive">${this.formatFLOPS(totalProduction)}</span>
        </div></div>`;
        
        // ======= USAGE SECTION =======
        html += '<div class="breakdown-subsection"><div class="subsection-title consumption-title">📊 Compute Usage</div>';
        
        // Research allocation
        const techTree = gameState.tech_tree || {};
        const researchState = techTree.research || gameState.research || {};
        let activeResearchCount = 0;
        let researchProjects = [];
        
        // Count active research projects
        for (const [treeId, tree] of Object.entries(researchState)) {
            for (const [tierId, tier] of Object.entries(tree)) {
                if (tier.enabled && tier.progress < 1.0) {
                    activeResearchCount++;
                    researchProjects.push({
                        tree: treeId,
                        tier: tierId,
                        progress: (tier.progress * 100).toFixed(1)
                    });
                }
            }
        }
        
        // Get consumption from derived totals
        const intelligenceConsumed = totals.intelligence_consumed || 0;

        if (activeResearchCount > 0) {
            const flopsPerProject = totalProduction / activeResearchCount;

            html += `<div class="breakdown-category">
                <div class="category-header">🔬 Active Research <span class="header-detail">(${activeResearchCount} project${activeResearchCount > 1 ? 's' : ''})</span></div>`;

            for (const project of researchProjects.slice(0, 5)) { // Show up to 5
                const treeName = project.tree.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                html += `<div class="breakdown-row indent">
                    <span class="row-label">${treeName} T${project.tier} <span class="detail">(${project.progress}%)</span></span>
                    <span class="row-value negative">${this.formatFLOPS(flopsPerProject)}</span>
                </div>`;
            }
            if (researchProjects.length > 5) {
                html += `<div class="breakdown-row indent note">
                    <span class="row-label">...and ${researchProjects.length - 5} more</span>
                </div>`;
            }
            html += '</div>';
        } else {
            html += `<div class="breakdown-category">
                <div class="category-header">🔬 Research</div>
                <div class="breakdown-row indent note">
                    <span class="row-label">No active research projects</span>
                </div>
            </div>`;
        }

        // Drone coordination compute usage
        // Get total probe count for coordination info
        let totalProbeCount = 0;
        for (const [zoneId, zoneProbes] of Object.entries(probesByZone)) {
            totalProbeCount += zoneProbes['probe'] || 0;
        }

        if (totalProbeCount > 0) {
            // Compute skill helps with drone coordination
            const computerSkill = gameState.skills?.computer?.total || 1.0;
            const baseEfficiency = Math.max(0, 100 - (40 * Math.log2(Math.max(1, totalProbeCount)) / Math.log2(2)));
            const improvedEfficiency = Math.max(0, 100 - (1 * Math.log2(Math.max(1, totalProbeCount)) / Math.log2(2)));
            const currentEfficiency = baseEfficiency + (improvedEfficiency - baseEfficiency) * ((computerSkill - 1.0) / 2.18);

            html += `<div class="breakdown-category">
                <div class="category-header">🤖 Drone Coordination <span class="header-detail">(skill-based)</span></div>
                <div class="breakdown-row indent">
                    <span class="row-label">Total Drones</span>
                    <span class="row-value">${this.formatNumber(totalProbeCount)}</span>
                </div>
                <div class="breakdown-row indent">
                    <span class="row-label">Computer Skill</span>
                    <span class="row-value">${computerSkill.toFixed(2)}x</span>
                </div>
                <div class="breakdown-row indent">
                    <span class="row-label">Coordination Efficiency</span>
                    <span class="row-value ${currentEfficiency > 50 ? 'positive' : 'warning'}">${currentEfficiency.toFixed(1)}%</span>
                </div>
            </div>`;
        }

        // Consumption total
        html += `<div class="breakdown-total">
            <span class="total-label">Total Compute Used</span>
            <span class="total-value negative">${this.formatFLOPS(intelligenceConsumed)}</span>
        </div></div>`;

        // ======= NET SECTION =======
        const netIntelligence = totalProduction - intelligenceConsumed;
        const netClass = netIntelligence < 0 ? 'negative' : (activeResearchCount > 0 ? 'dimmed' : 'positive');
        html += `<div class="breakdown-net ${netClass}">
            <span class="net-label">Net Compute</span>
            <span class="net-value">${this.formatFLOPS(netIntelligence)}</span>
        </div>`;

        if (activeResearchCount === 0 && totalProduction > 0) {
            html += `<div class="breakdown-note">💡 No active research projects. Enable research in the Tech Tree to use compute power.</div>`;
        } else if (activeResearchCount > 0) {
            html += `<div class="breakdown-note">💡 Compute is distributed equally among active research projects.</div>`;
        }
        
        container.innerHTML = html;
    }
    
    updateDexterityBreakdown() {
        const container = document.getElementById('dexterity-breakdown-content');
        if (!container || !this.gameState) return;
        
        const gameState = this.gameState;
        const derived = gameState.derived || {};
        const totals = derived.totals || {};
        const probesByZone = gameState.probes_by_zone || {};
        const probeAllocationsByZone = gameState.probe_allocations_by_zone || {};
        const structuresByZone = gameState.structures_by_zone || {};
        
        let html = '';
        
        // Metal stored
        const metal = gameState.metal || 0;
        html += `<div class="breakdown-stored">
            <span class="stored-label">Metal Stored</span>
            <span class="stored-value">${this.formatNumber(metal)} kg</span>
        </div>`;
        
        // ======= PRODUCTION SECTION =======
        html += '<div class="breakdown-subsection"><div class="subsection-title production-title">Mining Rate</div>';
        
        // Mining probes by zone
        let miningByZone = {};
        let totalMining = 0;
        const PROBE_HARVEST_RATE = Config.PROBE_HARVEST_RATE || 100;
        
        for (const [zoneId, zoneProbes] of Object.entries(probesByZone)) {
            const probeCount = zoneProbes['probe'] || 0;
            if (probeCount <= 0) continue;
            
            const allocations = probeAllocationsByZone[zoneId] || {};
            const harvestAllocation = allocations.harvest || 0;
            const miningProbes = probeCount * harvestAllocation;
            
            if (miningProbes > 0) {
                const miningRate = miningProbes * PROBE_HARVEST_RATE;
                miningByZone[zoneId] = { probes: miningProbes, rate: miningRate };
                totalMining += miningRate;
            }
        }
        
        if (totalMining > 0) {
            html += '<div class="breakdown-category"><div class="category-header">Mining Probes</div>';
            
            const sortedZones = Object.entries(miningByZone).sort((a, b) => b[1].rate - a[1].rate);
            for (const [zoneId, data] of sortedZones) {
                const zoneName = this.formatZoneName(zoneId);
                html += `<div class="breakdown-row indent">
                    <span class="row-label">${zoneName} <span class="detail">(${this.formatNumber(data.probes)} probes)</span></span>
                    <span class="row-value positive">${this.safeFormatRate(data.rate, 'kg')}</span>
                </div>`;
            }
            html += '</div>';
        }
        
        // Mining structures by zone
        let structureMiningByZone = {};
        let totalStructureMining = 0;
        
        for (const [zoneId, zoneStructures] of Object.entries(structuresByZone)) {
            let zoneMining = 0;
            let zoneDetails = [];
            
            for (const [buildingId, count] of Object.entries(zoneStructures)) {
                if (count <= 0) continue;
                
                const building = this.findBuilding(buildingId);
                if (!building) continue;
                
                const metalProduction = building.effects?.metal_production_per_day || 0;
                if (metalProduction > 0) {
                    const totalProduction = metalProduction * count;
                    zoneMining += totalProduction;
                    zoneDetails.push({ name: building.name || buildingId, count, rate: totalProduction });
                }
            }
            
            if (zoneMining > 0) {
                structureMiningByZone[zoneId] = { total: zoneMining, structures: zoneDetails };
                totalStructureMining += zoneMining;
            }
        }
        
        if (totalStructureMining > 0) {
            html += '<div class="breakdown-category"><div class="category-header">Mining Structures</div>';
            
            const sortedZones = Object.entries(structureMiningByZone).sort((a, b) => b[1].total - a[1].total);
            for (const [zoneId, data] of sortedZones) {
                const zoneName = this.formatZoneName(zoneId);
                html += `<div class="breakdown-row indent zone-row">
                    <span class="row-label zone-name">${zoneName}</span>
                    <span class="row-value positive">${this.safeFormatRate(data.total, 'kg')}</span>
                </div>`;
                
                for (const struct of data.structures) {
                    html += `<div class="breakdown-row indent-2">
                        <span class="row-label structure-name">${struct.name} <span class="detail">(×${struct.count})</span></span>
                        <span class="row-value positive">${this.safeFormatRate(struct.rate, 'kg')}</span>
                    </div>`;
                }
            }
            html += '</div>';
        }
        
        // Mining total
        const totalMiningRate = totals.metal_mined_rate || 0;
        html += `<div class="breakdown-total">
            <span class="total-label">Total Mining Rate</span>
            <span class="total-value positive">${this.safeFormatRate(totalMiningRate, 'kg')}</span>
        </div></div>`;
        
        // ======= CONSUMPTION SECTION =======
        html += '<div class="breakdown-subsection"><div class="subsection-title consumption-title">Consumption Rate</div>';
        
        // Construction probes by zone (building probes + structures)
        let constructionByZone = {};
        let totalProbeConstruction = 0;
        let totalStructureConstruction = 0;
        let totalDysonConstruction = 0;
        const PROBE_MASS = Config.PROBE_MASS || 100;
        const PROBE_BUILD_RATE = Config.PROBE_BUILD_RATE || 20;
        
        for (const [zoneId, zoneProbes] of Object.entries(probesByZone)) {
            const probeCount = zoneProbes['probe'] || 0;
            if (probeCount <= 0) continue;
            
            const allocations = probeAllocationsByZone[zoneId] || {};
            const replicateAlloc = allocations.replicate || 0;
            const constructAlloc = allocations.construct || 0;
            const dysonAlloc = allocations.dyson || 0;
            
            const replicatingProbes = probeCount * replicateAlloc;
            const constructingProbes = probeCount * constructAlloc;
            const dysonProbes = probeCount * dysonAlloc;
            
            // Calculate rates
            const buildAllocation = gameState.build_allocation || 50;
            const probeRate = replicatingProbes * PROBE_BUILD_RATE * PROBE_MASS / 86400; // kg/day to kg/s approx
            const structureRate = constructingProbes * PROBE_BUILD_RATE;
            const dysonRate = dysonProbes * PROBE_BUILD_RATE;
            
            if (replicatingProbes > 0 || constructingProbes > 0 || dysonProbes > 0) {
                constructionByZone[zoneId] = {
                    replicating: { probes: replicatingProbes, rate: gameState.probe_production_rate ? (gameState.probe_production_rate * PROBE_MASS / Object.keys(constructionByZone).length) : 0 },
                    structures: { probes: constructingProbes, rate: structureRate },
                    dyson: { probes: dysonProbes, rate: dysonRate }
                };
            }
        }
        
        // Probe building consumption
        const probeProductionRate = gameState.probe_production_rate || 0;
        const probeMetalConsumption = probeProductionRate * PROBE_MASS;
        if (probeMetalConsumption > 0) {
            html += `<div class="breakdown-category"><div class="category-header">Probe Construction</div>
                <div class="breakdown-row indent">
                    <span class="row-label">Building ${this.formatNumber(probeProductionRate)} probes/day</span>
                    <span class="row-value negative">${this.safeFormatRate(probeMetalConsumption, 'kg')}</span>
                </div>
            </div>`;
        }
        
        // Dyson construction consumption
        const dysonConstructionRate = gameState.dyson_construction_rate || 0;
        if (dysonConstructionRate > 0) {
            html += `<div class="breakdown-category"><div class="category-header">Dyson Sphere Construction</div>
                <div class="breakdown-row indent">
                    <span class="row-label">Building Dyson mass</span>
                    <span class="row-value negative">${this.safeFormatRate(dysonConstructionRate, 'kg')}</span>
                </div>
            </div>`;
        }
        
        // Structure construction consumption (estimated from construct allocation)
        let structureMetalConsumption = 0;
        for (const [zoneId, zoneProbes] of Object.entries(probesByZone)) {
            const probeCount = zoneProbes['probe'] || 0;
            const allocations = probeAllocationsByZone[zoneId] || {};
            const constructAlloc = allocations.construct || 0;
            structureMetalConsumption += probeCount * constructAlloc * PROBE_BUILD_RATE;
        }
        
        if (structureMetalConsumption > 0) {
            html += `<div class="breakdown-category"><div class="category-header">Structure Construction</div>
                <div class="breakdown-row indent">
                    <span class="row-label">Building structures</span>
                    <span class="row-value negative">${this.safeFormatRate(structureMetalConsumption, 'kg')}</span>
                </div>
            </div>`;
        }
        
        // Consumption total
        const totalConsumption = totals.metal_consumed_rate || 0;
        html += `<div class="breakdown-total">
            <span class="total-label">Total Consumption Rate</span>
            <span class="total-value negative">${this.safeFormatRate(totalConsumption, 'kg')}</span>
        </div></div>`;
        
        // ======= NET SECTION =======
        const netMetal = totalMiningRate - totalConsumption;
        const netClass = netMetal < 0 ? 'negative' : 'positive';
        html += `<div class="breakdown-net ${netClass}">
            <span class="net-label">Net Metal Rate</span>
            <span class="net-value">${this.safeFormatRate(netMetal, 'kg')}</span>
        </div>`;
        
        if (netMetal < 0) {
            html += `<div class="breakdown-warning">
                <span class="warning-icon">⚠</span>
                <span class="warning-text">Metal deficit! Consuming stored metal faster than mining.</span>
            </div>`;
        }
        
        container.innerHTML = html;
    }
    
    findBuilding(buildingId) {
        const allBuildings = this.buildings?.buildings || this.buildings || {};
        for (const category in allBuildings) {
            if (Array.isArray(allBuildings[category])) {
                const found = allBuildings[category].find(b => b.id === buildingId);
                if (found) return found;
            } else if (allBuildings[category] && typeof allBuildings[category] === 'object') {
                if (allBuildings[category][buildingId]) return allBuildings[category][buildingId];
            }
        }
        return null;
    }
    
    formatZoneName(zoneId) {
        if (zoneId === 'global') return 'Global';
        return zoneId.charAt(0).toUpperCase() + zoneId.slice(1).replace(/_/g, ' ');
    }

    initFull() {
        this.container.innerHTML = `
            <div class="resource-item" id="resource-energy-container" data-resource="energy">
                <div class="resource-label">Energy</div>
                <div class="resource-value" id="resource-energy">0</div>
                <div class="resource-rate" id="resource-energy-rate">+0 W/s</div>
            </div>
            <div class="resource-item" id="resource-intelligence-container" data-resource="intelligence">
                <div class="resource-label">Intelligence</div>
                <div class="resource-value" id="resource-intelligence">0</div>
                <div class="resource-rate" id="resource-intelligence-rate">+0 /s</div>
            </div>
            <div class="resource-item" id="resource-dexterity-container" data-resource="dexterity">
                <div class="resource-label">Dexterity</div>
                <div class="resource-value" id="resource-dexterity">0</div>
            </div>
            <div class="resource-item">
                <div class="resource-label">Dyson Sphere</div>
                <div class="resource-value" id="resource-dyson-progress">0%</div>
                <div class="resource-rate" id="resource-dyson-mass">0 / 0 kg</div>
                <div class="resource-rate" id="resource-probe-mass-full">Probe Mass: 0 kg</div>
                <div class="resource-rate" id="resource-structure-mass-full">Structure Mass: 0 kg</div>
            </div>
            <div class="zone-metal-section" id="zone-metal-section">
                <div class="section-title">Zone Metal Remaining</div>
                <div id="zone-metal-list"></div>
            </div>
        `;
    }

    formatNumber(value) {
        // Use scientific notation for all numbers
        if (value === 0) return '0';
        // Always use scientific notation for energy and large numbers
        if (value >= 1e3 || (value < 1 && value > 0)) {
            return value.toExponential(2);
        }
        return value.toFixed(2);
    }
    
    formatEnergy(value) {
        // Format energy values in watts with scientific notation
        if (value === 0) return '0 W';
        return `${value.toExponential(2)} W`;
    }
    
    formatMass(kg) {
        // Format mass with appropriate SI prefix
        if (!kg || kg < 0 || isNaN(kg) || !isFinite(kg)) return '0 kg';
        
        if (kg >= 1e24) return (kg / 1e24).toFixed(2) + ' Ykg';
        if (kg >= 1e21) return (kg / 1e21).toFixed(2) + ' Zkg';
        if (kg >= 1e18) return (kg / 1e18).toFixed(2) + ' Ekg';
        if (kg >= 1e15) return (kg / 1e15).toFixed(2) + ' Pkg';
        if (kg >= 1e12) return (kg / 1e12).toFixed(2) + ' Tkg';
        if (kg >= 1e9) return (kg / 1e9).toFixed(2) + ' Gkg';
        if (kg >= 1e6) return (kg / 1e6).toFixed(2) + ' Mkg';
        if (kg >= 1e3) return (kg / 1e3).toFixed(2) + ' t';
        return kg.toFixed(2) + ' kg';
    }

    formatFLOPS(flops) {
        // Format floating point operations per second (FLOPS) in scientific notation
        if (flops === 0 || !flops || isNaN(flops) || !isFinite(flops)) return '0 FLOPS';
        return flops.toExponential(2) + ' FLOPS';
    }

    /**
     * Safely format rate using FormatUtils if available, otherwise use simple formatting
     * @param {number} rate - Rate value
     * @param {string} unit - Unit name
     * @returns {string} Formatted rate string
     */
    safeFormatRate(rate, unit = '') {
        if (typeof FormatUtils !== 'undefined' && FormatUtils.formatRate) {
            return FormatUtils.formatRate(rate, unit);
        }
        // Fallback formatting
        if (!rate || rate === 0 || isNaN(rate)) {
            return `0 ${unit}/day`.trim();
        }
        return `${rate.toFixed(2)} ${unit}/day`.trim();
    }

    /**
     * Format research bonus as percentage
     * @param {number} bonus - Bonus value (0.1 = 10%)
     * @param {boolean} isReduction - If true, shows as reduction (negative)
     * @returns {string} Formatted bonus string
     */
    formatResearchBonus(bonus, isReduction = false) {
        if (bonus === 0) return '0%';
        const percentage = bonus * 100;
        const sign = isReduction ? '-' : '+';
        return `${sign}${percentage.toFixed(1)}%`;
    }

    /**
     * Get structure breakdown by type from gameState
     * @param {Object} gameState - Current game state
     * @param {string} effectType - Type of effect to look for (e.g., 'energy_production_per_second', 'metal_production_per_day')
     * @returns {Object} Structure breakdown {buildingId: {name, count, value, total}}
     */
    getStructureBreakdown(gameState, effectType) {
        const breakdown = {};
        const structuresByZone = gameState.structures_by_zone || {};
        const allBuildings = this.buildings?.buildings || this.buildings || {};
        
        for (const [zoneId, zoneStructures] of Object.entries(structuresByZone)) {
            for (const [buildingId, count] of Object.entries(zoneStructures)) {
                if (count <= 0) continue;
                
                let building = null;
                // Search through all building categories
                for (const category in allBuildings) {
                    if (Array.isArray(allBuildings[category])) {
                        building = allBuildings[category].find(b => b.id === buildingId);
                        if (building) break;
                    } else if (allBuildings[category] && typeof allBuildings[category] === 'object') {
                        // Handle nested structure
                        building = allBuildings[category][buildingId];
                        if (building) break;
                    }
                }
                
                if (building) {
                    const effects = building.effects || {};
                    const value = effects[effectType] || 0;
                    
                    if (value > 0) {
                        if (!breakdown[buildingId]) {
                            breakdown[buildingId] = {
                                name: building.name || buildingId,
                                count: 0,
                                value: value,
                                total: 0
                            };
                        }
                        breakdown[buildingId].count += count;
                        breakdown[buildingId].total += value * count;
                    }
                }
            }
        }
        
        return breakdown;
    }

    /**
     * Get research bonuses from gameState
     * @param {Object} gameState - Current game state
     * @param {string} resourceType - Resource type ('energy', 'intelligence', 'metal')
     * @param {string} bonusType - Type of bonus ('production' or 'consumption')
     * @returns {Array} Array of research bonus objects
     */
    getResearchBonuses(gameState, resourceType, bonusType) {
        const bonuses = [];
        const resourceBreakdowns = gameState.resource_breakdowns || {};
        const breakdown = resourceBreakdowns[resourceType];
        
        if (!breakdown) return bonuses;
        
        const section = breakdown[bonusType];
        if (section && section.upgrades) {
            return section.upgrades.filter(u => u.researched);
        }
        
        return bonuses;
    }

    update(gameState) {
        if (!gameState) return;
        
        // Change detection: Only update if relevant data has changed
        // Use efficient hash instead of JSON.stringify to avoid memory issues
        let hash = 0;
        hash = ((hash << 5) - hash) + (gameState.energy || 0);
        hash = ((hash << 5) - hash) + (gameState.intelligence || 0);
        hash = ((hash << 5) - hash) + (gameState.dexterity || 0);
        hash = ((hash << 5) - hash) + (gameState.dyson_sphere_progress || 0);
        hash = ((hash << 5) - hash) + (gameState.energy_production_rate || 0);
        hash = ((hash << 5) - hash) + (gameState.energy_consumption_rate || 0);
        
        // Hash probe counts efficiently - single probe type only
        const probesByZone = gameState.probes_by_zone || {};
        for (const [zoneId, zoneProbes] of Object.entries(probesByZone)) {
            if (zoneProbes && typeof zoneProbes === 'object') {
                // Single probe type: directly access 'probe' key
                const zoneCount = zoneProbes['probe'] || 0;
                hash = ((hash << 5) - hash) + zoneId.charCodeAt(0);
                hash = ((hash << 5) - hash) + zoneCount;
            }
        }
        
        const currentHash = hash.toString();
        
        if (currentHash === this.lastUpdateHash && this.lastUpdateHash !== null) {
            return; // No changes, skip update
        }
        this.lastUpdateHash = currentHash;
        
        // Store game state for tooltip calculations
        this.gameState = gameState;

        // Update values directly from game state
        const energy = gameState.energy || 0;
        const intelligence = gameState.intelligence || 0;
        const dexterity = gameState.dexterity || 0;
        const dysonProgress = gameState.dyson_sphere?.progress || 0;

        const energyEl = document.getElementById('resource-energy');
        const intelligenceEl = document.getElementById('resource-intelligence');
        const dexterityEl = document.getElementById('resource-dexterity');
        const dysonProgressEl = document.getElementById('resource-dyson-progress');

        // Update energy display (Net, Produced, Consumed)
        // Read from derived.totals (pre-calculated in worker)
        const derived = gameState.derived || {};
        const totals = derived.totals || {};
        const energyProduction = totals.energy_produced || 0;
        const energyConsumption = totals.energy_consumed || 0;
        const energyNet = totals.energy_net || 0;
        const energyNetEl = document.getElementById('resource-energy-net');
        const energyProducedEl = document.getElementById('resource-energy-produced');
        const energyConsumedEl = document.getElementById('resource-energy-consumed');
        if (energyNetEl) {
            energyNetEl.textContent = this.formatEnergy(energyNet);
            energyNetEl.style.color = energyNet < 0 ? '#8b0000' : (energyNet > 0 ? '#228B22' : 'inherit');
        }
        if (energyProducedEl) energyProducedEl.textContent = this.formatEnergy(energyProduction);
        if (energyConsumedEl) energyConsumedEl.textContent = this.formatEnergy(energyConsumption);

        // Update intelligence display (Net, Produced, Consumed)
        // Intelligence is consumed by active research projects
        const intelligenceProduction = totals.intelligence_produced || 0;
        const intelligenceConsumption = totals.intelligence_consumed || 0;
        const intelligenceNet = totals.intelligence_net || (intelligenceProduction - intelligenceConsumption);
        const intelligenceNetEl = document.getElementById('resource-intelligence-net');
        const intelligenceProducedEl = document.getElementById('resource-intelligence-produced');
        const intelligenceConsumedEl = document.getElementById('resource-intelligence-consumed');
        if (intelligenceNetEl) {
            intelligenceNetEl.textContent = this.formatFLOPS(intelligenceNet);
            intelligenceNetEl.style.color = intelligenceNet < 0 ? '#8b0000' : (intelligenceNet > 0 ? '#228B22' : 'inherit');
        }
        if (intelligenceProducedEl) intelligenceProducedEl.textContent = this.formatFLOPS(intelligenceProduction);
        if (intelligenceConsumedEl) intelligenceConsumedEl.textContent = this.formatFLOPS(intelligenceConsumption);

        // Update dexterity display (Net, Mining Rate, Consumption Rate)
        const metal = gameState.metal || 0;
        const metalProductionRate = totals.metal_mined_rate || 0; // kg/day from derived
        
        // Use actual metal consumption rate from derived (only counts metal actually consumed)
        const totalMetalConsumption = totals.metal_consumed_rate || 0; // kg/day from derived
        const metalNet = metalProductionRate - totalMetalConsumption;
        
        const dexterityNetEl = document.getElementById('resource-dexterity-net');
        const dexterityMiningEl = document.getElementById('resource-dexterity-mining');
        const dexterityConsumptionEl = document.getElementById('resource-dexterity-consumption');
        if (dexterityNetEl) {
            dexterityNetEl.textContent = FormatUtils.formatRate(metalNet, 'kg');
            dexterityNetEl.style.color = metalNet < 0 ? '#8b0000' : (metalNet > 0 ? '#228B22' : 'inherit');
        }
        if (dexterityMiningEl) {
            dexterityMiningEl.textContent = FormatUtils.formatRate(metalProductionRate, 'kg');
        }
        if (dexterityConsumptionEl) {
            dexterityConsumptionEl.textContent = FormatUtils.formatRate(totalMetalConsumption, 'kg');
        }

        const dysonMass = gameState.dyson_sphere?.mass || 0;
        const dysonTarget = gameState.dyson_sphere?.target_mass || 1;
        const dysonMassEl = document.getElementById('resource-dyson-mass');
        if (dysonProgressEl) dysonProgressEl.textContent = `${(dysonProgress * 100).toFixed(5)}%`;
        if (dysonMassEl) dysonMassEl.textContent = `${this.formatNumber(dysonMass)} kg`;
        
        // Read probe mass from derived.totals (pre-calculated in worker)
        const totalProbeMass = totals.probe_mass || 0;
        const probeMassEl = document.getElementById('resource-probe-mass');
        if (probeMassEl) probeMassEl.textContent = `${this.formatNumber(totalProbeMass)} kg`;
        
        // Read structure mass from derived.totals (pre-calculated in worker)
        const totalStructureMass = totals.structure_mass || 0;
        const structureMassEl = document.getElementById('resource-structure-mass');
        if (structureMassEl) structureMassEl.textContent = `${this.formatNumber(totalStructureMass)} kg`;
        
        // Update full mode displays if they exist
        const probeMassFullEl = document.getElementById('resource-probe-mass-full');
        if (probeMassFullEl) {
            const derived = gameState.derived || {};
            const totals = derived.totals || {};
            const totalProbeMass = totals.probe_mass || 0;
            probeMassFullEl.textContent = `Probe Mass: ${this.formatNumber(totalProbeMass)} kg`;
        }
        const structureMassFullEl = document.getElementById('resource-structure-mass-full');
        if (structureMassFullEl) structureMassFullEl.textContent = `Structure Mass: ${this.formatNumber(totalStructureMass)} kg`;
        

        // Handle slag and dyson mass (only in full mode) - removed, using compact mode only

        // Rate displays removed - now showing Net/Produced/Consumed separately

        // Update zone metal remaining
        this.updateZoneMetal(gameState);

        // Update warning messages
        this.updateWarnings(gameState);
        
        // Update breakdown panels if expanded
        if (this.isExpanded) {
            this.updateBreakdownPanels();
        }

        // Store current state for next rate calculation
        this.previousState = {
            energy,
            intelligence,
            dexterity
        };
    }
    
    updateWarnings(gameState) {
        if (!this.compactMode) return;
        
        const warningsEl = document.getElementById('resource-warnings');
        if (!warningsEl) return;
        
        const isEnergyLimited = gameState.is_energy_limited || false;
        const isMetalLimited = gameState.is_metal_limited || false;
        
        let warnings = [];
        if (isEnergyLimited) {
            warnings.push('<span class="resource-warning">ENERGY RATE LIMITED</span>');
        }
        if (isMetalLimited) {
            warnings.push('<span class="resource-warning">METAL RATE LIMITED</span>');
        }
        
        if (warnings.length > 0) {
            warningsEl.innerHTML = warnings.join(' • ');
            warningsEl.style.display = 'block';
        } else {
            warningsEl.style.display = 'none';
        }
    }

    updateZoneMetal(gameState) {
        const zoneMetalList = document.getElementById('zone-metal-list');
        if (!zoneMetalList) return;

        const derivedZones = gameState.derived?.zones || {};
        const zones = gameState.zones || {};
        
        if (Object.keys(derivedZones).length === 0 && Object.keys(zones).length === 0) return;

        let html = '';
        // Use derived zones if available, otherwise calculate from zone state
        const zonesToDisplay = Object.keys(derivedZones).length > 0 ? derivedZones : zones;
        
        Object.entries(zonesToDisplay).forEach(([zoneId, zoneData]) => {
            let metalRemaining = 0;
            let isDepleted = false;
            
            if (derivedZones[zoneId]) {
                // Use derived metal_remaining
                metalRemaining = derivedZones[zoneId].metal_remaining || 0;
                isDepleted = zones[zoneId]?.depleted || false;
            } else if (zones[zoneId]) {
                // Calculate from mass_remaining * metal_percentage
                const zoneState = zones[zoneId];
                const zoneInfo = this.orbitalMechanics?.getZone?.(zoneId);
                const metalPercentage = zoneInfo?.metal_percentage || 0;
                metalRemaining = (zoneState.mass_remaining || 0) * metalPercentage;
                isDepleted = zoneState.depleted || false;
            }
            
            const zoneClass = isDepleted ? 'zone-depleted' : '';
            html += `
                <div class="zone-metal-item ${zoneClass}">
                    <span class="zone-metal-name">${zoneId}:</span>
                    <span class="zone-metal-value">${this.formatNumber(metalRemaining)} kg</span>
                    ${isDepleted ? '<span class="zone-depleted-badge">Depleted</span>' : ''}
                </div>
            `;
        });

        zoneMetalList.innerHTML = html;
    }
}

