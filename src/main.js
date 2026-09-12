/**
 * Main Application Entry Point
 * Initializes Three.js scene, loads data, and manages the render loop
 */

import * as THREE from 'three';
import { ExponentialCamera } from './core/ExponentialCamera.js';
import { TimeController } from './core/TimeController.js';
import { ContemplationPanel } from './ui/ContemplationPanel.js';
import { CosmicWebRenderer } from './scenes/CosmicWebRenderer.js';
import { fetchGalaxyData } from '../scripts/fetchSDSSData.js';

class TabassurApp {
    constructor() {
        this.container = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        this.expoCamera = null;
        this.timeController = null;
        this.contemplationPanel = null;
        this.cosmicWebRenderer = null;
        
        this.clock = new THREE.Clock();
        this.fpsCounter = null;
        this.frameCount = 0;
        this.lastFpsUpdate = 0;
        
        this.currentJourney = 'afaq';
        this.isLoading = true;
        
        this.init();
    }
    
    async init() {
        console.log('Initializing Tabassur...');
        this.updateLoadingProgress(10, 'جاري تهيئة المشهد...');
        
        // Setup container
        this.container = document.getElementById('canvas-container');
        if (!this.container) {
            console.error('Canvas container not found');
            return;
        }
        
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0f);
        this.scene.fog = new THREE.FogExp2(0x0a0a0f, 1e-27);
        
        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            1e30
        );
        this.camera.position.set(0, 0, 5e26);
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: false
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.container.appendChild(this.renderer.domElement);
        
        this.updateLoadingProgress(30, 'جاري تحميل بيانات المجرات...');
        
        // Initialize exponential camera controller
        this.expoCamera = new ExponentialCamera(this.camera, this.container);
        this.expoCamera.onScaleChange = (exponent) => {
            this.updateScaleDisplay(exponent);
            if (this.cosmicWebRenderer) {
                this.cosmicWebRenderer.setScaleExponent(exponent);
            }
        };
        
        // Initialize time controller
        this.timeController = new TimeController();
        this.bindTimeUI();
        
        // Initialize contemplation panel
        this.contemplationPanel = new ContemplationPanel();
        this.bindContemplationUI();
        
        // Load galaxy data
        try {
            const galaxyData = await fetchGalaxyData(false); // Use sample data for now
            this.updateLoadingProgress(60, 'جاري بناء البنية الكونية...');
            
            // Initialize cosmic web renderer
            this.cosmicWebRenderer = new CosmicWebRenderer(this.scene);
            this.cosmicWebRenderer.loadGalaxyData(galaxyData);
            
            this.updateLoadingProgress(90, 'جاري التحضير للتأمل...');
        } catch (error) {
            console.error('Failed to load galaxy data:', error);
            this.updateLoadingProgress(100, 'حدث خطأ في التحميل');
            return;
        }
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Hide loading screen
        setTimeout(() => {
            this.hideLoadingScreen();
            this.isLoading = false;
        }, 500);
        
        // Start render loop
        this.animate();
        
        console.log('Tabassur initialized successfully');
    }
    
    /**
     * Bind time slider UI elements
     */
    bindTimeUI() {
        const slider = document.getElementById('time-slider');
        const valueEl = document.getElementById('time-value');
        const ticksContainer = document.getElementById('time-ticks');
        
        if (slider && valueEl && ticksContainer) {
            this.timeController.bindUI(slider, valueEl, ticksContainer);
            
            this.timeController.onTimeChange = (logTime) => {
                // Update scene based on time
                this.updateSceneForTime(logTime);
            };
        }
    }
    
    /**
     * Bind contemplation panel UI elements
     */
    bindContemplationUI() {
        const panel = document.getElementById('contemplation-panel');
        const verseArabic = document.getElementById('verse-arabic');
        const verseRef = document.getElementById('verse-reference');
        const tafsirText = document.getElementById('tafsir-text');
        const factText = document.getElementById('fact-text');
        const reflectionInput = document.getElementById('reflection-input');
        
        if (panel && verseArabic && verseRef && tafsirText && factText && reflectionInput) {
            this.contemplationPanel.bindUI(
                panel, verseArabic, verseRef, tafsirText, factText, reflectionInput
            );
            
            // Show initial contemplation content
            setTimeout(() => {
                this.contemplationPanel.setStation('cosmicWeb', 'afaq');
            }, 2000);
        }
    }
    
    /**
     * Setup global event listeners
     */
    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        // Journey toggle buttons
        const journeyBtns = document.querySelectorAll('.journey-btn');
        journeyBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                journeyBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const journey = btn.dataset.journey;
                this.switchJourney(journey);
            });
        });
        
        // FPS counter element
        this.fpsCounter = document.getElementById('fps-counter');
        
        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyC') {
                // Toggle contemplation panel
                this.contemplationPanel.toggle();
            }
        });
    }
    
    /**
     * Switch between Al-Afaq and Al-Anfus journeys
     */
    switchJourney(journey) {
        if (journey === this.currentJourney) return;
        
        this.currentJourney = journey;
        console.log(`Switching to journey: ${journey}`);
        
        // For now, just update the contemplation panel
        // In full implementation, this would load different scenes
        if (journey === 'afaq') {
            this.contemplationPanel.setStation('cosmicWeb', 'afaq');
        } else {
            // Al-Anfus journey would show cellular/molecular view
            this.contemplationPanel.setStation('cell', 'anfus');
        }
    }
    
    /**
     * Update scale display based on camera exponent
     */
    updateScaleDisplay(exponent) {
        const scaleEl = document.getElementById('scale-value');
        if (scaleEl) {
            scaleEl.innerHTML = `10<sup>${exponent.toFixed(1)}</sup> متر`;
        }
    }
    
    /**
     * Update scene appearance based on cosmic time
     */
    updateSceneForTime(logTime) {
        if (!this.cosmicWebRenderer) return;
        
        // Adjust visual parameters based on cosmic epoch
        const time = this.timeController.getCurrentEvent();
        if (time) {
            console.log(`Current cosmic epoch: ${time.name}`);
            
            // Future: modify galaxy colors, density, etc. based on time
            // Early universe: hotter, denser, bluer galaxies
            // Far future: redshifted, dimmer, fewer galaxies
        }
    }
    
    /**
     * Update loading progress
     */
    updateLoadingProgress(percent, text) {
        const progressEl = document.getElementById('loading-progress');
        const textEl = document.getElementById('loading-text');
        
        if (progressEl) {
            progressEl.style.width = `${percent}%`;
        }
        if (textEl) {
            textEl.textContent = text;
        }
    }
    
    /**
     * Hide loading screen
     */
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
        }
    }
    
    /**
     * Main animation loop
     */
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const deltaTime = this.clock.getDelta();
        const elapsedTime = this.clock.getElapsedTime();
        
        // Update FPS counter
        this.frameCount++;
        if (elapsedTime - this.lastFpsUpdate >= 1) {
            if (this.fpsCounter) {
                this.fpsCounter.textContent = `FPS: ${this.frameCount}`;
            }
            this.frameCount = 0;
            this.lastFpsUpdate = elapsedTime;
        }
        
        if (!this.isLoading) {
            // Update camera
            this.expoCamera.update(deltaTime);
            
            // Update time controller
            this.timeController.update(deltaTime);
            
            // Update cosmic web renderer
            if (this.cosmicWebRenderer) {
                this.cosmicWebRenderer.update(deltaTime);
            }
            
            // Render scene
            this.renderer.render(this.scene, this.camera);
        }
    }
    
    /**
     * Cleanup on destroy
     */
    dispose() {
        if (this.expoCamera) {
            this.expoCamera.dispose();
        }
        
        if (this.cosmicWebRenderer) {
            this.cosmicWebRenderer.dispose();
        }
        
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.forceContextLoss();
            this.renderer.domElement.remove();
        }
        
        window.removeEventListener('resize', () => {});
    }
}

// Initialize application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.tabassurApp = new TabassurApp();
    });
} else {
    window.tabassurApp = new TabassurApp();
}

export default TabassurApp;
