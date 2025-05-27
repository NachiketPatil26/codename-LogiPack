import React from 'react';
import { Package, FileText, Save, Github } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="bg-background border-b border-border sticky top-0 z-10 shadow-sm">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-accent/10 p-2 rounded-lg">
              <Package size={24} className="text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Cargo Container Load Optimizer</h1>
              <p className="text-xs text-muted-foreground">Maximize space efficiency with 3D bin packing</p>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-3">
            <a 
              href="https://github.com" 
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm"
            >
              <Github size={16} />
              <span>GitHub</span>
            </a>
            
            <a 
              href="#" 
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm"
            >
              <FileText size={16} />
              <span>Documentation</span>
            </a>
            
            <button 
              className="bg-accent text-accent-foreground px-3 py-1.5 rounded-md hover:bg-accent/90 transition-colors text-sm flex items-center gap-1.5 shadow-sm"
            >
              <Save size={16} />
              <span>Save Plan</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;