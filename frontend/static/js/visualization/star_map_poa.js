/**
 * Star Map POA (Points of Arrival) System Mixin
 *
 * Initializes and manages colonization targets including nearby stars,
 * deep sky objects, halo objects, and franchise clusters.
 *
 * This file must be loaded AFTER star_map.js
 */

Object.assign(StarMapVisualization.prototype, {

    /**
     * Initialize the nearby star POAs (Points of Attraction) around Sol
     * These are real stars with bonuses when colonized
     */
    initializeNearbyPOAs() {
        // Minimum distance from Sol - Sol should be isolated
        const minDistanceLY = 100;

        // Nearby stars - only those beyond 100 ly from Sol
        const nearbyStars = [
            {
                id: 'tau_ceti',
                name: 'Tau Ceti',
                distance: 11.9,
                spectralType: 'G8V',
                bonusType: 'habitable',
                bonusValue: 1,
                bonusDescription: 'Habitable Paradise: +1 Habitable World Discovered',
                lore: 'A Sun-like star long targeted by SETI. Multiple rocky planets orbit within its habitable zone.'
            },
            {
                id: 'epsilon_eridani',
                name: 'Epsilon Eridani',
                distance: 10.5,
                spectralType: 'K2V',
                bonusType: 'production',
                bonusValue: 0.10,
                bonusDescription: 'Young Star System: +10% Production Empire-wide',
                lore: 'A young star with a dusty debris disk. A gas giant orbits in its outer reaches.'
            }
        ].filter(star => star.distance >= minDistanceLY);

        // Convert distances to our coordinate system and place stars
        // Use random angles to distribute around Sol
        this.pointsOfAttraction = nearbyStars.map((star, index) => {
            // Convert light-years to our units (1 unit ≈ 326 ly)
            const distanceUnits = star.distance / 326;

            // Distribute around Sol at different angles
            const theta = (index / nearbyStars.length) * Math.PI * 2 + Math.random() * 0.5;
            const phi = Math.PI / 2 + (Math.random() - 0.5) * 0.3;  // Mostly in galactic plane

            const x = this.solPosition.x + distanceUnits * Math.sin(phi) * Math.cos(theta);
            const y = this.solPosition.y + distanceUnits * Math.cos(phi);
            const z = this.solPosition.z + distanceUnits * Math.sin(phi) * Math.sin(theta);

            return {
                ...star,
                position: { x, y, z },
                distanceUnits: distanceUnits,
                colonized: false,
                status: null  // null, 'fleet_sent', 'colonized'
            };
        });

        // Add Messier objects and deep sky POAs
        this.initializeDeepSkyPOAs();

        // Add halo globular clusters and sci-fi franchise POAs
        this.initializeHaloObjects();

        // Add POAs to colonization targets
        for (const poa of this.pointsOfAttraction) {
            this.colonizationTargets.push({
                x: poa.position.x,
                y: poa.position.y,
                z: poa.position.z,
                colonized: false,
                isPOA: true,
                poaData: poa
            });
        }

        // Create visual markers for POAs
        this.createPOAMarkers();

        console.log(`[StarMap] Initialized ${this.pointsOfAttraction.length} POAs (nearby stars + deep sky objects)`);
    },

    /**
     * Initialize Messier objects and other deep sky objects as POAs
     * These are nebulae, star clusters, and other interesting targets
     */
    initializeDeepSkyPOAs() {
        // POAs spread across the galaxy - distant targets for colony corridors
        // Distance in light years, converted to units (1 unit ≈ 326 ly)
        const deepSkyObjects = [
            // === NEARBY TARGETS (500-2000 ly) - First expansion goals ===
            { id: 'm45_pleiades', name: 'M45 Pleiades', type: 'cluster', distance: 444,
              bonusType: 'launch_efficiency', bonusValue: 0.0015, bonusDescription: 'Seven Sisters: -0.15% Launch CD', icon: '✦' },
            { id: 'm44_beehive', name: 'M44 Beehive', type: 'cluster', distance: 577,
              bonusType: 'production', bonusValue: 0.0008, bonusDescription: 'Stellar Swarm: +0.08% Production', icon: '✦' },
            { id: 'hyades', name: 'Hyades Cluster', type: 'cluster', distance: 153,
              bonusType: 'development_speed', bonusValue: 0.0010, bonusDescription: 'Nearby Bounty: +0.1% Dev Speed', icon: '✦' },
            { id: 'm42_orion', name: 'M42 Orion Nebula', type: 'nebula', distance: 1344,
              bonusType: 'production', bonusValue: 0.0015, bonusDescription: 'Stellar Nursery: +0.15% Production', icon: '☁' },
            { id: 'm27_dumbbell', name: 'M27 Dumbbell', type: 'nebula', distance: 1360,
              bonusType: 'dyson_efficiency', bonusValue: 0.0012, bonusDescription: 'White Dwarf Core: +0.12% Dyson', icon: '☁' },

            // === MID-RANGE TARGETS (2000-8000 ly) - Major expansion ===
            { id: 'm57_ring', name: 'M57 Ring Nebula', type: 'nebula', distance: 2300,
              bonusType: 'dyson_efficiency', bonusValue: 0.0010, bonusDescription: 'Stellar Remnant: +0.1% Dyson', icon: '☁' },
            { id: 'm8_lagoon', name: 'M8 Lagoon Nebula', type: 'nebula', distance: 4100,
              bonusType: 'production', bonusValue: 0.0012, bonusDescription: 'Resource Clouds: +0.12% Production', icon: '☁' },
            { id: 'm20_trifid', name: 'M20 Trifid Nebula', type: 'nebula', distance: 5200,
              bonusType: 'research', bonusValue: 0.08, bonusDescription: 'Triple Division: +0.08 Research', icon: '☁' },
            { id: 'm17_omega', name: 'M17 Omega Nebula', type: 'nebula', distance: 5500,
              bonusType: 'production', bonusValue: 0.0018, bonusDescription: 'Swan Nebula: +0.18% Production', icon: '☁' },
            { id: 'm1_crab', name: 'M1 Crab Nebula', type: 'nebula', distance: 6500,
              bonusType: 'research', bonusValue: 0.10, bonusDescription: 'Pulsar Core: +0.1 Research', icon: '☁' },
            { id: 'm16_eagle', name: 'M16 Eagle Nebula', type: 'nebula', distance: 7000,
              bonusType: 'production', bonusValue: 0.0020, bonusDescription: 'Pillars of Creation: +0.2% Production', icon: '☁' },
            { id: 'carina_nebula', name: 'Carina Nebula', type: 'nebula', distance: 7500,
              bonusType: 'production', bonusValue: 0.0025, bonusDescription: 'Massive Star Factory: +0.25% Production', icon: '☁' },
            { id: 'm4', name: 'M4 Cluster', type: 'cluster', distance: 7200,
              bonusType: 'development_speed', bonusValue: 0.0014, bonusDescription: 'Nearest Globular: +0.14% Dev Speed', icon: '✸' },

            // === DISTANT TARGETS (8000-20000 ly) - Deep space expansion ===
            { id: 'm22_sagittarius', name: 'M22 Cluster', type: 'cluster', distance: 10400,
              bonusType: 'dyson_efficiency', bonusValue: 0.0020, bonusDescription: 'Core Proximity: +0.2% Dyson', icon: '✸' },
            { id: '47_tucanae', name: '47 Tucanae', type: 'cluster', distance: 13400,
              bonusType: 'production', bonusValue: 0.0035, bonusDescription: 'Southern Jewel: +0.35% Production', icon: '✸' },
            { id: 'omega_centauri', name: 'Omega Centauri', type: 'cluster', distance: 17000,
              bonusType: 'production', bonusValue: 0.0050, bonusDescription: 'Largest Globular: +0.5% Production', icon: '✸' },
            { id: 'm13_hercules', name: 'M13 Hercules', type: 'cluster', distance: 22200,
              bonusType: 'production', bonusValue: 0.0030, bonusDescription: 'Ancient Nexus: +0.3% Production', icon: '✸' },
            { id: 'm5', name: 'M5 Cluster', type: 'cluster', distance: 24500,
              bonusType: 'production', bonusValue: 0.0024, bonusDescription: 'Rose Cluster: +0.24% Production', icon: '✸' },
            { id: 'm3', name: 'M3 Cluster', type: 'cluster', distance: 34000,
              bonusType: 'research', bonusValue: 0.12, bonusDescription: 'Variable Star Lab: +0.12 Research', icon: '✸' },
            { id: 'm15', name: 'M15 Cluster', type: 'cluster', distance: 33600,
              bonusType: 'research', bonusValue: 0.15, bonusDescription: 'Core Collapse: +0.15 Research', icon: '✸' },
            { id: 'm2', name: 'M2 Cluster', type: 'cluster', distance: 33000,
              bonusType: 'production', bonusValue: 0.0022, bonusDescription: 'Aquarius Ancient: +0.22% Production', icon: '✸' },

            // === GALACTIC CENTER (26000 ly) ===
            { id: 'sgr_a_star', name: 'Sagittarius A*', type: 'black_hole', distance: 26000,
              bonusType: 'dyson_efficiency', bonusValue: 0.0050, bonusDescription: 'Galactic Core: +0.5% Dyson', icon: '⊛' },

            // === FAR HALO TARGETS (40000-90000 ly) - Extreme expansion ===
            { id: 'm53', name: 'M53 Cluster', type: 'cluster', distance: 58000,
              bonusType: 'production', bonusValue: 0.0028, bonusDescription: 'Outer Halo: +0.28% Production', icon: '✸' },
            { id: 'm75', name: 'M75 Cluster', type: 'cluster', distance: 67500,
              bonusType: 'dyson_efficiency', bonusValue: 0.0024, bonusDescription: 'Dense Core: +0.24% Dyson', icon: '✸' },
            { id: 'sgr_dwarf', name: 'Sagittarius Dwarf', type: 'galaxy', distance: 70000,
              bonusType: 'research', bonusValue: 0.30, bonusDescription: 'Merging Galaxy: +0.3 Research', icon: '◎' },
            { id: 'm54', name: 'M54 Cluster', type: 'cluster', distance: 87400,
              bonusType: 'frontier_beacon', bonusValue: 30, bonusDescription: 'Dwarf Galaxy Core: Reveals 30 POAs', icon: '✸' },

            // === SPIRAL ARM WAYPOINTS - Corridor targets ===
            { id: 'orion_arm_inner', name: 'Orion Arm (Coreward)', type: 'arm', distance: 5000,
              bonusType: 'production', bonusValue: 0.0020, bonusDescription: 'Inner Orion: +0.2% Production', icon: '⌇' },
            { id: 'orion_arm_outer', name: 'Orion Arm (Rimward)', type: 'arm', distance: 8000,
              bonusType: 'production', bonusValue: 0.0018, bonusDescription: 'Outer Orion: +0.18% Production', icon: '⌇' },
            { id: 'perseus_arm', name: 'Perseus Arm', type: 'arm', distance: 6400,
              bonusType: 'production', bonusValue: 0.0035, bonusDescription: 'Major Arm: +0.35% Production', icon: '⌇' },
            { id: 'sagittarius_arm', name: 'Sagittarius Arm', type: 'arm', distance: 6500,
              bonusType: 'production', bonusValue: 0.0030, bonusDescription: 'Inner Arm: +0.3% Production', icon: '⌇' },
            { id: 'scutum_centaurus', name: 'Scutum-Centaurus Arm', type: 'arm', distance: 15000,
              bonusType: 'production', bonusValue: 0.0045, bonusDescription: 'Core Arm: +0.45% Production', icon: '⌇' },
            { id: 'norma_arm', name: 'Norma Arm', type: 'arm', distance: 12000,
              bonusType: 'production', bonusValue: 0.0040, bonusDescription: 'Near-Core: +0.4% Production', icon: '⌇' },
            { id: 'outer_arm', name: 'Outer Arm', type: 'arm', distance: 18000,
              bonusType: 'frontier_beacon', bonusValue: 40, bonusDescription: 'Galactic Frontier: Reveals 40 POAs', icon: '⌇' },

            // === EXTRAGALACTIC - Ultimate goals ===
            { id: 'lmc', name: 'Large Magellanic Cloud', type: 'galaxy', distance: 160000,
              bonusType: 'frontier_beacon', bonusValue: 100, bonusDescription: 'LMC: Reveals 100 POAs', icon: '◎' },
            { id: 'smc', name: 'Small Magellanic Cloud', type: 'galaxy', distance: 200000,
              bonusType: 'frontier_beacon', bonusValue: 75, bonusDescription: 'SMC: Reveals 75 POAs', icon: '◎' },

            // === HALO NEBULAE (above/below galactic disc) ===
            { id: 'halo_nebula_north', name: 'Boreal Nebula', type: 'halo_nebula', distance: 25000,
              bonusType: 'research', bonusValue: 0.20, bonusDescription: 'Halo Gas Cloud: +0.2 Research', icon: '☁',
              yOffset: 15000 },  // 15,000 ly above disc
            { id: 'halo_nebula_south', name: 'Austral Nebula', type: 'halo_nebula', distance: 28000,
              bonusType: 'research', bonusValue: 0.22, bonusDescription: 'Southern Halo: +0.22 Research', icon: '☁',
              yOffset: -18000 },  // 18,000 ly below disc
            { id: 'polar_cloud', name: 'Polar Cloud', type: 'halo_nebula', distance: 35000,
              bonusType: 'dyson_efficiency', bonusValue: 0.0015, bonusDescription: 'Pristine Gas: +0.15% Dyson', icon: '☁',
              yOffset: 25000 },
            { id: 'deep_halo_dust', name: 'Abyssal Dust', type: 'halo_nebula', distance: 45000,
              bonusType: 'production', bonusValue: 0.0020, bonusDescription: 'Metal-Rich Dust: +0.2% Production', icon: '☁',
              yOffset: -30000 },
            { id: 'zenith_cloud', name: 'Zenith Cloud', type: 'halo_nebula', distance: 55000,
              bonusType: 'frontier_beacon', bonusValue: 25, bonusDescription: 'High Vantage: Reveals 25 POAs', icon: '☁',
              yOffset: 40000 },
            { id: 'nadir_nebula', name: 'Nadir Nebula', type: 'halo_nebula', distance: 60000,
              bonusType: 'research', bonusValue: 0.30, bonusDescription: 'Deep South: +0.3 Research', icon: '☁',
              yOffset: -45000 },

            // === DWARF GALAXIES (small cute halo objects) ===
            { id: 'ursa_minor_dwarf', name: 'Ursa Minor Dwarf', type: 'dwarf_galaxy', distance: 225000,
              bonusType: 'research', bonusValue: 0.40, bonusDescription: 'Ancient Relic: +0.4 Research', icon: '✧',
              yOffset: 35000 },
            { id: 'draco_dwarf', name: 'Draco Dwarf', type: 'dwarf_galaxy', distance: 260000,
              bonusType: 'frontier_beacon', bonusValue: 50, bonusDescription: 'Dragon Galaxy: Reveals 50 POAs', icon: '✧',
              yOffset: 28000 },
            { id: 'carina_dwarf', name: 'Carina Dwarf', type: 'dwarf_galaxy', distance: 330000,
              bonusType: 'production', bonusValue: 0.0035, bonusDescription: 'Keel Galaxy: +0.35% Production', icon: '✧',
              yOffset: -20000 },
            { id: 'sculptor_dwarf', name: 'Sculptor Dwarf', type: 'dwarf_galaxy', distance: 290000,
              bonusType: 'research', bonusValue: 0.45, bonusDescription: 'Ancient Stars: +0.45 Research', icon: '✧',
              yOffset: -35000 },
            { id: 'fornax_dwarf', name: 'Fornax Dwarf', type: 'dwarf_galaxy', distance: 460000,
              bonusType: 'frontier_beacon', bonusValue: 60, bonusDescription: 'Furnace Galaxy: Reveals 60 POAs', icon: '✧',
              yOffset: -25000 },
            { id: 'sextans_dwarf', name: 'Sextans Dwarf', type: 'dwarf_galaxy', distance: 290000,
              bonusType: 'production', bonusValue: 0.0030, bonusDescription: 'Sextant Galaxy: +0.3% Production', icon: '✧',
              yOffset: 15000 },
            { id: 'leo_i', name: 'Leo I Dwarf', type: 'dwarf_galaxy', distance: 820000,
              bonusType: 'research', bonusValue: 0.60, bonusDescription: 'Lion Galaxy: +0.6 Research', icon: '✧',
              yOffset: 40000 },
            { id: 'leo_ii', name: 'Leo II Dwarf', type: 'dwarf_galaxy', distance: 690000,
              bonusType: 'frontier_beacon', bonusValue: 70, bonusDescription: 'Lesser Lion: Reveals 70 POAs', icon: '✧',
              yOffset: 30000 },

            // === FAR SIDE OF GALAXY (opposite from Sol) ===
            { id: 'far_cygnus', name: 'Far Cygnus Reach', type: 'arm', distance: 60000,
              bonusType: 'production', bonusValue: 0.0040, bonusDescription: 'Distant Arm: +0.4% Production', icon: '⌇',
              farSide: true },
            { id: 'antipodal_arm', name: 'Antipodal Arm', type: 'arm', distance: 75000,
              bonusType: 'production', bonusValue: 0.0050, bonusDescription: 'Opposite Reach: +0.5% Production', icon: '⌇',
              farSide: true },
            { id: 'far_norma', name: 'Far Norma Region', type: 'arm', distance: 55000,
              bonusType: 'dyson_efficiency', bonusValue: 0.0030, bonusDescription: 'Far Norma: +0.3% Dyson', icon: '⌇',
              farSide: true },
            { id: 'trans_core_nebula', name: 'Trans-Core Nebula', type: 'nebula', distance: 52000,
              bonusType: 'production', bonusValue: 0.0035, bonusDescription: 'Beyond Core: +0.35% Production', icon: '☁',
              farSide: true },
            { id: 'outer_perseus_far', name: 'Outer Perseus (Far)', type: 'arm', distance: 70000,
              bonusType: 'frontier_beacon', bonusValue: 45, bonusDescription: 'Far Perseus: Reveals 45 POAs', icon: '⌇',
              farSide: true },
            { id: 'galaxy_edge_far', name: 'Far Rim', type: 'arm', distance: 85000,
              bonusType: 'frontier_beacon', bonusValue: 55, bonusDescription: 'Galaxy Edge: Reveals 55 POAs', icon: '⌇',
              farSide: true },
            { id: 'dark_sector', name: 'Dark Sector', type: 'dark_region', distance: 65000,
              bonusType: 'research', bonusValue: 0.35, bonusDescription: 'Hidden Stars: +0.35 Research', icon: '◌',
              farSide: true },
            { id: 'far_halo_cluster', name: 'Palomar 14', type: 'cluster', distance: 240000,
              bonusType: 'production', bonusValue: 0.0045, bonusDescription: 'Distant Globular: +0.45% Production', icon: '✸',
              farSide: true, yOffset: 50000 },

            // === HALO GLOBULAR CLUSTERS (real NGC/Palomar objects - EXOTIC BONUSES) ===
            { id: 'ngc_2419', name: 'NGC 2419 (Intergalactic Wanderer)', type: 'globular_cluster', distance: 275000,
              bonusType: 'wormhole_network', bonusValue: 3, bonusDescription: 'Intergalactic Wanderer: +3 Wormhole Connections', icon: '⬡',
              yOffset: 50000 },
            { id: 'ngc_5466', name: 'NGC 5466', type: 'globular_cluster', distance: 51800,
              bonusType: 'probe_velocity', bonusValue: 0.15, bonusDescription: 'Tidal Streamers: +15% Probe Speed', icon: '⚡',
              yOffset: 42000 },
            { id: 'ngc_6229', name: 'NGC 6229', type: 'globular_cluster', distance: 99400,
              bonusType: 'stellar_forge', bonusValue: 0.08, bonusDescription: 'Ancient Forge: +8% All Bonuses Multiplier', icon: '⚙',
              yOffset: 35000 },
            { id: 'ngc_7006', name: 'NGC 7006', type: 'globular_cluster', distance: 135000,
              bonusType: 'expansion_radius', bonusValue: 0.20, bonusDescription: 'Outer Sentinel: +20% Probe Range', icon: '◎',
              yOffset: -38000 },
            { id: 'pal_3', name: 'Palomar 3', type: 'globular_cluster', distance: 302000,
              bonusType: 'time_dilation', bonusValue: 0.10, bonusDescription: 'Temporal Anomaly: +10% Time Flow', icon: '⏱',
              yOffset: -52000 },
            { id: 'pal_4', name: 'Palomar 4', type: 'globular_cluster', distance: 357000,
              bonusType: 'exotic_matter', bonusValue: 100, bonusDescription: 'Exotic Matter Cache: +100 Exotic Matter', icon: '✧',
              yOffset: 60000 },
            { id: 'pal_15', name: 'Palomar 15', type: 'globular_cluster', distance: 145000,
              bonusType: 'auto_develop', bonusValue: 0.05, bonusDescription: 'Self-Replicators: +5% Auto-Develop Chance', icon: '∞',
              yOffset: -45000 },
            { id: 'am_1', name: 'AM 1 (Madore\'s Object)', type: 'globular_cluster', distance: 398000,
              bonusType: 'all_bonuses', bonusValue: 0.15, bonusDescription: 'ULTIMATE: +15% ALL Empire Bonuses!', icon: '★',
              yOffset: -70000 },
            { id: 'eridanus_cluster', name: 'Eridanus Cluster', type: 'globular_cluster', distance: 295000,
              bonusType: 'dark_energy_tap', bonusValue: 50, bonusDescription: 'Dark Energy Nexus: +50 Energy/tick', icon: '◈',
              yOffset: 55000 },
            { id: 'pyxis_globular', name: 'Pyxis Globular', type: 'globular_cluster', distance: 130000,
              bonusType: 'wormhole_network', bonusValue: 2, bonusDescription: 'Navigation Beacon: +2 Wormhole Links', icon: '⬡',
              yOffset: -30000 },
            { id: 'ko_1', name: 'Ko 1 (Koposov 1)', type: 'globular_cluster', distance: 160000,
              bonusType: 'probe_velocity', bonusValue: 0.12, bonusDescription: 'Velocity Amplifier: +12% Probe Speed', icon: '⚡',
              yOffset: 48000 },
            { id: 'ko_2', name: 'Ko 2 (Koposov 2)', type: 'globular_cluster', distance: 115000,
              bonusType: 'auto_develop', bonusValue: 0.03, bonusDescription: 'Tidal Nursery: +3% Auto-Develop', icon: '∞',
              yOffset: -40000 },

            // === NORTHERN HALO NEBULAE (exotic bonuses for distant objects) ===
            { id: 'northern_crown_nebula', name: 'Northern Crown Nebula', type: 'halo_nebula', distance: 32000,
              bonusType: 'probe_velocity', bonusValue: 0.08, bonusDescription: 'Crown Boost: +8% Probe Speed', icon: '⚡',
              yOffset: 20000 },
            { id: 'apex_cloud', name: 'Apex Cloud', type: 'halo_nebula', distance: 42000,
              bonusType: 'expansion_radius', bonusValue: 0.10, bonusDescription: 'Zenith View: +10% Probe Range', icon: '◎',
              yOffset: 28000 },
            { id: 'high_chimneys', name: 'High Chimneys', type: 'halo_nebula', distance: 38000,
              bonusType: 'dark_energy_tap', bonusValue: 20, bonusDescription: 'Energy Vents: +20 Energy/tick', icon: '◈',
              yOffset: 22000 },
            { id: 'boreal_drift', name: 'Boreal Drift', type: 'halo_nebula', distance: 48000,
              bonusType: 'time_dilation', bonusValue: 0.05, bonusDescription: 'Temporal Current: +5% Time Flow', icon: '⏱',
              yOffset: 35000 },
            { id: 'celestial_fountain', name: 'Celestial Fountain', type: 'halo_nebula', distance: 52000,
              bonusType: 'exotic_matter', bonusValue: 30, bonusDescription: 'Exotic Springs: +30 Exotic Matter', icon: '✧',
              yOffset: 38000 },
            { id: 'circumpolar_veil', name: 'Circumpolar Veil', type: 'halo_nebula', distance: 58000,
              bonusType: 'stellar_forge', bonusValue: 0.05, bonusDescription: 'Polar Forge: +5% All Bonuses', icon: '⚙',
              yOffset: 45000 },
            { id: 'hyperboreal_mist', name: 'Hyperboreal Mist', type: 'halo_nebula', distance: 65000,
              bonusType: 'wormhole_network', bonusValue: 1, bonusDescription: 'Hyperspace Rift: +1 Wormhole Link', icon: '⬡',
              yOffset: 52000 },
            { id: 'north_galactic_plume', name: 'North Galactic Plume', type: 'halo_nebula', distance: 72000,
              bonusType: 'auto_develop', bonusValue: 0.04, bonusDescription: 'Genesis Plume: +4% Auto-Develop', icon: '∞',
              yOffset: 58000 },
            { id: 'aurora_superior', name: 'Aurora Superior', type: 'halo_nebula', distance: 80000,
              bonusType: 'all_bonuses', bonusValue: 0.08, bonusDescription: 'Superior Light: +8% ALL Bonuses!', icon: '★',
              yOffset: 65000 },

            // === SOUTHERN HALO NEBULAE (exotic bonuses) ===
            { id: 'southern_abyss', name: 'Southern Abyss', type: 'halo_nebula', distance: 30000,
              bonusType: 'dark_energy_tap', bonusValue: 25, bonusDescription: 'Void Energy: +25 Energy/tick', icon: '◈',
              yOffset: -18000 },
            { id: 'keel_cloud', name: 'Keel Cloud', type: 'halo_nebula', distance: 36000,
              bonusType: 'probe_velocity', bonusValue: 0.10, bonusDescription: 'Keel Winds: +10% Probe Speed', icon: '⚡',
              yOffset: -22000 },
            { id: 'antipodal_drift', name: 'Antipodal Drift', type: 'halo_nebula', distance: 44000,
              bonusType: 'expansion_radius', bonusValue: 0.12, bonusDescription: 'Far Reach: +12% Probe Range', icon: '◎',
              yOffset: -28000 },
            { id: 'austral_veil', name: 'Austral Veil', type: 'halo_nebula', distance: 50000,
              bonusType: 'time_dilation', bonusValue: 0.06, bonusDescription: 'Southern Flux: +6% Time Flow', icon: '⏱',
              yOffset: -35000 },
            { id: 'sub_galactic_plume', name: 'Sub-Galactic Plume', type: 'halo_nebula', distance: 56000,
              bonusType: 'exotic_matter', bonusValue: 40, bonusDescription: 'Exotic Depths: +40 Exotic Matter', icon: '✧',
              yOffset: -42000 },
            { id: 'magellanic_bridge_remnant', name: 'Magellanic Bridge Remnant', type: 'halo_nebula', distance: 62000,
              bonusType: 'wormhole_network', bonusValue: 2, bonusDescription: 'Bridge Fragment: +2 Wormhole Links', icon: '⬡',
              yOffset: -48000 },
            { id: 'southern_chimney', name: 'Southern Chimney', type: 'halo_nebula', distance: 68000,
              bonusType: 'stellar_forge', bonusValue: 0.06, bonusDescription: 'Deep Forge: +6% All Bonuses', icon: '⚙',
              yOffset: -55000 },
            { id: 'deep_south_fog', name: 'Deep South Fog', type: 'halo_nebula', distance: 75000,
              bonusType: 'auto_develop', bonusValue: 0.05, bonusDescription: 'Genesis Fog: +5% Auto-Develop', icon: '∞',
              yOffset: -62000 },
            { id: 'aurora_inferior', name: 'Aurora Inferior', type: 'halo_nebula', distance: 82000,
              bonusType: 'all_bonuses', bonusValue: 0.10, bonusDescription: 'Inferior Light: +10% ALL Bonuses!', icon: '★',
              yOffset: -68000 },

            // === SCATTERED HALO OBJECTS (special exotic bonuses) ===
            { id: 'galactic_corona_east', name: 'Galactic Corona East', type: 'halo_nebula', distance: 40000,
              bonusType: 'expansion_radius', bonusValue: 0.08, bonusDescription: 'Eastern Reach: +8% Probe Range', icon: '◎',
              yOffset: 18000 },
            { id: 'galactic_corona_west', name: 'Galactic Corona West', type: 'halo_nebula', distance: 42000,
              bonusType: 'probe_velocity', bonusValue: 0.08, bonusDescription: 'Western Winds: +8% Probe Speed', icon: '⚡',
              yOffset: -16000 },
            { id: 'tidal_stream_alpha', name: 'Tidal Stream Alpha', type: 'halo_nebula', distance: 55000,
              bonusType: 'time_dilation', bonusValue: 0.07, bonusDescription: 'Time Stream A: +7% Time Flow', icon: '⏱',
              yOffset: 30000 },
            { id: 'tidal_stream_beta', name: 'Tidal Stream Beta', type: 'halo_nebula', distance: 58000,
              bonusType: 'time_dilation', bonusValue: 0.07, bonusDescription: 'Time Stream B: +7% Time Flow', icon: '⏱',
              yOffset: -32000 },
            { id: 'hvc_complex_a', name: 'High Velocity Cloud A', type: 'halo_nebula', distance: 45000,
              bonusType: 'probe_velocity', bonusValue: 0.15, bonusDescription: 'HVC Boost A: +15% Probe Speed', icon: '⚡',
              yOffset: 25000 },
            { id: 'hvc_complex_c', name: 'High Velocity Cloud C', type: 'halo_nebula', distance: 48000,
              bonusType: 'probe_velocity', bonusValue: 0.15, bonusDescription: 'HVC Boost C: +15% Probe Speed', icon: '⚡',
              yOffset: -27000 },
            { id: 'smith_cloud', name: 'Smith Cloud', type: 'halo_nebula', distance: 40000,
              bonusType: 'exotic_matter', bonusValue: 50, bonusDescription: 'Exotic Infall: +50 Exotic Matter', icon: '✧',
              yOffset: -8000 },
            { id: 'fermi_bubbles_north', name: 'Fermi Bubble North', type: 'halo_nebula', distance: 25000,
              bonusType: 'dark_energy_tap', bonusValue: 75, bonusDescription: 'Core Energy N: +75 Energy/tick', icon: '◈',
              yOffset: 25000 },
            { id: 'fermi_bubbles_south', name: 'Fermi Bubble South', type: 'halo_nebula', distance: 25000,
              bonusType: 'dark_energy_tap', bonusValue: 75, bonusDescription: 'Core Energy S: +75 Energy/tick', icon: '◈',
              yOffset: -25000 }
        ];

        // Position deep sky objects in the galaxy
        for (const obj of deepSkyObjects) {
            const distanceUnits = obj.distance / 326;

            // Position based on object type and distance
            // Spread them around the galaxy realistically
            let angle = this.hashStringToAngle(obj.id);

            // Far side objects: add PI to place them opposite Sol
            if (obj.farSide) {
                angle += Math.PI;
            }

            const heightVar = (Math.random() - 0.5) * 0.2;  // Slight vertical spread

            // Objects closer to galactic center vs in disk
            let r, theta, yPos;
            if (obj.id === 'sgr_a_star') {
                // Galactic center
                r = 0;
                theta = 0;
            } else if (obj.type === 'globular_cluster') {
                // Globular clusters in halo - more spherical distribution
                r = distanceUnits * 0.8;
                theta = angle;
            } else {
                // Disk objects - follow spiral structure loosely
                r = Math.min(distanceUnits, this.galaxyRadius * 0.9);
                theta = angle;
            }

            const x = this.solPosition.x + r * Math.cos(theta);

            // Handle vertical offset for halo objects (yOffset in light years)
            if (obj.yOffset) {
                yPos = this.solPosition.y + (obj.yOffset / 326);  // Convert ly to units
            } else {
                yPos = this.solPosition.y + distanceUnits * heightVar;
            }

            const z = this.solPosition.z + r * Math.sin(theta);

            this.pointsOfAttraction.push({
                ...obj,
                spectralType: obj.type,  // Use type for color coding
                position: { x, y: yPos, z },
                distanceUnits: distanceUnits,
                colonized: false,
                status: null,
                isDeepSky: true,
                isHalo: !!obj.yOffset,  // Mark halo objects
                isFarSide: !!obj.farSide  // Mark far-side objects
            });
        }
    },

    /**
     * Initialize halo globular clusters and sci-fi franchise POAs
     * These are above/below the galactic disc in the stellar halo
     * Franchises are discovered as probes explore outward
     */
    initializeHaloObjects() {
        // Franchise clusters - each is a mini "galaxy" in the halo
        // All franchises start visible with stars at their locations
        this.franchises = {};
        this.discoveredFranchises = new Set(['hyperion', 'relay', 'zones', 'federation', 'empire', 'citadel', 'imperium']);

        const franchiseData = {
            // === THE RELAY - Special far north beacon ===
            relay: {
                name: 'The Relay',
                description: 'An ancient communications array of unknown origin',
                color: 0x00ffff,
                icon: '◈',
                baseY: 400,  // Very far north of disc
                baseRadius: 50,
                systems: [
                    { id: 'relay_prime', name: 'Relay Prime', bonus: 'research', value: 100, desc: 'Central Hub: +100 Research' },
                    { id: 'relay_alpha', name: 'Relay Alpha', bonus: 'frontier_beacon', value: 50, desc: 'Reveals 50 POAs' },
                    { id: 'relay_beta', name: 'Relay Beta', bonus: 'production', value: 0.5, desc: '+50% Production' }
                ]
            },

            // === HYPERION CANTOS - Hegemony WorldWeb (visible from start) ===
            hyperion: {
                name: 'Hegemony WorldWeb',
                description: 'The farcaster-linked worlds of the Hegemony of Man',
                color: 0xffaa44,
                icon: '✦',
                baseY: 0,              // Within galactic disc
                baseRadius: 260,       // Outer rim ~85,000 ly from center (85000/326)
                outerRim: true,        // Spawn on outer rim (90-100% of radius)
                spreadY: 5,            // Slight vertical spread within disc thickness
                systems: [
                    // Core Worlds
                    { id: 'hyperion_world', name: 'Hyperion', bonus: 'research', value: 50, desc: 'Time Tombs: +50 Research' },
                    { id: 'tau_ceti_center', name: 'Tau Ceti Center', bonus: 'production', value: 0.5, desc: 'WorldWeb Capital: +50% Production' },
                    { id: 'pacem', name: 'Pacem', bonus: 'dyson_efficiency', value: 0.35, desc: 'Pax Vatican: +35% Dyson' },
                    { id: 'lusus', name: 'Lusus', bonus: 'production', value: 0.4, desc: 'Hive World: +40% Production' },
                    // Templar & Nature Worlds
                    { id: 'gods_grove', name: "God's Grove", bonus: 'research', value: 30, desc: 'Templar Homeworld: +30 Research' },
                    { id: 'maui_covenant', name: 'Maui-Covenant', bonus: 'research', value: 25, desc: 'Motile Isles: +25 Research' },
                    { id: 'mare_infinitus', name: 'Mare Infinitus', bonus: 'production', value: 0.3, desc: 'Ocean World: +30% Production' },
                    { id: 'garden', name: 'Garden', bonus: 'research', value: 20, desc: 'Forest World: +20 Research' },
                    // Industrial & Mining
                    { id: 'heavens_gate', name: "Heaven's Gate", bonus: 'production', value: 0.35, desc: 'Vega Mining: +35% Production' },
                    { id: 'bressia', name: 'Bressia', bonus: 'production', value: 0.45, desc: 'Military World: +45% Production' },
                    { id: 'fuji', name: 'Fuji', bonus: 'production', value: 0.25, desc: 'Industrial Hub: +25% Production' },
                    { id: 'nordholm', name: 'Nordholm', bonus: 'production', value: 0.3, desc: 'Mining Colony: +30% Production' },
                    // Cultural & Research
                    { id: 'renaissance_v', name: 'Renaissance Vector', bonus: 'research', value: 35, desc: 'Art World: +35 Research' },
                    { id: 'asquith', name: 'Asquith', bonus: 'research', value: 25, desc: 'Sad King Billy: +25 Research' },
                    { id: 'esperance', name: 'Esperance', bonus: 'research', value: 20, desc: 'Hope World: +20 Research' },
                    { id: 'metaxas', name: 'Metaxas', bonus: 'research', value: 15, desc: 'Academic World: +15 Research' },
                    // Old Neighborhood (Near Sol)
                    { id: 'barnards_world', name: "Barnard's World", bonus: 'frontier_beacon', value: 25, desc: 'Reveals 25 POAs' },
                    { id: 'sol_draconi', name: 'Sol Draconi Septem', bonus: 'research', value: 30, desc: 'Ancient Colony: +30 Research' },
                    { id: 'ngc_2629', name: 'NGC 2629-4BIV', bonus: 'production', value: 0.2, desc: 'Wolf 359: +20% Production' },
                    // Religious Worlds
                    { id: 'new_mecca', name: 'New Mecca', bonus: 'research', value: 20, desc: 'Islamic World: +20 Research' },
                    { id: 'qom_riyadh', name: 'Qom-Riyadh', bonus: 'research', value: 15, desc: 'Desert Faith: +15 Research' },
                    { id: 'hebron', name: 'Hebron', bonus: 'research', value: 15, desc: 'Holy Land: +15 Research' },
                    // Deneb Systems
                    { id: 'deneb_drei', name: 'Deneb Drei', bonus: 'production', value: 0.35, desc: 'Deneb III: +35% Production' },
                    { id: 'deneb_vier', name: 'Deneb Vier', bonus: 'production', value: 0.3, desc: 'Deneb IV: +30% Production' },
                    // Labyrinthine Worlds
                    { id: 'armaghast', name: 'Armaghast', bonus: 'research', value: 40, desc: 'Labyrinth World: +40 Research' },
                    { id: 'svoboda', name: 'Svoboda', bonus: 'research', value: 35, desc: 'Labyrinth World: +35 Research' },
                    // Outback & Frontier
                    { id: 'ixion', name: 'Ixion', bonus: 'frontier_beacon', value: 15, desc: 'Reveals 15 POAs' },
                    { id: 'madhya', name: 'Madhya', bonus: 'production', value: 0.2, desc: 'Outback World: +20% Production' },
                    { id: 'nuevo_madrid', name: 'Nuevo Madrid', bonus: 'production', value: 0.25, desc: 'Spanish Colony: +25% Production' },
                    // Asian Worlds
                    { id: 'tien_shan', name: "T'ien Shan", bonus: 'research', value: 25, desc: 'Mountain World: +25 Research' },
                    { id: 'tsingtao', name: 'Tsingtao-Hsishuang Panna', bonus: 'production', value: 0.3, desc: 'Trade Hub: +30% Production' },
                    // Exotic Worlds
                    { id: 'nevermore', name: 'Nevermore', bonus: 'research', value: 20, desc: 'Mystery World: +20 Research' },
                    { id: 'grass', name: 'Grass', bonus: 'research', value: 15, desc: 'Prairie World: +15 Research' },
                    { id: 'whirl', name: 'Whirl', bonus: 'dyson_efficiency', value: 0.2, desc: 'Storm World: +20% Dyson' },
                    { id: 'vitus_gray', name: 'Vitus-Gray-Balianus B', bonus: 'production', value: 0.25, desc: 'Binary World: +25% Production' }
                ]
            },

            // === ZONES OF THOUGHT - Fire Upon the Deep ===
            zones: {
                name: 'Zones of Thought',
                description: 'Where physics changes with galactic position',
                color: 0x8844ff,
                icon: '◎',
                baseY: 0,
                baseRadius: 130,
                spreadY: 5,
                systems: [
                    // Human Civilizations
                    { id: 'straumli_realm', name: 'Straumli Realm', bonus: 'research', value: 100, desc: 'Archive World: +100 Research' },
                    { id: 'nyjora', name: 'Nyjora', bonus: 'production', value: 0.4, desc: 'Human Origin: +40% Production' },
                    { id: 'sjandra_kei', name: 'Sjandra Kei', bonus: 'research', value: 60, desc: "Ravna's World: +60 Research" },
                    // The Tines
                    { id: 'tines_world', name: "Tines' World", bonus: 'research', value: 50, desc: 'Pack Minds: +50 Research' },
                    { id: 'woodcarvers_domain', name: "Woodcarver's Domain", bonus: 'production', value: 0.35, desc: 'Tines Kingdom: +35% Production' },
                    { id: 'flenser_realm', name: "Flenser's Realm", bonus: 'production', value: 0.3, desc: 'Dark Kingdom: +30% Production' },
                    // Net Infrastructure
                    { id: 'relay_station', name: 'Relay', bonus: 'frontier_beacon', value: 50, desc: 'Net Hub: Reveals 50 POAs' },
                    { id: 'harmonious_repose', name: 'Harmonious Repose', bonus: 'research', value: 45, desc: 'Alien Refuge: +45 Research' },
                    { id: 'net_of_lies', name: 'Net of a Million Lies', bonus: 'research', value: 35, desc: 'Information Hub: +35 Research' },
                    // Zone Boundaries
                    { id: 'slow_zone_edge', name: 'Slow Zone Edge', bonus: 'dyson_efficiency', value: 0.3, desc: 'Physics Boundary: +30% Dyson' },
                    { id: 'beyond_gateway', name: 'The Beyond', bonus: 'frontier_beacon', value: 40, desc: 'FTL Zone: Reveals 40 POAs' },
                    { id: 'transcend_boundary', name: 'The Transcend', bonus: 'research', value: 120, desc: 'Power Realm: +120 Research' },
                    { id: 'unthinking_depths', name: 'Unthinking Depths', bonus: 'production', value: 0.5, desc: 'Core Region: +50% Production' },
                    // The Blight & Powers
                    { id: 'blight_origin', name: 'Blight Origin', bonus: 'research', value: 80, desc: 'Fallen Archive: +80 Research' },
                    { id: 'old_one_realm', name: "Old One's Realm", bonus: 'research', value: 70, desc: 'Transcendent: +70 Research' },
                    { id: 'countermeasure_zone', name: 'Countermeasure Zone', bonus: 'dyson_efficiency', value: 0.4, desc: 'Zone Shift: +40% Dyson' },
                    // Alien Civilizations
                    { id: 'skroderider_groves', name: 'Skroderider Groves', bonus: 'research', value: 40, desc: 'Plant Minds: +40 Research' },
                    { id: 'aprahanti_space', name: 'Aprahanti Space', bonus: 'production', value: 0.35, desc: 'Traders: +35% Production' },
                    { id: 'vrinimi_org', name: 'Vrinimi Organization', bonus: 'frontier_beacon', value: 30, desc: 'Reveals 30 POAs' },
                    { id: 'butterflies_realm', name: 'Butterflies of Realm', bonus: 'research', value: 25, desc: 'Exotic Minds: +25 Research' }
                ]
            },

            // === STAR TREK - United Federation of Planets ===
            federation: {
                name: 'United Federation',
                description: 'Infinite diversity in infinite combinations',
                color: 0x4488ff,
                icon: '✧',
                baseY: 5,
                baseRadius: 90,
                spreadY: 5,
                systems: [
                    { id: 'vulcan', name: 'Vulcan', bonus: 'research', value: 60, desc: 'Logic World: +60 Research' },
                    { id: 'qonos', name: "Qo'noS", bonus: 'production', value: 0.45, desc: 'Warrior World: +45% Production' },
                    { id: 'romulus', name: 'Romulus', bonus: 'dyson_efficiency', value: 0.35, desc: 'Romulan Star: +35% Dyson' },
                    { id: 'andoria', name: 'Andoria', bonus: 'production', value: 0.3, desc: 'Ice Moon: +30% Production' },
                    { id: 'bajor', name: 'Bajor', bonus: 'research', value: 35, desc: 'Prophets: +35 Research' },
                    { id: 'cardassia', name: 'Cardassia Prime', bonus: 'production', value: 0.35, desc: 'Order World: +35% Production' },
                    { id: 'betazed', name: 'Betazed', bonus: 'research', value: 25, desc: 'Telepaths: +25 Research' },
                    { id: 'ferenginar', name: 'Ferenginar', bonus: 'production', value: 0.5, desc: 'Profit: +50% Production' },
                    { id: 'risa', name: 'Risa', bonus: 'research', value: 15, desc: 'Pleasure World: +15 Research' }
                ]
            },

            // === STAR WARS - Galactic Empire ===
            empire: {
                name: 'Galactic Empire',
                description: 'A long time ago in a galaxy far, far away',
                color: 0xff4444,
                icon: '⬡',
                baseY: -5,
                baseRadius: 110,
                spreadY: 5,
                systems: [
                    { id: 'coruscant', name: 'Coruscant', bonus: 'production', value: 0.6, desc: 'Ecumenopolis: +60% Production' },
                    { id: 'alderaan', name: 'Alderaan', bonus: 'research', value: 45, desc: 'Culture World: +45 Research' },
                    { id: 'tatooine', name: 'Tatooine', bonus: 'frontier_beacon', value: 25, desc: 'Outer Rim: Reveals 25 POAs' },
                    { id: 'mandalore', name: 'Mandalore', bonus: 'production', value: 0.4, desc: 'Warriors: +40% Production' },
                    { id: 'kashyyyk', name: 'Kashyyyk', bonus: 'production', value: 0.35, desc: 'Wookiee World: +35% Production' },
                    { id: 'naboo', name: 'Naboo', bonus: 'research', value: 30, desc: 'Queen World: +30 Research' },
                    { id: 'corellia', name: 'Corellia', bonus: 'production', value: 0.45, desc: 'Shipyards: +45% Production' },
                    { id: 'bespin', name: 'Bespin', bonus: 'production', value: 0.3, desc: 'Cloud City: +30% Production' },
                    { id: 'mustafar', name: 'Mustafar', bonus: 'dyson_efficiency', value: 0.4, desc: 'Lava World: +40% Dyson' }
                ]
            },

            // === MASS EFFECT - Citadel Council ===
            citadel: {
                name: 'Citadel Council',
                description: 'The galactic community united',
                color: 0x44ff88,
                icon: '◇',
                baseY: 3,
                baseRadius: 70,
                spreadY: 5,
                systems: [
                    { id: 'citadel_station', name: 'Citadel', bonus: 'research', value: 70, desc: 'Council Hub: +70 Research' },
                    { id: 'thessia', name: 'Thessia', bonus: 'research', value: 50, desc: 'Asari World: +50 Research' },
                    { id: 'palaven', name: 'Palaven', bonus: 'production', value: 0.4, desc: 'Turian World: +40% Production' },
                    { id: 'tuchanka', name: 'Tuchanka', bonus: 'production', value: 0.35, desc: 'Krogan World: +35% Production' },
                    { id: 'sur_kesh', name: "Sur'Kesh", bonus: 'research', value: 40, desc: 'Salarian World: +40 Research' },
                    { id: 'omega', name: 'Omega', bonus: 'frontier_beacon', value: 30, desc: 'Terminus: Reveals 30 POAs' },
                    { id: 'illium', name: 'Illium', bonus: 'production', value: 0.3, desc: 'Trade Hub: +30% Production' }
                ]
            },

            // === DUNE - Imperium ===
            imperium: {
                name: 'Landsraad Imperium',
                description: 'The spice must flow',
                color: 0xffcc00,
                icon: '◈',
                baseY: -3,
                baseRadius: 85,
                spreadY: 5,
                systems: [
                    { id: 'arrakis', name: 'Arrakis', bonus: 'production', value: 0.8, desc: 'Spice World: +80% Production' },
                    { id: 'caladan', name: 'Caladan', bonus: 'research', value: 35, desc: 'Atreides Home: +35 Research' },
                    { id: 'giedi_prime', name: 'Giedi Prime', bonus: 'production', value: 0.5, desc: 'Harkonnen: +50% Production' },
                    { id: 'kaitain', name: 'Kaitain', bonus: 'research', value: 45, desc: 'Imperial Seat: +45 Research' },
                    { id: 'salusa_secundus', name: 'Salusa Secundus', bonus: 'production', value: 0.45, desc: 'Sardaukar: +45% Production' },
                    { id: 'ix', name: 'Ix', bonus: 'research', value: 60, desc: 'Machine World: +60 Research' },
                    { id: 'tleilax', name: 'Tleilax', bonus: 'research', value: 40, desc: 'Bene Tleilax: +40 Research' }
                ]
            }
        };

        // Create POAs for each franchise
        for (const [franchiseId, franchise] of Object.entries(franchiseData)) {
            this.franchises[franchiseId] = {
                ...franchise,
                id: franchiseId,
                discovered: this.discoveredFranchises.has(franchiseId),
                systemIds: []
            };

            // Position systems in a cluster
            const baseAngle = this.hashStringToAngle(franchiseId);
            const baseX = Math.cos(baseAngle) * franchise.baseRadius;
            const baseZ = Math.sin(baseAngle) * franchise.baseRadius;

            franchise.systems.forEach((system, idx) => {
                // Spread systems across the franchise region
                // Use golden angle for even distribution, with radius variation
                const goldenAngle = idx * 2.399963;  // Golden angle in radians
                // For outer rim franchises, use 90-100% of radius; otherwise 20-100%
                const minFraction = franchise.outerRim ? 0.9 : 0.2;
                const radiusFraction = minFraction + (idx / franchise.systems.length) * (1.0 - minFraction);
                const clusterRadius = franchise.baseRadius * radiusFraction * (0.95 + Math.random() * 0.1);
                const x = this.solPosition.x + Math.cos(goldenAngle) * clusterRadius;
                const spreadY = franchise.spreadY || 30;  // Use franchise spreadY or default
                const y = this.solPosition.y + franchise.baseY + (Math.random() - 0.5) * spreadY * 2;
                const z = this.solPosition.z + Math.sin(goldenAngle) * clusterRadius;

                const isVisible = this.discoveredFranchises.has(franchiseId);

                const poaData = {
                    id: system.id,
                    name: system.name,
                    type: 'franchise_system',
                    franchiseId: franchiseId,
                    franchiseName: franchise.name,
                    spectralType: 'franchise_system',
                    distance: Math.sqrt(x*x + y*y + z*z) * 326,
                    bonusType: system.bonus,
                    bonusValue: system.value,
                    bonusDescription: system.desc,
                    icon: franchise.icon,
                    color: franchise.color,
                    position: { x, y, z },
                    colonized: false,
                    status: null,
                    isDeepSky: true,
                    isFranchise: true,
                    visible: isVisible,
                    hidden: !isVisible  // Hidden until franchise discovered
                };
                this.pointsOfAttraction.push(poaData);

                // Create a colonization target (star) at this franchise location
                // This ensures franchise systems are always colonizable
                if (this.colonizationTargets) {
                    this.colonizationTargets.push({
                        x: x,
                        y: y,
                        z: z,
                        spectralClass: 'G',  // Sun-like star for franchise worlds
                        colonized: false,
                        isFranchise: true,
                        franchisePoaId: system.id
                    });
                }

                this.franchises[franchiseId].systemIds.push(system.id);
            });

            // Create visual cluster for this franchise (100-300 stars)
            // Skip visual cluster for spread-out franchises (baseRadius > 100 units)
            if (this.discoveredFranchises.has(franchiseId) && franchise.baseRadius <= 100) {
                this.createFranchiseCluster(franchiseId, franchise, baseX, franchise.baseY, baseZ);
            }
        }

        console.log(`[StarMap] Initialized ${Object.keys(this.franchises).length} franchise clusters`);
    },

    /**
     * Create visual star cluster for a franchise (100-300 stars)
     */
    createFranchiseCluster(franchiseId, franchise, baseX, baseY, baseZ) {
        const starCount = 150 + Math.floor(Math.random() * 150);  // 150-300 stars
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        const color = new THREE.Color(franchise.color);

        for (let i = 0; i < starCount; i++) {
            // Spherical cluster distribution
            const r = Math.pow(Math.random(), 0.5) * 20;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = this.solPosition.x + baseX + r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = this.solPosition.y + baseY + r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = this.solPosition.z + baseZ + r * Math.cos(phi);

            // Vary brightness slightly
            const brightness = 0.3 + Math.random() * 0.4;
            const variedColor = new THREE.Color(franchise.color);
            variedColor.multiplyScalar(brightness);
            colors[i * 3] = variedColor.r;
            colors[i * 3 + 1] = variedColor.g;
            colors[i * 3 + 2] = variedColor.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.6,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending
        });

        const cluster = new THREE.Points(geometry, material);
        cluster.userData = { franchiseId, type: 'franchise_cluster' };
        this.galaxyGroup.add(cluster);

        // Store reference for later reveal
        if (!this.franchiseClusters) this.franchiseClusters = {};
        this.franchiseClusters[franchiseId] = cluster;
    },

    /**
     * Discover a new franchise when probes reach its area
     * Shows notification and reveals all systems in that franchise
     */
    discoverFranchise(franchiseId) {
        if (this.discoveredFranchises.has(franchiseId)) return;

        const franchise = this.franchises[franchiseId];
        if (!franchise) return;

        this.discoveredFranchises.add(franchiseId);
        franchise.discovered = true;

        // Reveal all POAs in this franchise
        for (const poa of this.pointsOfAttraction) {
            if (poa.franchiseId === franchiseId) {
                poa.hidden = false;
                poa.visible = true;
            }
        }

        // Create the visual cluster (skip for spread-out franchises)
        if (franchise.baseRadius <= 100) {
            const baseAngle = this.hashStringToAngle(franchiseId);
            const baseX = Math.cos(baseAngle) * franchise.baseRadius;
            const baseZ = Math.sin(baseAngle) * franchise.baseRadius;
            this.createFranchiseCluster(franchiseId, franchise, baseX, franchise.baseY, baseZ);
        }

        // Refresh POA markers
        this.refreshPOAMarkers();

        // Show discovery notification
        this.showFranchiseDiscoveryNotification(franchise);

        console.log(`[StarMap] Discovered franchise: ${franchise.name}`);
    },

    /**
     * Show notification when a new franchise is discovered
     */
    showFranchiseDiscoveryNotification(franchise) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'franchise-discovery-notification';
        notification.innerHTML = `
            <div class="franchise-discovery-icon">${franchise.icon}</div>
            <div class="franchise-discovery-content">
                <div class="franchise-discovery-title">NEW FRANCHISE DISCOVERED</div>
                <div class="franchise-discovery-name" style="color: #${franchise.color.toString(16).padStart(6, '0')}">${franchise.name}</div>
                <div class="franchise-discovery-desc">${franchise.description}</div>
                <div class="franchise-discovery-systems">${franchise.systems.length} systems revealed</div>
            </div>
        `;

        // Add to container
        if (this.container) {
            this.container.appendChild(notification);

            // Animate in
            setTimeout(() => notification.classList.add('show'), 100);

            // Remove after delay
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 500);
            }, 5000);
        }
    },

    /**
     * Check if any franchise should be discovered based on colonization
     * Called when new stars are colonized
     */
    checkFranchiseDiscovery(colonizedPosition) {
        if (!this.franchises) return;
        for (const [franchiseId, franchise] of Object.entries(this.franchises)) {
            if (franchise.discovered) continue;

            // Check if any colonized star is within discovery range of franchise
            const baseAngle = this.hashStringToAngle(franchiseId);
            const baseX = this.solPosition.x + Math.cos(baseAngle) * franchise.baseRadius;
            const baseY = this.solPosition.y + franchise.baseY;
            const baseZ = this.solPosition.z + Math.sin(baseAngle) * franchise.baseRadius;

            const dx = colonizedPosition.x - baseX;
            const dy = colonizedPosition.y - baseY;
            const dz = colonizedPosition.z - baseZ;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

            // Discover if within 50 units
            if (dist < 50) {
                this.discoverFranchise(franchiseId);
            }
        }
    },

    /**
     * Hash a string to an angle (for consistent positioning)
     */
    hashStringToAngle(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return (Math.abs(hash) % 1000) / 1000 * Math.PI * 2;
    },

    /**
     * Create visual markers for POAs (distinct from regular stars)
     */
    createPOAMarkers() {
        // Safety check - ensure colonizationGroup exists
        if (!this.colonizationGroup) {
            console.warn('[StarMap] createPOAMarkers called before colonizationGroup initialized');
            return;
        }

        this.poaMarkers = [];

        // Color mapping for different object types
        const typeColors = {
            // Nearby stars use spectral colors
            'G2V': 0xfff4ea, 'M4V': 0xffcc6f, 'M6V': 0xffaa44,
            'A1V': 0xcad7ff, 'K2V': 0xffd2a1, 'F5V': 0xf8f7ff, 'G8V': 0xfff4ea,
            // Deep sky objects - Nebulae
            'nebula': 0xff66aa,             // Pink/magenta for nebulae
            'supernova_remnant': 0x66ffff,  // Cyan for remnants
            'planetary_nebula': 0x00ffaa,   // Teal for planetary nebulae
            'halo_nebula': 0xaa88ff,        // Lavender for halo nebulae
            // Star clusters
            'open_cluster': 0xffffaa,       // Yellow for open clusters
            'globular_cluster': 0xffaa66,   // Orange for globular clusters
            'cluster': 0xffcc66,            // Golden for generic clusters
            // Compact objects
            'black_hole': 0x8844ff,         // Purple for black holes
            'pulsar': 0x00ffff,             // Bright cyan for pulsars
            'magnetar': 0xff00ff,           // Magenta for magnetars
            // Stars
            'supergiant': 0xff6644,         // Red-orange for supergiants
            'hypergiant': 0xff4488,         // Pink for hypergiants
            'giant': 0xffaa44,              // Orange for giants
            'star': 0xffffff,               // White default
            // Satellite galaxies and dwarfs
            'satellite_galaxy': 0xaaddff,   // Light blue for dwarf galaxies
            'dwarf_galaxy': 0x88ccff,       // Pale blue for dwarf galaxies
            'galaxy': 0x99ddff,             // Light cyan for galaxies
            // Galactic structures
            'arm': 0x66ff99,                // Green for spiral arms
            'dark_region': 0x666688,        // Dim grey-blue for dark regions
            'gas_stream': 0x88ccff,         // Pale blue for gas streams
            'high_velocity_cloud': 0x66aaff, // Blue for HVCs
            'gamma_structure': 0xff8800,    // Orange for Fermi bubbles
            'cavity': 0x444488,             // Dark blue for voids/bubbles
            'spiral_arm': 0xccccff,         // Pale violet for spiral arms
            'bar_structure': 0xffcc88,      // Golden for galactic bar
            // Franchise systems (use POA's color property)
            'franchise_system': 0x00ffff    // Default cyan, overridden by POA color
        };

        for (const poa of this.pointsOfAttraction) {
            // Skip hidden franchise POAs (not yet discovered)
            if (poa.hidden) continue;

            // Use franchise color if available, otherwise type color
            const color = poa.color || typeColors[poa.spectralType] || typeColors[poa.spectralType?.[0]] || 0xffffff;
            const isDeepSky = poa.isDeepSky;

            // Position relative to Sol
            const posX = poa.position.x - this.solPosition.x;
            const posY = poa.position.y - this.solPosition.y;
            const posZ = poa.position.z - this.solPosition.z;

            if (isDeepSky) {
                // Deep sky objects get special markers based on type
                this.createDeepSkyMarker(poa, color, posX, posY, posZ);
            } else {
                // Nearby stars get clickable sphere markers (much easier to click)
                const sphereGeometry = new THREE.SphereGeometry(0.08, 12, 12);
                const sphereMaterial = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.6
                });
                const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
                sphere.position.set(posX, posY, posZ);
                sphere.userData = { poaId: poa.id, poa: poa };
                this.colonizationGroup.add(sphere);
                this.poaMarkers.push(sphere);

                // Ring around it for visibility
                const ringGeometry = new THREE.RingGeometry(0.1, 0.12, 32);
                const ringMaterial = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.5,
                    side: THREE.DoubleSide
                });
                const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                ring.position.set(posX, posY, posZ);
                ring.userData = { poaId: poa.id, poa: poa };
                this.colonizationGroup.add(ring);
                this.poaMarkers.push(ring);
            }
        }

        // Create floating labels for all POAs
        this.createPOALabels();
    },

    /**
     * Create floating labels for all POAs
     */
    createPOALabels() {
        // Create container for POA labels if it doesn't exist
        if (!this.poaLabelsContainer) {
            this.poaLabelsContainer = document.createElement('div');
            this.poaLabelsContainer.className = 'poa-labels-container';
            this.container.appendChild(this.poaLabelsContainer);
        }

        // Clear existing labels
        this.poaLabelsContainer.innerHTML = '';
        this.poaLabels = [];

        for (const poa of this.pointsOfAttraction) {
            // Calculate local position (relative to Sol)
            const localX = poa.position.x - this.solPosition.x;
            const localY = poa.position.y - this.solPosition.y;
            const localZ = poa.position.z - this.solPosition.z;
            const localPos = new THREE.Vector3(localX, localY, localZ);

            // Format distance
            const distLY = poa.distance || (poa.distanceUnits * 326);
            let distStr;
            if (distLY < 100) {
                distStr = `${distLY.toFixed(1)} ly`;
            } else if (distLY < 10000) {
                distStr = `${(distLY / 1000).toFixed(1)} kly`;
            } else {
                distStr = `${(distLY / 1000).toFixed(0)} kly`;
            }

            // Create label element
            const label = document.createElement('div');
            label.className = 'poa-label';
            label.innerHTML = `
                <span class="poa-label-name">${poa.name}</span>
                <span class="poa-label-dist">${distStr}</span>
            `;

            // Click handler - navigate and show colonization menu
            label.addEventListener('click', (e) => {
                e.stopPropagation();
                this.navigateAndShowPOA(poa.id);
            });

            label.dataset.poaId = poa.id;
            this.poaLabelsContainer.appendChild(label);

            // Store for position updates
            this.poaLabels.push({
                element: label,
                poa: poa,
                localPosition: localPos
            });
        }

        console.log(`[StarMap] Created ${this.poaLabels.length} POA labels`);
    },

    /**
     * Refresh POA markers (rebuild after franchise discovery)
     */
    refreshPOAMarkers() {
        // Remove existing markers
        if (this.poaMarkers) {
            for (const marker of this.poaMarkers) {
                if (marker.parent) marker.parent.remove(marker);
                if (marker.geometry) marker.geometry.dispose();
                if (marker.material) marker.material.dispose();
            }
        }

        // Remove existing labels
        if (this.poaLabels) {
            for (const labelData of this.poaLabels) {
                if (labelData.element && labelData.element.parentNode) {
                    labelData.element.parentNode.removeChild(labelData.element);
                }
            }
        }

        // Recreate markers and labels
        this.createPOAMarkers();
        this.createPOALabels();
    },

    /**
     * Update POA label positions - fixed to markers like Sol label
     */
    updatePOALabels() {
        if (!this.poaLabels || !this.camera) return;

        for (const labelData of this.poaLabels) {
            const { element, poa } = labelData;

            // Get world position directly from marker (like Sol label does)
            const marker = this.poaMarkers?.find(m => m.userData?.poaId === poa.id);
            if (!marker) {
                element.style.display = 'none';
                continue;
            }

            const worldPos = new THREE.Vector3();
            marker.getWorldPosition(worldPos);

            // Project to screen coordinates
            const screenPos = worldPos.clone().project(this.camera);

            // Convert to CSS coordinates
            const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

            // Check if visible (z < 1 means in front of camera)
            if (screenPos.z < 1 && screenPos.z > -1) {
                element.style.display = 'block';
                element.style.left = `${x}px`;
                element.style.top = `${y}px`;

                // Fade based on distance
                const dist = this.camera.position.distanceTo(worldPos);
                const opacity = Math.max(0.3, Math.min(1, 1 - dist / 500));
                element.style.opacity = opacity.toString();

                // Update colonized/queued status
                if (poa.colonized) {
                    element.classList.add('colonized');
                    element.classList.remove('queued');
                } else {
                    element.classList.remove('colonized');
                    const isQueued = this.targetQueue?.some(t => t.id === poa.id);
                    element.classList.toggle('queued', isQueued);
                }
            } else {
                element.style.display = 'none';
            }
        }
    },

    /**
     * Create specialized marker for deep sky objects
     */
    createDeepSkyMarker(poa, color, x, y, z) {
        // Safety check - ensure colonizationGroup exists
        if (!this.colonizationGroup) {
            console.warn('[StarMap] colonizationGroup not initialized, skipping deep sky marker for', poa.name);
            return;
        }

        const type = poa.spectralType || poa.type;
        let marker;

        // Scale based on distance - farther objects slightly larger for visibility
        const distScale = Math.min(1.5, 0.8 + poa.distanceUnits / 50);

        switch (type) {
            case 'nebula':
            case 'supernova_remnant':
            case 'planetary_nebula':
                // Nebulae: soft fuzzy sphere
                const nebulaGeo = new THREE.SphereGeometry(0.15 * distScale, 16, 16);
                const nebulaMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.25,
                    depthWrite: false
                });
                marker = new THREE.Mesh(nebulaGeo, nebulaMat);
                break;

            case 'open_cluster':
                // Open clusters: small scattered points
                const clusterGeo = new THREE.BufferGeometry();
                const clusterPoints = [];
                for (let i = 0; i < 8; i++) {
                    const offset = 0.08 * distScale;
                    clusterPoints.push(
                        (Math.random() - 0.5) * offset,
                        (Math.random() - 0.5) * offset,
                        (Math.random() - 0.5) * offset
                    );
                }
                clusterGeo.setAttribute('position', new THREE.Float32BufferAttribute(clusterPoints, 3));
                const clusterMat = new THREE.PointsMaterial({
                    color: color,
                    size: 0.03 * distScale,
                    transparent: true,
                    opacity: 0.9
                });
                marker = new THREE.Points(clusterGeo, clusterMat);
                break;

            case 'globular_cluster':
                // Globular clusters: dense cluster of dots
                const globGeo = new THREE.BufferGeometry();
                const globPoints = [];
                for (let i = 0; i < 25; i++) {
                    const r = Math.random() * 0.12 * distScale;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(2 * Math.random() - 1);
                    globPoints.push(
                        r * Math.sin(phi) * Math.cos(theta),
                        r * Math.sin(phi) * Math.sin(theta),
                        r * Math.cos(phi)
                    );
                }
                globGeo.setAttribute('position', new THREE.Float32BufferAttribute(globPoints, 3));
                const globMat = new THREE.PointsMaterial({
                    color: color,
                    size: 0.025 * distScale,
                    transparent: true,
                    opacity: 0.9
                });
                marker = new THREE.Points(globGeo, globMat);
                break;

            case 'halo_nebula':
                // Halo nebulae: spread out cluster of dots
                const haloGeo = new THREE.BufferGeometry();
                const haloPoints = [];
                for (let i = 0; i < 20; i++) {
                    const spread = 0.15 * distScale;
                    haloPoints.push(
                        (Math.random() - 0.5) * spread,
                        (Math.random() - 0.5) * spread,
                        (Math.random() - 0.5) * spread
                    );
                }
                haloGeo.setAttribute('position', new THREE.Float32BufferAttribute(haloPoints, 3));
                const haloMat = new THREE.PointsMaterial({
                    color: color,
                    size: 0.03 * distScale,
                    transparent: true,
                    opacity: 0.8
                });
                marker = new THREE.Points(haloGeo, haloMat);
                break;

            case 'black_hole':
                // Black holes: ring with dark center
                const bhRingGeo = new THREE.TorusGeometry(0.1 * distScale, 0.02 * distScale, 8, 24);
                const bhRingMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.8
                });
                marker = new THREE.Mesh(bhRingGeo, bhRingMat);
                break;

            case 'pulsar':
                // Pulsars: small bright point with rays
                const pulsarGeo = new THREE.OctahedronGeometry(0.05 * distScale, 0);
                const pulsarMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.9
                });
                marker = new THREE.Mesh(pulsarGeo, pulsarMat);
                break;

            case 'supergiant':
            case 'hypergiant':
                // Giant stars: larger glowing sphere
                const giantGeo = new THREE.SphereGeometry(0.08 * distScale, 12, 12);
                const giantMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.7
                });
                marker = new THREE.Mesh(giantGeo, giantMat);
                break;

            case 'franchise_system':
                // Franchise systems: bright visible star with glow
                const franchiseStarGeo = new THREE.SphereGeometry(0.15 * distScale, 16, 16);
                const franchiseStarMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.9
                });
                marker = new THREE.Mesh(franchiseStarGeo, franchiseStarMat);

                // Add glow effect around the star
                const glowGeo = new THREE.SphereGeometry(0.25 * distScale, 16, 16);
                const glowMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.2,
                    depthWrite: false
                });
                const glow = new THREE.Mesh(glowGeo, glowMat);
                glow.position.set(x, y, z);
                this.colonizationGroup.add(glow);
                break;

            default:
                // Default: simple diamond
                const defaultGeo = new THREE.OctahedronGeometry(0.04 * distScale, 0);
                const defaultMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.8
                });
                marker = new THREE.Mesh(defaultGeo, defaultMat);
        }

        marker.position.set(x, y, z);
        marker.userData = { poaId: poa.id, poa: poa, isDeepSky: true };
        this.colonizationGroup.add(marker);
        this.poaMarkers.push(marker);

        // === ALWAYS ADD A CENTRAL STAR AT EXACT POA POSITION ===
        const starSize = Math.max(0.04, 0.06 * distScale);
        const starGeo = new THREE.SphereGeometry(starSize, 8, 8);
        const starMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.95
        });
        const centralStar = new THREE.Mesh(starGeo, starMat);
        centralStar.position.set(x, y, z);
        centralStar.userData = { poaId: poa.id, poa: poa, isDeepSky: true, isCentralStar: true };
        this.colonizationGroup.add(centralStar);
        this.poaMarkers.push(centralStar);

        // Add a subtle label ring around the marker
        const labelRingGeo = new THREE.RingGeometry(0.18 * distScale, 0.2 * distScale, 32);
        const labelRingMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const labelRing = new THREE.Mesh(labelRingGeo, labelRingMat);
        labelRing.position.set(x, y, z);
        this.colonizationGroup.add(labelRing);
    },

    /**
     * Launch initial probe to nearest POA (Alpha Centauri)
     */
    launchInitialProbe() {
        console.log('[StarMap] launchInitialProbe called, POAs:', this.pointsOfAttraction?.length);
        if (this.pointsOfAttraction.length === 0) {
            console.warn('[StarMap] No POAs available for initial probe!');
            return;
        }

        // Find nearest uncolonized POA
        const nearestPOA = this.pointsOfAttraction
            .filter(p => !p.colonized && p.status !== 'fleet_sent')
            .sort((a, b) => a.distance - b.distance)[0];

        if (!nearestPOA) {
            console.warn('[StarMap] No uncolonized POA found for initial probe!');
            return;
        }

        // Mark as fleet sent
        nearestPOA.status = 'fleet_sent';

        // Find the colonization target for this POA
        const target = this.colonizationTargets.find(t => t.isPOA && t.poaData?.id === nearestPOA.id);
        if (target) {
            target.colonized = true;  // Reserve it
        }

        // Launch visual probe from Sol to the POA
        const targetX = nearestPOA.position.x - this.solPosition.x;
        const targetY = nearestPOA.position.y - this.solPosition.y;
        const targetZ = nearestPOA.position.z - this.solPosition.z;

        this.launchProbeFleet(targetX, targetY, targetZ, target || nearestPOA);
        console.log(`[StarMap] Launched initial probe to ${nearestPOA.name} (${nearestPOA.distance} ly)`);
    }
});
