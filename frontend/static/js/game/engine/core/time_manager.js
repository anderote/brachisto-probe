/**
 * Time Manager - Core time system
 * 
 * Fundamental unit: 1 day
 * At 60 fps, 1x speed: 1 day = 60 ticks
 * deltaTime = (1.0 / 60) * timeSpeed days per tick
 */
class TimeManager {
    constructor(initialTime = 0.0) {
        this.time = initialTime;           // Days elapsed
        this.tickCount = 0;                 // Tick count (renamed from 'tick' to avoid shadowing method)
        this.timeSpeed = 1.0;               // Speed multiplier
        this.TICKS_PER_DAY = 60;            // At 60fps, 1x speed
    }
    
    /**
     * Get delta time in days for current tick
     * @returns {number} Days per tick
     */
    getDeltaTime() {
        return (1.0 / this.TICKS_PER_DAY) * this.timeSpeed;
    }
    
    /**
     * Advance time by one tick
     */
    tick() {
        this.time += this.getDeltaTime();
        this.tickCount++;
    }
    
    /**
     * Set time speed multiplier
     * @param {number} speed - Speed multiplier (1.0 = normal, 2.0 = 2x, etc.)
     */
    setTimeSpeed(speed) {
        this.timeSpeed = Math.max(0.1, Math.min(1000, speed));
    }
    
    /**
     * Get current time in days
     * @returns {number}
     */
    getTime() {
        return this.time;
    }
    
    /**
     * Get current tick count
     * @returns {number}
     */
    getTick() {
        return this.tickCount;
    }
    
    /**
     * Reset time manager
     */
    reset() {
        this.time = 0.0;
        this.tickCount = 0;
        this.timeSpeed = 1.0;
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TimeManager;
}

