// ==UserScript==
// @name         GeoFS-MXWL-VHS
// @namespace    https://github.com/mxwl-mesh-glb
// @version      0.1.1
// @description  VHS shader for GeoFS
// @author       mxwl-mesh (MaxwellTheCat, mxwl-mesh-glb(or mxwl-mesh.glb)
// @license      AGPL-3.0-or-later
// @match        https://www.geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const CFG = {
    bloom_intensity: 40,
    bloom_threshold: 0.0,
    bloom_spread:    0.006,
    chroma_intensity: 50,
    ldr_crush: 25,
    chroma_noise: 10,
    h_soft: 7,
    edge_ring: 25,
    tracking: 10,
    head_switch: 40,
    h_jitter: 50,
    luma_grain: 20,
    h_smear: 20,
    comet: 40,
  };

  let _time = 0;
  function tickTime() { _time += 0.016; requestAnimationFrame(tickTime); }
  requestAnimationFrame(tickTime);

  buildHUD();

  const pollId = setInterval(() => {
    const scene = getScene();
    if (!scene) return;
    clearInterval(pollId);
    injectShaders(scene);
  }, 500);

  function getScene() {
    try {
      const v = window.geofs && window.geofs.api && window.geofs.api.viewer;
      if (!v) return null;
      const scene = v.scene || v._scene || (v.cesiumWidget && v.cesiumWidget.scene);
      if (!scene || !scene.postProcessStages) return null;
      return scene;
    } catch (e) { return null; }
  }

  function injectShaders(scene) {
    if (scene._vhsAdded) return;
    scene._vhsAdded = true;

    try {

      const bloomStage = new Cesium.PostProcessStage({
        name: 'vhs_halation',
        fragmentShader: `
          uniform sampler2D colorTexture;
          uniform float bloom_intensity;
          uniform float bloom_threshold;
          uniform float bloom_spread;
          varying vec2 v_textureCoordinates;
          vec3 brightPass(vec2 uv) {
            vec3 col = texture2D(colorTexture, uv).rgb;
            float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
            float knee = smoothstep(bloom_threshold, bloom_threshold + 0.15, lum);
            return col * knee;
          }
          vec3 halationGlow(vec2 uv, float r) {
            vec3 s = vec3(0.0);
            float w0 = 0.1964; float w1 = 0.1747; float w2 = 0.1210;
            float w3 = 0.0648; float w4 = 0.0270; float w5 = 0.0088; float w6 = 0.0022;
            s += brightPass(uv) * w0 * 2.0;
            s += brightPass(uv + vec2( r * 1.0, 0.0)) * w1;
            s += brightPass(uv - vec2( r * 1.0, 0.0)) * w1;
            s += brightPass(uv + vec2(0.0,  r * 1.0)) * w1;
            s += brightPass(uv - vec2(0.0,  r * 1.0)) * w1;
            s += brightPass(uv + vec2( r * 2.0, 0.0)) * w2;
            s += brightPass(uv - vec2( r * 2.0, 0.0)) * w2;
            s += brightPass(uv + vec2(0.0,  r * 2.0)) * w2;
            s += brightPass(uv - vec2(0.0,  r * 2.0)) * w2;
            s += brightPass(uv + vec2( r * 3.0, 0.0)) * w3;
            s += brightPass(uv - vec2( r * 3.0, 0.0)) * w3;
            s += brightPass(uv + vec2(0.0,  r * 3.0)) * w3;
            s += brightPass(uv - vec2(0.0,  r * 3.0)) * w3;
            s += brightPass(uv + vec2( r * 4.0, 0.0)) * w4;
            s += brightPass(uv - vec2( r * 4.0, 0.0)) * w4;
            s += brightPass(uv + vec2(0.0,  r * 4.0)) * w4;
            s += brightPass(uv - vec2(0.0,  r * 4.0)) * w4;
            s += brightPass(uv + vec2( r * 5.0, 0.0)) * w5;
            s += brightPass(uv - vec2( r * 5.0, 0.0)) * w5;
            s += brightPass(uv + vec2(0.0,  r * 5.0)) * w5;
            s += brightPass(uv - vec2(0.0,  r * 5.0)) * w5;
            s += brightPass(uv + vec2( r * 6.0, 0.0)) * w6;
            s += brightPass(uv - vec2( r * 6.0, 0.0)) * w6;
            s += brightPass(uv + vec2(0.0,  r * 6.0)) * w6;
            s += brightPass(uv - vec2(0.0,  r * 6.0)) * w6;
            return s * 0.5;
          }
          void main() {
            vec2 uv = v_textureCoordinates;
            vec4 original = texture2D(colorTexture, uv);
            float r = bloom_spread * (bloom_intensity / 100.0) * 2.5;
            vec3 glow = halationGlow(uv, r);
            vec3 result = original.rgb + glow * (bloom_intensity / 100.0) * 1.4;
            gl_FragColor = vec4(clamp(result, 0.0, 1.0), original.a);
          }
        `,
        uniforms: {
          bloom_intensity: () => CFG.bloom_intensity,
          bloom_threshold: () => CFG.bloom_threshold,
          bloom_spread:    () => CFG.bloom_spread,
        },
      });

      const chromaStage = new Cesium.PostProcessStage({
        name: 'vhs_chroma_smear',
        fragmentShader: `
          uniform sampler2D colorTexture;
          uniform float chroma_intensity;
          varying vec2 v_textureCoordinates;
          vec3 rgbToYCbCr(vec3 rgb) {
            float y  =  0.299  * rgb.r + 0.587  * rgb.g + 0.114  * rgb.b;
            float cb = -0.1687 * rgb.r - 0.3313 * rgb.g + 0.5    * rgb.b + 0.5;
            float cr =  0.5    * rgb.r - 0.4187 * rgb.g - 0.0813 * rgb.b + 0.5;
            return vec3(y, cb, cr);
          }
          vec3 yCbCrToRgb(vec3 ycbcr) {
            float y  = ycbcr.x;
            float cb = ycbcr.y - 0.5;
            float cr = ycbcr.z - 0.5;
            float r = y                + 1.4020 * cr;
            float g = y - 0.3441 * cb - 0.7141 * cr;
            float b = y + 1.7720 * cb;
            return clamp(vec3(r, g, b), 0.0, 1.0);
          }
          void main() {
            vec2 uv = v_textureCoordinates;
            vec3 centerYCbCr = rgbToYCbCr(texture2D(colorTexture, uv).rgb);
            float luma = centerYCbCr.x;
            float maxOffset = 0.018 * (chroma_intensity / 100.0);
            float cb = 0.0; float cr = 0.0; float totalW = 0.0;
            float offsets[7];
            offsets[0] = -1.0; offsets[1] = 0.0; offsets[2] = 1.0; offsets[3] = 2.0;
            offsets[4] = 3.0; offsets[5] = 4.0; offsets[6] = 5.0;
            float weights[7];
            weights[0] = 0.05; weights[1] = 0.20; weights[2] = 0.25; weights[3] = 0.22;
            weights[4] = 0.15; weights[5] = 0.08; weights[6] = 0.05;
            for (int i = 0; i < 7; i++) {
              vec2 sampleUV = uv + vec2(offsets[i] * maxOffset, 0.0);
              vec3 s = rgbToYCbCr(texture2D(colorTexture, sampleUV).rgb);
              cb += s.y * weights[i];
              cr += s.z * weights[i];
              totalW += weights[i];
            }
            cb /= totalW; cr /= totalW;
            vec3 result = yCbCrToRgb(vec3(luma, cb, cr));
            gl_FragColor = vec4(result, 1.0);
          }
        `,
        uniforms: { chroma_intensity: () => CFG.chroma_intensity },
      });

      const ldrStage = new Cesium.PostProcessStage({
        name: 'vhs_ldr_crush',
        fragmentShader: `
          uniform sampler2D colorTexture;
          uniform float ldr_crush;
          varying vec2 v_textureCoordinates;
          void main() {
            vec4 original = texture2D(colorTexture, v_textureCoordinates);
            vec3 col = original.rgb;
            float t = ldr_crush / 100.0;
            float black_lift = mix(0.01, 0.12, t);
            float white_clip = mix(0.99, 0.78, t);
            vec3 remapped = col / white_clip;
            remapped = clamp(remapped, 0.0, 1.0);
            remapped = remapped * (1.0 - black_lift) + black_lift;
            gl_FragColor = vec4(remapped, original.a);
          }
        `,
        uniforms: { ldr_crush: () => CFG.ldr_crush },
      });

      const chromaNoiseStage = new Cesium.PostProcessStage({
        name: 'vhs_chroma_noise',
        fragmentShader: `
          uniform sampler2D colorTexture;
          uniform float chroma_noise;
          uniform float vhs_time;
          varying vec2 v_textureCoordinates;
          float hash(vec2 p) {
            p = fract(p * vec2(234.567, 789.012));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
          }
          float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            float a = hash(i); float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0)); float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
          }
          float luma(vec3 col) { return dot(col, vec3(0.299, 0.587, 0.114)); }
          void main() {
            vec2 uv = v_textureCoordinates;
            vec4 original = texture2D(colorTexture, uv);
            float lum = luma(original.rgb);
            vec2 noiseUV = uv * 3.5 + vec2(vhs_time * 0.07, vhs_time * 0.05);
            float n1 = noise(noiseUV);
            float n2 = noise(noiseUV * 2.1 + vec2(5.3, 1.7));
            float n  = n1 * 0.65 + n2 * 0.35;
            float cbShift = (n - 0.5) * 2.0;
            float crShift = (noise(noiseUV + vec2(3.1, 2.4)) - 0.5) * 2.0;
            float darkMask = 1.0 - smoothstep(0.0, 0.55, lum);
            float near = abs(luma(texture2D(colorTexture, uv + vec2(0.004, 0.0)).rgb) - lum)
                       + abs(luma(texture2D(colorTexture, uv - vec2(0.004, 0.0)).rgb) - lum)
                       + abs(luma(texture2D(colorTexture, uv + vec2(0.0, 0.004)).rgb) - lum)
                       + abs(luma(texture2D(colorTexture, uv - vec2(0.0, 0.004)).rgb) - lum);
            float flatMask = 1.0 - smoothstep(0.0, 0.08, near);
            float mask = max(darkMask, flatMask * 0.6);
            float strength = (chroma_noise / 100.0) * 0.18 * mask;
            vec3 col = original.rgb;
            col.r += crShift * strength * 0.8  - cbShift * strength * 0.3;
            col.g -= crShift * strength * 0.5  + cbShift * strength * 0.1;
            col.b += cbShift * strength * 0.9  + crShift * strength * 0.1;
            gl_FragColor = vec4(clamp(col, 0.0, 1.0), original.a);
          }
        `,
        uniforms: { chroma_noise: () => CFG.chroma_noise, vhs_time: () => _time },
      });

      const hSoftStage = new Cesium.PostProcessStage({
        name: 'vhs_h_soft',
        fragmentShader: `
          uniform sampler2D colorTexture;
          uniform float h_soft;
          varying vec2 v_textureCoordinates;
          void main() {
            vec2 uv = v_textureCoordinates;
            float px = mix(0.0, 0.007, h_soft / 100.0);
            float w0 = 0.2270; float w1 = 0.1945; float w2 = 0.1216;
            float w3 = 0.0540; float w4 = 0.0162;
            vec4 col = texture2D(colorTexture, uv) * w0;
            col += texture2D(colorTexture, uv + vec2( px * 1.0, 0.0)) * w1;
            col += texture2D(colorTexture, uv - vec2( px * 1.0, 0.0)) * w1;
            col += texture2D(colorTexture, uv + vec2( px * 2.0, 0.0)) * w2;
            col += texture2D(colorTexture, uv - vec2( px * 2.0, 0.0)) * w2;
            col += texture2D(colorTexture, uv + vec2( px * 3.0, 0.0)) * w3;
            col += texture2D(colorTexture, uv - vec2( px * 3.0, 0.0)) * w3;
            col += texture2D(colorTexture, uv + vec2( px * 4.0, 0.0)) * w4;
            col += texture2D(colorTexture, uv - vec2( px * 4.0, 0.0)) * w4;
            gl_FragColor = vec4(col.rgb, texture2D(colorTexture, uv).a);
          }
        `,
        uniforms: { h_soft: () => CFG.h_soft },
      });

      const edgeRingStage = new Cesium.PostProcessStage({
        name: 'vhs_edge_ring',
        fragmentShader: `
          uniform sampler2D colorTexture;
          uniform float edge_ring;
          varying vec2 v_textureCoordinates;
          float luma(vec3 col) { return dot(col, vec3(0.299, 0.587, 0.114)); }
          void main() {
            vec2 uv = v_textureCoordinates;
            vec4 original = texture2D(colorTexture, uv);
            float offset = 0.0012 * (edge_ring / 100.0);
            vec4 ghostR = texture2D(colorTexture, uv + vec2( offset, 0.0));
            vec4 ghostL = texture2D(colorTexture, uv - vec2( offset, 0.0));
            float lapR = luma(original.rgb) - luma(ghostR.rgb);
            float lapL = luma(original.rgb) - luma(ghostL.rgb);
            float ring = lapR + lapL;
            float str = (edge_ring / 100.0) * 0.3;
            vec3 result = original.rgb - vec3(ring) * str;
            gl_FragColor = vec4(clamp(result, 0.0, 1.0), original.a);
          }
        `,
        uniforms: { edge_ring: () => CFG.edge_ring },
      });

      const trackingStage = new Cesium.PostProcessStage({
        name: 'vhs_tracking',
        fragmentShader: `
          uniform sampler2D colorTexture;
          uniform float tracking;
          uniform float vhs_time;
          varying vec2 v_textureCoordinates;
          float hash(float n) { return fract(sin(n) * 43758.5453123); }
          float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main() {
            vec2 uv = v_textureCoordinates;
            float str = tracking / 100.0;
            float b1pos   = mod(0.08 + vhs_time * 0.011, 1.0);
            float b1width = mix(0.012, 0.045, hash(floor(vhs_time * 0.3)));
            float b1dist  = smoothstep(b1width, 0.0, abs(uv.y - b1pos));
            float b2time  = floor(vhs_time * 0.4);
            float b2pos   = mix(0.88, 0.95, hash(b2time));
            float b2width = mix(0.006, 0.025, hash(b2time + 1.0));
            float b2active = step(0.6, hash(b2time + 2.0));
            float b2dist  = smoothstep(b2width, 0.0, abs(uv.y - b2pos)) * b2active;
            float distortion = max(b1dist, b2dist);
            float jitterAmp = mix(0.0, 0.03, str) * distortion;
            float jitter    = (hash2(vec2(uv.y * 200.0, floor(vhs_time * 15.0))) - 0.5) * 2.0;
            vec2  jitteredUV = vec2(uv.x + jitter * jitterAmp, uv.y);
            vec4 col = texture2D(colorTexture, jitteredUV);
            float noiseVal = hash2(vec2(uv.x * 800.0 + vhs_time * 30.0, uv.y * 600.0 + vhs_time * 17.0));
            float snowAmt  = distortion * str * 0.85;
            vec3 result = mix(col.rgb, vec3(noiseVal), snowAmt);
            float edgeBright = smoothstep(0.0, 0.003, distortion) * smoothstep(0.006, 0.003, distortion) * str * 0.9;
            result += vec3(edgeBright);
            gl_FragColor = vec4(clamp(result, 0.0, 1.0), col.a);
          }
        `,
        uniforms: { tracking: () => CFG.tracking, vhs_time: () => _time },
      });

      const headSwitchStage = new Cesium.PostProcessStage({
        name: 'vhs_head_switch',
        fragmentShader: `
          uniform sampler2D colorTexture;
          uniform float head_switch;
          uniform float vhs_time;
          varying vec2 v_textureCoordinates;
          float hash(float n) { return fract(sin(n) * 43758.5453123); }
          float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main() {
            vec2 uv = v_textureCoordinates;
            float str = head_switch / 100.0;
            float bandHeight = mix(0.025, 0.048, str) * (1.0 + 0.15 * sin(vhs_time * 2.3));
            float bandStart  = 1.0 - bandHeight;
            float bandT = clamp((uv.y - bandStart) / bandHeight, 0.0, 1.0);
            if (uv.y < bandStart) { gl_FragColor = texture2D(colorTexture, uv); return; }
            float lineId   = floor(uv.y * 240.0);
            float timeSlot = floor(vhs_time * 20.0);
            float jitterAmp = mix(0.0, 0.07, str) * bandT;
            float jitter    = (hash2(vec2(lineId, timeSlot)) - 0.5) * 2.0;
            float xShift    = jitter * jitterAmp;
            vec2 shiftedUV = vec2(fract(uv.x + xShift), uv.y);
            float smearOffset = mix(0.0, 0.015, str) * bandT;
            vec2  smearUV     = vec2(fract(uv.x + xShift - smearOffset), uv.y);
            vec4 sharp = texture2D(colorTexture, shiftedUV);
            vec4 smear = texture2D(colorTexture, smearUV);
            vec4 col   = mix(sharp, smear, bandT * 0.55);
            float corruptT = bandT * str;
            float noiseC   = hash2(vec2(uv.x * 300.0 + vhs_time * 25.0, lineId));
            col.r *= mix(1.0, noiseC * 0.8 + 0.3, corruptT * 0.5);
            col.g *= mix(1.0, 1.1,                 corruptT * 0.3);
            col.b *= mix(1.0, noiseC * 0.6 + 0.6, corruptT * 0.4);
            float fadeIn = smoothstep(0.0, 0.25, bandT);
            vec4 original = texture2D(colorTexture, uv);
            vec4 result   = mix(original, col, fadeIn);
            gl_FragColor = vec4(clamp(result.rgb, 0.0, 1.0), original.a);
          }
        `,
        uniforms: { head_switch: () => CFG.head_switch, vhs_time: () => _time },
      });

      const hJitterStage = new Cesium.PostProcessStage({
        name: 'vhs_h_jitter',
        fragmentShader: `
          uniform sampler2D colorTexture;
          uniform float h_jitter;
          uniform float vhs_time;
          varying vec2 v_textureCoordinates;
          void main() {
            vec2 uv = v_textureCoordinates;
            float str = h_jitter / 100.0;
            float w1 = sin(uv.y * 4.1  + vhs_time * 0.7)  * 0.5;
            float w2 = sin(uv.y * 9.3  + vhs_time * 1.3)  * 0.25;
            float w3 = sin(uv.y * 17.7 + vhs_time * 0.4)  * 0.12;
            float wobble = (w1 + w2 + w3);
            float maxShift = mix(0.0, 0.006, str);
            float xShift   = wobble * maxShift;
            gl_FragColor = texture2D(colorTexture, vec2(uv.x + xShift, uv.y));
          }
        `,
        uniforms: { h_jitter: () => CFG.h_jitter, vhs_time: () => _time },
      });

      const lumaGrainStage = new Cesium.PostProcessStage({
        name: 'vhs_luma_grain',
        fragmentShader: `
          uniform sampler2D colorTexture;
          uniform float luma_grain;
          uniform float vhs_time;
          varying vec2 v_textureCoordinates;
          float hash(vec2 p, float t) { return fract(sin(dot(p + t, vec2(127.1, 311.7))) * 43758.5453); }
          float luma(vec3 col) { return dot(col, vec3(0.299, 0.587, 0.114)); }
          void main() {
            vec2 uv = v_textureCoordinates;
            vec4 original = texture2D(colorTexture, uv);
            float lum = luma(original.rgb);
            float frame = floor(vhs_time * 30.0);
            float grain = hash(uv * vec2(800.0, 600.0), frame) * 2.0 - 1.0;
            float shadowAmp = 1.0 + 2.5 * (1.0 - smoothstep(0.0, 0.5, lum));
            float str = (luma_grain / 100.0) * 0.12 * shadowAmp;
            vec3 result = original.rgb + vec3(grain * str);
            gl_FragColor = vec4(clamp(result, 0.0, 1.0), original.a);
          }
        `,
        uniforms: { luma_grain: () => CFG.luma_grain, vhs_time: () => _time },
      });

      const smearCometStage = new Cesium.PostProcessStage({
        name: 'vhs_smear_comet',
        fragmentShader: `
          uniform sampler2D colorTexture;
          uniform float h_smear;
          uniform float comet;
          uniform float vhs_time;
          varying vec2 v_textureCoordinates;
          float hash(vec2 p, float t) { return fract(sin(dot(p * 43.0 + t * 7.3, vec2(127.1, 311.7))) * 43758.5453); }
          float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
          void main() {
            vec2  uv    = v_textureCoordinates;
            vec4  orig  = texture2D(colorTexture, uv);
            float frame = floor(vhs_time * 30.0);
            float px    = 1.0 / 1280.0;
            vec3 smearResult = orig.rgb;
            if (h_smear > 0.0) {
              float strS = h_smear / 100.0;
              float noiseRoll = hash(uv * vec2(1.0, 400.0), frame);
              if (noiseRoll < strS * 0.08) {
                float dashLen = mix(3.0, 10.0, hash(uv * vec2(1.0, 200.0), frame + 1.0));
                float sampleX  = uv.x - dashLen * px * hash(uv, frame + 2.0);
                vec4  dashSrc  = texture2D(colorTexture, vec2(sampleX, uv.y));
                float noiseVal = hash(uv * vec2(300.0, 1.0), frame + 3.0);
                vec3  dash     = mix(dashSrc.rgb, vec3(noiseVal), 0.6);
                float dashFade = smoothstep(0.0, 0.3, noiseRoll / (strS * 0.08));
                smearResult    = mix(orig.rgb, dash, dashFade * strS);
              }
            }
            vec3 cometResult = smearResult;
            if (comet > 0.0) {
              float strC = comet / 100.0;
              vec3  tail    = vec3(0.0);
              float decay   = 1.0;
              float decayRate = mix(0.55, 0.72, strC);
              float totalW  = 0.0;
              for (int i = 1; i <= 12; i++) {
                float fi     = float(i);
                vec2  tapUV  = vec2(uv.x - fi * px, uv.y);
                vec4  tap    = texture2D(colorTexture, tapUV);
                float tapLum = luma(tap.rgb);
                float curLum = luma(orig.rgb);
                float delta = tapLum - curLum;
                float edgeStr = smoothstep(0.15, 0.4, abs(delta));
                float w  = decay * edgeStr;
                vec3 cometCol = delta > 0.0 ? vec3(1.0) : vec3(0.0);
                tail    += mix(tap.rgb, cometCol, 0.7) * w;
                totalW  += w;
                decay   *= decayRate;
              }
              if (totalW > 0.001) {
                tail /= totalW;
                cometResult = mix(smearResult, tail, strC * 0.45 * min(totalW, 1.0));
              }
            }
            gl_FragColor = vec4(clamp(cometResult, 0.0, 1.0), orig.a);
          }
        `,
        uniforms: { h_smear: () => CFG.h_smear, comet: () => CFG.comet, vhs_time: () => _time },
      });

// Oh....What are you doing here?

      scene.postProcessStages.add(bloomStage);
      scene.postProcessStages.add(chromaStage);
      scene.postProcessStages.add(ldrStage);
      scene.postProcessStages.add(chromaNoiseStage);
      scene.postProcessStages.add(hSoftStage);
      scene.postProcessStages.add(edgeRingStage);
      scene.postProcessStages.add(trackingStage);
      scene.postProcessStages.add(headSwitchStage);
      scene.postProcessStages.add(hJitterStage);
      scene.postProcessStages.add(lumaGrainStage);
      scene.postProcessStages.add(smearCometStage);
      setHUDStatus('active');

    } catch (e) {
      console.error('[VHS] Shader injection failed:', e);
      setHUDStatus('error');
    }
  }

  function buildHUD() {
    if (document.getElementById('vhs-bloom-hud')) return;
    const root = document.createElement('div');
    root.id = 'vhs-bloom-hud';
    root.innerHTML = `
      <style>
        #vhs-bloom-hud {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 2147483647;
          font-family: 'Courier New', monospace;
          font-size: 10px;
          letter-spacing: .08em;
          user-select: none;
          will-change: transform;
          transform: translateZ(0);
          contain: layout style;
        }
        #vhs-bloom-hud .vhs-tab {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #120800;
          border: 1px solid #6b4210;
          border-bottom: none;
          padding: 4px 10px;
          cursor: pointer;
          color: #d4a84b;
          text-transform: uppercase;
          letter-spacing: .14em;
          font-size: 9px;
        }
        #vhs-bloom-hud .vhs-status { font-size: 8px; color: #4a2a08; text-transform: uppercase; }
        #vhs-bloom-hud .vhs-status.active { color: #d4a84b; }
        #vhs-bloom-hud .vhs-status.error  { color: #c0392b; }
        #vhs-bloom-hud .vhs-panel {
          background: rgba(8, 3, 0, 0.95);
          border: 1px solid #6b4210;
          border-top: 2px solid #d4a84b;
          width: 200px;
          max-height: 260px;
          overflow-y: scroll;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          opacity: 1;
          transition: max-height .18s ease, opacity .18s ease, padding .18s ease;
          padding: 10px 12px 10px;
          will-change: scroll-position;
          overscroll-behavior: contain;
        }
        #vhs-bloom-hud .vhs-panel::-webkit-scrollbar { width: 3px; }
        #vhs-bloom-hud .vhs-panel::-webkit-scrollbar-track { background: transparent; }
        #vhs-bloom-hud .vhs-panel::-webkit-scrollbar-thumb { background: #6b4210; }
        #vhs-bloom-hud .vhs-panel.collapsed { max-height: 0; opacity: 0; padding-top: 0; padding-bottom: 0; }
        #vhs-bloom-hud .vhs-section {
          color: #6b4210;
          font-size: 8px;
          letter-spacing: .18em;
          text-transform: uppercase;
          margin-bottom: 6px;
          margin-top: 8px;
          border-bottom: 1px solid #2a1200;
          padding-bottom: 2px;
        }
        #vhs-bloom-hud .vhs-section:first-child { margin-top: 0; }
        #vhs-bloom-hud .vhs-row {
          display: flex;
          justify-content: space-between;
          color: #7a6050;
          margin-bottom: 4px;
          font-size: 10px;
        }
        #vhs-bloom-hud .vhs-num { color: #e8c87a; min-width: 24px; text-align: right; }
        #vhs-bloom-hud input[type=range] {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 2px;
          outline: none;
          cursor: pointer;
          margin-bottom: 8px;
          background: linear-gradient(to right, #d4a84b calc(var(--pct) * 1%), #2a1200 calc(var(--pct) * 1%));
        }
        #vhs-bloom-hud input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 8px; height: 14px;
          border-radius: 1px;
          background: #d4a84b;
        }
        #vhs-bloom-hud input[type=range]::-webkit-slider-thumb:hover { background: #f0c060; }
      </style>
      <div class="vhs-tab" id="vhs-bloom-toggle">
        <span>▶ VHS</span>
        <span class="vhs-status" id="vhs-bloom-status">···</span>
      </div>
      <div class="vhs-panel" id="vhs-bloom-panel">
        <div class="vhs-section">Bloom / Halation</div>
        <div class="vhs-row"><span>Intensity</span><span class="vhs-num" id="vhs-val-bloom-intensity">40</span></div>
        <input type="range" id="vhs-slider-bloom-intensity" min="0" max="100" value="40" style="--pct:40">
        <div class="vhs-row"><span>Threshold</span><span class="vhs-num" id="vhs-val-bloom-threshold">0</span></div>
        <input type="range" id="vhs-slider-bloom-threshold" min="0" max="100" value="0" style="--pct:0">

        <div class="vhs-section">Chroma Smear</div>
        <div class="vhs-row"><span>Intensity</span><span class="vhs-num" id="vhs-val-chroma-intensity">50</span></div>
        <input type="range" id="vhs-slider-chroma-intensity" min="0" max="100" value="50" style="--pct:50">

        <div class="vhs-section">Low Dynamic Range</div>
        <div class="vhs-row"><span>Crush</span><span class="vhs-num" id="vhs-val-ldr-crush">25</span></div>
        <input type="range" id="vhs-slider-ldr-crush" min="0" max="100" value="25" style="--pct:25">

        <div class="vhs-section">Chroma Noise</div>
        <div class="vhs-row"><span>Intensity</span><span class="vhs-num" id="vhs-val-chroma-noise">10</span></div>
        <input type="range" id="vhs-slider-chroma-noise" min="0" max="100" value="10" style="--pct:10">

        <div class="vhs-section">Horiz. Softness</div>
        <div class="vhs-row"><span>Amount</span><span class="vhs-num" id="vhs-val-h-soft">7</span></div>
        <input type="range" id="vhs-slider-h-soft" min="0" max="100" value="7" style="--pct:7">

        <div class="vhs-section">Edge Ringing</div>
        <div class="vhs-row"><span>Amount</span><span class="vhs-num" id="vhs-val-edge-ring">25</span></div>
        <input type="range" id="vhs-slider-edge-ring" min="0" max="100" value="25" style="--pct:25">

        <div class="vhs-section">Tracking Lines</div>
        <div class="vhs-row"><span>Intensity</span><span class="vhs-num" id="vhs-val-tracking">10</span></div>
        <input type="range" id="vhs-slider-tracking" min="0" max="100" value="10" style="--pct:10">

        <div class="vhs-section">Head-Switch Noise</div>
        <div class="vhs-row"><span>Intensity</span><span class="vhs-num" id="vhs-val-head-switch">40</span></div>
        <input type="range" id="vhs-slider-head-switch" min="0" max="100" value="40" style="--pct:40">

        <div class="vhs-section">Horiz. Jitter</div>
        <div class="vhs-row"><span>Amount</span><span class="vhs-num" id="vhs-val-h-jitter">50</span></div>
        <input type="range" id="vhs-slider-h-jitter" min="0" max="100" value="50" style="--pct:50">

        <div class="vhs-section">Luma Grain</div>
        <div class="vhs-row"><span>Intensity</span><span class="vhs-num" id="vhs-val-luma-grain">20</span></div>
        <input type="range" id="vhs-slider-luma-grain" min="0" max="100" value="20" style="--pct:20">

        <div class="vhs-section">Smear Noise</div>
        <div class="vhs-row"><span>Intensity</span><span class="vhs-num" id="vhs-val-h-smear">20</span></div>
        <input type="range" id="vhs-slider-h-smear" min="0" max="100" value="20" style="--pct:20">

        <div class="vhs-section">Comet Tails</div>
        <div class="vhs-row"><span>Intensity</span><span class="vhs-num" id="vhs-val-comet">40</span></div>
        <input type="range" id="vhs-slider-comet" min="0" max="100" value="40" style="--pct:40">
      </div>
    `;

    document.body.appendChild(root);

    document.getElementById('vhs-bloom-toggle').addEventListener('click', () => {
      document.getElementById('vhs-bloom-panel').classList.toggle('collapsed');
    });

    function wire(sliderId, valId, setter) {
      document.getElementById(sliderId).addEventListener('input', function () {
        const v = parseInt(this.value, 10);
        setter(v);
        document.getElementById(valId).textContent = v;
        this.style.setProperty('--pct', v);
      });
    }

    wire('vhs-slider-bloom-intensity',  'vhs-val-bloom-intensity',  v => CFG.bloom_intensity = v);
    wire('vhs-slider-bloom-threshold',  'vhs-val-bloom-threshold',  v => CFG.bloom_threshold = v / 100);
    wire('vhs-slider-chroma-intensity', 'vhs-val-chroma-intensity', v => CFG.chroma_intensity = v);
    wire('vhs-slider-ldr-crush',        'vhs-val-ldr-crush',        v => CFG.ldr_crush = v);
    wire('vhs-slider-chroma-noise',     'vhs-val-chroma-noise',     v => CFG.chroma_noise = v);
    wire('vhs-slider-h-soft',           'vhs-val-h-soft',           v => CFG.h_soft = v);
    wire('vhs-slider-edge-ring',        'vhs-val-edge-ring',        v => CFG.edge_ring = v);
    wire('vhs-slider-tracking',         'vhs-val-tracking',         v => CFG.tracking = v);
    wire('vhs-slider-head-switch',      'vhs-val-head-switch',      v => CFG.head_switch = v);
    wire('vhs-slider-h-jitter',         'vhs-val-h-jitter',         v => CFG.h_jitter = v);
    wire('vhs-slider-luma-grain',       'vhs-val-luma-grain',       v => CFG.luma_grain = v);
    wire('vhs-slider-h-smear',          'vhs-val-h-smear',          v => CFG.h_smear = v);
    wire('vhs-slider-comet',            'vhs-val-comet',            v => CFG.comet = v);
  }

  function setHUDStatus(state) {
    const el = document.getElementById('vhs-bloom-status');
    if (!el) return;
    el.textContent = state === 'active' ? 'REC ●' : 'ERR ■';
    el.className = 'vhs-status ' + state;
  }

})();
