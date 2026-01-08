# Lunar Orbital Zones Design Document

## Overview

This document outlines the implementation plan for making planetary moons into playable orbital zones. Currently, moons are rendered as visual elements orbiting planets but have no gameplay interaction. This feature will make moons accessible as sub-zones with unique resources, construction options, and strategic value.

---

## Current State

### Existing Moon Visualization (`solar_system.js`)

The game already renders moons for these planets:
- **Earth**: Moon (Luna)
- **Mars**: Phobos, Deimos
- **Jupiter**: 8 moons (Metis, Adrastea, Amalthea, Thebe, Io, Europa, Ganymede, Callisto)
- **Saturn**: 8 moons (Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Hyperion, Iapetus)
- **Uranus**: 5 moons (Miranda, Ariel, Umbriel, Titania, Oberon)
- **Neptune**: 2 moons (Triton, Proteus)
- **Kuiper (Pluto)**: 4 moons (Charon, Nix, Hydra, Kerberos)

Moon data includes:
- `name`, `orbit_km`, `radius_km`, `mass_kg`
- `color`, `period_days`, `inclination`

### Current Orbital Zone System (`orbital_mechanics.json`)

Zones have these properties:
- `id`, `name`, `radius_au`
- `delta_v_penalty`, `energy_cost_multiplier`
- `productivity_modifier`, `solar_irradiance_factor`
- `total_mass_kg`, `metal_percentage`
- `mining_rate_multiplier`, `mining_energy_cost_multiplier`
- `escape_delta_v_km_s`, `body_radius_km`, `low_orbit_altitude_km`

---

## Design Goals

1. **Hierarchical Zone System**: Moons are sub-zones of their parent planet zones
2. **Realistic Delta-V**: Transfers between planet and moons use actual delta-v costs
3. **Strategic Value**: Each moon offers unique gameplay advantages
4. **UI Integration**: Seamless zone selection and information display
5. **Visual Continuity**: Moons remain visible at their orbiting positions

---

## Implementation Plan

### Phase 1: Data Structure Changes

#### 1.1 Extend `orbital_mechanics.json`

Add a `moons` array to each planetary zone:

```json
{
  "id": "earth",
  "name": "Earth Orbit",
  "moons": [
    {
      "id": "luna",
      "name": "Luna (Moon)",
      "orbit_km": 384400,
      "radius_km": 1737,
      "mass_kg": 7.35e22,
      "escape_delta_v_km_s": 2.38,
      "low_orbit_altitude_km": 100,
      "metal_percentage": 0.12,
      "mining_rate_multiplier": 0.8,
      "special_resources": ["helium3", "regolith"],
      "structures_allowed": ["power_station", "mass_driver", "mining_station"],
      "description": "Earth's natural satellite. Rich in He-3 for fusion. Low gravity makes an excellent staging point."
    }
  ]
}
```

#### 1.2 Moon Zone Properties

| Property | Description |
|----------|-------------|
| `id` | Unique identifier (e.g., "luna", "io", "titan") |
| `parent_zone` | Parent planet zone ID |
| `orbit_km` | Semi-major axis from parent planet |
| `escape_delta_v_km_s` | Δv to escape moon's gravity |
| `metal_percentage` | Fraction of mined material that's metal |
| `mining_rate_multiplier` | Mining efficiency modifier |
| `special_resources` | Unique resources available |
| `structures_allowed` | Building types permitted |
| `solar_irradiance_factor` | Inherited from parent (with shadowing adjustments) |

#### 1.3 Transfer Delta-V Calculations

**Key Physics Insight:** Moons further from their parent planet sit higher in the gravity well, requiring LESS delta-v to escape to interplanetary space.

##### Gravity Well Position

For each moon, calculate its position in the parent's gravity well:
```javascript
// Escape velocity from parent planet at moon's orbital distance
v_escape_at_moon = sqrt(2 * G * M_planet / r_moon_orbit)

// Example for Jupiter's moons:
// Io     (422,000 km):  v_escape = 24.1 km/s (deep in well)
// Europa (671,000 km):  v_escape = 19.1 km/s
// Ganymede (1.07M km): v_escape = 15.1 km/s
// Callisto (1.88M km): v_escape = 11.4 km/s (high in well - easiest escape)
```

##### Moon-Specific Delta-V Properties

Each moon zone stores pre-calculated delta-v values:
```javascript
{
  "id": "europa",
  "parent_zone": "jupiter",
  "orbit_km": 671034,

  "delta_v": {
    // From moon surface/low orbit
    "escape_moon_km_s": 2.0,           // Escape Europa's gravity

    // From moon orbit to parent planet orbit
    "to_parent_orbit_km_s": 2.8,       // Europa orbit → Jupiter orbit

    // Total to escape parent system from this moon
    "escape_system_km_s": 13.2,        // Europa → interplanetary

    // To adjacent moons (Hohmann transfers within system)
    "to_io_km_s": 3.1,
    "to_ganymede_km_s": 2.3,
    "to_callisto_km_s": 3.8
  }
}
```

##### Transfer Cost Formulas

```javascript
// Planet orbit → Moon
// Capture at moon requires matching its orbital velocity
dv_capture = v_moon_orbital - v_hohmann_arrival

// Moon → Interplanetary (total system escape)
// Further moons = lower escape cost
dv_escape_system = sqrt(v_escape_parent^2 + v_escape_moon^2)
// Approximately: v_escape_at_moon_orbit + v_escape_moon

// Moon → Moon (same system)
// Hohmann transfer between moon orbits
dv_transfer = |v1 - v_hohmann| + |v_hohmann - v2|
```

##### Strategic Implications

| Moon | System Escape Δv | Strategic Role |
|------|------------------|----------------|
| **Io** | 17.5 km/s | Energy production (volcanism), expensive to leave |
| **Europa** | 13.2 km/s | Science/research hub |
| **Ganymede** | 9.8 km/s | Manufacturing center |
| **Callisto** | 5.2 km/s | Gateway to Jupiter system - easiest entry/exit |

### Phase 2: Game Engine Changes

#### 2.1 Zone Registry Extension

Modify the zone system to support hierarchical zones:

```javascript
class ZoneRegistry {
  getZone(zoneId) {
    // Check if it's a moon zone (format: "parent_moon")
    if (zoneId.includes('_')) {
      const [parentId, moonId] = this.parseMoonZoneId(zoneId);
      return this.getMoonZone(parentId, moonId);
    }
    return this.zones[zoneId];
  }

  getMoonZone(parentId, moonId) {
    const parent = this.zones[parentId];
    return parent?.moons?.find(m => m.id === moonId);
  }

  getParentZone(moonZoneId) {
    const [parentId] = this.parseMoonZoneId(moonZoneId);
    return this.zones[parentId];
  }
}
```

#### 2.2 Game State Extension

Track resources and probes at moon zones:

```javascript
gameState: {
  zones: {
    earth: { probes: 10, metal: 5000, ... },
    earth_luna: { probes: 2, metal: 200, ... },  // Moon zone
    jupiter: { probes: 5, metal: 1000, ... },
    jupiter_europa: { probes: 1, metal: 50, ... },
    ...
  }
}
```

#### 2.3 Transfer System Updates

Handle moon-specific transfer logic:

```javascript
calculateTransferCost(fromZone, toZone) {
  const fromMoon = this.isMoonZone(fromZone);
  const toMoon = this.isMoonZone(toZone);

  if (fromMoon && toMoon && this.sameParent(fromZone, toZone)) {
    // Moon-to-moon within same system (e.g., Io → Europa)
    return this.calculateMoonToMoonDeltaV(fromZone, toZone);
  } else if (fromMoon || toMoon) {
    // Moon to planet or vice versa
    return this.calculateMoonPlanetDeltaV(fromZone, toZone);
  } else {
    // Standard planet-to-planet transfer
    return this.calculateHohmannDeltaV(fromZone, toZone);
  }
}
```

### Phase 3: UI Changes

#### 3.1 Transfer Menu Moon Selection

When in the transfer menu with a planet selected as destination, pressing that planet's hotkey again opens moon selection. Moons are displayed left-to-right ordered by orbital radius (inner to outer).

**Key Interaction Flow:**
1. Select origin zone (e.g., Earth with `3`)
2. Press `Space` to open transfer menu
3. Press `6` to select Jupiter as destination
4. Press `6` again to enter Jupiter moon selection
5. Moon selector appears showing moons left-to-right by orbital distance:

```
┌─────────────────────────────────────────────────────────────────┐
│ JUPITER MOONS - Select destination (ordered inner → outer)     │
├─────────────────────────────────────────────────────────────────┤
│  [1]      [2]       [3]        [4]        [5]         [6]      │
│  Io      Europa   Ganymede   Callisto                          │
│ 422k km  671k km  1.07M km   1.88M km                          │
│                                                                 │
│ Δv from Jupiter orbit:                                          │
│  3.5     2.8       2.3        2.0      km/s                    │
│                                                                 │
│ Escape to interplanetary:                                       │
│  17.5    13.2      9.8        5.2      km/s                    │
│ (includes Jupiter escape + moon escape)                        │
└─────────────────────────────────────────────────────────────────┘
```

**Delta-V Physics:**
- Moons further from the planet sit higher in the gravity well
- Outer moons have LOWER escape delta-v to interplanetary space
- Example: Callisto at 1.88M km needs only 5.2 km/s to escape Jupiter system
  vs Io at 422k km needing 17.5 km/s (deep in Jupiter's gravity well)

#### 3.2 Keyboard Navigation

| Key | Action |
|-----|--------|
| `1-9, 0, -, `` ` | Select planet zone |
| (In transfer menu) `1-9` | Select destination planet |
| (Planet selected) Same key again | Enter moon selection for that planet |
| (In moon selection) `1-6` | Select moon by position (inner to outer) |
| `Escape` | Back to planet selection / close menu |

#### 3.3 Moon Transfer Delta-V Display

Each moon zone shows accurate delta-v costs based on orbital position:

```
┌─ Transfer to CALLISTO ───────────────────────────┐
│                                                  │
│ From Earth:                                      │
│   To Jupiter orbit:        28.5 km/s            │
│   Jupiter capture:          5.2 km/s            │
│   To Callisto:              2.0 km/s            │
│   ─────────────────────────────────             │
│   Total:                   35.7 km/s            │
│                                                  │
│ Note: Callisto is optimal for Jupiter system    │
│ staging - lowest capture Δv of Galilean moons   │
└──────────────────────────────────────────────────┘
```

#### 3.4 Zone Info Panel

Show moon-specific information:

```
┌─ EUROPA ─────────────────────────────────────────┐
│ Parent: Jupiter                                  │
│ Orbit: 671,034 km (3.55 days)                   │
│                                                  │
│ Resources:                                       │
│   Metal: 8.2%                                    │
│   Special: Ice, Sulfur compounds                 │
│                                                  │
│ Δv to Jupiter orbit: 2.8 km/s                   │
│ Δv to escape Jupiter: 13.2 km/s                 │
│ Δv to Ganymede: 2.3 km/s                        │
│                                                  │
│ Probes: 3 │ Metal: 450 kg                       │
│ Structures: 1 Power Station                      │
└──────────────────────────────────────────────────┘
```

### Phase 4: Moon-Specific Features

#### 4.1 Strategic Moon Properties

| Moon | Special Features |
|------|------------------|
| **Luna** | He-3 mining, low Δv staging point, Earth logistics hub |
| **Phobos/Deimos** | Captured asteroids, Mars orbital infrastructure |
| **Io** | Volcanic mining, extreme energy, sulfur resources |
| **Europa** | Ice mining, subsurface ocean access, research bonuses |
| **Ganymede** | Largest moon, magnetic field, radiation shielding |
| **Callisto** | Low radiation, Jupiter staging point, ice resources |
| **Titan** | Hydrocarbon seas, thick atmosphere, aerobraking |
| **Enceladus** | Geysers, water ice, organic compounds |
| **Triton** | Retrograde orbit, nitrogen geysers, Kuiper access |

#### 4.2 Moon-Only Structures

| Structure | Description | Moon Requirements |
|-----------|-------------|-------------------|
| **Orbital Tether** | Low-Δv surface access | Low-gravity moons only |
| **Ice Extractor** | Water/volatile mining | Ice moons (Europa, Enceladus, etc.) |
| **Lava Tap** | Geothermal energy | Volcanic moons (Io) |
| **Atmosphere Processor** | Hydrocarbon harvesting | Titan only |
| **Radiation Shelter** | Probe protection | Radiation-heavy zones |

#### 4.3 Moon Synergies

Strategic benefits from controlling moon systems:

```
Jupiter System Mastery:
├─ Io: +50% energy production (volcanism)
├─ Europa: +25% research speed (mysteries)
├─ Ganymede: +20% probe durability (shielding)
└─ Callisto: -30% Jupiter system transfer costs

Complete Set Bonus: +100% Jupiter zone productivity
```

### Phase 5: Visual Integration

#### 5.1 Moon Selection Highlighting

When a moon zone is selected:
- Highlight ring around the moon
- Orbit path visualization
- Connection line to parent planet
- Transfer trajectories to other moons

#### 5.2 Moon Zone Activity Visualization

- Mining particles around moon surface
- Structure placement on moon mesh
- Probe clusters at Lagrange points
- Transfer arcs between moons

#### 5.3 Camera Focus

When moon zone selected:
- Smooth camera transition to moon
- Appropriate zoom level for moon size
- Parent planet visible in background

---

## Implementation Order

### Milestone 1: Foundation (Core Data & Engine)
1. Extend `orbital_mechanics.json` with moon data
2. Add moon zone parsing to game engine
3. Implement moon zone state management
4. Add moon transfer calculations

### Milestone 2: Basic Gameplay
1. Enable probe transfers to moons
2. Implement moon mining
3. Add basic structures on moons
4. Moon resource tracking

### Milestone 3: UI Integration
1. Extend zone selector for moons
2. Add moon info panel
3. Implement keyboard navigation
4. Update transfer UI for moons

### Milestone 4: Advanced Features
1. Moon-specific structures
2. Special resources
3. System synergy bonuses
4. Achievement system

### Milestone 5: Visual Polish
1. Moon selection effects
2. Activity visualization
3. Camera transitions
4. Transfer arc rendering

---

## Technical Considerations

### Performance
- Moon zones increase state complexity
- Consider lazy-loading moon data
- Batch moon position updates
- Limit active moon zones per tick

### Backwards Compatibility
- Existing saves without moon data should default to empty moon zones
- Migration script for save data

### Balance
- Moon resources should complement, not replace, planet zones
- Transfer costs must make strategic sense
- Early game should focus on planets; moons are mid/late game

---

## Open Questions

1. **Moon count**: Include all moons or only major ones?
   - Recommendation: Start with Galilean moons + Titan + Luna, expand later

2. **Zone ID format**: `jupiter_europa` vs `europa`?
   - Recommendation: Prefix with parent for clarity

3. **Shared resources**: Do moons share resource pools with parent?
   - Recommendation: Independent pools with easy transfers

4. **Probe visibility**: Show probes at moon positions?
   - Recommendation: Yes, with clustering at high counts

---

## References

- NASA Moon Fact Sheets: https://nssdc.gsfc.nasa.gov/planetary/planetfact.html
- Delta-V Map: https://en.wikipedia.org/wiki/Delta-v_budget
- Existing codebase: `frontend/static/js/visualization/solar_system.js:1479-1692`
