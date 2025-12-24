/**
 * Web Worker for Game Engine
 * 
 * Runs game tick loop in background thread
 */

// Import dependencies using importScripts
importScripts(
    '/static/js/game/config.js',             // Config must load first
    '/static/js/game/data_loader.js',
    '/static/js/game/skill_definitions.js',  // Skill definitions (load before TechTree)
    '/static/js/game/engine/core/time_manager.js',
    '/static/js/game/engine/core/game_state.js',
    '/static/js/game/engine/tech_tree.js',   // TechTree (new unified research/skills system)
    '/static/js/game/engine/calculations/skills_calculator.js',
    '/static/js/game/engine/calculations/orbital_mechanics.js',
    '/static/js/game/engine/calculations/production_calculator.js',
    '/static/js/game/engine/calculations/energy_calculator.js',
    '/static/js/game/engine/calculations/research_calculator.js',
    '/static/js/game/engine/calculations/composite_skills.js',
    '/static/js/game/engine/systems/probe_system.js',
    '/static/js/game/engine/systems/structure_system.js',
    '/static/js/game/engine/systems/mining_system.js',
    '/static/js/game/engine/systems/dyson_system.js',
    '/static/js/game/engine/systems/transfer_system.js',
    '/static/js/game/engine/systems/recycling_system.js',
    '/static/js/game/engine/engine.js'
);

let engine = null;
let isRunning = false;
let tickInterval = null;
let uiUpdateCounter = 0;
const UI_UPDATE_INTERVAL = 2;  // Update UI every 2 ticks (30fps)
let dataLoader = null;

// Message handler
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    switch (type) {
        case 'init':
            handleInit(data);
            break;
            
        case 'start':
            handleStart(data);
            break;
            
        case 'stop':
            handleStop();
            break;
            
        case 'action':
            handleAction(data);
            break;
            
        case 'getState':
            handleGetState();
            break;
            
        case 'setTimeSpeed':
            if (engine) {
                engine.timeManager.setTimeSpeed(Math.max(0.1, Math.min(1000, data.speed || 1)));
            }
            break;
            
        default:
            console.warn('Unknown message type:', type);
    }
};

async function handleInit(data) {
    try {
        // Initialize data loader
        dataLoader = new GameDataLoader();
        await dataLoader.loadAll();
        
        self.postMessage({
            type: 'initComplete',
            success: true
        });
    } catch (error) {
        console.error('Worker init error:', error);
        self.postMessage({
            type: 'error',
            error: error.message,
            stack: error.stack
        });
    }
}

async function handleStart(data) {
    try {
        if (!dataLoader) {
            throw new Error('Data loader not initialized. Call init first.');
        }
        
        const config = data.config || {};
        let initialState;
        
        if (data.initialState) {
            // Load from existing state
            initialState = data.initialState;
        } else {
            // Create new state
            initialState = createInitialGameState(config);
        }
        
        // Create engine
        engine = new GameEngine(initialState, dataLoader, config);
        await engine.initialize();
        
        isRunning = true;
        uiUpdateCounter = 0;
        
        // Calculate initial derived values before sending state
        // This ensures UI has correct probe counts and economic data from the start
        if (engine && engine.initialized) {
            const skills = engine.state.skills || {};
            const dysonPower = { economy: 0, intelligence: 0 };
            const energyBalance = { production: 0, consumption: 0, net: 0 };
            engine.calculateDerivedValues(skills, dysonPower, energyBalance);
        }
        
        // Start tick loop (60fps)
        const tickIntervalMs = 1000 / 60;  // ~16.67ms
        tickInterval = setInterval(() => tick(), tickIntervalMs);
        
        // Send initial state (now with derived values)
        const gameState = engine.getState();
        self.postMessage({
            type: 'startComplete',
            success: true,
            gameState: gameState
        });
    } catch (error) {
        console.error('Worker start error:', error);
        self.postMessage({
            type: 'error',
            error: error.message,
            stack: error.stack
        });
    }
}

function handleStop() {
    isRunning = false;
    if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
    }
    
    // Send final state
    if (engine) {
        const gameState = engine.getState();
        self.postMessage({
            type: 'stateUpdate',
            gameState: gameState
        });
    }
    
    self.postMessage({
        type: 'stopComplete'
    });
}

function handleAction(data) {
    if (!engine) {
        self.postMessage({
            type: 'actionError',
            actionId: data.actionId,
            error: 'Engine not initialized'
        });
        return;
    }
    
    try {
        const { actionId, actionType, actionData } = data;
        const result = engine.performAction(actionType, actionData);
        const gameState = engine.getState();
        
        self.postMessage({
            type: 'actionComplete',
            actionId: actionId,
            success: true,
            result: result,
            gameState: gameState
        });
    } catch (error) {
        self.postMessage({
            type: 'actionError',
            actionId: data.actionId,
            error: error.message,
            stack: error.stack
        });
    }
}

function handleGetState() {
    if (!engine) {
        self.postMessage({
            type: 'stateUpdate',
            gameState: null
        });
        return;
    }
    
    const gameState = engine.getState();
    self.postMessage({
        type: 'stateUpdate',
        gameState: gameState
    });
}

function tick() {
    if (!isRunning || !engine) {
        return;
    }
    
    try {
        // Execute game tick
        engine.tick();
        
        // Check for invalid time values that might indicate a problem
        const currentTime = engine.timeManager ? engine.timeManager.getTime() : (engine.state ? engine.state.time : null);
        if (currentTime !== null && currentTime !== undefined) {
            if (isNaN(currentTime) || !isFinite(currentTime)) {
                console.error('Worker: Invalid time value detected:', currentTime);
                self.postMessage({
                    type: 'error',
                    error: `Invalid time value: ${currentTime}`,
                    stack: new Error().stack
                });
                // Don't stop - let it continue but log the error
            }
        }
        
        // Update UI every N ticks
        uiUpdateCounter++;
        if (uiUpdateCounter >= UI_UPDATE_INTERVAL) {
            uiUpdateCounter = 0;
            const gameState = engine.getState();
            if (gameState) {
                // Instrument serialization time
                const serializationStart = performance.now();
                const message = {
                    type: 'stateUpdate',
                    gameState: gameState
                };
                const serializationTime = performance.now() - serializationStart;
                
                // Record serialization time if profiler available
                if (typeof self !== 'undefined' && self.performanceProfiler) {
                    self.performanceProfiler.recordWorkerSerializationTime(serializationTime);
                }
                
                self.postMessage(message);
            }
        }
    } catch (error) {
        console.error('Worker tick error:', error);
        self.postMessage({
            type: 'error',
            error: error.message,
            stack: error.stack
        });
        // Don't stop isRunning - let it try to continue
    }
}

