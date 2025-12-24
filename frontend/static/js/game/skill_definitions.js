/**
 * Skill Definitions
 * 
 * Master mapping of skill names to research trees.
 * This is the canonical source of truth for all skills in the game.
 */

const SKILL_DEFINITIONS = {
    // ============================================
    // DEXTERITY SKILLS (9 trees)
    // ============================================
    strength: {
        displayName: 'Actuator Strength',
        category: 'dexterity',
        treeId: 'actuator_systems',
        description: 'Actuator torque and force multiplier',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    dyson_construction: {
        displayName: 'Dyson Construction',
        category: 'dexterity',
        treeId: 'dyson_swarm_construction',
        description: 'Dyson sphere/swarm construction efficiency',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    locomotion: {
        displayName: 'Locomotion',
        category: 'dexterity',
        treeId: 'locomotion_systems',
        description: 'Fine movement and positioning efficiency',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    materials: {
        displayName: 'Materials Science',
        category: 'dexterity',
        treeId: 'materials_science',
        description: 'Material strength and durability',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    production: {
        displayName: 'Production Efficiency',
        category: 'dexterity',
        treeId: 'production_efficiency',
        description: 'Manufacturing rates and efficiency',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    propulsion: {
        displayName: 'Propulsion',
        category: 'dexterity',
        treeId: 'propulsion_systems',
        description: 'ISP and propulsion efficiency',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    recycling: {
        displayName: 'Resource Recovery',
        category: 'dexterity',
        treeId: 'recycling_efficiency',
        description: 'Material recovery and salvage efficiency',
        baseValue: 0.75,  // Base 75% recovery
        unit: 'percentage'
    },
    manipulation: {
        displayName: 'Robotic Systems',
        category: 'dexterity',
        treeId: 'robotic_systems',
        description: 'Robotic manipulation and dexterity',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    thrust: {
        displayName: 'Thrust Systems',
        category: 'dexterity',
        treeId: 'thrust_systems',
        description: 'Thrust power and efficiency',
        baseValue: 1.0,
        unit: 'multiplier'
    },

    // ============================================
    // INTELLIGENCE SKILLS (7 trees)
    // ============================================
    gpu: {
        displayName: 'GPU Computing',
        category: 'intelligence',
        treeId: 'computer_gpu',
        description: 'Parallel computation power',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    interconnect: {
        displayName: 'Interconnect',
        category: 'intelligence',
        treeId: 'computer_interconnect',
        description: 'Data transmission bandwidth',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    io_bandwidth: {
        displayName: 'I/O Interface',
        category: 'intelligence',
        treeId: 'computer_interface',
        description: 'Interface and I/O bandwidth',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    cpu: {
        displayName: 'CPU Processing',
        category: 'intelligence',
        treeId: 'computer_processing',
        description: 'Central processing power',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    learning: {
        displayName: 'Machine Learning',
        category: 'intelligence',
        treeId: 'machine_learning',
        description: 'Learning and adaptation efficiency',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    research_rate: {
        displayName: 'Research Efficiency',
        category: 'intelligence',
        treeId: 'research_rate_efficiency',
        description: 'Research speed multiplier',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    sensors: {
        displayName: 'Sensor Systems',
        category: 'intelligence',
        treeId: 'sensor_systems',
        description: 'Sensor signal-to-noise ratio',
        baseValue: 1.0,
        unit: 'multiplier'
    },

    // ============================================
    // ENERGY SKILLS (6 trees)
    // ============================================
    solar_pv: {
        displayName: 'Energy Collection',
        category: 'energy',
        treeId: 'energy_collection',
        description: 'Solar energy collection efficiency',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    energy_converter: {
        displayName: 'Energy Conversion',
        category: 'energy',
        treeId: 'energy_conversion',
        description: 'Energy conversion efficiency',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    battery_density: {
        displayName: 'Energy Storage',
        category: 'energy',
        treeId: 'energy_storage',
        description: 'Battery energy density',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    energy_transport: {
        displayName: 'Energy Transport',
        category: 'energy',
        treeId: 'energy_transport',
        description: 'Wireless energy transmission efficiency',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    heat_pump: {
        displayName: 'Heat Pump',
        category: 'energy',
        treeId: 'heat_pump_systems',
        description: 'Heat pump efficiency',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    radiator: {
        displayName: 'Thermal Management',
        category: 'energy',
        treeId: 'thermal_management',
        description: 'Thermal management and heat rejection',
        baseValue: 1.0,
        unit: 'multiplier'
    }
};

// Reverse mapping: treeId -> skillName
const TREE_TO_SKILL = {};
for (const [skillName, def] of Object.entries(SKILL_DEFINITIONS)) {
    TREE_TO_SKILL[def.treeId] = skillName;
}

// Get all skill names
const ALL_SKILL_NAMES = Object.keys(SKILL_DEFINITIONS);

// Get skill names by category
const SKILLS_BY_CATEGORY = {
    dexterity: [],
    intelligence: [],
    energy: []
};

for (const [skillName, def] of Object.entries(SKILL_DEFINITIONS)) {
    SKILLS_BY_CATEGORY[def.category].push(skillName);
}

// Category display names
const CATEGORY_DISPLAY_NAMES = {
    dexterity: 'Dexterity',
    intelligence: 'Intelligence',
    energy: 'Energy'
};

// Legacy skill aliases (for backward compatibility)
const SKILL_ALIASES = {
    'robotic': 'manipulation',
    'energy_collection': 'solar_pv',
    'energy_storage': 'battery_density',
    'thermal_efficiency': 'radiator',
    'acds': null  // ACDS is computed, not from a tree
};

/**
 * Get skill definition by name (resolves aliases)
 * @param {string} skillName - Skill name or alias
 * @returns {Object|null} Skill definition
 */
function getSkillDefinition(skillName) {
    // Check for alias
    if (skillName in SKILL_ALIASES) {
        const resolved = SKILL_ALIASES[skillName];
        if (resolved === null) return null;
        skillName = resolved;
    }
    return SKILL_DEFINITIONS[skillName] || null;
}

/**
 * Get tree ID for a skill name
 * @param {string} skillName - Skill name
 * @returns {string|null} Tree ID
 */
function getTreeIdForSkill(skillName) {
    const def = getSkillDefinition(skillName);
    return def?.treeId || null;
}

/**
 * Get skill name for a tree ID
 * @param {string} treeId - Research tree ID
 * @returns {string|null} Skill name
 */
function getSkillForTreeId(treeId) {
    return TREE_TO_SKILL[treeId] || null;
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SKILL_DEFINITIONS,
        TREE_TO_SKILL,
        ALL_SKILL_NAMES,
        SKILLS_BY_CATEGORY,
        CATEGORY_DISPLAY_NAMES,
        SKILL_ALIASES,
        getSkillDefinition,
        getTreeIdForSkill,
        getSkillForTreeId
    };
}

