import { CargoItem, ConstraintType, ItemConstraint } from '../types';

interface CsvImportResult {
  items: CargoItem[];
  importedCount: number;
  skippedCount: number;
  error?: string;
}

/**
 * Parse a CSV file and convert it to cargo items
 */
export const parseCsvToCargoItems = (csvContent: string): CsvImportResult => {
  try {
    // Handle different line endings
    const lines = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    
    // Debug log
    console.log('CSV lines:', lines);
    
    // Check if file is empty
    if (lines.length <= 1 || (lines.length === 1 && lines[0].trim() === '')) {
      return { 
        items: [], 
        importedCount: 0, 
        skippedCount: 0,
        error: 'CSV file is empty' 
      };
    }
    
    // Parse header row
    const header = lines[0].split(',');
    const requiredColumns = ['name', 'length', 'width', 'height', 'weight'];
    const headerLower = header.map(h => h.toLowerCase().trim());
    
    // Validate that required columns exist
    const missingColumns = requiredColumns.filter(col => !headerLower.includes(col));
    if (missingColumns.length > 0) {
      return { 
        items: [], 
        importedCount: 0, 
        skippedCount: 0,
        error: `Missing required columns: ${missingColumns.join(', ')}` 
      };
    }
    
    // Get column indices
    const nameIndex = headerLower.indexOf('name');
    const lengthIndex = headerLower.indexOf('length');
    const widthIndex = headerLower.indexOf('width');
    const heightIndex = headerLower.indexOf('height');
    const weightIndex = headerLower.indexOf('weight');
    const colorIndex = headerLower.indexOf('color');
    const quantityIndex = headerLower.indexOf('quantity');
    const fragileIndex = headerLower.indexOf('fragile');
    const rotatableIndex = headerLower.indexOf('rotatable');
    
    const items: CargoItem[] = [];
    let skippedCount = 0;
    const timestamp = Date.now();
    
    // Process data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines
      
      const values = line.split(',').map(val => val.trim());
      
      // Basic validation
      if (values.length < 5) {
        skippedCount++;
        continue;
      }
      
      // Parse values
      const name = values[nameIndex] || '';
      const length = parseFloat(values[lengthIndex] || '0');
      const width = parseFloat(values[widthIndex] || '0');
      const height = parseFloat(values[heightIndex] || '0');
      const weight = parseFloat(values[weightIndex] || '0');
      
      // Skip invalid entries
      if (!name || isNaN(length) || isNaN(width) || isNaN(height) || isNaN(weight) ||
          length <= 0 || width <= 0 || height <= 0 || weight <= 0) {
        skippedCount++;
        continue;
      }
      
      // Optional values
      const color = colorIndex >= 0 && values[colorIndex] 
        ? values[colorIndex] 
        : `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`;
      
      const quantity = quantityIndex >= 0 && values[quantityIndex] 
        ? parseInt(values[quantityIndex]) 
        : 1;
      
      // Constraints
      const constraints: ItemConstraint[] = [];
      
      if (fragileIndex >= 0 && values[fragileIndex]?.toLowerCase() === 'true') {
        constraints.push({
          type: ConstraintType.FRAGILE
        });
      }
      
      if (rotatableIndex >= 0 && values[rotatableIndex]?.toLowerCase() === 'false') {
        constraints.push({
          type: ConstraintType.MUST_BE_UPRIGHT
        });
      }
      
      // Create item
      const item: CargoItem = {
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
      
      console.log('Created item from CSV:', item);
      items.push(item);
    }
    
    return {
      items,
      importedCount: items.length,
      skippedCount
    };
  } catch (error) {
    console.error('Error parsing CSV:', error);
    return {
      items: [],
      importedCount: 0,
      skippedCount: 0,
      error: 'Error parsing CSV file. Please check the format.'
    };
  }
};
