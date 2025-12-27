/** Probe Stats Panel - Comprehensive probe statistics with base values and research multipliers */
class ProbePanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.gameState = null;
        this.engine = null;
        this.collapsedCategories = new Set(); // All categories expanded by default
        this.orbitalMechanics = null;
        this.transferSystem = null;
        this.economicRules = null;
        this.buildings = null;
        this.dataLoaded = false;
        this.init();
    }

    async init() {
        // Load economic rules and buildings data
        await this.loadData();
    }
    
    async loadData() {
        try {
            // Load economic rules
            const rulesResponse = await fetch('/game_data/economic_rules.json');
            if (rulesResponse.ok) {
                this.economicRules = await rulesResponse.json();
                console.log('[ProbePanel] Economic rules loaded');
            }
            
            // Load buildings data
            const buildingsResponse = await fetch('/game_data/buildings.json');
            if (buildingsResponse.ok) {
                this.buildings = await buildingsResponse.json();
                console.log('[ProbePanel] Buildings data loaded');
            }
            
            this.dataLoaded = true;
            
            // Re-render if we have game state
            if (this.gameState) {
                this.render();
            }
        } catch (error) {
            console.warn('[ProbePanel] Failed to load data:', error);
        }
    }

    formatNumber(value, decimals = 2) {
        if (value >= 1e24) return (value / 1e24).toFixed(decimals) + 'Y';
        if (value >= 1e21) return (value / 1e21).toFixed(decimals) + 'Z';
        if (value >= 1e18) return (value / 1e18).toFixed(decimals) + 'E';
        if (value >= 1e15) return (value / 1e15).toFixed(decimals) + 'P';
        if (value >= 1e12) return (value / 1e12).toFixed(decimals) + 'T';
        if (value >= 1e9) return (value / 1e9).toFixed(decimals) + 'G';
        if (value >= 1e6) return (value / 1e6).toFixed(decimals) + 'M';
        if (value >= 1e3) return (value / 1e3).toFixed(decimals) + 'k';
        return value.toFixed(decimals);
    }

    formatDeltaV(dv) {
        // Format delta-v in m/s
        if (dv >= 1e6) return (dv / 1e6).toFixed(2) + ' Mm/s';
        if (dv >= 1e3) return (dv / 1e3).toFixed(2) + ' km/s';
        return dv.toFixed(2) + ' m/s';
    }

    getSkillValue(skillName) {
        if (!this.engine) {
            // Fallback to gameState.skills
            const skills = this.gameState?.skills || {};
            return skills[skillName] || 1.0;
        }
        
        try {
            return this.engine.getSkillValue(skillName);
        } catch (e) {
            // Fallback
            const skills = this.gameState?.skills || {};
            return skills[skillName] || 1.0;
        }
    }

    getBaseSkillValue(skillName) {
        if (!this.engine) {
            // Base values from SKILL_DEFINITIONS
            if (typeof SKILL_DEFINITIONS !== 'undefined') {
                const skillDef = SKILL_DEFINITIONS[skillName];
                if (skillDef) return skillDef.baseValue || 1.0;
            }
            return 1.0;
        }
        
        try {
            return this.engine.getBaseSkillValue(skillName);
        } catch (e) {
            return 1.0;
        }
    }

    getSkillDisplayName(skillName) {
        if (typeof SKILL_DEFINITIONS !== 'undefined') {
            const skillDef = SKILL_DEFINITIONS[skillName];
            if (skillDef) return skillDef.displayName || skillName;
        }
        // Fallback to formatted name
        return skillName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    /**
     * Resolve skill name aliases from economic_rules.json to canonical skill names
     * @param {string} skillName - Skill name from economic rules
     * @returns {string} Canonical skill name
     */
    resolveSkillAlias(skillName) {
        // Map economic_rules skill names to SKILL_DEFINITIONS skill names
        const aliasMap = {
            'energy_storage': 'battery_density',
            'thermal_management': 'radiator',
            'robotics': 'manipulation',
            'energy': 'solar_pv', // energy skill maps to solar_pv
            'robotic': 'manipulation',
            'energy_collection': 'solar_pv',
            'materials_science': 'materials'
        };
        return aliasMap[skillName] || skillName;
    }

    /**
     * Calculate upgrade factor from a skill coefficients object dynamically
     * Reads all skills from the coefficients and calculates the weighted bonus
     * @param {Object} coefficients - Skill coefficients from economic_rules.json
     * @returns {Object} { upgradeFactor, modifiers[] }
     */
    calculateUpgradeFactorFromCoefficients(coefficients) {
        const modifiers = [];
        let totalBonus = 0;

        // Iterate over all skills defined in the coefficients
        for (const [rawSkillName, weight] of Object.entries(coefficients)) {
            // Skip description field
            if (rawSkillName === 'description') continue;
            
            // Resolve skill alias to canonical name
            const skillName = this.resolveSkillAlias(rawSkillName);
            
            // Get skill value (defaults to 1.0 if not found)
            const skillValue = this.getSkillValue(skillName);
            const baseValue = this.getBaseSkillValue(skillName);
            
            // Calculate contribution: weight * (skill - 1)
            const skillBonus = skillValue - 1.0;
            const contribution = weight * skillBonus;
            totalBonus += contribution;
            
            // Add to modifiers list
            modifiers.push({
                name: this.getSkillDisplayName(skillName),
                skillName: skillName,
                rawSkillName: rawSkillName,
                value: skillValue,
                base: baseValue,
                weight: weight
            });
        }

        const upgradeFactor = 1.0 + totalBonus;
        return { upgradeFactor, modifiers };
    }

    toggleCategoryCollapse(categoryId) {
        if (this.collapsedCategories.has(categoryId)) {
            this.collapsedCategories.delete(categoryId);
        } else {
            this.collapsedCategories.add(categoryId);
        }
        this.render();
    }

    calculateMiningRate() {
        // Get base mining rate from economic rules or Config fallback
        const baseFromRules = this.economicRules?.probe?.base_mining_rate_kg_per_day ?? Config.PROBE_HARVEST_RATE ?? 100;
        
        // Add mining rate bonus from starting skill points
        const miningRateBonus = this.gameState?.skill_bonuses?.mining_rate_bonus || 0;
        const baseRate = baseFromRules + miningRateBonus;
        
        // Get weights from economic_rules.json skill_coefficients.probe_mining
        const coefficients = this.economicRules?.skill_coefficients?.probe_mining || {};
        const weights = {
            manipulation: coefficients.manipulation ?? 1.0,
            strength: coefficients.strength ?? 0.6,
            sensors: coefficients.sensors ?? 0.4,
            locomotion: coefficients.locomotion ?? 0.3
        };
        
        // Get skill values
        const manipulation = this.getSkillValue('manipulation') || this.getSkillValue('robotic') || 1.0;
        const strength = this.getSkillValue('strength') || 1.0;
        const sensors = this.getSkillValue('sensors') || 1.0;
        const locomotion = this.getSkillValue('locomotion') || 1.0;
        
        // Calculate upgrade factor using weighted sum formula
        const bonus = 
            weights.manipulation * (manipulation - 1.0) +
            weights.strength * (strength - 1.0) +
            weights.sensors * (sensors - 1.0) +
            weights.locomotion * (locomotion - 1.0);
        const upgradeFactor = 1.0 + bonus;
        
        return {
            base: baseRate,
            effective: baseRate * upgradeFactor,
            upgradeFactor: upgradeFactor,
            miningRateBonus,  // Include bonus for display
            modifiers: [
                { name: 'Manipulation', value: manipulation, base: this.getBaseSkillValue('manipulation') || this.getBaseSkillValue('robotic') || 1.0, weight: weights.manipulation },
                { name: 'Strength', value: strength, base: this.getBaseSkillValue('strength'), weight: weights.strength },
                { name: 'Sensors', value: sensors, base: this.getBaseSkillValue('sensors'), weight: weights.sensors },
                { name: 'Locomotion', value: locomotion, base: this.getBaseSkillValue('locomotion'), weight: weights.locomotion }
            ]
        };
    }

    calculateBuildingRate() {
        // Get base building rate from economic rules or Config fallback
        const baseFromRules = this.economicRules?.probe?.base_build_rate_kg_per_day ?? Config.PROBE_BUILD_RATE ?? 20;
        
        // Add replication rate bonus from starting skill points
        const replicationRateBonus = this.gameState?.skill_bonuses?.replication_rate_bonus || 0;
        const baseRate = baseFromRules + replicationRateBonus;
        
        // Get weights from economic_rules.json skill_coefficients.probe_building
        const coefficients = this.economicRules?.skill_coefficients?.probe_building || {};
        const weights = {
            production: coefficients.production ?? 1.0,
            manipulation: coefficients.manipulation ?? 1.0,
            strength: coefficients.strength ?? 0.4,
            materials: coefficients.materials ?? 0.2
        };
        
        // Get skill values
        const production = this.getSkillValue('production') || 1.0;
        const manipulation = this.getSkillValue('manipulation') || this.getSkillValue('robotic') || 1.0;
        const strength = this.getSkillValue('strength') || 1.0;
        const materials = this.getSkillValue('materials') || 1.0;
        
        // Calculate upgrade factor using weighted sum formula
        const bonus = 
            weights.production * (production - 1.0) +
            weights.manipulation * (manipulation - 1.0) +
            weights.strength * (strength - 1.0) +
            weights.materials * (materials - 1.0);
        const upgradeFactor = 1.0 + bonus;
        
        return {
            base: baseRate,
            effective: baseRate * upgradeFactor,
            upgradeFactor: upgradeFactor,
            replicationRateBonus,  // Include bonus for display
            modifiers: [
                { name: 'Production', value: production, base: this.getBaseSkillValue('production'), weight: weights.production },
                { name: 'Manipulation', value: manipulation, base: this.getBaseSkillValue('manipulation') || this.getBaseSkillValue('robotic') || 1.0, weight: weights.manipulation },
                { name: 'Strength', value: strength, base: this.getBaseSkillValue('strength'), weight: weights.strength },
                { name: 'Materials', value: materials, base: this.getBaseSkillValue('materials'), weight: weights.materials }
            ]
        };
    }

    calculateDeltaV() {
        // Get base Isp from economic rules or Config fallback
        const baseIsp = this.economicRules?.propulsion?.base_isp_seconds ?? Config.BASE_PROPULSION_ISP ?? 500;
        const propulsionSkill = this.getSkillValue('propulsion');
        const effectiveIsp = baseIsp * propulsionSkill;
        
        // Calculate delta-v using Tsiolkovsky rocket equation
        // Δv = Isp * g0 * ln(m0/mf)
        // For probes, assume mass ratio of 2 (half propellant, half payload)
        const g0 = 9.80665; // m/s²
        const massRatio = 2.0; // m0/mf
        const deltaV = effectiveIsp * g0 * Math.log(massRatio);
        
        return {
            baseIsp: baseIsp,
            effectiveIsp: effectiveIsp,
            deltaV: deltaV,
            propulsionSkill: propulsionSkill,
            basePropulsionSkill: this.getBaseSkillValue('propulsion')
        };
    }
    
    /**
     * Calculate probe delta-v capacity with detailed skill breakdown
     * Based on economic_rules.json probe_delta_v_capacity coefficients
     * Dynamically reads ALL skills from economic_rules
     */
    calculateProbeDeltaVCapacity() {
        // Get base delta-v from economic rules
        const baseFromRules = this.economicRules?.probe_transfer?.base_delta_v_km_s || 7.5;
        
        // Add probe delta-v bonus from starting skill points
        const probeDvBonus = this.gameState?.skill_bonuses?.probe_dv_bonus || 0;
        const baseDeltaVKmS = baseFromRules + probeDvBonus;
        
        // Get coefficients from economic_rules.json and calculate dynamically
        const coefficients = this.economicRules?.skill_coefficients?.probe_delta_v_capacity || {};
        const { upgradeFactor, modifiers } = this.calculateUpgradeFactorFromCoefficients(coefficients);
        
        const effectiveDeltaVKmS = baseDeltaVKmS * upgradeFactor;
        
        return {
            baseDeltaVKmS,
            effectiveDeltaVKmS,
            upgradeFactor,
            modifiers,
            probeDvBonus  // Include bonus for display
        };
    }
    
    /**
     * Calculate transfer speed with detailed skill breakdown
     * Based on economic_rules.json transfer_speed coefficients
     * Dynamically reads ALL skills from economic_rules
     */
    calculateTransferSpeed() {
        // Get coefficients from economic_rules.json and calculate dynamically
        const coefficients = this.economicRules?.skill_coefficients?.transfer_speed || {};
        const { upgradeFactor, modifiers } = this.calculateUpgradeFactorFromCoefficients(coefficients);
        
        return {
            speedFactor: upgradeFactor,
            modifiers
        };
    }

    calculateMassDriverPerformance() {
        // Get base values from buildings data (mass_driver)
        const massDriverBuilding = this.buildings?.mass_driver || {};
        const baseMuzzleVelocityKmS = massDriverBuilding.base_muzzle_velocity_km_s ?? 3.0;
        const basePowerMW = massDriverBuilding.power_draw_mw ?? 100;
        const baseEfficiency = massDriverBuilding.energy_efficiency ?? 0.4;
        
        // Get seconds per day from economic rules
        const secondsPerDay = this.economicRules?.time?.seconds_per_day ?? 86400;
        
        // Muzzle Velocity (delta-v capacity): dynamically read ALL skills from economic_rules
        const muzzleCoeffs = this.economicRules?.skill_coefficients?.mass_driver_muzzle_velocity || {};
        const muzzleResult = this.calculateUpgradeFactorFromCoefficients(muzzleCoeffs);
        const muzzleVelocityFactor = muzzleResult.upgradeFactor;
        const effectiveMuzzleVelocityKmS = baseMuzzleVelocityKmS * muzzleVelocityFactor;
        
        // Capacity (kg/day): dynamically read ALL skills from economic_rules
        const capacityCoeffs = this.economicRules?.skill_coefficients?.mass_driver_capacity || {};
        const capacityResult = this.calculateUpgradeFactorFromCoefficients(capacityCoeffs);
        const capacityFactor = capacityResult.upgradeFactor;
        
        // Power Draw: dynamically read ALL skills from economic_rules
        const powerCoeffs = this.economicRules?.skill_coefficients?.mass_driver_power || {};
        const powerResult = this.calculateUpgradeFactorFromCoefficients(powerCoeffs);
        const powerFactor = powerResult.upgradeFactor;
        const effectivePowerMW = basePowerMW * powerFactor;
        
        // Efficiency: dynamically read ALL skills from economic_rules
        const efficiencyCoeffs = this.economicRules?.skill_coefficients?.mass_driver_efficiency || {};
        const efficiencyResult = this.calculateUpgradeFactorFromCoefficients(efficiencyCoeffs);
        const efficiencyFactor = efficiencyResult.upgradeFactor;
        const effectiveEfficiency = Math.min(1.0, baseEfficiency * efficiencyFactor);
        
        // Calculate throughput based on physics: throughput = (power * efficiency * time) / (0.5 * v^2 per kg)
        // Use base muzzle velocity as reference delta-v
        const referenceDeltaVKmS = baseMuzzleVelocityKmS;
        const netPowerW = effectivePowerMW * 1e6 * effectiveEfficiency;
        const energyPerDayJ = netPowerW * secondsPerDay;
        const deltaVMS = referenceDeltaVKmS * 1000;
        const energyPerKgJ = 0.5 * deltaVMS * deltaVMS;
        const throughputKgPerDay = energyPerDayJ / energyPerKgJ;
        
        return {
            // Muzzle Velocity
            baseMuzzleVelocityKmS,
            effectiveMuzzleVelocityKmS,
            muzzleVelocityFactor,
            muzzleVelocityModifiers: muzzleResult.modifiers,
            
            // Capacity
            capacityFactor,
            throughputKgPerDay,
            capacityModifiers: capacityResult.modifiers,
            
            // Power
            basePowerMW,
            effectivePowerMW,
            powerFactor,
            powerModifiers: powerResult.modifiers,
            
            // Efficiency
            baseEfficiency,
            effectiveEfficiency,
            efficiencyFactor,
            efficiencyModifiers: efficiencyResult.modifiers,
            
            // Legacy compatibility
            speedMultiplier: 0.5, // Fixed 50% time with mass drivers
            speedBoost: 2.0,
            capacityPerDriver: throughputKgPerDay
        };
    }

    calculateComputePower() {
        // Base PFLOPs per probe from economic_rules or Config fallback
        const basePFLOPS = this.economicRules?.probe?.base_compute_pflops ?? Config.PROBE_BASE_COMPUTE_PFLOPS ?? 100;
        
        // Get compute-related skills
        const cpu = this.getSkillValue('cpu');
        const gpu = this.getSkillValue('gpu');
        const interconnect = this.getSkillValue('interconnect');
        const ioBandwidth = this.getSkillValue('io_bandwidth');
        
        // Get weights from economic_rules.json skill_coefficients.probe_compute
        const coefficients = this.economicRules?.skill_coefficients?.probe_compute || {};
        const weights = {
            cpu: coefficients.cpu ?? 1.0,
            gpu: coefficients.gpu ?? 1.0,
            interconnect: coefficients.interconnect ?? 0.6,
            io_bandwidth: coefficients.io_bandwidth ?? 0.4
        };
        
        // Weighted sum formula: factor = 1 + Σ(weight_i * (skill_i - 1))
        const bonus = 
            weights.cpu * (cpu - 1.0) +
            weights.gpu * (gpu - 1.0) +
            weights.interconnect * (interconnect - 1.0) +
            weights.io_bandwidth * (ioBandwidth - 1.0);
        
        const upgradeFactor = 1.0 + bonus;
        const effectivePFLOPS = basePFLOPS * upgradeFactor;
        
        return {
            basePFLOPS: basePFLOPS,
            effectivePFLOPS: effectivePFLOPS,
            upgradeFactor: upgradeFactor,
            modifiers: [
                { name: 'CPU Processing', skillName: 'cpu', value: cpu, base: this.getBaseSkillValue('cpu'), weight: weights.cpu },
                { name: 'GPU Computing', skillName: 'gpu', value: gpu, base: this.getBaseSkillValue('gpu'), weight: weights.gpu },
                { name: 'Interconnect', skillName: 'interconnect', value: interconnect, base: this.getBaseSkillValue('interconnect'), weight: weights.interconnect },
                { name: 'I/O Bandwidth', skillName: 'io_bandwidth', value: ioBandwidth, base: this.getBaseSkillValue('io_bandwidth'), weight: weights.io_bandwidth }
            ]
        };
    }

    /**
     * Calculate probe energy production with skill-based upgrades
     * Uses the same formula as EnergyCalculator.calculateProbeEnergyProduction()
     */
    calculateProbeEnergyProduction() {
        // Get base energy production from economic rules
        const baseProduction = this.economicRules?.probe?.base_energy_production_w ?? 100000; // 100 kW per probe
        
        // Get weights from economic_rules.json skill_coefficients.probe_energy_production
        const coefficients = this.economicRules?.skill_coefficients?.probe_energy_production || {};
        const weights = {
            solar_pv: coefficients.solar_pv ?? 1.0,
            energy_converter: coefficients.energy_converter ?? 0.6,
            radiator: coefficients.radiator ?? 0.4
        };
        
        // Get skills for energy production
        const solarPv = this.getSkillValue('solar_pv') || this.getSkillValue('energy_collection') || 1.0;
        const energyConverter = this.getSkillValue('energy_converter') || 1.0;
        const radiator = this.getSkillValue('radiator') || 1.0;
        
        // Calculate upgrade factor using weighted sum formula (matching EnergyCalculator)
        // Formula: factor = 1 + Σ(weight_i * (skill_i - 1))
        const bonus = 
            weights.solar_pv * (solarPv - 1.0) +
            weights.energy_converter * (energyConverter - 1.0) +
            weights.radiator * (radiator - 1.0);
        const upgradeFactor = 1.0 + bonus;
        
        const effectiveProduction = baseProduction * upgradeFactor;
        
        return {
            base: baseProduction,
            effective: effectiveProduction,
            upgradeFactor: upgradeFactor,
            modifiers: [
                { name: 'Solar PV', value: solarPv, base: this.getBaseSkillValue('solar_pv') || this.getBaseSkillValue('energy_collection') || 1.0, weight: weights.solar_pv },
                { name: 'Energy Converter', value: energyConverter, base: this.getBaseSkillValue('energy_converter'), weight: weights.energy_converter },
                { name: 'Radiator', value: radiator, base: this.getBaseSkillValue('radiator'), weight: weights.radiator }
            ]
        };
    }

    /**
     * Calculate probe energy consumption with skill-based reductions
     * Uses the same formula as EnergyCalculator.getEffectiveEnergyCost()
     */
    calculateProbeEnergyConsumption() {
        // Get base consumption values directly from economic rules (with fallbacks)
        const baseMiningCost = this.economicRules?.probe?.base_energy_cost_mining_w ?? 500000; // 500 kW per mining probe
        const baseRecycleCost = this.economicRules?.probe?.base_energy_cost_recycle_slag_w ?? 300000; // 300 kW per slag recycling probe
        
        // Get weights from economic_rules.json skill_coefficients.probe_energy_consumption (actually energy_consumption_reduction)
        const coefficients = this.economicRules?.skill_coefficients?.energy_consumption_reduction || 
                            this.economicRules?.skill_coefficients?.probe_energy_consumption || {};
        const weights = {
            energy_transport: coefficients.energy_transport ?? 1.0,
            radiator: coefficients.radiator ?? 0.6,
            heat_pump: coefficients.heat_pump ?? 0.4
        };
        
        // Get skills for energy consumption reduction
        const energyTransport = this.getSkillValue('energy_transport') || 1.0;
        const radiator = this.getSkillValue('radiator') || 1.0;
        const heatPump = this.getSkillValue('heat_pump') || 1.0;
        
        // Calculate upgrade factor using weighted sum formula (matching EnergyCalculator)
        // Formula: factor = 1 + Σ(weight_i * (skill_i - 1))
        // Higher skills = higher factor = lower energy consumption (we divide by this factor)
        const bonus = 
            weights.energy_transport * (energyTransport - 1.0) +
            weights.radiator * (radiator - 1.0) +
            weights.heat_pump * (heatPump - 1.0);
        const consumptionReductionFactor = 1.0 + bonus;
        
        // Effective costs are reduced by the upgrade factor (divide by factor > 1 to decrease consumption)
        const effectiveMiningCost = baseMiningCost / consumptionReductionFactor;
        const effectiveRecycleCost = baseRecycleCost / consumptionReductionFactor;
        
        return {
            mining: {
                base: baseMiningCost,
                effective: effectiveMiningCost,
                reductionFactor: consumptionReductionFactor
            },
            recycle: {
                base: baseRecycleCost,
                effective: effectiveRecycleCost,
                reductionFactor: consumptionReductionFactor
            },
            modifiers: [
                { name: 'Energy Transport', value: energyTransport, base: this.getBaseSkillValue('energy_transport'), weight: weights.energy_transport },
                { name: 'Radiator', value: radiator, base: this.getBaseSkillValue('radiator'), weight: weights.radiator },
                { name: 'Heat Pump', value: heatPump, base: this.getBaseSkillValue('heat_pump'), weight: weights.heat_pump }
            ]
        };
    }

    renderStatRow(label, baseValue, effectiveValue, unit, modifiers = []) {
        let html = '<div class="probe-summary-breakdown-item" style="margin-bottom: 6px;">';
        html += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">${label}:</span> `;
        html += `<span class="probe-summary-breakdown-count" style="font-size: 10px;">`;
        html += `${this.formatNumber(baseValue)}`;
        if (effectiveValue !== baseValue) {
            html += ` → <span style="color: rgba(100, 200, 100, 0.9);">${this.formatNumber(effectiveValue)}</span>`;
        }
        html += ` ${unit}`;
        html += `</span>`;
        html += '</div>';
        
        if (modifiers.length > 0) {
            html += '<div style="margin-left: 12px; margin-top: 2px; margin-bottom: 4px;">';
            modifiers.forEach(mod => {
                const bonus = ((mod.value / mod.base) - 1.0) * 100;
                if (bonus > 0) {
                    html += `<div style="font-size: 9px; color: rgba(255, 255, 255, 0.6);">`;
                    html += `  ${mod.name}: <span style="color: rgba(100, 200, 100, 0.8);">+${bonus.toFixed(1)}%</span>`;
                    html += `</div>`;
                }
            });
            html += '</div>';
        }
        
        return html;
    }

    renderCategorySection(categoryId, title, content) {
        const isCollapsed = this.collapsedCategories.has(categoryId);
        let html = '<div class="collapsible-category" style="margin-bottom: 8px;">';
        html += `<div class="collapsible-category-header${isCollapsed ? ' collapsed' : ''}" `;
        html += `onclick="probePanel.toggleCategoryCollapse('${categoryId}')" `;
        html += `style="cursor: pointer; padding: 6px 8px; background: rgba(74, 158, 255, 0.1); border-radius: 3px; margin-bottom: 4px;">`;
        html += `<span class="collapsible-category-title" style="font-size: 11px; font-weight: 600; color: rgba(255, 255, 255, 0.9);">${title}</span>`;
        html += `<span style="float: right; color: rgba(255, 255, 255, 0.5); font-size: 9px;">${isCollapsed ? '▶' : '▼'}</span>`;
        html += '</div>';
        html += `<div class="collapsible-category-content${isCollapsed ? ' collapsed' : ''}" `;
        html += `style="${isCollapsed ? 'display: none;' : ''} padding: 4px 8px;">`;
        html += content;
        html += '</div>';
        html += '</div>';
        return html;
    }

    render() {
        if (!this.container) return;
        
        if (!this.gameState) {
            this.container.innerHTML = '<div style="padding: 20px; color: rgba(255, 255, 255, 0.5); font-size: 10px;">Loading probe stats...</div>';
            return;
        }

        let html = '<div class="probe-summary-panel">';
        html += '<div class="probe-summary-title" style="margin-bottom: 8px;">Probe Statistics</div>';
        html += '<div style="font-size: 9px; color: rgba(255, 255, 255, 0.5); padding: 4px 8px; margin-bottom: 8px;">Base values and research multipliers</div>';

        // Section 1: Core Probe Stats
        const miningRate = this.calculateMiningRate();
        const buildingRate = this.calculateBuildingRate();
        const energyProduction = this.calculateProbeEnergyProduction();
        const energyConsumption = this.calculateProbeEnergyConsumption();
        
        let coreStatsContent = '';
        coreStatsContent += this.renderStatRow('Mining Rate', miningRate.base, miningRate.effective, 'kg/day', miningRate.modifiers);
        coreStatsContent += this.renderStatRow('Building Rate', buildingRate.base, buildingRate.effective, 'kg/day', buildingRate.modifiers);
        coreStatsContent += this.renderStatRow('Energy Production', energyProduction.base, energyProduction.effective, 'W/probe', energyProduction.modifiers);
        coreStatsContent += this.renderStatRow('Energy Consumption (Mining)', energyConsumption.mining.base, energyConsumption.mining.effective, 'W/probe', energyConsumption.modifiers);
        coreStatsContent += this.renderStatRow('Energy Consumption (Recycle)', energyConsumption.recycle.base, energyConsumption.recycle.effective, 'W/probe', []);
        
        // Show net energy per probe when mining
        const netEnergyWhenMining = energyProduction.effective - energyConsumption.mining.effective;
        coreStatsContent += '<div class="probe-summary-breakdown-item" style="margin-top: 6px; margin-bottom: 6px;">';
        coreStatsContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">Net Energy (when mining):</span> `;
        coreStatsContent += `<span class="probe-summary-breakdown-count" style="font-size: 10px; color: ${netEnergyWhenMining >= 0 ? 'rgba(100, 200, 100, 0.9)' : 'rgba(255, 100, 100, 0.9)'};">`;
        coreStatsContent += `${netEnergyWhenMining >= 0 ? '+' : ''}${this.formatNumber(netEnergyWhenMining)} W/probe`;
        coreStatsContent += `</span>`;
        coreStatsContent += '</div>';
        
        html += this.renderCategorySection('core', 'Core Probe Stats', coreStatsContent);

        // Section 2: Propulsion and Delta-V
        const deltaVCapacity = this.calculateProbeDeltaVCapacity();
        const transferSpeed = this.calculateTransferSpeed();
        let propulsionContent = '';
        
        // Delta-V Capacity subsection
        propulsionContent += '<div style="font-size: 9px; color: rgba(74, 158, 255, 0.9); margin-bottom: 6px; font-weight: 600;">Delta-V Capacity</div>';
        propulsionContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
        propulsionContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">Base Capacity:</span> `;
        propulsionContent += `<span class="probe-summary-breakdown-count" style="font-size: 10px;">${deltaVCapacity.baseDeltaVKmS.toFixed(2)} km/s</span>`;
        propulsionContent += '</div>';
        propulsionContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
        propulsionContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">Effective Capacity:</span> `;
        propulsionContent += `<span class="probe-summary-breakdown-count" style="font-size: 10px; color: rgba(100, 200, 100, 0.9);">${deltaVCapacity.effectiveDeltaVKmS.toFixed(2)} km/s</span>`;
        if (deltaVCapacity.upgradeFactor > 1.0) {
            propulsionContent += ` <span style="font-size: 9px; color: rgba(100, 200, 100, 0.7);">(${deltaVCapacity.upgradeFactor.toFixed(2)}x)</span>`;
        }
        propulsionContent += '</div>';
        
        // Skill breakdown for delta-v capacity
        propulsionContent += '<div style="margin-left: 12px; margin-top: 4px; margin-bottom: 8px;">';
        propulsionContent += `<div style="font-size: 9px; color: rgba(255, 255, 255, 0.5); margin-bottom: 2px;">Skill Modifiers (weight × bonus):</div>`;
        deltaVCapacity.modifiers.forEach(mod => {
            const skillBonus = mod.value - 1.0;
            const contribution = mod.weight * skillBonus;
            const bonusPercent = skillBonus * 100;
            const contributionPercent = contribution * 100;
            propulsionContent += `<div style="font-size: 9px; color: rgba(255, 255, 255, 0.6); margin-left: 8px;">`;
            propulsionContent += `${mod.name}: `;
            if (bonusPercent > 0) {
                propulsionContent += `<span style="color: rgba(100, 200, 100, 0.8);">+${bonusPercent.toFixed(1)}%</span>`;
                propulsionContent += ` × ${mod.weight.toFixed(1)} = `;
                propulsionContent += `<span style="color: rgba(100, 200, 100, 0.8);">+${contributionPercent.toFixed(1)}%</span>`;
            } else {
                propulsionContent += `<span style="color: rgba(255, 255, 255, 0.4);">+0%</span>`;
            }
            propulsionContent += `</div>`;
        });
        propulsionContent += '</div>';
        
        // Transfer Speed subsection
        propulsionContent += '<div style="font-size: 9px; color: rgba(74, 158, 255, 0.9); margin-bottom: 6px; margin-top: 8px; font-weight: 600;">Transfer Speed</div>';
        propulsionContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
        propulsionContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">Speed Multiplier:</span> `;
        propulsionContent += `<span class="probe-summary-breakdown-count" style="font-size: 10px; color: ${transferSpeed.speedFactor > 1.0 ? 'rgba(100, 200, 100, 0.9)' : 'rgba(255, 255, 255, 0.7)'};">`;
        propulsionContent += `${transferSpeed.speedFactor.toFixed(2)}x`;
        propulsionContent += `</span>`;
        propulsionContent += '</div>';
        
        // Skill breakdown for transfer speed
        propulsionContent += '<div style="margin-left: 12px; margin-top: 4px; margin-bottom: 8px;">';
        propulsionContent += `<div style="font-size: 9px; color: rgba(255, 255, 255, 0.5); margin-bottom: 2px;">Skill Modifiers (weight × bonus):</div>`;
        transferSpeed.modifiers.forEach(mod => {
            const skillBonus = mod.value - 1.0;
            const contribution = mod.weight * skillBonus;
            const bonusPercent = skillBonus * 100;
            const contributionPercent = contribution * 100;
            propulsionContent += `<div style="font-size: 9px; color: rgba(255, 255, 255, 0.6); margin-left: 8px;">`;
            propulsionContent += `${mod.name}: `;
            if (bonusPercent > 0) {
                propulsionContent += `<span style="color: rgba(100, 200, 100, 0.8);">+${bonusPercent.toFixed(1)}%</span>`;
                propulsionContent += ` × ${mod.weight.toFixed(1)} = `;
                propulsionContent += `<span style="color: rgba(100, 200, 100, 0.8);">+${contributionPercent.toFixed(1)}%</span>`;
            } else {
                propulsionContent += `<span style="color: rgba(255, 255, 255, 0.4);">+0%</span>`;
            }
            propulsionContent += `</div>`;
        });
        propulsionContent += '</div>';
        
        html += this.renderCategorySection('propulsion', 'Propulsion & Delta-V', propulsionContent);

        // Section 3: Mass Driver Performance
        const massDriverData = this.calculateMassDriverPerformance();
        let massDriverContent = '';
        
        // Helper function for rendering skill modifier breakdown
        const renderModifierBreakdown = (modifiers, label) => {
            let content = `<div style="font-size: 9px; color: rgba(255, 255, 255, 0.5); margin-bottom: 2px;">${label}:</div>`;
            modifiers.forEach(mod => {
                const skillBonus = mod.value - 1.0;
                const contribution = mod.weight * skillBonus;
                const bonusPercent = skillBonus * 100;
                const contributionPercent = contribution * 100;
                content += `<div style="font-size: 9px; color: rgba(255, 255, 255, 0.6); margin-left: 8px;">`;
                content += `${mod.name}: `;
                if (bonusPercent > 0) {
                    content += `<span style="color: rgba(100, 200, 100, 0.8);">+${bonusPercent.toFixed(1)}%</span>`;
                    content += ` × ${mod.weight.toFixed(1)} = `;
                    content += `<span style="color: rgba(100, 200, 100, 0.8);">+${contributionPercent.toFixed(1)}%</span>`;
                } else {
                    content += `<span style="color: rgba(255, 255, 255, 0.4);">+0%</span>`;
                }
                content += `</div>`;
            });
            return content;
        };
        
        // Muzzle Velocity (Delta-V Capacity) subsection
        massDriverContent += '<div style="font-size: 9px; color: rgba(74, 158, 255, 0.9); margin-bottom: 6px; font-weight: 600;">Muzzle Velocity (Delta-V Capacity)</div>';
        massDriverContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
        massDriverContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">Base Velocity:</span> `;
        massDriverContent += `<span class="probe-summary-breakdown-count" style="font-size: 10px;">${massDriverData.baseMuzzleVelocityKmS.toFixed(2)} km/s</span>`;
        massDriverContent += '</div>';
        massDriverContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
        massDriverContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">Effective Velocity:</span> `;
        massDriverContent += `<span class="probe-summary-breakdown-count" style="font-size: 10px; color: rgba(100, 200, 100, 0.9);">${massDriverData.effectiveMuzzleVelocityKmS.toFixed(2)} km/s</span>`;
        if (massDriverData.muzzleVelocityFactor > 1.0) {
            massDriverContent += ` <span style="font-size: 9px; color: rgba(100, 200, 100, 0.7);">(${massDriverData.muzzleVelocityFactor.toFixed(2)}x)</span>`;
        }
        massDriverContent += '</div>';
        massDriverContent += '<div style="margin-left: 12px; margin-top: 4px; margin-bottom: 8px;">';
        massDriverContent += renderModifierBreakdown(massDriverData.muzzleVelocityModifiers, 'Skill Modifiers (weight × bonus)');
        massDriverContent += '</div>';
        
        // Throughput (Capacity) subsection
        massDriverContent += '<div style="font-size: 9px; color: rgba(74, 158, 255, 0.9); margin-bottom: 6px; margin-top: 8px; font-weight: 600;">Throughput Capacity</div>';
        massDriverContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
        massDriverContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">Per Driver (@ 3 km/s ΔV):</span> `;
        massDriverContent += `<span class="probe-summary-breakdown-count" style="font-size: 10px; color: rgba(100, 200, 100, 0.9);">${this.formatNumber(massDriverData.throughputKgPerDay)} kg/day</span>`;
        massDriverContent += '</div>';
        massDriverContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
        massDriverContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">Capacity Factor:</span> `;
        massDriverContent += `<span class="probe-summary-breakdown-count" style="font-size: 10px; color: ${massDriverData.capacityFactor > 1.0 ? 'rgba(100, 200, 100, 0.9)' : 'rgba(255, 255, 255, 0.7)'};">`;
        massDriverContent += `${massDriverData.capacityFactor.toFixed(2)}x`;
        massDriverContent += `</span>`;
        massDriverContent += '</div>';
        massDriverContent += '<div style="margin-left: 12px; margin-top: 4px; margin-bottom: 8px;">';
        massDriverContent += renderModifierBreakdown(massDriverData.capacityModifiers, 'Skill Modifiers (weight × bonus)');
        massDriverContent += '</div>';
        
        // Power subsection
        massDriverContent += '<div style="font-size: 9px; color: rgba(74, 158, 255, 0.9); margin-bottom: 6px; margin-top: 8px; font-weight: 600;">Power Draw</div>';
        massDriverContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
        massDriverContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">Base Power:</span> `;
        massDriverContent += `<span class="probe-summary-breakdown-count" style="font-size: 10px;">${massDriverData.basePowerMW} MW</span>`;
        massDriverContent += '</div>';
        massDriverContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
        massDriverContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">Effective Power:</span> `;
        massDriverContent += `<span class="probe-summary-breakdown-count" style="font-size: 10px; color: rgba(100, 200, 100, 0.9);">${massDriverData.effectivePowerMW.toFixed(1)} MW</span>`;
        if (massDriverData.powerFactor > 1.0) {
            massDriverContent += ` <span style="font-size: 9px; color: rgba(100, 200, 100, 0.7);">(${massDriverData.powerFactor.toFixed(2)}x)</span>`;
        }
        massDriverContent += '</div>';
        massDriverContent += '<div style="margin-left: 12px; margin-top: 4px; margin-bottom: 8px;">';
        massDriverContent += renderModifierBreakdown(massDriverData.powerModifiers, 'Skill Modifiers (weight × bonus)');
        massDriverContent += '</div>';
        
        // Efficiency subsection
        massDriverContent += '<div style="font-size: 9px; color: rgba(74, 158, 255, 0.9); margin-bottom: 6px; margin-top: 8px; font-weight: 600;">Energy Efficiency</div>';
        massDriverContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
        massDriverContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">Base Efficiency:</span> `;
        massDriverContent += `<span class="probe-summary-breakdown-count" style="font-size: 10px;">${(massDriverData.baseEfficiency * 100).toFixed(0)}%</span>`;
        massDriverContent += '</div>';
        massDriverContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
        massDriverContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">Effective Efficiency:</span> `;
        massDriverContent += `<span class="probe-summary-breakdown-count" style="font-size: 10px; color: rgba(100, 200, 100, 0.9);">${(massDriverData.effectiveEfficiency * 100).toFixed(1)}%</span>`;
        if (massDriverData.efficiencyFactor > 1.0) {
            massDriverContent += ` <span style="font-size: 9px; color: rgba(100, 200, 100, 0.7);">(${massDriverData.efficiencyFactor.toFixed(2)}x)</span>`;
        }
        massDriverContent += '</div>';
        massDriverContent += '<div style="margin-left: 12px; margin-top: 4px; margin-bottom: 8px;">';
        massDriverContent += renderModifierBreakdown(massDriverData.efficiencyModifiers, 'Skill Modifiers (weight × bonus)');
        massDriverContent += '</div>';
        
        // Transfer Speed (fixed benefit from mass drivers)
        massDriverContent += '<div style="font-size: 9px; color: rgba(74, 158, 255, 0.9); margin-bottom: 6px; margin-top: 8px; font-weight: 600;">Transfer Time Reduction</div>';
        massDriverContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
        massDriverContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">Speed Boost:</span> `;
        massDriverContent += `<span class="probe-summary-breakdown-count" style="font-size: 10px; color: rgba(100, 200, 100, 0.9);">2x faster (50% travel time)</span>`;
        massDriverContent += '</div>';
        massDriverContent += '<div style="margin-left: 12px; margin-top: 4px;">';
        massDriverContent += `<div style="font-size: 9px; color: rgba(255, 255, 255, 0.5);">Fixed bonus when mass driver present in zone</div>`;
        massDriverContent += '</div>';
        
        html += this.renderCategorySection('mass_driver', 'Mass Driver Performance', massDriverContent);

        // Section 4: Onboard Compute Power
        const computeData = this.calculateComputePower();
        let computeContent = '';
        
        // Header description
        computeContent += '<div style="font-size: 9px; color: rgba(255, 255, 255, 0.6); margin-bottom: 8px;">';
        computeContent += 'Each probe has onboard compute capacity for autonomous operation and research contribution.';
        computeContent += '</div>';
        
        // Base Capacity subsection
        computeContent += '<div style="font-size: 9px; color: rgba(74, 158, 255, 0.9); margin-bottom: 6px; font-weight: 600;">Per-Probe Compute</div>';
        computeContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
        computeContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">Base Capacity:</span> `;
        computeContent += `<span class="probe-summary-breakdown-count" style="font-size: 10px;">${this.formatNumber(computeData.basePFLOPS)} PFLOPs</span>`;
        computeContent += '</div>';
        computeContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
        computeContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">Effective Capacity:</span> `;
        computeContent += `<span class="probe-summary-breakdown-count" style="font-size: 10px; color: rgba(100, 200, 100, 0.9);">${this.formatNumber(computeData.effectivePFLOPS)} PFLOPs</span>`;
        if (computeData.upgradeFactor > 1.0) {
            computeContent += ` <span style="font-size: 9px; color: rgba(100, 200, 100, 0.7);">(${computeData.upgradeFactor.toFixed(2)}x)</span>`;
        }
        computeContent += '</div>';
        
        // Skill breakdown
        computeContent += '<div style="margin-left: 12px; margin-top: 4px; margin-bottom: 8px;">';
        computeContent += `<div style="font-size: 9px; color: rgba(255, 255, 255, 0.5); margin-bottom: 2px;">Skill Modifiers (weight × bonus):</div>`;
        computeData.modifiers.forEach(mod => {
            const skillBonus = mod.value - 1.0;
            const contribution = mod.weight * skillBonus;
            const bonusPercent = skillBonus * 100;
            const contributionPercent = contribution * 100;
            computeContent += `<div style="font-size: 9px; color: rgba(255, 255, 255, 0.6); margin-left: 8px;">`;
            computeContent += `${mod.name}: `;
            if (bonusPercent > 0) {
                computeContent += `<span style="color: rgba(100, 200, 100, 0.8);">+${bonusPercent.toFixed(1)}%</span>`;
                computeContent += ` × ${mod.weight.toFixed(1)} = `;
                computeContent += `<span style="color: rgba(100, 200, 100, 0.8);">+${contributionPercent.toFixed(1)}%</span>`;
            } else {
                computeContent += `<span style="color: rgba(255, 255, 255, 0.4);">+0%</span>`;
            }
            computeContent += `</div>`;
        });
        computeContent += '</div>';
        
        // Fleet Total subsection
        const totalProbes = this.gameState?.total_probes || 0;
        if (totalProbes > 0) {
            const fleetTotalPFLOPS = computeData.effectivePFLOPS * totalProbes;
            computeContent += '<div style="font-size: 9px; color: rgba(74, 158, 255, 0.9); margin-bottom: 6px; margin-top: 8px; font-weight: 600;">Fleet Total Compute</div>';
            computeContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
            computeContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">Active Probes:</span> `;
            computeContent += `<span class="probe-summary-breakdown-count" style="font-size: 10px;">${this.formatNumber(totalProbes, 0)}</span>`;
            computeContent += '</div>';
            computeContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
            computeContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;">Total Fleet Compute:</span> `;
            computeContent += `<span class="probe-summary-breakdown-count" style="font-size: 10px; color: rgba(100, 200, 100, 0.9);">${this.formatNumber(fleetTotalPFLOPS)} PFLOPs</span>`;
            computeContent += '</div>';
            
            // Show equivalent in EFLOPS if large enough
            if (fleetTotalPFLOPS >= 1000) {
                const fleetTotalEFLOPS = fleetTotalPFLOPS / 1000;
                computeContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
                computeContent += `<span class="probe-summary-breakdown-label" style="font-size: 10px;"></span> `;
                computeContent += `<span class="probe-summary-breakdown-count" style="font-size: 9px; color: rgba(255, 255, 255, 0.5);">= ${this.formatNumber(fleetTotalEFLOPS)} EFLOPs</span>`;
                computeContent += '</div>';
            }
        }
        
        html += this.renderCategorySection('compute', 'Onboard Compute', computeContent);

        // Section 5: Skill Summary by Category
        if (typeof SKILL_DEFINITIONS !== 'undefined' && typeof SKILLS_BY_CATEGORY !== 'undefined') {
            const categories = ['dexterity', 'intelligence', 'energy'];
            categories.forEach(category => {
                const skills = SKILLS_BY_CATEGORY[category] || [];
                if (skills.length === 0) return;
                
                let skillsContent = '';
                skills.forEach(skillName => {
                    const skillValue = this.getSkillValue(skillName);
                    const baseValue = this.getBaseSkillValue(skillName);
                    const bonus = ((skillValue / baseValue) - 1.0) * 100;
                    const displayName = this.getSkillDisplayName(skillName);
                    
                    skillsContent += '<div class="probe-summary-breakdown-item" style="margin-bottom: 4px;">';
                    skillsContent += `<span class="probe-summary-breakdown-label" style="font-size: 9px;">${displayName}:</span> `;
                    skillsContent += `<span class="probe-summary-breakdown-count" style="font-size: 9px;">`;
                    skillsContent += `${this.formatNumber(skillValue, 3)}`;
                    if (bonus > 0) {
                        skillsContent += ` <span style="color: rgba(100, 200, 100, 0.8);">(+${bonus.toFixed(1)}%)</span>`;
                    }
                    skillsContent += `</span>`;
                    skillsContent += '</div>';
                });
                
                const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1);
                html += this.renderCategorySection(`skills_${category}`, categoryTitle, skillsContent);
            });
        }

        html += '</div>';
        this.container.innerHTML = html;
    }

    update(gameState) {
        this.gameState = gameState;
        
        // Get engine reference
        if (typeof window !== 'undefined' && window.gameEngine) {
            if (window.gameEngine.engine) {
                this.engine = window.gameEngine.engine;
            } else if (window.gameEngine.techTree) {
                this.engine = window.gameEngine.techTree;
            }
        }
        
        // Get orbital mechanics and transfer system references if available
        if (window.gameEngine && window.gameEngine.engine) {
            if (window.gameEngine.engine.orbitalMechanics) {
                this.orbitalMechanics = window.gameEngine.engine.orbitalMechanics;
            }
            if (window.gameEngine.engine.transferSystem) {
                this.transferSystem = window.gameEngine.engine.transferSystem;
            }
        }
        
        this.render();
    }
}

// Expose globally for onclick handlers
if (typeof window !== 'undefined') {
    window.probePanel = null; // Will be set in main.js
}
