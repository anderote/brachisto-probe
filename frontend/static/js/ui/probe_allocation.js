/** Probe allocation UI component */
class ProbeAllocationPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.gameState = null;
        this.init();
    }

    init() {
        this.container.innerHTML = `
            <div class="allocation-section">
                <div class="section-title">Probe Allocation</div>
                <div id="probe-allocation-content"></div>
            </div>
        `;
    }

    render() {
        if (!this.gameState) return;

        const content = document.getElementById('probe-allocation-content');
        if (!content) return;

        let html = '';

        // Probe production timer circle (above probe counts)
        html += '<div class="probe-production-timer-container">';
        html += '<svg class="probe-production-timer" viewBox="0 0 100 100">';
        html += '<circle class="probe-timer-bg" cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="4"/>';
        html += '<circle class="probe-timer-progress" cx="50" cy="50" r="45" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" transform="rotate(-90 50 50)"/>';
        html += '</svg>';
        html += '</div>';

        // Show probe counts
        html += '<div class="probe-counts">';
        Object.entries(this.gameState.probes || {}).forEach(([probeType, count]) => {
            html += `<div class="probe-count-item">
                <span class="probe-type">${this.getProbeName(probeType)}:</span>
                <span class="probe-count">${this.formatScientific(count)}</span>
            </div>`;
        });
        html += '</div>';

        // Allocation controls
        html += '<div class="allocation-controls">';
        
        // Harvest allocation
        html += '<div class="allocation-group">';
        html += '<div class="allocation-label">Harvest Allocation</div>';
        html += this.renderAllocationInput('harvest', 'probe', 'Von Neumann');
        html += this.renderAllocationInput('harvest', 'miner_probe', 'Miner');
        html += this.renderAllocationInput('harvest', 'energy_probe', 'Energy');
        html += '</div>';

        // Construction allocation
        html += '<div class="allocation-group">';
        html += '<div class="allocation-label">Construction Allocation</div>';
        html += this.renderAllocationInput('construct', 'probe', 'Von Neumann');
        html += this.renderAllocationInput('construct', 'construction_probe', 'Construction');
        html += '</div>';

        // Research allocation
        html += '<div class="allocation-group">';
        html += '<div class="allocation-label">Research Allocation</div>';
        html += this.renderAllocationInput('research', 'compute_probe', 'Compute');
        html += '</div>';

        // Dyson construction allocation
        html += '<div class="allocation-group">';
        html += '<div class="allocation-label">Dyson Construction Allocation</div>';
        html += this.renderAllocationInput('dyson', 'probe', 'Von Neumann');
        html += this.renderAllocationInput('dyson', 'construction_probe', 'Construction');
        html += '</div>';

        html += '</div>';

        html += '<button class="apply-allocation-button" onclick="probeAllocationPanel.applyAllocations()">Apply Allocations</button>';

        content.innerHTML = html;
    }

    renderAllocationInput(task, probeType, label) {
        const currentAllocation = this.gameState.probe_allocations?.[task]?.[probeType] || 0;
        const maxProbes = this.gameState.probes?.[probeType] || 0;

        return `
            <div class="allocation-input-group">
                <label>${label}:</label>
                <input type="number" 
                       class="allocation-input" 
                       data-task="${task}" 
                       data-probe-type="${probeType}"
                       min="0" 
                       max="${Math.floor(maxProbes)}" 
                       value="${Math.floor(currentAllocation)}"
                       step="1">
                <span class="allocation-max">/ ${this.formatScientific(maxProbes)}</span>
            </div>
        `;
    }

    getProbeName(probeType) {
        const names = {
            'probe': 'Von Neumann Probe',
            'miner_probe': 'Miner Probe',
            'compute_probe': 'Compute Probe',
            'energy_probe': 'Energy Probe',
            'construction_probe': 'Construction Probe'
        };
        return names[probeType] || probeType;
    }

    formatScientific(value) {
        // Format to 1 decimal place in scientific notation
        if (value === 0) return '0.0e+0';
        const exp = Math.floor(Math.log10(Math.abs(value)));
        const mantissa = (value / Math.pow(10, exp)).toFixed(1);
        return `${mantissa}e${exp >= 0 ? '+' : ''}${exp}`;
    }

    async applyAllocations() {
        const allocations = {
            harvest: {},
            construct: {},
            research: {},
            dyson: {}
        };

        // Collect allocation values
        document.querySelectorAll('.allocation-input').forEach(input => {
            const task = input.dataset.task;
            const probeType = input.dataset.probeType;
            const value = parseInt(input.value) || 0;
            
            if (allocations[task]) {
                allocations[task][probeType] = value;
            }
        });

        try {
            await gameEngine.allocateProbes(allocations);
        } catch (error) {
            console.error('Allocation failed:', error);
            alert(error.message || 'Allocation failed');
        }
    }

    update(gameState) {
        this.gameState = gameState;
        this.render();
        this.updateProbeTimer();
    }

    updateProbeTimer() {
        if (!this.gameState) return;
        
        // Get probe construction progress (in kg, each probe is 10 kg)
        const progress = this.gameState.probe_construction_progress || {};
        const PROBE_MASS = 10; // kg per probe
        
        // Find the probe type with the most progress (the one being built)
        let maxProgress = 0;
        let maxProgressType = null;
        
        Object.entries(progress).forEach(([probeType, kgProgress]) => {
            if (kgProgress > maxProgress) {
                maxProgress = kgProgress;
                maxProgressType = probeType;
            }
        });
        
        // Calculate progress percentage (0-1) for the next probe
        const progressPercent = maxProgress / PROBE_MASS;
        
        // Update the SVG circle stroke-dasharray to show progress
        const progressCircle = document.querySelector('.probe-timer-progress');
        if (progressCircle) {
            const circumference = 2 * Math.PI * 45; // radius is 45
            const offset = circumference * (1 - progressPercent);
            progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
            progressCircle.style.strokeDashoffset = offset;
        }
    }
}

