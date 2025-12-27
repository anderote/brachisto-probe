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

    formatMass(kg) {
        if (kg >= 1e15) {
            return (kg / 1e15).toFixed(2) + ' PT';
        } else if (kg >= 1e12) {
            return (kg / 1e12).toFixed(2) + ' GT';
        } else if (kg >= 1e9) {
            return (kg / 1e9).toFixed(2) + ' MT';
        } else if (kg >= 1e6) {
            return (kg / 1e6).toFixed(2) + ' kT';
        } else if (kg >= 1e3) {
            return (kg / 1e3).toFixed(2) + ' T';
        } else {
            return kg.toFixed(0) + ' kg';
        }
    }

    calculateTransferProgress(transfer) {
        // Calculate progress based on departure_time, arrival_time, and current game time
        if (!this.gameState) return 0;
        
        const currentTime = this.gameState.time || 0; // Game time in days
        const departureTime = transfer.departure_time || 0; // In days
        const arrivalTime = transfer.arrival_time || currentTime; // In days
        
        if (arrivalTime <= departureTime) return 1; // Completed or invalid
        if (currentTime <= departureTime) return 0; // Not started
        if (currentTime >= arrivalTime) return 1; // Completed
        
        const elapsed = currentTime - departureTime;
        const total = arrivalTime - departureTime;
        
        return Math.max(0, Math.min(1, elapsed / total));
    }

    calculateMassThroughput(transfer) {
        // Calculate actual mass throughput for continuous transfers
        if (!this.gameState || transfer.type !== 'continuous') return null;
        
        const fromZoneId = transfer.from;
        const resourceType = transfer.resource_type || 'probe';
        
        if (resourceType === 'metal') {
            // Get stored metal in source zone
            const zones = this.gameState.zones || {};
            const sourceZone = zones[fromZoneId] || {};
            const storedMetal = sourceZone.stored_metal || 0;
            
            // Calculate rate from percentage
            const ratePercentage = transfer.metal_rate_percentage || transfer.rate || 0;
            const actualRateKgPerDay = storedMetal * (ratePercentage / 100);
            
            // Get mass driver capacity if available
            let totalCapacity = 0;
            let usedCapacity = 0;
            if (window.gameEngine && window.gameEngine.transferSystem) {
                totalCapacity = window.gameEngine.transferSystem.calculateMetalTransferCapacity(this.gameState, fromZoneId);
                usedCapacity = window.gameEngine.transferSystem.calculateUsedMetalCapacity(this.gameState, fromZoneId);
            }
            
            return {
                actualRate: actualRateKgPerDay,
                totalCapacity: totalCapacity,
                usedCapacity: usedCapacity,
                availableCapacity: Math.max(0, totalCapacity - usedCapacity)
            };
        }
        
        return null;
    }

    render() {
        if (!this.container) return;

        // Filter to only show active transfers (active or in-progress)
        const activeTransfers = this.transferHistory.filter(t => 
            t.status === 'active' || t.status === 'in-progress' || t.status === 'paused'
        );

        let html = '<div class="transfer-panel-content">';
        html += '<div class="transfer-panel-header" style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">';
        html += '<div style="font-size: 11px; color: rgba(255, 255, 255, 0.9); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Active Transfers</div>';
        html += '</div>';

        if (activeTransfers.length === 0) {
            html += '<div class="transfer-panel-empty" style="font-size: 10px; color: rgba(255, 255, 255, 0.5); padding: 20px; text-align: center;">No active transfers. Create transfers by selecting two zones.</div>';
        } else {
            html += '<div class="transfer-list">';
            activeTransfers.forEach(transfer => {
                html += this.renderTransferItem(transfer);
            });
            html += '</div>';
        }

        html += '</div>';
        this.container.innerHTML = html;
        
        // Set up event listeners
        this.setupEventListeners();
    }

    renderSpawnedTransfer(batch, resourceType) {
        // Calculate progress for individual spawned transfer
        const progress = this.calculateBatchProgress(batch);
        const progressPct = Math.min(100, Math.max(0, progress * 100));
        
        let amountText = '';
        if (resourceType === 'metal') {
            amountText = this.formatMass(batch.mass_kg || 0);
        } else {
            amountText = `${this.formatNumber(batch.count || 0)} probes`;
        }
        
        let html = `<div class="transfer-spawned-item">`;
        html += `<div class="transfer-spawned-info">`;
        html += `<span class="transfer-spawned-amount">${amountText}</span>`;
        html += `</div>`;
        html += `<div class="transfer-spawned-progress">`;
        html += `<div class="transfer-progress-bar-mini" style="width: ${progressPct.toFixed(0)}%"></div>`;
        html += `<span class="transfer-progress-text-mini">${progressPct.toFixed(0)}%</span>`;
        html += `</div>`;
        html += `</div>`;
        
        return html;
    }
    
    calculateBatchProgress(batch) {
        if (!this.gameState) return 0;
        
        const currentTime = this.gameState.time || 0;
        const departureTime = batch.departure_time || 0;
        const arrivalTime = batch.arrival_time || currentTime;
        
        if (arrivalTime <= departureTime) return 1;
        if (currentTime <= departureTime) return 0;
        if (currentTime >= arrivalTime) return 1;
        
        const elapsed = currentTime - departureTime;
        const total = arrivalTime - departureTime;
        
        return Math.max(0, Math.min(1, elapsed / total));
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
        
        const resourceType = transfer.resource_type || 'probe';
        
        if (transfer.type === 'one-time') {
            html += `<div class="transfer-item-details">`;
            if (resourceType === 'metal') {
                html += `<div class="transfer-detail">Mass: ${this.formatNumber(transfer.metal_kg || 0)} kg metal</div>`;
            } else {
                html += `<div class="transfer-detail">Count: ${this.formatNumber(transfer.count || 0)} probes</div>`;
            }
            if (transfer.status === 'in-progress') {
                // Calculate and display progress bar
                const progress = this.calculateTransferProgress(transfer);
                const progressPct = Math.min(100, Math.max(0, progress * 100));
                html += `<div class="transfer-progress-container">`;
                html += `<div class="transfer-progress-bar" style="width: ${progressPct.toFixed(1)}%"></div>`;
                html += `<span class="transfer-progress-text">${progressPct.toFixed(1)}%</span>`;
                html += `</div>`;
            } else if (transfer.status === 'completed') {
                const duration = transfer.completedTime ? 
                    ((transfer.completedTime - transfer.startTime) / 1000).toFixed(1) : '?';
                html += `<div class="transfer-detail">Completed in ${duration}s</div>`;
            }
            html += `</div>`;
        } else {
            // Continuous transfer
            html += `<div class="transfer-item-details">`;
            if (resourceType === 'metal') {
                const ratePercentage = transfer.metal_rate_percentage || transfer.rate || 0;
                const throughput = this.calculateMassThroughput(transfer);
                
                if (throughput && throughput.totalCapacity > 0) {
                    // Show actual throughput and capacity usage
                    html += `<div class="transfer-detail">Rate: ${ratePercentage.toFixed(1)}% of stored metal/day</div>`;
                    html += `<div class="transfer-detail">Throughput: ${this.formatMass(throughput.actualRate)}/day</div>`;
                    const capacityUsedPct = throughput.totalCapacity > 0 ? 
                        (throughput.usedCapacity / throughput.totalCapacity * 100) : 0;
                    html += `<div class="transfer-detail">Capacity: ${this.formatMass(throughput.usedCapacity)}/${this.formatMass(throughput.totalCapacity)}/day (${capacityUsedPct.toFixed(1)}%)</div>`;
                } else {
                    html += `<div class="transfer-detail">Rate: ${ratePercentage.toFixed(1)}% of stored metal/day</div>`;
                }
            } else {
                const ratePct = transfer.ratePercentage !== undefined ? transfer.ratePercentage : (transfer.rate || 0);
                html += `<div class="transfer-detail">Rate: ${ratePct.toFixed(1)}% of probe production</div>`;
            }
            html += `</div>`;
            
            // Show spawned individual transfers (in-transit batches)
            if (transfer.in_transit && transfer.in_transit.length > 0) {
                html += `<div class="transfer-spawned-list">`;
                html += `<div class="transfer-spawned-header">${transfer.in_transit.length} shipment${transfer.in_transit.length > 1 ? 's' : ''} in transit:</div>`;
                
                // Show up to 5 most recent shipments
                const recentBatches = transfer.in_transit.slice(-5);
                for (const batch of recentBatches) {
                    html += this.renderSpawnedTransfer(batch, resourceType);
                }
                
                // Show count if more than 5
                if (transfer.in_transit.length > 5) {
                    html += `<div class="transfer-spawned-more">+ ${transfer.in_transit.length - 5} more shipments</div>`;
                }
                html += `</div>`;
            }
            
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
        const newPct = prompt(`Edit transfer rate (% of current probes per day, current: ${currentPct}%):`, currentPct);
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
        
        // Remove from history (no confirmation needed)
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
        if (!gameState) return;
        
        // Change detection: Only update if transfers have changed
        // Use efficient hash instead of JSON.stringify to avoid memory issues
        const activeTransfers = gameState.active_transfers || [];
        let hash = 0;
        for (const transfer of activeTransfers) {
            // Properly hash string IDs by converting to numeric hash
            const idHash = typeof transfer.id === 'string' ? 
                transfer.id.split('').reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0) :
                (transfer.id || 0);
            hash = ((hash << 5) - hash) + idHash;
            hash = ((hash << 5) - hash) + (transfer.probe_count || 0);
            hash = ((hash << 5) - hash) + (transfer.rate_percentage || 0);
            hash = ((hash << 5) - hash) + (transfer.metal_rate_percentage || 0);
            hash = ((hash << 5) - hash) + (transfer.status === 'completed' ? 1 : 0);
            hash = ((hash << 5) - hash) + (transfer.paused ? 1 : 0);
            hash = ((hash << 5) - hash) + (transfer.resource_type === 'metal' ? 2 : 1);
            // Include in_transit count for continuous transfers
            hash = ((hash << 5) - hash) + (transfer.in_transit ? transfer.in_transit.length : 0);
        }
        const transfersHash = hash.toString() + '_' + activeTransfers.length;
        
        if (transfersHash === this.lastTransfersHash && this.lastTransfersHash !== null) {
            return; // No changes, skip update
        }
        this.lastTransfersHash = transfersHash;
        this.gameState = gameState;
        
        // Sync transfer history from active_transfers
        const activeTransferIds = activeTransfers.map(t => t.id);
        
        // Update or add transfers from active_transfers
        activeTransfers.forEach(activeTransfer => {
            const existing = this.transferHistory.find(t => t.id == activeTransfer.id);
            if (existing) {
                // Update existing transfer
                existing.from = activeTransfer.from_zone || activeTransfer.from || existing.from;
                existing.to = activeTransfer.to_zone || activeTransfer.to || existing.to;
                existing.type = activeTransfer.type || existing.type || 'one-time';
                existing.resource_type = activeTransfer.resource_type || existing.resource_type || 'probe';
                existing.count = activeTransfer.probe_count !== undefined ? activeTransfer.probe_count : existing.count;
                existing.metal_kg = activeTransfer.metal_kg !== undefined ? activeTransfer.metal_kg : existing.metal_kg;
                existing.rate = activeTransfer.rate_percentage || activeTransfer.metal_rate_percentage || existing.rate || 0;
                existing.ratePercentage = activeTransfer.rate_percentage !== undefined ? activeTransfer.rate_percentage : existing.ratePercentage;
                existing.metal_rate_percentage = activeTransfer.metal_rate_percentage !== undefined ? activeTransfer.metal_rate_percentage : existing.metal_rate_percentage;
                // Store departure and arrival times for progress calculation
                existing.departure_time = activeTransfer.departure_time !== undefined ? activeTransfer.departure_time : existing.departure_time;
                existing.arrival_time = activeTransfer.arrival_time !== undefined ? activeTransfer.arrival_time : existing.arrival_time;
                // Sync in-transit batches for continuous transfers
                existing.in_transit = activeTransfer.in_transit || [];
                if (activeTransfer.type === 'one-time') {
                    existing.status = activeTransfer.status === 'completed' ? 'completed' : 
                                     activeTransfer.status === 'paused' ? 'paused' : 'in-progress';
                } else {
                    existing.status = activeTransfer.paused ? 'paused' : 'active';
                }
            } else {
                // Add new transfer
                const historyItem = {
                    id: activeTransfer.id,
                    from: activeTransfer.from_zone || activeTransfer.from,
                    to: activeTransfer.to_zone || activeTransfer.to,
                    type: activeTransfer.type || 'one-time',
                    resource_type: activeTransfer.resource_type || 'probe',
                    count: activeTransfer.probe_count || 0,
                    metal_kg: activeTransfer.metal_kg || 0,
                    rate: activeTransfer.rate_percentage || activeTransfer.metal_rate_percentage || 0,
                    ratePercentage: activeTransfer.rate_percentage,
                    metal_rate_percentage: activeTransfer.metal_rate_percentage,
                    departure_time: activeTransfer.departure_time || 0,
                    arrival_time: activeTransfer.arrival_time || 0,
                    in_transit: activeTransfer.in_transit || [],
                    status: activeTransfer.type === 'one-time' ? 
                           (activeTransfer.status === 'completed' ? 'completed' : 
                            activeTransfer.status === 'paused' ? 'paused' : 'in-progress') :
                           (activeTransfer.paused ? 'paused' : 'active'),
                    startTime: activeTransfer.departure_time ? activeTransfer.departure_time * 86400000 : Date.now(),
                    completedTime: activeTransfer.status === 'completed' && activeTransfer.arrival_time ? 
                                  activeTransfer.arrival_time * 86400000 : null
                };
                this.transferHistory.push(historyItem);
            }
        });
        
        // Remove transfers that are no longer in active_transfers
        // Completed transfers are automatically removed from active_transfers by the engine
        this.transferHistory = this.transferHistory.filter(transfer => {
            // Only keep transfers that are still in the active transfers list
            return activeTransferIds.includes(transfer.id);
        });
        
        this.render();
    }
}

