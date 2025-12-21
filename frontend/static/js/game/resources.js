/** Resource management utilities */
class ResourceManager {
    static formatEnergy(value) {
        if (value >= 1e15) return (value / 1e15).toFixed(2) + 'PW';
        if (value >= 1e12) return (value / 1e12).toFixed(2) + 'TW';
        if (value >= 1e9) return (value / 1e9).toFixed(2) + 'GW';
        if (value >= 1e6) return (value / 1e6).toFixed(2) + 'MW';
        if (value >= 1e3) return (value / 1e3).toFixed(2) + 'kW';
        return value.toFixed(2) + 'W';
    }

    static formatMetal(value) {
        if (value >= 1e24) return (value / 1e24).toFixed(2) + 'Ykg';
        if (value >= 1e21) return (value / 1e21).toFixed(2) + 'Zkg';
        if (value >= 1e18) return (value / 1e18).toFixed(2) + 'Ekg';
        if (value >= 1e15) return (value / 1e15).toFixed(2) + 'Pkg';
        if (value >= 1e12) return (value / 1e12).toFixed(2) + 'Tkg';
        if (value >= 1e9) return (value / 1e9).toFixed(2) + 'Gkg';
        if (value >= 1e6) return (value / 1e6).toFixed(2) + 'Mkg';
        if (value >= 1e3) return (value / 1e3).toFixed(2) + 'kg';
        return value.toFixed(2) + 'g';
    }

    static formatNumber(value) {
        if (value >= 1e24) return (value / 1e24).toFixed(2) + 'Y';
        if (value >= 1e21) return (value / 1e21).toFixed(2) + 'Z';
        if (value >= 1e18) return (value / 1e18).toFixed(2) + 'E';
        if (value >= 1e15) return (value / 1e15).toFixed(2) + 'P';
        if (value >= 1e12) return (value / 1e12).toFixed(2) + 'T';
        if (value >= 1e9) return (value / 1e9).toFixed(2) + 'G';
        if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
        if (value >= 1e3) return (value / 1e3).toFixed(2) + 'k';
        return value.toFixed(2);
    }
}

