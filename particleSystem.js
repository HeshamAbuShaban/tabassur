/**
 * TABASSUR - Cosmic Web Particle System
 * Procedural generation of galaxy filaments using Simplex Noise
 */

import { BufferGeometry, Float32BufferAttribute } from 'three';

// Color palette for cosmic web
const COLORS = {
    deepPurple: new Float32Array([0.45, 0.25, 0.65]),
    bioluminescentBlue: new Float32Array([0.2, 0.6, 0.85]),
    gold: new Float32Array([1.0, 0.85, 0.3]),
    deepBlue: new Float32Array([0.1, 0.3, 0.7]),
    cyan: new Float32Array([0.3, 0.7, 0.8]),
};

/**
 * Simplex Noise implementation for procedural filament generation
 */
class SimplexNoise {
    constructor(seed = Math.random()) {
        this.p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) {
            this.p[i] = i;
        }
        
        // Shuffle based on seed
        let n, q;
        for (let i = 255; i > 0; i--) {
            seed = (seed * 9301 + 49297) % 233280;
            const r = seed / 233280;
            n = Math.floor(r * (i + 1));
            q = this.p[i];
            this.p[i] = this.p[n];
            this.p[n] = q;
        }
        
        this.perm = new Uint8Array(512);
        this.permMod12 = new Uint8Array(512);
        for (let i = 0; i < 512; i++) {
            this.perm[i] = this.p[i & 255];
            this.permMod12[i] = this.perm[i] % 12;
        }
    }
    
    noise3D(x, y, z) {
        const F3 = 1.0 / 3.0;
        const G3 = 1.0 / 6.0;
        
        const s = (x + y + z) * F3;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const k = Math.floor(z + s);
        
        const t = (i + j + k) * G3;
        const X0 = i - t;
        const Y0 = j - t;
        const Z0 = k - t;
        
        const x0 = x - X0;
        const y0 = y - Y0;
        const z0 = z - Z0;
        
        let i1, j1, k1, i2, j2, k2;
        
        if (x0 >= y0) {
            if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
            else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
            else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
        } else {
            if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
            else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
            else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        }
        
        const x1 = x0 - i1 + G3;
        const y1 = y0 - j1 + G3;
        const z1 = z0 - k1 + G3;
        const x2 = x0 - i2 + 2.0 * G3;
        const y2 = y0 - j2 + 2.0 * G3;
        const z2 = z0 - k2 + 2.0 * G3;
        const x3 = x0 - 1.0 + 3.0 * G3;
        const y3 = y0 - 1.0 + 3.0 * G3;
        const z3 = z0 - 1.0 + 3.0 * G3;
        
        const ii = i & 255;
        const jj = j & 255;
        const kk = k & 255;
        
        const gi0 = this.permMod12[ii + this.perm[jj + this.perm[kk]]];
        const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1 + this.perm[kk + k1]]];
        const gi2 = this.permMod12[ii + i2 + this.perm[jj + j2 + this.perm[kk + k2]]];
        const gi3 = this.permMod12[ii + 1 + this.perm[jj + 1 + this.perm[kk + 1]]];
        
        let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
        
        let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
        if (t0 >= 0) {
            t0 *= t0;
            n0 = t0 * t0 * this.dot(this.grad3[gi0], x0, y0, z0);
        }
        
        let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
        if (t1 >= 0) {
            t1 *= t1;
            n1 = t1 * t1 * this.dot(this.grad3[gi1], x1, y1, z1);
        }
        
        let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
        if (t2 >= 0) {
            t2 *= t2;
            n2 = t2 * t2 * this.dot(this.grad3[gi2], x2, y2, z2);
        }
        
        let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
        if (t3 >= 0) {
            t3 *= t3;
            n3 = t3 * t3 * this.dot(this.grad3[gi3], x3, y3, z3);
        }
        
        return 32.0 * (n0 + n1 + n2 + n3);
    }
    
    dot(g, x, y, z) {
        return g[0] * x + g[1] * y + g[2] * z;
    }
}

SimplexNoise.prototype.grad3 = [
    [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
    [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
];

/**
 * Generate cosmic web particle system
 * @param {number} particleCount - Number of particles (default: 150000)
 * @returns {Object} Geometry with position, color, size, and density attributes
 */
export function createCosmicWeb(particleCount = 150000) {
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const densities = new Float32Array(particleCount);
    
    const noise = new SimplexNoise(42);
    
    // Parameters for cosmic web structure
    const scale = 800;
    const filamentThickness = 0.3;
    const clusterDensity = 0.15;
    
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        
        // Generate particle position using layered noise for filament structure
        let x, y, z, density;
        let attempts = 0;
        const maxAttempts = 10;
        
        do {
            // Random position in spherical distribution
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const radius = Math.pow(Math.random(), 0.5) * scale;
            
            x = radius * Math.sin(phi) * Math.cos(theta);
            y = radius * Math.sin(phi) * Math.sin(theta);
            z = radius * Math.cos(phi);
            
            // Calculate noise value at this position
            const noiseScale = 0.003;
            const n1 = noise.noise3D(x * noiseScale, y * noiseScale, z * noiseScale);
            const n2 = noise.noise3D(x * noiseScale * 2, y * noiseScale * 2, z * noiseScale * 2) * 0.5;
            const n3 = noise.noise3D(x * noiseScale * 4, y * noiseScale * 4, z * noiseScale * 4) * 0.25;
            
            const combinedNoise = (n1 + n2 + n3) / 1.75;
            
            // Particles form along high-density filament regions
            density = Math.pow(Math.max(0, combinedNoise), 2);
            
            attempts++;
        } while (density < filamentThickness && attempts < maxAttempts);
        
        positions[i3] = x;
        positions[i3 + 1] = y;
        positions[i3 + 2] = z;
        
        densities[i] = Math.min(1.0, density * 2);
        
        // Assign colors based on density and position
        const colorChoice = Math.random();
        let r, g, b;
        
        if (density > 0.7) {
            // High density areas: Gold/Purple cores
            const t = (density - 0.7) / 0.3;
            r = COLORS.gold[0] * t + COLORS.deepPurple[0] * (1 - t);
            g = COLORS.gold[1] * t + COLORS.deepPurple[1] * (1 - t);
            b = COLORS.gold[2] * t + COLORS.deepPurple[2] * (1 - t);
        } else if (density > 0.4) {
            // Medium density: Bioluminescent blue/purple filaments
            const t = (density - 0.4) / 0.3;
            r = COLORS.bioluminescentBlue[0] * t + COLORS.deepPurple[0] * (1 - t);
            g = COLORS.bioluminescentBlue[1] * t + COLORS.deepPurple[1] * (1 - t);
            b = COLORS.bioluminescentBlue[2] * t + COLORS.deepPurple[2] * (1 - t);
        } else {
            // Low density: Deep blue/cyan threads
            const t = density / 0.4;
            r = COLORS.deepBlue[0] * t + COLORS.cyan[0] * (1 - t);
            g = COLORS.deepBlue[1] * t + COLORS.cyan[1] * (1 - t);
            b = COLORS.deepBlue[2] * t + COLORS.cyan[2] * (1 - t);
        }
        
        // Add variation
        const variation = 0.2;
        r = Math.max(0, Math.min(1, r + (Math.random() - 0.5) * variation));
        g = Math.max(0, Math.min(1, g + (Math.random() - 0.5) * variation));
        b = Math.max(0, Math.min(1, b + (Math.random() - 0.5) * variation));
        
        colors[i3] = r;
        colors[i3 + 1] = g;
        colors[i3 + 2] = b;
        
        // Size based on density
        sizes[i] = 1.5 + density * 3.0;
    }
    
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aPosition', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('aDensity', new Float32BufferAttribute(densities, 1));
    
    return geometry;
}

/**
 * Create galaxy core clusters (bright central nodes)
 * @param {number} clusterCount - Number of galaxy clusters
 * @returns {Object} Geometry for galaxy cores
 */
export function createGalaxyCores(clusterCount = 50) {
    const positions = new Float32Array(clusterCount * 3);
    const colors = new Float32Array(clusterCount * 3);
    const sizes = new Float32Array(clusterCount);
    
    const noise = new SimplexNoise(123);
    const scale = 600;
    
    for (let i = 0; i < clusterCount; i++) {
        const i3 = i * 3;
        
        // Place clusters at high-density noise points
        let x, y, z, density;
        let bestDensity = 0;
        let bestPos = [0, 0, 0];
        
        for (let j = 0; j < 20; j++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const radius = Math.pow(Math.random(), 0.7) * scale;
            
            const px = radius * Math.sin(phi) * Math.cos(theta);
            const py = radius * Math.sin(phi) * Math.sin(theta);
            const pz = radius * Math.cos(phi);
            
            const n1 = noise.noise3D(px * 0.003, py * 0.003, pz * 0.003);
            const n2 = noise.noise3D(px * 0.006, py * 0.006, pz * 0.006) * 0.5;
            const d = Math.pow(Math.max(0, (n1 + n2) / 1.5), 2);
            
            if (d > bestDensity) {
                bestDensity = d;
                bestPos = [px, py, pz];
            }
        }
        
        positions[i3] = bestPos[0];
        positions[i3 + 1] = bestPos[1];
        positions[i3 + 2] = bestPos[2];
        
        // Warm gold/white colors for cores
        const warmGold = [1.0, 0.9, 0.6];
        const white = [1.0, 1.0, 0.95];
        const t = Math.random();
        colors[i3] = warmGold[0] * t + white[0] * (1 - t);
        colors[i3 + 1] = warmGold[1] * t + white[1] * (1 - t);
        colors[i3 + 2] = warmGold[2] * t + white[2] * (1 - t);
        
        sizes[i] = 8 + Math.random() * 12;
    }
    
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aPosition', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
    
    return geometry;
}
