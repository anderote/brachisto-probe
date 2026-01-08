/**
 * Loading Galaxy Animation
 * Creates a swirling spiral galaxy using Three.js for the loading screen
 */

class LoadingGalaxy {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.galaxy = null;
        this.animationId = null;
        this.time = 0;

        // Galaxy parameters
        this.particleCount = 50000;
        this.arms = 5;
        this.armSpread = 0.4;
        this.radius = 6;
        this.rotationSpeed = 0.08;

        this.init();
        this.createGalaxy();
        this.animate();
    }

    init() {
        // Scene
        this.scene = new THREE.Scene();

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            100
        );
        this.camera.position.set(0, 4, 6);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 1);

        // Handle resize
        window.addEventListener('resize', () => this.onResize());
    }

    createGalaxy() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.particleCount * 3);
        const colors = new Float32Array(this.particleCount * 3);
        const sizes = new Float32Array(this.particleCount);

        // Color palette
        const innerColor = new THREE.Color(0xffffff);  // White/blue core
        const midColor = new THREE.Color(0x6688ff);    // Blue
        const outerColor = new THREE.Color(0x4444aa);  // Purple

        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3;

            // Spiral arm distribution
            const armIndex = i % this.arms;
            const armAngle = (armIndex / this.arms) * Math.PI * 2;

            // Distance from center (more particles near center)
            const randomRadius = Math.pow(Math.random(), 0.5) * this.radius;

            // Spiral twist - more twist further out
            const spinAngle = randomRadius * 1.5;

            // Add randomness to spread
            const randomX = (Math.random() - 0.5) * this.armSpread * randomRadius;
            const randomY = (Math.random() - 0.5) * 0.3 * (1 - randomRadius / this.radius);
            const randomZ = (Math.random() - 0.5) * this.armSpread * randomRadius;

            // Calculate position
            const angle = armAngle + spinAngle;
            positions[i3] = Math.cos(angle) * randomRadius + randomX;
            positions[i3 + 1] = randomY;
            positions[i3 + 2] = Math.sin(angle) * randomRadius + randomZ;

            // Color based on distance from center
            const colorT = randomRadius / this.radius;
            const mixedColor = new THREE.Color();
            if (colorT < 0.3) {
                mixedColor.lerpColors(innerColor, midColor, colorT / 0.3);
            } else {
                mixedColor.lerpColors(midColor, outerColor, (colorT - 0.3) / 0.7);
            }

            colors[i3] = mixedColor.r;
            colors[i3 + 1] = mixedColor.g;
            colors[i3 + 2] = mixedColor.b;

            // Size - smaller further out
            sizes[i] = (1 - colorT * 0.5) * (0.02 + Math.random() * 0.03);
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        // Shader material for point sprites
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 }
            },
            vertexShader: `
                attribute float size;
                varying vec3 vColor;

                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;

                void main() {
                    float dist = length(gl_PointCoord - vec2(0.5));
                    if (dist > 0.5) discard;

                    float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
                    gl_FragColor = vec4(vColor, alpha * 0.8);
                }
            `,
            transparent: true,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.galaxy = new THREE.Points(geometry, material);
        this.scene.add(this.galaxy);

        // Add central glow
        const glowGeometry = new THREE.SphereGeometry(0.3, 32, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.3
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.scene.add(glow);
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());

        this.time += 0.016;

        // Rotate galaxy
        if (this.galaxy) {
            this.galaxy.rotation.y += this.rotationSpeed * 0.016;
        }

        // Subtle camera movement
        this.camera.position.x = Math.sin(this.time * 0.1) * 0.5;
        this.camera.position.z = 6 + Math.cos(this.time * 0.1) * 0.5;
        this.camera.lookAt(0, 0, 0);

        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        if (!this.camera || !this.renderer) return;

        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.renderer) {
            this.renderer.dispose();
        }
        if (this.galaxy) {
            this.galaxy.geometry.dispose();
            this.galaxy.material.dispose();
        }
    }
}

// Auto-initialize when DOM is ready
let loadingGalaxy = null;

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('loading-galaxy-canvas');
    if (canvas && typeof THREE !== 'undefined') {
        loadingGalaxy = new LoadingGalaxy('loading-galaxy-canvas');
        window.loadingGalaxy = loadingGalaxy;
    }
});
