# Probe Propulsion & Travel Time System

## Overview

Probes traveling to other stars experience accurate relativistic travel times based on their star drive technology. **The game clock runs on proper time** (ship time) - what the probes subjectively experience.

**Key Insight**: At constant acceleration, time dilation makes distant trips take much less subjective time than naive distance/velocity would suggest. A probe accelerating at 1g to a star 100 light-years away experiences only ~9.4 years - so the trip takes **9.4 game years**, not 102 years.

**Visual Effect**: Probes to distant stars appear to move FASTER because they're experiencing extreme time dilation. A 100 ly probe visually covers ~10.6 ly per game year, while a 4 ly probe covers only ~1.1 ly per game year.

---

## Part 1: Physics Foundation

### Constant Acceleration Relativistic Travel

The "brachistochrone" (shortest time) maneuver:
1. Accelerate at constant `a` to the midpoint
2. Flip and decelerate at constant `a` to arrive at rest

**Key Formulas:**

```
Ship time (proper time):
τ = (2c/a) × acosh(1 + a×d/(2c²))

Coordinate time (game time):
t = (2c/a) × sinh(a×τ/(2c))

Max velocity at midpoint:
v_max = c × tanh(a×τ/(2c))

Lorentz factor (time dilation):
γ = 1 / sqrt(1 - v²/c²)
```

### Example Travel Times (1g acceleration)

| Distance | Game Time (proper) | Visual Speed | Max Velocity | γ at Peak |
|----------|-------------------|--------------|--------------|-----------|
| 4.37 ly (Alpha Centauri) | 3.6 years | 1.2 ly/yr | 0.95c | 3.2 |
| 10 ly | 5.2 years | 1.9 ly/yr | 0.99c | 6.8 |
| 100 ly | 9.4 years | **10.6 ly/yr** | 0.9999c | 52 |
| 1,000 ly | 13.6 years | **73.5 ly/yr** | 0.999999c | 502 |
| 25,000 ly (galaxy center) | 20.0 years | **1,250 ly/yr** | ~c | 12,500 |

**Note**: Visual speed = distance / game time. Distant probes appear to zip across the galaxy!

### Drive Tiers & Acceleration

From `starship_drives.json`:

| Tier | Drive | Accel (g) | Effect on Travel |
|------|-------|-----------|------------------|
| 1 | Chemical | 0.01 | Near-Newtonian, minimal dilation |
| 2 | Ion | 0.001 | Very slow, generation ships |
| 3 | Nuclear Pulse | 1.0 | Human-comfortable, noticeable dilation |
| 4 | Fusion Torch | 5.0 | Fast local trips, strong dilation |
| 5 | Antimatter | 10.0 | ~7 years ship time to 100 ly |
| 6 | Beamed | 50.0 | ~3 years ship time to 100 ly |
| 7 | Ramjet | 1.0 (sustained) | Can coast at high γ |
| 8 | Alcubierre | N/A | ~0.9c effective, NO dilation |
| 9 | Hyperspace | N/A | 10c effective, NO dilation |
| 10 | Instantaneous | N/A | Zero transit time |

---

## Part 2: Game Integration

### Current System (Visual Only)

The current star map uses visual animation time (5-20 real seconds) that doesn't reflect actual physics:
- All trips take roughly the same visual time
- Drive tier provides minor speed boost (1.0x to 3.0x)
- No tracking of game time passage
- No time dilation effects

### Proposed System (Proper Time Based)

**Game time = Proper time (ship time)**

This means:
- Arrivals are triggered by proper time passage
- Distant probes visually move FASTER (covering more ly/game-year)
- Time dilation is "baked into" the visual speed

**Three modes by drive tier:**

1. **Newtonian Mode** (Tiers 1-2): Low acceleration, minimal relativistic effects
2. **Relativistic Mode** (Tiers 3-7): Full brachistochrone with time dilation
3. **FTL Mode** (Tiers 8-10): `time = distance / effective_c`, no dilation

**Key Changes:**

```javascript
// Fleet object now tracks:
const fleet = {
    // ... existing fields

    // Physics data
    distanceLY: 100,            // Distance in light-years
    accelG: 1.0,                // Drive acceleration

    // Time tracking (all in proper time = game time)
    launchTime: 1000,           // Game time at launch (years)
    travelTime: 9.4,            // Proper time for trip (years) - THIS IS GAME TIME
    arrivalTime: 1009.4,        // Game time when arrival occurs

    // For display/info
    maxVelocityC: 0.9999,       // Peak velocity
    peakGamma: 52,              // Time dilation factor at midpoint
    visualSpeedLYperYr: 10.6,   // Apparent speed (distance / travelTime)
};
```

### Visual Animation Synced to Game Time

Animation speed is calculated from proper time, so probes cover the visual distance in the correct game time:

```javascript
// Visual speed = distance / properTime
// Distant probes move FAST visually because of time dilation

const visualSpeedUnitsPerYear = distanceUnits / travelTime;

// Each frame, move probe based on elapsed game time
const elapsed = this.time - fleet.launchTime;
const progress = Math.min(1, elapsed / fleet.travelTime);

fleet.probe.position.lerpVectors(fleet.start, fleet.target, progress);

if (progress >= 1) {
    this.colonizeStar(fleet);
}
```

---

## Part 3: UI Enhancements

### Fleet Info Panel

Show relativistic effects when hovering/selecting a fleet:

```
┌─────────────────────────────────────┐
│ PROBE FLEET → Vega                  │
├─────────────────────────────────────┤
│ Distance:     25 ly                 │
│ Drive:        Fusion Torch (5g)     │
├─────────────────────────────────────┤
│ Travel Time:  5.8 years             │
│ Visual Speed: 4.3 ly/yr             │
│ Peak γ:       8.2                   │
├─────────────────────────────────────┤
│ Max Velocity: 0.993c                │
├─────────────────────────────────────┤
│ Launched:     Year 1000             │
│ Arrives:      Year 1005.8           │
│ Remaining:    3.2 years             │
└─────────────────────────────────────┘
```

### Time Dilation Indicator

Small γ badge on probe fleets showing dilation factor:
- γ < 2: No indicator (nearly Newtonian)
- γ 2-10: Yellow "γ5" badge
- γ > 10: Red "γ52" badge (significant dilation)

This helps players understand why distant probes move so fast visually.

### Launch Preview

When selecting a target, show travel time preview:

```
Target: Vega (25 ly)
─────────────────────
Current Drive: Fusion Torch (5g)
Travel Time:   5.8 years
Visual Speed:  4.3 ly/yr (γ=8.2)
Arrival:       Year 1005.8
─────────────────────
[LAUNCH]  [CANCEL]
```

### Intuition Helper

"Due to time dilation at 0.993c, this 25 ly journey
takes only 5.8 years from the probe's perspective."

---

## Part 4: Implementation Plan

### Phase A: Core Calculator Integration

1. **Link RelativisticTravel to StarMap**
   - Import/instantiate RelativisticTravel in star_map.js
   - Create `calculateFleetTravelTime(distanceLY, driveTier)` method

2. **Update Fleet Creation**
   - Calculate actual travel times in `launchProbeFleet()`
   - Store `arrivalTime` in fleet object
   - Keep visual animation separate

3. **Update Fleet Processing**
   - Check `this.time >= fleet.arrivalTime` for actual arrival
   - Animation progress remains visual-only

### Phase B: Drive Tier Mapping

1. **Sync drive tiers with starship_drives.json**
   - Load drive data at initialization
   - Map propulsion research to drive tier
   - Get acceleration from JSON instead of hardcoded

2. **Handle special drives**
   - FTL drives (tiers 8-10): use effective velocity
   - Alcubierre: 0.9c, no dilation
   - Hyperspace: 10c effective
   - Instantaneous: 0 travel time

### Phase C: UI Integration

1. **Fleet tooltip/panel**
   - Show ship time vs game time
   - Show time dilation factor
   - Show arrival date

2. **Launch preview**
   - Preview travel times before launching
   - Show cost/benefit of waiting for better drives

3. **Time dilation indicator**
   - Small γ symbol showing dilation factor
   - Color coded: green < 2, yellow 2-10, red > 10

### Phase D: Gameplay Implications

1. **Distant probes appear to fly faster**
   - A probe to 100 ly visually moves at 10.6 ly/yr
   - A probe to 4 ly visually moves at 1.1 ly/yr
   - This IS the time dilation effect - proper time is compressed

2. **Galaxy colonization is fast (in game time)**
   - Galaxy center (25,000 ly) takes only ~20 years at 1g
   - Andromeda (2.5M ly) would take ~28 years at 1g
   - The universe is reachable in a human lifetime (subjectively)

3. **Strategy considerations**
   - Higher acceleration = even faster trips
   - At 10g: 100 ly in 4.5 years, 25,000 ly in 11 years
   - FTL drives provide coordination, not just speed

---

## Part 5: Code Snippets

### Calculate Fleet Travel (Proper Time = Game Time)

```javascript
calculateFleetTravel(distanceLY, driveTier) {
    const drive = this.getStarshipDrive(driveTier);

    // FTL modes - no relativistic effects, use effective velocity
    if (drive.effective_velocity_c !== undefined) {
        const effectiveC = parseFloat(drive.effective_velocity_c);
        if (effectiveC === Infinity || drive.id === 'instantaneous') {
            return {
                travelTime: 0.001,      // Minimum 1/1000 year (8.7 hours)
                maxVelocityC: Infinity,
                gamma: 1.0,
                visualSpeedLYperYr: distanceLY / 0.001,
                isFTL: true
            };
        }
        // FTL but not instant (Alcubierre, Hyperspace)
        const time = distanceLY / effectiveC;
        return {
            travelTime: time,
            maxVelocityC: effectiveC,
            gamma: 1.0,
            visualSpeedLYperYr: effectiveC,
            isFTL: true
        };
    }

    // Relativistic brachistochrone calculation
    const accelG = drive.acceleration_g;
    const travel = this.relativisticTravel.calculateTravel(distanceLY, accelG);

    // PROPER TIME (ship time) IS THE GAME TIME
    const travelTime = travel.ship_time.years;
    const visualSpeed = distanceLY / travelTime;

    return {
        travelTime: travelTime,         // This IS game time
        maxVelocityC: travel.max_velocity.fraction_c,
        gamma: travel.gamma,
        visualSpeedLYperYr: visualSpeed,  // Appears to move this fast
        isFTL: false
    };
}
```

### Updated launchProbeFleet

```javascript
launchProbeFleet(targetData, targetPos, launchStar) {
    const distanceUnits = launchStar.position.distanceTo(targetPos);
    const distanceLY = distanceUnits * 326;  // Convert from units to ly

    const driveTier = this.getDriveResearchTier();
    const travel = this.calculateFleetTravel(distanceLY, driveTier);

    // Create fleet with physics data
    const fleet = {
        // ... visual/3D fields

        // Physics
        distanceLY: distanceLY,
        distanceUnits: distanceUnits,
        driveTier: driveTier,

        // Time (proper time = game time)
        launchTime: this.time,
        travelTime: travel.travelTime,        // Proper time = game time
        arrivalTime: this.time + travel.travelTime,

        // Relativistic info (for display)
        maxVelocityC: travel.maxVelocityC,
        gamma: travel.gamma,
        visualSpeedLYperYr: travel.visualSpeedLYperYr,
        isFTL: travel.isFTL
    };

    // Log physics - shows why distant probes appear fast
    console.log(`[Fleet] Launched to ${distanceLY.toFixed(1)} ly:`,
        `Travel time ${travel.travelTime.toFixed(2)} yr (proper time),`,
        `Visual speed ${travel.visualSpeedLYperYr.toFixed(1)} ly/yr,`,
        `γ=${travel.gamma.toFixed(1)}`);

    return fleet;
}
```

### Updated updateProbeFleets

```javascript
updateProbeFleets() {
    for (const fleet of this.probeFleets) {
        const elapsed = this.time - fleet.launchTime;
        const progress = Math.min(1, elapsed / fleet.travelTime);

        if (progress >= 1) {
            // Arrived! Colonize the star
            this.colonizeStar(fleet);
        } else {
            // Animate position based on game time progress
            // Distant probes VISUALLY move faster due to time dilation
            fleet.probe.position.lerpVectors(fleet.start, fleet.target, progress);
        }
    }
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `star_map.js` | Integrate RelativisticTravel, update fleet creation/processing |
| `style.css` | Add fleet info panel styles, time dilation indicator |

## Files to Use (Already Exist)

| File | Purpose |
|------|---------|
| `relativistic_travel.js` | Core physics calculations |
| `starship_drives.json` | Drive tier data with acceleration values |

---

## Design Decisions

| Question | Decision |
|----------|----------|
| What is "game time"? | **Proper time** (ship time) - the probe's subjective experience |
| Visual animation speed? | **Synced to game time** - distant probes visually move faster |
| Why do distant probes appear fast? | **Time dilation** - proper time is compressed at high γ |
| FTL drives? | Use effective velocity, no dilation (γ=1) |
| Minimum travel time? | **0.001 years** (8.7 hours) - even instantaneous takes *some* time |
| What does γ badge show? | Peak Lorentz factor - helps explain visual speed |
