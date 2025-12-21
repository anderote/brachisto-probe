/** Production panel for factory production controls */
class ProductionPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.gameState = null;
        this.buildings = null;
        this.orbitalZones = null;
        this.init();
        this.loadData();
    }

    async loadData() {
        try {
            const buildingsResponse = await fetch('/game_data/buildings.json');
            const buildingsData = await buildingsResponse.json();
            this.buildings = buildingsData.buildings;

            const zonesResponse = await fetch('/game_data/orbital_mechanics.json');
            const zonesData = await zonesResponse.json();
            this.orbitalZones = zonesData.orbital_zones;

            this.render();
        } catch (error) {
            console.error('Failed to load data:', error);
        }
    }

    init() {
        // Production panel initialization
    }

    render() {
        if (!this.container) return;

        if (!this.buildings || !this.orbitalZones) {
            this.container.innerHTML = '<div>Loading production controls...</div>';
            return;
        }

        let html = '<div class="production-section">';
        html += '<div class="section-title">Factory Production Controls</div>';
        html += '<div class="production-description">Adjust production levels for factories (0% = idle, 100% = max consumption)</div>';

        html += '<div id="production-factories-list"></div>';
        html += '</div>';

        this.container.innerHTML = html;

        this.renderFactories();
    }

    renderFactories() {
        const factoriesList = document.getElementById('production-factories-list');
        if (!factoriesList || !this.gameState) return;

        const structures = this.gameState.structures || {};
        const factoryProduction = this.gameState.factory_production || {};
        const factories = this.buildings.factories || [];

        let html = '';

        // Show factories (no longer zone-specific)
        let hasFactories = false;
        factories.forEach(factory => {
            const count = structures[factory.id] || 0;
            if (count > 0) {
                hasFactories = true;
                const production = factoryProduction[factory.id] || 0;
                
                html += '<div class="factory-production-item">';
                html += `<div class="factory-name">${factory.name} (${count})</div>`;
                html += '<div class="slider-group">';
                html += '<div class="slider-container">';
                html += `<input type="range" 
                               class="factory-production-slider" 
                               data-building="${factory.id}"
                               min="0" 
                               max="100" 
                               value="${production}" 
                               step="1">`;
                html += '</div>';
                html += `<div class="slider-value">${production}%</div>`;
                html += '</div>';
                html += '</div>';
            }
        });

        if (!hasFactories) {
            html += '<div class="no-structures">No factories built yet</div>';
        }

        factoriesList.innerHTML = html;

        // Set up slider event listeners
        document.querySelectorAll('.factory-production-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                const buildingId = e.target.dataset.building;
                
                // Update display
                e.target.parentElement.nextElementSibling.textContent = `${value}%`;
                
                // Update backend
                this.updateFactoryProduction(buildingId, value);
            });
        });
    }

    async updateFactoryProduction(buildingId, production) {
        try {
            await gameEngine.performAction('set_factory_production', {
                building_id: buildingId,
                production: production
            });
        } catch (error) {
            console.error('Failed to update factory production:', error);
        }
    }

    update(gameState) {
        this.gameState = gameState;
        this.renderFactories();
    }
}

