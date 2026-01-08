/**
 * Galaxy System Manager
 *
 * Manages multiple star systems for interstellar expansion.
 * Phase A: 10 nearby stars with full simulation
 * Phase B: 100K galaxy dots with aggregate stats
 */

class GalaxySystem {
    constructor() {
        // Nearby stars data (loaded from JSON)
        this.nearbyStars = null;

        // Current active system (full simulation)
        this.activeSystemId = 'sol';

        // System states: { systemId: { zones, probes_by_zone, structures_by_zone, dyson_sphere, ... } }
        this.systemStates = {};

        // Interstellar transfers in progress
        this.interstellarTransfers = [];

        // Galaxy-wide stats (aggregated)
        this.galaxyStats = {
            systems_colonized: 1,
            systems_with_dyson: 0,
            total_probes: 0,
            total_dyson_mass: 0,
            total_power: 0,
            dyson_by_spectral: { O: 0, B: 0, A: 0, F: 0, G: 0, K: 0, M: 0 }
        };

        // Colonized systems set
        this.colonizedSystems = new Set(['sol']);

        // Discovered but not colonized
        this.discoveredSystems = new Set();
    }

    /**
     * Load nearby stars data from JSON
     * @param {Object} data - nearby_stars.json data
     */
    loadNearbyStars(data) {
        this.nearbyStars = data;

        // Mark all stars as discovered (Phase A - they're all visible)
        if (data.stars) {
            for (const star of data.stars) {
                if (star.id !== 'sol') {
                    this.discoveredSystems.add(star.id);
                }
            }
        }

        // Mark dust clouds as discovered too
        if (data.dust_clouds) {
            for (const cloud of data.dust_clouds) {
                this.discoveredSystems.add(cloud.id);
            }
        }
    }

    /**
     * Get star info by ID (includes dust clouds)
     * @param {string} starId - Star system ID
     * @returns {Object|null} Star data
     */
    getStarInfo(starId) {
        if (!this.nearbyStars) return null;

        // Check stars first
        if (this.nearbyStars.stars) {
            const star = this.nearbyStars.stars.find(s => s.id === starId);
            if (star) return star;
        }

        // Check dust clouds
        if (this.nearbyStars.dust_clouds) {
            const cloud = this.nearbyStars.dust_clouds.find(c => c.id === starId);
            if (cloud) return cloud;
        }

        return null;
    }

    /**
     * Get all nearby stars
     * @returns {Array} Array of star objects
     */
    getAllStars() {
        return this.nearbyStars?.stars || [];
    }

    /**
     * Get all dust clouds
     * @returns {Array} Array of dust cloud objects
     */
    getAllDustClouds() {
        return this.nearbyStars?.dust_clouds || [];
    }

    /**
     * Get all stellar objects (stars + dust clouds)
     * @returns {Array} Array of all stellar objects
     */
    getAllStellarObjects() {
        const stars = this.nearbyStars?.stars || [];
        const dustClouds = this.nearbyStars?.dust_clouds || [];
        return [...stars, ...dustClouds];
    }

    /**
     * Get colonized systems
     * @returns {Array} Array of colonized star IDs
     */
    getColonizedSystems() {
        return Array.from(this.colonizedSystems);
    }

    /**
     * Check if system is colonized
     * @param {string} systemId - System ID
     * @returns {boolean}
     */
    isColonized(systemId) {
        return this.colonizedSystems.has(systemId);
    }

    /**
     * Calculate transfer time to a star
     * @param {string} fromSystemId - Origin system ID
     * @param {string} toSystemId - Destination system ID
     * @param {number} effectiveVelocityC - Effective velocity as fraction of c
     * @returns {Object} { time_days, time_years, distance_ly }
     */
    calculateTransferTime(fromSystemId, toSystemId, effectiveVelocityC) {
        const fromStar = this.getStarInfo(fromSystemId);
        const toStar = this.getStarInfo(toSystemId);

        if (!fromStar || !toStar) {
            return { time_days: Infinity, time_years: Infinity, distance_ly: Infinity };
        }

        // Calculate distance in light-years
        const dx = toStar.position_ly.x - fromStar.position_ly.x;
        const dy = toStar.position_ly.y - fromStar.position_ly.y;
        const dz = toStar.position_ly.z - fromStar.position_ly.z;
        const distance_ly = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Calculate time
        const time_years = distance_ly / effectiveVelocityC;
        const time_days = time_years * 365.25;

        return {
            time_days,
            time_years,
            distance_ly,
            effective_velocity_c: effectiveVelocityC
        };
    }

    /**
     * Initiate interstellar transfer
     * @param {string} fromSystemId - Origin system
     * @param {string} toSystemId - Destination system
     * @param {number} probeCount - Number of probes to send
     * @param {number} effectiveVelocityC - Travel speed as fraction of c
     * @param {number} currentTime - Current game time in days
     * @returns {Object} Transfer object
     */
    initiateTransfer(fromSystemId, toSystemId, probeCount, effectiveVelocityC, currentTime) {
        const transferTime = this.calculateTransferTime(fromSystemId, toSystemId, effectiveVelocityC);

        const transfer = {
            id: `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            from_system: fromSystemId,
            to_system: toSystemId,
            probe_count: probeCount,
            departure_time: currentTime,
            arrival_time: currentTime + transferTime.time_days,
            distance_ly: transferTime.distance_ly,
            effective_velocity_c: effectiveVelocityC,
            status: 'in_transit'
        };

        this.interstellarTransfers.push(transfer);
        return transfer;
    }

    /**
     * Process interstellar transfers (call each tick)
     * @param {number} currentTime - Current game time in days
     * @returns {Array} Array of completed transfers
     */
    processTransfers(currentTime) {
        const completedTransfers = [];

        for (const transfer of this.interstellarTransfers) {
            if (transfer.status === 'in_transit' && currentTime >= transfer.arrival_time) {
                transfer.status = 'arrived';
                completedTransfers.push(transfer);

                // Colonize the system if not already colonized
                if (!this.colonizedSystems.has(transfer.to_system)) {
                    this.colonizeSystem(transfer.to_system, transfer.probe_count);
                } else {
                    // Add probes to existing colony
                    this.addProbesToSystem(transfer.to_system, transfer.probe_count);
                }
            }
        }

        // Remove completed transfers from active list
        this.interstellarTransfers = this.interstellarTransfers.filter(t => t.status === 'in_transit');

        return completedTransfers;
    }

    /**
     * Colonize a new star system
     * @param {string} systemId - System to colonize
     * @param {number} initialProbes - Starting probe count
     */
    colonizeSystem(systemId, initialProbes) {
        this.colonizedSystems.add(systemId);
        this.discoveredSystems.delete(systemId);

        const star = this.getStarInfo(systemId);
        if (!star) return;

        // Initialize system state (will be generated when player visits)
        this.systemStates[systemId] = {
            colonized: true,
            colonization_time: null, // Will be set when visited
            initial_probes: initialProbes,
            zones: null, // Generated on first visit
            probes_by_zone: null,
            structures_by_zone: null,
            dyson_sphere: null,
            needs_generation: true
        };

        this.updateGalaxyStats();
    }

    /**
     * Add probes to an existing system
     * @param {string} systemId - Target system
     * @param {number} probeCount - Probes to add
     */
    addProbesToSystem(systemId, probeCount) {
        if (!this.systemStates[systemId]) return;

        if (this.systemStates[systemId].needs_generation) {
            // System not yet visited, add to initial count
            this.systemStates[systemId].initial_probes += probeCount;
        } else {
            // System active, add to first zone
            // This will be handled by the main engine when switching systems
        }
    }

    /**
     * Switch active system
     * @param {string} systemId - System to switch to
     * @returns {Object|null} System state or null if not colonized
     */
    switchToSystem(systemId) {
        if (!this.colonizedSystems.has(systemId)) {
            return null;
        }

        this.activeSystemId = systemId;
        return this.systemStates[systemId];
    }

    /**
     * Save current system state before switching
     * @param {Object} engineState - Current engine state
     */
    saveCurrentSystemState(engineState) {
        this.systemStates[this.activeSystemId] = {
            colonized: true,
            zones: engineState.zones,
            probes_by_zone: engineState.probes_by_zone,
            structures_by_zone: engineState.structures_by_zone,
            dyson_sphere: engineState.dyson_sphere,
            needs_generation: false
        };
    }

    /**
     * Generate zones for a new star system
     * @param {string} systemId - System ID
     * @param {Object} solarSystemData - Base solar system data template
     * @returns {Object} Generated zones and initial state
     */
    generateSystemZones(systemId, solarSystemData) {
        const star = this.getStarInfo(systemId);
        if (!star) return null;

        // Scale factor based on star luminosity
        const auScale = Math.sqrt(star.luminosity_solar);

        // Get zone count based on spectral type
        const zoneCount = this.nearbyStars?.generation_rules?.zone_scaling?.zone_count_by_spectral?.[star.spectral_class] || 8;

        // Generate zones based on star properties
        // For now, create a simplified zone set
        const zones = {};
        const probes_by_zone = {};
        const structures_by_zone = {};

        // Create generic zones scaled to star
        const zoneNames = ['inner_system', 'habitable_zone', 'outer_system', 'asteroid_belt', 'gas_giants', 'ice_giants', 'kuiper_belt', 'oort_cloud'];

        for (let i = 0; i < Math.min(zoneCount, zoneNames.length); i++) {
            const zoneId = `${systemId}_${zoneNames[i]}`;
            zones[zoneId] = {
                id: zoneId,
                name: this.formatZoneName(zoneNames[i]),
                distance_au: (i + 1) * auScale,
                type: zoneNames[i],
                star_id: systemId,
                resources: this.generateZoneResources(star, i)
            };
            probes_by_zone[zoneId] = i === 0 ? (this.systemStates[systemId]?.initial_probes || 0) : 0;
            structures_by_zone[zoneId] = {};
        }

        return {
            zones,
            probes_by_zone,
            structures_by_zone,
            dyson_sphere: {
                mass_kg: 0,
                completion_percent: 0,
                power_output_w: 0,
                target_mass_kg: star.luminosity_solar * 1e26 // Scale with luminosity
            }
        };
    }

    /**
     * Format zone name for display
     * @param {string} zoneName - Raw zone name
     * @returns {string} Formatted name
     */
    formatZoneName(zoneName) {
        return zoneName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    /**
     * Generate resources for a zone
     * @param {Object} star - Star data
     * @param {number} zoneIndex - Zone index
     * @returns {Object} Resource data
     */
    generateZoneResources(star, zoneIndex) {
        const baseMetal = 1e15 * star.mass_solar;
        const zoneMultiplier = zoneIndex === 3 ? 10 : 1; // Asteroid belt has more

        return {
            metal_kg: baseMetal * zoneMultiplier * (0.5 + Math.random()),
            ice_kg: baseMetal * 0.1 * (zoneIndex > 4 ? 10 : 1),
            rare_elements_kg: baseMetal * 0.001
        };
    }

    /**
     * Update galaxy-wide statistics
     */
    updateGalaxyStats() {
        this.galaxyStats.systems_colonized = this.colonizedSystems.size;

        let totalProbes = 0;
        let totalDysonMass = 0;
        let systemsWithDyson = 0;
        const dysonBySpectral = { O: 0, B: 0, A: 0, F: 0, G: 0, K: 0, M: 0 };

        for (const systemId of this.colonizedSystems) {
            const state = this.systemStates[systemId];
            const star = this.getStarInfo(systemId);

            if (state && !state.needs_generation) {
                // Sum probes
                if (state.probes_by_zone) {
                    totalProbes += Object.values(state.probes_by_zone).reduce((a, b) => a + b, 0);
                }

                // Sum Dyson mass
                if (state.dyson_sphere && state.dyson_sphere.mass_kg > 0) {
                    totalDysonMass += state.dyson_sphere.mass_kg;
                    systemsWithDyson++;

                    if (star && star.spectral_class) {
                        dysonBySpectral[star.spectral_class] = (dysonBySpectral[star.spectral_class] || 0) + 1;
                    }
                }
            } else if (state && state.initial_probes) {
                totalProbes += state.initial_probes;
            }
        }

        this.galaxyStats.total_probes = totalProbes;
        this.galaxyStats.total_dyson_mass = totalDysonMass;
        this.galaxyStats.systems_with_dyson = systemsWithDyson;
        this.galaxyStats.dyson_by_spectral = dysonBySpectral;
    }

    /**
     * Get pending transfers
     * @returns {Array} Active transfers
     */
    getPendingTransfers() {
        return this.interstellarTransfers.filter(t => t.status === 'in_transit');
    }

    /**
     * Export state for saving
     * @returns {Object} Serializable state
     */
    exportState() {
        return {
            activeSystemId: this.activeSystemId,
            systemStates: this.systemStates,
            interstellarTransfers: this.interstellarTransfers,
            galaxyStats: this.galaxyStats,
            colonizedSystems: Array.from(this.colonizedSystems),
            discoveredSystems: Array.from(this.discoveredSystems)
        };
    }

    /**
     * Import state from save
     * @param {Object} state - Saved state
     */
    importState(state) {
        if (!state) return;

        this.activeSystemId = state.activeSystemId || 'sol';
        this.systemStates = state.systemStates || {};
        this.interstellarTransfers = state.interstellarTransfers || [];
        this.galaxyStats = state.galaxyStats || this.galaxyStats;
        this.colonizedSystems = new Set(state.colonizedSystems || ['sol']);
        this.discoveredSystems = new Set(state.discoveredSystems || []);
    }

    /**
     * Get galaxy colonization completion percentage
     * Used to determine Phase 3 (Universe) unlock
     * @returns {number} Completion percentage (0-1)
     */
    getCompletionPercentage() {
        // Count total colonizable systems (stars + dust clouds)
        const totalStars = (this.nearbyStars?.stars?.length || 0);
        const totalClouds = (this.nearbyStars?.dust_clouds?.length || 0);
        const totalSystems = totalStars + totalClouds;

        if (totalSystems === 0) return 0;

        // Count colonized systems
        const colonizedCount = this.colonizedSystems.size;

        return colonizedCount / totalSystems;
    }

    /**
     * Check if galaxy is complete enough to unlock universe view
     * Requires 99% completion (most systems colonized)
     * @returns {boolean} True if universe should be unlockable
     */
    isUniverseUnlockable() {
        return this.getCompletionPercentage() >= 0.99;
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GalaxySystem;
}

// Global instance for browser
if (typeof window !== 'undefined') {
    window.GalaxySystem = GalaxySystem;
}
