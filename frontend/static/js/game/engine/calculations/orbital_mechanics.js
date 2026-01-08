/**
 * Orbital Mechanics Calculator
 * 
 * Realistic orbital mechanics calculations:
 * - Delta-v for transfers (Hohmann transfers)
 * - Transfer times
 * - Zone properties (radius, mass, metallicity)
 */

class OrbitalMechanics {
    constructor(dataLoader) {
        this.dataLoader = dataLoader;
        this.orbitalZones = null;
        this.economicRules = null;
        this.hohmannTransfers = null;  // Pre-calculated Hohmann transfer delta-v matrix
        
        // Standard gravitational parameter for Sun (m³/s²)
        this.SUN_MU = 1.32712440018e20;  // G * M_sun
        
        // Base specific impulse (seconds) - will be modified by propulsion skill
        this.BASE_ISP = 500;  // seconds
    }
    
    /**
     * Initialize with economic rules (for skill coefficients)
     * @param {Object} economicRules - Economic rules from data loader
     */
    initializeEconomicRules(economicRules) {
        this.economicRules = economicRules;
    }
    
    /**
     * Initialize with orbital zones data
     * @param {Array} zones - Orbital zones from data loader
     */
    initialize(zones) {
        this.orbitalZones = zones;
    }
    
    /**
     * Initialize with transfer delta-v data
     * @param {Object} transferData - Hohmann transfer delta-v matrix from data loader
     */
    initializeTransferData(transferData) {
        this.hohmannTransfers = transferData;
    }
    
    /**
     * Get zone properties by ID
     * @param {string} zoneId - Zone identifier
     * @returns {Object|null} Zone properties
     */
    getZone(zoneId) {
        if (!this.orbitalZones) return null;
        return this.orbitalZones.find(z => z.id === zoneId) || null;
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
     * Calculate delta-v reduction factor from skills
     * @param {Object} skills - Current skills from research
     * @returns {number} Delta-v reduction factor (multiplier, < 1.0 means reduced delta-v)
     */
    calculateDeltaVReductionFactor(skills) {
        if (!this.economicRules || !this.economicRules.skill_coefficients) {
            // Fallback: use propulsion skill directly
            return 1.0 / (1 + (skills.propulsion || 1.0) - 1.0);
        }
        
        const coefficients = this.economicRules.skill_coefficients.delta_v_reduction;
        if (!coefficients) {
            // Fallback: use propulsion skill directly
            return 1.0 / (1 + (skills.propulsion || 1.0) - 1.0);
        }
        
        const skillInfo = this.buildSkillValues(coefficients, skills);
        const upgradeFactor = this.calculateTechTreeUpgradeFactor(skillInfo);
        
        // Delta-v reduction: higher upgrade factor = lower delta-v requirement
        // Return inverse (1 / factor) so that factor > 1 means less delta-v needed
        return 1.0 / upgradeFactor;
    }
    
    /**
     * Calculate transfer speed multiplier from skills
     * @param {Object} skills - Current skills from research
     * @returns {number} Transfer speed multiplier (> 1.0 means faster transfers)
     */
    calculateTransferSpeedFactor(skills) {
        if (!this.economicRules || !this.economicRules.skill_coefficients) {
            // Fallback: no speed boost
            return 1.0;
        }
        
        const coefficients = this.economicRules.skill_coefficients.transfer_speed;
        if (!coefficients) {
            // Fallback: no speed boost
            return 1.0;
        }
        
        const skillInfo = this.buildSkillValues(coefficients, skills);
        const upgradeFactor = this.calculateTechTreeUpgradeFactor(skillInfo);
        
        // Transfer speed: higher upgrade factor = faster transfers
        return upgradeFactor;
    }
    
    /**
     * Calculate delta-v for Hohmann transfer between two zones
     * Note: This is pure physics - orbital mechanics don't change with upgrades.
     * Upgrades affect probe capacity and mass driver performance, not orbital delta-v requirements.
     * @param {string} fromZoneId - Source zone
     * @param {string} toZoneId - Destination zone
     * @param {Object|number} skillsOrPropulsionSkill - DEPRECATED: kept for backward compatibility but not used
     * @returns {number} Delta-v in m/s (fixed physics value, not reduced by upgrades)
     */
    calculateDeltaV(fromZoneId, toZoneId, skillsOrPropulsionSkill = 1.0) {
        const fromZone = this.getZone(fromZoneId);
        const toZone = this.getZone(toZoneId);
        
        if (!fromZone || !toZone) return Infinity;
        
        // Get orbital radii in meters
        const r1 = fromZone.radius_km * 1000;  // Convert km to m
        const r2 = toZone.radius_km * 1000;
        
        // Hohmann transfer delta-v calculation
        // First burn: circularize at periapsis (if going outward) or apoapsis (if going inward)
        // Second burn: circularize at destination
        
        // For transfer from r1 to r2 (r2 > r1, going outward):
        // Δv1 = sqrt(μ/r1) * (sqrt(2*r2/(r1+r2)) - 1)
        // Δv2 = sqrt(μ/r2) * (1 - sqrt(2*r1/(r1+r2)))
        // Total Δv = |Δv1| + |Δv2|
        
        // Handle both directions (outward and inward)
        const rInner = Math.min(r1, r2);
        const rOuter = Math.max(r1, r2);
        
        if (rInner === rOuter) return 0;  // Same zone
        
        // Calculate Hohmann transfer delta-v (pure physics, no skill reduction)
        const sqrtMu = Math.sqrt(this.SUN_MU);
        const rSum = rInner + rOuter;
        
        // First burn: from circular orbit to transfer ellipse
        const dv1 = sqrtMu / Math.sqrt(rInner) * (Math.sqrt(2 * rOuter / rSum) - 1);
        
        // Second burn: from transfer ellipse to circular orbit
        const dv2 = sqrtMu / Math.sqrt(rOuter) * (1 - Math.sqrt(2 * rInner / rSum));
        
        const totalDeltaV = Math.abs(dv1) + Math.abs(dv2);
        
        // Return pure physics value - NO skill reduction
        // Upgrades affect probe capacity and mass driver performance, not orbital mechanics
        return totalDeltaV;
    }
    
    /**
     * Calculate transfer time based on Kepler's third law for Hohmann transfers
     * Uses the physics-correct formula: T = 0.5 * sqrt(a³) years
     * @param {string} fromZoneId - Source zone
     * @param {string} toZoneId - Destination zone
     * @param {Object|number} skillsOrPropulsionSkill - Skills object or propulsion skill multiplier (for backward compatibility)
     * @param {number} probeDvBonus - Optional probe delta-v bonus from starting skill points (km/s)
     * @returns {number} Transfer time in days
     */
    calculateTransferTime(fromZoneId, toZoneId, skillsOrPropulsionSkill = 1.0, probeDvBonus = 0) {
        const fromZone = this.getZone(fromZoneId);
        const toZone = this.getZone(toZoneId);
        
        if (!fromZone || !toZone) return Infinity;
        
        // Get orbital radii in AU (convert from km if needed)
        const AU_KM = 149597870.7;
        const r1_au = fromZone.radius_au || (fromZone.radius_km / AU_KM);
        const r2_au = toZone.radius_au || (toZone.radius_km / AU_KM);
        
        if (r1_au === r2_au) return 0;
        
        // Calculate Hohmann transfer ellipse semi-major axis
        const semiMajorAxisAU = (r1_au + r2_au) / 2;
        
        // Calculate BASE Hohmann transfer time using Kepler's third law
        // T_transfer = 0.5 * sqrt(a³) years (half orbital period of transfer ellipse)
        const baseTransferTimeYears = 0.5 * Math.sqrt(Math.pow(semiMajorAxisAU, 3));
        const baseTransferTimeDays = baseTransferTimeYears * 365.25;
        
        // Get probe delta-v capacity from skills (including starting skill point bonus)
        let probeDeltaVCapacity = 1.0; // Default base capacity
        if (typeof skillsOrPropulsionSkill === 'object' && skillsOrPropulsionSkill !== null) {
            probeDeltaVCapacity = this.getProbeDeltaVCapacity(skillsOrPropulsionSkill, probeDvBonus);
        } else {
            // If just a number was passed, add the bonus directly
            probeDeltaVCapacity = (skillsOrPropulsionSkill || 1.0) + probeDvBonus;
        }
        
        // Calculate excess delta-v for speed bonus
        const escapeVelocity = fromZone.escape_delta_v_km_s || 0;
        const excessDeltaV = Math.max(0, probeDeltaVCapacity - escapeVelocity);
        
        // Apply speed bonus from excess delta-v (logarithmic scaling)
        const EXCESS_DV_SCALE = 7.5; // km/s that gives ~2x speed bonus
        let speedMultiplier = 1.0;
        if (excessDeltaV > 0) {
            speedMultiplier = 1.0 + Math.log(1 + excessDeltaV / EXCESS_DV_SCALE);
        }
        
        // Final transfer time (reduced by speed bonus)
        const transferTimeDays = baseTransferTimeDays / speedMultiplier;
        
        return transferTimeDays;
    }
    
    /**
     * Get zone mass in kg
     * @param {string} zoneId - Zone identifier
     * @returns {number} Mass in kg
     */
    getZoneMass(zoneId) {
        const zone = this.getZone(zoneId);
        if (!zone) return 0;
        return zone.total_mass_kg || 0;
    }
    
    /**
     * Get zone metal stores in kg
     * @param {string} zoneId - Zone identifier
     * @returns {number} Metal in kg
     */
    getZoneMetal(zoneId) {
        const zone = this.getZone(zoneId);
        if (!zone) return 0;
        return zone.metal_stores_kg || 0;
    }
    
    /**
     * Get zone metallicity (fraction of mass that is metal)
     * @param {string} zoneId - Zone identifier
     * @returns {number} Metallicity (0-1)
     */
    getZoneMetallicity(zoneId) {
        const zone = this.getZone(zoneId);
        if (!zone) return 0;
        const totalMass = zone.total_mass_kg || 0;
        const metalMass = zone.metal_stores_kg || 0;
        if (totalMass === 0) return 0;
        return metalMass / totalMass;
    }
    
    /**
     * Get zone mining rate multiplier
     * @param {string} zoneId - Zone identifier
     * @returns {number} Multiplier
     */
    getZoneMiningMultiplier(zoneId) {
        const zone = this.getZone(zoneId);
        if (!zone) return 1.0;
        return zone.mining_rate_multiplier || 1.0;
    }
    
    /**
     * Get zone energy cost multiplier
     * @param {string} zoneId - Zone identifier
     * @returns {number} Multiplier
     */
    getZoneEnergyCostMultiplier(zoneId) {
        const zone = this.getZone(zoneId);
        if (!zone) return 1.0;
        return zone.energy_cost_multiplier || 1.0;
    }
    
    /**
     * Get zone productivity modifier
     * @param {string} zoneId - Zone identifier
     * @returns {number} Multiplier
     */
    getZoneProductivityModifier(zoneId) {
        const zone = this.getZone(zoneId);
        if (!zone) return 1.0;
        return zone.productivity_modifier || 1.0;
    }
    
    /**
     * Check if zone is Dyson zone
     * @param {string} zoneId - Zone identifier
     * @returns {boolean}
     */
    isDysonZone(zoneId) {
        const zone = this.getZone(zoneId);
        if (!zone) return false;
        return zone.is_dyson_zone || false;
    }
    
    /**
     * Get physical orbital velocity for a zone in km/s
     * Uses vis-viva equation: v = sqrt(μ/r) for circular orbit
     * @param {string} zoneId - Zone identifier
     * @returns {number} Orbital velocity in km/s
     */
    getOrbitalVelocityKmS(zoneId) {
        const zone = this.getZone(zoneId);
        if (!zone) return 0;
        
        // Get orbital radius in meters
        const r = zone.radius_km * 1000; // Convert km to m
        
        if (r <= 0) return 0;
        
        // For circular orbit: v = sqrt(μ/r)
        // μ = G * M_sun (standard gravitational parameter)
        const velocityMS = Math.sqrt(this.SUN_MU / r);
        
        // Convert m/s to km/s
        return velocityMS / 1000;
    }
    
    /**
     * Calculate transfer speed multiplier based on probe delta-v capacity
     * Used for visualization - returns a factor to multiply base orbital velocity by
     * @param {string} fromZoneId - Source zone
     * @param {number} probeDeltaVCapacity - Probe's delta-v capacity in km/s
     * @returns {number} Transfer speed in km/s (base orbital velocity * speed multiplier)
     */
    calculateTransferSpeedKmS(fromZoneId, probeDeltaVCapacity) {
        const zone = this.getZone(fromZoneId);
        if (!zone) return 0;
        
        const escapeVelocity = zone.escape_delta_v_km_s || 0;
        const orbitalVelocity = this.getOrbitalVelocityKmS(fromZoneId);
        
        // Calculate excess delta-v (beyond what's needed for escape)
        const excessDeltaV = Math.max(0, probeDeltaVCapacity - escapeVelocity);
        
        // Calculate speed multiplier using logarithmic scaling (matches transfer time calculation)
        const EXCESS_DV_SCALE = 7.5; // km/s that gives ~2x speed
        let speedMultiplier = 1.0;
        if (excessDeltaV > 0) {
            speedMultiplier = 1.0 + Math.log(1 + excessDeltaV / EXCESS_DV_SCALE);
        }
        
        // Return orbital velocity scaled by the speed multiplier
        return orbitalVelocity * speedMultiplier;
    }
    
    /**
     * Get pre-calculated Hohmann transfer delta-v (km/s) between two zones
     * This is the orbital transfer component only, does not include escape velocity
     * Note: This is FIXED physics - orbital mechanics don't change with upgrades
     * @param {string} fromZoneId - Source zone
     * @param {string} toZoneId - Destination zone
     * @returns {number} Hohmann transfer delta-v in km/s (fixed, physics-based)
     */
    getHohmannDeltaVKmS(fromZoneId, toZoneId) {
        if (!this.hohmannTransfers) {
            // Fallback to calculated value if transfer data not loaded (no skill reduction)
            const fromZone = this.getZone(fromZoneId);
            const toZone = this.getZone(toZoneId);
            if (!fromZone || !toZone) return Infinity;
            if (fromZoneId === toZoneId) return 0;
            
            // Calculate pure Hohmann transfer (no skill reduction)
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
        
        const fromTransfers = this.hohmannTransfers[fromZoneId];
        if (!fromTransfers) {
            return Infinity;
        }
        
        const deltaV = fromTransfers[toZoneId];
        if (deltaV === undefined) {
            return Infinity;
        }
        
        return deltaV;
    }
    
    /**
     * Calculate dynamic escape delta-v based on current zone mass
     * Escape velocity scales with sqrt(mass ratio)
     * @param {string} zoneId - Zone identifier
     * @param {number} currentMass - Current mass of the zone in kg
     * @returns {number} Escape delta-v in km/s
     */
    calculateEscapeDeltaV(zoneId, currentMass) {
        const zone = this.getZone(zoneId);
        if (!zone) {
            return 0;
        }
        
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
    
    /**
     * Get total delta-v for a transfer (escape + Hohmann)
     * Note: This is the REQUIRED delta-v, not affected by upgrades.
     * Upgrades affect probe capacity and mass driver performance, not orbital mechanics.
     * @param {string} fromZoneId - Source zone
     * @param {string} toZoneId - Destination zone
     * @param {number} fromZoneMass - Current mass of source zone in kg
     * @param {Object} skills - Current skills (deprecated, kept for compatibility but not used)
     * @returns {number} Total delta-v in km/s (required, not reduced by upgrades)
     */
    getTotalDeltaVKmS(fromZoneId, toZoneId, fromZoneMass, skills = null) {
        // Escape delta-v from origin body (scales with planetary mass only)
        const escapeDV = this.calculateEscapeDeltaV(fromZoneId, fromZoneMass);
        
        // Hohmann transfer delta-v (fixed, physics-based, not affected by upgrades)
        const hohmannDV = this.getHohmannDeltaVKmS(fromZoneId, toZoneId);
        
        // Total delta-v required (escape + orbital transfer)
        // This is the PHYSICS requirement, not affected by upgrades
        return escapeDV + hohmannDV;
    }
    
    /**
     * Get delta-v requirement in km/s (converted from m/s)
     * Legacy method - now uses two-component system if zone mass is provided
     * @param {string} fromZoneId - Source zone
     * @param {string} toZoneId - Destination zone
     * @param {Object|number} skillsOrZoneMass - Current skills or zone mass (for backward compatibility)
     * @returns {number} Delta-v in km/s
     */
    getDeltaVKmS(fromZoneId, toZoneId, skillsOrZoneMass = null) {
        // If skillsOrZoneMass is a number, treat it as zone mass (new API)
        if (typeof skillsOrZoneMass === 'number') {
            return this.getTotalDeltaVKmS(fromZoneId, toZoneId, skillsOrZoneMass);
        }
        
        // Legacy: use old calculation method
        const deltaVMS = this.calculateDeltaV(fromZoneId, toZoneId, skillsOrZoneMass || {});
        return deltaVMS / 1000; // Convert m/s to km/s
    }
    
    /**
     * Calculate probe delta-v capacity from ISP and mass ratio using Tsiolkovsky rocket equation
     * Delta-v = ISP × g0 × ln(mass_ratio)
     * ISP scales from base (300s) to max (4500s) based on propulsion skill
     * @param {Object} skills - Current skills from research
     * @param {number} probeDvBonus - Optional probe delta-v bonus from starting skill points (km/s)
     * @returns {number} Probe delta-v capacity in km/s
     */
    getProbeDeltaVCapacity(skills, probeDvBonus = 0) {
        const g0 = 9.80665; // Standard gravity m/s²
        const baseMassRatio = 3.0; // Typical wet/dry mass ratio

        // Get ISP config
        const propulsionConfig = this.economicRules?.propulsion || {};
        const baseIsp = propulsionConfig.base_isp_seconds || 300;
        const maxIsp = propulsionConfig.max_isp_seconds || 4500;

        // Get propulsion skill (starts at 1.0)
        const propulsionSkill = skills?.propulsion || 1.0;

        // Calculate max skill for normalization (~6.5x max from full research)
        const maxSkill = 6.5;

        // Normalize skill progress (0 at skill=1, 1 at skill=maxSkill)
        const skillProgress = Math.min(1, Math.max(0, (propulsionSkill - 1) / (maxSkill - 1)));

        // Interpolate ISP from base to max based on skill progress
        const effectiveIsp = baseIsp + (maxIsp - baseIsp) * skillProgress;

        // Calculate exhaust velocity (m/s)
        const exhaustVelocity = effectiveIsp * g0;

        // Calculate delta-v using Tsiolkovsky rocket equation (m/s)
        const deltaVMs = exhaustVelocity * Math.log(baseMassRatio);

        // Convert to km/s and add bonus
        const deltaVKmS = deltaVMs / 1000 + probeDvBonus;

        return deltaVKmS;
    }

    /**
     * Get effective ISP based on propulsion skill (for display purposes)
     * @param {Object} skills - Current skills from research
     * @returns {number} Effective ISP in seconds
     */
    getEffectiveIsp(skills) {
        const propulsionConfig = this.economicRules?.propulsion || {};
        const baseIsp = propulsionConfig.base_isp_seconds || 300;
        const maxIsp = propulsionConfig.max_isp_seconds || 4500;
        const propulsionSkill = skills?.propulsion || 1.0;
        const maxSkill = 6.5;
        const skillProgress = Math.min(1, Math.max(0, (propulsionSkill - 1) / (maxSkill - 1)));
        return baseIsp + (maxIsp - baseIsp) * skillProgress;
    }
    
    /**
     * Calculate combined delta-v capacity from probe + mass driver
     * When a zone has mass drivers, probes launched from there get a boost
     * @param {Object} skills - Current skills from research
     * @param {number} massDriverMuzzleVelocity - Mass driver muzzle velocity in km/s (0 if no mass driver)
     * @param {number} probeDvBonus - Optional probe delta-v bonus from starting skill points (km/s)
     * @returns {number} Combined delta-v capacity in km/s
     */
    getCombinedDeltaVCapacity(skills, massDriverMuzzleVelocity = 0, probeDvBonus = 0) {
        const probeCapacity = this.getProbeDeltaVCapacity(skills, probeDvBonus);
        
        // Mass driver adds its muzzle velocity to the probe's own delta-v
        // This represents the probe being launched at higher velocity
        return probeCapacity + massDriverMuzzleVelocity;
    }
    
    /**
     * Calculate excess delta-v available for speed bonus
     * @param {number} totalCapacity - Combined probe + mass driver delta-v capacity in km/s
     * @param {number} requiredDeltaV - Required delta-v for the transfer in km/s
     * @returns {number} Excess delta-v in km/s (0 if not enough capacity)
     */
    getExcessDeltaV(totalCapacity, requiredDeltaV) {
        return Math.max(0, totalCapacity - requiredDeltaV);
    }
    
    /**
     * Calculate net delta-v (delta-v capacity minus escape velocity)
     * 
     * Net delta-v represents the delta-v available for the Hohmann transfer
     * after accounting for escaping the origin body's gravity well.
     * 
     * Transfer is possible when: net_delta_v >= hohmann_delta_v
     * Which is equivalent to: capacity >= hohmann_delta_v + escape_delta_v
     * 
     * @param {number} totalCapacity - Total delta-v capacity (probe + mass driver) in km/s
     * @param {number} escapeDeltaV - Escape velocity from origin in km/s
     * @returns {number} Net delta-v in km/s (can be negative if insufficient capacity)
     */
    getNetDeltaV(totalCapacity, escapeDeltaV) {
        return totalCapacity - escapeDeltaV;
    }
    
    /**
     * Check if transfer is possible by comparing net delta-v to Hohmann transfer delta-v
     * 
     * The transfer decision uses: net_delta_v >= hohmann_delta_v
     * Where: net_delta_v = total_capacity - escape_velocity
     * 
     * This is equivalent to: total_capacity >= hohmann_delta_v + escape_delta_v
     * 
     * @param {number} totalCapacity - Total delta-v capacity in km/s
     * @param {number} escapeDeltaV - Escape velocity from origin in km/s
     * @param {number} hohmannDeltaV - Hohmann transfer delta-v in km/s
     * @returns {boolean} True if transfer is possible
     */
    canTransferWithNetDeltaV(totalCapacity, escapeDeltaV, hohmannDeltaV) {
        const netDeltaV = this.getNetDeltaV(totalCapacity, escapeDeltaV);
        return netDeltaV >= hohmannDeltaV;
    }
    
    /**
     * Apply speed bonus to backend solver transfer time based on excess delta-v
     * Takes the optimized transfer time from backend solver and improves it with excess delta-v.
     * Uses logarithmic scaling for diminishing returns - more delta-v helps but with decreasing benefit.
     * 
     * @param {number} baseTransferTimeDays - Base transfer time from backend solver (days)
     * @param {number} requiredDeltaVKmS - Required delta-v for the transfer (km/s)
     * @param {Object} skills - Current skills
     * @param {number} massDriverMuzzleVelocity - Mass driver muzzle velocity in km/s (0 if no mass driver)
     * @param {number} fromZoneMass - Current mass of source zone in kg (optional)
     * @param {number} probeDvBonus - Probe delta-v bonus from starting skill points (km/s)
     * @param {string} fromZoneId - Source zone (for escape velocity calculation)
     * @param {string} toZoneId - Destination zone (for reachability info)
     * @returns {number} Improved transfer time in days (reduced by excess delta-v speed bonus)
     */
    applySpeedBonusToBackendTime(baseTransferTimeDays, requiredDeltaVKmS, skills, massDriverMuzzleVelocity = 0, fromZoneMass = null, probeDvBonus = 0, fromZoneId = null, toZoneId = null) {
        if (!baseTransferTimeDays || baseTransferTimeDays <= 0 || !isFinite(baseTransferTimeDays)) {
            return baseTransferTimeDays; // Return as-is if invalid
        }
        
        // Get combined capacity (probe + mass driver + probe dv bonus)
        const totalCapacity = this.getCombinedDeltaVCapacity(skills, massDriverMuzzleVelocity, probeDvBonus);
        
        // Calculate excess delta-v for speed bonus
        // Excess = capacity beyond what's required for the transfer
        const excessDeltaV = this.getExcessDeltaV(totalCapacity, requiredDeltaVKmS);
        
        // Apply speed bonus from excess delta-v
        // Using logarithmic scaling so the bonus doesn't become too extreme
        // With 0 excess: speed multiplier = 1.0 (no change)
        // With 5 km/s excess: speed multiplier ≈ 1.7 (41% faster)
        // With 10 km/s excess: speed multiplier ≈ 2.3 (57% faster)
        // With 20 km/s excess: speed multiplier ≈ 3.0 (67% faster)
        const EXCESS_DV_SCALE = 7.5; // km/s that gives ~2x speed bonus
        let speedMultiplier = 1.0;
        if (excessDeltaV > 0) {
            speedMultiplier = 1.0 + Math.log(1 + excessDeltaV / EXCESS_DV_SCALE);
        }
        
        // Final transfer time (reduced by speed bonus)
        // Cap the speed improvement to prevent unrealistic times (minimum 20% of base time)
        const improvedTime = Math.max(baseTransferTimeDays / speedMultiplier, baseTransferTimeDays * 0.2);
        
        return improvedTime;
    }
    
    /**
     * Calculate transfer time with speed bonus from excess delta-v
     * Uses Kepler's third law for correct Hohmann transfer time, then applies speed bonus.
     * 
     * Base Hohmann transfer time: T = 0.5 * sqrt(a³) years, where a is semi-major axis in AU
     * This gives the physically correct transfer time for minimum energy trajectory.
     * 
     * Speed bonus: excess delta-v reduces transfer time (faster trajectory than Hohmann)
     * 
     * @param {string} fromZoneId - Source zone
     * @param {string} toZoneId - Destination zone
     * @param {Object} skills - Current skills
     * @param {number} massDriverMuzzleVelocity - Mass driver muzzle velocity in km/s (0 if no mass driver)
     * @param {number} fromZoneMass - Current mass of source zone in kg (optional)
     * @param {number} probeDvBonus - Probe delta-v bonus from starting skill points (km/s)
     * @returns {number} Transfer time in days (reduced by excess delta-v speed bonus)
     */
    calculateTransferTimeWithBoost(fromZoneId, toZoneId, skills, massDriverMuzzleVelocity = 0, fromZoneMass = null, probeDvBonus = 0) {
        const fromZone = this.getZone(fromZoneId);
        const toZone = this.getZone(toZoneId);
        
        if (!fromZone || !toZone) return Infinity;
        
        // Get zone mass for escape velocity calculation
        let zoneMass = fromZoneMass;
        if (zoneMass === null || zoneMass === undefined) {
            zoneMass = fromZone.total_mass_kg || 0;
        }
        
        // Get required delta-v
        const requiredDeltaV = this.getTotalDeltaVKmS(fromZoneId, toZoneId, zoneMass);
        
        // Get combined capacity (probe + mass driver + probe dv bonus)
        const totalCapacity = this.getCombinedDeltaVCapacity(skills, massDriverMuzzleVelocity, probeDvBonus);
        
        // Get excess delta-v for speed bonus
        const excessDeltaV = this.getExcessDeltaV(totalCapacity, requiredDeltaV);
        
        // Get orbital radii in AU
        const AU_KM = 149597870.7;
        const r1_au = fromZone.radius_au || (fromZone.radius_km / AU_KM);
        const r2_au = toZone.radius_au || (toZone.radius_km / AU_KM);
        
        if (r1_au === r2_au) return 0;
        
        // Calculate Hohmann transfer ellipse semi-major axis
        const semiMajorAxisAU = (r1_au + r2_au) / 2;
        
        // Calculate BASE Hohmann transfer time using Kepler's third law
        // For orbital period: T² = 4π²a³/μ, where μ = 4π² in AU³/year² (normalized to Earth)
        // So T = sqrt(a³) years for full orbit
        // Hohmann transfer is half an orbit: T_transfer = 0.5 * sqrt(a³) years
        const baseTransferTimeYears = 0.5 * Math.sqrt(Math.pow(semiMajorAxisAU, 3));
        const baseTransferTimeDays = baseTransferTimeYears * 365.25;
        
        // Apply speed bonus from excess delta-v
        // Each km/s of excess delta-v provides a percentage speed increase
        // Using a logarithmic scaling so the bonus doesn't become too extreme
        // With 0 excess: speed multiplier = 1.0
        // With 5 km/s excess: speed multiplier ≈ 1.7
        // With 10 km/s excess: speed multiplier ≈ 2.3
        // With 20 km/s excess: speed multiplier ≈ 3.0
        const EXCESS_DV_SCALE = 7.5; // km/s that gives ~2x speed bonus
        let speedMultiplier = 1.0;
        if (excessDeltaV > 0) {
            speedMultiplier = 1.0 + Math.log(1 + excessDeltaV / EXCESS_DV_SCALE);
        }
        
        // Final transfer time (reduced by speed bonus)
        const transferTimeDays = baseTransferTimeDays / speedMultiplier;
        
        return transferTimeDays;
    }
    
    /**
     * Check if probe can reach destination based on combined delta-v capacity
     * 
     * Uses the net delta-v comparison:
     *   net_delta_v >= hohmann_delta_v
     * Where:
     *   net_delta_v = total_capacity - escape_velocity
     *   total_capacity = probe_delta_v + mass_driver_muzzle_velocity
     * 
     * This is equivalent to: total_capacity >= hohmann_delta_v + escape_velocity
     * 
     * @param {string} fromZoneId - Source zone
     * @param {string} toZoneId - Destination zone
     * @param {Object} skills - Current skills
     * @param {number} fromZoneMass - Current mass of source zone in kg (optional)
     * @param {number} massDriverMuzzleVelocity - Mass driver muzzle velocity in km/s (0 if no mass driver)
     * @param {number} probeDvBonus - Probe delta-v bonus from starting skill points (km/s)
     * @returns {boolean} True if probe can reach destination
     */
    canProbeReach(fromZoneId, toZoneId, skills, fromZoneMass = null, massDriverMuzzleVelocity = 0, probeDvBonus = 0) {
        const fromZone = this.getZone(fromZoneId);
        const toZone = this.getZone(toZoneId);
        if (!fromZone || !toZone) return false;
        
        // Get zone mass for escape velocity calculation
        const zoneMass = (fromZoneMass !== null && fromZoneMass !== undefined)
            ? fromZoneMass
            : (fromZone.total_mass_kg || 0);
        
        // Get escape velocity from origin (scales with planetary mass)
        const escapeDeltaV = this.calculateEscapeDeltaV(fromZoneId, zoneMass);
        
        // Get Hohmann transfer delta-v (fixed physics)
        const hohmannDeltaV = this.getHohmannDeltaVKmS(fromZoneId, toZoneId);
        
        // Get combined capacity (probe + mass driver + probe dv bonus)
        const totalCapacity = this.getCombinedDeltaVCapacity(skills, massDriverMuzzleVelocity, probeDvBonus);
        
        // Compare net delta-v to Hohmann delta-v:
        // net_delta_v = total_capacity - escape_velocity
        // Can reach if: net_delta_v >= hohmann_delta_v
        return this.canTransferWithNetDeltaV(totalCapacity, escapeDeltaV, hohmannDeltaV);
    }
    
    /**
     * Get reachability info with detailed breakdown
     * 
     * Returns all components needed for the transfer decision:
     * - escapeDeltaV: Delta-v needed to escape origin's gravity well
     * - hohmannDeltaV: Delta-v for Hohmann transfer between orbits
     * - totalCapacity: Combined probe + mass driver delta-v capacity
     * - netDeltaV: Capacity remaining after escape (totalCapacity - escapeDeltaV)
     * 
     * Transfer is possible when: netDeltaV >= hohmannDeltaV
     * Which is equivalent to: totalCapacity >= hohmannDeltaV + escapeDeltaV
     * 
     * @param {string} fromZoneId - Source zone
     * @param {string} toZoneId - Destination zone
     * @param {Object} skills - Current skills
     * @param {number} fromZoneMass - Current mass of source zone in kg
     * @param {number} massDriverMuzzleVelocity - Mass driver muzzle velocity in km/s
     * @param {number} probeDvBonus - Probe delta-v bonus from starting skill points (km/s)
     * @returns {Object} Detailed reachability breakdown
     */
    getReachabilityInfo(fromZoneId, toZoneId, skills, fromZoneMass, massDriverMuzzleVelocity = 0, probeDvBonus = 0) {
        // Get escape velocity from origin (scales with current zone mass)
        const escapeDeltaV = this.calculateEscapeDeltaV(fromZoneId, fromZoneMass);
        
        // Get Hohmann transfer delta-v (fixed physics, doesn't change with upgrades)
        const hohmannDeltaV = this.getHohmannDeltaVKmS(fromZoneId, toZoneId);
        
        // Total required = escape + Hohmann (for backward compatibility)
        const requiredDeltaV = escapeDeltaV + hohmannDeltaV;
        
        // Get probe and combined capacities
        const probeCapacity = this.getProbeDeltaVCapacity(skills, probeDvBonus);
        const totalCapacity = this.getCombinedDeltaVCapacity(skills, massDriverMuzzleVelocity, probeDvBonus);
        
        // Net delta-v = capacity available for Hohmann transfer after escaping
        const netDeltaV = this.getNetDeltaV(totalCapacity, escapeDeltaV);
        
        // Can reach if net delta-v >= Hohmann delta-v
        const canReach = this.canTransferWithNetDeltaV(totalCapacity, escapeDeltaV, hohmannDeltaV);
        
        // Excess delta-v provides speed bonus (if any capacity beyond minimum required)
        const excessDeltaV = this.getExcessDeltaV(totalCapacity, requiredDeltaV);
        
        return {
            canReach,
            // Individual components
            escapeDeltaV,
            hohmannDeltaV,
            // Capacity info
            probeCapacity,
            massDriverBoost: massDriverMuzzleVelocity,
            totalCapacity,
            // Derived values
            netDeltaV,           // totalCapacity - escapeDeltaV
            requiredDeltaV,      // escapeDeltaV + hohmannDeltaV (for backward compat)
            excessDeltaV         // totalCapacity - requiredDeltaV (for speed bonus)
        };
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OrbitalMechanics;
}

