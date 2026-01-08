/**
 * Star Map Camera & Fleet View Mixin
 *
 * Camera navigation, fleet view mode, and Sol system prompt.
 *
 * This file must be loaded AFTER star_map.js
 */

Object.assign(StarMapVisualization.prototype, {

    /**
     * Focus camera on Sol system - hotkey "1"
     * Smoothly animates camera to Sol's position
     */
    focusOnSol() {
        if (!this.isActive || !this.solMesh || !this.controls) return;

        // Use simple camera system - go to Sol and follow it
        this.goToSol();
        console.log('[StarMap] Focused on Sol');
    },

    /**
     * Toggle fleet view mode - follow a probe fleet
     */
    toggleFleetView() {
        if (this.fleetViewMode) {
            this.exitFleetView();
        } else {
            this.enterFleetView();
        }
    },

    /**
     * Enter fleet view mode - track the first available fleet
     */
    enterFleetView() {
        if (this.probeFleets.length === 0) {
            console.log('[StarMap] No fleets in transit to track');
            return;
        }

        this.fleetViewMode = true;
        this.trackedFleetIndex = 0;
        this.trackedFleet = this.probeFleets[0];
        this.lastArrivedStar = null;

        // Show fleet view indicator
        this.showFleetViewIndicator();

        console.log('[StarMap] Fleet view active - tracking fleet', this.trackedFleetIndex + 1, 'of', this.probeFleets.length);
    },

    /**
     * Exit fleet view mode
     */
    exitFleetView() {
        this.fleetViewMode = false;
        this.trackedFleet = null;

        // Hide fleet view indicator
        this.hideFleetViewIndicator();

        console.log('[StarMap] Fleet view exited');
    },

    /**
     * Get the current camera zoom distance (distance from camera to target)
     */
    getCameraZoomDistance() {
        if (!this.camera || !this.controls) return 15;  // Default fallback
        return this.camera.position.distanceTo(this.controls.target);
    },

    /**
     * SIMPLE CAMERA SYSTEM
     *
     * Follow a mesh (like solMesh) and maintain offset as galaxy rotates.
     * No complex state, no locks, just follow the target.
     */

    /**
     * Set camera to follow a specific mesh
     * @param {THREE.Object3D} mesh - The mesh to follow
     * @param {number} zoom - Distance from target (optional)
     */
    followMesh(mesh, zoom = null) {
        if (!mesh) return;

        this.followTarget = mesh;

        // Store current camera offset direction if we have one
        if (this.camera && this.controls) {
            const offset = this.camera.position.clone().sub(this.controls.target);
            if (offset.length() > 0.1) {
                offset.normalize();
                if (zoom !== null) {
                    offset.multiplyScalar(zoom);
                } else {
                    offset.multiplyScalar(this.getCameraZoomDistance());
                }
                this.cameraOffset = offset;
            }
        }

        console.log('[Camera] Now following:', mesh.name || 'mesh');
    },

    /**
     * Animate camera to a world position
     * @param {THREE.Vector3} worldPos - Target position in world coordinates
     * @param {number} zoom - Distance from target (optional, keeps current if null)
     */
    goToPosition(worldPos, zoom = null) {
        if (!this.camera || !this.controls) return;
        if (this.cameraAnimating) return;

        // Exit fleet view if active
        if (this.fleetViewMode) {
            this.exitFleetView();
        }

        // Stop following any mesh
        this.followTarget = null;

        const finalZoom = zoom !== null ? zoom : this.getCameraZoomDistance();

        // Keep camera in same direction relative to target
        let direction = this.camera.position.clone().sub(this.controls.target);
        if (direction.length() < 0.1) {
            direction = new THREE.Vector3(0, 3, 10);
        }
        direction.normalize().multiplyScalar(finalZoom);

        const targetCamPos = worldPos.clone().add(direction);

        // Animate
        this.cameraAnimating = true;
        const startPos = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        let t = 0;

        const animate = () => {
            t += 0.05;
            if (t >= 1) {
                this.camera.position.copy(targetCamPos);
                this.controls.target.copy(worldPos);
                this.controls.update();
                this.cameraAnimating = false;
                return;
            }

            const ease = 1 - Math.pow(1 - t, 3);
            this.camera.position.lerpVectors(startPos, targetCamPos, ease);
            this.controls.target.lerpVectors(startTarget, worldPos, ease);
            this.controls.update();
            requestAnimationFrame(animate);
        };
        animate();
    },

    /**
     * Update camera each frame - keeps controls.target on the followed mesh
     * IMPORTANT: Only update target, NOT camera position - let OrbitControls handle rotation/zoom
     */
    updateCameraFollow() {
        if (this.cameraAnimating) return;
        if (this.fleetViewMode) return;

        if (!this.followTarget) return;
        if (!this.camera || !this.controls) return;

        // Get world position of target mesh
        const targetWorldPos = new THREE.Vector3();
        this.followTarget.getWorldPosition(targetWorldPos);

        // Calculate how much the target moved since last frame
        const oldTarget = this.controls.target.clone();
        const delta = targetWorldPos.clone().sub(oldTarget);

        // Move both target AND camera by the same delta
        // This keeps the camera in the same relative position while allowing OrbitControls to work
        this.controls.target.copy(targetWorldPos);
        this.camera.position.add(delta);
    },

    /**
     * Navigate to Sol
     */
    goToSol() {
        if (this.solMesh) {
            this.followMesh(this.solMesh);
            // Also animate to it
            const worldPos = new THREE.Vector3();
            this.solMesh.getWorldPosition(worldPos);
            this.goToPositionAndFollow(worldPos, this.solMesh, 15);

            // Track that we're focused on Sol
            this.focusedOnSol = true;
            this.showSolSystemPrompt();
        }
    },

    /**
     * Show "Sol System [Enter]" prompt when focused on Sol
     */
    showSolSystemPrompt() {
        if (!this.container) return;

        // Remove existing prompt if any
        this.hideSolSystemPrompt();

        const prompt = document.createElement('div');
        prompt.id = 'sol-system-prompt';
        prompt.className = 'sol-system-prompt';
        prompt.innerHTML = 'Sol System <span class="prompt-key">[Enter]</span>';
        this.container.appendChild(prompt);

        // Fade in
        setTimeout(() => prompt.classList.add('visible'), 10);
    },

    /**
     * Hide the Sol System prompt
     */
    hideSolSystemPrompt() {
        this.focusedOnSol = false;
        const prompt = document.getElementById('sol-system-prompt');
        if (prompt) {
            prompt.remove();
        }
    },

    /**
     * Enter Sol System view (hide galaxy, show solar system)
     */
    enterSolSystem() {
        console.log('[StarMap] Entering Sol System view');
        this.hideSolSystemPrompt();
        this.hide();
        // Solar system view will be shown automatically when galaxy is hidden
    },

    /**
     * Go to position and then follow a mesh
     */
    goToPositionAndFollow(worldPos, mesh, zoom = null) {
        if (!this.camera || !this.controls) return;
        if (this.cameraAnimating) return;

        // Hide Sol prompt when navigating elsewhere (unless we're going to Sol)
        if (mesh !== this.solMesh) {
            this.hideSolSystemPrompt();
        }

        if (this.fleetViewMode) {
            this.exitFleetView();
        }

        const finalZoom = zoom !== null ? zoom : this.getCameraZoomDistance();

        let direction = this.camera.position.clone().sub(this.controls.target);
        if (direction.length() < 0.1) {
            direction = new THREE.Vector3(0, 3, 10);
        }
        direction.normalize().multiplyScalar(finalZoom);

        // Store this as the offset we'll use when following
        this.cameraOffset = direction.clone();
        this.followTarget = mesh;

        const targetCamPos = worldPos.clone().add(direction);

        this.cameraAnimating = true;
        const startPos = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        let t = 0;

        const animate = () => {
            t += 0.05;

            // Recalculate target position (mesh may rotate with galaxy)
            const currentWorldPos = new THREE.Vector3();
            if (mesh) {
                mesh.getWorldPosition(currentWorldPos);
            } else {
                currentWorldPos.copy(worldPos);
            }
            const currentCamPos = currentWorldPos.clone().add(this.cameraOffset);

            if (t >= 1) {
                this.camera.position.copy(currentCamPos);
                this.controls.target.copy(currentWorldPos);
                this.controls.update();
                this.cameraAnimating = false;
                return;
            }

            const ease = 1 - Math.pow(1 - t, 3);
            this.camera.position.lerpVectors(startPos, currentCamPos, ease);
            this.controls.target.lerpVectors(startTarget, currentWorldPos, ease);
            this.controls.update();
            requestAnimationFrame(animate);
        };
        animate();
    },

    /**
     * Move camera to new target (for fleet switching etc)
     */
    moveCameraToTarget(newTarget, animate = true) {
        if (!this.camera || !this.controls) return;

        const zoomDistance = this.getCameraZoomDistance();
        const direction = this.camera.position.clone().sub(this.controls.target).normalize();
        const newCameraPos = newTarget.clone().add(direction.multiplyScalar(zoomDistance));

        if (animate) {
            const startPos = this.camera.position.clone();
            const startTarget = this.controls.target.clone();
            let progress = 0;

            const animateCamera = () => {
                progress += 0.08;
                if (progress >= 1) {
                    this.camera.position.copy(newCameraPos);
                    this.controls.target.copy(newTarget);
                    this.controls.update();
                    return;
                }
                const t = 1 - Math.pow(1 - progress, 3);
                this.camera.position.lerpVectors(startPos, newCameraPos, t);
                this.controls.target.lerpVectors(startTarget, newTarget, t);
                this.controls.update();
                requestAnimationFrame(animateCamera);
            };
            animateCamera();
        } else {
            this.camera.position.copy(newCameraPos);
            this.controls.target.copy(newTarget);
            this.controls.update();
        }
    },

    /**
     * Switch to next fleet in transit
     */
    nextFleet() {
        if (!this.fleetViewMode || this.probeFleets.length === 0) return;

        this.trackedFleetIndex = (this.trackedFleetIndex + 1) % this.probeFleets.length;
        this.trackedFleet = this.probeFleets[this.trackedFleetIndex];
        this.lastArrivedStar = null;

        // Move camera to new fleet position while preserving zoom
        if (this.trackedFleet && this.trackedFleet.probe) {
            const targetPos = this.trackedFleet.probe.position.clone();
            if (this.colonizationGroup) {
                targetPos.applyMatrix4(this.colonizationGroup.matrixWorld);
            }
            this.moveCameraToTarget(targetPos);
        }

        this.updateFleetViewIndicator();
        console.log('[StarMap] Now tracking fleet', this.trackedFleetIndex + 1, 'of', this.probeFleets.length);
    },

    /**
     * Switch to previous fleet in transit
     */
    prevFleet() {
        if (!this.fleetViewMode || this.probeFleets.length === 0) return;

        this.trackedFleetIndex = (this.trackedFleetIndex - 1 + this.probeFleets.length) % this.probeFleets.length;
        this.trackedFleet = this.probeFleets[this.trackedFleetIndex];
        this.lastArrivedStar = null;

        // Move camera to new fleet position while preserving zoom
        if (this.trackedFleet && this.trackedFleet.probe) {
            const targetPos = this.trackedFleet.probe.position.clone();
            if (this.colonizationGroup) {
                targetPos.applyMatrix4(this.colonizationGroup.matrixWorld);
            }
            this.moveCameraToTarget(targetPos);
        }

        this.updateFleetViewIndicator();
        console.log('[StarMap] Now tracking fleet', this.trackedFleetIndex + 1, 'of', this.probeFleets.length);
    },

    /**
     * Update camera to follow tracked fleet
     * Called from animate loop when in fleet view mode
     */
    updateFleetViewCamera() {
        if (!this.fleetViewMode) return;

        let targetPos;

        // Check if our tracked fleet is still valid
        if (this.trackedFleet && this.probeFleets.includes(this.trackedFleet)) {
            // Fleet still in transit - follow its current position
            targetPos = this.trackedFleet.probe.position.clone();
            this._fleetViewExitDelay = null;  // Reset exit delay when tracking valid fleet

            // Convert to world coordinates
            if (this.colonizationGroup) {
                targetPos.applyMatrix4(this.colonizationGroup.matrixWorld);
            }
        } else if (this.lastArrivedStar) {
            // Fleet arrived - stay at the colonized star
            targetPos = this.lastArrivedStar.position.clone();
            this._fleetViewExitDelay = null;  // Reset exit delay when at arrived star
            if (this.colonizationGroup) {
                targetPos.applyMatrix4(this.colonizationGroup.matrixWorld);
            }
        } else {
            // Fleet completed but no arrived star tracked - try to find a new fleet
            if (this.probeFleets.length > 0) {
                this.trackedFleetIndex = Math.min(this.trackedFleetIndex, this.probeFleets.length - 1);
                this.trackedFleet = this.probeFleets[this.trackedFleetIndex];
                this.updateFleetViewIndicator();
                return;
            } else {
                // No more fleets - wait a moment for new ones before exiting
                // This prevents immediate exit if there's a brief gap between fleets
                if (!this._fleetViewExitDelay) {
                    this._fleetViewExitDelay = Date.now();
                    return;  // Wait before exiting
                }
                // Exit after 2 seconds with no fleets
                if (Date.now() - this._fleetViewExitDelay > 2000) {
                    this._fleetViewExitDelay = null;
                    this.exitFleetView();
                }
                return;
            }
        }

        // Smoothly follow the target - update both target AND camera position
        if (targetPos && this.controls) {
            // Calculate current offset from target to camera
            const currentOffset = this.camera.position.clone().sub(this.controls.target);

            // Smoothly move the target
            this.controls.target.lerp(targetPos, 0.05);

            // Move camera to maintain the same relative offset
            const newCameraPos = this.controls.target.clone().add(currentOffset);
            this.camera.position.lerp(newCameraPos, 0.05);
        }
    },

    /**
     * Called when a fleet arrives - update tracking if we were following it
     */
    onFleetArrived(fleet, newStar) {
        if (this.fleetViewMode && fleet === this.trackedFleet) {
            // The fleet we were tracking has arrived
            this.lastArrivedStar = newStar;
            this.trackedFleet = null;

            // Update indicator to show we're at the new colony
            this.updateFleetViewIndicator();
        }
    },

    /**
     * Show the fleet view indicator UI
     */
    showFleetViewIndicator() {
        let indicator = document.getElementById('fleet-view-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'fleet-view-indicator';
            indicator.className = 'fleet-view-indicator';
            this.container.appendChild(indicator);
        }
        indicator.style.display = 'block';
        this.updateFleetViewIndicator();
    },

    /**
     * Hide the fleet view indicator UI
     */
    hideFleetViewIndicator() {
        const indicator = document.getElementById('fleet-view-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    },

    /**
     * Update the fleet view indicator content
     */
    updateFleetViewIndicator() {
        const indicator = document.getElementById('fleet-view-indicator');
        if (!indicator) return;

        let content = '<div class="fleet-indicator-header">FLEET VIEW</div>';

        if (this.lastArrivedStar) {
            // At a newly colonized star
            const distLY = Math.round(this.lastArrivedStar.position.length() * 326);
            content += `<div class="fleet-indicator-status arrived">COLONY ESTABLISHED</div>`;
            content += `<div class="fleet-indicator-distance">${this.formatDistance(distLY)} from Sol</div>`;
        } else if (this.trackedFleet) {
            // Tracking an in-transit fleet
            const progress = Math.round(this.trackedFleet.progress * 100);
            const distLY = Math.round(this.trackedFleet.distance * 326);
            content += `<div class="fleet-indicator-status transit">IN TRANSIT</div>`;
            content += `<div class="fleet-indicator-progress">${progress}% complete</div>`;
            content += `<div class="fleet-indicator-distance">Target: ${this.formatDistance(distLY)}</div>`;
        }

        content += `<div class="fleet-indicator-nav">`;
        content += `<span class="fleet-count">${this.trackedFleetIndex + 1}/${this.probeFleets.length}</span>`;
        content += `<span class="fleet-hint">← → Switch fleets</span>`;
        content += `</div>`;
        content += `<div class="fleet-indicator-exit">Press F or 1 to exit</div>`;

        indicator.innerHTML = content;
    },

    /**
     * Format distance for display
     */
    formatDistance(ly) {
        if (ly >= 1000) {
            return `${(ly / 1000).toFixed(1)} kly`;
        }
        return `${ly} ly`;
    }
});
