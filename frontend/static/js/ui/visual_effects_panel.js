/** Visual Effects Debug Panel - Control atmospheric effects with sliders and toggles */
class VisualEffectsPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.isVisible = false;
        
        if (!this.container) {
            console.warn('VisualEffectsPanel: Container not found:', containerId);
            return;
        }
        
        // Store references to effect parameters
        // Initialize with current values from scene (will be updated on first render)
        this.effects = {
            bloom: {
                enabled: false,  // Disabled by default
                strength: 1.2,
                radius: 0.6,
                threshold: 0.3
            },
            godRays: {
                enabled: false,  // Disabled by default
                exposure: 0.18,
                decay: 0.95,
                density: 0.8,
                weight: 0.4,
                samples: 50
            },
            lensflare: {
                enabled: false  // Disabled by default
            },
            atmosphere: {
                enabled: true,
                intensity: 0.6
            }
        };
        
        this.init();
    }
    
    init() {
        // Create panel HTML structure
        this.render();
        
        // Set up keyboard shortcut (G key)
        document.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'g' && !this._isInputFocused()) {
                e.preventDefault();
                this.toggle();
            }
        });
        
        // Set up event listeners for controls
        this.setupEventListeners();
        
        // Sync initial values from scene (after a short delay to ensure scene is initialized)
        setTimeout(() => this.syncFromScene(), 500);
    }
    
    syncFromScene() {
        // Sync initial values from scene if available
        // This is a placeholder - can be implemented if needed to read current scene values
        // For now, we use the default values set in the constructor
    }
    
    _isInputFocused() {
        const activeElement = document.activeElement;
        return activeElement.tagName === 'INPUT' || 
               activeElement.tagName === 'TEXTAREA' ||
               activeElement.isContentEditable;
    }
    
    render() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="visual-effects-panel" style="display: ${this.isVisible ? 'block' : 'none'};">
                <div class="visual-effects-panel-header">
                    <h3>Visual Effects Debug</h3>
                    <button class="visual-effects-panel-close" title="Close (G)">&times;</button>
                </div>
                <div class="visual-effects-panel-content">
                    <!-- Bloom Section -->
                    <div class="visual-effects-section">
                        <div class="visual-effects-section-header">
                            <label class="visual-effects-toggle">
                                <input type="checkbox" id="ve-bloom-enabled" ${this.effects.bloom.enabled ? 'checked' : ''}>
                                <span>Bloom</span>
                            </label>
                        </div>
                        <div class="visual-effects-controls" id="ve-bloom-controls">
                            <div class="visual-effects-slider-group">
                                <label>Strength: <span id="ve-bloom-strength-value">${this.effects.bloom.strength.toFixed(2)}</span></label>
                                <input type="range" id="ve-bloom-strength" min="0" max="3" step="0.1" value="${this.effects.bloom.strength}">
                            </div>
                            <div class="visual-effects-slider-group">
                                <label>Radius: <span id="ve-bloom-radius-value">${this.effects.bloom.radius.toFixed(2)}</span></label>
                                <input type="range" id="ve-bloom-radius" min="0" max="2" step="0.1" value="${this.effects.bloom.radius}">
                            </div>
                            <div class="visual-effects-slider-group">
                                <label>Threshold: <span id="ve-bloom-threshold-value">${this.effects.bloom.threshold.toFixed(2)}</span></label>
                                <input type="range" id="ve-bloom-threshold" min="0" max="1" step="0.05" value="${this.effects.bloom.threshold}">
                            </div>
                        </div>
                    </div>
                    
                    <!-- God Rays Section -->
                    <div class="visual-effects-section">
                        <div class="visual-effects-section-header">
                            <label class="visual-effects-toggle">
                                <input type="checkbox" id="ve-godrays-enabled" ${this.effects.godRays.enabled ? 'checked' : ''}>
                                <span>God Rays</span>
                            </label>
                        </div>
                        <div class="visual-effects-controls" id="ve-godrays-controls">
                            <div class="visual-effects-slider-group">
                                <label>Exposure: <span id="ve-godrays-exposure-value">${this.effects.godRays.exposure.toFixed(2)}</span></label>
                                <input type="range" id="ve-godrays-exposure" min="0" max="1.5" step="0.01" value="${this.effects.godRays.exposure}">
                            </div>
                            <div class="visual-effects-slider-group">
                                <label>Decay: <span id="ve-godrays-decay-value">${this.effects.godRays.decay.toFixed(2)}</span></label>
                                <input type="range" id="ve-godrays-decay" min="0.85" max="0.99" step="0.01" value="${this.effects.godRays.decay}">
                            </div>
                            <div class="visual-effects-slider-group">
                                <label>Density: <span id="ve-godrays-density-value">${this.effects.godRays.density.toFixed(2)}</span></label>
                                <input type="range" id="ve-godrays-density" min="0.3" max="1.5" step="0.1" value="${this.effects.godRays.density}">
                            </div>
                            <div class="visual-effects-slider-group">
                                <label>Weight: <span id="ve-godrays-weight-value">${this.effects.godRays.weight.toFixed(2)}</span></label>
                                <input type="range" id="ve-godrays-weight" min="0.1" max="0.8" step="0.05" value="${this.effects.godRays.weight}">
                            </div>
                            <div class="visual-effects-slider-group">
                                <label>Samples: <span id="ve-godrays-samples-value">${this.effects.godRays.samples}</span></label>
                                <input type="range" id="ve-godrays-samples" min="20" max="100" step="5" value="${this.effects.godRays.samples}">
                            </div>
                        </div>
                    </div>
                    
                    <!-- Lensflare Section -->
                    <div class="visual-effects-section">
                        <div class="visual-effects-section-header">
                            <label class="visual-effects-toggle">
                                <input type="checkbox" id="ve-lensflare-enabled" ${this.effects.lensflare.enabled ? 'checked' : ''}>
                                <span>Lensflare</span>
                            </label>
                        </div>
                    </div>
                    
                    <!-- Atmosphere Section -->
                    <div class="visual-effects-section">
                        <div class="visual-effects-section-header">
                            <label class="visual-effects-toggle">
                                <input type="checkbox" id="ve-atmosphere-enabled" ${this.effects.atmosphere.enabled ? 'checked' : ''}>
                                <span>Planet Atmosphere</span>
                            </label>
                        </div>
                        <div class="visual-effects-controls" id="ve-atmosphere-controls">
                            <div class="visual-effects-slider-group">
                                <label>Intensity: <span id="ve-atmosphere-intensity-value">${this.effects.atmosphere.intensity.toFixed(2)}</span></label>
                                <input type="range" id="ve-atmosphere-intensity" min="0" max="1.5" step="0.1" value="${this.effects.atmosphere.intensity}">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    setupEventListeners() {
        // Close button
        const closeBtn = this.container.querySelector('.visual-effects-panel-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.toggle());
        }
        
        // Bloom controls
        this._setupBloomControls();
        
        // God Rays controls
        this._setupGodRaysControls();
        
        // Lensflare toggle
        this._setupLensflareControls();
        
        // Atmosphere controls
        this._setupAtmosphereControls();
    }
    
    _setupBloomControls() {
        const enabled = document.getElementById('ve-bloom-enabled');
        const strength = document.getElementById('ve-bloom-strength');
        const radius = document.getElementById('ve-bloom-radius');
        const threshold = document.getElementById('ve-bloom-threshold');
        
        if (enabled) {
            enabled.addEventListener('change', (e) => {
                this.effects.bloom.enabled = e.target.checked;
                this._updateBloom();
            });
        }
        
        if (strength) {
            strength.addEventListener('input', (e) => {
                this.effects.bloom.strength = parseFloat(e.target.value);
                document.getElementById('ve-bloom-strength-value').textContent = this.effects.bloom.strength.toFixed(2);
                this._updateBloom();
            });
        }
        
        if (radius) {
            radius.addEventListener('input', (e) => {
                this.effects.bloom.radius = parseFloat(e.target.value);
                document.getElementById('ve-bloom-radius-value').textContent = this.effects.bloom.radius.toFixed(2);
                this._updateBloom();
            });
        }
        
        if (threshold) {
            threshold.addEventListener('input', (e) => {
                this.effects.bloom.threshold = parseFloat(e.target.value);
                document.getElementById('ve-bloom-threshold-value').textContent = this.effects.bloom.threshold.toFixed(2);
                this._updateBloom();
            });
        }
    }
    
    _setupGodRaysControls() {
        const enabled = document.getElementById('ve-godrays-enabled');
        const exposure = document.getElementById('ve-godrays-exposure');
        const decay = document.getElementById('ve-godrays-decay');
        const density = document.getElementById('ve-godrays-density');
        const weight = document.getElementById('ve-godrays-weight');
        const samples = document.getElementById('ve-godrays-samples');
        
        if (enabled) {
            enabled.addEventListener('change', (e) => {
                this.effects.godRays.enabled = e.target.checked;
                this._updateGodRays();
            });
        }
        
        if (exposure) {
            exposure.addEventListener('input', (e) => {
                this.effects.godRays.exposure = parseFloat(e.target.value);
                document.getElementById('ve-godrays-exposure-value').textContent = this.effects.godRays.exposure.toFixed(2);
                this._updateGodRays();
            });
        }
        
        if (decay) {
            decay.addEventListener('input', (e) => {
                this.effects.godRays.decay = parseFloat(e.target.value);
                document.getElementById('ve-godrays-decay-value').textContent = this.effects.godRays.decay.toFixed(2);
                this._updateGodRays();
            });
        }
        
        if (density) {
            density.addEventListener('input', (e) => {
                this.effects.godRays.density = parseFloat(e.target.value);
                document.getElementById('ve-godrays-density-value').textContent = this.effects.godRays.density.toFixed(2);
                this._updateGodRays();
            });
        }
        
        if (weight) {
            weight.addEventListener('input', (e) => {
                this.effects.godRays.weight = parseFloat(e.target.value);
                document.getElementById('ve-godrays-weight-value').textContent = this.effects.godRays.weight.toFixed(2);
                this._updateGodRays();
            });
        }
        
        if (samples) {
            samples.addEventListener('input', (e) => {
                this.effects.godRays.samples = parseInt(e.target.value);
                document.getElementById('ve-godrays-samples-value').textContent = this.effects.godRays.samples;
                this._updateGodRays();
            });
        }
    }
    
    _setupLensflareControls() {
        const enabled = document.getElementById('ve-lensflare-enabled');
        if (enabled) {
            enabled.addEventListener('change', (e) => {
                this.effects.lensflare.enabled = e.target.checked;
                this._updateLensflare();
            });
        }
    }
    
    _setupAtmosphereControls() {
        const enabled = document.getElementById('ve-atmosphere-enabled');
        const intensity = document.getElementById('ve-atmosphere-intensity');
        
        if (enabled) {
            enabled.addEventListener('change', (e) => {
                this.effects.atmosphere.enabled = e.target.checked;
                this._updateAtmosphere();
            });
        }
        
        if (intensity) {
            intensity.addEventListener('input', (e) => {
                this.effects.atmosphere.intensity = parseFloat(e.target.value);
                document.getElementById('ve-atmosphere-intensity-value').textContent = this.effects.atmosphere.intensity.toFixed(2);
                this._updateAtmosphere();
            });
        }
    }
    
    _updateBloom() {
        const sceneManager = window.app?.sceneManager;
        if (!sceneManager || !sceneManager.bloomPass) return;
        
        if (this.effects.bloom.enabled) {
            sceneManager.bloomPass.strength = this.effects.bloom.strength;
            sceneManager.bloomPass.radius = this.effects.bloom.radius;
            sceneManager.bloomPass.threshold = this.effects.bloom.threshold;
            sceneManager.bloomPass.enabled = true;
        } else {
            sceneManager.bloomPass.enabled = false;
        }
    }
    
    _updateGodRays() {
        const sceneManager = window.app?.sceneManager;
        if (!sceneManager || !sceneManager.godRaysPass) return;
        
        if (this.effects.godRays.enabled) {
            sceneManager.godRaysPass.uniforms.exposure.value = this.effects.godRays.exposure;
            sceneManager.godRaysPass.uniforms.decay.value = this.effects.godRays.decay;
            sceneManager.godRaysPass.uniforms.density.value = this.effects.godRays.density;
            sceneManager.godRaysPass.uniforms.weight.value = this.effects.godRays.weight;
            sceneManager.godRaysPass.uniforms.samples.value = this.effects.godRays.samples;
            sceneManager.godRaysPass.enabled = true;
        } else {
            sceneManager.godRaysPass.enabled = false;
        }
    }
    
    _updateLensflare() {
        const solarSystem = window.app?.solarSystem;
        if (!solarSystem || !solarSystem.sunLight) return;
        
        // Lensflare is added as a child of sunLight
        // Find it and toggle visibility
        const lensflare = solarSystem.lensflare || 
            solarSystem.sunLight.children.find(child => child.type === 'Lensflare');
        
        if (lensflare) {
            if (this.effects.lensflare.enabled) {
                lensflare.visible = true;
            } else {
                lensflare.visible = false;
            }
        } else if (this.effects.lensflare.enabled && typeof THREE.Lensflare !== 'undefined') {
            // Create lensflare if it doesn't exist and is being enabled
            solarSystem.createLensflare();
        }
    }
    
    _updateAtmosphere() {
        const solarSystem = window.app?.solarSystem;
        if (!solarSystem || !solarSystem.planets) return;
        
        Object.values(solarSystem.planets).forEach(planet => {
            if (planet.userData && planet.userData.atmosphere) {
                const atmo = planet.userData.atmosphere;
                if (this.effects.atmosphere.enabled) {
                    atmo.visible = true;
                    if (atmo.material.uniforms && atmo.material.uniforms.intensity) {
                        // Update intensity for all planets except Venus (which has its own)
                        const planetId = planet.userData.zoneId;
                        if (planetId === 'venus') {
                            atmo.material.uniforms.intensity.value = this.effects.atmosphere.intensity * 1.33; // Venus is 0.8 vs 0.6
                        } else {
                            atmo.material.uniforms.intensity.value = this.effects.atmosphere.intensity;
                        }
                    }
                } else {
                    atmo.visible = false;
                }
            }
        });
    }
    
    toggle() {
        this.isVisible = !this.isVisible;
        const panel = this.container.querySelector('.visual-effects-panel');
        if (panel) {
            panel.style.display = this.isVisible ? 'block' : 'none';
        }
    }
    
    show() {
        this.isVisible = true;
        const panel = this.container.querySelector('.visual-effects-panel');
        if (panel) {
            panel.style.display = 'block';
        }
    }
    
    hide() {
        this.isVisible = false;
        const panel = this.container.querySelector('.visual-effects-panel');
        if (panel) {
            panel.style.display = 'none';
        }
    }
}

