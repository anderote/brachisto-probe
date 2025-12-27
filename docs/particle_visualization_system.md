# Particle Visualization System

This document describes the unified particle visualization system used for animating resource production, consumption, and transfers in Brachisto Probe.

## Overview

The particle system creates visual representations of material flowing through the game economy:
- **Mining** - particles emerge from planets as ore is extracted
- **Recycling** - slag particles are converted back to metal particles
- **Replication** - probe particles are produced from metal
- **Mass Transfers** - particles travel along Hohmann trajectories to the Dyson sphere

All particle types use a unified **Pareto (power-law) distribution** for mass and visual size, creating a natural "many small, few large" appearance similar to real asteroid distributions.

## Configuration

All particle parameters are centralized in `game_data/economic_rules.json` under the `particle_visualization` section:

```json
{
  "particle_visualization": {
    "mass_distribution": {
      "min_mass_kg": 1e6,      // Minimum particle mass (1 megakilogram)
      "max_mass_kg": 1e22,     // Maximum particle mass (10 zettakilograms)
      "shape_parameter": 1.15  // Pareto α parameter
    },
    "visual_size": {
      "min_size": 0.05,        // Visual size for min mass
      "max_size": 3.5,         // Visual size for max mass
      "scaling": "logarithmic"
    },
    "spawn_rate": {
      "min_rate_per_day": 0.5,
      "max_rate_per_day": 15
    },
    "colors": {
      "metal": "#C0C0C0",      // Silver
      "slag": "#5C4033",       // Brown-grey
      "methalox": "#7EC8E3",   // Pale blue
      "probe": "#88FFFF"       // Light cyan
    },
    "probe_individual": {
      "max_individual_count": 100,
      "individual_size": 0.04
    },
    "drift_animation": {
      "resource_base_duration_days": 90,
      "resource_distance_scaling_days": 50,
      "probe_individual_duration_days": 5,
      "probe_mass_duration_days": 30,
      "mass_driver_duration_days": 36
    }
  }
}
```

## Mass Distribution

### Pareto Distribution

The system uses a **truncated Pareto distribution** for particle masses:

```
P(X > x) = (min_mass / x)^α  for min_mass ≤ x ≤ max_mass
```

Where:
- `α = 1.15` (shape parameter) - creates heavy tail
- `min_mass = 1e6 kg` (1,000 tonnes)
- `max_mass = 1e22 kg` (10 zettakilograms)

### Sampling Algorithm

```javascript
sampleParticleMassExponential() {
    const alpha = this.particleDistribution.shapeParameter;
    const minMass = this.particleDistribution.minMass;
    const maxMass = this.particleDistribution.maxMass;
    
    // Sample from truncated Pareto
    const u = Math.random();
    const maxRatio = Math.pow(minMass / maxMass, alpha);
    const clampedU = maxRatio + u * (1 - maxRatio);
    
    return minMass / Math.pow(clampedU, 1 / alpha);
}
```

### Expected Value

For the truncated Pareto distribution, the expected value is:

```
E[X] ≈ α × min_mass / (α - 1)  (for α > 1 without truncation)
```

With α = 1.15 and min_mass = 1e6:
```
E[X] ≈ 1.15 × 1e6 / 0.15 ≈ 7.67e6 kg
```

However, the truncation at max_mass shifts the effective mean toward ~1e21 kg for larger samples.

### Calibration

The distribution is calibrated so that **Jupiter's mass (1.898e27 kg)** produces approximately **800,000 particles** when fully mined.

## Visual Size Scaling

Visual size follows **logarithmic scaling** with mass:

```javascript
massToVisualSize(mass) {
    const config = this.particleDistribution;
    const logMin = Math.log10(config.minMass);
    const logMax = Math.log10(config.maxMass);
    const logMass = Math.log10(Math.max(config.minMass, Math.min(config.maxMass, mass)));
    
    // t ranges from 0 (min mass) to 1 (max mass)
    const t = (logMass - logMin) / (logMax - logMin);
    
    // Exponential interpolation from min to max size
    const sizeRatio = config.maxVisualSize / config.minVisualSize;
    return config.minVisualSize * Math.pow(sizeRatio, t);
}
```

This creates:
- **1e6 kg particles** → size 0.05 (dust specks)
- **1e14 kg particles** → size ~0.35 (small asteroids)
- **1e22 kg particles** → size 3.5 (planet chunks)

## Particle Types

### 1. Resource Particles (Metal, Slag, Methalox)

- Spawn at planet surface when mining produces resources
- Drift outward to orbital cloud over 90-140 game days
- Use full Pareto distribution for size variety
- Orbit at 80% of Kepler speed (trailing cloud effect)

### 2. Probe Particles

**Individual Probes** (first 100 per zone):
- Fixed size (0.4) - larger dots for visibility
- Quick drift (5 game days)
- Represent actual individual probes

**Probe Mass Particles** (beyond 100):
- Use Pareto distribution like resources
- Light cyan color (#88FFFF)
- Longer drift (30 game days)

**Probe Transfers** (in transit):
- Use same dot rendering as stationary probes
- Size: 0.4 (matches individual probes)
- Rendered as THREE.Points for consistency

### 3. Mass Driver Particles

- Launched from planets toward Dyson sphere
- Follow Hohmann transfer-like trajectories
- Use Pareto distribution for mass/size
- Drift duration: 36 game days
- Upon arrival, integrate into Dyson sphere visualization

## Mass Conservation

The system is designed to conserve mass:

1. **Spawn**: Each particle has a specific mass sampled from the distribution
2. **Pending Mass**: Unspawned mass is tracked in `pendingMass` accumulators
3. **Consumption**: When resources are consumed, particles are removed by mass
4. **Transfer**: Particles traveling via mass driver carry their mass value

### Mass Accounting Flow

```
Mining Rate (kg/day)
    ↓
pendingMass[zoneId][type] accumulator
    ↓
spawnResourceParticleWithMass() - creates particle with exact mass
    ↓
Particle stored in resourceParticleData[zoneId][type]
    ↓
On consumption: particles removed by mass (largest first)
```

## Animation Timing

All particle animations use **game time** (not real-world time), ensuring:
- Particles freeze when game is paused
- Particles animate faster when game is sped up
- Consistent visual experience regardless of frame rate

### Drift Animation

Particles drift from spawn point to orbital position using smooth easing:

```javascript
const t = timeSinceSpawn / driftDuration;
const easedT = 1 - Math.pow(1 - t, 2.5); // Ease-out curve

const currentAngle = spawnAngle + (targetAngle - spawnAngle) * easedT;
const currentDistance = spawnDistance + (targetDistance - spawnDistance) * easedT;
```

## Integration Points

### GameDataLoader

```javascript
// Load config at startup
await gameDataLoader.loadEconomicRules();
const config = gameDataLoader.getParticleVisualization();
```

### SolarSystem Class

```javascript
// Constructor calls:
this.applyDefaultParticleConfig();  // Fallback values

// During init:
await this.loadParticleConfig();    // Load from JSON

// Key methods:
sampleParticleMassExponential()     // Sample mass from distribution
massToVisualSize(mass)              // Convert mass to visual size
spawnResourceParticleWithMass()     // Spawn resource particle
spawnMassDriverParticle()           // Spawn transfer particle
```

## Tuning Parameters

### For More/Fewer Particles

Adjust `spawn_rate`:
```json
"spawn_rate": {
  "min_rate_per_day": 0.5,  // Lower = fewer particles
  "max_rate_per_day": 15    // Higher = more particles
}
```

### For Different Size Distribution

Adjust `shape_parameter`:
- **Lower α (1.0-1.1)**: Heavier tail, more size variation
- **Higher α (1.2-1.5)**: Lighter tail, more uniform sizes

### For Faster/Slower Animations

Adjust `drift_animation` durations (in game days):
```json
"drift_animation": {
  "resource_base_duration_days": 90,      // Base drift time
  "resource_distance_scaling_days": 50,   // Added based on distance
  ...
}
```

## Performance Considerations

- Maximum 50,000 particles per zone
- Particles use THREE.js BufferGeometry for efficient GPU rendering
- Particle buffer is rebuilt only when particles are added/removed
- Size and position updates are batched per frame

