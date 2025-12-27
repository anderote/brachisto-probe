"""Core game engine for simulation."""
import math
import warnings
from backend.game_data_loader import get_game_data_loader
from backend.config import Config

class GameEngine:
    """Core game simulation engine."""
    
    def __init__(self, session_id, config=None):
        """Initialize game engine."""
        self.session_id = session_id
        self.config = config or {}
        self.data_loader = get_game_data_loader()
        
        # Game state
        self.tick_count = 0
        self.time = 0.0  # days (fundamental time unit)
        
        # Resources
        self.energy = self.config.get('initial_energy', Config.INITIAL_ENERGY)
        self.metal = self.config.get('initial_metal', Config.INITIAL_METAL)
        self.intelligence = 0.0
        self.dexterity = 0.0  # Will be calculated after probes are initialized
        self.slag = 0.0  # Global slag pool
        self.energy_stored = 0.0  # Energy stored in watt-days
        
        # Zone-specific slag and mass tracking
        self.zone_slag_produced = {}  # {zoneId: slag_produced}
        self.zone_mass_remaining = {}  # {zoneId: total_mass_remaining}
        
        # Throttling flags for UI
        self.is_energy_limited = False
        self.is_metal_limited = False
        
        # Probes - single type only
        self.probes = {
            'probe': self.config.get('initial_probes', Config.INITIAL_PROBES)
        }
        
        # Probes by zone: {zoneId: {'probe': count}}
        self.probes_by_zone = {}
        
        # Probe allocations by zone: {zoneId: {'harvest': {'probe': count}, 'construct': {'probe': count}, 'dyson': {'probe': count}}}
        self.probe_allocations_by_zone = {}
        
        # Structures by zone: {zoneId: {building_id: count}}
        self.structures_by_zone = {}
        
        # Initialize probes by zone and starting buildings
        zones = self.data_loader.load_orbital_mechanics()
        initial_probes = self.config.get('initial_probes', Config.INITIAL_PROBES)
        default_zone = self.config.get('default_zone', 'earth')
        initial_structures = self.config.get('initial_structures', {})
        
        for zone in zones:
            zone_id = zone['id']
            self.probes_by_zone[zone_id] = {'probe': 0}
            self.structures_by_zone[zone_id] = {}
            
            # Set initial probes for the default zone
            if zone_id == default_zone:
                self.probes_by_zone[zone_id] = {'probe': initial_probes}
            
            # Set initial structures for this zone if specified in config
            if zone_id in initial_structures:
                self.structures_by_zone[zone_id] = dict(initial_structures[zone_id])
            
            # Initialize zone allocations
            if zone.get('is_dyson_zone', False):
                # Dyson zone: start with 0 probes (player must build them)
                self.probes_by_zone[zone_id] = {'probe': 0}
                # Dyson zone: dyson, construct, replicate
                self.probe_allocations_by_zone[zone_id] = {
                    'dyson': {'probe': 0},      # Building Dyson
                    'construct': {'probe': 0},  # Building structures
                    'replicate': {'probe': 0},   # Replicating probes
                    'harvest': {'probe': 0}     # No mining allowed
                }
            else:
                # Regular zones: mining vs replication vs construction
                self.probe_allocations_by_zone[zone_id] = {
                    'harvest': {'probe': 0},     # Mining
                    'replicate': {'probe': 0},   # Replicating probes
                    'construct': {'probe': 0}    # Building structures/probes
                }
        
        # Legacy probe allocations (for backward compatibility)
        self.probe_allocations = {
            'harvest': {'probe': 1},
            'construct': {'probe': 1},
            'research': {'probe': 0},
            'dyson': {'probe': 1}
        }
        
        # Factory production levels: {zone_id: {building_id: percentage (0-100)}}
        self.factory_production = {}
        
        # Economy slider: 0 = all Dyson, 100 = all Economy
        # With 1 dyson and 2 economy (1 mine + 1 build), that's 33% dyson, 67% economy
        self.economy_slider = 67  # Default: 67% Economy, 33% Dyson
        
        # Mine/Build slider: 0 = all mine (harvest), 100 = all build (construct) - within economy allocation
        # With 1 mine and 1 build, that's 50% mine, 50% build
        self.mine_build_slider = 50  # Default: 50% mine, 50% build
        
        # Build allocation: 0 = all structures, 100 = all probes (for probes allocated to construct)
        self.build_allocation = 100  # Default: 0% structures, 100% probes
        
        # Dyson power allocation: 0 = all economy (energy), 100 = all compute (intelligence)
        self.dyson_power_allocation = 50  # Default: 50% compute power
        
        # Harvest zone selection (which zone to harvest from)
        self.harvest_zone = 'mercury'  # Default to Mercury
        
        # Structures: {building_id: count} - no longer zone-specific
        self.structures = {}
        
        # Zone metal remaining and mass tracking
        self.zone_metal_remaining = {}
        zones = self.data_loader.load_orbital_mechanics()
        for zone in zones:
            zone_id = zone['id']
            # Dyson zone has no metal or mass (special zone)
            if zone.get('is_dyson_zone', False):
                self.zone_metal_remaining[zone_id] = 0
                self.zone_mass_remaining[zone_id] = 0
                self.zone_slag_produced[zone_id] = 0.0
            else:
                metal_limit = self.data_loader.get_zone_metal_limit(zone_id)
                self.zone_metal_remaining[zone_id] = metal_limit
                # Total mass = metal + non-metal (from zone data)
                total_mass = zone.get('total_mass_kg', metal_limit)
                self.zone_mass_remaining[zone_id] = total_mass
                self.zone_slag_produced[zone_id] = 0.0  # Slag starts at 0, produced from mining
        
        # Zone depletion status
        self.zone_depleted = {zone_id: False for zone_id in self.zone_metal_remaining.keys()}
        
        # Zone-specific policies: {zoneId: {'mining_slider': 0-100, 'replication_slider': 0-100, 'construction_slider': 0-100}}
        # For Dyson zone: {'dyson_build_slider': 0-100, 'replication_slider': 0-100} (dyson_build_slider: 0 = all other, 100 = all dyson build)
        # Sliders: mining_slider (0 = all build, 100 = all mine), replication_slider (0 = all construct, 100 = all replicate)
        self.zone_policies = {}
        for zone in zones:
            zone_id = zone['id']
            if zone.get('is_dyson_zone', False):
                self.zone_policies[zone_id] = {'dyson_build_slider': 90, 'replication_slider': 100}  # Default: 90% dyson build, 100% replicate
            else:
                # All regular zones: 33% harvest, 66% build, 100% replicate, 0% structure
                self.zone_policies[zone_id] = {
                    'mining_slider': 33,  # 33% harvest, 66% build
                    'replication_slider': 100,  # 100% replicate, 0% construct (structure)
                    'construction_slider': 50  # Legacy compatibility
                }
        
        # Minimum probe threshold per zone: {zoneId: minimum_count}
        self.zone_min_probes = {zone_id: 0 for zone_id in self.zone_metal_remaining.keys()}
        
        # Research progress: {research_tree_id: {tier_id: {tranches_completed: int, enabled: bool}}}
        self.research = {}
        
        # Dyson sphere
        self.dyson_sphere_mass = 0.0
        self.dyson_sphere_target_mass = self.config.get('dyson_sphere_target_mass', Config.DYSON_SPHERE_TARGET_MASS)
        
        # Probe construction progress tracking: {probe_type: progress_in_kg}
        # Each probe is 100 kg, so progress tracks kg built toward next probe
        self.probe_construction_progress = {probe_type: 0.0 for probe_type in self.probes.keys()}
        
        # Zone-based replication progress: {zoneId: {probe_type: progress_in_kg}}
        # Tracks replication progress per zone so probes are added to correct zone
        self.zone_replication_progress = {}
        
        # Structure construction progress tracking: {building_id: progress_in_kg}
        # Tracks progress toward completing each structure being built
        self.structure_construction_progress = {}
        
        # Enabled construction: set of building_ids that are enabled for continuous construction
        self.enabled_construction = set()
        
        # Load initial research trees
        self._initialize_research()
        
        # Calculate initial dexterity from probes
        self.dexterity = self._calculate_dexterity()
        
        # Auto-allocate initial probes based on slider settings
        self._auto_allocate_probes()
    
    @classmethod
    def load_from_session(cls, session):
        """Load game engine from session."""
        engine = cls(session.id, session.game_config)
        
        if session.game_state:
            state = session.game_state
            engine.tick_count = state.get('tick', 0)
            engine.time = state.get('time', 0.0)
            engine.energy = state.get('energy', Config.INITIAL_ENERGY)
            engine.metal = state.get('metal', Config.INITIAL_METAL)
            engine.intelligence = state.get('intelligence', 0.0)
            engine.slag = state.get('slag', 0.0)
            engine.energy_stored = state.get('energy_stored', 0.0)
            engine.zone_slag_produced = state.get('zone_slag_produced', engine.zone_slag_produced)
            engine.zone_mass_remaining = state.get('zone_mass_remaining', engine.zone_mass_remaining)
            
            # Load probes - migrate from old format if needed
            saved_probes = state.get('probes', {})
            if saved_probes and isinstance(saved_probes, dict):
                # Migrate: convert all specialized probes to base 'probe' type
                total_probes = 0
                if 'probe' in saved_probes:
                    total_probes += saved_probes.get('probe', 0)
                # Add specialized probes to total (backward compatibility)
                for old_type in ['miner_probe', 'compute_probe', 'energy_probe', 'construction_probe']:
                    if old_type in saved_probes:
                        total_probes += saved_probes.get(old_type, 0)
                engine.probes['probe'] = total_probes
            # Otherwise, keep the initialized probes
            
            # Load probe allocations - ensure we have a valid dict
            saved_allocations = state.get('probe_allocations', {})
            if saved_allocations and isinstance(saved_allocations, dict):
                engine.probe_allocations = saved_allocations
            
            # Load probes by zone
            engine.probes_by_zone = state.get('probes_by_zone', engine.probes_by_zone)
            engine.probe_allocations_by_zone = state.get('probe_allocations_by_zone', engine.probe_allocations_by_zone)
            
            # Load probe construction progress
            saved_progress = state.get('probe_construction_progress', {})
            if saved_progress and isinstance(saved_progress, dict):
                engine.probe_construction_progress = saved_progress
            else:
                # Initialize if not present
                engine.probe_construction_progress = {probe_type: 0.0 for probe_type in engine.probes.keys()}
            # Otherwise, keep the initialized allocations
            
            # Load zone replication progress
            saved_zone_replication = state.get('zone_replication_progress', {})
            if saved_zone_replication and isinstance(saved_zone_replication, dict):
                engine.zone_replication_progress = saved_zone_replication
            else:
                engine.zone_replication_progress = {}
            
            # Load structure construction progress
            saved_structure_progress = state.get('structure_construction_progress', {})
            if saved_structure_progress and isinstance(saved_structure_progress, dict):
                engine.structure_construction_progress = saved_structure_progress
            else:
                engine.structure_construction_progress = {}
            
            # Load enabled construction
            saved_enabled = state.get('enabled_construction', [])
            if saved_enabled and isinstance(saved_enabled, list):
                engine.enabled_construction = set(saved_enabled)
            else:
                engine.enabled_construction = set()
            
            # Load structures - ensure we have a valid dict
            saved_structures = state.get('structures', {})
            if saved_structures and isinstance(saved_structures, dict):
                engine.structures = saved_structures
            # Otherwise, keep the initialized structures
            
            # Load structures by zone
            engine.structures_by_zone = state.get('structures_by_zone', engine.structures_by_zone)
            
            engine.zone_metal_remaining = state.get('zone_metal_remaining', engine.zone_metal_remaining)
            engine.zone_depleted = state.get('zone_depleted', engine.zone_depleted)
            engine.zone_policies = state.get('zone_policies', engine.zone_policies)
            engine.zone_min_probes = state.get('zone_min_probes', engine.zone_min_probes)
            engine.research = state.get('research', engine.research)
            engine.dyson_sphere_mass = state.get('dyson_sphere_mass', 0.0)
            engine.factory_production = state.get('factory_production', {})
            engine.economy_slider = state.get('economy_slider', 67)
            engine.mine_build_slider = state.get('mine_build_slider', 50)
            engine.build_allocation = state.get('build_allocation', 100)
            engine.dyson_power_allocation = state.get('dyson_power_allocation', 0)
            engine.harvest_zone = state.get('harvest_zone', 'mercury')
            
            # Recalculate dexterity from current probes (don't use saved value)
            engine.dexterity = engine._calculate_dexterity()
        
        return engine
    
    def _initialize_research(self):
        """Initialize research trees."""
        research_trees = self.data_loader.get_all_research_trees()
        for tree_id, tree_data in research_trees.items():
            self.research[tree_id] = {}
            if 'tiers' in tree_data:
                for tier in tree_data['tiers']:
                    tier_id = tier['id']
                    self.research[tree_id][tier_id] = {
                        'tranches_completed': 0,
                        'progress': 0.0,  # Cumulative progress in FLOP-days
                        'enabled': False,
                        'start_time': None,  # Time when research started (in days)
                        'completion_time': None  # Time when research completed (in days)
                    }
    
    def _get_research_tree(self, skill_category):
        """Get research tree data for a skill category."""
        return self.data_loader.get_research_tree(skill_category)
    
    def _calculate_research_bonus(self, skill_category, skill_name=None):
        """Calculate total bonus from research for a skill category.
        
        Uses exponential compounding system:
        - During research: bonus = base_bonus * e^(0.20 * time_in_days)
        - When tier completes: principal doubles, then continues: bonus = (base_bonus * 2) * e^(0.20 * time_since_completion)
        - Each tier compounds independently and continuously
        - Tiers compound multiplicatively: total_bonus = tier1_bonus * tier2_bonus * ...
        
        Args:
            skill_category: Research tree ID (e.g., 'propulsion_systems', 'computer_processing')
            skill_name: Unused, kept for compatibility
        
        Returns:
            Total bonus multiplier (multiplicative product of all tier bonuses)
        """
        import math
        
        total_bonus_multiplier = 1.0  # Start with 1.0 for multiplicative compounding
        research_tree = self._get_research_tree(skill_category)
        
        if not research_tree:
            return 0.0  # No bonus if no research tree
        
        # All trees are now regular (no subcategory handling needed)
        if 'tiers' in research_tree:
            for tier in research_tree['tiers']:
                tier_id = tier['id']
                progress = self.research.get(skill_category, {}).get(tier_id, {})
                tranches_completed = progress.get('tranches_completed', 0)
                is_complete = tranches_completed >= tier['tranches']
                start_time = progress.get('start_time')
                completion_time = progress.get('completion_time')
                
                if start_time is not None:
                    base_bonus = tier.get('total_bonus', 0.0)
                    time_elapsed_days = self.time - start_time
                    
                    if is_complete and completion_time is not None:
                        # Tier completed: principal doubles, then continues compounding
                        time_since_completion_days = self.time - completion_time
                        # Base bonus doubles on completion
                        effective_base = base_bonus * 2.0
                        # Continue compounding from completion time
                        tier_bonus = effective_base * math.exp(0.20 * time_since_completion_days)
                    else:
                        # During research: compound continuously
                        tier_bonus = base_bonus * math.exp(0.20 * time_elapsed_days)
                    
                    # Multiplicative compounding: multiply by (1 + tier_bonus)
                    total_bonus_multiplier *= (1.0 + tier_bonus)
        
        # Return the additive bonus (multiplier - 1.0) to match existing API
        return total_bonus_multiplier - 1.0
    
    def get_base_skill_value(self, skill_category, skill_name=None):
        """Get base skill value before research modifiers.
        
        Args:
            skill_category: Skill category ID (e.g., 'propulsion_systems', 'computer_processing')
            skill_name: Unused, kept for compatibility
        
        Returns:
            Base skill value
        """
        from backend.config import Config
        
        # Base values for different skill categories
        base_values = {
            'propulsion_systems': Config.BASE_PROPULSION_ISP,  # specific impulse in seconds
            'locomotion_systems': 1.0,  # efficiency multiplier
            'acds': 1.0,  # efficiency multiplier
            'robotic_systems': 1.0,  # efficiency multiplier
            # Computer trees are now top-level
            'computer_processing': 1.0,  # processing power multiplier
            'computer_gpu': 1.0,  # GPU compute multiplier
            'computer_interconnect': 1.0,  # interconnect bandwidth multiplier
            'computer_interface': 1.0,  # interface efficiency multiplier
            'production_efficiency': 1.0,  # production rate multiplier
            'recycling_efficiency': 0.75,  # base recycling efficiency (75%)
            'energy_collection': 1.0,  # energy collection efficiency multiplier
            'solar_concentrators': 1.0,  # solar concentration multiplier
            'energy_storage': 1.0,  # storage capacity multiplier
            'energy_transport': 1.0,  # transport efficiency multiplier
            'energy_conversion': 1.0,  # energy conversion efficiency multiplier
            'dyson_swarm_construction': 1.0,  # construction rate multiplier
        }
        
        return base_values.get(skill_category, 1.0)
    
    def get_skill_value(self, skill_category, skill_name=None):
        """Get effective skill value with research bonuses applied.
        
        Args:
            skill_category: Skill category ID (e.g., 'propulsion_systems', 'computer_processing')
            skill_name: Unused, kept for compatibility
        
        Returns:
            Effective skill value (base * (1 + bonus))
        """
        base_value = self.get_base_skill_value(skill_category, skill_name)
        research_bonus = self._calculate_research_bonus(skill_category, skill_name)
        return base_value * (1.0 + research_bonus)
    
    def get_compute_power(self):
        """Calculate effective compute power from computer trees.
        
        Uses geometric mean: compute = (processing × gpu × interconnect × interface)^0.25
        
        Returns:
            Effective compute power multiplier
        """
        # Computer trees are now top-level trees
        processing = self.get_skill_value('computer_processing')
        gpu = self.get_skill_value('computer_gpu')
        interconnect = self.get_skill_value('computer_interconnect')
        interface = self.get_skill_value('computer_interface')
        
        # Geometric mean
        compute_power = (processing * gpu * interconnect * interface) ** 0.25
        return compute_power
    
    def calculate_probe_count_scaling_penalty(self, probe_count, zone_id=None):
        """Calculate probe count scaling penalty (diminishing returns for probe count within a zone).
        
        Each doubling of probe count reduces efficiency.
        Formula: efficiency = (1 - penalty_per_doubling)^log2(probe_count)
        
        The penalty_per_doubling is interpolated based on compute skill:
        - At base compute (1.0): 40% penalty per doubling (so doubling only gives 20% more output)
        - At max compute (3.18x): 1% penalty per doubling (so doubling gives ~98% more output)
        
        Args:
            probe_count: Total number of probes in the zone
            zone_id: Zone identifier (optional, for future per-zone adjustments)
        
        Returns:
            Efficiency factor (0-1), where 1 = no penalty
        """
        # No penalty for 0 or 1 probe
        if probe_count <= 1:
            return 1.0
        
        # Load probe count scaling parameters from economic rules
        economic_rules = self.data_loader.load_economic_rules()
        probe_count_scaling = economic_rules.get('probe_count_scaling', {})
        
        base_penalty = probe_count_scaling.get('base_penalty_per_doubling', 0.0)
        min_penalty = probe_count_scaling.get('min_penalty_per_doubling', 0.0)
        compute_threshold = probe_count_scaling.get('compute_skill_threshold', 3.18)
        
        # Get compute skill (geometric mean of cpu, gpu, interconnect, io_bandwidth)
        compute_skill = self.get_compute_power()
        
        # Interpolate penalty per doubling based on compute skill
        # At compute 1.0: use base penalty (40%)
        # At compute >= threshold: use min penalty (1%)
        # Linear interpolation between them
        normalized_compute = min(1.0, max(0, (compute_skill - 1.0) / (compute_threshold - 1.0)))
        penalty_per_doubling = base_penalty - (base_penalty - min_penalty) * normalized_compute
        
        # Calculate number of doublings: log2(probeCount)
        doublings = math.log2(probe_count)
        
        # Efficiency = (1 - penalty)^doublings
        efficiency_per_doubling = 1.0 - penalty_per_doubling
        efficiency = math.pow(efficiency_per_doubling, doublings)
        
        # Clamp to reasonable minimum (0.1% efficiency minimum)
        return max(0.001, efficiency)
    
    def calculate_global_replication_scaling_penalty(self):
        """Calculate global replication scaling penalty (diminishing returns for total probe count).
        
        After threshold, each order of magnitude (10x) growth halves replication rate.
        Formula: efficiency = halving_factor^max(0, log10(totalProbes) - log10(threshold))
        
        At 1e12 threshold with 0.5 halving factor:
        - At 1e12: efficiency = 1.0 (no penalty)
        - At 1e13: efficiency = 0.5 (50% rate)
        - At 1e14: efficiency = 0.25 (25% rate)
        - At 5e12: efficiency ≈ 0.62 (smooth interpolation)
        
        Returns:
            Efficiency factor (0-1), where 1 = no penalty
        """
        # Calculate total probes across all zones
        total_probes = 0
        for zone_id, zone_probes in self.probes_by_zone.items():
            for probe_type, count in zone_probes.items():
                total_probes += count
        
        # Load global replication scaling parameters from economic rules
        economic_rules = self.data_loader.load_economic_rules()
        global_scaling = economic_rules.get('global_replication_scaling', {})
        
        threshold = global_scaling.get('threshold', 1e12)
        halving_factor = global_scaling.get('halving_factor', 0.5)
        
        # No penalty if below threshold
        if total_probes <= threshold:
            return 1.0
        
        # Calculate orders of magnitude above threshold
        threshold_log = math.log10(threshold)
        current_log = math.log10(total_probes)
        orders_above_threshold = current_log - threshold_log
        
        # Efficiency = halving_factor^ordersAboveThreshold
        efficiency = math.pow(halving_factor, orders_above_threshold)
        
        # Clamp to reasonable minimum (0.01% efficiency minimum)
        return max(0.0001, efficiency)
    
    def get_dyson_target_mass(self):
        """Calculate effective Dyson sphere target mass with research modifiers.
        
        Base target mass: 5e24 kg
        Research modifiers can reduce the required mass.
        
        Returns:
            Effective target mass in kg
        """
        from backend.config import Config
        base_target_mass = Config.DYSON_SPHERE_TARGET_MASS  # 5e24 kg
        
        # Research modifiers can reduce the required mass
        # (e.g., better construction techniques, more efficient materials)
        dyson_construction_bonus = self._calculate_research_bonus('dyson_swarm_construction')
        
        # Mass reduction: 10% reduction per 100% bonus (example formula)
        # Adjust this formula as needed for game balance
        mass_reduction = min(0.5, dyson_construction_bonus * 0.1)  # Cap at 50% reduction
        effective_mass = base_target_mass * (1.0 - mass_reduction)
        
        return effective_mass
    
    def get_dyson_energy_production(self):
        """Calculate energy production from Dyson sphere mass.
        
        Base production: 5 kW per kg of Dyson sphere mass
        From: 5 kW/m² / 1 kg/m² = 5 kW/kg
        
        Returns:
            Energy production in watts
        """
        from backend.config import Config
        
        # Base production: 5 kW per kg of Dyson sphere mass
        base_energy_per_kg = Config.DYSON_POWER_PER_KG  # 5000 watts per kg
        
        # Calculate base energy production
        base_production = self.dyson_sphere_mass * base_energy_per_kg
        
        # Apply energy collection skill modifiers
        energy_collection_bonus = self._calculate_research_bonus('energy_collection')
        solar_concentrators_bonus = self._calculate_research_bonus('solar_concentrators')
        
        # Sum bonuses (they're multipliers, so additive)
        total_bonus = energy_collection_bonus + solar_concentrators_bonus
        effective_production = base_production * (1.0 + total_bonus)
        
        return effective_production
    
    def get_state(self):
        """Get current game state as dictionary."""
        # Calculate current rates for display
        from backend.config import Config
        energy_production_rate = self._calculate_energy_production() + Config.CONSTANT_ENERGY_SUPPLY  # Include base supply
        energy_consumption_rate = self._calculate_energy_consumption()
        metal_production_rate, _ = self._calculate_metal_production()
        intelligence_production_rate = self._calculate_intelligence_production()
        probe_production_rates, _, factory_metal_cost_per_probe = self._calculate_probe_production()
        probe_production_rate = sum(probe_production_rates.values())  # Total probe production rate
        dyson_construction_rate = self._calculate_dyson_construction_rate()
        
        # Calculate actual metal consumption rates (only what's actually being consumed)
        probe_metal_consumption = 0.0
        for probe_type, rate in probe_production_rates.items():
            if rate > 0:
                if probe_type == 'probe' and factory_metal_cost_per_probe > 0:
                    metal_cost_per_probe = factory_metal_cost_per_probe
                else:
                    probe_data = self._get_probe_data(probe_type)
                    metal_cost_per_probe = Config.PROBE_MASS
                    if probe_data:
                        metal_cost_per_probe = probe_data.get('base_cost_metal', Config.PROBE_MASS)
                probe_metal_consumption += rate * metal_cost_per_probe
        
        dyson_metal_consumption = dyson_construction_rate * 0.5  # 50% efficiency
        
        # Structure metal consumption - only if structures are actually being built
        structure_metal_consumption = 0.0
        if len(self.structure_construction_progress) > 0:
            construct_allocation = self.probe_allocations.get('construct', {})
            constructing_probes = sum(construct_allocation.values())
            build_allocation = getattr(self, 'build_allocation', 100)
            structure_building_fraction = 1.0 - (build_allocation / 100.0)
            structure_building_probes = constructing_probes * structure_building_fraction
            if structure_building_probes > 0:
                structure_metal_consumption = structure_building_probes * Config.PROBE_BUILD_RATE
        
        total_metal_consumption = probe_metal_consumption + dyson_metal_consumption + structure_metal_consumption
        
        # Calculate resource breakdowns for tooltips
        resource_breakdowns = self._calculate_resource_breakdowns()
        
        # Calculate research allocation info (FLOPS per enabled project)
        research_allocation_info = self._calculate_research_allocation_info()
        
        # Calculate idle probes (probes that can't work due to metal constraints)
        idle_probes_info = self._calculate_idle_probes()
        
        return {
            'tick': self.tick_count,
            'time': self.time,
            'energy': self.energy,
            'metal': self.metal,
            'intelligence': self.intelligence,
            'dexterity': self.dexterity,
            'slag': self.slag,
            'energy_stored': self.energy_stored,
            'energy_storage_capacity': self._calculate_energy_storage_capacity(),
            'probes': self.probes,
            'probes_by_zone': self.probes_by_zone,
            'probe_allocations': self.probe_allocations,
            'probe_allocations_by_zone': self.probe_allocations_by_zone,
            'probe_construction_progress': self.probe_construction_progress,
            'structure_construction_progress': self.structure_construction_progress,
            'enabled_construction': list(self.enabled_construction),
            'structures': self.structures,
            'structures_by_zone': self.structures_by_zone,
            'zone_metal_remaining': self.zone_metal_remaining,
            'zone_depleted': self.zone_depleted,
            'zone_policies': self.zone_policies,
            'zone_min_probes': self.zone_min_probes,
            'research': self.research,
            'dyson_sphere_mass': self.dyson_sphere_mass,
            'dyson_sphere_target_mass': self.get_dyson_target_mass(),  # Use dynamic target mass with research modifiers
            'dyson_sphere_progress': self.dyson_sphere_mass / self.get_dyson_target_mass() if self.get_dyson_target_mass() > 0 else 0,
            'factory_production': self.factory_production,
            'economy_slider': self.economy_slider,
            'mine_build_slider': self.mine_build_slider,
            'build_allocation': self.build_allocation,
            'dyson_power_allocation': self.dyson_power_allocation,
            'harvest_zone': self.harvest_zone,
            'energy_production_rate': energy_production_rate,
            'energy_consumption_rate': energy_consumption_rate,
            'metal_production_rate': metal_production_rate,
            'metal_consumption_rate': total_metal_consumption,
            'structure_metal_consumption_rate': structure_metal_consumption,
            'intelligence_production_rate': intelligence_production_rate,
            'probe_production_rate': probe_production_rate,
            'dyson_construction_rate': dyson_construction_rate,
            'resource_breakdowns': resource_breakdowns,
            'research_allocation_info': research_allocation_info,
            'idle_probes': idle_probes_info,
            'is_energy_limited': getattr(self, 'is_energy_limited', False),
            'is_metal_limited': getattr(self, 'is_metal_limited', False)
        }
    
    def get_time(self):
        """Get current game time in seconds."""
        return self.time
    
    def get_total_metal_remaining(self):
        """Get total metal remaining across all zones."""
        return sum(self.zone_metal_remaining.values())
    
    def tick(self, delta_time):
        """Advance game simulation by one tick.
        
        DEPRECATED: This method should NOT be called during runtime gameplay.
        All game ticks now run locally in JavaScript. Python GameEngine is only
        used for initialization to generate the initial game state.
        """
        warnings.warn(
            "GameEngine.tick() is deprecated. Game ticks now run locally in JavaScript. "
            "Python GameEngine is only used for initialization.",
            DeprecationWarning,
            stacklevel=2
        )
        self.tick_count += 1
        self.time += delta_time
        
        # Note: Research update will be done after we calculate effective intelligence rate
        
        # Calculate base production and consumption rates (before energy throttling)
        energy_production = self._calculate_energy_production()
        base_metal_rate, zone_depletion = self._calculate_metal_production()
        base_probe_rate, idle_probes_build, factory_metal_cost_per_probe = self._calculate_probe_production()
        theoretical_intelligence_rate = self._calculate_intelligence_production()
        base_dyson_construction_rate = self._calculate_dyson_construction_rate()
        
        # Calculate energy consumption for non-compute activities
        non_compute_energy_consumption = self._calculate_non_compute_energy_consumption()
        
        # Calculate theoretical compute production (based on Dyson power allocation slider)
        theoretical_intelligence_flops = self._calculate_intelligence_production()
        
        # Calculate compute demand (what research projects want)
        compute_demand_flops = self._calculate_compute_demand()
        
        # Energy system: constant supply + production - consumption
        from backend.config import Config
        constant_supply = Config.CONSTANT_ENERGY_SUPPLY
        total_energy_available = constant_supply + energy_production
        
        # Calculate effective intelligence production based on available energy
        # First, calculate available energy for compute (before compute consumption)
        available_energy_for_compute = total_energy_available - non_compute_energy_consumption
        available_energy_for_compute = max(0, available_energy_for_compute)  # Can't be negative
        
        # Calculate effective compute (limited by energy)
        intelligence_rate = self._calculate_effective_intelligence_production(available_energy_for_compute)
        
        # Compute energy consumption is based on effective compute (what we're actually producing)
        compute_energy_consumption = 0.0
        if intelligence_rate > 0:
            # Calculate energy needed for effective compute (1 kW per PFLOPS/s, modified by research)
            compute_pflops = intelligence_rate / 1e15
            base_compute_power_draw = compute_pflops * 1000  # 1000W = 1 kW per PFLOPS/s
            # Use compute power from computer trees (geometric mean of processing, gpu, interconnect, interface)
            compute_efficiency = self.get_compute_power()
            compute_energy_consumption = base_compute_power_draw / compute_efficiency if compute_efficiency > 0 else base_compute_power_draw
        
        # Total energy consumption
        energy_consumption = non_compute_energy_consumption + compute_energy_consumption
        net_energy_available = total_energy_available - energy_consumption
        
        # Calculate energy storage capacity
        storage_capacity = self._calculate_energy_storage_capacity()
        
        # Convert net energy (watts) to watt-days for storage
        # net_energy_available is in watts, delta_time is in days
        # So net_watt_days = watts * days = watt-days
        net_watt_days = net_energy_available * delta_time
        
        # Handle energy storage
        if net_watt_days > 0:
            # Excess energy - add to storage (capped at capacity)
            self.energy_stored = min(storage_capacity, self.energy_stored + net_watt_days)
        else:
            # Energy deficit - draw from storage first
            energy_deficit_watt_days = abs(net_watt_days)
            if self.energy_stored >= energy_deficit_watt_days:
                # Storage can cover the deficit
                self.energy_stored -= energy_deficit_watt_days
                net_energy_available = 0  # Deficit fully covered
            else:
                # Storage can only partially cover the deficit
                net_energy_available = -(energy_deficit_watt_days - self.energy_stored)  # Remaining deficit in watts
                self.energy_stored = 0
        
        # Clamp storage to capacity (safety check)
        self.energy_stored = max(0.0, min(storage_capacity, self.energy_stored))
        
        # Calculate energy throttle factor if there's still a shortfall after storage
        energy_throttle = 1.0
        if net_energy_available < 0:
            # Energy shortfall - throttle all activities proportionally
            if energy_consumption > 0:
                energy_throttle = max(0.0, total_energy_available / energy_consumption)
            else:
                energy_throttle = 0.0
        
        # Store net available energy for display (but it's not accumulated)
        self.energy = max(0, net_energy_available)
        
        # Update research progress with effective intelligence rate (limited by energy)
        self._update_research(delta_time, intelligence_rate)
        
        # Apply energy throttling to all activities first
        metal_rate = base_metal_rate * energy_throttle
        probe_rate_after_energy = {pt: rate * energy_throttle for pt, rate in base_probe_rate.items()}
        dyson_construction_rate_after_energy = base_dyson_construction_rate * energy_throttle
        
        # Calculate metal consumption rates (before metal throttling)
        # Probe construction metal consumption (use factory metal cost if factories are producing)
        probe_metal_consumption_rate = 0.0
        for probe_type, rate in probe_rate_after_energy.items():
            if rate > 0:
                # Use factory metal cost for factory-produced probes, otherwise use probe cost
                if probe_type == 'probe' and factory_metal_cost_per_probe > 0:
                    metal_cost_per_probe = factory_metal_cost_per_probe
                else:
                    probe_data = self._get_probe_data(probe_type)
                    metal_cost_per_probe = Config.PROBE_MASS
                    if probe_data:
                        metal_cost_per_probe = probe_data.get('base_cost_metal', Config.PROBE_MASS)
                probe_metal_consumption_rate += rate * metal_cost_per_probe
        
        # Dyson construction metal consumption will be calculated later
        # when we know the actual build rate from structure allocation
        dyson_metal_consumption_rate = 0.0
        
        # Structure construction metal consumption - only count if structures are actually being built
        structure_metal_consumption_rate = 0.0
        if len(self.structure_construction_progress) > 0:
            # Calculate structure building rate from probes allocated to structures
            construct_allocation = self.probe_allocations.get('construct', {})
            constructing_probes = sum(construct_allocation.values())
            build_allocation = getattr(self, 'build_allocation', 100)
            structure_building_fraction = 1.0 - (build_allocation / 100.0)
            structure_building_probes = constructing_probes * structure_building_fraction
            if structure_building_probes > 0:
                # Base build rate: 10.0 kg/day per probe
                structure_construction_rate_kg_s = structure_building_probes * Config.PROBE_BUILD_RATE
                # Apply energy throttling
                structure_construction_rate_kg_s = structure_construction_rate_kg_s * energy_throttle
                structure_metal_consumption_rate = structure_construction_rate_kg_s
        
        # Calculate net metal rate (production - consumption)
        total_metal_consumption_rate = probe_metal_consumption_rate + dyson_metal_consumption_rate + structure_metal_consumption_rate
        net_metal_rate = metal_rate - total_metal_consumption_rate
        
        # Calculate metal throttle factor if there's a shortfall
        metal_throttle = 1.0
        is_metal_limited = False
        if self.metal <= 0 and net_metal_rate < 0:
            # Metal shortfall: no stored metal and consumption > production
            # Throttle production activities proportionally
            if total_metal_consumption_rate > 0:
                metal_throttle = max(0.0, metal_rate / total_metal_consumption_rate)
                is_metal_limited = True
            else:
                metal_throttle = 0.0
                is_metal_limited = True
        
        # Apply metal throttling to production activities
        probe_rate = {pt: rate * metal_throttle for pt, rate in probe_rate_after_energy.items()}
        # Dyson construction rate will be calculated from structure build rate allocation
        # (calculated later in the structure building section)
        dyson_construction_rate = 0.0
        
        # Update metal stockpile: add production only
        # Note: Consumption (for probes, Dyson, structures) is handled incrementally
        # in their respective construction sections to ensure accurate progress tracking.
        # Consumption rates above are still needed for throttling calculations.
        self.metal += metal_rate * delta_time
        self.metal = max(0, self.metal)  # Ensure metal doesn't go below 0
        
        # Store throttling info for UI
        self.is_energy_limited = (energy_throttle < 1.0)
        self.is_metal_limited = is_metal_limited
        
        # Apply zone metal depletion (throttled by energy) and produce slag
        for zone_id, depletion_amount in zone_depletion.items():
            if zone_id in self.zone_metal_remaining:
                actual_depletion = depletion_amount * energy_throttle * delta_time
                # Reduce metal remaining
                self.zone_metal_remaining[zone_id] -= actual_depletion
                self.zone_metal_remaining[zone_id] = max(0, self.zone_metal_remaining[zone_id])
                
                # Mass and slag are already updated in _calculate_metal_production
                # Just ensure zone_mass_remaining is reduced here for consistency
                if zone_id in self.zone_mass_remaining:
                    zones = self.data_loader.load_orbital_mechanics()
                    zone_data = next((z for z in zones if z['id'] == zone_id), None)
                    if zone_data and not zone_data.get('is_dyson_zone', False):
                        metal_percentage = zone_data.get('metal_percentage', 0.32)
                        if metal_percentage > 0:
                            total_mass_mined = actual_depletion / metal_percentage
                            self.zone_mass_remaining[zone_id] -= total_mass_mined
                            self.zone_mass_remaining[zone_id] = max(0, self.zone_mass_remaining[zone_id])
        
        # Update probe construction with incremental progress tracking
        # Calculate probe building rate from probes allocated to construct
        construct_allocation = self.probe_allocations.get('construct', {})
        constructing_probes = sum(construct_allocation.values())
        build_allocation = getattr(self, 'build_allocation', 100)  # 0 = all structures, 100 = all probes
        probe_building_fraction = build_allocation / 100.0
        probe_building_probes = constructing_probes * probe_building_fraction
        
        # Base build rate: 10.0 kg/day per probe
        # Apply skill multipliers for building rate: locomotion, attitude control, robotics
        locomotion_multiplier = self.get_skill_value('locomotion_systems')
        acds_multiplier = self.get_skill_value('acds')
        robotics_multiplier = self.get_skill_value('robotic_systems')
        building_skill_multiplier = locomotion_multiplier * acds_multiplier * robotics_multiplier
        
        base_probe_build_rate_kg_s = probe_building_probes * Config.PROBE_BUILD_RATE * building_skill_multiplier
        
        # Apply energy throttling
        probe_build_rate_kg_s = base_probe_build_rate_kg_s * energy_throttle
        
        # Apply metal throttling
        probe_build_rate_kg_s = probe_build_rate_kg_s * metal_throttle
        
        # Distribute building across probe types based on factory production and manual building
        # For now, prioritize factory production, then use remaining capacity for manual building
        total_factory_metal_needed = 0.0
        for probe_type, rate in probe_rate.items():
            if rate > 0:
                if probe_type == 'probe' and factory_metal_cost_per_probe > 0:
                    metal_cost_per_probe = factory_metal_cost_per_probe
                else:
                    probe_data = self._get_probe_data(probe_type)
                    metal_cost_per_probe = Config.PROBE_MASS
                    if probe_data:
                        metal_cost_per_probe = probe_data.get('base_cost_metal', Config.PROBE_MASS)
                total_factory_metal_needed += rate * metal_cost_per_probe
        
        # Manual probe building (probes building other probes)
        manual_probe_build_rate_kg_s = max(0, probe_build_rate_kg_s - total_factory_metal_needed)
        
        # Update probe construction for factory production - zone-based
        # Factories produce probes in the zone where they're located
        for probe_type, rate in probe_rate.items():
            if rate > 0:
                # Use factory metal cost for factory-produced probes, otherwise use probe cost
                if probe_type == 'probe' and factory_metal_cost_per_probe > 0:
                    metal_cost_per_probe = factory_metal_cost_per_probe
                else:
                    probe_data = self._get_probe_data(probe_type)
                    metal_cost_per_probe = Config.PROBE_MASS
                    if probe_data:
                        metal_cost_per_probe = probe_data.get('base_cost_metal', Config.PROBE_MASS)
                
                # Calculate construction progress in kg/s (rate is in probes/s)
                construction_rate_kg_s = rate * metal_cost_per_probe
                
                # Distribute factory production across zones based on where factories are located
                zones = self.data_loader.load_orbital_mechanics()
                total_factory_capacity = 0.0
                zone_factory_capacity = {}
                
                # Calculate factory capacity per zone
                for zone in zones:
                    zone_id = zone['id']
                    # Allow factories in Dyson zone (but not mining structures)
                    
                    zone_structures = self.structures_by_zone.get(zone_id, {})
                    zone_factory_rate = 0.0
                    
                    for building_id, count in zone_structures.items():
                        building = self.data_loader.get_building_by_id(building_id)
                        if building:
                            category = self._get_building_category(building_id)
                            if category == 'factories':
                                effects = building.get('effects', {})
                                probes_per_day = effects.get('probe_production_per_day', 0.0)
                                zone_factory_rate += probes_per_day * count
                    
                    if zone_factory_rate > 0:
                        zone_factory_capacity[zone_id] = zone_factory_rate * metal_cost_per_probe
                        total_factory_capacity += zone_factory_capacity[zone_id]
                
                # If we have zone-based factories, distribute production
                if total_factory_capacity > 0:
                    for zone_id, zone_capacity in zone_factory_capacity.items():
                        zone_share = zone_capacity / total_factory_capacity
                        zone_construction_rate_kg_s = construction_rate_kg_s * zone_share
                        
                        progress_this_tick = zone_construction_rate_kg_s * delta_time
                        
                        # Check if we have enough metal for this progress
                        if self.metal < progress_this_tick:
                            progress_this_tick = self.metal
                        
                        # Use zone-specific progress tracking for factories
                        progress_key = f'{probe_type}_{zone_id}'
                        if progress_key not in self.probe_construction_progress:
                            self.probe_construction_progress[progress_key] = 0.0
                        
                        self.probe_construction_progress[progress_key] += progress_this_tick
                        self.metal -= progress_this_tick
                        self.metal = max(0, self.metal)
                        
                        # Check if we've completed a probe in this zone
                        probes_built_this_tick = 0
                        while self.probe_construction_progress[progress_key] >= metal_cost_per_probe:
                            # Add probe to global count (legacy)
                            self.probes[probe_type] += 1
                            
                            # Add probe to the zone where the factory is located
                            if zone_id not in self.probes_by_zone:
                                self.probes_by_zone[zone_id] = {}
                            if probe_type not in self.probes_by_zone[zone_id]:
                                self.probes_by_zone[zone_id][probe_type] = 0
                            self.probes_by_zone[zone_id][probe_type] += 1
                            
                            self.probe_construction_progress[progress_key] -= metal_cost_per_probe
                            probes_built_this_tick += 1
                        
                        if probes_built_this_tick > 0:
                            self._auto_allocate_probes()
                else:
                    # Fallback: use global tracking if no zone-based factories
                    progress_this_tick = construction_rate_kg_s * delta_time
                    
                    # Check if we have enough metal for this progress
                    if self.metal < progress_this_tick:
                        progress_this_tick = self.metal
                    
                    # Add to construction progress
                    if probe_type not in self.probe_construction_progress:
                        self.probe_construction_progress[probe_type] = 0.0
                    
                    self.probe_construction_progress[probe_type] += progress_this_tick
                    self.metal -= progress_this_tick
                    self.metal = max(0, self.metal)
                    
                    # Check if we've completed a probe
                    probes_built_this_tick = 0
                    while self.probe_construction_progress[probe_type] >= metal_cost_per_probe:
                        self.probes[probe_type] += 1
                        self.probe_construction_progress[probe_type] -= metal_cost_per_probe
                        probes_built_this_tick += 1
                    
                    if probes_built_this_tick > 0:
                        self._auto_allocate_probes()
        
        # Manual probe building (probes building other probes) - zone-based replication
        if manual_probe_build_rate_kg_s > 0:
            # Default to building 'probe' type
            probe_type = 'probe'
            probe_data = self._get_probe_data(probe_type)
            metal_cost_per_probe = Config.PROBE_MASS
            if probe_data:
                metal_cost_per_probe = probe_data.get('base_cost_metal', Config.PROBE_MASS)
            
            # Get zone activities to determine which zones are replicating
            zone_activities = self._calculate_zone_activities()
            
            # Calculate total replication capacity across all zones
            total_replication_capacity = 0.0
            zone_replication_capacity = {}
            for zone_id, activities in zone_activities.items():
                replicate_count = activities.get('replicate', 0)
                if replicate_count > 0:
                    # Calculate dexterity capacity for replication in this zone
                    zone_probes = self.probes_by_zone.get(zone_id, {}).get('probe', 0)
                    if zone_probes > 0:
                        probe_data = self._get_probe_data('probe')
                        base_dexterity = probe_data.get('base_dexterity', 1.0) if probe_data else 1.0
                        zone_dexterity = zone_probes * base_dexterity
                        # Replication uses dexterity capacity (kg/s)
                        replication_capacity = replicate_count * Config.PROBE_BUILD_RATE
                        
                        # Apply probe count scaling penalty (diminishing returns per zone)
                        total_zone_probes = sum(self.probes_by_zone.get(zone_id, {}).values())
                        probe_count_scaling_efficiency = self.calculate_probe_count_scaling_penalty(total_zone_probes, zone_id)
                        replication_capacity *= probe_count_scaling_efficiency
                        
                        # Apply global replication scaling penalty (diminishing returns for total probe count)
                        global_scaling_efficiency = self.calculate_global_replication_scaling_penalty()
                        replication_capacity *= global_scaling_efficiency
                        
                        zone_replication_capacity[zone_id] = replication_capacity
                        total_replication_capacity += replication_capacity
            
            # Distribute manual build rate across zones proportionally
            if total_replication_capacity > 0:
                for zone_id, replication_capacity in zone_replication_capacity.items():
                    # Calculate this zone's share of the build rate
                    zone_share = replication_capacity / total_replication_capacity
                    zone_build_rate_kg_s = manual_probe_build_rate_kg_s * zone_share
                    
                    progress_this_tick = zone_build_rate_kg_s * delta_time
                    
                    # Check if we have enough metal
                    if self.metal < progress_this_tick:
                        progress_this_tick = self.metal
                    
                    # Initialize zone replication progress if needed
                    if zone_id not in self.zone_replication_progress:
                        self.zone_replication_progress[zone_id] = {}
                    if probe_type not in self.zone_replication_progress[zone_id]:
                        self.zone_replication_progress[zone_id][probe_type] = 0.0
                    
                    self.zone_replication_progress[zone_id][probe_type] += progress_this_tick
                    self.metal -= progress_this_tick
                    self.metal = max(0, self.metal)
                    
                    # Check if we've completed a probe in this zone
                    probes_built_this_tick = 0
                    while self.zone_replication_progress[zone_id][probe_type] >= metal_cost_per_probe:
                        # Add probe to global count (legacy)
                        self.probes[probe_type] += 1
                        
                        # Add probe to the zone where replication occurred
                        if zone_id not in self.probes_by_zone:
                            self.probes_by_zone[zone_id] = {}
                        if probe_type not in self.probes_by_zone[zone_id]:
                            self.probes_by_zone[zone_id][probe_type] = 0
                        self.probes_by_zone[zone_id][probe_type] += 1
                        
                        self.zone_replication_progress[zone_id][probe_type] -= metal_cost_per_probe
                        probes_built_this_tick += 1
                    
                    if probes_built_this_tick > 0:
                        self._auto_allocate_probes()
            else:
                # Fallback: use old method if no zone replication capacity
                progress_this_tick = manual_probe_build_rate_kg_s * delta_time
                
                # Check if we have enough metal
                if self.metal < progress_this_tick:
                    progress_this_tick = self.metal
                
                if probe_type not in self.probe_construction_progress:
                    self.probe_construction_progress[probe_type] = 0.0
                
                self.probe_construction_progress[probe_type] += progress_this_tick
                self.metal -= progress_this_tick
                self.metal = max(0, self.metal)
                
                # Check if we've completed a probe
                probes_built_this_tick = 0
                while self.probe_construction_progress[probe_type] >= metal_cost_per_probe:
                    self.probes[probe_type] += 1
                    self.probe_construction_progress[probe_type] -= metal_cost_per_probe
                    probes_built_this_tick += 1
                
                if probes_built_this_tick > 0:
                    self._auto_allocate_probes()
        
        # Structure building (probes building structures using 10.0 kg/day per probe)
        # Note: In Dyson zone, probes allocated to "construct" only build structures (not Dyson)
        # Dyson construction uses probes allocated to "dyson" activity (via Dyson slider)
        structure_building_fraction = 1.0 - (build_allocation / 100.0)
        structure_building_probes = constructing_probes * structure_building_fraction
        
        # Calculate total structure build rate
        # Apply skill multipliers for building rate: locomotion, attitude control, robotics
        locomotion_multiplier = self.get_skill_value('locomotion_systems')
        acds_multiplier = self.get_skill_value('acds')
        robotics_multiplier = self.get_skill_value('robotic_systems')
        building_skill_multiplier = locomotion_multiplier * acds_multiplier * robotics_multiplier
        
        base_structure_build_rate_kg_s = structure_building_probes * Config.PROBE_BUILD_RATE * building_skill_multiplier
        structure_build_rate_kg_s = base_structure_build_rate_kg_s * energy_throttle * metal_throttle
        
        # Use structure build rate for building construction (only structures, not Dyson)
        if structure_build_rate_kg_s > 0 and len(self.enabled_construction) > 0:
            # Get enabled buildings that are in progress or need to be started
            enabled_buildings = []
            for building_id in self.enabled_construction:
                building = self.data_loader.get_building_by_id(building_id)
                if not building:
                    continue
                
                cost_metal = building.get('base_cost_metal', 0)
                if cost_metal <= 0:
                    continue
                
                # Get current progress (0 if not started)
                progress = self.structure_construction_progress.get(building_id, 0.0)
                enabled_buildings.append({
                    'building_id': building_id,
                    'building': building,
                    'cost_metal': cost_metal,
                    'progress': progress
                })
            
            if enabled_buildings:
                # Divide production pool equally across all enabled buildings
                num_enabled = len(enabled_buildings)
                build_rate_per_building = structure_build_rate_kg_s / num_enabled
                
                # Build all enabled buildings simultaneously
                for building_info in enabled_buildings:
                    building_id = building_info['building_id']
                    building = building_info['building']
                    cost_metal = building_info['cost_metal']
                    progress = building_info['progress']
                    
                    remaining_to_build = cost_metal - progress
                    if remaining_to_build > 0:
                        progress_this_tick = min(build_rate_per_building * delta_time, remaining_to_build)
                        
                        # Check if we have enough metal
                        if self.metal < progress_this_tick:
                            progress_this_tick = self.metal
                        
                        if progress_this_tick > 0:
                            if building_id not in self.structure_construction_progress:
                                self.structure_construction_progress[building_id] = 0.0
                            self.structure_construction_progress[building_id] += progress_this_tick
                            self.metal -= progress_this_tick
                            self.metal = max(0, self.metal)
                            
                            # Check if structure is complete
                            if self.structure_construction_progress[building_id] >= cost_metal:
                                # Complete the structure
                                if building_id not in self.structures:
                                    self.structures[building_id] = 0
                                self.structures[building_id] += 1
                                
                                # If still enabled, start next one immediately
                                if building_id in self.enabled_construction:
                                    self.structure_construction_progress[building_id] = 0.0
                                else:
                                    # Not enabled anymore, remove from progress
                                    del self.structure_construction_progress[building_id]
            
            # Clean up invalid structures from progress
            structures_to_remove = []
            for building_id in list(self.structure_construction_progress.keys()):
                building = self.data_loader.get_building_by_id(building_id)
                if not building:
                    structures_to_remove.append(building_id)
                    continue
                cost_metal = building.get('base_cost_metal', 0)
                if cost_metal <= 0:
                    structures_to_remove.append(building_id)
                    continue
                
                # If disabled and not in progress (progress is 0), remove it
                if building_id not in self.enabled_construction:
                    progress = self.structure_construction_progress[building_id]
                    if progress <= 0:
                        # Not enabled and no progress, remove it
                        structures_to_remove.append(building_id)
            
            for building_id in structures_to_remove:
                if building_id in self.structure_construction_progress:
                    del self.structure_construction_progress[building_id]
        
        self.intelligence += intelligence_rate * delta_time
        
        # Recalculate dexterity
        self.dexterity = self._calculate_dexterity()
        
        # Update Dyson sphere construction (using probes allocated to "dyson" activity)
        # Get probes allocated to Dyson construction from zone activities
        zones = self.data_loader.load_orbital_mechanics()
        dyson_zone_id = None
        for zone in zones:
            if zone.get('is_dyson_zone', False):
                dyson_zone_id = zone['id']
                break
        
        # Calculate Dyson construction rate from probes allocated to "dyson" activity
        dyson_construction_rate_kg_s = 0.0
        if dyson_zone_id:
            zone_activities = self._calculate_zone_activities()
            dyson_activity = zone_activities.get(dyson_zone_id, {})
            dyson_probes = dyson_activity.get('dyson', 0)
            
            if dyson_probes > 0:
                # Apply Dyson construction skill multipliers
                dyson_construction_multiplier = self.get_skill_value('dyson_swarm_construction')
                # Also apply general building skills
                locomotion_multiplier = self.get_skill_value('locomotion_systems')
                acds_multiplier = self.get_skill_value('acds')
                robotics_multiplier = self.get_skill_value('robotic_systems')
                building_skill_multiplier = locomotion_multiplier * acds_multiplier * robotics_multiplier
                
                # Base rate: 10.0 kg/day per probe, modified by skills
                base_dyson_rate = dyson_probes * Config.PROBE_BUILD_RATE * dyson_construction_multiplier * building_skill_multiplier
                
                # Apply probe count scaling penalty (diminishing returns)
                total_dyson_zone_probes = sum(self.probes_by_zone.get(dyson_zone_id, {}).values())
                probe_count_scaling_efficiency = self.calculate_probe_count_scaling_penalty(total_dyson_zone_probes, dyson_zone_id)
                base_dyson_rate *= probe_count_scaling_efficiency
                
                # Apply throttling
                dyson_construction_rate_kg_s = base_dyson_rate * energy_throttle * metal_throttle
        
        idle_probes_dyson = self._update_dyson_sphere_construction(delta_time, dyson_construction_rate_kg_s)
        
        # Check zone depletion
        self._check_zone_depletion()
        
        # Recycle slag
        self._recycle_slag(delta_time)
    
    def _calculate_energy_production(self):
        """Calculate energy production rate.
        
        Includes:
        - Dyson sphere energy production (from mass × 5 kW/kg, modified by energy collection skills)
        - Structure energy production (power stations, data centers with integrated solar, etc.)
        
        Solar-powered structures (uses_solar: true) scale with solar_irradiance_factor (1/r²).
        
        Dyson sphere power is allocated between economy (energy) and compute based on slider.
        Allocation: dyson_power_allocation (0 = all economy, 100 = all compute)
        """
        rate = 0.0
        
        # Dyson sphere power allocation (all energy comes from Dyson sphere)
        dyson_power_allocation = getattr(self, 'dyson_power_allocation', 0)  # 0 = all economy, 100 = all compute
        economy_fraction = (100 - dyson_power_allocation) / 100.0  # Fraction going to economy/energy
        
        if self.dyson_sphere_mass >= self.get_dyson_target_mass():
            # Complete Dyson sphere: all star's power
            # Sun's total power output: ~3.8e26 W
            sun_total_power = 3.8e26  # watts
            # Allocate based on slider
            rate += sun_total_power * economy_fraction
        else:
            # During construction: use get_dyson_energy_production() which applies skill modifiers
            dyson_power = self.get_dyson_energy_production()
            # Allocate based on slider
            rate += dyson_power * economy_fraction
        
        # Energy structures (power stations, data centers, etc.)
        # Apply energy collection skill modifiers
        energy_collection_multiplier = self.get_skill_value('energy_collection')
        
        # Load orbital zones for distance calculations
        zones = self.data_loader.load_orbital_mechanics()
        zone_map = {zone['id']: zone for zone in zones}
        
        # Zone-based structures (new system)
        for zone_id, zone_structures in self.structures_by_zone.items():
            for building_id, count in zone_structures.items():
                building = self.data_loader.get_building_by_id(building_id)
                if building:
                    # Check for new power_output_mw property (power stations, data centers)
                    power_output_mw = building.get('power_output_mw', 0)
                    if power_output_mw > 0:
                        # Convert MW to watts
                        energy_output = power_output_mw * 1e6
                        
                        # Apply solar irradiance scaling for solar-powered structures
                        if building.get('uses_solar', False) and zone_id in zone_map:
                            zone = zone_map[zone_id]
                            # Use pre-calculated solar_irradiance_factor (1/r²), or calculate it
                            solar_factor = zone.get('solar_irradiance_factor')
                            if solar_factor is None:
                                radius_au = zone.get('radius_au', 1.0)
                                if radius_au > 0:
                                    solar_factor = (1.0 / radius_au) ** 2
                                else:
                                    solar_factor = 1.0
                            energy_output *= solar_factor
                        
                        # Apply geometric scaling for multiple structures (count^2.1)
                        geometric_factor = count ** 2.1
                        energy_output *= geometric_factor
                        
                        # Apply energy collection skill multiplier
                        energy_output *= energy_collection_multiplier
                        
                        rate += energy_output
                    else:
                        # Legacy category-based system
                        category = self._get_building_category(building_id)
                        if category == 'energy':
                            effects = building.get('effects', {})
                            energy_output = effects.get('energy_production_per_second', 0)
                            
                            # Apply orbital efficiency
                            orbital_efficiency = 1.0
                            if 'orbital_efficiency' in building:
                                orbital_efficiency = building['orbital_efficiency'].get(zone_id, 1.0)
                            
                            # Apply base energy at Earth if specified
                            base_energy = effects.get('base_energy_at_earth', energy_output)
                            if base_energy != energy_output:
                                # Scale by orbital efficiency
                                energy_output = base_energy * orbital_efficiency
                            
                            # Apply solar distance modifier (inverse square law)
                            # Power is proportional to 1/distance², with Earth (1.0 AU) as baseline
                            solar_distance_modifier = 1.0
                            if zone_id in zone_map:
                                zone = zone_map[zone_id]
                                radius_au = zone.get('radius_au', 1.0)
                                if radius_au > 0:
                                    # Inverse square law: power at distance d = power_at_earth * (1.0 / d)²
                                    solar_distance_modifier = (1.0 / radius_au) ** 2
                            energy_output *= solar_distance_modifier
                            
                            # Apply energy collection skill multiplier
                            energy_output *= energy_collection_multiplier
                            
                            rate += energy_output * count
        
        # Legacy global structures for backward compatibility
        for building_id, count in self.structures.items():
            # Skip if already counted in zone structures
            already_counted = False
            for zone_structures in self.structures_by_zone.values():
                if building_id in zone_structures:
                    already_counted = True
                    break
            if already_counted:
                continue
            
            building = self.data_loader.get_building_by_id(building_id)
            if building:
                # Check for new power_output_mw property
                power_output_mw = building.get('power_output_mw', 0)
                if power_output_mw > 0:
                    # Convert MW to watts
                    energy_output = power_output_mw * 1e6
                    
                    # Legacy structures default to Earth distance (solar_factor = 1.0)
                    # Apply energy collection skill multiplier
                    energy_output *= energy_collection_multiplier
                    
                    rate += energy_output * count
                else:
                    # Legacy category-based system
                    category = self._get_building_category(building_id)
                    if category == 'energy':
                        effects = building.get('effects', {})
                        energy_output = effects.get('energy_production_per_second', 0)
                        
                        # Apply orbital efficiency (use default zone)
                        default_zone = 'earth'
                        orbital_efficiency = 1.0
                        if 'orbital_efficiency' in building:
                            orbital_efficiency = building['orbital_efficiency'].get(default_zone, 1.0)
                        
                        # Apply base energy at Earth if specified
                        base_energy = effects.get('base_energy_at_earth', energy_output)
                        if base_energy != energy_output:
                            # Scale by orbital efficiency
                            energy_output = base_energy * orbital_efficiency
                        
                        # Legacy structures default to Earth distance (1.0 AU = no modifier)
                        # solar_distance_modifier = 1.0 (Earth baseline)
                        
                        # Apply energy collection skill multiplier
                        energy_output *= energy_collection_multiplier
                        
                        rate += energy_output * count
        
        return rate
    
    def _calculate_energy_storage_capacity(self):
        """Calculate total energy storage capacity from storage buildings.
        
        Returns:
            Total storage capacity in watt-days
        """
        capacity = 0.0
        
        # Get research bonus for storage capacity if applicable
        storage_capacity_multiplier = self.get_skill_value('energy_storage')
        
        # Check structures by zone
        for zone_id, zone_structures in self.structures_by_zone.items():
            for building_id, count in zone_structures.items():
                building = self.data_loader.get_building_by_id(building_id)
                if building:
                    category = self._get_building_category(building_id)
                    if category == 'storage':
                        effects = building.get('effects', {})
                        storage_capacity = effects.get('energy_storage_capacity', 0.0)
                        capacity += storage_capacity * count
        
        # Legacy global structures for backward compatibility
        for building_id, count in self.structures.items():
            # Skip if already counted in zone structures
            already_counted = False
            for zone_structures in self.structures_by_zone.values():
                if building_id in zone_structures:
                    already_counted = True
                    break
            if already_counted:
                continue
            
            building = self.data_loader.get_building_by_id(building_id)
            if building:
                category = self._get_building_category(building_id)
                if category == 'storage':
                    effects = building.get('effects', {})
                    storage_capacity = effects.get('energy_storage_capacity', 0.0)
                    capacity += storage_capacity * count
        
        # Apply research bonus
        capacity *= storage_capacity_multiplier
        
        return capacity
    
    def _calculate_energy_consumption(self):
        """Calculate energy consumption rate."""
        from backend.config import Config
        # Get base consumption from economic rules, fall back to Config
        probe_config = self.data_loader.get_probe_config()
        base_probe_consumption = probe_config.get('base_energy_cost_mining_w', Config.PROBE_BASE_ENERGY_COST_MINING)
        
        # Get research bonuses first
        # Computer efficiency reduces probe base energy consumption (based on compute power)
        compute_power = self.get_compute_power()
        # More compute power = more efficient probes, reduction scales with compute power bonus
        computer_reduction = max(0.0, (compute_power - 1.0) * 0.1)  # 10% reduction per 1.0 compute power bonus
        
        # Propulsion systems: reduces dexterity-related energy costs (harvesting operations)
        propulsion_reduction = self._get_research_bonus('propulsion_systems', 'dexterity_energy_cost_reduction', 0.0)
        
        # Production efficiency: general energy efficiency multiplier
        production_efficiency_bonus = self._get_research_bonus('production_efficiency', 'energy_efficiency_bonus', 1.0)
        
        consumption = 0.0
        
        # Probe energy consumption (in watts) - apply computer systems reduction
        # Single probe type only
        probe_count = self.probes.get('probe', 0)
        probe_base_consumption = probe_count * base_probe_consumption
        
        # Apply computer systems reduction to probe base consumption
        probe_base_consumption *= (1.0 - computer_reduction)
        consumption += probe_base_consumption
        
        # Structure energy consumption (zone-based with fixed MW costs)
        for zone_id, zone_structures in self.structures_by_zone.items():
            for building_id, count in zone_structures.items():
                building = self.data_loader.get_building_by_id(building_id)
                if building:
                    # Check for new base_power_consumption_mw property (data centers, etc.)
                    base_consumption_mw = building.get('base_power_consumption_mw', 0)
                    if base_consumption_mw > 0:
                        # Fixed power consumption in MW, converted to watts
                        # This is NOT affected by solar irradiance - it's the compute/operational load
                        energy_cost = base_consumption_mw * 1e6
                        # Apply geometric scaling for multiple structures (count^2.1)
                        geometric_factor = count ** 2.1
                        consumption += energy_cost * geometric_factor
                    else:
                        # Legacy effects-based system
                        effects = building.get('effects', {})
                        energy_cost = effects.get('energy_consumption_per_second', 0)
                        consumption += energy_cost * count
        
        # Legacy global structures for backward compatibility
        for building_id, count in self.structures.items():
            # Skip if already counted in zone structures
            already_counted = False
            for zone_structures in self.structures_by_zone.values():
                if building_id in zone_structures:
                    already_counted = True
                    break
            if already_counted:
                continue
            
            building = self.data_loader.get_building_by_id(building_id)
            if building:
                # Check for new base_power_consumption_mw property
                base_consumption_mw = building.get('base_power_consumption_mw', 0)
                if base_consumption_mw > 0:
                    energy_cost = base_consumption_mw * 1e6
                    consumption += energy_cost * count
                else:
                    effects = building.get('effects', {})
                    energy_cost = effects.get('energy_consumption_per_second', 0)
                    consumption += energy_cost * count
        
        # Harvesting energy cost (based on harvest zone delta-v) - apply propulsion reduction
        harvest_allocation = self.probe_allocations.get('harvest', {})
        total_harvest_probes = sum(harvest_allocation.values())
        if total_harvest_probes > 0:
            zones = self.data_loader.load_orbital_mechanics()
            harvest_zone_data = next((z for z in zones if z['id'] == self.harvest_zone), None)
            if harvest_zone_data:
                # Energy cost is quadratic in delta-v penalty
                # Mercury (delta_v=0.05): 500kW per 1 kg/s = 500000W
                # Formula: energy_cost = base * (1 + delta_v_penalty)^2
                # For Mercury: 500000 = base * (1.05)^2 = base * 1.1025
                # base ≈ 453515 W
                delta_v_penalty = harvest_zone_data.get('delta_v_penalty', 0.1)
                base_energy_cost = 453515 / 86400  # watts per kg/day at Earth baseline (converted from per-second)
                energy_cost_per_kg_day = base_energy_cost * (1.0 + delta_v_penalty) ** 2
                harvest_rate_per_probe = Config.PROBE_HARVEST_RATE  # kg/day per probe
                harvest_energy_cost = energy_cost_per_kg_day * harvest_rate_per_probe * total_harvest_probes
                
                # Apply propulsion systems reduction to harvesting costs
                harvest_energy_cost *= (1.0 - propulsion_reduction)
                consumption += harvest_energy_cost
        
        # Probe construction energy cost: 250kW per kg/s = 250000W per kg/s, converted to per-day
        # Energy cost: 250000 W / (kg/s) = 250000 / 86400 W / (kg/day) ≈ 2.8935 W per kg/day
        ENERGY_COST_PER_KG_DAY = 250000 / 86400  # W per kg/day
        
        # Calculate probe construction rate
        probe_prod_rates, _, factory_metal_cost_per_probe = self._calculate_probe_production()
        total_probe_production_rate = sum(probe_prod_rates.values())  # probes/day
        # Use factory metal cost if available, otherwise default
        metal_cost_per_probe = factory_metal_cost_per_probe if factory_metal_cost_per_probe > 0 else Config.PROBE_MASS
        probe_construction_rate_kg_day = total_probe_production_rate * metal_cost_per_probe
        probe_construction_energy_cost = probe_construction_rate_kg_day * ENERGY_COST_PER_KG_DAY
        consumption += probe_construction_energy_cost
        
        # Structure construction energy cost
        construct_allocation = self.probe_allocations.get('construct', {})
        constructing_probes = sum(construct_allocation.values())
        build_allocation = getattr(self, 'build_allocation', 100)  # 0 = all structures, 100 = all probes
        structure_constructing_power = constructing_probes * (1.0 - build_allocation / 100.0)
        structure_construction_rate_kg_day = structure_constructing_power * Config.PROBE_BUILD_RATE  # kg/day per probe
        structure_construction_energy_cost = structure_construction_rate_kg_day * ENERGY_COST_PER_KG_DAY
        consumption += structure_construction_energy_cost
        
        # Dyson construction energy cost
        dyson_construction_rate = self._calculate_dyson_construction_rate()
        dyson_construction_energy_cost = dyson_construction_rate * ENERGY_COST_PER_KG_DAY
        consumption += dyson_construction_energy_cost
        
        # Compute energy consumption: 1 kW per PFLOPS/s (only if research projects active)
        compute_demand_flops = self._calculate_compute_demand()
        if compute_demand_flops > 0:
            compute_demand_pflops = compute_demand_flops / 1e15
            base_compute_power_draw = compute_demand_pflops * 1000  # 1000W = 1 kW per PFLOPS/s
            # Use compute power from computer trees (geometric mean of processing, gpu, interconnect, interface)
            compute_efficiency = self.get_compute_power()
            compute_power_draw = base_compute_power_draw / compute_efficiency if compute_efficiency > 0 else base_compute_power_draw
            consumption += compute_power_draw
        
        # Apply production efficiency bonus (multiplicative, divides consumption)
        if production_efficiency_bonus > 1.0:
            consumption /= production_efficiency_bonus
        
        return max(0, consumption)
    
    def _calculate_non_compute_energy_consumption(self):
        """Calculate energy consumption for all activities except compute."""
        from backend.config import Config
        # Get base consumption from economic rules, fall back to Config
        probe_config = self.data_loader.get_probe_config()
        base_probe_consumption = probe_config.get('base_energy_cost_mining_w', Config.PROBE_BASE_ENERGY_COST_MINING)
        
        # Get research bonuses
        # Computer efficiency reduces probe base energy consumption (based on compute power)
        compute_power = self.get_compute_power()
        computer_reduction = max(0.0, (compute_power - 1.0) * 0.1)  # 10% reduction per 1.0 compute power bonus
        propulsion_reduction = self._get_research_bonus('propulsion_systems', 'dexterity_energy_cost_reduction', 0.0)
        production_efficiency_bonus = self._get_research_bonus('production_efficiency', 'energy_efficiency_bonus', 1.0)
        
        consumption = 0.0
        
        # Probe energy consumption - single probe type only
        probe_count = self.probes.get('probe', 0)
        probe_base_consumption = probe_count * base_probe_consumption
        
        probe_base_consumption *= (1.0 - computer_reduction)
        consumption += probe_base_consumption
        
        # Structure energy consumption (zone-based with fixed MW costs)
        for zone_id, zone_structures in self.structures_by_zone.items():
            for building_id, count in zone_structures.items():
                building = self.data_loader.get_building_by_id(building_id)
                if building:
                    # Check for new base_power_consumption_mw property (data centers, etc.)
                    base_consumption_mw = building.get('base_power_consumption_mw', 0)
                    if base_consumption_mw > 0:
                        # Fixed power consumption in MW, converted to watts
                        energy_cost = base_consumption_mw * 1e6
                        # Apply geometric scaling for multiple structures (count^2.1)
                        geometric_factor = count ** 2.1
                        consumption += energy_cost * geometric_factor
                    else:
                        effects = building.get('effects', {})
                        energy_cost = effects.get('energy_consumption_per_second', 0)
                        consumption += energy_cost * count
        
        # Legacy global structures for backward compatibility
        for building_id, count in self.structures.items():
            # Skip if already counted in zone structures
            already_counted = False
            for zone_structures in self.structures_by_zone.values():
                if building_id in zone_structures:
                    already_counted = True
                    break
            if already_counted:
                continue
            
            building = self.data_loader.get_building_by_id(building_id)
            if building:
                base_consumption_mw = building.get('base_power_consumption_mw', 0)
                if base_consumption_mw > 0:
                    energy_cost = base_consumption_mw * 1e6
                    consumption += energy_cost * count
                else:
                    effects = building.get('effects', {})
                    energy_cost = effects.get('energy_consumption_per_second', 0)
                    consumption += energy_cost * count
        
        # Harvesting energy cost
        harvest_allocation = self.probe_allocations.get('harvest', {})
        total_harvest_probes = sum(harvest_allocation.values())
        if total_harvest_probes > 0:
            zones = self.data_loader.load_orbital_mechanics()
            harvest_zone_data = next((z for z in zones if z['id'] == self.harvest_zone), None)
            if harvest_zone_data:
                delta_v_penalty = harvest_zone_data.get('delta_v_penalty', 0.1)
                base_energy_cost = 453515 / 86400  # watts per kg/day at Earth baseline (converted from per-second)
                energy_cost_per_kg_day = base_energy_cost * (1.0 + delta_v_penalty) ** 2
                harvest_rate_per_probe = Config.PROBE_HARVEST_RATE  # kg/day per probe
                harvest_energy_cost = energy_cost_per_kg_day * harvest_rate_per_probe * total_harvest_probes
                harvest_energy_cost *= (1.0 - propulsion_reduction)
                consumption += harvest_energy_cost
        
        # Probe construction energy cost (converted to per-day)
        ENERGY_COST_PER_KG_DAY = 250000 / 86400  # W per kg/day
        probe_prod_rates, _, factory_metal_cost_per_probe = self._calculate_probe_production()
        total_probe_production_rate = sum(probe_prod_rates.values())  # probes/day
        # Use factory metal cost if available, otherwise default
        metal_cost_per_probe = factory_metal_cost_per_probe if factory_metal_cost_per_probe > 0 else Config.PROBE_MASS
        probe_construction_rate_kg_day = total_probe_production_rate * metal_cost_per_probe
        probe_construction_energy_cost = probe_construction_rate_kg_day * ENERGY_COST_PER_KG_DAY
        consumption += probe_construction_energy_cost
        
        # Dyson construction energy cost
        dyson_construction_rate = self._calculate_dyson_construction_rate()
        dyson_construction_energy_cost = dyson_construction_rate * ENERGY_COST_PER_KG_DAY
        consumption += dyson_construction_energy_cost
        
        # Apply production efficiency bonus
        if production_efficiency_bonus > 1.0:
            consumption /= production_efficiency_bonus
        
        return max(0, consumption)
    
    def _calculate_compute_demand(self):
        """Calculate compute demand in FLOPS based on active research projects.
        
        Returns:
            float: Compute demand in FLOPS/s (0 if no research projects active)
        """
        # Count enabled research projects
        enabled_projects = []
        research_trees = self.data_loader.get_all_research_trees()
        
        for tree_id, tree_data in research_trees.items():
            if tree_id not in self.research:
                continue
            
            # Check if tree has direct tiers
            if 'tiers' in tree_data:
                tiers_list = tree_data['tiers']
                for idx, tier in enumerate(tiers_list):
                    tier_id = tier['id']
                    if tier_id in self.research[tree_id]:
                        tier_data = self.research[tree_id][tier_id]
                        if tier_data.get('enabled', False):
                            tranches_completed = tier_data.get('tranches_completed', 0)
                            max_tranches = tier.get('tranches', 10)
                            if tranches_completed < max_tranches:
                                # Check prerequisites
                                can_research = True
                                if idx > 0:
                                    prev_tier = tiers_list[idx - 1]
                                    prev_tier_id = prev_tier['id']
                                    if prev_tier_id in self.research[tree_id]:
                                        prev_completed = self.research[tree_id][prev_tier_id].get('tranches_completed', 0)
                                        prev_max = prev_tier.get('tranches', 10)
                                        if prev_completed < prev_max:
                                            can_research = False
                                    else:
                                        can_research = False
                                
                                if can_research:
                                    enabled_projects.append((tree_id, tier_id, tier, tier_data))
        
        # If no research projects active, compute demand is 0
        if len(enabled_projects) == 0:
            return 0.0
        
        # Compute demand is the theoretical maximum intelligence production
        # This represents what research projects would like to use
        # Actual compute will be limited by available energy in intelligence production calculation
        theoretical_compute_available = self._calculate_intelligence_production()
        
        # Demand equals theoretical compute (actual usage will be limited by energy)
        return theoretical_compute_available
    
    def _calculate_zone_activities(self):
        """Calculate probe activities per zone based on zone policies.
        
        Returns: {zoneId: {'harvest': count, 'replicate': count, 'construct': count, 'dyson': count}}
        """
        activities = {}
        zones = self.data_loader.load_orbital_mechanics()
        
        for zone in zones:
            zone_id = zone['id']
            zone_probes = self.probes_by_zone.get(zone_id, {}).get('probe', 0)
            policy = self.zone_policies.get(zone_id, {})
            
            if zone.get('is_dyson_zone', False):
                # Dyson zone: Two sliders
                # 1. Dyson allocation slider: splits between Dyson construction and Build
                # dyson_allocation_slider: 0 = all Build (bottom), 100 = all Dyson (top)
                # Fallback to dyson_build_slider for backward compatibility (inverted)
                dyson_allocation_slider = policy.get('dyson_allocation_slider')
                if dyson_allocation_slider is None:
                    # Backward compatibility: invert dyson_build_slider
                    dyson_build_slider = policy.get('dyson_build_slider', 90)
                    dyson_allocation_slider = 100 - dyson_build_slider
                dyson_fraction = dyson_allocation_slider / 100.0  # 0 = all Build, 100 = all Dyson
                dyson_build_count = zone_probes * dyson_fraction
                build_count = zone_probes * (1.0 - dyson_fraction)  # Remaining goes to Build
                
                # 2. Replication slider: splits Build between structures and replicate
                # replication_slider: 0 = all structures, 100 = all replicate
                replication_slider = policy.get('replication_slider', 100) / 100.0
                replicate_count = build_count * replication_slider
                construct_count = build_count * (1.0 - replication_slider)
                
                activities[zone_id] = {
                    'construct': construct_count,  # Building structures
                    'replicate': replicate_count,  # Replicating probes
                    'harvest': 0,
                    'dyson': dyson_build_count  # Building Dyson
                }
            else:
                # Regular zones: mining vs replication/construction
                # mining_slider: 0 = all build, 100 = all mine
                # replication_slider: 0 = all construct, 100 = all replicate
                mining_slider = policy.get('mining_slider', 50) / 100.0
                replication_slider = policy.get('replication_slider', 100) / 100.0
                
                mining_count = zone_probes * mining_slider
                build_count = zone_probes * (1.0 - mining_slider)  # Non-mining = building
                
                replicate_count = build_count * replication_slider
                construct_count = build_count * (1.0 - replication_slider)
                
                activities[zone_id] = {
                    'harvest': mining_count,
                    'replicate': replicate_count,
                    'construct': construct_count,
                    'dyson': 0
                }
        
        return activities
    
    def _calculate_metal_production(self):
        """Calculate metal production rate per zone based on zone activities.
        
        Returns:
            tuple: (total_rate, zone_depletion_dict) where zone_depletion_dict maps zone_id to depletion rate
        """
        rate = 0.0
        zone_depletion = {zone_id: 0.0 for zone_id in self.zone_metal_remaining.keys()}
        
        # Get zone activities
        zone_activities = self._calculate_zone_activities()
        
        # Calculate mining from probes per zone
        zones = self.data_loader.load_orbital_mechanics()
        for zone in zones:
            zone_id = zone['id']
            if zone.get('is_dyson_zone', False):
                continue  # Dyson zone doesn't mine
            
            activities = zone_activities.get(zone_id, {})
            harvest_count = activities.get('harvest', 0)
            
            if harvest_count > 0.001:
                probe_data = self._get_probe_data('probe')
                base_dexterity = 1.0
                harvest_multiplier = 1.0
                
                if probe_data:
                    base_dexterity = probe_data.get('base_dexterity', 1.0)
                    effects = probe_data.get('effects', {})
                    harvest_multiplier = effects.get('harvest_efficiency_multiplier', 1.0)
                
                # Calculate harvest rate per probe (kg/s per probe)
                # Use skill system: locomotion, attitude control, and robotics affect mining rate
                from backend.config import Config
                base_harvest_rate = Config.PROBE_BASE_MINING_RATE
                mining_rate_multiplier = zone.get('mining_rate_multiplier', 1.0)
                
                # Apply skill multipliers
                locomotion_multiplier = self.get_skill_value('locomotion_systems')
                acds_multiplier = self.get_skill_value('acds')
                robotics_multiplier = self.get_skill_value('robotic_systems')
                
                # Combine skill multipliers (multiplicative)
                skill_multiplier = locomotion_multiplier * acds_multiplier * robotics_multiplier
                
                harvest_rate_per_probe = base_dexterity * harvest_multiplier * base_harvest_rate * mining_rate_multiplier * skill_multiplier
                
                # Apply probe count scaling penalty (diminishing returns for probe count)
                # Get total probes in zone for scaling calculation
                zone_probe_data = self.probes_by_zone.get(zone_id, {})
                total_zone_probes = sum(zone_probe_data.values())
                probe_count_scaling_efficiency = self.calculate_probe_count_scaling_penalty(total_zone_probes, zone_id)
                harvest_rate_per_probe *= probe_count_scaling_efficiency
                
                # Harvest from this zone
                metal_remaining = self.zone_metal_remaining.get(zone_id, 0)
                if metal_remaining > 0 and not self.zone_depleted.get(zone_id, False):
                    total_harvest_rate = harvest_rate_per_probe * harvest_count
                    
                    # Limit by zone metal remaining
                    zone_contribution = min(total_harvest_rate, metal_remaining)
                    zone_depletion[zone_id] += zone_contribution
                    rate += zone_contribution
        
        # Mining structures (harvest from selected zone)
        # Note: Mining structures should not operate in Dyson zone (no minerals to mine)
        zones = self.data_loader.load_orbital_mechanics()
        harvest_zone_data = next((z for z in zones if z['id'] == self.harvest_zone), None)
        if (harvest_zone_data and not harvest_zone_data.get('is_dyson_zone', False) and 
            self.harvest_zone in self.zone_metal_remaining and not self.zone_depleted[self.harvest_zone]):
            for building_id, count in self.structures.items():
                building = self.data_loader.get_building_by_id(building_id)
                if building:
                    category = self._get_building_category(building_id)
                    if category == 'mining':
                        effects = building.get('effects', {})
                        metal_output = effects.get('metal_production_per_day', 0)  # kg metal/day per structure
                        efficiency_bonus = effects.get('metal_efficiency_bonus', 0.0)  # Additional % metal extraction
                        
                        # Limit by zone metal remaining
                        zone_metal = self.zone_metal_remaining.get(self.harvest_zone, 0)
                        if zone_metal > 0:
                            structure_rate = metal_output * count  # Total metal output (kg/day)
                            zone_contribution = min(structure_rate, zone_metal)
                            zone_depletion[self.harvest_zone] += zone_contribution
                            rate += zone_contribution
                            
                            # Mining structures also reduce zone mass (mass conservation)
                            # Calculate total mass mined from metal contribution using improved efficiency
                            base_metal_percentage = harvest_zone_data.get('metal_percentage', 0.32)
                            improved_metal_percentage = min(1.0, base_metal_percentage + efficiency_bonus)
                            if improved_metal_percentage > 0:
                                total_mass_mined = zone_contribution / improved_metal_percentage
                                if self.harvest_zone in self.zone_mass_remaining:
                                    self.zone_mass_remaining[self.harvest_zone] -= total_mass_mined
                                    self.zone_mass_remaining[self.harvest_zone] = max(0, self.zone_mass_remaining[self.harvest_zone])
        
        # Production efficiency skill also affects mining rate
        production_efficiency_multiplier = self.get_skill_value('production_efficiency')
        rate *= production_efficiency_multiplier
        
        # Apply production efficiency multiplier to zone depletion as well
        for zone_id in zone_depletion:
            zone_depletion[zone_id] *= production_efficiency_multiplier
        
        # Generate slag from mining - slag is produced from the non-metal portion of mined mass
        # Track slag production per zone
        zones = self.data_loader.load_orbital_mechanics()
        for zone_id, metal_mined in zone_depletion.items():
            zone_data = next((z for z in zones if z['id'] == zone_id), None)
            if zone_data and not zone_data.get('is_dyson_zone', False):
                metal_percentage = zone_data.get('metal_percentage', 0.32)
                # Slag produced = mass_mined * (1 - metal_percentage) / metal_percentage
                # Since metal_mined is the metal portion, calculate total mass mined first
                if metal_percentage > 0:
                    total_mass_mined = metal_mined / metal_percentage
                    slag_produced = total_mass_mined * (1.0 - metal_percentage)
                    
                    # Track per-zone slag production
                    if zone_id not in self.zone_slag_produced:
                        self.zone_slag_produced[zone_id] = 0.0
                    self.zone_slag_produced[zone_id] += slag_produced
                    
                    # Add to global slag pool
                    self.slag += slag_produced
                    
                    # Reduce zone mass remaining
                    if zone_id in self.zone_mass_remaining:
                        self.zone_mass_remaining[zone_id] -= total_mass_mined
                        self.zone_mass_remaining[zone_id] = max(0, self.zone_mass_remaining[zone_id])
        
        return rate, zone_depletion
    
    def _calculate_probe_production(self):
        """Calculate probe production rate by type.
        
        Factories automatically produce probes independently of probes assigned to construct.
        Returns: (rates_dict, idle_probes_dict, factory_metal_cost_per_probe) where:
        - rates_dict: probe production rates by type
        - idle_probes_dict: idle probes due to metal constraints
        - factory_metal_cost_per_probe: weighted average metal cost per probe from factories
        """
        rates = {'probe': 0.0}  # Single probe type only
        idle_probes = {'probes': 0.0, 'structures': 0.0}
        
        # Factory production (automatic, independent of probe assignments)
        total_factory_rate = 0.0
        total_factory_metal_cost = 0.0
        factory_metal_costs = {}  # Track metal cost per factory type
        
        for building_id, count in self.structures.items():
            building = self.data_loader.get_building_by_id(building_id)
            if building:
                category = self._get_building_category(building_id)
                if category == 'factories':
                    effects = building.get('effects', {})
                    probes_per_day = effects.get('probe_production_per_day', 0.0)
                    metal_per_probe = effects.get('metal_per_probe', 10.0)
                    
                    # Apply production efficiency skill multiplier
                    production_efficiency_multiplier = self.get_skill_value('production_efficiency')
                    
                    # Each factory produces at its rate (modified by production efficiency)
                    factory_rate = probes_per_day * count * production_efficiency_multiplier
                    factory_metal_needed = factory_rate * metal_per_probe
                    
                    total_factory_rate += factory_rate
                    total_factory_metal_cost += factory_metal_needed
                    factory_metal_costs[building_id] = factory_metal_needed
        
        # Calculate weighted average metal cost per probe (based on unthrottled production rates)
        factory_metal_cost_per_probe = 10.0  # Default if no factories
        if total_factory_rate > 0:
            factory_metal_cost_per_probe = total_factory_metal_cost / total_factory_rate
        
        # Calculate metal production rate for limiting
        metal_production_rate, _ = self._calculate_metal_production()
        
        # Check metal availability - limit factory production if no stored metal
        # If no stored metal, limit to metal production rate
        effective_factory_rate = total_factory_rate
        if self.metal <= 0 and metal_production_rate < total_factory_metal_cost:
            # No stored metal and production < needed - limit to production
            if total_factory_metal_cost > 0:
                scale_factor = metal_production_rate / total_factory_metal_cost
                effective_factory_rate = total_factory_rate * scale_factor
                # Track idle production capacity
                idle_probes['probes'] = total_factory_rate * (1.0 - scale_factor)
        
        # Distribute factory production across probe types (default to von neumann)
        rates['probe'] = effective_factory_rate
        
        # Calculate structure construction power for idle tracking
        construct_allocation = self.probe_allocations.get('construct', {})
        constructing_probes = sum(construct_allocation.values())
        build_allocation = getattr(self, 'build_allocation', 100)
        structure_constructing_power = constructing_probes * (1.0 - build_allocation / 100.0)
        
        # Track idle structure-building probes if applicable
        if structure_constructing_power > 0 and self.metal <= 0 and metal_production_rate <= 0:
            idle_probes['structures'] = structure_constructing_power
        
        return rates, idle_probes, factory_metal_cost_per_probe
    
    def _calculate_intelligence_production(self):
        """Calculate intelligence production rate in FLOPS (Floating Point Operations Per Second).
        
        Compute is produced from Dyson sphere power, allocated based on slider.
        Power conversion: 1 MW = 1 PFLOPS/s (1e15 FLOPS/s per 1e6 W)
        Or: 1 W = 1e9 FLOPS/s
        
        Also includes compute from orbital data centers and other structures.
        
        Returns the theoretical maximum compute production. Actual production is limited
        by energy available for compute (after other energy needs).
        """
        # Dyson power allocation: 0 = all economy, 100 = all compute
        dyson_power_allocation = getattr(self, 'dyson_power_allocation', 0)
        compute_fraction = dyson_power_allocation / 100.0  # Fraction going to compute
        
        total_intelligence_flops = 0.0
        
        # Dyson sphere compute
        if self.dyson_sphere_mass >= self.get_dyson_target_mass():
            # Complete Dyson sphere: all star's power
            # Sun's total power output: ~3.8e26 W
            sun_total_power = 3.8e26  # watts
            # Allocate based on slider and convert to compute: 1 W = 1e9 FLOPS/s
            compute_power = sun_total_power * compute_fraction
            total_intelligence_flops += compute_power * 1e9  # FLOPS/s
        else:
            # While building: convert Dyson sphere power generation to compute
            # Use get_dyson_energy_production() which applies skill modifiers
            dyson_power = self.get_dyson_energy_production()
            compute_power = dyson_power * compute_fraction
            # Conversion: 1 W = 1e9 FLOPS/s
            total_intelligence_flops += compute_power * 1e9  # FLOPS/s
        
        # Add compute from orbital data centers and other structures
        # Check zone-based structures (new system)
        for zone_id, zone_structures in self.structures_by_zone.items():
            for building_id, count in zone_structures.items():
                building = self.data_loader.get_building_by_id(building_id)
                if building:
                    effects = building.get('effects', {})
                    intelligence_output_flops = effects.get('intelligence_flops', 0)
                    if intelligence_output_flops > 0:
                        total_intelligence_flops += intelligence_output_flops * count
                    else:
                        # Legacy: convert from intelligence_production_per_second (for backward compatibility with old saves)
                        intelligence_output = effects.get('intelligence_production_per_second', 0) or effects.get('intelligence_per_second', 0)
                        if intelligence_output > 0:
                            # Convert from per-second to FLOPS (assuming 1e12 FLOPS per unit)
                            total_intelligence_flops += intelligence_output * 1e12 * count
        
        # Also check legacy global structures for backward compatibility
        for building_id, count in self.structures.items():
            # Skip if already counted in zone structures
            already_counted = False
            for zone_structures in self.structures_by_zone.values():
                if building_id in zone_structures:
                    already_counted = True
                    break
            if already_counted:
                continue
            
            building = self.data_loader.get_building_by_id(building_id)
            if building:
                effects = building.get('effects', {})
                intelligence_output_flops = effects.get('intelligence_flops', 0)
                if intelligence_output_flops > 0:
                    total_intelligence_flops += intelligence_output_flops * count
                else:
                    # Legacy: convert from intelligence_per_second
                    intelligence_output = effects.get('intelligence_production_per_second', 0) or effects.get('intelligence_per_second', 0)
                    total_intelligence_flops += intelligence_output * 1e12 * count
        
        return total_intelligence_flops
    
    def _calculate_effective_intelligence_production(self, available_energy_for_compute):
        """Calculate effective intelligence production limited by available energy.
        
        Args:
            available_energy_for_compute: Energy available for compute (in watts)
        
        Returns:
            float: Effective intelligence production in FLOPS/s, limited by energy
        """
        # Theoretical maximum compute from Dyson sphere (already accounts for slider allocation)
        theoretical_max = self._calculate_intelligence_production()
        
        # If no theoretical compute, return 0
        if theoretical_max <= 0:
            return 0.0
        
        # Default: 1 kW per PFLOPS/s = 1000 W per 1e15 FLOPS/s
        # So: 1 W = 1e12 FLOPS/s for energy-to-compute conversion
        base_power_per_flops = 1e-12  # watts per FLOPS (1 kW per PFLOPS)
        
        # Research modifiers for compute power efficiency (from computer trees)
        compute_efficiency = self.get_compute_power()
        # Efficiency > 1.0 means less power needed, so more FLOPS per watt
        power_per_flops = base_power_per_flops / compute_efficiency if compute_efficiency > 0 else base_power_per_flops
        
        # Calculate compute available from energy
        compute_from_energy = available_energy_for_compute / power_per_flops
        
        # Effective production is minimum of theoretical max (from slider) and energy-limited
        effective_production = min(theoretical_max, compute_from_energy)
        
        return effective_production
    
    def _calculate_dexterity(self):
        """Calculate total dexterity."""
        # Single probe type only
        probe_count = self.probes.get('probe', 0)
        probe_data = self._get_probe_data('probe')
        base_dexterity = probe_data.get('base_dexterity', 1.0) if probe_data else 1.0
        total = probe_count * base_dexterity
        
        # Research bonuses
        research_bonus = self._get_research_bonus('robotic_systems', 'dexterity_multiplier', 1.0)
        total *= research_bonus
        
        return total
    
    def _update_research(self, delta_time, effective_intelligence_rate):
        """Update research progress. Intelligence is automatically allocated equally across all enabled research.
        
        Args:
            delta_time: Time delta for this tick
            effective_intelligence_rate: Effective intelligence production rate (in FLOPS/s), already limited by energy
        """
        # Use the effective intelligence rate (already energy-limited)
        total_intelligence_flops = effective_intelligence_rate
        
        # Count enabled research projects
        enabled_projects = []
        research_trees = self.data_loader.get_all_research_trees()
        
        for tree_id, tree_data in research_trees.items():
            if tree_id not in self.research:
                continue
            
            # Check regular tiers
            if 'tiers' in tree_data:
                tiers_list = tree_data['tiers']
                for idx, tier in enumerate(tiers_list):
                    tier_id = tier['id']
                    if tier_id not in self.research[tree_id]:
                        continue
                    
                    tier_data = self.research[tree_id][tier_id]
                    if tier_data.get('enabled', False):
                        tranches_completed = tier_data.get('tranches_completed', 0)
                        max_tranches = tier.get('tranches', 10)
                        if tranches_completed < max_tranches:
                            # Check prerequisites: first tier has no prerequisites, others require previous tier to be complete
                            can_research = True
                            if idx > 0:
                                # Check if previous tier in the list is complete
                                prev_tier = tiers_list[idx - 1]
                                prev_tier_id = prev_tier['id']
                                if prev_tier_id in self.research[tree_id]:
                                    prev_completed = self.research[tree_id][prev_tier_id].get('tranches_completed', 0)
                                    prev_max = prev_tier.get('tranches', 10)
                                    if prev_completed < prev_max:
                                        can_research = False
                                else:
                                    can_research = False  # Previous tier not initialized
                            
                            if can_research:
                                enabled_projects.append((tree_id, tier_id, tier, tier_data))
        
        # Allocate intelligence equally across enabled projects
        if len(enabled_projects) == 0:
            return
        
        intelligence_per_project = total_intelligence_flops / len(enabled_projects)
        
        # Process each enabled project
        for tree_id, tier_id, tier, tier_data in enabled_projects:
            tranches_completed = tier_data.get('tranches_completed', 0)
            max_tranches = tier.get('tranches', 10)
            
            # Set start_time when research begins (first time enabled)
            if tier_data.get('start_time') is None:
                tier_data['start_time'] = self.time
            
            if tranches_completed >= max_tranches:
                # Set completion_time when tier completes (first time it reaches max)
                if tier_data.get('completion_time') is None:
                    tier_data['completion_time'] = self.time
                continue  # Tier complete
            
            # Calculate progress based on FLOPS allocated
            # Research cost is in FLOPS (exponentially expensive)
            # Get the tier index to calculate cost (first tier should be ~10 PFLOPS)
            tier_index = 0
            tree_data_for_cost = research_trees.get(tree_id, {})
            if 'tiers' in tree_data_for_cost:
                tier_index = next((i for i, t in enumerate(tree_data_for_cost['tiers']) if t['id'] == tier_id), 0)
            
            # Exponential cost: first tier = 1000 EFLOPS-days, each tier is 150x more expensive
            # Cost is in FLOP-days (FLOPS * days)
            base_cost_eflops_days = 1000.0  # 1000 EFLOPS-days for first tier
            tier_cost_eflops_days = base_cost_eflops_days * (150.0 ** tier_index)
            tier_cost_flops = tier_cost_eflops_days * 1e18  # Convert EFLOPS-days to FLOP-days
            flops_per_tranche = tier_cost_flops / max_tranches
            
            # Accumulate progress (FLOPS * delta_time = FLOP-days)
            progress_flops = intelligence_per_project * delta_time
            old_progress = tier_data.get('progress', 0.0)
            new_progress = old_progress + progress_flops
            tier_data['progress'] = new_progress
            
            # Calculate tranches based on cumulative progress
            new_tranches = int(new_progress / flops_per_tranche) if flops_per_tranche > 0 else 0
            tier_data['tranches_completed'] = min(new_tranches, max_tranches)
            
            # Set completion_time when tier completes
            if tier_data['tranches_completed'] >= max_tranches:
                tier_data['progress'] = tier_cost_flops  # Cap progress at total cost
                if tier_data.get('completion_time') is None:
                    tier_data['completion_time'] = self.time
    
    def _calculate_dyson_construction_rate(self):
        """Calculate Dyson sphere construction rate (kg/s).
        
        NOTE: This method is now deprecated. Dyson construction rate is calculated
        in the tick() method by allocating a fraction of the structure build rate
        based on the Dyson zone's dyson_build_slider policy.
        
        This method is kept for backward compatibility but returns 0.
        The actual rate is calculated in tick() as dyson_build_rate_kg_s.
        """
        # Dyson construction is now handled by allocating structure build rate
        # in the tick() method, not by allocating probes
        return 0.0
    
    def _update_dyson_sphere_construction(self, delta_time, throttled_construction_rate):
        """Update Dyson sphere construction.
        
        Args:
            delta_time: Time delta for this tick
            throttled_construction_rate: Construction rate already throttled by energy (kg/s)
        
        Returns: idle_probes (dict) showing idle Dyson-building probes if metal constrained
        """
        idle_probes = {'dyson': 0.0}
        
        if self.dyson_sphere_mass >= self.get_dyson_target_mass():
            return idle_probes  # Already complete
        
        if throttled_construction_rate <= 0:
            return idle_probes
        
        # Metal consumption: 0.5 kg metal per 1 kg Dyson mass (50% efficiency)
        metal_consumption_rate_needed = throttled_construction_rate * 0.5
        
        # Calculate metal needed for this tick
        metal_needed_this_tick = metal_consumption_rate_needed * delta_time
        
        # Check if we have enough metal available
        effective_construction_rate = throttled_construction_rate
        if self.metal < metal_needed_this_tick:
            # Scale down to available metal
            scale_factor = self.metal / metal_needed_this_tick if metal_needed_this_tick > 0 else 0
            effective_construction_rate = throttled_construction_rate * scale_factor
            
            # Calculate idle probes (proportional to unused construction capacity)
            dyson_allocation = self.probe_allocations.get('dyson', {})
            total_dyson_probes = sum(dyson_allocation.values())
            idle_probes['dyson'] = total_dyson_probes * (1.0 - scale_factor)
        
        # Construct (limited by available metal)
        mass_to_add = effective_construction_rate * delta_time
        mass_to_add = min(mass_to_add, self.get_dyson_target_mass() - self.dyson_sphere_mass)
        
        # Consume resources
        metal_consumed = mass_to_add * 0.5  # 50% metal efficiency
        
        # Check if we have enough metal before consuming
        if self.metal >= metal_consumed:
            self.dyson_sphere_mass += mass_to_add
            self.metal -= metal_consumed
            # Don't allow negative metal
            self.metal = max(0, self.metal)
        
        return idle_probes
    
    def _check_zone_depletion(self):
        """Check if zones are depleted."""
        zones = self.data_loader.load_orbital_mechanics()
        for zone_id, metal_remaining in self.zone_metal_remaining.items():
            zone_data = next((z for z in zones if z['id'] == zone_id), None)
            if zone_data and zone_data.get('is_dyson_zone', False):
                continue  # Dyson zone never depletes
            # Zone is depleted when both metal and mass are exhausted
            mass_remaining = self.zone_mass_remaining.get(zone_id, 0)
            if metal_remaining <= 0 and mass_remaining <= 0 and not self.zone_depleted[zone_id]:
                self.zone_depleted[zone_id] = True
    
    def _recycle_slag(self, delta_time):
        """Convert slag to metal using Mass Energy Converters.
        
        Mass Energy Converters convert slag to metal at high energy cost.
        Conversion rate depends on building count and available energy.
        """
        if self.slag <= 0:
            return
        
        # Find Mass Energy Converter buildings
        total_conversion_rate = 0.0  # kg/s conversion capacity
        total_energy_cost = 0.0  # W energy consumption
        
        for building_id, count in self.structures.items():
            building = self.data_loader.get_building_by_id(building_id)
            if building:
                effects = building.get('effects', {})
                if 'slag_to_metal_conversion_rate' in effects:
                    conversion_rate_per_building = effects.get('slag_to_metal_conversion_rate', 0.0)  # kg/s per building
                    conversion_efficiency = effects.get('conversion_efficiency', 0.8)
                    energy_per_kg_s = effects.get('energy_consumption_per_kg_s', 10000)  # W per kg/s
                    
                    total_conversion_rate += conversion_rate_per_building * count * conversion_efficiency
                    total_energy_cost += conversion_rate_per_building * count * energy_per_kg_s
        
        if total_conversion_rate <= 0:
            return  # No converters
        
        # Calculate actual conversion based on available energy
        available_energy = self.energy  # Use current energy (not rate-based)
        if available_energy <= 0:
            return  # No energy available
        
        # Limit conversion by energy availability
        # Energy cost is per kg/s, so for delta_time: energy_needed = rate * energy_per_kg_s * delta_time
        # But we need to work backwards: how much can we convert with available energy?
        max_conversion_by_energy = available_energy / (total_energy_cost / total_conversion_rate) if total_conversion_rate > 0 else 0
        
        # Limit by available slag
        max_conversion_by_slag = self.slag / delta_time if delta_time > 0 else 0
        
        # Actual conversion rate is minimum of capacity, energy-limited, and slag-limited
        actual_conversion_rate = min(total_conversion_rate, max_conversion_by_energy, max_conversion_by_slag)
        
        # Convert slag to metal
        metal_produced = actual_conversion_rate * delta_time
        energy_consumed = actual_conversion_rate * (total_energy_cost / total_conversion_rate) * delta_time if total_conversion_rate > 0 else 0
        
        metal_produced = min(metal_produced, self.slag)  # Can't convert more than available
        energy_consumed = min(energy_consumed, available_energy)  # Can't consume more than available
        
        self.metal += metal_produced
        self.slag -= metal_produced
        self.energy -= energy_consumed
        self.energy = max(0, self.energy)
    
    def _get_recycling_efficiency(self):
        """Get recycling efficiency from research."""
        base_efficiency = 0.75
        
        # Get recycling research bonus
        research_bonus = self._get_research_bonus('recycling_efficiency', 'recycling_efficiency_bonus', 0.0)
        
        # Calculate total efficiency (max 0.98)
        total_efficiency = min(base_efficiency + research_bonus, 0.98)
        
        return total_efficiency
    
    def _get_research_bonus(self, tree_id, bonus_key, default=1.0):
        """Get research bonus from a specific tree.
        
        For additive bonuses (default=0.0), returns sum of bonuses.
        For multiplicative bonuses (default=1.0), returns 1.0 + sum of bonuses.
        """
        if tree_id not in self.research:
            return default
        
        tree_data = self.data_loader.get_research_tree(tree_id)
        if not tree_data:
            return default
        
        total_bonus = default
        
        # Check regular tiers
        if 'tiers' in tree_data:
            for tier in tree_data['tiers']:
                tier_id = tier['id']
                if tier_id in self.research[tree_id]:
                    tier_data = self.research[tree_id][tier_id]
                    tranches_completed = tier_data.get('tranches_completed', 0)
                    max_tranches = tier.get('tranches', 10)
                    
                    if tranches_completed > 0:
                        # Calculate bonus from this tier
                        tier_bonus = tier.get('effects', {}).get(bonus_key, 0)
                        if tier_bonus:
                            # Apply bonus proportionally to completion
                            completion = tranches_completed / max_tranches
                            total_bonus += tier_bonus * completion
        
        return total_bonus
    
    def _get_researched_upgrade(self, tree_id, tier_id):
        """Check if a specific research upgrade is researched and return completion percentage."""
        if tree_id not in self.research:
            return None
        if tier_id not in self.research[tree_id]:
            return None
        
        tree_data = self.data_loader.get_research_tree(tree_id)
        if not tree_data:
            return None
        
        # Find the tier
        tiers = tree_data.get('tiers', [])
        tier_data = None
        for tier in tiers:
            if tier.get('id') == tier_id:
                tier_data = tier
                break
        
        if not tier_data:
            return None
        
        tier_state = self.research[tree_id][tier_id]
        tranches_completed = tier_state.get('tranches_completed', 0)
        max_tranches = tier_data.get('tranches', 10)
        
        if tranches_completed <= 0:
            return None
        
        completion = tranches_completed / max_tranches
        return {
            'name': tier_data.get('name', tier_id),
            'completion': completion,
            'tranches_completed': tranches_completed,
            'max_tranches': max_tranches
        }
    
    def _calculate_resource_breakdowns(self):
        """Calculate detailed breakdowns of Energy, Dexterity, and Intelligence for tooltips."""
        breakdowns = {
            'energy': self._calculate_energy_breakdown(),
            'dexterity': self._calculate_dexterity_breakdown(),
            'intelligence': self._calculate_intelligence_breakdown()
        }
        return breakdowns
    
    def _calculate_energy_breakdown(self):
        """Calculate energy production and consumption breakdown with upgrades."""
        breakdown = {
            'production': {'base': 0, 'total': 0, 'upgrades': [], 'breakdown': {}},
            'consumption': {'base': 0, 'total': 0, 'upgrades': [], 'breakdown': {}}
        }
        
        from backend.config import Config
        
        # Production: Base constant energy supply
        base_supply = Config.CONSTANT_ENERGY_SUPPLY  # 5,000,000W base supply
        breakdown['production']['base'] = base_supply
        breakdown['production']['breakdown']['base_supply'] = base_supply
        
        # Production: Energy probes
        # Energy probes removed - all energy comes from Dyson sphere
        
        # Production: Solar arrays and energy structures (with per-type breakdown)
        solar_multiplier = 4.0  # Buildings at 0.5 AU
        structure_production = 0
        structure_production_by_type = {}
        for building_id, count in self.structures.items():
            if count <= 0:
                continue
            building = self.data_loader.get_building_by_id(building_id)
            if building:
                effects = building.get('effects', {})
                energy_output = effects.get('energy_production_per_second', 0)
                base_energy = effects.get('base_energy_at_earth', energy_output)
                building_production = base_energy * solar_multiplier * count
                structure_production += building_production
                if building_production > 0:
                    structure_production_by_type[building_id] = {
                        'name': building.get('name', building_id),
                        'count': count,
                        'production': building_production
                    }
        breakdown['production']['base'] += structure_production
        breakdown['production']['breakdown']['structures'] = structure_production
        breakdown['production']['breakdown']['structures_by_type'] = structure_production_by_type
        
        # Production: Dyson sphere energy
        dyson_power_allocation = getattr(self, 'dyson_power_allocation', 0)  # 0 = all economy, 100 = all compute
        economy_fraction = (100 - dyson_power_allocation) / 100.0  # Fraction going to economy/energy
        
        dyson_energy_production = 0.0
        if self.dyson_sphere_mass >= self.get_dyson_target_mass():
            # Complete Dyson sphere: all star's power
            sun_total_power = 3.8e26  # watts
            dyson_energy_production = sun_total_power * economy_fraction
        else:
            # During construction: 5 kW per kg
            dyson_power = self.dyson_sphere_mass * 5000  # 5000W = 5 kW per kg
            dyson_energy_production = dyson_power * economy_fraction
        
        breakdown['production']['base'] += dyson_energy_production
        breakdown['production']['breakdown']['dyson_sphere'] = dyson_energy_production
        
        # Production: Energy Collection Efficiency research
        energy_collection_bonus = self._get_research_bonus('energy_collection', 'solar_efficiency_multiplier', 1.0)
        if energy_collection_bonus > 1.0:
            upgrade = self._get_researched_upgrade('energy_collection', 'photovoltaic_optimization')
            if upgrade:
                breakdown['production']['upgrades'].append({
                    'name': 'Energy Collection Efficiency',
                    'bonus': energy_collection_bonus - 1.0,
                    'researched': True
                })
        breakdown['production']['total'] = breakdown['production']['base'] * energy_collection_bonus
        
        # Consumption: Probe base consumption - single probe type only
        # Apply computer efficiency reduction (same as actual consumption calculation)
        compute_power = self.get_compute_power()
        computer_reduction = max(0.0, (compute_power - 1.0) * 0.1)  # 10% reduction per 1.0 compute power bonus
        # Get base consumption from economic rules, fall back to Config
        probe_config = self.data_loader.get_probe_config()
        base_probe_consumption = probe_config.get('base_energy_cost_mining_w', Config.PROBE_BASE_ENERGY_COST_MINING)
        probe_count = self.probes.get('probe', 0)
        probe_base_consumption = probe_count * base_probe_consumption * (1.0 - computer_reduction)
        
        breakdown['consumption']['base'] = probe_base_consumption
        breakdown['consumption']['breakdown']['probes'] = probe_base_consumption
        
        # Consumption: Structures (with per-type breakdown)
        structure_consumption = 0
        structure_breakdown_by_type = {}
        for building_id, count in self.structures.items():
            if count <= 0:
                continue
            building = self.data_loader.get_building_by_id(building_id)
            if building:
                effects = building.get('effects', {})
                energy_cost = effects.get('energy_consumption_per_second', 0)
                building_consumption = energy_cost * count
                structure_consumption += building_consumption
                if building_consumption > 0:
                    structure_breakdown_by_type[building_id] = {
                        'name': building.get('name', building_id),
                        'count': count,
                        'consumption': building_consumption
                    }
        breakdown['consumption']['base'] += structure_consumption
        breakdown['consumption']['breakdown']['structures'] = structure_consumption
        breakdown['consumption']['breakdown']['structures_by_type'] = structure_breakdown_by_type
        
        # Consumption: Harvesting energy cost
        harvest_allocation = self.probe_allocations.get('harvest', {})
        total_harvest_probes = sum(harvest_allocation.values())
        harvest_energy_cost = 0
        if total_harvest_probes > 0:
            zones = self.data_loader.load_orbital_mechanics()
            harvest_zone_data = next((z for z in zones if z['id'] == self.harvest_zone), None)
            if harvest_zone_data:
                delta_v_penalty = harvest_zone_data.get('delta_v_penalty', 0.1)
                # Energy cost is quadratic in delta-v penalty (same as in _calculate_energy_consumption)
                # This is for breakdown display only - actual calculation is in _calculate_energy_consumption
                # Use same units as actual calculation: watts per kg/day
                base_energy_cost = 453515 / 86400  # watts per kg/day at Earth baseline (converted from per-second)
                energy_cost_per_kg_day = base_energy_cost * (1.0 + delta_v_penalty) ** 2
                harvest_rate_per_probe = Config.PROBE_HARVEST_RATE  # kg/day per probe
                harvest_energy_cost = energy_cost_per_kg_day * harvest_rate_per_probe * total_harvest_probes
                
                # Apply propulsion systems reduction (same as actual calculation)
                propulsion_reduction = self._get_research_bonus('propulsion_systems', 'dexterity_energy_cost_reduction', 0.0)
                harvest_energy_cost *= (1.0 - propulsion_reduction)
                
                breakdown['consumption']['base'] += harvest_energy_cost
        breakdown['consumption']['breakdown']['harvesting'] = harvest_energy_cost
        
        # Consumption: Probe construction energy cost
        probe_prod_rates, _, factory_metal_cost_per_probe = self._calculate_probe_production()
        total_probe_production_rate = sum(probe_prod_rates.values())  # probes/day
        # Use factory metal cost if available, otherwise default
        metal_cost_per_probe = factory_metal_cost_per_probe if factory_metal_cost_per_probe > 0 else Config.PROBE_MASS
        ENERGY_COST_PER_KG_DAY = 250000 / 86400  # W per kg/day
        probe_construction_rate_kg_day = total_probe_production_rate * metal_cost_per_probe  # kg/day
        probe_construction_energy_cost = probe_construction_rate_kg_day * ENERGY_COST_PER_KG_DAY
        breakdown['consumption']['base'] += probe_construction_energy_cost
        breakdown['consumption']['breakdown']['probe_construction'] = probe_construction_energy_cost
        
        # Consumption: Structure construction energy cost
        construct_allocation = self.probe_allocations.get('construct', {})
        constructing_probes = sum(construct_allocation.values())
        build_allocation = getattr(self, 'build_allocation', 100)  # 0 = all structures, 100 = all probes
        structure_constructing_power = constructing_probes * (1.0 - build_allocation / 100.0)
        structure_construction_rate_kg_day = structure_constructing_power * Config.PROBE_BUILD_RATE  # kg/day per probe
        structure_construction_energy_cost = structure_construction_rate_kg_day * ENERGY_COST_PER_KG_DAY
        breakdown['consumption']['base'] += structure_construction_energy_cost
        breakdown['consumption']['breakdown']['structure_construction'] = structure_construction_energy_cost
        
        # Consumption: Dyson construction energy cost
        dyson_construction_rate = self._calculate_dyson_construction_rate()
        dyson_construction_energy_cost = dyson_construction_rate * ENERGY_COST_PER_KG_DAY
        breakdown['consumption']['base'] += dyson_construction_energy_cost
        breakdown['consumption']['breakdown']['dyson_construction'] = dyson_construction_energy_cost
        
        # Consumption: Research bonuses that reduce consumption
        # Propulsion systems reduce dexterity energy cost
        propulsion_bonus = self._get_research_bonus('propulsion_systems', 'dexterity_energy_cost_reduction', 0.0)
        if propulsion_bonus > 0:
            breakdown['consumption']['upgrades'].append({
                'name': 'Propulsion Systems',
                'bonus': propulsion_bonus,
                'researched': True
            })
        
        # Locomotion systems reduce build/mining energy cost
        locomotion_bonus = self._get_research_bonus('locomotion_systems', 'build_energy_cost_reduction', 0.0)
        if locomotion_bonus > 0:
            breakdown['consumption']['upgrades'].append({
                'name': 'Locomotion Systems',
                'bonus': locomotion_bonus,
                'researched': True
            })
        
        # Computer efficiency reduces probe energy cost (based on compute power)
        compute_power = self.get_compute_power()
        computer_reduction = max(0.0, (compute_power - 1.0) * 0.1)  # 10% reduction per 1.0 compute power bonus
        if computer_reduction > 0:
            breakdown['consumption']['upgrades'].append({
                'name': 'Computer Efficiency',
                'bonus': computer_reduction,
                'researched': True
            })
        
        # Apply consumption reduction bonuses
        total_consumption_reduction = 1.0
        for upgrade in breakdown['consumption']['upgrades']:
            total_consumption_reduction -= upgrade['bonus']
        
        breakdown['consumption']['total'] = breakdown['consumption']['base'] * max(0.1, total_consumption_reduction)
        
        # Apply production efficiency bonus (same as actual consumption calculation)
        production_efficiency_bonus = self._get_research_bonus('production_efficiency', 'energy_efficiency_bonus', 1.0)
        if production_efficiency_bonus > 1.0:
            breakdown['consumption']['total'] /= production_efficiency_bonus
        
        return breakdown
    
    def _calculate_dexterity_breakdown(self):
        """Calculate dexterity breakdown with upgrades."""
        from backend.config import Config
        
        breakdown = {
            'probes': {'base': 0, 'total': 0, 'upgrades': [], 'breakdown': {}},
            'production': {'total': 0, 'probes': {}, 'structures': {}},
            'consumption': {'total': 0, 'dyson': 0, 'probes': 0, 'structures': 0},
            'factories': {'total': 0}
        }
        
        # Base dexterity from probes - single probe type only
        probe_count = self.probes.get('probe', 0)
        probe_data = self._get_probe_data('probe')
        base_dex = probe_data.get('base_dexterity', 1.0) if probe_data else 1.0
        base_dexterity = probe_count * base_dex
        
        breakdown['probes']['base'] = base_dexterity
        
        # Calculate zone-by-zone dexterity breakdown
        zone_breakdown = {}
        for zone_id, zone_probes in self.probes_by_zone.items():
            probe_count_in_zone = zone_probes.get('probe', 0)
            if probe_count_in_zone > 0:
                zone_dexterity = probe_count_in_zone * base_dex
                zone_breakdown[zone_id] = {
                    'probeCount': probe_count_in_zone,
                    'baseDexterity': zone_dexterity
                }
        breakdown['probes']['breakdown'] = zone_breakdown
        
        # Robotic Systems research bonus
        robotic_bonus = self._get_research_bonus('robotic_systems', 'dexterity_multiplier', 1.0)
        if robotic_bonus > 1.0:
            upgrade = self._get_researched_upgrade('robotic_systems', 'manipulator_arms')
            if upgrade:
                breakdown['probes']['upgrades'].append({
                    'name': 'Robotic Systems',
                    'bonus': robotic_bonus - 1.0,
                    'researched': True
                })
        
        # Computer Processing bonus (from computer_processing tree)
        processing_bonus = self._calculate_research_bonus('computer_processing')
        if processing_bonus > 0:
            breakdown['probes']['upgrades'].append({
                'name': 'Computer Processing',
                'bonus': processing_bonus,
                'researched': True
            })
        
        # Calculate total with all multipliers
        total_multiplier = robotic_bonus
        breakdown['probes']['total'] = base_dexterity * total_multiplier
        
        # Metal production breakdown by zone (probes mining)
        harvest_allocation = self.probe_allocations.get('harvest', {})
        total_harvest = sum(harvest_allocation.values())
        probe_mining_breakdown = {}
        
        for zone_id, zone_probes in self.probes_by_zone.items():
            probe_count_in_zone = zone_probes.get('probe', 0)
            zone_allocations = self.probe_allocations_by_zone.get(zone_id, {})
            harvest_alloc_data = zone_allocations.get('harvest', {})
            # harvest_alloc_data is a dict like {'probe': count}, sum all probe types
            if isinstance(harvest_alloc_data, dict):
                mining_probes = sum(harvest_alloc_data.values())
            else:
                # Fallback if it's a number (old format)
                mining_probes = probe_count_in_zone * harvest_alloc_data if harvest_alloc_data else 0
            
            if mining_probes > 0:
                # Calculate mining rate for this zone
                base_harvest_rate = Config.PROBE_HARVEST_RATE  # kg/day
                zone_production = mining_probes * base_harvest_rate
                
                if zone_id not in probe_mining_breakdown:
                    probe_mining_breakdown[zone_id] = {
                        'probeCount': 0,
                        'production': 0
                    }
                probe_mining_breakdown[zone_id]['probeCount'] += mining_probes
                probe_mining_breakdown[zone_id]['production'] += zone_production
        
        breakdown['production']['probes'] = probe_mining_breakdown
        
        # Metal production breakdown by structure type
        structure_mining_breakdown = {}
        for zone_id, zone_structures in self.structures_by_zone.items():
            for building_id, count in zone_structures.items():
                if count <= 0:
                    continue
                building = self.data_loader.get_building_by_id(building_id)
                if building:
                    effects = building.get('effects', {})
                    metal_production = effects.get('metal_production_per_day', 0)
                    if metal_production > 0:
                        total_production = metal_production * count
                        if building_id not in structure_mining_breakdown:
                            structure_mining_breakdown[building_id] = {
                                'name': building.get('name', building_id),
                                'count': 0,
                                'production': 0
                            }
                        structure_mining_breakdown[building_id]['count'] += count
                        structure_mining_breakdown[building_id]['production'] += total_production
        
        breakdown['production']['structures'] = structure_mining_breakdown
        
        # Calculate total metal production
        total_probe_production = sum(z.get('production', 0) for z in probe_mining_breakdown.values())
        total_structure_production = sum(s.get('production', 0) for s in structure_mining_breakdown.values())
        breakdown['production']['total'] = total_probe_production + total_structure_production
        
        # Metal consumption breakdown
        # Dyson construction
        dyson_rate = self._calculate_dyson_construction_rate()
        dyson_metal_consumption = dyson_rate * 0.5  # 50% efficiency
        breakdown['consumption']['dyson'] = dyson_metal_consumption
        
        # Probe construction
        probe_prod_rates, _, factory_metal_cost_per_probe = self._calculate_probe_production()
        total_probe_production_rate = sum(probe_prod_rates.values())
        metal_cost_per_probe = factory_metal_cost_per_probe if factory_metal_cost_per_probe > 0 else Config.PROBE_MASS
        probe_metal_consumption = total_probe_production_rate * metal_cost_per_probe
        breakdown['consumption']['probes'] = probe_metal_consumption
        
        # Structure construction (simplified)
        construct_allocation = self.probe_allocations.get('construct', {})
        constructing_probes = sum(construct_allocation.values())
        structure_fraction = (100 - self.build_allocation) / 100.0
        structure_probes = constructing_probes * structure_fraction
        structure_metal_consumption = structure_probes * Config.PROBE_BUILD_RATE  # kg/day
        breakdown['consumption']['structures'] = structure_metal_consumption
        
        breakdown['consumption']['total'] = dyson_metal_consumption + probe_metal_consumption + structure_metal_consumption
        
        # Factory production
        breakdown['factories']['total'] = total_probe_production_rate
        
        return breakdown
    
    def _calculate_idle_probes(self):
        """Calculate idle probes due to metal constraints.
        
        Returns dict with idle probe counts for dyson, probes (building), and structures.
        """
        from backend.config import Config
        idle_probes = {'dyson': 0.0, 'probes': 0.0, 'structures': 0.0}
        
        # Calculate metal production rate
        metal_production_rate, _ = self._calculate_metal_production()
        
        # Check if we have stored metal
        has_stored_metal = self.metal > 0
        
        # Get build rates to calculate metal consumption
        probe_rate, _, _ = self._calculate_probe_production()
        
        # Calculate metal consumption from probe building
        probe_metal_consumption = 0.0
        for probe_type, rate in probe_rate.items():
            if rate > 0:
                probe_data = self._get_probe_data(probe_type)
                metal_cost = probe_data.get('base_cost_metal', Config.PROBE_MASS) if probe_data else Config.PROBE_MASS
                probe_metal_consumption += rate * metal_cost
        
        # Calculate metal consumption from Dyson construction
        dyson_rate = self._calculate_dyson_construction_rate()
        dyson_metal_consumption = dyson_rate * 0.5  # 50% efficiency
        
        total_metal_consumption = probe_metal_consumption + dyson_metal_consumption
        
        # If no stored metal and consumption > production, calculate idle probes
        if not has_stored_metal and total_metal_consumption > metal_production_rate:
            # Calculate idle probe fractions
            if total_metal_consumption > 0:
                metal_deficit = total_metal_consumption - metal_production_rate
                
                # Proportionally distribute idle probes
                if probe_metal_consumption > 0:
                    probe_fraction = probe_metal_consumption / total_metal_consumption
                    probe_deficit = metal_deficit * probe_fraction
                    # Convert back to idle probe count (approximate)
                    # Need to find which probes are building
                    construct_allocation = self.probe_allocations.get('construct', {})
                    constructing_probes = sum(construct_allocation.values())
                    probe_fraction_alloc = self.build_allocation / 100.0
                    probe_building_probes = constructing_probes * probe_fraction_alloc
                    if probe_metal_consumption > 0:
                        idle_probes['probes'] = probe_building_probes * (probe_deficit / probe_metal_consumption)
                
                if dyson_metal_consumption > 0:
                    dyson_fraction = dyson_metal_consumption / total_metal_consumption
                    dyson_deficit = metal_deficit * dyson_fraction
                    # Convert back to idle probe count (approximate - dexterity based)
                    dyson_allocation = self.probe_allocations.get('dyson', {})
                    total_dyson_probes = sum(dyson_allocation.values())
                    if dyson_metal_consumption > 0:
                        idle_probes['dyson'] = total_dyson_probes * (dyson_deficit / dyson_metal_consumption)
        elif not has_stored_metal and metal_production_rate <= 0:
            # No stored metal and no production - all build probes are idle
            construct_allocation = self.probe_allocations.get('construct', {})
            constructing_probes = sum(construct_allocation.values())
            probe_fraction = self.build_allocation / 100.0
            idle_probes['probes'] = constructing_probes * probe_fraction
            idle_probes['structures'] = constructing_probes * (1.0 - probe_fraction)
            
            dyson_allocation = self.probe_allocations.get('dyson', {})
            idle_probes['dyson'] = sum(dyson_allocation.values())
        
        return idle_probes
    
    def _calculate_research_allocation_info(self):
        """Calculate how many FLOPS are allocated to each enabled research project."""
        total_intelligence_flops = self._calculate_intelligence_production()
        
        # Count enabled projects (same logic as _update_research)
        enabled_projects = []
        research_trees = self.data_loader.get_all_research_trees()
        
        for tree_id, tree_data in research_trees.items():
            if tree_id not in self.research:
                continue
            
            if 'tiers' in tree_data:
                tiers_list = tree_data['tiers']
                for idx, tier in enumerate(tiers_list):
                    tier_id = tier['id']
                    if tier_id not in self.research[tree_id]:
                        continue
                    
                    tier_data = self.research[tree_id][tier_id]
                    if tier_data.get('enabled', False):
                        tranches_completed = tier_data.get('tranches_completed', 0)
                        max_tranches = tier.get('tranches', 10)
                        if tranches_completed < max_tranches:
                            can_research = True
                            if idx > 0:
                                prev_tier = tiers_list[idx - 1]
                                prev_tier_id = prev_tier['id']
                                if prev_tier_id in self.research[tree_id]:
                                    prev_completed = self.research[tree_id][prev_tier_id].get('tranches_completed', 0)
                                    prev_max = prev_tier.get('tranches', 10)
                                    if prev_completed < prev_max:
                                        can_research = False
                                else:
                                    can_research = False
                            
                            if can_research:
                                enabled_projects.append((tree_id, tier_id))
        
        # Calculate FLOPS per project
        flops_per_project = total_intelligence_flops / len(enabled_projects) if len(enabled_projects) > 0 else 0
        
        # Build allocation info dict
        allocation_info = {}
        for tree_id, tier_id in enabled_projects:
            if tree_id not in allocation_info:
                allocation_info[tree_id] = {}
            allocation_info[tree_id][tier_id] = flops_per_project
        
        return allocation_info
    
    def _calculate_intelligence_breakdown(self):
        """Calculate intelligence breakdown with upgrades."""
        breakdown = {
            'probes': {'base': 0, 'total': 0, 'upgrades': []},
            'structures': {'base': 0, 'total': 0, 'breakdown': {}},
            'total': 0
        }
        
        # FLOPS now come from Dyson sphere only
        # 1 PFLOPS/s per kg of Dyson sphere mass
        base_intelligence_flops = self.dyson_sphere_mass * 1e15  # 1 PFLOPS/s per kg
        breakdown['probes']['base'] = base_intelligence_flops
        breakdown['probes']['total'] = base_intelligence_flops
        
        # Research structures - in FLOPS (from zone-based structures)
        structure_intelligence_flops = 0
        structure_breakdown = {}  # Detailed breakdown by building type
        
        # Check zone-based structures (new system)
        for zone_id, zone_structures in self.structures_by_zone.items():
            for building_id, count in zone_structures.items():
                building = self.data_loader.get_building_by_id(building_id)
                if building:
                    effects = building.get('effects', {})
                    intelligence_output_flops = effects.get('intelligence_flops', 0)
                    if intelligence_output_flops == 0:
                        # Legacy: convert from intelligence_per_second
                        intelligence_output = effects.get('intelligence_production_per_second', 0) or effects.get('intelligence_per_second', 0)
                        intelligence_output_flops = intelligence_output * 1e12
                    
                    if intelligence_output_flops > 0:
                        total_flops = intelligence_output_flops * count
                        structure_intelligence_flops += total_flops
                        
                        # Add to detailed breakdown
                        if building_id not in structure_breakdown:
                            structure_breakdown[building_id] = {
                                'name': building.get('name', building_id),
                                'count': 0,
                                'flops': 0
                            }
                        structure_breakdown[building_id]['count'] += count
                        structure_breakdown[building_id]['flops'] += total_flops
        
        # Also check legacy global structures for backward compatibility
        for building_id, count in self.structures.items():
            # Skip if already counted in zone structures
            already_counted = False
            for zone_structures in self.structures_by_zone.values():
                if building_id in zone_structures:
                    already_counted = True
                    break
            if already_counted:
                continue
            
            building = self.data_loader.get_building_by_id(building_id)
            if building:
                effects = building.get('effects', {})
                intelligence_output_flops = effects.get('intelligence_flops', 0)
                if intelligence_output_flops == 0:
                    # Legacy: convert from intelligence_per_second
                    intelligence_output = effects.get('intelligence_production_per_second', 0) or effects.get('intelligence_per_second', 0)
                    intelligence_output_flops = intelligence_output * 1e12
                
                if intelligence_output_flops > 0:
                    total_flops = intelligence_output_flops * count
                    structure_intelligence_flops += total_flops
                    
                    # Add to detailed breakdown
                    if building_id not in structure_breakdown:
                        structure_breakdown[building_id] = {
                            'name': building.get('name', building_id),
                            'count': 0,
                            'flops': 0
                        }
                    structure_breakdown[building_id]['count'] += count
                    structure_breakdown[building_id]['flops'] += total_flops
        
        breakdown['structures']['base'] = structure_intelligence_flops
        breakdown['structures']['total'] = structure_intelligence_flops
        breakdown['structures']['breakdown'] = structure_breakdown
        breakdown['total'] = breakdown['probes']['total'] + breakdown['structures']['total']
        
        return breakdown
    
    def _get_probe_data(self, probe_type):
        """Get probe data by type."""
        probes = self.data_loader.get_probes()
        for probe in probes:
            if probe.get('id') == probe_type:
                return probe
        return None
    
    def _get_building_category(self, building_id):
        """Get building category."""
        buildings = self.data_loader.load_buildings()
        
        for category, items in buildings.items():
            if isinstance(items, list):
                for building in items:
                    if building.get('id') == building_id:
                        return category
        return None
    
    def perform_action(self, action_type, action_data):
        """Perform a game action.
        
        DEPRECATED: This method should NOT be called during runtime gameplay.
        All game actions now run locally in JavaScript. Python GameEngine is only
        used for initialization to generate the initial game state.
        """
        warnings.warn(
            "GameEngine.perform_action() is deprecated. Game actions now run locally in JavaScript. "
            "Python GameEngine is only used for initialization.",
            DeprecationWarning,
            stacklevel=2
        )
        if action_type == 'purchase_structure':
            return self._purchase_structure(action_data)
        elif action_type == 'purchase_probe':
            return self._purchase_probe(action_data)
        elif action_type == 'allocate_probes':
            return self._allocate_probes(action_data)
        elif action_type == 'allocate_research':
            return self._allocate_research(action_data)
        elif action_type == 'toggle_research_category':
            return self._toggle_research_category(action_data)
        elif action_type == 'set_factory_production':
            return self._set_factory_production(action_data)
        elif action_type == 'set_economy_slider':
            return self._set_economy_slider(action_data)
        elif action_type == 'set_build_allocation':
            return self._set_build_allocation(action_data)
        elif action_type == 'set_dyson_power_allocation':
            return self._set_dyson_power_allocation(action_data)
        elif action_type == 'set_mine_build_slider':
            return self._set_mine_build_slider(action_data)
        elif action_type == 'set_harvest_zone':
            return self._set_harvest_zone(action_data)
        elif action_type == 'toggle_research_category':
            return self._toggle_research_category(action_data)
        else:
            raise ValueError(f"Unknown action type: {action_type}")
    
    def _purchase_structure(self, action_data):
        """Toggle structure construction enabled/disabled."""
        building_id = action_data.get('building_id')
        zone_id = action_data.get('zone_id', None)
        enabled = action_data.get('enabled', None)
        
        building = self.data_loader.get_building_by_id(building_id)
        if not building:
            raise ValueError(f"Building not found: {building_id}")
        
        # Check if building is allowed in the zone
        if zone_id:
            zones = self.data_loader.load_orbital_mechanics()
            zone_data = next((z for z in zones if z['id'] == zone_id), None)
            if zone_data:
                is_dyson_zone = zone_data.get('is_dyson_zone', False)
                building_category = self._get_building_category(building_id)
                
                # Mining buildings cannot be built in Dyson zone (no minerals to mine)
                if is_dyson_zone and building_category == 'mining':
                    raise ValueError(f"Mining buildings cannot be built in Dyson zone (no minerals to mine)")
                
                # For non-mining buildings in Dyson zone, allow them even if not in allowed_orbital_zones
                # For other zones, check allowed_orbital_zones
                if not is_dyson_zone:
                    allowed_zones = building.get('allowed_orbital_zones', [])
                    if allowed_zones and zone_id not in allowed_zones:
                        raise ValueError(f"Building {building_id} is not allowed in zone {zone_id}")
        
        # Check prerequisites
        prerequisites = building.get('prerequisites', [])
        for prereq in prerequisites:
            # Check if prerequisite structure exists
            if prereq not in self.structures or self.structures[prereq] <= 0:
                raise ValueError(f"Prerequisite not met: {prereq}")
        
        # Toggle enabled state
        if enabled is None:
            # Toggle if not specified
            enabled = building_id not in self.enabled_construction
        
        if enabled:
            # Enable construction for this building type
            self.enabled_construction.add(building_id)
            # Start construction progress if not already in progress
            if building_id not in self.structure_construction_progress:
                self.structure_construction_progress[building_id] = 0.0
        else:
            # Disable construction
            self.enabled_construction.discard(building_id)
            # Note: Don't remove construction progress - let it finish if in progress
        
        return {'success': True, 'building_id': building_id, 'enabled': enabled}
    
    def _purchase_probe(self, action_data):
        """Purchase a probe."""
        probe_type = action_data.get('probe_type', 'probe')
        
        probe_data = self._get_probe_data(probe_type)
        if not probe_data:
            raise ValueError(f"Probe type not found: {probe_type}")
        
        # Check prerequisites
        prerequisites = probe_data.get('prerequisites', [])
        for prereq in prerequisites:
            # Check if prerequisite structure exists
            found = False
            for z_id, structures in self.structures.items():
                if prereq in structures:
                    found = True
                    break
            if not found:
                raise ValueError(f"Prerequisite not met: {prereq}")
        
        # Check costs
        cost_metal = probe_data.get('base_cost_metal', 0)
        cost_energy = probe_data.get('base_cost_energy', 0)
        
        if self.metal < cost_metal:
            raise ValueError(f"Insufficient metal: need {cost_metal}, have {self.metal}")
        if self.energy < cost_energy:
            raise ValueError(f"Insufficient energy: need {cost_energy}, have {self.energy}")
        
        # Purchase
        self.metal -= cost_metal
        self.energy -= cost_energy
        
        # Add probe
        if probe_type not in self.probes:
            self.probes[probe_type] = 0
        self.probes[probe_type] += 1
        
        # Auto-allocate newly purchased probe if it's a 'probe' type
        if probe_type == 'probe':
            self._auto_allocate_probes()
        
        return {'success': True, 'probe_type': probe_type}
    
    def _allocate_probes(self, action_data):
        """Allocate probes to tasks."""
        allocations = action_data.get('allocations', {})
        
        # First, validate that total allocations don't exceed available probes
        # Calculate total requested per probe type across all tasks
        total_requested = {}
        for task, probe_counts in allocations.items():
            if task not in self.probe_allocations:
                continue
            for probe_type, count in probe_counts.items():
                if probe_type not in self.probe_allocations[task]:
                    continue
                if probe_type not in total_requested:
                    total_requested[probe_type] = 0.0
                total_requested[probe_type] += count
        
        # Validate totals don't exceed available
        for probe_type, total_count in total_requested.items():
            available = self.probes.get(probe_type, 0)
            if total_count > available + 0.001:  # Small tolerance for floating point
                raise ValueError(f"Not enough {probe_type}: have {available}, need {total_count}")
        
        # Reset allocations for tasks that are being updated
        # Only reset the tasks that are explicitly provided
        tasks_to_reset = set(allocations.keys())
        for task in tasks_to_reset:
            if task in self.probe_allocations:
                # Reset all probe types for this task
                for probe_type in self.probe_allocations[task]:
                    self.probe_allocations[task][probe_type] = 0.0
        
        # Set new allocations
        for task, probe_counts in allocations.items():
            if task not in self.probe_allocations:
                continue
            
            for probe_type, count in probe_counts.items():
                if probe_type not in self.probe_allocations[task]:
                    continue
                
                # Set allocation (count can be fractional)
                self.probe_allocations[task][probe_type] = max(0.0, count)
        
        return {'success': True, 'allocations': self.probe_allocations}
    
    def _set_factory_production(self, action_data):
        """Set factory production level (no longer zone-specific)."""
        building_id = action_data.get('building_id')
        production = action_data.get('production', 0)  # 0-100
        
        # Validate production is between 0 and 100
        production = max(0, min(100, production))
        self.factory_production[building_id] = production
        
        return {'success': True, 'production': production}
    
    def _set_economy_slider(self, action_data):
        """Set economy slider value (0 = all Dyson, 100 = all Economy)."""
        value = action_data.get('value', 50)
        
        # Validate value is between 0 and 100
        self.economy_slider = max(0, min(100, value))
        
        # Re-allocate probes based on new slider setting
        self._auto_allocate_probes()
        
        return {'success': True, 'economy_slider': self.economy_slider}
    
    def _set_build_allocation(self, action_data):
        """Set build allocation value (0 = all structures, 100 = all probes)."""
        value = action_data.get('value', 100)
        
        # Validate value is between 0 and 100
        self.build_allocation = max(0, min(100, value))
        
        # Note: build_allocation affects production, not allocation, so no need to re-allocate
        
        return {'success': True, 'build_allocation': self.build_allocation}
    
    def _set_dyson_power_allocation(self, action_data):
        """Set Dyson power allocation value (0 = all economy/energy, 100 = all compute)."""
        value = action_data.get('value', 0)
        
        # Validate value is between 0 and 100
        self.dyson_power_allocation = max(0, min(100, value))
        
        # This affects energy and intelligence production, no need to re-allocate probes
        
        return {'success': True, 'dyson_power_allocation': self.dyson_power_allocation}
    
    def _set_mine_build_slider(self, action_data):
        """Set mine/build slider value (0 = all mine/harvest, 100 = all build/construct)."""
        value = action_data.get('value', 50)
        
        # Validate value is between 0 and 100
        self.mine_build_slider = max(0, min(100, value))
        
        # Re-allocate probes based on new slider setting
        self._auto_allocate_probes()
        
        return {'success': True, 'mine_build_slider': self.mine_build_slider}
    
    def _auto_allocate_probes(self):
        """Automatically allocate all probes based on slider settings.
        
        Allocation logic:
        1. economy_slider: Split between Dyson (0-100%) and Economy (0-100%)
        2. Within Economy: mine_build_slider splits between harvest (0-100%) and construct (0-100%)
        3. build_allocation is used in production calculations, not allocation
        
        Only 'probe' type (Von Neumann) probes are auto-allocated.
        Single probe type only - all probes are auto-allocated based on sliders.
        """
        # Get total available 'probe' type probes
        total_probes = self.probes.get('probe', 0)
        
        if total_probes <= 0:
            # No probes to allocate, reset allocations
            self.probe_allocations['harvest']['probe'] = 0.0
            self.probe_allocations['construct']['probe'] = 0.0
            self.probe_allocations['dyson']['probe'] = 0.0
            return
        
        # Step 1: Split between Dyson and Economy based on economy_slider
        # economy_slider: 0 = all Dyson, 100 = all Economy
        economy_fraction = self.economy_slider / 100.0
        dyson_fraction = 1.0 - economy_fraction
        
        dyson_probes = total_probes * dyson_fraction
        economy_probes = total_probes * economy_fraction
        
        # Step 2: Within Economy, split between harvest and construct based on mine_build_slider
        # mine_build_slider: 0 = all harvest, 100 = all construct
        construct_fraction = self.mine_build_slider / 100.0
        harvest_fraction = 1.0 - construct_fraction
        
        harvest_probes = economy_probes * harvest_fraction
        construct_probes = economy_probes * construct_fraction
        
        # Allocate probes (round to handle fractional probes)
        self.probe_allocations['dyson']['probe'] = dyson_probes
        self.probe_allocations['harvest']['probe'] = harvest_probes
        self.probe_allocations['construct']['probe'] = construct_probes
        
        # Ensure allocations don't exceed total (due to rounding)
        total_allocated = (self.probe_allocations['dyson']['probe'] + 
                         self.probe_allocations['harvest']['probe'] + 
                         self.probe_allocations['construct']['probe'])
        
        if total_allocated > total_probes + 0.001:  # Small tolerance for floating point
            # Scale down proportionally
            scale = total_probes / total_allocated if total_allocated > 0 else 0
            self.probe_allocations['dyson']['probe'] *= scale
            self.probe_allocations['harvest']['probe'] *= scale
            self.probe_allocations['construct']['probe'] *= scale
    
    def _set_harvest_zone(self, action_data):
        """Set harvest zone (which zone to harvest metal from)."""
        zone_id = action_data.get('zone_id', 'earth')
        
        # Validate zone exists
        zones = self.data_loader.load_orbital_mechanics()
        zone_ids = [z['id'] for z in zones]
        if zone_id not in zone_ids:
            raise ValueError(f"Invalid zone_id: {zone_id}")
        
        self.harvest_zone = zone_id
        
        return {'success': True, 'harvest_zone': self.harvest_zone}
    
    def _allocate_research(self, action_data):
        """Toggle research tier enabled/disabled state."""
        tree_id = action_data.get('tree_id')
        tier_id = action_data.get('tier_id')
        enabled = action_data.get('enabled', False)
        
        if tree_id not in self.research:
            raise ValueError(f"Research tree not found: {tree_id}")
        
        if tier_id not in self.research[tree_id]:
            raise ValueError(f"Research tier not found: {tier_id}")
        
        # Toggle enabled state
        self.research[tree_id][tier_id]['enabled'] = enabled
        
        return {'success': True, 'tree_id': tree_id, 'tier_id': tier_id, 'enabled': enabled}
    
    def _toggle_research_category(self, action_data):
        """Toggle all research in a category (energy, dexterity, intelligence)."""
        category = action_data.get('category')
        enabled = action_data.get('enabled', False)
        
        if category not in ['energy', 'dexterity', 'intelligence']:
            raise ValueError(f"Invalid category: {category}")
        
        research_trees = self.data_loader.get_all_research_trees()
        toggled_count = 0
        
        # Map category to tree IDs
        category_trees = {
            'energy': ['energy_collection', 'energy_storage', 'energy_transport', 'energy_conversion', 'thermal_management', 'heat_pump_systems'],
            'dexterity': ['propulsion_systems', 'locomotion_systems', 'acds', 'robotic_systems', 
                         'dyson_swarm_construction', 'production_efficiency', 'recycling_efficiency',
                         'thrust_systems', 'materials_science', 'actuator_systems'],
            'intelligence': ['research_rate_efficiency', 'computer_gpu', 'computer_interconnect', 
                             'computer_interface', 'computer_processing', 'machine_learning', 'sensor_systems']
        }
        
        # Toggle all tiers in category trees
        for tree_id in category_trees.get(category, []):
            if tree_id not in self.research:
                continue
            
            tree_data = research_trees.get(tree_id)
            if not tree_data:
                continue
            
            # Toggle regular tiers
            if 'tiers' in tree_data:
                for tier in tree_data['tiers']:
                    tier_id = tier['id']
                    if tier_id in self.research[tree_id]:
                        self.research[tree_id][tier_id]['enabled'] = enabled
                        toggled_count += 1
        
        return {'success': True, 'category': category, 'enabled': enabled, 'toggled_count': toggled_count}
    
    def recycle_factory(self, factory_id):
        """Recycle a factory (no longer zone-specific).
        
        DEPRECATED: This method should NOT be called during runtime gameplay.
        Factory recycling now runs locally in JavaScript. Python GameEngine is only
        used for initialization to generate the initial game state.
        """
        warnings.warn(
            "GameEngine.recycle_factory() is deprecated. Factory recycling now runs locally in JavaScript. "
            "Python GameEngine is only used for initialization.",
            DeprecationWarning,
            stacklevel=2
        )
        if factory_id not in self.structures:
            raise ValueError(f"Factory {factory_id} not found")
        
        if self.structures[factory_id] <= 0:
            raise ValueError(f"No factories of type {factory_id} to recycle")
        
        # Get factory data
        building = self.data_loader.get_building_by_id(factory_id)
        if not building:
            raise ValueError(f"Building not found: {factory_id}")
        
        # Calculate recycling return (buildings now only cost metal, so only return metal)
        recycling_efficiency = self._get_recycling_efficiency()
        
        cost_metal = building.get('base_cost_metal', 0)
        
        metal_returned = cost_metal * recycling_efficiency
        slag_produced = cost_metal * (1 - recycling_efficiency)
        
        # Recycle
        self.metal += metal_returned
        self.slag += slag_produced
        
        # Remove factory
        self.structures[factory_id] -= 1
        if self.structures[factory_id] <= 0:
            del self.structures[factory_id]
        
        return {
            'success': True,
            'metal_returned': metal_returned,
            'energy_returned': 0,
            'slag_produced': slag_produced
        }

