import React, { useState, useEffect } from 'react';
import { Terminal, X, Code, Settings, Zap } from 'lucide-react';

interface Algorithm {
  id: string;
  name: string;
  description: string;
}

interface DeveloperUIProps {
  isOpen: boolean;
  onClose: () => void;
  currentAlgorithm: string;
  onAlgorithmChange: (algorithmId: string) => void;
}

const ALGORITHMS: Algorithm[] = [
  {
    id: 'default',
    name: 'Default 3D Bin Packing',
    description: 'The current implementation using multiple strategies and heuristics.'
  },
  {
    id: 'extreme_point',
    name: 'Guillotine Cut Algorithm',
    description: 'Recursively cuts space into two parts using guillotine cuts.'
  },
  {
    id: 'layer_based',
    name: 'Shelving with Search Algorithm',
    description: 'Places items on shelves with optimized search patterns.'
  },
  {
    id: 'genetic',
    name: 'Genetic Algorithm',
    description: 'Uses evolutionary approach to find optimal packing solutions.'
  },
  {
    id: 'simulated_annealing',
    name: 'Reinforcement Deep Learning',
    description: 'Uses neural networks and reinforcement learning for optimal packing.'
  }
];

const DeveloperUI: React.FC<DeveloperUIProps> = ({ 
  isOpen, 
  onClose, 
  currentAlgorithm,
  onAlgorithmChange
}) => {
  const [activeTab, setActiveTab] = useState<'algorithms' | 'settings' | 'debug'>('algorithms');
  const [debugMessages, setDebugMessages] = useState<string[]>([]);
  
  // Capture console logs for the debug panel
  useEffect(() => {
    if (isOpen && activeTab === 'debug') {
      const originalConsoleLog = console.log;
      const originalConsoleError = console.error;
      const originalConsoleWarn = console.warn;
      
      console.log = (...args) => {
        setDebugMessages(prev => [...prev, `LOG: ${args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}`]);
        originalConsoleLog(...args);
      };
      
      console.error = (...args) => {
        setDebugMessages(prev => [...prev, `ERROR: ${args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}`]);
        originalConsoleError(...args);
      };
      
      console.warn = (...args) => {
        setDebugMessages(prev => [...prev, `WARN: ${args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}`]);
        originalConsoleWarn(...args);
      };
      
      return () => {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
        console.warn = originalConsoleWarn;
      };
    }
  }, [isOpen, activeTab]);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Code size={20} className="text-accent" />
            <h2 className="text-lg font-semibold">Developer Tools</h2>
            <span className="bg-accent/20 text-accent text-xs px-2 py-0.5 rounded-full">Beta</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-muted rounded-md transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-border">
          <button 
            className={`px-4 py-2 flex items-center gap-1.5 ${activeTab === 'algorithms' ? 'border-b-2 border-accent text-accent' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('algorithms')}
          >
            <Zap size={16} />
            Algorithms
          </button>
          <button 
            className={`px-4 py-2 flex items-center gap-1.5 ${activeTab === 'settings' ? 'border-b-2 border-accent text-accent' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={16} />
            Settings
          </button>
          <button 
            className={`px-4 py-2 flex items-center gap-1.5 ${activeTab === 'debug' ? 'border-b-2 border-accent text-accent' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('debug')}
          >
            <Terminal size={16} />
            Debug Console
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'algorithms' && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Select Packing Algorithm</h3>
              <div className="space-y-2">
                {ALGORITHMS.map(algorithm => (
                  <div 
                    key={algorithm.id}
                    className={`p-3 border rounded-md cursor-pointer transition-all ${
                      currentAlgorithm === algorithm.id 
                        ? 'border-accent bg-accent/5' 
                        : 'border-border hover:border-accent/50'
                    }`}
                    onClick={() => onAlgorithmChange(algorithm.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{algorithm.name}</div>
                      {currentAlgorithm === algorithm.id && (
                        <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full">Active</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{algorithm.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Algorithm Settings</h3>
              <div className="space-y-3 text-sm">
                <div className="border border-border rounded-md p-4">
                  <h4 className="font-medium mb-2">Performance Settings</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="flex items-center justify-between mb-1">
                        <span>Optimization Level</span>
                        <span className="text-accent">Medium</span>
                      </label>
                      <input 
                        type="range" 
                        min="1" 
                        max="3" 
                        defaultValue="2"
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>Speed</span>
                        <span>Balance</span>
                        <span>Quality</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-2">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="h-4 w-4" defaultChecked />
                        <span>Use multithreading</span>
                      </label>
                      <span className="text-xs bg-green-500/20 text-green-600 px-2 py-0.5 rounded-full">Recommended</span>
                    </div>
                  </div>
                </div>
                
                <div className="border border-border rounded-md p-4">
                  <h4 className="font-medium mb-2">Algorithm Parameters</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block mb-1">Max Iterations</label>
                      <input 
                        type="number" 
                        className="input w-full" 
                        defaultValue="1000"
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Timeout (ms)</label>
                      <input 
                        type="number" 
                        className="input w-full" 
                        defaultValue="30000"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'debug' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium text-muted-foreground">Console Output</h3>
                <button 
                  className="text-xs px-2 py-1 border border-border rounded hover:bg-muted"
                  onClick={() => setDebugMessages([])}
                >
                  Clear Console
                </button>
              </div>
              <div className="bg-black/90 text-green-400 font-mono text-xs p-3 rounded-md h-80 overflow-auto">
                {debugMessages.length > 0 ? (
                  debugMessages.map((msg, i) => (
                    <div key={i} className="pb-1">{msg}</div>
                  ))
                ) : (
                  <div className="text-muted-foreground italic">No console output yet...</div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="border-t border-border p-4 flex justify-between items-center text-xs text-muted-foreground">
          <div>Developer Tools - Click the Dev Tools button in the header to open</div>
          <div>v0.1.0-dev</div>
        </div>
      </div>
    </div>
  );
};

export default DeveloperUI;
