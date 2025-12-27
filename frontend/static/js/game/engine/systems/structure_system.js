/**
 * Structure System
 * 
 * Structure construction and operation
 * All rates in kg/day
 */

class StructureSystem {
    constructor(productionCalculator) {
        this.productionCalculator = productionCalculator;
        this.economicRules = null;
        
        // Default values (fallbacks if economic rules not loaded)
        this.BASE_STRUCTURE_ENERGY_COST = 250000; // 250 kW base for structure energy multipliers
        this.GEOMETRIC_SCALING_EXPONENT = Config.STRUCTURE_GEOMETRIC_SCALING_EXPONENT || 3.2;
    }
    
    /**
     * Initialize with economic rules
     * @param {Object} economicRules - Economic rules from data loader
     */
    initializeEconomicRules(economicRules) {
        this.economicRules = economicRules;
        
        // Load base values from economic rules (with fallbacks to defaults)
        if (economicRules?.structures) {
            this.BASE_STRUCTURE_ENERGY_COST = economicRules.structures.base_energy_cost_w ?? this.BASE_STRUCTURE_ENERGY_COST;
            this.GEOMETRIC_SCALING_EXPONENT = economicRules.structures.geometric_scaling_exponent ?? this.GEOMETRIC_SCALING_EXPONENT;
        }
    }
    
    /**
     * Calculate effective structure cost (mass) using cost upgrade factor and geometric scaling
     * Cost increases geometrically with the number of structures already built in that zone
     * Formula: baseCost * (count + 1), so building #10 costs 10x the base cost
     * @param {Object} building - Building definition with mass_multiplier
     * @param {Object} state - Game state with upgrade_factors
     * @param {string} zoneId - Zone identifier (for counting existing structures)
     * @param {string} buildingId - Building ID (for counting existing structures)
     * @returns {number} Effective mass cost in kg
     */
    calculateStructureCost(building, state, zoneId = null, buildingId = null) {
        if (!building) {
            return 0;
        }
        
        // Check for mass_multiplier first (preferred format)
        if (!building.mass_multiplier) {
            // Fallback to mass_kg (direct mass specification)
            if (building.mass_kg) {
                return building.mass_kg;
            }
            // Fallback to old base_cost_metal if available
            return building.base_cost_metal || 0;
        }
        
        const baseProbeMass = Config.PROBE_MASS || 100;
        const baseMass = baseProbeMass * building.mass_multiplier;
        
        // Get cost upgrade factor for structures
        const costFactor = state.upgrade_factors?.structure?.building?.cost || 1.0;
        
        // Base cost with research factor
        const baseCost = baseMass * costFactor;
        
        // Methalox refineries and mass drivers use flat scaling (no geometric increase)
        // Methalox refineries have zone limits instead of exponential cost scaling
        // Mass drivers scale linearly - each additional one provides the same capacity boost
        if (buildingId === 'methalox_refinery' || buildingId === 'mass_driver') {
            return baseCost;
        }
        
        // Apply exponential scaling based on existing structures in this zone
        // Cost = baseCost * (count + 1)^exponent, using same exponent as output scaling
        if (zoneId && buildingId && state.structures_by_zone) {
            const zoneStructures = state.structures_by_zone[zoneId] || {};
            const currentCount = zoneStructures[buildingId] || 0;
            // Use building-specific exponent if available, otherwise global default
            const exponent = building.geometric_scaling_exponent ?? this.GEOMETRIC_SCALING_EXPONENT;
            // Next building will be count + 1, so multiply by (currentCount + 1)^exponent
            const scalingFactor = Math.pow(currentCount + 1, exponent);
            return baseCost * scalingFactor;
        }
        
        // If zone/building not specified, return base cost (for UI display when zone not selected)
        return baseCost;
    }
    
    /**
     * Calculate effective structure mining rate
     * @param {Object} building - Building definition with mining_rate_multiplier
     * @param {Object} state - Game state with upgrade_factors
     * @returns {number} Effective mining rate in kg/day
     */
    calculateStructureMiningRate(building, state) {
        if (!building || !building.mining_rate_multiplier) return 0;
        
        const baseProbeMiningRate = Config.PROBE_HARVEST_RATE || 100;
        const baseRate = baseProbeMiningRate * building.mining_rate_multiplier;
        
        // Get performance upgrade factor for structure mining
        const perfFactor = state.upgrade_factors?.structure?.mining?.performance || 1.0;
        
        return baseRate * perfFactor;
    }
    
    /**
     * Calculate effective structure build/replication rate
     * @param {Object} building - Building definition with build_rate_multiplier
     * @param {Object} state - Game state with upgrade_factors
     * @returns {number} Effective build rate in kg/day
     */
    calculateStructureBuildRate(building, state) {
        if (!building || !building.build_rate_multiplier) return 0;
        
        const baseProbeBuildRate = Config.PROBE_BUILD_RATE || 20;
        const baseRate = baseProbeBuildRate * building.build_rate_multiplier;
        
        // Get performance upgrade factor for structure building
        const perfFactor = state.upgrade_factors?.structure?.building?.performance || 1.0;
        
        return baseRate * perfFactor;
    }
    
    /**
     * Calculate effective structure energy cost
     * @param {Object} building - Building definition with energy_cost_multiplier
     * @param {Object} state - Game state with upgrade_factors
     * @returns {number} Effective energy cost in watts
     */
    calculateStructureEnergyCost(building, state) {
        if (!building || building.energy_cost_multiplier === undefined) {
            // Fallback to old effects.energy_consumption_per_second if available
            return building.effects?.energy_consumption_per_second || 0;
        }
        
        if (building.energy_cost_multiplier === 0) return 0;
        
        // Buildings use base structure energy cost, multiplied by their multiplier
        const baseEnergyCost = this.BASE_STRUCTURE_ENERGY_COST;
        const baseCost = baseEnergyCost * building.energy_cost_multiplier;
        
        // Get cost upgrade factor (energy costs decrease with research, so divide by cost factor)
        const costFactor = state.upgrade_factors?.structure?.building?.cost || 1.0;
        
        // Energy cost decreases with research (costFactor > 1 means we divide to reduce cost)
        return baseCost / costFactor;
    }
    
    /**
     * Calculate effective structure power output
     * @param {Object} building - Building definition with power_output_mw
     * @param {Object} state - Game state with upgrade_factors
     * @returns {number} Effective power output in watts
     */
    calculateStructurePowerOutput(building, state) {
        if (!building || !building.power_output_mw) return 0;
        
        const basePowerMW = building.power_output_mw;
        const basePowerW = basePowerMW * 1e6; // Convert MW to watts
        
        // Get performance upgrade factor for structure energy
        const perfFactor = state.upgrade_factors?.structure?.energy?.performance || 1.0;
        
        return basePowerW * perfFactor;
    }
    
    /**
     * Calculate effective structure compute output
     * @param {Object} building - Building definition with compute_eflops
     * @param {Object} state - Game state with upgrade_factors
     * @returns {number} Effective compute output in FLOPS
     */
    calculateStructureComputeOutput(building, state) {
        if (!building || !building.compute_eflops) return 0;
        
        const baseComputeEFLOPS = building.compute_eflops;
        const baseComputeFLOPS = baseComputeEFLOPS * 1e18; // Convert EFLOPS to FLOPS
        
        // Get performance upgrade factor for structure compute
        const perfFactor = state.upgrade_factors?.structure?.compute?.performance || 1.0;
        
        return baseComputeFLOPS * perfFactor;
    }
    
    /**
     * Process structure construction for all zones
     * Constructing probes work on structures in the construction queue
     * Metal and energy are only consumed when actively building structures
     * @param {Object} state - Game state
     * @param {number} deltaTime - Time delta in days
     * @param {Object} skills - Current skills
     * @param {Object} buildings - Building definitions
     * @param {number} energyThrottle - Energy throttle factor (0-1)
     * @returns {Object} Updated state
     */
    processStructureConstruction(state, deltaTime, skills, buildings, energyThrottle = 1.0) {
        const newState = JSON.parse(JSON.stringify(state));  // Deep clone
        
        // Initialize state if needed
        if (!newState.enabled_construction) {
            newState.enabled_construction = [];
        }
        if (!newState.structure_construction_progress) {
            newState.structure_construction_progress = {};
        }
        if (!newState.structure_construction_targets) {
            newState.structure_construction_targets = {};
        }
        if (!newState.structure_construction_start_times) {
            newState.structure_construction_start_times = {};
        }
        if (!newState.structures_by_zone) {
            newState.structures_by_zone = {};
        }
        if (!newState.zones) {
            newState.zones = {};
        }
        
        const enabledConstruction = newState.enabled_construction || [];
        const structureProgress = newState.structure_construction_progress || {};
        const structureTargets = newState.structure_construction_targets || {};
        const structureStartTimes = newState.structure_construction_start_times || {};
        const structuresByZone = newState.structures_by_zone || {};
        const currentTime = newState.time || 0;
        const probesByZone = newState.probes_by_zone || {};
        const probeAllocationsByZone = newState.probe_allocations_by_zone || {};
        const zones = newState.zones || {};
        
        // Group enabled buildings by zone
        const enabledBuildingsByZone = {};
        for (const enabledKey of enabledConstruction) {
            const [zoneId, buildingId] = enabledKey.split('::', 2);
            if (zoneId && buildingId) {
                if (!(zoneId in enabledBuildingsByZone)) {
                    enabledBuildingsByZone[zoneId] = [];
                }
                enabledBuildingsByZone[zoneId].push({ enabledKey, buildingId });
            }
        }
        
        // Process construction for each zone that has enabled buildings
        for (const zoneId in enabledBuildingsByZone) {
            // Ensure zone exists
            if (!zones[zoneId]) {
                zones[zoneId] = {
                    mass_remaining: 0,
                    stored_metal: 0,
                    probe_mass: 0,
                    structure_mass: 0,
                    slag_mass: 0,
                    methalox: 0,
                    depleted: false
                };
            }
            
            const zone = zones[zoneId];
            const storedMetal = zone.stored_metal || 0;
            
            // Get probes in this zone
            const zoneProbes = probesByZone[zoneId] || {};
            const totalProbes = Object.values(zoneProbes).reduce((sum, count) => sum + (count || 0), 0);
            
            if (totalProbes === 0) {
                continue; // No probes in this zone
            }
            
            // Get construct allocation for this zone
            const allocations = probeAllocationsByZone[zoneId] || {};
            // Handle both number (0-1) and object formats for construct allocation
            let constructAllocation = allocations.construct || 0;
            if (typeof constructAllocation === 'object' && constructAllocation !== null) {
                // If it's an object, try to get a numeric value (might be {probe: 0.25} format)
                constructAllocation = constructAllocation.probe || constructAllocation.value || 0;
            }
            // Ensure it's a number
            constructAllocation = typeof constructAllocation === 'number' ? constructAllocation : 0;
            
            if (constructAllocation === 0) {
                continue; // No probes allocated to construction
            }
            
            // Check mass limit for construction
            const zoneMassLimits = newState.zone_mass_limits?.[zoneId] || {};
            const constructLimit = zoneMassLimits.construct || 0;
            let massThrottle = 1.0;
            
            if (constructLimit > 0) {
                // Calculate total zone mass
                const massRemaining = zone.mass_remaining || 0;
                const storedMetalMass = zone.stored_metal || 0;
                const probeMass = zone.probe_mass || 0;
                const structureMass = zone.structure_mass || 0;
                const slagMass = zone.slag_mass || 0;
                const totalZoneMass = massRemaining + storedMetalMass + probeMass + structureMass + slagMass;
                
                if (totalZoneMass > 0) {
                    const currentStructureRatio = structureMass / totalZoneMass;
                    if (currentStructureRatio >= constructLimit) {
                        // At or above limit - stop construction
                        massThrottle = 0;
                    } else {
                        // Approaching limit - calculate how much room we have
                        const headroom = constructLimit - currentStructureRatio;
                        // If within 10% of limit, start throttling
                        const throttleThreshold = constructLimit * 0.1;
                        if (headroom < throttleThreshold && throttleThreshold > 0) {
                            massThrottle = headroom / throttleThreshold;
                        }
                    }
                }
            }
            
            if (massThrottle === 0) {
                continue; // At mass limit, skip construction for this zone
            }
            
            // Calculate building probes (probes allocated to structure building)
            // constructAllocation is now a direct fraction (0-1) of probes for structure building
            const structureBuildingProbes = totalProbes * constructAllocation;
            
            // Calculate build rate for this zone (kg/day)
            // Uses pre-calculated upgrade factors from state
            // Applies zone crowding penalty and probe count scaling penalty
            const totalBuildRate = this.productionCalculator.calculateBuildingRate(structureBuildingProbes, newState, zoneId, totalProbes);
            const effectiveBuildRate = totalBuildRate * energyThrottle * massThrottle; // Apply energy and mass throttle
            
            // Get enabled buildings for this zone
            const enabledBuildings = enabledBuildingsByZone[zoneId];
            const numEnabled = enabledBuildings.length;
            
            if (numEnabled === 0) {
                continue; // No enabled buildings in this zone
            }
            
            // Divide build rate equally among all enabled buildings
            const buildRatePerBuilding = effectiveBuildRate / numEnabled; // kg/day per building
            
            // Process each enabled building - NO RESOURCE CHECK, start consuming immediately
            for (const { enabledKey, buildingId } of enabledBuildings) {
                // buildings can be in different formats:
                // 1. {buildings: {buildingId: {...}}} - new format from buildings.json
                // 2. {buildingId: {...}} - direct object
                // 3. Array of buildings (legacy)
                let building = null;
                if (buildings) {
                    if (buildings.buildings && typeof buildings.buildings === 'object') {
                        // New format: buildings.buildings object
                        building = buildings.buildings[buildingId];
                    } else if (buildings[buildingId]) {
                        // Direct object format
                        building = buildings[buildingId];
                    } else if (Array.isArray(buildings)) {
                        // Legacy array format
                        building = buildings.find(b => b.id === buildingId);
                    }
                }
                
                if (!building) {
                    console.warn(`[StructureSystem] Building definition not found: ${buildingId}`, { buildingsKeys: buildings ? Object.keys(buildings) : 'null' });
                    continue; // Building definition not found
                }
                
                // Get or set target cost (fixed when construction starts)
                let costMetal = structureTargets[enabledKey];
                if (!costMetal || costMetal <= 0) {
                    // Calculate building cost (geometric scaling based on existing structures in this zone)
                    // Cost is based on current count: building #(count+1) costs baseCost * (count+1)
                    costMetal = this.calculateStructureCost(building, newState, zoneId, buildingId);
                    if (costMetal <= 0) {
                        console.warn(`[StructureSystem] Invalid building cost for ${buildingId}: ${costMetal}`);
                        continue; // Invalid cost
                    }
                    // Store the target cost so it doesn't change if another building completes
                    structureTargets[enabledKey] = costMetal;
                }
                
                // Record start time for minimum build time tracking (if not already set)
                if (!structureStartTimes[enabledKey]) {
                    structureStartTimes[enabledKey] = currentTime;
                }
                
                // Get current progress
                const currentProgress = structureProgress[enabledKey] || 0.0;
                const remainingToBuild = costMetal - currentProgress;
                
                // Check if metal requirement is met
                if (remainingToBuild <= 0) {
                    // Check max_per_zone limit before completing the building
                    if (building.max_per_zone) {
                        const zoneLimit = building.max_per_zone[zoneId];
                        if (zoneLimit !== undefined && zoneLimit > 0) {
                            if (!structuresByZone[zoneId]) {
                                structuresByZone[zoneId] = {};
                            }
                            const currentCount = structuresByZone[zoneId][buildingId] || 0;
                            
                            if (currentCount >= zoneLimit) {
                                // At zone limit - disable construction and don't complete the building
                                // Remove from enabled construction
                                const enabledIndex = enabledConstruction.indexOf(enabledKey);
                                if (enabledIndex !== -1) {
                                    enabledConstruction.splice(enabledIndex, 1);
                                    newState.enabled_construction = enabledConstruction;
                                }
                                // Clear progress and targets
                                delete structureProgress[enabledKey];
                                delete structureTargets[enabledKey];
                                delete structureStartTimes[enabledKey];
                                continue; // Skip this building
                            }
                        }
                    }
                    
                    // Metal requirement met - building is complete
                    if (!structuresByZone[zoneId]) {
                        structuresByZone[zoneId] = {};
                    }
                    if (!structuresByZone[zoneId][buildingId]) {
                        structuresByZone[zoneId][buildingId] = 0;
                    }
                    structuresByZone[zoneId][buildingId] += 1;
                    
                    // Update zone structure_mass
                    zone.structure_mass = (zone.structure_mass || 0) + costMetal;
                    
                    // Check if we just hit the zone limit after completing this building
                    let atZoneLimit = false;
                    if (building.max_per_zone) {
                        const zoneLimit = building.max_per_zone[zoneId];
                        const newCount = structuresByZone[zoneId][buildingId];
                        if (zoneLimit !== undefined && zoneLimit > 0 && newCount >= zoneLimit) {
                            atZoneLimit = true;
                        }
                    }
                    
                    // If still enabled and not at limit, start next one immediately (reset progress to 0 and clear target)
                    if (enabledConstruction.includes(enabledKey) && !atZoneLimit) {
                        structureProgress[enabledKey] = 0.0;
                        delete structureTargets[enabledKey]; // Clear target so next building gets new cost
                        delete structureStartTimes[enabledKey]; // Clear start time for next building
                        // Continue to process the next building in the same tick
                        // The next iteration will set a new target and start time
                        continue;
                    } else {
                        // Not enabled anymore or at zone limit, remove from progress and target
                        if (atZoneLimit) {
                            // Remove from enabled construction since we hit the limit
                            const enabledIndex = enabledConstruction.indexOf(enabledKey);
                            if (enabledIndex !== -1) {
                                enabledConstruction.splice(enabledIndex, 1);
                                newState.enabled_construction = enabledConstruction;
                            }
                        }
                        delete structureProgress[enabledKey];
                        delete structureTargets[enabledKey];
                        delete structureStartTimes[enabledKey];
                    }
                    continue; // Skip progress calculation for this tick
                }
                
                // Calculate progress this tick - NO RESOURCE CHECK, start immediately
                const progressThisTick = buildRatePerBuilding * deltaTime; // kg
                const actualProgress = Math.min(progressThisTick, remainingToBuild);
                
                // Metal consumption throttled by available metal, but construction always progresses
                // (even if 0 when no metal available)
                const metalNeeded = actualProgress;
                let metalConsumed = 0;
                let progressMade = 0;
                
                if (storedMetal <= 0) {
                    // No metal available - construction progresses at 0 rate but remains enabled
                    metalConsumed = 0;
                    progressMade = 0;
                } else if (storedMetal < metalNeeded) {
                    // Not enough metal - throttle progress based on available metal
                    const metalThrottle = storedMetal / metalNeeded;
                    progressMade = actualProgress * metalThrottle;
                    metalConsumed = progressMade; // 1:1 ratio
                } else {
                    // Enough metal - full progress
                    progressMade = actualProgress;
                    metalConsumed = metalNeeded;
                }
                
                // Consume metal (always consume what we can, even if 0)
                zone.stored_metal = Math.max(0, storedMetal - metalConsumed);
                
                // Update progress (always update, even if 0)
                structureProgress[enabledKey] = (structureProgress[enabledKey] || 0) + progressMade;
            }
        }
        
        // Clean up invalid structures from progress (buildings that are disabled and have no progress)
        for (const enabledKey in structureProgress) {
            if (!enabledConstruction.includes(enabledKey)) {
                const progress = structureProgress[enabledKey];
                if (progress <= 0) {
                    // Not enabled and no progress, remove it
                    delete structureProgress[enabledKey];
                    delete structureTargets[enabledKey];
                    delete structureStartTimes[enabledKey];
                }
            }
        }
        
        // Update state
        newState.structure_construction_progress = structureProgress;
        newState.structure_construction_targets = structureTargets;
        newState.structure_construction_start_times = structureStartTimes;
        newState.structures_by_zone = structuresByZone;
        newState.zones = zones;
        
        return newState;
    }
    
    /**
     * Add structure to zone (called when user purchases structure)
     * @param {Object} state - Game state
     * @param {string} zoneId - Zone identifier
     * @param {string} structureId - Structure ID
     * @param {number} count - Number to add
     * @param {Object} building - Building definition (for mass calculation)
     * @returns {Object} Updated state
     */
    addStructure(state, zoneId, structureId, count = 1, building = null) {
        const newState = JSON.parse(JSON.stringify(state));  // Deep clone
        
        const structuresByZone = newState.structures_by_zone || {};
        if (!structuresByZone[zoneId]) {
            structuresByZone[zoneId] = {};
        }
        
        if (!structuresByZone[zoneId][structureId]) {
            structuresByZone[zoneId][structureId] = 0;
        }
        
        // Calculate cost BEFORE incrementing count (cost is based on current count)
        // For multiple structures, sum the costs: cost(count) + cost(count+1) + ... + cost(count+n-1)
        let totalCost = 0;
        if (building) {
            const currentCount = structuresByZone[zoneId][structureId] || 0;
            for (let i = 0; i < count; i++) {
                // Temporarily set count to calculate cost at (currentCount + i)
                const tempCount = currentCount + i;
                // Create temporary state with this count for cost calculation
                const tempStructuresByZone = JSON.parse(JSON.stringify(structuresByZone));
                tempStructuresByZone[zoneId] = { ...tempStructuresByZone[zoneId], [structureId]: tempCount };
                const tempState = { ...newState, structures_by_zone: tempStructuresByZone };
                const costAtThisCount = this.calculateStructureCost(building, tempState, zoneId, structureId);
                totalCost += costAtThisCount;
            }
        }
        
        // Now increment the count
        structuresByZone[zoneId][structureId] += count;
        
        // Update zone structure_mass
        // Note: Zone should already be initialized by engine.ensureZoneInitialized() before calling this
        if (building && totalCost > 0) {
            const zones = newState.zones || {};
            if (!zones[zoneId]) {
                // Zone should have been initialized, but if not, create minimal structure
                // mass_remaining will be set by engine.ensureZoneInitialized() if called
                zones[zoneId] = {
                    mass_remaining: 0, // Will be set by engine if zone exists in orbital mechanics
                    stored_metal: 0,
                    probe_mass: 0,
                    structure_mass: 0,
                    slag_mass: 0,
                    methalox: 0,
                    depleted: false
                };
            }
            zones[zoneId].structure_mass = (zones[zoneId].structure_mass || 0) + totalCost;
            newState.zones = zones;
        }
        
        newState.structures_by_zone = structuresByZone;
        return newState;
    }
    
    /**
     * Remove structure from zone
     * @param {Object} state - Game state
     * @param {string} zoneId - Zone identifier
     * @param {string} structureId - Structure ID
     * @param {number} count - Number to remove
     * @param {Object} building - Building definition (for mass calculation)
     * @returns {Object} Updated state
     */
    removeStructure(state, zoneId, structureId, count = 1, building = null) {
        const newState = JSON.parse(JSON.stringify(state));  // Deep clone
        
        const structuresByZone = newState.structures_by_zone || {};
        if (!structuresByZone[zoneId] || !structuresByZone[zoneId][structureId]) {
            return newState;  // Structure doesn't exist
        }
        
        const actualRemoved = Math.min(count, structuresByZone[zoneId][structureId]);
        structuresByZone[zoneId][structureId] = Math.max(0, structuresByZone[zoneId][structureId] - count);
        
        // Update zone structure_mass
        if (building && actualRemoved > 0) {
            const zones = newState.zones || {};
            if (zones[zoneId]) {
                // Calculate effective structure cost using new multiplier system
                // Calculate cost at the current count (before removal) for structure_mass tracking
            const structureCost = this.calculateStructureCost(building, newState, zoneId, structureId);
            zones[zoneId].structure_mass = Math.max(0, (zones[zoneId].structure_mass || 0) - (structureCost * actualRemoved));
            }
            newState.zones = zones;
        }
        
        newState.structures_by_zone = structuresByZone;
        return newState;
    }
    
    /**
     * Process methalox production from refineries
     * @param {Object} state - Game state
     * @param {number} deltaTime - Time delta in days
     * @param {Object} skills - Current skills
     * @param {Object} buildings - Building definitions
     * @returns {Object} Updated state
     */
    processMethaloxProduction(state, deltaTime, skills, buildings) {
        const newState = JSON.parse(JSON.stringify(state)); // Deep clone
        const structuresByZone = newState.structures_by_zone || {};
        const zones = newState.zones || {};
        
        for (const zoneId in structuresByZone) {
            const zoneStructures = structuresByZone[zoneId] || {};
            const refineryCount = zoneStructures['methalox_refinery'] || 0;
            
            if (refineryCount === 0) continue;
            
            // Ensure zone exists
            if (!zones[zoneId]) {
                zones[zoneId] = {
                    mass_remaining: 0,
                    stored_metal: 0,
                    probe_mass: 0,
                    structure_mass: 0,
                    slag_mass: 0,
                    methalox: 0,
                    depleted: false
                };
            }
            
            // Calculate production rate for this zone
            const productionRate = this.productionCalculator.calculateMethaloxProduction(
                structuresByZone,
                zoneId,
                buildings,
                newState
            );
            
            // Calculate amount produced this tick
            const methaloxProduced = productionRate * deltaTime;
            
            // Add to zone's methalox storage
            zones[zoneId].methalox = (zones[zoneId].methalox || 0) + methaloxProduced;
        }
        
        newState.zones = zones;
        return newState;
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StructureSystem;
}

