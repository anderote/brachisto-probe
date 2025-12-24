/**
 * Transfer System
 * 
 * Orbital transfers between zones
 * Supports one-time and continuous transfers
 */

class TransferSystem {
    constructor(orbitalMechanics) {
        this.orbitalMechanics = orbitalMechanics;
        // Track accumulated probes for continuous transfers (per transfer)
        this.continuousAccumulators = new Map();
        // Track last rate update time (for 5-second updates)
        this.lastRateUpdateTime = 0;
        // Track mass driver usage: {zoneId: {driver_index: {transfer_id, last_one_time_time, type}}}
        this.massDriverUsage = new Map();
    }
    
    /**
     * Process active transfers
     * @param {Object} state - Game state
     * @param {number} deltaTime - Time delta in days
     * @returns {Object} Updated state
     */
    processTransfers(state, deltaTime) {
        const newState = JSON.parse(JSON.stringify(state));  // Deep clone
        
        const activeTransfers = newState.active_transfers || [];
        const currentTime = newState.time || 0;
        
        const completedTransfers = [];
        
        for (let i = 0; i < activeTransfers.length; i++) {
            const transfer = activeTransfers[i];
            
            // Debug: Log transfer progress for Dyson zone transfers
            if (transfer.to_zone === 'dyson_sphere' && transfer.type !== 'continuous') {
                console.log(`[Transfer] Dyson transfer check: arrival=${transfer.arrival_time?.toFixed(2)}, current=${currentTime.toFixed(2)}, status=${transfer.status}`);
            }
            
            if (transfer.type === 'continuous') {
                // Process continuous transfer
                if (!transfer.paused) {
                    this.processContinuousTransfer(newState, transfer, deltaTime, currentTime);
                }
                // Process arrivals for continuous transfers
                this.processContinuousArrivals(newState, transfer, currentTime);
            } else {
                // Process one-time transfer
                if (transfer.status === 'paused') {
                    continue;  // Skip paused transfers
                }
                
                // Check if transfer completed
                // Both arrival_time and currentTime are in days
                if (transfer.arrival_time <= currentTime && transfer.status === 'traveling') {
                    // Transfer completed - add probes to destination
                    this.completeOneTimeTransfer(newState, transfer);
                    completedTransfers.push(i);
                }
            }
        }
        
        // Remove completed one-time transfers (in reverse order to maintain indices)
        for (let i = completedTransfers.length - 1; i >= 0; i--) {
            activeTransfers.splice(completedTransfers[i], 1);
        }
        
        newState.active_transfers = activeTransfers;
        return newState;
    }
    
    /**
     * Process continuous transfer - send probes or metal based on production rate
     * @param {Object} state - Game state (mutated)
     * @param {Object} transfer - Transfer object
     * @param {number} deltaTime - Time delta in days
     * @param {number} currentTime - Current game time
     */
    processContinuousTransfer(state, transfer, deltaTime, currentTime) {
        const fromZoneId = transfer.from_zone;
        const transferResourceType = transfer.resource_type || 'probe'; // 'probe' or 'metal'
        
        // Get current propulsion skill for transfer time calculation
        const skills = state.skills || {};
        const propulsionSkill = skills.propulsion || 1.0;
        
        // Recalculate transfer time with current propulsion skill (for continuous transfers)
        // This allows transfers to benefit from propulsion skill improvements during transit
        let baseTransferTime = this.orbitalMechanics.calculateTransferTime(
            transfer.from_zone,
            transfer.to_zone,
            propulsionSkill
        );
        
        // Apply mass driver speed multiplier for probe and metal transfers leaving this zone
        const structuresByZone = state.structures_by_zone || {};
        const zoneStructures = structuresByZone[fromZoneId] || {};
        const massDriverCount = zoneStructures['mass_driver'] || 0;
        
        if (massDriverCount > 0) {
            const speedMultiplier = this.calculateMassDriverSpeedMultiplier(massDriverCount);
            baseTransferTime = baseTransferTime * speedMultiplier;
        }
        
        transfer.transfer_time = baseTransferTime;
        
        let sendRate = 0;
        let available = 0;
        
        if (transferResourceType === 'probe') {
            // Probe transfer
            const probeType = transfer.probe_type || 'probe';
            const ratePercentage = transfer.rate_percentage || 0;
            
            if (ratePercentage <= 0) return;
            
            // Get source zone production rate (probes/day)
            const zoneProductionRate = this.getZoneProbeProductionRate(state, fromZoneId);
            if (zoneProductionRate <= 0) return;
            
            // Calculate send rate (probes/day)
            sendRate = zoneProductionRate * ratePercentage / 100.0;
            
            // Check if we have enough probes to send a batch
            const probesByZone = state.probes_by_zone || {};
            const zoneProbes = probesByZone[fromZoneId] || {};
            available = zoneProbes[probeType] || 0;
            
            // Get accumulator for this transfer
            const transferId = transfer.id;
            let accumulated = this.continuousAccumulators.get(transferId) || 0;
            
            // Accumulate fractional probes
            accumulated += sendRate * deltaTime;
            
            // Track total probes sent this tick for probe_mass update
            let totalProbesSent = 0;
            
            // Minimum batch size: 1 probe (accumulate until we have at least 1 probe)
            const MIN_PROBE_BATCH = 1.0;
            
            // Send batches while we have accumulated >= 1 probe and available probes
            while (accumulated >= MIN_PROBE_BATCH && available >= MIN_PROBE_BATCH) {
                const batchCount = Math.floor(Math.min(accumulated, available));
                // Ensure batch is at least 1 probe (should be guaranteed by while condition)
                if (batchCount >= MIN_PROBE_BATCH) {
                    // Remove probes from source zone immediately
                    zoneProbes[probeType] = Math.max(0, zoneProbes[probeType] - batchCount);
                    available = zoneProbes[probeType];
                    totalProbesSent += batchCount;
                    
                    // Initialize in_transit array if needed
                    if (!transfer.in_transit) {
                        transfer.in_transit = [];
                    }
                    
                    // Calculate arrival time using current transfer time
                    const arrivalTime = currentTime + baseTransferTime;
                    
                    // Add batch to in-transit queue
                    transfer.in_transit.push({
                        count: batchCount,
                        departure_time: currentTime,
                        arrival_time: arrivalTime,
                        resource_type: 'probe'
                    });
                    
                    // Update transfer arrival_time to next batch arrival (for visualization)
                    transfer.arrival_time = arrivalTime;
                    
                    accumulated -= batchCount;
                } else {
                    break;
                }
            }
            
            // Store accumulator
            this.continuousAccumulators.set(transferId, accumulated);
            
            // Update zone probe_mass (subtract mass of probes sent)
            if (totalProbesSent > 0) {
                const PROBE_MASS = 100; // kg per probe
                const zones = state.zones || {};
                if (!zones[fromZoneId]) {
                    zones[fromZoneId] = { stored_metal: 0, probe_mass: 0, structure_mass: 0, slag_mass: 0, mass_remaining: 0, depleted: false };
                }
                zones[fromZoneId].probe_mass = Math.max(0, (zones[fromZoneId].probe_mass || 0) - (totalProbesSent * PROBE_MASS));
                state.zones = zones;
            }
            
            state.probes_by_zone = probesByZone;
        } else if (transferResourceType === 'metal') {
            // Metal transfer - use metal_rate_kg_per_day (set directly, not percentage)
            const metalRateKgPerDay = transfer.metal_rate_kg_per_day || 0;
            
            if (metalRateKgPerDay <= 0) return;
            
            // Get available metal in source zone
            const zones = state.zones || {};
            const sourceZone = zones[fromZoneId] || {};
            available = sourceZone.stored_metal || 0;
            
            // Send rate is the metal rate (kg/day)
            sendRate = metalRateKgPerDay;
            
            // Get accumulator for this transfer
            const transferId = transfer.id;
            let accumulated = this.continuousAccumulators.get(transferId) || 0;
            
            // Accumulate fractional metal (in kg)
            accumulated += sendRate * deltaTime;
            
            // Minimum batch size: 100kg (accumulate until we have at least 100kg)
            const MIN_METAL_BATCH_KG = 100.0;
            
            // Send batches while we have accumulated >= 100kg and available metal
            while (accumulated >= MIN_METAL_BATCH_KG && available >= MIN_METAL_BATCH_KG) {
                // Send at least 100kg, or all accumulated if less than available
                const batchMass = Math.floor(Math.min(accumulated, available));
                // Ensure batch is at least 100kg (should be guaranteed by while condition)
                if (batchMass >= MIN_METAL_BATCH_KG) {
                    // Remove metal from source zone's stored_metal immediately
                    if (!zones[fromZoneId]) {
                        zones[fromZoneId] = { stored_metal: 0, probe_mass: 0, structure_mass: 0, slag_mass: 0, mass_remaining: 0, depleted: false };
                    }
                    zones[fromZoneId].stored_metal = Math.max(0, (zones[fromZoneId].stored_metal || 0) - batchMass);
                    available = zones[fromZoneId].stored_metal;
                    
                    // Initialize in_transit array if needed
                    if (!transfer.in_transit) {
                        transfer.in_transit = [];
                    }
                    
                    // Calculate arrival time using current transfer time
                    const arrivalTime = currentTime + baseTransferTime;
                    
                    // Add batch to in-transit queue
                    transfer.in_transit.push({
                        mass_kg: batchMass,
                        departure_time: currentTime,
                        arrival_time: arrivalTime,
                        resource_type: 'metal'
                    });
                    
                    // Update transfer arrival_time to next batch arrival (for visualization)
                    transfer.arrival_time = arrivalTime;
                    
                    accumulated -= batchMass;
                } else {
                    break;
                }
            }
            
            // Store accumulator
            this.continuousAccumulators.set(transferId, accumulated);
            state.zones = zones;
        }
        
        // Update last send time
        transfer.last_send_time = currentTime;
    }
    
    /**
     * Process arrivals for continuous transfers
     * @param {Object} state - Game state (mutated)
     * @param {Object} transfer - Transfer object
     * @param {number} currentTime - Current game time
     */
    processContinuousArrivals(state, transfer, currentTime) {
        if (!transfer.in_transit || transfer.in_transit.length === 0) return;
        
        const transferResourceType = transfer.resource_type || 'probe';
        const toZoneId = transfer.to_zone;
        
        // Process batches that have arrived
        const arrivedBatches = [];
        for (let i = transfer.in_transit.length - 1; i >= 0; i--) {
            const batch = transfer.in_transit[i];
            if (batch.arrival_time <= currentTime) {
                arrivedBatches.push(batch);
                transfer.in_transit.splice(i, 1);
            }
        }
        
        if (arrivedBatches.length === 0) return;
        
        console.log(`[Transfer] Processing ${arrivedBatches.length} arrived batches to ${toZoneId}:`, {
            resourceType: transferResourceType,
            arrivedBatches: arrivedBatches.map(b => ({ count: b.count, mass_kg: b.mass_kg })),
            transferId: transfer.id
        });
        
        if (transferResourceType === 'probe') {
            // Add arrived probes to destination zone
            const probesByZone = state.probes_by_zone || {};
            const probeType = transfer.probe_type || 'probe';
            
            if (!probesByZone[toZoneId]) {
                probesByZone[toZoneId] = {};
            }
            if (!probesByZone[toZoneId][probeType]) {
                probesByZone[toZoneId][probeType] = 0;
            }
            
            const totalArrived = arrivedBatches.reduce((sum, batch) => sum + (batch.count || 0), 0);
            if (totalArrived > 0) {
                probesByZone[toZoneId][probeType] += totalArrived;
            }
            
            // Update zone probe_mass
            const PROBE_MASS = 100; // kg per probe
            const zones = state.zones || {};
            if (!zones[toZoneId]) {
                zones[toZoneId] = {
                    stored_metal: 0,
                    probe_mass: 0,
                    structure_mass: 0,
                    slag_mass: 0,
                    mass_remaining: 0,
                    depleted: false
                };
            }
            zones[toZoneId].probe_mass = (zones[toZoneId].probe_mass || 0) + (totalArrived * PROBE_MASS);
            state.zones = zones;
            state.probes_by_zone = probesByZone;
            
            console.log(`[Transfer] Continuous: Added ${totalArrived} probes to ${toZoneId}. New count: ${probesByZone[toZoneId][probeType]}`);
        } else if (transferResourceType === 'metal') {
            // Add arrived metal to destination zone's stored_metal
            const totalArrived = arrivedBatches.reduce((sum, batch) => sum + (batch.mass_kg || 0), 0);
            const zones = state.zones || {};
            if (!zones[toZoneId]) {
                zones[toZoneId] = { stored_metal: 0, probe_mass: 0, structure_mass: 0, slag_mass: 0, mass_remaining: 0, depleted: false };
            }
            zones[toZoneId].stored_metal = (zones[toZoneId].stored_metal || 0) + totalArrived;
            state.zones = zones;
            
            console.log(`[Transfer] Continuous: Added ${totalArrived} kg metal to ${toZoneId}. New stored_metal: ${zones[toZoneId].stored_metal}`);
        }
    }
    
    /**
     * Get zone probe production rate (probes/day)
     * @param {Object} state - Game state
     * @param {string} zoneId - Zone identifier
     * @returns {number} Production rate in probes/day
     */
    getZoneProbeProductionRate(state, zoneId) {
        // Check if we have per-zone rates in derived values (calculated in engine)
        const derived = state.derived || {};
        const zones = derived.zones || {};
        const zoneData = zones[zoneId] || {};
        
        // If we have probe production rate cached, use it
        if (zoneData.probe_production_rate !== undefined) {
            return zoneData.probe_production_rate;
        }
        
        // Fallback: calculate from replicate allocation
        // This should rarely be needed if derived values are calculated properly
        const allocations = state.probe_allocations_by_zone?.[zoneId] || {};
        const replicateAllocation = allocations.replicate || 0;
        const zoneProbes = state.probes_by_zone?.[zoneId] || {};
        const totalProbes = Object.values(zoneProbes).reduce((sum, count) => sum + (count || 0), 0);
        
        if (totalProbes <= 0 || replicateAllocation <= 0) {
            return 0;
        }
        
        const replicatingProbes = totalProbes * replicateAllocation;
        const PROBE_BUILD_RATE = 100.0; // kg/day per probe
        const PROBE_MASS = 100; // kg per probe
        const buildingRateKgPerDay = replicatingProbes * PROBE_BUILD_RATE;
        
        // Apply upgrade factors if available
        const upgradeFactors = state.tech_upgrade_factors || {};
        const probeReplicateFactor = upgradeFactors.probe_replicate || 1.0;
        const effectiveRateKgPerDay = buildingRateKgPerDay * probeReplicateFactor;
        
        // Convert to probes/day
        return effectiveRateKgPerDay / PROBE_MASS;
    }
    
    /**
     * Complete a one-time transfer (add probes or metal to destination)
     * Note: Resources should already be removed from source at departure
     * @param {Object} state - Game state (mutated)
     * @param {Object} transfer - Transfer object
     */
    completeOneTimeTransfer(state, transfer) {
        const resourceType = transfer.resource_type || 'probe';
        const toZoneId = transfer.to_zone;
        
        console.log(`[Transfer] Completing one-time transfer to ${toZoneId}:`, {
            resourceType,
            probeCount: transfer.probe_count,
            metalKg: transfer.metal_kg,
            transferId: transfer.id
        });
        
        if (resourceType === 'probe') {
            const probeType = transfer.probe_type || 'probe';
            const probeCount = transfer.probe_count || 0;
            
            if (probeCount <= 0) {
                console.warn(`[Transfer] Warning: Attempting to complete transfer with 0 probes`);
                return;
            }
            
            // Ensure probes_by_zone exists
            if (!state.probes_by_zone) {
                state.probes_by_zone = {};
            }
            const probesByZone = state.probes_by_zone;
            
            // Ensure destination zone exists
            if (!probesByZone[toZoneId]) {
                probesByZone[toZoneId] = {};
            }
            if (!probesByZone[toZoneId][probeType]) {
                probesByZone[toZoneId][probeType] = 0;
            }
            
            // Add probes to destination zone
            probesByZone[toZoneId][probeType] += probeCount;
            
            // Update zone probe_mass
            const PROBE_MASS = 100; // kg per probe
            if (!state.zones) {
                state.zones = {};
            }
            const zones = state.zones;
            if (!zones[toZoneId]) {
                zones[toZoneId] = {
                    stored_metal: 0,
                    probe_mass: 0,
                    structure_mass: 0,
                    slag_mass: 0,
                    mass_remaining: 0,
                    depleted: false
                };
            }
            zones[toZoneId].probe_mass = (zones[toZoneId].probe_mass || 0) + (probeCount * PROBE_MASS);
            
            // Explicitly reassign to ensure state is updated
            state.probes_by_zone = probesByZone;
            state.zones = zones;
            
            console.log(`[Transfer] Added ${probeCount} probes to ${toZoneId}. New count: ${probesByZone[toZoneId][probeType]}`);
        } else if (resourceType === 'metal') {
            // Add metal to destination zone's stored_metal
            const metalKg = transfer.metal_kg || 0;
            const zones = state.zones || {};
            if (!zones[toZoneId]) {
                zones[toZoneId] = {
                    stored_metal: 0,
                    probe_mass: 0,
                    structure_mass: 0,
                    slag_mass: 0,
                    mass_remaining: 0,
                    depleted: false
                };
            }
            zones[toZoneId].stored_metal = (zones[toZoneId].stored_metal || 0) + metalKg;
            state.zones = zones;
            
            console.log(`[Transfer] Added ${metalKg} kg metal to ${toZoneId}. New stored_metal: ${zones[toZoneId].stored_metal}`);
        }
        
        // Mark transfer as completed
        transfer.status = 'completed';
    }
    
    /**
     * Calculate transfer speed multiplier based on mass driver presence
     * Having any mass drivers reduces travel time by 90% for outgoing transfers
     * @param {number} massDriverCount - Number of mass drivers in zone
     * @returns {number} Speed multiplier (multiplies transfer time, so lower = faster)
     */
    calculateMassDriverSpeedMultiplier(massDriverCount) {
        if (massDriverCount === 0) {
            return 1.0; // No speed boost without mass drivers
        }
        
        // Exponential decay: approaches 0.1 (10% of original time) as count increases
        // k = 0.3 gives good decay curve (1 driver = ~0.77, 5 drivers = ~0.22, 10 drivers = ~0.13)
        const k = 0.3;
        const minMultiplier = 0.05; // 10% of original time
        const maxMultiplier = 1.0; // 100% of original time (no boost)
        
        const multiplier = minMultiplier + (maxMultiplier - minMultiplier) * Math.exp(-k * massDriverCount);
        return multiplier;
    }
    
    /**
     * Calculate metal transfer capacity based on mass driver count and upgrades
     * @param {Object} state - Game state
     * @param {string} zoneId - Zone identifier
     * @returns {number} Metal transfer capacity in kg/day
     */
    calculateMetalTransferCapacity(state, zoneId) {
        const structuresByZone = state.structures_by_zone || {};
        const zoneStructures = structuresByZone[zoneId] || {};
        const massDriverCount = zoneStructures['mass_driver'] || 0;
        
        if (massDriverCount === 0) {
            return 0; // No metal transfer without mass drivers
        }
        
        // Base capacity: 100 gigatons per day = 100e12 kg/day per driver
        const BASE_CAPACITY_PER_DRIVER = 100e12; // 100 GT/day per driver
        
        // Capacity increases linearly with number of drivers
        let totalCapacity = BASE_CAPACITY_PER_DRIVER * massDriverCount;
        
        // Apply upgrade factors (transport research improves capacity)
        const upgradeFactors = state.upgrade_factors || {};
        const transportUpgrade = upgradeFactors.structure?.building?.performance || 1.0;
        
        // Also check for transport-specific skills
        const skills = state.skills || {};
        const transportSkill = skills.energy_transport || 1.0;
        const strengthSkill = skills.strength || 1.0;
        const locomotionSkill = skills.locomotion || 1.0;
        
        // Capacity improves with transport, strength, and locomotion skills
        const skillMultiplier = transportSkill * Math.sqrt(strengthSkill) * Math.sqrt(locomotionSkill);
        
        totalCapacity = totalCapacity * transportUpgrade * skillMultiplier;
        
        return totalCapacity;
    }
    
    /**
     * Check if zone has mass drivers (required for metal transfers)
     * @param {Object} state - Game state
     * @param {string} zoneId - Zone identifier
     * @returns {boolean} True if zone has at least one mass driver
     */
    hasMassDriver(state, zoneId) {
        const structuresByZone = state.structures_by_zone || {};
        const zoneStructures = structuresByZone[zoneId] || {};
        return (zoneStructures['mass_driver'] || 0) > 0;
    }
    
    /**
     * Calculate mass driver cost with research upgrades
     * @param {Object} state - Game state
     * @param {Object} buildings - Building definitions
     * @returns {Object} {construction_cost_kg: number, operational_power_watts: number}
     */
    calculateMassDriverCosts(state, buildings) {
        // Base costs
        const BASE_CONSTRUCTION_COST = 20e6; // 20 million kg
        const BASE_OPERATIONAL_POWER = 10e9; // 10 GW = 10e9 watts
        
        // Get transport research upgrades
        const upgradeFactors = state.tech_upgrade_factors || {};
        // Transport upgrades affect both cost and energy
        // Use energy_transport skill as a proxy for transport research
        const skills = state.skills || {};
        const transportSkill = skills.energy_transport || 1.0;
        
        // Higher transport skill reduces costs
        const constructionCost = BASE_CONSTRUCTION_COST / transportSkill;
        const operationalPower = BASE_OPERATIONAL_POWER / transportSkill;
        
        return {
            construction_cost_kg: constructionCost,
            operational_power_watts: operationalPower
        };
    }
    
    /**
     * Create a new transfer
     * @param {Object} state - Game state
     * @param {string} fromZoneId - Source zone
     * @param {string} toZoneId - Destination zone
     * @param {string} resourceType - Resource type: 'probe' or 'metal'
     * @param {string} probeType - Probe type (if resourceType is 'probe')
     * @param {number} resourceCount - Number of probes or kg of metal (for one-time)
     * @param {Object} skills - Current skills (must include propulsion)
     * @param {string} type - Transfer type: 'one-time' or 'continuous'
     * @param {number} ratePercentage - Percentage of production rate (for continuous probes) or kg/day (for metal)
     * @returns {Object} {success: boolean, transfer: Object, error: string}
     */
    createTransfer(state, fromZoneId, toZoneId, resourceType = 'probe', probeType = 'probe', resourceCount = 0, skills, type = 'one-time', ratePercentage = 0) {
        const currentTime = state.time || 0;
        
        // Debug: verify zones exist
        const fromZone = this.orbitalMechanics.getZone(fromZoneId);
        const toZone = this.orbitalMechanics.getZone(toZoneId);
        console.log(`[Transfer] Creating transfer: ${fromZoneId} -> ${toZoneId}`, {
            fromZoneFound: !!fromZone,
            toZoneFound: !!toZone,
            fromRadiusKm: fromZone?.radius_km,
            toRadiusKm: toZone?.radius_km
        });
        
        if (!fromZone || !toZone) {
            console.error(`[Transfer] Zone not found - from: ${fromZoneId} (${!!fromZone}), to: ${toZoneId} (${!!toZone})`);
            return { success: false, transfer: null, error: `Zone not found: ${!fromZone ? fromZoneId : toZoneId}` };
        }
        
        // Metal transfers require mass drivers
        if (resourceType === 'metal') {
            if (!this.hasMassDriver(state, fromZoneId)) {
                return { success: false, transfer: null, error: 'Mass driver required for metal transfers' };
            }
        }
        
        // Get current propulsion skill (use current state skills if not provided)
        const propulsionSkill = (skills && skills.propulsion) ? skills.propulsion : (state.skills?.propulsion || 1.0);
        
        // Calculate delta-v and base transfer time using current propulsion skill
        const deltaV = this.orbitalMechanics.calculateDeltaV(fromZoneId, toZoneId, propulsionSkill);
        let transferTime = this.orbitalMechanics.calculateTransferTime(fromZoneId, toZoneId, propulsionSkill);
        
        // Validate transfer time
        if (!transferTime || !isFinite(transferTime) || transferTime <= 0) {
            console.error(`[Transfer] Invalid transfer time calculated: ${transferTime} for ${fromZoneId} -> ${toZoneId}`);
            return { success: false, transfer: null, error: `Invalid transfer time: ${transferTime} days` };
        }
        
        // Apply mass driver speed multiplier for probe and metal transfers leaving this zone
        const structuresByZone = state.structures_by_zone || {};
        const zoneStructures = structuresByZone[fromZoneId] || {};
        const massDriverCount = zoneStructures['mass_driver'] || 0;
        
        if (massDriverCount > 0) {
            const speedMultiplier = this.calculateMassDriverSpeedMultiplier(massDriverCount);
            transferTime = transferTime * speedMultiplier;
            
            // Validate after multiplier
            if (!transferTime || !isFinite(transferTime) || transferTime <= 0) {
                console.error(`[Transfer] Invalid transfer time after multiplier: ${transferTime} for ${fromZoneId} -> ${toZoneId}`);
                return { success: false, transfer: null, error: `Invalid transfer time after multiplier: ${transferTime} days` };
            }
        }
        
        
        const transfer = {
            id: this.generateTransferId(),
            from_zone: fromZoneId,
            to_zone: toZoneId,
            resource_type: resourceType, // 'probe' or 'metal'
            type: type,
            delta_v_cost: deltaV,
            transfer_time: transferTime, // Will be recalculated for continuous transfers as skill improves
            status: 'traveling',
            paused: false
        };
        
        if (resourceType === 'probe') {
            transfer.probe_type = probeType;
        }
        
        if (type === 'one-time') {
            // One-time transfer
            if (resourceType === 'probe') {
                transfer.probe_count = resourceCount;
            } else if (resourceType === 'metal') {
                transfer.metal_kg = resourceCount;
            }
            transfer.departure_time = currentTime; // in days
            transfer.arrival_time = currentTime + transferTime; // in days
            
            // Ensure transferTime is valid (not 0 or negative)
            if (transferTime <= 0 || !isFinite(transferTime)) {
                console.error(`[Transfer] Invalid transfer time: ${transferTime} days for ${fromZoneId} -> ${toZoneId}`);
                return { success: false, transfer: null, error: `Invalid transfer time: ${transferTime} days` };
            }
        } else {
            // Continuous transfer
            if (resourceType === 'metal') {
                // For metal, ratePercentage is kg/day
                transfer.metal_rate_kg_per_day = ratePercentage;
            } else {
                // For probes, ratePercentage is percentage of production rate
                transfer.rate_percentage = ratePercentage;
            }
            transfer.in_transit = [];
            transfer.last_send_time = currentTime;
            // Set initial arrival time for visualization (first batch will arrive at this time)
            // This will be updated as batches are sent
            transfer.departure_time = currentTime;
            transfer.arrival_time = currentTime + transferTime; // First batch arrival time (will be updated as batches are sent)
            // Initialize accumulator
            this.continuousAccumulators.set(transfer.id, 0);
        }
        
        // Validate transfer has required fields
        if (!transfer.arrival_time || !isFinite(transfer.arrival_time)) {
            console.error(`[Transfer] Transfer created without valid arrival_time:`, transfer);
            return { success: false, transfer: null, error: 'Failed to create transfer: invalid arrival time' };
        }
        
        console.log(`[Transfer] Created transfer from ${fromZoneId} to ${toZoneId}:`, {
            type,
            resourceType,
            transferTime,
            arrivalTime: transfer.arrival_time,
            probeCount: transfer.probe_count,
            metalKg: transfer.metal_kg
        });
        
        return { success: true, transfer: transfer, error: null };
    }
    
    /**
     * Calculate total probes in transit
     * @param {Object} state - Game state
     * @returns {number} Total probes in transit
     */
    calculateTransitProbes(state) {
        const activeTransfers = state.active_transfers || [];
        let totalTransit = 0;
        
        for (const transfer of activeTransfers) {
            const resourceType = transfer.resource_type || 'probe';
            
            // Only count probe transfers
            if (resourceType !== 'probe') continue;
            
            if (transfer.type === 'continuous') {
                // Sum all batches in transit
                if (transfer.in_transit) {
                    for (const batch of transfer.in_transit) {
                        if (batch.resource_type === 'probe' || !batch.resource_type) {
                            totalTransit += batch.count || 0;
                        }
                    }
                }
            } else {
                // One-time transfer: count if still traveling
                if (transfer.status === 'traveling') {
                    totalTransit += transfer.probe_count || 0;
                }
            }
        }
        
        return totalTransit;
    }
    
    /**
     * Update transfer rate (for continuous transfers)
     * @param {Object} state - Game state (mutated)
     * @param {string} transferId - Transfer ID
     * @param {number} ratePercentage - New rate percentage
     * @returns {boolean} Success
     */
    updateTransferRate(state, transferId, ratePercentage) {
        const activeTransfers = state.active_transfers || [];
        const transfer = activeTransfers.find(t => t.id === transferId);
        
        if (!transfer || transfer.type !== 'continuous') {
            return false;
        }
        
        transfer.rate_percentage = Math.max(0, Math.min(100, ratePercentage));
        return true;
    }
    
    /**
     * Pause/unpause transfer
     * @param {Object} state - Game state (mutated)
     * @param {string} transferId - Transfer ID
     * @param {boolean} paused - Pause state
     * @returns {boolean} Success
     */
    pauseTransfer(state, transferId, paused) {
        const activeTransfers = state.active_transfers || [];
        const transfer = activeTransfers.find(t => t.id === transferId);
        
        if (!transfer) {
            return false;
        }
        
        if (transfer.type === 'continuous') {
            transfer.paused = paused;
        } else {
            transfer.status = paused ? 'paused' : 'traveling';
        }
        
        return true;
    }
    
    /**
     * Delete transfer
     * @param {Object} state - Game state (mutated)
     * @param {string} transferId - Transfer ID
     * @returns {boolean} Success
     */
    deleteTransfer(state, transferId) {
        const activeTransfers = state.active_transfers || [];
        const index = activeTransfers.findIndex(t => t.id === transferId);
        
        if (index === -1) {
            return false;
        }
        
        const transfer = activeTransfers[index];
        
        // For continuous transfers, return resources in transit to source
        if (transfer.type === 'continuous' && transfer.in_transit && transfer.in_transit.length > 0) {
            const resourceType = transfer.resource_type || 'probe';
            
            if (resourceType === 'probe') {
                const probesByZone = state.probes_by_zone || {};
                const fromZoneId = transfer.from_zone;
                const probeType = transfer.probe_type || 'probe';
                
                if (!probesByZone[fromZoneId]) {
                    probesByZone[fromZoneId] = {};
                }
                if (!probesByZone[fromZoneId][probeType]) {
                    probesByZone[fromZoneId][probeType] = 0;
                }
                
                const totalInTransit = transfer.in_transit.reduce((sum, batch) => {
                    if (batch.resource_type === 'probe' || !batch.resource_type) {
                        return sum + (batch.count || 0);
                    }
                    return sum;
                }, 0);
                probesByZone[fromZoneId][probeType] += totalInTransit;
                
                state.probes_by_zone = probesByZone;
            } else if (resourceType === 'metal') {
                // Return metal to source zone's stored_metal
                const fromZoneId = transfer.from_zone;
                const totalInTransit = transfer.in_transit.reduce((sum, batch) => {
                    if (batch.resource_type === 'metal') {
                        return sum + (batch.mass_kg || 0);
                    }
                    return sum;
                }, 0);
                const zones = state.zones || {};
                if (!zones[fromZoneId]) {
                    zones[fromZoneId] = { stored_metal: 0, probe_mass: 0, structure_mass: 0, slag_mass: 0, mass_remaining: 0, depleted: false };
                }
                zones[fromZoneId].stored_metal = (zones[fromZoneId].stored_metal || 0) + totalInTransit;
                state.zones = zones;
            }
        }
        
        // Remove accumulator if continuous
        if (transfer.type === 'continuous') {
            this.continuousAccumulators.delete(transferId);
        }
        
        // Remove transfer
        activeTransfers.splice(index, 1);
        
        return true;
    }
    
    /**
     * Generate unique transfer ID
     * @returns {string}
     */
    generateTransferId() {
        return 'transfer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    /**
     * Add transfer to state
     * @param {Object} state - Game state
     * @param {Object} transfer - Transfer object
     * @returns {Object} Updated state
     */
    addTransfer(state, transfer) {
        const newState = JSON.parse(JSON.stringify(state));  // Deep clone
        
        const activeTransfers = newState.active_transfers || [];
        activeTransfers.push(transfer);
        
        newState.active_transfers = activeTransfers;
        return newState;
    }
    
    /**
     * Calculate current AU positions of all resources in transit (probes and metal)
     * Returns a sorted list (by AU distance) of masses and their current AU positions
     * @param {Object} state - Game state
     * @returns {Array<{au: number, mass_kg: number}>} Sorted list of masses at AU distances
     */
    calculateInTransitProbePositions(state) {
        const activeTransfers = state.active_transfers || [];
        const currentTime = state.time || 0;
        const PROBE_MASS = 100; // kg per probe
        
        const positions = [];
        
        for (const transfer of activeTransfers) {
            const fromZoneId = transfer.from_zone;
            const toZoneId = transfer.to_zone;
            
            // Get AU distances for origin and destination zones
            const fromZone = this.orbitalMechanics.getZone(fromZoneId);
            const toZone = this.orbitalMechanics.getZone(toZoneId);
            
            if (!fromZone || !toZone) continue;
            
            const fromAU = fromZone.radius_au || 0;
            const toAU = toZone.radius_au || 0;
            
            if (transfer.type === 'continuous') {
                // Process each batch in transit
                if (transfer.in_transit && transfer.in_transit.length > 0) {
                    for (const batch of transfer.in_transit) {
                        const departureTime = batch.departure_time || 0;
                        const arrivalTime = batch.arrival_time || currentTime;
                        const batchResourceType = batch.resource_type || transfer.resource_type || 'probe';
                        
                        // Skip if batch has already arrived
                        if (arrivalTime <= currentTime) continue;
                        
                        // Skip if batch hasn't departed yet
                        if (departureTime > currentTime) continue;
                        
                        // Calculate progress (0 = at origin, 1 = at destination)
                        const transferTime = arrivalTime - departureTime;
                        if (transferTime <= 0) continue;
                        
                        const elapsed = currentTime - departureTime;
                        const progress = Math.max(0, Math.min(1, elapsed / transferTime));
                        
                        // Linear interpolation of AU distance
                        const currentAU = fromAU + (toAU - fromAU) * progress;
                        
                        // Calculate mass for this batch based on resource type
                        let batchMass = 0;
                        if (batchResourceType === 'metal') {
                            batchMass = batch.mass_kg || 0;
                        } else {
                            // Probe transfer
                            const batchCount = batch.count || 0;
                            batchMass = batchCount * PROBE_MASS;
                        }
                        
                        if (batchMass > 0) {
                            positions.push({
                                au: currentAU,
                                mass_kg: batchMass,
                                transfer_id: transfer.id,
                                batch_departure_time: departureTime
                            });
                        }
                    }
                }
            } else {
                // One-time transfer
                if (transfer.status === 'traveling' || transfer.status === 'paused') {
                    const departureTime = transfer.departure_time || 0;
                    const arrivalTime = transfer.arrival_time || currentTime;
                    
                    // Skip if transfer has already arrived
                    if (arrivalTime <= currentTime) continue;
                    
                    // Skip if transfer hasn't departed yet
                    if (departureTime > currentTime) continue;
                    
                    // Calculate progress (0 = at origin, 1 = at destination)
                    const transferTime = arrivalTime - departureTime;
                    if (transferTime <= 0) continue;
                    
                    const elapsed = currentTime - departureTime;
                    const progress = Math.max(0, Math.min(1, elapsed / transferTime));
                    
                    // Linear interpolation of AU distance
                    const currentAU = fromAU + (toAU - fromAU) * progress;
                    
                    // Calculate mass based on resource type
                    let transferMass = 0;
                    if (transfer.resource_type === 'metal') {
                        transferMass = transfer.metal_kg || 0;
                    } else {
                        // Probe transfer
                        const probeCount = transfer.probe_count || 0;
                        transferMass = probeCount * PROBE_MASS;
                    }
                    
                    if (transferMass > 0) {
                        positions.push({
                            au: currentAU,
                            mass_kg: transferMass,
                            transfer_id: transfer.id,
                            batch_departure_time: departureTime
                        });
                    }
                }
            }
        }
        
        // Sort by AU distance (closest to sun first)
        positions.sort((a, b) => a.au - b.au);
        
        return positions;
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TransferSystem;
}

