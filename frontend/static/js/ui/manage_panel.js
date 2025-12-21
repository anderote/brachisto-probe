/** Manage panel - category-level production rates and building stats */
class ManagePanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.buildings = null;
        this.gameState = null;
        this.researchData = null;
        this.categoryProductionRates = {
            factories: 100,
            mining: 100,
            energy: 100,
            transportation: 100
        };
        this.init();
        this.loadData();
    }

    async loadData() {
        try {
            // Load buildings
            const buildingsResponse = await fetch('/game_data/buildings.json');
            const buildingsData = await buildingsResponse.json();
            this.buildings = buildingsData.buildings || buildingsData;
            
            // Load research data (for modifiers)
            try {
                const additionalResponse = await fetch('/game_data/additional_research_trees.json');
                const additionalData = await additionalResponse.json();
                this.researchData = additionalData.additional_research_trees || {};
            } catch (e) {
                this.researchData = {};
            }
            
            this.render();
        } catch (error) {
            console.error('Failed to load data:', error);
            this.container.innerHTML = `<div>Error loading data: ${error.message}</div>`;
        }
    }

    init() {
        // Initialize event listeners if needed
    }

    formatNumber(value) {
        if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
        if (value >= 1e3) return (value / 1e3).toFixed(2) + 'k';
        return value.toFixed(2);
    }

    getBuildingCategory(buildingId) {
        if (!this.buildings) return null;
        
        // Check each category
        const categories = ['factories', 'mining', 'energy', 'transportation'];
        for (const category of categories) {
            const items = this.buildings[category] || [];
            if (items.find(b => b.id === buildingId)) {
                return category;
            }
        }
        return null;
    }

    calculateResearchModifiers(building) {
        // This would calculate research bonuses applied to the building
        // For now, return empty object - will be enhanced with actual research calculations
        const modifiers = {
            production_efficiency: 0,
            energy_efficiency: 0,
            cost_reduction: 0
        };
        
        // TODO: Calculate actual research modifiers from gameState.research
        return modifiers;
    }

    calculateNetPerformance(building, count, categoryRate) {
        // Calculate net performance metrics
        const effects = building.effects || {};
        const baseConsumption = effects.energy_consumption_per_second || 0;
        const effectiveRate = categoryRate / 100.0;
        
        // Energy cost per structure
        const energyCostPerSecond = baseConsumption * effectiveRate;
        
        // For factories, calculate energy per probe produced
        let energyPerProbe = null;
        if (building.effects && building.effects.probe_production_rate_multiplier) {
            // This is a simplified calculation
            // Real calculation would need probe production rate data
            energyPerProbe = baseConsumption / (building.effects.probe_production_rate_multiplier || 1);
        }
        
        return {
            energyCostPerSecond,
            energyPerProbe,
            effectiveRate
        };
    }

    render() {
        if (!this.buildings) {
            this.container.innerHTML = '<div>Loading...</div>';
            return;
        }

        let html = '';

        // Category production rate controls
        html += '<div class="manage-section">';
        html += '<div class="manage-section-title">Production Rates (Category Default)</div>';
        html += '<div class="manage-section-description">Set default utilization rate for all structures in each category (0-100%)</div>';
        
        const categories = [
            { id: 'factories', name: 'Factories' },
            { id: 'mining', name: 'Mining' },
            { id: 'energy', name: 'Energy' },
            { id: 'transportation', name: 'Transportation' }
        ];

        categories.forEach(category => {
            const rate = this.categoryProductionRates[category.id] || 100;
            html += '<div class="manage-category-control">';
            html += `<div class="manage-category-label">${category.name}</div>`;
            html += '<div class="manage-slider-container">';
            html += `<input type="range" class="manage-category-slider" data-category="${category.id}" min="0" max="100" value="${rate}" step="1">`;
            html += `<span class="manage-slider-value">${rate}%</span>`;
            html += '</div>';
            html += '</div>';
        });
        
        html += '</div>';

        // Building stats and modifiers
        html += '<div class="manage-section">';
        html += '<div class="manage-section-title">Building Stats & Research Modifiers</div>';
        
        // Group buildings by category
        const structures = this.gameState?.structures || {};
        const factoryProduction = this.gameState?.factory_production || {};
        
        categories.forEach(category => {
            const categoryBuildings = this.buildings[category.id] || [];
            const categoryRate = this.categoryProductionRates[category.id] || 100;
            
            // Check if we have any buildings in this category
            const hasBuildings = categoryBuildings.some(b => (structures[b.id] || 0) > 0);
            if (!hasBuildings) return;
            
            html += `<div class="manage-building-category">`;
            html += `<div class="manage-building-category-title">${category.name}</div>`;
            
            categoryBuildings.forEach(building => {
                const count = structures[building.id] || 0;
                if (count === 0) return;
                
                const production = factoryProduction[building.id] || categoryRate;
                const performance = this.calculateNetPerformance(building, count, production);
                const modifiers = this.calculateResearchModifiers(building);
                
                html += '<div class="manage-building-item">';
                html += `<div class="manage-building-name">${building.name} (${count})</div>`;
                
                // Current production rate
                html += '<div class="manage-building-stat">';
                html += `<span class="manage-stat-label">Utilization:</span> `;
                html += `<span class="manage-stat-value">${production}%</span>`;
                html += '</div>';
                
                // Energy consumption
                if (performance.energyCostPerSecond > 0) {
                    html += '<div class="manage-building-stat">';
                    html += `<span class="manage-stat-label">Energy:</span> `;
                    html += `<span class="manage-stat-value">${this.formatNumber(performance.energyCostPerSecond * count)}/s</span>`;
                    html += '</div>';
                }
                
                // Energy per probe (for factories)
                if (performance.energyPerProbe !== null) {
                    html += '<div class="manage-building-stat">';
                    html += `<span class="manage-stat-label">Energy/Probe:</span> `;
                    html += `<span class="manage-stat-value">${this.formatNumber(performance.energyPerProbe)}</span>`;
                    html += '</div>';
                }
                
                // Research modifiers (placeholder for now)
                if (modifiers.production_efficiency > 0 || modifiers.energy_efficiency > 0) {
                    html += '<div class="manage-building-modifiers">';
                    html += '<div class="manage-modifier-label">Research Modifiers:</div>';
                    if (modifiers.production_efficiency > 0) {
                        html += `<div class="manage-modifier-item">Production: +${(modifiers.production_efficiency * 100).toFixed(1)}%</div>`;
                    }
                    if (modifiers.energy_efficiency > 0) {
                        html += `<div class="manage-modifier-item">Energy Efficiency: +${(modifiers.energy_efficiency * 100).toFixed(1)}%</div>`;
                    }
                    html += '</div>';
                }
                
                html += '</div>';
            });
            
            html += '</div>';
        });
        
        html += '</div>';

        this.container.innerHTML = html;

        // Set up slider event listeners
        this.container.querySelectorAll('.manage-category-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const category = e.target.dataset.category;
                const value = parseInt(e.target.value);
                const valueSpan = e.target.parentElement.querySelector('.manage-slider-value');
                valueSpan.textContent = value + '%';
                
                // Update local state
                this.categoryProductionRates[category] = value;
                
                // Send to backend
                this.updateCategoryProductionRate(category, value);
            });
        });
    }

    async updateCategoryProductionRate(category, rate) {
        try {
            // Update all buildings in this category
            const categoryBuildings = this.buildings[category] || [];
            const structures = this.gameState?.structures || {};
            
            for (const building of categoryBuildings) {
                const count = structures[building.id] || 0;
                if (count > 0) {
                    await gameEngine.performAction('set_factory_production', {
                        building_id: building.id,
                        production: rate
                    });
                }
            }
        } catch (error) {
            console.error('Failed to update category production rate:', error);
        }
    }

    update(gameState) {
        this.gameState = gameState;
        
        // Update category rates from factory production if available
        if (gameState.factory_production) {
            const structures = gameState.structures || {};
            const factoryProduction = gameState.factory_production;
            
            // Find average production rate for each category
            const categories = ['factories', 'mining', 'energy', 'transportation'];
            categories.forEach(category => {
                const categoryBuildings = this.buildings?.[category] || [];
                let totalRate = 0;
                let count = 0;
                
                categoryBuildings.forEach(building => {
                    if ((structures[building.id] || 0) > 0 && factoryProduction[building.id] !== undefined) {
                        totalRate += factoryProduction[building.id];
                        count++;
                    }
                });
                
                if (count > 0) {
                    this.categoryProductionRates[category] = Math.round(totalRate / count);
                }
            });
        }
        
        this.render();
    }
}

