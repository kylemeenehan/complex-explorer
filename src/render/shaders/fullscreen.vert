#version 300 es
// One oversized triangle that covers the whole viewport; the fragment shader
// does all the work.
in vec2 aPosition;

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
