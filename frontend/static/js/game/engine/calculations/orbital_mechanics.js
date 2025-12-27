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
     * Calculate transfer time based on Hohmann ellipse arc length and physics-based speed
     * Speed = orbital_velocity + (probe_delta_v - escape_velocity)
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
        
        // Calculate Hohmann transfer ellipse parameters
        const rInner = Math.min(r1_au, r2_au);
        const rOuter = Math.max(r1_au, r2_au);
        const semiMajorAxis = (rInner + rOuter) / 2;
        const eccentricity = (rOuter - rInner) / (rOuter + rInner);
        const semiMinorAxis = semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity);
        
        // Calculate arc length of half-ellipse using Ramanujan's approximation
        // Full ellipse circumference ≈ π * (3(a+b) - sqrt((3a+b)(a+3b)))
        const a = semiMajorAxis;
        const b = semiMinorAxis;
        const h = Math.pow((a - b) / (a + b), 2);
        const fullCircumference = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
        const arcLengthAU = fullCircumference / 2; // Half-orbit for Hohmann transfer
        
        // Convert arc length to km
        const arcLengthKm = arcLengthAU * AU_KM;
        
        // Get probe delta-v capacity from skills (including starting skill point bonus)
        let probeDeltaVCapacity = 1.0; // Default base capacity
        if (typeof skillsOrPropulsionSkill === 'object' && skillsOrPropulsionSkill !== null) {
            probeDeltaVCapacity = this.getProbeDeltaVCapacity(skillsOrPropulsionSkill, probeDvBonus);
        } else {
            // If just a number was passed, add the bonus directly
            probeDeltaVCapacity = (skillsOrPropulsionSkill || 1.0) + probeDvBonus;
        }
        
        // Calculate transfer speed using physics-based formula
        // Speed = orbital_velocity + (probe_delta_v - escape_velocity)
        const transferSpeedKmS = this.calculateTransferSpeedKmS(fromZoneId, probeDeltaVCapacity);
        
        if (transferSpeedKmS <= 0) {
            // Fallback to old calculation if speed calculation fails
            const EARTH_MARS_ARC = 3.9; // AU (approximate)
            const EARTH_MARS_TIME = 243; // days (8 months)
            const BASE_SPEED_AU_PER_DAY = EARTH_MARS_ARC / EARTH_MARS_TIME;
            return arcLengthAU / BASE_SPEED_AU_PER_DAY;
        }
        
        // Calculate time: distance / speed
        // Convert km/s to km/day: km/s * 86400 s/day = km/day
        const transferSpeedKmPerDay = transferSpeedKmS * 86400;
        const transferTimeDays = arcLengthKm / transferSpeedKmPerDay;
        
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
     * Calculate transfer speed in km/s based on probe delta-v capacity
     * Formula: speed = orbital_velocity + (probe_delta_v - escape_velocity)
     * @param {string} fromZoneId - Source zone
     * @param {number} probeDeltaVCapacity - Probe's delta-v capacity in km/s
     * @returns {number} Transfer speed in km/s
     */
    calculateTransferSpeedKmS(fromZoneId, probeDeltaVCapacity) {
        const zone = this.getZone(fromZoneId);
        if (!zone) return 0;
        
        const escapeVelocity = zone.escape_delta_v_km_s || 0;
        const orbitalVelocity = this.getOrbitalVelocityKmS(fromZoneId);
        
        // Speed = orbital velocity + (probe capacity - escape velocity)
        // Excess delta-v beyond escape velocity adds directly to speed
        const excessDeltaV = Math.max(0, probeDeltaVCapacity - escapeVelocity);
        return orbitalVelocity + excessDeltaV;
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
     * Calculate probe delta-v capacity from skills
     * @param {Object} skills - Current skills from research
     * @param {number} probeDvBonus - Optional probe delta-v bonus from starting skill points (km/s)
     * @returns {number} Probe delta-v capacity in km/s
     */
    getProbeDeltaVCapacity(skills, probeDvBonus = 0) {
        if (!this.economicRules || !this.economicRules.probe_transfer) {
            return 1.0 + probeDvBonus; // Default base capacity + bonus
        }
        
        // Add probe delta-v bonus from starting skill points
        const baseDeltaV = (this.economicRules.probe_transfer.base_delta_v_km_s || 1.0) + probeDvBonus;
        
        if (!this.economicRules.skill_coefficients || !this.economicRules.skill_coefficients.probe_delta_v_capacity) {
            return baseDeltaV; // No upgrades
        }
        
        const coefficients = this.economicRules.skill_coefficients.probe_delta_v_capacity;
        const skillInfo = this.buildSkillValues(coefficients, skills);
        const upgradeFactor = this.calculateTechTreeUpgradeFactor(skillInfo);
        
        // Capacity increases with upgrade factor
        return baseDeltaV * upgradeFactor;
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
     * Calculate transfer time with speed bonus from excess delta-v
     * Excess delta-v provides a speed boost: each km/s of excess reduces transfer time
     * @param {string} fromZoneId - Source zone
     * @param {string} toZoneId - Destination zone
     * @param {Object} skills - Current skills
     * @param {number} massDriverMuzzleVelocity - Mass driver muzzle velocity in km/s (0 if no mass driver)
     * @param {number} fromZoneMass - Current mass of source zone in kg (optional)
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
        
        // Calculate Hohmann transfer ellipse parameters
        const rInner = Math.min(r1_au, r2_au);
        const rOuter = Math.max(r1_au, r2_au);
        const semiMajorAxis = (rInner + rOuter) / 2;
        const eccentricity = (rOuter - rInner) / (rOuter + rInner);
        const semiMinorAxis = semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity);
        
        // Calculate arc length of half-ellipse using Ramanujan's approximation
        const a = semiMajorAxis;
        const b = semiMinorAxis;
        const h = Math.pow((a - b) / (a + b), 2);
        const fullCircumference = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
        const arcLengthAU = fullCircumference / 2; // Half-orbit for Hohmann transfer
        
        // Convert arc length to km
        const arcLengthKm = arcLengthAU * AU_KM;
        
        // Calculate base transfer speed: orbital velocity + excess delta-v
        // Excess delta-v directly adds to transfer speed (probe goes faster than minimum energy transfer)
        const orbitalVelocityKmS = this.getOrbitalVelocityKmS(fromZoneId);
        const escapeVelocityKmS = fromZone.escape_delta_v_km_s || 0;
        
        // Base speed is orbital velocity (minimum for Hohmann transfer)
        // Excess delta-v adds directly to this (more energy = faster transfer)
        // Note: excessDeltaV is the remaining delta-v after overcoming escape + Hohmann requirements
        const transferSpeedKmS = orbitalVelocityKmS + excessDeltaV;
        
        if (transferSpeedKmS <= 0) {
            // Fallback to old calculation
            const EARTH_MARS_ARC = 3.9;
            const EARTH_MARS_TIME = 243;
            const BASE_SPEED_AU_PER_DAY = EARTH_MARS_ARC / EARTH_MARS_TIME;
            return arcLengthAU / BASE_SPEED_AU_PER_DAY;
        }
        
        // Calculate time: distance / speed
        const transferSpeedKmPerDay = transferSpeedKmS * 86400;
        const transferTimeDays = arcLengthKm / transferSpeedKmPerDay;
        
        return transferTimeDays;
    }
    
    /**
     * Check if probe can reach destination based on combined delta-v capacity
     * Combines probe delta-v + mass driver muzzle velocity (if available)
     * @param {string} fromZoneId - Source zone
     * @param {string} toZoneId - Destination zone
     * @param {Object} skills - Current skills
     * @param {number} fromZoneMass - Current mass of source zone in kg (optional)
     * @param {number} massDriverMuzzleVelocity - Mass driver muzzle velocity in km/s (0 if no mass driver)
     * @returns {boolean} True if probe can reach destination
     */
    canProbeReach(fromZoneId, toZoneId, skills, fromZoneMass = null, massDriverMuzzleVelocity = 0, probeDvBonus = 0) {
        // Get required delta-v (fixed physics, not affected by upgrades)
        let requiredDeltaV;
        if (fromZoneMass !== null && fromZoneMass !== undefined) {
            requiredDeltaV = this.getTotalDeltaVKmS(fromZoneId, toZoneId, fromZoneMass);
        } else {
            const fromZone = this.getZone(fromZoneId);
            const toZone = this.getZone(toZoneId);
            if (!fromZone || !toZone) return false;
            
            const fromZoneMassLegacy = fromZone.total_mass_kg || 0;
            requiredDeltaV = this.getTotalDeltaVKmS(fromZoneId, toZoneId, fromZoneMassLegacy);
        }
        
        // Get combined capacity (probe + mass driver + probe dv bonus)
        const totalCapacity = this.getCombinedDeltaVCapacity(skills, massDriverMuzzleVelocity, probeDvBonus);
        
        // Compare combined capacity vs requirement
        return totalCapacity >= requiredDeltaV;
    }
    
    /**
     * Get reachability info with detailed breakdown
     * @param {string} fromZoneId - Source zone
     * @param {string} toZoneId - Destination zone
     * @param {Object} skills - Current skills
     * @param {number} fromZoneMass - Current mass of source zone in kg
     * @param {number} massDriverMuzzleVelocity - Mass driver muzzle velocity in km/s
     * @returns {Object} {canReach, requiredDeltaV, probeCapacity, massDriverBoost, totalCapacity, excessDeltaV}
     */
    getReachabilityInfo(fromZoneId, toZoneId, skills, fromZoneMass, massDriverMuzzleVelocity = 0, probeDvBonus = 0) {
        const requiredDeltaV = this.getTotalDeltaVKmS(fromZoneId, toZoneId, fromZoneMass);
        const probeCapacity = this.getProbeDeltaVCapacity(skills, probeDvBonus);
        const totalCapacity = this.getCombinedDeltaVCapacity(skills, massDriverMuzzleVelocity, probeDvBonus);
        const excessDeltaV = this.getExcessDeltaV(totalCapacity, requiredDeltaV);
        const canReach = totalCapacity >= requiredDeltaV;
        
        return {
            canReach,
            requiredDeltaV,
            probeCapacity,
            massDriverBoost: massDriverMuzzleVelocity,
            totalCapacity,
            excessDeltaV
        };
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OrbitalMechanics;
}

