/** Time display and speed controls */
class TimeControls {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.gameState = null;
        this.timeSpeed = 1; // 1x, 2x, 4x, 10x, 100x
        this.isPaused = false;
        this.init();
    }

    init() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="time-display">
                <div class="time-label">Time</div>
                <div class="time-value" id="time-value">0:00</div>
            </div>
            <div class="speed-controls">
                <button class="speed-btn ${this.timeSpeed === 1 ? 'active' : ''}" data-speed="1">1x</button>
                <button class="speed-btn ${this.timeSpeed === 2 ? 'active' : ''}" data-speed="2">2x</button>
                <button class="speed-btn ${this.timeSpeed === 4 ? 'active' : ''}" data-speed="4">4x</button>
                <button class="speed-btn ${this.timeSpeed === 10 ? 'active' : ''}" data-speed="10">10x</button>
                <button class="speed-btn ${this.timeSpeed === 100 ? 'active' : ''}" data-speed="100">100x</button>
            </div>
        `;

        // Add event listeners for speed buttons
        this.container.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const speed = parseInt(e.target.dataset.speed);
                this.setSpeed(speed);
            });
        });
    }

    setSpeed(speed) {
        this.timeSpeed = speed;

        // Update active button
        this.container.querySelectorAll('.speed-btn').forEach(btn => {
            if (parseInt(btn.dataset.speed) === speed) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update game engine time speed (sends message to worker thread)
        if (typeof gameEngine !== 'undefined') {
            gameEngine.setTimeSpeed(speed);
        }

        // Also update StarMap time speed if available (galaxy view uses this)
        if (window.starMapVisualization?.setTimeSpeed) {
            window.starMapVisualization.setTimeSpeed(speed);
        }

        console.log('[TimeControls] Speed set to:', speed + 'x');
    }

    formatTime(days) {
        // Use FormatUtils for consistent time formatting
        return FormatUtils.formatTime(days);
    }

    update(gameState) {
        this.gameState = gameState;
        
        if (gameState && gameState.time !== undefined && gameState.time !== null) {
            const timeValue = document.getElementById('time-value');
            if (timeValue) {
                // Ensure time is a number (now in days)
                const time = typeof gameState.time === 'number' ? gameState.time : parseFloat(gameState.time) || 0;
                timeValue.textContent = this.formatTime(time);
            }
        }
    }

    pause() {
        this.isPaused = true;
        if (typeof gameEngine !== 'undefined') {
            gameEngine.stop();
        }
    }

    resume() {
        this.isPaused = false;
        if (typeof gameEngine !== 'undefined' && gameEngine.sessionId) {
            gameEngine.start(gameEngine.sessionId);
        }
    }

    togglePause() {
        if (this.isPaused) {
            this.resume();
        } else {
            this.pause();
        }
    }
}

