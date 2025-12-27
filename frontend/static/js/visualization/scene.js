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
        this.trackingMode = null; // 'comet', 'transfer', or null
        
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
        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
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
            this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
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
                this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
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

        // Handle arrow keys for comet/transfer navigation when tracking
        if (this.keys['ArrowLeft']) {
            if (this.trackingMode === 'comet' && !this.arrowLeftPressed) {
                // Navigate to previous comet
                this.arrowLeftPressed = true;
                this.cycleToPreviousComet();
            } else if (this.trackingMode === 'transfer' && !this.arrowLeftPressed) {
                // Navigate to previous transfer
                this.arrowLeftPressed = true;
                this.cycleToPreviousTransfer();
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
            }
        } else {
            this.arrowRightPressed = false;
        }
        
        // WASD for panning
        if (this.keys['a'] || this.keys['A']) {
            this.cameraController.pan(-1, 0, deltaTime);
        }
        if (this.keys['d'] || this.keys['D']) {
            this.cameraController.pan(1, 0, deltaTime);
        }
        if (this.keys['w'] || this.keys['W']) {
            this.cameraController.pan(0, 1, deltaTime);
        }
        if (this.keys['s'] || this.keys['S']) {
            this.cameraController.pan(0, -1, deltaTime);
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
        
        // Handle 'i' key to toggle transfer info overlay visibility (only when tracking transfers)
        if ((this.keys['i'] || this.keys['I']) && !this.infoKeyPressed) {
            this.infoKeyPressed = true;
            if (this.trackingMode === 'transfer') {
                this.toggleTransferInfo();
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
        const bloomParams = {
            strength: 0.2,      // Intensity of bloom
            radius: 0.1,        // Blur radius
            threshold: 0.3      // Brightness threshold for bloom
        };
        this.bloomPass = new THREE.UnrealBloomPass(
            new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight),
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
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

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

