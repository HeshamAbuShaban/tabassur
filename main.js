/**
 * TABASSUR - Main Application Entry Point
 * Cosmic Web Visualization with Three.js
 */

import * as THREE from 'three';
import { createCosmicWeb, createGalaxyCores } from './particleSystem.js';
import { 
    vertexShader, 
    fragmentShader, 
    galaxyCoreVertexShader, 
    galaxyCoreFragmentShader 
} from './shader.js';

// Configuration
const CONFIG = {
    particleCount: 150000,
    galaxyCoreCount: 50,
    backgroundColor: 0x020208,
    fogNear: 100,
    fogFar: 900,
    cameraFOV: 60,
    cameraNear: 0.1,
    cameraFar: 2000,
};

// Global state
let scene, camera, renderer, cosmicWebMesh, galaxyCoreMesh;
let clock, uniforms;
let isInitialized = false;

// Mouse/touch interaction state
const interactionState = {
    targetZoom: 0,
    currentZoom: 0,
    isDragging: false,
    lastMouseY: 0,
    rotationSpeed: 0.001,
};

/**
 * Initialize the Three.js scene
 */
function init() {
    const container = document.getElementById('canvas-container');
    
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.backgroundColor);
    scene.fog = new THREE.FogExp2(
        CONFIG.backgroundColor,
        0.0015
    );
    
    // Camera setup
    camera = new THREE.PerspectiveCamera(
        CONFIG.cameraFOV,
        window.innerWidth / window.innerHeight,
        CONFIG.cameraNear,
        CONFIG.cameraFar
    );
    camera.position.set(0, 0, 600);
    camera.lookAt(0, 0, 0);
    
    // Renderer setup with optimizations
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.sortObjects = false; // Optimize for particle rendering
    
    container.appendChild(renderer.domElement);
    
    // Initialize clock for time-based animations
    clock = new THREE.Clock();
    
    // Setup event listeners
    setupEventListeners();
    
    // Create cosmic web particles
    createParticles();
    
    isInitialized = true;
    
    // Hide loading indicator
    setTimeout(() => {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.add('hidden');
        }
    }, 1000);
    
    // Start animation loop
    animate();
}

/**
 * Create and add particle systems to the scene
 */
function createParticles() {
    console.log('Generating cosmic web particles...');
    
    // Generate cosmic web geometry
    const cosmicWebGeometry = createCosmicWeb(CONFIG.particleCount);
    
    // Uniforms for shader
    uniforms = {
        uTime: { value: 0 },
        uZoom: { value: 0 },
        uBaseColor: { value: new THREE.Color(0.3, 0.4, 0.6) },
    };
    
    // Create shader material for cosmic web
    const cosmicWebMaterial = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        uniforms: uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
    });
    
    cosmicWebMesh = new THREE.Points(cosmicWebGeometry, cosmicWebMaterial);
    scene.add(cosmicWebMesh);
    
    console.log(`Created ${CONFIG.particleCount} cosmic web particles`);
    
    // Generate galaxy cores
    const galaxyCoreGeometry = createGalaxyCores(CONFIG.galaxyCoreCount);
    
    const galaxyCoreMaterial = new THREE.ShaderMaterial({
        vertexShader: galaxyCoreVertexShader,
        fragmentShader: galaxyCoreFragmentShader,
        uniforms: {
            uTime: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
    });
    
    galaxyCoreMesh = new THREE.Points(galaxyCoreGeometry, galaxyCoreMaterial);
    scene.add(galaxyCoreMesh);
    
    console.log(`Created ${CONFIG.galaxyCoreCount} galaxy cores`);
}

/**
 * Setup mouse/touch interaction handlers
 */
function setupEventListeners() {
    // Window resize
    window.addEventListener('resize', onWindowResize, false);
    
    // Mouse wheel zoom
    window.addEventListener('wheel', onMouseWheel, { passive: false });
    
    // Mouse drag for rotation
    window.addEventListener('mousedown', onMouseDown, false);
    window.addEventListener('mousemove', onMouseMove, false);
    window.addEventListener('mouseup', onMouseUp, false);
    
    // Touch support
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, false);
}

/**
 * Handle window resize
 */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Handle mouse wheel for zoom
 */
function onMouseWheel(event) {
    event.preventDefault();
    
    const delta = event.deltaY > 0 ? 1 : -1;
    interactionState.targetZoom += delta * 0.5;
    interactionState.targetZoom = Math.max(-2, Math.min(10, interactionState.targetZoom));
}

/**
 * Handle mouse down for drag
 */
function onMouseDown(event) {
    interactionState.isDragging = true;
    interactionState.lastMouseY = event.clientY;
}

/**
 * Handle mouse move for rotation
 */
function onMouseMove(event) {
    if (!interactionState.isDragging || !cosmicWebMesh) return;
    
    const deltaX = event.movementX || 0;
    const deltaY = event.movementY || 0;
    
    cosmicWebMesh.rotation.y += deltaX * interactionState.rotationSpeed;
    cosmicWebMesh.rotation.x += deltaY * interactionState.rotationSpeed;
    
    if (galaxyCoreMesh) {
        galaxyCoreMesh.rotation.y += deltaX * interactionState.rotationSpeed;
        galaxyCoreMesh.rotation.x += deltaY * interactionState.rotationSpeed;
    }
}

/**
 * Handle mouse up
 */
function onMouseUp() {
    interactionState.isDragging = false;
}

/**
 * Handle touch start
 */
function onTouchStart(event) {
    if (event.touches.length === 1) {
        interactionState.isDragging = true;
        interactionState.lastMouseY = event.touches[0].clientY;
    }
}

/**
 * Handle touch move
 */
function onTouchMove(event) {
    if (!interactionState.isDragging || !cosmicWebMesh || event.touches.length !== 1) return;
    event.preventDefault();
    
    const touch = event.touches[0];
    const deltaY = touch.clientY - interactionState.lastMouseY;
    
    cosmicWebMesh.rotation.y += deltaY * interactionState.rotationSpeed;
    cosmicWebMesh.rotation.x += deltaY * interactionState.rotationSpeed;
    
    if (galaxyCoreMesh) {
        galaxyCoreMesh.rotation.y += deltaY * interactionState.rotationSpeed;
        galaxyCoreMesh.rotation.x += deltaY * interactionState.rotationSpeed;
    }
    
    interactionState.lastMouseY = touch.clientY;
}

/**
 * Handle touch end
 */
function onTouchEnd() {
    interactionState.isDragging = false;
}

/**
 * Smooth interpolation helper
 */
function lerp(start, end, t) {
    return start + (end - start) * t;
}

/**
 * Animation loop
 */
function animate() {
    requestAnimationFrame(animate);
    
    if (!isInitialized) return;
    
    const elapsedTime = clock.getElapsedTime();
    const deltaTime = clock.getDelta();
    
    // Update shader uniforms
    if (uniforms) {
        uniforms.uTime.value = elapsedTime;
        uniforms.uZoom.value = interactionState.currentZoom;
    }
    
    // Smooth zoom interpolation
    interactionState.currentZoom = lerp(
        interactionState.currentZoom,
        interactionState.targetZoom,
        0.05
    );
    
    // Auto-rotation when not interacting
    if (!interactionState.isDragging && cosmicWebMesh) {
        cosmicWebMesh.rotation.y += 0.0005;
        if (galaxyCoreMesh) {
            galaxyCoreMesh.rotation.y += 0.0005;
        }
    }
    
    // Subtle camera movement based on zoom
    const baseDistance = 600;
    const zoomOffset = interactionState.currentZoom * 50;
    const targetZ = baseDistance - zoomOffset;
    camera.position.z = lerp(camera.position.z, targetZ, 0.03);
    
    // Render the scene
    renderer.render(scene, camera);
}

/**
 * Initialize application when DOM is ready
 */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
