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
        
        // Standard gravitational parameter for Sun (m³/s²)
        this.SUN_MU = 1.32712440018e20;  // G * M_sun
        
        // Base specific impulse (seconds) - will be modified by propulsion skill
        this.BASE_ISP = 500;  // seconds
    }
    
    /**
     * Initialize with orbital zones data
     * @param {Array} zones - Orbital zones from data loader
     */
    initialize(zones) {
        this.orbitalZones = zones;
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
     * Calculate delta-v for Hohmann transfer between two zones
     * @param {string} fromZoneId - Source zone
     * @param {string} toZoneId - Destination zone
     * @param {number} propulsionSkill - Propulsion skill multiplier
     * @returns {number} Delta-v in m/s
     */
    calculateDeltaV(fromZoneId, toZoneId, propulsionSkill = 1.0) {
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
        
        // Calculate Hohmann transfer delta-v
        const sqrtMu = Math.sqrt(this.SUN_MU);
        const rSum = rInner + rOuter;
        
        // First burn: from circular orbit to transfer ellipse
        const dv1 = sqrtMu / Math.sqrt(rInner) * (Math.sqrt(2 * rOuter / rSum) - 1);
        
        // Second burn: from transfer ellipse to circular orbit
        const dv2 = sqrtMu / Math.sqrt(rOuter) * (1 - Math.sqrt(2 * rInner / rSum));
        
        const totalDeltaV = Math.abs(dv1) + Math.abs(dv2);
        
        // Apply propulsion skill (higher skill = lower delta-v requirement)
        // Skill acts as efficiency multiplier: effective_dv = dv / (1 + skill_bonus)
        // e.g., skill = 1.5 means 1.5x efficiency, so dv is reduced
        const effectiveDeltaV = totalDeltaV / (1 + (propulsionSkill - 1.0));
        
        return effectiveDeltaV;
    }
    
    /**
     * Calculate transfer time for Hohmann transfer
     * @param {string} fromZoneId - Source zone
     * @param {string} toZoneId - Destination zone
     * @param {number} propulsionSkill - Propulsion skill multiplier
     * @returns {number} Transfer time in days
     */
    calculateTransferTime(fromZoneId, toZoneId, propulsionSkill = 1.0) {
        const fromZone = this.getZone(fromZoneId);
        const toZone = this.getZone(toZoneId);
        
        if (!fromZone || !toZone) return Infinity;
        
        // Get orbital radii in meters
        const r1 = fromZone.radius_km * 1000;
        const r2 = toZone.radius_km * 1000;
        
        if (r1 === r2) return 0;
        
        const rInner = Math.min(r1, r2);
        const rOuter = Math.max(r1, r2);
        
        // Hohmann transfer time = half the orbital period of transfer ellipse
        // T = π * sqrt((a^3) / μ)
        // where a = semi-major axis = (r1 + r2) / 2
        const semiMajorAxis = (rInner + rOuter) / 2;
        const transferTimeSeconds = Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / this.SUN_MU);
        
        // Convert seconds to days
        const transferTimeDays = transferTimeSeconds / 86400;
        
        // Apply propulsion skill (higher skill = faster transfer)
        // Skill improves specific impulse, which affects acceleration
        // Simplified: effective_time = time / (1 + skill_bonus * 0.5)
        const effectiveTime = transferTimeDays / (1 + (propulsionSkill - 1.0) * 0.5);
        
        return effectiveTime;
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
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OrbitalMechanics;
}

