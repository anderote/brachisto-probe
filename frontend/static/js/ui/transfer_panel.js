/** Transfer Panel - Display and manage all transfers */
class TransferPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.gameState = null;
        this.orbitalZones = null;
        this.transferHistory = []; // All transfers (completed and active)
        this.init();
        this.loadData();
    }

    async loadData() {
        try {
            const zonesResponse = await fetch('/game_data/orbital_mechanics.json');
            const zonesData = await zonesResponse.json();
            this.orbitalZones = zonesData.orbital_zones;
            this.render();
        } catch (error) {
            console.error('Failed to load orbital zones:', error);
        }
    }

    init() {
        if (!this.container) return;
        
        // Listen for transfer events
        document.addEventListener('transferCreated', (e) => {
            this.addTransfer(e.detail);
        });
    }

    addTransfer(transfer) {
        // Add to history
        const historyItem = {
            id: Date.now() + Math.random(), // Unique ID
            from: transfer.from,
            to: transfer.to,
            type: transfer.type,
            count: transfer.count || 0,
            rate: transfer.rate || 0,
            status: transfer.type === 'one-time' ? 'in-progress' : 'active',
            startTime: Date.now(),
            completedTime: null
        };
        
        this.transferHistory.push(historyItem);
        this.render();
    }

    getZoneName(zoneId) {
        if (!this.orbitalZones) return zoneId;
        const zone = this.orbitalZones.find(z => z.id === zoneId);
        return zone ? zone.name.replace(/\s+Orbit\s*$/i, '') : zoneId;
    }

    formatNumber(num) {
        return num.toLocaleString('en-US');
    }

    render() {
        if (!this.container) return;

        let html = '<div class="transfer-panel-content">';
        html += '<div class="transfer-panel-header">';
        html += '<h3>Transfer History</h3>';
        html += '</div>';

        if (this.transferHistory.length === 0) {
            html += '<div class="transfer-panel-empty">No transfers yet. Create transfers by selecting two zones.</div>';
        } else {
            html += '<div class="transfer-list">';
            
            // Show active continuous transfers first
            const activeTransfers = this.transferHistory.filter(t => t.status === 'active');
            const completedTransfers = this.transferHistory.filter(t => t.status === 'completed');
            const inProgressTransfers = this.transferHistory.filter(t => t.status === 'in-progress');
            
            // Active continuous transfers
            if (activeTransfers.length > 0) {
                html += '<div class="transfer-section">';
                html += '<div class="transfer-section-title">Active Transfers</div>';
                activeTransfers.forEach(transfer => {
                    html += this.renderTransferItem(transfer);
                });
                html += '</div>';
            }
            
            // In-progress one-time transfers
            if (inProgressTransfers.length > 0) {
                html += '<div class="transfer-section">';
                html += '<div class="transfer-section-title">In Progress</div>';
                inProgressTransfers.forEach(transfer => {
                    html += this.renderTransferItem(transfer);
                });
                html += '</div>';
            }
            
            // Completed transfers (show last 10)
            if (completedTransfers.length > 0) {
                html += '<div class="transfer-section">';
                html += '<div class="transfer-section-title">Completed</div>';
                completedTransfers.slice(-10).reverse().forEach(transfer => {
                    html += this.renderTransferItem(transfer);
                });
                html += '</div>';
            }
            
            html += '</div>';
        }

        html += '</div>';
        this.container.innerHTML = html;
        
        // Set up event listeners
        this.setupEventListeners();
    }

    renderTransferItem(transfer) {
        const fromName = this.getZoneName(transfer.from);
        const toName = this.getZoneName(transfer.to);
        const statusClass = transfer.status === 'active' ? 'active' : 
                           transfer.status === 'in-progress' ? 'in-progress' : 'completed';
        
        let html = `<div class="transfer-item ${statusClass}" data-transfer-id="${transfer.id}">`;
        html += `<div class="transfer-item-header">`;
        html += `<div class="transfer-route-small">`;
        html += `<span class="transfer-zone-small">${fromName}</span>`;
        html += `<span class="transfer-arrow-small">→</span>`;
        html += `<span class="transfer-zone-small">${toName}</span>`;
        html += `</div>`;
        html += `<div class="transfer-status-badge ${statusClass}">${transfer.status}</div>`;
        html += `</div>`;
        
        if (transfer.type === 'one-time') {
            html += `<div class="transfer-item-details">`;
            html += `<div class="transfer-detail">Count: ${this.formatNumber(transfer.count)} probes</div>`;
            if (transfer.status === 'in-progress') {
                html += `<div class="transfer-detail">Status: Transferring...</div>`;
            } else if (transfer.status === 'completed') {
                const duration = transfer.completedTime ? 
                    ((transfer.completedTime - transfer.startTime) / 1000).toFixed(1) : '?';
                html += `<div class="transfer-detail">Completed in ${duration}s</div>`;
            }
            html += `</div>`;
        } else {
            // Continuous transfer
            const ratePerDay = transfer.rate || 0;
            const ratePct = transfer.ratePercentage !== undefined ? transfer.ratePercentage : (transfer.rate || 0);
            html += `<div class="transfer-item-details">`;
            html += `<div class="transfer-detail">Rate: ${ratePerDay.toFixed(2)} probes/day (${ratePct.toFixed(1)}% of current drones/day)</div>`;
            html += `</div>`;
            
            if (transfer.status === 'active') {
                html += `<div class="transfer-item-actions">`;
                html += `<button class="transfer-action-btn edit-btn" data-action="edit" data-transfer-id="${transfer.id}">Edit</button>`;
                html += `<button class="transfer-action-btn reverse-btn" data-action="reverse" data-transfer-id="${transfer.id}">Reverse</button>`;
                html += `<button class="transfer-action-btn pause-btn" data-action="pause" data-transfer-id="${transfer.id}">Pause</button>`;
                html += `<button class="transfer-action-btn delete-btn" data-action="delete" data-transfer-id="${transfer.id}">Delete</button>`;
                html += `</div>`;
            }
        }
        
        html += `</div>`;
        return html;
    }

    setupEventListeners() {
        // Edit button
        this.container.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const transferId = e.target.dataset.transferId;
                this.editTransfer(transferId);
            });
        });
        
        // Reverse button
        this.container.querySelectorAll('.reverse-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const transferId = e.target.dataset.transferId;
                this.reverseTransfer(transferId);
            });
        });
        
        // Pause button
        this.container.querySelectorAll('.pause-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const transferId = e.target.dataset.transferId;
                this.pauseTransfer(transferId);
            });
        });
        
        // Delete button
        this.container.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const transferId = e.target.dataset.transferId;
                this.deleteTransfer(transferId);
            });
        });
    }

    editTransfer(transferId) {
        const transfer = this.transferHistory.find(t => t.id == transferId);
        if (!transfer || transfer.type !== 'continuous') return;
        
        // Show edit dialog
        const currentPct = transfer.ratePercentage !== undefined ? transfer.ratePercentage : (transfer.rate || 0);
        const newPct = prompt(`Edit transfer rate (% of current drones per day, current: ${currentPct}%):`, currentPct);
        if (newPct !== null) {
            const ratePct = parseFloat(newPct);
            if (!isNaN(ratePct) && ratePct > 0 && ratePct <= 100) {
                transfer.ratePercentage = ratePct;
                this.render();
                
                // Update in game engine
                if (window.gameEngine) {
                    window.gameEngine.performAction('update_transfer', {
                        transfer_id: transferId,
                        rate_percentage: ratePct
                    }).catch(error => {
                        console.error('Failed to update transfer:', error);
                    });
                }
            }
        }
    }

    reverseTransfer(transferId) {
        const transfer = this.transferHistory.find(t => t.id == transferId);
        if (!transfer || transfer.type !== 'continuous') return;
        
        // Swap from and to
        const temp = transfer.from;
        transfer.from = transfer.to;
        transfer.to = temp;
        this.render();
        
        // Update in game engine
        if (window.gameEngine) {
            window.gameEngine.performAction('reverse_transfer', {
                transfer_id: transferId
            }).catch(error => {
                console.error('Failed to reverse transfer:', error);
            });
        }
    }

    pauseTransfer(transferId) {
        const transfer = this.transferHistory.find(t => t.id == transferId);
        if (!transfer || transfer.type !== 'continuous') return;
        
        // Toggle pause status
        transfer.status = transfer.status === 'paused' ? 'active' : 'paused';
        this.render();
        
        // Update in game engine
        if (window.gameEngine) {
            window.gameEngine.performAction('pause_transfer', {
                transfer_id: transferId,
                paused: transfer.status === 'paused'
            }).catch(error => {
                console.error('Failed to pause transfer:', error);
            });
        }
    }

    deleteTransfer(transferId) {
        const transfer = this.transferHistory.find(t => t.id == transferId);
        if (!transfer) return;
        
        if (!confirm('Are you sure you want to delete this transfer?')) {
            return;
        }
        
        // Remove from history
        const index = this.transferHistory.indexOf(transfer);
        if (index > -1) {
            this.transferHistory.splice(index, 1);
        }
        this.render();
        
        // Update in game engine
        if (window.gameEngine) {
            window.gameEngine.performAction('delete_transfer', {
                transfer_id: transferId
            }).catch(error => {
                console.error('Failed to delete transfer:', error);
            });
        }
    }

    update(gameState) {
        this.gameState = gameState;
        
        // Sync with game engine transfer history
        const engineHistory = gameState.transfer_history || [];
        
        // If we don't have history yet, load it from game state
        if (this.transferHistory.length === 0 && engineHistory.length > 0) {
            this.transferHistory = engineHistory.map(t => ({...t}));
        } else {
            // Update existing transfers and add new ones
            engineHistory.forEach(engineTransfer => {
                const existing = this.transferHistory.find(t => t.id == engineTransfer.id);
                if (existing) {
                    // Update existing
                    Object.assign(existing, engineTransfer);
                } else {
                    // Add new
                    this.transferHistory.push({...engineTransfer});
                }
            });
        }
        
        // Mark one-time transfers as completed if they're not in active transfers
        const activeTransferIds = (gameState.active_transfers || []).map(t => t.id);
        this.transferHistory.forEach(transfer => {
            if (transfer.type === 'one-time' && transfer.status === 'in-progress') {
                // Check if this transfer is still active (simplified: assume completes after 3 seconds)
                const elapsed = Date.now() - transfer.startTime;
                if (elapsed > 3000 || !activeTransferIds.includes(transfer.id)) {
                    transfer.status = 'completed';
                    transfer.completedTime = Date.now();
                }
            } else if (transfer.type === 'continuous') {
                // Update status based on active transfers
                if (activeTransferIds.includes(transfer.id)) {
                    const activeTransfer = gameState.active_transfers.find(t => t.id == transfer.id);
                    if (activeTransfer) {
                        transfer.status = activeTransfer.paused ? 'paused' : 'active';
                        transfer.rate = activeTransfer.rate;
                    }
                } else {
                    transfer.status = 'completed';
                }
            }
        });
        
        this.render();
    }
}

