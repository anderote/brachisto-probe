/** Parallax starfield background with multiple layers */
class Starfield {
    constructor(scene) {
        this.scene = scene;
        this.layers = [];
        this.cameraPosition = { x: 0, y: 0, z: 0 };
        this.time = 0;
        if (!this.scene) {
            console.warn('[Starfield] Scene not provided to constructor');
            return;
        }
        this.init();
    }

    init() {
        // Create 3 layers with different star densities and parallax speeds
        this.createLayer(0, 2000, 0.02, 0.3); // Far layer - many small stars, slow parallax
        this.createLayer(1, 1000, 0.05, 0.5); // Mid layer - medium stars, medium parallax
        this.createLayer(2, 500, 0.1, 0.8);   // Near layer - fewer larger stars, fast parallax
    }

    createLayer(layerIndex, starCount, parallaxSpeed, baseSize) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);
        const twinkleSpeeds = new Float32Array(starCount);

        // Color variations: blue-white, white, yellow-white
        const colorPalette = [
            new THREE.Color(0xffffff),      // White
            new THREE.Color(0xaaccff),      // Blue-white
            new THREE.Color(0xffffee),      // Yellow-white
            new THREE.Color(0xffffff)        // Pure white
        ];

        for (let i = 0; i < starCount; i++) {
            // Random position in large sphere
            const radius = 50 + Math.random() * 200; // 50-250 units from center
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = radius * Math.cos(phi);

            // Random color from palette
            const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;

            // Size variation
            sizes[i] = baseSize * (0.5 + Math.random() * 0.5);

            // Twinkle speed (for shader animation)
            twinkleSpeeds[i] = 0.5 + Math.random() * 1.5;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('twinkleSpeed', new THREE.BufferAttribute(twinkleSpeeds, 1));

        // Custom shader material for twinkling
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                parallaxSpeed: { value: parallaxSpeed }
            },
            vertexShader: `
                attribute float size;
                attribute float twinkleSpeed;
                varying vec3 vColor;
                varying float vTwinkleSpeed;
                
                void main() {
                    vColor = color;
                    vTwinkleSpeed = twinkleSpeed;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform float time;
                varying vec3 vColor;
                varying float vTwinkleSpeed;
                
                void main() {
                    // Twinkling effect
                    float twinkle = sin(time * vTwinkleSpeed + gl_FragCoord.x * 0.1) * 0.3 + 0.7;
                    float alpha = twinkle * 0.8;
                    
                    // Distance-based fade
                    float dist = length(gl_PointCoord - vec2(0.5));
                    alpha *= 1.0 - smoothstep(0.0, 0.5, dist);
                    
                    gl_FragColor = vec4(vColor * twinkle, alpha);
                }
            `,
            transparent: true,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const points = new THREE.Points(geometry, material);
        points.userData = {
            layerIndex: layerIndex,
            parallaxSpeed: parallaxSpeed,
            basePositions: positions.slice() // Store original positions
        };

        this.layers.push(points);
        if (this.scene) {
            this.scene.add(points);
        } else {
            console.warn('[Starfield] Scene not available, cannot add layer');
        }
    }

    update(cameraPosition, deltaTime) {
        this.time += deltaTime;
        this.cameraPosition = cameraPosition || { x: 0, y: 0, z: 0 };

        // Update each layer with parallax effect
        this.layers.forEach(layer => {
            const material = layer.material;
            const userData = layer.userData;

            // Update time uniform for twinkling
            if (material.uniforms) {
                material.uniforms.time.value = this.time;
            }

            // Apply parallax offset based on camera position
            // Stars in far layers move less than stars in near layers
            const parallaxX = this.cameraPosition.x * userData.parallaxSpeed;
            const parallaxZ = this.cameraPosition.z * userData.parallaxSpeed;

            // Update positions with parallax
            const positions = layer.geometry.attributes.position;
            const basePositions = userData.basePositions;

            for (let i = 0; i < positions.count; i++) {
                positions.setX(i, basePositions[i * 3] - parallaxX);
                positions.setY(i, basePositions[i * 3 + 1]);
                positions.setZ(i, basePositions[i * 3 + 2] - parallaxZ);
            }

            positions.needsUpdate = true;
        });
    }

    destroy() {
        this.layers.forEach(layer => {
            this.scene.remove(layer);
            layer.geometry.dispose();
            layer.material.dispose();
        });
        this.layers = [];
    }
}

