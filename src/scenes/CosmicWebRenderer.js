/**
 * Cosmic Web Renderer
 * Renders hierarchical galaxy point cloud with Voronoi structure visualization
 * Optimized for 60 FPS on mid-range devices
 */

import * as THREE from 'three';

export class CosmicWebRenderer {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.options = {
            maxPoints: 50000,
            pointSize: 1.5,
            filamentOpacity: 0.3,
            nodeScale: 2.0,
            voidColor: 0x1a1a2e,
            filamentColor: 0x4a4a6a,
            nodeColor: 0xff6b6b,
            ...options
        };
        
        // Groups for different structures
        this.voidGroup = new THREE.Group();
        this.filamentGroup = new THREE.Group();
        this.nodeGroup = new THREE.Group();
        this.galaxyGroup = new THREE.Group();
        
        // Point cloud systems
        this.galaxyPoints = null;
        this.filamentLines = null;
        
        // LOD management
        this.currentLOD = 0;
        this.lodDistances = [1e24, 1e23, 1e22, 1e21];
        
        // Animation state
        this.time = 0;
        this.visibleGalaxies = [];
        
        this.init();
    }
    
    init() {
        // Add groups to scene in order (voids first, then filaments, nodes, galaxies)
        this.scene.add(this.voidGroup);
        this.scene.add(this.filamentGroup);
        this.scene.add(this.nodeGroup);
        this.scene.add(this.galaxyGroup);
        
        // Create background void shader
        this.createVoidBackground();
    }
    
    /**
     * Create void background with gradient shader
     */
    createVoidBackground() {
        const geometry = new THREE.SphereGeometry(1e27, 32, 32);
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                innerColor: { value: new THREE.Color(0x0a0a0f) },
                outerColor: { value: new THREE.Color(0x1a1a2e) }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vPosition;
                
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 innerColor;
                uniform vec3 outerColor;
                
                varying vec3 vNormal;
                varying vec3 vPosition;
                
                void main() {
                    float intensity = pow(0.7 - dot(vNormal, vec3(0, 0, 1)), 2.0);
                    vec3 color = mix(innerColor, outerColor, intensity);
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide,
            depthWrite: false
        });
        
        const background = new THREE.Mesh(geometry, material);
        this.voidGroup.add(background);
        this.backgroundMesh = background;
    }
    
    /**
     * Load and render galaxy data
     * @param {Object} data - Galaxy data with positions and hierarchy
     */
    loadGalaxyData(data) {
        const { galaxies, hierarchy } = data;
        
        console.log(`Loading ${galaxies.length} galaxies...`);
        console.log(`Voids: ${hierarchy.voids.length}, Filaments: ${hierarchy.filaments.length}, Nodes: ${hierarchy.nodes.length}`);
        
        // Store visible galaxies based on current scale
        this.allGalaxies = galaxies;
        this.hierarchy = hierarchy;
        
        // Render each structure type
        this.renderVoids(hierarchy.voids);
        this.renderFilaments(hierarchy.filaments);
        this.renderNodes(hierarchy.nodes);
        this.renderGalaxies(galaxies);
        
        // Update visibility based on current scale
        this.updateLOD();
    }
    
    /**
     * Render void regions (low-density areas)
     */
    renderVoids(voids) {
        // Voids are represented as subtle volume fog
        // In production, use proper Voronoi cells
        
        if (voids.length === 0) return;
        
        // Create sparse particles to hint at void boundaries
        const voidPositions = [];
        const voidColors = [];
        
        const color = new THREE.Color(this.options.voidColor);
        
        voids.forEach((void_region, idx) => {
            // Sample points around void center
            for (let i = 0; i < 3; i++) {
                const angle = (idx / voids.length) * Math.PI * 2 + (i / 3) * Math.PI * 2;
                const radius = 2e23 * (0.5 + Math.random());
                
                voidPositions.push(
                    void_region.x + radius * Math.cos(angle),
                    void_region.y + radius * Math.sin(angle) * 0.3,
                    void_region.z + radius * Math.sin(angle)
                );
                
                voidColors.push(color.r, color.g, color.b);
            }
        });
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(voidPositions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(voidColors, 3));
        
        const material = new THREE.PointsMaterial({
            size: 5e21,
            vertexColors: true,
            transparent: true,
            opacity: 0.1,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        const points = new THREE.Points(geometry, material);
        this.voidGroup.add(points);
    }
    
    /**
     * Render filament structures (galaxy bridges)
     */
    renderFilaments(filaments) {
        if (filaments.length < 2) return;
        
        // Connect nearby filament galaxies with lines
        const linePositions = [];
        const lineColors = [];
        
        const filamentColor = new THREE.Color(this.options.filamentColor);
        
        // Simple connection algorithm (in production, use minimum spanning tree)
        for (let i = 0; i < filaments.length; i++) {
            const galaxy = filaments[i];
            
            // Find 2-3 nearest neighbors
            const distances = [];
            for (let j = 0; j < filaments.length; j++) {
                if (i === j) continue;
                
                const other = filaments[j];
                const dx = galaxy.x - other.x;
                const dy = galaxy.y - other.y;
                const dz = galaxy.z - other.z;
                const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                
                distances.push({ idx: j, dist });
            }
            
            distances.sort((a, b) => a.dist - b.dist);
            
            // Connect to 2 nearest neighbors
            for (let k = 0; k < Math.min(2, distances.length); k++) {
                const neighbor = filaments[distances[k].idx];
                
                linePositions.push(galaxy.x, galaxy.y, galaxy.z);
                linePositions.push(neighbor.x, neighbor.y, neighbor.z);
                
                lineColors.push(filamentColor.r, filamentColor.g, filamentColor.b);
                lineColors.push(filamentColor.r, filamentColor.g, filamentColor.b);
            }
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
        
        const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: this.options.filamentOpacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        const lines = new THREE.LineSegments(geometry, material);
        this.filamentGroup.add(lines);
        this.filamentLines = lines;
    }
    
    /**
     * Render node structures (superclusters)
     */
    renderNodes(nodes) {
        if (nodes.length === 0) return;
        
        const nodePositions = [];
        const nodeSizes = [];
        const nodeColors = [];
        
        const baseColor = new THREE.Color(this.options.nodeColor);
        
        nodes.forEach(node => {
            nodePositions.push(node.x, node.y, node.z);
            
            // Size based on local density
            const size = Math.min(5, 1 + node.density * 1e69);
            nodeSizes.push(size);
            
            // Color variation based on redshift (distance)
            const redshiftFactor = Math.min(1, node.redshift / 0.3);
            const color = baseColor.clone().lerp(new THREE.Color(0xffaa00), redshiftFactor);
            nodeColors.push(color.r, color.g, color.b);
        });
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(nodePositions, 3));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(nodeSizes, 1));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(nodeColors, 3));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                pixelRatio: { value: window.devicePixelRatio }
            },
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                
                uniform float time;
                uniform float pixelRatio;
                
                varying vec3 vColor;
                varying float vAlpha;
                
                void main() {
                    vColor = color;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    
                    // Size attenuation with distance
                    float distFactor = 1.0 / length(mvPosition.xyz);
                    gl_PointSize = size * pixelRatio * distFactor * 100.0;
                    
                    // Pulsing animation
                    vAlpha = 0.6 + 0.4 * sin(time * 2.0 + position.x * 0.0001);
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vAlpha;
                
                void main() {
                    // Circular point sprite
                    vec2 coord = gl_PointCoord - vec2(0.5);
                    float dist = length(coord);
                    
                    if (dist > 0.5) discard;
                    
                    // Soft edge glow
                    float alpha = vAlpha * (1.0 - dist * 2.0);
                    
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        const points = new THREE.Points(geometry, material);
        this.nodeGroup.add(points);
        this.nodePoints = points;
    }
    
    /**
     * Render individual galaxies as points
     */
    renderGalaxies(galaxies) {
        if (galaxies.length === 0) return;
        
        const positions = [];
        const colors = [];
        const sizes = [];
        
        // Limit to maxPoints for performance
        const sampleCount = Math.min(galaxies.length, this.options.maxPoints);
        const step = galaxies.length / sampleCount;
        
        for (let i = 0; i < galaxies.length; i += step) {
            const galaxy = galaxies[Math.floor(i)];
            
            positions.push(galaxy.x, galaxy.y, galaxy.z);
            
            // Color based on magnitude (brightness)
            const magFactor = Math.min(1, (galaxy.psfMag_r - 15) / 6);
            const color = new THREE.Color();
            color.setHSL(0.6 - magFactor * 0.3, 0.8, 0.5 + magFactor * 0.3);
            colors.push(color.r, color.g, color.b);
            
            // Size based on apparent magnitude
            const size = Math.max(0.5, 3 - magFactor * 2);
            sizes.push(size);
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                pixelRatio: { value: window.devicePixelRatio }
            },
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                
                uniform float time;
                uniform float pixelRatio;
                
                varying vec3 vColor;
                
                void main() {
                    vColor = color;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    
                    // Size based on distance and intrinsic size
                    float distFactor = 1.0 / length(mvPosition.xyz);
                    gl_PointSize = size * pixelRatio * distFactor * 50.0;
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                
                void main() {
                    // Circular sprite with soft edge
                    vec2 coord = gl_PointCoord - vec2(0.5);
                    float dist = length(coord);
                    
                    if (dist > 0.5) discard;
                    
                    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
                    
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        const points = new THREE.Points(geometry, material);
        this.galaxyGroup.add(points);
        this.galaxyPoints = points;
    }
    
    /**
     * Update Level of Detail based on camera distance
     */
    updateLOD() {
        // Determine which galaxies to show based on scale
        const scaleExponent = Math.pow(10, 26 - this.currentScaleExponent);
        
        let lod = 0;
        if (scaleExponent > this.lodDistances[0]) lod = 0;
        else if (scaleExponent > this.lodDistances[1]) lod = 1;
        else if (scaleExponent > this.lodDistances[2]) lod = 2;
        else lod = 3;
        
        if (lod !== this.currentLOD) {
            this.currentLOD = lod;
            console.log(`LOD changed to ${lod}`);
            
            // Adjust point visibility/quality based on LOD
            if (this.galaxyPoints) {
                this.galaxyPoints.material.size = this.options.pointSize * (4 - lod);
            }
        }
    }
    
    /**
     * Set current scale exponent for LOD calculation
     */
    setScaleExponent(exponent) {
        this.currentScaleExponent = exponent;
        this.updateLOD();
    }
    
    /**
     * Update animation
     */
    update(deltaTime) {
        this.time += deltaTime;
        
        // Update shader uniforms
        if (this.backgroundMesh) {
            this.backgroundMesh.material.uniforms.time.value = this.time;
        }
        
        if (this.nodePoints) {
            this.nodePoints.material.uniforms.time.value = this.time;
        }
        
        if (this.galaxyPoints) {
            this.galaxyPoints.material.uniforms.time.value = this.time;
        }
        
        // Slow rotation of entire structure
        this.galaxyGroup.rotation.y += deltaTime * 0.0001;
        this.filamentGroup.rotation.y += deltaTime * 0.0001;
    }
    
    /**
     * Cleanup resources
     */
    dispose() {
        this.scene.remove(this.voidGroup);
        this.scene.remove(this.filamentGroup);
        this.scene.remove(this.nodeGroup);
        this.scene.remove(this.galaxyGroup);
        
        // Dispose geometries and materials
        this.voidGroup.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
        
        this.filamentGroup.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
        
        this.nodeGroup.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
        
        this.galaxyGroup.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
    }
}

export default CosmicWebRenderer;
