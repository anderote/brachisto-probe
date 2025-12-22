/** Probe panel - displays probe base stats, applied modifiers, and completed upgrades */
class ProbePanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.gameState = null;
        this.engine = null;
        this.init();
    }

    init() {
        // Initialize event listeners if needed
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

    formatTime(days) {
        // Use FormatUtils for consistent time formatting
        return FormatUtils.formatTime(days);
    }

    getSkillCategoryName(categoryId) {
        const names = {
            'propulsion_systems': 'Propulsion',
            'locomotion_systems': 'Locomotion',
            'acds': 'Attitude Control',
            'robotic_systems': 'Robotics',
            'computer_systems': 'Computing',
            'production_efficiency': 'Production Efficiency',
            'recycling_efficiency': 'Recycling Efficiency',
            'energy_collection': 'Energy Collection',
            'solar_concentrators': 'Solar Concentrators',
            'energy_storage': 'Energy Storage',
            'energy_transport': 'Energy Transport',
            'energy_matter_conversion': 'Energy-Matter Conversion',
            'dyson_swarm_construction': 'Dyson Construction'
        };
        return names[categoryId] || categoryId;
    }

    getProbeStat(statName) {
        /** Get probe stat with all skill modifiers applied */
        if (!this.engine) return 0;
        
        const stats = {
            'mining_rate': () => {
                const baseRate = Config.PROBE_HARVEST_RATE;
                const locomotion = this.engine.getSkillValue('locomotion_systems');
                const acds = this.engine.getSkillValue('acds');
                const robotics = this.engine.getSkillValue('robotic_systems');
                const production = this.engine.getSkillValue('production_efficiency');
                return baseRate * locomotion * acds * robotics * production;
            },
            'building_rate': () => {
                const baseRate = Config.PROBE_BUILD_RATE;
                const locomotion = this.engine.getSkillValue('locomotion_systems');
                const acds = this.engine.getSkillValue('acds');
                const robotics = this.engine.getSkillValue('robotic_systems');
                return baseRate * locomotion * acds * robotics;
            },
            'travel_speed': () => {
                // Travel speed is affected by propulsion Isp
                const isp = this.engine.getSkillValue('propulsion_systems');
                // Base speed scales with Isp (simplified)
                return 30.0 * (isp / 500.0); // Base 30 km/s at 500s Isp
            },
            'energy_consumption': () => {
                return Config.PROBE_ENERGY_CONSUMPTION;
            },
            'specific_impulse': () => {
                return this.engine.getSkillValue('propulsion_systems');
            },
            'compute_power': () => {
                return this.engine.getComputePower();
            },
            'dexterity': () => {
                // Base dexterity from probe data, modified by skills
                return 1.0; // Base value, will be enhanced
            }
        };
        
        const statFunc = stats[statName];
        return statFunc ? statFunc() : 0;
    }

    getBaseStat(statName) {
        /** Get base probe stat before modifiers */
        const baseStats = {
            'mining_rate': Config.PROBE_HARVEST_RATE,
            'building_rate': Config.PROBE_BUILD_RATE,
            'travel_speed': 30.0, // km/s
            'energy_consumption': Config.PROBE_ENERGY_CONSUMPTION,
            'specific_impulse': Config.BASE_PROPULSION_ISP || 500,
            'compute_power': 1.0,
            'dexterity': 1.0
        };
        return baseStats[statName] || 0;
    }

    getStatModifiers(statName) {
        /** Get list of skill modifiers affecting a stat */
        if (!this.engine) return [];
        
        const modifiers = [];
        
        if (statName === 'mining_rate') {
            modifiers.push({
                skill: 'locomotion_systems',
                value: this.engine.getSkillValue('locomotion_systems'),
                base: this.engine.getBaseSkillValue('locomotion_systems')
            });
            modifiers.push({
                skill: 'acds',
                value: this.engine.getSkillValue('acds'),
                base: this.engine.getBaseSkillValue('acds')
            });
            modifiers.push({
                skill: 'robotic_systems',
                value: this.engine.getSkillValue('robotic_systems'),
                base: this.engine.getBaseSkillValue('robotic_systems')
            });
            modifiers.push({
                skill: 'production_efficiency',
                value: this.engine.getSkillValue('production_efficiency'),
                base: this.engine.getBaseSkillValue('production_efficiency')
            });
        } else if (statName === 'building_rate') {
            modifiers.push({
                skill: 'locomotion_systems',
                value: this.engine.getSkillValue('locomotion_systems'),
                base: this.engine.getBaseSkillValue('locomotion_systems')
            });
            modifiers.push({
                skill: 'acds',
                value: this.engine.getSkillValue('acds'),
                base: this.engine.getBaseSkillValue('acds')
            });
            modifiers.push({
                skill: 'robotic_systems',
                value: this.engine.getSkillValue('robotic_systems'),
                base: this.engine.getBaseSkillValue('robotic_systems')
            });
        } else if (statName === 'specific_impulse') {
            modifiers.push({
                skill: 'propulsion_systems',
                value: this.engine.getSkillValue('propulsion_systems'),
                base: this.engine.getBaseSkillValue('propulsion_systems')
            });
        } else if (statName === 'compute_power') {
            modifiers.push({
                skill: 'computer_systems (processing)',
                value: this.engine.getSkillValue('computer_systems', 'processing'),
                base: this.engine.getBaseSkillValue('computer_systems', 'processing')
            });
            modifiers.push({
                skill: 'computer_systems (memory)',
                value: this.engine.getSkillValue('computer_systems', 'memory'),
                base: this.engine.getBaseSkillValue('computer_systems', 'memory')
            });
            modifiers.push({
                skill: 'computer_systems (interface)',
                value: this.engine.getSkillValue('computer_systems', 'interface'),
                base: this.engine.getBaseSkillValue('computer_systems', 'interface')
            });
            modifiers.push({
                skill: 'computer_systems (transmission)',
                value: this.engine.getSkillValue('computer_systems', 'transmission'),
                base: this.engine.getBaseSkillValue('computer_systems', 'transmission')
            });
        }
        
        return modifiers;
    }

    getCompletedUpgrades() {
        /** Get list of completed research upgrades grouped by skill category */
        if (!this.engine || !this.gameState) return {};
        
        const upgrades = {};
        const research = this.gameState.research || {};
        
        // Get research trees
        const researchTrees = window.gameDataLoader?.getAllResearchTrees() || {};
        
        for (const [treeId, treeData] of Object.entries(researchTrees)) {
            if (!(treeId in research)) continue;
            
            const completedTiers = [];
            
            // Check regular tiers
            if (treeData.tiers) {
                for (const tier of treeData.tiers) {
                    const tierProgress = research[treeId][tier.id];
                    if (tierProgress && tierProgress.tranches_completed >= tier.tranches) {
                        completedTiers.push({
                            id: tier.id,
                            name: tier.name,
                            total_bonus: tier.total_bonus
                        });
                    }
                }
            }
            
            // Check subcategories
            if (treeData.subcategories) {
                for (const [subcatId, subcatData] of Object.entries(treeData.subcategories)) {
                    if (subcatData.tiers) {
                        for (const tier of subcatData.tiers) {
                            const tierKey = subcatId + '_' + tier.id;
                            const tierProgress = research[treeId][tierKey];
                            if (tierProgress && tierProgress.tranches_completed >= tier.tranches) {
                                completedTiers.push({
                                    id: `${subcatId}_${tier.id}`,
                                    name: `${subcatId}: ${tier.name}`,
                                    total_bonus: tier.total_bonus
                                });
                            }
                        }
                    }
                }
            }
            
            if (completedTiers.length > 0) {
                upgrades[treeId] = {
                    name: treeData.name || this.getSkillCategoryName(treeId),
                    tiers: completedTiers
                };
            }
        }
        
        return upgrades;
    }

    render() {
        if (!this.gameState || !this.engine) {
            this.container.innerHTML = '<div>Loading...</div>';
            return;
        }

        let html = '';

        // Base Stats Section
        html += '<div class="probe-section">';
        html += '<div class="probe-section-title">Base Stats</div>';
        
        const stats = [
            { name: 'mining_rate', label: 'Mining Rate', unit: 'kg/day', format: 'number' },
            { name: 'building_rate', label: 'Building Rate', unit: 'kg/day', format: 'number' },
            { name: 'travel_speed', label: 'Travel Speed', unit: 'km/s', format: 'number' },
            { name: 'energy_consumption', label: 'Energy Consumption', unit: 'W', format: 'number' },
            { name: 'specific_impulse', label: 'Specific Impulse', unit: 's', format: 'number' },
            { name: 'compute_power', label: 'Compute Power', unit: 'multiplier', format: 'number' },
            { name: 'dexterity', label: 'Dexterity', unit: '', format: 'number' }
        ];
        
        stats.forEach(stat => {
            const baseValue = this.getBaseStat(stat.name);
            const effectiveValue = this.getProbeStat(stat.name);
            const modifiers = this.getStatModifiers(stat.name);
            
            html += '<div class="probe-stat-item">';
            html += `<div class="probe-stat-header">`;
            html += `<span class="probe-stat-label">${stat.label}:</span>`;
            html += `<span class="probe-stat-base">${this.formatNumber(baseValue)}</span>`;
            if (effectiveValue !== baseValue) {
                html += `<span class="probe-stat-effective"> → ${this.formatNumber(effectiveValue)} ${stat.unit}</span>`;
            } else {
                html += `<span class="probe-stat-effective"> ${stat.unit}</span>`;
            }
            html += `</div>`;
            
            // Show modifiers if any
            if (modifiers.length > 0) {
                html += '<div class="probe-stat-modifiers">';
                modifiers.forEach(mod => {
                    const bonus = ((mod.value / mod.base) - 1.0) * 100;
                    if (bonus > 0) {
                        html += `<div class="probe-modifier-item">`;
                        html += `<span class="probe-modifier-skill">${this.getSkillCategoryName(mod.skill)}:</span> `;
                        html += `<span class="probe-modifier-value">+${bonus.toFixed(1)}%</span>`;
                        html += `</div>`;
                    }
                });
                html += '</div>';
            }
            
            html += '</div>';
        });
        
        html += '</div>';

        // Applied Modifiers Section
        html += '<div class="probe-section">';
        html += '<div class="probe-section-title">Applied Modifiers</div>';
        html += '<div class="probe-modifiers-list">';
        
        const skillCategories = [
            'propulsion_systems', 'locomotion_systems', 'acds', 'robotic_systems',
            'computer_systems', 'production_efficiency', 'recycling_efficiency',
            'energy_collection', 'solar_concentrators', 'energy_storage',
            'energy_transport', 'energy_matter_conversion', 'dyson_swarm_construction'
        ];
        
        skillCategories.forEach(categoryId => {
            const baseValue = this.engine.getBaseSkillValue(categoryId);
            const effectiveValue = this.engine.getSkillValue(categoryId);
            const bonus = ((effectiveValue / baseValue) - 1.0) * 100;
            
            if (bonus > 0 || effectiveValue !== baseValue) {
                html += '<div class="probe-modifier-category">';
                html += `<div class="probe-modifier-category-name">${this.getSkillCategoryName(categoryId)}</div>`;
                html += `<div class="probe-modifier-category-value">`;
                html += `Base: ${this.formatNumber(baseValue)} → Effective: ${this.formatNumber(effectiveValue)}`;
                if (bonus > 0) {
                    html += ` <span class="probe-modifier-bonus">(+${bonus.toFixed(1)}%)</span>`;
                }
                html += `</div>`;
                html += '</div>';
            }
        });
        
        html += '</div>';
        html += '</div>';

        // Completed Upgrades Section
        html += '<div class="probe-section">';
        html += '<div class="probe-section-title">Completed Upgrades</div>';
        
        const upgrades = this.getCompletedUpgrades();
        
        if (Object.keys(upgrades).length === 0) {
            html += '<div class="probe-no-upgrades">No upgrades completed yet.</div>';
        } else {
            for (const [categoryId, categoryData] of Object.entries(upgrades)) {
                html += '<div class="probe-upgrade-category">';
                html += `<div class="probe-upgrade-category-name">${categoryData.name}</div>`;
                html += '<div class="probe-upgrade-tiers">';
                
                categoryData.tiers.forEach(tier => {
                    html += '<div class="probe-upgrade-tier">';
                    html += `<span class="probe-upgrade-tier-name">${tier.name}</span>`;
                    html += `<span class="probe-upgrade-tier-bonus">+${(tier.total_bonus * 100).toFixed(1)}%</span>`;
                    html += '</div>';
                });
                
                html += '</div>';
                html += '</div>';
            }
        }
        
        html += '</div>';

        this.container.innerHTML = html;
    }

    update(gameState) {
        this.gameState = gameState;
        
        // Get engine reference
        if (typeof window !== 'undefined' && window.gameEngine && window.gameEngine.engine) {
            this.engine = window.gameEngine.engine;
        }
        
        this.render();
    }
}

