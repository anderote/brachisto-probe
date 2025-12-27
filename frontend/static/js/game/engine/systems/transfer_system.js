/**
 * Transfer System
 * 
 * Orbital transfers between zones
 * Supports one-time and continuous transfers
 */

class TransferSystem {
    constructor(orbitalMechanics) {
        this.orbitalMechanics = orbitalMechanics;
        this.economicRules = null;
        // Track accumulated probes for continuous transfers (per transfer)
        this.continuousAccumulators = new Map();
        // Track last rate update time (for 5-second updates)
        this.lastRateUpdateTime = 0;
        // Track mass driver usage: {zoneId: {driver_index: {transfer_id, last_one_time_time, type}}}
        this.massDriverUsage = new Map();
    }
    
    /**
     * Initialize with economic rules (for skill coefficients)
     * @param {Object} economicRules - Economic rules from data loader
     */
    initializeEconomicRules(economicRules) {
        this.economicRules = economicRules;
    }
    
    /**
     * Get probe mass in kg from economic rules
     * @returns {number} Probe mass in kg
     */
    getProbeMass() {
        return this.economicRules?.probe?.mass_kg || 100;
    }
    
    /**
     * Get base specific impulse (ISP) in seconds
     * @returns {number} Base ISP in seconds
     */
    getBaseIsp() {
        return this.economicRules?.propulsion?.base_isp_seconds || 500;
    }
    
    /**
     * Get effective specific impulse with propulsion skill applied
     * @param {Object} skills - Current skills
     * @returns {number} Effective ISP in seconds
     */
    getEffectiveIsp(skills) {
        const propulsionSkill = skills?.propulsion || 1.0;
        return this.getBaseIsp() * propulsionSkill;
    }
    
    /**
     * Get exhaust velocity in m/s based on current propulsion skill
     * @param {Object} skills - Current skills
     * @returns {number} Exhaust velocity in m/s
     */
    getExhaustVelocity(skills) {
        const g0 = 9.80665; // Standard gravity m/s²
        return this.getEffectiveIsp(skills) * g0;
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
     * Build skill values with names for breakdown tracking
     * Dynamically reads ALL skills from coefficients and resolves aliases
     * @param {Object} coefficients - Skill coefficients { skillName: coefficient }
     * @param {Object} skills - Current skills from research
     * @returns {Array<{name: string, value: number, weight: number}>} Array of skill info
     */
    buildSkillValues(coefficients, skills) {
        if (!coefficients) return [];
        
        const values = [];
        for (const [rawSkillName, coefficient] of Object.entries(coefficients)) {
            if (rawSkillName === 'description') continue; // Skip description field
            
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
            if (skillValue === 1.0 && rawSkillName === 'computer') {
                skillValue = skills.computer?.total || 1.0;
            }
            
            values.push({
                name: rawSkillName, // Keep original name for display
                canonicalName: skillName,
                value: skillValue,
                weight: coefficient
            });
        }
        
        return values;
    }
    
    /**
     * Calculate upgrade factor using weighted sum
     * Formula: factor = 1 + Σ(weight_i * (skill_i - 1))
     * @param {Array<{name: string, value: number, weight: number}>} skillInfo - Array of skill info
     * @returns {number} Upgrade factor
     */
    calculateTechTreeUpgradeFactor(skillInfo) {
        if (!skillInfo || skillInfo.length === 0) return 1.0;
        
        let bonus = 0;
        
        for (const { value, weight } of skillInfo) {
            // Skip invalid values
            if (value <= 0 || !isFinite(value)) continue;
            
            // Calculate contribution: weight * (skillValue - 1)
            // This gives 0 when skill = 1.0, and scales linearly
            bonus += weight * (value - 1.0);
        }
        
        return 1.0 + bonus;
    }
    
    /**
     * Calculate upgrade factor from skill coefficients
     * @param {string} category - Category name (e.g., 'mass_driver_capacity')
     * @param {Object} skills - Current skills
     * @returns {number} Upgrade factor
     */
    calculateUpgradeFactorFromCoefficients(category, skills) {
        if (!this.economicRules || !this.economicRules.skill_coefficients) {
            return 1.0;
        }
        
        const coefficients = this.economicRules.skill_coefficients[category];
        if (!coefficients) {
            return 1.0;
        }
        
        const skillInfo = this.buildSkillValues(coefficients, skills);
        return this.calculateTechTreeUpgradeFactor(skillInfo);
    }
    
    /**
     * Calculate fuel required for a probe transfer using Tsiolkovsky rocket equation
     * Uses total delta-v (escape + Hohmann) and allocates fuel proportionally based on
     * mass driver contribution vs probe propulsion.
     * 
     * @param {string} fromZone - Source zone ID
     * @param {string} toZone - Destination zone ID
     * @param {number} probeMass - Mass of probe(s) in kg
     * @param {Object} skills - Current skills (for propulsion ISP)
     * @param {Object} state - Game state (optional, for escape velocity and mass driver calculation)
     * @returns {number} Fuel required in kg
     */
    calculateFuelRequired(fromZone, toZone, probeMass, skills, state = null) {
        // Get Hohmann delta-v for transfer
        const hohmannDeltaV = this.orbitalMechanics.getHohmannDeltaVKmS(fromZone, toZone);
        if (!hohmannDeltaV || hohmannDeltaV <= 0) return 0;
        
        // Get escape delta-v (requires zone mass from state)
        let escapeDeltaV = 0;
        let massDriverDeltaV = 0;
        
        if (state) {
            const zones = state.zones || {};
            const fromZoneData = zones[fromZone] || {};
            const fromZoneMass = fromZoneData.mass_remaining !== undefined ? fromZoneData.mass_remaining : 0;
            
            if (fromZoneMass > 0) {
                escapeDeltaV = this.orbitalMechanics.calculateEscapeDeltaV(fromZone, fromZoneMass);
            }
            
            // Get mass driver contribution
            const structuresByZone = state.structures_by_zone || {};
            const zoneStructures = structuresByZone[fromZone] || {};
            const massDriverCount = zoneStructures['mass_driver'] || 0;
            if (massDriverCount > 0) {
                massDriverDeltaV = this.getMassDriverMuzzleVelocity(state, fromZone);
            }
        }
        
        // Total delta-v required for the entire trip
        const totalRequiredDeltaV = escapeDeltaV + hohmannDeltaV;
        if (totalRequiredDeltaV <= 0) return 0;
        
        // Convert to m/s
        const totalDeltaVMS = totalRequiredDeltaV * 1000;
        
        // Get base ISP from economic rules (default 500 seconds)
        const baseIsp = 500; // seconds
        
        // Get effective ISP (base * propulsion skill)
        const propulsionSkill = skills?.propulsion || 1.0;
        const effectiveIsp = baseIsp * propulsionSkill;
        
        // Calculate exhaust velocity (m/s)
        const g0 = 9.80665; // Standard gravity m/s²
        const exhaustVelocity = effectiveIsp * g0;
        
        // Tsiolkovsky rocket equation: Δv = Isp × g₀ × ln(m₀/m_f)
        // Rearranged to solve for fuel: m_fuel = m_f × (e^(Δv/v_e) - 1)
        // Calculate TOTAL fuel for the entire trip
        const massRatio = Math.exp(totalDeltaVMS / exhaustVelocity);
        const totalFuelRequired = probeMass * (massRatio - 1);
        
        // Allocate fuel cost proportionally based on delta-v makeup
        // Mass driver provides boost (capped at total required)
        const massDriverContribution = Math.min(massDriverDeltaV, totalRequiredDeltaV);
        const probeContribution = Math.max(0, totalRequiredDeltaV - massDriverContribution);
        
        // Probe fuel = (probe delta-v / total delta-v) × total fuel
        const probeFuelFraction = probeContribution / totalRequiredDeltaV;
        const fuelRequired = totalFuelRequired * probeFuelFraction;
        
        return fuelRequired;
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
        const toZoneId = transfer.to_zone;
        const transferResourceType = transfer.resource_type || 'probe'; // 'probe' or 'metal'
        
        // Mass drivers (metal transfers) are completely disabled when net energy is negative
        // Other activities get throttled, but mass drivers turn off entirely
        if (transferResourceType === 'metal') {
            const netEnergy = this.getNetEnergy(state);
            if (netEnergy < 0) {
                // Mass drivers are offline - skip metal transfer processing
                // Mark transfer as energy-blocked for UI display
                transfer.energy_blocked = true;
                return;
            } else {
                transfer.energy_blocked = false;
            }
        }
        
        // Get current skills for transfer time calculation
        const skills = state.skills || {};
        
        // Get zone mass for escape velocity calculation
        const zones = state.zones || {};
        const fromZone = this.orbitalMechanics.getZone(fromZoneId);
        const fromZoneData = zones[fromZoneId] || {};
        const fromZoneMass = fromZoneData.mass_remaining !== undefined && fromZoneData.mass_remaining !== null
            ? fromZoneData.mass_remaining
            : (fromZone?.total_mass_kg || 0);
        
        // Get mass driver muzzle velocity for combined delta-v calculation
        const structuresByZone = state.structures_by_zone || {};
        const zoneStructures = structuresByZone[fromZoneId] || {};
        const massDriverCount = zoneStructures['mass_driver'] || 0;
        const massDriverMuzzleVelocity = massDriverCount > 0 ? 
            this.getMassDriverMuzzleVelocity(state, fromZoneId) : 0;
        
        // Get probe delta-v bonus from starting skill points
        const probeDvBonus = state.skill_bonuses?.probe_dv_bonus || 0;
        
        // Calculate transfer time with speed bonus from excess delta-v
        // Uses combined probe + mass driver delta-v, with excess providing speed bonus
        let baseTransferTime = this.orbitalMechanics.calculateTransferTimeWithBoost(
            fromZoneId,
            toZoneId,
            skills,
            massDriverMuzzleVelocity,
            fromZoneMass,
            probeDvBonus
        );
        
        // Slow down metal transfers to Dyson sphere for visual effect
        const isDysonDestination = toZoneId === 'dyson_sphere' || toZoneId === 'dyson';
        if (isDysonDestination && transferResourceType === 'metal') {
            baseTransferTime = baseTransferTime * 3.0;
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
                    // Calculate fuel required for this batch
                    const probeMass = this.getProbeMass();
                    const batchMass = batchCount * probeMass;
                    const fuelRequired = this.calculateFuelRequired(fromZoneId, toZoneId, batchMass, skills, state);
                    
                    // Check if zone has enough methalox fuel
                    const zones = state.zones || {};
                    if (!zones[fromZoneId]) {
                        zones[fromZoneId] = { stored_metal: 0, probe_mass: 0, structure_mass: 0, slag_mass: 0, methalox: 0, mass_remaining: 0, depleted: false };
                    }
                    const zoneMethalox = zones[fromZoneId].methalox || 0;
                    
                    if (zoneMethalox < fuelRequired) {
                        // Not enough fuel - stop sending batches
                        break;
                    }
                    
                    // Deduct fuel from zone
                    zones[fromZoneId].methalox = Math.max(0, zoneMethalox - fuelRequired);
                    state.zones = zones;
                    
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
                const probeMass = this.getProbeMass();
                const zones = state.zones || {};
                if (!zones[fromZoneId]) {
                    zones[fromZoneId] = { stored_metal: 0, probe_mass: 0, structure_mass: 0, slag_mass: 0, methalox: 0, mass_remaining: 0, depleted: false };
                }
                zones[fromZoneId].probe_mass = Math.max(0, (zones[fromZoneId].probe_mass || 0) - (totalProbesSent * probeMass));
                state.zones = zones;
            }
            
            state.probes_by_zone = probesByZone;
        } else if (transferResourceType === 'metal') {
            // Metal transfer - use metal_rate_percentage (% of stored metal per day)
            const metalRatePercentage = transfer.metal_rate_percentage || 0;
            
            if (metalRatePercentage <= 0) return;
            
            // Get available metal in source zone
            const zones = state.zones || {};
            const sourceZone = zones[fromZoneId] || {};
            available = sourceZone.stored_metal || 0;
            
            // Calculate actual kg/day based on percentage of stored metal
            const metalRateKgPerDay = available * (metalRatePercentage / 100);
            
            if (metalRateKgPerDay <= 0) return;
            
            // Calculate total capacity and check if this transfer's rate exceeds its share
            const totalCapacity = this.calculateMetalTransferCapacity(state, fromZoneId);
            const usedByOthers = this.calculateUsedMetalCapacity(state, fromZoneId, transfer.id);
            const availableCapacity = Math.max(0, totalCapacity - usedByOthers);
            
            // Cap send rate at available capacity
            sendRate = Math.min(metalRateKgPerDay, availableCapacity);
            
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
                        zones[fromZoneId] = { stored_metal: 0, probe_mass: 0, structure_mass: 0, slag_mass: 0, methalox: 0, mass_remaining: 0, depleted: false };
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
            const probeMass = this.getProbeMass();
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
            zones[toZoneId].probe_mass = (zones[toZoneId].probe_mass || 0) + (totalArrived * probeMass);
            state.zones = zones;
            state.probes_by_zone = probesByZone;
            
            console.log(`[Transfer] Continuous: Added ${totalArrived} probes to ${toZoneId}. New count: ${probesByZone[toZoneId][probeType]}`);
        } else if (transferResourceType === 'metal') {
            // Add arrived metal to destination zone's stored_metal
            const totalArrived = arrivedBatches.reduce((sum, batch) => sum + (batch.mass_kg || 0), 0);
            const zones = state.zones || {};
            if (!zones[toZoneId]) {
                zones[toZoneId] = { stored_metal: 0, probe_mass: 0, structure_mass: 0, slag_mass: 0, methalox: 0, mass_remaining: 0, depleted: false };
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
        const probeMass = this.getProbeMass();
        const buildingRateKgPerDay = replicatingProbes * PROBE_BUILD_RATE;
        
        // Apply upgrade factors if available
        const upgradeFactors = state.tech_upgrade_factors || {};
        const probeReplicateFactor = upgradeFactors.probe_replicate || 1.0;
        const effectiveRateKgPerDay = buildingRateKgPerDay * probeReplicateFactor;
        
        // Convert to probes/day
        return effectiveRateKgPerDay / probeMass;
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
            const probeMass = this.getProbeMass();
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
            zones[toZoneId].probe_mass = (zones[toZoneId].probe_mass || 0) + (probeCount * probeMass);
            
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
     * Mass drivers halve travel time for outgoing transfers (50% reduction)
     * @param {number} massDriverCount - Number of mass drivers in zone
     * @param {Object} state - Optional game state (reserved for future upgrades)
     * @returns {number} Speed multiplier (multiplies transfer time, so lower = faster)
     */
    calculateMassDriverSpeedMultiplier(massDriverCount, state = null) {
        if (massDriverCount === 0) {
            return 1.0; // No speed boost without mass drivers
        }
        
        // Mass drivers halve travel time (50% of original)
        return 0.5;
    }
    
    /**
     * Calculate metal transfer capacity based on mass driver count and upgrades
     * Note: This is now a maximum capacity estimate. Actual throughput depends on destination delta-v.
     * For a specific destination, use calculateMassDriverThroughput() instead.
     * @param {Object} state - Game state
     * @param {string} zoneId - Zone identifier
     * @param {string} targetZoneId - Optional target zone for delta-v specific calculation
     * @param {Object} buildingsData - Optional buildings data (loaded from buildings.json)
     * @returns {number} Metal transfer capacity in kg/day
     */
    calculateMetalTransferCapacity(state, zoneId, targetZoneId = null, buildingsData = null) {
        const structuresByZone = state.structures_by_zone || {};
        const zoneStructures = structuresByZone[zoneId] || {};
        const massDriverCount = zoneStructures['mass_driver'] || 0;
        
        if (massDriverCount === 0) {
            return 0; // No metal transfer without mass drivers
        }
        
        // If target zone is specified, use physics-based throughput calculation
        if (targetZoneId) {
            const throughputPerDriver = this.calculateMassDriverThroughput(state, zoneId, targetZoneId, buildingsData);
            return throughputPerDriver * massDriverCount;
        }
        
        // Otherwise, calculate maximum capacity (for nearest orbit, e.g., Venus from Earth = 3 km/s)
        // Use a reference delta-v of 3 km/s (Venus from Earth) for capacity estimation
        const referenceDeltaVKmS = 3.0;
        const powerMW = this.getMassDriverPowerDraw(state, zoneId, buildingsData);
        const efficiency = this.getMassDriverEfficiency(state, zoneId, buildingsData);
        
        // Net power in watts
        const netPowerW = powerMW * 1e6 * efficiency;
        
        // Energy per day (joules)
        const secondsPerDay = 86400;
        const energyPerDayJ = netPowerW * secondsPerDay;
        
        // Energy per kg at reference delta-v: E = 0.5 * v^2 (v in m/s)
        const deltaVMS = referenceDeltaVKmS * 1000;
        const energyPerKgJ = 0.5 * deltaVMS * deltaVMS;
        
        // Mass per day per driver
        const capacityPerDriver = energyPerDayJ / energyPerKgJ;
        
        // Total capacity scales with number of drivers
        return capacityPerDriver * massDriverCount;
    }
    
    /**
     * Calculate total metal rate currently being used by all transfers from a zone
     * @param {Object} state - Game state
     * @param {string} zoneId - Zone identifier
     * @param {string} excludeTransferId - Optional transfer ID to exclude from calculation
     * @returns {number} Total metal rate in kg/day
     */
    calculateUsedMetalCapacity(state, zoneId, excludeTransferId = null) {
        const activeTransfers = state.active_transfers || [];
        let totalRate = 0;
        
        // Get stored metal for this zone to calculate rates from percentages
        const zones = state.zones || {};
        const sourceZone = zones[zoneId] || {};
        const storedMetal = sourceZone.stored_metal || 0;
        
        for (const transfer of activeTransfers) {
            // Skip if this transfer should be excluded
            if (excludeTransferId && transfer.id === excludeTransferId) continue;
            
            // Only count metal transfers from this zone
            if (transfer.from_zone !== zoneId) continue;
            if (transfer.resource_type !== 'metal') continue;
            if (transfer.paused) continue;
            
            if (transfer.type === 'continuous') {
                // Calculate actual rate from percentage of stored metal
                const ratePercentage = transfer.metal_rate_percentage || 0;
                const actualRateKgPerDay = storedMetal * (ratePercentage / 100);
                totalRate += actualRateKgPerDay;
            }
            // One-time transfers don't consume ongoing capacity
        }
        
        return totalRate;
    }
    
    /**
     * Get available metal transfer capacity for a zone
     * @param {Object} state - Game state
     * @param {string} zoneId - Zone identifier
     * @param {Object} buildingsData - Optional buildings data
     * @param {string} excludeTransferId - Optional transfer ID to exclude
     * @param {string} targetZoneId - Optional target zone for delta-v specific calculation
     * @returns {number} Available capacity in kg/day
     */
    getAvailableMetalCapacity(state, zoneId, buildingsData = null, excludeTransferId = null, targetZoneId = null) {
        const totalCapacity = this.calculateMetalTransferCapacity(state, zoneId, targetZoneId, buildingsData);
        const usedCapacity = this.calculateUsedMetalCapacity(state, zoneId, excludeTransferId);
        return Math.max(0, totalCapacity - usedCapacity);
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
     * Get mass driver power draw (MW) with upgrades
     * @param {Object} state - Game state
     * @param {string} zoneId - Zone identifier
     * @param {Object} buildingsData - Optional buildings data
     * @returns {number} Power draw in MW
     */
    getMassDriverPowerDraw(state, zoneId, buildingsData = null) {
        // Get base power from buildings data
        let basePowerMW = 100; // Default: 100 MW
        if (buildingsData && buildingsData.mass_driver) {
            basePowerMW = buildingsData.mass_driver.power_draw_mw || basePowerMW;
        }
        
        // Apply upgrade factors
        const skills = state.skills || {};
        const powerUpgradeFactor = this.calculateUpgradeFactorFromCoefficients('mass_driver_power', skills);
        
        // Power increases with upgrades (more power = more capacity)
        return basePowerMW * powerUpgradeFactor;
    }
    
    /**
     * Get mass driver energy efficiency with upgrades
     * @param {Object} state - Game state
     * @param {string} zoneId - Zone identifier
     * @param {Object} buildingsData - Optional buildings data
     * @returns {number} Efficiency (0-1)
     */
    getMassDriverEfficiency(state, zoneId, buildingsData = null) {
        // Get base efficiency from buildings data
        let baseEfficiency = 0.4; // Default: 40%
        if (buildingsData && buildingsData.mass_driver) {
            baseEfficiency = buildingsData.mass_driver.energy_efficiency || baseEfficiency;
        }
        
        // Apply upgrade factors
        const skills = state.skills || {};
        const efficiencyUpgradeFactor = this.calculateUpgradeFactorFromCoefficients('mass_driver_efficiency', skills);
        
        // Efficiency improves with upgrades (capped at 1.0)
        return Math.min(1.0, baseEfficiency * efficiencyUpgradeFactor);
    }
    
    /**
     * Get mass driver muzzle velocity (delta-v capacity) with upgrades
     * @param {Object} state - Game state
     * @param {string} zoneId - Zone identifier
     * @param {Object} buildingsData - Optional buildings data
     * @returns {number} Muzzle velocity in km/s
     */
    getMassDriverMuzzleVelocity(state, zoneId, buildingsData = null) {
        // Get base muzzle velocity from buildings data
        let baseMuzzleVelocityKmS = 3.0; // Default: 3 km/s (enough for Venus but not Mars)
        if (buildingsData && buildingsData.mass_driver) {
            baseMuzzleVelocityKmS = buildingsData.mass_driver.base_muzzle_velocity_km_s || baseMuzzleVelocityKmS;
        }
        
        // Apply mass driver delta-v bonus from starting skill points
        const massDriverBonus = state.skill_bonuses?.mass_driver_dv_bonus || 0;
        baseMuzzleVelocityKmS += massDriverBonus;
        
        // Apply upgrade factors
        const skills = state.skills || {};
        const velocityUpgradeFactor = this.calculateUpgradeFactorFromCoefficients('mass_driver_muzzle_velocity', skills);
        
        // Muzzle velocity increases with upgrades
        return baseMuzzleVelocityKmS * velocityUpgradeFactor;
    }
    
    /**
     * Calculate mass driver throughput (kg/day) for a specific destination
     * Based on physics: throughput = (power * efficiency * time) / (0.5 * v^2 per kg)
     * @param {Object} state - Game state
     * @param {string} zoneId - Source zone identifier
     * @param {string} targetZoneId - Destination zone identifier
     * @param {Object} buildingsData - Optional buildings data
     * @returns {number} Mass throughput in kg/day (0 if unreachable)
     */
    calculateMassDriverThroughput(state, zoneId, targetZoneId, buildingsData = null) {
        const powerMW = this.getMassDriverPowerDraw(state, zoneId, buildingsData);
        const efficiency = this.getMassDriverEfficiency(state, zoneId, buildingsData);
        const muzzleVelocityKmS = this.getMassDriverMuzzleVelocity(state, zoneId, buildingsData);
        
        // Get zone mass for escape velocity calculation
        const zones = state.zones || {};
        const zoneData = zones[zoneId] || {};
        const zone = this.orbitalMechanics.getZone(zoneId);
        const zoneMass = zoneData.mass_remaining !== undefined && zoneData.mass_remaining !== null
            ? zoneData.mass_remaining
            : (zone?.total_mass_kg || 0);
        
        const requiredDeltaVKmS = this.orbitalMechanics.getTotalDeltaVKmS(zoneId, targetZoneId, zoneMass);
        
        // Check if target is reachable
        if (requiredDeltaVKmS > muzzleVelocityKmS) {
            return 0; // Cannot reach this orbit
        }
        
        // Net power in watts
        const netPowerW = powerMW * 1e6 * efficiency;
        
        // Energy per day (joules)
        const secondsPerDay = 86400;
        const energyPerDayJ = netPowerW * secondsPerDay;
        
        // Energy per kg at this delta-v: E = 0.5 * v^2 (v in m/s)
        const deltaVMS = requiredDeltaVKmS * 1000;
        const energyPerKgJ = 0.5 * deltaVMS * deltaVMS;
        
        // Mass per day
        if (energyPerKgJ <= 0) return 0;
        return energyPerDayJ / energyPerKgJ;
    }
    
    /**
     * Check if mass driver can reach destination based on muzzle velocity
     * @param {Object} state - Game state
     * @param {string} fromZoneId - Source zone
     * @param {string} toZoneId - Destination zone
     * @param {number} fromZoneMass - Current mass of source zone in kg (optional)
     * @param {Object} buildingsData - Optional buildings data
     * @returns {boolean} True if mass driver can reach destination
     */
    canMassDriverReach(state, fromZoneId, toZoneId, fromZoneMass = null, buildingsData = null) {
        // Get zone mass if not provided
        if (fromZoneMass === null || fromZoneMass === undefined) {
            const zones = state.zones || {};
            const fromZoneData = zones[fromZoneId] || {};
            const fromZone = this.orbitalMechanics.getZone(fromZoneId);
            fromZoneMass = fromZoneData.mass_remaining !== undefined && fromZoneData.mass_remaining !== null
                ? fromZoneData.mass_remaining
                : (fromZone?.total_mass_kg || 0);
        }
        
        const requiredDeltaV = this.orbitalMechanics.getTotalDeltaVKmS(fromZoneId, toZoneId, fromZoneMass);
        const muzzleVelocity = this.getMassDriverMuzzleVelocity(state, fromZoneId, buildingsData);
        return muzzleVelocity >= requiredDeltaV;
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
        
        // Get current skills (use provided skills or state skills)
        const currentSkills = (skills && typeof skills === 'object') ? skills : (state.skills || {});
        
        // Get current zone mass for escape velocity calculation
        const zones = state.zones || {};
        const fromZoneData = zones[fromZoneId] || {};
        // Use mass_remaining if available, otherwise fall back to original mass from zone data
        const fromZoneMass = fromZoneData.mass_remaining !== undefined && fromZoneData.mass_remaining !== null
            ? fromZoneData.mass_remaining
            : (fromZone.total_mass_kg || 0);
        
        // Check for mass driver presence (provides delta-v boost for probe transfers)
        const structuresByZone = state.structures_by_zone || {};
        const zoneStructures = structuresByZone[fromZoneId] || {};
        const massDriverCount = zoneStructures['mass_driver'] || 0;
        
        // Get mass driver muzzle velocity (0 if no mass drivers)
        const massDriverMuzzleVelocity = massDriverCount > 0 ? 
            this.getMassDriverMuzzleVelocity(state, fromZoneId) : 0;
        
        // Get probe delta-v bonus from starting skill points
        const probeDvBonus = state.skill_bonuses?.probe_dv_bonus || 0;
        
        // Check delta-v access gating
        // Probe transfers: combine probe delta-v + mass driver boost (if available)
        // Metal transfers: use mass driver muzzle velocity only
        if (resourceType === 'probe') {
            // Probe transfers: use combined probe + mass driver delta-v capacity
            if (!this.orbitalMechanics.canProbeReach(fromZoneId, toZoneId, currentSkills, fromZoneMass, massDriverMuzzleVelocity, probeDvBonus)) {
                // Show error in terms of net delta-v vs Hohmann (matches chart visualization)
                // Net delta-v = total capacity - escape velocity
                const escapeDeltaV = this.orbitalMechanics.calculateEscapeDeltaV(fromZoneId, fromZoneMass);
                const hohmannDeltaV = this.orbitalMechanics.getHohmannDeltaVKmS(fromZoneId, toZoneId);
                const reachInfo = this.orbitalMechanics.getReachabilityInfo(
                    fromZoneId, toZoneId, currentSkills, fromZoneMass, massDriverMuzzleVelocity, probeDvBonus
                );
                const netDeltaV = reachInfo.totalCapacity - escapeDeltaV;
                
                let errorMsg = `Insufficient Δv: transfer requires ${hohmannDeltaV.toFixed(2)} km/s, net Δv is ${netDeltaV.toFixed(2)} km/s`;
                errorMsg += ` (capacity: ${reachInfo.totalCapacity.toFixed(2)} - escape: ${escapeDeltaV.toFixed(2)})`;
                return { 
                    success: false, 
                    transfer: null, 
                    error: errorMsg
                };
            }
        } else if (resourceType === 'metal') {
            // Metal transfers: check if mass driver has enough muzzle velocity
            if (!this.canMassDriverReach(state, fromZoneId, toZoneId, fromZoneMass)) {
                // Show error in terms of net delta-v vs Hohmann (matches chart visualization)
                const escapeDeltaV = this.orbitalMechanics.calculateEscapeDeltaV(fromZoneId, fromZoneMass);
                const hohmannDeltaV = this.orbitalMechanics.getHohmannDeltaVKmS(fromZoneId, toZoneId);
                const muzzleVelocity = this.getMassDriverMuzzleVelocity(state, fromZoneId);
                const netDeltaV = muzzleVelocity - escapeDeltaV;
                
                return { 
                    success: false, 
                    transfer: null, 
                    error: `Insufficient Δv: transfer requires ${hohmannDeltaV.toFixed(2)} km/s, net Δv is ${netDeltaV.toFixed(2)} km/s (muzzle: ${muzzleVelocity.toFixed(2)} - escape: ${escapeDeltaV.toFixed(2)})` 
                };
            }
        }
        
        // Metal transfers require mass drivers
        if (resourceType === 'metal') {
            if (!this.hasMassDriver(state, fromZoneId)) {
                return { success: false, transfer: null, error: 'Mass driver required for metal transfers' };
            }
            
            // Check capacity for continuous metal transfers
            if (type === 'continuous' && ratePercentage > 0) {
                // Use destination-specific capacity calculation
                const availableCapacity = this.getAvailableMetalCapacity(state, fromZoneId, null, null, toZoneId);
                if (availableCapacity <= 0) {
                    return { success: false, transfer: null, error: 'No mass driver capacity available. Build more mass drivers or reduce other transfer rates.' };
                }
                // Cap the rate at available capacity
                if (ratePercentage > availableCapacity) {
                    console.log(`[Transfer] Metal rate capped from ${ratePercentage} to ${availableCapacity} kg/day (capacity limit)`);
                    ratePercentage = availableCapacity;
                }
            }
        }
        
        // Calculate delta-v using new two-component system (escape + Hohmann)
        const deltaVKmS = this.orbitalMechanics.getTotalDeltaVKmS(fromZoneId, toZoneId, fromZoneMass);
        const deltaV = deltaVKmS * 1000; // Convert to m/s for compatibility
        
        // Calculate transfer time with speed bonus from excess delta-v
        // Combined probe + mass driver delta-v determines both reachability AND speed bonus
        let transferTime = this.orbitalMechanics.calculateTransferTimeWithBoost(
            fromZoneId, toZoneId, currentSkills, massDriverMuzzleVelocity, fromZoneMass, probeDvBonus
        );
        
        // Validate transfer time
        if (!transferTime || !isFinite(transferTime) || transferTime <= 0) {
            console.error(`[Transfer] Invalid transfer time calculated: ${transferTime} for ${fromZoneId} -> ${toZoneId}`);
            return { success: false, transfer: null, error: `Invalid transfer time: ${transferTime} days` };
        }
        
        // Log the speed bonus if applicable
        const reachInfo = this.orbitalMechanics.getReachabilityInfo(
            fromZoneId, toZoneId, currentSkills, fromZoneMass, massDriverMuzzleVelocity, probeDvBonus
        );
        if (reachInfo.excessDeltaV > 0) {
            console.log(`[Transfer] Speed bonus from excess delta-v: +${reachInfo.excessDeltaV.toFixed(2)} km/s (total capacity: ${reachInfo.totalCapacity.toFixed(2)} km/s, required: ${reachInfo.requiredDeltaV.toFixed(2)} km/s)`);
        }
        
        // Slow down metal transfers to Dyson sphere for visual effect
        // Metal takes 3x longer to reach the Dyson sphere
        const isDysonDestination = toZoneId === 'dyson_sphere' || toZoneId === 'dyson';
        if (isDysonDestination && resourceType === 'metal') {
            transferTime = transferTime * 3.0;
        }
        
        // Check fuel requirement for one-time probe transfers
        if (type === 'one-time' && resourceType === 'probe') {
            const probeMassPerUnit = this.getProbeMass();
            const probeMass = resourceCount * probeMassPerUnit;
            const fuelRequired = this.calculateFuelRequired(fromZoneId, toZoneId, probeMass, currentSkills, state);
            
            // Check if zone has enough methalox fuel
            const zoneMethalox = zones[fromZoneId]?.methalox || 0;
            if (zoneMethalox < fuelRequired) {
                return {
                    success: false,
                    transfer: null,
                    error: `Insufficient methalox fuel: need ${fuelRequired.toFixed(2)} kg, have ${zoneMethalox.toFixed(2)} kg`
                };
            }
            
            // Deduct fuel immediately for one-time transfers
            if (!zones[fromZoneId]) {
                zones[fromZoneId] = {
                    stored_metal: 0,
                    probe_mass: 0,
                    structure_mass: 0,
                    slag_mass: 0,
                    methalox: 0,
                    mass_remaining: 0,
                    depleted: false
                };
            }
            zones[fromZoneId].methalox = Math.max(0, zoneMethalox - fuelRequired);
            state.zones = zones;
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
                // For metal, ratePercentage is percentage of stored metal per day
                transfer.metal_rate_percentage = ratePercentage;
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
                    zones[fromZoneId] = { stored_metal: 0, probe_mass: 0, structure_mass: 0, slag_mass: 0, methalox: 0, mass_remaining: 0, depleted: false };
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
        const probeMass = this.getProbeMass();
        
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
                            batchMass = batchCount * probeMass;
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
                        transferMass = probeCount * probeMass;
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
    
    /**
     * Get net energy from game state
     * Used to determine if mass drivers should be operational
     * Mass drivers turn off completely when net energy is negative
     * @param {Object} state - Game state
     * @returns {number} Net energy in watts (positive = surplus, negative = deficit)
     */
    getNetEnergy(state) {
        // Check derived totals first (most accurate, calculated by engine)
        const derived = state.derived || {};
        const totals = derived.totals || {};
        
        if (totals.energy_net !== undefined) {
            return totals.energy_net;
        }
        
        // Fallback: calculate from production and consumption rates
        const energyProduction = totals.energy_produced || state.energy_production_rate || 0;
        const energyConsumption = totals.energy_consumed || state.energy_consumption_rate || 0;
        
        return energyProduction - energyConsumption;
    }
    
    /**
     * Check if mass drivers are operational
     * Mass drivers require positive net energy to function
     * @param {Object} state - Game state
     * @returns {boolean} True if mass drivers can operate
     */
    areMassDriversOperational(state) {
        return this.getNetEnergy(state) >= 0;
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TransferSystem;
}

