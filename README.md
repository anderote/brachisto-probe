# Brachisto-Probe

A minimum-time simulation game for constructing Dyson spheres. Build probes, research technologies, construct structures, and expand across the solar system to harness stellar energy.

![Game Screenshot](docs/screenshot.png)

---

## Table of Contents

- [Quick Start](#quick-start)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Game Overview](#game-overview)
- [Getting Started](#getting-started)
- [Core Gameplay Mechanics](#core-gameplay-mechanics)
- [Resources](#resources)
- [Probes](#probes)
- [Structures](#structures)
- [Research System](#research-system)
- [Orbital Zones](#orbital-zones)
- [Transfer System](#transfer-system)
- [Dyson Sphere Construction](#dyson-sphere-construction)
- [UI Guide](#ui-guide)
- [Strategy Guide](#strategy-guide)
- [Technical Details](#technical-details)

---

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/brachisto-probe.git
cd brachisto-probe

# Create virtual environment (optional but recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the game
python run.py
```

Open your browser to [http://localhost:5001](http://localhost:5001)

### Requirements

- Python 3.8+
- Modern web browser with WebGL support (Chrome, Firefox, Edge recommended)

---

## Keyboard Shortcuts

### Zone Selection

| Key | Action |
|-----|--------|
| `` ` `` | Select Dyson Sphere zone |
| `1` | Select Mercury |
| `2` | Select Venus |
| `3` | Select Earth |
| `4` | Select Mars |
| `5` | Select Asteroid Belt |
| `6` | Select Jupiter |
| `7` | Select Saturn |
| `8` | Select Uranus |
| `9` | Select Neptune |
| `0` | Select Kuiper Belt |
| `-` | Select Oort Cloud |

### Transfer System

| Key | Action |
|-----|--------|
| `Space` | Open transfer menu (with zone selected) |
| `Space` | Confirm and launch transfer (with destination selected) |
| `←` / `→` | Switch between probe/metal transfer modes |
| `Escape` | Close transfer menu |
| `V` | Toggle delta-v overlay |
| `Shift+T` | Open detailed transfer dialog |

### Structure Building

| Key | Action |
|-----|--------|
| `Q`, `W`, `E`, `R`, `T`, `Y`, `U`, `I`, `O`, `P` | Toggle structure construction (dynamically assigned based on visible structures) |

### Debug & Information Panels

| Key | Action |
|-----|--------|
| `F` | Toggle Performance Metrics panel |
| `G` | Toggle Visual Effects Debug panel |
| `H` | Toggle Summary Plot panel |
| `L` | Open Leaderboard |
| `E` | Export metrics (when Performance panel is open) |

### Camera Controls

| Control | Action |
|---------|--------|
| Left Mouse Drag | Rotate camera around origin |
| Right Mouse Drag | Pan camera |
| Mouse Wheel | Zoom in/out |
| Arrow Keys | Navigate (scrolling prevented in-game) |

### Scripting Console

| Key | Action |
|-----|--------|
| `Ctrl+Enter` | Execute script |

---

## Game Overview

Brachisto-Probe is an incremental/idle game where you manage autonomous probes to build a Dyson sphere around the Sun. The game features:

- **Time-based progression**: All rates are measured in "per day" units
- **Exponential research system**: Research compounds continuously with exponential growth
- **Orbital mechanics**: Different zones have varying costs, productivity, and resource availability
- **Energy management**: Store excess energy in watt-days for later use
- **Modular construction**: Build factories, mining stations, energy collectors, and more
- **3D Visualization**: Real-time WebGL rendering of the solar system, probes, and Dyson sphere

### Winning the Game

Complete the Dyson sphere by constructing **5×10²⁴ kg** of Dyson mass. Your score is based on:
- **Completion Time**: Faster is better
- **Remaining Resources**: Leftover metal at completion

---

## Getting Started

### Difficulty Levels

When starting a new game, choose your difficulty:

| Difficulty | Starting Probes | Starting Structures |
|------------|-----------------|---------------------|
| **Easy** | 100 | 10 Power Stations, 10 Data Centers, 1 Mass Driver |
| **Medium** | 10 | 2 Power Stations, 2 Data Centers |
| **Hard** | 1 | None |

### Starting Conditions (Hard Mode)

- **1 Probe** at Earth orbit
- **1,000 kg** of metal
- **100 kW** constant energy supply
- **No structures** initially

### Basic Controls

1. **Time Controls** (bottom-left): Speed up or slow down game time (1x to 100x speed)
2. **Zone Selection** (bottom): Click or use number keys to select orbital zones
3. **Right Panel**: Toggle between Structures, Research, Transfers, and Probes tabs
4. **Left Panel**: View zone info, probe summary, and key metrics

---

## Core Gameplay Mechanics

### Time System

The game uses **days** as the fundamental time unit:
- Each tick advances time by 1/60 day (at 1x speed)
- All rates are measured in "per day" (kg/day, probes/day, etc.)
- Energy is measured in watts (W), but storage is in watt-days (W·d)

### Probe Activities

Probes can be allocated to three main activities:

1. **Harvest (Mining)**: Extract metal from orbital zones
   - Base rate: 100 kg/day per probe
   - Affected by: mining efficiency research, zone multipliers
   - Produces slag as a byproduct (can be recycled)

2. **Construct**: Build structures or replicate probes
   - Base rate: 100 kg/day per probe (can build 1 probe in ~1 day with 10 probes)
   - Structures cost metal and take time based on construction rate
   - Can be split between structure building and probe replication

3. **Dyson Construction**: Build the Dyson sphere
   - Converts metal to Dyson sphere mass
   - 50% efficiency (2 kg metal → 1 kg Dyson mass)
   - Target: 5×10²⁴ kg (can be reduced by research)

### Resource Management

#### Metal
- **Production**: Mining from orbital zones
- **Consumption**: Building probes, structures, Dyson sphere
- **Storage**: Unlimited (no cap)

#### Energy
- **Production**: Solar arrays, Dyson sphere power allocation
- **Consumption**: Probe activities, structure operation
- **Storage**: Limited by storage facilities (measured in watt-days)
- **Base Supply**: 100 kW constant supply

#### Intelligence (FLOPS)
- **Production**: Compute structures, Dyson sphere compute allocation
- **Consumption**: Research projects
- **Purpose**: Drives research progress

#### Dexterity
- **Definition**: Total probe capability for physical work
- **Calculation**: Sum of all probes × base dexterity × research multipliers
- **Usage**: Determines mining, building, and Dyson construction capacity

---

## Probes

Currently, the game uses a **single universal probe type** with the following characteristics:

### Base Probe Stats

| Property | Value | Description |
|----------|-------|-------------|
| **Mass** | 100 kg | Metal cost to build one probe |
| **Mining Rate** | 100 kg/day | Metal extraction rate per probe |
| **Build Rate** | 100 kg/day | Construction rate per probe |
| **Movement Speed** | 30 km/s | Base transfer velocity |
| **Energy Consumption** | 100 kW | Power draw when actively working (idle probes consume no energy) |
| **Base Dexterity** | 1.0 | Physical capability multiplier |

### Probe Replication

- **Manual Replication**: Allocate probes to "Construct" → "Replicate"
- **Time**: ~1 day per probe with 10 probes allocated (scales linearly)
- **Cost**: 100 kg metal per probe
- **Factory Production**: Factories can produce probes automatically (more efficient)

### Research Effects on Probes

Research improves probe capabilities through skill multipliers:

- **Propulsion Systems**: Reduces energy costs for orbital transfers and operations
- **Locomotion Systems**: Improves movement efficiency and reduces transfer times
- **Robotic Systems**: Increases dexterity (mining/building efficiency)
- **Production Efficiency**: Multiplies mining and building rates
- **ACDS (Autonomous Control & Decision Systems)**: Improves probe autonomy and coordination

See [PROBES_AND_SKILLS.md](PROBES_AND_SKILLS.md) for detailed information.

---

## Structures

Structures are constructible at specific orbital zones and provide automated benefits.

### Power Station
- **Output**: 100 GW at Earth orbit (scales with solar irradiance)
- **Mass**: 10,000 kg
- **Zones**: Mercury, Venus, Earth, Mars, Asteroid Belt

### Orbital Data Center
- **Output**: 10 EFLOPS compute + 10 GW solar power
- **Mass**: 10,000 kg
- **Special**: Net-zero energy at Earth; energy consumer further from Sun
- **Zones**: Mercury, Venus, Earth, Mars, Asteroid Belt

### Mass Driver
- **Purpose**: Required for metal transfers between zones
- **Capacity**: 100 GT/day launch capacity
- **Mass**: 50,000 kg
- **Special**: Speed improves with research
- **Zones**: All rocky planets and asteroid zones

### Electromagnetic Gas Miner
- **Purpose**: High-speed mining of gas giant atmospheres
- **Mass**: 100 MT
- **Zones**: Jupiter, Saturn, Uranus, Neptune only

### Space Elevator
- **Purpose**: Massive material hauling from planetary surfaces
- **Mass**: 1 GT
- **Zones**: Mercury, Venus, Earth, Mars only

### Robotic Asteroid Factory
- **Purpose**: Automated mining + probe production
- **Mass**: 500 MT
- **Zones**: Asteroid Belt, Kuiper Belt, Oort Cloud

### Deep Space Fusion Plant
- **Purpose**: Energy generation independent of solar distance
- **Output**: 10 TW
- **Mass**: 5 MT
- **Zones**: Outer solar system (Asteroid Belt and beyond)

---

## Research System

### Research Mechanics

Research uses an **exponential compounding system**:

1. **During Research**: Bonus compounds continuously: `bonus = base_bonus × e^(0.20 × time_in_days)`
2. **On Completion**: Principal doubles, then continues compounding: `bonus = (base_bonus × 2) × e^(0.20 × time_since_completion)`
3. **Tier Compounding**: Each tier compounds independently, then tiers multiply together

### Research Trees

#### Propulsion Systems
Improves energy efficiency for orbital operations.

**Tiers**: Hydrazine Rockets → Hydrogen Rockets → Methalox Rockets → Vacuum-Rated Nozzles → Thermal Fission Drive → FRC Fusion Drive → Magnetic Mirror → Electrostatic Inertial Confinement → Antimatter-Matter → MHD Inertial Mass Reduction

**Effects**: Reduces energy costs for transfers, mining, and building operations

#### Thrust Systems
Improves thrust-to-weight ratios.

**Tiers**: Cold Gas Thrusters → Chemical Rockets → Ion Thrusters → Hall Effect Thrusters → VASIMR → Nuclear Thermal → Magnetic Sails

**Effects**: Faster transfers, improved maneuverability

#### Locomotion Systems
Improves movement and transport efficiency.

**Effects**: Reduces energy costs, increases carrying capacity, improves transfer speeds

#### Robotic Systems
Improves probe dexterity and physical capabilities.

**Tiers**: Manipulator Arms → Multi-DOF Arms → Tendon-Driven → Soft Robotics → Swarm Coordination → Zero-Point Disruptors

**Effects**: Multiplies mining and building rates

#### Production Efficiency
Improves resource extraction and processing.

**Effects**: Multiplies mining rates, reduces energy consumption, improves recycling

#### Energy Systems (Multiple Trees)
- **Energy Collection**: Improves solar capture
- **Energy Conversion**: Improves efficiency
- **Energy Storage**: Increases capacity
- **Energy Transport**: Improves transfer efficiency

#### Computer Systems
Generates intelligence (FLOPS) for research.

**Subcategories**:
- **Processing**: CPU performance
- **Memory**: Data storage capacity
- **Interface**: I/O bandwidth
- **Transmission**: Network speed

**Effect**: Geometric mean of all subcategories determines total compute power

#### Dyson Swarm Construction
Optimizes Dyson sphere construction.

**Effects**: Increases Dyson construction rate, reduces target mass

---

## Orbital Zones

### Zone Overview

| Zone | Radius (AU) | Solar Irradiance | Mining Multiplier | Metal % | Key Features |
|------|-------------|------------------|-------------------|---------|--------------|
| **Dyson Sphere** | 0.29 | 11.89× | N/A | N/A | Dyson construction only |
| **Mercury** | 0.39 | 6.57× | 2.0× | 55% | Highest energy, good mining |
| **Venus** | 0.72 | 1.93× | 1.4× | 35% | High energy |
| **Earth** | 1.0 | 1.0× | 1.0× | 25% | Baseline, starting zone |
| **Mars** | 1.52 | 0.43× | 1.2× | 31% | Access to asteroid belt |
| **Asteroid Belt** | 2.7 | 0.14× | 2.5× | 58% | Rich mining, low gravity |
| **Jupiter** | 5.2 | 0.04× | 3.5× | 1.8% | Gas giant resources |
| **Saturn** | 9.5 | 0.01× | 2.5× | 5.5% | Far outer system |
| **Uranus** | 19.2 | 0.003× | 1.8× | 7.4% | Ice giant |
| **Neptune** | 30.1 | 0.001× | 4.5× | 8.2% | Outer planet |
| **Kuiper Belt** | 40.0 | 0.0006× | 1.0× | 45% | Icy objects |
| **Oort Cloud** | 140.0 | 0.00005× | 0.3× | 80% | Extreme distance, metal-rich |

### Zone Properties

Each zone has:
- **Delta-V Penalty**: Energy cost multiplier for operations
- **Solar Irradiance Factor**: Energy production modifier (inverse square law)
- **Productivity Modifier**: General efficiency bonus
- **Mining Rate Multiplier**: Mining efficiency bonus
- **Metal Percentage**: Fraction of mined material that's metal (rest is slag)

---

## Transfer System

### Quick Transfer Workflow

1. **Select origin zone** using number keys or click
2. Press **Space** to open transfer menu
3. Use **←/→** to switch between Probe/Metal modes
4. **Select destination** using number keys or click
5. Press **Space** to launch transfer

### Transfer Requirements

- **Probe Transfers**: Need at least 1 probe at origin
- **Metal Transfers**: Need Mass Driver at origin zone

### Delta-V Overlay

Press **V** with a zone selected to see transfer costs to all other zones:
- Shows energy requirements
- Displays estimated transfer times
- Color-coded by difficulty

### Transfer Mechanics

- **Base Transfer Time**: Calculated using Hohmann transfer orbits
- **Speed Factors**: Affected by propulsion research and Mass Drivers
- **Energy Cost**: Based on delta-v requirements and probe mass

---

## Dyson Sphere Construction

### Goal

Build a Dyson sphere with **5×10²⁴ kg** of mass (can be reduced by research).

### Construction Process

1. **Move probes to Dyson Sphere zone** (use number key `` ` `` or click)
2. **Allocate probes to Dyson Construction** activity
3. **Metal Conversion**: 2 kg metal → 1 kg Dyson mass (50% efficiency)
4. **Watch progress** in the visualization (particles appear as mass increases)

### Dyson Sphere Benefits

Once constructed, the Dyson sphere produces:
- **Energy Production**: 5 kW per kg of Dyson mass
- **Compute Production**: Can allocate power to compute for research

### Power Allocation

Split Dyson power between:
- **Economy (Energy)**: Powers operations across the solar system
- **Compute (Intelligence)**: Drives research at accelerated rates

---

## UI Guide

### Top Bar
- **Resource Display**: Shows metal, energy, intelligence, and probe counts

### Left Panel (stacked from top to bottom)
- **Metrics Panel**: Key game statistics
- **Probe Summary Panel**: Overview of all probes by zone
- **Zone Info Panel**: Details about the selected zone

### Right Panel (tabbed)
- **Structures Tab**: Build and manage structures (hotkeys Q-P)
- **Research Tab**: View and prioritize research trees
- **Transfers Tab**: Monitor active transfers
- **Probes Tab**: Detailed probe statistics

### Bottom Bar
- **Time Controls** (left): Speed buttons (1x, 2x, 4x, 10x, 100x)
- **Zone Selector** (center): Click zones or use keyboard shortcuts
- **Time Display**: Current game time

### Debug Panels (toggleable)
- **F**: Performance metrics (FPS, tick times, calculation breakdown)
- **G**: Visual effects controls (bloom, atmosphere, etc.)
- **H**: Summary plot (graphs of key metrics over time)

---

## Strategy Guide

### Early Game (First 100 Days)

1. **Build Probes**: Start with 1 probe, build to ~10 probes
2. **Mine Metal**: Focus on Earth or Mercury for metal
3. **Research**: Start with Propulsion Systems or Production Efficiency
4. **First Structures**: Build Power Station for energy, then Data Center for research

### Mid Game (100-1000 Days)

1. **Expand Operations**: Build more probes and structures
2. **Zone Optimization**: Move operations to Mercury for better energy/mining
3. **Research Focus**: Prioritize Production Efficiency and Energy Systems
4. **Mass Drivers**: Build Mass Drivers to enable metal transfers

### Late Game (1000+ Days)

1. **Scale Up**: Build advanced structures (Space Elevators, Fusion Plants)
2. **Dyson Construction**: Begin allocating probes to Dyson sphere
3. **Research Completion**: Finish key research trees for maximum multipliers
4. **Optimization**: Balance energy/compute allocation from Dyson sphere

### Tips

- **Energy Storage**: Build storage facilities early to buffer energy production
- **Zone Selection**: Mercury is best for energy-intensive operations
- **Factory Efficiency**: Use Robotic Asteroid Factories for automated production
- **Research Priority**: Production Efficiency → Energy Collection → Dyson Construction
- **Recycling**: Recycle slag to recover metal (75% base efficiency, improves with research)
- **Mass Drivers**: Critical for transferring metal to the Dyson Sphere zone
- **Quick Transfers**: Use keyboard shortcuts for fast probe management

### Optimal Research Path

1. **Production Efficiency** (early) - Direct mining/building boost
2. **Robotic Systems** (early-mid) - Dexterity multiplier
3. **Energy Systems** (mid) - Support expansion
4. **Computer Systems** (mid) - Accelerate research
5. **Dyson Swarm Construction** (late) - Win the game faster

---

## Technical Details

### Time System

- **Fundamental Unit**: 1 day
- **Tick Rate**: 60 ticks per second (real time)
- **Time Speed**: 1x = 1 day per real second
- **Maximum Speed**: 100x (100 days per real second)

### Energy System

- **Units**: Watts (W) for rates, Watt-days (W·d) for storage
- **Storage**: 1 W·d = 1 watt for 1 day
- **Conversion**: Net energy (watts) × time (days) = watt-days

### Research Compounding

The research system uses continuous exponential compounding:
- **Interest Rate**: 20% per day (0.20)
- **Compounding**: Continuous (e^rt formula)
- **Tier Completion**: Principal doubles, then continues compounding

### Architecture

- **Frontend**: Vanilla JavaScript with Three.js for 3D visualization
- **Backend**: Flask (Python) with SQLAlchemy for database
- **Game Engine**: Web Worker-based for smooth performance
- **Rendering**: WebGL with post-processing effects (bloom, lens flare)

### Performance

The game uses several optimizations:
- **Web Worker**: Game simulation runs in a separate thread
- **Calculation Caching**: Expensive calculations are cached
- **LOD System**: Visual detail adjusts based on zoom level
- **Profiling**: Press F to view performance metrics

---

## File Structure

```
brachisto-probe/
├── backend/               # Flask backend
│   ├── api/              # REST API endpoints
│   ├── app.py            # Flask application
│   └── models.py         # Database models
├── frontend/
│   ├── static/
│   │   ├── css/          # Stylesheets
│   │   └── js/
│   │       ├── game/     # Game engine and systems
│   │       ├── ui/       # UI components
│   │       ├── utils/    # Utility functions
│   │       └── visualization/  # 3D rendering
│   └── templates/        # HTML templates
├── game_data/            # Game configuration JSON files
│   ├── buildings.json    # Structure definitions
│   ├── orbital_mechanics.json  # Zone properties
│   └── research_trees.json     # Research tree definitions
├── requirements.txt      # Python dependencies
├── run.py               # Entry point
└── README.md            # This file
```

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

See [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- Three.js for 3D rendering
- Flask for the backend framework
- The incremental/idle game community for inspiration
