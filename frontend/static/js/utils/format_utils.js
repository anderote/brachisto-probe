/** Formatting utilities for displaying game values with appropriate units */

class FormatUtils {
    /**
     * Format time duration in days to human-readable format
     * @param {number} days - Time in days
     * @returns {string} Formatted time string (e.g., "2y 3mo 15d" or "5h 30m")
     */
    static formatTime(days) {
        if (!days || days < 0 || isNaN(days)) {
            return '0d';
        }
        
        const DAYS_PER_WEEK = 7;
        const DAYS_PER_MONTH = 30; // Approximate
        const DAYS_PER_YEAR = 365; // Approximate
        
        const totalDays = Math.floor(days);
        const fractionalDays = days - totalDays;
        
        // Calculate years
        const years = Math.floor(totalDays / DAYS_PER_YEAR);
        const remainingAfterYears = totalDays % DAYS_PER_YEAR;
        
        // Calculate months
        const months = Math.floor(remainingAfterYears / DAYS_PER_MONTH);
        const remainingAfterMonths = remainingAfterYears % DAYS_PER_MONTH;
        
        // Calculate weeks
        const weeks = Math.floor(remainingAfterMonths / DAYS_PER_WEEK);
        const remainingDays = remainingAfterMonths % DAYS_PER_WEEK;
        
        // Calculate hours/minutes if less than 1 day
        const hours = Math.floor(fractionalDays * 24);
        const mins = Math.floor((fractionalDays * 24 - hours) * 60);
        
        const parts = [];
        
        if (years > 0) {
            parts.push(`${years}y`);
        }
        if (months > 0 || years > 0) {
            parts.push(`${months}mo`);
        }
        if (weeks > 0 || months > 0 || years > 0) {
            parts.push(`${weeks}w`);
        }
        if (remainingDays > 0 || weeks > 0 || months > 0 || years > 0) {
            parts.push(`${remainingDays}d`);
        }
        
        // Only show hours/minutes if less than 1 day
        if (totalDays === 0) {
            if (hours > 0) {
                parts.push(`${hours.toString().padStart(2, '0')}h`);
            }
            parts.push(`${mins.toString().padStart(2, '0')}m`);
        }
        
        return parts.length === 0 ? '0d' : parts.join(' ');
    }
    
    /**
     * Format doubling time - can be in hours or minutes if very short
     * @param {number} days - Doubling time in days
     * @returns {string} Formatted doubling time
     */
    static formatDoublingTime(days) {
        if (!days || days < 0 || isNaN(days) || !isFinite(days)) {
            return '∞';
        }
        
        const hours = days * 24;
        const minutes = hours * 60;
        
        // If less than 1 hour, show in minutes
        if (hours < 1) {
            if (minutes < 1) {
                const seconds = minutes * 60;
                return seconds < 1 ? '<1s' : `${seconds.toFixed(0)}s`;
            }
            return `${minutes.toFixed(1)}m`;
        }
        
        // If less than 1 day, show in hours
        if (days < 1) {
            return `${hours.toFixed(1)}h`;
        }
        
        // Otherwise use standard time format
        return this.formatTime(days);
    }
    
    /**
     * Format rate (probes, kg, etc.) with appropriate time unit
     * Automatically selects best unit: per day, per hour, per second
     * @param {number} ratePerSecond - Rate in units per second
     * @param {string} unit - Unit name (e.g., "probes", "kg")
     * @returns {string} Formatted rate string
     */
    static formatRate(ratePerSecond, unit = '') {
        if (!ratePerSecond || ratePerSecond < 0 || isNaN(ratePerSecond) || !isFinite(ratePerSecond)) {
            return `0 ${unit}/day`.trim();
        }
        
        const SECONDS_PER_DAY = 86400;
        const SECONDS_PER_HOUR = 3600;
        
        const ratePerDay = ratePerSecond * SECONDS_PER_DAY;
        const ratePerHour = ratePerSecond * SECONDS_PER_HOUR;
        
        // Use per day if >= 0.1 per day
        if (ratePerDay >= 0.1) {
            if (ratePerDay >= 1000) {
                return `${this.formatNumber(ratePerDay)} ${unit}/day`.trim();
            }
            return `${ratePerDay.toFixed(2)} ${unit}/day`.trim();
        }
        
        // Use per hour if >= 0.1 per hour
        if (ratePerHour >= 0.1) {
            if (ratePerHour >= 1000) {
                return `${this.formatNumber(ratePerHour)} ${unit}/hour`.trim();
            }
            return `${ratePerHour.toFixed(2)} ${unit}/hour`.trim();
        }
        
        // Otherwise use per second
        if (ratePerSecond >= 1000) {
            return `${this.formatNumber(ratePerSecond)} ${unit}/s`.trim();
        }
        return `${ratePerSecond.toFixed(4)} ${unit}/s`.trim();
    }
    
    /**
     * Format number with appropriate SI prefix
     * @param {number} value - Number to format
     * @param {number} decimals - Number of decimal places (default: 2)
     * @returns {string} Formatted number string
     */
    static formatNumber(value, decimals = 2) {
        if (value === 0 || !value || isNaN(value) || !isFinite(value)) {
            return '0';
        }
        
        const absValue = Math.abs(value);
        const sign = value < 0 ? '-' : '';
        
        if (absValue >= 1e24) return sign + (absValue / 1e24).toFixed(decimals) + 'Y';
        if (absValue >= 1e21) return sign + (absValue / 1e21).toFixed(decimals) + 'Z';
        if (absValue >= 1e18) return sign + (absValue / 1e18).toFixed(decimals) + 'E';
        if (absValue >= 1e15) return sign + (absValue / 1e15).toFixed(decimals) + 'P';
        if (absValue >= 1e12) return sign + (absValue / 1e12).toFixed(decimals) + 'T';
        if (absValue >= 1e9) return sign + (absValue / 1e9).toFixed(decimals) + 'G';
        if (absValue >= 1e6) return sign + (absValue / 1e6).toFixed(decimals) + 'M';
        if (absValue >= 1e3) return sign + (absValue / 1e3).toFixed(decimals) + 'k';
        if (absValue >= 1) return sign + absValue.toFixed(decimals);
        if (absValue >= 0.01) return sign + absValue.toFixed(Math.max(decimals, 2));
        return sign + absValue.toExponential(2);
    }
    
    /**
     * Format mass/weight with kg units
     * @param {number} kg - Mass in kilograms
     * @returns {string} Formatted mass string
     */
    static formatMass(kg) {
        if (!kg || kg < 0 || isNaN(kg) || !isFinite(kg)) {
            return '0 kg';
        }
        
        if (kg >= 1e24) return (kg / 1e24).toFixed(2) + ' Ykg';
        if (kg >= 1e21) return (kg / 1e21).toFixed(2) + ' Zkg';
        if (kg >= 1e18) return (kg / 1e18).toFixed(2) + ' Ekg';
        if (kg >= 1e15) return (kg / 1e15).toFixed(2) + ' Pkg';
        if (kg >= 1e12) return (kg / 1e12).toFixed(2) + ' Tkg';
        if (kg >= 1e9) return (kg / 1e9).toFixed(2) + ' Gkg';
        if (kg >= 1e6) return (kg / 1e6).toFixed(2) + ' Mkg';
        if (kg >= 1e3) return (kg / 1e3).toFixed(2) + ' kg';
        return kg.toFixed(2) + ' g';
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FormatUtils;
}

