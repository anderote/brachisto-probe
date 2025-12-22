/** Manage panel - global activity modifiers to control/suppress economic activities */
class ManagePanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.gameState = null;
        this.activityModifiers = {
            mining: 100,           // Probe mining (harvest)
            replicating: 100,      // Probe replication
            dyson_constructing: 100, // Dyson sphere construction
            structures: 100,       // Structure building
            mining_buildings: 100, // Mining structure production
            factories: 100         // Factory production
        };
        this.init();
    }

    init() {
        // Load saved modifiers from localStorage
        const saved = localStorage.getItem('activityModifiers');
        if (saved) {
            try {
                this.activityModifiers = { ...this.activityModifiers, ...JSON.parse(saved) };
            } catch (e) {
                console.error('Failed to load saved activity modifiers:', e);
            }
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

    getActivityLabel(activityId) {
        const labels = {
            mining: 'Probe Mining',
            replicating: 'Probe Replication',
            dyson_constructing: 'Dyson Construction',
            structures: 'Structure Building',
            mining_buildings: 'Mining Buildings',
            factories: 'Factories'
        };
        return labels[activityId] || activityId;
    }

    getActivityDescription(activityId) {
        const descriptions = {
            mining: 'Controls probe harvesting/mining activities',
            replicating: 'Controls probe replication/building activities',
            dyson_constructing: 'Controls Dyson sphere construction',
            structures: 'Controls structure construction by probes',
            mining_buildings: 'Controls mining structure production',
            factories: 'Controls factory production rates'
        };
        return descriptions[activityId] || '';
    }

    async updateActivityModifier(activityId, value) {
        // Update local state
        this.activityModifiers[activityId] = value;
        
        // Save to localStorage
        localStorage.setItem('activityModifiers', JSON.stringify(this.activityModifiers));
        
        // Send to game engine
        if (typeof window !== 'undefined' && window.gameEngine && window.gameEngine.engine) {
            try {
                await window.gameEngine.engine.performAction('set_activity_modifier', {
                    activity_id: activityId,
                    modifier: value / 100.0  // Convert percentage to multiplier
                });
            } catch (e) {
                console.error('Failed to update activity modifier:', e);
            }
        }
    }

    render() {
        let html = '';

        html += '<div class="probe-section">';
        html += '<div class="probe-section-title">Activity Modifiers</div>';
        html += '<div style="font-size: 9px; color: rgba(255, 255, 255, 0.5); margin-bottom: 12px; font-style: italic;">Control global activity rates (0-100%). Set to 0% to completely suppress an activity.</div>';
        
        const activities = [
            'mining',
            'replicating',
            'dyson_constructing',
            'structures',
            'mining_buildings',
            'factories'
        ];

        activities.forEach(activityId => {
            const value = this.activityModifiers[activityId] || 100;
            const label = this.getActivityLabel(activityId);
            const description = this.getActivityDescription(activityId);
            
            html += '<div class="probe-stat-item">';
            html += `<div class="probe-stat-header">`;
            html += `<span class="probe-stat-label">${label}:</span>`;
            html += `<span class="probe-stat-base" data-activity-value="${activityId}">${value}%</span>`;
            html += `</div>`;
            if (description) {
                html += `<div style="font-size: 9px; color: rgba(255, 255, 255, 0.5); margin-top: 4px; padding-left: 8px;">${description}</div>`;
            }
            html += '<div style="margin-top: 8px; padding: 0 4px;">';
            html += `<input type="range" class="manage-activity-slider" data-activity="${activityId}" min="0" max="100" value="${value}" step="1" style="width: 100%;">`;
            html += '<div style="display: flex; justify-content: space-between; font-size: 8px; color: rgba(255, 255, 255, 0.4); margin-top: 4px;">';
            html += '<span>0%</span>';
            html += '<span>100%</span>';
            html += '</div>';
            html += '</div>';
            html += '</div>';
        });
        
        html += '</div>';

        // Show current rates section
        if (this.gameState) {
            html += '<div class="probe-section">';
            html += '<div class="probe-section-title">Current Rates</div>';
            
            // Mining rate (game state provides kg/day, convert to kg/s for formatRate)
            const metalProductionRate = this.gameState.metal_production_rate || 0; // kg/day
            const SECONDS_PER_DAY = Config.SECONDS_PER_DAY || 86400;
            const metalProductionRatePerSecond = metalProductionRate / SECONDS_PER_DAY;
            const SECONDS_PER_DAY = 86400;
            html += `<div class="probe-stat-item">`;
            html += `<div class="probe-stat-header">`;
            html += `<span class="probe-stat-label">Mining Rate:</span>`;
            html += `<span class="probe-stat-base">${FormatUtils.formatRate(metalProductionRatePerSecond, 'kg')}</span>`;
            html += `</div>`;
            html += `</div>`;
            
            // Probe production rate (game state provides probes/day, convert to probes/s for formatRate)
            const probeProductionRatePerDay = this.gameState.probe_production_rate || 0; // probes/day
            const probeProductionRatePerSecond = probeProductionRatePerDay / SECONDS_PER_DAY;
            html += `<div class="probe-stat-item">`;
            html += `<div class="probe-stat-header">`;
            html += `<span class="probe-stat-label">Probe Production:</span>`;
            html += `<span class="probe-stat-base">${FormatUtils.formatRate(probeProductionRatePerSecond, 'probes')}</span>`;
            html += `</div>`;
            html += `</div>`;
            
            // Dyson construction rate (game state provides kg/day, convert to kg/s for formatRate)
            const dysonConstructionRatePerDay = this.gameState.dyson_construction_rate || 0; // kg/day
            const dysonConstructionRatePerSecond = dysonConstructionRatePerDay / SECONDS_PER_DAY;
            html += `<div class="probe-stat-item">`;
            html += `<div class="probe-stat-header">`;
            html += `<span class="probe-stat-label">Dyson Construction:</span>`;
            html += `<span class="probe-stat-base">${FormatUtils.formatRate(dysonConstructionRatePerSecond, 'kg')}</span>`;
            html += `</div>`;
            html += `</div>`;
            
            html += '</div>';
        }

        this.container.innerHTML = html;

        // Set up slider event listeners
        this.container.querySelectorAll('.manage-activity-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const activityId = e.target.dataset.activity;
                const value = parseInt(e.target.value);
                const valueDisplay = this.container.querySelector(`[data-activity-value="${activityId}"]`);
                if (valueDisplay) {
                    valueDisplay.textContent = value + '%';
                }
                
                // Update modifier
                this.updateActivityModifier(activityId, value);
            });
        });
    }

    update(gameState) {
        this.gameState = gameState;
        this.render();
    }
}
