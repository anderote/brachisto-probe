/**
 * Star Map UI Panels Mixin
 *
 * Contains methods for creating and updating UI panels:
 * - Kardashev resource bar
 * - Galaxy stats panel
 * - Strategy panels (policy, research, development)
 * - HR Diagram panel
 * - Scale bar, coordinates display, hotkeys bar
 *
 * This file must be loaded AFTER star_map.js
 */
Object.assign(StarMapVisualization.prototype, {
    /**
     * Create the Kardashev scale resource bar
     * Full-width top bar showing civilization power level and key stats
     */
    createKardashevResourceBar() {
        const bar = document.createElement('div');
        bar.id = 'kardashev-resource-bar';
        bar.className = 'kardashev-resource-bar';
        bar.innerHTML = `
            <div class="kardashev-left">
                <div class="kardashev-scale-display">
                    <span class="kardashev-label">KARDASHEV</span>
                    <span class="kardashev-value" id="kardashev-value">K 0.00</span>
                </div>
                <span class="kardashev-type" id="kardashev-type">Pre-Type I</span>
            </div>
            <div class="kardashev-center">
                <div class="kardashev-power-bar">
                    <div class="power-bar-fill" id="power-bar-fill"></div>
                    <div class="power-bar-markers">
                        <span class="marker marker-0">0</span>
                        <span class="marker marker-1">I</span>
                        <span class="marker marker-2">II</span>
                        <span class="marker marker-3">III</span>
                    </div>
                </div>
            </div>
        `;
        this.container.appendChild(bar);

        // Default time speed (1x = 1 week per second)
        this.setTimeSpeed(1);
    },

    /**
     * Set time speed multiplier
     */
    setTimeSpeed(speed) {
        this.timeSpeedMultiplier = speed;
        this.timeSpeed = speed;  // Also update this for compatibility
    },

    /**
     * Calculate stellar mass converted to probes/compute
     * Based on metallicity (heavier elements available for construction)
     * Average star: ~2% metals, ~0.1% usable for construction
     */
    calculateMassConverted() {
        // Solar mass in kg
        const SOLAR_MASS = 1.989e30;

        // Average metallicity (fraction of star mass that's metals)
        // Sun is ~1.4% metals (Z=0.014)
        const AVG_METALLICITY = 0.014;

        // Fraction of metals actually extractable/usable
        // Assumes Dyson sphere + asteroid mining + some stellar lifting
        const EXTRACTION_EFFICIENCY = 0.1;  // 10% of metals are harvested

        // Each colonized dot represents STARS_PER_DOT stars
        // Mass converted scales with: stars × dyson progress × metallicity × efficiency

        let totalMassConverted = 0;

        for (const star of this.colonizedStars) {
            const dysonProg = (star.dysonUnits || 0) / 100;
            // Each dot's mass contribution
            const dotMass = this.STARS_PER_DOT * SOLAR_MASS * AVG_METALLICITY * EXTRACTION_EFFICIENCY * dysonProg;
            totalMassConverted += dotMass;
        }

        // Convert to solar masses for display
        return totalMassConverted / SOLAR_MASS;
    },

    /**
     * Format mass in solar masses
     */
    formatSolarMasses(solarMasses) {
        if (solarMasses >= 1e9) return `${(solarMasses / 1e9).toFixed(2)}B M☉`;
        if (solarMasses >= 1e6) return `${(solarMasses / 1e6).toFixed(2)}M M☉`;
        if (solarMasses >= 1e3) return `${(solarMasses / 1e3).toFixed(2)}k M☉`;
        if (solarMasses >= 1) return `${solarMasses.toFixed(2)} M☉`;
        if (solarMasses >= 0.001) return `${(solarMasses * 1000).toFixed(2)} mM☉`;
        return `${(solarMasses * 1e6).toFixed(2)} μM☉`;
    },

    /**
     * Create the galaxy stats bar - horizontal layout beneath Kardashev scale
     */
    createGalaxyStatsPanel() {
        const bar = document.createElement('div');
        bar.id = 'galaxy-stats-bar';
        bar.className = 'galaxy-stats-bar';
        bar.innerHTML = `
            <div class="galaxy-stat-chip">
                <span class="chip-label">DRIVE</span>
                <span class="chip-value" id="stat-drive-accel">0.1 g</span>
            </div>
            <div class="galaxy-stat-chip">
                <span class="chip-label">FLEETS</span>
                <span class="chip-value" id="stat-fleets-transit">0</span>
            </div>
            <div class="galaxy-stat-chip">
                <span class="chip-label">HOP</span>
                <span class="chip-value" id="stat-hop-distance">10 ly</span>
            </div>
            <div class="galaxy-stat-chip">
                <span class="chip-label">STARS</span>
                <span class="chip-value" id="stat-stars-count">1</span>
            </div>
            <div class="galaxy-stat-chip">
                <span class="chip-label">SECTORS</span>
                <span class="chip-value" id="stat-sectors">1</span>
            </div>
            <div class="galaxy-stat-chip">
                <span class="chip-label">MASS</span>
                <span class="chip-value" id="stat-total-mass">0 M☉</span>
            </div>
            <div class="galaxy-stat-chip">
                <span class="chip-label">POWER</span>
                <span class="chip-value" id="stat-total-power">0 L☉</span>
            </div>
            <div class="galaxy-stat-chip">
                <span class="chip-label">DYSON</span>
                <span class="chip-value" id="stat-dyson-avg">0%</span>
            </div>
        `;
        this.container.appendChild(bar);

        // Create hotkeys bar at bottom center
        const hotkeysBar = document.createElement('div');
        hotkeysBar.id = 'galaxy-hotkeys-bar';
        hotkeysBar.className = 'galaxy-hotkeys-bar';
        hotkeysBar.innerHTML = `
            <span class="hotkey"><kbd>WASD</kbd> Fly</span>
            <span class="hotkey"><kbd>F</kbd> Fleet</span>
            <span class="hotkey"><kbd>1</kbd> Sol</span>
            <span class="hotkey"><kbd>O</kbd> Strategy</span>
            <span class="hotkey"><kbd>L</kbd> Census</span>
            <span class="hotkey"><kbd>K</kbd> Drives</span>
        `;
        this.container.appendChild(hotkeysBar);

        // Create centered scale bar (appears when zooming)
        const scaleBar = document.createElement('div');
        scaleBar.id = 'galaxy-scale-bar';
        scaleBar.className = 'galaxy-scale-bar';
        scaleBar.innerHTML = `
            <div class="scale-bar-line"></div>
            <span class="scale-bar-label" id="scale-bar-label">1 kly</span>
        `;
        this.container.appendChild(scaleBar);

        // Track zoom to show/hide scale bar
        this.lastZoomDistance = null;
        this.scaleBarTimeout = null;

        // Listen for wheel events to detect zooming
        this.renderer.domElement.addEventListener('wheel', () => {
            this.showScaleBarOnZoom();
        });

        // Also update on any controls change for smooth updates
        if (this.controls) {
            this.controls.addEventListener('change', () => {
                if (document.getElementById('galaxy-scale-bar')?.classList.contains('visible')) {
                    this.updateScaleBar();
                }
            });
        }
    },

    /**
     * Create the galactic coordinates display (top right)
     */
    createGalacticCoordinatesDisplay() {
        const coordsDiv = document.createElement('div');
        coordsDiv.id = 'galactic-coordinates';
        coordsDiv.className = 'galactic-coordinates';
        coordsDiv.innerHTML = `
            <div class="coord-label">GALACTIC COORDINATES</div>
            <div class="coord-value">
                <span id="coord-x">X: 0</span> ly<br>
                <span id="coord-y">Y: 0</span> ly<br>
                <span id="coord-z">Z: 0</span> ly
            </div>
        `;
        this.container.appendChild(coordsDiv);
    },

    /**
     * Update galactic coordinates display based on camera target position
     */
    updateGalacticCoordinates() {
        if (!this.controls) return;

        const coordX = document.getElementById('coord-x');
        const coordY = document.getElementById('coord-y');
        const coordZ = document.getElementById('coord-z');

        if (!coordX || !coordY || !coordZ) return;

        // Convert from scene units to light-years (1 unit = 326 ly)
        // Sol is at approximately (50, 0, 50) in scene units
        const solX = this.solPosition?.x || 50;
        const solY = this.solPosition?.y || 0;
        const solZ = this.solPosition?.z || 50;

        const target = this.controls.target;
        const lyPerUnit = 326;

        // Calculate position relative to galactic center (0,0,0)
        const x = Math.round(target.x * lyPerUnit);
        const y = Math.round(target.y * lyPerUnit);
        const z = Math.round(target.z * lyPerUnit);

        // Format with thousands separators
        const formatCoord = (val) => {
            const sign = val >= 0 ? '+' : '';
            return sign + val.toLocaleString();
        };

        coordX.textContent = `X: ${formatCoord(x)}`;
        coordY.textContent = `Y: ${formatCoord(y)}`;
        coordZ.textContent = `Z: ${formatCoord(z)}`;
    },

    /**
     * Show scale bar when zooming, then fade it out
     */
    showScaleBarOnZoom() {
        const scaleBar = document.getElementById('galaxy-scale-bar');
        if (!scaleBar) return;

        // Show the scale bar and update immediately
        scaleBar.classList.add('visible');
        this.updateScaleBar();

        // Clear existing timeout
        if (this.scaleBarTimeout) {
            clearTimeout(this.scaleBarTimeout);
        }

        // Hide after 2 seconds of no zooming
        this.scaleBarTimeout = setTimeout(() => {
            scaleBar.classList.remove('visible');
        }, 2000);
    },

    /**
     * Set up time speed control buttons
     */
    setupSpeedControls() {
        const buttons = document.querySelectorAll('.speed-btn');
        if (!buttons.length) return;

        // Load saved speed from localStorage
        const savedSpeed = localStorage.getItem('galaxyTimeSpeed');
        if (savedSpeed) {
            this.setTimeSpeed(parseInt(savedSpeed));  // Use setTimeSpeed to update both variables
            // Update active button
            buttons.forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.speed) === this.timeSpeedMultiplier);
            });
        }

        // Handle button clicks
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const speed = parseInt(e.target.dataset.speed);
                this.setTimeSpeed(speed);  // Use setTimeSpeed to update both variables
                localStorage.setItem('galaxyTimeSpeed', speed.toString());

                // Update active state
                buttons.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                console.log('[StarMap] Time speed set to:', speed + 'x');
            });
        });
    },

    /**
     * Set up the expansion slider event handlers
     */
    setupExpansionSlider() {
        const slider = document.getElementById('expansion-slider');
        if (!slider) return;

        // Load saved value from localStorage
        const saved = localStorage.getItem('expansionAllocation');
        if (saved) {
            const value = parseInt(saved);
            slider.value = value;
            this.expansionAllocation = value;
            this.updateExpansionDisplay(value);
        }

        // Handle slider input
        slider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.expansionAllocation = value;
            this.updateExpansionDisplay(value);
            localStorage.setItem('expansionAllocation', value.toString());
        });
    },

    /**
     * Update the expansion slider display values
     */
    updateExpansionDisplay(value) {
        const dysonPercent = document.getElementById('dyson-percent');
        const expandPercent = document.getElementById('expand-percent');

        if (dysonPercent) dysonPercent.textContent = `${100 - value}%`;
        if (expandPercent) expandPercent.textContent = `${value}%`;
    },

    /**
     * Update the galaxy stats panel with current values
     */
    updateGalaxyStatsDisplay() {
        // Calculate values based on influence radius
        const radiusLy = this.influenceRadius * 326;  // Convert units to light years
        const radiusParsecs = this.influenceRadius * 100;

        // Estimate stars in range (very rough: ~0.14 stars per cubic parsec in solar neighborhood)
        const volume = (4/3) * Math.PI * Math.pow(radiusParsecs, 3);
        const starsInRange = Math.floor(volume * 0.14);

        // Distance to galactic center from Sol
        const distanceToCenter = 27200;  // ly (8.35 kpc)

        // Galactic coverage (galaxy radius ~50,000 ly)
        const galaxyRadius = 50000;
        const coverage = (radiusLy / galaxyRadius) * 100;

        // Update display
        const influenceEl = document.getElementById('stat-influence-radius');
        const starsEl = document.getElementById('stat-stars-in-range');
        const distanceEl = document.getElementById('stat-distance-center');
        const coverageEl = document.getElementById('stat-coverage');

        if (influenceEl) {
            if (radiusLy < 1000) {
                influenceEl.textContent = `${radiusLy.toFixed(0)} ly`;
            } else {
                influenceEl.textContent = `${(radiusLy / 1000).toFixed(2)} kly`;
            }
        }

        if (starsEl) {
            starsEl.textContent = this.formatStarCount(starsInRange);
        }

        if (distanceEl) {
            distanceEl.textContent = `${(distanceToCenter / 1000).toFixed(1)} kly`;
        }

        if (coverageEl) {
            if (coverage < 0.01) {
                coverageEl.textContent = `${(coverage * 10000).toFixed(2)} ppm`;
            } else if (coverage < 1) {
                coverageEl.textContent = `${coverage.toFixed(4)}%`;
            } else {
                coverageEl.textContent = `${coverage.toFixed(2)}%`;
            }
        }
    },

    /**
     * Format star count for display
     */
    formatStarCount(count) {
        if (count >= 1e9) return `~${(count / 1e9).toFixed(1)} billion`;
        if (count >= 1e6) return `~${(count / 1e6).toFixed(1)} million`;
        if (count >= 1e3) return `~${(count / 1e3).toFixed(1)} thousand`;
        return `~${count}`;
    },

    /**
     * Calculate Kardashev scale from power in watts
     * Calibrated to our galaxy's actual luminosity based on spectral distribution
     *
     * K = 0: 10^6 W (1 MW - minimal civilization)
     * K = 1: ~10^13.4 W (Type I - planetary, ~Earth's solar input)
     * K = 2: ~10^26.9 W (Type II - stellar, ~1 Sun)
     * K = 3: GALAXY_TOTAL_POWER (~1e37 W - full galaxy based on star population)
     */
    calculateKardashevScale(powerWatts) {
        if (powerWatts <= 0) return { scale: 0, type: 'Pre-Type I', progress: 0 };

        // Use pre-calculated galaxy power from spectral distribution
        const LOG_GALAXY = Math.log10(this.GALAXY_TOTAL_POWER); // ~37.0
        const LOG_BASE = 6; // 10^6 W = K0

        // Scale so K3 = full galaxy power
        const logPower = Math.log10(powerWatts);
        const scale = (logPower - LOG_BASE) * 3 / (LOG_GALAXY - LOG_BASE);

        let type;
        if (scale < 1) {
            type = 'Pre-Type I';
        } else if (scale < 2) {
            type = 'Type I';
        } else if (scale < 3) {
            type = 'Type II';
        } else {
            type = 'Type III';
        }

        // Progress bar: spans K 0 to K 3
        const progress = Math.min(scale / 3, 1);

        return { scale, type, progress };
    },

    /**
     * Solar luminosity in watts (L☉)
     * Defined as prototype property for mixin compatibility
     */
    SOLAR_LUMINOSITY_WATTS: 3.828e26,

    /**
     * Calculate total power from all Dyson spheres across colonized systems
     * A complete Dyson sphere captures all energy output of the star/cloud
     */
    calculateTotalDysonPower() {
        if (!this.starData) return 0;

        let totalPower = 0;

        // Get current system's Dyson progress
        const gameState = window.gameEngine?.getGameState?.();
        const currentDysonProgress = gameState?.dyson_sphere?.progress || 0;

        // Find current system (Sol by default)
        const currentSystemId = this.getActiveSystemId();

        // Helper to calculate power for a stellar object
        const calculateObjectPower = (obj) => {
            let dysonProgress = 0;

            if (obj.id === currentSystemId) {
                // Current system - use game state
                dysonProgress = currentDysonProgress;
            } else if (this.isNearbySystemColonized(obj.id)) {
                // Other colonized systems - assume some base development
                // (Full multi-system state tracking was deprecated)
                dysonProgress = 0.1; // Assume 10% base development
            }

            if (dysonProgress > 0) {
                // Power = luminosity_solar × L☉ × dyson_progress
                return obj.luminosity_solar * StarMapVisualization.SOLAR_LUMINOSITY_WATTS * dysonProgress;
            }
            return 0;
        };

        // Calculate power from stars
        if (this.starData.stars) {
            for (const star of this.starData.stars) {
                totalPower += calculateObjectPower(star);
            }
        }

        // Calculate power from dust clouds
        if (this.starData.dust_clouds) {
            for (const cloud of this.starData.dust_clouds) {
                totalPower += calculateObjectPower(cloud);
            }
        }

        return totalPower;
    },

    /**
     * Update the Kardashev resource bar with colonization metrics
     */
    updateKardashevBar() {
        if (!this.isActive) return;

        // Get game state
        const gameState = window.gameEngine?.getGameState?.();
        const derived = gameState?.derived || {};
        const totals = derived.totals || {};

        // Get Sol's Dyson progress from game state
        const solDysonProgress = gameState?.dyson_sphere?.progress || 0;

        // Get base power from current system (non-Dyson sources)
        const basePower = totals.power_produced || 1e6;  // Minimum 1 MW civilization

        // Calculate total Dyson power across ALL colonized stars
        // Each colonized dot = 1 star system for Kardashev purposes
        // (not STARS_PER_DOT - that's for galaxy visualization scale, not power calc)
        const SOLAR_LUMINOSITY = 3.828e26;  // Watts
        let totalDysonPower = 0;

        // Calculate power from each colonized star system
        // Each system contributes: luminosity × dyson completion percentage
        for (const star of this.colonizedStars) {
            const dysonPercent = (star.dysonUnits || 0) / 100;
            // Use spectral class to determine luminosity, default to 1 L☉ for G-type
            const starLuminosity = this.getSpectralLuminosity(star.spectralClass || 'G');
            totalDysonPower += starLuminosity * SOLAR_LUMINOSITY * dysonPercent;
        }

        // Total civilization power
        const totalPower = basePower + totalDysonPower;

        // Calculate Kardashev scale from total power
        const { scale, type, progress } = this.calculateKardashevScale(totalPower);

        // Calculate Dyson conversion rate (% of stars with COMPLETE Dysons)
        const dysonRate = this.dotsColonized > 0
            ? ((this.dotsWithDyson / this.dotsColonized) * 100).toFixed(0)
            : 0;

        // Calculate average Dyson progress across all colonized stars
        let avgDysonProgress = 0;
        if (this.colonizedStars.length > 0) {
            const totalProgress = this.colonizedStars.reduce((sum, s) =>
                sum + (s.dysonUnits || 0), 0);
            avgDysonProgress = totalProgress / this.colonizedStars.length;
        }

        // Calculate mass converted to compute
        const massConverted = this.calculateMassConverted();

        // Update display
        const valueEl = document.getElementById('kardashev-value');
        const typeEl = document.getElementById('kardashev-type');
        const powerBarEl = document.getElementById('power-bar-fill');

        if (valueEl) {
            valueEl.textContent = `K ${scale.toFixed(2)}`;
            valueEl.title = `K ${scale.toFixed(10)}`;
        }
        if (typeEl) typeEl.textContent = type;

        // Non-linear bar fill: 0→1 = 5%, 1→2 = 10%, 2→3 = 85% of bar width
        // This makes the 2→3 range (galactic era) dominate the visual
        let barPercent = 0;
        if (scale < 1) {
            // 0 to 1: maps to 0-5% of bar
            barPercent = scale * 5;
        } else if (scale < 2) {
            // 1 to 2: maps to 5-15% of bar
            barPercent = 5 + (scale - 1) * 10;
        } else {
            // 2 to 3: maps to 15-100% of bar
            barPercent = 15 + (scale - 2) * 85;
        }
        if (powerBarEl) powerBarEl.style.width = `${Math.min(barPercent, 100)}%`;
    },

    /**
     * Get luminosity in solar luminosities for a spectral class
     * Based on main sequence averages
     */
    getSpectralLuminosity(spectralClass) {
        const luminosities = {
            O: 30000,   // O-type: 30,000 L☉ (blue giants)
            B: 1000,    // B-type: 1,000 L☉ (blue-white)
            A: 20,      // A-type: 20 L☉ (white)
            F: 3,       // F-type: 3 L☉ (yellow-white)
            G: 1,       // G-type: 1 L☉ (Sun-like)
            K: 0.4,     // K-type: 0.4 L☉ (orange)
            M: 0.04,    // M-type: 0.04 L☉ (red dwarfs)
            D: 0.001,   // White dwarf: 0.001 L☉ (small but hot)
            N: 100      // Nebula: Contains young stars, high luminosity
        };
        return luminosities[spectralClass] || 1;
    },

    /**
     * Format power value with appropriate unit
     */
    formatPower(watts) {
        if (watts >= 1e36) return `${(watts / 1e36).toFixed(2)} TW×10²⁴`;
        if (watts >= 1e33) return `${(watts / 1e33).toFixed(2)} QW`;
        if (watts >= 1e30) return `${(watts / 1e30).toFixed(2)} RW`;
        if (watts >= 1e27) return `${(watts / 1e27).toFixed(2)} YW`;
        if (watts >= 1e24) return `${(watts / 1e24).toFixed(2)} ZW`;
        if (watts >= 1e21) return `${(watts / 1e21).toFixed(2)} EW`;
        if (watts >= 1e18) return `${(watts / 1e18).toFixed(2)} PW`;
        if (watts >= 1e15) return `${(watts / 1e15).toFixed(2)} TW`;
        if (watts >= 1e12) return `${(watts / 1e12).toFixed(2)} GW`;
        if (watts >= 1e9) return `${(watts / 1e9).toFixed(2)} MW`;
        if (watts >= 1e6) return `${(watts / 1e6).toFixed(2)} kW`;
        return `${watts.toFixed(2)} W`;
    },

    /**
     * Format power in solar luminosity units (L☉)
     * Solar luminosity = 3.828 × 10^26 W
     */
    formatPowerSolar(watts) {
        const SOLAR_LUMINOSITY = 3.828e26;
        const solarLum = watts / SOLAR_LUMINOSITY;

        if (solarLum >= 1e12) return `${(solarLum / 1e12).toFixed(2)}T L☉`;
        if (solarLum >= 1e9) return `${(solarLum / 1e9).toFixed(2)}B L☉`;
        if (solarLum >= 1e6) return `${(solarLum / 1e6).toFixed(2)}M L☉`;
        if (solarLum >= 1e3) return `${(solarLum / 1e3).toFixed(2)}k L☉`;
        if (solarLum >= 1) return `${solarLum.toFixed(2)} L☉`;
        if (solarLum >= 0.001) return `${(solarLum * 1000).toFixed(2)} mL☉`;
        if (solarLum >= 1e-6) return `${(solarLum * 1e6).toFixed(2)} μL☉`;
        return `${(solarLum * 1e9).toFixed(2)} nL☉`;
    },

    /**
     * Format large numbers
     */
    formatNumber(value) {
        if (value >= 1e24) return `${(value / 1e24).toFixed(2)}Y`;
        if (value >= 1e21) return `${(value / 1e21).toFixed(2)}Z`;
        if (value >= 1e18) return `${(value / 1e18).toFixed(2)}E`;
        if (value >= 1e15) return `${(value / 1e15).toFixed(2)}P`;
        if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
        if (value >= 1e9) return `${(value / 1e9).toFixed(2)}G`;
        if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
        if (value >= 1e3) return `${(value / 1e3).toFixed(2)}k`;
        return value.toFixed(0);
    },

    /**
     * Update galaxy stats and sphere of influence
     * Based on game state (probes, Dyson progress, etc.)
     */
    updateGalaxyStats() {
        const gameState = window.gameEngine?.getGameState?.();
        if (!gameState) return;

        const derived = gameState.derived || {};
        const totals = derived.totals || {};
        const dysonProgress = gameState.dyson_sphere?.progress || 0;

        // Sphere of influence grows based on:
        // 1. Dyson progress (primary driver of interstellar capability)
        // 2. Total probes (population/industrial capacity)
        // 3. Research level

        // Calculate influence radius in units (1 unit = 100 parsecs = 326 ly)
        // Start at Sol's neighborhood (~0.5 unit = 50 parsecs = 163 ly)
        // Max could be galactic scale (150 units = 15 kpc = 48,900 ly)

        let baseInfluence = 0.5;  // Local neighborhood

        // Dyson sphere completion dramatically increases influence
        if (dysonProgress > 0) {
            // Each 10% Dyson adds ~1 unit of influence radius
            baseInfluence += dysonProgress * 10;
        }

        // Probe count adds logarithmic influence
        const probes = totals.total_probes || 0;
        if (probes > 1e6) {
            // Each order of magnitude above 1M adds ~0.5 units
            baseInfluence += Math.max(0, (Math.log10(probes) - 6) * 0.5);
        }

        // Cap at reasonable galactic scale
        const maxInfluence = 50;  // 5 kpc - significant galactic presence
        const newRadius = Math.min(baseInfluence, maxInfluence);

        // Smoothly animate the sphere growth
        if (Math.abs(this.influenceRadius - newRadius) > 0.01) {
            this.influenceRadius += (newRadius - this.influenceRadius) * 0.05;
            this.updateSphereOfInfluence(this.influenceRadius);
        }

        // Update the stats display
        this.updateGalaxyStatsDisplay();

        // Update probe activity indicator if panel is visible
        if (this.strategyPanel && this.strategyPanel.style.display !== 'none') {
            this.updateProbeActivityIndicator();
        }
    },

    /**
     * Update the scale bar based on current camera zoom level
     * Scale: 1 unit = 100 pc = ~326 ly, so 10 units = 1 kpc
     * The bar is fixed at 100px width, and we calculate what distance it represents
     */
    updateScaleBar() {
        const labelEl = document.getElementById('scale-bar-label');
        if (!labelEl || !this.camera || !this.controls) return;

        // Get camera distance from target (zoom level)
        const cameraDistance = this.camera.position.distanceTo(this.controls.target);

        // Screen width corresponds to roughly 2x camera distance in world units at typical FOV
        // 100px bar width, screen is ~1000px, so bar is 10% of view
        // View width in world units ≈ cameraDistance * 2 * tan(FOV/2) ≈ cameraDistance * 1.15 (at 60° FOV)
        // 10% of that is the bar's world units
        const viewWidth = cameraDistance * 1.15;
        const barWorldUnits = viewWidth * 0.1;  // 100px / ~1000px screen

        // Convert units to light years: 1 unit = 100 pc = 326 ly
        const barLightYears = barWorldUnits * 326;

        // Choose a nice round number and format label
        let displayValue, displayUnit;

        if (barLightYears >= 50000) {
            // Round to nearest 10 kly
            displayValue = Math.round(barLightYears / 10000) * 10;
            displayUnit = 'kly';
        } else if (barLightYears >= 5000) {
            // Round to nearest kly
            displayValue = Math.round(barLightYears / 1000);
            displayUnit = 'kly';
        } else if (barLightYears >= 500) {
            // Round to nearest 100 ly
            displayValue = Math.round(barLightYears / 100) * 100;
            displayUnit = 'ly';
        } else if (barLightYears >= 50) {
            // Round to nearest 10 ly
            displayValue = Math.round(barLightYears / 10) * 10;
            displayUnit = 'ly';
        } else {
            // Round to nearest ly
            displayValue = Math.round(barLightYears);
            displayUnit = 'ly';
        }

        // Avoid 0
        if (displayValue === 0) displayValue = 1;

        labelEl.textContent = `${displayValue} ${displayUnit}`;
    },

    /**
     * Initialize strategy panels (EVA-styled)
     */
    initStrategyPanels() {
        // Safety check - ensure container exists and is a valid DOM element
        if (!this.container || !this.container.appendChild) {
            console.warn('[StarMap] initStrategyPanels called but container not valid');
            return;
        }

        // Create panel containers if they don't exist
        if (!this.panelContainers.drive) {
            const driveContainer = document.createElement('div');
            driveContainer.id = 'drive-panel-container';
            driveContainer.style.display = 'none';
            this.container.appendChild(driveContainer);
            this.panelContainers.drive = driveContainer;
        }

        if (!this.panelContainers.census) {
            const censusContainer = document.createElement('div');
            censusContainer.id = 'census-panel-container';
            censusContainer.style.display = 'none';
            this.container.appendChild(censusContainer);
            this.panelContainers.census = censusContainer;
        }

        // Policy panel (P key) - expansion slider info and stats
        if (!this.panelContainers.policy) {
            const policyContainer = document.createElement('div');
            policyContainer.id = 'policy-panel-container';
            policyContainer.className = 'strategy-panel';
            policyContainer.style.display = 'none';
            policyContainer.innerHTML = this.createPolicyPanelHTML();
            this.container.appendChild(policyContainer);
            this.panelContainers.policy = policyContainer;
        }

        // Research panel (R key) - tech/research overview
        if (!this.panelContainers.research) {
            const researchContainer = document.createElement('div');
            researchContainer.id = 'research-panel-container';
            researchContainer.className = 'strategy-panel';
            researchContainer.style.display = 'none';
            researchContainer.innerHTML = this.createResearchPanelHTML();
            this.container.appendChild(researchContainer);
            this.panelContainers.research = researchContainer;
        }

        // Initialize panels if classes are available
        if (typeof DriveResearchPanel !== 'undefined' && !this.driveResearchPanel) {
            this.driveResearchPanel = new DriveResearchPanel(this.panelContainers.drive);
            console.log('[StarMap] Drive Research Panel initialized');
        }

        if (typeof StellarCensusPanel !== 'undefined' && !this.stellarCensusPanel) {
            this.stellarCensusPanel = new StellarCensusPanel(this.panelContainers.census);
            console.log('[StarMap] Stellar Census Panel initialized');
        }
    },

    /**
     * Create Policy Panel HTML content
     */
    createPolicyPanelHTML() {
        return `
            <div class="eva-panel policy-panel">
                <div class="eva-panel-header">
                    <span class="eva-panel-title">EXPANSION POLICY</span>
                    <span class="eva-panel-hint">P to close</span>
                </div>
                <div class="eva-panel-content">
                    <div class="policy-section">
                        <div class="policy-label">Resource Allocation</div>
                        <div class="policy-description">
                            Control how newly developed star systems allocate their infrastructure.
                        </div>
                    </div>
                    <div class="policy-section">
                        <div class="policy-stat">
                            <span class="stat-label">Dyson Units</span>
                            <span class="stat-value dyson-color" id="policy-dyson-total">0</span>
                        </div>
                        <div class="policy-stat">
                            <span class="stat-label">Production Units</span>
                            <span class="stat-value production-color" id="policy-production-total">0</span>
                        </div>
                    </div>
                    <div class="policy-info">
                        <p><strong>Dyson</strong>: Power generation for energy output</p>
                        <p><strong>Production</strong>: Probe manufacturing for expansion</p>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Create Research Panel HTML content
     */
    createResearchPanelHTML() {
        return `
            <div class="eva-panel research-panel">
                <div class="eva-panel-header">
                    <span class="eva-panel-title">RESEARCH</span>
                    <span class="eva-panel-hint">R to close</span>
                </div>
                <div class="eva-panel-content">
                    <div class="research-section">
                        <div class="research-label">Current Research</div>
                        <div class="research-item">
                            <span class="research-name">Drive Technology</span>
                            <span class="research-tier" id="research-drive-tier">Tier 1</span>
                        </div>
                    </div>
                    <div class="research-section">
                        <div class="research-label">Compute Accumulated</div>
                        <div class="research-value" id="research-compute">0 FLOP</div>
                    </div>
                    <div class="research-info">
                        <p>Press <strong>D</strong> for detailed Drive Research</p>
                        <p>Press <strong>C</strong> for Stellar Census</p>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Create Strategy Panel (left-side, hierarchical sliders)
     */
    createStrategyPanel() {
        if (this.strategyPanel) return;  // Already exists

        const panel = document.createElement('div');
        panel.id = 'strategy-panel';
        panel.className = 'strategy-panel-left';
        panel.innerHTML = `
            <div class="strategy-panel-header">
                <span class="strategy-title">STRATEGY</span>
                <button class="strategy-close" id="strategy-close-btn">×</button>
            </div>
            <div class="strategy-panel-content">
                <div class="strategy-section main-slider">
                    <div class="slider-row">
                        <span class="slider-label left">BUILD</span>
                        <input type="range" id="build-expand-slider" min="0" max="100" value="${this.buildExpandBalance}" class="strategy-slider build-expand">
                        <span class="slider-label right">EXPAND</span>
                    </div>
                    <div class="slider-values">
                        <span id="build-percent">${100 - this.buildExpandBalance}%</span>
                        <span id="expand-percent">${this.buildExpandBalance}%</span>
                    </div>
                </div>

                <div class="strategy-subsection" id="build-options">
                    <div class="subsection-header">BUILD OPTIONS</div>
                    <div class="slider-row small">
                        <span class="slider-label left">DYSON</span>
                        <input type="range" id="build-policy-slider" min="0" max="100" value="${this.buildPolicy}" class="strategy-slider dyson-prod">
                        <span class="slider-label right">PRODUCTION</span>
                    </div>
                    <div class="slider-desc">Power ← → Manufacturing</div>
                </div>

                <div class="strategy-subsection" id="expand-options">
                    <div class="subsection-header">EXPAND OPTIONS</div>
                    <div class="slider-row small">
                        <span class="slider-label left">EXPLOIT</span>
                        <input type="range" id="expand-policy-slider" min="0" max="100" value="${this.expandPolicy}" class="strategy-slider exploit-explore">
                        <span class="slider-label right">EXPLORE</span>
                    </div>
                    <div class="slider-desc">Consolidate (Dyson) ← → Expand (Prod)</div>
                    <div class="slider-row small" style="margin-top: 8px;">
                        <span class="slider-label left">LOCAL</span>
                        <input type="range" id="hop-distance-slider" min="0" max="100" value="${this.hopDistancePolicy}" class="strategy-slider hop-distance">
                        <span class="slider-label right">FAR</span>
                    </div>
                    <div class="slider-desc">
                        Avg hop: <span id="hop-distance-display">${this.getAverageHopDistanceDisplay()}</span> ly
                    </div>
                </div>

                <div class="strategy-stats">
                    <div class="stat-row highlight">
                        <span class="stat-label">Total Assets</span>
                        <span class="stat-value solar-mass" id="strat-total-mass">0 M☉</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Systems Colonized</span>
                        <span class="stat-value expand" id="strat-stars">0</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Dyson Mass</span>
                        <span class="stat-value dyson" id="strat-dyson-units">0 M☉</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Production Mass</span>
                        <span class="stat-value production" id="strat-prod-units">0 M☉</span>
                    </div>
                </div>

                <div class="probe-activity">
                    <div class="probe-activity-header">
                        <span class="probe-activity-label">Launch Rate</span>
                        <span class="probe-activity-count" id="probe-launch-rate">0/yr</span>
                    </div>
                    <div class="stat-row small">
                        <span class="stat-label">λ (Poisson rate)</span>
                        <span class="stat-value" id="probe-lambda">0.000</span>
                    </div>
                    <div class="probe-eta">
                        <div class="probe-eta-label">Expected Next Launch</div>
                        <div class="probe-eta-bar">
                            <div class="probe-eta-fill" id="probe-eta-fill" style="width: 0%"></div>
                        </div>
                        <div class="probe-eta-time" id="probe-eta-time">--</div>
                    </div>
                    <div class="probe-activity-header" style="margin-top: 12px;">
                        <span class="probe-activity-label">Active Probes</span>
                        <span class="probe-activity-count" id="probe-fleet-count">0</span>
                    </div>
                    <div class="probe-activity-bar">
                        <div class="probe-activity-fill" id="probe-activity-fill" style="width: 0%"></div>
                    </div>
                </div>

                <div class="empire-stats">
                    <div class="empire-stats-header">Empire Overview</div>
                    <div class="stat-row">
                        <span class="stat-label">Frontier Radius</span>
                        <span class="stat-value frontier" id="strat-frontier-radius">0 ly</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">POAs Colonized</span>
                        <span class="stat-value poa" id="strat-poas-colonized">0 / 0</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Production Bonus</span>
                        <span class="stat-value bonus" id="strat-prod-bonus">+0%</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Dyson Efficiency</span>
                        <span class="stat-value bonus" id="strat-dyson-bonus">+0%</span>
                    </div>
                </div>

                <div class="metrics-graph-section">
                    <div class="metrics-graph-header">
                        <span>Metrics</span>
                        <select id="metrics-graph-selector" class="metrics-selector">
                            <option value="colonizedCount">Colonies</option>
                            <option value="frontierRadius">Frontier</option>
                            <option value="productionTotal">Production</option>
                            <option value="dysonTotal">Dyson</option>
                            <option value="launchRate">Launch Rate</option>
                            <option value="poaCount">POAs</option>
                        </select>
                    </div>
                    <canvas id="metrics-graph-canvas" width="240" height="80"></canvas>
                </div>
            </div>
        `;
        panel.style.display = 'none';
        this.container.appendChild(panel);
        this.strategyPanel = panel;

        // Set up event listeners
        this.setupStrategyPanelListeners();
    },

    /**
     * Set up strategy panel event listeners
     */
    setupStrategyPanelListeners() {
        // Close button
        const closeBtn = document.getElementById('strategy-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.toggleStrategyPanel());
        }

        // Build/Expand slider
        const buildExpandSlider = document.getElementById('build-expand-slider');
        if (buildExpandSlider) {
            buildExpandSlider.addEventListener('input', (e) => {
                this.buildExpandBalance = parseInt(e.target.value);
                this.updateStrategyDisplays();
                this.saveStrategySettings();
            });
        }

        // Build policy slider (Dyson/Production)
        const buildPolicySlider = document.getElementById('build-policy-slider');
        if (buildPolicySlider) {
            buildPolicySlider.addEventListener('input', (e) => {
                this.buildPolicy = parseInt(e.target.value);
                this.updateStrategyDisplays();
                this.saveStrategySettings();
            });
        }

        // Expand policy slider (Exploit/Explore - development priority)
        const expandPolicySlider = document.getElementById('expand-policy-slider');
        if (expandPolicySlider) {
            expandPolicySlider.addEventListener('input', (e) => {
                this.expandPolicy = parseInt(e.target.value);
                this.updateStrategyDisplays();
                this.saveStrategySettings();
            });
        }

        // Hop distance slider (Local/Far)
        const hopDistanceSlider = document.getElementById('hop-distance-slider');
        if (hopDistanceSlider) {
            hopDistanceSlider.addEventListener('input', (e) => {
                this.hopDistancePolicy = parseInt(e.target.value);
                this.updateStrategyDisplays();
                this.saveStrategySettings();
            });
        }

        // Metrics graph selector
        const metricsSelector = document.getElementById('metrics-graph-selector');
        if (metricsSelector) {
            metricsSelector.addEventListener('change', () => {
                this.updateMetricsGraphs();
            });
        }

        // Create development histogram bar
        this.createDevelopmentHistogramBar();
    },

    /**
     * Create the development histogram bar (centered at bottom when strategy open)
     */
    createDevelopmentHistogramBar() {
        if (this.developmentHistogramBar) return;

        const bar = document.createElement('div');
        bar.id = 'development-histogram-bar';
        bar.className = 'development-histogram-bar';
        bar.innerHTML = `
            <div class="histogram-title">SYSTEM DEVELOPMENT</div>
            <div class="histogram-container">
                <div class="histogram-bars-row" id="dev-histogram-bars">
                    ${[...Array(10)].map((_, i) => `
                        <div class="dev-histogram-bar" data-bucket="${i}">
                            <div class="bar-fill" id="dev-bar-${i}"></div>
                            <div class="bar-label">${i * 10}-${i === 9 ? '100' : (i + 1) * 10}%</div>
                        </div>
                    `).join('')}
                </div>
                <div class="histogram-legend">
                    <span class="legend-item"><span class="legend-color undeveloped"></span>Undeveloped</span>
                    <span class="legend-item"><span class="legend-color developing"></span>Developing</span>
                    <span class="legend-item"><span class="legend-color complete"></span>Complete</span>
                </div>
            </div>
        `;
        bar.style.display = 'none';  // Hidden by default
        this.container.appendChild(bar);
        this.developmentHistogramBar = bar;
    },

    /**
     * Update the development histogram display
     */
    updateDevelopmentHistogramDisplay() {
        if (!this.developmentHistogramBar) {
            console.log('[StarMap] Histogram: No bar element');
            return;
        }

        const buckets = this.getDysonHistogram();
        const maxCount = Math.max(1, ...buckets);
        const maxBarHeight = 100;  // Max height in pixels (fits in 110px bar container)

        // Debug: log on first few updates
        if (!this._histDisplayCount) this._histDisplayCount = 0;
        this._histDisplayCount++;
        if (this._histDisplayCount <= 5) {
            console.log('[StarMap] Histogram display update:',
                '\n  buckets:', buckets.join(', '),
                '\n  maxCount:', maxCount,
                '\n  colonizedStars:', this.colonizedStars.length,
                '\n  Sol units:', this.colonizedStars[0]?.dysonUnits, '+', this.colonizedStars[0]?.productionUnits);
        }

        let foundElements = 0;
        for (let i = 0; i < 10; i++) {
            const barEl = document.getElementById(`dev-bar-${i}`);
            if (barEl) {
                foundElements++;
                // Height based on count - empty buckets show no bar
                const heightPx = buckets[i] > 0 ? Math.max(4, (buckets[i] / maxCount) * maxBarHeight) : 0;
                barEl.style.height = `${heightPx}px`;

                // Debug: log bucket 9 (90-100%) since that's where Sol should be
                if (i === 9 && this._histDisplayCount <= 5) {
                    console.log('[StarMap] Bucket 9 (90-100%): count=', buckets[i], 'height=', heightPx + 'px',
                        'element:', barEl, 'computedHeight:', window.getComputedStyle(barEl).height);
                }

                // Color based on development level
                if (i < 3) {
                    barEl.style.backgroundColor = '#ff6644';  // Undeveloped (red-orange)
                } else if (i < 7) {
                    barEl.style.backgroundColor = '#ffaa00';  // Developing (orange-yellow)
                } else {
                    barEl.style.backgroundColor = '#00ff88';  // Complete (green)
                }

                // Add count tooltip - last bucket is 90-100% inclusive
                const rangeEnd = i === 9 ? '100' : `${(i + 1) * 10}`;
                barEl.title = `${buckets[i]} stars at ${i * 10}-${rangeEnd}% development`;
            }
        }

        // Debug: verify elements were found
        if (this._histDisplayCount <= 5) {
            console.log('[StarMap] Histogram: found', foundElements, '/10 bar elements');
        }
    },

    /**
     * Create the Hertzsprung-Russell diagram panel (right side)
     */
    createHRDiagramPanel() {
        if (this.hrPanel) return;

        // Initialize star type targeting preferences (all enabled by default)
        if (!this.starTypeTargets) {
            this.starTypeTargets = {
                O: true,   // Blue giants - rare, massive
                B: true,   // Blue-white - hot, luminous
                A: true,   // White - bright
                F: true,   // Yellow-white - Sun-like
                G: true,   // Yellow - Sun-like (our sun)
                K: true,   // Orange - common, stable
                M: false,   // Red dwarfs - most common, off by default
                giants: true,      // Red/orange giants
                supergiants: false, // Too unstable for colonization
                whiteDwarfs: false  // Too small, dying stars
            };
        }

        const panel = document.createElement('div');
        panel.id = 'hr-diagram-panel';
        panel.className = 'hr-panel-right';
        panel.innerHTML = `
            <div class="hr-panel-header">
                <span class="hr-title">H-R DIAGRAM</span>
                <span class="hr-subtitle">Target Selection</span>
            </div>
            <div class="hr-panel-content">
                <div class="hr-diagram-container">
                    <svg id="hr-diagram-svg" viewBox="0 0 300 220" class="hr-diagram-svg">
                        <!-- Axes -->
                        <line x1="40" y1="10" x2="40" y2="180" stroke="rgba(100,150,255,0.3)" stroke-width="1"/>
                        <line x1="40" y1="180" x2="290" y2="180" stroke="rgba(100,150,255,0.3)" stroke-width="1"/>

                        <!-- Y-axis labels (Luminosity) -->
                        <text x="8" y="20" fill="rgba(255,255,255,0.5)" font-size="8">10⁶</text>
                        <text x="8" y="55" fill="rgba(255,255,255,0.5)" font-size="8">10⁴</text>
                        <text x="8" y="90" fill="rgba(255,255,255,0.5)" font-size="8">10²</text>
                        <text x="8" y="125" fill="rgba(255,255,255,0.5)" font-size="8">1 L☉</text>
                        <text x="8" y="160" fill="rgba(255,255,255,0.5)" font-size="8">10⁻²</text>
                        <text x="3" y="100" fill="rgba(150,200,255,0.6)" font-size="7" transform="rotate(-90, 10, 100)">LUMINOSITY</text>

                        <!-- X-axis labels (Temperature/Spectral Type) -->
                        <text x="55" y="195" fill="#9bb0ff" font-size="9" font-weight="bold">O</text>
                        <text x="90" y="195" fill="#aabfff" font-size="9" font-weight="bold">B</text>
                        <text x="125" y="195" fill="#cad7ff" font-size="9" font-weight="bold">A</text>
                        <text x="155" y="195" fill="#f8f7ff" font-size="9" font-weight="bold">F</text>
                        <text x="185" y="195" fill="#fff4ea" font-size="9" font-weight="bold">G</text>
                        <text x="215" y="195" fill="#ffd2a1" font-size="9" font-weight="bold">K</text>
                        <text x="250" y="195" fill="#ffb56c" font-size="9" font-weight="bold">M</text>
                        <text x="155" y="210" fill="rgba(150,200,255,0.6)" font-size="7">SPECTRAL TYPE ← TEMPERATURE</text>

                        <!-- Supergiants region (top) -->
                        <path d="M 50 20 Q 100 25, 150 30 Q 200 35, 260 50"
                              stroke="rgba(255,100,100,0.4)" stroke-width="12" fill="none"
                              class="hr-region" data-region="supergiants"/>

                        <!-- Giants region -->
                        <path d="M 160 60 Q 200 70, 230 85 Q 250 95, 270 110"
                              stroke="rgba(255,180,100,0.4)" stroke-width="14" fill="none"
                              class="hr-region" data-region="giants"/>

                        <!-- Main sequence (diagonal band) -->
                        <path d="M 50 40 Q 80 55, 110 75 Q 140 95, 165 115 Q 190 135, 220 155 Q 250 168, 275 175"
                              stroke="rgba(100,200,255,0.5)" stroke-width="16" fill="none"
                              class="hr-region main-sequence"/>

                        <!-- White dwarfs region (bottom left) -->
                        <ellipse cx="80" cy="165" rx="25" ry="10"
                                 fill="rgba(200,200,255,0.3)" stroke="rgba(200,200,255,0.4)"
                                 class="hr-region" data-region="whiteDwarfs"/>

                        <!-- Sun marker -->
                        <circle cx="185" cy="125" r="5" fill="#fff4ea" stroke="#ffd700" stroke-width="1.5"/>
                        <text x="192" y="122" fill="#ffd700" font-size="7">☉</text>

                        <!-- Star type dots on main sequence -->
                        <circle cx="55" cy="42" r="6" fill="#9bb0ff" class="hr-star-type" data-type="O"/>
                        <circle cx="90" cy="60" r="6" fill="#aabfff" class="hr-star-type" data-type="B"/>
                        <circle cx="120" cy="80" r="5" fill="#cad7ff" class="hr-star-type" data-type="A"/>
                        <circle cx="150" cy="100" r="5" fill="#f8f7ff" class="hr-star-type" data-type="F"/>
                        <circle cx="185" cy="125" r="5" fill="#fff4ea" class="hr-star-type" data-type="G"/>
                        <circle cx="220" cy="150" r="5" fill="#ffd2a1" class="hr-star-type" data-type="K"/>
                        <circle cx="260" cy="170" r="5" fill="#ffb56c" class="hr-star-type" data-type="M"/>

                        <!-- Region labels -->
                        <text x="100" y="18" fill="rgba(255,100,100,0.7)" font-size="7" font-style="italic">Supergiants</text>
                        <text x="230" y="75" fill="rgba(255,180,100,0.7)" font-size="7" font-style="italic">Giants</text>
                        <text x="130" y="145" fill="rgba(100,200,255,0.7)" font-size="7" font-style="italic">Main Sequence</text>
                        <text x="55" y="178" fill="rgba(200,200,255,0.7)" font-size="6" font-style="italic">White Dwarfs</text>
                    </svg>
                </div>

                <div class="hr-target-controls">
                    <div class="hr-section-header">Main Sequence Targets</div>
                    <div class="hr-target-grid">
                        ${['O', 'B', 'A', 'F', 'G', 'K', 'M'].map(type => `
                            <label class="hr-target-toggle" data-type="${type}">
                                <input type="checkbox" ${this.starTypeTargets[type] ? 'checked' : ''} class="hr-checkbox" data-star-type="${type}">
                                <span class="hr-type-label" style="color: ${this.getSpectralColor(type)}">${type}</span>
                                <span class="hr-type-desc">${this.getSpectralDesc(type)}</span>
                            </label>
                        `).join('')}
                    </div>

                    <div class="hr-section-header">Special Regions</div>
                    <div class="hr-special-targets">
                        <label class="hr-target-toggle wide">
                            <input type="checkbox" ${this.starTypeTargets.giants ? 'checked' : ''} class="hr-checkbox" data-star-type="giants">
                            <span class="hr-type-label" style="color: #ffd2a1">Giants</span>
                            <span class="hr-type-desc">Evolved, resource-rich</span>
                        </label>
                        <label class="hr-target-toggle wide">
                            <input type="checkbox" ${this.starTypeTargets.supergiants ? 'checked' : ''} class="hr-checkbox" data-star-type="supergiants">
                            <span class="hr-type-label" style="color: #ff6666">Supergiants</span>
                            <span class="hr-type-desc">Unstable, short-lived</span>
                        </label>
                        <label class="hr-target-toggle wide">
                            <input type="checkbox" ${this.starTypeTargets.whiteDwarfs ? 'checked' : ''} class="hr-checkbox" data-star-type="whiteDwarfs">
                            <span class="hr-type-label" style="color: #aaaaff">White Dwarfs</span>
                            <span class="hr-type-desc">Dying, exotic matter</span>
                        </label>
                    </div>
                </div>

                <div class="hr-stats">
                    <div class="hr-stat-row">
                        <span>Target Coverage</span>
                        <span id="hr-target-coverage">100%</span>
                    </div>
                    <div class="hr-stat-row">
                        <span>Avg Star Mass</span>
                        <span id="hr-avg-mass">1.0 M☉</span>
                    </div>
                    <div class="hr-stat-row">
                        <span>Habitable Zone Chance</span>
                        <span id="hr-habitable">42%</span>
                    </div>
                </div>

                <div class="colonization-histogram">
                    <div class="histogram-header">Stars Colonized by Type</div>
                    <div class="histogram-bars" id="colonization-histogram-bars">
                        <div class="histogram-row">
                            <span class="histogram-label" style="color: #9bb0ff">O</span>
                            <div class="histogram-bar-bg"><div class="histogram-bar" id="hist-bar-O" style="width: 0%"></div></div>
                            <span class="histogram-count" id="hist-count-O">0</span>
                        </div>
                        <div class="histogram-row">
                            <span class="histogram-label" style="color: #aabfff">B</span>
                            <div class="histogram-bar-bg"><div class="histogram-bar" id="hist-bar-B" style="width: 0%"></div></div>
                            <span class="histogram-count" id="hist-count-B">0</span>
                        </div>
                        <div class="histogram-row">
                            <span class="histogram-label" style="color: #cad7ff">A</span>
                            <div class="histogram-bar-bg"><div class="histogram-bar" id="hist-bar-A" style="width: 0%"></div></div>
                            <span class="histogram-count" id="hist-count-A">0</span>
                        </div>
                        <div class="histogram-row">
                            <span class="histogram-label" style="color: #f8f7ff">F</span>
                            <div class="histogram-bar-bg"><div class="histogram-bar" id="hist-bar-F" style="width: 0%"></div></div>
                            <span class="histogram-count" id="hist-count-F">0</span>
                        </div>
                        <div class="histogram-row">
                            <span class="histogram-label" style="color: #fff4ea">G</span>
                            <div class="histogram-bar-bg"><div class="histogram-bar" id="hist-bar-G" style="width: 0%"></div></div>
                            <span class="histogram-count" id="hist-count-G">0</span>
                        </div>
                        <div class="histogram-row">
                            <span class="histogram-label" style="color: #ffd2a1">K</span>
                            <div class="histogram-bar-bg"><div class="histogram-bar" id="hist-bar-K" style="width: 0%"></div></div>
                            <span class="histogram-count" id="hist-count-K">0</span>
                        </div>
                        <div class="histogram-row">
                            <span class="histogram-label" style="color: #ffb56c">M</span>
                            <div class="histogram-bar-bg"><div class="histogram-bar" id="hist-bar-M" style="width: 0%"></div></div>
                            <span class="histogram-count" id="hist-count-M">0</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        panel.style.display = 'none';
        this.container.appendChild(panel);
        this.hrPanel = panel;

        // Set up event listeners
        this.setupHRPanelListeners();
    },

    /**
     * Get spectral type color
     */
    getSpectralColor(type) {
        const colors = {
            O: '#9bb0ff', B: '#aabfff', A: '#cad7ff', F: '#f8f7ff',
            G: '#fff4ea', K: '#ffd2a1', M: '#ffb56c'
        };
        return colors[type] || '#ffffff';
    },

    /**
     * Get a random spectral type based on realistic stellar population distribution
     * 76.6% M (red dwarfs), 12.1% K, 7.6% G, 3% F, 0.6% A, 0.13% B, 0.0003% O
     */
    getRandomSpectralType() {
        const r = Math.random();
        for (const entry of this.spectralCDF) {
            if (r <= entry.cumulative) {
                return entry.type;
            }
        }
        return 'M';  // Default to most common
    },

    /**
     * Get spectral type description
     */
    getSpectralDesc(type) {
        const descs = {
            O: 'Blue, 30k K+',
            B: 'Blue-white, 10-30k K',
            A: 'White, 7.5-10k K',
            F: 'Yellow-white, 6-7.5k K',
            G: 'Yellow (Sun), 5-6k K',
            K: 'Orange, 3.5-5k K',
            M: 'Red dwarf, <3.5k K'
        };
        return descs[type] || '';
    },

    /**
     * Set up HR panel event listeners
     */
    setupHRPanelListeners() {
        const checkboxes = document.querySelectorAll('.hr-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const starType = e.target.dataset.starType;
                this.starTypeTargets[starType] = e.target.checked;
                this.updateHRDiagramDisplay();
                this.saveStrategySettings();
            });
        });
    },

    /**
     * Update HR diagram visual state
     */
    updateHRDiagramDisplay() {
        // Update checkmark visual states
        const checkboxes = document.querySelectorAll('.hr-checkbox');
        checkboxes.forEach(checkbox => {
            const type = checkbox.dataset.starType;
            checkbox.checked = this.starTypeTargets[type];
        });

        // Calculate target coverage (weighted by star frequency)
        // M stars are most common (~76%), then K (~12%), G (~7.5%), etc.
        const weights = { O: 0.00003, B: 0.13, A: 0.6, F: 3, G: 7.5, K: 12, M: 76, giants: 0.5, supergiants: 0.01, whiteDwarfs: 0.4 };
        let coverage = 0;
        for (const [type, enabled] of Object.entries(this.starTypeTargets)) {
            if (enabled && weights[type]) coverage += weights[type];
        }
        const coverageEl = document.getElementById('hr-target-coverage');
        if (coverageEl) coverageEl.textContent = `${coverage.toFixed(1)}%`;

        // Calculate average target mass
        const masses = { O: 40, B: 8, A: 2.5, F: 1.3, G: 1.0, K: 0.7, M: 0.3, giants: 2, supergiants: 20, whiteDwarfs: 0.6 };
        let totalMass = 0, totalWeight = 0;
        for (const [type, enabled] of Object.entries(this.starTypeTargets)) {
            if (enabled && weights[type] && masses[type]) {
                totalMass += masses[type] * weights[type];
                totalWeight += weights[type];
            }
        }
        const avgMass = totalWeight > 0 ? totalMass / totalWeight : 0;
        const massEl = document.getElementById('hr-avg-mass');
        if (massEl) massEl.textContent = `${avgMass.toFixed(2)} M☉`;

        // Calculate habitable zone probability
        // F, G, K stars have good habitable zones
        const habWeights = { F: 3, G: 7.5, K: 12 };
        let habCoverage = 0;
        for (const [type, enabled] of Object.entries(this.starTypeTargets)) {
            if (enabled && habWeights[type]) habCoverage += habWeights[type];
        }
        const habPct = coverage > 0 ? (habCoverage / coverage) * 100 : 0;
        const habEl = document.getElementById('hr-habitable');
        if (habEl) habEl.textContent = `${habPct.toFixed(0)}%`;

        // Visual feedback on SVG
        const svgTypes = document.querySelectorAll('.hr-star-type');
        svgTypes.forEach(circle => {
            const type = circle.dataset.type;
            if (this.starTypeTargets[type]) {
                circle.setAttribute('opacity', '1');
                circle.setAttribute('stroke', '#00ff88');
                circle.setAttribute('stroke-width', '2');
            } else {
                circle.setAttribute('opacity', '0.3');
                circle.removeAttribute('stroke');
            }
        });
    },

    /**
     * Update strategy panel displays
     */
    updateStrategyDisplays() {
        // Validate Sol's units on first call (fix corrupted saves)
        if (this.colonizedStars && this.colonizedStars.length > 0 && !this._solValidated) {
            const sol = this.colonizedStars[0];
            const solTotal = (sol.dysonUnits || 0) + (sol.productionUnits || 0);
            // Fix if Sol's units are wrong (should be 100 total, with production > 0)
            if (solTotal !== 100 || (sol.productionUnits || 0) === 0) {
                console.log('[StarMap] Fixing Sol units - was:', sol.dysonUnits, '/', sol.productionUnits);
                sol.dysonUnits = 50;
                sol.productionUnits = 50;
                console.log('[StarMap] Fixed Sol to 50/50 split');
            }
            this._solValidated = true;
        }

        // Main balance
        const buildPct = document.getElementById('build-percent');
        const expandPct = document.getElementById('expand-percent');
        if (buildPct) buildPct.textContent = `${100 - this.buildExpandBalance}%`;
        if (expandPct) expandPct.textContent = `${this.buildExpandBalance}%`;

        // Update legacy expansionAllocation for backward compatibility
        // This combines build/expand balance with build policy
        const buildFraction = (100 - this.buildExpandBalance) / 100;
        const productionFraction = this.buildPolicy / 100;
        // Production units come from build allocation AND production policy
        this.expansionAllocation = Math.round(this.buildExpandBalance + (buildFraction * productionFraction * 50));

        // Stats
        const totals = this.getTotalStarUnits();
        const dysonEl = document.getElementById('strat-dyson-units');
        const prodEl = document.getElementById('strat-prod-units');
        const starsEl = document.getElementById('strat-stars');
        const totalMassEl = document.getElementById('strat-total-mass');

        // Calculate solar masses (100 units = 1 solar mass)
        const totalSolarMasses = totals.total / 100;
        const dysonSolarMasses = totals.dyson / 100;
        const prodSolarMasses = totals.production / 100;

        // Format solar mass display
        const formatMass = (mass) => {
            if (mass < 1000) {
                return `${mass.toFixed(1)} M☉`;
            } else if (mass < 1000000) {
                return `${(mass / 1000).toFixed(2)}k M☉`;
            } else {
                return `${(mass / 1000000).toFixed(2)}M M☉`;
            }
        };

        if (totalMassEl) totalMassEl.textContent = formatMass(totalSolarMasses);
        if (dysonEl) dysonEl.textContent = formatMass(dysonSolarMasses);
        if (prodEl) prodEl.textContent = formatMass(prodSolarMasses);
        if (starsEl) starsEl.textContent = this.colonizedStars.length.toLocaleString();

        // Update hop distance display
        const hopDistEl = document.getElementById('hop-distance-display');
        if (hopDistEl) hopDistEl.textContent = this.getAverageHopDistanceDisplay();

        // Update probe activity indicator
        this.updateProbeActivityIndicator();

        // Update development histogram
        this.updateDevelopmentHistogram();
        this.updateDevelopmentHistogramDisplay();
    },

    /**
     * Update the empire stats in the strategy panel
     */
    updateDevelopmentHistogram() {
        if (!this.strategyPanel || this.strategyPanel.style.display === 'none') return;

        // Update frontier radius
        const frontierEl = document.getElementById('strat-frontier-radius');
        if (frontierEl) {
            const radiusUnits = this.explorationRadius || 0;
            const radiusLY = Math.round(radiusUnits * 326);  // 1 unit ≈ 326 ly
            if (radiusLY < 1000) {
                frontierEl.textContent = `${radiusLY} ly`;
            } else {
                frontierEl.textContent = `${(radiusLY / 1000).toFixed(1)} kly`;
            }
        }

        // Update POA stats
        const poaEl = document.getElementById('strat-poas-colonized');
        if (poaEl) {
            const colonized = this.pointsOfAttraction.filter(p => p.colonized).length;
            const total = this.pointsOfAttraction.length;
            poaEl.textContent = `${colonized} / ${total}`;
        }

        // Update empire bonuses
        const prodBonusEl = document.getElementById('strat-prod-bonus');
        if (prodBonusEl) {
            const bonus = Math.round((this.empireBonuses.production - 1) * 100);
            prodBonusEl.textContent = bonus > 0 ? `+${bonus}%` : `${bonus}%`;
        }

        const dysonBonusEl = document.getElementById('strat-dyson-bonus');
        if (dysonBonusEl) {
            const bonus = Math.round((this.empireBonuses.dyson_efficiency - 1) * 100);
            dysonBonusEl.textContent = bonus > 0 ? `+${bonus}%` : `${bonus}%`;
        }

        // Update star type distribution
        this.updateStarTypeDistribution();
    },

    /**
     * Update the star type distribution bars
     */
    updateStarTypeDistribution() {
        // Count colonized stars by spectral type (simulated based on position)
        const typeCounts = { O: 0, B: 0, A: 0, F: 0, G: 0, K: 0, M: 0 };
        const total = this.colonizedStars.length;

        // Simulate spectral type distribution based on realistic ratios
        // M: 76%, K: 12%, G: 7.5%, F: 3%, A: 0.6%, B: 0.13%, O: 0.00003%
        for (const star of this.colonizedStars) {
            // Use position hash for consistent "random" type assignment
            const hash = Math.abs(star.position.x * 1000 + star.position.z * 100) % 1000;
            if (hash < 760) typeCounts.M++;
            else if (hash < 880) typeCounts.K++;
            else if (hash < 955) typeCounts.G++;
            else if (hash < 985) typeCounts.F++;
            else if (hash < 991) typeCounts.A++;
            else if (hash < 999) typeCounts.B++;
            else typeCounts.O++;
        }

        // Update bars
        const maxCount = Math.max(1, ...Object.values(typeCounts));
        const typeColors = {
            O: '#9bb0ff', B: '#aabfff', A: '#cad7ff',
            F: '#f8f7ff', G: '#fff4ea', K: '#ffd2a1', M: '#ffcc6f'
        };

        for (const type of Object.keys(typeCounts)) {
            const barEl = document.getElementById(`hist-bar-${type}`);
            const countEl = document.getElementById(`hist-count-${type}`);

            if (barEl) {
                const widthPercent = (typeCounts[type] / maxCount) * 100;
                barEl.style.width = `${widthPercent}%`;
                barEl.style.backgroundColor = typeColors[type];
            }

            if (countEl) {
                countEl.textContent = typeCounts[type];
            }
        }
    },

    /**
     * Update metrics history for time-series graphs
     * Called periodically during expansion simulation
     */
    updateMetricsHistory() {
        // Only update at intervals
        if (this.time - this.lastMetricsUpdate < this.metricsUpdateInterval) return;
        this.lastMetricsUpdate = this.time;

        // Calculate current metrics
        const colonizedCount = this.colonizedStars.length;
        const frontierRadius = this.explorationRadius || 0;

        let productionTotal = 0;
        let dysonTotal = 0;
        for (const star of this.colonizedStars) {
            productionTotal += star.productionUnits || 0;
            dysonTotal += star.dysonUnits || 0;
        }

        const poaCount = this.pointsOfAttraction.filter(p => p.colonized).length;

        // Calculate launch rate (probes per interval)
        const launchRate = this._probeLaunchCount || 0;
        this._probeLaunchCount = 0;  // Reset counter

        // Add to history
        this.metricsHistory.timestamps.push(this.time);
        this.metricsHistory.colonizedCount.push(colonizedCount);
        this.metricsHistory.frontierRadius.push(frontierRadius);
        this.metricsHistory.productionTotal.push(productionTotal);
        this.metricsHistory.dysonTotal.push(dysonTotal);
        this.metricsHistory.launchRate.push(launchRate);
        this.metricsHistory.poaCount.push(poaCount);

        // Trim to max length
        if (this.metricsHistory.timestamps.length > this.maxHistoryLength) {
            for (const key of Object.keys(this.metricsHistory)) {
                this.metricsHistory[key].shift();
            }
        }

        // Update graph display
        this.updateMetricsGraphs();
    },

    /**
     * Track probe launches for metrics
     */
    recordProbeLaunchCount() {
        // Old method - just increment counter (renamed to avoid duplicate)
        this._probeLaunchCount = (this._probeLaunchCount || 0) + 1;
    },

    /**
     * Update the metrics graphs in the strategy panel
     */
    updateMetricsGraphs() {
        const canvas = document.getElementById('metrics-graph-canvas');
        if (!canvas || this.metricsHistory.timestamps.length < 2) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.fillStyle = 'rgba(0, 10, 20, 0.9)';
        ctx.fillRect(0, 0, width, height);

        // Get selected metric from dropdown
        const selector = document.getElementById('metrics-graph-selector');
        const selectedMetric = selector?.value || 'colonizedCount';

        // Draw graph based on selection
        const data = this.metricsHistory[selectedMetric];
        if (!data || data.length < 2) return;

        // Find data range
        const minVal = Math.min(...data);
        const maxVal = Math.max(...data);
        const range = maxVal - minVal || 1;

        // Graph colors by metric
        const colors = {
            colonizedCount: '#00ff88',
            frontierRadius: '#00aaff',
            productionTotal: '#ffaa00',
            dysonTotal: '#ff6600',
            launchRate: '#00ffff',
            poaCount: '#ff00ff'
        };
        const color = colors[selectedMetric] || '#00ff88';

        // Draw grid lines
        ctx.strokeStyle = 'rgba(100, 150, 255, 0.1)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Draw data line
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        const padding = 5;
        const graphWidth = width - padding * 2;
        const graphHeight = height - padding * 2;

        for (let i = 0; i < data.length; i++) {
            const x = padding + (i / (data.length - 1)) * graphWidth;
            const y = height - padding - ((data[i] - minVal) / range) * graphHeight;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        // Draw current value
        ctx.fillStyle = color;
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        const currentVal = data[data.length - 1];
        const displayVal = currentVal > 1000 ?
            `${(currentVal / 1000).toFixed(1)}k` :
            currentVal.toFixed(0);
        ctx.fillText(displayVal, width - 5, 12);

        // Draw label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.textAlign = 'left';
        const labels = {
            colonizedCount: 'Colonies',
            frontierRadius: 'Frontier',
            productionTotal: 'Production',
            dysonTotal: 'Dyson',
            launchRate: 'Launch Rate',
            poaCount: 'POAs'
        };
        ctx.fillText(labels[selectedMetric] || selectedMetric, 5, 12);
    },

    /**
     * Update the probe activity indicator in the strategy panel
     */
    updateProbeActivityIndicator() {
        const fleetCount = this.probeFleets?.length || 0;
        const maxFleets = 20;
        const activityPercent = Math.min(100, (fleetCount / maxFleets) * 100);

        // Update fleet count
        const countEl = document.getElementById('probe-fleet-count');
        if (countEl) {
            countEl.textContent = fleetCount.toString();
        }

        // Update activity bar
        const fillEl = document.getElementById('probe-activity-fill');
        if (fillEl) {
            fillEl.style.width = `${activityPercent}%`;
        }

        // Calculate Poisson rate (λ) - sum of all individual launch probabilities
        const { lambda, productionSystems } = this.calculateLaunchRate();


        // Update lambda display
        const lambdaEl = document.getElementById('probe-lambda');
        if (lambdaEl) {
            lambdaEl.textContent = lambda.toFixed(4) + '/tick';
        }

        // Calculate launches per year (λ per tick * ticks per day * 365 days)
        // At 60fps with timeMultiplier, each frame advances ~0.016 * 380 * timeSpeed days
        const ticksPerDay = 1 / (this.daysPerFrame * (this.timeSpeed || 1));
        const launchesPerYear = lambda * ticksPerDay * 365;

        const rateEl = document.getElementById('probe-launch-rate');
        if (rateEl) {
            if (launchesPerYear < 1) {
                rateEl.textContent = (launchesPerYear * 365).toFixed(1) + '/century';
            } else if (launchesPerYear < 100) {
                rateEl.textContent = launchesPerYear.toFixed(1) + '/yr';
            } else {
                rateEl.textContent = (launchesPerYear / 1000).toFixed(1) + 'k/yr';
            }
        }

        // Expected time to next launch: E[T] = 1/λ ticks
        // Convert to game time
        const expectedTicks = lambda > 0 ? 1 / lambda : Infinity;
        const expectedDays = expectedTicks * this.daysPerFrame * (this.timeSpeed || 1);

        const etaTimeEl = document.getElementById('probe-eta-time');
        if (etaTimeEl) {
            if (lambda === 0) {
                etaTimeEl.textContent = 'No production capability';
            } else if (expectedDays < 1) {
                etaTimeEl.textContent = `~${(expectedDays * 24).toFixed(1)} hours`;
            } else if (expectedDays < 365) {
                etaTimeEl.textContent = `~${expectedDays.toFixed(0)} days`;
            } else {
                etaTimeEl.textContent = `~${(expectedDays / 365).toFixed(1)} years`;
            }
        }

        // Animate ETA bar - progress toward expected launch
        // Use time since last launch vs expected interval
        const etaFillEl = document.getElementById('probe-eta-fill');
        if (etaFillEl && lambda > 0) {
            // Track time since any launch occurred
            if (!this._lastLaunchTime) this._lastLaunchTime = this.time;
            const timeSinceLaunch = this.time - this._lastLaunchTime;
            const progress = Math.min(100, (timeSinceLaunch / expectedDays) * 100);
            etaFillEl.style.width = `${progress}%`;
        }
    },

    /**
     * Calculate combined Poisson launch rate (λ) across all production systems
     * Includes both production-based and Dyson-powered launches
     */
    calculateLaunchRate() {
        const baseLaunchProbability = 0.006;
        const dysonLaunchProbability = 0.003;
        const cooldownTime = 30;
        const expansionRate = Math.max(0.2, this.buildExpandBalance / 100);
        const speedMultiplier = (this.timeSpeedMultiplier || 1);

        // Empire bonuses
        const productionBonus = this.empireBonuses?.production || 1.0;
        const launchBonus = 1 / (this.empireBonuses?.launch_efficiency || 1.0);

        let lambda = 0;
        let productionSystems = 0;

        for (const star of this.colonizedStars) {
            const productionUnits = star.productionUnits || 0;
            const dysonUnits = star.dysonUnits || 0;
            const totalUnits = productionUnits + dysonUnits;

            if (totalUnits < 10) continue;

            productionSystems++;

            const timeSinceLastLaunch = this.time - (star.lastLaunchTime || 0);
            const readiness = 1 - Math.exp(-timeSinceLastLaunch / cooldownTime);

            // Production-based rate
            let prob = 0;
            if (productionUnits > 0) {
                prob = baseLaunchProbability * (productionUnits / 100) * productionBonus;
            }

            // Dyson-powered rate
            if (dysonUnits >= 50) {
                prob += dysonLaunchProbability * (dysonUnits / 100) * launchBonus;
            }

            prob *= readiness * speedMultiplier * expansionRate;
            lambda += prob;
        }

        return { lambda, productionSystems };
    },

    /**
     * Record a probe launch for ETA tracking and metrics
     */
    recordProbeLaunch() {
        // Increment launch counter for metrics
        this._probeLaunchCount = (this._probeLaunchCount || 0) + 1;
        this._lastLaunchTime = this.time;
        // Trigger visual pulse on ETA bar
        const etaFillEl = document.getElementById('probe-eta-fill');
        if (etaFillEl) {
            etaFillEl.classList.add('launching');
            setTimeout(() => etaFillEl.classList.remove('launching'), 300);
        }
    },

    /**
     * Save strategy settings to localStorage
     */
    saveStrategySettings() {
        localStorage.setItem('strategySettings', JSON.stringify({
            buildExpandBalance: this.buildExpandBalance,
            buildPolicy: this.buildPolicy,
            expandPolicy: this.expandPolicy,
            hopDistancePolicy: this.hopDistancePolicy,
            starTypeTargets: this.starTypeTargets
        }));
    },

    /**
     * Load strategy settings from localStorage
     */
    loadStrategySettings() {
        // Initialize defaults first
        if (!this.starTypeTargets) {
            this.starTypeTargets = {
                O: true, B: true, A: true, F: true, G: true, K: true, M: false,  // M-class (red dwarfs) off by default
                giants: true, supergiants: false, whiteDwarfs: false
            };
        }

        try {
            const saved = localStorage.getItem('strategySettings');
            if (saved) {
                const settings = JSON.parse(saved);
                this.buildExpandBalance = settings.buildExpandBalance ?? 65;
                this.buildPolicy = settings.buildPolicy ?? 50;
                this.expandPolicy = settings.expandPolicy ?? 50;
                this.hopDistancePolicy = settings.hopDistancePolicy ?? 58;
                if (settings.starTypeTargets) {
                    this.starTypeTargets = { ...this.starTypeTargets, ...settings.starTypeTargets };
                }
            }
        } catch (e) {
            console.warn('Failed to load strategy settings:', e);
        }
    },

    /**
     * Toggle strategy panel visibility
     */
    toggleStrategyPanel() {
        if (!this.strategyPanel) {
            this.createStrategyPanel();
        }
        if (!this.hrPanel) {
            this.createHRDiagramPanel();
        }

        this.strategyPanelVisible = !this.strategyPanelVisible;
        this.strategyPanel.style.display = this.strategyPanelVisible ? 'block' : 'none';
        this.hrPanel.style.display = this.strategyPanelVisible ? 'block' : 'none';

        // Show/hide development histogram bar
        if (this.developmentHistogramBar) {
            this.developmentHistogramBar.style.display = this.strategyPanelVisible ? 'flex' : 'none';
            console.log('[StarMap] Histogram bar display:', this.developmentHistogramBar.style.display,
                'parent container visible:', this.container?.style?.display);
        } else {
            console.log('[StarMap] Warning: developmentHistogramBar is null when toggling strategy panel');
        }

        if (this.strategyPanelVisible) {
            this.updateStrategyDisplays();
            this.updateHRDiagramDisplay();
            this.updateDevelopmentHistogramDisplay();
        }

        console.log('[StarMap] Strategy panel:', this.strategyPanelVisible ? 'opened' : 'closed');
    },

    /**
     * Toggle a strategy panel
     * @param {string} panelId - 'drive-research', 'stellar-census', 'strategy', 'policy', or 'research'
     */
    togglePanel(panelId) {
        // Map panel IDs to their container DOM element IDs
        const containerIds = {
            'drive-research': 'drive-panel-container',
            'stellar-census': 'census-panel-container',
            'strategy': 'strategy-panel',
            'policy': 'policy-panel-container',
            'research': 'research-panel-container'
        };

        // Get container element for this panel
        const containerId = containerIds[panelId];
        const containerElement = containerId ? document.getElementById(containerId) : null;

        // Hide all panel containers first
        Object.values(containerIds).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        Object.values(this.panelContainers).forEach(container => {
            if (container) container.style.display = 'none';
        });

        // If same panel was active, just close it
        if (this.activePanelId === panelId) {
            this.activePanelId = null;
            console.log('[StarMap] Closed panel:', panelId);
            return;
        }

        // Show the requested panel container
        if (containerElement) {
            containerElement.style.display = 'block';
            this.activePanelId = panelId;
            console.log('[StarMap] Opened panel:', panelId, 'container:', containerId);
        } else {
            console.warn('[StarMap] Panel container not found:', panelId, containerId);
        }

        // Update panel content when opening
        if (panelId === 'policy') {
            this.updatePolicyPanel();
        } else if (panelId === 'research') {
            this.updateResearchPanel();
        } else if (panelId === 'stellar-census' && this.stellarCensusPanel) {
            this.stellarCensusPanel.update(this.galaxySimulation);
        } else if (panelId === 'drive-research' && this.driveResearchPanel) {
            this.driveResearchPanel.update(this.galaxySimulation);
        }
    },

    /**
     * Update Policy panel with current stats
     */
    updatePolicyPanel() {
        const totals = this.getTotalStarUnits();
        const dysonEl = document.getElementById('policy-dyson-total');
        const prodEl = document.getElementById('policy-production-total');

        if (dysonEl) dysonEl.textContent = Math.round(totals.dyson).toLocaleString();
        if (prodEl) prodEl.textContent = Math.round(totals.production).toLocaleString();
    },

    /**
     * Update Research panel with current stats
     */
    updateResearchPanel() {
        const tierEl = document.getElementById('research-drive-tier');
        const computeEl = document.getElementById('research-compute');

        if (tierEl) {
            const tier = this.getDriveResearchTier();
            tierEl.textContent = `Tier ${tier}`;
        }

        if (computeEl) {
            const gameState = window.gameEngine?.getGameState?.();
            const compute = gameState?.computeAccumulated || 0;
            computeEl.textContent = this.formatCompute(compute);
        }
    },

    /**
     * Format compute value for display
     */
    formatCompute(value) {
        if (value >= 1e36) return `${(value / 1e36).toFixed(1)}×10³⁶ FLOP`;
        if (value >= 1e33) return `${(value / 1e33).toFixed(1)}×10³³ FLOP`;
        if (value >= 1e30) return `${(value / 1e30).toFixed(1)}×10³⁰ FLOP`;
        if (value >= 1e27) return `${(value / 1e27).toFixed(1)}×10²⁷ FLOP`;
        if (value >= 1e24) return `${(value / 1e24).toFixed(1)}×10²⁴ FLOP`;
        if (value >= 1e21) return `${(value / 1e21).toFixed(1)}×10²¹ FLOP`;
        if (value >= 1e18) return `${(value / 1e18).toFixed(1)}×10¹⁸ FLOP`;
        if (value >= 1e15) return `${(value / 1e15).toFixed(1)}×10¹⁵ FLOP`;
        if (value >= 1e12) return `${(value / 1e12).toFixed(1)}×10¹² FLOP`;
        return `${value.toFixed(0)} FLOP`;
    },

    /**
     * Update strategy panels with current game state
     * @param {Object} gameState - Current game state
     */
    updatePanels(gameState) {
        if (this.driveResearchPanel && gameState) {
            // Update drive research panel with compute stats
            this.driveResearchPanel.update({
                currentTier: gameState.driveTier || 1,
                computeAccumulated: gameState.computeAccumulated || 0,
                computeRate: gameState.computeRate || 0
            });
        }

        if (this.stellarCensusPanel && gameState) {
            // Update census panel with colonization stats
            const censusData = this.calculateCensusData();
            this.stellarCensusPanel.update({
                censusData: censusData,
                totalStats: {
                    totalSystems: this.GALAXY_TOTAL_STARS,
                    colonizedSystems: this.starsInfluenced,
                    dysonSpheres: this.starsWithDyson,
                    totalPower: gameState.totalPower || (this.starsWithDyson * this.AVG_STAR_LUMINOSITY * 3.828e26),
                    totalProbes: gameState.totalProbes || 1e15,
                    computeRate: gameState.computeRate || 1e12
                }
            });
        }
    },

    /**
     * Calculate census data from colonized stars
     */
    calculateCensusData() {
        // Default distribution matching realistic galactic proportions
        const baseDistribution = {
            O: { total: Math.round(this.GALAXY_TOTAL_STARS * 0.00003), colonized: 0, dyson: 0 },
            B: { total: Math.round(this.GALAXY_TOTAL_STARS * 0.001), colonized: 0, dyson: 0 },
            A: { total: Math.round(this.GALAXY_TOTAL_STARS * 0.006), colonized: 0, dyson: 0 },
            F: { total: Math.round(this.GALAXY_TOTAL_STARS * 0.03), colonized: 0, dyson: 0 },
            G: { total: Math.round(this.GALAXY_TOTAL_STARS * 0.08), colonized: 1, dyson: 0 }, // Sol
            K: { total: Math.round(this.GALAXY_TOTAL_STARS * 0.12), colonized: 0, dyson: 0 },
            M: { total: Math.round(this.GALAXY_TOTAL_STARS * 0.76), colonized: 0, dyson: 0 }
        };

        // Distribute colonized stars proportionally by spectral type
        // Assuming expansion follows natural star distribution
        if (this.starsInfluenced > 1) {
            const colonizedCount = this.starsInfluenced - 1; // Minus Sol
            baseDistribution.M.colonized += Math.round(colonizedCount * 0.76);
            baseDistribution.K.colonized += Math.round(colonizedCount * 0.12);
            baseDistribution.G.colonized += Math.round(colonizedCount * 0.08);
            baseDistribution.F.colonized += Math.round(colonizedCount * 0.03);
            baseDistribution.A.colonized += Math.round(colonizedCount * 0.006);
            baseDistribution.B.colonized += Math.round(colonizedCount * 0.001);
            baseDistribution.O.colonized += Math.round(colonizedCount * 0.00003);
        }

        // Distribute Dyson spheres similarly
        if (this.starsWithDyson > 0) {
            baseDistribution.M.dyson += Math.round(this.starsWithDyson * 0.76);
            baseDistribution.K.dyson += Math.round(this.starsWithDyson * 0.12);
            baseDistribution.G.dyson += Math.round(this.starsWithDyson * 0.08);
            baseDistribution.F.dyson += Math.round(this.starsWithDyson * 0.03);
            baseDistribution.A.dyson += Math.round(this.starsWithDyson * 0.006);
            baseDistribution.B.dyson += Math.round(this.starsWithDyson * 0.001);
            baseDistribution.O.dyson += Math.round(this.starsWithDyson * 0.00003);
        }

        return baseDistribution;
    }
});
