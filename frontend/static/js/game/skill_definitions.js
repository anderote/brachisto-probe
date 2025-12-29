/**
 * Skill Definitions
 * 
 * Master mapping of skill names to research trees.
 * This is the canonical source of truth for all skills in the game.
 * 
 * Simplified to 12 core skills (4 per category) with 20 tiers each.
 */

const SKILL_DEFINITIONS = {
    // ============================================
    // DEXTERITY SKILLS (4 trees)
    // ============================================
    propulsion: {
        displayName: 'Propulsion',
        category: 'dexterity',
        treeId: 'propulsion',
        description: 'Propulsion efficiency and ISP multiplier',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    robotics: {
        displayName: 'Robotics',
        category: 'dexterity',
        treeId: 'robotics',
        description: 'Robotic manipulation and dexterity multiplier',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    materials: {
        displayName: 'Materials Science',
        category: 'dexterity',
        treeId: 'materials',
        description: 'Material strength and durability multiplier',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    structures: {
        displayName: 'Structures',
        category: 'dexterity',
        treeId: 'structures',
        description: 'Construction, manufacturing, and recycling efficiency multiplier',
        baseValue: 1.0,
        unit: 'multiplier'
    },

    // ============================================
    // ENERGY SKILLS (4 trees)
    // ============================================
    generation: {
        displayName: 'Energy Generation',
        category: 'energy',
        treeId: 'generation',
        description: 'Solar energy collection and generation efficiency multiplier',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    storage_density: {
        displayName: 'Storage Density',
        category: 'energy',
        treeId: 'storage_density',
        description: 'Battery energy density multiplier',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    conversion: {
        displayName: 'Energy Conversion',
        category: 'energy',
        treeId: 'conversion',
        description: 'Energy conversion efficiency and thermal management multiplier',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    transmission: {
        displayName: 'Energy Transmission',
        category: 'energy',
        treeId: 'transmission',
        description: 'Wireless energy transmission efficiency multiplier',
        baseValue: 1.0,
        unit: 'multiplier'
    },

    // ============================================
    // INTELLIGENCE SKILLS (4 trees)
    // ============================================
    architecture: {
        displayName: 'Architecture',
        category: 'intelligence',
        treeId: 'architecture',
        description: 'Computational architecture and system design multiplier',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    processor: {
        displayName: 'Processor',
        category: 'intelligence',
        treeId: 'processor',
        description: 'Central processing power multiplier',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    memory: {
        displayName: 'Memory',
        category: 'intelligence',
        treeId: 'memory',
        description: 'Memory and data storage bandwidth multiplier',
        baseValue: 1.0,
        unit: 'multiplier'
    },
    sensors: {
        displayName: 'Sensors',
        category: 'intelligence',
        treeId: 'sensors',
        description: 'Sensor systems and communication bandwidth multiplier',
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

// Legacy skill aliases (for backward compatibility with old save states)
const SKILL_ALIASES = {
    // Old dexterity skills
    'thrust': 'propulsion',
    'locomotion': 'propulsion',
    'manipulation': 'robotics',
    'strength': 'robotics',
    'production': 'structures',
    'recycling': 'structures',
    'dyson_construction': 'structures',
    
    // Old energy skills
    'solar_pv': 'generation',
    'pv_efficiency': 'generation',
    'energy_collection': 'generation',
    'battery_density': 'storage_density',
    'energy_storage': 'storage_density',
    'energy_converter': 'conversion',
    'thermal_efficiency': 'conversion',
    'radiator': 'conversion',
    'heat_pump': 'conversion',
    'energy_transport': 'transmission',
    
    // Old intelligence skills
    'cpu': 'processor',
    'gpu': 'processor',
    'computer_processing': 'processor',
    'computer_gpu': 'processor',
    'interconnect': 'sensors',
    'io_bandwidth': 'memory',
    'computer_interface': 'memory',
    'computer_interconnect': 'sensors',
    'learning': 'architecture',
    'machine_learning': 'architecture',
    'research_rate': 'architecture',
    'research_rate_efficiency': 'architecture',
    'substrate': 'architecture',
    'sensor_systems': 'sensors',
    
    // Legacy computed skills
    'robotic': 'robotics',
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
