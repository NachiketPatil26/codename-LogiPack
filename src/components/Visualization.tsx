import React, { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { 
  OrbitControls, 
  PerspectiveCamera, 
  Environment, 
  ContactShadows,
  Center
} from '@react-three/drei';
import { Container, PackedResult, PackedItem } from '../types';
import ContainerModel from './three/ContainerModel';
import PackedItems from './three/PackedItems';
import ErrorBoundary from './ErrorBoundary';
import { Box, BarChart3, Weight, PackageCheck, RotateCcw, Maximize, RotateCw } from 'lucide-react';

interface VisualizationProps {
  container: Container;
  packedResult: PackedResult | null;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

// Enhanced 3D scene component
const Scene: React.FC<{ 
  container: Container, 
  packedItems: PackedItem[] | undefined,
  onItemHover: (item: PackedItem | null) => void 
}> = ({ container, packedItems, onItemHover }) => {
  return (
    <>
      {/* Enhanced lighting for better visuals */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={0.7} castShadow />
      <directionalLight position={[-10, -10, -5]} intensity={0.2} />
      
      {/* Environment map for realistic reflections */}
      <Environment preset="city" background={false} />
      
      {/* Shadows for better depth perception */}
      <ContactShadows 
        position={[0, -0.5, 0]} 
        opacity={0.4} 
        scale={40} 
        blur={1.5} 
        far={20} 
      />
      
      {/* Center everything for better camera control */}
      <Center>
        <ContainerModel container={container} />
        {packedItems && (
          <PackedItems 
            packedItems={packedItems} 
            onItemHover={onItemHover}
          />
        )}
      </Center>
    </>
  );
};

const Visualization: React.FC<VisualizationProps> = ({ container, packedResult, onCanvasReady }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredItem, setHoveredItem] = useState<PackedItem | null>(null);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  
  // Update loading progress when packedResult changes
  useEffect(() => {
    if (packedResult?.progress) {
      setLoadingProgress(packedResult.progress);
    }
  }, [packedResult]);

  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (canvas && onCanvasReady) {
      onCanvasReady(canvas);
    }
  }, [onCanvasReady]);

  // Calculate percentage stats
  const fillPercentage = packedResult?.containerFillPercentage || 0;
  const weightPercentage = packedResult?.weightCapacityPercentage || 0;
  
  // Calculate unloaded items with safe null checks
  const unloadedCount = packedResult?.unpackedItems?.length || 0;
  const totalItems = (packedResult?.packedItems?.length || 0) + unloadedCount;

  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="card-header border-b">
        <h2 className="card-title flex items-center gap-2">
          <Box className="text-accent" />
          3D Container Visualization
        </h2>
        {packedResult ? (
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-muted rounded-md p-3 text-center">
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <BarChart3 size={14} />
                Space Utilization
              </p>
              <div className="flex items-center justify-center mt-2">
                <div className="w-full bg-secondary-200 rounded-full h-2.5">
                  <div 
                    className="bg-accent h-2.5 rounded-full" 
                    style={{ width: `${fillPercentage}%` }}
                  ></div>
                </div>
              </div>
              <p className="font-medium mt-1.5">{fillPercentage.toFixed(1)}%</p>
            </div>
            
            <div className="bg-muted rounded-md p-3 text-center">
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Weight size={14} />
                Weight Capacity
              </p>
              <div className="flex items-center justify-center mt-2">
                <div className="w-full bg-secondary-200 rounded-full h-2.5">
                  <div 
                    className="bg-primary h-2.5 rounded-full" 
                    style={{ width: `${weightPercentage}%` }}
                  ></div>
                </div>
              </div>
              <p className="font-medium mt-1.5">{weightPercentage.toFixed(1)}%</p>
            </div>
            
            <div className="bg-muted rounded-md p-3 text-center">
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <PackageCheck size={14} />
                Items Loaded
              </p>
              <p className="font-medium mt-3.5">
                {packedResult.packedItems.length} / {totalItems}
                {unloadedCount > 0 && (
                  <span className="text-destructive text-xs ml-1">({unloadedCount} unloaded)</span>
                )}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mt-1">
            Add cargo items and optimize to see the visualization
          </p>
        )}
      </div>
      
      <div className="flex-1 bg-gradient-to-b from-background to-black relative" style={{ minHeight: '450px' }}>
        <ErrorBoundary>
          <Canvas 
            ref={canvasRef} 
            shadows 
            dpr={[1, 2]} // Responsive resolution
            camera={{ position: [500, 400, 500], fov: 50 }}
            gl={{ antialias: true }}
          >
            <PerspectiveCamera makeDefault position={[500, 400, 500]} />
            <OrbitControls 
              enablePan={true} 
              enableZoom={true} 
              enableRotate={true}
              minDistance={100} // Prevent zooming in too close
              maxDistance={1000} // Prevent zooming out too far
              dampingFactor={0.1} // Add damping for smoother controls
              rotateSpeed={0.7} // Slightly slower rotation for better control
              zoomSpeed={0.8} // Slightly slower zoom for better control
              panSpeed={0.8} // Slightly slower pan for better control
              autoRotate={autoRotate} // Optional auto-rotation
              autoRotateSpeed={0.5} // Slow auto-rotation speed
            />
            
            <Scene 
              container={container} 
              packedItems={packedResult?.packedItems}
              onItemHover={setHoveredItem}
            />
          </Canvas>
        </ErrorBoundary>
        
        {/* Camera controls overlay */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-2">
          <button 
            className="p-2 bg-black/30 backdrop-blur-sm rounded-full hover:bg-accent/20 transition-colors flex items-center justify-center"
            onClick={() => {
              const controls = document.querySelector('canvas')?.parentElement?.querySelector('.drei-controls');
              if (controls) {
                // @ts-ignore
                controls.reset();
              }
            }}
            title="Reset view"
          >
            <RotateCcw size={18} className="text-white" />
          </button>
          
          <button 
            className="p-2 bg-black/30 backdrop-blur-sm rounded-full hover:bg-accent/20 transition-colors flex items-center justify-center"
            onClick={() => setAutoRotate(!autoRotate)}
            title={autoRotate ? "Stop rotation" : "Auto rotate"}
          >
            <RotateCw size={18} className={`${autoRotate ? 'text-accent' : 'text-white'}`} />
          </button>
          
          <button 
            className="p-2 bg-black/30 backdrop-blur-sm rounded-full hover:bg-accent/20 transition-colors flex items-center justify-center"
            onClick={() => {
              const canvas = document.querySelector('canvas');
              if (canvas && canvas.parentElement) {
                if (document.fullscreenElement) {
                  document.exitFullscreen();
                } else {
                  canvas.parentElement.requestFullscreen();
                }
              }
            }}
            title="Toggle fullscreen"
          >
            <Maximize size={18} className="text-white" />
          </button>
        </div>
        
        {/* Real-time packing progress indicator */}
        {packedResult?.type === 'item_packed' && loadingProgress > 0 && loadingProgress < 100 && (
          <div className="absolute bottom-20 right-4 bg-black/30 backdrop-blur-sm p-3 rounded-lg w-48">
            <div className="flex justify-between text-xs text-white mb-2">
              <span>Packing in progress...</span>
              <span>{Math.round(loadingProgress)}%</span>
            </div>
            <div className="w-full bg-gray-600 rounded-full h-2">
              <div 
                className="bg-accent h-2 rounded-full transition-all duration-300 ease-in-out" 
                style={{ width: `${loadingProgress}%` }}
              ></div>
            </div>
          </div>
        )}
        
        {!packedResult && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 text-white">
            <div className="text-center bg-black/30 backdrop-blur-sm p-6 rounded-lg border border-accent/20 shadow-lg shadow-accent/10">
              <Box size={48} className="mx-auto mb-4 text-accent animate-pulse" />
              <p className="text-lg font-medium">No cargo loaded</p>
              <p className="text-sm opacity-70 mt-1">Click "Optimize Container Load" to start</p>
              <div className="mt-4 flex justify-center">
                <button 
                  className="px-4 py-2 bg-accent/20 hover:bg-accent/30 transition-colors rounded-md text-accent text-sm"
                  onClick={() => {
                    // Find and click the optimize button
                    const optimizeButton = document.querySelector('button:has(.lucide-layout-grid)');
                    if (optimizeButton) {
                      optimizeButton.scrollIntoView({ behavior: 'smooth' });
                      setTimeout(() => {
                        // @ts-ignore
                        optimizeButton.classList.add('animate-pulse');
                        setTimeout(() => {
                          // @ts-ignore
                          optimizeButton.classList.remove('animate-pulse');
                        }, 2000);
                      }, 500);
                    }
                  }}
                >
                  Show me how
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Item hover tooltip */}
        {hoveredItem && (
          <div 
            className="absolute pointer-events-none bg-black/70 text-white text-xs p-2 rounded shadow-md backdrop-blur-sm border border-accent/30"
            style={{
              left: '50%',
              top: '20px',
              transform: 'translateX(-50%)',
              maxWidth: '250px'
            }}
          >
            <div className="font-medium">{hoveredItem.name}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
              <div className="text-muted-foreground">Dimensions:</div>
              <div>{hoveredItem.length}×{hoveredItem.width}×{hoveredItem.height} cm</div>
              <div className="text-muted-foreground">Weight:</div>
              <div>{hoveredItem.weight} kg</div>
              <div className="text-muted-foreground">Position:</div>
              <div>({hoveredItem.position.x}, {hoveredItem.position.y}, {hoveredItem.position.z})</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Visualization;