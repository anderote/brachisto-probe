/**
 * Game Engine Client
 * 
 * Main thread client for communicating with worker thread
 */

class GameEngineClient {
    constructor() {
        this.worker = null;
        this.stateManager = new StateManager();
        this.sessionId = null;
        this.isRunning = false;
        this.pendingActions = new Map();
        this.actionIdCounter = 0;
        this.timeSpeed = 1.0; // Default time speed
        this.autoSaveInterval = null;
        this.lastSaveTime = 0;
        this.autoSaveIntervalMs = 5000; // Auto-save every 5 seconds
    }
    
    /**
     * Initialize worker
     */
    async init() {
        try {
            this.worker = new Worker('/static/js/game/engine/engine.worker.js');
            
            this.worker.onmessage = (e) => this.handleWorkerMessage(e.data);
            this.worker.onerror = (error) => {
                console.error('Worker error:', error);
            };
            
            // Initialize worker
            this.worker.postMessage({
                type: 'init',
                data: {}
            });
            
            // Wait for init complete
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Worker init timeout'));
                }, 5000);
                
                const handler = (e) => {
                    if (e.data.type === 'initComplete') {
                        clearTimeout(timeout);
                        this.worker.removeEventListener('message', handler);
                        resolve();
                    } else if (e.data.type === 'error') {
                        clearTimeout(timeout);
                        this.worker.removeEventListener('message', handler);
                        reject(new Error(e.data.error));
                    }
                };
                
                this.worker.addEventListener('message', handler);
            });
        } catch (error) {
            console.error('Failed to initialize worker:', error);
            throw error;
        }
    }
    
    /**
     * Handle worker messages
     */
    handleWorkerMessage(data) {
        const { type } = data;
        
        switch (type) {
            case 'startComplete':
                this.isRunning = true;
                if (data.gameState) {
                    this.stateManager.updateState(data.gameState);
                }
                // Start auto-save after game starts
                this.startAutoSave();
                break;
                
            case 'stopComplete':
                this.isRunning = false;
                break;
                
            case 'stateUpdate':
                if (data.gameState) {
                    this.stateManager.updateState(data.gameState);
                }
                break;
                
            case 'actionComplete':
                const actionId = data.actionId;
                const resolver = this.pendingActions.get(actionId);
                if (resolver) {
                    this.pendingActions.delete(actionId);
                    // Propagate success/error properly from worker
                    // The worker now sends {success, error, result, gameState}
                    resolver.resolve({
                        success: data.success,
                        result: data.result,
                        error: data.error || (data.result && data.result.error) || null,
                        gameState: data.gameState
                    });
                }
                if (data.gameState) {
                    this.stateManager.updateState(data.gameState);
                }
                break;
                
            case 'actionError':
                const errorActionId = data.actionId;
                const errorResolver = this.pendingActions.get(errorActionId);
                if (errorResolver) {
                    this.pendingActions.delete(errorActionId);
                    errorResolver.reject(new Error(data.error));
                }
                break;
                
            case 'error':
                console.error('Worker error:', data.error);
                if (data.stack) {
                    console.error('Stack trace:', data.stack);
                }
                // Don't stop the engine on error - let it try to continue
                break;
        }
    }
    
    /**
     * Start game engine
     */
    async start(sessionId, config = {}, initialState = null) {
        this.sessionId = sessionId;
        
        if (!this.worker) {
            await this.init();
        }
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Start timeout'));
            }, 5000);
            
            const handler = (e) => {
                if (e.data.type === 'startComplete') {
                    clearTimeout(timeout);
                    this.worker.removeEventListener('message', handler);
                    resolve(e.data.gameState);
                } else if (e.data.type === 'error') {
                    clearTimeout(timeout);
                    this.worker.removeEventListener('message', handler);
                    reject(new Error(e.data.error));
                }
            };
            
            this.worker.addEventListener('message', handler);
            
            this.worker.postMessage({
                type: 'start',
                data: {
                    sessionId: sessionId,
                    config: config,
                    initialState: initialState
                }
            });
        });
    }
    
    /**
     * Load game from saved state
     */
    async loadFromState(sessionId, config = {}, initialState) {
        // Stop any existing game first
        if (this.isRunning) {
            this.stop();
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Start with the provided initial state
        return this.start(sessionId, config, initialState);
    }
    
    /**
     * Stop game engine
     */
    stop() {
        // Save before stopping
        this.saveGame();
        this.stopAutoSave();

        if (this.worker) {
            this.worker.postMessage({ type: 'stop' });
        }
        this.isRunning = false;
    }
    
    /**
     * Perform action
     */
    async performAction(actionType, actionData) {
        if (!this.worker || !this.isRunning) {
            throw new Error('Engine not running');
        }
        
        const actionId = this.generateActionId();
        
        return new Promise((resolve, reject) => {
            this.pendingActions.set(actionId, { resolve, reject });
            
            this.worker.postMessage({
                type: 'action',
                data: {
                    actionId: actionId,
                    actionType: actionType,
                    actionData: actionData
                }
            });
        });
    }
    
    /**
     * Set time speed
     */
    setTimeSpeed(speed) {
        this.timeSpeed = Math.max(0.1, Math.min(1000, speed || 1.0));
        if (this.worker) {
            this.worker.postMessage({
                type: 'setTimeSpeed',
                data: { speed: this.timeSpeed }
            });
        }
    }
    
    /**
     * Get current game state
     */
    getGameState() {
        return this.stateManager.getState();
    }
    
    /**
     * Generate unique action ID
     */
    generateActionId() {
        return 'action_' + Date.now() + '_' + (++this.actionIdCounter);
    }

    /**
     * Start auto-save interval
     */
    startAutoSave() {
        this.stopAutoSave(); // Clear any existing interval
        this.autoSaveInterval = setInterval(() => {
            this.saveGame();
        }, this.autoSaveIntervalMs);

        // Also save on page unload
        this._beforeUnloadHandler = () => {
            this.saveGameSync();
        };
        window.addEventListener('beforeunload', this._beforeUnloadHandler);
    }

    /**
     * Stop auto-save interval
     */
    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
        if (this._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._beforeUnloadHandler);
            this._beforeUnloadHandler = null;
        }
    }

    /**
     * Save current game state to IndexedDB
     */
    async saveGame() {
        if (!this.sessionId || !this.isRunning) return;

        const gameState = this.getGameState();
        if (!gameState) return;

        // Include galaxy state if star map visualization exists
        if (window.app?.starMapVisualization) {
            gameState.galaxy = window.app.starMapVisualization.getGalaxyState();
        }

        try {
            await gameStorage.saveGameState(this.sessionId, gameState);
            this.lastSaveTime = Date.now();
            // Store session ID for quick resume
            localStorage.setItem('brachisto-last-session', this.sessionId);
        } catch (error) {
            console.warn('Auto-save failed:', error);
        }
    }

    /**
     * Synchronous save for beforeunload (uses localStorage as fallback)
     */
    saveGameSync() {
        if (!this.sessionId || !this.isRunning) return;

        const gameState = this.getGameState();
        if (!gameState) return;

        // Include galaxy state if star map visualization exists
        if (window.app?.starMapVisualization) {
            gameState.galaxy = window.app.starMapVisualization.getGalaxyState();
        }

        try {
            // Store in localStorage as emergency backup
            const saveData = {
                sessionId: this.sessionId,
                gameState: gameState,
                timestamp: Date.now()
            };
            localStorage.setItem('brachisto-emergency-save', JSON.stringify(saveData));
        } catch (error) {
            console.warn('Emergency save failed:', error);
        }
    }

    /**
     * Check if there's a saved game to resume
     * @returns {Promise<{sessionId: string, gameState: object}|null>}
     */
    async checkForSavedGame() {
        try {
            // First check emergency save
            const emergencySave = localStorage.getItem('brachisto-emergency-save');
            if (emergencySave) {
                const saveData = JSON.parse(emergencySave);
                // Only use if less than 1 hour old
                if (Date.now() - saveData.timestamp < 3600000) {
                    console.log('Found emergency save from', new Date(saveData.timestamp).toLocaleString());
                    return saveData;
                }
            }

            // Check last session
            const lastSessionId = localStorage.getItem('brachisto-last-session');
            if (lastSessionId) {
                const savedState = await gameStorage.loadGameState(lastSessionId);
                if (savedState) {
                    return { sessionId: lastSessionId, gameState: savedState };
                }
            }

            return null;
        } catch (error) {
            console.warn('Failed to check for saved game:', error);
            return null;
        }
    }

    /**
     * Clear emergency save (call after successful load)
     */
    clearEmergencySave() {
        try {
            localStorage.removeItem('brachisto-emergency-save');
        } catch (e) {
            // Ignore
        }
    }

    /**
     * Resume from saved game state
     */
    async resumeGame(sessionId, savedState) {
        this.sessionId = sessionId;
        this.clearEmergencySave();
        return this.start(sessionId, {}, savedState);
    }
}

// Expose globally for access from other scripts (main thread only)
if (typeof window !== 'undefined') {
    window.gameEngine = new GameEngineClient();
} else if (typeof self !== 'undefined' && typeof self.document !== 'undefined') {
    self.gameEngine = new GameEngineClient();
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameEngineClient;
}

