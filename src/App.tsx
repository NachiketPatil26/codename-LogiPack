import { useState, useEffect } from 'react';
import Header from './components/Header';
import CargoInput from './components/CargoInput';
import ContainerSelection from './components/ContainerSelection';
import Visualization from './components/Visualization';
import ExportPanel from './components/ExportPanel';
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

  useEffect(() => {
    console.log('Initializing new worker');
    const newWorker = new Worker(
      new URL('./utils/packer.worker.ts', import.meta.url),
      { type: 'module' }
    );

    newWorker.onmessage = (event) => {
      console.log('Main thread received worker response:', event.data);
      setPackedResult(event.data);
      setIsLoading(false);
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
    if (!worker || cargoItems.length === 0) {
      console.log('Cannot optimize: worker not ready or no items');
      return;
    }

    console.log('Starting optimization with:', {
      cargoItems,
      container: selectedContainer
    });
    
    setIsLoading(true);
    worker.postMessage({ 
      items: cargoItems, 
      container: selectedContainer 
    });
  };

  const handleCanvasReady = (newCanvas: HTMLCanvasElement) => {
    setCanvas(newCanvas);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
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
                    : 'btn btn-accent text-lg'}`}
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