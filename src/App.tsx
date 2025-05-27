import { useState, useEffect } from 'react';
import Header from './components/Header';
import CargoInput from './components/CargoInput';
import ContainerSelection from './components/ContainerSelection';
import Visualization from './components/Visualization';
import ExportPanel from './components/ExportPanel';
import { Container, CargoItem, PackedResult } from './types';
import { containers } from './data/containers';
import { LayoutGrid, Loader2, PackageCheck, AlertTriangle } from 'lucide-react';

function App() {
  const [cargoItems, setCargoItems] = useState<CargoItem[]>([]);
  const [selectedContainer, setSelectedContainer] = useState<Container>(containers[0]);
  const [packedResult, setPackedResult] = useState<PackedResult | null>(null);
  const [secondContainerResult, setSecondContainerResult] = useState<PackedResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [useSecondContainer, setUseSecondContainer] = useState(false);
  const [showVolumeWarning, setShowVolumeWarning] = useState(false);

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
    setCargoItems([...cargoItems, { ...item, id: Date.now().toString() }]);
  };

  const handleRemoveCargoItem = (id: string) => {
    setCargoItems(cargoItems.filter(item => item.id !== id));
  };

  const handleContainerSelect = (container: Container) => {
    setSelectedContainer(container);
  };

  // Calculate the total volume of all cargo items
  const calculateTotalCargoVolume = (items: CargoItem[]): number => {
    return items.reduce((total, item) => {
      const itemVolume = item.length * item.width * item.height;
      const quantity = item.quantity || 1;
      return total + (itemVolume * quantity);
    }, 0);
  };

  // Calculate the container volume
  const calculateContainerVolume = (container: Container): number => {
    return container.length * container.width * container.height;
  };

  // Check if cargo will likely fit in the container
  const checkVolumeCompatibility = (): { willFit: boolean; volumeRatio: number } => {
    const totalCargoVolume = calculateTotalCargoVolume(cargoItems);
    const containerVolume = calculateContainerVolume(selectedContainer);
    const volumeRatio = totalCargoVolume / containerVolume;
    
    // Consider 85% as the practical limit for efficient packing
    // Real-world packing efficiency is typically 70-90%
    return { willFit: volumeRatio <= 0.85, volumeRatio };
  };

  // Find the next larger container that might fit the cargo
  const findLargerContainer = (): Container | null => {
    const totalCargoVolume = calculateTotalCargoVolume(cargoItems);
    
    // Find containers that are larger than the current one
    const largerContainers = containers
      .filter(c => calculateContainerVolume(c) > calculateContainerVolume(selectedContainer))
      .sort((a, b) => calculateContainerVolume(a) - calculateContainerVolume(b));
    
    // Find the smallest container that can fit the cargo with 85% efficiency
    return largerContainers.find(c => {
      const containerVolume = calculateContainerVolume(c);
      return (totalCargoVolume / containerVolume) <= 0.85;
    }) || null;
  };

  const handleOptimize = () => {
    if (!worker || cargoItems.length === 0) {
      console.log('Cannot optimize: worker not ready or no items');
      return;
    }

    // Reset previous results
    setSecondContainerResult(null);
    setUseSecondContainer(false);
    setShowVolumeWarning(false);

    // Check if the cargo will likely fit in the container
    const { willFit, volumeRatio } = checkVolumeCompatibility();
    
    if (!willFit) {
      // Calculate how many items might not fit
      const overflowRatio = volumeRatio - 0.85;
      const totalItems = cargoItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
      const estimatedOverflowItems = Math.ceil(totalItems * overflowRatio);
      
      // Find a larger container that might fit all items
      const largerContainer = findLargerContainer();
      
      // Ask user if they want to proceed anyway, use a second container, or choose a different option
      const userChoice = window.confirm(
        `Warning: Your cargo items may not all fit in this container (volume utilization: ${(volumeRatio * 100).toFixed(0)}%)\n\n` +
        `Approximately ${estimatedOverflowItems} items may not fit.\n\n` +
        `Options:\n` +
        `1. Click OK to use a second container for overflow items\n` +
        `2. Click Cancel to either select a larger container or reduce cargo items`
      );
      
      if (!userChoice) {
        // User chose to cancel
        if (largerContainer) {
          if (window.confirm(`Would you like to switch to a larger container (${largerContainer.name})?`)) {
            setSelectedContainer(largerContainer);
          }
        }
        return;
      }
      
      // User chose to use a second container
      setUseSecondContainer(true);
      setShowVolumeWarning(true);
    }

    console.log('Starting optimization with:', {
      cargoItems,
      container: selectedContainer,
      useSecondContainer
    });
    
    setIsLoading(true);
    
    // First container optimization
    worker.postMessage({ 
      items: cargoItems, 
      container: selectedContainer 
    });
  };
  
  // Handle worker response
  useEffect(() => {
    if (!worker) return;
    
    const handleWorkerMessage = (event: MessageEvent) => {
      const result = event.data;
      console.log('Main thread received worker response:', result);
      
      // Store the packed result
      setPackedResult(result);
      
      // If we're using a second container and there are unpacked items, pack them in a second container
      if (useSecondContainer && result.unpackedItems && result.unpackedItems.length > 0) {
        console.log(`Packing ${result.unpackedItems.length} overflow items in second container`);
        
        // Use the same container type for the second container
        worker.postMessage({
          items: result.unpackedItems,
          container: selectedContainer,
          isSecondContainer: true
        });
      } else {
        setIsLoading(false);
      }
    };
    
    const handleSecondContainerResult = (event: MessageEvent) => {
      if (event.data.isSecondContainer) {
        console.log('Second container result:', event.data);
        setSecondContainerResult(event.data);
        setIsLoading(false);
      }
    };
    
    worker.onmessage = (event) => {
      if (event.data.isSecondContainer) {
        handleSecondContainerResult(event);
      } else {
        handleWorkerMessage(event);
      }
    };
    
    return () => {
      worker.onmessage = null;
    };
  }, [worker, useSecondContainer, selectedContainer]);

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
          {/* Volume warning message */}
          {showVolumeWarning && (
            <div className="alert alert-warning flex items-center gap-2 p-4 rounded-md bg-amber-50 border border-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <div>
                <h4 className="font-bold text-amber-800">Volume Warning</h4>
                <p className="text-sm text-amber-700">Some cargo items couldn't fit in the first container and will be packed in a second container.</p>
              </div>
            </div>
          )}
          
          {/* First container visualization */}
          <div className="card">
            {useSecondContainer && (
              <div className="card-header border-b p-4">
                <h3 className="card-title flex items-center gap-2 text-lg font-medium">
                  <PackageCheck className="text-accent" />
                  Container 1
                </h3>
              </div>
            )}
            <Visualization 
              container={selectedContainer} 
              packedResult={packedResult}
              onCanvasReady={handleCanvasReady}
            />
          </div>
          
          {/* Second container visualization (if needed) */}
          {secondContainerResult && secondContainerResult.packedItems && secondContainerResult.packedItems.length > 0 && (
            <div className="card">
              <div className="card-header border-b p-4">
                <h3 className="card-title flex items-center gap-2 text-lg font-medium">
                  <PackageCheck className="text-accent" />
                  Container 2
                </h3>
              </div>
              <Visualization 
                container={selectedContainer} 
                packedResult={secondContainerResult} 
              />
            </div>
          )}
          
          {packedResult && canvas && (
            <ExportPanel 
              packedResult={packedResult} 
              container={selectedContainer} 
              canvas={canvas}
              cargoItems={cargoItems}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;