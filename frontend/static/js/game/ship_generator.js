/**
 * Ship Generator - Procedural generation of generational colony ships
 *
 * Creates unique ship identities with:
 * - Names combining cultural elements
 * - Population and crew statistics
 * - Ship systems and capabilities
 * - Cultural identity that evolves over generations
 */

const ShipGenerator = {

    // ========================================================================
    // NAME GENERATION
    // ========================================================================

    // Cultural name prefixes (merge over generations)
    culturalPrefixes: {
        european: ['Nova', 'Stella', 'Vega', 'Aurora', 'Celestia', 'Horizon', 'Eternal'],
        asian: ['Tengri', 'Amaterasu', 'Shenlong', 'Byakko', 'Indra', 'Garuda', 'Naga'],
        african: ['Nyame', 'Oshun', 'Mawu', 'Anansi', 'Shango', 'Imana', 'Eshu'],
        american: ['Thunderbird', 'Coyote', 'Raven', 'Condor', 'Quetzal', 'Jaguar', 'Eagle'],
        oceanic: ['Maui', 'Tangaroa', 'Pele', 'Rangi', 'Hina', 'Tiki', 'Kanaloa'],
        synthetic: ['Axiom', 'Zenith', 'Apex', 'Vector', 'Nexus', 'Helix', 'Quantum']
    },

    // Ship class names
    shipClasses: [
        'Ark', 'Seed', 'Exodus', 'Genesis', 'Pioneer', 'Venture', 'Prospect',
        'Heritage', 'Legacy', 'Destiny', 'Promise', 'Covenant', 'Pilgrim',
        'Wanderer', 'Seeker', 'Dream', 'Hope', 'Faith', 'Spirit', 'Dawn'
    ],

    // Numeric/generational suffixes
    suffixes: [
        'Prime', 'Alpha', 'Omega', 'I', 'II', 'III', 'IV', 'V',
        'First', 'Ascendant', 'Eternal', 'Reborn', 'Rising'
    ],

    // ========================================================================
    // CULTURAL ELEMENTS
    // ========================================================================

    religions: [
        { name: 'Solarian', desc: 'worship of the departure star' },
        { name: 'Cosmist', desc: 'belief in universal consciousness' },
        { name: 'Ancestrist', desc: 'veneration of Earth founders' },
        { name: 'Voidwalker', desc: 'embrace of the infinite dark' },
        { name: 'Neo-Buddhist', desc: 'acceptance of impermanence' },
        { name: 'Techno-Shinto', desc: 'spirits in all machines' },
        { name: 'Rationalist', desc: 'faith in reason alone' },
        { name: 'Gaian', desc: 'Earth-mother remembrance' },
        { name: 'Stellarist', desc: 'destination star worship' },
        { name: 'Humanist', desc: 'celebration of human spirit' },
        { name: 'Synthesist', desc: 'human-machine unity' },
        { name: 'Quietist', desc: 'contemplative silence' }
    ],

    ethnicities: [
        'Pan-European', 'East Asian', 'South Asian', 'Pan-African',
        'Amerindian', 'Oceanic', 'Circumpolar', 'Mediterranean',
        'Slavic', 'Nordic', 'Celtic', 'Iberian', 'Germanic',
        'Bantu', 'Nilotic', 'Amazigh', 'Cushitic',
        'Han', 'Yamato', 'Korean', 'Viet', 'Tai', 'Malay',
        'Dravidian', 'Indo-Aryan', 'Persian', 'Turkic', 'Semitic',
        'Polynesian', 'Melanesian', 'Aboriginal',
        'Mesoamerican', 'Andean', 'Plains', 'Inuit'
    ],

    languages: [
        'Terran Standard', 'Ship Creole', 'Technical Esperanto', 'Merged Mandarin',
        'Neo-Latin', 'Void Pidgin', 'Ancestral Tongue', 'Binary-Verbal Hybrid',
        'Drift Dialect', 'Generation Speech', 'Colonial Standard', 'Archive Language'
    ],

    governments: [
        { name: 'Council Democracy', desc: 'elected representatives' },
        { name: 'Technocracy', desc: 'rule by specialists' },
        { name: 'Ship Captain', desc: 'traditional command' },
        { name: 'Consensus', desc: 'unanimous agreement required' },
        { name: 'Meritocracy', desc: 'advancement by ability' },
        { name: 'Gerontocracy', desc: 'elders council' },
        { name: 'Lottery Democracy', desc: 'random selection' },
        { name: 'AI-Advised', desc: 'human choice, machine counsel' },
        { name: 'Guild Federation', desc: 'professional unions' },
        { name: 'Direct Democracy', desc: 'constant voting' }
    ],

    mottoTemplates: [
        'Through {element} to {goal}',
        '{goal} awaits the {adjective}',
        'We carry {thing} to the stars',
        '{number} generations, one {goal}',
        'Born of {origin}, bound for {goal}',
        'In {element} we {verb}',
        '{adjective} hearts, {adjective2} minds',
        'The {thing} endures',
        'From {origin} to eternity',
        'Children of {origin}, seekers of {goal}'
    ],

    mottoElements: {
        element: ['darkness', 'void', 'silence', 'light', 'time', 'stars', 'faith', 'unity'],
        goal: ['destiny', 'tomorrow', 'home', 'hope', 'rebirth', 'glory', 'peace', 'purpose'],
        adjective: ['steadfast', 'unwavering', 'eternal', 'brave', 'united', 'vigilant', 'humble'],
        adjective2: ['clear', 'sharp', 'open', 'wise', 'patient', 'fierce', 'calm'],
        thing: ['Earth', 'humanity', 'memory', 'hope', 'fire', 'dream', 'seed', 'spirit'],
        origin: ['Sol', 'Earth', 'Terra', 'the cradle', 'old night', 'ancient soil'],
        verb: ['trust', 'endure', 'believe', 'persevere', 'thrive', 'remember'],
        number: ['Ten', 'Twenty', 'Fifty', 'Hundred', 'Thousand']
    },

    // ========================================================================
    // SHIP SYSTEMS
    // ========================================================================

    driveTypes: [
        { name: 'Fusion Torch', efficiency: 0.6, reliability: 0.95 },
        { name: 'Antimatter Pulse', efficiency: 0.8, reliability: 0.85 },
        { name: 'Bussard Ramjet', efficiency: 0.7, reliability: 0.9 },
        { name: 'Solar Sail Array', efficiency: 0.4, reliability: 0.99 },
        { name: 'Ion Drive Cluster', efficiency: 0.5, reliability: 0.97 },
        { name: 'Laser Pushed', efficiency: 0.75, reliability: 0.88 }
    ],

    lifeSupportTypes: [
        { name: 'Closed Ecosystem', capacity: 1.0, desc: 'full biosphere' },
        { name: 'Hydroponics Bay', capacity: 0.8, desc: 'plant-based recycling' },
        { name: 'Synthetic Recycler', capacity: 0.7, desc: 'mechanical life support' },
        { name: 'Hybrid Bio-Mech', capacity: 0.9, desc: 'combined systems' },
        { name: 'Suspended Animation', capacity: 1.2, desc: 'reduced consumption' }
    ],

    // ========================================================================
    // GENERATION FUNCTIONS
    // ========================================================================

    /**
     * Generate a complete ship manifest
     * @param {number} travelTimeYears - Journey duration in years
     * @param {number} distanceLY - Distance in light-years
     * @param {number} driveTier - Technology level (0-5)
     * @returns {Object} Complete ship data
     */
    generateShip(travelTimeYears, distanceLY, driveTier = 0) {
        const generations = Math.max(1, Math.floor(travelTimeYears / 25));

        // Pick primary and secondary cultures (will blend over generations)
        const cultureKeys = Object.keys(this.culturalPrefixes);
        const primaryCulture = this.pickRandom(cultureKeys);
        const secondaryCulture = this.pickRandom(cultureKeys.filter(c => c !== primaryCulture));

        // Generate ship identity
        const ship = {
            name: this.generateName(primaryCulture, secondaryCulture, generations),
            registry: this.generateRegistry(),

            // Population
            population: this.generatePopulation(travelTimeYears, generations),

            // Systems
            systems: this.generateSystems(driveTier, distanceLY),

            // Culture (evolves based on generations)
            culture: this.generateCulture(primaryCulture, secondaryCulture, generations),

            // Journey info
            journey: {
                distanceLY: Math.round(distanceLY),
                travelTimeYears: Math.round(travelTimeYears * 10) / 10,
                generations: generations,
                launchEra: 'Third Expansion'
            }
        };

        return ship;
    },

    generateName(primary, secondary, generations) {
        // Blend cultures based on generations
        let prefix;
        if (generations > 3 && Math.random() > 0.5) {
            // Hybrid name after many generations
            const p1 = this.pickRandom(this.culturalPrefixes[primary]);
            const p2 = this.pickRandom(this.culturalPrefixes[secondary]);
            // Take parts of each name
            prefix = p1.slice(0, Math.ceil(p1.length / 2)) + p2.slice(Math.floor(p2.length / 2));
        } else {
            prefix = this.pickRandom(this.culturalPrefixes[primary]);
        }

        const shipClass = this.pickRandom(this.shipClasses);
        const suffix = Math.random() > 0.6 ? ' ' + this.pickRandom(this.suffixes) : '';

        return `${prefix} ${shipClass}${suffix}`;
    },

    generateRegistry() {
        const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        const prefix = letters[Math.floor(Math.random() * letters.length)] +
                      letters[Math.floor(Math.random() * letters.length)];
        const number = Math.floor(Math.random() * 9000) + 1000;
        return `${prefix}-${number}`;
    },

    generatePopulation(travelTimeYears, generations) {
        // Base crew scales with journey length
        const baseCrew = Math.floor(500 + Math.random() * 1500);

        // Population grows over generations (with limits)
        const growthFactor = 1 + (generations * 0.15);
        const currentPop = Math.floor(baseCrew * growthFactor * (0.8 + Math.random() * 0.4));

        // Calculate demographics
        const birthRate = 12 + Math.floor(Math.random() * 8); // per 1000/year
        const deathRate = 8 + Math.floor(Math.random() * 6);  // per 1000/year

        return {
            current: currentPop,
            founders: baseCrew,
            generations: generations,
            birthRate: birthRate,
            deathRate: deathRate,
            growthRate: ((birthRate - deathRate) / 10).toFixed(1) + '%',
            children: Math.floor(currentPop * (0.15 + Math.random() * 0.1)),
            elders: Math.floor(currentPop * (0.1 + Math.random() * 0.08)),
            workers: Math.floor(currentPop * (0.5 + Math.random() * 0.15))
        };
    },

    generateSystems(driveTier, distanceLY) {
        // Pick drive based on tech tier
        const availableDrives = this.driveTypes.slice(0, Math.min(driveTier + 2, this.driveTypes.length));
        const drive = this.pickRandom(availableDrives);

        const lifeSupport = this.pickRandom(this.lifeSupportTypes);

        // Manufacturing capacity (0-100%)
        const manufacturing = Math.floor(40 + Math.random() * 50);

        // Defense rating (most ships are peaceful)
        const defense = Math.floor(Math.random() * 30);

        // Hull integrity (degrades slightly over distance)
        const degradation = Math.min(15, distanceLY / 100);
        const hull = Math.floor(95 - degradation + Math.random() * degradation);

        return {
            drive: drive.name,
            driveEfficiency: Math.floor(drive.efficiency * 100) + '%',
            driveReliability: Math.floor(drive.reliability * 100) + '%',
            lifeSupport: lifeSupport.name,
            lifeSupportDesc: lifeSupport.desc,
            manufacturing: manufacturing + '%',
            defense: defense > 15 ? 'Armed' : 'Minimal',
            defenseRating: defense,
            hullIntegrity: hull + '%'
        };
    },

    generateCulture(primary, secondary, generations) {
        // Pick base ethnicity, may blend over time
        let ethnicity;
        if (generations > 4) {
            const e1 = this.pickRandom(this.ethnicities);
            const e2 = this.pickRandom(this.ethnicities.filter(e => e !== e1));
            ethnicity = `${e1}-${e2} Blend`;
        } else if (generations > 2) {
            ethnicity = this.pickRandom(this.ethnicities) + ' Heritage';
        } else {
            ethnicity = this.pickRandom(this.ethnicities);
        }

        const religion = this.pickRandom(this.religions);
        const government = this.pickRandom(this.governments);

        // Language evolves
        let language = this.pickRandom(this.languages);
        if (generations > 3) {
            language = 'Evolved ' + language;
        }

        return {
            ethnicity: ethnicity,
            religion: religion.name,
            religionDesc: religion.desc,
            government: government.name,
            governmentDesc: government.desc,
            language: language,
            motto: this.generateMotto(),
            culturalAge: generations + ' generations'
        };
    },

    generateMotto() {
        const template = this.pickRandom(this.mottoTemplates);

        return template.replace(/\{(\w+)\}/g, (match, key) => {
            const options = this.mottoElements[key];
            return options ? this.pickRandom(options) : match;
        });
    },

    // ========================================================================
    // UTILITY
    // ========================================================================

    pickRandom(array) {
        return array[Math.floor(Math.random() * array.length)];
    },

    /**
     * Format ship data for terminal display
     * @param {Object} ship - Ship data from generateShip
     * @returns {string} Terminal-formatted text
     */
    formatForTerminal(ship) {
        if (!ship) return '';

        const lines = [
            `═══════════════════════════════════════════`,
            `  ${ship.name.toUpperCase()}`,
            `  Registry: ${ship.registry}`,
            `───────────────────────────────────────────`,
            `  CREW: ${ship.population.current.toLocaleString()} souls`,
            `  Gen ${ship.population.generations} | ${ship.population.growthRate}/yr`,
            `───────────────────────────────────────────`,
            `  DRIVE: ${ship.systems.drive}`,
            `  LIFE: ${ship.systems.lifeSupport}`,
            `  HULL: ${ship.systems.hullIntegrity}`,
            `───────────────────────────────────────────`,
            `  ${ship.culture.ethnicity}`,
            `  ${ship.culture.religion} | ${ship.culture.government}`,
            `───────────────────────────────────────────`,
            `  "${ship.culture.motto}"`,
            `═══════════════════════════════════════════`
        ];

        return lines.join('\n');
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.ShipGenerator = ShipGenerator;
}
