/**
 * Universe System
 *
 * Manages Phase 3 (Universe scale) game state including:
 * - Supercluster colonization
 * - Intergalactic transfers
 * - Universe-wide resource aggregation
 * - Kardashev scale progression (K3+)
 *
 * Follows patterns from GalaxySystem for consistency.
 */
class UniverseSystem {
    constructor() {
        // Universe data reference
        this.universeData = null;

        // Colonization state
        this.colonizedSuperclusters = new Set(['laniakea']);
        this.discoveredSuperclusters = new Set();

        // Per-supercluster game state (like galaxy's per-star state)
        this.superclusterStates = {};

        // Currently active/focused supercluster
        this.activeSuperclusterId = 'laniakea';

        // Intergalactic transfers in progress
        this.intergalacticTransfers = [];

        // Universe-wide aggregated stats
        this.universeStats = {
            superclusters_colonized: 1,
            superclusters_discovered: 0,
            galaxies_colonized: 1,
            total_dyson_power_watts: 0,
            kardashev_level: 'K2.5',
            intergalactic_transfers_active: 0,
            total_probes: 0,
            total_compute: 0,
            total_energy: 0
        };

        // Current propulsion tier for intergalactic travel
        this.intergalacticDriveTier = 19; // Start with Void Skipper

        // Time tracking
        this.universeTime = 0; // Years elapsed at universe scale

        // Reference to visualization (set externally)
        this.visualization = null;

        // Reference to galaxy system for data aggregation
        this.galaxySystem = null;
    }

    /**
     * Initialize with universe data
     */
    init(universeData, galaxySystem = null) {
        this.universeData = universeData;
        this.galaxySystem = galaxySystem;

        // Mark all superclusters as discovered
        if (universeData.superclusters) {
            for (const sc of universeData.superclusters) {
                this.discoveredSuperclusters.add(sc.id);
            }
            this.universeStats.superclusters_discovered = this.discoveredSuperclusters.size;
        }

        // Initialize Laniakea state
        this.superclusterStates['laniakea'] = this.createSuperclusterState('laniakea');

        console.log('[UniverseSystem] Initialized with', this.discoveredSuperclusters.size, 'superclusters');
    }

    /**
     * Create initial state for a supercluster
     */
    createSuperclusterState(superclusterId) {
        const scData = this.getSuperclusterData(superclusterId);
        if (!scData) return null;

        return {
            id: superclusterId,
            name: scData.name,
            colonized: this.colonizedSuperclusters.has(superclusterId),
            colonization_time: null,

            // Resource tracking
            total_probes: superclusterId === 'laniakea' ? 1e15 : 0,
            total_dyson_power: superclusterId === 'laniakea' ? 4e30 : 0,
            total_compute: superclusterId === 'laniakea' ? 1e24 : 0,

            // Galaxy tracking within supercluster
            galaxies_colonized: superclusterId === 'laniakea' ? 10 : 0, // Starting with our galaxy
            galaxies_total: scData.galaxy_count || 100000,

            // Expansion progress
            expansion_progress: superclusterId === 'laniakea' ? 0.0001 : 0, // 10 out of 100k

            // Generation seed for procedural content
            seed: this.hashString(superclusterId)
        };
    }

    /**
     * Get supercluster data from universe data
     */
    getSuperclusterData(id) {
        if (!this.universeData?.superclusters) return null;
        return this.universeData.superclusters.find(sc => sc.id === id);
    }

    /**
     * Get all superclusters
     */
    getAllSuperclusters() {
        return this.universeData?.superclusters || [];
    }

    /**
     * Check if supercluster is colonized
     */
    isColonized(superclusterId) {
        return this.colonizedSuperclusters.has(superclusterId);
    }

    /**
     * Initiate intergalactic transfer to a supercluster
     */
    initiateIntergalacticTransfer(targetSuperclusterId, probeCount, options = {}) {
        const targetData = this.getSuperclusterData(targetSuperclusterId);
        if (!targetData) {
            console.error('[UniverseSystem] Unknown supercluster:', targetSuperclusterId);
            return null;
        }

        const sourceData = this.getSuperclusterData(this.activeSuperclusterId);
        const sourceState = this.superclusterStates[this.activeSuperclusterId];

        if (!sourceState || sourceState.total_probes < probeCount) {
            console.error('[UniverseSystem] Insufficient probes for transfer');
            return null;
        }

        // Calculate travel time
        const travelTime = this.calculateIntergalacticTravelTime(
            this.activeSuperclusterId,
            targetSuperclusterId
        );

        const transfer = {
            id: `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            from_supercluster: this.activeSuperclusterId,
            to_supercluster: targetSuperclusterId,
            probes: probeCount,
            drive_tier: this.intergalacticDriveTier,
            start_time: this.universeTime,
            arrival_time: this.universeTime + travelTime,
            travel_time_years: travelTime,
            progress: 0,
            status: 'in_transit'
        };

        // Deduct probes from source
        sourceState.total_probes -= probeCount;

        this.intergalacticTransfers.push(transfer);
        this.universeStats.intergalactic_transfers_active = this.intergalacticTransfers.length;

        console.log(`[UniverseSystem] Initiated transfer to ${targetData.name}:`,
            `${probeCount.toExponential(2)} probes, ETA: ${travelTime.toFixed(1)} years`);

        return transfer;
    }

    /**
     * Calculate travel time between superclusters
     */
    calculateIntergalacticTravelTime(fromId, toId) {
        const from = this.getSuperclusterData(fromId);
        const to = this.getSuperclusterData(toId);

        if (!from?.position_mpc || !to?.position_mpc) {
            return Infinity;
        }

        // Calculate distance in Mpc
        const dx = to.position_mpc.x - from.position_mpc.x;
        const dy = to.position_mpc.y - from.position_mpc.y;
        const dz = to.position_mpc.z - from.position_mpc.z;
        const distance_mpc = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Get drive speed
        const drive = this.getIntergalacticDrive(this.intergalacticDriveTier);
        if (!drive) {
            return Infinity;
        }

        // Instantaneous drive
        if (drive.physics?.instantaneous) {
            return 0;
        }

        // Convert Mpc to light years: 1 Mpc = 3,261,566 ly
        const distance_ly = distance_mpc * 3261566;

        // Travel time in years = distance / velocity
        const velocity_c = drive.max_velocity_c;
        const travel_time_years = distance_ly / velocity_c;

        return travel_time_years;
    }

    /**
     * Get intergalactic drive data by tier
     */
    getIntergalacticDrive(tier) {
        if (!this.universeData?.intergalactic_drives) return null;
        return this.universeData.intergalactic_drives.find(d => d.tier === tier);
    }

    /**
     * Process intergalactic transfers (called each universe tick)
     */
    processIntergalacticTransfers(deltaYears) {
        const arrivals = [];

        for (const transfer of this.intergalacticTransfers) {
            if (transfer.status !== 'in_transit') continue;

            // Update progress
            const elapsed = this.universeTime - transfer.start_time;
            transfer.progress = Math.min(1, elapsed / transfer.travel_time_years);

            // Check for arrival
            if (this.universeTime >= transfer.arrival_time) {
                transfer.status = 'arrived';
                arrivals.push(transfer);
            }
        }

        // Process arrivals
        for (const transfer of arrivals) {
            this.processArrival(transfer);
        }

        // Remove completed transfers
        this.intergalacticTransfers = this.intergalacticTransfers.filter(
            t => t.status === 'in_transit'
        );
        this.universeStats.intergalactic_transfers_active = this.intergalacticTransfers.length;
    }

    /**
     * Process probe arrival at supercluster
     */
    processArrival(transfer) {
        const targetId = transfer.to_supercluster;

        console.log(`[UniverseSystem] Probes arrived at ${targetId}:`, transfer.probes.toExponential(2));

        // Colonize if not already
        if (!this.colonizedSuperclusters.has(targetId)) {
            this.colonizeSupercluster(targetId, transfer.probes);
        } else {
            // Add probes to existing colony
            const state = this.superclusterStates[targetId];
            if (state) {
                state.total_probes += transfer.probes;
            }
        }

        // Update stats
        this.updateUniverseStats();
    }

    /**
     * Colonize a new supercluster
     */
    colonizeSupercluster(superclusterId, initialProbes = 0) {
        if (this.colonizedSuperclusters.has(superclusterId)) {
            console.log('[UniverseSystem] Already colonized:', superclusterId);
            return;
        }

        const scData = this.getSuperclusterData(superclusterId);
        if (!scData) return;

        this.colonizedSuperclusters.add(superclusterId);

        // Create state for new supercluster
        const state = this.createSuperclusterState(superclusterId);
        state.colonized = true;
        state.colonization_time = this.universeTime;
        state.total_probes = initialProbes;
        state.galaxies_colonized = 1; // Start with one galaxy

        this.superclusterStates[superclusterId] = state;
        this.universeStats.superclusters_colonized = this.colonizedSuperclusters.size;

        console.log(`[UniverseSystem] Colonized ${scData.name}!`);

        // Trigger event for UI update
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('supercluster-colonized', {
                detail: { superclusterId, name: scData.name }
            }));
        }
    }

    /**
     * Switch active supercluster focus
     */
    switchToSupercluster(superclusterId) {
        if (!this.colonizedSuperclusters.has(superclusterId)) {
            console.warn('[UniverseSystem] Cannot switch to uncolonized supercluster');
            return false;
        }

        this.activeSuperclusterId = superclusterId;
        console.log('[UniverseSystem] Switched to', superclusterId);

        return true;
    }

    /**
     * Universe tick - advance time and process transfers
     */
    tick(deltaYears = 1) {
        this.universeTime += deltaYears;

        // Process intergalactic transfers
        this.processIntergalacticTransfers(deltaYears);

        // Update supercluster states
        this.updateSuperclusterStates(deltaYears);

        // Update aggregate stats
        this.updateUniverseStats();
    }

    /**
     * Update all supercluster states
     */
    updateSuperclusterStates(deltaYears) {
        for (const [scId, state] of Object.entries(this.superclusterStates)) {
            if (!state.colonized) continue;

            // Simulate exponential growth within superclusters
            const growthRate = 0.01; // 1% per year

            // Probe growth
            state.total_probes *= (1 + growthRate * deltaYears);

            // Galaxy colonization progress
            if (state.galaxies_colonized < state.galaxies_total) {
                const colonizationRate = 0.001 * deltaYears; // 0.1% of remaining per year
                const newGalaxies = Math.floor((state.galaxies_total - state.galaxies_colonized) * colonizationRate);
                state.galaxies_colonized = Math.min(state.galaxies_total, state.galaxies_colonized + Math.max(1, newGalaxies));
            }

            // Update expansion progress
            state.expansion_progress = state.galaxies_colonized / state.galaxies_total;

            // Power growth (proportional to galaxies colonized)
            state.total_dyson_power = state.galaxies_colonized * 4e26 * 0.1; // 10% of potential per galaxy
        }
    }

    /**
     * Update aggregate universe stats
     */
    updateUniverseStats() {
        let totalProbes = 0;
        let totalPower = 0;
        let totalGalaxies = 0;

        for (const state of Object.values(this.superclusterStates)) {
            if (!state.colonized) continue;
            totalProbes += state.total_probes;
            totalPower += state.total_dyson_power;
            totalGalaxies += state.galaxies_colonized;
        }

        this.universeStats.total_probes = totalProbes;
        this.universeStats.total_dyson_power_watts = totalPower;
        this.universeStats.galaxies_colonized = totalGalaxies;
        this.universeStats.superclusters_colonized = this.colonizedSuperclusters.size;

        // Calculate Kardashev level
        this.universeStats.kardashev_level = this.calculateKardashevLevel(totalPower);
    }

    /**
     * Calculate Kardashev scale level based on power output
     */
    calculateKardashevLevel(powerWatts) {
        // K = (log10(P) - 6) / 10
        // Or use thresholds from universe data
        const thresholds = this.universeData?.gameplay?.kardashev_scale || {};

        if (powerWatts >= 4e48) return 'K4';
        if (powerWatts >= 4e42) return 'K3.5';
        if (powerWatts >= 4e36) return 'K3';
        if (powerWatts >= 4e30) return 'K2.5';
        if (powerWatts >= 4e26) return 'K2';
        return 'K1';
    }

    /**
     * Get universe stats
     */
    getUniverseStats() {
        return { ...this.universeStats };
    }

    /**
     * Get state for a specific supercluster
     */
    getSuperclusterState(superclusterId) {
        return this.superclusterStates[superclusterId] || null;
    }

    /**
     * Get active supercluster state
     */
    getActiveSuperclusterState() {
        return this.superclusterStates[this.activeSuperclusterId];
    }

    /**
     * Upgrade intergalactic drive tier
     */
    upgradeDrive(newTier) {
        const drive = this.getIntergalacticDrive(newTier);
        if (!drive) {
            console.error('[UniverseSystem] Invalid drive tier:', newTier);
            return false;
        }

        this.intergalacticDriveTier = newTier;
        console.log(`[UniverseSystem] Upgraded to ${drive.name} (${drive.max_velocity_c}c)`);
        return true;
    }

    /**
     * Get available drive tiers
     */
    getAvailableDrives() {
        return this.universeData?.intergalactic_drives || [];
    }

    /**
     * Save universe state
     */
    save() {
        return {
            colonizedSuperclusters: Array.from(this.colonizedSuperclusters),
            superclusterStates: this.superclusterStates,
            activeSuperclusterId: this.activeSuperclusterId,
            intergalacticTransfers: this.intergalacticTransfers,
            universeStats: this.universeStats,
            intergalacticDriveTier: this.intergalacticDriveTier,
            universeTime: this.universeTime
        };
    }

    /**
     * Restore universe state
     */
    restore(savedState) {
        if (!savedState) return;

        if (savedState.colonizedSuperclusters) {
            this.colonizedSuperclusters = new Set(savedState.colonizedSuperclusters);
        }
        if (savedState.superclusterStates) {
            this.superclusterStates = savedState.superclusterStates;
        }
        if (savedState.activeSuperclusterId) {
            this.activeSuperclusterId = savedState.activeSuperclusterId;
        }
        if (savedState.intergalacticTransfers) {
            this.intergalacticTransfers = savedState.intergalacticTransfers;
        }
        if (savedState.universeStats) {
            this.universeStats = savedState.universeStats;
        }
        if (savedState.intergalacticDriveTier) {
            this.intergalacticDriveTier = savedState.intergalacticDriveTier;
        }
        if (savedState.universeTime !== undefined) {
            this.universeTime = savedState.universeTime;
        }

        console.log('[UniverseSystem] Restored state with',
            this.colonizedSuperclusters.size, 'colonized superclusters');
    }

    // Utility methods

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
}

// Export
if (typeof window !== 'undefined') {
    window.UniverseSystem = UniverseSystem;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UniverseSystem;
}
