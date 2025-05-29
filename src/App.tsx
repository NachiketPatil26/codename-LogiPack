import { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import CargoInput from './components/CargoInput';
import ContainerSelection from './components/ContainerSelection';
import Visualization from './components/Visualization';
import ExportPanel from './components/ExportPanel';
import DeveloperUI from './components/DeveloperUI';
import { Container, CargoItem, PackedResult, DisplayCargoItem, ItemConstraint } from './types';
import { containers } from './data/containers';
import { LayoutGrid, Loader2 } from 'lucide-react';

function App() {
  const [cargoItems, setCargoItems] = useState<DisplayCargoItem[]>([]);
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

  const handleAddCargoItem = (formData: Omit<CargoItem, 'id' | 'quantity'> & { quantity: number; isFragile?: boolean; isRotatable?: boolean; constraints?: ItemConstraint[] }) => {
    const { name, length, width, height, weight, color, constraints, isFragile, isRotatable, quantity: formQuantity } = formData;

    // Generate a groupKey based on item properties
    // For constraints, sort them to ensure consistent key regardless of order
    const sortedConstraintsString = constraints ? JSON.stringify([...constraints].sort((a, b) => a.type.localeCompare(b.type))) : '';
    const groupKey = `${name}-${length}x${width}x${height}-${weight}-${color}-${isFragile}-${isRotatable}-${sortedConstraintsString}`;

    setCargoItems(prevItems => {
      const existingGroupIndex = prevItems.findIndex(item => item.groupKey === groupKey);

      if (existingGroupIndex !== -1) {
        // Item group exists, update its quantity
        const updatedItems = [...prevItems];
        updatedItems[existingGroupIndex] = {
          ...updatedItems[existingGroupIndex],
          displayQuantity: updatedItems[existingGroupIndex].displayQuantity + formQuantity
        };
        console.log('Updated quantity for group:', groupKey, 'New total:', updatedItems[existingGroupIndex].displayQuantity);
        return updatedItems;
      } else {
        // New item group, add it
        const newDisplayItem: DisplayCargoItem = {
          groupKey,
          id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique ID for the group
          name,
          length,
          width,
          height,
          weight,
          color,
          constraints, // Store original constraints from form
          isFragile: formData.isFragile, // Store direct boolean if available
          isRotatable: formData.isRotatable, // Store direct boolean if available
          displayQuantity: formQuantity
        };
        console.log('Adding new group:', newDisplayItem);
        return [...prevItems, newDisplayItem];
      }
    });
  };

  const handleRemoveCargoItem = (groupId: string) => {
    setCargoItems(prevItems => prevItems.filter(item => item.id !== groupId));
    console.log('Removed group:', groupId);
  };

  const handleContainerSelect = (container: Container) => {
    setSelectedContainer(container);
  };

  const handleOptimize = () => {
    if (!worker || cargoItems.length === 0) return;
    
    setIsLoading(true);
    setPackedResult(null);
    
    console.log('Sending optimization request to worker with algorithm:', selectedAlgorithm);
    const itemsToPack: CargoItem[] = cargoItems.flatMap(group =>
      Array.from({ length: group.displayQuantity }, (_, i) => ({
        ...group, // Spread properties from DisplayCargoItem
        id: `${group.id}-item-${i}`, // Create a unique ID for each individual item
        quantity: 1, // Each actual item sent to packer has quantity 1
        // Ensure all properties of CargoItem are present, map from DisplayCargoItem if names differ
        // For example, if DisplayCargoItem didn't have 'constraints' directly but derived them,
        // you'd map them here. In our current DisplayCargoItem, properties mostly align.
      }))
    );

    console.log('Sending optimization request to worker with algorithm:', selectedAlgorithm, 'and items:', itemsToPack);
    worker.postMessage({
      items: itemsToPack,
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

  const handleCanvasReady = useCallback((newCanvas: HTMLCanvasElement) => {
    console.log('Canvas ready:', newCanvas);
    setCanvas(newCanvas);
  }, []);

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
              cargoItems={cargoItems.flatMap(group =>
                Array.from({ length: group.displayQuantity }, (_, i) => ({
                  ...group,
                  id: `${group.id}-item-${i}`,
                  quantity: 1,
                }))
              )}
              canvas={canvas}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;