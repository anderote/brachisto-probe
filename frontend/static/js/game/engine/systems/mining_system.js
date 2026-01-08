/**
 * Mining System
 *
 * Zone mining and depletion
 * All rates in kg/day
 *
 * Resource Pool Model:
 * - Planet surface: stored_metal stays on planet until lifted by space elevators
 * - Orbital pool: shared among planet and all its moons
 * - Moon zones: mine directly into parent planet's orbital pool
 * - Space elevators: lift 1000 GT/day from surface to orbital pool
 */

class MiningSystem {
    constructor(productionCalculator, orbitalMechanics) {
        this.productionCalculator = productionCalculator;
        this.orbitalMechanics = orbitalMechanics;

        // Space elevator lifting capacity: 1000 gigatons/day = 1e15 kg/day
        this.ELEVATOR_CAPACITY_KG_PER_DAY = 1e15;
    }

    /**
     * Get the parent planet zone ID for a moon, or null if not a moon
     */
    getParentPlanetId(zoneId) {
        const zoneData = this.orbitalMechanics.getZone(zoneId);
        if (zoneData && zoneData.parent_zone) {
            return zoneData.parent_zone;
        }
        return null;
    }

    /**
     * Check if a zone is a moon
     */
    isMoonZone(zoneId) {
        return this.getParentPlanetId(zoneId) !== null;
    }
    
    /**
     * Process mining for all zones
     * @param {Object} state - Game state
     * @param {number} deltaTime - Time delta in days
     * @param {Object} skills - Current skills
     * @param {Object} buildings - Building definitions
     * @param {number} energyThrottle - Energy throttle factor (0-1)
     * @returns {Object} Updated state
     */
    processMining(state, deltaTime, skills, buildings, energyThrottle = 1.0) {
        const profiler = typeof self !== 'undefined' && self.performanceProfiler 
            ? self.performanceProfiler 
            : (typeof window !== 'undefined' && window.performanceProfiler ? window.performanceProfiler : null);
        const cloneStart = profiler ? performance.now() : null;
        const newState = JSON.parse(JSON.stringify(state));  // Deep clone
        if (profiler && cloneStart !== null) {
            profiler.recordStateCloneTime(performance.now() - cloneStart);
        }
        
        const zones = newState.zones || {};
        const probesByZone = newState.probes_by_zone || {};
        const probeAllocationsByZone = newState.probe_allocations_by_zone || {};
        const structuresByZone = newState.structures_by_zone || {};
        
        
        // Iterate over all zones that have probes OR are in zones list
        // Ensure zones with probes are processed even if not in zones list
        const zonesToProcess = new Set(Object.keys(zones));
        for (const zoneId in probesByZone) {
            zonesToProcess.add(zoneId);
        }
        
        for (const zoneId of zonesToProcess) {
            // Ensure zone exists in zones object
            if (!zones[zoneId]) {
                // Get zone data from orbital mechanics
                const zoneData = this.orbitalMechanics.getZone(zoneId);

                if (!zoneData) {
                    // Zone not found in orbital mechanics data - skip
                    continue;
                }

                // Check if this is a moon zone
                const isMoon = this.isMoonZone(zoneId);

                // Zone structure with surface/orbital resource pools
                zones[zoneId] = {
                    mass_remaining: zoneData.total_mass_kg || 0,  // Un-mined mass
                    stored_metal: 0,                               // Surface metal (on planet, needs elevator to lift)
                    orbital_metal: 0,                              // Orbital metal (accessible to moons and orbital structures)
                    probe_mass: 0,                                 // Mass of all probes in zone
                    structure_mass: 0,                             // Mass of all structures in zone
                    slag_mass: 0,                                  // Mass of slag in zone
                    depleted: false,                               // True when mass_remaining <= 0
                    is_moon: isMoon,                               // True if this is a moon zone
                    parent_zone: zoneData.parent_zone || null      // Parent planet ID for moons
                };
            }
            
            const zone = zones[zoneId];
            
            // Skip Dyson zone (no mining)
            if (this.orbitalMechanics.isDysonZone(zoneId)) {
                continue;
            }
            
            // Skip if depleted
            if (zone.depleted) {
                continue;
            }
            
            // Skip if no remaining mass (early exit for efficiency)
            const massRemaining = zone.mass_remaining || 0;
            if (massRemaining <= 0) {
                zone.depleted = true;
                continue;
            }
            
            // Calculate mining rate
            const zoneProbes = probesByZone[zoneId] || {};
            // Direct access to probe count (single probe type 'probe')
            const totalProbes = zoneProbes['probe'] || 0;
            const allocations = probeAllocationsByZone[zoneId] || {};
            const harvestAllocation = allocations.harvest || 0;
            
            // Probe mining - use fractional probe count
            const miningProbes = totalProbes * harvestAllocation;
            // Mining rate is MASS extraction rate (kg/day), not metal
            // Uses pre-calculated upgrade factors from state
            // Pass totalProbes for probe count scaling penalty
            const probeMassMiningRate = this.productionCalculator.calculateMiningRate(miningProbes, zoneId, newState, totalProbes);
            
            // Structure mining (also returns mass rate)
            // Uses pre-calculated upgrade factors from state
            const structureMassMiningRate = this.productionCalculator.calculateStructureMiningRate(
                structuresByZone, zoneId, buildings, newState
            );
            
            const totalMassMiningRate = probeMassMiningRate + structureMassMiningRate;
            
            // Apply energy throttle
            const effectiveMassMiningRate = totalMassMiningRate * energyThrottle;
            
            // Extract MASS (not metal directly)
            const massExtracted = effectiveMassMiningRate * deltaTime;
            const actualMassExtracted = Math.min(massExtracted, massRemaining);
            
            // Skip if no actual extraction possible (e.g., no mining rate)
            if (actualMassExtracted <= 0) {
                continue;
            }
            
            // Calculate metal extraction efficiency (based on research and refineries)
            const extractionEfficiency = this.productionCalculator.calculateMetalExtractionEfficiency(
                zoneId, skills, structuresByZone, buildings
            );
            
            // Extract metal from mined mass
            const metalExtracted = actualMassExtracted * extractionEfficiency;
            
            // Slag is the non-metal portion of extracted mass
            const slagProduced = actualMassExtracted - metalExtracted;
            
            // Update zone state
            zone.mass_remaining = Math.max(0, massRemaining - actualMassExtracted);
            zone.slag_mass = (zone.slag_mass || 0) + slagProduced;

            // Determine where to deposit metal based on zone type
            const parentZoneId = zone.parent_zone;

            if (parentZoneId && zones[parentZoneId]) {
                // Moon zone: metal goes directly to parent planet's orbital pool
                zones[parentZoneId].orbital_metal = (zones[parentZoneId].orbital_metal || 0) + metalExtracted;
            } else if (parentZoneId) {
                // Parent zone not yet initialized - store locally for now
                zone.stored_metal = (zone.stored_metal || 0) + metalExtracted;
            } else {
                // Planet zone: metal goes to surface storage (needs elevator to lift)
                zone.stored_metal = (zone.stored_metal || 0) + metalExtracted;
            }

            // Check if depleted
            if (zone.mass_remaining <= 0) {
                zone.depleted = true;

                // Handle planet depletion - merge resources into orbit
                if (!zone.is_moon && !zone.parent_zone) {
                    this.handlePlanetDepletion(zones, zoneId);
                }
            }

            // Add slag to global pool (for global tracking, but also stored per-zone)
            newState.slag = (newState.slag || 0) + slagProduced;
        }

        // Process space elevator lifting for all zones
        this.processSpaceElevators(newState, deltaTime, structuresByZone);

        newState.zones = zones;
        return newState;
    }

    /**
     * Handle planet depletion - merge all resources into orbital pool
     * When a planet is fully mined:
     * - Surface metal moves to orbital pool
     * - Moon resources merge into the orbital pool
     * - Moons become independent (orbit the sun)
     * @param {Object} zones - Zones object from state
     * @param {string} planetZoneId - The depleted planet's zone ID
     */
    handlePlanetDepletion(zones, planetZoneId) {
        const planetZone = zones[planetZoneId];
        if (!planetZone) return;

        // Move all surface metal to orbital pool
        const surfaceMetal = planetZone.stored_metal || 0;
        if (surfaceMetal > 0) {
            planetZone.orbital_metal = (planetZone.orbital_metal || 0) + surfaceMetal;
            planetZone.stored_metal = 0;
        }

        // Find all moons of this planet and make them independent
        for (const zoneId of Object.keys(zones)) {
            const zone = zones[zoneId];

            if (zone.parent_zone === planetZoneId) {
                // This is a moon of the depleted planet

                // Any stored metal on the moon goes to the orbital pool
                const moonStoredMetal = zone.stored_metal || 0;
                if (moonStoredMetal > 0) {
                    planetZone.orbital_metal = (planetZone.orbital_metal || 0) + moonStoredMetal;
                    zone.stored_metal = 0;
                }

                // Moon becomes independent - clears parent reference
                zone.parent_zone = null;
                zone.is_moon = false;
                zone.independent = true;  // Mark as formerly a moon, now independent
                zone.former_parent = planetZoneId;  // Track what it used to orbit
            }
        }

        // Mark planet as collapsed (all resources now in orbit)
        planetZone.collapsed = true;
    }

    /**
     * Process space elevators lifting metal from surface to orbital pool
     * Each elevator lifts 1000 GT/day
     */
    processSpaceElevators(state, deltaTime, structuresByZone) {
        const zones = state.zones || {};

        for (const zoneId of Object.keys(zones)) {
            const zone = zones[zoneId];

            // Skip moon zones (elevators only on planets)
            if (zone.is_moon || zone.parent_zone) {
                continue;
            }

            // Get elevator count for this zone
            const zoneStructures = structuresByZone[zoneId] || {};
            const elevatorCount = zoneStructures['space_elevator'] || 0;

            if (elevatorCount <= 0) {
                continue;
            }

            // Calculate lifting capacity
            const liftingCapacity = elevatorCount * this.ELEVATOR_CAPACITY_KG_PER_DAY * deltaTime;

            // Get available surface metal
            const surfaceMetal = zone.stored_metal || 0;

            if (surfaceMetal <= 0) {
                continue;
            }

            // Lift metal from surface to orbital pool
            const metalLifted = Math.min(liftingCapacity, surfaceMetal);
            zone.stored_metal = surfaceMetal - metalLifted;
            zone.orbital_metal = (zone.orbital_metal || 0) + metalLifted;
        }
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MiningSystem;
}

