/**
 * TABASSUR - Cosmic Web Shader System
 * High-performance GLSL shaders for procedural galaxy filament generation
 */

// Vertex Shader - Handles particle positioning and animation
export const vertexShader = `
    uniform float uTime;
    uniform float uZoom;
    
    attribute vec3 aPosition;
    attribute float aSize;
    attribute vec3 aColor;
    attribute float aDensity;
    
    varying vec3 vColor;
    varying float vDensity;
    varying float vDistance;
    
    // Simplex Noise functions for procedural filament generation
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    
    float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );
        
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        
        i = mod289(i);
        vec4 p = permute( permute( permute( 
                    i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
                
        float n_ = 0.142857142857;
        vec3  ns = n_ * D.wyz - D.xzx;
        
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );
        
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        
        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );
        
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
        
        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);
        
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;
        
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                      dot(p2,x2), dot(p3,x3) ) );
    }
    
    void main() {
        vColor = aColor;
        vDensity = aDensity;
        
        // Apply noise-based displacement for filament structure
        float noiseScale = 0.002;
        float timeOffset = uTime * 0.05;
        
        vec3 pos = aPosition;
        
        // Create filament threads using layered noise
        float noise1 = snoise(pos * noiseScale + timeOffset);
        float noise2 = snoise(pos * noiseScale * 2.0 - timeOffset * 0.5);
        float noise3 = snoise(pos * noiseScale * 4.0 + timeOffset * 0.3);
        
        // Combine noise layers for cosmic web structure
        float filamentNoise = noise1 * 0.6 + noise2 * 0.3 + noise3 * 0.1;
        
        // Displace particles along noise gradients to form filaments
        float displacement = filamentNoise * 15.0 * aDensity;
        pos += normalize(pos) * displacement;
        
        // Add subtle orbital motion around filament centers
        float orbitSpeed = 0.02 * (1.0 - aDensity);
        float angle = uTime * orbitSpeed + length(pos) * 0.01;
        float cosA = cos(angle);
        float sinA = sin(angle);
        
        // Rotate around Y axis subtly
        vec3 rotatedPos = pos;
        rotatedPos.x = pos.x * cosA - pos.z * sinA;
        rotatedPos.z = pos.x * sinA + pos.z * cosA;
        pos = rotatedPos;
        
        // Calculate distance from camera for depth effects
        vDistance = length(pos);
        
        // Size attenuation based on zoom level
        float sizeAttenuation = 1.0 + uZoom * 0.5;
        float finalSize = aSize * sizeAttenuation * (1.0 + filamentNoise * 0.3);
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        
        // Size based on depth for perspective
        gl_PointSize = finalSize * (300.0 / -mvPosition.z);
        gl_PointSize = clamp(gl_PointSize, 1.0, 15.0);
    }
`;

// Fragment Shader - Handles particle rendering and glow effects
export const fragmentShader = `
    uniform float uTime;
    uniform vec3 uBaseColor;
    
    varying vec3 vColor;
    varying float vDensity;
    varying float vDistance;
    
    void main() {
        // Calculate distance from center of point for circular particles with soft edges
        vec2 centerCoord = gl_PointCoord - vec2(0.5);
        float distFromCenter = length(centerCoord);
        
        // Soft edge falloff for glowing effect
        float alpha = 1.0 - smoothstep(0.3, 0.5, distFromCenter);
        
        // Add pulsing glow effect
        float pulse = sin(uTime * 2.0 + vDistance * 0.01) * 0.2 + 0.8;
        
        // Density-based brightness (denser areas = brighter)
        float densityGlow = vDensity * 0.5 + 0.5;
        
        // Color mixing with base color
        vec3 finalColor = mix(vColor, uBaseColor, 0.3);
        
        // Apply density and pulse to brightness
        finalColor *= densityGlow * pulse;
        
        // Distance fog fade
        float fogFactor = smoothstep(800.0, 100.0, vDistance);
        alpha *= fogFactor;
        
        // Discard fragments that are too transparent
        if (alpha < 0.01) discard;
        
        gl_FragColor = vec4(finalColor, alpha);
    }
`;

// Galaxy Core Shader - For bright central nodes
export const galaxyCoreVertexShader = `
    uniform float uTime;
    
    attribute vec3 aPosition;
    attribute float aSize;
    attribute vec3 aColor;
    
    varying vec3 vColor;
    varying float vAlpha;
    
    void main() {
        vColor = aColor;
        
        vec3 pos = aPosition;
        
        // Subtle rotation animation
        float angle = uTime * 0.1;
        float cosA = cos(angle);
        float sinA = sin(angle);
        
        vec3 rotatedPos = pos;
        rotatedPos.x = pos.x * cosA - pos.z * sinA;
        rotatedPos.z = pos.x * sinA + pos.z * cosA;
        
        // Pulsing expansion
        float pulse = sin(uTime * 1.5) * 0.1 + 1.0;
        rotatedPos *= pulse;
        
        vAlpha = 0.6 + sin(uTime * 2.0 + length(pos) * 0.1) * 0.2;
        
        vec4 mvPosition = modelViewMatrix * vec4(rotatedPos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = aSize * (400.0 / -mvPosition.z);
        gl_PointSize = clamp(gl_PointSize, 3.0, 25.0);
    }
`;

export const galaxyCoreFragmentShader = `
    varying vec3 vColor;
    varying float vAlpha;
    
    void main() {
        vec2 centerCoord = gl_PointCoord - vec2(0.5);
        float distFromCenter = length(centerCoord);
        
        // Radial gradient for core glow
        float gradient = 1.0 - smoothstep(0.0, 0.5, distFromCenter);
        gradient *= 1.0 - smoothstep(0.3, 0.5, distFromCenter);
        
        vec3 finalColor = vColor * gradient * 1.5;
        float finalAlpha = vAlpha * gradient;
        
        if (finalAlpha < 0.01) discard;
        
        gl_FragColor = vec4(finalColor, finalAlpha);
    }
`;
