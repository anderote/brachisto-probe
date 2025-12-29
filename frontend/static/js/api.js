/** API communication module */
class API {
    constructor() {
        this.baseURL = '';
        this.token = localStorage.getItem('auth_token');
    }

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('auth_token', token);
        } else {
            localStorage.removeItem('auth_token');
        }
    }

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            ...options,
            headers: {
                ...this.getHeaders(),
                ...(options.headers || {})
            }
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }
            
            return data;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    // Auth endpoints
    async register(username, email, password) {
        const data = await this.request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password })
        });
        if (data.token) {
            this.setToken(data.token);
        }
        return data;
    }

    async login(username, password) {
        const data = await this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        if (data.token) {
            this.setToken(data.token);
        }
        return data;
    }

    async logout() {
        await this.request('/api/auth/logout', { method: 'POST' });
        this.setToken(null);
    }

    async getCurrentUser() {
        return await this.request('/api/auth/me');
    }

    // Game endpoints
    async startGame(config = {}) {
        // Don't require auth token for guest mode
        const url = `${this.baseURL}/api/game/start`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ config })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        return data;
    }

    async getGameState(sessionId) {
        // Don't require auth token for guest mode
        const url = `${this.baseURL}/api/game/state/${sessionId}`;
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        return data;
    }

    async saveGameState(sessionId, gameState) {
        // Save game state to backend (for cloud sync)
        return await this.request('/api/game/save', {
            method: 'POST',
            body: JSON.stringify({
                session_id: sessionId,
                game_state: gameState
            })
        });
    }

    async gameAction(sessionId, actionType, actionData) {
        // Don't require auth token for guest mode
        const url = `${this.baseURL}/api/game/action`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: sessionId,
                action_type: actionType,
                action_data: actionData
            })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        return data;
    }

    async tickGame(sessionId, deltaTime = 1/60, numTicks = 1) {
        // Don't require auth token for guest mode
        const url = `${this.baseURL}/api/game/tick`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: sessionId,
                delta_time: deltaTime,
                num_ticks: numTicks
            })
        });
        
        // Check content type before parsing
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            throw new Error(`Expected JSON but got ${contentType}. Response: ${text.substring(0, 100)}`);
        }
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        return data;
    }

    // Score endpoints
    async getLeaderboard(limit = 10, offset = 0) {
        return await this.request(`/api/scores/leaderboard?limit=${limit}&offset=${offset}`);
    }

    async getUserScores(userId, limit = 10, offset = 0) {
        return await this.request(`/api/scores/user/${userId}?limit=${limit}&offset=${offset}`);
    }

    async getBuildSequence(sessionId) {
        return await this.request(`/api/scores/build/${sessionId}`);
    }

    async createScore(sessionId) {
        return await this.request('/api/scores/create', {
            method: 'POST',
            body: JSON.stringify({ session_id: sessionId })
        });
    }

    // Script endpoints
    async executeScript(sessionId, script) {
        return await this.request('/api/scripts/execute', {
            method: 'POST',
            body: JSON.stringify({
                session_id: sessionId,
                script: script
            })
        });
    }

    async validateScript(script) {
        return await this.request('/api/scripts/validate', {
            method: 'POST',
            body: JSON.stringify({ script })
        });
    }

    // Watch endpoints
    async startWatch(sessionId) {
        return await this.request('/api/watch/start', {
            method: 'POST',
            body: JSON.stringify({ session_id: sessionId })
        });
    }

    async getWatchState(sessionId) {
        return await this.request(`/api/watch/state/${sessionId}`);
    }

    // Trajectory endpoints
    /**
     * Compute a transfer trajectory between two zones using Lambert's problem
     * @param {string} fromZone - Departure zone ID
     * @param {string} toZone - Arrival zone ID
     * @param {number} gameTimeDays - Current game time in days
     * @param {number} numPoints - Number of trajectory points (default 50)
     * @param {Object} planetPositions - Optional: actual planet positions {zoneId: [x, y]}
     * @returns {Promise<Object>} Trajectory data with points in AU
     */
    async computeTrajectory(fromZone, toZone, gameTimeDays = 0, numPoints = 50, planetPositions = null) {
        const url = `${this.baseURL}/api/trajectory/compute`;
        const body = {
            from_zone: fromZone,
            to_zone: toZone,
            game_time_days: gameTimeDays,
            num_points: numPoints
        };
        if (planetPositions) {
            body.planet_positions = planetPositions;
        }
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        return data;
    }

    /**
     * Compute a gravity assist transfer trajectory
     * @param {string} fromZone - Departure zone ID
     * @param {string} toZone - Final destination zone ID
     * @param {string} viaZone - Flyby/gravity assist zone ID
     * @param {number} gameTimeDays - Current game time in days
     * @param {number} numPoints - Number of trajectory points (default 50)
     * @returns {Promise<Object>} Multi-leg trajectory data
     */
    async computeGravityAssistTrajectory(fromZone, toZone, viaZone, gameTimeDays = 0, numPoints = 50) {
        const url = `${this.baseURL}/api/trajectory/compute-gravity-assist`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from_zone: fromZone,
                to_zone: toZone,
                via_zone: viaZone,
                game_time_days: gameTimeDays,
                num_points: numPoints
            })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        return data;
    }

    /**
     * Compute multiple transfer trajectories in a single request
     * @param {Array<Object>} transfers - Array of {from_zone, to_zone, via_zone?}
     * @param {number} gameTimeDays - Current game time in days
     * @param {number} numPoints - Number of trajectory points per transfer
     * @param {Object} planetPositions - Optional: actual planet positions {zoneId: [x, y]}
     * @returns {Promise<Object>} Array of trajectory data with computation_time_ms
     */
    async computeTrajectoryBatch(transfers, gameTimeDays = 0, numPoints = 30, planetPositions = null) {
        const url = `${this.baseURL}/api/trajectory/batch`;
        const body = {
            transfers: transfers,
            game_time_days: gameTimeDays,
            num_points: numPoints
        };
        if (planetPositions) {
            body.planet_positions = planetPositions;
        }
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        return data;
    }

    /**
     * Get all available orbital zones
     * @returns {Promise<Object>} Zone data with orbital properties
     */
    async getOrbitalZones() {
        const url = `${this.baseURL}/api/trajectory/zones`;
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        return data;
    }
}

// Export singleton instance
const api = new API();
if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}

