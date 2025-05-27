import React from 'react';
import { Container } from '../types';
import { Truck, ArrowRight, Ruler, Weight, Box } from 'lucide-react';

interface ContainerSelectionProps {
  containers: Container[];
  selectedContainer: Container;
  onSelect: (container: Container) => void;
}

const ContainerSelection: React.FC<ContainerSelectionProps> = ({ 
  containers, 
  selectedContainer, 
  onSelect 
}) => {
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title flex items-center gap-2">
          <Truck className="text-accent" />
          Select Container
        </h2>
      </div>
      
      <div className="card-content">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {containers.map((container) => (
            <button
              key={container.id}
              className={`
                border-2 rounded-lg p-4 flex flex-col items-center transition-all
                ${selectedContainer.id === container.id 
                  ? 'border-accent bg-accent/5' 
                  : 'border-border hover:border-accent/50 hover:bg-muted/50'
                }
              `}
              onClick={() => onSelect(container)}
            >
              <div className={`w-full h-20 rounded-md flex items-center justify-center mb-3 
                             ${selectedContainer.id === container.id ? 'bg-accent/10' : 'bg-muted'}`}>
                <div 
                  className="bg-accent rounded-sm shadow-md" 
                  style={{ 
                    width: container.id === '20ft' ? '40%' : '80%',
                    height: container.id.includes('hc') ? '80%' : '70%',
                  }}
                ></div>
              </div>
              
              <span className="font-medium">{container.name}</span>
              <span className="text-xs text-muted-foreground mt-1">
                {container.length} × {container.width} × {container.height} cm
              </span>
              <span className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Weight size={12} />
                Max: {container.maxWeight.toLocaleString()} kg
              </span>
            </button>
          ))}
        </div>
        
        <div className="mt-6 bg-muted rounded-lg p-4">
          <h3 className="font-medium text-sm flex items-center gap-1.5 mb-3">
            <Box size={16} className="text-accent" />
            <span>Selected Container Specifications</span>
            <ArrowRight size={14} className="text-muted-foreground" />
            <span className="text-accent">{selectedContainer.name}</span>
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-background rounded-md border p-3 shadow-sm">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Ruler size={12} className="rotate-90" />
                Length
              </span>
              <p className="font-medium mt-1">{selectedContainer.length} cm</p>
            </div>
            <div className="bg-background rounded-md border p-3 shadow-sm">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Ruler size={12} />
                Width
              </span>
              <p className="font-medium mt-1">{selectedContainer.width} cm</p>
            </div>
            <div className="bg-background rounded-md border p-3 shadow-sm">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Ruler size={12} className="rotate-180" />
                Height
              </span>
              <p className="font-medium mt-1">{selectedContainer.height} cm</p>
            </div>
            <div className="bg-background rounded-md border p-3 shadow-sm">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Weight size={12} />
                Max Weight
              </span>
              <p className="font-medium mt-1">{selectedContainer.maxWeight.toLocaleString()} kg</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContainerSelection;