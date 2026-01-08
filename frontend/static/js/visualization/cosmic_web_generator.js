/**
 * Cosmic Web Generator
 *
 * Generates realistic large-scale structure of the universe using:
 * 1. Voronoi tessellation for void/wall/filament/node topology
 * 2. NFW (Navarro-Frenk-White) density profiles for galaxy clusters at nodes
 * 3. Filament distribution along Voronoi edges
 *
 * References:
 * - Voronoi model: https://arxiv.org/abs/astro-ph/0407214
 * - NFW profile: Navarro, Frenk & White (1996)
 * - Cosmic web classification: https://arxiv.org/abs/1401.7866
 */
class CosmicWebGenerator {
    constructor(params) {
        this.params = params;
        this.seeds = [];           // Voronoi seed points (void centers)
        this.vertices = [];        // Voronoi vertices (nodes/superclusters)
        this.edges = [];           // Voronoi edges (filaments)
        this.galaxies = [];        // Generated galaxy positions

        // Extract config from params
        this.voronoiConfig = params.voronoi_generation || {
            seed_count: 800,
            min_seed_separation_mpc: 30,
            galaxy_distribution: { nodes: 0.40, filaments: 0.45, walls: 0.12, voids: 0.03 }
        };

        this.nfwConfig = params.nfw_profile || {
            concentration: 4,
            scale_radius_factor: 0.2,
            cutoff_radius_factor: 3
        };

        this.filamentConfig = params.filament_params || {
            width_mpc_min: 2,
            width_mpc_max: 8,
            curvature_noise: 0.3,
            max_length_mpc: 80
        };

        this.visualConfig = params.visual_params || {
            colors: {
                node: '#ffaa44',
                filament: '#6688cc',
                wall: '#445566',
                void: '#222233'
            }
        };
    }

    /**
     * Generate the complete cosmic web structure
     * @param {number} totalGalaxies - Total number of galaxies to generate
     * @param {number} universeRadius - Radius of visible universe in Mpc
     * @returns {Object} { positions: Float32Array, colors: Float32Array, types: Uint8Array }
     */
    generate(totalGalaxies, universeRadius) {
        console.log('[CosmicWeb] Generating cosmic web with', totalGalaxies, 'galaxies');
        const startTime = performance.now();

        // Step 1: Generate Voronoi seed points (void centers)
        this.generateVoronoiSeeds(universeRadius);

        // Step 2: Find Voronoi vertices (nodes/superclusters)
        this.findVoronoiVertices();

        // Step 3: Find Voronoi edges (filaments)
        this.findVoronoiEdges();

        // Step 4: Distribute galaxies according to cosmic web structure
        const result = this.distributeGalaxies(totalGalaxies, universeRadius);

        const elapsed = performance.now() - startTime;
        console.log(`[CosmicWeb] Generation complete in ${elapsed.toFixed(0)}ms`);
        console.log(`[CosmicWeb] Seeds: ${this.seeds.length}, Vertices: ${this.vertices.length}, Edges: ${this.edges.length}`);

        return result;
    }

    /**
     * Generate Poisson-sphere distributed seed points for Voronoi cells
     * Each seed represents the center of a cosmic void
     */
    generateVoronoiSeeds(radius) {
        const seedCount = this.voronoiConfig.seed_count;
        const minSep = this.voronoiConfig.min_seed_separation_mpc;

        this.seeds = [];
        let attempts = 0;
        const maxAttempts = seedCount * 100;

        // Use Poisson-sphere sampling for even distribution
        while (this.seeds.length < seedCount && attempts < maxAttempts) {
            attempts++;

            // Random point in sphere (uniform distribution)
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = Math.cbrt(Math.random()) * radius; // Cube root for uniform volume

            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            // Check minimum separation from existing seeds
            let tooClose = false;
            for (const seed of this.seeds) {
                const dx = x - seed.x;
                const dy = y - seed.y;
                const dz = z - seed.z;
                const distSq = dx * dx + dy * dy + dz * dz;
                if (distSq < minSep * minSep) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                this.seeds.push({ x, y, z, id: this.seeds.length });
            }
        }

        console.log('[CosmicWeb] Generated', this.seeds.length, 'Voronoi seeds (void centers)');
    }

    /**
     * Find Voronoi vertices - points where 4+ void boundaries meet
     * These become the nodes/superclusters of the cosmic web
     */
    findVoronoiVertices() {
        this.vertices = [];
        const usedCombinations = new Set();

        // For each seed, find its nearest neighbors
        // Vertices occur approximately at centroids of 4 nearby seeds
        for (let i = 0; i < this.seeds.length; i++) {
            const seed = this.seeds[i];

            // Find nearest seeds
            const distances = [];
            for (let j = 0; j < this.seeds.length; j++) {
                if (i === j) continue;
                const s = this.seeds[j];
                const dist = Math.sqrt(
                    (s.x - seed.x) ** 2 +
                    (s.y - seed.y) ** 2 +
                    (s.z - seed.z) ** 2
                );
                distances.push({ idx: j, dist });
            }
            distances.sort((a, b) => a.dist - b.dist);

            // Create vertex at approximate intersection of 4 nearest seeds
            if (distances.length >= 3) {
                const indices = [i, distances[0].idx, distances[1].idx, distances[2].idx].sort((a, b) => a - b);
                const key = indices.join(',');

                // Avoid duplicate vertices
                if (!usedCombinations.has(key)) {
                    usedCombinations.add(key);

                    // Vertex at centroid of 4 seeds
                    const s0 = this.seeds[indices[0]];
                    const s1 = this.seeds[indices[1]];
                    const s2 = this.seeds[indices[2]];
                    const s3 = this.seeds[indices[3]];

                    const vertex = {
                        x: (s0.x + s1.x + s2.x + s3.x) / 4,
                        y: (s0.y + s1.y + s2.y + s3.y) / 4,
                        z: (s0.z + s1.z + s2.z + s3.z) / 4,
                        seedIndices: indices,
                        mass: 1.0 + Math.random() * 0.5, // Slight mass variation
                        id: this.vertices.length
                    };

                    this.vertices.push(vertex);
                }
            }
        }

        console.log('[CosmicWeb] Found', this.vertices.length, 'Voronoi vertices (nodes)');
    }

    /**
     * Find Voronoi edges (filaments) - connections between nodes that share seeds
     */
    findVoronoiEdges() {
        this.edges = [];
        const maxFilamentLength = this.filamentConfig.max_length_mpc;

        // Edges connect vertices that share 2+ seed indices
        for (let i = 0; i < this.vertices.length; i++) {
            for (let j = i + 1; j < this.vertices.length; j++) {
                const v1 = this.vertices[i];
                const v2 = this.vertices[j];

                // Count shared seeds
                const shared = v1.seedIndices.filter(s => v2.seedIndices.includes(s)).length;

                if (shared >= 2) {
                    // Check distance - filaments have limited length
                    const dist = Math.sqrt(
                        (v1.x - v2.x) ** 2 +
                        (v1.y - v2.y) ** 2 +
                        (v1.z - v2.z) ** 2
                    );

                    if (dist < maxFilamentLength && dist > 5) { // Min length to avoid duplicates
                        this.edges.push({
                            v1: i,
                            v2: j,
                            length: dist,
                            midpoint: {
                                x: (v1.x + v2.x) / 2,
                                y: (v1.y + v2.y) / 2,
                                z: (v1.z + v2.z) / 2
                            },
                            id: this.edges.length
                        });
                    }
                }
            }
        }

        console.log('[CosmicWeb] Found', this.edges.length, 'Voronoi edges (filaments)');
    }

    /**
     * Distribute galaxies according to cosmic web structure
     */
    distributeGalaxies(totalGalaxies, universeRadius) {
        const distribution = this.voronoiConfig.galaxy_distribution;

        const nodeGalaxies = Math.floor(totalGalaxies * distribution.nodes);      // 40%
        const filamentGalaxies = Math.floor(totalGalaxies * distribution.filaments); // 45%
        const wallGalaxies = Math.floor(totalGalaxies * distribution.walls);      // 12%
        const voidGalaxies = totalGalaxies - nodeGalaxies - filamentGalaxies - wallGalaxies; // 3%

        console.log(`[CosmicWeb] Distribution - Nodes: ${nodeGalaxies}, Filaments: ${filamentGalaxies}, Walls: ${wallGalaxies}, Voids: ${voidGalaxies}`);

        const positions = new Float32Array(totalGalaxies * 3);
        const colors = new Float32Array(totalGalaxies * 3);
        const types = new Uint8Array(totalGalaxies); // 0=node, 1=filament, 2=wall, 3=void

        let idx = 0;

        // Generate node galaxies (NFW profile around vertices)
        idx = this.generateNodeGalaxies(positions, colors, types, idx, nodeGalaxies);

        // Generate filament galaxies (along edges with scatter)
        idx = this.generateFilamentGalaxies(positions, colors, types, idx, filamentGalaxies);

        // Generate wall galaxies (on Voronoi faces)
        idx = this.generateWallGalaxies(positions, colors, types, idx, wallGalaxies, universeRadius);

        // Generate void galaxies (sparse in void interiors)
        idx = this.generateVoidGalaxies(positions, colors, types, idx, voidGalaxies);

        return { positions, colors, types };
    }

    /**
     * Generate galaxies at nodes using NFW density profile
     * NFW: rho(r) = rho_0 / ((r/rs) * (1 + r/rs)^2)
     */
    generateNodeGalaxies(positions, colors, types, startIdx, count) {
        if (this.vertices.length === 0) {
            console.warn('[CosmicWeb] No vertices found, skipping node galaxies');
            return startIdx;
        }

        const galaxiesPerNode = Math.floor(count / this.vertices.length);
        const nodeColor = this.hexToRGB(this.visualConfig.colors.node);
        let idx = startIdx;

        for (const vertex of this.vertices) {
            // Scale radius based on vertex mass
            const baseRadius = 15;
            const rs = baseRadius * this.nfwConfig.scale_radius_factor * vertex.mass;
            const rMax = rs * this.nfwConfig.cutoff_radius_factor;

            for (let i = 0; i < galaxiesPerNode && idx < startIdx + count; i++) {
                // Sample from NFW profile using rejection sampling
                const r = this.sampleNFWRadius(rs, rMax);
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);

                positions[idx * 3] = vertex.x + r * Math.sin(phi) * Math.cos(theta);
                positions[idx * 3 + 1] = vertex.y + r * Math.sin(phi) * Math.sin(theta);
                positions[idx * 3 + 2] = vertex.z + r * Math.cos(phi);

                // Node color with slight variation - warm orange/gold
                const variation = 0.1;
                colors[idx * 3] = Math.min(1, nodeColor.r + (Math.random() - 0.5) * variation);
                colors[idx * 3 + 1] = Math.min(1, nodeColor.g + (Math.random() - 0.5) * variation);
                colors[idx * 3 + 2] = Math.min(1, nodeColor.b + (Math.random() - 0.5) * variation);

                types[idx] = 0; // Node type
                idx++;
            }
        }

        // Fill remaining with random distribution among nodes
        while (idx < startIdx + count) {
            const vertex = this.vertices[Math.floor(Math.random() * this.vertices.length)];
            const rs = 15 * this.nfwConfig.scale_radius_factor * vertex.mass;
            const rMax = rs * this.nfwConfig.cutoff_radius_factor;
            const r = this.sampleNFWRadius(rs, rMax);
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[idx * 3] = vertex.x + r * Math.sin(phi) * Math.cos(theta);
            positions[idx * 3 + 1] = vertex.y + r * Math.sin(phi) * Math.sin(theta);
            positions[idx * 3 + 2] = vertex.z + r * Math.cos(phi);

            colors[idx * 3] = nodeColor.r;
            colors[idx * 3 + 1] = nodeColor.g;
            colors[idx * 3 + 2] = nodeColor.b;

            types[idx] = 0;
            idx++;
        }

        return idx;
    }

    /**
     * Sample radius from NFW profile using rejection sampling
     */
    sampleNFWRadius(rs, rMax) {
        const maxAttempts = 50;
        const maxDensity = 4; // Approximate max for normalization

        for (let i = 0; i < maxAttempts; i++) {
            // Random radius with r^2 weighting for spherical shell
            const r = Math.cbrt(Math.random()) * rMax;
            const x = r / rs;

            if (x < 0.01) continue; // Avoid singularity at center

            // NFW density
            const density = 1 / (x * Math.pow(1 + x, 2));

            // Accept with probability proportional to density
            if (Math.random() < density / maxDensity) {
                return r;
            }
        }

        // Fallback - return random radius within scale radius
        return Math.random() * rs;
    }

    /**
     * Generate galaxies along filaments (Voronoi edges)
     */
    generateFilamentGalaxies(positions, colors, types, startIdx, count) {
        if (this.edges.length === 0) {
            console.warn('[CosmicWeb] No edges found, skipping filament galaxies');
            return startIdx;
        }

        const galaxiesPerFilament = Math.floor(count / this.edges.length);
        const filamentColor = this.hexToRGB(this.visualConfig.colors.filament);
        const widthMin = this.filamentConfig.width_mpc_min;
        const widthMax = this.filamentConfig.width_mpc_max;
        const curvatureNoise = this.filamentConfig.curvature_noise;
        let idx = startIdx;

        for (const edge of this.edges) {
            const v1 = this.vertices[edge.v1];
            const v2 = this.vertices[edge.v2];

            // Filament width varies
            const width = widthMin + Math.random() * (widthMax - widthMin);

            // Direction vector
            const dx = v2.x - v1.x;
            const dy = v2.y - v1.y;
            const dz = v2.z - v1.z;

            // Create perpendicular vectors for scatter
            const perp1 = this.getPerpendicularVector(dx, dy, dz);
            const perp2 = this.crossProduct(
                { x: dx, y: dy, z: dz },
                { x: perp1.x, y: perp1.y, z: perp1.z }
            );
            // Normalize perp2
            const len2 = Math.sqrt(perp2.x ** 2 + perp2.y ** 2 + perp2.z ** 2);
            perp2.x /= len2;
            perp2.y /= len2;
            perp2.z /= len2;

            for (let i = 0; i < galaxiesPerFilament && idx < startIdx + count; i++) {
                // Position along filament (0 to 1)
                const t = Math.random();

                // Base position on filament
                let x = v1.x + dx * t;
                let y = v1.y + dy * t;
                let z = v1.z + dz * t;

                // Add curvature noise - more in the middle
                const curveFactor = Math.sin(t * Math.PI) * curvatureNoise * width;
                const curveAngle = Math.random() * Math.PI * 2;

                x += Math.cos(curveAngle) * curveFactor;
                y += Math.sin(curveAngle) * curveFactor * 0.5;
                z += Math.sin(curveAngle + 1) * curveFactor;

                // Add perpendicular scatter - Gaussian distribution
                const scatter = this.gaussianRandom() * width * 0.5;
                const scatterAngle = Math.random() * Math.PI * 2;

                x += perp1.x * Math.cos(scatterAngle) * scatter + perp2.x * Math.sin(scatterAngle) * scatter;
                y += perp1.y * Math.cos(scatterAngle) * scatter + perp2.y * Math.sin(scatterAngle) * scatter;
                z += perp1.z * Math.cos(scatterAngle) * scatter + perp2.z * Math.sin(scatterAngle) * scatter;

                positions[idx * 3] = x;
                positions[idx * 3 + 1] = y;
                positions[idx * 3 + 2] = z;

                // Filament color with variation - blue/white
                const variation = 0.15;
                colors[idx * 3] = Math.min(1, filamentColor.r + (Math.random() - 0.5) * variation);
                colors[idx * 3 + 1] = Math.min(1, filamentColor.g + (Math.random() - 0.5) * variation);
                colors[idx * 3 + 2] = Math.min(1, filamentColor.b + (Math.random() - 0.5) * variation);

                types[idx] = 1; // Filament type
                idx++;
            }
        }

        // Fill remaining
        while (idx < startIdx + count) {
            const edge = this.edges[Math.floor(Math.random() * this.edges.length)];
            const v1 = this.vertices[edge.v1];
            const v2 = this.vertices[edge.v2];
            const t = Math.random();
            const width = widthMin + Math.random() * (widthMax - widthMin);

            positions[idx * 3] = v1.x + (v2.x - v1.x) * t + (Math.random() - 0.5) * width;
            positions[idx * 3 + 1] = v1.y + (v2.y - v1.y) * t + (Math.random() - 0.5) * width;
            positions[idx * 3 + 2] = v1.z + (v2.z - v1.z) * t + (Math.random() - 0.5) * width;

            colors[idx * 3] = filamentColor.r;
            colors[idx * 3 + 1] = filamentColor.g;
            colors[idx * 3 + 2] = filamentColor.b;

            types[idx] = 1;
            idx++;
        }

        return idx;
    }

    /**
     * Generate galaxies in walls (Voronoi faces)
     */
    generateWallGalaxies(positions, colors, types, startIdx, count, universeRadius) {
        const wallColor = this.hexToRGB(this.visualConfig.colors.wall);
        let idx = startIdx;

        for (let i = 0; i < count; i++) {
            // Walls are planar structures between voids
            // Approximate by placing galaxies between pairs of adjacent seeds
            const seed1 = this.seeds[Math.floor(Math.random() * this.seeds.length)];
            const seed2 = this.seeds[Math.floor(Math.random() * this.seeds.length)];

            if (seed1 === seed2) continue;

            // Position near midplane between seeds
            const t = 0.4 + Math.random() * 0.2; // Near midpoint

            // Add planar scatter perpendicular to seed-seed line
            const scatterRadius = 15;
            const scatterX = (Math.random() - 0.5) * scatterRadius;
            const scatterY = (Math.random() - 0.5) * scatterRadius;
            const scatterZ = (Math.random() - 0.5) * scatterRadius;

            const x = seed1.x + (seed2.x - seed1.x) * t + scatterX;
            const y = seed1.y + (seed2.y - seed1.y) * t + scatterY;
            const z = seed1.z + (seed2.z - seed1.z) * t + scatterZ;

            // Check bounds
            const dist = Math.sqrt(x * x + y * y + z * z);
            if (dist > universeRadius) continue;

            positions[idx * 3] = x;
            positions[idx * 3 + 1] = y;
            positions[idx * 3 + 2] = z;

            // Wall color - dim grey/blue
            const variation = 0.1;
            colors[idx * 3] = Math.min(1, wallColor.r + (Math.random() - 0.5) * variation);
            colors[idx * 3 + 1] = Math.min(1, wallColor.g + (Math.random() - 0.5) * variation);
            colors[idx * 3 + 2] = Math.min(1, wallColor.b + (Math.random() - 0.5) * variation);

            types[idx] = 2; // Wall type
            idx++;
        }

        return idx;
    }

    /**
     * Generate galaxies in voids (sparse)
     */
    generateVoidGalaxies(positions, colors, types, startIdx, count) {
        const voidColor = this.hexToRGB(this.visualConfig.colors.void);
        let idx = startIdx;

        for (let i = 0; i < count; i++) {
            // Pick a random seed (void center)
            const seed = this.seeds[Math.floor(Math.random() * this.seeds.length)];

            // Random position near void center (within half typical void radius)
            const voidRadius = this.voronoiConfig.min_seed_separation_mpc * 0.4;
            const r = Math.cbrt(Math.random()) * voidRadius;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[idx * 3] = seed.x + r * Math.sin(phi) * Math.cos(theta);
            positions[idx * 3 + 1] = seed.y + r * Math.sin(phi) * Math.sin(theta);
            positions[idx * 3 + 2] = seed.z + r * Math.cos(phi);

            // Void color - very dim
            const variation = 0.05;
            colors[idx * 3] = Math.min(1, voidColor.r + (Math.random() - 0.5) * variation);
            colors[idx * 3 + 1] = Math.min(1, voidColor.g + (Math.random() - 0.5) * variation);
            colors[idx * 3 + 2] = Math.min(1, voidColor.b + (Math.random() - 0.5) * variation);

            types[idx] = 3; // Void type
            idx++;
        }

        return idx;
    }

    /**
     * Override vertices near known supercluster positions
     */
    addKnownSuperclusters(superclusters) {
        if (!superclusters || superclusters.length === 0) return;

        console.log('[CosmicWeb] Adding', superclusters.length, 'known superclusters');

        for (const sc of superclusters) {
            if (!sc.position_mpc) continue;

            const pos = sc.position_mpc;

            // Find nearest vertex
            let nearestIdx = -1;
            let nearestDist = Infinity;

            for (let i = 0; i < this.vertices.length; i++) {
                const v = this.vertices[i];
                const dist = Math.sqrt(
                    (v.x - pos.x) ** 2 + (v.y - pos.y) ** 2 + (v.z - pos.z) ** 2
                );
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestIdx = i;
                }
            }

            if (nearestIdx >= 0 && nearestDist < 100) {
                // Move vertex to exact supercluster position
                this.vertices[nearestIdx].x = pos.x;
                this.vertices[nearestIdx].y = pos.y;
                this.vertices[nearestIdx].z = pos.z;
                this.vertices[nearestIdx].supercluster = sc;
                this.vertices[nearestIdx].mass = (sc.galaxy_count || 50000) / 50000;
                console.log(`[CosmicWeb] Placed ${sc.name} at vertex ${nearestIdx}`);
            } else if (nearestDist >= 100) {
                // Create new vertex for this supercluster
                this.vertices.push({
                    x: pos.x,
                    y: pos.y,
                    z: pos.z,
                    seedIndices: [],
                    mass: (sc.galaxy_count || 50000) / 50000,
                    supercluster: sc,
                    id: this.vertices.length
                });
                console.log(`[CosmicWeb] Created new vertex for ${sc.name}`);
            }
        }
    }

    /**
     * Get structure at a given position
     * @returns {string} 'node', 'filament', 'wall', or 'void'
     */
    getStructureAtPosition(x, y, z) {
        // Check proximity to vertices (nodes)
        for (const vertex of this.vertices) {
            const dist = Math.sqrt(
                (x - vertex.x) ** 2 + (y - vertex.y) ** 2 + (z - vertex.z) ** 2
            );
            if (dist < 20) return 'node';
        }

        // Check proximity to edges (filaments)
        for (const edge of this.edges) {
            const v1 = this.vertices[edge.v1];
            const v2 = this.vertices[edge.v2];
            const dist = this.pointToLineDistance(x, y, z, v1, v2);
            if (dist < 10) return 'filament';
        }

        // Check proximity to seed (void center)
        for (const seed of this.seeds) {
            const dist = Math.sqrt(
                (x - seed.x) ** 2 + (y - seed.y) ** 2 + (z - seed.z) ** 2
            );
            if (dist < 15) return 'void';
        }

        return 'wall';
    }

    // Utility methods

    hexToRGB(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255
        } : { r: 0.5, g: 0.5, b: 0.5 };
    }

    getPerpendicularVector(dx, dy, dz) {
        // Find a vector perpendicular to (dx, dy, dz)
        let px, py, pz;

        if (Math.abs(dx) < Math.abs(dy) && Math.abs(dx) < Math.abs(dz)) {
            px = 0;
            py = -dz;
            pz = dy;
        } else if (Math.abs(dy) < Math.abs(dz)) {
            px = -dz;
            py = 0;
            pz = dx;
        } else {
            px = -dy;
            py = dx;
            pz = 0;
        }

        const len = Math.sqrt(px * px + py * py + pz * pz);
        return { x: px / len, y: py / len, z: pz / len };
    }

    crossProduct(a, b) {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x
        };
    }

    gaussianRandom() {
        // Box-Muller transform
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    pointToLineDistance(px, py, pz, v1, v2) {
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        const dz = v2.z - v1.z;

        const t = Math.max(0, Math.min(1,
            ((px - v1.x) * dx + (py - v1.y) * dy + (pz - v1.z) * dz) /
            (dx * dx + dy * dy + dz * dz)
        ));

        const nearestX = v1.x + t * dx;
        const nearestY = v1.y + t * dy;
        const nearestZ = v1.z + t * dz;

        return Math.sqrt(
            (px - nearestX) ** 2 + (py - nearestY) ** 2 + (pz - nearestZ) ** 2
        );
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.CosmicWebGenerator = CosmicWebGenerator;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CosmicWebGenerator;
}
