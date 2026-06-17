import { useRef, useEffect, useState, useCallback } from 'react';
import styled from '@emotion/styled';
import { drawScene, type ProgramInfo } from '../utils/webgl/draw-scene';
import { initBuffers } from '../utils/webgl/init-buffers';

import vertexShaderSource from './shaders/mandlebrot-vertex.glsl?raw';
import fragmentShaderSource from './shaders/mandlebrot-fragment.glsl?raw';
import { initShaderProgram } from '../utils/webgl/shader-utils';

type Vec = {
  x: number;
  y: number;
};

const StyledCanvas = styled.canvas`
  width: 100%;
  height: 100%;
  cursor: grab;
  &:active {
    cursor: grabbing;
  }
`;

const maxIterations = 900;
const origSize: Vec = { x: 3, y: 3 };

export function MandlebrotSetCanvas() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<Vec>({ x: origSize.x, y: origSize.y });
  const [pos, setPos] = useState<Vec>({ x: 0, y: 0 });

  // Track mouse/touch for panning
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const touchDistance = useRef(0);
  
  // Keep refs to current state to avoid closure issues
  const sizeRef = useRef(size);
  const posRef = useRef(pos);
  
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);
  
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  const plotWebGL = useCallback(() => {
    console.time('plotWebGL');
    if (!canvas.current) {
      return;
    }

    // Get the WebGL rendering context - this is our interface to the GPU
    // WebGL 1.0 is widely supported; WebGL 2.0 has more features but less compatibility
    const gl = canvas.current.getContext('webgl');

    if (gl === null) {
      console.error('WebGL not supported');
      return;
    }

    // Set canvas resolution to match display size
    // This is critical: canvas.width/height is the actual resolution WebGL renders at
    // If not set, WebGL defaults to 300x150 pixels!
    // Note: devicePixelRatio would use retina/high-DPI resolution; we keep it at 1 for simplicity
    const devicePixelRatio = window.devicePixelRatio;
    const rect = canvas.current.getBoundingClientRect();
    canvas.current.width = rect.width * devicePixelRatio;
    canvas.current.height = rect.height * devicePixelRatio;
    // // Scale the context to ensure correct drawing operations
    // gl.scale(devicePixelRatio, devicePixelRatio);

    // Compile vertex and fragment shaders into a shader program
    // A shader program is like an executable that runs on the GPU
    const shaderProgram = initShaderProgram(
      gl,
      vertexShaderSource,
      fragmentShaderSource,
    );
    if (shaderProgram === null) {
      console.error('error from initShaderProgram');
      return;
    }

    // Collect all the info needed to use the shader program
    // This object maps JavaScript variable names to their GPU locations
    // Attributes are per-vertex data (position in this case)
    // Uniforms are constant across all vertices/fragments in this draw call
    const programInfo: ProgramInfo = {
      program: shaderProgram,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      },
      uniformLocations: {
        canvasWidth: gl.getUniformLocation(shaderProgram, 'uCanvasWidth'),
        canvasHeight: gl.getUniformLocation(shaderProgram, 'uCanvasHeight'),
        posX: gl.getUniformLocation(shaderProgram, 'uPosX'),
        posY: gl.getUniformLocation(shaderProgram, 'uPosY'),
        sizeX: gl.getUniformLocation(shaderProgram, 'uSizeX'),
        sizeY: gl.getUniformLocation(shaderProgram, 'uSizeY'),
        cx: gl.getUniformLocation(shaderProgram, 'uCx'),
        cy: gl.getUniformLocation(shaderProgram, 'uCy'),
        maxIterations: gl.getUniformLocation(shaderProgram, 'uMaxIterations'),
      },
    };

    // Activate this shader program
    // All subsequent WebGL calls will use this program until we switch to another
    gl.useProgram(programInfo.program);

    // Set viewport: tells WebGL which part of the canvas to render to
    // Usually this matches the canvas size, but you can render to a smaller portion
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Set uniform values from current state
    // These values are passed to ALL fragments in this render call
    // Use actual canvas resolution, not CSS size - must match what we set above
    const width = gl.canvas.width;
    const height = gl.canvas.height;

    // Pass canvas dimensions to shader
    gl.uniform1f(programInfo.uniformLocations.canvasWidth, width);
    gl.uniform1f(programInfo.uniformLocations.canvasHeight, height);

    // Pass Julia set parameters to shader
    // Adjust size to maintain correct aspect ratio: if canvas is wider, stretch X; if taller, stretch Y
    const aspectRatio = width / height;
    const adjustedSizeX = size.x * Math.max(aspectRatio, 1);
    const adjustedSizeY = size.y * Math.max(1 / aspectRatio, 1);

    gl.uniform1f(programInfo.uniformLocations.posX, pos.x);
    gl.uniform1f(programInfo.uniformLocations.posY, pos.y);
    gl.uniform1f(programInfo.uniformLocations.sizeX, adjustedSizeX);
    gl.uniform1f(programInfo.uniformLocations.sizeY, adjustedSizeY);

    // Pass iteration limit
    gl.uniform1f(programInfo.uniformLocations.maxIterations, maxIterations);

    // Create and setup geometry buffers (position data for our quad)
    const buffers = initBuffers(gl);

    // Render the scene
    // This calls all the drawing commands: bind buffers, set attributes, clear, and draw
    drawScene(gl, programInfo, buffers);

    console.timeEnd('plotWebGL');
  }, [size, pos]);

  // Handle mouse wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9; // Zoom out on scroll down, zoom in on scroll up
    setSize((prevSize) => ({
      x: prevSize.x * zoomFactor,
      y: prevSize.y * zoomFactor,
    }));
  }, []);

  // Handle mouse drag for panning
  const handleMouseDown = useCallback((e: MouseEvent) => {
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !canvas.current) return;

    const rect = canvas.current.getBoundingClientRect();
    const deltaX = e.clientX - lastMousePos.current.x;
    const deltaY = e.clientY - lastMousePos.current.y;

    // Convert pixel movement to complex plane coordinates
    const complexDeltaX = -(deltaX / rect.width) * sizeRef.current.x;
    const complexDeltaY = (deltaY / rect.height) * sizeRef.current.y;

    setPos((prevPos) => ({
      x: prevPos.x + complexDeltaX,
      y: prevPos.y + complexDeltaY,
    }));

    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Calculate distance between two touch points
  const getTouchDistance = useCallback((touch1: Touch, touch2: Touch) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Handle touch pinch to zoom
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2) {
      touchDistance.current = getTouchDistance(e.touches[0], e.touches[1]);
    } else if (e.touches.length === 1) {
      isDragging.current = true;
      lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, [getTouchDistance]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();

    if (e.touches.length === 2) {
      const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
      const zoomFactor = touchDistance.current / currentDistance;
      touchDistance.current = currentDistance;

      setSize((prevSize) => ({
        x: prevSize.x * zoomFactor,
        y: prevSize.y * zoomFactor,
      }));
    } else if (e.touches.length === 1 && isDragging.current && canvas.current) {
      // Single finger drag to pan
      const rect = canvas.current.getBoundingClientRect();
      const deltaX = e.touches[0].clientX - lastMousePos.current.x;
      const deltaY = e.touches[0].clientY - lastMousePos.current.y;

      const complexDeltaX = -(deltaX / rect.width) * sizeRef.current.x;
      const complexDeltaY = (deltaY / rect.height) * sizeRef.current.y;

      setPos((prevPos) => ({
        x: prevPos.x + complexDeltaX,
        y: prevPos.y + complexDeltaY,
      }));

      lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, [getTouchDistance]);

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Render whenever size or pos changes
  useEffect(() => {
    plotWebGL();
  }, [plotWebGL]);

  // Setup event listeners
  useEffect(() => {
    const canvasElement = canvas.current;
    if (!canvasElement) return;

    // Mouse events
    canvasElement.addEventListener('wheel', handleWheel as EventListener, { passive: false });
    canvasElement.addEventListener('mousedown', handleMouseDown as EventListener);
    document.addEventListener('mousemove', handleMouseMove as EventListener);
    document.addEventListener('mouseup', handleMouseUp as EventListener);

    // Touch events
    canvasElement.addEventListener('touchstart', handleTouchStart as EventListener, { passive: false });
    canvasElement.addEventListener('touchmove', handleTouchMove as EventListener, { passive: false });
    canvasElement.addEventListener('touchend', handleTouchEnd as EventListener);

    return () => {
      canvasElement.removeEventListener('wheel', handleWheel as EventListener);
      canvasElement.removeEventListener('mousedown', handleMouseDown as EventListener);
      document.removeEventListener('mousemove', handleMouseMove as EventListener);
      document.removeEventListener('mouseup', handleMouseUp as EventListener);
      canvasElement.removeEventListener('touchstart', handleTouchStart as EventListener);
      canvasElement.removeEventListener('touchmove', handleTouchMove as EventListener);
      canvasElement.removeEventListener('touchend', handleTouchEnd as EventListener);
    };
  }, [handleWheel, handleMouseDown, handleMouseMove, handleMouseUp, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return (
    <>
      <StyledCanvas ref={canvas} />
    </>
  );
}
