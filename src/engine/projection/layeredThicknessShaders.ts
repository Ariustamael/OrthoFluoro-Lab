export const THICKNESS_ACCUMULATION_VERTEX_SHADER = /* glsl */ `
  out vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const THICKNESS_ACCUMULATION_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  in vec3 vWorldPosition;
  uniform vec3 uSourceWorld;
  uniform float uSurfaceSign;
  out vec4 outThickness;

  void main() {
    float sourceDistance = length(vWorldPosition - uSourceWorld);
    outThickness = vec4(uSurfaceSign * sourceDistance, 0.0, 0.0, 1.0);
  }
`;

export const THICKNESS_COMPOSITE_VERTEX_SHADER = /* glsl */ `
  out vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const THICKNESS_COMPOSITE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  in vec2 vUv;
  uniform sampler2D uThicknessTexture;
  uniform float uAttenuationPerMm;
  out vec4 outColor;

  void main() {
    float thicknessMm = max(texture(uThicknessTexture, vUv).r, 0.0);
    float attenuation = 1.0 - exp(-uAttenuationPerMm * thicknessMm);
    outColor = vec4(vec3(attenuation), 1.0);
  }
`;
