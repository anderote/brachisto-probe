/** Leaderboard UI component */
class Leaderboard {
    constructor() {
        this.modal = document.getElementById('leaderboard-modal');
        this.content = document.getElementById('leaderboard-content');
        this.closeBtn = document.getElementById('close-leaderboard');
        this.init();
    }

    init() {
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.hide());
        }

        // Close on outside click
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.hide();
                }
            });
        }
    }

    async show() {
        if (!this.modal) return;

        this.modal.style.display = 'flex';
        await this.loadLeaderboard();
    }

    hide() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }

    async loadLeaderboard(limit = 20) {
        if (!this.content) return;

        try {
            const data = await api.getLeaderboard(limit);
            this.render(data.scores);
        } catch (error) {
            console.error('Failed to load leaderboard:', error);
            this.content.innerHTML = '<div>Failed to load leaderboard</div>';
        }
    }

    render(scores) {
        if (!this.content) return;

        if (!scores || scores.length === 0) {
            this.content.innerHTML = '<div>No scores yet</div>';
            return;
        }

        let html = '<table style="width: 100%; border-collapse: collapse;">';
        html += '<thead><tr>';
        html += '<th style="padding: 10px; text-align: left; border-bottom: 1px solid #555;">Rank</th>';
        html += '<th style="padding: 10px; text-align: left; border-bottom: 1px solid #555;">Player</th>';
        html += '<th style="padding: 10px; text-align: right; border-bottom: 1px solid #555;">Time</th>';
        html += '<th style="padding: 10px; text-align: right; border-bottom: 1px solid #555;">Metal Left</th>';
        html += '<th style="padding: 10px; text-align: right; border-bottom: 1px solid #555;">Score</th>';
        html += '</tr></thead><tbody>';

        scores.forEach((score, index) => {
            html += '<tr style="border-bottom: 1px solid #333;">';
            html += `<td style="padding: 10px;">${index + 1}</td>`;
            html += `<td style="padding: 10px;">${score.username || 'Unknown'}</td>`;
            html += `<td style="padding: 10px; text-align: right;">${this.formatTime(score.completion_time)}</td>`;
            html += `<td style="padding: 10px; text-align: right;">${this.formatNumber(score.remaining_metal)}</td>`;
            html += `<td style="padding: 10px; text-align: right;">${this.formatNumber(score.score_value)}</td>`;
            html += '</tr>';
        });

        html += '</tbody></table>';
        this.content.innerHTML = html;
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    formatNumber(value) {
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

