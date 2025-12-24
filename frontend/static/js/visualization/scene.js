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
            this.renderer.setPixelRatio(window.devicePixelRatio);
            
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
                this.renderer.setPixelRatio(window.devicePixelRatio);
                
                // Enable shadow maps
                this.renderer.shadowMap.enabled = true;
                this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            } catch (fallbackError) {
                console.error('Failed to create fallback WebGL renderer:', fallbackError);
                throw new Error('WebGL is not supported in this browser');
            }
        }

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambientLight);

        // Sun (central light source) - will be enhanced in solar_system.js
        const sunLight = new THREE.PointLight(0xffffff, 2, 1000);
        sunLight.position.set(0, 0, 0);
        this.scene.add(sunLight);

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
            this.cameraController.zoom(delta * 0.5);
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

        // Update camera controller
        const deltaTime = 0.016; // ~60fps

        // Handle arrow key rotation
        if (this.keys['ArrowLeft']) {
            this.cameraController.rotate(-1 * deltaTime * 60, 0);
        }
        if (this.keys['ArrowRight']) {
            this.cameraController.rotate(1 * deltaTime * 60, 0);
        }
        if (this.keys['ArrowUp']) {
            this.cameraController.rotate(0, -1 * deltaTime * 60);
        }
        if (this.keys['ArrowDown']) {
            this.cameraController.rotate(0, 1 * deltaTime * 60);
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

        this.cameraController.update(deltaTime);

        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
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
        this.zoomSpeed = 0.5;
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
        if (pos) {
            this.targetPanOffset.copy(pos);
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

