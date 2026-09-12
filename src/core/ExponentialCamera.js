/**
 * Exponential Zoom Camera Controller
 * Handles seamless zoom across 41 orders of magnitude (10^-15 to 10^26)
 * Supports both mouse/touch and keyboard input
 */

import * as THREE from 'three';

export class ExponentialCamera {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        
        // Current scale exponent (logarithmic position)
        this.scaleExponent = 26; // Start at cosmic scale (10^26 m)
        this.minExponent = -15;  // Atomic scale
        this.maxExponent = 26;   // Cosmic scale
        
        // Position in scaled coordinates
        this.position = new THREE.Vector3(0, 0, 0);
        this.targetPosition = new THREE.Vector3(0, 0, 0);
        
        // Rotation (spherical coordinates for smooth navigation)
        this.spherical = new THREE.Spherical(1, 0, 0);
        this.targetSpherical = new THREE.Spherical(1, 0, 0);
        
        // Movement state
        this.isDragging = false;
        this.lastMouse = new THREE.Vector2();
        this.velocity = new THREE.Vector3();
        this.angularVelocity = new THREE.Vector2();
        
        // Configuration
        this.zoomSpeed = 0.002;      // Exponential zoom speed
        this.panSpeed = 0.5;          // Panning sensitivity
        this.rotateSpeed = 0.003;     // Rotation sensitivity
        this.dampingFactor = 0.95;    // Movement damping
        this.autoRotate = false;
        this.autoRotateSpeed = 0.001;
        
        // Callbacks
        this.onScaleChange = null;
        this.onPositionChange = null;
        
        this.initListeners();
    }
    
    initListeners() {
        const element = this.domElement;
        
        // Mouse events
        element.addEventListener('mousedown', this.onMouseDown.bind(this));
        element.addEventListener('mousemove', this.onMouseMove.bind(this));
        element.addEventListener('mouseup', this.onMouseUp.bind(this));
        element.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
        
        // Touch events
        element.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
        element.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
        element.addEventListener('touchend', this.onTouchEnd.bind(this));
        
        // Keyboard events
        window.addEventListener('keydown', this.onKeyDown.bind(this));
        window.addEventListener('keyup', this.onKeyUp.bind(this));
        
        // Prevent context menu
        element.addEventListener('contextmenu', e => e.preventDefault());
    }
    
    onMouseDown(event) {
        this.isDragging = true;
        this.lastMouse.set(event.clientX, event.clientY);
        this.autoRotate = false;
    }
    
    onMouseMove(event) {
        if (!this.isDragging) return;
        
        const deltaX = event.clientX - this.lastMouse.x;
        const deltaY = event.clientY - this.lastMouse.y;
        
        // Update rotation based on mouse movement
        this.spherical.theta -= deltaX * this.rotateSpeed;
        this.spherical.phi += deltaY * this.rotateSpeed;
        
        // Clamp phi to avoid gimbal lock
        this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));
        
        this.lastMouse.set(event.clientX, event.clientY);
    }
    
    onMouseUp() {
        this.isDragging = false;
    }
    
    onWheel(event) {
        event.preventDefault();
        
        // Exponential zoom based on scroll delta
        const delta = event.deltaY > 0 ? 1 : -1;
        this.scaleExponent += delta * this.zoomSpeed * 10;
        
        // Clamp to valid range
        this.scaleExponent = Math.max(this.minExponent, Math.min(this.maxExponent, this.scaleExponent));
        
        if (this.onScaleChange) {
            this.onScaleChange(this.scaleExponent);
        }
    }
    
    onTouchStart(event) {
        if (event.touches.length === 1) {
            this.isDragging = true;
            this.lastMouse.set(event.touches[0].clientX, event.touches[0].clientY);
            this.autoRotate = false;
        } else if (event.touches.length === 2) {
            // Pinch to zoom
            this.lastTouchDistance = this.getTouchDistance(event.touches);
        }
    }
    
    onTouchMove(event) {
        event.preventDefault();
        
        if (event.touches.length === 1 && this.isDragging) {
            const deltaX = event.touches[0].clientX - this.lastMouse.x;
            const deltaY = event.touches[0].clientY - this.lastMouse.y;
            
            this.spherical.theta -= deltaX * this.rotateSpeed;
            this.spherical.phi += deltaY * this.rotateSpeed;
            this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));
            
            this.lastMouse.set(event.touches[0].clientX, event.touches[0].clientY);
        } else if (event.touches.length === 2) {
            // Pinch zoom
            const distance = this.getTouchDistance(event.touches);
            const delta = this.lastTouchDistance - distance;
            
            this.scaleExponent += delta * 0.01;
            this.scaleExponent = Math.max(this.minExponent, Math.min(this.maxExponent, this.scaleExponent));
            
            this.lastTouchDistance = distance;
            
            if (this.onScaleChange) {
                this.onScaleChange(this.scaleExponent);
            }
        }
    }
    
    onTouchEnd() {
        this.isDragging = false;
    }
    
    getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    onKeyDown(event) {
        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.velocity.z = -1;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.velocity.z = 1;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.velocity.x = -1;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.velocity.x = 1;
                break;
            case 'KeyQ':
                this.scaleExponent += 0.5;
                this.scaleExponent = Math.max(this.minExponent, Math.min(this.maxExponent, this.scaleExponent));
                if (this.onScaleChange) this.onScaleChange(this.scaleExponent);
                break;
            case 'KeyE':
                this.scaleExponent -= 0.5;
                this.scaleExponent = Math.max(this.minExponent, Math.min(this.maxExponent, this.scaleExponent));
                if (this.onScaleChange) this.onScaleChange(this.scaleExponent);
                break;
            case 'Space':
                this.velocity.y = -1;
                break;
            case 'ShiftLeft':
                this.velocity.y = 1;
                break;
        }
    }
    
    onKeyUp(event) {
        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
            case 'KeyS':
            case 'ArrowDown':
                this.velocity.z = 0;
                break;
            case 'KeyA':
            case 'ArrowLeft':
            case 'KeyD':
            case 'ArrowRight':
                this.velocity.x = 0;
                break;
            case 'Space':
            case 'ShiftLeft':
                this.velocity.y = 0;
                break;
        }
    }
    
    /**
     * Set the current scale exponent directly
     * @param {number} exponent - Power of 10 (e.g., 26 for 10^26 meters)
     */
    setScaleExponent(exponent) {
        this.scaleExponent = Math.max(this.minExponent, Math.min(this.maxExponent, exponent));
        if (this.onScaleChange) {
            this.onScaleChange(this.scaleExponent);
        }
    }
    
    /**
     * Get the current scale factor
     * @returns {number} - Current scale as power of 10
     */
    getScaleFactor() {
        return Math.pow(10, this.scaleExponent);
    }
    
    /**
     * Convert world coordinates to scaled local coordinates
     * @param {THREE.Vector3} worldPos - Position in world space
     * @returns {THREE.Vector3} - Position in scaled local space
     */
    worldToScaled(worldPos) {
        const scale = this.getScaleFactor();
        return worldPos.clone().divideScalar(scale);
    }
    
    /**
     * Convert scaled local coordinates to world coordinates
     * @param {THREE.Vector3} localPos - Position in scaled local space
     * @returns {THREE.Vector3} - Position in world space
     */
    scaledToWorld(localPos) {
        const scale = this.getScaleFactor();
        return localPos.clone().multiplyScalar(scale);
    }
    
    update(deltaTime) {
        // Apply damping to angular velocity
        this.angularVelocity.multiplyScalar(this.dampingFactor);
        
        // Auto-rotation
        if (this.autoRotate) {
            this.spherical.theta += this.autoRotateSpeed;
        }
        
        // Apply keyboard movement
        const moveSpeed = deltaTime * 2 * this.getScaleFactor();
        if (this.velocity.x !== 0 || this.velocity.z !== 0) {
            const forward = new THREE.Vector3(
                -Math.sin(this.spherical.theta),
                0,
                -Math.cos(this.spherical.theta)
            );
            const right = new THREE.Vector3(
                Math.cos(this.spherical.theta),
                0,
                -Math.sin(this.spherical.theta)
            );
            
            this.position.add(forward.multiplyScalar(-this.velocity.z * moveSpeed));
            this.position.add(right.multiplyScalar(this.velocity.x * moveSpeed));
        }
        
        if (this.velocity.y !== 0) {
            this.position.y += this.velocity.y * moveSpeed;
        }
        
        // Update camera position from spherical coordinates
        const radius = 5; // Fixed distance from target
        this.camera.position.setFromSpherical(
            new THREE.Spherical(radius, this.spherical.phi, this.spherical.theta)
        );
        this.camera.position.add(this.position);
        
        // Look at current position
        this.camera.lookAt(this.position);
        
        // Update scale display
        if (this.onScaleChange && Math.random() < 0.1) {
            this.onScaleChange(this.scaleExponent);
        }
    }
    
    dispose() {
        const element = this.domElement;
        
        element.removeEventListener('mousedown', this.onMouseDown.bind(this));
        element.removeEventListener('mousemove', this.onMouseMove.bind(this));
        element.removeEventListener('mouseup', this.onMouseUp.bind(this));
        element.removeEventListener('wheel', this.onWheel.bind(this));
        element.removeEventListener('touchstart', this.onTouchStart.bind(this));
        element.removeEventListener('touchmove', this.onTouchMove.bind(this));
        element.removeEventListener('touchend', this.onTouchEnd.bind(this));
        window.removeEventListener('keydown', this.onKeyDown.bind(this));
        window.removeEventListener('keyup', this.onKeyUp.bind(this));
    }
}

export default ExponentialCamera;
