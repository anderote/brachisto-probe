# Files Created for Brachisto-Probe Game

## Current File Structure

```
game_data/
├── orbital_mechanics.json          ✓ Created
├── buildings.json                   ✓ Created
├── additional_research_trees.json   ✓ Created
├── README.md                        ✓ Created
└── new_systems_summary.md          ✓ Created
```

## File Descriptions

### 1. `orbital_mechanics.json`
Contains the orbital radius system with 8 orbital zones:
- Mercury, Venus, Earth, Mars, Asteroid Belt, Jupiter, Saturn, Kuiper Belt
- Delta-v penalties, energy multipliers, productivity modifiers
- Distance-based formulas for compute efficiency and construction bonuses
- Color codes for visualization

### 2. `buildings.json`
Comprehensive buildings system:
- **8 Factory Tiers**: Mobile Factory → System-Wide Fabrication Network
- **Orbital Capacity System**: Buildings with max capacity limits and declining returns
- **5 Specialized Probe Types**: Von Neumann, Miner, Compute, Energy, Construction
- **9 Mining Structures**: From basic rigs to nanobot swarms
- **6 Energy Structures**: Solar arrays to antimatter storage
- **7 Transportation Structures**: Mass drivers to transport networks
- **4 Capacity-Limited Buildings**: Shipyards, data centers, research stations, relay stations

### 3. `additional_research_trees.json`
Three new research trees:
- **Dyson Swarm Construction** (9 tiers): Construction rate optimization
- **Production Efficiency** (10 tiers): Manufacturing and waste reduction
- **Energy Collection Efficiency** (10 tiers): Solar and energy systems

### 4. `README.md`
Overview and integration guide for all game data files.

### 5. `new_systems_summary.md`
Detailed documentation of new systems:
- Orbital build capacity mechanics
- Factory progression system
- Specialized probe types
- Building categories
- Research tree explanations
- Strategy and balance considerations

## Note on Research Trees

The original comprehensive `research_trees.json` file (with Propulsion, Locomotion, ACDS, Robotic Systems, and Computer Systems) is not included here but should contain:

- **Propulsion Systems**: 9 tiers (Hydrazine Rockets → MHD Inertial Mass Reduction)
- **Locomotion Systems**: 8 tiers (Cold Gas Thrusters → Unruh Horizon Higgs)
- **ACDS**: 8 tiers (Gravity Boom → Invariant Manifold)
- **Robotic Systems**: 7 tiers (Manipulator Arms → Zero-Point Disruptors)
- **Computer Systems**: 30+ tiers across 4 subcategories (Processing, Memory, Interface, Transmission)

This file would be quite large (several thousand lines). If needed, it should be created separately or can be referenced from the original design specifications.

## All Changes Applied

All the work from the planning and design sessions has been consolidated into this worktree. The files are ready for integration into the game engine.

## Next Steps

1. Load JSON files into game engine
2. Implement orbital capacity system
3. Implement specialized probe system
4. Create original research_trees.json if needed
5. Test balance with target gameplay time (15-20 minutes)
