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

        // Update game engine time speed
        if (typeof gameEngine !== 'undefined') {
            gameEngine.timeSpeed = speed;
        }
    }

    formatTime(seconds) {
        // Constants
        const SECONDS_PER_MINUTE = 60;
        const SECONDS_PER_HOUR = 3600;
        const SECONDS_PER_DAY = 86400;
        const SECONDS_PER_MONTH = 2592000; // ~30 days
        const SECONDS_PER_YEAR = 31536000; // ~365 days
        
        // Handle invalid input
        if (!seconds || seconds < 0 || isNaN(seconds)) {
            return '0:00';
        }
        
        const totalSeconds = Math.floor(seconds);
        
        // Calculate years
        const years = Math.floor(totalSeconds / SECONDS_PER_YEAR);
        const remainingAfterYears = totalSeconds % SECONDS_PER_YEAR;
        
        // Calculate months
        const months = Math.floor(remainingAfterYears / SECONDS_PER_MONTH);
        const remainingAfterMonths = remainingAfterYears % SECONDS_PER_MONTH;
        
        // Calculate days
        const days = Math.floor(remainingAfterMonths / SECONDS_PER_DAY);
        const remainingAfterDays = remainingAfterMonths % SECONDS_PER_DAY;
        
        // Calculate hours, minutes, seconds
        const hours = Math.floor(remainingAfterDays / SECONDS_PER_HOUR);
        const mins = Math.floor((remainingAfterDays % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
        const secs = remainingAfterDays % SECONDS_PER_MINUTE;
        
        // Build formatted string based on what's needed
        const parts = [];
        
        if (years > 0) {
            parts.push(`${years}y`);
        }
        if (months > 0 || years > 0) {
            parts.push(`${months}mo`);
        }
        if (days > 0 || months > 0 || years > 0) {
            parts.push(`${days}d`);
        }
        if (hours > 0 || days > 0 || months > 0 || years > 0) {
            parts.push(`${hours.toString().padStart(2, '0')}h`);
        }
        parts.push(`${mins.toString().padStart(2, '0')}m`);
        parts.push(`${secs.toString().padStart(2, '0')}s`);
        
        // Return appropriate format based on time length
        if (years > 0 || months > 0 || days > 0) {
            return parts.join(' ');
        } else if (hours > 0) {
            return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    }

    update(gameState) {
        this.gameState = gameState;
        
        if (gameState && gameState.time !== undefined && gameState.time !== null) {
            const timeValue = document.getElementById('time-value');
            if (timeValue) {
                // Ensure time is a number
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

