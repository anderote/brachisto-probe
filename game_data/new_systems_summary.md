# New Systems Summary

## Orbital Build Capacity System

### Concept
Some buildings can be built in any orbit up to a maximum capacity per orbit. After reaching max capacity, building additional structures results in declining returns with performance penalties.

### Formula
```
efficiency = base_efficiency * (1 / (1 + (count - max_capacity) * 0.1))
```

Example: If max_capacity = 5 and you build 6 buildings:
- Efficiency = base_efficiency * (1 / (1 + (6 - 5) * 0.1))
- Efficiency = base_efficiency * (1 / 1.1) = 90.9% efficiency

This creates strategic decisions: do you build many inefficient buildings, or optimize placement?

### Buildings with Capacity Limits
- **Orbital Fabrication Shipyards**: Max 8 per orbit
- **Orbital Data Centers**: Max 6 per orbit
- **Research Orbital Stations**: Max 5 per orbit
- **Quantum Relay Stations**: Max 4 per orbit
- **Orbital Shipyards**: Max 5 per orbit
- **Mega Shipyards**: Max 3 per orbit
- **Orbital Assembly Complexes**: Max 2 per orbit
- **Planetary-Scale Foundries**: Max 1 per orbit
- **System-Wide Fabrication Networks**: Max 1 per orbit

## Factory Progression System

Factories are now organized by size, each requiring more orbital build capacity but providing exponentially better production:

### Factory Tiers
1. **Mobile Factory** (capacity: 1)
   - Smallest, most flexible
   - 1.2× probe production
   - Can be built early game

2. **Probe Factory** (capacity: 3)
   - Standard facility
   - 2.0× probe production
   - Better efficiency

3. **Probe Forge** (capacity: 8)
   - Advanced manufacturing
   - 4.0× probe production
   - High-temperature operations

4. **Orbital Shipyard** (capacity: 20, max 5/orbit)
   - Large-scale construction
   - 8.0× probe production
   - Can build structures too

5. **Mega Shipyard** (capacity: 50, max 3/orbit)
   - Massive facility
   - 15.0× probe production
   - Parallel assembly lines

6. **Orbital Assembly Complex** (capacity: 120, max 2/orbit)
   - Planetary-scale
   - 30.0× probe production
   - Integrated logistics

7. **Planetary-Scale Foundry** (capacity: 300, max 1/orbit)
   - Enormous complex
   - 60.0× probe production
   - Maximum single-orbit production

8. **System-Wide Fabrication Network** (capacity: 1000, max 1/system)
   - Ultimate production
   - 150.0× probe production
   - Distributed across system

### Orbital Build Capacity
Each factory consumes "orbital build capacity" - a limit on how much infrastructure can be built in each orbital zone. This prevents simply spamming factories and forces strategic placement decisions.

## Specialized Unit Types

Probes are no longer just generic units. Different probe types have specialized functions:

### Probe Types

1. **Von Neumann Probe** (default)
   - Cost: 100 metal, 50 energy
   - Base dexterity: 1.0
   - Can harvest, construct, and build Dyson sphere
   - Energy consumption: 1.0/s
   - General-purpose

2. **Miner Probe**
   - Cost: 120 metal, 40 energy
   - Base dexterity: 1.5
   - 1.8× harvest efficiency
   - Cannot construct
   - Lower energy cost (0.8/s)
   - Specialized for mining operations

3. **Compute Probe**
   - Cost: 150 metal, 60 energy
   - Base dexterity: 0.5 (lower physical capability)
   - Base intelligence: 2.0 (high research capability)
   - Generates 5.0 intelligence/second
   - 1.5× energy consumption
   - Specialized for research

4. **Energy Probe**
   - Cost: 130 metal, 55 energy
   - Base dexterity: 0.8
   - Generates 2.0 energy/second (net positive)
   - Can harvest but cannot construct
   - Energy-generating unit

5. **Construction Probe**
   - Cost: 140 metal, 70 energy
   - Base dexterity: 1.8
   - 2.0× construction efficiency
   - 1.5× Dyson construction efficiency
   - Cannot harvest
   - Specialized for building

### Strategy Implications
- Early game: Build general probes for flexibility
- Mid game: Specialize into miners and constructors
- Research phase: Build compute probes
- Energy-limited: Build energy probes
- Dyson construction: Build construction probes

## New Building Types

### Mining Structures
- **Spaceport**: Transportation hub, improves mining efficiency
- **Refinery**: Basic metal processing, reduces slag
- **Industrial Refinery**: Advanced processing, high efficiency
- **Earth Harvester**: Planetary-scale mining (Earth only)
- **Grinder Station**: Asteroid processing (asteroid belt)
- **Nanobot Swarm Dissembler**: Molecular-level extraction
- **Asteroid Conversion Facility**: Direct asteroid-to-material conversion
- **Gas Harvester**: Gas giant atmosphere extraction
- **Ice Miner**: Comet/ice asteroid mining

### Energy Structures
- **Basic Solar Array**: Standard photovoltaics
- **Concentrated Solar Farm**: Mirror arrays
- **Orbital Solar Megastructure**: Massive solar collection (inner orbits)
- **Fusion Reactor Array**: Multiple fusion reactors
- **Antimatter Storage Facility**: Energy stockpiling
- **Energy-Matter Converter Beam**: Converts energy to matter

### Transportation Structures
- **Orbital Electromagnetic Ram Drive**: Solar wind propulsion
- **Eos Flux Drive Liner**: Advanced transport vessels
- **Material Transport Network**: System-wide logistics

### Capacity-Limited Structures
- **Orbital Fabrication Shipyard**: Flexible manufacturing (max 8/orbit)
- **Orbital Data Center**: Computing facility (max 6/orbit)
- **Research Orbital Station**: Dedicated research (max 5/orbit)
- **Quantum Relay Station**: Communication hub (max 4/orbit)

## New Research Trees

### 1. Dyson Swarm Construction
Focus: Optimizing Dyson sphere/swarm construction rates

**Tiers:**
1. Multi-Body Agent Coordination Schemas
2. Large-Scale Deployment Patterns
3. Modular Articulated Structures
4. Kessler-Enhanced Chaotic Dynamic Control
5. Perturbative Swarm Solutions
6. De-Localized Intelligence Cloud
7. Thin-Plasma Communications Relays
8. Quantum Entangled Swarm Coordination
9. Autonomous Self-Replication Protocols

**Effects:**
- Increases Dyson construction rate (up to 65% bonus)
- Improves swarm coordination
- Enables self-replication at max tier

### 2. Production Efficiency
Focus: Manufacturing rates, material efficiency, waste reduction

**Tiers:**
1. Standard Design Patterns
2. Adaptive Learning Controllers
3. In-Situ Resource Hybridization
4. Stamp Forging
5. Additive Laser Manufacturing
6. Single-Crystal Blown Nickel Forgings
7. Carbon Alloy Composite
8. Isoline Grid Aesthetics
9. Molecular Assembly Manufacturing
10. Quantum Coherent Material Synthesis

**Effects:**
- Increases production rates (up to 65% bonus)
- Reduces waste
- Improves material quality

### 3. Energy Collection Efficiency
Focus: Solar energy collection, conversion efficiency, storage

**Tiers:**
1. Photovoltaic Cell Optimization
2. Multi-Junction Solar Cells
3. Concentrated Solar Optics
4. Thermal Energy Storage
5. Quantum Dot Solar Arrays
6. Orbital Solar Swarm Arrays
7. Stirling Engine Conversion Arrays
8. Thermophotovoltaic Conversion
9. Exotic Matter Energy Reactors
10. Zero-Point Energy Harvesters

**Effects:**
- Increases solar efficiency (up to 65% bonus)
- Improves energy collection rates
- Enables energy independence at max tier

## Integration Notes

### Orbital Capacity Management
Players must balance:
- Building factories for production
- Building capacity-limited structures for efficiency
- Optimizing placement across orbital zones
- Avoiding over-capacity penalties

### Specialized Probe Strategy
- Build probes based on current needs
- Balance specialized vs general probes
- Consider energy generation vs consumption
- Optimize for current phase of game

### Research Priorities
- Early game: Basic production efficiency
- Mid game: Energy collection, production optimization
- Late game: Dyson construction, advanced materials

### Building Placement Strategy
- Factories: Inner orbits for productivity bonuses
- Compute structures: Near Earth (1 AU) for efficiency
- Mining: Asteroid belt for best rates
- Energy: Inner orbits for solar, outer for nuclear
- Capacity-limited: Spread across orbits to avoid penalties

## Balance Considerations

### Gameplay Flow
- **0-5 min**: Build mobile factories, basic probes, solar arrays
- **5-10 min**: Expand to orbital shipyards, specialize probes, research production efficiency
- **10-15 min**: Build mega shipyards, optimize placements, research energy collection
- **15-20 min**: Focus on Dyson construction research, planetary-scale foundries, specialized probes
- **20+ min**: Complete high-tier research, optimize for fastest completion

### Resource Balance
- Orbital capacity prevents trivial solutions
- Specialized probes create interesting choices
- Capacity limits force strategic decisions
- Research trees provide clear progression paths

### Win Conditions
- Time: 15-20 minutes target (900-1200 seconds)
- Remaining metal: Encourages efficient play
- Build sequence: Records strategy for comparison
