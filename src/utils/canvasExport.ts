/**
 * Captures the content of a canvas (including WebGL canvas) and returns a data URL
 * @param canvas The canvas element to capture
 * @returns Promise resolving to a data URL of the canvas content
 */
export const captureCanvas = (canvas: HTMLCanvasElement): Promise<string> => {
  return new Promise((resolve) => {
    // Ensure the canvas is properly rendered before capturing
    requestAnimationFrame(() => {
      // For WebGL canvas, we need to ensure rendering is complete
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        gl.finish();
      }
      
      // Create a high-resolution temporary canvas
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width * 2;  // Double resolution for better quality
      tempCanvas.height = canvas.height * 2;
      const ctx = tempCanvas.getContext('2d');
      
      if (ctx) {
        // Set background to white to ensure visibility
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        // Draw the WebGL canvas onto the temporary canvas
        ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
        
        // Convert to data URL with high quality
        resolve(tempCanvas.toDataURL('image/png', 1.0));
      } else {
        // Fallback to direct capture if 2D context isn't available
        resolve(canvas.toDataURL('image/png', 1.0));
      }
    });
  });
};
