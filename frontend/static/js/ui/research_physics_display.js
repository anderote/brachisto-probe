/**
 * Research Physics Display Integration
 *
 * Extends the research panel to show real physics values from the new tech tree system.
 * Displays values like "380s ISP (3.73 km/s exhaust) [10.8 km/s probe Δv]"
 */

class ResearchPhysicsDisplay {
    constructor() {
        this.techPhysics = null;
        this.initialized = false;

        // Map old tree IDs to new physics tree IDs
        this.treeMapping = {
            // Propulsion-related trees
            'propulsion': 'propulsion',
            'propulsion_systems': 'propulsion',

            // EM-related trees
            'transmission': 'electromagnetics',
            'conversion': 'electromagnetics',

            // Thermal (maps to conversion in old system)
            'radiator': 'thermal',
            'heat_pump': 'thermal',

            // Materials
            'materials': 'materials',
            'materials_science': 'materials',
            'structures': 'materials',

            // Power/Energy
            'generation': 'power',
            'storage_density': 'power',
            'energy_collection': 'power',
            'solar_pv': 'power',

            // Autonomy/Intelligence
            'architecture': 'autonomy',
            'processor': 'autonomy',
            'memory': 'autonomy',
            'sensors': 'autonomy',
            'robotics': 'autonomy'
        };
    }

    /**
     * Initialize the physics display system
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Create TechPhysics instance if available
            if (typeof TechPhysics !== 'undefined') {
                this.techPhysics = new TechPhysics();
                await this.techPhysics.loadAllTrees();
                this.initialized = true;
                console.log('ResearchPhysicsDisplay initialized');
            } else {
                console.warn('TechPhysics not available - physics display disabled');
            }
        } catch (error) {
            console.error('Failed to initialize physics display:', error);
        }
    }

    /**
     * Update physics tiers from game state research progress
     */
    updateFromGameState(gameState) {
        if (!this.techPhysics || !gameState) return;

        const researchState = gameState.tech_tree?.research_state || gameState.research || {};

        // Calculate effective tier for each physics tree based on completed research
        for (const [physicsTree, _] of Object.entries(this.techPhysics.trees)) {
            if (!this.techPhysics.trees[physicsTree]) continue;

            // Find all old trees that map to this physics tree
            const relatedOldTrees = Object.entries(this.treeMapping)
                .filter(([_, pt]) => pt === physicsTree)
                .map(([ot, _]) => ot);

            // Calculate average progress across related trees
            let totalProgress = 0;
            let treeCount = 0;

            for (const oldTree of relatedOldTrees) {
                const treeState = researchState[oldTree];
                if (treeState) {
                    // Count completed tiers
                    let completedTiers = 0;
                    for (const [tierId, tierState] of Object.entries(treeState)) {
                        if (tierState.tranches_completed >= 10) { // Assuming 10 tranches per tier
                            completedTiers++;
                        }
                    }
                    totalProgress += completedTiers;
                    treeCount++;
                }
            }

            // Set physics tier (minimum 1)
            const avgTier = treeCount > 0 ? Math.max(1, Math.floor(totalProgress / Math.max(1, treeCount)) + 1) : 1;
            this.techPhysics.setTier(physicsTree, avgTier);
        }
    }

    /**
     * Get physics display string for a research tree
     */
    getPhysicsDisplay(oldTreeId) {
        if (!this.techPhysics || !this.initialized) return null;

        const physicsTree = this.treeMapping[oldTreeId];
        if (!physicsTree) return null;

        try {
            return this.techPhysics.formatForDisplay(physicsTree);
        } catch (error) {
            console.warn('Error getting physics display:', error);
            return null;
        }
    }

    /**
     * Get current tier info for a physics tree
     */
    getCurrentPhysicsInfo(oldTreeId) {
        if (!this.techPhysics || !this.initialized) return null;

        const physicsTree = this.treeMapping[oldTreeId];
        if (!physicsTree) return null;

        try {
            return this.techPhysics.getCurrentTierInfo(physicsTree);
        } catch (error) {
            return null;
        }
    }

    /**
     * Get full physics summary
     */
    getFullSummary() {
        if (!this.techPhysics || !this.initialized) return null;
        return this.techPhysics.getFullSummary();
    }

    /**
     * Create HTML for physics values display
     */
    createPhysicsHTML(oldTreeId) {
        const display = this.getPhysicsDisplay(oldTreeId);
        if (!display) return '';

        const physicsTree = this.treeMapping[oldTreeId];
        const tierInfo = this.getCurrentPhysicsInfo(oldTreeId);

        let html = '<div class="physics-display">';
        html += '<div class="physics-values">';
        html += `<span class="physics-primary">${this.escapeHtml(display)}</span>`;
        html += '</div>';

        if (tierInfo && tierInfo.historical_reference) {
            html += `<div class="physics-reference">Ref: ${this.escapeHtml(tierInfo.historical_reference)}</div>`;
        }

        html += '</div>';
        return html;
    }

    /**
     * Create compact physics badge for collapsed view
     */
    createPhysicsBadge(oldTreeId) {
        if (!this.techPhysics || !this.initialized) return '';

        const physicsTree = this.treeMapping[oldTreeId];
        if (!physicsTree) return '';

        try {
            switch (physicsTree) {
                case 'propulsion': {
                    const dv = this.techPhysics.getProbeDeltaV();
                    if (dv.isp) {
                        return `<span class="physics-badge">${Math.round(dv.isp)}s ISP</span>`;
                    }
                    return `<span class="physics-badge">${dv.deltaV_km_s.toExponential(1)} km/s</span>`;
                }
                case 'electromagnetics': {
                    const B = this.techPhysics.getEMBFieldTesla();
                    return `<span class="physics-badge">${B}T</span>`;
                }
                case 'thermal': {
                    const factor = this.techPhysics.getThermalCapacityFactor();
                    return `<span class="physics-badge">${factor.toFixed(0)}× cooling</span>`;
                }
                case 'materials': {
                    const mass = this.techPhysics.getMaterialsMassFactor();
                    return `<span class="physics-badge">${mass}× mass</span>`;
                }
                case 'power': {
                    const wkg = this.techPhysics.getPowerDensityWkg();
                    return `<span class="physics-badge">${wkg} W/kg</span>`;
                }
                case 'autonomy': {
                    const penalty = this.techPhysics.getCrowdingPenaltyPercent();
                    return `<span class="physics-badge">${penalty}%/2×</span>`;
                }
                default:
                    return '';
            }
        } catch (error) {
            return '';
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Get CSS styles for physics display
     */
    static getStyles() {
        return `
            .physics-display {
                background: rgba(74, 158, 255, 0.1);
                border: 1px solid rgba(74, 158, 255, 0.3);
                border-radius: 4px;
                padding: 6px 8px;
                margin: 6px 0;
                font-family: 'Fira Code', 'Monaco', monospace;
            }

            .physics-values {
                font-size: 11px;
                color: rgba(74, 158, 255, 0.95);
                line-height: 1.4;
            }

            .physics-primary {
                display: block;
                font-weight: 500;
            }

            .physics-reference {
                font-size: 9px;
                color: rgba(255, 255, 255, 0.4);
                margin-top: 4px;
                font-style: italic;
            }

            .physics-badge {
                display: inline-block;
                background: rgba(74, 158, 255, 0.15);
                border: 1px solid rgba(74, 158, 255, 0.25);
                border-radius: 3px;
                padding: 1px 5px;
                font-size: 9px;
                font-family: 'Fira Code', 'Monaco', monospace;
                color: rgba(74, 158, 255, 0.85);
                margin-left: 6px;
            }

            /* Physics summary panel */
            .physics-summary-panel {
                background: rgba(20, 30, 50, 0.95);
                border: 1px solid rgba(74, 158, 255, 0.3);
                border-radius: 6px;
                padding: 10px;
                margin-bottom: 10px;
            }

            .physics-summary-title {
                font-size: 11px;
                font-weight: 600;
                color: rgba(74, 158, 255, 0.9);
                margin-bottom: 8px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .physics-summary-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 6px;
            }

            .physics-summary-item {
                background: rgba(74, 158, 255, 0.08);
                border-radius: 4px;
                padding: 6px;
            }

            .physics-summary-label {
                font-size: 9px;
                color: rgba(255, 255, 255, 0.5);
                text-transform: uppercase;
            }

            .physics-summary-value {
                font-size: 11px;
                color: rgba(74, 158, 255, 0.95);
                font-family: 'Fira Code', 'Monaco', monospace;
                margin-top: 2px;
            }
        `;
    }

    /**
     * Create physics summary panel HTML
     */
    createSummaryPanel() {
        if (!this.techPhysics || !this.initialized) return '';

        const summary = this.getFullSummary();
        if (!summary) return '';

        let html = '<div class="physics-summary-panel">';
        html += '<div class="physics-summary-title">Current Technology</div>';
        html += '<div class="physics-summary-grid">';

        // Propulsion
        if (summary.propulsion) {
            const dv = summary.propulsion.deltaV;
            html += `
                <div class="physics-summary-item">
                    <div class="physics-summary-label">Propulsion</div>
                    <div class="physics-summary-value">${dv.isp ? Math.round(dv.isp) + 's ISP' : 'Exotic'}</div>
                </div>`;
        }

        // Electromagnetics
        if (summary.electromagnetics) {
            html += `
                <div class="physics-summary-item">
                    <div class="physics-summary-label">EM Field</div>
                    <div class="physics-summary-value">${summary.crossEffects.em_b_field}T</div>
                </div>`;
        }

        // Materials
        if (summary.materials) {
            html += `
                <div class="physics-summary-item">
                    <div class="physics-summary-label">Materials</div>
                    <div class="physics-summary-value">${summary.materials.massFactor}× mass</div>
                </div>`;
        }

        // Power
        if (summary.power) {
            html += `
                <div class="physics-summary-item">
                    <div class="physics-summary-label">Power</div>
                    <div class="physics-summary-value">${summary.power.powerDensity} W/kg</div>
                </div>`;
        }

        html += '</div></div>';
        return html;
    }
}

// Global instance
let researchPhysicsDisplay = null;

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', async () => {
    researchPhysicsDisplay = new ResearchPhysicsDisplay();
    await researchPhysicsDisplay.initialize();

    // Inject styles
    const styleEl = document.createElement('style');
    styleEl.textContent = ResearchPhysicsDisplay.getStyles();
    document.head.appendChild(styleEl);
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResearchPhysicsDisplay;
}
