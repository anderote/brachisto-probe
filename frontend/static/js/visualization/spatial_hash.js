/**
 * SpatialHash - A 3D spatial hash grid for efficient proximity queries
 *
 * Provides O(1) average-case insertion and O(k) query where k is the number
 * of items in nearby cells, compared to O(n) brute force.
 *
 * Usage:
 *   const hash = new SpatialHash(cellSize);
 *   hash.insert(x, y, z, data);
 *   const nearby = hash.query(x, y, z, radius);
 */
class SpatialHash {
    /**
     * Create a new spatial hash grid
     * @param {number} cellSize - Size of each cell in world units
     */
    constructor(cellSize = 10) {
        this.cellSize = cellSize;
        this.invCellSize = 1 / cellSize;
        this.cells = new Map();
        this.itemCount = 0;
    }

    /**
     * Get cell key for a position
     * @private
     */
    _getCellKey(x, y, z) {
        const cx = Math.floor(x * this.invCellSize);
        const cy = Math.floor(y * this.invCellSize);
        const cz = Math.floor(z * this.invCellSize);
        return `${cx},${cy},${cz}`;
    }

    /**
     * Get cell coordinates for a position
     * @private
     */
    _getCellCoords(x, y, z) {
        return {
            cx: Math.floor(x * this.invCellSize),
            cy: Math.floor(y * this.invCellSize),
            cz: Math.floor(z * this.invCellSize)
        };
    }

    /**
     * Insert an item into the hash
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} z - Z position
     * @param {*} data - Data to store
     * @returns {Object} Handle for removal
     */
    insert(x, y, z, data) {
        const key = this._getCellKey(x, y, z);

        if (!this.cells.has(key)) {
            this.cells.set(key, []);
        }

        const item = { x, y, z, data };
        this.cells.get(key).push(item);
        this.itemCount++;

        return { key, item };
    }

    /**
     * Remove an item by its handle
     * @param {Object} handle - Handle returned from insert
     */
    remove(handle) {
        if (!handle || !handle.key) return false;

        const cell = this.cells.get(handle.key);
        if (!cell) return false;

        const idx = cell.indexOf(handle.item);
        if (idx >= 0) {
            cell.splice(idx, 1);
            this.itemCount--;

            // Remove empty cells to save memory
            if (cell.length === 0) {
                this.cells.delete(handle.key);
            }
            return true;
        }
        return false;
    }

    /**
     * Query all items within radius of a position
     * @param {number} x - Query X position
     * @param {number} y - Query Y position
     * @param {number} z - Query Z position
     * @param {number} radius - Search radius
     * @returns {Array} Array of { x, y, z, data, distSq }
     */
    query(x, y, z, radius) {
        const results = [];
        const radiusSq = radius * radius;

        // Calculate cell range to check
        const minCx = Math.floor((x - radius) * this.invCellSize);
        const maxCx = Math.floor((x + radius) * this.invCellSize);
        const minCy = Math.floor((y - radius) * this.invCellSize);
        const maxCy = Math.floor((y + radius) * this.invCellSize);
        const minCz = Math.floor((z - radius) * this.invCellSize);
        const maxCz = Math.floor((z + radius) * this.invCellSize);

        // Check all cells in range
        for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cy = minCy; cy <= maxCy; cy++) {
                for (let cz = minCz; cz <= maxCz; cz++) {
                    const key = `${cx},${cy},${cz}`;
                    const cell = this.cells.get(key);

                    if (cell) {
                        for (const item of cell) {
                            const dx = item.x - x;
                            const dy = item.y - y;
                            const dz = item.z - z;
                            const distSq = dx * dx + dy * dy + dz * dz;

                            if (distSq <= radiusSq) {
                                results.push({
                                    x: item.x,
                                    y: item.y,
                                    z: item.z,
                                    data: item.data,
                                    distSq: distSq
                                });
                            }
                        }
                    }
                }
            }
        }

        return results;
    }

    /**
     * Find the nearest item to a position within a maximum radius
     * @param {number} x - Query X position
     * @param {number} y - Query Y position
     * @param {number} z - Query Z position
     * @param {number} maxRadius - Maximum search radius
     * @param {Function} filter - Optional filter function(data) => boolean
     * @returns {Object|null} { x, y, z, data, dist } or null if none found
     */
    findNearest(x, y, z, maxRadius, filter = null) {
        let nearestItem = null;
        let nearestDistSq = maxRadius * maxRadius;

        // Calculate cell range to check
        const minCx = Math.floor((x - maxRadius) * this.invCellSize);
        const maxCx = Math.floor((x + maxRadius) * this.invCellSize);
        const minCy = Math.floor((y - maxRadius) * this.invCellSize);
        const maxCy = Math.floor((y + maxRadius) * this.invCellSize);
        const minCz = Math.floor((z - maxRadius) * this.invCellSize);
        const maxCz = Math.floor((z + maxRadius) * this.invCellSize);

        // Check all cells in range
        for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cy = minCy; cy <= maxCy; cy++) {
                for (let cz = minCz; cz <= maxCz; cz++) {
                    const key = `${cx},${cy},${cz}`;
                    const cell = this.cells.get(key);

                    if (cell) {
                        for (const item of cell) {
                            // Skip if filter rejects
                            if (filter && !filter(item.data)) continue;

                            const dx = item.x - x;
                            const dy = item.y - y;
                            const dz = item.z - z;
                            const distSq = dx * dx + dy * dy + dz * dz;

                            if (distSq < nearestDistSq) {
                                nearestDistSq = distSq;
                                nearestItem = item;
                            }
                        }
                    }
                }
            }
        }

        if (nearestItem) {
            return {
                x: nearestItem.x,
                y: nearestItem.y,
                z: nearestItem.z,
                data: nearestItem.data,
                dist: Math.sqrt(nearestDistSq)
            };
        }
        return null;
    }

    /**
     * Find items within a radius that match a distance range (for explore mode)
     * @param {number} x - Query X position
     * @param {number} y - Query Y position
     * @param {number} z - Query Z position
     * @param {number} minDist - Minimum distance
     * @param {number} maxDist - Maximum distance
     * @param {Function} filter - Optional filter function
     * @returns {Array} Array of matching items
     */
    queryRange(x, y, z, minDist, maxDist, filter = null) {
        const results = [];
        const minDistSq = minDist * minDist;
        const maxDistSq = maxDist * maxDist;

        // Calculate cell range to check
        const minCx = Math.floor((x - maxDist) * this.invCellSize);
        const maxCx = Math.floor((x + maxDist) * this.invCellSize);
        const minCy = Math.floor((y - maxDist) * this.invCellSize);
        const maxCy = Math.floor((y + maxDist) * this.invCellSize);
        const minCz = Math.floor((z - maxDist) * this.invCellSize);
        const maxCz = Math.floor((z + maxDist) * this.invCellSize);

        for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cy = minCy; cy <= maxCy; cy++) {
                for (let cz = minCz; cz <= maxCz; cz++) {
                    const key = `${cx},${cy},${cz}`;
                    const cell = this.cells.get(key);

                    if (cell) {
                        for (const item of cell) {
                            if (filter && !filter(item.data)) continue;

                            const dx = item.x - x;
                            const dy = item.y - y;
                            const dz = item.z - z;
                            const distSq = dx * dx + dy * dy + dz * dz;

                            if (distSq >= minDistSq && distSq <= maxDistSq) {
                                results.push({
                                    x: item.x,
                                    y: item.y,
                                    z: item.z,
                                    data: item.data,
                                    dist: Math.sqrt(distSq)
                                });
                            }
                        }
                    }
                }
            }
        }

        return results;
    }

    /**
     * Clear all items from the hash
     */
    clear() {
        this.cells.clear();
        this.itemCount = 0;
    }

    /**
     * Get the number of items in the hash
     */
    get size() {
        return this.itemCount;
    }

    /**
     * Rebuild the hash from an array of items
     * More efficient than individual inserts
     * @param {Array} items - Array of { x, y, z, data }
     */
    rebuild(items) {
        this.clear();

        for (const item of items) {
            const key = this._getCellKey(item.x, item.y, item.z);

            if (!this.cells.has(key)) {
                this.cells.set(key, []);
            }

            this.cells.get(key).push({
                x: item.x,
                y: item.y,
                z: item.z,
                data: item.data
            });
            this.itemCount++;
        }
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.SpatialHash = SpatialHash;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpatialHash;
}
