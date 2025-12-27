/** Orbital Zone Selector - Clickable bars for selecting harvest location */
class OrbitalZoneSelector {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.gameState = null;
        this.orbitalZones = null;
        this.selectedZone = null; // No zone selected by default
        this.transferSourceZone = null; // Origin zone selected for transfer (after spacebar)
        this.transferDestinationZone = null; // Destination zone selected for transfer
        this.waitingForTransferDestination = false; // True when spacebar pressed, waiting for destination zone
        this.currentTransferDialog = null; // Reference to open transfer dialog
        this.transferArcs = []; // Active transfer arcs: [{from, to, type, count, rate, ...}]
        
        // Transfer menu mode: 'probe' (default, 1 probe one-time) or 'metal' (10% continuous)
        this.transferMenuMode = null; // null = closed, 'probe' or 'metal' = open
        this.transferMenuOpen = false; // Whether transfer menu (delta-v window) is open
        
        // Local calculation instances for UI (loaded separately from worker thread)
        this.dataLoader = null;
        this.orbitalMechanics = null;
        this.transferSystem = null;
        this.economicRules = null;
        this.buildings = null; // Buildings data for base values
        this.transferDeltaV = null; // Pre-calculated Hohmann transfer delta-v data
        
        // Performance optimization: Throttle probe visualization updates
        this.probeUpdateFrameCount = 0; // Frame counter for probe UI updates
        this.lastProbeCounts = null; // Cache last probe counts to detect changes
        
        // Tooltip update interval
        this.tooltipUpdateInterval = null; // Interval for updating tooltip every second
        
        // Throttle metal stat updates to every 60 frames
        this.metalUpdateFrameCount = 0;
        
        // Transfer arc animation interval (10 times per second = 100ms)
        this.transferArcAnimationInterval = null;
        this.transferArcUpdateRate = 100; // milliseconds (10 times per second)
        
        this.init();
        this.loadData();
        this.setupKeyboardShortcuts();
    }

    async loadData() {
        try {
            // Load orbital zones
            const zonesResponse = await fetch('/game_data/orbital_mechanics.json');
            const zonesData = await zonesResponse.json();
            this.orbitalZones = zonesData.orbital_zones;
            
            // Load economic rules for skill coefficients
            try {
                const economicResponse = await fetch('/game_data/economic_rules.json');
                const economicData = await economicResponse.json();
                this.economicRules = economicData;
                
                // Cache commonly used energy values
                this.BASE_STRUCTURE_ENERGY_COST = economicData?.structures?.base_energy_cost_w ?? 250000;
            } catch (error) {
                console.warn('Failed to load economic rules:', error);
                this.economicRules = null;
                this.BASE_STRUCTURE_ENERGY_COST = 250000;
            }
            
            // Load buildings data for base values
            try {
                const buildingsResponse = await fetch('/game_data/buildings.json');
                const buildingsData = await buildingsResponse.json();
                this.buildings = buildingsData.buildings || buildingsData;
            } catch (error) {
                console.warn('Failed to load buildings:', error);
                this.buildings = null;
            }
            
            // Load transfer delta-v data
            try {
                const transferResponse = await fetch('/game_data/transfer_delta_v.json');
                const transferData = await transferResponse.json();
                this.transferDeltaV = transferData.hohmann_transfers || null;
            } catch (error) {
                console.warn('Failed to load transfer delta-v data:', error);
                this.transferDeltaV = null;
            }
            
            // Try to access engine instances first (preferred method, like other UI panels)
            if (window.gameEngine && window.gameEngine.engine) {
                if (window.gameEngine.engine.orbitalMechanics) {
                    this.orbitalMechanics = window.gameEngine.engine.orbitalMechanics;
                    console.log('[OrbitalZoneSelector] Using engine OrbitalMechanics instance');
                }
                if (window.gameEngine.engine.transferSystem) {
                    this.transferSystem = window.gameEngine.engine.transferSystem;
                    console.log('[OrbitalZoneSelector] Using engine TransferSystem instance');
                }
            }
            
            // Fallback: Try to create instances if classes are available, but don't fail if they're not
            // We'll use inline calculations as fallback
            if (!this.orbitalMechanics || !this.transferSystem) {
                if (typeof GameDataLoader !== 'undefined') {
                    this.dataLoader = new GameDataLoader();
                    await this.dataLoader.init();
                    console.log('[OrbitalZoneSelector] GameDataLoader initialized');
                }
                
                // Try to create OrbitalMechanics instance if not available from engine
                if (!this.orbitalMechanics && typeof OrbitalMechanics !== 'undefined' && this.dataLoader) {
                    try {
                        this.orbitalMechanics = new OrbitalMechanics(this.dataLoader);
                        this.orbitalMechanics.initialize(this.orbitalZones);
                        if (this.economicRules) {
                            this.orbitalMechanics.initializeEconomicRules(this.economicRules);
                        }
                        
                        // Load transfer delta-v data
                        try {
                            const transferResponse = await fetch('/game_data/transfer_delta_v.json');
                            const transferData = await transferResponse.json();
                            if (transferData.hohmann_transfers) {
                                this.orbitalMechanics.initializeTransferData(transferData.hohmann_transfers);
                                console.log('[OrbitalZoneSelector] Transfer delta-v data loaded');
                            }
                        } catch (error) {
                            console.warn('[OrbitalZoneSelector] Failed to load transfer delta-v data:', error);
                        }
                        
                        console.log('[OrbitalZoneSelector] OrbitalMechanics instance created');
                    } catch (error) {
                        console.warn('[OrbitalZoneSelector] Failed to create OrbitalMechanics:', error);
                        this.orbitalMechanics = null;
                    }
                }
                
                // Try to create TransferSystem instance if not available from engine
                if (!this.transferSystem && typeof TransferSystem !== 'undefined' && this.orbitalMechanics) {
                    try {
                        this.transferSystem = new TransferSystem(this.orbitalMechanics);
                        if (this.economicRules) {
                            this.transferSystem.initializeEconomicRules(this.economicRules);
                        }
                        console.log('[OrbitalZoneSelector] TransferSystem instance created');
                    } catch (error) {
                        console.warn('[OrbitalZoneSelector] Failed to create TransferSystem:', error);
                        this.transferSystem = null;
                    }
                }
            }
            
            // Initialize inline calculation helpers (always available)
            this.initializeInlineCalculations();
            
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
    
    /**
     * Initialize inline calculation helpers (always available, doesn't require OrbitalMechanics class)
     */
    initializeInlineCalculations() {
        // Standard gravitational parameter for Sun (m³/s²)
        this.SUN_MU = 1.32712440018e20;
        console.log('[OrbitalZoneSelector] Inline calculations initialized');
    }
    
    /**
     * Calculate delta-v for Hohmann transfer between two zones (inline, no class needed)
     * @param {string} fromZoneId - Source zone ID
     * @param {string} toZoneId - Destination zone ID
     * @param {Object} skills - Skills object (optional, for delta-v reduction)
     * @returns {number} Delta-v in km/s
     */
    calculateDeltaVKmS(fromZoneId, toZoneId, skills = {}) {
        if (!this.orbitalZones) return Infinity;
        
        const fromZone = this.orbitalZones.find(z => z.id === fromZoneId);
        const toZone = this.orbitalZones.find(z => z.id === toZoneId);
        
        if (!fromZone || !toZone) return Infinity;
        if (fromZoneId === toZoneId) return 0;
        
        // Get orbital radii in meters
        const r1 = fromZone.radius_km * 1000;
        const r2 = toZone.radius_km * 1000;
        
        // Hohmann transfer delta-v calculation
        const rInner = Math.min(r1, r2);
        const rOuter = Math.max(r1, r2);
        const rSum = rInner + rOuter;
        
        const sqrtMu = Math.sqrt(this.SUN_MU);
        
        // First burn: from circular orbit to transfer ellipse
        const dv1 = sqrtMu / Math.sqrt(rInner) * (Math.sqrt(2 * rOuter / rSum) - 1);
        
        // Second burn: from transfer ellipse to circular orbit
        const dv2 = sqrtMu / Math.sqrt(rOuter) * (1 - Math.sqrt(2 * rInner / rSum));
        
        let totalDeltaV = Math.abs(dv1) + Math.abs(dv2);
        
        // Apply skill-based delta-v reduction if skills provided
        if (skills && Object.keys(skills).length > 0) {
            // Simple reduction based on propulsion skill if available
            const propulsionSkill = skills.propulsion || 1.0;
            const reductionFactor = 1.0 / (1 + (propulsionSkill - 1.0));
            totalDeltaV *= reductionFactor;
        }
        
        return totalDeltaV / 1000; // Convert m/s to km/s
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
            'robotic': 'manipulation',
            'energy': 'solar_pv',
            'energy_collection': 'solar_pv',
            'materials_science': 'materials'
        };
        return aliasMap[skillName] || skillName;
    }

    /**
     * Calculate upgrade factor using weighted sum formula from economic rules
     * Formula: factor = 1 + Σ(weight_i * (skill_i - 1))
     * Dynamically reads ALL skills from the coefficients
     * @param {string} category - Category name from economic_rules.json (e.g., 'probe_delta_v_capacity')
     * @param {Object} skills - Current skills object
     * @returns {number} Upgrade factor
     */
    calculateUpgradeFactorFromEconomicRules(category, skills) {
        if (!this.economicRules || !this.economicRules.skill_coefficients) {
            return 1.0;
        }
        
        const coefficients = this.economicRules.skill_coefficients[category];
        if (!coefficients) {
            return 1.0;
        }
        
        let bonus = 0;
        for (const [rawSkillName, weight] of Object.entries(coefficients)) {
            if (rawSkillName === 'description') continue;
            
            // Resolve skill alias to canonical name
            const skillName = this.resolveSkillAlias(rawSkillName);
            
            // Get skill value (with fallbacks for common aliases)
            let skillValue = skills[skillName] || 1.0;
            
            // Additional fallback handling for complex skill types
            if (skillValue === 1.0 && skillName === 'manipulation') {
                skillValue = skills.manipulation || skills.robotic || 1.0;
            }
            if (skillValue === 1.0 && skillName === 'solar_pv') {
                skillValue = skills.solar_pv || skills.energy_collection || 1.0;
            }
            
            // Calculate contribution: weight * (skillValue - 1)
            bonus += weight * (skillValue - 1.0);
        }
        
        return 1.0 + bonus;
    }
    
    /**
     * Get probe delta-v capacity from skills using weighted sum formula from economic rules
     * Formula: factor = 1 + Σ(weight_i * (skill_i - 1))
     * @param {Object} skills - Skills object
     * @returns {number} Probe delta-v capacity in km/s
     */
    getProbeDeltaVCapacity(skills = {}) {
        // Base delta-v from economic_rules.json
        const baseDeltaVKmS = this.economicRules?.probe_transfer?.base_delta_v_km_s || 1.0;
        
        // Add probe delta-v bonus from starting skill points
        const probeDvBonus = this.gameState?.skill_bonuses?.probe_dv_bonus || 0;
        const effectiveBaseDeltaV = baseDeltaVKmS + probeDvBonus;
        
        // Calculate upgrade factor from economic rules
        const upgradeFactor = this.calculateUpgradeFactorFromEconomicRules('probe_delta_v_capacity', skills);
        
        return effectiveBaseDeltaV * upgradeFactor;
    }
    
    /**
     * Get mass driver muzzle velocity (delta-v capacity) from game state using weighted sum formula from economic rules
     * Formula: factor = 1 + Σ(weight_i * (skill_i - 1))
     * @param {string} zoneId - Zone ID
     * @returns {number} Muzzle velocity in km/s
     */
    getMassDriverMuzzleVelocity(zoneId) {
        if (!this.gameState) return 0;
        
        const structuresByZone = this.gameState.structures_by_zone || {};
        const zoneStructures = structuresByZone[zoneId] || {};
        const massDriverCount = zoneStructures['mass_driver'] || 0;
        
        if (massDriverCount === 0) return 0;
        
        // Get base muzzle velocity from buildings.json or use default
        let baseMuzzleVelocityKmS = 3.0; // Default
        if (this.buildings && this.buildings.mass_driver) {
            baseMuzzleVelocityKmS = this.buildings.mass_driver.base_muzzle_velocity_km_s || 3.0;
        }
        
        // Add mass driver delta-v bonus from starting skill points
        const massDriverDvBonus = this.gameState?.skill_bonuses?.mass_driver_dv_bonus || 0;
        baseMuzzleVelocityKmS += massDriverDvBonus;
        
        // Get skill values from game state
        const skills = this.gameState.skills || this.gameState.research?.skills || {};
        
        // Calculate upgrade factor from economic rules
        const upgradeFactor = this.calculateUpgradeFactorFromEconomicRules('mass_driver_muzzle_velocity', skills);
        
        return baseMuzzleVelocityKmS * upgradeFactor;
    }
    
    /**
     * Get mass driver power draw using weighted sum formula from economic rules
     * @param {string} zoneId - Zone ID
     * @returns {number} Power draw in MW
     */
    getMassDriverPowerDraw(zoneId) {
        if (!this.gameState) return 0;
        
        const structuresByZone = this.gameState.structures_by_zone || {};
        const zoneStructures = structuresByZone[zoneId] || {};
        const massDriverCount = zoneStructures['mass_driver'] || 0;
        
        if (massDriverCount === 0) return 0;
        
        // Get base power from buildings.json or use default
        let basePowerMW = 100; // Default
        if (this.buildings && this.buildings.mass_driver) {
            basePowerMW = this.buildings.mass_driver.power_draw_mw || 100;
        }
        
        // Get skill values from game state
        const skills = this.gameState.skills || this.gameState.research?.skills || {};
        
        // Calculate upgrade factor from economic rules
        const powerUpgradeFactor = this.calculateUpgradeFactorFromEconomicRules('mass_driver_power', skills);
        
        return basePowerMW * powerUpgradeFactor;
    }
    
    /**
     * Get mass driver energy efficiency using weighted sum formula from economic rules
     * @param {string} zoneId - Zone ID
     * @returns {number} Efficiency (0-1)
     */
    getMassDriverEfficiency(zoneId) {
        if (!this.gameState) return 0;
        
        const structuresByZone = this.gameState.structures_by_zone || {};
        const zoneStructures = structuresByZone[zoneId] || {};
        const massDriverCount = zoneStructures['mass_driver'] || 0;
        
        if (massDriverCount === 0) return 0;
        
        // Get base efficiency from buildings.json or use default
        let baseEfficiency = 0.4; // Default 40%
        if (this.buildings && this.buildings.mass_driver) {
            baseEfficiency = this.buildings.mass_driver.energy_efficiency || 0.4;
        }
        
        // Get skill values from game state
        const skills = this.gameState.skills || this.gameState.research?.skills || {};
        
        // Calculate upgrade factor from economic rules
        const efficiencyUpgradeFactor = this.calculateUpgradeFactorFromEconomicRules('mass_driver_efficiency', skills);
        
        // Efficiency improves with upgrades (capped at 1.0)
        return Math.min(1.0, baseEfficiency * efficiencyUpgradeFactor);
    }
    
    /**
     * Get Hohmann transfer delta-v between two zones
     * Uses pre-calculated data if available, otherwise calculates inline
     * @param {string} fromZoneId - Source zone
     * @param {string} toZoneId - Destination zone
     * @returns {number} Hohmann transfer delta-v in km/s
     */
    getHohmannDeltaVKmS(fromZoneId, toZoneId) {
        if (fromZoneId === toZoneId) return 0;
        
        // Try pre-calculated data first
        if (this.transferDeltaV && this.transferDeltaV[fromZoneId]) {
            const deltaV = this.transferDeltaV[fromZoneId][toZoneId];
            if (deltaV !== undefined) {
                return deltaV;
            }
        }
        
        // Fallback: calculate inline
        const fromZone = this.orbitalZones?.find(z => z.id === fromZoneId);
        const toZone = this.orbitalZones?.find(z => z.id === toZoneId);
        
        if (!fromZone || !toZone) return Infinity;
        
        // Initialize SUN_MU if not already done
        if (!this.SUN_MU) {
            this.initializeInlineCalculations();
        }
        
        // Calculate Hohmann transfer
        const r1 = fromZone.radius_km * 1000;
        const r2 = toZone.radius_km * 1000;
        const rInner = Math.min(r1, r2);
        const rOuter = Math.max(r1, r2);
        const rSum = rInner + rOuter;
        const sqrtMu = Math.sqrt(this.SUN_MU);
        const dv1 = sqrtMu / Math.sqrt(rInner) * (Math.sqrt(2 * rOuter / rSum) - 1);
        const dv2 = sqrtMu / Math.sqrt(rOuter) * (1 - Math.sqrt(2 * rInner / rSum));
        return (Math.abs(dv1) + Math.abs(dv2)) / 1000; // Convert to km/s
    }
    
    /**
     * Calculate escape delta-v based on current zone mass
     * @param {string} zoneId - Zone identifier
     * @param {number} currentMass - Current mass in kg
     * @returns {number} Escape delta-v in km/s
     */
    calculateEscapeDeltaV(zoneId, currentMass) {
        const zone = this.orbitalZones?.find(z => z.id === zoneId);
        if (!zone) return 0;
        
        const baseEscapeDV = zone.escape_delta_v_km_s || 0;
        if (baseEscapeDV === 0) {
            return 0; // No gravity well (e.g., Dyson sphere, asteroid belt)
        }
        
        const originalMass = zone.total_mass_kg || 0;
        if (originalMass <= 0 || currentMass <= 0) {
            return 0;
        }
        
        // Scale with sqrt(mass ratio): v_escape ∝ sqrt(M)
        const massRatio = currentMass / originalMass;
        return baseEscapeDV * Math.sqrt(massRatio);
    }
    
    precalculateDeltaV() {
        // Calculate delta-v for each zone relative to Dyson sphere and store as property
        if (!this.orbitalZones) return;
        
        // Find Dyson sphere zone
        const dysonZone = this.orbitalZones.find(z => z.id === 'dyson_sphere');
        if (!dysonZone) return;
        
        // Calculate and store delta-v for each zone using inline calculation
        this.orbitalZones.forEach(zone => {
            if (zone.id === 'dyson_sphere') {
                zone.delta_v_from_dyson_ms = 0;
            } else {
                const deltaVKmS = this.calculateDeltaVKmS('dyson_sphere', zone.id);
                zone.delta_v_from_dyson_ms = deltaVKmS * 1000; // Convert to m/s for compatibility
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
            
            // Handle spacebar for transfer menu
            // Only handle if a zone is selected (otherwise let pause/resume handle it)
            if ((e.key === ' ' || e.key === 'Spacebar') && this.selectedZone) {
                e.preventDefault();
                e.stopPropagation();
                
                // Close any open transfer dialog first
                if (this.currentTransferDialog) {
                    this.closeTransferDialog();
                }
                
                // If transfer menu is already open and destination is selected, launch transfer
                if (this.transferMenuOpen && this.transferDestinationZone) {
                    this.launchTransfer();
                    return;
                }
                
                // If transfer menu is open but no destination selected, close it
                if (this.transferMenuOpen) {
                    this.closeTransferMenu();
                    return;
                }
                
                // Open transfer menu with selected zone as origin
                // Default to probe transfer (1 probe one-time)
                this.transferSourceZone = this.selectedZone;
                this.transferDestinationZone = null;
                this.transferMenuMode = 'probe';
                this.transferMenuOpen = true;
                this.waitingForTransferDestination = true;
                
                // Check if origin zone has probes (for probe transfers)
                let availableProbes = 0;
                if (this.gameState && this.gameState.probes_by_zone) {
                    const zoneProbes = this.gameState.probes_by_zone[this.selectedZone] || {};
                    availableProbes = zoneProbes['probe'] || 0;
                }
                
                if (availableProbes < 1 && this.transferMenuMode === 'probe') {
                    this.showQuickMessage('No probes available for transfer');
                    this.closeTransferMenu();
                    return;
                }
                
                // Open transfer menu (delta-v window)
                this.showTransferMenu();
                this.render(); // Re-render to show transfer source highlight
                return;
            }
            
            // Handle left/right arrow keys to switch transfer type (only when menu is open)
            if (this.transferMenuOpen && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                e.preventDefault();
                e.stopPropagation();
                
                if (e.key === 'ArrowRight' && this.transferMenuMode === 'probe') {
                    // Switch to metal transfer
                    const structuresByZone = this.gameState?.structures_by_zone || {};
                    const zoneStructures = structuresByZone[this.transferSourceZone] || {};
                    const hasMassDriver = (zoneStructures['mass_driver'] || 0) > 0;
                    
                    if (!hasMassDriver) {
                        this.showQuickMessage('Mass Driver required for metal transfers');
                        return;
                    }
                    
                    this.transferMenuMode = 'metal';
                    this.transferDestinationZone = null; // Reset destination when switching types
                    this.updateTransferMenu();
                } else if (e.key === 'ArrowLeft' && this.transferMenuMode === 'metal') {
                    // Switch to probe transfer
                    this.transferMenuMode = 'probe';
                    this.transferDestinationZone = null; // Reset destination when switching types
                    this.updateTransferMenu();
                }
                return;
            }
            
            // Escape to close transfer menu
            if (e.key === 'Escape' && this.transferMenuOpen) {
                e.preventDefault();
                e.stopPropagation();
                this.closeTransferMenu();
                return;
            }
            
            // Shift+T to open transfer dialog (non-quick transfer flow)
            if (e.key === 'T' && e.shiftKey && this.selectedZone && !this.quickTransferMode) {
                e.preventDefault();
                e.stopPropagation();
                
                // Close any existing transfer dialog
                if (this.currentTransferDialog) {
                    this.closeTransferDialog();
                }
                
                // Open transfer dialog with selected zone as source
                this.showTransferDialog(this.selectedZone, null);
                return;
            }
            
            // V key to toggle delta-v overlay
            if (e.key === 'v' || e.key === 'V') {
                e.preventDefault();
                e.stopPropagation();
                
                if (!this.selectedZone) {
                    this.showQuickMessage('Select a zone first to view delta-v overlay');
                    return;
                }
                
                this.toggleDeltaVOverlay();
                return;
            }
            
            // Handle `, 1-9, 0, and - (minus) for zone selection
            // ` = dyson, 1 = mercury, 2 = venus, ..., 9 = neptune, 0 = kuiper, - = oort
            // If in transfer menu mode, these select destination; otherwise select zone normally
            const key = e.key;
            
            // Backtick (`) for dyson_sphere (zone index 0)
            if (key === '`' || key === '~') {
                const dysonZone = this.orbitalZones?.find(z => z.id === 'dyson_sphere');
                if (dysonZone) {
                    if (this.transferMenuOpen && this.transferSourceZone && this.transferSourceZone !== 'dyson_sphere') {
                        this.transferDestinationZone = 'dyson_sphere';
                        if (this.deltaVOverlayCanvas) {
                            const resourceType = this.transferMenuMode || 'probe';
                            this.drawOverlayChart(this.deltaVOverlayCanvas, this.transferSourceZone, resourceType);
                            const upgradesDiv = document.getElementById('delta-v-upgrades');
                            if (upgradesDiv) {
                                this.updateTransferDetails(upgradesDiv, this.transferSourceZone, 'dyson_sphere', resourceType);
                            }
                        }
                    } else {
                        this.selectZone('dyson_sphere');
                    }
                }
            } else if (key >= '1' && key <= '9') {
                // 1-9 map to zones 1-9 (mercury through neptune)
                const zoneIndex = parseInt(key);
                if (this.orbitalZones && zoneIndex < this.orbitalZones.length) {
                    const zoneId = this.orbitalZones[zoneIndex].id;
                    if (this.transferMenuOpen && this.transferSourceZone && this.transferSourceZone !== zoneId) {
                        // In transfer menu mode: select as destination
                        this.transferDestinationZone = zoneId;
                        if (this.deltaVOverlayCanvas) {
                            const resourceType = this.transferMenuMode || 'probe';
                            this.drawOverlayChart(this.deltaVOverlayCanvas, this.transferSourceZone, resourceType);
                            const upgradesDiv = document.getElementById('delta-v-upgrades');
                            if (upgradesDiv) {
                                this.updateTransferDetails(upgradesDiv, this.transferSourceZone, zoneId, resourceType);
                            }
                        }
                    } else {
                        // Normal zone selection
                        this.selectZone(zoneId);
                    }
                }
            } else if (key === '0') {
                // 0 = kuiper belt (zone index 10)
                const kuiperZone = this.orbitalZones?.find(z => z.id === 'kuiper');
                if (kuiperZone) {
                    if (this.transferMenuOpen && this.transferSourceZone && this.transferSourceZone !== 'kuiper') {
                        // In transfer menu mode: select as destination
                        this.transferDestinationZone = 'kuiper';
                        if (this.deltaVOverlayCanvas) {
                            const resourceType = this.transferMenuMode || 'probe';
                            this.drawOverlayChart(this.deltaVOverlayCanvas, this.transferSourceZone, resourceType);
                            const upgradesDiv = document.getElementById('delta-v-upgrades');
                            if (upgradesDiv) {
                                this.updateTransferDetails(upgradesDiv, this.transferSourceZone, 'kuiper', resourceType);
                            }
                        }
                    } else {
                        this.selectZone('kuiper');
                    }
                }
            } else if (key === '-' || key === '_') {
                // - = oort cloud (zone index 11)
                const oortZone = this.orbitalZones?.find(z => z.id === 'oort_cloud');
                if (oortZone) {
                    if (this.transferMenuOpen && this.transferSourceZone && this.transferSourceZone !== 'oort_cloud') {
                        // In transfer menu mode: select as destination
                        this.transferDestinationZone = 'oort_cloud';
                        if (this.deltaVOverlayCanvas) {
                            const resourceType = this.transferMenuMode || 'probe';
                            this.drawOverlayChart(this.deltaVOverlayCanvas, this.transferSourceZone, resourceType);
                            const upgradesDiv = document.getElementById('delta-v-upgrades');
                            if (upgradesDiv) {
                                this.updateTransferDetails(upgradesDiv, this.transferSourceZone, 'oort_cloud', resourceType);
                            }
                        }
                    } else {
                        this.selectZone('oort_cloud');
                    }
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
        
        // Check if transfer dialog is open or quick transfer mode is active - if so, calculate travel times
        const isTransferDialogOpen = this.currentTransferDialog !== null;
        const isQuickTransferMode = this.quickTransferMode !== null;
        const showTravelTimes = isTransferDialogOpen || isQuickTransferMode;
        const transferSourceZone = this.transferSourceZone;
        let transferSourceZoneData = null;
        if (showTravelTimes && transferSourceZone) {
            transferSourceZoneData = this.orbitalZones.find(z => z.id === transferSourceZone);
        }
        
        // Check for mass driver boost if transfer dialog is open or in metal transfer mode
        let massDriverCount = 0;
        let hasMassDriver = false;
        if (showTravelTimes && transferSourceZone && this.gameState) {
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
            
            // Calculate transfer info if transfer dialog is open or in quick transfer mode
            let transferInfoDisplay = '';
            if (showTravelTimes && transferSourceZoneData && transferSourceZone !== zone.id) {
                const isMetalTransfer = this.quickTransferMode === 'metal' || 
                    (isTransferDialogOpen && this.currentTransferDialog?.querySelector?.('input[name="resource-type"]:checked')?.value === 'metal');
                
                let transferTime = null;
                let massRateKgPerDay = null;
                let energyPerKg = null;
                
                if (this.orbitalMechanics) {
                    const skills = this.gameState?.skills || {};
                    const probeDvBonus = this.gameState?.skill_bonuses?.probe_dv_bonus || 0;
                    
                    // Calculate transfer time
                    transferTime = this.orbitalMechanics.calculateTransferTime(
                        transferSourceZone, 
                        zone.id, 
                        skills,
                        probeDvBonus
                    );
                    
                    if (isMetalTransfer) {
                        // Metal transfer - calculate mass driver info if available
                        if (hasMassDriver && this.transferSystem) {
                            const speedMultiplier = this.transferSystem.calculateMassDriverSpeedMultiplier(massDriverCount);
                            transferTime = transferTime * speedMultiplier;
                            
                            // Calculate mass rate
                            massRateKgPerDay = this.transferSystem.calculateMassDriverThroughput(
                                this.gameState, 
                                transferSourceZone, 
                                zone.id
                            );
                            
                            // Calculate energy per kg: E = 0.5 * v^2
                            const requiredDeltaVKmS = this.orbitalMechanics.getDeltaVKmS(transferSourceZone, zone.id);
                            const deltaVMS = requiredDeltaVKmS * 1000;
                            energyPerKg = 0.5 * deltaVMS * deltaVMS; // Joules per kg
                        }
                    } else {
                        // Probe transfer - calculate energy per kg
                        const requiredDeltaVKmS = this.orbitalMechanics.getDeltaVKmS(transferSourceZone, zone.id, skills);
                        const deltaVMS = requiredDeltaVKmS * 1000;
                        energyPerKg = 0.5 * deltaVMS * deltaVMS; // Joules per kg
                    }
                }
                
                // Build display string
                if (transferTime !== null) {
                    const timeStr = this.formatTransferTime(transferTime);
                    const color = '#a0a0ff'; // Neutral blue color
                    let infoLines = [`<span style="color: ${color}">${timeStr}</span>`];
                    
                    if (massRateKgPerDay !== null && massRateKgPerDay > 0) {
                        const massRateStr = this.formatMass(massRateKgPerDay);
                        infoLines.push(`<span style="color: ${color}">${massRateStr}/day</span>`);
                    }
                    
                    if (energyPerKg !== null) {
                        const energyMJ = energyPerKg / 1e6; // Convert to MJ
                        infoLines.push(`<span style="color: ${color}">${energyMJ.toFixed(2)} MJ/kg</span>`);
                    }
                    
                    transferInfoDisplay = infoLines.join('<br>');
                }
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
            
            // Display transfer info below square if transfer dialog is open or in quick transfer mode
            if (transferInfoDisplay) {
                const transferModeClass = this.quickTransferMode === 'metal' ? 'metal-transfer' : 'probe-transfer';
                html += `<div class="orbital-zone-travel-time ${transferModeClass}" data-zone="${zone.id}" style="line-height: 1.3;">${transferInfoDisplay}</div>`;
            }
            
            html += `</div>`;
        });
        html += '</div>';
        
        // Render zone tiles (uniform size, no planet square inside)
        this.orbitalZones.forEach((zone, tileIndex) => {
            // Remove "Orbit" from zone name
            const zoneName = zone.name.replace(/\s+Orbit\s*$/i, '');
            
            // Get fixed zone properties (don't change, so no need to update)
            const radiusKm = zone.radius_km || 149597870.7; // Default to 1 AU in km
            const radiusAu = zone.radius_au || 1.0;
            
            // Calculate orbital velocity: v = sqrt(GM_sun / r)
            // GM_sun = 1.327e20 m³/s², r in meters
            // v = sqrt(1.327e20 / (r_km * 1000)) m/s = sqrt(1.327e11 / r_km) km/s
            const GM_SUN_OVER_1E9 = 1.327e11; // GM_sun / 1e9 for km/s calculation
            const orbitalVelocityKms = Math.sqrt(GM_SUN_OVER_1E9 / radiusKm);
            const orbitalVelocityDisplay = orbitalVelocityKms.toFixed(1);
            
            // Solar flux in W/m² (1361 W/m² at 1 AU, inverse square law)
            // Use real AU (radius_km / 149597870.7) for solar flux calculation
            const SOLAR_FLUX_EARTH = 1361; // W/m² at 1 AU
            const realAu = radiusKm / 149597870.7;
            const solarFluxWm2 = realAu > 0 ? Math.round(SOLAR_FLUX_EARTH / (realAu * realAu)) : 0;
            
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
            // ` = dyson, 1-9 = mercury through neptune, 0 = kuiper, - = oort
            let hotkey = '';
            if (zone.id === 'dyson_sphere') {
                hotkey = '`';
            } else if (zone.id === 'kuiper') {
                hotkey = '0';
            } else if (zone.id === 'oort_cloud') {
                hotkey = '-';
            } else if (tileIndex >= 1 && tileIndex <= 9) {
                hotkey = String(tileIndex);
            }
            
            // Apply dynamic spacing: first tile has no left margin, others have gap
            const tileMarginLeft = tileIndex === 0 ? 0 : tileGap;
            html += `<div class="orbital-zone-tile ${tileClass}" data-zone="${zone.id}" style="margin-left: ${tileMarginLeft}px; width: ${tileWidth}px;">`;
            html += `<div class="orbital-zone-tile-label">${zoneName}</div>`;
            if (hotkey) {
                html += `<div class="orbital-zone-hotkey">${hotkey}</div>`;
            }
            html += `</div>`;
        });

        html += '</div>';
        html += '</div>';
        
        this.container.innerHTML = html;

        // Set up event listeners
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
            const probeConstructionEnergyCost = probeConstructionRateKgS * this.BASE_STRUCTURE_ENERGY_COST;
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
                const structureConstructionEnergyCost = structureConstructionRateKgS * this.BASE_STRUCTURE_ENERGY_COST;
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
                const dysonConstructionEnergyCost = dysonConstructionRateKgS * this.BASE_STRUCTURE_ENERGY_COST;
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
        // Handle transfer menu mode (spacebar initiated)
        if (this.transferMenuOpen && this.transferSourceZone && this.transferSourceZone !== zoneId) {
            // Set as destination zone
            this.transferDestinationZone = zoneId;
            
            // Update the transfer menu display
            if (this.deltaVOverlayCanvas) {
                const resourceType = this.transferMenuMode || 'probe';
                this.drawOverlayChart(this.deltaVOverlayCanvas, this.transferSourceZone, resourceType);
                
                // Update transfer details
                const upgradesDiv = document.getElementById('delta-v-upgrades');
                if (upgradesDiv) {
                    this.updateTransferDetails(upgradesDiv, this.transferSourceZone, zoneId, resourceType);
                }
            }
            
            // Don't change selected zone - keep origin selected
            return;
        }
        
        // If in transfer menu mode and same zone selected as origin, do nothing
        if (this.transferMenuOpen && this.transferSourceZone === zoneId) {
            return;
        }
        
        // Legacy: Handle quick transfer mode (deprecated, kept for compatibility)
        if (this.quickTransferMode && this.transferSourceZone && this.transferSourceZone !== zoneId) {
            // Execute the quick transfer to this destination
            this.selectedZone = zoneId;
            this.executeQuickTransfer(zoneId);
            
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
            return;
        }
        
        // Legacy: If in quick transfer mode and same zone selected, cancel it
        if (this.quickTransferMode && this.transferSourceZone === zoneId) {
            this.cancelQuickTransfer();
            return;
        }
        
        // Update overlay if visible and zone changed (when not in quick transfer mode)
        const previousZone = this.selectedZone;
        
        // If a transfer dialog is open and a different zone is selected, send the transfer
        if (this.currentTransferDialog && this.transferSourceZone && this.transferSourceZone !== zoneId) {
            // Update dialog with destination zone first
            if (this.currentTransferDialog.updateDestination) {
                this.currentTransferDialog.updateDestination(zoneId);
            }
            // This is the destination zone - send the transfer
            const destinationZoneId = zoneId;
            this.selectedZone = destinationZoneId;
            // Don't auto-focus camera on transfer destination - user can double-click if they want to focus
            this.sendTransferFromDialog(destinationZoneId);
            this.closeTransferDialog();
            this.render(); // Re-render to show destination highlight
            return;
        }
        
        // If a transfer dialog is open and same zone is selected, just close it
        if (this.currentTransferDialog) {
            this.closeTransferDialog();
        }
        
        // If clicking the same zone twice in a row, focus camera on it
        if (this.selectedZone === zoneId) {
            this.startCameraTracking(zoneId);
            return;
        }
        
        // Select the new zone (normal selection) - don't change camera focus
        this.selectedZone = zoneId;
        
        // Update overlay if visible and zone changed (when not in transfer menu mode)
        if (this.deltaVOverlayVisible && previousZone !== zoneId && !this.transferMenuOpen) {
            // Update overlay with new selected zone
            this.showDeltaVOverlay();
        }
        
        // Don't automatically set as transfer source - wait for spacebar
        this.render(); // Re-render to show selection
        
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
            // Reset comet and transfer tracking modes when focusing on a zone
            window.app.sceneManager.currentCometIndex = -1;
            window.app.sceneManager.currentTransferIndex = -1;
            window.app.sceneManager.trackingMode = null;
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
        this.closeTransferMenu();
    }
    
    /**
     * Cancel quick transfer mode (escape key) - legacy method, now uses closeTransferMenu
     */
    cancelQuickTransfer() {
        this.closeTransferMenu();
    }
    
    /**
     * Show a quick message overlay
     */
    showQuickMessage(message) {
        // Remove existing message
        this.hideQuickMessage();
        
        const msgEl = document.createElement('div');
        msgEl.id = 'quick-transfer-message';
        msgEl.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.85);
            color: #4a9eff;
            padding: 10px 20px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 500;
            z-index: 1000;
            border: 1px solid rgba(74, 158, 255, 0.4);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            pointer-events: none;
        `;
        msgEl.textContent = message;
        document.body.appendChild(msgEl);
        
        // Auto-hide after 3 seconds if still in quick transfer mode, otherwise hide immediately on execution
        this.quickMessageTimeout = setTimeout(() => {
            this.hideQuickMessage();
        }, 3000);
    }
    
    /**
     * Hide quick message overlay
     */
    hideQuickMessage() {
        if (this.quickMessageTimeout) {
            clearTimeout(this.quickMessageTimeout);
            this.quickMessageTimeout = null;
        }
        const existing = document.getElementById('quick-transfer-message');
        if (existing) {
            existing.remove();
        }
    }
    
    /**
     * Toggle delta-v overlay visibility
     */
    toggleDeltaVOverlay() {
        if (this.deltaVOverlayVisible) {
            this.hideDeltaVOverlay();
            this.showQuickMessage('Delta-V overlay hidden');
        } else {
            // Try to show overlay - it will show error message if not ready
            const wasVisible = this.deltaVOverlayVisible;
            this.showDeltaVOverlay();
            // If overlay was successfully shown, it will be visible now
            if (this.deltaVOverlayVisible && !wasVisible) {
                this.showQuickMessage('Delta-V overlay shown');
            }
        }
    }
    
    /**
     * Show delta-v overlay (can be called independently or from quick transfer)
     */
    showDeltaVOverlay() {
        if (!this.selectedZone) {
            console.warn('[Delta-V Overlay] No zone selected');
            this.showQuickMessage('Select a zone first to view delta-v overlay');
            return;
        }
        
        // Check if we have orbital zones loaded
        if (!this.orbitalZones || this.orbitalZones.length === 0) {
            console.warn('[Delta-V Overlay] Orbital zones not loaded');
            this.showQuickMessage('Orbital zones not loaded. Please wait...');
            return;
        }
        
        // Check if we have game state
        if (!this.gameState) {
            console.warn('[Delta-V Overlay] Game state not available');
            this.showQuickMessage('Game state not ready. Please wait...');
            return;
        }
        
        // Determine resource type: use transfer menu mode if active, otherwise default to probe
        let resourceType = this.transferMenuMode || 'probe';
        const sourceZone = this.transferMenuOpen && this.transferSourceZone ? this.transferSourceZone : this.selectedZone;
        
        // If not in transfer menu mode, check if zone has mass driver to show metal option
        if (!this.transferMenuOpen) {
            const structuresByZone = this.gameState?.structures_by_zone || {};
            const zoneStructures = structuresByZone[this.selectedZone] || {};
            const hasMassDriver = (zoneStructures['mass_driver'] || 0) > 0;
            // Default to probe, but could show both or let user choose
            resourceType = 'probe';
        }
        
        console.log('[Delta-V Overlay] Showing overlay', { sourceZone, resourceType, transferMenuOpen: this.transferMenuOpen });
        
        // Remove existing overlay if any
        this.hideDeltaVOverlay();
        
        // Get the compact resources bar to position below it
        const compactResources = document.getElementById('compact-resources');
        let topOffset = 60; // Default offset if bar not found
        
        if (compactResources) {
            const rect = compactResources.getBoundingClientRect();
            topOffset = rect.bottom + 15; // 15px below the bar
            console.log('[Delta-V Overlay] Compact resources bar found, positioning at:', topOffset);
        } else {
            console.warn('[Delta-V Overlay] Compact resources bar not found, using default offset');
        }
        
        // Create a window container positioned below the economic info bar
        const windowDiv = document.createElement('div');
        windowDiv.id = 'delta-v-window';
        windowDiv.style.cssText = `
            position: fixed;
            top: ${topOffset}px;
            left: 50%;
            transform: translateX(-50%);
            width: 800px;
            height: 720px;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(5px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
            z-index: 1001;
            display: flex;
            flex-direction: column;
            pointer-events: auto;
            visibility: visible;
            opacity: 1;
        `;
        
        // Create header with title and close button (matching compact resources style)
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 8px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: rgba(0, 0, 0, 0.2);
        `;
        
        const title = document.createElement('div');
        title.textContent = this.transferMenuOpen ? 'Transfer Menu' : 'Delta-V Chart';
        title.style.cssText = `
            font-family: monospace;
            font-size: 12px;
            font-weight: bold;
            color: rgba(255, 255, 255, 0.9);
        `;
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.7);
            font-size: 20px;
            cursor: pointer;
            padding: 0;
            width: 20px;
            height: 20px;
            line-height: 1;
            transition: color 0.2s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.color = 'rgba(255, 255, 255, 1)';
        closeBtn.onmouseout = () => closeBtn.style.color = 'rgba(255, 255, 255, 0.7)';
        closeBtn.onclick = () => {
            if (this.transferMenuOpen) {
                this.closeTransferMenu();
            } else {
                this.hideDeltaVOverlay();
            }
        };
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        
        // Create container for chart and upgrades
        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = `
            display: flex;
            flex-direction: column;
            flex: 1;
            overflow: hidden;
        `;
        
        // Create canvas container with radio buttons overlay
        const canvasContainer = document.createElement('div');
        canvasContainer.style.cssText = `
            flex: 0 0 480px;
            width: 100%;
            height: 480px;
            position: relative;
        `;
        
        // Create canvas for chart
        const canvas = document.createElement('canvas');
        canvas.style.cssText = `
            width: 100%;
            height: 100%;
            display: block;
        `;
        
        // Create radio button container in lower right
        const radioContainer = document.createElement('div');
        radioContainer.style.cssText = `
            position: absolute;
            bottom: 10px;
            right: 10px;
            display: flex;
            gap: 15px;
            background: rgba(0, 0, 0, 0.7);
            padding: 8px 12px;
            border-radius: 4px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            font-family: monospace;
            font-size: 11px;
            z-index: 10;
        `;
        
        // Create radio buttons
        const probeRadio = document.createElement('label');
        probeRadio.style.cssText = `
            display: flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
            color: rgba(255, 255, 255, 0.9);
            user-select: none;
        `;
        const probeInput = document.createElement('input');
        probeInput.type = 'radio';
        probeInput.name = 'delta-v-resource-type';
        probeInput.value = 'probe';
        probeInput.checked = (resourceType === 'probe');
        probeInput.style.cssText = `cursor: pointer;`;
        probeRadio.appendChild(probeInput);
        probeRadio.appendChild(document.createTextNode('Probe'));
        
        const metalRadio = document.createElement('label');
        metalRadio.style.cssText = `
            display: flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
            color: rgba(255, 255, 255, 0.9);
            user-select: none;
        `;
        const metalInput = document.createElement('input');
        metalInput.type = 'radio';
        metalInput.name = 'delta-v-resource-type';
        metalInput.value = 'metal';
        metalInput.checked = (resourceType === 'metal');
        metalInput.style.cssText = `cursor: pointer;`;
        metalRadio.appendChild(metalInput);
        metalRadio.appendChild(document.createTextNode('Metal'));
        
        // Handle radio button changes
        const updateResourceType = (newType) => {
            resourceType = newType;
            this.deltaVOverlayResourceType = newType;
            if (this.transferMenuOpen) {
                this.transferMenuMode = newType;
                this.transferDestinationZone = null; // Reset destination when switching types
            }
            // Redraw chart with new resource type
            this.drawOverlayChart(canvas, sourceZone, resourceType);
            // Update upgrades section
            this.populateUpgradesSection(upgradesDiv, sourceZone, resourceType).catch(err => {
                console.error('[Delta-V Overlay] Failed to populate upgrades:', err);
            });
            // Update transfer details and controls if destination is selected
            if (this.transferDestinationZone) {
                this.updateTransferDetails(upgradesDiv, sourceZone, this.transferDestinationZone, resourceType);
                if (this.updateTransferControls) {
                    this.updateTransferControls(sourceZone, this.transferDestinationZone, resourceType);
                }
            } else {
                // Hide transfer controls when destination is reset
                if (this.updateTransferControls) {
                    this.updateTransferControls(sourceZone, null, resourceType);
                }
            }
        };
        
        probeInput.addEventListener('change', () => {
            if (probeInput.checked) {
                updateResourceType('probe');
            }
        });
        
        metalInput.addEventListener('change', () => {
            if (metalInput.checked) {
                updateResourceType('metal');
            }
        });
        
        // Make canvas clickable for destination selection (only in transfer menu mode)
        if (this.transferMenuOpen) {
            canvas.style.cursor = 'pointer';
            canvas.addEventListener('click', (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // Find which zone column was clicked
                const padding = { left: 80, right: 20 };
                const chartWidth = canvas.width - padding.left - padding.right;
                const allZones = [...(this.orbitalZones || [])].sort((a, b) => (a.radius_au || 0) - (b.radius_au || 0));
                const numZones = allZones.length;
                const columnWidth = chartWidth / numZones;
                
                if (x >= padding.left && x <= canvas.width - padding.right) {
                    const columnIndex = Math.floor((x - padding.left) / columnWidth);
                    if (columnIndex >= 0 && columnIndex < allZones.length) {
                        const clickedZone = allZones[columnIndex];
                        if (clickedZone.id !== this.transferSourceZone) {
                            this.transferDestinationZone = clickedZone.id;
                            this.drawOverlayChart(canvas, sourceZone, resourceType);
                            this.updateTransferDetails(upgradesDiv, sourceZone, clickedZone.id, resourceType);
                            // Update transfer controls with slider
                            if (this.updateTransferControls) {
                                this.updateTransferControls(sourceZone, clickedZone.id, resourceType);
                            }
                        }
                    }
                }
            });
        }
        
        radioContainer.appendChild(probeRadio);
        radioContainer.appendChild(metalRadio);
        canvasContainer.appendChild(canvas);
        canvasContainer.appendChild(radioContainer);
        
        // Create upgrades section
        const upgradesDiv = document.createElement('div');
        upgradesDiv.id = 'delta-v-upgrades';
        upgradesDiv.style.cssText = `
            flex: 1;
            padding: 10px 15px;
            overflow-y: auto;
            font-family: monospace;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.9);
            background: rgba(0, 0, 0, 0.2);
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        `;
        
        // Set canvas size
        const updateCanvasSize = () => {
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width || 700;
            canvas.height = 480; // Fixed height for chart (increased for transfer indicator)
            // Redraw when resized
            if (this.deltaVOverlayVisible && sourceZone) {
                this.drawOverlayChart(canvas, sourceZone, resourceType);
            }
        };
        
        updateCanvasSize();
        
        // Handle window resize
        const resizeObserver = new ResizeObserver(updateCanvasSize);
        resizeObserver.observe(canvas);
        
        // Populate upgrades section (async)
        this.populateUpgradesSection(upgradesDiv, sourceZone, resourceType).then(() => {
            // If destination is selected, show transfer details and controls
            if (this.transferDestinationZone) {
                this.updateTransferDetails(upgradesDiv, sourceZone, this.transferDestinationZone, resourceType);
                if (this.updateTransferControls) {
                    this.updateTransferControls(sourceZone, this.transferDestinationZone, resourceType);
                }
            } else if (this.transferMenuOpen) {
                // Show transfer controls immediately in "waiting for destination" state
                if (this.updateTransferControls) {
                    this.updateTransferControls(sourceZone, null, resourceType);
                }
            }
        }).catch(err => {
            console.error('[Delta-V Overlay] Failed to populate upgrades:', err);
            upgradesDiv.innerHTML = '<div style="color: rgba(255,255,255,0.5);">Failed to load upgrade data</div>';
        });
        
        // Create transfer controls section with slider
        const transferControlsDiv = document.createElement('div');
        transferControlsDiv.id = 'transfer-controls';
        transferControlsDiv.style.cssText = `
            padding: 12px 15px;
            background: rgba(0, 0, 0, 0.3);
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            font-family: monospace;
            font-size: 11px;
            display: none;
            max-height: 250px;
            overflow-y: auto;
        `;
        
        // Function to update transfer controls visibility and content
        this.updateTransferControls = (fromZoneId, toZoneId, resType) => {
            // Always show controls when in transfer menu mode (for probe transfers)
            // This allows users to see the slider immediately when pressing spacebar
            transferControlsDiv.style.display = 'block';
            
            // Determine color based on resource type
            let transferColor;
            if (resType === 'probe') {
                transferColor = '#00ffff'; // Cyan for probes
            } else if (resType === 'metal') {
                transferColor = '#c0c0c0'; // Silver for metal
            } else if (resType === 'methalox') {
                transferColor = '#87ceeb'; // Light blue for methalox
            } else {
                transferColor = '#00ffff';
            }
            
            const fromZone = this.orbitalZones?.find(z => z.id === fromZoneId);
            const toZone = toZoneId ? this.orbitalZones?.find(z => z.id === toZoneId) : null;
            const fromName = fromZone ? fromZone.name.replace(/\s+Orbit\s*$/i, '') : fromZoneId;
            const toName = toZone ? toZone.name.replace(/\s+Orbit\s*$/i, '') : 'Select Destination';
            
            // Get zone data for calculations
            const zones = this.gameState?.zones || {};
            const fromZoneData = zones[fromZoneId] || {};
            const storedMetal = fromZoneData.stored_metal || 0;
            
            // FIX: Read probe count from probes_by_zone (correct location)
            let probeCount = 0;
            if (this.gameState && this.gameState.probes_by_zone) {
                const zoneProbes = this.gameState.probes_by_zone[fromZoneId] || {};
                probeCount = zoneProbes['probe'] || 0;
            }
            
            // Get mass driver count for this zone
            const structuresByZone = this.gameState?.structures_by_zone || {};
            const zoneStructures = structuresByZone[fromZoneId] || {};
            const massDriverCount = zoneStructures['mass_driver'] || 0;
            
            let controlsHTML = '';
            
            if (resType === 'probe') {
                // Probe transfer: slider for count, show fuel cost
                const maxProbes = Math.min(probeCount, 100); // Cap at 100 for practical UI
                const defaultValue = Math.min(1, Math.max(1, maxProbes));
                
                // Calculate propulsion-related values for display
                const skills = this.gameState?.skills || {};
                const propulsionSkill = skills?.propulsion || 1.0;
                const baseIsp = 500; // Base ISP in seconds
                const effectiveIsp = baseIsp * propulsionSkill;
                const g0 = 9.80665; // Standard gravity m/s²
                const exhaustVelocityKmS = (effectiveIsp * g0) / 1000; // Convert to km/s
                
                // Get mass driver muzzle velocity
                let massDriverDeltaV = 0;
                if (massDriverCount > 0 && this.transferSystem) {
                    massDriverDeltaV = this.transferSystem.getMassDriverMuzzleVelocity(this.gameState, fromZoneId);
                } else if (massDriverCount > 0) {
                    massDriverDeltaV = this.getMassDriverMuzzleVelocity(fromZoneId);
                }
                
                const hasDestination = !!toZoneId;
                const destinationLabel = hasDestination ? toName : '<span style="color: rgba(255,255,255,0.5);">Click a zone on the chart</span>';
                
                controlsHTML = `
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 5px;">
                            <span style="color: rgba(255,255,255,0.7); min-width: 120px;">Destination:</span>
                            <span style="color: ${hasDestination ? '#fff' : 'rgba(255,255,255,0.5)'};">${destinationLabel}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <label style="color: ${transferColor}; min-width: 120px;">Probes to Send:</label>
                            <input type="range" id="transfer-probe-slider" min="1" max="${Math.max(1, maxProbes)}" value="${defaultValue}" 
                                style="flex: 1; accent-color: ${transferColor};" ${probeCount === 0 ? 'disabled' : ''}>
                            <span id="transfer-probe-count" style="color: #fff; min-width: 40px; text-align: right;">${defaultValue}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 15px; margin-top: 5px;">
                            <span style="color: rgba(255,255,255,0.5); font-size: 10px;">Available: ${probeCount} probes in ${fromName}</span>
                        </div>
                        <div style="display: flex; gap: 20px; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 8px; padding-top: 8px;">
                            <div style="flex: 1; min-width: 0;">
                                <div style="margin-bottom: 5px; color: #4a9eff; font-weight: bold;">Propulsion Stats</div>
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
                                    <span style="color: rgba(255,255,255,0.7); min-width: 90px; font-size: 10px;">Isp:</span>
                                    <span style="color: #fff; font-size: 10px;">${effectiveIsp.toFixed(0)} s</span>
                                </div>
                                <div style="margin-left: 10px; margin-bottom: 3px;">
                                    <span style="color: rgba(255,255,255,0.5); font-size: 9px;">(${baseIsp}s × ${propulsionSkill.toFixed(2)})</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
                                    <span style="color: rgba(255,255,255,0.7); min-width: 90px; font-size: 10px;">Exhaust Vel:</span>
                                    <span style="color: #fff; font-size: 10px;">${exhaustVelocityKmS.toFixed(2)} km/s</span>
                                </div>
                                ${massDriverCount > 0 ? `
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
                                    <span style="color: rgba(255,255,255,0.7); min-width: 90px; font-size: 10px;">Mass Driver:</span>
                                    <span style="color: #ffaa00; font-size: 10px;">${massDriverDeltaV.toFixed(2)} km/s</span>
                                </div>
                                <div style="margin-left: 10px;">
                                    <span style="color: rgba(255,255,255,0.5); font-size: 9px;">(reduces Δv needed)</span>
                                </div>
                                ` : ''}
                            </div>
                            <div style="flex: 1; min-width: 0; border-left: 1px solid rgba(255,255,255,0.1); padding-left: 15px;">
                                <div style="margin-bottom: 5px; color: #87ceeb; font-weight: bold;">Fuel Cost</div>
                                <div id="fuel-details-container" style="font-size: 10px;">
                                    ${hasDestination ? '<span style="color: rgba(255,255,255,0.5);">Calculating...</span>' : '<span style="color: rgba(255,255,255,0.5);">Select destination...</span>'}
                                </div>
                            </div>
                        </div>
                        <button id="transfer-execute-btn" style="
                            margin-top: 8px;
                            padding: 8px 16px;
                            background: ${hasDestination ? transferColor : 'rgba(100,100,100,0.5)'};
                            color: ${hasDestination ? '#000' : 'rgba(255,255,255,0.5)'};
                            border: none;
                            border-radius: 4px;
                            font-family: monospace;
                            font-weight: bold;
                            cursor: ${hasDestination && probeCount > 0 ? 'pointer' : 'not-allowed'};
                            transition: opacity 0.2s;
                        " ${!hasDestination || probeCount === 0 ? 'disabled' : ''}>LAUNCH TRANSFER</button>
                    </div>
                `;
            } else {
                // Metal/methalox transfer: slider for mass driver allocation percentage
                const defaultAllocation = 50; // Default 50%
                
                controlsHTML = `
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <label style="color: ${transferColor}; min-width: 140px;">Mass Driver Allocation:</label>
                            <input type="range" id="transfer-allocation-slider" min="1" max="100" value="${defaultAllocation}" 
                                style="flex: 1; accent-color: ${transferColor};" ${massDriverCount === 0 ? 'disabled' : ''}>
                            <span id="transfer-allocation-pct" style="color: #fff; min-width: 40px; text-align: right;">${defaultAllocation}%</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <span style="color: rgba(255,255,255,0.7); min-width: 140px;">Throughput:</span>
                            <span id="transfer-throughput" style="color: ${transferColor};">Calculating...</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 15px; margin-top: 5px;">
                            <span style="color: rgba(255,255,255,0.5); font-size: 10px;">
                                ${massDriverCount} mass driver${massDriverCount !== 1 ? 's' : ''} in ${fromName} | 
                                ${this.formatMass ? this.formatMass(storedMetal) : storedMetal.toExponential(2)} stored metal
                            </span>
                        </div>
                        <button id="transfer-execute-btn" style="
                            margin-top: 8px;
                            padding: 8px 16px;
                            background: ${transferColor};
                            color: #000;
                            border: none;
                            border-radius: 4px;
                            font-family: monospace;
                            font-weight: bold;
                            cursor: pointer;
                            transition: opacity 0.2s;
                        " ${massDriverCount === 0 ? 'disabled' : ''}>START CONTINUOUS TRANSFER</button>
                    </div>
                `;
            }
            
            transferControlsDiv.innerHTML = controlsHTML;
            
            // Add event listeners
            if (resType === 'probe') {
                const slider = transferControlsDiv.querySelector('#transfer-probe-slider');
                const countSpan = transferControlsDiv.querySelector('#transfer-probe-count');
                const fuelDetailsContainer = transferControlsDiv.querySelector('#fuel-details-container');
                const executeBtn = transferControlsDiv.querySelector('#transfer-execute-btn');
                
                const formatMass = (kg) => {
                    if (kg >= 1e9) return `${(kg / 1e9).toFixed(2)} Mt`;
                    if (kg >= 1e6) return `${(kg / 1e6).toFixed(2)} kt`;
                    if (kg >= 1e3) return `${(kg / 1e3).toFixed(2)} t`;
                    return `${kg.toFixed(0)} kg`;
                };
                
                const updateFuelCost = (count) => {
                    if (!toZoneId || !fuelDetailsContainer) {
                        if (fuelDetailsContainer) {
                            fuelDetailsContainer.innerHTML = '<span style="color: rgba(255,255,255,0.5);">Select a destination to calculate fuel cost</span>';
                        }
                        return;
                    }
                    
                    // Calculate fuel cost based on delta-v required
                    // Use Tsiolkovsky rocket equation for TOTAL trip delta-v, then allocate proportionally
                    const skills = this.gameState?.skills || {};
                    
                    // Use centralized methods from transferSystem if available, otherwise fallback
                    let exhaustVelocityMS;
                    if (this.transferSystem) {
                        exhaustVelocityMS = this.transferSystem.getExhaustVelocity(skills);
                    } else {
                        const propulsionSkill = skills?.propulsion || 1.0;
                        const baseIsp = 500; // Base ISP in seconds
                        const effectiveIsp = baseIsp * propulsionSkill;
                        const g0 = 9.80665; // Standard gravity m/s²
                        exhaustVelocityMS = effectiveIsp * g0;
                    }
                    
                    // Get mass driver muzzle velocity
                    let massDriverDeltaV = 0;
                    if (massDriverCount > 0 && this.transferSystem) {
                        massDriverDeltaV = this.transferSystem.getMassDriverMuzzleVelocity(this.gameState, fromZoneId);
                    } else if (massDriverCount > 0) {
                        massDriverDeltaV = this.getMassDriverMuzzleVelocity ? this.getMassDriverMuzzleVelocity(fromZoneId) : 0;
                    }
                    
                    // Get Hohmann delta-v (use fallback if orbitalMechanics not available)
                    let hohmannDeltaV = 0;
                    if (this.orbitalMechanics) {
                        hohmannDeltaV = this.orbitalMechanics.getHohmannDeltaVKmS(fromZoneId, toZoneId);
                    } else {
                        hohmannDeltaV = this.getHohmannDeltaVKmS(fromZoneId, toZoneId);
                    }
                    
                    // Get escape delta-v (use fallback if orbitalMechanics not available)
                    const fromZoneMass = fromZoneData.mass_remaining !== undefined ? fromZoneData.mass_remaining : (fromZone?.total_mass_kg || 0);
                    let escapeDeltaV = 0;
                    if (this.orbitalMechanics) {
                        escapeDeltaV = this.orbitalMechanics.calculateEscapeDeltaV(fromZoneId, fromZoneMass);
                    } else {
                        escapeDeltaV = this.calculateEscapeDeltaV(fromZoneId, fromZoneMass);
                    }
                    
                    const totalRequiredDeltaV = escapeDeltaV + hohmannDeltaV;
                    
                    // Calculate TOTAL fuel for the entire trip using Tsiolkovsky
                    // Get probe mass from centralized method if available
                    const probeMassKg = this.transferSystem?.getProbeMass() || 100;
                    const totalDeltaVMS = totalRequiredDeltaV * 1000;
                    const totalFuelPerProbeKg = probeMassKg * (Math.exp(totalDeltaVMS / exhaustVelocityMS) - 1);
                    const totalFuelAllProbesKg = totalFuelPerProbeKg * count;
                    
                    // Calculate how delta-v is allocated between mass driver and probe
                    // Mass driver provides boost up to its capacity (capped at total required)
                    const massDriverContribution = Math.min(massDriverDeltaV, totalRequiredDeltaV);
                    const probeContribution = Math.max(0, totalRequiredDeltaV - massDriverContribution);
                    
                    // Allocate fuel cost PROPORTIONALLY based on delta-v makeup
                    // Probe fuel = (probe delta-v / total delta-v) × total fuel
                    // Fuel savings = (mass driver delta-v / total delta-v) × total fuel
                    let probeFuelFraction = 1.0;
                    let massDriverFuelFraction = 0.0;
                    if (totalRequiredDeltaV > 0) {
                        probeFuelFraction = probeContribution / totalRequiredDeltaV;
                        massDriverFuelFraction = massDriverContribution / totalRequiredDeltaV;
                    }
                    
                    const fuelPerProbeKg = totalFuelPerProbeKg * probeFuelFraction;
                    const totalFuelKg = fuelPerProbeKg * count;
                    const fuelSavingsKg = totalFuelAllProbesKg * massDriverFuelFraction;
                    const fuelSavingsPct = massDriverFuelFraction * 100;
                    
                    // Build detailed fuel display (compact for column layout)
                    let fuelHTML = '';
                    
                    // Required Δv
                    fuelHTML += `<div style="margin-bottom: 3px;">`;
                    fuelHTML += `<span style="color: rgba(255,255,255,0.7);">Required Δv: </span>`;
                    fuelHTML += `<span style="color: #ff4444;">${totalRequiredDeltaV.toFixed(2)} km/s</span>`;
                    fuelHTML += `</div>`;
                    fuelHTML += `<div style="margin-left: 8px; margin-bottom: 3px; font-size: 9px; color: rgba(255,255,255,0.5);">`;
                    fuelHTML += `(esc: ${escapeDeltaV.toFixed(2)} + Hoh: ${hohmannDeltaV.toFixed(2)})`;
                    fuelHTML += `</div>`;
                    
                    if (massDriverCount > 0 && massDriverDeltaV > 0) {
                        fuelHTML += `<div style="margin-bottom: 3px;">`;
                        fuelHTML += `<span style="color: rgba(255,255,255,0.7);">MD Provides: </span>`;
                        fuelHTML += `<span style="color: #ffaa00;">${massDriverContribution.toFixed(2)} km/s</span>`;
                        fuelHTML += `</div>`;
                        
                        fuelHTML += `<div style="margin-bottom: 3px;">`;
                        fuelHTML += `<span style="color: rgba(255,255,255,0.7);">Probe Δv: </span>`;
                        fuelHTML += `<span style="color: #fff;">${probeContribution.toFixed(2)} km/s</span>`;
                        fuelHTML += `</div>`;
                    }
                    
                    fuelHTML += `<div style="margin-top: 5px; padding-top: 5px; border-top: 1px solid rgba(255,255,255,0.1);">`;
                    fuelHTML += `<span style="color: rgba(255,255,255,0.7);">Methalox: </span>`;
                    fuelHTML += `<span style="color: #87ceeb; font-weight: bold;">${formatMass(totalFuelKg)}</span>`;
                    fuelHTML += `<div style="font-size: 9px; color: rgba(255,255,255,0.5);">(${formatMass(fuelPerProbeKg)}/probe)</div>`;
                    fuelHTML += `</div>`;
                    
                    if (massDriverCount > 0 && fuelSavingsKg > 0) {
                        fuelHTML += `<div style="margin-top: 3px;">`;
                        fuelHTML += `<span style="color: rgba(255,255,255,0.7);">MD Saves: </span>`;
                        fuelHTML += `<span style="color: #4aff4a;">${formatMass(fuelSavingsKg)}</span>`;
                        fuelHTML += `<div style="font-size: 9px; color: rgba(255,255,255,0.5);">(${fuelSavingsPct.toFixed(0)}% of fuel)</div>`;
                        fuelHTML += `</div>`;
                    }
                    
                    fuelDetailsContainer.innerHTML = fuelHTML;
                };
                
                if (slider) {
                    slider.addEventListener('input', (e) => {
                        const count = parseInt(e.target.value);
                        countSpan.textContent = count;
                        updateFuelCost(count);
                    });
                    
                    // Initial fuel cost calculation
                    updateFuelCost(parseInt(slider.value));
                }
                
                if (executeBtn && toZoneId) {
                    executeBtn.addEventListener('click', () => {
                        const count = parseInt(slider?.value || 1);
                        this.createTransfer(fromZoneId, toZoneId, 'probe', 'one-time', count, 0);
                        this.showQuickMessage(`Transferring ${count} probe${count > 1 ? 's' : ''} to ${toName}`);
                        this.closeTransferMenu();
                    });
                }
            } else {
                const slider = transferControlsDiv.querySelector('#transfer-allocation-slider');
                const pctSpan = transferControlsDiv.querySelector('#transfer-allocation-pct');
                const throughputSpan = transferControlsDiv.querySelector('#transfer-throughput');
                const executeBtn = transferControlsDiv.querySelector('#transfer-execute-btn');
                
                const updateThroughput = (pct) => {
                    // Calculate throughput based on mass driver capacity
                    if (this.transferSystem && massDriverCount > 0) {
                        const baseThroughput = this.transferSystem.calculateMassDriverThroughput(this.gameState, fromZoneId, toZoneId);
                        const allocatedThroughput = baseThroughput * (pct / 100);
                        
                        if (allocatedThroughput >= 1e6) {
                            throughputSpan.textContent = `${(allocatedThroughput / 1e6).toFixed(2)} kt/day`;
                        } else if (allocatedThroughput >= 1e3) {
                            throughputSpan.textContent = `${(allocatedThroughput / 1e3).toFixed(2)} t/day`;
                        } else {
                            throughputSpan.textContent = `${allocatedThroughput.toFixed(0)} kg/day`;
                        }
                    } else {
                        throughputSpan.textContent = 'No mass driver available';
                    }
                };
                
                if (slider) {
                    slider.addEventListener('input', (e) => {
                        const pct = parseInt(e.target.value);
                        pctSpan.textContent = `${pct}%`;
                        updateThroughput(pct);
                    });
                    
                    // Initial throughput calculation
                    updateThroughput(parseInt(slider.value));
                }
                
                if (executeBtn) {
                    executeBtn.addEventListener('click', () => {
                        const pct = parseInt(slider?.value || 50);
                        this.createTransfer(fromZoneId, toZoneId, 'metal', 'continuous', 0, pct);
                        this.showQuickMessage(`Metal transfer to ${toName} started (${pct}%)`);
                        this.closeTransferMenu();
                    });
                }
            }
        };
        
        contentDiv.appendChild(canvasContainer);
        contentDiv.appendChild(transferControlsDiv);
        contentDiv.appendChild(upgradesDiv);
        windowDiv.appendChild(header);
        windowDiv.appendChild(contentDiv);
        
        // Append to body to ensure it's visible (not inside a hidden container)
        document.body.appendChild(windowDiv);
        console.log('[Delta-V Overlay] Window appended to body, dimensions:', windowDiv.offsetWidth, 'x', windowDiv.offsetHeight);
        
        // Draw the chart - check if it succeeds
        try {
            this.drawOverlayChart(canvas, sourceZone, resourceType);
            
            // Store references for cleanup
            this.deltaVOverlayCanvas = canvas;
            this.deltaVOverlayWindow = windowDiv;
            this.deltaVOverlayResizeObserver = resizeObserver;
            this.deltaVOverlayVisible = true;
            this.deltaVOverlaySourceZone = sourceZone;
            this.deltaVOverlayResourceType = resourceType;
            
            console.log('[Delta-V Overlay] Window created and drawn');
        } catch (error) {
            console.error('[Delta-V Overlay] Failed to draw overlay:', error);
            // Clean up on failure
            windowDiv.remove();
            resizeObserver.disconnect();
            this.showQuickMessage('Failed to show delta-v overlay. Please try again.');
        }
    }
    
    /**
     * Hide delta-v overlay
     */
    hideDeltaVOverlay() {
        if (this.deltaVOverlayWindow) {
            this.deltaVOverlayWindow.remove();
            this.deltaVOverlayWindow = null;
        }
        if (this.deltaVOverlayResizeObserver) {
            this.deltaVOverlayResizeObserver.disconnect();
            this.deltaVOverlayResizeObserver = null;
        }
        this.deltaVOverlayCanvas = null;
        this.deltaVOverlayVisible = false;
        this.deltaVOverlaySourceZone = null;
        this.deltaVOverlayResourceType = null;
    }
    
    /**
     * Show transfer menu (delta-v window)
     */
    showTransferMenu() {
        if (!this.transferSourceZone) {
            console.warn('[Transfer Menu] No origin zone selected');
            return;
        }
        
        // Show delta-v overlay with transfer menu mode
        this.showDeltaVOverlay();
    }
    
    /**
     * Close transfer menu
     */
    closeTransferMenu() {
        this.transferMenuOpen = false;
        this.transferMenuMode = null;
        this.transferSourceZone = null;
        this.transferDestinationZone = null;
        this.waitingForTransferDestination = false;
        this.hideDeltaVOverlay();
        this.render(); // Re-render to remove transfer highlights
    }
    
    /**
     * Update transfer menu display
     */
    updateTransferMenu() {
        if (!this.transferMenuOpen || !this.deltaVOverlayCanvas) return;
        
        const resourceType = this.transferMenuMode || 'probe';
        this.drawOverlayChart(this.deltaVOverlayCanvas, this.transferSourceZone, resourceType);
        
        // Update upgrades section
        const upgradesDiv = document.getElementById('delta-v-upgrades');
        if (upgradesDiv) {
            this.populateUpgradesSection(upgradesDiv, this.transferSourceZone, resourceType).catch(err => {
                console.error('[Transfer Menu] Failed to populate upgrades:', err);
            });
        }
    }
    
    /**
     * Launch transfer (called when spacebar pressed with destination selected)
     */
    launchTransfer() {
        if (!this.transferSourceZone || !this.transferDestinationZone || !this.transferMenuMode) {
            this.showQuickMessage('Select origin and destination zones first');
            return;
        }
        
        if (this.transferMenuMode === 'probe') {
            // One-time transfer of 1 probe
            this.createTransfer(this.transferSourceZone, this.transferDestinationZone, 'probe', 'one-time', 1, 0);
            this.showQuickMessage(`Transferring 1 probe from ${this.getZoneName(this.transferSourceZone)} to ${this.getZoneName(this.transferDestinationZone)}`);
        } else if (this.transferMenuMode === 'metal') {
            // Continuous transfer of 10% stored metal
            this.createTransfer(this.transferSourceZone, this.transferDestinationZone, 'metal', 'continuous', 0, 10);
            this.showQuickMessage(`Metal transfer from ${this.getZoneName(this.transferSourceZone)} to ${this.getZoneName(this.transferDestinationZone)} started (10%)`);
        }
        
        // Close transfer menu
        this.closeTransferMenu();
    }
    
    /**
     * Populate upgrades section with detailed breakdown
     * Note: Delta-V upgrades have been removed. Transfer details are appended by updateTransferDetails().
     */
    async populateUpgradesSection(container, fromZoneId, resourceType) {
        // Try to acquire engine instances if not already available
        if (!this.orbitalMechanics || !this.transferSystem) {
            if (window.gameEngine && window.gameEngine.engine) {
                if (window.gameEngine.engine.orbitalMechanics && !this.orbitalMechanics) {
                    this.orbitalMechanics = window.gameEngine.engine.orbitalMechanics;
                }
                if (window.gameEngine.engine.transferSystem && !this.transferSystem) {
                    this.transferSystem = window.gameEngine.engine.transferSystem;
                }
            }
        }
        
        // Clear container - transfer details will be appended by updateTransferDetails() when destination is selected
        container.innerHTML = '';
    }
    
    /**
     * Update transfer details section when origin and destination are selected
     */
    async updateTransferDetails(container, fromZoneId, toZoneId, resourceType) {
        // Try to acquire engine instances if not already available
        if (!this.orbitalMechanics || !this.transferSystem) {
            if (window.gameEngine && window.gameEngine.engine) {
                if (window.gameEngine.engine.orbitalMechanics && !this.orbitalMechanics) {
                    this.orbitalMechanics = window.gameEngine.engine.orbitalMechanics;
                }
                if (window.gameEngine.engine.transferSystem && !this.transferSystem) {
                    this.transferSystem = window.gameEngine.engine.transferSystem;
                }
            }
        }
        
        if (!this.gameState) {
            return;
        }
        
        const skills = this.gameState.skills || {};
        const zones = this.gameState.zones || {};
        const fromZoneData = zones[fromZoneId] || {};
        const fromZone = this.orbitalZones?.find(z => z.id === fromZoneId);
        const toZone = this.orbitalZones?.find(z => z.id === toZoneId);
        
        if (!fromZone || !toZone) return;
        
        // Get zone mass for escape velocity calculation
        const fromZoneMass = fromZoneData.mass_remaining !== undefined && fromZoneData.mass_remaining !== null
            ? fromZoneData.mass_remaining
            : (fromZone.total_mass_kg || 0);
        
        // Calculate total required delta-v (escape + Hohmann)
        const escapeDeltaV = this.orbitalMechanics 
            ? this.orbitalMechanics.calculateEscapeDeltaV(fromZoneId, fromZoneMass)
            : this.calculateEscapeDeltaV(fromZoneId, fromZoneMass);
        const hohmannDeltaV = this.orbitalMechanics
            ? this.orbitalMechanics.getHohmannDeltaVKmS(fromZoneId, toZoneId)
            : this.getHohmannDeltaVKmS(fromZoneId, toZoneId);
        const totalRequiredDeltaV = escapeDeltaV + hohmannDeltaV;
        
        // Calculate available capacity
        let availableCapacity = 0;
        const probeDvBonus = this.gameState?.skill_bonuses?.probe_dv_bonus || 0;
        if (resourceType === 'probe') {
            const probeCapacity = this.orbitalMechanics
                ? this.orbitalMechanics.getProbeDeltaVCapacity(skills, probeDvBonus)
                : this.getProbeDeltaVCapacity(skills);
            const structuresByZone = this.gameState.structures_by_zone || {};
            const zoneStructures = structuresByZone[fromZoneId] || {};
            const hasMassDriver = (zoneStructures['mass_driver'] || 0) > 0;
            let massDriverCapacity = 0;
            if (hasMassDriver) {
                if (this.transferSystem) {
                    massDriverCapacity = this.transferSystem.getMassDriverMuzzleVelocity(this.gameState, fromZoneId);
                } else {
                    massDriverCapacity = this.getMassDriverMuzzleVelocity(fromZoneId);
                }
            }
            availableCapacity = probeCapacity + massDriverCapacity;
        } else {
            // Metal transfer - mass driver only
            if (this.transferSystem) {
                availableCapacity = this.transferSystem.getMassDriverMuzzleVelocity(this.gameState, fromZoneId);
            } else {
                availableCapacity = this.getMassDriverMuzzleVelocity(fromZoneId);
            }
        }
        
        // Calculate transfer time
        let transferTimeDays = 0;
        if (this.orbitalMechanics) {
            const probeDvBonusTime = this.gameState?.skill_bonuses?.probe_dv_bonus || 0;
            transferTimeDays = this.orbitalMechanics.calculateTransferTime(fromZoneId, toZoneId, skills, probeDvBonusTime);
        } else {
            // Fallback: estimate transfer time using Hohmann transfer period
            // T = π * sqrt((a^3) / μ) where a is semi-major axis
            if (!this.SUN_MU) {
                this.initializeInlineCalculations();
            }
            const r1_km = fromZone.radius_km || 0;
            const r2_km = toZone.radius_km || 0;
            const rInner = Math.min(r1_km, r2_km) * 1000; // Convert to meters
            const rOuter = Math.max(r1_km, r2_km) * 1000;
            const semiMajorAxis = (rInner + rOuter) / 2;
            const periodSeconds = Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / this.SUN_MU);
            transferTimeDays = periodSeconds / (24 * 3600); // Convert to days
        }
        
        // Calculate distance (arc length of Hohmann transfer)
        const r1_au = fromZone.radius_au || (fromZone.radius_km / 149597870.7);
        const r2_au = toZone.radius_au || (toZone.radius_km / 149597870.7);
        const rInner = Math.min(r1_au, r2_au);
        const rOuter = Math.max(r1_au, r2_au);
        const semiMajorAxis = (rInner + rOuter) / 2;
        const eccentricity = (rOuter - rInner) / (rOuter + rInner);
        const semiMinorAxis = semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity);
        const a = semiMajorAxis;
        const b = semiMinorAxis;
        const h = Math.pow((a - b) / (a + b), 2);
        const fullCircumference = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
        const arcLengthAU = fullCircumference / 2; // Half-orbit for Hohmann transfer
        
        // Build HTML for transfer details
        let html = '<div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid rgba(255,255,255,0.3);">';
        html += '<div style="margin-bottom: 10px;"><strong style="color: #4a9eff;">Transfer Details</strong></div>';
        
        html += `<div style="margin-bottom: 8px;">`;
        html += `<div style="margin-left: 10px; margin-bottom: 3px;"><strong>Origin:</strong> <span style="color: #fff;">${fromZone.name.replace(/\s+Orbit\s*$/i, '')}</span></div>`;
        html += `<div style="margin-left: 10px; margin-bottom: 3px;"><strong>Destination:</strong> <span style="color: #fff;">${toZone.name.replace(/\s+Orbit\s*$/i, '')}</span></div>`;
        html += `</div>`;
        
        html += `<div style="margin-bottom: 8px;">`;
        html += `<div style="margin-left: 10px; margin-bottom: 3px;"><strong>Trip Distance:</strong> <span style="color: #fff;">${arcLengthAU.toFixed(2)}</span> AU</div>`;
        html += `<div style="margin-left: 10px; margin-bottom: 3px;"><strong>Delta-V Cost:</strong> <span style="color: #ff4444;">${totalRequiredDeltaV.toFixed(2)}</span> km/s</div>`;
        
        // Show breakdown of delta-v budget
        html += `<div style="margin-left: 10px; margin-bottom: 3px;"><strong>Delta-V Budget:</strong> <span style="color: #4aff4a;">${availableCapacity.toFixed(2)}</span> km/s</div>`;
        if (resourceType === 'probe') {
            const probeDvBonus2 = this.gameState?.skill_bonuses?.probe_dv_bonus || 0;
            const probeCapacity = this.orbitalMechanics
                ? this.orbitalMechanics.getProbeDeltaVCapacity(skills, probeDvBonus2)
                : this.getProbeDeltaVCapacity(skills);
            const structuresByZone = this.gameState.structures_by_zone || {};
            const zoneStructures = structuresByZone[fromZoneId] || {};
            const hasMassDriver = (zoneStructures['mass_driver'] || 0) > 0;
            let massDriverCapacity = 0;
            if (hasMassDriver) {
                if (this.transferSystem) {
                    massDriverCapacity = this.transferSystem.getMassDriverMuzzleVelocity(this.gameState, fromZoneId);
                } else {
                    massDriverCapacity = this.getMassDriverMuzzleVelocity(fromZoneId);
                }
            }
            html += `<div style="margin-left: 20px; margin-bottom: 2px; font-size: 10px; color: rgba(255,255,255,0.8);">`;
            html += `Probe Capacity: <span style="color: #4aff4a;">${probeCapacity.toFixed(2)}</span> km/s`;
            if (massDriverCapacity > 0) {
                html += ` + Mass Driver: <span style="color: #ffaa00;">${massDriverCapacity.toFixed(2)}</span> km/s`;
            }
            html += `</div>`;
        } else {
            // Metal transfer
            let massDriverCapacity = 0;
            if (this.transferSystem) {
                massDriverCapacity = this.transferSystem.getMassDriverMuzzleVelocity(this.gameState, fromZoneId);
            } else {
                massDriverCapacity = this.getMassDriverMuzzleVelocity(fromZoneId);
            }
            if (massDriverCapacity > 0) {
                html += `<div style="margin-left: 20px; margin-bottom: 2px; font-size: 10px; color: rgba(255,255,255,0.8);">`;
                html += `Mass Driver Muzzle Velocity: <span style="color: #ffaa00;">${massDriverCapacity.toFixed(2)}</span> km/s`;
                html += `</div>`;
            }
        }
        
        html += `<div style="margin-left: 10px; margin-bottom: 3px;"><strong>Estimated Time:</strong> <span style="color: #4a9eff;">${transferTimeDays.toFixed(1)}</span> days</div>`;
        html += `</div>`;
        
        // Show metal transfer throughput if applicable
        if (resourceType === 'metal') {
            let throughput = 0;
            let powerMW = 0;
            let efficiency = 0;
            let muzzleVelocity = 0;
            
            if (this.transferSystem) {
                throughput = this.transferSystem.calculateMassDriverThroughput(this.gameState, fromZoneId, toZoneId);
                powerMW = this.transferSystem.getMassDriverPowerDraw(this.gameState, fromZoneId);
                efficiency = this.transferSystem.getMassDriverEfficiency(this.gameState, fromZoneId);
                muzzleVelocity = this.transferSystem.getMassDriverMuzzleVelocity(this.gameState, fromZoneId);
            } else {
                // Fallback: use inline methods
                powerMW = this.getMassDriverPowerDraw(fromZoneId);
                efficiency = this.getMassDriverEfficiency(fromZoneId);
                muzzleVelocity = this.getMassDriverMuzzleVelocity(fromZoneId);
                
                // Calculate throughput: P * efficiency / (0.5 * v^2) where P is power in W, v is velocity in m/s
                // Throughput in kg/s = (Power_W * efficiency) / (0.5 * velocity_m_s^2)
                // Convert to kg/day: multiply by 86400 seconds/day
                if (muzzleVelocity > 0 && efficiency > 0) {
                    const velocityMS = muzzleVelocity * 1000; // Convert km/s to m/s
                    const powerW = powerMW * 1e6; // Convert MW to W
                    const throughputKgS = (powerW * efficiency) / (0.5 * velocityMS * velocityMS);
                    throughput = throughputKgS * 86400; // Convert to kg/day
                }
            }
            
            if (muzzleVelocity > 0) {
                html += `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1);">`;
                html += `<div style="margin-left: 10px; margin-bottom: 5px;"><strong style="color: #ffaa00;">Metal Transfer Rate</strong></div>`;
                html += `<div style="margin-left: 15px; margin-bottom: 2px; font-size: 10px;">Power: <span style="color: #fff;">${powerMW.toFixed(0)}</span> MW</div>`;
                html += `<div style="margin-left: 15px; margin-bottom: 2px; font-size: 10px;">Efficiency: <span style="color: #fff;">${(efficiency * 100).toFixed(1)}</span>%</div>`;
                html += `<div style="margin-left: 15px; margin-bottom: 2px; font-size: 10px;">Muzzle Velocity: <span style="color: #fff;">${muzzleVelocity.toFixed(2)}</span> km/s</div>`;
                html += `<div style="margin-left: 15px; margin-bottom: 5px; font-size: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 3px;">`;
                html += `<strong>Throughput:</strong> <span style="color: #4aff4a;">${(throughput / 1000).toFixed(2)}</span> kg/day</div>`;
                html += `</div>`;
            }
        }
        
        html += '</div>';
        
        // Append to container
        const detailsDiv = document.createElement('div');
        detailsDiv.id = 'transfer-details';
        detailsDiv.innerHTML = html;
        
        // Remove existing transfer details if any
        const existingDetails = container.querySelector('#transfer-details');
        if (existingDetails) {
            existingDetails.remove();
        }
        
        container.appendChild(detailsDiv);
    }
    
    /**
     * Draw delta-v capacity chart as full-screen overlay (for quick transfer mode)
     * New design: columns for each zone, with escape velocity bars and transfer bars
     */
    drawOverlayChart(canvas, fromZoneId, resourceType) {
        // Try to acquire engine instances if not already available
        if (!this.orbitalMechanics || !this.transferSystem) {
            if (window.gameEngine && window.gameEngine.engine) {
                if (window.gameEngine.engine.orbitalMechanics && !this.orbitalMechanics) {
                    this.orbitalMechanics = window.gameEngine.engine.orbitalMechanics;
                }
                if (window.gameEngine.engine.transferSystem && !this.transferSystem) {
                    this.transferSystem = window.gameEngine.engine.transferSystem;
                }
            }
        }
        
        if (!this.orbitalZones || !this.gameState) {
            console.warn('[Delta-V Overlay] Cannot draw chart: orbital zones or game state not available', {
                hasOrbitalZones: !!this.orbitalZones,
                hasGameState: !!this.gameState,
                hasOrbitalMechanics: !!this.orbitalMechanics
            });
            return;
        }
        
        // If orbitalMechanics is still not available, use inline calculations as fallback
        // (no warning - fallback is expected during early initialization)
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width || canvas.offsetWidth || 600;
        const height = canvas.height || canvas.offsetHeight || 400;
        
        // Ensure canvas has valid dimensions
        if (width <= 0 || height <= 0) {
            console.warn('[Delta-V Overlay] Canvas has invalid dimensions:', { width, height });
            return;
        }
        
        // Set canvas size if not already set
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Padding for chart area (increased right padding for mass axis, increased bottom for transfer indicator)
        const padding = { top: 60, right: 70, bottom: 120, left: 80 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        // Get all zones including Dyson sphere, sorted by radius_au
        const allZones = [...(this.orbitalZones || [])].sort((a, b) => (a.radius_au || 0) - (b.radius_au || 0));
        
        if (allZones.length === 0) return;
        
        // Find source zone
        const sourceZone = allZones.find(z => z.id === fromZoneId);
        if (!sourceZone) return;
        
        // Get skills from game state - ensure we're using the correct skills object
        // Try both locations where skills might be stored
        const skills = this.gameState?.skills || this.gameState?.research?.skills || {};
        
        // Get zone mass for escape velocity calculation
        const zones = this.gameState?.zones || {};
        const fromZoneData = zones[fromZoneId] || {};
        const fromZoneMass = fromZoneData.mass_remaining !== undefined && fromZoneData.mass_remaining !== null
            ? fromZoneData.mass_remaining
            : (sourceZone.total_mass_kg || 0);
        
        // Calculate escape velocity and capacity
        // Escape velocity scales with remaining planetary mass
        let escapeDeltaV = 0;
        let probeCapacity = 1.0;
        let baseProbeCapacity = 1.0;
        const probeDvBonus = this.gameState?.skill_bonuses?.probe_dv_bonus || 0;
        
        if (this.orbitalMechanics) {
            // Use engine system if available
            escapeDeltaV = this.orbitalMechanics.calculateEscapeDeltaV(fromZoneId, fromZoneMass);
            if (this.economicRules && this.economicRules.probe_transfer) {
                // Include skill point bonus in base capacity
                baseProbeCapacity = (this.economicRules.probe_transfer.base_delta_v_km_s || 1.0) + probeDvBonus;
            }
            probeCapacity = this.orbitalMechanics.getProbeDeltaVCapacity(skills, probeDvBonus);
        } else {
            // Fallback: use inline calculations with economic rules
            escapeDeltaV = this.calculateEscapeDeltaV(fromZoneId, fromZoneMass);
            if (this.economicRules && this.economicRules.probe_transfer) {
                // Include skill point bonus in base capacity
                baseProbeCapacity = (this.economicRules.probe_transfer.base_delta_v_km_s || 1.0) + probeDvBonus;
            }
            // Use inline method that reads from economic rules (already includes bonus)
            probeCapacity = this.getProbeDeltaVCapacity(skills);
        }
        
        // Get mass driver capacity if available
        // Mass driver muzzle velocity uses weighted sum formula for upgrades
        let massDriverCapacity = 0;
        let baseMassDriverCapacity = 0;
        const structuresByZone = this.gameState?.structures_by_zone || {};
        const zoneStructures = structuresByZone[fromZoneId] || {};
        const hasMassDriver = (zoneStructures['mass_driver'] || 0) > 0;
        
        if (hasMassDriver) {
            if (this.transferSystem) {
                // Use engine system if available
                baseMassDriverCapacity = 3.0; // Default base value
                massDriverCapacity = this.transferSystem.getMassDriverMuzzleVelocity(this.gameState, fromZoneId);
            } else {
                // Fallback: use inline calculations with economic rules
                // Get base muzzle velocity from buildings.json or use default
                baseMassDriverCapacity = 3.0; // Default
                if (this.buildings && this.buildings.mass_driver) {
                    baseMassDriverCapacity = this.buildings.mass_driver.base_muzzle_velocity_km_s || 3.0;
                }
                // Use inline method that reads from economic rules
                massDriverCapacity = this.getMassDriverMuzzleVelocity(fromZoneId);
            }
        }
        
        // Determine total available capacity based on resource type
        // IMPORTANT: For probes, total available = probe capacity + mass driver muzzle velocity
        //            For metal, total available = mass driver muzzle velocity only
        // This is the total delta-v available for transfers shown in the green bar
        const availableCapacity = resourceType === 'probe' 
            ? (probeCapacity + massDriverCapacity)  // Combined capacity for probes: probe propulsion + mass driver assist
            : massDriverCapacity;  // Mass driver only for metal transfers
        
        // Calculate Hohmann transfer delta-v for all zones
        const zoneData = [];
        // Fixed y-axis limits: positive axis up to 30 km/s, negative axis down to -20 km/s
        const maxPositiveDeltaV = 30; // Upper limit for positive y-axis (km/s)
        const maxNegativeDeltaV = 20; // Lower limit magnitude for negative y-axis (km/s)
        let maxDeltaV = maxPositiveDeltaV; // For backwards compatibility with some calculations
        
        // Collect mass data for all zones (for background mass bars)
        const massData = [];
        let minMass = Infinity;
        let maxMass = 0;
        for (const zone of allZones) {
            const zoneStateData = zones[zone.id] || {};
            const mass = zoneStateData.mass_remaining !== undefined && zoneStateData.mass_remaining !== null
                ? zoneStateData.mass_remaining
                : (zone.total_mass_kg || 0);
            massData.push({ zoneId: zone.id, mass: mass });
            if (mass > 0) {
                minMass = Math.min(minMass, mass);
                maxMass = Math.max(maxMass, mass);
            }
        }
        // Handle edge case where all masses are 0 or minMass wasn't set
        if (minMass === Infinity || minMass === 0) minMass = 1;
        if (maxMass === 0) maxMass = 1e30; // Fallback
        
        for (const zone of allZones) {
            if (zone.id === fromZoneId) {
                // Source zone - store escape and capacity data
                zoneData.push({
                    zone: zone,
                    isSource: true,
                    escapeDeltaV: escapeDeltaV,
                    capacityDeltaV: availableCapacity,
                    hohmannDeltaV: 0
                });
                // Using fixed axis limits, no dynamic maxDeltaV update needed
            } else {
                // Other zones - store Hohmann transfer delta-v and calculate reachability
                let hohmannDeltaV = 0;
                if (this.orbitalMechanics) {
                    hohmannDeltaV = this.orbitalMechanics.getHohmannDeltaVKmS(fromZoneId, zone.id);
                } else {
                    // Fallback: use inline calculation
                    hohmannDeltaV = this.getHohmannDeltaVKmS(fromZoneId, zone.id);
                }
                
                // Calculate escape velocity for this zone
                const zoneStateData = zones[zone.id] || {};
                const zoneMass = zoneStateData.mass_remaining !== undefined && zoneStateData.mass_remaining !== null
                    ? zoneStateData.mass_remaining
                    : (zone.total_mass_kg || 0);
                let zoneEscapeDeltaV = 0;
                if (this.orbitalMechanics) {
                    zoneEscapeDeltaV = this.orbitalMechanics.calculateEscapeDeltaV(zone.id, zoneMass);
                } else {
                    zoneEscapeDeltaV = this.calculateEscapeDeltaV(zone.id, zoneMass);
                }
                
                // Calculate total required delta-v (escape + Hohmann) for reachability check
                const totalRequiredDeltaV = escapeDeltaV + hohmannDeltaV;
                
                // Check if this zone is reachable with current upgraded capacity
                // For metal transfers, also require a mass driver to be present
                let isReachable = false;
                if (resourceType === 'metal') {
                    // Metal transfers require a mass driver
                    isReachable = hasMassDriver && (availableCapacity >= totalRequiredDeltaV);
                } else {
                    // Probe transfers can use probe capacity + mass driver (if available)
                    isReachable = availableCapacity >= totalRequiredDeltaV;
                }
                
                zoneData.push({
                    zone: zone,
                    isSource: false,
                    escapeDeltaV: zoneEscapeDeltaV,  // Store this zone's escape velocity
                    capacityDeltaV: 0,
                    hohmannDeltaV: hohmannDeltaV,
                    totalRequiredDeltaV: totalRequiredDeltaV,
                    isReachable: isReachable
                });
                // Using fixed axis limits, no dynamic maxDeltaV update needed
            }
        }
        
        // Fixed axis limits are already set (no dynamic padding needed)
        
        // Calculate column positions
        const numZones = allZones.length;
        const columnWidth = chartWidth / numZones;
        const barWidth = columnWidth * 0.6; // Bars are 60% of column width
        
        // Calculate zero line position (1/3 of the way up from bottom, so 2/3 down from top)
        const zeroY = padding.top + chartHeight * (2/3);
        
        // Calculate available space above and below zero line
        const spaceAboveZero = zeroY - padding.top;
        const spaceBelowZero = (padding.top + chartHeight) - zeroY;
        
        // Helper function to convert delta-v to Y coordinate (0 at 1/3 from bottom, positive up, negative down)
        // Uses fixed axis limits: +30 km/s at top, -20 km/s at bottom
        const deltaVToY = (deltaV) => {
            if (deltaV >= 0) {
                // Positive values go upward from zero, scaled to maxPositiveDeltaV (30 km/s)
                const normalized = deltaV / maxPositiveDeltaV;
                return zeroY - (normalized * spaceAboveZero);
            } else {
                // Negative values go downward from zero, scaled to maxNegativeDeltaV (20 km/s)
                const normalized = Math.abs(deltaV) / maxNegativeDeltaV;
                return zeroY + (normalized * spaceBelowZero);
            }
        };
        
        // Draw background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, width, height);
        
        // Draw mass bars (dark brown, behind everything else) on log scale
        // Uses a secondary y-axis on the right side, shares zero line with delta-v
        const logMinMass = Math.log10(minMass);
        const logMaxMass = Math.log10(maxMass);
        const logMassRange = logMaxMass - logMinMass || 1; // Avoid division by zero
        
        for (let i = 0; i < massData.length; i++) {
            const { mass } = massData[i];
            if (mass <= 0) continue; // Skip zones with no mass
            
            const x = padding.left + (i * columnWidth) + (columnWidth - barWidth) / 2;
            
            // Calculate bar height using log scale - extends upward from zero line
            const logMass = Math.log10(mass);
            const normalizedMass = (logMass - logMinMass) / logMassRange;
            const barHeight = normalizedMass * spaceAboveZero;
            const barTop = zeroY - barHeight; // Starts at zero line, extends upward
            
            // Dark brown color for mass
            ctx.fillStyle = 'rgba(101, 67, 33, 0.5)'; // Dark brown with transparency
            ctx.fillRect(x, barTop, barWidth, barHeight);
        }
        
        // Draw secondary y-axis labels (mass, right side) - log scale, above zero line
        ctx.fillStyle = 'rgba(139, 90, 43, 0.9)'; // Saddle brown for labels
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        
        // Draw 5 labels from zero line up to top (min mass at zero, max at top)
        for (let i = 0; i <= 4; i++) {
            const fraction = i / 4;
            // i=0 is at zero line (min mass), i=4 is at top (max mass)
            const logValue = logMinMass + (fraction * logMassRange);
            const massValue = Math.pow(10, logValue);
            const y = zeroY - (fraction * spaceAboveZero);
            
            // Format mass with appropriate suffix
            let massLabel;
            if (massValue >= 1e24) {
                massLabel = (massValue / 1e24).toFixed(1) + ' Yg';
            } else if (massValue >= 1e21) {
                massLabel = (massValue / 1e21).toFixed(1) + ' Zg';
            } else if (massValue >= 1e18) {
                massLabel = (massValue / 1e18).toFixed(1) + ' Eg';
            } else if (massValue >= 1e15) {
                massLabel = (massValue / 1e15).toFixed(1) + ' Pg';
            } else if (massValue >= 1e12) {
                massLabel = (massValue / 1e12).toFixed(1) + ' Tg';
            } else if (massValue >= 1e9) {
                massLabel = (massValue / 1e9).toFixed(1) + ' Gg';
            } else if (massValue >= 1e6) {
                massLabel = (massValue / 1e6).toFixed(1) + ' Mg';
            } else if (massValue >= 1e3) {
                massLabel = (massValue / 1e3).toFixed(1) + ' kg';
            } else {
                massLabel = massValue.toFixed(1) + ' g';
            }
            
            ctx.fillText(massLabel, width - padding.right + 5, y + 4);
            
            // Draw tick mark
            ctx.strokeStyle = 'rgba(139, 90, 43, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(width - padding.right, y);
            ctx.lineTo(width - padding.right + 4, y);
            ctx.stroke();
        }
        
        // Draw zero line (thicker, more visible)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding.left, zeroY);
        ctx.lineTo(width - padding.right, zeroY);
        ctx.stroke();
        
        // Label zero line
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '12px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('0 km/s', padding.left - 10, zeroY + 4);
        
        // Draw horizontal grid lines (delta-v) - both positive and negative
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        
        // Positive values (above zero) - fixed at 30 km/s max
        for (let i = 1; i <= 5; i++) {
            const deltaV = (i / 5) * maxPositiveDeltaV;
            const y = deltaVToY(deltaV);
            if (y >= padding.top) { // Only draw if within chart bounds
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.stroke();
                
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.font = '12px monospace';
                ctx.textAlign = 'right';
                ctx.fillText('+' + deltaV.toFixed(0) + ' km/s', padding.left - 10, y + 4);
            }
        }
        
        // Negative values (below zero) - fixed at -20 km/s min
        for (let i = 1; i <= 4; i++) {
            const deltaV = -(i / 4) * maxNegativeDeltaV;
            const y = deltaVToY(deltaV);
            if (y <= padding.top + chartHeight) { // Only draw if within chart bounds
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.stroke();
                
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.font = '12px monospace';
                ctx.textAlign = 'right';
                ctx.fillText(deltaV.toFixed(0) + ' km/s', padding.left - 10, y + 4);
            }
        }
        
        // Draw vertical grid lines (zone columns)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        for (let i = 0; i <= numZones; i++) {
            const x = padding.left + (i * columnWidth);
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, height - padding.bottom);
            ctx.stroke();
        }
        
        // Draw bars for each zone
        for (let i = 0; i < zoneData.length; i++) {
            const data = zoneData[i];
            const x = padding.left + (i * columnWidth) + (columnWidth - barWidth) / 2;
            const centerX = padding.left + (i * columnWidth) + columnWidth / 2;
            const bottomY = padding.top + chartHeight;
            
            if (data.isSource) {
                // Source zone: draw escape velocity bar (red, negative) and capacity bar (green)
                
                // Draw escape velocity bar (red) - negative, extending downward from zero
                // Scale by maxNegativeDeltaV (20 km/s) for the negative axis
                const escapeBarHeight = spaceBelowZero * (escapeDeltaV / maxNegativeDeltaV);
                const escapeBarTop = zeroY; // Starts at zero line
                const escapeBarBottom = zeroY + escapeBarHeight; // Extends downward
                
                ctx.fillStyle = 'rgba(255, 68, 68, 0.8)';
                ctx.fillRect(x, escapeBarTop, barWidth, escapeBarHeight);
                
                // Draw capacity bar (green) - starts from bottom of red bar and extends upward
                // Translated down by the height of the red bar
                // Scale by maxPositiveDeltaV (30 km/s) for the positive axis
                const capacityBarHeight = spaceAboveZero * (availableCapacity / maxPositiveDeltaV);
                const capacityBarBottom = escapeBarBottom; // Starts where red bar ends
                const capacityBarTop = capacityBarBottom - capacityBarHeight; // Extends upward
                
                ctx.fillStyle = 'rgba(74, 255, 74, 0.8)';
                ctx.fillRect(x, capacityBarTop, barWidth, capacityBarHeight);
                
                // Draw dot at zero line
                ctx.fillStyle = '#4a9eff';
                ctx.beginPath();
                ctx.arc(centerX, zeroY, 6, 0, Math.PI * 2);
                ctx.fill();
                
                // Add glow to dot
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#4a9eff';
                ctx.beginPath();
                ctx.arc(centerX, zeroY, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                
                // Label escape velocity (below the red bar)
                if (escapeDeltaV > 0) {
                    ctx.fillStyle = '#ff4444';
                    ctx.font = '11px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText('Escape', centerX, escapeBarBottom + 12);
                    ctx.fillText(`${escapeDeltaV.toFixed(2)}`, centerX, escapeBarBottom + 24);
                }
                
                // Label capacity (at the top of green bar) - shows upgraded value
                if (availableCapacity > 0) {
                    // Calculate net capacity after escape velocity
                    const netCapacity = availableCapacity - escapeDeltaV;
                    
                    // Show net capacity in green at the top of the green bar
                    ctx.fillStyle = '#4aff4a';
                    ctx.font = '11px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(`Net: ${netCapacity.toFixed(2)}`, centerX, capacityBarTop - 5);
                    
                    // Show breakdown for probe transfers (above the net capacity)
                    ctx.textAlign = 'center';
                    if (resourceType === 'probe' && probeCapacity > 0 && massDriverCapacity > 0) {
                        ctx.font = '9px monospace';
                        ctx.fillText(`(Probe: ${probeCapacity.toFixed(2)} + Driver: ${massDriverCapacity.toFixed(2)})`, centerX, capacityBarTop - 18);
                    } else if (resourceType === 'probe' && probeCapacity > 0) {
                        ctx.font = '9px monospace';
                        ctx.fillText(`(Probe: ${probeCapacity.toFixed(2)})`, centerX, capacityBarTop - 18);
                    } else if (resourceType === 'metal' && massDriverCapacity > 0) {
                        ctx.font = '9px monospace';
                        ctx.fillText(`(Driver: ${massDriverCapacity.toFixed(2)})`, centerX, capacityBarTop - 18);
                    }
                }
                
            } else {
                // Other zones: draw Hohmann transfer delta-v bar (blue, positive)
                // Blue bar extends upward from zero, scaled by maxPositiveDeltaV (30 km/s)
                const hohmannBarHeight = spaceAboveZero * (data.hohmannDeltaV / maxPositiveDeltaV);
                const hohmannBarBottom = zeroY; // Starts at zero line
                const hohmannBarTop = zeroY - hohmannBarHeight; // Extends upward
                
                // Check if this is the selected destination zone
                const isSelectedDestination = this.transferMenuOpen && this.transferDestinationZone === data.zone.id;
                
                // Draw escape velocity bar (dark red) for this zone - extends downward from zero
                if (data.escapeDeltaV > 0) {
                    // Scale by maxNegativeDeltaV (20 km/s) for the negative axis
                    const zoneEscapeBarHeight = spaceBelowZero * (data.escapeDeltaV / maxNegativeDeltaV);
                    const zoneEscapeBarTop = zeroY; // Starts at zero line
                    const zoneEscapeBarBottom = zeroY + zoneEscapeBarHeight; // Extends downward
                    
                    // Dark red color for non-source zone escape velocity
                    ctx.fillStyle = 'rgba(180, 40, 40, 0.6)';
                    ctx.fillRect(x, zoneEscapeBarTop, barWidth, zoneEscapeBarHeight);
                    
                    // Label escape velocity at the bottom of the bar
                    ctx.fillStyle = '#b42828';
                    ctx.font = '9px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${data.escapeDeltaV.toFixed(2)}`, centerX, zoneEscapeBarBottom + 10);
                }
                
                // Use different color intensity based on reachability
                const isReachable = data.isReachable !== undefined ? data.isReachable : false;
                ctx.fillStyle = isReachable 
                    ? 'rgba(74, 255, 74, 0.6)'  // Green tint if reachable
                    : 'rgba(74, 158, 255, 0.8)'; // Blue if not reachable
                ctx.fillRect(x, hohmannBarTop, barWidth, hohmannBarHeight);
                
                // Label Hohmann transfer delta-v (at the top of blue bar)
                ctx.fillStyle = isReachable ? '#4aff4a' : '#4a9eff';
                ctx.font = '11px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(`${data.hohmannDeltaV.toFixed(2)}`, centerX, hohmannBarTop - 5);
                
                // Draw reachability indicator (checkmark only for reachable zones)
                if (isReachable) {
                    const indicatorY = hohmannBarTop - 20;
                    ctx.font = 'bold 16px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillStyle = '#4aff4a';
                    ctx.fillText('✓', centerX, indicatorY);
                }
                if (isSelectedDestination && availableCapacity > 0) {
                    // Draw capacity bar (green) overlaid for comparison
                    // Position it shifted to the right side of the column
                    const comparisonBarWidth = barWidth * 0.4;
                    const comparisonX = x + barWidth - comparisonBarWidth;
                    
                    // Start from the same position as the source zone's green bar
                    // (at the bottom of the escape velocity bar, extending upward)
                    // Scale escape by maxNegativeDeltaV (20 km/s), capacity by maxPositiveDeltaV (30 km/s)
                    const escapeBarBottom = zeroY + spaceBelowZero * (escapeDeltaV / maxNegativeDeltaV);
                    const capacityBarHeight = spaceAboveZero * (availableCapacity / maxPositiveDeltaV);
                    const capacityBarBottom = escapeBarBottom; // Same starting point as source
                    const capacityBarTop = capacityBarBottom - capacityBarHeight; // Extends upward
                    
                    // Draw capacity bar (green) extending upward from escape velocity bottom
                    ctx.fillStyle = 'rgba(74, 255, 74, 0.6)';
                    ctx.fillRect(comparisonX, capacityBarTop, comparisonBarWidth, capacityBarHeight);
                    
                    // Draw a border around the capacity bar
                    ctx.strokeStyle = '#4aff4a';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(comparisonX, capacityBarTop, comparisonBarWidth, capacityBarHeight);
                    
                    // Calculate and show remaining capacity after transfer (net = capacity - total required)
                    const netCapacity = availableCapacity - data.totalRequiredDeltaV;
                    const netLabel = netCapacity >= 0 ? `+${netCapacity.toFixed(2)}` : netCapacity.toFixed(2);
                    ctx.fillStyle = netCapacity >= 0 ? '#4aff4a' : '#ff4444';
                    ctx.font = 'bold 10px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(`Net: ${netLabel}`, centerX, escapeBarBottom + 12);
                }
            }
            
            // Draw zone name label at bottom
            const zoneName = data.zone.name.replace(/\s+Orbit\s*$/i, '');
            const isDestination = this.transferMenuOpen && this.transferDestinationZone === data.zone.id;
            
            // Highlight destination zone
            if (isDestination) {
                // Draw highlight background
                ctx.fillStyle = 'rgba(74, 255, 74, 0.3)';
                ctx.fillRect(x - 5, height - padding.bottom + 5, barWidth + 10, 35);
                
                // Draw border
                ctx.strokeStyle = '#4aff4a';
                ctx.lineWidth = 2;
                ctx.strokeRect(x - 5, height - padding.bottom + 5, barWidth + 10, 35);
            }
            
            ctx.fillStyle = data.isSource ? '#4a9eff' : (isDestination ? '#4aff4a' : 'rgba(255, 255, 255, 0.9)');
            ctx.font = isDestination ? 'bold 11px monospace' : '11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(zoneName, centerX, height - padding.bottom + 15);
            
            // Draw zone radius label
            ctx.fillStyle = isDestination ? 'rgba(74, 255, 74, 0.9)' : 'rgba(255, 255, 255, 0.6)';
            ctx.font = '9px monospace';
            ctx.fillText(`${(data.zone.radius_au || 0).toFixed(2)} AU`, centerX, height - padding.bottom + 28);
        }
        
        // Draw transfer indicator if destination is selected
        if (this.transferMenuOpen && this.transferDestinationZone) {
            // Find source and destination zone indices
            const sourceIndex = zoneData.findIndex(d => d.isSource);
            const destIndex = zoneData.findIndex(d => d.zone.id === this.transferDestinationZone);
            
            if (sourceIndex >= 0 && destIndex >= 0) {
                // Get the x-coordinates for source and destination columns
                const sourceX = padding.left + (sourceIndex * columnWidth) + columnWidth / 2;
                const destX = padding.left + (destIndex * columnWidth) + columnWidth / 2;
                
                // Determine color based on resource type
                let transferColor;
                if (resourceType === 'probe') {
                    transferColor = '#00ffff'; // Cyan for probes
                } else if (resourceType === 'metal') {
                    transferColor = '#c0c0c0'; // Silver for metal
                } else if (resourceType === 'methalox') {
                    transferColor = '#87ceeb'; // Light blue for methalox
                } else {
                    transferColor = '#00ffff'; // Default to cyan
                }
                
                // Draw vertical lines from zone labels pointing down
                const lineStartY = height - padding.bottom + 38; // Just below the AU label
                const lineEndY = height - padding.bottom + 55; // Down toward TRANSFER label
                const horizontalLineY = lineEndY;
                
                ctx.strokeStyle = transferColor;
                ctx.lineWidth = 2;
                
                // Vertical line from source
                ctx.beginPath();
                ctx.moveTo(sourceX, lineStartY);
                ctx.lineTo(sourceX, lineEndY);
                ctx.stroke();
                
                // Vertical line from destination
                ctx.beginPath();
                ctx.moveTo(destX, lineStartY);
                ctx.lineTo(destX, lineEndY);
                ctx.stroke();
                
                // Horizontal line connecting the two verticals
                ctx.beginPath();
                ctx.moveTo(sourceX, horizontalLineY);
                ctx.lineTo(destX, horizontalLineY);
                ctx.stroke();
                
                // Draw small arrow pointing toward destination
                const arrowDirection = destX > sourceX ? 1 : -1;
                const arrowX = destX - (arrowDirection * 8);
                ctx.beginPath();
                ctx.moveTo(arrowX, horizontalLineY - 4);
                ctx.lineTo(destX, horizontalLineY);
                ctx.lineTo(arrowX, horizontalLineY + 4);
                ctx.stroke();
                
                // Draw "TRANSFER" text below the horizontal line
                ctx.fillStyle = transferColor;
                ctx.font = 'bold 11px monospace';
                ctx.textAlign = 'center';
                const textX = (sourceX + destX) / 2;
                ctx.fillText('TRANSFER', textX, horizontalLineY + 15);
            }
        }
        
        // Draw axis labels
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        
        ctx.save();
        ctx.translate(20, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Delta-V (km/s)', 0, 0);
        ctx.restore();
        
        // Right y-axis label (mass, log scale)
        ctx.fillStyle = 'rgba(139, 90, 43, 0.9)';
        ctx.save();
        ctx.translate(width - 8, height / 2);
        ctx.rotate(Math.PI / 2);
        ctx.fillText('Zone Mass (log scale)', 0, 0);
        ctx.restore();
        
        // Draw legend
        const legendY = padding.top - 40;
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        
        // Brown bar (zone mass, log scale)
        ctx.fillStyle = 'rgba(101, 67, 33, 0.7)';
        ctx.fillRect(padding.left, legendY - 8, 20, 12);
        ctx.fillStyle = 'rgba(139, 90, 43, 0.9)';
        ctx.fillText('Zone Mass (log)', padding.left + 25, legendY);
        
        // Red bar (escape velocity, negative)
        ctx.fillStyle = 'rgba(255, 68, 68, 0.8)';
        ctx.fillRect(padding.left + 145, legendY - 8, 20, 12);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillText('Escape ΔV', padding.left + 170, legendY);
        
        // Blue bar (Hohmann transfer, positive)
        ctx.fillStyle = 'rgba(74, 158, 255, 0.8)';
        ctx.fillRect(padding.left + 265, legendY - 8, 20, 12);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillText('Transfer ΔV', padding.left + 290, legendY);
        
        // Green bar (capacity, starts from transfer)
        ctx.fillStyle = 'rgba(74, 255, 74, 0.8)';
        ctx.fillRect(padding.left + 390, legendY - 8, 20, 12);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillText('Capacity', padding.left + 415, legendY);
        
        // Draw title
        ctx.fillStyle = '#4a9eff';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        const resourceTypeName = resourceType === 'probe' ? 'Probe' : 'Mass Driver';
        const sourceZoneName = sourceZone.name.replace(/\s+Orbit\s*$/i, '');
        ctx.fillText(`${resourceTypeName} Delta-V Chart: ${sourceZoneName}`, width / 2, padding.top - 20);
    }
    
    /**
     * Draw delta-v capacity chart on canvas (for quick transfer mode - legacy, kept for compatibility)
     */
    drawQuickTransferChart(canvas, fromZoneId, resourceType) {
        // Delegate to overlay chart function
        this.drawOverlayChart(canvas, fromZoneId, resourceType);
    }
    
    /**
     * Execute a quick transfer (called when destination is selected in quick mode)
     */
    executeQuickTransfer(toZoneId) {
        const fromZoneId = this.transferSourceZone;
        const mode = this.quickTransferMode;
        
        if (!fromZoneId || !mode || fromZoneId === toZoneId) {
            this.cancelQuickTransfer();
            return;
        }
        
        if (mode === 'probe') {
            // One-time transfer of 1 probe
            this.createTransfer(fromZoneId, toZoneId, 'probe', 'one-time', 1, 0);
            this.showQuickMessage(`Transferring 1 probe to ${this.getZoneName(toZoneId)}`);
        } else if (mode === 'metal') {
            // Continuous transfer of 10% stored metal
            this.createTransfer(fromZoneId, toZoneId, 'metal', 'continuous', 0, 10);
            this.showQuickMessage(`Metal transfer to ${this.getZoneName(toZoneId)} started (10%)`);
        }
        
        // Clear quick transfer mode
        this.quickTransferMode = null;
        this.transferSourceZone = null;
        this.waitingForTransferDestination = false;
        
        // Only hide overlay if it was shown for quick transfer
        // If user manually toggled it with 'v', keep it visible
        if (!this.deltaVOverlayVisible) {
            this.hideDeltaVOverlay();
        }
        this.render();
    }
    
    /**
     * Get zone display name
     */
    getZoneName(zoneId) {
        if (!this.orbitalZones) return zoneId;
        const zone = this.orbitalZones.find(z => z.id === zoneId);
        return zone ? zone.name.replace(/\s+Orbit\s*$/i, '') : zoneId;
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
    
    showTransferDialog(fromZoneId, initialToZoneId) {
        // Get zone data
        const fromZone = this.orbitalZones.find(z => z.id === fromZoneId);
        if (!fromZone) return;
        
        // Store source zone for later use
        this.transferSourceZone = fromZoneId;
        
        // Use let for destination zone so it can be updated when user changes destination
        let toZoneId = initialToZoneId;
        
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
        if (hasMassDriver && this.transferSystem) {
            // Get transfer system from local instance
            const transferSystem = this.transferSystem;
            if (transferSystem && transferSystem.calculateMetalTransferCapacity) {
                metalCapacity = transferSystem.calculateMetalTransferCapacity(this.gameState, fromZoneId, toZoneId);
            }
        }
        
        // Create dialog with unified resource/transfer type selection
        const dialog = document.createElement('div');
        dialog.className = 'transfer-dialog';
        dialog.innerHTML = `
            <div class="transfer-dialog-content">
                <div class="transfer-dialog-header">
                    <h3>Transfer</h3>
                    <button class="transfer-dialog-close">&times;</button>
                </div>
                <div class="transfer-dialog-body">
                    <div class="transfer-route">
                        <span class="transfer-zone">${fromZone.name.replace(/\s+Orbit\s*$/i, '')}</span>
                        <span class="transfer-arrow">→</span>
                        <span class="transfer-zone">${toZone ? toZone.name.replace(/\s+Orbit\s*$/i, '') : 'Select destination zone'}</span>
                    </div>
                    <div class="transfer-info">
                        <div class="transfer-info-item">
                            <span class="transfer-label">Transfer Time:</span>
                            <span class="transfer-value" id="transfer-time">${toZone ? '—' : 'Select destination zone'}</span>
                        </div>
                        <div class="transfer-info-item" id="transfer-delta-v-info" style="display: none;">
                            <span class="transfer-label">Delta-V:</span>
                            <span class="transfer-value" id="transfer-delta-v-value">—</span>
                        </div>
                        <div class="transfer-info-item" id="transfer-capacity-info" style="display: none;">
                            <span class="transfer-label">Capacity:</span>
                            <span class="transfer-value" id="transfer-capacity-value">—</span>
                        </div>
                        <div class="transfer-info-item" id="transfer-available-info">
                            <span class="transfer-label">Available:</span>
                            <span class="transfer-value" id="transfer-available-value">${this.formatNumber(availableProbes)} probes</span>
                        </div>
                    </div>
                    
                    <!-- Resource Type Selection -->
                    <div class="transfer-section">
                        <div class="transfer-section-label">Resource Type</div>
                        <div class="transfer-radio-group">
                            <label class="transfer-radio-label">
                                <input type="radio" name="resource-type" value="probe" checked>
                                <span class="transfer-radio-text">Probes</span>
                            </label>
                            <label class="transfer-radio-label ${hasMassDriver ? '' : 'disabled'}">
                                <input type="radio" name="resource-type" value="metal" ${hasMassDriver ? '' : 'disabled'}>
                                <span class="transfer-radio-text">Metal ${hasMassDriver ? '' : '(Requires Mass Driver)'}</span>
                            </label>
                        </div>
                    </div>
                    
                    <!-- Transfer Mode Selection -->
                    <div class="transfer-section">
                        <div class="transfer-section-label">Transfer Mode</div>
                        <div class="transfer-radio-group">
                            <label class="transfer-radio-label">
                                <input type="radio" name="transfer-mode" value="continuous">
                                <span class="transfer-radio-text">Continuous</span>
                            </label>
                            <label class="transfer-radio-label">
                                <input type="radio" name="transfer-mode" value="one-time" checked>
                                <span class="transfer-radio-text">One-Time</span>
                            </label>
                        </div>
                    </div>
                    
                    <!-- Transfer Amount Input -->
                    <div class="transfer-section" id="transfer-amount-section">
                        <!-- Continuous Probe: Rate input -->
                        <div class="transfer-amount-input" id="input-probe-continuous" style="display: none;">
                            <div class="transfer-section-label">Transfer Rate</div>
                            <div class="transfer-input-row">
                                <input type="number" id="transfer-rate-probes" min="0.01" max="100" step="0.1" value="10">
                                <span class="transfer-input-unit">% of production</span>
                            </div>
                        </div>
                        
                        <!-- One-Time Probe: Slider -->
                        <div class="transfer-amount-input" id="input-probe-onetime">
                            <div class="transfer-section-label">Probe Count</div>
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
                        
                        <!-- Continuous Metal: Rate input -->
                        <div class="transfer-amount-input" id="input-metal-continuous" style="display: none;">
                            <div class="transfer-section-label">Transfer Rate</div>
                            <div class="transfer-input-row">
                                <input type="number" id="transfer-rate-metal" min="0.01" max="100" step="0.1" value="10">
                                <span class="transfer-input-unit">% of stored metal</span>
                            </div>
                            <span class="transfer-hint">Stored: ${this.formatNumber(availableMetal)} kg</span>
                        </div>
                        
                        <!-- One-Time Metal: Amount input -->
                        <div class="transfer-amount-input" id="input-metal-onetime" style="display: none;">
                            <div class="transfer-section-label">Metal Amount</div>
                            <div class="transfer-input-row">
                                <input type="number" id="transfer-metal-count" min="0" step="1e9" value="0">
                                <span class="transfer-input-unit">kg</span>
                            </div>
                            <span class="transfer-hint">Max: ${this.formatNumber(availableMetal)} kg</span>
                        </div>
                    </div>
                    
                    <!-- Delta-V Capacity Visualization -->
                    <div class="transfer-section" id="transfer-delta-v-chart-section" style="display: none;">
                        <div class="transfer-section-label">Delta-V Capacity</div>
                        <canvas id="transfer-delta-v-chart" width="400" height="250" style="width: 100%; height: 250px; background: rgba(0, 0, 0, 0.3); border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.1);"></canvas>
                    </div>
                    
                    <!-- Transfer Requirements (Transit Time & Fuel) -->
                    <div class="transfer-section" id="transfer-fuel-info-section" style="display: none;">
                        <div class="transfer-section-label">Transfer Requirements</div>
                        <div class="transfer-fuel-info" style="background: rgba(0, 0, 0, 0.3); border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.1); padding: 12px; font-size: 12px;">
                            <div class="transfer-fuel-row" style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                                <span style="color: rgba(255, 255, 255, 0.7);">Estimated Transit Time:</span>
                                <span id="transfer-transit-time" style="color: rgba(255, 255, 255, 0.9);">—</span>
                            </div>
                            <div class="transfer-fuel-row" style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                                <span style="color: rgba(255, 255, 255, 0.7);">Methalox Required:</span>
                                <span id="transfer-fuel-required" style="color: rgba(255, 255, 255, 0.9);">—</span>
                            </div>
                            <div class="transfer-fuel-row" style="display: flex; justify-content: space-between; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 6px; margin-top: 6px;">
                                <span style="color: rgba(255, 255, 255, 0.7);">Available in Origin:</span>
                                <span id="transfer-fuel-available" style="color: rgba(255, 255, 255, 0.9);">—</span>
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
        
        // Calculate transfer time only if destination is set
        let probeTransferTime = null;
        if (toZone) {
            // Calculate base transfer time (without mass driver boost)
            let baseTransferTime = this.calculateTransferTime(fromZone, toZone);
            
            // Calculate transfer time with mass driver boost
            probeTransferTime = baseTransferTime;
            if (hasMassDriver && this.transferSystem) {
                const speedMultiplier = this.transferSystem.calculateMassDriverSpeedMultiplier(massDriverCount);
                probeTransferTime = baseTransferTime * speedMultiplier;
            }
        }
        
        // Calculate delta-v requirements and capacity
        let requiredDeltaVKmS = null;
        let escapeDeltaVKmS = null;
        let hohmannDeltaVKmS = null;
        let probeCapacityKmS = null;
        let massDriverMuzzleVelocityKmS = null;
        let combinedCapacityKmS = null;
        let excessDeltaVKmS = null;
        let massDriverThroughputKgPerDay = null;
        let canReachProbe = false;
        let canReachMassDriver = false;
        
        if (toZone && this.orbitalMechanics) {
            const skills = this.gameState?.skills || {};
            
            // Get zone mass for escape velocity calculation
            const zones = this.gameState?.zones || {};
            const fromZoneData = zones[fromZoneId] || {};
            const fromZoneMass = fromZoneData.mass_remaining !== undefined && fromZoneData.mass_remaining !== null
                ? fromZoneData.mass_remaining
                : (fromZone.total_mass_kg || 0);
            
            // Calculate escape delta-v
            escapeDeltaVKmS = this.orbitalMechanics.calculateEscapeDeltaV(fromZoneId, fromZoneMass);
            
            // Get Hohmann transfer delta-v
            hohmannDeltaVKmS = this.orbitalMechanics.getHohmannDeltaVKmS(fromZoneId, toZoneId);
            
            // Get total delta-v (escape + Hohmann, fixed physics - not affected by upgrades)
            requiredDeltaVKmS = this.orbitalMechanics.getTotalDeltaVKmS(fromZoneId, toZoneId, fromZoneMass);
            
            // Include probe delta-v bonus from starting skill points
            const probeDvBonus = this.gameState?.skill_bonuses?.probe_dv_bonus || 0;
            probeCapacityKmS = this.orbitalMechanics.getProbeDeltaVCapacity(skills, probeDvBonus);
            
            // Get mass driver muzzle velocity for combined capacity calculation
            if (hasMassDriver && this.transferSystem) {
                massDriverMuzzleVelocityKmS = this.transferSystem.getMassDriverMuzzleVelocity(this.gameState, fromZoneId);
                canReachMassDriver = this.transferSystem.canMassDriverReach(this.gameState, fromZoneId, toZoneId, fromZoneMass);
                if (canReachMassDriver) {
                    massDriverThroughputKgPerDay = this.transferSystem.calculateMassDriverThroughput(this.gameState, fromZoneId, toZoneId);
                }
            } else {
                massDriverMuzzleVelocityKmS = 0;
            }
            
            // Calculate combined capacity (probe + mass driver) for probe transfers
            combinedCapacityKmS = this.orbitalMechanics.getCombinedDeltaVCapacity(skills, massDriverMuzzleVelocityKmS || 0, probeDvBonus);
            excessDeltaVKmS = this.orbitalMechanics.getExcessDeltaV(combinedCapacityKmS, requiredDeltaVKmS);
            
            // Probe reachability uses combined capacity
            canReachProbe = this.orbitalMechanics.canProbeReach(fromZoneId, toZoneId, skills, fromZoneMass, massDriverMuzzleVelocityKmS || 0, probeDvBonus);
        }
        
        // Display transfer time with appropriate formatting
        const timeEl = dialog.querySelector('#transfer-time');
        const deltaVEl = dialog.querySelector('#transfer-delta-v-value');
        const deltaVInfoEl = dialog.querySelector('#transfer-delta-v-info');
        const capacityEl = dialog.querySelector('#transfer-capacity-value');
        const capacityInfoEl = dialog.querySelector('#transfer-capacity-info');
        const availableEl = dialog.querySelector('#transfer-available-value');
        
        // Function to update delta-v and capacity display based on resource type
        const updateDeltaVDisplay = () => {
            const resourceType = dialog.querySelector('input[name="resource-type"]:checked')?.value || 'probe';
            
            if (!toZone || !requiredDeltaVKmS) {
                if (deltaVInfoEl) deltaVInfoEl.style.display = 'none';
                if (capacityInfoEl) capacityInfoEl.style.display = 'none';
                return;
            }
            
            if (deltaVInfoEl) deltaVInfoEl.style.display = '';
            if (capacityInfoEl) capacityInfoEl.style.display = '';
            
            if (resourceType === 'probe') {
                // Show probe delta-v info with combined capacity breakdown
                if (deltaVEl) {
                    const canReach = canReachProbe;
                    const status = canReach ? '✓' : '✗';
                    const color = canReach ? '#4a9eff' : '#ff4444';
                    // Show breakdown: Escape + Hohmann = Total
                    const breakdown = escapeDeltaVKmS > 0 
                        ? `${escapeDeltaVKmS.toFixed(2)} (escape) + ${hohmannDeltaVKmS.toFixed(2)} (transfer) = ${requiredDeltaVKmS.toFixed(2)} km/s`
                        : `${requiredDeltaVKmS.toFixed(2)} km/s`;
                    
                    // Show combined capacity (probe + mass driver if available)
                    let capacityStr = `${probeCapacityKmS.toFixed(2)}`;
                    if (massDriverMuzzleVelocityKmS && massDriverMuzzleVelocityKmS > 0) {
                        capacityStr += ` + ${massDriverMuzzleVelocityKmS.toFixed(2)} (driver) = ${combinedCapacityKmS.toFixed(2)}`;
                    }
                    deltaVEl.innerHTML = `<span style="color: ${color}">${status}</span> ${breakdown} (have ${capacityStr} km/s)`;
                }
                // Show speed bonus from excess delta-v
                if (capacityEl) {
                    if (excessDeltaVKmS && excessDeltaVKmS > 0) {
                        capacityEl.innerHTML = `<span style="color: #4aff4a;">+${excessDeltaVKmS.toFixed(2)} km/s speed bonus</span>`;
                    } else {
                        capacityEl.textContent = '—';
                    }
                }
            } else {
                // Show mass driver delta-v info with breakdown
                if (deltaVEl) {
                    const canReach = canReachMassDriver;
                    const status = canReach ? '✓' : '✗';
                    const color = canReach ? '#4a9eff' : '#ff4444';
                    const muzzleVel = massDriverMuzzleVelocityKmS || 0;
                    // Show breakdown: Escape + Hohmann = Total
                    const breakdown = escapeDeltaVKmS > 0 
                        ? `${escapeDeltaVKmS.toFixed(2)} (escape) + ${hohmannDeltaVKmS.toFixed(2)} (transfer) = ${requiredDeltaVKmS.toFixed(2)} km/s`
                        : `${requiredDeltaVKmS.toFixed(2)} km/s`;
                    deltaVEl.innerHTML = `<span style="color: ${color}">${status}</span> ${breakdown} (muzzle: ${muzzleVel.toFixed(2)} km/s)`;
                }
                if (capacityEl && massDriverThroughputKgPerDay !== null) {
                    const throughput = this.formatNumber(massDriverThroughputKgPerDay);
                    capacityEl.textContent = `${throughput} kg/day`;
                } else {
                    capacityEl.textContent = '—';
                }
            }
        };
        
        // Function to update the available display based on resource type
        const updateAvailableDisplay = () => {
            const resourceType = dialog.querySelector('input[name="resource-type"]:checked')?.value || 'probe';
            if (availableEl) {
                if (resourceType === 'probe') {
                    availableEl.textContent = `${this.formatNumber(availableProbes)} probes`;
                } else {
                    availableEl.textContent = `${this.formatNumber(availableMetal)} kg metal`;
                }
            }
        };
        
        // Function to update the amount input visibility
        const updateAmountInputs = () => {
            const resourceType = dialog.querySelector('input[name="resource-type"]:checked')?.value || 'probe';
            const transferMode = dialog.querySelector('input[name="transfer-mode"]:checked')?.value || 'one-time';
            
            // Hide all input sections
            dialog.querySelectorAll('.transfer-amount-input').forEach(el => el.style.display = 'none');
            
            // Show the appropriate input
            const inputId = `input-${resourceType}-${transferMode === 'one-time' ? 'onetime' : 'continuous'}`;
            const inputEl = dialog.querySelector(`#${inputId}`);
            if (inputEl) {
                inputEl.style.display = '';
            }
            
            // Update available display
            updateAvailableDisplay();
        };
        
        // Function to update transfer time display
        const updateTransferTime = () => {
            if (timeEl && probeTransferTime !== null) {
                timeEl.textContent = this.formatTransferTime(probeTransferTime);
                if (hasMassDriver) {
                    timeEl.textContent += ` (${massDriverCount} mass driver${massDriverCount > 1 ? 's' : ''})`;
                }
            }
        };
        
        // Function to draw delta-v capacity chart
        const drawDeltaVChart = () => {
            const chartCanvas = dialog.querySelector('#transfer-delta-v-chart');
            const chartSection = dialog.querySelector('#transfer-delta-v-chart-section');
            if (!chartCanvas || !chartSection) {
                console.warn('[Transfer Dialog] Chart elements not found');
                return;
            }
            
            const resourceType = dialog.querySelector('input[name="resource-type"]:checked')?.value || 'probe';
            
            // Only show chart if we have a source zone
            if (!fromZoneId || !this.orbitalMechanics) {
                chartSection.style.display = 'none';
                return;
            }
            
            // Always show chart section when we have a source zone
            chartSection.style.display = 'block';
            
            console.log('[Transfer Dialog] Drawing delta-v chart', { fromZoneId, resourceType });
            
            const ctx = chartCanvas.getContext('2d');
            const width = chartCanvas.width;
            const height = chartCanvas.height;
            const padding = { top: 20, right: 40, bottom: 40, left: 60 };
            const chartWidth = width - padding.left - padding.right;
            const chartHeight = height - padding.top - padding.bottom;
            
            // Clear canvas
            ctx.clearRect(0, 0, width, height);
            
            // Get orbital zones sorted by radius
            const zones = [...(this.orbitalZones || [])].filter(z => z.id !== 'dyson_sphere').sort((a, b) => (a.radius_au || 0) - (b.radius_au || 0));
            
            if (zones.length === 0) return;
            
            // Calculate delta-v requirements from source zone to each destination
            const skills = this.gameState?.skills || {};
            const sourceZone = zones.find(z => z.id === fromZoneId);
            if (!sourceZone) return;
            
            const sourceRadiusAU = sourceZone.radius_au || 1.0;
            
            // Calculate max delta-v for scaling
            let maxDeltaV = 0;
            const zoneData = [];
            
            for (const zone of zones) {
                if (zone.id === fromZoneId) continue;
                const deltaV = this.orbitalMechanics.getDeltaVKmS(fromZoneId, zone.id, skills);
                maxDeltaV = Math.max(maxDeltaV, deltaV);
                zoneData.push({
                    zone: zone,
                    radiusAU: zone.radius_au || 1.0,
                    deltaV: deltaV
                });
            }
            
            // Add capacity lines
            const probeDvBonus = this.gameState?.skill_bonuses?.probe_dv_bonus || 0;
            const probeCapacity = this.orbitalMechanics.getProbeDeltaVCapacity(skills, probeDvBonus);
            let massDriverCapacity = 0;
            if (hasMassDriver && this.transferSystem) {
                massDriverCapacity = this.transferSystem.getMassDriverMuzzleVelocity(this.gameState, fromZoneId);
            }
            
            maxDeltaV = Math.max(maxDeltaV, probeCapacity, massDriverCapacity, 20); // Ensure at least 20 km/s range
            
            // X-axis: radius in AU (log scale might be better, but linear for now)
            const minRadius = Math.min(...zones.map(z => z.radius_au || 0.3));
            const maxRadius = Math.max(...zones.map(z => z.radius_au || 40));
            
            // Helper functions for coordinate conversion
            const xToRadius = (x) => {
                const normalized = (x - padding.left) / chartWidth;
                return minRadius + normalized * (maxRadius - minRadius);
            };
            
            const radiusToX = (radius) => {
                const normalized = (radius - minRadius) / (maxRadius - minRadius);
                return padding.left + normalized * chartWidth;
            };
            
            const deltaVToY = (deltaV) => {
                const normalized = deltaV / maxDeltaV;
                return padding.top + chartHeight - (normalized * chartHeight);
            };
            
            // Draw grid lines
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            
            // Horizontal grid lines (delta-v)
            for (let i = 0; i <= 5; i++) {
                const deltaV = (i / 5) * maxDeltaV;
                const y = deltaVToY(deltaV);
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.stroke();
                
                // Label
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.font = '10px monospace';
                ctx.textAlign = 'right';
                ctx.fillText(deltaV.toFixed(1), padding.left - 5, y + 4);
            }
            
            // Vertical grid lines (radius)
            for (let i = 0; i <= 5; i++) {
                const radius = minRadius + (i / 5) * (maxRadius - minRadius);
                const x = radiusToX(radius);
                ctx.beginPath();
                ctx.moveTo(x, padding.top);
                ctx.lineTo(x, height - padding.bottom);
                ctx.stroke();
            }
            
            // Draw gravitational potential curve (delta-v required from source)
            // Use actual zone data points and interpolate
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            // Sort zone data by radius
            const sortedZoneData = [...zoneData].sort((a, b) => a.radiusAU - b.radiusAU);
            
            if (sortedZoneData.length > 0) {
                // Draw line through actual zone points
                for (let i = 0; i < sortedZoneData.length; i++) {
                    const data = sortedZoneData[i];
                    const x = radiusToX(data.radiusAU);
                    const y = deltaVToY(data.deltaV);
                    
                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
            }
            ctx.stroke();
            
            // Draw capacity lines
            if (resourceType === 'probe') {
                // Probe capacity line
                const probeY = deltaVToY(probeCapacity);
                ctx.strokeStyle = '#4a9eff';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(padding.left, probeY);
                ctx.lineTo(width - padding.right, probeY);
                ctx.stroke();
                ctx.setLineDash([]);
                
                // Label
                ctx.fillStyle = '#4a9eff';
                ctx.font = '11px monospace';
                ctx.textAlign = 'left';
                ctx.fillText(`Probe Capacity: ${probeCapacity.toFixed(2)} km/s`, padding.left + 5, probeY - 5);
            } else if (hasMassDriver) {
                // Mass driver capacity line
                const driverY = deltaVToY(massDriverCapacity);
                ctx.strokeStyle = '#ffaa00';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(padding.left, driverY);
                ctx.lineTo(width - padding.right, driverY);
                ctx.stroke();
                ctx.setLineDash([]);
                
                // Label
                ctx.fillStyle = '#ffaa00';
                ctx.font = '11px monospace';
                ctx.textAlign = 'left';
                ctx.fillText(`Mass Driver: ${massDriverCapacity.toFixed(2)} km/s`, padding.left + 5, driverY - 5);
                
                // Draw energy per kg curve (right Y-axis)
                // Energy per kg = 0.5 * v^2 (in MJ/kg)
                ctx.strokeStyle = 'rgba(255, 170, 0, 0.5)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                
                // Calculate max energy for scaling
                const maxEnergyMJ = 0.5 * Math.pow(maxDeltaV * 1000, 2) / 1e6; // Convert to MJ
                
                const energyToY = (energyMJ) => {
                    const normalized = energyMJ / maxEnergyMJ;
                    return padding.top + chartHeight - (normalized * chartHeight);
                };
                
                for (const data of sortedZoneData) {
                    if (data.deltaV <= massDriverCapacity) {
                        const energyMJ = 0.5 * Math.pow(data.deltaV * 1000, 2) / 1e6;
                        const x = radiusToX(data.radiusAU);
                        const y = energyToY(energyMJ);
                        
                        if (sortedZoneData.indexOf(data) === sortedZoneData.findIndex(d => d.radiusAU === data.radiusAU)) {
                            ctx.moveTo(x, y);
                        } else {
                            ctx.lineTo(x, y);
                        }
                    }
                }
                ctx.stroke();
                ctx.setLineDash([]);
                
                // Energy label
                ctx.fillStyle = 'rgba(255, 170, 0, 0.7)';
                ctx.font = '10px monospace';
                ctx.textAlign = 'right';
                ctx.fillText('Energy (MJ/kg)', width - padding.right - 5, padding.top + 15);
            }
            
            // Draw zone markers
            for (const data of zoneData) {
                const x = radiusToX(data.radiusAU);
                const y = deltaVToY(data.deltaV);
                
                // Determine if reachable
                let isReachable = false;
                if (resourceType === 'probe') {
                    isReachable = data.deltaV <= probeCapacity;
                } else if (hasMassDriver) {
                    isReachable = data.deltaV <= massDriverCapacity;
                }
                
                // Draw marker
                ctx.fillStyle = isReachable ? '#4aff4a' : '#ff4444';
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
                
                // Draw zone label
                const zoneName = data.zone.name.replace(/\s+Orbit\s*$/i, '');
                ctx.fillStyle = isReachable ? '#4aff4a' : '#ff4444';
                ctx.font = '9px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(zoneName, x, y - 8);
            }
            
            // Draw axes labels
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.font = '12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('Distance from Sun (AU)', width / 2, height - 10);
            
            ctx.save();
            ctx.translate(15, height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText('Delta-V Required (km/s)', 0, 0);
            ctx.restore();
        };
        
        // Function to update fuel info section
        const updateFuelInfo = () => {
            const fuelSection = dialog.querySelector('#transfer-fuel-info-section');
            const transitTimeEl = dialog.querySelector('#transfer-transit-time');
            const fuelRequiredEl = dialog.querySelector('#transfer-fuel-required');
            const fuelAvailableEl = dialog.querySelector('#transfer-fuel-available');
            
            if (!fuelSection || !toZone) {
                if (fuelSection) fuelSection.style.display = 'none';
                return;
            }
            
            // Only show for probe transfers
            const resourceType = dialog.querySelector('input[name="resource-type"]:checked')?.value || 'probe';
            if (resourceType !== 'probe') {
                fuelSection.style.display = 'none';
                return;
            }
            
            fuelSection.style.display = '';
            
            // Calculate transit time
            const transferTimeDays = probeTransferTime || this.calculateTransferTime(fromZone, toZone);
            if (transitTimeEl) {
                transitTimeEl.textContent = this.formatTransferTime(transferTimeDays);
            }
            
            // Calculate fuel required
            if (fuelRequiredEl && this.transferSystem && this.gameState) {
                const skills = this.gameState.skills || {};
                const transferMode = dialog.querySelector('input[name="transfer-mode"]:checked')?.value || 'one-time';
                
                let probeMass = 100; // Default 1 probe = 100 kg
                if (transferMode === 'one-time') {
                    const probeCountInput = dialog.querySelector('#transfer-count');
                    const probeCount = probeCountInput ? parseFloat(probeCountInput.value) || 1 : 1;
                    probeMass = probeCount * 100; // 100 kg per probe
                } else {
                    // For continuous, show fuel for 1 probe as example
                    probeMass = 100;
                }
                
                const fuelRequired = this.transferSystem.calculateFuelRequired(fromZoneId, toZoneId, probeMass, skills, this.gameState);
                fuelRequiredEl.textContent = this.formatNumber(fuelRequired) + ' kg';
            }
            
            // Show available methalox in origin zone
            if (fuelAvailableEl && this.gameState) {
                const zones = this.gameState.zones || {};
                const originZone = zones[fromZoneId] || {};
                const availableMethalox = originZone.methalox || 0;
                fuelAvailableEl.textContent = this.formatNumber(availableMethalox) + ' kg';
            }
        };
        
        // Initial updates
        updateTransferTime();
        updateDeltaVDisplay();
        updateAmountInputs();
        drawDeltaVChart();
        updateFuelInfo();
        
        // Add event listeners for radio buttons
        dialog.querySelectorAll('input[name="resource-type"]').forEach(radio => {
            radio.addEventListener('change', () => {
                updateAmountInputs();
                updateDeltaVDisplay();
                drawDeltaVChart();
                updateFuelInfo();
            });
        });
        dialog.querySelectorAll('input[name="transfer-mode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                updateAmountInputs();
                updateFuelInfo();
            });
        });
        
        // Update fuel info when probe count changes
        const probeCountSlider = dialog.querySelector('#transfer-count-slider');
        const probeCountInput = dialog.querySelector('#transfer-count');
        if (probeCountSlider) {
            probeCountSlider.addEventListener('input', () => {
                const count = parseInt(probeCountSlider.value) || 1;
                if (probeCountInput) probeCountInput.value = count;
                updateFuelInfo();
            });
        }
        dialog.querySelectorAll('input[name="transfer-mode"]').forEach(radio => {
            radio.addEventListener('change', updateAmountInputs);
        });
        
        // Store dialog reference for updating destination
        dialog.updateDestination = (newToZoneId) => {
            const newToZone = this.orbitalZones.find(z => z.id === newToZoneId);
            if (!newToZone) return;
            
            // Update the toZone reference for travel time calculations
            toZone = newToZone;
            toZoneId = newToZoneId;
            
            // Update route display
            const routeEl = dialog.querySelector('.transfer-route');
            const toZoneSpan = routeEl.querySelector('.transfer-zone:last-child');
            if (toZoneSpan) {
                toZoneSpan.textContent = newToZone.name.replace(/\s+Orbit\s*$/i, '');
            }
            
            // Update transfer time
            let baseTransferTime = this.calculateTransferTime(fromZone, newToZone);
            let newProbeTransferTime = baseTransferTime;
            if (hasMassDriver && this.transferSystem) {
                const speedMultiplier = this.transferSystem.calculateMassDriverSpeedMultiplier(massDriverCount);
                newProbeTransferTime = baseTransferTime * speedMultiplier;
            }
            if (timeEl) {
                timeEl.textContent = this.formatTransferTime(newProbeTransferTime);
                if (hasMassDriver) {
                    timeEl.textContent += ` (${massDriverCount} mass driver${massDriverCount > 1 ? 's' : ''})`;
                }
            }
            
            probeTransferTime = newProbeTransferTime;
            
            // Update delta-v requirements for new destination
            if (this.orbitalMechanics) {
                const skills = this.gameState?.skills || {};
                const zones = this.gameState?.zones || {};
                const fromZoneData = zones[fromZoneId] || {};
                const fromZoneMass = fromZoneData.mass_remaining !== undefined && fromZoneData.mass_remaining !== null
                    ? fromZoneData.mass_remaining
                    : (fromZone.total_mass_kg || 0);
                
                // Calculate escape delta-v
                escapeDeltaVKmS = this.orbitalMechanics.calculateEscapeDeltaV(fromZoneId, fromZoneMass);
                
                // Get Hohmann transfer delta-v
                hohmannDeltaVKmS = this.orbitalMechanics.getHohmannDeltaVKmS(fromZoneId, newToZoneId);
                
                // Get total required delta-v
                requiredDeltaVKmS = this.orbitalMechanics.getTotalDeltaVKmS(fromZoneId, newToZoneId, fromZoneMass);
                const probeDvBonus = this.gameState?.skill_bonuses?.probe_dv_bonus || 0;
                probeCapacityKmS = this.orbitalMechanics.getProbeDeltaVCapacity(skills, probeDvBonus);
                
                if (hasMassDriver && this.transferSystem) {
                    massDriverMuzzleVelocityKmS = this.transferSystem.getMassDriverMuzzleVelocity(this.gameState, fromZoneId);
                    canReachMassDriver = this.transferSystem.canMassDriverReach(this.gameState, fromZoneId, newToZoneId, fromZoneMass);
                    if (canReachMassDriver) {
                        massDriverThroughputKgPerDay = this.transferSystem.calculateMassDriverThroughput(this.gameState, fromZoneId, newToZoneId);
                    } else {
                        massDriverThroughputKgPerDay = null;
                    }
                } else {
                    massDriverMuzzleVelocityKmS = 0;
                }
                
                // Calculate combined capacity and excess delta-v
                combinedCapacityKmS = this.orbitalMechanics.getCombinedDeltaVCapacity(skills, massDriverMuzzleVelocityKmS || 0, probeDvBonus);
                excessDeltaVKmS = this.orbitalMechanics.getExcessDeltaV(combinedCapacityKmS, requiredDeltaVKmS);
                
                // Use combined capacity for probe reachability
                canReachProbe = this.orbitalMechanics.canProbeReach(fromZoneId, newToZoneId, skills, fromZoneMass, massDriverMuzzleVelocityKmS || 0, probeDvBonus);
                
                updateDeltaVDisplay();
                drawDeltaVChart();
            }
            
            // Always update fuel info
            updateFuelInfo();
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
        
        // Confirm button
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
        const massDriverCount = zoneStructures['mass_driver'] || 0;
        
        // Get selected resource type and transfer mode from radio buttons
        const resourceType = dialog.querySelector('input[name="resource-type"]:checked')?.value || 'probe';
        const transferMode = dialog.querySelector('input[name="transfer-mode"]:checked')?.value || 'one-time';
        
        // Check delta-v access before creating transfer
        if (this.orbitalMechanics) {
            const skills = this.gameState?.skills || {};
            
            // Get zone mass for escape velocity calculation
            const zones = this.gameState?.zones || {};
            const fromZone = this.orbitalZones?.find(z => z.id === fromZoneId);
            const fromZoneData = zones[fromZoneId] || {};
            const fromZoneMass = fromZoneData.mass_remaining !== undefined && fromZoneData.mass_remaining !== null
                ? fromZoneData.mass_remaining
                : (fromZone?.total_mass_kg || 0);
            
            // Get mass driver muzzle velocity (probe transfers benefit from mass driver boost)
            let massDriverMuzzleVelocity = 0;
            if (massDriverCount > 0 && this.transferSystem) {
                massDriverMuzzleVelocity = this.transferSystem.getMassDriverMuzzleVelocity(this.gameState, fromZoneId);
            }
            
            if (resourceType === 'probe') {
                // Use combined probe + mass driver delta-v for reachability check
                // Get probe delta-v bonus from starting skill points
                const probeDvBonus = this.gameState?.skill_bonuses?.probe_dv_bonus || 0;
                if (!this.orbitalMechanics.canProbeReach(fromZoneId, toZoneId, skills, fromZoneMass, massDriverMuzzleVelocity, probeDvBonus)) {
                    // Show error in terms of net delta-v vs Hohmann (matches chart visualization)
                    // Net delta-v = total capacity - escape velocity
                    const escapeDeltaV = this.orbitalMechanics.calculateEscapeDeltaV(fromZoneId, fromZoneMass);
                    const hohmannDeltaV = this.orbitalMechanics.getHohmannDeltaVKmS(fromZoneId, toZoneId);
                    const reachInfo = this.orbitalMechanics.getReachabilityInfo(
                        fromZoneId, toZoneId, skills, fromZoneMass, massDriverMuzzleVelocity, probeDvBonus
                    );
                    const netDeltaV = reachInfo.totalCapacity - escapeDeltaV;
                    
                    let errorMsg = `Cannot transfer probes: transfer requires ${hohmannDeltaV.toFixed(2)} km/s, but net Δv is ${netDeltaV.toFixed(2)} km/s`;
                    errorMsg += ` (capacity: ${reachInfo.totalCapacity.toFixed(2)} - escape: ${escapeDeltaV.toFixed(2)})`;
                    alert(errorMsg);
                    return;
                }
            } else if (resourceType === 'metal' && hasMassDriver && this.transferSystem) {
                if (!this.transferSystem.canMassDriverReach(this.gameState, fromZoneId, toZoneId)) {
                    // Show error in terms of net delta-v vs Hohmann (matches chart visualization)
                    const escapeDeltaV = this.orbitalMechanics.calculateEscapeDeltaV(fromZoneId, fromZoneMass);
                    const hohmannDeltaV = this.orbitalMechanics.getHohmannDeltaVKmS(fromZoneId, toZoneId);
                    const muzzleVelocity = this.transferSystem.getMassDriverMuzzleVelocity(this.gameState, fromZoneId);
                    const netDeltaV = muzzleVelocity - escapeDeltaV;
                    
                    alert(`Cannot transfer metal: transfer requires ${hohmannDeltaV.toFixed(2)} km/s, but net Δv is ${netDeltaV.toFixed(2)} km/s (muzzle: ${muzzleVelocity.toFixed(2)} - escape: ${escapeDeltaV.toFixed(2)})`);
                    return;
                }
            }
        }
        
        if (resourceType === 'probe') {
            // Probe transfer
            if (transferMode === 'one-time') {
                const count = parseInt(dialog.querySelector('#transfer-count').value) || 1;
                this.createTransfer(fromZoneId, toZoneId, 'probe', 'one-time', count, 0);
            } else {
                const rate = parseFloat(dialog.querySelector('#transfer-rate-probes').value) || 1;
                this.createTransfer(fromZoneId, toZoneId, 'probe', 'continuous', 0, rate);
            }
        } else if (resourceType === 'metal' && hasMassDriver) {
            // Metal transfer
            if (transferMode === 'one-time') {
                const metalKg = parseFloat(dialog.querySelector('#transfer-metal-count').value) || 0;
                this.createTransfer(fromZoneId, toZoneId, 'metal', 'one-time', metalKg, 0);
            } else {
                const ratePercentage = parseFloat(dialog.querySelector('#transfer-rate-metal').value) || 10;
                this.createTransfer(fromZoneId, toZoneId, 'metal', 'continuous', 0, ratePercentage);
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
                    actionData.rate = rate; // Percentage of production for probes
                } else {
                    actionData.rate = rate; // Percentage of stored metal
                }
            }
            
            window.gameEngine.performAction('create_transfer', actionData).then(result => {
                if (!result.success) {
                    // Show error message to user
                    const errorMsg = result.error || 'Unknown error';
                    console.error('[OrbitalZoneSelector] Transfer failed:', errorMsg);
                    alert(`Transfer failed: ${errorMsg}`);
                }
            }).catch(error => {
                console.error('[OrbitalZoneSelector] Failed to create transfer:', error);
                alert(`Transfer failed: ${error.message || error}`);
            });
        }
        
        // Transfer arcs will be updated from game state in updateTransferArcs()
        // No need to manually add to transferArcs array
    }

    update(gameState) {
        if (!gameState) return;
        
        // Try to get engine references if not already available
        if (!this.orbitalMechanics || !this.transferSystem) {
            if (window.gameEngine && window.gameEngine.engine) {
                if (window.gameEngine.engine.orbitalMechanics && !this.orbitalMechanics) {
                    this.orbitalMechanics = window.gameEngine.engine.orbitalMechanics;
                    console.log('[OrbitalZoneSelector] Acquired engine OrbitalMechanics instance');
                }
                if (window.gameEngine.engine.transferSystem && !this.transferSystem) {
                    this.transferSystem = window.gameEngine.engine.transferSystem;
                    console.log('[OrbitalZoneSelector] Acquired engine TransferSystem instance');
                }
            }
        }
        
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
        
        // Hash quick transfer mode
        if (this.quickTransferMode) {
            hash = ((hash << 5) - hash) + (this.quickTransferMode === 'probe' ? 2 : 3);
        }
        
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
        
        // Update delta-v overlay if visible
        if (this.deltaVOverlayVisible && this.deltaVOverlayCanvas) {
            const sourceZone = this.quickTransferMode ? this.transferSourceZone : (this.deltaVOverlaySourceZone || this.selectedZone);
            const resourceType = this.quickTransferMode ? this.quickTransferMode : (this.deltaVOverlayResourceType || 'probe');
            if (sourceZone) {
                this.drawOverlayChart(this.deltaVOverlayCanvas, sourceZone, resourceType);
            }
        }
        
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
        
        // Throttle metal updates to every 60 frames
        this.metalUpdateFrameCount++;
        const shouldUpdateMetal = this.metalUpdateFrameCount >= 60;
        if (shouldUpdateMetal) {
            this.metalUpdateFrameCount = 0;
        }
        
        // Update each zone's displayed stats
        for (const zone of this.orbitalZones) {
            const zoneData = zones[zone.id] || {};
            const probeCount = zoneData.probe_count || 0;
            
            // Update probe count display if element exists
            const probeCountEl = document.querySelector(`[data-zone-probes="${zone.id}"]`);
            if (probeCountEl) {
                probeCountEl.textContent = probeCount.toLocaleString();
            }
            
            // Update metal display (unmined + stored) - throttled to every 60 frames
            if (shouldUpdateMetal) {
                const metalEl = document.querySelector(`[data-zone-metal="${zone.id}"]`);
                if (metalEl) {
                    // Get unmined metal (mass_remaining * metal_percentage) + stored metal
                    const metalRemaining = zoneData.metal_remaining || 0; // Derived: mass_remaining * metal_percentage
                    const storedMetal = zoneData.stored_metal || 0;
                    const totalMetal = metalRemaining + storedMetal;
                    
                    // Format in scientific notation with 1 sig fig
                    metalEl.textContent = `metal: ${this.formatMetalSciNotation(totalMetal)}`;
                }
            }
        }
    }
    
    /**
     * Format metal mass in scientific notation with 1 significant figure
     * e.g., 4.2e22 kg -> "4e22 kg"
     */
    formatMetalSciNotation(mass) {
        if (mass === 0) return '0 kg';
        if (mass < 1000) return `${Math.round(mass)} kg`;
        
        const exponent = Math.floor(Math.log10(mass));
        const mantissa = mass / Math.pow(10, exponent);
        const roundedMantissa = Math.round(mantissa);
        
        // Handle case where rounding pushes mantissa to 10
        if (roundedMantissa >= 10) {
            return `1e${exponent + 1} kg`;
        }
        
        return `${roundedMantissa}e${exponent} kg`;
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

