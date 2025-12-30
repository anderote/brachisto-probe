/** Three.js scene setup and management with custom camera controls */
class SceneManager {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.cameraController = null;
        this.animationId = null;
        this.keys = {};
        this.solarSystem = null; // Reference to solar system for comet tracking
        this.transferViz = null; // Reference to transfer visualization for line toggling
        this.currentCometIndex = -1; // -1 means not tracking any comet
        this.currentTransferIndex = -1; // -1 means not tracking any transfer
        this.cometKeyPressed = false; // Track if 'c' key was just pressed (to avoid rapid cycling)
        this.transferKeyPressed = false; // Track if 'm' key was just pressed (to avoid rapid cycling)
        this.arrowLeftPressed = false; // Track arrow key state for comet/transfer navigation
        this.arrowRightPressed = false; // Track arrow key state for comet/transfer navigation
        this.tabKeyPressed = false; // Track if Tab key was just pressed (to avoid rapid toggling)
        this.infoKeyPressed = false; // Track if 'i' key was just pressed (to avoid rapid toggling)
        this.orbitalLinesVisible = true; // Current visibility state of orbital lines
        this.transferInfoVisible = true; // Current visibility state of transfer info overlay
        this.trackingMode = null; // 'comet', 'transfer', 'planet', or null
        this.currentPlanetMoonIndex = -1; // -1 = planet, 0+ = moon index
        this.currentPlanetZoneId = null; // Currently tracked planet zone ID
        this.planetMoonInfoVisible = false; // Current visibility state of planet/moon info overlay
        
        // Post-processing
        this.composer = null;
        this.bloomPass = null;
        this.godRaysPass = null;
    }

    init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);

        // Camera - wide FOV for solar system view
        // Get dimensions from parent container for proper sizing
        const container = this.canvas.parentElement;
        const aspect = container.clientWidth / container.clientHeight;
        // Parameters: FOV (degrees), aspect ratio, near clipping plane, far clipping plane
        // Increased far clipping plane from 10000 to 50000 to match increased maxZoom
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 50000);
        this.camera.position.set(0, 0, 15);

        // Renderer
        try {
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: true
            });
            this.renderer.setSize(container.clientWidth, container.clientHeight);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            
            // Enable HDR tone mapping for better bloom
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.0;
            this.renderer.outputEncoding = THREE.sRGBEncoding;
            
            // Enable shadow maps
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        } catch (error) {
            console.error('Failed to create WebGL renderer:', error);
            // Try fallback renderer without antialiasing
            try {
                this.renderer = new THREE.WebGLRenderer({
                    canvas: this.canvas,
                    antialias: false
                });
                this.renderer.setSize(container.clientWidth, container.clientHeight);
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                
                // Enable HDR tone mapping for better bloom
                this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
                this.renderer.toneMappingExposure = 1.0;
                this.renderer.outputEncoding = THREE.sRGBEncoding;
                
                // Enable shadow maps
                this.renderer.shadowMap.enabled = true;
                this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            } catch (fallbackError) {
                console.error('Failed to create fallback WebGL renderer:', fallbackError);
                throw new Error('WebGL is not supported in this browser');
            }
        }

        // Lighting - reduced ambient light for more dramatic shadows
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
        this.scene.add(ambientLight);

        // Sun (central light source) - will be enhanced in solar_system.js
        const sunLight = new THREE.PointLight(0xffffff, 2, 1000);
        sunLight.position.set(0, 0, 0);
        this.scene.add(sunLight);

        // Initialize post-processing
        this.initPostProcessing();

        // Initialize custom camera controller
        this.cameraController = new CameraController(this.camera);

        // Set up keyboard controls
        this.setupKeyboardControls();

        // Set up mouse wheel zoom
        this.setupMouseControls();

        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());

        this.animate();
    }

    setupKeyboardControls() {
        // Track key states
        document.addEventListener('keydown', (e) => {
            // Only handle arrow keys when not in input/textarea
            const activeElement = document.activeElement;
            if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
                return;
            }

            this.keys[e.key] = true;

            // Prevent default scrolling for arrow keys
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
            }
            
            // Prevent Tab key default behavior (focus switching) when in game
            if (e.key === 'Tab') {
                e.preventDefault();
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
    }

    setupMouseControls() {
        // Mouse wheel zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 1 : -1;
            this.cameraController.zoom(delta * 1.2);
        }, { passive: false });

        // Mouse drag for 3D rotation
        let isDragging = false;
        let isRightDragging = false;
        let lastMouseX = 0;
        let lastMouseY = 0;

        this.canvas.addEventListener('mousedown', (e) => {
            // Left mouse button for rotation
            if (e.button === 0) {
                isDragging = true;
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
                this.canvas.style.cursor = 'grabbing';
            }
            // Right mouse button for panning
            else if (e.button === 2) {
                isRightDragging = true;
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
                this.canvas.style.cursor = 'move';
                e.preventDefault();
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const deltaX = e.clientX - lastMouseX;
                const deltaY = e.clientY - lastMouseY;
                
                // Rotate camera around the origin
                this.cameraController.rotate(deltaX * 0.01, deltaY * 0.01);
                
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
            } else if (isRightDragging) {
                const deltaX = e.clientX - lastMouseX;
                const deltaY = e.clientY - lastMouseY;
                
                // Pan camera
                const panSpeed = 0.01 * (this.camera.position.length() / 15);
                this.cameraController.pan(
                    -deltaX * panSpeed,
                    deltaY * panSpeed,
                    1.0
                );
                
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
            }
        });

        this.canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                isDragging = false;
                this.canvas.style.cursor = 'default';
            } else if (e.button === 2) {
                isRightDragging = false;
                this.canvas.style.cursor = 'default';
            }
        });

        this.canvas.addEventListener('mouseleave', () => {
            isDragging = false;
            isRightDragging = false;
            this.canvas.style.cursor = 'default';
        });

        // Prevent context menu on right click
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        
        // Track FPS for debug panel
        if (window.debugPanel) {
            window.debugPanel.tick();
        }

        // Update camera controller
        const deltaTime = 0.016; // ~60fps

        // Handle arrow keys for comet/transfer/planet navigation when tracking
        if (this.keys['ArrowLeft']) {
            if (this.trackingMode === 'comet' && !this.arrowLeftPressed) {
                // Navigate to previous comet
                this.arrowLeftPressed = true;
                this.cycleToPreviousComet();
            } else if (this.trackingMode === 'transfer' && !this.arrowLeftPressed) {
                // Navigate to previous transfer
                this.arrowLeftPressed = true;
                this.cycleToPreviousTransfer();
            } else if (this.trackingMode === 'planet' && !this.arrowLeftPressed) {
                // Navigate to previous planet/moon
                this.arrowLeftPressed = true;
                this.cycleToPreviousPlanetMoon();
            }
        } else {
            this.arrowLeftPressed = false;
        }
        if (this.keys['ArrowRight']) {
            if (this.trackingMode === 'comet' && !this.arrowRightPressed) {
                // Navigate to next comet
                this.arrowRightPressed = true;
                this.cycleToNextComet();
            } else if (this.trackingMode === 'transfer' && !this.arrowRightPressed) {
                // Navigate to next transfer
                this.arrowRightPressed = true;
                this.cycleToNextTransfer();
            } else if (this.trackingMode === 'planet' && !this.arrowRightPressed) {
                // Navigate to next planet/moon
                this.arrowRightPressed = true;
                this.cycleToNextPlanetMoon();
            }
        } else {
            this.arrowRightPressed = false;
        }
        
        // WASD for solar-centric movement
        // W/S: Move radially outward/inward from the sun
        // A/D: Orbit clockwise/counter-clockwise around the sun
        if (this.keys['a'] || this.keys['A']) {
            this.cameraController.moveOrbital(-1, deltaTime); // Clockwise
        }
        if (this.keys['d'] || this.keys['D']) {
            this.cameraController.moveOrbital(1, deltaTime); // Counter-clockwise
        }
        if (this.keys['w'] || this.keys['W']) {
            this.cameraController.moveRadial(1, deltaTime); // Outward from sun
        }
        if (this.keys['s'] || this.keys['S']) {
            this.cameraController.moveRadial(-1, deltaTime); // Inward towards sun
        }
        
        // Handle 'c' key to start tracking comets (only if not already tracking comets)
        if ((this.keys['c'] || this.keys['C']) && !this.cometKeyPressed) {
            this.cometKeyPressed = true;
            // Only start tracking if not already tracking a comet
            if (this.trackingMode !== 'comet') {
                this.startCometTracking();
            }
        } else if (!this.keys['c'] && !this.keys['C']) {
            this.cometKeyPressed = false;
        }
        
        // Handle 'm' key to cycle through transfers (start tracking or go to next)
        if ((this.keys['m'] || this.keys['M']) && !this.transferKeyPressed) {
            this.transferKeyPressed = true;
            // If already tracking a transfer, go to next; otherwise start with first
            if (this.trackingMode === 'transfer') {
                this.cycleToNextTransfer();
            } else {
                this.startTransferTracking();
            }
        } else if (!this.keys['m'] && !this.keys['M']) {
            this.transferKeyPressed = false;
        }
        
        // Handle Tab key to toggle orbital lines visibility
        if (this.keys['Tab'] && !this.tabKeyPressed) {
            this.tabKeyPressed = true;
            this.toggleOrbitalLines();
        } else if (!this.keys['Tab']) {
            this.tabKeyPressed = false;
        }
        
        // Handle 'i' key to toggle transfer/planet/comet info overlay visibility
        if ((this.keys['i'] || this.keys['I']) && !this.infoKeyPressed) {
            this.infoKeyPressed = true;
            if (this.trackingMode === 'transfer') {
                this.toggleTransferInfo();
            } else if (this.trackingMode === 'planet') {
                this.togglePlanetMoonInfo();
            } else if (this.trackingMode === 'comet') {
                this.toggleCometInfo();
            }
        } else if (!this.keys['i'] && !this.keys['I']) {
            this.infoKeyPressed = false;
        }
        
        // Handle Escape key to stop tracking
        if (this.keys['Escape'] && this.trackingMode) {
            this.stopTracking();
            console.log('Stopped tracking');
        }

        this.cameraController.update(deltaTime);
        
        // Update transfer info overlay with real-time values
        if (this.trackingMode === 'transfer') {
            this.updateTransferInfoRealtime();
        }
        
        // Update planet/moon info overlay with real-time values
        if (this.trackingMode === 'planet') {
            this.updatePlanetMoonInfoRealtime();
        }
        
        // Update comet info overlay with real-time values
        if (this.trackingMode === 'comet') {
            this.updateCometInfoRealtime();
        }

        // Update god rays light position based on sun's screen position
        if (this.godRaysPass) {
            const sunPos = new THREE.Vector3(0, 0, 0);
            sunPos.project(this.camera);
            this.godRaysPass.uniforms.lightPositionOnScreen.value.set(
                (sunPos.x + 1) / 2,
                (sunPos.y + 1) / 2
            );
        }

        // Render with post-processing
        if (this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    initPostProcessing() {
        // Create EffectComposer
        this.composer = new THREE.EffectComposer(this.renderer);

        // Render pass (renders the scene normally first)
        const renderPass = new THREE.RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Bloom pass for glowing sun and stars
        const container = this.canvas.parentElement;
        const bloomParams = {
            strength: 0.2,      // Intensity of bloom
            radius: 0.1,        // Blur radius
            threshold: 0.3      // Brightness threshold for bloom
        };
        this.bloomPass = new THREE.UnrealBloomPass(
            new THREE.Vector2(container.clientWidth, container.clientHeight),
            bloomParams.strength,
            bloomParams.radius,
            bloomParams.threshold
        );
        this.bloomPass.enabled = false;  // Disabled by default
        this.composer.addPass(this.bloomPass);
        
        // God rays pass (custom volumetric light scattering)
        this.godRaysPass = new THREE.ShaderPass(this.getGodRaysShader());
        this.godRaysPass.uniforms.lightPositionOnScreen.value = new THREE.Vector2(0.5, 0.5);
        this.godRaysPass.uniforms.exposure.value = 0.18;
        this.godRaysPass.uniforms.decay.value = 0.95;
        this.godRaysPass.uniforms.density.value = 0.8;
        this.godRaysPass.uniforms.weight.value = 0.4;
        this.godRaysPass.uniforms.samples.value = 50;
        this.godRaysPass.enabled = false;  // Disabled by default
        this.composer.addPass(this.godRaysPass);
    }

    getGodRaysShader() {
        return {
            uniforms: {
                tDiffuse: { value: null },
                lightPositionOnScreen: { value: new THREE.Vector2(0.5, 0.5) },
                exposure: { value: 0.18 },
                decay: { value: 0.95 },
                density: { value: 0.8 },
                weight: { value: 0.4 },
                samples: { value: 50 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform vec2 lightPositionOnScreen;
                uniform float exposure;
                uniform float decay;
                uniform float density;
                uniform float weight;
                uniform int samples;
                
                varying vec2 vUv;
                
                void main() {
                    vec2 texCoord = vUv;
                    vec2 deltaTextCoord = texCoord - lightPositionOnScreen;
                    deltaTextCoord *= 1.0 / float(samples) * density;
                    
                    vec4 color = texture2D(tDiffuse, texCoord);
                    float illuminationDecay = 1.0;
                    
                    for(int i = 0; i < 50; i++) {
                        if(i >= samples) break;
                        texCoord -= deltaTextCoord;
                        vec4 sampleColor = texture2D(tDiffuse, texCoord);
                        sampleColor *= illuminationDecay * weight;
                        color += sampleColor;
                        illuminationDecay *= decay;
                    }
                    
                    gl_FragColor = color * exposure;
                }
            `
        };
    }

    onWindowResize() {
        // Get dimensions from parent container since canvas may have fixed width/height attributes
        const container = this.canvas.parentElement;
        const width = container.clientWidth;
        const height = container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);

        // Update composer size
        if (this.composer) {
            this.composer.setSize(width, height);
        }
        if (this.bloomPass) {
            this.bloomPass.setSize(width, height);
        }
    }

    getScene() {
        return this.scene;
    }

    getCamera() {
        return this.camera;
    }

    getCameraPosition() {
        return {
            x: this.camera.position.x,
            y: this.camera.position.y,
            z: this.camera.position.z
        };
    }
    
    /**
     * Start tracking a target position (camera will follow it)
     * @param {Function} getPositionFn - Function that returns the current THREE.Vector3 position
     */
    startTracking(getPositionFn) {
        // Hide transfer info when switching to non-transfer tracking (e.g., zone or comet)
        if (this.trackingMode !== 'transfer') {
            this.hideTransferInfo();
        }
        
        if (this.cameraController) {
            this.cameraController.startTracking(getPositionFn);
        }
    }
    
    /**
     * Stop tracking and return camera to origin
     */
    stopTracking() {
        if (this.cameraController) {
            this.cameraController.stopTracking();
        }
        this.currentCometIndex = -1;
        this.currentTransferIndex = -1;
        
        // Hide planet/moon info if we were tracking a planet
        if (this.trackingMode === 'planet') {
            this.hidePlanetMoonInfo();
            this.currentPlanetZoneId = null;
            this.currentPlanetMoonIndex = -1;
        }
        
        // Hide comet info if we were tracking a comet
        if (this.trackingMode === 'comet') {
            this.hideCometInfo();
        }
        
        this.trackingMode = null;
        this.hideTransferInfo();
    }
    
    /**
     * Set reference to solar system for comet tracking
     */
    setSolarSystem(solarSystem) {
        this.solarSystem = solarSystem;
    }
    
    /**
     * Set reference to transfer visualization for line toggling
     */
    setTransferViz(transferViz) {
        this.transferViz = transferViz;
    }
    
    /**
     * Toggle visibility of all orbital lines, trajectories, and other non-physical visual elements
     * Includes: planet orbits, comet orbits, transfer arcs
     */
    toggleOrbitalLines() {
        // Toggle the visibility state
        this.orbitalLinesVisible = !this.orbitalLinesVisible;
        
        // Toggle solar system orbital lines (planet orbits, comet orbits)
        if (this.solarSystem && this.solarSystem.toggleOrbitalLines) {
            this.solarSystem.toggleOrbitalLines(this.orbitalLinesVisible);
        }
        
        // Toggle transfer visualization lines
        if (this.transferViz && this.transferViz.toggleTransferLines) {
            this.transferViz.toggleTransferLines(this.orbitalLinesVisible);
        }
        
        console.log(`Orbital lines ${this.orbitalLinesVisible ? 'shown' : 'hidden'}`);
    }
    
    /**
     * Toggle visibility of transfer info overlay
     */
    toggleTransferInfo() {
        this.transferInfoVisible = !this.transferInfoVisible;
        
        const overlay = document.getElementById('transfer-info-overlay');
        if (overlay) {
            if (this.transferInfoVisible && this.currentTrackedTransfer) {
                overlay.style.display = 'block';
            } else {
                overlay.style.display = 'none';
            }
        }
        
        console.log(`Transfer info ${this.transferInfoVisible ? 'shown' : 'hidden'} (press I to toggle)`);
    }
    
    /**
     * Show transfer info overlay with details about the tracked transfer
     * @param {Object} transferData - Transfer data from getActiveTransfers()
     */
    showTransferInfo(transferData) {
        const overlay = document.getElementById('transfer-info-overlay');
        if (!overlay) return;
        
        const viz = transferData.viz;
        if (!viz) {
            this.hideTransferInfo();
            return;
        }
        
        // Get current game time
        const gameState = window.gameEngine?.getGameState();
        const currentTime = gameState?.time || 0;
        
        // Get zone names for display
        const fromZoneName = this.formatZoneName(viz.fromZoneId);
        const toZoneName = this.formatZoneName(viz.toZoneId);
        
        // Get resource type and cargo mass from game state transfer object
        let resourceType = viz.resourceType || 'probe';
        let cargoMass = 0;
        
        const activeTransfersState = gameState?.active_transfers || [];
        const transferId = transferData.id;
        const transfer = activeTransfersState.find(t => {
            // Check if ID matches directly or if it's a batch ID
            if (t.id === transferId) return true;
            // For batch IDs, check if it starts with transfer ID
            if (transferId.includes('_') && transferId.startsWith(t.id + '_')) return true;
            return false;
        });
        
        if (transfer) {
            if (transfer.resource_type) {
                resourceType = transfer.resource_type;
            }
            // Calculate cargo mass
            if (resourceType === 'metal') {
                cargoMass = transfer.metal_kg || 0;
            } else {
                // Probe mass: 100 kg per probe
                const probeCount = transfer.probe_count || 0;
                cargoMass = probeCount * 100;
            }
        }
        
        const resourceLabel = resourceType.charAt(0).toUpperCase() + resourceType.slice(1) + 's';
        
        // Get arrival time (absolute in-game time)
        const arrivalTime = viz.arrivalTime || 0;
        
        // Get total transfers count
        const activeTransfers = this.getActiveTransfers();
        const transferIndex = this.currentTransferIndex + 1;
        const totalTransfers = activeTransfers.length;
        
        // Calculate current velocity in km/s
        const currentVelocityKmS = this.calculateCurrentTransferVelocityKmS(transferData);
        
        // Format cargo mass
        const formatMass = (kg) => {
            if (kg >= 1e9) return (kg / 1e9).toFixed(2) + ' Gt';
            if (kg >= 1e6) return (kg / 1e6).toFixed(2) + ' Mt';
            if (kg >= 1e3) return (kg / 1e3).toFixed(2) + ' t';
            return kg.toFixed(0) + ' kg';
        };
        
        // Build the overlay content - simple terminal-style left-justified text
        overlay.innerHTML = `
            <div class="transfer-info-line">ID: ${transferData.id}</div>
            <div class="transfer-info-line">Origin: ${fromZoneName}</div>
            <div class="transfer-info-line">Destination: ${toZoneName}</div>
            <div class="transfer-info-line">Cargo: ${resourceLabel}</div>
            <div class="transfer-info-line">Mass: ${formatMass(cargoMass)}</div>
            <div class="transfer-info-line">Current Velocity: <span id="transfer-current-velocity">${currentVelocityKmS.toFixed(2)}</span> km/s</div>
            <div class="transfer-info-line">Arrival: <span id="transfer-eta">${this.formatGameTime(arrivalTime)}</span></div>
            <div class="transfer-info-nav">[${transferIndex}/${totalTransfers}] ← → cycle | I toggle info | ESC exit</div>
        `;
        
        // Respect visibility toggle
        overlay.style.display = this.transferInfoVisible ? 'block' : 'none';
        
        // Store reference for real-time updates
        this.currentTrackedTransfer = transferData;
    }
    
    /**
     * Hide transfer info overlay
     */
    hideTransferInfo() {
        const overlay = document.getElementById('transfer-info-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        this.currentTrackedTransfer = null;
    }
    
    /**
     * Calculate current velocity in km/s by converting from visual velocity
     * Uses the transfer viz's current velocity (visual units/day) and converts to km/s
     * @param {Object} transferData - Transfer data from getActiveTransfers()
     * @returns {number} Current velocity in km/s
     */
    calculateCurrentTransferVelocityKmS(transferData) {
        const viz = transferData?.viz;
        if (!viz) return 0;
        
        // Get transfer timing info
        const gameState = window.gameEngine?.getGameState();
        const currentTime = gameState?.time || 0;
        const departureTime = viz.departureTime || 0;
        const arrivalTime = viz.arrivalTime || 0;
        const tripTime = arrivalTime - departureTime;
        
        if (tripTime <= 0) return 0;
        
        // Calculate elapsed time
        const elapsedTime = currentTime - departureTime;
        
        // Get the current velocity in visual units/day using linear interpolation
        const fromVelocity = viz.fromVelocity || 0;
        const toVelocity = viz.toVelocity || 0;
        const progressRatio = Math.max(0, Math.min(1, elapsedTime / tripTime));
        const currentVisualVelocity = fromVelocity + (toVelocity - fromVelocity) * progressRatio;
        
        if (currentVisualVelocity <= 0) return 0;
        
        // Get arc lengths to calculate conversion factor
        const arcLengthVisual = viz.arcLength || 0;
        const fromAU = viz.fromAU || 0;
        const toAU = viz.toAU || 0;
        
        if (arcLengthVisual <= 0 || fromAU <= 0 || toAU <= 0) return 0;
        
        // Calculate approximate arc length in AU
        // For Hohmann transfer, the arc is half an ellipse with semi-major axis = (r1 + r2) / 2
        // Arc length ≈ π * semi_major_axis for a half ellipse (approximation)
        const semiMajorAxisAU = (fromAU + toAU) / 2;
        const arcLengthAU = Math.PI * semiMajorAxisAU;
        
        // Conversion factor from visual units to AU
        const visualToAU = arcLengthAU / arcLengthVisual;
        
        // Convert visual velocity (visual units/day) to AU/day
        const velocityAUPerDay = currentVisualVelocity * visualToAU;
        
        // Convert AU/day to AU/s (1 day = 86400 seconds)
        const velocityAUPerSec = velocityAUPerDay / 86400;
        
        // Convert AU/s to km/s (1 AU = 149,597,870.7 km)
        const AU_TO_KM = 149597870.7;
        const velocityKmPerSec = velocityAUPerSec * AU_TO_KM;
        
        return velocityKmPerSec;
    }
    
    /**
     * Update transfer info overlay with real-time values
     * Called during animation loop when tracking a transfer
     */
    updateTransferInfoRealtime() {
        if (!this.currentTrackedTransfer) return;
        
        // Calculate current velocity in km/s
        const currentVelocityKmS = this.calculateCurrentTransferVelocityKmS(this.currentTrackedTransfer);
        
        // Update the velocity display
        const velocityElement = document.getElementById('transfer-current-velocity');
        if (velocityElement) {
            velocityElement.textContent = currentVelocityKmS.toFixed(2);
        }
    }
    
    /**
     * Format zone ID to display name
     * @param {string} zoneId - Zone ID
     * @returns {string} Formatted zone name
     */
    formatZoneName(zoneId) {
        if (!zoneId) return 'Unknown';
        
        // Handle special cases
        if (zoneId === 'dyson_sphere' || zoneId === 'dyson') {
            return 'Dyson Sphere';
        }
        
        // Capitalize first letter of each word
        return zoneId.split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    
    /**
     * Format days to a readable string
     * @param {number} days - Time in days
     * @returns {string} Formatted time string
     */
    formatDays(days) {
        if (days < 1) {
            const hours = days * 24;
            return `${hours.toFixed(1)} hours`;
        } else if (days < 365) {
            return `${days.toFixed(1)} days`;
        } else {
            const years = days / 365;
            return `${years.toFixed(2)} years`;
        }
    }
    
    /**
     * Format in-game time (days since start) to a readable absolute time
     * @param {number} days - Time in days since game start
     * @returns {string} Formatted time string (e.g., "Year 2, Day 145")
     */
    formatGameTime(days) {
        if (days <= 0) return 'Day 0';
        
        const years = Math.floor(days / 365);
        const remainingDays = Math.floor(days % 365);
        
        if (years === 0) {
            return `Day ${remainingDays}`;
        } else if (years === 1) {
            return `Year 1, Day ${remainingDays}`;
        } else {
            return `Year ${years}, Day ${remainingDays}`;
        }
    }
    
    /**
     * Start tracking a planet or moon when a zone is selected
     * Called when user selects a zone that has a planet/moon system
     * @param {string} zoneId - Zone ID of the planet
     */
    startPlanetMoonTracking(zoneId) {
        if (!this.solarSystem || !this.solarSystem.planets || !this.solarSystem.planets[zoneId]) {
            return;
        }
        
        // Reset other tracking modes
        this.currentCometIndex = -1;
        this.currentTransferIndex = -1;
        this.hideTransferInfo();
        
        // Start tracking planet (index -1 means planet, 0+ means moon)
        this.currentPlanetZoneId = zoneId;
        this.currentPlanetMoonIndex = -1; // Start with planet
        this.trackingMode = 'planet';
        
        // Show planet/moon info overlay
        this.showPlanetMoonInfo();
        
        // Start tracking the planet
        this.startTracking(() => {
            return this.getPlanetMoonPosition(zoneId, -1);
        });
    }
    
    /**
     * Get the current position of a planet or moon
     * @param {string} zoneId - Zone ID of the planet
     * @param {number} moonIndex - Moon index (-1 for planet, 0+ for moon)
     * @returns {THREE.Vector3|null} Position of the planet/moon
     */
    getPlanetMoonPosition(zoneId, moonIndex) {
        if (!this.solarSystem) return null;
        
        if (moonIndex === -1) {
            // Get planet position
            const planet = this.solarSystem.planets[zoneId];
            if (planet && planet.position) {
                return planet.position.clone();
            }
        } else {
            // Get moon position
            const moons = this.solarSystem.moons[zoneId];
            if (moons && moons[moonIndex] && moons[moonIndex].position) {
                return moons[moonIndex].position.clone();
            }
        }
        
        return null;
    }
    
    /**
     * Cycle to next planet/moon (right arrow)
     */
    cycleToNextPlanetMoon() {
        if (!this.currentPlanetZoneId || !this.solarSystem) return;
        
        const moons = this.solarSystem.moons[this.currentPlanetZoneId] || [];
        
        // Move to next object: -1 (planet) -> 0 (first moon) -> ... -> last moon -> -1 (planet)
        if (this.currentPlanetMoonIndex === -1) {
            // Currently on planet, go to first moon (if any)
            this.currentPlanetMoonIndex = moons.length > 0 ? 0 : -1;
        } else {
            // Currently on a moon
            if (this.currentPlanetMoonIndex < moons.length - 1) {
                // Go to next moon
                this.currentPlanetMoonIndex++;
            } else {
                // Last moon, wrap to planet
                this.currentPlanetMoonIndex = -1;
            }
        }
        
        // Update tracking
        this.startTracking(() => {
            return this.getPlanetMoonPosition(this.currentPlanetZoneId, this.currentPlanetMoonIndex);
        });
        
        // Update info overlay
        this.showPlanetMoonInfo();
    }
    
    /**
     * Cycle to previous planet/moon (left arrow)
     */
    cycleToPreviousPlanetMoon() {
        if (!this.currentPlanetZoneId || !this.solarSystem) return;
        
        const moons = this.solarSystem.moons[this.currentPlanetZoneId] || [];
        const totalObjects = 1 + moons.length; // Planet + moons
        
        // Move to previous object
        if (this.currentPlanetMoonIndex === -1) {
            // Currently on planet, go to last moon
            this.currentPlanetMoonIndex = moons.length > 0 ? moons.length - 1 : -1;
        } else {
            // Currently on a moon
            if (this.currentPlanetMoonIndex === 0) {
                // First moon, go to planet
                this.currentPlanetMoonIndex = -1;
            } else {
                // Previous moon
                this.currentPlanetMoonIndex--;
            }
        }
        
        // Update tracking
        this.startTracking(() => {
            return this.getPlanetMoonPosition(this.currentPlanetZoneId, this.currentPlanetMoonIndex);
        });
        
        // Update info overlay
        this.showPlanetMoonInfo();
    }
    
    /**
     * Toggle visibility of planet/moon info overlay
     */
    togglePlanetMoonInfo() {
        this.planetMoonInfoVisible = !this.planetMoonInfoVisible;
        
        const overlay = document.getElementById('planet-moon-info-overlay');
        if (overlay) {
            if (this.planetMoonInfoVisible && this.trackingMode === 'planet') {
                overlay.style.display = 'block';
            } else {
                overlay.style.display = 'none';
            }
        }
        
        console.log(`Planet/moon info ${this.planetMoonInfoVisible ? 'shown' : 'hidden'} (press I to toggle)`);
    }
    
    /**
     * Show planet/moon info overlay with details
     */
    showPlanetMoonInfo() {
        const overlay = document.getElementById('planet-moon-info-overlay');
        if (!overlay || !this.currentPlanetZoneId || !this.solarSystem) return;
        
        const zoneId = this.currentPlanetZoneId;
        const moonIndex = this.currentPlanetMoonIndex;
        const isPlanet = moonIndex === -1;
        
        // Get planet or moon data
        let name, mass, radiusKm, orbitKm, periodDays, zoneData;
        
        if (isPlanet) {
            // Planet data
            const planet = this.solarSystem.planets[zoneId];
            if (!planet) return;
            
            zoneData = this.solarSystem.orbitalData?.orbital_zones?.find(z => z.id === zoneId);
            const planetInfo = this.solarSystem.planetData[zoneId];
            
            name = zoneData?.name?.replace(/\s+Orbit\s*$/i, '') || zoneId.charAt(0).toUpperCase() + zoneId.slice(1);
            mass = planetInfo?.mass_kg || zoneData?.total_mass_kg || 0;
            radiusKm = planetInfo?.radius_km || zoneData?.body_radius_km || 0;
            orbitKm = planetInfo?.orbit_km || zoneData?.radius_km || 0;
            periodDays = this.solarSystem.getOrbitalPeriod(zoneId);
        } else {
            // Moon data
            const moons = this.solarSystem.moons[zoneId] || [];
            const moon = moons[moonIndex];
            if (!moon || !moon.userData) return;
            
            // Get moon data from userData (stored during creation)
            const moonData = moon.userData.moonData;
            if (!moonData) return;
            
            name = moonData.name || moon.userData.moonName || `Moon ${moonIndex + 1}`;
            mass = moonData.mass_kg || 0;
            radiusKm = moonData.radius_km || 0;
            orbitKm = moonData.orbit_km || 0;
            periodDays = moonData.period_days || 0;
        }
        
        // Calculate orbital velocities
        const velocityWrtSun = this.calculateOrbitalVelocityWrtSun(orbitKm, periodDays);
        const velocityWrtHomePlanet = isPlanet ? 0 : this.calculateOrbitalVelocityWrtPlanet(orbitKm, periodDays, zoneId);
        
        // Format values
        const formatMass = (kg) => {
            if (kg >= 1e27) return (kg / 1e27).toFixed(2) + ' × 10²⁷ kg';
            if (kg >= 1e24) return (kg / 1e24).toFixed(2) + ' × 10²⁴ kg';
            if (kg >= 1e21) return (kg / 1e21).toFixed(2) + ' × 10²¹ kg';
            if (kg >= 1e18) return (kg / 1e18).toFixed(2) + ' × 10¹⁸ kg';
            if (kg >= 1e15) return (kg / 1e15).toFixed(2) + ' × 10¹⁵ kg';
            return kg.toFixed(2) + ' kg';
        };
        
        const formatDistance = (km) => {
            if (km >= 1e9) return (km / 1e9).toFixed(2) + ' × 10⁹ km';
            if (km >= 1e6) return (km / 1e6).toFixed(2) + ' × 10⁶ km';
            if (km >= 1e3) return (km / 1e3).toFixed(2) + ' × 10³ km';
            return km.toFixed(2) + ' km';
        };
        
        const formatPeriod = (days) => {
            if (days >= 365) {
                const years = days / 365;
                return `${years.toFixed(2)} years`;
            }
            return `${days.toFixed(2)} days`;
        };
        
        // Build overlay content
        let html = `<div class="transfer-info-line"><strong>${name}</strong></div>`;
        if (mass > 0) {
            html += `<div class="transfer-info-line">Mass: ${formatMass(mass)}</div>`;
        }
        if (radiusKm > 0) {
            html += `<div class="transfer-info-line">Radius: ${formatDistance(radiusKm)}</div>`;
        }
        if (orbitKm > 0) {
            html += `<div class="transfer-info-line">Orbit: ${formatDistance(orbitKm)}</div>`;
        }
        if (velocityWrtSun > 0) {
            html += `<div class="transfer-info-line">Velocity (w.r.t. Sun): ${velocityWrtSun.toFixed(2)} km/s</div>`;
        }
        if (!isPlanet && velocityWrtHomePlanet > 0) {
            html += `<div class="transfer-info-line">Velocity (w.r.t. ${this.formatZoneName(zoneId)}): ${velocityWrtHomePlanet.toFixed(2)} km/s</div>`;
        }
        if (periodDays > 0) {
            html += `<div class="transfer-info-line">Orbital Period: ${formatPeriod(periodDays)}</div>`;
        }
        
        const moons = this.solarSystem.moons[zoneId] || [];
        const totalObjects = 1 + moons.length;
        const currentIndex = moonIndex === -1 ? 1 : moonIndex + 2;
        html += `<div class="transfer-info-nav">[${currentIndex}/${totalObjects}] ← → cycle | I toggle info | ESC exit</div>`;
        
        overlay.innerHTML = html;
        
        // Respect visibility toggle
        overlay.style.display = this.planetMoonInfoVisible ? 'block' : 'none';
    }
    
    /**
     * Hide planet/moon info overlay
     */
    hidePlanetMoonInfo() {
        const overlay = document.getElementById('planet-moon-info-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }
    
    /**
     * Update planet/moon info overlay with real-time values
     */
    updatePlanetMoonInfoRealtime() {
        // For now, just refresh the info
        // In the future, we could update velocities if they change
        if (this.planetMoonInfoVisible) {
            this.showPlanetMoonInfo();
        }
    }
    
    /**
     * Calculate orbital velocity with respect to the Sun
     * @param {number} orbitKm - Orbital distance in km
     * @param {number} periodDays - Orbital period in days
     * @returns {number} Velocity in km/s
     */
    calculateOrbitalVelocityWrtSun(orbitKm, periodDays) {
        if (orbitKm <= 0 || periodDays <= 0) return 0;
        
        // v = 2πr / T
        const periodSeconds = periodDays * 86400;
        const circumference = 2 * Math.PI * orbitKm;
        return circumference / periodSeconds;
    }
    
    /**
     * Calculate orbital velocity with respect to the home planet
     * @param {number} orbitKm - Orbital distance in km
     * @param {number} periodDays - Orbital period in days
     * @param {string} planetZoneId - Zone ID of the planet
     * @returns {number} Velocity in km/s
     */
    calculateOrbitalVelocityWrtPlanet(orbitKm, periodDays, planetZoneId) {
        if (orbitKm <= 0 || periodDays <= 0) return 0;
        
        // Same formula as Sun, but for moon orbit around planet
        const periodSeconds = periodDays * 86400;
        const circumference = 2 * Math.PI * orbitKm;
        return circumference / periodSeconds;
    }
    
    /**
     * Toggle visibility of comet info overlay
     */
    toggleCometInfo() {
        this.planetMoonInfoVisible = !this.planetMoonInfoVisible;
        
        const overlay = document.getElementById('planet-moon-info-overlay');
        if (overlay) {
            if (this.planetMoonInfoVisible && this.trackingMode === 'comet') {
                this.showCometInfo();
            } else {
                overlay.style.display = 'none';
            }
        }
        
        console.log(`Comet info ${this.planetMoonInfoVisible ? 'shown' : 'hidden'} (press I to toggle)`);
    }
    
    /**
     * Show comet info overlay with details
     */
    showCometInfo() {
        const overlay = document.getElementById('planet-moon-info-overlay');
        if (!overlay || this.currentCometIndex < 0 || !this.solarSystem || !this.solarSystem.comets) return;
        
        const comet = this.solarSystem.comets[this.currentCometIndex];
        if (!comet || !comet.userData) return;
        
        const orbitalData = comet.userData;
        
        // Calculate real orbital parameters from period using Kepler's law: T^2 ∝ a^3
        // T (days) = sqrt((a/AU)^3) * 365.25, so a = (T / 365.25)^(2/3) AU
        const periodYears = orbitalData.orbitalPeriod / 365.25;
        const semiMajorAxisAU = Math.pow(periodYears, 2/3);
        const semiMajorAxisKm = semiMajorAxisAU * this.solarSystem.AU_KM;
        
        // Calculate perihelion and aphelion from semi-major axis and eccentricity
        // perihelion = a(1-e), aphelion = a(1+e)
        const perihelionAU = semiMajorAxisAU * (1 - orbitalData.eccentricity);
        const aphelionAU = semiMajorAxisAU * (1 + orbitalData.eccentricity);
        const perihelionKm = perihelionAU * this.solarSystem.AU_KM;
        const aphelionKm = aphelionAU * this.solarSystem.AU_KM;
        
        // Calculate current distance from sun
        const currentDistanceVisual = comet.position.length();
        // Approximate conversion: use semi-major axis ratio
        // This is approximate since the visual scaling is complex
        const currentDistanceAU = semiMajorAxisAU * (currentDistanceVisual / orbitalData.semiMajorAxis);
        const currentDistanceKm = currentDistanceAU * this.solarSystem.AU_KM;
        
        // Calculate orbital velocity at current position (approximate)
        // v = sqrt(GM(2/r - 1/a)) where r is current distance, a is semi-major axis
        // For circular approximation: v ≈ sqrt(GM/r) ≈ sqrt(1.327e20 / r) km/s
        // Simplified: v ≈ sqrt(1.327e20 / r_km) / 1000 km/s
        const GM = 1.327e20; // Standard gravitational parameter for Sun (km^3/s^2)
        const velocityKmS = Math.sqrt(GM * (2 / currentDistanceKm - 1 / semiMajorAxisKm)) / 1000;
        
        // Format values
        const formatDistance = (km) => {
            if (km >= 1e9) return (km / 1e9).toFixed(2) + ' × 10⁹ km';
            if (km >= 1e6) return (km / 1e6).toFixed(2) + ' × 10⁶ km';
            if (km >= 1e3) return (km / 1e3).toFixed(2) + ' × 10³ km';
            return km.toFixed(2) + ' km';
        };
        
        const formatAU = (au) => {
            return au.toFixed(2) + ' AU';
        };
        
        const formatPeriod = (days) => {
            if (days >= 365) {
                const years = days / 365;
                return `${years.toFixed(2)} years`;
            }
            return `${days.toFixed(2)} days`;
        };
        
        // Build overlay content
        let html = `<div class="transfer-info-line"><strong>Comet ${this.currentCometIndex + 1}</strong></div>`;
        html += `<div class="transfer-info-line">Orbital Period: ${formatPeriod(orbitalData.orbitalPeriod)}</div>`;
        html += `<div class="transfer-info-line">Semi-major Axis: ${formatAU(semiMajorAxisAU)} (${formatDistance(semiMajorAxisKm)})</div>`;
        html += `<div class="transfer-info-line">Eccentricity: ${orbitalData.eccentricity.toFixed(3)}</div>`;
        html += `<div class="transfer-info-line">Perihelion: ${formatAU(perihelionAU)} (${formatDistance(perihelionKm)})</div>`;
        html += `<div class="transfer-info-line">Aphelion: ${formatAU(aphelionAU)} (${formatDistance(aphelionKm)})</div>`;
        html += `<div class="transfer-info-line">Current Distance: ${formatAU(currentDistanceAU)} (${formatDistance(currentDistanceKm)})</div>`;
        html += `<div class="transfer-info-line">Velocity: ${velocityKmS.toFixed(2)} km/s</div>`;
        html += `<div class="transfer-info-line">Inclination: ${(orbitalData.inclination * 180 / Math.PI).toFixed(1)}°</div>`;
        
        const totalComets = this.solarSystem.comets.length;
        html += `<div class="transfer-info-nav">[${this.currentCometIndex + 1}/${totalComets}] ← → cycle | I toggle info | ESC exit</div>`;
        
        overlay.innerHTML = html;
        
        // Respect visibility toggle
        overlay.style.display = this.planetMoonInfoVisible ? 'block' : 'none';
    }
    
    /**
     * Hide comet info overlay
     */
    hideCometInfo() {
        const overlay = document.getElementById('planet-moon-info-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }
    
    /**
     * Update comet info overlay with real-time values
     */
    updateCometInfoRealtime() {
        // Refresh the info to update current distance and velocity
        if (this.planetMoonInfoVisible) {
            this.showCometInfo();
        }
    }

    /**
     * Start tracking the first comet (called when 'c' is pressed and not already tracking)
     */
    startCometTracking() {
        if (!this.solarSystem || !this.solarSystem.comets || this.solarSystem.comets.length === 0) {
            return;
        }
        
        // Reset transfer tracking if active
        this.currentTransferIndex = -1;
        this.hideTransferInfo();
        
        // Start at first comet
        this.currentCometIndex = 0;
        this.trackingMode = 'comet';
        
        const comet = this.solarSystem.comets[this.currentCometIndex];
        
        if (comet) {
            this.startTracking(() => {
                if (comet && comet.position) {
                    return comet.position.clone();
                }
                return null;
            });
            
            // Show comet info overlay
            this.planetMoonInfoVisible = true; // Reuse the same visibility flag
            this.showCometInfo();
        }
    }
    
    /**
     * Cycle camera to next comet in the list
     */
    cycleToNextComet() {
        if (!this.solarSystem || !this.solarSystem.comets || this.solarSystem.comets.length === 0) {
            // No comets available, stop tracking if we were tracking
            if (this.currentCometIndex >= 0) {
                this.stopTracking();
            }
            return;
        }
        
        // Move to next comet, or wrap around to first
        this.currentCometIndex = (this.currentCometIndex + 1) % this.solarSystem.comets.length;
        
        // Get the comet at current index
        const comet = this.solarSystem.comets[this.currentCometIndex];
        
        if (comet) {
            // Start tracking this comet
            this.startTracking(() => {
                // Return current position of the comet
                if (comet && comet.position) {
                    return comet.position.clone();
                }
                return null;
            });
            
            // Update comet info overlay
            this.showCometInfo();
        }
    }
    
    /**
     * Cycle camera to previous comet in the list
     */
    cycleToPreviousComet() {
        if (!this.solarSystem || !this.solarSystem.comets || this.solarSystem.comets.length === 0) {
            // No comets available, stop tracking if we were tracking
            if (this.currentCometIndex >= 0) {
                this.stopTracking();
            }
            return;
        }
        
        // Move to previous comet, or wrap around to last
        this.currentCometIndex = (this.currentCometIndex - 1 + this.solarSystem.comets.length) % this.solarSystem.comets.length;
        
        // Get the comet at current index
        const comet = this.solarSystem.comets[this.currentCometIndex];
        
        if (comet) {
            // Start tracking this comet
            this.startTracking(() => {
                // Return current position of the comet
                if (comet && comet.position) {
                    return comet.position.clone();
                }
                return null;
            });
            
            // Update comet info overlay
            this.showCometInfo();
        }
    }
    
    /**
     * Get list of active transfers from transferViz
     * Returns array of transfer visualization objects that have active dots
     */
    getActiveTransfers() {
        if (!this.transferViz) {
            console.log('[getActiveTransfers] No transferViz reference');
            return [];
        }
        
        const activeTransfers = [];
        
        // Get one-time transfers
        if (this.transferViz.transfers) {
            const oneTimeCount = this.transferViz.transfers.size;
            for (const [transferId, transferViz] of this.transferViz.transfers.entries()) {
                if (transferViz.dot) {
                    activeTransfers.push({
                        id: transferId,
                        type: 'one-time',
                        viz: transferViz
                    });
                }
            }
            if (oneTimeCount > 0) {
                console.log(`[getActiveTransfers] Found ${oneTimeCount} one-time transfer entries, ${activeTransfers.length} have dots`);
            }
        }
        
        // Get continuous transfer batches
        if (this.transferViz.continuousBatches) {
            const batchCount = this.transferViz.continuousBatches.size;
            const prevCount = activeTransfers.length;
            for (const [batchId, batchViz] of this.transferViz.continuousBatches.entries()) {
                if (batchViz.dot) {
                    activeTransfers.push({
                        id: batchId,
                        type: 'continuous',
                        viz: batchViz
                    });
                }
            }
            if (batchCount > 0) {
                console.log(`[getActiveTransfers] Found ${batchCount} continuous batch entries, ${activeTransfers.length - prevCount} have dots`);
            }
        }
        
        return activeTransfers;
    }
    
    /**
     * Get the position of a transfer's cargo dot
     * @param {Object} transferData - Transfer data from getActiveTransfers()
     * @returns {THREE.Vector3|null} Position of the cargo dot
     */
    getTransferDotPosition(transferData) {
        const viz = transferData.viz;
        if (!viz || !viz.dot) {
            return null;
        }
        
        // Handle array of dots (metal transfers) - use the lead dot
        if (Array.isArray(viz.dot)) {
            // Find first visible dot
            for (const dot of viz.dot) {
                if (dot.visible && dot.position) {
                    return dot.position.clone();
                }
            }
            // Fallback to first dot if none visible
            if (viz.dot.length > 0 && viz.dot[0].position) {
                return viz.dot[0].position.clone();
            }
        } else if (viz.dot.position) {
            return viz.dot.position.clone();
        }
        
        return null;
    }
    
    /**
     * Start tracking the first active transfer (called when 't' is pressed)
     */
    startTransferTracking() {
        const activeTransfers = this.getActiveTransfers();
        
        console.log('[TransferTracking] Found', activeTransfers.length, 'active transfers');
        
        if (activeTransfers.length === 0) {
            console.log('No active transfers to track');
            return;
        }
        
        // Reset comet tracking if active
        this.currentCometIndex = -1;
        
        // Start at first transfer
        this.currentTransferIndex = 0;
        this.trackingMode = 'transfer';
        
        const transferData = activeTransfers[this.currentTransferIndex];
        console.log(`[TransferTracking] Tracking transfer ${this.currentTransferIndex + 1}/${activeTransfers.length}: ${transferData.id}`);
        
        // Debug: log the initial dot position
        const initialPos = this.getTransferDotPosition(transferData);
        console.log('[TransferTracking] Initial dot position:', initialPos ? `(${initialPos.x.toFixed(2)}, ${initialPos.y.toFixed(2)}, ${initialPos.z.toFixed(2)})` : 'null');
        
        // Show transfer info overlay
        this.showTransferInfo(transferData);
        
        this.startTracking(() => {
            // Re-get active transfers each frame in case they change
            const currentTransfers = this.getActiveTransfers();
            if (this.currentTransferIndex >= 0 && this.currentTransferIndex < currentTransfers.length) {
                const pos = this.getTransferDotPosition(currentTransfers[this.currentTransferIndex]);
                return pos;
            }
            return null;
        });
    }
    
    /**
     * Cycle camera to next transfer in the list
     */
    cycleToNextTransfer() {
        const activeTransfers = this.getActiveTransfers();
        
        console.log('[CycleTransfer] Right arrow pressed, active transfers:', activeTransfers.length);
        
        if (activeTransfers.length === 0) {
            // No transfers available, stop tracking
            console.log('[CycleTransfer] No transfers available, stopping tracking');
            if (this.currentTransferIndex >= 0) {
                this.stopTracking();
            }
            return;
        }
        
        // Move to next transfer, or wrap around to first
        this.currentTransferIndex = (this.currentTransferIndex + 1) % activeTransfers.length;
        
        const transferData = activeTransfers[this.currentTransferIndex];
        console.log(`[CycleTransfer] Tracking transfer ${this.currentTransferIndex + 1}/${activeTransfers.length}: ${transferData.id}`);
        
        // Update transfer info overlay
        this.showTransferInfo(transferData);
        
        this.startTracking(() => {
            const currentTransfers = this.getActiveTransfers();
            if (this.currentTransferIndex >= 0 && this.currentTransferIndex < currentTransfers.length) {
                return this.getTransferDotPosition(currentTransfers[this.currentTransferIndex]);
            }
            return null;
        });
    }
    
    /**
     * Cycle camera to previous transfer in the list
     */
    cycleToPreviousTransfer() {
        const activeTransfers = this.getActiveTransfers();
        
        if (activeTransfers.length === 0) {
            // No transfers available, stop tracking
            if (this.currentTransferIndex >= 0) {
                this.stopTracking();
            }
            return;
        }
        
        // Move to previous transfer, or wrap around to last
        this.currentTransferIndex = (this.currentTransferIndex - 1 + activeTransfers.length) % activeTransfers.length;
        
        const transferData = activeTransfers[this.currentTransferIndex];
        console.log(`Tracking transfer ${this.currentTransferIndex + 1}/${activeTransfers.length}: ${transferData.id}`);
        
        // Update transfer info overlay
        this.showTransferInfo(transferData);
        
        this.startTracking(() => {
            const currentTransfers = this.getActiveTransfers();
            if (this.currentTransferIndex >= 0 && this.currentTransferIndex < currentTransfers.length) {
                return this.getTransferDotPosition(currentTransfers[this.currentTransferIndex]);
            }
            return null;
        });
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        this.renderer.dispose();
    }
}

/** Custom camera controller for 3D rotation, panning and zooming */
class CameraController {
    constructor(camera) {
        this.camera = camera;
        this.panSpeed = 0.5;
        this.zoomSpeed = 0.84; // Reduced by 30% from 1.2
        this.rotationSpeed = 1.0;
        
        // Spherical coordinates for rotation
        this.radius = 15;
        this.theta = 0; // Horizontal angle (azimuth)
        this.phi = Math.PI / 2; // Vertical angle (polar), start at top-down view
        
        // Pan offset from origin
        this.panOffset = new THREE.Vector3(0, 0, 0);
        
        this.targetRadius = 15;
        this.targetPanOffset = new THREE.Vector3(0, 0, 0);
        this.minZoom = 1;
        this.maxZoom = 2000; // Increased from 500 to allow zooming out further
        this.smoothness = 0.1;
        
        // Tracking state
        this.trackingTarget = null; // Function that returns current position to track
        this.isTracking = false;
        
        // Update initial position
        this.updatePosition();
    }
    
    /**
     * Start tracking a target position
     * @param {Function} getPositionFn - Function that returns the current THREE.Vector3 position to track
     */
    startTracking(getPositionFn) {
        this.trackingTarget = getPositionFn;
        this.isTracking = true;
        
        // Immediately move to the target
        const pos = getPositionFn();
        console.log('[CameraController] startTracking - initial position:', pos ? `(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})` : 'null');
        if (pos) {
            this.targetPanOffset.copy(pos);
            console.log('[CameraController] targetPanOffset set to:', `(${this.targetPanOffset.x.toFixed(2)}, ${this.targetPanOffset.y.toFixed(2)}, ${this.targetPanOffset.z.toFixed(2)})`);
        } else {
            console.warn('[CameraController] No initial position provided - camera will not move');
        }
    }
    
    /**
     * Stop tracking and return camera to origin
     */
    stopTracking() {
        this.trackingTarget = null;
        this.isTracking = false;
        this.targetPanOffset.set(0, 0, 0);
    }

    rotate(deltaTheta, deltaPhi) {
        this.theta += deltaTheta;
        this.phi += deltaPhi;
        
        // Clamp phi to prevent flipping
        this.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.phi));
    }

    pan(deltaX, deltaY, deltaTime) {
        // Pan in camera's local space
        // If deltaTime is 1.0, use direct delta (for mouse drag)
        // Otherwise use time-based movement (for keyboard)
        const panAmount = deltaTime === 1.0 ? deltaX : this.panSpeed * deltaTime * 60;
        const panAmountY = deltaTime === 1.0 ? deltaY : this.panSpeed * deltaTime * 60;
        
        // Calculate camera's right and up vectors
        const forward = new THREE.Vector3(0, 0, 0).sub(this.camera.position).normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();
        
        // Apply pan in camera space
        const rightPan = right.clone().multiplyScalar(panAmount);
        const upPan = up.clone().multiplyScalar(panAmountY);
        this.targetPanOffset.add(rightPan);
        this.targetPanOffset.add(upPan);
    }

    /**
     * Move the camera radially towards/away from the sun (origin)
     * @param {number} direction - Positive for outward, negative for inward
     * @param {number} deltaTime - Time delta for smooth movement
     */
    moveRadial(direction, deltaTime) {
        const moveAmount = this.panSpeed * deltaTime * 60;
        
        // Get the current position in XZ plane (ignore Y for orbital plane movement)
        const currentPos = new THREE.Vector2(this.targetPanOffset.x, this.targetPanOffset.z);
        const distance = currentPos.length();
        
        if (distance < 0.001) {
            // If at origin, move in the direction the camera is facing
            const radialDir = new THREE.Vector2(
                -Math.cos(this.theta),
                -Math.sin(this.theta)
            ).normalize();
            this.targetPanOffset.x += radialDir.x * moveAmount * direction;
            this.targetPanOffset.z += radialDir.y * moveAmount * direction;
        } else {
            // Move along the radial direction from origin
            const radialDir = currentPos.clone().normalize();
            this.targetPanOffset.x += radialDir.x * moveAmount * direction;
            this.targetPanOffset.z += radialDir.y * moveAmount * direction;
        }
    }

    /**
     * Move the camera orbitally around the sun (counter-clockwise/clockwise)
     * The camera theta rotates with the movement so the camera "follows" the orbit
     * @param {number} direction - Positive for counter-clockwise, negative for clockwise
     * @param {number} deltaTime - Time delta for smooth movement
     */
    moveOrbital(direction, deltaTime) {
        const orbitSpeed = 0.5; // Radians per second base speed
        const angularMove = orbitSpeed * deltaTime * direction;
        
        // Get current orbital radius in XZ plane
        const currentPos = new THREE.Vector2(this.targetPanOffset.x, this.targetPanOffset.z);
        const orbitalRadius = currentPos.length();
        
        if (orbitalRadius < 0.001) {
            // If at origin, just rotate the camera view
            this.theta += angularMove;
        } else {
            // Calculate current angle in XZ plane
            const currentAngle = Math.atan2(this.targetPanOffset.z, this.targetPanOffset.x);
            
            // Calculate new angle
            const newAngle = currentAngle + angularMove;
            
            // Update position while maintaining orbital radius
            this.targetPanOffset.x = orbitalRadius * Math.cos(newAngle);
            this.targetPanOffset.z = orbitalRadius * Math.sin(newAngle);
            
            // Rotate the camera theta by the same amount so it "follows" the orbit
            // This keeps the sun in the same relative position in the view
            this.theta += angularMove;
        }
    }

    zoom(delta) {
        this.targetRadius = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetRadius + delta * this.zoomSpeed));
    }

    updatePosition() {
        // Calculate position from spherical coordinates
        const x = this.radius * Math.sin(this.phi) * Math.cos(this.theta);
        const y = this.radius * Math.cos(this.phi);
        const z = this.radius * Math.sin(this.phi) * Math.sin(this.theta);
        
        this.camera.position.set(x, y, z);
        this.camera.position.add(this.panOffset);
    }

    update(deltaTime) {
        // If tracking, update target pan offset to current tracked position
        if (this.isTracking && this.trackingTarget) {
            const targetPos = this.trackingTarget();
            if (targetPos) {
                this.targetPanOffset.copy(targetPos);
            }
        }
        
        // Smooth interpolation for radius
        this.radius += (this.targetRadius - this.radius) * this.smoothness;
        
        // Smooth interpolation for pan offset
        this.panOffset.lerp(this.targetPanOffset, this.smoothness);
        
        // Update position
        this.updatePosition();

        // Always look at the pan offset (tracked object or origin)
        this.camera.lookAt(this.panOffset);
    }
}

