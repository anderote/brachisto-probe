/**
 * Universe Panel UI
 *
 * Provides UI controls for Phase 3 (Universe scale) gameplay:
 * - Supercluster info display
 * - Intergalactic transfer initiation
 * - Colony ship tracking
 * - Drive upgrade interface
 */
class UniversePanel {
    constructor(universeSystem, universeMapVisualization) {
        this.universeSystem = universeSystem;
        this.visualization = universeMapVisualization;

        this.panelElement = null;
        this.transferPanelElement = null;
        this.infoPanelElement = null;

        this.selectedSupercluster = null;
        this.isVisible = false;
    }

    /**
     * Initialize the panel
     */
    init() {
        this.createInfoPanel();
        this.createTransferPanel();
        this.setupEventListeners();

        console.log('[UniversePanel] Initialized');
    }

    /**
     * Create supercluster info panel
     */
    createInfoPanel() {
        this.infoPanelElement = document.createElement('div');
        this.infoPanelElement.id = 'universe-info-panel';
        this.infoPanelElement.style.cssText = `
            position: fixed;
            top: 70px;
            right: 20px;
            width: 280px;
            background: rgba(0,10,20,0.95);
            border: 1px solid rgba(0,255,136,0.3);
            border-radius: 8px;
            padding: 15px;
            font-family: 'Space Mono', monospace;
            color: #88aacc;
            z-index: 1100;
            display: none;
        `;

        this.infoPanelElement.innerHTML = `
            <div class="info-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="margin: 0; color: #00ff88; font-size: 14px;" id="info-sc-name">Supercluster</h3>
                <button id="info-close-btn" style="background: none; border: none; color: #666; cursor: pointer; font-size: 18px;">&times;</button>
            </div>

            <div class="info-body">
                <div class="info-row" style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="opacity: 0.7;">Type:</span>
                    <span id="info-sc-type">Supercluster</span>
                </div>
                <div class="info-row" style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="opacity: 0.7;">Distance:</span>
                    <span id="info-sc-distance">0 Mpc</span>
                </div>
                <div class="info-row" style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="opacity: 0.7;">Galaxies:</span>
                    <span id="info-sc-galaxies">100,000</span>
                </div>
                <div class="info-row" style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="opacity: 0.7;">Status:</span>
                    <span id="info-sc-status" style="color: #ffaa44;">Undiscovered</span>
                </div>

                <div id="info-colonized-section" style="display: none; margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <div class="info-row" style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="opacity: 0.7;">Colonized Galaxies:</span>
                        <span id="info-sc-colonized-galaxies">0</span>
                    </div>
                    <div class="info-row" style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="opacity: 0.7;">Probes:</span>
                        <span id="info-sc-probes">0</span>
                    </div>
                    <div class="info-row" style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="opacity: 0.7;">Dyson Power:</span>
                        <span id="info-sc-power">0 W</span>
                    </div>
                </div>

                <div id="info-transfer-section" style="margin-top: 15px;">
                    <button id="info-transfer-btn" style="
                        width: 100%;
                        padding: 10px;
                        background: linear-gradient(180deg, rgba(0,100,50,0.8) 0%, rgba(0,60,30,0.8) 100%);
                        border: 1px solid #00ff88;
                        border-radius: 4px;
                        color: #00ff88;
                        font-family: 'Space Mono', monospace;
                        font-size: 12px;
                        cursor: pointer;
                        transition: all 0.2s;
                    ">SEND COLONY FLEET</button>
                    <div id="info-travel-time" style="text-align: center; font-size: 11px; opacity: 0.7; margin-top: 8px;">
                        Travel time: --
                    </div>
                </div>
            </div>

            <div class="info-description" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 11px; opacity: 0.6; line-height: 1.4;">
                <p id="info-sc-description">Description here.</p>
            </div>
        `;

        const container = document.getElementById('universe-map-container');
        if (container) {
            container.appendChild(this.infoPanelElement);
        } else {
            document.body.appendChild(this.infoPanelElement);
        }
    }

    /**
     * Create transfer configuration panel
     */
    createTransferPanel() {
        this.transferPanelElement = document.createElement('div');
        this.transferPanelElement.id = 'universe-transfer-panel';
        this.transferPanelElement.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 400px;
            background: rgba(0,10,20,0.98);
            border: 2px solid rgba(0,255,136,0.5);
            border-radius: 12px;
            padding: 25px;
            font-family: 'Space Mono', monospace;
            color: #88aacc;
            z-index: 1200;
            display: none;
            box-shadow: 0 0 50px rgba(0,255,136,0.2);
        `;

        this.transferPanelElement.innerHTML = `
            <div class="transfer-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #00ff88; font-size: 16px;">INTERGALACTIC TRANSFER</h2>
                <button id="transfer-close-btn" style="background: none; border: none; color: #666; cursor: pointer; font-size: 24px;">&times;</button>
            </div>

            <div class="transfer-route" style="display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 25px;">
                <div style="text-align: center;">
                    <div style="font-size: 10px; opacity: 0.6;">FROM</div>
                    <div style="font-size: 14px; color: #00ff88;" id="transfer-from">Laniakea</div>
                </div>
                <div style="font-size: 24px; color: #446688;">&rarr;</div>
                <div style="text-align: center;">
                    <div style="font-size: 10px; opacity: 0.6;">TO</div>
                    <div style="font-size: 14px; color: #ffaa44;" id="transfer-to">Target</div>
                </div>
            </div>

            <div class="transfer-config" style="margin-bottom: 20px;">
                <div style="margin-bottom: 15px;">
                    <label style="display: block; font-size: 11px; opacity: 0.7; margin-bottom: 5px;">PROBE COUNT</label>
                    <input type="range" id="transfer-probe-slider" min="12" max="18" value="15" style="width: 100%;">
                    <div style="display: flex; justify-content: space-between; font-size: 11px;">
                        <span>10^12</span>
                        <span id="transfer-probe-count" style="color: #00ff88;">10^15</span>
                        <span>10^18</span>
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; font-size: 11px; opacity: 0.7; margin-bottom: 5px;">DRIVE SYSTEM</label>
                    <select id="transfer-drive-select" style="
                        width: 100%;
                        padding: 8px;
                        background: rgba(0,20,40,0.8);
                        border: 1px solid #446688;
                        border-radius: 4px;
                        color: #88aacc;
                        font-family: 'Space Mono', monospace;
                    ">
                        <option value="19">Void Skipper (100c)</option>
                        <option value="20">Cosmic String Drive (10,000c)</option>
                        <option value="21">Inflation Drive (1,000,000c)</option>
                        <option value="22">Big Rip Engine (Instant)</option>
                    </select>
                </div>
            </div>

            <div class="transfer-info" style="background: rgba(0,20,40,0.5); padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="opacity: 0.7;">Distance:</span>
                    <span id="transfer-distance">0 Mpc</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="opacity: 0.7;">Travel Time:</span>
                    <span id="transfer-time" style="color: #ffaa44;">0 years</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="opacity: 0.7;">Arrival Year:</span>
                    <span id="transfer-arrival">Year 0</span>
                </div>
            </div>

            <div class="transfer-actions" style="display: flex; gap: 15px;">
                <button id="transfer-cancel-btn" style="
                    flex: 1;
                    padding: 12px;
                    background: rgba(100,50,50,0.5);
                    border: 1px solid #884444;
                    border-radius: 4px;
                    color: #cc8888;
                    font-family: 'Space Mono', monospace;
                    cursor: pointer;
                ">CANCEL</button>
                <button id="transfer-launch-btn" style="
                    flex: 2;
                    padding: 12px;
                    background: linear-gradient(180deg, rgba(0,100,50,0.8) 0%, rgba(0,60,30,0.8) 100%);
                    border: 1px solid #00ff88;
                    border-radius: 4px;
                    color: #00ff88;
                    font-family: 'Space Mono', monospace;
                    font-size: 14px;
                    cursor: pointer;
                ">LAUNCH FLEET</button>
            </div>
        `;

        const container = document.getElementById('universe-map-container');
        if (container) {
            container.appendChild(this.transferPanelElement);
        } else {
            document.body.appendChild(this.transferPanelElement);
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Info panel close
        const infoCloseBtn = document.getElementById('info-close-btn');
        if (infoCloseBtn) {
            infoCloseBtn.addEventListener('click', () => this.hideInfoPanel());
        }

        // Transfer button in info panel
        const transferBtn = document.getElementById('info-transfer-btn');
        if (transferBtn) {
            transferBtn.addEventListener('click', () => this.showTransferPanel());
        }

        // Transfer panel close buttons
        const transferCloseBtn = document.getElementById('transfer-close-btn');
        const transferCancelBtn = document.getElementById('transfer-cancel-btn');
        if (transferCloseBtn) {
            transferCloseBtn.addEventListener('click', () => this.hideTransferPanel());
        }
        if (transferCancelBtn) {
            transferCancelBtn.addEventListener('click', () => this.hideTransferPanel());
        }

        // Probe slider
        const probeSlider = document.getElementById('transfer-probe-slider');
        if (probeSlider) {
            probeSlider.addEventListener('input', (e) => {
                const exp = parseInt(e.target.value);
                document.getElementById('transfer-probe-count').textContent = `10^${exp}`;
            });
        }

        // Drive select
        const driveSelect = document.getElementById('transfer-drive-select');
        if (driveSelect) {
            driveSelect.addEventListener('change', () => this.updateTransferInfo());
        }

        // Launch button
        const launchBtn = document.getElementById('transfer-launch-btn');
        if (launchBtn) {
            launchBtn.addEventListener('click', () => this.executeTransfer());
        }

        // Listen for supercluster selection from visualization
        window.addEventListener('supercluster-selected', (e) => {
            this.showInfoPanel(e.detail.superclusterId);
        });
    }

    /**
     * Show info panel for a supercluster
     */
    showInfoPanel(superclusterId) {
        const scData = this.universeSystem.getSuperclusterData(superclusterId);
        if (!scData) return;

        this.selectedSupercluster = superclusterId;

        // Update panel content
        document.getElementById('info-sc-name').textContent = scData.name;
        document.getElementById('info-sc-type').textContent = this.formatType(scData.type);
        document.getElementById('info-sc-galaxies').textContent = this.formatNumber(scData.galaxy_count);
        document.getElementById('info-sc-description').textContent = scData.description || 'No description available.';

        // Calculate distance from Laniakea
        const distance = this.calculateDistance(scData);
        document.getElementById('info-sc-distance').textContent = `${distance.toFixed(1)} Mpc`;

        // Status and colonized info
        const isColonized = this.universeSystem.isColonized(superclusterId);
        const statusEl = document.getElementById('info-sc-status');
        const colonizedSection = document.getElementById('info-colonized-section');
        const transferBtn = document.getElementById('info-transfer-btn');

        if (isColonized) {
            statusEl.textContent = 'Colonized';
            statusEl.style.color = '#00ff88';
            colonizedSection.style.display = 'block';

            const state = this.universeSystem.getSuperclusterState(superclusterId);
            if (state) {
                document.getElementById('info-sc-colonized-galaxies').textContent =
                    this.formatNumber(state.galaxies_colonized);
                document.getElementById('info-sc-probes').textContent =
                    state.total_probes.toExponential(2);
                document.getElementById('info-sc-power').textContent =
                    state.total_dyson_power.toExponential(2) + ' W';
            }

            transferBtn.textContent = 'ALREADY COLONIZED';
            transferBtn.disabled = true;
            transferBtn.style.opacity = '0.5';
        } else {
            statusEl.textContent = 'Uncolonized';
            statusEl.style.color = '#ffaa44';
            colonizedSection.style.display = 'none';

            transferBtn.textContent = 'SEND COLONY FLEET';
            transferBtn.disabled = false;
            transferBtn.style.opacity = '1';
        }

        // Update travel time estimate
        if (!isColonized && superclusterId !== 'laniakea') {
            const travelTime = this.universeSystem.calculateIntergalacticTravelTime('laniakea', superclusterId);
            document.getElementById('info-travel-time').textContent =
                `Travel time: ${this.formatTravelTime(travelTime)}`;
        } else {
            document.getElementById('info-travel-time').textContent = '';
        }

        // Show panel
        this.infoPanelElement.style.display = 'block';
        this.isVisible = true;
    }

    /**
     * Hide info panel
     */
    hideInfoPanel() {
        this.infoPanelElement.style.display = 'none';
        this.isVisible = false;
    }

    /**
     * Show transfer configuration panel
     */
    showTransferPanel() {
        if (!this.selectedSupercluster || this.selectedSupercluster === 'laniakea') return;

        const scData = this.universeSystem.getSuperclusterData(this.selectedSupercluster);
        if (!scData) return;

        // Update route display
        document.getElementById('transfer-from').textContent = 'Laniakea';
        document.getElementById('transfer-to').textContent = scData.name;

        // Update drive options based on available tiers
        const driveSelect = document.getElementById('transfer-drive-select');
        driveSelect.innerHTML = '';
        const drives = this.universeSystem.getAvailableDrives();
        for (const drive of drives) {
            const option = document.createElement('option');
            option.value = drive.tier;
            const speedText = drive.physics?.instantaneous ? 'Instant' : `${drive.max_velocity_c.toLocaleString()}c`;
            option.textContent = `${drive.name} (${speedText})`;
            driveSelect.appendChild(option);
        }

        // Update info
        this.updateTransferInfo();

        // Show panel
        this.transferPanelElement.style.display = 'block';
        this.hideInfoPanel();
    }

    /**
     * Hide transfer panel
     */
    hideTransferPanel() {
        this.transferPanelElement.style.display = 'none';
    }

    /**
     * Update transfer info based on current settings
     */
    updateTransferInfo() {
        if (!this.selectedSupercluster) return;

        const scData = this.universeSystem.getSuperclusterData(this.selectedSupercluster);
        if (!scData) return;

        const distance = this.calculateDistance(scData);
        document.getElementById('transfer-distance').textContent = `${distance.toFixed(1)} Mpc`;

        // Get selected drive
        const driveSelect = document.getElementById('transfer-drive-select');
        const driveTier = parseInt(driveSelect.value);

        // Temporarily update drive tier for calculation
        const originalTier = this.universeSystem.intergalacticDriveTier;
        this.universeSystem.intergalacticDriveTier = driveTier;

        const travelTime = this.universeSystem.calculateIntergalacticTravelTime('laniakea', this.selectedSupercluster);

        this.universeSystem.intergalacticDriveTier = originalTier;

        document.getElementById('transfer-time').textContent = this.formatTravelTime(travelTime);
        document.getElementById('transfer-arrival').textContent =
            `Year ${Math.floor(this.universeSystem.universeTime + travelTime).toLocaleString()}`;
    }

    /**
     * Execute the transfer
     */
    executeTransfer() {
        if (!this.selectedSupercluster) return;

        const probeExp = parseInt(document.getElementById('transfer-probe-slider').value);
        const probeCount = Math.pow(10, probeExp);

        const driveSelect = document.getElementById('transfer-drive-select');
        const driveTier = parseInt(driveSelect.value);

        // Update drive tier
        this.universeSystem.upgradeDrive(driveTier);

        // Initiate transfer
        const transfer = this.universeSystem.initiateIntergalacticTransfer(
            this.selectedSupercluster,
            probeCount
        );

        if (transfer) {
            console.log('[UniversePanel] Transfer initiated:', transfer);

            // Show confirmation
            this.showNotification(`Colony fleet launched to ${this.universeSystem.getSuperclusterData(this.selectedSupercluster).name}!`);

            // Hide panel
            this.hideTransferPanel();

            // Dispatch event for visualization update
            window.dispatchEvent(new CustomEvent('intergalactic-transfer-started', {
                detail: { transfer }
            }));
        } else {
            this.showNotification('Transfer failed - insufficient resources', 'error');
        }
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            padding: 15px 30px;
            background: ${type === 'error' ? 'rgba(100,30,30,0.95)' : 'rgba(0,50,30,0.95)'};
            border: 1px solid ${type === 'error' ? '#ff4444' : '#00ff88'};
            border-radius: 8px;
            color: ${type === 'error' ? '#ff8888' : '#00ff88'};
            font-family: 'Space Mono', monospace;
            font-size: 14px;
            z-index: 2000;
            animation: fadeInOut 3s ease-in-out;
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Utility methods

    calculateDistance(scData) {
        if (!scData.position_mpc) return 0;
        const pos = scData.position_mpc;
        return Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    }

    formatType(type) {
        const types = {
            'home_supercluster': 'Home Supercluster',
            'supercluster': 'Supercluster',
            'galaxy_cluster': 'Galaxy Cluster',
            'gravitational_anomaly': 'Gravitational Anomaly',
            'cosmic_structure': 'Cosmic Structure',
            'cosmic_void': 'Cosmic Void'
        };
        return types[type] || type;
    }

    formatNumber(num) {
        if (!num) return '0';
        if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
        if (num >= 1e3) return `${(num / 1e3).toFixed(1)}k`;
        return num.toLocaleString();
    }

    formatTravelTime(years) {
        if (years === 0) return 'Instant';
        if (years === Infinity) return 'Impossible';
        if (years < 1) return `${Math.round(years * 365)} days`;
        if (years < 1000) return `${years.toFixed(1)} years`;
        if (years < 1e6) return `${(years / 1000).toFixed(1)}k years`;
        return `${(years / 1e6).toFixed(2)}M years`;
    }

    /**
     * Cleanup
     */
    dispose() {
        if (this.infoPanelElement) {
            this.infoPanelElement.remove();
        }
        if (this.transferPanelElement) {
            this.transferPanelElement.remove();
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.UniversePanel = UniversePanel;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UniversePanel;
}
