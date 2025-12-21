# Brachisto-Probe Game Data

This directory contains all game configuration data for the Brachisto-Probe incremental game.

## File Structure

### Core Configuration Files

1. **`orbital_mechanics.json`**
   - Defines 8 orbital zones (Mercury through Kuiper Belt)
   - Orbital properties: delta-v penalties, energy multipliers, productivity modifiers
   - Distance-based formulas for compute efficiency and construction bonuses
   - Color codes for visualization

2. **`buildings.json`**
   - All constructible structures organized by category:
     - Factories (8 tiers: Mobile → System-Wide Fabrication)
     - Capacity-limited buildings (orbital shipyards, data centers, etc.)
     - Mining structures (9 types)
     - Energy structures (6 types)
     - Transportation structures (7 types)
     - Specialized units (5 probe types)
   - Orbital capacity system with declining returns
   - Orbital efficiency multipliers per zone
   - Prerequisites and costs

3. **`additional_research_trees.json`**
   - New research trees for:
     - Dyson Swarm Construction (9 tiers)
     - Production Efficiency (10 tiers)
     - Energy Collection Efficiency (10 tiers)

### Note on Research Trees

The original comprehensive `research_trees.json` file should contain:
- **Propulsion Systems** (9 tiers): Hydrazine → MHD Inertial Mass Reduction
- **Locomotion Systems** (8 tiers): Cold Gas → Unruh Horizon Higgs
- **ACDS** (8 tiers): Gravity Boom → Invariant Manifold
- **Robotic Systems** (7 tiers): Manipulator Arms → Zero-Point Disruptors
- **Computer Systems** (4 subcategories, 30+ tiers):
  - Processing (11 tiers)
  - Memory (9 tiers)
  - Interface (5 tiers)
  - Transmission (5 tiers)

If this file is missing, you may need to recreate it from the original design specifications.

## Documentation Files

- **`new_systems_summary.md`**: Detailed explanation of new systems (orbital capacity, factories, specialized probes)
- **`game_mechanics_explanation.md`**: Comprehensive game mechanics documentation (if created)
- **`quick_reference.md`**: Quick lookup guide for buildings, probes, and formulas (if created)

## Key Systems

### Orbital Build Capacity
Some buildings have maximum capacity per orbit. After max capacity, efficiency declines:
```
efficiency = base_efficiency * (1 / (1 + (count - max_capacity) * 0.1))
```

### Factory Progression
8 factory sizes consuming increasing orbital capacity:
1. Mobile Factory (capacity: 1)
2. Probe Factory (capacity: 3)
3. Probe Forge (capacity: 8)
4. Orbital Shipyard (capacity: 20, max 5/orbit)
5. Mega Shipyard (capacity: 50, max 3/orbit)
6. Orbital Assembly Complex (capacity: 120, max 2/orbit)
7. Planetary-Scale Foundry (capacity: 300, max 1/orbit)
8. System-Wide Fabrication Network (capacity: 1000, max 1/system)

### Specialized Probes
5 probe types with different capabilities:
- **Von Neumann Probe**: General purpose (default)
- **Miner Probe**: Specialized for harvesting (1.8× efficiency)
- **Compute Probe**: Generates intelligence for research
- **Energy Probe**: Generates energy (+2.0/s)
- **Construction Probe**: Optimized for building (2.0× construction efficiency)

### Distance-Based Mechanics

**Compute Efficiency** (decreases with distance from Dyson sphere at 1 AU):
```
efficiency = 1 / (1 + (distance_au - 1.0)² * 0.1)
```

**Construction Bonus** (increases closer to Sun):
```
bonus = 1 + (1.0 - distance_au) * 0.3
```

**Solar Energy** (inverse square law):
```
energy = base * (1.0 / distance_au)²
```

## Integration

These JSON files should be loaded at game startup:

```python
import json

with open('game_data/orbital_mechanics.json') as f:
    orbital_zones = json.load(f)

with open('game_data/buildings.json') as f:
    buildings = json.load(f)

with open('game_data/additional_research_trees.json') as f:
    additional_research = json.load(f)
```

## Balance Targets

- **Gameplay Time**: 15-20 minutes (900-1200 seconds) for normal play
- **Fast Play**: 10 minutes (600 seconds) - optimal strategy
- **Slow Play**: 30 minutes (1800 seconds) - casual/suboptimal

## Notes

- All costs are in base units (metal in kg, energy in watts)
- Research uses tranche system (typically 10 tranches per tier)
- Buildings specify allowed orbital zones and efficiency multipliers
- Specialized probes unlock based on research prerequisites
- Capacity-limited buildings prevent trivial solutions through spamming
