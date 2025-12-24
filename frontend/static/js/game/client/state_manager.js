/**
 * State Manager
 * 
 * Manages game state cache and event emission
 */

class StateManager {
    constructor() {
        this.currentState = null;
    }
    
    /**
     * Update state (silent cache - no events)
     * @param {Object} newState - New game state
     */
    updateState(newState) {
        this.currentState = newState;
        // No event dispatch - UI polls state via getState() at its own interval
    }
    
    /**
     * Get current state
     * @returns {Object|null}
     */
    getState() {
        return this.currentState;
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StateManager;
}

