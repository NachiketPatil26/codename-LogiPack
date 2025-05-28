import React, { useState, useEffect, useRef } from 'react';
import { useForm, SubmitHandler, Controller } from 'react-hook-form';
import { CargoItem, ConstraintType, ItemConstraint } from '../types';
import { PackagePlus, Trash2, Package, Plus, Palette, Hash, X, ChevronDown, Upload, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';

interface CargoInputProps {
  cargoItems: CargoItem[];
  onAddItem: (item: CargoItem) => void;
  onRemoveItem: (id: string) => void;
}

type CargoFormInputs = Omit<CargoItem, 'id'> & {
  isFragile?: boolean;
  isRotatable?: boolean;
};

// Predefined vibrant colors for cargo items
const PREDEFINED_COLORS = [
  '#FF5757', // Vibrant Red
  '#FF914D', // Vibrant Orange
  '#FFDE59', // Vibrant Yellow
  '#7ED957', // Vibrant Green
  '#5271FF', // Vibrant Blue
  '#8C52FF', // Vibrant Purple
  '#FF66C4', // Vibrant Pink
  '#00D2D3', // Vibrant Teal
  '#43D9D9', // Neon Cyan (accent color)
  '#00C49A', // Vibrant Mint
  '#FF5DCD', // Hot Pink
  '#6C5CE7', // Soft Purple
  '#FFA502', // Amber
  '#1DD1A1', // Light Green
];

const CargoInput: React.FC<CargoInputProps> = ({ cargoItems, onAddItem, onRemoveItem }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedColor, setSelectedColor] = useState(PREDEFINED_COLORS[8]); // Default to neon cyan
  const [csvImportError, setCsvImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { 
    register, 
    handleSubmit, 
    reset,
    control,
    setValue,
    watch,
    formState: { errors } 
  } = useForm<CargoFormInputs>({
    defaultValues: {
      name: '',
      length: 100,
      width: 100,
      height: 100,
      weight: 50,
      color: PREDEFINED_COLORS[8], // Neon cyan
      quantity: 1,
      isFragile: false,
      isRotatable: true
    }
  });

  // Watch the current color value
  const currentColor = watch('color');
  
  // Update the form color value when selectedColor changes
  useEffect(() => {
    setValue('color', selectedColor);
  }, [selectedColor, setValue]);
  
  const onSubmit: SubmitHandler<CargoFormInputs> = (data) => {
    // Handle quantity - create multiple items with the same properties
    const quantity = data.quantity || 1;
    
    // Create constraints array based on checkboxes
    const constraints: ItemConstraint[] = [];
    
    // Add fragile constraint if checked
    if (data.isFragile) {
      constraints.push({
        type: ConstraintType.FRAGILE
      });
      console.log('Adding fragile constraint');
    }
    
    // Add must-be-upright constraint if not rotatable
    if (data.isRotatable === false) {
      constraints.push({
        type: ConstraintType.MUST_BE_UPRIGHT
      });
      console.log('Adding non-rotatable constraint');
    }
    
    // Create a new cargo item with the current data
    const baseItem = {
      name: data.name,
      length: data.length,
      width: data.width,
      height: data.height,
      weight: data.weight,
      color: currentColor, // Ensure we use the current color
      quantity: data.quantity,
      constraints: constraints.length > 0 ? constraints : undefined
    };
    
    console.log('Creating item with constraints:', constraints);
    
    // Add the item(s) based on quantity
    const timestamp = Date.now();
    
    if (quantity === 1) {
      const newItem = {
        ...baseItem,
        id: `item-${timestamp}`
      };
      console.log('Adding single item:', newItem);
      onAddItem(newItem);
    } else {
      // Create multiple items with incrementing names
      console.log(`Creating ${quantity} items`);
      for (let i = 0; i < quantity; i++) {
        const newItem = {
          ...baseItem,
          id: `item-${timestamp}-${i}`,
          name: `${data.name} #${i + 1}`
        };
        console.log(`Adding item ${i+1}:`, newItem);
        onAddItem(newItem);
      }
    }
    
    // Reset form and UI state
    reset();
    setIsAdding(false);
    setShowColorPicker(false);
  };
  
  // Generate a random color from the predefined colors
  const getRandomColor = () => {
    const randomIndex = Math.floor(Math.random() * PREDEFINED_COLORS.length);
    setSelectedColor(PREDEFINED_COLORS[randomIndex]);
  };
  
  // Handle selecting a predefined color
  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    setShowColorPicker(false);
  };
  
  // Handle CSV file import
  const handleCsvImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setCsvImportError(null);
    
    if (!file) return;
    
    // Check file extension
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvImportError('Please select a CSV file');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvData = e.target?.result as string;
        
        // Handle different line endings
        const lines = csvData
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .split('\n')
          .filter(line => line.trim() !== '');
        
        console.log('CSV lines:', lines);
        
        if (lines.length <= 1) {
          setCsvImportError('CSV file is empty or contains only headers');
          return;
        }
        
        // Parse header row
        const header = lines[0].split(',').map(h => h.toLowerCase().trim());
        
        // Check required columns
        const nameIndex = header.indexOf('name');
        const lengthIndex = header.indexOf('length');
        const widthIndex = header.indexOf('width');
        const heightIndex = header.indexOf('height');
        const weightIndex = header.indexOf('weight');
        
        if (nameIndex === -1 || lengthIndex === -1 || widthIndex === -1 || 
            heightIndex === -1 || weightIndex === -1) {
          setCsvImportError('Missing required columns: name, length, width, height, weight');
          return;
        }
        
        // Optional columns
        const colorIndex = header.indexOf('color');
        const quantityIndex = header.indexOf('quantity');
        const fragileIndex = header.indexOf('fragile');
        const rotatableIndex = header.indexOf('rotatable');
        
        let importCount = 0;
        const timestamp = Date.now(); // Use a single timestamp for all items in this batch
        const newItems: CargoItem[] = [];
        
        // Process data rows
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim());
          
          if (values.length < 5) continue;
          
          // Basic values
          const name = values[nameIndex];
          const length = parseFloat(values[lengthIndex]);
          const width = parseFloat(values[widthIndex]);
          const height = parseFloat(values[heightIndex]);
          const weight = parseFloat(values[weightIndex]);
          
          // Skip invalid entries
          if (!name || isNaN(length) || isNaN(width) || isNaN(height) || isNaN(weight)) {
            continue;
          }
          
          // Optional values
          const color = colorIndex >= 0 && values[colorIndex] ? 
            values[colorIndex] : 
            PREDEFINED_COLORS[Math.floor(Math.random() * PREDEFINED_COLORS.length)];
            
          const quantity = quantityIndex >= 0 && values[quantityIndex] ? 
            parseInt(values[quantityIndex]) : 1;
          
          // Constraints
          const constraints: ItemConstraint[] = [];
          
          // Check if item is fragile
          if (fragileIndex >= 0) {
            const isFragile = values[fragileIndex]?.toLowerCase();
            if (isFragile === 'true' || isFragile === 'yes' || isFragile === '1') {
              constraints.push({ type: ConstraintType.FRAGILE });
              console.log(`Row ${i}: Item is fragile`);
            }
          }
          
          // Check if item is rotatable (if false, it must be upright)
          if (rotatableIndex >= 0) {
            const isRotatable = values[rotatableIndex]?.toLowerCase();
            if (isRotatable === 'false' || isRotatable === 'no' || isRotatable === '0') {
              constraints.push({ type: ConstraintType.MUST_BE_UPRIGHT });
              console.log(`Row ${i}: Item is not rotatable`);
            }
          }
          
          // Create a unique item with a stable ID
          const newItem: CargoItem = {
            id: `csv-${timestamp}-${i}`,
            name,
            length,
            width,
            height,
            weight,
            color,
            quantity,
            constraints: constraints.length > 0 ? constraints : undefined
          };
          
          console.log(`CSV row ${i}:`, values);
          console.log('Created item from CSV:', newItem);
          
          newItems.push(newItem);
          importCount++;
        }
        
        // Add all items at once after processing
        console.log(`Adding ${newItems.length} items from CSV`);
        newItems.forEach(item => {
          onAddItem(item);
        });
        
        if (importCount > 0) {
          setCsvImportError(`Successfully imported ${importCount} items.`);
        } else {
          setCsvImportError('No valid items found in the CSV file.');
        }
      } catch (error) {
        console.error('Error parsing CSV:', error);
        setCsvImportError('Error parsing CSV file. Please check the format.');
      }
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    
    reader.onerror = () => {
      setCsvImportError('Error reading the file');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    
    reader.readAsText(file);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex justify-between items-center mb-4">
          <h2 className="card-title flex items-center gap-2">
            <Package className="text-accent" />
            Cargo Items
          </h2>
          <div className="flex gap-2">
            {/* CSV Import Button */}
            <div className="relative">
              <input
                type="file"
                accept=".csv"
                ref={fileInputRef}
                onChange={handleCsvImport}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <button
                className="btn btn-secondary flex items-center"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={16} className="mr-1" /> Import CSV
              </button>
            </div>
            
            <button
              className="btn btn-accent flex items-center"
              onClick={() => setIsAdding(true)}
            >
              <Plus size={16} className="mr-1" /> Add Item
            </button>
          </div>
        </div>
        

        
        {/* CSV Import Feedback */}
        {csvImportError && (
          <div className={`px-4 py-2 rounded mb-4 flex items-center ${csvImportError.startsWith('Successfully') ? 'bg-green-100 border border-green-400 text-green-700' : 'bg-red-100 border border-red-400 text-red-700'}`}>
            {csvImportError.startsWith('Successfully') ? (
              <CheckCircle size={16} className="mr-2 text-green-600" />
            ) : csvImportError.startsWith('Imported') ? (
              <AlertCircle size={16} className="mr-2 text-amber-500" />
            ) : (
              <AlertTriangle size={16} className="mr-2 text-red-600" />
            )}
            <span>{csvImportError}</span>
            <button 
              className="ml-auto" 
              onClick={() => setCsvImportError(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
      
      <div className="card-content">
        {isAdding && (
          <form onSubmit={handleSubmit(onSubmit)} className="mb-6 bg-card rounded-md p-5 shadow-md border border-border/30">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="md:col-span-3">
                <label className="block text-sm font-medium mb-2 flex items-center gap-1.5">
                  <Package size={16} className="text-accent" />
                  Cargo Name
                </label>
                <input
                  type="text"
                  {...register('name', { required: 'Name is required' })}
                  className="input focus:ring-2 focus:ring-accent/30 transition-all duration-200 w-full"
                  placeholder="Box A"
                />
                {errors.name && (
                  <p className="text-destructive text-xs mt-1.5 flex items-center gap-1">
                    <X size={12} />
                    {errors.name.message}
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent"><path d="M3 3v18h18"/><path d="m22 3-7.5 7.5-4-4L3 15"/></svg>
                  Length
                </label>
                <div className="relative">
                  <input
                    type="number"
                    {...register('length', { 
                      required: 'Required',
                      min: { value: 1, message: 'Min 1' },
                      max: { value: 1200, message: 'Max 1200' }
                    })}
                    className="input focus:ring-2 focus:ring-accent/30 transition-all duration-200 pr-8 w-full"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-accent">cm</span>
                </div>
                {errors.length && (
                  <p className="text-destructive text-xs mt-1.5 flex items-center gap-1">
                    <X size={12} />
                    {errors.length.message}
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent"><path d="M21 6H3"/><path d="M10 12H3"/><path d="M10 18H3"/><path d="M23 6a2 2 0 0 0-2-2"/><path d="M19 6v12c0 1.1.9 2 2 2s2-.9 2-2"/></svg>
                  Width
                </label>
                <div className="relative">
                  <input
                    type="number"
                    {...register('width', { 
                      required: 'Required',
                      min: { value: 1, message: 'Min 1' },
                      max: { value: 235, message: 'Max 235' }
                    })}
                    className="input focus:ring-2 focus:ring-accent/30 transition-all duration-200 pr-8 w-full"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-accent">cm</span>
                </div>
                {errors.width && (
                  <p className="text-destructive text-xs mt-1.5 flex items-center gap-1">
                    <X size={12} />
                    {errors.width.message}
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent"><path d="M12 22 9-9"/><path d="M10.5 5.5 8 3H5v3l2.5 2.5"/><path d="M7 10.5 4.5 13 3 11.5l2.5-2.5"/><path d="M14 7.5 16.5 5l1.5 1.5-2.5 2.5"/><path d="M10.5 14.5 8 17l-1.5-1.5 2.5-2.5"/><path d="M17 16.5 14.5 19 13 17.5l2.5-2.5"/><path d="M21 8.5 18.5 11 17 9.5l2.5-2.5"/></svg>
                  Height
                </label>
                <div className="relative">
                  <input
                    type="number"
                    {...register('height', { 
                      required: 'Required',
                      min: { value: 1, message: 'Min 1' },
                      max: { value: 269, message: 'Max 269' }
                    })}
                    className="input focus:ring-2 focus:ring-accent/30 transition-all duration-200 pr-8 w-full"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-accent">cm</span>
                </div>
                {errors.height && (
                  <p className="text-destructive text-xs mt-1.5 flex items-center gap-1">
                    <X size={12} />
                    {errors.height.message}
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent"><circle cx="12" cy="12" r="8"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/></svg>
                  Weight
                </label>
                <div className="relative">
                  <input
                    type="number"
                    {...register('weight', { 
                      required: 'Required',
                      min: { value: 0.1, message: 'Min 0.1' }
                    })}
                    className="input focus:ring-2 focus:ring-accent/30 transition-all duration-200 pr-8 w-full"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-accent">kg</span>
                </div>
                {errors.weight && (
                  <p className="text-destructive text-xs mt-1.5 flex items-center gap-1">
                    <X size={12} />
                    {errors.weight.message}
                  </p>
                )}
              </div>
              
              <div className="md:col-span-3">
                <label className="block text-sm font-medium mb-2 flex items-center gap-1.5">
                  <Palette size={16} className="text-accent" />
                  Color
                </label>
                <div className="relative">
                  <Controller
                    name="color"
                    control={control}
                    render={({ field }) => (
                      <div className="flex flex-col gap-2">
                        <div 
                          className="input h-10 flex items-center gap-2 cursor-pointer focus:ring-2 focus:ring-accent/30 transition-all duration-200 w-full"
                          onClick={() => setShowColorPicker(!showColorPicker)}
                        >
                          <div 
                            className="w-6 h-6 rounded-full border border-border shadow-sm"
                            style={{ backgroundColor: field.value }}
                          />
                          <span className="text-sm flex-1">{field.value}</span>
                          <button 
                            type="button" 
                            className="p-1.5 hover:bg-muted rounded-md"
                            onClick={(e) => {
                              e.stopPropagation();
                              getRandomColor();
                            }}
                            title="Random color"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>
                          </button>
                          <ChevronDown size={16} className="text-muted-foreground" />
                        </div>
                        
                        {/* Color picker dropdown */}
                        {showColorPicker && (
                          <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-md shadow-lg p-4 animate-in fade-in-50 zoom-in-95">
                            <div className="mb-4">
                              <p className="text-sm font-medium mb-2">Predefined Colors</p>
                              <div className="grid grid-cols-8 gap-2">
                                {PREDEFINED_COLORS.map((color) => (
                                  <button
                                    key={color}
                                    type="button"
                                    className={`w-8 h-8 rounded-full border ${color === field.value ? 'ring-2 ring-accent' : 'hover:ring-1 hover:ring-accent/50'} transition-all`}
                                    style={{ backgroundColor: color }}
                                    onClick={() => handleColorSelect(color)}
                                    title={color}
                                  />
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-sm font-medium mb-2">Custom Color</p>
                              <div className="flex gap-2">
                                <input
                                  type="color"
                                  value={field.value}
                                  onChange={(e) => {
                                    field.onChange(e.target.value);
                                    setSelectedColor(e.target.value);
                                  }}
                                  className="w-10 h-10 p-0 border rounded cursor-pointer"
                                />
                                <input
                                  type="text"
                                  value={field.value}
                                  onChange={(e) => {
                                    field.onChange(e.target.value);
                                    setSelectedColor(e.target.value);
                                  }}
                                  className="input text-sm flex-1"
                                  placeholder="#RRGGBB"
                                />
                              </div>
                            </div>

                          </div>
                        )}
                      </div>
                    )}
                  />
                </div>
                {errors.color && (
                  <p className="text-destructive text-xs mt-1.5 flex items-center gap-1">
                    <X size={12} />
                    {errors.color.message}
                  </p>
                )}
              </div>
              
              <div className="md:col-span-3">
                <label className="block text-sm font-medium mb-2 flex items-center gap-1.5">
                  <Hash size={16} className="text-accent" />
                  Quantity
                </label>
                <div className="relative">
                  <Controller
                    name="quantity"
                    control={control}
                    rules={{ 
                      required: 'Required',
                      min: { value: 1, message: 'Min 1' },
                      max: { value: 100, message: 'Max 100' }
                    }}
                    render={({ field }) => (
                      <div className="flex">
                        <button 
                          type="button"
                          className="px-4 py-2 bg-muted border border-r-0 border-border rounded-l-md hover:bg-accent/20 transition-colors text-lg font-medium"
                          onClick={() => field.onChange(String(Math.max(1, parseInt(String(field.value)) - 1)))}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          {...field}
                          className="input rounded-none text-center focus:ring-2 focus:ring-accent/30 transition-all duration-200 text-lg font-medium h-10 w-20"
                          min={1}
                          max={100}
                        />
                        <button 
                          type="button"
                          className="px-4 py-2 bg-muted border border-l-0 border-border rounded-r-md hover:bg-accent/20 transition-colors text-lg font-medium"
                          onClick={() => field.onChange(String(Math.min(100, parseInt(String(field.value)) + 1)))}
                        >
                          +
                        </button>
                      </div>
                    )}
                  />
                </div>
                {errors.quantity && (
                  <p className="text-destructive text-xs mt-1.5 flex items-center gap-1">
                    <X size={12} />
                    {errors.quantity.message}
                  </p>
                )}
              </div>
              
              {/* Item Properties - Moved outside of color picker */}
              <div className="md:col-span-3 border border-border rounded-md p-4">
                <div className="text-sm font-medium mb-3 flex items-center">
                  <Package size={16} className="mr-2 text-accent" />
                  Item Properties
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Is Fragile checkbox */}
                  <div className="flex items-center p-2 bg-muted/50 rounded-md border border-border hover:bg-muted transition-colors">
                    <input
                      type="checkbox"
                      id="isFragile"
                      {...register('isFragile')}
                      className="mr-2 h-4 w-4"
                    />
                    <label htmlFor="isFragile" className="text-sm flex items-center cursor-pointer">
                      <AlertTriangle size={16} className="inline mr-1 text-amber-500" /> 
                      Is Fragile (cannot have items on top)
                    </label>
                  </div>
                  
                  {/* Is Rotatable checkbox */}
                  <div className="flex items-center p-2 bg-muted/50 rounded-md border border-border hover:bg-muted transition-colors">
                    <input
                      type="checkbox"
                      id="isRotatable"
                      {...register('isRotatable')}
                      className="mr-2 h-4 w-4"
                      defaultChecked={true}
                    />
                    <label htmlFor="isRotatable" className="text-sm flex items-center cursor-pointer">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline mr-1 text-blue-500">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/>
                      </svg>
                      Is Rotatable (can be placed in any orientation)
                    </label>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-8">
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setShowColorPicker(false);
                }}
                className="btn btn-outline hover:bg-muted transition-colors duration-200 px-6 py-2.5"
              >
                <X size={18} className="mr-2" />
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-accent shadow-md hover:shadow-lg hover:bg-accent/90 transition-all duration-200 px-6 py-2.5"
              >
                <Plus size={18} className="mr-2" />
                Add Item
              </button>
            </div>
          </form>
        )}

        {cargoItems.length > 0 ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Cargo Name
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Dimensions (L×W×H)
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Weight
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Color
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cargoItems.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-1">
                        {item.name}
                        {item.constraints?.some(c => c.type === ConstraintType.FRAGILE) && (
                          <span title="Fragile" className="text-amber-500">
                            <AlertTriangle size={14} />
                          </span>
                        )}
                        {item.constraints?.some(c => c.type === ConstraintType.MUST_BE_UPRIGHT) && (
                          <span title="Non-Rotatable" className="text-blue-500">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 22 9-9"/><path d="M10.5 5.5 8 3H5v3l2.5 2.5"/>
                            </svg>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                      {item.length} × {item.width} × {item.height} cm
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                      {item.weight} kg
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                      <div className="flex items-center">
                        <div 
                          className="w-4 h-4 rounded-full mr-2 border border-border shadow-sm"
                          style={{ backgroundColor: item.color }}
                        />
                        <span>{item.color}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onRemoveItem(item.id)}
                          className="p-1.5 rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Remove item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16 bg-muted rounded-md border border-dashed border-border">
            <PackagePlus size={48} className="mx-auto text-accent/50 mb-4" />
            <p className="font-medium text-lg">No cargo items added yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-6">Add cargo items to start optimizing your container load</p>
            <button
              onClick={() => setIsAdding(true)}
              className="btn btn-accent shadow-md hover:shadow-lg hover:bg-accent/90 transition-all duration-200"
            >
              <Plus size={16} className="mr-1.5" />
              Add First Cargo Item
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CargoInput;