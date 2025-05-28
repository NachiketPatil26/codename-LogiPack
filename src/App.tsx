import { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import CargoInput from './components/CargoInput';
import ContainerSelection from './components/ContainerSelection';
import Visualization from './components/Visualization';
import ExportPanel from './components/ExportPanel';
import DeveloperUI from './components/DeveloperUI';
import { Container, CargoItem, PackedResult } from './types';
import { containers } from './data/containers';
import { LayoutGrid, Loader2 } from 'lucide-react';

function App() {
  const [cargoItems, setCargoItems] = useState<CargoItem[]>([]);
  const [selectedContainer, setSelectedContainer] = useState<Container>(containers[0]);
  const [packedResult, setPackedResult] = useState<PackedResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isDeveloperUIOpen, setIsDeveloperUIOpen] = useState(false);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState('default');

  // Toggle Developer UI
  const toggleDeveloperUI = useCallback(() => {
    setIsDeveloperUIOpen(prev => !prev);
    console.log('Developer UI toggled');
  }, []);

  useEffect(() => {
    console.log('Initializing new worker');
    const newWorker = new Worker(
      new URL('./utils/packer.worker.ts', import.meta.url),
      { type: 'module' }
    );

    newWorker.onmessage = (event) => {
      console.log('Main thread received worker response:', event.data);
      
      // Check if this is a progress update or final result
      if (event.data.type === 'item_packed') {
        // This is a real-time update showing an item being packed
        console.log('Received real-time packing update:', event.data.progress.toFixed(1) + '%');
        setPackedResult(event.data);
      } else {
        // This is the final result
        setPackedResult(event.data);
        setIsLoading(false);
      }
    };

    newWorker.onerror = (error) => {
      console.error('Worker error in main thread:', error);
      setIsLoading(false);
    };

    setWorker(newWorker);

    return () => {
      console.log('Cleaning up worker from main thread');
      newWorker.terminate();
    };
  }, []);

  const handleAddCargoItem = (item: CargoItem) => {
    // Preserve the ID if it already exists (for CSV imports), otherwise generate a new one
    const newItem = {
      ...item,
      id: item.id || `item-${Date.now()}`
    };
    
    // Log the item being added (for debugging)
    console.log('Adding cargo item:', newItem);
    
    // Check if this item already exists (by ID)
    const exists = cargoItems.some(existingItem => existingItem.id === newItem.id);
    if (exists) {
      console.log('Item already exists, not adding duplicate:', newItem.id);
      return;
    }
    
    setCargoItems(prevItems => [...prevItems, newItem]);
  };

  const handleRemoveCargoItem = (id: string) => {
    setCargoItems(cargoItems.filter(item => item.id !== id));
  };

  const handleContainerSelect = (container: Container) => {
    setSelectedContainer(container);
  };

  const handleOptimize = () => {
    if (!worker || cargoItems.length === 0) return;
    
    setIsLoading(true);
    setPackedResult(null);
    
    console.log('Sending optimization request to worker with algorithm:', selectedAlgorithm);
    worker.postMessage({
      items: cargoItems,
      container: selectedContainer,
      algorithm: selectedAlgorithm
    });
  };

  const handleAlgorithmChange = (algorithmId: string) => {
    console.log('Algorithm changed to:', algorithmId);
    setSelectedAlgorithm(algorithmId);
    // Reset packed result when algorithm changes
    setPackedResult(null);
  };

  const handleCanvasReady = (newCanvas: HTMLCanvasElement) => {
    setCanvas(newCanvas);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header onOpenDeveloperUI={toggleDeveloperUI} />
      
      {/* Developer UI */}
      <DeveloperUI 
        isOpen={isDeveloperUIOpen}
        onClose={() => setIsDeveloperUIOpen(false)}
        currentAlgorithm={selectedAlgorithm}
        onAlgorithmChange={handleAlgorithmChange}
      />
      
      <main className="flex-1 container mx-auto px-4 py-8 flex flex-col xl:flex-row gap-8">
        <div className="xl:w-1/2 flex flex-col gap-8">
          <ContainerSelection 
            containers={containers} 
            selectedContainer={selectedContainer} 
            onSelect={handleContainerSelect} 
          />
          
          <CargoInput 
            cargoItems={cargoItems} 
            onAddItem={handleAddCargoItem} 
            onRemoveItem={handleRemoveCargoItem} 
          />
          
          <div className="mt-auto card">
            <div className="card-content py-6">
              <button 
                onClick={handleOptimize}
                disabled={cargoItems.length === 0 || isLoading}
                className={`w-full py-3 px-4 rounded-md font-medium flex items-center justify-center gap-2 shadow-md
                  ${isLoading 
                    ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                    : 'bg-accent text-accent-foreground hover:bg-accent/90 transition-colors text-lg'}`}
              >
                {isLoading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Optimizing...
                  </>
                ) : (
                  <>
                    <LayoutGrid size={20} />
                    Optimize Container Load
                  </>
                )}
              </button>
              
              {isLoading && (
                <p className="text-center text-sm text-muted-foreground mt-3">
                  Calculating the optimal packing arrangement...
                </p>
              )}
            </div>
          </div>
        </div>
        
        <div className="xl:w-1/2 flex flex-col gap-8">
          <Visualization 
            container={selectedContainer} 
            packedResult={packedResult}
            onCanvasReady={handleCanvasReady}
          />
          
          {packedResult && (
            <ExportPanel 
              container={selectedContainer} 
              packedResult={packedResult} 
              cargoItems={cargoItems}
              canvas={canvas}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;