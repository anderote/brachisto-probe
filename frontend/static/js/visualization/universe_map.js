/**
 * Universe Map Visualization
 *
 * Phase 3: Observable Universe scale visualization
 * - Cosmic web structure with ~400,000 galaxies
 * - Voronoi-based large-scale structure (voids, walls, filaments, nodes)
 * - Highlights Laniakea supercluster (our location)
 * - Known superclusters: Virgo, Perseus-Pisces, Coma, Shapley, etc.
 * - Full gameplay: intergalactic colonization and resource tracking
 *
 * Follows patterns from StarMapVisualization for consistency.
 */
class UniverseMapVisualization {
    constructor() {
        // State flags
        this.isActive = false;
        this.isInitialized = false;

        // Three.js components (separate scene from galaxy view)
        this.container = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        // Animation
        this.animationId = null;
        this.time = 0;
        this.frameCount = 0;

        // Data
        this.universeData = null;
        this.cosmicWebGenerator = null;

        // Galaxy points
        this.galaxyPoints = null;
        this.galaxyPositions = null;
        this.galaxyColors = null;
        this.galaxyTypes = null;

        // Superclusters
        this.superclusterMeshes = {};
        this.superclusterLabels = [];
        this.superclusterLabelsContainer = null;

        // Laniakea highlight
        this.laniakeaSphere = null;
        this.laniakeaWireframe = null;
        this.milkyWayMarker = null;

        // Background
        this.quasars = null;

        // LOD system
        this.lodLevels = [];
        this.currentLOD = 0;

        // UI elements
        this.resourceBar = null;
        this.statsPanel = null;

        // Visual constants
        this.UNIVERSE_RADIUS = 800;
        this.TOTAL_GALAXIES = 400000;
        this.LANIAKEA_RADIUS = 80;

        // Universe system reference (set externally)
        this.universeSystem = null;

        // Keyboard handler reference
        this.keydownHandler = null;
    }

    /**
     * Initialize the universe view
     */
    async init(universeData) {
        console.log('[UniverseMap] Initializing...');

        if (this.isInitialized) {
            console.log('[UniverseMap] Already initialized');
            return;
        }

        try {
            this.universeData = universeData;
            this.lodLevels = universeData.lod_levels || [];

            // Create container
            const appContainer = document.getElementById('app');
            if (!appContainer) {
                console.error('[UniverseMap] Could not find #app container');
                return;
            }

            this.container = document.createElement('div');
            this.container.id = 'universe-map-container';
            this.container.className = 'universe-map-container';
            this.container.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 1000;
                display: none;
                background: #000003;
            `;
            appContainer.appendChild(this.container);

            // Three.js setup
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x000003);

            // Camera with extreme far plane for universe scale
            this.camera = new THREE.PerspectiveCamera(
                50,
                window.innerWidth / window.innerHeight,
                0.1,
                10000
            );

            // Renderer with logarithmic depth buffer for better precision
            this.renderer = new THREE.WebGLRenderer({
                antialias: true,
                logarithmicDepthBuffer: true
            });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.container.appendChild(this.renderer.domElement);

            // Generate cosmic web
            console.log('[UniverseMap] Generating cosmic web...');
            this.cosmicWebGenerator = new CosmicWebGenerator(universeData);

            // Add known superclusters first to influence vertex positions
            if (universeData.superclusters) {
                this.cosmicWebGenerator.addKnownSuperclusters(universeData.superclusters);
            }

            const webData = this.cosmicWebGenerator.generate(
                this.TOTAL_GALAXIES,
                this.UNIVERSE_RADIUS
            );

            // Store galaxy data
            this.galaxyPositions = webData.positions;
            this.galaxyColors = webData.colors;
            this.galaxyTypes = webData.types;

            // Create visualizations
            this.createCosmicWeb(webData);
            this.createLaniakeaHighlight();
            this.createSuperclusters();
            this.createMilkyWayMarker();
            this.createBackgroundQuasars();

            // Camera position - start looking at Laniakea from outside
            this.camera.position.set(150, 100, 200);
            this.camera.lookAt(0, 0, 0);

            // Controls
            if (typeof THREE.OrbitControls !== 'undefined') {
                this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
                this.controls.enableDamping = true;
                this.controls.dampingFactor = 0.05;
                this.controls.minDistance = 20;
                this.controls.maxDistance = 2000;
                this.controls.target.set(0, 0, 0);
                this.controls.rotateSpeed = 0.5;
                this.controls.zoomSpeed = 1.2;
            }

            // UI
            this.createUniverseResourceBar();
            this.createUniverseStatsPanel();
            this.createSuperclusterLabels();

            // Events
            window.addEventListener('resize', () => this.onResize());
            this.setupKeyboardControls();

            this.isInitialized = true;
            console.log('[UniverseMap] Initialization complete');

        } catch (error) {
            console.error('[UniverseMap] Initialization error:', error);
        }
    }

    /**
     * Create the cosmic web visualization using Points
     */
    createCosmicWeb(webData) {
        const { positions, colors, types } = webData;

        // Create geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Create sizes based on type (nodes larger, voids smaller)
        const sizes = new Float32Array(this.TOTAL_GALAXIES);
        for (let i = 0; i < this.TOTAL_GALAXIES; i++) {
            const type = types[i];
            switch (type) {
                case 0: sizes[i] = 1.5; break; // Node
                case 1: sizes[i] = 1.0; break; // Filament
                case 2: sizes[i] = 0.7; break; // Wall
                case 3: sizes[i] = 0.5; break; // Void
                default: sizes[i] = 0.8;
            }
        }
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        // Custom shader material for size attenuation
        const material = new THREE.ShaderMaterial({
            uniforms: {
                pointSize: { value: 2.0 },
                opacity: { value: 0.85 }
            },
            vertexShader: `
                attribute float size;
                varying vec3 vColor;

                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * pointSize * (300.0 / -mvPosition.z);
                    gl_PointSize = clamp(gl_PointSize, 0.5, 10.0);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform float opacity;
                varying vec3 vColor;

                void main() {
                    float dist = length(gl_PointCoord - vec2(0.5));
                    if (dist > 0.5) discard;

                    float alpha = smoothstep(0.5, 0.2, dist) * opacity;
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            transparent: true,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.galaxyPoints = new THREE.Points(geometry, material);
        this.galaxyPoints.frustumCulled = false; // Disable for large point clouds
        this.scene.add(this.galaxyPoints);

        console.log('[UniverseMap] Created', this.TOTAL_GALAXIES, 'galaxy points');
    }

    /**
     * Create Laniakea supercluster highlight sphere
     */
    createLaniakeaHighlight() {
        const laniakea = this.universeData.superclusters?.find(s => s.id === 'laniakea');
        if (!laniakea) return;

        const radius = laniakea.radius_mpc || this.LANIAKEA_RADIUS;

        // Semi-transparent sphere
        const geometry = new THREE.SphereGeometry(radius, 64, 64);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.03,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.laniakeaSphere = new THREE.Mesh(geometry, material);
        this.laniakeaSphere.position.set(0, 0, 0);
        this.scene.add(this.laniakeaSphere);

        // Wireframe outline
        const wireGeometry = new THREE.EdgesGeometry(
            new THREE.SphereGeometry(radius, 32, 32)
        );
        const wireMaterial = new THREE.LineBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.2
        });
        this.laniakeaWireframe = new THREE.LineSegments(wireGeometry, wireMaterial);
        this.scene.add(this.laniakeaWireframe);
    }

    /**
     * Create markers for known superclusters
     */
    createSuperclusters() {
        if (!this.universeData.superclusters) return;

        const colors = this.universeData.visual_params?.supercluster_colors || {};

        for (const sc of this.universeData.superclusters) {
            if (sc.id === 'laniakea') continue; // Already highlighted
            if (!sc.position_mpc) continue;

            const pos = sc.position_mpc;
            const radius = (sc.radius_mpc || 30) * 0.3;

            // Supercluster glow sphere
            const geometry = new THREE.SphereGeometry(radius, 16, 16);
            const colorHex = colors[sc.type] || '#ffaa44';
            const material = new THREE.MeshBasicMaterial({
                color: new THREE.Color(colorHex),
                transparent: true,
                opacity: 0.15,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(pos.x, pos.y, pos.z);
            mesh.userData = { supercluster: sc };

            this.superclusterMeshes[sc.id] = mesh;
            this.scene.add(mesh);
        }
    }

    /**
     * Create Milky Way marker (our location in Laniakea)
     */
    createMilkyWayMarker() {
        const laniakea = this.universeData.superclusters?.find(s => s.id === 'laniakea');
        if (!laniakea || !laniakea.milky_way_position) return;

        const pos = laniakea.milky_way_position;

        // Core marker
        const geometry = new THREE.SphereGeometry(1.5, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff
        });

        this.milkyWayMarker = new THREE.Mesh(geometry, material);
        this.milkyWayMarker.position.set(pos.x, pos.y, pos.z);
        this.scene.add(this.milkyWayMarker);

        // Outer glow
        const glowGeometry = new THREE.SphereGeometry(4, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.4,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.milkyWayMarker.add(glow);

        // Inner ring
        const ringGeometry = new THREE.RingGeometry(2.5, 3, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        this.milkyWayMarker.add(ring);
    }

    /**
     * Create distant quasars for background depth
     */
    createBackgroundQuasars() {
        const quasarCount = 2000;
        const positions = new Float32Array(quasarCount * 3);
        const colors = new Float32Array(quasarCount * 3);
        const color = new THREE.Color();

        for (let i = 0; i < quasarCount; i++) {
            // Very distant
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 1500 + Math.random() * 1000;

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);

            // Quasar colors - bright, blue or red (redshifted)
            if (Math.random() < 0.5) {
                color.setHSL(0.6, 0.5, 0.4 + Math.random() * 0.3);
            } else {
                color.setHSL(0.0, 0.5, 0.4 + Math.random() * 0.3);
            }

            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.5,
            sizeAttenuation: false,
            vertexColors: true,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending
        });

        this.quasars = new THREE.Points(geometry, material);
        this.scene.add(this.quasars);
    }

    /**
     * Create universe resource bar (top UI)
     */
    createUniverseResourceBar() {
        const bar = document.createElement('div');
        bar.id = 'universe-resource-bar';
        bar.className = 'universe-resource-bar';
        bar.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 50px;
            background: linear-gradient(180deg, rgba(0,10,20,0.95) 0%, rgba(0,5,15,0.8) 100%);
            border-bottom: 1px solid rgba(0,255,136,0.3);
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 20px;
            font-family: 'Space Mono', monospace;
            color: #00ff88;
            z-index: 100;
        `;
        bar.innerHTML = `
            <div class="universe-left" style="display: flex; gap: 30px; align-items: center;">
                <div class="universe-scale-display">
                    <span style="font-size: 10px; opacity: 0.7;">SCALE</span>
                    <span style="font-size: 14px; font-weight: bold;" id="universe-scale">OBSERVABLE UNIVERSE</span>
                </div>
                <div class="universe-location" style="display: flex; gap: 8px; align-items: center;">
                    <span style="font-size: 10px; opacity: 0.7;">YOU ARE HERE:</span>
                    <span style="font-size: 12px; color: #fff;">Milky Way</span>
                    <span style="opacity: 0.5;">&rarr;</span>
                    <span style="font-size: 12px; color: #00ff88;">Laniakea</span>
                </div>
            </div>
            <div class="universe-stats" style="display: flex; gap: 25px;">
                <div class="universe-stat" style="text-align: center;">
                    <div style="font-size: 10px; opacity: 0.6;">VISIBLE GALAXIES</div>
                    <div style="font-size: 16px; font-weight: bold;" id="universe-visible">400,000</div>
                </div>
                <div class="universe-stat" style="text-align: center;">
                    <div style="font-size: 10px; opacity: 0.6;">SUPERCLUSTERS</div>
                    <div style="font-size: 16px; font-weight: bold;" id="universe-superclusters">10</div>
                </div>
                <div class="universe-stat" style="text-align: center;">
                    <div style="font-size: 10px; opacity: 0.6;">COLONIZED</div>
                    <div style="font-size: 16px; font-weight: bold; color: #ffaa44;" id="universe-colonized">1</div>
                </div>
                <div class="universe-stat" style="text-align: center;">
                    <div style="font-size: 10px; opacity: 0.6;">KARDASHEV</div>
                    <div style="font-size: 16px; font-weight: bold; color: #ff88ff;" id="universe-kardashev">K2.5</div>
                </div>
            </div>
        `;
        this.container.appendChild(bar);
        this.resourceBar = bar;
    }

    /**
     * Create universe stats panel (bottom)
     */
    createUniverseStatsPanel() {
        const panel = document.createElement('div');
        panel.id = 'universe-stats-panel';
        panel.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 15px;
            padding: 10px 20px;
            background: rgba(0,10,20,0.8);
            border: 1px solid rgba(0,255,136,0.2);
            border-radius: 8px;
            font-family: 'Space Mono', monospace;
            font-size: 11px;
            color: #88aacc;
            z-index: 100;
        `;
        panel.innerHTML = `
            <div class="stat-chip" style="display: flex; gap: 6px; align-items: center;">
                <span style="opacity: 0.6;">NODES:</span>
                <span style="color: #ffaa44;" id="stat-nodes">${this.cosmicWebGenerator?.vertices?.length || 0}</span>
            </div>
            <div class="stat-chip" style="display: flex; gap: 6px; align-items: center;">
                <span style="opacity: 0.6;">FILAMENTS:</span>
                <span style="color: #6688cc;" id="stat-filaments">${this.cosmicWebGenerator?.edges?.length || 0}</span>
            </div>
            <div class="stat-chip" style="display: flex; gap: 6px; align-items: center;">
                <span style="opacity: 0.6;">VOIDS:</span>
                <span style="color: #445566;" id="stat-voids">${this.cosmicWebGenerator?.seeds?.length || 0}</span>
            </div>
            <div style="border-left: 1px solid rgba(255,255,255,0.2); padding-left: 15px;">
                <span style="opacity: 0.5;">L</span><span style="opacity: 0.7;"> Laniakea</span>
                <span style="margin-left: 10px; opacity: 0.5;">1-9</span><span style="opacity: 0.7;"> Superclusters</span>
                <span style="margin-left: 10px; opacity: 0.5;">Ctrl+1/2</span><span style="opacity: 0.7;"> Exit</span>
                <span style="margin-left: 10px; opacity: 0.5;">Scroll</span><span style="opacity: 0.7;"> Zoom</span>
            </div>
        `;
        this.container.appendChild(panel);
        this.statsPanel = panel;
    }

    /**
     * Create HTML labels for superclusters
     */
    createSuperclusterLabels() {
        this.superclusterLabelsContainer = document.createElement('div');
        this.superclusterLabelsContainer.className = 'supercluster-labels-container';
        this.superclusterLabelsContainer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 50;
        `;
        this.container.appendChild(this.superclusterLabelsContainer);

        if (!this.universeData.superclusters) return;

        for (const sc of this.universeData.superclusters) {
            const label = document.createElement('div');
            label.className = 'supercluster-label';
            label.style.cssText = `
                position: absolute;
                padding: 4px 10px;
                background: rgba(0,10,20,0.8);
                border: 1px solid ${sc.id === 'laniakea' ? '#00ff88' : '#446688'};
                border-radius: 4px;
                font-family: 'Space Mono', monospace;
                font-size: 11px;
                color: ${sc.id === 'laniakea' ? '#00ff88' : '#88aacc'};
                pointer-events: auto;
                cursor: pointer;
                transform: translate(-50%, -50%);
                white-space: nowrap;
                transition: opacity 0.2s;
            `;
            label.innerHTML = `
                <div style="font-weight: bold;">${sc.name}</div>
                <div style="font-size: 9px; opacity: 0.7;">${this.formatGalaxyCount(sc.galaxy_count)} galaxies</div>
            `;
            label.dataset.superclusterId = sc.id;

            // Click to focus
            label.addEventListener('click', () => this.focusOnSupercluster(sc.id));

            this.superclusterLabelsContainer.appendChild(label);
            this.superclusterLabels.push({
                element: label,
                supercluster: sc
            });
        }
    }

    /**
     * Update supercluster label screen positions
     */
    updateSuperclusterLabels() {
        if (!this.superclusterLabels.length) return;

        for (const labelData of this.superclusterLabels) {
            const sc = labelData.supercluster;
            if (!sc.position_mpc) continue;

            const pos = sc.position_mpc;
            const worldPos = new THREE.Vector3(pos.x, pos.y, pos.z);
            const screenPos = worldPos.clone().project(this.camera);

            const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

            // Check if visible (in front of camera and on screen)
            if (screenPos.z < 1 && screenPos.z > 0 &&
                x > -100 && x < window.innerWidth + 100 &&
                y > -50 && y < window.innerHeight + 50) {

                labelData.element.style.display = 'block';
                labelData.element.style.left = `${x}px`;
                labelData.element.style.top = `${y}px`;

                // Fade based on distance
                const dist = this.camera.position.distanceTo(worldPos);
                const opacity = Math.min(1, Math.max(0.2, 1 - dist / 800));
                labelData.element.style.opacity = opacity.toString();
            } else {
                labelData.element.style.display = 'none';
            }
        }
    }

    /**
     * Focus camera on a supercluster
     */
    focusOnSupercluster(id) {
        const sc = this.universeData.superclusters?.find(s => s.id === id);
        if (!sc || !sc.position_mpc) return;

        console.log('[UniverseMap] Focusing on', sc.name);

        const pos = sc.position_mpc;
        const targetPos = new THREE.Vector3(pos.x, pos.y, pos.z);
        const distance = (sc.radius_mpc || 50) * 2;

        // Calculate camera target position
        const direction = new THREE.Vector3().subVectors(this.camera.position, targetPos).normalize();
        const cameraTarget = targetPos.clone().add(direction.multiplyScalar(distance));

        // Smooth animation
        const startPos = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        let progress = 0;

        const animate = () => {
            progress += 0.02;
            if (progress >= 1) {
                this.camera.position.copy(cameraTarget);
                this.controls.target.copy(targetPos);
                this.controls.update();
                return;
            }

            // Ease out cubic
            const t = 1 - Math.pow(1 - progress, 3);
            this.camera.position.lerpVectors(startPos, cameraTarget, t);
            this.controls.target.lerpVectors(startTarget, targetPos, t);
            this.controls.update();

            requestAnimationFrame(animate);
        };

        animate();
    }

    /**
     * Setup keyboard controls
     */
    setupKeyboardControls() {
        this.keydownHandler = (e) => {
            if (!this.isActive) return;

            const key = e.key.toLowerCase();

            // L = Focus on Laniakea (home)
            if (key === 'l') {
                this.focusOnSupercluster('laniakea');
            }

            // 1-9 = Focus on superclusters by index
            if (/^[1-9]$/.test(e.key)) {
                const idx = parseInt(e.key) - 1;
                if (this.universeData.superclusters && idx < this.universeData.superclusters.length) {
                    this.focusOnSupercluster(this.universeData.superclusters[idx].id);
                }
            }

            // Escape = Exit to galaxy view (Ctrl+1/2 also work from main.js)
            if (key === 'escape') {
                this.hide();
            }

            // M = Toggle Milky Way marker visibility
            if (key === 'm' && this.milkyWayMarker) {
                this.milkyWayMarker.visible = !this.milkyWayMarker.visible;
            }
        };

        document.addEventListener('keydown', this.keydownHandler);
    }

    /**
     * Update LOD based on camera distance
     */
    updateLOD() {
        if (!this.galaxyPoints || !this.lodLevels.length) return;

        const distance = this.camera.position.length();

        for (let i = this.lodLevels.length - 1; i >= 0; i--) {
            const level = this.lodLevels[i];
            if (distance >= level.distance) {
                if (this.currentLOD !== i) {
                    this.currentLOD = i;
                    this.galaxyPoints.material.uniforms.pointSize.value = level.point_size * 2;
                    this.galaxyPoints.material.uniforms.opacity.value = level.opacity;
                }
                break;
            }
        }
    }

    /**
     * Update stats display
     */
    updateStats() {
        if (!this.universeSystem) return;

        const stats = this.universeSystem.getUniverseStats?.() || {};

        const colonizedEl = document.getElementById('universe-colonized');
        if (colonizedEl) {
            colonizedEl.textContent = stats.superclusters_colonized || 1;
        }

        const kardashevEl = document.getElementById('universe-kardashev');
        if (kardashevEl) {
            kardashevEl.textContent = stats.kardashev_level || 'K2.5';
        }
    }

    /**
     * Show the universe view
     */
    show() {
        if (!this.container || !this.isInitialized) {
            console.warn('[UniverseMap] Cannot show - not initialized');
            return;
        }

        this.isActive = true;
        this.container.style.display = 'block';

        // Hide other UI elements
        this.hideOtherUI();

        // Start animation
        this.animate();

        console.log('[UniverseMap] Universe view activated');
    }

    /**
     * Hide the universe view
     */
    hide() {
        if (!this.container) return;

        this.isActive = false;
        this.container.style.display = 'none';

        // Show other UI elements
        this.showOtherUI();

        // Stop animation
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        console.log('[UniverseMap] Returning to galaxy view');
    }

    /**
     * Toggle the universe view
     */
    toggle() {
        if (this.isActive) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Animation loop
     */
    animate() {
        if (!this.isActive) return;

        this.animationId = requestAnimationFrame(() => this.animate());

        this.time += 0.016;
        this.frameCount++;

        // Update LOD every 10 frames
        if (this.frameCount % 10 === 0) {
            this.updateLOD();
            this.updateStats();
        }

        // Animate Milky Way marker pulse
        if (this.milkyWayMarker) {
            const pulse = 1 + Math.sin(this.time * 3) * 0.2;
            this.milkyWayMarker.scale.setScalar(pulse);

            // Rotate ring
            const ring = this.milkyWayMarker.children[1];
            if (ring) {
                ring.rotation.z = this.time * 0.5;
            }
        }

        // Animate Laniakea sphere breathing
        if (this.laniakeaSphere) {
            const opacity = 0.02 + Math.sin(this.time * 0.5) * 0.01;
            this.laniakeaSphere.material.opacity = opacity;
        }

        // Update labels every 5 frames
        if (this.frameCount % 5 === 0) {
            this.updateSuperclusterLabels();
        }

        // Update controls
        if (this.controls) {
            this.controls.update();
        }

        // Render
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Handle window resize
     */
    onResize() {
        if (!this.camera || !this.renderer) return;

        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // Utility methods

    hideOtherUI() {
        const elementsToHide = [
            '#star-map-container',
            '#kardashev-resource-bar',
            '#galaxy-stats-bar',
            '.galaxy-stats-panel'
        ];
        elementsToHide.forEach(sel => {
            const el = document.querySelector(sel);
            if (el) el.style.display = 'none';
        });
    }

    showOtherUI() {
        const starMap = document.querySelector('#star-map-container');
        if (starMap) starMap.style.display = 'block';

        const kardashevBar = document.querySelector('#kardashev-resource-bar');
        if (kardashevBar) kardashevBar.style.display = 'flex';
    }

    formatGalaxyCount(count) {
        if (!count) return '?';
        if (count >= 1e6) return `${(count / 1e6).toFixed(0)}M`;
        if (count >= 1e3) return `${(count / 1e3).toFixed(0)}k`;
        return count.toString();
    }

    /**
     * Clean up resources
     */
    dispose() {
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
        }

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        if (this.renderer) {
            this.renderer.dispose();
        }

        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }

        this.isInitialized = false;
        this.isActive = false;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.UniverseMapVisualization = UniverseMapVisualization;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UniverseMapVisualization;
}
