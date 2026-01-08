# Integrated Research Tree & Civilization DNA System

## Overview

Redesign the research system so Phase 1 (Sol → first Dyson) creates a persistent "Civilization DNA" that defines Phase 2 galactic expansion playstyle. Players make exclusive variant choices at each tier, accumulating into a unique civilization profile for multiplayer competition.

**Key Design Decisions:**
- **Tier structure stays** - tiers 1-18 remain the progression backbone
- **Variant funnel pattern** - 3 choices early → 2 choices mid-game → 1 choice end-game (convergence)
- **Civilization DNA** - choices accumulate into stats, traits, and archetypes; **permanently locked** after Phase 1
- **15-30 min Phase 1** - quick sessions, high replayability
- **Completion time is THE metric** - time to first Dyson sphere = primary score
- **Async multiplayer** - DNAs compete in shared galaxy simulations

---

## Part 1: Research Tree Variant System

### Variant Funnel Pattern

Variants follow a convergence pattern across all 6 trees:

| Tier Range | Variants | Design Intent |
|------------|----------|---------------|
| **Early (1-6)** | 3 choices (A/B/C) | Maximum divergence, define playstyle early |
| **Mid (7-12)** | 2 choices (A/B) | Narrowing paths, refining specialization |
| **Late (13+)** | 1 choice (no variants) | Convergence to ultimate tech, all paths unite |

This creates ~30 decision points per tree × 6 trees = **~180 total choices** shaping DNA.

### Tradeoff Examples

| Tradeoff Dimension | Example A | Example B | Example C |
|-------------------|-----------|-----------|-----------|
| Thrust vs ISP | NERVA (8.0 T/W, 850s) | DUMBO (3.0 T/W, 1200s) | Bimodal hybrid |
| Efficiency vs Power | Closed gas core | Open gas core | Liquid core |
| Speed vs Payload | High-power VASIMR | Efficiency VASIMR | Compact VASIMR |

### Propulsion Tree Example (Full Funnel)

```
EARLY TIERS (3 variants each):

TIER 1: Chemical Rockets
├── A: Hydrolox (high ISP) → +15% delta-v, expensive
├── B: Kerolox (thrust) → +20% thrust, lower ISP
└── C: Solid Boosters (simple) → cheap, low performance

TIER 2-6: Similar 3-way splits...

TIER 6: Nuclear Thermal
├── A: NERVA Solid Core (thrust focus) → +10% expansion velocity
├── B: DUMBO Pebble-Bed (ISP focus) → +15% range, -10% thrust
└── C: Bimodal NTR/NEP (hybrid) → flexibility, neither optimized

MID TIERS (2 variants each):

TIER 7: Liquid/Gas Core
├── A: Closed-Cycle Gas (clean) → inner system safe
└── B: Open-Cycle Gas (performance) → +40% ISP, outer system only

TIER 8: Electric Propulsion
├── A: Gridded Ion (max ISP) → 12000s ISP, very low thrust
└── B: Hall Effect (thrust) → 3000s ISP, 6x more thrust

TIER 9-12: Similar 2-way splits...

LATE TIERS (no variants - convergence):

TIER 13: Fusion Torch
└── (single path) → All civilizations converge here

TIER 14-18: Ultimate tech progression
└── Antimatter → Photon Drive → Alcubierre → etc.
```

### All 6 Trees - Funnel Structure

| Tree | Total Tiers | 3-Variant (1-6) | 2-Variant (7-12) | 1-Variant (13+) | Key Tradeoffs |
|------|-------------|-----------------|------------------|-----------------|---------------|
| Propulsion | 18 | 6 tiers | 6 tiers | 6 tiers | Thrust vs ISP, speed vs range |
| Power | 16 | 6 tiers | 6 tiers | 4 tiers | Solar vs nuclear, density vs efficiency |
| Materials | 15 | 6 tiers | 6 tiers | 3 tiers | Strength vs mass, conventional vs exotic |
| Thermal | 15 | 6 tiers | 6 tiers | 3 tiers | Capacity vs complexity, passive vs active |
| Electromagnetics | 14 | 6 tiers | 6 tiers | 2 tiers | Field strength vs efficiency, temp requirements |
| Autonomy | 15 | 6 tiers | 6 tiers | 3 tiers | Centralized vs distributed, individual vs swarm |

**Total decision points**: (6×3 + 6×2) × 6 trees = **180 choices** across all trees

---

## Part 2: Civilization DNA System

### Core Stats (6 Derived Metrics)

| Stat | Sources | Phase 2 Effect |
|------|---------|----------------|
| **Expansion Velocity** | Propulsion + Materials + Autonomy | Probe launch rate, transfer time |
| **Dyson Efficiency** | Thermal + Materials + Power + EM | Dyson construction speed, power output |
| **Resource Extraction** | EM + Materials + Autonomy + Power | Mining rate, rare element discovery |
| **Research Rate** | Autonomy + Power + Thermal + Materials | Phase 2 tech unlocks, compute per probe |
| **Swarm Scale** | Autonomy + Materials + Power + Thermal | Max effective probes before diminishing returns |
| **Adaptability** | Tech tier variance + trait count | Star type bonuses, counter-strategy options |

### Trait System

Traits are binary flags derived from tech choices with bonuses AND penalties:

| Trait | Trigger | Bonus | Penalty |
|-------|---------|-------|---------|
| Thermal Specialist | NTR tiers maxed | +40% NTR efficiency | -25% electric propulsion |
| Solar Dependent | Stayed solar tiers 1-4 | +50% inner system power | -60% beyond Jupiter |
| Nuclear Independent | Chose fission path | +30% power anywhere | -20% peak output |
| Fusion Pioneer | Unlocked fusion | +60% fusion performance | -20% other propulsion |
| Swarm Intelligence | Autonomy tiers 4-6 | +60% at 10^9+ probes | -20% individual capability |

### Archetype Classification

Based on overall choice pattern, classify into archetypes:

| Archetype | Detection | Phase 2 Bonus | Phase 2 Penalty |
|-----------|-----------|---------------|-----------------|
| **Expansionist** | High propulsion, velocity ≥0.7 | +50% probe launch, +30% speed | -30% Dyson, -20% extraction |
| **Consolidator** | High Dyson efficiency ≥0.7 | +60% Dyson speed, +40% output | -40% expansion rate |
| **Harvester** | High extraction ≥0.7 | +80% mining, +50% rare elements | -25% Dyson, -20% research |
| **Researcher** | High research ≥0.7 | +100% research, +50% breakthroughs | -30% early expansion |
| **Swarm Lord** | High swarm ≥0.8 | +200% max probes, -70% crowding | -40% individual capability |
| **Balanced** | All stats 0.35-0.65 | +20% to all | No specialized bonuses |

### Competitive Balance (Counter-Play)

| DNA | Beats | Loses To |
|-----|-------|----------|
| Expansionist | Consolidator (speed) | Harvester (resource denial) |
| Consolidator | Harvester (efficiency) | Expansionist (outpaced) |
| Harvester | Expansionist (starve out) | Swarm Lord (overwhelmed) |
| Swarm Lord | Harvester (mass overwhelm) | Researcher (tech advantage) |
| Researcher | Swarm Lord (quality) | Consolidator (slower) |

---

## Part 3: Fullscreen Research UI

### Layout

```
+-----------------------------------------------------------------------------------+
|  [X]                    CIVILIZATION DNA                           [Search]       |
+-------------+---------------------------------------------------------------------+
|  INFO PANEL |     PANNABLE TECH TREE CANVAS (2D Canvas)                          |
|  240px      |                                                                     |
|             |   TIER 1         TIER 2         TIER 3         TIER 4              |
| +---------+ |   +---+          +---+          +---+          +---+               |
| | Search  | |   | A |--------->| A |--------->| A |--------->| A |               |
| +---------+ |   +---+          +---+          +---+          +---+               |
|             |   | B |          | B |          | B |          | B |               |
| +---------+ |   +---+          +---+          +---+          +---+               |
| | Selected| |   | C |          | C |                                             |
| | Node    | |   +---+          +---+          ═══ PROPULSION ═══                 |
| +---------+ |                                                                     |
|             |   +---+          +---+          +---+                               |
| +---------+ |   | A |--------->| A |--------->| A |                              |
| | DNA     | |   +---+          +---+          +---+                               |
| | Preview | |   | B |          | B |          | B |                               |
| +---------+ |   +---+          +---+          +---+                               |
|             |                  ═══ POWER ═══                                      |
| +---------+ |                                                                     |
| | Queue   | |   ... (4 more trees vertically) ...                                |
| +---------+ |                                                                     |
+-------------+---------------------------------------------------------------------+
|  [1 PROP] [2 EM] [3 THERM] [4 MAT] [5 PWR] [6 AUTO] | [Reset] [Minimap]          |
+-----------------------------------------------------------------------------------+
```

### Node States

| State | Visual | Meaning |
|-------|--------|---------|
| Available | Blue glow pulse | Can research now |
| In Progress | Green animated bar | Currently researching |
| Completed | Green fill + checkmark | Researched |
| Locked | Dim gray | Prerequisites not met |
| Exclusive-Locked | Red-gray strikethrough | Other variant chosen |
| Selected | White glow, scale 1.05 | Currently viewing |

### Interactions

- **Pan**: Click and drag canvas
- **Zoom**: Scroll wheel (0.3x - 2.0x)
- **Select**: Click node to view details
- **Research**: Click available variant to start
- **Search**: Type to filter and highlight nodes
- **Keyboard**: 1-6 jump to trees, N/P next/prev available, R start research

### Quick Navigation (15-30 min session)

- Tree jump buttons (1-6)
- "Next Available" button
- Minimap showing viewport
- Progress summary bar at top
- Research queue in sidebar

---

## Part 4: Phase 2 Integration

### DNA Application to Galaxy Expansion

```javascript
// When Phase 1 completes (first Dyson at 100%)
function onPhase1Complete() {
    const dna = generateCivilizationDNA(techTreeState, phase1Duration);

    // Save to player profile
    savePlayerDNA(dna);

    // Initialize Phase 2 with DNA modifiers
    galaxySystem.initialize(dna);
}

// DNA affects all Phase 2 mechanics
function calculateProbelaunchRate(star, dna) {
    let rate = BASE_RATE;
    rate *= (1 + dna.stats.expansion_velocity * 2);
    rate *= dna.archetype.phase2_bonus.probe_launch || 1.0;
    rate *= getTraitModifier(dna.traits, 'probe_launch');
    return rate;
}
```

### Multiplayer Competition

- DNAs stored via social login (Twitter auth)
- Shared galaxy simulation runs with multiple player DNAs
- Different DNAs have different optimal strategies
- Leaderboard shows archetype icons and key stats
- New games create new DNAs to try different builds

---

## Implementation Order

### Phase A: Data Layer
1. Add variant structure to all 6 tech tree JSON files
2. Create `civilization_dna.js` - DNA generation and stat calculation
3. Extend `tech_tree.js` with variant selection and exclusivity logic

### Phase B: Research UI
4. Create `research_fullscreen.js` - pannable canvas renderer
5. Create `research_nodes.js` - node drawing with states
6. Create `research_info_panel.js` - sidebar with search
7. Add keyboard shortcuts and navigation

### Phase C: Integration
8. Wire up research UI to tech tree state
9. Add Phase 1 completion hook → DNA generation
10. Connect DNA to galaxy system modifiers
11. Add DNA display to galaxy view

### Phase D: Multiplayer (Future)
12. Backend API for DNA storage
13. Social auth integration
14. Shared galaxy simulation
15. Leaderboards

---

## Files to Create

| File | Purpose |
|------|---------|
| `game_data/tech_trees/*.json` | Add variants to all 6 trees |
| `frontend/static/js/game/engine/civilization_dna.js` | DNA generation & stats |
| `frontend/static/js/ui/research_fullscreen.js` | Main canvas view |
| `frontend/static/js/ui/research_nodes.js` | Node rendering |
| `frontend/static/js/ui/research_connections.js` | Line drawing |
| `frontend/static/js/ui/research_info_panel.js` | Sidebar |
| `frontend/static/css/research_fullscreen.css` | Styles |

## Files to Modify

| File | Changes |
|------|---------|
| `frontend/static/js/game/engine/tech_tree.js` | Variant selection, exclusivity |
| `frontend/static/js/game/engine/galaxy_system.js` | DNA-based modifiers |
| `frontend/static/js/main.js` | Research UI initialization, Phase 1 completion hook |
| `frontend/templates/index.html` | Script tags for new files |

---

## Design Decisions (Resolved)

| Question | Decision |
|----------|----------|
| Variants per tier? | **Funnel pattern**: 3 early → 2 mid → 1 late |
| Forced progression tiers? | **Yes** - Late tiers (13+) have no variants, all paths converge |
| DNA editable? | **Permanently locked** after Phase 1 completion |
| Implementation priority? | **All 6 trees with variants first**, then UI |
| Primary metric? | **Completion time** to first Dyson sphere |
