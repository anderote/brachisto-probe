/** Upgrades system utilities */
class UpgradesManager {
    constructor() {
        this.upgrades = {};
    }

    loadUpgrades(data) {
        this.upgrades = data;
    }

    getUpgrade(upgradeId) {
        return this.upgrades[upgradeId];
    }

    isUnlocked(upgradeId, gameState) {
        // TODO: Check prerequisites and research progress
        return true;
    }

    getEffects(upgradeId) {
        const upgrade = this.getUpgrade(upgradeId);
        return upgrade ? upgrade.effects : {};
    }
}

