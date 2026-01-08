"""Game data loader for loading JSON configuration files."""
import json
import os
from pathlib import Path

# Planetary masses in kg (accurate values)
PLANETARY_MASSES = {
    'mercury': 3.3011e23,      # 3.3011 × 10^23 kg
    'venus': 4.8675e24,        # 4.8675 × 10^24 kg
    'earth': 5.9724e24,        # 5.9724 × 10^24 kg
    'mars': 6.4171e23,         # 6.4171 × 10^23 kg
    'asteroid_belt': 3e21,     # Estimated total mass of asteroid belt
    'jupiter': 1.8982e27,      # 1.8982 × 10^27 kg (gas giant - total mass)
    'saturn': 5.6834e26,       # 5.6834 × 10^26 kg (gas giant - total mass)
    'uranus': 8.6810e25,       # 8.6810 × 10^25 kg (ice giant)
    'neptune': 1.02413e26,     # 1.02413 × 10^26 kg (ice giant)
    'kuiper': 5.97e23,         # Estimated (similar to Earth mass)
    'oort_cloud': 3e25         # Estimated mass of Oort cloud
}

class GameDataLoader:
    """Loads and caches game data from JSON files."""
    
    def __init__(self, data_dir=None):
        """Initialize the data loader."""
        if data_dir is None:
            # Assume we're running from project root
            self.data_dir = Path(__file__).parent.parent / 'game_data'
        else:
            self.data_dir = Path(data_dir)
        
        self._orbital_zones = None
        self._buildings = None
        self._research_trees = None
        self._zone_metal_limits = None
        self._economic_rules = None
        self._moon_zones = []
        self._parent_zone_map = {}
        
    def load_orbital_mechanics(self):
        """Load orbital mechanics data."""
        if self._orbital_zones is None:
            file_path = self.data_dir / 'orbital_mechanics.json'
            with open(file_path, 'r') as f:
                data = json.load(f)
                # Start with planet zones
                self._orbital_zones = list(data['orbital_zones'])

                # Store moon-related data
                self._moon_zones = []
                self._parent_zone_map = {}  # moonId -> parentZoneId

                # Flatten moons into separate zone entries
                for zone in data['orbital_zones']:
                    if 'moons' in zone and isinstance(zone['moons'], list):
                        for moon in zone['moons']:
                            # Create a full zone entry for the moon
                            moon_zone = {
                                **moon,
                                'is_moon': True,
                                'parent_zone': zone['id'],
                                # Inherit parent's radius_au for positioning purposes
                                'radius_au': zone.get('radius_au', 1.0),
                                'radius_au_start': zone.get('radius_au', 1.0),
                                'radius_au_end': zone.get('radius_au', 1.0)
                            }
                            self._orbital_zones.append(moon_zone)
                            self._moon_zones.append(moon_zone)
                            self._parent_zone_map[moon['id']] = zone['id']

                # Calculate metal limits per zone (including moons)
                self._zone_metal_limits = {}

                for zone in self._orbital_zones:
                    zone_id = zone['id']
                    # Use metal_stores_kg from JSON if available (for moons and some zones)
                    if 'metal_stores_kg' in zone:
                        self._zone_metal_limits[zone_id] = zone['metal_stores_kg']
                    elif 'total_mass_kg' in zone:
                        # Use total_mass_kg for moons
                        self._zone_metal_limits[zone_id] = zone['total_mass_kg']
                    elif zone_id in PLANETARY_MASSES:
                        # Use true planetary mass directly
                        zone_mass = PLANETARY_MASSES[zone_id]
                        self._zone_metal_limits[zone_id] = zone_mass
                    else:
                        # Default for zones without mass data
                        self._zone_metal_limits[zone_id] = 0

        return self._orbital_zones
    
    def get_zone_metal_limit(self, zone_id):
        """Get metal limit for a specific zone."""
        if self._zone_metal_limits is None:
            self.load_orbital_mechanics()
        return self._zone_metal_limits.get(zone_id, 0)
    
    def get_zone_by_id(self, zone_id):
        """Get orbital zone data by ID."""
        if self._orbital_zones is None:
            self.load_orbital_mechanics()
        for zone in self._orbital_zones:
            if zone['id'] == zone_id:
                return zone
        return None

    def is_moon_zone(self, zone_id):
        """Check if a zone is a moon."""
        if self._orbital_zones is None:
            self.load_orbital_mechanics()
        zone = self.get_zone_by_id(zone_id)
        return zone.get('is_moon', False) if zone else False

    def get_parent_zone(self, moon_zone_id):
        """Get parent zone ID for a moon zone."""
        if self._orbital_zones is None:
            self.load_orbital_mechanics()
        return self._parent_zone_map.get(moon_zone_id)

    def get_moons_for_zone(self, parent_zone_id):
        """Get moon zones for a specific parent planet."""
        if self._orbital_zones is None:
            self.load_orbital_mechanics()
        return [m for m in self._moon_zones if m.get('parent_zone') == parent_zone_id]

    def get_all_moon_zones(self):
        """Get all moon zones."""
        if self._orbital_zones is None:
            self.load_orbital_mechanics()
        return self._moon_zones

    def load_buildings(self):
        """Load buildings data."""
        if self._buildings is None:
            file_path = self.data_dir / 'buildings.json'
            with open(file_path, 'r') as f:
                data = json.load(f)
                self._buildings = data['buildings']
        return self._buildings
    
    def get_building_by_id(self, building_id):
        """Get building data by ID."""
        if self._buildings is None:
            self.load_buildings()
        
        # Handle flat structure: buildings is a dict where keys are building IDs
        if isinstance(self._buildings, dict):
            # Check if building_id is a direct key
            if building_id in self._buildings:
                building = self._buildings[building_id]
                # Ensure it has an 'id' field
                if isinstance(building, dict):
                    if 'id' not in building:
                        building['id'] = building_id
                    return building
            
            # Fallback: search through categories (old format support)
            for category, items in self._buildings.items():
                if isinstance(items, list):
                    for building in items:
                        if building.get('id') == building_id:
                            return building
                elif isinstance(items, dict) and building_id in items:
                    # Handle nested dict structure
                    building = items[building_id]
                    if isinstance(building, dict) and 'id' not in building:
                        building['id'] = building_id
                    return building
        return None
    
    def get_factories(self):
        """Get all factory buildings."""
        if self._buildings is None:
            self.load_buildings()
        return self._buildings.get('factories', [])
    
    def get_probes(self):
        """Get all probe types."""
        if self._buildings is None:
            self.load_buildings()
        # Check both possible structures: specialized_units.probes or specialized_units.units
        specialized = self._buildings.get('specialized_units', {})
        if 'probes' in specialized:
            return specialized['probes']
        elif 'units' in specialized:
            # Filter for probe-type units
            units = specialized['units']
            return [unit for unit in units if unit.get('id') == 'probe']  # Single probe type only
        return []
    
    def load_research_trees(self):
        """Load consolidated research trees."""
        if self._research_trees is None:
            file_path = self.data_dir / 'research_trees.json'
            if file_path.exists():
                with open(file_path, 'r') as f:
                    data = json.load(f)
                    self._research_trees = data.get('research_trees', {})
            else:
                # Return empty dict if file doesn't exist
                self._research_trees = {}
        return self._research_trees
    
    def get_all_research_trees(self):
        """Get all research trees."""
        return self.load_research_trees()
    
    def get_research_tree(self, tree_id):
        """Get a specific research tree by ID."""
        all_trees = self.get_all_research_trees()
        return all_trees.get(tree_id)
    
    def load_economic_rules(self):
        """Load economic rules data."""
        if self._economic_rules is None:
            file_path = self.data_dir / 'economic_rules.json'
            if file_path.exists():
                with open(file_path, 'r') as f:
                    self._economic_rules = json.load(f)
            else:
                self._economic_rules = {}
        return self._economic_rules
    
    def get_probe_config(self):
        """Get probe configuration from economic rules."""
        rules = self.load_economic_rules()
        return rules.get('probe', {})
    
    def get_structures_config(self):
        """Get structures configuration from economic rules."""
        rules = self.load_economic_rules()
        return rules.get('structures', {})
    
    def get_skill_coefficients(self, category=None):
        """Get skill coefficients from economic rules."""
        rules = self.load_economic_rules()
        coefficients = rules.get('skill_coefficients', {})
        if category:
            return coefficients.get(category, {})
        return coefficients
    
    def validate_data(self):
        """Validate loaded data structure."""
        errors = []
        
        # Validate orbital zones
        zones = self.load_orbital_mechanics()
        if not zones:
            errors.append("No orbital zones loaded")
        
        zone_ids = [z['id'] for z in zones]
        if len(zone_ids) != len(set(zone_ids)):
            errors.append("Duplicate zone IDs found")
        
        # Validate buildings
        buildings = self.load_buildings()
        if not buildings:
            errors.append("No buildings loaded")
        
        # Validate research trees
        research_trees = self.get_all_research_trees()
        if not research_trees:
            errors.append("No research trees loaded")
        
        return errors

# Global instance
_game_data_loader = None

def get_game_data_loader(data_dir=None):
    """Get or create the global game data loader instance."""
    global _game_data_loader
    if _game_data_loader is None:
        _game_data_loader = GameDataLoader(data_dir)
    return _game_data_loader

