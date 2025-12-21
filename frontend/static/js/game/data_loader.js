/** Planetary masses in kg (accurate values) */
const PLANETARY_MASSES = {
    'mercury': 3.3011e23,      // 3.3011 × 10^23 kg
    'venus': 4.8675e24,        // 4.8675 × 10^24 kg
    'earth': 5.9724e24,        // 5.9724 × 10^24 kg
    'mars': 6.4171e23,         // 6.4171 × 10^23 kg
    'asteroid_belt': 3e21,     // Estimated total mass of asteroid belt
    'jupiter': 1.8982e27,      // 1.8982 × 10^27 kg (gas giant - total mass)
    'saturn': 5.6834e26,       // 5.6834 × 10^26 kg (gas giant - total mass)
    'uranus': 8.6810e25,       // 8.6810 × 10^25 kg (ice giant)
    'neptune': 1.02413e26,     // 1.02413 × 10^26 kg (ice giant)
    'kuiper': 5.97e23,         // Estimated (similar to Earth mass)
    'oort_cloud': 3e25         // Estimated mass of Oort cloud
};

/** Game data loader for frontend */
class GameDataLoader {
    constructor() {
        this.orbitalZones = null;
        this.buildings = null;
        this.researchTrees = null;
        this.zoneMetalLimits = null;
        this.cache = {};
    }

    async loadOrbitalMechanics() {
        if (!this.orbitalZones) {
            const response = await fetch('/game_data/orbital_mechanics.json');
            const data = await response.json();
            this.orbitalZones = data.orbital_zones;
            
            // Calculate metal limits per zone based on metal_stores_kg from JSON
            this.zoneMetalLimits = {};
            for (const zone of this.orbitalZones) {
                const zoneId = zone.id;
                // Use metal_stores_kg from JSON if available, otherwise fall back to PLANETARY_MASSES
                if (zone.metal_stores_kg !== undefined) {
                    this.zoneMetalLimits[zoneId] = zone.metal_stores_kg;
                } else if (zoneId in PLANETARY_MASSES) {
                    // Fallback: use total mass if metal_stores_kg not specified
                    this.zoneMetalLimits[zoneId] = PLANETARY_MASSES[zoneId];
                } else {
                    // Default for zones without mass data
                    this.zoneMetalLimits[zoneId] = 0;
                }
            }
        }
        return this.orbitalZones;
    }

    getZoneMetalLimit(zoneId) {
        if (!this.zoneMetalLimits) {
            // If not loaded yet, return 0 (caller should ensure loadOrbitalMechanics is called first)
            return 0;
        }
        return this.zoneMetalLimits[zoneId] || 0;
    }
    
    getZoneById(zoneId) {
        if (!this.orbitalZones) {
            return null;
        }
        return this.orbitalZones.find(zone => zone.id === zoneId) || null;
    }

    async loadBuildings() {
        if (!this.buildings) {
            const response = await fetch('/game_data/buildings.json');
            const data = await response.json();
            this.buildings = data.buildings;
        }
        return this.buildings;
    }

    async loadResearchTrees() {
        if (!this.researchTrees) {
            // Load additional research trees
            const additionalResponse = await fetch('/game_data/additional_research_trees.json');
            const additionalData = await additionalResponse.json();
            
            // Try to load main research trees (may not exist)
            let mainTrees = {};
            try {
                const mainResponse = await fetch('/game_data/research_trees.json');
                const mainData = await mainResponse.json();
                mainTrees = mainData.research_trees || {};
            } catch (e) {
                // File doesn't exist, that's okay
            }
            
            // Merge trees
            this.researchTrees = {
                ...mainTrees,
                ...additionalData.additional_research_trees
            };
        }
        return this.researchTrees;
    }

    getZoneById(zoneId) {
        if (!this.orbitalZones) {
            return null;
        }
        return this.orbitalZones.find(zone => zone.id === zoneId);
    }

    getBuildingById(buildingId) {
        if (!this.buildings) {
            return null;
        }
        
        // Search through all categories
        for (const category in this.buildings) {
            const items = this.buildings[category];
            if (Array.isArray(items)) {
                const building = items.find(b => b.id === buildingId);
                if (building) {
                    return building;
                }
            } else if (items && typeof items === 'object') {
                // Handle nested structures like specialized_units.probes
                for (const subCategory in items) {
                    if (Array.isArray(items[subCategory])) {
                        const building = items[subCategory].find(b => b.id === buildingId);
                        if (building) {
                            return building;
                        }
                    }
                }
            }
        }
        return null;
    }

    getProbes() {
        if (!this.buildings) {
            return [];
        }
        // Check both possible structures: specialized_units.probes or specialized_units.units
        const specialized = this.buildings.specialized_units || {};
        if (specialized.probes) {
            return specialized.probes;
        } else if (specialized.units) {
            // Filter for probe-type units
            const probeIds = ['probe', 'miner_probe', 'compute_probe', 'energy_probe', 'construction_probe'];
            return specialized.units.filter(unit => probeIds.includes(unit.id));
        }
        return [];
    }

    getFactories() {
        if (!this.buildings) {
            return [];
        }
        return this.buildings.factories || [];
    }

    getAllResearchTrees() {
        // This is already implemented in loadResearchTrees, but add explicit getter
        return this.researchTrees || {};
    }

    getResearchTree(treeId) {
        const allTrees = this.getAllResearchTrees();
        return allTrees[treeId] || null;
    }

    validateData() {
        const errors = [];
        
        // Validate orbital zones
        if (!this.orbitalZones || this.orbitalZones.length === 0) {
            errors.push("No orbital zones loaded");
        } else {
            const zoneIds = this.orbitalZones.map(z => z.id);
            if (zoneIds.length !== new Set(zoneIds).size) {
                errors.push("Duplicate zone IDs found");
            }
        }
        
        // Validate buildings
        if (!this.buildings || Object.keys(this.buildings).length === 0) {
            errors.push("No buildings loaded");
        }
        
        // Validate research trees
        const researchTrees = this.getAllResearchTrees();
        if (!researchTrees || Object.keys(researchTrees).length === 0) {
            errors.push("No research trees loaded");
        }
        
        return errors;
    }

    async loadAll() {
        await Promise.all([
            this.loadOrbitalMechanics(),
            this.loadBuildings(),
            this.loadResearchTrees()
        ]);
    }
}

// Global instance
const gameDataLoader = new GameDataLoader();

