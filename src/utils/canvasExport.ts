export const captureCanvas = (canvas: HTMLCanvasElement): Promise<string> => {
  return new Promise((resolve) => {
    // Force render to ensure latest state
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      gl.finish();
    }
    
    // Create temporary canvas for proper resolution
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width * 2;  // Double resolution for better quality
    tempCanvas.height = canvas.height * 2;
    const ctx = tempCanvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
      resolve(tempCanvas.toDataURL('image/png'));
    } else {
      resolve(canvas.toDataURL('image/png'));
    }
  });
};
