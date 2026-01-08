# Physics-First Technology Tree Design

## Design Principles

1. **Real physics values**: ISP in seconds, magnetic flux in Tesla, power in Watts
2. **Cross-cutting effects**: Technologies affect multiple systems
3. **Hard sci-fi progression**: From proven tech → theoretical → speculative (but physically grounded)
4. **Diminishing returns at high tiers**: Early research is fast, late research is slow

---

# ELECTROMAGNETIC MASS DRIVER PHYSICS MODEL

Mass drivers are the core infrastructure for interplanetary logistics. This model calculates muzzle velocity from first principles.

## Coilgun Physics

A coilgun (electromagnetic launcher) accelerates a projectile through a series of electromagnetic coils. The key equations:

### Force on Projectile
```
F = m × ∇(B²/2μ₀) × V_projectile
```
Where:
- B = magnetic flux density (Tesla)
- μ₀ = 4π × 10⁻⁷ H/m (permeability of free space)
- V_projectile = volume of magnetic projectile material

For a simplified model with N stages:
```
F_stage = (B² × A_coil) / (2 × μ₀)
```

### Energy and Velocity

Kinetic energy imparted:
```
E_kinetic = ½mv²
```

From energy input:
```
v = √(2 × η × E_input / m)
```

Where η is total system efficiency.

### Efficiency Breakdown

Total efficiency η = η_electrical × η_magnetic × η_thermal × η_switching

| Component | Copper Coils | LTS Superconductor | HTS Superconductor | Room-Temp SC |
|-----------|-------------|-------------------|-------------------|--------------|
| η_electrical | 0.70 | 0.95 | 0.97 | 0.99 |
| η_magnetic | 0.80 | 0.90 | 0.93 | 0.96 |
| η_thermal | 0.90 | 0.85 | 0.92 | 0.98 |
| η_switching | 0.85 | 0.90 | 0.94 | 0.97 |
| **Total η** | **0.43** | **0.65** | **0.79** | **0.90** |

### Magnetic Field Limits

Maximum achievable B-field depends on conductor technology:

| Technology | Max B (Tesla) | Critical Current (A/mm²) | Operating Temp (K) |
|------------|--------------|-------------------------|-------------------|
| Copper electromagnet | 2 | N/A (resistive) | 300 |
| NbTi (LTS) | 10 | 3,000 | 4.2 |
| Nb₃Sn (LTS) | 20 | 2,500 | 4.2 |
| MgB₂ | 15 | 1,000 | 20-30 |
| YBCO (HTS) | 25 | 500 | 77 |
| REBCO 2G | 30 | 800 | 77 |
| Theoretical RTSC | 50+ | 5,000+ | 300 |

### Barrel Length and Acceleration

For a given barrel length L and maximum acceleration a_max (limited by projectile structural integrity):

```
v_max = √(2 × a_max × L)
```

Human-safe acceleration: 10g (98 m/s²)
Structural limit (steel projectile): 10,000g (98,000 m/s²)
Structural limit (CNT projectile): 100,000g (980,000 m/s²)

### Power Requirements

Instantaneous power for acceleration:
```
P = F × v = m × a × v
```

For a 100 kg projectile accelerated to 10 km/s over 1 km barrel:
- a = v²/2L = (10,000)²/(2×1000) = 50,000 m/s² ≈ 5,000g
- t = 2L/v = 0.2 seconds
- E = ½mv² = 5 GJ
- P_avg = E/t = 25 GW

### Complete Muzzle Velocity Formula

```javascript
function calculateMuzzleVelocity(params) {
    const {
        B_max,              // Maximum magnetic field (Tesla)
        barrel_length,      // Launcher length (meters)
        projectile_mass,    // Payload mass (kg)
        efficiency,         // Total system efficiency (0-1)
        power_available,    // Available power (Watts)
        capacitor_energy,   // Stored energy (Joules)
        max_acceleration,   // Structural limit (m/s²)
        coil_stages         // Number of acceleration stages
    } = params;

    // Method 1: Energy-limited velocity
    const v_energy = Math.sqrt(2 * efficiency * capacitor_energy / projectile_mass);

    // Method 2: Acceleration-limited velocity
    const v_accel = Math.sqrt(2 * max_acceleration * barrel_length);

    // Method 3: Power-limited (continuous operation)
    // Time to traverse barrel at average velocity v/2
    // P = E/t = (½mv²) / (L/(v/2)) = mv³/4L
    // v³ = 4PL/m
    const v_power = Math.pow(4 * power_available * barrel_length / projectile_mass, 1/3);

    // Method 4: Magnetic field limited
    // F_max = B²A/(2μ₀), assuming A = 1 m² effective area
    const mu_0 = 4 * Math.PI * 1e-7;
    const F_max = (B_max * B_max * 1) / (2 * mu_0);
    const a_magnetic = F_max / projectile_mass;
    const v_magnetic = Math.sqrt(2 * a_magnetic * barrel_length);

    // Actual velocity is minimum of all limits
    return Math.min(v_energy, v_accel, v_power, v_magnetic);
}
```

### Mass Driver Performance by Tech Level

| Tech Level | B_max (T) | Efficiency | Typical Velocity | Power for 100kg@10km/s |
|------------|-----------|------------|------------------|----------------------|
| 1: Copper EM | 2 | 0.43 | 1-2 km/s | 58 GW |
| 2: Basic SC (NbTi) | 10 | 0.55 | 5-8 km/s | 45 GW |
| 3: Advanced SC (Nb₃Sn) | 20 | 0.65 | 10-15 km/s | 38 GW |
| 4: HTS (YBCO) | 25 | 0.75 | 15-25 km/s | 33 GW |
| 5: 2G HTS (REBCO) | 30 | 0.80 | 25-40 km/s | 31 GW |
| 6: Fusion-Grade | 40 | 0.85 | 40-60 km/s | 29 GW |
| 7: Room-Temp SC | 50 | 0.90 | 60-100 km/s | 28 GW |
| 8: Exotic (flux compression) | 100+ | 0.92 | 100-200 km/s | 27 GW |

---

# TECHNOLOGY TREE 1: PROPULSION

Propulsion determines probe delta-v capacity through specific impulse (ISP).

## Physics Foundation

**Tsiolkovsky Rocket Equation:**
```
Δv = v_exhaust × ln(m_initial / m_final)
Δv = ISP × g₀ × ln(mass_ratio)
```

Where:
- ISP = specific impulse (seconds)
- g₀ = 9.81 m/s² (standard gravity)
- v_exhaust = ISP × g₀

**Thrust-to-Weight Considerations:**
- High-thrust (chemical): Good for escaping gravity wells
- Low-thrust (electric): Better for interplanetary cruise

## Propulsion Tiers

### Tier 1: Cold Gas / Monopropellant
- **ISP**: 60-230 seconds
- **Technology**: N₂ cold gas, hydrazine decomposition
- **Thrust/Weight**: 0.1-5
- **Use Case**: Attitude control, small maneuvers
- **Research Cost**: 10 EFLOP-days (baseline)

### Tier 2: Bipropellant Chemical
- **ISP**: 280-330 seconds
- **Technology**: N₂O₄/UDMH, hypergolics
- **Thrust/Weight**: 10-50
- **Historical**: Apollo, Proton, early spacecraft
- **Research Cost**: 25 EFLOP-days

### Tier 3: Methalox (CH₄/LOX)
- **ISP**: 350-380 seconds (vacuum)
- **Technology**: Raptor-class engines
- **Thrust/Weight**: 50-100
- **Advantages**: Reusable, ISRU-compatible (make fuel on Mars)
- **Research Cost**: 50 EFLOP-days

### Tier 4: Hydrolox (H₂/LOX)
- **ISP**: 450-465 seconds
- **Technology**: SSME, RL-10, RS-25
- **Thrust/Weight**: 30-80
- **Advantages**: Highest chemical ISP
- **Challenges**: Cryogenic hydrogen handling
- **Research Cost**: 100 EFLOP-days

### Tier 5: Nuclear Thermal Rocket (NTR)
- **ISP**: 850-1000 seconds
- **Technology**: NERVA, DUMBO, solid-core fission
- **Thrust/Weight**: 3-10
- **Propellant**: Hydrogen heated by fission reactor
- **Historical**: Successfully tested in 1960s
- **Research Cost**: 300 EFLOP-days

### Tier 6: Ion / Hall Effect Thruster
- **ISP**: 1,500-5,000 seconds
- **Technology**: Dawn spacecraft, Starlink satellites
- **Thrust/Weight**: 0.0001-0.001
- **Power Required**: 1-10 kW per Newton of thrust
- **Research Cost**: 500 EFLOP-days

### Tier 7: VASIMR (Variable ISP Magnetoplasma)
- **ISP**: 3,000-30,000 seconds (variable)
- **Technology**: Ad Astra design, tested on ISS
- **Thrust/Weight**: 0.001-0.01
- **Unique**: Can trade ISP for thrust
- **Research Cost**: 1,000 EFLOP-days

### Tier 8: Nuclear Electric Propulsion (NEP)
- **ISP**: 5,000-10,000 seconds
- **Technology**: Fission reactor + ion engine
- **Thrust/Weight**: 0.001
- **Advantages**: High power, unlimited by solar distance
- **Research Cost**: 3,000 EFLOP-days

### Tier 9: Magnetoplasmadynamic (MPD) Thruster
- **ISP**: 2,000-8,000 seconds
- **Technology**: High-power plasma acceleration
- **Thrust/Weight**: 0.01-0.1
- **Power Required**: 100 kW - 10 MW
- **Research Cost**: 8,000 EFLOP-days

### Tier 10: Pulsed Plasma / VASIMR-2
- **ISP**: 10,000-20,000 seconds
- **Technology**: Advanced plasma confinement
- **Research Cost**: 20,000 EFLOP-days

### Tier 11: Magnetized Target Fusion (MTF)
- **ISP**: 20,000-50,000 seconds
- **Technology**: Fusion plasma + magnetic nozzle
- **Exhaust Velocity**: 200-500 km/s
- **Based on**: General Fusion, Helion concepts
- **Research Cost**: 60,000 EFLOP-days

### Tier 12: Direct Fusion Drive (DFD)
- **ISP**: 50,000-100,000 seconds
- **Technology**: Princeton PFRC, D-He3 fusion
- **Exhaust Velocity**: 500-1000 km/s
- **Thrust/Weight**: 0.01-0.1
- **Research Cost**: 150,000 EFLOP-days

### Tier 13: Antimatter-Catalyzed Fusion
- **ISP**: 100,000-500,000 seconds
- **Technology**: Antimatter ignition of fusion
- **Exhaust Velocity**: 1,000-5,000 km/s
- **Research Cost**: 500,000 EFLOP-days

### Tier 14: Pure Antimatter Rocket
- **ISP**: 1,000,000+ seconds
- **Technology**: Matter-antimatter annihilation
- **Exhaust Velocity**: ~0.3c (pion exhaust)
- **Theoretical maximum for reaction drives**
- **Research Cost**: 2,000,000 EFLOP-days

### Tier 15: Pais Effect Inertial Mass Reduction
- **ISP**: Effectively infinite (reactionless)
- **Technology**: High-frequency EM field inertial modification
- **Based on**: Salvatore Pais patents (US Navy)
- **Mechanism**: Reduces effective inertial mass, not reaction drive
- **Research Cost**: 10,000,000 EFLOP-days

### Tier 16: Alcubierre-White Warp Field
- **ISP**: N/A (spacetime manipulation)
- **Technology**: Negative energy density metric engineering
- **Based on**: Alcubierre (1994), White's modifications
- **Mechanism**: Contracts space ahead, expands behind
- **Research Cost**: 100,000,000 EFLOP-days

---

# TECHNOLOGY TREE 2: ELECTROMAGNETICS

Affects mass drivers, mining efficiency, power systems, and fusion containment.

## Physics Foundation

**Magnetic Pressure:**
```
P_magnetic = B² / (2μ₀)
```
At 10 Tesla: P = 40 MPa (400 atmospheres)
At 50 Tesla: P = 1 GPa

**Superconductor Critical Parameters:**
- B_c: Critical magnetic field
- J_c: Critical current density
- T_c: Critical temperature

## Electromagnetics Tiers

### Tier 1: Permanent Magnets
- **Max Field**: 1.5 Tesla (NdFeB)
- **Mass Driver Velocity**: 0.5-1 km/s
- **Mining Bonus**: 1.0× (baseline)
- **No power required for field**
- **Research Cost**: 10 EFLOP-days

### Tier 2: Copper Electromagnets
- **Max Field**: 2-3 Tesla
- **Mass Driver Velocity**: 1-2 km/s
- **Mining Bonus**: 1.2×
- **Power**: High (resistive losses)
- **Research Cost**: 30 EFLOP-days

### Tier 3: Low-Temperature Superconductor (NbTi)
- **Max Field**: 10 Tesla
- **Critical Temp**: 9.2 K (requires liquid helium)
- **Critical Current**: 3,000 A/mm²
- **Mass Driver Velocity**: 5-8 km/s
- **Mining Bonus**: 1.8×
- **Research Cost**: 100 EFLOP-days

### Tier 4: High-Field LTS (Nb₃Sn)
- **Max Field**: 20 Tesla
- **Critical Temp**: 18 K
- **Critical Current**: 2,500 A/mm²
- **Mass Driver Velocity**: 10-15 km/s
- **Mining Bonus**: 2.5×
- **Enables**: Basic magnetic confinement fusion research
- **Research Cost**: 300 EFLOP-days

### Tier 5: MgB₂ Superconductor
- **Max Field**: 15 Tesla
- **Critical Temp**: 39 K (liquid hydrogen cooling)
- **Advantages**: Cheaper cooling than LTS
- **Mass Driver Velocity**: 12-18 km/s
- **Mining Bonus**: 3.0×
- **Research Cost**: 600 EFLOP-days

### Tier 6: First-Gen HTS (YBCO)
- **Max Field**: 25 Tesla
- **Critical Temp**: 93 K (liquid nitrogen cooling!)
- **Critical Current**: 500 A/mm²
- **Mass Driver Velocity**: 20-30 km/s
- **Mining Bonus**: 4.0×
- **Game-changer**: LN2 is cheap and easy
- **Research Cost**: 1,500 EFLOP-days

### Tier 7: Second-Gen HTS (REBCO Tape)
- **Max Field**: 30 Tesla
- **Critical Temp**: 93 K
- **Critical Current**: 800 A/mm² (improved architecture)
- **Mass Driver Velocity**: 30-45 km/s
- **Mining Bonus**: 5.0×
- **Enables**: Compact fusion devices
- **Research Cost**: 4,000 EFLOP-days

### Tier 8: ITER-Class Fusion Magnets
- **Max Field**: 13 Tesla (but HUGE scale)
- **Technology**: Hybrid Nb₃Sn + REBCO
- **Mass Driver Velocity**: 40-60 km/s
- **Mining Bonus**: 6.0×
- **Enables**: D-T fusion power plants
- **Research Cost**: 12,000 EFLOP-days

### Tier 9: Compact Stellarator Magnets
- **Max Field**: 40 Tesla
- **Technology**: Advanced HTS 3D coil winding
- **Mass Driver Velocity**: 60-80 km/s
- **Mining Bonus**: 8.0×
- **Enables**: Compact fusion reactors
- **Research Cost**: 35,000 EFLOP-days

### Tier 10: Room-Temperature Superconductor
- **Max Field**: 50+ Tesla
- **Critical Temp**: 300 K (room temperature!)
- **Theoretical**: Based on hydrogen-rich compounds under pressure
- **Mass Driver Velocity**: 80-120 km/s
- **Mining Bonus**: 12.0×
- **Enables**: Ubiquitous superconductor applications
- **Research Cost**: 100,000 EFLOP-days

### Tier 11: Flux Compression Generators
- **Max Field**: 100-1000 Tesla (pulsed)
- **Technology**: Explosive or EM flux compression
- **Mass Driver Velocity**: 150-300 km/s
- **Mechanism**: Compress field in microseconds
- **Research Cost**: 300,000 EFLOP-days

### Tier 12: Exotic Matter Magnetic Confinement
- **Max Field**: 1000+ Tesla (sustained)
- **Technology**: Negative mass stabilization
- **Mass Driver Velocity**: 300-500 km/s
- **Mining Bonus**: 50.0×
- **Enables**: Antimatter containment at scale
- **Research Cost**: 1,000,000 EFLOP-days

---

# TECHNOLOGY TREE 3: THERMAL MANAGEMENT

Everything in space needs heat rejection. This is the hidden bottleneck for all high-power systems.

## Physics Foundation

**Stefan-Boltzmann Law:**
```
Q = ε × σ × A × T⁴
```
Where:
- Q = heat radiated (Watts)
- ε = emissivity (0-1)
- σ = 5.67 × 10⁻⁸ W/(m²·K⁴)
- A = radiator area (m²)
- T = temperature (Kelvin)

**Radiator Mass Scaling:**
```
mass = A × ρ × thickness
Power/mass ∝ T⁴/thickness
```

Higher temperature = much more power per area (T⁴ scaling)

## Thermal Tiers

### Tier 1: Passive Thermal Control
- **Temperature**: 250-350 K
- **Power Density**: 300-500 W/m²
- **Mass Penalty**: 5 kg/kW rejected
- **Technology**: Paint coatings, MLI blankets
- **Research Cost**: 10 EFLOP-days

### Tier 2: Deployable Radiator Panels
- **Temperature**: 300-400 K
- **Power Density**: 500-1,500 W/m²
- **Mass Penalty**: 3 kg/kW rejected
- **Technology**: ISS-style deployable panels
- **Research Cost**: 30 EFLOP-days

### Tier 3: Heat Pipe Radiators
- **Temperature**: 400-600 K
- **Power Density**: 2-8 kW/m²
- **Mass Penalty**: 1.5 kg/kW
- **Technology**: Ammonia/sodium heat pipes
- **Research Cost**: 80 EFLOP-days

### Tier 4: Pumped Loop Radiators
- **Temperature**: 500-800 K
- **Power Density**: 10-30 kW/m²
- **Mass Penalty**: 0.8 kg/kW
- **Technology**: High-temp liquid metal loops
- **Research Cost**: 200 EFLOP-days

### Tier 5: Liquid Droplet Radiators (LDR)
- **Temperature**: 500-1000 K
- **Power Density**: 30-100 kW/m²
- **Mass Penalty**: 0.3 kg/kW
- **Technology**: Spray liquid droplets into space, collect at receiver
- **Advantages**: No solid structure needed
- **Research Cost**: 600 EFLOP-days

### Tier 6: Liquid Metal MHD Radiators
- **Temperature**: 800-1200 K
- **Power Density**: 100-300 kW/m²
- **Mass Penalty**: 0.15 kg/kW
- **Technology**: EM-pumped liquid lithium
- **Research Cost**: 1,500 EFLOP-days

### Tier 7: Dust/Particle Radiators
- **Temperature**: 600-1500 K
- **Power Density**: 200-500 kW/m²
- **Mass Penalty**: 0.08 kg/kW
- **Technology**: Eject hot dust, use EM to recapture
- **Research Cost**: 4,000 EFLOP-days

### Tier 8: Phase-Change Material Buffers
- **Effective Power**: 500-1000 kW/m²
- **Mass Penalty**: 0.05 kg/kW
- **Technology**: Melt/freeze cycles for thermal storage
- **Enables**: Pulsed high-power operation
- **Research Cost**: 10,000 EFLOP-days

### Tier 9: Laser Ablation Cooling
- **Effective Power**: 1-5 MW/m²
- **Mass Penalty**: 0.02 kg/kW
- **Technology**: Vaporize sacrificial mass with lasers
- **Best for**: Emergency/burst cooling
- **Research Cost**: 30,000 EFLOP-days

### Tier 10: Supercritical CO₂ Brayton Radiators
- **Temperature**: 800-1000 K
- **Power Density**: 1-3 MW/m²
- **Mass Penalty**: 0.01 kg/kW
- **Technology**: sCO₂ power cycle + compact heat exchanger
- **Research Cost**: 80,000 EFLOP-days

### Tier 11: Magnetically-Confined Plasma Radiators
- **Temperature**: 10,000+ K
- **Power Density**: 10-50 MW/m²
- **Mass Penalty**: 0.005 kg/kW
- **Technology**: Use magnetic fields to suspend radiating plasma
- **Research Cost**: 250,000 EFLOP-days

### Tier 12: Quantum Tunneling Heat Transfer
- **Effective Rate**: 100+ MW/m²
- **Mass Penalty**: 0.002 kg/kW
- **Technology**: Phonon tunneling through vacuum gaps
- **Based on**: Near-field radiative transfer research
- **Research Cost**: 800,000 EFLOP-days

### Tier 13: Hawking Radiation Injection
- **Effective Rate**: Unlimited (mass-limited)
- **Mass Penalty**: Negative (converts heat to mass loss)
- **Technology**: Micro black hole heat sinks
- **Speculative but physically consistent
- **Research Cost**: 5,000,000 EFLOP-days

---

# TECHNOLOGY TREE 4: MATERIALS SCIENCE

Affects structural mass, probe mass, impact resistance, and enables advanced structures.

## Physics Foundation

**Specific Strength:**
```
σ_specific = σ_tensile / ρ
```
Higher specific strength = lighter structures for same load

**Key Properties:**
- Tensile strength (Pa)
- Density (kg/m³)
- Young's modulus (stiffness)
- Thermal expansion coefficient
- Radiation resistance

## Materials Tiers

### Tier 1: Steel Alloys
- **Tensile Strength**: 500-2000 MPa
- **Density**: 7,850 kg/m³
- **Specific Strength**: 0.06-0.25 MN·m/kg
- **Mass Factor**: 1.0 (baseline)
- **Research Cost**: 10 EFLOP-days

### Tier 2: Aluminum Alloys (7075-T6)
- **Tensile Strength**: 500-600 MPa
- **Density**: 2,810 kg/m³
- **Specific Strength**: 0.18-0.21 MN·m/kg
- **Mass Factor**: 0.85
- **Research Cost**: 25 EFLOP-days

### Tier 3: Titanium Alloys (Ti-6Al-4V)
- **Tensile Strength**: 900-1200 MPa
- **Density**: 4,430 kg/m³
- **Specific Strength**: 0.20-0.27 MN·m/kg
- **Mass Factor**: 0.75
- **Radiation Resistant**: Yes
- **Research Cost**: 60 EFLOP-days

### Tier 4: Carbon Fiber Reinforced Polymer (CFRP)
- **Tensile Strength**: 1,500-3,500 MPa
- **Density**: 1,550 kg/m³
- **Specific Strength**: 1.0-2.3 MN·m/kg
- **Mass Factor**: 0.50
- **Research Cost**: 150 EFLOP-days

### Tier 5: Carbon Nanotube Composites
- **Tensile Strength**: 10,000-60,000 MPa
- **Density**: 1,300-1,400 kg/m³
- **Specific Strength**: 7-45 MN·m/kg
- **Mass Factor**: 0.30
- **Enables**: Space elevator tethers (marginally)
- **Research Cost**: 500 EFLOP-days

### Tier 6: Graphene Composites
- **Tensile Strength**: 130,000 MPa (theoretical)
- **Density**: 1,000 kg/m³
- **Specific Strength**: 130 MN·m/kg
- **Mass Factor**: 0.20
- **Enables**: Practical space elevators
- **Research Cost**: 1,500 EFLOP-days

### Tier 7: Boron Nitride Nanotube (BNNT)
- **Tensile Strength**: 60,000 MPa
- **Density**: 1,380 kg/m³
- **Specific Strength**: 43 MN·m/kg
- **Mass Factor**: 0.18
- **Special**: Radiation resistant, self-healing
- **Research Cost**: 4,000 EFLOP-days

### Tier 8: Diamond Nanothreads
- **Tensile Strength**: 300,000 MPa (theoretical)
- **Density**: 1,100 kg/m³
- **Specific Strength**: 270 MN·m/kg
- **Mass Factor**: 0.12
- **Based on**: Compressed benzene research
- **Research Cost**: 12,000 EFLOP-days

### Tier 9: Metallic Hydrogen (metastable)
- **Tensile Strength**: Unknown (exotic)
- **Density**: 1,300 kg/m³
- **Mass Factor**: 0.10
- **Special**: Superconducting at room temp, explosive energy storage
- **Based on**: High-pressure hydrogen research
- **Research Cost**: 40,000 EFLOP-days

### Tier 10: Atomically-Precise Manufacturing
- **Mass Factor**: 0.08
- **Technology**: Molecular nanotechnology
- **Special**: Perfect crystal structures, no defects
- **Enables**: Theoretical material limits
- **Research Cost**: 120,000 EFLOP-days

### Tier 11: Metamaterials (Programmable)
- **Mass Factor**: 0.05
- **Technology**: Reconfigurable atomic structure
- **Special**: Variable properties on demand
- **Research Cost**: 400,000 EFLOP-days

### Tier 12: Strange Matter / Quark Matter
- **Density**: 4 × 10¹⁷ kg/m³ (nuclear density)
- **Special**: Stable strange quark matter nuggets
- **Extremely speculative but theoretically possible
- **Research Cost**: 2,000,000 EFLOP-days

### Tier 13: Negative Mass Exotic Matter
- **Special**: Negative gravitational mass
- **Based on**: Alcubierre metric requirements
- **Required for**: Warp field generation
- **Research Cost**: 20,000,000 EFLOP-days

---

# TECHNOLOGY TREE 5: POWER SYSTEMS

Energy generation and storage for all operations.

## Physics Foundation

**Solar Flux:**
```
I = 1361 W/m² × (1 AU / r)²
```
- Mercury (0.39 AU): 8,900 W/m²
- Earth (1 AU): 1,361 W/m²
- Mars (1.52 AU): 590 W/m²
- Jupiter (5.2 AU): 50 W/m²
- Saturn (9.5 AU): 15 W/m²

**Fusion Energy Release:**
- D-T fusion: 17.6 MeV per reaction = 3.4 × 10¹⁴ J/kg
- D-He3 fusion: 18.3 MeV per reaction (aneutronic)

## Power Tiers

### Tier 1: Silicon Photovoltaics
- **Efficiency**: 20-22%
- **Power/Mass**: 50-100 W/kg
- **Degradation**: 1-2% per year (radiation)
- **Practical Limit**: Mars orbit
- **Research Cost**: 10 EFLOP-days

### Tier 2: Multi-Junction III-V (GaAs)
- **Efficiency**: 30-35%
- **Power/Mass**: 150-200 W/kg
- **Degradation**: 0.5% per year
- **Technology**: InGaP/GaAs/Ge triple junction
- **Research Cost**: 40 EFLOP-days

### Tier 3: Concentrated Solar Power (CSP)
- **Efficiency**: 35-40%
- **Power/Mass**: 200-400 W/kg (with concentrators)
- **Technology**: Mirrors/lenses focusing on small cells
- **Extends range**: Usable to asteroid belt
- **Research Cost**: 100 EFLOP-days

### Tier 4: Perovskite Tandem Cells
- **Efficiency**: 35-45%
- **Power/Mass**: 400-600 W/kg
- **Technology**: Perovskite + silicon tandem
- **Advantages**: Cheap, flexible, light
- **Research Cost**: 250 EFLOP-days

### Tier 5: Radioisotope Thermoelectric (RTG)
- **Efficiency**: 5-7%
- **Power/Mass**: 5-10 W/kg
- **Fuel**: Pu-238, Am-241
- **Half-life**: 87 years (Pu-238)
- **Advantage**: Works anywhere, no solar needed
- **Research Cost**: 500 EFLOP-days

### Tier 6: Kilopower Fission Reactor
- **Efficiency**: 25%
- **Power/Mass**: 10-50 W/kg
- **Power Range**: 1-10 kW
- **Fuel**: Highly enriched uranium
- **Technology**: NASA Kilopower/KRUSTY tested
- **Research Cost**: 1,200 EFLOP-days

### Tier 7: Fission Surface Power
- **Efficiency**: 30%
- **Power/Mass**: 30-100 W/kg
- **Power Range**: 40-1000 kW
- **Technology**: SAFE-400, megawatt-class reactors
- **Research Cost**: 3,000 EFLOP-days

### Tier 8: Fission Fragment Rocket/Power
- **Efficiency**: 85%+ (direct conversion)
- **Power/Mass**: 500-1000 W/kg
- **Technology**: Use fission fragments directly
- **Research Cost**: 8,000 EFLOP-days

### Tier 9: D-T Fusion (Tokamak)
- **Efficiency**: 40%
- **Power/Mass**: 100-500 W/kg
- **Power Range**: 100 MW - 10 GW
- **Fuel**: Deuterium + Tritium
- **Challenge**: Neutron damage, tritium breeding
- **Research Cost**: 25,000 EFLOP-days

### Tier 10: D-He3 Fusion (Aneutronic)
- **Efficiency**: 70%+ (direct conversion possible)
- **Power/Mass**: 1,000-5,000 W/kg
- **Fuel**: Deuterium + Helium-3
- **Advantage**: No neutron damage
- **Challenge**: He3 is rare (mine from lunar regolith or gas giants)
- **Research Cost**: 80,000 EFLOP-days

### Tier 11: p-B11 Fusion
- **Efficiency**: 75%
- **Power/Mass**: 2,000-10,000 W/kg
- **Fuel**: Proton + Boron-11
- **Advantage**: Truly aneutronic, abundant fuel
- **Challenge**: Highest ignition temperature
- **Research Cost**: 250,000 EFLOP-days

### Tier 12: Antimatter Power
- **Efficiency**: 50% (pair production losses)
- **Energy Density**: 9 × 10¹⁶ J/kg (E=mc²)
- **Power/Mass**: Limited by production rate
- **Challenge**: Making and storing antimatter
- **Research Cost**: 1,000,000 EFLOP-days

### Tier 13: Zero-Point Energy Extraction
- **Power Density**: Theoretically unlimited
- **Technology**: Casimir cavity arrays, vacuum fluctuation harvesting
- **Based on**: Quantum electrodynamic vacuum energy
- **Highly speculative but not forbidden by physics
- **Research Cost**: 5,000,000 EFLOP-days

### Tier 14: Kugelblitz (Black Hole Power)
- **Efficiency**: 90%+ (Hawking radiation)
- **Technology**: Feed mass into microscopic black hole
- **Based on**: Hawking (1974)
- **Challenge**: Creating/stabilizing micro black holes
- **Research Cost**: 50,000,000 EFLOP-days

---

# TECHNOLOGY TREE 6: AUTONOMY & COORDINATION

Reduces crowding penalties, improves swarm efficiency, enables self-replication.

## Scaling Challenges

**Current Crowding Model:**
```
efficiency = (1 - penalty_per_doubling)^log2(probe_count)
```

With 10¹² probes, even 0.1% penalty per doubling means efficiency = 0.97^40 ≈ 30%

Better coordination reduces this penalty.

## Autonomy Tiers

### Tier 1: Remote Control
- **Latency Tolerance**: < 10 seconds
- **Crowding Penalty**: 0.5% per doubling
- **Coordination Range**: Single zone
- **Research Cost**: 10 EFLOP-days

### Tier 2: Scripted Automation
- **Latency Tolerance**: Minutes
- **Crowding Penalty**: 0.4% per doubling
- **Technology**: Pre-programmed behavior trees
- **Research Cost**: 30 EFLOP-days

### Tier 3: Reactive Control
- **Latency Tolerance**: Hours
- **Crowding Penalty**: 0.3% per doubling
- **Technology**: Sensor-based local response
- **Research Cost**: 80 EFLOP-days

### Tier 4: Multi-Agent Coordination
- **Latency Tolerance**: Days
- **Crowding Penalty**: 0.2% per doubling
- **Technology**: Distributed consensus algorithms
- **Research Cost**: 200 EFLOP-days

### Tier 5: Swarm Intelligence
- **Latency Tolerance**: Weeks
- **Crowding Penalty**: 0.15% per doubling
- **Technology**: Emergent behavior from simple rules
- **Based on**: Ant colony, bee swarm algorithms
- **Research Cost**: 600 EFLOP-days

### Tier 6: Predictive Planning
- **Latency Tolerance**: Months
- **Crowding Penalty**: 0.10% per doubling
- **Technology**: Multi-year trajectory optimization
- **Research Cost**: 1,500 EFLOP-days

### Tier 7: Self-Modeling Agents
- **Crowding Penalty**: 0.07% per doubling
- **Technology**: Probes simulate themselves and neighbors
- **Research Cost**: 4,000 EFLOP-days

### Tier 8: Hierarchical Swarm Networks
- **Crowding Penalty**: 0.05% per doubling
- **Technology**: Local clusters with emergent hierarchy
- **Research Cost**: 12,000 EFLOP-days

### Tier 9: Telepresence Integration
- **Crowding Penalty**: 0.03% per doubling
- **Technology**: Light-speed-delay-tolerant shared consciousness
- **Research Cost**: 35,000 EFLOP-days

### Tier 10: Substrate-Independent Intelligence
- **Crowding Penalty**: 0.02% per doubling
- **Technology**: Cognition runs on any compatible hardware
- **Research Cost**: 100,000 EFLOP-days

### Tier 11: Quantum Coherent Swarms
- **Crowding Penalty**: 0.01% per doubling
- **Technology**: Quantum entanglement for coordination
- **Based on**: Quantum communication research
- **Research Cost**: 400,000 EFLOP-days

### Tier 12: Collective Consciousness
- **Crowding Penalty**: 0.005% per doubling
- **Technology**: All probes share unified awareness
- **Research Cost**: 1,500,000 EFLOP-days

### Tier 13: Acausal Coordination
- **Crowding Penalty**: ~0%
- **Technology**: Perfect coordination regardless of distance/light-lag
- **Based on**: Retrocausal signaling theories
- **Extremely speculative
- **Research Cost**: 10,000,000 EFLOP-days

---

# CROSS-CUTTING EFFECTS MATRIX

Each technology affects multiple systems. This creates interesting trade-offs.

## Effect Matrix

| Technology | Mass Driver | Mining | Probe ΔV | Power | Build Rate | Research |
|------------|-------------|--------|----------|-------|------------|----------|
| **Propulsion** | - | - | ★★★★★ | - | - | - |
| **Electromagnetics** | ★★★★★ | ★★★ | - | ★★ | - | - |
| **Thermal** | ★★ | ★ | ★ | ★★★★ | ★★ | ★ |
| **Materials** | ★★ | ★★ | ★★★ | ★ | ★★★★ | - |
| **Power** | ★★★ | ★★ | ★ | ★★★★★ | ★★ | ★★★ |
| **Autonomy** | - | ★ | - | - | ★★ | ★★★ |

## Specific Cross-Effects

### Electromagnetics → Mass Driver
```
muzzle_velocity = base_velocity × B_max_factor × efficiency_factor
```
Primary effect. Each EM tier directly improves launch capability.

### Electromagnetics → Mining
```
mining_bonus = 1.0 + (em_level × 0.15)
```
Magnetic separation improves ore processing.

### Electromagnetics → Power
```
generator_efficiency = base_eff × (1 + em_level × 0.05)
```
Better magnets = better generators and motors.

### Thermal → All High-Power Systems
```
max_power_density = base_power × thermal_multiplier
```
Without adequate cooling, systems throttle or fail.

### Thermal → Mass Driver
```
max_fire_rate = base_rate × thermal_factor
```
Heat buildup limits continuous operation.

### Materials → Probe Mass
```
probe_mass = base_mass × materials_factor
```
Lighter probes = more delta-v for same fuel.

### Materials → Structure Mass
```
structure_mass = base_mass × materials_factor
```
Lighter structures = easier to build and move.

### Materials → Mass Driver
```
max_acceleration = base_accel × materials_strength
```
Stronger projectiles survive higher g-loads.

### Power → Mass Driver
```
max_velocity = f(available_power)
```
More power = higher velocity (see physics model).

### Power → Research
```
research_rate = base_rate × sqrt(available_compute_power)
```
More power enables more computation.

### Autonomy → Crowding Penalty
```
crowding_efficiency = (1 - penalty)^log2(probe_count)
penalty = base_penalty × autonomy_reduction
```
Better coordination = less efficiency loss at scale.

---

# RESEARCH COST PROGRESSION

## Formula
```
cost = base_cost × tier_multiplier × complexity_factor

tier_multiplier = 1.8^(tier - 1)

complexity_factor varies by technology:
- Propulsion: 1.0 (well-understood physics)
- Electromagnetics: 1.2 (materials science challenges)
- Thermal: 0.8 (incremental improvements)
- Materials: 1.5 (requires breakthroughs)
- Power: 1.3 (safety and engineering)
- Autonomy: 0.9 (software-based)
```

## Example Progression

| Tier | Propulsion Cost | Cumulative | Notes |
|------|-----------------|------------|-------|
| 1 | 10 | 10 | Chemical rockets |
| 2 | 18 | 28 | |
| 3 | 32 | 60 | Methalox |
| 4 | 58 | 118 | Hydrolox |
| 5 | 105 | 223 | Nuclear thermal |
| 6 | 189 | 412 | Ion engines |
| 7 | 340 | 752 | VASIMR |
| 8 | 612 | 1,364 | Nuclear electric |
| 9 | 1,102 | 2,466 | MPD thrusters |
| 10 | 1,983 | 4,449 | Pulsed plasma |
| 11 | 3,570 | 8,019 | Fusion |
| 12 | 6,425 | 14,444 | Direct fusion |
| 13 | 11,566 | 26,010 | Antimatter-catalyzed |
| 14 | 20,818 | 46,828 | Pure antimatter |
| 15 | 37,473 | 84,301 | Pais effect |
| 16 | 67,451 | 151,752 | Alcubierre |

Early game (Tiers 1-5): Hours of play
Mid game (Tiers 6-10): Days of play
Late game (Tiers 11-16): Weeks/months of play

---

# IMPLEMENTATION NOTES

## Data Structure

```javascript
const TECH_TREE = {
    propulsion: {
        id: "propulsion",
        name: "Propulsion Systems",
        description: "Rocket and drive technologies",
        tiers: [
            {
                id: "prop_1",
                name: "Cold Gas / Monopropellant",
                tier: 1,
                cost_eflop_days: 10,
                effects: {
                    probe_isp: 230,  // seconds
                    probe_thrust_weight: 0.5
                },
                description: "Simple pressure-fed thrusters...",
                unlocks: ["basic_maneuvers"],
                requires: []
            },
            // ... more tiers
        ]
    },
    // ... more trees
};
```

## Skill Coefficient Replacement

Instead of abstract "propulsion: 1.2", use:
```javascript
const SKILL_EFFECTS = {
    probe_delta_v: {
        formula: "isp * g0 * ln(mass_ratio)",
        inputs: {
            isp: { source: "propulsion.current_tier.probe_isp" },
            mass_ratio: {
                base: 3.0,  // typical mass ratio
                modifier: "materials.mass_factor"  // lighter = better ratio
            }
        }
    },
    mass_driver_velocity: {
        formula: "sqrt(2 * efficiency * energy / mass)",
        inputs: {
            efficiency: { source: "electromagnetics.efficiency" },
            energy: { source: "power.available * thermal.max_duty_cycle" },
            mass: { base: 100, modifier: "materials.mass_factor" }
        }
    }
};
```

## Migration Path

1. Keep existing 12 skills as "computed values" derived from 6 trees
2. Gradually replace abstract multipliers with physics formulas
3. Add UI showing actual physical values (ISP, Tesla, W/kg)
4. Preserve save game compatibility through versioned migration

---

# NEXT STEPS

1. **Validate physics**: Review formulas with reference materials
2. **Balance testing**: Simulate progression curves
3. **UI design**: How to show physics values without overwhelming player
4. **Implementation**: Start with mass driver physics, then propulsion
5. **Cross-effects**: Implement dependency graph
