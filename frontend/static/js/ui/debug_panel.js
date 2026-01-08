/** Debug Panel - FPS and particle count monitoring */
class DebugPanel {
    constructor() {
        this.isVisible = false;
        this.container = null;
        
        // FPS tracking
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.currentFps = 0;
        this.fpsHistory = [];
        this.maxFpsHistory = 60; // Store last 60 readings for averaging
        
        // References to visualization systems (will be set after init)
        this.solarSystem = null;
        this.dysonViz = null;
        this.sceneManager = null;
        
        // Track expanded zones
        this.expandedZones = new Set();
        
        // Update interval
        this.updateInterval = null;
        
        this.createPanel();
        this.setupKeyBinding();
    }
    
    createPanel() {
        // Create container
        this.container = document.createElement('div');
        this.container.id = 'debug-panel';
        this.container.className = 'debug-panel';
        this.container.style.display = 'none';
        
        // Create content
        this.container.innerHTML = `
            <div class="debug-panel-header">
                <span class="debug-panel-title">🔧 Debug Panel</span>
                <button class="debug-panel-close" onclick="window.debugPanel.toggle()">×</button>
            </div>
            <div class="debug-panel-content">
                <div class="debug-section">
                    <div class="debug-section-title">Performance</div>
                    <div class="debug-row">
                        <span class="debug-label">FPS:</span>
                        <span class="debug-value" id="debug-fps">--</span>
                    </div>
                    <div class="debug-row">
                        <span class="debug-label">Avg FPS:</span>
                        <span class="debug-value" id="debug-fps-avg">--</span>
                    </div>
                    <div class="debug-row">
                        <span class="debug-label">Frame Time:</span>
                        <span class="debug-value" id="debug-frame-time">--</span>
                    </div>
                </div>
                
                <div class="debug-section">
                    <div class="debug-section-title">Total Particles</div>
                    <div class="debug-row">
                        <span class="debug-label">All:</span>
                        <span class="debug-value" id="debug-total-particles">--</span>
                    </div>
                    <div class="debug-row indent">
                        <span class="debug-label">Probe Clouds:</span>
                        <span class="debug-value" id="debug-probe-particles">--</span>
                    </div>
                    <div class="debug-row indent">
                        <span class="debug-label">Resources:</span>
                        <span class="debug-value" id="debug-resource-particles">--</span>
                    </div>
                    <div class="debug-row indent">
                        <span class="debug-label">Dyson Sphere:</span>
                        <span class="debug-value" id="debug-dyson-particles">--</span>
                    </div>
                    <div class="debug-row indent">
                        <span class="debug-label">Belts:</span>
                        <span class="debug-value" id="debug-belt-particles">--</span>
                    </div>
                    <div class="debug-row indent">
                        <span class="debug-label">Stars:</span>
                        <span class="debug-value" id="debug-star-particles">--</span>
                    </div>
                </div>
                
                <div class="debug-section">
                    <div class="debug-section-title">Particles by Zone <span class="debug-hint">(click to expand)</span></div>
                    <div id="debug-zone-particles" class="debug-zone-list">
                        <!-- Dynamically populated -->
                    </div>
                </div>
            </div>
            <div class="debug-panel-footer">
                Press <kbd>D</kbd> to toggle
            </div>
        `;
        
        document.body.appendChild(this.container);
    }
    
    setupKeyBinding() {
        // Keyboard binding disabled - handled by star_map.js with P key
        // This prevents conflict with WASD flying controls
    }
    
    toggleZone(zoneId) {
        if (this.expandedZones.has(zoneId)) {
            this.expandedZones.delete(zoneId);
        } else {
            this.expandedZones.add(zoneId);
        }
        this.updateDisplay();
    }
    
    toggle() {
        this.isVisible = !this.isVisible;
        this.container.style.display = this.isVisible ? 'block' : 'none';
        
        if (this.isVisible) {
            this.startUpdating();
        } else {
            this.stopUpdating();
        }
    }
    
    show() {
        this.isVisible = true;
        this.container.style.display = 'block';
        this.startUpdating();
    }
    
    hide() {
        this.isVisible = false;
        this.container.style.display = 'none';
        this.stopUpdating();
    }
    
    startUpdating() {
        if (this.updateInterval) return;
        
        // Update every 100ms for smoother display
        this.updateInterval = setInterval(() => {
            this.updateDisplay();
        }, 100);
        
        // Immediately update
        this.updateDisplay();
    }
    
    stopUpdating() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    
    /**
     * Call this every frame from the animation loop to track FPS
     */
    tick() {
        this.frameCount++;
        
        const now = performance.now();
        const elapsed = now - this.lastFpsUpdate;
        
        // Update FPS every 200ms
        if (elapsed >= 200) {
            this.currentFps = Math.round((this.frameCount / elapsed) * 1000);
            this.fpsHistory.push(this.currentFps);
            
            if (this.fpsHistory.length > this.maxFpsHistory) {
                this.fpsHistory.shift();
            }
            
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
    }
    
    getAverageFps() {
        if (this.fpsHistory.length === 0) return 0;
        const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
        return Math.round(sum / this.fpsHistory.length);
    }
    
    /**
     * Set references to visualization systems
     */
    setReferences(solarSystem, dysonViz, sceneManager, starfield) {
        this.solarSystem = solarSystem;
        this.dysonViz = dysonViz;
        this.sceneManager = sceneManager;
        this.starfield = starfield;
    }
    
    /**
     * Get particle size breakdown for a zone
     * @param {string} zoneId - Zone ID
     * @returns {Object} {metal: {small, medium, large, xlarge, huge}, slag: {...}, methalox: {...}}
     */
    getZoneSizeBreakdown(zoneId) {
        const breakdown = {
            metal: { small: 0, medium: 0, large: 0, xlarge: 0, huge: 0 },
            slag: { small: 0, medium: 0, large: 0, xlarge: 0, huge: 0 },
            methalox: { small: 0, medium: 0, large: 0, xlarge: 0, huge: 0 }
        };
        
        if (!this.solarSystem || !this.solarSystem.resourceParticleData) {
            return breakdown;
        }
        
        const particleData = this.solarSystem.resourceParticleData[zoneId];
        if (!particleData) {
            return breakdown;
        }
        
        // Count particles by type and size
        ['metal', 'slag', 'methalox'].forEach(type => {
            const particles = particleData[type] || [];
            particles.forEach(p => {
                const sizeClass = p.sizeClass || 'small';
                if (breakdown[type].hasOwnProperty(sizeClass)) {
                    breakdown[type][sizeClass]++;
                }
            });
        });
        
        return breakdown;
    }
    
    /**
     * Collect particle counts from all systems
     */
    getParticleCounts() {
        const counts = {
            probes: 0,
            resources: 0,
            dyson: 0,
            belts: 0,
            stars: 0,
            byZone: {}
        };
        
        // Zone clouds (probes)
        if (this.solarSystem && this.solarSystem.zoneClouds) {
            const zc = this.solarSystem.zoneClouds;
            
            // Planet zone clouds
            Object.keys(zc.clouds || {}).forEach(zoneId => {
                const zoneClouds = zc.clouds[zoneId];
                let zoneTotal = 0;
                
                if (zoneClouds.probes && zoneClouds.probes.geometry) {
                    const drawRange = zoneClouds.probes.geometry.drawRange;
                    const count = drawRange.count || 0;
                    counts.probes += count;
                    zoneTotal += count;
                }
                
                if (zoneTotal > 0) {
                    counts.byZone[zoneId] = counts.byZone[zoneId] || { probes: 0, resources: 0 };
                    counts.byZone[zoneId].probes = zoneTotal;
                }
            });
            
            // Belt zone clouds
            Object.keys(zc.beltClouds || {}).forEach(zoneId => {
                const zoneClouds = zc.beltClouds[zoneId];
                let zoneTotal = 0;
                
                if (zoneClouds.probes && zoneClouds.probes.geometry) {
                    const drawRange = zoneClouds.probes.geometry.drawRange;
                    const count = drawRange.count || 0;
                    counts.probes += count;
                    zoneTotal += count;
                }
                
                if (zoneTotal > 0) {
                    counts.byZone[zoneId] = counts.byZone[zoneId] || { probes: 0, resources: 0 };
                    counts.byZone[zoneId].probes = zoneTotal;
                }
            });
            
            // Transit particles
            if (zc.transitParticles && zc.transitParticles.geometry) {
                const drawRange = zc.transitParticles.geometry.drawRange;
                counts.probes += drawRange.count || 0;
            }
        }
        
        // Resource particles (metal, slag, methalox)
        if (this.solarSystem && this.solarSystem.resourceParticles) {
            Object.keys(this.solarSystem.resourceParticles).forEach(zoneId => {
                const particleSystem = this.solarSystem.resourceParticles[zoneId];
                if (particleSystem && particleSystem.geometry) {
                    const drawRange = particleSystem.geometry.drawRange;
                    const count = drawRange.count || 0;
                    counts.resources += count;
                    
                    counts.byZone[zoneId] = counts.byZone[zoneId] || { probes: 0, resources: 0 };
                    counts.byZone[zoneId].resources = count;
                }
            });
        }
        
        // Dyson sphere particles
        if (this.dysonViz) {
            // Primary particle system
            if (this.dysonViz.particleGeometry) {
                const drawRange = this.dysonViz.particleGeometry.drawRange;
                counts.dyson += drawRange.count || 0;
            }
            // Secondary particle system (rotated)
            if (this.dysonViz.particleGeometry2) {
                const drawRange = this.dysonViz.particleGeometry2.drawRange;
                counts.dyson += drawRange.count || 0;
            }
            // Tertiary particle system
            if (this.dysonViz.particleGeometry3) {
                const drawRange = this.dysonViz.particleGeometry3.drawRange;
                counts.dyson += drawRange.count || 0;
            }
        }
        
        // Belt particles (asteroid belt, kuiper, oort)
        if (this.solarSystem) {
            if (this.solarSystem.asteroidBelt && this.solarSystem.asteroidBelt.geometry) {
                const drawRange = this.solarSystem.asteroidBelt.geometry.drawRange;
                counts.belts += drawRange.count || 0;
            }
            if (this.solarSystem.kuiperBelt && this.solarSystem.kuiperBelt.geometry) {
                const drawRange = this.solarSystem.kuiperBelt.geometry.drawRange;
                counts.belts += drawRange.count || 0;
            }
            if (this.solarSystem.oortCloud && this.solarSystem.oortCloud.geometry) {
                const drawRange = this.solarSystem.oortCloud.geometry.drawRange;
                counts.belts += drawRange.count || 0;
            }
        }
        
        // Starfield particles
        if (this.starfield && this.starfield.layers) {
            this.starfield.layers.forEach(layer => {
                if (layer.geometry && layer.geometry.attributes.position) {
                    counts.stars += layer.geometry.attributes.position.count;
                }
            });
        }
        
        return counts;
    }
    
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(2) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }
    
    updateDisplay() {
        if (!this.isVisible) return;
        
        const counts = this.getParticleCounts();
        const totalParticles = counts.probes + counts.resources + counts.dyson + counts.belts + counts.stars;
        
        // Update FPS display
        const fpsEl = document.getElementById('debug-fps');
        const fpsAvgEl = document.getElementById('debug-fps-avg');
        const frameTimeEl = document.getElementById('debug-frame-time');
        
        if (fpsEl) {
            const fps = this.currentFps;
            fpsEl.textContent = fps;
            fpsEl.className = 'debug-value ' + (fps >= 55 ? 'good' : fps >= 30 ? 'ok' : 'bad');
        }
        
        if (fpsAvgEl) {
            fpsAvgEl.textContent = this.getAverageFps();
        }
        
        if (frameTimeEl) {
            const frameTime = this.currentFps > 0 ? (1000 / this.currentFps).toFixed(2) : '--';
            frameTimeEl.textContent = frameTime + ' ms';
        }
        
        // Update particle counts
        const setCount = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = this.formatNumber(value);
        };
        
        setCount('debug-total-particles', totalParticles);
        setCount('debug-probe-particles', counts.probes);
        setCount('debug-resource-particles', counts.resources);
        setCount('debug-dyson-particles', counts.dyson);
        setCount('debug-belt-particles', counts.belts);
        setCount('debug-star-particles', counts.stars);
        
        // Update zone breakdown
        const zoneListEl = document.getElementById('debug-zone-particles');
        if (zoneListEl) {
            const zoneIds = Object.keys(counts.byZone).sort();
            
            if (zoneIds.length === 0) {
                zoneListEl.innerHTML = '<div class="debug-row"><span class="debug-label dimmed">No active zones</span></div>';
            } else {
                let html = '';
                zoneIds.forEach(zoneId => {
                    const zone = counts.byZone[zoneId];
                    const zoneName = this.formatZoneName(zoneId);
                    const isExpanded = this.expandedZones.has(zoneId);
                    const expandIcon = isExpanded ? '▼' : '▶';
                    
                    html += `
                        <div class="debug-zone-item">
                            <div class="debug-zone-row clickable" onclick="window.debugPanel.toggleZone('${zoneId}')">
                                <span class="debug-zone-expand">${expandIcon}</span>
                                <span class="debug-zone-name">${zoneName}</span>
                                <span class="debug-zone-counts">
                                    <span class="probe-count" title="Probes">●${this.formatNumber(zone.probes)}</span>
                                    <span class="resource-count" title="Resources">■${this.formatNumber(zone.resources)}</span>
                                </span>
                            </div>
                    `;
                    
                    if (isExpanded) {
                        const breakdown = this.getZoneSizeBreakdown(zoneId);
                        html += '<div class="debug-zone-details">';
                        
                        // Show size breakdown for each resource type
                        ['metal', 'slag', 'methalox'].forEach(type => {
                            const sizes = breakdown[type];
                            const total = sizes.small + sizes.medium + sizes.large + sizes.xlarge + sizes.huge;
                            
                            if (total > 0) {
                                const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
                                const typeClass = type === 'metal' ? 'metal-type' : type === 'slag' ? 'slag-type' : 'methalox-type';
                                
                                html += `<div class="debug-size-group ${typeClass}">`;
                                html += `<div class="debug-size-header">${typeLabel} (${total})</div>`;
                                
                                if (sizes.small > 0) html += `<div class="debug-size-row"><span>Small:</span><span>${sizes.small}</span></div>`;
                                if (sizes.medium > 0) html += `<div class="debug-size-row"><span>Medium:</span><span>${sizes.medium}</span></div>`;
                                if (sizes.large > 0) html += `<div class="debug-size-row"><span>Large:</span><span>${sizes.large}</span></div>`;
                                if (sizes.xlarge > 0) html += `<div class="debug-size-row"><span>XLarge:</span><span>${sizes.xlarge}</span></div>`;
                                if (sizes.huge > 0) html += `<div class="debug-size-row"><span>Huge:</span><span>${sizes.huge}</span></div>`;
                                
                                html += '</div>';
                            }
                        });
                        
                        // If no resources, show message
                        const hasAnyResources = Object.values(breakdown).some(sizes => 
                            sizes.small + sizes.medium + sizes.large + sizes.xlarge + sizes.huge > 0
                        );
                        if (!hasAnyResources) {
                            html += '<div class="debug-size-empty">No resource particles</div>';
                        }
                        
                        html += '</div>';
                    }
                    
                    html += '</div>';
                });
                zoneListEl.innerHTML = html;
            }
        }
    }
    
    formatZoneName(zoneId) {
        // Convert zone_id to Zone Name
        return zoneId
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
}

// Create global instance
window.debugPanel = new DebugPanel();
