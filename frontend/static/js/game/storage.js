/** IndexedDB storage for game state persistence */
class GameStorage {
    constructor() {
        this.dbName = 'brachisto-probe';
        this.dbVersion = 1;
        this.storeName = 'game-states';
        this.db = null;
    }
    
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                reject(new Error('Failed to open IndexedDB: ' + request.error));
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const objectStore = db.createObjectStore(this.storeName, { keyPath: 'sessionId' });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }
    
    async saveGameState(sessionId, gameState) {
        if (!this.db) {
            await this.init();
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const gameData = {
                sessionId: sessionId,
                gameState: gameState,
                timestamp: Date.now()
            };
            
            const request = store.put(gameData);
            
            request.onsuccess = () => {
                resolve();
            };
            
            request.onerror = () => {
                reject(new Error('Failed to save game state: ' + request.error));
            };
        });
    }
    
    async loadGameState(sessionId) {
        if (!this.db) {
            await this.init();
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(sessionId);
            
            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result.gameState);
                } else {
                    resolve(null);
                }
            };
            
            request.onerror = () => {
                reject(new Error('Failed to load game state: ' + request.error));
            };
        });
    }
    
    async listSavedGames() {
        if (!this.db) {
            await this.init();
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('timestamp');
            const request = index.getAll();
            
            request.onsuccess = () => {
                const games = request.result.map(item => ({
                    sessionId: item.sessionId,
                    timestamp: item.timestamp,
                    time: item.gameState.time || 0,
                    tick: item.gameState.tick || 0
                }));
                // Sort by timestamp descending (newest first)
                games.sort((a, b) => b.timestamp - a.timestamp);
                resolve(games);
            };
            
            request.onerror = () => {
                reject(new Error('Failed to list saved games: ' + request.error));
            };
        });
    }
    
    async deleteGameState(sessionId) {
        if (!this.db) {
            await this.init();
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(sessionId);
            
            request.onsuccess = () => {
                resolve();
            };
            
            request.onerror = () => {
                reject(new Error('Failed to delete game state: ' + request.error));
            };
        });
    }
    
    async clearAll() {
        if (!this.db) {
            await this.init();
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();
            
            request.onsuccess = () => {
                resolve();
            };
            
            request.onerror = () => {
                reject(new Error('Failed to clear game states: ' + request.error));
            };
        });
    }
}

// Global instance
const gameStorage = new GameStorage();

