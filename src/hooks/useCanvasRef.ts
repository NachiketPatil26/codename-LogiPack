import { useEffect, useRef } from 'react';

export const useCanvasRef = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvasRef.current = canvas;
    }
  }, []);

  return canvasRef;
};
